'use client';

// ══════════════════════════════════════════════════════
// 🕴️ غرفة التدريب — «ليلة تجريبيّة» (2026-11-15)
//
// واجهة الغرفة الحقيقيّة (PlayerRoom + PlayerPhaseView) مغذّاةً بسيناريو مكتوب بدل
// المقبس — كما تفعل صفحة المعاينة /preview/player-room. لا غرفة في الخادم ولا لاعبين:
// لا رتبة، لا إحصاءات، لا ختم ولاء، لا خصم غياب، لا تنبيه لموجّه، لا تقرير.
//
// «الدقّات» (beats) هي خطوات الجولة داخل الغرفة: كلّ دقّة تضبط حالة المشهد عند دخولها،
// وتقول ما يُضاء وما يقوله الدون، ومتى تنتهي (فعلٌ من اللاعب يُرصد من الحالة أو من الشاشة).
// ما تضيفه الجولة فوق الواجهة الحقيقيّة: نافذة القاعة، وهمسات التدريب، وبطاقة الدون.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import PlayerRoom, { useFaceOf, type RoomHost, type SheriffResult } from '@/components/player-room/PlayerRoom';
import { PlayerRoomBoundary } from '@/components/player-room/Boundary';
import { requestHub } from '@/components/player-room/roomBus';
import PlayerPhaseView from '@/components/PlayerPhaseView';
import RolesDeck from '@/components/RolesDeck';
import type { ConfItem } from '@/app/leader/LeaderConfrontationPanel';
import { ROLE_NAMES } from '@/lib/constants';
import { usePlayer } from '@/context/PlayerContext';
import { useGuide, arNum } from '../GuideProvider';
import GuideLayer, { DonSheet, GuideToast, InlineWhisper, type LayerStep } from '../GuideLayer';
import * as S from './script';

const API = process.env.NEXT_PUBLIC_API_URL || '';
const ME = S.ME;

interface GuideRole { id: string; nameAr: string; oneLiner: string | null; phaseNotes: Record<string, string> | null }
let _roles: GuideRole[] | null = null;
function useRoles(): GuideRole[] {
  const [r, setR] = useState<GuideRole[]>(_roles || []);
  useEffect(() => {
    if (_roles) return;
    fetch(`${API}/api/game-config/roles-guide`).then(x => x.json())
      .then(d => { if (Array.isArray(d?.data)) { _roles = d.data; setR(d.data); } }).catch(() => {});
  }, []);
  return r;
}

type Pre = 'joining' | 'photo' | 'seat' | 'room';
type HallKind = 'seats' | 'night' | 'morning' | 'conf-me' | 'conf-bots' | 'declined' | 'flip';

interface Sim {
  phase: string;
  assigned: boolean;
  dead: number[];
  meDead: boolean;
  oneNight: RoomHost['oneNight'];
  oneNightSent: boolean;
  /** undefined = لم يختر بعد · null = تخطّى */
  pick: number | null | undefined;
  vote: number | null;
  votingCountdown: number | null;
  hall: HallKind | null;
  speaker: number | null;
  speakerAt: number;
  speaking: boolean;
  conf: ConfItem[];
  confTarget: number | null;
  incomingFrom: number | null;
  incomingAns: 'yes' | 'no' | null;
  pulse: 'REQ' | 'TGT' | null;
  bots: { a: number; b: number } | null;
  just: { ended: boolean; startedAt: number } | null;
  withdrawn: boolean;
  revealed: boolean;
  over: boolean;
  rolesOpen: boolean;
}
const INIT: Sim = {
  phase: 'LOBBY', assigned: false, dead: [], meDead: false, oneNight: null, oneNightSent: false, pick: undefined,
  vote: null, votingCountdown: null, hall: null, speaker: null, speakerAt: 0, speaking: true, conf: [], confTarget: null,
  incomingFrom: null, incomingAns: null, pulse: null, bots: null, just: null, withdrawn: false, revealed: false, over: false, rolesOpen: false,
};

interface Beat {
  id: string;
  enter?: () => void;
  layer: () => LayerStep | null;
  /** تنتهي الدقّة حين يصير صحيحاً (يُفحص كلّ ١٥٠ms) */
  until?: () => boolean;
  /** عُد دقّةً إن صار صحيحاً (أغلق اللاعب ورقةً قبل أن يُتمّ) */
  back?: () => boolean;
  onNext?: () => void;
}

