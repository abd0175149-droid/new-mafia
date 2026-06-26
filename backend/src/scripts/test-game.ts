// ══════════════════════════════════════════════════════
// 🧪 اختبار شامل لمحرك اللعبة (الديناميكي — نفس محرك الإنتاج useDynamicEngine=true)
// يشغّل resolveNightDynamic + checkWinConditionDynamic + checkNeutralVoteWin الحقيقيين
// بإعدادات الإنتاج (الأدوار/القدرات/قواعد التفاعل) مُحمّلة كـ fixtures عبر حقن الكاش.
// لا قاعدة بيانات ولا Redis ولا أي أثر على الإنتاج.
//
// تشغيل: npx tsx src/scripts/test-game.ts
// ══════════════════════════════════════════════════════

import { __primeDefsForTest } from '../game/definition-service.js';
import { resolveNightDynamic } from '../game/dynamic-night-resolver.js';
import { checkWinConditionDynamic, checkNeutralVoteWin } from '../game/dynamic-win-checker.js';
import { Role } from '../game/roles.js';
import { initTwinState } from '../game/twin-engine.js';

// ── fixtures الإنتاج (snake_case كما جُلبت من DB) ──
const ABILITIES_RAW = [
  { id: 'KILL', phase: 'NIGHT', priority: 1, target_type: 'ENEMY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'ELIMINATE', effect_on_success: 'ASSASSINATION', effect_on_fail: null, is_inheritable: true, inheritance_order: ['GODFATHER', 'CHAMELEON', 'SILENCER', 'MAFIA_REGULAR'] },
  { id: 'SILENCE', phase: 'NIGHT', priority: 2, target_type: 'ANY', exclude_self: false, exclude_last_target: false, max_targets: 1, effect_type: 'SILENCE', effect_on_success: 'SILENCED', effect_on_fail: null },
  { id: 'INVESTIGATE', phase: 'NIGHT', priority: 3, target_type: 'ANY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'REVEAL_TEAM', effect_on_success: 'SHERIFF_RESULT', effect_on_fail: null },
  { id: 'PROTECT', phase: 'NIGHT', priority: 4, target_type: 'ANY', exclude_self: true, exclude_last_target: true, max_targets: 1, effect_type: 'BLOCK_ELIMINATE', effect_on_success: 'ASSASSINATION_BLOCKED', effect_on_fail: 'PROTECTION_FAILED' },
  { id: 'SNIPE', phase: 'NIGHT', priority: 5, target_type: 'ANY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'CONDITIONAL_ELIMINATE', effect_on_success: 'SNIPE_MAFIA', effect_on_fail: 'SNIPE_CITIZEN' },
  { id: 'ASSASSINATE', phase: 'NIGHT', priority: 6, target_type: 'ANY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'ELIMINATE', effect_on_success: 'ASSASSIN_KILL', effect_on_fail: null },
  { id: 'DISABLE_ABILITY', phase: 'NIGHT', priority: 2, target_type: 'ENEMY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'DISABLE', effect_on_success: null, effect_on_fail: null },
];
const ROLES_RAW = [
  { id: 'GODFATHER', team: 'MAFIA', abilities: ['KILL'], gen_priority: 1, win_condition_type: null },
  { id: 'SILENCER', team: 'MAFIA', abilities: ['SILENCE'], gen_priority: 2, win_condition_type: null },
  { id: 'CHAMELEON', team: 'MAFIA', abilities: [], gen_priority: 3, win_condition_type: null },
  { id: 'WITCH', team: 'MAFIA', abilities: ['DISABLE_ABILITY'], gen_priority: 3, win_condition_type: null },
  { id: 'OLDER_BROTHER', team: 'MAFIA', abilities: ['KILL'], gen_priority: 15, win_condition_type: null },
  { id: 'MAFIA_REGULAR', team: 'MAFIA', abilities: [], gen_priority: 99, win_condition_type: null },
  { id: 'SHERIFF', team: 'CITIZEN', abilities: ['INVESTIGATE'], gen_priority: 1, win_condition_type: null },
  { id: 'DOCTOR', team: 'CITIZEN', abilities: ['PROTECT'], gen_priority: 2, win_condition_type: null },
  { id: 'SNIPER', team: 'CITIZEN', abilities: ['SNIPE'], gen_priority: 3, win_condition_type: null },
  { id: 'POLICEWOMAN', team: 'CITIZEN', abilities: [], gen_priority: 4, win_condition_type: null },
  { id: 'NURSE', team: 'CITIZEN', abilities: ['PROTECT'], gen_priority: 5, win_condition_type: null },
  { id: 'CITIZEN', team: 'CITIZEN', abilities: [], gen_priority: 99, win_condition_type: null },
  { id: 'YOUNGER_BROTHER', team: 'CITIZEN', abilities: [], gen_priority: 15, win_condition_type: null },
  { id: 'JESTER', team: 'NEUTRAL', abilities: [], gen_priority: 10, win_condition_type: 'VOTED_OUT', win_condition_description: 'يفوز إذا أُقصي بالتصويت' },
  { id: 'ASSASSIN', team: 'NEUTRAL', abilities: ['ASSASSINATE'], gen_priority: 20, win_condition_type: 'COMPLETE_CONTRACTS', win_condition_description: 'يفوز بإكمال العقود' },
];
const INTERACTIONS_RAW = [
  { id: 5, ability_a: 'KILL', ability_b: 'PROTECT', condition: 'SAME_TARGET', resolution: 'B_CANCELS_A', result_event: 'ASSASSINATION_BLOCKED', priority: 1 },
  { id: 6, ability_a: 'ASSASSINATE', ability_b: 'PROTECT', condition: 'SAME_TARGET', resolution: 'B_CANCELS_A', result_event: 'ASSASSIN_BLOCKED', priority: 2 },
];

// ── snake_case → camelCase ──
const camelKey = (k: string) => k.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
const camelize = (o: any) => { const r: any = {}; for (const k of Object.keys(o)) r[camelKey(k)] = o[k]; return r; };

__primeDefsForTest({
  abilities: ABILITIES_RAW.map(camelize) as any,
  roles: ROLES_RAW.map(camelize) as any,
  interactions: INTERACTIONS_RAW.map(camelize) as any,
});

// ── أدوات الاختبار ──
let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t: string) { console.log(`\n━━━ ${t} ━━━`); }

function P(physicalId: number, role: Role, isAlive = true): any {
  return { physicalId, name: role + '#' + physicalId, phone: null, playerId: physicalId + 1000, role, isAlive, isSilenced: false, justificationCount: 0 };
}
function mkState(players: any[], opts: any = {}): any {
  const s: any = {
    players, round: opts.round ?? 2,
    config: { witchDisableRounds: 3, jesterSurviveRounds: 2, useDynamicEngine: true },
    performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] },
    witchPreviousTargets: [],
    twinState: null,
    assassinState: opts.assassinState ?? null,
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
  console.log('🧪 اختبار شامل لمحرك اللعبة الديناميكي (إعدادات إنتاج حقيقية)\n');

  // ═══ قتل المافيا + الحماية ═══
  section('1) اغتيال المافيا والحماية');
  {
    // 1: اغتيال بلا حماية → يموت الهدف
    let s = mkState([P(1, Role.GODFATHER), P(7, Role.CITIZEN)]);
    let ev = await resolveNightDynamic(s, night([{ ab: 'KILL', by: 1, t: 7 }]));
    check('اغتيال بلا حماية: حدث ASSASSINATION', !!evType(ev, 'ASSASSINATION'));
    check('اغتيال بلا حماية: الهدف مات', alive(s, 7) === false);

    // 2: اغتيال + حماية نفس الهدف → يُحبط، الهدف حي
    s = mkState([P(1, Role.GODFATHER), P(8, Role.DOCTOR), P(7, Role.CITIZEN)]);
    ev = await resolveNightDynamic(s, night([{ ab: 'KILL', by: 1, t: 7 }, { ab: 'PROTECT', by: 8, t: 7 }]));
    check('اغتيال+حماية نفس الهدف: ASSASSINATION_BLOCKED', !!evType(ev, 'ASSASSINATION_BLOCKED'));
    check('اغتيال+حماية: الهدف حي', alive(s, 7) === true);
    check('اغتيال+حماية: لا حدث موت', !evType(ev, 'ASSASSINATION'));

    // 3: حماية هدف مختلف → الاغتيال ينجح
    s = mkState([P(1, Role.GODFATHER), P(8, Role.DOCTOR), P(7, Role.CITIZEN), P(12, Role.CITIZEN)]);
    ev = await resolveNightDynamic(s, night([{ ab: 'KILL', by: 1, t: 7 }, { ab: 'PROTECT', by: 8, t: 12 }]));
    check('حماية هدف آخر: الاغتيال نجح', alive(s, 7) === false);
  }

  // ═══ القنص ═══
  section('2) القنص (القناص)');
  {
    // قنص مافيا → يموت المافيا، القناص يعيش
    let s = mkState([P(9, Role.SNIPER), P(1, Role.GODFATHER)]);
    let ev = await resolveNightDynamic(s, night([{ ab: 'SNIPE', by: 9, t: 1 }]));
    check('قنص مافيا: SNIPE_MAFIA', !!evType(ev, 'SNIPE_MAFIA'));
    check('قنص مافيا: المافيا مات', alive(s, 1) === false);
    check('قنص مافيا: القناص حي', alive(s, 9) === true);

    // قنص مواطن → يموت الاثنان
    s = mkState([P(9, Role.SNIPER), P(12, Role.CITIZEN)]);
    ev = await resolveNightDynamic(s, night([{ ab: 'SNIPE', by: 9, t: 12 }]));
    check('قنص مواطن: SNIPE_CITIZEN', !!evType(ev, 'SNIPE_CITIZEN'));
    check('قنص مواطن: الهدف مات', alive(s, 12) === false);
    check('قنص مواطن: القناص مات أيضاً', alive(s, 9) === false);
  }

  // ═══ الإسكات ═══
  section('3) الإسكات (قص المافيا)');
  {
    const s = mkState([P(2, Role.SILENCER), P(7, Role.CITIZEN)]);
    const ev = await resolveNightDynamic(s, night([{ ab: 'SILENCE', by: 2, t: 7 }]));
    check('إسكات: حدث SILENCED', !!evType(ev, 'SILENCED'));
    check('إسكات: الهدف isSilenced=true', s.players.find((p: any) => p.physicalId === 7).isSilenced === true);
    check('إسكات: الهدف حي', alive(s, 7) === true);
  }

  // ═══ تحقيق الشريف + الخداع ═══
  section('4) تحقيق الشريف والخداع (الحرباية/السفّاح/التعطيل)');
  {
    // مافيا حقيقي → MAFIA
    let s = mkState([P(7, Role.SHERIFF), P(1, Role.GODFATHER)]);
    let ev = await resolveNightDynamic(s, night([{ ab: 'INVESTIGATE', by: 7, t: 1 }]));
    check('تحقيق على شيخ المافيا → MAFIA', evType(ev, 'SHERIFF_RESULT')?.extra?.team === 'MAFIA');

    // حرباية → تظهر CITIZEN (خداع)
    s = mkState([P(7, Role.SHERIFF), P(3, Role.CHAMELEON)]);
    ev = await resolveNightDynamic(s, night([{ ab: 'INVESTIGATE', by: 7, t: 3 }]));
    check('تحقيق على الحرباية → CITIZEN (خداع)', evType(ev, 'SHERIFF_RESULT')?.extra?.team === 'CITIZEN');

    // حرباية معطّلة بالساحرة → تنكشف MAFIA
    s = mkState([P(7, Role.SHERIFF), P(3, Role.CHAMELEON), P(4, Role.WITCH)]);
    ev = await resolveNightDynamic(s, night([{ ab: 'INVESTIGATE', by: 7, t: 3 }, { ab: 'DISABLE_ABILITY', by: 4, t: 3 }]));
    check('تحقيق على حرباية معطّلة → MAFIA (انكشف الخداع)', evType(ev, 'SHERIFF_RESULT')?.extra?.team === 'MAFIA');

    // السفّاح → يظهر CITIZEN (خداع)
    s = mkState([P(7, Role.SHERIFF), P(15, Role.ASSASSIN)]);
    ev = await resolveNightDynamic(s, night([{ ab: 'INVESTIGATE', by: 7, t: 15 }]));
    check('تحقيق على السفّاح → CITIZEN (خداع)', evType(ev, 'SHERIFF_RESULT')?.extra?.team === 'CITIZEN');
  }

  // ═══ الساحرة تعطّل القدرات ═══
  section('5) الساحرة (تعطيل القدرات)');
  {
    // تعطيل الشريف → لا نتيجة تحقيق
    let s = mkState([P(4, Role.WITCH), P(7, Role.SHERIFF), P(1, Role.GODFATHER)]);
    let ev = await resolveNightDynamic(s, night([{ ab: 'DISABLE_ABILITY', by: 4, t: 7 }, { ab: 'INVESTIGATE', by: 7, t: 1 }]));
    check('تعطيل الشريف: لا حدث SHERIFF_RESULT', !evType(ev, 'SHERIFF_RESULT'));
    check('تعطيل الشريف: حدث ABILITY_DISABLED', !!evType(ev, 'ABILITY_DISABLED'));

    // تعطيل الطبيب → الاغتيال ينجح رغم حمايته (السلوك المتوقّع)
    s = mkState([P(4, Role.WITCH), P(8, Role.DOCTOR), P(1, Role.GODFATHER), P(7, Role.CITIZEN)]);
    ev = await resolveNightDynamic(s, night([{ ab: 'DISABLE_ABILITY', by: 4, t: 8 }, { ab: 'PROTECT', by: 8, t: 7 }, { ab: 'KILL', by: 1, t: 7 }]));
    check('تعطيل الطبيب: الاغتيال ينجح والهدف يموت', alive(s, 7) === false, `الهدف حي=${alive(s, 7)} — قد تكون مشكلة ترتيب: قاعدة KILL+PROTECT أُلغيت قبل تعطيل الطبيب`);
  }

  // ═══ السفّاح ═══
  section('6) اغتيال السفّاح');
  {
    // السفّاح يغتال (assassinState مفعّل، أول ليلة مرّت)
    const s = mkState([P(15, Role.ASSASSIN), P(7, Role.CITIZEN)], { assassinState: { firstNightPassed: true, completedCount: 0, totalRequired: 4, won: false, contracts: [] } });
    const ev = await resolveNightDynamic(s, night([{ ab: 'ASSASSINATE', by: 15, t: 7 }]));
    check('اغتيال السفّاح: حدث ASSASSIN_KILL', !!evType(ev, 'ASSASSIN_KILL'));
    check('اغتيال السفّاح: الهدف مات', alive(s, 7) === false);
  }

  // ═══ الأخوان (تكامل المحرك الديناميكي) ═══
  section('7) الأخوان عبر المحرك الديناميكي');
  {
    // قتل الأصغر ليلاً → انتحار الأكبر
    let s = mkState([P(1, Role.GODFATHER), P(5, Role.OLDER_BROTHER), P(13, Role.YOUNGER_BROTHER), P(7, Role.CITIZEN)], { twin: true });
    let ev = await resolveNightDynamic(s, night([{ ab: 'KILL', by: 1, t: 13 }]));
    check('قتل الأصغر: TWIN_SUICIDE', !!evType(ev, 'TWIN_SUICIDE'));
    check('قتل الأصغر: الأكبر انتحر', alive(s, 5) === false);

    // قتل الأكبر ليلاً (بقناص مثلاً) → تحوّل الأصغر
    s = mkState([P(9, Role.SNIPER), P(5, Role.OLDER_BROTHER), P(13, Role.YOUNGER_BROTHER), P(7, Role.CITIZEN)], { twin: true });
    ev = await resolveNightDynamic(s, night([{ ab: 'SNIPE', by: 9, t: 5 }]));
    check('قنص الأكبر: TWIN_TRANSFORM', !!evType(ev, 'TWIN_TRANSFORM'));
    check('قنص الأكبر: الأصغر تحوّل لمافيا', ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'].includes(s.players.find((p: any) => p.physicalId === 13).role));
  }

  // ═══ شروط الفوز ═══
  section('8) شروط الفوز (المحرك الديناميكي)');
  {
    // فوز المواطنين: كل المافيا ميتة
    let s = mkState([P(1, Role.GODFATHER, false), P(7, Role.CITIZEN), P(8, Role.DOCTOR)]);
    let w = await checkWinConditionDynamic(s);
    check('كل المافيا ميتة → فوز المواطنين', w.mainWinner === 'CITIZEN');

    // فوز المافيا: مافيا >= مواطنين
    s = mkState([P(1, Role.GODFATHER), P(6, Role.MAFIA_REGULAR), P(7, Role.CITIZEN)]);
    w = await checkWinConditionDynamic(s);
    check('مافيا 2 ضد مواطن 1 → فوز المافيا', w.mainWinner === 'MAFIA');

    // اللعبة مستمرة: مواطنون أكثر
    s = mkState([P(1, Role.GODFATHER), P(7, Role.CITIZEN), P(8, Role.DOCTOR), P(12, Role.CITIZEN)]);
    w = await checkWinConditionDynamic(s);
    check('مافيا 1 ضد مواطنين 3 → مستمرة', w.mainWinner === null);
  }

  // ═══ المهرج ═══
  section('9) المهرج (VOTED_OUT)');
  {
    // أُقصي بالتصويت بعد جولتين → فوز
    let s = mkState([P(14, Role.JESTER, false), P(7, Role.CITIZEN)], { round: 2 });
    let r = await checkNeutralVoteWin(s, 14, 'DAY_VOTE');
    check('مهرج أُقصي بالتصويت (جولة 2) → فوز', !!r && r.won === true);

    // أُقصي بالاتفاقية → فوز
    s = mkState([P(14, Role.JESTER, false), P(7, Role.CITIZEN)], { round: 2 });
    r = await checkNeutralVoteWin(s, 14, 'DEAL');
    check('مهرج أُقصي باتفاقية → فوز', !!r && r.won === true);

    // قُتل ليلاً → لا فوز
    s = mkState([P(14, Role.JESTER, false), P(7, Role.CITIZEN)], { round: 2 });
    r = await checkNeutralVoteWin(s, 14, 'ASSASSINATION');
    check('مهرج قُتل ليلاً → لا فوز', r === null);

    // أُقصي بالتصويت لكن قبل جولتين → لا فوز
    s = mkState([P(14, Role.JESTER, false), P(7, Role.CITIZEN)], { round: 1 });
    r = await checkNeutralVoteWin(s, 14, 'DAY_VOTE');
    check('مهرج أُقصي بالجولة 1 (قبل المدة) → لا فوز', r === null);
  }

  // ═══ السفّاح (فوز العقود) ═══
  section('10) السفّاح (COMPLETE_CONTRACTS)');
  {
    // أكمل العقود وهو حي → فوز السفّاح
    let s = mkState([P(15, Role.ASSASSIN), P(7, Role.CITIZEN), P(1, Role.GODFATHER)], { assassinState: { completedCount: 4, totalRequired: 4, won: true, firstNightPassed: true, contracts: [] } });
    let w = await checkWinConditionDynamic(s);
    check('السفّاح أكمل العقود → فوز السفّاح', w.mainWinner === 'ASSASSIN');

    // لم يكمل → لا فوز سفّاح (اللعبة بمنطق الفريقين)
    s = mkState([P(15, Role.ASSASSIN), P(1, Role.GODFATHER), P(7, Role.CITIZEN), P(8, Role.DOCTOR)], { assassinState: { completedCount: 1, totalRequired: 4, won: false, firstNightPassed: true, contracts: [] } });
    w = await checkWinConditionDynamic(s);
    check('السفّاح لم يكمل → ليس فوز سفّاح', w.mainWinner !== 'ASSASSIN');
  }

  // ═══ الشرطية ═══
  section('11) الشرطية (التفعيل عند الموت الليلي — كان مفقوداً في المحرك الديناميكي)');
  {
    // اغتيال الشرطية ليلاً → يجب أن تُفعّل حالتها
    let s = mkState([P(1, Role.GODFATHER), P(10, Role.POLICEWOMAN), P(7, Role.CITIZEN), P(12, Role.CITIZEN)]);
    await resolveNightDynamic(s, night([{ ab: 'KILL', by: 1, t: 10 }]));
    check('اغتيال الشرطية: ماتت', alive(s, 10) === false);
    check('اغتيال الشرطية: policewomanState مُفعّلة', s.policewomanState?.isTriggered === true);
    check('اغتيال الشرطية: سُجّل رقمها', s.policewomanState?.policewomanPhysicalId === 10);

    // اغتيال مواطن عادي → لا تُفعّل شرطية (لا توجد شرطية ميتة)
    s = mkState([P(1, Role.GODFATHER), P(7, Role.CITIZEN)]);
    await resolveNightDynamic(s, night([{ ab: 'KILL', by: 1, t: 7 }]));
    check('اغتيال مواطن: لا تفعيل شرطية', !s.policewomanState);
  }

  // ═══ القنص على محايد + تقاطع السفّاح مع المافيا ═══
  section('12) حالات إضافية (قنص محايد / سفّاح ومافيا نفس الهدف)');
  {
    // قنص المهرج (محايد) → SNIPE_MAFIA (قنص صائب)، القناص يعيش
    let s = mkState([P(9, Role.SNIPER), P(14, Role.JESTER)]);
    let ev = await resolveNightDynamic(s, night([{ ab: 'SNIPE', by: 9, t: 14 }]));
    check('قنص المهرج (محايد): SNIPE_MAFIA', !!evType(ev, 'SNIPE_MAFIA'));
    check('قنص المهرج: المهرج مات', alive(s, 14) === false);
    check('قنص المهرج: القناص حي (قنص صائب)', alive(s, 9) === true);

    // السفّاح والمافيا يستهدفان نفس اللاعب (مواطن بلا عقد مطابق) → الهدف يموت مرة،
    // وحدث السفّاح يُعرض بوضوح كهدف مشترك (لا عقد لأن الدور لا يطابق)
    s = mkState([P(1, Role.GODFATHER), P(15, Role.ASSASSIN), P(7, Role.CITIZEN)], { assassinState: { firstNightPassed: true, completedCount: 0, totalRequired: 4, won: false, contracts: [] } });
    ev = await resolveNightDynamic(s, night([{ ab: 'KILL', by: 1, t: 7 }, { ab: 'ASSASSINATE', by: 15, t: 7 }]));
    check('سفّاح+مافيا نفس الهدف: الهدف مات', alive(s, 7) === false);
    check('سفّاح+مافيا نفس الهدف: حدث ASSASSIN_KILL معروض للوضوح', !!evType(ev, 'ASSASSIN_KILL'));
    check('سفّاح+مافيا نفس الهدف: مُعلّم كهدف مشترك (المافيا)', evType(ev, 'ASSASSIN_KILL')?.extra?.alsoKilledByMafia === true);
    check('سفّاح+مافيا نفس الهدف (مواطن): لا عقد مطابق', evType(ev, 'ASSASSIN_KILL')?.extra?.contractCompleted === false);

    // ✅ أولوية السفّاح: لو كان الهدف المشترك دوراً ضمن العقد → يُحتسب العقد رغم اغتيال المافيا
    s = mkState([P(1, Role.GODFATHER), P(15, Role.ASSASSIN), P(8, Role.SILENCER)], { assassinState: { firstNightPassed: true, completedCount: 0, totalRequired: 1, won: false, contracts: [{ id: 1, type: 'KILL_ROLE', targetRole: 'SILENCER', completed: false }] } });
    ev = await resolveNightDynamic(s, night([{ ab: 'KILL', by: 1, t: 8 }, { ab: 'ASSASSINATE', by: 15, t: 8 }]));
    check('أولوية السفّاح: الهدف (المُسكِت) مات', alive(s, 8) === false);
    check('أولوية السفّاح: العقد أُنجز رغم اغتيال المافيا لنفس الهدف', evType(ev, 'ASSASSIN_KILL')?.extra?.contractCompleted === true);
    check('أولوية السفّاح: completedCount صار 1', s.assassinState?.completedCount === 1);
    check('أولوية السفّاح: السفّاح فاز (أنجز العقد الوحيد)', s.assassinState?.won === true);

    // ✅ أولوية السفّاح على القناص: نفس الهدف يُقنص ويُغتال → العقد يُحتسب للسفّاح
    s = mkState([P(9, Role.SNIPER), P(15, Role.ASSASSIN), P(8, Role.SILENCER)], { assassinState: { firstNightPassed: true, completedCount: 0, totalRequired: 1, won: false, contracts: [{ id: 1, type: 'KILL_ROLE', targetRole: 'SILENCER', completed: false }] } });
    ev = await resolveNightDynamic(s, night([{ ab: 'SNIPE', by: 9, t: 8 }, { ab: 'ASSASSINATE', by: 15, t: 8 }]));
    check('أولوية السفّاح/القناص: الهدف مات', alive(s, 8) === false);
    check('أولوية السفّاح/القناص: العقد أُنجز رغم القنص', evType(ev, 'ASSASSIN_KILL')?.extra?.contractCompleted === true);
    check('أولوية السفّاح/القناص: مُعلّم كهدف مشترك (قنص)', evType(ev, 'ASSASSIN_KILL')?.extra?.alsoSniped === true);
  }

  // ═══ النتيجة ═══
  console.log(`\n══════════════════════════════════════`);
  console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
  if (fail > 0) {
    console.log(`\n❌ الفشل (قد يكشف سلوكاً غير متوقع):`);
    failures.forEach(f => console.log(`   - ${f}`));
    process.exit(1);
  } else {
    console.log(`\n🎉 كل سيناريوهات المحرك تعمل بالشكل المتوقع.`);
    process.exit(0);
  }
}

main().catch(err => { console.error('❌ Test crashed:', err); process.exit(1); });
