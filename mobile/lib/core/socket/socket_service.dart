import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../app/config.dart';
import '../storage/session_store.dart';

// ══════════════════════════════════════════════════════
// 🔌 السوكِت — وحدة مفردة
// ══════════════════════════════════════════════════════
// EIO4 لمطابقة Socket.IO v4 في الخادم، ونفس حمولة المصافحة التي ترسلها
// الـPWA حرفياً.

class SocketService {
  SocketService._();
  static final SocketService instance = SocketService._();

  io.Socket? _socket;
  AppConfig? _config;

  final _connected = ValueNotifier<bool>(false);
  ValueNotifier<bool> get connected => _connected;

  /// آخر سبب انقطاع — يظهر في شاشة التشخيص.
  String? lastError;

  io.Socket? get raw => _socket;

  // ══════════════════════════════════════════════════════
  // 🔴 حمولة المصافحة
  // ══════════════════════════════════════════════════════
  // الخادم يجرّب `token` و`leaderToken` كمرشّحَي موظّف، ثم `playerToken`
  // للاعب. التطبيق عميل لاعب فقط، فيرسل الثالث وحده — وإرسال مفتاح فارغ
  // ليس ضاراً لكنه يغري بقراءة خاطئة.
  //
  // ⚠️ تُقرأ **عند كل اتصال وإعادة اتصال** لا مرّة واحدة: الرمز قد يتغيّر
  //    بين الاتصالين (دخول حساب آخر)، ومصافحةٌ برمز قديم تُبقي اللاعب
  //    خارج غرفته بلا رسالة خطأ.
  Map<String, dynamic> _auth() {
    final t = SessionStore.instance.token;
    return {'playerToken': t ?? ''};
  }

  void connect(AppConfig config) {
    _config = config;
    if (_socket != null) {
      // الرمز قد يكون تغيّر — أعد المصافحة بدل إنشاء ساكت ثانٍ
      reauth();
      return;
    }

    _socket = io.io(
      config.socketUrl,
      io.OptionBuilder()
          .setPath('/socket.io')
          .setTransports(['websocket', 'polling'])
          .enableReconnection()
          .setReconnectionAttempts(1 << 30)
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(5000)
          .setTimeout(20000)
          .setAuth(_auth())
          .build(),
    );

    _socket!
      ..onConnect((_) {
        _connected.value = true;
        lastError = null;
        debugPrint('🔌 السوكِت متّصل: ${_socket?.id}');
      })
      ..onDisconnect((r) {
        _connected.value = false;
        debugPrint('📴 انقطع السوكِت: $r');
      })
      ..onConnectError((e) {
        _connected.value = false;
        lastError = '$e';
        debugPrint('❌ تعذّر الاتصال: $e');
      })
      // socket_io_client لا يعيد تقييم auth تلقائياً قبل إعادة الاتصال،
      // فنكتبها بأنفسنا عند كل محاولة — وإلا حملت المحاولة رمزاً قديماً.
      ..onReconnectAttempt((_) => _writeAuth());

    _socket!.connect();
  }

  void _writeAuth() {
    final s = _socket;
    if (s == null) return;
    s.auth = _auth();
  }

  /// يُستدعى بعد الدخول أو الخروج: يعيد المصافحة برمزٍ حاضر.
  ///
  /// 🔴 الانضمام إلى غرفة `player:{id}` يقع **عند المصافحة وحدها**
  /// (backend/src/index.ts — io.use). فمن اتّصل بلا رمز ثم سجّل دخوله
  /// يبقى خارج غرفته إلى الأبد ولا يستقبل `chips:balance-updated` ولا
  /// `chips:cosmetics-updated` ولا أي إشعار غرفة — ولا يُصلحه أي جلب.
  void reauth() {
    final s = _socket;
    if (s == null) {
      if (_config != null) connect(_config!);
      return;
    }
    _writeAuth();
    s.disconnect();
    s.connect();
    debugPrint('🔄 أُعيدت مصافحة السوكِت');
  }

  void on(String event, void Function(dynamic) handler) => _socket?.on(event, handler);
  void off(String event, [void Function(dynamic)? handler]) => _socket?.off(event, handler);
  /// خطّافُ اختبارٍ يلتقط **كلّ** ما يخرج — `emit` و`ask` معاً. ترتيبُ
  /// الإرسال في إنذار الغشّ قاعدةٌ أمنية، و«لا يُرسَل شيءٌ عند انتهاء
  /// مهلة الليل» قاعدةٌ أخرى: كلتاهما لا تُتحقَّق إلّا برؤية ما خرج.
  @visibleForTesting
  static void Function(String event, dynamic data)? emitProbe;

  void emit(String event, [dynamic data]) {
    emitProbe?.call(event, data);
    _socket?.emit(event, data);
  }

  /// 🔴 نداءٌ بإشعارٍ راجع ومهلة **١٥ ثانية** — عقد الخادم في كل أحداث
  ///    اللعب: النجاح **فقط** عند `success == true`، والرفض يحمل `error`
  ///    و`code` و`requiresConfirmation`.
  ///
  /// بلا مهلةٍ يعلّق نداءٌ ضائع الشاشةَ إلى الأبد: السوكِت قد يكون متّصلاً
  /// شكلاً والخادم لا يردّ. تُعاد `null` عند المهلة أو انقطاع الاتصال —
  /// والمستدعي يفرّق بينها وبين رفضٍ صريح.
  Future<Map<String, dynamic>?> ask(
    String event, [
    Object? data,
    Duration timeout = const Duration(seconds: 15),
  ]) {
    emitProbe?.call(event, data);
    final s = _socket;
    if (s == null || !s.connected) return Future.value(null);

    final c = Completer<Map<String, dynamic>?>();
    Timer? t;

    void finish(Map<String, dynamic>? v) {
      if (c.isCompleted) return;
      t?.cancel();
      c.complete(v);
    }

    t = Timer(timeout, () => finish(null));
    try {
      s.emitWithAck(event, data, ack: (dynamic res) {
        finish(res is Map ? Map<String, dynamic>.from(res) : null);
      });
    } catch (_) {
      finish(null);
    }
    return c.future;
  }

  void dispose() {
    _socket?.dispose();
    _socket = null;
    _connected.value = false;
  }
}
