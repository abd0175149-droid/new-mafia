// 🧪 اختبار وحدة لمنطق دمج تخصيص النشاط فوق تثبيت القالب
// تشغيل: npx tsx test-seat-merge.ts
import { mergeActivityPins, samePinPerson, normPinPhone } from './src/game/seat-merge.js';

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}
const bySeat = (arr: any[]) => Object.fromEntries(arr.map(p => [Number(p.seatNumber), p.playerName]));

console.log('🧪 mergeActivityPins\n');

// 1) القالب فقط (لا تخصيص نشاط) → يبقى كما هو
{
  const tpl = [{ seatNumber: 1, playerId: 10, playerName: 'A' }, { seatNumber: 5, playerId: 20, playerName: 'B' }];
  const out = mergeActivityPins(tpl, []);
  check('القالب فقط: يبقى كامل', out.length === 2 && bySeat(out)[1] === 'A' && bySeat(out)[5] === 'B');
}

// 2) النشاط فقط (قالب فارغ)
{
  const out = mergeActivityPins([], [{ seatNumber: 3, playerId: 99, playerName: 'Tamer' }]);
  check('النشاط فقط: يظهر تخصيص النشاط', out.length === 1 && bySeat(out)[3] === 'Tamer');
}

// 3) تعارض نفس المقعد → النشاط يتفوّق
{
  const tpl = [{ seatNumber: 1, playerId: 10, playerName: 'A' }];
  const act = [{ seatNumber: 1, playerId: 99, playerName: 'Tamer' }];
  const out = mergeActivityPins(tpl, act);
  check('نفس المقعد: النشاط يتفوّق', out.length === 1 && bySeat(out)[1] === 'Tamer');
}

// 4) نفس الشخص بمقعد مختلف → يُلغى تثبيت القالب لهذا الشخص (لا تكرار)
{
  const tpl = [{ seatNumber: 1, playerId: 10, playerName: 'A' }];   // A بالمقعد 1 من القالب
  const act = [{ seatNumber: 7, playerId: 10, playerName: 'A' }];   // النشاط نقل A للمقعد 7
  const out = mergeActivityPins(tpl, act);
  check('نفس الشخص بمقعد آخر: مقعد واحد فقط (7)', out.length === 1 && bySeat(out)[7] === 'A' && !(1 in bySeat(out)));
}

// 5) دمج مختلط: قالب لمقاعد أخرى يبقى + النشاط يضيف/يستبدل
{
  const tpl = [
    { seatNumber: 1, playerId: 10, playerName: 'A' },
    { seatNumber: 2, playerId: 20, playerName: 'B' },
    { seatNumber: 3, playerId: 30, playerName: 'C' },
  ];
  const act = [
    { seatNumber: 2, playerId: 99, playerName: 'Tamer' }, // يستبدل B على المقعد 2
    { seatNumber: 8, playerId: 40, playerName: 'D' },     // جديد
  ];
  const out = mergeActivityPins(tpl, act);
  const m = bySeat(out);
  check('مختلط: 4 مقاعد (1,2,3,8)', out.length === 4);
  check('مختلط: المقعد 2 = Tamer (استبدال)', m[2] === 'Tamer');
  check('مختلط: 1=A و 3=C يبقيان', m[1] === 'A' && m[3] === 'C');
  check('مختلط: 8=D مضاف', m[8] === 'D');
}

// 6) مطابقة الشخص بالهاتف (تطبيع أردنيّ) حتى بلا playerId
{
  const tpl = [{ seatNumber: 4, phone: '0796860224', playerName: 'X' }];
  const act = [{ seatNumber: 9, phone: '962796860224', playerName: 'X' }]; // نفس الرقم بصيغة دوليّة
  const out = mergeActivityPins(tpl, act);
  check('مطابقة بالهاتف (تطبيع): مقعد واحد (9)', out.length === 1 && bySeat(out)[9] === 'X');
}

// 7) تجاهل seatNumber غير صالح من النشاط
{
  const out = mergeActivityPins([{ seatNumber: 1, playerName: 'A' }], [{ seatNumber: 'x', playerName: 'Bad' } as any]);
  check('seatNumber غير صالح يُتجاهل من النشاط', out.length === 1 && bySeat(out)[1] === 'A');
}

// 8) helpers: تطبيع الهاتف والمطابقة
check('normPinPhone: 962→0', normPinPhone('962796860224') === '0796860224');
check('samePinPerson: بالاسم', samePinPerson({ playerName: ' Ali ' }, { playerName: 'ali' }) === true);
check('samePinPerson: مختلفان', samePinPerson({ playerId: 1 }, { playerId: 2 }) === false);

console.log(`\n${fail === 0 ? '🎉' : '⚠️'} النتيجة: ${pass} نجح · ${fail} فشل`);
process.exit(fail === 0 ? 0 : 1);
