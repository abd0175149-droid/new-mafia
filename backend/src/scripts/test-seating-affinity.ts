// ══════════════════════════════════════════════════════
// 🧪 اختبار محرّك الجلوس بعد قرارات المالك المقفلة (2026-09-04) — نقيّ بلا DB
// ══════════════════════════════════════════════════════
// يغطّي:
//   ① كسر التعادل بالتباعد بدل «الأصغر رقماً» (S1) — سبب تجاور الأصدقاء
//   ② قيد التقارب الاجتماعيّ وأوزانه، والوصول المتزامن أثقلها (S4)
//   ③ قلب خصم مقاعد الذيل لصالح المتفرّج (القرار المقفل ١)
//   ④ إعادة الترتيب الدفعيّة تحترم المقاعد المقفلة والمثبَّتة (S2)
//   ⑤ الحارس البنيويّ: لا محرّك لعبةٍ يقرأ state.spectators
//
// تشغيل: npx tsx src/scripts/test-seating-affinity.ts
// ══════════════════════════════════════════════════════

import { allocateSeatWithConstraints, reshuffleSeating } from '../game/seating/engine.js';
import { SocialAffinityConstraint, AFFINITY_WEIGHTS } from '../game/seating/constraints/social-affinity.constraint.js';
import { personKey, pairKey, circularDistance } from '../game/seating/types.js';
import type { PlayerSeatData, EvaluationContext, SeatingConfig } from '../game/seating/types.js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t: string) { console.log(`\n━━━ ${t} ━━━`); }

const P = (over: Partial<PlayerSeatData> = {}): PlayerSeatData => ({
  playerId: null, phone: '', name: 'لاعب', gender: 'MALE',
  totalMatches: 5, activityCount: 5, rankRR: 100, rankTier: 'SOLDIER',
  genderConstraint: 'NONE', ...over,
});

const ctx = (over: Partial<EvaluationContext> = {}): EvaluationContext => ({
  maxPlayers: 20, penaltyNeighborHistory: new Map(), constraintParams: {}, ...over,
});

const CONF: SeatingConfig = {
  engineEnabled: true, strictness: 'relaxed',
  constraints: [{ type: 'SOCIAL_AFFINITY_SEPARATION', enabled: true, priority: 3, params: {} }],
};

// ══════════════════════════════════════════════════════
section('1) 🎲 كسر التعادل بالتباعد — لا مزيد من 1,2,3 لمن وصلوا معاً');
{
  const occupied = new Map<number, PlayerSeatData>();
  occupied.set(1, P({ name: 'الأوّل', phone: '0790000001' }));

  // كلّ المقاعد متساوية القيود؛ الفرق الوحيد هو التباعد عن المقعد 1
  let adjacentCount = 0;
  for (let i = 0; i < 12; i++) {
    const r = allocateSeatWithConstraints({
      maxPlayers: 20, occupiedSeats: occupied, newPlayer: P({ name: 'الثاني', phone: '0790000002' }),
      seatingConfig: CONF, context: ctx({ spreadFromSeats: [1] }),
    });
    if (circularDistance(r.seat, 1, 20) <= 1) adjacentCount++;
  }
  check('لا يجلس أبداً ملاصقاً للواصل قبله (12 محاولة)', adjacentCount === 0, `التصق ${adjacentCount} مرّة`);

  const r = allocateSeatWithConstraints({
    maxPlayers: 20, occupiedSeats: occupied, newPlayer: P({ name: 'الثاني' }),
    seatingConfig: CONF, context: ctx({ spreadFromSeats: [1] }),
  });
  check('يختار الأبعد دائريّاً (11 على طاولة 20)', r.seat === 11, `اختار ${r.seat}`);

  // بلا spreadFromSeats: التعادل التامّ يُحسم عشوائيّاً لا بالرقم الأصغر
  const picks = new Set<number>();
  for (let i = 0; i < 25; i++) {
    picks.add(allocateSeatWithConstraints({
      maxPlayers: 20, occupiedSeats: new Map(), newPlayer: P(),
      seatingConfig: CONF, context: ctx(),
    }).seat);
  }
  check('بلا مقاعد تباعد: التوزيع عشوائيّ لا ثابت على 1', picks.size > 3, `عدد المقاعد المختلفة ${picks.size}`);
}

