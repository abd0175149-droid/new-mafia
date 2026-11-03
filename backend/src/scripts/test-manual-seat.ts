// ══════════════════════════════════════════════════════
// 🧪 اختيار المقعد اليدويّ — المتاح، التثبيت، المغادرة، قرار الليدر
//
// تشغيل: npx tsx src/scripts/test-manual-seat.ts   (نقي — بلا قاعدة ولا Redis)
// ══════════════════════════════════════════════════════

import {
  blockedSeats, freeSeatsFor, pinnedSeatFor, resolveManualSeat, parseSeatInput,
  exitDisposition, isSamePerson, isSeatFail,
} from '../game/seating/manual-seat.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

const base = () => ({
  roomId: 'r1',
  config: { maxPlayers: 12 },
  players: [
    { physicalId: 1, name: 'سامي', phone: '0790000001', playerId: 501 },
    { physicalId: 2, name: 'ليلى', phone: '0790000002', playerId: 502, seatHeld: true },
    { physicalId: 3, name: 'مجمَّد', phone: '0790000003', playerId: 503, frozen: true },
  ] as any[],
  spectators: [{ physicalId: 9, name: 'متفرّج', phone: '0790000009', playerId: 509 }] as any[],
  pinnedSeats: [
    { seatNumber: 5, playerId: 505, phone: '0790000005', playerName: 'مثبَّت' },
    { seatNumber: 7, playerId: null, phone: null, playerName: 'Omar' },
    { seatNumber: 11, playerId: 501, phone: '0790000001', playerName: 'سامي' },   // صاحبه جالس في ١
  ] as any[],
});
const newbie = { playerId: 600, phone: '0790000600', name: 'جديد' };

console.log('\n━━━ قراءة الرقم ━━━');
check('«7» ⇒ 7', parseSeatInput('7') === 7);
check('« 07 » ⇒ 7', parseSeatInput(' 07 ') === 7);
check('«٧» (أرقام عربيّة) ⇒ 7', parseSeatInput('٧') === 7);
check('«۱۲» (فارسيّة) ⇒ 12', parseSeatInput('۱۲') === 12);
check('رقمٌ كعدد ⇒ نفسه', parseSeatInput(4) === 4);
check('فارغ ⇒ null (لم يختر بعد)', parseSeatInput('') === null && parseSeatInput(undefined) === null);
check('«abc» ⇒ NaN', Number.isNaN(parseSeatInput('abc') as number));
check('«3.5» ⇒ NaN', Number.isNaN(parseSeatInput('3.5') as number));
check('«-2» ⇒ NaN', Number.isNaN(parseSeatInput('-2') as number));

console.log('\n━━━ المقاعد المحجوبة ━━━');
{
  const b = blockedSeats(base(), newbie);
  check('لاعبٌ حاضر ⇒ player', b.get(1) === 'player');
  check('مقعدٌ محجوز (seatHeld) ⇒ held', b.get(2) === 'held');
  check('مجمَّد ⇒ held', b.get(3) === 'held');
  check('متفرّج ⇒ spectator', b.get(9) === 'spectator');
  check('تثبيتٌ لشخصٍ آخر ⇒ pinned', b.get(5) === 'pinned');
  check('تثبيتٌ بالاسم وحده ⇒ pinned لغيره', b.get(7) === 'pinned');
  check('تثبيتٌ صاحبه جالسٌ في مقعدٍ آخر لا يحجب', !b.has(11));
  check('الفارغ غير محجوب', !b.has(4) && !b.has(12));
  const free = freeSeatsFor(base(), newbie);
  check('المتاح = 4،6،8،10،11،12', JSON.stringify(free) === JSON.stringify([4, 6, 8, 10, 11, 12]), JSON.stringify(free));
}

console.log('\n━━━ حكم الاختيار ━━━');
{
  const s = base();
  const ok = resolveManualSeat(s, newbie, '4');
  check('مقعدٌ فارغ ⇒ يجلس فيه', !isSeatFail(ok) && ok.seat === 4 && ok.via === 'choice', JSON.stringify(ok));
  const none = resolveManualSeat(s, newbie, undefined);
  check('بلا رقم ⇒ SEAT_CHOICE_REQUIRED مع قائمة المتاح', isSeatFail(none) && none.code === 'SEAT_CHOICE_REQUIRED' && none.freeSeats.length === 6 && none.maxPlayers === 12);
  for (const [seat, why] of [[1, 'حاضر'], [2, 'محجوز'], [3, 'مجمَّد'], [9, 'متفرّج'], [5, 'مثبَّت لغيره']] as const) {
    const r = resolveManualSeat(s, newbie, seat);
    check(`المقعد ${seat} (${why}) ⇒ SEAT_TAKEN`, isSeatFail(r) && r.code === 'SEAT_TAKEN', JSON.stringify(r));
  }
  const r0 = resolveManualSeat(s, newbie, 0);
  check('صفر ⇒ SEAT_INVALID', isSeatFail(r0) && r0.code === 'SEAT_INVALID');
  const r13 = resolveManualSeat(s, newbie, 13);
  check('فوق السعة ⇒ SEAT_INVALID', isSeatFail(r13) && r13.code === 'SEAT_INVALID' && /بين 1 و 12/.test(r13.error));
  const rx = resolveManualSeat(s, newbie, 'x');
  check('نصّ ⇒ SEAT_INVALID', isSeatFail(rx) && rx.code === 'SEAT_INVALID');
  const r11 = resolveManualSeat(s, newbie, 11);
  check('مقعد تثبيتٍ لم يعد له معنى ⇒ متاح', !isSeatFail(r11) && r11.seat === 11);
}

