// ══════════════════════════════════════════════════════
// 🔋 تنبيه بطارية السيرفر — Battery Alert Push
// يرسل Push (FCM + WebPush) لمجموعة حسابات ثابتة (حسب رقم الهاتف).
// يُستدعى من مراقب البطارية على المضيف (battery-monitor.sh).
//
// الاستخدام:
//   npx tsx src/scripts/battery-alert.ts "<العنوان>" "<النص>"
//
// الأرقام المستهدفة تُضبط عبر BATTERY_ALERT_PHONES (مفصولة بفواصل) أو الافتراضي أدناه.
// ══════════════════════════════════════════════════════

import { inArray } from 'drizzle-orm';
import { connectDB, getDB, disconnectDB } from '../config/db.js';
import { players } from '../schemas/player.schema.js';
import { sendPushToPlayers } from '../services/fcm.service.js';

const PHONES = (process.env.BATTERY_ALERT_PHONES || '0789154719,0793020505,1234567890')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const TITLE = process.argv[2] || '🔋 تنبيه بطارية السيرفر';
const BODY = process.argv[3] || '';

async function main() {
  if (PHONES.length === 0) {
    console.error('❌ لا توجد أرقام هواتف مستهدفة');
    process.exit(1);
  }

  await connectDB();
  const db = getDB();
  if (!db) {
    console.error('❌ DB unavailable');
    process.exit(1);
  }

  const rows = await db
    .select({ id: players.id, name: players.name, phone: players.phone })
    .from(players)
    .where(inArray(players.phone, PHONES));

  const ids = Array.from(new Set(rows.map((r) => r.id)));
  if (ids.length === 0) {
    console.error(`❌ لا يوجد لاعب بأي من الأرقام: ${PHONES.join(', ')}`);
    await disconnectDB();
    process.exit(1);
  }

  // type='custom' — نوع نصّي حر في جدول player_notifications؛ الـ SW يعرض title/body/url
  await sendPushToPlayers(ids, TITLE, BODY, 'custom', { url: '/player/home', kind: 'battery' });

  console.log(`✅ تنبيه البطارية أُرسل إلى ${ids.length} حساب: ${rows.map((r) => `${r.name}(${r.phone})`).join(', ')}`);
  await disconnectDB();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ فشل إرسال تنبيه البطارية:', err);
  process.exit(1);
});
