// ══════════════════════════════════════════════════════
// 🧪 اختبار منطق العمدة 🎩 — القرارات المقفلة ①-⑧ كاملة
// يستدعي محرّك العمدة الحقيقيّ + محرّك التصويت الحقيقيّ (بمخزن الذاكرة بدل Redis)
// ويحاكي بالضبط تسلسل day.socket: فرز → نافذة → قرار → (تنفيذ | إعادة | تأجيل).
//
// تشغيل: npx tsx src/scripts/test-mayor.ts   (نقي — بلا قاعدة بيانات أو Redis)
// ══════════════════════════════════════════════════════

import { __primeDefsForTest } from '../game/definition-service.js';
import { Role } from '../game/roles.js';
import { Phase, CandidateType } from '../game/state.js';
import { setGameState, getGameState } from '../config/redis.js';
import {
  castVote, getVoteResult, resolveVoting, isVotingComplete,
} from '../game/vote-engine.js';
import {
  initMayorState, isMayorEligible, mayorVoteWeight,
  openMayorWindow, applyMayorVeto, closeMayorWindow,
  rebuildVotingForMayorRevote, mayorRevealPayload, publicMayorInfo,
} from '../game/mayor-engine.js';
import { WinResult } from '../game/win-checker.js';

// ── تجهيز التعريفات (كما في test-game.ts — يلزم checkNeutralVoteWin داخل resolveVoting) ──
const camelize = (o: any) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
__primeDefsForTest({
  abilities: [] as any,
  roles: [
    { id: 'GODFATHER', team: 'MAFIA', abilities: ['KILL'], gen_priority: 1, win_condition_type: null },
    { id: 'MAFIA_REGULAR', team: 'MAFIA', abilities: [], gen_priority: 9, win_condition_type: null },
    { id: 'SHERIFF', team: 'CITIZEN', abilities: [], gen_priority: 1, win_condition_type: null },
    { id: 'DOCTOR', team: 'CITIZEN', abilities: [], gen_priority: 2, win_condition_type: null },
    { id: 'MAYOR', team: 'CITIZEN', abilities: [], gen_priority: 6, win_condition_type: null },
    { id: 'CITIZEN', team: 'CITIZEN', abilities: [], gen_priority: 99, win_condition_type: null },
    { id: 'JESTER', team: 'NEUTRAL', abilities: [], gen_priority: 1, win_condition_type: 'VOTED_OUT' },
  ].map(camelize) as any,
  interactions: [] as any,
});

// ── أدوات ──
let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t: string) { console.log(`\n━━━ ${t} ━━━`); }

function P(physicalId: number, name: string, role: Role, isAlive = true): any {
  return { physicalId, name, phone: null, playerId: physicalId + 1000, role, isAlive, isSilenced: false, justificationCount: 0 };
}

// لعبة 9 لاعبين: #1 شيخ | #2 مافيا | #3 الشريف | #4 الطبيب | #5 🎩 العمدة
// #6 مواطن | #7 مواطن | #8 مواطن | #9 المهرج
function makePlayers(): any[] {
  return [
    P(1, 'الشيخ', Role.GODFATHER),
    P(2, 'مافيا', Role.MAFIA_REGULAR),
    P(3, 'الشريف', Role.SHERIFF),
    P(4, 'الطبيب', Role.DOCTOR),
    P(5, 'العمدة', Role.MAYOR),
    P(6, 'مواطن أ', Role.CITIZEN),
    P(7, 'مواطن ب', Role.CITIZEN),
    P(8, 'مواطن ج', Role.CITIZEN),
    P(9, 'المهرج', Role.JESTER),
  ];
}

function candidatesFor(players: any[]): any[] {
  return players.filter(p => p.isAlive).map(p => ({ type: CandidateType.PLAYER, targetPhysicalId: p.physicalId, votes: 0 }));
}

