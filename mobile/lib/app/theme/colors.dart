import 'package:flutter/material.dart';

// ══════════════════════════════════════════════════════
// 🎨 ألوان نادي المافيا — Dark Noir
// ══════════════════════════════════════════════════════
// منقولة حرفياً من §4.2 في docs/flutter-plan/01-foundation-theme.md.
// أي قيمة هنا تخالف الويب تعني لاعباً يرى لونين لشيء واحد.

/// ── الألوان الأساسية والسطوح ──
abstract final class Noir {
  static const bloodRed = Color(0xFF8A0303); // أساسيّ · vignettes · خطر
  static const vintageGold = Color(0xFFC5A059); // ذهب البراند
  static const pitchBlack = Color(0xFF050505); // خلفية التطبيق
  static const charcoal = Color(0xFF111111); // سطوح
  static const darkCard = Color(0xFF1A1A1A); // بطاقات عامّة
  static const noirCardBg = Color(0xFF0C0C0C); // بطاقات نوار
  static const noirBorder = Color(0xFF2A2A2A); // حدود نوار/شبح
  static const success = Color(0xFF2E5C31);
  static const textMuted = Color(0xFF808080); // نصّ الجسم الافتراضيّ
  static const textEmphasis = Color(0xFFFFFFFF);

  // حوارات
  static const swalText = Color(0xFFE7E2D6); // أبيض دافئ
  static const swalBg = Color(0xFF141210);
  static const swalCancel = Color(0xFF2F2A24);
  static const dangerConfirm = Color(0xFFB91C1C);

  // حالات الضغط
  static const primaryPressed = Color(0xFFA00303);
  static const secondaryPressed = Color(0xFFD4B069);

  static const dangerSoft = Color(0xFFFF6B6B);
  static const citizenText = Color(0xFFE2E2E2);
  static const gateInputBg = Color(0xFF121212);

  // سطح بطاقة الغرفة عن بُعد (تدرّج)
  static const cardSurfaceTop = Color(0xFF0E0E10);
  static const cardSurfaceBottom = Color(0xFF0A0A0B);

  // طبقتا نصّ الـglitch
  static const glitchRed = Color(0xFFFF0000);
  static const glitchCyan = Color(0xFF00FFFF);
}

// ══════════════════════════════════════════════════════
// ⚠️ ثلاثة «ذهبيات» متعايشة — لا يجوز توحيدها
// ══════════════════════════════════════════════════════
//   ذهب البراند  #C5A059  ← Noir.vintageGold
//   ذهب Tailwind #EAB308  ← MafiaScales.gold[500]
//   العنبريّ      #F59E0B  ← MafiaScales.amber[500]
// دمج أيّ اثنين منها يبدو «تنظيفاً» ويكسر هوية شاشات كاملة.

/// ── السلالم ──
@immutable
class MafiaScales extends ThemeExtension<MafiaScales> {
  const MafiaScales();

  /// أحمر المافيا
  static const mafia = <int, Color>{
    50: Color(0xFFFEF2F2), 100: Color(0xFFFEE2E2), 200: Color(0xFFFECACA),
    300: Color(0xFFFCA5A5), 400: Color(0xFFF87171), 500: Color(0xFFEF4444),
    600: Color(0xFFDC2626), 700: Color(0xFFB91C1C), 800: Color(0xFF991B1B),
    900: Color(0xFF7F1D1D), 950: Color(0xFF450A0A),
  };

  /// أزرق المواطنين
  static const citizen = <int, Color>{
    50: Color(0xFFEFF6FF), 100: Color(0xFFDBEAFE), 200: Color(0xFFBFDBFE),
    300: Color(0xFF93C5FD), 400: Color(0xFF60A5FA), 500: Color(0xFF3B82F6),
    600: Color(0xFF2563EB), 700: Color(0xFF1D4ED8), 800: Color(0xFF1E40AF),
    900: Color(0xFF1E3A8A), 950: Color(0xFF172554),
  };

  /// slate — وفيه درجة 850 غير قياسية، مقصودة
  static const dark = <int, Color>{
    50: Color(0xFFF8FAFC), 100: Color(0xFFF1F5F9), 200: Color(0xFFE2E8F0),
    300: Color(0xFFCBD5E1), 400: Color(0xFF94A3B8), 500: Color(0xFF64748B),
    600: Color(0xFF475569), 700: Color(0xFF334155), 800: Color(0xFF1E293B),
    850: Color(0xFF162032), // ← مخصّصة: الإطار الداخليّ لبطاقة النوار
    900: Color(0xFF0F172A), 950: Color(0xFF020617),
  };

  /// أصفر Tailwind — **ليس ذهب البراند**
  static const gold = <int, Color>{
    400: Color(0xFFFACC15), 500: Color(0xFFEAB308), 600: Color(0xFFCA8A04),
  };

  /// العنبريّ — البوابات والإشعارات والتشبس
  static const amber = <int, Color>{
    500: Color(0xFFF59E0B), 600: Color(0xFFD97706),
  };

  static const emerald500 = Color(0xFF10B981);
  static const emerald900 = Color(0xFF064E3B);

  @override
  MafiaScales copyWith() => const MafiaScales();

  @override
  MafiaScales lerp(ThemeExtension<MafiaScales>? other, double t) => this;
}

/// ── الظلال والتوهّجات (§4.2.4) ──
abstract final class NoirShadows {
  static const noirCard = [
    BoxShadow(color: Color(0xCC000000), blurRadius: 30, offset: Offset(0, 15)),
  ];
  static const btnPrimary = [
    BoxShadow(color: Color(0x4D8A0303), blurRadius: 15, offset: Offset(0, 5)),
  ];
  static const panel = [
    BoxShadow(color: Color(0x80000000), blurRadius: 40, offset: Offset(0, 20)),
  ];
  static const richModal = [
    BoxShadow(color: Color(0x99000000), blurRadius: 60, offset: Offset(0, 20)),
  ];

  /// توهّج الأرقام الذهبية الكبيرة (رقم المقعد)
  static const glowGoldNumber = [
    Shadow(color: Color(0x66C5A059), blurRadius: 20),
  ];

  /// ظلّ نصّ أدوات التدرّج
  static const dropShadowText = [
    Shadow(color: Color(0xFF000000), blurRadius: 4, offset: Offset(0, 2)),
  ];
}

/// ── الزوايا (§4.2.3) — لغتان متعايشتان، أبقِ كلتيهما ──
abstract final class NoirRadius {
  /// توقيع البراند: زوايا حادّة لبطاقة النوار والأزرار الأساسية
  static const noir = BorderRadius.zero;
  static const chip = BorderRadius.all(Radius.circular(8));
  static const console = BorderRadius.all(Radius.circular(10));
  static const soft = BorderRadius.all(Radius.circular(12));
  static const panel = BorderRadius.all(Radius.circular(16));
  static const richModal = BorderRadius.all(Radius.circular(18));
  static const gate = BorderRadius.all(Radius.circular(24));
}
