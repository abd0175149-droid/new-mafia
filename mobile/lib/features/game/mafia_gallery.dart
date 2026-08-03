import 'dart:ui' show ImageFilter;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../models/game.dart';
import '../../models/profile.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🕵️ معرض التعرّف على المافيا — §4.5 · §4.6 في الملفّ ٢٢
// ══════════════════════════════════════════════════════
// أربع واجهاتٍ فرعية بترتيبٍ ثابت: لوحة «رابط الدم» فوق أيّها كان، ثم
// عقود السفّاح **أو** شبكة الشركاء **أو** الملفّ الاستخباراتي التمويهيّ.
//
// 🔒 الواجهة التمويهية ليست حشواً: بدونها يعرف كلّ من فتح المعرض ولم يرَ
//    شيئاً أنّه ليس مافيا — وهذا في حدّ ذاته تسريبُ معلومة لجاره الذي
//    يراقب شاشته. فالمواطن يرى «ملفاً استخباراتياً» يشبه واجهةً حقيقية.

const _blood = Color(0xFF8A0303);
const _bloodBg = Color(0xFF1A0505);

/// أيقونات الأدوار — `ROLE_ICONS` حرفياً.
///
/// ⚠️ مفردات آمنة بلا ZWJ: `🧙‍♀️` و`👮‍♀️` تتفكّكان على أندرويد القديم
///    فتظهران رمزين منفصلين.
const roleIcons = <String, String>{
  'GODFATHER': '🔪',
  'SILENCER': '🤐',
  'CHAMELEON': '🦎',
  'WITCH': '🔮',
  'OLDER_BROTHER': '👥',
  'MAFIA_REGULAR': '🎭',
  'SHERIFF': '🔍',
  'DOCTOR': '💉',
  'SNIPER': '🎯',
  'POLICEWOMAN': '👮',
  'NURSE': '🏥',
  'MAYOR': '🎩',
  'CITIZEN': '👤',
  'YOUNGER_BROTHER': '👥',
  'JESTER': '🤡',
  'ASSASSIN': '🔪',
};

String roleIcon(String? id) => roleIcons[id] ?? '🎭';

/// يفتح المعرض. الحاجز والدخول مطابقان للويب: تلاشٍ + `scale .95→1` مع
/// إزاحةٍ رأسيّة 20px.
Future<void> showMafiaGallery(
  BuildContext context, {
  required List<MafiaMate> team,
  SiblingInfo? sibling,
  bool isAssassin = false,
  AssassinContracts? contracts,
}) =>
    showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'إغلاق',
      barrierColor: const Color(0xCC000000),
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (_, __, ___) => MafiaTeamGallery(
        team: team,
        sibling: sibling,
        isAssassin: isAssassin,
        contracts: contracts,
      ),
      transitionBuilder: (_, a, __, child) {
        final c = CurvedAnimation(parent: a, curve: Curves.easeOutCubic);
        return FadeTransition(
          opacity: c,
          child: SlideTransition(
            position: Tween(begin: const Offset(0, 0.05), end: Offset.zero)
                .animate(c),
            child: ScaleTransition(
                scale: Tween(begin: 0.95, end: 1.0).animate(c), child: child),
          ),
        );
      },
    );

class MafiaTeamGallery extends StatelessWidget {
  const MafiaTeamGallery({
    super.key,
    this.team = const [],
    this.sibling,
    this.isAssassin = false,
    this.contracts,
  });

  final List<MafiaMate> team;
  final SiblingInfo? sibling;
  final bool isAssassin;
  final AssassinContracts? contracts;

