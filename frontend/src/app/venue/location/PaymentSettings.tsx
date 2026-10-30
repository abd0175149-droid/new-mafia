'use client';

// ══════════════════════════════════════════════════════
// 💳 طرق الدفع في المكان — نقد · بطاقة · كليك (2026-10-30)
// ما يُفعَّل هنا يُكتب على كلّ ملفٍّ فيه مبلغ مطلوب (الصورة على واتساب، A6، إيصال 80مم)
// وفي نصّ رسالة الفاتورة. كليك وحده بتفاصيله — واللاعب يردّ بصورة الحوالة فتصل لرقم
// واتساب المكان المكتوب تحت.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EM, TX } from '../ember';
import { Icon, Segmented, Switch, Btn, useVenueApi } from '../ui';

interface Pay {
  payCash: boolean; payCard: boolean; payCliq: boolean;
  cliqMethod: 'alias' | 'phone'; cliqValue: string; cliqBank: string; cliqName: string; waPhone: string;
}
const EMPTY: Pay = { payCash: true, payCard: false, payCliq: false, cliqMethod: 'alias', cliqValue: '', cliqBank: '', cliqName: '', waPhone: '' };

const inputStyle: React.CSSProperties = { height: 48, fontSize: 16, background: '#0F1311', color: EM.text, border: `1px solid ${EM.line2}` };

/** نصّ طرق الدفع كما سيقرؤه اللاعب في رسالة واتساب — نفس صياغة الخادم */
function previewText(p: Pay): string {
  const lines: string[] = [];
  const over = [p.payCash ? 'نقداً' : '', p.payCard ? 'بطاقة (فيزا)' : ''].filter(Boolean).join(' أو ');
  if (over) lines.push(`• ${over} عند الكاشير`);
  if (p.payCliq && p.cliqValue.trim()) {
    lines.push(`• كليك — ${p.cliqMethod === 'phone' ? 'رقم الهاتف' : 'اسم المستخدم'}: ${p.cliqValue.trim()}`);
    const d = [p.cliqBank.trim() ? `البنك: ${p.cliqBank.trim()}` : '', p.cliqName.trim() ? `يظهر باسم: ${p.cliqName.trim()}` : ''].filter(Boolean).join(' · ');
    if (d) lines.push(`  ${d}`);
  }
  if (!lines.length) return '';
  let t = `طرق الدفع:\n${lines.join('\n')}`;
  if (p.payCliq && p.cliqValue.trim()) t += '\n\nإذا حوّلت عبر كليك ردّ على هذه الرسالة بصورة الحوالة ليؤكّدها الموظّف.';
  return t;
}

function Row({ title, sub, on, onToggle }: { title: string; sub: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2" style={{ borderTop: `1px solid ${EM.line}` }}>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-extrabold">{title}</div>
        <div className="text-[12.5px]" style={{ color: TX.dim }}>{sub}</div>
      </div>
      <Switch on={on} onChange={onToggle} label={title} />
    </div>
  );
}

