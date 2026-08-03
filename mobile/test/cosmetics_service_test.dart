import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/core/cosmetics/cosmetics_service.dart';
import 'package:mafia_club/models/store.dart';

// ══════════════════════════════════════════════════════
// 🧪 مزوّد المظهر — §6.1 و§4.1 في الملفّ 34
// ══════════════════════════════════════════════════════

void main() {
  final svc = CosmeticsService.instance;

  setUp(() => svc.adopt(const EquippedCosmetics(), 'INFORMANT'));

  // 🔴 القسم في الملفّ الشخصيّ مشروطٌ بوجود مظهر — ولا شيء لمن لم يشترِ
  group('شرط الظهور', () {
    test('لا مظهر ⇒ لا قسم', () {
      expect(svc.hasAny, isFalse);
    });

    test('أيّ خانةٍ واحدة تكفي', () {
      for (final j in [
        {'frame': {'itemId': 1}},
        {'title': {'itemId': 2}},
        {'nameFx': {'itemId': 3}},
      ]) {
        svc.adopt(EquippedCosmetics.fromJson(j), 'CAPO');
        expect(svc.hasAny, isTrue, reason: '$j');
      }
    });

    test('خاناتٌ فارغة لا تُحتسب — الخادم يردّ null لما انتهى إيجاره', () {
      svc.adopt(
          EquippedCosmetics.fromJson(
              {'frame': null, 'title': null, 'nameFx': null}),
          'CAPO');
      expect(svc.hasAny, isFalse);
    });
  });

  group('الرتبة', () {
    test('تُحفَظ لتُدمج تحت المشترى', () {
      svc.adopt(const EquippedCosmetics(), 'GODFATHER');
      expect(svc.rankTier, 'GODFATHER');
    });

    test('رتبةٌ فارغة لا تمحو المحفوظة', () {
      svc.adopt(const EquippedCosmetics(), 'CAPO');
      svc.adopt(const EquippedCosmetics(), '');
      expect(svc.rankTier, 'CAPO');
    });
  });

  test('التبنّي يُخطر المستمعين — البطاقة تتغيّر بلا إعادة تحميل', () {
    var notified = 0;
    void listener() => notified++;
    svc.addListener(listener);
    svc.adopt(EquippedCosmetics.fromJson({'frame': {'itemId': 9}}), 'CAPO');
    svc.removeListener(listener);
    expect(notified, 1);
    expect(svc.cosmetics.frameId, 9);
  });
}
