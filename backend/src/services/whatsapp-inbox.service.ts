// ══════════════════════════════════════════════════════
// 💬 WhatsApp Inbox Service — قلب مركز المحادثات
// ══════════════════════════════════════════════════════
// المسؤوليات:
//   • استقبال أحداث webhook (رسائل واردة + حالات تسليم) وتخزينها
//   • الربط التلقائي بالعملاء (players) عبر توحيد الأرقام
//   • أنبوب الإرسال الموحّد (موظف / بوت / نظام) عبر Cloud API
//   • البث اللحظي لغرفة wa:inbox + إشعارات push للأدمنية (عبر تطبيق اللاعب)
//   • تمرير الرسائل للبوت (n8n) عندما يكون مفعّلاً وغير موقوف مؤقتاً
//
// قاعدة ذهبية: الهاتف داخل قاعدة البيانات دائماً بصيغة 07XXXXXXXX،
// والتحويل إلى 962... يتم فقط عند حدود Cloud API.

import { eq, sql, inArray } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { env } from '../config/env.js';
import { waConversations, waMessages, waOptouts, staff, reservations } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { normalizeLocalPhone, toWaPhone, samePhone, normalizeAnyPhone } from '../utils/phone.util.js';
import { sendPushToPlayers } from './fcm.service.js';

const GRAPH_BASE = 'https://graph.facebook.com/v20.0';

// نافذة الرد الحر (رسائل service المجانية) — 24 ساعة من آخر رسالة واردة
const FREE_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
// مدة إيقاف البوت المؤقت بعد رد بشري (قرار المالك: 30 دقيقة)
export const BOT_PAUSE_AFTER_HUMAN_MS = 30 * 60 * 1000;

// ── تفعيل الميزة ─────────────────────────────────────
export function waEnabled(): boolean {
  return !!(env.WA_TOKEN && env.WA_PHONE_NUMBER_ID);
}

// ── بث لحظي لغرفة الإنبوكس (أدمن فقط — الانضمام في index.ts) ──
function emitInbox(event: string, payload: any) {
  try {
    const io = (global as any).io;
    if (io) io.to('wa:inbox').emit(event, payload);
  } catch { /* البث ليس حرجاً */ }
}

