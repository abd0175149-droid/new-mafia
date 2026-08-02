import 'package:flutter/material.dart';

import '../../app/theme/theme.dart';

// ══════════════════════════════════════════════════════
// 🧭 شريط التنقّل السفليّ — §4.6 في الملفّ 11
// ══════════════════════════════════════════════════════
// خمسة تبويبات، أوسطها زرّ مرفوع. الترتيب في المصفوفة هو ترتيب الويب،
// وRTL يقلبه تلقائياً فيبدأ من اليمين — لا تعكس المصفوفة يدوياً.

class NavTab {
  const NavTab(this.label, this.icon);
  final String label;
  final IconData icon;
}

const navTabs = <NavTab>[
  NavTab('الرئيسية', Icons.home_outlined),
  NavTab('الألعاب', Icons.sports_esports_outlined),
  NavTab('ادخل', Icons.verified_user_outlined), // الزرّ المركزيّ
  NavTab('التصنيف', Icons.star_outline),
  NavTab('حسابي', Icons.person_outline),
];

const int kCenterTab = 2;

class MafiaBottomNav extends StatelessWidget {
  const MafiaBottomNav({super.key, required this.index, required this.onTap});

  final int index;
  final void Function(int) onTap;

  static const _active = Color(0xFFFBBF24);
  static const _idle = Color(0xFF6B7280);

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xF20A0A0A), Color(0xFF050505)],
        ),
        border: Border(top: BorderSide(color: Color(0x26FBBF24))),
      ),
      child: SafeArea(
        top: false,
        // 🔴 heightFactor: 1 إلزاميّ. الـScaffold يمرّر لشريط التنقّل قيوداً
        //    **فضفاضة** بارتفاع الشاشة كلّها، وCenter بلا معامل ارتفاع
        //    يتمدّد إلى أقصى المسموح — فيصير الشريط بارتفاع ٢٥٦٠ ومحتواه
        //    في منتصف الشاشة، وتدرّجه المعتم يغطّي محتوى التبويب كلّه.
        //    رأيته على الجهاز: شريط عائم في الوسط وتبويبات فارغة.
        //    المعامل يجعله يلتفّ حول ابنه رأسياً ويوسّطه أفقياً فقط.
        child: Center(
          heightFactor: 1,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 512),
            child: SizedBox(
              // ⚠️ الارتفاع 64 هو ارتفاع **الشريط**، والزرّ المركزيّ أطول
              //    منه (٥٦ دائرة + ٤ فجوة + سطر تسمية) ومرفوع ٢٠ فوقه.
              //    وضعه داخل الصفّ يجعله يطالب بارتفاع لا يملكه الشريط،
              //    فيظهر «BOTTOM OVERFLOWED» — رأيته على الجهاز.
              //    الحلّ: الصفّ يحمل خانةً فارغة مكانه، والزرّ يُركَّب فوق
              //    المكدّس بلا قصّ.
              height: 64,
              child: Stack(
                clipBehavior: Clip.none,
                alignment: Alignment.topCenter,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      for (var i = 0; i < navTabs.length; i++)
                        i == kCenterTab
                            ? const SizedBox(width: 56)   // خانة الزرّ المركزيّ
                            : _PlainTab(
                                tab: navTabs[i],
                                active: index == i,
                                onTap: () => onTap(i),
                              ),
                    ],
                  ),

                  // مؤشّر النشاط — ينزلق بين التبويبات، ولا يظهر فوق المركزيّ
                  if (index != kCenterTab)
                    AnimatedPositioned(
                      duration: const Duration(milliseconds: 300),
                      curve: Curves.easeOutCubic,
                      top: 0,
                      right: _indicatorOffset(context, index),   // RTL: صفر أقصى اليمين
                      child: Container(
                        width: 20,
                        height: 2,
                        decoration: BoxDecoration(
                          color: _active,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),

                  // الزرّ المركزيّ فوق كل شيء — يرتفع خارج حدود الشريط
                  Positioned(
                    top: -20,
                    child: _CenterTab(
                      tab: navTabs[kCenterTab],
                      active: index == kCenterTab,
                      onTap: () => onTap(kCenterTab),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// مركز التبويب النشط مقيساً من اليمين.
  double _indicatorOffset(BuildContext context, int i) {
    final w = MediaQuery.sizeOf(context).width;
    final barW = w > 512 ? 512.0 : w;
    final slot = barW / navTabs.length;
    return slot * i + slot / 2 - 10;
  }
}

class _PlainTab extends StatelessWidget {
  const _PlainTab({required this.tab, required this.active, required this.onTap});

  final NavTab tab;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = active ? MafiaBottomNav._active : MafiaBottomNav._idle;
    return InkWell(
      onTap: onTap,
      borderRadius: NoirRadius.soft,
      child: Container(
        constraints: const BoxConstraints(minWidth: 56),
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(tab.icon, size: 22, color: c),
            const SizedBox(height: 4),
            Text(tab.label,
                style: TextStyle(fontFamily: 'Tajawal', fontSize: 10, color: c, letterSpacing: 0)),
          ],
        ),
      ),
    );
  }
}

/// الزرّ المركزيّ «ادخل» — مرفوع 20dp فوق الشريط.
class _CenterTab extends StatefulWidget {
  const _CenterTab({required this.tab, required this.active, required this.onTap});

  final NavTab tab;
  final bool active;
  final VoidCallback onTap;

  @override
  State<_CenterTab> createState() => _CenterTabState();
}

class _CenterTabState extends State<_CenterTab> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final a = widget.active;
    final labelColor = a ? MafiaBottomNav._active : MafiaBottomNav._idle;

    return GestureDetector(
      onTapDown: (_) => setState(() => _down = true),
      onTapUp: (_) => setState(() => _down = false),
      onTapCancel: () => setState(() => _down = false),
      onTap: widget.onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedScale(
          scale: _down ? 0.9 : 1,
          duration: const Duration(milliseconds: 100),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: a
                        ? const [Color(0xFFFBBF24), Color(0xFFB45309)]
                        : const [Color(0xFF1A1A2E), Color(0xFF16213E)],
                  ),
                  border: Border.all(color: const Color(0x99FBBF24), width: 2),
                  boxShadow: a
                      ? const [
                          BoxShadow(color: Color(0x66FBBF24), blurRadius: 20),
                          BoxShadow(color: Color(0x80000000), blurRadius: 15, offset: Offset(0, 4)),
                        ]
                      : const [
                          BoxShadow(color: Color(0x26FBBF24), blurRadius: 10),
                          BoxShadow(color: Color(0x80000000), blurRadius: 10, offset: Offset(0, 4)),
                        ],
                ),
                child: Icon(
                  a ? Icons.verified_user : Icons.verified_user_outlined,
                  size: 28,
                  color: a ? const Color(0xFFB45309) : const Color(0xFFFBBF24),
                ),
              ),
              const SizedBox(height: 4),
              Text(widget.tab.label,
                  style: TextStyle(
                      fontFamily: 'Tajawal', fontSize: 10, color: labelColor, letterSpacing: 0)),
            ],
          ),
        ),
      );
  }
}
