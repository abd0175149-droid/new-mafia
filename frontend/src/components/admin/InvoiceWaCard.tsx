'use client';

// ══════════════════════════════════════════════════════
// 🧾 بطاقة «إرسال الفواتير عبر واتساب» — رئيسيّة الداشبورد (2026-10-30)
// مفتاحٌ واحد يشغّل ويطفئ كلّ شيء فوراً: الفواتير عند «وُصِّل»، الملفّ التلقائيّ بعد ٩٠ دقيقة،
// ختم «القضيّة مُغلقة»، وتحويل صور الحوالات للمكان. الإطفاء يُلغي ما كان ينتظر.
// التبديل للأدمن؛ المدير يرى الحالة فقط (الخادم يفرض ذلك).
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const auth = () => ({ Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') : ''}` });

interface Status {
  enabled: boolean; by: string; at: string | null;
  channels: { web: boolean; cloud: boolean };
  tonight: { invoices?: number; stamps?: number; transfers?: number; failed?: number };
}

export default function InvoiceWaCard() {
  const [s, setS] = useState<Status | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/admin/invoice-wa`, { headers: auth() });
      if (r.status === 401 || r.status === 403) { setHidden(true); return; }
      const d = await r.json();
      if (d.success) setS(d);
    } catch { /* تبقى البطاقة بآخر حالة */ }
  }, []);
  useEffect(() => { load(); const iv = setInterval(load, 60_000); return () => clearInterval(iv); }, [load]);

  const toggle = async () => {
    if (!s || busy) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch(`${API_URL}/api/admin/invoice-wa`, {
        method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !s.enabled }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErr(d.error || (r.status === 403 ? 'التبديل للأدمن فقط' : 'تعذّر التبديل'));
      else setS(d);
    } catch { setErr('خطأ في الاتصال'); }
    setBusy(false);
  };

  if (hidden || !s) return null;
  const t = s.tonight || {};
  const noChannel = !s.channels.web && !s.channels.cloud;

  return (
    <div className="rounded-xl border border-gray-700/50 bg-gray-900/60 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden="true">🧾</span>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-bold">إرسال الفواتير عبر واتساب</p>
          <p className="text-gray-500 text-xs mt-0.5">
            {s.enabled ? 'يعمل في كلّ الأماكن — فاتورة عند كلّ توصيل، وختم بعد التحصيل' : 'مطفأ في الأماكن الحقيقيّة — والبوت يجيب عن الحساب نصّاً'}
            <span className="block text-gray-600">موقع الاختبار يعمل دائماً، ويصل حسابات الموظّفين فقط — للتجربة قبل التشغيل.</span>
            {s.by && <span className="text-gray-600"> · آخر تبديل: {s.by}</span>}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={s.enabled} aria-label="إرسال الفواتير عبر واتساب" onClick={toggle} disabled={busy}
          className="shrink-0 w-14 h-12 flex items-center justify-center disabled:opacity-50">
          <span className="flex items-center rounded-full p-[3px] transition-colors"
            style={{ width: 48, height: 28, background: s.enabled ? '#10b981' : '#4b5563', justifyContent: s.enabled ? 'flex-start' : 'flex-end' }}>
            <span className="rounded-full bg-white shadow" style={{ width: 22, height: 22 }} />
          </span>
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11.5px] font-bold">
        <span className={`px-2 py-0.5 rounded-full border ${s.channels.web ? 'border-emerald-500/30 text-emerald-400' : 'border-rose-500/30 text-rose-400'}`}>
          رقم الأعمال {s.channels.web ? 'متّصل' : 'غير متّصل'}
        </span>
        <span className={`px-2 py-0.5 rounded-full border ${s.channels.cloud ? 'border-emerald-500/30 text-emerald-400' : 'border-gray-600 text-gray-500'}`}>
          ميتا {s.channels.cloud ? 'متاحة' : 'غير مهيّأة'}
        </span>
        <span className="px-2 py-0.5 rounded-full border border-gray-700 text-gray-400">
          آخر ١٤ ساعة: <span className="tabular-nums text-gray-200">{t.invoices ?? 0}</span> فاتورة · <span className="tabular-nums text-gray-200">{t.stamps ?? 0}</span> ختم · <span className="tabular-nums text-gray-200">{t.transfers ?? 0}</span> حوالة
          {(t.failed ?? 0) > 0 && <> · <span className="tabular-nums text-rose-400">{t.failed}</span> لم تُرسل</>}
        </span>
      </div>
      {s.enabled && noChannel && <p className="text-rose-400 text-xs">لا قناة متّصلة الآن — الفواتير تنتظر وتظهر في كونسول المكان «لم تُرسل».</p>}
      {err && <p role="alert" className="text-rose-400 text-xs">{err}</p>}
    </div>
  );
}
