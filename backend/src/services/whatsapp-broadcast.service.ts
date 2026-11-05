// ══════════════════════════════════════════════════════
// 📢 بثّ النوافذ المفتوحة — أُعيد بقرار المالك 2026-09-19 بقيودٍ صلبة
// ══════════════════════════════════════════════════════
// التاريخ: النسخة الأولى حُذفت في 38b4901 (2026-08-01) مع محرّك الحملات بعد تعطيل ميتا للحساب القديم.
// سبب التعطيل كان **القوالب التسويقيّة لأرقام لم تراسلنا** — لا هذا البثّ. لكنّ الرسائل غير المطلوبة
// هي ما يولّد البلاغات، فهذه النسخة مقيَّدة بالكود لا بالتعليمات:
//   • لا مسار إرسال خاصّ: كلّ رسالة تمرّ من sendMessage نفسها ⇒ حارس نافذة الـ24 ساعة وقفل الإرسال يسريان حرفيّاً.
//     لا قوالب، ولا مخاطبة لنافذة مغلقة، ولا رقم لم يراسلنا.
//   • المعتذرون (wa_optouts) مستبعدون إجباريّاً، وكلّ بثّ يُذيَّل بسطر «لإيقاف الرسائل أرسل: إيقاف».
//   • سقف: 300 مستلم (فاصل الـ12 ساعة أُلغي بقرار المالك 2026-09-20) كحدّ أقصى · رسالة كلّ ~1.3 ثانية.
//   • إيقاف تلقائيّ: قفل إرسال من ميتا أثناء البثّ، أو 5 إخفاقات متتالية، أو زرّ الإيقاف.
//   • كلّ بثّ يُسجَّل في wa_broadcasts وفي سجلّ عمليّات الموظّفين.

import { sql, eq, desc } from 'drizzle-orm';
import crypto from 'crypto';
import fsSync from 'fs';
import pathMod from 'path';
import { getDB } from '../config/db.js';
import { env } from '../config/env.js';
import { waBroadcasts, waMessageTemplates } from '../schemas/admin.schema.js';
import { sendMessage, sendingSuspendedReason, uploadWaMedia, WA_CAPTION_MAX, isUnreachable } from './whatsapp-inbox.service.js';
import { pickChannel, reachableSql, isWebReady } from './wa-transport/router.js';
import { transportSettings } from './wa-transport/settings.js';
import type { Channel, LineFilter } from './wa-transport/types.js';
import { lineFilterSql, lineSinceSql } from './wa-transport/line-roster.js';
import { isTestActivity, notTestActivitySql, notTestLocationSql } from './test-location.util.js';
import { getAux, setAux } from '../config/redis.js';

const rowsOf = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);
export const BROADCAST_MAX_TARGETS = 300;
/** على رقم الأعمال لا نافذة: الجمهور أوسع، والطابور (٢٥٠/يوم، ١٥–٤٥ث) هو الضابط لا هذا السقف */
export const BROADCAST_MAX_TARGETS_WEB = 1000;
function maxTargets(): number { return transportSettings().mode === 'cloud_only' ? BROADCAST_MAX_TARGETS : BROADCAST_MAX_TARGETS_WEB; }
const PACE_MS = 1300;
const WINDOW_MARGIN = "23 hours 45 minutes";
const OPTOUT_FOOTER = '\n\n— لإيقاف هذه الرسائل أرسل: إيقاف';
const RANK_AR: Record<string, string> = { INFORMANT: 'مُخبر', SOLDIER: 'جندي', CAPO: 'كابو', UNDERBOSS: 'ساعد الزعيم', GODFATHER: 'العرّاب' };

export type AudienceFilter = 'all' | 'players' | 'visitors' | 'booked_upcoming' | 'activity' | 'not_booked_activity' | 'played';
export interface AudienceQuery { filter: AudienceFilter; activityId?: number | null; excludeIds?: number[]; excludeBroadcastIds?: number[]; channel?: 'all' | Channel; lineFilter?: LineFilter;
  /** 🎲 «لعبوا معنا»: لعب في **أيٍّ** من هذه الفعاليّات السابقة */
  playedActivityIds?: number[] | null;
  /** مع «لعبوا معنا» وactivityId: ولم يحجز بعد في تلك الفعاليّة. بلا العلم تبقى activityId لمتغيّرات النصّ وحدها */
  playedNotBooked?: boolean;
  /** مع «راسلَنا» وحده: أيّامٌ («30») أو تاريخ («2026-10-01») — انظر lineSinceSql */
  lineSince?: string | null }

export const PLAYED_MAX_ACTIVITIES = 60;

/** معرّفات فعاليّاتٍ صالحة للبثّ عنها: أعدادٌ صحيحة، بلا تكرار، وبلا موقع اختبار */
async function cleanPlayedIds(db: any, ids: unknown): Promise<number[]> {
  const raw = Array.isArray(ids) ? ids : [];
  const nums = Array.from(new Set(raw.map(Number).filter(n => Number.isInteger(n) && n > 0))).slice(0, PLAYED_MAX_ACTIVITIES);
  if (!nums.length) return [];
  const r: any = await db.execute(sql`SELECT a.id FROM activities a
     WHERE a.id = ANY(${`{${nums.join(',')}}`}::int[]) AND a.deleted_at IS NULL AND ${sql.raw(notTestActivitySql('a'))}`);
  const ok = new Set(rowsOf(r).map((x: any) => Number(x.id)));
  return nums.filter(n => ok.has(n));
}

/**
 * 🎲 «لعب» في أيٍّ من الفعاليّات — التعريف نفسه في الفاتورة والحدّ الأدنى (fnb-invoice PLAYED_ROWS):
 * جلس في لعبةٍ بدأت (match_participants، منذ 2026-10-30) أو احتُسبت له مباراة (match_players — الأقدم).
 * الهويّة بالحساب: حساب المحادثة نفسه، أو حسابٌ هاتفه هاتف المحادثة (محادثةٌ لم تُربط بحسابها بعد).
 */
const playedAnySql = (ids: number[]) => {
  const lit = `{${ids.join(',')}}`;
  return sql`EXISTS (SELECT 1 FROM players pp
      WHERE (pp.id = c.player_id OR pp.phone = c.phone)
        AND (EXISTS (SELECT 1 FROM match_participants mpt WHERE mpt.player_id = pp.id AND mpt.activity_id = ANY(${lit}::int[]))
          OR EXISTS (SELECT 1 FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN sessions s ON s.id = m.session_id
                      WHERE mp.player_id = pp.id AND s.activity_id = ANY(${lit}::int[]))))`;
};

/** لم يحجز بعد في فعاليّة — لا في الحجوزات (عدا الملغاة) ولا في حجوزات التطبيق، بالرقم أو بحساب اللاعب */
const notBookedSql = (activityId: number) => sql`NOT EXISTS (SELECT 1 FROM reservations r WHERE r.deleted_at IS NULL AND r.activity_id = ${activityId} AND COALESCE(r.status, '') <> 'cancelled' AND (r.phone = c.phone OR (c.player_id IS NOT NULL AND r.player_id = c.player_id))) AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.deleted_at IS NULL AND b.activity_id = ${activityId} AND (b.phone = c.phone OR (c.player_id IS NOT NULL AND b.player_id = c.player_id)))`;

const stopFlags = new Set<number>();
let running: number | null = null;

