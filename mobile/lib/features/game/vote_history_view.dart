import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../models/vote_history.dart';
import '../profile/profile_palette.dart';
import 'game_session_controller.dart';

// ══════════════════════════════════════════════════════
// 🗳️ سجلّ التصويت — عرضٌ واحد لثلاثة أماكن، كالويب (VoteHistoryPanel.tsx):
// تبويبُ المفكرة، شاشةُ المتفرّج، وتفصيلُ المباراة في السجلّ.
// ══════════════════════════════════════════════════════
// البيانات من الخادم كما هي: جولاتٌ مفروزة، علنيّة، بلا أدوار. لا اشتقاق
// هنا ولا استنتاج — الواجهة تعرض ما عرضته الورقة الحيّة لحظة الفرز.

const _gold = Color(0xFFC5A059);
const _card = Color(0xFF111111);
const _line = Color(0xFF222222);
const _chipBg = Color(0xFF1A1A1A);

class VoteHistoryView extends StatefulWidget {
  const VoteHistoryView({super.key, required this.rounds, this.mySeat, this.footerHint});

  final List<VoteRound> rounds;
  final int? mySeat;
  final String? footerHint;

  @override
  State<VoteHistoryView> createState() => _VoteHistoryViewState();
}

class _VoteHistoryViewState extends State<VoteHistoryView> {
  String? _sel;
  bool _byPerson = false;
  int? _person;

  @override
  void initState() {
    super.initState();
    final me = widget.mySeat;
    _person = me != null && me > 0 ? me : null;
  }

  @override
  void didUpdateWidget(covariant VoteHistoryView old) {
    super.didUpdateWidget(old);
    // الجولة المختارة اختفت (لعبةٌ جديدة) ⇒ العودة لآخر جولة
    if (_sel != null && !widget.rounds.any((r) => r.id == _sel)) _sel = null;
  }

  VoteRound? get _current {
    final rs = widget.rounds;
    if (rs.isEmpty) return null;
    return rs.firstWhere((r) => r.id == _sel, orElse: () => rs.last);
  }

  /// كلُّ من ظهر في السجلّ — مصوّتاً أو مرشّحاً — باسمه الأخير
  List<MapEntry<int, String>> get _people {
    final m = <int, String>{};
    for (final r in widget.rounds) {
      for (final c in r.candidates) {
        m[c.targetSeat] = c.name;
        if (c.initiatorSeat != null) m[c.initiatorSeat!] = c.initiatorName ?? '';
        for (final v in c.voters) {
          m[v.seat] = v.name;
        }
      }
    }
    return m.entries.toList()..sort((a, b) => a.key.compareTo(b.key));
  }

