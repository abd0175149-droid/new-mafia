// ══════════════════════════════════════════════════════
// 📱 بوّابة رقم الواتساب — ترحيلٌ لمرّةٍ واحدة (2026-10-30)
//   ١. الأرقام المكتوبة بصيغةٍ غريبة (أرقام عربيّة، +962 بمسافات، 00962، ناقص الصفر، حرفٌ خفيّ)
//      تُحفظ بصيغتها المعتمدة 07XXXXXXXX.
//   ٢. الرقم نفسه على حسابين (القرار ٥: دمجٌ تلقائيّ) — يُدمج حين يكون الحسابان للشخص نفسه
//      (اسمان يشتركان بكلمة، أو بخطّين مختلفين لا يُقارنان). اسمان مختلفان بالخطّ نفسه = شخصان
//      (أختان على رقمٍ واحد): لا دمج، ومن لم يُحفظ رقمه بالصيغة المعتمدة تطلب منه البوّابة رقمه.
//   الدمج: كلّ صفٍّ يشير إلى المصدر يُنقل إلى الهدف (الصفّ المتعارض مع قيدٍ فريد يُحذف ويُسجَّل)،
//   ثمّ يُعاد حساب رتبة الهدف من سجلّ مبارياته، والمصدر يُعلَّم merged_into_id ويُخفى.
// تشغيل: npx tsx src/scripts/wa-gate-migrate.ts            (معاينة — لا يكتب شيئاً)
//        npx tsx src/scripts/wa-gate-migrate.ts --apply    (بعد نسخةٍ احتياطيّة)
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { canonicalPhone } from '../services/wa-number-gate.service.js';

const APPLY = process.argv.includes('--apply');
const rows = (r: any): any[] => r?.rows ?? r ?? [];
const AR = (s: string) => String(s || '').toLowerCase().replace(/[ً-ْـ‎‏‪-‮]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^a-zء-ي\s]/g, ' ').split(/\s+/).filter(t => t.length >= 2);
const latin = (t: string[]) => t.some(x => /[a-z]/.test(x));
/** الشخص نفسه؟ كلمةٌ مشتركة (مع تسامحٍ لحرفٍ أو اثنين)، أو خطّان مختلفان لا يُقارنان */
function samePerson(a: string, b: string): boolean {
  const x = AR(a), y = AR(b);
  if (!x.length || !y.length) return true;
  if (latin(x) !== latin(y)) return true;
  const near = (p: string, q: string) => {
    if (p === q || p.includes(q) || q.includes(p)) return true;
    if (Math.abs(p.length - q.length) > 1 || p.length < 4) return false;
    let d = 0; for (let i = 0; i < Math.min(p.length, q.length); i++) if (p[i] !== q[i]) d++;
    return d + Math.abs(p.length - q.length) <= 1;
  };
  return x.some(p => y.some(q => near(p, q)));
}

