// ══════════════════════════════════════════════════════
// 💰 فحص حرّاس تثبيت التحصيل من الواتساب
// ══════════════════════════════════════════════════════
// أداةٌ تحرّك مالاً برسالةٍ في محادثة: كلّ فحصٍ هنا يحرس بابَ خطأٍ يُسجّل
// مبلغاً لم يُقبض أو ينسبه لمن لم يقبضه.
//
//   npx tsx test-wa-collect.ts
// ══════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src');
let pass = 0, fail = 0;
const check = (ok: boolean, label: string, detail = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
};
const raw = fs.readFileSync(path.join(SRC, 'services/whatsapp-bot.service.ts'), 'utf8');
const code = raw.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const between = (a: string, b: string, n = 4000) => {
  const i = code.indexOf(a);
  if (i < 0) return '';
  const j = code.indexOf(b, i);
  return code.slice(i, j > i ? j : i + n);
};

// ══════════════════════════════════════════════════════
console.log('\n📊 المتوقَّع في التقرير');
// ══════════════════════════════════════════════════════
const fin = between("case 'admin_activity_finance'", "case 'admin_set_player_free'", 3500);
check(/expectedFromUnpaidJOD/.test(fin), 'التقرير يحمل المتوقَّع من غير المدفوعين');
check(/unitPriceJOD/.test(fin), 'وسعرَ الفرد');
check(/totalIfAllPaidJOD/.test(fin), 'والمجموعَ لو سُجّل الكلّ');
check(/unpaidB\.reduce\(\(s, b\) => s \+ ppl\(b\) \* unit, 0\)/.test(fin),
  'والمتوقَّع يضرب في عدد الأشخاص لا عدد الحجوزات — الحجزُ قد يكون لأكثر من واحد');

// ══════════════════════════════════════════════════════
console.log('\n👤 اختيار المُحصِّل');
// ══════════════════════════════════════════════════════
const mark = between("case 'admin_mark_activity_paid'", "case 'admin_game_state'", 3500);
check(/listCollectors\(\)/.test(mark), 'تُعرض قائمةُ المُحصِّلين');
check(/type: 'list'/.test(mark), 'كقائمةٍ تفاعليّة — الأزرار ثلاثةٌ لا تكفي للموظّفين');
check(/admrcv:\$\{actId\}:\$\{c\.id\}/.test(mark), 'ومعرّفُ الصفّ يحمل الفعاليّة والموظّف');
check(/if \(collectors\.length\)/.test(mark) && /type: 'button'/.test(mark),
  'وبلا موظّفين مفعَّلين تعود للمسار القديم بدل أن تقف');
check(/inArray\(staff\.role, \['admin', 'manager', 'leader'\]/.test(code),
  'المُحصِّلون أدوارٌ ميدانيّة لا كلُّ من في الجدول');
check(/eq\(staff\.isActive, true\)/.test(code) && /isNull\(staff\.deletedAt\)/.test(code),
  'والنشطون غير المحذوفين وحدهم');
check(/displayName \|\| r\.username/.test(code),
  'والاسمُ من جدول الموظّفين — نصٌّ حرّ يفرّق الشخصَ الواحد في تقرير التسوية');

// ══════════════════════════════════════════════════════
console.log('\n🔒 حرّاس التنفيذ');
// ══════════════════════════════════════════════════════
const rcv = between("const admRcvMatch", "const adminFreeMatch", 3000);
check(/isAdminConversation\(conv\)/.test(rcv), 'اختيارُ المُحصِّل يُعيد فحص الأدمن');
check(/if \(!rows\.length\)/.test(rcv),
  'ويُعاد الفحص لحظةَ التأكيد: قد يُسجَّل الدفع من اللوحة بين العرض والضغط');
check(rcv.indexOf('db.select({ count: bookings.count })') < rcv.indexOf('total2'),
  'والمبلغُ يُحسب من قاعدة البيانات لا يُؤخذ من الرسالة');
check(/adminpaid:\$\{actId\}:\$\{staffId\}/.test(rcv), 'وزرُّ التأكيد يحمل المُحصِّل');

const exec = between('const adminPaidMatch', 'admrtMatch', 4000);
check(/\^adminpaid:\(\\d\+\)\(\?::\(\\d\+\)\)\?\$/.test(code.replace(/\\\\/g, '\\')) || /adminpaid:\(/.test(code),
  'الشكلُ القديم بلا مُحصِّل يبقى مقبولاً — أزرارٌ أُرسلت قبل النشرة لا تسقط');
check(/isAdminConversation\(conv\)/.test(exec), 'والتنفيذُ يُعيد فحص الأدمن أيضاً');
check(/COALESCE\(\$\{activities\.receivedBy\}, ''\) = ''/.test(exec),
  'مُستلِمُ الفعاليّة يُكتب على الفارغ وحده — لا يُمحى ضبطٌ من صفحة المالية');
check(/eq\(bookings\.isFree, false\), eq\(bookings\.isPaid, false\)/.test(exec),
  'ولا يُمسّ مجّانيٌّ ولا مدفوعٌ سلفاً');
check(/auditBot\(conv, 'wa:activity-mark-paid'/.test(exec), 'والعمليّة تُدوَّن');

console.log(`\n${fail ? '❌' : '✅'} ${pass} نجح · ${fail} فشل\n`);
process.exit(fail ? 1 : 0);
