// ══════════════════════════════════════════════════════
// 🃏 أداة الكروت أثناء اللعب + 🚪 بوّابة الدخول المتأخّر (الخطّة الموحّدة، المرحلتان 3 و4)
//
// أداة الكروت (القرارات 14–16):
//   cards:queue {op}   غيّر كرت لاعب · بدّل كرتَي لاعبين · سلّم كرتاً لمنتظر
//   cards:cancel {id}  ألغِ طلباً منتظراً
//   كلّ طلبٍ ينتظر أقرب نقطةٍ آمنة: بداية الليل (night:start) أو «ابدأ النهار» (night:end-recap).
//   ما يعبر بين الفريقين يحتاج رقم الأدوات. بعد التنفيذ: كلّ الهواتف «راجع بطاقتك» بالسطر نفسه.
//   حالةُ الكرت تنتقل معه (العقود، العمدة، العنقاء، التوأمان)، والإسكات والتعطيل على اللاعب.
//
// الدخول المتأخّر (القرارات 17–24):
//   night:start يتوقّف عند دفعةٍ مستحقّة ويعيد LATE_GATE ⇒ الموجّه يختار من دخل
//   late:open-gate {seats, literal?, skip?} يُدخلهم ويوزّع بطاقات المافيا ثمّ يُعاد night:start.
//   late:edit {waves?, closed?}  صلاحيّات الموجّه المطلقة أثناء اللعب.
// ══════════════════════════════════════════════════════
import type { Server, Socket } from 'socket.io';
import { sql } from 'drizzle-orm';
import { getRoom, withRoomLock, Phase, getSpectators } from '../game/state.js';
import { setGameState } from '../config/redis.js';
import { getDB } from '../config/db.js';
import { Role, isMafiaRole, teamOfRole, ROLE_NAMES_AR } from '../game/roles.js';
import { analyzeDuplicates, DUPLICABLE_ROLES } from '../game/role-duplicates.js';
import { remapPhysicalIds } from '../game/seat-remap.js';
import { initMayorState } from '../game/mayor-engine.js';
import { initPhoenixState } from '../game/phoenix-engine.js';
import { initAssassinStates, freshAssassinState } from '../game/assassin-engine.js';
import { getSiblingInfoFor } from '../game/twin-engine.js';
import { emitStateSanitized, spectatorRoom } from './broadcast.util.js';
import { publicTeamCounts } from '../game/public-counts.js';
import { winAfterRemoval } from '../game/removal-win.js';
import { addPlayerToSession } from '../services/session.service.js';
import { flagOn, LIVE_CARDS } from '../services/feature-flags.js';
import {
  lateOf, dueWave, waveMafiaFor, placeMafiaCards, recruitCandidates, incomingCounts, normalizeLatePlan, nightNumber,
  type LateWave,
} from '../game/late-entry.js';

const nameOf = (r: string) => (ROLE_NAMES_AR as Record<string, string>)[r] || r;
const TWINS = new Set(['OLDER_BROTHER', 'YOUNGER_BROTHER']);

export type CardOp =
  | { id: string; kind: 'change'; seat: number; role: string; at: number; cross: boolean }
  | { id: string; kind: 'swap'; seat: number; b: number; at: number; cross: boolean }
  | { id: string; kind: 'handover'; seat: number; spectatorSeat: number; at: number; cross: false };

const alive = (state: any, seat: number) => state.players.find((p: any) => Number(p.physicalId) === Number(seat) && p.isAlive !== false && p.role);