  @override
  Widget build(BuildContext context) {
    // ⚠️ `showGeneralDialog` لا يوفّر Material — بدونه يُرسم كلّ نصٍّ
    //    بخطٍّ أصفر تحته (ديباغ الويدجت الحرّ).
    return Material(
      type: MaterialType.transparency,
      child: Directionality(
        textDirection: TextDirection.rtl,
        child: Stack(children: [
          // الحاجز: ضبابٌ + نقرةٌ تُغلق. بلا الضباب يقرأ العينُ ما خلف
          // المودال فيزاحم النصَّ — والويب يضع `backdrop-blur-md`.
          Positioned.fill(
            child: GestureDetector(
              onTap: () => Navigator.of(context).maybePop(),
              behavior: HitTestBehavior.opaque,
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                child: const ColoredBox(color: Color(0x66000000)),
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 384),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 56, 16, 24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (sibling != null) _BloodLink(sibling: sibling!),
                      if (isAssassin && contracts != null)
                        _AssassinView(contracts: contracts!)
                      else if (team.isNotEmpty)
                        _TeamGrid(team: team)
                      else
                        const _DecoyBriefing(),
                    ],
                  ),
                ),
              ),
            ),
          ),
          // زرّ الإغلاق مثبَّتٌ على الشاشة لا على المحتوى المتمرّر (44px)
          Positioned(
            top: 12,
            right: 12,
            child: SafeArea(
              child: Material(
                color: _bloodBg,
                shape: CircleBorder(
                    side: BorderSide(color: _blood.withValues(alpha: 0.5))),
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: () => Navigator.of(context).maybePop(),
                  child: const SizedBox(
                    width: 44,
                    height: 44,
                    child: Icon(Icons.close, size: 24, color: _blood),
                  ),
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════
// ① لوحة «رابط الدم»
// ══════════════════════════════════════════════════════
class _BloodLink extends StatelessWidget {
  const _BloodLink({required this.sibling});
  final SiblingInfo sibling;

  static const _purple = Color(0xFFA855F7);

  @override
  Widget build(BuildContext context) {
    final dead = !sibling.isAlive;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _purple.withValues(alpha: 0.4)),
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF1A0820), Color(0xFF0D0212)],
        ),
        boxShadow: [
          BoxShadow(
              color: const Color(0xFF7C3AED).withValues(alpha: 0.25),
              blurRadius: 20),
        ],
      ),
      child: Column(children: [
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Text('🩸', style: TextStyle(fontSize: 18)),
          const SizedBox(width: 8),
          Text('رابط الدم',
              style: const TextStyle(
                fontFamily: 'Amiri',
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Color(0xFFD8B4FE),
                letterSpacing: 0,
              )),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          _Avatar(
            url: sibling.avatarUrl,
            role: sibling.role,
            physicalId: sibling.physicalId,
            size: 64,
            ring: _purple.withValues(alpha: 0.6),
            badge: const Color(0xFF9333EA),
            badgeSize: 24,
            badgeFont: 10,
            grayscale: dead,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(sibling.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ar(14, weight: FontWeight.bold)),
                const SizedBox(height: 2),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(999),
                    color: _purple.withValues(alpha: 0.1),
                    border:
                        Border.all(color: _purple.withValues(alpha: 0.3)),
                  ),
                  child: Text(
                      roleNameAr(sibling.role) + (dead ? ' (متوفّى)' : ''),
                      style: mono(11, color: const Color(0xFFD8B4FE))),
                ),
              ],
            ),
          ),
        ]),
        const SizedBox(height: 12),
        Text(
          sibling.recipientIsMafia
              ? 'هذا أخوك الأصغر (مواطن) — لا يعرفه باقي المافيا. إن قُتل، تنتحر حزناً عليه.'
              : 'هذا أخوك الأكبر (من المافيا) — يربطكما رابط الدم. إن قُتل، تنهض وتنضمّ إلى المافيا.',
          textAlign: TextAlign.center,
          style: ar(11,
              color: const Color(0xFFE9D5FF).withValues(alpha: 0.7),
              height: 1.6),
        ),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════
// ② واجهة السفّاح — عقود الاغتيال
// ══════════════════════════════════════════════════════
class _AssassinView extends StatelessWidget {
  const _AssassinView({required this.contracts});
  final AssassinContracts contracts;

