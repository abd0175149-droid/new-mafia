// ══════════════════════════════════════════════════════
// ⏳ مدد الاحتفاظ — قانون ٢٤/٢٠٢٣: لا تُحفظ البياناتُ بعد انتهاء غرضها
//
// 🔴 لم تكن في المشروع مهلةُ حذفٍ واحدة: سجلاتُ الموقع وإشاراتُ الغشّ وأرشيفُ
//    واتساب والإشعارات كلُّها تتراكم بلا حدّ. سياسةٌ تُعلن مدّةً لا يفرضها الكود
//    إقرارٌ كاذب، فالمدد هنا هي نفسُها المكتوبة في السياسة حرفاً بحرف.
//
// 🔴 وما يفرضه قانونٌ آخر لا يُمسّ: القيدُ الماليّ (chips_ledger · order_invoices)
//    يبقى، ويُجهَّل بتجهيل صاحبه لا بحذف صفّه.
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';

/** المدد بالأيّام — تُغيَّر هنا وفي نصّ السياسة معاً، لا في أحدهما */
export const RETENTION = {
  /** سجلُّ فحوص الحضور — قيمتُه تشغيليّةٌ آنيّة لا تاريخيّة */
  presenceChecks: 365,
  /** إشاراتُ الغشّ — تكفي سنةٌ لكشف نمطٍ متكرّر */
  cheatSignals: 365,
  /** آخرُ موقعٍ مسجَّل بلا تحديثٍ منذ مدّة — لاعبٌ لم يحضر */
  lastFix: 90,
  /** أرشيفُ محادثات واتساب من آخر رسالة */
  waMessages: 730,
  /** الإشعاراتُ المقروءة — لا معنى لحفظها سنوات */
  notifications: 180,
  /** سجلُّ عمليّات الموظّفين — أثرُ مساءلةٍ إداريّ */
  staffActionLog: 730,
} as const;

async function del(label: string, stmt: any): Promise<number> {
  const db = getDB();
  if (!db) return 0;
  try {
    const r: any = await db.execute(stmt);
    const n = Number(r?.rowCount ?? r?.rows?.length ?? 0);
    if (n > 0) console.log(`⏳ ${label}: حُذف ${n} صفّاً`);
    return n;
  } catch (e: any) {
    console.error(`⚠️ مدّةُ الاحتفاظ (${label}):`, e.message);
    return 0;
  }
}

/** تُنادى يوميّاً. لا ترمي أبداً — تنظيفٌ فاشل لا يوقف الخادم. */
export async function runRetentionSweep(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};

  out.presenceChecks = await del('سجلّ الحضور', sql`
    DELETE FROM presence_checks WHERE created_at < NOW() - INTERVAL '${sql.raw(String(RETENTION.presenceChecks))} days'`);

  out.cheatSignals = await del('إشارات الغشّ', sql`
    DELETE FROM cheat_signals WHERE created_at < NOW() - INTERVAL '${sql.raw(String(RETENTION.cheatSignals))} days'`);

  // آخرُ موقعٍ لم يُحدَّث منذ مدّة — الصفُّ يُستبدل عادةً، فالقديمُ يعني انقطاعاً
  out.lastFix = await del('آخر موقع', sql`
    DELETE FROM player_last_fix WHERE updated_at < NOW() - INTERVAL '${sql.raw(String(RETENTION.lastFix))} days'`);

  out.waMessages = await del('رسائل واتساب', sql`
    DELETE FROM wa_messages WHERE created_at < NOW() - INTERVAL '${sql.raw(String(RETENTION.waMessages))} days'`);

  // محادثةٌ خلت من الرسائل ولم تُلمس منذ المدّة نفسها
  out.waConversations = await del('محادثات خالية', sql`
    DELETE FROM wa_conversations c
    WHERE c.last_message_at < NOW() - INTERVAL '${sql.raw(String(RETENTION.waMessages))} days'
      AND NOT EXISTS (SELECT 1 FROM wa_messages m WHERE m.conversation_id = c.id)`);

  out.notifications = await del('إشعارات مقروءة', sql`
    DELETE FROM player_notifications
    WHERE is_read = true AND created_at < NOW() - INTERVAL '${sql.raw(String(RETENTION.notifications))} days'`);

  out.staffActionLog = await del('سجلّ الموظّفين', sql`
    DELETE FROM staff_action_log WHERE created_at < NOW() - INTERVAL '${sql.raw(String(RETENTION.staffActionLog))} days'`);

  return out;
}