/** يتحقّق من طلبٍ قبل وضعه في الطابور — ويُعاد التحقّق لحظة التنفيذ */
export function validateOp(state: any, op: any): { ok: true; cross: boolean } | { ok: false; error: string } {
  const a = alive(state, op.seat);
  if (!a) return { ok: false, error: `المقعد ${op.seat} ليس لاعباً حيّاً بكرت` };
  if (op.kind === 'change') {
    if (!(Object.values(Role) as string[]).includes(op.role)) return { ok: false, error: 'كرتٌ غير معروف' };
    if (a.role === op.role) return { ok: false, error: 'هذا كرته الآن' };
    if (TWINS.has(a.role) || TWINS.has(op.role)) return { ok: false, error: 'التوأمان زوجٌ واحد — بدّل كرتيهما معاً بدل تغيير أحدهما' };
    const pool = state.players.filter((p: any) => p.isAlive !== false && p.role && Number(p.physicalId) !== Number(op.seat)).map((p: any) => p.role);
    const dup = analyzeDuplicates([...pool, op.role]);
    const bad = dup.blocked.find((d) => d.role === op.role);
    if (bad) return { ok: false, error: `«${nameOf(op.role)}» لا يتكرّر — ${bad.reason}` };
    if (dup.allowed.some((d) => d.role === op.role) && state.config.isRemote) return { ok: false, error: 'الغرف عن بُعد بلا تكرار' };
    if (op.role === 'ASSASSIN' && pool.includes('ASSASSIN') && !DUPLICABLE_ROLES.has('ASSASSIN')) return { ok: false, error: 'سفّاحٌ واحد' };
    return { ok: true, cross: teamOfRole(a.role) !== teamOfRole(op.role) };
  }
  if (op.kind === 'swap') {
    const b = alive(state, op.b);
    if (!b) return { ok: false, error: `المقعد ${op.b} ليس لاعباً حيّاً بكرت` };
    if (Number(op.b) === Number(op.seat)) return { ok: false, error: 'اختر لاعبين مختلفين' };
    return { ok: true, cross: teamOfRole(a.role) !== teamOfRole(b.role) };
  }
  if (op.kind === 'handover') {
    const sp = getSpectators(state).find((s: any) => Number(s.physicalId) === Number(op.spectatorSeat));
    if (!sp) return { ok: false, error: 'المنتظر غير موجود على هذا المقعد' };
    if (state.players.some((p: any) => Number(p.physicalId) === Number(op.spectatorSeat))) return { ok: false, error: 'كرسيّ المنتظر مشغول' };
    return { ok: true, cross: false };
  }
  return { ok: false, error: 'طلبٌ غير معروف' };
}

// ── حالة الكرت تنتقل معه ──
function dropRoleState(state: any, seat: number, role: string) {
  if (role === 'ASSASSIN') {
    const all = [state.assassinState, ...(state.assassinRivals || [])].filter(Boolean);
    const keep: any[] = [];
    for (const a of all) {
      const members: number[] = a.memberSeats && a.memberSeats.length ? a.memberSeats : [a.assassinPhysicalId];
      const rest = members.filter((m) => Number(m) !== Number(seat));
      if (!rest.length) continue;
      if (rest.length !== members.length) { a.memberSeats = rest.length > 1 ? rest : undefined; a.assassinPhysicalId = rest[0]; }
      keep.push(a);
    }
    state.assassinState = keep[0] || null;
    state.assassinRivals = keep.length > 1 ? keep.slice(1) : null;
  }
  if (role === 'MAYOR') state.mayorState = null;
  if (role === 'PHOENIX') state.phoenixState = null;
}
function initRoleState(state: any, seat: number, role: string) {
  if (role === 'ASSASSIN') {
    if (!state.assassinState) { initAssassinStates(state); return; }
    if (state.config.assassinMode === 'PARTNERS') {
      const a = state.assassinState;
      a.memberSeats = Array.from(new Set([...(a.memberSeats || [a.assassinPhysicalId]), seat]));
    } else {
      const fresh = freshAssassinState(state, seat);
      fresh.firstNightPassed = true;
      state.assassinRivals = [...(state.assassinRivals || []), fresh];
    }
  }
  if (role === 'MAYOR') state.mayorState = initMayorState(state);
  if (role === 'PHOENIX') state.phoenixState = initPhoenixState(state);
}

