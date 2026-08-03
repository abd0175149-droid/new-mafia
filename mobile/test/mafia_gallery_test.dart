import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/core/socket/socket_service.dart';
import 'package:mafia_club/features/game/game_session_controller.dart';
import 'package:mafia_club/features/game/mafia_gallery.dart';
import 'package:mafia_club/models/card_template.dart';
import 'package:mafia_club/models/game.dart';

// ══════════════════════════════════════════════════════
// 🧪 معرض المافيا — §4.5 · §4.6 في الملفّ ٢٢
// ══════════════════════════════════════════════════════

Widget _wrap(Widget child) => MaterialApp(
      home: Directionality(textDirection: TextDirection.rtl, child: child),
    );

void main() {
  group('🔴 عقد الخادم: كائناتٌ لا أرقام', () {
    // الانحدار: كان الفريق يُختزل إلى `List<int>` فتضيع الأسماء والأدوار
    // والصور — وشبكة الشركاء تصير أرقاماً عارية.
    test('زميل المافيا يُقرأ كاملاً', () {
      final t = MafiaMate.listOf([
        {
          'physicalId': 7,
          'name': 'خالد',
          'role': 'GODFATHER',
          'avatarUrl': '/uploads/a.jpg',
        },
        {'physicalId': 9, 'name': 'سامي', 'role': 'CHAMELEON', 'avatarUrl': null},
      ]);
      expect(t.length, 2);
      expect(t.first.name, 'خالد');
      expect(t.first.role, 'GODFATHER');
      expect(t.first.avatarUrl, '/uploads/a.jpg');
      expect(t.last.avatarUrl, isNull);
    });

    test('حمولةٌ غير متوقّعة لا تُسقط التطبيق', () {
      expect(MafiaMate.listOf(null), isEmpty);
      expect(MafiaMate.listOf(const [1, 2, 3]), isEmpty);
      expect(MafiaMate.listOf('x'), isEmpty);
    });

    test('الأخ يحمل حياته واتّجاه التعارف', () {
      final s = SiblingInfo.fromJson(const {
        'physicalId': 6,
        'name': 'ليث',
        'role': 'YOUNGER_BROTHER',
        'avatarUrl': null,
        'isAlive': false,
        'recipientIsMafia': true,
      });
      expect(s.physicalId, 6);
      expect(s.isAlive, isFalse);
      expect(s.recipientIsMafia, isTrue);
    });

    test('غياب isAlive يعني حيّاً — لا ميتاً', () {
      expect(SiblingInfo.fromJson(const {'physicalId': 1}).isAlive, isTrue);
    });
  });

  group('عقود السفّاح', () {
    test('النسبة من صفرٍ مطلوب ليست NaN', () {
      const c = AssassinContracts(completedCount: 0, totalRequired: 0);
      expect(c.progress, 0);
      expect(c.progress.isNaN, isFalse);
    });

    test('النسبة تُحسب وتُحصر', () {
      expect(const AssassinContracts(completedCount: 1, totalRequired: 4).progress,
          0.25);
      expect(const AssassinContracts(completedCount: 9, totalRequired: 4).progress,
          1.0);
    });

    test('الوصف العربيّ أوّلاً والإنجليزيّ احتياطاً', () {
      final ar = AssassinContract.fromJson(const {
        'id': 1,
        'description': 'Kill the doctor',
        'descriptionAr': '🔪 اغتل الطبيب',
      });
      expect(ar.text, '🔪 اغتل الطبيب');
      final en = AssassinContract.fromJson(const {
        'id': 2,
        'description': 'Kill the sniper',
      });
      expect(en.text, 'Kill the sniper');
    });

    test('الحمولة الكاملة تُقرأ', () {
      final c = AssassinContracts.fromJson(const {
        'contracts': [
          {'id': 1, 'completed': true, 'completedAtRound': 2},
          {'id': 2, 'completed': false},
        ],
        'currentIndex': 1,
        'completedCount': 1,
        'totalRequired': 3,
      })!;
      expect(c.contracts.length, 2);
      expect(c.contracts.first.completedAtRound, 2);
      expect(c.contracts.last.completed, isFalse);
      expect(c.totalRequired, 3);
    });
  });

  group('🔒 قائمة أدوار المافيا الحرفية', () {
    // الانحدار: كانت القائمة تعدّ السفّاح مافيا وتُسقط الأخ الأكبر — فيمنح
    // السفّاحُ شارةَ مافيا وقائمةَ شركاء لا يملكها، ويُحرم الأخ الأكبر أخاه.
    test('السفّاح مستقلٌّ لا مافيا', () {
      expect(kMafiaRoleIds.contains('ASSASSIN'), isFalse);
      expect(kNeutralRoleIds.contains('ASSASSIN'), isTrue);
      expect(kNeutralRoleIds.contains('JESTER'), isTrue);
    });

    test('الأخ الأكبر مافيا', () {
      expect(kMafiaRoleIds.contains('OLDER_BROTHER'), isTrue);
      expect(kMafiaRoleIds.contains('YOUNGER_BROTHER'), isFalse);
    });

    test('القائمة ستّةٌ بالضبط', () => expect(kMafiaRoleIds.length, 6));
  });

  group('🔒 بوابة التسريب — §4.6', () {
    final c = GameSessionController.instance;
    const team = [MafiaMate(physicalId: 4, name: 'زيد', role: 'WITCH')];
    const sib = SiblingInfo(physicalId: 6, name: 'ليث');

    test('مواطنٌ بفريقٍ محفوظٍ من جيمٍ سابق لا يرى شيئاً', () {
      c.primeForTest(role: 'CITIZEN', team: team, sibling: sib);
      expect(c.galleryTeam, isEmpty);
      expect(c.gallerySibling, isNull);
    });

    test('السفّاح لا يرى فريقاً — لكنّه يُعرَف سفّاحاً', () {
      c.primeForTest(role: 'ASSASSIN', team: team);
      expect(c.galleryTeam, isEmpty);
      expect(c.isAssassin, isTrue);
    });

    test('الأخ الأكبر يرى فريقه وأخاه', () {
      c.primeForTest(role: 'OLDER_BROTHER', team: team, sibling: sib);
      expect(c.galleryTeam.length, 1);
      expect(c.gallerySibling?.physicalId, 6);
    });

    test('بلا دورٍ لا شيء', () {
      c.primeForTest(role: '', team: team, sibling: sib);
      expect(c.galleryTeam, isEmpty);
      expect(c.gallerySibling, isNull);
    });
  });

  group('🔒 ترتيب إنذار الغشّ — §4.6', () {
    final c = GameSessionController.instance;
    late List<(String, dynamic)> sent;

    setUp(() {
      sent = [];
      SocketService.emitProbe = (e, d) => sent.add((e, d));
    });
    tearDown(() => SocketService.emitProbe = null);

    test('اللاعب المُقصى: يُرسَل الإنذار ولا يُفتح المعرض', () {
      // الجوهر: محاولةُ المُقصى هي بالضبط ما يريد الليدر أن يعرفه.
      // تقديمُ فحص الموت على الإرسال يُسكت الإنذار عن حالته الوحيدة.
      c.primeForTest(roomId: '282', role: 'SILENCER', dead: true);
      expect(c.announceGalleryOpen(), isFalse);
      expect(sent.single.$1, 'player:mafia-gallery-open');
      expect((sent.single.$2 as Map)['roomId'], '282');
    });

    test('اللاعب الحيّ: يُرسَل الإنذار ويُفتح المعرض', () {
      c.primeForTest(roomId: '282', role: 'SILENCER', dead: false);
      expect(c.announceGalleryOpen(), isTrue);
      expect(sent.length, 1);
    });

    test('بلا غرفةٍ لا إرسال', () {
      c.primeForTest(roomId: '', role: 'SILENCER', dead: false);
      c.announceGalleryOpen();
      expect(sent, isEmpty);
    });
  });

  group('الواجهات الأربع', () {
    testWidgets('مواطنٌ بلا فريق يرى الملفّ التمويهيّ لا فراغاً', (t) async {
      // 🔒 الفراغ نفسه تسريب: من يفتح ولا يرى شيئاً يَعلم أنّه ليس مافيا.
      await t.pumpWidget(_wrap(const MafiaTeamGallery()));
      expect(find.text('ملف استخباراتي'), findsOneWidget);
      expect(find.text('لا تكشف دورك حتى لو ضُغط عليك'), findsOneWidget);
      expect(find.text('شركاؤك'), findsNothing);
    });

    testWidgets('المافيا يرى شبكة الشركاء بأسمائهم وأدوارهم', (t) async {
      await t.pumpWidget(_wrap(const MafiaTeamGallery(team: [
        MafiaMate(physicalId: 4, name: 'زيد', role: 'WITCH'),
        MafiaMate(physicalId: 9, name: 'سامي', role: 'CHAMELEON'),
      ])));
      expect(find.text('شركاؤك'), findsOneWidget);
      expect(find.text('2 في الفريق'), findsOneWidget);
      expect(find.text('زيد'), findsOneWidget);
      expect(find.text('الساحرة'), findsOneWidget);
      expect(find.text('حرباية المافيا'), findsOneWidget);
      expect(find.text('ملف استخباراتي'), findsNothing);
    });

    testWidgets('لوحة رابط الدم تعلو الواجهة المختارة', (t) async {
      await t.pumpWidget(_wrap(const MafiaTeamGallery(
        team: [MafiaMate(physicalId: 4, name: 'زيد', role: 'WITCH')],
        sibling: SiblingInfo(
            physicalId: 6, name: 'ليث', role: 'YOUNGER_BROTHER'),
      )));
      expect(find.text('رابط الدم'), findsOneWidget);
      expect(find.text('شركاؤك'), findsOneWidget);
      final blood = t.getTopLeft(find.text('رابط الدم')).dy;
      final team = t.getTopLeft(find.text('شركاؤك')).dy;
      expect(blood, lessThan(team));
    });

    testWidgets('الأخ المتوفّى يُعلَّم — لا يُخفى', (t) async {
      await t.pumpWidget(_wrap(const MafiaTeamGallery(
        sibling: SiblingInfo(
            physicalId: 6,
            name: 'ليث',
            role: 'YOUNGER_BROTHER',
            isAlive: false),
      )));
      expect(find.text('الأخ الأصغر (متوفّى)'), findsOneWidget);
    });

    testWidgets('السفّاح يرى عقوده وتقدّمها', (t) async {
      await t.pumpWidget(_wrap(const MafiaTeamGallery(
        isAssassin: true,
        contracts: AssassinContracts(
          contracts: [
            AssassinContract(
                id: 1,
                descriptionAr: '🔪 اغتل الطبيب',
                completed: true,
                completedAtRound: 2),
            AssassinContract(id: 2, descriptionAr: '🔪 اغتل الشريف'),
          ],
          completedCount: 1,
          totalRequired: 2,
        ),
      )));
      await t.pump(const Duration(milliseconds: 900));
      expect(find.text('عقود الاغتيال'), findsOneWidget);
      expect(find.text('1/2 عقود مُنجزة'), findsOneWidget);
      expect(find.text('أُنجز في الجولة 2'), findsOneWidget);
      expect(find.text('اقتل صاحب هذا الدور!'), findsOneWidget);
    });

    testWidgets('سفّاحٌ بلا عقودٍ بعد يقع على التمويه لا على شاشةٍ فارغة',
        (t) async {
      await t.pumpWidget(_wrap(const MafiaTeamGallery(isAssassin: true)));
      expect(find.text('ملف استخباراتي'), findsOneWidget);
    });
  });
}
