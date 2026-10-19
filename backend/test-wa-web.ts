// ══════════════════════════════════════════════════════
// 🧪 رقم الأعمال (جلسة OpenWA) — اختبار بلا قاعدة ولا شبكة
//   npx tsx test-wa-web.ts
// القوائم المرقّمة (الرسم + المطابقة + الأمان)، ترجمة الأحداث إلى شكل ميتا، التوقيع، المعرّفات.
// ══════════════════════════════════════════════════════

process.env.OPENWA_WEBHOOK_SECRET = 'test-secret-1234567890';
process.env.OPENWA_URL = 'http://gw:2785';
process.env.OPENWA_API_KEY = 'k';
process.env.OPENWA_SESSION_ID = 's';

import crypto from 'crypto';

let pass = 0, fail = 0;
function ok(cond: boolean, name: string, detail = '') {
  if (cond) pass++; else { fail++; console.log('  ✗', name, detail); }
}

(async () => {
  const m = await import('./src/services/wa-transport/menu-emulation.js');
  const inb = await import('./src/services/wa-transport/web.inbound.js');
  const { extractInbound } = await import('./src/services/whatsapp-inbox.service.js');
  const { toOutboxContent, webChatIdOf } = await import('./src/services/wa-transport/web.transport.js');

  console.log('— رسم الأزرار والقوائم');
  const confirm = {
    type: 'button',
    body: { text: '📋 تأكيد الحجز:\nفعاليّة الخميس\n\nهل أثبّت الحجز؟' },
    action: { buttons: [
      { type: 'reply', reply: { id: 'res_confirm:812:2', title: 'تأكيد الحجز ✓' } },
      { type: 'reply', reply: { id: 'res_cancel', title: 'إلغاء' } },
    ] },
  };
  const r1 = m.renderInteractive(confirm);
  ok(r1.text.includes('1️⃣ تأكيد الحجز ✓') && r1.text.includes('2️⃣ إلغاء') && r1.text.includes('اكتب رقم اختيارك'), 'أزرار ⟵ أسطر مرقّمة');
  ok(r1.menu?.kind === 'button' && r1.menu.items.length === 2 && r1.menu.items[0].id === 'res_confirm:812:2', 'الخريطة تحفظ المعرّف الأصليّ');
  const list = {
    type: 'list', header: { type: 'text', text: '🎭 الفعاليات القادمة' }, body: { text: 'اختر الفعالية المناسبة:' },
    action: { button: 'عرض', sections: [{ title: 'الفعاليات المتاحة', rows: Array.from({ length: 12 }, (_, i) => ({ id: `act:${100 + i}`, title: `فعاليّة ${i + 1}`, description: 'الخميس · الزرقاء' })) }] },
  };
  const r2 = m.renderInteractive(list);
  ok(r2.menu?.kind === 'list' && r2.menu.items.length === 12, 'قائمة بأكثر من ١٠ صفوف (حدّ ميتا زال)');
  ok(r2.text.includes('*🎭 الفعاليات القادمة*') && r2.text.includes('🔟 فعاليّة 10') && r2.text.includes('11. فعاليّة 11'), 'الترويسة والأرقام بعد العاشر');

  console.log('— قراءة رقم الاختيار');
  for (const [s, n] of [['1', 1], ['١', 1], ['1️⃣', 1], ['رقم ٢', 2], ['2.', 2], ['الخيار 3', 3], ['  12 ', 12], ['🔟', 10], ['۳', 3]] as const) {
    ok(m.parseChoiceNumber(s) === n, `«${s}» ⟵ ${n}`, String(m.parseChoiceNumber(s)));
  }
  for (const s of ['0', 'بدي 2 تذاكر', 'كم السعر؟', '123', '']) ok(m.parseChoiceNumber(s) === null, `«${s}» ليس اختياراً`);
  ok(m.normTitle('تأكيد الحجز ✓') === m.normTitle('تاكيد الحجز'), 'العنوان يُطابَق بلا همزة ولا علامة');
  ok(m.normTitle('إلغاء') === m.normTitle('الغاء'), 'إلغاء = الغاء');

  console.log('— المطابقة (في الذاكرة)');
  const key = '962790000001';
  await m.saveMenu(key, r1.menu!, 'true_962790000001@c.us_AAA');
  const txt = (body: string, extra: any = {}) => ({ id: 'w1', from: key, timestamp: '1', type: 'text', text: { body }, ...extra });
  const q1 = await m.applyMenuReply(key, txt('كم السعر؟'));
  ok(q1.type === 'text', 'سؤالٌ عاديّ يمرّ نصّاً والقائمة تبقى');
  const a1 = await m.applyMenuReply(key, txt('١'));
  ok(a1.type === 'interactive' && a1.interactive.button_reply.id === 'res_confirm:812:2' && a1.interactive.type === 'button_reply', '«١» ⟵ button_reply بالمعرّف الأصليّ');
  ok(extractInbound(a1).msgType === 'interactive' && extractInbound(a1).body === 'تأكيد الحجز ✓', 'المدخل الموحّد يقرؤها ضغطة زرّ');
  ok(a1._emulated?.raw === '١' && !('text' in a1), 'النصّ الخام محفوظ في _emulated ولا يبقى text');
  const a2 = await m.applyMenuReply(key, txt('1'));
  ok(a2.type === 'text', 'استهلاكٌ واحد: الضغطة الثانية نصٌّ عاديّ');
  await m.saveMenu('0790000001', r2.menu!, null);   // الإرسال يعرف الرقم المحلّيّ
  const a3 = await m.applyMenuReply('962790000001', txt('فعاليّة 3'));
  ok(a3.type === 'interactive' && a3.interactive.list_reply.id === 'act:102', 'العنوان يطابق، والمفتاح المحلّيّ = الدوليّ');
  // حساسٌ من قائمةٍ قديمة
  const { setAux } = await import('./src/config/redis.js');
  await setAux('wamenu:0790000001', { kind: 'button', items: r1.menu!.items, msgId: null, at: Date.now() - 11 * 60e3 });
  const a4 = await m.applyMenuReply('0790000001', txt('1'));
  ok(a4.type === 'text' && a4._emulated?.expired === true, 'res_confirm من قائمةٍ عمرها ١١ دقيقة يُرفض');
  await setAux('wamenu:0790000001', { kind: 'button', items: [{ n: 1, id: 'opt:0', title: 'نعم' }], msgId: null, at: Date.now() - 11 * 60e3 });
  const a5 = await m.applyMenuReply('0790000001', txt('1'));
  ok(a5.type === 'interactive', 'خيارٌ غير حسّاس يبقى صالحاً بعد ١٠ دقائق');

  console.log('— ترجمة أحداث OpenWA إلى شكل ميتا');
  const base = { id: 'false_962790000001@c.us_X', chatId: '962790000001@c.us', timestamp: 1760000000 };
  const t = inb.toMetaMessage({ ...base, type: 'text', body: 'مرحبا' }, key, null);
  ok(t.type === 'text' && t.text.body === 'مرحبا' && t.from === key && t.id === base.id, 'نصّ');
  const v = inb.toMetaMessage({ ...base, type: 'voice', body: '' }, key, { id: 'owa-abc', mime: 'audio/ogg' });
  ok(v.type === 'audio' && v.audio.id === 'owa-abc' && v.audio.voice === true && extractInbound(v).msgType === 'audio', 'رسالة صوتيّة ⟵ audio بمعرّف داخليّ');
  const im = inb.toMetaMessage({ ...base, type: 'image', body: 'هاي صورة الحوالة' }, key, { id: 'owa-i', mime: 'image/jpeg' });
  ok(im.image.id === 'owa-i' && extractInbound(im).body === 'هاي صورة الحوالة', 'صورة بتعليق');
  const loc = inb.toMetaMessage({ ...base, type: 'location', location: { latitude: 31.9, longitude: 35.9, description: 'البيت' } }, key, null);
  ok(loc.type === 'location' && loc.location.latitude === 31.9 && loc.location.name === 'البيت', 'موقع');
  const qt = inb.toMetaMessage({ ...base, type: 'text', body: '2', quotedMessage: { id: 'true_x' } }, key, null);
  ok(qt.context?.id === 'true_x', 'الاقتباس ⟵ context.id');
  ok(inb.toMetaMessage({ ...base, type: 'order' }, key, null).type === 'unsupported', 'نوعٌ غير معروف ⟵ unsupported');

  console.log('— المعرّفات');
  ok(inb.jidKind('962790000001@c.us') === 'user' && inb.jidKind('123456@lid') === 'lid' && inb.jidKind('1203@g.us') === 'group'
    && inb.jidKind('status@broadcast') === 'broadcast' && inb.jidKind('1@newsletter') === 'channel', 'أنواع المعرّفات');
  const who = await inb.resolveIdentity('962790000001@c.us', null);
  ok(who?.key === '962790000001' && who.verified === true, '@c.us رقمٌ موثَّق');
  const who2 = await inb.resolveIdentity('5555@lid', '962790000002');
  ok(who2?.key === '962790000002' && who2.verified === true && who2.chatId === '5555@lid', '@lid مع senderPhone ⟵ موثَّق والردّ إلى lid');

  console.log('— التوقيع');
  const raw = Buffer.from(JSON.stringify({ event: 'message.received', data: {} }));
  const sig = 'sha256=' + crypto.createHmac('sha256', 'test-secret-1234567890').update(raw).digest('hex');
  ok(inb.verifyOpenWaSignature(raw, sig) === true, 'توقيعٌ سليم يُقبل');
  ok(inb.verifyOpenWaSignature(raw, sig.replace(/.$/, '0')) === false, 'توقيعٌ معدّل يُرفض');
  ok(inb.verifyOpenWaSignature(raw, undefined) === false, 'بلا توقيع يُرفض');
  ok(inb.verifyOpenWaSignature(Buffer.from('{}'), sig) === false, 'جسمٌ آخر بالتوقيع نفسه يُرفض');

  console.log('— الصادر');
  ok(webChatIdOf({ waPhone: '962790000001' }) === '962790000001@c.us' && webChatIdOf({ webChatId: '5555@lid', waPhone: '' }) === '5555@lid', 'معرّف المحادثة للإرسال');
  const oc = toOutboxContent({ phone: '0790000001', waPhone: '962790000001' }, { interactive: confirm });
  ok(oc.content.kind === 'text' && oc.content.menu?.items.length === 2 && oc.content.menuKey === '0790000001' && oc.rendered.includes('1️⃣'), 'interactive ⟵ نصّ + خريطة');
  const oi = toOutboxContent({ phone: '0790000001', waPhone: '962790000001' }, { image: { link: 'https://club-mafia.grade.sbs/uploads/wa-out/w1-ab.jpg', caption: 'هلا' } });
  ok(oi.content.kind === 'image' && oi.content.imagePath === 'uploads/wa-out/w1-ab.jpg', 'صورتنا ⟵ ملفّها المحلّيّ (بلا PUBLIC_URL)');
  const ox = toOutboxContent({ phone: '0790000001', waPhone: '962790000001' }, { image: { link: 'https://evil.example/x.jpg' }, text: 'x' });
  ok(ox.content.kind === 'text', 'رابطٌ خارجيّ لا يُرسل صورةً (لا وكيل تحميل)');

  console.log(`\n${fail ? '❌' : '✅'} wa-web: ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
