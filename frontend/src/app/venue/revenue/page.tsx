'use client';

// ══════════════════════════════════════════════════════
// 💰 الحساب — /venue/revenue · «الجمرة» · إعادة البناء 2026-10-30 (الهاتف أوّلاً)
// ثلاثة أسئلةٍ يسألها صاحب المكان آخر الليل، بهذا الترتيب:
//   ١. كم حصّلت؟ وكم منه لي وكم للنادي؟  (الفترة: الليلة · الأسبوع · الشهر)
//   ٢. كم باقٍ عليّ للنادي؟               (تراكميّ منذ أوّل ليلة — لا يتقيّد بالفترة)
//   ٣. ماذا لم يُحصَّل بعد؟                (دَينٌ على اللاعبين — نقرةٌ تفتح التحصيل)
// 🔢 القاعدة المقفلة: الطلبات + فروق الخيارات + تكملة الحدّ الأدنى + الماء للمكان؛
//    للنادي الدخوليّة وحدها (ناقص خصم مشروب الولاء). الأرقام كلّها من الخادم —
//    الصفحة تعرض ولا تحسب حصّةً بنفسها، كي لا تختلف الشاشة عن التسوية.
// 🎨 لون الطرف في المربّع بجانب الاسم، والرقم بلون النصّ (قاعدة الرسوم).
// تُركَّب أيضاً على /admin/venues/revenue (isHQ) — useVenueApi يضيف locationId.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useVenue } from '../context';
import { EM, TX, SHARE, f2, pPlayers, pInvoices, plural, nightLabel, hhmm } from '../ember';
import { Icon, Sheet, useToast, Toast, Segmented, Btn, Swatch, Amount, Skeleton, PageHead, useVenueApi } from '../ui';
import { refreshBadges } from '../VenueShell';
import { MoneySplit } from './MoneySplit';
import { EventAccount } from './EventAccount';

type Period = 'night' | 'week' | 'month' | 'event';
type HStatus = 'pending' | 'confirmed' | 'rejected';

interface Handover {
  id: number; amount: number; toLabel: string; note: string; status: HStatus;
  declaredAt: string; declaredByName: string; resolvedAt: string | null; resolvedByName: string; byAdmin: boolean;
}
interface Night {
  activityId: number; activityName: string; activityDate: string;
  collected: number; venue: number; club: number; orders: number; topup: number; water: number;
  fees: number; loyalty: number; feeCount: number; paidCount: number; freeCount: number; due: number; dueCount: number;
}
interface MoneyData {
  period: Period; range: { from: string; to: string };
  totals: { collected: number; venue: number; club: number; orders: number; topup: number; water: number; fees: number; loyalty: number; feeCount: number; paidCount: number; freeCount: number };
  nights: Night[];
  account: { collected: number; confirmed: number; pending: number; remainingForVenue: number; heldForAdmin: number; handovers: Handover[] };
  uncollected: { activityId: number; activityName: string; activityDate: string; collected: number; due: number; total: number; paidCount: number; dueCount: number }[];
}

const PERIODS: { value: Period; label: string }[] = [
  { value: 'night', label: 'الليلة' },
  { value: 'week', label: 'الأسبوع' },
  { value: 'month', label: 'الشهر' },
  { value: 'event', label: 'فعاليّة' },
];
const PERIOD_NAME: Record<Period, string> = { night: 'الليلة', week: 'هذا الأسبوع', month: 'هذا الشهر', event: '' };
const RECIPIENTS = ['المدير', 'المحاسب', 'مندوب النادي'];

/** المبلغ كما يكتبه الموظّف: أرقامٌ عربيّة أو لاتينيّة، وفاصلةٌ عربيّة أو نقطة */
const toNum = (s: string) => parseFloat(String(s || '').trim()
  .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  .replace(/[٫,]/g, '.'));

/** تاريخ الفعاليّة بنفس أساس nightLabel (حقول UTC) — كي يطابق «الليلة» ما يُكتب بجانبها */
const nightKey = (d: string) => new Date(d).toISOString().slice(0, 10);
const ammanToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Amman' });

/** «الخميس 29/10 · 23:40» بتوقيت عمّان — وقت التصريح لحظةٌ حقيقيّة لا تاريخ فعاليّة */
function whenAmman(d: string | null | undefined): string {
  if (!d) return '';
  const t = new Date(d);
  const day = t.toLocaleDateString('ar-JO', { weekday: 'long', timeZone: 'Asia/Amman' });
  const dm = t.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Amman' });
  return `${day} ${dm} · ${hhmm(t)}`;
}