/** ينفّذ طلباً واحداً على الحالة. يعيد المقاعد التي تغيّر كرتها. */
function applyOp(state: any, op: CardOp): number[] {
  if (op.kind === 'change') {
    const p = alive(state, op.seat); if (!p) return [];
    const from = p.role;
    dropRoleState(state, op.seat, from);
    p.role = op.role;
    initRoleState(state, op.seat, op.role);
    if (isMafiaRole(op.role as Role) && !isMafiaRole(from as Role)) p.mafiaSince = Date.now();
    log(state, `🃏 ${op.seat}: ${nameOf(from)} ⟵ ${nameOf(op.role)}`);
    return [op.seat];
  }
  if (op.kind === 'swap') {
    const a = alive(state, op.seat), b = alive(state, op.b); if (!a || !b) return [];
    const ra = a.role, rb = b.role;
    a.role = rb; b.role = ra;
    // حالاتُ الأدوار تشير إلى المقعد ⇒ تتبادل مع الكرت
    const sub: any = { assassinState: state.assassinState, assassinRivals: state.assassinRivals, mayorState: state.mayorState, phoenixState: state.phoenixState, twinState: state.twinState };
    remapPhysicalIds(sub, new Map([[Number(op.seat), Number(op.b)], [Number(op.b), Number(op.seat)]]));
    Object.assign(state, sub);
    if (isMafiaRole(rb as Role) && !isMafiaRole(ra as Role)) a.mafiaSince = Date.now();
    if (isMafiaRole(ra as Role) && !isMafiaRole(rb as Role)) b.mafiaSince = Date.now();
    log(state, `⇄ ${op.seat} و${op.b}`);
    return [op.seat, op.b];
  }
  if (op.kind === 'handover') {
    // المنتظر يأخذ الكرت ويبقى كلٌّ في كرسيّه: الكرتُ ينتقل إلى كرسيّ المنتظر، وصاحبه القديم يصير منتظراً
    const p = alive(state, op.seat);
    const specs = getSpectators(state);
    const si = specs.findIndex((s: any) => Number(s.physicalId) === Number(op.spectatorSeat));
    if (!p || si < 0) return [];
    const sp: any = specs[si];
    const ID = ['name', 'phone', 'playerId', 'gender', 'dob', 'avatarUrl', 'rankTier', 'cosmetics', 'noPhoto'];
    const oldId: any = {}; for (const k of ID) oldId[k] = (p as any)[k];
    for (const k of ID) (p as any)[k] = sp[k] ?? null;
    p.isConnected = true; p.penalties = 0; (p as any).lateJoinRound = state.round; (p as any).handedFrom = oldId.playerId ?? null;
    if (isMafiaRole(p.role as Role)) p.mafiaSince = Date.now();
    const newSpec: any = { ...oldId, physicalId: Number(op.seat), joinedAt: Date.now(), addedBy: 'leader' };
    specs.splice(si, 1);
    state.spectators = [...specs, newSpec];
    // الكرت إلى كرسيّ المنتظر، والمنتظر الجديد إلى الكرسيّ القديم
    const s1 = Number(op.seat), s2 = Number(op.spectatorSeat);
    const pRec = p; const spRec = newSpec;
    remapPhysicalIds(state, new Map([[s1, s2]]));
    spRec.physicalId = s1; pRec.physicalId = s2;
    state.players.sort((x: any, y: any) => x.physicalId - y.physicalId);
    log(state, `🤝 كرت ${s1} ⟵ المنتظر على ${s2}`);
    return [s2];
  }
  return [];
}

function log(state: any, text: string) {
  state.cardLog = [...(state.cardLog || []), { at: Date.now(), round: state.round, text }].slice(-40);
}

/** 📱 يعيد إرسال البطاقة لكلّ الهواتف بالسطر نفسه «راجع بطاقتك» — فلا يُعرف من تغيّر */
export async function resendCards(io: Server, roomId: string, state: any, reason: 'change' | 'late' = 'change') {
  const mafia = state.players.filter((p: any) => p.isAlive !== false && p.role && isMafiaRole(p.role as Role))
    .map((p: any) => ({ physicalId: p.physicalId, name: p.name, role: p.role, avatarUrl: p.avatarUrl || null }));
  state.reviewCardAt = Date.now();
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    if (s.data.role !== 'player' || !s.data.physicalId) continue;
    const p = state.players.find((x: any) => x.physicalId === s.data.physicalId);
    if (!p?.role || p.isAlive === false) continue;
    const roleData: any = { physicalId: p.physicalId, role: p.role, reviewCard: true, reviewReason: reason };
    if (isMafiaRole(p.role as Role) && state.config.allowMafiaReveal !== false) roleData.mafiaTeam = mafia.filter((m: any) => m.physicalId !== p.physicalId);
    const sib = getSiblingInfoFor(state, p.physicalId); if (sib) roleData.sibling = sib;
    s.emit('player:role-assigned', roleData);
    s.emit('player:review-card', { at: state.reviewCardAt, reason });
  }
}

