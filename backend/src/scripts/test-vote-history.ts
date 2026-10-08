// ══════════════════════════════════════════════════════
// 🧪 سجلّ التصويت — اللقطة والختم وتتبّع المقاعد (نقي: بلا قاعدة ولا Redis)
// تشغيل: npx tsx src/scripts/test-vote-history.ts
// ══════════════════════════════════════════════════════
import { recordVoteRound, stampWithdrawals, stampVoteOutcome, stampRevealOutcome, VOTE_HISTORY_CAP } from '../game/vote-history.js';
import { remapPhysicalIds } from '../game/seat-remap.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const section = (t: string) => console.log(`\n━━━ ${t} ━━━`);
const NAMES: Record<number, string> = { 1: 'ريم', 2: 'سامي', 3: 'عمر', 4: 'لينا', 5: 'خالد', 6: 'نور', 7: 'يوسف', 8: 'هبة', 9: 'طارق', 10: 'دانة' };

function game(): any {
  return {
    round: 1, phase: 'DAY_VOTING', config: {},
    players: Object.entries(NAMES).map(([s, n]) => ({ physicalId: Number(s), name: n, isAlive: true, role: 'CITIZEN' })),
    mayorState: { mayorPhysicalId: 4, revealed: false, vetoUsed: false },
    votingState: { candidates: [], playerVotes: {}, leaderProxyVotes: {}, totalVotesCast: 0, deals: [], hiddenPlayersFromVoting: [], tieBreakerLevel: 0 },
  };
}
// يحاكي ما تفعله مسارات التصويت القائمة: votes بالوزن، voters بالأشخاص
function vote(s: any, voter: number | null, ci: number, opts: { proxy?: boolean; weight?: number } = {}) {
  const c = s.votingState.candidates[ci]; const w = opts.weight ?? 1;
  c.votes += w; c.voters = (c.voters || 0) + 1;
  if (voter != null) { s.votingState.playerVotes[voter] = ci; if (opts.proxy) s.votingState.leaderProxyVotes[voter] = ci; }
}
const P = (t: number) => ({ type: 'PLAYER', targetPhysicalId: t, votes: 0, voters: 0 });

section('١) جولةٌ بعدٍّ يدويّ وسحبٍ لم يكفِ');
{
  const s = game();
  s.votingState.candidates = [P(3), P(7), P(8)];
  for (const v of [1, 5, 7, 8]) vote(s, v, 0);
  vote(s, null, 0);                       // الموجّه عدّ يداً بلا اسم
  for (const v of [2, 6, 10]) vote(s, v, 1);
  for (const v of [3, 4]) vote(s, v, 2);
  const r = recordVoteRound(s);
  const c3 = r.candidates[0];
  check('اليوم ١: نوعها «تصويت النهار» ومعرّفها r1-1', r.kind === 'DAY' && r.id === 'r1-1');
  check('عمر: ٥ أصوات من ٥ أشخاص، ٤ بأسمائهم و١ بلا اسم', c3.votes === 5 && c3.people === 5 && c3.voters.length === 4 && c3.unnamed === 1, JSON.stringify(c3));
  check('المصوّتون بأسمائهم ومرتّبون', c3.voters.map(v => v.voterPhysicalId).join(',') === '1,5,7,8' && c3.voters[0].name === 'ريم');
  stampWithdrawals(s, [7]);
  s.pendingResolution = { eliminated: [3], type: 'ELIMINATION' };
  stampRevealOutcome(s);
  check('مَن سحب: يوسف', r.withdrawn.join(',') === '7');
  check('النتيجة مع الكشف: أُقصي عمر بلا دوره', r.outcome?.type === 'ELIMINATED' && r.outcome.eliminated?.join(',') === '3' && r.outcome.names?.[0] === 'عمر' && !JSON.stringify(r).includes('CITIZEN'));
  s.voteHistoryProbe = s.voteHistory;
}

