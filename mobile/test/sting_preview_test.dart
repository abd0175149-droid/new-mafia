import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/store/sting_preview.dart';

// ══════════════════════════════════════════════════════
// 🔊 STORE-1 — معاينة نغمة النصر
// ══════════════════════════════════════════════════════
// كان المتجر يبيع ملفّاتٍ صوتيّة ومعاينتها **موجةٌ بصريّةٌ صامتة**: يدفع
// اللاعب ثمن صوتٍ لم يسمعه.
//
// 🔴 والعقد المحروس هنا ليس «هل يعزف» — التشغيل يمسّ قنوات المنصّة فلا
//    يجري في اختبار وحدة. المحروس **العقود التي كسرُها صامت**:
//    ① غياب الرابط يُبلَّغ ولا يُبتلع صمتاً يبدو عطلاً.
//    ② الإيقاف آمنٌ في كلّ مسارات الخروج بلا استثناء — والخروج أكثر من
//       التشغيل: إغلاق الورقة، تبديل التبويب، انتهاء المؤقّت، مغادرة
//       التطبيق، والتخلّص من الشاشة.

void main() {
  final s = StingPreview.instance;

  setUp(() async => s.disposeForTest());

  group('غياب الرابط يُبلَّغ لا يُبتلع', () {
    test('رابطٌ معدوم يعيد false', () async {
      expect(await s.play(1, null), isFalse,
          reason: 'صمتٌ بلا سبب يبدو عطلاً في التطبيق — الويب يقول السبب');
      expect(s.playingId, isNull);
    });

    test('رابطٌ فارغ أو فراغاتٌ فقط يعيد false', () async {
      expect(await s.play(1, ''), isFalse);
      expect(await s.play(1, '   '), isFalse);
    });
  });

  group('الإيقاف آمنٌ في كلّ مسار', () {
    test('إيقافٌ بلا عزفٍ سابق لا يُسقط شيئاً', () async {
      await s.stop();
      await s.stop();
      expect(s.playingId, isNull);
    });

    test('الإيقاف بعد محاولةٍ فاشلة آمن', () async {
      await s.play(7, null);
      await s.stop();
      expect(s.playingId, isNull);
    });
  });

  group('حالة العزف مقروءةٌ للواجهة', () {
    test('playingId يبدأ فارغاً', () {
      expect(s.playingId, isNull,
          reason: 'الواجهة تقرؤه لتُظهر الموجة — قيمةٌ عالقةٌ تعني موجةً لا تنتهي');
    });

    test('مجرى التغيّرات متاحٌ ومتعدّد المستمعين', () {
      // بثٌّ واسع: الشاشة والورقة قد تستمعان معاً.
      expect(s.changes.isBroadcast, isTrue);
    });
  });
}
