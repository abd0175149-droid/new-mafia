// ══════════════════════════════════════════════════════
// 📸 زاوية بلا تصوير — الخدمة (2026-11-01)
//
// المفتاح، وجواب اللاعب وسجلّه، والقاصر، وحساب الرافضين المحجوزين الذين لم يصلوا،
// وتقرير الكتلة لكلّ غرفة. الهندسة نفسها في game/seating/photo-zone.ts (بلا قاعدة).
//
// القرارات المعتمدة:
//   ١ يُسأل عند كلّ دخولٍ لغرفة، وجوابه السابق مختارٌ مسبقاً، ويُحفظ في حسابه.
//   ٢ من لم يُجب (أضافه الليدر بلا سؤال، أو تطبيقٌ قديم) = بلا تصوير حتى يجيب.
//   ٣ المرساة من قالب المقاعد (noPhotoAnchor) وبلا قالب المقعد ١، والليدر يغيّرها للّيلة.
//   ٥ الحجم = الجالسون + المحجوزون الرافضون الليلة + مقعد احتياط.
//   ٦ الكتلة المكسورة: تنبيهٌ بزرّ إصلاح، لا نقل تلقائيّ.
//   ٧ القاصر (تحت ١٨ من تاريخ ميلاده) بلا تصوير دائماً — والليدر وحده يغيّره للّيلة.
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { ageFromDob, ADULT_AGE } from './consent.service.js';
import { clampAnchor, zoneReport, type PhotoZoneCtx, type ZoneOccupant, type ZoneReport } from '../game/seating/photo-zone.js';

const FLAG = 'photo_zone';
const rows = (r: any): any[] => r?.rows ?? r ?? [];

/** 🧪 للفحوص وحدها: مفتاحٌ مفروض بلا لمس علم القاعدة */
export const testHooks: { forceEnabled: boolean | null } = { forceEnabled: null };

// ── المفتاح (الداشبورد) ───────────────────────────────
let flagCache: { on: boolean; at: number } | null = null;
export async function photoZoneEnabled(): Promise<boolean> {
  if (testHooks.forceEnabled !== null) return testHooks.forceEnabled;
  if (flagCache && Date.now() - flagCache.at < 15_000) return flagCache.on;
  const db = getDB(); if (!db) return false;
  try {
    const [r] = rows(await db.execute(sql`SELECT value FROM wa_runtime_flags WHERE key = ${FLAG} LIMIT 1`));
    flagCache = { on: r?.value?.enabled === true, at: Date.now() };
  } catch { flagCache = { on: false, at: Date.now() }; }
  return flagCache.on;
}

export async function setPhotoZoneEnabled(on: boolean, by: string): Promise<void> {
  const db = getDB(); if (!db) throw new Error('DB unavailable');
  await db.execute(sql`INSERT INTO wa_runtime_flags (key, value, updated_at)
    VALUES (${FLAG}, ${JSON.stringify({ enabled: on, by, at: new Date().toISOString() })}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`);
  flagCache = { on, at: Date.now() };
}

/** حالة البطاقة: المفتاح + كم لاعباً أجاب بماذا */
export async function photoZoneStatus(): Promise<any> {
  const db = getDB();
  const on = await photoZoneEnabled();
  if (!db) return { enabled: on, answers: {} };
  const meta = rows(await db.execute(sql`SELECT value FROM wa_runtime_flags WHERE key = ${FLAG}`))[0]?.value || {};
  const [a] = rows(await db.execute(sql`SELECT
      COUNT(*) FILTER (WHERE photo_consent IS TRUE)::int  AS yes,
      COUNT(*) FILTER (WHERE photo_consent IS FALSE)::int AS no,
      COUNT(*) FILTER (WHERE photo_consent IS NULL AND COALESCE(lifetime_matches, 0) > 0)::int AS unanswered
    FROM players WHERE COALESCE(is_test_account, false) = false`));
  return { enabled: on, by: meta.by || '', at: meta.at || null, answers: a || {} };
}

