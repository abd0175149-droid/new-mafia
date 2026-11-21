'use client';

// ══════════════════════════════════════════════════════
// 📜 قواعد الحجز والعروض — صفحةٌ واحدة لما يحكم الحجز في كلّ القنوات (خطّة التوحيد م٢-ب، ق١٢)
// تبدأ بسياسة الحجز، وتُضاف إليها العروض الموحّدة في م٤.
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { Check, Loader2, RotateCcw } from 'lucide-react';
import '../whatsapp/wa.css';
import { Card, PageHead, Setting, Banner } from '../whatsapp/wa-ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}`, ...opts?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `خطأ ${res.status}`);
  return body;
}

interface Policy { selfCancelHours: number; changeHours: number; bookableGraceHours: number; lateCancelHours: number; strikeExpiryDays: number }
const FIELDS: Array<{ k: keyof Policy; title: string; hint: string; max: number; unit?: string; step?: number }> = [
  { k: 'selfCancelHours', title: 'الإلغاء الذاتيّ حتّى', hint: 'من التطبيق والدون معاً (ق٢). بعدها يصل الطلب للإدارة. المدفوع يُلغى عبر الإدارة دائماً.', max: 72 },
  { k: 'changeHours', title: 'تعديل العدد بنفسه حتّى', hint: 'زيادة الأشخاص أو إنقاصهم من الدون. بعدها يتحوّل الطلب للإدارة.', max: 72 },
  { k: 'bookableGraceHours', title: 'الحجز بعد موعد البدء حتّى', hint: 'ساعاتٌ بعد البدء ما زال الحجز فيها مقبولاً. والغرفة المفتوحة تُحجز دائماً.', max: 24 },
  { k: 'lateCancelHours', title: 'الإلغاء المتأخّر يُحسب غياباً في آخر', hint: 'من يلغي في هذه الساعات قبل اللعبة يُحرم من السعر المبكّر في حجزه التالي.', max: 72 },
  { k: 'strikeExpiryDays', title: 'الغياب ينتهي بعد', hint: 'غيابٌ أقدم من هذا لا يحرم من السعر المبكّر (ق٧). صفر = لا ينتهي.', max: 365, unit: 'يوم', step: 1 },
];

// 📊 تقرير الإلغاءات (م٣): متى يلغي الناس ومن أيّ قناة — منه تُضبط مهلة الإلغاء
const BUCKETS: Array<{ k: string; label: string }> = [
  { k: 'gt24', label: 'قبل يومٍ فأكثر' }, { k: 'h6_24', label: '٦–٢٤ ساعة' }, { k: 'h3_6', label: '٣–٦ ساعات' },
  { k: 'lt3', label: 'أقلّ من ٣' }, { k: 'after', label: 'بعد البدء' },
];
const CH: Record<string, string> = { app: '📱 التطبيق', bot: '🤖 الدون', botadmin: '🔒 أدمن البوت', staff: '👤 الإدارة', door: '🚪 الباب', group: '👥 مجموعة', system: '⚙️ النظام' };
const ar = (n: number) => String(n).replace(/\d/g, (x) => '٠١٢٣٤٥٦٧٨٩'[Number(x)]);

// 💸 م٤-أ: فهرس العروض الموحّد — كلّ العروض بشكلٍ واحد، وقاعدة الجمع ظاهرة (ق١١، ق١٣، ق١٤)
const ST: Record<string, { t: string; c: string }> = {
  live: { t: 'فعّال', c: 'var(--ok)' }, paused: { t: 'موقوف', c: 'var(--ink-3)' }, draft: { t: 'مسودة', c: 'var(--ink-3)' },
  scheduled: { t: 'مجدول', c: 'var(--gold)' }, ended: { t: 'انتهى', c: 'var(--ink-3)' },
};
const KIND: Record<string, string> = { early: '💸 سعر مبكّر', group: '👥 مجموعة', loyalty_visit: '🎟️ زيارة ولاء', loyalty_drink: '☕ مشروب ولاء', loyalty_chips: '🪙 رقائق ولاء' };

