// ══════════════════════════════════════════════════════
// 🧪 إسقاطُ الحالة لهاتف اللاعب — لا سرَّ يتسرّب، ولا شيءَ يحتاجه العميل يضيع
//
// تشغيل: npx tsx src/scripts/test-state-projection.ts   (نقي — بلا قاعدة ولا Redis)
// ══════════════════════════════════════════════════════

import { projectStateFor, publicJustification, publicPendingResolution } from '../sockets/broadcast.util.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const section = (t: string) => console.log(`\n━━━ ${t} ━━━`);

const P = (seat: number, role: string, alive = true, extra: any = {}) => ({
  physicalId: seat, name: 'P' + seat, phone: '07900000' + seat, dob: '2000-01-01', playerId: 1000 + seat,
  role, isAlive: alive, isSilenced: false, justificationCount: 0, gender: 'MALE', penalties: 0,
  disabledUntilRound: 5, disabledRoleName: role, ...extra,
});

function baseState(): any {
  return {
    roomId: 'r1', roomCode: '1234', phase: 'DAY_DISCUSSION', round: 3, rolesConfirmed: true,
    config: { gameName: 'T', displayPin: '9999', voiceMeetingId: 'secret-meet', isRemote: false, maxPenalties: 3, allowPlayerInvites: true, mayorVoteWeight: 2 },
    players: [P(1, 'GODFATHER'), P(2, 'SHERIFF'), P(3, 'DOCTOR', false), P(4, 'CITIZEN'), P(5, 'MAYOR'), P(6, 'OLDER_BROTHER'), P(7, 'YOUNGER_BROTHER')],
    spectators: [{ physicalId: 9, name: 'S9', phone: '0791111111', dob: '1999-01-01', playerId: 2009, joinedAt: 1, addedBy: 'self' }],
    nightActions: { godfatherTarget: 2 }, autoNightChoices: { 1: 2 }, playerNightActions: { submitted: { 1: true } },
    dynamicNightState: { actions: { '1:KILL': { abilityId: 'KILL', performerPhysicalId: 1, targetPhysicalId: 2 } } },
    oneNight: { plan: [{ seat: 1, abilityId: 'KILL' }] }, currentNightStep: { performerPhysicalId: 1 },
    twinState: { olderBrotherPhysicalId: 6, youngerBrotherPhysicalId: 7 },
    assassinState: { assassinPhysicalId: 8, contracts: [] },
    mayorState: { mayorPhysicalId: 5, revealed: false, vetoUsed: false, window: { winner: { targetPhysicalId: 4 } } },
    phoenixState: { seat: 4, rebirthsLeft: 1 }, pendingAshCurse: { eligible: [1] },
    policewomanState: { policewomanPhysicalId: 3 }, witchPreviousTargets: [2],
    performanceTracking: { abilityResults: [{ physicalId: 2, role: 'SHERIFF' }] },
    pendingBomb: { above: { physicalId: 2, role: 'SHERIFF' } }, heldBombResult: null,
    morningEvents: [], rolesPool: ['GODFATHER', 'SHERIFF'],
    discussionState: { currentSpeakerId: 2, speakingQueue: [4, 5] },
    votingState: { candidates: [{ type: 'PLAYER', targetPhysicalId: 4, votes: 0 }], playerVotes: {}, deals: [] },
    winner: 'MAFIA',
  };
}

section('١) لا أدوارَ للأحياء، ودورُك أنت لك');
{
  const st = baseState();
  const v = projectStateFor(st, 2);
  const alive = v.players.filter((p: any) => p.isAlive && p.physicalId !== 2);
  check('لا دورَ لأيّ حيٍّ غيري', alive.every((p: any) => p.role === null), JSON.stringify(alive.map((p: any) => p.role)));
  check('دوري أنا (الشريف) لي', v.players.find((p: any) => p.physicalId === 2).role === 'SHERIFF');
  check('هاتفي لي', v.players.find((p: any) => p.physicalId === 2).phone === '079000002');
  check('لا هاتفَ لغيري', v.players.filter((p: any) => p.physicalId !== 2).every((p: any) => p.phone === undefined));
  check('لا تاريخَ ميلادٍ لأحد', v.players.every((p: any) => p.dob === undefined));
  check('لا اسمَ الدور المعطَّل', v.players.every((p: any) => p.disabledRoleName === undefined && p.disabledUntilRound === undefined));
  check('الميّت المكشوف (الطبيب) دورُه ظاهر', v.players.find((p: any) => p.physicalId === 3).role === 'DOCTOR');
  check('المعرّفُ والاسمُ والحياة باقية', v.players.every((p: any) => p.playerId && p.name && typeof p.isAlive === 'boolean'));
  const anon = projectStateFor(st, null);
  check('بلا مقعد: لا دورَ حيٍّ إطلاقاً', anon.players.filter((p: any) => p.isAlive).every((p: any) => p.role === null));
}

section('٢) الأسرار الأخرى تُسقَط');
{
  const v = projectStateFor(baseState(), 2);
  for (const k of ['nightActions', 'autoNightChoices', 'playerNightActions', 'dynamicNightState', 'oneNight', 'currentNightStep',
    'twinState', 'assassinState', 'phoenixState', 'pendingAshCurse', 'policewomanState', 'witchPreviousTargets',
    'performanceTracking', 'pendingBomb', 'morningEvents', 'rolesPool']) {
    check(`لا ${k}`, v[k] === undefined);
  }
  check('رمز شاشة العرض محجوب', v.config.displayPin === undefined);
  check('معرّف الاجتماع الصوتيّ محجوب', v.config.voiceMeetingId === undefined);
  check('الإعدادات العلنيّة باقية', v.config.isRemote === false && v.config.maxPenalties === 3 && v.config.allowPlayerInvites === true);
  check('العمدة المخفيّ لا يظهر', v.mayorState === undefined);
  check('الفائز لا يظهر قبل نهاية اللعبة', v.winner === undefined);
  check('المتفرّج بلا هاتف', v.spectators[0].phone === undefined && v.spectators[0].name === 'S9');
  check('النقاش والتصويت باقيان', !!v.discussionState && !!v.votingState);
}

