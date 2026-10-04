// ══════════════════════════════════════════════════════
// 📉 خصمُ الغياب بأثرٍ رجعيّ — مرّةً واحدة منذ بداية الموسم العادي النشط (قرار المالك 2026-10-04)
// ══════════════════════════════════════════════════════
// الافتراضيّ معاينةٌ بلا كتابة: الفعاليّات المحتسبة، مَن يُخصم منه وكم، ونصوصُ إشعاراتٍ نموذجيّة.
//   --exempt 235,240   يُعفي فعاليّاتٍ (مناسبةٌ خاصّة) قبل الحساب — كتابةٌ صغيرة في activities
//   --apply            يكتب السطور ← مصالحة كاملة ← إشعارات ← يَسِم الفعاليّات محكومة
//   --no-notify        مع --apply: بلا إشعارات
// خذ نسخةً احتياطيّة قبل --apply. التراجع: DELETE FROM rank_bonuses WHERE reason LIKE 'absence:s<موسم>:%'
// ثمّ مصالحة كاملة (recalc-progression-v2.ts --apply).
// ══════════════════════════════════════════════════════
import { connectDB, getDB } from '../config/db.js';
import { sql } from 'drizzle-orm';
import { previewAbsence, applyAbsence, absenceMessage, ABSENCE_RR } from '../services/absence-penalty.service.js';
import { cityNameOf } from '../services/cities.service.js';

const APPLY = process.argv.includes('--apply');
const NOTIFY = !process.argv.includes('--no-notify');
const exIdx = process.argv.indexOf('--exempt');
const EXEMPT = exIdx >= 0 ? String(process.argv[exIdx + 1] || '').split(',').map(Number).filter(n => Number.isFinite(n) && n > 0) : [];

async function main() {
  await connectDB();
  const db = getDB(); if (!db) throw new Error('DB unavailable');

  if (EXEMPT.length) {
    await db.execute(sql`UPDATE activities SET absence_exempt = true WHERE id = ANY(${'{' + EXEMPT.join(',') + '}'}::int[])`);
    console.log(`🚫 أُعفيت من الغياب: ${EXEMPT.map(x => '#' + x).join(' ')}`);
  }

  const plan = await previewAbsence();
  if ('skip' in plan) { console.log(`⏭️ لا شيء: ${plan.skip}`); process.exit(0); }

  const byCity = new Map<number, number>();
  for (const a of plan.activities) byCity.set(a.cityId, (byCity.get(a.cityId) || 0) + 1);
  console.log(`\n🏆 الموسم #${plan.seasonId} · فعاليّاتٌ محتسبة: ${[...byCity].map(([c, n]) => `مدينة ${c}: ${n}`).join(' · ')}`);
  console.log(`   ${plan.activities.map(a => '#' + a.id).join(' ')}`);

  const pp = plan.perPlayer;
  const taken = pp.filter(p => p.taken > 0);
  const zeroAfter = pp.filter(p => p.after.tier === 'INFORMANT' && p.after.rr === 0).length;
  const demoted = pp.filter(p => p.after.tier !== p.before.tier).length;
  console.log(`\n👤 عليهم غياب: ${pp.length} · خُصم منهم فعلاً: ${taken.length} · نزلوا رتبة: ${demoted} · على الصفر بعدها (منهم): ${zeroAfter}`);
  console.log(`   سطور الدفتر: ${plan.lines.length} (منها أصفار بعد القاع: ${plan.lines.filter(l => l.amount === 0).length}) · مجموع المخصوم: ${taken.reduce((s, p) => s + p.taken, 0)} RR (اسميّاً ${pp.reduce((s, p) => s + p.missed * ABSENCE_RR, 0)})`);

  const top = [...pp].sort((a, b) => b.taken - a.taken || b.missed - a.missed).slice(0, 15);
  console.log('\n🔝 الأكبر خصماً:');
  for (const p of top) console.log(`   #${p.playerId} ${p.name} [مدينة ${p.cityId}] غاب ${p.missed} · خُصم ${p.taken} · ${p.before.tier} ${p.before.rr} → ${p.after.tier} ${p.after.rr}`);

  console.log('\n✉️ نصوصٌ نموذجيّة:');
  const samples = [pp.find(p => p.taken === p.missed * ABSENCE_RR && p.taken > 0), pp.find(p => p.taken > 0 && p.taken < p.missed * ABSENCE_RR), pp.find(p => p.after.tier !== p.before.tier)].filter(Boolean) as typeof pp;
  for (const p of samples) console.log(`--- #${p.playerId} ${p.name}\n${absenceMessage(p, 'retro', await cityNameOf(p.cityId))}`);

  if (!APPLY) { console.log('\n🔍 معاينة فقط — لم يُكتب شيء. أعد التشغيل بـ --apply للتنفيذ.'); process.exit(0); }

  console.log(`\n⚠️ تنفيذ… (إشعارات: ${NOTIFY ? 'نعم' : 'لا'})`);
  const res = await applyAbsence({ mode: 'retro', notify: NOTIFY });
  const ids = plan.activities.map(a => a.id);
  if (ids.length) await db.execute(sql`UPDATE activities SET absence_judged_at = COALESCE(absence_judged_at, NOW()) WHERE id = ANY(${'{' + ids.join(',') + '}'}::int[])`);
  console.log(`✅ كُتب ${res.written} سطراً · خُصم من ${res.affected} لاعباً · أُرسل ${res.notified} إشعاراً${res.skip ? ` · ${res.skip}` : ''}`);
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
