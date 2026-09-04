// ══════════════════════════════════════════════════════
// 🧪 اختبار إعادة ربط أرقام المقاعد (seat-remap) — نقي بلا DB
// ══════════════════════════════════════════════════════
// الثابت الأساسي: بعد النقل/التبديل لا يبقى **أي** رقم مقعد قديم في الحالة.
// الاختبار يبني حالة مُصطنعة تحوي كل بنية مفهرسة بمقعد في GameState (بما فيها
// البنى التي كانت تفلت من الجوّال) ثم يمسح الحالة كلها بحثاً عن بقايا.
//
// ⚠️ عند إضافة أي حقل جديد يحمل رقم مقعد: أضفه هنا أولاً — يفشل الاختبار،
//    ثم اجعله يمرّ بإضافته لقوائم seat-remap. هكذا لا تتكرّر ثغرات الجوّال.
//
// تشغيل: npx tsx src/scripts/test-seat-remap.ts
// ══════════════════════════════════════════════════════

import { remapPhysicalIds, validateRenumberChanges } from '../game/seat-remap.js';

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t: string) { console.log(`\n━━━ ${t} ━━━`); }

// حالة مُصطنعة: اللاعب #3 (شريف) و#7 (مافيا) — كل بنية تشير إليهما
function makeState(): any {
  return {
    roomId: 'r1', phase: 'NIGHT', round: 2,
    config: { maxPlayers: 12 },
    players: [
      { physicalId: 3, name: 'أ', role: 'SHERIFF', isAlive: true, playerId: 100 },
      { physicalId: 7, name: 'ب', role: 'GODFATHER', isAlive: true, playerId: 200 },
      { physicalId: 9, name: 'ج', role: 'CITIZEN', isAlive: true, playerId: 300 },
    ],
    discussionState: { currentSpeakerId: 3, speakingQueue: [3, 7, 9], hasSpoken: [7], status: 'SPEAKING' },
    votingState: {
      candidates: [
        { type: 'PLAYER', targetPhysicalId: 7, votes: 2 },
        { type: 'DEAL', id: 'd1', initiatorPhysicalId: 3, targetPhysicalId: 9, votes: 1 },
      ],
      deals: [{ id: 'd1', initiatorPhysicalId: 3, targetPhysicalId: 9 }],
      hiddenPlayersFromVoting: [7],
      playerVotes: { 3: 0, 7: 1, 9: 0 },
      leaderProxyVotes: { 9: 0 },
      totalVotesCast: 3, tieBreakerLevel: 0,
    },
    nightActions: {
      godfatherTarget: 3, silencerTarget: 9, sheriffTarget: 7, doctorTarget: 3,
      sniperTarget: 7, nurseTarget: null, assassinTarget: 3, witchTarget: 7,
      lastProtectedTarget: 3, sheriffResult: 'MAFIA',
    },
    morningEvents: [
      { type: 'ASSASSINATION', targetPhysicalId: 3, targetName: 'أ', performerPhysicalId: 7, performerName: 'ب', revealed: false },
    ],
    pendingResolution: { candidate: { type: 'PLAYER', targetPhysicalId: 7, votes: 2 }, type: 'ELIMINATE' },
    tiedCandidates: [{ type: 'PLAYER', targetPhysicalId: 3, votes: 2 }],
    // ── البنى التي كانت تفلت من الجوّال ──
    withdrawalState: { count: 1, needed: 2, withdrawn: [3], accusedIds: [7], total: 3 },
    confrontation: { status: 'ACTIVE', requesterId: 3, targetId: 7, startedAt: 1 },
    dealRegisteredRound: { 3: 1, 7: 2 },
    dynamicNightState: {
      actions: { SHERIFF_INVESTIGATE: { performerPhysicalId: 3, targetPhysicalId: 7, skipped: false } },
      lastTargets: { SHERIFF_INVESTIGATE: 7, MAFIA_KILL: 3 },
    },
    luckyDrawHistory: [3, 9],
    // 👁️ متفرّجون: مقاعدهم محجوزة داخل الحلقة ويجب أن تتبع أيّ إعادة ترقيم
    spectators: [
      { physicalId: 11, name: 'مشاهد-أ', phone: '0790000001', playerId: 900, joinedAt: 1, addedBy: 'self' },
      { physicalId: 12, name: 'مشاهد-ب', phone: null, playerId: null, joinedAt: 2, addedBy: 'leader' },
    ],
    luckyDraw: { status: 'revealed', count: 1, winners: [7], pool: [3, 7, 9] },
    // ── بقية البنى ──
    policewomanState: { isReady: true, isUsed: false, policewomanPhysicalId: 3, policewomanName: 'أ', citizenDeathsSinceTrigger: 1, threshold: 2, isTriggered: true, triggerRound: 1, citizenAliveAtTrigger: 3 },
    assassinState: { assassinPhysicalId: 7, contracts: [], currentContractIndex: 0, completedCount: 0, totalRequired: 4, firstNightPassed: true, lastKillRound: null, won: false },
    twinState: { olderBrotherPhysicalId: 7, youngerBrotherPhysicalId: 3, olderAlive: true, youngerAlive: true, transformed: false, suicideTriggered: false },
    mayorState: { mayorPhysicalId: 3, revealed: true, vetoUsed: false },
    pendingBomb: {
      godfatherPhysicalId: 7, godfatherPlayerId: 200,
      above: { physicalId: 9, name: 'ج', role: 'CITIZEN' },
      below: { physicalId: 3, name: 'أ', role: 'SHERIFF' },
    },
    witchPreviousTargets: [3],
    playerNightActions: { submitted: { 3: true, 7: false }, timerHandle: { unref: true } },
    autoNightChoices: [{ physicalId: 3, targetPhysicalId: 7, isReal: true, isRandom: false }],
    autoNightPerformerId: 3,
    performanceTracking: {
      dealOutcomes: [{ initiatorPhysicalId: 3, targetPhysicalId: 7, targetRole: 'GODFATHER', success: true }],
      abilityResults: [{ physicalId: 3, role: 'SHERIFF', correct: true }],
      eliminationLog: [{ physicalId: 7, eliminatedBy: 'DAY_VOTE', round: 1, team: 'MAFIA' }],
      penaltyEvents: [{ physicalId: 3, playerId: 100, rr: -10, round: 1, kicked: false }],
      bombEvents: [{ physicalId: 7, playerId: 200, rr: 10, round: 2 }],
    },
  };
}

