'use client';

// ══════════════════════════════════════════════════════
// 🕴️ جولة «الليلة الأولى» — العقل (2026-11-15)
//
// يُركَّب في تخطيط اللاعب بعد البوّابات كلّها. يسأل الخادم عن حالة جولة هذا اللاعب
// (/api/player-guide/me)، يعرض دعوة الدون، ويقود خطوات الصفحات (النادي ← الحجز ← باب
// الغرفة). غرفة التدريب (/player/guide) لها خطواتها وتستعمل الطبقة نفسها.
//
// قرارات المالك:
//   • تُشغَّل وتُطفأ من الداشبورد («مفاتيح النظام») — مطفأةً لا يُرسم من هذا الملفّ شيء.
//   • تُدعى إليها الحسابات الجديدة ومن كان آخر نشاطه قبل ١/١١/٢٠٢٦ (الخادم يقرّر).
//   • الدخول بعد الحجز من زرّ «دخول ←» في بطاقة الفعاليّة، لا من الزرّ السفليّ.
// وما أرجّحه حتى يقرّر المالك غيره: «لاحقاً» تؤجّل ولا تلغي، والدعوة لا تظهر فوق لاعبٍ
// غرفتُه الحقيقيّة مفتوحة الآن.
// ══════════════════════════════════════════════════════

import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePlayer } from '@/context/PlayerContext';
import GuideLayer, { DonSheet } from './GuideLayer';
import { PAGE_STEPS, stepIndex } from './pageSteps';

const API = process.env.NEXT_PUBLIC_API_URL || '';
export const GUIDE_ROOM_PATH = '/player/guide';
const RUN_KEY = 'mafia_guide_run';
const BOOK_KEY = 'mafia_guide_booked';

export const arNum = (n: number | string) => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]);

type Status = 'new' | 'started' | 'deferred' | 'done';
export interface GuideMe { enabled: boolean; required: boolean; status: Status; step: string | null; returning: boolean }
interface Run { stage: 'pages' | 'room'; i: number; replay: boolean }

interface Ctx {
  me: GuideMe | null;
  /** null = الجولة ليست جارية الآن */
  run: Run | null;
  /** تُعرض فعاليّة التدريب في «الألعاب» */
  showTraining: boolean;
  trainingBooked: boolean;
  setTrainingBooked: (b: boolean) => void;
  /** دور المتدرّب على طاولة التدريب */
  role: string;
  setRole: (r: string) => void;
  begin: (o?: { from?: string; replay?: boolean }) => void;
  defer: () => void;
  enterRoom: () => void;
  /** أتمّ الغرفة — تُختم الجولة في الخادم */
  finish: () => void;
  /** بعد ورقة الختم: إلى قائمة الألعاب الحقيقيّة */
  leaveRoom: () => void;
}

const noop = () => {};
const GuideContext = createContext<Ctx>({
  me: null, run: null, showTraining: false, trainingBooked: false, setTrainingBooked: noop,
  role: 'SHERIFF', setRole: noop, begin: noop, defer: noop, enterRoom: noop, finish: noop, leaveRoom: noop,
});
export const useGuide = () => useContext(GuideContext);

/**
 * 🛟 الجولة إضافةٌ فوق التطبيق لا شرطٌ له: أيّ عطلٍ في رسمها يُخفيها وحدها ولا يمسّ الصفحة.
 * تُغلَّف بها طبقة الدون وكلّ مدخلٍ للجولة داخل صفحات اللاعب.
 */
export class GuideSafe extends Component<{ children: ReactNode }, { dead: boolean }> {
  state = { dead: false };
  static getDerivedStateFromError() { return { dead: true }; }
  componentDidCatch(e: unknown) { console.warn('🕴️ تعذّر رسم الجولة — أُخفيت:', e); }
  render() { return this.state.dead ? null : this.props.children; }
}

/** هل وسط الشاشة خالٍ من بوّابةٍ أو ورقةٍ ثابتة؟ الدعوة تنتظر حتى تنتهي بوّابات التطبيق كلّها. */
function screenIsClear(): boolean {
  try {
    for (let n: Element | null = document.elementFromPoint(innerWidth / 2, innerHeight / 2); n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.position === 'fixed' && (parseInt(cs.zIndex, 10) || 0) >= 100) return false;
    }
  } catch { /* لا يحجب */ }
  return true;
}

