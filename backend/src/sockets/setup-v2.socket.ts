// ══════════════════════════════════════════════════════
// 🎴 تجهيز اللعبة v2 — أحداث الموجّه (الخطّة الموحّدة 2026-11-20، المرحلة 2)
//
//   setup:prepare-deal   الحوض + التوزيع (يحترم المثبَّت) بطلبٍ واحد تحت القفل
//   setup:redeal         أعد الخلط — المثبَّت يبقى
//   setup:swap-roles     ⇄ بدّل كرتَي مقعدين
//   setup:pin-role       📌 ثبّت كرتاً على مقعد (يبادل مع حامله)
//   setup:unpin          فكّ التثبيت
//   setup:change-card    ✏️ غيّر كرت مقعد (يتغيّر الحوض)
//   setup:reopen-deck    ↩ رجوع إلى «اللعبة والكروت» أو إلى الطاولة
//   setup:review         📋 الاعتماد الختاميّ (يحسبه الخادم)
//   room:roster          👥 عدد اللاعبين الفعليّ — الدالّة الواحدة
//   templates:*          🗂️ قوالب اللعبة (game_templates)
//
// الإرسال للهواتف يبقى setup:confirm-roles (برقم النسخة)، والبدء setup:binding-complete.
// ══════════════════════════════════════════════════════
import type { Server, Socket } from 'socket.io';
import { sql } from 'drizzle-orm';
import { getRoom, withRoomLock, Phase } from '../game/state.js';
import { setGameState } from '../config/redis.js';
import { getDB } from '../config/db.js';
import { bindingSnapshot } from '../game/role-binding.js';
import { PROPHECY_ROLES } from '../game/roles.js';
import { prophecyOn, prophecyCardsOff } from '../services/feature-flags.js';
import {
  applyPoolRules, dealRandom, livePins, touchDeal, swapSeatRoles, pinRoleToSeat, changeSeatCard,
  dealReview, reopenDeck, rosterCounts, type PoolParams,
} from '../game/setup-deal.js';

const SETUP_PHASES = new Set<string>([Phase.LOBBY, Phase.ROLE_GENERATION, Phase.ROLE_BINDING]);
const rows = (r: any): any[] => (Array.isArray(r) ? r : r?.rows || []);

async function lastRolesOf(playerId: number, n: number): Promise<string[]> {
  const { getPlayerLastRoles } = await import('../services/player.service.js');
  return getPlayerLastRoles(playerId, n);
}

