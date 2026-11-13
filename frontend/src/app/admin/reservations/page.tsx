'use client';

// ══════════════════════════════════════════════════════
// متابعة الحجوزات — أكثر صفحات اللوحة استعمالاً. مرجعُ التصميم هو الهاتف.
//
// السؤال الذي تجيب عنه الليلة: «من لم يصل بعد، ومتى يصل؟»
//   • الهاتف (وحتى 1199): قائمة واحدة بعناوين مجموعات ملتصقة — في الطريق · لم يردّوا ·
//     وصلوا · لن يحضروا — والعرض الافتراضيّ «لم يصلوا». صفوف 76 تُسحب لتعليم الحضور،
//     وأوراق سفليّة لكلّ فعل، وشريطٌ في قوس الإبهام.
//   • الحاسوب (≥ 1200): ثلاثة أعمدة + لوح جانبيّ فيه الشخص المحدَّد وسجلّ «الدون يتابع».
//
// 🔴 «وصل» يقرّره ما كان يقرّره دائماً: دخول الغرفة، الباب، الموظّف. الدون يسجّل
//    «متى سيصل» من ردّ العميل ولا يعلّم وصولاً أبداً — ولا شيء في الواجهة يوحي بغير ذلك.
//
// 🔴 المجموعات تُحسب هنا من حقول الصفّ (components/reservations/arrival.ts). وغير المثبَّت
//    وقائمة الانتظار خارجها: يبقون تحت شرائحهم كما كانوا.
//
// 🔴 نقاط المتابعة جديدة على الخادم: كلّ ميزةٍ تختفي وحدها إن ردّ 404، والحقل الغائب null.
//
// ⚠️ لا قدرةَ حُذفت — كلُّ فعلٍ كان موجوداً له موضعٌ في الصفحة.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Check, ChevronDown, CircleCheck, DoorOpen, Ellipsis, FileSpreadsheet, Images, ListChecks,
  MessageSquareText, Plus, Printer, RefreshCw, Search, Send, Sparkles, TriangleAlert, UserRound, X,
} from 'lucide-react';
import '../whatsapp/wa.css';
import './res.css';
import { Chip, Empty, Pop, Skel } from '../whatsapp/wa-ui';
import { saveFile, isIOS, isStandalone } from '@/lib/saveFile';
import { fillTemplate, ensureHttp, openWhatsApp, type TemplateVar } from '@/lib/whatsapp';
import MessageTemplateEditor from '@/components/MessageTemplateEditor';
import { swalAlert, swalConfirm, swalToast } from '@/lib/swal';
import {
  attendOrder, genderSplit, isPending, isWaitlist, matchesSearch, normPhoneKey, needsWa,
} from '@/lib/reservation-status';
import { useReservations, apiFetch, getToken, type Reservation } from '@/hooks/useReservations';
import ResRow from '@/components/reservations/ResRow';
import PersonSheet, { PersonPanel } from '@/components/reservations/PersonSheet';
import QuickAddSheet from '@/components/reservations/QuickAddSheet';
import WaConfirmBar from '@/components/reservations/WaConfirmBar';
import FollowupPop from '@/components/reservations/FollowupPop';
import BotSettingsPop from '@/components/reservations/BotSettingsPop';
import DonFeed, { reviewOpen } from '@/components/reservations/DonFeed';
import { arrivalGroup, hm, isLate, num, sortOnway, type ResEvent } from '@/components/reservations/arrival';
import DirectSendDialog, { type DirectItem } from '@/components/DirectSendDialog';
import { useWaDirect } from '@/hooks/useWaDirect';
import { Sheet, SheetHead, ActionRow } from '@/components/reservations/Sheet';
import { useVisibleViewport } from '@/hooks/useVisibleViewport';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// ── قالبُ رسالة التأكيد ──
export interface ResVars {
  name: string; activityName: string; count: number;
  locationName?: string; region?: string; when?: string; mapUrl?: string;
  /** برنامجُ الليلة كما هو في الفعاليّة — أوقاتٌ محلّيّة بصيغة HH:MM */
  schedule?: any[];
}

// ══════════════════════════════════════════════════════
// 🕹️ برنامجُ الليلة داخل الرسالة
//
// 🔴 الألعابُ بأوقاتها والاستراحةُ سطرٌ واحد: سردُ كلّ استراحةٍ على حدة يضاعف
//    طولَ الرسالة بلا معلومةٍ جديدة — الاستراحاتُ متساويةٌ عادةً. فإن اختلفت
//    فعلاً لا نكذب بتلخيصها، بل نقول «بينها استراحات» بلا رقم.
//
// 🔴 والأوقاتُ بالأرقام العربيّة و«ص/م»: الرسالةُ عربيّةٌ كلُّها، ورقمٌ لاتينيٌّ
//    وسطَها يقطع القراءة. و«19:30» لا تُقرأ في نصٍّ عربيٍّ كما تُقرأ «٧:٣٠ م».
// ══════════════════════════════════════════════════════
const arDigits = (t: string) => String(t).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

function hhmmAr(t: unknown): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return '';
  let h = Number(m[1]);
  const period = h >= 12 ? 'م' : 'ص';
  h = h % 12 || 12;
  return `${arDigits(String(h))}:${arDigits(m[2])} ${period}`;
}

