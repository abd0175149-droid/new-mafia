// ══════════════════════════════════════════════════════
// 🔔 تذكير الحجز قبل اللعبة بساعة — واتساب
// ══════════════════════════════════════════════════════
// المنطق (قرار المالك):
//   • يُرسَل لأيّ حجز نافذته الحرّة (24 ساعة) مفتوحة وقت الإرسال — حتى لو حجز
//     قبل أكثر من 24 ساعة ثم عاد وراسل البوت (فتح نافذة جديدة). النافذة هي البوّابة.
//   • الموافقة ضمنيّة افتراضاً (remind_opt_in = true)؛ من ضغط «لا شكراً» يُستبعد.
//   • عرض الخيار بالأزرار يظهر فقط لمن حجز ≤24 ساعة (وعدٌ نضمنه) — أمّا الإرسال فأوسع.
//   • ماسح كل 60 ثانية يقرأ DB (يصمد عبر إعادة التشغيل، بلا مؤقّتات ذاكرة).
//   • النافذة تُفحص لحظة الإرسال (isFreeWindowOpen)؛ إن كانت مغلقة يُترك لتكّة لاحقة.

import { and, eq, isNull, gt, lte, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { reservations, activities, locations, waConversations } from '../schemas/admin.schema.js';
import { sendMessage, isFreeWindowOpen, waEnabled } from './whatsapp-inbox.service.js';
import { normalizeLocalPhone } from '../utils/phone.util.js';
import { env } from '../config/env.js';

// 🇯🇴 توقيت الأردن ثابت UTC+3 — لعرض موعد اللعبة للعميل
const JO_OFFSET_MS = 3 * 3600e3;
const JO_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const JO_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
function fmtJo(input: any): string {
  const t = new Date(input).getTime();
  if (isNaN(t)) return '';
  const d = new Date(t + JO_OFFSET_MS);
  const base = `${JO_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${JO_MONTHS[d.getUTCMonth()]}`;
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ap = h < 12 ? 'صباحاً' : 'مساءً';
  h = h % 12 || 12;
  return `${base} — ${h}:${String(m).padStart(2, '0')} ${ap}`;
}

// مسحة واحدة: أرسِل التذكير لكلّ حجز مؤهّل نافذته مفتوحة، ولعبته خلال الساعة القادمة
export async function runReminderScan(): Promise<void> {
  const db = getDB();
  if (!db || !waEnabled() || env.WA_SUSPENDED) return;
  const now = Date.now();
  const horizon = new Date(now + 60 * 60 * 1000); // اللعبة خلال ≤60 دقيقة

  const rows = await db
    .select({
      id: reservations.id,
      phone: reservations.phone,
      people: reservations.peopleCount,
      actName: activities.name,
      actDate: activities.date,
      locName: locations.name,
      mapUrl: locations.mapUrl,
    })
    .from(reservations)
    .innerJoin(activities, eq(reservations.activityId, activities.id))
    .leftJoin(locations, eq(activities.locationId, locations.id))
    .where(and(
      eq(reservations.remindOptIn, true),
      isNull(reservations.remindSentAt),
      isNull(reservations.deletedAt),
      sql`${reservations.status} <> 'waitlist'`,
      isNull(activities.deletedAt),
      gt(activities.date, new Date(now)),   // اللعبة لم تبدأ بعد
      lte(activities.date, horizon),        // وخلال ≤60 دقيقة
    ));

  if (!rows.length) return;

  for (const r of rows) {
    try {
      const local = normalizeLocalPhone(r.phone);
      if (!local) continue;
      const [conv] = await db
        .select({ id: waConversations.id, lastInboundAt: waConversations.lastInboundAt })
        .from(waConversations)
        .where(eq(waConversations.phone, local))
        .limit(1);
      if (!conv) continue;                    // لا محادثة واتساب لهذا الرقم
      if (!isFreeWindowOpen(conv)) continue;  // النافذة مغلقة — لا نرسل (قد يفتحها لاحقاً قبل اللعبة)

      const loc = r.locName ? `${r.locName}${r.mapUrl ? ` — ${r.mapUrl}` : ''}` : '';
      const text = `🎭 تذكير: لعبتك بعد ساعة تقريباً!\n\n`
        + `الفعاليّة: ${r.actName}\n`
        + `الموعد: ${fmtJo(r.actDate)}\n`
        + `العدد: ${r.people || 1}\n`
        + (loc ? `📍 المكان: ${loc}\n` : '')
        + `\nنستنّاك 🎭 الدفع بالمكان.`;

      await sendMessage({ conversationId: conv.id, text, source: 'system' });
      await db.update(reservations).set({ remindSentAt: new Date() } as any).where(eq(reservations.id, r.id));
      console.log(`🔔 WA reminder sent → reservation #${r.id} (${r.actName})`);
    } catch (err: any) {
      console.warn(`⚠️ WA reminder reservation #${r.id}:`, err.message);
    }
  }
}

let started = false;
export function startReminderScheduler(): void {
  if (started) return;
  started = true;
  // ⛔ إجراء إنفاذ قائم من ميتا: لا إرسال تلقائيّ إطلاقاً حتى يُرفع.
  //    الرسائل كانت ستتوقّف وحدها بانغلاق نوافذ الـ24 ساعة، لكن «تتوقّف وحدها»
  //    ليست ضماناً — والضمان هو ما نحتاج إثباته في التظلّم. ارفع WA_SUSPENDED عند العودة.
  if (env.WA_SUSPENDED) {
    console.log('⛔ WhatsApp reminder scheduler NOT started — WA_SUSPENDED=1 (إجراء من ميتا قائم)');
    return;
  }
  setInterval(() => { runReminderScan().catch((e) => console.warn('⚠️ WA reminder scan:', e.message)); }, 60_000);
  console.log('🔔 WhatsApp reminder scheduler started (every 60s)');
}
