// ══════════════════════════════════════════════════════
// 🧪 دفتر أرقام MC — vCard وCardDAV بلا قاعدة
// التشغيل: npx tsx test-contacts-sync.ts
// ══════════════════════════════════════════════════════
import { vEsc, foldLine, buildVCard, intlPhone, uidFor, dateAr, type Contact } from './src/services/contacts-sync.service.js';
import { parseRequestedProps, rootElement, hrefsIn, syncTokenIn } from './src/routes/carddav.routes.js';

let pass = 0, fail = 0;
const check = (ok: boolean, name: string, extra: any = '') => { if (ok) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name}`, extra); } };
const sec = (t: string) => console.log(`\n${t}`);

sec('١. الأرقام');
check(intlPhone('0791234567')?.intl === '+962791234567', '07… ⟵ +962');
check(intlPhone('791234567')?.intl === '+962791234567' && intlPhone('791234567')!.fixed, '٩ خانات ⟵ تُصحَّح');
check(intlPhone('+962 79 123 4567')?.intl === '+962791234567', '+962 بمسافات');
check(intlPhone('٠٧٩١٢٣٤٥٦٧')?.intl === '+962791234567', 'أرقام عربيّة');
check(intlPhone('+97455001234')?.intl === '+97455001234' && intlPhone('+97455001234')!.local === null, 'دوليّ غير أردنيّ يبقى');
check(intlPhone('0000') === null && intlPhone('') === null && intlPhone('deleted:12') === null && intlPhone('0612345678') === null, 'غير صالح ⟵ null');

sec('٢. vCard');
check(vEsc('أ,ب;ج\\د\nهـ') === 'أ\\,ب\\;ج\\\\د\\nهـ', 'هروب , ; \\ والسطر');
const long = 'NOTE:' + '🎭 مافيا كلوب · لاعب منذ ١٢ نيسان ٢٠٢٦\\n📍 عمّان · 🎖️ مُخبر · مستوى ١٤\\n🎮 ٢٣ لعبة في ٩ ليالٍ · آخر زيارة ٢٧ أيلول (مزاج افندينا)';
const folded = foldLine(long);
const parts = folded.split('\r\n');
check(parts.every(p => Buffer.byteLength(p, 'utf8') <= 75), 'كلّ سطرٍ ≤ ٧٥ بايتاً', parts.map(p => Buffer.byteLength(p)));
check(parts.slice(1).every(p => p.startsWith(' ')), 'الأسطر التالية تبدأ بمسافة');
check(parts.map((p, i) => i ? p.slice(1) : p).join('') === long, 'فكّ الطيّ يعيد النصّ حرفيّاً (لا حرفَ مقطوع)');
check(!folded.includes('�'), 'لا حرف تالف');
const C: Contact = { uid: uidFor('0791234567'), phoneKey: '0791234567', intl: '+962791234567', name: 'MC خالد, أحمد', note: ['🎭 سطر أوّل', 'سطر; ثانٍ'], bday: '1998-03-14', url: 'https://club-mafia.grade.sbs/admin/players/7', source: 'player', playerId: 7, played: true, fixedPhone: false };
const v = buildVCard(C, { prefix: 'MC' });
check(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n') && v.endsWith('END:VCARD\r\n'), 'بداية ونهاية بـCRLF');
check(!/[^\r]\n/.test(v), 'لا LF منفرد');
check(v.includes(`UID:${C.uid}`) && /^mc-[a-f0-9]{24}$/.test(C.uid), 'UID ثابت الصيغة');
check(v.includes('FN:MC خالد\\, أحمد') && v.includes('N:;MC خالد\\, أحمد;;;'), 'الاسم مهرَّب');
check(v.includes('TEL;TYPE=CELL,VOICE:+962791234567'), 'الرقم الدوليّ');
check(v.replace(/\r\n /g, '').includes('NOTE:🎭 سطر أوّل\\nسطر\\; ثانٍ'), 'الملاحظة بأسطرها');
check(v.includes('BDAY:1998-03-14') && v.includes('ORG:Mafia Club') && v.includes('CATEGORIES:MC'), 'الميلاد والشركة والتصنيف');
check(uidFor('0791234567') === uidFor('0791234567') && uidFor('0791234567') !== uidFor('0791234568'), 'UID بالرقم: ثابتٌ ومميِّز');
check(dateAr('2026-09-27T16:30:00Z') === '٢٧ أيلول ٢٠٢٦', 'التاريخ بتوقيت عمّان', dateAr('2026-09-27T16:30:00Z'));

sec('٣. طلبات الآيفون (XML)');
// كما يرسلها تطبيق جهات الاتصال: بادئات A/B/C ومساحات أسماءٍ مضمّنة
const pf1 = `<?xml version="1.0" encoding="UTF-8"?>
<A:propfind xmlns:A="DAV:">
  <A:prop>
    <A:current-user-principal/>
    <A:principal-URL/>
    <A:resourcetype/>
  </A:prop>
