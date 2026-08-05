import 'package:flutter/material.dart';

import '../../models/profile.dart';
import 'profile_palette.dart';

// ══════════════════════════════════════════════════════
// 📊 أقسام الملفّ الشخصيّ — §4.3.2 … §4.3.8 في الملفّ 13
// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
// §4.3.2 بطاقة تقدّم الرتبة
// ══════════════════════════════════════════════════════
class RankProgressCard extends StatelessWidget {
  const RankProgressCard({super.key, required this.progression});
  final PlayerProgression progression;

  @override
  Widget build(BuildContext context) {
    final rank = RankConfig.of(progression.rankTier);
    final currentIdx = RankConfig.indexOf(progression.rankTier);
    final remaining = progression.rrRequired - progression.rankRR;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: solidCard(border: rank.color.withValues(alpha: 0.125)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  cardTitle('الرتبة الحالية'),
                  const SizedBox(height: 6),
                  Row(children: [
                    Text(rank.icon, style: const TextStyle(fontSize: 24)),
                    const SizedBox(width: 8),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(rank.nameAr,
                            style: ar(14, color: rank.color, weight: FontWeight.w700)),
                        Text('تقدم الرتبة', style: ar(10, color: Tw.gray500)),
                      ],
                    ),
                  ]),
                ],
              ),
              const Spacer(),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  cardTitle('عن الرتب'),
                  const SizedBox(height: 6),
                  Row(children: [
                    for (var i = 0; i < RankConfig.ladder.length; i++) ...[
                      if (i > 0) const SizedBox(width: 8),
                      _tierPip(RankConfig.ladder[i], i, currentIdx),
                    ],
                  ]),
                ],
              ),
            ],
          ),
          const SizedBox(height: 14),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: ltrText('${progression.rankRR} / ${progression.rrRequired} RR',
                ar(10, color: Tw.gray500)),
          ),
          const SizedBox(height: 4),
          ProgressBar(
            value: progression.rankRR / progression.rrRequired,
            color: rank.color,
          ),
          const SizedBox(height: 6),
          Center(
            child: Text(
              remaining > 0
                  ? 'تحتاج ${ltrRun('$remaining RR')} للترقية'
                  : 'اكتمل RR الترقية',
              style: ar(10, color: Tw.gray600),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tierPip(RankConfig r, int i, int current) {
    final active = i == current;
    final past = i < current;
    return Opacity(
      opacity: active ? 1 : (past ? 0.5 : 0.25),
      // ⚠️ عرض ثابت إلزاميّ: الأيقونة ٢٤ والاسم («الأب الروحي») أعرض
      //    منها، وبلا قيدٍ تتراكب التسميات الخمس على الجهاز — رأيته.
      child: SizedBox(
        width: 46,
        child: Column(children: [
          Text(r.icon,
              style: TextStyle(
                fontSize: 24,
                shadows: active ? [Shadow(color: r.color, blurRadius: 6)] : null,
              )),
          Text(r.nameAr,
              textAlign: TextAlign.center,
              maxLines: 2,
              style: ar(7,
                  color: active ? r.color : Tw.gray600,
                  weight: active ? FontWeight.w700 : FontWeight.w400)),
        ]),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════
// §4.3.3 الأداء العام
// ══════════════════════════════════════════════════════
class PerformanceCard extends StatelessWidget {
  const PerformanceCard({super.key, required this.stats});
  final ProfileStats stats;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(20),
        decoration: solidCard(border: const Color(0x26FBBF24)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            cardTitle('الأداء العام'),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                _cell('🎮', '${stats.totalMatches}', 'المباريات', Colors.white),
                _cell('🏆', '${stats.totalWins}', 'فوز', Tw.emerald400),
                _cell('💀', '${stats.losses}', 'خسارة', Tw.rose400),
                Column(children: [
                  DonutRing(
                    percent: stats.winRate,
                    size: 72,
                    color: Tw.amber400,
                    glow: true,
                    child: Text('${stats.winRate}%',
                        style: num_(14, color: Tw.amber400)),
                  ),
                  const SizedBox(height: 4),
                  Text('معدل الفوز', style: ar(9, color: Tw.gray500)),
                ]),
              ],
            ),
          ],
        ),
      );

  Widget _cell(String emoji, String value, String label, Color color) => Column(
        children: [
          Text(emoji, style: const TextStyle(fontSize: 24)),
          const SizedBox(height: 2),
          Text(value, style: num_(24, color: color)),
          Text(label, style: ar(10, color: Tw.gray500)),
        ],
      );
}

// ══════════════════════════════════════════════════════
// §4.3.4 شبكة الإحصاءات الإضافية
// ══════════════════════════════════════════════════════
class ExtraStatsGrid extends StatelessWidget {
  const ExtraStatsGrid({super.key, required this.stats, required this.progression});
  final ProfileStats stats;
  final PlayerProgression progression;

  @override
  Widget build(BuildContext context) {
    final cells = <(String, String, Color)>[
      ('${stats.longestWinStreak}', '🔥 أطول سلسلة فوز', Tw.amber400),
      ('${stats.survivalRate}%', '🛡️ معدل النجاة', Tw.cyan400),
      ('${progression.successfulDeals}/${progression.totalDeals}', '🤝 الاتفاقيات', Tw.purple400),
    ];

    // 🔴 البطاقات الثلاث متساوية الارتفاع عبر IntrinsicHeight لا عبر
    //    `Row(crossAxisAlignment: stretch)`. الأخير يعني «خذ كامل
    //    الارتفاع المتاح»، وداخل شاشة تمرير الارتفاع المتاح **لانهائيّ** —
    //    فتنهار الشاشة كلها بلا رسم ولا استثناء ظاهر. كلّفتني هذه ساعة.
    return IntrinsicHeight(
      child: Row(
        children: [
        for (var i = 0; i < cells.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: solidCard(border: const Color(0x1FFBBF24), radius: 12),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(cells[i].$1, style: num_(20, color: cells[i].$3)),
                  const SizedBox(height: 4),
                  Text(cells[i].$2,
                      textAlign: TextAlign.center, style: ar(9, color: Tw.gray500)),
                ],
              ),
            ),
          ),
        ],
        ],
      ),
    );
  }
}

