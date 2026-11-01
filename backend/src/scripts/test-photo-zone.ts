// ══════════════════════════════════════════════════════
// 🧪 زاوية بلا تصوير (2026-11-01) — نقيّ بلا DB ولا Redis
// ══════════════════════════════════════════════════════
// يغطّي:
//   ① الهندسة: القطع الدائريّة، الكتلة الرئيسيّة، الزاوية المتوقَّعة، ممرّ النموّ، الإصلاح
//   ② المحرّك التفاعليّ: مئات الليالي العشوائيّة — اتّصال الكتلة لحظة بلحظة
//   ③ «رتّب تلقائيّاً»: الكتلة أوّلاً عند المرساة، والمقفلون لا يتحرّكون
//   ④ الأولويّات: الصلبة تغلب الزاوية، والزاوية تغلب الليّنة (الأصحاب يُجمعون إن رفضا)
//   ⑤ إصلاحات القيود: الدمج مع الافتراضيّ، توحيد هاتف الأزواج، آخر الواصلين
//   ⑥ حرّاس بنيويّون: نسخة الواجهة مطابقة، والهاتف لا يرى علم غيره
//
// تشغيل: npx tsx src/scripts/test-photo-zone.ts
// ══════════════════════════════════════════════════════

import { allocateSeatWithConstraints, reshuffleSeating, resolveConstraintConfigs } from '../game/seating/engine.js';
import {
  segmentsOf, mainSegment, expectedZone, zoneRank, zoneReport, suggestFix, breaksZone,
  growthCorridor, forwardOffset, type ZoneOccupant,
} from '../game/seating/photo-zone.js';
import { personKey, pairKey } from '../game/seating/types.js';
import type { PlayerSeatData, EvaluationContext, SeatingConfig } from '../game/seating/types.js';
import { NoAdjacentPairsConstraint } from '../game/seating/constraints/no-adjacent-pairs.constraint.js';
import { lastArrivalSeats } from '../game/state.js';
import { projectStateFor } from '../sockets/broadcast.util.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t: string) { console.log(`\n━━━ ${t} ━━━`); }

// مولّد عشوائيّ محدَّد البذرة — الفحص يُعاد كما هو
let seed = 20261101;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
// المحرّك يخلط بـMath.random — نثبّته هو الآخر
Math.random = rnd;

let uid = 0;
const P = (over: Partial<PlayerSeatData> = {}): PlayerSeatData => {
  const id = ++uid;
  return {
    playerId: id, phone: `079${String(1000000 + id).slice(-7)}`, name: `لاعب${id}`, gender: 'MALE',
    totalMatches: 10, activityCount: 5, rankRR: 100, rankTier: 'SOLDIER', genderConstraint: 'NONE', ...over,
  };
};
const occOf = (m: Map<number, PlayerSeatData>) => {
  const o = new Map<number, ZoneOccupant>();
  for (const [s, p] of m) o.set(s, { noPhoto: p.noPhoto === true, name: p.name });
  return o;
};
const segCount = (m: Map<number, PlayerSeatData>, n: number) =>
  segmentsOf(Array.from(m.entries()).filter(([, p]) => p.noPhoto).map(([s]) => s), n).length;