// ── استدعاء Cloud API ────────────────────────────────
async function callWaApi(path: string, body: any): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${GRAPH_BASE}/${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `WhatsApp API HTTP ${res.status}`;
      const err: any = new Error(msg);
      err.waError = data?.error || null;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ══════════════════════════════════════════════════════
// المحادثات: إيجاد/إنشاء + ربط اللاعب
// ══════════════════════════════════════════════════════

async function findPlayerByPhone(db: any, localPhone: string) {
  const [p] = await db
    .select({ id: players.id, name: players.name })
    .from(players)
    .where(eq(players.phone, localPhone))
    .limit(1);
  return p || null;
}

export async function getOrCreateConversation(rawPhone: string, profileName?: string) {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');

  // الأردني يُطبَّع محلياً (07…) كما كان دائماً؛ غير الأردني يُخزَّن بصيغته الدولية.
  // قبل هذا كان أي رقم غير أردني يرمي استثناءً يبتلعه معالج الويبهوك، فتختفي
  // رسالة الزائر الخليجي أو السائح بلا أثر — لا تُخزَّن ولا تظهر ولا يردّ عليها أحد.
  const norm = normalizeAnyPhone(rawPhone);
  if (!norm) throw new Error(`رقم غير صالح: ${rawPhone}`);
  const { local: localPhone, wa: waPhone, isJordanian } = norm;

  const [existing] = await db
    .select()
    .from(waConversations)
    .where(eq(waConversations.phone, localPhone))
    .limit(1);

  if (existing) {
    // تحديثات خفيفة: ربط لاعب إن ظهر لاحقاً، أو اسم بروفايل إن كان فارغاً
    const patch: any = {};
    if (!existing.playerId && isJordanian) {
      const player = await findPlayerByPhone(db, localPhone);
      if (player) {
        patch.playerId = player.id;
        if (!existing.displayName) patch.displayName = player.name;
      }
    }
    if (profileName && !existing.displayName) patch.displayName = profileName;
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = new Date();
      const [updated] = await db
        .update(waConversations)
        .set(patch)
        .where(eq(waConversations.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }

  // إنشاء جديد — مع مطابقة اللاعب فوراً (اللاعبون يُخزَّنون بأرقام محلية، فلا معنى
  // للبحث عن رقم أجنبي: يربط نفسه لاحقاً برمز تحقق عبر request_account_link)
  const player = isJordanian ? await findPlayerByPhone(db, localPhone) : null;
  await db
    .insert(waConversations)
    .values({
      phone: localPhone,
      waPhone,
      playerId: player?.id || null,
      displayName: player?.name || profileName || '',
    } as any)
    .onConflictDoNothing({ target: waConversations.phone });

  const [conv] = await db
    .select()
    .from(waConversations)
    .where(eq(waConversations.phone, localPhone))
    .limit(1);
  return conv;
}

// ── هل البوت نشط لهذه المحادثة الآن؟ ─────────────────
export function isBotActive(conv: { botEnabled: boolean; botPausedUntil: Date | null }): boolean {
  if (!conv.botEnabled) return false;
  if (conv.botPausedUntil && new Date(conv.botPausedUntil).getTime() > Date.now()) return false;
  return true;
}

// ── هل نافذة الرد الحر (24 ساعة) مفتوحة؟ ─────────────
export function isFreeWindowOpen(conv: { lastInboundAt: Date | null }): boolean {
  if (!conv.lastInboundAt) return false;
  return Date.now() - new Date(conv.lastInboundAt).getTime() < FREE_REPLY_WINDOW_MS;
}

// ══════════════════════════════════════════════════════
// إشعار الأدمنية — عبر تطبيق اللاعب (قرار المالك):
// كل حساب أدمن مرتبط بحساب لاعب (players.linked_staff_id)
// ══════════════════════════════════════════════════════

export async function notifyAdmins(title: string, body: string, data: Record<string, any> = {}) {
  try {
    const db = getDB();
    if (!db) return;
    const admins = await db
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.role, 'admin' as any));
    if (admins.length === 0) return;
    const adminIds = admins.map((a: any) => a.id);
    const linkedPlayers = await db
      .select({ id: players.id })
      .from(players)
      .where(inArray(players.linkedStaffId, adminIds));
    const playerIds = linkedPlayers.map((p: any) => p.id);
    if (playerIds.length === 0) return;
    await sendPushToPlayers(playerIds, title, body, 'whatsapp', { route: '/admin/whatsapp', ...data });
  } catch (err: any) {
    console.warn('⚠️ WA notifyAdmins:', err.message);
  }
}

// ══════════════════════════════════════════════════════
// تمرير الرسالة للبوت (n8n) — fire & forget
// ══════════════════════════════════════════════════════

// المحرك الأصلي في whatsapp-bot.service — استيراد ديناميكي لتفادي الاستيراد الدائري
// (البوت يستورد sendMessage/notifyAdmins من هذا الملف)
function forwardToBot(conv: any) {
  import('./whatsapp-bot.service.js')
    .then(({ handleBotIncoming }) => handleBotIncoming(conv.id))
    .catch((err) => console.warn('⚠️ WA forwardToBot:', err.message));
}

// ══════════════════════════════════════════════════════
// استخراج نص/نوع الرسالة الواردة من حمولة Meta
// ══════════════════════════════════════════════════════

function extractInbound(msg: any): { msgType: string; body: string } {
  const t = msg.type || 'unknown';
  switch (t) {
    case 'text':
      return { msgType: 'text', body: msg.text?.body || '' };
    case 'button':
      return { msgType: 'button', body: msg.button?.text || '' };
    case 'interactive': {
      const i = msg.interactive || {};
      if (i.button_reply) return { msgType: 'interactive', body: i.button_reply.title || '' };
      if (i.list_reply) return { msgType: 'interactive', body: i.list_reply.title || '' };
      return { msgType: 'interactive', body: '' };
    }
    case 'image': return { msgType: 'image', body: msg.image?.caption || '📷 صورة' };
    case 'video': return { msgType: 'video', body: msg.video?.caption || '🎥 فيديو' };
    case 'audio': return { msgType: 'audio', body: '🎤 رسالة صوتية' };
    case 'document': return { msgType: 'document', body: msg.document?.filename || '📄 ملف' };
    case 'sticker': return { msgType: 'sticker', body: '🩵 ملصق' };
    case 'location': return { msgType: 'location', body: '📍 موقع' };
    case 'contacts': return { msgType: 'contacts', body: '👤 جهة اتصال' };
    // تفاعل (إيموجي) على رسالة — يُعالج بمسار خاص: لا يفتح نافذة ولا يُمرر للبوت
    case 'reaction': return { msgType: 'reaction', body: msg.reaction?.emoji || '' };
    case 'unsupported': return { msgType: 'unsupported', body: '⚠️ رسالة غير مدعومة من واتساب' };
    default: return { msgType: t, body: '' };
  }
}

// هل هذه الرسالة طلب إيقاف للرسائل التسويقية؟
function isOptoutMessage(msgType: string, body: string): boolean {
  const b = (body || '').trim();
  if (msgType === 'interactive' || msgType === 'button') {
    return b === 'إيقاف الرسائل';
  }
  return ['إيقاف', 'ايقاف', 'إيقاف الرسائل', 'ايقاف الرسائل', 'stop', 'STOP', 'Stop'].includes(b);
}

// ══════════════════════════════════════════════════════
// معالجة حمولة الـ Webhook (رسائل + حالات)
// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
// ⚠️ صحّة حساب واتساب — الجودة والحدّ والقيود
// ══════════════════════════════════════════════════════
// FLAGGED = هبط التقييم (بلاغات/حظر من المستقبلين) — إنذار مبكّر قبل التعطيل.
// انخفاض الحدّ (downgrade) يعني تقليص عدد من نراسلهم يومياً.
// account_update يحمل الأشدّ: مخالفات وتقييد وحظر.
const QUALITY_EVENT_AR: Record<string, string> = {
  FLAGGED: '🔴 هبط تقييم الجودة — وصلتنا بلاغات أو حظر من مستقبلين',
  UNFLAGGED: '🟢 عاد تقييم الجودة سليماً',
  ONBOARDING: 'ℹ️ الرقم في مرحلة التهيئة',
  DOWNGRADE: '🔻 انخفض حدّ الإرسال اليوميّ',
  UPGRADE: '🔼 ارتفع حدّ الإرسال اليوميّ',
};
const ACCOUNT_EVENT_AR: Record<string, string> = {
  ACCOUNT_VIOLATION: '🚨 مخالفة على الحساب',
  ACCOUNT_RESTRICTION: '🚨 قيد على الحساب — الإرسال قد يتوقف',
  DISABLED_UPDATE: '⛔ عُطِّل الحساب',
  ACCOUNT_DELETED: '⛔ حُذف الحساب',
  PARTNER_ADDED: 'ℹ️ أُضيف شريك للحساب',
};

async function handleAccountHealthUpdate(field: string, value: any): Promise<void> {
  const event = String(value?.event || value?.ban_info?.waba_ban_state || '').toUpperCase();
  const isQuality = field === 'phone_number_quality_update';
  const label = (isQuality ? QUALITY_EVENT_AR[event] : ACCOUNT_EVENT_AR[event])
    || `تحديث على حساب واتساب (${event || field})`;

  const bits: string[] = [];
  if (value?.display_phone_number) bits.push(`الرقم: ${value.display_phone_number}`);
  if (value?.current_limit) bits.push(`الحدّ الحاليّ: ${value.current_limit}`);
  if (value?.new_limit) bits.push(`الحدّ الجديد: ${value.new_limit}`);
  if (value?.reason) bits.push(`السبب: ${value.reason}`);

  // خطير = يستحق إيقاظ الجميع: هبوط جودة، أو أي حدث على مستوى الحساب
  const severe = event === 'FLAGGED' || event === 'DOWNGRADE' || !isQuality;

  console.log(`${severe ? '🚨' : 'ℹ️'} WA account health [${field}] ${event}:`, JSON.stringify(value).slice(0, 300));

  await notifyAdmins(
    label,
    bits.join(' · ') || 'راجع WhatsApp Manager للتفاصيل',
    { url: '/admin/whatsapp', tag: `wa-health-${field}` },
  ).catch(() => {});

  emitInbox('wa:account:health', { field, event, value, severe });

  // الجودة الهابطة تعني أن أي حملة جارية تزيد الطين بلّة — نوقفها فوراً
  // (إيقاف لا إلغاء: تُستأنف بزر واحد بعد معالجة السبب)
  if (event === 'FLAGGED' || event === 'DOWNGRADE') {
    try {
      const { pauseRunningCampaignsForHealth } = await import('./whatsapp-campaigns.service.js');
      const paused = await pauseRunningCampaignsForHealth();
      if (paused.length) {
        await notifyAdmins(
          '⏸️ أُوقفت الحملات الجارية تلقائياً',
          `بسبب ${event === 'FLAGGED' ? 'هبوط تقييم الجودة' : 'انخفاض حدّ الإرسال'} — ${paused.length} حملة. عالج السبب ثم استأنفها يدوياً.`,
          { url: '/admin/whatsapp', tag: 'wa-health-autopause' },
        ).catch(() => {});
      }
    } catch (err: any) {
      console.warn('⚠️ auto-pause campaigns on health drop:', err.message);
    }
  }
}

export async function processWebhookPayload(payload: any): Promise<void> {
  const db = getDB();
  if (!db) return;

  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value;
      if (!value) continue;

      // ── ⚠️ صحّة الرقم: تقييم الجودة وحدّ الإرسال والقيود ──
      // ميتا لا تكشف عدد البلاغات إطلاقاً — تقييم الجودة هو الإشارة الوحيدة،
      // والبلاغات والحظر هي ما يهبطه. بدون هذا المعالج لا تُعرف الأزمة إلا
      // بفحص يدويّ، وقد يمرّ يومان قبل أن ينتبه أحد.
      if (change.field === 'phone_number_quality_update' || change.field === 'account_update') {
        try {
          await handleAccountHealthUpdate(change.field, value);
        } catch (err: any) {
          console.warn('⚠️ WA account health webhook:', err.message);
        }
        continue;
      }

      // ── موافقات القوالب (استوديو القوالب) ──────────
      if (change.field === 'message_template_status_update') {
        try {
          const { handleTemplateStatusUpdate } = await import('./whatsapp-templates.service.js');
          await handleTemplateStatusUpdate(value);
        } catch (err: any) {
          console.warn('⚠️ WA template status webhook:', err.message);
        }
        continue;
      }

      // ── 1) الرسائل الواردة ──────────────────────────
      const contacts = value.contacts || [];
      for (const msg of value.messages || []) {
        try {
          await handleInboundMessage(db, msg, contacts);
        } catch (err: any) {
          console.error('❌ WA inbound message:', err.message);
        }
      }

      // ── 2) حالات التسليم للرسائل الصادرة ────────────
      for (const st of value.statuses || []) {
        try {
          await handleStatusUpdate(db, st);
        } catch (err: any) {
          console.error('❌ WA status update:', err.message);
        }
      }
    }
  }
}

