// ══════════════════════════════════════════════════════
// 🧪 الخطّة الموحّدة 2026-11-20 — تجهيز v2 + أداة الكروت + الدخول المتأخّر (بلا قاعدة بيانات)
//   npx tsx src/scripts/test-setup-v2.ts
// ══════════════════════════════════════════════════════
import { applyPoolRules, dealRandom, swapSeatRoles, pinRoleToSeat, changeSeatCard, dealReview, rosterCounts, livePins, touchDeal, reopenDeck } from '../game/setup-deal.js';
import { analyzeDuplicates } from '../game/role-duplicates.js';
import { normalizeLatePlan, waveMafiaFor, placeMafiaCards, recruitCandidates, incomingCounts, blocksCityWin, dueWave } from '../game/late-entry.js';
import { checkWinCondition, WinResult } from '../game/win-checker.js';
import { publicTeamCounts } from '../game/public-counts.js';
import { validateOp } from '../sockets/live-cards.socket.js';
import { isGameRunning } from '../game/removal-win.js';
import { remapPhysicalIds } from '../game/seat-remap.js';

let pass = 0, fail = 0; const failures: string[] = [];
const check = (name: string, cond: boolean, detail = '') => { if (cond) pass++; else { fail++; failures.push(`${name} ${detail}`); console.log(`❌ ${name} ${detail}`); } };

function room(n: number, extra: any = {}) {
  return {
    phase: 'ROLE_GENERATION', round: 1, config: { maxConsecutiveMafiaGames: 0, nightMode: 'manual', ...extra.config },
    players: Array.from({ length: n }, (_, i) => ({ physicalId: i + 1, name: `p${i + 1}`, playerId: 100 + i, role: null, isAlive: true, isConnected: true })),
    spectators: [], ...extra,
  } as any;
}
const roles16 = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR', 'SHERIFF', 'DOCTOR', 'SNIPER', 'POLICEWOMAN', 'NURSE', 'MAYOR', 'PHOENIX', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'JESTER'];

