// ══════════════════════════════════════════════════════
// 📱 قناة رقم الأعمال — الإرسال عبر طابور wa_outbox
// ══════════════════════════════════════════════════════
// ميتا تحدّ الإرسال بسقفٍ معلن؛ الجلسة لا سقف معلناً لها والعقوبة حظر الرقم. فكلّ صادرٍ
// عبر الجلسة يمرّ بطابورٍ بثلاثة مسارات (قرار المالك 2026-10-20):
//   reply  : ردّ على وارد — فوريّ («يكتب…» من البوّابة)، دائماً
//   timely : مقيّد بوقت (تذكير، مقعد، تنبيه أدمن، رسائل الحجز) — ٣–٨ث، سقفٌ خدميّ مستقلّ
//   bulk   : جماعيّ — ١٥–٤٥ث، ٢٥٠/يوم، ١٠:٠٠–٢٣:٣٠ بتوقيت عمّان، يكمل غداً ما زاد
// لا نافذة ولا شرط محادثة سابقة: الضبط كلّه هنا، بقيمٍ يعدّلها المالك من «القنوات».
//
// عاملٌ واحد متسلسل (الترتيب داخل المحادثة محفوظ)، والمسار الأعلى أولويّة يُخدم أوّلاً.
// Idempotency-Key = معرّف صفّنا ⇒ إعادة المحاولة بعد خطأ شبكةٍ غامض لا تُرسل مرّتين.

import fs from 'fs';
import path from 'path';
import { and, eq, sql } from 'drizzle-orm';
import { getDB } from '../../config/db.js';
import { waMessages } from '../../schemas/admin.schema.js';
import { buildCloudBody, WA_CAPTION_MAX } from './cloud.transport.js';
import { transportSettings } from './settings.js';
import { channelSuspendedReason } from './locks.js';
import { isWebReady, webConfigured } from './router.js';
import { renderInteractive, saveMenu } from './menu-emulation.js';
import * as gw from './openwa.client.js';
import type { Lane, OutboundContent } from './types.js';

const LANE_PRIORITY: Record<Lane, number> = { reply: 1, timely: 2, bulk: 5 };
const MAX_ATTEMPTS = 5;
const JO_OFFSET_MS = 3 * 3600e3;   // الأردن +3 ثابت (أُلغي التوقيت الصيفيّ 2022)

/** معرّف المحادثة عند واتساب: المحفوظ من الوارد، أو الرقم */
export function webChatIdOf(conv: { webChatId?: string | null; waPhone?: string | null }): string {
  if (conv.webChatId) return conv.webChatId;
  const d = String(conv.waPhone || '').replace(/\D/g, '');
  return d ? `${d}@c.us` : '';
}

/** الحمولة المخزَّنة: شكل ميتا نفسه — فتبقى الواجهة والتحليلات كما هي */
export function buildWebStoredPayload(conv: { waPhone?: string | null; webChatId?: string | null }, c: OutboundContent): any {
  return buildCloudBody(conv.waPhone || conv.webChatId || '', c);
}

/** صورةٌ من رابطنا العامّ (PUBLIC_URL/uploads/…) ⟵ ملفّها المحلّيّ. لا نقبل ما سواه (لا وكيل تحميل للغير) */
function localImagePath(img: OutboundContent['image']): string | null {
  if (!img) return null;
  if (img.localPath) return img.localPath;
  const link = String(img.link || '');
  const m = link.match(/\/(uploads\/wa-out\/[\w.-]+)$/);
  return m ? m[1] : null;
}

interface OutboxContent {
  kind: gw.SendKind;
  chatId: string;
  text?: string;
  imagePath?: string;
  caption?: string;
  location?: { latitude: number; longitude: number; description?: string; address?: string };
  menu?: { kind: 'button' | 'list'; items: any[] } | null;
  menuKey?: string;
}

/** يحوّل محتوى رسالة إلى ما ترسله البوّابة (والأزرار إلى قائمة مرقّمة) */
export function toOutboxContent(conv: any, c: OutboundContent): { content: OutboxContent; rendered: string } {
  const chatId = webChatIdOf(conv);
  if (c.interactive) {
    const r = renderInteractive(c.interactive);
    return { content: { kind: 'text', chatId, text: r.text, menu: r.menu, menuKey: conv.phone }, rendered: r.text };
  }
  if (c.location) {
    return {
      content: { kind: 'location', chatId, location: { latitude: c.location.latitude, longitude: c.location.longitude, description: c.location.name || '', address: c.location.address || '' } },
      rendered: `📍 ${c.location.name || 'موقع'}`,
    };
  }
  const imagePath = localImagePath(c.image);
  if (c.image && imagePath) {
    const caption = (c.image.caption || '').slice(0, WA_CAPTION_MAX);
    return { content: { kind: 'image', chatId, imagePath, caption }, rendered: caption };
  }
  const text = String(c.text || '').trim();
  return { content: { kind: 'text', chatId, text }, rendered: text };
}

