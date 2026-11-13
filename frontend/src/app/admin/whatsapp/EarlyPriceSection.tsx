'use client';

// ══════════════════════════════════════════════════════
// 💸 سعر الدون المبكّر — داخل «🎟️ عروض الحجز»
// ══════════════════════════════════════════════════════
// حجزٌ عبر الدون (أو يسجّله الأدمن عبر البوت) قبل اللعبة بالمهلة ⟵ سعرٌ أقلّ، بلا ختم ولاء.
// الفترة تحكم موعد الفعاليّة. السعر يُقفل لحظة الحجز. التفعيل يمرّ بمعاينةٍ تُظهر الأثر
// الرجعيّ على الحجوزات المبكّرة القائمة (من سيتغيّر سعره ومن سيسقط ختمه) قبل الضغط.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Coins, Pause, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { swalConfirm, swalAlert } from '@/lib/swal';
import { Badge, Banner, Card, Chip, Field, Pop, Seg, Setting, Tile, Toggle, type Tone } from './wa-ui';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;
const H = 3600e3;
const JO = 3 * H;
const toInput = (v: any) => { const t = new Date(v).getTime(); return isNaN(t) ? '' : new Date(t + JO).toISOString().slice(0, 16); };
const fromInput = (s: string) => new Date(s + ':00+03:00').toISOString();
const n = (x: any) => Number(x || 0).toLocaleString('ar-JO-u-nu-latn');
function fmtDT(v: any) {
  if (!v) return '—';
  return new Date(v).toLocaleString('ar-JO-u-nu-latn', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' });
}
const STATE: Record<string, { label: string; tone?: Tone }> = {
  live: { label: 'فعّال', tone: 'ok' },
  paused: { label: 'موقوف', tone: 'warn' },
  draft: { label: 'مسودة' },
};
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

  if (err && !data) return <Banner tone="danger" icon={<AlertTriangle />}>{err}</Banner>;
  if (!data) return null;
  const cityName = (id: number) => data.cities.find((c: any) => c.id === id)?.name || `#${id}`;
  const actName = (id: number) => data.upcoming.find((a: any) => a.id === id)?.name || `#${id}`;

  return (
    <>
      {/* ── الرأس ── */}
      <Card
        title={<><Coins />سعر الدون المبكّر</>}
        aside={!form && (
          <button type="button" className="wa-btn" onClick={() => { setPreview(null); setForm(blankForm()); }}><Plus />سعرٌ مبكّر جديد</button>
        )}
      >
        <p style={{ margin: 0, font: '400 14px/22px var(--font-sans)', color: 'var(--ink-2)', maxWidth: '80ch' }}>
          من يحجز <b style={{ color: 'var(--ink)' }}>عبر الدون</b> (أو يسجّله الأدمن عبر البوت) قبل اللعبة بالمهلة يدخل بسعرٍ أقلّ — لكلّ مقعدٍ في حجزه —
          ولا تُحتسب زيارته ختم ولاء. السعر يُقفل لحظة الحجز. من حجز بنفسه ولم يحضر (أو ألغى في آخر ٦ ساعات) يُحرم منه في حجزه التالي.
          الفترة تحكم <b style={{ color: 'var(--ink)' }}>موعد الفعاليّة</b>.
        </p>
        {data.offers.length === 0 && !form && <p className="muted" style={{ margin: 'var(--space-3) 0 0', fontSize: 14 }}>لا سعر مبكّر بعد.</p>}
      </Card>

      {/* ── النموذج ── */}
      {form && (
        <Card
          style={{ borderColor: 'var(--gold)' }}
          title={form.id ? `تعديل «${form.name}»` : 'سعرٌ مبكّر جديد'}
          aside={<button type="button" className="wa-btn ghost" onClick={() => setForm(null)}><X />إلغاء</button>}
        >
          <div className="stack">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="col-span-2">
                <Field label="الاسم" hint="يظهر للعميل في رسائل الدون" htmlFor="ep-name">
                  <input id="ep-name" className="wa-input" value={form.name} onChange={e => patch('name', e.target.value)} />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="شكل السعر">
                  <Seg block label="شكل السعر" value={form.mode} options={[['fixed', 'سعر ثابت'], ['off', 'خصم مبلغ']]} onChange={v => patch('mode', v)} />
                </Field>
              </div>
              <Field label={form.mode === 'fixed' ? 'السعر (د.أ)' : 'الخصم (د.أ)'} htmlFor="ep-value">
                <input id="ep-value" type="number" min={0.5} max={50} step={0.5} dir="ltr" className="wa-input ltr" value={form.value} onChange={e => patch('value', Number(e.target.value))} />
              </Field>
              <Field label="المهلة: ساعات قبل اللعبة" htmlFor="ep-lead">
                <input id="ep-lead" type="number" min={1} max={168} dir="ltr" className="wa-input ltr" value={form.leadHours} onChange={e => patch('leadHours', Math.max(1, parseInt(e.target.value) || 24))} />
              </Field>
              <div className="col-span-2">
                <Field label="فعاليّات من (عمّان)" htmlFor="ep-from">
                  <input id="ep-from" type="datetime-local" dir="ltr" className="wa-input ltr" value={form.actFrom} onChange={e => patch('actFrom', e.target.value)} />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="إلى (عمّان)" htmlFor="ep-until">
                  <input id="ep-until" type="datetime-local" dir="ltr" className="wa-input ltr" value={form.actUntil} onChange={e => patch('actUntil', e.target.value)} />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="النطاق">
                  <Seg block label="النطاق" value={form.scope} options={[['all', 'كلّ المدن'], ['cities', 'مدن'], ['acts', 'فعاليّات']]} onChange={v => patch('scope', v)} />
                </Field>
              </div>
            </div>

            {form.scope === 'cities' && (
              <Field label="المدن">
                <div className="wa-chips" style={{ flexWrap: 'wrap' }}>
                  {data.cities.map((c: any) => (
                    <Chip key={c.id} on={form.cityIds.includes(c.id)} onClick={() => toggleIn('cityIds', c.id)}>
                      {form.cityIds.includes(c.id) && <Check className="s" />}{c.name}
                    </Chip>
                  ))}
                </div>
              </Field>
            )}

            <Field label={form.scope === 'acts' ? 'الفعاليّات المشمولة' : 'استثناء فعاليّات'} hint={form.scope === 'acts' ? undefined : 'المستثناة تبقى بسعرها العاديّ وختمها كالمعتاد'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto">
                {data.upcoming.map((a: any) => {
                  const key = form.scope === 'acts' ? 'activityIds' : 'excludeIds';
                  const on = (form as any)[key].includes(a.id);
                  return (
                    <button key={a.id} type="button" aria-pressed={on} onClick={() => toggleIn(key as any, a.id)}
                      className={`wa-pill${form.scope === 'acts' ? '' : ' x'}`} style={{ minHeight: 'var(--hit)', paddingBlock: 6 }}>
                      {on && (form.scope === 'acts' ? <Check className="s" /> : <X className="s" />)}
                      <span className="grow">
                        <span className="trunc" style={{ display: 'block' }}>{a.name}</span>
                        <span className="trunc" style={{ display: 'block', font: '500 12px/16px var(--font-sans)', opacity: 0.8 }}>{fmtDT(a.date)}{a.location ? ` · ${a.location}` : ''}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Setting title="الدون يعلنه" hint="مرّةً لكلّ محادثة">
                  <Toggle on={form.announce} onChange={v => patch('announce', v)} label="الدون يعلنه" />
                </Setting>
              </div>
              <Field label="نصّ إعلانٍ خاصّ (اختياريّ)" hint="فارغ = نصٌّ آليّ بالأرقام والمواعيد (الأدقّ)" htmlFor="ep-text">
                <textarea id="ep-text" rows={2} maxLength={900} className="wa-textarea" value={form.announceText} onChange={e => patch('announceText', e.target.value)} />
              </Field>
            </div>

            {example && (
              <Banner tone="ok" icon={<Check />}>
                مثال بسعر ٣ د.أ: عبر الدون قبل <span className="ltr">{n(form.leadHours)}</span> ساعة ⟵ <b><span className="ltr">{n(example.price)}</span> د.أ</b> للشخص، بلا ختم. بعد الموعد ⟵ ٣ د.أ وختمٌ كالمعتاد.
              </Banner>
            )}

            <div className="row">
              <button type="button" disabled={busy} onClick={save} className="wa-btn primary">{form.id ? 'حفظ التعديل' : 'حفظ مسودة'}</button>
            </div>
          </div>
        </Card>
      )}

      {/* ── معاينة التفعيل: لوح سفليّ على الهاتف، نافذة على الحاسوب ── */}
      {preview && (
        <Pop wide onClose={() => setPreview(null)} label="معاينة التفعيل"
          title={<span className="row"><Play style={{ color: 'var(--ok)' }} />معاينة تفعيل «{preview.offer.name}»</span>}>
          <p style={{ margin: 0, font: '400 14px/22px var(--font-sans)', color: 'var(--ink-2)' }}>الأثر الرجعيّ على الحجوزات المبكّرة القائمة عبر الدون:</p>
          <div className="wa-grid3">
            <Tile tone="ok" k="حجوزات يتغيّر سعرها" v={n(preview.summary.apply)} h={<><span className="ltr">{n(preview.summary.seats)}</span> مقعداً</>} />
            <Tile tone="gold" k="قيمة الخصم" v={n(preview.summary.foregone)} h="د.أ" />
            <Tile tone="danger" k="يسقط ختمهم" v={n(preview.summary.losesStamp)} h="لاعباً مسجَّلاً على تلك الزيارة" />
          </div>
          <Banner tone="warn" icon={<AlertTriangle />}>
            {preview.summary.paidSkipped > 0 && <><span className="ltr">{n(preview.summary.paidSkipped)}</span> مدفوعة لا تُعدَّل. </>}من نافذته مفتوحة يصله إشعار.
          </Banner>
          {preview.rows.length > 0 && (
            <div className="wa-tablewrap">
              <table className="wa-table cards">
                <thead><tr><th>الحاجز</th><th>الفعاليّة</th><th>العدد</th><th>السعر</th><th>ملاحظة</th></tr></thead>
                <tbody>
                  {preview.rows.map((r: any) => (
                    <tr key={r.reservationId} style={r.paid ? { opacity: 0.55 } : undefined}>
                      <td data-l="الحاجز"><span><b>{r.name}</b><span className="ltr muted" style={{ display: 'block' }}>{r.phone}</span></span></td>
                      <td data-l="الفعاليّة"><span>{r.activityName}<span className="muted" style={{ display: 'block', fontSize: 12 }}>حجز قبل <span className="ltr">{n(r.bookedHoursBefore)}</span> س</span></span></td>
                      <td data-l="العدد"><span className="ltr">{n(r.people)}</span></td>
                      <td data-l="السعر"><span className="ltr">{r.paid ? n(r.from) : <>{n(r.from)} → <b style={{ color: 'var(--ok)' }}>{n(r.to)}</b></>}</span></td>
                      <td data-l="ملاحظة" style={{ fontSize: 13 }}>
                        {r.paid ? <span className="muted">مدفوع — لا يُعدَّل</span> : r.losesStamp ? <span style={{ color: 'var(--danger)' }}>يسقط ختمه</span> : <span className="muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="acts">
            <button type="button" className="wa-btn ghost" onClick={() => setPreview(null)}>إغلاق</button>
            <button type="button" disabled={busy} onClick={doActivate} className="wa-btn send" style={{ whiteSpace: 'normal' }}>
              <Check />فعّل{preview.summary.apply > 0 ? <> وطبّق على <span className="ltr">{n(preview.summary.apply)}</span> حجزاً</> : ''}
            </button>
          </div>
        </Pop>
      )}

      {/* ── القائمة ── */}
      {data.offers.map((o: any) => {
        const st = STATE[o.status] || STATE.draft;
        const s = o.stats || {};
        const scope = o.scope === 'all' ? 'كلّ المدن' : o.scope === 'cities' ? (o.cityIds || []).map(cityName).join('، ') : `${(o.activityIds || []).length} فعاليّات بعينها`;
        return (
          <Card key={o.id} style={o.status === 'live' ? { borderColor: 'var(--ok)' } : undefined}
            title={<><Coins /><span className="trunc">{o.name}</span><Badge tone={st.tone}>{st.label}</Badge></>}>
            <div className="stack">
              <div style={{ font: '700 14px/22px var(--font-sans)', color: 'var(--gold)' }}>
                {o.mode === 'fixed' ? <><span className="ltr">{n(o.value)}</span> د.أ للشخص</> : <>خصم <span className="ltr">{n(o.value)}</span> د.أ</>} عبر الدون قبل اللعبة بـ<span className="ltr">{n(o.leadHours)}</span> ساعة — بلا ختم ولاء
              </div>
              <div className="muted" style={{ font: '500 13px/20px var(--font-sans)' }}>
                فعاليّات {fmtDT(o.actFrom)} ← {fmtDT(o.actUntil)} · {scope}{o.scope !== 'acts' && (o.excludeIds || []).length ? ` · مستثناة: ${(o.excludeIds || []).map(actName).join('، ')}` : ''}{o.activatedAt ? ` · فُعّل ${fmtDT(o.activatedAt)}` : ''}
              </div>
              {(o.covered || []).length > 0 && (
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  {o.covered.map((a: any) => (
                    <Badge key={a.id} tone={a.open ? 'ok' : undefined} title={a.open ? `السعر المبكّر حتّى ${fmtDT(a.deadline)}` : 'فات موعد السعر المبكّر'}>
                      {a.name} · {a.open ? `حتّى ${fmtDT(a.deadline)}` : 'فات الموعد'}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="wa-grid3">
                <Tile k="حجوزات" v={n(s.reservations)} />
                <Tile k="مقاعد" v={n(s.seats)} />
                <Tile tone="gold" k="قيمة الخصم" v={n(s.foregone)} h="د.أ" />
              </div>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                {o.status !== 'live' && <button type="button" disabled={busy} onClick={() => openPreview(o)} className="wa-btn"><Play />معاينة التفعيل</button>}
                {o.status === 'live' && <button type="button" disabled={busy} onClick={() => setStatus(o, 'paused')} className="wa-btn"><Pause />إيقاف</button>}
                <button type="button" disabled={busy} onClick={() => edit(o)} className="wa-btn"><Pencil />تعديل</button>
                {!s.reservations && o.status !== 'live' && <button type="button" disabled={busy} onClick={() => remove(o)} className="wa-btn danger"><Trash2 />حذف</button>}
              </div>
            </div>
          </Card>
        );
      })}
    </>
  );
}
