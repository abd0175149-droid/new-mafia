import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'colors.dart';
import 'typography.dart';

export 'colors.dart';
export 'dimens.dart';
export 'typography.dart';

// ══════════════════════════════════════════════════════
// 🌑 ثيم Dark Noir — §4.2.5
// ══════════════════════════════════════════════════════
// داكن فقط، RTL عربيّ فقط. لا ثيم فاتح ولا وضع LTR.

ThemeData buildNoirTheme() {
  final text = buildTextTheme();

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: Noir.pitchBlack,
    fontFamily: 'Tajawal',

    colorScheme: const ColorScheme.dark(
      primary: Noir.bloodRed,
      onPrimary: Noir.textEmphasis,
      secondary: Noir.vintageGold,
      onSecondary: Color(0xFF0A0A0A),
      surface: Noir.charcoal,
      onSurface: Noir.textEmphasis,
      surfaceContainer: Noir.noirCardBg,
      surfaceContainerHigh: Noir.darkCard,
      // الأحمر نفسه يخدم الأساسيّ والخطأ — وهذا مقصود في هوية النوار
      error: Noir.bloodRed,
    ),

    dividerColor: Noir.noirBorder,
    textTheme: text,

    dialogTheme: const DialogThemeData(
      backgroundColor: Noir.swalBg,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: NoirRadius.panel),
    ),

    textSelectionTheme: const TextSelectionThemeData(
      selectionColor: Color(0x808A0303), // #8A0303 بشفافية 50%
      cursorColor: Noir.vintageGold,
    ),

    // زوايا حادّة: توقيع البراند
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Noir.bloodRed,
        foregroundColor: Noir.textEmphasis,
        shape: const RoundedRectangleBorder(borderRadius: NoirRadius.noir),
        textStyle: text.labelLarge,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: Noir.vintageGold,
        side: const BorderSide(color: Noir.noirBorder),
        shape: const RoundedRectangleBorder(borderRadius: NoirRadius.noir),
        textStyle: text.labelLarge,
      ),
    ),

    inputDecorationTheme: const InputDecorationTheme(
      filled: true,
      fillColor: Noir.gateInputBg,
      border: OutlineInputBorder(borderRadius: NoirRadius.soft, borderSide: BorderSide(color: Noir.noirBorder)),
      enabledBorder: OutlineInputBorder(borderRadius: NoirRadius.soft, borderSide: BorderSide(color: Noir.noirBorder)),
      focusedBorder: OutlineInputBorder(borderRadius: NoirRadius.soft, borderSide: BorderSide(color: Noir.vintageGold)),
    ),

    // سحب-للتحديث: عنبريّ. ودلالته هنا إعادة جلب حالة الشاشة
    // لا إعادة تشغيل التطبيق كما كان في الـPWA.
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: Color(0xFFF59E0B)),

    extensions: const <ThemeExtension<dynamic>>[MafiaScales()],
  );
}

/// شريط الحالة والتنقّل — يُطبَّق عند الإقلاع.
const SystemUiOverlayStyle noirSystemUi = SystemUiOverlayStyle(
  statusBarColor: Colors.transparent,
  statusBarIconBrightness: Brightness.light, // أندرويد
  statusBarBrightness: Brightness.dark, // iOS
  systemNavigationBarColor: Noir.pitchBlack,
  systemNavigationBarIconBrightness: Brightness.light,
);