// ══════════════════════════════════════════════════════
section('1) الهندسة');
{
  check('قطعتان منفصلتان', JSON.stringify(segmentsOf([1, 2, 5], 10)) === JSON.stringify([[1, 2], [5]]));
  check('الالتفاف: ٩،١٠،١ قطعة واحدة تبدأ من ٩', JSON.stringify(segmentsOf([1, 9, 10], 10)) === JSON.stringify([[9, 10, 1]]));
  check('الطاولة كلّها قطعة واحدة', segmentsOf([1, 2, 3, 4], 4).length === 1);
  check('لا رافضين = لا قطع', segmentsOf([], 10).length === 0);
  check('الرئيسيّة = الأطول', JSON.stringify(mainSegment([[1], [4, 5, 6]], 1, 10)) === JSON.stringify([4, 5, 6]));
  check('التساوي ⇒ التي تحوي المرساة', JSON.stringify(mainSegment([[2, 3], [7, 8]], 8, 10)) === JSON.stringify([7, 8]));
  check('بُعد المرساة للأمام', forwardOffset(2, 15, 16) === 3 && forwardOffset(15, 15, 16) === 0);

  const occ = new Map<number, ZoneOccupant>([[3, { noPhoto: true }], [4, { noPhoto: true }]]);
  const z = expectedZone(occ, { anchor: 3, pending: 2 }, 16);
  check('الزاوية = ٢ جالسان + ٢ منتظران + احتياط = ٥ من رأس الكتلة', JSON.stringify(Array.from(z).sort((a, b) => a - b)) === '[3,4,5,6,7]');
  const zEmpty = expectedZone(new Map(), { anchor: 15, pending: 0 }, 16);
  check('قبل أوّل رافض: الزاوية = المرساة وحدها', zEmpty.size === 1 && zEmpty.has(15));

  check('أوّل رافض يأخذ المرساة', zoneRank(5, true, new Map(), { anchor: 5, pending: 0 }, 10) === 0);
  const rFwd = zoneRank(5, true, occ, { anchor: 3, pending: 0 }, 16);
  const rBack = zoneRank(2, true, occ, { anchor: 3, pending: 0 }, 16);
  const rFar = zoneRank(10, true, occ, { anchor: 3, pending: 0 }, 16);
  check('الرافض: الأمام < الخلف < البعيد', rFwd < rBack && rBack < rFar, `${rFwd} ${rBack} ${rFar}`);
  const bridge = new Map<number, ZoneOccupant>([[1, { noPhoto: true }], [2, { noPhoto: true }], [4, { noPhoto: true }]]);
  check('الجسر بين قطعتين أفضل من الامتداد', zoneRank(3, true, bridge, { anchor: 1, pending: 0 }, 16) < zoneRank(16, true, bridge, { anchor: 1, pending: 0 }, 16));
  check('القابل: داخل الزاوية = ٣ (الأسوأ)', zoneRank(5, false, occ, { anchor: 3, pending: 2 }, 16) === 3);
  const corr = growthCorridor(occ, { anchor: 3, pending: 0 }, 16);
  check('ممرّ النموّ بعد نهاية الزاوية ومقعدٌ قبلها، لا داخلها ولا الجهة المقابلة', corr.has(6) && corr.has(2) && !corr.has(3) && !corr.has(15), JSON.stringify([...corr]));
  {
    const r6 = zoneRank(6, false, occ, { anchor: 3, pending: 0 }, 16);
    const far = Math.max(...Array.from(corr.keys()).filter(s => s > 5).map(s => s));
    const rFar = zoneRank(far, false, occ, { anchor: 3, pending: 0 }, 16);
    check('القابل: في الممرّ بين ١ و٢، وبعيداً = ٠', r6 > 1 && r6 <= 2 && zoneRank(15, false, occ, { anchor: 3, pending: 0 }, 16) === 0, `${r6}`);
    check('الممرّ يُملأ من طرفه البعيد: الأبعد أقلّ رتبة', rFar < r6, `${far}:${rFar} < 6:${r6}`);
  }

  // الإصلاح
  const broken = new Map<number, ZoneOccupant>([
    [1, { noPhoto: true, name: 'أ' }], [2, { noPhoto: true, name: 'ب' }], [3, { noPhoto: false, name: 'قابل' }], [9, { noPhoto: true, name: 'ج' }],
  ]);
  const rep = zoneReport(broken, { anchor: 1, pending: 0 }, 16);
  check('التقرير: ٣ رافضين في قطعتين', rep.count === 3 && rep.segments.length === 2 && !rep.contiguous);
  check('التقرير: الخارج = ٩ والعنوان «1–2 · 9»', JSON.stringify(rep.outside) === '[9]' && rep.label === '1–2 · 9', rep.label);
  check('الإصلاح: تبديل ٩ مع القابل في ٣ (الأمام أوّلاً)', rep.fix?.from === 9 && rep.fix?.to === 3 && rep.fix?.swapWith === 'قابل', JSON.stringify(rep.fix));
  const lockedFwd = new Map(broken); lockedFwd.set(3, { noPhoto: false, locked: true, name: 'محجوز' });
  const f2 = suggestFix(9, lockedFwd, { anchor: 1, pending: 0 }, 16);
  check('الأمام مقفل ⇒ الخلف (١٦ فارغ: نقل بسيط)', f2?.to === 16 && f2?.swapWith === null, JSON.stringify(f2));
  check('ملاصقٌ أصلاً ⇒ لا إصلاح', suggestFix(2, broken, { anchor: 1, pending: 0 }, 16) === null);

  const b = breaksZone(new Map<number, ZoneOccupant>([[1, { noPhoto: true }], [2, { noPhoto: true }], [3, { noPhoto: true }]]), new Map([[2, 9]]), { anchor: 1, pending: 0 }, 16);
  check('نقل الأوسط خارجاً يكسر الكتلة (١ ⟵ ٣ قطع)', b.broken && b.before === 1 && b.after === 3, JSON.stringify(b));
  const ok = breaksZone(new Map<number, ZoneOccupant>([[1, { noPhoto: true }], [2, { noPhoto: true }]]), new Map([[2, 16]]), { anchor: 1, pending: 0 }, 16);
  check('نقلٌ يبقي القطعة واحدة لا يُنبّه (٢ ⟵ ١٦ ملاصق لـ١ دائريّاً)', !ok.broken, JSON.stringify(ok));
  const gap = breaksZone(new Map<number, ZoneOccupant>([[1, { noPhoto: true }], [2, { noPhoto: true }]]), new Map([[2, 3]]), { anchor: 1, pending: 0 }, 16);
  check('ترك فجوة (٢ ⟵ ٣) يُنبّه', gap.broken);
}

