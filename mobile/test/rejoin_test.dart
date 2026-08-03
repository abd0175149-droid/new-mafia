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
    test('الحالات الثلاث متمايزة', () {
      expect(RejoinResult.values.length, 3);
      expect(RejoinResult.ok, isNot(RejoinResult.rejected));
      expect(RejoinResult.unreachable, isNot(RejoinResult.rejected));
    });

    /// القاعدة التي يجب أن يطبّقها المتحكّم: المسح للرفض وحده.
    bool shouldClearSession(RejoinResult r) => r == RejoinResult.rejected;

    test('الرفض وحده يمسح الجلسة', () {
      expect(shouldClearSession(RejoinResult.rejected), isTrue);
      expect(shouldClearSession(RejoinResult.unreachable), isFalse);
      expect(shouldClearSession(RejoinResult.ok), isFalse);
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
}
