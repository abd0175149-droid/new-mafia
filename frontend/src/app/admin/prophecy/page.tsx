'use client';
// ══════════════════════════════════════════════════════
// 🔮 مقاييس موسم النبوءة — لكلّ كرتٍ قيمته ونطاقه المقبول (من المراجعة)
// GET /api/prophecy/admin/metrics · مباريات التجربة داخلةٌ عمداً (المراجعة الأولى منها)
// نقاط المراجعة: بعد ٣٠ و٨٠ و١٥٠ مباراة.
// ══════════════════════════════════════════════════════
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const token = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
const STATUS: Record<string, { t: string; c: string }> = {
  OK: { t: 'ضمن النطاق', c: 'text-emerald-400' }, LOW: { t: 'أقلّ من النطاق', c: 'text-sky-400' },
  HIGH: { t: 'أعلى من النطاق', c: 'text-amber-400' }, NO_DATA: { t: 'لا بيانات بعد', c: 'text-zinc-500' },
};

export default function ProphecyMetricsPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch(`${API_URL}/api/prophecy/admin/metrics`, { headers: { Authorization: `Bearer ${token() || ''}` } })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `API ${r.status}`); setD(j); })
      .catch((e) => setErr(e.message));
  }, []);
  return (
    <div className="mx-auto max-w-3xl p-4 text-[#efe8da]" dir="rtl">
      <h1 className="mb-1 text-2xl font-black text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>🔮 مقاييس موسم النبوءة</h1>
      <p className="mb-4 text-sm text-zinc-400">كلّ رقمٍ نسبةٌ مئويّة من مباريات فيها الكرت، ومعه نطاقه المقبول. خارج النطاق يعني: راجعه في نقطة المراجعة القادمة.</p>
      {err && <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{err}</p>}
      {!d && !err && <p className="text-zinc-500">يحمّل…</p>}
      {d && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat n={d.matches} l="مباريات نبوءة" />
            <Stat n={d.trialMatches} l="منها تجربة" />
            <Stat n={d.truthLines} l="سطور الصدق" />
            <Stat n={d.maskLines} l="سطور القناع" />
          </div>
          <div className="mb-4 flex flex-wrap gap-2 text-xs">
            {(d.checkpoints || []).map((c: any) => (
              <span key={c.at} className={`rounded-full border px-3 py-1 ${c.reached ? 'border-[#C5A059] text-[#C5A059]' : 'border-zinc-700 text-zinc-500'}`}>مراجعة {c.at} مباراة {c.reached ? '✓' : ''}</span>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-400"><tr><th className="p-2 text-right">المقياس</th><th className="p-2">القيمة</th><th className="p-2">النطاق</th><th className="p-2">العيّنة</th><th className="p-2">الحال</th></tr></thead>
              <tbody>
                {(d.metrics || []).map((m: any) => (
                  <tr key={m.key} className="border-t border-zinc-800">
                    <td className="p-2">{m.label}</td>
                    <td className="p-2 text-center tabular-nums">{m.value == null ? '—' : `${m.value}٪`}</td>
                    <td className="p-2 text-center tabular-nums text-zinc-400">{m.min}–{m.max}٪</td>
                    <td className="p-2 text-center tabular-nums text-zinc-400">{m.n}</td>
                    <td className={`p-2 text-center ${STATUS[m.status]?.c || ''}`}>{STATUS[m.status]?.t || m.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ n, l }: { n: any; l: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-center">
      <b className="block text-2xl tabular-nums text-[#C5A059]">{n ?? 0}</b>
      <span className="text-xs text-zinc-400">{l}</span>
    </div>
  );
}