  @override
  Widget build(BuildContext context) => Column(children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: _bloodBg,
            border: Border.all(color: _blood),
            boxShadow: [
              BoxShadow(color: _blood.withValues(alpha: 0.5), blurRadius: 15),
            ],
          ),
          child: const Icon(Icons.gps_fixed, size: 24, color: _blood),
        ),
        const SizedBox(height: 8),
        Text('عقود الاغتيال',
            style: const TextStyle(
              fontFamily: 'Amiri',
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Color(0xFFEF4444),
              letterSpacing: 3,
            )),
        const SizedBox(height: 4),
        Text('${contracts.completedCount}/${contracts.totalRequired} عقود مُنجزة',
            style: mono(12,
                color: const Color(0xFFEF4444).withValues(alpha: 0.6))),
        const SizedBox(height: 20),
        // شريط التقدّم — يتحرّك من الصفر إلى نسبته في 800ms
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: Container(
              height: 8,
              decoration: BoxDecoration(
                color: _bloodBg,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: _blood.withValues(alpha: 0.2)),
              ),
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: contracts.progress),
                duration: const Duration(milliseconds: 800),
                curve: Curves.easeOut,
                builder: (_, v, __) => FractionallySizedBox(
                  alignment: AlignmentDirectional.centerStart,
                  widthFactor: v,
                  heightFactor: 1,
                  child: Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                          colors: [Color(0xFF8A0303), Color(0xFFDC2626)]),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 20),
        for (final c in contracts.contracts) _Contract(contract: c),
      ]);
}

class _Contract extends StatelessWidget {
  const _Contract({required this.contract});
  final AssassinContract contract;

  @override
  Widget build(BuildContext context) {
    final done = contract.completed;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: done
                ? const Color(0xFF22C55E).withValues(alpha: 0.3)
                : _blood.withValues(alpha: 0.6),
            width: 2),
        gradient: LinearGradient(
          begin: AlignmentDirectional.centerStart,
          end: AlignmentDirectional.centerEnd,
          colors: done
              ? [
                  const Color(0xFF052E16).withValues(alpha: 0.3),
                  const Color(0xFF052E16).withValues(alpha: 0.1),
                ]
              : [_bloodBg, const Color(0xFF0D0202)],
        ),
        boxShadow: done
            ? null
            : [BoxShadow(color: _blood.withValues(alpha: 0.3), blurRadius: 20)],
      ),
      child: Row(children: [
        Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: done
                ? const Color(0xFF22C55E).withValues(alpha: 0.2)
                : _blood.withValues(alpha: 0.2),
            border: Border.all(
                color: done
                    ? const Color(0xFF22C55E).withValues(alpha: 0.5)
                    : _blood,
                width: done ? 1 : 2),
          ),
          child: done
              ? const Text('✅', style: TextStyle(fontSize: 14))
              : const _PulsingKnife(),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(contract.text,
                  style: ar(14,
                          weight: FontWeight.bold,
                          color: done ? const Color(0xFF4ADE80) : Colors.white)
                      .copyWith(
                    decoration: done ? TextDecoration.lineThrough : null,
                    decorationColor: const Color(0xFF4ADE80),
                  )),
              if (done && contract.completedAtRound != null) ...[
                const SizedBox(height: 2),
                Text('أُنجز في الجولة ${contract.completedAtRound}',
                    style: mono(10,
                        color:
                            const Color(0xFF22C55E).withValues(alpha: 0.6))),
              ] else if (!done) ...[
                const SizedBox(height: 2),
                Text('اقتل صاحب هذا الدور!',
                    style: mono(10,
                        color:
                            const Color(0xFFF87171).withValues(alpha: 0.6))),
              ],
            ],
          ),
        ),
      ]),
    );
  }
}

/// سكّينٌ نابضة — `scale [1, 1.2, 1]` كلّ 1.5s بلا انقطاع.
class _PulsingKnife extends StatefulWidget {
  const _PulsingKnife();
  @override
  State<_PulsingKnife> createState() => _PulsingKnifeState();
}

