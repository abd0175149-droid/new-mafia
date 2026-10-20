// ══════════════════════════════════════════════════════
// 📥 وارد رقم الأعمال — أحداث بوّابة OpenWA ← شكل ميتا ← المدخل الموحّد
// ══════════════════════════════════════════════════════
// الويبهوك الموقَّع يصل POST /api/whatsapp/hooks/openwa. هنا:
//   ١) التوقيع (X-OpenWA-Signature = sha256 HMAC للجسم الخام) — بلا طابع زمنيّ، فمنع التكرار علينا
//   ٢) الهويّة: 9627…@c.us رقمٌ موثَّق؛ …@lid يُحلّ (senderPhone ← الجدول ← البوّابة)، وإلّا lid:<digits>
//   ٣) الترجمة إلى حمولة ميتا (text/image/audio/location/…) بمعرّف وسيطٍ داخليّ owa-…
//   ٤) ingestInbound — فيمرّ بما يمرّ به وارد ميتا حرفيّاً: الإشعار، الأزرار، المتابعة، البوت
// ويُعالج أيضاً: ما يُكتب من هاتف الرقم (message.sent)، والحالات (ack)، والتفاعلات، وأحداث الجلسة.

import crypto from 'crypto';
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { getDB } from '../../config/db.js';
import { env } from '../../config/env.js';
import { waConversations, waMessages } from '../../schemas/admin.schema.js';
import { normalizeAnyPhone } from '../../utils/phone.util.js';
import { transportSettings } from './settings.js';
import * as gw from './openwa.client.js';

