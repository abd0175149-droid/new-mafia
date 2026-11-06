// ══════════════════════════════════════════════════════
// 🧪 الكروتُ المكرَّرة — قنّاصان، سفّاحان، مهرّجان، طبيبان
//
// تشغيل: npx tsx src/scripts/test-duplicate-roles.ts
// بلا قاعدة بيانات ولا Redis — تعاريفُ الإنتاج تُحقن في الكاش (_game-fixtures).
//
// قراراتُ المالك (2026-11-06) التي يقفلها هذا الملفّ:
//   • النسختان تعملان كلٌّ بمقعدها في الليلة الواحدة والطابور (خطّةٌ وحلّ)
//   • السفّاحون: متنافسون (لكلٍّ عقودُه، يفوز صاحبُها وحده) أو شركاء (عقودٌ مشتركة، يفوزون معاً)
//   • المهرّجان: يفوز المطرودُ وحده
//   • الفوزُ يُختم بالمقعد ويُقرأ من المخزَّن، وما قبله يُشتقّ كما كان
// ══════════════════════════════════════════════════════

import { primeTestDefs } from './_game-fixtures.js';
import { getRoleDefs } from '../game/definition-service.js';
import { resolveNightDynamic, actionKey } from '../game/dynamic-night-resolver.js';
import { buildNightPlan } from '../game/night-plan.js';
import { checkWinConditionDynamic, evaluateNeutralWins } from '../game/dynamic-win-checker.js';
import {
  initAssassinStates, assassinStateFor, allAssassinStates, assassinWinnerSeats, anyAssassinWon,
  regenerateDeadContracts, canSeatAssassinate, markAssassinFirstNightPassed, assassinRecipients,
} from '../game/assassin-engine.js';
import { analyzeDuplicates, hasDuplicateRoles } from '../game/role-duplicates.js';
import { neutralWinnerSeats, didPlayerWin, wonFromRow } from '../game/win-attribution.js';
import { computeMatchReward } from '../services/progression.service.js';

primeTestDefs();

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const section = (t: string) => console.log(`\n━━━ ${t} ━━━`);

function P(seat: number, role: string, alive = true): any {
  return { physicalId: seat, name: role + '#' + seat, phone: null, playerId: seat + 1000, role, isAlive: alive, isSilenced: false, justificationCount: 0 };
}
function mkState(players: any[], opts: any = {}): any {
  return {
    players, round: opts.round ?? 2,
    config: { witchDisableRounds: 3, useDynamicEngine: true, assassinContractCount: 2, jesterSurviveRounds: 2, ...(opts.config || {}) },
    performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: opts.eliminationLog || [] },
    witchPreviousTargets: [], twinState: null,
    assassinState: null, assassinRivals: null,
    nurseActivated: false,
    winner: opts.winner ?? null,
    dynamicNightState: { actions: {}, lastTargets: {} },
  };
}
function bag(list: Array<{ by: number; ab: string; t: number | null }>) {
  const actions: any = {};
  for (const a of list) {
    const action = { abilityId: a.ab, performerPhysicalId: a.by, targetPhysicalId: a.t, skipped: a.t == null };
    actions[actionKey(action)] = action;
  }
  return { actions, lastTargets: {} };
}
const alive = (s: any, id: number) => s.players.find((p: any) => p.physicalId === id)?.isAlive;
/** عقودٌ محدّدة بدل العشوائيّة — كي يُختبر الاحتسابُ لا النرد. */
const setContracts = (a: any, roles: string[]) => {
  a.contracts = roles.map((r, i) => ({ id: i + 1, type: 'KILL_ROLE', targetRole: r, description: r, descriptionAr: r, completed: false }));
  a.totalRequired = roles.length; a.completedCount = 0; a.won = false; a.firstNightPassed = true;
};

