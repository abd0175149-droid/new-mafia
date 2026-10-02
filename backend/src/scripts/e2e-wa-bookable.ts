// 🚫 فحصٌ حيّ لـnotBookable على فعاليّات الإنتاج الحقيقيّة — قراءةٌ فقط
//   docker compose exec -T backend npx tsx src/scripts/e2e-wa-bookable.ts
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
await connectDB(); const db = getDB()!;
const { notBookable } = await import('../services/whatsapp-bot.service.js');
const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = '') => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}`, c ? '' : x); };
const [cancelled] = await q(sql`SELECT id, name FROM activities WHERE status = 'cancelled' AND deleted_at IS NULL ORDER BY date DESC LIMIT 1`);
const [ended] = await q(sql`SELECT id, name FROM activities WHERE status = 'completed' AND deleted_at IS NULL ORDER BY date DESC LIMIT 1`);
const [upcoming] = await q(sql`SELECT id, name FROM activities WHERE status IN ('planned','active') AND deleted_at IS NULL AND date > now() ORDER BY date LIMIT 1`);
const [stale] = await q(sql`SELECT id, name FROM activities WHERE status IN ('planned','active') AND deleted_at IS NULL AND date < now() - interval '6 hours' ORDER BY date DESC LIMIT 1`);
const r264 = await notBookable(db, 264);
ok('الزرقاء ٢٦٤ (حالة علي) ⟵ مرفوضة كملغاة', !!r264?.notBookable && !!r264?.cancelled, r264);
if (cancelled) { const r = await notBookable(db, cancelled.id); ok(`ملغاة #${cancelled.id} ⟵ مرفوضة`, !!r?.cancelled, r); }
if (ended) { const r = await notBookable(db, ended.id); ok(`مكتملة #${ended.id} ⟵ مرفوضة كمنتهية`, !!r?.ended, r); }
if (stale) { const r = await notBookable(db, stale.id); ok(`«مخطّطة» فات موعدها #${stale.id} ⟵ مرفوضة كمنتهية`, !!r?.ended, r); }
else console.log('ℹ️ لا فعاليّة «مخطّطة» فات موعدها — تخطٍّ');
if (upcoming) { const r = await notBookable(db, upcoming.id); ok(`قادمة #${upcoming.id} «${upcoming.name}» ⟵ مقبولة`, r === null, r); }
const rx = await notBookable(db, 99999999);
ok('غير موجودة ⟵ مرفوضة', !!rx?.notBookable, rx);
console.log(`نجح ${pass} · فشل ${fail}`); process.exit(fail ? 1 : 0);