// ══════════════════════════════════════════════════════
section('2) 🤝 قيد التقارب: الوصول المتزامن أثقل الإشارات');
{
  const a = P({ name: 'أحمد', phone: '0790000011', playerId: 11 });
  const b = P({ name: 'خالد', phone: '0790000022', playerId: 22 });
  const keyA = personKey(a), keyB = personKey(b);

  check('الوصول المتزامن هو الأعلى وزناً', AFFINITY_WEIGHTS.SIMULTANEOUS_ARRIVAL === 1.0
    && AFFINITY_WEIGHTS.SIMULTANEOUS_ARRIVAL > AFFINITY_WEIGHTS.GROUP_BOOKING
    && AFFINITY_WEIGHTS.GROUP_BOOKING > AFFINITY_WEIGHTS.MUTUAL_FOLLOW
    && AFFINITY_WEIGHTS.MUTUAL_FOLLOW > AFFINITY_WEIGHTS.REPEATED_ADJACENCY
    && AFFINITY_WEIGHTS.REPEATED_ADJACENCY > AFFINITY_WEIGHTS.ONE_WAY_FOLLOW);

  const affinity = new Map<string, number>([[pairKey(keyA, keyB), AFFINITY_WEIGHTS.SIMULTANEOUS_ARRIVAL]]);
  const c = new SocialAffinityConstraint({});
  const occupied = new Map<number, PlayerSeatData>([[5, a]]);
  const context = ctx({ affinityPairs: affinity });

  const adj = c.evaluate(occupied, 6, b, context);
  const two = c.evaluate(occupied, 7, b, context);
  const far = c.evaluate(occupied, 12, b, context);
  check('الجار المباشر يخالف بنتيجة 0', !adj.satisfied && adj.score === 0, `score=${adj.score}`);
  check('على بُعد مقعدين نتيجة أعلى', !two.satisfied && two.score === 0.5, `score=${two.score}`);
  check('البعيد لا يخالف', far.satisfied && far.score === 1.0);
  check('القيد مرن (أولويّة 3 > 2) فلا يمنع الجلوس', c.priority === 3);

  // وزن أخفّ ⇒ عقوبة أخفّ
  const weak = new Map<string, number>([[pairKey(keyA, keyB), AFFINITY_WEIGHTS.ONE_WAY_FOLLOW]]);
  const weakRes = c.evaluate(occupied, 6, b, ctx({ affinityPairs: weak }));
  check('المتابعة الأحاديّة أخفّ من الوصول المتزامن', weakRes.score > adj.score, `${weakRes.score} > ${adj.score}`);

  // الأثر الفعليّ في المحرّك: لا يُجلسهما متجاورَين ما دام ثمّة بديل
  let stuck = 0;
  for (let i = 0; i < 12; i++) {
    const r = allocateSeatWithConstraints({
      maxPlayers: 20, occupiedSeats: occupied, newPlayer: b,
      seatingConfig: CONF, context: ctx({ affinityPairs: affinity }),
    });
    if (circularDistance(r.seat, 5, 20) <= 2) stuck++;
  }
  check('المحرّك يبعده عن صديقه في كلّ المحاولات', stuck === 0, `التصق ${stuck}`);
}

// ══════════════════════════════════════════════════════
section('3) 👁️ المتفرّج يجلس في الحلقة لكن في الذيل والأبعد عن الأحياء');
{
  const occupied = new Map<number, PlayerSeatData>();
  for (let i = 1; i <= 8; i++) occupied.set(i, P({ name: `حيّ${i}` }));

  const normal = allocateSeatWithConstraints({
    maxPlayers: 20, occupiedSeats: occupied, newPlayer: P({ name: 'لاعب عاديّ' }),
    seatingConfig: CONF, context: ctx({ reservedTailSeats: 5 }),
  });
  check('اللاعب العاديّ يتجنّب الذيل (16..20)', normal.seat < 16, `اختار ${normal.seat}`);

  const spec = allocateSeatWithConstraints({
    maxPlayers: 20, occupiedSeats: occupied, newPlayer: P({ name: 'متفرّج' }),
    seatingConfig: CONF,
    context: ctx({
      reservedTailSeats: 5,
      preferTailSeats: true,
      spreadFromSeats: [1, 2, 3, 4, 5, 6, 7, 8],
    }),
  });
  check('المتفرّج يُفضَّل له الذيل', spec.seat >= 16, `اختار ${spec.seat}`);
  check('المتفرّج داخل الحلقة برقم مقعد صالح', spec.seat >= 1 && spec.seat <= 20);
  const dmin = Math.min(...[1, 2, 3, 4, 5, 6, 7, 8].map(o => circularDistance(spec.seat, o, 20)));
  check('المتفرّج بعيد عن أقرب حيّ (≥ 3 مقاعد)', dmin >= 3, `أقرب حيّ على بُعد ${dmin}`);
}

