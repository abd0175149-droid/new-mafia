// ══════════════════════════════════════════════════════
// 🧪 موسم النبوءة · المرحلة ٥ — الكفيل (كرتٌ اختياريّ) — مسار المقبس الحقيقيّ
//
// تشغيل: npx tsx src/scripts/test-guarantor.ts
// بلا Redis (مخزن الذاكرة) وبلا قاعدة بيانات.
//
// قرارات المالك: ٣٩ (يدويّ، لا يمسّ المنطق إن لم يُضَف) · ٤٠ (التصويت والصفقات، وكفالة
// هدف صفقةٍ بريء تُلغي الصفقة كلّها) · ب٥ (يسجّلها الموجّه).
// ══════════════════════════════════════════════════════

import { primeTestDefs } from './_game-fixtures.js';
import { registerDayEvents } from '../sockets/day.socket.js';
import { createRoom, Phase } from '../game/state.js';
import { getGameState, setGameState, deleteGameState } from '../config/redis.js';
import { initGuarantorState, kafalaEligible, takeKafalaDeath } from '../game/guarantor-engine.js';
import { initMayorState } from '../game/mayor-engine.js';
import { initDeceiverState, placeMask } from '../game/deceiver-engine.js';
import { initOracleState } from '../game/oracle-engine.js';
import { initTwinState } from '../game/twin-engine.js';
import { resolveVoting } from '../game/vote-engine.js';
import { projectStateFor, stripSecrets } from '../sockets/broadcast.util.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const section = (t: string) => console.log(`\n━━━ ${t} ━━━`);

const all: any[] = [];
let emitted: Array<{ to: string; ev: string; payload: any }> = [];
let seq = 0;
function mkSocket(role: string, physicalId?: number) {
  const handlers = new Map<string, Function>();
  const s: any = {
    id: `sk${++seq}`, data: { role, physicalId }, rooms: new Set<string>(),
    handshake: { address: '127.0.0.1', headers: {}, auth: {}, query: {} },
    on: (ev: string, fn: Function) => { handlers.set(ev, fn); return s; },
    join: (r: string) => { s.rooms.add(r); }, leave: (r: string) => { s.rooms.delete(r); },
    emit: (ev: string, payload: any) => { emitted.push({ to: s.id, ev, payload }); return true; },
    to: () => ({ emit() { return true; } }), broadcast: { to: () => ({ emit() { return true; } }), emit() { return true; } },
    disconnect() {},
  };
  all.push(s);
  registerDayEvents(io, s);
  return {
    s,
    call: (ev: string, data: any): Promise<any> => new Promise((resolve, reject) => {
      const h = handlers.get(ev);
      if (!h) return reject(new Error(`no handler ${ev}`));
      const t = setTimeout(() => reject(new Error(`timeout ${ev}`)), 15000);
      Promise.resolve(h(data, (r: any) => { clearTimeout(t); resolve(r); })).catch((e) => { clearTimeout(t); reject(e); });
    }),
  };
}
const io: any = {
  to: (room: string) => ({ emit: (ev: string, payload: any) => { emitted.push({ to: room, ev, payload }); return true; } }),
  in: (room: string) => ({ fetchSockets: async () => all.filter((s) => s.rooms.has(room)), emit: () => true }),
  emit: () => true, sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
};
io.of = () => io;

// ١ الشيخ · ٢ مافيا · ٣ المُضلّل · ٤ العرّاف · ٥ الكفيل · ٦ الشريف · ٧ العمدة · ٨..١٣ مواطنون · ١٤ المهرّج · ١٥ العنقاء
const ROLES: Record<number, string> = { 1: 'GODFATHER', 2: 'MAFIA_REGULAR', 3: 'DECEIVER', 4: 'ORACLE', 5: 'GUARANTOR', 6: 'SHERIFF', 7: 'MAYOR', 14: 'JESTER', 15: 'PHOENIX' };
const P = (seat: number, role?: string): any => ({ physicalId: seat, name: `لاعب ${seat}`, phone: null, playerId: 9000 + seat, role: role || ROLES[seat] || 'CITIZEN', isAlive: true, isSilenced: false, justificationCount: 0, gender: 'MALE' });
const pc = (t: number, v: number) => ({ type: 'PLAYER', targetPhysicalId: t, votes: v, voters: v });

