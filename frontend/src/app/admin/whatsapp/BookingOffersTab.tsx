'use client';

// ══════════════════════════════════════════════════════
// 🎟️ عروض الحجز الجماعيّ («جيب صحابك») — ٤+١، ٣ بسعر ١، ١+١…
// ══════════════════════════════════════════════════════
// العرضُ يعيش بين نافذة حجزٍ وفعاليّاتٍ بعينها. البوت يعلنه مرّةً لكلّ محادثة،
// ويشرحه بأرقامه، ويثبّته فقط بعد أن يرسل العميل اسم ورقم كلّ صديق. الحسمُ عند
// الباب على الحضور الفعليّ (من صفحة الفعاليّة). هذه الشاشة: إنشاءٌ وتحكّمٌ
// وإبلاغُ الحاجزين مسبقاً ممّن نافذة محادثتهم مفتوحة — لا أحد غيرهم.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Gift, Lock, Megaphone, Pause, Pencil, Play, Plus, Ticket, Trash2, X } from 'lucide-react';
import { swalConfirm, swalAlert } from '@/lib/swal';
import EarlyPriceSection from './EarlyPriceSection';
import { Badge, Banner, Card, Chip, Field, PageHead, Setting, Skel, Tile, Toggle, type Tone } from './wa-ui';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;

const n = (x: any) => Number(x || 0).toLocaleString('ar-JO');
const H = 3600e3;
const JO = 3 * H;   // الأردن UTC+3 طوال العام (بلا توقيتٍ صيفيّ منذ 2022) — نفس الخادم