// ══════════════════════════════════════════════════════
section('2) ليالٍ عشوائيّة — المحرّك التفاعليّ بالقيود الافتراضيّة');
type NightOpts = { n: number; ratio: number; fill: number; knownPending: boolean; withFriends: boolean; withTail: boolean; withDoors: boolean };
function simulateNight(o: NightOpts) {
  const occupied = new Map<number, PlayerSeatData>();
  const anchor = 1 + Math.floor(rnd() * o.n);
  const total = Math.round(o.n * o.fill);
  const arrivals: PlayerSeatData[] = [];
  for (let i = 0; i < total; i++) arrivals.push(P({ noPhoto: rnd() < o.ratio, activityCount: rnd() < 0.2 ? 1 : 6 }));
  // الأصحاب: كلّ ثنائيّ متتالٍ وصل معاً (وزن ١٫٠ — الوصول المتزامن)
  const affinity = new Map<string, number>();
  if (o.withFriends) for (let i = 0; i + 1 < arrivals.length; i += 3) affinity.set(pairKey(personKey(arrivals[i]), personKey(arrivals[i + 1])), 1.0);
  let worst = 0, breaksWhileFree = 0, okInZone = 0;
  const seatedOrder: number[] = [];
  arrivals.forEach((p, idx) => {
    const pending = o.knownPending ? arrivals.slice(idx + 1).filter(a => a.noPhoto).length : 0;
    const ctx: EvaluationContext = {
      maxPlayers: o.n, penaltyNeighborHistory: new Map(), constraintParams: {},
      reservedTailSeats: o.withTail ? 3 : 0, doorSeats: o.withDoors ? [Math.ceil(o.n / 2), Math.ceil(o.n / 2) + 1] : [],
      affinityPairs: affinity, spreadFromSeats: seatedOrder.slice(-3), photoZone: { anchor, pending },
    };
    const zoneBefore = expectedZone(occOf(occupied), ctx.photoZone!, o.n);
    const r = allocateSeatWithConstraints({ maxPlayers: o.n, occupiedSeats: occupied, newPlayer: p, seatingConfig: null, context: ctx });
    if (!p.noPhoto && zoneBefore.has(r.seat)) {
      // قابلٌ في الزاوية مسموح فقط إن لم يبقَ غيرها
      let freeOutside = 0;
      for (let s = 1; s <= o.n; s++) if (!occupied.has(s) && !zoneBefore.has(s)) freeOutside++;
      if (freeOutside > 0) okInZone++;
    }
    occupied.set(r.seat, { ...p, physicalId: r.seat });
    seatedOrder.push(r.seat);
    const sc = segCount(occupied, o.n);
    worst = Math.max(worst, sc);
    if (sc > 1 && occupied.size < o.n) breaksWhileFree++;
  });
  const rep = zoneReport(occOf(occupied), { anchor, pending: 0 }, o.n);
  return { contiguous: segCount(occupied, o.n) <= 1, worst, breaksWhileFree, okInZone, occupied, anchor, fixable: rep.contiguous || !!rep.fix };
}