// ══════════════════════════════════════════════════════
// §4.3.5 تحليل الأداء
// ══════════════════════════════════════════════════════
class AnalysisCard extends StatelessWidget {
  const AnalysisCard({super.key, required this.stats, required this.progression});
  final ProfileStats stats;
  final PlayerProgression progression;

  @override
  Widget build(BuildContext context) {
    final total = stats.mafiaGames + stats.citizenGames;
    // بلا مباريات مافيا يُعرض الشريط منصّفاً — لا شريطاً سماوياً كاملاً
    // يوحي بأن اللاعب مواطنٌ دائماً بينما لم يلعب شيئاً.
    final mafiaFraction = stats.mafiaGames == 0 ? 0.5 : stats.mafiaGames / total;

    return GlassCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          cardTitle('📊 تحليل الأداء'),
          const SizedBox(height: 16),

          // ── انقسام الفصائل ──
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('🔴 مافيا ${stats.mafiaWinRate}%', style: ar(12, color: Tw.red400)),
              Text('🔵 مواطن ${stats.citizenWinRate}%', style: ar(12, color: Tw.cyan400)),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: SizedBox(
              height: 12,
              child: Row(children: [
                Expanded(
                  flex: (mafiaFraction * 1000).round(),
                  child: const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: [Tw.red600, Tw.red500]),
                    ),
                    child: SizedBox.expand(),
                  ),
                ),
                Expanded(
                  flex: ((1 - mafiaFraction) * 1000).round(),
                  child: const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: [Tw.cyan600, Tw.cyan500]),
                    ),
                    child: SizedBox.expand(),
                  ),
                ),
              ]),
            ),
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('${stats.mafiaGames} مباراة (${stats.mafiaWins} فوز)',
                  style: ar(10, color: Tw.gray600)),
              Text('${stats.citizenGames} مباراة (${stats.citizenWins} فوز)',
                  style: ar(10, color: Tw.gray600)),
            ],
          ),
          const SizedBox(height: 16),

          // ── donut النجاة ──
          Row(children: [
            DonutRing(
              percent: stats.survivalRate,
              size: 56,
              stroke: 3,
              color: Tw.cyan500,
              track: Tw.gray800,
              child: Text('${stats.survivalRate}%',
                  style: num_(12, color: Tw.cyan400, weight: FontWeight.w700)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('معدل النجاة', style: ar(14, weight: FontWeight.w700)),
                  Text('نسبة البقاء حتى نهاية المباراة', style: ar(10, color: Tw.gray500)),
                ],
              ),
            ),
          ]),
          const SizedBox(height: 16),

          // ── الدور المفضّل + الاتفاقيات ──
          // IntrinsicHeight لا stretch — انظر التعليق في ExtraStatsGrid
          IntrinsicHeight(
            child: Row(
              children: [
                // غياب الدور المفضّل يُخفي البطاقة كلياً — لا «—» ولا صندوق فارغ
                if (stats.favoriteRole != null) ...[
                  Expanded(
                    child: _miniBox(
                      Tw.purple500,
                      'الدور المفضل',
                      roleNameAr(stats.favoriteRole),
                      Tw.purple400,
                    ),
                  ),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: _miniBox(
                    Tw.amber500,
                    '🤝 الاتفاقيات',
                    '${progression.successfulDeals}/${progression.totalDeals}',
                    Tw.amber400,
                    extra: progression.totalDeals > 0
                        ? '${progression.dealSuccessRate}% نجاح'
                        : null,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _miniBox(Color c, String label, String value, Color valueColor, {String? extra}) =>
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: c.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: c.withValues(alpha: 0.15)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: ar(10, color: Tw.gray500)),
            Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: ar(14, color: valueColor, weight: FontWeight.w700)),
            if (extra != null) Text(extra, style: ar(10, color: Tw.gray600)),
          ],
        ),
      );
}

