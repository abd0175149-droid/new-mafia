import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/feedback.dart';

// ══════════════════════════════════════════════════════
// 🧪 التقييم الإلزاميّ — الملفّ 18
// ══════════════════════════════════════════════════════

void main() {
  final qs = [
    const FeedbackQuestion(key: 'overall', text: 'س١'),
    const FeedbackQuestion(key: 'venue', text: 'س٢'),
    const FeedbackQuestion(key: 'gameplay', text: 'س٣'),
  ];

  group('السلّم', () {
    test('خمسة خيارات بنصوصها وألوانها الحرفيّة', () {
      expect(kFeedbackScale.map((s) => s.v), [1, 2, 3, 4, 5]);
      expect(kFeedbackScale.map((s) => s.label),
          ['سيّئ جداً', 'سيّئ', 'متوسط', 'جيد', 'ممتاز']);
      expect(kFeedbackScale[0].color.toARGB32(), 0xFFEF4444);
      expect(kFeedbackScale[4].color.toARGB32(), 0xFF22C55E);
    });
  });

  group('الاكتمال', () {
    test('العدّ يشمل المُجاب ≥ ١ فقط', () {
      expect(answeredCountOf(qs, {}), 0);
      expect(answeredCountOf(qs, {'overall': 3}), 1);
      // قيمةٌ صفريّة ليست إجابة
      expect(answeredCountOf(qs, {'overall': 0}), 0);
      // مفتاحٌ ليس من الأسئلة لا يُحتسب
      expect(answeredCountOf(qs, {'ghost': 5}), 0);
    });

    // 🔴 الخادم يردّ «إجابة غير صالحة أو ناقصة: {key}» — الزرّ يوفّرها
    test('الإرسال ممنوع قبل اكتمال كلّ الأسئلة', () {
      expect(allAnsweredOf(qs, {'overall': 5, 'venue': 4}), isFalse);
      expect(allAnsweredOf(qs, {'overall': 5, 'venue': 4, 'gameplay': 3}),
          isTrue);
    });

    test('استبيانٌ بلا أسئلة ليس مكتملاً — لا زرّ مفعَّل على فراغ', () {
      expect(allAnsweredOf(const [], const {}), isFalse);
    });

    test('التقدّم نسبةٌ آمنة عند الفراغ', () {
      expect(progressOf(const [], const {}), 0);
      expect(progressOf(qs, {'overall': 1}), closeTo(1 / 3, 0.001));
      expect(progressOf(qs, {'overall': 1, 'venue': 1, 'gameplay': 1}), 1);
    });
  });

  group('القراءة', () {
    test('الأسئلة تُقرأ من الخادم بترتيبها ومفاتيحها', () {
      final s = FeedbackSurvey.fromJson({
        'questions': [
          {'key': 'overall', 'dimension': 'عام', 'text': 'نصّ ١'},
          {'key': 'venue', 'dimension': 'المكان', 'text': 'نصّ ٢'},
        ],
        'alreadyDone': false,
      });
      expect(s.questions.map((q) => q.key), ['overall', 'venue']);
      expect(s.questions.first.text, 'نصّ ١');
      expect(s.alreadyDone, isFalse);
      expect(s.context, isNull);
    });

    test('alreadyDone تُقرأ صريحةً', () {
      expect(FeedbackSurvey.fromJson({'alreadyDone': true}).alreadyDone, isTrue);
      expect(FeedbackSurvey.fromJson({}).alreadyDone, isFalse);
    });

    test('سياقٌ جزئيّ: الحقول الغائبة تبقى فارغة لا سلاسل «null»', () {
      final c = FeedbackContext.fromJson({
        'sessionId': 12,
        'activityName': 'ليلة',
        'locationName': null,
        'sessionCode': '',
      });
      expect(c.sessionId, 12);
      expect(c.activityName, 'ليلة');
      expect(c.locationName, isNull);
      expect(c.sessionCode, isNull);
      expect(c.playedAt, isNull);
    });
  });
}
