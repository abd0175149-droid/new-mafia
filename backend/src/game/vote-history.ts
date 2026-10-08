// ══════════════════════════════════════════════════════
// 🗳️ سجلّ التصويت — كلُّ جولة تصويتٍ في اللعبة محفوظةٌ ليعود إليها اللاعب (قرار المالك 2026-10-08)
// ══════════════════════════════════════════════════════
// التصويتُ علنيّ أصلاً: `day:vote-update` يبثّ playerVotes للغرفة كلّها والورقةُ الحيّة ترسم
// المصوّتين. لكنّ playerVotes يُمحى مع كلّ نهارٍ وتعادلٍ وسحبٍ وإعادةِ عمدة — فلا يبقى شيء.
// هنا نلتقط الجولة لحظةَ الفرز ونُلحق بها ما يحدث بعدها (مَن سحب، قرار التعادل/العمدة، المُقصى).
//
// القواعد المقفلة:
//   • يراه كلُّ من في الغرفة (حيّ، مُقصى، متفرّج) — هم من يرون الورقة الحيّة.
//   • الصوتُ النهائيّ وحده، كما تعرضه الورقة الحيّة — لا تبديلاتُ أثناء الجولة.
//   • الهاتف وحده (لا شاشة القاعة)، ويُحفظ مع المباراة لسجلّ المباريات.
//
// 🔒 لا يقرأ منه أيّ منطقٍ قائم ولا يكتب في votingState: دوالُّه تضيف إلى `state.voteHistory` فقط.
//    لا أدوار فيه ولا حالةُ حياة ولا شيء من الليل. والمُقصى يُكتب مع «كشف الأدوار» لا قبله.
// 🪑 أسماءُ الحقول تتبع قاعدةَ نقل المقاعد (…PhysicalId، withdrawn، eliminated) فيتبع السجلُّ
//    أصحابَه عند نقل المقاعد، ومعها الاسمُ وقتَ الجولة. (test-seat-remap يغطّيه.)
// ══════════════════════════════════════════════════════

import type { GameState } from './state.js';
import { mayorVoteWeight } from './mayor-engine.js';

export type VoteRoundKind = 'DAY' | 'TIE_REVOTE' | 'TIE_NARROW' | 'WITHDRAWAL_REVOTE' | 'MAYOR_REVOTE' | 'RESTART';
export type VoteOutcomeType =
  | 'ELIMINATED' | 'NO_ELIMINATION' | 'TIE'
  | 'TIE_REVOTE' | 'TIE_NARROW' | 'TIE_CANCEL' | 'TIE_ELIMINATE_ALL'
  | 'WITHDRAWN' | 'MAYOR_SAVED' | 'MAYOR_POSTPONED' | 'RESTARTED';

export interface VoteHistoryVoter {
  voterPhysicalId: number;
  name: string;
  /** وزنُ الصوت لحظةَ الجولة (العمدة المكشوف ×2، وإلّا 1) */
  weight: number;
  /** proxy: سجّله الموجّه باسمه · auto: صوتٌ على نفسه عند انتهاء الوقت (عقوبة) */
  via?: 'proxy' | 'auto';
}

export interface VoteHistoryCandidate {
  type: 'PLAYER' | 'DEAL';
  targetPhysicalId: number;
  name: string;
  initiatorPhysicalId?: number;
  initiatorName?: string;
  /** الأصوات بالوزن (كما في الورقة) */
  votes: number;
  /** الأشخاص */
  people: number;
  /** أشخاصٌ عدّهم الموجّه يدويّاً بلا اسم */
  unnamed: number;
  voters: VoteHistoryVoter[];
}

export interface VoteHistoryOutcome {
  type: VoteOutcomeType;
  eliminated?: number[];
  names?: string[];
  viaDeal?: boolean;
  savedPhysicalId?: number;
  savedName?: string;
  /** للسحب: كم سُحب من كم مطلوب (أصواتٌ موزونة) */
  withdrawnVotes?: number;
  neededVotes?: number;
}

