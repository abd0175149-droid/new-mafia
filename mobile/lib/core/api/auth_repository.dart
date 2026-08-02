import 'package:flutter/foundation.dart';

import '../../models/player.dart';
import '../storage/session_store.dart';
import 'api_client.dart';

// ══════════════════════════════════════════════════════
// 🔑 الدخول والجلسة
// ══════════════════════════════════════════════════════

class AuthRepository {
  AuthRepository._();
  static final AuthRepository instance = AuthRepository._();

  final _api = ApiClient.instance;
  final _session = SessionStore.instance;

  /// دخول برقم الهاتف وكلمة السرّ.
  ///
  /// الخادم يقيّد المحاولات (١٠ لكل رقم في ربع ساعة)، ورسالته العربية
  /// تصل كما هي عبر ApiException.
  Future<PlayerData> login({required String phone, required String password}) async {
    final res = await _api.post('/api/player-auth/login', body: {
      'phone': phone.trim(),
      'password': password,
    });

    final map = res is Map ? res : const {};
    final token = map['token'];
    final playerJson = map['player'];

    if (token is! String || token.isEmpty || playerJson is! Map) {
      // استجابة ٢٠٠ بشكل غير متوقّع — لا نخزّن جلسة نصفها ناقص
      throw ApiException('استجابة غير متوقّعة من الخادم');
    }

    final player = PlayerData.fromJson(Map<String, dynamic>.from(playerJson));
    await _session.save(token: token, player: player);
    debugPrint('🔐 دخل ${player.name} (#${player.id})');

    // استجابة الدخول ملخّصة؛ و`/me` تضيف الجنس والصورة وتاريخ الميلاد
    // ووجوب تغيير كلمة السرّ — وتتحقّق من الرمز في الوقت نفسه.
    //
    // 📌 ولا يحمل أيٌّ منهما الرتبة ولا الـRR ولا المستوى: تلك ليست جزءاً
    //    من عقد المصادقة أصلاً، بل تُقرأ من طبقة الملفّ الشخصيّ (الملفّان
    //    13 و15 في M3). لا تُضِف هنا نداءً لجلبها — طبقةٌ تعرف عن
    //    طبقةٍ أخرى أكثر ممّا يلزمها هي بداية التشابك.
    return await refresh() ?? player;
  }

  /// تحديث بيانات اللاعب من الخادم.
  ///
  /// يُستدعى عند الإقلاع بجلسة محفوظة: الرمز قد يكون انتهى أو أُبطل،
  /// ولا نريد أن يكتشف اللاعب ذلك عند أوّل فعل يفشل. رمز مرفوض ⇒ خروج.
  Future<PlayerData?> refresh() async {
    if (!_session.isLoggedIn) return null;
    try {
      final res = await _api.get('/api/player-auth/me');
      final map = res is Map ? res : const {};
      final p = map['player'] ?? map['data'] ?? map;
      if (p is Map && p['id'] != null) {
        final player = PlayerData.fromJson(Map<String, dynamic>.from(p));
        await _session.updatePlayer(player);
        return player;
      }
      return _session.player;
    } on ApiException catch (e) {
      if (e.isUnauthorized) {
        debugPrint('🚪 الرمز لم يعد صالحاً — خروج');
        await logout();
        return null;
      }
      // انقطاع شبكة: نُبقي الجلسة المحفوظة ونعمل بها
      debugPrint('⚠️ تعذّر تحديث الجلسة: ${e.message}');
      return _session.player;
    }
  }

  Future<void> logout() async => _session.clear();
}
