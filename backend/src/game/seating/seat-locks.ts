// ══════════════════════════════════════════════════════
// 🔒 إغلاق المقاعد — المنطق المحض (2026-11-15)
//
// الليدر يغلق أيّ كراسٍ يريد ويفتحها متى يريد. لكلّ كرسيّ ثلاث حالات:
//   • مفتوح        — غائبٌ عن القاموس: يُعرض على اللاعب ويُجلِس النظام عليه.
//   • في دفعة (n≥1) — مغلقٌ الآن، ويُفتح مع دفعته حين يبلغ المفتوح العتبة.
//   • مغلق دائماً (0) — لا تفتحه أيّ قاعدة حتى يفتحه الليدر بيده.
//
// قواعد لا تُكسر:
//   • الإغلاق على **الكرسيّ** لا على الشخص: تبديل لاعبَين لا يحرّكه، وإدراج مقاعد يزيحه
//     (applySeatInsert). لذلك أسماء الحقول هنا (map/chairs) لا يلتقطها جوّال seat-remap.
//   • قرار الليدر يغلب: الإضافة اليدويّة والنقل والتبديل لا تمرّ من هنا أصلاً.
//   • صاحب التثبيت يجلس في كرسيّه المثبَّت ولو كان مغلقاً — الإغلاق يحجبه عن غيره فقط.
//   • إغلاق كرسيّ عليه لاعب لا يُخرجه: يسري حين يفرغ.
//
// بلا قاعدة بيانات ولا Redis — يغذّي الانضمام وأحداث الليدر والفحص معاً.
// ══════════════════════════════════════════════════════

import { freeSeatsFor, joinerKey, type SeatChoiceJoiner } from './manual-seat.js';

export type SeatLockMode = 'auto' | 'ask' | 'off';
export interface SeatLockRule { mode: SeatLockMode; threshold: number }
export interface SeatWaiter { key: string; name: string; at: number }

export interface SeatLocks {
  /** كرسيّ ⟵ 0 مغلق دائماً · n≥1 رقم دفعته. الغائب مفتوح. */
  map: Record<string, number>;
  rule: SeatLockRule;
  /** شريط «افتح الدفعة التالية؟» ظاهرٌ عند الليدر */
  pending?: boolean;
  /** قال الليدر «لاحقاً» أو تراجع عن فتحٍ آليّ: لا فتح آليّ ولا إلحاح حتى يقرّر بيده */
  snoozed?: boolean;
  /** آخر ما فُتح — لزرّ «تراجع» */
  undo?: { chairs: number[]; at: number } | null;
  /** من وصل ولا كرسيّ مفتوح — يُحدَّث ختمه مع كلّ إعادة محاولة */
  waiters?: SeatWaiter[];
  /** 'template' = من «المقاعد المؤخّرة» في القالب ولم يمسّه الليدر بعد */
  origin?: 'template' | 'leader';
}

export const PERMANENT = 0;
export const MAX_BATCH = 9;
export const MAX_THRESHOLD = 6;
/** المنتظر الذي لم يُعد المحاولة خلال هذه المدّة غادر الباب */
export const WAITER_TTL_MS = 50_000;
export const DEFAULT_RULE: SeatLockRule = { mode: 'auto', threshold: 1 };

function capOf(state: any): number {
  const n = Math.floor(Number(state?.config?.maxPlayers));
  return Number.isFinite(n) && n > 0 ? n : 27;
}

export function readLocks(state: any): SeatLocks | null {
  const l = state?.seatLocks;
  return l && typeof l === 'object' && l.map && typeof l.map === 'object' ? (l as SeatLocks) : null;
}

export function ensureLocks(state: any): SeatLocks {
  let l = readLocks(state);
  if (!l) {
    l = { map: {}, rule: { ...DEFAULT_RULE } };
    state.seatLocks = l;
  }
  l.rule = normalizeRule(l.rule);
  return l;
}