export async function previewAudience(q: AudienceQuery) {
  const db = getDB(); if (!db) return { total: 0, rows: [] as any[] };
  // 🧪 موقع اختبار: فعاليّةٌ هناك بلا جمهور — لا معاينة ولا بثّ
  if (q.activityId && await isTestActivity(db, q.activityId)) return { total: 0, rows: [] as any[], capped: false };
  const f = q.filter || 'all';
  const playedIds = f === 'played' ? await cleanPlayedIds(db, q.playedActivityIds) : [];
  // 📇 فلتر خطّ الأعمال: على من يخرج عبر رقم الأعمال وحده (ميتا لها نافذتها). all ⟵ بلا قيد
  // 🔴 كان الإعفاء بقناة آخر وارد (c.channel = 'cloud') لا بالقناة التي سيخرج منها فعلاً: في «مزدوج»
  //    من آخر وارده على ميتا ونافذته مغلقة يخرج عبر رقم الأعمال — فكان يمرّ بلا فلتر (٧٩٦ بدل من راسلَنا).
  //    الآن: الاستعلام يضيّق (نافذة ميتا مفتوحة أو يجتاز الفلتر)، والحكم النهائيّ بعد pickChannel أدناه.
  const lf = (q.lineFilter || transportSettings().lineDefault) as LineFilter;
  const lineOk = lf === 'all' ? sql`TRUE` : lineFilterSql(sql`c.phone`, lf, lf === 'two_way' ? lineSinceSql(q.lineSince) : null);
  const lineGate = lf === 'all' ? sql`TRUE` : sql`(COALESCE(c.cloud_last_inbound_at, c.last_inbound_at) > NOW() - INTERVAL '24 hours' OR ${lineOk})`;
  const extra = f === 'players' ? sql`AND c.player_id IS NOT NULL`
    : f === 'visitors' ? sql`AND c.player_id IS NULL`
    // 🧪 موقع اختبار: حجزٌ هناك لا يُدخل صاحبه في «حجز قادم»
    : f === 'booked_upcoming' ? sql`AND (EXISTS (SELECT 1 FROM reservations r JOIN activities a ON a.id = r.activity_id WHERE r.deleted_at IS NULL AND a.date > NOW() AND ${sql.raw(notTestActivitySql('a'))} AND (r.phone = c.phone OR (c.player_id IS NOT NULL AND r.player_id = c.player_id))) OR EXISTS (SELECT 1 FROM bookings b JOIN activities a ON a.id = b.activity_id WHERE b.deleted_at IS NULL AND a.date > NOW() AND ${sql.raw(notTestActivitySql('a'))} AND (b.phone = c.phone OR (c.player_id IS NOT NULL AND b.player_id = c.player_id))))`
    : f === 'activity' && q.activityId ? sql`AND (EXISTS (SELECT 1 FROM reservations r WHERE r.deleted_at IS NULL AND r.activity_id = ${Number(q.activityId)} AND (r.phone = c.phone OR (c.player_id IS NOT NULL AND r.player_id = c.player_id))) OR EXISTS (SELECT 1 FROM bookings b WHERE b.deleted_at IS NULL AND b.activity_id = ${Number(q.activityId)} AND (b.phone = c.phone OR (c.player_id IS NOT NULL AND b.player_id = c.player_id))))`
    // من نافذته مفتوحة ولم يحجز بعد في فعاليّة بعينها — لا في الحجوزات ولا في حجوزات التطبيق، بالرقم أو بحساب اللاعب
    : f === 'not_booked_activity' && q.activityId ? sql`AND ${notBookedSql(Number(q.activityId))}`
    // 🎲 لعب معنا في أيٍّ من الفعاليّات المختارة — ومع فعاليّةٍ قادمة: ولم يحجز فيها بعد
    : f === 'played' && playedIds.length ? (q.activityId && q.playedNotBooked === true
        ? sql`AND ${playedAnySql(playedIds)} AND ${notBookedSql(Number(q.activityId))}`
        : sql`AND ${playedAnySql(playedIds)}`)
    : (f === 'activity' || f === 'not_booked_activity' || f === 'played') ? sql`AND false`   // فلتر فعاليّة بلا فعاليّة مختارة ⟵ لا أحد (لا «الكلّ» بالخطأ)
    : sql``;
  // استثناء من وصلهم بثّ سابق: من جدول المستلمين، ومن رسائل البثّ ضمن زمن ذلك البثّ (للبثوث الأقدم من الجدول)
  const exB = (q.excludeBroadcastIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 10);
  const exBLit = `{${exB.join(',')}}`;
  const notSentBefore = exB.length ? sql`AND NOT EXISTS (SELECT 1 FROM wa_broadcast_recipients br WHERE br.conversation_id = c.id AND br.broadcast_id = ANY(${exBLit}::int[]))
       AND NOT EXISTS (SELECT 1 FROM wa_messages m JOIN wa_broadcasts b ON b.id = ANY(${exBLit}::int[]) WHERE m.conversation_id = c.id AND m.source = 'broadcast' AND m.created_at >= b.created_at AND m.created_at <= COALESCE(b.finished_at, NOW()) + INTERVAL '1 minute')` : sql``;
  const r: any = await db.execute(sql`
    SELECT c.id, c.phone, c.wa_phone, c.channel, c.channel_pin, c.cloud_last_inbound_at, c.web_chat_id,
           c.display_name, c.player_id, c.last_inbound_at, p.name AS player_name, p.rank_tier,
           ${lineOk} AS line_ok
      FROM wa_conversations c LEFT JOIN players p ON p.id = c.player_id
     WHERE ${reachableSql('c', 'bulk', 15)}
       AND c.phone NOT LIKE 'lid:%'
       AND ${lineGate}
       AND NOT EXISTS (SELECT 1 FROM wa_optouts o WHERE o.phone = c.phone)
       ${extra}
       ${notSentBefore}
     ORDER BY COALESCE(c.last_inbound_at, c.last_message_at, c.created_at) DESC LIMIT ${maxTargets() + 50}
  `);
  const ex = new Set((q.excludeIds || []).map(Number));
  // 🔀 القناة التي سيخرج منها كلٌّ — ميتا لمن نافذته عندها مفتوحة، ورقم الأعمال لغيره (بحسب الوضع)
  const rows = rowsOf(r).filter((x: any) => !ex.has(Number(x.id))).map((x: any) => {
    const via = pickChannel({
      id: Number(x.id), phone: x.phone, waPhone: x.wa_phone, channel: x.channel, channelPin: x.channel_pin,
      cloudLastInboundAt: x.cloud_last_inbound_at, lastInboundAt: x.last_inbound_at, webChatId: x.web_chat_id,
    }, 'bulk').channel;
    return {
      id: Number(x.id), phone: x.phone, name: x.player_name || x.display_name || x.phone, isPlayer: !!x.player_id,
      rank: x.rank_tier ? (RANK_AR[x.rank_tier] || '') : '', via, lineOk: x.line_ok === true,
      windowClosesAt: via === 'cloud' && x.cloud_last_inbound_at ? new Date(new Date(x.cloud_last_inbound_at).getTime() + 24 * 3600e3).toISOString() : null,
    };
  })
    // 📇 من يخرج عبر رقم الأعمال يجب أن يجتاز فلتر الخطّ — بالقناة الفعليّة لا بآخر وارد
    .filter((x: any) => x.via && (x.via !== 'web' || x.lineOk) && (!q.channel || q.channel === 'all' || x.via === q.channel));
  void WINDOW_MARGIN;
  const cap = maxTargets();
  const byChannel = { cloud: rows.filter((x: any) => x.via === 'cloud').length, web: rows.filter((x: any) => x.via === 'web').length };
  return { total: rows.length, rows: rows.slice(0, cap), capped: rows.length > cap, byChannel, maxTargets: cap, estimate: estimateWeb(Math.min(byChannel.web, cap)) };
}