// ══════════════════════════════════════════════════════
section('4) 🪄 إعادة الترتيب الدفعيّة: تحترم المقفل والمثبَّت وتفكّ التجاور');
{
  const mk = (n: string, ph: string, seat: number) => P({ name: n, phone: ph, physicalId: seat });
  const friendsA = pairKey(personKey({ phone: '0790000001', name: 'أ' }), personKey({ phone: '0790000002', name: 'ب' }));
  const friendsB = pairKey(personKey({ phone: '0790000003', name: 'ج' }), personKey({ phone: '0790000004', name: 'د' }));
  const affinity = new Map<string, number>([[friendsA, 1.0], [friendsB, 1.0]]);

  const movable = [
    mk('أ', '0790000001', 1), mk('ب', '0790000002', 2),
    mk('ج', '0790000003', 3), mk('د', '0790000004', 4),
    mk('هـ', '0790000005', 5), mk('و', '0790000006', 6),
  ];
  const locked = new Map<number, PlayerSeatData>([[10, P({ name: 'مقفل', phone: '0790000099', physicalId: 10 })]]);

  const res = reshuffleSeating({
    maxPlayers: 12, players: movable, seatingConfig: CONF,
    context: ctx({ maxPlayers: 12, affinityPairs: affinity }),
    lockedSeats: locked,
  });

  check('نجحت إعادة الترتيب', res.success);
  const bySeat = new Map(res.arrangement.map(x => [x.seatNumber, x]));
  check('المقعد المقفل لم يُمنح لأحد من القابلين للنقل',
    !res.arrangement.some(x => x.seatNumber === 10 && x.fromSeat !== 10));
  check('كلّ مقترح يحمل مقعده الأصليّ (مفتاح المطابقة)',
    res.arrangement.filter(x => x.fromSeat !== undefined).length === res.arrangement.length);

  const seatOf = (phone: string) => res.arrangement.find(x => x.phone === phone)?.seatNumber ?? -1;
  const dAB = circularDistance(seatOf('0790000001'), seatOf('0790000002'), 12);
  const dCD = circularDistance(seatOf('0790000003'), seatOf('0790000004'), 12);
  check('الصديقان أ/ب لم يعودا متجاورَين', dAB >= 2, `المسافة ${dAB}`);
  check('الصديقان ج/د لم يعودا متجاورَين', dCD >= 2, `المسافة ${dCD}`);
  check('لا مقعد مكرّر في الاقتراح',
    new Set(res.arrangement.map(x => x.seatNumber)).size === res.arrangement.length);

  // 📌 المثبَّت يأخذ مقعده بلا تقييم
  const pinned = reshuffleSeating({
    maxPlayers: 12,
    players: [mk('مثبَّت', '0790000077', 8), mk('عاديّ', '0790000088', 9)],
    seatingConfig: CONF,
    context: ctx({ maxPlayers: 12, pinnedSeats: [{ seatNumber: 3, phone: '0790000077', playerName: 'مثبَّت' }] }),
  });
  check('المثبَّت أخذ مقعده المثبَّت (3)',
    pinned.arrangement.find(x => x.phone === '0790000077')?.seatNumber === 3,
    JSON.stringify(pinned.arrangement.map(x => [x.name, x.seatNumber])));
  check('غير المثبَّت لم يأخذ المقعد المثبَّت',
    pinned.arrangement.find(x => x.phone === '0790000088')?.seatNumber !== 3);
}

// ══════════════════════════════════════════════════════
section('5) 🛡️ الحارس البنيويّ: لا محرّك لعبةٍ يقرأ state.spectators');
{
  // المتفرّجون خارج players عمداً. لو قرأ أيّ محرّكٍ هذه المصفوفة لدخلوا
  // طوابير النقاش/التصويت/الليل ومعادلة الفوز — وهو بالضبط سبب الحظر القديم.
  const ROOTS = ['src/game', 'src/sockets/day.socket.ts', 'src/sockets/night.socket.ts',
    'src/sockets/night-one.socket.ts', 'src/sockets/confrontation.socket.ts'];
  const base = process.cwd();
  const offenders: string[] = [];
  const scan = (rel: string) => {
    const abs = join(base, rel);
    let st;
    try { st = statSync(abs); } catch { return; }
    if (st.isDirectory()) {
      for (const f of readdirSync(abs)) scan(join(rel, f));
      return;
    }
    if (!rel.endsWith('.ts')) return;
    const txt = readFileSync(abs, 'utf8');
    // نتجاهل تعريف النوع نفسه في state.ts
    if (rel.replace(/\\/g, '/').endsWith('src/game/state.ts')) return;
    if (/\.spectators\b|getSpectators\s*\(/.test(txt)) offenders.push(rel);
  };
  ROOTS.forEach(scan);
  check('لا ملفّ في game/* أو أطوار اللعب يقرأ المتفرّجين', offenders.length === 0, offenders.join(', '));
}

console.log(`\n══════════════════════════════════════`);
console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
if (fail > 0) {
  console.log(`\n❌ الفشل:`);
  failures.forEach(f => console.log(`   - ${f}`));
  process.exit(1);
} else {
  console.log(`\n🎉 محرّك الجلوس يطبّق القرارات المقفلة، والمتفرّج معزول عن اللعبة.`);
  process.exit(0);
}
