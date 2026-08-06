import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:go_router/go_router.dart';

import '../../app/config.dart';
import '../../app/router.dart';
import '../../core/cosmetics/cosmetics_service.dart';
import '../../core/notifications/inbox_service.dart';
import '../../core/ui/atmosphere.dart';
import '../../core/ui/glass_tier.dart';
import 'liquid_glass_nav.dart';

// ══════════════════════════════════════════════════════
// 🏠 الغلاف الطبيعيّ — §4.7 في الملفّ 11
// ══════════════════════════════════════════════════════
// خمسة فروع في StatefulShellRoute.indexedStack: كل تبويب يحتفظ بحالته
// وموضع تمريره وبمكدّس تنقّله — فرقٌ مقصود عن الويب الذي يعيد بناء
// الصفحة في كل تنقّل.

class ShellScreen extends StatefulWidget {
  const ShellScreen({super.key, required this.config, required this.shell});

  final AppConfig config;
  final StatefulNavigationShell shell;

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen>
    with SingleTickerProviderStateMixin {
  // الكبسولة الزجاجيّة صارت **للمنصّتين** (قرار المالك — 95 §4):
  // الهندسة والحركة واحدة، والمادّة وحدها تتدرّج عبر GlassQuality —
  // تابلتات النادي الضعيفة تأخذ الدرجة الخفيفة (تعبئة شفيفة بلا أيّ
  // blur)، فقيد 11 §13 محفوظ حيث وُلد لا كحظرٍ شامل على المنصّة.
  // الشريط الكلاسيكيّ MafiaBottomNav تقاعد (ق4: شريطان بهندستين =
  // هوية مشطورة).

  /// 0 ممتدّ ← 1 منكمش.
  //
  // 🔴 يُنشأ في initState لا بـ`late final` مؤجَّل. على الأندرويد لا يلمسه
  //    البناء إطلاقاً (لا شريط زجاجيّ)، فيبقى غير مُهيَّأ حتى ينادَي في
  //    dispose — وعندها يبحث Ticker عن TickerMode في عنصرٍ مُعطَّل فيرمي
  //    «Looking up a deactivated widget's ancestor is unsafe». أي انهيارٌ
  //    على الأندرويد وحده عند مغادرة الغلاف. اصطاده اختبار الأندرويد.
  late final AnimationController _navCollapse;

  /// التمرير للأسفل يطوي الشريط إلى أيقونات، والصعود يعيد التسميات.
  bool _onScroll(UserScrollNotification n) {
    if (n.metrics.axis != Axis.vertical) return false;
    if (n.direction == ScrollDirection.reverse) {
      _navCollapse.forward();
    } else if (n.direction == ScrollDirection.forward) {
      _navCollapse.reverse();
    }
    return false; // لا يُبتلع الإشعار — غيره قد يستمع إليه
  }

  @override
  void initState() {
    super.initState();
    _navCollapse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 220),
    );
    // صندوق الإشعارات يبدأ مع الغلاف — الجرس في ترويسة الرئيسية يقرأ
    // عدّه، فلا بدّ أن يعمل قبل أوّل بناء لها.
    InboxService.instance.start();
    // والمظهر كذلك: بطاقة الملفّ الشخصيّ تقرؤه، والبثّ يجب أن يكون
    // مشترَكاً فيه قبل أن يُجهّز اللاعب عنصراً من الخزنة.
    CosmeticsService.instance.start();
  }

  @override
  void dispose() {
    _navCollapse.dispose();
    InboxService.instance.stop();
    CosmeticsService.instance.stop();
    super.dispose();
  }

  void _select(int i) {
    // 🔴 `initialLocation: true` عند إعادة نقر التبويب النشط: يعيده إلى
    //    جذره. بدونها يبقى اللاعب عالقاً في شاشةٍ فرعية (السجل مثلاً)
    //    ونقر التبويب لا يفعل شيئاً — وهو ما يفعله كل تطبيق آخر.
    widget.shell.goBranch(i, initialLocation: i == widget.shell.currentIndex);

    // الفرع محفوظ الحالة، فلا يُعيد الجلب بنفسه — نطلبه صراحةً
    if (i == 1) gamesTabKey.currentState?.reload();
    if (i == 3) rankTabKey.currentState?.reload();
    if (i == 4) profileTabKey.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    // تغيير «جودة الواجهة» من الإعدادات يعيد بناء الغلاف بمن فيه —
    // حدثٌ نادر، فلا كلفة تُذكر لإعادة البناء الشاملة.
    return ValueListenableBuilder<GlassTier>(
      valueListenable: GlassQuality.notifier,
      builder: (context, _, __) => Scaffold(
        // المحتوى يمتدّ خلف الشريط، والتبويبات تعطي حشوة سفلية 80
        extendBody: true,
        // يلتقط تمرير أيّ تبويب من موضع واحد — لا حاجة للمساس
        // بالشاشات الخمس ولا بمكدّسات تنقّلها.
        body: NotificationListener<UserScrollNotification>(
          onNotification: _onScroll,
          child: DisplayBg(child: widget.shell),
        ),
        bottomNavigationBar: AnimatedBuilder(
          animation: _navCollapse,
          builder: (_, __) => LiquidGlassNav(
            index: widget.shell.currentIndex,
            onTap: _select,
            collapsed: _navCollapse.value,
          ),
        ),
      ),
    );
  }
}
