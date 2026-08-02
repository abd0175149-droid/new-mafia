import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/app/app.dart';
import 'package:mafia_club/app/config.dart';
import 'package:mafia_club/app/theme/theme.dart';

// ══════════════════════════════════════════════════════
// 🧪 فحوص الأساس — ما لا يجوز أن ينكسر بصمت
// ══════════════════════════════════════════════════════

void main() {
  group('الثيم', () {
    test('الألوان الأساسية مطابقة للويب حرفياً', () {
      final t = buildNoirTheme();
      expect(t.scaffoldBackgroundColor, const Color(0xFF050505));
      expect(t.colorScheme.primary, const Color(0xFF8A0303));
      expect(t.colorScheme.secondary, const Color(0xFFC5A059));
      expect(t.dividerColor, const Color(0xFF2A2A2A));
      expect(t.brightness, Brightness.dark);
    });

    test('الذهبيات الثلاثة متمايزة — دمجها يكسر هوية شاشات', () {
      expect(Noir.vintageGold, isNot(MafiaScales.gold[500]));
      expect(MafiaScales.gold[500], isNot(MafiaScales.amber[500]));
      expect(Noir.vintageGold, isNot(MafiaScales.amber[500]));
    });

    test('درجة slate 850 المخصّصة موجودة', () {
      expect(MafiaScales.dark[850], const Color(0xFF162032));
    });

    test('كل نصّ عربيّ بتباعد صفر — التباعد يكسر وصلات الحروف', () {
      final tt = buildTextTheme();
      final styles = <TextStyle?>[
        tt.displayLarge, tt.displayMedium, tt.displaySmall,
        tt.headlineLarge, tt.headlineMedium, tt.headlineSmall,
        tt.titleLarge, tt.titleMedium, tt.titleSmall,
        tt.bodyLarge, tt.bodyMedium, tt.bodySmall,
        tt.labelLarge, tt.labelMedium, tt.labelSmall,
      ];
      for (final s in styles) {
        expect(s?.letterSpacing, 0, reason: 'نمط بتباعد غير صفريّ: ${s?.fontFamily} ${s?.fontSize}');
      }
    });

    test('نمط اللاتينية وحده يحمل تباعداً', () {
      final base = buildTextTheme().labelLarge!;
      expect(latinStyle(base).letterSpacing, greaterThan(0));
    });
  });

  group('النكهات', () {
    test('النكهتان تشيران إلى الإنتاج — قرار مقصود لا سهو', () {
      // كلتاهما على الإنتاج بقرار المالك (2026-08-02): staging متأخّرة
      // 365 كوميت ولا أحد يستعملها. الفحص يثبّت القرار كي لا يُقرأ
      // التطابق خطأً نسخٍ ولصق ويُصلَح إلى خادم ميّت.
      expect(AppConfig.prod.baseUrl, 'https://club-mafia.grade.sbs');
      expect(AppConfig.dev.baseUrl, AppConfig.prod.baseUrl);
    });

    test('النكهتان تبقيان منفصلتين في الهويّة', () {
      expect(AppConfig.dev.flavor, Flavor.dev);
      expect(AppConfig.dev.isDev, isTrue);
      expect(AppConfig.prod.isDev, isFalse);
      expect(AppConfig.dev.appName, isNot(AppConfig.prod.appName));
    });

    test('كل رابط https ولا ينتهي بشرطة — resolveUpload يفترض ذلك', () {
      for (final c in [AppConfig.dev, AppConfig.prod]) {
        expect(c.baseUrl.startsWith('https://'), isTrue);
        expect(c.baseUrl.endsWith('/'), isFalse);
      }
    });

    test('حلّ روابط الرفوعات: النسبيّ يُلحق والمطلق يمرّ كما هو', () {
      const c = AppConfig.prod;
      expect(c.resolveUpload('/uploads/a.png'), 'https://club-mafia.grade.sbs/uploads/a.png');
      expect(c.resolveUpload('uploads/a.png'), 'https://club-mafia.grade.sbs/uploads/a.png');
      expect(c.resolveUpload('https://cdn.example/a.png'), 'https://cdn.example/a.png');
      expect(c.resolveUpload(null), '');
      expect(c.resolveUpload(''), '');
    });
  });

  group('فئات الحجم', () {
    test('الحدود 600 و840', () {
      expect(sizeClassOf(360), WindowSizeClass.compact);
      expect(sizeClassOf(599), WindowSizeClass.compact);
      expect(sizeClassOf(600), WindowSizeClass.medium);
      expect(sizeClassOf(839), WindowSizeClass.medium);
      expect(sizeClassOf(840), WindowSizeClass.expanded);
      expect(sizeClassOf(1100), WindowSizeClass.expanded);
    });
  });

  testWidgets('التطبيق يقلع بالاتجاه RTL وبالعربية', (tester) async {
    await tester.pumpWidget(const MafiaApp(config: AppConfig.dev));
    await tester.pump();

    final ctx = tester.element(find.text('نادي المافيا'));
    expect(Directionality.of(ctx), TextDirection.rtl);
    expect(Localizations.localeOf(ctx).languageCode, 'ar');
  });

  testWidgets('تكبير خطّ النظام مقيَّد عند 1.3', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      const MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(2.0)),
        child: MafiaApp(config: AppConfig.dev),
      ),
    );
    await tester.pump();

    final ctx = tester.element(find.text('نادي المافيا'));
    final applied = MediaQuery.textScalerOf(ctx).scale(14) / 14;
    expect(applied, lessThanOrEqualTo(1.3));
  });
}
