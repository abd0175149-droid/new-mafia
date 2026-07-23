'use client';

// ══════════════════════════════════════════════════════
// 🪑 خريطة مقاعد ثنائية الأبعاد (دائري/صفوف) — مشتركة بين محرّر القالب وتخصيص النشاط
// pinnedSet   = تثبيت القالب الدائم (أصفر)
// assignedSet = تخصيص النشاط المؤقّت (بنفسجيّ — يتفوّق بصريّاً)
// ══════════════════════════════════════════════════════

export function gen2D(total: number, layout: string, W: number, H: number) {
  const out: { id: number; x: number; y: number }[] = []; const pad = 40;
  if (layout === 'circle') {
    const cx = W / 2, cy = H / 2, r = Math.min(cx, cy) - pad;
    for (let i = 0; i < total; i++) { const a = (2 * Math.PI * i) / total - Math.PI / 2; out.push({ id: i + 1, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  } else {
    const cols = Math.ceil(Math.sqrt(total * 1.5)), rows = Math.ceil(total / cols);
    const cw = (W - pad * 2) / cols, ch = (H - pad * 2) / rows; let p = 0;
    for (let r = 0; r < rows && p < total; r++) for (let c = 0; c < cols && p < total; c++, p++) out.push({ id: p + 1, x: pad + cw * c + cw / 2, y: pad + ch * r + ch / 2 });
  }
  return out;
}

export default function SeatMap2D({ total, layout, reservedTailCount, pinnedSet, assignedSet, selectedSeat, onSelect }: {
  total: number; layout: string; reservedTailCount: number; pinnedSet: Set<number>; assignedSet?: Set<number>; selectedSeat: number | null; onSelect: (n: number | null) => void;
}) {
  const W = 600, H = 460; const pos = gen2D(total, layout, W, H); const tailStart = total - reservedTailCount + 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-gray-900/70 rounded-2xl border border-gray-700/40" onClick={() => onSelect(null)}>
      {pos.map(p => {
        const assigned = assignedSet?.has(p.id); const pinned = pinnedSet.has(p.id); const isTail = p.id >= tailStart && reservedTailCount > 0; const sel = selectedSeat === p.id;
        const c = sel ? '#3b82f6' : assigned ? '#8b5cf6' : pinned ? '#f59e0b' : isTail ? '#6b7280' : '#10b981';
        return (
          <g key={p.id} transform={`translate(${p.x - 21},${p.y - 21})`} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onSelect(sel ? null : p.id); }}>
            <rect width={42} height={42} rx={12} fill={`${c}26`} stroke={c} strokeWidth={sel ? 2.5 : 1.5} />
            <text x={21} y={21} textAnchor="middle" dominantBaseline="central" fill={c} fontSize={15} fontWeight="bold">{p.id}</text>
            {(assigned || pinned) && <text x={21} y={34} textAnchor="middle" fill={assigned ? '#8b5cf6' : '#f59e0b'} fontSize={8}>{assigned ? '🎯' : '📌'}</text>}
          </g>
        );
      })}
    </svg>
  );
}
