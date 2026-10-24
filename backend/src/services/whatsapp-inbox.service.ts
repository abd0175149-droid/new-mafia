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

import { WA_CAPTION_MAX as CLOUD_CAPTION_MAX, uploadCloudMedia, cloudConfigured, sendCloud } from './wa-transport/cloud.transport.js';
import {
  suspendSending as _suspend, resumeSending as _resume, loadSendingSuspension as _load,
  sendingSuspendedReason as _reason,
} from './wa-transport/locks.js';
import { pickChannel, cloudWindowOpen, webConfigured } from './wa-transport/router.js';
import { transportSettings } from './wa-transport/settings.js';
import type { Channel, Lane } from './wa-transport/types.js';
export { isUnreachable } from './wa-transport/types.js';

/** حدّ ميتا لتعليق الصورة (حرفاً) — يُتحقّق منه عند المعاينة وعند الإرسال */
export const WA_CAPTION_MAX = CLOUD_CAPTION_MAX;

// مدة إيقاف البوت المؤقت بعد رد بشري (قرار المالك: 30 دقيقة)
export const BOT_PAUSE_AFTER_HUMAN_MS = 30 * 60 * 1000;

// ── تفعيل الميزة: أيّ قناةٍ مهيّأة ───────────────────
export function waEnabled(): boolean {
  return cloudConfigured() || webConfigured();
}

// ── بث لحظي لغرفة الإنبوكس (أدمن فقط — الانضمام في index.ts) ──
export function emitInbox(event: string, payload: any) {
  try {
    const io = (global as any).io;
    if (io) io.to('wa:inbox').emit(event, payload);
  } catch { /* البث ليس حرجاً */ }
}

// 🖼️ رفعُ صورةٍ إلى مكتبة وسائط ميتا — انتقل إلى wa-transport/cloud.transport.ts
export const uploadWaMedia = uploadCloudMedia;

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

