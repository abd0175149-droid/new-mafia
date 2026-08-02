import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'config.dart';
import 'theme/theme.dart';
import '../core/socket/socket_service.dart';
import '../core/storage/session_store.dart';
import '../core/ui/atmosphere.dart';
import '../features/auth/login_screen.dart';
import '../features/shell/core_status_screen.dart';

// ══════════════════════════════════════════════════════
// 📱 جذر التطبيق
// ══════════════════════════════════════════════════════

class MafiaApp extends StatefulWidget {
  const MafiaApp({super.key, required this.config});

  final AppConfig config;

  @override
  State<MafiaApp> createState() => _MafiaAppState();
}

class _MafiaAppState extends State<MafiaApp> {
  late bool _loggedIn = SessionStore.instance.isLoggedIn;

  void _onLoggedIn() {
    // 🔴 إعادة المصافحة إلزامية هنا. السوكِت أُنشئ عند الإقلاع بلا رمز،
    //    والانضمام إلى غرفة `player:{id}` يقع عند المصافحة وحدها — فبلا
    //    هذا السطر يبقى اللاعب خارج غرفته بعد دخول ناجح، ولا يصله حدث
    //    واحد، ولا يظهر أي خطأ يدلّ على السبب.
    SocketService.instance.reauth();
    setState(() => _loggedIn = true);
  }

  void _onLoggedOut() => setState(() => _loggedIn = false);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: widget.config.appName,
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

      // حارس المصادقة — يُستبدل بـgo_router في M2 (الملفّ 08/11) حين
      // تصير المسارات أكثر من اثنين وتلزم الروابط العميقة.
      // 🧭 مقعد توجيه الإشعارات: `PushService.pendingRoute` يحمل المسار
      //    المطلوب ويُستهلك مع go_router في M2 (الملفّان 08 و11). يُخزَّن
      //    الآن ولا يُنفَّذ — نقرة تفتح التطبيق ثم لا تصل شاشتها أفضل من
      //    تنقّل يُخترع قبل وجود المسارات.
      home: _loggedIn
          ? CoreStatusScreen(config: widget.config, onLoggedOut: _onLoggedOut)
          : LoginScreen(onLoggedIn: _onLoggedIn),
    );
  }
}
