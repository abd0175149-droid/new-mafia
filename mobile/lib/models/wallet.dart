// ══════════════════════════════════════════════════════
// 🪙 نماذج المحفظة — §8 في الملفّ 32
// ══════════════════════════════════════════════════════

int _i(dynamic v, [int f = 0]) =>
    v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? f);

/// حركة واحدة في السجلّ.
class LedgerEntry {
  const LedgerEntry({
    required this.id,
    required this.reason,
    required this.amount,
    required this.balanceAfter,
    this.note,
    this.createdAt,
  });

  final int id;

  /// 🔴 نصّ لا `enum` عمداً: الخادم قد يضيف سبباً قبل أن يُحدَّث التطبيق،
  /// وسببٌ مجهول يجب أن يُعرض خاماً لا أن يُسقط الصفّ أو يرمي.
  final String reason;

  final int amount, balanceAfter;
  final String? note;
  final DateTime? createdAt;

  bool get isPositive => amount > 0;

  /// «−120» بعلامة الطرح الرياضية U+2212 لا شرطة الآلة الكاتبة.
  String get amountText =>
      amount >= 0 ? '+$amount' : '−${amount.abs()}';

  /// ملاحظة تبدأ بـ«اختبار» لا تُعرض للاعب — هي أثرٌ إداريّ.
  String? get visibleNote {
    final n = note?.trim();
    if (n == null || n.isEmpty || n.startsWith('اختبار')) return null;
    return n;
  }

  factory LedgerEntry.fromJson(Map<String, dynamic> j) => LedgerEntry(
        id: _i(j['id']),
        reason: (j['reason'] ?? '').toString(),
        amount: _i(j['amount']),
        balanceAfter: _i(j['balanceAfter']),
        note: j['note'] as String?,
        createdAt: j['createdAt'] == null
            ? null
            : DateTime.tryParse('${j['createdAt']}')?.toLocal(),
      );
}

/// المحفظة كاملة — الرصيد والملخّص والسجلّ.
class Wallet {
  const Wallet({
    this.balance = 0,
    this.earnedFree = 0,
    this.toppedUp = 0,
    this.spent = 0,
    this.moves = 0,
    this.ledger = const [],
  });

  final int balance, earnedFree, toppedUp, spent, moves;
  final List<LedgerEntry> ledger;

  factory Wallet.fromJson(Map<String, dynamic> j) => Wallet(
        balance: _i(j['balance']),
        earnedFree: _i(j['earnedFree']),
        toppedUp: _i(j['toppedUp']),
        spent: _i(j['spent']),
        moves: _i(j['moves']),
        ledger: (j['ledger'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => LedgerEntry.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
      );
}

// ══════════════════════════════════════════════════════
// خريطة أسباب الحركات — نصوص حرفية
// ══════════════════════════════════════════════════════

const _reasons = <String, (String, String)>{
  'drop_win': ('🏆', 'فوز المباراة'),
  'drop_top3': ('🥉', 'ضمن أفضل ثلاثة'),
  'drop_first_match': ('🎉', 'هديّة أول مباراة'),
  'admin_topup': ('💵', 'شحن من الإدارة'),
  'admin_adjust': ('🎁', 'من النادي'),
  'rent_item': ('🛒', 'استئجار'),
  'renew_item': ('🔄', 'تجديد'),
  'refund': ('↩️', 'استرجاع'),
  'gift_in': ('🎀', 'هديّة وصلتك'),
  'gift_out': ('🎀', 'هديّة أرسلتها'),
};

/// سببٌ مجهول: نقطة + قيمته الخام. الشاشة تبقى صالحة حين يسبق الخادمُ
/// التطبيقَ بسببٍ جديد.
(String icon, String label) ledgerReason(String reason) =>
    _reasons[reason] ?? ('•', reason);

/// فواصل آلاف **إنجليزية** — `1,240` لا `١٬٢٤٠`.
/// مطابق لـ`toLocaleString('en-US')` في الويب.
String groupThousands(int n) {
  final s = n.abs().toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
    b.write(s[i]);
  }
  return (n < 0 ? '−' : '') + b.toString();
}
