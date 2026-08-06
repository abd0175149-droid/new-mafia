import 'package:flutter/material.dart';

// ══════════════════════════════════════════════════════
// 📐 عقد المواصفة الزجاجيّة — الملفّ ٩٥ §5 المرحلة 0
// ══════════════════════════════════════════════════════
// **الهوية ثابتة عبر المنصّتين: الهندسة والحركة والدلالة. المادّة وحدها
// تتدرّج حسب الجهاز.** هذا الملفّ هو نصف «الثابت» من تلك المعادلة: كلّ
// رقمٍ هندسيّ أو لونُ هويّةٍ يقرؤه iOS وأندرويد من هنا حصراً — رقمٌ واحد
// بمصدرٍ واحد، فلا تنجرف المنصّتان عن بعضهما رقماً رقماً.
//
// القيم منقولة حرفياً من liquid_glass_nav.dart وتعليلاتها المقيسة باقية
// هناك حيث تُستعمل — هذا الملفّ سجلٌّ لا شرح. تغيير أيّ قيمة هنا يغيّر
// المنصّتين معاً، وهذا هو المقصود.

abstract final class GlassTokens {
  // ── كبسولة الشريط السفليّ ──
  /// نصف قطر الحوافّ — كبسولة كاملة الاستدارة.
  static const double navRadius = 34;

  /// ارتفاعا الكبسولة: ممتدّة بتسمياتها ← منكمشة إلى أيقونات.
  /// 🔴 مقيَّدان بميزانية الـ80 نقطة التي تحجزها الشاشات — التعليل الكامل
  ///    في liquid_glass_nav.dart.
  static const double navExpanded = 56;
  static const double navCollapsed = 42;

  /// الفجوة أسفل الكبسولة (فوق SafeArea).
  static const double navBottomGap = 8;

  /// عرض الكبسولة وهوامشها — تضيق مع الانكماش كي تبدو منكمشةً لا مقصوصة.
  static const double navMaxWidthExpanded = 512;
  static const double navMaxWidthCollapsed = 452;
  static const double navSideMarginExpanded = 16;
  static const double navSideMarginCollapsed = 38;

  // ── الزرّ المركزيّ «ادخل» ──
  /// 🔴 الارتفاع 16 عقدٌ مع Swift (الجانب الأصليّ يشتقّ منه) ومع اندماج
  ///    UIGlassContainerEffect — التعليل في liquid_glass_nav.dart.
  static const double centerSize = 52;
  static const double centerLift = 16;

  // ── الحركة ──
  static const Duration collapseDuration = Duration(milliseconds: 220);

  // ── المادّة (محاكاة الزجاج — درجتا «أ/ب») ──
  static const double navBlurSigma = 24;
  static const double centerBlurSigma = 18;

  // ── مادّة الدرجة الخفيفة «ج» — نفس الهندسة، تعبئة شفيفة بلا ضباب ──
  // معتمة أكثر من تدرّج الزجاج عمداً: بلا ضبابٍ خلفها يجب أن تحجب
  // المحتوى المارّ تحتها بنفسها كي تبقى الأيقونات مقروءة.
  static const List<Color> navSolidGradient = [Color(0xF2141414), Color(0xF70A0A0A)];
  static const List<Color> centerSolidActive = [Color(0xFFFBBF24), Color(0xFFB45309)];
  static const List<Color> centerSolidIdle = [Color(0xFF1A1812), Color(0xFF0E0C08)];

  // ── ألوان الهوية — مشتركة بين كلّ درجات المادّة ──
  static const Color active = Color(0xFFFBBF24);
  static const Color idle = Color(0xFF9CA3AF);
  static const Color rimLight = Color(0x33FFFFFF);
  static const List<Color> navGlassGradient = [Color(0x24FFFFFF), Color(0x0DFFFFFF)];
}
