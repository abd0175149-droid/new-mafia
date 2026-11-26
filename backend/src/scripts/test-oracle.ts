// ══════════════════════════════════════════════════════
// 🧪 موسم النبوءة · المرحلة ٢ — العرّاف: الصندوقان وصفقة النبوءة المجهولة
//
// تشغيل: npx tsx src/scripts/test-oracle.ts
// بلا قاعدة بيانات ولا Redis (المخزن في الذاكرة) — المحرّك الحقيقيّ: resolveNightDynamic وresolveVoting.
//
// قرارات المالك: ٢ (بالتصويت) · ٣ (من الليلة الثانية = الجولة ٣) · ٤ (لا تُحسب في صفقاته) ·
// ٥ (بلا اسم صاحبها) · ٦ (الوصيّة بمفتاح الغرفة) · ٢٦ (حقّ الشكّ قبل التصويت) · ٣٠ (النقض يحرقها) ·
// ب٢ (العرّاف يختار أ أو ب).
// ══════════════════════════════════════════════════════

import { primeTestDefs } from './_game-fixtures.js';
import { __primeDefsForTest, getAbilityDefs, getRoleDefs } from '../game/definition-service.js';
import { setGameState, getGameState } from '../config/redis.js';
import { resolveNightDynamic, createDynamicNightState, actionKey } from '../game/dynamic-night-resolver.js';
import { buildNightPlan } from '../game/night-plan.js';
import { resolveVoting, buildVotingCandidates } from '../game/vote-engine.js';
import {
  initOracleState, requestOpen, canOpenProphecy, placeProphecyDeal, withdrawProphecy, closeProphecy,
  isProphecyDeal, __setOracleRandom, PROPHECY_FIRST_ROUND,
} from '../game/oracle-engine.js';
import { initDeceiverState, placeMask, activeMaskOn } from '../game/deceiver-engine.js';
import { projectStateFor, stripSecrets } from '../sockets/broadcast.util.js';
import { prophecyRevealFor } from '../game/prophecy-reveal.js';
import { buildVoteRound } from '../game/vote-history.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const section = (t: string) => console.log(`\n━━━ ${t} ━━━`);

function P(seat: number, role: string, alive = true): any {
  return { physicalId: seat, name: role + '#' + seat, phone: null, playerId: seat + 1000, role, isAlive: alive, isSilenced: false, justificationCount: 0 };
}
// ١ الشيخ · ٢ المُضلّل · ٣ مافيا · ٤ العرّاف · ٥ الطبيب · ٦ الشريف · ٧ مواطن · ٨ مواطن · ٩ المهرّج · ١٠ مواطن
const table = () => [P(1, 'GODFATHER'), P(2, 'DECEIVER'), P(3, 'MAFIA_REGULAR'), P(4, 'ORACLE'), P(5, 'DOCTOR'), P(6, 'SHERIFF'), P(7, 'CITIZEN'), P(8, 'CITIZEN'), P(9, 'JESTER'), P(10, 'CITIZEN')];
function mk(opts: any = {}): any {
  const s: any = {
    roomId: opts.roomId || 'o1', players: opts.players || table(), round: opts.round ?? PROPHECY_FIRST_ROUND, phase: opts.phase || 'NIGHT',
    config: { bombEnabled: true, jesterSurviveRounds: 2, useDynamicEngine: true, witchDisableRounds: 3, ...(opts.config || {}) },
    performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] },
    votingState: { candidates: [], deals: [], totalVotesCast: 0, hiddenPlayersFromVoting: [], tieBreakerLevel: 0, playerVotes: {} },
    twinState: null, witchPreviousTargets: [], assassinState: null, assassinRivals: null, nurseActivated: false, winner: null,
    dynamicNightState: { actions: {}, lastTargets: {} },
  };
  s.deceiverState = initDeceiverState(s);
  s.oracleState = initOracleState(s);
  return s;
}
function bag(list: Array<{ by: number; ab: string; t: number | null }>) {
  const n = createDynamicNightState();
  for (const a of list) { const action = { abilityId: a.ab, performerPhysicalId: a.by, targetPhysicalId: a.t, skipped: a.t == null }; n.actions[actionKey(action)] = action; }
  return n;
}
const has = (ev: any[], t: string) => ev.some((e) => e.type === t);
/** العشوائيّة: أوّل الحوض للمافيا وللمواطنين، وصندوق المافيا «أ» */
const seq = (xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };

