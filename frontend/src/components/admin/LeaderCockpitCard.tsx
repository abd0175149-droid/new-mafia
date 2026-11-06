'use client';

// ══════════════════════════════════════════════════════
// 🎛️ بطاقة «قمرة الليدر» — رئيسيّة الداشبورد (2026-11-06)
// المفتاح يحدّد واجهة الليدر لكلّ الغرف وكلّ الأجهزة: القمرة الجديدة للهاتف أو الواجهة القديمة.
// يسري عند فتح صفحة الليدر أو خلال دقيقة على المفتوحة. التبديل للأدمن.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const auth = () => ({ Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') : ''}` });

interface Status { enabled: boolean; by?: string; at?: string | null }

export default function LeaderCockpitCard() {
  const [s, setS] = useState<Status | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/leader-ui`, { headers: auth() });
      if (r.status === 401 || r.status === 403) { setHidden(true); return; }
      const d = await r.json();
      if (d.success) setS(d);
    } catch { /* آخر حالة */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    if (!s || busy) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch(`${API_URL}/api/leader-ui`, {
        method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !s.enabled }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErr(d.error || (r.status === 403 ? 'التبديل للأدمن فقط' : 'تعذّر التبديل'));
      else setS(d);
    } catch { setErr('خطأ في الاتصال'); }
    setBusy(false);
  };

  if (hidden || !s) return null;

  return (
    <div className="rounded-xl border border-gray-700/50 bg-gray-900/60 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden="true">🎛️</span>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-bold">قمرة الليدر</p>
          <p className="text-gray-500 text-xs mt-0.5">
            {s.enabled
              ? 'تعمل — كلّ ليدر في كلّ الغرف يدير اللعبة بالواجهة الجديدة للهاتف'
              : 'مطفأة — الليدر على الواجهة القديمة'}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={s.enabled} aria-label="قمرة الليدر" onClick={toggle} disabled={busy}
          className="shrink-0 w-14 h-12 flex items-center justify-center disabled:opacity-50">
          <span className="flex items-center rounded-full p-[3px] transition-colors"
            style={{ width: 48, height: 28, background: s.enabled ? '#10b981' : '#4b5563', justifyContent: s.enabled ? 'flex-start' : 'flex-end' }}>
            <span className="rounded-full bg-white shadow" style={{ width: 22, height: 22 }} />
          </span>
        </button>
      </div>
      <p className="text-xs text-gray-500">
        يسري على صفحات الليدر خلال دقيقة دون إعادة فتحها. إن تعذّر عرض القمرة على جهازٍ ما تعود تلقائيّاً للواجهة القديمة.
      </p>
      {err && <p role="alert" className="text-rose-400 text-xs">{err}</p>}
    </div>
  );
}
