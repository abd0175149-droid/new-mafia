// ══════════════════════════════════════════════════════
// 🧪 اختبار مرحلة النهار: التصويت/الاتفاقيات/التعادل/الحصر/القنبلة/فوز المهرج
// يشغّل vote-engine الحقيقي (resolveVoting + handleTieBreaker) عبر مخزن Redis بالذاكرة
// (بلا اتصال Redis). يؤكّد أيضاً حمولة الإقصاء التي تستهلكها شاشة العرض/الليدر.
// تشغيل: npx tsx src/scripts/test-day.ts
// ══════════════════════════════════════════════════════
import { primeTestDefs } from './_game-fixtures.js';
import { setGameState, getGameState } from '../config/redis.js';
import { resolveVoting, handleTieBreaker, TieBreakerAction } from '../game/vote-engine.js';
import { WinResult } from '../game/win-checker.js';
import { Role } from '../game/roles.js';
import { initTwinState } from '../game/twin-engine.js';

primeTestDefs();

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t: string) { console.log(`\n━━━ ${t} ━━━`); }
function P(physicalId: number, role: Role, isAlive = true): any {
  return { physicalId, name: role + '#' + physicalId, role, isAlive, isSilenced: false, playerId: physicalId + 1000 };
}
const pc = (targetPhysicalId: number, votes: number) => ({ type: 'PLAYER', targetPhysicalId, votes });
const dc = (id: string, initiatorPhysicalId: number, targetPhysicalId: number, votes: number) => ({ type: 'DEAL', id, initiatorPhysicalId, targetPhysicalId, votes });

async function setup(roomId: string, players: any[], candidates: any[], opts: any = {}): Promise<void> {
  const state: any = {
    roomId, players, round: opts.round ?? 2,
    config: { bombEnabled: opts.bombEnabled ?? true, jesterSurviveRounds: 2, useDynamicEngine: true },
    performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] },
    votingState: { candidates, deals: opts.deals ?? [], totalVotesCast: 0, hiddenPlayersFromVoting: [], tieBreakerLevel: 0, playerVotes: {} },
    twinState: null,
  };
  if (opts.twin) state.twinState = initTwinState(state);
  await setGameState(roomId, state);
}
const isAlive = (s: any, id: number) => s.players.find((p: any) => p.physicalId === id)?.isAlive;