section('٢) وكالة وديل وتعادل ثمّ حصر وسحبٌ ناجح وإعادة');
{
  const s = game();
  s.round = 2;
  s.votingState.candidates = [P(7), P(10), { type: 'DEAL', id: 'd1', initiatorPhysicalId: 4, targetPhysicalId: 8, votes: 0, voters: 0 }];
  vote(s, 2, 0); vote(s, 9, 0, { proxy: true }); vote(s, 10, 0);
  for (const v of [5, 6, 7]) vote(s, v, 1);
  vote(s, 4, 2); vote(s, 8, 2);
  const a = recordVoteRound(s);
  check('الوكالة: طارق بعلامة proxy', a.candidates[0].voters.find(v => v.voterPhysicalId === 9)?.via === 'proxy');
  check('الديل بطرفيه', a.candidates[2].type === 'DEAL' && a.candidates[2].initiatorName === 'لينا' && a.candidates[2].name === 'هبة');
  check('صوتُ صاحب الديل عليه ليس «عقوبة»', !a.candidates[2].voters.some(v => v.via === 'auto'));
  stampVoteOutcome(s, { type: 'TIE' });
  stampVoteOutcome(s, { type: 'TIE_NARROW' });
  check('التعادل ثمّ قرار الحصر يُكتب فوقه', a.outcome?.type === 'TIE_NARROW');

  // جولة الحصر
  s.votingState = { ...s.votingState, candidates: [P(7), P(10)], playerVotes: {}, leaderProxyVotes: {}, tieBreakerLevel: 2 };
  for (const v of [2, 4, 8, 10]) vote(s, v, 0); vote(s, 9, 0, { proxy: true });
  for (const v of [5, 6, 7]) vote(s, v, 1);
  const b = recordVoteRound(s);
  check('الجولة الثانية: «حصر» r2-2', b.kind === 'TIE_NARROW' && b.id === 'r2-2' && b.seq === 2);
  // فرزٌ مكرّر للجولة نفسها لا يضيف جولة
  const again = recordVoteRound(s);
  check('فرزٌ مكرّر للجولة نفسها يستبدلها ولا يضيف', again === b && s.voteHistory.length === 2);
  stampWithdrawals(s, [8, 2, 4]);
  stampVoteOutcome(s, { type: 'WITHDRAWN', withdrawnVotes: 3, neededVotes: 3 });

  s.votingState = { ...s.votingState, candidates: [P(10), P(5), P(7)], playerVotes: {}, leaderProxyVotes: {}, tieBreakerLevel: 0 };
  for (const v of [2, 4, 5, 6, 8]) vote(s, v, 0); vote(s, 7, 1); vote(s, 10, 1); vote(s, 9, 2, { proxy: true });
  const c = recordVoteRound(s);
  check('بعد السحب: «إعادة بعد السحب» r2-3', c.kind === 'WITHDRAWAL_REVOTE' && c.id === 'r2-3');
  check('جولةُ الحصر احتفظت بمن سحب مرتّباً', b.withdrawn.join(',') === '2,4,8' && b.outcome?.type === 'WITHDRAWN');
}

section('٣) عقوبة الوقت والعمدة قبل كشفه وبعده');
{
  const s = game();
  s.round = 3;
  s.votingState.candidates = [P(2), P(5), P(9)];
  for (const v of [5, 6, 7]) vote(s, v, 0); vote(s, 2, 1); vote(s, 4, 1); vote(s, 9, 2);
  const a = recordVoteRound(s);
  check('صوتُ طارق على نفسه = عقوبة الوقت', a.candidates[2].voters[0].via === 'auto');
  check('العمدة قبل كشفه بوزن ١', a.candidates[1].voters.find(v => v.voterPhysicalId === 4)?.weight === 1);
  stampVoteOutcome(s, { type: 'MAYOR_SAVED', savedPhysicalId: 2, savedName: 'سامي' });

  s.mayorState.revealed = true;
  s.mayorShield = { physicalId: 2, round: 3 };
  s.votingState = { ...s.votingState, candidates: [P(5), P(6), P(7)], playerVotes: {}, leaderProxyVotes: {}, mayorRevote: true };
  vote(s, 4, 0, { weight: 2 }); vote(s, 7, 0); vote(s, 9, 0); vote(s, 2, 1); vote(s, 5, 1); vote(s, 6, 2);
  const b = recordVoteRound(s);
  check('«إعادة بأمر العمدة» وسامي محميّ', b.kind === 'MAYOR_REVOTE' && b.shieldedPhysicalId === 2);
  const k = b.candidates[0];
  check('خالد: ٤ أصوات من ٣ أشخاص، لينا ×٢', k.votes === 4 && k.people === 3 && k.voters.find(v => v.voterPhysicalId === 4)?.weight === 2, JSON.stringify(k));
  s.pendingResolution = { type: 'MAYOR_POSTPONED', eliminated: [] };
  stampRevealOutcome(s);
  check('تأجيل العمدة نتيجةٌ بلا موت', b.outcome?.type === 'MAYOR_POSTPONED' && !b.outcome.eliminated);
}