async function handleInboundMessage(db: any, msg: any, contacts: any[]) {
  const wamid: string = msg.id;
  if (!wamid) return;

  // dedupe — Meta تعيد الإرسال عند عدم الرد بـ200
  const [dup] = await db.select({ id: waMessages.id }).from(waMessages).where(eq(waMessages.wamid, wamid)).limit(1);
  if (dup) return;

  const profileName = contacts.find((c: any) => c.wa_id === msg.from)?.profile?.name || '';
  const conv = await getOrCreateConversation(msg.from, profileName);
  if (!conv) return;

  const { msgType, body } = extractInbound(msg);

  const [saved] = await db
    .insert(waMessages)
    .values({
      conversationId: conv.id,
      wamid,
      direction: 'in',
      source: 'customer',
      msgType,
      body,
      payload: msg,
      status: 'received',
    } as any)
    .onConflictDoNothing({ target: waMessages.wamid })
    .returning();
  if (!saved) return; // سباق dedupe

  // ── التفاعلات (رياكشن): تُلصق بالرسالة الهدف ولا تدخل مسار الرسائل ──
  // لا تفتح نافذة الـ24 ساعة، لا unread، لا push، ولا تمرير للبوت — كانت
  // تصل كرسالة فارغة فتُشغّل البوت بلا دور user جديد ويفشل نداء Gemini
  if (msgType === 'reaction') {
    await handleReactionMessage(db, conv, msg, saved);
    return;
  }

  const now = new Date();
  const [updatedConv] = await db
    .update(waConversations)
    .set({
      lastInboundAt: now,
      lastMessageAt: now,
      lastMessagePreview: body.slice(0, 120),
      unreadCount: sql`${waConversations.unreadCount} + 1`,
      status: 'open',
      updatedAt: now,
    } as any)
    .where(eq(waConversations.id, conv.id))
    .returning();

  // ── إيقاف الرسائل التسويقية ──
  if (isOptoutMessage(msgType, body)) {
    await db
      .insert(waOptouts)
      .values({ phone: conv.phone, reason: 'طلب العميل عبر واتساب' } as any)
      .onConflictDoNothing({ target: waOptouts.phone });
    // تأكيد للعميل (رسالة نظام — ضمن نافذة الرد المفتوحة للتو)
    sendMessage({
      conversationId: conv.id,
      text: 'تم إيقاف الرسائل التسويقية عن رقمك ✅\nيمكنك دائماً مراسلتنا هنا وسنرد عليك.',
      source: 'system',
    }).catch((err) => console.warn('⚠️ WA optout ack:', err.message));
  }

  // ── بث لحظي للإنبوكس ──
  emitInbox('wa:message:new', { conversation: updatedConv, message: saved });

  // ── push للأدمنية على تطبيق اللاعب — لكل رسالة واردة (قرار المالك) ──
  // تجميع لكل محادثة: tag ثابت يستبدل الإشعار السابق، والعنوان يحمل عدد غير المقروء،
  // والنقر يفتح المحادثة مباشرة عبر url (يدعمها sw.js وبنية FCM الحالية)
  const who = updatedConv.displayName || updatedConv.phone;
  const unread = updatedConv.unreadCount || 1;
  notifyAdmins(
    unread > 1 ? `💬 ${who} (${unread} رسائل)` : `💬 ${who}`,
    body.slice(0, 140) || `رسالة ${msgType}`,
    {
      conversationId: conv.id,
      url: `/admin/whatsapp?conv=${conv.id}`,
      tag: `wa-conv-${conv.id}`,
    },
  );

  // 📣 عدّاد ردود الحملات: أول رد بعد رسالة حملة حديثة يُحتسب
  try {
    const { onCampaignReply } = await import('./whatsapp-campaigns.service.js');
    await onCampaignReply(conv.phone);
  } catch { /* تكميلي */ }

  // ── 🔔 ردّ زرّ التذكير — معالجة حتميّة (بلا بوت/LLM) ──
  const remindBtnId: string | undefined = msg?.interactive?.button_reply?.id;
  if (remindBtnId && remindBtnId.startsWith('wa_remind:')) {
    try { await handleReminderButton(db, updatedConv, remindBtnId); }
    catch (err: any) { console.warn('⚠️ WA reminder button:', err.message); }
    return; // لا نمرّر ضغطة زرّ التذكير للبوت
  }

  // ── تمرير للبوت إن كان نشطاً ──
  if (isBotActive(updatedConv)) {
    forwardToBot(updatedConv);
  }
}

