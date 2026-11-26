// ══════════════════════════════════════════════════════
// 🧪 موسم النبوءة · المرحلة ١٠ — مبارياتٌ آليّة كاملة على المحرّك الحقيقيّ
//
// تشغيل: npx tsx src/scripts/test-prophecy-sim.ts [عدد المباريات=300]
// بلا قاعدة ولا Redis (مخزن الذاكرة). كلّ مباراة ١٨ لاعباً بالكروت الخمسة، واختياراتٌ عشوائيّة:
// الليل بحلّه الحقيقيّ (resolveNightDynamic) والنهار بتصويته الحقيقيّ (resolveVoting)، والعرّاف
// يطلب صندوقاً، والمنقسم يختار أو لا يختار، والكفيل يكفل أحياناً، والقارئة تكشف وتختم.
//
// الثوابت المفحوصة في كلّ خطوة:
//   • لا استثناء، وكلّ مباراةٍ تنتهي بفائز قبل ٢٠ جولة
//   • لا قناعَ قائماً على مافيا أبداً (قرار ٩)
//   • المنقسم يعبر مرّةً على الأكثر، والعابر «مافيا عادي»
//   • لكلّ مباراةٍ سطرٌ في سجلّ المخطوطتين، ونبوءةٌ صادقةٌ واحدةٌ على الأكثر
//   • العدّاد العلنيّ يُحسب بلا خطأ في كلّ طور
// ويُطبع آخرها ملخّص المقاييس كصفحة الإدارة — وفيها مباراةٌ عبر فيها المنقسم وأخرى بقي.
// ══════════════════════════════════════════════════════
import { primeTestDefs } from './_game-fixtures.js';
import { __primeDefsForTest, getAbilityDefs, getRoleDefs } from '../game/definition-service.js';
import { setGameState, getGameState } from '../config/redis.js';
import { resolveNightDynamic, createDynamicNightState, actionKey } from '../game/dynamic-night-resolver.js';
import { killHolderSeat } from '../game/night-plan.js';
import { resolveVoting } from '../game/vote-engine.js';
import { initDeceiverState, activeMaskOn } from '../game/deceiver-engine.js';
import { initOracleState, requestOpen, placeProphecyDeal, prophecyOwnerSeat } from '../game/oracle-engine.js';
import { initCupState, requestPublicCup, requestSeal } from '../game/cup-engine.js';
import { initDividedState, chooseSide, markDividedAnnounced } from '../game/divided-engine.js';
import { initGuarantorState, kafalaEligible, openKafalaWindow, applyKafala } from '../game/guarantor-engine.js';
import { publicTeamCounts } from '../game/public-counts.js';
import { prophecyLedgerLine, prophecySkillsFor } from '../game/prophecy-skills.js';
import { checkWinCondition } from '../game/win-checker.js';
import { isMafiaRole, Role } from '../game/roles.js';

const N = Number(process.argv[2]) || 300;
let seed = 20261126;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a: any[]): any => a[Math.floor(rnd() * a.length)];
Math.random = rnd;   // قرعة الصناديق أيضاً — مباريات قابلة للإعادة

const violations: string[] = [];
const bad = (g: number, msg: string) => { if (violations.length < 30) violations.push(`#${g}: ${msg}`); };