  @override
  Widget build(BuildContext context) {
    final cur = _current;
    if (cur == null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 16),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Opacity(opacity: 0.6, child: Text('🗳️', style: TextStyle(fontSize: 30))),
          const SizedBox(height: 8),
          Text('لا جولات تصويت بعد', style: ar(14, color: Tw.gray400)),
          const SizedBox(height: 4),
          Text('كلُّ جولة تظهر هنا بعد فرزها', style: ar(11, color: Tw.gray600)),
        ]),
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // الجولات — `reverse` كي تظهر آخر جولةٍ أوّلاً حين تطول القائمة
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          reverse: true,
          child: Row(children: [
            for (final r in widget.rounds)
              Padding(
                padding: const EdgeInsetsDirectional.only(end: 6),
                child: _pill(
                  r.label,
                  on: r.id == cur.id,
                  onTap: () => setState(() => _sel = r.id),
                ),
              ),
          ]),
        ),
        const SizedBox(height: 10),
        _viewToggle(),
        const SizedBox(height: 12),
        if (_byPerson) ..._personView() else ..._candidateView(cur),
        if (widget.footerHint != null) ...[
          const SizedBox(height: 10),
          Text(widget.footerHint!, textAlign: TextAlign.center, style: ar(11, color: Tw.gray600)),
        ],
      ],
    );
  }

  Widget _pill(String label, {required bool on, required VoidCallback onTap}) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: on ? const Color(0x1AC5A059) : const Color(0xFF141414),
            border: Border.all(color: on ? _gold : const Color(0xFF2A2A2A)),
          ),
          child: Text(label,
              style: ar(12, color: on ? _gold : Tw.gray300, weight: FontWeight.w700)),
        ),
      );

  Widget _viewToggle() {
    Widget btn(String label, bool person) {
      final on = _byPerson == person;
      return Expanded(
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: () => setState(() => _byPerson = person),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 7),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              color: on ? const Color(0xFF262013) : Colors.transparent,
            ),
            child: Text(label,
                style: ar(12, color: on ? _gold : Tw.gray500, weight: FontWeight.w700)),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: const Color(0xFF141414),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF2A2A2A)),
      ),
      child: Row(children: [btn('حسب المرشّح', false), btn('حسب اللاعب', true)]),
    );
  }

  // ── حسب المرشّح ──
  List<Widget> _candidateView(VoteRound r) {
    final (text, color) = outcomeOf(r);
    final sorted = [...r.candidates]..sort((a, b) => b.votes.compareTo(a.votes));
    final max = sorted.isEmpty ? 0 : sorted.first.votes;
    return [
      Text(
        '${r.kindText}${r.shieldedSeat != null ? ' · #${r.shieldedSeat} محميّ بأمر العمدة' : ''}',
        style: ar(11, color: Tw.gray500),
      ),
      const SizedBox(height: 2),
      Text(text, style: ar(13, color: color, weight: FontWeight.w700)),
      const SizedBox(height: 10),
      for (final c in sorted) ...[
        _candidateCard(r, c, top: max > 0 && c.votes == max),
        const SizedBox(height: 8),
      ],
      if (r.withdrawn.isNotEmpty)
        Text('المشطوب سحب صوته أثناء التبرير.', style: ar(11, color: Tw.gray500)),
    ];
  }

  Widget _candidateCard(VoteRound r, VoteRoundCandidate c, {required bool top}) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: _card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: top ? const Color(0x66C5A059) : _line),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Container(
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF1D1D1D),
                border: Border.all(color: const Color(0xFF333333)),
              ),
              child: Text(c.isDeal ? '⇄' : '${c.targetSeat}',
                  style: ar(13, color: _gold, weight: FontWeight.w900)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(c.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ar(14, weight: FontWeight.w700)),
                Text(c.sub, style: ar(11, color: Tw.gray500)),
              ]),
            ),
            Column(children: [
              Text('${c.votes}', style: ar(18, color: _gold, weight: FontWeight.w900, height: 1)),
              Text(c.votes != c.people ? '${c.people} أشخاص' : 'صوت',
                  style: ar(10, color: Tw.gray500)),
            ]),
          ]),
          if (c.voters.isNotEmpty || c.unnamed > 0) ...[
            const SizedBox(height: 8),
            Wrap(spacing: 6, runSpacing: 6, children: [
              for (final v in c.voters) _voterChip(r, v),
              if (c.unnamed > 0)
                _chipBox(Text('+${c.unnamed} بلا اسم', style: ar(11.5, color: Tw.gray500)),
                    border: const Color(0xFF2C2C2C)),
            ]),
          ],
        ]),
      );

  Widget _voterChip(VoteRound r, VoteRoundVoter v) {
    final withdrawn = r.withdrawn.contains(v.seat);
    final me = widget.mySeat != null && v.seat == widget.mySeat;
    final mark = v.via == 'proxy' ? ' 🤝' : v.via == 'auto' ? ' ⏰' : '';
    final base = ar(11.5, color: me ? _gold : const Color(0xFFE5E7EB)).copyWith(
      decoration: withdrawn ? TextDecoration.lineThrough : null,
      decorationColor: Tw.gray400,
    );
    final chip = _chipBox(
      Text.rich(TextSpan(style: base, children: [
        TextSpan(text: '#${v.seat} ${v.name}$mark'),
        if (v.weight > 1)
          TextSpan(text: ' ×${v.weight}', style: base.copyWith(color: _gold, fontWeight: FontWeight.w900)),
      ])),
      // الصوت المسجَّل عن صاحبه (موجّه / انتهاء الوقت) بإطارٍ أخفت
      border: me ? _gold : (v.via != null ? const Color(0xFF3A3A3A) : const Color(0xFF2C2C2C)),
    );
    final tip = withdrawn
        ? 'سحب صوته'
        : v.via == 'proxy'
            ? 'سجّله الموجّه باسمه'
            : v.via == 'auto'
                ? 'انتهى الوقت: صوتٌ على نفسه'
                : null;
    final out = withdrawn ? Opacity(opacity: 0.5, child: chip) : chip;
    return tip == null ? out : Tooltip(message: tip, child: out);
  }

  Widget _chipBox(Widget child, {required Color border}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: _chipBg,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: border),
        ),
        child: child,
      );

  // ── حسب اللاعب ──
  List<Widget> _personView() {
    final people = _people;
    final p = _person;
    return [
      LayoutBuilder(builder: (_, box) {
        const gap = 6.0;
        final w = (box.maxWidth - gap * 3) / 4;
        return Wrap(spacing: gap, runSpacing: gap, children: [
          for (final e in people)
            SizedBox(
              width: w,
              child: InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () => setState(() => _person = e.key),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 4),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    color: p == e.key ? Colors.transparent : const Color(0xFF141414),
                    border: Border.all(color: p == e.key ? _gold : const Color(0xFF2A2A2A)),
                  ),
                  child: Text('${e.key} ${e.value}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ar(11, color: p == e.key ? _gold : Tw.gray300)),
                ),
              ),
            ),
        ]);
      }),
      const SizedBox(height: 10),
      if (p == null)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Text('اختر لاعباً لترى تصويته في كلّ جولة',
              textAlign: TextAlign.center, style: ar(12, color: Tw.gray500)),
        )
      else
        for (final r in widget.rounds) ...[
          _personRow(r, p),
          const SizedBox(height: 6),
        ],
    ];
  }

  Widget _personRow(VoteRound r, int seat) {
    String? gave;
    var flag = '';
    for (final c in r.candidates) {
      for (final v in c.voters) {
        if (v.seat != seat) continue;
        gave = c.label;
        flag = r.withdrawn.contains(seat)
            ? ' (سحب)'
            : v.via == 'auto'
                ? ' ⏰'
                : v.via == 'proxy'
                    ? ' 🤝'
                    : '';
      }
    }
    final got = [
      for (final c in r.candidates)
        if (c.targetSeat == seat || c.initiatorSeat == seat)
          for (final v in c.voters) v.name,
    ];
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: _card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _line),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(r.label, style: ar(11, color: Tw.gray500)),
        Text.rich(TextSpan(style: ar(12.5, color: const Color(0xFFE5E7EB), height: 1.6), children: [
          const TextSpan(text: 'صوّت على '),
          TextSpan(
              text: '${gave ?? '—'}$flag',
              style: ar(12.5, color: _gold, weight: FontWeight.w700, height: 1.6)),
        ])),
        if (got.isNotEmpty)
          Text('صوّت عليه: ${got.join('، ')}', style: ar(12.5, color: Tw.gray400, height: 1.6)),
      ]),
    );
  }
}