export function registerSetupV2Events(io: Server, socket: Socket) {
  const isLeader = () => socket.data.role === 'leader';
  const reply = (cb: any, r: any) => { if (typeof cb === 'function') cb(r); };

  async function toLeaders(roomId: string, state: any) {
    try {
      const snap = { ...bindingSnapshot(state), dealPins: livePins(state) };
      const sockets = await io.in(roomId).fetchSockets();
      for (const sk of sockets) if (sk.data?.role === 'leader') sk.emit('setup:binding-updated', snap);
    } catch { /* */ }
  }

  /** عمليّةٌ على التوزيع: تحت القفل، في طور الربط، ثمّ حفظٌ واحد وبثٌّ للموجّهين */
  async function onDeal(roomId: string, cb: any, fn: (state: any) => Promise<any> | any, opts: { phases?: string[] } = {}) {
    if (!isLeader()) return reply(cb, { success: false, error: 'Only leader' });
    try {
      const out: any = await withRoomLock(roomId, async () => {
        const state: any = await getRoom(roomId);
        if (!state) return { success: false, error: 'Room not found' };
        const allowed = opts.phases || [Phase.ROLE_BINDING];
        if (!allowed.includes(state.phase)) {
          return { success: false, code: 'NOT_SETUP', error: state.matchId && !SETUP_PHASES.has(state.phase) ? 'اللعبة بدأت — استعمل «أداة الكروت»' : 'ليس في مرحلة التوزيع' };
        }
        const r = await fn(state);
        if (r && r.ok === false) return { success: false, code: r.code, error: r.error, duplicates: r.duplicates, bindingRev: Number(state.bindingRev) || 0 };
        await setGameState(roomId, state);
        return { success: true, ...(r && typeof r === 'object' ? r : {}), ok: undefined, bindingRev: Number(state.bindingRev) || 0, dealPins: livePins(state), state };
      });
      const { state, ...res } = out;
      reply(cb, { ...res, ...(state ? { snapshot: { ...bindingSnapshot(state), dealPins: livePins(state) } } : {}) });
      if (out.success && state) {
        void toLeaders(roomId, state);
        return state;
      }
    } catch (err: any) { reply(cb, { success: false, error: err.message }); }
    return null;
  }

  // ── 🔮 ما تفتحه هذه الغرفة من كروت الموسم (تقرؤه صفحة «اللعبة والكروت» قبل أن تعرضها) ──
  socket.on('setup:features', async (data: { roomId: string }, cb) => {
    if (!isLeader()) return reply(cb, { success: false, error: 'Only leader' });
    try {
      const state: any = await getRoom(data?.roomId);
      if (!state) return reply(cb, { success: false, error: 'Room not found' });
      const prophecy = await prophecyOn(state);
      const off = prophecy ? await prophecyCardsOff(PROPHECY_ROLES) : [];
      reply(cb, { success: true, prophecy, prophecyOff: off, isRemote: state.config?.isRemote === true });
    } catch (err: any) { reply(cb, { success: false, error: err.message }); }
  });

  // ── الحوض + التوزيع بطلبٍ واحد ──
  socket.on('setup:prepare-deal', async (data: PoolParams & { roomId: string; keepPins?: boolean }, cb) => {
    const state = await onDeal(data?.roomId, cb, async (st: any) => {
      if (st.rolesConfirmed === true && st.phase === Phase.ROLE_BINDING) {
        return { ok: false, code: 'ALREADY_SENT', error: 'وصلت الكروت الهواتف — ارجع من التوزيع أوّلاً ثمّ أعد التحضير' };
      }
      // 🔮 محتوى الموسم يُحسب هنا مرّةً لكلّ توزيع ويثبت طوال اللعبة
      st.config.prophecy = await prophecyOn(st);
      st.config.prophecyOff = await prophecyCardsOff(PROPHECY_ROLES);
      const rules = applyPoolRules(st, data);
      if (rules.ok === false) return rules;
      const keep = data.keepPins !== false ? livePins(st).filter((s) => {
        const p = st.players.find((x: any) => Number(x.physicalId) === s);
        return p?.role && data.roles.includes(p.role);
      }) : [];
      // 🔒 مثبَّتٌ يأخذ من الحوض نصيبه بالعدد — ما زاد يدخل القرعة
      const room = [...data.roles];
      const kept: number[] = [];
      for (const s of keep) {
        const p = st.players.find((x: any) => Number(x.physicalId) === s);
        const i = room.indexOf(p.role);
        if (i !== -1) { room.splice(i, 1); kept.push(s); }
      }
      for (const p of st.players) if (!kept.includes(Number(p.physicalId))) p.role = null;
      st.rolesPool = [...data.roles];
      st.phase = Phase.ROLE_BINDING;
      st.dealPins = kept;
      touchDeal(st);
      const dealt = await dealRandom(st, kept, lastRolesOf);
      if (dealt.ok === false) return dealt;
      return { nightModeSwitched: rules.nightModeSwitched, duplicateRoles: rules.duplicateRoles, locked: dealt.locked };
    }, { phases: [Phase.LOBBY, Phase.ROLE_GENERATION, Phase.ROLE_BINDING] });
    if (state) io.to(data.roomId).emit('game:phase-changed', { phase: Phase.ROLE_BINDING });
  });

  socket.on('setup:redeal', async (data: { roomId: string }, cb) => {
    await onDeal(data?.roomId, cb, async (st: any) => {
      const pins = livePins(st);
      touchDeal(st);
      const dealt = await dealRandom(st, pins, lastRolesOf);
      if (dealt.ok === false) return dealt;
      st.dealPins = pins;
      return { locked: dealt.locked };
    });
  });

  socket.on('setup:swap-roles', async (data: { roomId: string; a: number; b: number; expectedRev?: number }, cb) => {
    await onDeal(data?.roomId, cb, (st: any) => {
      if (typeof data.expectedRev === 'number' && data.expectedRev !== (Number(st.bindingRev) || 0)) {
        return { ok: false, code: 'BINDING_CHANGED', error: 'تغيّر التوزيع من جهازٍ آخر — راجِعه ثمّ بدّل' };
      }
      const r = swapSeatRoles(st, Number(data.a), Number(data.b));
      if (r.ok === false) return r;
      touchDeal(st);
      return {};
    });
  });

  socket.on('setup:pin-role', async (data: { roomId: string; seat: number; role: string }, cb) => {
    await onDeal(data?.roomId, cb, (st: any) => {
      const r = pinRoleToSeat(st, Number(data.seat), String(data.role));
      if (r.ok === false) return r;
      touchDeal(st);
      return { swappedWith: r.swappedWith };
    });
  });

  socket.on('setup:unpin', async (data: { roomId: string; seat: number }, cb) => {
    await onDeal(data?.roomId, cb, (st: any) => {
      st.dealPins = livePins(st).filter((s) => s !== Number(data.seat));
      return {};
    });
  });

  socket.on('setup:change-card', async (data: { roomId: string; seat: number; role: string }, cb) => {
    await onDeal(data?.roomId, cb, (st: any) => {
      const r = changeSeatCard(st, Number(data.seat), String(data.role));
      if (r.ok === false) return r;
      touchDeal(st);
      return { from: r.from };
    });
  });

  socket.on('setup:reopen-deck', async (data: { roomId: string; to?: 'cards' | 'lobby' }, cb) => {
    const to = data?.to === 'lobby' ? 'lobby' : 'cards';
    const state = await onDeal(data?.roomId, cb, (st: any) => {
      if (to === 'cards' && st.phase === Phase.ROLE_GENERATION) return {};
      reopenDeck(st, to);
      return { phase: st.phase };
    }, { phases: [Phase.ROLE_GENERATION, Phase.ROLE_BINDING] });
    if (state) {
      io.to(data.roomId).emit('game:phase-changed', { phase: state.phase });
      // 📱 الكروت التي وصلت الهواتف لم تعد صالحة
      io.to(data.roomId).emit('player:roles-withdrawn', { roomId: data.roomId });
    }
  });

  socket.on('setup:review', async (data: { roomId: string }, cb) => {
    if (!isLeader()) return reply(cb, { success: false, error: 'Only leader' });
    try {
      const st: any = await getRoom(data?.roomId);
      if (!st) return reply(cb, { success: false, error: 'Room not found' });
      reply(cb, { success: true, review: dealReview(st), snapshot: { ...bindingSnapshot(st), dealPins: livePins(st) } });
    } catch (err: any) { reply(cb, { success: false, error: err.message }); }
  });

  socket.on('room:roster', async (data: { roomId: string; excluded?: number[] }, cb) => {
    if (!isLeader()) return reply(cb, { success: false, error: 'Only leader' });
    try {
      const st: any = await getRoom(data?.roomId);
      if (!st) return reply(cb, { success: false, error: 'Room not found' });
      reply(cb, { success: true, roster: rosterCounts(st, Array.isArray(data.excluded) ? data.excluded : []) });
    } catch (err: any) { reply(cb, { success: false, error: err.message }); }
  });

  // ══════════ 🗂️ قوالب اللعبة ══════════
  // «قوالبي» لكلّ موجّه، و«قوالب النادي» (staff_id NULL) يضعها المدير ويقرؤها الجميع — القرار 6.
  // ⭐ = يُحمَّل في كلّ غرفةٍ جديدة. «قيمي» القديمة تُنقل مرّةً إلى «الأساسي» ⭐.
  const staffId = () => Number(socket.data.authStaff?.id) || 0;
  const isManager = () => ['admin', 'manager'].includes(String(socket.data.authStaff?.role || ''));
  const cleanPlan = (p: any) => (p && typeof p === 'object' && !Array.isArray(p) && JSON.stringify(p).length <= 4000 ? p : null);

  async function listFor(db: any, sid: number) {
    const r = rows(await db.execute(sql`
      SELECT id, staff_id, scope, name, plan, is_default, updated_at FROM game_templates
       WHERE staff_id = ${sid} OR scope = 'club' ORDER BY scope DESC, is_default DESC, name`));
    return r.map((x: any) => ({ id: Number(x.id), scope: x.scope === 'club' ? 'club' : 'mine', name: String(x.name), plan: x.plan, isDefault: x.is_default === true, mine: Number(x.staff_id) === sid }));
  }

  socket.on('templates:list', async (_d: unknown, cb) => {
    const sid = staffId();
    if (!isLeader() || !sid) return reply(cb, { success: false, error: 'Only leader' });
    try {
      const db = getDB(); if (!db) return reply(cb, { success: true, templates: [] });
      let list = await listFor(db, sid);
      if (!list.some((t) => t.mine)) {
        // 🔁 النقل الآليّ: «قيمي» ⟵ «الأساسي» ⭐ (مرّةً، ولا يُمسّ العمود القديم)
        const old = rows(await db.execute(sql`SELECT game_defaults FROM staff WHERE id = ${sid}`))[0]?.game_defaults;
        const raw: any = old && typeof old === 'object' ? { ...old } : null;
        if (raw) delete raw._seatPatterns;
        if (raw && Object.keys(raw).length) {
          await db.execute(sql`INSERT INTO game_templates (staff_id, scope, name, plan, is_default) VALUES (${sid}, 'mine', 'الأساسي', ${JSON.stringify({ ...raw, mafia: null })}::jsonb, TRUE)`);
          list = await listFor(db, sid);
        }
      }
      reply(cb, { success: true, templates: list, canClub: isManager() });
    } catch (err: any) { reply(cb, { success: false, error: err.message }); }
  });

  socket.on('templates:save', async (data: { id?: number; name?: string; plan?: any; scope?: 'mine' | 'club'; isDefault?: boolean }, cb) => {
    const sid = staffId();
    if (!isLeader() || !sid) return reply(cb, { success: false, error: 'Only leader' });
    try {
      const db = getDB(); if (!db) return reply(cb, { success: false, error: 'no-db' });
      const plan = cleanPlan(data?.plan);
      const name = String(data?.name || '').trim().slice(0, 40);
      if (!plan) return reply(cb, { success: false, error: 'قالبٌ غير صالح' });
      const club = data?.scope === 'club';
      if (club && !isManager()) return reply(cb, { success: false, error: 'قوالب النادي يضعها المدير وحده' });
      let id = Number(data?.id) || 0;
      if (id) {
        const cur = rows(await db.execute(sql`SELECT staff_id, scope FROM game_templates WHERE id = ${id}`))[0];
        if (!cur) return reply(cb, { success: false, error: 'القالب غير موجود' });
        const own = Number(cur.staff_id) === sid || (cur.scope === 'club' && isManager());
        if (!own) return reply(cb, { success: false, error: 'لا تملك هذا القالب' });
        await db.execute(sql`UPDATE game_templates SET plan = ${JSON.stringify(plan)}::jsonb, name = COALESCE(NULLIF(${name}, ''), name), updated_at = NOW() WHERE id = ${id}`);
      } else {
        if (!name) return reply(cb, { success: false, error: 'سمِّ القالب' });
        const n = rows(await db.execute(sql`SELECT COUNT(*)::int AS n FROM game_templates WHERE ${club ? sql`scope = 'club'` : sql`staff_id = ${sid}`}`))[0]?.n || 0;
        if (n >= 20) return reply(cb, { success: false, error: 'أقصى 20 قالباً — احذف واحداً أوّلاً' });
        const ins = rows(await db.execute(sql`INSERT INTO game_templates (staff_id, scope, name, plan, is_default)
          VALUES (${club ? null : sid}, ${club ? 'club' : 'mine'}, ${name}, ${JSON.stringify(plan)}::jsonb, FALSE) RETURNING id`))[0];
        id = Number(ins?.id) || 0;
      }
      if (data?.isDefault === true && !club) {
        await db.execute(sql`UPDATE game_templates SET is_default = (id = ${id}) WHERE staff_id = ${sid}`);
      }
      reply(cb, { success: true, id, templates: await listFor(db, sid) });
    } catch (err: any) { reply(cb, { success: false, error: err.message }); }
  });

  socket.on('templates:set-default', async (data: { id: number | null }, cb) => {
    const sid = staffId();
    if (!isLeader() || !sid) return reply(cb, { success: false, error: 'Only leader' });
    try {
      const db = getDB(); if (!db) return reply(cb, { success: false, error: 'no-db' });
      const id = Number(data?.id) || 0;
      await db.execute(sql`UPDATE game_templates SET is_default = (id = ${id}) WHERE staff_id = ${sid}`);
      reply(cb, { success: true, templates: await listFor(db, sid) });
    } catch (err: any) { reply(cb, { success: false, error: err.message }); }
  });

  socket.on('templates:delete', async (data: { id: number }, cb) => {
    const sid = staffId();
    if (!isLeader() || !sid) return reply(cb, { success: false, error: 'Only leader' });
    try {
      const db = getDB(); if (!db) return reply(cb, { success: false, error: 'no-db' });
      const id = Number(data?.id) || 0;
      const cur = rows(await db.execute(sql`SELECT staff_id, scope FROM game_templates WHERE id = ${id}`))[0];
      if (!cur) return reply(cb, { success: false, error: 'القالب غير موجود' });
      if (!(Number(cur.staff_id) === sid || (cur.scope === 'club' && isManager()))) return reply(cb, { success: false, error: 'لا تملك هذا القالب' });
      await db.execute(sql`DELETE FROM game_templates WHERE id = ${id}`);
      reply(cb, { success: true, templates: await listFor(db, sid) });
    } catch (err: any) { reply(cb, { success: false, error: err.message }); }
  });
}