// ══════════════════════════════════════════════════════
// 📍 «الموقع» — المكان كاملاً لمن لا يعرف أين هو
// ══════════════════════════════════════════════════════
// `{المكان}` اسمُ الكافيه وحده، وهو لا يكفي من لم يزُرنا قطّ. و`{الموقع}`
// يجمع الاسم والمنطقة والمدينة منسَّقةً: «مزاج افندينا — الشميساني، عمّان».
// ويسقط الجزءُ الناقص بلا فاصلةٍ يتيمة.
export function formatPlace(venue?: string, region?: string, city?: string): string {
  const v = (venue || '').trim();
  const tail = [region, city].map(x => (x || '').trim()).filter(Boolean).join('، ');
  if (!v) return tail;
  return tail ? `${v} — ${tail}` : v;
}

export function fillVars(body: string, t: { name: string; rank: string; activity?: string; venue?: string; when?: string; place?: string }): string {
  const first = String(t.name || '').trim().split(/\s+/)[0] || '';
  return body
    .replace(/\{الاسم\}/g, first)
    .replace(/\{الاسم_الكامل\}/g, t.name || '')
    .replace(/\{الرتبة\}/g, t.rank || '')
    .replace(/\{الفعالية\}/g, t.activity || '')
    // 🔴 «الموقع» قبل «المكان»: لولا الترتيب لالتقط `{المكان}` جزءاً من
    //    `{الموقع}`؟ لا — لكنّ الوضوح مقصود، والاثنان مستقلّان.
    .replace(/\{الموقع\}/g, t.place || t.venue || '')
    .replace(/\{المكان\}/g, t.venue || '')
    .replace(/\{الموعد\}/g, t.when || '');
}

// ══════════════════════════════════════════════════════
// 🧪 اختبار البثّ — إلى أرقام الإداريّين من رقم الأعمال مباشرةً
// ══════════════════════════════════════════════════════
// قرار المالك 2026-10-24: قبل اعتماد أيّ بثّ (نصّ أو صورة أو فيديو) يصل المحتوى نفسه من رقم الأعمال إلى
// الإداريّين (حساب أدمن فعّال مربوط بملفّ لاعب = رقمه)، و«{الاسم}» باسم كلٍّ منهم. خارج الموجّه والطابور الجماعيّ
// (مسار timely)، ولا يُحسب في سجلّ البثوث. نجاحه يسجّل بصمة المحتوى فيفتح startBroadcast له ١٢ ساعة.
export const TEST_VALID_MS = 12 * 3600e3;

export async function broadcastTestRecipients(): Promise<Array<{ staff: string; name: string; phone: string }>> {
  const db = getDB(); if (!db) return [];
  const r: any = await db.execute(sql`SELECT s.username, p.name, p.phone, p.rank_tier
      FROM staff s JOIN players p ON p.linked_staff_id = s.id
     WHERE s.role = 'admin' AND s.is_active = true AND COALESCE(p.phone, '') <> '' ORDER BY s.id`);
  return rowsOf(r).map((x: any) => ({ staff: x.username, name: x.name || x.username, phone: String(x.phone), rank: x.rank_tier ? (RANK_AR[x.rank_tier] || '') : '' })) as any;
}

export async function testBroadcast(input: ContentInput & { createdBy: string }): Promise<{ ok: boolean; error?: string; key?: string; at?: number; sentTo?: Array<{ name: string; phone: string; ok: boolean; error?: string }> }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  if (input.activityId && await isTestActivity(db, input.activityId)) return { ok: false, error: 'فعاليّة في موقع اختبار — لا بثّ عنها' };
  const prep = await prepareContent(db, input);
  if ('error' in prep) return { ok: false, error: prep.error };
  if (!isWebReady()) return { ok: false, error: 'رقم الأعمال غير متّصل الآن — الاختبار يخرج منه' };
  const admins: any[] = await broadcastTestRecipients();
  if (!admins.length) return { ok: false, error: 'لا أرقام إداريّين: اربط حساب الأدمن بملفّ لاعبه (رقمه)' };
  const { getOrCreateConversation } = await import('./whatsapp-inbox.service.js');
  const sentTo: Array<{ name: string; phone: string; ok: boolean; error?: string }> = [];
  for (const a of admins) {
    const masked = a.phone.length > 6 ? `${a.phone.slice(0, 4)}•••${a.phone.slice(-2)}` : a.phone;
    try {
      const conv: any = await getOrCreateConversation(a.phone, a.name, { channel: 'web' });
      const msgText = fillVars(prep.body, { name: a.name, rank: a.rank, activity: prep.activityName, venue: prep.venueName, place: prep.placeText, when: prep.whenText }) + (prep.withFooter ? OPTOUT_FOOTER : '');
      // رابطٌ نسبيّ يكفي: رقم الأعمال يقرأ الملفّ من القرص، والوارد يعرضه عبر /uploads
      const media = { link: `${env.PUBLIC_URL || ''}${prep.mediaRel}`, caption: msgText };
      await sendMessage({
        conversationId: conv.id, source: 'system', lane: 'timely', forceChannel: 'web', priority: 1,
        meta: { broadcastTest: true, by: input.createdBy },
        ...(prep.imgRel ? { image: media } : prep.vidRel ? { video: media } : { text: msgText }),
      });
      sentTo.push({ name: a.name, phone: masked, ok: true });
    } catch (e: any) {
      sentTo.push({ name: a.name, phone: masked, ok: false, error: String(e?.message || e).slice(0, 160) });
    }
  }
  const n = sentTo.filter(x => x.ok).length;
  if (!n) return { ok: false, error: 'لم يخرج الاختبار لأيّ رقم', sentTo };
  const at = Date.now();
  await setAux(`bcast-test:${prep.key}`, { at, by: input.createdBy, sent: n });
  return { ok: true, key: prep.key, at, sentTo };
}

/** 📡 البثوث الجارية الآن (الجماعيّ في الطابور) + حالة المسار: يُرسل أم متوقّف ولماذا ومتى يستأنف */
export async function liveBroadcasts(): Promise<{ broadcasts: any[]; lane: any }> {
  const db = getDB(); if (!db) return { broadcasts: [], lane: null };
  const rows = rowsOf(await db.execute(sql`SELECT b.id, b.status, b.total_targets, b.created_at, b.created_by, b.body, b.origin,
      COUNT(m.id) FILTER (WHERE m.status IN ('queued', 'sending'))::int AS queued,
      COUNT(m.id) FILTER (WHERE m.status = 'sending')::int AS sending,
      COUNT(m.id) FILTER (WHERE m.status = 'failed')::int AS failed,
      COUNT(m.id) FILTER (WHERE m.status NOT IN ('queued', 'sending', 'failed'))::int AS sent,
      COUNT(m.id) FILTER (WHERE m.status IN ('delivered', 'read'))::int AS delivered,
      COUNT(m.id) FILTER (WHERE m.status = 'read')::int AS read,
      MAX(m.created_at) FILTER (WHERE m.status NOT IN ('queued', 'sending', 'failed')) AS last_sent_at
    FROM wa_broadcasts b
    LEFT JOIN wa_broadcast_recipients r ON r.broadcast_id = b.id
    LEFT JOIN wa_messages m ON m.id = r.wa_message_id
   WHERE b.status IN ('running', 'sending')
   GROUP BY b.id ORDER BY b.id DESC LIMIT 5`));
  const iso = (v: any) => (v ? new Date(v).toISOString() : null);
  const { bulkLaneState } = await import('./wa-transport/web.transport.js');
  const lane = await bulkLaneState().catch(() => null);
  return {
    broadcasts: rows.map((b: any) => {
      const raw = String(b.body || '');
      const media = /^(🖼️|🎬) \/uploads\/wa-out\/[\w.-]+\n?/.exec(raw);
      return {
        id: Number(b.id), status: b.status, origin: b.origin || 'inbox', createdBy: b.created_by || '', createdAt: iso(b.created_at),
        text: media ? raw.slice(media[0].length) : raw, media: media ? (media[1] === '🎬' ? 'video' : 'image') : null,
        total: Number(b.total_targets || 0), sent: Number(b.sent || 0), queued: Number(b.queued || 0), sending: Number(b.sending || 0),
        failed: Number(b.failed || 0), delivered: Number(b.delivered || 0), read: Number(b.read || 0), lastSentAt: iso(b.last_sent_at),
      };
    }),
    lane,
  };
}

