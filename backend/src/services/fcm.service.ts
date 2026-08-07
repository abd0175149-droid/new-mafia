// ══════════════════════════════════════════════════════
// 🔔 خدمة Firebase Cloud Messaging — FCM Service
// إرسال Push Notifications للاعبين والموظفين
// ══════════════════════════════════════════════════════

import { eq, and, inArray, sql, like, isNull, desc } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { getMessaging } from '../config/firebase.js';
import { playerFcmTokens, staffFcmTokens, playerNotifications } from '../schemas/notification.schema.js';
import { notifications, staff } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';

// ── Web Push لدعم Safari/iOS (lazy init) ──
// المفاتيح من مصدر واحد ثابت (config/vapid.ts) لضمان تطابقها مع ما يشترك به العميل
let webpushModule: any = null;
let webpushInitialized = false;

async function getWebPush() {
  if (webpushInitialized) return webpushModule;
  webpushInitialized = true;
  try {
    const { initWebPush } = await import('../config/vapid.js');
    webpushModule = await initWebPush();
    if (webpushModule) {
      console.log('✅ web-push initialized with stable VAPID keys');
    }
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
      data: { title, body, type, url: data.url || '/player/home', ...data },
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
// ⚠️ iOS يتطلب notification في المستوى الأعلى لإيقاظ الجهاز
//    لمنع التكرار: SW يتحقق من tag ويمنع العرض المتكرر
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
  // tag ثابت لكل نوع — يمنع تكرار نفس الإشعار
  const notifTag = `${type || 'default'}-${Date.now()}`;

  return {
    tokens,
    // ⚠️ لا نرسل notification في المستوى الأعلى — لمنع المتصفح من عرض إشعار تلقائي
    // العرض يتم فقط من sw.js (مصدر واحد = بلا تكرار)
    data: { type, title, body, tag: notifTag, url: link, ...stringifiedData },

    // ── WebPush (Chrome, Firefox, Safari iOS PWA) ──
    webpush: {
      headers: {
        Urgency: 'high',
        TTL: '86400',
      },
      // لا نرسل notification هنا أيضاً — sw.js يتولى العرض
      data: { type, title, body, tag: notifTag, url: link, ...stringifiedData },
      fcmOptions: { link },
    },

    // ── Android الأصليّ (تطبيق Flutter) ──
    // 🔴 بدون هذه الكتلة لا يظهر أيّ إشعار على تطبيق أندرويد إطلاقاً:
    //    الرسالة data-only عمداً (الويب يعرضها من sw.js)، وiOS يعرضها
    //    النظام من `aps.alert` — أمّا أندرويد الأصليّ فكان بلا عارض:
    //    النظام لا يعرض data-only في الخلفية، ومعالج الخلفية في التطبيق
    //    لا يعرض، وعارض الواجهة يقرأ `message.notification` الفارغة.
    //    هذه الكتلة تخصّ **قناة أندرويد وحدها** — متصفّحات كروم (حتى على
    //    أندرويد) تستلم عبر قناة `webpush` أعلاه، فلا تكرار على الويب.
    //    في خلفية التطبيق يعرضها النظام بنفسه، وفي واجهته تصل
    //    `message.notification` معبّأةً فيعرضها العارض المحليّ القائم.
    android: {
      priority: 'high' as const,
      collapseKey: type || 'default',
      notification: {
        title,
        body,
        // القناة التي ينشئها التطبيق عند التهيئة — إشعارٌ بلا قناة
        // على أندرويد 8+ يسقط في قناة fallback عامّة بإعدادات مبهمة.
        channelId: 'mafia_default',
        sound: 'default',
        // نفس دلالة apns-collapse-id: إشعارات النوع الواحد تتبادل المكان.
        tag: type || 'default',
      },
    },

    // ── APNs (iOS Native + Safari) ──
    apns: {
      headers: {
        'apns-priority': '10',
        'apns-push-type': 'alert',
        'apns-collapse-id': type || 'default', // منع تكرار نفس النوع
      },
      payload: {
        aps: {
          alert: { title, body },
          badge: 1,
          sound: 'default',
          'mutable-content': 1,
          'content-available': 1,
        },
      },
    },
  };
}

// ── تسجيل FCM Token ─────────────────────────────────
// deviceId: معرّف جهاز ثابت وفريد لكل تثبيت (من localStorage في الواجهة) — مصدر الحقيقة
//           لإزالة التكرار حسب الجهاز الفعلي. deviceInfo: User-Agent (للعرض فقط).
export async function registerPlayerToken(
  playerId: number,
  token: string,
  deviceInfo: string = '',
  deviceId: string = '',
  platform: string = 'web',
) {
  const db = getDB();
  if (!db) return;

  // نخزّن المعرّف الثابت مع الـ UA: "<deviceId>|<UA>" لإتاحة الإزالة بالبادئة بلا تعديل المخطّط.
  const storedInfo = (deviceId ? `${deviceId}|${deviceInfo}` : deviceInfo).slice(0, 200);

  try {
    // نُسلسل التسجيل لكل لاعب عبر قفل استشاري داخل معاملة، لمنع السباق الذي يُنشئ توكنات مكررة.
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${playerId})`);

      // ① إزالة هذا التوكن من أي ارتباط سابق (الجهاز انتقل لحساب آخر / إعادة تسجيل).
      await tx.delete(playerFcmTokens).where(eq(playerFcmTokens.fcmToken, token));

      if (deviceId) {
        // ② الإزالة حسب الجهاز الفعلي (معرّف ثابت) عبر كل اللاعبين:
        //    - نفس اللاعب نفس الجهاز → لا تكرار.
        //    - هاتف مشترك بين لاعبين → يُزال توكن اللاعب السابق ويُربط بالأخير.
        //    - أجهزة مختلفة (UA متطابق) → معرّفات مختلفة → تبقى كلها (تعدّد الأجهزة سليم).
        await tx.delete(playerFcmTokens).where(like(playerFcmTokens.deviceInfo, `${deviceId}|%`));
      } else if (deviceInfo) {
        // توافق خلفي (طلبات قديمة بلا معرّف جهاز): إزالة حسب (اللاعب + UA).
        await tx.delete(playerFcmTokens).where(
          and(eq(playerFcmTokens.playerId, playerId), eq(playerFcmTokens.deviceInfo, deviceInfo))
        );
      }

      await tx.insert(playerFcmTokens).values({
        playerId,
        fcmToken: token,
        deviceInfo: storedInfo,
        // قائمة مغلقة: أي قيمة أخرى تعود web — لا نخزّن ما يرسله عميل كما هو.
        platform: ['android', 'ios'].includes(platform) ? platform : 'web',
        isActive: true,
      } as any);
    });
    console.log(`📱 FCM token registered for player #${playerId} (${platform}, device=${deviceId || 'UA-fallback'})`);
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
    } as any);
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

  // حفظ الإشعار في قاعدة البيانات والتقاط معرف السجل
  const [insertedNotif] = await db.insert(playerNotifications).values({
    playerId, title, body, type, data,
    isPushSent: false,
  } as any).returning({ id: playerNotifications.id });

  // ملاحظة: يُحدَّث التطبيق لحظياً عبر رسالة SW (PUSH_RECEIVED) + onMessage (FCM) + polling.
  // أُزيل بثّ io.emit('notification:new') العام لأنه لم يكن مُستهلَكاً في الواجهة وكان
  // يسرّب محتوى الإشعار لكل المتصلين. للبثّ اللحظي مستقبلاً استخدم غرفة اللاعب: io.to(`player:${id}`).

  // إرسال Push
  const tokens = await db.select({ token: playerFcmTokens.fcmToken })
    .from(playerFcmTokens)
    .where(and(eq(playerFcmTokens.playerId, playerId), eq(playerFcmTokens.isActive, true)));

  if (tokens.length === 0) return;

  const { fcmTokens, webpushSubs } = splitTokens(tokens);
  let isDelivered = false;

  // إرسال عبر FCM (Chrome/Firefox/Edge)
  if (fcmTokens.length > 0) {
    const messaging = getMessaging();
    if (messaging) {
      try {
        const response = await messaging.sendEachForMulticast(
          buildFCMPayload(fcmTokens, title, body, type, data)
        );
        if (response.successCount > 0) {
          isDelivered = true;
        }
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
      isDelivered = true;
      console.log(`🍎 WebPush sent to player #${playerId}`);
    } else {
      // إزالة الاشتراك الفاشل
      db.delete(playerFcmTokens).where(eq(playerFcmTokens.fcmToken, wp.token)).catch(() => {});
    }
  }

  // تحديث حالة الإرسال في قاعدة البيانات عند النجاح الفعلي
  if (isDelivered && insertedNotif?.id) {
    await db.update(playerNotifications)
      .set({ isPushSent: true } as any)
      .where(eq(playerNotifications.id, insertedNotif.id));
    console.log(`✅ Push notification #${insertedNotif.id} status updated to isPushSent=true`);
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

  // حفظ إشعار لكل لاعب والتقاط المعرفات.
  // 📌 دمج بالوسم (قرار المالك — إشعارات محادثات الواتساب): وجود data.tag يعني
  // «إشعار واحد حي لكل وسم»: إن وُجد صف غير مقروء بنفس الوسم يُحدَّث بمكانه
  // (آخر رسالة + العدد بالعنوان + يصعد لأعلى القائمة) بدل إغراق الصندوق بصف
  // لكل رسالة — وبعد فتحه (يُحذف عند القراءة) تبدأ الرسائل الجديدة دورة بصف جديد.
  const collapseTag = data && typeof (data as any).tag === 'string' && (data as any).tag ? String((data as any).tag) : '';
  let insertedRows: Array<{ id: number; playerId: number | null }>;
  if (collapseTag) {
    insertedRows = [];
    for (const pid of playerIds) {
      const [existing] = await db
        .select({ id: playerNotifications.id })
        .from(playerNotifications)
        .where(and(
          eq(playerNotifications.playerId, pid),
          eq(playerNotifications.isRead, false),
          sql`${playerNotifications.data}->>'tag' = ${collapseTag}`,
        ))
        .orderBy(desc(playerNotifications.id))
        .limit(1);
      if (existing) {
        await db.update(playerNotifications)
          .set({ title, body, type, data, isPushSent: false, createdAt: new Date() } as any)
          .where(eq(playerNotifications.id, existing.id));
        insertedRows.push({ id: existing.id, playerId: pid });
      } else {
        const [row] = await db.insert(playerNotifications)
          .values({ playerId: pid, title, body, type, data, isPushSent: false } as any)
          .returning({ id: playerNotifications.id, playerId: playerNotifications.playerId });
        insertedRows.push(row);
      }
    }
  } else {
    insertedRows = await db.insert(playerNotifications).values(
      playerIds.map(pid => ({ playerId: pid, title, body, type, data, isPushSent: false }))
    ).returning({ id: playerNotifications.id, playerId: playerNotifications.playerId });
  }

  // ملاحظة: أُزيل بثّ io.emit('notification:new') العام (غير مُستهلَك في الواجهة + يسرّب
  // محتوى الإشعار لكل المتصلين). التحديث اللحظي يتم عبر SW (PUSH_RECEIVED) + onMessage + polling.

  // جلب tokens مع معرّف اللاعب — لتتبّع النجاح الفعلي لكل لاعب
  const tokenRows = await db.select({ playerId: playerFcmTokens.playerId, token: playerFcmTokens.fcmToken })
    .from(playerFcmTokens)
    .where(and(inArray(playerFcmTokens.playerId, playerIds), eq(playerFcmTokens.isActive, true)));

  if (tokenRows.length === 0) return;

  // فصل FCM عن WebPush مع الاحتفاظ بمعرّف اللاعب لكل توكن
  const fcmRows = tokenRows.filter(r => !r.token.startsWith('WEBPUSH::'));
  const webpushRows = tokenRows.filter(r => r.token.startsWith('WEBPUSH::'));

  const successfulPlayerIds = new Set<number>();

  // FCM (Android/Chrome/Edge/Firefox)
  if (fcmRows.length > 0) {
    const messaging = getMessaging();
    if (messaging) {
      try {
        const response = await messaging.sendEachForMulticast(
          buildFCMPayload(fcmRows.map(r => r.token), title, body, type, data)
        );
        response.responses.forEach((r, i) => {
          const row = fcmRows[i];
          if (r.success) {
            if (row.playerId) successfulPlayerIds.add(row.playerId);
          } else if (r.error?.code === 'messaging/registration-token-not-registered') {
            db.delete(playerFcmTokens).where(eq(playerFcmTokens.fcmToken, row.token)).catch(() => {});
          }
        });
        console.log(`🔔 FCM push to ${playerIds.length} players: ${response.successCount} delivered`);
      } catch (err: any) {
        console.error('❌ FCM push to players:', err.message);
      }
    }
  }

  // WebPush (Safari/iOS)
  let wpSuccessCount = 0;
  for (const wp of webpushRows) {
    const ok = await sendWebPush(wp.token.slice(9), title, body, type, data); // إزالة "WEBPUSH::"
    if (ok) {
      wpSuccessCount++;
      if (wp.playerId) successfulPlayerIds.add(wp.playerId);
    } else {
      db.delete(playerFcmTokens).where(eq(playerFcmTokens.fcmToken, wp.token)).catch(() => {});
    }
  }
  if (webpushRows.length > 0) {
    console.log(`🍎 WebPush sent: ${wpSuccessCount}/${webpushRows.length}`);
  }

  // تحديث isPushSent فقط للاعبين الذين نجح الإرسال إليهم فعلياً
  if (successfulPlayerIds.size > 0 && insertedRows.length > 0) {
    const successfulRowIds = insertedRows
      .filter(row => row.playerId && successfulPlayerIds.has(row.playerId))
      .map(row => row.id);
    
    if (successfulRowIds.length > 0) {
      await db.update(playerNotifications)
        .set({ isPushSent: true } as any)
        .where(inArray(playerNotifications.id, successfulRowIds));
      console.log(`✅ Updated isPushSent=true for ${successfulRowIds.length} notification rows`);
    }
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
  } as any).catch(() => {
    // نوع الإشعار قد لا يكون في الـ enum — نتجاهل
  });


  // إرسال Push
  const messaging = getMessaging();
  if (!messaging) return;

  const tokens = await db.select({ token: staffFcmTokens.fcmToken })
    .from(staffFcmTokens)
    .where(and(eq(staffFcmTokens.staffId, staffId), eq(staffFcmTokens.isActive, true)));

  if (tokens.length === 0) {
    // 🔇 حسابٌ بلا جهازٍ مسجَّل — كان يخرج بصمتٍ تامّ فيظنّ المكان أنّ الإشعارات
    //    تعمل وهي معطّلة. السجلّ هنا هو ما يكشف طلباتٍ تضيع بلا أثر.
    console.warn(`🔕 لا أجهزة مسجّلة للموظّف #${staffId} — لم يُرسَل إشعار «${title}»`);
    return;
  }

  // 🍎 نفس تقسيم مسار اللاعب: توكن يبدأ بـ WEBPUSH:: هو اشتراك Safari/iOS
  //    لا توكن FCM. تمريره لـFCM كما كان يفشل دائماً — وهو سبب صمت الآيفون.
  const { fcmTokens, webpushSubs } = splitTokens(tokens);
  const staffData = { ...data, url: data.url || '/admin' };
  let ok = 0;

  if (fcmTokens.length > 0) {
    try {
      const response = await messaging.sendEachForMulticast(
        buildFCMPayload(fcmTokens, title, body, type, staffData)
      );
      ok += response.successCount;
      response.responses.forEach((r, i) => {
        if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
          db.delete(staffFcmTokens).where(eq(staffFcmTokens.fcmToken, fcmTokens[i])).catch(() => {});
        }
      });
    } catch (err: any) {
      console.error(`❌ FCM push to staff #${staffId}:`, err.message);
    }
  }

  for (const wp of webpushSubs) {
    if (await sendWebPush(wp.sub, title, body, type, staffData)) {
      ok++;
    } else {
      // اشتراكٌ منتهٍ (المستخدم أزال التطبيق أو أوقف الإذن) — يُنظَّف
      db.delete(staffFcmTokens).where(eq(staffFcmTokens.fcmToken, wp.token)).catch(() => {});
    }
  }

  console.log(`🔔 Push to staff #${staffId}: ${ok}/${tokens.length} (fcm ${fcmTokens.length} · webpush ${webpushSubs.length})`);
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

// ── 🏪 إرسال Push لحسابات مكان محدّد (حسب الصلاحيّة) ──
// لا يشمل الأدمن — إشعارات المكان تخصّ حساباته المرتبطة فقط.
export async function sendPushToLocationStaff(
  locationId: number,
  permission: string,
  title: string,
  body: string,
  type: string,
  data: Record<string, any> = {},
) {
  const db = getDB();
  if (!db) return;

  const rows = await db.select({ id: staff.id, permissions: staff.permissions })
    .from(staff)
    .where(and(
      eq(staff.locationId, locationId),
      eq(staff.role, 'location_owner' as any),
      eq(staff.isActive, true),
      isNull(staff.deletedAt),
    ));

  for (const s of rows) {
    const perms = (s.permissions as string[]) || [];
    if (!perms.includes(permission)) continue;
    await sendPushToStaff(s.id, title, body, type, data);
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
