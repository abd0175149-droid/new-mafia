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
import fsSync from 'fs';
import pathMod from 'path';
import { getDB } from '../config/db.js';
import { env } from '../config/env.js';
import { waBroadcasts, waMessageTemplates } from '../schemas/admin.schema.js';
import { sendMessage, sendingSuspendedReason, uploadWaMedia, WA_CAPTION_MAX } from './whatsapp-inbox.service.js';
import { isTestActivity, notTestActivitySql, notTestLocationSql } from './test-location.util.js';

const rowsOf = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);
export const BROADCAST_MAX_TARGETS = 300;
const PACE_MS = 1300;
const WINDOW_MARGIN = "23 hours 45 minutes";
const OPTOUT_FOOTER = '\n\n— لإيقاف هذه الرسائل أرسل: إيقاف';
const RANK_AR: Record<string, string> = { INFORMANT: 'مُخبر', SOLDIER: 'جندي', CAPO: 'كابو', UNDERBOSS: 'ساعد الزعيم', GODFATHER: 'العرّاب' };

export type AudienceFilter = 'all' | 'players' | 'visitors' | 'booked_upcoming' | 'activity' | 'not_booked_activity';
export interface AudienceQuery { filter: AudienceFilter; activityId?: number | null; excludeIds?: number[]; excludeBroadcastIds?: number[] }

const stopFlags = new Set<number>();
let running: number | null = null;

