'use client';

// ══════════════════════════════════════════════════════════════════════════
// 🕵️ المراقبة — طبقة مكافحة الغش الموحّدة في لوحة الليدر
//
// العقد مع الخادم (leader:cheat-signal، يُبثّ لسوكِتات الليدر وحدها):
//   { roomId, physicalId, kind, weight, labelAr, name, role, team, teamAr,
//     avatarUrl, details, at }
//   • kind = 'app_left'        → خرج **الآن** ولم يعد بعد (بلا مدّة).
//   • kind = 'app_departure'   → غيابٌ **مكتمل** بمدّته (details.durationMs).
//   • kind = 'screenshot' | 'screen_recording'.
//   • details تحمل دائماً: phase, round, alive, aliveCount — ومع المغادرات:
//     durationMs, secretOpen, platform, source, departedAt (للمرصود خادمياً).
//
// 🔴 لماذا «حلقات» لا عدّاد واحد: العدّ المجرّد يقول «غاب ٥ مرّات» ولا يقول
//    **متى**. والتواطؤ لا يُرى في العدّ بل في **التزامن**: لاعبان يخرجان في
//    اللحظة نفسها ويعودان معاً. فنحفظ لكل غيابٍ بدايةً ونهاية (فترة زمنيّة)،
//    ثم نمرّ عليها بخطّ كنسٍ (sweep line) فنستخرج نوافذ التزامن.
//
// 🔴 إعادة بناء الفترة: لا يوجد حقلٌ لبداية الغياب في صفوف العميل، فتُشتقّ:
//    start = details.departedAt ?? (at - durationMs)  ،  end = at.
//    أمّا app_left بلا إغلاق ⇒ اللاعب **خارجٌ الآن** منذ at.
//
// 🔴 لماذا مخزنٌ على مستوى الوحدة (moduleStores): شاشتا الليدر (صفحة الغرفة
//    وشاشة اللعب) تتبادلان الظهور بـinSession، فيُفكَّك المزوّد ويُركَّب من
//    جديد في المباراة نفسها. لو عاش السجلّ في حالة المزوّد وحدها لضاع النمط
//    كلَّما تنقّل الليدر بين الشاشتين — وهو ما يفعله عشرات المرّات في الجلسة.
// ══════════════════════════════════════════════════════════════════════════

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { swalToast } from '@/lib/swal';
import { playLocalSound } from '@/lib/soundManager';

/**
 * طبقة ثابتة معلّقة على body — ضرورية لأن رؤوس لوحة الليدر تستعمل backdrop-blur،
 * وأيّ مرشِّح يُنشئ «كتلة احتواء» تجعل position:fixed يُقاس من الرأس لا من الشاشة.
 */