function OfferCatalog() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api('/api/booking-rules/offers').then(r => setRows(r.offers)).catch(e => setErr(e.message)); }, []);
  return (
    <Card title="فهرس العروض" aside="كلّ العروض في مكانٍ واحد">
      <p style={{ color: 'var(--ink-2)', margin: '0 0 var(--space-2)', fontSize: 13 }}>
        لا تُجمع العروض: يأخذ العميل الأفضل له (ق١١). الولاء حصريّ على الحجز كلّه (ق١٣)، ومشروبه لا يُطبَّق آليّاً ليلة عرض (ق١٤)،
        وحين ينطبق عرضٌ ومكافأة معاً يرى العميل الخيارين ويختار (ق١٥).
      </p>
      {err ? <Banner tone="danger" flat>{err}</Banner> : !rows ? <Loader2 className="animate-spin" aria-hidden="true" /> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {rows.map(o => (
            <div key={o.key} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '8px 10px', display: 'grid', gap: 2, opacity: o.status === 'live' ? 1 : 0.75 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 14 }}>{o.name}</b>
                <small style={{ color: 'var(--ink-3)' }}>{KIND[o.kind] || o.kind}</small>
                <small style={{ color: ST[o.status]?.c, fontWeight: 700, marginInlineStart: 'auto' }}>{ST[o.status]?.t || o.status}</small>
              </div>
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>{o.rule}</span>
              <small style={{ color: 'var(--ink-3)' }}>النطاق: {o.scope.text} · القنوات: {o.channelsText}{o.window ? ` · ${o.window}` : ''}</small>
              <small style={{ color: 'var(--ink-3)' }}>الجمع: {o.stackText} · <a href={o.edit} style={{ color: 'var(--gold)' }}>تعديل</a></small>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// 🧮 جرّب السعر: الدالّة الواحدة التي ستسعّر كلّ القنوات — ماذا يدفع هذا الشخص لو حجز الآن؟
function QuoteTester() {
  const [acts, setActs] = useState<any[]>([]);
  const [f, setF] = useState({ activityId: '', people: 1, phone: '', channel: 'bot' });
  const [q, setQ] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api('/api/activities').then((r: any) => {
      const list = (Array.isArray(r) ? r : r?.activities || r?.data || []).filter((a: any) => new Date(a.date).getTime() > Date.now() - 6 * 3600e3)
        .sort((x: any, y: any) => new Date(x.date).getTime() - new Date(y.date).getTime()).slice(0, 30);
      setActs(list); if (list[0]) setF(v => ({ ...v, activityId: String(list[0].id) }));
    }).catch(() => {});
  }, []);
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const qs = new URLSearchParams({ activityId: f.activityId, people: String(f.people), phone: f.phone, channel: f.channel });
      setQ((await api(`/api/booking-rules/quote?${qs}`)).quote);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Card title="جرّب السعر" aside="قراءةٌ فقط — لا يُحجز شيء">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="wa-input" style={{ flex: '1 1 200px', minHeight: 40 }} value={f.activityId} onChange={e => setF({ ...f, activityId: e.target.value })} aria-label="الفعاليّة">
          {acts.map(a => <option key={a.id} value={a.id}>{a.name} — {new Date(a.date).toLocaleDateString('ar-JO', { timeZone: 'Asia/Amman', weekday: 'long', day: 'numeric', month: 'numeric' })}</option>)}
        </select>
        <input className="wa-input" style={{ width: 70, minHeight: 40, textAlign: 'center' }} type="number" min={1} max={30} value={f.people} onChange={e => setF({ ...f, people: Number(e.target.value) || 1 })} aria-label="العدد" />
        <input className="wa-input" style={{ width: 140, minHeight: 40 }} dir="ltr" inputMode="tel" placeholder="رقم العميل" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} aria-label="الرقم" />
        <select className="wa-input" style={{ width: 'auto', minHeight: 40 }} value={f.channel} onChange={e => setF({ ...f, channel: e.target.value })} aria-label="القناة">
          <option value="bot">🤖 الدون</option><option value="app">📱 التطبيق</option><option value="admin">🔒 أدمن البوت</option><option value="staff">👤 الإدارة</option>
        </select>
        <button type="button" className="wa-btn primary" disabled={busy || !f.activityId} onClick={run}>{busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null} سعّر</button>
      </div>
      {err && <Banner tone="danger" flat>{err}</Banner>}
      {q && (
        <div style={{ display: 'grid', gap: 6, marginTop: 'var(--space-3)' }}>
          {q.options.map((o: any) => (
            <div key={o.key} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', padding: '6px 10px', borderRadius: 'var(--radius-md)',
              border: `1px solid ${o.key === q.best ? 'var(--ok)' : 'var(--line)'}`, opacity: o.ok ? 1 : 0.6 }}>
              <b style={{ fontSize: 14 }}>{o.label}</b>
              {o.key === q.best && <small style={{ color: 'var(--ok)', fontWeight: 700 }}>الأفضل للعميل</small>}
              <span style={{ marginInlineStart: 'auto', fontWeight: 700 }}>{o.ok ? `${ar(o.total)} د.أ` : 'لا ينطبق'}</span>
              {o.reasons?.length > 0 && <small style={{ width: '100%', color: 'var(--ink-3)' }}>{o.reasons.join(' · ')}</small>}
            </div>
          ))}
          {q.notes?.map((n: string, i: number) => <small key={i} style={{ color: q.choose ? 'var(--gold)' : 'var(--ink-3)' }}>ℹ️ {n}</small>)}
        </div>
      )}
    </Card>
  );
}

