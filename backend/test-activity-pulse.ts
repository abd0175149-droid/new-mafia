// 🧪 اختبار وحدة لاشتقاق نبض الليلة — بلا قاعدة بيانات وبلا Redis
// تشغيل: npx tsx test-activity-pulse.ts
import {
  toMinutes, slotDuration, orderedGameSlots, plannedBreakBefore,
  bindRoomSchedule, roomStatus, ordinalLabel, type RawSlot, type RoomMatchRow,
} from './src/services/activity-pulse.service.js';
import { projectActivityPulse, findMySeat } from './src/services/activity-pulse.projection.js';

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}
const MIN = 60_000;

// ليلةُ الفعاليّة: الخميس ٢٠:٠٠ **بتوقيت عمّان**، مكتوبةً كلحظةٍ مطلقة.
// ⚠️ لا تُبنَ التجهيزات بـ`new Date(y,m,d,h,m)` — ذلك توقيتُ الجهاز، فتمرّ
//    الاختبارات على جهاز المطوّر وتسقط على خادمٍ يعمل بـUTC.
const AMMAN_OFFSET_MIN = 180;   // الأردنّ +03:00 دائماً (أُلغي التوقيت الصيفيّ ٢٠٢٢)
const at = (h: number, m: number, plusDay = false) =>
  Date.UTC(2026, 7, 27 + (plusDay ? 1 : 0), h, m, 0, 0) - AMMAN_OFFSET_MIN * 60_000;
const DATE = new Date(at(20, 0));

const PLAN: RawSlot[] = [
  { kind: 'game',  label: 'اللعبة الأولى',  start: '19:45', end: '21:00' },
  { kind: 'break', label: 'استراحة',         start: '21:00', end: '21:20' },
  { kind: 'game',  label: 'اللعبة الثانية',  start: '21:20', end: '22:35' },
  { kind: 'break', label: 'استراحة',         start: '22:35', end: '22:50' },
  { kind: 'game',  label: 'اللعبة الثالثة',  start: '22:50', end: '00:05' },
];

const m = (id: number, s: number, e: number | null, winner: string | null = null): RoomMatchRow => ({
  id, createdAt: new Date(s), endedAt: e == null ? null : new Date(e),
  isActive: e == null, winner, totalRounds: 4,
});

// ══════════════ ١ · أدوات الوقت ══════════════
console.log('\n🧪 أدوات الوقت');
check('toMinutes: 21:20 = 1280', toMinutes('21:20') === 1280);
check('toMinutes: يرفض 24:00', toMinutes('24:00') === null);
check('toMinutes: يرفض 7:5', toMinutes('7:5') === null);
check('toMinutes: يرفض ما ليس نصّاً', toMinutes(1280 as any) === null);
check('slotDuration: عابرةً منتصف الليل', slotDuration({ kind: 'game', label: '', start: '22:50', end: '00:05' }) === 75);
check('slotDuration: عاديّة', slotDuration({ kind: 'game', label: '', start: '19:45', end: '21:00' }) === 75);
check('ordinalLabel: الرابعة', ordinalLabel(3) === 'اللعبة الرابعة');

// ══════════════ ٢ · ترتيب الشرائح ══════════════
console.log('\n🧪 ترتيب الشرائح والاستراحات');
{
  const g = orderedGameSlots(PLAN);
  check('شرائح اللعب وحدها تُعدّ (٣)', g.length === 3);
  check('مرتّبةٌ زمنيّاً مع لفّ منتصف الليل', g[2].start === '22:50');
  check('جدولٌ فارغ ⇒ لا شرائح', orderedGameSlots([]).length === 0);
  check('جدولٌ فاسد ⇒ لا شرائح', orderedGameSlots('x' as any).length === 0);
  check('الاستراحة بين ١ و٢ = ٢٠د', plannedBreakBefore(PLAN, 1) === 20);
  check('الاستراحة بين ٢ و٣ = ١٥د', plannedBreakBefore(PLAN, 2) === 15);
  check('قبل الأولى = ٠', plannedBreakBefore(PLAN, 0) === 0);
  check('خارج الجدول ⇒ افتراضيّ ١٥د', plannedBreakBefore(PLAN, 9) === 15);
}

