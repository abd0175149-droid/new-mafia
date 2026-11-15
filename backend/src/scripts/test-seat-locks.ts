// ══════════════════════════════════════════════════════
// 🧪 إغلاق المقاعد — الدفعات، القاعدة، بوّابة الداخل، المتفرّج، القالب، الترقيم
//
// تشغيل: npx tsx src/scripts/test-seat-locks.ts   (نقي — بلا قاعدة ولا Redis)
// ══════════════════════════════════════════════════════

import * as SL from '../game/seating/seat-locks.js';
import { blockedSeats, freeSeatsFor, resolveManualSeat, pinnedSeatFor, isSeatFail } from '../game/seating/manual-seat.js';
import { allocateSeat } from '../game/seat-allocator.js';
import { allocateSeatWithConstraints, reshuffleSeating } from '../game/seating/engine.js';
import { remapPhysicalIds, planSeatInsert, applySeatInsert } from '../game/seat-remap.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const eq = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const NOW = 1_800_000_000_000;

const P = (seat: number, extra: any = {}) => ({ physicalId: seat, name: `ل${seat}`, phone: `07900000${String(seat).padStart(2, '0')}`, playerId: 500 + seat, ...extra });
const room = (cap: number, seats: number[] = [], extra: any = {}): any => ({
  roomId: 'r1', config: { maxPlayers: cap }, players: seats.map((s) => P(s)), spectators: [], pinnedSeats: [], ...extra,
});
const newbie = { playerId: 900, phone: '0790000900', name: 'جديد' };
const odd = (cap: number) => Array.from({ length: cap }, (_, i) => i + 1).filter((n) => n % 2 === 1);
const mapOf = (chairs: number[], v: number | ((c: number, i: number) => number)) => {
  const m: Record<string, number> = {};
  chairs.forEach((c, i) => { m[String(c)] = typeof v === 'function' ? v(c, i) : v; });
  return m;
};

console.log('\n━━━ التطبيع ━━━');
{
  const m = SL.normalizeMap({ '1': 3, '2': 7, '3': 0, '4': 3, '99': 1, x: 1, '5': -1, '6': null }, 12);
  check('الدفعات تُرصّ 1..k بترتيبها', m['1'] === 1 && m['4'] === 1 && m['2'] === 2, JSON.stringify(m));
  check('الدائم يبقى 0', m['3'] === 0);
  check('خارج السعة والقيم الفاسدة تسقط', m['99'] === undefined && m['x'] === undefined && m['5'] === undefined && m['6'] === undefined);
  const r = SL.normalizeRule({ mode: 'weird', threshold: 99 });
  check('قاعدة فاسدة ⇒ auto وعتبة مقصوصة', r.mode === 'auto' && r.threshold === SL.MAX_THRESHOLD);
  check('عتبة سالبة ⇒ 0', SL.normalizeRule({ mode: 'ask', threshold: -3 }).threshold === 0);
  check('بلا إغلاق: كلّ القراءات فارغة', SL.closedChairs(room(12)).length === 0 && SL.readLocks(room(12)) === null);
}

