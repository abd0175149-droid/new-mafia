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
import { getDB } from '../config/db.js';
import { waBroadcasts, waMessageTemplates } from '../schemas/admin.schema.js';
import { sendMessage, sendingSuspendedReason } from './whatsapp-inbox.service.js';

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
  const f = q.filter || 'all';
  const extra = f === 'players' ? sql`AND c.player_id IS NOT NULL`
    : f === 'visitors' ? sql`AND c.player_id IS NULL`
    : f === 'booked_upcoming' ? sql`AND (EXISTS (SELECT 1 FROM reservations r JOIN activities a ON a.id = r.activity_id WHERE r.deleted_at IS NULL AND a.date > NOW() AND (r.phone = c.phone OR (c.player_id IS NOT NULL AND r.player_id = c.player_id))) OR EXISTS (SELECT 1 FROM bookings b JOIN activities a ON a.id = b.activity_id WHERE b.deleted_at IS NULL AND a.date > NOW() AND (b.phone = c.phone OR (c.player_id IS NOT NULL AND b.player_id = c.player_id))))`
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

export async function startBroadcast(input: AudienceQuery & { body: string; createdBy: string; appendOptout?: boolean; templateId?: number | null }): Promise<{ ok: boolean; error?: string; id?: number; total?: number }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  const body = String(input.body || '').trim();
  if (body.length < 5) return { ok: false, error: 'اكتب نصّ الرسالة (٥ أحرف على الأقلّ)' };
  if (body.length > 900) return { ok: false, error: 'النصّ طويل — الحدّ ٩٠٠ حرف' };
  if (/https?:\/\/(?!club-mafia\.grade\.sbs|mafia-club\.masaros\.net|(www\.)?instagram\.com\/mafia_club_jo)/i.test(body)) return { ok: false, error: 'الروابط الخارجيّة غير مسموحة في البثّ (روابط النادي فقط)' };
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
  const aud = await previewAudience(input);
  if (!aud.total) return { ok: false, error: 'لا مستلمين بنافذة مفتوحة يطابقون الفلتر' };
  const targets = aud.rows;
  const [row] = await db.insert(waBroadcasts).values({ body, templateId: input.templateId || null, totalTargets: targets.length, status: 'running', createdBy: input.createdBy } as any).returning();
  if (input.templateId) await db.update(waMessageTemplates).set({ usedCount: sql`COALESCE(${waMessageTemplates.usedCount}, 0) + 1` } as any).where(eq(waMessageTemplates.id, Number(input.templateId))).catch(() => {});
  running = row.id;
  const withFooter = input.appendOptout !== false;

  (async () => {
    let sent = 0, skipped = 0, failed = 0, streak = 0, status = 'done';
    for (const t of targets) {
      if (stopFlags.has(row.id)) { status = 'stopped'; break; }
      if (sendingSuspendedReason()) { status = 'stopped'; break; }           // إنذار صحّة الحساب أثناء البثّ
      try {
        await sendMessage({ conversationId: t.id, text: fillVars(body, { ...t, activity: activityName, venue: venueName, place: placeText, when: whenText }) + (withFooter ? OPTOUT_FOOTER : ''), source: 'broadcast' as any });
        sent++; streak = 0;
        await db.execute(sql`INSERT INTO wa_broadcast_recipients (broadcast_id, conversation_id) VALUES (${row.id}, ${t.id}) ON CONFLICT DO NOTHING`).catch(() => {});
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
     WHERE a.deleted_at IS NULL AND a.date > NOW() - INTERVAL '6 hours' ORDER BY a.date LIMIT 12`);
  return rowsOf(r).map((x: any) => ({
    id: Number(x.id), name: x.name, date: x.date,
    venue: x.venue || '', place: formatPlace(x.venue, x.region, x.city), when: fmtWhen(x.date),
  }));
}

export function stopBroadcast(id: number) { stopFlags.add(Number(id)); return true; }

export async function listBroadcasts(limit = 20) {
  const db = getDB(); if (!db) return [];
  return db.select().from(waBroadcasts).orderBy(desc(waBroadcasts.id)).limit(limit);
}
