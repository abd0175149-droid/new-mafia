// ══════════════════════════════════════════════════════
// ⏱️ متابعة المحادثات — «راسلنا واختفى قبل ما يحجز»
// ══════════════════════════════════════════════════════
// المشكلة التي تحلّها: الزبون يسأل عن الفعاليّات أو يصل لزرّ التأكيد ثمّ ينشغل،
// فتموت المحادثة صامتةً. كان المالك يفتح الإنبوكس ويحقن رسالةً بيده لكلّ واحد.
//
// 🔴 ثلاثة مبادئ:
//
// (١) **الصمت هو المُشغِّل، لا الوقت.** المتابعة تنطلق بعد سكوتٍ متّصل لا بعد
//     مدّةٍ من أوّل رسالة — فمن ما زال يكتب لا يُقاطَع أبداً.
//
// (٢) **متابعتان على الأكثر، ثمّ صمتٌ نهائيّ.** كلّ رسالةٍ لم يطلبها الزبون خطرٌ
//     على تقييم الرقم: البلاغات هي ما يُهبطه، لا عدد الرسائل. من لم يردّ على
//     اثنتين لن يردّ على ثالثة — وسيُبلّغ عنها.
//
// (٣) **الحالة في القاعدة لا في الذاكرة.** ماسحٌ كلّ ٦٠ ثانية يقرأ الصفوف،
//     فإعادةُ التشغيل لا تُضيّع متابعةً ولا تُرسلها مرّتين.
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { env } from '../config/env.js';

export interface FollowupConfig {
  enabled: boolean;
  /** دقائق الصمت قبل المتابعة الأولى */
  firstAfterMinutes: number;
  /** ساعات بعد المتابعة الأولى قبل الثانية (٠ = متابعةٌ واحدة فقط) */
  secondAfterHours: number;
  /** لا نُتابع صمتاً أقدم من هذا (يمنع «متابعةً» لمحادثةٍ ماتت من الصباح) */
  maxSilenceHours: number;
  /** ساعات الهدوء بتوقيت عمّان — لا متابعة فيها */
  quietFromHour: number;
  quietToHour: number;
  /** سقف يوميّ لكلّ المتابعات — صمّام أمان */
  maxPerDay: number;
  /** الجمهور: كلّ من لم يُثبّت حجزاً · أو الجدد بلا حساب فقط */
  audience: 'unbooked' | 'new_only';
  instructionFirst: string;
  instructionSecond: string;
}

export const DEFAULT_FOLLOWUP: FollowupConfig = {
  enabled: false,                 // يُنشر مطفأً — التفعيل قرارٌ واعٍ من الشاشة
  firstAfterMinutes: 10,
  secondAfterHours: 12,
  maxSilenceHours: 6,
  quietFromHour: 23,
  quietToHour: 9,
  maxPerDay: 60,
  audience: 'unbooked',
  instructionFirst:
    '⚠️ تنبيه نظام داخليّ (العميل لا يراه ولا يصله): مضت دقائق على آخر رسالة في هذه المحادثة، '
    + 'والعميل لم يُثبّت أيّ حجز بعد. أرسل **متابعةً واحدة قصيرة** تُكمل من حيث توقّفتما بالضبط:\n'
    + '• اختار فعاليّة ولم يؤكّد ⟵ ذكّره بلطف أنّ كبسة التأكيد وحدها تفصله عن الحجز، وأعد إرسالها إن لزم.\n'
    + '• سأل عن الفعاليّات ولم يختر ⟵ اعرضها عليه بالأداة باختصار.\n'
    + '• لم تصل المحادثة إلى شيء ⟵ اسأله سؤالاً واحداً يفتح الباب (كم شخص؟ أيّ يوم بناسبك؟).\n'
    + 'ممنوع: الاعتذار عن التأخير · قول إنّك تتابع آليّاً · تكرار كلامك السابق حرفيّاً · أكثر من رسالة أو سؤال. '
    + 'واترك له مخرجاً مهذّباً («وإذا مش هلّأ ولا يهمّك — أنا موجود»).',
  instructionSecond:
    '⚠️ تنبيه نظام داخليّ (العميل لا يراه ولا يصله): مضت ساعات على متابعتك الأولى ولم يردّ العميل ولم يحجز. '
    + 'هذه **آخر متابعة** — رسالة واحدة قصيرة دافئة بلا إلحاح: ذكّره بما يهمّه (أقرب فعاليّة أو ما سأل عنه تحديداً)، '
    + 'وأنهِ بوضوحٍ أنّك لن تُزعجه أكثر وأنّك موجود وقت ما يحبّ. سؤالٌ واحد على الأكثر، ولا تُلحّ.',
};