// ══════════════ ٣ · الربط الترتيبيّ ══════════════
console.log('\n🧪 الربط الترتيبيّ — لا الزمنيّ');
{
  // الليلة متأخّرة: المباراة الثانية بدأت 21:41 وتقع داخل نافذة الشريحة الثانية،
  // لكنّ المباراة الثالثة ستبدأ 23:26 — أي داخل نافذة الثالثة المخطّطة أيضاً.
  const now = at(22, 47);
  const slots = bindRoomSchedule(PLAN, [
    m(1, at(19, 58), at(21, 14), 'MAFIA'),
    m(2, at(21, 41), null),
  ], DATE, now);

  check('ثلاث شرائح (٢ ملعوبة + ١ منتظرة)', slots.length === 3);
  check('الأولى done', slots[0].state === 'done' && slots[0].winner === 'MAFIA');
  check('الثانية live', slots[1].state === 'live');
  check('الثالثة future', slots[2].state === 'future');
  check('الترتيب ١ ٢ ٣', slots.map(s => s.ordinal).join('') === '123');
  check('اللاصق صحيح: الجارية هي «اللعبة الثانية»', slots[1].label === 'اللعبة الثانية');
  check('انحراف الأولى +13', slots[0].driftMin === 13);
  check('انحراف الثانية +21', slots[1].driftMin === 21);
  check('لا انحراف سالبٌ زائف للثالثة', (slots[2].driftMin ?? 0) > 0);
}

// ══════════════ ٤ · الربط الزمنيّ كان سينكسر هنا ══════════════
console.log('\n🧪 برهانُ سقوط الربط الزمنيّ');
{
  // ليلةٌ متأخّرة ٤٠ دقيقة: المباراة الثانية تبدأ 22:55 — داخل نافذة الشريحة الثالثة (22:50–00:05).
  const now = at(23, 10);
  const slots = bindRoomSchedule(PLAN, [
    m(1, at(20, 25), at(21, 50), 'CITIZEN'),
    m(2, at(22, 55), null),
  ], DATE, now);
  check('الجارية تبقى «اللعبة الثانية» لا الثالثة', slots[1].state === 'live' && slots[1].label === 'اللعبة الثانية');
  check('الشريحة الثالثة ما زالت منتظرة', slots[2].state === 'future');
}

// ══════════════ ٥ · التقدير والتوريث ══════════════
console.log('\n🧪 تقدير ما لم يبدأ');
{
  const now = at(21, 30);
  const slots = bindRoomSchedule(PLAN, [m(1, at(19, 58), at(21, 14), 'MAFIA')], DATE, now);
  // نهاية الأولى 21:14 + استراحة ٢٠د = 21:34، والخطّة تقول 21:20 ⇒ يفوز الواقع
  check('التوقّع يُشتقّ من النهاية الفعليّة + الاستراحة', slots[1].projectedStart === at(21, 34));
  check('المدّة المقدَّرة = متوسّط ليلتك (٧٦د)', Math.round((slots[1].projectedEnd - slots[1].projectedStart) / MIN) === 76);
  check('التأخّر يُورَّث للثالثة', slots[2].projectedStart > at(22, 50));
}
{
  // ليلةٌ سابقةٌ لورقتها: لا نُبكّر قبل الخطّة
  const now = at(20, 30);
  const slots = bindRoomSchedule(PLAN, [m(1, at(19, 40), at(20, 25), 'MAFIA')], DATE, now);
  check('التبكير لا يُقدّم الشريحة قبل وقت الخطّة', slots[1].projectedStart === at(21, 20));
}

