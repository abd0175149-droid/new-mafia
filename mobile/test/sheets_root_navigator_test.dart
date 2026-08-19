import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

// ══════════════════════════════════════════════════════
// 📄 كلّ الأوراق السفليّة على المُلاحِح الجذر
// ══════════════════════════════════════════════════════
// 🔴 بلاغُ المالك: «الناف بار السفليّ يظهر فوق العناصر الأخرى مثل موديل
//    الحجز». السبب `useRootNavigator: false` في ورقتَي النشاط والحجز
//    وورقة المنيو — فتُرسم داخل فرع الغلاف، أي **تحت** شريط التنقّل.
//
// 🔴 وكان قراراً موثّقاً: الويب يوقف حاجبه عند ٨٠ بكسل فيبقى شريطه ظاهراً.
//    صحيحٌ هناك حيث الشريط لوحٌ ملتصق، وخاطئٌ هنا حيث هو **كبسولةٌ زجاجيّة
//    طافية** — فبقاؤها فوق ورقةٍ مفتوحة يبدو عطلاً في التركيب.
//
// حارسٌ نصّيّ لا حارسُ ودجة: فتحُ كلّ ورقةٍ يحتاج جلسةً وشبكةً ومتحكّماً،
// والعقد المحروس سطرٌ واحد في كلّ ملفّ.

const _files = [
  'lib/features/games/activity_sheets.dart',
  'lib/features/games/location_menu_sheet.dart',
  'lib/features/order/order_screen.dart',
  'lib/features/order/option_picker.dart',
  'lib/features/notifications/inbox_sheet.dart',
];

void main() {
  group('لا ورقةٌ تُرسم تحت شريط التنقّل', () {
    for (final f in _files) {
      test(f.split('/').last, () {
        final src = File(f).readAsStringSync();
        expect(src.contains('useRootNavigator: false'), isFalse,
            reason: 'ورقةٌ على مُلاحِح الفرع تُرسم تحت الكبسولة الزجاجيّة');
        expect(src.contains('useRootNavigator'), isTrue,
            reason: 'الافتراضيّ في Flutter هو false — يجب أن يُعلَن صراحةً');
      });
    }
  });

  test('حشوة تعويض الشريط أُزيلت من أوراق النشاط', () {
    final src =
        File('lib/features/games/activity_sheets.dart').readAsStringSync();
    // 🔴 كانت تعويضاً عن شريطٍ يعلو الورقة؛ وبقاؤها بعد التغطية تفتح
    //    فجوةً فارغة أسفل الورقة.
    // يُفحَص **الاستعمال** لا الذكر: التعليق الشارح يبقى عمداً كي لا
    // يُعاد الخطأ ظنّاً أن الحشوة نُسيت.
    final code = src
        .split('\n')
        .where((l) => !l.trimLeft().startsWith('//'))
        .join('\n');
    expect(code.contains('kNavInset'), isFalse);
  });
}
