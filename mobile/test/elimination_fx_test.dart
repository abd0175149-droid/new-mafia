import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/cosmetics/elimination_fx.dart';

// ══════════════════════════════════════════════════════
// 🧪 أنيميشن الإقصاء — خمسة تصاميم
// ══════════════════════════════════════════════════════

void main() {
  // 🔒 الفخّ الذي يحذّر منه المصدر: البوّابة صدقُ **قيمة** لا وجودها.
  //    تبديلها بـ«هل يوجد إعداد؟» يجعل كل تصميمٍ قادم يرسم ناراً.
  group('🔴 تصميمٌ مجهول لا يرسم ناراً بالخطأ', () {
    test('بلا تصميم ⇒ لا شيء', () {
      expect(hasElimDesign(null), isFalse);
      expect(hasElimDesign(<String, dynamic>{}), isFalse);
      expect(hasElimDesign({'color': '#ff0000'}), isFalse);
    });

    test('تصميمٌ لم يوجد بعد ⇒ لا شيء — لا نار', () {
      expect(hasElimDesign({'design': 'vaporize'}), isFalse);
      expect(hasElimDesign({'design': ''}), isFalse);
    });

    test('الخمسة المعروفة وحدها تُرسم', () {
      for (final d in ['burn', 'ash', 'drain', 'shatter', 'static']) {
        expect(hasElimDesign({'design': d}), isTrue, reason: d);
      }
    });

    testWidgets('الودجت لا يرسم شيئاً لتصميمٍ مجهول', (t) async {
      await t.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: Center(
          child: EliminationFxView(
              config: {'design': 'vaporize'}, animate: false),
        ),
        ),
      ));
      // لا مساحة أصلاً — لا طبقة ولا لون
      expect(t.getSize(find.byType(EliminationFxView)), Size.zero);
    });
  });

  group('التطبيع', () {
    test('لكل تصميمٍ افتراضاته الخاصّة', () {
      expect(normalizeElimFx({'design': 'burn'}).particles, 7);
      expect(normalizeElimFx({'design': 'ash'}).particles, 12);
      expect(normalizeElimFx({'design': 'drain'}).particles, 0);
      expect(normalizeElimFx({'design': 'shatter'}).particles, 8);
      expect(normalizeElimFx({'design': 'ash'}).color, '#a8a29e');
    });

    // ⚠️ تُرسم لكل مُقصى على شاشة قاعةٍ واحدة — بلا سقفٍ يسقط معدّل الإطارات
    test('سقف الجسيمات ١٦', () {
      expect(normalizeElimFx({'design': 'burn', 'particles': 999}).particles, 16);
      expect(normalizeElimFx({'design': 'burn', 'particles': -5}).particles, 0);
    });

    test('السرعة مضاعِفٌ لا زمن — والمقلوب يطيل المدّة', () {
      expect(normalizeElimFx({'design': 'burn', 'speed': 2}).durMul, 0.5);
      expect(normalizeElimFx({'design': 'burn', 'speed': 0.5}).durMul, 2);
      // مقصوصة إلى ٠٫٢٥…٣
      expect(normalizeElimFx({'design': 'burn', 'speed': 99}).speed, 3);
    });

    test('لونٌ فاسد يعود لافتراضيّ التصميم', () {
      final f = normalizeElimFx({'design': 'shatter', 'color': 'blue'});
      expect(f.color, '#e0f2fe');
    });
  });

  testWidgets('التصاميم الخمسة تُرسم بلا استثناء', (t) async {
    for (final d in ['burn', 'ash', 'drain', 'shatter', 'static']) {
      await t.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 176,
              height: 240,
              child: EliminationFxView(config: {'design': d}),
            ),
          ),
        ),
      ));
      await t.pump(const Duration(milliseconds: 300));
      expect(t.takeException(), isNull, reason: d);
    }
  });
}
