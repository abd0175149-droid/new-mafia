import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';
import '../core/push/badge_service.dart';

import 'app_state.dart';
import 'config.dart';
import 'router.dart';
import 'theme/theme.dart';
import '../core/push/push_service.dart';
import '../core/ui/atmosphere.dart';
import '../core/ui/in_app_banner.dart';
import '../features/gates/birthday_gate.dart';
import '../features/gates/notification_gate.dart';

// ══════════════════════════════════════════════════════
// 📱 جذر التطبيق
// ══════════════════════════════════════════════════════
// الترتيب الصارم (§6.1 في الملفّ 11): مصادقة ← بوابة الإشعارات ←
// الغلاف. المصادقة صارت حارس الراوتر، والبوّابة **طبقة فوق المحتوى لا
// مسار** (§6.2 في الملفّ 08): الـURL يبقى على الوجهة المقصودة، فإن جاء
// اللاعب من رابط عميق وجد نفسه عليه بعد منح الإذن — لا على الرئيسية.

class MafiaApp extends StatefulWidget {
  const MafiaApp({super.key, required this.config});

  final AppConfig config;

  @override
  State<MafiaApp> createState() => _MafiaAppState();
}

class _MafiaAppState extends State<MafiaApp> {
  late final GoRouter _router = buildRouter(widget.config);
  final _app = AppState.instance;

  @override
  void initState() {
    super.initState();
    _app.addListener(_onAppState);
    _app.evaluate();
    // وجهة إشعارٍ أقلع منه التطبيق تصل عبر PushService قبل حسم الجلسة
    PushService.instance.pendingRoute.addListener(_onPushRoute);
    // شارة الأيقونة تُصفَّر عند الإقلاع وكلّ عودة إلى المقدّمة (91 §12)
    BadgeService.instance.start();
  }

  @override
  void dispose() {
    _app.removeListener(_onAppState);
    PushService.instance.pendingRoute.removeListener(_onPushRoute);
    BadgeService.instance.stop();
    super.dispose();
  }

  void _onPushRoute() {
    final r = PushService.instance.pendingRoute.value;
    if (r == null) return;
    PushService.instance.pendingRoute.value = null;
    _app.setPending(r);
    _consumePending();
  }

  void _onAppState() {
    if (mounted) setState(() {});
    _consumePending();
  }

  /// 🔴 الاستهلاك **لا ينتظر البوّابة**: في الويب يقع التنقّل خلف الطبقة.
  ///    فتبقى البوّابة فوق الوجهة الصحيحة، وتنكشف عنها عند منح الإذن.
  void _consumePending() {
    if (_app.session != SessionState.authenticated) return;
    final target = _app.pending;
    if (target == null) return;

    // مطابقة الموقع الحاليّ تمنع تنقّلاً لا يغيّر شيئاً
    if (currentLocation == target) {
      _app.takePending();
      return;
    }
    _app.takePending();
    WidgetsBinding.instance.addPostFrameCallback((_) => navigateTo(target));
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: widget.config.appName,
      debugShowCheckedModeBanner: false,
      theme: buildNoirTheme(),
      routerConfig: _router,

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
            // ⚠️ StackFit.expand إلزاميّ. المكدّس الافتراضيّ `loose`،
            //    فيمرّر لابنه غير المموضَع قيوداً فضفاضة فيتقلّص إلى حجم
            //    محتواه — والنتيجة Scaffold لا يملأ الشاشة، وشريط التنقّل
            //    يستقرّ في منتصفها.
            child: Stack(
              fit: StackFit.expand,
              children: [
                child ?? const SizedBox.shrink(),
                if (_showGate) const Positioned.fill(child: _Gate()),
                // 🎂 BDAY-1 — **بعد** بوّابة الإشعارات لا قبلها: بوّابتان
                //    معاً تعنيان جداراً مضاعفاً على أوّل دخول. وهذه تُسأل
                //    مرّةً واحدةً في العمر، تلك تتكرّر.
                if (_showBirthday)
                  Positioned.fill(
                    child: BirthdayGate(
                      onSaved: () => AppState.instance.markBirthdaySaved(),
                    ),
                  ),
                // 📣 ORDER-3: بانر الإشعار — تحت الضجيج وفوق كلّ شيءٍ آخر،
                //    ولا يُعرض على أندرويد (هناك إشعارٌ نظاميّ يُرسم أصلاً).
                if (defaultTargetPlatform == TargetPlatform.iOS)
                  const InAppBanner(),
                // الضجيج فوق كل شيء دائماً — آخر عنصر في المكدّس
                const Positioned.fill(child: NoiseOverlay()),
              ],
            ),
          ),
        );
      },
    );
  }

  /// 🎂 بوّابة الميلاد: للمسجّل الذي لا تاريخ له، وبعد عبور بوّابة
  /// الإشعارات، وخارج مسار الانضمام — من يمسح QR لغرفةٍ بدأت لا يُحجب.
  bool get _showBirthday {
    if (_app.session != SessionState.authenticated) return false;
    if (_showGate) return false;
    if (!_app.needsBirthday) return false;
    final loc = currentLocation ?? '';
    final path = Uri.tryParse(loc)?.path ?? loc;
    if (path.startsWith('/join/')) return false;
    return !Routes.publicPaths.contains(path);
  }

  /// البوّابة تُعرض للمسجّل وحده، وخارج المسارات العامّة ومسار الكود.
  bool get _showGate {
    if (_app.session != SessionState.authenticated || _app.gatePassed) return false;
    final loc = currentLocation ?? '';
    final path = Uri.tryParse(loc)?.path ?? loc;
    if (path.startsWith('/join/')) return false;
    return !Routes.publicPaths.contains(path);
  }
}

class _Gate extends StatelessWidget {
  const _Gate();

  @override
  Widget build(BuildContext context) => NotificationGate(
        status: AppState.instance.permission,
        onResolved: AppState.instance.evaluate,
        onSkip: AppState.instance.skipGate,
      );
}