// ══════════════ ٦ · لعبةٌ خارج الجدول ══════════════
console.log('\n🧪 لعبةٌ زائدة عن الجدول');
{
  const now = at(0, 30, true);
  const slots = bindRoomSchedule(PLAN, [
    m(1, at(19, 58), at(21, 0), 'MAFIA'),
    m(2, at(21, 15), at(22, 20), 'CITIZEN'),
    m(3, at(22, 35), at(23, 40), 'MAFIA'),
    m(4, at(23, 55), null),
  ], DATE, now);
  check('أربع شرائح لا ثلاث', slots.length === 4);
  check('الرابعة outsidePlan', slots[3].outsidePlan === true);
  check('الرابعة بلا انحراف (لا شريحة تُقارن بها)', slots[3].driftMin === null);
  check('الرابعة تحمل لاصقاً مولَّداً', slots[3].label === 'اللعبة الرابعة');
  check('الثلاث الأولى ليست outsidePlan', slots.slice(0, 3).every(s => !s.outsidePlan));
}

// ══════════════ ٧ · شريحةٌ لم تُلعب ══════════════
console.log('\n🧪 شريحةٌ بلا مباراة');
{
  const now = at(1, 0, true);
  const slots = bindRoomSchedule(PLAN, [
    m(1, at(19, 58), at(21, 14), 'MAFIA'),
    m(2, at(21, 41), at(23, 7), 'CITIZEN'),
  ], DATE, now);
  check('الثالثة تبقى future حتّى يحذفها الموجّه', slots[2].state === 'future');
  check('الحالة break لا ended', roomStatus(slots) === 'break');
}

// ══════════════ ٨ · حالات الغرفة ══════════════
console.log('\n🧪 حالة الغرفة');
{
  const empty = bindRoomSchedule(PLAN, [], DATE, at(19, 0));
  check('لا مباريات ⇒ pre', roomStatus(empty) === 'pre');
  check('لا مباريات ⇒ كلّها future', empty.every(s => s.state === 'future'));

  const live = bindRoomSchedule(PLAN, [m(1, at(19, 58), null)], DATE, at(20, 30));
  check('مباراةٌ جارية ⇒ live', roomStatus(live) === 'live');

  const doneAll = bindRoomSchedule([], [
    m(1, at(19, 58), at(21, 0), 'MAFIA'),
    m(2, at(21, 20), at(22, 30), 'CITIZEN'),
  ], DATE, at(23, 0));
  check('جدولٌ فارغ ⇒ المباريات وحدها', doneAll.length === 2);
  check('جدولٌ فارغ ⇒ كلّها outsidePlan', doneAll.every(s => s.outsidePlan));
  check('كلّها منتهية ⇒ ended', roomStatus(doneAll) === 'ended');
}

// ══════════════ ٩ · ليلةٌ تعبر منتصف الليل ══════════════
console.log('\n🧪 عبور منتصف الليل');
{
  const now = at(0, 30, true);
  const slots = bindRoomSchedule(PLAN, [
    m(1, at(19, 58), at(21, 14), 'MAFIA'),
    m(2, at(21, 41), at(23, 7), 'CITIZEN'),
    m(3, at(23, 26), null),
  ], DATE, now);
  check('الشريحة الثالثة تُرسَى في اليوم التالي', slots[2].planStart === '22:50');
  check('انحراف الثالثة +36 لا −١٤٠٤', slots[2].driftMin === 36);
  check('الثالثة live بعد منتصف الليل', slots[2].state === 'live');
}

