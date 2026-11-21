// ══════════════════════════════════════════════════════
// 🧪 خطّة توحيد الحجز — م١ج «الاختيار بالاستفتاء» (2026-11-21)
// بلا قاعدة ولا رسائل: يرسم الاستفتاء، ويترجم الصوت عبر Redis بمفتاح محادثةٍ وهميّ، ثمّ ينظّف.
// تشغيل داخل الحاوية: docker compose exec -T -w /app backend npx tsx src/scripts/test-poll-menus.ts
// ══════════════════════════════════════════════════════
import { renderPoll, applyPollVote, saveMenu, applyMenuReply, parseChoiceNumber, adaptForTextMenus, isConfirmWord, isNoWord } from '../services/wa-transport/menu-emulation.js';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); } };

const KEY = `lid:poll-test-${Date.now()}`;
const base = { id: 'x', from: KEY, timestamp: String(Math.floor(Date.now() / 1000)) };
const card = {
  type: 'button',
  body: { text: '📋 حجزك — The hub 22\n🗓️ الأحد 22 نوفمبر — 7:00 مساءً\n👥 4 أشخاص: إنت، أبو لين، عمو راكان، Hamza\n💰 4 × 3 = 12 د.أ\n🎁 «اللمة احلا»: 2 ببلاش ⟵ 6 د.أ — الدفع بالمكان\nℹ️ العرض بينحسب على اللي بيحضروا فعلاً عند الباب.\nℹ️ أصحابك اللي إلهم حساب بيوصلهم طلب يأكّدوا من الأزرار تحت.\n\nأثبّت؟' },
  action: { buttons: [{ type: 'reply', reply: { id: 'res_confirm:991', title: 'تأكيد الحجز ✓' } }, { type: 'reply', reply: { id: 'res_cancel', title: 'إلغاء' } }] },
};

