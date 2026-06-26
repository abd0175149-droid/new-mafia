// ══════════════════════════════════════════════════════
// 🧪 اختبار أولوية السفّاح (نقي بلا DB) — منطق العقد المشترك بين المحرّكين
// يستدعي الدوال الحقيقية: checkContractCompletion / evaluateAssassinKill / completeContract
// المسار القديم (auto mode) يعتمد evaluateAssassinKill → فهذا الاختبار يقفل سلوك وضع المستخدم.
//
// تشغيل: npx tsx src/scripts/test-assassin-priority.ts
// ══════════════════════════════════════════════════════

import { checkContractCompletion, evaluateAssassinKill } from '../game/assassin-engine.js';

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t: string) { console.log(`\n━━━ ${t} ━━━`); }

// حالة سفّاح صغيرة قابلة لإعادة الاستخدام
function mkState(opts: { godfatherTarget?: number | null; targetRole?: string; targetAlive?: boolean; totalRequired?: number } = {}): any {
  return {
    round: 2,
    players: [
      { physicalId: 8, role: opts.targetRole ?? 'SILENCER', name: 'هدف', isAlive: opts.targetAlive ?? false },
      { physicalId: 15, role: 'ASSASSIN', name: 'السفّاح', isAlive: true },
    ],
    nightActions: { godfatherTarget: opts.godfatherTarget ?? null },
    assassinState: {
      assassinPhysicalId: 15,
      contracts: [{ id: 1, type: 'KILL_ROLE', targetRole: 'SILENCER', completed: false }],
      currentContractIndex: 0,
      completedCount: 0,
      totalRequired: opts.totalRequired ?? 1,
      firstNightPassed: true,
      lastKillRound: null,
      won: false,
    },
  };
}

section('1) أولوية السفّاح: العقد يُحتسب حتى لو قتلت المافيا نفس الهدف');
{
  // المافيا استهدفت نفس اللاعب (godfatherTarget === الهدف) — في السابق كان يُلغي العقد
  const s = mkState({ godfatherTarget: 8 });
  const r = evaluateAssassinKill(s, 8);
  check('contractCompleted = true رغم اغتيال المافيا', r.contractCompleted === true);
  check('won = true (أنجز العقد الوحيد)', r.won === true);
  check('completedCount = 1', s.assassinState.completedCount === 1);
  check('العقد مُعلّم مكتملاً', s.assassinState.contracts[0].completed === true);
}

section('2) أولوية السفّاح: العقد يُحتسب حتى لو كان الهدف ميتاً سلفاً (قنص/مافيا قبله)');
{
  // الهدف ميت بالفعل (isAlive=false) — المسار القديم كان يتخطّى السفّاح
  const s = mkState({ godfatherTarget: 8, targetAlive: false });
  const r = checkContractCompletion(s, 8); // بلا تمرير علم killedByMafiaToo (افتراضي false)
  check('checkContractCompletion: completed = true', r.completed === true);
  check('contractIndex = 0', r.contractIndex === 0);
}

section('3) لا عقد عند عدم تطابق الدور (مواطن مشترك مع المافيا)');
{
  const s = mkState({ godfatherTarget: 8, targetRole: 'CITIZEN' });
  const r = evaluateAssassinKill(s, 8);
  check('مواطن: contractCompleted = false', r.contractCompleted === false);
  check('مواطن: won = false', r.won === false);
  check('مواطن: completedCount يبقى 0', s.assassinState.completedCount === 0);
}

section('4) التوافق الخلفي: تمرير killedByMafiaToo=true لم يعد يُلغي الإنجاز');
{
  const s = mkState({ godfatherTarget: 8 });
  const r = checkContractCompletion(s, 8, true); // العلم القديم — يجب تجاهله الآن
  check('completed = true رغم تمرير العلم القديم', r.completed === true);
}

console.log(`\n══════════════════════════════════════`);
console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
if (fail > 0) {
  console.log(`\n❌ الفشل:`);
  failures.forEach(f => console.log(`   - ${f}`));
  process.exit(1);
} else {
  console.log(`\n🎉 أولوية السفّاح تعمل بشكل صحيح (المساران القديم والديناميكي).`);
  process.exit(0);
}
