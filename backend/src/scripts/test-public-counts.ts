// ══════════════════════════════════════════════════════
// 🧪 عدّادُ الفرق العلنيّ — لا يتغيّر قبل كشف البطاقة
//
// تشغيل: npx tsx src/scripts/test-public-counts.ts   (نقي — بلا قاعدة ولا Redis)
// ══════════════════════════════════════════════════════

import { publicTeamCounts, seatsRevealedBy, unrevealedDeadSeats } from '../game/public-counts.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const section = (t: string) => console.log(`\n━━━ ${t} ━━━`);
const P = (seat: number, role: string, alive = true) => ({ physicalId: seat, role, isAlive: alive });
const counts = (c: any) => `${c.citizenAlive}/${c.mafiaAlive}/${c.neutralAlive}`;

function table(): any {
  return {
    phase: 'MORNING_RECAP', round: 2, eliminationRevealed: false,
    players: [P(1, 'GODFATHER'), P(2, 'SILENCER'), P(3, 'SHERIFF'), P(4, 'DOCTOR'), P(5, 'SNIPER'), P(6, 'CITIZEN'), P(7, 'JESTER'), P(8, 'YOUNGER_BROTHER'), P(9, 'OLDER_BROTHER')],
    morningEvents: [],
  };
}

section('١) قتيلُ الليل: العدّادُ ثابتٌ حتّى يُعرض الحدث');
{
  const s = table();
  check('قبل الليل: 5 مواطنين / 3 مافيا / 1 مستقلّ', counts(publicTeamCounts(s)) === '5/3/1', counts(publicTeamCounts(s)));
  s.players.find((p: any) => p.physicalId === 3).isAlive = false;
  s.morningEvents = [{ type: 'ASSASSINATION', targetPhysicalId: 3, revealed: false }];
  check('الشريف مات ولم يُعرض: العدّادُ لم يتغيّر', counts(publicTeamCounts(s)) === '5/3/1', counts(publicTeamCounts(s)));
  check('مقعدُه محجوب', unrevealedDeadSeats(s).has(3));
  s.morningEvents[0].revealed = true;
  check('بعد العرض: نقص مواطن', counts(publicTeamCounts(s)) === '4/3/1', counts(publicTeamCounts(s)));
}

section('٢) قنصُ مواطن: القتيلان محجوبان معاً');
{
  const s = table();
  s.players.find((p: any) => p.physicalId === 5).isAlive = false;
  s.players.find((p: any) => p.physicalId === 6).isAlive = false;
  s.morningEvents = [{ type: 'SNIPE_CITIZEN', targetPhysicalId: 6, revealed: false, extra: { sniperPhysicalId: 5 } }];
  check('قبل العرض: لم يتغيّر شيء', counts(publicTeamCounts(s)) === '5/3/1', counts(publicTeamCounts(s)));
  check('الحدث يكشف البطاقتين', JSON.stringify(seatsRevealedBy(s, s.morningEvents[0]).sort()) === '[5,6]');
  s.morningEvents[0].revealed = true;
  check('بعد العرض: نقص مواطنان', counts(publicTeamCounts(s)) === '3/3/1', counts(publicTeamCounts(s)));
}

section('٣) حدثٌ بلا موت لا يحجب شيئاً، وحدثان: كلٌّ بكشفه');
{
  const s = table();
  s.players.find((p: any) => p.physicalId === 1).isAlive = false;   // قنص الشيخ
  s.players.find((p: any) => p.physicalId === 4).isAlive = false;   // اغتيال الطبيب
  s.morningEvents = [
    { type: 'SILENCED', targetPhysicalId: 6, revealed: false },
    { type: 'SNIPE_MAFIA', targetPhysicalId: 1, revealed: false },
    { type: 'ASSASSINATION', targetPhysicalId: 4, revealed: false },
  ];
  check('الإسكات لا يكشف بطاقة', seatsRevealedBy(s, s.morningEvents[0]).length === 0);
  check('قبل أيّ عرض: 5/3/1', counts(publicTeamCounts(s)) === '5/3/1');
  s.morningEvents[1].revealed = true;
  check('بعد عرض القنص وحده: نقصت المافيا فقط', counts(publicTeamCounts(s)) === '5/2/1', counts(publicTeamCounts(s)));
  s.morningEvents[2].revealed = true;
  check('بعد عرض الاغتيال: نقص مواطن', counts(publicTeamCounts(s)) === '4/2/1', counts(publicTeamCounts(s)));
}