async function main() {
  const { connectRedis } = await import('../config/redis.js').then((m: any) => ({ connectRedis: m.connectRedis || m.initRedis || (async () => {}) }));
  try { await connectRedis(); } catch { /* قد يتّصل كسولاً */ }

  console.log('\n① رسم الاستفتاء');
  const p = renderPoll(card)!;
  ok('بطاقة طويلة ⟵ نصٌّ قبل الاستفتاء', !!p?.pre && p.pre.includes('📋 حجزك'));
  ok('السؤال آخر سطر «أثبّت؟»', p?.name === 'أثبّت؟', p?.name);
  ok('الخيارات مرقّمة', p?.options[0] === '1️⃣ تأكيد الحجز ✓' && p.options[1] === '2️⃣ إلغاء', JSON.stringify(p?.options));
  ok('«من الأزرار تحت» ⟵ «من الاستفتاء تحت»', !!p?.pre?.includes('من الاستفتاء تحت') && !p.pre.includes('الأزرار'));
  const short = renderPoll({ type: 'button', body: { text: '🔔 بتحب أذكّرك قبل لعبتك بساعة؟' }, action: { buttons: [{ reply: { id: 'rem_on', title: '🔔 ذكّرني' } }, { reply: { id: 'rem_off', title: 'لا، شكراً' } }] } })!;
  ok('رسالة قصيرة ⟵ استفتاءٌ واحد سؤاله الرسالة', short?.pre === null && short.name.startsWith('🔔'));
  const one = renderPoll({ type: 'button', body: { text: 'x' }, action: { buttons: [{ reply: { id: 'a', title: 'وحيد' } }] } });
  ok('خيارٌ واحد ⟵ لا استفتاء (أرقام)', one === null);
  const rows = Array.from({ length: 13 }, (_, i) => ({ id: `r${i}`, title: `خيار ${i + 1}` }));
  ok('١٣ خياراً ⟵ لا استفتاء', renderPoll({ type: 'list', body: { text: 'اختار' }, action: { button: 'القائمة', sections: [{ rows }] } }) === null);
  const list = renderPoll({ type: 'list', body: { text: 'هاي الفعاليّات الجاية — اختار وحدة:' }, action: { button: 'الفعاليّات', sections: [{ rows: [{ id: 'act:413', title: 'الأحد 22 — The hub', description: '7 مساءً · 3 د.أ' }, { id: 'act:414', title: 'الثلاثاء 24 — The hub', description: '7 مساءً · 3 د.أ' }] }] } })!;
  ok('القائمة: الوصف يُلحق بالخيار', list?.options[0] === '1️⃣ الأحد 22 — The hub · 7 مساءً · 3 د.أ', list?.options[0]);

  console.log('\n② ترجمة الصوت');
  await saveMenu(KEY, p.menu, 'POLL-1');
  const v1 = await applyPollVote(KEY, 'POLL-1', ['1️⃣ تأكيد الحجز ✓'], base);
  ok('الصوت الأوّل ⟵ ضغطة زرّ res_confirm', v1.status === 'apply' && v1.msg.interactive?.button_reply?.id === 'res_confirm:991', JSON.stringify(v1).slice(0, 160));
  const v2 = await applyPollVote(KEY, 'POLL-1', ['2️⃣ إلغاء'], base);
  ok('تغيير الصوت بعده ⟵ «اعتمدنا اختيارك الأوّل»', v2.status === 'first' && (v2 as any).title === 'تأكيد الحجز ✓');
  const v3 = await applyPollVote(KEY, 'POLL-1', ['1️⃣ تأكيد الحجز ✓'], base);
  ok('… مرّةً واحدة فقط', v3.status === 'ignore');
  await saveMenu(KEY, short.menu, 'POLL-2');
  const v4 = await applyPollVote(KEY, 'POLL-2', [], base);
  ok('سحب الصوت ⟵ لا أثر', v4.status === 'ignore');
  const v5 = await applyPollVote(KEY, 'POLL-OLD', ['1️⃣ 🔔 ذكّرني'], base);
  ok('استفتاءٌ أقدم ⟵ «خيارات قديمة»', v5.status === 'old');
  const v6 = await applyPollVote(KEY, 'POLL-2', ['🔔 ذكّرني'], base);
  ok('نصٌّ بلا رقمه يُطابَق بالعنوان', v6.status === 'apply' && v6.msg.interactive?.button_reply?.id === 'rem_on', JSON.stringify(v6).slice(0, 120));
  // كتابة الرقم على استفتاءٍ حيّ ثمّ صوتٌ عليه
  await saveMenu(KEY, short.menu, 'POLL-3');
  const typed = await applyMenuReply(KEY, { id: 'm', from: KEY, type: 'text', text: { body: '‏٢' } });
  ok('«‏٢» بعلامة اتّجاه خفيّة ⟵ الخيار الثاني', typed.type === 'interactive' && typed.interactive?.button_reply?.id === 'rem_off', JSON.stringify(typed).slice(0, 140));
  const v7 = await applyPollVote(KEY, 'POLL-3', ['1️⃣ 🔔 ذكّرني'], base);
  ok('… وصوتٌ بعدها ⟵ «اعتمدنا اختيارك الأوّل»', v7.status === 'first');

  console.log('\n③ الأرقام والكلمات');
  ok('«‏1» يُقرأ ١', parseChoiceNumber('‏1') === 1);
  ok('«⁨3⁩» يُقرأ ٣', parseChoiceNumber('⁨3⁩') === 3);
  ok('«تأكيد» موافقة', isConfirmWord('تأكيد') && isConfirmWord('‏اه'));
  ok('«لا شكراً» رفض', isNoWord('لا شكراً') && isNoWord('لأ'));
  await saveMenu(KEY, short.menu, null);
  const yes = await applyMenuReply(KEY, { id: 'm2', from: KEY, type: 'text', text: { body: 'اه' } });
  ok('«اه» على قائمة نعم/لا ⟵ ذكّرني', yes.interactive?.button_reply?.id === 'rem_on', JSON.stringify(yes).slice(0, 120));
  await saveMenu(KEY, short.menu, null);
  const no = await applyMenuReply(KEY, { id: 'm3', from: KEY, type: 'text', text: { body: 'لا' } });
  ok('«لا» ⟵ لا، شكراً', no.interactive?.button_reply?.id === 'rem_off', JSON.stringify(no).slice(0, 120));
  // عامر #1199 (2026-11-21): «تثبيت» بعد بطاقة تعديل العدد ذهبت للنموذج فخمّن فعاليّةً أخرى
  ok('«تثبيت» و«ثبت لو سمحت» و«تثبيت الحجز» موافقة', isConfirmWord('تثبيت') && isConfirmWord('ثبّت لو سمحت') && isConfirmWord('تثبيت الحجز') && isConfirmWord('اعتمد'));
  ok('ولا تُحسب موافقةً جملةٌ طويلة أو سؤال', !isConfirmWord('تثبيت الحجز بكون قبل اللعبة بكم ساعة يا غالي؟') && !isConfirmWord('كم السعر') && !isConfirmWord('لا'));
  const chg = renderPoll({ type: 'button', body: { text: '✏️ تعديل حجزك من 1 إلى 5 أشخاص\n\nأثبّت التعديل؟' }, action: { buttons: [{ type: 'reply', reply: { id: 'chgp:2728:5', title: 'ثبّت التعديل ✓' } }, { type: 'reply', reply: { id: 'chg_keep', title: 'إلغاء' } }] } } as any)!;
  await saveMenu(KEY, chg.menu, null);
  const tb = await applyMenuReply(KEY, { id: 'm4', from: KEY, type: 'text', text: { body: 'تثبيت' } });
  ok('«تثبيت» على بطاقة التعديل ⟵ ضغطة «ثبّت التعديل»', tb.interactive?.button_reply?.id === 'chgp:2728:5', JSON.stringify(tb).slice(0, 140));
  ok('نصّ البوت للأرقام لم يتغيّر', adaptForTextMenus('أكّد من الأزرار تحت') === 'أكّد بكتابة رقم الخيار');
  ok('نصّ البوت للاستفتاء', adaptForTextMenus('اكتب رقم اختيارك', 'poll') === 'من الاستفتاء');

  const { deleteAux } = await import('../config/redis.js');
  for (const k of [`wamenu:${KEY}`, 'wapoll:POLL-1', 'wapoll:POLL-2', 'wapoll:POLL-3', 'wapoll-old:POLL-OLD']) await deleteAux(k).catch(() => {});
  console.log(`\n${fail ? '❌' : '✅'} م١ج: ${pass} نجح، ${fail} فشل`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('💥', e); process.exit(1); });
