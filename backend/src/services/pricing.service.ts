// ══════════════════════════════════════════════════════
// 💸 محرّك الأسعار والعروض الموحّد — الفهرس و«التسعير» (خطّة توحيد الحجز م٤-أ، 2026-11-21)
// ══════════════════════════════════════════════════════
// كانت العروض ثلاثة محرّكات لا يعرف أحدها الآخر: السعر المبكّر (early_price_promos)، وعرض
// المجموعة (booking_offers)، وبطاقة الولاء (loyalty_config). هذه الوحدة:
//   • offerCatalog()  — فهرسٌ واحد بشكلٍ واحد: النوع، والحالة، والنطاق، والقنوات، وقاعدة الجمع.
//   • offersForActivity() — «عروض هذه الليلة» لفعاليّة (ق٢٣): ما ينطبق عليها الآن.
//   • quote()  — دالّة تسعيرٍ واحدة: تعطي كلّ خيارٍ بسعره الكامل وأسبابه، والأفضل للعميل.
// م٤-أ قراءةٌ فقط: لا تغيّر سعراً ولا تقفله — دوالّ الحكم هي نفسها (judgeEarly / evaluateOffer /
// availableReward)، فالتطابق مع المحرّكات القديمة بالبناء. قواعد الجمع المعتمدة تُطبَّق في الاختيار:
//   ق١١ لا جمع افتراضاً، والأفضل للعميل · ق١٣ الولاء حصريّ على الحجز كلّه · ق١٤ مكافأة واحدة في
//   الليلة، والمشروب لا يُطبَّق آليّاً ليلة العرض · ق١٥ عند التعارض يرى العميل الخيارين ويختار.

import { getDB } from '../config/db.js';
import { activities } from '../schemas/admin.schema.js';
import { eq } from 'drizzle-orm';

export type OfferKind = 'early' | 'group' | 'loyalty_visit' | 'loyalty_drink' | 'loyalty_chips';
export type StackMode = 'seat' | 'booking' | 'invoice';
export type QuoteChannel = 'app' | 'bot' | 'admin' | 'staff';

export interface CatalogOffer {
  key: string; kind: OfferKind; id: number | null; name: string;
  status: 'live' | 'paused' | 'draft' | 'scheduled' | 'ended';
  rule: string;
  scope: { mode: 'all' | 'cities' | 'acts' | 'locations'; text: string; activityIds: number[]; excludeIds: number[] };
  channels: string[]; channelsText: string;
  stack: StackMode; stackText: string;
  window: string | null;
  edit: string;
}

const KIND_LABEL: Record<OfferKind, string> = {
  early: '💸 سعر مبكّر', group: '👥 عرض مجموعة', loyalty_visit: '🎟️ زيارة ولاء', loyalty_drink: '☕ مشروب ولاء', loyalty_chips: '🪙 رقائق ولاء',
};
export const kindLabel = (k: OfferKind) => KIND_LABEL[k];
const STACK_TEXT: Record<StackMode, string> = {
  seat: 'على المقعد — لا يُجمع مع عرضٍ آخر على المقعد نفسه',
  booking: 'حصريّ على الحجز كلّه — لا يُجمع معه شيء',
  invoice: 'على الفاتورة لا على الدخول — لا يُطبَّق آليّاً ليلة عرض',
};
const CH_TEXT: Record<string, string> = { app: 'التطبيق', bot: 'الدون', admin: 'أدمن البوت', staff: 'الإدارة', door: 'الباب' };
const chText = (cs: string[]) => cs.map((c) => CH_TEXT[c] || c).join(' و');
const fmtD = (t: number) => new Date(t).toLocaleDateString('ar-JO', { timeZone: 'Asia/Amman', day: 'numeric', month: 'long' });