export async function broadcastStatus() {
  const db = getDB(); if (!db) return { running: null, nextAllowedAt: null, suspended: null };
  return { running, suspended: sendingSuspendedReason(), nextAllowedAt: null, maxTargets: maxTargets() };
}

/** محتوى البثّ المحضَّر — مشتركٌ بين الاختبار والبثّ نفسه فيصل الاختبارُ نصّاً وبوسيطٍ مطابقَين */
interface PreparedContent { body: string; imgRel: string; vidRel: string; mediaRel: string; activityName: string; venueName: string; whenText: string; placeText: string; key: string; withFooter: boolean }
type ContentInput = { body: string; imageUrl?: string | null; videoUrl?: string | null; appendOptout?: boolean; activityId?: number | null };

/** بصمة المحتوى: ما يغيّر الرسالة الواصلة (النصّ، الوسيط، التذييل، والفعاليّة إن كان في النصّ متغيّرها) */
function contentKey(c: { body: string; imgRel: string; vidRel: string; withFooter: boolean; activityId: number | null }): string {
  return crypto.createHash('sha256').update(JSON.stringify([c.body, c.imgRel, c.vidRel, c.withFooter, c.activityId])).digest('hex').slice(0, 32);
}

async function prepareContent(db: any, input: ContentInput): Promise<PreparedContent | { error: string }> {
  const body = String(input.body || '').trim();
  if (body.length < 5) return { error: 'اكتب نصّ الرسالة (٥ أحرف على الأقلّ)' };
  if (body.length > 900) return { error: 'النصّ طويل — الحدّ ٩٠٠ حرف' };
  // (قيدُ الروابط الخارجيّة أُلغي نهائيّاً بقرار المالك 2026-09-26: كان يمنع حتّى رابط قناة الواتساب. أيُّ رابطٍ يُرسل.)
  // 🖼️ صورةُ البثّ: رابطُنا نحن فقط (نفس قيد `/send` — لا نكون وكيلَ تحميلٍ لأحد)
  const imgRel = String(input.imageUrl || '').trim();
  if (imgRel) {
    if (!/^\/uploads\/wa-out\/[\w.-]+$/.test(imgRel)) return { error: 'رابط صورة غير مقبول — ارفع الصورة أوّلاً' };
    if (!fsSync.existsSync(pathMod.resolve(process.cwd(), '.' + imgRel))) return { error: 'ملفّ الصورة غير موجود على الخادم' };
  }
  // 🎬 فيديو البثّ (MP4 من رفعنا) — بديلٌ عن الصورة لا معها: رسالةٌ واحدة بوسيطٍ واحد وتعليق
  const vidRel = String(input.videoUrl || '').trim();
  if (vidRel) {
    if (imgRel) return { error: 'اختر صورة أو فيديو — لا الاثنين' };
    if (!/^\/uploads\/wa-out\/[\w.-]+\.mp4$/.test(vidRel)) return { error: 'رابط فيديو غير مقبول — ارفع الفيديو أوّلاً' };
    if (!fsSync.existsSync(pathMod.resolve(process.cwd(), '.' + vidRel))) return { error: 'ملفّ الفيديو غير موجود على الخادم' };
  }
  const mediaRel = imgRel || vidRel;
  let activityName = '', venueName = '', whenText = '', placeText = '';
  if (/\{(الفعالية|المكان|الموقع|الموعد)\}/.test(body)) {
    if (!input.activityId) return { error: 'النصّ فيه متغيّر فعاليّة ({الفعالية}/{المكان}/{الموقع}/{الموعد}) — اختر فعاليّة من الفلتر أوّلاً' };
    const ar: any = await db.execute(sql`
      SELECT a.name, a.date, l.name AS venue, l.region, c.name AS city
        FROM activities a
        LEFT JOIN locations l ON l.id = a.location_id
        LEFT JOIN cities c ON c.id = l.city_id
       WHERE a.id = ${Number(input.activityId)} AND a.deleted_at IS NULL`);
    const row = rowsOf(ar)[0] || {};
    activityName = row.name || '';
    venueName = row.venue || '';
    placeText = formatPlace(row.venue, row.region, row.city);
    whenText = row.date ? fmtWhen(row.date) : '';
    if (/\{(المكان|الموقع)\}/.test(body) && !venueName) return { error: 'الفعاليّة بلا مكان محدَّد — احذف {المكان} و{الموقع} من النصّ' };
    if (!activityName) return { error: 'الفعاليّة غير موجودة' };
  }
  // 🖼️ حدُّ تعليق الصورة يُقاس على النصّ **بعد** حلّ متغيّرات الفعاليّة (اسمُ فعاليّةٍ طويل قد
  //    يضيف عشرات الأحرف)، مع هامشٍ لمتغيّرات المستلم (الاسم واللقب). يُقاس هنا لا عند ميتا:
  //    رفضُها يأتي وسطَ بثٍّ نصفِ منفَّذ. وسقفُ `sendMessage` يبقى شبكةَ أمانٍ أخيرة تقصّ لا تُسقط.
  if (mediaRel) {
    const resolved = fillVars(body, { name: 'م'.repeat(28), rank: 'م'.repeat(12), activity: activityName, venue: venueName, place: placeText, when: whenText });
    const longest = resolved.length + (input.appendOptout !== false ? OPTOUT_FOOTER.length : 0);
    const what = vidRel ? 'الفيديو' : 'الصورة';
    if (longest > WA_CAPTION_MAX) return { error: `النصّ مع ${what} أطول من ${WA_CAPTION_MAX} حرفاً بعد حلّ المتغيّرات (حدّ التعليق) — اختصره ${longest - WA_CAPTION_MAX} حرفاً` };
  }
  const withFooter = input.appendOptout !== false;
  const key = contentKey({ body, imgRel, vidRel, withFooter, activityId: /\{(الفعالية|المكان|الموقع|الموعد)\}/.test(body) ? Number(input.activityId) || null : null });
  return { body, imgRel, vidRel, mediaRel, activityName, venueName, whenText, placeText, key, withFooter };
}

