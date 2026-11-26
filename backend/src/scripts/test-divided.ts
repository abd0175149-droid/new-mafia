// ══════════════════════════════════════════════════════
// 🧪 موسم النبوءة · المرحلة ٤ — المنقسم
//
// تشغيل: npx tsx src/scripts/test-divided.ts
// بلا قاعدة بيانات ولا Redis — محرّك الليل الحقيقيّ.
//
// قرارات المالك: ٣٥ (من ١٨) · ٣٧ (الشاشة تعلن الجانب بلا رقمه) · ٣٨ (مكافأة متساوية) ·
// ب٤ (يشارك في اغتيال الليلة نفسها). وخطّة البناء: العبور على مسار الأخ الأصغر، آخر السلسلة.
// ══════════════════════════════════════════════════════

import { primeTestDefs } from './_game-fixtures.js';
import { __primeDefsForTest, getAbilityDefs, getRoleDefs } from '../game/definition-service.js';
import { resolveNightDynamic, createDynamicNightState, actionKey } from '../game/dynamic-night-resolver.js';
import { buildNightPlan, killHolderSeat } from '../game/night-plan.js';
import {
  initDividedState, canChooseSide, chooseSide, settleDividedAtNightEnd, markDividedAnnounced,
  dividedNoticeFor, crossedDividedSeat, undecidedDividedSeat, DIVIDED_CHOICE_ROUND,
} from '../game/divided-engine.js';
import { initDeceiverState, placeMask, activeMaskOn } from '../game/deceiver-engine.js';
import { initOracleState, openProphecyAtNightStart, __setOracleRandom } from '../game/oracle-engine.js';
import { publicTeamCounts, phoneMafiaTeam } from '../game/public-counts.js';
import { teamOfRole } from '../game/roles.js';
import { checkWinCondition } from '../game/win-checker.js';
import { didPlayerWin } from '../game/win-attribution.js';
import { computeMatchReward } from '../services/progression.service.js';
import { projectStateFor, stripSecrets } from '../sockets/broadcast.util.js';
import { remapPhysicalIds } from '../game/seat-remap.js';
import { prophecyRevealFor } from '../game/prophecy-reveal.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const section = (t: string) => console.log(`\n━━━ ${t} ━━━`);
function P(seat: number, role: string, alive = true): any {
  return { physicalId: seat, name: role + '#' + seat, phone: null, playerId: seat + 1000, role, isAlive: alive, isSilenced: false, justificationCount: 0 };
}
// ١ الشيخ · ٢ مافيا · ٣ المُضلّل · ٤ العرّاف · ٥ الطبيب · ٦ الشريف · ٧ المنقسم · ٨..١٦ مواطنون · ١٧ المهرّج · ١٨ القنّاص
const table = () => [P(1, 'GODFATHER'), P(2, 'MAFIA_REGULAR'), P(3, 'DECEIVER'), P(4, 'ORACLE'), P(5, 'DOCTOR'), P(6, 'SHERIFF'), P(7, 'DIVIDED'),
  ...[8, 9, 10, 11, 12, 13, 14, 15, 16].map((s) => P(s, 'CITIZEN')), P(17, 'JESTER'), P(18, 'SNIPER')];
function mk(opts: any = {}): any {
  const s: any = {
    roomId: opts.roomId || 'd1', players: opts.players || table(), round: opts.round ?? DIVIDED_CHOICE_ROUND, phase: opts.phase || 'NIGHT',
    config: { bombEnabled: false, jesterSurviveRounds: 1, useDynamicEngine: true, witchDisableRounds: 3, prophecy: true, ...(opts.config || {}) },
    performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] },
    votingState: { candidates: [], deals: [], totalVotesCast: 0, hiddenPlayersFromVoting: [], tieBreakerLevel: 0, playerVotes: {} },
    twinState: null, witchPreviousTargets: [], assassinState: null, assassinRivals: null, nurseActivated: false, winner: null,
    dynamicNightState: { actions: {}, lastTargets: {} }, morningEvents: [],
  };
  s.deceiverState = initDeceiverState(s);
  s.oracleState = initOracleState(s);
  s.dividedState = initDividedState(s);
  return s;
}
function bag(list: Array<{ by: number; ab: string; t: number | null }>) {
  const n = createDynamicNightState();
  for (const a of list) { const action = { abilityId: a.ab, performerPhysicalId: a.by, targetPhysicalId: a.t, skipped: a.t == null }; n.actions[actionKey(action)] = action; }
  return n;
}
const role = (s: any, id: number) => s.players.find((p: any) => p.physicalId === id)?.role;
const alive = (s: any, id: number) => s.players.find((p: any) => p.physicalId === id)?.isAlive;
const kill = (s: any, ...ids: number[]) => { for (const id of ids) s.players.find((p: any) => p.physicalId === id).isAlive = false; };
const sideEv = (ev: any[]) => ev.find((e: any) => e.type === 'DIVIDED_SIDE');

