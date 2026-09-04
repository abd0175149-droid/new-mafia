'use client';

// ══════════════════════════════════════════════════════
// 🗺️ خريطة الطاولة الدائريّة — مشتركة بين شاشة القاعة وكونسول الليدر
// ══════════════════════════════════════════════════════
// تحلّ مشكلتين مقيستين:
//   ① الواصل لا يعرف مكان مقعده: كلّ العروض كانت شبكات بطاقات مرتّبة بالرقم
//      لا تعكس التجاور الحقيقيّ (المقعد الأخير يجاور الأوّل)، ولا تُظهر
//      الشاغر أصلاً — فيسأل الليدر «وين مقعد ١٧؟».
//   ② الليدر لا يرى مَن يجلس بجانب مَن، فيعيد التوزيع بالتخمين ويكتشف
//      الخطأ بالضجيج.
//
// الرسم مشتقٌّ بالكامل من الحالة في كلّ مرّة (لا تصحيح حسابيّ للأرقام)،
// فيتبع أيّ إعادة ترقيم تلقائيّاً — الثابت (أ).
// ══════════════════════════════════════════════════════

export interface RingSeat {
  seat: number;
  name?: string | null;
  state: 'occupied' | 'empty' | 'held' | 'frozen' | 'spectator' | 'pinned' | 'dead';
  isMe?: boolean;
  isSpeaking?: boolean;
}

interface Props {
  maxPlayers: number;
  seats: RingSeat[];
  /** أزواج متجاورة مخالفة — تُرسم خطّاً بينها */
  conflicts?: Array<[number, number]>;
  /** مقاعد الأبواب — تُعلَّم برمز */
  doorSeats?: number[];
  size?: number;
  /** رقمٌ ضخم أسفل الحلقة: أقرب مقعد شاغر */
  showNextEmpty?: boolean;
  onSeatClick?: (seat: number) => void;
  compact?: boolean;
}

const COLORS: Record<RingSeat['state'], { fill: string; stroke: string; text: string }> = {
  occupied:  { fill: '#1c2230', stroke: '#3a4356', text: '#e9ecf3' },
  dead:      { fill: '#14171f', stroke: '#2a3040', text: '#5f6779' },
  empty:     { fill: '#0f1219', stroke: '#C5A059', text: '#C5A059' },
  held:      { fill: '#1a1710', stroke: '#f0a030', text: '#ffc575' },
  frozen:    { fill: '#101820', stroke: '#4c8dff', text: '#9cc0ff' },
  spectator: { fill: '#171226', stroke: '#a78bfa', text: '#cbbcff' },
  pinned:    { fill: '#1c2230', stroke: '#e6b54a', text: '#f3cd6f' },
};

export default function SeatMapRing({
  maxPlayers, seats, conflicts = [], doorSeats = [], size = 420,
  showNextEmpty = false, onSeatClick, compact = false,
}: Props) {
  const n = Math.max(1, maxPlayers);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - (compact ? 26 : 40);
  const seatR = Math.max(9, Math.min(compact ? 15 : 24, (2 * Math.PI * r) / n / 2.5));

  const pos = (seat: number): [number, number] => {
    const a = -Math.PI / 2 + ((seat - 1) / n) * 2 * Math.PI;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };

  const bySeat = new Map<number, RingSeat>();
  for (const s of seats) bySeat.set(s.seat, s);

  const nextEmpty = (() => {
    for (let i = 1; i <= n; i++) {
      const s = bySeat.get(i);
      if (!s || s.state === 'empty') return i;
    }
    return null;
  })();

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height: 'auto', display: 'block' }} aria-label="خريطة المقاعد">
      {/* الطاولة */}
      <circle cx={cx} cy={cy} r={r - seatR - 8} fill="rgba(197,160,89,0.04)" stroke="rgba(197,160,89,0.18)" strokeWidth={1.5} />

      {/* خطوط التعارض بين المتجاورين */}
      {conflicts.map(([a, b], i) => {
        const [x1, y1] = pos(a); const [x2, y2] = pos(b);
        return <line key={`c${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e5484d" strokeWidth={3} strokeLinecap="round" opacity={0.85} />;
      })}

      {Array.from({ length: n }, (_, i) => i + 1).map(seat => {
        const s = bySeat.get(seat) || { seat, state: 'empty' as const };
        const c = COLORS[s.state];
        const [x, y] = pos(seat);
        const isDoor = doorSeats.includes(seat);
        return (
          <g key={seat}
            onClick={onSeatClick ? () => onSeatClick(seat) : undefined}
            style={{ cursor: onSeatClick ? 'pointer' : 'default' }}>
            {s.state === 'empty' && (
              <circle cx={x} cy={y} r={seatR + 4} fill="none" stroke={c.stroke} strokeWidth={1} opacity={0.35}>
                <animate attributeName="opacity" values="0.35;0.05;0.35" dur="2.4s" repeatCount="indefinite" />
              </circle>
            )}
            <circle cx={x} cy={y} r={seatR}
              fill={c.fill} stroke={s.isSpeaking ? '#C5A059' : c.stroke}
              strokeWidth={s.isSpeaking ? 3 : (s.isMe ? 3 : 1.8)}
              strokeDasharray={s.state === 'empty' || s.state === 'spectator' ? '4 3' : undefined} />
            <text x={x} y={y + seatR * 0.33} textAnchor="middle"
              style={{ fontFamily: 'Amiri, serif', fontWeight: 900, fontSize: seatR * 0.95, fill: c.text }}>
              {seat}
            </text>
            {!compact && s.name && (
              <text x={x} y={y + seatR + 13} textAnchor="middle"
                style={{ fontFamily: 'Tajawal, sans-serif', fontSize: 9.5, fill: '#8f98ab' }}>
                {String(s.name).trim().split(/\s+/)[0].slice(0, 9)}
              </text>
            )}
            {isDoor && (
              <text x={x} y={y - seatR - 5} textAnchor="middle" style={{ fontSize: seatR * 0.7 }}>🚪</text>
            )}
          </g>
        );
      })}

      {showNextEmpty && nextEmpty && (
        <>
          <text x={cx} y={cy - 8} textAnchor="middle"
            style={{ fontFamily: 'Tajawal, sans-serif', fontSize: 13, fill: '#8f98ab' }}>
            المقعد الشاغر التالي
          </text>
          <text x={cx} y={cy + 34} textAnchor="middle"
            style={{ fontFamily: 'Amiri, serif', fontWeight: 900, fontSize: 46, fill: '#C5A059' }}>
            {nextEmpty}
          </text>
        </>
      )}
    </svg>
  );
}