/** 📚 الفهرس الموحّد — كلّ العروض بشكلٍ واحد (القديمة تبقى جداولها كما هي، للتاريخ) */
export async function offerCatalog(now = Date.now()): Promise<CatalogOffer[]> {
  const out: CatalogOffer[] = [];
  const E = await import('./early-price.service.js');
  const O = await import('./booking-offers.service.js');
  const L = await import('./loyalty.service.js');
  const db = getDB();
  const cityNames = new Map<number, string>();
  try {
    const r: any = await db?.execute((await import('drizzle-orm')).sql`SELECT id, name FROM cities`);
    for (const c of (r?.rows ?? [])) cityNames.set(Number(c.id), String(c.name));
  } catch { /* بلا أسماء مدن */ }

  for (const row of await E.listPromoRows()) {
    const p = E.toPromo(row);
    const ended = p.actUntil < now;
    out.push({
      key: `early:${p.id}`, kind: 'early', id: p.id, name: p.name,
      status: ended ? 'ended' : p.status,
      rule: `${p.mode === 'fixed' ? `السعر ${p.value} د.أ` : `خصم ${p.value} د.أ`} لمن يحجز قبل اللعبة بـ${p.leadHours} ساعة على الأقلّ`,
      scope: { mode: p.scope, text: p.scope === 'acts' ? `${p.activityIds.length} فعاليّة مختارة` : E.scopeText(p, cityNames), activityIds: p.activityIds, excludeIds: p.excludeIds },
      channels: ['bot', 'admin'], channelsText: chText(['bot', 'admin']),
      stack: 'seat', stackText: STACK_TEXT.seat,
      window: `فعاليّات ${fmtD(p.actFrom)} – ${fmtD(p.actUntil)}`,
      edit: '/admin/whatsapp?tab=bookoffers',
    });
  }
  for (const row of await O.listOfferRows()) {
    const o = O.toLike(row);
    const st = O.offerState(o, now);
    const ids = O.actIdsOf(row);
    out.push({
      key: `group:${o.id}`, kind: 'group', id: o.id, name: o.name, status: st,
      rule: O.ruleText(o),
      scope: { mode: 'acts', text: `${ids.length} فعاليّة مختارة`, activityIds: ids, excludeIds: [] },
      channels: ['bot'], channelsText: chText(['bot']),
      stack: 'booking', stackText: 'على المجموعة — مقاعدها المجّانيّة لا تُجمع مع عرضٍ آخر',
      window: `الحجز ${fmtD(o.bookFrom)} – ${fmtD(o.bookUntil)}`,
      edit: '/admin/whatsapp?tab=bookoffers',
    });
  }
  try {
    const cfg = await L.getLoyaltyConfig();
    const locText = cfg.locationIds.length ? `${cfg.locationIds.length} مكان` : 'كلّ الأماكن';
    const stampCh = cfg.channel === 'app' ? ['app'] : cfg.channel === 'app_bot' ? ['app', 'bot'] : ['app', 'bot', 'staff'];
    const base = { scope: { mode: 'locations' as const, text: locText, activityIds: [], excludeIds: [] }, window: `الختم: ${chText(stampCh)} · ${cfg.stampsPerReward} أختام = مكافأة`, edit: '/admin/loyalty' };
    const st = (on: boolean) => (cfg.enabled && on ? 'live' : 'paused') as CatalogOffer['status'];
    out.push({ key: 'loyalty:visit', kind: 'loyalty_visit', id: null, name: 'زيارة مجّانيّة', status: st(cfg.rewards.freeVisit.enabled),
      rule: 'دخول صاحب المكافأة مجّاناً في حجزه', channels: ['app'], channelsText: chText(['app']), stack: 'booking', stackText: STACK_TEXT.booking, ...base });
    out.push({ key: 'loyalty:drink', kind: 'loyalty_drink', id: null, name: 'مشروب مجّانيّ', status: st(cfg.rewards.freeDrink.enabled),
      rule: `مشروبٌ حتّى ${cfg.rewards.freeDrink.capJod} د.أ على الفاتورة`, channels: ['staff'], channelsText: 'فاتورة المقهى', stack: 'invoice', stackText: STACK_TEXT.invoice, ...base });
    out.push({ key: 'loyalty:chips', kind: 'loyalty_chips', id: null, name: 'رقائق', status: st(cfg.rewards.chips.enabled),
      rule: `${cfg.rewards.chips.amount} رقاقة في الحساب`, channels: ['app'], channelsText: chText(['app']), stack: 'invoice', stackText: 'خارج سعر الدخول — لا تعارض', ...base });
  } catch { /* الولاء غير متاح */ }
  return out;
}

