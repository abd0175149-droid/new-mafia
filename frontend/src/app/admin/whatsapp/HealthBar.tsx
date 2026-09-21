'use client';

// 🩺 شريط صحّة واتساب — حالة ميتا الحيّة + قفل الإرسال + روابط ميتا المباشرة (أدمن فقط)
import { useCallback, useEffect, useState } from 'react';
import { swalConfirm, swalToast } from '@/lib/swal';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;
const TONE: Record<string, { dot: string; text: string; border: string }> = {
  ok: { dot: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-gray-800' },
  degraded: { dot: 'bg-amber-400', text: 'text-amber-300', border: 'border-amber-500/40' },
  blocked: { dot: 'bg-rose-500 animate-pulse', text: 'text-rose-300', border: 'border-rose-500/50' },
  unreachable: { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-300', border: 'border-amber-500/40' },
  unconfigured: { dot: 'bg-gray-500', text: 'text-gray-400', border: 'border-gray-800' },
};
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60e3); return m < 1 ? 'الآن' : `قبل ${m} د`; };

export default function HealthBar({ apiFetch }: { apiFetch: Fetcher }) {
  const [h, setH] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (force = false) => {
    try { setH(await apiFetch(`/api/whatsapp/health${force ? '?force=1' : ''}`)); } catch { /* الشريط غير حاجب */ }
  }, [apiFetch]);
  useEffect(() => { load(); const t = setInterval(() => load(), 120e3); return () => clearInterval(t); }, [load]);

  if (!h) return null;
  const tone = TONE[h.level] || TONE.unconfigured;
  const bad = h.level !== 'ok' || !!h.sendingLocked;

  const resume = async () => {
    if (!(await swalConfirm('رفع قفل الإرسال يدويّاً؟\nافعل ذلك فقط بعد التأكّد من صفحات ميتا أنّ المشكلة انتهت.', { confirmText: 'ارفع القفل', icon: 'warning' }))) return;
    try { await apiFetch('/api/whatsapp/sending-resume', { method: 'POST' }); swalToast('رُفع القفل', 'success'); load(true); } catch (e: any) { swalToast(e.message, 'error'); }
  };

  return (
    <div className={`rounded-xl border ${tone.border} bg-gray-900/70 mb-2 text-xs`} dir="rtl">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2 text-right">
        <span className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} />
        <span className={`font-bold ${tone.text} truncate`}>{h.summary}</span>
        {h.sendingLocked && <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 font-bold whitespace-nowrap">⛔ الإرسال مقفل</span>}
        <span className="mr-auto text-gray-500 whitespace-nowrap">فُحص {ago(h.checkedAt)} · {open ? 'إخفاء' : 'التفاصيل وروابط ميتا'}</span>
      </button>
      {(open || bad) && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-800/70 pt-2">
          {h.sendingLocked && (
            <div className="flex flex-wrap items-center gap-2 text-rose-200">
              <span>سبب القفل: {h.sendingLocked}</span>
              <button onClick={resume} className="px-2 py-1 rounded-lg border border-rose-500/40 text-rose-200 hover:bg-rose-500/10 font-bold">رفع القفل يدويّاً</button>
            </div>
          )}
          {h.issues?.length > 0 && <ul className="text-amber-200 space-y-0.5">{h.issues.map((x: string, i: number) => <li key={i}>⚠️ {x}</li>)}</ul>}
          {open && h.notes?.length > 0 && <ul className="text-gray-500 space-y-0.5">{h.notes.map((x: string, i: number) => <li key={i}>ℹ️ {x} <span className="opacity-70">(معروف — لا يمنع العمل)</span></li>)}</ul>}
          {open && h.phone && (
            <div className="text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
              <span>الرقم: <b className="text-gray-200">{h.phone.status}</b></span>
              <span>الجودة: <b className="text-gray-200">{h.phone.quality}</b></span>
              <span>السقف: <b className="text-gray-200">{String(h.phone.tier || '').replace('TIER_', '')}/يوم</b></span>
              <span>اسم العرض: <b className="text-gray-200">{h.phone.nameStatus}</b></span>
              {h.waba && <><span>مراجعة الحساب: <b className="text-gray-200">{h.waba.review}</b></span><span>توثيق النشاط: <b className="text-gray-200">{h.waba.businessVerification}</b></span></>}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {(h.links || []).map((l: any) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-gray-800 hover:border-amber-500/40 px-2.5 py-1.5">
                <span className="block text-amber-400 font-bold">{l.label} ↗</span>
                <span className="block text-gray-500 leading-snug">{l.hint}</span>
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button disabled={busy} onClick={async () => { setBusy(true); await load(true); setBusy(false); }} className="px-2 py-1 rounded-lg border border-gray-800 text-gray-300 hover:text-white disabled:opacity-50">{busy ? '⏳ يفحص…' : '↻ افحص الآن'}</button>
            <button onClick={async () => { try { const r = await apiFetch('/api/whatsapp/health/test-alert', { method: 'POST' }); swalToast(`أُرسل إشعار تجريبيّ إلى ${r.players} أدمن — افحص هاتفك`, 'info'); } catch (e: any) { swalToast(e.message, 'error'); } }} className="px-2 py-1 rounded-lg border border-gray-800 text-gray-300 hover:text-white">🔔 جرّب التنبيه</button>
            <span className="text-gray-500">يُفحص تلقائيّاً كلّ 10 دقائق، وأيّ تغيّر يصلك إشعاراً على التطبيق.</span>
          </div>
        </div>
      )}
    </div>
  );
}