// 🔔 تفعيل/إلغاء تذكير الحجز عبر زرّ العميل (wa_remind:on|off:<reservationId>)
async function handleReminderButton(db: any, conv: any, id: string): Promise<void> {
  const parts = id.split(':');           // ['wa_remind','on'|'off','<resId>']
  const optIn = parts[1] === 'on';
  const resId = parseInt(parts[2]);
  if (!resId) return;
  const [res] = await db.select({ id: reservations.id, phone: reservations.phone })
    .from(reservations).where(eq(reservations.id, resId)).limit(1);
  if (!res || !samePhone(res.phone, conv.phone)) return; // أمان: الحجز يخصّ رقم هذه المحادثة
  await db.update(reservations)
    .set({ remindOptIn: optIn, updatedAt: new Date() } as any)
    .where(eq(reservations.id, resId));
  await sendMessage({
    conversationId: conv.id,
    source: 'system',
    text: optIn
      ? 'تمام يا غالي 👌🔔 رح أذكّرك قبل موعد اللعبة بساعة.'
      : 'تمام، ما رح أزعجك بتذكير 🙏 نستنّاك على الموعد!',
  }).catch(() => {});
}

// تفاعل العميل على رسالة: يُخزَّن على الرسالة الهدف (payload.customerReaction)
// ويحدَّث شريط المحادثة — بدون فتح نافذة ولا إشعارات ولا بوت
async function handleReactionMessage(db: any, conv: any, msg: any, saved: any) {
  const targetWamid: string | undefined = msg.reaction?.message_id;
  const emoji: string = msg.reaction?.emoji || '';
  let target: any = null;
  if (targetWamid) {
    const [t] = await db.select().from(waMessages).where(eq(waMessages.wamid, targetWamid)).limit(1);
    if (t) {
      const payload: any = { ...(t.payload || {}) };
      if (emoji) payload.customerReaction = { emoji, at: new Date().toISOString() };
      else delete payload.customerReaction; // أزال تفاعله
      await db.update(waMessages).set({ payload } as any).where(eq(waMessages.id, t.id));
      target = { ...t, payload };
    }
  }
  const now = new Date();
  const [updatedConv] = await db
    .update(waConversations)
    .set({
      lastMessageAt: now,
      lastMessagePreview: emoji ? `تفاعل ${emoji} برسالتك` : 'أزال تفاعله عن رسالتك',
      updatedAt: now,
    } as any)
    .where(eq(waConversations.id, conv.id))
    .returning();
  emitInbox('wa:reaction', { conversationId: conv.id, message: target, emoji, reactionRowId: saved?.id });
  if (updatedConv) emitInbox('wa:conversation:update', { conversation: updatedConv });
}

