import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/routing/destination.dart';
import '../features/auth/auth_screen.dart';
import '../features/feedback/feedback_screen.dart';
import '../features/games/games_screen.dart';
import '../features/home/home_screen.dart';
import '../features/join/join_screen.dart';
import '../features/order/order_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/rank/rank_screen.dart';
import '../features/shell/shell_screen.dart';
import '../features/store/store_screen.dart';
import '../features/wallet/wallet_screen.dart';
import 'app_state.dart';
import 'config.dart';
import 'theme/theme.dart';

// ══════════════════════════════════════════════════════
// 🧭 الراوتر — الملفّ 08
// ══════════════════════════════════════════════════════
// المسارات تطابق الويب حرفياً (`/player/home` لا `/home`): وجهات
// الإشعارات مكتوبة في الخادم بمسارات الويب، وأيّ اختلاف هنا يعني
// جدول ترجمة يجب أن يبقى محدَّثاً في مكانين.

abstract final class Routes {
  static const login = '/player/login';
  static const home = '/player/home';
  static const games = '/player/games';
  static const join = '/player/join';
  static const rank = '/player/rank';
  static const profile = '/player/profile';
  static const wallet = '/player/wallet';
  static const store = '/player/store';
  static const order = '/player/order';
  static const feedback = '/player/feedback';

  /// عامّة دائماً — لا حارس ولا بوّابة ولا انتظار جلسة.
  static const publicPaths = <String>[login, '/player/debug-push'];
}

final _rootKey = GlobalKey<NavigatorState>();

// 🔴 `goBranch` لا يعيد بناء الفرع — حالته محفوظة بالتصميم. فالعودة إلى
//    «التصنيف» بعد مباراة كانت ستعرض RR القديم إلى الأبد. المفاتيح تتيح
//    جلباً صريحاً عند نقر التبويب (نفس ما كان يفعله IndexedStack يدوياً).
final gamesTabKey = GlobalKey<GamesScreenState>();
final rankTabKey = GlobalKey<RankScreenState>();
final profileTabKey = GlobalKey<ProfileScreenState>();

GoRouter buildRouter(AppConfig config) {
  final app = AppState.instance;

  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: Routes.home,
    refreshListenable: app,
    debugLogDiagnostics: false,

    // مسار مجهول لا يستحقّ شاشة خطأ — لا أحد يكتب مسارات بيده هنا،
    // والوصول إليه يعني رابطاً قديماً. توجيه صامت.
    errorBuilder: (_, __) => const _SilentRedirect(),

    redirect: (context, state) {
      final path = state.uri.path;

      // ① الجذر
      if (path == '/' || path == '/player') return Routes.home;

      // ② الرابط العميق بالكود: عامّ دائماً — بلا حارس ولا انتظار.
      //    🔴 كسر هذا يعني أن كل من يمسح رمز QR بلا حساب يُرمى إلى شاشة
      //    الدخول بدل الغرفة. وهو أكثر مسارٍ يُفتح من خارج التطبيق.
      if (path.startsWith('/join/')) return null;

      // ③ الإعفاء نفسه لصفحة الانضمام داخل الغلاف
      if (path == Routes.join) return null;

      // ④ الجلسة لم تُحسم: لا توجيه — الشاشة تعرض تحميلها، والـURL لا
      //    يتغيّر. توجيهٌ هنا يقذف اللاعب إلى الدخول ثم يعيده.
      if (app.session == SessionState.loading) return null;

      final public = Routes.publicPaths.contains(path);

      if (app.session == SessionState.unauthenticated && !public) {
        return Routes.login;
      }
      if (app.session == SessionState.authenticated && path == Routes.login) {
        return Routes.home;
      }
      return null;
    },

    routes: [
      GoRoute(
        path: Routes.store,
        builder: (_, __) => const StoreScreen(),
      ),

      GoRoute(
        path: Routes.wallet,
        builder: (_, __) => const WalletScreen(),
      ),

      GoRoute(
        path: Routes.order,
        builder: (_, __) => const OrderScreen(),
      ),

      // `?sessionId=` يصل من نقرة إشعار إغلاق الغرفة فيتجاوز أوّل الطابور
      GoRoute(
        path: Routes.feedback,
        builder: (_, s) => FeedbackScreen(
          sessionId: int.tryParse(s.uri.queryParameters['sessionId'] ?? ''),
        ),
      ),

      GoRoute(
        path: Routes.login,
        builder: (_, __) => const AuthScreen(),
      ),

      // الرابط العميق العاري — خارج الغلاف، بلا شريط تنقّل
      GoRoute(
        path: '/join/:code',
        builder: (_, s) => JoinScreen(
          initialCode: s.pathParameters['code'],
          bare: true,
        ),
      ),

      StatefulShellRoute.indexedStack(
        builder: (_, __, shell) => ShellScreen(config: config, shell: shell),
        branches: [
          _branch(Routes.home, (_, __) => const HomeScreen()),
          _branch(Routes.games, (_, s) => GamesScreen(
                key: gamesTabKey,
                focusActivityId: int.tryParse(s.uri.queryParameters['activityId'] ?? ''),
              )),
          _branch(Routes.join, (_, s) => JoinScreen(
                initialCode: s.uri.queryParameters['code'],
                invite: s.uri.queryParameters['invite'] == '1',
                inviterName: s.uri.queryParameters['by'],
              )),
          _branch(Routes.rank, (_, __) => RankScreen(key: rankTabKey)),
          _branch(Routes.profile, (_, __) => ProfileScreen(key: profileTabKey, config: config)),
        ],
      ),
    ],
  );
}

