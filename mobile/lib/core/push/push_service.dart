import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../storage/session_store.dart';

// ══════════════════════════════════════════════════════
// 🔔 الإشعارات
// ══════════════════════════════════════════════════════
// السبب الأول لبناء تطبيق أصليّ: إشعارات الـPWA على iOS كانت تتطلّب
// تثبيت التطبيق وبوابة حجب وحيلة في service worker، وتسقط باستمرار.

/// معالج الخلفية — **يجب أن يكون دالّة عليا** (top-level) وموسوماً
/// بـ@pragma، وإلا حذفه tree-shaking في نسخة release ووصل الإشعار
/// بلا معالجة وأنت لا تعرف لماذا.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint('🔔 إشعار في الخلفية: ${message.messageId}');
}

/// حالة الإذن كما تحتاجها بوابة الإشعارات.
///
/// `unsupported` تقع على أندرويد بلا خدمات Google حين تفشل تهيئة FCM
/// نهائياً — لا تقع على iOS أبداً (APNs مدمج).
enum PushPermission { granted, prompt, denied, unsupported }

class PushService {
  PushService._();
  static final PushService instance = PushService._();

  // ⚠️ كسول عمداً — لا `final _fcm = FirebaseMessaging.instance`.
  //    حقل نهائيّ يُقيَّم لحظة إنشاء الوحدة المفردة، أي عند أوّل لمسة
  //    لـ`PushService.instance` في bootstrap — وهي تسبق
  //    `Firebase.initializeApp()`، فترمي [core/no-app] ويسقط الإقلاع
  //    قبل أن يبدأ التطبيق. الجالب يؤجّل الحلّ إلى ما بعد التهيئة.
  FirebaseMessaging get _fcm => FirebaseMessaging.instance;
  final _local = FlutterLocalNotificationsPlugin();

  /// آخر مسار طُلب فتحه من إشعار — تستهلكه طبقة التوجيه.
  final ValueNotifier<String?> pendingRoute = ValueNotifier<String?>(null);

  String? _token;
  String? get token => _token;
  bool _ready = false;

  /// قناة أندرويد — تُنشأ مرّة. بلا قناة لا يظهر إشعار على API 26+
  /// إطلاقاً، ويُبتلع بصمت.
  static const _channel = AndroidNotificationChannel(
    'mafia_default',
    'إشعارات نادي المافيا',
    description: 'الحجوزات والألعاب والتنبيهات',
    importance: Importance.high,
  );

  Future<void> init() async {
    if (_ready) return;
    try {
      await Firebase.initializeApp();

      await _local.initialize(
        const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(
            requestAlertPermission: false, // نطلبها بأنفسنا أدناه
            requestBadgePermission: false,
            requestSoundPermission: false,
          ),
        ),
        onDidReceiveNotificationResponse: (r) => _routeFromPayload(r.payload),
      );

      await _local
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(_channel);

      FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);

      // إشعار وصل والتطبيق مفتوح: أندرويد لا يعرضه تلقائياً، فنعرضه محلياً.
      FirebaseMessaging.onMessage.listen(_showForeground);

      // نقرة على إشعار والتطبيق في الخلفية
      FirebaseMessaging.onMessageOpenedApp.listen((m) => _routeFromData(m.data));

      // نقرة أقلعت التطبيق من الصفر — تُقرأ مرّة
      final initial = await _fcm.getInitialMessage();
      if (initial != null) _routeFromData(initial.data);