// ── جواب اللاعب ──────────────────────────────────────
export interface PhotoAnswer { consent: boolean | null; isMinor: boolean }

export async function readPhotoConsent(playerId: number | null | undefined): Promise<PhotoAnswer> {
  const db = getDB();
  if (!db || !playerId) return { consent: null, isMinor: false };
  try {
    const [p] = rows(await db.execute(sql`SELECT photo_consent, dob FROM players WHERE id = ${playerId} LIMIT 1`));
    const age = ageFromDob(p?.dob);
    return { consent: p?.photo_consent ?? null, isMinor: age != null && age < ADULT_AGE };
  } catch { return { consent: null, isMinor: false }; }
}

/** القرار ٢ + ٧: الافتراضيّ الآمن — لا تصويرَ إلّا بقبولٍ صريح من بالغ */
export function effectiveNoPhoto(a: PhotoAnswer): boolean {
  if (a.isMinor) return true;
  return a.consent !== true;
}

/** يحفظ الجواب في الحساب ويسجّله — يُسجَّل التغيير وحده (والجواب الأوّل) */
export async function recordPhotoConsent(
  playerId: number,
  consent: boolean,
  source: 'join' | 'room' | 'profile' | 'leader',
  extra: { roomId?: string | null; staffId?: number | null } = {},
): Promise<void> {
  const db = getDB(); if (!db || !playerId) return;
  const [prev] = rows(await db.execute(sql`SELECT photo_consent FROM players WHERE id = ${playerId} LIMIT 1`));
  if (prev && prev.photo_consent === consent) return;
  await db.execute(sql`UPDATE players SET photo_consent = ${consent}, photo_consent_at = NOW() WHERE id = ${playerId}`);
  await db.execute(sql`INSERT INTO photo_consent_log (player_id, consent, source, room_id, staff_id)
    VALUES (${playerId}, ${consent}, ${source}, ${extra.roomId ?? null}, ${extra.staffId ?? null})`);
}

/** هاتفٌ ← جواب الحساب (لإضافة الليدر اليدويّة: أغلبها بلا playerId) */
export async function readPhotoConsentByPhone(phone: string | null | undefined): Promise<PhotoAnswer & { playerId: number | null }> {
  const db = getDB();
  const tail = String(phone || '').replace(/\D/g, '').slice(-9);
  if (!db || tail.length < 9) return { consent: null, isMinor: false, playerId: null };
  try {
    const [p] = rows(await db.execute(sql`SELECT id, photo_consent, dob FROM players
      WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 9) = ${tail}
      ORDER BY id LIMIT 1`));
    if (!p) return { consent: null, isMinor: false, playerId: null };
    const age = ageFromDob(p.dob);
    return { consent: p.photo_consent ?? null, isMinor: age != null && age < ADULT_AGE, playerId: Number(p.id) };
  } catch { return { consent: null, isMinor: false, playerId: null }; }
}

// ── الغرفة ───────────────────────────────────────────

/** شاغلو الحلقة كما تراهم الزاوية: اللاعبون والمتفرّجون معاً */
export function zoneOccupancy(state: any): Map<number, ZoneOccupant> {
  const m = new Map<number, ZoneOccupant>();
  for (const p of state?.players || []) {
    if (!p?.physicalId) continue;
    m.set(Number(p.physicalId), { noPhoto: p.noPhoto === true, locked: !!(p.seatHeld || p.frozen), name: p.name });
  }
  for (const s of state?.spectators || []) {
    if (!s?.physicalId || m.has(Number(s.physicalId))) continue;
    m.set(Number(s.physicalId), { noPhoto: s.noPhoto === true, locked: true, name: s.name });
  }
  return m;
}

export function anchorOf(state: any): number {
  const n = Number(state?.config?.maxPlayers) || 27;
  return clampAnchor(state?.photoAnchor ?? state?.photoAnchorTemplate ?? 1, n);
}

