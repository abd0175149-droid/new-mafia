// ══════════════════════════════════════════════════════
// 🗄️ سجلّ رقم الأعمال — استرجاع ما فات + استيراد التاريخ
// ══════════════════════════════════════════════════════
// ١) catchUpWeb: بعد انقطاعٍ أطول من محاولات البوّابة (نشرٌ طويل، سقوط الخادم) نقرأ المحادثات
//    التي تحرّكت منذ آخر حدثٍ عالجناه ونُدخل ما لم يصلنا — بمنع التكرار بـwamid. في ٢٠ أيلول
//    ضاعت رسائل الحظر عند ميتا بلا رجعة؛ على الجلسة السجلّ عند الهاتف فيُسترجع.
// ٢) importWebHistory: مرآةٌ كاملة لمحادثات رقم الأعمال (قرار المالك 2026-10-24: «ما دام في محادثة
//    معه لازم تكون له محادثة بالوارد»). كلّ محادثة فرديّة ⟵ محادثةٌ في الوارد بتاريخها كاملاً (حتّى 2000)،
//    لاعباً كان أو لا — سياقاً بلا إشعار ولا بوت ولا غير مقروء. غير اللاعبين يُعلَّمون «معروفين» قبل فتح
//    محادثاتهم فتُفتح والبوت مطفأ (رقم الأعمال فيه محادثات موردين ومعارف — ردٌّ آليّ عليها يضرّ).

import { eq, sql } from 'drizzle-orm';
import { getDB } from '../../config/db.js';
import { waConversations, waMessages } from '../../schemas/admin.schema.js';
import { players } from '../../schemas/player.schema.js';
import { normalizeAnyPhone, firstRealName } from '../../utils/phone.util.js';
import * as gw from './openwa.client.js';
import { jidKind, resolveIdentity, toMetaMessage, SYSTEM_TYPES } from './web.inbound.js';
import { webConfigured } from './router.js';

/** مكالمات ورسائل نظام وما لا نعرف عرضه: لا تُستورد (كانت تظهر «رسالة غير مدعومة») */
function isSkippable(m: any): boolean {
  return SYSTEM_TYPES.has(String(m?.type || '').toLowerCase()) || toMetaMessage(m, '', null).type === 'unsupported';
}
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
      if (isSkippable(m)) continue;
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

export interface ImportReport { chats: number; players: number; others: number; messages: number; skipped: number; created: number; at: string; running?: boolean; done?: number; fetched?: number; error?: string }

/** معرّف الرسالة القصير (آخر مقطع) — نفس الرسالة قد تُخزَّن بمحادثة @c.us ثمّ تعود بمحادثة @lid */
const shortId = (id: string): string => String(id || '').split('_').pop() || '';

let importing = false;
export function importRunning(): boolean { return importing; }

/** مرآة رقم الأعمال في الوارد — كلّ المحادثات بتاريخها (مرّة، أو بطلبٍ صريح من «القنوات») */
/**
 * full: اجلب تاريخ كلّ محادثة. وإلّا (الافتراض) تُجلب فقط المحادثة الجديدة أو التي نشاطها على الهاتف أحدث من
 * آخر رسالةٍ عندنا — حدّ البوّابة ١٠٠٠ طلبٍ في الساعة (و١٠٠ في الدقيقة)، ومرآتان كاملتان متتاليتان استنفدتاه
 * فرُفضت الطلبات بـ429 (والإرسال من رقم الأعمال يمرّ بنفس الحدّ). onlyChats: محادثاتٌ بعينها.
 */