// يجمع كل الأرقام الموجودة في مواضع «رقم مقعد» — للبحث عن بقايا
function collectSeatRefs(node: any, key: string | null, out: number[]): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    const ARRAYS = ['speakingQueue', 'hasSpoken', 'hiddenPlayersFromVoting', 'winners', 'pool',
      'witchPreviousTargets', 'eliminated', 'withdrawn', 'accusedIds', 'luckyDrawHistory'];
    if (key && ARRAYS.includes(key)) { for (const v of node) if (typeof v === 'number') out.push(v); return; }
    for (const item of node) collectSeatRefs(item, key, out);
    return;
  }
  const KEYED = ['playerVotes', 'leaderProxyVotes', 'submitted', 'dealRegisteredRound'];
  if (key && KEYED.includes(key)) {
    for (const k of Object.keys(node)) { const n = Number(k); if (Number.isFinite(n)) out.push(n); }
    return;
  }
  if (key === 'lastTargets') {
    for (const v of Object.values(node)) if (typeof v === 'number') out.push(v);
    return;
  }
  const VALUE_FIELDS = ['physicalId', 'currentSpeakerId', 'autoNightPerformerId', 'requesterId', 'targetId',
    'godfatherTarget', 'silencerTarget', 'sheriffTarget', 'doctorTarget', 'sniperTarget',
    'nurseTarget', 'assassinTarget', 'witchTarget', 'lastProtectedTarget'];
  for (const [k, v] of Object.entries(node)) {
    if (k === 'timerHandle') continue;
    if (typeof v === 'number') {
      if (VALUE_FIELDS.includes(k) || k.endsWith('PhysicalId')) out.push(v);
    } else collectSeatRefs(v, k, out);
  }
}