{
  const configs: Array<[string, Partial<NightOpts>]> = [
    ['١٦ مقعداً · ٣٠٪ · ٨٥٪ امتلاء · بلا حجز معروف', { n: 16, ratio: 0.3, fill: 0.85 }],
    ['٢٠ مقعداً · ١٥٪ · ٩٠٪ · حجز معروف', { n: 20, ratio: 0.15, fill: 0.9, knownPending: true }],
    ['٢٧ مقعداً · ٣٠٪ · ٨٥٪ · أصحاب + ذيل + أبواب', { n: 27, ratio: 0.3, fill: 0.85, withFriends: true, withTail: true, withDoors: true }],
    ['٢٧ مقعداً · ٥٠٪ · ٨٠٪ · أصحاب · حجز معروف', { n: 27, ratio: 0.5, fill: 0.8, withFriends: true, knownPending: true }],
    ['٢٢ مقعداً · ٢٠٪ · امتلاء تامّ', { n: 22, ratio: 0.2, fill: 1 }],
  ];
  for (const [label, over] of configs) {
    const opts: NightOpts = { n: 20, ratio: 0.3, fill: 0.85, knownPending: false, withFriends: false, withTail: false, withDoors: false, ...over } as NightOpts;
    let contiguous = 0, okInZone = 0, breaksFree = 0, fixable = 0;
    const RUNS = 300;
    for (let i = 0; i < RUNS; i++) {
      const r = simulateNight(opts);
      if (r.contiguous) contiguous++;
      if (r.fixable) fixable++;
      okInZone += r.okInZone;
      breaksFree += r.breaksWhileFree;
    }
    const pct = Math.round((contiguous / RUNS) * 1000) / 10;
    console.log(`     ${label}: متّصلة في ${pct}% · قابلة للإصلاح بلمسة ${Math.round((fixable / RUNS) * 1000) / 10}% · قابلون في الزاوية وغيرُها فارغ: ${okInZone}`);
    // بلا معرفة مسبقة لا ضمان رياضيّ — والامتلاء التامّ يُجلس آخر الواصلين حيث بقي كرسيّ.
    // الحدود: ٩٩٪ بحجزٍ معروف، ٩٧٪ بدونه، ٩٠٪ عند الامتلاء التامّ — والباقي يصلحه زرّ الإصلاح.
    const floor = opts.knownPending ? 0.99 : opts.fill >= 1 ? 0.9 : 0.97;
    check(`${label} — متّصلة في ≥ ${Math.round(floor * 100)}% من الليالي`, contiguous / RUNS >= floor, `${pct}%`);
    check(`${label} — المنكسرة قابلة للإصلاح بلمسة في ≥ ٩٩٪`, fixable / RUNS >= 0.99, `${fixable}/${RUNS}`);
    check(`${label} — لا قابل في الزاوية ما دام غيرها فارغاً`, okInZone === 0, `${okInZone}`);
  }
}

