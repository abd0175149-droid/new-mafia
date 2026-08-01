import 'package:flutter/material.dart';
import 'colors.dart';

// ══════════════════════════════════════════════════════
// ✍️ الخطوط — §4.3
// ══════════════════════════════════════════════════════
// Amiri للعناوين والنصوص المسرحية · Tajawal للجسم · JetBrainsMono للاتينية.
//
// ⚠️ في الويب يُطبَّق Amiri inline في عشرات الملفات. هنا يُمركَز في
//    TextTheme — وإلا طاردنا مئات الأنماط المبعثرة كما في الويب.

const _amiri = 'Amiri';
const _tajawal = 'Tajawal';
const _mono = 'JetBrainsMono';

// ══════════════════════════════════════════════════════
// 🔴 قاعدة عربية حرجة: letterSpacing = 0 بلا استثناء
// ══════════════════════════════════════════════════════
// التباعد يكسر وصلات الحروف العربية فتظهر الكلمة حروفاً منفصلة.
// التباعد والأحرف الكبيرة حصراً للنصّ اللاتينيّ عبر latinStyle أدناه.
const double _ls = 0;

TextTheme buildTextTheme() => const TextTheme(
      // ── العناوين: Amiri ──
      displayLarge: TextStyle(fontFamily: _amiri, fontWeight: FontWeight.w900, fontSize: 34, letterSpacing: _ls, color: Noir.textEmphasis),
      displayMedium: TextStyle(fontFamily: _amiri, fontWeight: FontWeight.w900, fontSize: 30, letterSpacing: _ls, color: Noir.textEmphasis),
      displaySmall: TextStyle(fontFamily: _amiri, fontWeight: FontWeight.w900, fontSize: 26, letterSpacing: _ls, color: Noir.textEmphasis),
      headlineLarge: TextStyle(fontFamily: _amiri, fontWeight: FontWeight.w900, fontSize: 24, letterSpacing: _ls, color: Noir.vintageGold),
      headlineMedium: TextStyle(fontFamily: _amiri, fontWeight: FontWeight.w700, fontSize: 21, letterSpacing: _ls, color: Noir.vintageGold),
      headlineSmall: TextStyle(fontFamily: _amiri, fontWeight: FontWeight.w700, fontSize: 18, letterSpacing: _ls, color: Noir.textEmphasis),
      titleLarge: TextStyle(fontFamily: _amiri, fontWeight: FontWeight.w700, fontSize: 17, letterSpacing: _ls, color: Noir.textEmphasis),
      titleMedium: TextStyle(fontFamily: _amiri, fontWeight: FontWeight.w700, fontSize: 15, letterSpacing: _ls, color: Noir.textEmphasis),

      // ── الجسم: Tajawal ──
      titleSmall: TextStyle(fontFamily: _tajawal, fontWeight: FontWeight.w700, fontSize: 14, letterSpacing: _ls, color: Noir.textEmphasis),
      bodyLarge: TextStyle(fontFamily: _tajawal, fontWeight: FontWeight.w400, fontSize: 15, letterSpacing: _ls, color: Noir.textMuted),
      bodyMedium: TextStyle(fontFamily: _tajawal, fontWeight: FontWeight.w400, fontSize: 14, letterSpacing: _ls, color: Noir.textMuted),
      bodySmall: TextStyle(fontFamily: _tajawal, fontWeight: FontWeight.w400, fontSize: 12, letterSpacing: _ls, color: Noir.textMuted),
      labelLarge: TextStyle(fontFamily: _tajawal, fontWeight: FontWeight.w700, fontSize: 14, letterSpacing: _ls, color: Noir.textEmphasis),
      labelMedium: TextStyle(fontFamily: _tajawal, fontWeight: FontWeight.w500, fontSize: 12, letterSpacing: _ls, color: Noir.textMuted),
      labelSmall: TextStyle(fontFamily: _tajawal, fontWeight: FontWeight.w500, fontSize: 11, letterSpacing: _ls, color: Noir.textMuted),
    );

/// نمط لاتينيّ: تباعد 0.2em — يُستعمل **مع** `text.toUpperCase()`.
/// مكافئ `.btn-premium-latin` في الويب. لا تستعمله على نصّ عربيّ أبداً.
TextStyle latinStyle(TextStyle base) =>
    base.copyWith(letterSpacing: (base.fontSize ?? 14) * 0.2);

/// نمط أحاديّ المسافة — المعرّفات والمؤقّت وكونسول التشخيص.
TextStyle monoStyle({
  double size = 12,
  FontWeight weight = FontWeight.w400,
  Color color = Noir.textMuted,
}) =>
    TextStyle(fontFamily: _mono, fontSize: size, fontWeight: weight, color: color, letterSpacing: 0);

/// الأرقام الذهبية الكبيرة (رقم المقعد) — 48 ذهبيّ متوهّج.
const TextStyle goldNumberStyle = TextStyle(
  fontFamily: _amiri,
  fontSize: 48,
  fontWeight: FontWeight.w900,
  color: Noir.vintageGold,
  letterSpacing: 0,
  shadows: NoirShadows.glowGoldNumber,
);