function CancelReport() {
  const [days, setDays] = useState(30);
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setR(null); api(`/api/reservations/reports/cancellations?days=${days}`).then(setR).catch(e => setErr(e.message)); }, [days]);
  const chans = r ? Array.from(new Set<string>(r.rows.map((x: any) => x.channel))) : [];
  const cell = (c: string, b: string) => r?.rows.find((x: any) => x.channel === c && x.bucket === b);
  const total = r ? r.rows.reduce((s: number, x: any) => s + x.n, 0) : 0;
  return (
    <Card title="تقرير الإلغاءات" aside={
      <select className="wa-input" style={{ width: 'auto', minHeight: 36 }} value={days} onChange={e => setDays(Number(e.target.value))} aria-label="المدّة">
        <option value={7}>آخر ٧ أيّام</option><option value={30}>آخر ٣٠ يوماً</option><option value={90}>آخر ٩٠ يوماً</option>
      </select>}>
      {err ? <Banner tone="danger" flat>{err}</Banner> : !r ? <div style={{ padding: 'var(--space-3)' }}><Loader2 className="animate-spin" aria-hidden="true" /></div> : total === 0 ? (
        <p style={{ color: 'var(--ink-3)', padding: 'var(--space-2) 0', margin: 0 }}>لا إلغاءات مسجّلة في هذه المدّة — يبدأ التسجيل بالسبب والقناة من هذا الإصدار.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ color: 'var(--ink-3)', fontSize: 12 }}>
              <th style={{ textAlign: 'start', padding: '6px 4px' }}>القناة</th>
              {BUCKETS.map(b => <th key={b.k} style={{ padding: '6px 4px', fontWeight: 600 }}>{b.label}</th>)}
            </tr></thead>
            <tbody>{chans.map(c => (
              <tr key={c} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>{CH[c] || c}</td>
                {BUCKETS.map(b => { const x = cell(c, b.k); return (
                  <td key={b.k} style={{ textAlign: 'center', padding: '6px 4px', color: x ? (b.k === 'lt3' || b.k === 'after' ? 'var(--danger)' : 'var(--ink)') : 'var(--ink-3)' }}>
                    {x ? <>{ar(x.n)}<small style={{ color: 'var(--ink-3)' }}> ({ar(x.people)} شخص)</small></> : '—'}
                  </td>); })}
              </tr>))}</tbody>
          </table>
          {r.reasons?.length > 0 && (
            <p style={{ color: 'var(--ink-2)', margin: 'var(--space-3) 0 0', fontSize: 13 }}>
              أكثر الأسباب: {r.reasons.map((x: any) => `${x.reason} (${ar(x.n)})`).join(' · ')}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

export default function BookingRulesPage() {
  const [p, setP] = useState<Policy | null>(null);
  const [d, setD] = useState<Policy | null>(null);
  const [draft, setDraft] = useState<Policy | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api('/api/booking-rules/policy').then(r => { setP(r.policy); setD(r.defaults); setDraft(r.policy); })
      .catch(e => setMsg({ ok: false, text: e.message }));
  }, []);

  const dirty = !!(p && draft && FIELDS.some(f => p[f.k] !== draft[f.k]));
  const save = async () => {
    if (!draft) return;
    setBusy(true); setMsg(null);
    try { const r = await api('/api/booking-rules/policy', { method: 'PUT', body: JSON.stringify(draft) }); setP(r.policy); setDraft(r.policy); setMsg({ ok: true, text: 'حُفظت — تسري على التطبيق والدون فوراً.' }); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="wa" dir="rtl" style={{ background: 'transparent', padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-3)', maxWidth: 760 }}>
      <PageHead title="قواعد الحجز والعروض" sub="ما يحكم الحجز في كلّ القنوات: التطبيق، والدون، والمتابعة، والباب. العروض تنضمّ هنا في المرحلة التالية." />
      {msg && <Banner tone={msg.ok ? 'ok' : 'danger'} flat>{msg.text}</Banner>}
      <Card title="سياسة الحجز" aside="بالساعات">
        {!draft ? <div style={{ padding: 'var(--space-3)' }}><Loader2 className="animate-spin" aria-hidden="true" /></div> : FIELDS.map(f => (
          <Setting key={f.k} title={f.title} hint={`${f.hint}${d ? ` الافتراضيّ ${d[f.k]}.` : ''}`}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number" min={0} max={f.max} step={f.step ?? 0.5} inputMode="decimal"
                className="wa-input" style={{ width: 84, textAlign: 'center' }}
                aria-label={f.title}
                value={draft[f.k]}
                onChange={e => setDraft({ ...draft, [f.k]: Number(e.target.value) })}
              />
              <small style={{ color: 'var(--ink-3)' }}>{f.unit || 'ساعة'}</small>
            </span>
          </Setting>
        ))}
        <div style={{ display: 'flex', gap: 8, padding: 'var(--space-3) 0 0', flexWrap: 'wrap' }}>
          <button type="button" className="wa-btn primary" disabled={!dirty || busy} onClick={save}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />} احفظ
          </button>
          {d && <button type="button" className="wa-btn" disabled={busy} onClick={() => setDraft({ ...d })}><RotateCcw aria-hidden="true" /> القيم الافتراضيّة</button>}
        </div>
      </Card>
      <OfferCatalog />
      <QuoteTester />
      <CancelReport />
    </div>
  );
}