/**
 * 🛟 أقرب نقطةٍ آمنة: ينفّذ طابور الكروت. يُستدعى من night:start (قبل الخطّة) ومن night:end-recap.
 * يحفظ الحالة ويبثّها إن نُفّذ شيء.
 */
export async function applySafePoint(io: Server, roomId: string, state: any, where: 'night' | 'day'): Promise<number> {
  const q: CardOp[] = Array.isArray(state.cardQueue) ? state.cardQueue : [];
  if (!q.length) return 0;
  const done: CardOp[] = []; const failed: string[] = [];
  for (const op of q) {
    const v = validateOp(state, op);
    if (v.ok === false) { failed.push(`${op.seat}: ${v.error}`); continue; }
    applyOp(state, op); done.push(op);
  }
  state.cardQueue = [];
  // الحوضُ يتبع اللعبة: تغيّرٌ في الكروت يغيّر «المكرّر»
  const dup = analyzeDuplicates(state.players.filter((p: any) => p.role).map((p: any) => p.role));
  state.config.duplicateRoles = dup.allowed.length > 0;
  if (state.config.duplicateRoles) state.config.useDynamicEngine = true;
  await winAfterRemoval(state);
  await setGameState(roomId, state);
  if (done.length) await resendCards(io, roomId, state, 'change');
  // 🔌 مقابس من سُلّم كرته/استلمه
  for (const op of done) if (op.kind === 'handover') await moveHandoverSockets(io, roomId, state, op);
  await emitStateSanitized(io, roomId, 'game:state-sync', state);
  const sockets = await io.in(roomId).fetchSockets();
  for (const sk of sockets) if (sk.data?.role === 'leader') sk.emit('cards:applied', { where, done: done.length, failed, log: (state.cardLog || []).slice(-done.length) });
  return done.length;
}

async function moveHandoverSockets(io: Server, roomId: string, state: any, op: any) {
  const newSeat = Number(op.spectatorSeat), oldSeat = Number(op.seat);
  const p = state.players.find((x: any) => x.physicalId === newSeat);
  const specSockets = await io.in(spectatorRoom(roomId)).fetchSockets();
  for (const sk of specSockets) if (sk.data.physicalId === newSeat) {
    sk.leave(spectatorRoom(roomId)); sk.join(roomId); sk.data.role = 'player';
    sk.emit('spectator:promoted', { physicalId: newSeat, roomId });
  }
  const roomSockets = await io.in(roomId).fetchSockets();
  for (const sk of roomSockets) if (sk.data.role === 'player' && sk.data.physicalId === oldSeat && sk.data.playerId !== p?.playerId) {
    sk.leave(roomId); sk.join(spectatorRoom(roomId)); sk.data.role = 'spectator';
    sk.emit('player:card-handed-over', { roomId, physicalId: oldSeat, message: 'سلّم الموجّه كرتك لمنتظر — أنت الآن تنتظر اللعبة القادمة.' });
  }
  if (state.sessionId && p) { try { await addPlayerToSession(state.sessionId, newSeat, p.name, p.phone || undefined, p.gender || undefined, p.dob || undefined, p.playerId || null); } catch { /* */ } }
  await addParticipant(state, p);
}

async function addParticipant(state: any, p: any) {
  const db = getDB();
  if (!db || !state.matchId || !(Number(p?.playerId) > 0)) return;
  try {
    await db.execute(sql`INSERT INTO match_participants (match_id, activity_id, session_id, player_id, physical_id)
      VALUES (${state.matchId}, ${state.activityId ?? null}, ${state.sessionId ?? null}, ${Number(p.playerId)}, ${p.physicalId ?? null})
      ON CONFLICT (match_id, player_id) DO NOTHING`);
  } catch (e: any) { console.warn('⚠️ late match_participants:', e.message); }
}

/** معلومات البوّابة للموجّه */
export function gateInfo(state: any) {
  const w = dueWave(state);
  if (!w) return null;
  const waiting = getSpectators(state).filter((s: any) => Number(s.physicalId) > 0)
    .map((s: any) => ({ seat: Number(s.physicalId), name: s.name, joinedAt: s.joinedAt || null }))
    .sort((a: any, b: any) => (a.joinedAt || 0) - (b.joinedAt || 0));
  const suggest: Record<number, number> = {};
  for (let k = 0; k <= Math.max(w.count + 2, waiting.length); k++) suggest[k] = waveMafiaFor(state, w, k, false);
  return { night: w.at, plan: { count: w.count, mafia: w.mafia }, recompute: lateOf(state)?.recompute !== false, waiting, suggest, literalMafia: w.mafia };
}

