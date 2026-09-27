'use client';

// ══════════════════════════════════════════════════════
// 🎟️ عروض الحجز الجماعيّ («جيب صحابك») — ٤+١، ٣ بسعر ١، ١+١…
// ══════════════════════════════════════════════════════
// العرضُ يعيش بين نافذة حجزٍ وفعاليّاتٍ بعينها. البوت يعلنه مرّةً لكلّ محادثة،
// ويشرحه بأرقامه، ويثبّته فقط بعد أن يرسل العميل اسم ورقم كلّ صديق. الحسمُ عند
// الباب على الحضور الفعليّ (من صفحة الفعاليّة). هذه الشاشة: إنشاءٌ وتحكّمٌ
// وإبلاغُ الحاجزين مسبقاً ممّن نافذة محادثتهم مفتوحة — لا أحد غيرهم.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { swalConfirm, swalAlert } from '@/lib/swal';

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

const STATE: Record<string, { label: string; cls: string }> = {
  live: { label: '🟢 فعّال', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  scheduled: { label: '🕒 مجدول', cls: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
  paused: { label: '⏸️ موقوف', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  draft: { label: '📝 مسودة', cls: 'bg-gray-700/40 text-gray-300 border-gray-600' },
  ended: { label: '✅ انتهت نافذته', cls: 'bg-gray-800 text-gray-500 border-gray-700' },
};
const KIND: Record<string, { label: string; cls: string; hint: string }> = {
  send: { label: '💬 نافذته مفتوحة', cls: 'text-emerald-300', hint: 'تصله الرسالة الآن' },
  closed: { label: '🔒 نافذته مغلقة', cls: 'text-amber-300', hint: 'لا رسالة (سياسة ٢٤ ساعة) — تواصلٌ يدويّ إن أردت' },
  in_group: { label: '👥 في مجموعة', cls: 'text-sky-300', hint: 'أخذ العرض أو دخل مجموعة' },
  optout: { label: '🚫 أوقف الرسائل', cls: 'text-rose-300', hint: 'طلب «إيقاف» — لا يُراسَل' },
  past: { label: '⌛ فعاليّة مضت', cls: 'text-gray-500', hint: '' },
};

function Field({ label, hint, children }: { label: string; hint?: string; children: any }) {
  return (
    <div className="min-w-0">
      <label className="text-[11px] text-gray-400 font-bold block mb-1">{label}</label>
      {children}
      {hint && <div className="text-[10px] text-gray-600 mt-0.5 leading-snug">{hint}</div>}
    </div>
  );
}
const inputCls = 'w-full bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500';
function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-start gap-2 text-right w-full">
      <span className={`mt-0.5 w-9 h-5 rounded-full shrink-0 transition-colors ${on ? 'bg-emerald-500/80' : 'bg-gray-700'} relative`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'right-0.5' : 'right-4'}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-gray-200">{label}</span>
        {hint && <span className="block text-[10px] text-gray-600 leading-snug">{hint}</span>}
      </span>
    </button>
  );
}

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

  if (err && !data) return <div className="text-xs text-rose-300 p-3">{err}</div>;
  if (!data) return <div className="text-xs text-gray-500 p-3">…</div>;

  const counts = (notify?.rows || []).reduce((m: any, r: any) => { m[r.kind] = (m[r.kind] || 0) + 1; return m; }, {});

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      {/* ═══ الرأس ═══ */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white">🎟️ عروض الحجز الجماعيّ</h3>
            <p className="text-[11px] text-gray-500 mt-1 leading-relaxed max-w-2xl">
              «احجز لأصحابك وخذ واحداً ببلاش». البوت يعلن العرض مرّةً لكلّ محادثة ويشرحه بالأرقام، ولا يثبّته إلّا بعد أن يرسل العميل
              <b className="text-gray-300"> اسم ورقم كلّ صديق</b> — فيصير لكلّ صديقٍ حجزُه المرتبط بالمجموعة. المجّانيّ يُحسم
              <b className="text-gray-300"> عند الباب على الحضور الفعليّ</b> من صفحة الفعاليّة، والحسابات المجّانيّة والزيارات المجّانيّة لا تُكمل العدد.
            </p>
          </div>
          {!form && (
            <button onClick={() => { setNotify(null); setForm(blankForm()); }}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400 shrink-0">＋ عرضٌ جديد</button>
          )}
        </div>
      </section>

      {/* ═══ النموذج ═══ */}
      {form && (
        <section className="rounded-2xl border border-amber-500/30 bg-gray-900/70 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-bold text-white">{form.id ? `تعديل «${form.name}»` : 'عرضٌ جديد'}</h3>
            <button onClick={() => setForm(null)} className="text-[11px] text-gray-400 hover:text-white">إلغاء ✕</button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2">
              <Field label="اسم العرض" hint="يظهر للعميل حرفيّاً في رسائل البوت">
                <input id="bo-name" className={inputCls} value={form.name} onChange={e => patch('name', e.target.value)} placeholder="مثال: جيب صحابك" />
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="نوع العرض">
                <div className="flex gap-1.5 flex-wrap">
                  {PRESETS.map(p => (
                    <button key={p.label} type="button" onClick={() => setForm(f => f ? { ...f, groupSize: p.N, payFor: p.K } : f)}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${form.groupSize === p.N && form.payFor === p.K ? 'border-amber-500 text-amber-300 bg-amber-500/10' : 'border-gray-700 text-gray-400 hover:text-white'}`}>{p.label}</button>
                  ))}
                </div>
              </Field>
            </div>

            <Field label="حجم المجموعة" hint="كم شخصاً مع صاحب الحجز">
              <input id="bo-n" type="number" min={2} max={10} className={inputCls} value={form.groupSize}
                onChange={e => { const v = Math.min(10, Math.max(2, parseInt(e.target.value) || 2)); setForm(f => f ? { ...f, groupSize: v, payFor: Math.min(f.payFor, v - 1) } : f); }} />
            </Field>
            <Field label="منهم يدفع" hint="والباقي ببلاش">
              <input id="bo-k" type="number" min={1} max={form.groupSize - 1} className={inputCls} value={form.payFor}
                onChange={e => patch('payFor', Math.min(form.groupSize - 1, Math.max(1, parseInt(e.target.value) || 1)))} />
            </Field>
            <div className="col-span-2 flex items-end">
              <Toggle on={form.repeat} onChange={v => patch('repeat', v)} label={`يتكرّر مع كلّ ${form.groupSize}`}
                hint={form.repeat ? `${form.groupSize * 2} أشخاص ⟵ ${freeFor(form.groupSize, form.payFor, true, form.groupSize * 2)} ببلاش` : `مرّة واحدة لكلّ حجز مهما كبرت المجموعة`} />
            </div>

            <Field label="الحجز يبدأ (عمّان)">
              <input id="bo-from" type="datetime-local" className={inputCls} value={form.bookFrom} onChange={e => patch('bookFrom', e.target.value)} />
            </Field>
            <Field label="آخر موعد للحجز (عمّان)">
              <input id="bo-until" type="datetime-local" className={inputCls} value={form.bookUntil} onChange={e => patch('bookUntil', e.target.value)} />
            </Field>
            <Field label="قبل الفعاليّة بـ (ساعات)" hint="لا عرض لحجزٍ أقرب من هذا لموعدها">
              <input id="bo-lead" type="number" min={0} max={168} className={inputCls} value={form.leadHours} onChange={e => patch('leadHours', Math.max(0, parseInt(e.target.value) || 0))} />
            </Field>
            <Field label="سقف المجموعات" hint="٠ = بلا سقف · حصّةُ الحاجزين مسبقاً محفوظة داخله">
              <input id="bo-cap" type="number" min={0} max={500} className={inputCls} value={form.maxGroups} onChange={e => patch('maxGroups', Math.max(0, parseInt(e.target.value) || 0))} />
            </Field>
            <Field label="مرّات للعميل الواحد" hint="على كلّ فعاليّات العرض">
              <input id="bo-per" type="number" min={1} max={10} className={inputCls} value={form.perCustomer} onChange={e => patch('perCustomer', Math.max(1, parseInt(e.target.value) || 1))} />
            </Field>
            <Field label="أولويّة الحاجزين مسبقاً (ساعات)" hint="تبدأ مع أوّل إبلاغ — مقاعدهم في السقف محجوزة خلالها">
              <input id="bo-prio" type="number" min={0} max={168} className={inputCls} value={form.priorityHours} onChange={e => patch('priorityHours', Math.max(0, parseInt(e.target.value) || 0))} />
            </Field>
          </div>

          {/* ── الفعاليّات ── */}
          <div className="mt-3 pt-3 border-t border-gray-800">
            <div className="text-[11px] text-gray-400 font-bold mb-1.5">الفعاليّات <span className="font-normal text-gray-600">(مواقع الاختبار مستبعدة تلقائيّاً)</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-56 overflow-y-auto">
              {actChoices.map(a => {
                const on = form.activityIds.includes(a.id);
                return (
                  <button key={a.id} type="button"
                    onClick={() => patch('activityIds', on ? form.activityIds.filter(x => x !== a.id) : [...form.activityIds, a.id])}
                    className={`text-right rounded-lg border px-2.5 py-1.5 ${on ? 'border-amber-500/60 bg-amber-500/10' : 'border-gray-800 hover:border-gray-600'}`}>
                    <div className={`text-xs font-bold truncate ${on ? 'text-amber-200' : 'text-gray-200'}`}>{on ? '✓ ' : ''}{a.name}</div>
                    <div className="text-[10px] text-gray-500 truncate">{fmtDT(a.date)}{a.location ? ` · ${a.location}` : ''}{a.price ? ` · ${a.price} د.أ` : ''}</div>
                  </button>
                );
              })}
              {!actChoices.length && <div className="text-[11px] text-gray-600">لا فعاليّات قادمة</div>}
            </div>
          </div>

          {/* ── الإعلان ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-800">
            <div className="flex flex-col gap-2.5">
              <Toggle on={form.announce} onChange={v => patch('announce', v)} label="البوت يعلنه لمن يحادثه"
                hint="مرّةً واحدة لكلّ محادثة، ملحَقاً بردّه حرفيّاً — لا يُلحق بردٍّ فيه تأكيدُ حجزٍ أو إلغاء، ولا لمن في مدينةٍ أخرى" />
              <Toggle on={form.notifyExisting} onChange={v => patch('notifyExisting', v)} label="إبلاغ الحاجزين مسبقاً"
                hint="يظهر زرّ «📣 إبلاغ الحاجزين» — الإرسال بيدك بعد المعاينة، ولمن نافذته مفتوحة فقط" />
            </div>
            <Field label="نصّ إعلانٍ خاصّ (اختياريّ)" hint="فارغ = نصٌّ آليّ من الشروط أعلاه (الأدقّ). الحاجزون مسبقاً يأخذون دائماً صيغتهم بأرقام حجزهم">
              <textarea id="bo-text" rows={3} maxLength={900} className={inputCls} value={form.announceText} onChange={e => patch('announceText', e.target.value)}
                placeholder={`🎁 عرض «${form.name || 'الاسم'}»: ${ruleText(form.groupSize, form.payFor, form.repeat)}.`} />
            </Field>
          </div>

          {/* ── ما سيقرؤه العميل ── */}
          {example && (
            <div className="mt-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 px-3 py-2.5 text-xs text-emerald-100 leading-relaxed">
              <div className="font-bold">🎁 {ruleText(form.groupSize, form.payFor, form.repeat)}</div>
              <div className="text-[11px] text-emerald-200/80 mt-1">
                {example.size} أشخاص ⟵ {example.free} ببلاش{example.price ? ` — يدفعون ${Math.round((example.size - example.free) * example.price * 100) / 100} د.أ بدل ${Math.round(example.size * example.price * 100) / 100}` : ''}
                {form.repeat && ` · ${example.size2} ⟵ ${example.free2} ببلاش`}
                {` · ${example.size - 1} ⟵ لا عرض (البوت يقترح إضافة واحد)`}
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-3 flex-wrap">
            {form.id ? (
              <button disabled={busy} onClick={() => save()} className="text-xs font-bold px-4 py-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50">حفظ التعديل</button>
            ) : (
              <>
                <button disabled={busy} onClick={() => save('live')} className="text-xs font-bold px-4 py-1.5 rounded-lg bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50">🟢 حفظ وتفعيل</button>
                <button disabled={busy} onClick={() => save('draft')} className="text-xs font-bold px-4 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:text-white disabled:opacity-50">📝 حفظ مسودة</button>
              </>
            )}
          </div>
        </section>
      )}

      {/* ═══ معاينة الإبلاغ ═══ */}
      {notify && (
        <section className="rounded-2xl border border-sky-500/30 bg-gray-900/70 p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-white">📣 إبلاغ الحاجزين مسبقاً — «{notify.offer.name}»</h3>
            <button onClick={() => setNotify(null)} className="text-[11px] text-gray-400 hover:text-white">إغلاق ✕</button>
          </div>
          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
            الأولويّة: {notify.offer.notifiedAt ? <>بدأت {fmtDT(notify.offer.priorityStart)} وتنتهي <b className="text-gray-300">{fmtDT(notify.offer.priorityEnd)}</b></> : <>تبدأ مع هذا الإبلاغ</>}.
            {notify.offer.maxGroups > 0 && <> السقف {n(notify.offer.maxGroups)} · استُخدم {n(notify.used)} · محجوزٌ لهم {n(notify.reserved)}.</>}
            {' '}من يستحقّ بعدده الحاليّ يُطلب منه أرقامُ أصحابه لتثبيته.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px]">
            {Object.entries(KIND).map(([k, v]) => counts[k] ? <span key={k} className={v.cls} title={v.hint}>{v.label}: <b className="tabular-nums">{n(counts[k])}</b></span> : null)}
            {!notify.rows.length && <span className="text-gray-500">لا حاجزين على فعاليّات العرض</span>}
          </div>
          {notify.rows.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-gray-800">
              <table className="w-full text-xs">
                <thead className="bg-gray-950/60 text-gray-500 text-[10.5px]">
                  <tr><th className="text-right px-2.5 py-1.5">الحاجز</th><th className="text-right px-2.5 py-1.5">الفعاليّة</th><th className="px-2.5 py-1.5">العدد</th><th className="text-right px-2.5 py-1.5">الحالة</th><th className="px-2.5 py-1.5"></th></tr>
                </thead>
                <tbody>
                  {notify.rows.map((r: any) => {
                    const key = `${r.activityId}:${r.phone}`;
                    return [
                      <tr key={key} className="border-t border-gray-800/70">
                        <td className="px-2.5 py-1.5 text-gray-200">{r.name || '—'}<span className="block text-[10px] text-gray-600 font-mono" dir="ltr">{r.phone}</span></td>
                        <td className="px-2.5 py-1.5 text-gray-400">{r.activityName}<span className="block text-[10px] text-gray-600">{r.activityWhen}</span></td>
                        <td className="px-2.5 py-1.5 text-center tabular-nums text-gray-300">{r.people}{r.qualifies && <span className="block text-[9.5px] text-emerald-400">يستحقّ</span>}</td>
                        <td className={`px-2.5 py-1.5 ${KIND[r.kind]?.cls || ''}`}>{KIND[r.kind]?.label || r.kind}</td>
                        <td className="px-2.5 py-1.5 text-left">
                          {r.message && <button onClick={() => setOpenMsg(openMsg === key ? null : key)} className="text-[10.5px] text-gray-500 hover:text-white">{openMsg === key ? 'إخفاء' : 'الرسالة'}</button>}
                        </td>
                      </tr>,
                      openMsg === key ? (
                        <tr key={key + ':m'}><td colSpan={5} className="px-2.5 pb-2"><pre className="whitespace-pre-wrap text-[11px] text-gray-300 bg-gray-950 rounded-lg p-2.5 font-sans leading-relaxed">{r.message}</pre></td></tr>
                      ) : null,
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-2 mt-3 flex-wrap items-center">
            <button disabled={busy || !counts.send || notify.offer.state !== 'live'} onClick={sendNotify}
              className="text-xs font-bold px-4 py-1.5 rounded-lg bg-sky-500 text-black hover:bg-sky-400 disabled:opacity-40">📣 أرسل لـ{n(counts.send || 0)} نافذتهم مفتوحة</button>
            {notify.offer.state !== 'live' && <span className="text-[11px] text-amber-300">فعّل العرض أوّلاً — لا إبلاغ بعرضٍ غير فعّال</span>}
            {counts.closed > 0 && <span className="text-[11px] text-gray-500">🔒 {n(counts.closed)} نافذتهم مغلقة: لا رسالة آليّة (قيد واتساب) — أرقامهم أعلاه للتواصل اليدويّ إن أردت.</span>}
          </div>
        </section>
      )}

      {/* ═══ القائمة ═══ */}
      {data.offers.length === 0 && !form && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 text-[11px] text-gray-500">لا عروض بعد.</section>
      )}
      {data.offers.map(o => {
        const st = STATE[o.state] || STATE.draft;
        const s = o.stats || {};
        return (
          <section key={o.id} className={`rounded-2xl border p-4 ${o.state === 'live' ? 'border-emerald-500/30 bg-emerald-500/[0.03]' : 'border-gray-800 bg-gray-900/60'}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-white">{o.name}</h3>
                  <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                  {o.announce && o.state === 'live' && <span className="text-[10px] text-gray-500">📢 يُعلَن</span>}
                </div>
                <div className="text-xs text-amber-200 mt-1">🎁 {o.rule}</div>
                <div className="text-[11px] text-gray-500 mt-1">
                  الحجز {fmtDT(o.bookFrom)} ← {fmtDT(o.bookUntil)} · قبل الفعاليّة بـ{n(o.leadHours)} س
                  {o.maxGroups > 0 ? ` · سقف ${n(o.maxGroups)} مجموعة` : ' · بلا سقف'} · {n(o.perCustomer)} للعميل
                  {o.priorityHours > 0 && ` · أولويّة ${n(o.priorityHours)} س`}
                  {o.notifiedAt && ` · أُبلغ ${fmtDT(o.notifiedAt)}`}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {(o.activities || []).map((a: any) => (
                    <a key={a.id} href={`/admin/activities/${a.id}`} className={`text-[10.5px] px-2 py-0.5 rounded-md border ${a.past ? 'border-gray-800 text-gray-600' : 'border-gray-700 text-gray-300 hover:text-white'}`}>
                      {a.name} · {fmtDT(a.date)}
                    </a>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-center shrink-0">
                <div><div className="text-[10px] text-gray-500">مجموعات</div><div className="text-lg font-black text-white tabular-nums">{n(s.groups)}</div></div>
                <div><div className="text-[10px] text-gray-500">أصحاب مرتبطون</div><div className="text-lg font-black text-sky-300 tabular-nums">{n(s.linked)}<span className="text-[10px] text-gray-500 font-normal">{s.pending ? ` +${n(s.pending)} بانتظار` : ''}</span></div></div>
                <div><div className="text-[10px] text-gray-500">مجّانيّ مُحسوم</div><div className="text-lg font-black text-emerald-300 tabular-nums">{n(s.given)}<span className="text-[10px] text-gray-500 font-normal"> / {n(s.promised)} موعود</span></div></div>
              </div>
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              {o.status !== 'live' && o.state !== 'ended' && (
                <button disabled={busy} onClick={() => setStatus(o, 'live')} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-600/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">🟢 تفعيل</button>
              )}
              {o.status === 'live' && (
                <button disabled={busy} onClick={() => setStatus(o, 'paused')} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-amber-600/40 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50">⏸️ إيقاف</button>
              )}
              {o.notifyExisting && o.state !== 'ended' && (
                <button disabled={busy} onClick={() => openNotify(o)} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-sky-600/40 text-sky-300 hover:bg-sky-500/10 disabled:opacity-50">📣 إبلاغ الحاجزين</button>
              )}
              <button disabled={busy} onClick={() => edit(o)} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:text-white disabled:opacity-50">✏️ تعديل</button>
              {!s.groups && (
                <button disabled={busy} onClick={() => remove(o)} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-rose-600/30 text-rose-300/80 hover:bg-rose-500/10 disabled:opacity-50">🗑️ حذف</button>
              )}
              {s.foregone > 0 && <span className="text-[11px] text-gray-500 self-center">قيمة المجّانيّ المحسوم: {n(s.foregone)} د.أ</span>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
