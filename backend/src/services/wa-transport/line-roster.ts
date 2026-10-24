// ══════════════════════════════════════════════════════
// 📇 سجلّ جهات خطّ الأعمال — مَن يملك الخطّ محادثةً معه فعلاً
// ══════════════════════════════════════════════════════
// الركيزة الأساسيّة: جدولٌ واحد مفتاحه الرقم، يقول لكلّ رقمٍ مستوى قربه من خطّ الأعمال.
// يُبنى من قائمة محادثات الخطّ (GET /chats)، ويتحدّث يوميّاً، وكلّ ما يُرسل في النظام يسأله:
//   two_way  (راسلَنا)            inbound_at ≠ فارغ — أرسل لنا ولو رسالةً واحدة في أيّ وقت (المباشر + التاريخ المسترجَع)
//   has_chat (منّا فقط)           chat_exists بلا وارد — خيطٌ فيه رسائلنا وحدها، وينقسم في شاشة الجهات إلى:
//       never   history_state = complete — التاريخ كاملٌ بين أيدينا: لم يراسلنا قطّ
//       partial غير ذلك — تاريخٌ أقدم بقي على الهاتف لم يُسترجع، فلا نجزم
//   on_whatsapp / no_whatsapp     ليس في السجلّ — من wa_number_checks
// «دافئ» = two_way ∪ has_chat. و«بارد» = ليس دافئاً (سبب الحظر). والأأمن = two_way وحده.

import { sql } from 'drizzle-orm';
import { getDB } from '../../config/db.js';
import { normalizeAnyPhone } from '../../utils/phone.util.js';
import { isWebReady, webConfigured } from './router.js';
import { jidKind } from './web.inbound.js';
import * as gw from './openwa.client.js';
import type { LineFilter } from './types.js';

export type LineStatus = 'two_way' | 'has_chat' | 'on_whatsapp' | 'no_whatsapp' | 'unknown';
const rowsOf = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);
const jidUser = (jid: string) => String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');

// ══════════════════════════════════════════════════════
// الفلتر المشترك — شرطٌ واحد تستعمله كلّ الصفحات
// ══════════════════════════════════════════════════════
/** شرط SQL «يطابق الفلتر» على تعبير رقمٍ محلّيّ. all ⟵ TRUE */
export function lineFilterSql(phoneExpr: any, filter: LineFilter) {
  if (filter === 'all') return sql`TRUE`;
  const warm = sql`(lc.inbound_at IS NOT NULL OR lc.chat_exists)`;
  const cond = filter === 'two_way' ? sql`lc.inbound_at IS NOT NULL` : warm;
  return sql`EXISTS (SELECT 1 FROM wa_line_contacts lc WHERE lc.phone = ${phoneExpr} AND ${cond})`;
}

/** حالة القرب لمجموعة أرقام محلّيّة — للعرض والتصنيف في الصفحات */
export async function lineStatusOf(locals: string[]): Promise<Map<string, LineStatus>> {
  const out = new Map<string, LineStatus>();
  const db = getDB();
  if (!db || !locals.length) return out;
  const inList = sql.join(locals.map(p => sql`${p}`), sql`, `);
  const r: any = await db.execute(sql`
    SELECT lc.phone,
      CASE WHEN lc.inbound_at IS NOT NULL THEN 'two_way'
           WHEN lc.chat_exists THEN 'has_chat' END AS st
    FROM wa_line_contacts lc WHERE lc.phone IN (${inList})`);
  for (const x of rowsOf(r)) if (x.st) out.set(String(x.phone), x.st as LineStatus);
  // من ليس في السجلّ: نكمّل من wa_number_checks (على واتساب / ليس عليه)
  const missing = locals.filter(p => !out.has(p));
  if (missing.length) {
    const nc: any = await db.execute(sql`SELECT phone, on_wa FROM wa_number_checks WHERE phone IN (${sql.join(missing.map(p => sql`${p}`), sql`, `)})`);
    for (const x of rowsOf(nc)) out.set(String(x.phone), x.on_wa ? 'on_whatsapp' : 'no_whatsapp');
  }
  return out;
}

