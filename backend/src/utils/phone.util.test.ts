// اختبار سريع لأداة توحيد الأرقام — يُشغَّل يدوياً: npx tsx src/utils/phone.util.test.ts
import { normalizeLocalPhone, toWaPhone, samePhone } from './phone.util.js';

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

console.log(fail === 0 ? `ALL PASS ✅ (${cases.length + 4} checks)` : `${fail} FAILURES ❌`);
process.exit(fail === 0 ? 0 : 1);