      _ready = true;
    } catch (e) {
      // بلا إشعارات يبقى التطبيق صالحاً للاستعمال بالكامل
      debugPrint('⚠️ تعذّرت تهيئة الإشعارات: $e');
    }
  }

  static const _kAsked = 'push_permission_asked';

  /// حالة الإذن الآن — تُقرأ من النظام لا من علم محليّ، فالمستخدم قد
  /// يغيّرها من الإعدادات ونحن في الخلفية.
  ///
  /// 🔴 على أندرويد لا يوجد «لم يُسأل بعد»: قبل الطلب وبعد الرفض كلاهما
  ///    `denied`. فالاعتماد على النظام وحده يعرض شاشة «الإشعارات محظورة
  ///    بالخطأ» لمن لم يُسأل قطّ — رأيتها كذلك على الجهاز، وهي تتّهم
  ///    المستخدم بفعل لم يفعله وتطلب منه إصلاحاً في الإعدادات بلا سبب.
  ///
  ///    فنحفظ بأنفسنا أننا سألنا. لم نسأل ⇒ prompt مهما قال النظام.
  ///    (iOS يميّز notDetermined فعلاً، والعلم لا يضرّه.)
  Future<PushPermission> permission() async {
    if (!_ready) await init();
    if (!_ready) return PushPermission.unsupported; // فشلت التهيئة نهائياً
    try {
      final s = await _fcm.getNotificationSettings();
      switch (s.authorizationStatus) {
        case AuthorizationStatus.authorized:
        case AuthorizationStatus.provisional:
          return PushPermission.granted;
        case AuthorizationStatus.denied:
          final prefs = await SharedPreferences.getInstance();
          return prefs.getBool(_kAsked) == true
              ? PushPermission.denied
              : PushPermission.prompt;
        default:
          return PushPermission.prompt;
      }
    } catch (_) {
      return PushPermission.unsupported;
    }
  }

  /// يفتح إعدادات إشعارات التطبيق في النظام — لمن رفض الإذن نهائياً.
  Future<void> openSystemSettings() async {
    try {
      await _local
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();
    } catch (e) {
      debugPrint('⚠️ تعذّر فتح الإعدادات: $e');
    }
  }

  /// يُطلب الإذن **بعد** الدخول لا عند أوّل إقلاع: طلبٌ قبل أن يفهم
  /// اللاعب لماذا يُرفض غالباً، ورفضُ أندرويد ١٣ نهائيّ لا يُعاد طلبه.
  Future<bool> requestPermissionAndRegister() async {
    if (!_ready) await init();
    try {
      // يُوسم أوّلاً: الرفض يجب أن يُسجَّل كما يُسجَّل القبول، وإلا بقيت
      // البوابة تعرض «اطلب الإذن» إلى الأبد لمن رفض.
      (await SharedPreferences.getInstance()).setBool(_kAsked, true);
      final s = await _fcm.requestPermission(alert: true, badge: true, sound: true);
      final granted = s.authorizationStatus == AuthorizationStatus.authorized ||
          s.authorizationStatus == AuthorizationStatus.provisional;
      if (!granted) {
        debugPrint('🔕 رُفض إذن الإشعارات');
        return false;
      }
      await registerToken();
      // التوكن يُدوَّر من جوجل من حين لآخر — بلا هذا يتوقّف الوصول صامتاً
      _fcm.onTokenRefresh.listen((t) { _token = t; _sendToken(t); });
      return true;
    } catch (e) {
      debugPrint('⚠️ إذن الإشعارات: $e');
      return false;
    }
  }

  Future<void> registerToken() async {
    try {
      final t = await _fcm.getToken();
      if (t == null || t.isEmpty) return;
      _token = t;
      await _sendToken(t);
    } catch (e) {
      debugPrint('⚠️ تعذّر جلب توكن الإشعارات: $e');
    }
  }

  Future<void> _sendToken(String token) async {
    if (!SessionStore.instance.isLoggedIn) return;
    try {
      await ApiClient.instance.post('/api/player-notifications/register-token', body: {
        'token': token,
        'deviceInfo': await SessionStore.instance.deviceLabel(),
        'deviceId': await SessionStore.instance.deviceId(),
        // 📱 المنصّة — العمود الذي أُضيف للخادم في 1 أغسطس. بدونه لا
        //    يمكن تمييز من انتقل إلى التطبيق عمّن بقي على الـPWA.
        'platform': defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
      });
      debugPrint('📱 سُجّل توكن الإشعارات (${token.substring(0, 12)}…)');
    } catch (e) {
      debugPrint('⚠️ تعذّر تسجيل التوكن: $e');
    }
  }

  Future<void> _showForeground(RemoteMessage m) async {
    final n = m.notification;
    if (n == null) return;
    await _local.show(
      m.hashCode,
      n.title,
      n.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id, _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
          // شارة أحادية اللون + لون التمييز — أيقونة ملوّنة تظهر مربّعاً
          // أبيض على أندرويد ٨ فأحدث.
          icon: '@mipmap/ic_launcher',
        ),
        iOS: const DarwinNotificationDetails(presentAlert: true, presentBadge: true, presentSound: true),
      ),
      payload: m.data['route'] as String? ?? m.data['url'] as String?,
    );
  }

  void _routeFromData(Map<String, dynamic> data) =>
      _routeFromPayload((data['route'] ?? data['url']) as String?);

  void _routeFromPayload(String? route) {
    if (route == null || route.isEmpty) return;
    debugPrint('🧭 إشعار يطلب: $route');
    pendingRoute.value = route;
  }

  /// يُستدعى عند الخروج — وإلا استمرّ إشعار الحساب السابق يصل الجهاز.
  Future<void> clear() async {
    try { await _fcm.deleteToken(); } catch (_) { /* تجاهل */ }
    _token = null;
  }
}
