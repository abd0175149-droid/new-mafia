// ══════════════════════════════════════════════════════
// 🧪 العنقاء — البعثُ والاحتراقُ ولعنةُ الرماد
//
// تشغيل: npx tsx src/scripts/test-phoenix.ts
// بلا قاعدة بيانات ولا Redis — تعاريفُ الإنتاج تُحقن في الكاش.
//
// يُختبَر جدولُ سلسلة الحرق صفّاً صفّاً، وجدولُ التقاطعات، والقراراتُ التسعة
// كما قفلها المالك — خاصّةً الرابع: **الاحتراقُ غيرُ مشروط والرصيدُ يحكم النجاةَ وحدها**.
// ══════════════════════════════════════════════════════

import { __primeDefsForTest } from '../game/definition-service.js';
import { resolveNightDynamic, actionKey } from '../game/dynamic-night-resolver.js';
import { initPhoenixState, ashCurseEligible, applyAshCurse } from '../game/phoenix-engine.js';
import { Role } from '../game/roles.js';
import { initTwinState } from '../game/twin-engine.js';
import { setGameState } from '../config/redis.js';
import { resolveNight } from '../game/night-resolver.js';

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
  { id: 'PHOENIX', team: 'CITIZEN', abilities: [], gen_priority: 6, gen_min_players: 10 },
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
  const s: any = {
    players, round: opts.round ?? 2,
    config: { witchDisableRounds: 3, useDynamicEngine: true, phoenixRebirths: opts.rebirths ?? 1 },
    performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] },
    witchPreviousTargets: [], twinState: null,
    assassinState: opts.assassinState ?? null,
    votingState: opts.votingState ?? { playerVotes: {}, candidates: [], deals: [], totalVotesCast: 0, hiddenPlayersFromVoting: [], tieBreakerLevel: 0 },
    dynamicNightState: { actions: {}, lastTargets: {} },
  };
  if (opts.twin) s.twinState = initTwinState(s);
  initPhoenixState(s);
  if (opts.disablePhoenix) {
    const ph = s.players.find((p: any) => p.role === Role.PHOENIX);
    if (ph) ph.disabledUntilRound = (s.round || 1) + 2;
  }
  return s;
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
const evType = (evs: any[], t: string) => evs.find(e => e.type === t);
const evAll = (evs: any[], t: string) => evs.filter(e => e.type === t);

// المقاعد الثابتة
const GF = 1, SIL = 2, CHA = 3, WIT = 4, REG = 5, OLD = 15;
const SHF = 6, DOC = 7, SNP = 8, POL = 9, CIT = 12, YNG = 16;
const PHX = 13, ASN = 10, JST = 11;

