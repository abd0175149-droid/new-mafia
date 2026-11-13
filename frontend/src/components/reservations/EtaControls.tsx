'use client';

// ══════════════════════════════════════════════════════
// ⏱ «متى يصل؟» — ما قاله العميل على الهاتف يُسجَّل بضغطةٍ واحدة
//
// 🔴 الأزرار «بعد كم دقيقة» لا «في أيّ ساعة»: العميل يقول «ربع ساعة» لا «٨:٤٥»،
//    والموظّف واقفٌ على الباب — لا وقت لحساب الساعة. الوقت المحدّد خيارٌ ثانٍ.
// 🔴 هذا يسجّل الموعد المتوقَّع فقط. «وصل» زرٌّ آخر، ولا يضغطه الدون أبداً.
// ══════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import { Clock, Eraser } from 'lucide-react';
import { timeToIso } from './arrival';

const QUICK: ReadonlyArray<readonly [number, string]> = [[10, '10 د'], [20, '20 د'], [30, '30 د'], [60, 'ساعة']];

export default function EtaControls({ rowId, hasEta, title, flash, onSet }: {
  rowId: number;
  hasEta: boolean;
  title?: string;
  /** يُبرز المربّع ويمرّر إليه — حين يُفتح من «حدّد الوقت» في سجلّ الدون */
  flash?: boolean;
  /** ISO أو null للمسح — يعيد true إن حُفظ */
  onSet: (id: number, etaAt: string | null) => Promise<boolean>;
}) {
  const [pressed, setPressed] = useState<number | null>(null);
  const [custom, setCustom] = useState(false);
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { setPressed(null); setCustom(false); setTime(''); }, [rowId]);
  useEffect(() => {
    if (flash) box.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [flash, rowId]);

  const run = async (iso: string | null, mark: number | null) => {
    if (busy) return;
    setBusy(true);
    const ok = await onSet(rowId, iso);
    setBusy(false);
    if (ok) { setPressed(mark); setCustom(false); }
  };

  return (
    <div ref={box} className={`res-etabox${flash ? ' flash' : ''}`}>
      <div className="res-etahead">{title || 'متى يصل؟ اضغط ما قاله لك'}</div>
      <div className="res-etagrid" role="group" aria-label="وقت الوصول بعد">
        {QUICK.map(([m, label]) => (
          <button key={m} type="button" className="wa-btn" disabled={busy} aria-pressed={pressed === m}
            onClick={() => run(new Date(Date.now() + m * 60000).toISOString(), m)}>
            {label}
          </button>
        ))}
      </div>
      <div className="res-etarow">
        <button type="button" className="wa-btn" aria-expanded={custom} onClick={() => setCustom(v => !v)}>
          <Clock />وقت محدّد
        </button>
        <button type="button" className="wa-btn ghost" disabled={busy || !hasEta} onClick={() => run(null, null)}>
          <Eraser />امسح الوقت
        </button>
      </div>
      {custom && (
        <div className="res-etarow">
          <input type="time" className="wa-input" aria-label="وقت الوصول" value={time} onChange={e => setTime(e.target.value)} />
          <button type="button" className="wa-btn" disabled={busy || !time}
            onClick={() => { const iso = timeToIso(time); if (iso) run(iso, -1); }}>
            اضبط الوقت
          </button>
        </div>
      )}
    </div>
  );
}
