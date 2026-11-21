// ══════════════════════════════════════════════════════
// 🧪 خطّة توحيد الحجز — م٤-أ «الفهرس الموحّد والتسعير» (2026-11-21)
// ① قواعد الاختيار بلا قاعدة (ق١١، ق١٣، ق١٥، ق١٤)
// ② الفهرس يطابق الجداول الثلاثة، والتسعير يطابق المحرّكين القديمين على الفعاليّات القادمة (قراءةٌ فقط)
// ③ ق٧: الغياب ينتهي بعد مدّته (يكتب غيابَين لرقم فحصٍ ثمّ يمحوهما)
// تشغيل: npx tsx src/scripts/test-pricing.ts
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { chooseOption, offerCatalog, offersForActivity, quote, type QuoteOption } from '../services/pricing.service.js';

let pass = 0, fail = 0; const failures: string[] = [];
const ok = (n: string, c: boolean, x = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; failures.push(`${n}${x ? ` — ${x}` : ''}`); console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); } };
const opt = (key: string, kind: any, total: number, okk = true, consumesReward = false): QuoteOption => ({ key, kind, label: key, ok: okk, total, perSeat: null, freeSeats: 0, reasons: [], consumesReward });
const PH = '0799999961';

async function main() {
  console.log('\n① قواعد الاختيار');
  let c = chooseOption([opt('base', 'base', 9), opt('early:1', 'early', 6)]);
  ok('الأرخص للعميل (ق١١)', c.best === 'early:1' && !c.choose);
  c = chooseOption([opt('base', 'base', 9), opt('early:1', 'early', 6, false)]);
  ok('ما لا ينطبق لا يُختار', c.best === 'base');
  c = chooseOption([opt('base', 'base', 9), opt('early:1', 'early', 6), opt('loyalty:visit', 'loyalty_visit', 6, true, true)]);
  ok('التساوي ⟵ ما لا يستهلك المكافأة (تبقى له)', c.best === 'early:1');
  ok('عرضٌ ومكافأة معاً ⟵ يختار العميل (ق١٥)', c.choose === true);
  c = chooseOption([opt('base', 'base', 9), opt('loyalty:visit', 'loyalty_visit', 6, true, true)]);
  ok('المكافأة وحدها ⟵ تُطبَّق بلا سؤال', c.best === 'loyalty:visit' && !c.choose);
  c = chooseOption([opt('base', 'base', 9), opt('group:1', 'group', 6)], true);
  ok('مشروب الولاء ليلة عرض ⟵ لا يُطبَّق آليّاً (ق١٤)', c.notes.some((n) => n.includes('ق١٤')));
  c = chooseOption([opt('base', 'base', 9)], true);
  ok('مشروب الولاء بلا عرض ⟵ على الفاتورة', c.notes.some((n) => n.includes('فاتورة')) && !c.notes.some((n) => n.includes('ق١٤')));

  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];

  console.log('\n② الفهرس والتسعير (قراءةٌ فقط)');
  const cat = await offerCatalog();
  const [ne] = await q(sql`SELECT COUNT(*)::int AS n FROM early_price_promos`);
  const [ng] = await q(sql`SELECT COUNT(*)::int AS n FROM booking_offers WHERE deleted_at IS NULL`);
  ok('كلّ عروض السعر المبكّر في الفهرس', cat.filter((o) => o.kind === 'early').length === Number(ne.n), `${cat.filter((o) => o.kind === 'early').length} vs ${ne.n}`);
  ok('كلّ عروض المجموعة في الفهرس', cat.filter((o) => o.kind === 'group').length === Number(ng.n));
  ok('مكافآت الولاء الثلاث في الفهرس', ['loyalty:visit', 'loyalty:drink', 'loyalty:chips'].every((k) => cat.some((o) => o.key === k)));
  ok('لكلّ عرضٍ قاعدة جمعٍ ونطاقٌ وقنوات', cat.every((o) => !!o.stackText && !!o.scope?.text && o.channels.length > 0));
  for (const o of cat) console.log(`  ℹ️ ${o.key} · ${o.status} · ${o.rule} · ${o.scope.text}`);

  const E = await import('../services/early-price.service.js');
  const acts = await q(sql`SELECT a.id FROM activities a LEFT JOIN locations l ON l.id = a.location_id
     WHERE a.deleted_at IS NULL AND a.date > NOW() AND COALESCE(l.is_test_location, false) = false ORDER BY a.date LIMIT 6`);
  let checked = 0, same = 0; const diffs: string[] = [];
  for (const a of acts) {
    for (const ch of ['bot', 'app'] as const) {
      for (const people of [1, 3]) {
        const Q = await quote({ activityId: Number(a.id), people, phone: PH, channel: ch });
        const eq = await E.earlyQuote({ activityId: Number(a.id), phone: PH, channel: ch });
        const act = await E.actLite(Number(a.id));
        const base = Number(act?.price) || 0;
        const baseOpt = Q.options.find((o) => o.key === 'base');
        const early = Q.options.find((o) => o.kind === 'early');
        const expectEarly = eq.best ? Math.round(people * eq.best.price * 100) / 100 : null;
        const good = baseOpt?.total === Math.round(people * base * 100) / 100
          && (expectEarly == null ? !early?.ok : early?.ok === true && early.total === expectEarly);
        checked++; if (good) same++; else diffs.push(`#${a.id} ${ch} ×${people}: ${JSON.stringify({ base: baseOpt?.total, early: early?.total, expectEarly })}`);
      }
    }
  }
  ok(`التسعير يطابق المحرّك القديم (${checked} حالة على ${acts.length} فعاليّات)`, checked > 0 && same === checked, diffs.slice(0, 3).join(' | '));
  if (acts[0]) {
    const t = await offersForActivity(Number(acts[0].id));
    console.log(`  ℹ️ عروض ليلة #${acts[0].id}: ${t.map((o) => `${o.name}${o.applies ? '' : ' (لا)'} — ${o.note}`).join(' · ') || 'لا شيء'}`);
    ok('«عروض هذه الليلة» تعمل', Array.isArray(t));
  }

  console.log('\n③ ق٧: الغياب ينتهي بعد مدّته');
  const { bookingPolicy, bookingPolicyFresh } = await import('../services/booking-policy.service.js');
  await bookingPolicyFresh();
  const days = bookingPolicy().strikeExpiryDays;
  ok('المدّة الافتراضيّة ٤٥ يوماً', days === 45, String(days));
  await q(sql`DELETE FROM no_show_strikes WHERE phone = ${PH}`);
  try {
    await q(sql`INSERT INTO no_show_strikes (phone, kind, status, created_at) VALUES (${PH}, 'no_show', 'active', NOW() - INTERVAL '50 days')`);
    let st = await E.activeStrikes(PH, null);
    ok('غيابٌ عمره ٥٠ يوماً لا يُحسب', st.length === 0, String(st.length));
    await q(sql`INSERT INTO no_show_strikes (phone, kind, status, created_at) VALUES (${PH}, 'no_show', 'active', NOW() - INTERVAL '10 days')`);
    st = await E.activeStrikes(PH, null);
    ok('غيابٌ عمره ١٠ أيّام يُحسب', st.length === 1, String(st.length));
  } catch (e: any) { fail++; failures.push(`استثناء: ${e?.message}`); console.log('💥', e); }
  finally { await q(sql`DELETE FROM no_show_strikes WHERE phone = ${PH}`); }
  const [old] = await q(sql`SELECT COUNT(*)::int AS n FROM no_show_strikes WHERE status = 'active' AND created_at <= NOW() - make_interval(days => ${days})`);
  console.log(`  ℹ️ غياباتٌ «قائمة» انتهت بهذه القاعدة على الإنتاج: ${old.n}`);

  console.log(`\n${fail ? '❌' : '✅'} م٤-أ: ${pass} نجح، ${fail} فشل`);
  if (failures.length) console.log(failures.map((f) => ' • ' + f).join('\n'));
  process.exit(fail ? 1 : 0);
}
main();