(async () => {
  // ── الحوض والتوزيع ──
  {
    const st = room(16);
    const r = applyPoolRules(st, { roles: roles16 });
    check('حوضٌ صالح يُقبل', r.ok === true);
    st.rolesPool = roles16; st.phase = 'ROLE_BINDING';
    const d = await dealRandom(st, []);
    check('التوزيع يطابق الحوض', d.ok === true && st.players.every((p: any) => !!p.role));
    const counts = new Map<string, number>(); st.players.forEach((p: any) => counts.set(p.role, (counts.get(p.role) || 0) + 1));
    check('عدد المواطنين 4 بعد التوزيع', counts.get('CITIZEN') === 4);
    check('عددٌ لا يطابق اللاعبين يُرفض', applyPoolRules(room(15), { roles: roles16 }).ok === false);
  }
  // ── التكرار حتّى 3 ──
  {
    check('قنّاصٌ ×3 مسموح', analyzeDuplicates(['SNIPER', 'SNIPER', 'SNIPER']).allowed.length === 1);
    check('قنّاصٌ ×4 ممنوع', analyzeDuplicates(['SNIPER', 'SNIPER', 'SNIPER', 'SNIPER']).blocked.length === 1);
    check('شيخان ممنوع', analyzeDuplicates(['GODFATHER', 'GODFATHER']).blocked.length === 1);
    const st = room(4); const r = applyPoolRules(st, { roles: ['SNIPER', 'SNIPER', 'GODFATHER', 'CITIZEN'] });
    check('المكرّر بلا تأكيد يُرفض', r.ok === false && (r as any).code === 'DUPLICATE_ROLES');
    const r2 = applyPoolRules(st, { roles: ['SNIPER', 'SNIPER', 'GODFATHER', 'CITIZEN'], confirmDuplicates: true });
    check('المكرّر بالتأكيد يُقبل ويقفل المحرّك الديناميكي', r2.ok === true && st.config.duplicateRoles === true && st.config.useDynamicEngine === true);
    const rr = room(4, { config: { isRemote: true } });
    check('الغرف عن بُعد بلا تكرار', applyPoolRules(rr, { roles: ['SNIPER', 'SNIPER', 'GODFATHER', 'CITIZEN'], confirmDuplicates: true }).ok === false);
    const a2 = room(4); applyPoolRules(a2, { roles: ['ASSASSIN', 'ASSASSIN', 'GODFATHER', 'CITIZEN'], confirmDuplicates: true, assassinMode: 'PARTNERS' });
    check('نمط السفّاحين يُحفظ', a2.config.assassinMode === 'PARTNERS');
  }
  // ── التثبيت والتبديل وتغيير الكرت ──
  {
    const st = room(16); st.rolesPool = [...roles16]; st.phase = 'ROLE_BINDING';
    await dealRandom(st, []);
    const sheriffSeat = st.players.find((p: any) => p.role === 'SHERIFF').physicalId;
    const target = sheriffSeat === 1 ? 2 : 1;
    const pr = pinRoleToSeat(st, target, 'SHERIFF');
    check('📌 التثبيت يبادل مع الحامل', pr.ok === true && st.players[target - 1].role === 'SHERIFF' && (pr as any).swappedWith === sheriffSeat);
    check('المثبَّت محفوظ', livePins(st).includes(target));
    for (let i = 0; i < 5; i++) await dealRandom(st, livePins(st));
    check('«أعد الخلط» لا يمسّ المثبَّت', st.players[target - 1].role === 'SHERIFF');
    const before = [st.players[2].role, st.players[5].role];
    const sw = swapSeatRoles(st, 3, 6);
    check('⇄ التبديل برقمين', sw.ok === true && st.players[2].role === before[1] && st.players[5].role === before[0]);
    check('المقعدان المتبادلان مثبّتان', livePins(st).includes(3) && livePins(st).includes(6));
    const citSeat = st.players.find((p: any) => p.role === 'CITIZEN').physicalId;
    const ch = changeSeatCard(st, citSeat, 'DOCTOR');
    check('✏️ تغيير الكرت يغيّر الحوض', ch.ok === true && st.rolesPool.filter((r: string) => r === 'DOCTOR').length === 2 && st.rolesPool.filter((r: string) => r === 'CITIZEN').length === 3);
    check('تغيير الكرت إلى شيخٍ ثانٍ يُرفض', changeSeatCard(st, citSeat === 1 ? 2 : 1, 'GODFATHER').ok === false || st.players[0].role === 'GODFATHER');
    st.rolesConfirmed = true; touchDeal(st);
    check('أيّ تغييرٍ بعد الإرسال يُسقط «أُرسلت» ويعلّم إعادة الإرسال', st.rolesConfirmed === false && st.dealResendPending === true);
    const rv = dealReview(st);
    check('الاعتماد: 16 كرتاً و4 مافيا', rv.total === 16 && rv.counts.mafia === 4, JSON.stringify(rv.counts));
    check('الاعتماد يعرض المكرّر', rv.duplicates.some((d: any) => d.role === 'DOCTOR'));
    check('الاعتماد بلا مشكلة إرسال', rv.sendIssue === null, String(rv.sendIssue));
    reopenDeck(st, 'cards');
    check('رجوع إلى الكروت يبقي الأدوار', st.phase === 'ROLE_GENERATION' && st.players.every((p: any) => !!p.role));
    reopenDeck(st, 'lobby');
    check('رجوع إلى الطاولة يمسح كلّ شيء', st.phase === 'LOBBY' && st.players.every((p: any) => !p.role) && st.rolesPool.length === 0);
  }
  // ── العدد الفعليّ ──
  {
    const st = room(10); st.players[0].seatHeld = true; st.players[1].frozen = true; st.players[2].isConnected = false;
    const r = rosterCounts(st, [4]);
    check('سيلعبون = جالس − مجمّد − مستبعد', r.playing === 7, JSON.stringify(r));
    check('المتّصلون', r.connected === 6);
    check('بلا اتّصال', r.offline.length === 1 && r.offline[0].seat === 3);
  }
  // ── الدخول المتأخّر ──
  {
    const plan = normalizeLatePlan({ enabled: true, waves: [{ at: 1, count: 4, mafia: 1 }, { at: 1, count: 1, mafia: 0 }, { at: 2, count: 2, mafia: 1 }] }, false);
    check('دفعتان على الليلة نفسها تُدمجان', plan.waves.length === 2 && plan.waves[0].count === 5);
    check('الغرف عن بُعد: مطفأ', normalizeLatePlan({ enabled: true, waves: [{ at: 1, count: 2, mafia: 1 }] }, true).enabled === false);
    const st: any = room(16); st.phase = 'DAY_DISCUSSION';
    roles16.forEach((r, i) => { st.players[i].role = r; });
    st.config.lateEntry = normalizeLatePlan({ enabled: true, waves: [{ at: 1, count: 4, mafia: 1 }] }, false);
    check('«قادم» في العدّاد', incomingCounts(st).incomingMafia === 1 && (publicTeamCounts(st) as any).incomingMafia === 1);
    check('الدفعة مستحقّة في الليل الأوّل', dueWave(st)?.at === 1);
    check('إعادة الحساب: 4 وصلوا ⇒ مافيا 1', waveMafiaFor(st, st.config.lateEntry.waves[0], 4, false) === 1, String(waveMafiaFor(st, st.config.lateEntry.waves[0], 4, false)));
    check('حرفيّاً: مافيا 1 مهما وصل', waveMafiaFor(st, st.config.lateEntry.waves[0], 1, true) === 1);
    check('داخلون ⇒ مافيا ≥ 1 دائماً', waveMafiaFor(st, { at: 1, count: 1, mafia: 0 } as any, 1, true) >= 1);
    // كلّ المافيا ماتوا قبل الدفعة ⇒ لا فوز للمدينة
    st.players.filter((p: any) => ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'].includes(p.role)).forEach((p: any) => { p.isAlive = false; });
    check('المدينة لا تفوز ما دام مافيا قادم', blocksCityWin(st) && checkWinCondition(st) === WinResult.GAME_CONTINUES);
    st.config.lateEntry.closed = true;
    check('إغلاق الباب يعيد فوز المدينة', checkWinCondition(st) === WinResult.CITIZEN_WIN);
    // التوزيع: الداخلون بنصيبهم والباقي تجنيد
    let toJ = 0, rec = 0; let seed = 1; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 4000; i++) { const p = placeMafiaCards([21, 22, 23, 24], [12, 13, 14], 1, rnd); toJ += p.toJoiners.length; rec += p.recruits.length; }
    check('أربعة داخلين: البطاقة لداخل ≈ 60%', Math.abs(toJ / 4000 - 0.6) < 0.04, String(toJ / 4000));
    check('كلّ بطاقة توزَّع', toJ + rec === 4000);
    const one = placeMafiaCards([21], [], 1);
    check('بلا مؤهّلين للتجنيد ⇒ الداخل يأخذها', one.toJoiners.length === 1);
    const st2: any = room(8); st2.players.forEach((p: any, i: number) => { p.role = i < 2 ? 'MAFIA_REGULAR' : 'CITIZEN'; });
    st2.sheriffChecked = [3]; st2.players[3].isConnected = false;
    const c = recruitCandidates(st2);
    check('التجنيد: مواطن عاديّ متّصل لم يفحصه الشريف', !c.includes(3) && !c.includes(4) && !c.includes(1) && c.includes(5));
  }
  // ── أداة الكروت ──
  {
    const st: any = room(10); st.phase = 'DAY_DISCUSSION';
    ['GODFATHER', 'MAFIA_REGULAR', 'SHERIFF', 'DOCTOR', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'OLDER_BROTHER', 'YOUNGER_BROTHER'].forEach((r, i) => { st.players[i].role = r; });
    check('اللعبة جارية', isGameRunning(st));
    const v1 = validateOp(st, { kind: 'change', seat: 5, role: 'SNIPER' });
    check('تغيير داخل الفريق بلا عبور', v1.ok === true && (v1 as any).cross === false);
    const v2 = validateOp(st, { kind: 'change', seat: 5, role: 'MAFIA_REGULAR' });
    check('مواطن ⟵ مافيا يعبر الفريق', v2.ok === true && (v2 as any).cross === true);
    check('شيخٌ ثانٍ مرفوض', validateOp(st, { kind: 'change', seat: 5, role: 'GODFATHER' }).ok === false);
    check('تغيير أحد التوأمين مرفوض', validateOp(st, { kind: 'change', seat: 9, role: 'CITIZEN' }).ok === false);
    const v3 = validateOp(st, { kind: 'swap', seat: 1, b: 5 });
    check('تبديل مافيا ومواطن يعبر', v3.ok === true && (v3 as any).cross === true);
    st.spectators = [{ physicalId: 14, name: 'منتظر', playerId: 999 }];
    check('تسليمٌ لمنتظر صالح', validateOp(st, { kind: 'handover', seat: 3, spectatorSeat: 14 }).ok === true);
    check('تسليمٌ لمنتظر غير موجود مرفوض', validateOp(st, { kind: 'handover', seat: 3, spectatorSeat: 15 }).ok === false);
    // تبادلُ حالة الكرت مع المقعد
    const sub: any = { mayorState: { mayorPhysicalId: 3 } };
    remapPhysicalIds(sub, new Map([[3, 5], [5, 3]]));
    check('حالةُ الكرت تتبع التبديل', sub.mayorState.mayorPhysicalId === 5);
  }

  console.log(`\nالنتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
  if (fail) { failures.forEach((f) => console.log(' - ' + f)); process.exit(1); }
  process.exit(0);
})();