/** قيمةُ datetime-local تُقرأ توقيتَ عمّان أيّاً كانت منطقة المتصفّح */
const toInput = (v: any) => { const t = new Date(v).getTime(); return isNaN(t) ? '' : new Date(t + JO).toISOString().slice(0, 16); };
const fromInput = (s: string) => new Date(s + ':00+03:00').toISOString();
function fmtDT(v: any) {
  if (!v) return '—';
  return new Date(v).toLocaleString('ar-JO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' });
}
const ORD = ['', 'الأوّل', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
/** نفس ruleText في الخادم — ما يقرؤه العميل حرفيّاً */
function ruleText(N: number, K: number, repeat: boolean) {
  let base: string;
  if (N - K === 1) base = `${K === 1 ? 'واحد بيدفع' : `${K} بيدفعوا`} و${ORD[N] || 'الأخير'} مجاناً`;
  else if (K === 1) base = `${N} أشخاص بسعر شخص واحد`;
  else base = `${N} أشخاص بسعر ${K}`;
  return base + (repeat ? ` — ويتكرّر مع كلّ ${N}` : ' — مرّة واحدة لكلّ حجز');
}
const freeFor = (N: number, K: number, repeat: boolean, size: number) => size < N ? 0 : (repeat ? Math.floor(size / N) : 1) * (N - K);

const STATE: Record<string, { label: string; tone?: Tone }> = {
  live: { label: 'فعّال', tone: 'ok' },
  scheduled: { label: 'مجدول', tone: 'info' },
  paused: { label: 'موقوف', tone: 'warn' },
  draft: { label: 'مسودة' },
  ended: { label: 'انتهت نافذته' },
};
const KIND: Record<string, { label: string; tone?: Tone; hint: string }> = {
  send: { label: 'نافذته مفتوحة', tone: 'ok', hint: 'تصله الرسالة الآن' },
  closed: { label: 'نافذته مغلقة', tone: 'warn', hint: 'لا رسالة (سياسة ٢٤ ساعة) — تواصلٌ يدويّ إن أردت' },
  in_group: { label: 'في مجموعة', tone: 'info', hint: 'أخذ العرض أو دخل مجموعة' },
  optout: { label: 'أوقف الرسائل', tone: 'danger', hint: 'طلب «إيقاف» — لا يُراسَل' },
  past: { label: 'فعاليّة مضت', hint: '' },
};

/** رقم/مبلغ بالأرقام — يُعزل اتّجاهه */
const L = (x: ReactNode) => <span className="ltr">{x}</span>;
const sub14 = { margin: 0, font: '400 14px/22px var(--font-sans)', color: 'var(--ink-2)' } as const;

const PRESETS = [
  { label: '١+١', N: 2, K: 1 },
  { label: '٣ بسعر ١', N: 3, K: 1 },
  { label: '٤+١', N: 5, K: 4 },
  { label: '٣+١', N: 4, K: 3 },
];

function blankForm() {
  const now = Date.now();
  return {
    id: null as number | null, name: '', groupSize: 5, payFor: 4, repeat: true,
    bookFrom: toInput(now), bookUntil: toInput(now + 3 * 24 * H), leadHours: 3,
    activityIds: [] as number[], maxGroups: 0, perCustomer: 1, priorityHours: 24,
    announce: true, announceText: '', notifyExisting: true,
  };
}

// ══════════════════════════════════════════════════════

export default function BookingOffersTab({ apiFetch }: { apiFetch: Fetcher }) {
  const [data, setData] = useState<{ offers: any[]; upcoming: any[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<ReturnType<typeof blankForm> | null>(null);
  const [notify, setNotify] = useState<any>(null);   // معاينة الإبلاغ المفتوحة
  const [openMsg, setOpenMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const d = await apiFetch('/api/booking-offers'); setData({ offers: d.offers || [], upcoming: d.upcoming || [] }); setErr(null); }
    catch (e: any) { setErr(e.message); }
  }, [apiFetch]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const p = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30000);
    return () => clearInterval(p);
  }, [load]);

  const patch = (k: string, v: any) => setForm(f => f ? { ...f, [k]: v } : f);

  // فعاليّاتُ الاختيار: القادمة + ما في العرض المعدَّل وإن مضى
  const actChoices = useMemo(() => {
    const m = new Map<number, any>();
    for (const a of data?.upcoming || []) m.set(a.id, a);
    if (form?.id) for (const a of (data?.offers.find(o => o.id === form.id)?.activities || [])) if (!m.has(a.id)) m.set(a.id, a);
    return Array.from(m.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data, form?.id]);

  const example = useMemo(() => {
    if (!form) return null;
    const sel = actChoices.filter(a => form.activityIds.includes(a.id));
    const price = sel.length ? Number(sel[0].price || 0) : 0;
    const size = form.groupSize;
    const free = freeFor(form.groupSize, form.payFor, form.repeat, size);
    const size2 = form.groupSize * 2;
    const free2 = freeFor(form.groupSize, form.payFor, form.repeat, size2);
    return { price, size, free, size2, free2 };
  }, [form, actChoices]);

  async function save(status?: 'draft' | 'live') {
    if (!form) return;
    const body = {
      ...form, bookFrom: fromInput(form.bookFrom), bookUntil: fromInput(form.bookUntil),
      ...(form.id ? {} : { status: status || 'draft' }),
    };
    if (status === 'live' && !form.id && !(await swalConfirm(`تفعيل «${form.name}» الآن؟\nسيبدأ البوت بإعلانه لكلّ من يحادثه (مرّةً لكلّ محادثة) وشرحه عند السؤال عن السعر.`, { confirmText: 'فعّله', icon: 'question' }))) return;
    setBusy(true);
    try {
      await apiFetch(form.id ? `/api/booking-offers/${form.id}` : '/api/booking-offers', { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      setForm(null); await load();
      swalAlert(form.id ? '✅ حُفظ التعديل — المجموعات القائمة تبقى على الشروط التي وُعدت بها' : status === 'live' ? '✅ العرض فعّال الآن' : '✅ حُفظ مسودة');
    } catch (e: any) { swalAlert(`❌ ${e.message}`); }
    setBusy(false);
  }

  async function setStatus(o: any, status: 'live' | 'paused' | 'draft') {
    const msg = status === 'live' ? `تفعيل «${o.name}»؟ يبدأ البوت بإعلانه وشرحه.`
      : status === 'paused' ? `إيقاف «${o.name}»؟ يتوقّف الإعلان ولا تُقبل مجموعاتٌ جديدة — ومن أخذه قبل الإيقاف يبقى له.`
        : `إرجاع «${o.name}» مسودة؟`;
    if (!(await swalConfirm(msg, { icon: 'question' }))) return;
    setBusy(true);
    try { await apiFetch(`/api/booking-offers/${o.id}/status`, { method: 'POST', body: JSON.stringify({ status }) }); await load(); }
    catch (e: any) { swalAlert(`❌ ${e.message}`); }
    setBusy(false);
  }

  async function remove(o: any) {
    if (!(await swalConfirm(`حذف «${o.name}»؟`, { danger: true, confirmText: 'احذف' }))) return;
    setBusy(true);
    try { await apiFetch(`/api/booking-offers/${o.id}`, { method: 'DELETE' }); await load(); }
    catch (e: any) { swalAlert(`❌ ${e.message}`); }
    setBusy(false);
  }

  async function openNotify(o: any) {
    setBusy(true);
    try { const d = await apiFetch(`/api/booking-offers/${o.id}/notify`); setNotify(d); }
    catch (e: any) { swalAlert(`❌ ${e.message}`); }
    setBusy(false);
  }
  async function sendNotify() {
    const sendRows = (notify?.rows || []).filter((r: any) => r.kind === 'send');
    if (!sendRows.length) return;
    const first = !notify.offer.notifiedAt;
    if (!(await swalConfirm(
      `إرسال تفاصيل «${notify.offer.name}» لـ${sendRows.length} حاجزاً نافذتهم مفتوحة؟\n`
      + (first ? `تبدأ الآن أولويّتهم ${Math.round((new Date(notify.offer.priorityEnd).getTime() - new Date(notify.offer.priorityStart).getTime()) / H)} ساعة.` : 'أولويّتهم بدأت مع الإبلاغ الأوّل ولا تتجدّد.')
      + '\nمن نافذته مغلقة لا تصله رسالة.', { confirmText: 'أرسل', icon: 'question' }))) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/api/booking-offers/${notify.offer.id}/notify`, { method: 'POST' });
      swalAlert(`✅ أُرسل للطابور ${r.queued} — بفاصلٍ بين الرسائل`);
      setNotify(null); await load();
    } catch (e: any) { swalAlert(`❌ ${e.message}`); }
    setBusy(false);
  }

  function edit(o: any) {
    setNotify(null);
    setForm({
      id: o.id, name: o.name, groupSize: o.groupSize, payFor: o.payFor, repeat: !!o.repeat,
      bookFrom: toInput(o.bookFrom), bookUntil: toInput(o.bookUntil), leadHours: o.leadHours,
      activityIds: (o.activityIds || []).map(Number), maxGroups: o.maxGroups, perCustomer: o.perCustomer,
      priorityHours: o.priorityHours, announce: !!o.announce, announceText: o.announceText || '', notifyExisting: !!o.notifyExisting,
    });
  }

  if (err && !data) return <Banner tone="danger" icon={<AlertTriangle />}>{err}</Banner>;
  if (!data) return <Skel h={120} />;

  const counts = (notify?.rows || []).reduce((m: any, r: any) => { m[r.kind] = (m[r.kind] || 0) + 1; return m; }, {});

  return (
    <>
      <PageHead title="عروض الحجز" sub="السعر المبكّر عبر الدون، وعروض المجموعات «جيب صحابك»." />

      {/* ═══ سعر الدون المبكّر ═══ */}
      <EarlyPriceSection apiFetch={apiFetch} />

      {/* ═══ الرأس ═══ */}
      <Card
        title={<><Ticket />عروض الحجز الجماعيّ</>}
        aside={!form && (
          <button type="button" className="wa-btn primary" onClick={() => { setNotify(null); setForm(blankForm()); }}><Plus />عرضٌ جديد</button>
        )}
      >
        <p style={{ ...sub14, maxWidth: '80ch' }}>
          «احجز لأصحابك وخذ واحداً ببلاش». البوت يعلن العرض مرّةً لكلّ محادثة ويشرحه بالأرقام، ولا يثبّته إلّا بعد أن يرسل العميل
          <b style={{ color: 'var(--ink)' }}> اسم ورقم كلّ صديق</b> — فيصير لكلّ صديقٍ حجزُه المرتبط بالمجموعة. المجّانيّ يُحسم
          <b style={{ color: 'var(--ink)' }}> عند الباب على الحضور الفعليّ</b> من صفحة الفعاليّة، والحسابات المجّانيّة والزيارات المجّانيّة لا تُكمل العدد.
        </p>
        {data.offers.length === 0 && !form && <p className="muted" style={{ margin: 'var(--space-3) 0 0', fontSize: 14 }}>لا عروض بعد.</p>}
      </Card>

      {/* ═══ النموذج ═══ */}
      {form && (
        <Card
          style={{ borderColor: 'var(--gold)' }}
          title={form.id ? `تعديل «${form.name}»` : 'عرضٌ جديد'}
          aside={<button type="button" className="wa-btn ghost" onClick={() => setForm(null)}><X />إلغاء</button>}
        >
          <div className="stack">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="col-span-2">
                <Field label="اسم العرض" hint="يظهر للعميل حرفيّاً في رسائل البوت" htmlFor="bo-name">
                  <input id="bo-name" className="wa-input" value={form.name} onChange={e => patch('name', e.target.value)} placeholder="مثال: جيب صحابك" />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="نوع العرض">
                  <div className="wa-chips" style={{ flexWrap: 'wrap', minHeight: 'var(--hit)', alignItems: 'center' }}>
                    {PRESETS.map(p => (
                      <Chip key={p.label} on={form.groupSize === p.N && form.payFor === p.K}
                        onClick={() => setForm(f => f ? { ...f, groupSize: p.N, payFor: p.K } : f)}>{p.label}</Chip>
                    ))}
                  </div>
                </Field>
              </div>

              <Field label="حجم المجموعة" hint="كم شخصاً مع صاحب الحجز" htmlFor="bo-n">
                <input id="bo-n" type="number" min={2} max={10} dir="ltr" className="wa-input ltr" value={form.groupSize}
                  onChange={e => { const v = Math.min(10, Math.max(2, parseInt(e.target.value) || 2)); setForm(f => f ? { ...f, groupSize: v, payFor: Math.min(f.payFor, v - 1) } : f); }} />
              </Field>
              <Field label="منهم يدفع" hint="والباقي ببلاش" htmlFor="bo-k">
                <input id="bo-k" type="number" min={1} max={form.groupSize - 1} dir="ltr" className="wa-input ltr" value={form.payFor}
                  onChange={e => patch('payFor', Math.min(form.groupSize - 1, Math.max(1, parseInt(e.target.value) || 1)))} />
              </Field>
              <div className="col-span-2">
                <Setting title={<>يتكرّر مع كلّ {L(form.groupSize)}</>}
                  hint={form.repeat ? <>{L(form.groupSize * 2)} أشخاص ⟵ {L(freeFor(form.groupSize, form.payFor, true, form.groupSize * 2))} ببلاش</> : 'مرّة واحدة لكلّ حجز مهما كبرت المجموعة'}>
                  <Toggle on={form.repeat} onChange={v => patch('repeat', v)} label={`يتكرّر مع كلّ ${form.groupSize}`} />
                </Setting>
              </div>

              <div className="col-span-2">
                <Field label="الحجز يبدأ (عمّان)" htmlFor="bo-from">
                  <input id="bo-from" type="datetime-local" dir="ltr" className="wa-input ltr" value={form.bookFrom} onChange={e => patch('bookFrom', e.target.value)} />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="آخر موعد للحجز (عمّان)" htmlFor="bo-until">
                  <input id="bo-until" type="datetime-local" dir="ltr" className="wa-input ltr" value={form.bookUntil} onChange={e => patch('bookUntil', e.target.value)} />
                </Field>
              </div>
              <Field label="قبل الفعاليّة بـ (ساعات)" hint="لا عرض لحجزٍ أقرب من هذا لموعدها" htmlFor="bo-lead">
                <input id="bo-lead" type="number" min={0} max={168} dir="ltr" className="wa-input ltr" value={form.leadHours} onChange={e => patch('leadHours', Math.max(0, parseInt(e.target.value) || 0))} />
              </Field>
              <Field label="سقف المجموعات" hint="٠ = بلا سقف · حصّةُ الحاجزين مسبقاً محفوظة داخله" htmlFor="bo-cap">
                <input id="bo-cap" type="number" min={0} max={500} dir="ltr" className="wa-input ltr" value={form.maxGroups} onChange={e => patch('maxGroups', Math.max(0, parseInt(e.target.value) || 0))} />
              </Field>
              <Field label="مرّات للعميل الواحد" hint="على كلّ فعاليّات العرض" htmlFor="bo-per">
                <input id="bo-per" type="number" min={1} max={10} dir="ltr" className="wa-input ltr" value={form.perCustomer} onChange={e => patch('perCustomer', Math.max(1, parseInt(e.target.value) || 1))} />
              </Field>
              <Field label="أولويّة الحاجزين مسبقاً (ساعات)" hint="تبدأ مع أوّل إبلاغ — مقاعدهم في السقف محجوزة خلالها" htmlFor="bo-prio">
                <input id="bo-prio" type="number" min={0} max={168} dir="ltr" className="wa-input ltr" value={form.priorityHours} onChange={e => patch('priorityHours', Math.max(0, parseInt(e.target.value) || 0))} />
              </Field>
            </div>

            {/* ── الفعاليّات ── */}
            <Field label={<>الفعاليّات <span className="muted" style={{ fontWeight: 500 }}>(مواقع الاختبار مستبعدة تلقائيّاً)</span></>}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto">
                {actChoices.map(a => {
                  const on = form.activityIds.includes(a.id);
                  return (
                    <button key={a.id} type="button" aria-pressed={on} className="wa-pill" style={{ minHeight: 'var(--hit)', paddingBlock: 6 }}
                      onClick={() => patch('activityIds', on ? form.activityIds.filter(x => x !== a.id) : [...form.activityIds, a.id])}>
                      {on && <Check className="s" />}
                      <span className="grow">
                        <span className="trunc" style={{ display: 'block' }}>{a.name}</span>
                        <span className="trunc" style={{ display: 'block', font: '500 12px/16px var(--font-sans)', opacity: 0.8 }}>{fmtDT(a.date)}{a.location ? ` · ${a.location}` : ''}{a.price ? ` · ${a.price} د.أ` : ''}</span>
                      </span>
                    </button>
                  );
                })}
                {!actChoices.length && <div className="muted" style={{ fontSize: 13 }}>لا فعاليّات قادمة</div>}
              </div>
            </Field>

            {/* ── الإعلان ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Setting title="البوت يعلنه لمن يحادثه"
                  hint="مرّةً واحدة لكلّ محادثة، ملحَقاً بردّه حرفيّاً — لا يُلحق بردٍّ فيه تأكيدُ حجزٍ أو إلغاء، ولا لمن في مدينةٍ أخرى">
                  <Toggle on={form.announce} onChange={v => patch('announce', v)} label="البوت يعلنه لمن يحادثه" />
                </Setting>
                <Setting title="إبلاغ الحاجزين مسبقاً"
                  hint="يظهر زرّ «إبلاغ الحاجزين» — الإرسال بيدك بعد المعاينة، ولمن نافذته مفتوحة فقط">
                  <Toggle on={form.notifyExisting} onChange={v => patch('notifyExisting', v)} label="إبلاغ الحاجزين مسبقاً" />
                </Setting>
              </div>
              <Field label="نصّ إعلانٍ خاصّ (اختياريّ)" hint="فارغ = نصٌّ آليّ من الشروط أعلاه (الأدقّ). الحاجزون مسبقاً يأخذون دائماً صيغتهم بأرقام حجزهم" htmlFor="bo-text">
                <textarea id="bo-text" rows={3} maxLength={900} className="wa-textarea" value={form.announceText} onChange={e => patch('announceText', e.target.value)}
                  placeholder={`🎁 عرض «${form.name || 'الاسم'}»: ${ruleText(form.groupSize, form.payFor, form.repeat)}.`} />
              </Field>
            </div>

            {/* ── ما سيقرؤه العميل ── */}
            {example && (
              <Banner tone="ok" icon={<Gift />}>
                <b>{ruleText(form.groupSize, form.payFor, form.repeat)}</b>
                <span style={{ display: 'block' }}>
                  {L(example.size)} أشخاص ⟵ {L(example.free)} ببلاش{example.price ? <> — يدفعون {L(Math.round((example.size - example.free) * example.price * 100) / 100)} د.أ بدل {L(Math.round(example.size * example.price * 100) / 100)}</> : ''}
                  {form.repeat && <> · {L(example.size2)} ⟵ {L(example.free2)} ببلاش</>}
                  {' · '}{L(example.size - 1)} ⟵ لا عرض (البوت يقترح إضافة واحد)
                </span>
              </Banner>
            )}

            <div className="row" style={{ flexWrap: 'wrap' }}>
              {form.id ? (
                <button type="button" disabled={busy} onClick={() => save()} className="wa-btn primary">حفظ التعديل</button>
              ) : (
                <>
                  <button type="button" disabled={busy} onClick={() => save('live')} className="wa-btn send"><Check />حفظ وتفعيل</button>
                  <button type="button" disabled={busy} onClick={() => save('draft')} className="wa-btn">حفظ مسودة</button>
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ═══ معاينة الإبلاغ ═══ */}
      {notify && (
        <Card
          style={{ borderColor: 'var(--info)' }}
          title={<><Megaphone /><span className="grow">إبلاغ الحاجزين مسبقاً — «{notify.offer.name}»</span></>}
          aside={<button type="button" className="wa-iconbtn" aria-label="إغلاق" onClick={() => setNotify(null)}><X /></button>}
        >
          <div className="stack">
            <p style={sub14}>
              الأولويّة: {notify.offer.notifiedAt ? <>بدأت {fmtDT(notify.offer.priorityStart)} وتنتهي <b style={{ color: 'var(--ink)' }}>{fmtDT(notify.offer.priorityEnd)}</b></> : <>تبدأ مع هذا الإبلاغ</>}.
              {notify.offer.maxGroups > 0 && <> السقف {L(n(notify.offer.maxGroups))} · استُخدم {L(n(notify.used))} · محجوزٌ لهم {L(n(notify.reserved))}.</>}
              {' '}من يستحقّ بعدده الحاليّ يُطلب منه أرقامُ أصحابه لتثبيته.
            </p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {Object.entries(KIND).map(([k, v]) => counts[k] ? <Badge key={k} tone={v.tone} title={v.hint}>{v.label}: {L(n(counts[k]))}</Badge> : null)}
              {!notify.rows.length && <span className="muted" style={{ fontSize: 13 }}>لا حاجزين على فعاليّات العرض</span>}
            </div>
            {notify.rows.length > 0 && (
              <div className="wa-tablewrap">
                <table className="wa-table cards">
                  <thead>
                    <tr><th>الحاجز</th><th>الفعاليّة</th><th>العدد</th><th>الحالة</th><th></th></tr>
                  </thead>
                  <tbody>
                    {notify.rows.map((r: any) => {
                      const key = `${r.activityId}:${r.phone}`;
                      return [
                        <tr key={key}>
                          <td data-l="الحاجز"><span><b>{r.name || '—'}</b><span className="ltr muted" style={{ display: 'block' }}>{r.phone}</span></span></td>
                          <td data-l="الفعاليّة"><span>{r.activityName}<span className="muted" style={{ display: 'block', fontSize: 12 }}>{r.activityWhen}</span></span></td>
                          <td data-l="العدد"><span className="row">{L(r.people)}{r.qualifies && <Badge tone="ok">يستحقّ</Badge>}</span></td>
                          <td data-l="الحالة"><Badge tone={KIND[r.kind]?.tone}>{KIND[r.kind]?.label || r.kind}</Badge></td>
                          <td>
                            {r.message && (
                              <button type="button" className="wa-btn ghost sm" aria-expanded={openMsg === key} onClick={() => setOpenMsg(openMsg === key ? null : key)}>
                                {openMsg === key ? 'إخفاء' : 'الرسالة'}
                              </button>
                            )}
                          </td>
                        </tr>,
                        openMsg === key ? (
                          <tr key={key + ':m'}>
                            <td colSpan={5}>
                              <pre style={{ margin: 0, flex: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: '400 13px/20px var(--font-sans)', color: 'var(--ink-2)', background: 'var(--bg-200)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)' }}>{r.message}</pre>
                            </td>
                          </tr>
                        ) : null,
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button type="button" disabled={busy || !counts.send || notify.offer.state !== 'live'} onClick={sendNotify} className="wa-btn send" style={{ whiteSpace: 'normal' }}>
                <Megaphone />أرسل لـ{L(n(counts.send || 0))} نافذتهم مفتوحة
              </button>
              {notify.offer.state !== 'live' && <Badge tone="warn">فعّل العرض أوّلاً — لا إبلاغ بعرضٍ غير فعّال</Badge>}
            </div>
            {counts.closed > 0 && (
              <Banner icon={<Lock />}>{L(n(counts.closed))} نافذتهم مغلقة: لا رسالة آليّة (قيد واتساب) — أرقامهم أعلاه للتواصل اليدويّ إن أردت.</Banner>
            )}
          </div>
        </Card>
      )}

      {/* ═══ القائمة ═══ */}
      {data.offers.map(o => {
        const st = STATE[o.state] || STATE.draft;
        const s = o.stats || {};
        return (
          <Card key={o.id} style={o.state === 'live' ? { borderColor: 'var(--ok)' } : undefined}
            title={(
              <span className="row" style={{ flexWrap: 'wrap', minWidth: 0 }}>
                <Ticket /><span>{o.name}</span><Badge tone={st.tone}>{st.label}</Badge>
                {o.announce && o.state === 'live' && <Badge tone="info"><Megaphone />يُعلَن</Badge>}
              </span>
            )}>
            <div className="stack">
              <div className="row" style={{ alignItems: 'flex-start', font: '700 14px/22px var(--font-sans)', color: 'var(--gold)' }}><Gift style={{ marginTop: 2 }} /><span>{o.rule}</span></div>
              <div className="muted" style={{ font: '500 13px/20px var(--font-sans)' }}>
                الحجز {fmtDT(o.bookFrom)} ← {fmtDT(o.bookUntil)} · قبل الفعاليّة بـ{L(n(o.leadHours))} س
                {o.maxGroups > 0 ? <> · سقف {L(n(o.maxGroups))} مجموعة</> : ' · بلا سقف'} · {L(n(o.perCustomer))} للعميل
                {o.priorityHours > 0 && <> · أولويّة {L(n(o.priorityHours))} س</>}
                {o.notifiedAt && ` · أُبلغ ${fmtDT(o.notifiedAt)}`}
              </div>
              {(o.activities || []).length > 0 && (
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  {(o.activities || []).map((a: any) => (
                    <a key={a.id} href={`/admin/activities/${a.id}`} className="wa-who" style={a.past ? { opacity: 0.5 } : undefined}>
                      {a.name} · {fmtDT(a.date)}
                    </a>
                  ))}
                </div>
              )}
              <div className="wa-grid3">
                <Tile k="مجموعات" v={n(s.groups)} />
                <Tile k="أصحاب مرتبطون" v={n(s.linked)} h={s.pending ? <>{L(`+${n(s.pending)}`)} بانتظار</> : undefined} />
                <Tile tone="gold" k="مجّانيّ مُحسوم" v={n(s.given)} h={<>/ {L(n(s.promised))} موعود</>} />
              </div>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                {o.status !== 'live' && o.state !== 'ended' && (
                  <button type="button" disabled={busy} onClick={() => setStatus(o, 'live')} className="wa-btn send"><Play />تفعيل</button>
                )}
                {o.status === 'live' && (
                  <button type="button" disabled={busy} onClick={() => setStatus(o, 'paused')} className="wa-btn"><Pause />إيقاف</button>
                )}
                {o.notifyExisting && o.state !== 'ended' && (
                  <button type="button" disabled={busy} onClick={() => openNotify(o)} className="wa-btn"><Megaphone />إبلاغ الحاجزين</button>
                )}
                <button type="button" disabled={busy} onClick={() => edit(o)} className="wa-btn"><Pencil />تعديل</button>
                {!s.groups && (
                  <button type="button" disabled={busy} onClick={() => remove(o)} className="wa-btn danger"><Trash2 />حذف</button>
                )}
                {s.foregone > 0 && <span className="muted" style={{ fontSize: 13 }}>قيمة المجّانيّ المحسوم: {L(n(s.foregone))} د.أ</span>}
              </div>
            </div>
          </Card>
        );
      })}
    </>
  );
}