export async function startBroadcast(input: AudienceQuery & { body: string; createdBy: string; appendOptout?: boolean; templateId?: number | null; imageUrl?: string | null; videoUrl?: string | null }): Promise<{ ok: boolean; error?: string; code?: string; id?: number; total?: number }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  // 🧪 موقع اختبار: لا بثّ عن فعاليّةٍ هناك — للعميل والأدمن سواء
  if (input.activityId && await isTestActivity(db, input.activityId)) return { ok: false, error: 'فعاليّة في موقع اختبار — لا بثّ عنها' };
  const prep = await prepareContent(db, input);
  if ('error' in prep) return { ok: false, error: prep.error };
  const { body, imgRel, vidRel, mediaRel, activityName, venueName, whenText, placeText } = prep;
  const blocked = sendingSuspendedReason(); if (blocked) return { ok: false, error: `الإرسال مقفل: ${blocked}` };
  if (running) return { ok: false, error: 'هناك بثّ جارٍ الآن' };
  // (حظر الـ12 ساعة بين البثوث أُلغي بقرار المالك 2026-09-20. الحماية من التكرار صارت بيده: خيار «استثنِ من وصلهم بثّ سابق».)
  // 🧪 الاختبار إلزاميّ قبل الاعتماد (قرار المالك 2026-10-24): هذا المحتوى نفسه وصل أرقامَ الإداريّين من
  //    رقم الأعمال خلال ١٢ ساعة — وإلّا لا بثّ. أيّ تعديلٍ في النصّ أو الوسيط أو التذييل يتطلّب اختباراً جديداً.
  const tested = await getAux(`bcast-test:${prep.key}`);
  if (!tested || Date.now() - Number(tested.at || 0) > TEST_VALID_MS) {
    return { ok: false, code: 'TEST_REQUIRED', error: 'لم تُختبر هذه الرسالة بعد — أرسل الاختبار لأرقام الإداريّين وراجعوه على هواتفكم، ثمّ اعتمد البثّ' };
  }
  const aud = await previewAudience(input);
  if (!aud.total) return { ok: false, error: transportSettings().mode === 'cloud_only' ? 'لا مستلمين بنافذة مفتوحة يطابقون الفلتر' : 'لا مستلمين يطابقون الفلتر' };
  const targets = aud.rows;
  const anyCloud = targets.some((t: any) => t.via === 'cloud');
  // 🖼️ رفعةٌ **واحدة** لميتا يُعاد استعمالُ معرّفها لكلّ مستلم. بالرابط كانت ميتا تسحب
  //    الصورة من اللابتوب مرّةً لكلّ مستلم (٣٠٠ مستلم × ٢ م.ب = ٦٠٠ م.ب خروجاً). المعرّف صالحٌ ~٣٠ يوماً.
  let mediaId = '';
  // رقم الأعمال يرسل الملفّ نفسه من القرص — الرفع لميتا يلزم فقط إن خرج شيءٌ عبرها
  if (mediaRel && anyCloud) {
    try {
      const mime = vidRel ? 'video/mp4' : imgRel.endsWith('.png') ? 'image/png' : 'image/jpeg';
      mediaId = await uploadWaMedia(pathMod.resolve(process.cwd(), '.' + mediaRel), mime);
    } catch (e: any) {
      return { ok: false, error: `تعذّر رفع ${vidRel ? 'الفيديو' : 'الصورة'} لواتساب: ${e?.message || 'خطأ'}` };
    }
  }
  // الوسيط يُسجَّل سطراً أوّلَ في النصّ المحفوظ (🖼️ صورة · 🎬 فيديو) ويُفصل عند العرض
  const audienceLabel = input.filter === 'played' ? await playedLabel(db, input.playedActivityIds, input.playedNotBooked === true ? input.activityId : null) : '';
  const [row] = await db.insert(waBroadcasts).values({ body: imgRel ? `🖼️ ${imgRel}\n${body}` : vidRel ? `🎬 ${vidRel}\n${body}` : body, templateId: input.templateId || null, totalTargets: targets.length, status: 'running', createdBy: input.createdBy, origin: 'inbox', lane: 'bulk', audienceLabel } as any).returning();
  if (input.templateId) await db.update(waMessageTemplates).set({ usedCount: sql`COALESCE(${waMessageTemplates.usedCount}, 0) + 1` } as any).where(eq(waMessageTemplates.id, Number(input.templateId))).catch(() => {});
  running = row.id;
  const withFooter = input.appendOptout !== false;

  (async () => {
    let sent = 0, skipped = 0, failed = 0, streak = 0, status = 'done', viaWeb = false;
    for (const t of targets) {
      if (stopFlags.has(row.id)) { status = 'stopped'; break; }
      if (sendingSuspendedReason()) { status = 'stopped'; break; }           // إنذار صحّة الحساب أثناء البثّ
      try {
        const msgText = fillVars(body, { ...t, activity: activityName, venue: venueName, place: placeText, when: whenText }) + (withFooter ? OPTOUT_FOOTER : '');
        const link = mediaRel && env.PUBLIC_URL ? `${env.PUBLIC_URL}${mediaRel}` : '';
        const media = { ...(mediaId ? { mediaId } : {}), ...(link ? { link } : {}), caption: msgText };
        const sentRes: any = await sendMessage(imgRel
          // ميتا: بالمعرّف (رفعةٌ واحدة) والرابط للعرض · رقم الأعمال: الملفّ نفسه من القرص عبر الرابط
          ? { conversationId: t.id, image: media, source: 'broadcast' as any, lane: 'bulk' }
          : vidRel
            ? { conversationId: t.id, video: media, source: 'broadcast' as any, lane: 'bulk' }
            : { conversationId: t.id, text: msgText, source: 'broadcast' as any, lane: 'bulk' });
        viaWeb = sentRes?.message?.channel === 'web';
        sent++; streak = 0;
        // 👁 معرّف الرسالة يربط المستلم بحالتها (وصلت/قُرئت) — تقرير القراءة لكلّ بثّ
        await db.execute(sql`INSERT INTO wa_broadcast_recipients (broadcast_id, conversation_id, wa_message_id) VALUES (${row.id}, ${t.id}, ${sentRes?.message?.id ?? null}) ON CONFLICT DO NOTHING`).catch(() => {});
      } catch (e: any) {
        if (isUnreachable(e)) { skipped++; }                     // النافذة أُغلقت بين المعاينة والإرسال
        else if (e?.code === 'SENDING_SUSPENDED') { status = 'stopped'; break; }
        else { failed++; streak++; if (streak >= 5) { status = 'stopped'; break; } }
      }
      if ((sent + skipped + failed) % 10 === 0) await db.update(waBroadcasts).set({ sentCount: sent, skippedCount: skipped, failedCount: failed } as any).where(eq(waBroadcasts.id, row.id)).catch(() => {});
      // ميتا: التباعد هنا · رقم الأعمال: الطابور يتولّاه (١٥–٤٥ث، ٢٥٠/يوم) فلا انتظار
      if (!viaWeb) await new Promise(r => setTimeout(r, PACE_MS + Math.random() * 500));
    }
    const finalStatus = status === 'done' && await hasQueued(row.id) ? 'sending' : status;
    await db.update(waBroadcasts).set({ sentCount: sent, skippedCount: skipped, failedCount: failed, status: finalStatus, finishedAt: finalStatus === 'sending' ? null : new Date() } as any).where(eq(waBroadcasts.id, row.id)).catch(() => {});
    stopFlags.delete(row.id); running = null;
    try { const io = (global as any).io; if (io) io.to('wa:inbox').emit('wa:broadcast:done', { id: row.id, status, sent, skipped, failed }); } catch { /* غير حرج */ }
    console.log(`📢 WA broadcast #${row.id} ${status}: sent=${sent} skipped=${skipped} failed=${failed}`);
  })().catch(e => { running = null; console.error('❌ WA broadcast loop:', e?.message); });

  return { ok: true, id: row.id, total: targets.length };
}