function table(): any[] {
  const roles = ['GODFATHER', 'MAFIA_REGULAR', 'DECEIVER', 'SILENCER', 'CHAMELEON',
    'SHERIFF', 'DOCTOR', 'SNIPER', 'ORACLE', 'MAYOR', 'DIVIDED', 'GUARANTOR',
    'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'JESTER', 'CUP_READER'];
  for (let i = roles.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [roles[i], roles[j]] = [roles[j], roles[i]]; }
  return roles.map((role, i) => ({ physicalId: i + 1, name: `#${i + 1}`, phone: null, playerId: 500 + i, role, isAlive: true, isSilenced: false, justificationCount: 0 }));
}

const alive = (s: any) => s.players.filter((p: any) => p.isAlive);
const seatOf = (s: any, role: string) => s.players.find((p: any) => p.role === role)?.physicalId as number | undefined;

async function playOne(g: number, stats: any) {
  const roomId = `sim${g}`;
  const s: any = {
    roomId, players: table(), round: 1, phase: 'DAY_DISCUSSION',
    config: { bombEnabled: true, jesterSurviveRounds: 1, useDynamicEngine: true, witchDisableRounds: 3, prophecy: true, oracleTestament: true },
    performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] },
    votingState: { candidates: [], deals: [], totalVotesCast: 0, hiddenPlayersFromVoting: [], tieBreakerLevel: 0, playerVotes: {} },
    twinState: null, witchPreviousTargets: [], assassinState: null, assassinRivals: null, nurseActivated: false, winner: null,
    dynamicNightState: { actions: {}, lastTargets: {} }, morningEvents: [], voteHistory: [],
  };
  s.deceiverState = initDeceiverState(s); s.oracleState = initOracleState(s); s.cupState = initCupState(s);
  s.dividedState = initDividedState(s); s.guarantorState = initGuarantorState(s);
  let prev = createDynamicNightState();
  let state: any = s;

  for (let round = 1; round <= 20; round++) {
    // ═══ النهار (الجولة ١ بلا ليلٍ قبله) ═══
    if (round > 1) {
      state.round = round; state.phase = 'NIGHT';
      const bag = createDynamicNightState(prev);
      const add = (by: number | undefined, ab: string, t: number | null) => {
        if (by == null) return;
        const a = { abilityId: ab, performerPhysicalId: by, targetPhysicalId: t, skipped: t == null };
        bag.actions[actionKey(a)] = a;
      };
      const living = alive(state);
      const nonMafia = living.filter((p: any) => !isMafiaRole(p.role as Role));
      // المنقسم في الليلة الثانية: ٤٥٪ يعبر، ٤٠٪ يبقى، ١٥٪ لا يختار
      const dv = state.dividedState;
      if (dv && round === 3) {
        const x = rnd();
        if (x < 0.45) chooseSide(state, dv.dividedPhysicalId, 'MAFIA'); else if (x < 0.85) chooseSide(state, dv.dividedPhysicalId, 'CITY');
      }
      const holder = killHolderSeat(state);
      if (holder != null && nonMafia.length) add(holder, 'KILL', pick(nonMafia).physicalId);
      const sh = living.find((p: any) => p.role === 'SHERIFF'); if (sh) add(sh.physicalId, 'INVESTIGATE', pick(living.filter((p: any) => p.physicalId !== sh.physicalId)).physicalId);
      const dr = living.find((p: any) => p.role === 'DOCTOR'); if (dr) add(dr.physicalId, 'PROTECT', pick(living.filter((p: any) => p.physicalId !== dr.physicalId)).physicalId);
      const si = living.find((p: any) => p.role === 'SILENCER'); if (si) add(si.physicalId, 'SILENCE', pick(living).physicalId);
      const sn = living.find((p: any) => p.role === 'SNIPER'); if (sn && rnd() < 0.25) add(sn.physicalId, 'SNIPE', pick(living.filter((p: any) => p.physicalId !== sn.physicalId)).physicalId);
      const de = living.find((p: any) => p.role === 'DECEIVER');
      if (de && state.deceiverState?.masksLeft > 0 && round === 2 && nonMafia.length) add(de.physicalId, 'MASK', pick(nonMafia).physicalId);
      const cr = living.find((p: any) => p.role === 'CUP_READER');
      if (cr) { if (rnd() < 0.15) requestPublicCup(state, cr.physicalId, true); add(cr.physicalId, 'READ_CUP', pick(living.filter((p: any) => p.physicalId !== cr.physicalId)).physicalId); }
      const c = state.cupState;
      if (c?.departed && c.sealAvailable && round > (c.departedRound || 0)) requestSeal(state, c.readerPhysicalId, pick(living).physicalId);
      const or = living.find((p: any) => p.role === 'ORACLE');
      if (or && round >= 3 && !state.oracleState?.used && rnd() < 0.6) requestOpen(state, or.physicalId, rnd() < 0.5 ? 'A' : 'B');

      const ev = await resolveNightDynamic(state, bag);
      prev = bag;
      // ثابت: لا قناعَ قائماً على مافيا
      for (const p of state.players) if (isMafiaRole(p.role as Role) && activeMaskOn(state, p.physicalId)) bad(g, `قناعٌ قائم على مافيا #${p.physicalId}`);
      state.morningEvents = ev;
      for (const e of ev) e.revealed = true;
      markDividedAnnounced(state);
      try { publicTeamCounts(state); } catch (e: any) { bad(g, `العدّاد: ${e.message}`); }
      if ((checkWinCondition(state) as any) !== 'CONTINUE') { state.winner = String(checkWinCondition(state)).startsWith('MAFIA') ? 'MAFIA' : 'CITIZEN'; break; }
    }

    // ═══ التصويت ═══
    state.phase = 'DAY_JUSTIFICATION';
    state.votingState = { candidates: [], deals: [], totalVotesCast: 0, hiddenPlayersFromVoting: [], tieBreakerLevel: 0, playerVotes: {} };
    placeProphecyDeal(state);
    const living = alive(state);
    if (living.length < 3) break;
    const pd = (state.votingState.deals || []).find((d: any) => d.kind === 'PROPHECY');
    const other = pick(living);
    const cands: any[] = [];
    if (pd && rnd() < 0.65) cands.push({ type: 'DEAL', id: pd.id, kind: 'PROPHECY', initiatorPhysicalId: 0, targetPhysicalId: pd.targetPhysicalId, votes: 7, voters: 7 });
    cands.push({ type: 'PLAYER', targetPhysicalId: other.physicalId, votes: cands.length ? 3 : 7, voters: 3 });
    const filler = living.find((p: any) => !cands.some(c => c.targetPhysicalId === p.physicalId));
    if (filler) cands.push({ type: 'PLAYER', targetPhysicalId: filler.physicalId, votes: 1, voters: 1 });
    state.votingState.candidates = cands;
    // سجلّ تصويتٍ مبسّط (للمكافآت و«مخطوطتك»)
    state.voteHistory.push({ id: `r${round}`, round, seq: round, kind: 'DAY', candidates: cands.map(c => ({ ...c, name: '', people: c.voters, unnamed: 0, voters: living.slice(0, c.voters).map((p: any) => ({ voterPhysicalId: p.physicalId, name: '', weight: 1 })) })), outcome: { type: 'ELIMINATED', eliminated: [] } });

    // 🤝 الكفالة أحياناً
    const winner = cands[0];
    let saved = false;
    if (kafalaEligible(state, winner) && rnd() < 0.3) {
      openKafalaWindow(state, winner, winner.votes);
      const r = applyKafala(state);
      if (r.ok && r.outcome === 'SAVED') { saved = true; stats.kafSaved++; }
      stats.kaf++;
    }
    if (!saved) {
      await setGameState(roomId, state);
      const res: any = await resolveVoting(roomId);
      state = await getGameState(roomId);
      state.voteHistory[state.voteHistory.length - 1].outcome.eliminated = res.eliminated || [];
      // قنبلة الشيخ: يُوقفها الموجّه (لا تؤثّر على الثوابت)
      state.pendingBomb = null;
      if (state.winner) break;
    }
    if ((checkWinCondition(state) as any) !== 'CONTINUE') { state.winner = String(checkWinCondition(state)).startsWith('MAFIA') ? 'MAFIA' : 'CITIZEN'; break; }
    if (round === 20) bad(g, 'لم تنتهِ في ٢٠ جولة');
  }

  // ═══ ما بعد المباراة ═══
  if (!state.winner) bad(g, 'بلا فائز');
  const dv = state.dividedState;
  if (dv?.choice === 'MAFIA') {
    stats.crossed++;
    if (state.players.find((p: any) => p.physicalId === dv.dividedPhysicalId)?.role !== 'MAFIA_REGULAR') bad(g, 'العابر ليس مافيا عادي');
  } else if (dv?.choice === 'CITY') stats.stayed++;
  const led = prophecyLedgerLine(state);
  if (!led) bad(g, 'بلا سطر سجلّ'); else stats[led.line === 'TRUTH' ? 'truth' : 'mask']++;
  const oSeat = prophecyOwnerSeat(state);
  if (oSeat != null && prophecySkillsFor(state, oSeat).prophecyTrue > 1) bad(g, 'نبوءتان صادقتان');
  const o = state.oracleState;
  if (o?.outcome === 'TRUE') stats.pTrue++; if (o?.outcome === 'FALSE') stats.pFalse++; if (o?.outcome === 'WITHDRAWN') stats.pWithdrawn++;
  if (state.cupState?.departed) stats.cupDep++;
  if (state.winner === 'MAFIA') stats.mafiaWins++; else if (state.winner === 'CITIZEN') stats.cityWins++; else stats.neutralWins++;
  stats.masksBurned += (state.deceiverState?.masks || []).filter((m: any) => m.burned).length;
}

