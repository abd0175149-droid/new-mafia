import '../../app/router.dart' show Routes;
import 'guide_service.dart' show Gp;

// ══════════════════════════════════════════════════════
// 🕴️ جولة «الليلة الأولى» — خطوات الصفحات (منقولةٌ من pageSteps.tsx، 2026-11-22)
//
// كلّ خطوة: أين تُعرض (path)، ما يُضاء (target باسم GuideTarget في الشاشة نفسها)،
// ما يقوله الدون، ومتى تنتهي:
//   • نصٌّ بلا until ⇒ زرّ «التالي».
//   • untilPath   ⇒ تنتهي حين يصل اللاعب إلى المسار (ضغط التبويب بيده).
//   • untilExists ⇒ تنتهي حين يظهر عنصر (فُتحت الورقة، صار الحجز «محجوز»).
// بعد آخر خطوة تنتقل الجولة إلى غرفة التدريب (تبويب «ادخل») ولها دقّاتها.
// ══════════════════════════════════════════════════════

class PageStep {
  const PageStep({required this.id, required this.ch, this.path, this.target, this.text = const [], this.wait, this.pos, this.untilPath, this.untilExists, this.back, this.skipIfBooked = false});
  final String id;
  /// club · booking · room
  final String ch;
  final String? path, target, wait, pos, untilPath, untilExists, back;
  final List<Gp> text;
  final bool skipIfBooked;
}

const kPageSteps = <PageStep>[
  // ── النادي ──
  PageStep(id: 'card', ch: 'club', path: Routes.home, target: 'home-card',
      text: [Gp('هذه بطاقتك. رتبتك تبدأ «مُخبر»، وكلّ مباراةٍ تزيد خبرتك وتحرّك رتبتك.')]),
  PageStep(id: 'nav', ch: 'club', path: Routes.home, target: 'nav', pos: 'mid',
      text: [Gp('خمسة أبواب: الرئيسيّة، الألعاب، ادخل، التصنيف، حسابي. الزرّ الذهبيّ «ادخل» لمن يحمل كود غرفةٍ من الموجّه؛ أمّا من حجزَ فيدخل من بطاقة حجزه.')]),
  PageStep(id: 'rank-go', ch: 'club', target: 'nav-rank', pos: 'mid', wait: 'افتح «التصنيف»', untilPath: Routes.rank),
  PageStep(id: 'rank', ch: 'club', path: Routes.rank, pos: 'bottom',
      text: [Gp('ترتيبك بين لاعبي مدينتك في الموسم. تصعد من مُخبر إلى جنديّ فكابو فأندربوس فالأب الروحيّ.')]),
  PageStep(id: 'profile-go', ch: 'club', target: 'nav-profile', pos: 'mid', wait: 'افتح «حسابي»', untilPath: Routes.profile),
  PageStep(id: 'profile', ch: 'club', path: Routes.profile, target: 'guide-replay',
      text: [Gp('إحصاءاتك ومبارياتك وإعداداتك هنا. ومن هذا السطر تعيد الجولة متى شئت.')]),

  // ── الحجز ──
  PageStep(id: 'games-go', ch: 'booking', target: 'nav-games', pos: 'mid', wait: 'افتح «الألعاب»', untilPath: Routes.games),
  PageStep(id: 'games', ch: 'booking', path: Routes.games, target: 'training-card',
      text: [Gp('فعاليّات النادي القادمة. أوّلها ليلتك التجريبيّة: لا يراها غيرك، ومجّانيّة. في كلّ بطاقة اليوم والساعة والمكان وعدد القادمين.')]),
  PageStep(id: 'book', ch: 'booking', path: Routes.games, target: 'training-book', skipIfBooked: true,
      wait: 'اضغط «احجز»', untilExists: 'training-sheet'),
  PageStep(id: 'confirm', ch: 'booking', path: Routes.games, target: 'training-confirm', pos: 'top', skipIfBooked: true,
      wait: 'راجع التفاصيل ثمّ أكّد', untilExists: 'training-enter', back: 'book'),
  PageStep(id: 'booked', ch: 'booking', path: Routes.games, target: 'training-card', text: [
    Gp('حجزك ثابت. «✅ محجوز» نفسه يلغي الحجز إن غيّرتَ رأيك.'),
    Gp('حين تُفتح غرفة الفعاليّة يظهر زرّ الدخول داخل بطاقة حجزك هذه، ويصلك إشعار. غرفة التدريب مفتوحةٌ الآن.'),
  ]),

  // ── باب الغرفة ──
  PageStep(id: 'enter', ch: 'room', path: Routes.games, target: 'training-enter',
      text: [Gp('بابك إلى الغرفة هنا: زرّ «دخول ←» داخل بطاقة حجزك. يحمل كود الغرفة عنك، فلا تكتب شيئاً.')],
      wait: 'اضغط «دخول ←»'),
];

int stepIndex(String id) { final i = kPageSteps.indexWhere((s) => s.id == id); return i < 0 ? 0 : i; }

/// أوّل خطوة في فصلٍ ما — نقطة الاستئناف بعد إغلاق التطبيق
String chapterStart(String? ch) => ch == 'booking' || ch == 'room' ? 'games-go' : 'card';