export async function importWebHistory(opts: { perChat?: number; maxChats?: number; force?: boolean; full?: boolean; onlyChats?: string[] } = {}): Promise<ImportReport> {
  const db = getDB();
  if (!db || !webConfigured()) throw new Error('رقم الأعمال غير مهيّأ');
  const s = await gw.session();
  if (!gw.isLinked(s)) throw new Error('رقم الأعمال غير مربوط بعد');
  const prev = await getFlag('web_history_import');
  if (prev?.at && !opts.force) return prev as ImportReport;
  if (importing) throw new Error('الاستيراد جارٍ الآن');
  importing = true;
  try {
    const perChat = Math.min(2000, Math.max(5, opts.perChat ?? 2000));
    const only = opts.onlyChats?.length ? new Set(opts.onlyChats) : null;
    const chats = (await gw.chats(opts.maxChats ?? 2000)).filter((c: any) => ['user', 'lid'].includes(jidKind(chatIdOf(c))) && !c.isGroup && (!only || only.has(chatIdOf(c))));
    const rep: ImportReport = { chats: chats.length, players: 0, others: 0, messages: 0, skipped: 0, created: 0, at: '', running: true, done: 0 };
    const { getOrCreateConversation, ingestInbound } = await import('../whatsapp-inbox.service.js');
    // منع التكرار بالمعرّف القصير: مجموعةٌ واحدة في الذاكرة بدل استعلامٍ لكلّ رسالة
    const seenR: any = await db.execute(sql`SELECT wamid FROM wa_messages WHERE wamid IS NOT NULL AND channel = 'web'`);
    const seen = new Set<string>((seenR?.rows ?? seenR ?? []).map((r: any) => shortId(r.wamid)));

    for (const c of chats) {
      rep.done = (rep.done || 0) + 1;
      if (rep.done % 25 === 0) await setFlag('web_history_import', rep).catch(() => {});
      const chatId = chatIdOf(c);
      const who = await resolveIdentity(chatId, null).catch(() => null);
      // معرّفٌ لم يُحلّ رقمه لا يطابق أيّ فلترٍ أو حجز — لا محادثة باسم مستعار
      if (!who || !who.verified) { rep.skipped++; continue; }
      const norm = normalizeAnyPhone(who.key);
      if (!norm) { rep.skipped++; continue; }
      const [pl] = norm.isJordanian
        ? await db.select({ id: players.id }).from(players).where(eq(players.phone, norm.local)).limit(1)
        : [];
      const firstAt = new Date(chatTs(c) || Date.now());
      if (pl) rep.players++;
      else {
        rep.others++;
        // «معروفٌ وليس لاعباً» قبل فتح محادثته ⟵ getOrCreateConversation يفتحها والبوت مطفأ
        await db.execute(sql`INSERT INTO wa_web_known (phone, chat_id, last_at) VALUES (${norm.local}, ${who.chatId}, ${firstAt})
          ON CONFLICT (phone) DO UPDATE SET chat_id = EXCLUDED.chat_id, last_at = GREATEST(wa_web_known.last_at, EXCLUDED.last_at)`);
      }
      const [ex] = await db.select({ id: waConversations.id }).from(waConversations).where(eq(waConversations.phone, norm.local)).limit(1);
      // الاسم على واتساب (ملفّه الشخصيّ) أوّلاً، ثمّ المحفوظ على هاتف الأعمال إن لم يكن «MC + رقم»
      const name = firstRealName(c.contact?.pushname, c.contact?.pushName, c.name, c.contact?.name);
      const conv: any = await getOrCreateConversation(who.key, pl ? '' : name, { channel: 'web', webChatId: who.chatId, phoneVerified: true });
      if (!conv) { rep.skipped++; continue; }
      if (!ex) rep.created++;

      // جلبٌ عند الحاجة فقط: محادثةٌ جديدة، أو طلبٌ صريح، أو نشاطٌ على الهاتف بعد آخر رسالةٍ عندنا
      if (ex && !opts.full && !only) {
        const lr: any = await db.execute(sql`SELECT MAX(created_at) AS at FROM wa_messages WHERE conversation_id = ${conv.id} AND channel = 'web'`);
        const lastWeb = (lr?.rows ?? lr ?? [])[0]?.at;
        if (lastWeb && chatTs(c) <= new Date(lastWeb).getTime() + 60e3) continue;
      }
      let msgs: any[];
      try { msgs = await gw.history(chatId, perChat, perChat > 100); rep.fetched = (rep.fetched || 0) + 1; }
      catch (e: any) {
        // 429 = حدّ البوّابة: توقّفٌ فوريّ — الاستمرار يحرق الحصّة ويعطّل الإرسال، و«فارغ» كان يُخفي الرفض
        if (e?.status === 429 || /429|Too Many/i.test(String(e?.message || e))) { rep.error = 'حدّ طلبات البوّابة (429) — أعد المحاولة بعد ساعة'; break; }
        rep.skipped++; continue;
      }
      for (const m of msgs) {
        if (!m?.id || seen.has(shortId(String(m.id))) || (await existsWamid(String(m.id)))) continue;
        if (isSkippable(m)) continue;
        if (m.fromMe) await storeImportedOutgoing(m, who);
        else await ingestInbound(toMetaMessage(m, who.key, null), [], 'web', { webChatId: who.chatId, phoneVerified: true, imported: true, suppressBot: true });
        seen.add(shortId(String(m.id)));
        rep.messages++;
      }
      // ملخّص المحادثة من رسائلها على رقم الأعمال: أوّل تواصل، آخر وارد، وآخر رسالةٍ ومعاينتها
      // (لا يُمسّ last_inbound_at — نافذة ميتا تُحسب منه احتياطاً، والمستورد ليس وارداً على ميتا)
      await db.execute(sql`UPDATE wa_conversations c SET
          web_first_contact_at = LEAST(COALESCE(c.web_first_contact_at, x.first_at), x.first_at),
          web_chat_id = COALESCE(c.web_chat_id, ${who.chatId}),
          web_last_inbound_at = GREATEST(c.web_last_inbound_at, x.last_in),
          last_message_preview = CASE WHEN c.last_message_at IS NULL OR x.last_at > c.last_message_at THEN x.last_body ELSE c.last_message_preview END,
          last_message_at = GREATEST(c.last_message_at, x.last_at)
        FROM (SELECT MIN(m.created_at) AS first_at, MAX(m.created_at) AS last_at,
                     MAX(m.created_at) FILTER (WHERE m.direction = 'in') AS last_in,
                     (SELECT LEFT(l.body, 120) FROM wa_messages l WHERE l.conversation_id = ${conv.id} AND l.deleted_at IS NULL AND l.msg_type <> 'reaction'
                       ORDER BY l.created_at DESC, l.id DESC LIMIT 1) AS last_body
                FROM wa_messages m WHERE m.conversation_id = ${conv.id} AND m.channel = 'web') x
        WHERE c.id = ${conv.id} AND x.last_at IS NOT NULL`);
    }
    rep.at = new Date().toISOString();
    rep.running = false;
    await setFlag('web_history_import', rep);
    console.log(`🗄️ WA web mirror: ${rep.chats} chat(s) — ${rep.created} new conversation(s), ${rep.messages} message(s), ${rep.players} player(s), ${rep.others} other(s), ${rep.skipped} skipped`);
    return rep;
  } finally {
    importing = false;
  }
}