function clampInt(v: any, min: number, max: number, fb: number): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
}

export function mergeFollowup(raw: any): FollowupConfig {
  const d = DEFAULT_FOLLOWUP;
  const v = raw && typeof raw === 'object' ? raw : {};
  const str = (x: any, fb: string) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, 4000) : fb);
  return {
    enabled: v.enabled != null ? !!v.enabled : d.enabled,
    firstAfterMinutes: clampInt(v.firstAfterMinutes, 1, 24 * 60, d.firstAfterMinutes),
    secondAfterHours: clampInt(v.secondAfterHours, 0, 23, d.secondAfterHours),
    maxSilenceHours: clampInt(v.maxSilenceHours, 1, 24, d.maxSilenceHours),
    quietFromHour: clampInt(v.quietFromHour, 0, 23, d.quietFromHour),
    quietToHour: clampInt(v.quietToHour, 0, 23, d.quietToHour),
    maxPerDay: clampInt(v.maxPerDay, 0, 1000, d.maxPerDay),
    audience: v.audience === 'new_only' ? 'new_only' : 'unbooked',
    instructionFirst: str(v.instructionFirst, d.instructionFirst),
    instructionSecond: str(v.instructionSecond, d.instructionSecond),
  };
}

export async function getFollowupConfig(): Promise<FollowupConfig> {
  try {
    const { getBotSettings } = await import('./whatsapp-bot.service.js');
    const s: any = await getBotSettings();
    return mergeFollowup(s?.followup);
  } catch {
    return DEFAULT_FOLLOWUP;
  }
}

function rowsOf(res: any): any[] {
  return res?.rows ?? (Array.isArray(res) ? res : []);
}

/** ساعة عمّان الآن (UTC+3 ثابتة — الأردن ألغى التوقيت الصيفيّ) */
function ammanHour(): number {
  return new Date(Date.now() + 3 * 3600e3).getUTCHours();
}

function inQuietHours(cfg: FollowupConfig): boolean {
  const h = ammanHour();
  const { quietFromHour: from, quietToHour: to } = cfg;
  if (from === to) return false;
  return from < to ? (h >= from && h < to) : (h >= from || h < to);
}

// ══════════════════════════════════════════════════════
// إيقافُ المتابعة بطلب العميل
// ══════════════════════════════════════════════════════
// لا نُبقيها قراراً للنموذج: «مش مهتمّ» جملةٌ صريحة، وكلفةُ تجاهلها بلاغٌ من زبون.
const REFUSAL_RE = /(مش\s*مهتم|ما\s*بدي|لا\s*شكرا|لا\s*شكراً|مو\s*هلق|مش\s*هلق|مش\s*هلأ|بعدين\s*بحكيك|وقّف|بلاش|كفى|stop|unsubscribe)/i;

/**
 * تُستدعى مع كلّ رسالةٍ واردة. رفضٌ صريح بعد متابعةٍ أُرسلت ⟵ لا متابعة أخرى أبداً.
 * صامتة تماماً حين لا متابعة جارية.
 */
export async function noteInboundForFollowup(convId: number, text: string): Promise<void> {
  if (!text || !REFUSAL_RE.test(text)) return;
  const db = getDB();
  if (!db) return;
  await db.execute(sql`
    UPDATE wa_conversations
       SET followup_stopped_at = NOW(), followup_stop_reason = 'customer'
     WHERE id = ${convId} AND COALESCE(followup_stage,0) > 0 AND followup_stopped_at IS NULL`);
}

