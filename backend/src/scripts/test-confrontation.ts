// ══════════════════════════════════════════════════════
// 🧪 اختبار مواجهة النهار الوجاهيّة: القواعد، دورة الحياة، ختم النتيجة من التصويت، والنقاط
// يشغّل confrontation-engine + vote-engine الحقيقيّين عبر مخزن Redis بالذاكرة.
// تشغيل: npx tsx src/scripts/test-confrontation.ts
// ══════════════════════════════════════════════════════
import { primeTestDefs } from './_game-fixtures.js';
import { setGameState, getGameState } from '../config/redis.js';
import { resolveVoting } from '../game/vote-engine.js';
import { Role } from '../game/roles.js';
import {
  requestConfrontation, requestBlockReason, acceptConfrontation, declineConfrontation, cancelConfrontation,
  startConfrontation, endConfrontation, markTimedOut, blockingConfrontation,
  stampConfrontationOutcome, publicConfrontations, usedBy, stageDeadline, adjustConfrontationStage, stageSecondsFor,
  castPulse, markTimeUp, pulseSummary, pulseTieSuggestion, pulseBadges, confrontationNotes, myPulseVotes,
} from '../game/confrontation-engine.js';
import { computeMatchReward, computeMatchBreakdown, buildDisplayBreakdown } from '../services/progression.service.js';
import { remapPhysicalIds } from '../game/seat-remap.js';

primeTestDefs();

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t: string) { console.log(`\n━━━ ${t} ━━━`); }
function P(physicalId: number, role: Role, isAlive = true, isSilenced = false): any {
  return { physicalId, name: role + '#' + physicalId, role, isAlive, isSilenced, playerId: physicalId + 1000 };
}
const pc = (targetPhysicalId: number, votes: number) => ({ type: 'PLAYER', targetPhysicalId, votes });
const dc = (id: string, initiatorPhysicalId: number, targetPhysicalId: number, votes: number) => ({ type: 'DEAL', id, initiatorPhysicalId, targetPhysicalId, votes });

function fresh(players: any[], opts: any = {}): any {
  return {
    roomId: opts.roomId || 'c', players, round: opts.round ?? 2, phase: opts.phase ?? 'DAY_DISCUSSION',
    config: { confrontationEnabled: opts.enabled ?? true, confrontationsPerPlayer: opts.perPlayer, isRemote: opts.isRemote ?? false, bombEnabled: false, jesterSurviveRounds: 2, useDynamicEngine: true },
    performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] },
    votingState: { candidates: opts.candidates ?? [], deals: opts.deals ?? [], totalVotesCast: 0, hiddenPlayersFromVoting: [], tieBreakerLevel: 0, playerVotes: {} },
    discussionState: opts.discussion ?? null,
    twinState: null,
  };
}
const err = (fn: () => any): string | null => { try { fn(); return null; } catch (e: any) { return e.message; } };

