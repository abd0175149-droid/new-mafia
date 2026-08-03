import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/cosmetics/card_fx_layer.dart';
import 'package:mafia_club/features/cosmetics/mafia_card_view.dart';
import 'package:mafia_club/models/card_fx.dart';
import 'package:mafia_club/models/store.dart';

// ══════════════════════════════════════════════════════
// ⚡ أداء طبقة المظهر — §13 في الملفّ ٣٤
// ══════════════════════════════════════════════════════
// «الأداء هو الخطر الحقيقيّ في هذا الملف»: بطاقةٌ واحدة قد تحمل توهّجاً
// نابضاً وبريقاً وأربع جسيماتٍ مدارية وحدّاً متحرّكاً وشعاراً طافياً —
// والشبكة تعرض ستّاً. هذه المجموعة تقيس بدل أن تفترض.

/// إعدادُ إطارٍ ثقيلٍ يُشعل كلّ القنوات.
const _heavyFrame = {
  'border': {'enabled': true, 'color': '#C5A059', 'animate': true},
  'glow': {'enabled': true, 'color': '#C5A059', 'size': 20},
  'shimmer': {'enabled': true},
  'particles': {'enabled': true, 'count': 8, 'color': '#C5A059'},
  'corners': {'enabled': true, 'color': '#C5A059'},
  'floating': {'enabled': true, 'emoji': '👑'},
};

EquippedCosmetics _kit() => EquippedCosmetics(
      frame: const CosmeticSlot(itemId: 1, config: _heavyFrame),
    );

Widget _card({Key? key}) => MafiaCardView(
      key: key,
      size: CardSize.sm,
      playerNumber: 3,
      playerName: 'عبدالله',
      cosmetics: _kit(),
    );

Widget _wrap(Widget child) => MediaQuery(
      data: const MediaQueryData(size: Size(1200, 1600)),
      child: MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(body: child),
        ),
      ),
    );

/// عدد المؤقّتات الحيّة — المقياس الحقيقيّ لا التعليق.
int get _tickers => SchedulerBinding.instance.transientCallbackCount;