section('1) تبديل لاعبَين (3 ⇄ 7) — لا يبقى أي أثر للأرقام القديمة في مواضعها');
{
  const s = makeState();
  remapPhysicalIds(s, new Map([[3, 7], [7, 3]]));

  // الأدوار تتبع الأشخاص لا المقاعد — الثابت الأهم
  const sheriff = s.players.find((p: any) => p.role === 'SHERIFF');
  const gf = s.players.find((p: any) => p.role === 'GODFATHER');
  check('الشريف صار في المقعد 7', sheriff.physicalId === 7, `=${sheriff.physicalId}`);
  check('شيخ المافيا صار في المقعد 3', gf.physicalId === 3, `=${gf.physicalId}`);
  check('playerId لم يُمَس (هوية الحساب)', sheriff.playerId === 100 && gf.playerId === 200);
  check('اللاعب غير المشمول (#9) بقي كما هو', !!s.players.find((p: any) => p.physicalId === 9 && p.role === 'CITIZEN'));
  check('القائمة مرتّبة بالرقم الجديد', s.players.map((p: any) => p.physicalId).join(',') === '3,7,9');

  // الثغرات الخمس التي كانت تفلت
  check('ثغرة ①: confrontation.requesterId 3→7', s.confrontation.requesterId === 7, `=${s.confrontation.requesterId}`);
  check('ثغرة ①: confrontation.targetId 7→3', s.confrontation.targetId === 3, `=${s.confrontation.targetId}`);
  check('ثغرة ②: withdrawalState.withdrawn [3]→[7]', s.withdrawalState.withdrawn[0] === 7, `=${s.withdrawalState.withdrawn[0]}`);
  check('ثغرة ②: withdrawalState.accusedIds [7]→[3]', s.withdrawalState.accusedIds[0] === 3, `=${s.withdrawalState.accusedIds[0]}`);
  check('ثغرة ③: dealRegisteredRound المفاتيح انقلبت', s.dealRegisteredRound[7] === 1 && s.dealRegisteredRound[3] === 2,
    JSON.stringify(s.dealRegisteredRound));
  check('ثغرة ④: dynamicNightState.lastTargets القيَم انقلبت',
    s.dynamicNightState.lastTargets.SHERIFF_INVESTIGATE === 3 && s.dynamicNightState.lastTargets.MAFIA_KILL === 7,
    JSON.stringify(s.dynamicNightState.lastTargets));
  check('ثغرة ⑤: luckyDrawHistory [3,9]→[7,9]', s.luckyDrawHistory[0] === 7 && s.luckyDrawHistory[1] === 9,
    JSON.stringify(s.luckyDrawHistory));

  // البنى المغطاة أصلاً — حماية من الانحدار
  check('أهداف الليل أُعيد ربطها', s.nightActions.godfatherTarget === 7 && s.nightActions.sheriffTarget === 3
    && s.nightActions.doctorTarget === 7 && s.nightActions.assassinTarget === 7 && s.nightActions.witchTarget === 3);
  check('أصوات اللاعبين انقلبت مفاتيحها', s.votingState.playerVotes[7] === 0 && s.votingState.playerVotes[3] === 1);
  check('المرشّحون تتبعهم أصواتهم', s.votingState.candidates[0].targetPhysicalId === 3
    && s.votingState.candidates[1].initiatorPhysicalId === 7);
  check('طابور الكلام والمتحدث الحالي', s.discussionState.currentSpeakerId === 7
    && s.discussionState.speakingQueue.join(',') === '7,3,9' && s.discussionState.hasSpoken[0] === 3);
  check('التوأمان', s.twinState.olderBrotherPhysicalId === 3 && s.twinState.youngerBrotherPhysicalId === 7);
  check('السفّاح والشرطية والعمدة', s.assassinState.assassinPhysicalId === 3
    && s.policewomanState.policewomanPhysicalId === 7 && s.mayorState.mayorPhysicalId === 7);
  check('القنبلة المعلّقة (الشيخ وهدفاها)', s.pendingBomb.godfatherPhysicalId === 3
    && s.pendingBomb.below.physicalId === 7 && s.pendingBomb.above.physicalId === 9);
  check('تتبع الأداء (قدرات/إقصاء/عقوبات/قنبلة)',
    s.performanceTracking.abilityResults[0].physicalId === 7
    && s.performanceTracking.eliminationLog[0].physicalId === 3
    && s.performanceTracking.penaltyEvents[0].physicalId === 7
    && s.performanceTracking.bombEvents[0].physicalId === 3);
  check('العقوبة بقيت مربوطة بـplayerId الصحيح', s.performanceTracking.penaltyEvents[0].playerId === 100);
  check('إجراءات الليل الديناميكية', s.dynamicNightState.actions.SHERIFF_INVESTIGATE.performerPhysicalId === 7
    && s.dynamicNightState.actions.SHERIFF_INVESTIGATE.targetPhysicalId === 3);
  check('السحب (winners/pool) وأهداف الساحرة', s.luckyDraw.winners[0] === 3
    && s.luckyDraw.pool.sort((a: number, b: number) => a - b).join(',') === '3,7,9'
    && s.witchPreviousTargets[0] === 7);
  check('timerHandle لم يُكسَر', s.playerNightActions.timerHandle?.unref === true);
}

