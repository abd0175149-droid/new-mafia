import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/app.dart';
import 'app/config.dart';
import 'app/theme/theme.dart';

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

  // ── تقادُم الكاش عند تغيّر الإصدار (§6.4، المرحلة الأولى) ──
  // لا service worker في Flutter، فمكافئ «مسح الكاش عند إصدار جديد» يقع
  // هنا. **الجلسة والنوتة لا تُمسّان** — مسحهما يعني إخراج اللاعب من
  // حسابه عند كل تحديث، وضياع ملاحظاته وسط لعبة.
  await _clearStaleCachesOnUpgrade();

  // 🔌 مقعد Firebase — يُملأ في M1 مع الملفّ 06.
  //    لا يُستدعى الآن: Firebase.initializeApp بلا google-services.json
  //    يرمي عند الإقلاع، ولا معنى لتسجيل تطبيق قبل وجود حساب متجر.

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
