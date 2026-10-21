'use client';

// ══════════════════════════════════════════════════════
// 📤 نافذة الإرسال المباشر — مشتركة بين الحجوزات وتحليلات اللاعبين والمستكشف
// ══════════════════════════════════════════════════════
// معاينةٌ إلزاميّة قبل أيّ إرسال: كم سيصل، ومن استُبعد ولماذا، وثلاث رسائل بعد التعبئة،
// والمدّة المتوقّعة عبر رقم الأعمال. ثمّ تأكيدٌ، ثمّ تقدّمٌ حيّ مع زرّ إيقاف.
// القوالب ومتغيّراتها لا تتغيّر: الصفحة تملأ النصّ لكلّ مستلم كما كانت (fillTemplate).

import { useEffect, useMemo, useState } from 'react';

export interface DirectItem { phone: string; text: string; name?: string; playerId?: number | null; reservationId?: number | null }
type Origin = 'reservations' | 'analytics' | 'explorer';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
async function api(path: string, opts?: RequestInit) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API ${res.status}`);
  return data;
}

const SKIP_AR: Record<string, string> = {
  optout: 'طلبوا إيقاف الرسائل', recent: 'تلقّوا رسالة فئةٍ مؤخّراً', invalid: 'أرقام غير صالحة',
  duplicate: 'مكرّرون', unreachable: 'لا قناة متاحة الآن', emptyText: 'بلا نصّ', notOnWhatsapp: 'ليس لهم واتساب', noChat: 'لا محادثة لهم مع خطّ الأعمال',
};
const LINE_AR: Record<string, string> = { all: 'الكلّ', warm: 'له محادثة معنا', two_way: 'راسلَنا فقط' };

export default function DirectSendDialog({ origin, items, label, title, onClose, onDone }: {
  origin: Origin;
  items: DirectItem[];
  label?: string;
  title?: string;
  onClose: () => void;
  onDone?: (r: { id: number; queued: number }) => void;
}) {
  const [pv, setPv] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [showList, setShowList] = useState(false);
  const [sending, setSending] = useState(false);
  const [job, setJob] = useState<{ id: number; queued: number } | null>(null);
  const [prog, setProg] = useState<any>(null);
  // 📇 فلتر خطّ الأعمال — undefined ⟵ الافتراض العامّ من الخادم (يظهر في pv.lineFilter)
  const [lineFilter, setLineFilter] = useState<string | undefined>(undefined);

  useEffect(() => {
    // 🔎 المعاينة تفحص «هل لهم واتساب؟» في الخلفيّة — تُعاد كلّ ٤ ثوانٍ حتّى يكتمل الفحص
    let alive = true; let t: any = null;
    const load = () => api('/api/whatsapp/outreach/preview', { method: 'POST', body: JSON.stringify({ origin, items, lineFilter }) })
      .then((r: any) => { if (!alive) return; setPv(r); if (r?.check?.pending > 0) t = setTimeout(load, 4000); })
      .catch((e: any) => { if (alive) setErr(e.message); });
    load();
    return () => { alive = false; if (t) clearTimeout(t); };
  }, [origin, items, lineFilter]);

  useEffect(() => {
    if (!job) return;
    const load = () => api(`/api/whatsapp/outreach/${job.id}`).then(setProg).catch(() => {});
    load(); const t = setInterval(load, 3000); return () => clearInterval(t);
  }, [job]);

  const firstContactPhones = useMemo(() => (pv?.rows || []).filter((r: any) => r.firstContact).map((r: any) => r.phone as string), [pv]);
  const willSend = (pv?.eligible || 0) - excluded.size;
  const toggle = (p: string) => setExcluded(s => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });

  const send = async () => {
    setSending(true); setErr(null);
    try {
      const r = await api('/api/whatsapp/outreach', { method: 'POST', body: JSON.stringify({ origin, items, label, excludePhones: Array.from(excluded), lineFilter: lineFilter ?? pv?.lineFilter }) });
      setJob({ id: r.id, queued: r.queued });
      onDone?.({ id: r.id, queued: r.queued });
    } catch (e: any) { setErr(e.message); }
    finally { setSending(false); }
  };
  const stop = async () => { if (job) await api(`/api/whatsapp/outreach/${job.id}/stop`, { method: 'POST' }).catch(() => {}); };

  const m = prog?.messages;
  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl" onClick={onClose}>
      <div className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-gray-900 border border-gray-800 rounded-t-2xl sm:rounded-2xl p-4 space-y-3 text-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <b className="text-white text-base">📤 {title || 'إرسال عبر رقم الأعمال'}</b>
          <button onClick={onClose} className="mr-auto text-gray-500 hover:text-white text-lg">✕</button>
        </div>

        {err && <div className="text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">⚠️ {err}</div>}
        {!pv && !err && <div className="text-gray-500">⏳ معاينة…</div>}

        {pv && !job && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-2"><div className="text-2xl font-bold text-emerald-300 tabular-nums">{willSend}</div><div className="text-[11px] text-gray-400">سيصلهم</div></div>
              <div className="rounded-xl border border-gray-800 p-2"><div className="text-2xl font-bold text-gray-300 tabular-nums">{pv.total - pv.eligible}</div><div className="text-[11px] text-gray-400">مستبعدون</div></div>
              <div className="rounded-xl border border-gray-800 p-2"><div className="text-2xl font-bold text-gray-300 tabular-nums">{pv.firstContact}</div><div className="text-[11px] text-gray-400">أوّل رسالة منّا</div></div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-gray-500">خطّ الأعمال:</span>
              {(['all', 'warm', 'two_way'] as const).map(k => {
                const active = (lineFilter ?? pv.lineFilter) === k;
                return <button key={k} onClick={() => setLineFilter(k)}
                  className={`px-2.5 py-1 rounded-lg font-bold border ${active ? 'bg-teal-500/15 text-teal-300 border-teal-500/40' : 'border-gray-800 text-gray-400 hover:text-white'}`}>{LINE_AR[k]}</button>;
              })}
              {pv.byLine && <span className="text-gray-500">راسلَنا {pv.byLine.two_way} · له محادثة {pv.byLine.has_chat}{pv.byLine.cold ? ` · بارد ${pv.byLine.cold}` : ''}</span>}
            </div>
            {Object.entries(pv.skipped || {}).some(([, n]) => Number(n) > 0) && (
              <div className="text-xs text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
                {Object.entries(pv.skipped).filter(([, n]) => Number(n) > 0).map(([k, n]) => <span key={k}>• {SKIP_AR[k] || k}: <b className="text-gray-200">{String(n)}</b></span>)}
              </div>
            )}
            {pv.check?.total > 0 && (
              pv.check.pending > 0 ? (
                <div className="text-xs text-teal-200/90 bg-teal-500/5 border border-teal-500/20 rounded-xl px-3 py-2 space-y-1.5">
                  <div>🔎 نفحص من لهم واتساب: {pv.check.done} من {pv.check.total} — ثانيةٌ تقريباً لكلّ رقم</div>
                  <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden"><div className="h-full bg-teal-400" style={{ width: `${Math.round((pv.check.done / Math.max(1, pv.check.total)) * 100)}%` }} /></div>
                </div>
              ) : (
                <div className="text-xs text-emerald-300/90">✓ فُحصت الأرقام كلّها{pv.notOnWhatsapp?.length ? ` — استُبعد ${pv.notOnWhatsapp.length} ليس لهم واتساب` : ' — لكلّهم واتساب'}</div>
              )
            )}
            {pv.notOnWhatsapp?.length > 0 && (
              <details className="text-xs text-gray-400">
                <summary className="cursor-pointer hover:text-white">ليس لهم واتساب ({pv.notOnWhatsapp.length}) — لن يُرسل لهم</summary>
                <div className="mt-1 max-h-32 overflow-y-auto space-y-0.5">
                  {pv.notOnWhatsapp.map((r: any) => <div key={r.phone} className="flex gap-2"><span className="flex-1 truncate">{r.name || '—'}</span><span dir="ltr">{r.phone}</span></div>)}
                </div>
              </details>
            )}
            {pv.firstContact > 0 && (
              <div className="text-xs text-gray-400 bg-gray-950/60 rounded-xl px-3 py-2 flex flex-wrap items-center gap-2">
                <span>ℹ️ {pv.firstContact} منهم لم يراسلوا رقم الأعمال من قبل — للعلم فقط، يُرسل لهم كغيرهم.</span>
                <button onClick={() => setExcluded(s => { const n = new Set(s); const all = firstContactPhones.every((p: string) => n.has(p)); firstContactPhones.forEach((p: string) => all ? n.delete(p) : n.add(p)); return n; })}
                  className="px-2 py-0.5 rounded border border-gray-700 text-gray-300 hover:text-white">
                  {firstContactPhones.every((p: string) => excluded.has(p)) ? 'أعِدهم' : 'استبعدهم من هذه الدفعة'}
                </button>
              </div>
            )}
            {pv.estimate && (
              <div className="text-[12px] text-teal-200/90 bg-teal-500/5 border border-teal-500/20 rounded-xl px-3 py-2 space-y-1">
                <div>⏱ {pv.lane === 'bulk' ? 'رسائل جماعيّة متباعدة (حمايةً من الحظر)' : 'رسائل خدميّة'}
                  {pv.estimate.days > 1 ? `: تكتمل خلال نحو ${pv.estimate.days} أيّام` : ' اليوم'}.</div>
                {pv.estimate.cold > 0 && (
                  <div className="text-amber-200/90">❄️ منهم {pv.estimate.cold} لم يراسلونا على رقم الأعمال من قبل — هؤلاء يُرسل لهم {pv.estimate.coldPerDay} فقط يوميّاً وبتباعدٍ أوسع، لأنّ الإرسال السريع لأشخاصٍ جدد هو أكثر ما يُحظر عليه الرقم.</div>
                )}
              </div>
            )}
            {pv.samples?.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] text-gray-500 font-bold">نماذج بعد التعبئة</div>
                {pv.samples.map((s: any, i: number) => (
                  <div key={i} className="bg-gray-950 border border-gray-800 rounded-xl px-3 py-2">
                    <div className="text-[11px] text-gray-500 mb-1">{s.name || s.phone} · {s.via === 'web' ? '📱 رقم الأعمال' : '☁️ ميتا'}</div>
                    <div className="whitespace-pre-wrap text-gray-100 text-[13px] leading-relaxed">{s.text}</div>
                  </div>
                ))}
              </div>
            )}
            {pv.eligible > 1 && (
              <div>
                <button onClick={() => setShowList(v => !v)} className="text-xs text-gray-400 hover:text-white">{showList ? '▾ إخفاء القائمة' : `▸ عرض القائمة واستبعاد أفراد (${pv.eligible})`}</button>
                {showList && (
                  <div className="max-h-56 overflow-y-auto mt-1 divide-y divide-gray-800/70 border border-gray-800 rounded-xl">
                    {(pv.rows || []).map((r: any) => (
                      <label key={r.phone} className={`flex items-center gap-2 px-2.5 py-1.5 cursor-pointer ${excluded.has(r.phone) ? 'opacity-40' : ''}`}>
                        <input type="checkbox" checked={!excluded.has(r.phone)} onChange={() => toggle(r.phone)} className="accent-amber-500" />
                        <span className="flex-1 truncate text-gray-200">{r.name || r.phone}</span>
                        <span className="text-[11px] text-gray-500" dir="ltr">{r.phone}</span>
                        <span className="text-[11px]">{r.via === 'web' ? '📱' : '☁️'}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button disabled={sending || willSend <= 0 || pv.check?.pending > 0} onClick={send} className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-bold disabled:opacity-40">
                {sending ? '⏳ يرسل…' : pv.check?.pending > 0 ? `⏳ يفحص الأرقام…` : `أرسل إلى ${willSend}`}
              </button>
              {pv.check?.pending > 0 && (
                <button disabled={sending || willSend <= 0} onClick={send} className="px-3 py-2 rounded-xl border border-gray-700 text-gray-300 text-xs disabled:opacity-40" title="من لم يُفحص بعد يُرسل له، وإن لم يكن له واتساب تفشل رسالته وحدها">أرسل دون انتظار الفحص</button>
              )}
              <button onClick={onClose} className="px-3 py-2 rounded-xl border border-gray-800 text-gray-400">إلغاء</button>
            </div>
          </>
        )}

        {job && (
          <div className="space-y-2">
            <div className="text-emerald-300 font-bold">✅ دخلت {job.queued} رسالة الطابور</div>
            {m && (
              <div className="grid grid-cols-5 gap-1.5 text-center text-[11px]">
                {([['queued', '⏱ بالطابور'], ['sent', '✓ أُرسلت'], ['delivered', '✓✓ وصلت'], ['read', '👁 قُرئت'], ['failed', '✗ فشلت']] as const).map(([k, l]) => (
                  <div key={k} className="rounded-lg border border-gray-800 py-1.5"><div className="text-white font-bold tabular-nums text-base">{m[k] ?? 0}</div><div className="text-gray-500">{l}</div></div>
                ))}
              </div>
            )}
            <div className="text-xs text-gray-500">الدفعة في «مركز واتساب ← البثّ ← السجلّ» بتقرير القراءة، وكلّ ردٍّ يصل المركز ويجيب عنه الدون.</div>
            <div className="flex gap-2">
              {m && m.queued > 0 && <button onClick={stop} className="px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-300 border border-rose-500/30 font-bold">⏹ أوقف ما لم يُرسل</button>}
              <button onClick={onClose} className="px-3 py-1.5 rounded-xl border border-gray-800 text-gray-300">إغلاق</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
