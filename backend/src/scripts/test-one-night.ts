// ══════════════════════════════════════════════════════
// 🧪 الليلةُ الواحدة — الخطّة والمفتاحُ المركّب والتكافؤ
//
// تشغيل: npx tsx src/scripts/test-one-night.ts
// بلا قاعدة بيانات ولا Redis — تعاريفُ الإنتاج تُحقن في الكاش.
//
// أهمُّ ما يُختبَر: **التكافؤ**. إعادةُ الهيكلة تمسّ الجمع لا الحساب، فالبرهانُ
// أنّ الاختياراتِ نفسَها تُنتج الأحداثَ نفسَها مهما اختلف ترتيبُ إدخالها.
// ══════════════════════════════════════════════════════

import { __primeDefsForTest } from '../game/definition-service.js';
import { resolveNightDynamic, actionKey } from '../game/dynamic-night-resolver.js';
import { buildNightPlan, killHolderSeat, slotsOfSeat, idleSeats, slotKey } from '../game/night-plan.js';
import { Role } from '../game/roles.js';

const ABILITIES_RAW = [
  { id: 'KILL', name_ar: 'اغتيال', phase: 'NIGHT', priority: 1, target_type: 'ENEMY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'ELIMINATE', effect_on_success: 'ASSASSINATION', effect_on_fail: null, is_inheritable: true, inheritance_order: ['GODFATHER','CHAMELEON','MAFIA_REGULAR','OLDER_BROTHER','SILENCER','WITCH'] },
  { id: 'SILENCE', name_ar: 'إسكات', phase: 'NIGHT', priority: 2, target_type: 'ANY', exclude_self: false, exclude_last_target: false, max_targets: 1, effect_type: 'SILENCE', effect_on_success: 'SILENCED', effect_on_fail: null },
  { id: 'DISABLE_ABILITY', name_ar: 'تعطيل', phase: 'NIGHT', priority: 2, target_type: 'ENEMY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'DISABLE', effect_on_success: null, effect_on_fail: null },
  { id: 'INVESTIGATE', name_ar: 'تحقيق', phase: 'NIGHT', priority: 3, target_type: 'ANY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'REVEAL_TEAM', effect_on_success: 'SHERIFF_RESULT', effect_on_fail: null },
  { id: 'PROTECT', name_ar: 'حماية', phase: 'NIGHT', priority: 4, target_type: 'ANY', exclude_self: true, exclude_last_target: true, max_targets: 1, effect_type: 'BLOCK_ELIMINATE', effect_on_success: 'ASSASSINATION_BLOCKED', effect_on_fail: 'PROTECTION_FAILED' },
  { id: 'SNIPE', name_ar: 'قنص', phase: 'NIGHT', priority: 5, target_type: 'ANY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'CONDITIONAL_ELIMINATE', effect_on_success: 'SNIPE_MAFIA', effect_on_fail: 'SNIPE_CITIZEN' },
  { id: 'ASSASSINATE', name_ar: 'اغتيال السفّاح', phase: 'NIGHT', priority: 6, target_type: 'ANY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'ELIMINATE', effect_on_success: 'ASSASSIN_KILL', effect_on_fail: null },
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
const section = (t: string) => console.log(`\n━━━ ${t} ━━━`);

function P(seat: number, role: Role | string, alive = true): any {
  return { physicalId: seat, name: role + '#' + seat, phone: null, playerId: seat + 1000, role, isAlive: alive, isSilenced: false, justificationCount: 0 };
}
function mkState(players: any[], opts: any = {}): any {
  return {
    players, round: opts.round ?? 2,
    config: { witchDisableRounds: 3, useDynamicEngine: true },
    performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] },
    witchPreviousTargets: [], twinState: null,
    assassinState: opts.assassinState ?? null,
    nurseActivated: opts.nurseActivated ?? false,
    dynamicNightState: { actions: {}, lastTargets: {} },
  };
}
/** يبني حقيبةَ الإجراءات من (مقعد، قدرة، هدف) بمفاتيحَ مركّبة — كما يفعل night:one-apply. */
function bag(list: Array<{ by: number; ab: string; t: number | null }>) {
  const actions: any = {};
  for (const a of list) {
    const action = { abilityId: a.ab, performerPhysicalId: a.by, targetPhysicalId: a.t, skipped: a.t == null };
    actions[actionKey(action)] = action;
  }
  return { actions, lastTargets: {} };
}
const alive = (s: any, id: number) => s.players.find((p: any) => p.physicalId === id)?.isAlive;
const evType = (evs: any[], t: string) => evs.find(e => e.type === t);
const sig = (evs: any[]) => evs.map(e => `${e.type}@${e.targetPhysicalId}`).sort().join('|');

async function main() {
  console.log('🧪 الليلةُ الواحدة\n');

  section('1) الخطّة — الاغتيالُ لحاملٍ واحد');
  {
    // الشيخُ والأخُ الأكبر كلاهما يحمل KILL في تعريف دوره
    const s = mkState([P(1, Role.GODFATHER), P(5, Role.OLDER_BROTHER), P(6, Role.SHERIFF)]);
    const plan = await buildNightPlan(s);
    const kills = plan.filter(x => x.abilityId === 'KILL');
    check('اغتيالٌ واحدٌ في الخطّة لا اثنان', kills.length === 1, `عدد=${kills.length}`);
    check('حاملُه هو الشيخ', kills[0]?.seat === 1);
    check('الأخُ الأكبر بلا فعلٍ الليلة', slotsOfSeat(plan, 5).length === 0);
    check('الشريفُ له تحقيق', slotsOfSeat(plan, 6).some(x => x.abilityId === 'INVESTIGATE'));
  }

  section('2) ترتيبُ العرض — الاغتيالُ أوّلاً دائماً');
  {
    const s = mkState([P(1, Role.GODFATHER), P(2, Role.SILENCER), P(6, Role.SHERIFF), P(7, Role.DOCTOR), P(8, Role.SNIPER)]);
    const plan = await buildNightPlan(s);
    check('أوّلُ الخطّة اغتيال', plan[0]?.abilityId === 'KILL');
    const prios = plan.slice(1).map(x => x.priority);
    check('البقيّةُ بترتيبٍ صاعدٍ بالأولويّة', prios.every((v, i) => i === 0 || prios[i - 1] <= v), prios.join(','));
  }

  section('3) لاعبٌ بقدرتين — القصُّ يرث الاغتيال');
  {
    // الشيخُ والحرباية والمافيا العاديّ والأخُ الأكبر خارج اللعبة ⇒ القصُّ هو الحامل
    const s = mkState([P(1, Role.GODFATHER, false), P(2, Role.SILENCER), P(4, Role.WITCH), P(6, Role.SHERIFF), P(7, Role.DOCTOR)]);
    check('حاملُ الاغتيال هو القصّ', killHolderSeat(s) === 2);
    const plan = await buildNightPlan(s);
    const mine = slotsOfSeat(plan, 2);
    check('للقصّ فعلان', mine.length === 2, `عدد=${mine.length}`);
    check('الأوّلُ الاغتيال', mine[0]?.abilityId === 'KILL');
    check('والثاني قدرتُه هو (الإسكات)', mine[1]?.abilityId === 'SILENCE');
    check('الساحرةُ لها فعلٌ واحد', slotsOfSeat(plan, 4).length === 1);
  }

  section('4) الفعلان يُحسبان معاً');
  {
    const s = mkState([P(1, Role.GODFATHER, false), P(2, Role.SILENCER), P(6, Role.SHERIFF), P(7, Role.DOCTOR)]);
    const ev = await resolveNightDynamic(s, bag([
      { by: 2, ab: 'KILL', t: 6 },
      { by: 2, ab: 'SILENCE', t: 7 },
    ]) as any);
    check('الاغتيالُ نُفّذ', alive(s, 6) === false);
    check('والإسكاتُ نُفّذ', !!evType(ev, 'SILENCED'));
    check('الإسكاتُ على الهدف الصحيح', evType(ev, 'SILENCED')?.targetPhysicalId === 7);
  }

  section('5) المفتاحُ المركّب — لاعبان بالقدرة نفسها');
  {
    // 🔴 بمعرّف القدرة وحده كان الثاني يمحو الأوّل بصمت
    const s = mkState([P(1, Role.GODFATHER), P(7, Role.DOCTOR), P(11, Role.NURSE), P(12, Role.CITIZEN), P(6, Role.SHERIFF)], { nurseActivated: true });
    const ev = await resolveNightDynamic(s, bag([
      { by: 1, ab: 'KILL', t: 12 },
      { by: 7, ab: 'PROTECT', t: 12 },   // الطبيبُ يحمي الهدف
      { by: 11, ab: 'PROTECT', t: 6 },   // والممرّضةُ تحمي غيرَه
    ]) as any);
    check('الحمايتان محفوظتان — لم تمحُ إحداهما الأخرى', !!evType(ev, 'ASSASSINATION_BLOCKED'));
    check('الهدفُ المحميّ نجا', alive(s, 12) === true);
  }

  section('6) التكافؤ — ترتيبُ الإدخال لا يغيّر النتيجة');
  {
    const mk = () => mkState([
      P(1, Role.GODFATHER), P(2, Role.SILENCER), P(4, Role.WITCH),
      P(6, Role.SHERIFF), P(7, Role.DOCTOR), P(8, Role.SNIPER), P(12, Role.CITIZEN),
    ]);
    const picks = [
      { by: 1, ab: 'KILL', t: 6 },
      { by: 2, ab: 'SILENCE', t: 12 },
      { by: 4, ab: 'DISABLE_ABILITY', t: 7 },
      { by: 6, ab: 'INVESTIGATE', t: 1 },
      { by: 7, ab: 'PROTECT', t: 6 },
      { by: 8, ab: 'SNIPE', t: 1 },
    ];
    const sA = mk(); const evA = await resolveNightDynamic(sA, bag(picks) as any);
    const sB = mk(); const evB = await resolveNightDynamic(sB, bag([...picks].reverse()) as any);
    check('نفسُ الأحداث بترتيبَي إدخالٍ متعاكسين', sig(evA) === sig(evB), `${sig(evA)}  ≠  ${sig(evB)}`);
    const deadA = sA.players.filter((p: any) => !p.isAlive).map((p: any) => p.physicalId).sort().join(',');
    const deadB = sB.players.filter((p: any) => !p.isAlive).map((p: any) => p.physicalId).sort().join(',');
    check('ونفسُ الوفيات', deadA === deadB, `${deadA} ≠ ${deadB}`);

    // ترتيبٌ عشوائيٌّ خمس مرّات — النتيجةُ ثابتة
    let same = true;
    for (let i = 0; i < 5; i++) {
      const sh = [...picks].sort(() => Math.random() - 0.5);
      const sC = mk(); const evC = await resolveNightDynamic(sC, bag(sh) as any);
      if (sig(evC) !== sig(evA)) same = false;
    }
    check('وخمسُ خلطاتٍ عشوائيّة تُنتج النتيجةَ نفسَها', same);
  }

  section('7) مَن لا فعلَ له');
  {
    const s = mkState([P(1, Role.GODFATHER), P(3, Role.CHAMELEON), P(9, Role.POLICEWOMAN), P(10, Role.MAYOR), P(12, Role.CITIZEN)]);
    const plan = await buildNightPlan(s);
    const idle = idleSeats(s, plan);
    check('الحرباية والشرطيّة والعمدة والمواطن بلا فعل', idle.sort((a, b) => a - b).join(',') === '3,9,10,12', idle.join(','));
    check('الشيخُ وحده فاعل', plan.length === 1 && plan[0].seat === 1);
  }

  section('8) الممرّضة والسفّاح — شرطُ التفعيل');
  {
    let s = mkState([P(1, Role.GODFATHER), P(11, Role.NURSE)]);
    let plan = await buildNightPlan(s);
    check('الممرّضةُ بلا فعلٍ قبل التفعيل', slotsOfSeat(plan, 11).length === 0);

    s = mkState([P(1, Role.GODFATHER), P(11, Role.NURSE)], { nurseActivated: true });
    plan = await buildNightPlan(s);
    check('وبعد التفعيل لها حماية', slotsOfSeat(plan, 11)[0]?.abilityId === 'PROTECT');

    s = mkState([P(1, Role.GODFATHER), P(10, 'ASSASSIN')], { assassinState: { assassinPhysicalId: 10, contracts: [], won: false, firstNightPassed: false } });
    plan = await buildNightPlan(s);
    check('السفّاحُ بلا فعلٍ في الليلة الأولى', slotsOfSeat(plan, 10).length === 0);

    s = mkState([P(1, Role.GODFATHER), P(10, 'ASSASSIN')], { assassinState: { assassinPhysicalId: 10, contracts: [], won: false, firstNightPassed: true } });
    plan = await buildNightPlan(s);
    check('وبعدها له اغتيال', slotsOfSeat(plan, 10)[0]?.abilityId === 'ASSASSINATE');
  }

  section('9) القنصُ لا يُملأ عشوائيّاً');
  {
    const s = mkState([P(1, Role.GODFATHER), P(8, Role.SNIPER), P(12, Role.CITIZEN)]);
    const plan = await buildNightPlan(s);
    const snipe = plan.find(x => x.abilityId === 'SNIPE');
    check('القنصُ مُعلَّمٌ noRandom', snipe?.noRandom === true);
    check('والاغتيالُ غيرُ مُعلَّم', plan.find(x => x.abilityId === 'KILL')?.noRandom === false);
  }

  section('10) مفتاحُ الخانة');
  {
    check('مركّبٌ لا معرّفَ قدرةٍ وحده', slotKey(4, 'KILL') === '4:KILL');
    check('ومفتاحُ الإجراء يطابقه', actionKey({ performerPhysicalId: 4, abilityId: 'KILL' }) === '4:KILL');
  }

  console.log('\n══════════════════════════════════════');
  console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
  if (fail) { console.log('\nالفاشلة:'); failures.forEach(f => console.log('  • ' + f)); process.exit(1); }
  console.log('\n🎉 الليلةُ الواحدة تجمع كما وُصف، وتحسب كما كانت.');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