// ══════════════════════════════════════════════════════
// الماسح
// ══════════════════════════════════════════════════════

let sentToday = { day: '', n: 0 };
function bumpDaily(): number {
  const day = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  if (sentToday.day !== day) sentToday = { day, n: 0 };
  return ++sentToday.n;
}
function dailyCount(): number {
  const day = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  return sentToday.day === day ? sentToday.n : 0;
}

export async function followupTick(): Promise<void> {
  const db = getDB();
  if (!db || !env.WA_TOKEN) return;
  const cfg = await getFollowupConfig();
  if (!cfg.enabled) return;
  if (inQuietHours(cfg)) return;
  if (cfg.maxPerDay > 0 && dailyCount() >= cfg.maxPerDay) return;

  // الإرسال مقفل (إجراء ميتا أو مراقب الصحّة) ⟵ لا متابعات
  try {
    const { sendingSuspendedReason } = await import('./whatsapp-inbox.service.js');
    if (sendingSuspendedReason()) return;
  } catch { /* تكميليّ */ }

  const firstMin = cfg.firstAfterMinutes;
  const secondH = cfg.secondAfterHours;
  const maxSilenceH = cfg.maxSilenceHours;

  const r = await db.execute(sql`
    SELECT c.id, c.phone, c.player_id, COALESCE(c.followup_stage,0) AS stage
      FROM wa_conversations c
     WHERE c.bot_enabled = true
       AND c.status = 'open'
       AND c.needs_attention = false
       AND (c.bot_paused_until IS NULL OR c.bot_paused_until < NOW())
       AND c.followup_stopped_at IS NULL
       -- نافذة الـ٢٤ ساعة مفتوحة بهامش نصف ساعة (الإرسال يُرفض بعدها أصلاً)
       AND c.last_inbound_at > NOW() - INTERVAL '23 hours 30 minutes'
       ${cfg.audience === 'new_only' ? sql`AND c.player_id IS NULL AND c.created_at > NOW() - INTERVAL '48 hours'` : sql``}
       AND (
         (COALESCE(c.followup_stage,0) = 0
           AND c.last_message_at < NOW() - (${firstMin} * INTERVAL '1 minute')
           AND c.last_message_at > NOW() - (${maxSilenceH} * INTERVAL '1 hour'))
         OR
         (${secondH} > 0 AND COALESCE(c.followup_stage,0) = 1
           AND c.followup_last_at < NOW() - (${secondH} * INTERVAL '1 hour')
           AND c.last_message_at < NOW() - (${firstMin} * INTERVAL '1 minute'))
       )
       -- ثبّت حجزاً قادماً؟ متابعةٌ لمن حجز إزعاجٌ صرف
       AND NOT EXISTS (
         SELECT 1 FROM reservations r JOIN activities a ON a.id = r.activity_id
          WHERE r.deleted_at IS NULL AND a.deleted_at IS NULL AND a.date >= NOW()
            AND (r.phone = c.phone OR (c.player_id IS NOT NULL AND r.player_id = c.player_id))
       )
       AND NOT EXISTS (
         SELECT 1 FROM bookings b JOIN activities a2 ON a2.id = b.activity_id
          WHERE b.deleted_at IS NULL AND a2.deleted_at IS NULL AND a2.date >= NOW()
            AND (b.phone = c.phone OR (c.player_id IS NOT NULL AND b.player_id = c.player_id))
       )
       AND NOT EXISTS (SELECT 1 FROM wa_optouts o WHERE o.phone = c.phone)
     ORDER BY c.last_message_at ASC
     LIMIT 10`);

  const rows = rowsOf(r);
  if (!rows.length) return;

  const { runFollowUp } = await import('./whatsapp-bot.service.js');
  for (const row of rows) {
    if (cfg.maxPerDay > 0 && dailyCount() >= cfg.maxPerDay) break;
    const stage = (Number(row.stage) === 0 ? 1 : 2) as 1 | 2;

    // 🔒 حجزُ الدور قبل الإرسال: تحديثٌ مشروط يمنع تكرار المتابعة لو تأخّر النداء
    //    أو تداخلت تكّتان — الحالة تتقدّم أوّلاً ثمّ نرسل.
    const claimed = await db.execute(sql`
      UPDATE wa_conversations
         SET followup_stage = ${stage}, followup_last_at = NOW(), updated_at = NOW()
       WHERE id = ${row.id} AND COALESCE(followup_stage,0) = ${stage - 1}
       RETURNING id`);
    if (!rowsOf(claimed).length) continue;

    const instruction = stage === 1 ? cfg.instructionFirst : cfg.instructionSecond;
    try {
      const out = await runFollowUp(Number(row.id), stage, instruction);
      if (out.sent) {
        bumpDaily();
        console.log(`⏱️ WA follow-up #${stage} → conv ${row.id}`);
      } else {
        // لم تُرسل (نافذة/إيقاف/خلل): أعِد الحالة كما كانت ليُعاد النظر لاحقاً،
        // إلّا إن كان السبب دائماً (نافذة مغلقة) فنوقفها صراحةً بسببٍ مقروء.
        const permanent = out.reason === 'window' || out.reason === 'no-conv';
        await db.execute(sql`
          UPDATE wa_conversations
             SET followup_stage = ${stage - 1},
                 followup_last_at = ${stage === 1 ? null : sql`followup_last_at`},
                 followup_stopped_at = ${permanent ? sql`NOW()` : sql`NULL`},
                 followup_stop_reason = ${permanent ? String(out.reason) : ''}
           WHERE id = ${row.id}`);
      }
    } catch (e: any) {
      console.warn('⚠️ WA follow-up send:', e?.message || e);
    }
  }
}