async function mkRoom(roomId: string, opts: { round?: number; players?: any[]; deals?: any[]; candidates?: any[] } = {}): Promise<any> {
  const players = opts.players || makePlayers();
  const state: any = {
    roomId, roomCode: '1111', phase: Phase.DAY_VOTING, round: opts.round ?? 3,
    config: { maxJustifications: 2, currentJustification: 0, gameName: 'T', maxPlayers: 10, displayPin: '0000', allowMafiaReveal: false, nightMode: 'manual', gameTimerEnabled: false, gameTimerMinutes: 0, useDynamicEngine: true, bombEnabled: true, jesterSurviveRounds: 2 },
    players,
    discussionState: null,
    votingState: {
      totalVotesCast: 0, deals: opts.deals || [], candidates: opts.candidates || candidatesFor(players),
      hiddenPlayersFromVoting: [], tieBreakerLevel: 0, playerVotes: {}, leaderProxyVotes: {},
    },
    nightActions: { godfatherTarget: null, silencerTarget: null, sheriffTarget: null, sheriffResult: null, doctorTarget: null, sniperTarget: null, nurseTarget: null, lastProtectedTarget: null },
    morningEvents: [],
    winner: null,
    performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] },
    playerNightActions: { submitted: {} },
    gameTimer: null,
    createdAt: new Date().toISOString(),
  };
  state.mayorState = initMayorState(state);
  await setGameState(roomId, state);
  return state;
}

// تصويت لاعبٍ كما يفعل معالج player:cast-vote (بالوزن)
async function playerVote(roomId: string, voterId: number, candidateIndex: number) {
  const state = await getGameState(roomId);
  const w = mayorVoteWeight(state, voterId);
  const candidate = state.votingState.candidates[candidateIndex];
  candidate.votes += w;
  state.votingState.totalVotesCast += 1;
  state.votingState.playerVotes[voterId] = candidateIndex;
  await setGameState(roomId, state);
  return state;
}

const idx = (state: any, pid: number) => state.votingState.candidates.findIndex((c: any) => c.targetPhysicalId === pid);