/**
 * الرافضون المحجوزون لهذه الفعاليّة ولم يجلسوا بعد في أيّ غرفةٍ منها، مقسومين على غرفها.
 * «الرافض» هنا رفضٌ **صريح** أو قاصر — غير المجيب لا يُحسب، وإلّا حجزت أوّل ليلةٍ بعد
 * التشغيل نصف الطاولة لمن لم يُسألوا قطّ.
 */
const pendingCache = new Map<string, { n: number; at: number }>();
export function forgetPending(roomId: string): void { pendingCache.delete(String(roomId)); }
export async function pendingNoPhoto(state: any): Promise<number> {
  const activityId = Number(state?.activityId) || 0;
  if (!activityId) return 0;
  const key = `${state.roomId}`;
  const hit = pendingCache.get(key);
  if (hit && Date.now() - hit.at < 20_000) return hit.n;
  const db = getDB(); if (!db) return 0;
  let n = 0;
  try {
    const list = rows(await db.execute(sql`
      SELECT DISTINCT p.id, p.photo_consent, p.dob
      FROM reservations r JOIN players p ON p.id = r.player_id
      WHERE r.activity_id = ${activityId}
        AND COALESCE(r.status, '') <> 'cancelled'
        AND (r.attended IS NULL OR r.attended = FALSE)`));
    // الجالسون في أيّ غرفةٍ من الفعاليّة نفسها لا ينتظرهم أحد
    const { activeRooms } = await import('../sockets/lobby.socket.js');
    const { getGameState } = await import('../config/redis.js');
    const seated = new Set<number>();
    let rooms = 0;
    for (const r of activeRooms.values()) {
      if (Number(r.activityId) !== activityId) continue;
      rooms++;
      const st: any = r.roomId === state.roomId ? state : await getGameState(r.roomId).catch(() => null);
      for (const p of st?.players || []) if (p.playerId) seated.add(Number(p.playerId));
      for (const s of st?.spectators || []) if (s.playerId) seated.add(Number(s.playerId));
    }
    let raw = 0;
    for (const p of list) {
      if (seated.has(Number(p.id))) continue;
      const age = ageFromDob(p.dob);
      if (p.photo_consent === false || (age != null && age < ADULT_AGE)) raw++;
    }
    n = Math.ceil(raw / Math.max(1, rooms));
  } catch (e: any) { console.warn('⚠️ pendingNoPhoto:', e.message); }
  pendingCache.set(key, { n, at: Date.now() });
  return n;
}

/**
 * 🧪 موقع الاختبار يعمل **دائماً** ولو كان المفتاح مطفأً — كفواتير واتساب (قرار المالك
 * 2026-10-30: «الاختبار على مكان الاختبار»). يُجرَّب هناك ثمّ يُشغَّل للأماكن الحقيقيّة.
 */
const testLocCache = new Map<number, { t: boolean; at: number }>();
async function isTestLocationId(locId: number | null | undefined): Promise<boolean> {
  const id = Number(locId) || 0;
  if (!id) return false;
  const hit = testLocCache.get(id);
  if (hit && Date.now() - hit.at < 60_000) return hit.t;
  const db = getDB(); if (!db) return false;
  let t = false;
  try { t = rows(await db.execute(sql`SELECT is_test_location FROM locations WHERE id = ${id} LIMIT 1`))[0]?.is_test_location === true; } catch { /* */ }
  testLocCache.set(id, { t, at: Date.now() });
  return t;
}

/** هل الزاوية تعمل في هذه الغرفة؟ المفتاح، أو موقع اختبار */
export async function zoneEnabledFor(state: any): Promise<boolean> {
  if (await photoZoneEnabled()) return true;
  if (testHooks.forceEnabled === false) return false;
  return isTestLocationId(state?.locationId);
}

/** سياق المحرّك لهذه الغرفة — null إن كانت الزاوية لا تعمل فيها */
export async function zoneCtxFor(state: any): Promise<PhotoZoneCtx | null> {
  if (!(await zoneEnabledFor(state))) return null;
  return { anchor: anchorOf(state), pending: await pendingNoPhoto(state) };
}

/**
 * يكتب على الحالة ما تحتاجه واجهة الليدر (المرساة والمنتظرون) أو يمحوه إن أُطفئ المفتاح.
 * يُعيد true إن تغيّر شيء (ليُحفظ ويُبثّ).
 */