let leader: any, display: any, phone8: any, phone5: any;
const rooms: any[] = [];

/** غرفةٌ في طور التبرير والتصويت محسوم لـ `candidates` */
async function room(opts: { candidates: any[]; deals?: any[]; noGuarantor?: boolean; noMayor?: boolean; players?: any[]; bomb?: boolean; twins?: boolean; field?: 'absent' }): Promise<string> {
  const st: any = await createRoom('فحص الكفيل', 20);
  rooms.push(st);
  const roomId: string = st.roomId;
  st.players = opts.players || Array.from({ length: 15 }, (_, i) => P(i + 1));
  if (opts.noGuarantor) st.players = st.players.map((p: any) => (p.role === 'GUARANTOR' ? { ...p, role: 'CITIZEN' } : p));
  if (opts.noMayor) st.players = st.players.map((p: any) => (p.role === 'MAYOR' ? { ...p, role: 'CITIZEN' } : p));
  st.phase = Phase.DAY_JUSTIFICATION;
  st.round = 3;
  st.rolesConfirmed = true;
  st.config = { ...st.config, bombEnabled: opts.bomb ?? false, useDynamicEngine: true, jesterSurviveRounds: 1, prophecy: true };
  st.votingState = { candidates: opts.candidates, deals: opts.deals || [], totalVotesCast: 9, hiddenPlayersFromVoting: [], tieBreakerLevel: 0, playerVotes: {} };
  st.performanceTracking = { dealOutcomes: [], abilityResults: [], eliminationLog: [] };
  st.mayorState = initMayorState(st);
  st.deceiverState = initDeceiverState(st);
  st.oracleState = initOracleState(st);
  st.twinState = opts.twins ? initTwinState(st) : null;
  if (opts.field !== 'absent') st.guarantorState = initGuarantorState(st);
  await setGameState(roomId, st);
  for (const x of [leader, display, phone8, phone5]) { x.s.join(roomId); x.s.data.roomId = roomId; }
  emitted = [];
  return roomId;
}
const S = async (roomId: string): Promise<any> => await getGameState(roomId);
const alive = (st: any, seat: number) => st.players.find((p: any) => p.physicalId === seat)?.isAlive;
const sentTo = (sk: any, ev: string) => emitted.filter((e) => e.to === sk.s.id && e.ev === ev);
const toRoom = (roomId: string, ev: string) => emitted.filter((e) => e.to === roomId && e.ev === ev);
const exec = (roomId: string, extra: any = {}) => leader.call('day:execute-elimination', { roomId, skipWithdrawal: true, ...extra });
const decide = (roomId: string, decision: string, who = leader) => who.call('day:kafala-decision', { roomId, decision });