/** يُدخل الصفّ (المكتوب بحالة queued) إلى الطابور. يعيد الصفّ بعد إضافة _rendered/_lane */
export async function enqueueWeb(saved: any, conv: any, c: OutboundContent, lane: Lane, priority?: number): Promise<any> {
  const db = getDB(); if (!db) throw new Error('DB unavailable');
  if (!webConfigured()) {
    const err: any = new Error('رقم الأعمال غير مهيّأ'); err.code = 'CHANNEL_UNAVAILABLE'; throw err;
  }
  const { content, rendered } = toOutboxContent(conv, c);
  if (!content.chatId) {
    const err: any = new Error('لا معرّف محادثة لرقم الأعمال'); err.code = 'CHANNEL_UNAVAILABLE'; throw err;
  }
  const payload = { ...(saved.payload || {}), _rendered: rendered, _lane: lane };
  const [row] = await db.update(waMessages).set({ payload } as any).where(eq(waMessages.id, saved.id)).returning();
  await db.execute(sql`INSERT INTO wa_outbox (message_id, lane, priority, not_before, content)
    VALUES (${saved.id}, ${lane}, ${priority ?? LANE_PRIORITY[lane]}, NOW(), ${JSON.stringify(content)}::jsonb)
    ON CONFLICT (message_id) DO NOTHING`);
  kick();
  return row || saved;
}

// ══════════════════════════════════════════════════════
// ⚙️ العامل
// ══════════════════════════════════════════════════════
let running = false;
let timer: NodeJS.Timeout | null = null;
const nextAllowed: Record<Lane, number> = { reply: 0, timely: 0, bulk: 0 };

function kick(): void { setImmediate(() => { void step(); }); }

const rand = (a: number, b: number) => a + Math.random() * Math.max(0, b - a);

/** دقائق اليوم بتوقيت عمّان، وبداية يوم عمّان (UTC) */
function joNow(): { minutes: number; dayStartUtc: Date } {
  const jo = new Date(Date.now() + JO_OFFSET_MS);
  const minutes = jo.getUTCHours() * 60 + jo.getUTCMinutes();
  const dayStartUtc = new Date(Date.UTC(jo.getUTCFullYear(), jo.getUTCMonth(), jo.getUTCDate()) - JO_OFFSET_MS);
  return { minutes, dayStartUtc };
}
const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

/** متى يجوز الجماعيّ التالي: الآن، أو بداية النافذة القادمة */
function bulkWindowDelayMs(): number {
  const s = transportSettings().bulk;
  const { minutes, dayStartUtc } = joNow();
  const from = hm(s.from), to = hm(s.to);
  const inside = from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
  if (inside) return 0;
  let target = dayStartUtc.getTime() + from * 60e3;
  if (target <= Date.now()) target += 24 * 3600e3;
  return target - Date.now();
}

async function sentToday(lane: Lane): Promise<number> {
  const db = getDB(); if (!db) return 0;
  const r: any = await db.execute(sql`SELECT COUNT(*)::int AS n FROM wa_messages
    WHERE channel = 'web' AND direction = 'out' AND payload->>'_lane' = ${lane}
      AND (payload->>'_sentAt')::timestamptz >= ${joNow().dayStartUtc.toISOString()}::timestamptz`);
  return Number((r?.rows ?? r ?? [])[0]?.n || 0);
}

async function finalizeFailure(id: number, reason: string): Promise<void> {
  const db = getDB(); if (!db) return;
  await db.execute(sql`DELETE FROM wa_outbox WHERE message_id = ${id}`);
  const [u] = await db.update(waMessages).set({ status: 'failed', errorMessage: reason.slice(0, 300) } as any)
    .where(eq(waMessages.id, id)).returning({ id: waMessages.id, conversationId: waMessages.conversationId, status: waMessages.status, errorMessage: waMessages.errorMessage });
  if (u) { const { emitInbox } = await import('../whatsapp-inbox.service.js'); emitInbox('wa:status:update', u); }
}