(async () => {
  primeTestDefs();
  const abilities = await getAbilityDefs();
  const roles = await getRoleDefs();
  __primeDefsForTest({
    abilities: [...abilities,
      { id: 'MASK', nameAr: 'القناع', phase: 'NIGHT', priority: 2, targetType: 'ENEMY', excludeSelf: true, excludeLastTarget: false, maxTargets: 1, effectType: 'PASSIVE' } as any,
      { id: 'READ_CUP', nameAr: 'قراءة الفنجان', phase: 'NIGHT', priority: 7, targetType: 'ANY', excludeSelf: true, excludeLastTarget: true, maxTargets: 1, effectType: 'PASSIVE' } as any],
    roles: [...roles,
      { id: 'DECEIVER', team: 'MAFIA', abilities: ['MASK'], genPriority: 90, nameAr: 'المُضلّل' } as any,
      { id: 'ORACLE', team: 'CITIZEN', abilities: [], genPriority: 90, nameAr: 'العرّاف' } as any,
      { id: 'DIVIDED', team: 'CITIZEN', abilities: [], genPriority: 90, nameAr: 'المنقسم' } as any,
      { id: 'GUARANTOR', team: 'CITIZEN', abilities: [], genPriority: 90, nameAr: 'الكفيل' } as any,
      { id: 'MAYOR', team: 'CITIZEN', abilities: [], genPriority: 90, nameAr: 'العمدة' } as any,
      { id: 'CUP_READER', team: 'NEUTRAL', abilities: ['READ_CUP'], genPriority: 90, nameAr: 'قارئة الفنجان' } as any],
  });
  const stats: any = { crossed: 0, stayed: 0, truth: 0, mask: 0, pTrue: 0, pFalse: 0, pWithdrawn: 0, cupDep: 0, kaf: 0, kafSaved: 0, mafiaWins: 0, cityWins: 0, neutralWins: 0, masksBurned: 0, errors: 0 };
  for (let g = 1; g <= N; g++) {
    try { await playOne(g, stats); } catch (e: any) { stats.errors++; bad(g, `استثناء: ${e?.stack?.split('\n').slice(0, 2).join(' | ')}`); }
  }
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}٪` : '—');
  console.log(`\n━━━ ${N} مباراة ━━━`);
  console.log(`  فوز المافيا ${pct(stats.mafiaWins, N)} · المدينة ${pct(stats.cityWins, N)} · محايد ${pct(stats.neutralWins, N)}`);
  console.log(`  المنقسم: عبر ${stats.crossed} · بقي ${stats.stayed} (العبور ${pct(stats.crossed, stats.crossed + stats.stayed)})`);
  console.log(`  النبوءة: صادقة ${stats.pTrue} · كاذبة ${stats.pFalse} · صادقة من المارّة ${pct(stats.pTrue, stats.pTrue + stats.pFalse)}`);
  console.log(`  الكفالة: ${stats.kaf} · أنقذت ${pct(stats.kafSaved, stats.kaf)} · القارئة رحلت ${pct(stats.cupDep, N)} · أقنعة احترقت ${stats.masksBurned}`);
  console.log(`  سجلّ المخطوطتين: صدق ${stats.truth} · قناع ${stats.mask}`);
  const ok = violations.length === 0 && stats.errors === 0 && stats.crossed > 0 && stats.stayed > 0;
  if (violations.length) console.log('\n' + violations.map(v => '  ❌ ' + v).join('\n'));
  console.log(`\n${ok ? '✅' : '❌'} ${N - (violations.length ? 1 : 0)} مباراة · ${violations.length} خرقٌ للثوابت · ${stats.errors} استثناء`);
  process.exit(ok ? 0 : 1);
})();
