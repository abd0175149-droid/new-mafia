// ══════════════════════════════════════════════════════
// 🗄️ سجلّ رقم الأعمال — استرجاع ما فات + استيراد التاريخ
// ══════════════════════════════════════════════════════
// ١) catchUpWeb: بعد انقطاعٍ أطول من محاولات البوّابة (نشرٌ طويل، سقوط الخادم) نقرأ المحادثات
//    التي تحرّكت منذ آخر حدثٍ عالجناه ونُدخل ما لم يصلنا — بمنع التكرار بـwamid. في ٢٠ أيلول
//    ضاعت رسائل الحظر عند ميتا بلا رجعة؛ على الجلسة السجلّ عند الهاتف فيُسترجع.
// ٢) importWebHistory: مرّة واحدة عند الربط — محادثات اللاعبين المسجّلين تُستورد (آخر ٣٠ رسالة)
//    سياقاً للبوت والموظّف بلا إشعار ولا بوت. غير اللاعبين: يُعلَّم «معروف» فقط، والبوت عليهم
//    مطفأ (رقم الأعمال فيه محادثات موردين ومعارف — ردٌّ آليّ عليها يضرّ).

import { eq, sql } from 'drizzle-orm';
import { getDB } from '../../config/db.js';
import { waConversations, waMessages } from '../../schemas/admin.schema.js';
import { players } from '../../schemas/player.schema.js';
import { normalizeAnyPhone } from '../../utils/phone.util.js';
import * as gw from './openwa.client.js';
import { jidKind, resolveIdentity, toMetaMessage } from './web.inbound.js';
import { webConfigured } from './router.js';

const chatIdOf = (c: any): string => String(c?.id?._serialized || c?.id || c?.chatId || '');
const chatTs = (c: any): number => Number(c?.timestamp || c?.lastMessage?.timestamp || c?.t || 0) * 1000;
const msgTs = (m: any): number => Number(m?.timestamp || 0) * (Number(m?.timestamp) < 1e12 ? 1000 : 1);

async function getFlag(key: string): Promise<any> {
  const db = getDB(); if (!db) return null;
  const r: any = await db.execute(sql`SELECT value FROM wa_runtime_flags WHERE key = ${key} LIMIT 1`);
  return (r?.rows ?? r ?? [])[0]?.value ?? null;
}
async function setFlag(key: string, value: any): Promise<void> {
  const db = getDB(); if (!db) return;
  await db.execute(sql`INSERT INTO wa_runtime_flags (key, value, updated_at) VALUES (${key}, ${JSON.stringify(value)}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`);
}

/** آخر وقتٍ رأينا فيه نشاطاً على رقم الأعمال (أحدث رسالة web مخزّنة) */
async function lastWebActivity(): Promise<number> {
  const db = getDB(); if (!db) return 0;
  const r: any = await db.execute(sql`SELECT MAX(created_at) AS at FROM wa_messages WHERE channel = 'web'`);
  const at = (r?.rows ?? r ?? [])[0]?.at;
  return at ? new Date(at).getTime() : 0;
}

async function existsWamid(id: string): Promise<boolean> {
  const db = getDB(); if (!db) return true;
  const [x] = await db.select({ id: waMessages.id }).from(waMessages).where(eq(waMessages.wamid, id)).limit(1);
  return !!x;
}

/** صادرٌ قديم (كتبه موظّف على الهاتف) يُخزَّن سياقاً */
async function storeImportedOutgoing(m: any, who: { key: string; chatId: string; verified: boolean }): Promise<void> {
  const db = getDB(); if (!db) return;
  const { getOrCreateConversation, extractInbound } = await import('../whatsapp-inbox.service.js');
  const conv: any = await getOrCreateConversation(who.key, '', { channel: 'web', webChatId: who.chatId, phoneVerified: who.verified });
  if (!conv) return;
  const meta = toMetaMessage(m, who.key, null);
  await db.insert(waMessages).values({
    conversationId: conv.id, wamid: String(m.id), channel: 'web', direction: 'out', source: 'staff',
    msgType: meta.type === 'contacts' ? 'contacts' : meta.type, body: extractInbound(meta).body || '',
    payload: { ...meta, by: 'الهاتف', fromPhone: true, imported: true }, status: 'sent',
    createdAt: new Date(msgTs(m) || Date.now()),
  } as any).onConflictDoNothing({ target: waMessages.wamid });
}

/**
 * استرجاع ما فات: المحادثات التي تحرّكت بعد آخر نشاطٍ عندنا. الوارد الحديث (< ١٠ دقائق)
 * يمرّ كأنّه وصل الآن (فيردّ الدون)، والأقدم يُخزَّن سياقاً بلا ردٍّ متأخّر قد يربك العميل.
 */