(async () => {
  primeTestDefs();
  const abilities = await getAbilityDefs();
  const roles = await getRoleDefs();
  __primeDefsForTest({
    abilities: [...abilities, { id: 'MASK', nameAr: 'القناع', phase: 'NIGHT', priority: 2, targetType: 'ENEMY', excludeSelf: true, excludeLastTarget: false, maxTargets: 1, effectType: 'PASSIVE' } as any],
    roles: [...roles,
      { id: 'DECEIVER', team: 'MAFIA', abilities: ['MASK'], genPriority: 90, nameAr: 'المُضلّل' } as any,
      { id: 'ORACLE', team: 'CITIZEN', abilities: [], genPriority: 90, nameAr: 'العرّاف' } as any,
      { id: 'DIVIDED', team: 'CITIZEN', abilities: [], genPriority: 90, nameAr: 'المنقسم' } as any],
  });

  section('الحالة والنافذة');
  {
    check('الليلة الثانية = الجولة ٣', DIVIDED_CHOICE_ROUND === 3);
    const s = mk();
    check('يُحفظ مقعده ولم يختر', s.dividedState?.dividedPhysicalId === 7 && s.dividedState.choice === null);
    check('يبدأ مواطناً', teamOfRole(role(s, 7)) === 'CITIZEN');
    check('بلا منقسم ⇒ لا حالة', initDividedState({ players: [P(1, 'GODFATHER'), P(2, 'CITIZEN')] } as any) === null);
    check('الليلة الأولى مرفوضة', chooseSide(mk({ round: 2 }), 7, 'MAFIA').ok === false);
    check('نهار الليلة الثانية مرفوض', chooseSide(mk({ phase: 'DAY_DISCUSSION' }), 7, 'MAFIA').ok === false);
    check('الليلة الثالثة مرفوضة', chooseSide(mk({ round: 4 }), 7, 'MAFIA').ok === false);
    check('غيرُه لا يختار', chooseSide(s, 8, 'MAFIA').ok === false && canChooseSide(s, 8) === false);
    check('الليلة الثانية مقبولة', canChooseSide(s, 7) === true);
    const n = dividedNoticeFor(s, 7);
    check('ظرفُه يقول «تختار الليلة»', n?.canChooseNow === true && n.choice === null);
    check('ولا ظرف لغيره', dividedNoticeFor(s, 8) === null);
    const dead = mk(); kill(dead, 7);
    check('ميّتاً لا يختار', chooseSide(dead, 7, 'CITY').ok === false);
  }

  section('العبور إلى المافيا');
  {
    const s = mk();
    const before = publicTeamCounts(s);
    const r = chooseSide(s, 7, 'MAFIA');
    check('عبر', r.ok === true && (r as any).crossed === true);
    check('دورُه صار مافيا عادي', role(s, 7) === 'MAFIA_REGULAR' && teamOfRole(role(s, 7)) === 'MAFIA');
    check('نهائيّ: لا اختيار ثانٍ', chooseSide(s, 7, 'CITY').ok === false && role(s, 7) === 'MAFIA_REGULAR');
    check('هاتفُ الشيخ يراه زميلاً الآن (ب٤)', phoneMafiaTeam(s, 1).some((m) => m.physicalId === 7));
    check('وهاتفُه يرى زملاءه', phoneMafiaTeam(s, 7).map((m) => m.physicalId).sort().join(',') === '1,2,3');
    const during = publicTeamCounts(s);
    check('العدّاد العلنيّ لم يتحرّك قبل الإعلان', JSON.stringify(during) === JSON.stringify(before), JSON.stringify({ before, during }));
    const ev = await resolveNightDynamic(s, bag([{ by: 6, ab: 'INVESTIGATE', t: 7 }]));
    const sh = ev.find((e: any) => e.type === 'SHERIFF_RESULT');
    check('الشريف الليلة نفسها يراه مافيا', sh?.extra?.result === 'MAFIA', JSON.stringify(sh?.extra));
    const se = sideEv(ev);
    check('إعلان الصباح: «إلى المافيا»', se?.extra?.side === 'MAFIA');
    check('الإعلان بلا رقمٍ ولا اسم', se && se.targetPhysicalId == null && !se.targetName && Object.keys(se.extra).join(',') === 'side');
    s.morningEvents = ev; s.phase = 'MORNING_RECAP';
    check('العدّاد ما زال قبل عرض الإعلان', JSON.stringify(publicTeamCounts(s)) === JSON.stringify(before));
    se.revealed = true; markDividedAnnounced(s);
    const after = publicTeamCounts(s);
    check('ومع الإعلان: مافيا +١ ومواطنون −١', after.mafiaAlive === before.mafiaAlive + 1 && after.citizenAlive === before.citizenAlive - 1, JSON.stringify({ before, after }));
    check('ظرفُه بعد العبور (بالمقعد لا بالدور)', dividedNoticeFor(s, 7)?.choice === 'MAFIA');
  }

  section('آخر سلسلة الاغتيال');
  {
    const s = mk();
    chooseSide(s, 7, 'MAFIA');
    check('الشيخ حيّ ⇒ الشيخ', killHolderSeat(s) === 1);
    kill(s, 1, 2);
    check('مات الشيخ والعاديّ ⇒ المُضلّل لا المنقسم (وهو «عاديّ» قبله في السلسلة)', killHolderSeat(s) === 3, String(killHolderSeat(s)));
    kill(s, 3);
    check('لم يبقَ غيره ⇒ يحمل الاغتيال', killHolderSeat(s) === 7);
    const plan = await buildNightPlan(s);
    check('وخطّة الليل تعطيه الاغتيال', plan.some((x) => x.seat === 7 && x.abilityId === 'KILL'));
    const s2 = mk(); chooseSide(s2, 7, 'MAFIA'); kill(s2, 1);
    check('مات الشيخ ⇒ العاديّ الأصليّ (٢) لا المنقسم', killHolderSeat(s2) === 2);
  }

  section('الاغتيال في الليلة نفسها (ب٤)');
  {
    const s = mk();
    chooseSide(s, 7, 'MAFIA');
    const ev = await resolveNightDynamic(s, bag([{ by: 1, ab: 'KILL', t: 9 }]));
    check('اغتيالُ الليلة يمضي', alive(s, 9) === false && ev.some((e: any) => e.type === 'ASSASSINATION'));
  }

  section('البقاء مع المدينة');
  {
    const s = mk();
    const before = publicTeamCounts(s);
    const r = chooseSide(s, 7, 'CITY');
    check('بقي', r.ok === true && (r as any).crossed === false);
    check('دورُه المنقسم وفريقُه المدينة', role(s, 7) === 'DIVIDED' && teamOfRole('DIVIDED') === 'CITIZEN');
    check('المافيا لا تراه', !phoneMafiaTeam(s, 1).some((m) => m.physicalId === 7));
    const ev = await resolveNightDynamic(s, bag([{ by: 6, ab: 'INVESTIGATE', t: 7 }]));
    check('الشريف يراه مواطناً', ev.find((e: any) => e.type === 'SHERIFF_RESULT')?.extra?.result === 'CITIZEN');
    check('إعلان: «بقي مع المدينة»', sideEv(ev)?.extra?.side === 'CITY');
    markDividedAnnounced(s);
    check('العدّاد لا يتغيّر', JSON.stringify(publicTeamCounts(s)) === JSON.stringify(before));
    check('لا يحمل الاغتيال أبداً', crossedDividedSeat(s) === null);
  }

  section('لم يختر');
  {
    const s = mk();
    const ev = await resolveNightDynamic(s, bag([]));
    check('بقي مع المدينة تلقائيّاً', s.dividedState.choice === 'CITY' && s.dividedState.defaulted === true && role(s, 7) === 'DIVIDED');
    check('ويُعلن كالبقاء', sideEv(ev)?.extra?.side === 'CITY');
    const again = await resolveNightDynamic(s, bag([]));
    check('إعادةُ حلّ الليلة قبل العرض تعيد الإعلان نفسه', sideEv(again)?.extra?.side === 'CITY');
    markDividedAnnounced(s);
    const ev2 = await resolveNightDynamic(s, bag([]));
    check('وبعد العرض لا إعلان ثانٍ', !sideEv(ev2));
  }
  {
    const s = mk({ round: 2 });
    const ev = await resolveNightDynamic(s, bag([]));
    check('الليلة الأولى: لا إعلان ولا حسم', !sideEv(ev) && s.dividedState.choice === null);
  }
  {
    const s = mk(); kill(s, 7);
    const ev = await resolveNightDynamic(s, bag([]));
    check('مات قبل ليلته ⇒ لا اختيار ولا إعلان', !sideEv(ev) && s.dividedState.choice === null);
  }
  {
    const s = mk();
    const ev = await resolveNightDynamic(s, bag([{ by: 1, ab: 'KILL', t: 7 }]));
    check('اغتيل ليلتَه قبل أن يختار ⇒ لا إعلان', alive(s, 7) === false && !sideEv(ev));
  }
  {
    const s = mk();
    chooseSide(s, 7, 'MAFIA');
    const ev = await resolveNightDynamic(s, bag([{ by: 18, ab: 'SNIPE', t: 7 }]));
    check('عبر ثمّ قنصه القنّاص ⇒ مات مافيا، والإعلان قائم', alive(s, 7) === false && ev.some((e: any) => e.type === 'SNIPE_MAFIA') && sideEv(ev)?.extra?.side === 'MAFIA');
  }

  section('القناع');
  {
    const s = mk({ round: 2 });
    check('القناع يُوضع عليه وهو مواطن', !!placeMask(s, 3, 7));
    s.round = 3;
    chooseSide(s, 7, 'MAFIA');
    check('سقط القناع حين عبر', !activeMaskOn(s, 7) && s.dividedState.maskLifted === true && s.deceiverState.masks[0].lifted === true);
    check('لم يحترق (لم يقرأه أحد)', s.deceiverState.masks[0].burned === false);
    const ev = await resolveNightDynamic(s, bag([{ by: 6, ab: 'INVESTIGATE', t: 7 }]));
    check('والشريف يراه مافيا (الحقيقة، لا قلب)', ev.find((e: any) => e.type === 'SHERIFF_RESULT')?.extra?.result === 'MAFIA');
    check('ولا خبر احتراقٍ للمُضلّل', !ev.some((e: any) => e.type === 'MASK_BURNED'));
    const rv: any = prophecyRevealFor(s);
    check('الكشف بعد اللعبة: قناعٌ سقط لا تلفيق', rv.masks[0].lifted === true && rv.masks[0].executedBecauseOfMask === false);
  }
  {
    const s = mk({ round: 2 });
    placeMask(s, 3, 7);
    s.round = 3;
    chooseSide(s, 7, 'CITY');
    check('بقي ⇒ القناع قائم', !!activeMaskOn(s, 7));
  }

  section('صندوقا العرّاف');
  {
    let seen7 = 0;
    for (let i = 0; i < 300; i++) {
      const s = mk();
      s.oracleState.pendingBox = 'A';
      openProphecyAtNightStart(s, []);
      const b = s.oracleState.boxes;
      if (b && (b.aPhysicalId === 7 || b.bPhysicalId === 7)) seen7++;
    }
    check('ليلةَ اختياره لا يُسحب (٣٠٠ قرعة)', seen7 === 0, String(seen7));
    let city2 = 0;
    for (let i = 0; i < 300; i++) {
      const s = mk({ round: 2 });
      s.oracleState.pendingBox = 'A';
      openProphecyAtNightStart(s, []);
      const b = s.oracleState.boxes;
      if (b) { const c = b.mafiaBox === 'A' ? b.bPhysicalId : b.aPhysicalId; if (c === 7) city2++; }
    }
    check('قبلها يُسحب مواطناً (يُحسم في نهارها قبل اختياره)', city2 > 0, String(city2));
    let mafia4 = 0;
    for (let i = 0; i < 300; i++) {
      const s = mk();
      chooseSide(s, 7, 'MAFIA');
      s.round = 4;
      s.oracleState.pendingBox = 'A';
      openProphecyAtNightStart(s, []);
      const b = s.oracleState.boxes;
      if (b) { const m = b.mafiaBox === 'A' ? b.aPhysicalId : b.bPhysicalId; const c = b.mafiaBox === 'A' ? b.bPhysicalId : b.aPhysicalId; if (m === 7) mafia4++; if (c === 7) mafia4 = -999; }
    }
    check('بعد العبور يُسحب في صندوق المافيا وحده', mafia4 > 0, String(mafia4));
    check('بعد الحسم لا «غير محسوم»', (() => { const s = mk(); chooseSide(s, 7, 'CITY'); return undecidedDividedSeat(s) === null; })());
    __setOracleRandom(Math.random);
  }

  section('الفوز والمكافأة (قرار ٣٨)');
  {
    // عبوره يكمل للمافيا التعادل ⇒ فوز المافيا
    const pl = [P(1, 'GODFATHER'), P(2, 'MAFIA_REGULAR'), P(7, 'DIVIDED'), P(8, 'CITIZEN'), P(9, 'CITIZEN'), P(10, 'CITIZEN')];
    const s = mk({ players: pl });
    check('قبل العبور لا فائز', (checkWinCondition(s) as any) === 'CONTINUE', JSON.stringify(checkWinCondition(s)));
    chooseSide(s, 7, 'MAFIA');
    check('بعده: ٣ مافيا مقابل ٣ ⇒ المافيا', (checkWinCondition(s) as any) === 'MAFIA', JSON.stringify(checkWinCondition(s)));
    s.winner = 'MAFIA';
    check('يفوز مع المافيا', didPlayerWin(s, { physicalId: 7, role: role(s, 7) }, null) === true);
    s.winner = 'CITIZEN';
    check('ويخسر بفوز المدينة', didPlayerWin(s, { physicalId: 7, role: role(s, 7) }, null) === false);
    const t = mk(); chooseSide(t, 7, 'CITY'); t.winner = 'CITIZEN';
    check('الباقي يفوز مع المدينة', didPlayerWin(t, { physicalId: 7, role: 'DIVIDED' }, null) === true);
    const base = { winner: 'CITIZEN', survivedToEnd: true, roundsSurvived: 4, successfulDealsCount: 0, failedDealsCount: 0, mafiaDealOnMafiaCount: 0, abilityCorrectCount: 0, abilityIncorrectCount: 0, teamEliminationBonus: 0, assassinContractsCompleted: 0 } as any;
    const a = computeMatchReward({ ...base, role: 'DIVIDED' });
    const b = computeMatchReward({ ...base, role: 'CITIZEN' });
    check('مكافأةُ الباقي = مكافأةُ المواطن', a.rrChange === b.rrChange && a.won === b.won, JSON.stringify({ a: a.rrChange, b: b.rrChange }));
    const c = computeMatchReward({ ...base, winner: 'MAFIA', role: 'MAFIA_REGULAR' });
    const d = computeMatchReward({ ...base, winner: 'CITIZEN', role: 'DIVIDED' });
    check('ومكافأةُ العابر الفائز = مكافأةُ الباقي الفائز', c.rrChange === d.rrChange, JSON.stringify({ c: c.rrChange, d: d.rrChange }));
  }

  section('نقل المقاعد والسرّيّة');
  {
    const s = mk();
    chooseSide(s, 7, 'MAFIA');
    remapPhysicalIds(s, new Map([[7, 20], [20, 7]]));
    check('نقل المقعد ٧→٢٠ ينقل حالته', s.dividedState.dividedPhysicalId === 20 && crossedDividedSeat(s) === 20);
    const t = mk();
    for (const seat of [7, 1, 8]) check(`هاتف ${seat} لا يرى حالة المنقسم`, projectStateFor(t, seat).dividedState === undefined);
    check('المتفرّجون لا يرونها', stripSecrets(t).dividedState === undefined);
    const u = mk(); chooseSide(u, 7, 'MAFIA');
    const v8 = projectStateFor(u, 8);
    check('هاتفُ مواطنٍ لا يرى دوره الجديد', v8.players.find((p: any) => p.physicalId === 7)?.role == null);
    const rv: any = prophecyRevealFor(u);
    check('الكشف بعد اللعبة يذكره', rv?.divided?.dividedPhysicalId === 7 && rv.divided.choice === 'MAFIA');
  }

  section('بلا الكرت');
  {
    const s = mk({ players: table().map((p: any) => (p.role === 'DIVIDED' ? { ...p, role: 'CITIZEN' } : p)) });
    check('لا حالة', s.dividedState === null);
    const ev: any[] = [];
    settleDividedAtNightEnd(s, ev);
    check('لا إعلان', ev.length === 0);
    check('السلسلة كما هي', killHolderSeat(s) === 1);
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} نجح · ${fail} فشل`);
  if (fail) { console.log(failures.map((f) => '   • ' + f).join('\n')); process.exit(1); }
  process.exit(0);
})();
