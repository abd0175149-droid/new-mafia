import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/entrance.dart';

// ══════════════════════════════════════════════════════
// 🎬 STORE-2 — تطبيع عناصر التشريفة المؤلَّفة
// ══════════════════════════════════════════════════════
// 🔴 كان التطبيق يجهل `design == 'custom'` فيُسقط التشريفة إلى قالب «موكب
//    العرّاب» — **فيعاين المشتري منتجاً غير الذي يشتريه**، وهو أسوأ من
//    غياب المعاينة.
//
// 🔴 والمحروس هنا **مطابقة الحدود لنظيرتها في الويب**
//    (`frontend/src/lib/entrance-schema.ts`): اختلافُ حدٍّ واحد يعني
//    تشريفةً تظهر في التطبيق غير ما تظهر على شاشة القاعة — والمؤلّف
//    يضبطها هناك ويظنّها واحدة.

EntranceElement el(Map m) => EntranceElement.fromJson(m, 0);

void main() {
  group('القصّ على المدى — نفس حدود الويب', () {
    test('الموضع محصورٌ في ±50', () {
      expect(el({'x': 999}).x, 50);
      expect(el({'x': -999}).x, -50);
      expect(el({'y': 12}).y, 12);
    });

    test('الحجم بين 10 و400', () {
      expect(el({'size': 1}).size, 10);
      expect(el({'size': 9999}).size, 400);
    });

    test('الشفافيّة بين 0 و1', () {
      expect(el({'opacity': 5}).opacity, 1);
      expect(el({'opacity': -3}).opacity, 0);
    });

    test('التأخير حتى 5500 والمدّة بين 100 و3000', () {
      expect(el({'delayMs': 99999}).delayMs, 5500);
      expect(el({'durationMs': 1}).durationMs, 100);
      expect(el({'durationMs': 99999}).durationMs, 3000);
    });

    test('النصّ يُقصّ عند أربعين حرفاً', () {
      final long = 'ب' * 200;
      expect(el({'text': long}).text.length, 40);
    });
  });

  group('القيم غير الصالحة تسقط على الافتراضيّ', () {
    test('نوعٌ مجهول ⇒ text', () {
      expect(el({'type': 'ufo'}).type, 'text');
    });

    test('حركةٌ مجهولة ⇒ fade، واتّجاهٌ مجهول ⇒ center', () {
      expect(el({'enterFx': 'teleport'}).enterFx, 'fade');
      expect(el({'from': 'diagonal'}).from, 'center');
    });

    test('لونٌ بصيغةٍ غير #RRGGBB يسقط على الافتراضيّ', () {
      // 🔴 قبولُ صيغٍ أخرى يعني لوناً يُرسم هنا ولا يُرسم هناك.
      expect(el({'color': 'red'}).color, const Color(0xFFFCD34D));
      expect(el({'color': '#fff'}).color, const Color(0xFFFCD34D));
      expect(el({'color': '#12345G'}).color, const Color(0xFFFCD34D));
    });

    test('لونٌ صحيح يُقرأ كما هو', () {
      expect(el({'color': '#8A0303'}).color, const Color(0xFF8A0303));
    });

    test('عددٌ نصّيّ يُقرأ، ونصٌّ غير رقميّ يسقط', () {
      expect(el({'size': '250'}).size, 250);
      expect(el({'size': 'كبير'}).size, 100);
    });
  });

  group('قراءة القائمة', () {
    test('حدّ أقصى عشرة عناصر', () {
      final many = List.generate(30, (i) => {'type': 'text'});
      expect(EntranceElement.parse({'elements': many}).length, 10,
          reason: 'مسرحٌ مزدحم لا يُقرأ من ثلاثة أمتار — نفس حدّ الويب');
    });

    test('ما ليس Map يُتخطّى بلا انهيار', () {
      final out = EntranceElement.parse({
        'elements': ['نصّ', 42, null, {'type': 'bar'}]
      });
      expect(out.length, 1);
      expect(out.first.type, 'bar');
    });

    test('غياب elements يعطي فارغة', () {
      expect(EntranceElement.parse({'design': 'custom'}), isEmpty);
      expect(EntranceElement.parse(null), isEmpty);
    });
  });

  group('طول المشهد', () {
    test('أطولُ (تأخير + مدّة) هو الطول', () {
      final els = [
        el({'delayMs': 0, 'durationMs': 600}),
        el({'delayMs': 2000, 'durationMs': 800}),
        el({'delayMs': 500, 'durationMs': 300}),
      ];
      expect(EntranceElement.totalMs(els), 2800,
          reason: 'قصُّه دون ذلك يقطع العنصر الأخير قبل ظهوره');
    });

    test('قائمةٌ فارغة ⇒ صفر', () {
      expect(EntranceElement.totalMs(const []), 0);
    });
  });
}