export async function getOrCreateConversation(
  rawPhone: string,
  profileName?: string,
  opts: { channel?: Channel; webChatId?: string; phoneVerified?: boolean } = {},
) {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');

  // الأردني يُطبَّع محلياً (07…) كما كان دائماً؛ غير الأردني يُخزَّن بصيغته الدولية.
  // قبل هذا كان أي رقم غير أردني يرمي استثناءً يبتلعه معالج الويبهوك، فتختفي
  // رسالة الزائر الخليجي أو السائح بلا أثر — لا تُخزَّن ولا تظهر ولا يردّ عليها أحد.
  //
  // 🕶️ الجلسة قد تُخفي الرقم خلف معرّف خصوصيّة (…@lid) لم يُحلّ بعد: يُخزَّن بمفتاح
  //    «lid:<digits>» مؤقّتاً، بلا ربطٍ بلاعب، وبـ phone_verified=false — فلا أداة أدمن
  //    ولا كتابة على حساب من محادثةٍ لا نعرف رقمها (web.inbound يدمجها عند الحلّ).
  let localPhone: string, waPhone: string, isJordanian: boolean;
  const isLidKey = /^lid:\d{5,20}$/.test(rawPhone);
  if (isLidKey) {
    localPhone = rawPhone; waPhone = ''; isJordanian = false;
  } else {
    const norm = normalizeAnyPhone(rawPhone);
    if (!norm) throw new Error(`رقم غير صالح: ${rawPhone}`);
    ({ local: localPhone, wa: waPhone, isJordanian } = norm);
  }
  const verified = isLidKey ? false : opts.phoneVerified !== false;

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
    if (opts.channel === 'web' && opts.webChatId && existing.webChatId !== opts.webChatId) patch.webChatId = opts.webChatId;
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
  const player = isJordanian && verified ? await findPlayerByPhone(db, localPhone) : null;
  // 📇 رقم الأعمال فيه محادثات قديمة لموردين ومعارف (استيراد التاريخ يعلّمهم في wa_web_known):
  //    من كان «معروفاً وليس لاعباً» تُفتح محادثته والبوت مطفأ — الأدمن يفعّله بضغطة إن شاء.
  //    ومفتاح «القنوات» webBotKnown يلغي ذلك: هم عملاء مهتمّون — تُفتح والبوت يعمل.
  let knownNonPlayer = false;
  if (opts.channel === 'web' && !player && !transportSettings().webBotKnown) {
    const r: any = await db.execute(sql`SELECT 1 FROM wa_web_known WHERE phone = ${localPhone} LIMIT 1`).catch(() => null);
    knownNonPlayer = !!(r?.rows ?? r ?? [])[0];
  }
  await db
    .insert(waConversations)
    .values({
      phone: localPhone,
      waPhone,
      playerId: player?.id || null,
      displayName: player?.name || profileName || '',
      ...(knownNonPlayer ? { botEnabled: false } : {}),
      channel: opts.channel || 'cloud',
      webChatId: opts.channel === 'web' ? (opts.webChatId || null) : null,
      phoneVerified: verified,
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

// ── هل يمكن مراسلة هذه المحادثة الآن؟ ─────────────────
// كانت «نافذة الـ24 ساعة» وحدها. صارت تسأل الموجِّه: على ميتا النافذةُ قيدٌ تفرضه ميتا،
// وعلى رقم الأعمال (الجلسة) لا قيد ولا شرط (قرار المالك 2026-10-20).
// الاسم باقٍ لأنّ عشرين مستدعياً يستعملونه؛ والصفّ الجزئيّ ({lastInboundAt}) يُعامَل كما كان.
export function isFreeWindowOpen(conv: any, lane: Lane = 'reply'): boolean {
  if (conv && conv.id !== undefined && conv.waPhone !== undefined) return pickChannel(conv, lane).channel !== null;
  // صفٌّ جزئيّ ({lastInboundAt}): نافذة ميتا كما كانت، أو رقم الأعمال إن كان الوضع يرسل منه
  if (cloudWindowOpen(conv || {})) return true;
  return webConfigured() && transportSettings().mode !== 'cloud_only';
}

// ══════════════════════════════════════════════════════
// ⛔ قفل الإرسال — لكلّ قناة قفلها (wa-transport/locks.ts)
// ══════════════════════════════════════════════════════
// مصدران يُغلقانه: قرار تشغيليّ (WA_SUSPENDED في البيئة) وإشارة من ميتا
// نفسها تصل عبر webhook. الثاني هو ما كان ناقصاً يوم ٣١ يوليو: وصل
// DISABLED_UPDATE فأوقفنا «الحملات» فقط، بينما كان يجب أن يتوقّف كل شيء.
// 🔒 القفل يُحفظ في القاعدة ويُرفع يدويّاً حصراً (resumeSending).
export function suspendSending(reason: string, channel: Channel = 'cloud'): void { _suspend(reason, channel); }
export async function loadSendingSuspension(): Promise<void> { await _load(); }
export async function resumeSending(channel: Channel = 'cloud'): Promise<void> { await _resume(channel); }
/** بلا قناة: سببٌ إن كانت كلّ قنوات الوضع الحاليّ مقفلة. مع قناة: قفلها وحدها. */
export function sendingSuspendedReason(channel?: Channel): string | null { return _reason(channel); }

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

export function extractInbound(msg: any): { msgType: string; body: string } {
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

  // أي حدث يمسّ القدرة على الإرسال يوقف الحملات فوراً.
  // ⚠️ النسخة الأولى غطّت الإنذار (FLAGGED/DOWNGRADE) وأهملت الكارثة نفسها —
  //    يوم 2026-07-31 وصل DISABLED_UPDATE + ACCOUNT_VIOLATION(SPAM) وبقيت
  //    الحملة `running`. أي حدث على مستوى الحساب يُعامَل الآن كإيقاف فوريّ.
  if (event === 'FLAGGED' || event === 'DOWNGRADE' || !isQuality) {
    suspendSending(label);
    await notifyAdmins(
      '⛔ أُوقف الإرسال تلقائياً',
      `${label} — كل إرسال صادر مقفل حتى يُرفع القفل يدوياً بعد معالجة السبب.`,
      { url: '/admin/whatsapp', tag: 'wa-health-autostop' },
    ).catch(() => {});
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
          await handleInboundMessage(db, msg, contacts, 'cloud');
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

// ══════════════════════════════════════════════════════
// 📥 مدخل الوارد الموحّد — لكلّ قناة
// ══════════════════════════════════════════════════════
// ميتا تمرّر رسالتها كما هي. الجلسة (web.inbound.ts) تترجم حدث OpenWA إلى الشكل نفسه
// ثمّ تدخل من هنا، فيمرّ الوارد من القناتين بمسارٍ واحد: منع التكرار، المحادثة،
// الوسائط، النافذة، الإيقاف، الإشعار، الأزرار، المتابعة، المكافآت، البوت.
export interface InboundOpts {
  /** محادثة الجلسة: معرّفها عند واتساب (9627…@c.us أو …@lid) لتوجيه الردّ */
  webChatId?: string;
  /** false ⇒ الرقم لم يُحلّ من @lid — تُعطَّل الأدوات الحسّاسة */
  phoneVerified?: boolean;
  /** مستورد من سجلّ الهاتف: يُخزَّن بلا إشعار ولا بوت ولا تحديث للنافذة */
  imported?: boolean;
  /** البوت لا يردّ على هذه القناة الآن (الظلّ) */
  suppressBot?: boolean;
}

export async function ingestInbound(msg: any, contacts: any[], channel: Channel, opts: InboundOpts = {}): Promise<void> {
  const db = getDB();
  if (!db) return;
  await handleInboundMessage(db, msg, contacts, channel, opts);
}

async function handleInboundMessage(db: any, msg: any, contacts: any[], channel: Channel = 'cloud', opts: InboundOpts = {}) {
  const wamid: string = msg.id;
  if (!wamid) return;

  // dedupe — Meta تعيد الإرسال عند عدم الرد بـ200
  const [dup] = await db.select({ id: waMessages.id }).from(waMessages).where(eq(waMessages.wamid, wamid)).limit(1);
  if (dup) return;

  const profileName = contacts.find((c: any) => c.wa_id === msg.from)?.profile?.name || '';
  const conv = await getOrCreateConversation(msg.from, profileName, { channel, webChatId: opts.webChatId, phoneVerified: opts.phoneVerified });
  if (!conv) return;

  const { msgType, body } = extractInbound(msg);

  const [saved] = await db
    .insert(waMessages)
    .values({
      conversationId: conv.id,
      wamid,
      channel,
      direction: 'in',
      source: 'customer',
      msgType,
      body,
      payload: opts.imported ? { ...msg, imported: true } : msg,
      status: 'received',
      ...(opts.imported && msg.timestamp ? { createdAt: new Date(Number(msg.timestamp) * 1000) } : {}),
    } as any)
    .onConflictDoNothing({ target: waMessages.wamid })
    .returning();
  if (!saved) return; // سباق dedupe

  // 📥 الصور والملصقات والفيديو والملفّات: تُنزَّل الآن لتبقى بعد حذف ميتا لها
  if (channel === 'cloud' && ['image', 'sticker', 'video', 'document'].includes(msgType)) {
    import('./wa-bot-ext.service.js').then(m => m.cacheInboundMedia(msg)).catch(() => {});
  }
  // الجلسة تحفظ وسائطها قبل الوصول إلى هنا (web.inbound.ts) — لا جلب لاحقاً بالمعرّف

  // 🗄️ المستورد من سجلّ الهاتف: سياقٌ للبوت والموظّف، لا حدثٌ جديد
  if (opts.imported) return;

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
      // قناة آخر وارد = قناة الردّ (لاصقة)، ونافذة ميتا تُحسب من وارد ميتا وحده
      channel,
      ...(channel === 'cloud' ? { cloudLastInboundAt: now } : { webLastInboundAt: now }),
      ...(channel === 'web' && opts.webChatId ? { webChatId: opts.webChatId } : {}),
      lastMessageAt: now,
      lastMessagePreview: body.slice(0, 120),
      unreadCount: sql`${waConversations.unreadCount} + 1`,
      ...(channel === 'web' ? { unreadWeb: sql`${waConversations.unreadWeb} + 1` } : {}),
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

  // ── 🔔 ردّ زرّ التذكير — معالجة حتميّة (بلا بوت/LLM) ──
  const remindBtnId: string | undefined = msg?.interactive?.button_reply?.id;
  if (remindBtnId && remindBtnId.startsWith('wa_remind:')) {
    try { await handleReminderButton(db, updatedConv, remindBtnId); }
    catch (err: any) { console.warn('⚠️ WA reminder button:', err.message); }
    return; // لا نمرّر ضغطة زرّ التذكير للبوت
  }

  // ── ⏱️ رفضٌ صريح للمتابعة («مش مهتمّ»، «بعدين») ⟵ لا متابعة أخرى لهذه المحادثة ──
  import('./wa-followup.service.js')
    .then(m => m.noteInboundForFollowup(conv.id, body))
    .catch(() => { /* تكميليّ */ });

  // ── 🎁 عرضُ الحديث مع البوت (إن كان هناك عرضٌ نشط) ──
  // fire-and-forget: صامتٌ تماماً بلا عرض (نداءُ كاشٍ واحد)، ولا يؤخّر الردّ ولا يُفشله.
  import('./wa-reward.service.js')
    .then(m => m.onInboundMessage({ id: updatedConv.id, phone: updatedConv.phone, playerId: updatedConv.playerId }))
    .catch((err: any) => console.warn('⚠️ WA reward hook:', err?.message || err));

  // ── تمرير للبوت إن كان نشطاً ──
  if (isBotActive(updatedConv) && !opts.suppressBot) {
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
  // التفاعل ليس رسالة: لا يقدّم المحادثة في القائمة ولا يغيّر معاينتها (الترتيب بآخر رسالةٍ فعليّة)
  const now = new Date();
  const [updatedConv] = await db
    .update(waConversations)
    .set({ updatedAt: now } as any)
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
  location?: { latitude: number; longitude: number; name?: string; address?: string };  // 📍 رسالة موقع
  /** 🖼️ صورة مع تعليق — رسالةٌ واحدة لا رسالتان. `link` رابطٌ عامّ على خادمنا (يُبنى في
   *  الخادم من ملفٍّ رفعناه، لا من نصٍّ يكتبه المستخدم)، أو `mediaId` من `uploadWaMedia`.
   *  إن جاء الاثنان (البثّ): يُرسَل بالمعرّف، ويُحفظ الرابط في السجلّ ليعرض الانبوكس الصورة.
   *  التعليق يُقصّ عند 1024 حرفاً (حدّ ميتا). */
  image?: { link?: string; mediaId?: string; caption?: string };
  /** outreach = من صفحات الحجوزات/التحليلات/المستكشف — لا يوقف البوت */
  source: 'staff' | 'bot' | 'system' | 'broadcast' | 'outreach';
  staffId?: number;
  staffName?: string;
  /** مسار الإرسال (التباعد والسقف والبديل). الافتراضيّ: broadcast ⇒ bulk، وغيره ⇒ reply */
  lane?: Lane;
  /** ترتيبٌ داخل المسار في طابور الجلسة (أصغر = أسبق). إشعار الإلغاء يسبق البثّ */
  priority?: number;
  /** يُدمج في `payload` المحفوظ: اسم الموظّف ونصّه قبل الصياغة — كان الاسم
   *  يُمرَّر ولا يُخزَّن، فلا يُعرف لاحقاً مَن كتب الردّ إلّا برقمٍ في عمود. */
  meta?: Record<string, any>;
}

function laneFor(input: SendMessageInput): Lane {
  if (input.lane) return input.lane;
  return input.source === 'broadcast' ? 'bulk' : 'reply';
}

function codeErr(code: string, message: string): Error {
  const err: any = new Error(message);
  err.code = code;
  return err;
}

export async function sendMessage(input: SendMessageInput) {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  if (!waEnabled()) throw new Error('إرسال واتساب غير مفعّل (لا Cloud API ولا جلسة)');

  // ── إيجاد المحادثة ──
  let conv: any = null;
  if (input.conversationId) {
    [conv] = await db.select().from(waConversations).where(eq(waConversations.id, input.conversationId)).limit(1);
  } else if (input.phone) {
    conv = await getOrCreateConversation(input.phone);
  }
  if (!conv) throw new Error('المحادثة غير موجودة');

  const hasInteractive = !!input.interactive;
  const hasLocation = !!input.location;
  const hasImage = !!(input.image && (input.image.link || input.image.mediaId));
  const text = (input.text || '').trim();
  if (!hasInteractive && !hasLocation && !hasImage && !text) throw new Error('لا يوجد محتوى للإرسال');
  // 🖼️ التعليق يُقصّ هنا لا عند ميتا: رفضُها يأتي بعد أن يكون الصفّ قد كُتب في بثٍّ نصفِ منفَّذ
  const caption = hasImage ? (input.image!.caption || '').slice(0, WA_CAPTION_MAX) : '';

  // ══════════════════════════════════════════════════════
  // 🔒 البوّابة الوحيدة للصادر: الموجِّه
  // ══════════════════════════════════════════════════════
  // ميتا: لا نراسل إلا مَن راسلنا خلال ٢٤ ساعة — قيدٌ تفرضه ميتا وشرطٌ في طبقة الإرسال.
  // رقم الأعمال (الجلسة): لا قيد ولا شرط (قرار المالك) — الضبط بالطابور وسقوفه.
  const lane = laneFor(input);
  const pick = pickChannel(conv, lane);
  if (!pick.channel) throw codeErr(pick.code || 'WINDOW_EXPIRED', pick.reason || 'لا قناة متاحة');
  const channel: Channel = pick.channel;

  const blocked = sendingSuspendedReason(channel);
  if (blocked) throw codeErr('SENDING_SUSPENDED', `الإرسال مقفل: ${blocked}`);

  const content: { text: string; interactive?: any; location?: any; image?: any } = {
    text,
    interactive: input.interactive,
    location: input.location,
    image: hasImage ? { ...input.image!, caption } : undefined,
  };
  const preview = hasInteractive
    ? (input.interactive?.body?.text || '📋 رسالة تفاعلية')
    : hasLocation ? `📍 ${input.location?.name || 'موقع'}`
    : hasImage ? (caption || '📷 صورة')
    : text;
  const msgType = hasInteractive ? 'interactive' : hasLocation ? 'location' : hasImage ? 'image' : 'text';
  const meta: Record<string, any> = { ...(input.meta || {}), ...(pick.failover ? { failover: true } : {}) };

  // 📲 التحويل إلى رقم الأعمال (قرار المالك): في «الجلسة أوّلاً» و«الجلسة + ميتا للتحويل» يحمل
  //    أوّلُ ردٍّ من ميتا في اليوم لكلّ محادثة سطراً برقم الأعمال. رابط wa.me **بلا** ?text=
  //    (wa.me يُتلف الإيموجي في النصّ — lib/whatsapp.ts). البوت يردّ كاملاً ولا يكتفي بالتحويل.
  if (channel === 'cloud') {
    const ts = transportSettings();
    const num = String(ts.cloudRedirect.businessNumber || '').replace(/\D/g, '');
    if ((ts.mode === 'web_primary' || ts.mode === 'web_final') && ts.cloudRedirect.enabled && num.length >= 9
        && ['bot', 'staff', 'system'].includes(input.source) && !hasImage && !hasLocation) {
      try {
        const { getAux, setAux } = await import('../config/redis.js');
        const day = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
        const k = `wa-redirect:${conv.id}:${ts.cloudRedirect.oncePerDay ? day : 'once'}`;
        if (!(await getAux(k))) {
          const intl = num.startsWith('0') ? '962' + num.slice(1) : num;
          const line = `\n\n📲 رقمنا للحجز والتواصل: +${intl}\nhttps://wa.me/${intl}`;
          if (hasInteractive && content.interactive?.body?.text) {
            content.interactive = { ...content.interactive, body: { ...content.interactive.body, text: String(content.interactive.body.text).slice(0, 1024 - line.length) + line } };
          } else if (!hasInteractive) {
            content.text = content.text + line;
          }
          await setAux(k, { at: Date.now() });
          meta.redirectLine = true;
        }
      } catch { /* التحويل تكميليّ */ }
    }
  }

  let saved: any;
  if (channel === 'cloud') {
    // ── ميتا: كما كان حرفيّاً — أرسل ثمّ خزّن ──
    const r = await sendCloud(conv.waPhone, content);
    [saved] = await db
      .insert(waMessages)
      .values({
        conversationId: conv.id,
        wamid: r.wamid,
        channel: 'cloud',
        direction: 'out',
        source: input.source,
        msgType,
        body: preview,
        payload: Object.keys(meta).length ? { ...r.storedPayload, ...meta } : r.storedPayload,
        status: 'sent',
        staffId: input.staffId || null,
      } as any)
      .returning();
  } else {
    // ── رقم الأعمال: يُكتب الصفّ أوّلاً (queued) ثمّ يدخل الطابور ──
    // الصفّ قبل الإرسال يمنع ازدواج الصدى (message.sent يصل قبل ردّ الـHTTP أحياناً)
    // ويُظهر «في الطابور» في الواجهة للجماعيّ المتباعد.
    const { enqueueWeb, buildWebStoredPayload } = await import('./wa-transport/web.transport.js');
    // 🧹 رقم الأعمال بلا أزرار: نصوص البوت والنظام تُصاغ لقائمةٍ مرقّمة («من الأزرار تحت» ⟵ «بكتابة رقم الخيار»)
    if (!hasInteractive && (input.source === 'bot' || input.source === 'system') && content.text) {
      const { adaptForTextMenus } = await import('./wa-transport/menu-emulation.js');
      content.text = adaptForTextMenus(content.text);
    }
    const stored = buildWebStoredPayload(conv, content);
    [saved] = await db
      .insert(waMessages)
      .values({
        conversationId: conv.id,
        wamid: null,
        channel: 'web',
        direction: 'out',
        source: input.source,
        msgType,
        body: preview,
        payload: Object.keys(meta).length ? { ...stored, ...meta } : stored,
        status: 'queued',
        staffId: input.staffId || null,
      } as any)
      .returning();
    saved = await enqueueWeb(saved, conv, content, lane, input.priority);
  }

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
    patch.unreadCount = 0;        // الموظف ردّ ⇒ شاف المحادثة (على الرقمين)
    patch.unreadWeb = 0;
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
// ═══════════════════════════════════════════════════════
// 🚫 لا يوجد إرسال قوالب — ولا يُعاد
// ═══════════════════════════════════════════════════════
// كانت sendTemplateMessage هنا: ترسل قالباً إلى أي رقم **متجاوزةً حارس
// النافذة عمداً** — وهي الأداة التي نفّذت المخالفة يوم ً١٣ يوليو.
// حُذفت مع محرّك الحملات والبثّ. المسار الوحيد إلى Cloud API الآن
// هو sendMessage أعلاه، وهو مشروط بنافذة خدمة مفتوحة.
//
// إن عاد الحساب ولزم قالب خدميّ (تذكير حجز مثلاً) فيُبنى حينها
// مقيّداً بمن له حجز قائم — لا كبديل عامّ لمراسلة من لم يراسلنا.