export function GuideProvider({ children }: { children: ReactNode }) {
  const { player } = usePlayer();
  const token = player?.token || '';
  const router = useRouter();
  const pathname = usePathname() || '';
  const [me, setMe] = useState<GuideMe | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [invite, setInvite] = useState(false);
  const [booked, setBookedState] = useState(false);
  const [role, setRole] = useState('SHERIFF');

  const pathRef = useRef(pathname); pathRef.current = pathname;
  const runRef = useRef(run); runRef.current = run;
  const meRef = useRef(me); meRef.current = me;
  const bookedRef = useRef(booked); bookedRef.current = booked;
  const tokenRef = useRef(token); tokenRef.current = token;
  const inviteAsked = useRef(false);
  const wasInRoom = useRef(false);

  const post = useCallback((body: Record<string, unknown>) => {
    const t = tokenRef.current; if (!t) return;
    fetch(`${API}/api/player-guide/me`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify(body) }).catch(() => {});
  }, []);

  // ── حالة الجولة من الخادم ──
  useEffect(() => {
    if (!token) { setMe(null); setRun(null); return; }
    let alive = true;
    fetch(`${API}/api/player-guide/me`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!alive || !d?.success) return;
        const m: GuideMe = { enabled: !!d.enabled, required: !!d.required, status: (d.status || 'new') as Status, step: d.step || null, returning: !!d.returning };
        setMe(m);
        if (!m.enabled) return;
        try { setBookedState(localStorage.getItem(BOOK_KEY) === '1'); } catch { /* تخزينٌ محجوب */ }
        // استئنافٌ بعد إعادة تحميل الصفحة وسط الجولة
        try {
          const saved = JSON.parse(sessionStorage.getItem(RUN_KEY) || 'null') as Run | null;
          if (saved && (saved.stage === 'pages' || pathRef.current === GUIDE_ROOM_PATH)) setRun({ stage: saved.stage, i: Math.min(saved.i || 0, PAGE_STEPS.length), replay: !!saved.replay });
        } catch { /* لا جلسة محفوظة */ }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    try { if (run) sessionStorage.setItem(RUN_KEY, JSON.stringify(run)); else sessionStorage.removeItem(RUN_KEY); } catch { /* */ }
  }, [run]);

  const setTrainingBooked = useCallback((b: boolean) => {
    setBookedState(b);
    try { if (b) localStorage.setItem(BOOK_KEY, '1'); else localStorage.removeItem(BOOK_KEY); } catch { /* */ }
  }, []);

  // ── الدعوة: مرّةً، على الرئيسيّة، بعد أن تخلو الشاشة من البوّابات ──
  useEffect(() => {
    if (!me?.enabled || !me.required || me.status !== 'new' || run || invite || inviteAsked.current) return;
    if (pathname !== '/player/home' && pathname !== '/player') return;
    let alive = true, tries = 0;
    const t = setInterval(() => {
      if (!alive) return;
      const p = pathRef.current;
      if (p !== '/player/home' && p !== '/player') return;
      if (++tries < 2 || !screenIsClear()) return;
      clearInterval(t);
      inviteAsked.current = true;
      // 🔴 لا دعوة فوق لاعبٍ غرفتُه الحقيقيّة مفتوحة الآن — الجولة لا تحجب لعبةً حقيقيّة
      fetch(`${API}/api/player-app/my-active-rooms`, { headers: { Authorization: `Bearer ${tokenRef.current}` } })
        .then(r => r.json())
        .then(d => { if (alive && !(Array.isArray(d?.rooms) && d.rooms.length > 0) && !runRef.current) setInvite(true); })
        .catch(() => { if (alive && !runRef.current) setInvite(true); });
    }, 700);
    return () => { alive = false; clearInterval(t); };
  }, [me, run, invite, pathname]);

  const begin = useCallback((o?: { from?: string; replay?: boolean }) => {
    const replay = !!o?.replay || meRef.current?.status === 'done';
    if (o?.replay) setTrainingBooked(false);
    const i = stepIndex(o?.from || 'card');
    setInvite(false);
    setRun({ stage: 'pages', i, replay });
    if (!replay) {
      post({ action: 'start', step: PAGE_STEPS[i].ch });
      setMe(m => (m && m.status !== 'done' ? { ...m, status: 'started' } : m));
    }
  }, [post, setTrainingBooked]);

  const defer = useCallback(() => {
    if (!runRef.current?.replay && meRef.current?.status !== 'done') {
      post({ action: 'defer' });
      setMe(m => (m && m.status !== 'done' ? { ...m, status: 'deferred' } : m));
    }
    setInvite(false); setRun(null); wasInRoom.current = false;
    if (pathRef.current === GUIDE_ROOM_PATH) router.push('/player/home');
  }, [post, router]);

  const enterRoom = useCallback(() => {
    const replay = runRef.current?.replay ?? (meRef.current?.status === 'done');
    setInvite(false);
    setRun({ stage: 'room', i: PAGE_STEPS.length, replay: !!replay });
    if (!replay) { post({ action: 'step', step: 'room' }); setMe(m => (m && m.status !== 'done' ? { ...m, status: 'started' } : m)); }
    if (pathRef.current !== GUIDE_ROOM_PATH) router.push(GUIDE_ROOM_PATH);
  }, [post, router]);

  const finish = useCallback(() => {
    post({ action: 'done' });
    setMe(m => (m ? { ...m, status: 'done', required: false } : m));
    setTrainingBooked(false);
  }, [post, setTrainingBooked]);

  const leaveRoom = useCallback(() => {
    setRun(null); wasInRoom.current = false;
    router.push('/player/games');
  }, [router]);

  // ── خروجٌ من غرفة التدريب وسط الجولة ⇒ توقّفٌ مؤقّت (تبقى لافتة «تابع» في الرئيسيّة) ──
  useEffect(() => {
    if (run?.stage !== 'room') { wasInRoom.current = false; return; }
    if (pathname === GUIDE_ROOM_PATH) { wasInRoom.current = true; return; }
    if (wasInRoom.current) { wasInRoom.current = false; setRun(null); }
  }, [pathname, run?.stage]);

  // ══ محرّك خطوات الصفحات ══
  const step = run?.stage === 'pages' ? PAGE_STEPS[run.i] ?? null : null;
  const stepRef = useRef(step); stepRef.current = step;

  const advance = useCallback(() => {
    setRun(r => {
      if (!r || r.stage !== 'pages') return r;
      return r.i + 1 >= PAGE_STEPS.length ? { ...r, stage: 'room', i: PAGE_STEPS.length } : { ...r, i: r.i + 1 };
    });
  }, []);
  const goto = useCallback((id: string) => { setRun(r => (r && r.stage === 'pages' ? { ...r, i: stepIndex(id) } : r)); }, []);

  // الخطوة تُعرض على صفحتها: إن لم يكن اللاعب فيها يُنقل إليها
  useEffect(() => {
    if (!step?.path) return;
    const p = pathRef.current;
    if (p !== step.path && !(p === '/player' && step.path === '/player/home')) router.push(step.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id]);

  // حفظ الفصل في الخادم عند تبدّله — نقطة الاستئناف بعد إغلاق التطبيق
  const lastCh = useRef<string | null>(null);
  useEffect(() => {
    if (!step || run?.replay) return;
    if (lastCh.current !== step.ch) { lastCh.current = step.ch; post({ action: 'step', step: step.ch }); }
  }, [step, run?.replay, post]);

  // متى تنتهي خطوة الفعل؟
  useEffect(() => {
    if (!step) return;
    let missing = 0;
    const t = setInterval(() => {
      const s = stepRef.current; if (!s) return;
      if (s.skipIfBooked && bookedRef.current) return advance();
      const u = s.until;
      if (u?.path && pathRef.current === u.path) return advance();
      if (u?.exists && document.querySelector(u.exists)) return advance();
      if (s.back && s.target) {
        if (document.querySelector(s.target)) missing = 0;
        else if ((missing += 150) > 900) goto(s.back);
      }
    }, 150);
    return () => clearInterval(t);
  }, [step?.id, advance, goto]);

  const onStepPage = !!step && (!step.path || pathname === step.path || (pathname === '/player' && step.path === '/player/home'));

  const value = useMemo<Ctx>(() => ({
    me, run,
    showTraining: !!me?.enabled && (run !== null || (me.required && me.status !== 'done')),
    trainingBooked: booked, setTrainingBooked,
    role, setRole, begin, defer, enterRoom, finish, leaveRoom,
  }), [me, run, booked, setTrainingBooked, role, begin, defer, enterRoom, finish, leaveRoom]);

  const first = (player?.name || '').trim().split(/\s+/)[0] || '';

  return (
    <GuideContext.Provider value={value}>
      {children}

      <GuideSafe>
      {me?.enabled && step && onStepPage && (
        <GuideLayer
          step={{ target: step.target, text: step.text, wait: step.wait, pos: step.pos }}
          count={`${arNum(run!.i + 1)}/${arNum(PAGE_STEPS.length)}`}
          onNext={advance} onPrev={null} onLater={defer} onSkip={advance}
        />
      )}

      {me?.enabled && invite && !run && (
        <DonSheet title={me.returning ? `رجعتَ${first ? ` يا ${first}` : ''}، والنادي تغيّر` : `أهلاً بك في العائلة${first ? ` يا ${first}` : ''}`}>
          <p>{me.returning
            ? 'شاشة الغرفة صارت جديدة منذ آخر زيارة. جرّبها معي على طاولةٍ تجريبيّة قبل أن تجلس بين الناس.'
            : 'قبل ليلتك الحقيقيّة، العب معي ليلةً تجريبيّة: طاولةٌ جاهزة، ولا أحد يراك تخطئ.'}</p>
          <ul>
            {(me.returning
              ? ['بطاقة الدور تُكشف بالضغط المطوّل', 'زرّ «اللعبة» يجمع أدواتك كلّها', 'ليلٌ بشاشةٍ واحدة للجميع، و«رسالة الليل» صباحاً']
              : ['تتعرّف على أبواب التطبيق', 'تحجز وتدخل غرفةً من الباب إلى المقعد', 'تلعب ليلةً ونهاراً كاملَين بدورٍ حقيقيّ']
            ).map(x => <li key={x}>{x}</li>)}
          </ul>
          <button type="button" className="go" onClick={() => begin()}>ابدأ الجولة · ثماني دقائق</button>
          <button type="button" className="lt" onClick={defer}>لاحقاً</button>
        </DonSheet>
      )}
      </GuideSafe>
    </GuideContext.Provider>
  );
}
