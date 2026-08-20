import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/player.dart';

// ══════════════════════════════════════════════════════
// 🧑‍💼 لوحة الإدارة داخل التطبيق
// ══════════════════════════════════════════════════════
// 🔴 المحروس هنا ليس الشكل بل **أمان الحقن**: نحن نكتب توكن صلاحيّة إدارة
//    في تخزين صفحة ويب. خطأٌ في هذا المسار يعني تسريب صلاحيّةٍ إداريّة.

void main() {
  final raw =
      File('lib/features/staff/admin_webview_screen.dart').readAsStringSync();
  // 🔴 التعليقات تُستبعَد: الشرح يذكر أسماء الاستدعاءات فيخلط ترتيبها
  //    مع ترتيب الكود الفعليّ — وهو ما أسقط هذا الحارس أوّل مرّة.
  final src = raw
      .split('\n')
      .where((l) => !l.trimLeft().startsWith('//'))
      .join('\n');

  group('أمان الحقن', () {
    test('لا يُحمَّل إلّا عنوان خادمنا من التهيئة', () {
      // 🔴 عنوانٌ مكتوبٌ بيدٍ أو من مصدرٍ خارجيّ يعني حقن التوكن في مضيفٍ
      //    لا نملكه. المصدر الوحيد المقبول هو تهيئة التطبيق.
      expect(src.contains('ApiClient.instance.config.baseUrl'), isTrue);
      expect(RegExp(r"loadRequest\(Uri\.parse\('https?://").hasMatch(src),
          isFalse,
          reason: 'لا مضيفَ مكتوبٌ بيدٍ في الكود');
    });

    test('القيم تمرّ عبر jsonEncode لا بالدمج النصّيّ', () {
      // 🔴 توكنٌ يحمل علامة اقتباسٍ يكسر السكربت لو دُمج نصّياً — وقد
      //    يُنفَّذ ما بعده. الترميز يُغلق الباب.
      expect(src.contains(r'${jsonEncode(token)}'), isTrue);
      expect(src.contains(r'${jsonEncode(user)}'), isTrue);
    });

    test('لا حقنَ بلا جلسة موظّف', () {
      expect(src.contains('if (token != null && staff != null)'), isTrue,
          reason: 'حقنٌ بقيمٍ معدومة يكتب "null" نصّاً في التخزين');
    });

    test('الجذر يُحمَّل أوّلاً ثمّ اللوحة — لا سباق', () {
      // 🔴 محاولتان سابقتان فشلتا: الحقن عند البدء وحده (سباقٌ مع إنشاء
      //    الوثيقة)، ثمّ كشفُ الهبوط على `/admin/login` — وهو **لا يقع
      //    أبداً** لأن اللوحة تطبيقُ صفحةٍ واحدة و`router.push` تنقّلٌ
      //    داخليّ لا تحميلٌ جديد، فلا تُستدعى `onPageFinished` ثانيةً.
      //
      // العقد الصحيح: يُحمَّل **الجذر** لا `/admin`، فنملك تخزين الأصل
      // ونزرع التوكن قبل أن تعمل حزمة اللوحة.
      // 🔴 يُطابَق على الكود بعد ضغط الفراغات: تنسيقُ السطور يتغيّر مع
      //    كلّ تعديل، وحارسٌ يكسره سطرٌ ملفوف حارسٌ لا يُوثَق به.
      final flat = src.replaceAll(RegExp(r'\s+'), '');
      expect(
          flat.contains(
              '..loadRequest(Uri.parse(ApiClient.instance.config.baseUrl));'),
          isTrue,
          reason: 'التحميل الأوّل للجذر — تحميلُ /admin مباشرةً يعيد السباق');
      expect(flat.contains(r"baseUrl}/admin'))"), isTrue,
          reason: 'الانتقال للوحة بعد الزرع');
    });

    test('الزرع مرّةً واحدة — حارسُ الدوران', () {
      // 🔴 بلا الحارس يعيد كلُّ انتهاء تحميلٍ الزرعَ والانتقال بلا نهاية.
      expect(src.contains('if (!_seeded'), isTrue);
      expect(src.contains('_seeded = true'), isTrue);
    });

    test('الحقن في onPageStarted لا onPageFinished', () {
      final started = src.indexOf('onPageStarted');
      final inject = src.indexOf('runJavaScript');
      final finished = src.indexOf('onPageFinished');
      expect(started >= 0 && inject > started && inject < finished, isTrue,
          reason: 'الحقن بعد الانتهاء يعني صفحة دخولٍ ظهرت ثمّ صُحّحت');
    });
  });

  group('عقد المفاتيح — نفس ما يكتبه الويب', () {
    test('token وuser بحقولهما الأربعة', () {
      expect(src.contains("localStorage.setItem('token'"), isTrue);
      expect(src.contains("localStorage.setItem('user'"), isTrue);
      for (final k in ['id', 'username', 'displayName', 'role']) {
        expect(src.contains("'$k':"), isTrue, reason: 'الحقل $k مفقود');
      }
    });

    test('حمولة user تُبنى JSON صالحاً', () {
      const s = StaffInfo(
          staffId: 3, username: 'ali', displayName: 'علي', role: 'admin');
      final j = jsonEncode({
        'id': s.staffId,
        'username': s.username,
        'displayName': s.displayName,
        'role': s.role,
      });
      final back = jsonDecode(j) as Map;
      expect(back['role'], 'admin');
      expect(back['displayName'], 'علي', reason: 'العربيّة تمرّ سليمة');
    });
  });

  group('الصلاحيّة', () {
    test('الإدارة لمن يملكها وحده', () {
      const admin =
          StaffInfo(staffId: 1, username: 'a', displayName: 'م', role: 'admin');
      const leader =
          StaffInfo(staffId: 2, username: 'l', displayName: 'ق', role: 'leader');
      expect(admin.canAdmin, isTrue);
      expect(leader.canAdmin, isFalse,
          reason: 'القائد لا يرى المالية — الصفّ لا يُعرض له');
    });
  });
}