export function PaymentSettings() {
  const { get, send } = useVenueApi();
  const getRef = useRef(get);
  getRef.current = get;
  const [p, setP] = useState<Pay>(EMPTY);
  const [saved, setSaved] = useState<Pay>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getRef.current('/api/venue/payment-settings').catch(() => null);
    if (r?.ok) { setP(r.data.payment); setSaved(r.data.payment); setErr(''); }
    else setErr(r?.data?.error || 'تعذّر تحميل طرق الدفع');
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => JSON.stringify(p) !== JSON.stringify(saved), [p, saved]);
  const set = <K extends keyof Pay>(k: K, v: Pay[K]) => { setP(x => ({ ...x, [k]: v })); setOk(''); };

  const save = async () => {
    setSaving(true); setErr(''); setOk('');
    const r = await send('/api/venue/payment-settings', 'PUT', p).catch(() => null);
    setSaving(false);
    if (!r?.ok) { setErr(r?.data?.error || 'تعذّر الحفظ — حاول مرّةً أخرى'); return; }
    setP(r.data.payment); setSaved(r.data.payment); setOk('حُفظت طرق الدفع');
  };

  const preview = previewText(p);

  return (
    <section aria-label="طرق الدفع" className="rounded-[18px] p-4 mb-4" style={{ background: EM.card, border: `1px solid ${EM.line2}` }}>
      <div className="flex items-center gap-2">
        <Icon name="wallet" size={20} color={TX.amberHi} />
        <h2 className="text-[16px] font-extrabold flex-1">طرق الدفع</h2>
      </div>
      <p className="text-[12.5px] mt-1 mb-2 leading-relaxed" style={{ color: TX.dim }}>
        تُكتب على كلّ فاتورة فيها مبلغ مطلوب، وفي رسالة الفاتورة على واتساب. تفاصيل كليك وحدها تظهر للّاعب.
      </p>

      {loading ? (
        <div className="py-6 text-center text-[13px]" style={{ color: TX.dim }}>تحميل…</div>
      ) : (
        <>
          <Row title="نقداً" sub="عند الكاشير" on={p.payCash} onToggle={() => set('payCash', !p.payCash)} />
          <Row title="بطاقة (فيزا)" sub="عند الكاشير" on={p.payCard} onToggle={() => set('payCard', !p.payCard)} />
          <Row title="كليك" sub="تحويل فوريّ — اللاعب يرسل صورة الحوالة" on={p.payCliq} onToggle={() => set('payCliq', !p.payCliq)} />

          {p.payCliq && (
            <div className="flex flex-col gap-3 mt-2 p-3 rounded-[14px]" style={{ background: EM.ink2, border: `1px solid ${EM.line}` }}>
              <div>
                <div className="text-[13px] font-bold mb-1.5" style={{ color: TX.sub }}>طريقة التحويل</div>
                <Segmented label="طريقة التحويل" value={p.cliqMethod} onChange={v => set('cliqMethod', v)}
                  items={[{ value: 'alias', label: 'اسم مستخدم' }, { value: 'phone', label: 'رقم هاتف' }]} />
              </div>
              <label className="block text-[13px] font-bold" style={{ color: TX.sub }}>
                {p.cliqMethod === 'phone' ? 'رقم الهاتف في كليك' : 'اسم المستخدم (Alias)'}
                <input value={p.cliqValue} onChange={e => set('cliqValue', e.target.value)} dir="ltr" autoComplete="off"
                  inputMode={p.cliqMethod === 'phone' ? 'tel' : 'text'} placeholder={p.cliqMethod === 'phone' ? '0791234567' : 'MAFIAHUB'}
                  className="vc-num block w-full mt-1.5 px-3 rounded-xl text-right" style={inputStyle} />
              </label>
              <label className="block text-[13px] font-bold" style={{ color: TX.sub }}>
                اسم البنك
                <input value={p.cliqBank} onChange={e => set('cliqBank', e.target.value)} autoComplete="off" placeholder="مثلاً: البنك العربي"
                  className="block w-full mt-1.5 px-3 rounded-xl" style={inputStyle} />
              </label>
              <label className="block text-[13px] font-bold" style={{ color: TX.sub }}>
                الاسم الذي يظهر عند التحويل
                <input value={p.cliqName} onChange={e => set('cliqName', e.target.value)} autoComplete="off" placeholder="كما يظهر في التطبيق البنكيّ"
                  className="block w-full mt-1.5 px-3 rounded-xl" style={inputStyle} />
                <span className="block mt-1 text-[12px] font-medium" style={{ color: TX.dim }}>اللاعب يتأكّد منه قبل أن يضغط «تحويل».</span>
              </label>
            </div>
          )}

          <label className="block mt-3 text-[13px] font-bold" style={{ color: TX.sub }}>
            رقم واتساب المكان
            <input value={p.waPhone} onChange={e => set('waPhone', e.target.value)} dir="ltr" inputMode="tel" autoComplete="off" placeholder="0791234567"
              className="vc-num block w-full mt-1.5 px-3 rounded-xl text-right" style={inputStyle} />
            <span className="block mt-1 text-[12px] font-medium" style={{ color: TX.dim }}>
              تصله صور حوالات كليك مع اسم اللاعب ورقمه ومقعده والمبلغ — من رقم النادي.
            </span>
          </label>

          {preview && (
            <div className="mt-3">
              <div className="text-[12.5px] font-bold mb-1" style={{ color: TX.dim }}>هكذا تظهر في رسالة الفاتورة</div>
              <div className="rounded-[12px] px-3 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-line"
                style={{ background: '#005C4B', color: '#E9EDEF' }}>{preview}</div>
            </div>
          )}

          {err && <div role="alert" className="mt-3 text-[13px] font-bold" style={{ color: TX.bad }}>{err}</div>}
          {ok && !dirty && <div className="mt-3 text-[13px] font-bold flex items-center gap-1.5" style={{ color: TX.good }}><Icon name="check" size={16} stroke={2.4} />{ok}</div>}

          <Btn kind="primary" full h={50} className="mt-3" disabled={!dirty || saving} onClick={save}>
            {saving ? 'يحفظ…' : dirty ? 'احفظ طرق الدفع' : 'لا تغييرات'}
          </Btn>
        </>
      )}
    </section>
  );
}
