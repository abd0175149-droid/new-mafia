import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/game.dart';

// ══════════════════════════════════════════════════════
// 🧪 الاتفاقيات الثنائية — §4.2 في الملفّ ٢٥
// ══════════════════════════════════════════════════════
// القواعد الخمس من `deal-engine.ts`. الخادم يفرضها، والواجهة تعرضها
// **قبل** الاختيار كي لا يصطدم اللاعب برسالة خطأ بعد أن اختار.

void main() {
  group('النموذج', () {
    test('تُقرأ الاتفاقية كاملةً', () {
      final d = Deal.fromJson(const {
        'id': 'a1b2c3d4',
        'initiatorPhysicalId': 3,
        'targetPhysicalId': 7,
      })!;
      expect(d.id, 'a1b2c3d4');
      expect(d.initiatorPhysicalId, 3);
      expect(d.targetPhysicalId, 7);
    });

    test('حمولةٌ بلا معرّف تُرفض ولا تُسقط البقية', () {
      final list = Deal.listOf(const [
        {'initiatorPhysicalId': 1, 'targetPhysicalId': 2},
        {'id': 'x', 'initiatorPhysicalId': 3, 'targetPhysicalId': 4},
      ]);
      expect(list.length, 1);
      expect(list.single.id, 'x');
    });

    test('غير القائمة يعطي فراغاً', () {
      expect(Deal.listOf(null), isEmpty);
      expect(Deal.listOf('x'), isEmpty);
    });
  });

  group('🔒 قواعد المنع — بترتيب فحص المحرّك', () {
    /// نظير `dealBlockReason` في المتحكّم.
    String? block({
      required int round,
      required List<Deal> deals,
      required List<int> locked,
      int me = 3,
      bool dead = false,
    }) {
      if (dead) return 'dead';
      if (round <= 1) return 'round1';
      if (locked.contains(me)) return 'cooldown';
      if (deals.length >= 3) return 'max';
      return null;
    }

    const d1 = Deal(id: 'a', initiatorPhysicalId: 5, targetPhysicalId: 6);
    const d2 = Deal(id: 'b', initiatorPhysicalId: 7, targetPhysicalId: 8);
    const d3 = Deal(id: 'c', initiatorPhysicalId: 9, targetPhysicalId: 10);

    test('الجولة الأولى ممنوعة', () {
      expect(block(round: 1, deals: const [], locked: const []), 'round1');
      expect(block(round: 2, deals: const [], locked: const []), isNull);
    });

    test('من سجّل في جولةٍ قريبة ممنوعٌ — ولو حذف اتفاقيته', () {
      // `dealRegisteredRound` لا يُمسح عند الحذف: هذا مقصودٌ في المحرّك
      // كي لا يُسجَّل ديلٌ ثمّ يُحذف ثمّ يُسجَّل آخر في نفس الجولة.
      expect(block(round: 3, deals: const [], locked: const [3]), 'cooldown');
      expect(block(round: 3, deals: const [], locked: const [4]), isNull);
    });

    test('ثلاثٌ حدٌّ أقصى للجولة', () {
      expect(
          block(round: 2, deals: const [d1, d2, d3], locked: const []), 'max');
      expect(block(round: 2, deals: const [d1, d2], locked: const []), isNull);
    });

    test('المُقصى لا يُبرم — وسببه يسبق كلّ شيء', () {
      expect(block(round: 5, deals: const [], locked: const [], dead: true),
          'dead');
    });

    test('ترتيب الأسباب: الجولة قبل القفل قبل الحدّ الأقصى', () {
      // كلّها منطبقة معاً — يجب أن يظهر الأسبق
      expect(block(round: 1, deals: const [d1, d2, d3], locked: const [3]),
          'round1');
      expect(block(round: 2, deals: const [d1, d2, d3], locked: const [3]),
          'cooldown');
    });
  });

  group('🔒 الهدف المستهدَف', () {
    const deals = [
      Deal(id: 'a', initiatorPhysicalId: 5, targetPhysicalId: 6),
    ];
    bool targeted(int pid) => deals.any((d) => d.targetPhysicalId == pid);

    test('من استُهدف لا يُختار ثانيةً — القبول للأسرع', () {
      expect(targeted(6), isTrue);
      expect(targeted(7), isFalse);
    });

    test('المبادر نفسه ليس مستهدَفاً', () => expect(targeted(5), isFalse));
  });

  group('اتفاقيتي أنا', () {
    const deals = [
      Deal(id: 'a', initiatorPhysicalId: 5, targetPhysicalId: 6),
      Deal(id: 'b', initiatorPhysicalId: 3, targetPhysicalId: 9),
    ];
    Deal? mine(int me) =>
        deals.where((d) => d.initiatorPhysicalId == me).firstOrNull;

    test('تُميَّز بالمبادر لا بالهدف', () {
      expect(mine(3)?.id, 'b');
      expect(mine(9), isNull); // أنا هدفٌ لا مبادر
      expect(mine(4), isNull);
    });
  });
}