section('٤) إقصاء الجميع وإعادةٌ بلا نتيجة وسقف السجلّ');
{
  const s = game();
  s.votingState.candidates = [P(1), P(2)];
  vote(s, 3, 0); vote(s, 4, 1);
  recordVoteRound(s);
  stampVoteOutcome(s, { type: 'TIE_ELIMINATE_ALL' });
  s.pendingResolution = { type: 'ELIMINATE_ALL', eliminated: [1, 2] };
  stampRevealOutcome(s);
  check('إقصاء الجميع يبقى نوعَه ويُضاف إليه المُقصَون', s.voteHistory[0].outcome.type === 'TIE_ELIMINATE_ALL' && s.voteHistory[0].outcome.eliminated.join(',') === '1,2');

  s.round = 2;
  s.votingState = { ...s.votingState, candidates: [P(5)], playerVotes: {}, leaderProxyVotes: {} };
  vote(s, 6, 0); recordVoteRound(s);
  s.votingState = { ...s.votingState, candidates: [P(7)], playerVotes: {}, leaderProxyVotes: {} };
  vote(s, 6, 0); const r = recordVoteRound(s);
  check('جولةٌ تُركت بلا نتيجة تُختم «أُعيدت» والجديدة «إعادة»', s.voteHistory[1].outcome?.type === 'RESTARTED' && r.kind === 'RESTART');

  for (let i = 0; i < VOTE_HISTORY_CAP + 5; i++) {
    s.round = 10 + i;
    s.votingState = { ...s.votingState, candidates: [P(5)], playerVotes: {}, leaderProxyVotes: {} };
    vote(s, 6, 0); recordVoteRound(s);
  }
  check(`السجلّ لا يتجاوز ${VOTE_HISTORY_CAP} جولة`, s.voteHistory.length === VOTE_HISTORY_CAP);
}

section('٥) نقل المقاعد يحمل السجلّ مع أصحابه');
{
  const s = game();
  s.round = 2;
  s.votingState.candidates = [P(3), { type: 'DEAL', id: 'd', initiatorPhysicalId: 7, targetPhysicalId: 3, votes: 0, voters: 0 }];
  vote(s, 7, 0); vote(s, 9, 1);
  recordVoteRound(s);
  stampWithdrawals(s, [7]);
  s.mayorShield = { physicalId: 3, round: 2 };
  s.voteHistory[0].shieldedPhysicalId = 3;
  s.pendingResolution = { eliminated: [3], type: 'ELIMINATION' };
  stampRevealOutcome(s);
  remapPhysicalIds(s, new Map([[3, 7], [7, 3]]));
  const h = s.voteHistory[0];
  check('المرشّح تبع صاحبه 3→7 والاسمُ باقٍ', h.candidates[0].targetPhysicalId === 7 && h.candidates[0].name === 'عمر');
  check('المصوّت تبعه 7→3', h.candidates[0].voters[0].voterPhysicalId === 3 && h.candidates[0].voters[0].name === 'يوسف');
  check('طرفا الديل', h.candidates[1].initiatorPhysicalId === 3 && h.candidates[1].targetPhysicalId === 7);
  check('مَن سحب والمحميّ والمُقصى', h.withdrawn.join(',') === '3' && h.shieldedPhysicalId === 7 && h.outcome.eliminated.join(',') === '7');
}

section('٦) لا يمسّ حالة التصويت');
{
  const s = game();
  s.votingState.candidates = [P(3)];
  vote(s, 5, 0);
  const before = JSON.stringify(s.votingState);
  recordVoteRound(s); stampWithdrawals(s, [5]); stampVoteOutcome(s, { type: 'TIE' });
  check('votingState كما كان حرفيّاً', JSON.stringify(s.votingState) === before);
  const empty = game();
  check('بلا سجلّ: الختمُ لا يفعل شيئاً ولا يرمي', stampVoteOutcome(empty, { type: 'TIE' }) === false && stampRevealOutcome(empty) === false);
}

console.log(`\nالنتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
if (fail) { console.log('\nالفاشلة:'); failures.forEach(f => console.log('  • ' + f)); process.exit(1); }
