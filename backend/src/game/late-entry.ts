// ══════════════════════════════════════════════════════
// 🚪 الدخول المتأخّر — «خطّة الدفعات» (الخطّة الموحّدة 2026-11-20، المرحلة 4)
//
// القواعد المعتمدة (القرارات 17–24):
//   • عند الإنشاء: الحاضرون، ومافيا البداية، ودفعةٌ مع بداية الليل الأوّل و/أو الثاني (عددٌ ومافيا).
//   • كلّ دفعةٍ فيها داخلون تحمل مافيا ≥ 1 — دفعةٌ بلا مافيا تكشف الداخلين مواطنين.
//   • إعادة الحساب عند البوّابة افتراضيّاً: الهدف = autoMafia(كلّ من لعب) − مافيا البداية والدفعات السابقة.
//   • نصيبُ كلّ داخلٍ من بطاقة المافيا الربع، والمجموع ≤ 60%؛ الباقي يُجنَّد من مواطنٍ عاديّ حيّ متّصل
//     لم يفحصه الشريف، لعب 3 مباريات على الأقلّ.
//   • العدّاد لا يكذب: خانة «مافيا قادم» علنيّة، والمدينة لا تفوز ما دام فيها شيء.
//   • حصانة ليلة الدخول للداخلين. دردشة المافيا من لحظة الدخول.
// منطقٌ نقيّ — المقبس (live-cards.socket) يحفظ ويبثّ.
// ══════════════════════════════════════════════════════

import { isMafiaRole, type Role } from './roles.js';

export interface LateWave { at: 1 | 2; count: number; mafia: number; done?: boolean; arrived?: number; mafiaDealt?: number; recruited?: number[]; joined?: number[]; skipped?: boolean }
export interface LateEntryState {
  enabled: boolean;
  waves: LateWave[];
  recompute: boolean;
  /** مافيا البداية (يُختم عند «ابدأ اللعبة») */
  startMafia?: number;
  startPlayers?: number;
  /** الباب أُغلق يدويّاً */
  closed?: boolean;
}

const clampN = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

/** الغرف عن بُعد: الدخول المتأخّر مطفأ (حلّ التعارض). */
export function normalizeLatePlan(raw: any, isRemote: boolean): LateEntryState {
  const waves: LateWave[] = (Array.isArray(raw?.waves) ? raw.waves : []).slice(0, 6).map((w: any) => {
    const count = clampN(w?.count, 0, 20, 0);
    return { at: (Number(w?.at) === 2 ? 2 : 1) as 1 | 2, count, mafia: Math.min(count, clampN(w?.mafia, 0, 10, 0)) };
  }).filter((w: LateWave) => w.count > 0);
  // دفعتان على الليلة نفسها تُدمجان
  const merged: LateWave[] = [];
  for (const w of waves) {
    const m = merged.find((x) => x.at === w.at);
    if (m) { m.count += w.count; m.mafia += w.mafia; } else merged.push({ ...w });
  }
  merged.sort((a, b) => a.at - b.at);
  for (const m of merged) m.mafia = Math.min(m.mafia, m.count);
  return { enabled: !isRemote && raw?.enabled === true && merged.length > 0, waves: merged, recompute: raw?.recompute !== false };
}

export const autoMafia = (n: number) => Math.min(7, Math.ceil(n / 4));

export function lateOf(state: any): LateEntryState | null {
  const l = state?.config?.lateEntry;
  return l && l.enabled ? l : null;
}

/** الدفعات التي لم تُفتح بعد (والباب غير مغلق) */
export function pendingWaves(state: any): LateWave[] {
  const l = lateOf(state);
  if (!l || l.closed) return [];
  return l.waves.filter((w) => !w.done);
}

/** «قادم» للعدّاد العلنيّ */
export function incomingCounts(state: any): { incoming: number; incomingMafia: number } {
  const p = pendingWaves(state);
  return { incoming: p.reduce((s, w) => s + w.count, 0), incomingMafia: p.reduce((s, w) => s + w.mafia, 0) };
}

/** المدينة لا تفوز ما دام مافيا قادم */
export function blocksCityWin(state: any): boolean {
  return incomingCounts(state).incomingMafia > 0;
}

/** رقم الليلة التي ستبدأ الآن (الجولة الحاليّة قبل الزيادة) */
export const nightNumber = (state: any) => Math.max(1, Number(state?.round) || 1);

/** دفعةُ هذه الليلة إن كانت مستحقّة */
export function dueWave(state: any): LateWave | null {
  const n = nightNumber(state);
  return pendingWaves(state).find((w) => w.at === n) || null;
}

/** مافيا الفريق كلّه منذ البداية (أحياءً وأمواتاً) — للحساب لا للعرض */
const mafiaEver = (state: any) => (state.players || []).filter((p: any) => p.role && isMafiaRole(p.role as Role)).length;
const playedEver = (state: any) => (state.players || []).filter((p: any) => !!p.role).length;

/** كم مافيا تحمل الدفعة إن دخل `arrived` الآن */
export function waveMafiaFor(state: any, wave: LateWave, arrived: number, literal: boolean): number {
  const l = lateOf(state);
  if (literal || !l?.recompute) return arrived > 0 ? Math.max(1, wave.mafia) : wave.mafia;
  const later = pendingWaves(state).filter((w) => w !== wave && w.at > wave.at);
  const laterMafia = later.reduce((s, w) => s + w.mafia, 0);
  const target = autoMafia(playedEver(state) + arrived + later.reduce((s, w) => s + w.count, 0)) - laterMafia;
  const m = Math.max(0, target - mafiaEver(state));
  // سقفٌ معقول: لا تزيد الدفعة عن المخطّط بأكثر من واحد، ولا تجنيد بلا داخلين فوق المخطّط
  return arrived > 0 ? Math.max(1, Math.min(m, wave.mafia + 1)) : Math.min(m, wave.mafia);
}

/**
 * يقرّر من يأخذ بطاقات المافيا: لكلّ بطاقةٍ احتمالُ ذهابها لداخل = min(60%, 25% × عدد الداخلين الباقين)،
 * وإلّا تُجنِّد مواطناً عاديّاً من المؤهّلين. `rand` قابلٌ للحقن في الاختبار.
 */
export function placeMafiaCards(joiners: number[], eligibleRecruits: number[], mafia: number, rand: () => number = Math.random) {
  const toJoiners: number[] = [];
  const recruits: number[] = [];
  const freeJ = [...joiners];
  const freeR = [...eligibleRecruits];
  for (let i = 0; i < mafia; i++) {
    const pJoin = Math.min(0.6, 0.25 * freeJ.length);
    const goJoiner = freeJ.length > 0 && (freeR.length === 0 || rand() < pJoin);
    if (goJoiner) toJoiners.push(freeJ.splice(Math.floor(rand() * freeJ.length), 1)[0]);
    else if (freeR.length) recruits.push(freeR.splice(Math.floor(rand() * freeR.length), 1)[0]);
  }
  return { toJoiners, recruits };
}

/** المؤهّل للتجنيد: مواطنٌ عاديّ حيّ متّصل، لم يفحصه الشريف، ليس داخلاً الآن */
export function recruitCandidates(state: any, exclude: number[] = []): number[] {
  const checked = new Set<number>((state.sheriffChecked || []).map(Number));
  return (state.players || []).filter((p: any) =>
    p.isAlive !== false && p.role === 'CITIZEN' && p.isConnected !== false && !p.frozen
    && !checked.has(Number(p.physicalId)) && !exclude.includes(Number(p.physicalId)) && !p.lateJoinRound,
  ).map((p: any) => Number(p.physicalId));
}
