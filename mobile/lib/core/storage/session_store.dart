import 'dart:convert';
import 'dart:math';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../models/player.dart';

// ══════════════════════════════════════════════════════
// 🔐 الجلسة — الرمز وبيانات اللاعب ومعرّف الجهاز
// ══════════════════════════════════════════════════════
// الرمز في التخزين المُعمَّى (Keystore على أندرويد، Keychain على iOS) لا
// في shared_preferences: الأخير ملفّ عاديّ يُقرأ على جهاز مكسور الحماية.
// بيانات اللاعب نفسها ليست سرّاً — لكنها تسكن معه لأن فصلهما يسمح
// بحالةٍ ثالثة: رمزٌ بلا لاعب أو لاعبٌ بلا رمز.

class SessionStore {
  SessionStore._();
  static final SessionStore instance = SessionStore._();

  static const _kToken = 'mafia_player_token';
  static const _kPlayer = 'mafia_player_data';
  static const _kDeviceId = 'mafia_device_id';

  final _secure = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  String? _token;
  PlayerData? _player;

  String? get token => _token;
  PlayerData? get player => _player;
  bool get isLoggedIn => _token != null && _token!.isNotEmpty;

  /// يُستدعى مرّة عند الإقلاع، **قبل** إنشاء السوكِت.
  ///
  /// ⚠️ الترتيب ليس تفصيلاً: السوكِت يقرأ الرمز عند المصافحة وحدها،
  /// وينضمّ إلى غرفة `player:{id}` بناءً عليه. فسوكِتٌ اتّصل قبل قراءة
  /// الجلسة لا يدخل الغرفة أبداً، ولا تصله أحداثها، ولا يُصلحه إعادة
  /// جلب لاحق. (نفس المصيدة الموثّقة في 34-cosmetics-render.md §6.1.)
  Future<void> load() async {
    try {
      _token = await _secure.read(key: _kToken);
      final raw = await _secure.read(key: _kPlayer);
      if (raw != null && raw.isNotEmpty) {
        _player = PlayerData.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      }
    } catch (e) {
      // قراءة فاشلة من Keystore (نسخ احتياطي مستعاد، أو مفتاح تالف)
      // تُعامَل كخروج لا كعطل — الأسوأ أن يُطلب منه الدخول مجدّداً.
      debugPrint('⚠️ تعذّرت قراءة الجلسة: $e');
      _token = null;
      _player = null;
    }
  }

  Future<void> save({required String token, required PlayerData player}) async {
    _token = token;
    _player = player;
    await _secure.write(key: _kToken, value: token);
    await _secure.write(key: _kPlayer, value: jsonEncode(player.toJson()));
  }

  /// تحديث بيانات اللاعب وحدها (بعد `/me`) بلا مساس بالرمز.
  Future<void> updatePlayer(PlayerData player) async {
    _player = player;
    await _secure.write(key: _kPlayer, value: jsonEncode(player.toJson()));
  }

  Future<void> clear() async {
    _token = null;
    _player = null;
    await _secure.delete(key: _kToken);
    await _secure.delete(key: _kPlayer);
    // معرّف الجهاز **لا يُمسح**: هو هويّة الجهاز لا هويّة الحساب، وبه
    // يُزال توكن الإشعارات القديم عند دخول حساب آخر على نفس الهاتف.
  }

  // ══════════════════════════════════════════════════════
  // معرّف الجهاز
  // ══════════════════════════════════════════════════════
  // ثابت عبر عمليات الدخول والخروج، ويُرسل مع توكن الإشعارات ليعرف
  // الخادم أن هذا الجهاز بعينه انتقل إلى حساب آخر فيزيل ارتباطه السابق
  // بدل أن يتراكم توكن لكل تسجيل دخول.
  String? _deviceId;

  Future<String> deviceId() async {
    if (_deviceId != null) return _deviceId!;
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString(_kDeviceId);
    if (id == null || id.isEmpty) {
      id = await _mintDeviceId();
      await prefs.setString(_kDeviceId, id);
    }
    _deviceId = id;
    return id;
  }

  Future<String> _mintDeviceId() async {
    try {
      final info = DeviceInfoPlugin();
      if (defaultTargetPlatform == TargetPlatform.android) {
        final a = await info.androidInfo;
        // ANDROID_ID يتغيّر عند إعادة ضبط المصنع وبين التطبيقات — وهذا
        // ما نريده: معرّف يخصّ تثبيتنا على هذا الجهاز، لا بصمة تتبُّع.
        return 'and-${a.id}';
      }
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        final i = await info.iosInfo;
        return 'ios-${i.identifierForVendor ?? _random()}';
      }
    } catch (_) { /* يسقط إلى العشوائيّ */ }
    return _random();
  }

  String _random() {
    final r = Random.secure();
    return List.generate(16, (_) => r.nextInt(16).toRadixString(16)).join();
  }

  /// وصف الجهاز — يظهر للمالك في قائمة أجهزته المشتركة.
  Future<String> deviceLabel() async {
    try {
      final info = DeviceInfoPlugin();
      if (defaultTargetPlatform == TargetPlatform.android) {
        final a = await info.androidInfo;
        return '${a.manufacturer} ${a.model} (Android ${a.version.release})';
      }
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        final i = await info.iosInfo;
        return '${i.name} ${i.model} (iOS ${i.systemVersion})';
      }
    } catch (_) { /* تجاهل */ }
    return 'Mafia Club App';
  }
}