class _PulsingKnifeState extends State<_PulsingKnife>
    with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1500))
    ..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // «تقليل الحركة» يُطفئ النبض — لا يُخفي السكّين
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      return const Text('🔪', style: TextStyle(fontSize: 14));
    }
    return ScaleTransition(
      scale: Tween(begin: 1.0, end: 1.2)
          .animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut)),
      child: const Text('🔪', style: TextStyle(fontSize: 14)),
    );
  }
}

// ══════════════════════════════════════════════════════
// ③ شبكة فريق المافيا
// ══════════════════════════════════════════════════════
class _TeamGrid extends StatelessWidget {
  const _TeamGrid({required this.team});
  final List<MafiaMate> team;

  @override
  Widget build(BuildContext context) => Column(children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: _bloodBg,
            border: Border.all(color: _blood),
            boxShadow: [
              BoxShadow(color: _blood.withValues(alpha: 0.5), blurRadius: 20),
            ],
          ),
          child: const Icon(Icons.groups, size: 28, color: _blood),
        ),
        const SizedBox(height: 8),
        const Text('شركاؤك',
            style: TextStyle(
              fontFamily: 'Amiri',
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Color(0xFFEF4444),
              letterSpacing: 3,
            )),
        const SizedBox(height: 4),
        Text('${team.length} في الفريق',
            style: mono(10,
                    color: const Color(0xFFEF4444).withValues(alpha: 0.4))
                .copyWith(letterSpacing: 2)),
        const SizedBox(height: 16),
        // عمودان — تعليق الكود في الويب يقول ثلاثة لكنّ الصنف `grid-cols-2`
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 4),
          itemCount: team.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            // 72 أفاتار + اسم + chip دور + حشوة — أطول من عرضه
            mainAxisExtent: 168,
          ),
          itemBuilder: (_, i) => _MateTile(mate: team[i]),
        ),
      ]);
}

class _MateTile extends StatelessWidget {
  const _MateTile({required this.mate});
  final MafiaMate mate;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _blood.withValues(alpha: 0.3)),
          gradient: const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF1A0808), Color(0xFF0A0101)],
          ),
          boxShadow: [
            BoxShadow(color: _blood.withValues(alpha: 0.15), blurRadius: 12),
          ],
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          _Avatar(
            url: mate.avatarUrl,
            role: mate.role,
            physicalId: mate.physicalId,
            size: 72,
            ring: _blood.withValues(alpha: 0.6),
            badge: _blood,
            badgeSize: 28,
            badgeFont: 11,
          ),
          const SizedBox(height: 12),
          Text(mate.name,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: ar(12, weight: FontWeight.bold, height: 1.2)),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              color: _blood.withValues(alpha: 0.1),
              border: Border.all(color: _blood.withValues(alpha: 0.2)),
            ),
            child: Text(roleNameAr(mate.role),
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: ar(10,
                    color: const Color(0xFFF87171).withValues(alpha: 0.8),
                    height: 1.2)),
          ),
        ]),
      );
}

// ══════════════════════════════════════════════════════
// ④ الواجهة التمويهية — «ملفّ استخباراتي»
// ══════════════════════════════════════════════════════
class _DecoyBriefing extends StatelessWidget {
  const _DecoyBriefing();

  static const _tips = <(IconData, String, String)>[
    (Icons.visibility_outlined, 'راقب ردود فعل اللاعبين أثناء النقاش',
        'التوتر المفاجئ قد يكشف المافيا'),
    (Icons.chat_bubble_outline, 'انتبه لمن يُوجّه الاتهامات بدون دليل',
        'المافيا تحاول تشتيت الانتباه'),
    (Icons.how_to_vote_outlined, 'صوّت بحكمة بناءً على الملاحظات',
        'لا تتبع القطيع — فكّر بنفسك'),
    (Icons.shield_outlined, 'لا تكشف دورك حتى لو ضُغط عليك',
        'الصمت أحياناً أقوى سلاح'),
  ];

