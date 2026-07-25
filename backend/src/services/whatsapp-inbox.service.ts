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
import { waConversations, waMessages, waOptouts, staff } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { normalizeLocalPhone, toWaPhone } from '../utils/phone.util.js';
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

  const localPhone = normalizeLocalPhone(rawPhone);
  const waPhone = toWaPhone(rawPhone);
  if (!localPhone || !waPhone) throw new Error(`رقم غير صالح: ${rawPhone}`);

  const [existing] = await db
    .select()
    .from(waConversations)
    .where(eq(waConversations.phone, localPhone))
    .limit(1);

  if (existing) {
    // تحديثات خفيفة: ربط لاعب إن ظهر لاحقاً، أو اسم بروفايل إن كان فارغاً
    const patch: any = {};
    if (!existing.playerId) {
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

  // إنشاء جديد — مع مطابقة اللاعب فوراً
  const player = await findPlayerByPhone(db, localPhone);
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

async function notifyAdmins(title: string, body: string, data: Record<string, any> = {}) {
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

function forwardToBot(conv: any, message: { id: number; body: string; msgType: string; payload: any }) {
  if (!env.N8N_WA_WEBHOOK_URL) return; // البوت غير مربوط بعد (مرحلة 3)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  fetch(env.N8N_WA_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.N8N_API_KEY || '',
    },
    body: JSON.stringify({
      conversationId: conv.id,
      phone: conv.phone,          // 07XXXXXXXX
      waPhone: conv.waPhone,      // 9627XXXXXXXX
      playerId: conv.playerId,
      displayName: conv.displayName,
      messageId: message.id,
      msgType: message.msgType,
      text: message.body,
      payload: message.payload,
    }),
    signal: ctrl.signal,
  })
    .catch((err) => console.warn('⚠️ WA forwardToBot:', err.message))
    .finally(() => clearTimeout(timer));
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

export async function processWebhookPayload(payload: any): Promise<void> {
  const db = getDB();
  if (!db) return;

  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value;
      if (!value) continue;

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
  const who = updatedConv.displayName || updatedConv.phone;
  notifyAdmins(`💬 ${who}`, body.slice(0, 140) || `رسالة ${msgType}`, { conversationId: conv.id });

  // ── تمرير للبوت إن كان نشطاً ──
  if (isBotActive(updatedConv)) {
    forwardToBot(updatedConv, { id: saved.id, body, msgType, payload: msg });
  }
}

async function handleStatusUpdate(db: any, st: any) {
  const wamid: string = st.id;
  if (!wamid) return;

  const patch: any = { status: st.status || '' };
  if (st.status === 'failed') {
    const firstErr = Array.isArray(st.errors) && st.errors[0];
    patch.errorMessage = firstErr ? `${firstErr.code || ''} ${firstErr.title || ''} ${firstErr.message || ''}`.trim() : 'فشل غير معروف';
  }

  const [updated] = await db
    .update(waMessages)
    .set(patch)
    .where(eq(waMessages.wamid, wamid))
    .returning({ id: waMessages.id, conversationId: waMessages.conversationId, status: waMessages.status, errorMessage: waMessages.errorMessage });

  if (updated) {
    emitInbox('wa:status:update', updated);
  }
}

// ══════════════════════════════════════════════════════
// أنبوب الإرسال الموحّد — كل صادر يمر من هنا
// ══════════════════════════════════════════════════════

export interface SendMessageInput {
  conversationId?: number;
  phone?: string;                       // بديل عن conversationId (أي صيغة)
  text?: string;                        // رسالة نصية
  interactive?: any;                    // كائن interactive جاهز (قوائم/أزرار — للبوت)
  source: 'staff' | 'bot' | 'system';
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
    patch.botPausedUntil = new Date(now.getTime() + BOT_PAUSE_AFTER_HUMAN_MS);
    patch.unreadCount = 0; // الموظف ردّ ⇒ شاف المحادثة
  }
  const [updatedConv] = await db
    .update(waConversations)
    .set(patch)
    .where(eq(waConversations.id, conv.id))
    .returning();

  emitInbox('wa:message:new', { conversation: updatedConv, message: saved });

  return { message: saved, conversation: updatedConv };
}