export function normalizeRule(raw: any): SeatLockRule {
  const mode: SeatLockMode = raw?.mode === 'ask' || raw?.mode === 'off' ? raw.mode : 'auto';
  const t = Math.floor(Number(raw?.threshold));
  return { mode, threshold: Number.isFinite(t) ? Math.min(MAX_THRESHOLD, Math.max(0, t)) : DEFAULT_RULE.threshold };
}

/** خريطة نظيفة: كراسٍ داخل السعة، قيم صحيحة، والدفعات مرصوصة 1..k بترتيبها. */
export function normalizeMap(raw: any, cap: number): Record<string, number> {
  const rows: Array<[number, number]> = [];
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (v === null || v === undefined || v === '') continue;
      const chair = Math.floor(Number(k));
      const val = Math.floor(Number(v));
      if (!(chair >= 1 && chair <= cap) || !Number.isFinite(val) || val < 0) continue;
      rows.push([chair, Math.min(val, MAX_BATCH)]);
    }
  }
  const order = Array.from(new Set(rows.map((r) => r[1]).filter((v) => v >= 1))).sort((a, b) => a - b);
  const out: Record<string, number> = {};
  for (const [chair, v] of rows.sort((a, b) => a[0] - b[0])) out[String(chair)] = v === 0 ? 0 : order.indexOf(v) + 1;
  return out;
}

function cleanMap(state: any): Record<string, number> {
  const l = readLocks(state);
  if (!l) return {};
  l.map = normalizeMap(l.map, capOf(state));
  return l.map;
}

/** كلّ الكراسي المغلقة (دائماً أو في دفعة) داخل السعة */
export function closedChairs(state: any): number[] {
  const l = readLocks(state);
  if (!l) return [];
  const cap = capOf(state);
  return Object.keys(l.map).map(Number).filter((c) => c >= 1 && c <= cap && Number(l.map[String(c)]) >= 0).sort((a, b) => a - b);
}

export function permanentChairs(state: any): number[] {
  const l = readLocks(state);
  return l ? closedChairs(state).filter((c) => Number(l.map[String(c)]) === PERMANENT) : [];
}

export function batchNumbers(state: any): number[] {
  const l = readLocks(state);
  if (!l) return [];
  const set = new Set<number>();
  for (const c of closedChairs(state)) { const v = Number(l.map[String(c)]); if (v >= 1) set.add(v); }
  return Array.from(set).sort((a, b) => a - b);
}

export function batchChairs(state: any, batch: number): number[] {
  const l = readLocks(state);
  return l ? closedChairs(state).filter((c) => Number(l.map[String(c)]) === batch) : [];
}

/** الكراسي المشغولة: لاعب (حاضر/محجوز/مجمَّد) أو متفرّج */
export function occupiedChairs(state: any): Set<number> {
  const out = new Set<number>();
  for (const p of (Array.isArray(state?.players) ? state.players : [])) { const s = Number(p?.physicalId); if (s > 0) out.add(s); }
  for (const sp of (Array.isArray(state?.spectators) ? state.spectators : [])) { const s = Number(sp?.physicalId); if (s > 0) out.add(s); }
  return out;
}

/** مغلقٌ وفارغ — ما يمكن فتحه لمن ينتظر */
export function closedEmpty(state: any): number[] {
  const occ = occupiedChairs(state);
  return closedChairs(state).filter((c) => !occ.has(c));
}

/** المفتوح الفارغ لأيّ داخل: غير مشغول، غير مغلق، وغير مثبَّت لغائب */
export function openFree(state: any): number[] {
  return freeSeatsFor(state, {});
}

// ── المنتظرون ──────────────────────────────────────────

export function pruneWaiters(state: any, now: number): boolean {
  const l = readLocks(state);
  if (!l || !Array.isArray(l.waiters) || !l.waiters.length) return false;
  const keep = l.waiters.filter((w) => w && now - Number(w.at) < WAITER_TTL_MS);
  if (keep.length === l.waiters.length) return false;
  l.waiters = keep;
  return true;
}

