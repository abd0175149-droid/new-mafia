import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/config.dart';
import '../../app/router.dart';
import '../../core/cosmetics/cosmetics_service.dart';
import '../../core/notifications/inbox_service.dart';
import '../../core/ui/atmosphere.dart';
import 'bottom_nav.dart';

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

class _ShellScreenState extends State<ShellScreen> {
  @override
  void initState() {
    super.initState();
    // صندوق الإشعارات يبدأ مع الغلاف — الجرس في ترويسة الرئيسية يقرأ
    // عدّه، فلا بدّ أن يعمل قبل أوّل بناء لها.
    InboxService.instance.start();
    // والمظهر كذلك: بطاقة الملفّ الشخصيّ تقرؤه، والبثّ يجب أن يكون
    // مشترَكاً فيه قبل أن يُجهّز اللاعب عنصراً من الخزنة.
    CosmeticsService.instance.start();
  }

  @override
  void dispose() {
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
    return Scaffold(
      // المحتوى يمتدّ خلف الشريط، والتبويبات تعطي حشوة سفلية 80
      extendBody: true,
      body: DisplayBg(child: widget.shell),
      bottomNavigationBar:
          MafiaBottomNav(index: widget.shell.currentIndex, onTap: _select),
    );
  }
}
