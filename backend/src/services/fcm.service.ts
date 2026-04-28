// ══════════════════════════════════════════════════════
// 🔔 خدمة Firebase Cloud Messaging — FCM Service
// إرسال Push Notifications للاعبين والموظفين
// ══════════════════════════════════════════════════════

import { eq, and, inArray } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { getMessaging } from '../config/firebase.js';
import { playerFcmTokens, staffFcmTokens, playerNotifications } from '../schemas/notification.schema.js';
import { notifications, staff } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';

// ── تسجيل FCM Token ─────────────────────────────────
export async function registerPlayerToken(playerId: number, token: string, deviceInfo: string = '') {
  const db = getDB();
  if (!db) return;

  try {
    // حذف نفس الـ token إن كان مسجل للاعب آخر
    await db.delete(playerFcmTokens).where(eq(playerFcmTokens.fcmToken, token));
    // إدراج أو تحديث
    await db.insert(playerFcmTokens).values({
      playerId,
      fcmToken: token,
      deviceInfo,
      isActive: true,
    });
    console.log(`📱 FCM token registered for player #${playerId}`);
  } catch (err: any) {
    console.error('❌ registerPlayerToken:', err.message);
  }
}

export async function registerStaffToken(staffId: number, token: string, deviceInfo: string = '') {
  const db = getDB();
  if (!db) return;

  try {
    await db.delete(staffFcmTokens).where(eq(staffFcmTokens.fcmToken, token));
    await db.insert(staffFcmTokens).values({
      staffId,
      fcmToken: token,
      deviceInfo,
      isActive: true,
    });
    console.log(`📱 FCM token registered for staff #${staffId}`);
  } catch (err: any) {
    console.error('❌ registerStaffToken:', err.message);
  }
}

// ── إرسال Push للاعب واحد ────────────────────────────
export async function sendPushToPlayer(
  playerId: number,
  title: string,
  body: string,
  type: string,
  data: Record<string, any> = {},
) {
  const db = getDB();
  if (!db) return;

  // حفظ الإشعار في قاعدة البيانات
  await db.insert(playerNotifications).values({
    playerId, title, body, type, data,
    isPushSent: false,
  });

  // إرسال Push
  const messaging = getMessaging();
  if (!messaging) return;

  const tokens = await db.select({ token: playerFcmTokens.fcmToken })
    .from(playerFcmTokens)
    .where(and(eq(playerFcmTokens.playerId, playerId), eq(playerFcmTokens.isActive, true)));

  if (tokens.length === 0) return;

  try {
    const response = await messaging.sendEachForMulticast({
      tokens: tokens.map(t => t.token),
      notification: { title, body },
      data: { type, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) },
      webpush: {
        fcmOptions: { link: data.url || '/player/home' },
      },
    });

    // تنظيف tokens الفاشلة
    response.responses.forEach((r, i) => {
      if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
        db.delete(playerFcmTokens).where(eq(playerFcmTokens.fcmToken, tokens[i].token)).catch(() => {});
      }
    });

    console.log(`🔔 Push sent to player #${playerId}: ${response.successCount}/${tokens.length}`);
  } catch (err: any) {
    console.error(`❌ Push to player #${playerId}:`, err.message);
  }
}

// ── إرسال Push لمجموعة لاعبين ────────────────────────
export async function sendPushToPlayers(
  playerIds: number[],
  title: string,
  body: string,
  type: string,
  data: Record<string, any> = {},
) {
  const db = getDB();
  if (!db || playerIds.length === 0) return;

  // حفظ إشعار لكل لاعب
  const rows = playerIds.map(pid => ({ playerId: pid, title, body, type, data, isPushSent: false }));
  await db.insert(playerNotifications).values(rows);

  // جلب tokens
  const messaging = getMessaging();
  if (!messaging) return;

  const tokenRows = await db.select({ token: playerFcmTokens.fcmToken })
    .from(playerFcmTokens)
    .where(and(inArray(playerFcmTokens.playerId, playerIds), eq(playerFcmTokens.isActive, true)));

  if (tokenRows.length === 0) return;

  try {
    const response = await messaging.sendEachForMulticast({
      tokens: tokenRows.map(t => t.token),
      notification: { title, body },
      data: { type, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) },
      webpush: { fcmOptions: { link: data.url || '/player/home' } },
    });

    // تنظيف tokens الفاشلة
    response.responses.forEach((r, i) => {
      if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
        db.delete(playerFcmTokens).where(eq(playerFcmTokens.fcmToken, tokenRows[i].token)).catch(() => {});
      }
    });

    console.log(`🔔 Push sent to ${playerIds.length} players: ${response.successCount} delivered`);
  } catch (err: any) {
    console.error('❌ Push to players:', err.message);
  }
}