function minutesOf(t: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** يُعيد كتلةَ البرنامج مسبوقةً بسطرٍ فارغ — أو '' فيسقط السطرُ كلُّه. */
function scheduleBlock(slots?: any[]): string {
  const list = Array.isArray(slots) ? slots : [];
  const games = list.filter(x => x && x.kind !== 'break' && x.start);
  if (!games.length) return '';

  const durs = list
    .filter(x => x && x.kind === 'break')
    .map(b => {
      const a = minutesOf(b.start), z = minutesOf(b.end);
      return a == null || z == null ? null : ((z - a) + 1440) % 1440;
    })
    .filter((d): d is number => d != null && d > 0);

  const lines = ['', '🕹️ برنامج الليلة:'];
  for (const g of games) lines.push(`• ${g.label || 'لعبة'} — ${hhmmAr(g.start)}`);

  if (durs.length && durs.every(d => d === durs[0])) {
    const d = durs[0];
    const unit = d === 1 ? 'دقيقة' : d === 2 ? 'دقيقتان' : d <= 10 ? 'دقائق' : 'دقيقة';
    lines.push(`وبين كلّ لعبتين استراحة ${arDigits(String(d))} ${unit}.`);
  } else if (durs.length) {
    lines.push('وبين الألعاب استراحات.');
  }
  return lines.join(String.fromCharCode(10));
}
// النصُّ الافتراضيّ ومتغيّراتُه — منقولان حرفاً بحرف عن النسخة السابقة.
// 🔴 القالبُ محفوظٌ على جهاز الموظّف لا على الخادم: كلٌّ يصوغ رسالته بلا أن
//    يفرضها على غيره. والمفتاحُ نفسُه، فلا يفقد أحدٌ قالبه بهذا التغيير.
const RES_VARS: TemplateVar<ResVars>[] = [
  { token: '{الاسم}', label: 'الاسم', get: (r) => r.name || '' },
  { token: '{الفعالية}', label: 'الفعاليّة', get: (r) => r.activityName || '' },
  { token: '{العدد}', label: 'عدد الأشخاص',
    get: (r) => (r.count === 1 ? 'شخص واحد' : r.count === 2 ? 'شخصين' : `${r.count} أشخاص`) },
  { token: '{المكان}', label: 'المكان', optional: true,
    get: (r) => [r.locationName, r.region].filter(Boolean).join(' — ') },
  { token: '{الخريطة}', label: 'رابط الخريطة', optional: true, get: (r) => ensureHttp(r.mapUrl) },
  { token: '{الموعد}', label: 'الموعد', optional: true, get: (r) => r.when || '' },
  { token: '{الجدول}', label: 'برنامج الليلة', optional: true, get: (r) => scheduleBlock(r.schedule) },
];

// 🔴 النقاطُ الثلاث تُقال **قبل** الليلة لا فيها: تذكيرُ اللاعب بالمقعد أو
//    بالهاتف وهو جالسٌ على الطاولة يُفسد الجوّ ويُحرجه أمام الطاولة، وقولُها
//    في رسالة التأكيد يجعلها شرطَ حضورٍ معلوماً لا لوماً في وجهه.
//
// 🔴 وصيغةُ كلّ نقطةٍ «سبب» لا «أمر»: «المتأخّر قد يفوته الدور الأوّل» يُقنع،
//    و«ممنوع التأخير» يُنفّر. المدعوُّ ضيفٌ يدفع، لا متدرّبٌ يُلقَّن.
//
// 🔴 والوقتُ لا يُكتب رقماً هنا (١٥ دقيقة مثلاً): تلك سياسةٌ يملكها المالك،
//    فتُترك نصّاً في القالب يُعدَّل من زرّ «القالب» بلا لمس شيفرة.
// 🔴 النصّ نفسه في backend/src/services/reservation-confirm.service.ts (DEFAULT_TPL) — يتغيّران معاً.
//    (2026-10-30) الختام «يُرجى الردّ… لتثبيت الحجز نهائيّاً» ناقض رسالةً تخرج تلقائيّاً لأنّ الحجز ثُبّت فعلاً.
const RES_TPL_BODY = [
  'مرحباً {الاسم} 👋',
  'نؤكّد حجزك في «{الفعالية}» لعدد {العدد}.',
  '📍 المكان: {المكان}',
  '🗺️ الموقع على الخريطة: {الخريطة}',
  '🗓️ الموعد: {الموعد}',
  '{الجدول}',
  '',
  'وقبل الحضور، ثلاثُ نقاطٍ تجعل الليلة أمتعَ للجميع:',
  '',
  '⏰ الحضور في الموعد',
  'المقاعد تُوزَّع قبل البداية والجولة تنطلق بوقتها — والمتأخّر قد يفوته الدور الأوّل.',
  '',
  '🎭 تنظيم اللعبة',
  'اللعب بجولات، ولكلّ لاعبٍ مقعدُه المحدَّد — فنرجو التعاون مع فريق التنظيم في الجلوس والترتيب.',
  '',
  '🎙️ تعليمات الليدر',
  'الليدر يدير الجولة، وقرارُه أثناء اللعب نهائيّ — والنقاشُ بعد انتهائها.',
  '',
];
const RES_TPL_DEFAULT = [...RES_TPL_BODY, 'إذا تغيّرت خطّتك ردّ على هذه الرسالة وبنرتّبها معك. بانتظارك! 🎭'].join(String.fromCharCode(10));

const TPL_KEY = 'reservations_wa_template';

// ══════════════════════════════════════════════════════
// 🔴 القوالبُ الافتراضيّة السابقة — بها وحدها يصل التحديثُ إلى مَن لم يعدّل.
//
//    العطبُ الذي تُصلحه: القالبُ محفوظٌ على الجهاز ويغلب الافتراضيَّ دائماً.
//    فيكفي أن يفتح الموظّفُ المحرّرَ ويلمس حرفاً — أو يضغط «استعادة» يوماً —
//    ليتجمّد على نصّ ذلك اليوم إلى الأبد، ولا يبلغه أيُّ تحسينٍ بعده.
//    قِيس فعلاً: حُدِّث الافتراضيُّ ولم يتغيّر شيءٌ على جهاز المالك.
//
//    الآن: المحفوظُ الذي يطابق افتراضيّاً **سابقاً** = «لم يعدّله أحد»، فيُرقّى
//    صامتاً. وما خالفها كلَّها صياغةٌ يملكها صاحبُها — لا تُدهس، بل يُنبَّه.
// ══════════════════════════════════════════════════════
const RES_TPL_LEGACY: string[] = [
  // نسخةُ ما قبل ٣٠ تشرين الأوّل — الختام القديم «لتثبيت الحجز نهائيّاً»
  [...RES_TPL_BODY, 'يُرجى الردّ على هذه الرسالة لتثبيت الحجز نهائيّاً. بانتظارك! 🎭'].join(String.fromCharCode(10)),
  // الأصليّ — قبل إضافة نقاط التنظيم
  [
    'مرحباً {الاسم} 👋',
    'نؤكّد حجزك في «{الفعالية}» لعدد {العدد}.',
    '📍 المكان: {المكان}',
    '🗺️ الموقع على الخريطة: {الخريطة}',
    '🗓️ الموعد: {الموعد}',
    '',
    'يُرجى الردّ على هذه الرسالة لتثبيت الحجز بشكلٍ نهائيّ. بانتظارك! 🎭',
  ].join(String.fromCharCode(10)),
  // نسخةُ ٣ أيلول — كانت تذكر الهاتف، وأُلغيت النقطة بطلب المالك
  [
    'مرحباً {الاسم} 👋',
    'نؤكّد حجزك في «{الفعالية}» لعدد {العدد}.',
    '📍 المكان: {المكان}',
    '🗺️ الموقع على الخريطة: {الخريطة}',
    '🗓️ الموعد: {الموعد}',
    '',
    'وقبل الحضور، ثلاثُ نقاطٍ تجعل الليلة أمتعَ للجميع:',
    '',
    '⏰ الحضور في الموعد',
    'المقاعد تُوزَّع قبل البداية والجولة تنطلق بوقتها — والمتأخّر قد يفوته الدور الأوّل.',
    '',
    '🎭 تنظيم اللعبة',
    'اللعب بجولات، ولكلّ لاعبٍ مقعدُه المحدَّد. ويبقى الهاتف بعيداً أثناء الجولة —',
    'فعليه تقوم عدالةُ اللعبة وسِرُّها.',
    '',
    '🎙️ تعليمات الليدر',
    'الليدر يدير الجولة، وقرارُه أثناء اللعب نهائيّ — والنقاشُ بعد انتهائها.',
    '',
    'يُرجى الردّ على هذه الرسالة لتثبيت الحجز نهائيّاً. بانتظارك! 🎭',
  ].join(String.fromCharCode(10)),
];

/** نصُّ القالب عند الإقلاع — يُرقّي غيرَ المعدَّل ويُبقي المعدَّل. */
function initialTpl(): string {
  if (typeof window === 'undefined') return RES_TPL_DEFAULT;
  let saved: string | null = null;
  try { saved = localStorage.getItem(TPL_KEY); } catch { /* تصفّحٌ خاصّ */ }
  if (!saved) return RES_TPL_DEFAULT;
  if (saved.trim() === RES_TPL_DEFAULT.trim()) return RES_TPL_DEFAULT;
  if (RES_TPL_LEGACY.some(v => v.trim() === saved!.trim())) {
    try { localStorage.setItem(TPL_KEY, RES_TPL_DEFAULT); } catch { /* لا شيء */ }
    return RES_TPL_DEFAULT;
  }
  return saved;
}

type ChipKey = 'notArrived' | 'all' | 'attended' | 'noShow' | 'pending' | 'waitlist' | 'needsWa' | 'unmarked';
type GroupKey = 'onway' | 'silent' | 'arrived' | 'declined' | 'other';

const GROUP_LABEL: Record<GroupKey, string> = {
  onway: 'في الطريق', silent: 'لم يردّوا', arrived: 'وصلوا', declined: 'لن يحضروا', other: 'غير مثبَّت وانتظار',
};
const GROUP_ORDER: GroupKey[] = ['onway', 'silent', 'arrived', 'declined', 'other'];
/** كم يُعرض من «وصلوا» في عمود الحاسوب قبل «وآخرون» */
const ARRIVED_PEEK = 6;

function chipMatch(k: ChipKey, r: Reservation): boolean {
  switch (k) {
    case 'notArrived': { const g = arrivalGroup(r); return g === 'onway' || g === 'silent'; }
    case 'attended': return r.attended === true;
    case 'noShow': return r.attended === false;
    case 'unmarked': return r.attended == null;
    case 'pending': return isPending(r);
    case 'waitlist': return isWaitlist(r);
    case 'needsWa': return needsWa(r);
    default: return true;
  }
}

/**
 * لوحة الأعمدة الثلاثة تحتاج عرضاً فعليّاً: الشاشة ≥ 1200 **و** حاوية الصفحة ≥ 1000
 * (الشريط الجانبيّ المفتوح يأكل 260 — عند 1200 تماماً تبقى 890 فتُسحق الأعمدة).
 */
function useDesk(ref: React.RefObject<HTMLDivElement>): boolean {
  const [desk, setDesk] = useState(false);
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const measure = () => {
      setDesk(window.innerWidth >= 1200 && host.clientWidth >= 1000);
      // ما يُثبَّت أسفل الشاشة (الشريط، «تراجع») يتوسّط عمود الصفحة لا الشاشة — وإلّا غطّاه الشريط الجانبيّ على اللوحيّ
      const r = host.getBoundingClientRect();
      ref.current?.style.setProperty('--res-l', `${Math.max(0, Math.round(r.left))}px`);
      ref.current?.style.setProperty('--res-r', `${Math.max(0, Math.round(window.innerWidth - r.right))}px`);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(host);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, [ref]);
  return desk;
}

export default function ReservationsPage() {
  const vp = useVisibleViewport();   // 📱 الجزءُ الظاهر من الشاشة (انزياحُ آيفون بعد لوحة المفاتيح)
  const R = useReservations({ live: true });
  const rootRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const desk = useDesk(rootRef);

  const [selId, setSelId] = useState<number | null>(null);
  const [focusEta, setFocusEta] = useState<number | null>(null);
  const [chip, setChip] = useState<ChipKey>('notArrived');
  const [showAdd, setShowAdd] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showTpl, setShowTpl] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number; prev: boolean | null } | null>(null);
  const [waJust, setWaJust] = useState<Reservation | null>(null);
  // 📤 رقم الأعمال مفعّل ⟵ الرسالة تخرج من النظام مباشرة بدل فتح تطبيق واتساب
  const direct = useWaDirect();
  const [dsend, setDsend] = useState<{ items: DirectItem[]; title: string; label: string } | null>(null);

  // ⏱ المتابعة وسجلّ الدون — كلّ ميزةٍ تختفي وحدها إن ردّ الخادم 404 (لم تصله بعد)
  const [followOpen, setFollowOpen] = useState(false);
  const [followAvail, setFollowAvail] = useState(true);
  const [botOpen, setBotOpen] = useState(false);
  const [botAvail, setBotAvail] = useState(true);
  const [events, setEvents] = useState<ResEvent[]>([]);
  const [eventsAvail, setEventsAvail] = useState(true);
  const [feedOpen, setFeedOpen] = useState(false);
  const [undoBusy, setUndoBusy] = useState<number | null>(null);
  const [showAllArrived, setShowAllArrived] = useState(false);
  const [showDeclined, setShowDeclined] = useState(true);

  // 🕒 نبضة كلّ ٣٠ث: «بعد ١٠ د» و«تأخّر» تُحسبان من اللحظة، فلا بدّ أن تُعاد الرسمة ولو لم يتغيّر صفّ
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    const onVis = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  // ══════════════════════════════════════════════════════
  // 📝 القالب مشتركٌ في الخادم (2026-10-30): كان على جهاز كلّ موظّف، فيرسل جهازان نصّين مختلفين
  //    ولا يعرفه الخادم ليرسله وحده عند التثبيت. التعديل للأدمن، ويُحفظ تلقائيّاً بعد التوقّف عن الكتابة.
  //    قالبٌ قديم على هذا الجهاز يخالف المشترك يُعرض مرّةً واحدة: يُعتمد أو يُتجاهل — لا يُرسل بعدها.
  // ══════════════════════════════════════════════════════
  const isAdmin = useMemo(() => { try { return JSON.parse(localStorage.getItem('user') || '{}')?.role === 'admin'; } catch { return false; } }, []);
  const [tpl, setTpl] = useState(RES_TPL_DEFAULT);
  const [deviceTpl, setDeviceTpl] = useState<string | null>(null);
  const [autoOn, setAutoOn] = useState(false);
  const [tplSave, setTplSave] = useState<'' | 'saving' | 'saved' | 'error'>('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await apiFetch('/api/reservations/confirm-template');
        if (!alive || !d?.text) return;
        setTpl(d.text);
        setAutoOn(!!d.autoEnabled);
        const local = initialTpl();
        if (local.trim() !== d.text.trim() && local.trim() !== RES_TPL_DEFAULT.trim()) setDeviceTpl(local);
      } catch { if (alive) setTpl(initialTpl()); }   // الخادم لا يردّ ⟵ آخر ما على الجهاز
    })();
    return () => { alive = false; if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);
  /** قالبٌ يختلف عن الافتراضيّ الحاليّ — يُنبَّه الأدمن ولا يُدهس */
  const tplCustomised = tpl.trim() !== RES_TPL_DEFAULT.trim();
  const forgetDeviceTpl = () => { setDeviceTpl(null); try { localStorage.removeItem(TPL_KEY); } catch { /* لا شيء */ } };
  const saveTpl = (v: string) => {
    setTpl(v);
    if (!isAdmin) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setTplSave('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        await apiFetch('/api/reservations/confirm-template', { method: 'PUT', body: JSON.stringify({ text: v }) });
        setTplSave('saved');
      } catch { setTplSave('error'); }
    }, 800);
  };

  const single = !!R.activityId && R.activityId !== 'all';
  const actId = single ? Number(R.activityId) : 0;

  // تغيّرت الفعاليّة ⟵ العرض الافتراضيّ لها، ولا يبقى شخصٌ من فعاليّةٍ أخرى محدَّداً
  useEffect(() => {
    setChip(R.activityId === 'all' ? 'all' : 'notArrived');
    setSelId(null); setFocusEta(null); setShowAllArrived(false);
  }, [R.activityId]);

  // ── ارتفاع الرأس الثابت ⟵ عناوين المجموعات تلتصق تحته لا تحت شريط اللوحة ──
  useEffect(() => {
    const head = headRef.current, root = rootRef.current;
    if (!head || !root) return;
    const apply = () => root.style.setProperty('--res-head-h', `${desk ? 0 : head.offsetHeight + vp.shiftTop}px`);
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(head);
    return () => ro?.disconnect();
  }, [desk, vp.shiftTop, R.loading, R.activityId]);

  // ══ سجلّ «الدون يتابع» ══
  const actRef = useRef(R.activityId);
  actRef.current = R.activityId;
  const loadEvents = useCallback(async () => {
    if (!single || !eventsAvail) return;
    const asked = R.activityId;
    try {
      const d = await apiFetch(`/api/reservations/events?activityId=${encodeURIComponent(asked)}&limit=50`);
      if (actRef.current !== asked) return;   // بُدّلت الفعاليّة أثناء الجلب
      setEvents(Array.isArray(d) ? d : Array.isArray(d?.events) ? d.events : []);
    } catch (e: any) {
      if (e?.status === 404) setEventsAvail(false);
    }
  }, [single, eventsAvail, R.activityId]);
  useEffect(() => { setEvents([]); loadEvents(); }, [R.activityId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (document.visibilityState === 'visible') loadEvents();
  }, [now, R.liveTick]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── نصُّ رسالة الواتساب لصفٍّ بعينه ──
  const waMessage = useCallback((r: Reservation) => {
    const act = R.activities.find(a => a.id === r.activityId);
    const loc = act?.locationId ? R.locations.find(l => l.id === act.locationId) : null;
    const when = act?.date
      ? new Date(act.date).toLocaleString('ar-JO', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
      : '';
    return fillTemplate(tpl, RES_VARS, {
      name: r.contactName, activityName: act?.name || '', count: r.peopleCount || 1,
      locationName: loc?.name, region: loc?.region, when, mapUrl: loc?.mapUrl,
      schedule: (act as any)?.gameSchedule,
    });
  }, [R.activities, R.locations, tpl]);

  // ══════════════════════════════════════════════════════
  // 💬 إرسالُ رسالةٍ يدويّةٍ وتسجيلُها
  //
  // يفتح واتساب فوراً ثمّ يُعلّم — بهذا الترتيب: فتحُ نافذةٍ بعد `await`
  // يعدّه المتصفّحُ نافذةً منبثقةً لا استجابةً للمسة، فيحجبها.
  // ══════════════════════════════════════════════════════
  const asItem = useCallback((r: Reservation): DirectItem => ({
    phone: r.phone || '', text: waMessage(r), name: r.contactName, reservationId: r.id, playerId: (r as any).playerId ?? null,
  }), [waMessage]);
  const sendWa = useCallback((r: Reservation) => {
    if (direct) {
      setDsend({ items: [asItem(r)], title: `رسالة إلى ${r.contactName || r.phone}`, label: `حجز #${r.id}` });
      return;
    }
    if (!openWhatsApp(r.phone || '', waMessage(r))) {
      swalAlert('رقمٌ غير صالحٍ للواتساب — صحّحه من «تعديل».', 'error');
      return;
    }
    R.markWaSent(r.id, true);
    setToast(null);   // يتشاركان الموضعَ نفسَه أسفلَ الشاشة
    setWaJust(r);
  }, [R, waMessage, direct, asItem]);

  // ══ ما يُعرض ══
  /** بعد البحث والجنس — قبل الشريحة. منه أعمدة اللوحة */
  const base = useMemo(() => R.scoped.filter(r =>
    (R.gender === 'all' || genderSplit(r)[R.gender] > 0) && matchesSearch(r, R.search)),
  [R.scoped, R.gender, R.search]);

  /** بعد الشريحة — بترتيب الشاشة */
  const rows = useMemo(() => base.filter(r => chipMatch(chip, r)).sort((a, b) => attendOrder(a) - attendOrder(b)),
    [base, chip]);

  const grouped = useMemo(() => {
    const g: Record<GroupKey, Reservation[]> = { onway: [], silent: [], arrived: [], declined: [], other: [] };
    for (const r of rows) g[arrivalGroup(r)].push(r);
    g.onway = sortOnway(g.onway, now);
    return g;
  }, [rows, now]);

  const board = useMemo(() => {
    const g: Record<GroupKey, Reservation[]> = { onway: [], silent: [], arrived: [], declined: [], other: [] };
    for (const r of base) g[arrivalGroup(r)].push(r);
    g.onway = sortOnway(g.onway, now);
    return g;
  }, [base, now]);

  /** أعداد الفعاليّة كلّها — لا تتأثّر بالبحث ولا بالشريحة */
  const arr = useMemo(() => {
    const c = { onway: 0, late: 0, silent: 0, arrived: 0, declined: 0 };
    for (const r of R.scoped) {
      const g = arrivalGroup(r);
      if (g === 'other') continue;
      c[g]++;
      if (g === 'onway' && isLate(r, now)) c.late++;
    }
    return c;
  }, [R.scoped, now]);
  /** من يُتابَع الآن: لم يردّوا + من تجاوزوا وقتهم. المعاينة تقرّر من يصله فعلاً. */
  const followN = arr.silent + arr.late;
  const canFollow = single && followAvail;

  /** نطاق «أرسل للكلّ» و«التالي»: العرض الحاليّ — والعرض الافتراضيّ («لم يصلوا») يعني الجميع كما كان */
  const sendScope = chip === 'notArrived' ? base : rows;
  /** مَن ينتظر رسالةً في العرض الحاليّ — بترتيب الشاشة نفسِه لئلّا يقفز المؤشّر */
  const waQueue = useMemo(
    () => sendScope.filter(x => needsWa(x) && x.id !== waJust?.id),
    [sendScope, waJust],
  );

  const sel = useMemo(() => (selId == null ? null : R.reservations.find(r => r.id === selId) ?? null), [selId, R.reservations]);
  const openRow = useCallback((r: Reservation) => { setFocusEta(null); setSelId(r.id); }, []);

  // ── كشفُ التكرار — على صفوف الفعاليّة المستهدَفة ──
  const findDuplicate = useCallback((activityId: number, name: string, phone: string, playerId: number | null) => {
    const nm = name.trim().toLowerCase();
    const ph = normPhoneKey(phone);
    return R.reservations.find(r => {
      if (r.deletedAt || r.activityId !== activityId) return false;
      if (playerId && r.playerId === playerId) return true;
      if (ph.length >= 6 && normPhoneKey(r.phone) === ph) return true;
      return !playerId && ph.length < 6 && !!nm && (r.contactName || '').trim().toLowerCase() === nm;
    }) || null;
  }, [R.reservations]);

  // ── تعليمُ الحضور مع «تراجع» بدل نافذة تأكيد ──
  const markAttend = useCallback((id: number, v: boolean | null) => {
    const row = R.reservations.find(x => x.id === id);
    const prev = row?.attended ?? null;
    R.setAttendance(id, v);
    setToast({
      id, prev,
      text: `${row?.contactName ?? ''} — ${v === true ? 'حضر' : v === false ? 'لم يحضر' : 'أُزيل التعليم'}`,
    });
    window.setTimeout(() => setToast(t => (t && t.id === id ? null : t)), 4200);
  }, [R]);

  const setEta = useCallback(async (id: number, etaAt: string | null) => {
    const ok = await R.setEta(id, etaAt);
    if (ok) { setFocusEta(null); loadEvents(); }
    return ok;
  }, [R, loadEvents]);

  // ── سجلّ الدون: تراجع · «حدّد الوقت» ──
  const undoEvent = async (e: ResEvent) => {
    setUndoBusy(e.id);
    try {
      await apiFetch(`/api/reservations/events/${e.id}/undo`, { method: 'POST' });
      swalToast('تمّ التراجع', 'success');
    } catch (err: any) {
      swalAlert('تعذّر التراجع: ' + (err?.message || ''), 'error');
    } finally {
      setUndoBusy(null);
      R.fetchAll(); loadEvents();
    }
  };
  const pickForEta = (reservationId: number) => {
    if (!R.reservations.some(r => r.id === reservationId)) { swalToast('هذا الحجز لم يعد في القائمة', 'info'); return; }
    setFeedOpen(false);
    setSelId(reservationId);
    setFocusEta(reservationId);
  };

  // ══ كشفُ الحاجزين (PDF / Excel) ══
  async function exportRoster(format: 'pdf' | 'excel') {
    if (!single) return;
    setBusy(format);
    try {
      const res = await fetch(`${API_URL}/api/reports/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ key: 'reservation-roster', format, params: { activityId: Number(R.activityId) } }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({} as any));
        throw new Error(d?.error || 'فشل توليد الكشف');
      }
      const blob = await res.blob();
      const base = `كشف حجوزات - ${R.activityName(Number(R.activityId))}`;
      // 🔴 `<a download>` و`window.open(blob:)` يسقطان في التطبيق المثبَّت على iOS
      //    — لا مديرَ تنزيلاتٍ هناك. saveFile يجرّب ورقةَ المشاركة أوّلاً.
      if (format === 'pdf' && !isIOS() && !isStandalone()) {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const r = await saveFile(blob, `${base}.${format === 'pdf' ? 'pdf' : 'xlsx'}`, { title: base });
        if (r === 'failed') swalAlert('تعذّر حفظ الكشف على هذا الجهاز', 'error');
      }
    } catch (err: any) {
      swalAlert('فشل توليد الكشف: ' + (err?.message || ''), 'error');
    } finally { setBusy(null); }
  }

  // ══ تحديثُ الحضور من الألعاب ══
  async function markFromGames() {
    const scope = single ? R.activityName(Number(R.activityId)) : 'كلّ الفعاليّات';
    if (!(await swalConfirm(`مراجعة الحجوزات المثبّتة في «${scope}» وتحويل من له لعبة مسجّلة إلى «حاضر»؟`))) return;
    setBusy('games');
    try {
      const r = await apiFetch(
        '/api/reservations/mark-attendance-from-games',
        { method: 'POST', body: JSON.stringify({ activityId: R.activityId || 'all' }) },
      );
      await R.fetchAll();
      swalAlert(r.marked > 0
        ? `حُوّل ${num(r.marked)} حجزاً إلى «حاضر» بناءً على الألعاب المسجّلة.`
        : 'لا حجوزات جديدة للتحويل — كلّ من له ألعاب مُعلَّم حاضراً بالفعل.', r.marked > 0 ? 'success' : 'info');
    } catch (err: any) { swalAlert('فشل التحديث: ' + (err?.message || ''), 'error'); }
    finally { setBusy(null); }
  }

  // ══ تثبيتُ كلّ المعلَّق — تتابعاً لا توازياً (يحمي ترقيم الحجوزات) ══
  async function confirmAllPending() {
    const list = R.pendingRows;
    if (!list.length) return;
    const people = list.reduce((s, r) => s + (r.peopleCount || 1), 0);
    if (!(await swalConfirm(
      `تثبيت ${num(list.length)} حجزاً (${num(people)} شخصاً)؟\n\nسيُسجَّل لكلّ حسابٍ مربوطٍ حجزٌ في الفعاليّة يظهر له في التطبيق.`,
    ))) return;
    setBusy('bulk');
    let ok = 0; const failed: string[] = [];
    for (const r of list) {
      try {
        await apiFetch(`/api/reservations/${r.id}`, { method: 'PUT', body: JSON.stringify({ status: 'confirmed' }) });
        ok++;
      } catch { failed.push(r.contactName || `#${r.id}`); }
    }
    setBusy(null);
    await R.fetchAll();
    swalAlert(
      failed.length ? `ثُبّت ${num(ok)} — وتعذّر ${num(failed.length)}: ${failed.slice(0, 5).join('، ')}` : `ثُبّت ${num(ok)} حجزاً`,
      failed.length ? 'warning' : 'success',
    );
  }

  const previewRow = useMemo((): { data: ResVars; labelAr: string } => {
    const r = sendScope[0];
    if (r) {
      const act = R.activities.find(a => a.id === r.activityId);
      const loc = act?.locationId ? R.locations.find(l => l.id === act.locationId) : null;
      return {
        labelAr: `معاينة على: ${r.contactName}`,
        data: {
          name: r.contactName, activityName: act?.name || '', count: r.peopleCount || 1,
          locationName: loc?.name, region: loc?.region, mapUrl: loc?.mapUrl,
          when: act?.date ? new Date(act.date).toLocaleString('ar-JO', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '',
        },
      };
    }
    return {
      labelAr: 'معاينة على مثال',
      data: { name: 'محمد', activityName: 'ليلة الخميس', count: 2, locationName: 'مقهى النخبة', region: 'وسط البلد', when: 'الخميس ٨:٠٠ م', mapUrl: 'https://maps.app.goo.gl/xxx' },
    };
  }, [sendScope, R.activities, R.locations]);

  const c = R.counts;
  const chips: { k: ChipKey; label: string; n: number }[] = [
    ...(single ? [{ k: 'notArrived' as const, label: desk ? 'اللوحة · لم يصلوا' : 'لم يصلوا', n: arr.onway + arr.silent }] : []),
    { k: 'all', label: 'الكلّ', n: c.total },
    { k: 'pending', label: 'غير مثبّت', n: c.pending },
    { k: 'waitlist', label: 'انتظار', n: c.waitlist },
    { k: 'needsWa', label: 'لم تُرسل', n: c.needsWa },
    { k: 'unmarked', label: 'لم يُعلَّم', n: c.unmarked },
    { k: 'attended', label: 'حضر', n: c.attended },
    { k: 'noShow', label: 'لم يحضر', n: c.noShow },
  ];
  const homeChip: ChipKey = single ? 'notArrived' : 'all';
  const showBoard = desk && single && chip === 'notArrived';

  // ── سطر الدون على الهاتف: ما يحتاج نظراً أوّلاً، ثمّ من ضُبط وقتهم ──
  const reviewN = events.filter(e => reviewOpen(e, R.reservations)).length;
  const botNames = Array.from(new Set(
    events.filter(e => e.kind === 'eta_set' && e.actor === 'bot' && !e.undone && e.name).map(e => e.name as string),
  ));
  const feedLine: React.ReactNode = reviewN > 0
    ? <><b><span className="ltr">{num(reviewN)}</span> {reviewN === 1 ? 'ردّ يحتاج' : 'ردود تحتاج'} نظرك</b> — لم يفهم الدون منها وقتاً.</>
    : botNames.length > 0
      ? <>الدون ضبط وقت وصول <b>{botNames[0]}</b>{botNames[1] && <> و<b>{botNames[1]}</b></>}{botNames.length > 2 && <> و<span className="ltr">{num(botNames.length - 2)}</span> آخرين</>} من الردود.</>
      : events[0]
        ? <><span className="ltr">{hm(events[0].at)}</span> · {events[0].name && !String(events[0].text || '').includes(events[0].name) ? <b>{events[0].name}: </b> : null}{events[0].text}</>
        : null;
  const showFeed = single && eventsAvail;

  const personProps = {
    now, events,
    onAttend: markAttend, onConfirm: R.setConfirmed, onUpdate: R.updateRow, onDelete: R.removeRow, onEta: setEta,
    onWaSend: sendWa,
    onWaClear: (r: Reservation) => { R.markWaSent(r.id, false); if (waJust?.id === r.id) setWaJust(null); },
  };

  const rowEl = (r: Reservation, dense = false) => (
    <ResRow key={r.id} r={r} now={now} onOpen={openRow} onAttend={markAttend}
      dense={dense} swipe={!dense} arrival={single} selected={desk && selId === r.id} />
  );

  // ── قطع الرأس ──
  const picker = (
    <select value={R.activityId} onChange={e => R.setActivityId(e.target.value)} className="wa-select" aria-label="الفعاليّة">
      <option value="">— اختر الفعاليّة —</option>
      <option value="all">كلّ الفعاليّات</option>
      {R.activityOptions.map(a => (
        <option key={a.id} value={a.id}>{a.name}{a.cityName ? ` · ${a.cityName}` : ''}{a.status === 'completed' ? ' (منتهي)' : ''}</option>
      ))}
    </select>
  );
  const search = (
    <div className="wa-search grow">
      <Search />
      <input value={R.search} onChange={e => R.setSearch(e.target.value)} placeholder="اسم أو رقم" aria-label="بحث"
        className="wa-input" enterKeyHint="search" style={R.search ? { paddingInlineEnd: 44 } : undefined} />
      {R.search && (
        <button type="button" className="wa-iconbtn res-clear" aria-label="امسح البحث" onClick={() => R.setSearch('')}><X /></button>
      )}
    </div>
  );
  const followBtn = (cls: string) => (
    <button type="button" className={`wa-btn primary ${cls}`} onClick={() => setFollowOpen(true)}>
      <Send /><span>تابع من لم يصل (<span className="ltr">{num(followN)}</span>)</span>
    </button>
  );
  const progress = (
    <div className="res-progress">
      <div className="wa-readbar" role="img"
        aria-label={`وصل ${c.attended}، في الطريق ${arr.onway}، لم يردّ ${arr.silent}، لن يحضر ${arr.declined}`}>
        {arr.arrived > 0 && <i style={{ flex: arr.arrived, background: 'var(--ok)' }} />}
        {arr.onway > 0 && <i style={{ flex: arr.onway, background: 'var(--info)' }} />}
        {arr.silent > 0 && <i style={{ flex: arr.silent, background: 'var(--warn)' }} />}
        {arr.declined > 0 && <i style={{ flex: arr.declined, background: 'var(--ink-3)' }} />}
      </div>
      <span className="sum">
        <span className="ltr">{num(c.attended)}</span> من <span className="ltr">{num(c.total)}</span> وصلوا
        <small> · <span className="ltr">{num(c.people)}</span> شخصاً</small>
      </span>
      {desk && R.pendingRows.length > 0 && (
        <button type="button" className="wa-badge warn" style={{ border: 0, cursor: 'pointer', minHeight: 28 }} onClick={() => setChip('pending')}>
          <span className="ltr">{num(R.pendingRows.length)}</span> غير مثبَّت
        </button>
      )}
    </div>
  );
  const genderTiles = (
    <div role="group" aria-label="الحاجزون بالجنس" className="res-gtiles">
      {([['male', 'ذكور', c.male, 'm'], ['female', 'إناث', c.female, 'f'], ['unknown', 'غير محدّد', c.unknownGender, 'u']] as const).map(([k, label, n, cls]) => {
        const on = R.gender === k;
        return (
          <button key={k} type="button" aria-pressed={on} className={`res-gtile ${cls}`} onClick={() => R.setGender(on ? 'all' : k)}>
            <b>{num(n)}</b>{label}
          </button>
        );
      })}
    </div>
  );
  const chipRow = (
    <div className="wa-chips" role="group" aria-label="تصفية الحجوزات">
      {chips.map(ch => (
        <Chip key={ch.k} on={chip === ch.k} n={num(ch.n)}
          onClick={() => setChip(chip === ch.k ? homeChip : ch.k)}>
          {ch.label}
        </Chip>
      ))}
    </div>
  );

  const pendingBanner = R.pendingRows.length > 0 && (chip === 'notArrived' || chip === 'all') && !desk && (
    <button type="button" className="wa-banner warn flat res-banner-btn" onClick={() => setChip('pending')}>
      <TriangleAlert />
      <span><b><span className="ltr">{num(R.pendingRows.length)}</span> حجزاً غير مثبَّت</b> — لا يظهر للّاعب ولا في الفعاليّة</span>
      <span className="go">اعرضها</span>
    </button>
  );
  const feedBanner = showFeed && !desk && feedLine && (
    <button type="button" className={`wa-banner ${reviewN > 0 ? 'warn' : 'info'} flat res-banner-btn`} onClick={() => setFeedOpen(true)}>
      <Bot />
      <span>{feedLine}</span>
      <span className="go">السجلّ</span>
    </button>
  );

  const groupedList = (
    <div className="res-list">
      {pendingBanner}
      {feedBanner}
      {single
        ? GROUP_ORDER.map(g => grouped[g].length > 0 && (
          <div key={g}>
            <div className={`res-ghead ${g}`}>{GROUP_LABEL[g]} <small>{num(grouped[g].length)}</small></div>
            {grouped[g].map(r => rowEl(r))}
          </div>
        ))
        : rows.map(r => rowEl(r))}
      {!rows.length && (
        <Empty icon={<ListChecks />} title={R.search ? 'لا نتائج لهذا البحث' : chip === 'notArrived' ? 'لا أحد ينتظر' : 'لا حجوزات في هذا التصنيف'}>
          {!R.search && chip === 'notArrived' ? 'كلّ المثبَّتين وصلوا أو اعتذروا. غير المثبَّتين تحت «غير مثبّت».' : undefined}
        </Empty>
      )}
    </div>
  );

  const aside = (
    <aside className="res-aside">
      <div className="wa-card sel">
        {sel ? (
          <PersonPanel {...personProps} row={sel} focusEta={focusEta === sel.id}
            afterAction={a => { if (a === 'delete') setSelId(null); }} />
        ) : (
          <Empty icon={<UserRound />} title="اختر حاجزاً">اضغط اسماً لتسجّل وقت وصوله، تعلّمه حاضراً أو تراسله.</Empty>
        )}
      </div>
      {showFeed && (
        <div className="wa-card feed">
          <h3><Bot style={{ color: 'var(--info)' }} />الدون يتابع<small>مباشر</small></h3>
          <DonFeed events={events} rows={R.reservations} busyId={undoBusy} onUndo={undoEvent} onPick={pickForEta} />
        </div>
      )}
    </aside>
  );

  const col = (g: 'silent' | 'onway', dot: string) => (
    <section className={`res-col ${g}`} aria-label={GROUP_LABEL[g]}>
      <h3><i className="wa-dot" style={{ background: dot }} />{GROUP_LABEL[g]}<small>{num(board[g].length)}</small></h3>
      <div className="scroll">
        {board[g].map(r => rowEl(r, true))}
        {!board[g].length && <div className="none">{g === 'silent' ? 'الجميع ردّ أو وصل.' : 'لا أحد سجّل وقتاً بعد.'}</div>}
      </div>
    </section>
  );

  return (
    <div ref={rootRef} className={`wa res-root${desk ? ' res-desk' : ''}`} dir="rtl" style={{ background: 'transparent' }}>
      {R.loading ? (
        <div className="stack" style={{ padding: 'var(--space-3)' }}>
          <Skel h={44} /><Skel h={12} /><Skel h={44} /><Skel h={76} /><Skel h={76} /><Skel h={76} />
        </div>
      ) : (
        <>
          {/* ══ الرأس ══ */}
          {/* 🔴 top يحسب شريط اللوحة الثابت على الهاتف وانزياح آيفون — وإلّا انزلق الرأس تحته */}
          <div ref={headRef} className="res-head"
            style={desk ? undefined : { top: `calc(var(--admin-top, 0px) + ${vp.shiftTop}px)` }}>
            {desk ? (
              <>
                <div className="res-headrow">
                  <h1>متابعة الحجوزات</h1>
                  {picker}
                  {R.activityId && search}
                  <div className="acts">
                    {single && <Link href="/admin/reservations/door" className="wa-btn" title="وضع الباب — تعليمُ الحضور سريعاً"><DoorOpen />الباب</Link>}
                    {R.activityId && <button type="button" className={`wa-btn${canFollow ? '' : ' primary'}`} onClick={() => setShowAdd(true)}><Plus />حجز سريع</button>}
                    {R.activityId && <button type="button" className="wa-btn" onClick={() => setShowMore(true)}><Ellipsis />المزيد</button>}
                    {canFollow && followBtn('')}
                  </div>
                </div>
                {R.activityId && progress}
                {R.activityId && <div className="res-filters">{chipRow}{genderTiles}</div>}
              </>
            ) : (
              <>
                <div className="res-headrow">
                  {picker}
                  {single && (
                    <Link href="/admin/reservations/door" className="wa-iconbtn" aria-label="وضع الباب" title="وضع الباب — تعليمُ الحضور سريعاً">
                      <DoorOpen />
                    </Link>
                  )}
                </div>
                {R.activityId && (
                  <>
                    {progress}
                    <div className="res-headrow">{search}</div>
                    {genderTiles}
                    {chipRow}
                  </>
                )}
              </>
            )}
          </div>

          {/* ══ المحتوى ══ */}
          {!R.activityId ? (
            <Empty icon={<ListChecks />} title="اختر فعاليّة">اختر فعاليّةً من الأعلى لعرض حجوزاتها.</Empty>
          ) : showBoard ? (
            <div className="res-board">
              {col('silent', 'var(--warn)')}
              {col('onway', 'var(--info)')}
              <section className="res-col arrived" aria-label="وصلوا">
                <h3><i className="wa-dot ok" />وصلوا<small>{num(board.arrived.length)}</small></h3>
                <div className="scroll">
                  {(showAllArrived ? board.arrived : board.arrived.slice(0, ARRIVED_PEEK)).map(r => rowEl(r, true))}
                  {!board.arrived.length && <div className="none">لم يصل أحد بعد.</div>}
                  {board.arrived.length > ARRIVED_PEEK && (
                    <button type="button" className="wa-acc" style={{ borderRadius: 0, background: 'transparent' }}
                      aria-expanded={showAllArrived} onClick={() => setShowAllArrived(v => !v)}>
                      {showAllArrived ? 'اطوِ القائمة' : <>و<span className="ltr">{num(board.arrived.length - ARRIVED_PEEK)}</span> آخرون</>}
                      <span className="end"><ChevronDown style={showAllArrived ? { transform: 'rotate(180deg)' } : undefined} /></span>
                    </button>
                  )}
                  <button type="button" className="res-fold" aria-expanded={showDeclined} onClick={() => setShowDeclined(v => !v)}>
                    <i className="wa-dot" />لن يحضروا<small>{num(board.declined.length)}</small>
                    <ChevronDown style={showDeclined ? { transform: 'rotate(180deg)' } : undefined} />
                  </button>
                  {showDeclined && board.declined.map(r => rowEl(r, true))}
                </div>
              </section>
              {aside}
            </div>
          ) : desk ? (
            <div className="res-main2">{groupedList}{aside}</div>
          ) : groupedList}
        </>
      )}

      {/* ══ «تراجع» بدل نافذة تأكيد ══ */}
      <AnimatePresence>
        {toast && (
          <div className="res-float" style={{ transform: vp.shiftBottom ? `translateY(${vp.shiftBottom}px)` : undefined }}>
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
              className="wa-toast ok" role="status"
            >
              <Check />
              <span>{toast.text}</span>
              <button type="button" className="undo" onClick={() => { R.setAttendance(toast.id, toast.prev); setToast(null); }}>
                تراجع
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══ الشريطُ السفليّ — قوسُ الإبهام ══ */}
      {/* 📱 يتبع الجزءَ الظاهر من الشاشة (useVisibleViewport): كان يطفو في منتصفها بعد لوحة
          المفاتيح والقائمةُ تُرسم تحته (2026-10-08) — ويختفي ما دامت اللوحة مفتوحة */}
      {!desk && !R.loading && R.activityId && !vp.keyboard && (
        <div className="res-bar" style={{ transform: vp.shiftBottom ? `translateY(${vp.shiftBottom}px)` : undefined }}>
          <div>
            {canFollow ? (
              <>
                <button type="button" className="wa-btn" onClick={() => setShowAdd(true)}><Plus />حجز</button>
                {followBtn('main')}
              </>
            ) : (
              <button type="button" className="wa-btn primary main" onClick={() => setShowAdd(true)}><Plus />حجز سريع</button>
            )}
            <button type="button" className="wa-btn" aria-label="المزيد" style={{ width: 50, padding: 0 }} onClick={() => setShowMore(true)}>
              <Ellipsis />
            </button>
          </div>
        </div>
      )}

      {/* ══ الأوراق ══ */}
      <PersonSheet {...personProps} row={desk ? null : sel} open={!desk && !!sel}
        focusEta={!!sel && focusEta === sel.id} onClose={() => { setSelId(null); setFocusEta(null); }} />

      {/* ══ تأكيدُ الإرسال — يظهر عند العودة من واتساب ══ */}
      <WaConfirmBar
        row={waJust}
        remaining={waQueue.length}
        shiftBottom={vp.shiftBottom}
        onUndo={() => { if (waJust) R.markWaSent(waJust.id, false); setWaJust(null); }}
        onNext={() => { const n = waQueue[0]; if (n) sendWa(n); else setWaJust(null); }}
        onClose={() => setWaJust(null)}
      />

      <QuickAddSheet
        open={showAdd} onClose={() => setShowAdd(false)}
        activityId={R.activityId} activities={R.activityOptions}
        onCreate={R.createRow} findDuplicate={findDuplicate}
      />

      {dsend && (
        <DirectSendDialog
          origin="reservations" items={dsend.items} title={dsend.title} label={dsend.label}
          onClose={() => { setDsend(null); R.fetchAll(); }}
        />
      )}

      {followOpen && single && (
        <FollowupPop activityId={actId} onClose={() => setFollowOpen(false)}
          onSent={() => { R.fetchAll(); loadEvents(); }}
          onUnavailable={() => setFollowAvail(false)} />
      )}

      {botOpen && (
        <BotSettingsPop onClose={() => setBotOpen(false)} onUnavailable={() => setBotAvail(false)} />
      )}

      {feedOpen && (
        <Pop title={<><Bot style={{ color: 'var(--info)' }} />الدون يتابع</>} onClose={() => setFeedOpen(false)} label="الدون يتابع">
          <DonFeed events={events} rows={R.reservations} busyId={undoBusy} onUndo={undoEvent} onPick={pickForEta} />
        </Pop>
      )}

      <Sheet open={showMore} onClose={() => setShowMore(false)} label="المزيد">
        <SheetHead title="المزيد" sub={single ? R.activityName(Number(R.activityId)) : 'كلّ الفعاليّات'} />
        {direct && sendScope.some(needsWa) && (
          <button type="button" className="res-callout ok"
            onClick={() => {
              setShowMore(false);
              const list = sendScope.filter(needsWa);
              setDsend({ items: list.map(asItem), title: `رسالة الحجز لكلّ من لم تصله (${list.length})`, label: single ? R.activityName(Number(R.activityId)) : 'كلّ الفعاليّات' });
            }}>
            <Send />
            <span className="t">
              <b>أرسل لكلّ من لم تصله (<span className="ltr">{num(sendScope.filter(needsWa).length)}</span>)</b>
              <span>من رقم الأعمال مباشرة، بالقالب الحاليّ — معاينةٌ قبل الإرسال</span>
            </span>
          </button>
        )}
        {R.pendingRows.length > 0 && (
          <button type="button" className="res-callout" disabled={busy === 'bulk'}
            onClick={() => { setShowMore(false); confirmAllPending(); }}>
            <CircleCheck />
            <span className="t">
              <b>ثبّت المعلَّق (<span className="ltr">{num(R.pendingRows.length)}</span>)</b>
              <span>غيرُ المثبَّت لا يظهر للّاعب ولا في الفعاليّة</span>
            </span>
          </button>
        )}
        <div className="res-acts">
          {showFeed && !desk && (
            <ActionRow icon={<Bot />} title="الدون يتابع — السجلّ" sub="كلّ ما سجّله الدون والموظّفون الليلة، ومعه تراجع"
              onClick={() => { setShowMore(false); setFeedOpen(true); }} />
          )}
          {single && (
            <>
              <ActionRow icon={<Printer />} title="كشف الحاجزين" sub={busy === 'pdf' ? 'يُجهَّز…' : 'PDF للطباعة'}
                onClick={() => exportRoster('pdf')} disabled={!!busy} />
              <ActionRow icon={<Images />} title="الكشف المصوّر" sub="بطاقاتٌ بالصور والرتب"
                onClick={() => window.open(`/print/attendance/${R.activityId}`, '_blank')} />
              <ActionRow icon={<FileSpreadsheet />} title="تنزيل Excel" sub={busy === 'excel' ? 'يُجهَّز…' : 'جدولٌ كامل'}
                onClick={() => exportRoster('excel')} disabled={!!busy} />
            </>
          )}
          <ActionRow icon={<RefreshCw />} title="تحديث الحضور من الألعاب" sub="مَن لعب فعلاً يصير «حاضراً»"
            onClick={() => { setShowMore(false); markFromGames(); }} disabled={!!busy} />
          <ActionRow icon={<MessageSquareText />} title="قالب رسالة التأكيد" sub="النصّ الذي يرسله زرّ الواتساب"
            onClick={() => { setShowMore(false); setShowTpl(true); }} />
          {isAdmin && botAvail && (
            <ActionRow icon={<Bot />} title="الدون في المتابعة" sub="ما يُسمح للدون أن يغيّره، والمتابعة الآليّة ونصّها"
              onClick={() => { setShowMore(false); setBotOpen(true); }} />
          )}
        </div>
      </Sheet>

      <Sheet open={showTpl} onClose={() => setShowTpl(false)} label="قالب رسالة التأكيد">
        <SheetHead title="قالب رسالة التأكيد"
          sub={autoOn ? 'قالبٌ واحد للجميع — يخرج تلقائيّاً لكلّ حجزٍ يُثبَّت، ويرسله زرّ الواتساب يدويّاً' : 'قالبٌ واحد للجميع — يرسله زرّ الواتساب'} />
        {deviceTpl && (
          <div className="wa-banner info" style={{ flexDirection: 'column' }}>
            <b>على هذا الجهاز قالبٌ قديم يختلف عن المشترك</b>
            <span>
              {isAdmin ? 'القالب صار واحداً للجميع في الخادم. اجعل قالبك هو المشترك، أو تجاهله.' : 'القالب صار واحداً للجميع ويعدّله الأدمن — قالب هذا الجهاز لم يعد يُستعمل.'}
            </span>
            <div className="row">
              {isAdmin && (
                <button type="button" className="wa-btn sm" onClick={() => { saveTpl(deviceTpl); forgetDeviceTpl(); }}>
                  اجعله القالب المشترك
                </button>
              )}
              <button type="button" className="wa-btn sm ghost" onClick={forgetDeviceTpl}>{isAdmin ? 'تجاهله' : 'حسناً'}</button>
            </div>
          </div>
        )}
        {/* 🔴 لا يُدهس قالبٌ صاغه صاحبُه — لكنّه لا يُترك يجهل أنّ الافتراضيّ
            تطوّر. التنبيهُ يجعل الترقيةَ اختياراً معروضاً لا سرّاً. */}
        {isAdmin && tplCustomised && (
          <button type="button" className="res-callout" onClick={() => saveTpl(RES_TPL_DEFAULT)}>
            <Sparkles />
            <span className="t">
              <b>النصُّ الافتراضيّ تطوّر — اضغط لاعتماده</b>
              <span>قالبُك الحاليّ مكتوبٌ بيدك، فلا يُستبدَل إلّا بطلبك.</span>
            </span>
          </button>
        )}
        {isAdmin ? (
          <>
            <div className="res-tpl">
              <MessageTemplateEditor<ResVars>
                titleAr="رسالة تثبيت الحجز"
                value={tpl} onChange={saveTpl} onReset={() => saveTpl(RES_TPL_DEFAULT)}
                vars={RES_VARS}
                preview={fillTemplate(tpl, RES_VARS, previewRow.data)}
                previewOfAr={previewRow.labelAr}
              />
            </div>
            <p role="status" className={`res-fine${tplSave === 'error' ? ' err' : ''}`}>
              {tplSave === 'saving' ? 'يُحفظ…' : tplSave === 'saved' ? 'حُفظ — صار القالب المشترك لكلّ الطاقم' : tplSave === 'error' ? 'تعذّر الحفظ — تحقّق من الاتصال وعدّل حرفاً لإعادة المحاولة' : 'يُحفظ تلقائيّاً بعد التوقّف عن الكتابة'}
            </p>
          </>
        ) : (
          <>
            <p className="res-fine">القالب مشترك ويعدّله الأدمن. هكذا يصل اللاعب ({previewRow.labelAr}):</p>
            <div className="wa-wamock"><div className="b">{fillTemplate(tpl, RES_VARS, previewRow.data)}</div></div>
          </>
        )}
      </Sheet>
    </div>
  );
}