/** هل هذا الرقم «بارد» (ليس دافئاً في السجلّ)؟ — تعريفٌ واحد للطابور والفلتر */
export async function isColdLocal(local: string): Promise<boolean> {
  const db = getDB(); if (!db || !local) return true;
  const r: any = await db.execute(sql`SELECT 1 FROM wa_line_contacts lc
    WHERE lc.phone = ${local} AND (lc.inbound_at IS NOT NULL OR lc.chat_exists) LIMIT 1`);
  return rowsOf(r).length === 0;
}

// ══════════════════════════════════════════════════════
// الروافد: upsert من قائمة المحادثات، ومن الوارد، ومن الصادر
// ══════════════════════════════════════════════════════
async function upsert(local: string, patch: { waId?: string | null; chatExists?: boolean; inbound?: boolean; outbound?: boolean; lastChatAt?: Date | null; unread?: number | null; name?: string | null; source: string }): Promise<void> {
  // معرّفٌ مستعار لم يُحلّ رقمه لا يطابقه أيّ فلترٍ بالرقم — يُسجَّل حين يُعرف الرقم لا قبله
  const db = getDB(); if (!db || !local || local.startsWith('lid:')) return;
  const norm = normalizeAnyPhone(local);
  const phone = norm?.local || local;
  const [pl] = norm?.isJordanian
    ? rowsOf(await db.execute(sql`SELECT id FROM players WHERE phone = ${phone} LIMIT 1`))
    : [];
  await db.execute(sql`INSERT INTO wa_line_contacts (phone, wa_id, chat_exists, inbound_at, first_inbound_at, inbound_count, outbound_at, last_chat_at, unread, name, player_id, source, synced_at, updated_at)
    VALUES (${phone}, ${patch.waId ?? null}, ${patch.chatExists ?? false},
            ${patch.inbound ? sql`NOW()` : sql`NULL`}, ${patch.inbound ? sql`NOW()` : sql`NULL`}, ${patch.inbound ? 1 : 0},
            ${patch.outbound ? sql`NOW()` : sql`NULL`},
            ${patch.lastChatAt ?? null}, ${patch.unread ?? 0}, ${patch.name ?? null}, ${pl?.id ?? null}, ${patch.source}, NOW(), NOW())
    ON CONFLICT (phone) DO UPDATE SET
      wa_id = COALESCE(EXCLUDED.wa_id, wa_line_contacts.wa_id),
      chat_exists = wa_line_contacts.chat_exists OR EXCLUDED.chat_exists,
      inbound_at = ${patch.inbound ? sql`NOW()` : sql`wa_line_contacts.inbound_at`},
      first_inbound_at = ${patch.inbound ? sql`COALESCE(wa_line_contacts.first_inbound_at, NOW())` : sql`wa_line_contacts.first_inbound_at`},
      inbound_count = wa_line_contacts.inbound_count + ${patch.inbound ? 1 : 0},
      outbound_at = ${patch.outbound ? sql`NOW()` : sql`wa_line_contacts.outbound_at`},
      last_chat_at = GREATEST(wa_line_contacts.last_chat_at, EXCLUDED.last_chat_at),
      unread = COALESCE(EXCLUDED.unread, wa_line_contacts.unread),
      name = COALESCE(NULLIF(EXCLUDED.name, ''), wa_line_contacts.name),
      player_id = COALESCE(EXCLUDED.player_id, wa_line_contacts.player_id),
      synced_at = NOW(), updated_at = NOW()`).catch(e => console.warn('⚠️ roster upsert:', e?.message));
}

/** وارد على الخطّ ⟵ راسلَنا (two_way) + خيطٌ قائم */
export async function noteInbound(local: string, waId?: string | null, name?: string | null): Promise<void> {
  await upsert(local, { waId, chatExists: true, inbound: true, name, source: 'inbound' });
}
/** أوّل صادرٍ منّا نجح ⟵ خيطٌ قائم، فلم يعُد بارداً */
export async function noteOutbound(local: string, waId?: string | null): Promise<void> {
  await upsert(local, { waId, chatExists: true, outbound: true, source: 'outbound' });
}

