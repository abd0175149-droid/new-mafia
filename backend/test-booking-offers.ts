// ══════════════════════════════════════════════════════
// 🎟️ فحص عروض الحجز الجماعيّ «جيب صحابك»
// ══════════════════════════════════════════════════════
// المحرّكُ دالّةٌ نقيّة يستعملها البوت والداشبورد والباب — خطأٌ فيه يَعِد العميل بما لا
// يُعطى عند الباب، أو يعطي مجّاناً لمن لا يستحقّ. ثمّ فحوصُ مصادر لما لا تلتقطه التجربة
// اليدويّة: صيغة العدّ، الطيّ، الوسم، وعدمُ كشف الحسابات.
//
//   npx tsx test-booking-offers.ts          (بلا قاعدة بيانات وبلا شبكة)
// ══════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  offerState, blocksFor, freeFor, ruleText, evaluateOffer, pickBest, pickNudge, settleCount, priorityWindow, notifyText,
  type OfferLike, type EvalCtx,
} from './src/services/booking-offers.service.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(ROOT, 'src', rel), 'utf8').split('\r\n').join('\n');

let pass = 0, fail = 0;
function check(ok: boolean, label: string, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${label}`); } else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}
const H = 3600e3;
const T = (s: string) => Date.parse(s + ':00+03:00');
const NOW = T('2026-10-01T18:00');
const offer = (x: Partial<OfferLike> = {}): OfferLike => ({
  id: 1, name: 'جيب ٤ والخامس علينا', status: 'live', N: 5, K: 4, repeat: true,
  bookFrom: T('2026-10-01T16:00'), bookUntil: T('2026-10-04T12:00'), leadHours: 6,
  maxGroups: 10, perCustomer: 1, priorityHours: 24, notifiedAt: null, ...x,
});
const ctx = (x: Partial<EvalCtx> = {}): EvalCtx => ({ now: NOW, activityAt: T('2026-10-04T19:30'), used: 0, reserved: 0, existing: false, customerClaims: 0, ...x });

console.log('\n🎟️  عروض الحجز الجماعيّ\n');

console.log('١. الحالة من الساعة');
check(offerState(offer({ status: 'draft' }), NOW) === 'draft', 'المسودة مسودةٌ مهما كان الوقت');
check(offerState(offer({ status: 'paused' }), NOW) === 'paused', 'الموقوف موقوف');
check(offerState(offer(), T('2026-10-01T15:59')) === 'scheduled', 'قبل النافذة = مجدول');
check(offerState(offer(), NOW) === 'live', 'داخل النافذة = فعّال');
check(offerState(offer(), T('2026-10-04T12:01')) === 'ended', 'بعد النافذة = منتهٍ');

console.log('\n٢. الكتل والتكرار');
const t41 = { N: 5, K: 4, repeat: true }, t11 = { N: 2, K: 1, repeat: false }, t31 = { N: 3, K: 1, repeat: true };
check(freeFor(t41, 4) === 0 && freeFor(t41, 5) === 1 && freeFor(t41, 9) === 1 && freeFor(t41, 10) === 2, '٤+١ يتكرّر: ٤⟵٠ ٥⟵١ ٩⟵١ ١٠⟵٢');
check(freeFor(t11, 1) === 0 && freeFor(t11, 2) === 1 && freeFor(t11, 6) === 1, '١+١ مرّة للحجز: ٦ أشخاص ⟵ واحد مجاناً فقط');
check(freeFor(t31, 3) === 2 && freeFor(t31, 6) === 4 && freeFor(t31, 7) === 4, '٣ بدخوليّة ١: ٣⟵٢ ٦⟵٤ ٧⟵٤');
check(blocksFor(t41, 0) === 0, 'صفر أشخاص لا كتل');
check(ruleText(t41) === '4 بيدفعوا والخامس مجاناً — ويتكرّر مع كلّ 5', 'نصّ القاعدة ٤+١', ruleText(t41));
check(ruleText(t11) === 'واحد بيدفع والثاني مجاناً — مرّة واحدة لكلّ حجز', 'نصّ القاعدة ١+١', ruleText(t11));
check(ruleText(t31).startsWith('3 أشخاص بسعر شخص واحد'), 'نصّ القاعدة ٣ بدخوليّة ١', ruleText(t31));

console.log('\n٣. الشروط');
{
  const e = evaluateOffer(offer(), 5, ctx());
  check(e.ok && e.free === 1 && e.pay === 4, 'خمسة داخل النافذة ⟵ ١ مجاناً');
  const d = evaluateOffer(offer({ status: 'draft' }), 5, ctx());
  check(!d.ok && d.reasons.every(r => !r.customer), 'المسودة لا تنطبق ولا يُذكر سببها للعميل');
  const lead = evaluateOffer(offer(), 5, ctx({ now: T('2026-10-04T10:00'), activityAt: T('2026-10-04T13:00') })); // ٣ ساعات قبلها والمهلة ٦
  check(!lead.ok && lead.reasons.some(r => r.customer && r.text.includes('6 ساعات')), 'المهلة: الحجز قبل الفعاليّة بست ساعات', lead.reasons.map(r => r.text).join(' | '));
  const cap = evaluateOffer(offer(), 5, ctx({ used: 10 }));
  check(!cap.ok && cap.reasons.some(r => r.text.includes('اكتمل')), 'السقف ممتلئ ⟵ لا ينطبق');
  const per = evaluateOffer(offer(), 5, ctx({ customerClaims: 1 }));
  check(!per.ok && per.reasons.some(r => r.text.includes('استفدت')), 'حدّ العميل الواحد');
  const own = evaluateOffer(offer(), 5, ctx({ customerClaims: 1, used: 10, ownGroup: true }));
  check(own.ok, 'ترقيةُ مجموعته هو لا تستهلك سقفاً ولا حدّ عميل');
}

console.log('\n٤. الأولويّة للحاجزين مسبقاً');
{
  const o = offer({ maxGroups: 5 });
  // ٣ مستهلكة + حصّتان محجوزتان = ٥ ⟵ الجديد يُردّ، والحاجز المسبق يأخذ حصّته
  const fresh = evaluateOffer(o, 5, ctx({ used: 3, reserved: 2 }));
  check(!fresh.ok && fresh.reasons.some(r => r.text.includes('محجوزٌ للحاجزين')), 'الجديد يُردّ حين يبقى المحجوز فقط', fresh.reasons.map(r => r.text).join(' | '));
  const old = evaluateOffer(o, 5, ctx({ used: 3, reserved: 2, existing: true, bookedAt: T('2026-09-28T20:10') }));
  check(old.ok && old.priority, 'الحاجز المسبق يأخذ حصّته المحجوزة');
  check(old.grandfathered, 'يستفيد رغم أنّ حجزه الأصليّ قبل بداية النافذة');
  const after = evaluateOffer(o, 5, ctx({ used: 5, reserved: 0, existing: true, now: T('2026-10-03T10:00') }));
  check(!after.ok, 'بعد مدّة الأولويّة: السقف يسري على الجميع');
  const [ps, pe] = priorityWindow(offer({ notifiedAt: T('2026-10-01T20:00') }));
  check(ps === T('2026-10-01T20:00') && pe === ps + 24 * H, 'الأولويّة تبدأ من الإبلاغ لا من بداية النافذة');
}

console.log('\n٥. الحثّ والأفضل');
{
  const e3 = evaluateOffer(offer(), 3, ctx());
  check(e3.ok && e3.free === 0 && e3.nudge?.need === 2 && e3.nudge?.free === 1, 'ثلاثة على ٤+١ ⟵ «زيد ٢ وبصير واحد ببلاش»');
  const e2 = evaluateOffer(offer(), 2, ctx());
  check(e2.nudge === null, 'لا حثَّ على زيادة ٣ (فوق الحدّ ٢)');
  const e6 = evaluateOffer(offer(), 6, ctx());
  check(e6.free === 1 && e6.nudge === null, 'ستّة ⟵ ١ مجاناً، ولا حثّ للعشرة (يلزم ٤)');
  const a = evaluateOffer(offer({ id: 1 }), 6, ctx());
  const b = evaluateOffer(offer({ id: 2, N: 3, K: 1 }), 6, ctx());
  check(pickBest([a, b])?.offerId === 2, 'تعدّد العروض: الأوفر للعميل (٣ بسعر ١ يعطي ٤ مقابل ١)');
  check(pickNudge([e3], null)?.offerId === 1, 'الحثّ يُختار حين لا أفضل');
}

console.log('\n٦. الحسم عند الباب');
{
  const five = [true, true, true, true, true].map(p => ({ paying: p }));
  check(settleCount(t41, five).free === 1, 'خمسة دافعين ⟵ ١ مجاناً');
  const withFree = [true, true, true, true, false].map(p => ({ paying: p }));
  check(settleCount(t41, withFree).free === 0, 'الحساب المجّانيّ لا يُكمل المجموعة (٤ دافعين ⟵ لا عرض)');
  check(settleCount(t41, [true, true, true, true].map(p => ({ paying: p }))).free === 0, 'حضر أربعة من خمسة ⟵ لا عرض (على الحضور لا المحجوز)');
  check(settleCount({ N: 3, K: 1, repeat: true }, [{ paying: true }, { paying: true }, { paying: true }]).free === 2, 'المجّانيّ لا يتجاوز الدافعين');
}

console.log('\n٧. رسالة الحاجز المسبق');
{
  const act = { id: 1, name: 'مزاج افندينا', date: new Date(T('2026-10-04T19:30')), price: 5, locationName: '', cityId: 1, isTest: false };
  const up = notifyText(offer(), act, { name: 'خالد', people: 3 });
  check(!up.qualifies && up.target === 5 && up.text.includes('لو صرتوا 5') && up.text.includes('20 د.أ'), 'خالد ٣ ⟵ «لو صرتوا ٥ بتدفعوا ٤ — ٢٠ د.أ»');
  check(up.text.includes('محفوظلك') && up.text.includes('لإيقاف هذه الرسائل'), 'فيها الأولويّة وذيل الإيقاف');
  const q = notifyText(offer(), act, { name: 'سارة', people: 5 });
  check(q.qualifies && q.text.includes('ابعتلي اسم ورقم'), 'سارة ٥ ⟵ تستحقّ، لكن تُطلب أرقام أصحابها لتثبيته');
}

console.log('\n٨. فحوصُ المصادر');
{
  const bc = read('services/booking-count.service.ts');
  check(/booking_group_members/.test(bc) && /GREATEST\(COALESCE\(\$\{reservations\.peopleCount\}, 1\) - 1 -/.test(bc),
    'صيغة العدّ تطرح الأعضاء المرتبطين (لا يُعدّ الصديق مرّتين)');
  const rc = read('services/reservation-collapse.service.ts');
  check((rc.match(/booking_group_members/g) || []).length >= 2, 'الطيّ يطوي المجهولين فقط — في الموضعين');
  const loy = read('services/loyalty.service.ts');
  const svc = read('services/booking-offers.service.ts');
  const tag = (svc.match(/GROUP_BOOKING_TAG = '([^']+)'/) || [])[1] || '';
  check(!!tag && !loy.includes(tag), 'وسمُ المجموعة لا يُحتسب ختماً (loyalty لا يعرفه)', tag);
  check(/createdBy: 'player-app'/.test(svc.slice(svc.indexOf('async function acceptMember'))), 'التأكيدُ بنفسه يحوّله ختماً');
  const bot = read('services/whatsapp-bot.service.ts');
  const toolStart = bot.indexOf("case 'set_group_members'");
  const ret = bot.slice(bot.indexOf('return {\n        sent: true', toolStart), bot.indexOf("case 'create_reservation'", toolStart));
  check(toolStart > 0 && ret.length > 100 && !/accountName|playerId|hasAccount|existingBookingId/.test(ret), 'أداة الدون لا تُعيد للنموذج ما يكشف وجود حساب');
  const btn = bot.slice(bot.indexOf('async function handleOfferButton'), bot.indexOf('function extHelpers'));
  check(/ownPhone !== conv\.phone/.test(btn), 'زرّ تأكيد الصديق لا يعمل إلّا من محادثة صاحب الرقم');
  check(/ANNOUNCE_BLOCKERS/.test(bot) && /announcementFor\(conv, explained\)/.test(bot), 'الإعلان تُلحقه الشيفرة مع مانع ردود الإجراءات');
  const card = svc.slice(svc.indexOf('export async function planGroup'), svc.indexOf('// ✅ تثبيتُ المجموعة'));
  check(!/accountName/.test(card.slice(card.indexOf('const L: string[]'))), 'بطاقة التأكيد بالاسم الذي كتبه صاحب الحجز لا باسم الحساب');
  const app = read('routes/player-app.routes.ts');
  check(/acceptByAppBooking/.test(app) && /linkOnAppBooking/.test(app), 'التطبيق: تأكيدُ صديقٍ له حساب + ربطُ صديقٍ جديد');
  check(/notTestActivity|isTestActivity|isTest/.test(svc), 'مواقع الاختبار مستثناة');
}

console.log(`\n${'─'.repeat(46)}\nنجح ${pass} · فشل ${fail}`);
if (fail) { console.log('\n⚠️  لا تنشر قبل الإصلاح.\n'); process.exit(1); }
console.log('\n✅ المحرّك يعطي ما يَعِد به الدون، والعدّ لا يتضاعف.\n');
