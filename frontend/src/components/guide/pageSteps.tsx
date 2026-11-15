// ══════════════════════════════════════════════════════
// 🕴️ جولة «الليلة الأولى» — خطوات الصفحات (النادي، الحجز، باب الغرفة)
//
// كلّ خطوة: أين تُعرض (path)، ما يُضاء (target بسِمة data-guide في الصفحة نفسها)،
// ما يقوله الدون، ومتى تنتهي:
//   • نصٌّ بلا until ⇒ زرّ «التالي».
//   • until.path   ⇒ تنتهي حين يصل اللاعب إلى المسار (ضغط التبويب بيده).
//   • until.exists ⇒ تنتهي حين يظهر عنصر (فُتحت الورقة، صار الحجز «محجوز»).
// بعد آخر خطوة تنتقل الجولة إلى غرفة التدريب (/player/guide) ولها خطواتها.
// ══════════════════════════════════════════════════════

import type { ReactNode } from 'react';
import type { CoachPos } from './GuideLayer';

export type Chapter = 'club' | 'booking' | 'room';

export interface PageStep {
  id: string;
  ch: Chapter;
  /** الصفحة التي تُعرض عليها الخطوة — يُنقل اللاعب إليها إن لم يكن فيها */
  path?: string;
  target?: string;
  text?: ReactNode;
  wait?: string;
  pos?: CoachPos;
  until?: { path?: string; exists?: string };
  /** إن غاب الهدف (أغلق اللاعب الورقة مثلاً) عُد إلى هذه الخطوة */
  back?: string;
  /** تُتخطّى إن كان الحجز التدريبيّ قائماً سلفاً */
  skipIfBooked?: boolean;
}

export const PAGE_STEPS: PageStep[] = [
  // ── النادي ──
  {
    id: 'card', ch: 'club', path: '/player/home', target: '[data-guide="home-card"]',
    text: <p>هذه بطاقتك. رتبتك تبدأ «مُخبر»، وكلّ مباراةٍ تزيد خبرتك وتحرّك رتبتك.</p>,
  },
  {
    id: 'nav', ch: 'club', path: '/player/home', target: '[data-guide="nav"]', pos: 'mid',
    text: <p>خمسة أبواب: الرئيسيّة، الألعاب، ادخل، التصنيف، حسابي. الزرّ الذهبيّ «ادخل» لمن يحمل كود غرفةٍ من الموجّه؛ أمّا من حجزَ فيدخل من بطاقة حجزه.</p>,
  },
  { id: 'rank-go', ch: 'club', target: '[data-guide="nav-rank"]', pos: 'mid', wait: 'افتح «التصنيف»', until: { path: '/player/rank' } },
  {
    id: 'rank', ch: 'club', path: '/player/rank', pos: 'bottom',
    text: <p>ترتيبك بين لاعبي مدينتك في الموسم. تصعد من مُخبر إلى جنديّ فكابو فأندربوس فالأب الروحيّ.</p>,
  },
  { id: 'profile-go', ch: 'club', target: '[data-guide="nav-profile"]', pos: 'mid', wait: 'افتح «حسابي»', until: { path: '/player/profile' } },
  {
    id: 'profile', ch: 'club', path: '/player/profile', target: '[data-guide="guide-replay"]',
    text: <p>إحصاءاتك ومبارياتك وإعداداتك هنا. ومن هذا السطر تعيد الجولة متى شئت.</p>,
  },

  // ── الحجز ──
  { id: 'games-go', ch: 'booking', target: '[data-guide="nav-games"]', pos: 'mid', wait: 'افتح «الألعاب»', until: { path: '/player/games' } },
  {
    id: 'games', ch: 'booking', path: '/player/games', target: '[data-guide="training-card"]',
    text: <p>فعاليّات النادي القادمة. أوّلها ليلتك التجريبيّة: لا يراها غيرك، ومجّانيّة. في كلّ بطاقة اليوم والساعة والمكان وعدد القادمين.</p>,
  },
  {
    id: 'book', ch: 'booking', path: '/player/games', target: '[data-guide="training-book"]', skipIfBooked: true,
    wait: 'اضغط «احجز»', until: { exists: '[data-guide="training-sheet"]' },
  },
  {
    id: 'confirm', ch: 'booking', path: '/player/games', target: '[data-guide="training-confirm"]', pos: 'top', skipIfBooked: true,
    wait: 'راجع التفاصيل ثمّ أكّد', until: { exists: '[data-guide="training-enter"]' }, back: 'book',
  },
  {
    id: 'booked', ch: 'booking', path: '/player/games', target: '[data-guide="training-card"]',
    text: <>
      <p>حجزك ثابت. «✅ محجوز» نفسه يلغي الحجز إن غيّرتَ رأيك.</p>
      <p>حين تُفتح غرفة الفعاليّة يظهر زرّ الدخول داخل بطاقة حجزك هذه، ويصلك إشعار. غرفة التدريب مفتوحةٌ الآن.</p>
    </>,
  },

  // ── باب الغرفة ──
  {
    id: 'enter', ch: 'room', path: '/player/games', target: '[data-guide="training-enter"]',
    text: <p>بابك إلى الغرفة هنا: زرّ «دخول ←» داخل بطاقة حجزك. يحمل كود الغرفة عنك، فلا تكتب شيئاً.</p>,
    wait: 'اضغط «دخول ←»', until: { path: '/player/guide' },
  },
];

export const stepIndex = (id: string) => Math.max(0, PAGE_STEPS.findIndex(s => s.id === id));
/** أوّل خطوة في فصلٍ ما — نقطة الاستئناف بعد إغلاق التطبيق */
export const chapterStart = (ch: string | null | undefined) => (ch === 'booking' || ch === 'room' ? 'games-go' : 'card');
