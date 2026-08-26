// ══════════════════════════════════════════════════════
// 🌙 الليلةُ الواحدة — يختار الجميع مرّةً، ويُراجع الموجّه، ثمّ يُحسب
//
// تحلّ محلّ طابور الخطوات: كان الليلُ ستَّ دوراتٍ من (ضغطةُ موجّه ← يختار كلُّ
// اللاعبين ← شاشةُ موافقة)، فيختار كلُّ لاعبٍ ستَّ مرّات، خمسٌ منها بلا معنى.
// على طاولةٍ من اثني عشر بستّة أدوارٍ فاعلة: ٧٢ اختياراً، ٦ منها فقط لها أثر.
//
// 🔴 والحسابُ لا يتغيّر: `resolveNightDynamic` يستقبل حقيبةً من الإجراءات ثمّ
//    **يرتّبها بنفسه** بأولويّة القدرة قبل أيّ أثر. الطابورُ كان لإيقاع الواجهة
//    فقط. فهذه إعادةُ هيكلةٍ في الجمع لا في الحساب — ولذلك تُثبَت بمقارنة النتائج.
//
// 🔴 والتمويهُ في الخادم: كلُّ لاعبٍ يتلقّى **فعلَه هو وقائمتَه هو**، ومَن لا فعلَ
//    له يتلقّى سؤالاً محايداً بقائمةٍ معقولة. لا يعرف أحدٌ أنّ لغيره فعلاً أصلاً.
// ══════════════════════════════════════════════════════

import type { Server, Socket } from 'socket.io';
import { getGameState, setGameState } from '../config/redis.js';
import { Phase } from '../game/state.js';
import type { GameState } from '../game/state.js';
import { buildNightPlan, slotsOfSeat, idleSeats, slotKey, type NightSlot } from '../game/night-plan.js';
import { getAvailableTargets, actionKey, type DynamicNightState } from '../game/dynamic-night-resolver.js';
import { emitTrustedOnly } from './broadcast.util.js';

/** مهلٌ حيّة لكلّ غرفة — واحدةٌ للّيلة كلِّها لا واحدةٌ لكلّ خطوة. */
const timers = new Map<string, NodeJS.Timeout>();

export function clearOneNightTimer(roomId: string): void {
  const t = timers.get(roomId);
  if (t) { clearTimeout(t); timers.delete(roomId); }
}

const brief = (p: any) => ({ physicalId: p.physicalId, name: p.name, avatarUrl: p.avatarUrl || null });

/** سؤالُ القدرة كما يُعرض للاعب — نصٌّ واحدٌ لا يُؤلَّف في كلّ واجهة. */
const ASK: Record<string, string> = {
  KILL: 'اختر هدفَ الاغتيال',
  SILENCE: 'مَن تُسكِت الليلة؟',
  DISABLE_ABILITY: 'مَن تُعطّل قدرتَه؟',
  INVESTIGATE: 'مَن تحقّق معه؟',
  PROTECT: 'مَن تحمي الليلة؟',
  SNIPE: 'اختر هدفَ القنص',
  ASSASSINATE: 'نفّذْ عقدك — اختر الهدف',
};
/** السؤالُ المحايد لمن لا فعلَ له. مطابقٌ شكلاً لغيره كي لا يُميَّز. */
const ASK_IDLE = 'اختر لاعباً';

function findPlayerSocket(io: Server, roomId: string, physicalId: number): any {
  for (const [, s] of io.sockets.sockets) {
    const d: any = (s as any).data;
    if (d?.roomId === roomId && d?.role === 'player' && d?.physicalId === physicalId) return s;
  }
  return null;
}

/** حمولةُ شاشة الليل لمقعدٍ بعينه — فعلُه هو وقائمتُه هو. */
async function payloadFor(
  state: GameState, plan: NightSlot[], seat: number, dyn: DynamicNightState, deadline: number | null,
) {
  const mine = slotsOfSeat(plan, seat);
  const alive = state.players.filter(p => p.isAlive);
  if (mine.length === 0) {
    return {
      steps: [{ abilityId: null, ask: ASK_IDLE, targets: alive.filter(p => p.physicalId !== seat).map(brief), canSkip: false }],
      deadline,
    };
  }
  const steps = [];
  for (const s of mine) {
    const targets = await getAvailableTargets(state, s.abilityId, seat, dyn);
    steps.push({
      abilityId: s.abilityId,
      ask: ASK[s.abilityId] || ASK_IDLE,
      targets: targets.map(brief),
      // 🔴 القنصُ وحده يُتاح تخطّيه صراحةً: رميةُ نردٍ به قد تُخرج لاعبَين.
      canSkip: s.noRandom,
    });
  }
  return { steps, deadline };
}

