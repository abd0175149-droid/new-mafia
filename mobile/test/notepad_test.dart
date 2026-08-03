import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/notepad.dart';

// ══════════════════════════════════════════════════════
// 🧪 المفكرة ودردشة المافيا — الملفّ ٢٦
// ══════════════════════════════════════════════════════

void main() {
  group('الملاحظة الواحدة', () {
    test('فارغةٌ حين لا نصّ ولا تصنيف', () {
      expect(const PlayerNote().isEmpty, isTrue);
      expect(const PlayerNote(text: '   ').isEmpty, isTrue);
      expect(const PlayerNote(text: 'شكّاك').isEmpty, isFalse);
      expect(const PlayerNote(suspicion: Suspicion.mafia).isEmpty, isFalse);
    });

    test('التصنيف وحده يكفي لبقاء الملاحظة', () {
      // لاعبٌ صُنّف بلا نصّ يجب أن يظهر في العرض — التصنيف هو الملاحظة
      const n = PlayerNote(suspicion: Suspicion.suspect);
      final pad = const Notepad().withNote(4, n);
      expect(pad.playersWithNotes, [4]);
    });
  });

  group('المفكرة', () {
    final pad = const Notepad()
        .withNote(Notepad.generalKey, const PlayerNote(text: 'الجولة هادئة'))
        .withNote(7, const PlayerNote(text: 'متوتر', suspicion: Suspicion.mafia))
        .withNote(3, const PlayerNote(suspicion: Suspicion.safe));

    test('العامّة ليست ضمن اللاعبين', () {
      expect(pad.playersWithNotes, [3, 7]);
      expect(pad.general.text, 'الجولة هادئة');
    });

    test('اللاعبون مرتّبون بالمقعد', () {
      expect(pad.playersWithNotes, orderedEquals([3, 7]));
    });

    test('عدّاد التبويب = اللاعبون + العامّة إن كان لها نصّ', () {
      expect(pad.displayCount, 3);
      final noGeneral = pad.without(Notepad.generalKey);
      expect(noGeneral.displayCount, 2);
    });

    test('حفظُ ملاحظةٍ فارغة يحذفها بدل تركها هيكلاً', () {
      final p = pad.withNote(7, const PlayerNote());
      expect(p.playersWithNotes, [3]);
    });

    test('لا ملاحظات ⇒ hasAny خطأ', () {
      expect(const Notepad().hasAny, isFalse);
    });
  });

  group('التخزين', () {
    test('رحلة ذهابٍ وإياب تحفظ النصّ والتصنيف', () {
      final pad = const Notepad()
          .withNote(0, const PlayerNote(text: 'عامّة'))
          .withNote(5, const PlayerNote(text: 'كذب', suspicion: Suspicion.mafia));
      final back = Notepad.decode(pad.encode());
      expect(back.general.text, 'عامّة');
      expect(back.noteOf(5).text, 'كذب');
      expect(back.noteOf(5).suspicion, Suspicion.mafia);
    });

    test('🔴 مفكرةٌ تالفة لا تُسقط الشاشة', () {
      expect(Notepad.decode('{{{ليس JSON').hasAny, isFalse);
      expect(Notepad.decode('[]').hasAny, isFalse);
      expect(Notepad.decode(null).hasAny, isFalse);
      expect(Notepad.decode('').hasAny, isFalse);
    });

    test('مفاتيح غير رقمية تُتجاهَل', () {
      expect(Notepad.decode('{"x":{"text":"y"}}').hasAny, isFalse);
    });
  });

  group('إيموجي الاشتباه', () {
    test('لكلّ مستوى إيموجيه', () {
      expect(Suspicion.safe.emoji, '🟢');
      expect(Suspicion.suspect.emoji, '🟡');
      expect(Suspicion.mafia.emoji, '🔴');
    });

    test('«غير محدّد» بلا إيموجي — فلا يُرسم شيء', () {
      expect(Suspicion.none.emoji, isNull);
    });

    test('القراءة متسامحة مع المجهول', () {
      expect(SuspicionX.parse('mafia'), Suspicion.mafia);
      expect(SuspicionX.parse('غريب'), Suspicion.none);
      expect(SuspicionX.parse(null), Suspicion.none);
    });
  });

  group('🗣️ رسائل التشاور', () {
    test('تُقرأ كاملةً', () {
      final m = MafiaChatMessage.fromJson(const {
        'physicalId': 4,
        'name': 'خالد',
        'text': 'راقبوا #7',
        'at': 1785700000000,
      })!;
      expect(m.physicalId, 4);
      expect(m.text, 'راقبوا #7');
      // الخادم يخزّن UTC والعرض محلّيّ — قاعدة المنصّة
      expect(m.at.isUtc, isFalse);
    });

    test('رسالةٌ بلا مقعدٍ تُرفض ولا تُسقط البقية', () {
      final l = MafiaChatMessage.listOf(const [
        {'name': 'مجهول', 'text': 'x'},
        {'physicalId': 9, 'text': 'y'},
      ]);
      expect(l.length, 1);
      expect(l.single.physicalId, 9);
    });

    test('السقف ٣٠٠ حرفاً', () => expect(kChatMaxLen, 300));
  });

  group('🔒 شرط ظهور التشاور', () {
    /// نظير `chatVisible`.
    bool visible({
      required bool enabled,
      required bool dead,
      required String? role,
      required int teamSize,
    }) {
      const mafia = {
        'GODFATHER', 'SILENCER', 'CHAMELEON', 'WITCH', 'OLDER_BROTHER',
        'MAFIA_REGULAR',
      };
      return enabled && !dead && (mafia.contains(role ?? '') || teamSize > 0);
    }

    test('مافياويّ حيّ والعلم مرفوع ⇒ يظهر', () {
      expect(
          visible(enabled: true, dead: false, role: 'SILENCER', teamSize: 0),
          isTrue);
    });

    test('العلم مطفأ ⇒ لا يظهر لأحد', () {
      expect(
          visible(enabled: false, dead: false, role: 'GODFATHER', teamSize: 3),
          isFalse);
    });

    test('الميت يُقطع فوراً', () {
      expect(
          visible(enabled: true, dead: true, role: 'GODFATHER', teamSize: 3),
          isFalse);
    });

    test('المواطن لا يراه', () {
      expect(visible(enabled: true, dead: false, role: 'DOCTOR', teamSize: 0),
          isFalse);
    });

    test('🔴 من وصله فريقٌ يراه ولو لم يُحدَّث دورُه بعد', () {
      // الأخ الأصغر بعد التحوّل: الفريق قد يسبق الدور
      expect(
          visible(
              enabled: true,
              dead: false,
              role: 'YOUNGER_BROTHER',
              teamSize: 2),
          isTrue);
    });
  });
}