let started = false;
export function startFollowupScheduler(): void {
  if (started) return;
  started = true;
  const tick = () => followupTick().catch(e => console.warn('⚠️ WA follow-up tick:', e?.message || e));
  setTimeout(tick, 90_000);
  setInterval(tick, 60_000);
  console.log('⏱️ WA follow-up scheduler started (every 60s)');
}

// ══════════════════════════════════════════════════════
// تقريرٌ مختصر للوحة
// ══════════════════════════════════════════════════════
export async function getFollowupStats(days = 7): Promise<any> {
  const db = getDB();
  if (!db) return null;
  const d = Math.min(Math.max(Math.trunc(Number(days)) || 7, 1), 90);
  const r = await db.execute(sql`
    SELECT COUNT(*) FILTER (WHERE followup_stage >= 1)::int AS first_sent,
           COUNT(*) FILTER (WHERE followup_stage >= 2)::int AS second_sent,
           COUNT(*) FILTER (WHERE followup_stop_reason = 'customer')::int AS stopped_by_customer
      FROM wa_conversations
     WHERE followup_last_at > NOW() - (${d} * INTERVAL '1 day')`);
  // ردّ بعد المتابعة = وصلت رسالة عميلٍ بعد آخر متابعة
  const rep = await db.execute(sql`
    SELECT COUNT(*)::int AS replied FROM wa_conversations
     WHERE followup_last_at > NOW() - (${d} * INTERVAL '1 day')
       AND last_inbound_at > followup_last_at`);
  // حجَز بعد المتابعة
  const bk = await db.execute(sql`
    SELECT COUNT(DISTINCT c.id)::int AS booked
      FROM wa_conversations c
      JOIN reservations r ON (r.phone = c.phone OR (c.player_id IS NOT NULL AND r.player_id = c.player_id))
     WHERE c.followup_last_at > NOW() - (${d} * INTERVAL '1 day')
       AND r.deleted_at IS NULL AND r.created_at > c.followup_last_at`);
  return {
    days: d,
    ...(rowsOf(r)[0] || {}),
    replied: Number(rowsOf(rep)[0]?.replied || 0),
    booked: Number(rowsOf(bk)[0]?.booked || 0),
    today: dailyCount(),
  };
}
