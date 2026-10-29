'use client';

// ══════════════════════════════════════════════════════
// 🤝 دخل الأماكن والتسويات — /admin/venue-settlements (2026-10-30)
// سؤال الإدارة: ما حصّلته الأماكن، وما للنادي عندها، وما سُلِّم.
// • «بانتظار تأكيدك» أوّلاً: المكان صرّح بتسليمٍ من كونسوله، والمال لا يُعدّ
//   مستلَماً حتّى تؤكّده الإدارة — فالتصريح المعلّق هو أوّل ما يُرى.
// • «بيده للنادي» تراكميّ منذ أوّل ليلة (لا يتقيّد بالفترة): دَينٌ لا يسقط
//   بمرور الشهر. بقيّة الأرقام تتبع الفترة المختارة.
// • مكانٌ لا يحصّل في النظام يُقال عنه ذلك صراحةً بدل أصفارٍ توهم أنّه لم يبع.
// 🎨 هويّة «الجمرة» الداكنة داخل اللوحة الرماديّة، والتخطيط بـcontainer queries
//    لا media queries: الصفحة تتبع العرض المتاح فعلاً (الشريط الجانبيّ يأكل منه).
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EM, TX, SHARE, f2, plural, pInvoices, nightLabel, hhmm } from '../../venue/ember';
import { Icon, useToast, Toast, Segmented, Swatch, Skeleton } from '../../venue/ui';

type HStatus = 'pending' | 'confirmed' | 'rejected';
interface Handover {
  id: number; amount: number; toLabel: string; note: string; status: HStatus;
  declaredAt: string; declaredByName: string; resolvedAt: string | null; resolvedByName: string; byAdmin: boolean;
}
interface NightRow {
  activityId: number; activityName: string; activityDate: string;
  collected: number; venue: number; club: number; feeCount: number; paidCount: number; freeCount: number;
}
interface VenueRow {
  locationId: number; name: string; nights: number; box: number; venue: number; clubVia: number;
  direct: number; directCount: number; due: number; dueNoInvoice: number;
  ordersRecorded: number; ordersNights: number; usesInvoicing: boolean; lastInvoiceAt: string | null;
  held: number; received: number; pendingTotal: number; handovers: Handover[]; nightsDetail: NightRow[];
}
interface Data {
  range: { from: string; to: string };
  totals: { clubVia: number; direct: number; held: number; venue: number; due: number; dueNoInvoice: number };
  venues: VenueRow[];
  pending: (Handover & { locationId: number; venueName: string })[];
}

type Range = '30' | 'month' | 'week';
const RANGES: { value: Range; label: string }[] = [
  { value: '30', label: 'آخر 30 يوماً' },
  { value: 'month', label: 'هذا الشهر' },
  { value: 'week', label: 'هذا الأسبوع' },
];

// ── تواريخ عمّان — الحدود تُحسب بتقويم النادي لا بتقويم جهاز المدير ──
const ammanToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Amman' });
const addDays = (ymd: string, d: number) => { const t = new Date(ymd + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
/** نفس حدود الخادم (periodRange): الأسبوع من السبت، والشهر من أوّله */
function rangeOf(r: Range): { from: string; to: string } {
  const to = ammanToday();
  if (r === 'week') {
    const dow = new Date(to + 'T00:00:00Z').getUTCDay(); // 0=أحد … 6=سبت
    return { from: addDays(to, -((dow + 1) % 7)), to };
  }
  if (r === 'month') return { from: to.slice(0, 8) + '01', to };
  return { from: addDays(to, -29), to };
}
const dm = (ymd: string) => ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '';

/** «الخميس 29/10 · 23:40» — وقت التصريح لحظةٌ حقيقيّة، فتُعرض بتوقيت عمّان */
function whenAmman(d: string | null | undefined): string {
  if (!d) return '';
  const t = new Date(d);
  const day = t.toLocaleDateString('ar-JO', { weekday: 'long', timeZone: 'Asia/Amman' });
  const md = t.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Amman' });
  return `${day} ${md} · ${hhmm(t)}`;
}
const dateAmman = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Amman' }) : '';

const pNights = (n: number) => n === 0 ? 'لا ليالٍ' : plural(n, 'ليلة واحدة', 'ليلتان', 'ليالٍ', 'ليلة');
const pFree = (n: number) => plural(n, 'حجز مجّانيّ واحد', 'حجزان مجّانيّان', 'حجوزات مجّانيّة', 'حجزاً مجّانيّاً');
const pBookings = (n: number) => n === 0 ? 'لا حجوزات' : plural(n, 'حجز واحد', 'حجزان', 'حجوزات', 'حجزاً');
const pHandovers = (n: number) => plural(n, 'تسليمٌ واحد', 'تسليمان', 'تسليمات', 'تسليماً');

/** المبلغ كما يُكتب: أرقامٌ عربيّة أو لاتينيّة، وفاصلةٌ عربيّة أو نقطة */
const toNum = (s: string) => parseFloat(String(s || '').trim()
  .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  .replace(/[٫,]/g, '.'));

// ── الجلب: توكن الموظّف كما في بقيّة صفحات الإدارة (لا سياق مكانٍ هنا) ──
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
async function api(path: string, method = 'GET', body?: unknown) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const r = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok && d?.success !== false, status: r.status, data: d };
}