export function liveWaiters(state: any, now: number): SeatWaiter[] {
  const l = readLocks(state);
  return l && Array.isArray(l.waiters) ? l.waiters.filter((w) => w && now - Number(w.at) < WAITER_TTL_MS) : [];
}

export function touchWaiter(state: any, joiner: SeatChoiceJoiner, now: number): void {
  const l = ensureLocks(state);
  const key = joinerKey(joiner);
  if (!key) return;
  const list = Array.isArray(l.waiters) ? l.waiters.filter((w) => w && w.key !== key) : [];
  list.push({ key, name: String(joiner.name || '').trim().slice(0, 40) || 'لاعب', at: now });
  l.waiters = list.slice(-30);
}

export function dropWaiter(state: any, joiner: SeatChoiceJoiner): boolean {
  const l = readLocks(state);
  const key = joinerKey(joiner);
  if (!l || !key || !Array.isArray(l.waiters)) return false;
  const keep = l.waiters.filter((w) => w && w.key !== key);
  if (keep.length === l.waiters.length) return false;
  l.waiters = keep;
  return true;
}

// ── فتح الدفعات ────────────────────────────────────────

/** يفتح الدفعة الأولى ويرصّ ما بعدها. يعيد الكراسي التي فُتحت (فارغةً إن لم تبقَ دفعة). */
export function openNextBatch(state: any, now: number): number[] {
  const l = readLocks(state);
  if (!l) return [];
  const map = cleanMap(state);
  const chairs = Object.keys(map).map(Number).filter((c) => map[String(c)] === 1).sort((a, b) => a - b);
  if (!chairs.length) return [];
  for (const c of chairs) delete map[String(c)];
  for (const k of Object.keys(map)) if (map[k] >= 1) map[k] -= 1;
  l.undo = { chairs, at: now };
  l.pending = false;
  l.snoozed = false;
  return chairs;
}

/** «تراجع»: يعيد إغلاق ما بقي فارغاً ممّا فُتح آخر مرّة، كدفعةٍ أولى. ويُسكت الفتح الآليّ حتى يقرّر الليدر. */
export function undoLastOpen(state: any): number[] {
  const l = readLocks(state);
  if (!l || !l.undo || !Array.isArray(l.undo.chairs) || !l.undo.chairs.length) return [];
  const map = cleanMap(state);
  const cap = capOf(state);
  const occ = occupiedChairs(state);
  const back = l.undo.chairs.filter((c) => c >= 1 && c <= cap && !occ.has(c) && map[String(c)] === undefined);
  l.undo = null;
  l.snoozed = true;
  l.pending = false;
  if (!back.length) return [];
  for (const k of Object.keys(map)) if (map[k] >= 1) map[k] = Math.min(MAX_BATCH, map[k] + 1);
  for (const c of back) map[String(c)] = 1;
  return back;
}

/**
 * بعد جلوس لاعب أو تعديل الإغلاق: هل بلغ المفتوح الفارغ العتبة؟
 *   'auto' ⟵ تُفتح الدفعات حتى يتجاوز المفتوح العتبة · 'ask' ⟵ يظهر الشريط · 'off' ⟵ لا شيء.
 * `snoozed` (لاحقاً/تراجع) يوقف الاثنين — يبقى الشريط لمن ينتظر فعلاً (gateForJoiner).
 */
