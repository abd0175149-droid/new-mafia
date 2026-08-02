import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/wallet.dart';

// ══════════════════════════════════════════════════════
// 🧪 المحفظة — الملفّ 32
// ══════════════════════════════════════════════════════

void main() {
  LedgerEntry e(Map<String, dynamic> j) => LedgerEntry.fromJson(j);

  group('الحركة', () {
    test('علامة الطرح رياضية − لا شرطة الآلة الكاتبة -', () {
      expect(e({'amount': -120}).amountText, '−120');
      expect(e({'amount': -120}).amountText.contains('-'), isFalse);
      expect(e({'amount': 2}).amountText, '+2');
      expect(e({'amount': 0}).amountText, '+0');
    });

    test('الصفر يُعامَل موجباً — لا حركة سالبة بصفر', () {
      expect(e({'amount': 0}).isPositive, isFalse);
      expect(e({'amount': 1}).isPositive, isTrue);
    });

    test('🔴 ملاحظة تبدأ بـ«اختبار» لا تصل اللاعب', () {
      expect(e({'note': 'اختبار شحن يدويّ'}).visibleNote, isNull);
      expect(e({'note': 'إطار الدون'}).visibleNote, 'إطار الدون');
      expect(e({'note': '   '}).visibleNote, isNull);
      expect(e({}).visibleNote, isNull);
    });
  });

  group('أسباب الحركات', () {
    test('المعروف يُترجم', () {
      expect(ledgerReason('drop_win'), ('🏆', 'فوز المباراة'));
      expect(ledgerReason('rent_item'), ('🛒', 'استئجار'));
      expect(ledgerReason('gift_out'), ('🎀', 'هديّة أرسلتها'));
    });

    test('🔴 المجهول يُعرض خاماً لا يُسقط الصفّ', () {
      // الخادم قد يضيف سبباً قبل أن يُحدَّث التطبيق
      expect(ledgerReason('season_bonus'), ('•', 'season_bonus'));
      expect(ledgerReason(''), ('•', ''));
    });
  });

  group('تنسيق الأرقام', () {
    test('فواصل إنجليزية لا عربية-هندية', () {
      expect(groupThousands(1240), '1,240');
      expect(groupThousands(999), '999');
      expect(groupThousands(1000000), '1,000,000');
      expect(groupThousands(0), '0');
      expect(groupThousands(-1240), '−1,240');
      // لا أرقام عربية-هندية
      expect(groupThousands(1240).contains('١'), isFalse);
    });
  });

  group('المحفظة', () {
    test('استجابة ناقصة لا تُسقط الشاشة', () {
      final w = Wallet.fromJson(const {});
      expect(w.balance, 0);
      expect(w.ledger, isEmpty);
      expect(w.moves, 0);
    });

    test('تُقرأ الحقول الخمسة والسجلّ', () {
      final w = Wallet.fromJson(const {
        'balance': 1240, 'earnedFree': 46, 'toppedUp': 1500,
        'spent': 326, 'moves': 38,
        'ledger': [
          {'id': 812, 'reason': 'rent_item', 'amount': -120,
           'balanceAfter': 1240, 'note': 'إطار الدون'},
        ],
      });
      expect(w.balance, 1240);
      expect(w.earnedFree, 46);
      expect(w.spent, 326);
      expect(w.ledger.single.amountText, '−120');
      expect(w.ledger.single.balanceAfter, 1240);
    });
  });
}
