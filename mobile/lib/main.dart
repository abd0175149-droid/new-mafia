import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/app.dart';
import 'app/config.dart';
import 'app/theme/theme.dart';
import 'core/api/api_client.dart';
import 'core/api/auth_repository.dart';
import 'core/push/push_service.dart';
import 'core/socket/socket_service.dart';
import 'core/storage/session_store.dart';
import 'core/ui/glass_tier.dart';

// ══════════════════════════════════════════════════════
// 🚀 الإقلاع المشترك — §6.1
// ══════════════════════════════════════════════════════
// نقطتا الدخول (main_dev / main_prod) تستدعيان هذه بإعدادٍ ثابت.

Future<void> bootstrap(AppConfig config) async {
  WidgetsFlutterBinding.ensureInitialized();

  // ── الاتجاه وشريط النظام ──
  // portrait مقفول على كل الأجهزة: التكيّف بالعرض المنطقيّ لا بالدوران.
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);
  SystemChrome.setSystemUIOverlayStyle(noirSystemUi);

  // ── التخزين المحليّ ──
  await Hive.initFlutter();

  // ── درجة المادّة الزجاجيّة (95 §3) ──
  // تُحسم قبل runApp كي لا يومض الشريط من مادّةٍ إلى أخرى بعد أوّل إطار.
  // الكشف محليّ رخيص (تفضيل محفوظ + device_info) — لا شبكة فيه.
  await GlassQuality.init();

  // تقويم ar_JO — بلا تهيئة يرمي DateFormat على لغة غير الإنجليزية
  await initializeDateFormatting('ar_JO');

  // ── تقادُم الكاش عند تغيّر الإصدار (§6.4، المرحلة الأولى) ──
  // لا service worker في Flutter، فمكافئ «مسح الكاش عند إصدار جديد» يقع
  // هنا. **الجلسة والنوتة لا تُمسّان** — مسحهما يعني إخراج اللاعب من
  // حسابه عند كل تحديث، وضياع ملاحظاته وسط لعبة.
  await _clearStaleCachesOnUpgrade();

  // ══════════════════════════════════════════════════════
  // 🔴 الترتيب هنا ليس تفصيلاً
  // ══════════════════════════════════════════════════════
  // ① الجلسة تُقرأ أوّلاً — كل ما بعدها يحتاج الرمز.
  // ② العميل يُهيَّأ ثانياً — يقرأ الرمز من الجلسة عند كل نداء.
  // ③ السوكِت آخراً — يقرأ الرمز **عند المصافحة وحدها** وينضمّ إلى
  //    غرفة `player:{id}` بناءً عليه. سوكِتٌ اتّصل قبل قراءة الجلسة لا
  //    يدخل الغرفة أبداً، ولا يصله حدث، ولا يُصلحه جلب لاحق.
  await SessionStore.instance.load();
  ApiClient.instance.init(config);
  SocketService.instance.connect(config);

  // الإشعارات تُهيَّأ بلا طلب إذن — الإذن يُطلب بعد الدخول (انظر
  // PushService). طلبه عند أوّل إقلاع يُرفض غالباً، ورفض أندرويد ١٣
  // نهائيّ لا يُعاد طلبه.
  unawaited(PushService.instance.init());

  // رمز محفوظ قد يكون انتهى — نتحقّق في الخلفية بلا تعطيل الإقلاع
  unawaited(AuthRepository.instance.refresh());

  runApp(ProviderScope(child: MafiaApp(config: config)));
}

Future<void> _clearStaleCachesOnUpgrade() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final info = await PackageInfo.fromPlatform();
    final current = '${info.version}+${info.buildNumber}';
    const key = 'mafia_app_version';

    if (prefs.getString(key) != current) {
      // صناديق قابلة للتقادم فقط — يُضاف اسم كل صندوق جديد هنا عند إنشائه
      for (final box in const ['sounds_cache', 'images_cache']) {
        if (await Hive.boxExists(box)) await Hive.deleteBoxFromDisk(box);
      }
      await prefs.setString(key, current);
      debugPrint('🧹 كاش قديم مُسح — الإصدار الآن $current');
    }
  } catch (e) {
    // فشل التنظيف لا يمنع الإقلاع — أسوأ نتيجة كاشٌ قديم لا شاشة سوداء
    debugPrint('⚠️ تعذّر فحص تقادُم الكاش: $e');
  }
}