console.log('\n━━━ الحجب في الاختيار اليدويّ ━━━');
{
  const s = room(12, [2, 4]);
  SL.saveLocks(s, { ...mapOf([1, 3, 5], 1), ...mapOf([7, 9], 2), '11': 0 }, { mode: 'off', threshold: 0 });
  const b = blockedSeats(s, newbie);
  check('المغلق (دفعة ودائم) محجوب بسبب closed', b.get(1) === 'closed' && b.get(7) === 'closed' && b.get(11) === 'closed');
  check('الجالس يبقى سببه player لا closed', b.get(2) === 'player');
  check('المتاح = المفتوح الفارغ وحده', eq(freeSeatsFor(s, newbie), [6, 8, 10, 12]), freeSeatsFor(s, newbie).join(','));
  const r1 = resolveManualSeat(s, newbie, 3);
  check('كتب رقماً مغلقاً ⇒ SEAT_TAKEN بنصّ «مغلق الآن»', isSeatFail(r1) && r1.code === 'SEAT_TAKEN' && /مغلق الآن/.test(r1.error), isSeatFail(r1) ? r1.error : 'ok');
  check('…ومعه قائمة المتاح بلا المغلق', isSeatFail(r1) && eq(r1.freeSeats, [6, 8, 10, 12]));
  const r2 = resolveManualSeat(s, newbie, 6);
  check('رقمٌ مفتوح ⇒ يجلس', !isSeatFail(r2) && r2.seat === 6);
  // إغلاق كرسيّ عليه لاعب لا يُخرجه
  SL.patchLocks(s, { '2': 0 });
  check('إغلاق كرسيّ مشغول: اللاعب باقٍ والسبب player', s.players.some((p: any) => p.physicalId === 2) && blockedSeats(s, newbie).get(2) === 'player');
  s.players = s.players.filter((p: any) => p.physicalId !== 2);
  check('…وحين يفرغ يصير مغلقاً', blockedSeats(s, newbie).get(2) === 'closed');
}

console.log('\n━━━ التثبيت يغلب الإغلاق لصاحبه ━━━');
{
  const s = room(12, [2], { pinnedSeats: [{ seatNumber: 5, playerId: 900, phone: '0790000900', playerName: 'جديد' }, { seatNumber: 7, playerId: 777, phone: '0790000777', playerName: 'غائب' }] });
  SL.saveLocks(s, mapOf([5, 7, 9], 0));
  check('صاحب التثبيت: كرسيّه المغلق غير محجوب عنه', !blockedSeats(s, newbie).has(5));
  check('…ويُحسم له بلا سؤال', pinnedSeatFor(s, newbie) === 5);
  const other = { playerId: 901, phone: '0790000901', name: 'آخر' };
  check('غيره: الكرسيّ نفسه محجوب', blockedSeats(s, other).has(5));
  check('المثبَّت لغائب يبقى pinned (يسبق closed)', blockedSeats(s, newbie).get(7) === 'pinned');
  const r = allocateSeatWithConstraints({
    maxPlayers: 12, occupiedSeats: new Map(), seatingConfig: null,
    newPlayer: { playerId: 900, phone: '0790000900', name: 'جديد', gender: 'MALE', totalMatches: 0, activityCount: 0, rankRR: 0, rankTier: 'INFORMANT' } as any,
    context: { maxPlayers: 12, penaltyNeighborHistory: new Map(), constraintParams: {}, pinnedSeats: s.pinnedSeats, closedSeats: SL.closedChairs(s) },
  });
  check('المحرّك: صاحب التثبيت يجلس في كرسيّه المغلق', r.seat === 5, `seat=${r.seat}`);
}

console.log('\n━━━ فتح الدفعات ━━━');
{
  const s = room(24, [2, 4, 6]);
  SL.saveLocks(s, mapOf(odd(24), (_c, i) => (i % 2) + 1), { mode: 'off', threshold: 0 });
  check('دفعتان', eq(SL.batchNumbers(s), [1, 2]));
  check('الأولى متباعدة 1,5,9…', eq(SL.batchChairs(s, 1), [1, 5, 9, 13, 17, 21]));
  const o1 = SL.openNextBatch(s, NOW);
  check('فُتحت الأولى', eq(o1, [1, 5, 9, 13, 17, 21]));
  check('الثانية صارت الأولى', eq(SL.batchNumbers(s), [1]) && eq(SL.batchChairs(s, 1), [3, 7, 11, 15, 19, 23]));
  check('سُجّل التراجع', eq(SL.readLocks(s)!.undo!.chairs, o1));
  s.players.push(P(5)); s.players.push(P(9));
  const back = SL.undoLastOpen(s);
  check('التراجع يعيد إغلاق الفارغ وحده', eq(back, [1, 13, 17, 21]), back.join(','));
  check('…كدفعةٍ أولى، والتي كانت أولى صارت ثانية', eq(SL.batchChairs(s, 1), [1, 13, 17, 21]) && eq(SL.batchChairs(s, 2), [3, 7, 11, 15, 19, 23]));
  check('…ويُسكت الفتح الآليّ', SL.readLocks(s)!.snoozed === true);
  check('تراجعٌ ثانٍ لا يفعل شيئاً', SL.undoLastOpen(s).length === 0);
  SL.openNextBatch(s, NOW); SL.openNextBatch(s, NOW);
  check('لا دفعة باقية ⇒ قائمة فارغة', SL.openNextBatch(s, NOW).length === 0 && SL.batchNumbers(s).length === 0);
}