async function main() {
  console.log('🧪 العنقاء — البعثُ والاحتراقُ ولعنةُ الرماد\n');

  section('1) الحالةُ الأساسيّة — الشيخ يغتال العنقاء');
  {
    const s = mkState([P(GF, Role.GODFATHER), P(PHX, Role.PHOENIX), P(CIT, Role.CITIZEN)]);
    const ev = await resolveNightDynamic(s, bag([{ by: GF, ab: 'KILL', t: PHX }]) as any);
    check('العنقاء حيّ — نهض من رماده', alive(s, PHX) === true);
    check('الشيخ احترق', alive(s, GF) === false);
    check('حدث PHOENIX_BURN موجود', !!evType(ev, 'PHOENIX_BURN'));
    check('الحدث على الشيخ لا على العنقاء', evType(ev, 'PHOENIX_BURN')?.targetPhysicalId === GF);
    check('الرصيد نقص إلى صفر', s.phoenixState.rebirthsLeft === 0);
    // 🔴 مَن نجا لا يُعلَن مقتولاً: الموجّه يكشف الأحداثَ بيده، وحدثُ اغتيالٍ
    //    كاذبٌ على مقعدٍ يقف حيّاً يُفسد الملخّصَ والثقةَ به معاً.
    check('لا حدثَ اغتيالٍ كاذبٍ على العنقاء', !evType(ev, 'ASSASSINATION'));
    check('وحدثُ النهوض حلّ محلَّه', evType(ev, 'PHOENIX_REBIRTH')?.targetPhysicalId === PHX);
  }

  section('2) قرارُ المالك الرابع — الاحتراقُ غيرُ مشروط');
  {
    // 🔴 رصيدٌ صفر: يخرج العنقاء **ومَن اغتاله معاً**
    const s = mkState([P(GF, Role.GODFATHER), P(PHX, Role.PHOENIX), P(CIT, Role.CITIZEN)], { rebirths: 1 });
    s.phoenixState.rebirthsLeft = 0;
    const ev = await resolveNightDynamic(s, bag([{ by: GF, ab: 'KILL', t: PHX }]) as any);
    check('العنقاء خرج — لا رصيد', alive(s, PHX) === false);
    check('والشيخ احترق رغم ذلك', alive(s, GF) === false);
    check('حدثُ الاحتراق موجود', !!evType(ev, 'PHOENIX_BURN'));
    check('وحدثُ الاغتيال موجود أيضاً', !!evType(ev, 'ASSASSINATION'));
    check('ولا حدثَ نهوضٍ بلا رصيد', !evType(ev, 'PHOENIX_REBIRTH'));
  }

  section('3) الساحرةُ تُعطّله — لا بعثَ ولا احتراق');
  {
    const s = mkState([P(GF, Role.GODFATHER), P(WIT, Role.WITCH), P(PHX, Role.PHOENIX)], { disablePhoenix: true });
    const ev = await resolveNightDynamic(s, bag([{ by: GF, ab: 'KILL', t: PHX }]) as any);
    check('العنقاء مات قتلاً عاديّاً', alive(s, PHX) === false);
    check('الشيخ حيّ — لم يحترق', alive(s, GF) === true);
    check('لا حدثَ احتراق', !evType(ev, 'PHOENIX_BURN'));
    check('الرصيدُ لم يُمَسّ', s.phoenixState.rebirthsLeft === 1);
  }

  section('4) حمايةُ الطبيب — أجملُ خسارة');
  {
    const s = mkState([P(GF, Role.GODFATHER), P(DOC, Role.DOCTOR), P(PHX, Role.PHOENIX)]);
    const ev = await resolveNightDynamic(s, bag([
      { by: GF, ab: 'KILL', t: PHX }, { by: DOC, ab: 'PROTECT', t: PHX },
    ]) as any);
    check('الاغتيال أُبطل بالحماية', !!evType(ev, 'ASSASSINATION_BLOCKED'));
    // 🔴 حدثُ الحماية صادقٌ ولا يُحذف: لا نهوضَ أصلاً فلا شيءَ يحلّ محلَّه
    check('ولا حدثَ نهوض', !evType(ev, 'PHOENIX_REBIRTH'));
    check('العنقاء حيّ', alive(s, PHX) === true);
    check('الشيخ حيّ — لم يحترق', alive(s, GF) === true);
    check('ولا رصيدَ استُهلك', s.phoenixState.rebirthsLeft === 1);
  }

  section('5) القنّاص — يحترق وحده بلا ارتدادٍ مزدوج');
  {
    const s = mkState([P(GF, Role.GODFATHER), P(SNP, Role.SNIPER), P(PHX, Role.PHOENIX)]);
    const ev = await resolveNightDynamic(s, bag([{ by: SNP, ab: 'SNIPE', t: PHX }]) as any);
    check('العنقاء حيّ', alive(s, PHX) === true);
    check('القنّاص احترق', alive(s, SNP) === false);
    check('لا حدثَ SNIPE_CITIZEN', !evType(ev, 'SNIPE_CITIZEN'));
    check('ولا SNIPE_MAFIA', !evType(ev, 'SNIPE_MAFIA'));
    check('حدثُ الاحتراق وحده', evAll(ev, 'PHOENIX_BURN').length === 1);
    check('وحدثُ نهوضٍ واحد', evAll(ev, 'PHOENIX_REBIRTH').length === 1);
  }

  section('6) السفّاح — يحترق ولا يُحتسب عقدُه');
  {
    const s = mkState([P(GF, Role.GODFATHER), P(ASN, 'ASSASSIN'), P(PHX, Role.PHOENIX)], {
      assassinState: {
        assassinPhysicalId: ASN, contracts: [{ id: 1, type: 'KILL_ROLE', targetRole: 'PHOENIX', description: '', completed: false }],
        currentContractIndex: 0, completedCount: 0, totalRequired: 1, firstNightPassed: true, lastKillRound: null, won: false,
      },
    });
    const ev = await resolveNightDynamic(s, bag([{ by: ASN, ab: 'ASSASSINATE', t: PHX }]) as any);
    check('العنقاء حيّ', alive(s, PHX) === true);
    check('السفّاح احترق', alive(s, ASN) === false);
    check('العقدُ لم يكتمل', s.assassinState.completedCount === 0);
    check('ولم يفز', s.assassinState.won !== true);
  }

  section('7) ليلةُ الانهيار — ثلاثةٌ على الرأس نفسه');
  {
    const s = mkState([
      P(GF, Role.GODFATHER), P(SNP, Role.SNIPER), P(ASN, 'ASSASSIN'), P(PHX, Role.PHOENIX), P(CIT, Role.CITIZEN),
    ], {
      assassinState: { assassinPhysicalId: ASN, contracts: [], currentContractIndex: 0, completedCount: 0, totalRequired: 2, firstNightPassed: true, lastKillRound: null, won: false },
    });
    const ev = await resolveNightDynamic(s, bag([
      { by: GF, ab: 'KILL', t: PHX },
      { by: SNP, ab: 'SNIPE', t: PHX },
      { by: ASN, ab: 'ASSASSINATE', t: PHX },
    ]) as any);
    check('العنقاء واقف', alive(s, PHX) === true);
    check('الشيخ احترق', alive(s, GF) === false);
    check('القنّاص احترق', alive(s, SNP) === false);
    check('السفّاح احترق', alive(s, ASN) === false);
    check('ثلاثةُ أحداثِ احتراق', evAll(ev, 'PHOENIX_BURN').length === 3, String(evAll(ev, 'PHOENIX_BURN').length));
    check('ورصيدٌ واحدٌ استُهلك لا ثلاثة', s.phoenixState.rebirthsLeft === 0);
    check('ولا حدثَ إخراجٍ كاذبٍ من الثلاثة',
      !evType(ev, 'ASSASSINATION') && !evType(ev, 'ASSASSIN_KILL')
      && !evType(ev, 'SNIPE_CITIZEN') && !evType(ev, 'SNIPE_MAFIA'));
    check('وحدثُ نهوضٍ واحدٌ لا ثلاثة', evAll(ev, 'PHOENIX_REBIRTH').length === 1);
  }

  section('8) الأخُ الأكبر يحترق ⇒ الأصغر يتحوّل');
  {
    const s = mkState([
      P(GF, Role.GODFATHER, false), P(CHA, Role.CHAMELEON, false), P(REG, Role.MAFIA_REGULAR, false),
      P(OLD, Role.OLDER_BROTHER), P(YNG, Role.YOUNGER_BROTHER), P(PHX, Role.PHOENIX),
    ], { twin: true });
    const ev = await resolveNightDynamic(s, bag([{ by: OLD, ab: 'KILL', t: PHX }]) as any);
    check('العنقاء حيّ', alive(s, PHX) === true);
    check('الأخ الأكبر احترق', alive(s, OLD) === false);
    check('حدثُ تحوّل الأصغر', !!evType(ev, 'TWIN_TRANSFORM'));
    const y = s.players.find((p: any) => p.physicalId === YNG);
    check('الأصغر صار مافيا', y?.role !== Role.YOUNGER_BROTHER, `role=${y?.role}`);
  }

  section('9) الشريف يراه «مواطن» بلا استثناء');
  {
    const s = mkState([P(GF, Role.GODFATHER), P(SHF, Role.SHERIFF), P(PHX, Role.PHOENIX)]);
    const ev = await resolveNightDynamic(s, bag([{ by: SHF, ab: 'INVESTIGATE', t: PHX }]) as any);
    check('نتيجةُ التحقيق «مواطن»', evType(ev, 'SHERIFF_RESULT')?.extra?.team === 'CITIZEN');
  }

  section('10) الاحتراقُ يُحسب في عتبة الشرطيّة');
  {
    const s = mkState([P(GF, Role.GODFATHER), P(POL, Role.POLICEWOMAN), P(PHX, Role.PHOENIX), P(CIT, Role.CITIZEN)]);
    const ev = await resolveNightDynamic(s, bag([{ by: GF, ab: 'KILL', t: PHX }]) as any);
    check('الشيخ احترق', alive(s, GF) === false);
    check('الشرطيّة حيّة', alive(s, POL) === true);
    check('حدثُ الاحتراق ضمن الأحداث', !!evType(ev, 'PHOENIX_BURN'));
  }

  section('11) اغتيالُ غيرِ العنقاء — لا شيءَ يتغيّر');
  {
    const s = mkState([P(GF, Role.GODFATHER), P(PHX, Role.PHOENIX), P(CIT, Role.CITIZEN)]);
    const ev = await resolveNightDynamic(s, bag([{ by: GF, ab: 'KILL', t: CIT }]) as any);
    check('المواطن خرج', alive(s, CIT) === false);
    check('الشيخ حيّ', alive(s, GF) === true);
    check('لا احتراق', !evType(ev, 'PHOENIX_BURN'));
    check('الرصيدُ كامل', s.phoenixState.rebirthsLeft === 1);
  }

  section('12) رصيدان — ليلتان');
  {
    const s = mkState([P(GF, Role.GODFATHER), P(CHA, Role.CHAMELEON), P(PHX, Role.PHOENIX), P(CIT, Role.CITIZEN)], { rebirths: 2 });
    check('الرصيدُ الابتدائيّ اثنان', s.phoenixState.rebirthsLeft === 2);
    await resolveNightDynamic(s, bag([{ by: GF, ab: 'KILL', t: PHX }]) as any);
    check('الليلةُ الأولى: نجا والشيخ احترق', alive(s, PHX) === true && alive(s, GF) === false);
    check('بقي رصيدٌ واحد', s.phoenixState.rebirthsLeft === 1);
    s.dynamicNightState = { actions: {}, lastTargets: {} };
    await resolveNightDynamic(s, bag([{ by: CHA, ab: 'KILL', t: PHX }]) as any);
    check('الليلةُ الثانية: نجا والحرباية احترقت', alive(s, PHX) === true && alive(s, CHA) === false);
    check('نفد الرصيد', s.phoenixState.rebirthsLeft === 0);
  }

  section('13) لعنةُ الرماد — الأهليّة');
  {
    const s = mkState([P(GF, Role.GODFATHER), P(SIL, Role.SILENCER), P(PHX, Role.PHOENIX), P(CIT, Role.CITIZEN), P(SHF, Role.SHERIFF)], {
      // المرشّحُ رقم ٠ هو العنقاء: صوّت عليه المقعدان ١ و١٢، والمقعد ٢ صوّت على غيره
      votingState: { playerVotes: { [GF]: 0, [CIT]: 0, [SIL]: 1 }, candidates: [], deals: [], totalVotesCast: 3, hiddenPlayersFromVoting: [], tieBreakerLevel: 0 },
    });
    const elig = ashCurseEligible(s, 0);
    check('المؤهَّلون هم مَن صوّت عليه وحدهم', elig.join(',') === [GF, CIT].sort((a, b) => a - b).join(','), elig.join(','));
    check('مَن صوّت على غيره غيرُ مؤهَّل', !elig.includes(SIL));

    const bad = applyAshCurse(s, SIL, elig);
    check('اختيارُ غيرِ مؤهَّل يُرفض', bad === null);
    check('ولا يخرج أحد', alive(s, SIL) === true);

    const good = applyAshCurse(s, GF, elig);
    check('اختيارُ مؤهَّلٍ ينفذ', !!good && good.type === 'PHOENIX_ASH');
    check('والمقعدُ خرج', alive(s, GF) === false);
    check('الإعلانُ يحمل اسمين', (good?.extra?.pairNames as string[])?.length === 2);
  }

  section('14) لعنةُ الرماد — لا يختار نفسَه ولا ميّتاً');
  {
    const s = mkState([P(GF, Role.GODFATHER, false), P(PHX, Role.PHOENIX), P(CIT, Role.CITIZEN)], {
      votingState: { playerVotes: { [GF]: 0, [CIT]: 0, [PHX]: 0 }, candidates: [], deals: [], totalVotesCast: 3, hiddenPlayersFromVoting: [], tieBreakerLevel: 0 },
    });
    const elig = ashCurseEligible(s, 0);
    check('الميّتُ غيرُ مؤهَّل', !elig.includes(GF));
    check('والعنقاءُ نفسُه غيرُ مؤهَّل', !elig.includes(PHX));
    check('يبقى المواطنُ وحده', elig.join(',') === String(CIT));
  }
  // ══════════════════════════════════════════════════
  // المحرّك القديم (وضعُ الليل الآليّ) عبر الجسر
  // 🔴 وضعُ اللعب الأشيع يمرّ بـresolveNight لا بـresolveNightDynamic. اختبارُ
  //    أحدِهما وحدَه كان سيترك نصفَ الطاولات بلا عنقاء — وهو الانقسامُ نفسُه
  //    الذي أخفى فرقَ قائمةِ أهداف الساحرة زمناً.
  // ══════════════════════════════════════════════════
  const { getGameState } = await import('../config/redis.js');
  const EMPTY_NA = {
    godfatherTarget: null, silencerTarget: null, sheriffTarget: null,
    doctorTarget: null, sniperTarget: null, witchTarget: null,
    nurseTarget: null, assassinTarget: null,
    sheriffResult: null, lastProtectedTarget: null, randomSelections: {},
  };
  async function legacyRun(roomId: string, players: any[], na: any, opts: any = {}) {
    const s = mkState(players, opts);
    s.roomId = roomId;
    s.nightActions = { ...EMPTY_NA, ...na };
    await setGameState(roomId, s);
    const res: any = await resolveNight(roomId);
    const after: any = await getGameState(roomId);
    return { events: (res.events || []) as any[], state: after };
  }

  section('15) المحرّك القديم — الشيخ يغتال العنقاء');
  {
    const r = await legacyRun('phx-1',
      [P(GF, Role.GODFATHER), P(PHX, Role.PHOENIX), P(CIT, Role.CITIZEN)],
      { godfatherTarget: PHX });
    check('العنقاء حيّ', alive(r.state, PHX) === true);
    check('الشيخ احترق', alive(r.state, GF) === false);
    check('حدثُ الاحتراق', !!evType(r.events, 'PHOENIX_BURN'));
    check('لا حدثَ اغتيالٍ كاذب', !evType(r.events, 'ASSASSINATION'));
    check('وحدثُ النهوض مكانَه', !!evType(r.events, 'PHOENIX_REBIRTH'));
    check('ولا قيدَ إقصاءٍ باسمه',
      !r.state.performanceTracking.eliminationLog.some((x: any) => x.physicalId === PHX));
    check('الرصيد نفد', r.state.phoenixState.rebirthsLeft === 0);
  }

  section('16) المحرّك القديم — الحمايةُ تمنع كلَّ شيء');
  {
    const r = await legacyRun('phx-2',
      [P(GF, Role.GODFATHER), P(DOC, Role.DOCTOR), P(PHX, Role.PHOENIX)],
      { godfatherTarget: PHX, doctorTarget: PHX });
    check('العنقاء حيّ', alive(r.state, PHX) === true);
    check('الشيخ حيّ', alive(r.state, GF) === true);
    check('لا احتراق', !evType(r.events, 'PHOENIX_BURN'));
    check('لا استهلاكَ رصيد', r.state.phoenixState.rebirthsLeft === 1);
  }

  section('17) المحرّك القديم — القنّاص بلا ارتدادٍ مزدوج');
  {
    const r = await legacyRun('phx-3',
      [P(GF, Role.GODFATHER), P(SNP, Role.SNIPER), P(PHX, Role.PHOENIX)],
      { sniperTarget: PHX });
    check('العنقاء حيّ', alive(r.state, PHX) === true);
    check('القنّاص احترق', alive(r.state, SNP) === false);
    check('لا SNIPE_CITIZEN', !evType(r.events, 'SNIPE_CITIZEN'));
  }

  section('18) المحرّك القديم — ليلةُ الانهيار: الفاعلون أصحابُ النيّة');
  {
    // 🔴 القنصُ يُعالَج أوّلاً هنا فيقتل الهدف، ثمّ يُتخطّى الاغتيال لأنّ الهدفَ
    //    ميّت. لولا التقاطُ النيّات قبل المرحلة ١ لنجا الشيخُ من النار.
    const r = await legacyRun('phx-4',
      [P(GF, Role.GODFATHER), P(SNP, Role.SNIPER), P(ASN, 'ASSASSIN'), P(PHX, Role.PHOENIX), P(CIT, Role.CITIZEN)],
      { godfatherTarget: PHX, sniperTarget: PHX, assassinTarget: PHX },
      { assassinState: { assassinPhysicalId: ASN, contracts: [], currentContractIndex: 0, completedCount: 0, totalRequired: 2, firstNightPassed: true, lastKillRound: null, won: false } });
    check('العنقاء واقف', alive(r.state, PHX) === true);
    check('الشيخ احترق', alive(r.state, GF) === false);
    check('القنّاص احترق', alive(r.state, SNP) === false);
    check('السفّاح احترق', alive(r.state, ASN) === false);
    check('ثلاثةُ أحداثِ احتراق', evAll(r.events, 'PHOENIX_BURN').length === 3, String(evAll(r.events, 'PHOENIX_BURN').length));
    check('رصيدٌ واحدٌ استُهلك', r.state.phoenixState.rebirthsLeft === 0);
    check('ولا حدثَ اغتيالٍ للسفّاح', !evType(r.events, 'ASSASSIN_KILL'));
  }

  section('19) المحرّك القديم — التعطيلُ يُطفئ القاعدة');
  {
    const r = await legacyRun('phx-5',
      [P(GF, Role.GODFATHER), P(WIT, Role.WITCH), P(PHX, Role.PHOENIX)],
      { godfatherTarget: PHX }, { disablePhoenix: true });
    check('العنقاء خرج', alive(r.state, PHX) === false);
    check('الشيخ حيّ', alive(r.state, GF) === true);
    check('لا احتراق', !evType(r.events, 'PHOENIX_BURN'));
  }

  section('20) المحرّك القديم — لا رصيد: يخرج ومعه قاتلُه');
  {
    const s = mkState([P(GF, Role.GODFATHER), P(PHX, Role.PHOENIX), P(CIT, Role.CITIZEN)]);
    s.roomId = 'phx-6';
    s.phoenixState.rebirthsLeft = 0;
    s.nightActions = { ...EMPTY_NA, godfatherTarget: PHX };
    await setGameState('phx-6', s);
    const res: any = await resolveNight('phx-6');
    const after: any = await getGameState('phx-6');
    check('العنقاء خرج', alive(after, PHX) === false);
    check('والشيخ احترق معه', alive(after, GF) === false);
    check('حدثا اغتيالٍ واحتراق',
      !!evType(res.events, 'ASSASSINATION') && !!evType(res.events, 'PHOENIX_BURN'));
  }


  console.log('\n══════════════════════════════════════');
  console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
  if (fail) { console.log('\nالفاشلة:'); failures.forEach(f => console.log('  • ' + f)); process.exit(1); }
  console.log('\n🎉 العنقاء يعمل كما قُفلت قراراتُه.');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