// ══════════════════════════════════════════════════════
// §4.3.6 لوحة المتصدرين المصغّرة
// ══════════════════════════════════════════════════════
class LeaderboardCard extends StatelessWidget {
  const LeaderboardCard({super.key, required this.rows, required this.myId});
  final List<LeaderboardEntry> rows;
  final int myId;

  static const _medals = ['🥇', '🥈', '🥉'];

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: solidCard(border: const Color(0x26FBBF24)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            cardTitle('🏆 لوحة المتصدرين'),
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              // العرض هنا يطابق صفّ البيانات: ٢٤ للمركز + ٨ + ١٨ للشارة + ٨
              child: Row(children: [
                const SizedBox(width: 58),
                Expanded(child: Text('اللاعب', style: ar(9, color: Tw.gray600))),
                SizedBox(
                    width: 48,
                    child: Text('المستوى',
                        textAlign: TextAlign.center, style: ar(9, color: Tw.gray600))),
                SizedBox(
                    width: 40,
                    child: Text('RR',
                        textAlign: TextAlign.center, style: ar(9, color: Tw.gray600))),
              ]),
            ),
            const Divider(height: 1, color: Color(0x0FFFFFFF)),
            for (var i = 0; i < rows.length; i++) _row(rows[i], i),
          ],
        ),
      );

  Widget _row(LeaderboardEntry p, int i) {
    final me = p.id == myId;
    return Container(
      margin: const EdgeInsets.only(top: 2),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        gradient: me
            ? const LinearGradient(colors: [Color(0x1FFBBF24), Color(0x0AFBBF24)])
            : null,
        border: me ? Border.all(color: const Color(0x40FBBF24)) : null,
      ),
      child: Row(children: [
        SizedBox(
          width: 24,
          child: Text(
            i < 3 ? _medals[i] : '${i + 1}',
            textAlign: TextAlign.center,
            style: ar(14, color: i < 3 ? Tw.amber400 : Tw.gray500, weight: FontWeight.w700),
          ),
        ),
        const SizedBox(width: 8),
        Text(RankConfig.of(p.rankTier).icon, style: const TextStyle(fontSize: 18)),
        const SizedBox(width: 8),
        Expanded(
          child: Text(p.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: ar(12,
                  color: me ? Tw.amber400 : Tw.gray300,
                  weight: me ? FontWeight.w700 : FontWeight.w400)),
        ),
        SizedBox(
            width: 48,
            child: Text('${p.level}',
                textAlign: TextAlign.center, style: num_(12, color: Tw.gray500, weight: FontWeight.w400))),
        SizedBox(
            width: 40,
            child: Text('${p.rankRR}',
                textAlign: TextAlign.center, style: num_(12, color: Tw.amber400, weight: FontWeight.w700))),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════
// §4.3.8 آخر المباريات
// ══════════════════════════════════════════════════════
class MatchHistoryCard extends StatefulWidget {
  const MatchHistoryCard({super.key, required this.matches, this.onOpenFullHistory});
  final List<MatchHistoryEntry> matches;

  /// السجلّ الكامل — الملفّ 16. غيابه يُخفي الزرّ بدل أن يعطّله.
  final VoidCallback? onOpenFullHistory;

  @override
  State<MatchHistoryCard> createState() => _MatchHistoryCardState();
}

class _MatchHistoryCardState extends State<MatchHistoryCard> {
  int? _expanded;

  @override
  Widget build(BuildContext context) {
    final rows = widget.matches.take(8).toList();
    return GlassCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              cardTitle('📜 آخر المباريات'),
              if (widget.onOpenFullHistory != null)
                InkWell(
                  onTap: widget.onOpenFullHistory,
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0x33FBBF24)),
                    ),
                    child: Text('عرض السجل التفصيلي',
                        style: ar(10, color: Tw.amber400)),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          for (var i = 0; i < rows.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: _MatchRow(
                m: rows[i],
                expanded: _expanded == i,
                // فتحٌ أحاديّ: الضغط على المفتوح يغلقه
                onTap: () => setState(() => _expanded = _expanded == i ? null : i),
              ),
            ),
        ],
      ),
    );
  }
}