console.log('\n━━━ القاعدة بعد الجلوس (ruleCheck) ━━━');
{
  // auto + عتبة 1: يبقى مفتوحٌ واحد ⇒ تُفتح الدفعة
  const s = room(12, [2, 4, 6, 8, 10]);
  SL.saveLocks(s, mapOf(odd(12), (_c, i) => (i % 2) + 1), { mode: 'auto', threshold: 1 });
  check('قبل: المفتوح الفارغ واحد (12)', eq(SL.openFree(s), [12]));
  const r = SL.ruleCheck(s, NOW);
  check('auto: فُتحت الدفعة الأولى', eq(r.opened, [1, 5, 9]) && r.changed, r.opened.join(','));
  check('…ولا شريط سؤال', r.pending === false);
  check('فوق العتبة: لا فتح ثانٍ', SL.ruleCheck(s, NOW).opened.length === 0);

  // ask: الشريط يظهر ولا يُفتح شيء
  const a = room(12, [2, 4, 6, 8, 10]);
  SL.saveLocks(a, mapOf(odd(12), 1), { mode: 'ask', threshold: 1 });
  const ra = SL.ruleCheck(a, NOW);
  check('ask: لا فتح، والشريط ظاهر', ra.opened.length === 0 && ra.pending === true && SL.readLocks(a)!.pending === true);
  // «لاحقاً» يُسكته
  SL.readLocks(a)!.pending = false; SL.readLocks(a)!.snoozed = true;
  check('ask بعد «لاحقاً»: لا إلحاح', SL.ruleCheck(a, NOW).pending === false);

  // off: لا شيء إلّا إن كان أحدٌ ينتظر بلا كرسيّ
  const o = room(12, [2, 4, 6, 8, 10, 12]);
  SL.saveLocks(o, mapOf(odd(12), 1), { mode: 'off', threshold: 0 });
  check('off بلا منتظرين: لا شريط', SL.ruleCheck(o, NOW).pending === false);
  SL.touchWaiter(o, newbie, NOW);
  check('off ومعه منتظر ولا مفتوح: الشريط يظهر', SL.ruleCheck(o, NOW).pending === true);

  // دفعة من كرسيّ واحد لا تكفي العتبة ⇒ تُفتح التالية معها
  const t = room(10, [2, 3, 4, 5, 6, 7]);
  SL.saveLocks(t, { '1': 1, '8': 2, '9': 2, '10': 3 }, { mode: 'auto', threshold: 1 });
  const rt = SL.ruleCheck(t, NOW);
  check('auto: يفتح حتى يتجاوز العتبة', eq(rt.opened, [1, 8, 9]) && eq(SL.batchChairs(t, 1), [10]), rt.opened.join(','));
  check('…والتراجع يشمل كلّ ما فُتح', eq(SL.readLocks(t)!.undo!.chairs, [1, 8, 9]));
}