// «الأحد 20 أيلول · 7:00 م» بتوقيت عمّان
export function fmtWhen(d: any): string {
  const dt = new Date(d);
  const day = dt.toLocaleDateString('ar-JO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Amman', numberingSystem: 'latn' } as any);
  const tm = dt.toLocaleTimeString('ar-JO', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Amman', numberingSystem: 'latn' } as any);
  return `${day} · ${tm}`;
}

/** وصفٌ مقروء لجمهور «لعبوا معنا» يُحفظ مع البثّ فيُفهم من السجلّ لمن ذهب */
async function playedLabel(db: any, ids: unknown, notBookedId?: number | null): Promise<string> {
  const clean = await cleanPlayedIds(db, ids);
  if (!clean.length) return '';
  const r: any = await db.execute(sql`SELECT id, name FROM activities WHERE id = ANY(${`{${clean.join(',')}}`}::int[]) ORDER BY date DESC`);
  const names = rowsOf(r).map((x: any) => String(x.name || `#${x.id}`));
  let label = `لعبوا في: ${names.slice(0, 4).join('، ')}${names.length > 4 ? ` و${names.length - 4} أخرى` : ''}`;
  if (notBookedId) {
    const n: any = await db.execute(sql`SELECT name FROM activities WHERE id = ${Number(notBookedId)} LIMIT 1`);
    const nm = rowsOf(n)[0]?.name;
    if (nm) label += ` · ولم يحجزوا في: ${nm}`;
  }
  return label.slice(0, 300);
}

/**
 * 🗂️ الفعاليّات السابقة لمنتقي «لعبوا معنا» — الأحدث أوّلاً بصفحات (المؤشّر = تاريخ آخر صفّ)،
 * مع عدد من لعب فيها، وبحثٌ بالاسم أو المكان، وتصفيةٌ بالمكان. الفعاليّة بلا لاعبين لا تُعرض
 * (ملغاة أو لم تُلعب): لا جمهور وراءها. والمعرّفات المطلوبة (`ids`) تُعاد دائماً كي تبقى رقاقات
 * المختار مقروءةً ولو لم تكن في الصفحة الحاليّة.
 */
export async function pastActivities(opts: { q?: string; locationId?: number | null; before?: string | null; limit?: number; ids?: number[] }) {
  const db = getDB(); if (!db) return { activities: [], locations: [], hasMore: false };
  const limit = Math.min(Math.max(Number(opts.limit) || 30, 5), 60);
  const q = String(opts.q || '').trim().slice(0, 60);
  const loc = Number(opts.locationId) > 0 ? Number(opts.locationId) : null;
  const before = opts.before && !Number.isNaN(Date.parse(opts.before)) ? new Date(opts.before).toISOString() : null;
  const ids = (opts.ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, PLAYED_MAX_ACTIVITIES);
  const idsLit = `{${ids.join(',')}}`;
  const played = sql`(SELECT COUNT(*) FROM (
        SELECT mpt.player_id FROM match_participants mpt WHERE mpt.activity_id = a.id
        UNION
        SELECT mp.player_id FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN sessions s ON s.id = m.session_id
         WHERE s.activity_id = a.id AND mp.player_id IS NOT NULL) x)`;
  const page: any = await db.execute(sql`
    SELECT * FROM (
      SELECT a.id, a.name, a.date, a.location_id, l.name AS venue, ${played}::int AS played
        FROM activities a LEFT JOIN locations l ON l.id = a.location_id
       WHERE a.deleted_at IS NULL AND a.date < NOW()
         AND ${sql.raw(notTestLocationSql('l'))}
         ${loc ? sql`AND a.location_id = ${loc}` : sql``}
         ${before ? sql`AND a.date < ${before}::timestamptz` : sql``}
         ${q ? sql`AND (a.name ILIKE ${'%' + q + '%'} OR l.name ILIKE ${'%' + q + '%'})` : sql``}
       ORDER BY a.date DESC LIMIT ${limit * 3}
    ) t WHERE t.played > 0 ORDER BY t.date DESC LIMIT ${limit + 1}`);
  const rows = rowsOf(page);
  const hasMore = rows.length > limit;
  const map = (x: any) => ({ id: Number(x.id), name: x.name, date: x.date, venue: x.venue || '', locationId: x.location_id ? Number(x.location_id) : null, played: Number(x.played) || 0 });
  const list = rows.slice(0, limit).map(map);
  // المختار خارج الصفحة — بلا شروط البحث كي لا تختفي رقاقته
  let selected: any[] = [];
  if (ids.length) {
    const s2: any = await db.execute(sql`SELECT a.id, a.name, a.date, a.location_id, l.name AS venue, ${played}::int AS played
        FROM activities a LEFT JOIN locations l ON l.id = a.location_id WHERE a.id = ANY(${idsLit}::int[])`);
    selected = rowsOf(s2).map(map);
  }
  // أماكن لها فعاليّاتٌ سابقة — للتصفية السريعة (الأكثر فعاليّاتٍ أوّلاً)
  const locs: any = await db.execute(sql`SELECT l.id, l.name, COUNT(*)::int AS n FROM activities a JOIN locations l ON l.id = a.location_id
      WHERE a.deleted_at IS NULL AND a.date < NOW() AND ${sql.raw(notTestLocationSql('l'))}
      GROUP BY l.id, l.name ORDER BY n DESC, l.name LIMIT 20`);
  return {
    activities: list,
    selected,
    locations: rowsOf(locs).map((x: any) => ({ id: Number(x.id), name: x.name, count: Number(x.n) })),
    hasMore,
    nextBefore: hasMore && list.length ? new Date(list[list.length - 1].date).toISOString() : null,
  };
}

export async function upcomingActivities() {
  const db = getDB(); if (!db) return [];
  const r: any = await db.execute(sql`
    SELECT a.id, a.name, a.date, l.name AS venue, l.region, c.name AS city
      FROM activities a
      LEFT JOIN locations l ON l.id = a.location_id
      LEFT JOIN cities c ON c.id = l.city_id
     WHERE a.deleted_at IS NULL AND a.date > NOW() - INTERVAL '6 hours'
       AND ${sql.raw(notTestLocationSql('l'))} -- 🧪 موقع اختبار لا يُعرض في قائمة البثّ
     ORDER BY a.date LIMIT 12`);
  return rowsOf(r).map((x: any) => ({
    id: Number(x.id), name: x.name, date: x.date,
    venue: x.venue || '', place: formatPlace(x.venue, x.region, x.city), when: fmtWhen(x.date),
  }));
}

