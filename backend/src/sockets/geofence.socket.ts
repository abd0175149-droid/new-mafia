// ══════════════════════════════════════════════════════
// 🗺️ خريطة الحضور — طبقة السوكت
//
// 🔴 مواقع اللاعبين لا تصل لاعباً أبداً. البثّ هنا يمرّ دائماً عبر fetchSockets
//    ويُصفّى بالدور — ولا يُستعمل `io.to(roomId).emit` إطلاقاً، لأنّ غرفة السوكت
//    تضمّ اللاعبين أنفسهم. هذا نفس الدرس الذي كلّفنا تسريب خطوة الليل من قبل.
//
// وما تعرضه الخريطة صادقٌ بقدر ما يسمح النظام: التطبيق لا يُبلّغ في الخلفيّة
// (إذن الخلفيّة يستدعي مراجعة متجر ولا نطلبه)، فالنقطة تتجمّد عند إغلاقه —
// ولذلك `capturedAt` يُرسَل دائماً: النقطة الباهتة تعني «هنا كان» لا «هنا هو».
// ══════════════════════════════════════════════════════

import type { Server, Socket } from 'socket.io';
import { eq, inArray } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { getGameState } from '../config/redis.js';
import { activities, locations, playerLastFix } from '../schemas/admin.schema.js';
import { haversineM } from '../services/geofence.service.js';
import { activeRooms } from './lobby.socket.js';

const isLeader = (s: any) => s?.data?.role === 'leader';

const num = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/** نقطة المكان ونصف قطر الفعاليّة — يُقرآن معاً لأنّ الأوّل على المكان والثاني قد يتجاوزه. */
async function venueOf(activityId: number | null | undefined) {
  const db = getDB();
  if (!db || !Number.isFinite(Number(activityId))) return null;
  const [row] = await db.select({
    name: locations.name,
    lat: locations.latitude,
    lng: locations.longitude,
    locRadius: locations.geofenceRadiusM,
    actRadius: activities.geofenceRadiusM,
    enabled: activities.geofenceEnabled,
  })
    .from(activities)
    .leftJoin(locations, eq(locations.id, activities.locationId))
    .where(eq(activities.id, Number(activityId)))
    .limit(1);
  if (!row) return null;
  const lat = num(row.lat), lng = num(row.lng);
  if (lat === null || lng === null) return null;
  return {
    name: row.name || '',
    lat, lng,
    radiusM: row.actRadius ?? row.locRadius ?? 200,
    enabled: row.enabled === true,
  };
}

/** أيّ غرفةٍ حيّةٍ يجلس فيها هذا اللاعب الآن؟ (للبثّ الموجَّه) */
async function roomsOfPlayer(playerId: number): Promise<string[]> {
  const out: string[] = [];
  for (const [roomId] of activeRooms) {
    const state: any = await getGameState(roomId);
    if (state?.players?.some((p: any) => p.playerId === playerId)) out.push(roomId);
  }
  return out;
}

/** يبثّ قراءةً واحدة لموجّهي الغرف التي يجلس فيها هذا اللاعب. */
export async function emitFixToLeaders(io: Server, playerId: number, fix: any): Promise<void> {
  const rooms = await roomsOfPlayer(playerId);
  if (rooms.length === 0) return;

  for (const roomId of rooms) {
    const state: any = await getGameState(roomId);
    const me = state?.players?.find((p: any) => p.playerId === playerId);
    if (!me) continue;
    const venue = await venueOf(state?.activityId);
    const lat = num(fix?.lat), lng = num(fix?.lng);
    const distanceM = (venue && lat !== null && lng !== null)
      ? haversineM(venue.lat, venue.lng, lat, lng) : null;

    const payload = {
      physicalId: me.physicalId,
      playerId,
      lat, lng,
      accuracyM: num(fix?.accuracyM),
      isMocked: fix?.isMocked === true,
      source: fix?.source === 'app' ? 'app' : 'web',
      capturedAt: num(fix?.capturedAt) ?? Date.now(),
      distanceM,
    };

    const sockets = await io.in(roomId).fetchSockets();
    for (const s of sockets) if (isLeader(s)) s.emit('geofence:fix', payload);
  }
}

export function registerGeofenceEvents(io: Server, socket: Socket) {
  // ── لقطةٌ كاملة لخريطة الغرفة — لليدر وحده ──
  socket.on('geofence:map', async (data: { roomId: string }, callback) => {
    const respond = (r: any) => { if (typeof callback === 'function') callback(r); };
    try {
      if (socket.data.authStaff) socket.data.role = 'leader';
      if (socket.data.role !== 'leader') return respond({ success: false, error: 'Only leader' });

      const state: any = await getGameState(data?.roomId);
      if (!state) return respond({ success: false, error: 'Room not found' });

      const venue = await venueOf(state.activityId);
      const db = getDB();

      const ids = (state.players || [])
        .map((p: any) => p.playerId)
        .filter((v: any) => Number.isFinite(Number(v))) as number[];

      const fixes = (db && ids.length > 0)
        ? await db.select().from(playerLastFix).where(inArray(playerLastFix.playerId, ids))
        : [];
      const byPlayer = new Map(fixes.map((f: any) => [f.playerId, f]));

      const players = (state.players || []).map((p: any) => {
        const f: any = p.playerId ? byPlayer.get(p.playerId) : null;
        const lat = f ? num(f.latitude) : null;
        const lng = f ? num(f.longitude) : null;
        const distanceM = (venue && lat !== null && lng !== null)
          ? haversineM(venue.lat, venue.lng, lat, lng) : null;
        return {
          physicalId: p.physicalId,
          playerId: p.playerId ?? null,
          name: p.name,
          isAlive: p.isAlive !== false,
          lat, lng,
          accuracyM: f ? num(f.accuracyM) : null,
          isMocked: f?.isMocked === true,
          source: f?.source || null,
          // 🔴 زمن القراءة على الجهاز لا زمن وصولها — هو ما يقول للّيدر إن كانت
          //    النقطة حيّةً أم ذكرى.
          capturedAt: f?.capturedAt ? new Date(f.capturedAt).getTime() : null,
          distanceM,
        };
      });

      respond({ success: true, venue, players, at: Date.now() });
    } catch (err: any) {
      respond({ success: false, error: err.message });
    }
  });
}