// ══════════════════════════════════════════════════════
section('3) الأولويّات');
{
  const n = 16;
  // أ) زوجٌ ممنوع صلب: لا يجلس الرافض ملاصقاً لخصمه حتى لو كان ذلك طرف الكتلة
  const occ = new Map<number, PlayerSeatData>();
  const a = P({ noPhoto: true, phone: '0791111111' }); occ.set(1, { ...a, physicalId: 1 });
  const b = P({ noPhoto: true, phone: '0792222222' });
  const cfg: SeatingConfig = { noAdjacentPairs: [{ player1Phone: '0791111111', player1Name: 'أ', player2Phone: '0792222222', player2Name: 'ب' }] };
  const r = allocateSeatWithConstraints({ maxPlayers: n, occupiedSeats: occ, newPlayer: b, seatingConfig: cfg, context: { maxPlayers: n, penaltyNeighborHistory: new Map(), constraintParams: {}, photoZone: { anchor: 1, pending: 0 } } });
  const d = Math.min(Math.abs(r.seat - 1), n - Math.abs(r.seat - 1));
  check('الممنوع صلب: لا يُلصَق بخصمه داخل الزاوية', d > 2, `جلس في ${r.seat}`);

  // ب) صاحبان رافضان وصلا معاً: الزاوية تجمعهما رغم «أبعد الأصحاب»
  const occ2 = new Map<number, PlayerSeatData>();
  const f1 = P({ noPhoto: true }); occ2.set(5, { ...f1, physicalId: 5 });
  const f2 = P({ noPhoto: true });
  const aff = new Map([[pairKey(personKey(f1), personKey(f2)), 1.0]]);
  const r2 = allocateSeatWithConstraints({ maxPlayers: n, occupiedSeats: occ2, newPlayer: f2, seatingConfig: null, context: { maxPlayers: n, penaltyNeighborHistory: new Map(), constraintParams: {}, affinityPairs: aff, photoZone: { anchor: 5, pending: 0 } } });
  check('صاحبان رافضان: يجلس الثاني ملاصقاً (٦)', r2.seat === 6, `جلس في ${r2.seat}`);

  // ج) بلا زاوية: السلوك القديم كما هو (الصاحب يُبعَد)
  const r3 = allocateSeatWithConstraints({ maxPlayers: n, occupiedSeats: occ2, newPlayer: f2, seatingConfig: null, context: { maxPlayers: n, penaltyNeighborHistory: new Map(), constraintParams: {}, affinityPairs: aff } });
  check('بلا زاوية: «أبعد الأصحاب» يعمل كما كان', Math.min(Math.abs(r3.seat - 5), n - Math.abs(r3.seat - 5)) >= 2, `جلس في ${r3.seat}`);

  // د) المثبَّت يغلب الزاوية
  const r4 = allocateSeatWithConstraints({ maxPlayers: n, occupiedSeats: new Map(), newPlayer: P({ noPhoto: true, phone: '0793333333' }), seatingConfig: null, context: { maxPlayers: n, penaltyNeighborHistory: new Map(), constraintParams: {}, pinnedSeats: [{ seatNumber: 9, phone: '0793333333', playerName: 'x' }], photoZone: { anchor: 1, pending: 0 } } });
  check('التثبيت يغلب: الرافض المثبَّت يأخذ مقعده (٩)', r4.seat === 9);

  // هـ) المقعد المثبَّت لغيره لا يُعطى لرافض ولو كان طرف الكتلة
  const occ5 = new Map<number, PlayerSeatData>([[1, { ...P({ noPhoto: true }), physicalId: 1 }]]);
  const r5 = allocateSeatWithConstraints({ maxPlayers: n, occupiedSeats: occ5, newPlayer: P({ noPhoto: true }), seatingConfig: null, context: { maxPlayers: n, penaltyNeighborHistory: new Map(), constraintParams: {}, pinnedSeats: [{ seatNumber: 2, phone: '0790000999', playerName: 'غائب' }], photoZone: { anchor: 1, pending: 0 } } });
  check('مقعد غيره المثبَّت محفوظ: يمتدّ للخلف (١٦)', r5.seat === 16, `جلس في ${r5.seat}`);

  // و) المتفرّج الرافض: الزاوية تسبق تفضيل الذيل
  const occ6 = new Map<number, PlayerSeatData>([[3, { ...P({ noPhoto: true }), physicalId: 3 }], [4, { ...P({ noPhoto: true }), physicalId: 4 }]]);
  const r6 = allocateSeatWithConstraints({ maxPlayers: n, occupiedSeats: occ6, newPlayer: P({ noPhoto: true }), seatingConfig: null, context: { maxPlayers: n, penaltyNeighborHistory: new Map(), constraintParams: {}, reservedTailSeats: 3, preferTailSeats: true, photoZone: { anchor: 3, pending: 0 } } });
  check('المتفرّج الرافض يلتصق بالكتلة لا بالذيل (٥)', r6.seat === 5, `جلس في ${r6.seat}`);
}