export async function catchUpWeb(): Promise<{ chats: number; added: number }> {
  if (!webConfigured()) return { chats: 0, added: 0 };
  const s = await gw.session().catch(() => null);
  if (!gw.isLinked(s)) return { chats: 0, added: 0 };
  const since = await lastWebActivity();
  if (!since) return { chats: 0, added: 0 };     // لا نشاط سابق ⇒ هذا عمل الاستيراد لا الاسترجاع
  const list = (await gw.chats(100)).filter((c: any) => ['user', 'lid'].includes(jidKind(chatIdOf(c))) && chatTs(c) > since);
  let added = 0;
  const { ingestInbound } = await import('../whatsapp-inbox.service.js');
  const { applyMenuReply } = await import('./menu-emulation.js');
  for (const c of list.slice(0, 40)) {
    const chatId = chatIdOf(c);
    const msgs = await gw.history(chatId, 20).catch(() => []);
    for (const m of msgs) {
      if (!m?.id || msgTs(m) <= since || (await existsWamid(String(m.id)))) continue;
      const who = await resolveIdentity(chatId, m.senderPhone);
      if (!who) continue;
      if (m.fromMe) { await storeImportedOutgoing(m, who); added++; continue; }
      const fresh = Date.now() - msgTs(m) < 10 * 60e3;
      let meta = toMetaMessage(m, who.key, null);   // الوسائط القديمة لا تُنزَّل هنا — تكفي المعاينة
      if (fresh) meta = await applyMenuReply(who.key, meta);
      await ingestInbound(meta, [], 'web', { webChatId: who.chatId, phoneVerified: who.verified, imported: !fresh, suppressBot: !fresh });
      added++;
    }
  }
  if (added) console.log(`🗄️ WA web catch-up: ${added} message(s) from ${list.length} chat(s)`);
  return { chats: list.length, added };
}

export interface ImportReport { chats: number; players: number; others: number; messages: number; skipped: number; at: string }

/** استيراد تاريخ رقم الأعمال — مرّة واحدة (أو بطلبٍ صريح من «القنوات») */
export async function importWebHistory(opts: { perChat?: number; maxChats?: number; force?: boolean } = {}): Promise<ImportReport> {
  const db = getDB();
  if (!db || !webConfigured()) throw new Error('رقم الأعمال غير مهيّأ');
  const s = await gw.session();
  if (!gw.isLinked(s)) throw new Error('رقم الأعمال غير مربوط بعد');
  const prev = await getFlag('web_history_import');
  if (prev?.at && !opts.force) return prev as ImportReport;

  const perChat = Math.min(50, Math.max(5, opts.perChat ?? 30));
  const chats = (await gw.chats(opts.maxChats ?? 500)).filter((c: any) => ['user', 'lid'].includes(jidKind(chatIdOf(c))));
  const rep: ImportReport = { chats: chats.length, players: 0, others: 0, messages: 0, skipped: 0, at: '' };
  const { getOrCreateConversation, ingestInbound } = await import('../whatsapp-inbox.service.js');

  for (const c of chats) {
    const chatId = chatIdOf(c);
    const who = await resolveIdentity(chatId, null);
    if (!who) { rep.skipped++; continue; }
    const norm = who.verified ? normalizeAnyPhone(who.key) : null;
    const [pl] = norm?.isJordanian
      ? await db.select({ id: players.id }).from(players).where(eq(players.phone, norm.local)).limit(1)
      : [];
    const firstAt = new Date(chatTs(c) || Date.now());

    if (!pl) {
      // معروفٌ لرقم الأعمال وليس لاعباً: لا استيراد، والبوت عليه مطفأ إن فُتحت محادثته
      rep.others++;
      if (!norm) continue;
      const [ex] = await db.select({ id: waConversations.id }).from(waConversations).where(eq(waConversations.phone, norm.local)).limit(1);
      if (ex) await db.execute(sql`UPDATE wa_conversations SET web_first_contact_at = COALESCE(web_first_contact_at, ${firstAt}), web_chat_id = COALESCE(web_chat_id, ${who.chatId}) WHERE id = ${ex.id}`);
      else await db.execute(sql`INSERT INTO wa_web_known (phone, chat_id, last_at) VALUES (${norm.local}, ${who.chatId}, ${firstAt})
        ON CONFLICT (phone) DO UPDATE SET chat_id = EXCLUDED.chat_id, last_at = GREATEST(wa_web_known.last_at, EXCLUDED.last_at)`);
      continue;
    }

    rep.players++;
    const conv: any = await getOrCreateConversation(who.key, '', { channel: 'web', webChatId: who.chatId, phoneVerified: true });
    const msgs = await gw.history(chatId, perChat).catch(() => []);
    let oldest = Infinity;
    for (const m of msgs) {
      if (!m?.id || (await existsWamid(String(m.id)))) continue;
      oldest = Math.min(oldest, msgTs(m) || Infinity);
      if (m.fromMe) await storeImportedOutgoing(m, who);
      else await ingestInbound(toMetaMessage(m, who.key, null), [], 'web', { webChatId: who.chatId, phoneVerified: true, imported: true, suppressBot: true });
      rep.messages++;
    }
    const first = Number.isFinite(oldest) ? new Date(oldest) : firstAt;
    await db.execute(sql`UPDATE wa_conversations SET
        web_first_contact_at = LEAST(COALESCE(web_first_contact_at, ${first}), ${first}),
        web_chat_id = COALESCE(web_chat_id, ${who.chatId}),
        last_message_at = GREATEST(COALESCE(last_message_at, ${first}), ${new Date(chatTs(c) || first.getTime())})
      WHERE id = ${conv.id}`);
  }
  rep.at = new Date().toISOString();
  await setFlag('web_history_import', rep);
  console.log(`🗄️ WA web history import: ${rep.players} player chat(s), ${rep.messages} message(s), ${rep.others} other(s)`);
  return rep;
}

/** هل هذا الرقم «معروفٌ» لرقم الأعمال وليس لاعباً؟ (فيُفتح بالبوت مطفأً) */
export async function isKnownNonPlayer(localPhone: string): Promise<boolean> {
  const db = getDB(); if (!db) return false;
  const r: any = await db.execute(sql`SELECT 1 FROM wa_web_known WHERE phone = ${localPhone} LIMIT 1`).catch(() => null);
  return !!(r?.rows ?? r ?? [])[0];
}