console.log('\n━━━ التثبيت = قرار الطاقم ━━━');
{
  const s = base();
  const pinned = { playerId: 505, phone: '0790000005', name: 'مثبَّت' };
  check('صاحب التثبيت ⇒ مقعده بلا سؤال', pinnedSeatFor(s, pinned) === 5);
  const r = resolveManualSeat(s, pinned, '8');
  check('صاحب التثبيت يكتب رقماً آخر ⇒ يجلس في مقعده المثبَّت', !isSeatFail(r) && r.seat === 5 && r.via === 'pin', JSON.stringify(r));
  const r2 = resolveManualSeat(s, pinned, undefined);
  check('صاحب التثبيت بلا رقم ⇒ لا يُسأل', !isSeatFail(r2) && r2.seat === 5);
  check('مقعده ليس محجوباً عنه', !blockedSeats(s, pinned).has(5));
  const byPhone = { playerId: null, phone: '+962790000005', name: 'x' };
  check('مطابقة بالهاتف بصيغة دوليّة', pinnedSeatFor(s, byPhone) === 5);
  const byName = { playerId: null, phone: null, name: ' omar ' };
  check('تثبيتٌ بالاسم يطابق صاحبه (كالمحرّك)', pinnedSeatFor(s, byName) === 7);
  // التثبيت على مقعدٍ صار مشغولاً بغيره لا يُعطى
  const s2 = base(); s2.players.push({ physicalId: 5, name: 'دخيل', phone: '0790000777', playerId: 777 });
  check('مقعد التثبيت مشغول ⇒ يُسأل كغيره', pinnedSeatFor(s2, pinned) === null);
  const r3 = resolveManualSeat(s2, pinned, undefined);
  check('… ويرجع SEAT_CHOICE_REQUIRED', isSeatFail(r3) && r3.code === 'SEAT_CHOICE_REQUIRED');
}

console.log('\n━━━ هويّة الشخص ━━━');
check('حسابان مختلفان بنفس الهاتف ⇒ ليسا واحداً', !isSamePerson({ playerId: 1, phone: '0790000001' }, { playerId: 2, phone: '0790000001' }));
check('بلا حساب: الهاتف يحسم', isSamePerson({ playerId: null, phone: '0790000001' }, { playerId: 9, phone: '962790000001' }));
check('هاتف الضيف الوهميّ 0700000000 لا يطابق', !isSamePerson({ phone: '0700000000' }, { phone: '0700000000' }));
check('الاسم لا يُستعمل بلا طلب', !isSamePerson({ name: 'a' }, { name: 'a' }));

console.log('\n━━━ القاعة ممتلئة ━━━');
{
  const s: any = { config: { maxPlayers: 3 }, players: [{ physicalId: 1 }, { physicalId: 2 }, { physicalId: 3 }], spectators: [], pinnedSeats: [] };
  const r = resolveManualSeat(s, newbie, '2');
  check('لا مقعد شاغر ⇒ ROOM_FULL', isSeatFail(r) && r.code === 'ROOM_FULL' && r.freeSeats.length === 0);
}

console.log('\n━━━ سعةٌ غائبة ━━━');
{
  const s: any = { players: [], spectators: [] };
  check('بلا config ⇒ 27 افتراضاً', freeSeatsFor(s, newbie).length === 27);
}

console.log('\n━━━ المغادرة ━━━');
check('لاعبٌ عاديّ ⇒ يُفرَّغ مقعده', exitDisposition({ physicalId: 4 }) === 'free');
check('نقله الليدر ⇒ يُحفظ له', exitDisposition({ physicalId: 4, leaderSeat: true }) === 'hold');
check('بلا لاعب ⇒ free', exitDisposition(undefined) === 'free');

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} نجح · ${fail} فشل`);
if (fail) { for (const f of failures) console.log('   • ' + f); process.exit(1); }
