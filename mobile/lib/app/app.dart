import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'config.dart';
import 'theme/theme.dart';
import '../core/ui/atmosphere.dart';
import '../features/shell/identity_screen.dart';

// ══════════════════════════════════════════════════════
// 📱 جذر التطبيق
// ══════════════════════════════════════════════════════

class MafiaApp extends StatelessWidget {
  const MafiaApp({super.key, required this.config});

  final AppConfig config;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: config.appName,
      debugShowCheckedModeBanner: false,
      theme: buildNoirTheme(),

      // ── عربيّ RTL فقط ──
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],

      builder: (context, child) {
        // تكبير خطّ النظام مقيَّد: بلا قيد يلتفّ نصّ الأزرار ويتجاوز
        // اللقب حدود البطاقة على أجهزة ضبطت الخطّ على أكبر مقاس.
        final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
        final clamped = scale > 1.3 ? 1.3 : scale;

        return MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(clamped)),
          child: Directionality(
            textDirection: TextDirection.rtl,
            child: Stack(
              children: [
                child ?? const SizedBox.shrink(),
                // الضجيج فوق كل شيء دائماً — آخر عنصر في المكدّس
                const Positioned.fill(child: NoiseOverlay()),
              ],
            ),
          ),
        );
      },

      home: IdentityScreen(config: config),
    );
  }
}