// ══════════════════════════════════════════════════════
// المزامنة من قائمة محادثات الخطّ (يوميّاً + عند الربط)
// ══════════════════════════════════════════════════════
const chatIdOf = (c: any): string => String(c?.id?._serialized || c?.id || c?.chatId || '');
const chatTs = (c: any): number => Number(c?.timestamp || c?.t || 0) * 1000;

let syncing = false;
export interface SyncState { running: boolean; at: string | null; chats: number; added: number; resolved: number; error: string | null }
let lastSync: SyncState = { running: false, at: null, chats: 0, added: 0, resolved: 0, error: null };
export function syncState(): SyncState { return { ...lastSync, running: syncing }; }

export async function syncLineContacts(opts: { max?: number } = {}): Promise<SyncState> {
  if (syncing || !webConfigured() || !isWebReady()) return syncState();
  syncing = true;
  const st: SyncState = { running: true, at: new Date().toISOString(), chats: 0, added: 0, resolved: 0, error: null };
  try {
    const raw = await gw.chats(opts.max ?? 2000);
    const list = (Array.isArray(raw) ? raw : []).filter((c: any) => ['user', 'lid'].includes(jidKind(chatIdOf(c))) && !c.isGroup);
    st.chats = list.length;
    for (const c of list) {
      const chatId = chatIdOf(c);
      let local: string | null = null;
      if (jidKind(chatId) === 'user') { local = normalizeAnyPhone(jidUser(chatId))?.local || null; }
      else {
        const phone = await gw.resolvePhone(chatId);   // متباعدٌ 700ms داخل العميل
        if (phone) { local = normalizeAnyPhone(phone)?.local || null; st.resolved++; }
      }
      if (!local) continue;
      await upsert(local, { waId: chatId, chatExists: true, lastChatAt: new Date(chatTs(c) || Date.now()), unread: Number(c.unreadCount || 0), name: String(c.name || '').slice(0, 150), source: 'chatlist' });
      st.added++;
    }
    lastSync = { ...st, running: false };
    await saveFlag();
    console.log(`📇 WA line roster sync: ${st.added} contact(s) from ${st.chats} chat(s), ${st.resolved} lid resolved`);
  } catch (e: any) {
    st.error = String(e?.message || e);
    lastSync = { ...st, running: false };
    console.warn('⚠️ WA line roster sync:', st.error);
  } finally {
    syncing = false;
  }
  return syncState();
}

async function saveFlag(): Promise<void> {
  const db = getDB(); if (!db) return;
  await db.execute(sql`INSERT INTO wa_runtime_flags (key, value, updated_at) VALUES ('line_roster_sync', ${JSON.stringify(lastSync)}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`).catch(() => {});
}

// ══════════════════════════════════════════════════════
// الإحصاء والقائمة — لشاشة «جهات الخطّ»
// ══════════════════════════════════════════════════════
export async function rosterStats(): Promise<any> {
  const db = getDB(); if (!db) return null;
  const [s] = rowsOf(await db.execute(sql`SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE inbound_at IS NOT NULL)::int AS two_way,
      COUNT(*) FILTER (WHERE inbound_at IS NULL AND chat_exists)::int AS has_chat,
      COUNT(*) FILTER (WHERE inbound_at IS NULL AND chat_exists AND history_state = 'complete')::int AS never,
      COUNT(*) FILTER (WHERE inbound_at IS NULL AND chat_exists AND history_state IS DISTINCT FROM 'complete')::int AS partial,
      COUNT(*) FILTER (WHERE player_id IS NOT NULL)::int AS players,
      COUNT(*) FILTER (WHERE player_id IS NULL)::int AS others
    FROM wa_line_contacts`));
  const flags = rowsOf(await db.execute(sql`SELECT key, value FROM wa_runtime_flags WHERE key IN ('line_roster_sync', 'line_history_scan')`));
  const flag = (k: string) => flags.find((f: any) => f.key === k)?.value || null;
  return { ...s, lastSync: flag('line_roster_sync'), historyScan: flag('line_history_scan'), syncing };
}