section('٤) تحوّلُ الأخ الأصغر: مواطنٌ حتّى يُعرض');
{
  const s = table();
  s.players.find((p: any) => p.physicalId === 9).isAlive = false;
  s.players.find((p: any) => p.physicalId === 8).role = 'MAFIA_REGULAR';
  s.morningEvents = [
    { type: 'ASSASSINATION', targetPhysicalId: 9, revealed: false },
    { type: 'TWIN_TRANSFORM', targetPhysicalId: 8, revealed: false, extra: { previousRole: 'YOUNGER_BROTHER', newRole: 'MAFIA_REGULAR' } },
  ];
  check('قبل العرض: لا موت ولا تحوّل', counts(publicTeamCounts(s)) === '5/3/1', counts(publicTeamCounts(s)));
  s.morningEvents[0].revealed = true;
  check('عُرض موتُ الأكبر وحده: نقصت المافيا', counts(publicTeamCounts(s)) === '5/2/1', counts(publicTeamCounts(s)));
  s.morningEvents[1].revealed = true;
  check('عُرض التحوّل: انتقل مواطنٌ إلى المافيا', counts(publicTeamCounts(s)) === '4/3/1', counts(publicTeamCounts(s)));
}

section('٥) إقصاءُ النهار والقنبلة');
{
  const s = table();
  s.phase = 'DAY_ELIMINATION'; s.morningEvents = [];
  s.players.find((p: any) => p.physicalId === 1).isAlive = false;
  s.pendingResolution = { eliminated: [1], type: 'ELIMINATION' };
  check('قبل «كشف الأدوار»: الشيخ يُعدّ حيّاً', counts(publicTeamCounts(s)) === '5/3/1', counts(publicTeamCounts(s)));
  check('لحظة الكشف (revealElimination): نقصت المافيا', counts(publicTeamCounts(s, { revealElimination: true })) === '5/2/1');
  // قنبلةٌ محبوسة حتّى الكشف
  s.players.find((p: any) => p.physicalId === 2).isAlive = false;
  s.players.find((p: any) => p.physicalId === 3).isAlive = false;
  s.heldBombResult = { bombEliminated: [2, 3] };
  check('ضحايا القنبلة المحبوسة محجوبون', counts(publicTeamCounts(s, { revealElimination: true })) === '5/2/1',
    counts(publicTeamCounts(s, { revealElimination: true })));
  s.heldBombResult = null; s.eliminationRevealed = true;
  check('بعد كشف القنبلة: 4/1/1', counts(publicTeamCounts(s)) === '4/1/1', counts(publicTeamCounts(s)));
}

section('٦) المستقلّ');
{
  const s = table();
  s.players.find((p: any) => p.physicalId === 7).isAlive = false;
  s.morningEvents = [{ type: 'ASSASSINATION', targetPhysicalId: 7, revealed: false }];
  check('المهرّج قبل العرض يُعدّ', publicTeamCounts(s).neutralAlive === 1);
  s.morningEvents[0].revealed = true;
  check('بعد العرض: 0 مستقلّ', publicTeamCounts(s).neutralAlive === 0);
}

console.log(`\nالنتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
if (fail) { console.log('\nالفاشلة:'); failures.forEach(f => console.log('  • ' + f)); process.exit(1); }
