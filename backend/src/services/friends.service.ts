// ══════════════════════════════════════════════════════
// 👥 «أصحابي» و«مجموعاتي» والحجز للأصحاب (خطّة توحيد الحجز م٥ب، 2026-11-21)
// ══════════════════════════════════════════════════════
// • قائمةٌ لكلّ لاعب تبدأ ممتلئة: من لعب معه ٣ ليالٍ فأكثر في ٩٠ يوماً، ومن يتابعه، ومن حجز لهم قبل.
// • ق١٦: رقم صديقٍ بلا حساب يبقى في قائمة صاحبها وحده حتّى يحذفه — لا يُستعمل لتسويقٍ ولا بثّ،
//   ويخرج منها من ضغط «مش أنا». أرقام أصحاب الحسابات لا تُعرض أبداً (الخادم يحلّها من الحساب).
// • ق١٧: «اقبل دائماً من فلان» (player_trust) ⟵ مقعده في حجوزات فلان يُثبَّت بلا سؤال.
// • الحجز للأصحاب يمرّ بآلة المجموعات نفسها (planGroup/commitGroup): مقعدٌ باسم كلّ صديق، ولا حجز
//   مرّتين لمن حجز أصلاً، والعرض يُطبَّق، والدعوة «تمام · مش أنا». المرافق بلا اسم عددٌ على الحجز
//   (ق٢٥: ويأخذ مقعده باسمه من رمز الانضمام).

import { sql } from 'drizzle-orm';
import crypto from 'crypto';
import { getDB } from '../config/db.js';

const rowsOf = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);
const H = 3600e3;

