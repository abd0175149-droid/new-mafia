// ══════════════════════════════════════════════════════
// ☕ قارئة الفنجان — تقرأ من ستعدمه المدينة، وتختم قدر الغد حين تبلغ عتبتها (موسم النبوءة)
//
// قرارات المالك (2026-11-26):
//   ١١ حين تبلغ عتبتها ترحل فائزةً وتختم اسماً يُعدم في النهار التالي بلا تصويت («قدر الغد»).
//      جواب الحوار: يُفتح الختم صباحاً ويُعدم صاحبه أوّل النهار، ثمّ يكمل النهار بتصويته.
//   ١٢ العتبة: قراءتان من ١٦ إلى ٢٣ لاعباً، وثلاث من ٢٤ (والموجّه يضبطها: config.cupThreshold).
//   ٢٧ «الفنجان المكشوف» مرّةً في اللعبة: قراءة الليلة تظهر صباحاً على الشاشة بلا اسمها.
//   ٢٨ حين ترحل تُعرض الأرقام التي صدقت فيها.
//   ٢٩ إن قرأت المهرّج وأُعدم: تفوز معه إن بلغت به عتبتها.
//   ب٣ (قرار البناء) تختم في الليلة التالية لرحيلها من هاتفها والعيون مغمضة.
//
// ما يُحسب قراءةً صادقة: إعدامُ المدينة وحده — هدفُ التصويت النهاريّ أو هدفُ صفقةٍ مرّت.
// ولا يُحسب: صاحب الصفقة المرتدّ، ضحايا القنبلة، لعنة الرماد، انتحار الأخ الأكبر، أيّ موتٍ ليليّ،
// ولا ختمُها هي.
//
// «قدر الغد» يُنفَّذ في حلّ الليلة التي خُتم فيها، بعد كلّ أفعالها، ويظهر في ملخّص الصباح كحدثٍ
// يقلبه الموجّه أوّلاً. ليس تصويتاً: لا قنبلة، ولا فوز للمهرّج، ولا لعنة رماد، ولا نقض ولا كفالة،
// وحمايةُ الطبيب لا تمنعه. إن مات المختوم في الليلة نفسها احترق الختم.
// ══════════════════════════════════════════════════════

import type { GameState, MorningEvent } from './state.js';
import { Role, teamOfRole } from './roles.js';

export interface CupRead { targetPhysicalId: number; round: number; isPublic: boolean }

export interface CupState {
  readerPhysicalId: number;
  threshold: number;
  reads: CupRead[];
  /** الجولات التي صدقت فيها — مع المقعد */
  hits: Array<{ targetPhysicalId: number; round: number }>;
  publicUsed: boolean;
  /** طلبُ كشف قراءة الليلة (يُستهلك حين تُحلّ قراءتها) */
  pendingPublic: boolean;
  departed: boolean;
  departedRound: number | null;
  /** بعد الرحيل: هل لها ختمٌ تختمه الليلة القادمة؟ */
  sealAvailable: boolean;
  sealPhysicalId: number | null;
  sealRound: number | null;
  sealOutcome: 'EXECUTED' | 'BURNED' | null;
}

const cs = (state: GameState): CupState | null => ((state as any).cupState as CupState | null) || null;

export function defaultCupThreshold(n: number): number {
  return n >= 24 ? 3 : 2;
}

/** يُستدعى عند اعتماد الأدوار — null إن لا قارئة. */
export function initCupState(state: GameState): CupState | null {
  const p = state.players.find(x => x.role === Role.CUP_READER);
  if (!p) return null;
  const manual = Number((state.config as any).cupThreshold);
  const threshold = Number.isFinite(manual) && manual >= 1 ? Math.min(5, Math.floor(manual)) : defaultCupThreshold(state.players.length);
  return {
    readerPhysicalId: p.physicalId, threshold, reads: [], hits: [], publicUsed: false, pendingPublic: false,
    departed: false, departedRound: null, sealAvailable: false, sealPhysicalId: null, sealRound: null, sealOutcome: null,
  };
}

/** قراءةُ الليلة (من حلّ الليل: قدرة READ_CUP). الكشفُ يُستهلك هنا. */
export function recordCupRead(state: GameState, readerSeat: number, targetSeat: number, events: MorningEvent[]): void {
  const c = cs(state);
  if (!c || c.readerPhysicalId !== readerSeat || c.departed) return;
  const t = state.players.find(p => p.physicalId === targetSeat);
  if (!t?.isAlive || targetSeat === readerSeat) return;
  const isPublic = c.pendingPublic && !c.publicUsed;
  c.pendingPublic = false;
  if (isPublic) c.publicUsed = true;
  c.reads.push({ targetPhysicalId: targetSeat, round: state.round || 1, isPublic });
  // للموجّه دائماً
  events.push({ type: 'CUP_READ' as any, targetPhysicalId: targetSeat, targetName: t.name, performerPhysicalId: readerSeat, revealed: false, extra: { isPublic } } as any);
  // 🫖 الفنجان المكشوف: يُعرض صباحاً على الشاشة — بلا اسمها ولا رقمها
  if (isPublic) events.push({ type: 'CUP_PUBLIC' as any, targetPhysicalId: targetSeat, targetName: t.name, revealed: false, extra: {} } as any);
}

