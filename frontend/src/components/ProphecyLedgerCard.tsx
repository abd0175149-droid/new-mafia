'use client';
// ══════════════════════════════════════════════════════
// 📜 سجلّ المخطوطتين (قرار ٢٠) — لكلّ مدينةٍ سطورُها في «مخطوطة الصدق» و«مخطوطة القناع».
// يُعدّ من أوّل مباراةٍ في الموسم، ويبقى سرّاً حتّى الأسبوع الثامن (GET /api/prophecy/ledger).
// لا شيء بلا موسم النبوءة النشط.
// ══════════════════════════════════════════════════════
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function ProphecyLedgerCard() {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    fetch(`${API_URL}/api/prophecy/ledger`).then(r => r.json()).then(j => { if (j?.active) setD(j); }).catch(() => {});
  }, []);
  if (!d) return null;
  return (
    <div className="mb-4 rounded-xl border border-[#C5A059]/30 bg-black/50 p-4" dir="rtl">
      <b className="text-[#C5A059] text-lg" style={{ fontFamily: 'Amiri, serif' }}>📜 سجلّ المخطوطتين</b>
      {d.hidden ? (
        <p className="mt-2 text-[13px] text-[#a89e8d]">كلّ مباراةٍ تكتب سطراً في مخطوطة الصدق أو في مخطوطة القناع. يُكشف السجلّ في الأسبوع الثامن{d.revealAt ? ` (${new Date(d.revealAt).toLocaleDateString('ar')})` : ''}.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {(d.cities || []).map((c: any) => {
            const t = c.truth || 0, m = c.mask || 0, tot = Math.max(1, t + m);
            return (
              <div key={c.cityId ?? 'x'}>
                <div className="flex justify-between text-[13px]"><span className="text-white">{c.cityName || 'مدينة'}</span><span className="text-[#a89e8d] tabular-nums">صدق {t} · قناع {m}</span></div>
                <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-[#2a241c]">
                  <div className="h-full bg-[#63afd9]" style={{ width: `${(t / tot) * 100}%` }} />
                  <div className="h-full bg-[#d0474c]" style={{ width: `${(m / tot) * 100}%` }} />
                </div>
              </div>
            );
          })}
          {!(d.cities || []).length && <p className="text-[13px] text-[#a89e8d]">لم يُكتب سطرٌ بعد.</p>}
        </div>
      )}
    </div>
  );
}