function FixedLayer({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(<>{children}</>, document.body);
}

// ══════════════════════════════════════════════════════════════════════════
// الأنواع
// ══════════════════════════════════════════════════════════════════════════

export type CheatKind = 'app_left' | 'app_departure' | 'screenshot' | 'screen_recording';
export type CheatTeam = 'MAFIA' | 'NEUTRAL' | 'CITIZEN';

/** فترة غيابٍ واحدة. end=null ⇒ اللاعب لم يعد بعد (خارجٌ الآن). */
export interface AbsenceEpisode {
  start: number;
  end: number | null;
  durMs: number | null;
  secretOpen: boolean;
  phase: string;
  source: string;
}

export interface AntiCheatPlayer {
  physicalId: number;
  name: string;
  team: CheatTeam;
  teamAr: string;
  role: string;
  avatarUrl: string | null;
  episodes: AbsenceEpisode[];
  screenshots: number;
  recordings: number;
  maxWeight: number;
  lastAt: number;
  lastLabelAr: string;
  currentlyOut: boolean;
}

/** اللاعب + المشتقّات المحسوبة للعرض والترتيب. */
export interface AntiCheatPlayerStats extends AntiCheatPlayer {
  departures: number;
  /** متوسّط الغيابات **المعروفة المدّة** وحدها — إدخال المجهولة كصفرٍ يُهبط المتوسّط زوراً */
  avgMs: number | null;
  longestMs: number | null;
  totalAwayMs: number;
  lastDepartureAt: number | null;
  /** بداية الغياب المفتوح إن كان اللاعب خارجاً الآن */
  openSince: number | null;
  suspicion: number;
}

export interface CoAbsenceWindow {
  from: number;
  to: number;
  members: number[];
  anySecretOpen: boolean;
  isBreak: boolean;
}

export interface CoAbsenceGroup {
  key: string;
  members: number[];
  memberInfo: { physicalId: number; name: string; team: CheatTeam; teamAr: string }[];
  occurrences: number;
  totalOverlapMs: number;
  maxOverlapMs: number;
  lastAt: number;
  crossTeam: boolean;
  allSameTeam: boolean;
  anySecretOpen: boolean;
  /** غيابٌ جماعيّ (استراحة) — يبقى في البيانات لكنه خارج الترتيب */
  isBreak: boolean;
  expectedMs: number;
  lift: number;
  score: number;
}

export interface CoAbsenceResult {
  /** غير الاستراحات أوّلاً مرتّبةً تنازلياً بالنتيجة، ثم الاستراحات */
  groups: CoAbsenceGroup[];
  windows: CoAbsenceWindow[];
  spanStart: number;
  matchSpanMs: number;
}

// ══════════════════════════════════════════════════════════════════════════
// محرّك التزامن — دالّة **نقيّة** قابلة للاختبار وحدها (بلا React ولا Date.now
// إلزاميّ: يُحقن الوقت عبر opts.now).
// ══════════════════════════════════════════════════════════════════════════

/** أقصر تداخلٍ يُعتدّ به نافذةَ تزامن */
export const MIN_OVERLAP_MS = 3000;
/** أقصر غيابٍ يدخل الحساب أصلاً — أقلّ منه ضجيجُ شبكة لا سلوك */
export const MIN_EPISODE_MS = 1500;

export function computeCoAbsence(
  players: AntiCheatPlayer[],
  opts?: { now?: number; aliveCount?: number },
): CoAbsenceResult {
  const now = opts?.now ?? Date.now();
  const aliveCount = opts?.aliveCount ?? 0;

  type Ev = { t: number; delta: 1 | -1; pid: number; secret: boolean };
  const events: Ev[] = [];
  const awayByPid = new Map<number, number>();
  const infoByPid = new Map<number, { physicalId: number; name: string; team: CheatTeam; teamAr: string }>();
  let spanStart = Infinity;

  for (const p of players || []) {
    const pid = Number(p.physicalId);
    if (!Number.isFinite(pid)) continue;
    infoByPid.set(pid, { physicalId: pid, name: p.name, team: p.team, teamAr: p.teamAr });
    for (const ep of p.episodes || []) {
      const s = Number(ep.start);
      if (!Number.isFinite(s)) continue;
      // الفترة المفتوحة تُعامَل كأنها تنتهي **الآن** — وإلا اختفى الغائب الحاليّ
      // من التزامن تماماً، وهو أخطر الحالات لا أقلّها.
      const e = ep.end == null ? now : Number(ep.end);
      if (!Number.isFinite(e) || e - s < MIN_EPISODE_MS) continue;
      events.push({ t: s, delta: 1, pid, secret: !!ep.secretOpen });
      events.push({ t: e, delta: -1, pid, secret: !!ep.secretOpen });
      awayByPid.set(pid, (awayByPid.get(pid) || 0) + (e - s));
      if (s < spanStart) spanStart = s;
    }
  }

  if (!events.length) {
    return { groups: [], windows: [], spanStart: now, matchSpanMs: 0 };
  }

  const matchSpanMs = Math.max(1, now - spanStart);

  // ── خطّ الكنس: حدثٌ حدثاً، والنافذة تُغلق **قبل** تطبيق الحدث التالي ──
  events.sort((a, b) => (a.t - b.t) || (a.delta - b.delta));
  const active = new Map<number, { n: number; secret: number }>();
  const raw: CoAbsenceWindow[] = [];
  let prevT: number | null = null;

  const snapshot = (): { members: number[]; secret: boolean } => {
    const members: number[] = [];
    let secret = false;
    active.forEach((st, pid) => {
      if (st.n > 0) { members.push(pid); if (st.secret > 0) secret = true; }
    });
    members.sort((a, b) => a - b);
    return { members, secret };
  };

  for (const ev of events) {
    if (prevT !== null && ev.t > prevT) {
      const { members, secret } = snapshot();
      if (members.length >= 2) raw.push({ from: prevT, to: ev.t, members, anySecretOpen: secret, isBreak: false });
    }
    const st = active.get(ev.pid) || { n: 0, secret: 0 };
    st.n += ev.delta;
    if (ev.secret) st.secret += ev.delta;
    if (st.n <= 0) active.delete(ev.pid); else active.set(ev.pid, st);
    prevT = ev.t;
  }

  // ── دمج النوافذ المتلاصقة ذات المجموعة نفسها ──
  const merged: CoAbsenceWindow[] = [];
  for (const w of raw) {
    const last = merged[merged.length - 1];
    if (last && last.to === w.from && last.members.join(',') === w.members.join(',')) {
      last.to = w.to;
      last.anySecretOpen = last.anySecretOpen || w.anySecretOpen;
    } else {
      merged.push({ ...w });
    }
  }

  // 🛑 «استراحة عامّة»: حين يغيب رُبع الأحياء (وثلاثةٌ على الأقلّ) في آنٍ واحد
  //    فالسبب الأرجح إعلانُ استراحةٍ من الليدر لا تواطؤ. تُستبعَد من الترتيب
  //    ولا تُحذف — إخفاؤها يخفي أيضاً من استغلّ الاستراحة.
  const breakThreshold = Math.max(3, Math.ceil(aliveCount / 4));
  const windows = merged
    .filter((w) => w.members.length >= 2 && (w.to - w.from) >= MIN_OVERLAP_MS)
    .map((w) => ({ ...w, isBreak: w.members.length >= breakThreshold }));

  // ── التجميع لكل مجموعةٍ غير مرتّبة ──
  const byKey = new Map<string, CoAbsenceGroup>();
  for (const w of windows) {
    const key = w.members.join('-');
    const dur = w.to - w.from;
    let g = byKey.get(key);
    if (!g) {
      const memberInfo = w.members.map(
        (pid) => infoByPid.get(pid) || { physicalId: pid, name: `#${pid}`, team: 'CITIZEN' as CheatTeam, teamAr: 'المواطنون' },
      );
      const hasMafia = memberInfo.some((m) => m.team === 'MAFIA');
      const hasOther = memberInfo.some((m) => m.team !== 'MAFIA');
      g = {
        key, members: w.members, memberInfo,
        occurrences: 0, totalOverlapMs: 0, maxOverlapMs: 0, lastAt: 0,
        crossTeam: hasMafia && hasOther,
        allSameTeam: memberInfo.every((m) => m.team === memberInfo[0].team),
        anySecretOpen: false,
        isBreak: w.isBreak,
        expectedMs: 0, lift: 0, score: 0,
      };
      byKey.set(key, g);
    }
    g.occurrences += 1;
    g.totalOverlapMs += dur;
    if (dur > g.maxOverlapMs) g.maxOverlapMs = dur;
    if (w.to > g.lastAt) g.lastAt = w.to;
    g.anySecretOpen = g.anySecretOpen || w.anySecretOpen;
  }

  // ── تصحيح الرفع (lift) — بلا هذا يتصدّر الغائب المزمن كلَّ مجموعةٍ يمرّ بها ──
  //    p_i = نسبة غياب اللاعب من عمر المباراة. التزامن المتوقّع صدفةً لمجموعةٍ
  //    = حاصل ضرب النسب × عمر المباراة. lift = الفعليّ ÷ المتوقّع.
  const all = Array.from(byKey.values());
  for (const g of all) {
    let prod = 1;
    for (const pid of g.members) {
      const p = Math.min(1, (awayByPid.get(pid) || 0) / matchSpanMs);
      prod *= p;
    }
    g.expectedMs = prod * matchSpanMs;
    g.lift = g.totalOverlapMs / Math.max(g.expectedMs, 1);

    const base = Math.log(1 + g.totalOverlapMs / 1000);
    const teamFactor = g.crossTeam ? 2.5 : g.allSameTeam ? 0.6 : 1;
    g.score = base
      * teamFactor
      * (g.anySecretOpen ? 2.0 : 1)
      * (1 + 0.4 * (g.members.length - 2))
      * (1 + 0.3 * Math.log(g.occurrences))
      * Math.min(g.lift, 5);
  }

  const ranked = all.filter((g) => !g.isBreak).sort((a, b) => b.score - a.score);
  const breaks = all.filter((g) => g.isBreak).sort((a, b) => b.lastAt - a.lastAt);

  return { groups: [...ranked, ...breaks], windows, spanStart, matchSpanMs };
}

// ══════════════════════════════════════════════════════════════════════════
// المخزن — لكلّ غرفةٍ سجلٌّ يعيش عبر تفكيك/تركيب المزوّد (تنقّل الليدر بين شاشتيه)
// ══════════════════════════════════════════════════════════════════════════

type Store = Record<number, AntiCheatPlayer>;
const moduleStores = new Map<string, { players: Store; aliveCount: number }>();
const MAX_EPISODES = 200;

/** يُستعمل في الاختبارات وعند تبديل الغرفة. */
export function resetAntiCheatStore(roomId?: string) {
  if (roomId) moduleStores.delete(roomId); else moduleStores.clear();
}

function applySignal(prev: Store, d: any): Store {
  const pid = Number(d?.physicalId);
  if (!Number.isFinite(pid)) return prev;
  const at = typeof d?.at === 'number' ? d.at : Date.now();
  const det = d?.details || {};
  const kind: CheatKind = d?.kind;

  const old = prev[pid];
  const episodes: AbsenceEpisode[] = old ? old.episodes.slice() : [];
  let currentlyOut = old?.currentlyOut || false;

  // 🛟 شبكة أمان: أيّ إشارةٍ **غير** «خرج» تعني أن اللاعب حاضرٌ يتفاعل الآن.
  //    فإن بقيت لديه فترةٌ مفتوحة (ضاع إغلاقها لسببٍ ما) نُغلقها هنا بدل أن يظلّ
  //    عدّاد «خارج الآن» يجري عليه إلى الأبد — وهو ما شُوهد فعلاً مع تطبيق iOS.
  if (kind !== 'app_left' && kind !== 'app_departure') {
    for (let i = episodes.length - 1; i >= 0; i--) {
      if (episodes[i].end === null) {
        const e = episodes[i];
        episodes[i] = { ...e, end: at, durMs: Math.max(0, at - e.start) };
        break;
      }
    }
    currentlyOut = false;
  }

  if (kind === 'app_left') {
    // غيابٌ مفتوح. إن كان مفتوحاً أصلاً (إشارة مكرّرة/إغلاقٌ ضائع) نُبقي البداية
    // الأقدم — التقدير المحافظ يطيل الغياب ولا يخترعه.
    const openIdx = episodes.findIndex((e) => e.end === null);
    if (openIdx === -1) {
      episodes.push({
        start: at, end: null, durMs: null,
        secretOpen: !!det.secretOpen,
        phase: String(det.phase || ''),
        source: String(det.source || 'disconnect'),
      });
    }
    currentlyOut = true;
  } else if (kind === 'app_departure') {
    const durationMs = typeof det.durationMs === 'number' ? det.durationMs : null;
    // آخر فترةٍ مفتوحة (لا أوّلها) — الإغلاق يخصّ أحدث خروج
    let openIdx = -1;
    for (let i = episodes.length - 1; i >= 0; i--) { if (episodes[i].end === null) { openIdx = i; break; } }
    if (openIdx >= 0) {
      const ep = episodes[openIdx];
      const end = Math.max(at, ep.start);
      episodes[openIdx] = {
        ...ep,
        end,
        durMs: durationMs != null ? durationMs : end - ep.start,
        secretOpen: ep.secretOpen || !!det.secretOpen,
      };
    } else {
      // إعادة بناء الفترة من الحمولة — لا حقلَ لبدايتها في صفوف العميل
      const start = typeof det.departedAt === 'number'
        ? det.departedAt
        : at - (durationMs || 0);
      const end = Math.max(at, start);
      const dur = durationMs != null ? durationMs : end - start;
      // 🔁 حارس تكرار: الغياب الواحد قد يُبلَّغ مرّتين (الجهاز عند عودته للمقدّمة،
      //    والخادم عند إعادة الاتصال). لولا الدمج لتضاعف «مجموع الغياب» والمتوسّط.
      const dupIdx = episodes.findIndex((e) => {
        const es = e.start, ee = e.end ?? end;
        const ov = Math.min(ee, end) - Math.max(es, start);
        return ov > 0 && ov >= 0.6 * Math.max(1, end - start);
      });
      if (dupIdx >= 0) {
        const e = episodes[dupIdx];
        const ns = Math.min(e.start, start);
        const ne = Math.max(e.end ?? end, end);
        episodes[dupIdx] = { ...e, start: ns, end: ne, durMs: ne - ns, secretOpen: e.secretOpen || !!det.secretOpen };
      } else {
        episodes.push({
          start, end, durMs: dur,
          secretOpen: !!det.secretOpen,
          phase: String(det.phase || ''),
          source: String(det.source || 'client'),
        });
      }
    }
    currentlyOut = false;
  }

  const capped = episodes.length > MAX_EPISODES ? episodes.slice(-MAX_EPISODES) : episodes;

  const row: AntiCheatPlayer = {
    physicalId: pid,
    name: String(d?.name || old?.name || `#${pid}`),
    team: (d?.team || old?.team || 'CITIZEN') as CheatTeam,
    teamAr: String(d?.teamAr || old?.teamAr || ''),
    role: String(d?.role || old?.role || ''),
    avatarUrl: d?.avatarUrl ?? old?.avatarUrl ?? null,
    episodes: capped,
    screenshots: (old?.screenshots || 0) + (kind === 'screenshot' ? 1 : 0),
    recordings: (old?.recordings || 0) + (kind === 'screen_recording' ? 1 : 0),
    maxWeight: Math.max(old?.maxWeight || 0, Number(d?.weight) || 0),
    lastAt: at,
    lastLabelAr: String(d?.labelAr || old?.lastLabelAr || ''),
    currentlyOut,
  };
  return { ...prev, [pid]: row };
}

// ══════════════════════════════════════════════════════════════════════════
// السياق
// ══════════════════════════════════════════════════════════════════════════

export interface AntiCheatApi {
  /** false خارج المزوّد (كونسول المضيف البعيد مثلاً) — كل الواجهات تختفي */
  enabled: boolean;
  now: number;
  aliveCount: number;
  /** مرتّبون بحسب الاشتباه (الخارج الآن أوّلاً) */
  players: AntiCheatPlayerStats[];
  flaggedCount: number;
  currentlyOutCount: number;
  spanStart: number;
  coAbsence: CoAbsenceResult;
}

const EMPTY_CO: CoAbsenceResult = { groups: [], windows: [], spanStart: 0, matchSpanMs: 0 };
const INERT: AntiCheatApi = {
  enabled: false, now: 0, aliveCount: 0, players: [], flaggedCount: 0,
  currentlyOutCount: 0, spanStart: 0, coAbsence: EMPTY_CO,
};

const AntiCheatCtx = createContext<AntiCheatApi>(INERT);

/** يعود بقيمةٍ خاملة آمنة إن لم يوجد مزوّد. */
export function useAntiCheat(): AntiCheatApi {
  return useContext(AntiCheatCtx);
}

/** جسرٌ للمكوّن الذي يُركّب المزوّد بنفسه فلا يستطيع استهلاك سياقه الخاص. */
export function AntiCheatConsumer({ children }: { children: (ac: AntiCheatApi) => ReactNode }) {
  const ac = useAntiCheat();
  return <>{children(ac)}</>;
}

export type AntiCheatOn = (event: string, handler: (...args: any[]) => void) => () => void;

export function AntiCheatProvider({
  roomId, on, soundOn, children,
}: {
  roomId?: string;
  on: AntiCheatOn;
  /** جهاز الليدر وحده يسمع — يُمرَّر كدالّة لتقرأ المرجع الحيّ بلا إعادة اشتراك */
  soundOn?: () => boolean;
  children: ReactNode;
}) {
  const cached = roomId ? moduleStores.get(roomId) : undefined;
  const [store, setStore] = useState<Store>(() => cached?.players || {});
  const [aliveCount, setAliveCount] = useState<number>(() => cached?.aliveCount || 0);
  const [now, setNow] = useState(() => Date.now());
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  // مباراةٌ جديدة = سجلٌّ جديد. «خلال اللعبة» تفقد معناها لو تراكمت الغرف.
  useEffect(() => {
    if (!roomId) return;
    for (const key of Array.from(moduleStores.keys())) if (key !== roomId) moduleStores.delete(key);
    const c = moduleStores.get(roomId);
    setStore(c?.players || {});
    setAliveCount(c?.aliveCount || 0);
  }, [roomId]);

  // ── 💾 ترطيبٌ من المخزَّن: السجلّ يعيش في بثّ السوكِت، فتحديثُ صفحة الليدر
  // (أو فتحُها من جهازٍ ثانٍ) كان يمحو سجلّ المباراة كلّه. نُعيد الإشارات المحفوظة
  // عبر **نفس** المخفِّض `applySignal` فلا منطق ثانٍ يُصان بالتوازي.
  // يُنفَّذ مرّةً لكلّ غرفة، وما وصل بالسوكِت لا يُكرَّر (المخفِّض يدمج بالفترات).
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!roomId || hydratedRef.current === roomId) return;
    hydratedRef.current = roomId;
    let cancelled = false;
    (async () => {
      try {
        const token = typeof window !== 'undefined'
          ? (localStorage.getItem('leader_token') || localStorage.getItem('token') || '') : '';
        const res = await fetch(`/api/anticheat/room/${encodeURIComponent(roomId)}/signals?limit=500`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const r: any = await res.json();
        const list: any[] = r?.signals || [];
        if (cancelled || list.length === 0) return;
        setStore((prev) => list.reduce((acc, s) => applySignal(acc, s), prev));
      } catch { /* الترطيب تحسينٌ — البثّ الحيّ يبقى المصدر الأساسيّ */ }
    })();
    return () => { cancelled = true; };
  }, [roomId]);

  // ── المستهلك **الوحيد** لإشارة الاشتباه في لوحة الليدر ──
  useEffect(() => {
    if (!roomId) return;
    return on('leader:cheat-signal', (d: any) => {
      if (!d || d.roomId !== roomId) return;

      // 🔔 صوتٌ محليّ على جهاز الليدر وحده (لا يُبثّ للقاعة حتى لا ينكشف التنبيه)
      // 🔴 مفتاحٌ خاصّ بالخروج لا مفتاح فتح القائمة: كانا نغمةً واحدة،
      //    فيسمع الموجّه صوتاً واحداً لحدثَين مختلفَين ولا يعرف أيّهما وقع إلّا بالنظر.
      //    والفصل شرطٌ لفصل مستواهما في المازج.
      try {
        if (soundOnRef.current?.()) {
          playLocalSound(d.kind === 'app_left' || d.kind === 'app_departure'
            ? 'leader_departure_alert' : 'leader_gallery_alert');
        }
      } catch { /* الصوت لا يحجب */ }

      // ⚡ تنبيهٌ فوريٌّ بلا أزرار — يُسمّي المقعد واللاعب وما جرى
      const seat = Number(d.physicalId);
      const label = String(d.labelAr || FALLBACK_LABEL[d.kind as CheatKind] || 'سلوكٌ مريب');
      const icon = d.kind === 'screenshot' ? '📸' : d.kind === 'screen_recording' ? '🎥' : '🕵️';
      swalToast(`${icon} مقعد ${seat} · ${d.name} — ${label}`, (Number(d.weight) || 0) >= 5 ? 'error' : 'warning');

      const ac = Number(d?.details?.aliveCount);
      if (Number.isFinite(ac) && ac > 0) setAliveCount(ac);
      setStore((prev) => applySignal(prev, d));
    });
  }, [on, roomId]);

  // كتابةٌ عابرة للمخزن الوحدويّ — ليبقى السجلّ عبر تنقّل الليدر بين شاشتيه
  useEffect(() => {
    if (!roomId) return;
    moduleStores.set(roomId, { players: store, aliveCount });
  }, [roomId, store, aliveCount]);

  // 🪑 إعادة ترقيم المقاعد: المخزن مفهرسٌ برقم المقعد، ونقلُ لاعبٍ يغيّر رقمه —
  // فبلا ترحيلٍ يُنسب سجلّ غيابه لمن جلس مكانه (اتهامٌ باطل). الأرقام تمرّ بخريطة
  // الخادم نفسها التي تمرّ بها حالة اللعبة، فيبقى السجلّ ملتصقاً بالشخص لا بالكرسي.
  useEffect(() => {
    if (!roomId) return;
    return on('room:seats-remapped', (d: any) => {
      const map: Record<string, number> = d?.map || {};
      if (!Object.keys(map).length) return;
      setStore((prev) => {
        const next: Store = {};
        for (const [pidStr, row] of Object.entries(prev)) {
          const oldPid = Number(pidStr);
          const newPid = map[pidStr] ?? oldPid;
          next[newPid] = { ...row, physicalId: newPid };
        }
        return next;
      });
    });
  }, [on, roomId]);

  // نبضة «قبل كذا» و«خارجٌ الآن» — ثانيةً أثناء غيابٍ مفتوح، وعشراً خلاف ذلك.
  const rows = useMemo(() => Object.values(store), [store]);
  const anyOut = useMemo(() => rows.some((r) => r.currentlyOut), [rows]);
  useEffect(() => {
    if (!rows.length) return;
    const iv = setInterval(() => setNow(Date.now()), anyOut ? 1000 : 10000);
    return () => clearInterval(iv);
  }, [rows.length, anyOut]);

  const players = useMemo<AntiCheatPlayerStats[]>(() => {
    const out = rows.map((p) => {
      const known = p.episodes.filter((e) => e.durMs != null);
      const open = p.episodes.find((e) => e.end === null) || null;
      const closedTotal = known.reduce((s, e) => s + (e.durMs || 0), 0);
      const openMs = open ? Math.max(0, now - open.start) : 0;
      const longest = known.length ? Math.max(...known.map((e) => e.durMs || 0)) : null;
      const lastDep = p.episodes.length ? p.episodes[p.episodes.length - 1].start : null;
      const totalAwayMs = closedTotal + openMs;
      const stats: AntiCheatPlayerStats = {
        ...p,
        departures: p.episodes.length,
        // المجهولة المدّة تُستبعد من المقام — إدخالها كصفرٍ يُهبط المتوسّط زوراً
        avgMs: known.length ? Math.round(closedTotal / known.length) : null,
        longestMs: longest,
        totalAwayMs,
        lastDepartureAt: lastDep,
        openSince: open ? open.start : null,
        suspicion: 0,
      };
      stats.suspicion =
        (p.currentlyOut ? 1000 : 0)
        + p.maxWeight
        + stats.departures * 1.5
        + p.screenshots * 4
        + p.recordings * 5
        + totalAwayMs / 60000;
      return stats;
    });
    return out.sort((a, b) => (b.suspicion - a.suspicion) || (b.lastAt - a.lastAt));
  }, [rows, now]);

  // التزامن مكلفٌ نسبياً (فرزٌ لكل الأحداث) — يُعاد حسابه كل خمس ثوانٍ لا كلّ نبضة.
  // تأخّر «نهاية الغياب المفتوح» خمسَ ثوانٍ لا يغيّر حكماً.
  const coarseNow = Math.floor(now / 5000) * 5000;
  const coAbsence = useMemo(
    () => computeCoAbsence(rows, { now: coarseNow, aliveCount }),
    [rows, coarseNow, aliveCount],
  );

  const spanStart = useMemo(() => {
    let s = Infinity;
    for (const p of rows) for (const e of p.episodes) if (e.start < s) s = e.start;
    return Number.isFinite(s) ? s : now;
  }, [rows, now]);

  const api = useMemo<AntiCheatApi>(() => ({
    enabled: !!roomId,
    now,
    aliveCount,
    players,
    flaggedCount: players.length,
    currentlyOutCount: players.filter((p) => p.currentlyOut).length,
    spanStart,
    coAbsence,
  }), [roomId, now, aliveCount, players, spanStart, coAbsence]);

  return <AntiCheatCtx.Provider value={api}>{children}</AntiCheatCtx.Provider>;
}

