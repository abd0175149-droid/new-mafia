'use client';

// 📉 خصم الغياب في صفحة الفعاليّة: هل تُعدّ غياباً (أو أُعفيت كمناسبةٍ خاصّة)، ومَن خُصم منه بعد انتهائها.
// القاعدة (قرار المالك 2026-10-04): 10 RR عن كلّ فعاليّة يغيبها اللاعب بعد أوّل مشاركةٍ له في مدينتها
// هذا الموسم، بلا دَين — يُحكم حين تُغلق آخر غرفة للفعاليّة.

import { useCallback, useEffect, useState } from 'react';
import { swalConfirm, swalAlert } from '@/lib/swal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

async function absFetch(path: string, opts?: RequestInit): Promise<any> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* بلا جسم */ }
  if (!res.ok) throw new Error(body?.error || `خطأ ${res.status}`);
  return body;
}

export default function AbsenceSection({ activityId }: { activityId: number }) {
  const [data, setData] = useState<{ exempt: boolean; judgedAt: string | null; players: { playerId: number; name: string; taken: number }[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    absFetch(`/api/activities/${activityId}/absence`).then(setData).catch(() => setData(null));
  }, [activityId]);
  useEffect(() => { load(); }, [load]);

  if (!data) return null;
  const deducted = data.players.filter(p => p.taken > 0);
  const total = deducted.reduce((s, p) => s + p.taken, 0);

  const toggle = async () => {
    const next = !data.exempt;
    const ok = await swalConfirm(
      next
        ? 'لن يُخصم من أحدٍ لغيابه عنها، ولن تُعدّ أوّلَ مشاركةٍ لمن لعب فيها. مناسبٌ للمناسبات الخاصّة.'
        : 'ستُعدّ غياباً كأيّ فعاليّة: يُخصم 10 RR ممّن غاب عنها بعد أوّل مشاركةٍ له.',
      { title: next ? 'إعفاء الفعاليّة من الغياب؟' : 'إلغاء الإعفاء؟', confirmText: next ? 'إعفاء' : 'إلغاء الإعفاء', icon: 'question' },
    );
    if (!ok) return;
    setBusy(true);
    try { await absFetch(`/api/activities/${activityId}/absence-exempt`, { method: 'PATCH', body: JSON.stringify({ exempt: next }) }); load(); }
    catch (e: any) { swalAlert(`تعذّر الحفظ: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl overflow-hidden" dir="rtl">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-700/20 transition-colors">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg">📉</span>
          <span className="font-bold text-white">خصم الغياب</span>
          {data.exempt ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/25">مُعفاة — لا تُعدّ غياباً</span>
          ) : data.judgedAt ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/25">
              {deducted.length ? `خُصم ${total} RR من ${deducted.length} لاعباً` : 'حُكم — لا خصم'}
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-500/15 text-gray-400 border border-gray-500/25">يُحكم عند إغلاق آخر غرفة</span>
          )}
        </div>
        <span className="text-gray-500 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 flex flex-col gap-4">
          <p className="text-sm text-gray-400 leading-relaxed">
            كلّ لاعبٍ سبق أن لعب في هذه المدينة هذا الموسم ولم يلعب في هذه الفعاليّة يُخصم منه 10 RR حين تُغلق آخر غرفها،
            بلا دَين: من لا يملك 10 يُؤخذ ما عنده فقط. فعاليّةٌ بعدّة غرف تُحسب مرّة واحدة.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={toggle}
              disabled={busy || (!data.exempt && deducted.length > 0)}
              className="px-4 py-2 rounded-xl text-sm font-bold border border-gray-600 text-gray-200 hover:bg-gray-700/40 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {data.exempt ? 'إلغاء الإعفاء' : 'إعفاء الفعاليّة (مناسبة خاصّة)'}
            </button>
            {!data.exempt && deducted.length > 0 && <span className="text-xs text-gray-500">خُصم الغياب عنها فعلاً، فلا تُعفى الآن.</span>}
          </div>
          {deducted.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-700/40">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-400 text-xs"><th className="px-3 py-2 text-right font-medium">اللاعب</th><th className="px-3 py-2 text-right font-medium">المخصوم</th></tr></thead>
                <tbody>
                  {deducted.map(p => (
                    <tr key={p.playerId} className="border-t border-gray-700/20">
                      <td className="px-3 py-2 text-white">{p.name} <span className="text-gray-500 font-mono text-xs">#{p.playerId}</span></td>
                      <td className="px-3 py-2 text-rose-400 font-mono">−{p.taken}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