async function sendOne(job: any): Promise<void> {
  const db = getDB(); if (!db) return;
  const c: OutboxContent = job.content;
  const idem = `mafia-${job.message_id}`;
  let wamid: string | null;
  if (c.kind === 'image' && c.imagePath) {
    const abs = path.resolve(c.imagePath);
    if (!abs.startsWith(path.resolve('uploads')) || !fs.existsSync(abs)) throw Object.assign(new Error('ملفّ الصورة غير موجود'), { fatal: true });
    const base64 = (await fs.promises.readFile(abs)).toString('base64');
    const mimetype = /\.png$/i.test(abs) ? 'image/png' : 'image/jpeg';
    wamid = await gw.send('image', { chatId: c.chatId, base64, mimetype, ...(c.caption ? { caption: c.caption } : {}) }, idem);
  } else if (c.kind === 'location' && c.location) {
    wamid = await gw.send('location', { chatId: c.chatId, ...c.location }, idem);
  } else {
    wamid = await gw.send('text', { chatId: c.chatId, text: c.text || '' }, idem);
  }

  // ردٌّ على وارد: علّم المحادثة مقروءة (✓✓ زرقاء عند العميل) — كما يفعل موظّفٌ على الهاتف
  if (job.lane === 'reply') void gw.markRead(c.chatId);
  if (c.menu && c.menuKey) await saveMenu(c.menuKey, c.menu as any, wamid);

  await db.execute(sql`DELETE FROM wa_outbox WHERE message_id = ${job.message_id}`);
  const [row] = await db.select({ payload: waMessages.payload, status: waMessages.status }).from(waMessages).where(eq(waMessages.id, job.message_id)).limit(1);
  const payload = { ...((row?.payload as any) || {}), _sentAt: new Date().toISOString() };
  const status = row && ['delivered', 'read'].includes(String(row.status)) ? row.status : 'sent';
  const [u] = await db.update(waMessages).set({ wamid: wamid || null, status, payload } as any)
    .where(eq(waMessages.id, job.message_id))
    .returning({ id: waMessages.id, conversationId: waMessages.conversationId, status: waMessages.status, errorMessage: waMessages.errorMessage });
  if (u) { const { emitInbox } = await import('../whatsapp-inbox.service.js'); emitInbox('wa:status:update', u); }
  if (wamid) { const { flushPendingAcks } = await import('./web.inbound.js'); await flushPendingAcks(wamid); }
  // 📤 رسالة حجزٍ من صفحة الحجوزات: «أُرسلت» تُضبط الآن — عند خروجها فعلاً لا عند النقر
  if ((payload as any).reservationId) {
    const { markReservationSent } = await import('../wa-outreach.service.js');
    await markReservationSent(Number((payload as any).reservationId), String((payload as any).staffName || ''));
  }
}

