'use client';

// ══════════════════════════════════════════════════════
// 📸 بطاقة «زاوية بلا تصوير» — رئيسيّة الداشبورد (2026-11-01)
// المفتاح يسأل كلّ لاعب عند دخول الغرفة «تقبل التصوير؟» ويُجلس الرافضين في كتلة متّصلة.
// مطفأ افتراضاً. التبديل للأدمن. مرساة الزاوية من محرّر قالب المقاعد، والليدر يغيّرها للّيلة.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const auth = () => ({ Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') : ''}` });

interface Status { enabled: boolean; answers: { yes?: number; no?: number; unanswered?: number } }

export default function PhotoZoneCard() {
  const [s, setS] = useState<Status | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/admin/photo-zone`, { headers: auth() });
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
      const r = await fetch(`${API_URL}/api/admin/photo-zone`, {
        method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !s.enabled }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErr(d.error || (r.status === 403 ? 'التبديل للأدمن فقط' : 'تعذّر التبديل'));
      else setS(d);
    } catch { setErr('خطأ في الاتصال'); }
    setBusy(false);
  };

  if (hidden || !s) return null;
  const a = s.answers || {};

  return (
    <div className="rounded-xl border border-gray-700/50 bg-gray-900/60 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden="true">📸</span>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-bold">زاوية بلا تصوير</p>
          <p className="text-gray-500 text-xs mt-0.5">
            {s.enabled
              ? 'تعمل — كلّ لاعب يُسأل عند دخول الغرفة، والرافضون يجلسون متجاورين ليستثنيهم المصوّر'
              : 'مطفأة — لا سؤال، والتوزيع كما كان'}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={s.enabled} aria-label="زاوية بلا تصوير" onClick={toggle} disabled={busy}
          className="shrink-0 w-14 h-12 flex items-center justify-center disabled:opacity-50">
          <span className="flex items-center rounded-full p-[3px] transition-colors"
            style={{ width: 48, height: 28, background: s.enabled ? '#10b981' : '#4b5563', justifyContent: s.enabled ? 'flex-start' : 'flex-end' }}>
            <span className="rounded-full bg-white shadow" style={{ width: 22, height: 22 }} />
          </span>
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11.5px] font-bold">
        <span className="px-2 py-0.5 rounded-full border border-emerald-500/30 text-emerald-400">يقبلون <span className="tabular-nums">{a.yes ?? 0}</span></span>
        <span className="px-2 py-0.5 rounded-full border border-orange-500/30 text-orange-400">📵 لا يقبلون <span className="tabular-nums">{a.no ?? 0}</span></span>
        <span className="px-2 py-0.5 rounded-full border border-gray-700 text-gray-400">لم يُسألوا بعد <span className="tabular-nums">{a.unanswered ?? 0}</span></span>
      </div>
      <p className="text-xs text-gray-500">
        من لم يُجب يُعامل «بلا تصوير» حتى يجيب، ومن هو تحت ١٨ سنة بلا تصوير دائماً. مرساة الزاوية من «قوالب المقاعد».
      </p>
      {err && <p role="alert" className="text-rose-400 text-xs">{err}</p>}
    </div>
  );
}
