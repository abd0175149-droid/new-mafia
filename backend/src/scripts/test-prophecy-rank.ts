// ══════════════════════════════════════════════════════
// 🧪 موسم النبوءة · المرحلة ٨ — مكافآت المهارة وسجلّ المخطوطتين و«مخطوطتك»
//
// تشغيل: npx tsx src/scripts/test-prophecy-rank.ts — دوالّ نقيّة، بلا قاعدة ولا Redis.
// القيد الثابت: مجموعُ بنود التفصيل = المجموع المسجَّل (كاختبار ملخّص النقاط)، وبلا الموسم
// لا يتغيّر التفصيل حرفاً.
// ══════════════════════════════════════════════════════
import { prophecySkillsFor, scrollMarksFor, prophecyLedgerLine } from '../game/prophecy-skills.js';
import { computeMatchReward, computeMatchBreakdown } from '../services/progression.service.js';
import { DEFAULT_CONFIG } from '../routes/progression-settings.routes.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const section = (t: string) => console.log(`\n━━━ ${t} ━━━`);
const P = (seat: number, role: string, alive = true): any => ({ physicalId: seat, name: `#${seat}`, playerId: 100 + seat, role, isAlive: alive });
const V = (...seats: number[]) => seats.map(s => ({ voterPhysicalId: s, name: `#${s}`, weight: 1 }));

function game(opts: { outcome?: string | null; masks?: any[]; winner?: string; kafala?: any; withVote?: boolean } = {}): any {
  const st: any = {
    winner: opts.winner ?? 'CITIZEN', round: 4,
    players: [P(1, 'GODFATHER'), P(2, 'MAFIA_REGULAR'), P(3, 'DECEIVER'), P(4, 'ORACLE'), P(5, 'CITIZEN'), P(6, 'CITIZEN'), P(7, 'CITIZEN'), P(8, 'CITIZEN'), P(9, 'GUARANTOR')],
    performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] },
    oracleState: opts.outcome === undefined ? null : { oraclePhysicalId: 4, used: true, dealRound: 3, outcome: opts.outcome, boxes: { aPhysicalId: 2, bPhysicalId: 6, mafiaBox: 'A' }, chosenBox: 'A', seenPhysicalId: 2 },
    deceiverState: opts.masks ? { deceiverPhysicalId: 3, masksLeft: 0, masks: opts.masks } : null,
    guarantorState: opts.kafala ? { guarantorPhysicalId: 9, used: true, result: opts.kafala } : null,
    voteHistory: [],
  };
  if (opts.withVote !== false && st.oracleState) {
    st.voteHistory.push({ id: 'v1', round: 3, seq: 1, kind: 'DAY', candidates: [
      { type: 'DEAL', kind: 'PROPHECY', targetPhysicalId: 2, voters: V(5, 6, 7), votes: 3, people: 3, unnamed: 0, name: '#2' },
      { type: 'PLAYER', targetPhysicalId: 8, voters: V(1, 3), votes: 2, people: 2, unnamed: 0, name: '#8' },
    ], outcome: { type: 'ELIMINATED', eliminated: [2], viaDeal: true } });
  }
  return st;
}