const pFree = (n: number) => plural(n, 'حجز مجّانيّ واحد', 'حجزان مجّانيّان', 'حجوزات مجّانيّة', 'حجزاً مجّانيّاً');

/** حبّة حالة التسليم: الشكل (أيقونة) يحمل المعنى مع اللون، لا اللون وحده */
function HandoverChip({ status }: { status: HStatus }) {
  const s = status === 'confirmed'
    ? { icon: 'check' as const, text: 'مؤكَّد', color: TX.good }
    : status === 'rejected'
      ? { icon: 'x' as const, text: 'مرفوض', color: TX.bad }
      : { icon: 'clock' as const, text: 'بانتظار التأكيد', color: TX.amber };
  return (
    <span className="flex items-center gap-1.5 font-bold whitespace-nowrap text-[12.5px]" style={{ color: s.color }}>
      <Icon name={s.icon} size={14} stroke={2.2} />{s.text}
    </span>
  );
}

export default function VenueRevenuePage() {
  const { can, isHQ, locationId } = useVenue();
  const { get, send } = useVenueApi();
  const router = useRouter();
  const pathname = usePathname() || '';
  const { toast, show, hide } = useToast();

  const [period, setPeriod] = useState<Period>('night');
  const [data, setData] = useState<MoneyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [allHandovers, setAllHandovers] = useState(false);
  // «فعاليّة»: ليلةٌ يختارها صاحب المكان — أو التي نقرها في «ليلة بليلة»
  const [pickId, setPickId] = useState<number | null>(null);

  // ورقة التسليم
  const [sheet, setSheet] = useState(false);
  const [amount, setAmount] = useState('');
  const [toLabel, setToLabel] = useState(RECIPIENTS[0]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [sheetErr, setSheetErr] = useState('');

  const allowed = can('finance.view');
  // 🔴 get عبر مرجع: السياق يُبنى من جديد مع كلّ رسمٍ للغلاف (ساعة الترويسة كلّ ٣٠ث)
  //    فتتبدّل هويّة get معه — لو كانت في تبعيّات التحميل لأعادت الجلب وومضت الصفحة كلّ ٣٠ث.
  const getRef = useRef(get);
  getRef.current = get;

  const load = useCallback(async (quiet = false) => {
    if (!allowed || period === 'event') { setLoading(false); return; }
    if (!quiet) setLoading(true);
    const r = await getRef.current(`/api/venue/money?period=${period}`).catch(() => null);
    if (r?.ok) { setData(r.data as MoneyData); setErr(''); }
    else if (!quiet) setErr(r?.data?.error || 'تعذّر تحميل الحساب — تحقّق من الاتصال');
    setLoading(false);
  }, [period, allowed]);

  // تحميلٌ عند تغيّر الفترة أو المكان (للإدارة)، وتحديثٌ هادئ كلّ دقيقة والشاشة ظاهرة
  useEffect(() => { setData(null); load(); }, [load, locationId]);
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(true); }, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') load(true); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  const remaining = data?.account.remainingForVenue ?? 0;
  const hNum = toNum(amount);
  const hErr = !(hNum > 0) ? 'اكتب مبلغاً أكبر من صفر'
    : hNum > remaining + 0.004 ? `أكبر من الباقي عليك (${f2(remaining)})` : '';

  const openSheet = () => { setAmount(f2(remaining)); setToLabel(RECIPIENTS[0]); setNote(''); setSheetErr(''); setSheet(true); };
  const closeSheet = useCallback(() => { if (!saving) setSheet(false); }, [saving]);

  const record = async () => {
    if (hErr || saving) return;
    setSaving(true); setSheetErr('');
    const r = await send('/api/venue/handovers', 'POST', { amount: Math.round(hNum * 100) / 100, toLabel, note: note.trim() }).catch(() => null);
    setSaving(false);
    if (!r?.ok) { setSheetErr(r?.data?.error || 'تعذّر تسجيل التسليم — حاول مرّةً أخرى'); return; }
    setSheet(false);
    show(`سُجّل تسليم ${f2(hNum)} د.أ لـ${toLabel} · بانتظار تأكيد الإدارة`);
    refreshBadges();
    load(true);
  };

  // التحصيل من هنا يفتح صفحة التحصيل نفسها — تحت /admin للإدارة كي لا تخرج من لوحتها
  const openNight = (activityId: number) => {
    const base = pathname.startsWith('/admin') ? '/admin/venues/invoices' : '/venue/invoices';
    const loc = isHQ && locationId ? `&locationId=${locationId}` : '';
    router.push(`${base}?activityId=${activityId}${loc}`);
  };

  const today = useMemo(() => ammanToday(), [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🖤 تحت لوحة الإدارة الرماديّة تحمل الصفحة أرضيّتها — الهويّة نفسها في الواجهتين.
  //    خصائص غلافٍ ثابت لا مكوّنٌ يُعرَّف داخل الدالّة: مكوّنٌ جديد كلّ رسمٍ يعيد
  //    تركيب ما تحته فيفقد حقل المبلغ تركيزه مع كلّ حرف.
  const wrap = isHQ
    ? { className: 'vc-root rounded-3xl p-4', style: { background: EM.ink, color: EM.text } as React.CSSProperties }
    : { className: '', style: undefined };

  if (!allowed) {
    return (
      <div dir="rtl" className={wrap.className} style={wrap.style}>
        <div className="text-center py-16 text-[14px] leading-relaxed" style={{ color: TX.dim }}>
          <Icon name="wallet" size={28} color={TX.dim} style={{ display: 'block', margin: '0 auto 10px' }} />
          ليس لدى حسابك صلاحيّة الحساب — اطلبها من الإدارة
        </div>
      </div>
    );
  }

  const t = data?.totals;
  const acc = data?.account;
  const collected = t?.collected ?? 0;
  const handed = (acc?.confirmed ?? 0) + (acc?.pending ?? 0);
  const handovers = acc?.handovers ?? [];
  const shownHandovers = allHandovers ? handovers : handovers.slice(0, 5);
  const nightName = period === 'night' && data?.nights[0] ? nightLabel(data.nights[0].activityDate) : '';

  return (
    <div dir="rtl" className={wrap.className} style={wrap.style}>
      <div className="flex flex-col gap-[18px]">
        <PageHead title="الحساب" sub="كم حصّلت، وكم لك، وكم للنادي" />
        {/* أربع حبّات لا تتّسع بجانب العنوان على الهاتف — صفٌّ مستقلّ بعرض الشاشة */}
        <Segmented label="الفترة" value={period} onChange={p => { if (p !== 'event') setPickId(null); setPeriod(p); }} items={PERIODS} />

        {err && (
          <div role="alert" className="flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 text-[14px]"
            style={{ background: 'rgba(224,73,43,.10)', border: '1px solid rgba(224,73,43,.35)', color: TX.bad }}>
            <Icon name="warn" size={18} />
            <span className="flex-1">{err}</span>
            <Btn kind="ghost" h={44} onClick={() => load()}><Icon name="refresh" size={16} />أعد المحاولة</Btn>
          </div>
        )}

        {period === 'event' ? (
          <EventAccount key={locationId ?? 'own'} pickId={pickId} onOpenNight={openNight} />
        ) : loading && !data ? (
          <>
            <Skeleton h={150} n={1} />
            <Skeleton h={190} n={1} />
            <Skeleton h={64} n={2} />
          </>
        ) : data && t && acc ? (
          <>
            {/* ── ١. الملخّص ── */}
            <section aria-label="ملخّص التحصيل" className="vc-enter">
              <div className="text-[13.5px] font-bold" style={{ color: TX.sub }}>
                حصّلتَ {PERIOD_NAME[period]}
                {nightName && <span className="font-medium" style={{ color: TX.dim }}> · {nightName}</span>}
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="vc-num font-semibold" style={{ fontSize: 42, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{f2(collected)}</span>
                <span className="text-[15px]" style={{ color: TX.dim }}>د.أ</span>
              </div>

              <MoneySplit t={t} />
            </section>

            {/* ── ٢. حساب النادي — تراكميّ منذ أوّل ليلة ── */}
            <section aria-label="حساب النادي" className="rounded-[18px] p-4" style={{ background: EM.card, border: `1px solid ${EM.line2}` }}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[15.5px] font-extrabold flex items-center gap-2"><Swatch color={SHARE.club} />حساب النادي معك</h2>
                <div className="text-[12px]" style={{ color: TX.dim }}>منذ أوّل ليلة</div>
              </div>
              <div className="flex flex-col gap-2 mt-3 text-[14px]">
                <div className="flex justify-between gap-3"><span style={{ color: TX.sub }}>دخوليّات حصّلتها</span><span className="vc-num">{f2(acc.collected)}</span></div>
                <div className="flex justify-between gap-3"><span style={{ color: TX.sub }}>سلّمتها للنادي</span><span className="vc-num">− {f2(handed)}</span></div>
                <div style={{ height: 1, background: EM.line2 }} />
                <div className="flex justify-between items-baseline gap-3">
                  <span className="text-[15px] font-extrabold">باقٍ عليك للنادي</span>
                  <Amount value={f2(remaining)} size={26} />
                </div>
              </div>

              {shownHandovers.map(h => (
                <div key={h.id} className="vc-enter flex justify-between items-center gap-2 mt-2.5 px-3 py-2.5 rounded-xl text-[13px]" style={{ background: EM.ink2 }}>
                  <div className="min-w-0">
                    <div>سلّمتَ <span className="vc-num">{f2(h.amount)}</span> لـ{h.toLabel || 'النادي'}</div>
                    <div className="text-[12px] mt-0.5" style={{ color: TX.dim }}>
                      {whenAmman(h.declaredAt)}{h.note ? ` · ${h.note}` : ''}
                    </div>
                  </div>
                  <HandoverChip status={h.status} />
                </div>
              ))}
              {handovers.length > 5 && (
                <button type="button" onClick={() => setAllHandovers(v => !v)} className="vc-press w-full h-11 mt-1 text-[13.5px] font-bold" style={{ color: TX.amberHi }}>
                  {allHandovers ? 'أخفِ السجلّ القديم' : `اعرض كلّ التسليمات (${handovers.length})`}
                </button>
              )}

              <Btn kind="club" full h={48} className="mt-3" style={{ fontSize: 15 }} disabled={remaining <= 0} onClick={openSheet}>
                سجّل تسليماً للنادي
              </Btn>
            </section>

            {/* ── ٣. لم يُحصَّل بعد ── */}
            <section aria-label="لم يُحصَّل">
              <h2 className="text-[15.5px] font-extrabold">لم يُحصَّل بعد</h2>
              <div className="text-[12.5px] mt-0.5" style={{ color: TX.dim }}>فواتير مفتوحة وطلبات بلا فاتورة — كلّها دَينٌ على اللاعبين</div>
              {data.uncollected.length === 0 ? (
                <div className="mt-2.5 p-3.5 rounded-[14px] text-[14px] font-bold flex items-center gap-2" style={{ background: 'rgba(37,192,138,.08)', color: TX.good }}>
                  <Icon name="check" size={18} stroke={2.4} />حُصّل كلّ شيء — لا ديون على اللاعبين
                </div>
              ) : data.uncollected.map(u => (
                <button key={u.activityId} type="button" onClick={() => openNight(u.activityId)}
                  aria-label={`افتح تحصيل ${nightLabel(u.activityDate)} — ${f2(u.due)} د.أ`}
                  className="vc-press flex items-center gap-2.5 w-full mt-2.5 px-3 py-2.5 rounded-[14px] text-right"
                  style={{ minHeight: 58, border: `1px solid ${EM.line2}`, background: EM.ink2, color: 'inherit' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14.5px] font-extrabold">{nightKey(u.activityDate) === today ? 'الليلة · ' : ''}{nightLabel(u.activityDate)}</div>
                    <div className="text-[12.5px]" style={{ color: TX.dim }}>{pPlayers(u.dueCount)}</div>
                  </div>
                  <Amount value={f2(u.due)} size={17} unit={false} />
                  <Icon name="chevron" size={16} color={TX.dim} />
                </button>
              ))}
            </section>

            {/* ── ليلة بليلة ── */}
            <section aria-label="ليلة بليلة">
              <h2 className="text-[15.5px] font-extrabold">ليلة بليلة</h2>
              {data.nights.length === 0 ? (
                <div className="text-[13.5px] mt-2" style={{ color: TX.dim }}>لا ليالٍ في هذه الفترة</div>
              ) : (
                <>
                  <div className="grid gap-1.5 mt-3 text-[12px] font-bold" style={{ gridTemplateColumns: '1.5fr 1fr 1fr 1fr', color: TX.dim }}>
                    <span>الليلة</span>
                    <span className="text-left">حُصّل</span>
                    <span className="flex items-center justify-end gap-1"><Swatch color={SHARE.venue} size={8} />لك</span>
                    <span className="flex items-center justify-end gap-1"><Swatch color={SHARE.club} size={8} />للنادي</span>
                  </div>
                  {data.nights.map(n => (
                    <button key={n.activityId} type="button" onClick={() => { setPickId(n.activityId); setPeriod('event'); window.scrollTo({ top: 0 }); }}
                      aria-label={`اعرض حساب ${nightLabel(n.activityDate)} كاملاً`}
                      className="vc-press block w-full text-right py-2.5 mt-2" style={{ borderTop: `1px solid ${EM.line}`, color: 'inherit' }}>
                      <div className="grid gap-1.5 text-[14px] items-baseline" style={{ gridTemplateColumns: '1.5fr 1fr 1fr 1fr' }}>
                        <span className="font-extrabold">{nightLabel(n.activityDate)}</span>
                        <span className="vc-num text-left">{f2(n.collected)}</span>
                        <span className="vc-num text-left">{f2(n.venue)}</span>
                        <span className="vc-num text-left">{f2(n.club)}</span>
                      </div>
                      <div className="text-[12px] mt-[3px]" style={{ color: TX.dim }}>
                        {pInvoices(n.paidCount)} · {n.feeCount} دخوليّة{n.freeCount > 0 ? ` · ${pFree(n.freeCount)}` : ''}
                        {n.due > 0 && <span className="font-bold" style={{ color: TX.amber }}> · لم يُحصَّل <span className="vc-num">{f2(n.due)}</span></span>}
                        <span className="font-bold" style={{ color: TX.amberHi }}> · التفاصيل</span>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </section>

            <p className="text-[12.5px] leading-[1.7]" style={{ color: TX.dim }}>
              الطلبات وفروق الخيارات والحدّ الأدنى والماء كلّها لك. للنادي الدخوليّة فقط. الحجز المجّانيّ لا دخوليّة عليه، والدخوليّة التي يدفعها اللاعب للنادي مباشرةً لا تمرّ بصندوقك.
            </p>
          </>
        ) : null}
      </div>

      {/* ── ورقة التسليم ── */}
      <Sheet open={sheet} onClose={closeSheet} title="تسليم للنادي"
        subtitle={<>باقٍ عليك <span className="vc-num">{f2(remaining)}</span> د.أ — تؤكّد الإدارة الاستلام</>}>
        <label className="block mt-3.5 text-[13px] font-bold" style={{ color: TX.sub }}>
          المبلغ المسلَّم (د.أ)
          <input type="text" inputMode="decimal" autoComplete="off" value={amount} onChange={e => setAmount(e.target.value)}
            aria-invalid={!!hErr} aria-describedby={hErr ? 'ho-err' : undefined}
            className="vc-num block w-full mt-1.5 px-3.5 rounded-[14px] text-right"
            style={{ height: 56, fontSize: 24, background: '#0F1311', color: EM.text, border: `1px solid ${hErr ? EM.hot : EM.line2}` }} />
        </label>
        {hErr && <div id="ho-err" role="alert" className="mt-1.5 text-[13px] font-bold" style={{ color: TX.bad }}>{hErr}</div>}

        <label className="block mt-3 text-[13px] font-bold" style={{ color: TX.sub }}>
          لمن سلّمت
          <select value={toLabel} onChange={e => setToLabel(e.target.value)} className="block w-full mt-1.5 px-3 rounded-xl"
            style={{ height: 48, fontSize: 16, background: '#0F1311', color: EM.text, border: `1px solid ${EM.line2}` }}>
            {RECIPIENTS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>

        <label className="block mt-3 text-[13px] font-bold" style={{ color: TX.sub }}>
          ملاحظة <span className="font-medium" style={{ color: TX.dim }}>(اختياريّة)</span>
          <input type="text" value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder="مثلاً: سلّمته نقداً آخر الليل"
            className="block w-full mt-1.5 px-3 rounded-xl"
            style={{ height: 48, fontSize: 16, background: '#0F1311', color: EM.text, border: `1px solid ${EM.line2}` }} />
        </label>

        {sheetErr && <div role="alert" className="mt-2.5 text-[13px] font-bold" style={{ color: TX.bad }}>{sheetErr}</div>}

        <button type="button" onClick={record} disabled={!!hErr || saving}
          className="vc-press w-full mt-4 rounded-[14px] font-extrabold text-[16px] flex items-center justify-center gap-2"
          style={{ height: 54, background: SHARE.club, color: '#06131E' }}>
          {saving ? 'جارٍ التسجيل…' : 'سجّل التسليم'}
        </button>
      </Sheet>

      <Toast toast={toast} onHide={hide} />
    </div>
  );
}
