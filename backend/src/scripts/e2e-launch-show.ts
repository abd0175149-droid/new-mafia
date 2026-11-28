// فحص حيّ لعرض ليلة الإطلاق على السيرفر — بمحتوى تجريبيّ بلا أيّ سرّ، ثمّ يعيد المحتوى الحقيقيّ والبداية.
//   docker compose exec -T backend npx tsx src/scripts/e2e-launch-show.ts
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { connectDB } from '../config/db.js';
import { ensureLaunchTables, setContent, control, LAUNCH_DIR } from '../services/launch-show.service.js';

const BASE = `http://localhost:${process.env.PORT || 4000}/api/launch-show`;
let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const rows = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);
const get = async (p: string) => { const r = await fetch(BASE + p); let b: any = null; try { b = await r.json(); } catch { /* */ } return { s: r.status, b }; };
const post = async (p: string, body: any) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); let b: any = null; try { b = await r.json(); } catch { /* */ } return { s: r.status, b }; };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

const db = await connectDB();
await ensureLaunchTables(db);
const [orig] = rows(await db.execute(sql`SELECT content, stage FROM launch_show WHERE id = 1`));
const realContent = orig?.content || {};
const nPred = rows(await db.execute(sql`SELECT count(*)::int n FROM launch_predictions`))[0]?.n || 0;
if (orig?.stage !== 'idle' || nPred > 0) { console.error('العرض ليس في البداية أو فيه نبوءات حقيقيّة — أوقفت الفحص.'); process.exit(2); }

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const dummyFiles = ['_e2e1.png', '_e2e2.png'];
fs.mkdirSync(path.join(LAUNCH_DIR, 'cards'), { recursive: true });
for (const f of dummyFiles) fs.writeFileSync(path.join(LAUNCH_DIR, 'cards', f), png);
const dummy = {
  title: 'عنوان تجريبيّ', motto: 'شعار تجريبيّ', breakAt: new Date(Date.now() + 3600_000).toISOString(), qrUrl: 'https://club.masaros.net/launch',
  poll: { question: 'سؤال تجريبيّ؟', options: [{ key: 'a', label: 'أ' }, { key: 'b', label: 'ب' }] },
  prophecy: { audio: 'none', lead: 1, lines: [{ t: 0, kind: 'narr', text: 'سطر ١' }, { t: 1, kind: 'verse', text: 'سطر ٢' }] },
  cardsIntro: { text: 'مقدّمة تجريبيّة' },
  cards: [{ key: 'e1', name: 'كرت ١', image: '_e2e1.png', slogan: '«١»', text: 'نصّ ١' }, { key: 'e2', name: 'كرت ٢', image: '_e2e2.png', slogan: '«٢»', text: 'نصّ ٢' }],
  predict: { question: 'من يفوز؟', options: [{ key: 'city', label: 'المدينة' }, { key: 'mafia', label: 'المافيا' }], prize: 'جائزة تجريبيّة' },
  end: { text: 'ختام تجريبيّ' },
};
const step = async (name: string) => { await wait(300); console.log('•', name); return (await get('/state')).b; };

