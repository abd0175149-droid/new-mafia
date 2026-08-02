import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'config.dart';
import 'theme/theme.dart';
import '../core/push/push_service.dart';
import '../core/socket/socket_service.dart';
import '../core/storage/session_store.dart';
import '../core/ui/atmosphere.dart';
import '../features/auth/auth_screen.dart';
import '../features/gates/notification_gate.dart';
import '../features/shell/shell_screen.dart';

// ══════════════════════════════════════════════════════
// 📱 جذر التطبيق + آلة حالات القشرة
// ══════════════════════════════════════════════════════
// الترتيب الصارم (§6.1 في الملفّ 11): مصادقة ← بوابة الإشعارات ←
// الغلاف الطبيعيّ. تُعاد التقييم عند كل تغيّر مدخلات وعند العودة من
// الخلفية.

enum _ShellState { loading, unauthenticated, gate, ready }

class MafiaApp extends StatefulWidget {
  const MafiaApp({super.key, required this.config});

  final AppConfig config;

  @override
  State<MafiaApp> createState() => _MafiaAppState();
}

class _MafiaAppState extends State<MafiaApp> {
  _ShellState _state = _ShellState.loading;
  PushPermission _perm = PushPermission.prompt;

  @override
  void initState() {
    super.initState();
    _evaluate();
  }

  Future<void> _evaluate() async {
    if (!SessionStore.instance.isLoggedIn) {
      setState(() => _state = _ShellState.unauthenticated);
      return;
    }
    final p = await PushService.instance.permission();
    if (!mounted) return;
    setState(() {
      _perm = p;
      // `unsupported` لا تحجب: جهاز بلا خدمات Google لا يستطيع تفعيل
      // شيئاً مهما فعل، وحجبه يعني تطبيقاً لا يُفتح أبداً. الويب كان
      // يعرض رمز تجاوز؛ هنا نمرّره ونكتفي بغياب الإشعارات.
      _state = (p == PushPermission.granted || p == PushPermission.unsupported)
          ? _ShellState.ready
          : _ShellState.gate;
    });
  }

  void _onAuthDone() {
    // 🔴 إعادة المصافحة إلزامية: السوكِت أُنشئ عند الإقلاع بلا رمز،
    //    والانضمام إلى غرفة `player:{id}` يقع عند المصافحة وحدها.
    SocketService.instance.reauth();
    _evaluate();
  }

  void _onLoggedOut() {
    SocketService.instance.reauth();
    setState(() => _state = _ShellState.unauthenticated);
  }

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
            // ⚠️ StackFit.expand إلزاميّ. المكدّس الافتراضيّ `loose`،
            //    فيمرّر لابنه غير المموضَع قيوداً فضفاضة فيتقلّص إلى حجم
            //    محتواه — والنتيجة Scaffold لا يملأ الشاشة، وشريط التنقّل
            //    يستقرّ في منتصفها. لم يظهر في M0 لأن شاشة الهويّة كانت
            //    تمرير قائمة يملأ وحده؛ ظهر لحظة أن صار للجسم محتوى قصير.
            child: Stack(
              fit: StackFit.expand,
              children: [
                child ?? const SizedBox.shrink(),
                // الضجيج فوق كل شيء دائماً — آخر عنصر في المكدّس
                const Positioned.fill(child: NoiseOverlay()),
              ],
            ),
          ),
        );
      },

      home: switch (_state) {
        _ShellState.loading => const _SessionLoading(),
        _ShellState.unauthenticated => AuthScreen(onDone: _onAuthDone),
        _ShellState.gate => NotificationGate(status: _perm, onResolved: _evaluate),
        _ShellState.ready => ShellScreen(config: widget.config, onLoggedOut: _onLoggedOut),
      },
    );
  }
}

/// شاشة استعادة الجلسة — §4.1 في الملفّ 11.
class _SessionLoading extends StatelessWidget {
  const _SessionLoading();

  @override
  Widget build(BuildContext context) => const Scaffold(
        backgroundColor: Noir.pitchBlack,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: 48, height: 48,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Color(0xFFF59E0B),
                  backgroundColor: Color(0x4DF59E0B),
                ),
              ),
              SizedBox(height: 16),
              Text('جاري التحميل...',
                  style: TextStyle(fontFamily: 'Tajawal', fontSize: 14, color: Color(0x99F59E0B), letterSpacing: 0)),
            ],
          ),
        ),
      );
}