section('2) نقل إلى مقعد فارغ (3 → 12) — لا يبقى أي مرجع للمقعد القديم');
{
  const s = makeState();
  remapPhysicalIds(s, new Map([[3, 12]]));

  const refs: number[] = [];
  collectSeatRefs(s, null, refs);
  const stale = refs.filter(r => r === 3);
  check('لا مرجع متبقٍّ للرقم القديم (3) في أي بنية', stale.length === 0, `بقي ${stale.length} مرجعاً`);
  check('الشريف انتقل للمقعد 12 بدوره', s.players.find((p: any) => p.role === 'SHERIFF')?.physicalId === 12);
  check('المقعد 7 لم يتأثّر', s.players.find((p: any) => p.physicalId === 7)?.role === 'GODFATHER');
  check('عدد اللاعبين لم يتغيّر', s.players.length === 3);
}

section('3) الثابت الشامل: أي خريطة → صفر بقايا (مسح كامل)');
{
  for (const [from, to] of [[3, 7], [7, 9], [9, 11]] as Array<[number, number]>) {
    const s = makeState();
    const map = new Map<number, number>([[from, to], [to, from]]);
    remapPhysicalIds(s, map);
    const refs: number[] = [];
    collectSeatRefs(s, null, refs);
    // بعد التبديل المتبادل يجب أن تبقى المجموعة نفسها (تبادل لا فقدان)
    const before: number[] = [];
    collectSeatRefs(makeState(), null, before);
    const cntBefore = before.filter(r => r === from).length + before.filter(r => r === to).length;
    const cntAfter = refs.filter(r => r === from).length + refs.filter(r => r === to).length;
    check(`تبديل ${from}⇄${to}: عدد المراجع محفوظ (${cntBefore})`, cntBefore === cntAfter, `قبل ${cntBefore} / بعد ${cntAfter}`);
  }
}

section('4) حارس التصادم — validateRenumberChanges');
{
  const players = [{ physicalId: 3, name: 'أ' }, { physicalId: 7, name: 'ب' }, { physicalId: 9, name: 'ج' }];
  check('نقل لمقعد فارغ مسموح', validateRenumberChanges(players, [{ oldPhysicalId: 3, newPhysicalId: 12 }]) === null);
  check('تبديل متبادل مسموح', validateRenumberChanges(players,
    [{ oldPhysicalId: 3, newPhysicalId: 7 }, { oldPhysicalId: 7, newPhysicalId: 3 }]) === null);
  check('نقل فوق مشغول غير مشمول → مرفوض',
    validateRenumberChanges(players, [{ oldPhysicalId: 3, newPhysicalId: 9 }]) !== null);
  check('خريطة فارغة لا تفعل شيئاً', (() => {
    const s = makeState(); remapPhysicalIds(s, new Map()); return s.players[0].physicalId === 3;
  })());
}

section('5) رصد «القرار الجاري» — detectSeatMoveHazard');
{
  const { detectSeatMoveHazard } = await import('../sockets/lobby.socket.js');
  const base = (over: any = {}) => ({
    phase: 'DAY_DISCUSSION', votingState: { playerVotes: {} },
    pendingBomb: null, tiedCandidates: [], policewomanState: null, mayorState: null,
    currentNightStep: null, nightStep: null, autoNightPerformerId: null, ...over,
  });

  check('نقاش عادي: لا خطر', detectSeatMoveHazard(base()) === null);
  check('لوبي: لا خطر', detectSeatMoveHazard(base({ phase: 'LOBBY' })) === null);

  const bomb = detectSeatMoveHazard(base({
    pendingBomb: { godfatherPhysicalId: 7, above: { physicalId: 9 }, below: { physicalId: 3 } },
  }));
  check('قنبلة معلّقة → مانع (blocking)', bomb?.kind === 'BOMB' && bomb.blocking === true);

  const voteOpen = detectSeatMoveHazard(base({ phase: 'DAY_VOTING', votingState: { playerVotes: { 3: 0, 7: 1 } } }));
  check('تصويت مفتوح بأصوات → تأكيد لا منع', voteOpen?.kind === 'VOTING' && !voteOpen.blocking);
  check('رسالة التصويت تذكر عدد الأصوات', !!voteOpen?.message.includes('2'), voteOpen?.message);

  check('تصويت بلا أصوات بعد → لا خطر',
    detectSeatMoveHazard(base({ phase: 'DAY_VOTING', votingState: { playerVotes: {} } })) === null);

  const night = detectSeatMoveHazard(base({ phase: 'NIGHT', currentNightStep: { role: 'SHERIFF' } }));
  check('خطوة ليل مفتوحة → تأكيد', night?.kind === 'NIGHT_STEP' && !night.blocking);

  const police = detectSeatMoveHazard(base({ policewomanState: { isReady: true, isUsed: false } }));
  check('نافذة الشرطية جاهزة → تأكيد', police?.kind === 'DECISION_WINDOW' && !police.blocking);
  check('نافذة الشرطية مستهلكة → لا خطر',
    detectSeatMoveHazard(base({ policewomanState: { isReady: true, isUsed: true } })) === null);

  const tie = detectSeatMoveHazard(base({ phase: 'DAY_TIEBREAKER', tiedCandidates: [{ votes: 2 }, { votes: 2 }] }));
  check('كسر تعادل معروض → تأكيد', tie?.kind === 'TIEBREAKER' && !tie.blocking);

  // الأولوية: القنبلة تسبق كل شيء (لأنها الوحيدة المانعة)
  const both = detectSeatMoveHazard(base({
    phase: 'DAY_VOTING', votingState: { playerVotes: { 3: 0 } },
    pendingBomb: { godfatherPhysicalId: 7 },
  }));
  check('القنبلة لها الأولوية على التصويت', both?.kind === 'BOMB' && both.blocking === true);
}