// ── التوقيع ───────────────────────────────────────────
export function verifyOpenWaSignature(raw: Buffer | undefined, header: string | string[] | undefined): boolean {
  if (!env.OPENWA_WEBHOOK_SECRET || !raw || typeof header !== 'string') return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', env.OPENWA_WEBHOOK_SECRET).update(raw).digest('hex');
  const a = Buffer.from(header), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── معرّفات واتساب ────────────────────────────────────
export type JidKind = 'user' | 'lid' | 'group' | 'channel' | 'broadcast' | 'other';
export function jidKind(jid: string): JidKind {
  const j = String(jid || '');
  if (j.endsWith('@g.us')) return 'group';
  if (j.endsWith('@newsletter')) return 'channel';
  if (j === 'status@broadcast' || j.endsWith('@broadcast')) return 'broadcast';
  if (j.endsWith('@lid')) return 'lid';
  if (j.endsWith('@c.us') || j.endsWith('@s.whatsapp.net')) return 'user';
  return 'other';
}
const jidUser = (jid: string) => String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');

/** رسائل النظام الداخليّة — واتساب لا يعرضها، فلا نفتح لها محادثة */
const SYSTEM_TYPES = new Set(['unknown', 'e2e_notification', 'notification', 'notification_template', 'protocol', 'gp2',
  'ciphertext', 'revoked', 'call_log', 'broadcast_notification', 'masked', 'pinned_message', 'debug', 'keep_in_chat',
  // سجلّ المكالمات (واردة أو صادرة من الهاتف) ليس رسالة: كان يُعكس «رسالة غير مدعومة» ويوقف البوت (2026-10-20)
  'call']);

export interface WebIdentity {
  /** ما يُمرَّر إلى getOrCreateConversation: أرقام دوليّة، أو lid:<digits> لرقمٍ مخفيّ */
  key: string;
  verified: boolean;
  chatId: string;
  lid?: string;
}

async function lookupIdentity(lid: string): Promise<string | null> {
  const db = getDB(); if (!db) return null;
  const r: any = await db.execute(sql`SELECT phone FROM wa_identities WHERE lid = ${lid} AND phone IS NOT NULL LIMIT 1`);
  return (r?.rows ?? r ?? [])[0]?.phone || null;
}
async function rememberIdentity(lid: string, phone: string | null, source: string): Promise<void> {
  const db = getDB(); if (!db) return;
  await db.execute(sql`INSERT INTO wa_identities (lid, phone, source, resolved_at, seen_at)
    VALUES (${lid}, ${phone}, ${source}, ${phone ? sql`NOW()` : sql`NULL`}, NOW())
    ON CONFLICT (lid) DO UPDATE SET seen_at = NOW(),
      phone = COALESCE(EXCLUDED.phone, wa_identities.phone),
      source = CASE WHEN EXCLUDED.phone IS NOT NULL THEN EXCLUDED.source ELSE wa_identities.source END,
      resolved_at = COALESCE(EXCLUDED.resolved_at, wa_identities.resolved_at)`).catch(() => {});
}

/**
 * من أيّ رقمٍ هذه المحادثة؟ senderPhone يأتي من خوادم واتساب نفسها (RESOLVE_LID_TO_PHONE) فهو موثوق.
 * ما لم يُحلّ يبقى «lid:<digits>» بلا توثيق — لا أداة أدمن ولا كتابة على حساب منه.
 */
export async function resolveIdentity(chatId: string, senderPhone?: string | null): Promise<WebIdentity | null> {
  const kind = jidKind(chatId);
  if (kind === 'user') {
    const d = jidUser(chatId);
    return d ? { key: d, verified: true, chatId } : null;
  }
  if (kind !== 'lid') return null;
  const lid = chatId;
  let phone = String(senderPhone || '').replace(/\D/g, '') || null;
  let source = phone ? 'webhook' : '';
  if (!phone) { phone = await lookupIdentity(lid); if (phone) source = 'table'; }
  if (!phone) { phone = await gw.resolvePhone(lid); if (phone) source = 'gateway'; }
  await rememberIdentity(lid, phone, source);
  if (phone) {
    await mergeLidConversation(lid, phone).catch(e => console.warn('⚠️ WA lid merge:', e?.message));
    return { key: phone, verified: true, chatId: lid, lid };
  }
  return { key: `lid:${jidUser(lid)}`, verified: false, chatId: lid, lid };
}

/** محادثةٌ فُتحت بمفتاح lid ثمّ عُرف رقمها: تُنقل رسائلها إلى محادثة الرقم وتُحذف */
async function mergeLidConversation(lid: string, phoneDigits: string): Promise<void> {
  const db = getDB(); if (!db) return;
  const lidKey = `lid:${jidUser(lid)}`;
  const [tmp] = await db.select().from(waConversations).where(eq(waConversations.phone, lidKey)).limit(1);
  if (!tmp) return;
  const norm = normalizeAnyPhone(phoneDigits);
  if (!norm) return;
  const { getOrCreateConversation, emitInbox } = await import('../whatsapp-inbox.service.js');
  const real: any = await getOrCreateConversation(norm.local, (tmp as any).displayName || '', { channel: 'web', webChatId: lid, phoneVerified: true });
  if (!real || real.id === (tmp as any).id) return;
  await db.update(waMessages).set({ conversationId: real.id } as any).where(eq(waMessages.conversationId, (tmp as any).id));
  await db.execute(sql`UPDATE wa_conversations SET
      unread_count = unread_count + ${(tmp as any).unreadCount || 0},
      last_inbound_at = GREATEST(last_inbound_at, ${(tmp as any).lastInboundAt}),
      web_last_inbound_at = GREATEST(web_last_inbound_at, ${(tmp as any).webLastInboundAt}),
      last_message_at = GREATEST(last_message_at, ${(tmp as any).lastMessageAt}),
      channel = 'web', web_chat_id = ${lid}, updated_at = NOW()
    WHERE id = ${real.id}`);
  await db.delete(waConversations).where(eq(waConversations.id, (tmp as any).id));
  console.log(`🔗 WA lid conversation ${lidKey} merged into ${norm.local}`);
  emitInbox('wa:conversation:update', { conversation: { ...real, mergedFrom: (tmp as any).id } });
}

// ── الوسائط ───────────────────────────────────────────
const mediaIdOf = (msgId: string) => 'owa-' + crypto.createHash('sha256').update(String(msgId)).digest('hex').slice(0, 20);

async function storeMedia(d: any, chatId: string): Promise<{ id: string; mime: string } | null> {
  if (!d?.media && !d?.hasMedia) return null;
  try {
    let buf: Buffer | null = null;
    let mime = String(d.media?.mimetype || '').split(';')[0].trim();
    if (d.media?.data && !d.media?.omitted) buf = Buffer.from(String(d.media.data), 'base64');
    else {
      const r = await gw.media(chatId, d.id);
      buf = r.buf; mime = mime || r.mime.split(';')[0].trim();
    }
    if (!buf?.length) return null;
    const id = mediaIdOf(d.id);
    const { saveWaMedia } = await import('../wa-bot-ext.service.js');
    await saveWaMedia(id, mime || 'application/octet-stream', buf);
    return { id, mime: mime || 'application/octet-stream' };
  } catch (e: any) {
    console.warn('⚠️ WA web media:', e?.message);
    return null;
  }
}

// ── الترجمة إلى شكل ميتا ──────────────────────────────
/** حدث OpenWA (IncomingMessage) ← رسالة بشكل webhook ميتا (value.messages[i]) */
export function toMetaMessage(d: any, fromKey: string, media: { id: string; mime: string } | null): any {
  const t = String(d.type || 'text').toLowerCase();
  const caption = String(d.body || '');
  const base: any = { id: d.id, from: fromKey, timestamp: String(d.timestamp || Math.floor(Date.now() / 1000)), _owa: { chatId: d.chatId, type: t } };
  if (d.quotedMessage?.id) base.context = { id: d.quotedMessage.id };
  switch (t) {
    case 'text': case 'chat':
      return { ...base, type: 'text', text: { body: String(d.body || '') } };
    case 'image':
      return { ...base, type: 'image', image: { id: media?.id, mime_type: media?.mime, ...(caption ? { caption } : {}) } };
    case 'video':
      return { ...base, type: 'video', video: { id: media?.id, mime_type: media?.mime, ...(caption ? { caption } : {}) } };
    case 'audio': case 'voice': case 'ptt':
      return { ...base, type: 'audio', audio: { id: media?.id, mime_type: media?.mime, voice: t !== 'audio' } };
    case 'document':
      return { ...base, type: 'document', document: { id: media?.id, mime_type: media?.mime, filename: d.media?.filename || '', ...(caption ? { caption } : {}) } };
    case 'sticker':
      return { ...base, type: 'sticker', sticker: { id: media?.id, mime_type: media?.mime } };
    case 'location': {
      const l = d.location || {};
      return { ...base, type: 'location', location: { latitude: l.latitude, longitude: l.longitude, name: l.description || '', address: l.address || '', url: l.url || '' } };
    }
    case 'contact': case 'vcard':
      return { ...base, type: 'contacts', contacts: [{ vcard: String(d.body || '') }] };
    case 'poll':
      return { ...base, type: 'text', text: { body: `📊 ${d.poll?.name || d.body || 'استفتاء'}` } };
    default:
      return { ...base, type: 'unsupported' };
  }
}

// ── الوارد من العميل ───────────────────────────────────
async function onIncoming(d: any): Promise<string> {
  const chatId = d.chatId || d.from;
  const kind = jidKind(chatId);
  if (d.isGroup || d.isStatusBroadcast || !['user', 'lid'].includes(kind)) return 'ignored';
  if (SYSTEM_TYPES.has(String(d.type || '').toLowerCase())) return 'system-ignored';
  if (d.fromMe) return onOutgoing(d);
  const db = getDB(); if (!db) return 'no-db';
  // منع التكرار قبل أيّ عمل (تنزيل الوسائط مكلف)
  const [dup] = await db.select({ id: waMessages.id }).from(waMessages).where(eq(waMessages.wamid, String(d.id))).limit(1);
  if (dup) return 'dup';

  const who = await resolveIdentity(chatId, d.senderPhone);
  if (!who) return 'no-identity';
  const media = await storeMedia(d, chatId);
  let msg = toMetaMessage(d, who.key, media);
  if (msg.type === 'text' && !String(msg.text.body).trim()) return 'empty';

  // 🔢 ردٌّ على قائمةٍ مرقّمة (بديل الأزرار) ⟵ button_reply كأنّ ميتا أرسلته
  try {
    const { applyMenuReply } = await import('./menu-emulation.js');
    msg = await applyMenuReply(who.key, msg);
  } catch { /* بلا قوائم بعد */ }

  const pushName = d.contact?.pushName || d.contact?.name || d.pushName || d.notifyName || '';
  const s = transportSettings();
  const { ingestInbound } = await import('../whatsapp-inbox.service.js');
  await ingestInbound(msg, pushName ? [{ wa_id: who.key, profile: { name: pushName } }] : [], 'web', {
    webChatId: who.chatId,
    phoneVerified: who.verified,
    // الظلّ: الوضع cloud_only أو بوت الجلسة مطفأ — يُخزَّن ويُعرض ويُشعَر، ولا يردّ الدون
    suppressBot: s.mode === 'cloud_only' || !s.webBot,
  });
  await markFirstContact(who.key);
  return 'stored';
}

async function markFirstContact(key: string): Promise<void> {
  const db = getDB(); if (!db) return;
  const norm = key.startsWith('lid:') ? { local: key } : normalizeAnyPhone(key);
  if (!norm) return;
  await db.execute(sql`UPDATE wa_conversations SET web_first_contact_at = NOW()
    WHERE phone = ${norm.local} AND web_first_contact_at IS NULL`).catch(() => {});
}

// ── الصادر من الرقم: صدى رسائلنا، أو ما كتبه موظّفٌ على الهاتف ──
async function onOutgoing(d: any): Promise<string> {
  const chatId = d.chatId || d.to;
  const kind = jidKind(chatId);
  if (d.isGroup || d.isStatusBroadcast || !['user', 'lid'].includes(kind)) return 'ignored';
  if (SYSTEM_TYPES.has(String(d.type || '').toLowerCase())) return 'system-ignored';
  const db = getDB(); if (!db) return 'no-db';
  const wamid = String(d.id || '');

  // الحدث قد يسبق ردّ الإرسال: ننتظر لحظة ليُكتب المعرّف في صفّنا
  await new Promise(r => setTimeout(r, 2500));
  if (wamid) {
    const [own] = await db.select({ id: waMessages.id }).from(waMessages).where(eq(waMessages.wamid, wamid)).limit(1);
    if (own) return 'own';
  }
  const who = await resolveIdentity(chatId, null);
  if (!who) return 'no-identity';
  const norm = who.key.startsWith('lid:') ? { local: who.key } : normalizeAnyPhone(who.key);
  if (!norm) return 'bad-phone';
  const [conv] = await db.select().from(waConversations).where(eq(waConversations.phone, norm.local)).limit(1);

  // صدىً لم يُكتب معرّفه بعد: صفٌّ صادرٌ حديث بلا معرّف بالنصّ نفسه
  const bodyText = String(d.body || '').trim();
  if (conv) {
    const recent = await db.select({ id: waMessages.id, body: waMessages.body, payload: waMessages.payload }).from(waMessages)
      .where(and(eq(waMessages.conversationId, (conv as any).id), eq(waMessages.channel, 'web'), eq(waMessages.direction, 'out'),
        isNull(waMessages.wamid), inArray(waMessages.status, ['queued', 'sending', 'sent']), gt(waMessages.createdAt, new Date(Date.now() - 3 * 60e3))))
      .orderBy(desc(waMessages.id)).limit(5);
    const hit = recent.find((m: any) => {
      const r = String(m.payload?._rendered || '').trim();
      return (r && r === bodyText) || String(m.body || '').trim() === bodyText || (m.payload?.image?.caption || '') === bodyText;
    });
    if (hit) {
      await db.update(waMessages).set({ wamid: wamid || null } as any).where(and(eq(waMessages.id, hit.id), isNull(waMessages.wamid)));
      return 'own';
    }
  }

  // ✍️ كتبه موظّفٌ على هاتف رقم الأعمال: يظهر في المركز ويوقف البوت (قرار المالك)
  const { getOrCreateConversation, emitInbox, BOT_PAUSE_AFTER_HUMAN_MS } = await import('../whatsapp-inbox.service.js');
  const c: any = conv || await getOrCreateConversation(who.key, '', { channel: 'web', webChatId: who.chatId, phoneVerified: who.verified });
  if (!c) return 'no-conv';
  const media = await storeMedia(d, chatId);
  const meta = toMetaMessage(d, who.key, media);
  // ما لا نعرف عرضه لا يُعكس ردّاً بشريّاً: لا يوقف البوت ولا يصفّر غير المقروء على حدثٍ ليس رسالة
  if (meta.type === 'unsupported') return 'unsupported-ignored';
  const { extractInbound } = await import('../whatsapp-inbox.service.js');
  const preview = extractInbound(meta).body || '';
  const [saved] = await db.insert(waMessages).values({
    conversationId: c.id, wamid: wamid || null, channel: 'web', direction: 'out', source: 'staff',
    msgType: meta.type === 'contacts' ? 'contacts' : meta.type, body: preview,
    payload: { ...meta, by: 'الهاتف', fromPhone: true }, status: 'sent',
  } as any).onConflictDoNothing({ target: waMessages.wamid }).returning();
  if (!saved) return 'dup';
  let pauseMs = BOT_PAUSE_AFTER_HUMAN_MS;
  try {
    const { getBotSettings } = await import('../whatsapp-bot.service.js');
    const st: any = await getBotSettings();
    if (st?.pauseMinutes) pauseMs = st.pauseMinutes * 60_000;
  } catch { /* الافتراضيّ */ }
  const now = new Date();
  const [updated] = await db.update(waConversations).set({
    lastMessageAt: now, lastMessagePreview: preview.slice(0, 120), updatedAt: now,
    botPausedUntil: new Date(now.getTime() + pauseMs), unreadCount: 0, needsAttention: false,
  } as any).where(eq(waConversations.id, c.id)).returning();
  emitInbox('wa:message:new', { conversation: updated, message: saved });
  return 'phone';
}

// ── الحالات (✓ ✓✓ مقروءة) ─────────────────────────────
const STATUS_RANK: Record<string, number> = { queued: 0, sending: 0, sent: 1, delivered: 2, read: 3, failed: 9 };

/** يطبّق حالة على رسالة صادرة عبر الجلسة. false إن لم يوجد الصفّ بعد (سباق) */
export async function applyWebStatus(wamid: string, status: string, at?: Date): Promise<boolean> {
  const db = getDB(); if (!db || !wamid) return false;
  const st = status === 'played' ? 'read' : status;
  if (!['sent', 'delivered', 'read', 'failed'].includes(st)) return true;
  const [row] = await db.select({ id: waMessages.id, status: waMessages.status, payload: waMessages.payload, conversationId: waMessages.conversationId })
    .from(waMessages).where(eq(waMessages.wamid, wamid)).limit(1);
  if (!row) return false;
  // لا تراجع: «قُرئت» لا تعود «وصلت» إن تأخّر حدثٌ أقدم
  if (st !== 'failed' && (STATUS_RANK[row.status || ''] ?? 0) >= STATUS_RANK[st]) return true;
  const payload: any = { ...((row.payload as any) || {}) };
  payload.statusHistory = [...(payload.statusHistory || []), { status: st, at: (at || new Date()).toISOString() }];
  const patch: any = { status: st, payload };
  if (st === 'failed') patch.errorMessage = 'تعذّر الإرسال عبر رقم الأعمال';
  const [updated] = await db.update(waMessages).set(patch).where(eq(waMessages.id, row.id))
    .returning({ id: waMessages.id, conversationId: waMessages.conversationId, status: waMessages.status, errorMessage: waMessages.errorMessage });
  if (updated) {
    const { emitInbox } = await import('../whatsapp-inbox.service.js');
    emitInbox('wa:status:update', updated);
  }
  return true;
}

async function onAck(d: any): Promise<string> {
  const id = String(d.messageId || d.id || '');
  if (!id) return 'no-id';
  const ok = await applyWebStatus(id, String(d.status || ''));
  if (!ok) {
    // الحالة سبقت كتابة المعرّف — تُحفظ دقيقتين وتُطبَّق عند إنهاء الإرسال (outbox)
    const { getAux, setAux } = await import('../../config/redis.js');
    const prev = (await getAux(`owa-ack:${id}`)) || [];
    await setAux(`owa-ack:${id}`, [...prev, { status: d.status, at: Date.now() }]);
  }
  return 'ack';
}

/** تُستدعى من الطابور بعد كتابة المعرّف: حالاتٌ وصلت قبله */
export async function flushPendingAcks(wamid: string): Promise<void> {
  const { getAux, deleteAux } = await import('../../config/redis.js');
  const list = await getAux(`owa-ack:${wamid}`);
  if (!Array.isArray(list) || !list.length) return;
  await deleteAux(`owa-ack:${wamid}`);
  for (const a of list) await applyWebStatus(wamid, String(a.status || ''), new Date(a.at));
}

// ── التفاعلات ─────────────────────────────────────────
async function onReaction(d: any): Promise<string> {
  const chatId = String(d.chatId || '');
  if (!['user', 'lid'].includes(jidKind(chatId))) return 'ignored';
  // تفاعلُنا نحن (من الهاتف) لا يُعرض كتفاعل عميل
  const sender = String(d.senderId || '');
  if (sender && (await isOwnJid(sender))) return 'own';
  const who = await resolveIdentity(chatId, null);
  if (!who) return 'no-identity';
  const rid = 'owa-rx-' + crypto.createHash('sha256').update(`${d.messageId}|${d.senderId}|${d.reaction}|${Date.now()}`).digest('hex').slice(0, 24);
  const msg = { id: rid, from: who.key, timestamp: String(Math.floor(Date.now() / 1000)), type: 'reaction', reaction: { message_id: d.messageId, emoji: d.reaction || '' } };
  const { ingestInbound } = await import('../whatsapp-inbox.service.js');
  await ingestInbound(msg, [], 'web', { webChatId: who.chatId, phoneVerified: who.verified, suppressBot: true });
  return 'reaction';
}

let ownJid: string | null = null;
async function isOwnJid(jid: string): Promise<boolean> {
  if (!ownJid) {
    try { const s = await gw.session(); ownJid = String(s?.phone || '').replace(/\D/g, '') || null; } catch { return false; }
  }
  return !!ownJid && jidUser(jid) === ownJid;
}

// ── المدخل ────────────────────────────────────────────
export interface OpenWaEnvelope { event: string; timestamp?: string; sessionId?: string; idempotencyKey?: string; deliveryId?: string; data?: any }

export async function handleOpenWaEvent(ev: OpenWaEnvelope): Promise<string> {
  if (!ev || typeof ev !== 'object') return 'bad';
  if (env.OPENWA_SESSION_ID && ev.sessionId && ev.sessionId !== env.OPENWA_SESSION_ID) return 'foreign-session';
  // منع التكرار: المفتاح ثابت عبر محاولات البوّابة (التوقيع بلا طابع زمنيّ فلا حماية من الإعادة غير هذا)
  const key = ev.idempotencyKey || ev.deliveryId;
  if (key) {
    const { getAux, setAux } = await import('../../config/redis.js');
    if (await getAux(`owa-ev:${key}`)) return 'dup-event';
    await setAux(`owa-ev:${key}`, 1);
  }
  const d = ev.data || {};
  try {
    const { noteWebEvent } = await import('./web.health.js');
    noteWebEvent(ev.event);
  } catch { /* الصحّة تكميليّة */ }
  switch (ev.event) {
    case 'message.received': return onIncoming(d);
    case 'message.sent': return onOutgoing(d);
    case 'message.ack': return onAck(d);
    case 'message.failed': return onAck({ ...d, status: 'failed' });
    case 'message.reaction': return onReaction(d);
    case 'message.revoked': {
      const db = getDB(); if (!db) return 'no-db';
      const ids = [d.revokedId, d.messageId, d.id].filter(Boolean).map(String);
      if (ids.length) await db.execute(sql`UPDATE wa_messages SET payload = payload || '{"revoked":true}'::jsonb WHERE wamid IN (${sql.join(ids.map(i => sql`${i}`), sql`, `)})`);
      return 'revoked';
    }
    default:
      if (String(ev.event).startsWith('session.')) {
        const { onSessionEvent } = await import('./web.health.js');
        await onSessionEvent(ev.event, d);
        return 'session';
      }
      return 'ignored';
  }
}
