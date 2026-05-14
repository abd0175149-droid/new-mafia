'use client';
import React from 'react';

export type FrameType = 'none' | 'simple' | 'greek' | 'islamic' | 'deco' | 'royal';

interface FrameProps {
  color: string;
  opacity: number;
  strokeWidth: number;
  animate?: boolean;
}

function hexToRgba(hex: string, a: number) {
  const h = hex.startsWith('#') ? hex : '#6b7280';
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const wrapStyle: React.CSSProperties = {
  position: 'absolute', inset: 0, overflow: 'hidden',
  borderRadius: '1rem', pointerEvents: 'none', zIndex: 51,
};

// ═══════════════════════════════════════════════════
// 1. Simple — elegant inner corner brackets
// ═══════════════════════════════════════════════════
function SimpleFrame({ color, opacity, strokeWidth }: FrameProps) {
  const c = hexToRgba(color, opacity);
  const w = Math.max(1, strokeWidth);
  const sz = 18;
  const g = 6; // gap from edge
  return (
    <div style={wrapStyle}>
      {(['tl', 'tr', 'bl', 'br'] as const).map(pos => {
        const isT = pos.includes('t'), isL = pos.includes('l');
        return (
          <div key={pos} style={{
            position: 'absolute',
            top: isT ? g : undefined, bottom: !isT ? g : undefined,
            left: isL ? g : undefined, right: !isL ? g : undefined,
            width: sz, height: sz,
          }}>
            <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} fill="none">
              <path
                d={isT && isL ? `M0,${sz} L0,0 L${sz},0`
                  : isT && !isL ? `M0,0 L${sz},0 L${sz},${sz}`
                  : !isT && isL ? `M0,0 L0,${sz} L${sz},${sz}`
                  : `M0,${sz} L${sz},${sz} L${sz},0`}
                stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 2. Greek Meander — clean key pattern border
// ═══════════════════════════════════════════════════
function GreekFrame({ color, opacity, strokeWidth, animate }: FrameProps) {
  const c = hexToRgba(color, opacity);
  const sw = Math.max(0.8, strokeWidth * 0.7);
  const m = 5; // margin from edge
  // Single meander unit for pattern
  const u = 8; // unit size

  return (
    <div style={wrapStyle}>
      {/* Outer rect */}
      <div style={{ position: 'absolute', inset: m, border: `${sw * 0.5}px solid ${c}`, borderRadius: 8 }} />
      {/* Top meander band */}
      <div style={{
        position: 'absolute', top: m - 1, left: m + 14, right: m + 14, height: u * 1.2,
        overflow: 'hidden',
      }}>
        <svg width="100%" height={u * 1.2} preserveAspectRatio="none">
          <defs>
            <pattern id="meander-h" x="0" y="0" width={u * 2} height={u} patternUnits="userSpaceOnUse">
              <path d={`M0,${u} L0,0 L${u * 2},0 L${u * 2},${u * 0.5} L${u * 0.5},${u * 0.5} L${u * 0.5},${u * 0.5} L${u},${u * 0.5} L${u},${u}`}
                fill="none" stroke={c} strokeWidth={sw} />
            </pattern>
          </defs>
          <rect width="100%" height={u} fill="url(#meander-h)"
            style={{ animation: animate ? 'greek-scroll 6s linear infinite' : undefined }} />
        </svg>
      </div>
      {/* Bottom meander band */}
      <div style={{
        position: 'absolute', bottom: m - 1, left: m + 14, right: m + 14, height: u * 1.2,
        overflow: 'hidden', transform: 'scaleY(-1)',
      }}>
        <svg width="100%" height={u * 1.2} preserveAspectRatio="none">
          <rect width="100%" height={u} fill="url(#meander-h)" />
        </svg>
      </div>
      {/* Corner ornaments */}
      {(['tl', 'tr', 'bl', 'br'] as const).map(pos => {
        const isT = pos.includes('t'), isL = pos.includes('l');
        return (
          <div key={pos} style={{
            position: 'absolute',
            top: isT ? m - 1 : undefined, bottom: !isT ? m - 1 : undefined,
            left: isL ? m - 1 : undefined, right: !isL ? m - 1 : undefined,
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="12" height="12" stroke={c} strokeWidth={sw * 1.2} rx="1" fill="none" />
              <rect x="4" y="4" width="6" height="6" stroke={c} strokeWidth={sw * 0.6} rx="0.5" fill={hexToRgba(color, opacity * 0.1)} />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 3. Islamic Geometric — star pattern at corners + edges
// ═══════════════════════════════════════════════════
function IslamicFrame({ color, opacity, strokeWidth, animate }: FrameProps) {
  const c = hexToRgba(color, opacity);
  const c2 = hexToRgba(color, opacity * 0.15);
  const sw = Math.max(0.6, strokeWidth * 0.6);
  const m = 4;

  // 8-pointed star SVG path centered at (cx, cy) with radius r
  const star8Path = (cx: number, cy: number, r: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI / 8) - Math.PI / 16;
      const rad = i % 2 === 0 ? r : r * 0.38;
      pts.push(`${cx + rad * Math.cos(angle)},${cy + rad * Math.sin(angle)}`);
    }
    return `M${pts.join(' L')} Z`;
  };

  const starR = 8;
  const smallR = 4;

  return (
    <div style={wrapStyle}>
      {/* Outer border */}
      <div style={{ position: 'absolute', inset: m, border: `${sw}px dashed ${c}`, borderRadius: 10 }} />
      {/* Corner stars */}
      {(['tl', 'tr', 'bl', 'br'] as const).map(pos => {
        const isT = pos.includes('t'), isL = pos.includes('l');
        const cx = starR + 2, cy = starR + 2;
        return (
          <div key={pos} style={{
            position: 'absolute',
            top: isT ? m : undefined, bottom: !isT ? m : undefined,
            left: isL ? m : undefined, right: !isL ? m : undefined,
            animation: animate ? 'frame-spin 20s linear infinite' : undefined,
          }}>
            <svg width={starR * 2 + 4} height={starR * 2 + 4} viewBox={`0 0 ${starR * 2 + 4} ${starR * 2 + 4}`}>
              <path d={star8Path(cx, cy, starR)} fill={c2} stroke={c} strokeWidth={sw} />
              <circle cx={cx} cy={cy} r="1.5" fill={c} />
            </svg>
          </div>
        );
      })}
      {/* Center edge stars (top, bottom) */}
      {[{ top: m, left: '50%', transform: 'translateX(-50%)' }, { bottom: m, left: '50%', transform: 'translateX(-50%)' }].map((pos, i) => (
        <div key={i} style={{ position: 'absolute', ...pos }}>
          <svg width={smallR * 2 + 4} height={smallR * 2 + 4} viewBox={`0 0 ${smallR * 2 + 4} ${smallR * 2 + 4}`}>
            <path d={star8Path(smallR + 2, smallR + 2, smallR)} fill={c2} stroke={c} strokeWidth={sw * 0.8} />
          </svg>
        </div>
      ))}
      {/* Center edge stars (left, right) */}
      {[{ top: '50%', left: m, transform: 'translateY(-50%)' }, { top: '50%', right: m, transform: 'translateY(-50%)' }].map((pos, i) => (
        <div key={i} style={{ position: 'absolute', ...pos }}>
          <svg width={smallR * 2 + 4} height={smallR * 2 + 4} viewBox={`0 0 ${smallR * 2 + 4} ${smallR * 2 + 4}`}>
            <path d={star8Path(smallR + 2, smallR + 2, smallR)} fill={c2} stroke={c} strokeWidth={sw * 0.8} />
          </svg>
        </div>
      ))}
      {/* Connecting lines between stars */}
      <div style={{ position: 'absolute', top: m + starR + 1, left: m + starR * 2 + 4, right: m + starR * 2 + 4, height: 0, borderTop: `${sw * 0.5}px solid ${hexToRgba(color, opacity * 0.3)}` }} />
      <div style={{ position: 'absolute', bottom: m + starR + 1, left: m + starR * 2 + 4, right: m + starR * 2 + 4, height: 0, borderTop: `${sw * 0.5}px solid ${hexToRgba(color, opacity * 0.3)}` }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 4. Art Deco — stepped corners + fans + double line
// ═══════════════════════════════════════════════════
function DecoFrame({ color, opacity, strokeWidth, animate }: FrameProps) {
  const c = hexToRgba(color, opacity);
  const c2 = hexToRgba(color, opacity * 0.25);
  const sw = Math.max(0.6, strokeWidth * 0.6);
  const m = 3;

  return (
    <div style={wrapStyle}>
      {/* Double frame */}
      <div style={{ position: 'absolute', inset: m, border: `${sw}px solid ${c}`, borderRadius: 10 }} />
      <div style={{ position: 'absolute', inset: m + 3, border: `${sw * 0.4}px solid ${c2}`, borderRadius: 8 }} />

      {/* Top center fan */}
      <div style={{
        position: 'absolute', top: m, left: '50%', transform: 'translateX(-50%)',
        animation: animate ? 'deco-pulse 3s ease-in-out infinite' : undefined,
      }}>
        <svg width="32" height="16" viewBox="0 0 32 16" fill="none">
          {[...Array(5)].map((_, i) => {
            const a = -50 + i * 25;
            const rad = a * Math.PI / 180;
            return <line key={i} x1="16" y1="14" x2={16 + 12 * Math.sin(rad)} y2={14 - 12 * Math.cos(rad)}
              stroke={c} strokeWidth={sw} strokeLinecap="round" />;
          })}
          <circle cx="16" cy="14" r="2" fill={c} />
        </svg>
      </div>
      {/* Bottom center fan */}
      <div style={{
        position: 'absolute', bottom: m, left: '50%', transform: 'translateX(-50%) scaleY(-1)',
        animation: animate ? 'deco-pulse 3s ease-in-out infinite 1.5s' : undefined,
      }}>
        <svg width="32" height="16" viewBox="0 0 32 16" fill="none">
          {[...Array(5)].map((_, i) => {
            const a = -50 + i * 25;
            const rad = a * Math.PI / 180;
            return <line key={i} x1="16" y1="14" x2={16 + 12 * Math.sin(rad)} y2={14 - 12 * Math.cos(rad)}
              stroke={c} strokeWidth={sw} strokeLinecap="round" />;
          })}
          <circle cx="16" cy="14" r="2" fill={c} />
        </svg>
      </div>

      {/* Stepped corners */}
      {(['tl', 'tr', 'bl', 'br'] as const).map(pos => {
        const isT = pos.includes('t'), isL = pos.includes('l');
        const flipX = isL ? 1 : -1, flipY = isT ? 1 : -1;
        return (
          <div key={pos} style={{
            position: 'absolute',
            top: isT ? m : undefined, bottom: !isT ? m : undefined,
            left: isL ? m : undefined, right: !isL ? m : undefined,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
              style={{ transform: `scale(${flipX},${flipY})` }}>
              {/* Stepped L */}
              <path d="M0,16 L0,8 L4,8 L4,4 L8,4 L8,0 L16,0" stroke={c} strokeWidth={sw * 1.2} fill="none" strokeLinecap="round" />
              <rect x="0" y="0" width="4" height="4" fill={c2} stroke={c} strokeWidth={sw * 0.6} />
            </svg>
          </div>
        );
      })}

      {/* Side accent dots */}
      {[
        { top: '50%', left: m + 1, transform: 'translateY(-50%)' },
        { top: '50%', right: m + 1, transform: 'translateY(-50%)' },
      ].map((pos, i) => (
        <div key={i} style={{ position: 'absolute', width: 3, height: 3, borderRadius: '50%', background: c, ...pos }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 5. Royal Classic — ornate double border + flourish
// ═══════════════════════════════════════════════════
function RoyalFrame({ color, opacity, strokeWidth, animate }: FrameProps) {
  const c = hexToRgba(color, opacity);
  const c2 = hexToRgba(color, opacity * 0.2);
  const sw = Math.max(0.6, strokeWidth * 0.5);
  const m = 3;

  return (
    <div style={wrapStyle}>
      {/* Outer + inner frame */}
      <div style={{ position: 'absolute', inset: m, border: `${sw * 1.2}px solid ${c}`, borderRadius: 12 }} />
      <div style={{ position: 'absolute', inset: m + 4, border: `${sw * 0.5}px solid ${c2}`, borderRadius: 9 }} />

      {/* Top center fleur-de-lis */}
      <div style={{
        position: 'absolute', top: m - 1, left: '50%', transform: 'translateX(-50%)',
        animation: animate ? 'deco-pulse 4s ease-in-out infinite' : undefined,
      }}>
        <svg width="24" height="14" viewBox="0 0 24 14" fill="none">
          <path d="M12,13 C12,6 10,3 7,1 C10,3 12,1 12,1 C12,1 14,3 17,1 C14,3 12,6 12,13Z"
            fill={c2} stroke={c} strokeWidth={sw} />
          <circle cx="12" cy="1" r="1.2" fill={c} />
          <path d="M5,8 Q3,5 6,2" fill="none" stroke={c} strokeWidth={sw * 0.7} strokeLinecap="round" />
          <path d="M19,8 Q21,5 18,2" fill="none" stroke={c} strokeWidth={sw * 0.7} strokeLinecap="round" />
        </svg>
      </div>
      {/* Bottom ornament */}
      <div style={{
        position: 'absolute', bottom: m - 1, left: '50%', transform: 'translateX(-50%) scaleY(-1)',
        animation: animate ? 'deco-pulse 4s ease-in-out infinite 2s' : undefined,
      }}>
        <svg width="24" height="14" viewBox="0 0 24 14" fill="none">
          <path d="M12,13 C12,6 10,3 7,1 C10,3 12,1 12,1 C12,1 14,3 17,1 C14,3 12,6 12,13Z"
            fill={c2} stroke={c} strokeWidth={sw} />
          <circle cx="12" cy="1" r="1.2" fill={c} />
        </svg>
      </div>

      {/* Corner medallions */}
      {(['tl', 'tr', 'bl', 'br'] as const).map(pos => {
        const isT = pos.includes('t'), isL = pos.includes('l');
        return (
          <div key={pos} style={{
            position: 'absolute',
            top: isT ? m + 1 : undefined, bottom: !isT ? m + 1 : undefined,
            left: isL ? m + 1 : undefined, right: !isL ? m + 1 : undefined,
          }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <circle cx="5" cy="5" r="4" fill={c2} stroke={c} strokeWidth={sw} />
              <circle cx="5" cy="5" r="1.5" fill={c} />
            </svg>
          </div>
        );
      })}

      {/* Side scroll dashes */}
      <div style={{ position: 'absolute', top: m, left: m + 18, right: m + 18, borderTop: `${sw * 0.6}px dashed ${hexToRgba(color, opacity * 0.3)}` }} />
      <div style={{ position: 'absolute', bottom: m, left: m + 18, right: m + 18, borderTop: `${sw * 0.6}px dashed ${hexToRgba(color, opacity * 0.3)}` }} />
      <div style={{ position: 'absolute', left: m, top: m + 18, bottom: m + 18, borderLeft: `${sw * 0.6}px dashed ${hexToRgba(color, opacity * 0.3)}` }} />
      <div style={{ position: 'absolute', right: m, top: m + 18, bottom: m + 18, borderLeft: `${sw * 0.6}px dashed ${hexToRgba(color, opacity * 0.3)}` }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════
export function RankFrame({ type, color, opacity, strokeWidth, animate }: { type: FrameType } & FrameProps) {
  const props = { color, opacity, strokeWidth, animate };
  switch (type) {
    case 'simple': return <SimpleFrame {...props} />;
    case 'greek': return <GreekFrame {...props} />;
    case 'islamic': return <IslamicFrame {...props} />;
    case 'deco': return <DecoFrame {...props} />;
    case 'royal': return <RoyalFrame {...props} />;
    default: return null;
  }
}

export const FRAME_OPTIONS: { id: FrameType; label: string; icon: string }[] = [
  { id: 'none', label: 'بدون', icon: '⬜' },
  { id: 'simple', label: 'بسيط', icon: '🔲' },
  { id: 'greek', label: 'يوناني', icon: '🏛️' },
  { id: 'islamic', label: 'إسلامي', icon: '🕌' },
  { id: 'deco', label: 'آرت ديكو', icon: '🎭' },
  { id: 'royal', label: 'ملكي', icon: '⚜️' },
];