// ══════════════ ١٠ · الإسقاط — ما لا يُبنى لا يُسرَّب ══════════════
console.log('\n🧪 الإسقاط والحراسة');
const ROSTER = [
  { physicalId: 1, playerId: 11, phone: '0790000001', name: 'أ', role: 'GODFATHER',     isAlive: true },
  { physicalId: 2, playerId: 12, phone: '0790000002', name: 'ب', role: 'MAFIA_REGULAR', isAlive: true },
  { physicalId: 3, playerId: 13, phone: '0790000003', name: 'ج', role: 'DOCTOR',        isAlive: true },
  { physicalId: 4, playerId: 14, phone: '0790000004', name: 'د', role: 'CITIZEN',       isAlive: false },
  { physicalId: 5, playerId: 15, phone: '0790000005', name: 'ه', role: 'JESTER',        isAlive: true },
];
const mkState = (over: any = {}) => ({
  phase: 'NIGHT', round: 3, rolesConfirmed: true, players: ROSTER,
  gameTimer: { totalSeconds: 5400, startedAt: 1, expired: false },
  config: { isRemote: false }, ...over,
});
{
  const out = projectActivityPulse(mkState(), 3)!;
  const j = JSON.stringify(out);
  check('لا مصفوفة لاعبين في المخرَج', !j.includes('players'));
  check('لا اسم يتسرّب', !j.includes('GODFATHER') && !j.includes('DOCTOR'));
  check('لا هاتف يتسرّب', !j.includes('0790000001'));
  check('لا أسماء عربيّة تتسرّب', !j.includes('"أ"') && !j.includes('"ه"'));
  check('الأعداد صحيحة: ٢ مافيا · ١ مواطن · ١ مستقلّ',
    out.live.teamCounts!.mafiaAlive === 2 &&
    out.live.teamCounts!.citizenAlive === 1 &&
    out.live.teamCounts!.neutralAlive === 1);
  check('الإجماليّات تُحمل للمقام', out.live.teamTotals!.citizenAlive === 2);
  check('me يحمل المقعد والحياة فقط', out.me!.seat === 3 && out.me!.isAlive === true && Object.keys(out.me!).length === 3);
  check('المؤقّت يمرّ كما هو', out.live.timer!.totalSeconds === 5400);
}
{
  const out = projectActivityPulse(mkState({ rolesConfirmed: false }), 3)!;
  check('لا أعداد قبل rolesConfirmed', out.live.teamCounts === null && out.live.teamTotals === null);
}
{
  const out = projectActivityPulse(mkState({ config: { isRemote: true } }), 3)!;
  check('غرفةٌ عن بُعد: الميزان محجوب', out.live.teamCounts === null);
  check('غرفةٌ عن بُعد: التقدّم الزمنيّ يبقى', out.live.round === 3 && out.live.phase === 'NIGHT');
  check('العَلَم isRemote يصل للواجهة', out.live.isRemote === true);
}
{
  const out = projectActivityPulse(mkState({ gameTimer: null }), null)!;
  check('مؤقّتٌ معطّل ⇒ null', out.live.timer === null);
  check('لا مقعد ⇒ me = null', out.me === null);
  check('حالةٌ غائبة ⇒ null', projectActivityPulse(null, 1) === null);
}
{
  const out = projectActivityPulse(mkState(), 99)!;
  check('مقعدٌ غير موجود ⇒ me = null', out.me === null);
}
{
  const dead = projectActivityPulse(mkState(), 4)!;
  check('لاعبٌ أُقصي: isAlive=false والميزان يبقى', dead.me!.isAlive === false && dead.live.teamCounts !== null);
}

// ══════════════ ١١ · إيجاد المقعد ══════════════
console.log('\n🧪 إيجاد المقعد');
{
  check('بالحساب', findMySeat(mkState(), 13, null) === 3);
  check('بالهاتف', findMySeat(mkState(), null, '0790000005') === 5);
  check('لا مطابقة ⇒ null', findMySeat(mkState(), 999, '0799999999') === null);
  check('حالةٌ غائبة ⇒ null', findMySeat(null, 13, null) === null);
}

// ══════════════ ١٢ · الغرف المتوازية ══════════════
console.log('\n🧪 الغرف المتوازية — العدّ يخصّ الغرفة');
{
  const now = at(22, 47);
  const room1 = bindRoomSchedule(PLAN, [
    m(1, at(19, 58), at(21, 14), 'MAFIA'),
    m(2, at(21, 41), null),
  ], DATE, now);
  const room2 = bindRoomSchedule(PLAN, [
    m(11, at(20, 6), at(21, 6), 'CITIZEN'),
    m(12, at(21, 20), at(22, 25), 'MAFIA'),
    m(13, at(22, 38), null),
  ], DATE, now);
  const o1 = room1.find(s => s.state === 'live')!.ordinal;
  const o2 = room2.find(s => s.state === 'live')!.ordinal;
  check('نفس اللحظة: غرفة ١ في الثانية', o1 === 2);
  check('نفس اللحظة: غرفة ٢ في الثالثة', o2 === 3);
  check('الرقمان مختلفان — لا ترتيبَ عامّ', o1 !== o2);
  check('غرفة ٢ بدأت ثالثتها قبل الخطّة (انحرافٌ سالب)', room2[2].driftMin === -12);
}

