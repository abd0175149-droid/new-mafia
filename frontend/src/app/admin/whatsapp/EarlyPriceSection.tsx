'use client';

// ══════════════════════════════════════════════════════
// 💸 سعر الدون المبكّر — داخل «🎟️ عروض الحجز»
// ══════════════════════════════════════════════════════
// حجزٌ عبر الدون (أو يسجّله الأدمن عبر البوت) قبل اللعبة بالمهلة ⟵ سعرٌ أقلّ، بلا ختم ولاء.
// الفترة تحكم موعد الفعاليّة. السعر يُقفل لحظة الحجز. التفعيل يمرّ بمعاينةٍ تُظهر الأثر
// الرجعيّ على الحجوزات المبكّرة القائمة (من سيتغيّر سعره ومن سيسقط ختمه) قبل الضغط.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { swalConfirm, swalAlert } from '@/lib/swal';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;
const H = 3600e3;
const JO = 3 * H;
const toInput = (v: any) => { const t = new Date(v).getTime(); return isNaN(t) ? '' : new Date(t + JO).toISOString().slice(0, 16); };
const fromInput = (s: string) => new Date(s + ':00+03:00').toISOString();
const n = (x: any) => Number(x || 0).toLocaleString('ar-JO');
function fmtDT(v: any) {
  if (!v) return '—';
  return new Date(v).toLocaleString('ar-JO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' });
}
const STATE: Record<string, { label: string; cls: string }> = {
  live: { label: '🟢 فعّال', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  paused: { label: '⏸️ موقوف', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  draft: { label: '📝 مسودة', cls: 'bg-gray-700/40 text-gray-300 border-gray-600' },
};
const inputCls = 'w-full bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500';
function Field({ label, hint, children }: { label: string; hint?: string; children: any }) {
  return (
    <div className="min-w-0">
      <label className="text-[11px] text-gray-400 font-bold block mb-1">{label}</label>
      {children}
      {hint && <div className="text-[10px] text-gray-600 mt-0.5 leading-snug">{hint}</div>}
    </div>
  );
}
function Seg({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${value === v ? 'border-amber-500 text-amber-300 bg-amber-500/10' : 'border-gray-700 text-gray-400 hover:text-white'}`}>{l}</button>
      ))}
    </div>
  );
}
function blankForm() {
  const now = Date.now();
  const end = new Date(now + 31 * 24 * H);
  return {
    id: null as number | null, name: 'سعر الدون المبكّر', mode: 'fixed', value: 2, leadHours: 24,
    actFrom: toInput(now), actUntil: toInput(end), scope: 'all', cityIds: [] as number[], activityIds: [] as number[], excludeIds: [] as number[],
    announce: true, announceText: '',
  };
}

export default function EarlyPriceSection({ apiFetch }: { apiFetch: Fetcher }) {
  const [data, setData] = useState<{ offers: any[]; upcoming: any[]; cities: any[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<ReturnType<typeof blankForm> | null>(null);
  const [preview, setPreview] = useState<any>(null);

  const load = useCallback(async () => {
    try { const d = await apiFetch('/api/early-price'); setData({ offers: d.offers || [], upcoming: d.upcoming || [], cities: d.cities || [] }); setErr(null); }
    catch (e: any) { setErr(e.message); }
  }, [apiFetch]);
  useEffect(() => { load(); }, [load]);
  const patch = (k: string, v: any) => setForm(f => f ? { ...f, [k]: v } : f);
  const toggleIn = (k: 'cityIds' | 'activityIds' | 'excludeIds', id: number) => setForm(f => {
    if (!f) return f; const cur = f[k]; return { ...f, [k]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] };
  });

  const example = useMemo(() => {
    if (!form) return null;
    const base = 3; const v = Number(form.value) || 0;
    const price = form.mode === 'fixed' ? Math.min(v, base) : Math.max(0, base - v);
    return { base, price };
  }, [form]);

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      const body = { ...form, actFrom: fromInput(form.actFrom), actUntil: fromInput(form.actUntil) };
      await apiFetch(form.id ? `/api/early-price/${form.id}` : '/api/early-price', { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      setForm(null); await load();
      swalAlert(form.id ? '✅ حُفظ — الحجوزات المقفولة تحتفظ بسعرها' : '✅ حُفظ مسودة — فعّله من «معاينة التفعيل»');
    } catch (e: any) { swalAlert(`❌ ${e.message}`); }
    setBusy(false);
  }
  async function openPreview(o: any) {
    setBusy(true);
    try { const d = await apiFetch(`/api/early-price/${o.id}/activation-preview`); setPreview({ ...d, offer: o }); }
    catch (e: any) { swalAlert(`❌ ${e.message}`); }
    setBusy(false);
  }
  async function doActivate() {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/api/early-price/${preview.offer.id}/activate`, { method: 'POST', body: JSON.stringify({ applyRetro: true }) });
      setPreview(null); await load();
      swalAlert(`✅ العرض فعّال${r.applied ? ` — طُبّق على ${r.applied} حجزاً قائماً` : ''}. الدون يعلنه ويشرحه الآن.`);
    } catch (e: any) { swalAlert(`❌ ${e.message}`); }
    setBusy(false);
  }
  async function setStatus(o: any, status: 'paused' | 'draft') {
    if (!(await swalConfirm(status === 'paused' ? `إيقاف «${o.name}»؟ لا يأخذه حجزٌ جديد، والحجوزات المقفولة تحتفظ بسعرها.` : `إرجاع «${o.name}» مسودة؟`, { icon: 'question' }))) return;
    setBusy(true);
    try { await apiFetch(`/api/early-price/${o.id}/status`, { method: 'POST', body: JSON.stringify({ status }) }); await load(); }
    catch (e: any) { swalAlert(`❌ ${e.message}`); }
    setBusy(false);
  }
  async function remove(o: any) {
    if (!(await swalConfirm(`حذف «${o.name}»؟`, { danger: true, confirmText: 'احذف' }))) return;
    setBusy(true);
    try { await apiFetch(`/api/early-price/${o.id}`, { method: 'DELETE' }); await load(); }
    catch (e: any) { swalAlert(`❌ ${e.message}`); }
    setBusy(false);
  }
  function edit(o: any) {
    setPreview(null);
    setForm({
      id: o.id, name: o.name, mode: o.mode, value: Number(o.value), leadHours: o.leadHours, actFrom: toInput(o.actFrom), actUntil: toInput(o.actUntil),
      scope: o.scope, cityIds: (o.cityIds || []).map(Number), activityIds: (o.activityIds || []).map(Number), excludeIds: (o.excludeIds || []).map(Number),
      announce: o.announce !== false, announceText: o.announceText || '',
    });
  }

  if (err && !data) return <div className="text-xs text-rose-300 p-3">{err}</div>;
  if (!data) return null;
  const cityName = (id: number) => data.cities.find((c: any) => c.id === id)?.name || `#${id}`;
  const actName = (id: number) => data.upcoming.find((a: any) => a.id === id)?.name || `#${id}`;

  return (
    <section className="rounded-2xl border border-amber-600/30 bg-gray-900/60 p-4 flex flex-col gap-3" dir="rtl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white">💸 سعر الدون المبكّر</h3>
          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed max-w-2xl">
            من يحجز <b className="text-gray-300">عبر الدون</b> (أو يسجّله الأدمن عبر البوت) قبل اللعبة بالمهلة يدخل بسعرٍ أقلّ — لكلّ مقعدٍ في حجزه —
            ولا تُحتسب زيارته ختم ولاء. السعر يُقفل لحظة الحجز. من حجز بنفسه ولم يحضر (أو ألغى في آخر ٦ ساعات) يُحرم منه في حجزه التالي.
            الفترة تحكم <b className="text-gray-300">موعد الفعاليّة</b>.
          </p>
        </div>
        {!form && <button onClick={() => { setPreview(null); setForm(blankForm()); }} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400 shrink-0">＋ سعرٌ مبكّر جديد</button>}
      </div>

      {/* ── النموذج ── */}
      {form && (
        <div className="rounded-xl border border-amber-500/30 bg-gray-950/40 p-3 flex flex-col gap-3">
          <div className="flex items-center justify-between"><b className="text-xs text-white">{form.id ? `تعديل «${form.name}»` : 'سعرٌ مبكّر جديد'}</b><button onClick={() => setForm(null)} className="text-[11px] text-gray-400 hover:text-white">إلغاء ✕</button></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2"><Field label="الاسم" hint="يظهر للعميل في رسائل الدون"><input id="ep-name" className={inputCls} value={form.name} onChange={e => patch('name', e.target.value)} /></Field></div>
            <Field label="شكل السعر"><Seg value={form.mode} options={[['fixed', 'سعر ثابت'], ['off', 'خصم مبلغ']]} onChange={v => patch('mode', v)} /></Field>
            <Field label={form.mode === 'fixed' ? 'السعر (د.أ)' : 'الخصم (د.أ)'}><input id="ep-value" type="number" min={0.5} max={50} step={0.5} className={inputCls} value={form.value} onChange={e => patch('value', Number(e.target.value))} /></Field>
            <Field label="المهلة: ساعات قبل اللعبة"><input id="ep-lead" type="number" min={1} max={168} className={inputCls} value={form.leadHours} onChange={e => patch('leadHours', Math.max(1, parseInt(e.target.value) || 24))} /></Field>
            <Field label="فعاليّات من (عمّان)"><input id="ep-from" type="datetime-local" className={inputCls} value={form.actFrom} onChange={e => patch('actFrom', e.target.value)} /></Field>
            <Field label="إلى (عمّان)"><input id="ep-until" type="datetime-local" className={inputCls} value={form.actUntil} onChange={e => patch('actUntil', e.target.value)} /></Field>
            <Field label="النطاق"><Seg value={form.scope} options={[['all', 'كلّ المدن'], ['cities', 'مدن'], ['acts', 'فعاليّات']]} onChange={v => patch('scope', v)} /></Field>
          </div>
          {form.scope === 'cities' && (
            <Field label="المدن"><div className="flex gap-1.5 flex-wrap">{data.cities.map((c: any) => (
              <button key={c.id} type="button" onClick={() => toggleIn('cityIds', c.id)} className={`text-[11px] px-2.5 py-1 rounded-lg border ${form.cityIds.includes(c.id) ? 'border-amber-500 text-amber-300 bg-amber-500/10' : 'border-gray-700 text-gray-400'}`}>{form.cityIds.includes(c.id) ? '✓ ' : ''}{c.name}</button>
            ))}</div></Field>
          )}
          <Field label={form.scope === 'acts' ? 'الفعاليّات المشمولة' : 'استثناء فعاليّات'} hint={form.scope === 'acts' ? undefined : 'المستثناة تبقى بسعرها العاديّ وختمها كالمعتاد'}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
              {data.upcoming.map((a: any) => {
                const key = form.scope === 'acts' ? 'activityIds' : 'excludeIds';
                const on = (form as any)[key].includes(a.id);
                return (
                  <button key={a.id} type="button" onClick={() => toggleIn(key as any, a.id)}
                    className={`text-right rounded-lg border px-2.5 py-1.5 ${on ? (form.scope === 'acts' ? 'border-amber-500/60 bg-amber-500/10' : 'border-rose-500/60 bg-rose-500/10') : 'border-gray-800 hover:border-gray-600'}`}>
                    <div className={`text-xs font-bold truncate ${on ? (form.scope === 'acts' ? 'text-amber-200' : 'text-rose-200') : 'text-gray-200'}`}>{on ? (form.scope === 'acts' ? '✓ ' : '✕ ') : ''}{a.name}</div>
                    <div className="text-[10px] text-gray-500 truncate">{fmtDT(a.date)}{a.location ? ` · ${a.location}` : ''}</div>
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="الدون يعلنه"><Seg value={form.announce ? '1' : '0'} options={[['1', 'نعم، مرّةً لكلّ محادثة'], ['0', 'لا']]} onChange={v => patch('announce', v === '1')} /></Field>
            <Field label="نصّ إعلانٍ خاصّ (اختياريّ)" hint="فارغ = نصٌّ آليّ بالأرقام والمواعيد (الأدقّ)"><textarea id="ep-text" rows={2} maxLength={900} className={inputCls} value={form.announceText} onChange={e => patch('announceText', e.target.value)} /></Field>
          </div>
          {example && <div className="text-[11px] text-emerald-200 bg-emerald-500/[0.06] border border-emerald-500/20 rounded-lg px-3 py-2">مثال بسعر ٣ د.أ: عبر الدون قبل {n(form.leadHours)} ساعة ⟵ <b>{n(example.price)} د.أ</b> للشخص، بلا ختم. بعد الموعد ⟵ ٣ د.أ وختمٌ كالمعتاد.</div>}
          <div><button disabled={busy} onClick={save} className="text-xs font-bold px-4 py-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50">{form.id ? 'حفظ التعديل' : 'حفظ مسودة'}</button></div>
        </div>
      )}

      {/* ── معاينة التفعيل ── */}
      {preview && (
        <div className="rounded-xl border border-emerald-500/30 bg-gray-950/40 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 flex-wrap"><b className="text-xs text-white">▶️ معاينة تفعيل «{preview.offer.name}»</b><button onClick={() => setPreview(null)} className="text-[11px] text-gray-400 hover:text-white">إغلاق ✕</button></div>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            الأثر الرجعيّ على الحجوزات المبكّرة القائمة عبر الدون: يتغيّر سعر <b className="text-white">{n(preview.summary.apply)}</b> حجزاً ({n(preview.summary.seats)} مقعداً، قيمة الخصم {n(preview.summary.foregone)} د.أ)،
            ويسقط ختم <b className="text-rose-300">{n(preview.summary.losesStamp)}</b> لاعباً مسجَّلاً على تلك الزيارة.{preview.summary.paidSkipped > 0 && <> {n(preview.summary.paidSkipped)} مدفوعة لا تُعدَّل.</>} من نافذته مفتوحة يصله إشعار.
          </p>
          {preview.rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-800 max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-950 text-gray-500 text-[10.5px]"><tr><th className="text-right px-2 py-1.5">الحاجز</th><th className="text-right px-2 py-1.5">الفعاليّة</th><th className="px-2 py-1.5">العدد</th><th className="px-2 py-1.5">السعر</th><th className="text-right px-2 py-1.5">ملاحظة</th></tr></thead>
                <tbody>
                  {preview.rows.map((r: any) => (
                    <tr key={r.reservationId} className={`border-t border-gray-800/70 ${r.paid ? 'opacity-50' : ''}`}>
                      <td className="px-2 py-1.5 text-gray-200">{r.name}<span className="block text-[10px] text-gray-600 font-mono" dir="ltr">{r.phone}</span></td>
                      <td className="px-2 py-1.5 text-gray-400">{r.activityName}<span className="block text-[10px] text-gray-600">حجز قبل {n(r.bookedHoursBefore)} س</span></td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{n(r.people)}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{r.paid ? n(r.from) : <>{n(r.from)} ⟵ <b className="text-emerald-300">{n(r.to)}</b></>}</td>
                      <td className="px-2 py-1.5 text-[11px]">{r.paid ? <span className="text-gray-500">مدفوع — لا يُعدَّل</span> : r.losesStamp ? <span className="text-rose-300">يسقط ختمه</span> : <span className="text-gray-500">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <button disabled={busy} onClick={doActivate} className="text-xs font-bold px-4 py-1.5 rounded-lg bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50">
              🟢 فعّل{preview.summary.apply > 0 ? ` وطبّق على ${n(preview.summary.apply)} حجزاً` : ''}
            </button>
          </div>
        </div>
      )}

      {/* ── القائمة ── */}
      {data.offers.length === 0 && !form && <p className="text-[11px] text-gray-500">لا سعر مبكّر بعد.</p>}
      {data.offers.map((o: any) => {
        const st = STATE[o.status] || STATE.draft;
        const s = o.stats || {};
        const scope = o.scope === 'all' ? 'كلّ المدن' : o.scope === 'cities' ? (o.cityIds || []).map(cityName).join('، ') : `${(o.activityIds || []).length} فعاليّات بعينها`;
        return (
          <div key={o.id} className={`rounded-xl border p-3 ${o.status === 'live' ? 'border-emerald-500/30 bg-emerald-500/[0.03]' : 'border-gray-800'}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap"><b className="text-sm text-white">{o.name}</b><span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span></div>
                <div className="text-xs text-amber-200 mt-1">💸 {o.mode === 'fixed' ? `${n(o.value)} د.أ للشخص` : `خصم ${n(o.value)} د.أ`} عبر الدون قبل اللعبة بـ{n(o.leadHours)} ساعة — بلا ختم ولاء</div>
                <div className="text-[11px] text-gray-500 mt-1">فعاليّات {fmtDT(o.actFrom)} ← {fmtDT(o.actUntil)} · {scope}{o.scope !== 'acts' && (o.excludeIds || []).length ? ` · مستثناة: ${(o.excludeIds || []).map(actName).join('، ')}` : ''}{o.activatedAt ? ` · فُعّل ${fmtDT(o.activatedAt)}` : ''}</div>
                {(o.covered || []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {o.covered.map((a: any) => (
                      <span key={a.id} className={`text-[10.5px] px-2 py-0.5 rounded-md border ${a.open ? 'border-emerald-700/50 text-emerald-200' : 'border-gray-800 text-gray-600'}`} title={a.open ? `السعر المبكّر حتّى ${fmtDT(a.deadline)}` : 'فات موعد السعر المبكّر'}>
                        {a.name} · {a.open ? `حتّى ${fmtDT(a.deadline)}` : 'فات الموعد'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-x-4 text-center shrink-0">
                <div><div className="text-[10px] text-gray-500">حجوزات</div><div className="text-lg font-black text-white tabular-nums">{n(s.reservations)}</div></div>
                <div><div className="text-[10px] text-gray-500">مقاعد</div><div className="text-lg font-black text-amber-300 tabular-nums">{n(s.seats)}</div></div>
                <div><div className="text-[10px] text-gray-500">قيمة الخصم</div><div className="text-lg font-black text-emerald-300 tabular-nums">{n(s.foregone)}<span className="text-[10px] text-gray-500 font-normal"> د.أ</span></div></div>
              </div>
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {o.status !== 'live' && <button disabled={busy} onClick={() => openPreview(o)} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-600/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">▶️ معاينة التفعيل</button>}
              {o.status === 'live' && <button disabled={busy} onClick={() => setStatus(o, 'paused')} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-amber-600/40 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50">⏸️ إيقاف</button>}
              <button disabled={busy} onClick={() => edit(o)} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:text-white disabled:opacity-50">✏️ تعديل</button>
              {!s.reservations && o.status !== 'live' && <button disabled={busy} onClick={() => remove(o)} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-rose-600/30 text-rose-300/80 hover:bg-rose-500/10 disabled:opacity-50">🗑️ حذف</button>}
            </div>
          </div>
        );
      })}
    </section>
  );
}