/// نصُّ نتيجة الجولة ولونها — مطابقٌ لـ`outcomeText` في الويب.
(String, Color) outcomeOf(VoteRound r) {
  const bad = Tw.red400, warn = _gold, dim = Tw.gray500;
  final o = r.outcome;
  if (o == null) return ('فُرزت — بانتظار النتيجة', dim);
  String who() => [
        for (var i = 0; i < o.eliminated.length; i++)
          '#${o.eliminated[i]} ${i < o.names.length ? o.names[i] : ''}'.trim(),
      ].join('، ');
  return switch (o.type) {
    'ELIMINATED' => ('أُقصي ${who()}${o.viaDeal ? ' (بالديل)' : ''}', bad),
    'NO_ELIMINATION' => ('لم يُقصَ أحد', dim),
    'TIE' => ('تعادل — بانتظار قرار الموجّه', warn),
    'TIE_REVOTE' => ('تعادل ⟵ إعادة التصويت', warn),
    'TIE_NARROW' => ('تعادل ⟵ حصرٌ بين المتعادلين', warn),
    'TIE_CANCEL' => ('تعادل ⟵ أُلغي التصويت', dim),
    'TIE_ELIMINATE_ALL' =>
      ('تعادل ⟵ إقصاء المتعادلين${o.eliminated.isNotEmpty ? ': ${who()}' : ''}', bad),
    'WITHDRAWN' => ('سُحب ${o.withdrawnVotes ?? '?'} من ${o.neededVotes ?? '?'} مطلوبة ⟵ إعادة التصويت', warn),
    'MAYOR_SAVED' => (
        'العمدة أنقذ${o.savedSeat != null ? ' #${o.savedSeat} ${o.savedName ?? ''}' : ''} ⟵ إعادة',
        warn
      ),
    'MAYOR_POSTPONED' => ('العمدة أجّل الإعدام — لا موت اليوم', dim),
    'RESTARTED' => ('أُعيد التصويت', dim),
    _ => ('', dim),
  };
}

