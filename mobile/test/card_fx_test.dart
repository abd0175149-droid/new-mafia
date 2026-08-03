import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/cosmetics/card_fx_layer.dart';
import 'package:mafia_club/models/card_fx.dart';
import 'package:mafia_club/models/title_plaque.dart';

// ══════════════════════════════════════════════════════
// 🧪 عقد تأثيرات البطاقة — مرآة `lib/chips-fx.ts`
// ══════════════════════════════════════════════════════
// هذه ليست اختبارات تجميل: إعدادٌ فاسدٌ يمرّ من هنا يُسقط بطاقات شاشة
// القاعة كلّها، وقناةٌ تُقرأ خطأً تجعل اللاعب يدفع ثمن ما لا يراه.

void main() {
  group('🔴 القصّ يمنع الفاسد من الوصول للرسّام', () {
    test('لا شيء إطلاقاً ⇒ كائنٌ كامل بكل القنوات مطفأة', () {
      for (final bad in [null, 'نصّ', 42, <dynamic>[], true]) {
        final fx = normalizeFx(bad);
        expect(fx.anyEnabled, isFalse, reason: 'مُدخل: $bad');
        expect(fx.border.color, '#f59e0b');
        expect(fx.border.gradientColors.length, greaterThanOrEqualTo(2));
      }
    });

    test('لونٌ فاسد يعود للافتراضيّ ولا يرمي', () {
      final fx = normalizeFx({
        'border': {'enabled': true, 'color': 'red'},
        'glow': {'enabled': true, 'color': '#12345'},
      });
      expect(fx.border.color, '#f59e0b');
      expect(fx.glow.color, '#f59e0b');
    });

    test('الأرقام تُقصّ إلى مداها', () {
      final fx = normalizeFx({
        'border': {'enabled': true, 'width': 999, 'inset': -999, 'travelSpeed': 0.01},
        'glow': {'enabled': true, 'size': 1e9, 'opacity': 5},
        'particles': {'enabled': true, 'count': 500},
      });
      expect(fx.border.width, 6);
      expect(fx.border.inset, -10);
      expect(fx.border.travelSpeed, 0.5);
      expect(fx.glow.size, 60);
      expect(fx.glow.opacity, 1);
      // سقفٌ صارم: عنصرٌ لكل جزيئة، وعددٌ غير محدود يُجمّد الشاشة
      expect(fx.particles.count, 12);
    });

    test('قيمةٌ خارج القائمة تعود للافتراضيّ', () {
      final fx = normalizeFx({
        'border': {'style': 'rainbow'},
        'frame': {'type': 'hexagon'},
        'floating': {'animation': 'explode', 'position': 'middle'},
      });
      expect(fx.border.style, BorderStyleFx.solid);
      expect(fx.frame.type, FrameTypeFx.none);
      expect(fx.floating.animation, FloatAnim.float);
      expect(fx.floating.position, 'top');
    });
  });

  group('🔴 قواعد لا تُكسَر', () {
    test('تدرّجٌ بلونٍ واحد يُكرَّر — لونٌ واحد يُسقط الخاصية فيختفي الإطار', () {
      final one = normalizeFx({
        'border': {'enabled': true, 'style': 'gradient', 'gradientColors': ['#ff0000']}
      });
      expect(one.border.gradientColors, ['#ff0000', '#ff0000']);

      final none = normalizeFx({
        'border': {'enabled': true, 'color': '#00ff00', 'gradientColors': <dynamic>[]}
      });
      expect(none.border.gradientColors, ['#00ff00', '#00ff00']);

      // الفاسد يُصفّى ثمّ يُكرَّر الباقي
      final mixed = normalizeFx({
        'border': {'gradientColors': ['#ff0000', 'nope', 12]}
      });
      expect(mixed.border.gradientColors, ['#ff0000', '#ff0000']);
    });

    test('التوهّج مطفأ حتماً إن كان الإطار مطفأ — وعدٌ لا يتحقّق', () {
      final fx = normalizeFx({
        'border': {'enabled': false},
        'glow': {'enabled': true, 'size': 30},
      });
      expect(fx.glow.enabled, isFalse);

      final on = normalizeFx({
        'border': {'enabled': true},
        'glow': {'enabled': true},
      });
      expect(on.glow.enabled, isTrue);
    });

    test('طبقة التأثيرات لا تُرسم لتوهّجٍ أو تأثير اسمٍ وحدهما', () {
      final glowOnly = normalizeFx({
        'border': {'enabled': true},
        'glow': {'enabled': true},
      });
      // الإطار مفعّل هنا فالطبقة تستحقّ — والمقصود أن التوهّج وحده لا يكفي
      expect(glowOnly.hasLayerVisuals, isTrue);

      final nameOnly = normalizeFx({'nameEffect': {'enabled': true}});
      expect(nameOnly.anyEnabled, isTrue);
      expect(nameOnly.hasLayerVisuals, isFalse);
    });
  });

  group('🪙 الدمج الطبقيّ — الشراء لا يعاقب اللاعب الرفيع', () {
    test('قناةٌ لا يمسّها المشترى تبقى كما منحتها الرتبة', () {
      final rank = {
        'border': {'enabled': true, 'color': '#ff0000'},
        'badge': {'enabled': true, 'emoji': '👑', 'label': 'الأب الروحيّ'},
        'corners': {'enabled': true, 'color': '#ff0000'},
      };
      final paid = {
        'border': {'enabled': true, 'color': '#00ff00'},
      };

      final m = mergeFx(rank, paid);
      // المشترى يفوز بقناته
      expect(m.border.color, '#00ff00');
      // وما لم يمسّه يبقى للرتبة — الشارة والزوايا
      expect(m.badge.enabled, isTrue);
      expect(m.badge.emoji, '👑');
      expect(m.corners.enabled, isTrue);
      expect(m.corners.color, '#ff0000');
    });

    test('إعدادٌ مشترى فارغ لا يحجب شكل الرتبة', () {
      final rank = {'border': {'enabled': true, 'color': '#ff0000'}};
      expect(mergeFx(rank, <String, dynamic>{}).border.color, '#ff0000');
      expect(mergeFx(rank, null).border.enabled, isTrue);
    });
  });

  group('🎨 تحويل ألوان CSS', () {
    test('السداسيّ', () {
      expect(parseCssColor('#f59e0b'), const Color(0xFFF59E0B));
      expect(parseCssColor('#000000'), const Color(0xFF000000));
    });

    // 🔴 ألوان الشارات واللوحات مخزَّنة rgba فعلاً — قصرُ المحلّل على
    //    السداسيّ يجعلها كلّها شفّافة
    test('rgba و rgb', () {
      final c = parseCssColor('rgba(69,26,3,0.8)');
      expect(c.r * 255, closeTo(69, 1));
      expect(c.g * 255, closeTo(26, 1));
      expect(c.b * 255, closeTo(3, 1));
      expect(c.a, closeTo(0.8, 0.01));

      final o = parseCssColor('rgb(255, 0, 0)');
      expect(o.r * 255, closeTo(255, 1));
      expect(o.a, 1);
    });

    test('الفاسد يعود للافتراضيّ لا يرمي', () {
      expect(parseCssColor('nonsense'), const Color(0xFFF59E0B));
      expect(parseCssColor(''), const Color(0xFFF59E0B));
      expect(parseCssColor('rgba(bad)'), const Color(0xFFF59E0B));
    });
  });

  group('🔤 تأثير الاسم', () {
    test('الافتراضيّ هو المسار القديم حرفياً — glow بلا حركة', () {
      final n = normalizeNameFx({'enabled': true});
      expect(n.style, NameFxStyle.glow);
      expect(n.anim, NameFxAnim.none);
      expect(n.enter, NameFxEnter.none);
      expect(n.color, '#ffffff');
      expect(n.glowSize, 8);
    });

    test('حدُّ الحرف لا يتجاوز ٢ — فوقها يبتلع الخطَّ العربيّ', () {
      expect(normalizeNameFx({'outlineWidth': 9}).outlineWidth, 2);
    });

    test('الأنماط والحركات تُقرأ بأسمائها', () {
      final n = normalizeNameFx({
        'style': 'gradient', 'anim': 'sweep', 'enter': 'rise', 'angle': 400,
      });
      expect(n.style, NameFxStyle.gradient);
      expect(n.anim, NameFxAnim.sweep);
      expect(n.enter, NameFxEnter.rise);
      expect(n.angle, 360);
    });
  });

  group('🏷️ لوحة اللقب', () {
    // 🔴 الجاهز لا يمرّ بالتطبيع: توهّج الذهبيّ ظلُّ **نصّ** لا صندوق،
    //    وحركتا الدمويّ والشبحيّ لا مقابل لهما في قنوات المخصّص
    test('الأنماط الثلاثة بقيمها الحرفيّة من CSS', () {
      final gold = presetPlaque('gold');
      expect(gold.bg, 'rgba(69,26,3,0.8)');
      expect(gold.textColor, '#fcd34d');
      expect(gold.textShadowSize, 8);
      expect(gold.anim, PresetPlaqueAnim.none);

      final blood = presetPlaque('blood');
      expect(blood.bg, 'rgba(69,10,10,0.8)');
      expect(blood.anim, PresetPlaqueAnim.pulseBox);
      expect(blood.animSeconds, 1.6);

      final ghost = presetPlaque('ghost');
      expect(ghost.anim, PresetPlaqueAnim.fade);
      expect(ghost.animSeconds, 3);
    });

    test('نمطٌ مجهول يسقط على الذهبيّ', () {
      expect(presetPlaque('platinum').bg, presetPlaque('gold').bg);
      expect(presetPlaque(null).bg, presetPlaque('gold').bg);
    });

    test('custom وحده يُبنى من البيانات', () {
      expect(isCustomPlaque('custom'), isTrue);
      expect(isCustomPlaque('gold'), isFalse);

      final p = normalizeTitlePlaque({
        'bg': {'type': 'gradient', 'angle': 999},
        'text': {'size': 99, 'weight': 555},
        'border': {'width': 99},
      });
      expect(p.bg.isGradient, isTrue);
      expect(p.bg.angle, 360);
      expect(p.text.size, 20);
      // وزنٌ خارج القائمة يعود للافتراضيّ
      expect(p.text.weight, 900);
      expect(p.border.width, 4);
    });
  });

  group('قصّ التوهّج', _glowClipTests);
}