section('مكافآت المهارة');
{
  const s = game({ outcome: 'TRUE' });
  check('العرّاف: نبوءةٌ صادقة', prophecySkillsFor(s, 4).prophecyTrue === 1);
  check('غيره لا', prophecySkillsFor(s, 5).prophecyTrue === 0);
  check('صوّت مع الصادقة (٥ و٦ و٧)', [5, 6, 7].every(x => prophecySkillsFor(s, x).prophecyVoteRight === 1));
  check('صوّت لغيرها حين صدقت — لا', prophecySkillsFor(s, 1).prophecyVoteRight === 0 && prophecySkillsFor(s, 8).prophecyVoteRight === 0);
  const f = game({ outcome: 'FALSE' });
  check('كاذبة: من صوّت لغيرها (١ و٣) صائب', prophecySkillsFor(f, 1).prophecyVoteRight === 1 && prophecySkillsFor(f, 3).prophecyVoteRight === 1);
  check('كاذبة: من صوّت لها لا', prophecySkillsFor(f, 5).prophecyVoteRight === 0);
  check('كاذبة: العرّاف بلا مكافأة', prophecySkillsFor(f, 4).prophecyTrue === 0);
  const w = game({ outcome: 'WITHDRAWN', withVote: false });
  check('مسحوبة: لا شيء لأحد', [4, 5, 1].every(x => { const k = prophecySkillsFor(w, x); return !k.prophecyTrue && !k.prophecyVoteRight; }));
}
{
  // تلفيقٌ نافذ: قُرئ القناع على ٦ في الجولة ٢، وأُعدم ٦ بالتصويت في الجولة ٣
  const s = game({ masks: [{ targetPhysicalId: 6, placedRound: 2, burned: true, burnedRound: 2, burnedBy: 'SHERIFF', shownAs: 'MAFIA' }] });
  s.performanceTracking.eliminationLog.push({ physicalId: 6, eliminatedBy: 'DAY_VOTE', round: 3, team: 'CITIZEN' });
  s.players[5].isAlive = false;
  s.voteHistory.push({ id: 'v2', round: 3, seq: 2, kind: 'DAY', candidates: [{ type: 'PLAYER', targetPhysicalId: 6, voters: V(1, 5, 7), votes: 3, people: 3, unnamed: 0, name: '#6' }], outcome: { type: 'ELIMINATED', eliminated: [6] } });
  check('المُضلّل: تلفيقٌ نافذ', prophecySkillsFor(s, 3).frameLanded === 1);
  const late = game({ masks: [{ targetPhysicalId: 6, placedRound: 2, burned: true, burnedRound: 2, burnedBy: 'SHERIFF', shownAs: 'MAFIA' }] });
  late.performanceTracking.eliminationLog.push({ physicalId: 6, eliminatedBy: 'DAY_VOTE', round: 6, team: 'CITIZEN' });
  check('بعد يومين لا يُحسب', prophecySkillsFor(late, 3).frameLanded === 0);
  const lifted = game({ masks: [{ targetPhysicalId: 6, placedRound: 2, burned: false, lifted: true }] });
  check('قناعٌ سقط بالعبور لا يُحسب', prophecySkillsFor(lifted, 3).frameLanded === 0);
  const m = scrollMarksFor(s);
  check('«مخطوطتك»: من أعدم المقنَّع صدّق القناع', m.get(1)?.mask === 1 && m.get(5)?.mask === 1 && m.get(7)?.mask === 1 && !m.get(8));
}
{
  const t = scrollMarksFor(game({ outcome: 'TRUE' }));
  check('«مخطوطتك»: مع الصادقة صدق', t.get(5)?.truth === 1 && t.get(6)?.truth === 1 && !t.get(1));
  const f = scrollMarksFor(game({ outcome: 'FALSE' }));
  check('«مخطوطتك»: مع الكاذبة قناع، وضدّها صدق', f.get(5)?.mask === 1 && f.get(1)?.truth === 1);
  check('بلا الموسم لا علامات', scrollMarksFor({ players: [], voteHistory: [] } as any).size === 0);
}

