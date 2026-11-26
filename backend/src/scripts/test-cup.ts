// ══════════════════════════════════════════════════════
// 🧪 موسم النبوءة · المرحلة ٣ — قارئة الفنجان وقدر الغد
//
// تشغيل: npx tsx src/scripts/test-cup.ts
// بلا قاعدة بيانات ولا Redis — المحرّكان الحقيقيّان (الليل والتصويت).
//
// قرارات المالك: ١١ (قدر الغد يُفتح صباحاً ويُعدم صاحبه أوّل النهار) · ١٢ (العتبة) · ٢٧ (المكشوف) ·
// ٢٨ (أرقامُ الصدق) · ٢٩ (مع المهرّج) · ب٣ (تختم في الليلة التالية).
// ══════════════════════════════════════════════════════

import { primeTestDefs } from './_game-fixtures.js';
import { __primeDefsForTest, getAbilityDefs, getRoleDefs } from '../game/definition-service.js';
import { setGameState, getGameState } from '../config/redis.js';
import { resolveNightDynamic, createDynamicNightState, actionKey, getAvailableTargets } from '../game/dynamic-night-resolver.js';
import { buildNightPlan } from '../game/night-plan.js';
import { resolveVoting } from '../game/vote-engine.js';
import { initCupState, requestPublicCup, requestSeal, cupWonSeat, defaultCupThreshold } from '../game/cup-engine.js';
import { initTwinState } from '../game/twin-engine.js';
import { didPlayerWin } from '../game/win-attribution.js';
import { computeMatchReward } from '../services/progression.service.js';
import { projectStateFor, stripSecrets } from '../sockets/broadcast.util.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const section = (t: string) => console.log(`\n━━━ ${t} ━━━`);
function P(seat: number, role: string, alive = true): any {
  return { physicalId: seat, name: role + '#' + seat, phone: null, playerId: seat + 1000, role, isAlive: alive, isSilenced: false, justificationCount: 0 };
}
// ١ الشيخ · ٢ مافيا · ٣ مافيا · ٤ القارئة · ٥ الطبيب · ٦ الشريف · ٧..١٤ مواطنون · ١٥ المهرّج · ١٦ القنّاص
const table = () => [P(1, 'GODFATHER'), P(2, 'MAFIA_REGULAR'), P(3, 'MAFIA_REGULAR'), P(4, 'CUP_READER'), P(5, 'DOCTOR'), P(6, 'SHERIFF'),
  ...[7, 8, 9, 10, 11, 12, 13, 14].map((s) => P(s, 'CITIZEN')), P(15, 'JESTER'), P(16, 'SNIPER')];
function mk(opts: any = {}): any {
  const s: any = {
    roomId: opts.roomId || 'c1', players: opts.players || table(), round: opts.round ?? 2, phase: opts.phase || 'NIGHT',
    config: { bombEnabled: opts.bomb ?? false, jesterSurviveRounds: 1, useDynamicEngine: true, witchDisableRounds: 3, ...(opts.config || {}) },
    performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] },
    votingState: { candidates: [], deals: [], totalVotesCast: 0, hiddenPlayersFromVoting: [], tieBreakerLevel: 0, playerVotes: {} },
    twinState: null, witchPreviousTargets: [], assassinState: null, assassinRivals: null, nurseActivated: false, winner: null,
    dynamicNightState: { actions: {}, lastTargets: {} },
  };
  if (opts.twins) s.twinState = initTwinState(s);
  s.cupState = initCupState(s);
  return s;
}
function bag(list: Array<{ by: number; ab: string; t: number | null }>) {
  const n = createDynamicNightState();
  for (const a of list) { const action = { abilityId: a.ab, performerPhysicalId: a.by, targetPhysicalId: a.t, skipped: a.t == null }; n.actions[actionKey(action)] = action; }
  return n;
}
const pc = (t: number, v: number) => ({ type: 'PLAYER', targetPhysicalId: t, votes: v });
const has = (ev: any[], t: string) => ev.some((e) => e.type === t);
const alive = (s: any, id: number) => s.players.find((p: any) => p.physicalId === id)?.isAlive;
async function execute(s: any, seat: number, roomId: string) {
  s.phase = 'DAY_VOTING';
  s.votingState.candidates = [pc(seat, 9), pc(7 === seat ? 8 : 7, 1)];
  await setGameState(roomId, s);
  const r: any = await resolveVoting(roomId);
  return { r, st: await getGameState(roomId) as any };
}

