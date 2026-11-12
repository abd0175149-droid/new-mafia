'use client';

// ══════════════════════════════════════════════════════
// 📱 شاشة اللاعب الجديدة داخل الغرفة — «الوجه» (2026-11-06)
//
// PlayerFlow يبقى «العقل» (السوكِت، الحالة، الاستطلاع، الإرسال) ويمرّر هنا
// عقداً واحداً `RoomHost`. القرارات المقفلة (المالك 2026-11-06):
//   • اللاعبون متجاورون: كلّ شاشةٍ متطابقة لكلّ الأدوار — النصّ والأزرار
//     وعددها والألوان والتوقيت. ما يخصّ الدور لا يُرسم إلّا تحت الضغط المطوّل.
//   • شريطٌ سفليّ واحد: زرّ المنتصف يصبح «اللعبة» ويفتح الأدوات (roomBus).
//   • الليل: قائمة الأرقام كلّها للجميع؛ لمسُ المافيا لشريكه لا يفعل شيئاً،
//     و«تخطٍّ» ظاهرٌ للجميع ويعمل للقنّاص وحده.
//   • الصباح: «رسالة الليل» للجميع معاً — الشريف يجد نتيجته داخلها.
//   • لا شيء عن الإسكات ولا عن خيار العمدة على الهاتف.
// ══════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import './room.css';
import SecretWatermark from '../SecretWatermark';
import HoldReveal from './HoldReveal';
import PeekCard from './PeekCard';
import { setRoomBus, clearRoomBus, setHubOpener } from './roomBus';
import { MAFIA_ROLES } from '@/lib/constants';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export interface NightStep { abilityId: string | null; ask: string; targets: { physicalId: number; name: string; avatarUrl?: string | null }[]; canSkip: boolean }
export interface SheriffResult { round: number; result: 'MAFIA' | 'CITIZEN'; targetPhysicalId: number; targetName: string }
interface Person { physicalId: number; name: string; avatarUrl?: string | null; isAlive?: boolean }

export interface RoomHost {
  roomCode: string; gameName: string;
  seat: number; displayName: string; gender: 'MALE' | 'FEMALE' | undefined; avatarUrl: string | null;
  rankTier?: string; cosmetics?: any;
  role: string | null; isDead: boolean; phase: string | null; round: number | null;
  teamCounts: { mafiaAlive: number; citizenAlive: number; neutralAlive?: number } | null;
  roster: Person[];
  watermark: string;
  // الليل
  oneNight: { steps: NightStep[]; deadline: number | null } | null;
  oneNightSent: boolean;
  submitOneNight: (picks: { abilityId: string | null; targetPhysicalId: number | null }[]) => Promise<boolean>;
  nightAsk: { actionType: string; availableTargets: { physicalId: number; name: string; avatarUrl?: string | null }[]; timeoutSeconds: number; canSkip: boolean; isDecoy?: boolean } | null;
  nightCountdown: number | null;
  nightSubmitted: boolean;
  submitNightAction: (target: number | null) => void;
  openTasksFromNight?: () => void;
  // التصويت
  candidates: any[]; playersInfo: any[]; myVote: number | null; playerVotes: Record<string, number>;
  votingCountdown: number | null; voteSubmitting: boolean;
  /** يعيد null عند القبول، أو سبب الرفض ليُعرض للاعب */
  castVote: (index: number) => Promise<string | null> | void;
  // الخاصّ
  mafiaTeam: { physicalId: number; name: string; role: string; avatarUrl?: string | null }[];
  sibling: any; assassinContracts: any; sheriffResults: SheriffResult[];
  // الأدوات
  cartCount: number;
  openRoles: () => void; openNotes: () => void; openOrder: () => void; closeOrder: () => void;
  onGalleryOpen: () => void;
  requestTasksOpen: () => Promise<{ ok: boolean; error?: string }>;
  leave: () => void;
  /** PlayerPhaseView للمراحل النهاريّة (النقاش، التبرير، التعادل، الإقصاء، النهاية) */
  phaseView: ReactNode;
}

