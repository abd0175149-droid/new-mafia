import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/core/ui/glass_tier.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ══════════════════════════════════════════════════════
// 🪜 سلّم المادّة — قواعد الحسم (95 §3)
// ══════════════════════════════════════════════════════
// المهمّ هنا **السياسة** لا الكشف: iOS كامل الدرجة دائماً؛ أندرويد يقف
// عند «ب» تلقائياً (قرار ق3 — لا انكسار قبل قياس جهازٍ حقيقيّ) ولا يصل
// «أ» إلا بيد المستخدم؛ و«خفيفة» تُطاع فوراً لأنها مخرجُ الجهاز الضعيف.
// (في بيئة الاختبار device_info غائبة فيسقط الكشف إلى «جهاز حديث» —
// وهذا نفسه سلوكٌ مقصود يُثبَّت هنا: تعذُّر الكشف لا يعني أسوأ درجة.)

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    GlassQuality.overrideForTest(null);
  });

  test('أندرويد تلقائياً = الدرجة «ب» — لا ترقية لأ بلا يد المستخدم', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    await GlassQuality.init();
    expect(GlassQuality.tier, GlassTier.mid);
  });

  test('«خفيفة» تُطاع فوراً وتُحفظ، و«فاخرة» ترفع إلى الكاملة', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    await GlassQuality.init();

    await GlassQuality.setPreference(GlassPreference.light);
    expect(GlassQuality.tier, GlassTier.lite);

    await GlassQuality.setPreference(GlassPreference.fancy);
    expect(GlassQuality.tier, GlassTier.full);

    // التفضيل يعود من التخزين في الإقلاع التالي
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('glass_quality'), 'fancy');
  });

  test('التفضيل المحفوظ يُقرأ عند init', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    SharedPreferences.setMockInitialValues({'glass_quality': 'light'});
    await GlassQuality.init();
    expect(GlassQuality.tier, GlassTier.lite);
    expect(GlassQuality.preference, GlassPreference.light);
  });

  test('iOS كامل الدرجة دائماً — التفضيل لا يخفضه', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    await GlassQuality.init();
    expect(GlassQuality.tier, GlassTier.full);

    // حتى «خفيفة» لا تنزل iOS عن مادّته — سلّمه الداخليّ يُدار في مكانه
    await GlassQuality.setPreference(GlassPreference.light);
    expect(GlassQuality.tier, GlassTier.full);
  });

  test('تغيير التفضيل يبلّغ المستمعين (الغلاف يعيد البناء)', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    await GlassQuality.init();

    var fired = 0;
    void listener() => fired++;
    GlassQuality.notifier.addListener(listener);
    await GlassQuality.setPreference(GlassPreference.light);
    GlassQuality.notifier.removeListener(listener);

    expect(fired, greaterThan(0));
  });
}