async function handleStatusUpdate(db: any, st: any) {
  const wamid: string = st.id;
  if (!wamid) return;

  const patch: any = { status: st.status || '' };
  if (st.status === 'failed') {
    const firstErr = Array.isArray(st.errors) && st.errors[0];
    patch.errorMessage = firstErr ? `${firstErr.code || ''} ${firstErr.title || ''} ${firstErr.message || ''}`.trim() : 'فشل غير معروف';
  }

  // سجل زمني للحالات (وصلت/قُرئت متى) — لعرضه في «معلومات الرسالة»
  try {
    const [row] = await db.select({ payload: waMessages.payload }).from(waMessages).where(eq(waMessages.wamid, wamid)).limit(1);
    if (row) {
      const payload: any = { ...(row.payload || {}) };
      const at = st.timestamp ? new Date(parseInt(st.timestamp) * 1000).toISOString() : new Date().toISOString();
      payload.statusHistory = [...(payload.statusHistory || []), { status: st.status || '', at }];
      patch.payload = payload;
    }
  } catch { /* السجل الزمني تكميلي */ }

  const [updated] = await db
    .update(waMessages)
    .set(patch)
    .where(eq(waMessages.wamid, wamid))
    .returning({ id: waMessages.id, conversationId: waMessages.conversationId, status: waMessages.status, errorMessage: waMessages.errorMessage });

  if (updated) {
    emitInbox('wa:status:update', updated);
    // 📣 مزامنة حالة مستلم الحملة (وصلت/قُرئت/فشلت) بنفس الـwamid
    try {
      const { onCampaignStatusUpdate } = await import('./whatsapp-campaigns.service.js');
      await onCampaignStatusUpdate(wamid, st.status || '', patch.errorMessage || '');
    } catch { /* الحملات تكميلية هنا */ }
  }
}