// ── الأنماط: container queries — العرض المتاح للّوحة لا عرض الشاشة ──
const CSS = `
.vs-root{container-type:inline-size;container-name:vsadm}
.vs-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.vs-venues{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
.vs-detail{display:flex;flex-direction:column;gap:14px}
.vs-side{display:flex;flex-direction:column;gap:14px}
.vs-h1{font-size:24px}
.vs-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.vs-row4{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:6px}
@container vsadm (min-width:760px){
  .vs-kpis{grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
  .vs-venues{grid-template-columns:repeat(3,minmax(0,1fr))}
  .vs-h1{font-size:30px}
}
@container vsadm (min-width:1040px){
  .vs-detail{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);align-items:start}
}
`;

const card = { background: EM.card, border: `1px solid ${EM.line}` } as const;
const amberLine = 'rgba(240,197,140,.40)';

function HandoverChip({ status }: { status: HStatus }) {
  const s = status === 'confirmed'
    ? { icon: 'check' as const, text: 'مؤكَّد', color: TX.good }
    : status === 'rejected'
      ? { icon: 'x' as const, text: 'مرفوض', color: TX.bad }
      : { icon: 'clock' as const, text: 'بانتظار تأكيدك', color: TX.amber };
  return (
    <span className="flex items-center gap-1.5 font-bold whitespace-nowrap text-[12.5px]" style={{ color: s.color }}>
      <Icon name={s.icon} size={14} stroke={2.2} />{s.text}
    </span>
  );
}

function Num({ v, size = 14, bold }: { v: string; size?: number; bold?: boolean }) {
  return <span className="vc-num" style={{ fontSize: size, fontWeight: bold ? 600 : undefined }}>{v}</span>;
}

