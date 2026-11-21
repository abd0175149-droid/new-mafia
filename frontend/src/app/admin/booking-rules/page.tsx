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

interface Policy { selfCancelHours: number; changeHours: number; bookableGraceHours: number; lateCancelHours: number }
const FIELDS: Array<{ k: keyof Policy; title: string; hint: string; max: number }> = [
  { k: 'selfCancelHours', title: 'الإلغاء الذاتيّ حتّى', hint: 'من التطبيق والدون معاً (ق٢). بعدها يصل الطلب للإدارة. المدفوع يُلغى عبر الإدارة دائماً.', max: 72 },
  { k: 'changeHours', title: 'تعديل العدد بنفسه حتّى', hint: 'زيادة الأشخاص أو إنقاصهم من الدون. بعدها يتحوّل الطلب للإدارة.', max: 72 },
  { k: 'bookableGraceHours', title: 'الحجز بعد موعد البدء حتّى', hint: 'ساعاتٌ بعد البدء ما زال الحجز فيها مقبولاً. والغرفة المفتوحة تُحجز دائماً.', max: 24 },
  { k: 'lateCancelHours', title: 'الإلغاء المتأخّر يُحسب غياباً في آخر', hint: 'من يلغي في هذه الساعات قبل اللعبة يُحرم من السعر المبكّر في حجزه التالي.', max: 72 },
];

// 📊 تقرير الإلغاءات (م٣): متى يلغي الناس ومن أيّ قناة — منه تُضبط مهلة الإلغاء
const BUCKETS: Array<{ k: string; label: string }> = [
  { k: 'gt24', label: 'قبل يومٍ فأكثر' }, { k: 'h6_24', label: '٦–٢٤ ساعة' }, { k: 'h3_6', label: '٣–٦ ساعات' },
  { k: 'lt3', label: 'أقلّ من ٣' }, { k: 'after', label: 'بعد البدء' },
];
const CH: Record<string, string> = { app: '📱 التطبيق', bot: '🤖 الدون', botadmin: '🔒 أدمن البوت', staff: '👤 الإدارة', door: '🚪 الباب', group: '👥 مجموعة', system: '⚙️ النظام' };
const ar = (n: number) => String(n).replace(/\d/g, (x) => '٠١٢٣٤٥٦٧٨٩'[Number(x)]);

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
                type="number" min={0} max={f.max} step={0.5} inputMode="decimal"
                className="wa-input" style={{ width: 84, textAlign: 'center' }}
                aria-label={f.title}
                value={draft[f.k]}
                onChange={e => setDraft({ ...draft, [f.k]: Number(e.target.value) })}
              />
              <small style={{ color: 'var(--ink-3)' }}>ساعة</small>
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
      <CancelReport />
    </div>
  );
}
