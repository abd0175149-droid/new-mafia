'use client';

// ══════════════════════════════════════════════════════
// 🎭 شريط الفرق — كم بقي من كلّ فريق
//
// يُعرض للحيّ وللمُقصى معاً: المُقصى يتابع اللعبة ويحتاج قراءتها، والشريط لا
// يكشف هويّة أحد — الأعداد نفسها على شاشة القاعة أمام الجميع.
//
// 🔴 خانة المستقلّين تظهر **فقط إن كان في اللعبة محايدٌ حيّ**. عرض «٠ مستقلّون»
//    يقول بالنفي «لا مهرّج هنا» — وهي معلومةٌ لا نمنحها مجّاناً.
//
// 🔴 والمحايد يُعدّ بفريقه لا مع المواطنين. كان مخبَّأً داخل عدّادهم فيرى
//    الجميع رقماً كاذباً ويبنون عليه تصويتهم.
// ══════════════════════════════════════════════════════

export interface TeamCounts {
  mafiaAlive: number;
  citizenAlive: number;
  neutralAlive?: number;
}

const CELLS = [
  { key: 'mafia', icon: '🔪', label: 'مافيا', color: '#ef4444', glow: 'rgba(239,68,68,0.55)' },
  { key: 'citizen', icon: '🛡️', label: 'مواطنون', color: '#60a5fa', glow: 'rgba(96,165,250,0.55)' },
  { key: 'neutral', icon: '🎭', label: 'مستقلّون', color: '#a78bfa', glow: 'rgba(167,139,250,0.55)' },
] as const;

export default function TeamBar({ counts, className = '' }: { counts: TeamCounts | null; className?: string }) {
  if (!counts) return null;

  const value: Record<string, number> = {
    mafia: counts.mafiaAlive ?? 0,
    citizen: counts.citizenAlive ?? 0,
    neutral: counts.neutralAlive ?? 0,
  };

  // لا شريط قبل توزيع الأدوار — كلّ الأعداد صفر
  if (value.mafia + value.citizen + value.neutral === 0) return null;

  const cells = CELLS.filter(c => c.key !== 'neutral' || value.neutral > 0);

  return (
    <div className={`flex items-stretch gap-1.5 ${className}`} dir="rtl">
      {cells.map(c => (
        <div key={c.key}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl py-1.5 px-2 border backdrop-blur-sm"
          style={{
            background: 'rgba(0,0,0,0.55)',
            borderColor: `${c.color}44`,
            boxShadow: `inset 0 0 12px ${c.color}14`,
          }}>
          <span className="text-[13px] leading-none shrink-0">{c.icon}</span>
          <b className="text-[17px] font-black leading-none tabular-nums"
            style={{ color: c.color, textShadow: `0 0 10px ${c.glow}` }}>
            {value[c.key]}
          </b>
          <span className="text-[10px] font-bold leading-none whitespace-nowrap" style={{ color: '#8b9490' }}>
            {c.label}
          </span>
        </div>
      ))}
    </div>
  );
}
