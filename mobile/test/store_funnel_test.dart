import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/store/store_funnel.dart';

// ══════════════════════════════════════════════════════
// 📉 STORE-6 — قياس قُمع المتجر
// ══════════════════════════════════════════════════════
// 🔴 سلوك مستخدمي iOS الشرائيّ كان **غير مرئيٍّ للإدارة** إطلاقاً: الويب
//    يقيس والتطبيق لا، فأيّ قرارٍ يُبنى على القياس يمثّل نصف الجمهور.
//
// 🔴 والمحروس هنا **إسقاط الظهور المكرّر**: الشبكة كسولة ويُعاد بناء
//    العنصر مع كلّ تمريرة، فبلا إسقاطٍ يُسجَّل ظهورٌ لكلّ إطار — وأرقامٌ
//    مضاعفة أسوأ من ناقصة لأنها **تبدو صحيحة**.

void main() {
  final f = StoreFunnel.instance;

  setUp(() {
    f.reset();
    f.flushed = 0;
  });

  group('إسقاط الظهور المكرّر', () {
    test('العنصر نفسه يُسجَّل مرّةً واحدة في الجلسة', () async {
      for (var i = 0; i < 20; i++) {
        f.track(FunnelEvent.impression, itemId: 7);
      }
      await f.flush();
      expect(f.flushed, 1, reason: 'عشرون بناءً لعنصرٍ واحد = ظهورٌ واحد');
    });

    test('عناصر مختلفة تُسجَّل كلّها', () async {
      f.track(FunnelEvent.impression, itemId: 1);
      f.track(FunnelEvent.impression, itemId: 2);
      f.track(FunnelEvent.impression, itemId: 3);
      await f.flush();
      expect(f.flushed, 3);
    });

    test('ظهورٌ بلا معرّف يُهمَل', () {
      f.track(FunnelEvent.impression);
      expect(f.flushed, 0);
    });

    test('التصفير يسمح بتسجيل الظهور من جديد', () async {
      f.track(FunnelEvent.impression, itemId: 7);
      await f.flush();
      f.reset();
      f.flushed = 0;
      f.track(FunnelEvent.impression, itemId: 7);
      await f.flush();
      expect(f.flushed, 1, reason: 'جلسةٌ جديدة = قياسٌ جديد');
    });
  });

  group('الأحداث الأخرى لا تُسقَط', () {
    test('التجربة تُسجَّل مهما تكرّرت — لمسةٌ ثانية نيّةٌ ثانية', () async {
      f.track(FunnelEvent.tryOn, itemId: 5);
      f.track(FunnelEvent.tryOn, itemId: 5);
      await f.flush();
      expect(f.flushed, 2);
    });

    test('نقص الرصيد يُسجَّل — وهو أهمّ إشارةٍ للتسعير', () async {
      f.track(FunnelEvent.shortfall, itemId: 9);
      await f.flush();
      expect(f.flushed, 1);
    });
  });

  group('الطابور', () {
    test('الدفع يفرغه — لا إرسالَ مضاعف', () async {
      f.track(FunnelEvent.open);
      await f.flush();
      final first = f.flushed;
      await f.flush();
      expect(f.flushed, first,
          reason: 'دفعةٌ ثانيةٌ فارغة — إعادةُ الإرسال تضاعف الأرقام');
    });

    test('دفعٌ بلا أحداث آمن', () async {
      await f.flush();
      expect(f.flushed, 0);
    });
  });
}