const FALLBACK_LABEL: Record<CheatKind, string> = {
  app_left: 'خرج من التطبيق',
  app_departure: 'عاد بعد غياب',
  screenshot: 'التقط لقطة شاشة',
  screen_recording: 'يسجّل الشاشة',
};

// ══════════════════════════════════════════════════════════════════════════
// تنسيقات
// ══════════════════════════════════════════════════════════════════════════

/** mm:ss */
function fmtMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtAgo(ts: number | null, now: number): string {
  if (ts == null) return '—';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'الآن';
  if (s < 3600) return `قبل ${Math.round(s / 60)} د`;
  return `قبل ${Math.floor(s / 3600)} س`;
}

function fmtClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const TEAM_STYLE: Record<string, string> = {
  MAFIA: 'bg-[#8A0303]/25 border-[#8A0303]/70 text-red-300',
  NEUTRAL: 'bg-amber-500/10 border-amber-500/45 text-amber-300',
  CITIZEN: 'bg-sky-500/10 border-sky-500/40 text-sky-300',
};

function TeamChip({ team, teamAr }: { team: string; teamAr: string }) {
  return (
    <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] leading-none font-bold ${TEAM_STYLE[team] || TEAM_STYLE.CITIZEN}`}>
      {teamAr || team}
    </span>
  );
}

function SeatBadge({ id }: { id: number }) {
  return (
    <span className="shrink-0 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] leading-none text-zinc-300">
      {id}
    </span>
  );
}

/**
 * شريطٌ أفقيّ لغيابات لاعبٍ على مقياس المباراة كلّها — الغرض منه أن يرى الليدر
 * **التراصف** بعينه: قِطعتان متحاذيتان رأسياً = خروجٌ في اللحظة نفسها.
 * (يمينُ الشريط = بداية المباراة، يسارُه = الآن — اتّجاه القراءة العربيّ.)
 */
function EpisodeTimeline({ episodes, spanStart, spanEnd }: { episodes: AbsenceEpisode[]; spanStart: number; spanEnd: number }) {
  const span = Math.max(1, spanEnd - spanStart);
  return (
    <div className="relative mt-1.5 h-[8px] rounded-full bg-white/[0.05] border border-white/[0.07] overflow-hidden">
      {episodes.map((e, i) => {
        const s = Math.max(spanStart, e.start);
        const en = Math.min(spanEnd, e.end == null ? spanEnd : e.end);
        if (en <= s) return null;
        const right = ((s - spanStart) / span) * 100;
        const w = Math.max(0.8, ((en - s) / span) * 100);
        const open = e.end == null;
        return (
          <div
            key={i}
            title={`${fmtClock(e.start)} → ${open ? 'الآن' : fmtClock(en)} · ${fmtMs(en - s)}${e.secretOpen ? ' · شاشة السرّ مفتوحة' : ''}`}
            style={{
              position: 'absolute', top: 0, bottom: 0,
              right: `${Math.min(99.2, right)}%`, width: `${Math.min(100, w)}%`,
              background: open ? '#e0492b' : e.secretOpen ? '#C5A059' : '#8a6a2f',
              boxShadow: open ? '0 0 6px rgba(224,73,43,0.8)' : undefined,
            }}
            className={open ? 'animate-pulse' : ''}
          />
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// 🕵️ الزرّ الدائم في الرأس + اللوحة — يُركَّب في **كلّ** رؤوس الليدر
// ══════════════════════════════════════════════════════════════════════════

export function AntiCheatToggle({ label = '🕵️ المراقبة' }: { label?: string }) {
  const ac = useAntiCheat();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'players' | 'together'>('players');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('[data-anticheat]')) return;   // داخل الواجهة — لا إغلاق
      setOpen(false);
      // 🛡️ ابتلاع النقرة التي أغلقت: بطاقات اللاعبين تحمل أفعالاً حقيقيّة
      // (كشف دور، اختيار هدف ليل، عقوبة) — لمسةٌ قصدها «أغلق اللوحة» يجب
      // ألّا تُشعل فعلاً على البطاقة التي صادف أنها تحتها.
      const swallow = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      document.addEventListener('click', swallow, true);
      setTimeout(() => document.removeEventListener('click', swallow, true), 350);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open]);

  if (!ac.enabled) return null;

  const out = ac.currentlyOutCount > 0;
  const flagged = ac.flaggedCount;

  return (
    <>
      <button
        type="button"
        data-anticheat="1"
        onClick={() => setOpen((v) => !v)}
        title="سجلّ المراقبة — غيابات اللاعبين عن التطبيق وتزامنها"
        className={`relative flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.15em] transition-colors border px-3 py-1.5 ${
          out
            ? 'text-red-300 border-red-500/70 bg-red-500/10'
            : open
              ? 'text-amber-200 border-amber-400/70 bg-amber-500/10'
              : flagged > 0
                ? 'text-amber-300 border-amber-500/50 bg-amber-500/[0.06] hover:border-amber-400'
                : 'text-[#C5A059] border-[#C5A059]/30 hover:text-yellow-400 hover:border-[#C5A059]'
        }`}
      >
        <span>{label}</span>
        {flagged > 0 && (
          <span
            className={`min-w-[1.15rem] rounded-full px-1 py-[1px] text-[9px] font-black leading-none ${
              out ? 'bg-red-600 text-white animate-pulse' : 'bg-amber-500/25 text-amber-200 border border-amber-500/40'
            }`}
          >
            {flagged}
          </span>
        )}
        {out && (
          <span className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse" />
        )}
      </button>

      <FixedLayer>
        <AnimatePresence>
          {open && (
            <motion.div
              data-anticheat="1"
              dir="rtl"
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.98 }}
              className="fixed bottom-4 right-4 z-[115] w-[min(96vw,38rem)] max-h-[82vh] flex flex-col rounded-2xl border border-[#C5A059]/30 bg-[#080808]/96 backdrop-blur-md shadow-2xl overflow-hidden"
            >
              {/* الرأس */}
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-white/10 shrink-0">
                <div className="flex flex-col">
                  <span className="text-white text-xs font-bold" style={{ fontFamily: 'Amiri, serif' }}>
                    🕵️ المراقبة — غياب اللاعبين
                  </span>
                  <span className="text-[9px] text-[#808080] font-mono leading-tight">
                    {ac.currentlyOutCount > 0
                      ? `${ac.currentlyOutCount} خارج التطبيق الآن · ${ac.flaggedCount} تحت المراقبة`
                      : `${ac.flaggedCount} لاعب تحت المراقبة — على جهازك وحدك`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-6 h-6 rounded text-[#808080] hover:text-white text-sm leading-none shrink-0"
                  aria-label="إغلاق"
                >
                  ✕
                </button>
              </div>

              {/* التبويبات */}
              <div className="flex items-stretch gap-1 px-2 pt-2 shrink-0">
                {([['players', `اللاعبون${ac.flaggedCount ? ` (${ac.flaggedCount})` : ''}`],
                   ['together', `خرجوا معاً${ac.coAbsence.groups.filter((g) => !g.isBreak).length ? ` (${ac.coAbsence.groups.filter((g) => !g.isBreak).length})` : ''}`]] as const).map(([k, t]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTab(k)}
                    className={`flex-1 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                      tab === k
                        ? 'border-[#C5A059]/70 bg-[#C5A059]/12 text-[#E8B84B]'
                        : 'border-zinc-800 bg-black/30 text-[#7d7568] hover:text-[#C5A059] hover:border-[#C5A059]/40'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto px-2 py-2">
                {tab === 'players' ? <PlayersTab ac={ac} /> : <TogetherTab ac={ac} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </FixedLayer>
    </>
  );
}