async function main() {
  primeTestDefs();
  leader = mkSocket('leader');
  display = mkSocket('display');
  phone8 = mkSocket('player', 8);
  phone5 = mkSocket('player', 5);

  section('النافذة');
  {
    const r = await room({ candidates: [pc(9, 6), pc(10, 2)] });
    const out = await exec(r);
    check('بعد الفرز تُفتح نافذة الكفالة قبل العمدة', out?.kafalaWindow === true && out.window?.winner?.targetPhysicalId === 9 && !out.mayorWindow, JSON.stringify(out));
    check('تصل الموجّه وحده', sentTo(leader, 'day:kafala-window').length === 1 && !sentTo(display, 'day:kafala-window').length && !sentTo(phone8, 'day:kafala-window').length && !sentTo(phone5, 'day:kafala-window').length);
    const again = await exec(r);
    check('ضغطةٌ ثانية تُعيد النافذة نفسها', again?.kafalaWindow === true && again.resent === true);
    check('لا أحد مات بعد', alive(await S(r), 9) === true);
    const byPhone = await decide(r, 'GUARANTEE', phone5);
    check('هاتف الكفيل لا يقرّر (ب٥: الموجّه)', byPhone?.success === false && (await S(r)).guarantorState.used === false);
  }

  section('مواطنٌ مكفول ⇒ ينجو، ولا موت اليوم');
  {
    const r = await room({ candidates: [pc(9, 6), pc(10, 2)] });
    await exec(r);
    const out = await decide(r, 'GUARANTEE');
    const st = await S(r);
    check('نجا', out?.success === true && out.outcome === 'SAVED' && alive(st, 9) === true && alive(st, 5) === true, JSON.stringify(out));
    check('النهار ينتهي بلا موت', st.phase === Phase.DAY_ELIMINATION && st.pendingResolution?.type === 'KAFALA_SAVED' && st.pendingResolution.eliminated.length === 0);
    check('الكفالة استُعملت', st.guarantorState.used === true && st.guarantorState.result.outcome === 'SAVED');
    const ann = toRoom(r, 'day:kafala')[0]?.payload;
    check('«كفله رقم ٥» للقاعة بلا النتيجة', ann?.guarantorPhysicalId === 5 && ann.targetPhysicalId === 9 && ann.outcome === undefined, JSON.stringify(ann));
    const pend = sentTo(phone8, 'day:elimination-pending')[0]?.payload;
    check('الهاتف لا يرى الحكم قبل الكشف', pend && pend.kafala === undefined);
    const pendL = sentTo(leader, 'day:elimination-pending')[0]?.payload;
    check('الموجّه والشاشة يرونه', pendL?.kafala?.outcome === 'SAVED' && sentTo(display, 'day:elimination-pending')[0]?.payload?.kafala?.outcome === 'SAVED');
    check('لا نافذة عمدة بعد الكفالة', !sentTo(leader, 'day:mayor-window').length);
  }

  section('مافيا مكفول ⇒ يُعدم ويموت الكفيل معه');
  {
    const r = await room({ candidates: [pc(2, 6), pc(10, 2)] });
    await exec(r);
    const out = await decide(r, 'GUARANTEE');
    const st = await S(r);
    check('أُعدم ٢ ومات الكفيل ٥', out?.outcome === 'FAILED' && alive(st, 2) === false && alive(st, 5) === false, JSON.stringify(out?.result));
    const res = out.result;
    check('يُقلب كرتُ الكفيل معه', res.eliminated.includes(5) && res.revealedRoles.some((x: any) => x.physicalId === 5 && x.role === 'GUARANTOR') && res.causes.some((c: any) => c.physicalId === 5 && c.by === 'KAFALA'));
    check('النتيجة في حمولة الإقصاء', st.pendingResolution?.kafala?.outcome === 'FAILED' && st.pendingResolution.kafala.guarantorPhysicalId === 5);
    check('لا نافذة عمدة', !sentTo(leader, 'day:mayor-window').length);
    check('سجلّ الإقصاء: KAFALA', st.performanceTracking.eliminationLog.some((e: any) => e.physicalId === 5 && e.eliminatedBy === 'KAFALA'));
  }
  {
    // الشيخ بقنبلته — والكفيل جاره (٥ و٦ حوله لو كان الشيخ ٦)
    const pl = Array.from({ length: 15 }, (_, i) => P(i + 1));
    pl[0] = P(1, 'CITIZEN'); pl[5] = P(6, 'GODFATHER'); // الشيخ ٦، الكفيل ٥ تحته
    const r = await room({ candidates: [pc(6, 6), pc(10, 2)], players: pl, bomb: true });
    await exec(r);
    const out = await decide(r, 'GUARANTEE');
    const st = await S(r);
    check('الشيخ أُعدم والكفيل معه', alive(st, 6) === false && alive(st, 5) === false);
    check('القنبلة كعادتها — ولا تختار الكفيل الميّت', !!st.pendingBomb && st.pendingBomb.below?.physicalId === 4 && st.pendingBomb.above?.physicalId === 7, JSON.stringify(st.pendingBomb));
  }
  {
    const r = await room({ candidates: [pc(14, 6), pc(10, 2)] });
    await exec(r);
    const out = await decide(r, 'GUARANTEE');
    const st = await S(r);
    check('المهرّج فخّ: يفوز، ويموت الكفيل', out?.outcome === 'FAILED' && alive(st, 5) === false && (out.result.neutralWin?.won === true || st.winner === 'JESTER'), JSON.stringify(out.result.neutralWin));
  }

  section('الصفقات (قرار ٤٠)');
  {
    const deal = { id: 'dl1', initiatorPhysicalId: 11, targetPhysicalId: 9 };
    const r = await room({ candidates: [{ type: 'DEAL', id: 'dl1', initiatorPhysicalId: 11, targetPhysicalId: 9, votes: 6, voters: 6 }, pc(10, 2)], deals: [deal] });
    await exec(r);
    const out = await decide(r, 'GUARANTEE');
    const st = await S(r);
    check('هدفٌ بريء ⇒ الصفقة كلّها تُلغى: لا هدف ولا صاحب', out?.outcome === 'SAVED' && alive(st, 9) && alive(st, 11) && alive(st, 5));
    check('ولا أثر لها في الصفقات', !(st.votingState.deals || []).some((d: any) => d.id === 'dl1') && !(st.votingState.candidates || []).some((c: any) => c.id === 'dl1'));
  }
  {
    const deal = { id: 'dl2', initiatorPhysicalId: 11, targetPhysicalId: 2 };
    const r = await room({ candidates: [{ type: 'DEAL', id: 'dl2', initiatorPhysicalId: 11, targetPhysicalId: 2, votes: 6, voters: 6 }, pc(10, 2)], deals: [deal] });
    await exec(r);
    const out = await decide(r, 'GUARANTEE');
    const st = await S(r);
    check('هدفٌ مافيا ⇒ الصفقة تمرّ، وصاحبُها حيّ، والكفيل يموت', out?.outcome === 'FAILED' && !alive(st, 2) && alive(st, 11) && !alive(st, 5));
  }
  {
    const r = await room({ candidates: [{ type: 'DEAL', id: 'prophecy-3', kind: 'PROPHECY', initiatorPhysicalId: 0, targetPhysicalId: 9, votes: 6, voters: 6 }, pc(10, 2)], deals: [{ id: 'prophecy-3', kind: 'PROPHECY', initiatorPhysicalId: 0, targetPhysicalId: 9 }] });
    const st0 = await S(r);
    Object.assign(st0.oracleState, { used: true, openedRound: 2, seenPhysicalId: 9, dealRound: 3, boxes: { aPhysicalId: 9, bPhysicalId: 2, mafiaBox: 'B' }, chosenBox: 'A' });
    await setGameState(r, st0);
    await exec(r);
    const out = await decide(r, 'GUARANTEE');
    const st = await S(r);
    check('صفقة النبوءة على بريء ⇒ «مكفولة»، والعرّاف حيّ', out?.outcome === 'SAVED' && st.oracleState.outcome === 'GUARANTEED' && alive(st, 4) && alive(st, 9));
  }

  section('الحقيقة لا المظهر');
  {
    const r = await room({ candidates: [pc(9, 6), pc(10, 2)] });
    const st0 = await S(r); st0.round = 2; placeMask(st0, 3, 9); st0.round = 3; await setGameState(r, st0);
    await exec(r);
    const out = await decide(r, 'GUARANTEE');
    check('بريءٌ مقنَّع ⇒ ينجو', out?.outcome === 'SAVED' && alive(await S(r), 9));
  }
  {
    const r = await room({ candidates: [pc(15, 6), pc(10, 2)] });
    await exec(r);
    const out = await decide(r, 'GUARANTEE');
    const st = await S(r);
    check('العنقاء ينجو ⇒ لا لعنة رماد', out?.outcome === 'SAVED' && alive(st, 15) && !st.pendingAshCurse);
  }
  {
    const pl = Array.from({ length: 15 }, (_, i) => P(i + 1));
    pl[1] = P(2, 'OLDER_BROTHER'); pl[8] = P(9, 'YOUNGER_BROTHER');
    const r = await room({ candidates: [pc(2, 6), pc(10, 2)], players: pl, twins: true });
    await exec(r);
    const out = await decide(r, 'GUARANTEE');
    const st = await S(r);
    check('الأخ الأكبر مكفول ⇒ يُعدم، والكفيل معه، والأصغر يتحوّل', out?.outcome === 'FAILED' && !alive(st, 2) && !alive(st, 5) && st.twinState.transformed === true);
  }

  section('التمرير والمرّة الواحدة');
  {
    const r = await room({ candidates: [pc(9, 6), pc(10, 2)] });
    await exec(r);
    const out = await decide(r, 'PASS');
    check('تمرير ⇒ نافذة العمدة كالمعتاد', out?.passed === true && out.mayorWindow === true, JSON.stringify(out));
    const st = await S(r);
    check('والكفالة باقية', st.guarantorState.used === false && st.guarantorState.window === null);
    const again = await exec(r);
    check('ولا تُفتح ثانيةً لهذه الجولة', !again?.kafalaWindow && again?.mayorWindow === true, JSON.stringify(again));
  }
  {
    const r = await room({ candidates: [pc(9, 6), pc(10, 2)], noMayor: true });
    await exec(r);
    const out = await decide(r, 'PASS');
    check('تمرير بلا عمدة ⇒ الإعدام يمضي', out?.passed === true && out.result?.eliminated?.includes(9) && !alive(await S(r), 9) && alive(await S(r), 5));
  }
  {
    const r = await room({ candidates: [pc(9, 6), pc(10, 2)] });
    const st0 = await S(r); st0.guarantorState.used = true; await setGameState(r, st0);
    const out = await exec(r);
    check('استُعملت ⇒ لا نافذة', !out?.kafalaWindow && out?.mayorWindow === true);
  }
  {
    const r = await room({ candidates: [pc(5, 6), pc(10, 2)] });
    const out = await exec(r);
    check('لا يكفل نفسه', !out?.kafalaWindow);
  }
  {
    const r = await room({ candidates: [pc(9, 4), pc(10, 4)] });
    const out = await exec(r);
    check('التعادل لا كفالة فيه', !out?.kafalaWindow);
  }
  {
    const r = await room({ candidates: [pc(9, 6), pc(10, 2)] });
    await exec(r);
    const st0 = await S(r); st0.phase = Phase.DAY_VOTING; await setGameState(r, st0);
    const out = await decide(r, 'GUARANTEE');
    check('قرارٌ متأخّر بعد تغيّر الجولة يُرفض', out?.success === false && (await S(r)).guarantorState.used === false);
  }

  section('بلا الكرت (قرار ٣٩) — لا شيء يتغيّر');
  {
    const r = await room({ candidates: [pc(9, 6), pc(10, 2)], noGuarantor: true });
    const st = await S(r);
    check('لا حالة', st.guarantorState === null);
    const out = await exec(r);
    check('مباشرةً إلى نافذة العمدة كما كان', !out?.kafalaWindow && out?.mayorWindow === true);
    check('ولا حدث كفالة', !emitted.some((e) => e.ev.startsWith('day:kafala')));
  }
  {
    // نفس الطاولة: الحقل غائب كلّياً (غرفةٌ قبل الموسم) مقابل null — نتيجةُ الإعدام واحدة
    const a = await room({ candidates: [pc(1, 6), pc(10, 2)], noGuarantor: true, noMayor: true, bomb: true });
    const b = await room({ candidates: [pc(1, 6), pc(10, 2)], noGuarantor: true, noMayor: true, bomb: true, field: 'absent' });
    const ra = await resolveVoting(a);
    const rb = await resolveVoting(b);
    const sa = await S(a), sb = await S(b);
    check('النتيجة متطابقة', JSON.stringify(ra) === JSON.stringify(rb), JSON.stringify({ ra, rb }));
    check('والقنبلة متطابقة', JSON.stringify(sa.pendingBomb) === JSON.stringify(sb.pendingBomb));
    check('ولا موتَ كفيل', takeKafalaDeath(sa, 1) === null && kafalaEligible(sa, { type: 'PLAYER', targetPhysicalId: 9 }) === false);
  }

  section('السرّيّة');
  {
    const r = await room({ candidates: [pc(9, 6), pc(10, 2)] });
    await exec(r);
    const st = await S(r);
    for (const seat of [5, 8]) check(`هاتف ${seat} لا يرى حالة الكفيل`, projectStateFor(st, seat).guarantorState === undefined);
    check('المتفرّجون لا يرونها', stripSecrets(st).guarantorState === undefined);
  }

  for (const st of rooms) { await deleteGameState(st.roomId); await deleteGameState(`code:${st.roomCode}`); }
  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} نجح · ${fail} فشل`);
  if (fail) { console.log(failures.map((f) => '   • ' + f).join('\n')); }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('💥', e); process.exit(2); });
