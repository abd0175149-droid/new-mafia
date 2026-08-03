import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/card_template.dart';

// ══════════════════════════════════════════════════════
// 🧪 قالب بطاقة الدور — §4.3 في الملفّ 22
// ══════════════════════════════════════════════════════
// 🔴 الانحدار: شاشة اللعب لم تكن تُحمّل كتالوج اللعبة، فلا قالب دورٍ ولا
//    اسمٌ عربيّ ولا إزاحة رقم — فرُسمت البطاقة بقيمٍ افتراضية والرقم في
//    منتصفها، واسم الدور بالإنجليزية. وشكا المالك من الاثنين.

void main() {
  // القالب الحقيقيّ في الإنتاج
  final silencer = CardTemplate.fromJson({
    'id': 'silencer_card',
    'gradient': 'linear-gradient(to bottom, #6b2121, #1c0a0a, #0a0000)',
    'borderColor': 'rgba(255, 255, 255, 0.6)',
    'textColor': '#ffffff',
    'glowEffect': '0 0 25px rgba(255, 255, 255, 0.4)',
    'secretFace': {
      'type': 'custom',
      'customImageUrl': '/uploads/card-faces/silencer_card-1781526598123.jpg',
    },
    'elements': {
      'positions': {
        'coverNumber': {'s': 1, 'x': 78.18179321289062, 'y': -54.545440673828125},
      },
      'shapes': [
        {
          'h': 220, 'w': 80, 'x': 69.99, 'y': -57.27, 'bg': '#212121',
          'face': 'cover', 'type': 'rect', 'radius': 0, 'zIndex': 1,
          'opacity': 0.5,
        },
      ],
    },
  });

  group('🔴 وجه الدور المخصّص', () {
    test('صورةٌ مرفوعة تُقرأ ويُعلَن عنها', () {
      expect(silencer.hasSecretImage, isTrue);
      expect(silencer.secretImageUrl,
          '/uploads/card-faces/silencer_card-1781526598123.jpg');
    });

    test('قالبٌ بلا صورة لا يدّعيها', () {
      expect(const CardTemplate().hasSecretImage, isFalse);
      expect(
          CardTemplate.fromJson({'secretFace': {'type': 'GENERATED'}})
              .hasSecretImage,
          isFalse);
      expect(CardTemplate.fromJson({}).hasSecretImage, isFalse);
    });
  });

  group('🔴 لكلّ دورٍ إزاحة رقمه', () {
    test('إزاحة قالب الدور تختلف عن الرئيسيّ', () {
      final p = silencer.coverNumber!;
      expect(p.x, closeTo(78.18, 0.01));
      expect(p.y, closeTo(-54.55, 0.01));
      expect(p.s, 1);

      // الرئيسيّ له إزاحته الخاصّة — إبقاؤه على وجه الدور يضع الرقم خطأ
      final master = CardTemplate.fromJson({
        'elements': {
          'positions': {'coverNumber': {'s': 0.8, 'x': 70.73, 'y': -31.73}}
        }
      });
      expect(master.coverNumber!.x, isNot(closeTo(p.x, 0.01)));
      expect(master.coverNumber!.s, isNot(p.s));
    });

    test('بلا قالبٍ يبقى الرقم موسَّطاً — وهذا ما ظهر عند غياب الكتالوج', () {
      expect(const CardTemplate().coverNumber, isNull);
    });
  });

  test('قالب الدور يحمل أشكاله وتدرّجه وحدّه', () {
    expect(silencer.coverShapes.length, 1);
    expect(silencer.coverShapes.single.bg, '#212121');
    expect(silencer.bodyGradient!.colors.length, 3);
    expect(silencer.border.a, closeTo(0.6, 0.01));
    expect(silencer.glow!.blurRadius, 25);
  });
}