async function run() {
  // ════════ ١) التهيئة والأهليّة ════════
  section('١) التهيئة والأهليّة');
  {
    const s = await mkRoom('m1');
    check('initMayorState يجد العمدة #5', s.mayorState?.mayorPhysicalId === 5);
    check('غير مكشوف وغير مستخدم ابتداءً', s.mayorState.revealed === false && s.mayorState.vetoUsed === false);
    check('مؤهّل وهو حيّ', isMayorEligible(s) === true);

    const noMayor = await mkRoom('m1b', { players: makePlayers().filter(p => p.role !== Role.MAYOR) });
    check('بلا عمدة → mayorState=null وغير مؤهّل', noMayor.mayorState === null && !isMayorEligible(noMayor));

    s.players.find((p: any) => p.physicalId === 5).isAlive = false;
    check('عمدة ميّت → غير مؤهّل', isMayorEligible(s) === false);
    s.players.find((p: any) => p.physicalId === 5).isAlive = true;
    s.players.find((p: any) => p.physicalId === 5).penaltyKicked = true;
    check('عمدة مطرود بالعقوبات → غير مؤهّل', isMayorEligible(s) === false);
  }

  // ════════ ٢) وزن الصوت (قرارا ② و⑥) ════════
  section('٢) وزن الصوت — ×2 بعد الكشف، وتجميد الساحرة');
  {
    const s = await mkRoom('m2');
    check('قبل الكشف: وزن العمدة 1', mayorVoteWeight(s, 5) === 1);
    check('لاعب عاديّ: وزن 1', mayorVoteWeight(s, 6) === 1);

    applyMayorVeto(s, 'REVOTE_TOP2');
    check('بعد الكشف: وزن العمدة 2 (قرار ② — فوريّ)', mayorVoteWeight(s, 5) === 2);
    check('بعد الكشف: بقيّة اللاعبين 1', mayorVoteWeight(s, 6) === 1);

    // ⑥ تعطيل الساحرة يجمّد ×2 خلال جولات التعطيل فقط
    const mayor = s.players.find((p: any) => p.physicalId === 5);
    mayor.disabledUntilRound = s.round;       // معطَّل هذه الجولة
    check('قرار ⑥: معطَّل بالساحرة → وزن 1', mayorVoteWeight(s, 5) === 1);
    mayor.disabledUntilRound = s.round - 1;   // انتهى التعطيل
    check('قرار ⑥: بعد انتهاء التعطيل → وزن 2', mayorVoteWeight(s, 5) === 2);

    mayor.isAlive = false;
    check('عمدة ميّت → وزن 1', mayorVoteWeight(s, 5) === 1);
  }

  // ════════ ٣) castVote بالوزن — عدّادا المرشّح والمصوّتين ════════
  section('٣) castVote(weight): عدّاد المرشّح ×2 وعدّاد المصوّتين ×1');
  {
    const s = await mkRoom('m3');
    applyMayorVeto(s, 'REVOTE_TOP2'); // كشفٌ لتفعيل ×2
    await setGameState('m3', s);

    await castVote('m3', 0, 1, 2);   // وكالة الليدر عن العمدة
    let cur = await getGameState('m3');
    check('votes = 2 بعد صوت العمدة بالوكالة', cur.votingState.candidates[0].votes === 2);
    check('totalVotesCast = 1 (مصوّت واحد)', cur.votingState.totalVotesCast === 1);

    await castVote('m3', 0, -1, 2);  // تراجع بنفس الوزن
    cur = await getGameState('m3');
    check('التراجع يخصم 2 من المرشّح و1 من المصوّتين', cur.votingState.candidates[0].votes === 0 && cur.votingState.totalVotesCast === 0);

    // اكتمال التصويت يقارن مصوّتين ضدّ أحياء — العمدة لا «يستهلك» صوتين من النصاب
    for (const pid of [1, 2, 3, 4, 6, 7, 8, 9]) await playerVote('m3', pid, idx(cur, 6) === -1 ? 0 : idx(cur, 6));
    await playerVote('m3', 5, 0);
    cur = await getGameState('m3');
    check('اكتمال التصويت بـ9 مصوّتين رغم ×2', isVotingComplete(cur) === true && cur.votingState.totalVotesCast === 9);
  }

  // ════════ ٤) المسار الكامل: نافذة → إعادة تصويت بين الأعلى اثنين ════════
  section('٤) REVOTE_TOP2 — النافذة واللقطة وإعادة البناء');
  {
    const s = await mkRoom('m4');
    // 5 أصوات على الشريف(#3)، 3 على الشيخ(#1)، 1 على مواطن(#6)
    for (const pid of [1, 2, 5, 6, 7]) await playerVote('m4', pid, idx(s, 3));
    for (const pid of [3, 4, 8]) await playerVote('m4', pid, idx(s, 1));
    await playerVote('m4', 9, idx(s, 6));

    const sort = await getVoteResult('m4');
    check('فائز واحد: الشريف بـ5 أصوات', sort.type === 'SINGLE_WINNER' && (sort.topCandidates[0] as any).targetPhysicalId === 3 && sort.topVotes === 5);

    const cur = await getGameState('m4');
    check('مؤهّل قبل الفتح', isMayorEligible(cur));
    const win = openMayorWindow(cur, sort.topCandidates[0], sort.topVotes);
    check('لقطة الأعلى اثنين: الشريف ثم الشيخ', (win.top2[0] as any).targetPhysicalId === 3 && (win.top2[1] as any).targetPhysicalId === 1);

    applyMayorVeto(cur, 'REVOTE_TOP2');
    rebuildVotingForMayorRevote(cur, win.top2);
    await setGameState('m4', cur);

    check('مرشَّحان فقط وأصوات صفر', cur.votingState.candidates.length === 2 && cur.votingState.candidates.every((c: any) => c.votes === 0));
    check('دلالات التضييق tieBreakerLevel=2', cur.votingState.tieBreakerLevel === 2);
    check('playerVotes صُفّرت', Object.keys(cur.votingState.playerVotes).length === 0);
    check('الشريف لم يُقتل (لا resolveVoting)', cur.players.find((p: any) => p.physicalId === 3).isAlive === true);
    check('القدرة احترقت والكشف دائم', cur.mayorState.vetoUsed && cur.mayorState.revealed && cur.mayorState.decision === 'REVOTE_TOP2');
    check('النافذة أُغلقت', !cur.mayorState.window);
    check('غير مؤهّل لفيتو ثانٍ (مرّة واحدة)', isMayorEligible(cur) === false);

    // قرار ②: ×2 يسري في إعادة التصويت نفسها
    await playerVote('m4', 5, 0);
    const after = await getGameState('m4');
    check('قرار ②: صوت العمدة في الإعادة نفسها = 2', after.votingState.candidates[0].votes === 2 && after.votingState.totalVotesCast === 1);

    check('الحمولة العلنيّة بعد الكشف صحيحة', JSON.stringify(publicMayorInfo(after)) === JSON.stringify({ revealed: true, physicalId: 5, vetoUsed: true }));
    const payload = mayorRevealPayload(after);
    check('حمولة إعلان الكشف تحمل الاسم والقرار', payload.physicalId === 5 && payload.name === 'العمدة' && payload.decision === 'REVOTE_TOP2');
  }

  // ════════ ٥) التأجيل (قرار ③) — لا موت اليوم ════════
  section('٥) POSTPONE — لا أثر لأيّ إعدام');
  {
    const s = await mkRoom('m5');
    for (const pid of [1, 2, 5, 6, 7]) await playerVote('m5', pid, idx(s, 3));
    const sort = await getVoteResult('m5');
    const cur = await getGameState('m5');
    openMayorWindow(cur, sort.topCandidates[0], sort.topVotes);
    applyMayorVeto(cur, 'POSTPONE');
    await setGameState('m5', cur);

    check('الجميع أحياء بعد التأجيل', cur.players.every((p: any) => p.isAlive));
    check('لا فائز ولا قنبلة معلّقة', cur.winner === null && !cur.pendingBomb);
    check('قرار التأجيل مسجَّل', cur.mayorState.decision === 'POSTPONE' && cur.mayorState.vetoUsed);
  }

  // ════════ ٦) الفيتو على النفس (قرار ①) والمُسكَت (قرار ⑤) ════════
  section('٦) قرارا ① و⑤ — النفس والإسكات');
  {
    const s = await mkRoom('m6');
    for (const pid of [1, 2, 3, 4, 6]) await playerVote('m6', pid, idx(s, 5)); // الحشد على العمدة نفسه!
    const sort = await getVoteResult('m6');
    const cur = await getGameState('m6');
    check('قرار ①: الفائز هو العمدة والنافذة تفتح له', (sort.topCandidates[0] as any).targetPhysicalId === 5 && isMayorEligible(cur));

    cur.players.find((p: any) => p.physicalId === 5).isSilenced = true;
    check('قرار ⑤: الإسكات لا يمنع الأهليّة', isMayorEligible(cur) === true);
  }

  // ════════ ٧) الفيتو على صفقة (قرار ④) ════════
  section('٧) قرار ④ — الصفقات');
  {
    const players = makePlayers();
    const dealCandidate = { type: CandidateType.DEAL, id: 'd1', initiatorPhysicalId: 6, targetPhysicalId: 1, votes: 0 };
    const rest = players.filter(p => p.isAlive && p.physicalId !== 1).map(p => ({ type: CandidateType.PLAYER, targetPhysicalId: p.physicalId, votes: 0 }));
    const s = await mkRoom('m7', { players, candidates: [dealCandidate, ...rest] as any, deals: [{ id: 'd1', initiatorPhysicalId: 6, targetPhysicalId: 1 }] });

    for (const pid of [3, 4, 5, 6, 7]) await playerVote('m7', pid, 0); // الصفقة تكتسح
    const sort = await getVoteResult('m7');
    check('الفائز صفقة', sort.type === 'SINGLE_WINNER' && (sort.topCandidates[0] as any).type === 'DEAL');

    const cur = await getGameState('m7');
    const win = openMayorWindow(cur, sort.topCandidates[0], sort.topVotes);
    applyMayorVeto(cur, 'REVOTE_TOP2');
    rebuildVotingForMayorRevote(cur, win.top2);
    check('قرار ④: الصفقة تبقى مرشّحاً في الإعادة', cur.votingState.candidates.some((c: any) => c.type === 'DEAL'));
    check('طرفا الصفقة أحياء (أُلغي موتهما)', cur.players.find((p: any) => p.physicalId === 1).isAlive && cur.players.find((p: any) => p.physicalId === 6).isAlive);
  }

  // ════════ ٨) المهرج (تفاعل حرج) والتمرير ════════
  section('٨) المهرج: الفيتو يسرقه، والتمرير يمرّره');
  {
    // (أ) فيتو قبل التنفيذ → لا فوز للمهرج
    const s = await mkRoom('m8a');
    for (const pid of [1, 2, 3, 4, 6]) await playerVote('m8a', pid, idx(s, 9)); // الحشد على المهرج (فوزه!)
    const sortA = await getVoteResult('m8a');
    const curA = await getGameState('m8a');
    openMayorWindow(curA, sortA.topCandidates[0], sortA.topVotes);
    applyMayorVeto(curA, 'POSTPONE');
    await setGameState('m8a', curA);
    check('فيتو العمدة يحرم المهرج فوزه (حيّ وبلا winner)', curA.players.find((p: any) => p.physicalId === 9).isAlive && curA.winner === null);

    // (ب) تمرير → resolveVoting الحقيقيّ يمنح المهرج فوزه (round=3 > jesterSurviveRounds=2)
    const s2 = await mkRoom('m8b');
    for (const pid of [1, 2, 3, 4, 6]) await playerVote('m8b', pid, idx(s2, 9));
    const cur2 = await getGameState('m8b');
    closeMayorWindow(cur2); // تمريرٌ صريح
    await setGameState('m8b', cur2);
    const result = await resolveVoting('m8b');
    check('التمرير يبقي مسار المهرج سليماً (فوز مهرج)', (result as any).neutralWin?.won === true);
    const after2 = await getGameState('m8b');
    check('المهرج أُقصي فعلاً بعد التمرير', after2.players.find((p: any) => p.physicalId === 9).isAlive === false);
  }

  // ════════ ٩) الشيخ والقنبلة: الفيتو يمنعها والتمرير يفجّرها ════════
  section('٩) قنبلة الشيخ');
  {
    const s = await mkRoom('m9');
    for (const pid of [3, 4, 5, 6, 7]) await playerVote('m9', pid, idx(s, 1)); // الحشد على الشيخ
    const sort = await getVoteResult('m9');
    const cur = await getGameState('m9');
    openMayorWindow(cur, sort.topCandidates[0], sort.topVotes);
    applyMayorVeto(cur, 'POSTPONE');
    await setGameState('m9', cur);
    check('الفيتو: الشيخ حيّ ولا pendingBomb', cur.players.find((p: any) => p.physicalId === 1).isAlive && !cur.pendingBomb);

    const s2 = await mkRoom('m9b');
    for (const pid of [3, 4, 5, 6, 7]) await playerVote('m9b', pid, idx(s2, 1));
    await resolveVoting('m9b');
    const after = await getGameState('m9b');
    check('التمرير: القنبلة معلّقة كالمعتاد', !!after.pendingBomb && after.pendingBomb.godfatherPhysicalId === 1);
  }

  // ════════ ١٠) التعادل (قرار ⑦) ════════
  section('١٠) قرار ⑦ — لا نافذة عند التعادل');
  {
    const s = await mkRoom('m10');
    for (const pid of [1, 2, 3]) await playerVote('m10', pid, idx(s, 6));
    for (const pid of [4, 5, 7]) await playerVote('m10', pid, idx(s, 8));
    const sort = await getVoteResult('m10');
    check('الفرز يعيد TIE (حارس السوكيت لن يفتح النافذة)', sort.type === 'TIE' && sort.topCandidates.length === 2);
  }

  // ════════ ١١) عقود السفّاح (قرار ⑧) ════════
  section('١١) قرار ⑧ — العمدة ضمن مجمّع العقود');
  {
    const { ROLE_NAMES_AR, SPECIAL_ROLES } = await import('../game/state.js') as any;
    check('MAYOR ضمن SPECIAL_ROLES', SPECIAL_ROLES.includes('MAYOR') && ROLE_NAMES_AR.MAYOR === 'العمدة');
  }

  // ── الخلاصة ──
  console.log(`\n════════════════════════════`);
  console.log(`النتيجة: ✅ ${pass} ناجح — ❌ ${fail} فاشل`);
  if (failures.length) { console.log('الفشل:'); failures.forEach(f => console.log(`  • ${f}`)); process.exit(1); }
  process.exit(0);
}

run().catch(e => { console.error('💥', e); process.exit(1); });
