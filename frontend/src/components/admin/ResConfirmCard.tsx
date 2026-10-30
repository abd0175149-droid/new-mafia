'use client';

// ══════════════════════════════════════════════════════
// 📋 بطاقة «رسالة تثبيت الحجز» — رئيسيّة الداشبورد (2026-10-30)
// المفتاح يرسل قالب «متابعة الحجوزات» تلقائيّاً من رقم الأعمال لكلّ حجزٍ يُثبَّت، أيّاً كان طريقه.
// مطفأ افتراضاً، وموقع الاختبار يعمل دائماً لحسابات الموظّفين — جرّبه هناك ثمّ شغّله. التبديل للأدمن.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const auth = () => ({ Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') : ''}` });

interface Status { enabled: boolean; last24h: { sent?: number; pending?: number; failed?: number; skipped?: number }; templateIsDefault: boolean }

export default function ResConfirmCard() {
  const [s, setS] = useState<Status | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/admin/res-confirm`, { headers: auth() });
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
      const r = await fetch(`${API_URL}/api/admin/res-confirm`, {
        method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !s.enabled }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErr(d.error || (r.status === 403 ? 'التبديل للأدمن فقط' : 'تعذّر التبديل'));
      else setS(d);
    } catch { setErr('خطأ في الاتصال'); }
    setBusy(false);
  };

  if (hidden || !s) return null;
  const t = s.last24h || {};

  return (
    <div className="rounded-xl border border-gray-700/50 bg-gray-900/60 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden="true">📋</span>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-bold">رسالة تثبيت الحجز</p>
          <p className="text-gray-500 text-xs mt-0.5">
            {s.enabled
              ? 'تعمل — كلّ حجزٍ يُثبَّت تصله رسالة القالب من رقم الأعمال، مرّةً واحدة'
              : 'مطفأة — الإرسال يدويّ من «متابعة الحجوزات». موقع الاختبار يعمل لحسابات الموظّفين'}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={s.enabled} aria-label="رسالة تثبيت الحجز" onClick={toggle} disabled={busy}
          className="shrink-0 w-14 h-12 flex items-center justify-center disabled:opacity-50">
          <span className="flex items-center rounded-full p-[3px] transition-colors"
            style={{ width: 48, height: 28, background: s.enabled ? '#10b981' : '#4b5563', justifyContent: s.enabled ? 'flex-start' : 'flex-end' }}>
            <span className="rounded-full bg-white shadow" style={{ width: 22, height: 22 }} />
          </span>
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11.5px] font-bold">
        <span className="px-2 py-0.5 rounded-full border border-emerald-500/30 text-emerald-400">أُرسلت <span className="tabular-nums">{t.sent ?? 0}</span></span>
        <span className="px-2 py-0.5 rounded-full border border-sky-500/30 text-sky-400">مجدولة <span className="tabular-nums">{t.pending ?? 0}</span></span>
        <span className="px-2 py-0.5 rounded-full border border-rose-500/30 text-rose-400">تعذّرت <span className="tabular-nums">{t.failed ?? 0}</span></span>
        <span className="px-2 py-0.5 rounded-full border border-gray-700 text-gray-400">تُخطّيت <span className="tabular-nums">{t.skipped ?? 0}</span></span>
        <span className="text-gray-600 font-normal">آخر ٢٤ ساعة</span>
      </div>
      <a href="/admin/reservations" className="text-xs text-gray-400 hover:text-gray-200">
        القالب يُعدَّل من «متابعة الحجوزات ← المزيد ← قالب رسالة التأكيد»{s.templateIsDefault ? '' : ' (معدَّل)'}
      </a>
      {err && <p role="alert" className="text-rose-400 text-xs">{err}</p>}
    </div>
  );
}
