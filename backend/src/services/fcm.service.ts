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

// ── Web Push لدعم Safari/iOS (lazy init) ──
let webpushModule: any = null;
let webpushInitialized = false;

async function getWebPush() {
  if (webpushInitialized) return webpushModule;
  webpushInitialized = true;
  try {
    webpushModule = await import('web-push');
    let VAPID_PUBLIC = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';
    let VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';

    // إذا ما فيه مفتاح خاص → نستخدم المفاتيح المولدة أو نولّد جديدة
    if (!VAPID_PRIVATE) {
      if ((global as any).__vapidKeys) {
        // استخدام المفاتيح المولدة مسبقاً (من /api/push/vapid-public-key أو مكان آخر)
        VAPID_PUBLIC = (global as any).__vapidKeys.publicKey;
        VAPID_PRIVATE = (global as any).__vapidKeys.privateKey;
        console.log('🔑 Using previously generated VAPID keys');
      } else {
        console.log('🔑 VAPID_PRIVATE_KEY not set — generating new VAPID key pair...');
        const vapidKeys = webpushModule.generateVAPIDKeys();
        VAPID_PUBLIC = vapidKeys.publicKey;
        VAPID_PRIVATE = vapidKeys.privateKey;
        (global as any).__vapidKeys = vapidKeys; // حفظ للمشاركة
        console.log('══════════════════════════════════════════════════');
        console.log('🔑 VAPID Keys Generated — Add these to your .env:');
        console.log(`VAPID_PUBLIC_KEY=${VAPID_PUBLIC}`);
        console.log(`VAPID_PRIVATE_KEY=${VAPID_PRIVATE}`);
        console.log('══════════════════════════════════════════════════');
      }
    }

    webpushModule.setVapidDetails('mailto:admin@club-mafia.grade.sbs', VAPID_PUBLIC, VAPID_PRIVATE);
    console.log('✅ web-push initialized with VAPID keys');
  } catch (err: any) {
    console.warn('⚠️ web-push module not available:', err.message);
    webpushModule = null;
  }
  return webpushModule;
}

// ── إرسال عبر Web Push API (Safari/iOS) ──
async function sendWebPush(subscriptionJson: string, title: string, body: string, type: string, data: Record<string, any> = {}) {
  const wp = await getWebPush();
  if (!wp) return false;
  try {
    const subscription = JSON.parse(subscriptionJson);
    await wp.sendNotification(subscription, JSON.stringify({
      notification: { title, body },
      data: { type, url: data.url || '/player/home', ...data },
    }));
    return true;
  } catch (err: any) {
    console.error('❌ WebPush send error:', err.message);
    return false;
  }
}

// ── فصل tokens: FCM عادي vs WebPush ──
function splitTokens(allTokens: { token: string }[]): { fcmTokens: string[]; webpushSubs: { token: string; sub: string }[] } {
  const fcmTokens: string[] = [];
  const webpushSubs: { token: string; sub: string }[] = [];

  for (const t of allTokens) {
    if (t.token.startsWith('WEBPUSH::')) {
      webpushSubs.push({ token: t.token, sub: t.token.slice(9) }); // إزالة "WEBPUSH::"
    } else {
      fcmTokens.push(t.token);
    }
  }
  return { fcmTokens, webpushSubs };
}

// ── بناء payload متوافق مع iOS Safari + Android + Desktop ──
function buildFCMPayload(
  tokens: string[],
  title: string,
  body: string,
  type: string,
  data: Record<string, any> = {},
) {
  const stringifiedData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)])
  );
  const link = data.url || '/player/home';

  return {
    tokens,
    notification: { title, body },
    data: { type, ...stringifiedData },

    // ── WebPush (Chrome, Firefox, Safari iOS PWA) ──
    webpush: {
      headers: {
        Urgency: 'high',
        TTL: '86400',
      },
      notification: {
        title,
        body,
        icon: '/mafia_logo.png',
        badge: '/mafia_logo.png',
        tag: type || 'default',
        requireInteraction: true,
        data: { url: link, type, ...stringifiedData },
      },
      fcmOptions: { link },
    },

    // ── APNs (iOS Native + Safari) ──
    apns: {
      headers: {
        'apns-priority': '10',
        'apns-push-type': 'alert',
      },
      payload: {
        aps: {
          alert: { title, body },
          badge: 1,
          sound: 'default',
          'mutable-content': 1,
        },
      },
    },
  };
}

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
  const tokens = await db.select({ token: playerFcmTokens.fcmToken })
    .from(playerFcmTokens)
    .where(and(eq(playerFcmTokens.playerId, playerId), eq(playerFcmTokens.isActive, true)));

  if (tokens.length === 0) return;

  const { fcmTokens, webpushSubs } = splitTokens(tokens);

  // إرسال عبر FCM (Chrome/Firefox/Edge)
  if (fcmTokens.length > 0) {
    const messaging = getMessaging();
    if (messaging) {
      try {
        const response = await messaging.sendEachForMulticast(
          buildFCMPayload(fcmTokens, title, body, type, data)
        );
        response.responses.forEach((r, i) => {
          if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
            db.delete(playerFcmTokens).where(eq(playerFcmTokens.fcmToken, fcmTokens[i])).catch(() => {});
          }
        });
        console.log(`🔔 FCM push to player #${playerId}: ${response.successCount}/${fcmTokens.length}`);
      } catch (err: any) {
        console.error(`❌ FCM push to player #${playerId}:`, err.message);
      }
    }
  }

  // إرسال عبر Web Push API (Safari/iOS)
  for (const wp of webpushSubs) {
    const ok = await sendWebPush(wp.sub, title, body, type, data);
    if (ok) {
      console.log(`🍎 WebPush sent to player #${playerId}`);
    } else {
      // إزالة الاشتراك الفاشل
      db.delete(playerFcmTokens).where(eq(playerFcmTokens.fcmToken, wp.token)).catch(() => {});
    }
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
  const tokenRows = await db.select({ token: playerFcmTokens.fcmToken })
    .from(playerFcmTokens)
    .where(and(inArray(playerFcmTokens.playerId, playerIds), eq(playerFcmTokens.isActive, true)));

  if (tokenRows.length === 0) return;

  const { fcmTokens, webpushSubs } = splitTokens(tokenRows);

  // FCM
  if (fcmTokens.length > 0) {
    const messaging = getMessaging();
    if (messaging) {
      try {
        const response = await messaging.sendEachForMulticast(
          buildFCMPayload(fcmTokens, title, body, type, data)
        );
        response.responses.forEach((r, i) => {
          if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
            db.delete(playerFcmTokens).where(eq(playerFcmTokens.fcmToken, fcmTokens[i])).catch(() => {});
          }
        });
        console.log(`🔔 FCM push to ${playerIds.length} players: ${response.successCount} delivered`);
      } catch (err: any) {
        console.error('❌ FCM push to players:', err.message);
      }
    }
  }

  // WebPush (Safari/iOS)
  let wpSuccess = 0;
  for (const wp of webpushSubs) {
    const ok = await sendWebPush(wp.sub, title, body, type, data);
    if (ok) wpSuccess++;
    else db.delete(playerFcmTokens).where(eq(playerFcmTokens.fcmToken, wp.token)).catch(() => {});
  }
  if (webpushSubs.length > 0) {
    console.log(`🍎 WebPush sent: ${wpSuccess}/${webpushSubs.length}`);
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
    const staffData = { ...data, url: data.url || '/admin' };
    const response = await messaging.sendEachForMulticast(
      buildFCMPayload(tokens.map(t => t.token), title, body, type, staffData)
    );

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