</A:propfind>`;
const r1 = parseRequestedProps(pf1)!;
check(r1.length === 3 && r1.every(q => q.ns === 'DAV:') && r1.map(q => q.local).join(',') === 'current-user-principal,principal-URL,resourcetype', 'PROPFIND الاكتشاف', r1);
const pf2 = `<?xml version="1.0" encoding="UTF-8"?>
<A:propfind xmlns:A="DAV:">
  <A:prop>
    <B:addressbook-home-set xmlns:B="urn:ietf:params:xml:ns:carddav"/>
    <C:getctag xmlns:C="http://calendarserver.org/ns/"/>
    <A:displayname/>
    <A:sync-token/>
    <D:me-card xmlns:D="http://calendarserver.org/ns/"/>
  </A:prop>
</A:propfind>`;
const r2 = parseRequestedProps(pf2)!;
check(r2.find(q => q.local === 'addressbook-home-set')?.ns === 'urn:ietf:params:xml:ns:carddav' && r2.find(q => q.local === 'getctag')?.ns === 'http://calendarserver.org/ns/', 'مساحات الأسماء المضمّنة', r2);
check(parseRequestedProps('') === null && parseRequestedProps('<d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>') === null, 'allprop وجسمٌ فارغ ⟵ الكلّ');
const mg = `<?xml version="1.0" encoding="UTF-8"?>
<B:addressbook-multiget xmlns:B="urn:ietf:params:xml:ns:carddav">
  <A:prop xmlns:A="DAV:"><A:getetag/><B:address-data/></A:prop>
  <A:href xmlns:A="DAV:">/api/carddav/addressbooks/mc/mc-aaaaaaaaaaaaaaaaaaaaaaaa.vcf</A:href>
  <A:href xmlns:A="DAV:">/api/carddav/addressbooks/mc/mc-bbbbbbbbbbbbbbbbbbbbbbbb.vcf</A:href>
</B:addressbook-multiget>`;
check(rootElement(mg) === 'addressbook-multiget', 'نوع التقرير');
check(hrefsIn(mg).length === 2 && hrefsIn(mg)[0].endsWith('aaaa.vcf'), 'روابط multiget');
const mgp = parseRequestedProps(mg)!;
check(mgp.some(q => q.local === 'address-data' && q.ns === 'urn:ietf:params:xml:ns:carddav') && mgp.some(q => q.local === 'getetag'), 'multiget يطلب البيانات والـetag', mgp);
const sc0 = `<?xml version="1.0" encoding="UTF-8"?><A:sync-collection xmlns:A="DAV:"><A:sync-token/><A:sync-level>1</A:sync-level><A:prop><A:getetag/></A:prop></A:sync-collection>`;
check(rootElement(sc0) === 'sync-collection' && syncTokenIn(sc0) === '', 'مزامنة أولى برمزٍ فارغ');
const sc1 = sc0.replace('<A:sync-token/>', '<A:sync-token>https://club-mafia.grade.sbs/api/carddav/sync/42</A:sync-token>');
check(syncTokenIn(sc1) === 'https://club-mafia.grade.sbs/api/carddav/sync/42', 'رمز المزامنة');
check(syncTokenIn('<A:sync-collection xmlns:A="DAV:"><A:sync-token xmlns:A="DAV:">https://x/api/carddav/sync/7</A:sync-token></A:sync-collection>') === 'https://x/api/carddav/sync/7', 'رمزٌ بمساحة أسماء مضمّنة');
check(parseRequestedProps('<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype><d:collection/></d:resourcetype><d:getetag/></d:prop></d:propfind>')!.map(q => q.local).join(',') === 'resourcetype,getetag', 'العناصر المتداخلة لا تُعدّ خصائص');

console.log(`\n${'─'.repeat(46)}\nنجح ${pass} · فشل ${fail}`);
process.exit(fail ? 1 : 0);