section('النقاط والقيد الثابت');
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + (Number(b) || 0), 0);
const base = { winner: 'CITIZEN', survivedToEnd: true, roundsSurvived: 4, successfulDealsCount: 0, failedDealsCount: 0, mafiaDealOnMafiaCount: 0, abilityCorrectCount: 0, abilityIncorrectCount: 0, teamEliminationBonus: 15, assassinContractsCompleted: 0 };
{
  const a = computeMatchReward({ ...base, role: 'ORACLE' } as any, DEFAULT_CONFIG);
  const b = computeMatchReward({ ...base, role: 'ORACLE', prophecyTrueCount: 1, prophecyVoteRightCount: 1 } as any, DEFAULT_CONFIG);
  const cx: any = DEFAULT_CONFIG.xp, cr: any = DEFAULT_CONFIG.rr;
  check('نبوءةٌ صادقة + صوتٌ صائب تُضاف بالإعدادات', b.xpEarned - a.xpEarned === cx.prophecyTrue + cx.prophecyVoteRight && b.rrChange - a.rrChange === cr.prophecyTrue + cr.prophecyVoteRight, JSON.stringify({ a, b }));
  const twice = computeMatchReward({ ...base, role: 'CITIZEN', prophecyVoteRightCount: 3 } as any, DEFAULT_CONFIG);
  const once = computeMatchReward({ ...base, role: 'CITIZEN', prophecyVoteRightCount: 1 } as any, DEFAULT_CONFIG);
  check('الصوت الصائب مرّةً في المباراة', twice.rrChange === once.rrChange);
  const dec = computeMatchReward({ ...base, winner: 'MAFIA', role: 'DECEIVER', frameLandedCount: 2 } as any, DEFAULT_CONFIG);
  const dec0 = computeMatchReward({ ...base, winner: 'MAFIA', role: 'DECEIVER' } as any, DEFAULT_CONFIG);
  check('تلفيقان نافذان', dec.rrChange - dec0.rrChange === 2 * cr.frameLanded);
}
{
  let bad = 0, n = 0;
  const roles = ['ORACLE', 'CITIZEN', 'DECEIVER', 'MAFIA_REGULAR', 'DIVIDED', 'GUARANTOR', 'SHERIFF'];
  for (let i = 0; i < 400; i++) {
    const o: any = {
      ...base, role: roles[i % roles.length], winner: i % 3 ? 'CITIZEN' : 'MAFIA', survivedToEnd: i % 2 === 0, roundsSurvived: i % 6,
      successfulDealsCount: i % 2, failedDealsCount: (i >> 1) % 2, abilityCorrectCount: i % 3, teamEliminationBonus: (i % 4) * 15,
      prophecyTrueCount: i % 5 === 0 ? 1 : 0, prophecyVoteRightCount: i % 2, frameLandedCount: i % 7 === 0 ? 1 : 0,
    };
    const r = computeMatchReward(o, DEFAULT_CONFIG); const b = computeMatchBreakdown(o, DEFAULT_CONFIG);
    n++;
    if (sum(b.rr) !== r.rrChange) bad++;
    if (r.xpEarned > 0 && sum(b.xp) !== r.xpEarned) bad++;
  }
  check(`مجموع البنود = المسجَّل (${n} حالة)`, bad === 0, String(bad));
}
{
  const o: any = { ...base, role: 'CITIZEN' };
  const k = Object.keys(computeMatchBreakdown(o, DEFAULT_CONFIG).rr).join(',');
  check('بلا الموسم: بنود التفصيل كما كانت (لا مفاتيح جديدة)', !/prophecy|frame/.test(k), k);
}

section('سطر السجلّ');
{
  check('بلا الموسم: لا سطر', prophecyLedgerLine({ players: [] } as any) === null);
  check('صادقة ⇒ مخطوطة الصدق', prophecyLedgerLine(game({ outcome: 'TRUE', winner: 'MAFIA' }))?.line === 'TRUTH');
  check('كاذبة ⇒ مخطوطة القناع', prophecyLedgerLine(game({ outcome: 'FALSE', winner: 'CITIZEN' }))?.line === 'MASK');
  check('تعادل ⇒ يكتبه الفائز: المدينة ⇒ الصدق', prophecyLedgerLine(game({ outcome: 'NOT_PASSED', winner: 'CITIZEN' }))?.line === 'TRUTH');
  check('تعادل ⇒ المافيا ⇒ القناع', prophecyLedgerLine(game({ outcome: 'NOT_PASSED', winner: 'MAFIA' }))?.line === 'MASK');
  check('كاذبة + كفالةٌ أنقذت ⇒ تعادل ⇒ الفائز', prophecyLedgerLine(game({ outcome: 'FALSE', winner: 'CITIZEN', kafala: { outcome: 'SAVED' } }))?.line === 'TRUTH');
  const w = prophecyLedgerLine(game({ outcome: 'WITHDRAWN', withVote: false }));
  check('المسحوبة في عمود «ما سُحب»', w?.withdrawn === 1);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} نجح · ${fail} فشل`);
if (fail) { console.log(failures.map(f => '   • ' + f).join('\n')); process.exit(1); }
process.exit(0);