try {
  await setContent(dummy);
  let s = await step('البداية');
  ok(s.stage === 'idle' && !s.title && !s.prophecy && !s.cards, 'لا عنوان ولا نبوءة ولا كروت قبل الكسر');
  ok((await get('/asset/card/e1')).s === 404, 'صورة الكرت مقفولة');
  ok((await get('/audio/none')).s === 401, 'الصوت للطاقم فقط');
  ok((await post('/predict', { name: 'تجربة', phone: '0790000001', choice: 'city' })).s === 409, 'لا نبوءة قبل فتح بابها');

  await control('goto', { stage: 'countdown' });
  await wait(350);
  ok((await post('/poll', { deviceId: 'e2e-device-0001', choice: 'a' })).s === 409, 'التصويت مغلق حتّى يُفتح');
  await control('poll', { open: true });
  await wait(350);
  ok((await post('/poll', { deviceId: 'e2e-device-0001', choice: 'a' })).s === 200, 'صوت ١');
  ok((await post('/poll', { deviceId: 'e2e-device-0002', choice: 'b' })).s === 200, 'صوت ٢');
  ok((await post('/poll', { deviceId: 'e2e-device-0002', choice: 'a' })).s === 200, 'الجهاز نفسه يغيّر صوته');
  ok((await post('/poll', { deviceId: 'e2e-device-0003', choice: 'zzz' })).s === 400, 'خيار غير معروف يُرفض');
  await wait(1100);
  s = await step('العدّ التنازليّ');
  ok(s.stage === 'countdown' && s.poll.open && s.poll.counts.a === 2 && !s.poll.counts.b, 'عدّ الأصوات صحيح (٢ لـ«أ»)');
  ok(!s.title && !s.prophecy, 'العدّ لا يكشف شيئاً');

  await control('goto', { stage: 'break' });
  s = await step('كسر الختم');
  ok(s.title === 'عنوان تجريبيّ' && s.prophecy?.lines?.length === 2 && s.poll.open === false, 'العنوان والسطور بعد الكسر، والتصويت أُغلق');
  ok(!s.cards, 'لا كروت بعد');

  await control('card_next', {});
  s = await step('مقدّمة الكروت');
  ok(s.stage === 'cards' && s.cardIndex === -1 && s.cards.length === 0 && s.cardsTotal === 2, 'المقدّمة بلا كرت مكشوف');
  ok((await get('/asset/card/e1')).s === 404, 'صورة الكرت ١ ما زالت مقفولة');
  await control('card_next', {});
  s = await step('الكرت ١');
  ok(s.cards.length === 1 && s.cards[0].name === 'كرت ١', 'كُشف الكرت ١ وحده');
  ok((await get('/asset/card/e1')).s === 200 && (await get('/asset/card/e2')).s === 404, 'صورة ١ مفتوحة و٢ مقفولة');
  await control('card_prev', {}); s = await step('رجوع'); ok(s.cardIndex === -1, 'الرجوع يعمل');
  await control('card_next', {}); await control('card_next', {});
  s = await step('الكرت ٢'); ok(s.cards.length === 2, 'كُشف الكرت ٢');
  await control('card_next', {});
  s = await step('الكروت معاً'); ok(s.stage === 'lineup' && s.cards.length === 2, 'بعد آخر كرت: الكروت معاً');

  await control('goto', { stage: 'predict' });
  await wait(350);
  ok((await post('/predict', { name: 'أحمد علي', phone: '0790000001', choice: 'city' })).s === 200, 'نبوءة ١');
  ok((await post('/predict', { name: 'سارة', phone: '+962 79 000 0002', choice: 'city' })).s === 200, 'نبوءة ٢ (رقم دوليّ)');
  ok((await post('/predict', { name: 'خالد', phone: '٠٧٩٠٠٠٠٠٠٣', choice: 'mafia' })).s === 200, 'نبوءة ٣ (أرقام عربيّة)');
  ok((await post('/predict', { name: 'خالد', phone: '0790000003', choice: 'mafia' })).s === 200, 'تعديل النبوءة نفسها لا يكرّرها');
  ok((await post('/predict', { name: 'ب', phone: '123', choice: 'city' })).s === 400, 'رقم خاطئ يُرفض');
  ok((await post('/predict', { name: 'لاعب', phone: '0790000004', choice: 'xx' })).s === 400, 'خيار خاطئ يُرفض');
  await wait(1100);
  s = await step('باب النبوءات'); ok(s.predict.count === 3 && s.predict.prize === 'جائزة تجريبيّة', 'ثلاث نبوءات والجائزة ظاهرة');

  await control('goto', { stage: 'predict_closed' });
  await wait(350);
  ok((await post('/predict', { name: 'متأخّر', phone: '0790000005', choice: 'city' })).s === 409, 'الباب أُغلق');
  await control('answer', { answer: 'city' });
  await wait(1100);
  s = await step('الجواب'); ok(s.stage === 'result' && s.predict.answer === 'city' && s.predict.correct === 2, 'صدق اثنان');
  await control('draw', {});
  s = await step('السحب');
  ok(s.stage === 'draw' && ['أحمد علي', 'سارة'].includes(s.winner?.name) && s.drawNames.length === 2 && s.winner.tail?.length === 3, 'الفائز ممّن صدقوا فقط');
  const first = s.winner.name;
  await control('draw', { redraw: true });
  s = await step('إعادة السحب'); ok(s.winner?.name && s.winner.name !== first, 'إعادة السحب تستبعد الفائز الأوّل');
  await control('goto', { stage: 'end' });
  s = await step('الختام'); ok(s.stage === 'end' && s.end?.text === 'ختام تجريبيّ', 'الختام');
} catch (e: any) {
  fail++; console.error('✗ توقّف الفحص:', e.message);
} finally {
  await control('reset', { wipe: true });
  await setContent(realContent);
  for (const f of dummyFiles) try { fs.unlinkSync(path.join(LAUNCH_DIR, 'cards', f)); } catch { /* */ }
  const [r] = rows(await db.execute(sql`SELECT stage, (content->>'title') IS NOT NULL t FROM launch_show WHERE id = 1`));
  const left = rows(await db.execute(sql`SELECT (SELECT count(*) FROM launch_predictions)::int p, (SELECT count(*) FROM launch_poll_votes)::int v`))[0];
  ok(r.stage === 'idle' && r.t && left.p === 0 && left.v === 0, 'رجع كلّ شيء للبداية بالمحتوى الحقيقيّ، بلا بيانات تجريبيّة');
  console.log(`\n${fail ? '❌' : '✅'} ${pass} نجح · ${fail} فشل`);
  process.exit(fail ? 1 : 0);
}
