'use client';

// ══════════════════════════════════════════════════════
// 📱 بطاقة «شاشة اللاعب الجديدة» — رئيسيّة الداشبورد (2026-11-06)
// المفتاح يحدّد واجهة هاتف اللاعب داخل الغرفة لكلّ الغرف: الجديدة (زرّ «اللعبة»
// في منتصف الشريط، شاشات متطابقة لكلّ الأدوار) أو الحاليّة. يسري خلال دقيقة.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const auth = () => ({ Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') : ''}` });

interface Status { enabled: boolean; by?: string; at?: string | null }

export default function PlayerUiCard() {
  const [s, setS] = useState<Status | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/player-ui/admin`, { headers: auth() });
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
      const r = await fetch(`${API_URL}/api/player-ui`, {
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
        <span className="text-xl" aria-hidden="true">📱</span>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-bold">شاشة اللاعب الجديدة</p>
          <p className="text-gray-500 text-xs mt-0.5">
            {s.enabled
              ? 'تعمل — هواتف اللاعبين داخل الغرفة على الواجهة الجديدة'
              : 'مطفأة — اللاعبون على الواجهة الحاليّة'}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={s.enabled} aria-label="شاشة اللاعب الجديدة" onClick={toggle} disabled={busy}
          className="shrink-0 w-14 h-12 flex items-center justify-center disabled:opacity-50">
          <span className="flex items-center rounded-full p-[3px] transition-colors"
            style={{ width: 48, height: 28, background: s.enabled ? '#10b981' : '#4b5563', justifyContent: s.enabled ? 'flex-start' : 'flex-end' }}>
            <span className="rounded-full bg-white shadow" style={{ width: 22, height: 22 }} />
          </span>
        </button>
      </div>
      <p className="text-xs text-gray-500">
        يسري على هواتف اللاعبين خلال دقيقة. الأفضل تبديله بين الألعاب لا أثناءها. إن تعذّر عرض الواجهة الجديدة على هاتفٍ ما يعود تلقائيّاً للحاليّة.
      </p>
      {err && <p role="alert" className="text-rose-400 text-xs">{err}</p>}
    </div>
  );
}
