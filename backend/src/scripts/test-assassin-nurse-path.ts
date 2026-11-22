// ══════════════════════════════════════════════════════
// 🧪 السفّاح والقنّاص في الليلة الواحدة — مسار «الممرّضة تصحو» (لعبة 965، 2026-11-22). بلا Redis ولا DB
//
// 16 لاعباً افتراضيّاً + 3 منتظرين. يمرّ بكلّ ما بُني:
//   الطاولة ⟵ التحضير (prepare-deal بكرتٍ مكرَّر) ⟵ 📌 تثبيت ⟵ ⇄ تبديل ⟵ ✏️ تغيير كرت ⟵ 📋 الاعتماد
//   ⟵ «اعتمد وأرسل» ⟵ «ابدأ» ⟵ 🔍 سؤال الشريف (الكرت وحده) ⟵ 🃏 أداة الكروت عند النقطة الآمنة
//   ⟵ 🚪 بوّابة الليل الأوّل والتجنيد ⟵ «مافيا قادم» وحكم الفوز ⟵ الطرد يفحص الفوز.
// لا يُكتب شيءٌ خارج هذه العمليّة.
//
// تشغيل: npx tsx src/scripts/test-assassin-nurse-path.ts
// ══════════════════════════════════════════════════════
process.env.FORCE_FLAGS = process.env.FORCE_FLAGS || 'live_cards_v1';
import { registerLobbyEvents } from '../sockets/lobby.socket.js';
import { registerSetupV2Events } from '../sockets/setup-v2.socket.js';
import { registerLiveCardEvents, applySafePoint } from '../sockets/live-cards.socket.js';
import { registerNightEvents } from '../sockets/night.socket.js';
import { registerOneNightEvents } from '../sockets/night-one.socket.js';
import { createRoom, getRoom } from '../game/state.js';
import { setGameState } from '../config/redis.js';
import { primeTestDefs } from './_game-fixtures.js';

let pass = 0, fail = 0; const failures: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
};

const all: any[] = [];
const emitted: Array<{ to: string; ev: string; payload: any }> = [];
let seq = 0;
function mkSocket(data: any = {}) {
  const handlers = new Map<string, Function>();
  const s: any = {
    id: `sk${++seq}`, data: { ...data }, rooms: new Set<string>(),
    handshake: { address: '127.0.0.1', headers: {}, auth: {}, query: {} },
    on: (ev: string, fn: Function) => { handlers.set(ev, fn); return s; },
    join: (r: string) => { s.rooms.add(r); }, leave: (r: string) => { s.rooms.delete(r); },
    emit: (ev: string, payload: any) => { emitted.push({ to: s.id, ev, payload }); return true; },
    to: () => ({ emit() { return true; } }), broadcast: { to: () => ({ emit() { return true; } }), emit() { return true; } },
    disconnect() {},
  };
  all.push(s);
  return {
    s,
    call: (ev: string, d: any): Promise<any> => new Promise((resolve, reject) => {
      const h = handlers.get(ev);
      if (!h) return reject(new Error(`no handler ${ev}`));
      const t = setTimeout(() => reject(new Error(`timeout ${ev}`)), 20000);
      Promise.resolve(h(d, (r: any) => { clearTimeout(t); resolve(r); })).catch((e) => { clearTimeout(t); reject(e); });
    }),
  };
}
const io: any = {
  to: (room: string) => ({ emit: (ev: string, payload: any) => { emitted.push({ to: room, ev, payload }); return true; } }),
  in: (room: string) => ({ fetchSockets: async () => all.filter((s) => s.rooms.has(room)), emit: () => true }),
  emit: () => true, sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
};
io.of = () => io;
const reg = (x: ReturnType<typeof mkSocket>) => { registerLobbyEvents(io, x.s); registerSetupV2Events(io, x.s); registerLiveCardEvents(io, x.s); registerNightEvents(io, x.s); registerOneNightEvents(io, x.s); return x; };
const since = (n: number) => emitted.slice(n);


