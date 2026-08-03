import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/card_template.dart';

// ══════════════════════════════════════════════════════
// 🧪 قالب البطاقة — من `/api/game-config/card-templates`
// ══════════════════════════════════════════════════════
// 🔴 البطاقة مدفوعة بالبيانات: موضع الرقم وأشكال الغلاف ولون الحدّ كلّها
//    من القالب. رسمُها بقيمٍ ثابتة يجعل ما يراه اللاعب في التطبيق غير ما
//    يراه على شاشة القاعة — وهو خللٌ لاحظه المالك فعلاً.

void main() {
  // القالب الحقيقيّ في الإنتاج (`master`) — القيم منسوخة كما تصل
  final master = CardTemplate.fromJson({
    'id': 'master',
    'gradient': 'linear-gradient(to bottom, #936b15, #2c230c)',
    'borderColor': 'rgba(255, 255, 255, 0.35)',
    'textColor': '#ffffff',
    'glowEffect': '0 0 53px rgba(94, 86, 3, 0.55)',
    'elements': {
      'showPlayerNumber': true,
      'showClubBranding': true,
      'positions': {
        'coverNumber': {'s': 0.8, 'x': 70.72988891601562, 'y': -31.727294921875},
        'coverFooter': {'s': 1.4, 'x': 0, 'y': 9},
      },
      'shapes': [
        {
          'h': 350, 'w': 100, 'x': 86.36, 'y': -118.18, 'bg': '#63696d',
          'id': 'imwkpwo32j', 'face': 'cover', 'type': 'rect',
          'radius': 0, 'zIndex': 2, 'opacity': 0.5,
        },
        {'face': 'role', 'type': 'rect', 'w': 10, 'h': 10, 'bg': '#fff'},
      ],
    },
  });

  group('🔴 موضع الرقم — سبب اختلاف الشكل عن شاشة القاعة', () {
    test('يُقرأ بإزاحته ومقياسه لا موسَّطاً', () {
      final p = master.coverNumber!;
      expect(p.x, closeTo(70.73, 0.01));
      expect(p.y, closeTo(-31.73, 0.01));
      expect(p.s, closeTo(0.8, 0.001));
    });

    test('غيابه يعني التوسيط — لا إزاحة مخترعة', () {
      expect(const CardTemplate().coverNumber, isNull);
    });
  });

  group('الأشكال', () {
    test('أشكال الغلاف وحدها تُرسم على الغلاف', () {
      expect(master.shapes.length, 2);
      expect(master.coverShapes.length, 1);
      expect(master.coverShapes.single.bg, '#63696d');
      expect(master.coverShapes.single.opacity, 0.5);
      expect(master.coverShapes.single.w, 100);
      expect(master.coverShapes.single.h, 350);
    });

    test('تُرتَّب بـ zIndex — لا بترتيب وصولها', () {
      final t = CardTemplate.fromJson({
        'elements': {
          'shapes': [
            {'face': 'cover', 'zIndex': 5, 'bg': '#aaaaaa', 'w': 1, 'h': 1},
            {'face': 'cover', 'zIndex': 1, 'bg': '#bbbbbb', 'w': 1, 'h': 1},
          ]
        }
      });
      expect(t.coverShapes.map((s) => s.bg), ['#bbbbbb', '#aaaaaa']);
    });
  });

  group('تحليل CSS', () {
    test('لون الحدّ rgba يُقرأ بشفافيته', () {
      final c = master.border;
      expect(c.r * 255, closeTo(255, 1));
      expect(c.a, closeTo(0.35, 0.01));
    });

    test('التوهّج «0 0 53px rgba(…)» يصير ظلّاً بلا إزاحة', () {
      final g = master.glow!;
      expect(g.blurRadius, 53);
      expect(g.offset, Offset.zero);
      expect(g.color.a, closeTo(0.55, 0.01));
    });

    test('توهّجٌ فارغ لا يُنتج ظلّاً', () {
      expect(const CardTemplate().glow, isNull);
      expect(CardTemplate.fromJson({'glowEffect': 'none'}).glow, isNull);
    });

    test('التدرّج يُقرأ باتجاهه وألوانه', () {
      final g = master.bodyGradient!;
      expect(g.begin, Alignment.topCenter);
      expect(g.end, Alignment.bottomCenter);
      expect(g.colors.first, const Color(0xFF936B15));
      expect(g.colors.last, const Color(0xFF2C230C));
    });

    test('تدرّجٌ فاسد لا يرمي', () {
      expect(CardTemplate.fromJson({'gradient': 'nonsense'}).bodyGradient, isNull);
      expect(
          CardTemplate.fromJson({'gradient': 'linear-gradient(to top)'})
              .bodyGradient,
          isNull);
    });
  });

  test('استجابةٌ فارغة تُعطي قالباً صالحاً لا تُسقط الرسم', () {
    final t = CardTemplate.fromJson({});
    expect(t.id, 'master');
    expect(t.showPlayerNumber, isTrue);
    expect(t.coverShapes, isEmpty);
    expect(t.border, isNotNull);
  });
}