console.log('\n━━━ بوّابة الداخل (gateForJoiner) ━━━');
{
  const full = (mode: string) => { const s = room(12, [2, 4, 6, 8, 10, 12]); SL.saveLocks(s, mapOf(odd(12), (_c, i) => (i % 2) + 1), { mode, threshold: 0 }); return s; };

  const a = full('auto');
  const ga = SL.gateForJoiner(a, newbie, NOW);
  check('auto: لا ينتظر — تُفتح دفعة', ga.wait === false && eq(ga.opened, [1, 5, 9]) && ga.changed);
  check('…وصار له كرسيّ', freeSeatsFor(a, newbie).length === 3);

  const k = full('ask');
  const gk = SL.gateForJoiner(k, newbie, NOW);
  check('ask: ينتظر، ولا يُفتح شيء', gk.wait === true && gk.opened.length === 0);
  check('…وسُجّل منتظراً وظهر الشريط', SL.liveWaiters(k, NOW).length === 1 && SL.readLocks(k)!.pending === true);
  SL.gateForJoiner(k, newbie, NOW + 15_000);
  check('إعادة المحاولة لا تكرّره', SL.liveWaiters(k, NOW + 15_000).length === 1);
  check('…ومن توقّف عن المحاولة يسقط', SL.liveWaiters(k, NOW + 15_000 + SL.WAITER_TTL_MS).length === 0);
  SL.openNextBatch(k, NOW + 20_000);
  const gk2 = SL.gateForJoiner(k, newbie, NOW + 21_000);
  check('بعد فتح الليدر: يدخل', gk2.wait === false);
  check('…ويُشطب بعد جلوسه', SL.dropWaiter(k, newbie) === true && SL.liveWaiters(k, NOW + 21_000).length === 0);

  const o = full('off');
  check('off: ينتظر كذلك', SL.gateForJoiner(o, newbie, NOW).wait === true);

  // تراجع الليدر عن فتحٍ آليّ ⇒ الداخل التالي ينتظر ولا تُفتح ثانيةً وحدها
  const u = full('auto');
  SL.gateForJoiner(u, newbie, NOW);
  SL.undoLastOpen(u);
  const gu = SL.gateForJoiner(u, newbie, NOW);
  check('بعد «تراجع»: auto لا يفتح وحده، والداخل ينتظر', gu.wait === true && gu.opened.length === 0);

  // المغلق الدائم وحده باقٍ ⇒ ينتظر بلا شريط دفعات
  const p = room(6, [1, 2, 3, 4]);
  SL.saveLocks(p, mapOf([5, 6], 0), { mode: 'auto', threshold: 0 });
  const gp = SL.gateForJoiner(p, newbie, NOW);
  check('دائمٌ فقط: ينتظر، ولا شريط', gp.wait === true && !SL.readLocks(p)!.pending);

  // ممتلئة فعلاً ⇒ ليست حالة انتظار (المسار القائم يرفض)
  const f = room(4, [1, 2, 3, 4]);
  SL.saveLocks(f, mapOf([3, 4], 0));
  check('كلّ الكراسي مشغولة: wait=false', SL.gateForJoiner(f, newbie, NOW).wait === false);

  // مثبَّتٌ له كرسيّ مغلق ⇒ لا ينتظر ولا تُفتح دفعة
  const pin = room(6, [1, 2, 3, 4], { pinnedSeats: [{ seatNumber: 6, playerId: 900, phone: '0790000900', playerName: 'جديد' }] });
  SL.saveLocks(pin, mapOf([5, 6], 1), { mode: 'ask', threshold: 0 });
  const gpin = SL.gateForJoiner(pin, newbie, NOW);
  check('صاحب تثبيتٍ على مغلق: يدخل بلا فتح', gpin.wait === false && gpin.opened.length === 0 && eq(SL.batchChairs(pin, 1), [5, 6]));

  check('بلا إغلاق أصلاً: لا أثر', SL.gateForJoiner(room(12, [1]), newbie, NOW).changed === false);
}