/** طلبُ الفنجان المكشوف من ظرفها ليلاً (مرّةً في اللعبة). */
export function requestPublicCup(state: GameState, seat: number, on: boolean): { ok: true } | { ok: false; error: string } {
  const c = cs(state);
  if (!c || c.readerPhysicalId !== seat) return { ok: false, error: 'ليست قارئة' };
  if (c.departed) return { ok: false, error: 'رحلت القارئة' };
  if (c.publicUsed) return { ok: false, error: 'الفنجان المكشوف استُعمل' };
  if ((state.phase as string) !== 'NIGHT') return { ok: false, error: 'يُكشف فنجان الليلة ليلاً' };
  c.pendingPublic = !!on;
  return { ok: true };
}

/** قراءةُ الجولة الحاليّة (التي تنتظر نهارها) */
function currentRead(c: CupState, round: number): CupRead | undefined {
  return c.reads.find(r => r.round === round);
}

export interface CupHit { hit: boolean; count: number; threshold: number; departed: boolean; hits: number[] }

/**
 * إعدامٌ بيد المدينة (تصويتٌ أو هدفُ صفقة): هل صدق فنجانُ هذه الجولة؟
 * يُستدعى مرّةً لكلّ مُعدَمٍ بيد المدينة. إن بلغت العتبة ترحل فائزةً (تخرج من اللعبة).
 */
export function cupOnCityExecution(state: GameState, executedSeat: number): CupHit | null {
  const c = cs(state);
  if (!c || c.departed) return null;
  const reader = state.players.find(p => p.physicalId === c.readerPhysicalId);
  if (!reader?.isAlive) return null;
  const r = currentRead(c, state.round || 1);
  if (!r || r.targetPhysicalId !== executedSeat) return null;
  if (c.hits.some(h => h.round === r.round)) return null;
  c.hits.push({ targetPhysicalId: executedSeat, round: r.round });
  const departed = c.hits.length >= c.threshold;
  if (departed) {
    c.departed = true;
    c.departedRound = state.round || 1;
    c.sealAvailable = true;
    reader.isAlive = false;
    state.performanceTracking?.eliminationLog.push({
      physicalId: reader.physicalId, eliminatedBy: 'CUP_DEPARTED' as any, round: state.round || 1, team: 'NEUTRAL' as any,
    });
  }
  return { hit: true, count: c.hits.length, threshold: c.threshold, departed, hits: c.hits.map(h => h.targetPhysicalId) };
}

/** هل رحلت فائزةً؟ (لختم الفوز بالمقعد) */
export function cupWonSeat(state: GameState, seat: number): boolean {
  const c = cs(state);
  return !!c && c.readerPhysicalId === seat && c.departed;
}

/** ختمُ قدر الغد من هاتفها بعد رحيلها، في الليلة التالية (ب٣). */
export function requestSeal(state: GameState, seat: number, targetSeat: number): { ok: true } | { ok: false; error: string } {
  const c = cs(state);
  if (!c || c.readerPhysicalId !== seat) return { ok: false, error: 'ليست قارئة' };
  if (!c.departed || !c.sealAvailable) return { ok: false, error: 'لا ختم الآن' };
  if ((state.phase as string) !== 'NIGHT') return { ok: false, error: 'الختمُ ليلاً والعيونُ مغمضة' };
  if ((state.round || 1) <= (c.departedRound || 0)) return { ok: false, error: 'الختمُ في الليلة التالية لرحيلك' };
  const t = state.players.find(p => p.physicalId === targetSeat);
  if (!t?.isAlive) return { ok: false, error: 'اختر لاعباً حيّاً' };
  c.sealPhysicalId = targetSeat;
  c.sealRound = state.round || 1;
  return { ok: true };
}

/**
 * آخر حلّ الليل — قبل الشرطيّة والتوأمين كي يُحسب موتُ المختوم فيهما:
 * إن خُتم اسمٌ الليلة يُنفَّذ قدرُ الغد (أو يحترق إن مات صاحبه في الليلة نفسها).
 */
export function applyCupSeal(state: GameState, events: MorningEvent[]): number | null {
  const c = cs(state);
  if (!c || !c.sealAvailable || c.sealRound !== (state.round || 1) || c.sealPhysicalId == null) return null;
  c.sealAvailable = false;
  const t = state.players.find(p => p.physicalId === c.sealPhysicalId);
  if (!t || !t.isAlive) {
    c.sealOutcome = 'BURNED';
    events.push({ type: 'CUP_SEAL_BURNED' as any, targetPhysicalId: c.sealPhysicalId, targetName: t?.name || '', revealed: false, extra: {} } as any);
    return null;
  }
  t.isAlive = false;
  c.sealOutcome = 'EXECUTED';
  state.performanceTracking?.eliminationLog.push({
    physicalId: t.physicalId, eliminatedBy: 'CUP_SEAL' as any, round: state.round || 1, team: teamOfRole(t.role) as any,
  });
  events.push({
    type: 'CUP_SEAL' as any, targetPhysicalId: t.physicalId, targetName: t.name, revealed: false,
    extra: { targetRole: t.role },
  } as any);
  return t.physicalId;
}

/** للكشف بعد اللعبة وظرفها */
export function cupSummary(state: GameState) {
  const c = cs(state);
  if (!c) return null;
  return {
    readerPhysicalId: c.readerPhysicalId, threshold: c.threshold, hits: c.hits.map(h => h.targetPhysicalId),
    reads: c.reads.length, publicUsed: c.publicUsed, departed: c.departed, departedRound: c.departedRound,
    sealPhysicalId: c.sealPhysicalId, sealOutcome: c.sealOutcome,
  };
}
