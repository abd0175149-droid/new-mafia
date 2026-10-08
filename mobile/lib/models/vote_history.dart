// ══════════════════════════════════════════════════════
// 🗳️ سجلّ التصويت — نموذج `backend/src/game/vote-history.ts`
// ══════════════════════════════════════════════════════
// جولاتٌ مفروزة، علنيّة، بلا أدوار: الصوتُ النهائيّ وحده كما عرضته الورقة
// الحيّة. يصل حيّاً بـ`day:vote-history` وعند الطلب بـ`room:get-vote-history`،
// ومن سجلّ المباريات بـ`/api/player-app/:id/matches/:matchId/votes`.

int _i(dynamic v, [int f = 0]) =>
    v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? f);

int? _iOrNull(dynamic v) =>
    v == null ? null : (v is num ? v.toInt() : int.tryParse('$v'));

List<int> _ints(dynamic v) =>
    v is List ? [for (final x in v) if (_iOrNull(x) != null) _iOrNull(x)!] : const [];

class VoteRoundVoter {
  const VoteRoundVoter({required this.seat, this.name = '', this.weight = 1, this.via});

  final int seat;
  final String name;
  final int weight;

  /// `proxy` سجّله الموجّه باسمه · `auto` انتهى الوقت فصوّت على نفسه.
  final String? via;

  factory VoteRoundVoter.fromJson(Map<String, dynamic> j) => VoteRoundVoter(
        seat: _i(j['voterPhysicalId']),
        name: '${j['name'] ?? ''}',
        weight: _i(j['weight'], 1),
        via: j['via'] as String?,
      );
}

class VoteRoundCandidate {
  const VoteRoundCandidate({
    required this.type,
    required this.targetSeat,
    this.name = '',
    this.initiatorSeat,
    this.initiatorName,
    this.votes = 0,
    this.people = 0,
    this.unnamed = 0,
    this.voters = const [],
  });

  final String type; // PLAYER | DEAL
  final int targetSeat;
  final String name;
  final int? initiatorSeat;
  final String? initiatorName;
  final int votes, people, unnamed;
  final List<VoteRoundVoter> voters;

  bool get isDeal => type == 'DEAL';

  String get label => isDeal
      ? 'ديل: ${initiatorName?.isNotEmpty == true ? initiatorName : '#$initiatorSeat'} ⇄ $name'
      : name;

  String get sub => isDeal ? '#$initiatorSeat ⇄ #$targetSeat' : 'مقعد $targetSeat';

  factory VoteRoundCandidate.fromJson(Map<String, dynamic> j) => VoteRoundCandidate(
        type: '${j['type'] ?? 'PLAYER'}',
        targetSeat: _i(j['targetPhysicalId']),
        name: '${j['name'] ?? ''}',
        initiatorSeat: _iOrNull(j['initiatorPhysicalId']),
        initiatorName: j['initiatorName'] as String?,
        votes: _i(j['votes']),
        people: _i(j['people']),
        unnamed: _i(j['unnamed']),
        voters: [
          for (final v in (j['voters'] as List? ?? const []))
            if (v is Map) VoteRoundVoter.fromJson(Map<String, dynamic>.from(v)),
        ],
      );
}

class VoteRoundOutcome {
  const VoteRoundOutcome({
    required this.type,
    this.eliminated = const [],
    this.names = const [],
    this.viaDeal = false,
    this.savedSeat,
    this.savedName,
    this.withdrawnVotes,
    this.neededVotes,
  });

  final String type;
  final List<int> eliminated;
  final List<String> names;
  final bool viaDeal;
  final int? savedSeat;
  final String? savedName;
  final int? withdrawnVotes, neededVotes;

  factory VoteRoundOutcome.fromJson(Map<String, dynamic> j) => VoteRoundOutcome(
        type: '${j['type'] ?? ''}',
        eliminated: _ints(j['eliminated']),
        names: [for (final n in (j['names'] as List? ?? const [])) '${n ?? ''}'],
        viaDeal: j['viaDeal'] == true,
        savedSeat: _iOrNull(j['savedPhysicalId']),
        savedName: j['savedName'] as String?,
        withdrawnVotes: _iOrNull(j['withdrawnVotes']),
        neededVotes: _iOrNull(j['neededVotes']),
      );
}

class VoteRound {
  const VoteRound({
    required this.id,
    required this.round,
    this.seq = 1,
    this.kind = 'DAY',
    this.shieldedSeat,
    this.candidates = const [],
    this.withdrawn = const [],
    this.outcome,
  });

  final String id;
  final int round, seq;
  final String kind;
  final int? shieldedSeat;
  final List<VoteRoundCandidate> candidates;
  final List<int> withdrawn;
  final VoteRoundOutcome? outcome;

  static const _kindShort = {
    'TIE_REVOTE': 'إعادة',
    'TIE_NARROW': 'حصر',
    'WITHDRAWAL_REVOTE': 'بعد السحب',
    'MAYOR_REVOTE': 'بأمر العمدة',
    'RESTART': 'إعادة',
  };
  static const _kindLong = {
    'DAY': 'تصويت النهار',
    'TIE_REVOTE': 'إعادة بعد التعادل',
    'TIE_NARROW': 'حصرٌ بين المتعادلين',
    'WITHDRAWAL_REVOTE': 'إعادة بعد سحب الأصوات',
    'MAYOR_REVOTE': 'إعادة بأمر العمدة',
    'RESTART': 'إعادة التصويت',
  };

  String get label => 'اليوم $round${seq > 1 ? ' · ${_kindShort[kind] ?? 'إعادة'}' : ''}';
  String get kindText => _kindLong[kind] ?? 'تصويت';

  factory VoteRound.fromJson(Map<String, dynamic> j) => VoteRound(
        id: '${j['id'] ?? ''}',
        round: _i(j['round']),
        seq: _i(j['seq'], 1),
        kind: '${j['kind'] ?? 'DAY'}',
        shieldedSeat: _iOrNull(j['shieldedPhysicalId']),
        candidates: [
          for (final c in (j['candidates'] as List? ?? const []))
            if (c is Map) VoteRoundCandidate.fromJson(Map<String, dynamic>.from(c)),
        ],
        withdrawn: _ints(j['withdrawn']),
        outcome: j['outcome'] is Map
            ? VoteRoundOutcome.fromJson(Map<String, dynamic>.from(j['outcome'] as Map))
            : null,
      );

  static List<VoteRound> listOf(dynamic v) => [
        if (v is List)
          for (final r in v)
            if (r is Map) VoteRound.fromJson(Map<String, dynamic>.from(r)),
      ];
}