void main() {
  group('② ساعةٌ واحدة — قياساً لا ادّعاءً', () {
    testWidgets('🔴 ستّ بطاقاتٍ تحت مزوِّدٍ واحد ⇒ مؤقّتٌ واحد', (t) async {
      // قبل الإصلاح كان كلّ `FxClock` يملك مؤقّته: بطاقةٌ فيها إطارٌ
      // وشعارٌ واسمٌ ولقب = أربعةٌ أو خمسة، وستّ بطاقاتٍ ≈ ثلاثون.
      await t.pumpWidget(_wrap(
        FxClockProvider(
          child: Wrap(children: [for (var i = 0; i < 6; i++) _card()]),
        ),
      ));
      await t.pump(const Duration(milliseconds: 16));
      expect(_tickers, 1);
      await t.pump(const Duration(seconds: 1));
      expect(_tickers, 1);
    });

    testWidgets('وبطاقةٌ واحدة بلا مزوِّد تُنشئ ساعتها', (t) async {
      await t.pumpWidget(_wrap(_card()));
      await t.pump(const Duration(milliseconds: 16));
      // واحدةٌ لا أكثر — القنوات كلّها تقرأ من نطاقها
      expect(_tickers, 1);
    });

    testWidgets('🔒 مزوِّدٌ داخل مزوِّد لا يضاعف', (t) async {
      await t.pumpWidget(_wrap(
        FxClockProvider(
          child: FxClockProvider(child: _card()),
        ),
      ));
      await t.pump(const Duration(milliseconds: 16));
      expect(_tickers, 1);
    });

    testWidgets('«تقليل الحركة» يُسكن المؤقّت — والبطاقة تبقى مرئية',
        (t) async {
      await t.pumpWidget(MediaQuery(
        data: const MediaQueryData(
            size: Size(1200, 1600), disableAnimations: true),
        child: MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(
              body: FxClockProvider(
                child: Wrap(children: [for (var i = 0; i < 6; i++) _card()]),
              ),
            ),
          ),
        ),
      ));
      await t.pump(const Duration(milliseconds: 16));
      expect(_tickers, 0);
      // مرئيّةٌ ساكنة لا مختفية — اللاعب دفع ثمنها
      expect(find.byType(MafiaCardView), findsNWidgets(6));
    });
  });

  group('① حدود إعادة الرسم', () {
    testWidgets('🔴 كلّ بطاقةٍ داخل حدّها', (t) async {
      await t.pumpWidget(_wrap(
        FxClockProvider(
          child: Wrap(children: [for (var i = 0; i < 6; i++) _card()]),
        ),
      ));
      // بدونها يُعاد رسم الشبكة كلّها عند كلّ إطار
      final boundaries = t
          .widgetList<RepaintBoundary>(find.descendant(
            of: find.byType(MafiaCardView).first,
            matching: find.byType(RepaintBoundary),
          ))
          .length;
      expect(boundaries, greaterThan(0));
    });
  });

  group('④ تقليل الجسيمات في الشبكات', () {
    test('«أكثر من ٦ ⇒ النصف» — والستّةُ نفسها لا تُقلَّل', () {
      expect(_halved(6), isFalse);
      expect(_halved(7), isTrue);
      expect(_halved(1), isFalse);
    });

    testWidgets('الشبكة الكبيرة تُعلن التقليل لأبنائها', (t) async {
      bool? seen;
      await t.pumpWidget(_wrap(FxDensity.forCount(
        12,
        child: Builder(builder: (ctx) {
          seen = FxDensity.of(ctx);
          return const SizedBox();
        }),
      )));
      expect(seen, isTrue);
    });

    testWidgets('والصغيرة لا تُقلّل — المرآة بطاقةٌ واحدة', (t) async {
      bool? seen;
      await t.pumpWidget(_wrap(FxDensity.forCount(
        3,
        child: Builder(builder: (ctx) {
          seen = FxDensity.of(ctx);
          return const SizedBox();
        }),
      )));
      expect(seen, isFalse);
    });

    testWidgets('وبلا سياقٍ يُفترض عدم التقليل', (t) async {
      bool? seen;
      await t.pumpWidget(_wrap(Builder(builder: (ctx) {
        seen = FxDensity.of(ctx);
        return const SizedBox();
      })));
      expect(seen, isFalse);
    });
  });

  group('⑥ التطبيع يُخزَّن مؤقّتاً', () {
    test('🔴 نفس الخريطة ⇒ نفس الكائن — لا إعادة تطبيعٍ كلّ إطار', () {
      // كان يُعاد في كلّ `build`، أي في كلّ إطارٍ ما دامت الساعة تدور:
      // عشر قنواتٍ وعشرات القيم المحصورة ستّين مرّةً في الثانية.
      const cfg = _heavyFrame;
      final a = normalizeFx(cfg);
      final b = normalizeFx(cfg);
      expect(identical(a, b), isTrue);
    });

    test('وخريطةٌ أخرى تُطبَّع من جديد', () {
      final a = normalizeFx(const {
        'border': {'enabled': true},
        'glow': {'enabled': true}
      });
      final b = normalizeFx(const {
        'border': {'enabled': true},
        'glow': {'enabled': false}
      });
      expect(identical(a, b), isFalse);
      expect(a.glow.enabled, isTrue);
      expect(b.glow.enabled, isFalse);
    });

    test('🔒 والتخزين لا يخرق قِران التوهّج بالإطار', () {
      // التوهّج يُرسم داخل كتلة الإطار حصراً، فتفعيله والإطار مطفأ وعدٌ
      // لا يتحقّق. أخطأتُ في أوّل صياغةٍ للاختبار فظننتُه عطلاً — وهو
      // قاعدةٌ موثّقة. تُحرَس هنا كي لا يكسرها تخزينٌ مؤقّت يوماً.
      final off = normalizeFx(const {'glow': {'enabled': true}});
      expect(off.glow.enabled, isFalse);
    });

    test('تأثير الاسم كذلك', () {
      const n = {'enabled': true, 'color': '#ff0000'};
      expect(identical(normalizeNameFx(n), normalizeNameFx(n)), isTrue);
    });

    test('غير الخرائط لا يُخزَّن ولا يُسقط', () {
      expect(normalizeFx(null).anyEnabled, isFalse);
      expect(normalizeFx('نصّ').anyEnabled, isFalse);
      expect(normalizeNameFx(null).enabled, isFalse);
    });
  });
}

bool _halved(int count) {
  final w = FxDensity.forCount(count, child: const SizedBox());
  return (w as FxDensity).halved;
}
