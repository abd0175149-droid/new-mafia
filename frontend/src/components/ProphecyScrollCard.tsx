'use client';
// ══════════════════════════════════════════════════════
// 📜 «مخطوطتك» (قرار ٣٤) — كم مرّةً صدّقتَ الحقيقة، وكم مرّةً صدّقتَ القناع، في موسم النبوءة.
// خاصّةٌ باللاعب لا يراها غيره (GET /api/prophecy/my-scroll)، و«صاحب العين» إن كان الأعلى في مدينته.
// لا شيء بلا موسم النبوءة النشط.
// ══════════════════════════════════════════════════════
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function ProphecyScrollCard({ headers }: { headers: () => Record<string, string> }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    const h = headers();
    if (!h.Authorization) return;
    fetch(`${API_URL}/api/prophecy/my-scroll`, { headers: h }).then(r => r.json()).then(j => { if (j?.active) setD(j); }).catch(() => {});
  }, [headers]);
  if (!d) return null;
  const total = (d.truth || 0) + (d.mask || 0);
  const pct = total ? Math.round((d.truth / total) * 100) : 0;
  return (
    <div className="mt-4 rounded-xl border border-[#C5A059]/30 bg-black/50 p-4" dir="rtl">
      <div className="flex items-center justify-between">
        <b className="text-[#C5A059] text-lg" style={{ fontFamily: 'Amiri, serif' }}>📜 مخطوطتك</b>
        {d.eyeOfCities?.length > 0 && <span className="rounded-full border border-[#C5A059] px-2 py-0.5 text-[11px] text-[#C5A059]">👁️ صاحب العين</span>}
      </div>
      {total === 0 ? (
        <p className="mt-2 text-[13px] text-[#a89e8d]">لم تُكتب فيها علامةٌ بعد — صوّت على صفقة نبوءةٍ أو على مقنَّعٍ لتُكتب.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-[#63afd9]/10 p-2"><b className="block text-2xl text-[#a9d4ee] tabular-nums">{d.truth}</b><span className="text-[11px] text-[#a89e8d]">صدّقتَ الحقيقة</span></div>
            <div className="rounded-lg bg-[#d0474c]/10 p-2"><b className="block text-2xl text-[#f2a6a9] tabular-nums">{d.mask}</b><span className="text-[11px] text-[#a89e8d]">صدّقتَ القناع</span></div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#2a241c]"><div className="h-full bg-[#C5A059]" style={{ width: `${pct}%` }} /></div>
          <p className="mt-1 text-center text-[11px] text-[#8d8271]">لك وحدك — لا يراها غيرك</p>
        </>
      )}
    </div>
  );
}
