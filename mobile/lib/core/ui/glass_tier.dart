import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ══════════════════════════════════════════════════════
// 🪜 سلّم المادّة الزجاجيّة — الملفّ ٩٥ §3
// ══════════════════════════════════════════════════════
// النصف الثاني من المعادلة: الهندسة ثابتة (glass_tokens)، والمادّة تتدرّج
// حسب قدرة الجهاز. ثلاث درجات:
//
//   full «أ»  — شيدر الانكسار فوق الضباب (iOS دائماً؛ أندرويد بتفضيل
//               «فاخرة» اليدويّ فقط — قرار المالك ق3: لا ترقية تلقائية
//               قبل قياس جهازٍ حقيقيّ).
//   mid  «ب»  — ضبابٌ بلا انكسار. افتراضيّ هواتف أندرويد الحديثة.
//   lite «ج»  — لا BackdropFilter إطلاقاً: تعبئة شفيفة بنفس الهندسة
//               والحركة. درجة تابلتات النادي الضعيفة — قيد 11 §13 يعيش
//               هنا حرفياً، لا كحظرٍ شامل على المنصّة.
//
// الكشف رخيص ويقع مرّة في الإقلاع (bootstrap ينتظره): جهازٌ منخفض
// الذاكرة أو أقدم من Android 10 ⇒ lite. والمستخدم يملك التجاوز دائماً
// («جودة الواجهة» في الإعدادات) — نقيس ولا نراهن، ونترك مخرجاً.

enum GlassTier { full, mid, lite }

/// تفضيل المستخدم كما يُحفظ في SharedPreferences.
enum GlassPreference { auto, fancy, light }

class GlassQuality {
  GlassQuality._();

  static const _kPref = 'glass_quality';

  /// الدرجة الفعّالة الآن. تبدأ بأأمن افتراضٍ قبل init (لا يُرى عملياً —
  /// bootstrap ينتظر init قبل runApp؛ الاحتياط لمسارات الاختبار).
  static final ValueNotifier<GlassTier> notifier =
      ValueNotifier<GlassTier>(_platformFloor());

  static GlassTier get tier => notifier.value;

  static GlassPreference _pref = GlassPreference.auto;
  static GlassPreference get preference => _pref;

  static bool _lowEndDevice = false;

  @visibleForTesting
  static void overrideForTest(GlassTier? t) {
    notifier.value = t ?? _platformFloor();
  }

  /// iOS كامل الدرجة دائماً (سلّمه الداخليّ أصليّ←شيدر←ضباب يُدار في
  /// مكانه)؛ ما عداه يبدأ خفيفاً حتى يقول الكشف كلمته.
  static GlassTier _platformFloor() =>
      defaultTargetPlatform == TargetPlatform.iOS ? GlassTier.full : GlassTier.lite;

  /// يُنادى من bootstrap قبل runApp — كشفٌ رخيص لا شبكة فيه.
  static Future<void> init() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _pref = GlassPreference.values.asNameMap()[prefs.getString(_kPref)] ??
          GlassPreference.auto;
    } catch (_) {
      _pref = GlassPreference.auto;
    }

    if (defaultTargetPlatform == TargetPlatform.android) {
      try {
        final a = await DeviceInfoPlugin().androidInfo;
        // إشارتا الضعف المعتمدتان (95 §3.1): ذاكرة منخفضة أو ما قبل
        // Android 10. تكفيان لتصنيف تابلتات النادي دون قوائم طرازات.
        _lowEndDevice = a.isLowRamDevice || a.version.sdkInt < 29;
      } catch (_) {
        // تعذّر الكشف (اختبارات/بيئة غريبة) — لا نفترض الأسوأ ولا الأفضل:
        // نعامل الجهاز حديثاً ويبقى للمستخدم مخرج «خفيفة».
        _lowEndDevice = false;
      }
    }

    _apply();
  }

  /// يحفظ تفضيل المستخدم ويطبّقه فوراً (الغلاف يعيد البناء عبر notifier).
  static Future<void> setPreference(GlassPreference p) async {
    _pref = p;
    _apply();
    try {
      (await SharedPreferences.getInstance()).setString(_kPref, p.name);
    } catch (_) {/* تفضيلٌ لم يُحفظ — يُعاد كشفه في الإقلاع التالي */}
  }

  static void _apply() {
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      // iOS خارج السلّم: مادّته تُدار داخلياً (أصليّ/شيدر/ضباب) ولا
      // معنى لإجباره على «خفيفة» — أجهزته تتحمّل مادّته بالقياس.
      notifier.value = GlassTier.full;
      return;
    }
    notifier.value = switch (_pref) {
      GlassPreference.light => GlassTier.lite,
      GlassPreference.fancy => GlassTier.full,
      GlassPreference.auto =>
        _lowEndDevice ? GlassTier.lite : GlassTier.mid,
    };
  }
}