export function stampZoneMeta(state: any, ctx: PhotoZoneCtx | null): boolean {
  const prev = state.photoZone;
  if (!ctx) { if (prev) { delete state.photoZone; return true; } return false; }
  const next = { on: true, anchor: ctx.anchor, pending: ctx.pending, anchorSource: state.photoAnchor ? 'leader' : state.photoAnchorTemplate ? 'template' : 'default' };
  if (prev && prev.anchor === next.anchor && prev.pending === next.pending && prev.anchorSource === next.anchorSource && prev.on) return false;
  state.photoZone = next;
  return true;
}

export function roomZoneReport(state: any, ctx?: PhotoZoneCtx | null): ZoneReport {
  const n = Number(state?.config?.maxPlayers) || 27;
  const c = ctx ?? { anchor: anchorOf(state), pending: Number(state?.photoZone?.pending) || 0 };
  return zoneReport(zoneOccupancy(state), c, n);
}

// ══ تنبيهات الليدر ══════════════════════════════════

/**
 * للموجّه وحده (الشاشة لا: القرار ٨ — لا تغيير على شاشة القاعة).
 * kind: outside = رافضٌ جلس خارج الكتلة · changed = صار بلا تصوير · changed-ok = صار يقبل.
 * الحمولة تحمل التقرير واقتراح الإصلاح (لا نقل تلقائيّ — القرار ٦).
 */
export async function notifyPhotoZoneIO(io: any, roomId: string, state: any, kind: 'outside' | 'changed' | 'changed-ok', seat: number, name?: string): Promise<void> {
  try {
    const report = roomZoneReport(state);
    // من صار يقبل لا يكسر شيئاً — تكفي مزامنة الحالة. ومن جلس داخل الكتلة لا تنبيه له.
    if (kind === 'changed-ok') return;
    if (kind === 'outside' && !report.outside.includes(seat)) return;
    const { emitLeaderAndDisplay } = await import('../sockets/broadcast.util.js');
    await emitLeaderAndDisplay(io, roomId, 'leader:photo-zone-alert', {
      kind, physicalId: seat, name: name || '', outside: report.outside.includes(seat), report, at: Date.now(),
    }, null);
  } catch (e: any) { console.warn('⚠️ photo zone alert:', e.message); }
}

/** بعد إجلاس شخص: يختم بيانات الزاوية على الحالة (ويبثّها إن تغيّرت)، وينبّه إن جلس رافضٌ خارج الكتلة */
export async function afterZoneSeatIO(io: any, roomId: string, ctx: PhotoZoneCtx, noPhotoSeat: number | null, name?: string): Promise<void> {
  const { getGameState, setGameState } = await import('../config/redis.js');
  const { withRoomLock } = await import('../game/state.js');
  const peek = await getGameState(roomId);
  if (!peek) return;
  // المنتظر الذي وصل الآن لم يعد منتظراً — يُعاد العدّ بلا ذاكرة (الجالس يُستثنى بحسابه)
  forgetPending(roomId);
  const fresh = { anchor: ctx.anchor, pending: await pendingNoPhoto(peek) };
  // 🔒 الكتابة تحت قفل الغرفة: انضمامان متزامنان كانا يُضيّعان لاعباً بقراءةٍ-كتابة بلا قفل
  const st = await withRoomLock(roomId, async () => {
    const cur = await getGameState(roomId);
    if (!cur) return null;
    if (stampZoneMeta(cur, fresh)) { await setGameState(roomId, cur); return { cur, changed: true }; }
    return { cur, changed: false };
  });
  if (!st) return;
  if (st.changed) {
    try { const { emitStateSanitized } = await import('../sockets/broadcast.util.js'); await emitStateSanitized(io, roomId, 'game:state-sync', st.cur); } catch { /* */ }
  }
  if (noPhotoSeat) await notifyPhotoZoneIO(io, roomId, st.cur, 'outside', noPhotoSeat, name);
}