async function step(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const db = getDB();
    if (!db || !webConfigured()) return;
    // لا إرسال وجلسةٌ غير جاهزة أو مقفلة — الرسائل تنتظر (لا تفشل)
    if (channelSuspendedReason('web') || !isWebReady()) return;

    const s = transportSettings();
    const now = Date.now();
    const { bulkPausedUntil } = await import('./web.health.js');
    const lanes: Lane[] = ['reply', 'timely', 'bulk'];
    for (const lane of lanes) {
      if (nextAllowed[lane] > now) continue;
      if (lane === 'bulk') {
        if (bulkPausedUntil() > now) continue;
        const wait = bulkWindowDelayMs();
        if (wait > 0) { nextAllowed.bulk = now + Math.min(wait, 10 * 60e3); continue; }
        if ((await sentToday('bulk')) >= s.bulk.dailyCap) { nextAllowed.bulk = now + 15 * 60e3; continue; }
      }
      if (lane === 'timely' && (await sentToday('timely')) >= s.timely.serviceDailyCap) { nextAllowed.timely = now + 15 * 60e3; continue; }

      const r: any = await db.execute(sql`SELECT * FROM wa_outbox WHERE lane = ${lane} AND not_before <= NOW()
        ORDER BY priority ASC, message_id ASC LIMIT 1`);
      const job = (r?.rows ?? r ?? [])[0];
      if (!job) continue;
      await db.execute(sql`UPDATE wa_outbox SET lease_until = NOW() + INTERVAL '2 minutes', attempts = attempts + 1 WHERE message_id = ${job.message_id}`);
      await db.update(waMessages).set({ status: 'sending' } as any).where(and(eq(waMessages.id, job.message_id), eq(waMessages.status, 'queued')));
      try {
        await sendOne(job);
        if (lane === 'timely') nextAllowed.timely = Date.now() + rand(s.timely.gapMinSec, s.timely.gapMaxSec) * 1000;
        if (lane === 'bulk') nextAllowed.bulk = Date.now() + rand(s.bulk.gapMinSec, s.bulk.gapMaxSec) * 1000;
      } catch (e: any) {
        const ge = e as gw.GatewayError;
        if (ge?.status === 429) {
          // البوّابة نفسها قالت «تمهّل» — لا تُحسب محاولة
          const after = Math.min(6 * 3600, Math.max(60, Number(ge.body?.retryAfterSeconds) || 300));
          await db.execute(sql`UPDATE wa_outbox SET attempts = GREATEST(attempts - 1, 0), not_before = NOW() + (${after} * INTERVAL '1 second'), last_error = ${String(ge.message).slice(0, 300)} WHERE message_id = ${job.message_id}`);
          nextAllowed[lane] = Date.now() + after * 1000;
        } else if (e?.fatal || (ge?.status >= 400 && ge?.status < 500 && ge?.status !== 408 && ge?.status !== 409)) {
          await finalizeFailure(job.message_id, `${ge?.status ? `HTTP ${ge.status} — ` : ''}${e?.message || 'فشل'}`);
        } else if ((job.attempts + 1) >= MAX_ATTEMPTS) {
          await finalizeFailure(job.message_id, `تعذّر الإرسال بعد ${MAX_ATTEMPTS} محاولات: ${e?.message || ''}`);
        } else {
          await db.execute(sql`UPDATE wa_outbox SET not_before = NOW() + (${(job.attempts + 1) * 30} * INTERVAL '1 second'), last_error = ${String(e?.message || '').slice(0, 300)} WHERE message_id = ${job.message_id}`);
        }
        await db.update(waMessages).set({ status: 'queued' } as any).where(and(eq(waMessages.id, job.message_id), eq(waMessages.status, 'sending')));
      }
      break;   // رسالةٌ واحدة لكلّ خطوة — الخطوة التالية بعد ثانية
    }
  } catch (e: any) {
    console.warn('⚠️ WA web outbox:', e?.message);
  } finally {
    running = false;
  }
}

export function startWebOutbox(): void {
  if (timer || !webConfigured()) return;
  timer = setInterval(() => { void step(); }, 1000);
  timer.unref?.();
  console.log('📤 WA web outbox worker started');
}

/** إحصاء الطابور للواجهة */
export async function outboxStats(): Promise<{ queued: Record<Lane, number>; sentToday: Record<Lane, number>; next: Record<Lane, string | null> }> {
  const db = getDB();
  const queued: Record<Lane, number> = { reply: 0, timely: 0, bulk: 0 };
  if (db) {
    const r: any = await db.execute(sql`SELECT lane, COUNT(*)::int AS n FROM wa_outbox GROUP BY lane`);
    for (const x of (r?.rows ?? r ?? [])) if (x.lane in queued) queued[x.lane as Lane] = Number(x.n);
  }
  const [b, t, rp] = await Promise.all([sentToday('bulk'), sentToday('timely'), sentToday('reply')]);
  const iso = (n: number) => (n > Date.now() ? new Date(n).toISOString() : null);
  return { queued, sentToday: { reply: rp, timely: t, bulk: b }, next: { reply: null, timely: iso(nextAllowed.timely), bulk: iso(nextAllowed.bulk) } };
}

/** إيقاف دفعةٍ جماعيّة: حذف ما لم يُرسل بعد من صفوفها */
export async function cancelQueued(messageIds: number[]): Promise<number> {
  const db = getDB(); if (!db || !messageIds.length) return 0;
  const r: any = await db.execute(sql`DELETE FROM wa_outbox WHERE message_id IN (${sql.join(messageIds.map(i => sql`${i}`), sql`, `)}) RETURNING message_id`);
  const ids = (r?.rows ?? r ?? []).map((x: any) => Number(x.message_id));
  if (ids.length) await db.execute(sql`UPDATE wa_messages SET status = 'failed', error_message = 'أُلغي قبل الإرسال' WHERE id IN (${sql.join(ids.map((i: number) => sql`${i}`), sql`, `)})`);
  return ids.length;
}