export default function VenueSettlementsPage() {
  const { toast, show, hide } = useToast();
  const [range, setRange] = useState<Range>('30');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);      // تصريحٌ قيد الحسم
  const [amount, setAmount] = useState<string | null>(null);  // null = المقترح (الباقي عنده)
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const { from, to } = rangeOf(range);
    const r = await api(`/api/admin/venue-settlements?from=${from}&to=${to}`).catch(() => null);
    if (r?.ok) { setData(r.data as Data); setErr(''); }
    else if (!quiet) setErr(r?.data?.error || 'تعذّر تحميل التسويات — تحقّق من الاتصال');
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(true); }, 60_000);
    return () => clearInterval(iv);
  }, [load]);

  // الاختيار الافتراضيّ: المكان الذي بيده أكثر للنادي — هو ما يُسأل عنه أوّلاً
  useEffect(() => {
    if (!data?.venues.length) return;
    if (sel != null && data.venues.some(v => v.locationId === sel)) return;
    const best = [...data.venues].sort((a, b) => (b.held - a.held) || (Number(b.usesInvoicing) - Number(a.usesInvoicing)) || (b.nights - a.nights))[0];
    setSel(best.locationId);
  }, [data, sel]);

  const v = useMemo(() => data?.venues.find(x => x.locationId === sel) || null, [data, sel]);
  useEffect(() => { setAmount(null); setNote(''); }, [sel]);

  const decide = async (id: number, action: 'confirm' | 'reject', label: string) => {
    if (busy) return;
    setBusy(id);
    const r = await api(`/api/admin/venue-settlements/handovers/${id}/${action}`, 'POST').catch(() => null);
    setBusy(null);
    if (r?.ok) show(action === 'confirm' ? `أُكّد استلام ${label}` : `سُجّل أنّ ${label} لم يصل`);
    else if (r?.status === 409) show('هذا التسليم حُسم مسبقاً', { tone: 'bad' });
    else show(r?.data?.error || 'تعذّر الحفظ — حاول مرّةً أخرى', { tone: 'bad' });
    load(true);
  };

  const held = v?.held ?? 0;
  const amt = amount == null ? held : toNum(amount);
  const amtErr = amount == null ? '' : !(amt > 0) ? 'اكتب مبلغاً أكبر من صفر' : amt > held + 0.004 ? `أكبر من الباقي عنده (${f2(held)})` : '';

  const receive = async () => {
    if (!v || saving || amtErr || !(amt > 0) || amt > held + 0.004) return;
    setSaving(true);
    const r = await api('/api/admin/venue-settlements/handovers', 'POST', { locationId: v.locationId, amount: Math.round(amt * 100) / 100, note: note.trim() }).catch(() => null);
    setSaving(false);
    if (!r?.ok) { show(r?.data?.error || 'تعذّر تسجيل الاستلام', { tone: 'bad' }); return; }
    show(`سُجّل استلام ${f2(amt)} د.أ من ${v.name}`);
    setAmount(null); setNote('');
    load(true);
  };

  const T = data?.totals;
  const rg = data?.range || rangeOf(range);

  return (
    <div dir="rtl" className="vc-root vs-root rounded-3xl" style={{ background: EM.ink, color: EM.text, minHeight: '70vh' }}>
      <style>{CSS}</style>
      <div className="mx-auto flex flex-col gap-[18px]" style={{ maxWidth: 1200, padding: '20px 16px 40px' }}>

        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="vs-h1 font-extrabold" style={{ lineHeight: 1.25 }}>دخل الأماكن والتسويات</h1>
            <div className="text-[13.5px] mt-1" style={{ color: TX.dim }}>ما حصّلته الأماكن، وما للنادي عندها، وما سُلِّم</div>
          </div>
          <div className="flex flex-col gap-1.5 w-full sm:w-auto">
            <Segmented label="الفترة" size="sm" value={range} onChange={setRange} items={RANGES} />
            <div className="text-[12.5px] flex items-center gap-1.5" style={{ color: TX.dim }}>
              <Icon name="calendar" size={14} />
              <span className="vc-num">{dm(rg.from)} — {dm(rg.to)}</span>
            </div>
          </div>
        </header>

        {err && (
          <div role="alert" className="flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 text-[14px]"
            style={{ background: 'rgba(224,73,43,.10)', border: '1px solid rgba(224,73,43,.35)', color: TX.bad }}>
            <Icon name="warn" size={18} />
            <span className="flex-1">{err}</span>
            <button type="button" onClick={() => load()} className="vc-press h-11 px-3.5 rounded-xl font-bold flex items-center gap-1.5"
              style={{ border: `1px solid ${EM.line2}`, color: '#C9D4CD' }}>
              <Icon name="refresh" size={16} />أعد المحاولة
            </button>
          </div>
        )}

        {loading && !data ? (
          <>
            <Skeleton h={96} n={1} />
            <div className="vs-kpis">{[0, 1, 2, 3].map(i => <div key={i} className="animate-pulse rounded-2xl" style={{ ...card, height: 104 }} />)}</div>
            <Skeleton h={120} n={2} />
          </>
        ) : data && T ? (
          <>
            {/* ── بانتظار تأكيدك ── */}
            {data.pending.length > 0 && (
              <section aria-label="تسليمات بانتظار تأكيدك" className="vc-enter rounded-2xl p-3.5"
                style={{ background: 'rgba(240,197,140,.08)', border: `1px solid ${amberLine}` }}>
                <div className="text-[15px] font-extrabold flex items-center gap-2"><Icon name="clock" size={18} color={TX.amber} />بانتظار تأكيدك</div>
                {data.pending.map(p => {
                  const label = `${f2(p.amount)} د.أ من ${p.venueName}`;
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-2.5 mt-2.5">
                      <div className="text-[14px] leading-relaxed" style={{ flex: '1 1 180px' }}>
                        <b>{p.venueName}</b> يقول إنّه سلّم <Num v={f2(p.amount)} bold /> د.أ لـ{p.toLabel || 'النادي'}
                        <div className="text-[12.5px]" style={{ color: TX.sub }}>
                          {whenAmman(p.declaredAt)}{p.declaredByName ? ` · ${p.declaredByName}` : ''}{p.note ? ` · ${p.note}` : ''}
                        </div>
                      </div>
                      <div className="flex gap-2" style={{ flex: '1 1 200px' }}>
                        <button type="button" disabled={busy === p.id} onClick={() => decide(p.id, 'confirm', label)}
                          aria-label={`استلمت ${label}`}
                          className="vc-press flex-1 rounded-xl font-extrabold text-[15px]" style={{ height: 48, background: TX.amber, color: '#241806' }}>
                          استلمته
                        </button>
                        <button type="button" disabled={busy === p.id} onClick={() => decide(p.id, 'reject', label)}
                          aria-label={`لم يصلني ${label}`}
                          className="vc-press flex-1 rounded-xl font-bold text-[14px]" style={{ height: 48, border: `1px solid ${EM.line2}`, color: '#C9D4CD' }}>
                          لم يصلني
                        </button>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            {/* ── الملخّص ── */}
            <section className="vs-kpis" aria-label="الملخّص">
              <div className="p-3.5 rounded-2xl" style={card}>
                <div className="text-[13px] font-extrabold flex items-center gap-1.5" style={{ color: '#C9D4CD' }}><Swatch color={SHARE.club} size={8} />دخل النادي</div>
                <div className="mt-1.5"><Num v={f2(T.clubVia + T.direct)} size={24} bold /></div>
                <div className="text-[12.5px] mt-0.5 leading-normal" style={{ color: TX.dim }}><Num v={f2(T.clubVia)} size={12.5} /> عبر الأماكن · <Num v={f2(T.direct)} size={12.5} /> مباشرةً</div>
              </div>
              <div className="p-3.5 rounded-2xl" style={{ background: EM.card, border: `1px solid ${amberLine}` }}>
                <div className="text-[13px] font-extrabold" style={{ color: TX.amber }}>للنادي بيد الأماكن</div>
                <div className="mt-1.5"><Num v={f2(T.held)} size={24} bold /></div>
                <div className="text-[12.5px] mt-0.5 leading-normal" style={{ color: TX.dim }}>حُصّلت ولم تُسلَّم بعد · منذ أوّل ليلة</div>
              </div>
              <div className="p-3.5 rounded-2xl" style={card}>
                <div className="text-[13px] font-extrabold flex items-center gap-1.5" style={{ color: '#C9D4CD' }}><Swatch color={SHARE.venue} size={8} />للأماكن</div>
                <div className="mt-1.5"><Num v={f2(T.venue)} size={24} bold /></div>
                <div className="text-[12.5px] mt-0.5 leading-normal" style={{ color: TX.dim }}>طلبات + حدّ أدنى + ماء من فواتير محصّلة</div>
              </div>
              <div className="p-3.5 rounded-2xl" style={card}>
                <div className="text-[13px] font-extrabold" style={{ color: '#C9D4CD' }}>لم يُحصَّل</div>
                <div className="mt-1.5"><Num v={f2(T.due)} size={24} bold /></div>
                <div className="text-[12.5px] mt-0.5 leading-normal" style={{ color: TX.dim }}>
                  {T.dueNoInvoice > 0 ? <>منها <Num v={f2(T.dueNoInvoice)} size={12.5} /> بلا فاتورة</> : 'دَينٌ على اللاعبين'}
                </div>
              </div>
            </section>

            {/* ── الأماكن ── */}
            <section aria-label="الأماكن">
              <h2 className="text-[16px] font-extrabold mb-2.5">الأماكن</h2>
              {data.venues.length === 0 ? (
                <div className="text-[14px]" style={{ color: TX.dim }}>لا أماكن بعد</div>
              ) : (
                <div className="vs-venues" role="tablist" aria-label="اختر مكاناً">
                  {data.venues.map(x => {
                    const on = x.locationId === sel;
                    const idle = x.nights === 0;
                    const tag = x.usesInvoicing
                      ? { text: `يحصّل بالفواتير · ${pNights(x.nights)}`, color: TX.good }
                      : x.ordersRecorded > 0
                        ? { text: `التحصيل خارج النظام · ${pNights(x.nights)}`, color: TX.amber }
                        : idle ? { text: 'لا ليالٍ في الفترة', color: TX.dim } : { text: `${pNights(x.nights)} · بلا طلبات`, color: TX.dim };
                    // خافتٌ إن لم يكن له ما يُسأل عنه — مكانٌ بيده مالٌ للنادي لا يُطفأ ولو بلا ليالٍ
                    const dim = idle && x.held <= 0;
                    return (
                      <button key={x.locationId} type="button" role="tab" aria-selected={on} onClick={() => setSel(x.locationId)}
                        className="vc-press text-right p-3.5 rounded-2xl"
                        style={{ background: on ? '#1E2621' : EM.card, border: `1px solid ${on ? SHARE.venue : EM.line}`, color: EM.text, opacity: dim ? 0.65 : 1 }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[16px] font-extrabold truncate">{x.name}</div>
                            <div className="text-[12.5px] font-bold mt-0.5" style={{ color: tag.color }}>{tag.text}</div>
                          </div>
                          <div className="text-left shrink-0">
                            <div className="text-[12px]" style={{ color: TX.dim }}>بيده للنادي</div>
                            <Num v={x.held !== 0 ? f2(x.held) : idle ? '—' : '0.00'} size={20} bold />
                          </div>
                        </div>
                        <div className="grid gap-1.5 mt-3 pt-2.5" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', borderTop: `1px solid ${EM.line}` }}>
                          <div><div className="text-[11.5px]" style={{ color: TX.dim }}>في صندوقه</div><Num v={x.usesInvoicing ? f2(x.box) : '—'} /></div>
                          <div><div className="text-[11.5px]" style={{ color: TX.dim }}>للنادي مباشرةً</div><Num v={idle ? '—' : f2(x.direct)} /></div>
                          <div><div className="text-[11.5px]" style={{ color: TX.dim }}>لم يُحصَّل</div><Num v={x.usesInvoicing || x.due > 0 ? f2(x.due) : '—'} /></div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── تفصيل المكان المختار ── */}
            {v && <VenueDetail key={v.locationId} v={v} pending={data.pending.filter(p => p.locationId === v.locationId)}
              amount={amount == null ? f2(held) : amount} amtErr={amtErr} onAmount={setAmount}
              note={note} onNote={setNote} saving={saving} onReceive={receive} />}

            <p className="text-[12.5px] leading-[1.8]" style={{ color: TX.dim }}>
              الطلبات وفروق الخيارات والحدّ الأدنى والماء للمكان. للنادي الدخوليّة فقط (ناقص خصم مشروب الولاء).
              «بيده للنادي» دخوليّاتٌ حصّلها المكان في فواتيره منذ أوّل ليلة ولم تُؤكَّد بعد — لا تتقيّد بالفترة، وتصريحات المكان المعلّقة لا تُنقصها حتّى تؤكّدها.
              «للنادي مباشرةً» دخوليّاتٌ دفعها اللاعبون للنادي فلم تمرّ بصندوق المكان.
            </p>
          </>
        ) : null}
      </div>
      <Toast toast={toast} onHide={hide} />
    </div>
  );
}

// ══════════════════════════════════════════════════════
// تفصيل مكان: ليلة بليلة (أو سبب غيابها) · التسوية · ما يحتاج انتباهك
// ══════════════════════════════════════════════════════
function VenueDetail({ v, pending, amount, amtErr, onAmount, note, onNote, saving, onReceive }: {
  v: VenueRow; pending: Handover[]; amount: string; amtErr: string; onAmount: (s: string) => void;
  note: string; onNote: (s: string) => void; saving: boolean; onReceive: () => void;
}) {
  const showSettle = v.usesInvoicing || v.held !== 0 || v.handovers.length > 0;
  const tot = v.nightsDetail.reduce((a, n) => ({ c: a.c + n.collected, v: a.v + n.venue, k: a.k + n.club, f: a.f + n.feeCount }), { c: 0, v: 0, k: 0, f: 0 });

  // ما يحتاج انتباهك — كلّ بندٍ فعلٌ ينتظر أحداً
  const attention: { text: React.ReactNode; tone: 'bad' | 'warn' | 'info' }[] = [];
  if (v.due > 0) attention.push({
    tone: 'bad',
    text: <>لم يُحصَّل <Num v={f2(v.due)} size={13.5} bold /> د.أ{v.dueNoInvoice > 0 ? <> — منها <Num v={f2(v.dueNoInvoice)} size={13.5} bold /> طلباتٌ بلا فاتورة</> : ''}</>,
  });
  if (pending.length > 0) attention.push({
    tone: 'warn',
    text: <>{pHandovers(pending.length)} بانتظار تأكيدك (<Num v={f2(v.pendingTotal)} size={13.5} bold /> د.أ) — في أعلى الصفحة</>,
  });
  if (v.held < 0) attention.push({
    tone: 'bad',
    text: <>استلمنا منه أكثر ممّا حصّل من دخوليّات بـ<Num v={f2(-v.held)} size={13.5} bold /> د.أ — راجع السجلّ</>,
  });
  if (!v.usesInvoicing && v.ordersRecorded > 0) attention.push({
    tone: 'warn',
    text: <>طلباتٌ بـ<Num v={f2(v.ordersRecorded)} size={13.5} bold /> د.أ مسجّلة بلا تحصيلٍ في النظام — لا نعرف ما قُبض منها</>,
  });
  const toneStyle = (t: 'bad' | 'warn' | 'info') => t === 'bad'
    ? { background: 'rgba(240,129,99,.08)', border: '1px solid rgba(240,129,99,.28)' }
    : t === 'warn' ? { background: 'rgba(240,197,140,.08)', border: '1px solid rgba(240,197,140,.30)' }
      : { background: EM.ink2, border: `1px solid ${EM.line}` };

  const main = v.usesInvoicing ? (
    <section aria-label={`${v.name} ليلة بليلة`} className="vc-enter rounded-2xl p-4" style={card}>
      <h2 className="text-[16px] font-extrabold">{v.name} · ليلة بليلة</h2>
      <div className="vs-row4 mt-3 text-[12px] font-extrabold" style={{ color: TX.dim }}>
        <span>الليلة</span>
        <span className="text-left">حُصّل</span>
        <span className="flex items-center justify-end gap-1"><Swatch color={SHARE.venue} size={8} />للمكان</span>
        <span className="flex items-center justify-end gap-1"><Swatch color={SHARE.club} size={8} />للنادي</span>
      </div>
      {v.nightsDetail.map(n => (
        <div key={n.activityId} className="py-[11px] mt-2" style={{ borderTop: `1px solid ${EM.line}` }}>
          <div className="vs-row4 text-[14px] items-baseline">
            <span className="font-extrabold">{nightLabel(n.activityDate)}</span>
            <span className="vc-num text-left">{f2(n.collected)}</span>
            <span className="vc-num text-left">{f2(n.venue)}</span>
            <span className="vc-num text-left">{f2(n.club)}</span>
          </div>
          <div className="text-[12.5px] mt-1" style={{ color: TX.dim }}>
            {n.paidCount > 0 ? pInvoices(n.paidCount) : 'لا فواتير محصّلة'}
            {n.feeCount > 0 ? ` · ${n.feeCount} دخوليّة` : ' · بلا دخوليّة في الفواتير'}
            {n.freeCount > 0 ? ` · ${pFree(n.freeCount)}` : ''}
          </div>
        </div>
      ))}
      <div className="vs-row4 pt-[11px] mt-2 text-[14.5px] font-extrabold" style={{ borderTop: '1px solid #3A4640' }}>
        <span>المجموع</span>
        <span className="vc-num text-left">{f2(tot.c)}</span>
        <span className="vc-num text-left">{f2(tot.v)}</span>
        <span className="vc-num text-left">{f2(tot.k)}</span>
      </div>
      <p className="mt-3.5 text-[13px] leading-[1.8]" style={{ color: TX.sub }}>
        <Num v={f2(v.box)} size={13} /> = للمكان <Num v={f2(v.venue)} size={13} /> + للنادي <Num v={f2(v.clubVia)} size={13} />
        {tot.f > 0 && <> (<Num v={String(tot.f)} size={13} /> دخوليّة)</>}. من فواتير محصّلة فعلاً.
      </p>
    </section>
  ) : v.nights > 0 ? (
    <section aria-label={v.name} className="vc-enter rounded-2xl p-4 flex flex-col gap-3" style={card}>
      <h2 className="text-[16px] font-extrabold">{v.name}</h2>
      {v.ordersRecorded > 0 ? (
        <div className="px-3.5 py-3 rounded-xl text-[14px] leading-[1.7]" style={{ background: 'rgba(240,197,140,.08)', border: '1px solid rgba(240,197,140,.30)' }}>
          المكان لا يستخدم التحصيل في النظام: {v.lastInvoiceAt ? <>آخر فاتورة صدرت <Num v={dateAmman(v.lastInvoiceAt)} /></> : 'لم تصدر فواتير'}.
          الطلبات تُسجَّل (<Num v={f2(v.ordersRecorded)} /> د.أ في {pNights(v.ordersNights)}) لكن لا نعرف ما حُصّل منها.
        </div>
      ) : (
        <div className="text-[14px]" style={{ color: TX.sub }}>{pNights(v.nights)} في الفترة بلا طلباتٍ ولا فواتير.</div>
      )}
      <div className="vs-tiles">
        <div className="p-3.5 rounded-xl" style={{ background: EM.ink2 }}>
          <div className="text-[12.5px]" style={{ color: TX.dim }}>دخوليّة للنادي مباشرةً</div>
          <div className="mt-1"><Num v={f2(v.direct)} size={20} bold /></div>
          <div className="text-[12.5px]" style={{ color: TX.dim }}>{pBookings(v.directCount)}</div>
        </div>
        <div className="p-3.5 rounded-xl" style={{ background: EM.ink2 }}>
          <div className="text-[12.5px]" style={{ color: TX.dim }}>للنادي بيد المكان</div>
          <div className="mt-1"><Num v={f2(v.held)} size={20} bold /></div>
        </div>
      </div>
    </section>
  ) : (
    <section aria-label={v.name} className="vc-enter rounded-2xl p-4 text-[14px] leading-[1.7]" style={{ ...card, color: TX.sub }}>
      {v.name} · لا ليالٍ في هذه الفترة.
      {v.held > 0 && <> لكن بيده للنادي <Num v={f2(v.held)} /> د.أ من ليالٍ سابقة.</>}
    </section>
  );

  return (
    <div className="vs-detail">
      {main}
      <div className="vs-side">
        {showSettle && (
          <section aria-label={`تسوية ${v.name}`} className="vc-enter rounded-2xl p-4" style={{ background: EM.card, border: `1px solid ${v.held > 0 ? amberLine : EM.line}` }}>
            <h2 className="text-[16px] font-extrabold">تسوية {v.name}</h2>
            <div className="flex flex-col gap-2 mt-3 text-[14.5px]">
              <div className="flex justify-between gap-3"><span style={{ color: TX.sub }}>دخوليّات حصّلها</span><Num v={f2(v.held + v.received)} size={14.5} /></div>
              <div className="flex justify-between gap-3"><span style={{ color: TX.sub }}>استلمناها منه</span><Num v={`− ${f2(v.received)}`} size={14.5} /></div>
              <div style={{ height: 1, background: EM.line2 }} />
              <div className="flex justify-between items-baseline gap-3">
                <span className="font-extrabold">باقٍ عنده للنادي</span>
                <span className="inline-flex items-baseline gap-1"><Num v={f2(v.held)} size={26} bold /><span className="text-[13px]" style={{ color: TX.dim }}>د.أ</span></span>
              </div>
              {v.pendingTotal > 0 && (
                <div className="text-[12.5px]" style={{ color: TX.amber }}>منها <Num v={f2(v.pendingTotal)} size={12.5} /> صرّح بتسليمها وتنتظر تأكيدك</div>
              )}
            </div>

            {v.held > 0 && (
              <>
                <label className="block mt-3.5 text-[13px] font-bold" style={{ color: TX.sub }}>
                  مبلغ استلمته منه الآن (د.أ)
                  <input type="text" inputMode="decimal" autoComplete="off" value={amount} onChange={e => onAmount(e.target.value)}
                    aria-invalid={!!amtErr} aria-describedby={amtErr ? `rcv-err-${v.locationId}` : undefined}
                    className="vc-num block w-full mt-1.5 px-3.5 rounded-xl text-right"
                    style={{ height: 52, fontSize: 22, background: '#0F1311', color: EM.text, border: `1px solid ${amtErr ? EM.hot : EM.line2}` }} />
                </label>
                {amtErr && <div id={`rcv-err-${v.locationId}`} role="alert" className="mt-1.5 text-[13px] font-bold" style={{ color: TX.bad }}>{amtErr}</div>}
                <label className="block mt-2.5 text-[13px] font-bold" style={{ color: TX.sub }}>
                  ملاحظة <span className="font-medium" style={{ color: TX.dim }}>(اختياريّة)</span>
                  <input type="text" value={note} maxLength={300} onChange={e => onNote(e.target.value)} placeholder="مثلاً: استلمتها نقداً من المدير"
                    className="block w-full mt-1.5 px-3 rounded-xl"
                    style={{ height: 48, fontSize: 16, background: '#0F1311', color: EM.text, border: `1px solid ${EM.line2}` }} />
                </label>
                <button type="button" onClick={onReceive} disabled={!!amtErr || saving}
                  className="vc-press w-full mt-3 rounded-xl font-extrabold text-[15px]"
                  style={{ height: 50, background: TX.amber, color: '#241806' }}>
                  {saving ? 'جارٍ التسجيل…' : 'سجّل الاستلام'}
                </button>
              </>
            )}

            {v.handovers.length === 0 ? (
              <div className="mt-2.5 text-[13px]" style={{ color: TX.dim }}>لا تسليمات مسجّلة بعد.</div>
            ) : v.handovers.map(h => (
              <div key={h.id} className="vc-enter flex justify-between items-center gap-2 mt-2.5 px-3 py-2.5 rounded-[10px] text-[13.5px]" style={{ background: EM.ink2 }}>
                <div className="min-w-0">
                  <div>
                    {h.status === 'rejected' ? 'صرّح بـ' : h.status === 'pending' ? 'يقول إنّه سلّم ' : 'استُلم '}
                    <Num v={f2(h.amount)} size={13.5} /> · {h.byAdmin ? `استلام مباشر${h.toLabel ? ` (${h.toLabel})` : ''}` : `تصريح المكان لـ${h.toLabel || 'النادي'}`}
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: TX.dim }}>
                    {whenAmman(h.declaredAt)}
                    {h.resolvedByName && h.status !== 'pending' && !h.byAdmin ? ` · حسمه ${h.resolvedByName}` : ''}
                    {h.note ? ` · ${h.note}` : ''}
                  </div>
                </div>
                <HandoverChip status={h.status} />
              </div>
            ))}
          </section>
        )}

        <section aria-label="يحتاج انتباهك" className="vc-enter rounded-2xl p-4" style={card}>
          <h2 className="text-[16px] font-extrabold">يحتاج انتباهك</h2>
          {attention.length === 0 ? (
            <div className="mt-3 text-[13.5px] flex items-center gap-2" style={{ color: TX.good }}>
              <Icon name="check" size={16} stroke={2.4} />لا شيء معلّق عند {v.name}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 mt-3 text-[13.5px] leading-relaxed">
              {attention.map((a, i) => <div key={i} className="px-3 py-2.5 rounded-xl" style={toneStyle(a.tone)}>{a.text}</div>)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
