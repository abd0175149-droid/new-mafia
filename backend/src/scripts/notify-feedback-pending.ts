// ══════════════════════════════════════════════════════
// 📋 تذكير بتقييم الغرفة — Reminder for pending room feedback
// يُرسل إشعاراً داخل التطبيق + Push لكل لاعب لديه استبيان معلّق لغرفة معيّنة.
// الاستخدام:  npx tsx src/scripts/notify-feedback-pending.ts <sessionId>
// مثال:       npx tsx src/scripts/notify-feedback-pending.ts 219
// ══════════════════════════════════════════════════════

import { eq, and, isNull } from 'drizzle-orm';
import { connectDB, getDB, disconnectDB } from '../config/db.js';
import { roomFeedback } from '../schemas/feedback.schema.js';
import { sendPushToPlayers } from '../services/fcm.service.js';

const SESSION_ID = Number(process.argv[2] || 219);

const TITLE = '📋 تذكير — قيّم فعاليتك السابقة';
const BODY = 'لن تتمكن من حجز أو دخول الفعاليات القادمة قبل تقييم فعاليتك السابقة. التقييم أقل من دقيقة 🙏';

async function main() {
  if (!Number.isInteger(SESSION_ID) || SESSION_ID <= 0) {
    console.error('❌ sessionId غير صالح');
    process.exit(1);
  }

  await connectDB();
  const db = getDB();
  if (!db) { console.error('❌ DB unavailable'); process.exit(1); }

  // كل لاعب لديه استبيان معلّق (لم يُعبّأ) لهذه الغرفة
  const rows = await db.select({ playerId: roomFeedback.playerId })
    .from(roomFeedback)
    .where(and(eq(roomFeedback.sessionId, SESSION_ID), isNull(roomFeedback.submittedAt)));

  const ids = Array.from(new Set(rows.map(r => r.playerId).filter(Boolean))) as number[];
  console.log(`📋 Session #${SESSION_ID}: ${ids.length} لاعب لديهم استبيان معلّق`);
  console.log('   IDs:', ids.join(', '));

  if (ids.length === 0) {
    console.log('✅ لا يوجد من يحتاج تذكيراً');
    await disconnectDB();
    process.exit(0);
  }

  await sendPushToPlayers(ids, TITLE, BODY, 'feedback_survey', {
    sessionId: SESSION_ID,
    url: `/player/feedback?sessionId=${SESSION_ID}`,
  });

  console.log('✅ تم إرسال التذكير (إشعار داخل التطبيق + Push)');
  await disconnectDB();
  process.exit(0);
}

main().catch((err) => { console.error('❌ فشل:', err); process.exit(1); });