/**
 * مفتاح «القنوات» webBotKnown على المحادثات القائمة: يشغّل البوت (أو يطفئه) دفعةً على محادثات غير اللاعبين
 * «المعروفين» لرقم الأعمال — ما عدا محادثةً آخرُ ضغطةٍ يدويّة عليها (🤖 في الوارد) عكسُ المطلوب: اختيار الموظّف يُحترم.
 * لا يُرسل شيئاً — البوت يردّ حين يراسلون. يعيد عدد المحادثات التي تغيّرت.
 */
export async function applyKnownBotSetting(on: boolean): Promise<number> {
  const db = getDB(); if (!db) return 0;
  const r: any = await db.execute(sql`UPDATE wa_conversations c SET bot_enabled = ${on}, updated_at = NOW()
    WHERE c.bot_enabled = ${!on} AND c.player_id IS NULL AND c.phone NOT LIKE 'lid:%'
      AND EXISTS (SELECT 1 FROM wa_web_known k WHERE k.phone = c.phone)
      AND NOT EXISTS (
        SELECT 1 FROM (
          SELECT DISTINCT ON (details->>'conversationId') details->>'conversationId' AS cid, (details->>'enabled')::boolean AS en
            FROM staff_action_log WHERE action = 'rest:wa-bot-toggle'
           ORDER BY details->>'conversationId', created_at DESC) t
         WHERE t.cid = c.id::text AND t.en = ${!on})
    RETURNING c.id`);
  return (r?.rows ?? r ?? []).length;
}

/** هل هذا الرقم «معروفٌ» لرقم الأعمال وليس لاعباً؟ (فيُفتح بالبوت مطفأً) */
export async function isKnownNonPlayer(localPhone: string): Promise<boolean> {
  const db = getDB(); if (!db) return false;
  const r: any = await db.execute(sql`SELECT 1 FROM wa_web_known WHERE phone = ${localPhone} LIMIT 1`).catch(() => null);
  return !!(r?.rows ?? r ?? [])[0];
}
