import 'package:flutter/material.dart';

import '../../core/ui/atmosphere.dart';
import '../profile/profile_palette.dart' show ar;
import 'host_controller.dart';
import 'host_create_screen.dart';
import 'host_lobby_screen.dart';

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
    final inLobby = _c.step == HostStep.lobby;

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
                    inLobby ? 'لوبي الاستضافة' : 'استضافة عن بُعد',
                    textAlign: TextAlign.center,
                    style: ar(15, color: Colors.white, weight: FontWeight.w900),
                  ),
                ),
                const SizedBox(width: 48),
              ]),
            ),
            Expanded(
              child: inLobby ? const HostLobbyScreen() : const HostCreateScreen(),
            ),
          ]),
        ),
      ),
    );
  }
}
