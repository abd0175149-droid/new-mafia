import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/profile.dart';

// ══════════════════════════════════════════════════════
// 🧪 منطق الملفّ الشخصيّ — الملفّ 13
// ══════════════════════════════════════════════════════
// كل ما هنا يفشل **صامتاً** إن انكسر: رتبة تسقط للون خاطئ، وأفاتار
// يُقَصّ من مكانٍ آخر، ومباراةٌ خاسرة تُعرض فوزاً. لا شاشة حمراء تُنبّه.

void main() {
  group('الرتب', () {
    test('رتبة مجهولة أو غائبة تسقط إلى مُخبر', () {
      expect(RankConfig.of(null).tier, 'INFORMANT');
      expect(RankConfig.of('').tier, 'INFORMANT');
      expect(RankConfig.of('KING').tier, 'INFORMANT');
      expect(RankConfig.indexOf('KING'), 0);
    });

    test('ألوان السلّم حرفية — تقود الـhero كلّه', () {
      expect(RankConfig.of('INFORMANT').color, const Color(0xFFCD7F32));
      expect(RankConfig.of('SOLDIER').color, const Color(0xFFC0C0C0));
      expect(RankConfig.of('CAPO').color, const Color(0xFFFFD700));
      expect(RankConfig.of('UNDERBOSS').color, const Color(0xFF00BFFF));
      expect(RankConfig.of('GODFATHER').color, const Color(0xFFDC2626));
    });

    test('التوهّج الإضافيّ للأب الروحيّ وحده', () {
      expect(RankConfig.ladder.where((r) => r.extraGlow).map((r) => r.tier), ['GODFATHER']);
    });

    test('ترتيب السلّم هو ترتيب الترقّي', () {
      expect(RankConfig.ladder.map((r) => r.tier).toList(),
          ['INFORMANT', 'SOLDIER', 'CAPO', 'UNDERBOSS', 'GODFATHER']);
    });

    test('الاسم والأيقونة يأتيان من مصدرٍ واحد مع الرئيسية', () {
      expect(RankConfig.of('CAPO').nameAr, 'كابو');
      expect(RankConfig.of('GODFATHER').icon, '👑');
    });
  });

  group('أسماء الأدوار', () {
    test('معروف يُترجم، ومجهول يُعرض خاماً، وغائب يصير شرطة', () {
      expect(roleNameAr('SHERIFF'), 'الشريف');
      expect(roleNameAr('NEW_ROLE'), 'NEW_ROLE');
      expect(roleNameAr(null), '—');
      expect(roleNameAr(''), '—');
    });
  });

  group('اشتقاق الفوز والفريق', () {
    MatchHistoryEntry e(Map<String, dynamic> j) => MatchHistoryEntry.fromJson(j);

    test('breakdown يسبق الاشتقاق دائماً — هو حساب الخادم', () {
      // دورٌ مدنيّ وفوزٌ للمافيا: الاشتقاق يقول «خسر»، والخادم يقول «فاز»
      final m = e({
        'role': 'SHERIFF',
        'matchWinner': 'MAFIA',
        'breakdown': {'team': 'CITIZEN', 'won': true, 'xp': [], 'rr': []},
      });
      expect(m.won, isTrue);
    });

    test('بلا breakdown يعمل الاشتقاق من قائمة أدوار المافيا', () {
      expect(e({'role': 'GODFATHER', 'matchWinner': 'MAFIA'}).won, isTrue);
      expect(e({'role': 'GODFATHER', 'matchWinner': 'CITIZEN'}).won, isFalse);
      expect(e({'role': 'DOCTOR', 'matchWinner': 'CITIZEN'}).won, isTrue);
      expect(e({'role': 'DOCTOR', 'matchWinner': 'MAFIA'}).won, isFalse);
    });

    test('الأخ الأكبر مافيا والأصغر ليس — فرقٌ مقصود في القائمة', () {
      expect(e({'role': 'OLDER_BROTHER'}).isMafia, isTrue);
      expect(e({'role': 'YOUNGER_BROTHER'}).isMafia, isFalse);
    });

    test('المحايد يُقرأ من breakdown وحده', () {
      expect(e({'role': 'JESTER'}).isNeutral, isFalse);
      expect(
          e({'role': 'JESTER', 'breakdown': {'team': 'NEUTRAL', 'won': true}}).isNeutral,
          isTrue);
    });

    test('الصفر يُعرض والغياب يُخفى — الفرق محفوظ في النموذج', () {
      expect(e({'xpEarned': 0}).xpEarned, 0);
      expect(e({}).xpEarned, isNull);
      expect(e({'rrChange': 0}).rrChange, 0);
      expect(e({}).rrChange, isNull);
    });
  });

  group('افتراضيات التقدّم — §6.9', () {
    test('progression غائبة كلياً تعطي القيم المنصوصة', () {
      final p = PlayerProgression.fromJson(const {});
      expect(p.rankTier, 'INFORMANT');
      expect(p.level, 1);
      expect(p.xp, 0);
      expect(p.nextLevelXP, 500);
      expect(p.rankRR, 0);
      expect(p.rrRequired, 100);
    });

    test('rrRequired صفر يصير 100 — وإلا قسمةٌ على صفر في شريط الرتبة', () {
      expect(PlayerProgression.fromJson(const {'rrRequired': 0}).rrRequired, 100);
    });

    test('xpProgress مقيّدة داخل 0..100', () {
      expect(PlayerProgression.fromJson(const {'xpProgress': 180}).xpProgress, 100);
      expect(PlayerProgression.fromJson(const {'xpProgress': -5}).xpProgress, 0);
    });
  });

  group('الاستجابة الكاملة', () {
    test('استجابة فارغة لا تُسقط الشاشة', () {
      final r = ProfileResponse.fromJson(const {});
      expect(r.player.id, 0);
      expect(r.stats.totalMatches, 0);
      expect(r.matchHistory, isEmpty);
    });

    test('مسح الإيميل يختلف عن «لم يتغيّر»', () {
      const p = PlayerInfo(id: 1, name: 'x', email: 'a@b.c');
      expect(p.copyWith(name: 'y').email, 'a@b.c'); // لم يُمسّ
      expect(p.copyWith(email: null).email, isNull); // مُسح صراحةً
    });

    test('الجنس غير FEMALE — بما فيه الغياب — ذكر', () {
      expect(PlayerInfo.fromJson(const {}).isFemale, isFalse);
      expect(PlayerInfo.fromJson(const {'gender': 'FEMALE'}).isFemale, isTrue);
    });
  });

  group('العرض', () {
    test('إخفاء الهاتف: ثلاثة تبقى، أربعة تُستر، والباقي يبقى', () {
      // ⚠️ مثال المواصفة «079****1234» لا يطابق تعبيرها النمطيّ نفسه
      //    (ثلاثة ثم أربعة مستورة ثم الباقي). التعبير هو العقد المنقول
      //    من الويب، فهو المرجع — والمثال توضيحيّ خاطئ.
      expect(maskPhone('0789154719'), '078****719');
      expect(maskPhone('0791234567'), '079****567');
      // رقم لا يطابق النمط يمرّ كما هو — لا نصنع نجوماً في غير محلّها
      expect(maskPhone('123'), '123');
    });

    test('المدّة m:ss والغياب شرطة', () {
      expect(formatDuration(1250), '20:50');
      expect(formatDuration(425), '7:05');
      expect(formatDuration(0), '0:00');
      expect(formatDuration(null), '—');
    });

    test('مصغّر الأفاتار يُشتقّ، وغير المطابق يمرّ كما هو', () {
      expect(avatarThumb('/uploads/avatars/12.jpg'), '/uploads/avatars/thumbs/12.webp');
      expect(avatarThumb('/uploads/avatars/12.jpg?v=9'), '/uploads/avatars/thumbs/12.webp');
      expect(avatarThumb('/uploads/other/12.jpg'), '/uploads/other/12.jpg');
      expect(avatarThumb(null), isNull);
    });
  });

  group('هندسة القصّ — العقد 512×512 لا يتغيّر', () {
    test('المعامل وحده يتغيّر مع حجم المعاينة', () {
      expect(AvatarPipeline.ratioFor(280), closeTo(512 / 280, 1e-9));
      expect(AvatarPipeline.ratioFor(320), closeTo(1.6, 1e-9));
      expect(AvatarPipeline.ratioFor(360), closeTo(512 / 360, 1e-9));
      expect(AvatarPipeline.outputSize, 512);
      expect(AvatarPipeline.jpegQuality, 92);
    });

    test('الملاءمة cover: الضلع الأصغر يملأ، والصورة تُوسَّط', () {
      // صورة عريضة 1000×500 في معاينة 280 → الارتفاع هو الأصغر
      final (s, o) = AvatarPipeline.initialFit(1000, 500, 280);
      expect(s, closeTo(280 / 500, 1e-9));
      expect(o.dy, closeTo(0, 1e-9)); // الأصغر ملأ تماماً
      expect(o.dx, closeTo((280 - 1000 * s) / 2, 1e-9));
      expect(o.dx, lessThan(0)); // العرض يفيض من الجهتين بالتساوي
    });

    test('صورة مربّعة تملأ بلا إزاحة', () {
      final (s, o) = AvatarPipeline.initialFit(800, 800, 320);
      expect(s, closeTo(0.4, 1e-9));
      expect(o, Offset.zero);
    });

    test('حدود التكبير كما في الويب', () {
      expect(AvatarPipeline.minScale, 0.1);
      expect(AvatarPipeline.maxScale, 5.0);
      expect(AvatarPipeline.wheelStep, 0.05);
      expect(AvatarPipeline.buttonStep, 0.15);
    });
  });
}