// ── رسوم خطّيّة ذهبيّة (خطّ واحد ١.٥) ──
const LI = (d: ReactNode) => <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
const EI = {
  moon: LI(<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />),
  sun: LI(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></>),
  ballot: LI(<><path d="M4 13h16v8H4z" /><path d="M8 13V3h8v10M10 8l1.5 1.5L14.5 6" /></>),
  cards: LI(<><rect x="3" y="5" width="11" height="15" rx="2" /><path d="M9 3.5l9.5 2.2a2 2 0 0 1 1.5 2.4l-2.6 11" /></>),
  door: LI(<><path d="M5 21V4a1 1 0 0 1 1-1h9v18M15 5h3v16M3 21h18" /><path d="M12 12h.01" strokeWidth={2.5} /></>),
  shield: LI(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>),
  users: LI(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
  tasks: LI(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3v2h6V3M9 11l1.5 1.5L13.5 9.5M9 16h6" /></>),
  notes: LI(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>),
  plate: LI(<><circle cx="12" cy="13" r="7" /><circle cx="12" cy="13" r="3.5" /><path d="M3 4v6M5 4v6M3 7h2M20.5 4c-1.5 1-2 3-2 5h2V4z" /></>),
};

const PHASE_T: Record<string, string> = {
  LOBBY: 'بانتظار اللعبة', ROLE_GENERATION: 'تجهيز الأدوار', ROLE_BINDING: 'كشف الدور', NIGHT: 'الليل', MORNING_RECAP: 'الصباح',
  DAY_DISCUSSION: 'النقاش', DAY_VOTING: 'التصويت', DAY_JUSTIFICATION: 'التبرير', DAY_TIEBREAKER: 'تعادل',
  ELIMINATION_PENDING: 'قرار الموجّه', DAY_ELIMINATION: 'قرار الموجّه', GAME_OVER: 'انتهت اللعبة',
};
const TEAM_AR: Record<string, string> = { MAFIA: 'فريق المافيا', CITIZEN: 'فريق المواطنين', NEUTRAL: 'مستقلّ' };
const TEAM_C: Record<string, string> = { MAFIA: '#d9636a', CITIZEN: '#5db98c', NEUTRAL: '#d7a73f' };
const PHASE_NOTE_KEY: Record<string, string> = { NIGHT: 'night', MORNING_RECAP: 'discussion', DAY_DISCUSSION: 'discussion', DAY_VOTING: 'voting', DAY_TIEBREAKER: 'voting', DAY_JUSTIFICATION: 'justification' };
const PHASE_NOTE_AR: Record<string, string> = { night: '🌙 الليل', discussion: '💬 النقاش', voting: '🗳️ التصويت', justification: '⚖️ التبرير' };
const mmss = (s: number) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const isMafiaRole = (r: string | null) => !!r && (MAFIA_ROLES as unknown as string[]).includes(r);

// دليلُ الأدوار العامّ — نصوصُ «مهامّي» ووجوهُ الكروت
let _guide: any[] | null = null;
function useRolesGuide() {
  const [g, setG] = useState<any[]>(_guide || []);
  useEffect(() => {
    if (_guide) return;
    fetch(`${API_URL}/api/game-config/roles-guide`).then(r => r.json())
      .then(d => { if (Array.isArray(d?.data)) { _guide = d.data; setG(d.data); } }).catch(() => {});
  }, []);
  return g;
}
export function useFaceOf() {
  const g = useRolesGuide();
  return (roleId: string) => {
    const r = g.find((x: any) => x.id === roleId);
    const u = r?.face?.thumbUrl || r?.face?.url;
    return u ? `${API_URL}${u}` : null;
  };
}

function Avatar({ p, seat }: { p?: Person | null; seat: number }) {
  return (
    <span className="pr-av">
      {p?.avatarUrl ? <img src={p.avatarUrl} alt="" loading="lazy" decoding="async" /> : <span className="grid place-items-center w-full h-full text-[#C5A059] font-black">#{seat}</span>}
      <span className="id">{seat}</span>
    </span>
  );
}

/** عدّادٌ محلّيّ لموعدٍ مطلق (ms) — يُعاد رسمه كلّ ثانية */
function useLeft(endsAt: number | null) {
  const [, tick] = useState(0);
  useEffect(() => { if (!endsAt) return; const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t); }, [endsAt]);
  return endsAt ? Math.max(0, (endsAt - Date.now()) / 1000) : null;
}

// ══ الليل — شاشةٌ واحدة للجميع ══
function NightAsk({ host }: { host: RoomHost }) {
  const { oneNight, oneNightSent, nightAsk, nightSubmitted, nightCountdown, roster, seat, role } = host;
  const mode: 'one' | 'auto' | null = oneNight && oneNight.steps?.length ? 'one' : nightAsk ? 'auto' : null;
  const sent = mode === 'one' ? oneNightSent : nightSubmitted;
  const [stepI, setStepI] = useState(0);
  const [picks, setPicks] = useState<(number | null)[]>([]);
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // ليلةٌ جديدة ⇒ بدايةٌ نظيفة
  const key = mode === 'one' ? `one:${oneNight?.deadline}` : `auto:${nightAsk?.actionType}:${nightAsk?.timeoutSeconds}`;
  useEffect(() => { setStepI(0); setPicks([]); setPick(null); setBusy(false); }, [key]);

  const deadline = mode === 'one' ? oneNight?.deadline ?? null : null;
  const left = useLeft(deadline);
  const secs = mode === 'one' ? left : nightCountdown;

  if (!mode) return null;
  const step = mode === 'one' ? oneNight!.steps[Math.min(stepI, oneNight!.steps.length - 1)] : null;
  // ما يُفعَّل: قائمةُ الخادم لقدرتك وحدها — وهي التي تقرّر هل نفسُك هدفٌ مسموح
  // (الطبيب والممرّضة والمُسكِت: نعم؛ الشريف والقنّاص والقاتل ومَن لا قدرةَ له: لا).
  const allowed = new Set<number>((mode === 'one' ? step!.targets : nightAsk!.availableTargets).map(t => t.physicalId));
  // 🔴 خطوةُ التمويه في الطابور الآليّ تحمل كلَّ الأحياء ونفسَك معهم، ولا قدرةَ وراءها:
  //    فنفسُك فيها لا تُفعَّل، كي لا يعني لمسُ النفس شيئاً إلّا حيث تسمح به قدرةٌ حقيقيّة.
  if (mode === 'auto' && nightAsk!.isDecoy) allowed.delete(seat);
  // 🔴 القائمة نفسها للجميع: كلّ الأحياء **وأنت بينهم** — لا ما يسمح به دورك وحده.
  //    الهدف غير المسموح (شريك المافيا، أو نفسُك حين لا تسمح قدرتك) يُلمس فلا يحدث شيء،
  //    والشكل لا يتغيّر. كانت النفسُ محذوفةً من رسم الجميع، فلم يجد الطبيبُ اسمَه ليحمي
  //    نفسَه مع أنّ الخادم يسمح به (قرار المالك 2026-08-28) — قرار المالك 2026-11-12.
  const listed: Person[] = ((roster.length ? roster : (mode === "one" ? step!.targets : nightAsk!.availableTargets)) as Person[])
    .filter(p => p.isAlive !== false);
  if (seat && !listed.some(p => p.physicalId === seat)) {
    listed.push({ physicalId: seat, name: host.displayName, avatarUrl: host.avatarUrl });
  }
  listed.sort((a, b) => a.physicalId - b.physicalId);
  const canSkip = role === 'SNIPER' && (mode === 'one' ? !!step!.canSkip : !!nightAsk!.canSkip && !nightAsk!.isDecoy);

  const confirm = async (target: number | null) => {
    if (busy) return;
    if (mode === 'auto') { host.submitNightAction(target); return; }
    const all = [...picks]; all[stepI] = target;
    const steps = oneNight!.steps;
    if (stepI < steps.length - 1) { setPicks(all); setStepI(stepI + 1); setPick(null); return; }
    setBusy(true);
    const ok = await host.submitOneNight(steps.map((s, i) => ({ abilityId: s.abilityId, targetPhysicalId: all[i] ?? null })));
    if (!ok) setBusy(false);
  };

  return (
    <>
      <div className="pr-night" role="dialog" aria-modal="true" aria-label="اختيارك الليلة">
        <div className="hd"><span aria-hidden>🌙</span><b>الليل{host.round ? ` · الجولة ${host.round}` : ''}</b>
          {secs !== null && secs !== undefined && <span className={`tm ${secs <= 10 ? 'hot' : ''}`}>{mmss(secs)}</span>}</div>
        {sent ? (
          <div className="done"><span style={{ fontSize: 56 }} aria-hidden>🌙</span><b>وصل اختيارُك</b><small>انتظرِ الصباح — لا شيءَ عليك الآن.</small></div>
        ) : (
          <>
            <div className="q"><b>اختيارُك الليلة</b><small>اختر لاعباً ثمّ أكّد. ما يعنيه اختيارك يعرفه دورك وحدك — راجعه في «📋 مهامّي».</small></div>
            <div className="pr-tgts">
              {listed.map(p => (
                <button key={p.physicalId} type="button" className={`pr-tg ${pick === p.physicalId ? 'sel' : ''}`}
                  onClick={() => { if (allowed.has(p.physicalId)) setPick(p.physicalId); }}>
                  <Avatar p={p} seat={p.physicalId} /><span className="n">{p.name}{p.physicalId === seat && <em className="me"> · أنت</em>}</span><span className="i">#{p.physicalId}</span><span className="ck">{pick === p.physicalId ? '✓' : ''}</span>
                </button>
              ))}
            </div>
            <div className="ft">
              <button type="button" className="gbtn" disabled={pick === null || busy} onClick={() => confirm(pick)}>{pick === null ? 'اختر لاعباً' : 'تأكيدُ الاختيار'}</button>
              {/* 🔴 ظاهرٌ للجميع، ويعمل للقنّاص وحده (قرار المالك) — إظهارُه له وحده يكشفه لجاره */}
              <button type="button" className="skip" onClick={() => { if (canSkip) confirm(null); }}>تخطٍّ — لا أحد</button>
              <small>اختيارٌ واحدٌ في الليلة — ثمّ انتظرِ الصباح.</small>
            </div>
          </>
        )}
      </div>
      <div className="pr-ref"><button type="button" className="r1" onClick={host.openRoles}>🃏 الأدوار</button><button type="button" className="r2" onClick={() => host.openTasksFromNight?.()}>📋 مهامّي</button></div>
    </>
  );
}

// ══ التصويت — شبكةٌ من عمودين، اللمسة تصوّت والتغيير حتّى الإغلاق ══
function VoteGrid({ host }: { host: RoomHost }) {
  const { candidates, playersInfo, playerVotes, votingCountdown, isDead, seat, voteSubmitting } = host;
  // 🔴 الصوت المعتمد هو ما يحمله الخادم (playerVotes) — المحلّيّ يُفقد بعد إعادة الاتصال
  const srv = (playerVotes || {})[String(seat)];
  const myVote: number | null = srv !== undefined && srv !== null ? Number(srv) : host.myVote;
  const [err, setErr] = useState<string | null>(null);
  const [sendingI, setSendingI] = useState<number | null>(null);
  useEffect(() => { setErr(null); }, [candidates.length]);
  // 🔴 العدّاد للعرض فقط: الخادم يقبل الأصوات حتّى يحسم الليدر أو يُنهي الوقت
  const timeUp = votingCountdown !== null && votingCountdown <= 0;
  const top = Math.max(1, ...candidates.map((c: any) => c.votes || 0));
  const info = (pid: number) => playersInfo.find((p: any) => p.physicalId === pid) || host.roster.find(p => p.physicalId === pid);
  const status = isDead ? 'مشاهدة فقط — أنت مُقصى'
    : sendingI !== null ? 'يُرسَل صوتك…'
    : timeUp ? (myVote !== null ? 'انتهى الوقت — صوتك محسوب' : 'انتهى الوقت — صوّت الآن قبل أن يحسم الليدر')
    : myVote !== null ? 'صوتك مُرسَل · تغيّره حتّى يُغلق التصويت' : 'المس من تشكّ فيه — والتغيير مسموح حتّى الإغلاق';
  const vote = async (i: number) => {
    if (isDead || sendingI !== null || myVote === i) return;
    setErr(null); setSendingI(i);
    try { const r = await host.castVote(i); if (r) setErr(r); } finally { setSendingI(null); }
  };
  return (
    <>
      <section className="pr-hero">{EI.ballot}<h2>من تُقصي؟</h2><p>{status}</p>
        {votingCountdown !== null && !timeUp && <span className={`pr-cnt ${votingCountdown <= 10 ? 'hot' : ''}`}>{mmss(votingCountdown)}</span>}
        {err && <p className="pr-err" role="alert">⚠️ {err}</p>}</section>
      <div className="pr-vg">
        {candidates.map((c: any, i: number) => {
          const pid = c.targetPhysicalId; const p = info(pid);
          const voters = Object.entries(playerVotes || {}).filter(([, idx]) => idx === i).map(([v]) => v);
          const self = pid === seat;
          return (
            <button key={c.id ?? i} type="button" className={`pr-vc ${myVote === i ? 'mine' : ''} ${sendingI === i ? 'sending' : ''}`} disabled={isDead || self}
              aria-busy={sendingI === i || undefined}
              onClick={() => { if (self) { setErr('لا يمكنك التصويت لنفسك'); return; } if (!voteSubmitting) vote(i); }}>
              <Avatar p={p as any} seat={pid} />
              <b>{(p as any)?.name || `لاعب #${pid}`}</b>
              {c.type === 'DEAL' && <span className="text-[11.5px] text-[#d9c79a]">🤝 ديل من #{c.initiatorPhysicalId}</span>}
              <span className="pr-vb"><i style={{ width: `${((c.votes || 0) / top) * 100}%` }} /></span>
              <span className="pr-vn">{c.votes || 0} صوت</span>
              {voters.length > 0 && <span className="pr-voters">{voters.map(v => <span key={v}>{v}</span>)}</span>}
              {self && <span className="pr-me">أنت</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

// ══ اللوحات ══
// ══════════ 🔴 الفريق السرّيّ — زرٌّ واحد يُضغط باستمرار (قرار المالك 2026-11-09) ══════════
// الإبهام على زرٍّ أسفل الشاشة، والفريق كلّه فوقه في شبكةٍ تتّسع بلا تمرير. الخانات بعدد المافيا الأحياء
// المعلَن — العددُ نفسه على كلّ هاتف؛ ومن ليس مافيا يرى «ملفٌّ مغلق». الهويّات تُرسم ما دام الإصبع على
// الزرّ فقط، وتُمحى عند الرفع أو الانزلاق خارجه أو مغادرة التطبيق. كلُّ ضغطةٍ تُنبّه الليدر كما كان الفتح.
const teamCols = (n: number) => (n <= 3 ? 1 : n <= 6 ? 2 : 3);
function TeamHold({ n, members, guide, watermark, onPress, onClose, dead }: {
  n: number;
  members: { physicalId: number; name: string; role: string; avatarUrl?: string | null; me?: boolean }[];
  guide: any[]; watermark: string; onPress: () => void; onClose: () => void; dead: boolean;
}) {
  const [held, setHeld] = useState(false);
  const lastPing = useRef(0);
  useEffect(() => {
    const off = () => setHeld(false);
    const vis = () => { if (document.visibilityState !== 'visible') off(); };
    addEventListener('pointerup', off); addEventListener('pointercancel', off); addEventListener('blur', off);
    document.addEventListener('visibilitychange', vis);
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k);
    return () => {
      removeEventListener('pointerup', off); removeEventListener('pointercancel', off); removeEventListener('blur', off);
      document.removeEventListener('visibilitychange', vis); removeEventListener('keydown', k);
    };
  }, [onClose]);
  const press = (e: React.PointerEvent) => {
    e.preventDefault();
    // اللمس يأسر المؤشّر على الزرّ ضمناً — نحرّره كي يُخفى الفريق إن انزلق الإصبع خارجه
    try { (e.currentTarget as Element).releasePointerCapture?.(e.pointerId); } catch { /* */ }
    setHeld(true);
    // تنبيهُ الليدر مع كلّ كشف — بلا إغراقٍ إن تكرّر الضغط في الثانيتين نفسها
    if (Date.now() - lastPing.current > 2000) { lastPing.current = Date.now(); onPress(); }
  };
  const c = teamCols(n), rows = Math.ceil(n / c);
  return (
    <div className="pr-team" role="dialog" aria-modal="true" aria-label="الفريق السرّيّ" dir="rtl" onContextMenu={(e) => e.preventDefault()}>
      <div className="pr-team-hd">
        <h4>🔴 الفريق السرّيّ</h4>
        <button type="button" onClick={onClose} aria-label="إغلاق">✕</button>
      </div>
      {dead ? (
        <p className="pr-team-note">لا يُفتح الفريق بعد الإقصاء.</p>
      ) : (
        <>
          <p className="pr-team-note">في اللعبة {n} من المافيا الأحياء</p>
          <div className="pr-team-grid" style={{ gridTemplateColumns: `repeat(${c}, minmax(0,1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0,1fr))` }}>
            {Array.from({ length: n }, (_, i) => {
              if (!held) return <div key={i} className="pr-tc idle" aria-hidden>●</div>;
              const m = members[i];
              if (!m) return <div key={i} className="pr-tc shut"><span className="nm">ملفٌّ مغلق</span></div>;
              const rn = guide.find((x: any) => x.id === m.role)?.nameAr;
              return (
                <div key={i} className={`pr-tc${m.me ? ' me' : ''}`}>
                  {m.avatarUrl ? <img src={m.avatarUrl} alt="" /> : <span className="ph">#{m.physicalId}</span>}
                  <span className="st">{m.physicalId}</span>
                  <span className="nm">{m.me ? 'أنت' : m.name}</span>
                  {rn && <span className="rl">{rn}</span>}
                </div>
              );
            })}
            {held && <SecretWatermark label={watermark} opacity={0.08} />}
          </div>
          <button type="button" className={`pr-team-btn${held ? ' on' : ''}`}
            onPointerDown={press} onPointerLeave={() => setHeld(false)}
            onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !held) { e.preventDefault(); setHeld(true); onPress(); } }}
            onKeyUp={() => setHeld(false)}>
            اضغط مع الاستمرار لكشف الفريق<small>ارفع إصبعك فيُخفى · يراه الجميع بالشكل نفسه</small>
          </button>
        </>
      )}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  return (
    <>
      <div className="pr-scrim" onClick={onClose} />
      <section className="pr-sheet" role="dialog" aria-modal="true" aria-label={title} dir="rtl">
        <div className="hd"><h4>{title}</h4><button type="button" onClick={onClose} aria-label="إغلاق">✕</button></div>
        <div className="bd">{children}</div>
      </section>
    </>
  );
}

function TasksBody({ host, guide }: { host: RoomHost; guide: any[] }) {
  const r = guide.find((x: any) => x.id === host.role);
  if (!r) return <p className="text-center text-[#8d8271] text-[13px]">لم تُوزَّع الأدوار بعد.</p>;
  const k = PHASE_NOTE_KEY[host.phase || ''] || 'night';
  const c = TEAM_C[r.team] || '#c5a059';
  const ac = host.assassinContracts;
  return (
    <>
      <span className="pr-pk">دورك</span>
      <div style={{ fontFamily: 'Amiri, serif', fontSize: 26, fontWeight: 700, color: c }}>{r.nameAr}</div>
      <span className="inline-block text-[11px] font-bold rounded-md px-2 py-0.5" style={{ color: c, border: `1px solid ${c}55`, background: `${c}18` }}>{TEAM_AR[r.team]}</span>
      {r.oneLiner && <p style={{ marginTop: 8 }}>{r.oneLiner}</p>}
      <div className="pr-blk"><h5>{PHASE_NOTE_AR[k]} — الآن</h5><p>{r.phaseNotes?.[k] || (r.actsIn?.includes(k) ? 'لك دورٌ في هذه المرحلة.' : 'لا فعلَ مطلوبٌ منك — راقبْ وأنصت.')}</p></div>
      {k === 'night' && r.actsIn?.includes('night') && (
        <div className="pr-blk"><h5>التخطّي</h5><p>{r.id === 'SNIPER' ? '«تخطٍّ — لا أحد» تحفظ طلقتك لليلةٍ أخرى.' : 'لا تخطّي لدورك — اختر لاعباً قبل انتهاء الوقت.'}</p></div>
      )}
      {r.id === 'ASSASSIN' && ac?.contracts?.length > 0 && (
        <div className="pr-blk"><h5>عقود الاغتيال · {ac.completedCount}/{ac.totalRequired} مُنجزة</h5>
          <div className="pr-cbar"><i style={{ width: `${(ac.completedCount / Math.max(1, ac.totalRequired)) * 100}%` }} /></div>
          {ac.contracts.map((x: any, i: number) => (
            <div key={x.id ?? i} className={`pr-ct ${x.completed ? 'ok' : ''}`}><span>{x.completed ? '✓' : i + 1}</span><p>{x.descriptionAr || x.description}</p></div>
          ))}
          <p style={{ fontSize: 12.5, color: '#9b9182', marginTop: 6 }}>إن مات هدفُ عقدٍ بغير يدك يُستبدل العقد بصمت.</p>
        </div>
      )}
      {r.id === 'SHERIFF' && host.sheriffResults.length > 0 && (
        <div className="pr-blk"><h5>نتائج تحقيقك</h5>
          {host.sheriffResults.map((s, i) => <p key={i}>الليلة {s.round}: #{s.targetPhysicalId} {s.targetName} — {s.result === 'MAFIA' ? 'مافيا 🔴' : 'ليس مافيا 🔵'}</p>)}
        </div>
      )}
      {host.sibling && (
        <div className="pr-blk"><h5>أخوك</h5><p>#{host.sibling.physicalId} {host.sibling.name}</p></div>
      )}
    </>
  );
}

export default function PlayerRoom({ host }: { host: RoomHost & { openTasksFromNight?: () => void } }) {
  const guide = useRolesGuide();
  const [sheet, setSheet] = useState<null | 'hub' | 'gal' | 'tasks' | 'leave'>(null);
  const [tasksBlocked, setTasksBlocked] = useState<string | null>(null);
  const phase = host.phase || 'LOBBY';
  const alive = !host.isDead;
  const inNightAsk = phase === 'NIGHT' && alive && (!!(host.oneNight && host.oneNight.steps?.length) || !!host.nightAsk);

  // 🚌 الشريط السفليّ: زرّ «اللعبة» + حلقة الوقت + شارة السلّة
  const endsRef = useRef<{ k: string; at: number; total: number } | null>(null);
  const timing = useMemo(() => {
    if (phase === 'DAY_VOTING' && host.votingCountdown !== null) return { k: 'vote', secs: host.votingCountdown };
    if (phase === 'NIGHT' && host.oneNight?.deadline) return { k: `one:${host.oneNight.deadline}`, at: host.oneNight.deadline };
    if (phase === 'NIGHT' && host.nightCountdown !== null && host.nightAsk) return { k: `auto:${host.nightAsk.actionType}`, secs: host.nightCountdown };
    return null;
  }, [phase, host.votingCountdown, host.oneNight, host.nightCountdown, host.nightAsk]);
  useEffect(() => {
    if (!timing) { endsRef.current = null; setRoomBus({ active: true, endsAt: null, totalSec: 0, cart: host.cartCount }); return; }
    const at = 'at' in timing && timing.at ? timing.at : Date.now() + ((timing as any).secs || 0) * 1000;
    if (!endsRef.current || endsRef.current.k !== timing.k) endsRef.current = { k: timing.k, at, total: Math.max(1, (at - Date.now()) / 1000) };
    // نُبقي الموعد الأوّل ما دام المفتاح نفسه — العدّاد المحلّيّ ينقص ثانيةً بثانية
    setRoomBus({ active: true, endsAt: Math.round(endsRef.current.at / 1000) * 1000, totalSec: Math.round(endsRef.current.total), cart: host.cartCount });
  }, [timing, host.cartCount]);
  useEffect(() => { setHubOpener(() => setSheet('hub')); return () => { clearRoomBus(); }; }, []);

  // 🍽️ المنيو يتنحّى حين يصل سؤالٌ يحتاج اللاعب — والسلّة محفوظة
  useEffect(() => { if (phase === 'DAY_VOTING' || inNightAsk) host.closeOrder(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [phase, inNightAsk]);
  // تبدّل المرحلة يغلق لوحاتنا الخاصّة (الضغط المطوّل يُمحى أصلاً)
  useEffect(() => { setSheet(s => (s === 'tasks' || s === 'gal' ? null : s)); }, [phase]);

  const openTasks = async () => {
    setSheet('tasks'); setTasksBlocked(null);
    try { const r = await host.requestTasksOpen(); if (!r.ok) setTasksBlocked(r.error || 'تعذّر الفتح'); } catch { /* الشبكة لا تقفل */ }
  };
  const openGallery = () => { setSheet('gal'); };
  const hostX = { ...host, openTasksFromNight: openTasks };

  const timerSecs = timing ? ('at' in timing && timing.at ? Math.max(0, (timing.at - Date.now()) / 1000) : (timing as any).secs) : null;
  const meta = [host.round && phase !== 'LOBBY' ? `الجولة ${host.round}` : null, host.gameName || null, host.roomCode ? `غرفة ${host.roomCode}` : null].filter(Boolean).join(' · ');
  const tc = host.teamCounts;

  // ── جسم المرحلة ──
  let body: ReactNode;
  if (phase === 'LOBBY' || phase === 'ROLE_GENERATION' || phase === 'ROLE_BINDING' || !host.phase) {
    const has = !!host.role;
    body = (
      <section className="pr-hero">
        {has ? EI.cards : EI.shield}
        <h2>{has ? 'تم تعيين مهمّتك' : phase === 'ROLE_GENERATION' ? 'جاري تجهيز الأدوار' : 'اكتمل التشفير'}</h2>
        <p>{has ? 'غطِّ الشاشة بكفّك واضغط البطاقة مطوّلاً فتنقلب — والمسها مرّةً لتعيدها.' : 'ضع هاتفك أمامك وتابع شاشة القاعة — يوزّع الليدر الأدوار بعد قليل.'}</p>
        <div className="mt-4">
          <PeekCard seat={host.seat} name={host.displayName} role={host.role} gender={host.gender} avatarUrl={host.avatarUrl}
            watermark={host.watermark} rankTier={host.rankTier} cosmetics={host.cosmetics} peekable={has} />
        </div>
      </section>
    );
  } else if (phase === 'NIGHT') {
    body = <section className="pr-hero">{EI.moon}<h2>الليل يسدل ستاره</h2><p>{alive ? 'أغمض عينيك عن غيرك — اختيارك يظهر على الشاشة.' : 'تابع بصمت — لا تكشف شيئاً لمن بقي.'}</p></section>;
  } else if (phase === 'MORNING_RECAP') {
    const last = host.sheriffResults[host.sheriffResults.length - 1];
    const mine = host.role === 'SHERIFF' && last && (!host.round || last.round >= host.round - 1) ? last : null;
    body = (
      <section className="pr-hero">{EI.sun}<h2>الصباح يطلّ</h2><p>تُكشف أحداث الليلة على شاشة القاعة — تابِعْ معها.</p>
        <div className="mt-4">
          <HoldReveal title="📨 رسالة الليل" hint="وصلت كلَّ الهواتف معاً — اضغط مطوّلاً وغطِّ بكفّك" watermark={host.watermark}>
            {() => mine ? (
              <>
                <span className="pr-pk">نتيجة تحقيقك</span>
                <p><b>#{mine.targetPhysicalId} {mine.targetName}</b></p>
                <p style={{ color: mine.result === 'MAFIA' ? '#f87171' : '#4ade80', fontSize: 20, fontWeight: 700 }}>{mine.result === 'MAFIA' ? 'مافيا 🔴' : 'ليس مافيا 🔵'}</p>
              </>
            ) : (<><span className="pr-pk">رسالة الليل</span><p>لا جديد لك هذا الصباح.</p></>)}
          </HoldReveal>
        </div>
      </section>
    );
  } else if (phase === 'DAY_VOTING') {
    body = <VoteGrid host={host} />;
  } else {
    body = host.phaseView;
  }

  return (
    <div className="pr-root" dir="rtl">
      <header className="pr-top">
        <div className="pr-seat"><small>مقعد</small><b>{host.seat}</b></div>
        <div className="pr-tt"><b>{PHASE_T[phase] || 'اللعبة'}</b><small>{meta}</small></div>
        {timerSecs !== null && timerSecs !== undefined && <span className={`pr-tm ${timerSecs <= 10 ? 'hot' : ''}`}>{mmss(timerSecs)}</span>}
      </header>
      <div className="pr-flow">
        {tc && phase !== 'LOBBY' && (
          <div className="pr-teams" aria-label="الأحياء">
            <span><i style={{ background: '#ef4444' }} /><b>{tc.mafiaAlive}</b> مافيا</span>
            <span><i style={{ background: '#60a5fa' }} /><b>{tc.citizenAlive}</b> مواطنون</span>
            {!!tc.neutralAlive && <span><i style={{ background: '#a78bfa' }} /><b>{tc.neutralAlive}</b> مستقلّ</span>}
          </div>
        )}
        {host.isDead && phase !== 'GAME_OVER' && <div className="pr-dead">أنت خارج اللعبة — تابع بصمت، ولا تكشف شيئاً لمن بقي.</div>}
        {body}
      </div>

      {inNightAsk && <NightAsk host={hostX} />}

      {sheet === 'hub' && (
        <Sheet title="أدوات اللعبة" onClose={() => setSheet(null)}>
          <div className="pr-hub">
            <button type="button" className="tm" onClick={openGallery}>{EI.users}<b>الفريق</b></button>
            <button type="button" onClick={openTasks}>{EI.tasks}<b>مهامّي</b></button>
            <button type="button" onClick={() => { setSheet(null); host.openNotes(); }}>{EI.notes}<b>المفكّرة</b></button>
            <button type="button" onClick={() => { setSheet(null); host.openOrder(); }}>{EI.plate}<b>المنيو</b>{host.cartCount > 0 && <i>{host.cartCount}</i>}</button>
            <button type="button" onClick={() => { setSheet(null); host.openRoles(); }}>{EI.cards}<b>الأدوار</b></button>
            <button type="button" className="x" onClick={() => setSheet('leave')}>{EI.door}<b>خروج</b></button>
          </div>
        </Sheet>
      )}

      {sheet === 'tasks' && (
        <Sheet title="📋 مهامّي" onClose={() => setSheet(null)}>
          {tasksBlocked || host.isDead ? (
            <div className="text-center py-8"><div className="text-4xl mb-3">☠️</div><p className="text-[14px] text-[#cdc3af]">{tasksBlocked || 'انتهت جولتُك — لا تُفتح المهامّ بعد الإقصاء.'}</p></div>
          ) : (
            <>
              <HoldReveal title="دورك ومهامّك" panelTitle="📋 مهامّي" watermark={host.watermark}>{() => <TasksBody host={host} guide={guide} />}</HoldReveal>
              <p className="pr-pk text-center">الشكل واحدٌ لكلّ الأدوار — تُفتح في أعلى الشاشة وتُغلق بـ«إخفاء»</p>
            </>
          )}
        </Sheet>
      )}

      {sheet === 'gal' && (
        <TeamHold
          n={Math.max(1, tc?.mafiaAlive ?? 0)}
          members={isMafiaRole(host.role)
            ? [{ physicalId: host.seat, name: host.displayName, role: host.role as string, avatarUrl: host.avatarUrl, me: true }, ...host.mafiaTeam.filter(m => m.physicalId !== host.seat)]
            : []}
          guide={guide} watermark={host.watermark} dead={host.isDead}
          onPress={host.onGalleryOpen} onClose={() => setSheet(null)} />
      )}

      {sheet === 'leave' && <LeaveSheet seat={host.seat} onClose={() => setSheet(null)} onLeave={host.leave} />}
    </div>
  );
}

function LeaveSheet({ seat, onClose, onLeave }: { seat: number; onClose: () => void; onLeave: () => void }) {
  const fill = useRef<HTMLSpanElement>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raf = useRef(0);
  const start = () => {
    const t0 = performance.now();
    const step = (now: number) => { const p = Math.min(1, (now - t0) / 900); if (fill.current) fill.current.style.transform = `scaleX(${p})`; if (p < 1) raf.current = requestAnimationFrame(step); };
    raf.current = requestAnimationFrame(step);
    t.current = setTimeout(() => { t.current = null; onLeave(); }, 900);
  };
  const stop = () => { if (t.current) { clearTimeout(t.current); t.current = null; } cancelAnimationFrame(raf.current); if (fill.current) fill.current.style.transform = 'scaleX(0)'; };
  return (
    <Sheet title="🚪 مغادرة الغرفة؟" onClose={onClose}>
      <p className="text-[15px] text-[#d8d0c2]" style={{ fontFamily: 'Amiri, serif' }}>يُفرَّغ مقعدك {seat} وتخرج من اللعبة الجارية. حسابك يبقى.</p>
      <button type="button" className="pr-hbtn" onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={e => e.preventDefault()}>
        <span className="fill" ref={fill} /><span>اضغط مطوّلاً: غادر</span>
      </button>
      <button type="button" className="pr-gbtn" onClick={onClose}>ابقَ في اللعبة</button>
    </Sheet>
  );
}