async function main() {
  console.log('🧪 الكروتُ المكرَّرة\n');

  section('1) سياسةُ التكرار — المسموح والممنوع والحشو');
  {
    const r = analyzeDuplicates(['SNIPER', 'SNIPER', 'CITIZEN', 'CITIZEN', 'MAFIA_REGULAR', 'MAFIA_REGULAR', 'GODFATHER']);
    check('قنّاصان ⇒ مسموحٌ ×2', r.allowed.length === 1 && r.allowed[0].role === 'SNIPER' && r.allowed[0].count === 2);
    check('الحشو (مواطن/مافيا عادي) لا يُعدّ تكراراً', r.blocked.length === 0 && r.allowed.length === 1);
    const b = analyzeDuplicates(['GODFATHER', 'GODFATHER', 'MAYOR', 'MAYOR', 'JESTER', 'JESTER', 'ASSASSIN', 'ASSASSIN']);
    check('شيخان وعمدتان ⇒ ممنوع', b.blocked.map(x => x.role).sort().join() === 'GODFATHER,MAYOR');
    check('مهرّجان وسفّاحان ⇒ مسموح', b.allowed.map(x => x.role).sort().join() === 'ASSASSIN,JESTER');
    check('الممنوعُ يحمل سبباً للّيدر', b.blocked.every(x => !!x.reason));
    check('بلا تكرار ⇒ hasDuplicateRoles=false', !hasDuplicateRoles(['GODFATHER', 'SNIPER', 'CITIZEN', 'CITIZEN']));
  }

  section('2) الخطّة — لكلّ نسخةٍ خانتُها');
  {
    const s = mkState([P(1, 'GODFATHER'), P(2, 'SNIPER'), P(3, 'SNIPER'), P(4, 'DOCTOR'), P(5, 'DOCTOR'), P(6, 'CITIZEN')]);
    const plan = await buildNightPlan(s);
    const snipes = plan.filter(x => x.abilityId === 'SNIPE').map(x => x.seat).sort();
    const protects = plan.filter(x => x.abilityId === 'PROTECT').map(x => x.seat).sort();
    check('قنّاصان ⇒ خانتا قنص (2 و3)', snipes.join() === '2,3', snipes.join());
    check('طبيبان ⇒ خانتا حماية (4 و5)', protects.join() === '4,5', protects.join());
    check('الاغتيالُ ما زال لحاملٍ واحد', plan.filter(x => x.abilityId === 'KILL').length === 1);
  }

  section('3) قنّاصان — كلٌّ بطلقته');
  {
    // 2 يقنص مافيا (1)، و3 يقنص مواطناً (6) ⇒ 1 يموت، 6 و3 يموتان، و2 يعيش
    const s = mkState([P(1, 'MAFIA_REGULAR'), P(9, 'GODFATHER'), P(2, 'SNIPER'), P(3, 'SNIPER'), P(6, 'CITIZEN'), P(7, 'CITIZEN')]);
    const evs = await resolveNightDynamic(s, bag([{ by: 2, ab: 'SNIPE', t: 1 }, { by: 3, ab: 'SNIPE', t: 6 }]));
    check('هدفُ القنّاص الأوّل (مافيا) مات', alive(s, 1) === false);
    check('القنّاصُ الأوّل حيّ', alive(s, 2) === true);
    check('هدفُ الثاني (مواطن) مات', alive(s, 6) === false);
    check('القنّاصُ الثاني مات معه — هو لا الأوّل', alive(s, 3) === false);
    const sc = evs.find(e => e.type === 'SNIPE_CITIZEN');
    check('حدثُ قنص المواطن يحمل القنّاص الصحيح (3)', sc?.extra?.sniperPhysicalId === 3, String(sc?.extra?.sniperPhysicalId));
    check('حدثا قنص منفصلان', evs.filter(e => e.type === 'SNIPE_MAFIA' || e.type === 'SNIPE_CITIZEN').length === 2);
  }
  {
    // الطبيب يحمي 1 والقنّاصان كلاهما عليه ⇒ الطلقتان تُبطَلان
    const s = mkState([P(1, 'MAFIA_REGULAR'), P(9, 'GODFATHER'), P(2, 'SNIPER'), P(3, 'SNIPER'), P(4, 'DOCTOR')]);
    await resolveNightDynamic(s, bag([{ by: 2, ab: 'SNIPE', t: 1 }, { by: 3, ab: 'SNIPE', t: 1 }, { by: 4, ab: 'PROTECT', t: 1 }]));
    check('الحمايةُ تُبطل الطلقتين على المحميّ', alive(s, 1) === true);
  }
  {
    // الساحرةُ تعطّل القنّاص 2 ⇒ طلقتُه تسقط وطلقةُ 3 تمضي
    const s = mkState([P(1, 'MAFIA_REGULAR'), P(8, 'SILENCER'), P(9, 'GODFATHER'), P(5, 'WITCH'), P(2, 'SNIPER'), P(3, 'SNIPER')]);
    await resolveNightDynamic(s, bag([{ by: 5, ab: 'DISABLE_ABILITY', t: 2 }, { by: 2, ab: 'SNIPE', t: 1 }, { by: 3, ab: 'SNIPE', t: 8 }]));
    check('طلقةُ المعطَّل سقطت (1 حيّ)', alive(s, 1) === true);
    check('طلقةُ غير المعطَّل مضت (8 مات)', alive(s, 8) === false);
  }

  section('4) سفّاحٌ واحد — لا يتغيّر شيء');
  {
    const s = mkState([P(1, 'GODFATHER'), P(2, 'SHERIFF'), P(3, 'ASSASSIN'), P(4, 'CITIZEN')]);
    const all = initAssassinStates(s);
    check('حالةٌ واحدة في assassinState', all.length === 1 && s.assassinState?.assassinPhysicalId === 3);
    check('لا متنافسين ولا شركاء', s.assassinRivals === null && !s.assassinState.memberSeats);
  }

  section('5) سفّاحان متنافسان — لكلٍّ عقودُه');
  {
    const s = mkState([P(1, 'GODFATHER'), P(2, 'SHERIFF'), P(3, 'ASSASSIN'), P(4, 'ASSASSIN'), P(5, 'DOCTOR'), P(6, 'CITIZEN'), P(7, 'CITIZEN')],
      { config: { assassinMode: 'RIVALS' } });
    const all = initAssassinStates(s);
    check('حالتان: الأوّل في assassinState والثاني في assassinRivals', all.length === 2 && s.assassinState.assassinPhysicalId === 3 && s.assassinRivals?.[0]?.assassinPhysicalId === 4);
    check('كلُّ مقعدٍ يجد حالتَه', assassinStateFor(s, 3) === s.assassinState && assassinStateFor(s, 4) === s.assassinRivals[0]);
    check('العقودُ تصل الهاتفين كلاهما', assassinRecipients(s).map(r => r.seat).sort().join() === '3,4');

    check('أوّلَ ليلةٍ لا قتل لأيٍّ منهما', !canSeatAssassinate(s, 3) && !canSeatAssassinate(s, 4));
    markAssassinFirstNightPassed(s);
    check('بعد الأولى: الاثنان يقتلان', canSeatAssassinate(s, 3) && canSeatAssassinate(s, 4));
    const plan = await buildNightPlan(s);
    check('الخطّةُ فيها خانتا اغتيال سفّاح', plan.filter(x => x.abilityId === 'ASSASSINATE').map(x => x.seat).sort().join() === '3,4');

    setContracts(s.assassinState, ['SHERIFF']);
    setContracts(s.assassinRivals[0], ['DOCTOR']);
    // 3 يقتل الطبيب (عقدُ 4 لا عقدُه) ⇒ لا يُحتسب لأحد
    await resolveNightDynamic(s, bag([{ by: 3, ab: 'ASSASSINATE', t: 5 }]));
    check('قتلُ عقدِ المنافس لا يُحتسب للقاتل', s.assassinState.completedCount === 0);
    check('ولا يُحتسب للمنافس (لم يقتل)', s.assassinRivals[0].completedCount === 0);
    regenerateDeadContracts(s);
    check('عقدُ المنافس على الطبيب الميت يتجدّد', s.assassinRivals[0].contracts[0].targetRole !== 'DOCTOR');

    // 4 يقتل الشريف ⇒ ليس عقدَه (عقده تجدّد) — نضبطه ليكون الشريف ونختبر الفوز
    setContracts(s.assassinRivals[0], ['SHERIFF']);
    s.assassinRivals[0].firstNightPassed = true;
    const evs = await resolveNightDynamic(s, bag([{ by: 4, ab: 'ASSASSINATE', t: 2 }]));
    check('4 أكمل عقدَه', s.assassinRivals[0].won === true && s.assassinRivals[0].completedCount === 1);
    check('3 لم يُكمل شيئاً', s.assassinState.won === false && s.assassinState.completedCount === 0);
    check('حدثُ السفّاح يعلن الفوز', evs.some(e => e.type === 'ASSASSIN_KILL' && e.extra?.assassinWon === true));
    check('anyAssassinWon', anyAssassinWon(s));
    check('الفائزُ 4 وحده', assassinWinnerSeats(s).join() === '4');
    check('مَن أكمل عقودَه لا يقتل بعدها', !canSeatAssassinate(s, 4) && canSeatAssassinate(s, 3));

    const w = await checkWinConditionDynamic(s);
    check('الفائز الرئيس: السفّاح', w.mainWinner === 'ASSASSIN');
    const nr = evaluateNeutralWins(s, await getRoleDefs());
    check('نتيجةُ 4 فوز ونتيجةُ 3 خسارة', nr.find(r => r.physicalId === 4)?.won === true && nr.find(r => r.physicalId === 3)?.won === false);

    s.winner = 'ASSASSIN';
    const seats = neutralWinnerSeats(s, await getRoleDefs());
    check('ختمُ المباراة: 4 فاز', didPlayerWin(s, { physicalId: 4, role: 'ASSASSIN' }, seats));
    check('ختمُ المباراة: 3 خسر', !didPlayerWin(s, { physicalId: 3, role: 'ASSASSIN' }, seats));
    check('ختمُ المباراة: المواطن خسر', !didPlayerWin(s, { physicalId: 6, role: 'CITIZEN' }, seats));
  }

  section('6) سفّاحان شريكان — عقودٌ مشتركة وفوزٌ مشترك');
  {
    const s = mkState([P(1, 'GODFATHER'), P(2, 'SHERIFF'), P(3, 'ASSASSIN'), P(4, 'ASSASSIN'), P(5, 'DOCTOR'), P(6, 'CITIZEN')],
      { config: { assassinMode: 'PARTNERS' } });
    const all = initAssassinStates(s);
    check('حالةٌ واحدة بمقعدين', all.length === 1 && s.assassinState.memberSeats?.join() === '3,4' && !s.assassinRivals);
    check('المقعدان يجدان الحالةَ نفسها', assassinStateFor(s, 3) === assassinStateFor(s, 4));
    setContracts(s.assassinState, ['SHERIFF', 'DOCTOR']);
    await resolveNightDynamic(s, bag([{ by: 3, ab: 'ASSASSINATE', t: 2 }]));
    check('قتلُ 3 يُكمل عقداً مشتركاً', s.assassinState.completedCount === 1);
    s.players.find((p: any) => p.physicalId === 3).isAlive = false; // الشريكُ مات
    await resolveNightDynamic(s, bag([{ by: 4, ab: 'ASSASSINATE', t: 5 }]));
    check('قتلُ 4 يُكمل الثاني ⇒ فوز', s.assassinState.won === true && s.assassinState.completedCount === 2);
    check('الفائزون: الشريكان معاً', assassinWinnerSeats(s).sort().join() === '3,4');
    const nr = evaluateNeutralWins(s, await getRoleDefs());
    check('الشريكُ الميّت فائز أيضاً', nr.find(r => r.physicalId === 3)?.won === true);
    s.winner = 'ASSASSIN';
    const seats = neutralWinnerSeats(s, await getRoleDefs());
    check('ختمُ المباراة للاثنين', didPlayerWin(s, { physicalId: 3, role: 'ASSASSIN' }, seats) && didPlayerWin(s, { physicalId: 4, role: 'ASSASSIN' }, seats));
  }

  section('7) مهرّجان — يفوز المطرودُ وحده');
  {
    const s = mkState([P(1, 'GODFATHER'), P(2, 'JESTER', false), P(3, 'JESTER'), P(4, 'CITIZEN')], {
      round: 3, winner: 'JESTER',
      eliminationLog: [{ physicalId: 2, eliminatedBy: 'DAY_VOTE', round: 3, team: 'NEUTRAL' }],
    });
    const seats = neutralWinnerSeats(s, await getRoleDefs());
    check('المطرود (2) فائز', didPlayerWin(s, { physicalId: 2, role: 'JESTER' }, seats));
    check('الآخر (3) خاسر', !didPlayerWin(s, { physicalId: 3, role: 'JESTER' }, seats));
    check('الشيخ خاسر', !didPlayerWin(s, { physicalId: 1, role: 'GODFATHER' }, seats));
  }
  {
    // مهرّجٌ قُتل ليلاً + مهرّجٌ طُرد ⇒ المطرود وحده
    const s = mkState([P(2, 'JESTER', false), P(3, 'JESTER', false), P(4, 'CITIZEN')], {
      round: 3, winner: 'JESTER',
      eliminationLog: [{ physicalId: 3, eliminatedBy: 'NIGHT_KILL', round: 2, team: 'NEUTRAL' }, { physicalId: 2, eliminatedBy: 'DAY_VOTE', round: 3, team: 'NEUTRAL' }],
    });
    const seats = neutralWinnerSeats(s, await getRoleDefs());
    check('المقتولُ ليلاً لا يفوز', !didPlayerWin(s, { physicalId: 3, role: 'JESTER' }, seats) && didPlayerWin(s, { physicalId: 2, role: 'JESTER' }, seats));
  }
  {
    // لعبةٌ قديمة بلا سجلّ ⇒ يسقط على كلّ حاملي الدور (كما كان)
    const s = mkState([P(2, 'JESTER', false), P(4, 'CITIZEN')], { round: 3, winner: 'JESTER' });
    const seats = neutralWinnerSeats(s, await getRoleDefs());
    check('بلا سجلّ: المهرّجُ الوحيد فائز', didPlayerWin(s, { physicalId: 2, role: 'JESTER' }, seats));
  }

  section('8) الفريقان كما كانا');
  {
    const s = mkState([P(1, 'GODFATHER'), P(2, 'SILENCER'), P(3, 'SHERIFF'), P(4, 'JESTER')], { winner: 'MAFIA' });
    check('فوزُ المافيا: الشيخ فائز', didPlayerWin(s, { physicalId: 1, role: 'GODFATHER' }, null));
    check('فوزُ المافيا: الشريف خاسر', !didPlayerWin(s, { physicalId: 3, role: 'SHERIFF' }, null));
    check('فوزُ المافيا: المهرّج خاسر', !didPlayerWin(s, { physicalId: 4, role: 'JESTER' }, null));
  }

  section('9) القرّاء — المخزَّن أوّلاً، والاشتقاقُ للقديم');
  {
    check('مخزَّن false يغلب «فاز المهرّج»', wonFromRow({ role: 'JESTER', winner: 'JESTER', won: false }) === false);
    check('مخزَّن true يُحترم', wonFromRow({ role: 'ASSASSIN', winner: 'ASSASSIN', won: true }) === true);
    check('قديمٌ بلا مخزَّن: المهرّج فائز بفوز المهرّج', wonFromRow({ role: 'JESTER', winner: 'JESTER', won: null }) === true);
    check('قديم: مواطنٌ بفوز المواطنين', wonFromRow({ role: 'SHERIFF', winner: 'CITIZEN' }) === true);
    check('قديم: مافيا بفوز المواطنين خاسر', wonFromRow({ role: 'WITCH', winner: 'CITIZEN' }) === false);
    check('قديم: مواطنٌ بفوز المهرّج خاسر', wonFromRow({ role: 'DOCTOR', winner: 'JESTER' }) === false);
  }

  section('10) النقاط — المهرّجُ الخاسر يُعطى نقاط الخسارة');
  {
    const base: any = {
      role: 'JESTER', winner: 'JESTER', survivedToEnd: true, roundsSurvived: 3,
      successfulDealsCount: 0, failedDealsCount: 0, mafiaDealOnMafiaCount: 0,
      abilityCorrectCount: 0, abilityIncorrectCount: 0, teamEliminationBonus: 0, assassinContractsCompleted: 0,
    };
    const wonR = computeMatchReward(base, undefined);
    const lostR = computeMatchReward({ ...base, neutralWon: false }, undefined);
    check('بلا neutralWon: كما كان (فوز)', wonR.won === true);
    check('neutralWon=false ⇒ خسارة', lostR.won === false && lostR.rrChange < wonR.rrChange);
    const ass = computeMatchReward({ ...base, role: 'ASSASSIN', winner: 'ASSASSIN', neutralWon: false, assassinContractsCompleted: 1 }, undefined);
    check('سفّاحٌ منافسٌ خسر: لا فوز وعقوده تُحتسب', ass.won === false);
  }

  section('11) لكلّ سفّاحٍ حالتُه في القائمة');
  {
    const s = mkState([P(3, 'ASSASSIN'), P(4, 'ASSASSIN'), P(5, 'ASSASSIN'), P(1, 'GODFATHER'), P(2, 'SHERIFF')], { config: { assassinMode: 'RIVALS' } });
    initAssassinStates(s);
    check('ثلاثةُ متنافسين ⇒ ثلاثُ حالات', allAssassinStates(s).length === 3);
    s.config.assassinMode = undefined;
    initAssassinStates(s);
    check('بلا نمطٍ محفوظ ⇒ متنافسون افتراضاً', allAssassinStates(s).length === 3);
  }

  console.log(`\n${'═'.repeat(50)}\n${fail === 0 ? '✅' : '❌'} ${pass} نجح · ${fail} فشل`);
  if (fail) { console.log('\nالفاشلة:'); failures.forEach(f => console.log('  • ' + f)); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