async function lifetimeMatches(playerIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const db = getDB(); if (!db || !playerIds.length) return out;
  try {
    const r: any = await db.execute(sql`SELECT id, COALESCE(lifetime_matches, 0) AS n FROM players WHERE id = ANY(${'{' + playerIds.join(',') + '}'}::int[])`);
    for (const x of (r.rows || r || [])) out.set(Number(x.id), Number(x.n) || 0);
  } catch { /* */ }
  return out;
}

export function registerLiveCardEvents(io: Server, socket: Socket) {
  const isLeader = () => socket.data.role === 'leader';
  const reply = (cb: any, r: any) => { if (typeof cb === 'function') cb(r); };
  const running = (st: any) => !!st && ![Phase.LOBBY, Phase.ROLE_GENERATION, Phase.ROLE_BINDING, Phase.GAME_OVER].includes(st.phase);

  socket.on('cards:queue', async (data: { roomId: string; op: any }, cb) => {
    if (!isLeader()) return reply(cb, { success: false, error: 'Only leader' });
    if (!(await flagOn(LIVE_CARDS))) return reply(cb, { success: false, code: 'FEATURE_OFF', error: 'أداة الكروت مطفأة — تُفعَّل بعد تحديث تطبيق الهاتف' });
    try {
      const out = await withRoomLock(data.roomId, async () => {
        const st: any = await getRoom(data.roomId);
        if (!running(st)) return { success: false, error: 'الأداة أثناء اللعب — قبل البدء غيّر من «التوزيع»' };
        const raw = data.op || {};
        const op: any = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind: raw.kind, seat: Number(raw.seat), at: Date.now() };
        if (raw.kind === 'change') op.role = String(raw.role);
        if (raw.kind === 'swap') op.b = Number(raw.b);
        if (raw.kind === 'handover') op.spectatorSeat = Number(raw.spectatorSeat);
        const v = validateOp(st, op);
        if (v.ok === false) return { success: false, error: v.error };
        op.cross = v.cross;
        if (v.cross) {
          const { toolsUnlocked } = await import('./lobby.socket.js');
          if (!toolsUnlocked(socket)) return { success: false, code: 'TOOLS_LOCKED', error: 'يعبر بين الفريقين — أدخل رقم الأدوات أوّلاً' };
        }
        const busySeats = new Set((st.cardQueue || []).flatMap((q: any) => [q.seat, q.b, q.spectatorSeat].filter((x: any) => x != null)));
        if ([op.seat, op.b, op.spectatorSeat].some((x: any) => x != null && busySeats.has(x))) return { success: false, error: 'لهذا المقعد طلبٌ منتظر — ألغِه أوّلاً' };
        st.cardQueue = [...(st.cardQueue || []), op];
        // 🔍 تحذير: الشريف يعرف من سأل عنه — تغيير فريقه يجعل نتيجته كاذبة
        const checked = new Set((st.sheriffChecked || []).map(Number));
        const warn = v.cross && [op.seat, op.b].some((x: any) => x != null && checked.has(Number(x))) ? 'فحصه الشريف — نتيجته عنده ستصير كاذبة' : null;
        await setGameState(data.roomId, st);
        return { success: true, op, queue: st.cardQueue, warn, when: st.phase === Phase.NIGHT || st.phase === Phase.MORNING_RECAP ? 'ابدأ النهار' : 'بداية الليل', state: st };
      });
      const { state, ...res } = out as any;
      reply(cb, res);
      if (state) await emitStateSanitized(io, data.roomId, 'game:state-sync', state);
    } catch (err: any) { reply(cb, { success: false, error: err.message }); }
  });

  socket.on('cards:cancel', async (data: { roomId: string; id: string }, cb) => {
    if (!isLeader()) return reply(cb, { success: false, error: 'Only leader' });
    try {
      const st: any = await withRoomLock(data.roomId, async () => {
        const s: any = await getRoom(data.roomId); if (!s) return null;
        s.cardQueue = (s.cardQueue || []).filter((q: any) => q.id !== data.id);
        await setGameState(data.roomId, s); return s;
      });
      reply(cb, { success: !!st, queue: st?.cardQueue || [] });
      if (st) await emitStateSanitized(io, data.roomId, 'game:state-sync', st);
    } catch (err: any) { reply(cb, { success: false, error: err.message }); }
  });

  // ══ 🚪 البوّابة ══
  socket.on('late:gate-info', async (data: { roomId: string }, cb) => {
    if (!isLeader()) return reply(cb, { success: false, error: 'Only leader' });
    const st: any = await getRoom(data.roomId);
    reply(cb, { success: true, gate: st ? gateInfo(st) : null, late: st ? lateOf(st) : null, incoming: st ? incomingCounts(st) : null });
  });

  socket.on('late:open-gate', async (data: { roomId: string; seats?: number[]; literal?: boolean; skip?: boolean }, cb) => {
    if (!isLeader()) return reply(cb, { success: false, error: 'Only leader' });
    try {
      const out: any = await withRoomLock(data.roomId, async () => {
        const st: any = await getRoom(data.roomId);
        if (!st || !running(st)) return { success: false, error: 'لا لعبة جارية' };
        const w: LateWave | null = dueWave(st);
        if (!w) return { success: false, error: 'لا دفعة مستحقّة الآن' };
        const specs = getSpectators(st);
        const chosen = (data.seats || []).map(Number).filter((s) => specs.some((x: any) => Number(x.physicalId) === s) && !st.players.some((p: any) => Number(p.physicalId) === s));
        if (data.skip) {
          w.done = true; w.skipped = true; w.arrived = 0; w.mafiaDealt = 0;
          await winAfterRemoval(st);
          await setGameState(data.roomId, st);
          return { success: true, skipped: true, state: st };
        }
        // 1) الداخلون لاعبون بكرت مواطن مبدئيّاً
        const now = Date.now();
        for (const seat of chosen) {
          const sp: any = specs.find((x: any) => Number(x.physicalId) === seat);
          st.players.push({
            physicalId: seat, name: sp.name, phone: sp.phone ?? null, dob: sp.dob ?? null, gender: sp.gender ?? null, playerId: sp.playerId ?? null,
            role: 'CITIZEN', isAlive: true, isSilenced: false, justificationCount: 0, addedBy: sp.addedBy || 'self',
            avatarUrl: sp.avatarUrl ?? null, rankTier: sp.rankTier ?? null, cosmetics: sp.cosmetics ?? null, isConnected: true, penalties: 0,
            lateJoinRound: st.round, lateImmuneRound: Number(st.round) + 1, joinedAt: now,
            ...(sp.noPhoto !== undefined ? { noPhoto: sp.noPhoto === true } : {}),
          });
        }
        st.players.sort((a: any, b: any) => a.physicalId - b.physicalId);
        st.spectators = specs.filter((x: any) => !chosen.includes(Number(x.physicalId)));
        // 2) بطاقات المافيا: الداخلون أوّلاً بنصيبهم، والباقي تجنيد
        const M = waveMafiaFor(st, w, chosen.length, data.literal === true);
        let cands = recruitCandidates(st, chosen);
        const ids = cands.map((s) => Number(st.players.find((p: any) => p.physicalId === s)?.playerId)).filter((x) => x > 0);
        const lm = await lifetimeMatches(ids);
        const veteran = cands.filter((s) => { const pid = Number(st.players.find((p: any) => p.physicalId === s)?.playerId); return pid > 0 ? (lm.get(pid) ?? 0) >= 3 : false; });
        if (veteran.length) cands = veteran;   // القرار 21: من لعب أقلّ من 3 مباريات خارج القرعة ما أمكن
        const { toJoiners, recruits } = placeMafiaCards(chosen, cands, M);
        for (const s of toJoiners) { const p = st.players.find((x: any) => x.physicalId === s); p.role = 'MAFIA_REGULAR'; p.mafiaSince = now; }
        for (const s of recruits) { const p = st.players.find((x: any) => x.physicalId === s); p.role = 'MAFIA_REGULAR'; p.mafiaSince = now; p.recruitedRound = st.round; }
        w.done = true; w.arrived = chosen.length; w.mafiaDealt = toJoiners.length + recruits.length; w.joined = chosen; w.recruited = recruits;
        st.lateEntryLog = [...(st.lateEntryLog || []), { round: st.round, night: w.at, joined: chosen, mafia: w.mafiaDealt, recruited: recruits.length, literal: data.literal === true }];
        await winAfterRemoval(st);
        await setGameState(data.roomId, st);
        return { success: true, joined: chosen, mafia: w.mafiaDealt, recruits: recruits.length, state: st };
      });
      const { state, ...res } = out;
      reply(cb, res);
      if (!state) return;
      if (res.joined?.length) {
        const specSockets = await io.in(spectatorRoom(data.roomId)).fetchSockets();
        for (const sk of specSockets) if (res.joined.includes(Number(sk.data.physicalId))) {
          sk.leave(spectatorRoom(data.roomId)); sk.join(data.roomId); sk.data.role = 'player';
          sk.emit('spectator:promoted', { physicalId: sk.data.physicalId, roomId: data.roomId, late: true });
        }
        for (const seat of res.joined) {
          const p = state.players.find((x: any) => x.physicalId === seat);
          if (state.sessionId) { try { await addPlayerToSession(state.sessionId, seat, p.name, p.phone || undefined, p.gender || undefined, p.dob || undefined, p.playerId || null); } catch { /* */ } }
          await addParticipant(state, p);
        }
      }
      await resendCards(io, data.roomId, state, 'late');
      await setGameState(data.roomId, state);
      io.to(data.roomId).emit('late:entered', { count: res.joined?.length || 0, teamCounts: publicTeamCounts(state) });
      await emitStateSanitized(io, data.roomId, 'game:state-sync', state);
    } catch (err: any) { reply(cb, { success: false, error: err.message }); }
  });

  // ══ 🛠️ صلاحيّات الموجّه أثناء اللعب: عدّل الدفعات الباقية أو أغلق الباب ══
  socket.on('late:edit', async (data: { roomId: string; waves?: any[]; closed?: boolean; recompute?: boolean }, cb) => {
    if (!isLeader()) return reply(cb, { success: false, error: 'Only leader' });
    try {
      const st: any = await withRoomLock(data.roomId, async () => {
        const s: any = await getRoom(data.roomId); if (!s) return null;
        const cur = s.config.lateEntry || { enabled: false, waves: [], recompute: true };
        const done = (cur.waves || []).filter((w: any) => w.done);
        const doneAt = new Set(done.map((w: any) => w.at));
        const n = nightNumber(s);
        if (Array.isArray(data.waves)) {
          // ما مضى لا يُعدَّل، ولا دفعة لليلةٍ فاتت
          const fresh = normalizeLatePlan({ enabled: true, waves: data.waves }, !!s.config.isRemote).waves
            .filter((w) => !doneAt.has(w.at) && (s.phase === Phase.NIGHT || s.phase === Phase.MORNING_RECAP ? w.at > n - 1 : w.at >= n));
          cur.waves = [...done, ...fresh].sort((a: any, b: any) => a.at - b.at);
          cur.enabled = cur.waves.length > 0;
        }
        if (typeof data.closed === 'boolean') cur.closed = data.closed;
        if (typeof data.recompute === 'boolean') cur.recompute = data.recompute;
        s.config.lateEntry = cur;
        await winAfterRemoval(s);
        await setGameState(data.roomId, s);
        return s;
      });
      reply(cb, { success: !!st, late: st?.config?.lateEntry || null, incoming: st ? incomingCounts(st) : null });
      if (st) {
        await emitStateSanitized(io, data.roomId, 'game:state-sync', st);
        io.to(data.roomId).emit('late:counts', { teamCounts: publicTeamCounts(st) });
      }
    } catch (err: any) { reply(cb, { success: false, error: err.message }); }
  });

  // 📱 الهاتف لمس كرت الدور بعد «راجع بطاقتك» — يصل الموجّه عدّاً لا تنبيهاً
  socket.on('player:card-ack', async (data: { roomId?: string }) => {
    try {
      if (socket.data.role !== 'player' || !socket.data.roomId || !socket.data.physicalId) return;
      const roomId = socket.data.roomId;
      const sockets = await io.in(roomId).fetchSockets();
      for (const sk of sockets) if (sk.data?.role === 'leader') sk.emit('late:ack', { seat: socket.data.physicalId, at: Date.now() });
      void data;
    } catch { /* */ }
  });
}