/** 🌙 «عروض هذه الليلة» — ما يخصّ هذه الفعاليّة من الفهرس، الفعّال أوّلاً (ق٢٣) */
export async function offersForActivity(activityId: number, now = Date.now()): Promise<Array<CatalogOffer & { applies: boolean; note: string }>> {
  const E = await import('./early-price.service.js');
  const a = await E.actLite(activityId);
  if (!a) return [];
  const cat = await offerCatalog(now);
  const res: Array<CatalogOffer & { applies: boolean; note: string }> = [];
  for (const o of cat) {
    if (o.kind === 'early') {
      const row = (await E.listPromoRows()).find((r: any) => Number(r.id) === o.id);
      if (!row) continue;
      const p = E.toPromo(row);
      if (a.date < p.actFrom || a.date > p.actUntil || E.inScope(p, a)) continue;
      const dl = E.deadlineOf(p, a);
      res.push({ ...o, applies: o.status === 'live' && !a.isTest, note: o.status !== 'live' ? 'موقوف' : dl > now ? `حتّى ${E.fmtWhen(dl)}` : 'انتهت مهلته لهذه الليلة' });
    } else if (o.kind === 'group') {
      if (!o.scope.activityIds.includes(activityId)) continue;
      res.push({ ...o, applies: o.status === 'live' && !a.isTest, note: o.status === 'live' ? o.rule : o.status === 'paused' ? 'موقوف' : o.status === 'scheduled' ? 'لم يبدأ' : 'انتهى' });
    } else if (o.kind === 'loyalty_visit' || o.kind === 'loyalty_drink') {
      res.push({ ...o, applies: o.status === 'live' && !a.isTest, note: o.status === 'live' ? 'لمن عنده مكافأة' : 'موقوف' });
    }
  }
  return res.sort((x, y) => Number(y.applies) - Number(x.applies));
}