console.log('\n━━━ المحرّكان يستبعدان المغلق ━━━');
{
  const s = room(12, [2, 4]);
  SL.saveLocks(s, mapOf(odd(12), 1), { mode: 'off', threshold: 0 });
  const closed = SL.closedChairs(s);
  let bad = 0;
  for (let i = 0; i < 200; i++) {
    const r = allocateSeat({ maxPlayers: 12, players: s.players.map((p: any) => ({ physicalId: p.physicalId, phone: p.phone, gender: 'MALE' })), constraints: null, newPlayer: { phone: '0790000900', gender: 'MALE' }, closedSeats: closed });
    if (r.seat % 2 === 1 || r.seat === 2 || r.seat === 4) bad++;
  }
  check('الوضع القديم: 200 توزيعاً كلّها على مفتوح فارغ', bad === 0, `bad=${bad}`);
  bad = 0;
  for (let i = 0; i < 200; i++) {
    const occ = new Map<number, any>(s.players.map((p: any) => [p.physicalId, { ...p, gender: 'MALE', totalMatches: 5, activityCount: 5, rankRR: 0, rankTier: 'INFORMANT' }]));
    const r = allocateSeatWithConstraints({
      maxPlayers: 12, occupiedSeats: occ, seatingConfig: { engineEnabled: true, strictness: 'relaxed' } as any,
      newPlayer: { playerId: 900, phone: '0790000900', name: 'جديد', gender: 'MALE', totalMatches: 0, activityCount: 0, rankRR: 0, rankTier: 'INFORMANT' } as any,
      context: { maxPlayers: 12, penaltyNeighborHistory: new Map(), constraintParams: {}, closedSeats: closed, reservedTailSeats: 3 },
    });
    if (closed.includes(r.seat) || occ.has(r.seat)) bad++;
  }
  check('المحرّك الذكيّ: 200 توزيعاً كلّها على مفتوح فارغ', bad === 0, `bad=${bad}`);
  let threw = false;
  try { allocateSeat({ maxPlayers: 4, players: [{ physicalId: 1, phone: '', gender: 'MALE' }, { physicalId: 2, phone: '', gender: 'MALE' }], constraints: null, newPlayer: { phone: '', gender: 'MALE' }, closedSeats: [3, 4] }); } catch { threw = true; }
  check('لا مفتوح ⇒ يرمي «ممتلئة» (البوّابة تسبقه في الانضمام)', threw);
}

console.log('\n━━━ المتفرّج المتأخّر ━━━');
{
  const s = room(12, [1, 2, 3, 4, 5]);
  SL.saveLocks(s, { '8': 1, '9': 1, '10': 2, '11': 2, '12': 0 }, { mode: 'off', threshold: 0 });
  const prefs = SL.spectatorSeatPrefs(s);
  check('المستبعَد عنه: الدائم وحده', eq(prefs.closed, [12]));
  check('الدفعة الأخيرة أعلى مكافأةً', prefs.bonus[10] > prefs.bonus[8] && prefs.bonus[8] > 2);
  let lastBatch = 0, perm = 0;
  for (let i = 0; i < 200; i++) {
    const r = allocateSeat({ maxPlayers: 12, players: s.players.map((p: any) => ({ physicalId: p.physicalId, phone: p.phone, gender: 'MALE' })), constraints: null, newPlayer: { phone: '0790000900', gender: 'MALE' }, closedSeats: prefs.closed, seatBonus: prefs.bonus, preferTailSeats: true });
    if (r.seat === 10 || r.seat === 11) lastBatch++;
    if (r.seat === 12) perm++;
  }
  check('200 متفرّجاً: كلّهم في الدفعة الأخيرة', lastBatch === 200, `lastBatch=${lastBatch}`);
  check('…ولا أحد على الدائم', perm === 0);
  let engineLast = 0;
  for (let i = 0; i < 100; i++) {
    const occ = new Map<number, any>(s.players.map((p: any) => [p.physicalId, { ...p, gender: 'MALE', totalMatches: 5, activityCount: 5, rankRR: 0, rankTier: 'INFORMANT' }]));
    const r = allocateSeatWithConstraints({
      maxPlayers: 12, occupiedSeats: occ, seatingConfig: null,
      newPlayer: { playerId: 900, phone: '0790000900', name: 'متفرّج', gender: 'MALE', totalMatches: 0, activityCount: 0, rankRR: 0, rankTier: 'INFORMANT' } as any,
      context: { maxPlayers: 12, penaltyNeighborHistory: new Map(), constraintParams: {}, closedSeats: prefs.closed, seatBonus: prefs.bonus, preferTailSeats: true },
    });
    if (r.seat === 10 || r.seat === 11) engineLast++;
  }
  check('المحرّك الذكيّ: المتفرّج في الدفعة الأخيرة', engineLast === 100, `engineLast=${engineLast}`);
}