// ══════════════════════════════════════════════════════
// أنبوب الإرسال الموحّد — كل صادر يمر من هنا
// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
// 🎭 الحقن: أن تتكلّم بلسان العميل ليردّ الدون عليه فعلاً
// ══════════════════════════════════════════════════════
// الحالة: العميل اتصل هاتفياً أو سأل حضورياً، والموظف يريد أن يتولّى الدون
// الجواب في الواتساب — أو يريد دفع الدون لسؤال محدّد بلا أن يكتبه بنفسه.
//
// نُدخل رسالة واردة اصطناعية فيراها المحرّك دور «user» (buildHistory يعتمد
// على direction)، ثم يردّ الدون بردّ حقيقي يصل العميل.
//
// ثلاثة أشياء لا نلمسها عمداً:
//   • lastInboundAt — مرساة نافذة الـ24 ساعة. تزويرها يعني ادّعاء أن العميل
//     راسلنا؛ ميتا تفرض النافذة من طرفها فالإرسال سيفشل، ويفسد حساب الالتزام.
//   • unreadCount — الأدمن هو من كتبها، لا شيء ليقرأه.
//   • إشعارات الأدمن — لا داعي لتنبيه من فعلها للتوّ.
/** الساعة بتوقيت الأردن (+3 ثابت — أُلغي التوقيت الصيفي 2022) */
function joClock(d: Date): string {
  const jo = new Date(d.getTime() + 3 * 3600e3);
  const h = jo.getUTCHours(), m = jo.getUTCMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'صباحاً' : 'مساءً'}`;
}

export async function injectCustomerMessage(input: {
  conversationId: number;
  text: string;
  staffName?: string;
  force?: boolean;          // تجاهل إيقاف البوت المؤقت (بعد رد بشري)
}): Promise<{ ok: true }> {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  const text = String(input.text || '').trim();
  if (!text) throw new Error('اكتب نص الرسالة');

  const [conv] = await db.select().from(waConversations)
    .where(eq(waConversations.id, input.conversationId)).limit(1);
  if (!conv) throw new Error('المحادثة غير موجودة');

  // فحص مسبق صريح: الصمت أسوأ خيار — الأدمن يجب أن يعرف لماذا لم يردّ الدون
  const { getBotSettings } = await import('./whatsapp-bot.service.js');
  const settings = await getBotSettings();
  if (!settings.enabled) throw Object.assign(new Error('البوت مطفأ من إعدادات الدون — شغّله أولاً'), { code: 'BOT_OFF' });
  if (!settings.geminiApiKey) throw Object.assign(new Error('مفتاح Gemini غير مضبوط في إعدادات الدون'), { code: 'BOT_NO_KEY' });
  if (!conv.botEnabled) throw Object.assign(new Error('البوت موقوف لهذه المحادثة تحديداً — فعّله من رأس المحادثة'), { code: 'BOT_OFF_CONV' });
  if (!isFreeWindowOpen(conv)) {
    throw Object.assign(
      new Error('نافذة الـ24 ساعة منتهية — لا يمكن للدون إرسال رسالة حرة. انتظر أن يراسلك العميل، أو استخدم قالباً معتمداً'),
      { code: 'WINDOW_EXPIRED' },
    );
  }

  const pausedUntil = conv.botPausedUntil ? new Date(conv.botPausedUntil) : null;
  if (pausedUntil && pausedUntil.getTime() > Date.now()) {
    if (!input.force) {
      throw Object.assign(
        new Error(`البوت موقوف مؤقتاً حتى ${joClock(pausedUntil)} (بسبب رد بشري قبل قليل)`),
        { code: 'BOT_PAUSED', pausedUntil: pausedUntil.toISOString() },
      );
    }
    await db.update(waConversations).set({ botPausedUntil: null, updatedAt: new Date() } as any)
      .where(eq(waConversations.id, conv.id));
  }

  // رسالة واردة اصطناعية — source='injected' يبقي السجل صادقاً:
  // المحرّك يعاملها كدور user، والواجهة تعرضها موسومة بأنها من الإدارة
  const [saved] = await db.insert(waMessages).values({
    conversationId: conv.id,
    wamid: null,
    direction: 'in',
    source: 'injected',
    msgType: 'text',
    body: text,
    payload: { injected: true, by: input.staffName || '' },
    status: 'received',
  } as any).returning();

  const now = new Date();
  const [updatedConv] = await db.update(waConversations)
    .set({ lastMessageAt: now, updatedAt: now } as any)   // بلا lastInboundAt وبلا unread
    .where(eq(waConversations.id, conv.id)).returning();

  emitInbox('wa:message:new', { conversation: updatedConv, message: saved });
  forwardToBot(updatedConv);
  return { ok: true };
}

export interface SendMessageInput {
  conversationId?: number;
  phone?: string;                       // بديل عن conversationId (أي صيغة)
  text?: string;                        // رسالة نصية
  interactive?: any;                    // كائن interactive جاهز (قوائم/أزرار — للبوت)
  source: 'staff' | 'bot' | 'system' | 'broadcast'; // broadcast: بث جماعي — لا يوقف البوت
  staffId?: number;
  staffName?: string;
}

export async function sendMessage(input: SendMessageInput) {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  if (!waEnabled()) throw new Error('إرسال واتساب غير مفعّل (WA_TOKEN/WA_PHONE_NUMBER_ID)');

  // ── إيجاد المحادثة ──
  let conv: any = null;
  if (input.conversationId) {
    [conv] = await db.select().from(waConversations).where(eq(waConversations.id, input.conversationId)).limit(1);
  } else if (input.phone) {
    conv = await getOrCreateConversation(input.phone);
  }
  if (!conv) throw new Error('المحادثة غير موجودة');

  const hasInteractive = !!input.interactive;
  const text = (input.text || '').trim();
  if (!hasInteractive && !text) throw new Error('لا يوجد محتوى للإرسال');

  // ── حارس نافذة الـ24 ساعة (الرسائل الحرة فقط — القوالب لاحقاً مع الحملات) ──
  if (!isFreeWindowOpen(conv)) {
    const err: any = new Error('نافذة الرد المجانية (24 ساعة) منتهية لهذه المحادثة — الإرسال يحتاج قالباً معتمداً (يُفعَّل مع الحملات)');
    err.code = 'WINDOW_EXPIRED';
    throw err;
  }

  // ── الإرسال عبر Cloud API ──
  const apiBody: any = hasInteractive
    ? { messaging_product: 'whatsapp', to: conv.waPhone, type: 'interactive', interactive: input.interactive }
    : { messaging_product: 'whatsapp', to: conv.waPhone, type: 'text', text: { body: text } };

  const apiRes = await callWaApi(`${env.WA_PHONE_NUMBER_ID}/messages`, apiBody);
  const wamid = apiRes?.messages?.[0]?.id || null;

  // ── التخزين ──
  const preview = hasInteractive
    ? (input.interactive?.body?.text || '📋 رسالة تفاعلية')
    : text;

  const [saved] = await db
    .insert(waMessages)
    .values({
      conversationId: conv.id,
      wamid,
      direction: 'out',
      source: input.source,
      msgType: hasInteractive ? 'interactive' : 'text',
      body: preview,
      payload: apiBody,
      status: 'sent',
      staffId: input.staffId || null,
    } as any)
    .returning();

  // ── تحديث المحادثة (+ إيقاف البوت 30 دقيقة عند رد بشري) ──
  const now = new Date();
  const patch: any = {
    lastMessageAt: now,
    lastMessagePreview: preview.slice(0, 120),
    updatedAt: now,
  };
  if (input.source === 'staff') {
    // مدة الإيقاف من إعدادات البوت (قابلة للتعديل من الداشبورد) — الافتراضي 30 دقيقة
    let pauseMs = BOT_PAUSE_AFTER_HUMAN_MS;
    try {
      const { getBotSettings } = await import('./whatsapp-bot.service.js');
      const s = await getBotSettings();
      if (s?.pauseMinutes) pauseMs = s.pauseMinutes * 60_000;
    } catch { /* نبقى على الافتراضي */ }
    patch.botPausedUntil = new Date(now.getTime() + pauseMs);
    patch.unreadCount = 0;        // الموظف ردّ ⇒ شاف المحادثة
    patch.needsAttention = false; // الرد البشري يزيل شارة «بحاجة تدخل»
  }
  const [updatedConv] = await db
    .update(waConversations)
    .set(patch)
    .where(eq(waConversations.id, conv.id))
    .returning();

  emitInbox('wa:message:new', { conversation: updatedConv, message: saved });

  return { message: saved, conversation: updatedConv };
}

// ══════════════════════════════════════════════════════
// 📣 إرسال قالب معتمد (للحملات) — يتجاوز حارس النافذة عمداً:
// القوالب هي الطريقة الشرعية الوحيدة لمراسلة نافذة مغلقة.
// تُسجَّل بالمحادثة (تُنشأ إن لم توجد) بمصدر template ولا توقف البوت.
// ══════════════════════════════════════════════════════

export async function sendTemplateMessage(input: {
  phone: string;
  templateName: string;
  language?: string;
  bodyParams?: string[];          // قيم {{1}}.. بالترتيب
  previewText?: string;           // النص المعبّأ للعرض بسجل المحادثة
}): Promise<{ wamid: string | null; conversationId: number }> {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  if (!waEnabled()) throw new Error('إرسال واتساب غير مفعّل');

  const conv = await getOrCreateConversation(input.phone);
  if (!conv) throw new Error('رقم غير صالح');

  const template: any = {
    name: input.templateName,
    language: { code: input.language || 'ar' },
  };
  if (input.bodyParams?.length) {
    template.components = [{
      type: 'body',
      parameters: input.bodyParams.map((t) => ({ type: 'text', text: String(t).slice(0, 500) })),
    }];
  }
  const apiBody = { messaging_product: 'whatsapp', to: conv.waPhone, type: 'template', template };
  const apiRes = await callWaApi(`${env.WA_PHONE_NUMBER_ID}/messages`, apiBody);
  const wamid = apiRes?.messages?.[0]?.id || null;

  const preview = input.previewText || `📋 قالب: ${input.templateName}`;
  const [saved] = await db.insert(waMessages).values({
    conversationId: conv.id,
    wamid,
    direction: 'out',
    source: 'template',
    msgType: 'template',
    body: preview,
    payload: apiBody,
    status: 'sent',
  } as any).returning();

  const now = new Date();
  const [updatedConv] = await db.update(waConversations).set({
    lastMessageAt: now,
    lastMessagePreview: preview.slice(0, 120),
    updatedAt: now,
  } as any).where(eq(waConversations.id, conv.id)).returning();

  emitInbox('wa:message:new', { conversation: updatedConv, message: saved });
  return { wamid, conversationId: conv.id };
}
