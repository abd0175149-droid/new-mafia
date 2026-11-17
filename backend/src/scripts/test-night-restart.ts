// ══════════════════════════════════════════════════════
// 🧪 أعِد الليل إلى أوّله (night:restart) — مسار السوكِت الحقيقيّ
//
// الحالة التي وُلد منها (2026-11-17): الليل بُدئ طابوراً والمقصود «الليلة الواحدة».
// يركّب معالجات night.socket و night-one.socket الحقيقيّة على سوكِتاتٍ وهميّة، بلا Redis
// (مخزن الذاكرة) وبلا قاعدة بيانات: لا يُكتب شيءٌ خارج هذه العمليّة.
//
// تشغيل: npx tsx src/scripts/test-night-restart.ts
// ══════════════════════════════════════════════════════

import { __primeDefsForTest } from '../game/definition-service.js';
import { registerNightEvents } from '../sockets/night.socket.js';
import { registerOneNightEvents, clearOneNightTimer } from '../sockets/night-one.socket.js';
import { createRoom, Phase } from '../game/state.js';
import { getGameState, setGameState, deleteGameState } from '../config/redis.js';

const ABILITIES_RAW = [
  { id: 'KILL', name_ar: 'اغتيال', phase: 'NIGHT', priority: 1, target_type: 'ENEMY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'ELIMINATE', effect_on_success: 'ASSASSINATION', effect_on_fail: null, is_inheritable: true, inheritance_order: ['GODFATHER', 'CHAMELEON', 'MAFIA_REGULAR', 'OLDER_BROTHER', 'SILENCER', 'WITCH'] },
  { id: 'SILENCE', name_ar: 'إسكات', phase: 'NIGHT', priority: 2, target_type: 'ANY', exclude_self: false, exclude_last_target: false, max_targets: 1, effect_type: 'SILENCE', effect_on_success: 'SILENCED', effect_on_fail: null },
  { id: 'INVESTIGATE', name_ar: 'تحقيق', phase: 'NIGHT', priority: 3, target_type: 'ANY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'REVEAL_TEAM', effect_on_success: 'SHERIFF_RESULT', effect_on_fail: null },
  { id: 'PROTECT', name_ar: 'حماية', phase: 'NIGHT', priority: 4, target_type: 'ANY', exclude_self: true, exclude_last_target: true, max_targets: 1, effect_type: 'BLOCK_ELIMINATE', effect_on_success: 'ASSASSINATION_BLOCKED', effect_on_fail: 'PROTECTION_FAILED' },
  { id: 'SNIPE', name_ar: 'قنص', phase: 'NIGHT', priority: 5, target_type: 'ANY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'CONDITIONAL_ELIMINATE', effect_on_success: 'SNIPE_MAFIA', effect_on_fail: 'SNIPE_CITIZEN' },
];
const ROLES_RAW = [
  { id: 'GODFATHER', team: 'MAFIA', abilities: ['KILL'], gen_priority: 1 },
  { id: 'SILENCER', team: 'MAFIA', abilities: ['SILENCE'], gen_priority: 2 },
  { id: 'MAFIA_REGULAR', team: 'MAFIA', abilities: [], gen_priority: 99 },
  { id: 'SHERIFF', team: 'CITIZEN', abilities: ['INVESTIGATE'], gen_priority: 1 },
  { id: 'DOCTOR', team: 'CITIZEN', abilities: ['PROTECT'], gen_priority: 2 },
  { id: 'SNIPER', team: 'CITIZEN', abilities: ['SNIPE'], gen_priority: 3 },
  { id: 'CITIZEN', team: 'CITIZEN', abilities: [], gen_priority: 99 },
];
const camelize = (o: any): any => {
  const out: any = {};
  for (const [k, v] of Object.entries(o)) out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  return out;
};
__primeDefsForTest({ abilities: ABILITIES_RAW.map(camelize) as any, roles: ROLES_RAW.map(camelize) as any, interactions: [] as any });

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

// ── سوكِتات وخادم وهميّان ──
const all: any[] = [];
const emitted: Array<{ to: string; ev: string; payload: any }> = [];
let seq = 0;
function mkSocket(role: string) {
  const handlers = new Map<string, Function>();
  const s: any = {
    id: `sk${++seq}`, data: { role }, rooms: new Set<string>(),
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

const leader = mkSocket('leader');
registerNightEvents(io, leader.s);
registerOneNightEvents(io, leader.s);
const display = mkSocket('display');
const phone = mkSocket('player');
registerNightEvents(io, phone.s);

const got = (to: string, ev: string) => emitted.filter((e) => e.to === to && e.ev === ev);
const P = (seat: number, role: string): any => ({ physicalId: seat, name: `لاعب ${seat}`, phone: null, playerId: 9000 + seat, role, isAlive: true, isSilenced: false, justificationCount: 0, gender: 'MALE' });

async function main() {
  const st: any = await createRoom('فحص إعادة الليل', 10);
  const roomId: string = st.roomId;
  for (const s of [leader.s, display.s, phone.s]) { s.join(roomId); s.data.roomId = roomId; }
  phone.s.data.physicalId = 6;

  st.players = [P(1, 'GODFATHER'), P(2, 'SILENCER'), P(3, 'SHERIFF'), P(4, 'DOCTOR'), P(5, 'SNIPER'), P(6, 'CITIZEN'), P(7, 'CITIZEN'), P(8, 'MAFIA_REGULAR')];
  st.phase = Phase.DAY_DISCUSSION;
  st.round = 1;
  st.rolesConfirmed = true;
  st.config.useDynamicEngine = true;
  st.config.nightMode = 'manual';
  st.dynamicNightState = { actions: {}, lastTargets: { '4:PROTECT': 7 } };   // ذاكرة ليلةٍ سابقة — يجب أن تنجو
  await setGameState(roomId, st);

  console.log('\n━━━ أ) قبل الليل: لا إعادة ━━━');
  {
    const r = await leader.call('night:restart', { roomId });
    check('خارج الليل يُرفض', r?.success === false, JSON.stringify(r));
  }

  console.log('\n━━━ ب) الليل بدأ طابوراً (كما تبدؤه الواجهة القديمة) ━━━');
  let roundAtNight = 0;
  {
    const r = await leader.call('night:start', { roomId });
    check('night:start بلا oneNight يبني الطابور', r?.success === true && !r.oneNight, JSON.stringify(r));
    const s: any = await getGameState(roomId);
    roundAtNight = s.round;
    check('المرحلة ليل والجولة زادت', s.phase === Phase.NIGHT && s.round === 2, `${s.phase}/${s.round}`);
    check('الطابور مبنيّ وخطوته الأولى معروضة', Array.isArray(s.dynamicQueue) && s.dynamicQueue.length >= 4 && !!s.currentNightStep, JSON.stringify((s.dynamicQueue || []).map((q: any) => q.abilityId)));

    const first = s.currentNightStep;
    const target = first.availableTargets[0].physicalId;
    const sub = await leader.call('night:submit-action', { roomId, role: first.role, targetPhysicalId: target });
    check('سُجّلت خطوةٌ في الطابور', sub?.success === true);
    const s2: any = await getGameState(roomId);
    check('…وصار في الليلة قيدٌ واحد والطابور تقدّم', Object.keys(s2.dynamicNightState.actions).length === 1 && s2.dynamicQueueIndex === 1);
  }

  console.log('\n━━━ ج) الإعادة: الطابور يسقط والليل يبقى ━━━');
  {
    const denied = await phone.call('night:restart', { roomId });
    check('اللاعب لا يُعيد الليل', denied?.success === false);
    const still: any = await getGameState(roomId);
    check('…والطابور باقٍ بعد رفضه', Array.isArray(still.dynamicQueue) && still.dynamicQueueIndex === 1);

    const before = emitted.length;
    const r = await leader.call('night:restart', { roomId });
    check('الليدر يُعيد الليل', r?.success === true && r.dropped === 1 && r.hadQueue === true, JSON.stringify(r));
    const s: any = await getGameState(roomId);
    check('لا طابور ولا خطوة', !('dynamicQueue' in s) && !('dynamicQueueIndex' in s) && s.currentNightStep === null && s.nightComplete === false);
    check('قيود هذه الليلة مُحيت', Object.keys(s.dynamicNightState.actions).length === 0);
    check('ذاكرة الليالي السابقة باقية', s.dynamicNightState.lastTargets['4:PROTECT'] === 7, JSON.stringify(s.dynamicNightState.lastTargets));
    check('المرحلة ليل والجولة لم تتغيّر', s.phase === Phase.NIGHT && s.round === roundAtNight, `${s.phase}/${s.round}`);
    check('اللاعبون كما هم (لا موت ولا إسكات)', s.players.length === 8 && s.players.every((p: any) => p.isAlive && !p.isSilenced));
    const fresh = emitted.slice(before);
    check('الليدر والشاشة بُلّغا night:restarted', fresh.some((e) => e.to === leader.s.id && e.ev === 'night:restarted') && fresh.some((e) => e.to === display.s.id && e.ev === 'night:restarted'));
    check('…والهواتف لم يصلها شيء', !fresh.some((e) => e.to === phone.s.id || e.to === roomId), JSON.stringify(fresh.map((e) => `${e.to}:${e.ev}`)));

    const resume = await leader.call('night:start', { roomId });
    const afterResume: any = await getGameState(roomId);
    check('night:start بعدها يستأنف ولا يبني طابوراً', resume?.resumed === true && !('dynamicQueue' in afterResume));
    check('…ولا خطوة طابور تُعاد لليدر', got(leader.s.id, 'night:queue-step').length === 2, String(got(leader.s.id, 'night:queue-step').length));
  }

  console.log('\n━━━ د) بعدها تبدأ «الليلة الواحدة» ━━━');
  {
    const r = await leader.call('night:one-start', { roomId, durationSeconds: 30 });
    check('night:one-start ينجح', r?.success === true && r.acting >= 4, JSON.stringify(r));
    const s: any = await getGameState(roomId);
    check('الليلة مفتوحة للهواتف', s.oneNight?.dispatched === true && s.oneNight.review === false);

    const busy = await leader.call('night:restart', { roomId });
    check('ليلةٌ واحدة جارية لا تُعاد', busy?.success === false && /جارية/.test(busy.error || ''), JSON.stringify(busy));
    const s2: any = await getGameState(roomId);
    check('…وتبقى كما هي', s2.oneNight?.dispatched === true);

    const close = await leader.call('night:one-close', { roomId });
    check('إنهاء المهلة يفتح المراجعة', close?.success === true && ((await getGameState(roomId)) as any).oneNight.review === true);
    const again = await leader.call('night:restart', { roomId });
    const s3: any = await getGameState(roomId);
    check('مراجعةٌ لم تُعتمد تُمحى بالإعادة', again?.success === true && !s3.oneNight && s3.phase === Phase.NIGHT, JSON.stringify(again));
    const one2 = await leader.call('night:one-start', { roomId, durationSeconds: 30 });
    check('…وتبدأ ليلةٌ واحدة جديدة بعدها', one2?.success === true && ((await getGameState(roomId)) as any).oneNight?.dispatched === true);
    clearOneNightTimer(roomId);
  }

  console.log('\n━━━ هـ) الحدود ━━━');
  {
    const s: any = await getGameState(roomId);
    delete s.oneNight;
    s.config.nightMode = 'auto';
    await setGameState(roomId, s);
    const auto = await leader.call('night:restart', { roomId });
    check('الليل الآليّ (الغرف البعيدة) يُرفض', auto?.success === false, JSON.stringify(auto));
    s.config.nightMode = 'manual'; s.config.useDynamicEngine = false;
    await setGameState(roomId, s);
    const legacy = await leader.call('night:restart', { roomId });
    check('المحرّك القديم يُرفض', legacy?.success === false, JSON.stringify(legacy));
    const none = await leader.call('night:restart', { roomId: 'no-such-room' });
    check('غرفةٌ غير موجودة تُرفض', none?.success === false);
  }

  clearOneNightTimer(roomId);
  await deleteGameState(roomId);
  await deleteGameState(`code:${st.roomCode}`);

  console.log(`\n═══ النتيجة ═══\n\n  ✅ نجح: ${pass}   ❌ فشل: ${fail}`);
  if (failures.length) failures.forEach((f) => console.log(`   • ${f}`));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('💥', e); process.exit(2); });