console.log('\n━━━ «رتّب» يتجنّب المغلق ━━━');
{
  const closed = [7, 8, 9, 10, 11, 12];
  const ps = [1, 2, 3, 4].map((n) => ({ playerId: 500 + n, phone: `079000000${n}`, name: `ل${n}`, gender: 'MALE', totalMatches: 5, activityCount: 5, rankRR: 0, rankTier: 'INFORMANT', physicalId: n }));
  const r = reshuffleSeating({ maxPlayers: 12, players: ps as any, seatingConfig: null, context: { maxPlayers: 12, penaltyNeighborHistory: new Map(), constraintParams: {}, closedSeats: closed } });
  const seats = (r.arrangement || []).map((a: any) => Number(a.seatNumber));
  check('4 لاعبين و6 مفتوحة: لا أحد على مغلق', r.success && seats.every((x) => !closed.includes(x)), seats.join(','));
  const many = Array.from({ length: 9 }, (_, i) => ({ ...ps[0], playerId: 700 + i, phone: `07900007${String(i).padStart(2, '0')}`, name: `م${i}`, physicalId: i + 1 }));
  const r2 = reshuffleSeating({ maxPlayers: 12, players: many as any, seatingConfig: null, context: { maxPlayers: 12, penaltyNeighborHistory: new Map(), constraintParams: {}, closedSeats: closed } });
  check('9 لاعبين و6 مفتوحة: الكلّ يجلس (المغلق يُستعمل للباقين)', r2.success && (r2.arrangement || []).length === 9);
}

console.log('\n━━━ القالب: المقاعد المؤخّرة دفعةً أخيرة ━━━');
{
  const s = room(27);
  check('أوّل تحميل: آخر 5 دفعة واحدة', SL.locksFromTail(s, 5) && eq(SL.batchChairs(s, 1), [23, 24, 25, 26, 27]) && SL.readLocks(s)!.origin === 'template');
  check('…والقاعدة الافتراضيّة auto/1', SL.readLocks(s)!.rule.mode === 'auto' && SL.readLocks(s)!.rule.threshold === 1);
  SL.locksFromTail(s, 3);
  check('تحديثٌ من القالب يعيد البناء ما لم يعدّل الليدر', eq(SL.closedChairs(s), [25, 26, 27]));
  SL.patchLocks(s, { '25': null });
  check('لمسة الليدر تجعل المصدر leader', SL.readLocks(s)!.origin === 'leader' && eq(SL.closedChairs(s), [26, 27]));
  check('…فلا يطمسه القالب بعدها', SL.locksFromTail(s, 5) === false && eq(SL.closedChairs(s), [26, 27]));
  const z = room(27); SL.locksFromTail(z, 0);
  check('ذيل صفر ⇒ خريطة فارغة', SL.closedChairs(z).length === 0 && SL.readLocks(z) !== null);
  // سلوك ليلةٍ كاملة بالتوزيع الآليّ: الأماميّة أوّلاً ثمّ تُفتح المؤخّرة وحدها
  const n = room(12); SL.locksFromTail(n, 4);
  const order: number[] = [];
  for (let i = 0; i < 12; i++) {
    const g = SL.gateForJoiner(n, { playerId: 1000 + i, name: `x${i}` }, NOW);
    if (g.wait) break;
    const free = freeSeatsFor(n, { playerId: 1000 + i });
    const seat = free[0];
    n.players.push(P(seat, { playerId: 1000 + i }));
    order.push(seat);
    SL.ruleCheck(n, NOW);
  }
  check('12 داخلاً يجلسون كلّهم بلا انتظار', order.length === 12, `جلس ${order.length}`);
  check('…والمؤخّرة (9–12) آخر من يُملأ', order.slice(0, 7).every((x) => x <= 8), order.join(','));
}

