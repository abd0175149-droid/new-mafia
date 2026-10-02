// 👁 فحصٌ حيّ لتقرير القراءة — قراءةٌ فقط، على بثوث الإنتاج الحقيقيّة
//   docker compose exec -T backend npx tsx src/scripts/e2e-wa-broadcast-read.ts
import jwt from 'jsonwebtoken';
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
await connectDB(); const db = getDB()!;
const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = '') => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}`, c ? '' : JSON.stringify(x)); };
const [adm] = await q(sql`SELECT id, username FROM staff WHERE role = 'admin' ORDER BY id LIMIT 1`);
const tok = jwt.sign({ id: adm.id, username: adm.username, role: 'admin', displayName: 'e2e' }, process.env.JWT_SECRET!, { expiresIn: '5m' });
const get = async (p: string) => (await fetch(`http://localhost:${process.env.PORT || 4000}${p}`, { headers: { Authorization: `Bearer ${tok}` } })).json() as any;

const aud = await get('/api/whatsapp/open-window-broadcast/audience?filter=all');
const hist: any[] = aud.history || [];
ok('السجلّ يعود ومعه الأرقام', hist.length > 0 && hist.some(h => h.readStats), hist.slice(0, 2));
const withRecips = hist.filter(h => h.readStats?.recipients > 0).slice(0, 5);
for (const h of withRecips) {
  const s = h.readStats;
  const [n] = await q(sql`SELECT COUNT(*)::int n FROM wa_broadcast_recipients WHERE broadcast_id = ${h.id}`);
  ok(`#${h.id}: مجموع الفئات = عدد المستلمين (${s.recipients}) = سجلّ المستلمين`, s.read + s.delivered + s.notDelivered + s.failed === s.recipients && s.recipients === n.n, s);
  const rep = await get(`/api/whatsapp/open-window-broadcast/${h.id}/report`);
  ok(`#${h.id}: التفصيل يطابق الأرقام (قرأها ${s.read}، وصلت ${s.delivered}، لم تصل ${s.notDelivered})`,
    rep.totals?.read === s.read && rep.totals?.delivered === s.delivered && rep.totals?.notDelivered === s.notDelivered && rep.recipients?.length === s.recipients, rep.totals);
  const r1 = rep.recipients?.find((r: any) => r.group === 'read');
  if (r1) ok(`#${h.id}: من قرأ يحمل وقت القراءة واسماً`, !!r1.readAt && !!r1.name, r1);
}
const bad = await get('/api/whatsapp/open-window-broadcast/99999999/report');
ok('بثٌّ غير موجود ⟵ خطأ واضح', !!bad.error, bad);
console.log(`نجح ${pass} · فشل ${fail}`); process.exit(fail ? 1 : 0);