// ══════════════════════════════════════════════════════
// 👁️ للمتفرّج: قسمٌ يُطوى، والجلبُ عند الفتح فقط
// ══════════════════════════════════════════════════════
class CollapsibleVoteHistory extends StatefulWidget {
  const CollapsibleVoteHistory({super.key, required this.controller});
  final GameSessionController controller;

  @override
  State<CollapsibleVoteHistory> createState() => _CollapsibleVoteHistoryState();
}

class _CollapsibleVoteHistoryState extends State<CollapsibleVoteHistory> {
  bool _open = false;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: widget.controller,
        builder: (_, __) {
          final rounds = widget.controller.voteHistory;
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () {
                setState(() => _open = !_open);
                if (_open) unawaited(widget.controller.loadVoteHistory());
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: _card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0x4DC5A059)),
                ),
                child: Row(children: [
                  Expanded(
                    child: Text('🗳️ سجلّ التصويت${rounds.isNotEmpty ? ' (${rounds.length})' : ''}',
                        style: ar(14, color: _gold, weight: FontWeight.w700)),
                  ),
                  Text(_open ? '▲' : '▼', style: ar(12, color: Tw.gray500)),
                ]),
              ),
            ),
            if (_open) ...[
              const SizedBox(height: 12),
              VoteHistoryView(rounds: rounds, footerHint: 'الجولة الجارية تظهر بعد فرزها'),
            ],
          ]);
        },
      );
}

// ══════════════════════════════════════════════════════
// 📜 سجلّ تصويت مباراةٍ منتهية — من تفصيل المباراة، يُجلب عند الضغط
// ══════════════════════════════════════════════════════
class MatchVoteHistory extends StatefulWidget {
  const MatchVoteHistory({super.key, required this.playerId, required this.matchId});
  final int playerId;
  final int matchId;

  @override
  State<MatchVoteHistory> createState() => _MatchVoteHistoryState();
}

class _MatchVoteHistoryState extends State<MatchVoteHistory> {
  bool _loading = false, _loaded = false;
  String? _error;
  List<VoteRound> _rounds = const [];
  int? _mine;

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final r = await ApiClient.instance
          .get('/api/player-app/${widget.playerId}/matches/${widget.matchId}/votes');
      if (!mounted) return;
      if (r is! Map || r['success'] != true) {
        setState(() {
          _loading = false;
          _error = (r is Map ? r['error'] as String? : null) ?? 'تعذّر جلب السجلّ';
        });
        return;
      }
      final mine = r['myPhysicalId'];
      setState(() {
        _rounds = VoteRound.listOf(r['rounds']);
        _mine = mine is num ? mine.toInt() : int.tryParse('${mine ?? ''}');
        _loading = false;
        _loaded = true;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.message; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = 'خطأ في الاتصال بالخادم'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Text('جارِ التحميل…', textAlign: TextAlign.center, style: ar(12, color: Tw.gray500)),
      );
    }
    if (!_loaded) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        InkWell(
          onTap: _load,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 13),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              color: const Color(0x0DC5A059),
              border: Border.all(color: const Color(0x4DC5A059)),
            ),
            child: Text('🗳️ سجلّ التصويت في هذه المباراة',
                style: ar(14, color: _gold, weight: FontWeight.w700)),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, textAlign: TextAlign.center, style: ar(12, color: Tw.red400)),
        ],
      ]);
    }
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0x1AFFFFFF)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('🗳️ سجلّ التصويت', style: ar(14, weight: FontWeight.w900)),
        const SizedBox(height: 12),
        VoteHistoryView(rounds: _rounds, mySeat: _mine),
      ]),
    );
  }
}