console.log('\n━━━ السعة والإدراج والترقيم ━━━');
{
  const s = room(12, [1, 2, 6]);
  SL.saveLocks(s, { '5': 0, '7': 1, '11': 2 }, { mode: 'off', threshold: 0 });
  SL.openNextBatch(s, NOW);                                   // فُتح 7 ⇒ undo.chairs=[7]
  SL.patchLocks(s, { '7': 0 });
  // تبديل لاعبَي 1 و6: الإغلاق لا يتحرّك
  remapPhysicalIds(s, new Map([[1, 6], [6, 1]]));
  check('تبديل لاعبَين لا يحرّك الإغلاق', eq(SL.closedChairs(s), [5, 7, 11]) && SL.readLocks(s)!.map['5'] === 0);
  // نقل لاعبٍ إلى كرسيّ مغلق (قرار الليدر): الإغلاق باقٍ على الكرسيّ
  remapPhysicalIds(s, new Map([[2, 5]]));
  check('نقلٌ إلى كرسيّ مغلق: الإغلاق باقٍ عليه', SL.readLocks(s)!.map['5'] === 0 && s.players.some((p: any) => p.physicalId === 5));
  // «أضف 2 بعد 6»
  const plan: any = planSeatInsert(s, 6, 2);
  check('خطّة الإدراج سليمة', !plan.error && plan.newMax === 14);
  applySeatInsert(s, plan);
  check('الإدراج يزيح الإغلاق مع كراسيه (7⟵9، 11⟵13) ويبقي ما قبله', eq(SL.closedChairs(s), [5, 9, 13]), SL.closedChairs(s).join(','));
  check('…والمقاعد الجديدة (7،8) مفتوحة', !SL.closedChairs(s).includes(7) && !SL.closedChairs(s).includes(8));
  // تصغير السعة
  s.config.maxPlayers = 10;
  check('تصغير السعة يُسقط ما فوقها', SL.trimToCap(s) === true && eq(SL.closedChairs(s), [5, 9]));
  s.config.maxPlayers = 14;
  check('…فلا يعود مغلقاً بعد التكبير', eq(SL.closedChairs(s), [5, 9]));
}

console.log('\n━━━ أفعال الليدر ━━━');
{
  const s = room(12, [2]);
  const r = SL.saveLocks(s, mapOf([1, 3, 5], 1), { mode: 'ask', threshold: 2 });
  check('save: يُبلّغ بما أُغلق', eq(r.closed, [1, 3, 5]) && r.opened.length === 0);
  const r2 = SL.saveLocks(s, mapOf([3, 9], 0));
  check('save ثانٍ: ما غاب عنه فُتح', eq(r2.opened, [1, 5]) && eq(r2.closed, [9]));
  check('…والقاعدة باقية إن لم تُرسل', SL.readLocks(s)!.rule.mode === 'ask' && SL.readLocks(s)!.rule.threshold === 2);
  const r3 = SL.patchLocks(s, { '3': null, '4': 1 });
  check('patch: يفتح ويغلق كرسيّاً بكرسيّ', eq(r3.opened, [3]) && eq(r3.closed, [4]) && SL.readLocks(s)!.map['4'] === 1);
  SL.patchLocks(s, { '6': 5 });
  check('patch بدفعةٍ بعيدة يُرصّ', SL.readLocks(s)!.map['6'] === 2);
  const sum = SL.summary(s, NOW);
  check('الملخّص يعدّ صحيحاً', sum.closed === 3 && sum.batches === 2 && sum.openFree === 12 - 3 - 1, JSON.stringify(sum));
}

console.log(`\n══════ ${pass} نجح · ${fail} فشل ══════`);
if (fail) { console.log(failures.map((f) => ' ✗ ' + f).join('\n')); process.exit(1); }