// ══════════════════════════════════════════════════════
// ⏱ دفعاتٌ في طابور رقم الأعمال — «يُرسَل» حتّى تخرج آخر رسالة
// ══════════════════════════════════════════════════════
// إدخال ١٣٣ رسالة الطابور يستغرق ثوانٍ، وخروجها متباعدةً ساعة. كانت الدفعة تُعلَّم «اكتمل» و«أُرسل ١٣٣»
// لحظة الإدخال (لقطة المالك، البثّ #23). الآن: الحالة sending، و«أُرسل» = ما خرج فعلاً، وتُغلق متى فرغ الطابور.
export async function hasQueued(id: number): Promise<boolean> {
  const db = getDB(); if (!db) return false;
  const r = rowsOf(await db.execute(sql`SELECT 1 FROM wa_broadcast_recipients r JOIN wa_messages m ON m.id = r.wa_message_id
    WHERE r.broadcast_id = ${Number(id)} AND m.status IN ('queued', 'sending') LIMIT 1`));
  return r.length > 0;
}
export async function reconcileSendingBatches(): Promise<void> {
  const db = getDB(); if (!db) return;
  const list = rowsOf(await db.execute(sql`SELECT id FROM wa_broadcasts WHERE status = 'sending'`));
  for (const b of list) {
    const [s] = rowsOf(await db.execute(sql`SELECT
        COUNT(*) FILTER (WHERE m.status IN ('queued', 'sending'))::int AS queued,
        COUNT(*) FILTER (WHERE m.status IN ('sent', 'delivered', 'read'))::int AS out,
        COUNT(*) FILTER (WHERE m.status = 'failed')::int AS failed,
        MAX((m.payload->>'_sentAt')::timestamptz) AS last_at
      FROM wa_broadcast_recipients r JOIN wa_messages m ON m.id = r.wa_message_id WHERE r.broadcast_id = ${Number(b.id)}`));
    if (!s) continue;
    if (Number(s.queued) > 0) {
      await db.execute(sql`UPDATE wa_broadcasts SET sent_count = ${Number(s.out)}, failed_count = ${Number(s.failed)} WHERE id = ${Number(b.id)}`);
    } else {
      await db.execute(sql`UPDATE wa_broadcasts SET sent_count = ${Number(s.out)}, failed_count = ${Number(s.failed)}, status = 'done',
        finished_at = COALESCE(${s.last_at}::timestamptz, NOW()) WHERE id = ${Number(b.id)}`);
      try { const io = (global as any).io; if (io) io.to('wa:inbox').emit('wa:broadcast:done', { id: Number(b.id), status: 'done' }); } catch { /* غير حرج */ }
    }
  }
}

export async function stopBroadcast(id: number) {
  stopFlags.add(Number(id));
  // رقم الأعمال: الحلقة انتهت سريعاً والرسائل في الطابور — الإيقاف يحذف ما لم يخرج بعد
  try {
    const db = getDB();
    if (db) {
      const r: any = await db.execute(sql`SELECT r.wa_message_id AS mid FROM wa_broadcast_recipients r
        JOIN wa_messages m ON m.id = r.wa_message_id WHERE r.broadcast_id = ${Number(id)} AND m.status = 'queued'`);
      const ids = rowsOf(r).map((x: any) => Number(x.mid)).filter(Boolean);
      if (ids.length) {
        const { cancelQueued } = await import('./wa-transport/web.transport.js');
        const n = await cancelQueued(ids);
        await db.execute(sql`UPDATE wa_broadcasts SET status = 'stopped', finished_at = NOW() WHERE id = ${Number(id)}`);
        console.log(`📢 WA broadcast #${id} stopped — ${n} queued message(s) cancelled`);
      }
    }
  } catch (e: any) { console.warn('⚠️ stopBroadcast queue:', e?.message); }
  return true;
}

/** كم يستغرق الجماعيّ عبر رقم الأعمال: بالسقف اليوميّ ومتوسّط التباعد */
export function estimateWeb(n: number): { messages: number; perDay: number; days: number; minutesFirstDay: number } | null {
  if (!n) return null;
  const b = transportSettings().bulk;
  const perDay = Math.max(1, b.dailyCap);
  const avgGap = (b.gapMinSec + b.gapMaxSec) / 2;
  return { messages: n, perDay, days: Math.ceil(n / perDay), minutesFirstDay: Math.round(Math.min(n, perDay) * avgGap / 60) };
}

// ══════════════════════════════════════════════════════
// 👁 تقرير القراءة لكلّ بثّ — قرأها / وصلت ولم تُقرأ / لم تصل / رفضها واتساب
// ══════════════════════════════════════════════════════
// الحالة تأتي من واتساب (webhook statuses ⟵ wa_messages.status). المستلم يُربط برسالته
// بمعرّفها (منذ 2026-10-02)، وما قبل ذلك بأقرب رسالة بثٍّ في محادثته حول وقت الإرسال
// (±٢ دقيقة) — طابقت ١٠٠٪ في آخر خمسة بثوث.
// ⚠️ «وصلت ولم تُقرأ» تشمل من أطفأ إيصالات القراءة: واتساب لا يُبلغ بقراءته أصلاً.
const RECIPIENT_MSG = sql`LEFT JOIN LATERAL (
    SELECT m.id, m.status, m.payload FROM wa_messages m
     WHERE (r.wa_message_id IS NOT NULL AND m.id = r.wa_message_id)
        OR (r.wa_message_id IS NULL AND m.conversation_id = r.conversation_id AND m.direction = 'out' AND m.source = 'broadcast'
            AND m.created_at BETWEEN r.sent_at - interval '2 minutes' AND r.sent_at + interval '2 minutes')
     ORDER BY (m.id = r.wa_message_id) DESC NULLS LAST, abs(extract(epoch from m.created_at - r.sent_at)) LIMIT 1) m ON true`;

export async function listBroadcasts(limit = 20) {
  const db = getDB(); if (!db) return [];
  const list = await db.select().from(waBroadcasts).orderBy(desc(waBroadcasts.id)).limit(limit);
  if (!list.length) return list;
  const ids = list.map((b: any) => Number(b.id));
  const stats = rowsOf(await db.execute(sql`
    SELECT r.broadcast_id AS id, COUNT(*)::int AS recipients,
           COUNT(*) FILTER (WHERE m.status = 'read')::int AS read,
           COUNT(*) FILTER (WHERE m.status = 'delivered')::int AS delivered,
           COUNT(*) FILTER (WHERE m.status = 'failed')::int AS failed,
           COUNT(*) FILTER (WHERE m.status IN ('queued', 'sending'))::int AS queued,
           COUNT(*) FILTER (WHERE m.id IS NULL OR m.status NOT IN ('read', 'delivered', 'failed', 'queued', 'sending'))::int AS not_delivered
      FROM wa_broadcast_recipients r ${RECIPIENT_MSG}
     WHERE r.broadcast_id IN (${sql.join(ids.map(i => sql`${i}`), sql`, `)})
     GROUP BY r.broadcast_id`));
  const by = new Map(stats.map((s: any) => [Number(s.id), s]));
  return list.map((b: any) => {
    const s: any = by.get(Number(b.id));
    return { ...b, readStats: s ? { recipients: s.recipients, read: s.read, delivered: s.delivered, notDelivered: s.not_delivered, failed: s.failed, queued: s.queued } : null };
  });
}