/** حالة السطر في شاشة الجهات — أدقّ من LineStatus: «منّا فقط» تنقسم بحسب اكتمال التاريخ */
const ROW_STATUS = sql`CASE WHEN lc.inbound_at IS NOT NULL THEN 'two_way'
  WHEN lc.chat_exists AND lc.history_state = 'complete' THEN 'never'
  WHEN lc.chat_exists THEN 'partial' ELSE 'unknown' END`;

export async function rosterList(o: { q?: string; status?: 'two_way' | 'has_chat' | 'never' | 'partial' | ''; players?: 'all' | 'players' | 'others'; limit?: number; offset?: number }): Promise<any> {
  const db = getDB(); if (!db) return { rows: [], total: 0 };
  const conds: any[] = [];
  const q = String(o.q || '').trim();
  if (q) conds.push(sql`(lc.phone ILIKE ${'%' + q + '%'} OR lc.name ILIKE ${'%' + q + '%'})`);
  if (o.status === 'two_way') conds.push(sql`lc.inbound_at IS NOT NULL`);
  else if (o.status === 'has_chat') conds.push(sql`lc.inbound_at IS NULL AND lc.chat_exists`);
  else if (o.status === 'never') conds.push(sql`lc.inbound_at IS NULL AND lc.chat_exists AND lc.history_state = 'complete'`);
  else if (o.status === 'partial') conds.push(sql`lc.inbound_at IS NULL AND lc.chat_exists AND lc.history_state IS DISTINCT FROM 'complete'`);
  if (o.players === 'players') conds.push(sql`lc.player_id IS NOT NULL`);
  else if (o.players === 'others') conds.push(sql`lc.player_id IS NULL`);
  const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
  const limit = Math.min(Math.max(Number(o.limit) || 50, 1), 200);
  const offset = Math.max(Number(o.offset) || 0, 0);
  const [cnt] = rowsOf(await db.execute(sql`SELECT COUNT(*)::int AS n FROM wa_line_contacts lc ${where}`));
  const rows = rowsOf(await db.execute(sql`
    SELECT lc.phone, lc.name, lc.player_id, p.name AS player_name, lc.inbound_at, lc.chat_exists, lc.last_chat_at, lc.unread,
      lc.first_inbound_at, lc.inbound_count, lc.history_state, ${ROW_STATUS} AS status
    FROM wa_line_contacts lc LEFT JOIN players p ON p.id = lc.player_id
    ${where} ORDER BY GREATEST(lc.inbound_at, lc.last_chat_at) DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`));
  return { rows, total: Number(cnt?.n || 0), limit, offset };
}

// ══════════════════════════════════════════════════════
// المجدول اليوميّ (٤:٣٠ فجر عمّان) + عند الربط
// ══════════════════════════════════════════════════════
let timer: NodeJS.Timeout | null = null;
let lastDailyDay = '';
const JO = 3 * 3600e3;

export function startLineRosterSync(): void {
  if (timer || !webConfigured()) return;
  const tick = async () => {
    try {
      const jo = new Date(Date.now() + JO);
      const day = jo.toISOString().slice(0, 10);
      const mins = jo.getUTCHours() * 60 + jo.getUTCMinutes();
      // نافذة ٤:٣٠–٥:١٥ فجراً، مرّةً في اليوم
      if (mins >= 270 && mins < 315 && lastDailyDay !== day && isWebReady()) {
        lastDailyDay = day;
        await syncLineContacts();
      }
    } catch { /* تكميليّ */ }
  };
  timer = setInterval(() => { void tick(); }, 10 * 60e3);
  timer.unref?.();
  // بذرة لأوّل تشغيل بعد الربط: مزامنةٌ خفيفة إن لم يُزامَن اليوم
  setTimeout(() => { if (isWebReady()) void syncLineContacts().catch(() => {}); }, 90e3);
  console.log('📇 WA line roster scheduler started (daily 04:30 Amman)');
}