// ══════════════════════════════════════════════════════
section('4) «رتّب تلقائيّاً»');
{
  let allContig = 0, atAnchor = 0, lockedKept = 0;
  const RUNS = 60;
  for (let i = 0; i < RUNS; i++) {
    const n = 18 + Math.floor(rnd() * 10);
    const anchor = 1 + Math.floor(rnd() * n);
    const players: PlayerSeatData[] = [];
    const used = new Set<number>();
    const count = Math.round(n * 0.85);
    for (let k = 0; k < count; k++) {
      let s; do { s = 1 + Math.floor(rnd() * n); } while (used.has(s));
      used.add(s);
      players.push(P({ noPhoto: rnd() < 0.3, physicalId: s }));
    }
    // مقعد مقفل واحد (محجوز) — لا يتحرّك
    const lockedP = players.pop()!;
    const locked = new Map<number, PlayerSeatData>([[lockedP.physicalId!, lockedP]]);
    const res = reshuffleSeating({ maxPlayers: n, players, seatingConfig: null, context: { maxPlayers: n, penaltyNeighborHistory: new Map(), constraintParams: {}, photoZone: { anchor, pending: 0 } }, lockedSeats: locked });
    const after = new Map<number, PlayerSeatData>();
    for (const a of res.arrangement) {
      const src = players.find(p => p.physicalId === a.fromSeat) || lockedP;
      after.set(a.seatNumber, src);
    }
    if (!after.has(lockedP.physicalId!)) after.set(lockedP.physicalId!, lockedP);
    if (segCount(after, n) <= 1) allContig++;
    const npSeats = Array.from(after.entries()).filter(([, p]) => p.noPhoto).map(([s]) => s);
    const main = mainSegment(segmentsOf(npSeats, n), anchor, n);
    // رافضٌ مقفل خارج المرساة ⇒ الكتلة تُبنى حوله (الاتّصال قبل الموضع)
    const anchoredOk = !main
      || (lockedP.noPhoto && main.includes(lockedP.physicalId!))
      || main.includes(anchor)
      || (after.get(anchor) && !after.get(anchor)!.noPhoto && (forwardOffset(main[0], anchor, n) === 1 || main.includes(((anchor - 2 + n) % n) + 1)));
    if (anchoredOk) atAnchor++;
    else console.log(`     ⚠️ n=${n} ⚓${anchor} الكتلة=${main.join(',')} مقفل=${lockedP.physicalId}${lockedP.noPhoto ? '📵' : ''}`);
    if (!res.arrangement.some(a => a.fromSeat === lockedP.physicalId && a.seatNumber !== lockedP.physicalId)) lockedKept++;
  }
  check(`الكتلة متّصلة بعد كلّ ترتيب (${RUNS} غرفة)`, allContig === RUNS, `${allContig}/${RUNS}`);
  check('الكتلة عند مرساتها (أو ملاصقة لها حين يشغلها مقفل)', atAnchor === RUNS, `${atAnchor}/${RUNS}`);
  check('المقفل لا يتحرّك', lockedKept === RUNS);
}