export interface VoteHistoryRound {
  id: string;
  round: number;
  seq: number;
  kind: VoteRoundKind;
  resolvedAt: number;
  shieldedPhysicalId: number | null;
  candidates: VoteHistoryCandidate[];
  /** مَن سحب صوته أثناء التبرير */
  withdrawn: number[];
  outcome: VoteHistoryOutcome | null;
}

export const VOTE_HISTORY_CAP = 40;

const nameOf = (state: GameState, seat: number | null | undefined) =>
  seat == null ? '' : String(state.players.find(p => p.physicalId === seat)?.name || `#${seat}`);

const KIND_AFTER: Partial<Record<VoteOutcomeType, VoteRoundKind>> = {
  TIE_REVOTE: 'TIE_REVOTE', TIE_NARROW: 'TIE_NARROW', WITHDRAWN: 'WITHDRAWAL_REVOTE', MAYOR_SAVED: 'MAYOR_REVOTE',
};

/** يبني صورةَ الجولة الحاليّة من votingState — قراءةٌ فقط */
export function buildVoteRound(state: GameState): Omit<VoteHistoryRound, 'id' | 'seq' | 'kind'> {
  const vs = state.votingState;
  const proxy = vs?.leaderProxyVotes || {};
  const byCand = new Map<number, VoteHistoryVoter[]>();
  for (const [seatStr, idx] of Object.entries(vs?.playerVotes || {})) {
    const seat = Number(seatStr), i = Number(idx);
    const cand: any = vs.candidates?.[i];
    if (!cand) continue;
    const v: VoteHistoryVoter = { voterPhysicalId: seat, name: nameOf(state, seat), weight: mayorVoteWeight(state, seat) };
    if (proxy[seat] !== undefined) v.via = 'proxy';
    else if (cand.type !== 'DEAL' && cand.targetPhysicalId === seat) v.via = 'auto';   // صوتٌ على النفس لا يكون إلّا عقوبة الوقت
    if (!byCand.has(i)) byCand.set(i, []);
    byCand.get(i)!.push(v);
  }
  const candidates: VoteHistoryCandidate[] = (vs?.candidates || []).map((c: any, i: number) => {
    const voters = (byCand.get(i) || []).sort((a, b) => a.voterPhysicalId - b.voterPhysicalId);
    const people = Math.max(Number(c.voters) || 0, voters.length);
    const out: VoteHistoryCandidate = {
      type: c.type === 'DEAL' ? 'DEAL' : 'PLAYER',
      targetPhysicalId: Number(c.targetPhysicalId),
      name: nameOf(state, c.targetPhysicalId),
      votes: Number(c.votes) || 0,
      people,
      unnamed: Math.max(0, people - voters.length),
      voters,
    };
    if (c.type === 'DEAL' && c.initiatorPhysicalId != null) {
      out.initiatorPhysicalId = Number(c.initiatorPhysicalId);
      out.initiatorName = nameOf(state, c.initiatorPhysicalId);
    }
    return out;
  });
  const shield = (state as any).mayorShield;
  return {
    round: state.round || 1,
    resolvedAt: Date.now(),
    shieldedPhysicalId: shield && shield.round === (state.round || 1) ? Number(shield.physicalId) : null,
    candidates,
    withdrawn: [],
    outcome: null,
  };
}

const fingerprint = (r: Pick<VoteHistoryRound, 'candidates'>) =>
  JSON.stringify(r.candidates.map(c => [c.type, c.targetPhysicalId, c.initiatorPhysicalId ?? null, c.votes, c.unnamed, c.voters.map(v => v.voterPhysicalId)]));

/**
 * 📸 لحظة الفرز (day:resolve): تُلحق الجولة بالسجلّ. فرزٌ مكرّرٌ للجولة نفسها يستبدلها،
 * وجولةٌ سابقةٌ في النهار نفسه بلا نتيجة (أُعيد التصويت بطريقٍ آخر) تُختم «أُعيدت».
 */