export async function migrateFriends(db: any): Promise<void> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS player_friends (
    id SERIAL PRIMARY KEY, owner_player_id INTEGER NOT NULL, friend_player_id INTEGER, name VARCHAR(100) NOT NULL,
    phone VARCHAR(20), source VARCHAR(12) DEFAULT 'manual', created_at TIMESTAMP DEFAULT NOW() NOT NULL, removed_at TIMESTAMP)`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_player_friends_acct ON player_friends (owner_player_id, friend_player_id) WHERE friend_player_id IS NOT NULL`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_player_friends_phone ON player_friends (owner_player_id, phone) WHERE friend_player_id IS NULL AND phone IS NOT NULL`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS player_friend_groups (
    id SERIAL PRIMARY KEY, owner_player_id INTEGER NOT NULL, name VARCHAR(60) NOT NULL, friend_ids JSONB DEFAULT '[]'::jsonb NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS player_trust (
    player_id INTEGER NOT NULL, trusts_player_id INTEGER NOT NULL, created_at TIMESTAMP DEFAULT NOW() NOT NULL, PRIMARY KEY (player_id, trusts_player_id))`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS booking_join_codes (
    code VARCHAR(8) PRIMARY KEY, reservation_id INTEGER NOT NULL, activity_id INTEGER NOT NULL, owner_phone VARCHAR(20),
    owner_name VARCHAR(150), seats INTEGER NOT NULL, used INTEGER DEFAULT 0 NOT NULL, expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_join_codes_res ON booking_join_codes (reservation_id)`);
  await db.execute(sql`ALTER TABLE booking_groups ADD COLUMN IF NOT EXISTS payer VARCHAR(8) DEFAULT 'each'`);
}

export interface FriendView { id: number | null; key: string; name: string; hasAccount: boolean; playerId: number | null; avatarUrl: string | null; phoneHint: string | null; source: string; nights?: number; saved: boolean }

const hint = (ph: string | null) => (ph ? `…${String(ph).slice(-3)}` : null);

/** قائمة أصحابي + الاقتراحات (لا رقم لصاحب حساب — اسمه وصورته فقط) */
export async function friendsOf(playerId: number): Promise<{ friends: FriendView[]; suggestions: FriendView[]; groups: any[] }> {
  const db = getDB(); if (!db) return { friends: [], suggestions: [], groups: [] };
  const me = Math.trunc(playerId);
  const saved = rowsOf(await db.execute(sql`
    SELECT f.id, f.friend_player_id, COALESCE(p.name, f.name) AS name, f.phone, f.source, p.avatar_url
      FROM player_friends f LEFT JOIN players p ON p.id = f.friend_player_id
     WHERE f.owner_player_id = ${me} AND f.removed_at IS NULL ORDER BY f.created_at DESC`));
  const friends: FriendView[] = saved.map((f) => ({
    id: Number(f.id), key: f.friend_player_id ? `p${f.friend_player_id}` : `f${f.id}`, name: String(f.name), hasAccount: !!f.friend_player_id,
    playerId: f.friend_player_id ? Number(f.friend_player_id) : null, avatarUrl: f.avatar_url || null,
    phoneHint: f.friend_player_id ? null : hint(f.phone), source: String(f.source || 'manual'), saved: true,
  }));
  const have = new Set(friends.filter((f) => f.playerId).map((f) => f.playerId));
  // الاقتراحات: ليالٍ مشتركة (٣+ في ٩٠ يوماً)، ومن يتابعهم، ومن حجز لهم
  const sug = rowsOf(await db.execute(sql`
    WITH mine AS (
      SELECT DISTINCT s.activity_id FROM session_players sp JOIN sessions s ON s.id = sp.session_id
       WHERE sp.player_id = ${me} AND s.activity_id IS NOT NULL AND sp.joined_at > NOW() - INTERVAL '90 days'),
    co AS (
      SELECT sp.player_id, COUNT(DISTINCT s.activity_id)::int AS nights FROM session_players sp JOIN sessions s ON s.id = sp.session_id
       WHERE s.activity_id IN (SELECT activity_id FROM mine) AND sp.player_id IS NOT NULL AND sp.player_id <> ${me}
       GROUP BY sp.player_id HAVING COUNT(DISTINCT s.activity_id) >= 3),
    fol AS (SELECT following_id AS player_id FROM player_follows WHERE follower_id = ${me}),
    bkd AS (
      SELECT DISTINCT m.player_id FROM booking_group_members m JOIN booking_groups g ON g.id = m.group_id
       WHERE g.owner_player_id = ${me} AND m.player_id IS NOT NULL AND m.status NOT IN ('declined', 'removed'))
    SELECT p.id, p.name, p.avatar_url, COALESCE(co.nights, 0) AS nights,
           CASE WHEN bkd.player_id IS NOT NULL THEN 'booked' WHEN co.player_id IS NOT NULL THEN 'coplay' ELSE 'follow' END AS source
      FROM players p
      LEFT JOIN co ON co.player_id = p.id LEFT JOIN fol ON fol.player_id = p.id LEFT JOIN bkd ON bkd.player_id = p.id
     WHERE (co.player_id IS NOT NULL OR fol.player_id IS NOT NULL OR bkd.player_id IS NOT NULL) AND p.id <> ${me}
       AND p.deleted_at IS NULL
     ORDER BY (bkd.player_id IS NOT NULL) DESC, COALESCE(co.nights, 0) DESC, p.name LIMIT 40`).catch(async () => db.execute(sql`SELECT 1 WHERE false`)));
  const suggestions: FriendView[] = sug.filter((x) => !have.has(Number(x.id))).map((x) => ({
    id: null, key: `p${x.id}`, name: String(x.name), hasAccount: true, playerId: Number(x.id), avatarUrl: x.avatar_url || null,
    phoneHint: null, source: String(x.source), nights: Number(x.nights || 0), saved: false,
  }));
  const groups = rowsOf(await db.execute(sql`SELECT id, name, friend_ids AS "friendIds" FROM player_friend_groups WHERE owner_player_id = ${me} ORDER BY updated_at DESC`));
  return { friends, suggestions, groups };
}

/** أضف صديقاً: حساباً (من الاقتراحات) أو اسماً ورقماً — رقمٌ لحسابٍ قائم يُربط بالحساب ولا يُكشف */
export async function addFriend(owner: number, input: { playerId?: number | null; name?: string; phone?: string; source?: string }): Promise<{ ok: boolean; error?: string; friend?: FriendView }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  const { normalizeLocalPhone } = await import('../utils/phone.util.js');
  let pid = input.playerId ? Math.trunc(Number(input.playerId)) : null;
  let name = String(input.name || '').trim().slice(0, 100);
  let phone: string | null = null;
  if (!pid) {
    phone = normalizeLocalPhone(String(input.phone || '')) || null;
    if (!name || name.length < 2) return { ok: false, error: 'اكتب اسم صاحبك' };
    if (!phone) return { ok: false, error: 'رقم الهاتف غير صحيح' };
    const [acc] = rowsOf(await db.execute(sql`SELECT id FROM players WHERE phone IN (${phone}, ${phone.replace(/^0/, '')}) AND deleted_at IS NULL LIMIT 1`));
    if (acc) pid = Number(acc.id);
  }
  if (pid === owner) return { ok: false, error: 'هذا رقمك أنت' };
  if (pid) {
    const [p] = rowsOf(await db.execute(sql`SELECT name FROM players WHERE id = ${pid}`));
    if (!p) return { ok: false, error: 'الحساب غير موجود' };
    if (!name) name = String(p.name);
    const [ex] = rowsOf(await db.execute(sql`SELECT id FROM player_friends WHERE owner_player_id = ${owner} AND friend_player_id = ${pid}`));
    if (ex) await db.execute(sql`UPDATE player_friends SET removed_at = NULL WHERE id = ${ex.id}`);
    else await db.execute(sql`INSERT INTO player_friends (owner_player_id, friend_player_id, name, source) VALUES (${owner}, ${pid}, ${name}, ${String(input.source || 'manual').slice(0, 12)})`);
  } else {
    await db.execute(sql`INSERT INTO player_friends (owner_player_id, name, phone, source) VALUES (${owner}, ${name}, ${phone}, ${String(input.source || 'manual').slice(0, 12)})
      ON CONFLICT (owner_player_id, phone) WHERE friend_player_id IS NULL AND phone IS NOT NULL DO UPDATE SET name = EXCLUDED.name, removed_at = NULL`);
  }
  return { ok: true };
}

export async function removeFriend(owner: number, friendId: number): Promise<void> {
  const db = getDB(); if (!db) return;
  await db.execute(sql`UPDATE player_friends SET removed_at = NOW() WHERE id = ${Math.trunc(friendId)} AND owner_player_id = ${owner}`);
}

export async function saveGroup(owner: number, name: string, keys: string[], id?: number | null): Promise<{ ok: boolean; error?: string }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  const n = String(name || '').trim().slice(0, 60);
  if (!n) return { ok: false, error: 'سمِّ المجموعة' };
  const ks = [...new Set((keys || []).map(String).filter((k) => /^[pf]\d+$/.test(k)))].slice(0, 11);
  if (!ks.length) return { ok: false, error: 'اختر صديقاً واحداً على الأقلّ' };
  if (id) await db.execute(sql`UPDATE player_friend_groups SET name = ${n}, friend_ids = ${JSON.stringify(ks)}::jsonb, updated_at = NOW() WHERE id = ${id} AND owner_player_id = ${owner}`);
  else await db.execute(sql`INSERT INTO player_friend_groups (owner_player_id, name, friend_ids) VALUES (${owner}, ${n}, ${JSON.stringify(ks)}::jsonb)`);
  return { ok: true };
}
export async function deleteGroup(owner: number, id: number): Promise<void> {
  const db = getDB(); if (!db) return;
  await db.execute(sql`DELETE FROM player_friend_groups WHERE id = ${Math.trunc(id)} AND owner_player_id = ${owner}`);
}

/** يحوّل مفاتيح الأصحاب (p<حساب>|f<صديق بلا حساب>) إلى أسماء وأرقام — الخادم وحده يرى الأرقام */
async function resolveKeys(owner: number, keys: string[]): Promise<Array<{ name: string; phone: string }>> {
  const db = getDB(); if (!db) return [];
  const out: Array<{ name: string; phone: string }> = [];
  for (const k of [...new Set(keys.map(String))]) {
    const m = /^([pf])(\d+)$/.exec(k); if (!m) continue;
    const id = Number(m[2]);
    const [r] = m[1] === 'p'
      ? rowsOf(await db.execute(sql`SELECT name, phone FROM players WHERE id = ${id} AND deleted_at IS NULL`))
      : rowsOf(await db.execute(sql`SELECT name, phone FROM player_friends WHERE id = ${id} AND owner_player_id = ${owner} AND removed_at IS NULL`));
    if (r?.phone) out.push({ name: String(r.name), phone: String(r.phone) });
  }
  return out;
}

export interface FriendsBookingInput { activityId: number; keys?: string[]; newFriends?: Array<{ name: string; phone: string }>; companions?: number; payer?: 'each' | 'owner' }

/** معاينة الحجز للأصحاب: من يُحجز له، ومن محجوزٌ أصلاً، والسعر والعرض — قبل الضغط */
export async function previewFriendsBooking(owner: { playerId: number; phone: string; name: string }, i: FriendsBookingInput) {
  const O = await import('./booking-offers.service.js');
  const members = [...(await resolveKeys(owner.playerId, i.keys || [])), ...(i.newFriends || []).map((f) => ({ name: String(f.name || '').trim(), phone: String(f.phone || '') }))];
  const companions = Math.max(0, Math.min(10, Math.trunc(Number(i.companions) || 0)));
  const plan: any = members.length ? await O.planGroup({ activityId: i.activityId, ownerPhone: owner.phone, ownerPlayerId: owner.playerId, ownerName: owner.name, members }) : null;
  if (plan && 'error' in plan) return { ok: false, error: plan.error };
  const act = plan?.activity || await O.loadActivity(i.activityId);
  if (!act) return { ok: false, error: 'الفعاليّة غير موجودة' };
  const named = plan?.people ?? 1;
  const people = named + companions;
  // العرض يُثبَّت بالأسماء (كما في الدون): يُقيَّم على المسمَّين، والمرافق بلا اسم بالسعر العاديّ
  // حتّى يأخذ مقعده باسمه برمز الانضمام
  const ev = await O.evaluateForCustomer({ activityId: i.activityId, people: named, phone: owner.phone, playerId: owner.playerId });
  const base = Number(act.price) || 0;
  const best = named > 1 ? ev.best : null;
  const nudgeEv = companions > 0 ? await O.evaluateForCustomer({ activityId: i.activityId, people, phone: owner.phone, playerId: owner.playerId }) : null;
  return {
    ok: true, activity: { id: act.id, name: act.name, price: base }, people, companions,
    members: (plan?.members || []).map((m: any) => ({ name: m.name, ok: m.ok, reason: m.reason || null, already: !!m.existingBookingId || !!m.alreadyInGroup })),
    total: Math.round(((best ? best.pay : named) + companions) * base * 100) / 100, full: Math.round(people * base * 100) / 100,
    offer: best ? { name: best.name, free: best.free, pay: best.pay } : null,
    // مرافقون كانوا سيأخذون العرض لو سُمّوا ⟵ تلميح «سمِّهم»
    nameHint: nudgeEv?.best && (!best || nudgeEv.best.free > best.free) ? { name: nudgeEv.best.name, free: nudgeEv.best.free } : null,
    nudge: !best && ev.nudge?.nudge ? { name: ev.nudge.name, need: ev.nudge.nudge.need, free: ev.nudge.nudge.free } : null,
  };
}

/**
 * ✅ احجز للأصحاب (التطبيق): بعد حجز صاحب الحساب نفسه — مجموعةٌ بأسمائهم عبر commitGroup، والمرافقون
 * عددٌ على الحجز، والأصحاب الجدد يُحفظون في قائمته (ق١٦)، ومن يدفع يُحفظ على المجموعة (ق١٨).
 */
export async function bookForFriends(owner: { playerId: number; phone: string; name: string }, i: FriendsBookingInput): Promise<{ ok: boolean; error?: string; text?: string; people?: number; joinCode?: string | null }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  const O = await import('./booking-offers.service.js');
  const newOnes = (i.newFriends || []).map((f) => ({ name: String(f.name || '').trim(), phone: String(f.phone || '') })).filter((f) => f.name && f.phone);
  for (const f of newOnes) await addFriend(owner.playerId, { name: f.name, phone: f.phone, source: 'booked' }).catch(() => {});
  const members = [...(await resolveKeys(owner.playerId, i.keys || [])), ...newOnes];
  const companions = Math.max(0, Math.min(10, Math.trunc(Number(i.companions) || 0)));
  let text = '';
  if (members.length) {
    const [conv] = rowsOf(await db.execute(sql`SELECT id FROM wa_conversations WHERE phone = ${owner.phone} LIMIT 1`));
    const { sendMessage } = await import('./whatsapp-inbox.service.js');
    const { ensureBookingForReservation } = await import('./reservation-booking.service.js');
    const r = await O.commitGroup({
      conv: { id: conv ? Number(conv.id) : (null as any), phone: owner.phone, playerId: owner.playerId, displayName: owner.name },
      activityId: i.activityId, members, botTag: 'player-app', contactMethod: 'التطبيق',
      h: {
        sendMessage, mirrorReservation: async (d: any, saved: any) => ensureBookingForReservation(d, saved),
        notifyAdmins: async (t: string, b: string, data?: any) => {
          const [an] = rowsOf(await db.execute(sql`SELECT name FROM activities WHERE id = ${i.activityId}`));
          if (String(an?.name || '').startsWith('🧪')) return;   // فعاليّات الفحص لا تُشعر أحداً
          const { sendPushToStaffByPermission } = await import('./fcm.service.js');
          sendPushToStaffByPermission('bookings', t, b, 'reservation', { url: `/admin/reservations?activityId=${i.activityId}`, ...(data || {}) });
        },
      },
    });
    if (!r.ok) return { ok: false, error: r.text };
    text = r.text;
    if (i.payer === 'owner') await db.execute(sql`UPDATE booking_groups SET payer = 'owner' WHERE id = ${r.groupId}`);
  }
  // المرافقون بلا اسم ⟵ عددٌ على الحجز + رمز انضمام لمن يريد مقعده باسمه
  let joinCode: string | null = null;
  const [res] = rowsOf(await db.execute(sql`SELECT id, people_count FROM reservations WHERE activity_id = ${i.activityId} AND deleted_at IS NULL
     AND (player_id = ${owner.playerId} OR phone = ${owner.phone}) ORDER BY id LIMIT 1`));
  if (res && companions > 0) {
    const { withActor } = await import('./booking-commands.service.js');
    await withActor({ channel: 'app', actor: owner.name }, (tx: any) => tx.execute(sql`UPDATE reservations SET people_count = people_count + ${companions}, updated_at = NOW(),
      notes = COALESCE(notes, '') || ${` · ➕ ${companions} مرافق من التطبيق`} WHERE id = ${res.id}`));
    joinCode = await createJoinCode(Number(res.id), companions);
  }
  return { ok: true, text, people: res ? Number(res.people_count) + companions : undefined, joinCode };
}

// ══════════════════════════════════════════════════════
// 🎟️ رمز الانضمام (ق٢٥): «احجزلي ٤» ثمّ رسالةٌ جاهزة يحوّلها صاحب الحجز — من يرسل الرمز للدون
//    من رقمه يأخذ مقعداً باسمه، ويُبلَّغ صاحب الحجز، والرمز ينتهي ببدء اللعبة.
// ══════════════════════════════════════════════════════
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export async function createJoinCode(resId: number, seats: number): Promise<string | null> {
  const db = getDB(); if (!db) return null;
  const [r] = rowsOf(await db.execute(sql`SELECT r.id, r.activity_id, r.phone, r.contact_name, a.date FROM reservations r JOIN activities a ON a.id = r.activity_id WHERE r.id = ${resId} AND r.deleted_at IS NULL`));
  if (!r) return null;
  const [ex] = rowsOf(await db.execute(sql`SELECT code FROM booking_join_codes WHERE reservation_id = ${resId} AND expires_at > NOW() LIMIT 1`));
  if (ex) { await db.execute(sql`UPDATE booking_join_codes SET seats = used + ${Math.max(1, seats)} WHERE code = ${ex.code}`); return String(ex.code); }
  for (let t = 0; t < 5; t++) {
    const code = Array.from(crypto.randomBytes(6)).map((b) => ALPH[b % ALPH.length]).join('');
    const ins = rowsOf(await db.execute(sql`INSERT INTO booking_join_codes (code, reservation_id, activity_id, owner_phone, owner_name, seats, expires_at)
      VALUES (${code}, ${resId}, ${r.activity_id}, ${r.phone}, ${r.contact_name}, ${Math.max(1, seats)}, ${new Date(r.date)}) ON CONFLICT DO NOTHING RETURNING code`));
    if (ins.length) return code;
  }
  return null;
}

export function joinMessage(code: string, ownerName: string, actName: string, when: string): string {
  const first = kunyaFirst(ownerName);
  return `🎭 ${first} حجزلك مقعد معه في «${actName}» (${when}).\nلتثبّت مقعدك باسمك ابعت للدون على واتساب:\nانضمام ${code}`;
}

/** ق٢٥: «انضمام XXXXXX» من رقم المرسل ⟵ مقعدٌ باسمه في حجز صاحب الرمز */
export async function claimJoinCode(code: string, claimer: { phone: string; name: string; playerId: number | null }): Promise<{ ok: boolean; text: string; ownerPhone?: string; ownerName?: string; activityName?: string }> {
  const db = getDB(); if (!db) return { ok: false, text: 'صار خلل 🙏' };
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const [j] = rowsOf(await db.execute(sql`SELECT j.*, a.name AS act_name, a.date FROM booking_join_codes j JOIN activities a ON a.id = j.activity_id WHERE j.code = ${c}`));
  if (!j) return { ok: false, text: 'الرمز غير صحيح 🙏 تأكّد منه واكتبه مثل ما وصلك.' };
  if (new Date(j.expires_at).getTime() < Date.now()) return { ok: false, text: 'انتهى هذا الرمز مع بداية اللعبة 🙏' };
  if (Number(j.used) >= Number(j.seats)) return { ok: false, text: 'كلّ المقاعد على هذا الرمز انأخذت 🙏 كلّم صاحب الحجز.' };
  if (claimer.phone === j.owner_phone) return { ok: false, text: 'هذا رمز حجزك أنت 🙂 حوّله لأصحابك.' };
  const { existingBookingAnywhere } = await import('./reservation-booking.service.js');
  const dup = await existingBookingAnywhere(db as any, Number(j.activity_id), claimer.playerId, claimer.phone);
  if (dup) return { ok: false, text: `عندك حجز أصلاً في «${j.act_name}» 🎭` };
  // مقعدٌ باسمه: عضوٌ في مجموعة صاحب الحجز (تُنشأ مجموعةٌ بلا عرض إن لم تكن)، وحجزٌ باسم حسابه إن وُجد
  const r = await db.transaction(async (tx: any) => {
    const upd = rowsOf(await tx.execute(sql`UPDATE booking_join_codes SET used = used + 1 WHERE code = ${c} AND used < seats RETURNING used`));
    if (!upd.length) return null;
    const [res] = rowsOf(await tx.execute(sql`SELECT id, phone, player_id, contact_name FROM reservations WHERE id = ${j.reservation_id} AND deleted_at IS NULL`));
    if (!res) return null;
    let [g] = rowsOf(await tx.execute(sql`SELECT id FROM booking_groups WHERE reservation_id = ${res.id} AND status <> 'void' LIMIT 1`));
    if (!g) {
      [g] = rowsOf(await tx.execute(sql`INSERT INTO booking_groups (activity_id, reservation_id, owner_phone, owner_player_id, owner_name, offer_id, terms, declared_people, promised_free, source, status)
        SELECT ${j.activity_id}, ${res.id}, ${res.phone}, ${res.player_id}, ${res.contact_name}, NULL, '{}'::jsonb, people_count, 0, 'join', 'claimed' FROM reservations WHERE id = ${res.id} RETURNING id`));
    }
    let bookingId: number | null = null;
    if (claimer.playerId) {
      const [b] = rowsOf(await tx.execute(sql`INSERT INTO bookings (activity_id, name, phone, count, player_id, created_by, group_id, notes, channel, actor)
        VALUES (${j.activity_id}, ${claimer.name}, ${claimer.phone}, 1, ${claimer.playerId}, '👥 مجموعة عبر الدون', ${g.id}, ${`👥 انضمّ برمز ${c} لحجز ${res.contact_name}`}, 'group', ${claimer.name}) RETURNING id`));
      bookingId = Number(b.id);
    }
    await tx.execute(sql`INSERT INTO booking_group_members (group_id, activity_id, name, phone, player_id, booking_id, status, accepted_at)
      VALUES (${g.id}, ${j.activity_id}, ${claimer.name}, ${claimer.phone}, ${claimer.playerId}, ${bookingId}, 'joined', NOW())`);
    await tx.execute(sql`INSERT INTO booking_events (reservation_id, activity_id, channel, actor, kind, detail)
      VALUES (${res.id}, ${j.activity_id}, 'bot', ${claimer.name.slice(0, 120)}, 'seat_claimed', ${JSON.stringify({ code: c, name: claimer.name })}::jsonb)`);
    return { ownerPhone: String(res.phone), ownerName: String(res.contact_name || ''), groupId: Number(g.id) };
  });
  if (!r) return { ok: false, text: 'كلّ المقاعد على هذا الرمز انأخذت 🙏' };
  // 🎁 المقعد صار مسمّى ⟵ يُعاد تقييم عرض المجموعة على صاحب الحجز + المسمَّين
  try { const O = await import('./booking-offers.service.js'); await O.refreshGroupOffer(r.groupId); } catch (e: any) { console.warn('⚠️ refresh group offer:', e?.message); }
  return { ok: true, text: `تمّ ✅ مقعدك باسمك في «${j.act_name}» مع ${kunyaFirst(r.ownerName)} 🎭`, ownerPhone: r.ownerPhone, ownerName: r.ownerName, activityName: String(j.act_name) };
}

/** الاسم الأوّل — والكنية كلمتان («أبو لين» لا «أبو») */
export function kunyaFirst(name: string): string {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return 'صديقك';
  return /^(أبو|ابو|أم|ام|بنت|ابن|بن)$/.test(w[0]) && w[1] ? `${w[0]} ${w[1]}` : w[0];
}

/** ق١٧: يثق بصاحب الحجز ⟵ مقعده يُثبَّت بلا سؤال */
export async function trusts(playerId: number, ownerPlayerId: number | null | undefined): Promise<boolean> {
  if (!ownerPlayerId) return false;
  const db = getDB(); if (!db) return false;
  return rowsOf(await db.execute(sql`SELECT 1 FROM player_trust WHERE player_id = ${playerId} AND trusts_player_id = ${ownerPlayerId}`)).length > 0;
}
export async function setTrust(playerId: number, ownerPlayerId: number, on: boolean): Promise<void> {
  const db = getDB(); if (!db) return;
  if (on) await db.execute(sql`INSERT INTO player_trust (player_id, trusts_player_id) VALUES (${playerId}, ${ownerPlayerId}) ON CONFLICT DO NOTHING`);
  else await db.execute(sql`DELETE FROM player_trust WHERE player_id = ${playerId} AND trusts_player_id = ${ownerPlayerId}`);
}

/** ق١٦: «مش أنا» ⟵ يخرج الرقم من قوائم الأصحاب (بلا حساب) */
export async function forgetPhoneEverywhere(phone: string): Promise<void> {
  const db = getDB(); if (!db || !phone) return;
  await db.execute(sql`UPDATE player_friends SET removed_at = NOW() WHERE friend_player_id IS NULL AND phone = ${phone} AND removed_at IS NULL`);
}