// ══════════════════════════════════════════════════════
section('5) إصلاحات القيود');
{
  const types = (cfg: SeatingConfig | null) => resolveConstraintConfigs(cfg).filter(c => c.enabled).map(c => c.type).sort();
  const defaults = types(null);
  check('الافتراضيّ يضمّ الأصحاب وقيد الجنس والعقوبة والجدد والباب', ['SOCIAL_AFFINITY_SEPARATION', 'PLAYER_GENDER_CONSTRAINT', 'PENALTY_NEIGHBOR_AVOIDANCE', 'NEW_PLAYER_SEPARATION', 'DOOR_PROXIMITY_AVOIDANCE'].every(t => defaults.includes(t)), defaults.join(','));
  const doorOnly = types({ engineEnabled: true, constraints: [{ type: 'DOOR_PROXIMITY_AVOIDANCE', enabled: true, priority: 5, params: {} }] });
  check('حقن قيد الباب وحده لا يُسقط الافتراضيّ', JSON.stringify(doorOnly) === JSON.stringify(defaults), doorOnly.join(','));
  const weekly = types({ engineEnabled: true, constraints: [{ type: 'NEW_PLAYER_SEPARATION', enabled: true, priority: 3, params: {} }, { type: 'PENALTY_NEIGHBOR_AVOIDANCE', enabled: true, priority: 2, params: {} }] });
  check('قالبٌ ناقص (كالأسبوعيّ) يكتمل بالأصحاب وقيد الجنس', weekly.includes('SOCIAL_AFFINITY_SEPARATION') && weekly.includes('PLAYER_GENDER_CONSTRAINT'));
  const off = types({ engineEnabled: true, constraints: [{ type: 'SOCIAL_AFFINITY_SEPARATION', enabled: false, priority: 3, params: {} }] });
  check('الإطفاء الصريح محترم', !off.includes('SOCIAL_AFFINITY_SEPARATION'));
  const merged = resolveConstraintConfigs({
    engineEnabled: true,
    noAdjacentPairs: [{ player1Phone: '0791', player1Name: 'أ', player2Phone: '0792', player2Name: 'ب' }],
    constraints: [{ type: 'NO_ADJACENT_PAIRS', enabled: true, priority: 1, params: { pairs: [] } }],
  }).find(c => c.type === 'NO_ADJACENT_PAIRS')!;
  check('الأزواج العالميّة لا تضيع حين القائمة فيها قيدٌ بأزواجٍ فارغة', (merged.params.pairs || []).length === 1 && merged.enabled);
  const nap = new NoAdjacentPairsConstraint({ params: { pairs: [{ player1Phone: '+962791234567', player1Name: 'أ', player2Phone: '0797654321', player2Name: 'ب' }] } });
  const occ = new Map<number, PlayerSeatData>([[4, { ...P({ phone: '962797654321' }), physicalId: 4 }]]);
  const ev = nap.evaluate(occ, 5, P({ phone: '0791234567' }), { maxPlayers: 16, penaltyNeighborHistory: new Map(), constraintParams: {} });
  check('الزوج الممنوع يُطابَق رغم +962/962', !ev.satisfied);
  const noPhone = nap.evaluate(new Map([[4, { ...P({ phone: '' }), physicalId: 4 }]]), 5, P({ phone: '' }), { maxPlayers: 16, penaltyNeighborHistory: new Map(), constraintParams: {} });
  check('بلا هاتف لا مخالفة وهميّة', noPhone.satisfied);
  check('آخر الواصلين بالزمن لا بأعلى رقم', JSON.stringify(lastArrivalSeats([{ physicalId: 1, seatedAt: 300 }, { physicalId: 7, seatedAt: 100 }, { physicalId: 9, seatedAt: 200 }, { physicalId: 12, seatedAt: 50 }], 2)) === '[1,9]');
}

// ══════════════════════════════════════════════════════
section('6) حرّاس بنيويّون');
{
  const here = dirname(fileURLToPath(import.meta.url));
  const back = readFileSync(join(here, '../game/seating/photo-zone.ts'), 'utf8');
  const front = readFileSync(join(here, '../../../frontend/src/lib/photoZone.ts'), 'utf8');
  const body = (s: string) => s.slice(s.indexOf('export interface PhotoZoneCtx')).replace(/\r\n/g, '\n').trim();
  check('نسخة الواجهة (lib/photoZone.ts) مطابقة حرفيّاً للخادم', body(back) === body(front));

  const state = {
    roomId: 'r', phase: 'LOBBY', photoZone: { on: true, anchor: 3, pending: 1 },
    players: [
      { physicalId: 1, name: 'أنا', phone: '0791', isAlive: true, noPhoto: true },
      { physicalId: 2, name: 'غيري', phone: '0792', isAlive: true, noPhoto: true },
    ],
    config: { maxPlayers: 16 },
  };
  const mine = projectStateFor(state, 1);
  check('الهاتف يرى علمه هو', mine.players.find((p: any) => p.physicalId === 1)?.noPhoto === true);
  check('ولا يرى علم غيره', mine.players.find((p: any) => p.physicalId === 2)?.noPhoto === undefined);
  check('ولا المرساة ولا المنتظرين — فقط أنّ الميزة مفعّلة', mine.photoZone === undefined && mine.photoZoneOn === true);
  const pub = projectStateFor(state, null);
  check('الإسقاط العامّ (متفرّج/غريب) بلا أيّ علم', pub.players.every((p: any) => p.noPhoto === undefined));
}

console.log(`\n══ ${pass} ✅ · ${fail} ❌ ══`);
if (fail) { for (const f of failures) console.log('  ❌ ' + f); process.exit(1); }