export function ruleCheck(state: any, now: number): { opened: number[]; pending: boolean; changed: boolean } {
  const l = readLocks(state);
  if (!l) return { opened: [], pending: false, changed: false };
  const before = !!l.pending;
  const rule = normalizeRule(l.rule);
  const waiting = liveWaiters(state, now).length > 0;

  if (!batchNumbers(state).length) {
    l.pending = false;
    return { opened: [], pending: false, changed: before };
  }
  if (openFree(state).length > rule.threshold) {
    // فوق العتبة: لا إلحاح. (من ينتظر مع وجود مفتوح سيجلس في محاولته التالية.)
    l.pending = false;
    return { opened: [], pending: false, changed: before };
  }
  if (rule.mode === 'auto' && !l.snoozed) {
    const opened: number[] = [];
    while (openFree(state).length <= rule.threshold) {
      const o = openNextBatch(state, now);
      if (!o.length) break;
      opened.push(...o);
    }
    if (opened.length) l.undo = { chairs: opened, at: now };
    l.pending = false;
    return { opened, pending: false, changed: opened.length > 0 || before };
  }
  // 'ask' يسأل عند العتبة؛ 'off' والمُسكَت لا يسألان إلّا إن كان أحدٌ ينتظر بلا كرسيّ
  const want = rule.mode === 'ask' && !l.snoozed ? true : waiting && openFree(state).length === 0;
  l.pending = want;
  return { opened: [], pending: want, changed: before !== want };
}

/**
 * بوّابة الداخل (لاعب لا متفرّج) — تُستدعى تحت قفل الغرفة قبل اختيار أيّ مقعد.
 *   wait=true  ⟵ لا كرسيّ مفتوح له وفي القاعة مغلقٌ فارغ: ينتظر ويُنبَّه الليدر.
 *   wait=false ⟵ له كرسيّ (ربّما بعد فتحٍ آليّ)، أو القاعة ممتلئة فعلاً (المسار القائم يتولّاها).
 */
export function gateForJoiner(state: any, joiner: SeatChoiceJoiner, now: number): { wait: boolean; opened: number[]; changed: boolean } {
  const l = readLocks(state);
  if (!l) return { wait: false, opened: [], changed: false };
  let changed = pruneWaiters(state, now);
  if (freeSeatsFor(state, joiner).length > 0) return { wait: false, opened: [], changed };

  const opened: number[] = [];
  if (normalizeRule(l.rule).mode === 'auto' && !l.snoozed) {
    while (freeSeatsFor(state, joiner).length === 0) {
      const o = openNextBatch(state, now);
      if (!o.length) break;
      opened.push(...o);
    }
    if (opened.length) { l.undo = { chairs: opened, at: now }; changed = true; }
    if (freeSeatsFor(state, joiner).length > 0) return { wait: false, opened, changed };
  }
  if (closedEmpty(state).length === 0) return { wait: false, opened, changed };

  touchWaiter(state, joiner, now);
  if (batchNumbers(state).length) l.pending = true;
  return { wait: true, opened, changed: true };
}

// ── أفعال الليدر ───────────────────────────────────────

function diff(prev: Record<string, number>, next: Record<string, number>): { opened: number[]; closed: number[] } {
  const opened = Object.keys(prev).map(Number).filter((c) => next[String(c)] === undefined).sort((a, b) => a - b);
  const closed = Object.keys(next).map(Number).filter((c) => prev[String(c)] === undefined).sort((a, b) => a - b);
  return { opened, closed };
}

/** «تمّ» في محرّر الإغلاق: خريطةٌ كاملة تستبدل القائمة، ومعها القاعدة. */
export function saveLocks(state: any, rawMap: any, rawRule?: any): { opened: number[]; closed: number[] } {
  const l = ensureLocks(state);
  const cap = capOf(state);
  const prev = normalizeMap(l.map, cap);
  const next = normalizeMap(rawMap, cap);
  l.map = next;
  if (rawRule) l.rule = normalizeRule(rawRule);
  l.origin = 'leader';
  l.undo = null;
  l.snoozed = false;
  return diff(prev, next);
}

/** لمسةٌ من لوح المقعد: `null` يفتح، `0` يغلق دائماً، `n` يضعه في الدفعة n. */
export function patchLocks(state: any, patch: any): { opened: number[]; closed: number[] } {
  const l = ensureLocks(state);
  const cap = capOf(state);
  const prev = normalizeMap(l.map, cap);
  const merged: Record<string, any> = { ...prev };
  if (patch && typeof patch === 'object') {
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) delete merged[String(Math.floor(Number(k)))];
      else merged[String(Math.floor(Number(k)))] = v;
    }
  }
  const next = normalizeMap(merged, cap);
  l.map = next;
  l.origin = 'leader';
  l.snoozed = false;
  return diff(prev, next);
}

