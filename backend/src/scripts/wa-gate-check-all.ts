// ══════════════════════════════════════════════════════
// 📱 فحصٌ صامت لأرقام كلّ اللاعبين (بوّابة رقم الواتساب 2026-10-30)
// رقم الأعمال يسأل واتساب «هل هذا الرقم مسجّل؟» — لا رسالة ولا محادثة ولا إشعار للّاعب.
// يُفحص: من لا سجلّ له، ومن كان «بلا واتساب» (قد يكون ثبّته)، ومن مضى على فحصه الإيجابيّ ٣٠ يوماً.
// رقمٌ كلّ ~٣ ثوانٍ. تشغيل: npx tsx src/scripts/wa-gate-check-all.ts [--dry]
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { canonicalPhone, checkNow } from '../services/wa-number-gate.service.js';

const DRY = process.argv.includes('--dry');
const rows = (r: any): any[] => r?.rows ?? r ?? [];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  await connectDB();
  const db = getDB()!;
  const ps = rows(await db.execute(sql`SELECT phone FROM players WHERE deleted_at IS NULL AND merged_into_id IS NULL`));
  const checks = new Map<string, any>(rows(await db.execute(sql`SELECT phone, on_wa, checked_at FROM wa_number_checks`)).map((x: any) => [String(x.phone), x]));
  const todo = new Set<string>();
  let invalid = 0;
  for (const p of ps) {
    const c = canonicalPhone(p.phone);
    if (!c) { invalid++; continue; }
    const k = checks.get(c.local);
    if (!k || k.on_wa === false || Date.now() - new Date(k.checked_at).getTime() > 30 * 86400e3) todo.add(c.local);
  }
  console.log(`لاعبون ${ps.length} · غير صالح ${invalid} · للفحص ${todo.size}${DRY ? ' (معاينة)' : ''}`);
  if (DRY) process.exit(0);
  let yes = 0, no = 0, fail = 0, i = 0;
  for (const local of todo) {
    i++;
    const r = await checkNow(local, 15000);
    if (r === true) yes++; else if (r === false) no++; else { fail++; await sleep(15000); }
    if (i % 20 === 0) console.log(`  ${i}/${todo.size} · ✓ ${yes} · ✗ ${no} · تعذّر ${fail}`);
    await sleep(2500);
  }
  console.log(`انتهى: ✓ ${yes} · ✗ ${no} · تعذّر ${fail}`);
  process.exit(0);
}
main().catch(e => { console.error('💥', e); process.exit(2); });