section('6) 👁️ مقاعد المتفرّجين تتبع إعادة الترقيم (وإلّا جلس اثنان على كرسيّ)');
{
  const s = makeState();
  remapPhysicalIds(s, new Map([[11, 4], [12, 5]]));
  check('متفرّج على المقعد 11 صار 4', s.spectators[0].physicalId === 4, `=${s.spectators[0].physicalId}`);
  check('متفرّج على المقعد 12 صار 5', s.spectators[1].physicalId === 5, `=${s.spectators[1].physicalId}`);
  check('هويّة المتفرّج لم تُمَس', s.spectators[0].playerId === 900 && s.spectators[1].playerId === null);
  check('لا تصادم بين مقعد متفرّج ومقعد لاعب',
    !s.players.some((p: any) => s.spectators.some((sp: any) => sp.physicalId === p.physicalId)));
}

section('7) 🔁 دفعة خمسة لاعبين متقاطعة (دورة كاملة) — لا بقايا');
{
  const s = makeState();
  // دورة: 3→7، 7→9، 9→12، مع متفرّجَين ثابتَين خارج الدورة
  s.spectators = [{ physicalId: 1, name: 'م', phone: null, playerId: null, joinedAt: 1, addedBy: 'self' }];
  remapPhysicalIds(s, new Map([[3, 7], [7, 9], [9, 12]]));
  const seats = s.players.map((p: any) => p.physicalId).sort((a: number, b: number) => a - b);
  check('الأرقام الناتجة 7,9,12 بلا تكرار', seats.join(',') === '7,9,12', seats.join(','));
  check('الشريف تبع شخصه إلى 7', s.players.find((p: any) => p.role === 'SHERIFF').physicalId === 7);
  check('شيخ المافيا تبع شخصه إلى 9', s.players.find((p: any) => p.role === 'GODFATHER').physicalId === 9);
  check('المتفرّج خارج الدورة لم يتحرّك', s.spectators[0].physicalId === 1);
  const refs: number[] = [];
  collectSeatRefs(s, null, refs);
  const stale = refs.filter(r => r === 3);
  check('صفر بقايا للرقم 3 بعد الدورة', stale.length === 0, `بقي ${stale.length}`);
}

section('8) 🎲 كسر التعادل بالتباعد — الواصلون معاً لا يتجاورون');
{
  // محاكاة مبسّطة لمنطق engine: نتائج متساوية ⇒ يفوز الأبعد عن مقاعد التباعد
  const cap = 12;
  const dist = (a: number, b: number) => Math.min(Math.abs(a - b), cap - Math.abs(a - b));
  const minDist = (seat: number, others: number[]) => others.length ? Math.min(...others.map(o => dist(seat, o))) : Infinity;
  const empties = [2, 3, 4, 5, 6, 7, 8];
  const recent = [1];
  const best = empties.slice().sort((x, y) => minDist(y, recent) - minDist(x, recent))[0];
  check('بعد جلوس الأوّل في 1، الثاني لا يأخذ 2', best !== 2, `اختار ${best}`);
  check('الثاني يأخذ الأبعد دائريّاً (7)', best === 7, `اختار ${best}`);
  const recent2 = [1, 7];
  const best2 = empties.filter(e => e !== 7).slice().sort((x, y) => minDist(y, recent2) - minDist(x, recent2))[0];
  check('الثالث يبتعد عن الاثنين معاً (4)', best2 === 4, `اختار ${best2}`);
}

console.log(`\n══════════════════════════════════════`);
console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
if (fail > 0) {
  console.log(`\n❌ الفشل:`);
  failures.forEach(f => console.log(`   - ${f}`));
  process.exit(1);
} else {
  console.log(`\n🎉 إعادة ربط المقاعد سليمة — لا تسريب ولا بقايا.`);
  process.exit(0);
}
