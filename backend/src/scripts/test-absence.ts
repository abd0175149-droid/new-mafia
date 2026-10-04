// ══════════════════════════════════════════════════════
// 🧪 خصمُ الغياب — الحساب بلا دَين ونصُّ الإشعار
//
// تشغيل: npx tsx src/scripts/test-absence.ts   (نقي — بلا قاعدة ولا Redis)
// ══════════════════════════════════════════════════════
import { absenceSteps, absenceMessage, ABSENCE_RR } from '../services/absence-penalty.service.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const section = (t: string) => console.log(`\n━━━ ${t} ━━━`);
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

section('١) الخصم يقف عند الصفر ولا يصير دَيناً');
{
  const r = absenceSteps(85, 'INFORMANT', 26);
  check('مُخبر 85 غاب 26: يُؤخذ 85 فقط', sum(r.steps) === 85, JSON.stringify(r.steps));
  check('…ثمانية أخماسٍ كاملة ثمّ 5 ثمّ أصفار', r.steps.slice(0, 8).every(x => x === 10) && r.steps[8] === 5 && r.steps.slice(9).every(x => x === 0));
  check('…ينتهي على مُخبر 0', r.tier === 'INFORMANT' && r.rr === 0);
  const z = absenceSteps(0, 'INFORMANT', 3);
  check('مُخبر 0: لا شيء يُؤخذ', sum(z.steps) === 0 && z.steps.length === 3);
  const p = absenceSteps(15, 'INFORMANT', 2);
  check('مُخبر 15 غاب 2: 10 ثمّ 5', JSON.stringify(p.steps) === '[10,5]' && p.rr === 0);
}

section('٢) النزول من رتبة يجري بقاعدة النظام');
{
  const r = absenceSteps(85, 'CAPO', 14);
  check('كابو 85 غاب 14: يُؤخذ 140 كاملة', sum(r.steps) === 140);
  check('…ويصير جندي 105 (كما في التحليل)', r.tier === 'SOLDIER' && r.rr === 105, `${r.tier} ${r.rr}`);
  const s = absenceSteps(5, 'SOLDIER', 1);
  check('جندي 5 غاب مرّة: 10 كاملة (عنده ما يُؤخذ) فينزل مُخبر 75', s.steps[0] === 10 && s.tier === 'INFORMANT' && s.rr === 75, `${s.tier} ${s.rr}`);
  const t = absenceSteps(130, 'SOLDIER', 15);
  check('جندي 130 غاب 15 ⟵ مُخبر 60 (كما في التحليل)', t.tier === 'INFORMANT' && t.rr === 60, `${t.tier} ${t.rr}`);
}

section('٣) نصُّ الإشعار');
{
  const base = { playerId: 1, name: 'س', cityId: 1, activityIds: [9] };
  const full = absenceMessage({ ...base, missed: 3, taken: 30, before: { tier: 'INFORMANT', rr: 80 }, after: { tier: 'INFORMANT', rr: 50 } }, 'retro', 'عمّان');
  check('رجعيّ كامل: 30 نقطة عن 3 فعاليّات في عمّان', full.includes('30 نقاط') === false && full.includes('في عمّان') && full.includes('3 فعاليّات'), full);
  check('…ويقول إنّ القادم 10 نقاط', full.includes(`${ABSENCE_RR} نقاط`), full);
  check('…بلا «توقّف عند الصفر»', !full.includes('توقّف'));
  const capped = absenceMessage({ ...base, missed: 26, taken: 85, before: { tier: 'INFORMANT', rr: 85 }, after: { tier: 'INFORMANT', rr: 0 } }, 'retro', 'عمّان');
  check('رجعيّ مقصوص: 85 نقطة عن 26 فعاليّة + توقّف عند الصفر', capped.includes('85 نقطة') && capped.includes('26 فعاليّة') && capped.includes('توقّف الخصم عند الصفر'), capped);
  const one = absenceMessage({ ...base, missed: 1, taken: 10, before: { tier: 'INFORMANT', rr: 40 }, after: { tier: 'INFORMANT', rr: 30 } }, 'retro', null);
  check('فعاليّة واحدة بصيغة المفرد', one.includes('فعاليّة واحدة') && !one.includes(' في '), one);
  const two = absenceMessage({ ...base, missed: 2, taken: 2, before: { tier: 'INFORMANT', rr: 2 }, after: { tier: 'INFORMANT', rr: 0 } }, 'retro', 'عمّان');
  check('اثنتان بالمثنّى', two.includes('فعاليّتين') && two.includes('نقطتان'), two);
  const dem = absenceMessage({ ...base, missed: 14, taken: 140, before: { tier: 'CAPO', rr: 85 }, after: { tier: 'SOLDIER', rr: 105 } }, 'retro', 'عمّان');
  check('النزول يُذكر باسم الرتبة', dem.includes('ونزلت إلى رتبة جندي'), dem);
  const auto = absenceMessage({ ...base, missed: 1, taken: 10, before: { tier: 'INFORMANT', rr: 40 }, after: { tier: 'INFORMANT', rr: 30 } }, 'auto', 'عمّان',
    { id: 9, name: 'مزاج افندينا', date: new Date('2026-10-08T16:30:00Z'), cityId: 1 });
  check('تلقائيّ: اسم الفعاليّة ويومها', auto.includes('«مزاج افندينا»') && auto.includes('يوم') && auto.includes('10 نقاط'), auto);
}

console.log(`\nالنتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
if (fail) { console.log('\nالفاشلة:'); failures.forEach(f => console.log('  • ' + f)); process.exit(1); }