export function recordVoteRound(state: GameState): VoteHistoryRound {
  const hist: VoteHistoryRound[] = (state as any).voteHistory || ((state as any).voteHistory = []);
  const snap = buildVoteRound(state);
  const sameDay = hist.filter(h => h.round === snap.round);
  const last = sameDay[sameDay.length - 1];
  if (last && !last.outcome && fingerprint(last) === fingerprint(snap)) {
    Object.assign(last, { ...snap, id: last.id, seq: last.seq, kind: last.kind });
    return last;
  }
  if (last && !last.outcome) last.outcome = { type: 'RESTARTED' };
  const prevType = last?.outcome?.type;
  const kind: VoteRoundKind = !last ? 'DAY'
    : (prevType && KIND_AFTER[prevType]) || ((state.votingState as any)?.mayorRevote ? 'MAYOR_REVOTE' : 'RESTART');
  const seq = sameDay.length + 1;
  const entry: VoteHistoryRound = { id: `r${snap.round}-${seq}`, seq, kind, ...snap };
  hist.push(entry);
  while (hist.length > VOTE_HISTORY_CAP) hist.shift();
  return entry;
}

/** آخرُ جولةٍ في النهار الحاليّ (التي تُختم نتيجتُها) */
function current(state: GameState): VoteHistoryRound | null {
  const hist: VoteHistoryRound[] = (state as any).voteHistory || [];
  const r = state.round || 1;
  for (let i = hist.length - 1; i >= 0; i--) if (hist[i].round === r) return hist[i];
  return null;
}

/** ✏️ مَن سحب صوته (عند تنفيذ الإقصاء بعد التبرير) */
export function stampWithdrawals(state: GameState, withdrawn: number[]): boolean {
  const e = current(state); if (!e) return false;
  e.withdrawn = [...new Set((withdrawn || []).map(Number))].sort((a, b) => a - b);
  return true;
}

/** ✏️ نتيجةُ الجولة — تُدمج مع ما سبق (قرارُ التعادل ثمّ المُقصى عند الكشف) */
export function stampVoteOutcome(state: GameState, patch: VoteHistoryOutcome): boolean {
  const e = current(state); if (!e) return false;
  e.outcome = { ...(e.outcome || {}), ...patch } as VoteHistoryOutcome;
  return true;
}

/**
 * ✏️ «كشف الأدوار»: المُقصى بلا دوره. قرارُ «إقصاء الجميع» يبقى نوعَه ويُضاف إليه المُقصَون،
 * وتأجيلُ العمدة نتيجةٌ بلا موت.
 */
export function stampRevealOutcome(state: GameState): boolean {
  const e = current(state); if (!e) return false;
  const pr: any = (state as any).pendingResolution || {};
  if (pr.type === 'MAYOR_POSTPONED') return stampVoteOutcome(state, { type: 'MAYOR_POSTPONED' });
  const eliminated: number[] = Array.isArray(pr.eliminated) ? pr.eliminated.map(Number) : [];
  const keep = e.outcome?.type === 'TIE_ELIMINATE_ALL';
  return stampVoteOutcome(state, {
    type: keep ? 'TIE_ELIMINATE_ALL' : eliminated.length ? 'ELIMINATED' : 'NO_ELIMINATION',
    eliminated,
    names: eliminated.map(s => nameOf(state, s)),
    ...(pr.type === 'DEAL_ELIMINATION' ? { viaDeal: true } : {}),
  });
}

/** نسخةٌ للبثّ — السجلُّ بلا أدوارٍ أصلاً فيُرسل كما هو */
export function voteHistoryOf(state: GameState | null | undefined): VoteHistoryRound[] {
  return ((state as any)?.voteHistory || []) as VoteHistoryRound[];
}
