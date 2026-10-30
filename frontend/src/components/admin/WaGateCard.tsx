'use client';

// ══════════════════════════════════════════════════════
// 📱 بطاقة «بوّابة رقم الواتساب» — رئيسيّة الداشبورد (2026-10-30)
// المفتاح يُلزم كلّ لاعبٍ رقمه بلا واتساب (أو غير صالح) بربط رقمٍ عليه واتساب قبل دخول التطبيق.
// تعرض صورة الأرقام ومن سيُطلب منه التغيير — راجعها قبل التشغيل. التبديل للأدمن.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const auth = () => ({ Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') : ''}` });

interface Need { id: number; name: string; phone: string; reason: 'none' | 'invalid'; lastActive: string | null }
interface Overview { enabled: boolean; total: number; active: number; none: number; invalid: number; unknown: number; needs: Need[] }

export default function WaGateCard() {
  const [s, setS] = useState<Overview | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/admin/wa-gate`, { headers: auth() });
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
      const r = await fetch(`${API_URL}/api/admin/wa-gate`, {
        method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !s.enabled }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErr(d.error || (r.status === 403 ? 'التبديل للأدمن فقط' : 'تعذّر التبديل'));
      else setS(d);
    } catch { setErr('خطأ في الاتصال'); }
    setBusy(false);
  };

  if (hidden || !s) return null;
  const needs = s.none + s.invalid;
  const recent = s.needs.filter(n => n.lastActive && Date.now() - new Date(n.lastActive).getTime() < 90 * 86400e3).length;

  return (
    <div className="rounded-xl border border-gray-700/50 bg-gray-900/60 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden="true">📱</span>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-bold">بوّابة رقم الواتساب</p>
          <p className="text-gray-500 text-xs mt-0.5">
            {s.enabled ? 'تعمل — من رقمه بلا واتساب لا يدخل التطبيق حتّى يربط رقماً عليه واتساب' : 'مطفأة — راجع الأرقام ثمّ شغّلها'}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={s.enabled} aria-label="بوّابة رقم الواتساب" onClick={toggle} disabled={busy}
          className="shrink-0 w-14 h-12 flex items-center justify-center disabled:opacity-50">
          <span className="flex items-center rounded-full p-[3px] transition-colors"
            style={{ width: 48, height: 28, background: s.enabled ? '#10b981' : '#4b5563', justifyContent: s.enabled ? 'flex-start' : 'flex-end' }}>
            <span className="rounded-full bg-white shadow" style={{ width: 22, height: 22 }} />
          </span>
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11.5px] font-bold">
        <span className="px-2 py-0.5 rounded-full border border-emerald-500/30 text-emerald-400">عليه واتساب <span className="tabular-nums">{s.active}</span></span>
        <span className="px-2 py-0.5 rounded-full border border-rose-500/30 text-rose-400">بلا واتساب <span className="tabular-nums">{s.none}</span></span>
        <span className="px-2 py-0.5 rounded-full border border-amber-500/30 text-amber-400">رقم غير صالح <span className="tabular-nums">{s.invalid}</span></span>
        <span className="px-2 py-0.5 rounded-full border border-gray-700 text-gray-400">لم يُفحص <span className="tabular-nums">{s.unknown}</span></span>
      </div>
      {needs > 0 && (
        <button type="button" onClick={() => setOpen(v => !v)} className="text-right text-xs text-gray-400 hover:text-gray-200">
          {open ? '▾' : '▸'} سيُطلب تغيير الرقم من <b className="text-gray-200 tabular-nums">{needs}</b> لاعباً — منهم <b className="text-gray-200 tabular-nums">{recent}</b> نشطون آخر ٩٠ يوماً
        </button>
      )}
      {open && (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-800">
          {s.needs.slice(0, 200).map(n => (
            <a key={n.id} href={`/admin/players/${n.id}`} className="flex items-center gap-2 px-3 py-2 text-xs border-b border-gray-800 hover:bg-gray-800/50">
              <span className="flex-1 min-w-0 truncate text-gray-200">{n.name}</span>
              <span className="font-mono text-gray-500" dir="ltr">{n.phone}</span>
              <span className={n.reason === 'invalid' ? 'text-amber-400' : 'text-rose-400'}>{n.reason === 'invalid' ? 'غير صالح' : 'بلا واتساب'}</span>
            </a>
          ))}
        </div>
      )}
      {err && <p role="alert" className="text-rose-400 text-xs">{err}</p>}
    </div>
  );
}
