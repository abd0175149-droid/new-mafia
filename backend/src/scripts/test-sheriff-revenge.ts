// ══════════════════════════════════════════════════════
// 🧪 ثأرُ الشريف — مَن سأل عنه يموت معه
//
// تشغيل: npx tsx src/scripts/test-sheriff-revenge.ts
// بلا قاعدة بيانات ولا Redis — تعاريفُ الإنتاج تُحقن في الكاش.
//
// الحالاتُ التي تُختبَر هي حدودُ القاعدة لا وسطُها: الحرباية (تظهر مواطناً
// وتخرج)، والسفّاح (يظهر مواطناً ولا يخرج)، والشريفُ الحيّ (لا ثأر)، والهدفُ
// الميّتُ أصلاً (لا قتلَ مرّتين)، والساحرةُ المعطِّلة (لا تحقيقَ أصلاً).
// ══════════════════════════════════════════════════════

import { __primeDefsForTest } from '../game/definition-service.js';
import { resolveNightDynamic } from '../game/dynamic-night-resolver.js';
import { Role } from '../game/roles.js';
import { initTwinState } from '../game/twin-engine.js';

const ABILITIES_RAW = [
  { id: 'KILL', phase: 'NIGHT', priority: 1, target_type: 'ENEMY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'ELIMINATE', effect_on_success: 'ASSASSINATION', effect_on_fail: null, is_inheritable: true, inheritance_order: ['GODFATHER', 'CHAMELEON', 'SILENCER', 'WITCH', 'OLDER_BROTHER', 'MAFIA_REGULAR'] },
  { id: 'SILENCE', phase: 'NIGHT', priority: 2, target_type: 'ANY', exclude_self: false, exclude_last_target: false, max_targets: 1, effect_type: 'SILENCE', effect_on_success: 'SILENCED', effect_on_fail: null },
  { id: 'INVESTIGATE', phase: 'NIGHT', priority: 3, target_type: 'ANY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'REVEAL_TEAM', effect_on_success: 'SHERIFF_RESULT', effect_on_fail: null },
  { id: 'PROTECT', phase: 'NIGHT', priority: 4, target_type: 'ANY', exclude_self: true, exclude_last_target: true, max_targets: 1, effect_type: 'BLOCK_ELIMINATE', effect_on_success: 'ASSASSINATION_BLOCKED', effect_on_fail: 'PROTECTION_FAILED' },
  { id: 'SNIPE', phase: 'NIGHT', priority: 5, target_type: 'ANY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'CONDITIONAL_ELIMINATE', effect_on_success: 'SNIPE_MAFIA', effect_on_fail: 'SNIPE_CITIZEN' },
  { id: 'ASSASSINATE', phase: 'NIGHT', priority: 6, target_type: 'ANY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'ELIMINATE', effect_on_success: 'ASSASSIN_KILL', effect_on_fail: null },
  { id: 'DISABLE_ABILITY', phase: 'NIGHT', priority: 2, target_type: 'ENEMY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'DISABLE', effect_on_success: null, effect_on_fail: null },
];
const ROLES_RAW = [
  { id: 'GODFATHER', team: 'MAFIA', abilities: ['KILL'], gen_priority: 1 },
  { id: 'SILENCER', team: 'MAFIA', abilities: ['SILENCE'], gen_priority: 2 },
  { id: 'CHAMELEON', team: 'MAFIA', abilities: [], gen_priority: 3 },
  { id: 'WITCH', team: 'MAFIA', abilities: ['DISABLE_ABILITY'], gen_priority: 3 },
  { id: 'OLDER_BROTHER', team: 'MAFIA', abilities: ['KILL'], gen_priority: 15 },
  { id: 'MAFIA_REGULAR', team: 'MAFIA', abilities: [], gen_priority: 99 },
  { id: 'SHERIFF', team: 'CITIZEN', abilities: ['INVESTIGATE'], gen_priority: 1 },
  { id: 'DOCTOR', team: 'CITIZEN', abilities: ['PROTECT'], gen_priority: 2 },
  { id: 'SNIPER', team: 'CITIZEN', abilities: ['SNIPE'], gen_priority: 3 },
  { id: 'POLICEWOMAN', team: 'CITIZEN', abilities: [], gen_priority: 4 },
  { id: 'NURSE', team: 'CITIZEN', abilities: ['PROTECT'], gen_priority: 5 },
  { id: 'CITIZEN', team: 'CITIZEN', abilities: [], gen_priority: 99 },
  { id: 'YOUNGER_BROTHER', team: 'CITIZEN', abilities: [], gen_priority: 15 },
  { id: 'JESTER', team: 'NEUTRAL', abilities: [], gen_priority: 10, win_condition_type: 'VOTED_OUT' },
  { id: 'ASSASSIN', team: 'NEUTRAL', abilities: ['ASSASSINATE'], gen_priority: 20, win_condition_type: 'COMPLETE_CONTRACTS' },
];
const INTERACTIONS_RAW = [
  { id: 5, ability_a: 'KILL', ability_b: 'PROTECT', condition: 'SAME_TARGET', resolution: 'B_CANCELS_A', result_event: 'ASSASSINATION_BLOCKED', priority: 1 },
  { id: 6, ability_a: 'ASSASSINATE', ability_b: 'PROTECT', condition: 'SAME_TARGET', resolution: 'B_CANCELS_A', result_event: 'ASSASSIN_BLOCKED', priority: 2 },
];

const camelize = (o: any): any => {
  const out: any = {};
  for (const [k, v] of Object.entries(o)) out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  return out;
};
__primeDefsForTest({
  abilities: ABILITIES_RAW.map(camelize) as any,
  roles: ROLES_RAW.map(camelize) as any,
  interactions: INTERACTIONS_RAW.map(camelize) as any,
});

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t: string) { console.log(`\n━━━ ${t} ━━━`); }

function P(physicalId: number, role: Role | string, isAlive = true): any {
  return { physicalId, name: role + '#' + physicalId, phone: null, playerId: physicalId + 1000, role, isAlive, isSilenced: false, justificationCount: 0 };
}
function mkState(players: any[], opts: any = {}): any {
  const s: any = {
    players, round: opts.round ?? 2,
    config: { witchDisableRounds: 3, jesterSurviveRounds: 2, useDynamicEngine: true },
    performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] },
    witchPreviousTargets: [], twinState: null, assassinState: opts.assassinState ?? null,
  };
  if (opts.twin) s.twinState = initTwinState(s);
  return s;
}
function night(acts: Array<{ ab: string; by: number; t: number | null; skip?: boolean }>): any {
  const actions: any = {};
  for (const a of acts) actions[a.ab] = { abilityId: a.ab, performerPhysicalId: a.by, targetPhysicalId: a.t, skipped: a.skip || false };
  return { actions, lastTargets: {} };
}
const alive = (s: any, id: number) => s.players.find((p: any) => p.physicalId === id)?.isAlive;
const evType = (evs: any[], t: string) => evs.find(e => e.type === t);

async function main() {
  console.log('🧪 ثأرُ الشريف — مَن سأل عنه يموت معه\n');

  section('1) الحالة الأساسيّة');
  {
    // شريفٌ يحقّق في شيخ المافيا، والمافيا تقتله في الليلة نفسها
    const s = mkState([P(1, Role.GODFATHER), P(2, Role.SHERIFF), P(7, Role.CITIZEN)]);
    const ev = await resolveNightDynamic(s, night([
      { ab: 'KILL', by: 1, t: 2 },
      { ab: 'INVESTIGATE', by: 2, t: 1 },
    ]));
    check('الشريف مات', alive(s, 2) === false);
    check('حدث SHERIFF_REVENGE موجود', !!evType(ev, 'SHERIFF_REVENGE'));
    check('المافيويّ الذي سأل عنه خرج معه', alive(s, 1) === false);
    check('الحدث يحمل اسمَ الشريف', evType(ev, 'SHERIFF_REVENGE')?.performerPhysicalId === 2);
  }

  section('2) الحرباية — تظهر مواطناً وتخرج');
  {
    const s = mkState([P(1, Role.GODFATHER), P(3, Role.CHAMELEON), P(2, Role.SHERIFF)]);
    const ev = await resolveNightDynamic(s, night([
      { ab: 'KILL', by: 1, t: 2 },
      { ab: 'INVESTIGATE', by: 2, t: 3 },
    ]));
    check('نتيجة التحقيق ظهرت «مواطن»', evType(ev, 'SHERIFF_RESULT')?.extra?.team === 'CITIZEN');
    check('ومع ذلك خرجت الحرباية', alive(s, 3) === false);
    check('الحدث مُعلَّم بالخداع', evType(ev, 'SHERIFF_REVENGE')?.extra?.wasDeceptive === true);
  }

  section('3) مَن لا يخرج');
  {
    // مواطن
    let s = mkState([P(1, Role.GODFATHER), P(2, Role.SHERIFF), P(7, Role.CITIZEN)]);
    let ev = await resolveNightDynamic(s, night([
      { ab: 'KILL', by: 1, t: 2 }, { ab: 'INVESTIGATE', by: 2, t: 7 },
    ]));
    check('سأل عن مواطن: لا ثأر', !evType(ev, 'SHERIFF_REVENGE'));
    check('سأل عن مواطن: المواطن حيّ', alive(s, 7) === true);

    // مستقلّ (السفّاح — يظهر مواطناً أيضاً وهو محايد)
    s = mkState([P(1, Role.GODFATHER), P(2, Role.SHERIFF), P(10, 'ASSASSIN')]);
    ev = await resolveNightDynamic(s, night([
      { ab: 'KILL', by: 1, t: 2 }, { ab: 'INVESTIGATE', by: 2, t: 10 },
    ]));
    check('سأل عن مستقلّ: لا ثأر', !evType(ev, 'SHERIFF_REVENGE'));
    check('سأل عن مستقلّ: المستقلّ حيّ', alive(s, 10) === true);

    // المهرّج
    s = mkState([P(1, Role.GODFATHER), P(2, Role.SHERIFF), P(11, 'JESTER')]);
    ev = await resolveNightDynamic(s, night([
      { ab: 'KILL', by: 1, t: 2 }, { ab: 'INVESTIGATE', by: 2, t: 11 },
    ]));
    check('سأل عن المهرّج: المهرّج حيّ', alive(s, 11) === true);
  }

  section('4) الشريفُ حيّ ⇒ لا ثأر');
  {
    const s = mkState([P(1, Role.GODFATHER), P(2, Role.SHERIFF), P(7, Role.CITIZEN)]);
    const ev = await resolveNightDynamic(s, night([
      { ab: 'KILL', by: 1, t: 7 },              // قتلوا مواطناً لا الشريف
      { ab: 'INVESTIGATE', by: 2, t: 1 },
    ]));
    check('الشريف حيّ', alive(s, 2) === true);
    check('لا حدثَ ثأر', !evType(ev, 'SHERIFF_REVENGE'));
    check('شيخ المافيا حيّ', alive(s, 1) === true);
  }

  section('5) الساحرةُ تُعطّل الشريف ⇒ لا تحقيقَ ولا ثأر');
  {
    const s = mkState([P(1, Role.GODFATHER), P(4, Role.WITCH), P(2, Role.SHERIFF)]);
    const ev = await resolveNightDynamic(s, night([
      { ab: 'DISABLE_ABILITY', by: 4, t: 2 },
      { ab: 'KILL', by: 1, t: 2 },
      { ab: 'INVESTIGATE', by: 2, t: 1 },
    ]));
    check('الشريف مات', alive(s, 2) === false);
    check('لا نتيجةَ تحقيق (مُعطَّل)', !evType(ev, 'SHERIFF_RESULT'));
    check('لا ثأرَ — لم يُحقّق أصلاً', !evType(ev, 'SHERIFF_REVENGE'));
    check('شيخ المافيا حيّ', alive(s, 1) === true);
  }

  section('6) الهدفُ ميّتٌ أصلاً ⇒ لا قتلَ مرّتين');
  {
    // القنّاص يقنص شيخ المافيا، والشريفُ سأل عنه، والمافيا تقتل الشريف
    const s = mkState([P(1, Role.GODFATHER), P(2, Role.SHERIFF), P(9, Role.SNIPER)]);
    const ev = await resolveNightDynamic(s, night([
      { ab: 'KILL', by: 1, t: 2 },
      { ab: 'INVESTIGATE', by: 2, t: 1 },
      { ab: 'SNIPE', by: 9, t: 1 },
    ]));
    check('شيخ المافيا مات (بالقنص)', alive(s, 1) === false);
    check('لا حدثَ ثأرٍ مكرّر', !evType(ev, 'SHERIFF_REVENGE'));
    check('حدث القنص موجود', !!evType(ev, 'SNIPE_MAFIA'));
  }

  section('7) السفّاح يقتل الشريف ⇒ الثأر يقع');
  {
    // 🔴 الحالةُ التي يفوتها الحكمُ المبكّر: السفّاح يُعالَج بعد بند الشريف
    const s = mkState([P(1, Role.GODFATHER), P(2, Role.SHERIFF), P(10, 'ASSASSIN')], {
      assassinState: { assassinPhysicalId: 10, contracts: [], won: false },
    });
    const ev = await resolveNightDynamic(s, night([
      { ab: 'INVESTIGATE', by: 2, t: 1 },
      { ab: 'ASSASSINATE', by: 10, t: 2 },
    ]));
    check('الشريف مات بيد السفّاح', alive(s, 2) === false);
    check('الثأر وقع', !!evType(ev, 'SHERIFF_REVENGE'));
    check('شيخ المافيا خرج معه', alive(s, 1) === false);
  }

  section('8) الثأرُ يُشعل التوأمين');
  {
    // الشريفُ سأل عن الأخ الأكبر، والمافيا قتلته ⇒ يخرج الأخ الأكبر ⇒ ينقلب الأصغر
    const s = mkState([
      P(1, Role.GODFATHER), P(2, Role.SHERIFF),
      P(5, Role.OLDER_BROTHER), P(6, Role.YOUNGER_BROTHER),
    ], { twin: true });
    const ev = await resolveNightDynamic(s, night([
      { ab: 'KILL', by: 1, t: 2 },
      { ab: 'INVESTIGATE', by: 2, t: 5 },
    ]));
    check('الأخ الأكبر خرج بالثأر', alive(s, 5) === false);
    check('حدث تحوّل الأخ الأصغر', !!evType(ev, 'TWIN_TRANSFORM'));
    const younger = s.players.find((p: any) => p.physicalId === 6);
    check('الأخ الأصغر صار مافيا', younger?.role !== 'YOUNGER_BROTHER', `role=${younger?.role}`);
  }

  section('9) الثأرُ يُحسب في عتبة الشرطية');
  {
    // الشرطية ماتت، والشريف مات، والحرباية خرجت بالثأر — الثلاثةُ وفياتُ ليلةٍ واحدة
    const s = mkState([
      P(1, Role.GODFATHER), P(2, Role.SHERIFF), P(3, Role.CHAMELEON),
      P(8, Role.POLICEWOMAN), P(7, Role.CITIZEN),
    ]);
    const ev = await resolveNightDynamic(s, night([
      { ab: 'KILL', by: 1, t: 2 },
      { ab: 'INVESTIGATE', by: 2, t: 3 },
    ]));
    check('الحرباية خرجت', alive(s, 3) === false);
    check('الشرطية ما زالت حيّة (لم تُقتَل)', alive(s, 8) === true);
    check('الأحداث تحوي الثأر', !!evType(ev, 'SHERIFF_REVENGE'));
  }

  // ══════════════════════════════════════════════════════
  // الحالاتُ الحدّيّة: الشرطُ هو **موتُ الشريف** لا محاولةُ قتله
  // ══════════════════════════════════════════════════════

  section('10) الحمايةُ تُنقذ الشريف ⇒ لا ثأر');
  {
    // المافيا تحاول قتل الشريف، والطبيبُ يحميه ⇒ يبقى حيّاً ⇒ لا يخرج أحد
    const s = mkState([P(1, Role.GODFATHER), P(2, Role.SHERIFF), P(8, Role.DOCTOR)]);
    const ev = await resolveNightDynamic(s, night([
      { ab: 'KILL', by: 1, t: 2 },
      { ab: 'PROTECT', by: 8, t: 2 },
      { ab: 'INVESTIGATE', by: 2, t: 1 },
    ]));
    check('الاغتيال أُحبط', !!evType(ev, 'ASSASSINATION_BLOCKED'));
    check('الشريف حيّ', alive(s, 2) === true);
    check('لا ثأر — المحاولةُ ليست موتاً', !evType(ev, 'SHERIFF_REVENGE'));
    check('شيخ المافيا حيّ', alive(s, 1) === true);
  }

  section('11) الحمايةُ تُنقذ الشريف من السفّاح ⇒ لا ثأر');
  {
    const s = mkState([P(1, Role.GODFATHER), P(2, Role.SHERIFF), P(8, Role.DOCTOR), P(10, 'ASSASSIN')], {
      assassinState: { assassinPhysicalId: 10, contracts: [], won: false },
    });
    const ev = await resolveNightDynamic(s, night([
      { ab: 'ASSASSINATE', by: 10, t: 2 },
      { ab: 'PROTECT', by: 8, t: 2 },
      { ab: 'INVESTIGATE', by: 2, t: 1 },
    ]));
    check('السفّاح أُحبط', !!evType(ev, 'ASSASSIN_BLOCKED'));
    check('الشريف حيّ', alive(s, 2) === true);
    check('لا ثأر', !evType(ev, 'SHERIFF_REVENGE'));
    check('شيخ المافيا حيّ', alive(s, 1) === true);
  }

  section('12) القنّاصُ يقتل الشريف ⇒ الثأر يقع');
  {
    // القنّاص يقنص الشريف (مواطن) ⇒ يموتان معاً ⇒ مَن سأل عنه الشريفُ يخرج
    const s = mkState([P(1, Role.GODFATHER), P(2, Role.SHERIFF), P(9, Role.SNIPER)]);
    const ev = await resolveNightDynamic(s, night([
      { ab: 'INVESTIGATE', by: 2, t: 1 },
      { ab: 'SNIPE', by: 9, t: 2 },
    ]));
    check('الشريف مات بالقنص', alive(s, 2) === false);
    check('القنّاص مات معه', alive(s, 9) === false);
    check('الثأر وقع', !!evType(ev, 'SHERIFF_REVENGE'));
    check('شيخ المافيا خرج', alive(s, 1) === false);
  }

  section('13) الحمايةُ لا تُنقذ من القنص ⇒ الثأر يقع');
  {
    // 🔴 حدٌّ دقيق: الحمايةُ تُبطل الاغتيال وحدَه (قاعدةُ تفاعل KILL+PROTECT)،
    //    والقنصُ يقتل مباشرةً. فشريفٌ محميٌّ يقنصه القنّاص يموت — والثأر يقع.
    const s = mkState([P(1, Role.GODFATHER), P(2, Role.SHERIFF), P(8, Role.DOCTOR), P(9, Role.SNIPER)]);
    const ev = await resolveNightDynamic(s, night([
      { ab: 'PROTECT', by: 8, t: 2 },
      { ab: 'INVESTIGATE', by: 2, t: 1 },
      { ab: 'SNIPE', by: 9, t: 2 },
    ]));
    check('الشريف مات رغم الحماية (قنص)', alive(s, 2) === false);
    check('الثأر وقع', !!evType(ev, 'SHERIFF_REVENGE'));
    check('شيخ المافيا خرج', alive(s, 1) === false);
  }

  section('14) حمايةُ الهدف المافيويّ لا تمنع الثأر');
  {
    // 🔴 سلوكٌ مقصود ومُوثَّق: الحمايةُ تُبطل «الاغتيال»، والثأرُ ليس اغتيالاً —
    //    هو أثرُ انكشافٍ كالقنص. (إن أراد المالكُ عكسَه فموضعُه سطرٌ واحد.)
    const s = mkState([P(1, Role.GODFATHER), P(2, Role.SHERIFF), P(8, Role.DOCTOR)]);
    const ev = await resolveNightDynamic(s, night([
      { ab: 'KILL', by: 1, t: 2 },
      { ab: 'PROTECT', by: 8, t: 1 },     // الطبيبُ يحمي شيخ المافيا
      { ab: 'INVESTIGATE', by: 2, t: 1 },
    ]));
    check('الشريف مات', alive(s, 2) === false);
    check('الثأر وقع رغم حماية الهدف', !!evType(ev, 'SHERIFF_REVENGE'));
    check('شيخ المافيا خرج', alive(s, 1) === false);
  }

  section('15) الشريفُ يسأل عن الأخ الأصغر قبل تحوّله ⇒ لا ثأر');
  {
    // الأخ الأصغرُ مواطنٌ لحظةَ السؤال — وتحوّلُه يقع بعد الثأر في الترتيب
    const s = mkState([
      P(1, Role.GODFATHER), P(2, Role.SHERIFF),
      P(5, Role.OLDER_BROTHER), P(6, Role.YOUNGER_BROTHER),
    ], { twin: true });
    const ev = await resolveNightDynamic(s, night([
      { ab: 'KILL', by: 1, t: 2 },
      { ab: 'INVESTIGATE', by: 2, t: 6 },
    ]));
    check('الشريف مات', alive(s, 2) === false);
    check('لا ثأر — كان مواطناً لحظةَ السؤال', !evType(ev, 'SHERIFF_REVENGE'));
    check('الأخ الأصغر حيّ', alive(s, 6) === true);
    check('الأخ الأكبر حيّ', alive(s, 5) === true);
  }

  section('16) الشريفُ يسأل عن مافيويٍّ عاديّ');
  {
    const s = mkState([P(1, Role.GODFATHER), P(2, Role.SHERIFF), P(4, Role.MAFIA_REGULAR)]);
    const ev = await resolveNightDynamic(s, night([
      { ab: 'KILL', by: 1, t: 2 },
      { ab: 'INVESTIGATE', by: 2, t: 4 },
    ]));
    check('نتيجةُ التحقيق «مافيا»', evType(ev, 'SHERIFF_RESULT')?.extra?.team === 'MAFIA');
    check('المافيويُّ العاديّ خرج', alive(s, 4) === false);
    check('القاتلُ نفسُه حيّ (لم يُسأل عنه)', alive(s, 1) === true);
  }


  console.log('\n══════════════════════════════════════');
  console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
  if (fail) { console.log('\nالفاشلة:'); failures.forEach(f => console.log('  • ' + f)); process.exit(1); }
  console.log('\n🎉 ثأرُ الشريف يعمل كما وُصف.');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