StatefulShellBranch _branch(String path, Widget Function(BuildContext, GoRouterState) b) =>
    StatefulShellBranch(routes: [GoRoute(path: path, builder: b)]);

// ══════════════════════════════════════════════════════
// 🚏 التنقّل من أيّ مكان
// ══════════════════════════════════════════════════════

/// ينفّذ وجهةً مصنّفة: الداخليّ في الراوتر، وما عداه في المتصفّح.
Future<void> navigateTo(String? raw) async {
  final d = Destination.classify(raw);
  switch (d.kind) {
    case DestinationKind.internal:
      final ctx = _rootKey.currentContext;
      if (ctx != null) ctx.go(d.value);
    case DestinationKind.external:
    case DestinationKind.ourWebOnly:
      await d.openExternal();
    case DestinationKind.none:
      break;
  }
}

/// دخولٌ إلى شاشةٍ **فوق** الغلاف (الخزنة، المحفظة).
///
/// 🔴 `push` لا `go`: الخزنة والمحفظة مساراتٌ عليا شقيقة للغلاف، و`go`
///    يستبدل المكدّس كلّه فلا يبقى تحتها شيء — فيخرج زرّ الرجوع العتاديّ
///    من التطبيق إلى شاشة الجهاز. `navigateTo` يبقى على `go` لأن وجهته
///    إشعارٌ قد يصل على بدءٍ بارد بلا مكدّس أصلاً.
void pushTo(String path) {
  final ctx = _rootKey.currentContext;
  if (ctx != null) ctx.push(path);
}

/// تبديل شاشة الغطاء بأختها (الخزنة ↔ المحفظة).
///
/// 🔴 كلٌّ منهما تُحيل إلى الأخرى في ترويستها، فـ`push` بينهما يكدّس
///    ذهاباً وإياباً بلا حدّ ويصير الرجوع رحلةً في التاريخ. الاستبدال
///    يُبقي العمق واحداً: الرجوع من أيّهما يعود إلى الغلاف.
void swapTo(String path) {
  final ctx = _rootKey.currentContext;
  if (ctx != null) ctx.pushReplacement(path);
}

/// رجوعٌ آمن: إلى ما تحت الشاشة إن وُجد، وإلى الرئيسية إن فُتحت من
/// إشعارٍ على بدءٍ بارد فلا شيء تحتها.
void popOrHome(BuildContext context) {
  final nav = Navigator.of(context);
  if (nav.canPop()) {
    nav.pop();
  } else {
    context.go(Routes.home);
  }
}

/// يمنع زرّ الرجوع العتاديّ من الخروج من التطبيق حين لا يكون تحت
/// الشاشة شيء — يذهب إلى الرئيسية بدلاً من ذلك.
class PopsToHome extends StatelessWidget {
  const PopsToHome({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => PopScope(
        canPop: Navigator.of(context).canPop(),
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) navigateTo(Routes.home);
        },
        child: child,
      );
}

/// الموقع الحاليّ — لمقارنة الوجهة المعلّقة قبل تنفيذها.
String? get currentLocation {
  final ctx = _rootKey.currentContext;
  if (ctx == null) return null;
  return GoRouter.of(ctx).routeInformationProvider.value.uri.toString();
}

class _SilentRedirect extends StatelessWidget {
  const _SilentRedirect();

  @override
  Widget build(BuildContext context) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!context.mounted) return;
      context.go(AppState.instance.session == SessionState.authenticated
          ? Routes.home
          : Routes.login);
    });
    return const Scaffold(backgroundColor: Noir.pitchBlack);
  }
}