const SEL = {
  top: '.pr-top', teams: '.pr-teams', hall: '[data-guide="hall"]',
  card: '.pr-hero [role="button"]', cardOpen: '[aria-label="المس لإخفاء دورك"]',
  navGame: 'nav button[aria-label="أدوات اللعبة"]',
  hub: '.pr-hub', tileTeam: '.pr-hub button:nth-child(1)', tileTasks: '.pr-hub button:nth-child(2)', tileRoles: '.pr-hub button:nth-child(5)',
  hold: '.pr-sheet .pr-hold', peek: '.pr-peek', team: '.pr-team', teamBtn: '.pr-team-btn', teamOn: '.pr-team-btn.on',
  msg: '.pr-hero .pr-hold', speaker: '.pr-flow .pr-hero', myTurn: '[data-guide="my-turn"]',
  confReq: '[data-guide="conf-request"]', confSheet: '[data-guide="conf-sheet"]', confBox: '[data-guide="conf-box"]',
  deals: '[data-guide="deals-btn"]', accused: '[data-guide="accused"]', withdraw: '[data-guide="withdraw"]',
};
const has = (sel: string) => { try { return !!document.querySelector(sel); } catch { return false; } };
const pressEscape = () => { try { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); } catch { /* */ } };
const P = (...ps: ReactNode[]) => <>{ps.filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</>;

export default function TrainingRoom() {
  const guide = useGuide();
  const { player } = usePlayer();
  const router = useRouter();
  const roles = useRoles();
  const faceOf = useFaceOf();
  const myName = (player?.name || 'أنت').trim();
  const R = guide.role;

  const [pre, setPre] = useState<Pre>('joining');
  const [photo, setPhoto] = useState<boolean | null>(null);
  const [seat, setSeat] = useState('');
  const [bi, setBi] = useState(0);
  const [sim, setSim] = useState<Sim>(INIT);
  const [grad, setGrad] = useState(false);
  const [pickRole, setPickRole] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const simRef = useRef(sim); simRef.current = sim;
  const patch = useCallback((p: Partial<Sim>) => setSim(s => ({ ...s, ...p })), []);
  const say = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(t => (t === m ? null : t)), 3200); }, []);

  // ── الدخول: الجولة تعمل، وهذه الصفحة جزءٌ منها ──
  useEffect(() => {
    if (!guide.me) return;
    if (!guide.me.enabled) { router.replace('/player/home'); return; }
    if (guide.run?.stage !== 'room') guide.enterRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide.me?.enabled]);

  // السحب للتحديث يمسح المشهد — يُمنع كما في الغرفة الحقيقيّة
  useEffect(() => { document.body.classList.add('in-game'); return () => { document.body.classList.remove('in-game'); }; }, []);

  // «جاري تخصيص مقعدك…» ثمّ الخطوات التي تسبق الغرفة
  useEffect(() => {
    if (pre !== 'joining') return;
    const t = setTimeout(() => setPre('photo'), 1700);
    return () => clearTimeout(t);
  }, [pre]);

  // ── مشتقّات السيناريو ──
  const table = useMemo(() => S.tableOf(R), [R]);
  const night = useMemo(() => S.resolveNight(R, sim.pick), [R, sim.pick]);
  const ballot = useMemo(() => S.ballot(night, sim.vote), [night, sim.vote]);
  const acc = ballot.acc;
  const defConf = useMemo(() => S.defaultConfTarget(R, night), [R, night]);
  const info = roles.find(x => x.id === R);
  const roleName = useCallback((id: string) => roles.find(x => x.id === id)?.nameAr || (ROLE_NAMES as Record<string, string>)[id] || id, [roles]);
  const rn = roleName(R);
  const nameOf = useCallback((s: number) => (s === ME ? myName : S.BOT_NAMES[s] || `لاعب #${s}`), [myName]);
  const alive = (s: number) => !simRef.current.dead.includes(s);
  const roster = useMemo(() => S.SEATS.map(s => ({ physicalId: s, name: nameOf(s), avatarUrl: null as string | null, isAlive: !sim.dead.includes(s) })), [nameOf, sim.dead]);

  // ── التصويت: القاعة تميل مع صوت المتدرّب ──
  const candidates = useMemo(() => {
    const votes: Record<number, number> = sim.vote ? { ...ballot.bot, [ME]: sim.vote } : {};
    return ballot.cands.map((c, i) => ({ id: `c${i}`, type: 'NORMAL', targetPhysicalId: c, votes: Object.values(votes).filter(v => v === c).length }));
  }, [ballot, sim.vote]);
  const playerVotes = useMemo(() => {
    const out: Record<string, number> = {};
    if (!sim.vote) return out;
    const all: Record<number, number> = { ...ballot.bot, [ME]: sim.vote };
    for (const [k, v] of Object.entries(all)) { const i = ballot.cands.indexOf(v); if (i >= 0) out[k] = i; }
    return out;
  }, [ballot, sim.vote]);
  const myVoteIndex = sim.vote ? ballot.cands.indexOf(sim.vote) : -1;

  useEffect(() => {
    if (sim.phase !== 'DAY_VOTING') return;
    const t = setInterval(() => setSim(s => (s.votingCountdown && s.votingCountdown > 0 ? { ...s, votingCountdown: s.votingCountdown - 1 } : s)), 1000);
    return () => clearInterval(t);
  }, [sim.phase]);

  // ── مقبسٌ وهميّ: ما تسمعه واجهة المراحل وما تجيب به الأفعال ──
  const bus = useMemo(() => {
    const m = new Map<string, Set<(d: any) => void>>();
    return {
      on: (ev: string, h: (d: any) => void) => { if (!m.has(ev)) m.set(ev, new Set()); m.get(ev)!.add(h); return () => { m.get(ev)?.delete(h); }; },
      fire: (ev: string, d?: any) => { m.get(ev)?.forEach(h => { try { h(d); } catch { /* مستمعٌ معطوب لا يوقف المشهد */ } }); },
    };
  }, []);

  const votersForAccused = useMemo(() => Object.entries({ ...ballot.bot, ...(sim.vote ? { [ME]: sim.vote } : {}) }).filter(([, v]) => v === acc).map(([k]) => Number(k)), [ballot, sim.vote, acc]);
  const needed = Math.ceil(votersForAccused.length / 2);
  const neededRef = useRef(needed); neededRef.current = needed;

  const confPayload = useMemo(() => ({
    round: 1, enabled: true, perPlayer: 1, maxPerRound: 2, respondSeconds: 20, stageSeconds: 60,
    used: sim.conf.some(c => c.id === 'c-me' && ['ACCEPTED', 'LIVE', 'DONE'].includes(c.status)) ? { [ME]: 1 } : {},
    pulseEnabled: true, confrontations: sim.conf, serverTime: Date.now(),
  }), [sim.conf]);
  const confRef = useRef(confPayload); confRef.current = confPayload;

  const emit = useCallback(async (event: string, data?: any): Promise<any> => {
    const s = simRef.current;
    switch (event) {
      case 'day:get-confrontations':
        return { success: true, ...confRef.current, phase: s.phase, myVotes: s.pulse ? { 'c-bots': s.pulse } : {} };
      case 'day:request-confrontation': {
        const target = Number(data?.targetPhysicalId);
        if (!target) return { success: false, error: 'اختر لاعباً' };
        const item: ConfItem = { id: 'c-me', round: 1, requesterPhysicalId: ME, targetPhysicalId: target, status: 'PENDING', createdAt: Date.now(), respondBy: Date.now() + 20000, stageSeconds: 60 };
        setSim(x => ({ ...x, confTarget: target, conf: [...x.conf.filter(c => c.id !== 'c-me'), item] }));
        window.setTimeout(() => setSim(x => ({ ...x, conf: x.conf.map(c => (c.id === 'c-me' && c.status === 'PENDING' ? { ...c, status: 'ACCEPTED' as const, acceptedBy: 'TARGET' as const } : c)) })), 2600);
        return { success: true };
      }
      case 'day:respond-confrontation': {
        const ok = !!data?.accept;
        setSim(x => ({ ...x, incomingAns: ok ? 'yes' : 'no', conf: x.conf.map(c => (c.id === data?.id ? { ...c, status: (ok ? 'ACCEPTED' : 'DECLINED') as ConfItem['status'], ...(ok ? { acceptedBy: 'TARGET' as const } : { declinedBy: 'TARGET' as const }) } : c)) }));
        return { success: true };
      }
      case 'day:confrontation-pulse': {
        const side: 'REQ' | 'TGT' = data?.side === 'TGT' ? 'TGT' : 'REQ';
        setSim(x => ({ ...x, pulse: side }));
        return { success: true, myVotes: { [String(data?.id)]: side } };
      }
      case 'player:withdraw-vote':
        setSim(x => ({ ...x, withdrawn: true }));
        return { success: true, count: 1, needed: neededRef.current };
      case 'day:create-deal':
        return { success: false, error: 'الاتفاقيّات تُفتح من الجولة الثانية' };
      case 'room:get-my-state':
        return { success: false };
      default:
        return { success: true };
    }
  }, []);

  // ── ما تقرؤه واجهة المراحل من «الاستطلاع» ──
  const discState = useMemo(() => (sim.speaker ? {
    status: sim.speaking ? 'SPEAKING' : 'WAITING', currentSpeakerId: sim.speaker, startTime: sim.speakerAt, timeRemaining: 60, timeLimitSeconds: 60,
    speakers: S.SEATS.filter(s => !sim.dead.includes(s)).map(s => ({ physicalId: s, name: nameOf(s), hasSpoken: false })),
  } : undefined), [sim.speaker, sim.speakerAt, sim.speaking, sim.dead, nameOf]);

  const justData = useMemo(() => (sim.just ? {
    resultType: 'SINGLE',
    accused: [{ targetPhysicalId: acc, name: nameOf(acc), canJustify: true, justificationCount: 1 }],
    canJustifyList: [{ targetPhysicalId: acc, name: nameOf(acc), canJustify: true, justificationCount: 1 }],
    allExhausted: false, topVotes: votersForAccused.length, maxJustifications: 2,
    candidates: candidates.map(c => ({ targetPhysicalId: c.targetPhysicalId, type: c.type, votes: c.votes })),
    votersForAccused, voterWeights: {}, withdrawalTotal: votersForAccused.length, withdrawalNeeded: needed,
    playerVotes, leaderProxyVotes: {},
    timer: sim.just.ended ? null : { physicalId: acc, timeLimitSeconds: 30, startTime: sim.just.startedAt },
    timerFinished: sim.just.ended,
  } : undefined), [sim.just, acc, nameOf, votersForAccused, needed, candidates, playerVotes]);

  const allPlayers = useMemo(() => {
    const gone = new Set<number>([...sim.dead, ...S.SEATS.filter(s => s !== ME && S.isMafia(table[s]))]);
    return S.SEATS.map(s => ({ physicalId: s, name: nameOf(s), role: table[s], isAlive: !gone.has(s) }));
  }, [sim.dead, table, nameOf]);

  const poll = useMemo(() => ({
    round: 1,
    discussionState: sim.phase === 'DAY_DISCUSSION' ? discState : undefined,
    confrontationState: confPayload,
    justificationData: justData,
    withdrawalState: sim.withdrawn ? { count: 1, needed, withdrawn: [ME], total: votersForAccused.length } : undefined,
    pendingResolution: sim.phase === 'ELIMINATION_PENDING'
      ? (sim.revealed ? { eliminated: [acc], revealedRoles: [{ physicalId: acc, role: table[acc] }] } : { pending: true, eliminated: [] as number[] })
      : undefined,
    winner: sim.over ? 'CITIZEN' : undefined,
    allPlayers: sim.over ? allPlayers : undefined,
  }), [sim.phase, sim.withdrawn, sim.revealed, sim.over, discState, confPayload, justData, needed, votersForAccused.length, acc, table, allPlayers]);

  // واجهة المراحل تحدّث المتحدّث والمؤقّت من الأحداث لا من الاستطلاع — نبثّها بعد الرسم
  useEffect(() => { if (sim.phase === 'DAY_DISCUSSION' && discState) bus.fire('day:discussion-updated', { discussionState: discState }); }, [bus, discState, sim.phase]);
  useEffect(() => { if (sim.just?.ended) bus.fire('day:justification-timer-stopped'); }, [bus, sim.just?.ended]);
  useEffect(() => { if (sim.withdrawn) bus.fire('day:withdrawal-update', { count: 1, needed: neededRef.current, total: votersForAccused.length, withdrawn: [ME] }); }, [bus, sim.withdrawn, votersForAccused.length]);

  // ══ الدقّات ══
  const next = useCallback(() => setBi(i => i + 1), []);
  const ensureHub = () => { if (!has(SEL.hub)) requestHub(); };
  const closeSheets = () => pressEscape();
  const teamSeen = useRef(false);

  const beats: Beat[] = [
    // ── الغرفة ──
    {
      id: 'lobby', enter: () => patch({ phase: 'LOBBY', assigned: false, hall: null }),
      layer: () => ({ target: SEL.top, text: P('أنت في الغرفة. في الأعلى رقم مقعدك، والمرحلة الجارية، واسم الغرفة. هذا الشريط لا يغيب طوال اللعبة.') }),
    },
    {
      id: 'hall', enter: () => patch({ hall: 'seats' }),
      layer: () => ({ target: SEL.hall, text: P('في النادي شاشةٌ كبيرة تعرض ما يخصّ الجميع: من جلس، ومن خرج، ومن يتكلّم. في التدريب أضعها لك هنا.', 'القاعدة: ما للجميع على الشاشة، وما لك وحدك في هاتفك.') }),
    },
    // ── الدور ──
    {
      id: 'card', enter: () => patch({ phase: 'ROLE_BINDING', assigned: true, hall: null }),
      layer: () => ({ target: SEL.card, pos: 'top', wait: 'غطِّ الشاشة بكفّك، واضغط البطاقة مطوّلاً' }),
      until: () => has(SEL.cardOpen),
    },
    {
      id: 'card-open',
      layer: () => ({ target: SEL.card, pos: 'top', whisper: true, text: P(`أنت ${rn}. ${info?.oneLiner || ''}`), wait: 'المس البطاقة مرّةً لتعيدها' }),
      until: () => !has(SEL.cardOpen),
    },
    { id: 'card-done', layer: () => ({ pos: 'top', text: P('هكذا تراجع دورك قبل بدء اللعب. البطاقة تعود وحدها بعد خمس عشرة ثانية، وإن خرجتَ من التطبيق.') }) },
    { id: 'hub', layer: () => ({ target: SEL.navGame, pos: 'mid', wait: 'الزرّ الذهبيّ صار «اللعبة» — المسه' }), until: () => has(SEL.hub) },
    {
      id: 'hub-open', enter: ensureHub,
      layer: () => ({ target: SEL.hub, pos: 'top', text: P('أدواتك الستّ: الفريق، مهامّي، المفكّرة لتدوين شكوكك، المنيو لتطلب وأنت في مقعدك، دليل الأدوار، والخروج.') }),
    },
    { id: 'tasks-tile', enter: ensureHub, layer: () => ({ target: SEL.tileTasks, pos: 'top', wait: 'افتح «مهامّي»' }), until: () => has(SEL.hold) },
    {
      id: 'tasks-hold',
      layer: () => ({ target: SEL.hold, pos: 'top', text: P('هنا دورك وما تفعله في كلّ مرحلة. تُفتح في أعلى الشاشة وتُغلق بزرّ «إخفاء».'), wait: 'اضغط مطوّلاً على البطاقة' }),
      until: () => has(SEL.peek), back: () => !has(SEL.hold) && !has(SEL.peek),
    },
    { id: 'tasks-peek', layer: () => null, until: () => !has(SEL.peek) },
    {
      id: 'tasks-done', enter: closeSheets,
      layer: () => ({ pos: 'mid', text: P('في اللعب الحقيقيّ كلّ فتحٍ لـ«مهامّي» ينبّه الموجّه، فلا تفتحها بلا حاجة. في التدريب افتحها ما شئت.') }),
    },
    { id: 'team-tile', enter: () => { teamSeen.current = false; ensureHub(); }, layer: () => ({ target: SEL.tileTeam, pos: 'top', wait: 'افتح «الفريق»' }), until: () => has(SEL.team) },
    {
      id: 'team-press',
      layer: () => ({ target: SEL.teamBtn, pos: 'top', wait: 'اضغط الزرّ الأحمر مع الاستمرار، ثمّ ارفع إصبعك' }),
      until: () => { if (has(SEL.teamOn)) { teamSeen.current = true; return false; } return teamSeen.current; },
      back: () => !has(SEL.team),
    },
    {
      id: 'team-done',
      layer: () => ({
        pos: 'top', text: P(S.isMafia(R)
          ? 'هؤلاء شركاؤك، ولا يظهرون إلّا وإصبعك على الزرّ. جارك المواطن يفتح الشاشة نفسها ويرى «ملفٌّ مغلق».'
          : 'لستَ من المافيا، فالملفّات مغلقة. لكنّ عدد الخانات وشكل الشاشة واحدٌ عند الجميع — فلا يعرف جارك من أنت.'),
      }),
    },
    {
      id: 'roles-tile', enter: () => { closeSheets(); window.setTimeout(ensureHub, 260); },
      layer: () => ({ target: SEL.tileRoles, pos: 'top', wait: 'افتح «الأدوار»' }), until: () => simRef.current.rolesOpen,
    },
    {
      id: 'roles',
      layer: () => ({ dim: false, pos: 'top', text: P('كروت الأدوار الموجودة على هذه الطاولة. قبل بدء اللعبة ترى الأدوار كلّها، وبعده أدوار طاولتك فقط.') }),
      onNext: () => { patch({ rolesOpen: false }); next(); },
    },

    // ── الليل ──
    {
      id: 'night-intro', enter: () => { closeSheets(); patch({ phase: 'NIGHT', hall: 'night', rolesOpen: false, oneNight: null, oneNightSent: false, pick: undefined }); },
      layer: () => ({ pos: 'bottom', text: P('في الليل يُسأل الجميع السؤال نفسه في اللحظة نفسها، ويختار الجميع: من له قدرة ومن ليس له.', 'هكذا لا يعرف جارك هل اختيارك حقيقيّ أم تمويه.') }),
    },
    {
      id: 'night-ask',
      enter: () => patch({
        hall: null, oneNightSent: false,
        oneNight: {
          deadline: Date.now() + 120_000,
          steps: [{ abilityId: S.hasNightAbility(R) ? 'TRAINING' : null, ask: '-', canSkip: R === 'SNIPER', targets: S.allowedTargets(R).map(s => ({ physicalId: s, name: nameOf(s), avatarUrl: null })) }],
        },
      }),
      layer: () => null, until: () => simRef.current.oneNightSent,
    },
    { id: 'night-sent', layer: () => ({ dim: false, pos: 'top', text: P('انتهى دورك الليلة. الليل ينتهي للجميع معاً، فلا يُعرف من تأخّر.') }) },

    // ── الصباح ──
    {
      id: 'morning', enter: () => { const n = S.resolveNight(R, simRef.current.pick); patch({ phase: 'MORNING_RECAP', oneNight: null, dead: n.dead, hall: 'morning' }); },
      layer: () => ({ target: SEL.msg, pos: 'low', text: P('ما جرى في الليل يُعلن للجميع على شاشة القاعة. وهاتفك يحمل «رسالة الليل»: تصل كلّ الهواتف معاً.'), wait: 'اضغط عليها مطوّلاً' }),
      until: () => has(SEL.peek),
    },
    { id: 'morning-peek', layer: () => null, until: () => !has(SEL.peek) },
    {
      id: 'morning-done',
      layer: () => ({
        pos: 'low', whisper: true, text: R === 'SHERIFF'
          ? P('نتيجة تحقيقك لك وحدك: جارك فتح الإطار نفسه ووجد «لا جديد». وتبقى محفوظةً في «مهامّي».')
          : P('كلّ الهواتف فتحت الإطار نفسه؛ من له نتيجةٌ وجدها، والباقون وجدوا «لا جديد».', S.nightOutcomeText(R, night, nameOf)),
      }),
    },

    // ── النهار ──
    {
      id: 'disc', enter: () => patch({ phase: 'DAY_DISCUSSION', hall: null, speaker: alive(3) ? 3 : 7, speakerAt: Date.now(), speaking: true }),
      layer: () => ({
        target: SEL.speaker, pos: 'bottom',
        text: <>{P('النقاش: يتكلّم اللاعبون بالدور والموجّه يضبط الوقت. الحلقة حول الرقم ما بقي من وقت المتحدّث.')}{R === 'SILENCER' && night.pick ? <p className="tip">{nameOf(night.pick)} لن يُعطى الكلمة اليوم — أسكتَّه أنت.</p> : null}</>,
      }),
    },
    {
      id: 'disc-me', enter: () => patch({ speaker: ME, speakerAt: Date.now(), speaking: true }),
      layer: () => ({
        target: SEL.myTurn, pos: 'low', whisper: true,
        text: <>{P('حين يصل الدور إليك يضيء هاتفك بهذا التنبيه، وتتكلّم حتى ينتهي وقتك.')}{info?.phaseNotes?.discussion ? <p className="tip">نصيحة لدورك: {info.phaseNotes.discussion}</p> : null}</>,
      }),
    },
    // ⚔️ المواجهة
    {
      id: 'conf-btn', enter: () => patch({ speaker: alive(6) ? 6 : 8, speakerAt: Date.now(), speaking: true }),
      layer: () => ({ target: SEL.confReq, pos: 'top', text: P('المواجهة: تتّهم لاعباً وجهاً لوجه أمام القاعة. تطلبها من هاتفك أثناء النقاش، ورصيدك مواجهةٌ واحدة في اللعبة.'), wait: 'اضغط «اطلب مواجهة»' }),
      until: () => has(SEL.confSheet) || simRef.current.conf.some(c => c.id === 'c-me'),
    },
    {
      id: 'conf-sheet',
      layer: () => ({
        dim: false, pos: 'top', whisper: true, wait: 'اختر خصمك ثمّ أرسل الطلب',
        text: P(S.isMafia(R)
          ? 'لا تواجه شريكك: إن خرج بالتصويت خُصم منك. واجه مواطناً؛ مواجهة المافيا لمواطن لا تكسب ولا تخسر.'
          : `واجه ${nameOf(defConf)} #${defConf} ثمّ صوّت عليه. إن خرج بالتصويت وكان مافيا رأيتَ مكافأتك آخر النهار.`),
      }),
      until: () => simRef.current.conf.some(c => c.id === 'c-me'),
      back: () => !has(SEL.confSheet) && !simRef.current.conf.some(c => c.id === 'c-me'),
    },
    {
      id: 'conf-wait', layer: () => ({ target: SEL.confBox, pos: 'top', wait: 'أمامه عشرون ثانية ليقبل أو يرفض' }),
      until: () => simRef.current.conf.some(c => c.id === 'c-me' && c.status === 'ACCEPTED'),
    },
    {
      id: 'conf-accepted',
      layer: () => ({ target: SEL.confBox, pos: 'top', text: P('قبِل. تُنفَّذ المواجهة بعد آخر متحدّث وقبل التصويت، والموجّه يبدؤها.', 'لو رفض لأُعلن رفضه على شاشة القاعة، ولبقي رصيدك لك.') }),
    },
    {
      id: 'conf-incoming',
      enter: () => {
        const q = [10, 2, 1, 4, 8].find(alive) ?? 10;
        const item: ConfItem = { id: 'c-in', round: 1, requesterPhysicalId: q, targetPhysicalId: ME, status: 'PENDING', createdAt: Date.now(), respondBy: Date.now() + 20000, stageSeconds: 60 };
        setSim(x => ({ ...x, incomingAns: null, incomingFrom: q, conf: [...x.conf.filter(c => c.id !== 'c-in'), item] }));
      },
      layer: () => ({ target: SEL.confBox, pos: 'top', text: P('وقد يطلب غيرُك مواجهتك. أمامك عشرون ثانية؛ وإن انقضت بلا جواب صار القرار للموجّه.'), wait: 'اختر: أقبل أو أرفض' }),
      until: () => !!simRef.current.incomingAns,
    },
    {
      id: 'conf-incoming-done', enter: () => { if (simRef.current.incomingAns === 'no') patch({ hall: 'declined' }); },
      layer: () => (sim.incomingAns === 'no'
        ? { target: SEL.hall, pos: 'bottom', text: P('رفضتَ، فأُعلن رفضك على شاشة القاعة أمام الجميع، والقاعة تفسّره كما تشاء. رصيد صاحب الطلب لا يُستهلك.') }
        : { target: SEL.confBox, pos: 'top', text: P('قبلتَ: تتواجهان بعد آخر متحدّث وتتكلّمان معاً بمؤقّتٍ واحد. هذه حالةٌ للتجربة فقط، فلن تُنفَّذ في جولتنا.') }),
    },
    {
      id: 'deals', enter: () => setSim(x => ({ ...x, hall: null, conf: x.conf.filter(c => c.id !== 'c-in') })),
      layer: () => ({ target: SEL.deals, pos: 'top', text: P('الاتفاقيّة رهانٌ تعقده في النقاش على لاعبٍ تظنّه مافيا، فيظهر رهانك مرشّحاً في التصويت. تُفتح من الجولة الثانية، وشروط ربحها وخسارتها في «حسابي».') }),
    },
    {
      id: 'conf-live',
      enter: () => setSim(x => {
        const t = x.confTarget ?? S.defaultConfTarget(R, S.resolveNight(R, x.pick));
        const mine = x.conf.find(c => c.id === 'c-me');
        const base: ConfItem = mine || { id: 'c-me', round: 1, requesterPhysicalId: ME, targetPhysicalId: t, status: 'ACCEPTED', createdAt: Date.now(), respondBy: Date.now(), stageSeconds: 60 };
        return { ...x, confTarget: t, speaking: false, hall: 'conf-me', conf: [...x.conf.filter(c => c.id !== 'c-me'), { ...base, status: 'LIVE', stageStartedAt: Date.now(), stageSeconds: 60 }] };
      }),
      layer: () => ({ target: SEL.confBox, pos: 'low', text: P('بعد آخر متحدّث يبدأ الموجّه مواجهتك: تتكلّمان معاً بمؤقّتٍ واحد، والقاعة تصوّت من هواتفها لمن أقنعها. الأصوات سرّيّة، وتظهر نسبتها على الشاشة فقط.') }),
    },
    {
      id: 'conf-pulse',
      enter: () => setSim(x => {
        const live = (s: number) => !x.dead.includes(s);
        const a = [4, 1, 10, 8, 2].find(live) ?? 4;
        const b = [3, 7, 9, 6, 2, 8].find(s => live(s) && s !== a && s !== x.confTarget) ?? 3;
        const item: ConfItem = { id: 'c-bots', round: 1, requesterPhysicalId: a, targetPhysicalId: b, status: 'LIVE', createdAt: Date.now(), respondBy: Date.now(), stageSeconds: 60, stageStartedAt: Date.now() };
        return { ...x, pulse: null, bots: { a, b }, hall: 'conf-bots', conf: [...x.conf.filter(c => c.id !== 'c-bots').map(c => (c.id === 'c-me' ? { ...c, status: 'DONE' as const, timeUp: true } : c)), item] };
      }),
      layer: () => ({ target: SEL.confBox, pos: 'low', text: P('وحين يتواجه غيرُك فأنت من القاعة: هاتفك يسألك من أقنعك أكثر.'), wait: 'اختر أحد الطرفين' }),
      until: () => !!simRef.current.pulse,
    },
    {
      id: 'conf-pulse-done',
      layer: () => ({ target: SEL.confBox, pos: 'low', open: true, text: P('صوتك سرّيّ، وتغيّره حتى يُغلق الموجّه المواجهة. على الشاشة يظهر مجموع القاعة فقط. والحدّ مواجهتان مقبولتان في الجولة.') }),
    },
    // 🗳️ التصويت
    {
      id: 'vote',
      enter: () => setSim(x => ({ ...x, phase: 'DAY_VOTING', hall: null, speaker: null, vote: null, votingCountdown: 60, conf: x.conf.map(c => (c.status === 'LIVE' ? { ...c, status: 'DONE' as const } : c)) })),
      layer: () => null, until: () => simRef.current.vote != null,
    },
    {
      id: 'vote-done',
      layer: () => ({
        dim: false, pos: 'top',
        text: <>{P('وصل صوتك، وتغييره مسموحٌ حتى يُغلق الموجّه التصويت. الأرقام الصغيرة تحت كلّ مرشّح مقاعد من صوّتوا عليه.')}{info?.phaseNotes?.voting ? <p className="tip">نصيحة لدورك: {info.phaseNotes.voting}</p> : null}</>,
      }),
    },
    // ⚖️ التبرير وسحب الصوت
    {
      id: 'just', enter: () => patch({ phase: 'DAY_JUSTIFICATION', votingCountdown: null, withdrawn: false, just: { ended: false, startedAt: Date.now() } }),
      layer: () => ({
        target: SEL.accused, pos: 'low',
        text: <>{P('صاحب أعلى الأصوات يبرّر، وترى من صوّت عليه بالاسم. زرّ سحب الصوت يظهر حين ينتهي وقت التبرير.')}{info?.phaseNotes?.justification ? <p className="tip">نصيحة لدورك: {info.phaseNotes.justification}</p> : null}</>,
      }),
      onNext: () => { setSim(x => ({ ...x, just: x.just ? { ...x.just, ended: true } : x.just })); next(); },
    },
    {
      id: 'withdraw',
      layer: () => ({
        target: SEL.withdraw, open: true,
        text: sim.withdrawn
          ? P('سُحب صوتك وشُطب اسمك من قائمة المصوّتين أمام الجميع. إن بلغ السحب نصف الأصوات أُعيد التصويت، وإلّا نُفّذ القرار.')
          : <>{P('انتهى التبرير، فظهر زرّ «سحب صوتي» — لمن صوّت على المتّهم فقط. إن سُحب نصف الأصوات أو أكثر أُعيد التصويت.')}<p className="tip">جرّبه، أو اثبت على صوتك واضغط «التالي».</p></>,
      }),
    },
    // 💀 الإقصاء
    {
      id: 'pending', enter: () => patch({ phase: 'ELIMINATION_PENDING', revealed: false, hall: 'flip' }),
      layer: () => ({
        target: SEL.hall, pos: 'bottom',
        text: <>{P('هاتفك لا يعرف من خرج قبل أن تُقلب بطاقته على شاشة القاعة. هكذا تبقى العيون على الشاشة لا على الهواتف.')}{R === 'MAYOR' ? <p className="tip">لحظة العمدة هنا: تطلب من الموجّه وقف الإعدام بصوتك. هاتفك لا يعرض خياراً — وعند الجميع «القرار عند الموجّه».</p> : null}</>,
      }),
    },
    {
      id: 'elim', enter: () => setSim(x => ({ ...x, revealed: true, hall: null, dead: Array.from(new Set([...x.dead, S.ballot(S.resolveNight(R, x.pick), x.vote).acc])) })),
      layer: () => ({ target: SEL.teams, pos: 'low', text: P(`خرج ${nameOf(acc)} وكان ${roleName(table[acc])}. عدّاد الفرق في الأعلى نقص واحداً.`) }),
    },
    {
      id: 'elim-conf',
      layer: () => ({ dim: false, pos: 'low', whisper: true, text: P(S.confOutcomeText(R, sim.confTarget ?? defConf, acc), 'ثمّ ليلٌ جديد ونهارٌ جديد، حتى يحسم فريق.') }),
    },
    // ── الختام ──
    {
      id: 'dead', enter: () => patch({ phase: 'NIGHT', meDead: true, oneNight: null, hall: null }),
      layer: () => ({
        dim: false, pos: 'bottom',
        text: <>{P('ولو خرجتَ أنت؟ تبقى في مقعدك وتتابع بصمت. «مهامّي» و«الفريق» يُقفلان، والتصويت يصير مشاهدةً فقط.')}{info?.phaseNotes?.dead ? <p className="tip">دورك بعد الخروج: {info.phaseNotes.dead}</p> : null}</>,
      }),
    },
    {
      id: 'over', enter: () => patch({ phase: 'GAME_OVER', meDead: false, over: true }),
      layer: () => ({
        dim: false, pos: 'low', nextLabel: 'أنهِ الجولة',
        text: P(`في النهاية تُكشف أدوار الجميع. ${S.teamOf(R) === 'CITIZEN' ? 'فريقك ربح هذه المرّة.' : 'فريق المواطنين ربح هذه المرّة، وهكذا تبدو النهاية حين لا تكون منهم.'}`, 'في اللعب الحقيقيّ تُضاف نقاطك إلى خبرتك ورتبتك. التدريب لا يُحتسب.'),
      }),
      onNext: () => { guide.finish(); setGrad(true); },
    },
  ];
  const beatsRef = useRef(beats); beatsRef.current = beats;
  const biRef = useRef(bi); biRef.current = bi;
  const beat = beats[Math.min(bi, beats.length - 1)];
  const inRoom = pre === 'room';

  // دخول الدقّة: تضبط المشهد مرّةً
  useEffect(() => {
    if (!inRoom) return;
    beatsRef.current[Math.min(bi, beatsRef.current.length - 1)]?.enter?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bi, inRoom]);

  // متى تنتهي الدقّة؟
  useEffect(() => {
    if (!inRoom || grad) return;
    const t = setInterval(() => {
      const b = beatsRef.current[Math.min(biRef.current, beatsRef.current.length - 1)];
      if (!b) return;
      if (b.until?.()) { setBi(i => Math.min(i + 1, beatsRef.current.length - 1)); return; }
      if (b.back?.()) setBi(i => Math.max(0, i - 1));
    }, 150);
    return () => clearInterval(t);
  }, [bi, inRoom, grad]);

  const layer = inRoom && !grad ? beat.layer() : null;
  const onNext = () => { if (beat.onNext) beat.onNext(); else next(); };
  const skipStep = () => setBi(i => Math.min(i + 1, beats.length - 1));

  // ── إعادة الغرفة بدورٍ آخر ──
  const restartWith = (role: string) => {
    guide.setRole(role);
    pressEscape();
    setSim(INIT); setGrad(false); setPickRole(false);
    setBi(beats.findIndex(b => b.id === 'card'));
  };

  // ── نافذة القاعة ──
  const face = (roleId: string) => faceOf(roleId) || '';
  const hall = (() => {
    if (!sim.hall) return null;
    let body: ReactNode = null, cls = '';
    if (sim.hall === 'seats') body = <div><h6>اكتملت الطاولة</h6><div className="gd-hall-seats">{S.SEATS.map(s => <span key={s} className={s === ME ? 'me' : ''}>{s}</span>)}</div><p>١٠ من ١٠ في مقاعدهم</p></div>;
    else if (sim.hall === 'night') { cls = 'night'; body = <div><h6>المدينة نائمة</h6><p>ضربةٌ لكلّ دور بجدولٍ ثابت — لا يُعرف من اختار ولا متى.</p></div>; }
    else if (sim.hall === 'morning') body = (
      <div><h6>تقرير الصباح</h6>
        {night.dead.length === 0 ? <p>ليلةٌ بلا ضحايا — الجميع على الطاولة.</p> : night.dead.map(s => (
          <div key={s} className="gd-hall-line">{face(table[s]) && <img src={face(table[s])} alt="" />}<span>خرج #{s} {nameOf(s)} — {roleName(table[s])}</span></div>
        ))}
      </div>
    );
    else if (sim.hall === 'conf-me') { const t = sim.confTarget ?? defConf; body = <div><h6>⚔️ مواجهة</h6><div className="gd-hall-vs"><b>{myName} #{ME}</b><i>✕</i><b>{nameOf(t)} #{t}</b></div><div className="gd-hall-bar"><i style={{ width: '62%' }} /></div><p>نبض القاعة: ٦٢٪ لك</p></div>; }
    else if (sim.hall === 'conf-bots' && sim.bots) { const pct = sim.pulse === 'REQ' ? 64 : sim.pulse === 'TGT' ? 52 : 58; body = <div><h6>⚔️ مواجهة</h6><div className="gd-hall-vs"><b>{nameOf(sim.bots.a)} #{sim.bots.a}</b><i>✕</i><b>{nameOf(sim.bots.b)} #{sim.bots.b}</b></div><div className="gd-hall-bar"><i style={{ width: `${pct}%` }} /></div><p>نبض القاعة: {arNum(pct)}٪ لـ{nameOf(sim.bots.a)}</p></div>; }
    else if (sim.hall === 'declined') body = <div><h6>🚫 رُفضت المواجهة</h6><p>{myName} #{ME} رفض مواجهة {sim.incomingFrom ? `${nameOf(sim.incomingFrom)} #${sim.incomingFrom}` : 'لاعب'}</p></div>;
    else if (sim.hall === 'flip') body = <div><div className="gd-flip"><div><span>{acc}</span>{face(table[acc]) && <img src={face(table[acc])} alt="" />}</div></div><p>تُقلب البطاقة على الشاشة أوّلاً</p></div>;
    return (
      <section className="gd-hall" data-guide="hall" aria-label="شاشة القاعة">
        <div className="gd-hall-l"><span>شاشة القاعة</span><i>في النادي تراها على الحائط</i></div>
        <div className={`gd-hall-s ${cls}`}>{body}</div>
      </section>
    );
  })();

  // ── ما قبل الغرفة: شاشات الدخول الحقيقيّة بنصوصها ──
  if (!guide.me?.enabled) {
    return <div className="min-h-screen flex items-center justify-center bg-[#050505]"><div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" /></div>;
  }

  if (!inRoom) {
    return (
      <div className="min-h-screen flex flex-col items-center font-sans relative overflow-hidden display-bg blood-vignette justify-center p-4 sm:p-6" dir="rtl" style={{ paddingBottom: 'calc(var(--nav-h) + 16px)' }}>
        <div className="flex items-center justify-center gap-4 mb-8 relative z-10 w-full max-w-md">
          <h1 className="text-center">
            <span className="block text-4xl font-black tracking-tight text-[#C5A059]" style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 30px rgba(138,3,3,0.4)' }}>MAFIA</span>
            <span dir="ltr" className="flex justify-between text-xl font-light text-[#8A0303] mt-1 w-full" style={{ fontFamily: 'Amiri, serif' }}>{'CLUB'.split('').map((l, i) => <span key={i}>{l}</span>)}</span>
          </h1>
          <Image src="/mafia_logo.png" alt="" width={60} height={60} className="select-none w-[60px] h-[60px]" priority />
        </div>
        <div className="w-full rounded-xl backdrop-blur-md relative z-10 max-w-md p-8 sm:p-10 bg-black/50 border border-[#2a2a2a] shadow-[0_0_40px_rgba(0,0,0,0.8)]">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#8A0303]/60 to-transparent opacity-80 rounded-t-xl" />
          {pre === 'joining' && (
            <div className="text-center py-10">
              <div className="w-16 h-16 border-[3px] border-[#C5A059]/30 border-t-[#C5A059] rounded-full animate-spin mx-auto mb-6" />
              <h2 className="text-xl font-black text-white mb-2" style={{ fontFamily: 'Amiri, serif' }}>جاري تخصيص مقعدك...</h2>
              <p className="text-[#808080] text-sm" style={{ fontFamily: 'Amiri, serif' }}>يتم اختيار أفضل مقعد لك</p>
            </div>
          )}
          {pre === 'photo' && (
            <div>
              <div className="text-center mb-6 border-b border-[#2a2a2a]/40 pb-6">
                <h2 className="text-2xl font-black mb-2 text-white" style={{ fontFamily: 'Amiri, serif' }}>📸 نصوّر الليلة لصفحات النادي</h2>
                <p className="text-[#9a9a9a] text-[14px] leading-relaxed" style={{ fontFamily: 'Amiri, serif' }}>تقبل أن تظهر في الصور والفيديو؟ إن لم تقبل نُجلسك في زاوية لا تُصوَّر.</p>
              </div>
              <div className="space-y-3 mb-6" role="radiogroup" data-guide="pre-photo">
                {([{ v: true, label: '✓ نعم، لا مانع', on: 'bg-emerald-900/25 border-emerald-500/60 text-emerald-300' }, { v: false, label: '📵 لا، أفضّل ما أظهر', on: 'bg-sky-900/25 border-sky-500/60 text-sky-300' }] as const).map(o => (
                  <button key={String(o.v)} type="button" role="radio" aria-checked={photo === o.v} onClick={() => setPhoto(o.v)}
                    className={`w-full min-h-[56px] px-4 rounded-xl border-2 text-[16px] font-bold transition-all ${photo === o.v ? o.on : 'bg-black/40 border-[#2a2a2a] text-[#bdbdbd]'}`}
                    style={{ fontFamily: 'Amiri, serif' }}>{o.label}</button>
                ))}
              </div>
              <button type="button" onClick={() => setPre('seat')} disabled={photo === null} className="btn-premium w-full min-h-[48px] !text-[15px] disabled:opacity-50 !rounded-lg"><span>متابعة</span></button>
              <p className="text-[#808080] text-[12.5px] text-center mt-4" style={{ fontFamily: 'Amiri, serif' }}>جوابك محفوظ وتقدر تغيّره من الغرفة أيّ وقت.</p>
            </div>
          )}
          {pre === 'seat' && (
            <div>
              <div className="text-center mb-6 border-b border-[#2a2a2a]/40 pb-6">
                <div className="text-4xl mb-3">🪑</div>
                <h2 className="text-2xl font-black mb-2 text-white" style={{ fontFamily: 'Amiri, serif' }}>اختر رقم مقعدك</h2>
                <p className="text-[#9a9a9a] text-[14px] leading-relaxed" style={{ fontFamily: 'Amiri, serif' }}>اكتب رقم الكرسي الذي تريد الجلوس عليه (من 1 إلى 10)</p>
              </div>
              <div className="w-full px-5 py-4 mb-4 bg-black/40 border border-[#2a2a2a] rounded-xl text-center text-white text-3xl font-mono tracking-[0.2em] min-h-[68px]" dir="ltr" aria-label="رقم المقعد">{seat}</div>
              <div className="mb-5">
                <p className="text-[#808080] text-[12.5px] text-center mb-2" style={{ fontFamily: 'Amiri, serif' }}>المقاعد المتاحة الآن:</p>
                <div className="flex flex-wrap justify-center gap-2" dir="ltr" data-guide="pre-seat">
                  <button type="button" onClick={() => setSeat(String(ME))}
                    className={`min-w-[44px] min-h-[44px] px-2 rounded-lg border text-[15px] font-mono font-bold transition-all ${seat === String(ME) ? 'bg-[#C5A059]/20 border-[#C5A059] text-[#C5A059]' : 'bg-black/40 border-[#2a2a2a] text-[#bdbdbd]'}`}>{ME}</button>
                </div>
              </div>
              <button type="button" onClick={() => setPre('room')} disabled={!seat} className="btn-premium w-full min-h-[48px] !text-[15px] disabled:opacity-50 !rounded-lg"><span>اجلس في هذا المقعد</span></button>
            </div>
          )}
        </div>
        {/* بطاقةٌ نحيلة في الأعلى: لا تغطّي زرّ المتابعة على الهواتف القصيرة */}
        {pre === 'photo' && <GuideLayer step={{ dim: false, pos: 'top', wait: photo === null ? 'يُسأل في ليالي التصوير — لك أن ترفض بلا حرج. اختر جواباً' : 'اضغط «متابعة»' }} onLater={guide.defer} />}
        {pre === 'seat' && <GuideLayer step={{ dim: false, pos: 'top', wait: seat ? 'اضغط «اجلس في هذا المقعد»' : 'رقم مقعدك اسمك في اللعبة. بقي مقعدٌ واحد: اختره' }} onLater={guide.defer} />}
      </div>
    );
  }

  // ── الغرفة ──
  const counts = S.teamCounts(R, sim.dead);
  const role = sim.assigned ? R : null;
  const mafiaTeam = role && S.isMafia(role) ? S.mates(role).map(s => ({ physicalId: s, name: nameOf(s), role: table[s], avatarUrl: null })) : [];
  const sheriffResults: SheriffResult[] = role === 'SHERIFF' && sim.phase !== 'NIGHT' && sim.phase !== 'ROLE_BINDING' && night.pick
    ? [{ round: 1, result: night.sheriffMafia ? 'MAFIA' : 'CITIZEN', targetPhysicalId: night.pick, targetName: nameOf(night.pick) }] : [];
  const afterNight = !['LOBBY', 'ROLE_BINDING', 'NIGHT'].includes(sim.phase) || sim.meDead;
  const contractsDone = afterNight && night.contract ? 1 : 0;

  const host: RoomHost = {
    roomCode: S.ROOM_CODE, gameName: S.GAME_NAME,
    seat: ME, displayName: myName, gender: undefined, avatarUrl: null,
    role, isDead: sim.meDead, phase: sim.phase, round: sim.phase === 'LOBBY' ? null : 1,
    teamCounts: sim.phase === 'LOBBY' ? null : counts,
    roster, watermark: `${myName} · مقعد ${ME} · ${S.ROOM_CODE} · تدريب`,
    oneNight: sim.oneNight, oneNightSent: sim.oneNightSent,
    submitOneNight: async (picks) => { patch({ pick: picks[0]?.targetPhysicalId ?? null, oneNightSent: true }); return true; },
    nightAsk: null, nightCountdown: null, nightSubmitted: false, submitNightAction: () => {},
    candidates, playersInfo: roster, myVote: myVoteIndex >= 0 ? myVoteIndex : null, playerVotes,
    votingCountdown: sim.votingCountdown, voteSubmitting: false,
    castVote: async (index: number) => {
      const target = ballot.cands[index];
      if (!target || target === ME) return 'لا يمكنك التصويت لنفسك';
      patch({ vote: target });
      return null;
    },
    mafiaTeam, sibling: role === 'OLDER_BROTHER' ? { physicalId: 8, name: nameOf(8) } : null,
    assassinContracts: role === 'ASSASSIN' ? {
      contracts: ['🔪 اغتل الشريف', '🔪 اغتل الطبيب', '🔪 اغتل شيخ المافيا'].map((d, i) => ({ id: i + 1, descriptionAr: d, completed: i < contractsDone })),
      completedCount: contractsDone, totalRequired: 3, currentIndex: contractsDone,
    } : null,
    sheriffResults,
    cartCount: 0,
    openRoles: () => patch({ rolesOpen: true }),
    openNotes: () => say('المفكّرة تعمل في اللعب الحقيقيّ: تدوّن فيها شكوكك عن كلّ مقعد.'),
    openOrder: () => say('المنيو يفتح في اللعب الحقيقيّ: تطلب وأنت في مقعدك ويصلك الطلب.'),
    closeOrder: () => {}, onGalleryOpen: () => {},
    // في التدريب لا موجّه يُنبَّه — والمُقصى تُقفل عنه المهامّ كما في اللعب
    requestTasksOpen: async () => (sim.meDead ? { ok: false, error: 'انتهت جولتُك — لا تُفتح المهامّ بعد الإقصاء.' } : { ok: true }),
    leave: guide.defer,
    topSlot: hall,
    nightHint: beat.id === 'night-ask' ? <InlineWhisper>{S.nightHint(R).text}</InlineWhisper> : null,
    voteHint: beat.id === 'vote' ? <InlineWhisper label="الدون" flow>المس مرشّحاً واحداً. صوتك يظهر للجميع برقم مقعدك. وفي التدريب تميل القاعة مع صوتك لترى ما يترتّب عليه.</InlineWhisper> : null,
    phaseView: (
      <PlayerPhaseView
        gamePhase={sim.phase} physicalId={String(ME)} assignedRole={role} isPlayerDead={sim.meDead}
        on={bus.on} emit={emit} myVote={myVoteIndex >= 0 ? myVoteIndex : null} votingCandidates={candidates} votingPlayersInfo={roster}
        pollData={poll} roomId="guide" isRemote={false} v2 avatarOf={() => null} faceOf={faceOf}
      />
    ),
  };

  return (
    <div className="min-h-screen font-sans relative overflow-x-hidden display-bg blood-vignette" style={{ paddingBottom: 'calc(var(--nav-h) + 16px)' }}>
      <PlayerRoomBoundary onFail={() => { say('تعذّر عرض غرفة التدريب على هذا الجهاز.'); guide.defer(); }}>
        <PlayerRoom host={host} />
      </PlayerRoomBoundary>

      <RolesDeck open={sim.rolesOpen} onClose={() => patch({ rolesOpen: false })} roleIds={S.rolesInPlay(R)} />

      {layer && (
        <GuideLayer step={layer} count={`${arNum(Math.min(bi, beats.length - 1) + 1)}/${arNum(beats.length)}`}
          onNext={onNext} onPrev={null} onLater={guide.defer} onSkip={skipStep} />
      )}
      <GuideToast text={toast} />

      {grad && !pickRole && (
        <DonSheet title="أتممتَ ليلتك الأولى">
          <p>عرفتَ الباب والحجز والمقعد، ولعبتَ ليلةً ونهاراً بدور {rn}. الطاولة الحقيقيّة بانتظارك.</p>
          <button type="button" className="go" onClick={guide.leaveRoom}>احجز ليلتك الحقيقيّة</button>
          <button type="button" className="lt" onClick={() => setPickRole(true)}>جرّب دوراً آخر</button>
        </DonSheet>
      )}
      {grad && pickRole && (
        <DonSheet title="أيّ دورٍ تجرّب؟">
          <p>الشاشة العامّة واحدةٌ لكلّ الأدوار. ما يتبدّل بطاقتك، ومحتوى «مهامّي»، ومعنى اختيارك في الليل.</p>
          <div className="roles">
            {S.PLAYABLE_ROLES.map(r => <button key={r} type="button" aria-pressed={r === R} onClick={() => restartWith(r)}>{roleName(r)}</button>)}
          </div>
          <button type="button" className="lt" onClick={() => setPickRole(false)}>رجوع</button>
        </DonSheet>
      )}
    </div>
  );
}