async function main() {
  console.log('🧪 اختبار مرحلة النهار (التصويت/التعادل/الحصر/الاتفاقيات/القنبلة)\n');

  section('1) إقصاء بالأغلبية (مرشّح واحد فائز)');
  {
    const R = 'd1';
    await setup(R, [P(1, Role.GODFATHER), P(7, Role.CITIZEN), P(12, Role.CITIZEN), P(13, Role.CITIZEN), P(14, Role.CITIZEN)], [pc(7, 3), pc(12, 1), pc(1, 0)]);
    const r = await resolveVoting(R);
    const s = await getGameState(R);
    check('النوع ELIMINATION', r.type === 'ELIMINATION');
    check('المُقصى = #7', r.eliminated.length === 1 && r.eliminated[0] === 7);
    check('revealedRoles يكشف دور #7 (للعرض)', r.revealedRoles.some((x: any) => x.physicalId === 7 && x.role === 'CITIZEN'));
    check('#7 مات فعلاً', isAlive(s, 7) === false);
    check('اللعبة مستمرة (مافيا 1 ضد مواطنين 3)', r.winResult === WinResult.GAME_CONTINUES);
  }

  section('2) تعادل → النوع TIE مع قائمة المتعادلين');
  {
    const R = 'd2';
    await setup(R, [P(1, Role.GODFATHER), P(7, Role.CITIZEN), P(12, Role.CITIZEN)], [pc(7, 2), pc(12, 2), pc(1, 0)]);
    const r = await resolveVoting(R);
    check('النوع TIE', r.type === 'TIE');
    check('لا إقصاء عند التعادل', r.eliminated.length === 0);
    check('قائمة المتعادلين = 2 (#7,#12)', (r.tiedCandidates?.length ?? 0) === 2);
  }

  section('3) اتفاقية ناجحة (مواطن يُخرج مافيا) → المبادر ينجو');
  {
    const R = 'd3';
    await setup(R, [P(1, Role.GODFATHER), P(7, Role.CITIZEN), P(12, Role.CITIZEN), P(13, Role.CITIZEN)],
      [dc('x', 7, 1, 3), pc(12, 0)], { deals: [{ id: 'x', initiatorPhysicalId: 7, targetPhysicalId: 1 }] });
    const r = await resolveVoting(R);
    const s = await getGameState(R);
    check('النوع DEAL_ELIMINATION', r.type === 'DEAL_ELIMINATION');
    check('المستهدف المافيا (#1) أُقصي', isAlive(s, 1) === false);
    check('المبادر المواطن (#7) نجا (اتفاقية ناجحة)', isAlive(s, 7) === true);
    check('سُجّلت الاتفاقية ناجحة', s.performanceTracking.dealOutcomes.some((d: any) => d.initiatorPhysicalId === 7 && d.success === true));
  }

  section('4) اتفاقية فاشلة (مواطن يُخرج مواطناً) → الاثنان يُقصيان');
  {
    const R = 'd4';
    await setup(R, [P(1, Role.GODFATHER), P(7, Role.CITIZEN), P(12, Role.CITIZEN), P(13, Role.CITIZEN), P(14, Role.CITIZEN)],
      [dc('y', 7, 12, 3)], { deals: [{ id: 'y', initiatorPhysicalId: 7, targetPhysicalId: 12 }] });
    const r = await resolveVoting(R);
    const s = await getGameState(R);
    check('الهدف المواطن (#12) أُقصي', isAlive(s, 12) === false);
    check('المبادر (#7) أُقصي أيضاً (عقوبة الديل الفاشل)', isAlive(s, 7) === false);
    check('سُجّلت الاتفاقية فاشلة', s.performanceTracking.dealOutcomes.some((d: any) => d.initiatorPhysicalId === 7 && d.success === false));
    check('revealedRoles يحوي الاثنين (للعرض)', r.revealedRoles.some((x: any) => x.physicalId === 12) && r.revealedRoles.some((x: any) => x.physicalId === 7));
  }

  section('5) القنبلة — إقصاء شيخ المافيا بالتصويت يضع pendingBomb');
  {
    const R = 'd5';
    await setup(R, [P(1, Role.GODFATHER), P(2, Role.SILENCER), P(7, Role.CITIZEN), P(12, Role.CITIZEN)], [pc(1, 3)]);
    await resolveVoting(R);
    const s = await getGameState(R);
    check('pendingBomb مضبوطة على الشيخ #1', s.pendingBomb?.godfatherPhysicalId === 1);
    check('القنبلة: الجار الأعلى = #2 (للعرض)', s.pendingBomb?.above?.physicalId === 2);
    check('القنبلة: الجار الأسفل = #12 (التفاف دائري للعرض)', s.pendingBomb?.below?.physicalId === 12);
  }

  section('6) فوز المهرج بالتصويت (neutralWin في حمولة النتيجة)');
  {
    const R = 'd6';
    await setup(R, [P(14, Role.JESTER), P(7, Role.CITIZEN), P(12, Role.CITIZEN), P(1, Role.GODFATHER)], [pc(14, 3)], { round: 2 });
    const r = await resolveVoting(R);
    check('المهرج أُقصي بالتصويت → فوز المهرج (won=true)', r.neutralWin?.won === true && r.neutralWin?.roleId === 'JESTER');
  }

  section('7) فوز المواطنين — إقصاء آخر مافيا بالتصويت');
  {
    const R = 'd7';
    await setup(R, [P(1, Role.GODFATHER), P(7, Role.CITIZEN), P(12, Role.CITIZEN)], [pc(1, 3)]);
    const r = await resolveVoting(R);
    check('إقصاء آخر مافيا → CITIZEN_WIN', r.winResult === WinResult.CITIZEN_WIN);
  }

  section('8) كسر التعادل — الحصر (NARROW)');
  {
    const R = 'd8';
    await setup(R, [P(1, Role.GODFATHER), P(7, Role.CITIZEN), P(12, Role.CITIZEN)], [pc(7, 2), pc(12, 2), pc(1, 0)]);
    const tie = (await resolveVoting(R)).tiedCandidates!;
    await handleTieBreaker(R, TieBreakerAction.NARROW, tie);
    const s = await getGameState(R);
    check('الحصر: المرشحون = المتعادلان فقط (2)', s.votingState.candidates.length === 2);
    check('الحصر: الأصوات صُفّرت', s.votingState.candidates.every((c: any) => c.votes === 0) && s.votingState.totalVotesCast === 0);
    check('الحصر: tieBreakerLevel=2', s.votingState.tieBreakerLevel === 2);
  }

  section('9) كسر التعادل — إقصاء الجميع (ELIMINATE_ALL)');
  {
    const R = 'd9';
    await setup(R, [P(1, Role.GODFATHER), P(7, Role.CITIZEN), P(12, Role.CITIZEN), P(13, Role.CITIZEN)], [pc(7, 2), pc(12, 2)]);
    const tie = (await resolveVoting(R)).tiedCandidates!;
    await handleTieBreaker(R, TieBreakerAction.ELIMINATE_ALL, tie);
    const s = await getGameState(R);
    check('إقصاء الجميع: #7 و #12 ماتا', isAlive(s, 7) === false && isAlive(s, 12) === false);
  }

  section('10) كسر التعادل — إلغاء (CANCEL) وإعادة (REVOTE)');
  {
    let R = 'd10a';
    await setup(R, [P(1, Role.GODFATHER), P(7, Role.CITIZEN), P(12, Role.CITIZEN)], [pc(7, 2), pc(12, 2)]);
    const tieA = (await resolveVoting(R)).tiedCandidates!;
    await handleTieBreaker(R, TieBreakerAction.CANCEL, tieA);
    let s = await getGameState(R);
    check('إلغاء: لا مرشحين ولا وفيات', s.votingState.candidates.length === 0 && isAlive(s, 7) === true && isAlive(s, 12) === true);

    R = 'd10b';
    await setup(R, [P(1, Role.GODFATHER), P(7, Role.CITIZEN), P(12, Role.CITIZEN)], [pc(7, 2), pc(12, 2), pc(1, 0)]);
    const tieB = (await resolveVoting(R)).tiedCandidates!;
    await handleTieBreaker(R, TieBreakerAction.REVOTE, tieB);
    s = await getGameState(R);
    check('إعادة: نفس المرشحين والأصوات صُفّرت', s.votingState.candidates.length === 3 && s.votingState.candidates.every((c: any) => c.votes === 0));
    check('إعادة: tieBreakerLevel=1', s.votingState.tieBreakerLevel === 1);
  }

  section('11) اتفاقية مافيا على مافيا (غدر) → الهدف يُقصى، المبادر ينجو، الاتفاقية فاشلة');
  {
    const R = 'd11';
    await setup(R, [P(1, Role.GODFATHER), P(2, Role.SILENCER), P(7, Role.CITIZEN), P(12, Role.CITIZEN), P(13, Role.CITIZEN)],
      [dc('m', 2, 1, 3)], { deals: [{ id: 'm', initiatorPhysicalId: 2, targetPhysicalId: 1 }] });
    const r = await resolveVoting(R);
    const s = await getGameState(R);
    check('هدف المافيا (#1) أُقصي', isAlive(s, 1) === false);
    check('المبادر المافيا (#2) نجا (الهدف مافيا فلا يُقصى المبادر)', isAlive(s, 2) === true);
    check('الاتفاقية مُسجّلة فاشلة (غدر بالفريق، لا نقاط)', s.performanceTracking.dealOutcomes.some((d: any) => d.initiatorPhysicalId === 2 && d.success === false));
    check('النوع DEAL_ELIMINATION', r.type === 'DEAL_ELIMINATION');
  }

  section('11أ) اتفاقية مواطن على **مهرّج** → المهرّج يُقصى والمُبادر **ينجو**');
  {
    // 🔴 المحايد ليس مواطناً: لا يردّ الصفقة على صاحبها. وإلّا كانت
    //    الخسارة مزدوجة: يفوز المهرّج بإقصائه **و** يخرج المواطن معه.
    const R = 'd11a';
    await setup(R, [P(1, Role.GODFATHER), P(5, Role.CITIZEN), P(6, Role.JESTER), P(12, Role.CITIZEN), P(13, Role.CITIZEN)],
      [dc('j', 5, 6, 3)], { deals: [{ id: 'j', initiatorPhysicalId: 5, targetPhysicalId: 6 }] });
    const r = await resolveVoting(R);
    const s = await getGameState(R);
    check('المهرّج (#6) أُقصي', isAlive(s, 6) === false);
    check('المُبادر المواطن (#5) نجا', isAlive(s, 5) === true);
    check('لا DEAL_BACKFIRE في السجلّ', !s.performanceTracking.eliminationLog.some((e: any) => e.eliminatedBy === 'DEAL_BACKFIRE'));
    check('إقصاء المهرّج مسجّل NEUTRAL', s.performanceTracking.eliminationLog.some((e: any) => e.physicalId === 6 && e.team === 'NEUTRAL'));
    check('المُقصَون = المهرّج وحده', r.eliminated.length === 1 && r.eliminated[0] === 6);
    check('الصفقة لا تُحتسب ناجحة (محايد لا يكسِب)', s.performanceTracking.dealOutcomes.some((d: any) => d.initiatorPhysicalId === 5 && d.success === false));
  }

  section('11ب) اتفاقية مواطن على **سفّاح** → المُبادر ينجو أيضاً');
  {
    const R = 'd11b';
    await setup(R, [P(1, Role.GODFATHER), P(5, Role.CITIZEN), P(6, Role.ASSASSIN), P(12, Role.CITIZEN), P(13, Role.CITIZEN)],
      [dc('a', 5, 6, 3)], { deals: [{ id: 'a', initiatorPhysicalId: 5, targetPhysicalId: 6 }] });
    await resolveVoting(R);
    const s = await getGameState(R);
    check('السفّاح (#6) أُقصي', isAlive(s, 6) === false);
    check('المُبادر (#5) نجا', isAlive(s, 5) === true);
  }

  section('11ج) اتفاقية مواطن على **مواطن صالح** → المُبادر يخرج معه (لم يتغيّر)');
  {
    const R = 'd11c';
    await setup(R, [P(1, Role.GODFATHER), P(5, Role.CITIZEN), P(6, Role.DOCTOR), P(12, Role.CITIZEN), P(13, Role.CITIZEN)],
      [dc('c', 5, 6, 3)], { deals: [{ id: 'c', initiatorPhysicalId: 5, targetPhysicalId: 6 }] });
    const r = await resolveVoting(R);
    const s = await getGameState(R);
    check('الهدف المواطن (#6) أُقصي', isAlive(s, 6) === false);
    check('المُبادر (#5) خرج معه — ارتداد الصفقة', isAlive(s, 5) === false);
    check('مسجّل DEAL_BACKFIRE', s.performanceTracking.eliminationLog.some((e: any) => e.physicalId === 5 && e.eliminatedBy === 'DEAL_BACKFIRE'));
    check('المُقصَون اثنان', r.eliminated.length === 2);
  }

  section('12) تعادل ثلاثي → TIE مع 3 متعادلين، وإقصاء الجميع يقصي الثلاثة');
  {
    const R = 'd12';
    await setup(R, [P(1, Role.GODFATHER), P(7, Role.CITIZEN), P(12, Role.CITIZEN), P(13, Role.CITIZEN), P(14, Role.CITIZEN)], [pc(7, 2), pc(12, 2), pc(13, 2), pc(14, 0)]);
    const r = await resolveVoting(R);
    check('تعادل ثلاثي: TIE مع 3 متعادلين', r.type === 'TIE' && r.tiedCandidates?.length === 3);
    await handleTieBreaker(R, TieBreakerAction.ELIMINATE_ALL, r.tiedCandidates!);
    const s = await getGameState(R);
    check('إقصاء الجميع: الثلاثة (7,12,13) ماتوا', isAlive(s, 7) === false && isAlive(s, 12) === false && isAlive(s, 13) === false);
    check('غير المتعادل (#14) نجا', isAlive(s, 14) === true);
  }

  section('13) رابط الأخوين عبر التصويت — إقصاء الأصغر يُقصي الأكبر في نفس الملخص');
  {
    const R = 'd13';
    await setup(R, [P(1, Role.GODFATHER), P(5, Role.OLDER_BROTHER), P(13, Role.YOUNGER_BROTHER), P(7, Role.CITIZEN), P(12, Role.CITIZEN)], [pc(13, 3)], { twin: true });
    const r = await resolveVoting(R);
    const s = await getGameState(R);
    check('الأصغر (#13) أُقصي بالتصويت', isAlive(s, 13) === false);
    check('الأخ الأكبر (#5) انتحر وأُضيف للمُقصين', r.eliminated.includes(5) && isAlive(s, 5) === false);
    check('revealedRoles يكشف الأكبر كـ OLDER_BROTHER (للعرض)', r.revealedRoles.some((x: any) => x.physicalId === 5 && x.role === 'OLDER_BROTHER'));
  }

  console.log(`\n══════════════════════════════════════`);
  console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
  if (fail > 0) { console.log('\n❌ ' + failures.join('\n❌ ')); process.exit(1); }
  console.log('\n🎉 مرحلة النهار (تصويت/تعادل/حصر/اتفاقيات/قنبلة/مهرج) تعمل بالشكل المتوقع.');
  process.exit(0);
}
main().catch(e => { console.error('crash:', e); process.exit(1); });