section('٣) العمدة المكشوف، والفائز عند النهاية');
{
  const st = baseState();
  st.mayorState.revealed = true; st.mayorState.vetoUsed = true;
  const v = projectStateFor(st, 2);
  check('العمدة المكشوف يظهر بلا نافذة', v.mayorState?.mayorPhysicalId === 5 && v.mayorState.window === undefined);
  st.phase = 'GAME_OVER';
  check('الفائز في نهاية اللعبة', projectStateFor(st, 2).winner === 'MAFIA');
}

section('٤) الميّت قبل الكشف');
{
  const st = baseState();
  st.phase = 'DAY_ELIMINATION'; st.eliminationRevealed = false;
  st.players.find((p: any) => p.physicalId === 1).isAlive = false;
  st.pendingResolution = { eliminated: [1], revealedRoles: [{ physicalId: 1, role: 'GODFATHER' }], causes: [{ physicalId: 1, by: 'DAY_VOTE' }], type: 'ELIMINATION' };
  const v = projectStateFor(st, 2);
  check('المُعدَم قبل الكشف: دورُه مخفيّ', v.players.find((p: any) => p.physicalId === 1).role === null);
  check('النتيجة قبل الكشف: الأرقام وحدها', JSON.stringify(v.pendingResolution) === JSON.stringify({ eliminated: [1], type: 'ELIMINATION' }));
  st.eliminationRevealed = true;
  const v2 = projectStateFor(st, 2);
  check('بعد الكشف: دورُه ظاهر', v2.players.find((p: any) => p.physicalId === 1).role === 'GODFATHER');
  check('بعد الكشف: النتيجة كاملة', v2.pendingResolution.revealedRoles?.length === 1);

  const night = baseState();
  night.phase = 'MORNING_RECAP';
  night.players.find((p: any) => p.physicalId === 4).isAlive = false;
  night.players.find((p: any) => p.physicalId === 2).isAlive = false;
  night.morningEvents = [
    { type: 'ASSASSINATION', targetPhysicalId: 4, revealed: false },
    { type: 'SNIPE_CITIZEN', targetPhysicalId: 5, revealed: true, extra: { sniperPhysicalId: 2 } },
  ];
  const n = projectStateFor(night, 7);
  check('قتيلُ الليل غير المعروض: دورُه مخفيّ', n.players.find((p: any) => p.physicalId === 4).role === null);
  check('حدثٌ معروض: يُكشف (القنّاص الميّت معه)', n.players.find((p: any) => p.physicalId === 2).role === 'SHERIFF');
  night.morningEvents[0].revealed = true;
  check('بعد عرضه: يُكشف', projectStateFor(night, 7).players.find((p: any) => p.physicalId === 4).role === 'CITIZEN');
}

section('٥) التبرير بلا أدوار، والسحب الموزون باقٍ');
{
  const jd = {
    accused: [{ targetPhysicalId: 4, name: 'P4', role: 'CITIZEN', canJustify: true }],
    canJustifyList: [{ targetPhysicalId: 4, role: 'CITIZEN' }],
    candidates: [{ type: 'PLAYER', targetPhysicalId: 4, votes: 3, role: 'CITIZEN' }],
    votersForAccused: [1, 5], voterWeights: { 5: 2 }, withdrawalTotal: 3, withdrawalNeeded: 2, topVotes: 3,
  };
  const p = publicJustification(jd);
  check('لا دورَ للمتّهم', p.accused.every((a: any) => a.role === undefined) && p.canJustifyList.every((a: any) => a.role === undefined));
  check('لا دورَ في المرشّحين', p.candidates.every((c: any) => c.role === undefined));
  check('المتّهم وأرقامُ السحب باقية', p.accused[0].targetPhysicalId === 4 && p.withdrawalNeeded === 2 && p.voterWeights[5] === 2);
  check('الأصل لم يُمسّ (الموجّه يحتاجه)', jd.accused[0].role === 'CITIZEN');
  const st = baseState();
  st.phase = 'DAY_JUSTIFICATION'; st.justificationData = jd;
  check('الإسقاط يحمل التبرير بلا أدوار', projectStateFor(st, 1).justificationData.accused[0].role === undefined);
  check('publicPendingResolution بلا حالة', publicPendingResolution({}) === undefined);
}

section('٦) السحب السرّيّ للهدايا');
{
  const st = baseState();
  st.luckyDraw = { status: 'drawn', count: 1, winners: [4], pool: [1, 2, 4] };
  const v = projectStateFor(st, 2);
  check('قبل الكشف: لا رابحين ولا مرشّحين', v.luckyDraw.winners === undefined && v.luckyDraw.pool === undefined);
  st.luckyDraw.status = 'revealed';
  check('بعد الكشف: الرابحون', projectStateFor(st, 2).luckyDraw.winners?.[0] === 4);
}

console.log(`\nالنتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
if (fail) { console.log('\nالفاشلة:'); failures.forEach(f => console.log('  • ' + f)); process.exit(1); }
