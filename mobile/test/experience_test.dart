import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/experience.dart';
import 'package:mafia_club/models/notification.dart';

// 🧪 «رأيك بتجربتك» — قراءة الحملة كما يرسلها الخادم، ومسار الإشعار
void main() {
  test('الحملة والأسئلة تُقرأ بلا فقد', () {
    final c = ExpCampaign.fromJson({
      'id': 3, 'title': 'عنوان', 'intro': 'نصّ', 'imageUrl': '/uploads/notifications/a.png', 'status': 'open',
      'questions': [
        {'key': 'overall', 'type': 'stars', 'label': 'عامّ', 'required': true, 'section': 'تجربتك'},
        {'key': 'likes', 'type': 'multi', 'label': 'يعجبك', 'options': ['أ', 'ب'], 'maxSelect': 2},
        {'key': 'improve', 'type': 'text', 'label': 'نحسّن', 'hint': ''},
        'تالف',
      ],
    });
    expect(c.id, 3);
    expect(c.isOpen, isTrue);
    expect(c.questions.length, 3);
    expect(c.questions.first.required, isTrue);
    expect(c.questions[1].options, ['أ', 'ب']);
    expect(c.questions[1].maxSelect, 2);
    expect(c.questions[2].hint, isNull);
  });

  test('ما يُعدّ إجابة', () {
    const q = ExpQuestion(key: 'k', type: 'text', label: 'l');
    expect(q.isFilled(null), isFalse);
    expect(q.isFilled('   '), isFalse);
    expect(q.isFilled(<String>[]), isFalse);
    expect(q.isFilled(0), isTrue);
    expect(q.isFilled(['أ']), isTrue);
  });

  test('إشعار الحملة يفتح صفحتها، والزرّ بنصّه', () {
    const n = NotificationRow(id: 1, type: 'experience_review', data: {'url': '/player/experience?c=3&src=push', 'ctaLabel': '✍️ اكتب رأيك'});
    expect(n.url, '/player/experience?c=3&src=push');
    expect(n.ctaLabel, '✍️ اكتب رأيك');
    expect(resolveNotificationUrl('experience_review', {'campaignId': 3}), '/player/experience?c=3');
    expect(resolveNotificationUrl('experience_review', const {}), '/player/experience');
  });
}
