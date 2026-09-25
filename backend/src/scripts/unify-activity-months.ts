// ══════════════════════════════════════════════════════
// 🗓️ توحيد أسماء الأشهر في أسماء الفعاليّات
// ══════════════════════════════════════════════════════
// كان في النظام مساران لإنشاء الفعاليّة بالصيغة نفسها `{المكان} {اليوم}
// {الشهر}` وبقائمتَي أشهرٍ مختلفتين: نموذجُ الداشبورد مصريّ (سبتمبر) ومولّدُ
// الأسبوع شاميّ (أيلول). فالشهرُ الواحد له اسمان في القائمة، والاسمُ في رسالة
// التأكيد يخالف ما يراه الموظّف. أُصلحت الشيفرة، وهذا يُصلح ما مضى.
//
//   npx tsx src/scripts/unify-activity-months.ts            # عرضٌ فقط
//   npx tsx src/scripts/unify-activity-months.ts --apply    # تنفيذ
//
// 🔴 الاستبدال **بحدود الكلمة**: «مارس» شهرٌ وفعلٌ معاً، و«حفلة مارس» تُبدَّل
//    بينما «من مارسَ اللعبة» لا تُمسّ. ولا يُلمس اسمٌ لا يحمل شهراً مصريّاً،
//    فتكرارُ التشغيل لا يغيّر شيئاً.

import { sql } from 'drizzle-orm';
import { connectDB, getDB, disconnectDB } from '../config/db.js';

const EG = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const AR = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيّار', 'حزيران',
  'تمّوز', 'آب', 'أيلول', 'تشرين الأوّل', 'تشرين الثاني', 'كانون الأوّل'];

const APPLY = process.argv.includes('--apply');

/** يبدّل أسماء الأشهر المصريّة بالشاميّة — بحدود الكلمة وحدها */
export function unifyMonths(name: string): string {
  let out = name;
  for (let i = 0; i < EG.length; i++) {
    // الحدّ يستبعد الحروف **والتشكيل** معاً: الفتحة في «مارسَ» ليست حرفاً
    // (\p{M} لا \p{L})، فبلا استبعادها كان الفعل يُبدَّل كأنّه شهر.
    const re = new RegExp(`(?<![\\p{L}\\p{M}])${EG[i]}(?![\\p{L}\\p{M}])`, 'gu');
    out = out.replace(re, AR[i]);
  }
  return out;
}

async function main() {
  await connectDB();
  const db = getDB();
  if (!db) throw new Error('DB unavailable');

  const r: any = await db.execute(sql`
    SELECT id, name, date FROM activities WHERE deleted_at IS NULL ORDER BY date`);
  const rows: any[] = r.rows || r || [];

  const changes: Array<{ id: number; from: string; to: string; date: string }> = [];
  for (const a of rows) {
    const next = unifyMonths(String(a.name || ''));
    if (next !== a.name) changes.push({ id: Number(a.id), from: a.name, to: next, date: String(a.date).slice(0, 10) });
  }

  console.log(`\n🗓️ فعاليّات: ${rows.length} · تحتاج توحيداً: ${changes.length}\n`);
  for (const c of changes) console.log(`  #${c.id} ${c.date}  «${c.from}»  →  «${c.to}»`);

  if (!changes.length) { console.log('\n✅ لا شيء — الأسماء موحَّدة أصلاً.\n'); await disconnectDB(); return; }

  if (!APPLY) {
    console.log(`\n👁️  عرضٌ فقط. للتنفيذ: npx tsx src/scripts/unify-activity-months.ts --apply\n`);
    await disconnectDB();
    return;
  }

  let done = 0;
  for (const c of changes) {
    await db.execute(sql`UPDATE activities SET name = ${c.to} WHERE id = ${c.id}`);
    done++;
  }
  console.log(`\n✅ وُحِّد ${done} اسماً.\n`);
  await disconnectDB();
}

main().catch(async (e) => {
  console.error('❌', e?.message || e);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
