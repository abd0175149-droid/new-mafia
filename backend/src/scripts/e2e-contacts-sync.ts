// ══════════════════════════════════════════════════════
// 🧪 فحصٌ حيّ لدفتر أرقام MC — يعيد تسلسل طلبات الآيفون على الخادم الحيّ
// ══════════════════════════════════════════════════════
// جهازٌ مؤقّت ⟵ اكتشاف (well-known/جذر/حساب/بيت) ⟵ مزامنة أولى ⟵ جلب بطاقات ⟵
// لاعبٌ مؤقّت يظهر في المزامنة بالفرق ⟵ حذفه يختفي ⟵ رفض الكتابة ⟵ ملفّ الإعداد لمرّة ⟵
// إلغاء الجهاز. ثمّ الشيء نفسه عبر النطاق العامّ (Cloudflare + بروكسي الواجهة).
// التشغيل: docker compose exec -T backend npx tsx src/scripts/e2e-contacts-sync.ts
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';

const LOCAL = `http://localhost:${process.env.PORT || 4000}`;
const PUBLIC = String(process.env.PUBLIC_URL || 'https://club-mafia.grade.sbs').replace(/\/$/, '');
const PH = '0799990501';
let pass = 0, fail = 0; const failures: string[] = [];
function ok(name: string, cond: boolean, extra: any = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}`, typeof extra === 'string' ? extra.slice(0, 300) : extra); }
}
const section = (t: string) => console.log(`\n═══ ${t} ═══`);

async function main() {
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
  const S = await import('../services/contacts-sync.service.js');

  const [clash] = await q(sql`SELECT COUNT(*)::int AS n FROM players WHERE phone = ${PH} AND name NOT LIKE '%E2E-CONTACTS%'`);
  if (clash.n) { console.error('❌ رقم الفحص مستخدم — أُلغي'); process.exit(2); }
  await q(sql`DELETE FROM players WHERE phone = ${PH}`);

  const dev = await S.createDevice('🧪 e2e', 'e2e');
  const auth = 'Basic ' + Buffer.from(`${dev.username}:${dev.password}`).toString('base64');
  const dav = (base: string, method: string, path: string, body = '', depth?: string, extraH: any = {}) => fetch(base + path, {
    method, redirect: 'manual', body: body || undefined,
    headers: { Authorization: auth, 'Content-Type': 'text/xml; charset=utf-8', ...(depth !== undefined ? { Depth: depth } : {}), 'User-Agent': 'iOS/18.0 (22A3354) dataaccessd/1.0', ...extraH },
  });
  const tempUid = S.uidFor(PH);
  try {
    await S.refreshCards(true);

    for (const [label, base] of [['الخادم مباشرةً', LOCAL], ['النطاق العامّ (Cloudflare)', PUBLIC]] as const) {
      section(`الاكتشاف — ${label}`);
      const wk = await dav(base, 'PROPFIND', '/.well-known/carddav', '', '0');
      ok('well-known ⟵ 301 إلى /api/carddav/', wk.status === 301 && /\/api\/carddav\/$/.test(wk.headers.get('location') || ''), `${wk.status} ${wk.headers.get('location')}`);
      const op = await fetch(base + '/api/carddav/', { method: 'OPTIONS' });
      ok('OPTIONS: رأس DAV يعلن addressbook', /addressbook/.test(op.headers.get('dav') || ''), op.headers.get('dav'));
      const na = await fetch(base + '/api/carddav/', { method: 'PROPFIND', headers: { Depth: '0' } });
      ok('بلا مصادقة ⟵ 401 مع Basic', na.status === 401 && /Basic/.test(na.headers.get('www-authenticate') || ''));
      const bad = await fetch(base + '/api/carddav/', { method: 'PROPFIND', headers: { Depth: '0', Authorization: 'Basic ' + Buffer.from(`${dev.username}:wrong`).toString('base64') } });
      ok('كلمة سرّ خاطئة ⟵ 401', bad.status === 401);
      const r0 = await dav(base, 'PROPFIND', '/api/carddav/', '<A:propfind xmlns:A="DAV:"><A:prop><A:current-user-principal/><A:principal-URL/><A:resourcetype/></A:prop></A:propfind>', '0');
      const t0 = await r0.text();
      ok('الجذر ⟵ الحساب', r0.status === 207 && t0.includes(`/api/carddav/principals/${dev.username}/`), t0);
      const r1 = await dav(base, 'PROPFIND', `/api/carddav/principals/${dev.username}/`, '<A:propfind xmlns:A="DAV:"><A:prop><B:addressbook-home-set xmlns:B="urn:ietf:params:xml:ns:carddav"/><A:displayname/><C:email-address-set xmlns:C="http://calendarserver.org/ns/"/></A:prop></A:propfind>', '0');
      const t1 = await r1.text();
      ok('الحساب ⟵ البيت', r1.status === 207 && t1.includes('<card:addressbook-home-set><d:href>/api/carddav/addressbooks/</d:href>'), t1);
      const r2 = await dav(base, 'PROPFIND', '/api/carddav/addressbooks/', '<A:propfind xmlns:A="DAV:"><A:prop><A:resourcetype/><A:displayname/><C:getctag xmlns:C="http://calendarserver.org/ns/"/><A:sync-token/><A:current-user-privilege-set/></A:prop></A:propfind>', '1');
      const t2 = await r2.text();
      ok('البيت (عمق 1) ⟵ الدفتر بـaddressbook وgetctag وsync-token', r2.status === 207 && t2.includes('/api/carddav/addressbooks/mc/') && t2.includes('<card:addressbook/>') && t2.includes('<cs:getctag>') && t2.includes('<d:sync-token>'), t2.slice(0, 600));
      ok('قراءةٌ فقط (لا صلاحيّة كتابة)', t2.includes('<d:read/>') && !t2.includes('<d:write'));
    }

    section('المزامنة');
    const sync = async (token: string) => {
      const r = await dav(LOCAL, 'REPORT', '/api/carddav/addressbooks/mc/', `<?xml version="1.0" encoding="UTF-8"?><A:sync-collection xmlns:A="DAV:">${token ? `<A:sync-token>${token}</A:sync-token>` : '<A:sync-token/>'}<A:sync-level>1</A:sync-level><A:prop><A:getetag/></A:prop></A:sync-collection>`, '1');
      const t = await r.text();
      return { status: r.status, text: t, hrefs: [...t.matchAll(/<d:href>([^<]+\.vcf)<\/d:href>/g)].map(m => m[1]), token: (/<d:sync-token>([^<]+)<\/d:sync-token>/.exec(t) || [])[1] || '' };
    };
    const live = await q(sql`SELECT COUNT(*)::int AS n FROM carddav_cards WHERE deleted = false`);
    const s0 = await sync('');
    ok('مزامنة أولى ⟵ كلّ البطاقات + رمز', s0.status === 207 && s0.hrefs.length === Number(live[0].n) && s0.hrefs.length > 500 && !!s0.token, `${s0.status} ${s0.hrefs.length}/${live[0].n}`);
    const mg = await dav(LOCAL, 'REPORT', '/api/carddav/addressbooks/mc/', `<?xml version="1.0" encoding="UTF-8"?><B:addressbook-multiget xmlns:B="urn:ietf:params:xml:ns:carddav"><A:prop xmlns:A="DAV:"><A:getetag/><B:address-data/></A:prop>${s0.hrefs.slice(0, 3).map(h => `<A:href xmlns:A="DAV:">${h}</A:href>`).join('')}</B:addressbook-multiget>`, '1');
    const mgt = await mg.text();
    ok('multiget ⟵ ٣ بطاقات vCard باسم MC', mg.status === 207 && (mgt.match(/BEGIN:VCARD/g) || []).length === 3 && /FN:MC /.test(mgt), mgt.slice(0, 400));
    // 🔴 الآيفون أسقط الملاحظات المطويّة (2026-10-01): CRLF محفوظ بـ&#13; ولا سطرَ استمرار
    ok('address-data: CRLF محفوظ (&#13;) وبلا طيّ', /BEGIN:VCARD&#13;\nVERSION:3\.0&#13;\n/.test(mgt) && !/&#13;\n[ \t]/.test(mgt) && (mgt.match(/NOTE:/g) || []).length === 3, mgt.slice(0, 400));
    const g = await dav(LOCAL, 'GET', s0.hrefs[0]);
    const gt = await g.text(); const et = g.headers.get('etag') || '';
    ok('GET بطاقة ⟵ text/vcard مع ETag', g.status === 200 && /text\/vcard/.test(g.headers.get('content-type') || '') && gt.startsWith('BEGIN:VCARD') && !!et);
    ok('If-None-Match ⟵ 304', (await dav(LOCAL, 'GET', s0.hrefs[0], '', undefined, { 'If-None-Match': et })).status === 304);
    const s1 = await sync(s0.token);
    ok('بلا تغيير ⟵ لا بطاقات', s1.status === 207 && s1.hrefs.length === 0 && s1.token === s0.token, `${s1.hrefs.length}`);

    section('لاعبٌ جديد يظهر ثمّ يختفي');
    const [pl] = await q(sql`INSERT INTO players (phone, name, password_hash) VALUES (${PH}, 'فحص E2E-CONTACTS', 'x') RETURNING id`);
    await S.refreshCards(true);
    const s2 = await sync(s0.token);
    ok('المزامنة بالفرق ⟵ بطاقته وحدها', s2.hrefs.length === 1 && s2.hrefs[0].includes(tempUid) && s2.token !== s0.token, s2.hrefs);
    const card = await (await dav(LOCAL, 'GET', `/api/carddav/addressbooks/mc/${tempUid}.vcf`)).text();
    ok('بطاقته: MC + الاسم + +962 + «سجّل ولم يلعب»', card.includes('FN:MC فحص E2E-CONTACTS') && card.includes('+962799990501') && card.replace(/\r\n /g, '').includes('سجّل ولم يلعب'), card);
    await q(sql`UPDATE players SET deleted_at = NOW() WHERE id = ${pl.id}`);
    await S.refreshCards(true);
    const s3 = await sync(s2.token);
    ok('حذف حسابه ⟵ 404 في المزامنة التالية (يختفي من الهاتف)', s3.text.includes(`${tempUid}.vcf</d:href><d:status>HTTP/1.1 404 Not Found</d:status>`), s3.text.slice(0, 400));
    ok('رمزٌ من المستقبل ⟵ 403 valid-sync-token', (await sync(`${PUBLIC}/api/carddav/sync/999999999`)).status === 403);

    section('الكتابة والإعداد والإلغاء');
    ok('PUT ⟵ 403 (قراءةٌ فقط)', (await dav(LOCAL, 'PUT', s0.hrefs[0], 'BEGIN:VCARD\r\nEND:VCARD\r\n')).status === 403);
    ok('DELETE ⟵ 403', (await dav(LOCAL, 'DELETE', s0.hrefs[0])).status === 403);
    const pr = await fetch(`${PUBLIC}/api/contacts-sync/setup/${dev.setupToken}`);
    const prt = await pr.text();
    ok('ملفّ الإعداد عبر النطاق العامّ ⟵ mobileconfig بالحساب', pr.status === 200 && /aspen-config/.test(pr.headers.get('content-type') || '') && prt.includes(`<string>${dev.username}</string>`) && prt.includes('com.apple.carddav.account'), `${pr.status} ${pr.headers.get('content-type')}`);
    ok('الرابط لمرّةٍ واحدة ⟵ 410 ثانيةً', (await fetch(`${PUBLIC}/api/contacts-sync/setup/${dev.setupToken}`)).status === 410);
    await S.revokeDevice(dev.id);
    ok('بعد الإلغاء ⟵ 401', (await dav(LOCAL, 'PROPFIND', '/api/carddav/', '', '0')).status === 401);
  } finally {
    await q(sql`DELETE FROM players WHERE phone = ${PH}`);
    await q(sql`DELETE FROM carddav_cards WHERE uid = ${tempUid}`);
    await q(sql`DELETE FROM carddav_devices WHERE id = ${dev.id}`);
  }
  console.log(`\n${'─'.repeat(46)}\nنجح ${pass} · فشل ${fail}`);
  if (fail) failures.forEach(f => console.log(' • ' + f));
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('💥', e); process.exit(1); });