async function play(label: string, withGate: boolean, doctorOut = false) {
  console.log(`\n━━━ ${label} ━━━`);
  const leader = reg(mkSocket({ role: 'leader', authStaff: { id: 1, role: 'admin' } }));
  const st0 = await createRoom('إعادة إنتاج السفّاح', 24);
  const roomId = st0.roomId;
  leader.s.join(roomId); leader.s.data.roomId = roomId;
  for (let i = 1; i <= 20; i++) {
    const r = await leader.call('room:force-add-player', { roomId, physicalId: i, name: `لاعب ${i}`, phone: `0791200${String(i).padStart(3, '0')}`, dob: '1995-01-01', gender: 'MALE' });
    if (!r?.success) throw new Error(`force-add ${i}: ${r?.error}`);
    const ph = reg(mkSocket({ role: 'player', roomId, physicalId: i })); ph.s.join(roomId);
  }
  await leader.call('room:roster', { roomId, excluded: [] });
  await leader.call('room:update-settings', { roomId, gameTimerMinutes: 75, nightKind: 'one', nightSeconds: 60 });
  const roles = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR', 'WITCH', 'SHERIFF', 'DOCTOR', 'NURSE', 'SNIPER', 'SNIPER', 'PHOENIX', 'MAYOR', 'POLICEWOMAN', 'ASSASSIN', 'JESTER', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'];
  await leader.call('room:start-generation', { roomId, supportsAbsentPrompt: true });
  const prep = await leader.call('setup:prepare-deal', { roomId, roles, supportsDuplicatePrompt: true, confirmDuplicates: true, jesterSurviveRounds: 3, mayorVoteWeight: 2 });
  if (!prep?.success) throw new Error('prep ' + JSON.stringify(prep).slice(0, 200));
  const rv = await leader.call('setup:review', { roomId });
  await leader.call('setup:confirm-roles', { roomId, expectedRev: rv.review.rev });
  const start = await leader.call('setup:binding-complete', { roomId });
  let st: any = await getRoom(roomId);
  check('بدأت اللعبة', start?.success === true && st.phase === 'DAY_DISCUSSION', JSON.stringify(start).slice(0, 120));
  const aSeat = st.players.find((p: any) => p.role === 'ASSASSIN').physicalId;
  const witch = st.players.find((p: any) => p.role === 'WITCH').physicalId;
  const snipers = st.players.filter((p: any) => p.role === 'SNIPER').map((p: any) => p.physicalId);
  console.log(`  السفّاح ${aSeat} · الساحرة ${witch} · القنّاصان ${snipers} · round ${st.round} · assassinState ${JSON.stringify(st.assassinState)}`);

  if (doctorOut) {
    // كلعبة 965: الطبيب يخرج نهار الجولة الأولى ⇒ كلّ ليلةٍ تمرّ بمسار «الممرّضة تصحو»
    st.players.find((p: any) => p.role === 'DOCTOR').isAlive = false;
    await setGameState(roomId, st);
  }
  if (withGate) {
    st.config.lateEntry = { enabled: true, waves: [{ at: 1, count: 2, mafia: 1 }], recompute: false, closed: false };
    st.spectators = [21, 22].map((n) => ({ physicalId: n, name: `متأخّر ${n}`, phone: `0791300${n}`, playerId: null, joinedAt: Date.now() + n }));
    await setGameState(roomId, st);
    const ns = await leader.call('night:start', { roomId, oneNight: true, supportsLateGate: true });
    check('البوّابة', ns?.code === 'LATE_GATE', JSON.stringify(ns).slice(0, 120));
    const og = await leader.call('late:open-gate', { roomId, seats: [21, 22], literal: true });
    check('دخلا', og?.success === true, JSON.stringify(og).slice(0, 120));
  }

  for (let night = 1; night <= 3; night++) {
    st = await getRoom(roomId);
    if (night > 1) { st.phase = 'DAY_VOTING'; await setGameState(roomId, st); }
    const ns = await leader.call('night:start', { roomId, oneNight: true, supportsLateGate: true });
    if (ns?.nurseAvailable) {
      const bq = await leader.call('night:begin-queue', { roomId, activateNurse: true, oneNight: true });
      console.log(`     💉 مسار الممرّضة: begin-queue ${bq?.success} ${bq?.mode}`);
    }
    st = await getRoom(roomId);
    const a0 = st.assassinState;
    console.log(`  🌙 ليل ${night}: night:start ${ns?.success} round=${st.round} phase=${st.phase} assassin={seat:${a0?.assassinPhysicalId}, fnp:${a0?.firstNightPassed}, won:${a0?.won}, done:${a0?.completedCount}}`);
    const os = await leader.call('night:one-start', { roomId, durationSeconds: 10 });
    st = await getRoom(roomId);
    const plan = st.oneNight?.plan || [];
    const aSlot = plan.find((s: any) => s.seat === aSeat && s.abilityId === 'ASSASSINATE');
    console.log(`     الخطّة: ${plan.map((s: any) => `${s.seat}:${s.abilityId}${s.disabled ? '(معطّل)' : ''}`).join(' · ')}`);
    check(`ليل ${night}: ${night === 1 ? 'لا اغتيال للسفّاح (أوّل ليلة)' : 'للسفّاح خطوةُ اغتيال'}`, night === 1 ? !aSlot : !!aSlot, `fnp=${a0?.firstNightPassed}`);
    // الساحرة تعطّل قنّاصاً في الليلة الأولى؛ والقنّاصان يقنصان؛ والسفّاح يغتال مواطناً
    const target = st.players.find((p: any) => p.isAlive && p.role === 'CITIZEN' && !p.lateImmuneRound)?.physicalId;
    const overrides: any[] = [];
    for (const s of plan) {
      if (s.abilityId === 'DISABLE_ABILITY') overrides.push({ seat: s.seat, abilityId: s.abilityId, targetPhysicalId: night === 1 ? snipers[0] : null });
      else if (s.abilityId === 'SNIPE') overrides.push({ seat: s.seat, abilityId: s.abilityId, targetPhysicalId: (st.players.find((p: any) => p.isAlive && p.role === 'JESTER') || st.players.find((p: any) => p.isAlive && p.role === 'CITIZEN' && p.physicalId !== target && !p.lateImmuneRound))?.physicalId ?? null });
      else if (s.abilityId === 'ASSASSINATE') overrides.push({ seat: s.seat, abilityId: s.abilityId, targetPhysicalId: target });
      else overrides.push({ seat: s.seat, abilityId: s.abilityId, targetPhysicalId: null });
    }
    await leader.call('night:one-close', { roomId });
    const ap = await leader.call('night:one-apply', { roomId, overrides });
    const rs = await leader.call('night:resolve', { roomId });
    st = await getRoom(roomId);
    console.log(`     apply ${ap?.success} resolve ${rs?.success} · الأحداث: ${(st.morningEvents || []).map((e: any) => `${e.type}→${e.targetPhysicalId}`).join(' · ')}`);
    if (night >= 2) check(`ليل ${night}: حدث «السفّاح اغتال» في الصباح`, (st.morningEvents || []).some((e: any) => e.type === 'ASSASSIN_KILL'));
    if (night === 2) {
      const v = (st.morningEvents || []).find((e: any) => e.type === 'ABILITY_VOIDED');
      check('ليل 2: القنّاص المعطَّل ⇒ سطرٌ للموجّه «لم يُنفَّذ»', !!v && v.performerPhysicalId === snipers[0] && v.extra?.abilityId === 'SNIPE', JSON.stringify(v));
      const dv = await leader.call('night:display-event', { roomId, eventIndex: (st.morningEvents || []).indexOf(v) });
      check('ولا يُعرض على الشاشة', dv?.success === false);
    }
    const er = await leader.call('night:end-recap', { roomId });
    st = await getRoom(roomId);
    if (st.pendingWinner || st.winner) { console.log('     انتهت: ' + (st.pendingWinner || st.winner)); break; }
  }
}

async function main() {
  primeTestDefs();
  await play('أ) بلا دخول متأخّر', false);
  await play('ب) مع بوّابة الليل الأوّل', true);
  await play('ج) الطبيب خارج قبل الليل الأوّل (مسار الممرّضة) + البوّابة — لعبة 965', true, true);
  await play('د) الطبيب خارج بلا بوّابة', false, true);
  console.log(`\n${pass} ✅ · ${fail} ❌`);
  if (failures.length) console.log(failures.join('\n'));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
