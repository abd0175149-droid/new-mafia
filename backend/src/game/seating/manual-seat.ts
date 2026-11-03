// ══════════════════════════════════════════════════════
// 🖐️ اختيار المقعد اليدويّ — المنطق المحض (2026-11-03)
//
// خيارٌ في الفعاليّة (activities.manual_seat_selection). حين يُفعَّل:
//   • اللاعب يكتب رقم المقعد الذي يريده عند الدخول، والخادم يتحقّق أنّه متاح.
//   • «متاح» = ليس عليه لاعبٌ (حاضرٌ أو محجوزٌ أو مجمَّد)، ولا متفرّج،
//     ولا تثبيتٌ لشخصٍ آخر (قالب المقاعد / تخصيص الفعاليّة / الباب).
//   • من غادر الغرفة من جهازه يُفرَّغ مقعده فوراً — لا حجز عشر دقائق.
//   • قرار الليدر يغلب: من نقله الليدر (`leaderSeat`) ثمّ غادر يُحفظ مقعده له
//     ويعود إليه، ومن ثبّته الطاقم في مقعدٍ يجلس فيه بلا سؤال.
//
// بلا قاعدة بيانات ولا Redis — يغذّي الانضمام والفحص معاً.
// ══════════════════════════════════════════════════════

import { normalizeLocalPhone } from '../../utils/phone.util.js';

export interface SeatChoiceJoiner {
  playerId?: number | null;
  phone?: string | null;
  name?: string | null;
}

export type SeatBlocker = 'player' | 'held' | 'spectator' | 'pinned';

export type ManualSeatCode = 'SEAT_CHOICE_REQUIRED' | 'SEAT_INVALID' | 'SEAT_TAKEN' | 'ROOM_FULL';

export interface ManualSeatOk { ok: true; seat: number; via: 'choice' | 'pin' }
export interface ManualSeatFail { ok: false; code: ManualSeatCode; error: string; maxPlayers: number; freeSeats: number[] }
export type ManualSeatResult = ManualSeatOk | ManualSeatFail;

/** حارس نوع صريح — الخادم يُبنى بلا strict فلا يضيّق `r.ok` وحده */
export function isSeatFail(r: ManualSeatResult): r is ManualSeatFail { return r.ok === false; }

const phoneKey = (p: unknown): string => {
  const raw = String(p ?? '').trim();
  if (!raw || raw === '0700000000') return '';
  return normalizeLocalPhone(raw) || raw.replace(/\D/g, '');
};
const nameKey = (n: unknown): string => String(n ?? '').trim().toLowerCase();

/** هل هذا الشخص (لاعب/متفرّج/تثبيت) هو الداخل نفسه؟ — الحساب ثمّ الهاتف ثمّ الاسم (كمطابقة التثبيت في المحرّك) */
export function isSamePerson(
  a: { playerId?: any; phone?: any; name?: any; playerName?: any },
  j: SeatChoiceJoiner,
  opts: { byName?: boolean } = {},
): boolean {
  const aId = Number(a.playerId);
  const jId = Number(j.playerId);
  if (Number.isFinite(aId) && aId > 0 && Number.isFinite(jId) && jId > 0) return aId === jId;
  const ap = phoneKey(a.phone);
  const jp = phoneKey(j.phone);
  if (ap && jp) return ap === jp;
  if (opts.byName) {
    const an = nameKey(a.name ?? a.playerName);
    const jn = nameKey(j.name);
    return !!an && !!jn && an === jn;
  }
  return false;
}

function capOf(state: any): number {
  const n = Math.floor(Number(state?.config?.maxPlayers));
  return Number.isFinite(n) && n > 0 ? n : 27;
}

/**
 * كلّ المقاعد غير المتاحة لهذا الداخل وسببها.
 * التثبيت لا يحجب إن كان صاحبه هو الداخل، أو كان صاحبه جالساً أصلاً في مقعدٍ آخر
 * (تثبيتٌ لم يعد له معنى لا يُغلق كرسيّاً فارغاً طوال الليل).
 */