  @override
  Widget build(BuildContext context) => Column(children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: _bloodBg,
            border: Border.all(color: _blood),
            boxShadow: [
              BoxShadow(color: _blood.withValues(alpha: 0.5), blurRadius: 15),
            ],
          ),
          child: const Icon(Icons.shield_outlined, size: 24, color: _blood),
        ),
        const SizedBox(height: 8),
        const Text('ملف استخباراتي',
            style: TextStyle(
              fontFamily: 'Amiri',
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Color(0xFFEF4444),
              letterSpacing: 3,
            )),
        const SizedBox(height: 4),
        Text('INTELLIGENCE BRIEFING',
            textDirection: TextDirection.ltr,
            style: mono(10,
                    color: const Color(0xFFEF4444).withValues(alpha: 0.4))
                .copyWith(letterSpacing: 2)),
        const SizedBox(height: 20),
        for (final (icon, title, sub) in _tips)
          Container(
            width: double.infinity,
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _blood.withValues(alpha: 0.2)),
              gradient: LinearGradient(
                begin: AlignmentDirectional.centerStart,
                end: AlignmentDirectional.centerEnd,
                colors: [
                  _bloodBg.withValues(alpha: 0.8),
                  const Color(0xFF0D0202).withValues(alpha: 0.5),
                ],
              ),
            ),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  color: _blood.withValues(alpha: 0.1),
                  border: Border.all(color: _blood.withValues(alpha: 0.3)),
                ),
                child: Icon(icon, size: 18, color: const Color(0xFFF87171)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: ar(12, weight: FontWeight.bold)),
                    const SizedBox(height: 2),
                    Text(sub,
                        style: mono(10,
                            color: const Color(0xFFEF4444)
                                .withValues(alpha: 0.4))),
                  ],
                ),
              ),
            ]),
          ),
      ]);
}

// ══════════════════════════════════════════════════════
// 🖼️ أفاتار بشارة مقعد
// ══════════════════════════════════════════════════════
class _Avatar extends StatelessWidget {
  const _Avatar({
    required this.url,
    required this.role,
    required this.physicalId,
    required this.size,
    required this.ring,
    required this.badge,
    required this.badgeSize,
    required this.badgeFont,
    this.grayscale = false,
  });

  final String? url;
  final String role;
  final int physicalId;
  final double size;
  final Color ring;
  final Color badge;
  final double badgeSize;
  final double badgeFont;
  final bool grayscale;

  @override
  Widget build(BuildContext context) {
    Widget inner = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFF0D0202),
        border: Border.all(color: ring, width: 2),
        boxShadow: [
          BoxShadow(color: _blood.withValues(alpha: 0.3), blurRadius: 10),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: (url == null || url!.isEmpty)
          ? Text(roleIcon(role), style: TextStyle(fontSize: size * 0.42))
          : CachedNetworkImage(
              imageUrl: ApiClient.instance.upload(url),
              width: size,
              height: size,
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) =>
                  Text(roleIcon(role), style: TextStyle(fontSize: size * 0.42)),
              placeholder: (_, __) =>
                  const ColoredBox(color: Color(0xFF0D0202)),
            ),
    );

    if (grayscale) {
      // ميتٌ: رماديّ كامل + خفوت — كما `grayscale opacity-60`
      inner = Opacity(
        opacity: 0.6,
        child: ColorFiltered(
          colorFilter: const ColorFilter.matrix(<double>[
            0.2126, 0.7152, 0.0722, 0, 0, //
            0.2126, 0.7152, 0.0722, 0, 0, //
            0.2126, 0.7152, 0.0722, 0, 0, //
            0, 0, 0, 1, 0, //
          ]),
          child: inner,
        ),
      );
    }

    // الشارة تفيض على الحافة عمداً (`-top-1 -right-1`) — لذا `Clip.none`.
    // الحشوة العلوية في الحاوية تمنع قصّها.
    return Stack(clipBehavior: Clip.none, children: [
      inner,
      Positioned(
        top: -4,
        right: -4,
        child: Container(
          width: badgeSize,
          height: badgeSize,
          alignment: Alignment.center,
          decoration: BoxDecoration(shape: BoxShape.circle, color: badge),
          child: Text('$physicalId',
              style: mono(badgeFont, weight: FontWeight.w900)),
        ),
      ),
    ]);
  }
}