class _MatchRow extends StatelessWidget {
  const _MatchRow({required this.m, required this.expanded, required this.onTap});

  final MatchHistoryEntry m;
  final bool expanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final won = m.won;
    final base = won ? Tw.emerald500 : Tw.rose500;

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: base.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: base.withValues(alpha: expanded ? 0.30 : 0.10)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                    shape: BoxShape.circle, color: won ? Tw.emerald400 : Tw.rose400),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(roleNameAr(m.role),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ar(12, color: Tw.gray300)),
              ),
              const SizedBox(width: 6),
              _teamChip(),
              const Spacer(),
              ..._rightSide(),
              const SizedBox(width: 6),
              AnimatedRotation(
                turns: expanded ? 0.5 : 0,
                duration: const Duration(milliseconds: 150),
                child: Text('▾', style: ar(10, color: Tw.gray500)),
              ),
            ]),
            AnimatedCrossFade(
              firstChild: const SizedBox(width: double.infinity),
              secondChild: _details(),
              crossFadeState:
                  expanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
              duration: const Duration(milliseconds: 250),
              sizeCurve: Curves.easeOut,
            ),
          ],
        ),
      ),
    );
  }

  Widget _teamChip() {
    final (label, fg, bg) = m.isNeutral
        ? ('محايد', Tw.purple400, Tw.purple500)
        : (m.isMafia ? ('مافيا', Tw.red400, Tw.red500) : ('مواطن', Tw.cyan400, Tw.cyan500));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: bg.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(label, style: ar(9, color: fg)),
    );
  }

  List<Widget> _rightSide() {
    final out = <Widget>[
      Text(m.survived ? '🛡️ نجا' : '💀', style: ar(10, color: Tw.gray500)),
    ];

    // 🔴 الفرق بين «صفر» و«غير معروف» محفوظ: قيمة صفر تُعرض، وقيمة
    //    غائبة تُخفي الـchip. عرض «+0 XP» لمباراة لم تُحسب نقاطها كذبٌ.
    if (m.xpEarned != null) {
      out.add(ltrText('+${m.xpEarned}XP',
          ar(10, color: Tw.amber400.withValues(alpha: 0.7))));
    }
    if (m.rrChange != null) {
      final v = m.rrChange!;
      out.add(ltrText('${v >= 0 ? '+' : ''}${v}RR',
          ar(10, color: (v >= 0 ? Tw.green400 : Tw.red400).withValues(alpha: 0.7))));
    }
    out.add(ltrText(formatDuration(m.matchDuration), mono(10, color: Tw.gray500)));

    return [
      for (var i = 0; i < out.length; i++) ...[
        if (i > 0) const SizedBox(width: 12),
        out[i],
      ]
    ];
  }

  Widget _details() {
    final b = m.breakdown;
    return Container(
      margin: const EdgeInsets.fromLTRB(4, 12, 4, 0),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0x05FFFFFF),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x0FFFFFFF)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('⭐ تفصيل الخبرة (XP)',
              style: ar(10, color: Tw.amber400, weight: FontWeight.w700)),
          const SizedBox(height: 4),
          ..._lines(b?.xp ?? const [], 'XP', 'لا نقاط خبرة'),
          _total('المجموع', '+${m.xpEarned ?? 0} XP', Tw.amber400),
          const SizedBox(height: 12),
          Text('🏆 تفصيل الرتبة (RR)',
              style: ar(10, color: Tw.purple400, weight: FontWeight.w700)),
          const SizedBox(height: 4),
          ..._lines(b?.rr ?? const [], 'RR', 'لا تغيّر في الرتبة'),
          _total(
            'المجموع',
            '${(m.rrChange ?? 0) >= 0 ? '+' : ''}${m.rrChange ?? 0} RR',
            (m.rrChange ?? 0) >= 0 ? Tw.green400 : Tw.red400,
          ),
          if (m.dealInitiated) ...[
            const SizedBox(height: 12),
            _dealNote(),
          ],
          const SizedBox(height: 12),
          const Divider(height: 1, color: Color(0x0AFFFFFF)),
          const SizedBox(height: 6),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text(
                m.matchDate == null
                    ? '📅 —'
                    : '📅 ${m.matchDate!.day}/${m.matchDate!.month}',
                style: ar(9, color: Tw.gray600)),
            Text('👥 ${m.matchPlayerCount ?? '—'} لاعب', style: ar(9, color: Tw.gray600)),
            Text('🏅 #${m.physicalId ?? '—'}', style: ar(9, color: Tw.gray600)),
          ]),
        ],
      ),
    );
  }

  List<Widget> _lines(List<PointLine> lines, String unit, String emptyText) {
    // سطر بقيمة صفر يُخفى — الخادم يرسل بنوداً محايدة لتسوية المجموع
    final shown = lines.where((l) => l.value != 0).toList();
    if (shown.isEmpty) {
      return [Text(emptyText, style: ar(10, color: Tw.gray600))];
    }
    return [
      for (final l in shown)
        Padding(
          padding: const EdgeInsets.only(bottom: 3),
          child: Row(children: [
            SizedBox(
                width: 16,
                child: Text(l.icon, textAlign: TextAlign.center, style: ar(10))),
            const SizedBox(width: 4),
            Expanded(child: Text(l.label, style: ar(10, color: Tw.gray400))),
            ltrText('${l.value > 0 ? '+' : ''}${l.value} $unit',
                mono(10,
                    color: l.value > 0 ? Tw.green400 : Tw.red400,
                    weight: FontWeight.w700)),
          ]),
        ),
    ];
  }

  Widget _total(String label, String value, Color color) => Container(
        margin: const EdgeInsets.only(top: 4),
        padding: const EdgeInsets.only(top: 4),
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: Color(0x0FFFFFFF))),
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(label, style: ar(10, color: Tw.gray300, weight: FontWeight.w700)),
          ltrText(value, mono(12, color: color, weight: FontWeight.w900)),
        ]),
      );

  Widget _dealNote() {
    final ok = m.dealSuccess;
    final c = ok ? Tw.green500 : Tw.red500;
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: c.withValues(alpha: 0.10)),
      ),
      child: Text(
        ok ? '✅ الديل ناجح — الهدف كان مافيا' : '❌ الديل فاشل — الهدف كان مواطناً',
        style: ar(9, color: ok ? Tw.green400 : Tw.red400),
      ),
    );
  }
}
