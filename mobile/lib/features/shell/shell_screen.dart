import 'package:flutter/material.dart';

import '../../app/config.dart';
import '../../app/theme/theme.dart';
import '../../core/ui/atmosphere.dart';
import '../home/home_screen.dart';
import '../profile/profile_screen.dart';
import '../rank/rank_screen.dart';
import 'bottom_nav.dart';

// ══════════════════════════════════════════════════════
// 🏠 الغلاف الطبيعيّ — §4.7 في الملفّ 11
// ══════════════════════════════════════════════════════
// خمسة فروع في IndexedStack: كل تبويب يحتفظ بحالته وموضع تمريره عند
// التبديل — فرقٌ مقصود عن الويب الذي يعيد بناء الصفحة في كل تنقّل.

class ShellScreen extends StatefulWidget {
  const ShellScreen({super.key, required this.config, required this.onLoggedOut});

  final AppConfig config;
  final VoidCallback onLoggedOut;

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen> {
  int _index = 0;

  /// الملفّ الشخصيّ يحفظ حالته داخل IndexedStack، والويب يعيد بناء
  /// الصفحة عند كل تنقّل. المفتاح يتيح جلباً صريحاً عند العودة للتبويب
  /// حتى لا يقرأ اللاعب رتبةً قديمة بعد مباراة.
  final _profileKey = GlobalKey<ProfileScreenState>();
  final _rankKey = GlobalKey<RankScreenState>();

  static const _rankTab = 3;
  static const _profileTab = 4;

  void _select(int i) {
    setState(() => _index = i);
    if (i == _profileTab) _profileKey.currentState?.reload();
    // اللوحة تتغيّر بعد كل مباراة — العودة إليها تعني «أرني RR الجديد»
    if (i == _rankTab) _rankKey.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // المحتوى يمتدّ خلف الشريط، والتبويبات تعطي حشوة سفلية 80
      extendBody: true,
      body: DisplayBg(
        child: IndexedStack(
          // يملأ الجسم كاملاً — وإلا سُحِب الشريط للأعلى معه
          sizing: StackFit.expand,
          index: _index,
          children: [
            const HomeScreen(),
            const _TabPlaceholder(title: 'الألعاب', icon: Icons.sports_esports_outlined, file: '14-games-invites.md'),
            const _TabPlaceholder(title: 'ادخل', icon: Icons.verified_user_outlined, file: '21-join-lobby.md'),
            RankScreen(key: _rankKey),
            ProfileScreen(
              key: _profileKey,
              config: widget.config,
              onLoggedOut: widget.onLoggedOut,
            ),
          ],
        ),
      ),
      bottomNavigationBar: MafiaBottomNav(index: _index, onTap: _select),
    );
  }
}

/// تبويب لم يُبنَ بعد — يقول أيّ ملفّ مواصفة يملؤه، فلا يُقرأ عطلاً.
class _TabPlaceholder extends StatelessWidget {
  const _TabPlaceholder({required this.title, required this.icon, required this.file});

  final String title;
  final IconData icon;
  final String file;

  @override
  Widget build(BuildContext context) => SafeArea(
        child: Center(
          child: Padding(
            // 80dp سفليّ كي لا يغطّي الشريط المحتوى
            padding: const EdgeInsets.only(bottom: 80, left: 24, right: 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 56, color: MafiaScales.dark[700]),
                const SizedBox(height: 16),
                Text(title, style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 8),
                Text('يُبنى في M3',
                    style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 4),
                // اسم ملفّ لاتينيّ داخل واجهة RTL يُقلب بصرياً
                // («12-home.md» تُقرأ «home.md-12»). نصّ لاتينيّ محض
                // يُلفّ باتجاهه دائماً — نفس قاعدة حقل الهاتف.
                Directionality(
                  textDirection: TextDirection.ltr,
                  child: Text(file, style: monoStyle(size: 11, color: MafiaScales.dark[600]!)),
                ),
              ],
            ),
          ),
        ),
      );
}