/** صفوفُ شاشة المراجعة — أصحابُ الأدوار بترتيب العرض، ثمّ مَن لا دورَ له. */
function reviewRows(state: GameState) {
  const on = state.oneNight!;
  const nameOf = (id: number | null | undefined) =>
    id == null ? null : (state.players.find(p => p.physicalId === id)?.name ?? null);
  const acting = on.plan.map(s => ({
    seat: s.seat,
    seatName: state.players.find(p => p.physicalId === s.seat)?.name || '',
    role: state.players.find(p => p.physicalId === s.seat)?.role || null,
    abilityId: s.abilityId,
    abilityAr: s.nameAr,
    disabled: s.disabled,
    targetPhysicalId: on.choices[slotKey(s.seat, s.abilityId)] ?? null,
    targetName: nameOf(on.choices[slotKey(s.seat, s.abilityId)]),
    editable: true,
  }));
  const idle = Object.entries(on.idle).map(([seat, t]) => ({
    seat: Number(seat),
    seatName: state.players.find(p => p.physicalId === Number(seat))?.name || '',
    role: state.players.find(p => p.physicalId === Number(seat))?.role || null,
    abilityId: null,
    abilityAr: 'بلا دور',
    disabled: false,
    targetPhysicalId: t ?? null,
    targetName: nameOf(t),
    // 🔴 يُعرض ولا يُعدَّل: تعديلُ ما لا أثرَ له يوهم بأنّ له أثراً.
    editable: false,
  })).sort((a, b) => a.seat - b.seat);
  return { acting, idle };
}

async function openReview(io: Server, roomId: string) {
  clearOneNightTimer(roomId);
  const state = await getGameState(roomId);
  if (!state?.oneNight || state.oneNight.review) return;
  state.oneNight.review = true;
  state.oneNight.deadline = null;
  await setGameState(roomId, state);
  await emitTrustedOnly(io, roomId, 'night:one-review', reviewRows(state));
  console.log(`🌙 [one-night] مراجعةُ الموجّه جاهزة — غرفة ${roomId}`);
}

/** يملأ ما لم يُرسَل: عشوائيٌّ لأصحاب الأدوار (إلّا القنص) وعشوائيٌّ لمن لا دورَ له. */
async function fillMissing(state: GameState): Promise<void> {
  const on = state.oneNight!;
  const dyn: DynamicNightState = state.dynamicNightState || { actions: {}, lastTargets: {} };
  const alive = state.players.filter(p => p.isAlive);

  for (const s of on.plan) {
    const k = slotKey(s.seat, s.abilityId);
    if (k in on.choices) continue;
    if (s.noRandom) { on.choices[k] = null; continue; }
    const targets = await getAvailableTargets(state, s.abilityId, s.seat, dyn);
    on.choices[k] = targets.length ? targets[Math.floor(Math.random() * targets.length)].physicalId : null;
  }
  for (const seat of idleSeats(state, on.plan)) {
    if (String(seat) in on.idle) continue;
    const pool = alive.filter(p => p.physicalId !== seat);
    on.idle[String(seat)] = pool.length ? pool[Math.floor(Math.random() * pool.length)].physicalId : null;
  }
}