export async function previewAudience(q: AudienceQuery) {
  const db = getDB(); if (!db) return { total: 0, rows: [] as any[] };
  // 🧪 موقع اختبار: فعاليّةٌ هناك بلا جمهور — لا معاينة ولا بثّ
  if (q.activityId && await isTestActivity(db, q.activityId)) return { total: 0, rows: [] as any[], capped: false };
  const f = q.filter || 'all';
  const extra = f === 'players' ? sql`AND c.player_id IS NOT NULL`
    : f === 'visitors' ? sql`AND c.player_id IS NULL`
    // 🧪 موقع اختبار: حجزٌ هناك لا يُدخل صاحبه في «حجز قادم»
    : f === 'booked_upcoming' ? sql`AND (EXISTS (SELECT 1 FROM reservations r JOIN activities a ON a.id = r.activity_id WHERE r.deleted_at IS NULL AND a.date > NOW() AND ${sql.raw(notTestActivitySql('a'))} AND (r.phone = c.phone OR (c.player_id IS NOT NULL AND r.player_id = c.player_id))) OR EXISTS (SELECT 1 FROM bookings b JOIN activities a ON a.id = b.activity_id WHERE b.deleted_at IS NULL AND a.date > NOW() AND ${sql.raw(notTestActivitySql('a'))} AND (b.phone = c.phone OR (c.player_id IS NOT NULL AND b.player_id = c.player_id))))`
    : f === 'activity' && q.activityId ? sql`AND (EXISTS (SELECT 1 FROM reservations r WHERE r.deleted_at IS NULL AND r.activity_id = ${Number(q.activityId)} AND (r.phone = c.phone OR (c.player_id IS NOT NULL AND r.player_id = c.player_id))) OR EXISTS (SELECT 1 FROM bookings b WHERE b.deleted_at IS NULL AND b.activity_id = ${Number(q.activityId)} AND (b.phone = c.phone OR (c.player_id IS NOT NULL AND b.player_id = c.player_id))))`
    // من نافذته مفتوحة ولم يحجز بعد في فعاليّة بعينها — لا في الحجوزات ولا في حجوزات التطبيق، بالرقم أو بحساب اللاعب
    : f === 'not_booked_activity' && q.activityId ? sql`AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.deleted_at IS NULL AND r.activity_id = ${Number(q.activityId)} AND COALESCE(r.status, '') <> 'cancelled' AND (r.phone = c.phone OR (c.player_id IS NOT NULL AND r.player_id = c.player_id))) AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.deleted_at IS NULL AND b.activity_id = ${Number(q.activityId)} AND (b.phone = c.phone OR (c.player_id IS NOT NULL AND b.player_id = c.player_id)))`
    : (f === 'activity' || f === 'not_booked_activity') ? sql`AND false`   // فلتر فعاليّة بلا فعاليّة مختارة ⟵ لا أحد (لا «الكلّ» بالخطأ)
    : sql``;
  // استثناء من وصلهم بثّ سابق: من جدول المستلمين، ومن رسائل البثّ ضمن زمن ذلك البثّ (للبثوث الأقدم من الجدول)
  const exB = (q.excludeBroadcastIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 10);
  const exBLit = `{${exB.join(',')}}`;
  const notSentBefore = exB.length ? sql`AND NOT EXISTS (SELECT 1 FROM wa_broadcast_recipients br WHERE br.conversation_id = c.id AND br.broadcast_id = ANY(${exBLit}::int[]))
       AND NOT EXISTS (SELECT 1 FROM wa_messages m JOIN wa_broadcasts b ON b.id = ANY(${exBLit}::int[]) WHERE m.conversation_id = c.id AND m.source = 'broadcast' AND m.created_at >= b.created_at AND m.created_at <= COALESCE(b.finished_at, NOW()) + INTERVAL '1 minute')` : sql``;
  const r: any = await db.execute(sql`
    SELECT c.id, c.phone, c.display_name, c.player_id, c.last_inbound_at, p.name AS player_name, p.rank_tier
      FROM wa_conversations c LEFT JOIN players p ON p.id = c.player_id
     WHERE c.last_inbound_at > NOW() - INTERVAL '23 hours 45 minutes'
       AND NOT EXISTS (SELECT 1 FROM wa_optouts o WHERE o.phone = c.phone)
       ${extra}
       ${notSentBefore}
     ORDER BY c.last_inbound_at DESC LIMIT ${BROADCAST_MAX_TARGETS + 50}
  `);
  const ex = new Set((q.excludeIds || []).map(Number));
  const rows = rowsOf(r).filter((x: any) => !ex.has(Number(x.id))).map((x: any) => ({
    id: Number(x.id), phone: x.phone, name: x.player_name || x.display_name || x.phone, isPlayer: !!x.player_id,
    rank: x.rank_tier ? (RANK_AR[x.rank_tier] || '') : '', windowClosesAt: new Date(new Date(x.last_inbound_at).getTime() + 24 * 3600e3).toISOString(),
  }));
  void WINDOW_MARGIN;
  return { total: rows.length, rows: rows.slice(0, BROADCAST_MAX_TARGETS), capped: rows.length > BROADCAST_MAX_TARGETS };
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

export async function broadcastStatus() {
  const db = getDB(); if (!db) return { running: null, nextAllowedAt: null, suspended: null };
  return { running, suspended: sendingSuspendedReason(), nextAllowedAt: null, maxTargets: BROADCAST_MAX_TARGETS };
}

export async function startBroadcast(input: AudienceQuery & { body: string; createdBy: string; appendOptout?: boolean; templateId?: number | null; imageUrl?: string | null }): Promise<{ ok: boolean; error?: string; id?: number; total?: number }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  // 🧪 موقع اختبار: لا بثّ عن فعاليّةٍ هناك — للعميل والأدمن سواء
  if (input.activityId && await isTestActivity(db, input.activityId)) return { ok: false, error: 'فعاليّة في موقع اختبار — لا بثّ عنها' };
  const body = String(input.body || '').trim();
  if (body.length < 5) return { ok: false, error: 'اكتب نصّ الرسالة (٥ أحرف على الأقلّ)' };
  if (body.length > 900) return { ok: false, error: 'النصّ طويل — الحدّ ٩٠٠ حرف' };
  // (قيدُ الروابط الخارجيّة أُلغي نهائيّاً بقرار المالك 2026-09-26: كان يمنع حتّى رابط قناة الواتساب. أيُّ رابطٍ يُرسل.)
  // 🖼️ صورةُ البثّ: رابطُنا نحن فقط (نفس قيد `/send` — لا نكون وكيلَ تحميلٍ لأحد)
  const imgRel = String(input.imageUrl || '').trim();
  if (imgRel) {
    if (!/^\/uploads\/wa-out\/[\w.-]+$/.test(imgRel)) return { ok: false, error: 'رابط صورة غير مقبول — ارفع الصورة أوّلاً' };
    if (!fsSync.existsSync(pathMod.resolve(process.cwd(), '.' + imgRel))) return { ok: false, error: 'ملفّ الصورة غير موجود على الخادم' };
  }
  const blocked = sendingSuspendedReason(); if (blocked) return { ok: false, error: `الإرسال مقفل: ${blocked}` };
  if (running) return { ok: false, error: 'هناك بثّ جارٍ الآن' };
  // (حظر الـ12 ساعة بين البثوث أُلغي بقرار المالك 2026-09-20. الحماية من التكرار صارت بيده: خيار «استثنِ من وصلهم بثّ سابق».)
  let activityName = '', venueName = '', whenText = '', placeText = '';
  if (/\{(الفعالية|المكان|الموقع|الموعد)\}/.test(body)) {
    if (!input.activityId) return { ok: false, error: 'النصّ فيه متغيّر فعاليّة ({الفعالية}/{المكان}/{الموقع}/{الموعد}) — اختر فعاليّة من الفلتر أوّلاً' };
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
    if (/\{(المكان|الموقع)\}/.test(body) && !venueName) return { ok: false, error: 'الفعاليّة بلا مكان محدَّد — احذف {المكان} و{الموقع} من النصّ' };
    if (!activityName) return { ok: false, error: 'الفعاليّة غير موجودة' };
  }
  // 🖼️ حدُّ تعليق الصورة يُقاس على النصّ **بعد** حلّ متغيّرات الفعاليّة (اسمُ فعاليّةٍ طويل قد
  //    يضيف عشرات الأحرف)، مع هامشٍ لمتغيّرات المستلم (الاسم واللقب). يُقاس هنا لا عند ميتا:
  //    رفضُها يأتي وسطَ بثٍّ نصفِ منفَّذ. وسقفُ `sendMessage` يبقى شبكةَ أمانٍ أخيرة تقصّ لا تُسقط.
  if (imgRel) {
    const resolved = fillVars(body, { name: 'م'.repeat(28), rank: 'م'.repeat(12), activity: activityName, venue: venueName, place: placeText, when: whenText });
    const longest = resolved.length + (input.appendOptout !== false ? OPTOUT_FOOTER.length : 0);
    if (longest > WA_CAPTION_MAX) return { ok: false, error: `النصّ مع الصورة أطول من ${WA_CAPTION_MAX} حرفاً بعد حلّ المتغيّرات (حدّ تعليق الصورة) — اختصره ${longest - WA_CAPTION_MAX} حرفاً` };
  }
  const aud = await previewAudience(input);
  if (!aud.total) return { ok: false, error: 'لا مستلمين بنافذة مفتوحة يطابقون الفلتر' };
  const targets = aud.rows;
  // 🖼️ رفعةٌ **واحدة** لميتا يُعاد استعمالُ معرّفها لكلّ مستلم. بالرابط كانت ميتا تسحب
  //    الصورة من اللابتوب مرّةً لكلّ مستلم (٣٠٠ مستلم × ٢ م.ب = ٦٠٠ م.ب خروجاً). المعرّف صالحٌ ~٣٠ يوماً.
  let mediaId = '';
  if (imgRel) {
    try {
      mediaId = await uploadWaMedia(pathMod.resolve(process.cwd(), '.' + imgRel), imgRel.endsWith('.png') ? 'image/png' : 'image/jpeg');
    } catch (e: any) {
      return { ok: false, error: `تعذّر رفع الصورة لواتساب: ${e?.message || 'خطأ'}` };
    }
  }
  const [row] = await db.insert(waBroadcasts).values({ body: imgRel ? `🖼️ ${imgRel}\n${body}` : body, templateId: input.templateId || null, totalTargets: targets.length, status: 'running', createdBy: input.createdBy } as any).returning();
  if (input.templateId) await db.update(waMessageTemplates).set({ usedCount: sql`COALESCE(${waMessageTemplates.usedCount}, 0) + 1` } as any).where(eq(waMessageTemplates.id, Number(input.templateId))).catch(() => {});
  running = row.id;
  const withFooter = input.appendOptout !== false;

  (async () => {
    let sent = 0, skipped = 0, failed = 0, streak = 0, status = 'done';
    for (const t of targets) {
      if (stopFlags.has(row.id)) { status = 'stopped'; break; }
      if (sendingSuspendedReason()) { status = 'stopped'; break; }           // إنذار صحّة الحساب أثناء البثّ
      try {
        const msgText = fillVars(body, { ...t, activity: activityName, venue: venueName, place: placeText, when: whenText }) + (withFooter ? OPTOUT_FOOTER : '');
        const sentRes: any = await sendMessage(mediaId
          // يُرسَل بالمعرّف (رفعةٌ واحدة)، والرابط يُحفظ في السجلّ ليعرض الانبوكس الصورة
          ? { conversationId: t.id, image: { mediaId, ...(env.PUBLIC_URL ? { link: `${env.PUBLIC_URL}${imgRel}` } : {}), caption: msgText }, source: 'broadcast' as any }
          : { conversationId: t.id, text: msgText, source: 'broadcast' as any });
        sent++; streak = 0;
        // 👁 معرّف الرسالة يربط المستلم بحالتها (وصلت/قُرئت) — تقرير القراءة لكلّ بثّ
        await db.execute(sql`INSERT INTO wa_broadcast_recipients (broadcast_id, conversation_id, wa_message_id) VALUES (${row.id}, ${t.id}, ${sentRes?.message?.id ?? null}) ON CONFLICT DO NOTHING`).catch(() => {});
      } catch (e: any) {
        if (e?.code === 'WINDOW_EXPIRED') { skipped++; }                     // النافذة أُغلقت بين المعاينة والإرسال
        else if (e?.code === 'SENDING_SUSPENDED') { status = 'stopped'; break; }
        else { failed++; streak++; if (streak >= 5) { status = 'stopped'; break; } }
      }
      if ((sent + skipped + failed) % 10 === 0) await db.update(waBroadcasts).set({ sentCount: sent, skippedCount: skipped, failedCount: failed } as any).where(eq(waBroadcasts.id, row.id)).catch(() => {});
      await new Promise(r => setTimeout(r, PACE_MS + Math.random() * 500));
    }
    await db.update(waBroadcasts).set({ sentCount: sent, skippedCount: skipped, failedCount: failed, status, finishedAt: new Date() } as any).where(eq(waBroadcasts.id, row.id)).catch(() => {});
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

export function stopBroadcast(id: number) { stopFlags.add(Number(id)); return true; }

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
           COUNT(*) FILTER (WHERE m.id IS NULL OR m.status NOT IN ('read', 'delivered', 'failed'))::int AS not_delivered
      FROM wa_broadcast_recipients r ${RECIPIENT_MSG}
     WHERE r.broadcast_id IN (${sql.join(ids.map(i => sql`${i}`), sql`, `)})
     GROUP BY r.broadcast_id`));
  const by = new Map(stats.map((s: any) => [Number(s.id), s]));
  return list.map((b: any) => {
    const s: any = by.get(Number(b.id));
    return { ...b, readStats: s ? { recipients: s.recipients, read: s.read, delivered: s.delivered, notDelivered: s.not_delivered, failed: s.failed } : null };
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
  const status = ['running', 'done', 'stopped'].includes(String(o.status)) ? String(o.status) : null;
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
             COUNT(*) FILTER (WHERE m.id IS NULL OR m.status NOT IN ('read', 'delivered', 'failed'))::int AS not_delivered
        FROM wa_broadcast_recipients r ${RECIPIENT_MSG}
       WHERE r.broadcast_id IN (SELECT id FROM sc)
       GROUP BY r.broadcast_id),
    j AS (
      SELECT sc.*, t.name AS template_name, st.recipients, st.read, st.delivered, st.failed AS failed_msgs, st.not_delivered,
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
      const started = b.created_at ? new Date(b.created_at).getTime() : null;
      const ended = b.finished_at ? new Date(b.finished_at).getTime() : null;
      return {
        id: Number(b.id), status: b.status, createdBy: b.created_by || '',
        createdAt: iso(b.created_at), finishedAt: iso(b.finished_at),
        durationSec: started && ended ? Math.max(0, Math.round((ended - started) / 1000)) : null,
        text: img ? raw.slice(img[0].length) : raw, imageUrl: img ? img[1] : null,
        templateId: b.template_id != null ? Number(b.template_id) : null, templateName: b.template_name || null,
        totalTargets: Number(b.total_targets || 0), sentCount: Number(b.sent_count || 0),
        skippedCount: Number(b.skipped_count || 0), failedCount: Number(b.failed_count || 0),
        readStats: b.recipients != null ? { recipients: Number(b.recipients), read: Number(b.read), delivered: Number(b.delivered), notDelivered: Number(b.not_delivered), failed: Number(b.failed_msgs) } : null,
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
  const group = (st: string | null) => st === 'read' ? 'read' : st === 'delivered' ? 'delivered' : st === 'failed' ? 'failed' : 'notDelivered';
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
    totals: { recipients: recipients.length, read: count('read'), delivered: count('delivered'), notDelivered: count('notDelivered'), failed: count('failed') },
    recipients,
  };
}