(async () => {
  primeTestDefs();
  const abilities = await getAbilityDefs();
  const roles = await getRoleDefs();
  __primeDefsForTest({
    abilities: [...abilities, { id: 'MASK', nameAr: 'القناع', phase: 'NIGHT', priority: 2, targetType: 'ENEMY', excludeSelf: true, excludeLastTarget: false, maxTargets: 1, effectType: 'PASSIVE' } as any],
    roles: [...roles, { id: 'DECEIVER', team: 'MAFIA', abilities: ['MASK'], genPriority: 90, nameAr: 'المُضلّل' } as any,
      { id: 'ORACLE', team: 'CITIZEN', abilities: [], genPriority: 90, nameAr: 'العرّاف' } as any],
  });

  section('الطلب والتوقيت');
  {
    const s = mk({ round: 2 });
    check('الليلة الأولى (الجولة ٢) مرفوضة', canOpenProphecy(s, 4).ok === false);
    const s3 = mk();
    check('الليلة الثانية (الجولة ٣) مقبولة', requestOpen(s3, 4, 'A').ok === true && s3.oracleState.pendingBox === 'A');
    check('من غير العرّاف مرفوض', requestOpen(s3, 7, 'A').ok === false);
    check('نهاراً مرفوض', canOpenProphecy(mk({ phase: 'DAY_DISCUSSION' }), 4).ok === false);
    check('الإلغاء قبل الحلّ', requestOpen(s3, 4, null).ok === true && s3.oracleState.pendingBox === null);
    check('العرّاف بلا خطوةٍ في خطّة الليل (شاشته كشاشة الجميع)', !(await buildNightPlan(s3)).some((x) => x.seat === 4));
  }

  section('فتح الصندوقين');
  {
    __setOracleRandom(seq([0, 0, 0.1]));  // المافيا: أوّلُ الحوض · المواطن: أوّلُه · صندوق المافيا «أ»
    const s = mk();
    requestOpen(s, 4, 'A');
    const ev = await resolveNightDynamic(s, bag([]));
    const o = s.oracleState;
    check('استُعملت النبوءة', o.used === true && o.openedRound === 3 && o.pendingBox === null);
    check('صندوقٌ لمافيا وصندوقٌ لمواطن', !!o.boxes && [1, 2, 3].includes(o.boxes.aPhysicalId) && [5, 6, 7, 8, 10].includes(o.boxes.bPhysicalId), JSON.stringify(o.boxes));
    check('لا مستقلّ ولا العرّاف نفسه في الصندوقين', ![4, 9].includes(o.boxes.aPhysicalId) && ![4, 9].includes(o.boxes.bPhysicalId));
    check('رأى صاحب الصندوق «أ»', o.seenPhysicalId === o.boxes.aPhysicalId && o.chosenBox === 'A');
    check('حدث PROPHECY_OPENED للموجّه', has(ev, 'PROPHECY_OPENED'));
    requestOpen(s, 4, 'B');
    check('لا فتحٌ ثانٍ', s.oracleState.pendingBox === null);
  }

  section('القناع والصندوقان');
  {
    // المواطن ٧ مقنَّع ⇒ يدخل حوض المافيا. نجعل القرعة تسحبه من ذلك الحوض.
    const s = mk({ round: 3 });
    placeMask(s, 2, 7);
    // حوض المافيا = [١، ٢، ٣، ٧] — الرابع (٠٫٨) هو ٧
    __setOracleRandom(seq([0.8, 0, 0.1]));
    requestOpen(s, 4, 'A');
    const ev = await resolveNightDynamic(s, bag([]));
    check('المقنَّع سُحب في صندوق المافيا', s.oracleState.boxes.aPhysicalId === 7 && s.oracleState.boxes.mafiaBox === 'A', JSON.stringify(s.oracleState.boxes));
    check('وسحبُه أحرق قناعه (بالعرّاف)', !activeMaskOn(s, 7) && ev.some((e: any) => e.type === 'MASK_BURNED' && e.extra?.burnedBy === 'ORACLE'));
    check('صندوق «أ» الآن مواطنان: النبوءة ستكذب', ![1, 2, 3].includes(s.oracleState.boxes.aPhysicalId) && ![1, 2, 3].includes(s.oracleState.boxes.bPhysicalId));
  }
  {
    const s = mk({ round: 3 });
    placeMask(s, 2, 7);
    __setOracleRandom(seq([0, 0, 0.1]));  // لا يُسحب ٧
    requestOpen(s, 4, 'A');
    await resolveNightDynamic(s, bag([]));
    check('دخولُ القرعة وحده لا يحرق القناع', !!activeMaskOn(s, 7));
  }

  section('ما يحرق النبوءة ليلاً');
  {
    __setOracleRandom(seq([0, 0, 0.1]));
    const s = mk();
    requestOpen(s, 4, 'B');
    const ev = await resolveNightDynamic(s, bag([{ by: 1, ab: 'KILL', t: 4 }]));
    check('قُتل العرّاف ليلة الفتح ⇒ تحترق', s.oracleState.outcome === 'BURNED_NIGHT' && has(ev, 'PROPHECY_BURNED'));
    check('ولا صفقة صباحاً', placeProphecyDeal({ ...s, phase: 'MORNING_RECAP' }) === false);
  }
  {
    __setOracleRandom(seq([0, 0, 0.1]));  // «ب» = مواطن أوّلُ الحوض = ٥
    const s = mk();
    requestOpen(s, 4, 'B');
    const seen = 5;
    const ev = await resolveNightDynamic(s, bag([{ by: 1, ab: 'KILL', t: seen }]));
    check('مات صاحبُ الاسم قبل الصباح ⇒ تحترق', s.oracleState.seenPhysicalId === seen && s.oracleState.outcome === 'BURNED_NIGHT' && has(ev, 'PROPHECY_BURNED'));
  }
  {
    // الساحرة تعطّل العرّاف: يُلغى الطلب ولا تُستهلك
    const pl = table(); pl[2] = P(3, 'WITCH');
    const s = mk({ players: pl });
    s.deceiverState = initDeceiverState(s);
    requestOpen(s, 4, 'A');
    const ev = await resolveNightDynamic(s, bag([{ by: 3, ab: 'DISABLE_ABILITY', t: 4 }]));
    check('معطَّلٌ ⇒ لا فتح', s.oracleState.used === false && has(ev, 'ABILITY_VOIDED'));
    s.round = 6; s.players[3].disabledUntilRound = 5;
    requestOpen(s, 4, 'A');
    __setOracleRandom(seq([0, 0, 0.1]));
    await resolveNightDynamic(s, bag([]));
    check('بعد زوال التعطيل يفتح', s.oracleState.used === true);
  }

  section('صفقة النبوءة صباحاً — بلا اسم صاحبها');
  {
    __setOracleRandom(seq([0, 0, 0.1]));
    const s = mk();
    requestOpen(s, 4, 'A');
    await resolveNightDynamic(s, bag([]));
    s.phase = 'DAY_DISCUSSION';
    check('تُسجَّل', placeProphecyDeal(s) === true);
    const d = s.votingState.deals[0];
    check('أوّلاً، بنوعها، وصاحبُها صفر', isProphecyDeal(d) && d.kind === 'PROPHECY' && d.initiatorPhysicalId === 0 && d.targetPhysicalId === s.oracleState.seenPhysicalId);
    check('مرّةً واحدة', placeProphecyDeal(s) === false && s.votingState.deals.length === 1);
    const cands = buildVotingCandidates(s).candidates;
    const pc: any = cands.find((c: any) => c.type === 'DEAL');
    check('مرشّحُها يحمل النوع ولا صاحب', pc?.kind === 'PROPHECY' && pc?.initiatorPhysicalId === 0);
    for (const seat of [4, 7]) {
      const v = projectStateFor(s, seat);
      check(`هاتف ${seat} لا يرى مقعد العرّاف ولا حالته`, v.oracleState === undefined && !JSON.stringify(v.votingState).includes('"initiatorPhysicalId":4'));
    }
    check('المتفرّجون لا يرون حالته', stripSecrets(s).oracleState === undefined);
  }

  section('حقّ الشكّ');
  {
    __setOracleRandom(seq([0, 0, 0.1]));
    const s = mk();
    requestOpen(s, 4, 'A'); await resolveNightDynamic(s, bag([]));
    s.phase = 'DAY_DISCUSSION'; placeProphecyDeal(s);
    check('من غير العرّاف مرفوض', withdrawProphecy(s, 7).ok === false);
    check('العرّاف يحرقها في النقاش', withdrawProphecy(s, 4).ok === true && s.oracleState.outcome === 'WITHDRAWN' && s.votingState.deals.length === 0);
    const s2 = mk();
    requestOpen(s2, 4, 'A'); await resolveNightDynamic(s2, bag([]));
    s2.phase = 'DAY_DISCUSSION'; placeProphecyDeal(s2); s2.phase = 'DAY_VOTING';
    check('بعد فتح التصويت مرفوض', withdrawProphecy(s2, 4).ok === false);
  }

  section('التصويت: صادقة');
  {
    __setOracleRandom(seq([0, 0, 0.1]));   // «أ» = المافيا ١ (الشيخ)
    const s = mk({ roomId: 'ov1', config: { bombEnabled: false } });
    requestOpen(s, 4, 'A'); await resolveNightDynamic(s, bag([]));
    s.phase = 'DAY_VOTING'; placeProphecyDeal(s);
    const built = buildVotingCandidates(s).candidates.map((c: any) => (c.type === 'DEAL' ? { ...c, votes: 6 } : c));
    s.votingState.candidates = built;
    await setGameState('ov1', s);
    const r: any = await resolveVoting('ov1');
    const st: any = await getGameState('ov1');
    check('الهدف المافيا خرج، والعرّاف حيّ', st.players[0].isAlive === false && st.players[3].isAlive === true, JSON.stringify(r.eliminated));
    check('النتيجة: صادقة', st.oracleState.outcome === 'TRUE');
    check('لا تُحسب في صفقات العرّاف (قرار ٤)', st.performanceTracking.dealOutcomes.length === 0);
    check('الحمولة: صاحبُها صفر ونوعُها نبوءة', r.deal?.initiatorPhysicalId === 0 && r.deal?.kind === 'PROPHECY');
  }

  section('التصويت: كاذبة، والوصيّة');
  {
    __setOracleRandom(seq([0, 0, 0.1]));   // «ب» = المواطن ٥
    const s = mk({ roomId: 'ov2' });
    requestOpen(s, 4, 'B'); await resolveNightDynamic(s, bag([]));
    s.phase = 'DAY_VOTING'; placeProphecyDeal(s);
    s.votingState.candidates = buildVotingCandidates(s).candidates.map((c: any) => (c.type === 'DEAL' ? { ...c, votes: 6 } : c));
    await setGameState('ov2', s);
    const r: any = await resolveVoting('ov2');
    const st: any = await getGameState('ov2');
    check('خرج المواطن ٥ والعرّاف معه (ارتداد)', st.players[4].isAlive === false && st.players[3].isAlive === false, JSON.stringify(r.eliminated));
    check('النتيجة: كاذبة', st.oracleState.outcome === 'FALSE');
    check('الوصيّة: رقمُ الصندوق الآخر (المافيا ١)', st.oracleState.testamentPhysicalId === 1 && r.deal?.testamentPhysicalId === 1);
    const rev: any = prophecyRevealFor(st);
    check('الكشف بعد اللعبة يحمل الصندوقين', rev?.oracle?.boxes?.A?.physicalId === 1 && rev?.oracle?.boxes?.B?.physicalId === 5 && rev.oracle.outcome === 'FALSE');
  }
  {
    __setOracleRandom(seq([0, 0, 0.1]));
    const s = mk({ roomId: 'ov3', config: { oracleTestament: false } });
    requestOpen(s, 4, 'B'); await resolveNightDynamic(s, bag([]));
    s.phase = 'DAY_VOTING'; placeProphecyDeal(s);
    s.votingState.candidates = buildVotingCandidates(s).candidates.map((c: any) => (c.type === 'DEAL' ? { ...c, votes: 6 } : c));
    await setGameState('ov3', s);
    await resolveVoting('ov3');
    const st: any = await getGameState('ov3');
    check('الوصيّة مطفأة من إعدادات الغرفة ⇒ لا رقم', st.oracleState.outcome === 'FALSE' && st.oracleState.testamentPhysicalId === null);
  }

  section('لم تمرّ، والنقض');
  {
    __setOracleRandom(seq([0, 0, 0.1]));
    const s = mk();
    requestOpen(s, 4, 'A'); await resolveNightDynamic(s, bag([]));
    s.phase = 'DAY_DISCUSSION'; placeProphecyDeal(s);
    s.round = 4; s.phase = 'NIGHT';
    await resolveNightDynamic(s, bag([]));
    check('نهارُها انقضى بلا حسم ⇒ لم تمرّ', s.oracleState.outcome === 'NOT_PASSED');
  }
  {
    __setOracleRandom(seq([0, 0, 0.1]));
    const s = mk();
    requestOpen(s, 4, 'A'); await resolveNightDynamic(s, bag([]));
    s.phase = 'DAY_VOTING'; placeProphecyDeal(s);
    s.votingState.candidates = buildVotingCandidates(s).candidates;
    check('النقض يحرقها ويُزيلها من المرشّحين', closeProphecy(s, 'VETOED') === true && s.oracleState.outcome === 'VETOED' && !s.votingState.candidates.some((c: any) => isProphecyDeal(c)) && !s.votingState.deals.length);
  }

  section('سجلّ التصويت المفتوح');
  {
    __setOracleRandom(seq([0, 0, 0.1]));
    const s = mk();
    requestOpen(s, 4, 'A'); await resolveNightDynamic(s, bag([]));
    s.phase = 'DAY_VOTING'; placeProphecyDeal(s);
    s.votingState.candidates = buildVotingCandidates(s).candidates;
    let row: any = null;
    try { row = buildVoteRound(s as any); } catch { row = null; }
    const dealRow = row?.candidates?.find((c: any) => c.type === 'DEAL');
    check('صفقة النبوءة في السجلّ بلا صاحبٍ ولا رقمه', !!dealRow && dealRow.kind === 'PROPHECY' && dealRow.initiatorPhysicalId === undefined && dealRow.initiatorName === undefined, JSON.stringify(dealRow));
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} نجح · ${fail} فشل`);
  if (fail) { console.log(failures.map((f) => '   • ' + f).join('\n')); process.exit(1); }
  process.exit(0);
})();
