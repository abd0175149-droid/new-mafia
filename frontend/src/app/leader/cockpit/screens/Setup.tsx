'use client';
// ══════════════════════════════════════════════════════
// 🎛️ لبناتٌ مشتركة لخطوات التجهيز الثلاث (الخطّة الموحّدة 2026-11-20 — القرار 1)
//   ١ الطاولة · ٢ اللعبة والكروت · ٣ التوزيع والاعتماد
// الصفحةُ نفسها في GameCards.tsx (الخطوة ٢) وDeal.tsx (الخطوة ٣).
// ══════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { Role, ROLE_NAMES } from '@/lib/constants';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// وجوهُ الكروت من دليل الأدوار العامّ (مخبّأة للجلسة)
let _faces: Record<string, string> | null = null;
export function useRoleFaces(): Record<string, string> {
  const [f, setF] = useState<Record<string, string>>(_faces || {});
  useEffect(() => {
    if (_faces) return;
    fetch(`${API_URL}/api/game-config/roles-guide`).then((r) => r.json()).then((d) => {
      const m: Record<string, string> = {};
      for (const x of Array.isArray(d?.data) ? d.data : []) {
        const u = x?.face?.thumbUrl || x?.face?.url;
        if (x?.id && u) m[x.id] = `${API_URL}${u}`;
      }
      _faces = m; setF(m);
    }).catch(() => {});
  }, []);
  return f;
}

// ══════════ شريط الخطوات ══════════
const STEPS = ['الطاولة', 'اللعبة والكروت', 'التوزيع والاعتماد'];
export function StepRail({ step, onStep }: { step: 1 | 2 | 3; onStep?: (s: number) => void }) {
  return (
    <nav aria-label="خطوات التجهيز" className="grid grid-cols-3 gap-1.5">
      {STEPS.map((t, i) => {
        const k = i + 1;
        const on = k === step, done = k < step;
        const can = !!onStep && k < step;
        return (
          <button key={t} type="button" disabled={!can} onClick={() => can && onStep!(k)} aria-current={on ? 'step' : undefined}
            className="flex flex-col gap-1 text-right disabled:cursor-default">
            <i className={`block h-1 rounded ${on ? 'bg-[#C5A059]' : done ? 'bg-[#C5A059]/55' : 'bg-[#2a241c]'}`} />
            <span className={`text-[12.5px] font-bold whitespace-nowrap ${on ? 'text-[#C5A059]' : 'text-[#9a8f7e]'}`}>{k} {t}</span>
          </button>
        );
      })}
    </nav>
  );
}

const MAFIA = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'WITCH', 'OLDER_BROTHER', 'MAFIA_REGULAR', 'DECEIVER'];
export function teamCounts(roles: string[]) {
  const M = roles.filter((r) => MAFIA.includes(r)).length;
  const N = roles.filter((r) => r === Role.JESTER || r === Role.ASSASSIN).length;
  return { M, C: roles.length - M - N, N };
}

// ══════════ شريط الفرق ══════════
export function TeamBar({ roles, incoming }: { roles: Role[] | string[]; incoming?: { count: number; mafia: number } | null }) {
  const { M, C, N } = teamCounts(roles as string[]);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-[34px] overflow-hidden rounded-[10px] border border-[#2a241c] text-[13.5px] font-extrabold" aria-label={`${M} مافيا · ${C} مدينة · ${N} مستقلّ`}>
        <div className="flex items-center justify-center whitespace-nowrap bg-[#d0474c]/30 text-[#f2a6a9]" style={{ flexGrow: Math.max(M, 1.6) }}>{M} مافيا</div>
        <div className="flex items-center justify-center whitespace-nowrap bg-[#63afd9]/20 text-[#a9d4ee]" style={{ flexGrow: Math.max(C, 1.6) }}>{C} مدينة</div>
        {N > 0 && <div className="flex items-center justify-center whitespace-nowrap bg-[#d9a23a]/25 text-[#f0c879]" style={{ flexGrow: Math.max(N, 1.4) }}>{N} مستقلّ</div>}
      </div>
      {incoming && incoming.count > 0 && (
        <small className="text-[12.5px] text-[#9a8f7e]">🚪 قادم: {incoming.count} لاعباً، منهم {incoming.mafia} مافيا</small>
      )}
    </div>
  );
}

export const roleAr = (r: string) => ROLE_NAMES[r as Role] || r;