export function registerOneNightEvents(io: Server, socket: Socket) {
  const isLeader = () => {
    if ((socket.data as any).authStaff) (socket.data as any).role = 'leader';
    return (socket.data as any).role === 'leader';
  };

  // ══ 🌙 بدءُ الليلة — بثٌّ واحدٌ لكلّ لاعب ══════════════
  socket.on('night:one-start', async (data: { roomId: string; durationSeconds?: number }, cb) => {
    try {
      if (!isLeader()) return cb?.({ success: false, error: 'Only leader' });
      const state = await getGameState(data.roomId);
      if (!state) return cb?.({ success: false, error: 'Room not found' });
      if (state.phase !== Phase.NIGHT) return cb?.({ success: false, error: 'Not night phase' });

      // 🛡️ استئنافٌ لا تصفير: ليلةٌ جاريةٌ لا تُبنى من جديد بضغطةٍ ثانية.
      if (state.oneNight?.dispatched && !state.oneNight.review) {
        return cb?.({ success: true, resumed: true });
      }

      const plan = await buildNightPlan(state);
      const secs = Math.max(10, Math.min(300, data.durationSeconds || state.config.autoNightTime || 60));
      const deadline = Date.now() + secs * 1000;

      state.oneNight = { plan, choices: {}, idle: {}, submitted: {}, deadline, review: false, dispatched: true };
      if (!state.dynamicNightState) state.dynamicNightState = { actions: {}, lastTargets: {} };
      state.dynamicNightState.actions = {};
      await setGameState(data.roomId, state);

      const dyn = state.dynamicNightState;
      for (const p of state.players.filter(x => x.isAlive)) {
        const sock = findPlayerSocket(io, data.roomId, p.physicalId);
        if (!sock) continue;
        sock.emit('night:one-ask', await payloadFor(state, plan, p.physicalId, dyn, deadline));
      }
      await emitTrustedOnly(io, data.roomId, 'night:one-started', {
        deadline, total: state.players.filter(x => x.isAlive).length, acting: plan.length,
      });

      clearOneNightTimer(data.roomId);
      timers.set(data.roomId, setTimeout(async () => {
        try {
          const s2 = await getGameState(data.roomId);
          if (!s2?.oneNight || s2.oneNight.review) return;
          await fillMissing(s2);
          await setGameState(data.roomId, s2);
          await openReview(io, data.roomId);
        } catch (e: any) { console.error('❌ [one-night] مهلة:', e.message); }
      }, secs * 1000));

      console.log(`🌙 [one-night] بدأت — ${plan.length} فعلاً · ${secs}ث · غرفة ${data.roomId}`);
      cb?.({ success: true, acting: plan.length });
    } catch (err: any) { cb?.({ success: false, error: err.message }); }
  });

  // ══ 📥 إرسالُ اللاعب — اختيارٌ لكلّ قدرةٍ يملكها ══════
  socket.on('night:one-submit', async (
    data: { roomId: string; picks?: Array<{ abilityId: string | null; targetPhysicalId: number | null }> }, cb,
  ) => {
    try {
      if ((socket.data as any).role !== 'player') return cb?.({ success: false, error: 'Only players' });
      const roomId: string = (socket.data as any).roomId;
      const seat: number = (socket.data as any).physicalId;
      if (!roomId || !seat) return cb?.({ success: false, error: 'لست في غرفة' });

      const state = await getGameState(roomId);
      if (!state?.oneNight || state.oneNight.review) return cb?.({ success: false, error: 'انتهى وقتُ الاختيار' });
      const me = state.players.find(p => p.physicalId === seat);
      if (!me?.isAlive) return cb?.({ success: false, error: 'المُقصى لا يختار' });

      const on = state.oneNight;
      const mine = slotsOfSeat(on.plan as NightSlot[], seat);
      const dyn = state.dynamicNightState || { actions: {}, lastTargets: {} };
      const picks = Array.isArray(data?.picks) ? data.picks : [];

      if (mine.length === 0) {
        const t = picks[0]?.targetPhysicalId ?? null;
        // 🔴 يُقبل بلا تحقّق: لا أثرَ له أصلاً، ورفضُه يُخبر اللاعبَ أنّه بلا دور.
        on.idle[String(seat)] = t;
      } else {
        for (const s of mine) {
          const pick = picks.find(p => p.abilityId === s.abilityId);
          if (!pick) continue;
          const t = pick.targetPhysicalId;
          if (t == null) { if (s.noRandom) on.choices[slotKey(seat, s.abilityId)] = null; continue; }
          // 🔴 التحقّقُ من القائمة في الخادم: عميلٌ معدَّل قد يرسل هدفاً خارجها
          //    (شريكَ مافيا للقاتل، أو هدفَ الطبيب أمس).
          const valid = await getAvailableTargets(state, s.abilityId, seat, dyn);
          if (!valid.some(v => v.physicalId === t)) continue;
          on.choices[slotKey(seat, s.abilityId)] = t;
        }
      }
      on.submitted[String(seat)] = true;
      await setGameState(roomId, state);

      const aliveSeats = state.players.filter(p => p.isAlive).map(p => p.physicalId);
      const done = aliveSeats.filter(s => on.submitted[String(s)]).length;
      await emitTrustedOnly(io, roomId, 'night:one-progress', { done, total: aliveSeats.length });

      if (done >= aliveSeats.length) {
        const s2 = await getGameState(roomId);
        if (s2?.oneNight) { await fillMissing(s2); await setGameState(roomId, s2); }
        await openReview(io, roomId);
      }
      cb?.({ success: true });
    } catch (err: any) { cb?.({ success: false, error: err.message }); }
  });

  // ══ 👁️ الموجّه يطلب المراجعة (استعادةٌ بعد تحديث الصفحة) ══
  socket.on('night:one-review-get', async (data: { roomId: string }, cb) => {
    try {
      if (!isLeader()) return cb?.({ success: false, error: 'Only leader' });
      const state = await getGameState(data.roomId);
      if (!state?.oneNight) return cb?.({ success: false, error: 'لا ليلةَ جارية' });
      cb?.({ success: true, review: state.oneNight.review, ...reviewRows(state) });
    } catch (err: any) { cb?.({ success: false, error: err.message }); }
  });

  // ══ ⏭️ الموجّه يُنهي المهلة مبكّراً ══════════════════
  socket.on('night:one-close', async (data: { roomId: string }, cb) => {
    try {
      if (!isLeader()) return cb?.({ success: false, error: 'Only leader' });
      const state = await getGameState(data.roomId);
      if (!state?.oneNight || state.oneNight.review) return cb?.({ success: false, error: 'لا ليلةَ مفتوحة' });
      await fillMissing(state);
      await setGameState(data.roomId, state);
      await openReview(io, data.roomId);
      cb?.({ success: true });
    } catch (err: any) { cb?.({ success: false, error: err.message }); }
  });

  // ══ ✅ الاعتماد — قيمةُ الموجّه هي المعتمَدة ══════════
  socket.on('night:one-apply', async (
    data: { roomId: string; overrides?: Array<{ seat: number; abilityId: string; targetPhysicalId: number | null }> }, cb,
  ) => {
    try {
      if (!isLeader()) return cb?.({ success: false, error: 'Only leader' });
      const state = await getGameState(data.roomId);
      if (!state?.oneNight) return cb?.({ success: false, error: 'لا ليلةَ جارية' });
      const on = state.oneNight;

      // 🌐 في الغرف البعيدة لا يُقبل تعديلُ المضيف — اختياراتُ اللاعبين نهائيّة (مكافحة غش).
      if (Array.isArray(data.overrides) && !state.config?.isRemote) {
        for (const o of data.overrides) {
          if (!on.plan.some(s => s.seat === o.seat && s.abilityId === o.abilityId)) continue;
          on.choices[slotKey(o.seat, o.abilityId)] = o.targetPhysicalId ?? null;
        }
      }

      // بناءُ حقيبة الإجراءات للمحرّك — بمفاتيحَ مركّبة
      if (!state.dynamicNightState) state.dynamicNightState = { actions: {}, lastTargets: {} };
      state.dynamicNightState.actions = {};
      for (const s of on.plan) {
        const t = on.choices[slotKey(s.seat, s.abilityId)] ?? null;
        const action = { abilityId: s.abilityId, performerPhysicalId: s.seat, targetPhysicalId: t, skipped: t == null };
        state.dynamicNightState.actions[actionKey(action)] = action;
      }
      on.review = false;
      on.dispatched = false;
      await setGameState(data.roomId, state);

      cb?.({ success: true, actions: Object.keys(state.dynamicNightState.actions).length });
    } catch (err: any) { cb?.({ success: false, error: err.message }); }
  });
}