export interface QuoteOption {
  key: string; kind: 'base' | OfferKind; label: string; ok: boolean;
  total: number; perSeat: number | null; freeSeats: number; reasons: string[]; consumesReward?: boolean;
}
export interface Quote {
  activity: { id: number; name: string; date: number; base: number; isTest: boolean } | null;
  people: number; channel: QuoteChannel;
  options: QuoteOption[]; best: string; choose: boolean; notes: string[];
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * 🧮 التسعير — ما يدفعه هذا الشخص لو حجز الآن بهذا العدد عبر هذه القناة.
 * قراءةٌ فقط. الخيارات: العاديّ، والمبكّر، والمجموعة، وزيارة الولاء — كلٌّ بالمجموع الكامل للحجز.
 */
export async function quote(p: { activityId: number; people: number; phone?: string | null; playerId?: number | null; channel: QuoteChannel; at?: number }): Promise<Quote> {
  const people = Math.max(1, Math.min(30, Math.trunc(Number(p.people) || 1)));
  const now = p.at ?? Date.now();
  const E = await import('./early-price.service.js');
  const a = await E.actLite(p.activityId);
  const empty: Quote = { activity: null, people, channel: p.channel, options: [], best: 'base', choose: false, notes: ['الفعاليّة غير موجودة'] };
  if (!a) return empty;
  const base = Number(a.price) || 0;
  const options: QuoteOption[] = [{ key: 'base', kind: 'base', label: 'السعر العاديّ', ok: true, total: round2(people * base), perSeat: base, freeSeats: 0, reasons: [] }];
  const notes: string[] = [];

  // 💸 المبكّر — الحكم نفسه الذي يقفل السعر (judgeEarly عبر earlyQuote)
  try {
    const q = await E.earlyQuote({ activityId: p.activityId, phone: p.phone, playerId: p.playerId, channel: p.channel === 'staff' ? 'staff' : p.channel, bookedAt: now, now });
    const v = q.best || q.strikeBlocked || q.nearest;
    if (v) options.push({
      key: `early:${v.promoId}`, kind: 'early', label: `${KIND_LABEL.early} — ${v.name}`, ok: !!q.best,
      total: round2(people * (q.best ? q.best.price : base)), perSeat: q.best ? q.best.price : v.price, freeSeats: 0,
      reasons: q.best ? [`حتّى ${E.fmtWhen(q.best.deadline)}`] : v.reasons.map((r) => r.text),
    });
  } catch (e: any) { notes.push(`المبكّر: ${e?.message}`); }

  // 👥 المجموعة — التقييم نفسه الذي يستعمله الدون
  if (p.phone) {
    try {
      const O = await import('./booking-offers.service.js');
      const ev = await O.evaluateForCustomer({ activityId: p.activityId, people, phone: String(p.phone), playerId: p.playerId ?? null, now });
      const g = ev.best || ev.nudge || ev.evals[0];
      if (g) options.push({
        key: `group:${g.offerId}`, kind: 'group', label: `${KIND_LABEL.group} — ${g.name}`, ok: !!ev.best && g === ev.best,
        total: round2((g === ev.best ? g.pay : people) * base), perSeat: null, freeSeats: g === ev.best ? g.free : 0,
        reasons: g === ev.best ? [`${g.free} مجّاناً من ${g.people}`] : g.nudge ? [`أضف ${g.nudge.need} ليصير ${g.nudge.free} مجّاناً`] : g.reasons.filter((r) => r.customer).map((r) => r.text),
      });
    } catch (e: any) { notes.push(`المجموعة: ${e?.message}`); }
  }

  // 🎟️ الولاء — زيارةٌ مجّانيّة لصاحب الحجز، حصريّة على الحجز كلّه (ق١٣)
  let drink = false;
  if (p.playerId) {
    try {
      const L = await import('./loyalty.service.js');
      const cfg = await L.getLoyaltyConfig();
      const db = getDB();
      const [act] = db ? await db.select({ locationId: activities.locationId }).from(activities).where(eq(activities.id, p.activityId)).limit(1) : [];
      const locOk = cfg.enabled && L.isLocationEnabled(cfg, act?.locationId ?? null);
      if (locOk && cfg.rewards.freeVisit.enabled) {
        const rw = await L.availableReward(Number(p.playerId), 'free_visit');
        if (rw) options.push({
          key: 'loyalty:visit', kind: 'loyalty_visit', label: KIND_LABEL.loyalty_visit, ok: p.channel === 'app',
          total: round2((people - 1) * base), perSeat: null, freeSeats: 1, consumesReward: true,
          reasons: p.channel === 'app' ? ['دخوله مجّاناً · لا عرض آخر في الحجز نفسه'] : ['تُطبَّق اليوم من التطبيق فقط (ق٦ ينقلها للدون والباب)'],
        });
      }
      if (locOk && cfg.rewards.freeDrink.enabled) drink = !!(await L.availableReward(Number(p.playerId), 'free_drink'));
    } catch (e: any) { notes.push(`الولاء: ${e?.message}`); }
  }

  const pick = chooseOption(options, drink);
  return { activity: { id: a.id, name: a.name, date: a.date, base, isTest: a.isTest }, people, channel: p.channel, options, best: pick.best, choose: pick.choose, notes: [...notes, ...pick.notes] };
}

/** قواعد الاختيار المعتمدة — دالّةٌ نقيّة يختبرها test-pricing.ts بلا قاعدة */
export function chooseOption(options: QuoteOption[], drink = false): { best: string; choose: boolean; notes: string[] } {
  const notes: string[] = [];
  // ق١١: لا جمع — الأفضل للعميل؛ عند التساوي ما لا يستهلك مكافأة (تبقى له)
  const ok = options.filter((o) => o.ok);
  ok.sort((x, y) => x.total - y.total || Number(!!x.consumesReward) - Number(!!y.consumesReward));
  const best = ok[0]?.key || 'base';
  // ق١٥: مكافأة ولاء وعرضٌ ينطبقان معاً ⟵ يرى العميل الخيارين ويختار
  const offerOk = ok.some((o) => o.kind === 'early' || o.kind === 'group');
  const loyaltyOk = ok.some((o) => o.kind === 'loyalty_visit');
  const choose = offerOk && loyaltyOk;
  if (choose) notes.push('عرضٌ ومكافأة ولاء ينطبقان معاً — يختار العميل، والمكافأة لا تُستهلك إن لم يخترها (ق١٥)');
  // ق١٤: مكافأة واحدة في الليلة — المشروب لا يُطبَّق آليّاً ليلة عرض
  if (drink) notes.push(offerOk ? 'عنده مشروب ولاء — ليلة عرض: لا يُطبَّق آليّاً، يطلبه إن شاء (ق١٤)' : 'عنده مشروب ولاء على فاتورة المقهى');
  return { best, choose, notes };
}
