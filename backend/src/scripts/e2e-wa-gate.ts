// ══════════════════════════════════════════════════════
// 🧪 بوّابة رقم الواتساب — E2E على الإنتاج بلاعبين وهميّين، بلا أيّ رسالة واتساب
// الفحص والإرسال مستبدَلان (gateHooks) والمفتاح مفروضٌ في هذه العمليّة وحدها.
// تشغيل: docker exec mafia-prod-backend-1 npx tsx src/scripts/e2e-wa-gate.ts
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import * as G from '../services/wa-number-gate.service.js';

const BASE = 'http://localhost:4000';
const P = { a: '0799999971', b: '0799999972', c: '0799999973', d: '0799999974', n: '0799999975', reg: '0799999976' };
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (name: string, cond: boolean, extra = '') => { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; failures.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); } };
const section = (t: string) => console.log(`\n═══ ${t} ═══`);

async function main() {
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
  const all = Object.values(P);
  const cleanup = async () => {
    const ids = (await q(sql`SELECT id FROM players WHERE phone IN (${sql.join([...all, '٠٧٩٩٩٩٩٩٧٢', '+962 79 999 9976', '799999973'].map(x => sql`${x}`), sql`, `)}) OR name LIKE 'فحص البوّابة%'`)).map(r => r.id);
    if (ids.length) {
      await q(sql`DELETE FROM phone_change_otps WHERE player_id IN (${sql.join(ids.map((i: number) => sql`${i}`), sql`, `)})`);
      await q(sql`DELETE FROM player_phone_changes WHERE player_id IN (${sql.join(ids.map((i: number) => sql`${i}`), sql`, `)})`);
      await q(sql`DELETE FROM players WHERE id IN (${sql.join(ids.map((i: number) => sql`${i}`), sql`, `)})`);
    }
    await q(sql`DELETE FROM wa_number_checks WHERE phone IN (${sql.join(all.map(x => sql`${x}`), sql`, `)})`);
  };
  await cleanup();

  const onWa = new Map<string, boolean | null>([[P.a, true], [P.b, false], [P.n, true], [P.reg, true]]);
  const sent: { phone: string; code: string }[] = [];
  G.gateHooks.check = async (local) => (onWa.has(local) ? onWa.get(local)! : false);
  G.gateHooks.sendOtp = async (phone, code) => { sent.push({ phone, code }); };
  G.gateHooks.forceEnabled = true;

  try {
    section('١ · الصيغ');
    ok('أرقام عربيّة ⟵ 07…', G.canonicalPhone('٠٧٨١٢٣٤٥٦٧')?.local === '0781234567');
    ok('+962 بمسافات ⟵ 07…', G.canonicalPhone('+962 7 9935 2074')?.local === '0799352074');
    ok('00962 ⟵ 07…', G.canonicalPhone('00962798134773')?.local === '0798134773');
    ok('ناقص الصفر ⟵ 07…', G.canonicalPhone('776092027')?.local === '0776092027');
    ok('حرفٌ خفيّ ⟵ 07…', G.canonicalPhone('‏0791480892')?.local === '0791480892');
    ok('«0» و«8888» و«079123» غير صالحة', !G.canonicalPhone('0') && !G.canonicalPhone('8888') && !G.canonicalPhone('079123'));
    ok('دوليّ يُقبل', !!G.canonicalPhone('+4915732772932'));

    section('٢ · حالة الرقم');
    const mk = async (phone: string, name: string) => (await q(sql`INSERT INTO players (phone, name, password_hash) VALUES (${phone}, ${name}, 'x') RETURNING id, phone`))[0];
    const pa = await mk(P.a, 'فحص البوّابة أ'); const pb = await mk(P.b, 'فحص البوّابة ب');
    const pi = await mk('8888' + Date.now() % 1000, 'فحص البوّابة غير صالح');
    await q(sql`INSERT INTO wa_number_checks (phone, on_wa, checked_at) VALUES (${P.a}, true, NOW()), (${P.b}, false, NOW())`);
    ok('عليه واتساب ⟵ active', (await G.phoneState(pa.id, pa.phone)).state === 'active');
    ok('بلا واتساب ⟵ none', (await G.phoneState(pb.id, pb.phone)).state === 'none');
    ok('غير صالح ⟵ invalid', (await G.phoneState(pi.id, pi.phone)).state === 'invalid');
    const pc = await mk(P.c, 'فحص البوّابة ج');
    ok('لم يُفحص ⟵ unknown (يدخل)', (await G.phoneState(pc.id, pc.phone)).state === 'unknown');
    const shared = await mk('٠٧٩٩٩٩٩٩٧٢', 'فحص البوّابة مشترك');   // = P.b بأرقام عربيّة
    ok('رقمه المعتمد لحسابٍ آخر ⟵ shared', (await G.phoneState(shared.id, shared.phone)).state === 'shared');

    section('٣ · متى تظهر البوّابة');
    ok('عليه واتساب ⟵ لا بوّابة', (await G.gateFor(pa, false)) === null);
    const gb = await G.gateFor(pb, false);
    ok('بلا واتساب ⟵ بوّابة', gb?.required === true && gb?.reason === 'none');
    ok('داخل لعبةٍ جارية ⟵ لا بوّابة (القرار ٢)', (await G.gateFor(pb, true)) === null);
    ok('غير صالح ⟵ بوّابة', (await G.gateFor(pi, false))?.reason === 'invalid');
    ok('لم يُفحص ⟵ يدخل (القرار ٣)', (await G.gateFor(pc, false)) === null);
    G.gateHooks.forceEnabled = false;
    ok('المفتاح مطفأ ⟵ لا بوّابة لأحد', (await G.gateFor(pb, false)) === null);
    G.gateHooks.forceEnabled = true;

    section('٤ · تغيير الرقم');
    const err = async (f: () => Promise<any>) => { try { await f(); return 'OK'; } catch (e: any) { return e?.code || 'ERR'; } };
    ok('صيغةٌ غير صالحة ⟵ INVALID', (await err(() => G.startPhoneChange(pb.id, '079123'))) === 'INVALID');
    ok('رقمٌ لحسابٍ آخر ⟵ TAKEN', (await err(() => G.startPhoneChange(pb.id, P.a))) === 'TAKEN');
    onWa.set(P.d, false);
    ok('رقمٌ بلا واتساب ⟵ NOT_ON_WA', (await err(() => G.startPhoneChange(pb.id, P.d))) === 'NOT_ON_WA');
    onWa.set(P.d, null);
    ok('تعذّر الفحص ⟵ CHECK_UNAVAILABLE', (await err(() => G.startPhoneChange(pb.id, P.d))) === 'CHECK_UNAVAILABLE');
    sent.length = 0;
    const st = await G.startPhoneChange(pb.id, '+962 79 999 9975');
    ok('رقمٌ عليه واتساب ⟵ رمزٌ أُرسل للرقم الجديد', st.codeSent === true && st.phone === P.n && sent[0]?.phone === P.n && /^\d{6}$/.test(sent[0]?.code || ''));
    ok('رمزٌ خاطئ ⟵ WRONG_CODE', (await err(() => G.confirmPhoneChange(pb.id, P.n, '000000'))) === 'WRONG_CODE');
    await G.confirmPhoneChange(pb.id, P.n, sent[0].code);
    const [after] = await q(sql`SELECT phone FROM players WHERE id = ${pb.id}`);
    ok('الرمز الصحيح ⟵ رقم الدخول تغيّر', after.phone === P.n);
    ok('سجلّ التغيير', (await q(sql`SELECT 1 FROM player_phone_changes WHERE player_id = ${pb.id} AND old_phone = ${P.b} AND new_phone = ${P.n}`)).length === 1);
    ok('الرقم الجديد مسجّلٌ «عليه واتساب»', (await G.phoneState(pb.id, P.n)).state === 'active');
    ok('الرمز لا يُستعمل مرّتين', (await err(() => G.confirmPhoneChange(pb.id, P.n, sent[0].code))) !== 'OK');
    // نفس رقمه وقد صار عليه واتساب ⟵ بلا رمز
    onWa.set(P.c, true);
    const same = await G.startPhoneChange(pc.id, P.c);
    ok('نفس رقمه صار عليه واتساب ⟵ بلا رمز', same.sameNumber === true && same.codeSent === false);
    await G.confirmPhoneChange(pc.id, P.c, null);
    ok('ويُعتمد', (await G.phoneState(pc.id, P.c)).state === 'active');
    for (let i = 0; i < 5; i++) await q(sql`INSERT INTO phone_change_otps (player_id, phone, code_hash, expires_at) VALUES (${pi.id}, ${P.d}, 'x', NOW() + INTERVAL '5 minutes')`);
    onWa.set(P.d, true);
    ok('٥ رموز في الساعة ⟵ TOO_MANY', (await err(() => G.startPhoneChange(pi.id, P.d))) === 'TOO_MANY');

    section('٥ · الدخول بأيّ كتابة (HTTP)');
    const { hashPlayerPassword } = await import('../middleware/player-auth.middleware.js');
    await q(sql`INSERT INTO players (phone, name, password_hash) VALUES (${P.reg}, 'فحص البوّابة دخول', ${await hashPlayerPassword('gate-test-9')})`);
    const lg = await fetch(`${BASE}/api/player-auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '00962799999976', password: 'gate-test-9' }) });
    const lj: any = await lg.json();
    ok('الدخول بكتابةٍ أخرى للرقم نفسه', lj.success === true, JSON.stringify(lj).slice(0, 120));
    const me = await fetch(`${BASE}/api/player-auth/me`, { headers: { Authorization: `Bearer ${lj.token}` } });
    const mj: any = await me.json();
    ok('/me يحمل waGate', mj.success === true && 'waGate' in mj);
  } finally {
    await cleanup();
  }
  console.log(`\n═══ النتيجة ═══\n\n  ✅ نجح: ${pass}   ❌ فشل: ${fail}`);
  if (failures.length) failures.forEach(f => console.log(`   • ${f}`));
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('💥', e); process.exit(2); });
