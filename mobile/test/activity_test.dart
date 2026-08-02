import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/activity.dart';

// ══════════════════════════════════════════════════════
// 🧪 نماذج الألعاب والحجوزات — الملفّ 14
// ══════════════════════════════════════════════════════

void main() {
  Activity a(Map<String, dynamic> j) => Activity.fromJson(j);

  group('🔴 السعر نصّ لا رقم', () {
    test('«0» مجّانيّ، و«0.00» ليست كذلك', () {
      // المقارنة في الويب نصّية؛ عمود decimal يعيد '0.00' فيُعرض سعراً.
      // تحويلها إلى رقم هنا يُخفي سعراً يظهر على الويب.
      expect(a({'basePrice': '0'}).isFree, isTrue);
      expect(a({'basePrice': '0.00'}).isFree, isFalse);
      expect(a({}).isFree, isTrue);
      expect(a({'basePrice': '15'}).isFree, isFalse);
    });

    test('رقم قادم من الخادم يُقرأ نصّاً', () {
      expect(a({'basePrice': 12}).basePrice, '12');
    });
  });

  group('السعة', () {
    test('maxPlayers الغائب أو الصفر يصير 20 — لا قسمة على صفر', () {
      expect(a({}).maxPlayers, 20);
      expect(a({'maxPlayers': 0}).maxPlayers, 20);
      expect(a({'maxPlayers': 0}).fillRatio, 0);
    });

    test('الامتلاء والنسبة مقيّدة', () {
      expect(a({'bookedCount': 20, 'maxPlayers': 20}).isFull, isTrue);
      expect(a({'bookedCount': 25, 'maxPlayers': 20}).isFull, isTrue);
      expect(a({'bookedCount': 25, 'maxPlayers': 20}).fillRatio, 1);
      expect(a({'bookedCount': 5, 'maxPlayers': 20}).fillRatio, 0.25);
    });
  });

  group('الصعوبة', () {
    test('المجهول يسقط إلى متوسط', () {
      expect(Difficulty.of('hard').label, 'صعب');
      expect(Difficulty.of('hard').color, const Color(0xFFEF4444));
      expect(Difficulty.of(null).label, 'متوسط');
      expect(Difficulty.of('impossible').label, 'متوسط');
    });
  });

  group('العروض', () {
    test('سلسلة الاحتياطيّ name ← title ← «عرض n»', () {
      expect(LocationOffer.fromJson(const {'name': 'باقة'}).labelAt(0), 'باقة');
      expect(LocationOffer.fromJson(const {'title': 'عنوان'}).labelAt(0), 'عنوان');
      expect(LocationOffer.fromJson(const {}).labelAt(2), 'عرض 3');
      // الفراغات لا تعدّ اسماً
      expect(LocationOffer.fromJson(const {'name': '  ', 'title': 'ب'}).labelAt(0), 'ب');
    });
  });

  group('🗓️ التقويم العربيّ — منقول لا مولَّد', () {
    test('الأحد صفر رغم أن weekday يجعله سبعة', () {
      expect(dayNameOf(DateTime(2026, 8, 2)), 'أحد');   // الأحد
      expect(dayNameOf(DateTime(2026, 8, 3)), 'اثنين');
      expect(dayNameOf(DateTime(2026, 8, 8)), 'سبت');
    });

    test('الشهور بالأسماء المستعملة في الويب', () {
      expect(monthNameOf(DateTime(2026, 1, 1)), 'يناير');
      expect(monthNameOf(DateTime(2026, 8, 1)), 'أغسطس');
      expect(monthNameOf(DateTime(2026, 12, 1)), 'ديسمبر');
    });
  });

  group('الغرف النشطة', () {
    test('اسمٌ غائب يصير «غرفة n»', () {
      expect(ActiveRoom.fromJson(const {'sessionCode': 'AB'}).nameAt(0), 'غرفة 1');
      expect(ActiveRoom.fromJson(const {'sessionCode': 'AB', 'sessionName': 'الأولى'})
          .nameAt(0), 'الأولى');
    });
  });
}
