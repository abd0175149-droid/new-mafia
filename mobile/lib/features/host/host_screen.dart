import 'package:flutter/material.dart';

import '../../core/ui/atmosphere.dart';
import '../profile/profile_palette.dart' show ar;
import 'host_controller.dart';
import 'host_create_screen.dart';
import 'host_lobby_screen.dart';
import 'host_binding_screen.dart';
import 'host_roles_screen.dart';

// ══════════════════════════════════════════════════════
// 🌐 كونسول المضيف — القشرة (الملفّ 30)
// ══════════════════════════════════════════════════════
// شاشةٌ واحدة تتبدّل بين الإنشاء واللوبي حسب حالة المتحكّم — لا `Navigator`
// بينهما: المتحكّم يستطلع حالة الغرفة كلّ ٢٫٥ ثانية، ودفعُ كلّ طورٍ كمسارٍ
// يفكّ الشجرة فيضيع الاستطلاع. (القاعدة نفسها في شاشة اللعب — الملفّ 21.)

class HostScreen extends StatefulWidget {
  const HostScreen({super.key});

  @override
  State<HostScreen> createState() => _HostScreenState();
}

class _HostScreenState extends State<HostScreen> {
  final _c = HostController.instance;

  @override
  void initState() {
    super.initState();
    _c.addListener(_onChange);
  }

  @override
  void dispose() {
    _c.removeListener(_onChange);
    super.dispose();
  }

  void _onChange() => mounted ? setState(() {}) : null;

  @override
  Widget build(BuildContext context) {
    final step = _c.step;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: DisplayBg(
        child: SafeArea(
          bottom: false,
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Row(children: [
                IconButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.arrow_back, color: Color(0xFF888888)),
                ),
                Expanded(
                  child: Text(
                    switch (step) {
                      HostStep.create => 'استضافة عن بُعد',
                      HostStep.lobby => 'لوبي الاستضافة',
                      HostStep.roleGeneration => 'تركيبة الأدوار',
                      HostStep.roleBinding => 'إسناد الأدوار',
                      HostStep.inGame => 'إدارة اللعبة',
                    },
                    textAlign: TextAlign.center,
                    style: ar(15, color: Colors.white, weight: FontWeight.w900),
                  ),
                ),
                const SizedBox(width: 48),
              ]),
            ),
            Expanded(
              child: switch (step) {
                HostStep.create => const HostCreateScreen(),
                HostStep.lobby => const HostLobbyScreen(),
                HostStep.roleGeneration => const HostRolesScreen(),
                HostStep.roleBinding => const HostBindingScreen(),
                // الإسناد وأطوار اللعب شريحةٌ تالية — تُعرض حالةٌ
                // صريحة بدل شاشةٍ فارغة تُوهم بعطل.
                _ => const _ComingNext(),
              },
            ),
          ]),
        ),
      ),
    );
  }
}

/// طورٌ يتجاوز ما بُني — شاشةٌ صريحة لا فراغ.
class _ComingNext extends StatelessWidget {
  const _ComingNext();

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('🎴', style: TextStyle(fontSize: 40)),
              const SizedBox(height: 12),
              Text('اللعبة انطلقت على الخادم',
                  textAlign: TextAlign.center,
                  style: ar(15, color: Colors.white, weight: FontWeight.w900)),
              const SizedBox(height: 8),
              Text(
                'إسناد الأدوار وأطوار اللعب من الكونسول شريحةٌ تالية. '
                'يمكنك متابعة الجولة من كونسول الويب حتى تصل.',
                textAlign: TextAlign.center,
                style: ar(12, color: const Color(0xFF9A9A9A)),
              ),
            ],
          ),
        ),
      );
}