(async () => {
  primeTestDefs();
  const abilities = await getAbilityDefs();
  const roles = await getRoleDefs();
  __primeDefsForTest({
    abilities: [...abilities, { id: 'READ_CUP', nameAr: 'قراءة الفنجان', phase: 'NIGHT', priority: 7, targetType: 'ANY', excludeSelf: true, excludeLastTarget: true, maxTargets: 1, effectType: 'PASSIVE' } as any],
    roles: [...roles, { id: 'CUP_READER', team: 'NEUTRAL', abilities: ['READ_CUP'], genPriority: 90, nameAr: 'قارئة الفنجان' } as any],
  });

  section('العتبة');
  check('٢ تحت ٢٤ و٣ من ٢٤', defaultCupThreshold(16) === 2 && defaultCupThreshold(23) === 2 && defaultCupThreshold(24) === 3);
  check('طاولة ١٦ ⇒ ٢', mk().cupState.threshold === 2);
  check('يدويّاً من الموجّه ⇒ ٣', mk({ config: { cupThreshold: 3 } }).cupState.threshold === 3);

  section('القراءة ليلاً');
  {
    const s = mk();
    const plan = await buildNightPlan(s);
    check('للقارئة خطوة قراءةٍ من الليلة الأولى', plan.some((x) => x.seat === 4 && x.abilityId === 'READ_CUP'));
    const night1 = bag([{ by: 4, ab: 'READ_CUP', t: 7 }]);
    const ev = await resolveNightDynamic(s, night1);
    check('تُسجَّل القراءة للموجّه', has(ev, 'CUP_READ') && s.cupState.reads.length === 1 && s.cupState.reads[0].targetPhysicalId === 7);
    check('بلا كشفٍ لا حدث علنيّ', !has(ev, 'CUP_PUBLIC'));
    s.round = 3;
    // الليلة التالية ترث آخر الأهداف من حالة الليل نفسها (كما في الإنتاج)
    const t = (await getAvailableTargets(s, 'READ_CUP', 4, createDynamicNightState(night1))).map((p: any) => p.physicalId);
    check('لا الهدفَ نفسه ليلتين ولا نفسها', !t.includes(7) && !t.includes(4) && t.includes(8), t.join(','));
  }

  section('الفنجان المكشوف');
  {
    const s = mk();
    check('نهاراً مرفوض', requestPublicCup({ ...s, phase: 'DAY_DISCUSSION' }, 4, true).ok === false);
    check('ليلاً مقبول', requestPublicCup(s, 4, true).ok === true);
    const ev = await resolveNightDynamic(s, bag([{ by: 4, ab: 'READ_CUP', t: 9 }]));
    const pub = ev.find((e: any) => e.type === 'CUP_PUBLIC');
    check('يظهر صباحاً برقم الهدف', !!pub && pub.targetPhysicalId === 9 && pub.performerPhysicalId === undefined);
    check('مرّةً في اللعبة', s.cupState.publicUsed === true && requestPublicCup(s, 4, true).ok === false);
  }

  section('الصدق والرحيل');
  {
    const s = mk({ roomId: 'cv1' });
    await resolveNightDynamic(s, bag([{ by: 4, ab: 'READ_CUP', t: 7 }]));
    let { r, st } = await execute(s, 7, 'cv1');
    check('أُعدم ٧ ⇒ صدقت (١ من ٢)', r.cup?.hit === true && r.cup.count === 1 && r.cup.threshold === 2 && r.cup.departed === false, JSON.stringify(r.cup));
    check('القارئة باقية', alive(st, 4) === true);
    st.round = 3; st.phase = 'NIGHT';
    await resolveNightDynamic(st, bag([{ by: 4, ab: 'READ_CUP', t: 8 }]));
    ({ r, st } = await execute(st, 8, 'cv1'));
    check('أُعدم ٨ ⇒ بلغت العتبة ورحلت', r.cup?.departed === true && alive(st, 4) === false, JSON.stringify(r.cup));
    check('يُقلب كرتُها مع المُعدَم', r.eliminated.includes(4) && r.revealedRoles.some((x: any) => x.physicalId === 4));
    check('أرقامُ صدقها', JSON.stringify(r.cup.hits) === JSON.stringify([7, 8]));
    check('فوزُها مختوم بالمقعد', cupWonSeat(st, 4) === true);
    st.winner = 'CITIZEN';
    check('تفوز ولو فاز المواطنون', didPlayerWin(st, { physicalId: 4, role: 'CUP_READER' }, null) === true);
    const rw = computeMatchReward({ role: 'CUP_READER', winner: 'CITIZEN', survivedToEnd: false, roundsSurvived: 2, successfulDealsCount: 0, failedDealsCount: 0, mafiaDealOnMafiaCount: 0, abilityCorrectCount: 0, abilityIncorrectCount: 0, teamEliminationBonus: 0, assassinContractsCompleted: 0, neutralWon: true } as any);
    check('ومكافأتُها مكافأةُ فوز', rw.won === true && rw.rrChange > 0);
  }
  {
    const s = mk(); s.winner = 'CITIZEN';
    check('لم ترحل ⇒ لا تفوز بفوز المواطنين', didPlayerWin(s, { physicalId: 4, role: 'CUP_READER' }, null) === false);
    const rw = computeMatchReward({ role: 'CUP_READER', winner: 'CITIZEN', survivedToEnd: true, roundsSurvived: 3, successfulDealsCount: 0, failedDealsCount: 0, mafiaDealOnMafiaCount: 0, abilityCorrectCount: 0, abilityIncorrectCount: 0, teamEliminationBonus: 0, assassinContractsCompleted: 0, neutralWon: false } as any);
    check('ومكافأتُها خسارة', rw.won === false);
  }

  section('ما لا يُحسب');
  {
    // قرأت ٧ ومات ليلاً بالاغتيال — لا يُحسب
    const s = mk({ roomId: 'cv2' });
    await resolveNightDynamic(s, bag([{ by: 4, ab: 'READ_CUP', t: 7 }, { by: 1, ab: 'KILL', t: 7 }]));
    check('موتٌ ليليّ لا يُحسب', s.cupState.hits.length === 0 && alive(s, 7) === false);
    // صاحبُ صفقةٍ مرتدّة لا يُحسب
    const s2 = mk({ roomId: 'cv3' });
    await resolveNightDynamic(s2, bag([{ by: 4, ab: 'READ_CUP', t: 7 }]));
    s2.phase = 'DAY_VOTING';
    s2.votingState.deals = [{ id: 'd', initiatorPhysicalId: 7, targetPhysicalId: 8 }];
    s2.votingState.candidates = [{ type: 'DEAL', id: 'd', initiatorPhysicalId: 7, targetPhysicalId: 8, votes: 9 }, pc(9, 1)];
    await setGameState('cv3', s2);
    const r: any = await resolveVoting('cv3');
    const st: any = await getGameState('cv3');
    check('صاحب الصفقة المرتدّة (٧) لا يُحسب', alive(st, 7) === false && !r.cup && st.cupState.hits.length === 0, JSON.stringify(r.cup));
  }
  {
    // هدفُ صفقةٍ مرّت يُحسب
    const s = mk({ roomId: 'cv4' });
    await resolveNightDynamic(s, bag([{ by: 4, ab: 'READ_CUP', t: 2 }]));
    s.phase = 'DAY_VOTING';
    s.votingState.deals = [{ id: 'd', initiatorPhysicalId: 7, targetPhysicalId: 2 }];
    s.votingState.candidates = [{ type: 'DEAL', id: 'd', initiatorPhysicalId: 7, targetPhysicalId: 2, votes: 9 }, pc(9, 1)];
    await setGameState('cv4', s);
    const r: any = await resolveVoting('cv4');
    check('هدفُ الصفقة يُحسب', r.cup?.hit === true && r.cup.count === 1);
  }

  section('مع المهرّج (قرار ٢٩)');
  {
    const s = mk({ roomId: 'cv5', config: { cupThreshold: 1 } });
    await resolveNightDynamic(s, bag([{ by: 4, ab: 'READ_CUP', t: 15 }]));
    const { r, st } = await execute(s, 15, 'cv5');
    check('المهرّج فاز', r.neutralWin?.won === true || st.winner === 'JESTER', JSON.stringify(r.neutralWin));
    check('وبلغت به عتبتها ⇒ رحلت فائزةً معه', st.cupState.departed === true && cupWonSeat(st, 4) === true);
  }

  section('قدر الغد');
  {
    const s = mk({ roomId: 'cv6', config: { cupThreshold: 1 } });
    await resolveNightDynamic(s, bag([{ by: 4, ab: 'READ_CUP', t: 7 }]));
    let { st } = await execute(s, 7, 'cv6');
    check('رحلت بعد قراءةٍ واحدة (العتبة ١)', st.cupState.departed === true);
    st.phase = 'NIGHT';
    check('الختمُ ليس في ليلة الرحيل نفسها', requestSeal(st, 4, 9).ok === false);
    st.round = 3;
    check('بل في الليلة التالية', requestSeal(st, 4, 9).ok === true && st.cupState.sealPhysicalId === 9);
    const ev = await resolveNightDynamic(st, bag([{ by: 5, ab: 'PROTECT', t: 9 }]));
    check('يُنفَّذ: مات ٩ رغم حماية الطبيب', alive(st, 9) === false && has(ev, 'CUP_SEAL'));
    check('لا ختمٌ ثانٍ', requestSeal(st, 4, 10).ok === false && st.cupState.sealOutcome === 'EXECUTED');
  }
  {
    const s = mk({ config: { cupThreshold: 1 }, roomId: 'cv7' });
    await resolveNightDynamic(s, bag([{ by: 4, ab: 'READ_CUP', t: 7 }]));
    let { st } = await execute(s, 7, 'cv7');
    st.phase = 'NIGHT'; st.round = 3;
    requestSeal(st, 4, 10);
    const ev = await resolveNightDynamic(st, bag([{ by: 1, ab: 'KILL', t: 10 }]));
    check('قُتل المختوم ليلاً ⇒ احترق الختم', st.cupState.sealOutcome === 'BURNED' && has(ev, 'CUP_SEAL_BURNED') && !has(ev, 'CUP_SEAL'));
  }
  {
    // الأخوان: ختمُ الأصغر ⇒ ينتحر الأكبر
    const pl = table(); pl[1] = P(2, 'OLDER_BROTHER'); pl[7] = P(8, 'YOUNGER_BROTHER');
    const s = mk({ players: pl, twins: true, config: { cupThreshold: 1 }, roomId: 'cv8' });
    await resolveNightDynamic(s, bag([{ by: 4, ab: 'READ_CUP', t: 7 }]));
    let { st } = await execute(s, 7, 'cv8');
    st.phase = 'NIGHT'; st.round = 3;
    requestSeal(st, 4, 8);
    const ev = await resolveNightDynamic(st, bag([]));
    check('ختمُ الأصغر ⇒ انتحر الأكبر', alive(st, 8) === false && alive(st, 2) === false && has(ev, 'TWIN_SUICIDE'), JSON.stringify(ev.map((e: any) => e.type)));
  }

  section('السرّيّة');
  {
    const s = mk();
    requestPublicCup(s, 4, true);
    s.phase = 'DAY_DISCUSSION';
    for (const seat of [4, 7]) {
      const v = projectStateFor(s, seat);
      check(`هاتف ${seat} لا يرى حالة الفنجان`, v.cupState === undefined);
    }
    check('المتفرّجون لا يرونها', stripSecrets(s).cupState === undefined);
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} نجح · ${fail} فشل`);
  if (fail) { console.log(failures.map((f) => '   • ' + f).join('\n')); process.exit(1); }
  process.exit(0);
})();
