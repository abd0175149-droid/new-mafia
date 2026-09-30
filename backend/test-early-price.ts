// ══════════════════════════════════════════════════════
// 🧪 سعر الدون المبكّر — المحرّك النقيّ + فحوص المصادر (بلا قاعدة)
// التشغيل: npx tsx test-early-price.ts
// ══════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  promoPrice, judgeEarly, pickEarly, reservationTotal, channelOfTag, deadlineOf, inScope, entryPriceSql,
  BOT_SELF_TAG, BOT_ADMIN_TAG, type PromoLike, type ActLite,
} from './src/services/early-price.service.js';

let pass = 0, fail = 0;
const check = (ok: boolean, name: string, extra: any = '') => { if (ok) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name}`, extra); } };
const sec = (t: string) => console.log(`\n${t}`);
const H = 3600e3;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(ROOT, 'src', rel), 'utf8').split('\r\n').join('\n');

const T0 = Date.parse('2026-10-01T19:30:00+03:00');        // موعد الفعاليّة
const P: PromoLike = {
  id: 1, name: 'سعر الدون المبكّر', status: 'live', mode: 'fixed', value: 2, leadHours: 24,
  actFrom: Date.parse('2026-09-30T00:00:00+03:00'), actUntil: Date.parse('2026-10-31T23:59:00+03:00'),
  scope: 'all', cityIds: [], activityIds: [], excludeIds: [], activatedAt: Date.parse('2026-09-30T00:00:00+03:00'),
};
const A: ActLite = { id: 259, name: 'مزاج افندينا ١ ت١', date: T0, price: 3, cityId: 1, isTest: false, status: 'planned', locationName: 'مزاج' };
const ctx = (hoursBefore: number, over: any = {}) => ({ now: T0 - hoursBefore * H, bookedAt: T0 - hoursBefore * H, channel: 'bot' as const, strikes: 0, ...over });
const codes = (v: any) => v.reasons.map((r: any) => r.code);

sec('١. السعر');
check(promoPrice({ mode: 'fixed', value: 2 }, 3) === 2, 'ثابت ٢ على ٣ ⟵ ٢');
check(promoPrice({ mode: 'fixed', value: 5 }, 3) === 3, 'ثابتٌ أعلى من السعر ⟵ لا يرفعه');
check(promoPrice({ mode: 'off', value: 1 }, 3) === 2, 'خصم دينار من ٣ ⟵ ٢');
check(promoPrice({ mode: 'off', value: 5 }, 3) === 0, 'الخصم لا ينزل تحت الصفر');
check(deadlineOf(P, A) === T0 - 24 * H, 'الموعد = الفعاليّة − المهلة');

sec('٢. الحكم');
let v = judgeEarly(P, A, ctx(30));
check(v.ok && v.price === 2 && v.base === 3, 'الدون قبل ٣٠ ساعة ⟵ ٢ بدل ٣', v);
check(!judgeEarly(P, A, ctx(23)).ok && codes(judgeEarly(P, A, ctx(23))).includes('lead'), 'قبل ٢٣ ساعة ⟵ فات الموعد');
check(judgeEarly(P, A, ctx(24)).ok, 'قبل ٢٤ ساعة تماماً ⟵ ينطبق');
check(judgeEarly(P, A, ctx(30, { channel: 'admin' })).ok, 'الأدمن عبر البوت ⟵ ينطبق (قرار المالك)');
check(codes(judgeEarly(P, A, ctx(30, { channel: 'app' }))).includes('channel'), 'التطبيق ⟵ لا (الدون فقط)');
check(codes(judgeEarly(P, A, ctx(30, { channel: 'staff' }))).includes('channel'), 'إدخال الداشبورد ⟵ لا');
check(codes(judgeEarly({ ...P, status: 'paused' }, A, ctx(30))).includes('state'), 'عرضٌ موقوف ⟵ لا');
check(codes(judgeEarly(P, { ...A, isTest: true }, ctx(30))).includes('test'), 'موقع اختبار ⟵ لا');
check(codes(judgeEarly(P, { ...A, status: 'cancelled' }, ctx(30))).includes('closed'), 'فعاليّة ملغاة ⟵ لا');
check(codes(judgeEarly(P, { ...A, date: Date.parse('2026-11-02T19:30:00+03:00') }, { ...ctx(30), bookedAt: Date.parse('2026-10-30T12:00:00+03:00') })).includes('window'), 'فعاليّة بعد نهاية الفترة ⟵ لا (الفترة تحكم موعد الفعاليّة)');
check(judgeEarly(P, A, { ...ctx(30), bookedAt: P.actFrom - 5 * H }).reasons.some(r => r.code === 'before'), 'حجزٌ قبل التفعيل ⟵ لا (إلّا بالمعاينة)');
check(judgeEarly(P, A, { ...ctx(30), bookedAt: P.actFrom - 5 * H, retro: true }).ok, 'الأثر الرجعيّ بالمعاينة ⟵ ينطبق');
check(!judgeEarly({ ...P, scope: 'cities', cityIds: [2] }, A, ctx(30)).ok, 'مدينة خارج النطاق ⟵ لا');
check(judgeEarly({ ...P, scope: 'cities', cityIds: [1] }, A, ctx(30)).ok, 'مدينته ضمن النطاق ⟵ نعم');
check(!judgeEarly({ ...P, scope: 'acts', activityIds: [260] }, A, ctx(30)).ok, 'فعاليّات بعينها ليست منها ⟵ لا');
check(codes(judgeEarly({ ...P, excludeIds: [259] }, A, ctx(30))).includes('excluded'), 'مستثناة ⟵ لا');
check(inScope({ ...P, scope: 'acts', activityIds: [259], excludeIds: [259] }, A) === null, 'الاستثناء لا يسري على «فعاليّات بعينها»');
check(codes(judgeEarly(P, A, ctx(30, { freeAccount: true }))).includes('free_account'), 'الحساب المجّانيّ ⟵ لا يُسجَّل عرض (مقعده صفر)');
v = judgeEarly(P, A, ctx(30, { strikes: 1 }));
check(!v.ok && v.blockedOnlyByStrike, 'غيابٌ قائم وحده ⟵ يُحرم ويُستهلك الغياب', v);
check(!judgeEarly(P, A, ctx(10, { strikes: 1 })).blockedOnlyByStrike, 'حجزٌ متأخّر أصلاً لا يستهلك الغياب');
check(codes(judgeEarly(P, { ...A, price: 0 }, ctx(30))).includes('noop'), 'فعاليّة مجّانيّة ⟵ لا عرض');

sec('٣. أكثر من عرض');
const P2: PromoLike = { ...P, id: 2, name: 'أرخص', value: 1.5 };
const pk = pickEarly([P, P2], A, ctx(30));
check(pk.best?.promoId === 2 && pk.best.price === 1.5, 'الأرخص للعميل');
check(pickEarly([P], A, ctx(30, { strikes: 1 })).strikeBlocked?.promoId === 1, 'يُعرف أنّ الغياب هو الحاجب');
check(pickEarly([P], A, ctx(10)).nearest?.reasons.some(r => r.code === 'lead') === true, 'الأقرب للانطباق يشرح «فات الموعد»');

sec('٤. الحجز المقفول');
check(reservationTotal(2, 3, { unitPrice: 2, promoSeats: 2 }) === 4, 'اثنان بالمبكّر = ٤');
check(reservationTotal(4, 3, { unitPrice: 2, promoSeats: 2 }) === 10, 'زاد اثنين بعد الموعد: ٢×٢ + ٢×٣ = ١٠');
check(reservationTotal(3, 3, { unitPrice: null, promoSeats: null }) === 9, 'بلا قفل = سعر الفعاليّة');
check(channelOfTag(BOT_SELF_TAG) === 'bot' && channelOfTag(BOT_ADMIN_TAG) === 'admin' && channelOfTag('player-app') === 'app' && channelOfTag('المدير العام') === 'staff', 'الوسوم ⟵ القنوات');
check(/COALESCE\(b\.unit_price, \(SELECT r_ep\.unit_price FROM reservations r_ep/.test(entryPriceSql('b', 'a')) && /a\.base_price\)$/.test(entryPriceSql('b', 'a')), 'سعر الحجز: قفله، ثمّ قفل المتابعة، ثمّ سعر الفعاليّة');

sec('٥. فحوص المصادر (كلّ قراءة مال وكلّ خطّاف)');
const bot = read('services/whatsapp-bot.service.ts');
const ext = read('services/wa-bot-ext.service.ts');
const loy = read('services/loyalty.service.ts');
check(/entryPriceForBooking/.test(read('services/fnb-invoice.service.ts')), 'فاتورة المكان: رسوم اللعبة بسعر الحجز');
check(/lockedPricesFor/.test(read('routes/fnb.routes.ts')), 'مرشّحو الفاتورة: بسعر الحجز');
check(/entryPriceForBooking/.test(read('sockets/lobby.socket.ts')), 'بوّابة التذكرة: بسعر الحجز');
check((read('routes/staff-player-card.routes.ts').match(/entryPriceSql\('b', 'a'\)/g) || []).length === 3 && !/SUM\(a\.base_price/.test(read('routes/staff-player-card.routes.ts')), 'دَين اللاعب: بسعر الحجز في الموضعين');
check(/expected_unpaid/.test(ext) && !/x\.unpaid \|\| 0\) \* Number\(a\.base_price/.test(ext), 'أداة المال للأدمن: المتوقّع بسعر الحجز');
check(/lockedPricesFor/.test(read('routes/bookings.routes.ts')), 'قائمة الحجوزات تحمل السعر المقفول لنافذة الدفع');
check((bot.match(/applyOnNewReservation\(/g) || []).length >= 2, 'البوت يقفل السعر في الحجز الذاتيّ وحجز الأدمن');
check(/onReservationMoved\(res\.id\)/.test(bot), 'نقل الأدمن يعيد التقييم');
check(/onReservationCancelled\(r\.id, \{ byCustomer: true \}\)/.test(bot), 'إلغاء العميل عبر البوت: الإلغاء المتأخّر غياب');
check(/onPeopleChanged/.test(ext), 'تعديل العدد يعيد تقييم المقاعد');
check(/earlyAnnouncementFor\(conv\)/.test(bot) && /earlyFactsLines/.test(bot), 'الإعلان مرّةً والحقائق الحيّة');
check(/'promo'/.test(loy) && /bk\.earlyPrice\) return \{ ok: false, verdict: 'promo'/.test(loy), 'الولاء: من أخذ السعر لا يُختم');
check(/createdBy === BOT_ADMIN_BOOKING_TAG/.test(loy), 'الولاء: حجز الأدمن عبر البوت يُحتسب ختماً');
check(/judgeNoShows/.test(read('services/session.service.ts')), 'نهاية الفعاليّة تحكم بالغياب');
check(/onReservationCancelled/.test(read('routes/player-app.routes.ts')), 'إلغاء التطبيق: الإلغاء المتأخّر غياب');
check(/waiveStrikes/.test(read('routes/reservations.routes.ts')), '«حضر» من الموظّف يلغي الغياب');
check(/useEarly/.test(read('services/booking-offers.service.ts')), 'عرض المجموعة: الأرخص للعميل بلا جمع');

console.log(`\n${'─'.repeat(46)}\nنجح ${pass} · فشل ${fail}`);
process.exit(fail ? 1 : 0);