// ── إرسال Push لكل اللاعبين ──────────────────────────
export async function sendPushToAllPlayers(title: string, body: string, type: string, data: Record<string, any> = {}) {
  const db = getDB();
  if (!db) return;

  const allPlayers = await db.select({ id: players.id }).from(players);
  const ids = allPlayers.map(p => p.id);
  if (ids.length === 0) return;

  await sendPushToPlayers(ids, title, body, type, data);
}

// ══════════════════════════════════════════════════════
// 👔 إشعارات الموظفين
// ══════════════════════════════════════════════════════

// ── إرسال Push لموظف واحد ────────────────────────────
export async function sendPushToStaff(
  staffId: number,
  title: string,
  body: string,
  type: string,
  data: Record<string, any> = {},
) {
  const db = getDB();
  if (!db) return;

  // حفظ في جدول notifications الموجود (للعرض الداخلي)
  await db.insert(notifications).values({
    userId: staffId,
    title,
    message: body,
    type: type as any,
    targetId: data.targetId || null,
  }).catch(() => {
    // نوع الإشعار قد لا يكون في الـ enum — نتجاهل
  });

  // إرسال Push
  const messaging = getMessaging();
  if (!messaging) return;

  const tokens = await db.select({ token: staffFcmTokens.fcmToken })
    .from(staffFcmTokens)
    .where(and(eq(staffFcmTokens.staffId, staffId), eq(staffFcmTokens.isActive, true)));

  if (tokens.length === 0) return;

  try {
    const response = await messaging.sendEachForMulticast({
      tokens: tokens.map(t => t.token),
      notification: { title, body },
      data: { type, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) },
      webpush: { fcmOptions: { link: data.url || '/admin' } },
    });

    response.responses.forEach((r, i) => {
      if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
        db.delete(staffFcmTokens).where(eq(staffFcmTokens.fcmToken, tokens[i].token)).catch(() => {});
      }
    });

    console.log(`🔔 Push sent to staff #${staffId}: ${response.successCount}/${tokens.length}`);
  } catch (err: any) {
    console.error(`❌ Push to staff #${staffId}:`, err.message);
  }
}

// ── إرسال Push حسب الصلاحية ──────────────────────────
export async function sendPushToStaffByPermission(
  permission: string,
  title: string,
  body: string,
  type: string,
  data: Record<string, any> = {},
  excludeStaffId?: number,
) {
  const db = getDB();
  if (!db) return;

  // جلب كل الموظفين
  const allStaff = await db.select({
    id: staff.id,
    role: staff.role,
    permissions: staff.permissions,
  }).from(staff);

  const targetIds = allStaff
    .filter(s => {
      if (excludeStaffId && s.id === excludeStaffId) return false;
      if (s.role === 'admin') return true;
      const perms = (s.permissions as string[]) || [];
      return perms.includes(permission);
    })
    .map(s => s.id);

  for (const sid of targetIds) {
    await sendPushToStaff(sid, title, body, type, data);
  }
}

// ── إرسال Push لكل الأدمنز ───────────────────────────
export async function sendPushToAdmins(
  title: string,
  body: string,
  type: string,
  data: Record<string, any> = {},
  excludeStaffId?: number,
) {
  const db = getDB();
  if (!db) return;

  const admins = await db.select({ id: staff.id }).from(staff).where(eq(staff.role, 'admin'));
  for (const admin of admins) {
    if (excludeStaffId && admin.id === excludeStaffId) continue;
    await sendPushToStaff(admin.id, title, body, type, data);
  }
}
