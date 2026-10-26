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

import { sql, type SQL } from 'drizzle-orm';
import { getDB } from '../../config/db.js';
import { normalizeAnyPhone, isMissingName, firstRealName, nameKey } from '../../utils/phone.util.js';
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
/** شرط SQL «يطابق الفلتر» على تعبير رقمٍ محلّيّ. all ⟵ TRUE
 *  [since] (لـ two_way وحده): «راسلَنا منذ…» — على **آخر** وارد (inbound_at يُكتب عند كلّ
 *  رسالةٍ منه، والتاريخ المسترجَع من الهاتف بوقته الأصليّ). دقيقٌ لـ«آخر N يوماً» و«منذ
 *  تاريخ»، ولا يصلح لفترةٍ مغلقة في الماضي: من راسلنا فيها ثمّ عاد أمس يُحسب «أمس». */
export function lineFilterSql(phoneExpr: any, filter: LineFilter, since?: SQL | null) {
  if (filter === 'all') return sql`TRUE`;
  const warm = sql`(lc.inbound_at IS NOT NULL OR lc.chat_exists)`;
  const cond = filter === 'two_way' ? (since ? sql`lc.inbound_at >= ${since}` : sql`lc.inbound_at IS NOT NULL`) : warm;
  return sql`EXISTS (SELECT 1 FROM wa_line_contacts lc WHERE lc.phone = ${phoneExpr} AND ${cond})`;
}

/** «منذ متى راسلَنا» من الطلب: عدد أيّامٍ (1–3650) أو تاريخ YYYY-MM-DD يبدأ منتصف ليل عمّان.
 *  inbound_at ‹timestamp› بتوقيت UTC (الحاوية UTC) — فالتاريخ يُحوَّل لا يُقارن نصّاً.
 *  قيمةٌ غير صالحة ⟵ null = «أيّ وقت»، لا خطأ يوقف البثّ. */
export function lineSinceSql(raw: unknown): SQL | null {
  const s = String(raw ?? '').trim();
  if (/^\d{1,4}$/.test(s)) {
    const n = Number(s);
    return n >= 1 && n <= 3650 ? sql`NOW() - make_interval(days => ${n})` : null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))) {
    return sql`((${s}::date)::timestamp AT TIME ZONE 'Asia/Amman') AT TIME ZONE 'UTC'`;
  }
  return null;
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
      await upsert(local, { waId: chatId, chatExists: true, lastChatAt: new Date(chatTs(c) || Date.now()), unread: Number(c.unreadCount || 0), name: firstRealName(c.contact?.pushname, c.contact?.pushName, c.name), source: 'chatlist' });
      st.added++;
    }
    lastSync = { ...st, running: false };
    await saveFlag();
    console.log(`📇 WA line roster sync: ${st.added} contact(s) from ${st.chats} chat(s), ${st.resolved} lid resolved`);
    // لاعبٌ سجّل بعد أن راسلنا ⟵ يُربط؛ ثمّ الجدد بلا اسم: من واتساب
    void fillMissingNames().catch(() => null).then(() => linkConversationsToPlayers()).catch(() => {});
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
// 🔗 ربط المحادثات باللاعبين — مسحٌ كامل بالأرقام الموحّدة
// ══════════════════════════════════════════════════════
// كلّ محادثةٍ غير مربوطة يُوحَّد رقمها ويُطابَق بأرقام اللاعبين الموحّدة (لا بالنصّ المخزّن: عربيّ-هنديّ، «+962 …»،
// بلا صفر). عند المطابقة: player_id + اسم اللاعب اسماً للمحادثة + سجلّ جهات الخطّ. رقمٌ يطابق لاعبَين ⟵ لا ربط (يُعدّ).
let linking = false;
export interface LinkState { at: string; checked: number; linked: number; ambiguous: number; rosterLinked: number; typoLinked: number; typoSkipped: number }

