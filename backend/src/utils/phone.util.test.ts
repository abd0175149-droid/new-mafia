// اختبار سريع لأداة توحيد الأرقام — يُشغَّل يدوياً: npx tsx src/utils/phone.util.test.ts
import { normalizeLocalPhone, toWaPhone, samePhone, normalizeAnyPhone, isJordanianPhone } from './phone.util.js';

const cases: Array<[any, string | null]> = [
  ['0789842240', '0789842240'],
  ['789842240', '0789842240'],
  ['962789842240', '0789842240'],
  ['+962 78 984 2240', '0789842240'],
  ['00962789842240', '0789842240'],
  ['962 7-8984-2240', '0789842240'],
  ['٠٧٨٩٨٤٢٢٤٠', '0789842240'],
  ['0779123456', '0779123456'],
  ['0799123456', '0799123456'],
  ['0759123456', null],
  ['12345', null],
  ['', null],
  [null, null],
];

let fail = 0;
for (const [inp, want] of cases) {
  const got = normalizeLocalPhone(inp);
  if (got !== want) { console.log('FAIL normalize:', JSON.stringify(inp), 'got', got, 'want', want); fail++; }
}
if (toWaPhone('0789842240') !== '962789842240') { console.log('FAIL toWa 1'); fail++; }
if (toWaPhone('+962789842240') !== '962789842240') { console.log('FAIL toWa 2'); fail++; }
if (!samePhone('962772866473', '0772866473')) { console.log('FAIL same 1'); fail++; }
if (samePhone('0772866473', '0772866474')) { console.log('FAIL same 2'); fail++; }

// ── normalizeAnyPhone: الأردني كما كان + الأجنبي يُقبل بدل أن يُرمى ──
const anyCases: Array<[any, { local: string; wa: string; isJordanian: boolean } | null]> = [
  // أردني — يجب ألا يتغيّر شيء عن السلوك القديم
  ['962789842240',   { local: '0789842240', wa: '962789842240', isJordanian: true }],
  ['0789842240',     { local: '0789842240', wa: '962789842240', isJordanian: true }],
  ['+962 78 984 2240', { local: '0789842240', wa: '962789842240', isJordanian: true }],
  // أجنبي — يُخزَّن بصيغته الدولية
  ['971501234567',   { local: '971501234567', wa: '971501234567', isJordanian: false }],  // الإمارات
  ['+966 50 123 4567', { local: '966501234567', wa: '966501234567', isJordanian: false }], // السعودية
  ['201001234567',   { local: '201001234567', wa: '201001234567', isJordanian: false }],  // مصر
  ['447700900123',   { local: '447700900123', wa: '447700900123', isJordanian: false }],  // بريطانيا
  ['12025550123',    { local: '12025550123',  wa: '12025550123',  isJordanian: false }],  // أمريكا
  // مرفوض
  ['12345',          null],   // أقصر من 8
  ['0123456789012',  null],   // يبدأ بصفر وليس أردنياً
  ['1234567890123456', null], // أطول من 15
  ['',               null],
  [null,             null],
];
for (const [inp, want] of anyCases) {
  const got = normalizeAnyPhone(inp);
  const same = JSON.stringify(got) === JSON.stringify(want);
  if (!same) { console.log('FAIL any:', JSON.stringify(inp), 'got', JSON.stringify(got), 'want', JSON.stringify(want)); fail++; }
}

// لا تصادم بين الشكلين: المحلي يبدأ بـ0، والدولي لا يبدأ بـ0 أبداً
if (isJordanianPhone('0789842240') !== true)  { console.log('FAIL isJo 1'); fail++; }
if (isJordanianPhone('971501234567') !== false) { console.log('FAIL isJo 2'); fail++; }
if (isJordanianPhone('0759123456') !== false) { console.log('FAIL isJo 3'); fail++; }

const total = cases.length + 4 + anyCases.length + 3;
console.log(fail === 0 ? `ALL PASS ✅ (${total} checks)` : `${fail} FAILURES ❌`);
process.exit(fail === 0 ? 0 : 1);