async function main() {
  console.log('🧪 اختبار مواجهة النهار الوجاهيّة\n');

  section('1) شروط الطلب');
  {
    const s = fresh([P(1, Role.GODFATHER), P(2, Role.CITIZEN), P(3, Role.CITIZEN), P(4, Role.CITIZEN, true, true), P(5, Role.CITIZEN, false)]);
    check('مطفأة ⇒ ممنوع', !!requestBlockReason({ ...s, config: { ...s.config, confrontationEnabled: false } }, 2, 1));
    check('بعيدة ⇒ ممنوع', !!requestBlockReason({ ...s, config: { ...s.config, isRemote: true } }, 2, 1));
    check('خارج النقاش ⇒ ممنوع', !!requestBlockReason({ ...s, phase: 'DAY_VOTING' }, 2, 1));
    check('الجولة الأولى ⇒ مسموح (قرار المالك)', requestBlockReason({ ...s, round: 1 }, 2, 1) === null);
    check('نفسه ⇒ ممنوع', !!requestBlockReason(s, 2, 2));
    check('مُسكَت طالباً ⇒ ممنوع', !!requestBlockReason(s, 4, 1));
    check('مُسكَت مستهدَفاً ⇒ ممنوع', !!requestBlockReason(s, 2, 4));
    check('ميت مستهدَفاً ⇒ ممنوع', !!requestBlockReason(s, 2, 5));
    check('صحيح ⇒ مسموح', requestBlockReason(s, 2, 1) === null);
  }

  section('2) الدورة: طلب → قبول → بدء (الطرفان معاً) → إنهاء، والرصيد يُستهلك عند القبول فقط');
  {
    const s = fresh([P(1, Role.GODFATHER), P(2, Role.CITIZEN), P(3, Role.CITIZEN)]);
    const c = requestConfrontation(s, 2, 1, 1000);
    check('PENDING بمهلة ٢٠ث', c.status === 'PENDING' && c.respondBy === 1000 + 20000);
    check('لا استهلاك عند الطلب', usedBy(s, 2) === 0);
    check('يمنع بدء التصويت وهو معلّق', blockingConfrontation(s)?.id === c.id);
    check('لا يبدأ قبل القبول', !!err(() => startConfrontation(s, c.id)));
    check('طلبٌ ثانٍ من نفس الطالب ممنوع', !!requestBlockReason(s, 2, 3));
    check('استهداف نفس الهدف ممنوع', !!requestBlockReason(s, 3, 1));
    acceptConfrontation(s, c.id, 'TARGET');
    check('ACCEPTED واستُهلك الرصيد', c.status === 'ACCEPTED' && usedBy(s, 2) === 1);
    check('لا يقبل مرّتين', !!err(() => acceptConfrontation(s, c.id, 'LEADER')));
    s.discussionState = { status: 'SPEAKING', isFinished: false, currentSpeakerId: 3 };
    check('لا يبدأ ومتحدّثٌ على الميكروفون', !!err(() => startConfrontation(s, c.id)));
    s.discussionState = { status: 'WAITING', isFinished: true, currentSpeakerId: null };
    startConfrontation(s, c.id, 5000);
    check('LIVE بمهلة ٦٠ث للطرفين معاً', c.status === 'LIVE' && stageDeadline(c) === 65000);
    check('لا طلبات أثناء الجارية (الطالب مشغول)', !!requestBlockReason(s, 2, 3));
    endConfrontation(s, c.id, 12000);
    check('DONE وسُجّلت في تتبّع الأداء بلا نتيجة', c.status === 'DONE' && s.performanceTracking.confrontations?.length === 1 && s.performanceTracking.confrontations[0].outcome === null);
    check('لا يمنع التصويت بعد الانتهاء', blockingConfrontation(s) === null);
    check('الرصيد (١) مستنفد', !!requestBlockReason(s, 2, 3));
    const pub = publicConfrontations(s);
    check('الحمولة العامّة: enabled/perPlayer/used', pub.enabled && pub.perPlayer === 1 && pub.used[2] === 1 && pub.confrontations.length === 1);
  }

  section('3) الرفض لا يستهلك، والإلغاء بعد القبول يردّ الرصيد، وانقضاء المهلة يبقيها معلّقة');
  {
    const s = fresh([P(1, Role.GODFATHER), P(2, Role.CITIZEN), P(3, Role.CITIZEN)]);
    const c1 = requestConfrontation(s, 2, 1);
    declineConfrontation(s, c1.id, 'TARGET');
    check('DECLINED من المستهدَف', c1.status === 'DECLINED' && c1.declinedBy === 'TARGET');
    check('الرصيد لم يُستهلك', usedBy(s, 2) === 0);
    check('يستطيع الطلب ثانيةً (نفس الهدف بعد الرفض)', requestBlockReason(s, 2, 1) === null);
    const c2 = requestConfrontation(s, 2, 1);
    check('انقضاء المهلة يعلّمها timedOut وتبقى PENDING', markTimedOut(s, c2.id)?.timedOut === true && c2.status === 'PENDING');
    acceptConfrontation(s, c2.id, 'LEADER');
    check('الليدر قبِل نيابةً', c2.acceptedBy === 'LEADER' && usedBy(s, 2) === 1);
    cancelConfrontation(s, c2.id);
    check('الإلغاء بعد القبول يردّ الرصيد', c2.status === 'CANCELLED' && usedBy(s, 2) === 0);
    const c3 = requestConfrontation(s, 3, 1);
    cancelConfrontation(s, c3.id);
    check('إلغاء طلبٍ معلّق = رفض الليدر', c3.status === 'DECLINED' && c3.declinedBy === 'LEADER');
  }

  section('4) حدّ الجولة (٢) وحدّ اللاعب (perPlayer=2) والجولة الجديدة');
  {
    const s = fresh([P(1, Role.GODFATHER), P(2, Role.CITIZEN), P(3, Role.CITIZEN), P(4, Role.CITIZEN), P(5, Role.CITIZEN)], { perPlayer: 2 });
    const a = requestConfrontation(s, 2, 1); acceptConfrontation(s, a.id, 'TARGET');
    const b = requestConfrontation(s, 3, 4); acceptConfrontation(s, b.id, 'TARGET');
    check('الثالثة في الجولة ممنوعة', !!requestBlockReason(s, 5, 1) || !!requestBlockReason(s, 5, 2));
    s.discussionState = { status: 'WAITING', isFinished: true };
    startConfrontation(s, a.id);
    startConfrontation(s, b.id);
    check('بدء الثانية يغلق الأولى تلقائيّاً (قرار المالك)', a.status === 'DONE' && b.status === 'LIVE');
    check('المنتهية لا تُبدأ ثانيةً', !!err(() => startConfrontation(s, a.id)));
    endConfrontation(s, b.id);
    s.round = 3;
    check('الجولة الجديدة: العدّ يبدأ من صفر', publicConfrontations(s).confrontations.length === 0 && requestBlockReason(s, 2, 1) === null);
    const c = requestConfrontation(s, 2, 1); acceptConfrontation(s, c.id, 'TARGET');
    check('استهلك الثانية من رصيده (2/2)', usedBy(s, 2) === 2 && !!requestBlockReason(s, 2, 3));
  }

  section('5) ختم النتيجة من تصويت الجولة نفسها فقط');
  {
    // مواطن #2 واجه المافيا #1، وأُقصي #1 بتصويت الجولة ⇒ MAFIA_EXPOSED
    const R = 'c5a';
    const s = fresh([P(1, Role.GODFATHER), P(2, Role.CITIZEN), P(3, Role.CITIZEN), P(4, Role.CITIZEN), P(5, Role.CITIZEN)], { roomId: R, candidates: [pc(1, 3), pc(2, 1)] });
    const c = requestConfrontation(s, 2, 1); acceptConfrontation(s, c.id, 'TARGET');
    s.discussionState = { status: 'WAITING', isFinished: true }; startConfrontation(s, c.id); endConfrontation(s, c.id);
    s.phase = 'DAY_VOTING';
    await setGameState(R, s);
    const r = await resolveVoting(R);
    const after = await getGameState(R);
    check('أُقصي #1 بالتصويت', r.type === 'ELIMINATION' && r.eliminated[0] === 1);
    check('نتيجة المواجهة MAFIA_EXPOSED', after.performanceTracking.confrontations[0].outcome === 'MAFIA_EXPOSED');
  }
  {
    // مواطن واجه مواطناً وأُقصي ⇒ CITIZEN_HIT
    const s = fresh([P(1, Role.GODFATHER), P(2, Role.CITIZEN), P(3, Role.CITIZEN), P(4, Role.CITIZEN), P(5, Role.CITIZEN)]);
    const c = requestConfrontation(s, 2, 3); acceptConfrontation(s, c.id, 'TARGET');
    s.discussionState = { status: 'WAITING', isFinished: true }; startConfrontation(s, c.id); endConfrontation(s, c.id);
    stampConfrontationOutcome(s, 3);
    check('مواطن على مواطن ⇒ CITIZEN_HIT', s.performanceTracking.confrontations[0].outcome === 'CITIZEN_HIT');
  }
  {
    // مافيا واجه مافيا ⇒ MAFIA_BETRAYAL؛ مافيا على مواطن ⇒ NONE؛ محايد ⇒ NONE
    const s = fresh([P(1, Role.GODFATHER), P(2, Role.MAFIA_REGULAR), P(3, Role.CITIZEN), P(4, Role.JESTER), P(5, Role.CITIZEN), P(6, Role.CITIZEN)], { perPlayer: 3 });
    const a = requestConfrontation(s, 2, 1); acceptConfrontation(s, a.id, 'TARGET');
    s.discussionState = { status: 'WAITING', isFinished: true }; startConfrontation(s, a.id); endConfrontation(s, a.id);
    stampConfrontationOutcome(s, 1);
    check('مافيا على مافيا ⇒ MAFIA_BETRAYAL', s.performanceTracking.confrontations[0].outcome === 'MAFIA_BETRAYAL');
    s.round = 3;
    const b = requestConfrontation(s, 2, 3); acceptConfrontation(s, b.id, 'TARGET'); startConfrontation(s, b.id); endConfrontation(s, b.id);
    stampConfrontationOutcome(s, 3);
    check('مافيا على مواطن ⇒ NONE', s.performanceTracking.confrontations[1].outcome === 'NONE');
    s.round = 4;
    const d = requestConfrontation(s, 4, 5); acceptConfrontation(s, d.id, 'TARGET'); startConfrontation(s, d.id); endConfrontation(s, d.id);
    stampConfrontationOutcome(s, 5);
    check('طالبٌ محايد ⇒ NONE', s.performanceTracking.confrontations[2].outcome === 'NONE');
  }
  {
    // جولةٌ لاحقة أو مقعدٌ آخر ⇒ لا ختم
    const s = fresh([P(1, Role.GODFATHER), P(2, Role.CITIZEN), P(3, Role.CITIZEN)]);
    const c = requestConfrontation(s, 2, 1); acceptConfrontation(s, c.id, 'TARGET');
    s.discussionState = { status: 'WAITING', isFinished: true }; startConfrontation(s, c.id); endConfrontation(s, c.id);
    stampConfrontationOutcome(s, 3);
    check('إقصاء مقعدٍ آخر ⇒ لا ختم', s.performanceTracking.confrontations[0].outcome === null);
    s.round = 3;
    stampConfrontationOutcome(s, 1);
    check('إقصاء الهدف في جولةٍ لاحقة ⇒ لا ختم', s.performanceTracking.confrontations[0].outcome === null);
  }
  {
    // إقصاءٌ بالاتفاقيّة (DEAL) لا يختم
    const R = 'c5e';
    const s = fresh([P(1, Role.GODFATHER), P(2, Role.CITIZEN), P(3, Role.CITIZEN), P(4, Role.CITIZEN)], { roomId: R, candidates: [dc('x', 3, 1, 3), pc(2, 0)], deals: [{ id: 'x', initiatorPhysicalId: 3, targetPhysicalId: 1 }] });
    const c = requestConfrontation(s, 2, 1); acceptConfrontation(s, c.id, 'TARGET');
    s.discussionState = { status: 'WAITING', isFinished: true }; startConfrontation(s, c.id); endConfrontation(s, c.id);
    s.phase = 'DAY_VOTING';
    await setGameState(R, s);
    const r = await resolveVoting(R);
    const after = await getGameState(R);
    check('أُقصي #1 بالاتفاقيّة', r.type === 'DEAL_ELIMINATION');
    check('المواجهة بلا نتيجة (الإقصاء بالديل لا بالتصويت)', after.performanceTracking.confrontations[0].outcome === null);
  }

  section('6) النقاط: نصف الديل، وتظهر في التفصيل، وتُعاد من العمود عند غياب التفصيل');
  {
    const base = { role: 'CITIZEN', winner: 'CITIZEN', survivedToEnd: true, roundsSurvived: 3, successfulDealsCount: 0, failedDealsCount: 0, mafiaDealOnMafiaCount: 0, abilityCorrectCount: 0, abilityIncorrectCount: 0, teamEliminationBonus: 0, assassinContractsCompleted: 0 };
    const r0 = computeMatchReward(base as any, undefined);
    const r1 = computeMatchReward({ ...base, successfulConfrontationsCount: 1 } as any, undefined);
    const r2 = computeMatchReward({ ...base, failedConfrontationsCount: 1 } as any, undefined);
    check('كشف مافيا: +10 RR / +25 XP', r1.rrChange - r0.rrChange === 10 && r1.xpEarned - r0.xpEarned === 25, `${r1.rrChange - r0.rrChange}/${r1.xpEarned - r0.xpEarned}`);
    check('على مواطن: −15 RR / −5 XP', r2.rrChange - r0.rrChange === -15 && r2.xpEarned - r0.xpEarned === -5, `${r2.rrChange - r0.rrChange}/${r2.xpEarned - r0.xpEarned}`);
    const m0 = computeMatchReward({ ...base, role: 'MAFIA_REGULAR', winner: 'MAFIA' } as any, undefined);
    const m1 = computeMatchReward({ ...base, role: 'MAFIA_REGULAR', winner: 'MAFIA', mafiaConfrontationOnMafiaCount: 1 } as any, undefined);
    check('مافيا على مافيا: −15 RR / 0 XP', m1.rrChange - m0.rrChange === -15 && m1.xpEarned === m0.xpEarned);
    const b = computeMatchBreakdown({ ...base, successfulConfrontationsCount: 1 } as any, undefined);
    check('التفصيل يحمل confrontationSuccess', b.rr.confrontationSuccess === 10 && b.xp.confrontationSuccess === 25);
    const sumRr = Object.values(b.rr).reduce((a, v) => a + v, 0);
    check('مجموع بنود RR = الإجمالي', sumRr === r1.rrChange, `${sumRr} vs ${r1.rrChange}`);
    const disp = buildDisplayBreakdown({ role: 'CITIZEN', matchWinner: 'CITIZEN', survivedToEnd: true, roundsSurvived: 3, confrontationOutcome: 'MAFIA_EXPOSED', xpEarned: r1.xpEarned, rrChange: r1.rrChange, rewardBreakdown: null }, undefined);
    check('إعادة البناء من العمود تُظهر سطر المواجهة', disp.rr.some(l => l.key === 'confrontationSuccess' && l.value === 10));
    const dispNone = buildDisplayBreakdown({ role: 'CITIZEN', matchWinner: 'CITIZEN', survivedToEnd: true, roundsSurvived: 3, confrontationOutcome: 'NONE', xpEarned: r0.xpEarned, rrChange: r0.rrChange, rewardBreakdown: null }, undefined);
    check('NONE ⇒ لا سطر', !dispNone.rr.some(l => l.key.startsWith('confrontation')));
  }

  section('6ب) مدّة المواجهة: إعداد الغرفة، قيمةٌ صريحة عند البدء، وتعديلٌ حيّ');
  {
    const s = fresh([P(1, Role.GODFATHER), P(2, Role.CITIZEN), P(3, Role.CITIZEN)]);
    check('الافتراضي ٦٠ث', stageSecondsFor(s) === 60);
    s.config.confrontationStageSeconds = 45;
    check('إعداد الغرفة ٤٥ث + التقييد 20-300', stageSecondsFor(s) === 45 && stageSecondsFor(s, 500) === 300 && stageSecondsFor(s, 2) === 20);
    const c = requestConfrontation(s, 2, 1); acceptConfrontation(s, c.id, 'TARGET');
    s.discussionState = { status: 'WAITING', isFinished: true };
    startConfrontation(s, c.id, 1000, 60);
    check('بدءٌ بـ٦٠ث صريحة', c.stageSeconds === 60 && stageDeadline(c) === 61000 && c.status === 'LIVE');
    adjustConfrontationStage(s, c.id, 30, 11000);
    check('+٣٠ث ⇒ ٩٠ث', c.stageSeconds === 90 && stageDeadline(c) === 91000);
    adjustConfrontationStage(s, c.id, -200, 11000);
    check('تقصيرٌ لا ينزل تحت المنقضي+٣ث', c.stageSeconds === 13);
    check('لا تعديل بعد الانتهاء', !!err(() => { endConfrontation(s, c.id); adjustConfrontationStage(s, c.id, 10); }));
  }

  section('8) نبض الإقناع: من يصوّت، النصاب، البقاء بعد الوقت، الختم، الشارات، فضّ التعادل، السرّيّة');
  {
    const s = fresh([P(1, Role.GODFATHER), P(2, Role.CITIZEN), P(3, Role.CITIZEN), P(4, Role.CITIZEN), P(5, Role.CITIZEN), P(6, Role.CITIZEN, false)]);
    const c = requestConfrontation(s, 2, 1); acceptConfrontation(s, c.id, 'TARGET');
    check('لا تصويت قبل البدء', !!err(() => castPulse(s, c.id, 3, 'REQ')));
    s.discussionState = { status: 'WAITING', isFinished: true };
    startConfrontation(s, c.id, 1000, 60);
    check('طرفٌ لا يصوّت', !!err(() => castPulse(s, c.id, 1, 'TGT')));
    check('ميّتٌ لا يصوّت', !!err(() => castPulse(s, c.id, 6, 'REQ')));
    castPulse(s, c.id, 3, 'REQ');
    check('المؤهّلون ٣ (٥ أحياء − طرفان) وصوتٌ واحد ⇒ بلا نصاب', pulseSummary(s, c).eligible === 3 && pulseSummary(s, c).quorum === false);
    castPulse(s, c.id, 4, 'TGT'); castPulse(s, c.id, 4, 'REQ');
    check('تغيير الرأي يستبدل الصوت', pulseSummary(s, c).req === 2 && pulseSummary(s, c).tgt === 0);
    check('النصاب ٢ من ٣ ⇒ الفائز الطالب ١٠٠٪', pulseSummary(s, c).quorum && pulseSummary(s, c).winner === 'REQ' && pulseSummary(s, c).pct === 100);
    check('انقضاء الوقت يبقيها LIVE بعلم timeUp', markTimeUp(s, c.id)?.timeUp === true && c.status === 'LIVE');
    castPulse(s, c.id, 5, 'TGT');
    check('التصويت مفتوح بعد انقضاء الوقت', pulseSummary(s, c).tgt === 1);
    adjustConfrontationStage(s, c.id, 30, 30000);
    check('تمديدٌ بعد الوقت يعيد العدّ (timeUp=false)', c.timeUp === false);
    const pub = publicConfrontations(s);
    check('البثّ لا يحمل الأصوات الفرديّة ويحمل الملخّص', !('pulseVotes' in (pub.confrontations[0] as any)) && (pub.confrontations[0] as any).pulse.req === 2);
    check('صوتي يعود لي وحدي', myPulseVotes(s, 5)[c.id] === 'TGT' && !myPulseVotes(s, 2)[c.id]);
    endConfrontation(s, c.id);
    check('الإغلاق يختم الملخّص في التتبّع', s.performanceTracking.confrontations[0].pulse.winner === 'REQ' && s.performanceTracking.confrontations[0].pulse.pct === 67);
    const badges = pulseBadges(s);
    check('شارات التصويت: الطالب فائز ٦٧٪ والمستهدَف خاسر ٣٣٪', badges[2]?.won === true && badges[2].pct === 67 && badges[1]?.won === false && badges[1].pct === 33);
    // فضّ التعادل بالمفتاح
    check('بلا مفتاح ⇒ لا اقتراح', pulseTieSuggestion(s, [{ targetPhysicalId: 1 }, { targetPhysicalId: 3 }]) === null);
    s.config.pulseBreaksTies = true;
    const sug = pulseTieSuggestion(s, [{ targetPhysicalId: 1 }, { targetPhysicalId: 3 }]);
    check('بالمفتاح: خاسر النبض #1 هو المقترح', sug?.physicalId === 1 && sug.winnerPhysicalId === 2);
    check('لا اقتراح إن لم يكن خاسر النبض بين المتعادلين', pulseTieSuggestion(s, [{ targetPhysicalId: 3 }, { targetPhysicalId: 4 }]) === null);
    // الختم من التصويت: أُقصي #1 مافيا ⇒ الطالب المواطن ربح النبض وكان محقّاً؛ المصوّتون له صائبون
    stampConfrontationOutcome(s, 1);
    const e = s.performanceTracking.confrontations[0];
    check('القاعة مع الحقيقة + المصوّتون الصائبون [3,4]', e.pulseVindicated === true && JSON.stringify(e.correctVoters) === '[3,4]' && e.outcome === 'MAFIA_EXPOSED');
    check('سطر الكشف', confrontationNotes(s, [1])[1].includes('خسر النبض'));
  }
  {
    // بدء مواجهةٍ ثانية يغلق الجارية؛ والنبض بلا نصاب ⇒ لا فائز ولا شارات
    const s = fresh([P(1, Role.GODFATHER), P(2, Role.CITIZEN), P(3, Role.CITIZEN), P(4, Role.CITIZEN), P(5, Role.CITIZEN)], { perPlayer: 2 });
    const a = requestConfrontation(s, 2, 1); acceptConfrontation(s, a.id, 'TARGET');
    const b = requestConfrontation(s, 3, 4); acceptConfrontation(s, b.id, 'TARGET');
    s.discussionState = { status: 'WAITING', isFinished: true };
    startConfrontation(s, a.id); markTimeUp(s, a.id);
    startConfrontation(s, b.id);
    check('بدء الثانية أغلق الأولى وختمها', a.status === 'DONE' && b.status === 'LIVE' && a.pulse?.quorum === false);
    check('بلا نصاب ⇒ لا شارات', Object.keys(pulseBadges(s)).length === 0);
    check('المصوّت المواطن الذي واجه مافيا (2) يصوّت في مواجهة غيره', !err(() => castPulse(s, b.id, 2, 'REQ')));
  }

  section('9) النقاط: النبض خبرةٌ إلّا «القاعة مع الحقيقة» (+5 رتبة)');
  {
    const base = { role: 'CITIZEN', winner: 'CITIZEN', survivedToEnd: true, roundsSurvived: 3, successfulDealsCount: 0, failedDealsCount: 0, mafiaDealOnMafiaCount: 0, abilityCorrectCount: 0, abilityIncorrectCount: 0, teamEliminationBonus: 0, assassinContractsCompleted: 0 };
    const r0 = computeMatchReward(base as any, undefined);
    const r1 = computeMatchReward({ ...base, pulseWins: 1 } as any, undefined);
    const r2 = computeMatchReward({ ...base, pulseWins: 1, pulseVindicatedCount: 1 } as any, undefined);
    const r3 = computeMatchReward({ ...base, pulseCorrectVotes: 5 } as any, undefined);
    check('فوز بالنبض: +10 خبرة و0 رتبة', r1.xpEarned - r0.xpEarned === 10 && r1.rrChange === r0.rrChange);
    check('القاعة مع الحقيقة: +5 رتبة و+10 خبرة إضافيّة', r2.rrChange - r0.rrChange === 5 && r2.xpEarned - r1.xpEarned === 10);
    check('حدسٌ صائب مقيّد بـ٣ (٩ خبرة)', r3.xpEarned - r0.xpEarned === 9 && r3.rrChange === r0.rrChange);
    const b = computeMatchBreakdown({ ...base, pulseWins: 1, pulseVindicatedCount: 1, pulseCorrectVotes: 1 } as any, undefined);
    check('التفصيل يحمل بنود النبض', b.xp.pulseWin === 10 && b.xp.pulseVindicated === 10 && b.xp.pulseCorrectVote === 3 && b.rr.pulseVindicated === 5);
  }

  section('7) نقل المقاعد يعيد ترقيم الطالب/المستهدَف والعدّاد');
  {
    const s = fresh([P(1, Role.GODFATHER), P(2, Role.CITIZEN), P(3, Role.CITIZEN)]);
    const c = requestConfrontation(s, 2, 1); acceptConfrontation(s, c.id, 'TARGET');
    s.discussionState = { status: 'WAITING', isFinished: true }; startConfrontation(s, c.id); castPulse(s, c.id, 3, 'REQ');
    remapPhysicalIds(s, new Map([[2, 7], [1, 9], [3, 8]]));
    check('requester 2→7, target 1→9', c.requesterPhysicalId === 7 && c.targetPhysicalId === 9);
    check('أصوات النبض تُرقَّم 3→8', c.pulseVotes![8] === 'REQ' && !c.pulseVotes![3]);
    check('confrontationsUsed 2→7', usedBy(s, 7) === 1 && usedBy(s, 2) === 0);
  }

  console.log(`\n${'═'.repeat(50)}\n✅ ${pass} نجح   ❌ ${fail} فشل`);
  if (fail) { console.log('الفاشلة:\n - ' + failures.join('\n - ')); process.exit(1); }
}
main().catch(e => { console.error(e); process.exit(1); });