// ── القالب والسعة ──────────────────────────────────────

/**
 * «المقاعد المؤخّرة» في القالب تُحمَّل دفعةً أخيرة مغلقة (القرار ٧): يبقى أثرها في التوزيع
 * الآليّ (تُملأ الأماميّة أوّلاً) ويصير لها أثرٌ في الاختيار اليدويّ. ما عدّله الليدر لا يُطمس.
 */
export function locksFromTail(state: any, tail: unknown): boolean {
  const cur = readLocks(state);
  if (cur && cur.origin === 'leader') return false;
  const cap = capOf(state);
  const n = Math.max(0, Math.min(Math.floor(Number(tail) || 0), cap - 1));
  const map: Record<string, number> = {};
  for (let c = cap - n + 1; c <= cap; c++) map[String(c)] = 1;
  state.seatLocks = {
    map,
    rule: cur ? normalizeRule(cur.rule) : { ...DEFAULT_RULE },
    origin: 'template',
    pending: false,
    snoozed: false,
    undo: null,
    waiters: cur && Array.isArray(cur.waiters) ? cur.waiters : [],
  } as SeatLocks;
  return true;
}

/** صغّر الليدر السعة: ما فوقها يسقط من الخريطة (وإلّا عاد مغلقاً لو كبّرها لاحقاً). */
export function trimToCap(state: any): boolean {
  const l = readLocks(state);
  if (!l) return false;
  const before = Object.keys(l.map).length;
  l.map = normalizeMap(l.map, capOf(state));
  return Object.keys(l.map).length !== before;
}

/** «أضف N بعد المقعد K»: الكرسيّ الذي كان 12 صار 16 ويبقى على حاله — والجديدة مفتوحة. */
export function shiftForInsert(state: any, after: number, count: number): void {
  const l = readLocks(state);
  if (!l) return;
  const shift = (c: number) => (c > after ? c + count : c);
  const next: Record<string, number> = {};
  for (const [k, v] of Object.entries(l.map)) { const c = Number(k); if (Number.isFinite(c)) next[String(shift(c))] = Number(v); }
  l.map = next;
  if (l.undo && Array.isArray(l.undo.chairs)) l.undo = { ...l.undo, chairs: l.undo.chairs.map(shift) };
}

// ── المتفرّج المتأخّر ──────────────────────────────────

/**
 * القرار ٦: المتفرّج المتأخّر يجلس في مقاعد الدفعات التي لم تُفتح، الأخيرة أوّلاً — كما كانت
 * «المقاعد المؤخّرة» تُفضَّل له — والمغلق الدائم لا يجلس عليه أحد.
 */
export function spectatorSeatPrefs(state: any): { closed: number[]; bonus: Record<number, number> } {
  const l = readLocks(state);
  if (!l) return { closed: [], bonus: {} };
  const batches = batchNumbers(state);
  const last = batches.length ? batches[batches.length - 1] : 0;
  const bonus: Record<number, number> = {};
  for (const c of closedChairs(state)) {
    const v = Number(l.map[String(c)]);
    if (v >= 1 && last > 0) bonus[c] = 2 + v / last;
  }
  return { closed: permanentChairs(state), bonus };
}

/** ما يراه الليدر في سطرٍ واحد — للسجلّ والفحص */
export function summary(state: any, now: number): { closed: number; closedEmpty: number; openFree: number; batches: number; waiting: number } {
  return {
    closed: closedChairs(state).length,
    closedEmpty: closedEmpty(state).length,
    openFree: openFree(state).length,
    batches: batchNumbers(state).length,
    waiting: liveWaiters(state, now).length,
  };
}