export function blockedSeats(state: any, joiner: SeatChoiceJoiner): Map<number, SeatBlocker> {
  const out = new Map<number, SeatBlocker>();
  const players: any[] = Array.isArray(state?.players) ? state.players : [];
  const specs: any[] = Array.isArray(state?.spectators) ? state.spectators : [];

  for (const p of players) {
    const s = Number(p.physicalId);
    if (s > 0) out.set(s, p.seatHeld || p.frozen ? 'held' : 'player');
  }
  for (const sp of specs) {
    const s = Number(sp.physicalId);
    if (s > 0 && !out.has(s)) out.set(s, 'spectator');
  }

  const pins: any[] = Array.isArray(state?.pinnedSeats) ? state.pinnedSeats : [];
  const present = [...players, ...specs];
  for (const pin of pins) {
    const s = Number(pin.seatNumber);
    if (!(s > 0) || out.has(s)) continue;
    if (isSamePerson(pin, joiner, { byName: true })) continue;
    const owner = { playerId: pin.playerId, phone: pin.phone, name: pin.playerName };
    const ownerSeatedElsewhere = present.some((p: any) =>
      Number(p.physicalId) !== s && isSamePerson(p, owner, { byName: true }));
    if (ownerSeatedElsewhere) continue;
    out.set(s, 'pinned');
  }
  return out;
}

export function freeSeatsFor(state: any, joiner: SeatChoiceJoiner): number[] {
  const cap = capOf(state);
  const blocked = blockedSeats(state, joiner);
  const free: number[] = [];
  for (let i = 1; i <= cap; i++) if (!blocked.has(i)) free.push(i);
  return free;
}

/** مقعدٌ ثبّته الطاقم لهذا الداخل وما زال فارغاً — يجلس فيه بلا سؤال (قرار الليدر يغلب) */
export function pinnedSeatFor(state: any, joiner: SeatChoiceJoiner): number | null {
  const cap = capOf(state);
  const pins: any[] = Array.isArray(state?.pinnedSeats) ? state.pinnedSeats : [];
  const blocked = blockedSeats(state, joiner);
  for (const pin of pins) {
    const s = Number(pin.seatNumber);
    if (!(s >= 1 && s <= cap) || blocked.has(s)) continue;
    if (isSamePerson(pin, joiner, { byName: true })) return s;
  }
  return null;
}

/** يقرأ الرقم كما يكتبه الناس: «٧»، « 7 »، "07" */
export function parseSeatInput(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim().replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  if (!/^\d{1,3}$/.test(s)) return NaN;
  return Number(s);
}

/**
 * الحكم على طلب الجلوس: التثبيت أوّلاً، ثمّ اختيار اللاعب.
 * لا يُقترح مقعدٌ بديل عند الرفض — الاختيار للّاعب، والخادم يعيد قائمة المتاح فقط.
 */
export function resolveManualSeat(state: any, joiner: SeatChoiceJoiner, chosen: unknown): ManualSeatResult {
  const cap = capOf(state);
  const pin = pinnedSeatFor(state, joiner);
  if (pin) return { ok: true, seat: pin, via: 'pin' };

  const freeSeats = freeSeatsFor(state, joiner);
  const fail = (code: ManualSeatCode, error: string): ManualSeatResult => ({ ok: false, code, error, maxPlayers: cap, freeSeats });

  if (freeSeats.length === 0) return fail('ROOM_FULL', 'لا مقعد شاغر — القاعة ممتلئة');

  const n = parseSeatInput(chosen);
  if (n === null) return fail('SEAT_CHOICE_REQUIRED', 'اكتب رقم المقعد الذي تريد الجلوس فيه');
  if (!Number.isFinite(n) || n < 1 || n > cap) return fail('SEAT_INVALID', `رقم المقعد يجب أن يكون بين 1 و ${cap}`);

  const why = blockedSeats(state, joiner).get(n);
  if (why) return fail('SEAT_TAKEN', `المقعد ${n} محجوز — اختر رقماً آخر`);
  return { ok: true, seat: n, via: 'choice' };
}

/**
 * مغادرة اللاعب من جهازه في وضع الاختيار اليدويّ:
 *   'free' = يُزال ويُفرَّغ مقعده فوراً · 'hold' = نقله الليدر فيُحفظ له بلا مهلة.
 */
export function exitDisposition(player: any): 'free' | 'hold' {
  return player?.leaderSeat === true ? 'hold' : 'free';
}
