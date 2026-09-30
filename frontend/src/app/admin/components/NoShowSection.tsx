'use client';

// ══════════════════════════════════════════════════════
// 🚫 الغياب — قسمٌ في صفحة الفعاليّة
// ══════════════════════════════════════════════════════
// الغياب يثبت فور نهاية الفعاليّة (قرار المالك): من حجز بنفسه (الدون، التطبيق،
// الأدمن عبر البوت) ولم يدخل الغرفة بحسابه ولا برقمه. الإلغاء في آخر ٦ ساعات غياب.
// كلّ غيابٍ يحرمه سعر الدون المبكّر في حجزٍ واحد بعده. «حضر» يلغيه، ويعيد السعر
// المبكّر إلى الحجز الذي استهلكه إن لم يُدفع — وهو التصحيح لمن لعب ضيفاً باسمه فقط.

import { useCallback, useEffect, useState } from 'react';
import { swalConfirm, swalAlert } from '@/lib/swal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
async function nsFetch(path: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...opts?.headers } });
  let body: any = null; try { body = await res.json(); } catch { /* بلا جسم */ }
  if (!res.ok) throw new Error(body?.error || `خطأ ${res.status}`);
  return body;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: 'قائم — حجزه القادم عبر الدون بالسعر العاديّ', cls: 'text-rose-300' },
  consumed: { label: 'استُهلك', cls: 'text-gray-400' },
  waived: { label: 'أُلغي (حضر)', cls: 'text-emerald-300' },
};
const CH: Record<string, string> = { bot: '🤖 الدون', admin: '🔒 الأدمن عبر البوت', app: '📱 التطبيق', staff: '👤 موظّف' };

export default function NoShowSection({ activityId, onChanged }: { activityId: number; onChanged?: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const load = useCallback(async () => {
    try { const d = await nsFetch(`/api/early-price/activity/${activityId}/strikes`); setRows(d.strikes || []); } catch { setRows([]); }
  }, [activityId]);
  useEffect(() => { load(); }, [load]);
  if (!rows || rows.length === 0) return null;

  async function waive(s: any) {
    if (!(await swalConfirm(`تعليم ${s.name || s.phone} «حضر»؟\nيُلغى غيابه${s.status === 'consumed' ? `، ويعود السعر المبكّر إلى حجزه في «${s.consumedIn}» إن لم يُدفع` : ''}.`, { confirmText: 'حضر ✓', icon: 'question' }))) return;
    setBusy(s.id);
    try {
      const r = await nsFetch(`/api/early-price/strikes/${s.id}/waive`, { method: 'POST' });
      swalAlert(r.restored ? '✅ أُلغي الغياب وعاد السعر المبكّر إلى حجزه التالي' : '✅ أُلغي الغياب');
      await load(); onChanged?.();
    } catch (e: any) { swalAlert(`❌ ${e.message}`); }
    setBusy(null);
  }

  const active = rows.filter(r => r.status === 'active').length;
  return (
    <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl overflow-hidden" dir="rtl">
      <div className="px-5 py-4 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg">🚫</span>
          <span className="font-bold text-white">الغياب</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/25">{rows.length}</span>
          {active > 0 && <span className="text-xs text-rose-300">{active} قائم</span>}
        </div>
        <span className="text-[11px] text-gray-500">من حجز بنفسه ولم يدخل الغرفة، أو ألغى في آخر ٦ ساعات · «حضر» يصحّح من لعب ضيفاً باسمه فقط</span>
      </div>
      <div className="px-4 pb-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-gray-500 text-[10.5px]">
            <tr><th className="text-right px-2 py-1.5">الحاجز</th><th className="text-right px-2 py-1.5">القناة</th><th className="text-right px-2 py-1.5">النوع</th><th className="text-right px-2 py-1.5">الحالة</th><th className="px-2 py-1.5"></th></tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id} className="border-t border-gray-700/40">
                <td className="px-2 py-1.5 text-gray-200">{s.name || '—'}{s.people > 1 && <span className="text-gray-500"> (+{s.people - 1})</span>}<span className="block text-[10px] text-gray-500 font-mono" dir="ltr">{s.phone}</span></td>
                <td className="px-2 py-1.5 text-gray-400">{CH[s.channel] || s.channel}</td>
                <td className="px-2 py-1.5 text-gray-300">{s.kind === 'late_cancel' ? 'إلغاء متأخّر' : 'لم يحضر'}</td>
                <td className={`px-2 py-1.5 ${STATUS[s.status]?.cls || ''}`}>{STATUS[s.status]?.label || s.status}{s.status === 'consumed' && s.consumedIn ? ` في «${s.consumedIn}»` : ''}{s.status === 'waived' && s.waivedBy ? ` · ${s.waivedBy}` : ''}</td>
                <td className="px-2 py-1.5 text-left">
                  {s.status !== 'waived' && (
                    <button disabled={busy === s.id} onClick={() => waive(s)} className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/25 disabled:opacity-50">حضر ✓</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