// ══════════════════════════════════════════════════════
// 🔴 الانحدار: التوهّج يطلي البطاقة كلّها
// ══════════════════════════════════════════════════════
// `box-shadow` في CSS يُقصّ ما تحت العنصر فلا يظهر إلّا خارجه. و`BoxShadow`
// في Flutter يرسم شكلاً مموّهاً كاملاً لا يُقصّ — فتوهّجٌ بحجم ٢٦ وشفافية
// ٠٫٥٥ فوق طبقة حدٍّ بلا حشو يسيل على البطاقة ويطليها بلون الإطار.
// شكا المالك من «طبقة كاملة بلون لكل إطار».
void _glowClipTests() {
  testWidgets('التوهّج لا يُرسم داخل البطاقة', (t) async {
    // إعداد «تاج العرّاب» الحقيقيّ: توهّجٌ كبير فوق حدٍّ متدرّج
    final fx = normalizeFx({
      'border': {
        'enabled': true,
        'style': 'traveling',
        'width': 3,
        'gradientColors': ['#b45309', '#fcd34d'],
      },
      'glow': {'enabled': true, 'size': 26, 'opacity': 0.55, 'color': '#f59e0b'},
    });
    expect(fx.glow.enabled, isTrue);

    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: 176,
            height: 240,
            child: Stack(children: [
              // خلفيّة سوداء تمثّل جسم البطاقة
              const Positioned.fill(child: ColoredBox(color: Colors.black)),
              Positioned.fill(child: CardFxLayer(fx: fx, animate: false)),
            ]),
          ),
        ),
      ),
    ));
    await t.pump();

    // 🔴 لا `BoxShadow` في أيّ زخرفةٍ داخل الطبقة: وجودها يعني شكلاً
    //    مموّهاً غير مقصوص فوق البطاقة
    final shadows = t
        .widgetList<DecoratedBox>(find.byType(DecoratedBox))
        .map((d) => d.decoration)
        .whereType<BoxDecoration>()
        .expand((d) => d.boxShadow ?? const <BoxShadow>[])
        .toList();
    expect(shadows, isEmpty,
        reason: 'التوهّج يجب أن يُقصّ خارج البطاقة لا أن يُرسم صندوقاً');
    expect(t.takeException(), isNull);
  });
}