async function main() {
  await connectDB();
  const db = getDB()!;
  const ps = rows(await db.execute(sql`SELECT p.id, p.phone, p.name,
      (SELECT count(*) FROM match_players m WHERE m.player_id = p.id)::int AS mp,
      (SELECT count(*) FROM bookings b WHERE b.player_id = p.id AND b.deleted_at IS NULL)::int AS bk,
      (SELECT count(*) FROM orders o WHERE o.player_id = p.id)::int AS ord
    FROM players p WHERE p.deleted_at IS NULL AND p.merged_into_id IS NULL ORDER BY p.id`));
  const groups = new Map<string, any[]>();
  for (const p of ps) {
    const c = canonicalPhone(p.phone);
    if (!c) continue;
    p.canon = c.local;
    (groups.get(c.local) || groups.set(c.local, []).get(c.local)!).push(p);
  }

  const normalize: any[] = [], merges: { source: any; target: any; canon: string }[] = [], shared: any[] = [];
  for (const [canon, list] of groups) {
    if (list.length === 1) { if (list[0].phone !== canon) normalize.push(list[0]); continue; }
    // الهدف: الأكثر نشاطاً، ثمّ الأقدم
    const sorted = [...list].sort((a, b) => (b.mp + b.bk + b.ord) - (a.mp + a.bk + a.ord) || a.id - b.id);
    const target = sorted[0];
    for (const other of sorted.slice(1)) {
      if (samePerson(target.name, other.name)) merges.push({ source: other, target, canon });
      else shared.push({ a: target, b: other, canon });
    }
  }

  const mask = (s: string) => s.length > 6 ? `${s.slice(0, 3)}…${s.slice(-3)}` : s;
  console.log(`\n١ · تصحيح الصيغة: ${normalize.length} رقماً`);
  for (const p of normalize) console.log(`   #${p.id} «${mask(p.phone)}» ⟵ ${mask(p.canon)}`);
  console.log(`\n٢ · دمج (الشخص نفسه): ${merges.length}`);
  for (const m of merges) console.log(`   #${m.source.id} «${m.source.name}» (مباريات ${m.source.mp} · حجوزات ${m.source.bk} · طلبات ${m.source.ord}) ⟵ في #${m.target.id} «${m.target.name}» (${m.target.mp}/${m.target.bk}/${m.target.ord})`);
  console.log(`\n٣ · شخصان على رقمٍ واحد — بلا دمج، والبوّابة تطلب رقماً: ${shared.length}`);
  for (const s of shared) console.log(`   #${s.a.id} «${s.a.name}» و#${s.b.id} «${s.b.name}» (${mask(s.canon)})`);

  if (!APPLY) { console.log('\n(معاينة — لا شيء كُتب. أعد التشغيل بـ --apply)'); process.exit(0); }

  const cols = rows(await db.execute(sql`SELECT c.table_name, c.column_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.table_name <> 'players'
      AND (c.column_name ~ 'player_id$' OR c.column_name IN ('follower_id', 'followee_id', 'followed_id'))
      AND c.column_name !~ 'session_player_id$'
      -- دفتر التشبس للإضافة فقط (مُشغِّلٌ يمنع التعديل): الرصيد يُنقل بقيدين جديدين لا بتعديل التاريخ
      AND c.table_name <> 'chips_ledger'`));

  for (const m of merges) {
    const S = Number(m.source.id), T = Number(m.target.id);
    const moved: Record<string, number> = {}, dropped: Record<string, number> = {};
    await db.transaction(async (tx) => {
      for (const c of cols) {
        const tbl = sql.identifier(c.table_name), col = sql.identifier(c.column_name);
        const ids = rows(await tx.execute(sql`SELECT ctid::text AS t FROM ${tbl} WHERE ${col} = ${S}`));
        for (const r of ids) {
          await tx.execute(sql`SAVEPOINT mv`);
          try {
            await tx.execute(sql`UPDATE ${tbl} SET ${col} = ${T} WHERE ctid = ${r.t}::tid`);
            await tx.execute(sql`RELEASE SAVEPOINT mv`);
            moved[`${c.table_name}.${c.column_name}`] = (moved[`${c.table_name}.${c.column_name}`] || 0) + 1;
          } catch {
            // قيدٌ فريد (للهدف صفٌّ مماثل): يبقى صفّ الهدف ويُحذف صفّ المصدر
            await tx.execute(sql`ROLLBACK TO SAVEPOINT mv`);
            await tx.execute(sql`DELETE FROM ${tbl} WHERE ctid = ${r.t}::tid`);
            dropped[`${c.table_name}.${c.column_name}`] = (dropped[`${c.table_name}.${c.column_name}`] || 0) + 1;
          }
        }
      }
      // 💰 رصيد التشبس: قيدٌ يُخرجه من المصدر وقيدٌ يُدخله للهدف (التاريخ كما هو)
      const [sb] = rows(await tx.execute(sql`SELECT chips_balance AS b FROM players WHERE id = ${S} FOR UPDATE`));
      const bal = Number(sb?.b || 0);
      if (bal !== 0) {
        const [tb] = rows(await tx.execute(sql`SELECT chips_balance AS b FROM players WHERE id = ${T} FOR UPDATE`));
        const tAfter = Number(tb?.b || 0) + bal;
        await tx.execute(sql`INSERT INTO chips_ledger (player_id, amount, balance_after, reason, ref_type, ref_id, idempotency_key, note)
          VALUES (${S}, ${-bal}, 0, 'merge_out', 'player', ${String(T)}, ${`merge:${S}:${T}:out`}, 'دمج حسابٍ مكرّر (الرقم نفسه) — بوّابة رقم الواتساب')`);
        await tx.execute(sql`INSERT INTO chips_ledger (player_id, amount, balance_after, reason, ref_type, ref_id, idempotency_key, note)
          VALUES (${T}, ${bal}, ${tAfter}, 'merge_in', 'player', ${String(S)}, ${`merge:${S}:${T}:in`}, 'دمج حسابٍ مكرّر (الرقم نفسه) — بوّابة رقم الواتساب')`);
        await tx.execute(sql`UPDATE players SET chips_balance = 0 WHERE id = ${S}`);
        await tx.execute(sql`UPDATE players SET chips_balance = ${tAfter} WHERE id = ${T}`);
        moved['chips_balance'] = bal;
      }
      await tx.execute(sql`UPDATE players SET phone = ${'merged:' + S}, merged_into_id = ${T}, deleted_at = NOW() WHERE id = ${S}`);
      await tx.execute(sql`UPDATE players SET phone = ${m.canon} WHERE id = ${T}`);
      await tx.execute(sql`INSERT INTO player_phone_changes (player_id, old_phone, new_phone, source, details)
        VALUES (${T}, ${m.target.phone}, ${m.canon}, 'merge', ${JSON.stringify({ mergedFrom: S, sourcePhone: m.source.phone, sourceName: m.source.name, moved, dropped })}::jsonb)`);
    });
    console.log(`   ✓ #${S} ⟵ #${T} · نُقل ${JSON.stringify(moved)}${Object.keys(dropped).length ? ` · حُذف متعارض ${JSON.stringify(dropped)}` : ''}`);
  }

  for (const p of normalize) {
    try {
      await db.execute(sql`UPDATE players SET phone = ${p.canon} WHERE id = ${p.id}`);
      await db.execute(sql`INSERT INTO player_phone_changes (player_id, old_phone, new_phone, source) VALUES (${p.id}, ${p.phone}, ${p.canon}, 'normalize')`);
    } catch (e: any) { console.log(`   ✗ #${p.id}: ${e?.message}`); }
  }
  console.log(`   ✓ صُحّحت ${normalize.length} صيغة`);

  // رتبة الهدف من سجلّ مبارياته (نُقلت إليه مباريات المصدر)
  const targets = [...new Set(merges.map(m => Number(m.target.id)))];
  if (targets.length) {
    try {
      const { reconcileSeasonProgression } = await import('../services/reconcile.service.js');
      const { getActiveRegularSeasonId } = await import('../services/season.service.js');
      const sid = await getActiveRegularSeasonId();
      if (sid) { await (reconcileSeasonProgression as any)(sid, true, () => {}, { onlyPlayerIds: targets }); console.log(`   ✓ أُعيد حساب رتبة ${targets.length} حساباً`); }
    } catch (e: any) { console.log(`   ⚠️ إعادة الحساب: ${e?.message} — شغّل recalc-progression-v2 يدويّاً`); }
  }
  process.exit(0);
}
main().catch(e => { console.error('💥', e); process.exit(2); });