/** رقمان يختلفان بخانةٍ واحدة (زيادة أو نقص أو تبديل) — أرقام لاعبين حُفظت بخطأ إملائيّ */
function oneDigitApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false; return d === 1; }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  for (let i = 0; i < l.length; i++) if (l.slice(0, i) + l.slice(i + 1) === s) return true;
  return false;
}
const latinDigits = (s: any) => String(s || '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g, '');
/** الاسمان لشخصٍ واحد؟ تامّ بعد التطبيع، أو الاسم الأوّل نفسه (٣ أحرف فأكثر) */
function sameName(a: string, b: string): boolean {
  const A = nameKey(a), B = nameKey(b);
  if (!A || !B) return false;
  if (A === B) return true;
  const fa = A.split(' ')[0], fb = B.split(' ')[0];
  return fa.length >= 3 && fa === fb;
}

export async function linkConversationsToPlayers(): Promise<LinkState | null> {
  const db = getDB(); if (!db || linking) return null;
  linking = true;
  const st: LinkState = { at: new Date().toISOString(), checked: 0, linked: 0, ambiguous: 0, rosterLinked: 0, typoLinked: 0, typoSkipped: 0 };
  try {
    const byPhone = new Map<string, Array<{ id: number; name: string }>>();
    for (const p of rowsOf(await db.execute(sql`SELECT id, name, phone FROM players WHERE deleted_at IS NULL AND COALESCE(phone, '') <> ''`))) {
      const k = normalizeAnyPhone(p.phone)?.local;
      if (!k) continue;
      const list = byPhone.get(k) || [];
      list.push({ id: Number(p.id), name: String(p.name || '') });
      byPhone.set(k, list);
    }
    const convs = rowsOf(await db.execute(sql`SELECT id, phone FROM wa_conversations WHERE player_id IS NULL AND phone NOT LIKE 'lid:%'`));
    st.checked = convs.length;
    for (const c of convs) {
      const k = normalizeAnyPhone(c.phone)?.local;
      const hits = k ? byPhone.get(k) : undefined;
      if (!hits?.length) continue;
      if (hits.length > 1) { st.ambiguous++; continue; }
      const pl = hits[0];
      await db.execute(sql`UPDATE wa_conversations SET player_id = ${pl.id},
          display_name = CASE WHEN ${pl.name} <> '' THEN ${pl.name.slice(0, 150)} ELSE display_name END, updated_at = NOW()
        WHERE id = ${c.id} AND player_id IS NULL`);
      st.linked++;
    }
    // ٢) أرقام لاعبين محفوظة بخطأ (لا تتوحّد، أو أجنبيّةٌ بصيغةٍ محلّيّة): تُربط بدليلين معاً — رقم المحادثة يختلف
    //    عنها بخانةٍ واحدة (أو يطابق أرقامها التسعة الأخيرة لأجنبيّ) **و**اسمه على واتساب يطابق اسم اللاعب.
    //    مرشّحٌ واحد فقط وإلّا لا ربط؛ ولاعبٌ مربوطٌ أصلاً بمحادثةٍ أخرى لا يُعاد ربطه.
    const linkedPids = new Set(rowsOf(await db.execute(sql`SELECT DISTINCT player_id FROM wa_conversations WHERE player_id IS NOT NULL`)).map((r: any) => Number(r.player_id)));
    const odd = rowsOf(await db.execute(sql`SELECT id, name, phone FROM players WHERE deleted_at IS NULL AND COALESCE(phone, '') <> ''`))
      .filter((p: any) => { const n = normalizeAnyPhone(p.phone); return (!n || (!n.isJordanian && latinDigits(p.phone).startsWith('0'))) && !linkedPids.has(Number(p.id)); });
    const open = rowsOf(await db.execute(sql`SELECT id, phone, display_name FROM wa_conversations WHERE player_id IS NULL AND phone NOT LIKE 'lid:%'`));
    for (const c of open) {
      const cd = latinDigits(c.phone);
      const hits = odd.filter((p: any) => {
        const pd = latinDigits(p.phone);
        if (pd.length < 8) return false;
        const near = oneDigitApart(pd, cd) || (pd.startsWith('0') && !cd.startsWith('0') && cd.endsWith(pd.slice(1)) && cd.length - (pd.length - 1) <= 4);
        return near && sameName(c.display_name, p.name);
      });
      if (hits.length !== 1) { if (hits.length > 1) st.typoSkipped++; continue; }
      const pl = hits[0];
      await db.execute(sql`UPDATE wa_conversations SET player_id = ${Number(pl.id)}, display_name = ${String(pl.name || '').slice(0, 150) || c.display_name}, updated_at = NOW()
        WHERE id = ${c.id} AND player_id IS NULL`);
      linkedPids.add(Number(pl.id));
      st.typoLinked++;
    }
    // سجلّ جهات الخطّ: من محادثته المربوطة، أو مباشرةً بالرقم الموحّد
    const r1: any = await db.execute(sql`UPDATE wa_line_contacts lc SET player_id = c.player_id, updated_at = NOW()
      FROM wa_conversations c WHERE c.phone = lc.phone AND c.player_id IS NOT NULL AND lc.player_id IS NULL RETURNING lc.phone`);
    st.rosterLinked = rowsOf(r1).length;
    for (const lc of rowsOf(await db.execute(sql`SELECT phone FROM wa_line_contacts WHERE player_id IS NULL`))) {
      const k = normalizeAnyPhone(lc.phone)?.local;
      const hits = k ? byPhone.get(k) : undefined;
      if (hits?.length === 1) { await db.execute(sql`UPDATE wa_line_contacts SET player_id = ${hits[0].id}, updated_at = NOW() WHERE phone = ${lc.phone}`); st.rosterLinked++; }
    }
    await db.execute(sql`INSERT INTO wa_runtime_flags (key, value, updated_at) VALUES ('players_link', ${JSON.stringify(st)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`).catch(() => {});
    // ٣) المربوطون: اسم اللاعب اسماً للمحادثة إن كان المخزّن فارغاً أو «MC + رقم»
    for (const r of rowsOf(await db.execute(sql`SELECT c.id, c.display_name, p.name FROM wa_conversations c JOIN players p ON p.id = c.player_id WHERE COALESCE(p.name, '') <> ''`))) {
      if (isMissingName(r.display_name)) await db.execute(sql`UPDATE wa_conversations SET display_name = ${String(r.name).slice(0, 150)} WHERE id = ${r.id}`);
    }
    console.log(`🔗 WA link players: ${st.linked} by number + ${st.typoLinked} by typo+name of ${st.checked}, ${st.ambiguous} ambiguous, roster ${st.rosterLinked}`);
    return st;
  } finally {
    linking = false;
  }
}

// ══════════════════════════════════════════════════════
// 🪪 الأسماء الناقصة — من واتساب نفسه
// ══════════════════════════════════════════════════════
// جهةٌ غير محفوظة على هاتف الأعمال يعيد واتساب عنوانَ محادثتها رقمَها المنسّق، فخُزّن الرقم «اسماً».
// الحلّ من البوّابة: الاسم المحفوظ على الهاتف إن وُجد، وإلّا اسم ملفّه الشخصيّ (pushName — يضعه هو).
// لا يمسّ اسماً حقيقيّاً ولا اسم لاعبٍ مربوط؛ اللاعب يأخذ اسم ملفّه في النظام بلا طلب. يتوقّف عند 429.
let filling = false;
export interface NamesFillState { at: string; candidates: number; filled: number; players: number; noName: number; errors: number; stopped?: string }

export async function fillMissingNames(): Promise<NamesFillState | null> {
  const db = getDB(); if (!db || filling || !webConfigured() || !isWebReady()) return null;
  filling = true;
  const st: NamesFillState = { at: new Date().toISOString(), candidates: 0, filled: 0, players: 0, noName: 0, errors: 0 };
  try {
    // ١) اللاعب: اسم ملفّه في النظام (بلا بوّابة)
    const pr: any = await db.execute(sql`SELECT c.id, c.display_name, p.name FROM wa_conversations c JOIN players p ON p.id = c.player_id
      WHERE COALESCE(p.name, '') <> ''`);
    for (const r of rowsOf(pr).filter((x: any) => isMissingName(x.display_name))) {
      await db.execute(sql`UPDATE wa_conversations SET display_name = ${String(r.name).trim().slice(0, 150)} WHERE id = ${r.id}`);
      st.players++;
    }
    // ٢) غيرهم على خطّ الأعمال: من واتساب
    const cr: any = await db.execute(sql`SELECT c.id, c.phone, c.wa_phone, c.web_chat_id, c.display_name, lc.wa_id
        FROM wa_conversations c LEFT JOIN wa_line_contacts lc ON lc.phone = c.phone
       WHERE c.player_id IS NULL AND c.phone NOT LIKE 'lid:%'
         AND (c.web_chat_id IS NOT NULL OR lc.phone IS NOT NULL OR EXISTS (SELECT 1 FROM wa_messages m WHERE m.conversation_id = c.id AND m.channel = 'web'))`);
    const cands = rowsOf(cr).filter((r: any) => isMissingName(r.display_name));
    st.candidates = cands.length;
    for (const r of cands) {
      const jid = String(r.web_chat_id || r.wa_id || (r.wa_phone ? `${r.wa_phone}@c.us` : ''));
      if (!jid) { st.noName++; continue; }
      try {
        const info = await gw.contactInfo(jid);   // متباعدٌ داخل العميل (bulk)
        // الاسم على واتساب (يضعه صاحبه) أوّلاً؛ ثمّ المحفوظ على هاتف الأعمال ما لم يكن «MC + رقم»
        const name = firstRealName(info?.pushName, info?.name);
        if (!name) {
          // لا اسم على واتساب ولا محفوظ: الرقم نفسه يُعرض (الواجهة) — لا «MC + رقم» ولا بقايا رقمٍ منسّق
          if (String(r.display_name || '').trim()) {
            await db.execute(sql`UPDATE wa_conversations SET display_name = '', updated_at = NOW() WHERE id = ${r.id}`);
            await db.execute(sql`UPDATE wa_line_contacts SET name = NULL, updated_at = NOW() WHERE phone = ${r.phone}`);
          }
          st.noName++; continue;
        }
        await db.execute(sql`UPDATE wa_conversations SET display_name = ${name}, updated_at = NOW() WHERE id = ${r.id}`);
        await db.execute(sql`UPDATE wa_line_contacts SET name = ${name}, updated_at = NOW() WHERE phone = ${r.phone}`);
        st.filled++;
      } catch (e: any) {
        if (e?.status === 429 || /429|Too Many/i.test(String(e?.message || e))) { st.stopped = 'حدّ طلبات البوّابة (429)'; break; }
        st.errors++;
      }
    }
    // ٣) جهات السجلّ بلا اسم ولها محادثة صار لها اسم الآن
    for (const r of rowsOf(await db.execute(sql`SELECT lc.phone, lc.name, c.display_name FROM wa_line_contacts lc JOIN wa_conversations c ON c.phone = lc.phone`))) {
      if (isMissingName(r.name) && !isMissingName(r.display_name)) await db.execute(sql`UPDATE wa_line_contacts SET name = ${r.display_name}, updated_at = NOW() WHERE phone = ${r.phone}`);
    }
    await db.execute(sql`INSERT INTO wa_runtime_flags (key, value, updated_at) VALUES ('line_names_fill', ${JSON.stringify(st)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`).catch(() => {});
    console.log(`🪪 WA names fill: ${st.filled}/${st.candidates} from WhatsApp, ${st.players} player(s), ${st.noName} without a name${st.stopped ? ` — ${st.stopped}` : ''}`);
    return st;
  } finally {
    filling = false;
  }
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