// ══════════════ ١٣ · منطق إعادة الجدولة (نظير نقطة reflow) ══════════════
console.log('');
console.log('🧪 إعادة جدولة ما تبقّى');
const toHHMM = (x: number) => {
  const v = ((x % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};
/** نفس خوارزميّة الإزاحة في activities.routes.ts — تُزاح الشرائح من موضع القطع فصاعداً */
function reflow(raw: RawSlot[], playedCount: number, minutes: number): RawSlot[] | string {
  const games = orderedGameSlots(raw);
  const first = games[playedCount];
  if (!first) return 'لم يبقَ ما يُعاد جدولته';
  const cut = raw.findIndex(r => r.kind === 'game' && r.start === first.start && r.label === first.label);
  if (cut < 0) return 'تعذّر تحديد أوّل شريحة غير مبدوءة';
  let stretchFrom = cut;
  while (stretchFrom > 0 && raw[stretchFrom - 1].kind === 'break') stretchFrom--;
  return raw.map((r, i) => {
    const a = toMinutes(r.start);
    if (a == null) return r;
    const d = slotDuration(r);
    if (i >= cut) return { ...r, start: toHHMM(a + minutes), end: toHHMM(a + minutes + d) };
    if (i >= stretchFrom) return { ...r, end: toHHMM(Math.max(a, a + d + minutes)) };
    return r;
  });
}
{
  const out = reflow(PLAN, 1, 30) as RawSlot[];
  check('الأولى بدأت ⇒ لا تُمسّ', out[0].start === '19:45' && out[0].end === '21:00');
  check('الاستراحة الملاصقة تمتدّ ولا تُزاح', out[1].start === '21:00' && out[1].end === '21:50');
  check('لا فراغ: نهاية الاستراحة = بداية اللعبة التالية', out[1].end === out[2].start);
  check('الثانية تُزاح +30', out[2].start === '21:50' && out[2].end === '23:05');
  check('الثالثة تُزاح +30', out[4].start === '23:20');
  check('المدد محفوظة بعد الإزاحة', slotDuration(out[2]) === 75 && slotDuration(out[4]) === 75);
}
{
  const out = reflow(PLAN, 0, 45) as RawSlot[];
  check('لا شيء بدأ ⇒ الليلة كلّها تُزاح', out[0].start === '20:30');
}
{
  const out = reflow(PLAN, 2, 20) as RawSlot[];
  check('لعبتان بدأتا ⇒ الثالثة وحدها تُزاح', out[4].start === '23:10' && out[2].start === '21:20');
}
check('كلّ الألعاب بدأت ⇒ لا شيء يُزاح', typeof reflow(PLAN, 3, 30) === 'string');
{
  const out = reflow(PLAN, 2, 30) as RawSlot[];
  check('الإزاحة عابرةً منتصف الليل: 00:05 ⇒ 00:35', out[4].end === '00:35');
  check('المدّة تبقى 75 بعد عبور منتصف الليل', slotDuration(out[4]) === 75);
}
{
  const out = reflow(PLAN, 1, -15) as RawSlot[];
  check('إزاحةٌ سالبة (تبكير) تعمل', out[2].start === '21:05');
}

// ══════════════ ١٤ · الإرساء الزمنيّ — العطب الذي كشفه الإنتاج ══════════════
// ساعاتُ الجدول بتوقيت عمّان. حاويةُ الإنتاج على UTC، وكان الإرساء يجري بتوقيت
// الخادم فظهر انحرافُ ١٨٠ دقيقة على بياناتٍ حقيقيّة. هذه التأكيدات مطلقةٌ لا
// تعتمد على منطقة الجهاز، فتفشل لو عاد العطب.
console.log('');
console.log('🧪 الإرساء بتوقيت عمّان');
{
  // فعاليّةُ ٢٨ أغسطس ٢٠٢٦ · 19:00 بعمّان = 16:00Z (الأردنّ +03:00 دائماً)
  const actDate = new Date('2026-08-28T16:00:00.000Z');
  const realPlan: RawSlot[] = [
    { kind: 'game',  label: 'اللعبة الأولى',  start: '19:00', end: '19:55' },
    { kind: 'break', label: 'استراحة',         start: '19:55', end: '20:05' },
    { kind: 'game',  label: 'اللعبة الثانية',  start: '20:05', end: '21:30' },
    { kind: 'break', label: 'استراحة',         start: '21:30', end: '21:40' },
    { kind: 'game',  label: 'اللعبة الثالثة',  start: '21:40', end: '23:05' },
    { kind: 'break', label: 'استراحة',         start: '23:05', end: '23:15' },
    { kind: 'game',  label: 'اللعبة الرابعة',  start: '23:15', end: '00:40' },
  ];
  // أوقاتٌ حقيقيّة من الإنتاج (غرفة 9978)، مكتوبةً بـZ فلا تتأثّر بمنطقة الجهاز
  const real: RoomMatchRow[] = [
    { id: 1, createdAt: new Date('2026-08-28T16:49:00Z'), endedAt: new Date('2026-08-28T17:55:00Z'), isActive: false, winner: 'MAFIA', totalRounds: 5 },
    { id: 2, createdAt: new Date('2026-08-28T18:14:00Z'), endedAt: new Date('2026-08-28T19:49:00Z'), isActive: false, winner: 'CITIZEN', totalRounds: 6 },
    { id: 3, createdAt: new Date('2026-08-28T19:58:00Z'), endedAt: new Date('2026-08-28T21:06:00Z'), isActive: false, winner: 'MAFIA', totalRounds: 5 },
    { id: 4, createdAt: new Date('2026-08-28T21:15:00Z'), endedAt: new Date('2026-08-28T21:59:00Z'), isActive: false, winner: 'CITIZEN', totalRounds: 4 },
  ];
  const out = bindRoomSchedule(realPlan, real, actDate, Date.parse('2026-08-29T09:00:00Z'));
  check('بيانات إنتاج: أربع شرائح', out.length === 4);
  check('انحراف الأولى +49 لا −131', out[0].driftMin === 49);
  check('انحراف الثانية +69 لا −110', out[1].driftMin === 69);
  check('انحراف الثالثة +78 لا −101', out[2].driftMin === 78);
  check('انحراف الرابعة +60 لا −120', out[3].driftMin === 60);
  check('كلّ الانحرافات موجبة — الليلة تأخّرت فعلاً', out.every(x => (x.driftMin ?? 0) > 0));
  check('كلّها منتهية', roomStatus(out) === 'ended');
}
{
  // «00:40» بعد «19:00» تعني اليوم التالي لا اليوم نفسه
  const actDate = new Date('2026-08-28T16:00:00.000Z');
  const plan: RawSlot[] = [
    { kind: 'game', label: 'أولى', start: '19:00', end: '20:00' },
    { kind: 'game', label: 'ليليّة', start: '23:15', end: '00:40' },
  ];
  const out = bindRoomSchedule(plan, [
    { id: 1, createdAt: new Date('2026-08-28T16:00:00Z'), endedAt: new Date('2026-08-28T17:00:00Z'), isActive: false, winner: 'MAFIA', totalRounds: 4 },
    { id: 2, createdAt: new Date('2026-08-28T20:15:00Z'), endedAt: null, isActive: true, winner: null, totalRounds: 2 },
  ], actDate, Date.parse('2026-08-28T21:00:00Z'));
  check('شريحةٌ بعد منتصف الليل تُرسى في اليوم التالي', out[1].driftMin === 0);
  check('الأولى بلا انحراف (بدأت في وقتها)', out[0].driftMin === 0);
}

console.log(`\n${fail === 0 ? '🎉' : '⚠️'} النتيجة: ${pass} نجح · ${fail} فشل`);
process.exit(fail === 0 ? 0 : 1);