// ══════════════════════════════════════════════════════
// 📜 سجلّ البثّ بصفحات — تصفيةٌ بالحالة، بحثٌ في النصّ/المرسِل/الرقم، وترتيبٌ بأيّ عمود
// ══════════════════════════════════════════════════════
// إحصاءُ القراءة مكلفٌ (رسالةٌ لكلّ مستلم) فيُحسب لصفحة العرض وحدها — إلّا حين يكون
// الترتيبُ بنسبة القراءة نفسِها، فيُحسب لكلّ ما طابق التصفية ثمّ تُقطع الصفحة.
const BCAST_SORT: Record<string, string> = { created: 'created_at', sent: 'sent_count', targets: 'total_targets', failed: 'failed_count', read: 'read_rate' };
export async function pageBroadcasts(o: { page?: unknown; pageSize?: unknown; sort?: unknown; order?: unknown; status?: unknown; q?: unknown }) {
  const pageSize = Math.min(100, Math.max(5, Math.trunc(Number(o.pageSize) || 10)));
  const page = Math.max(1, Math.trunc(Number(o.page) || 1));
  const empty = { rows: [] as any[], total: 0, page, pageSize, summary: { sent: 0, targets: 0, failed: 0 } };
  const db = getDB(); if (!db) return empty;
  const sort = BCAST_SORT[String(o.sort)] ? String(o.sort) : 'created';
  const dir = o.order === 'asc' ? 'ASC' : 'DESC';
  const status = ['running', 'sending', 'done', 'stopped'].includes(String(o.status)) ? String(o.status) : null;
  const q = String(o.q ?? '').trim().slice(0, 100);
  const idQ = /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : null;
  const where = sql`WHERE true
    ${status ? sql`AND b.status = ${status}` : sql``}
    ${q ? sql`AND (b.body ILIKE ${'%' + q + '%'} OR b.created_by ILIKE ${'%' + q + '%'} ${idQ != null ? sql`OR b.id = ${idQ}` : sql``})` : sql``}`;

  const [agg] = rowsOf(await db.execute(sql`
    SELECT COUNT(*)::int AS n, COALESCE(SUM(b.sent_count), 0)::int AS sent, COALESCE(SUM(b.total_targets), 0)::int AS targets,
           COALESCE(SUM(b.failed_count), 0)::int AS failed
      FROM wa_broadcasts b ${where}`));
  const total = Number(agg?.n || 0);
  if (!total) return { ...empty, summary: { sent: 0, targets: 0, failed: 0 } };

  const off = (page - 1) * pageSize;
  const order = sql.raw(`${BCAST_SORT[sort]} ${dir} NULLS LAST, id DESC`);
  // نطاقُ الإحصاء: الصفحةُ وحدها، أو كلُّ المطابق حين نرتّب بالقراءة
  const scope = sort === 'read'
    ? sql`SELECT b.* FROM wa_broadcasts b ${where}`
    : sql`SELECT b.* FROM wa_broadcasts b ${where} ORDER BY ${sql.raw(`b.${BCAST_SORT[sort]} ${dir} NULLS LAST, b.id DESC`)} LIMIT ${pageSize} OFFSET ${off}`;
  const rows = rowsOf(await db.execute(sql`
    WITH sc AS (${scope}),
    st AS (
      SELECT r.broadcast_id AS id, COUNT(*)::int AS recipients,
             COUNT(*) FILTER (WHERE m.status = 'read')::int AS read,
             COUNT(*) FILTER (WHERE m.status = 'delivered')::int AS delivered,
             COUNT(*) FILTER (WHERE m.status = 'failed')::int AS failed,
             COUNT(*) FILTER (WHERE m.status IN ('queued', 'sending'))::int AS queued,
             COUNT(*) FILTER (WHERE m.id IS NULL OR m.status NOT IN ('read', 'delivered', 'failed', 'queued', 'sending'))::int AS not_delivered
        FROM wa_broadcast_recipients r ${RECIPIENT_MSG}
       WHERE r.broadcast_id IN (SELECT id FROM sc)
       GROUP BY r.broadcast_id),
    j AS (
      SELECT sc.*, t.name AS template_name, st.recipients, st.read, st.delivered, st.failed AS failed_msgs, st.not_delivered, st.queued,
             CASE WHEN COALESCE(st.recipients, 0) > 0 THEN st.read::float / st.recipients END AS read_rate
        FROM sc LEFT JOIN st ON st.id = sc.id LEFT JOIN wa_message_templates t ON t.id = sc.template_id)
    SELECT * FROM j ORDER BY ${order} ${sort === 'read' ? sql`LIMIT ${pageSize} OFFSET ${off}` : sql``}`));

  const iso = (v: any) => (v ? new Date(v).toISOString() : null);
  return {
    total, page, pageSize,
    summary: { sent: Number(agg.sent), targets: Number(agg.targets), failed: Number(agg.failed) },
    rows: rows.map((b: any) => {
      const raw = String(b.body || '');
      const img = /^🖼️ (\/uploads\/wa-out\/[\w.-]+)\n?/.exec(raw);
      const vid = img ? null : /^🎬 (\/uploads\/wa-out\/[\w.-]+)\n?/.exec(raw);
      const started = b.created_at ? new Date(b.created_at).getTime() : null;
      const ended = b.finished_at ? new Date(b.finished_at).getTime() : null;
      return {
        id: Number(b.id), status: b.status, createdBy: b.created_by || '',
        createdAt: iso(b.created_at), finishedAt: iso(b.finished_at),
        durationSec: started && ended ? Math.max(0, Math.round((ended - started) / 1000)) : null,
        text: img ? raw.slice(img[0].length) : vid ? raw.slice(vid[0].length) : raw, imageUrl: img ? img[1] : null, videoUrl: vid ? vid[1] : null,
        templateId: b.template_id != null ? Number(b.template_id) : null, templateName: b.template_name || null,
        totalTargets: Number(b.total_targets || 0), sentCount: Number(b.sent_count || 0),
        skippedCount: Number(b.skipped_count || 0), failedCount: Number(b.failed_count || 0),
        readStats: b.recipients != null ? { recipients: Number(b.recipients), read: Number(b.read), delivered: Number(b.delivered), notDelivered: Number(b.not_delivered), failed: Number(b.failed_msgs), queued: Number(b.queued || 0) } : null,
        origin: b.origin || 'inbox', lane: b.lane || 'bulk', audienceLabel: b.audience_label || '',
        readRate: b.read_rate != null ? Number(b.read_rate) : null,
      };
    }),
  };
}

/** تفصيل بثٍّ واحد: كلّ مستلم وحالة رسالته ووقت وصولها وقراءتها */
export async function broadcastReadReport(id: number) {
  const db = getDB(); if (!db) return null;
  const [b] = await db.select().from(waBroadcasts).where(eq(waBroadcasts.id, id)).limit(1);
  if (!b) return null;
  const rows = rowsOf(await db.execute(sql`
    SELECT r.conversation_id, r.sent_at, c.display_name, c.phone, p.name AS player_name, m.status, m.payload
      FROM wa_broadcast_recipients r
      JOIN wa_conversations c ON c.id = r.conversation_id
      LEFT JOIN players p ON p.id = c.player_id
      ${RECIPIENT_MSG}
     WHERE r.broadcast_id = ${id}
     ORDER BY r.sent_at`));
  const atOf = (pl: any, st: string) => {
    const h = Array.isArray(pl?.statusHistory) ? pl.statusHistory : [];
    const e = h.find((x: any) => x?.status === st);
    return e?.at || null;
  };
  const group = (st: string | null) => st === 'read' ? 'read' : st === 'delivered' ? 'delivered' : st === 'failed' ? 'failed'
    : st === 'queued' || st === 'sending' ? 'queued' : 'notDelivered';
  const recipients = rows.map((r: any) => ({
    conversationId: Number(r.conversation_id),
    name: String(r.player_name || r.display_name || '').trim() || r.phone,
    phone: r.phone,
    status: r.status || null,
    group: group(r.status || null),
    sentAt: r.sent_at,
    deliveredAt: atOf(r.payload, 'delivered'),
    readAt: atOf(r.payload, 'read'),
  }));
  const count = (g: string) => recipients.filter(x => x.group === g).length;
  return {
    broadcast: { id: Number(b.id), createdAt: (b as any).createdAt, createdBy: (b as any).createdBy, sentCount: (b as any).sentCount },
    totals: { recipients: recipients.length, read: count('read'), delivered: count('delivered'), notDelivered: count('notDelivered'), failed: count('failed'), queued: count('queued') },
    recipients,
  };
}