// ── تبويب اللاعبين ─────────────────────────────────────────────────────────
function PlayersTab({ ac }: { ac: AntiCheatApi }) {
  if (!ac.players.length) {
    return (
      <p className="text-[#7d7568] text-[11px] leading-relaxed p-3">
        لا إشارات بعد. يظهر هنا كلّ لاعبٍ خرج من التطبيق أو التقط لقطة شاشة أثناء المباراة،
        بعدد مرّاته ومتوسّط غيابه وخطّ زمنٍ لغياباته.
      </p>
    );
  }
  const spanEnd = ac.now;
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-1 pb-1 text-[8.5px] font-mono text-[#5f584e]">
        <span>الآن ←</span>
        <span>→ {fmtClock(ac.spanStart)} بداية الرصد</span>
      </div>
      {ac.players.map((p) => (
        <div key={p.physicalId} className="px-2 py-2 border-b border-white/[0.06] last:border-b-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <SeatBadge id={p.physicalId} />
            <span className="text-white text-[12.5px] font-bold truncate max-w-[10rem]">{p.name}</span>
            <TeamChip team={p.team} teamAr={p.teamAr} />
            {p.currentlyOut && (
              <span className="shrink-0 rounded-md border border-red-500/70 bg-red-600/20 px-1.5 py-0.5 text-[9.5px] font-black text-red-300 animate-pulse">
                ● خارج الآن {p.openSince ? fmtMs(ac.now - p.openSince) : ''}
              </span>
            )}
            {p.screenshots > 0 && (
              <span className="shrink-0 rounded-md border border-[#8A0303]/60 bg-[#8A0303]/20 px-1.5 py-0.5 text-[9.5px] font-bold text-red-300">
                📸 ×{p.screenshots}
              </span>
            )}
            {p.recordings > 0 && (
              <span className="shrink-0 rounded-md border border-[#8A0303]/60 bg-[#8A0303]/20 px-1.5 py-0.5 text-[9.5px] font-bold text-red-300">
                🎥 ×{p.recordings}
              </span>
            )}
            <span className="ml-auto shrink-0 text-[9px] font-mono text-[#6d6459]">{fmtAgo(p.lastAt, ac.now)}</span>
          </div>

          {p.departures > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-[#a99f90]">
              <span className="text-[#F0C674] font-bold">غادر ×{p.departures}</span>
              <span>متوسط الغياب <b className="font-mono text-[#d8cdbb]">{fmtMs(p.avgMs)}</b></span>
              <span>أطول غياب <b className="font-mono text-[#d8cdbb]">{fmtMs(p.longestMs)}</b></span>
              <span>
                آخر مرة <b className="font-mono text-[#d8cdbb]">{fmtAgo(p.lastDepartureAt, ac.now)}</b>
                {p.lastDepartureAt != null && <span className="opacity-60"> ({fmtClock(p.lastDepartureAt)})</span>}
              </span>
            </div>
          )}

          {p.lastLabelAr && (
            <div className="mt-0.5 text-[10px] text-[#7d7568] truncate">{p.lastLabelAr}</div>
          )}

          {p.episodes.length > 0 && (
            <EpisodeTimeline episodes={p.episodes} spanStart={ac.spanStart} spanEnd={spanEnd} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── تبويب «خرجوا معاً» ─────────────────────────────────────────────────────
function TogetherTab({ ac }: { ac: AntiCheatApi }) {
  const groups = ac.coAbsence.groups;
  if (!groups.length) {
    return (
      <div className="p-3 text-[11px] leading-relaxed text-[#7d7568]">
        <p className="mb-2 text-[#C5A059] font-bold">لم يُرصد تزامنٌ بعد.</p>
        <p>
          حين يغيب لاعبان أو أكثر عن التطبيق في وقتٍ واحد لثلاث ثوانٍ متداخلة على الأقل،
          تظهر مجموعتهم هنا: كم مرّة تزامنوا، ومجموع التزامن، وآخر مرّة.
        </p>
        <p className="mt-2">
          الترتيب لا يكون بطول الغياب بل بـ<b className="text-[#C5A059]">شذوذه</b> — يُقارَن التزامن الفعليّ
          بالمتوقَّع صدفةً من نسبة غياب كلٍّ منهم، فلا يتصدّر الغائب المزمن بلا سبب.
        </p>
        <p className="mt-2">
          وأخطر ما يظهر هنا شارة <b className="text-red-300">«عبر الفريقين»</b>: خروج مافيويٍّ مع غير مافيويٍّ
          في اللحظة نفسها — نمطٌ بلا تفسيرٍ بريء.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => (
        <div
          key={g.key}
          className={`rounded-xl border p-2.5 ${
            g.isBreak
              ? 'border-zinc-800 bg-zinc-900/40 opacity-55'
              : g.crossTeam
                ? 'border-[#8A0303]/60 bg-[#1a0505]/70'
                : 'border-[#C5A059]/25 bg-black/40'
          }`}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            {g.memberInfo.map((m) => (
              <span key={m.physicalId} className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-1.5 py-0.5">
                <SeatBadge id={m.physicalId} />
                <span className="text-white text-[11px] font-bold truncate max-w-[7rem]">{m.name}</span>
                <TeamChip team={m.team} teamAr={m.teamAr} />
              </span>
            ))}
            {g.crossTeam && !g.isBreak && (
              <span className="shrink-0 rounded-md border border-red-500/80 bg-red-600/25 px-2 py-0.5 text-[10px] font-black text-red-200">
                ⚠ عبر الفريقين
              </span>
            )}
            {g.anySecretOpen && !g.isBreak && (
              <span className="shrink-0 rounded-md border border-[#C5A059]/60 bg-[#C5A059]/15 px-1.5 py-0.5 text-[9.5px] font-bold text-[#E8B84B]">
                🔓 شاشة السرّ مفتوحة
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-[#a99f90]">
            <span className="text-[#F0C674] font-bold">تزامنوا {g.occurrences} مرة</span>
            <span>مجموع التزامن <b className="font-mono text-[#d8cdbb]">{fmtMs(g.totalOverlapMs)}</b></span>
            <span>أطول تزامن <b className="font-mono text-[#d8cdbb]">{fmtMs(g.maxOverlapMs)}</b></span>
            <span>آخر مرة <b className="font-mono text-[#d8cdbb]">{fmtAgo(g.lastAt, ac.now)}</b></span>
            {!g.isBreak && (
              <span title="التزامن الفعليّ ÷ المتوقَّع صدفةً">
                الشذوذ <b className="font-mono text-[#d8cdbb]">×{g.lift >= 100 ? '99+' : g.lift.toFixed(1)}</b>
              </span>
            )}
          </div>

          {g.isBreak && (
            <p className="mt-1 text-[10px] text-[#7d7568]">استراحة عامة — مستبعدة من الترتيب</p>
          )}
        </div>
      ))}
    </div>
  );
}
