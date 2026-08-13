import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/game.dart';

// ══════════════════════════════════════════════════════
// 🧪 نتيجة الاستعادة — §6.3 في الملفّ 20
// ══════════════════════════════════════════════════════
// 🔴 الانحدار: على بدءٍ بارد يُنشأ اتصال السوكِت غير متزامن، ونداءُ
//    الاستعادة قبله يعود فارغاً فوراً. معاملةُ ذلك رفضاً تمسح جلسة لاعبٍ
//    ما زال مقعده محجوزاً على الطاولة — فيخرج من غرفته لأن هاتفه أقلع.
//    حدث فعلاً: عاد التطبيق إلى شاشة إدخال الرمز بعد إعادة تشغيل.

void main() {
  group('التفريق بين الرفض والتعذّر', () {
    test('الحالات الأربع متمايزة', () {
      expect(RejoinResult.values.length, 4);
      expect(RejoinResult.ok, isNot(RejoinResult.rejected));
      expect(RejoinResult.unreachable, isNot(RejoinResult.rejected));
      expect(RejoinResult.identityRequired, isNot(RejoinResult.rejected));
    });

    /// القاعدة التي يجب أن يطبّقها المتحكّم: المسح للرفض وحده.
    bool shouldClearSession(RejoinResult r) => r == RejoinResult.rejected;

    test('الرفض وحده يمسح الجلسة', () {
      expect(shouldClearSession(RejoinResult.rejected), isTrue);
      expect(shouldClearSession(RejoinResult.unreachable), isFalse);
      expect(shouldClearSession(RejoinResult.ok), isFalse);
    });

    // 🪪 بعد نقل المقاعد لم يعد الرقم هويّة: قد يكون مقعدي صار لغيري.
    //    الخادم يرفض التخمين، والجهاز يعرّف نفسه بالهاتف أو الحساب.
    test('🪪 رفض الهويّة ليس رفضاً للجلسة ولا تعذّراً', () {
      expect(shouldClearSession(RejoinResult.identityRequired), isFalse);
      expect(RejoinResult.identityRequired, isNot(RejoinResult.unreachable));
    });
  });

  group('الجلسة تصمد', () {
    test('جلسةٌ صالحة تبقى قابلة للاستعمال بعد رحلة تخزين', () {
      const s = SavedGameSession(
        roomId: '282',
        physicalId: 3,
        roomCode: '1771',
        gameName: 'Test Location 3 أغسطس — غرفة 1',
        phone: '0789154719',
        playerId: 8,
      );
      final back = SavedGameSession.fromJson(s.toJson())!;
      expect(back.isUsable, isTrue);
      expect(back.physicalId, 3);
      expect(back.roomCode, '1771');
      expect(back.playerId, 8);
    });
  });

  group('🔴 نظافة المرحلة لا تمسح ما جلبته الاستعادة', () {
    // حدث على الطاولة: لاعبٌ مافيا فتح معرض الشركاء فرأى الواجهة
    // التمويهية. السبب: ردّ `room:rejoin-player` يكتب الفريق والدور، ثم
    // يُضبط الطور `ROLE_BINDING` من **نفس الردّ** فتمسحه نظافةُ «جولة
    // جديدة». الويب لا يقع فيه: يمسح داخل مستمع `game:phase-changed`
    // وحده، ولا يمسّ الاستعادة أبداً.

    /// القاعدة التي يجب أن يطبّقها المتحكّم.
    bool wipes(String? was, String? now) =>
        GamePhase.isPreGame(now) && was != null && !GamePhase.isPreGame(was);

    test('إقلاعٌ على طورٍ قبل-لعبيّ لا يمسح', () {
      expect(wipes(null, GamePhase.roleBinding), isFalse);
      expect(wipes(null, GamePhase.lobby), isFalse);
    });

    test('جولةٌ جديدة بعد لعبٍ تمسح', () {
      expect(wipes(GamePhase.night, GamePhase.roleBinding), isTrue);
      expect(wipes(GamePhase.gameOver, GamePhase.lobby), isTrue);
      expect(wipes(GamePhase.dayVoting, GamePhase.roleGeneration), isTrue);
    });

    test('تنقّلٌ داخل ما قبل اللعب لا يمسح — لا شيء قديمٌ يُسرَّب', () {
      expect(wipes(GamePhase.roleGeneration, GamePhase.roleBinding), isFalse);
      expect(wipes(GamePhase.lobby, GamePhase.roleGeneration), isFalse);
    });

    test('الانتقال إلى طور لعبٍ لا يمسح أصلاً', () {
      expect(wipes(GamePhase.roleBinding, GamePhase.night), isFalse);
      expect(wipes(GamePhase.night, GamePhase.dayVoting), isFalse);
    });
  });
}
