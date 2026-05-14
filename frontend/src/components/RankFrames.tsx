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
  const r = parseInt(h.slice(1,3),16), g = parseInt(h.slice(3,5),16), b = parseInt(h.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ═══════════════════════════════════════════════════
// 1. Simple — L-shaped corners (legacy)
// ═══════════════════════════════════════════════════
function SimpleFrame({ color, opacity, strokeWidth }: FrameProps) {
  const c = hexToRgba(color, opacity);
  const s = strokeWidth;
  const sz = 14 + s * 2;
  return (
    <>
      {['tl','tr','bl','br'].map(pos => (
        <div key={pos} style={{
          position: 'absolute', width: sz, height: sz,
          borderColor: c, borderStyle: 'solid', borderWidth: 0, zIndex: 51,
          ...(pos === 'tl' ? { top: 2, left: 2, borderTopWidth: s, borderLeftWidth: s, borderTopLeftRadius: 4 } : {}),
          ...(pos === 'tr' ? { top: 2, right: 2, borderTopWidth: s, borderRightWidth: s, borderTopRightRadius: 4 } : {}),
          ...(pos === 'bl' ? { bottom: 2, left: 2, borderBottomWidth: s, borderLeftWidth: s, borderBottomLeftRadius: 4 } : {}),
          ...(pos === 'br' ? { bottom: 2, right: 2, borderBottomWidth: s, borderRightWidth: s, borderBottomRightRadius: 4 } : {}),
        }} />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════
// 2. Greek Meander — repeating key pattern via DIV
// ═══════════════════════════════════════════════════
function GreekFrame({ color, opacity, strokeWidth, animate }: FrameProps) {
  const c = hexToRgba(color, opacity);
  const c2 = hexToRgba(color, opacity * 0.4);
  const sw = Math.max(1, strokeWidth);
  const bandH = 10;

  // Meander repeating SVG tile as data URI
  const tile = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='16' height='10' viewBox='0 0 16 10'><path d='M0,9 L0,0 L12,0 L12,4 L4,4 L4,6 L8,6 L8,2 L16,2 L16,9' fill='none' stroke='${color}' stroke-width='${sw}' opacity='${opacity}'/></svg>`);
  const bg = `url("data:image/svg+xml,${tile}")`;

  return (
    <>
      {/* Top band */}
      <div style={{ position:'absolute', top: -1, left: 14, right: 14, height: bandH, zIndex: 51, backgroundImage: bg, backgroundRepeat: 'repeat-x', backgroundSize: `16px ${bandH}px`, pointerEvents:'none', animation: animate ? 'greek-scroll 4s linear infinite' : undefined }} />
      {/* Bottom band */}
      <div style={{ position:'absolute', bottom: -1, left: 14, right: 14, height: bandH, zIndex: 51, backgroundImage: bg, backgroundRepeat: 'repeat-x', backgroundSize: `16px ${bandH}px`, pointerEvents:'none', transform: 'scaleY(-1)', animation: animate ? 'greek-scroll 4s linear infinite reverse' : undefined }} />
      {/* Left band */}
      <div style={{ position:'absolute', top: 14, left: -1, width: bandH, bottom: 14, zIndex: 51, backgroundImage: bg, backgroundRepeat: 'repeat-y', backgroundSize: `${bandH}px 16px`, pointerEvents:'none', transform: 'rotate(-90deg) scaleY(-1)', transformOrigin: 'top left' }} />
      {/* Right band */}
      <div style={{ position:'absolute', top: 14, right: -1, width: bandH, bottom: 14, zIndex: 51, backgroundImage: bg, backgroundRepeat: 'repeat-y', backgroundSize: `${bandH}px 16px`, pointerEvents:'none', transform: 'rotate(90deg)', transformOrigin: 'top right' }} />
      {/* Corner squares */}
      {[{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}].map((pos,i) => (
        <div key={i} style={{ position:'absolute', width: 12, height: 12, border: `${sw*1.5}px solid ${c}`, borderRadius: 2, zIndex: 52, pointerEvents:'none', ...pos }} />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════
// 3. Islamic Geometric — 8-pointed stars as inline SVG
// ═══════════════════════════════════════════════════
function IslamicFrame({ color, opacity, strokeWidth, animate }: FrameProps) {
  const c = hexToRgba(color, opacity);
  const c2 = hexToRgba(color, opacity * 0.3);
  const sw = Math.max(0.8, strokeWidth * 0.7);

  const star8 = (r: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI / 8) - Math.PI / 16;
      const rad = i % 2 === 0 ? r : r * 0.42;
      pts.push(`${50 + rad * Math.cos(angle) / r * 50}%,${50 + rad * Math.sin(angle) / r * 50}%`);
    }
    return pts.join(' ');
  };

  const starSize = 18;
  const spacing = starSize * 2.5;

  // Star tile as data URI
  const starSvg = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${spacing}' height='${spacing}' viewBox='0 0 ${spacing} ${spacing}'><polygon points='${(() => {
    const pts: string[] = [];
    const cx = spacing/2, cy = spacing/2, r = starSize/2;
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI / 8) - Math.PI / 16;
      const rad = i % 2 === 0 ? r : r * 0.42;
      pts.push(`${cx + rad * Math.cos(angle)},${cy + rad * Math.sin(angle)}`);
    }
    return pts.join(' ');
  })()}' fill='${hexToRgba(color, opacity*0.15)}' stroke='${color}' stroke-width='${sw}' opacity='${opacity}'/><line x1='${spacing/2}' y1='0' x2='${spacing/2}' y2='${spacing/2 - starSize/2}' stroke='${color}' stroke-width='${sw*0.4}' opacity='${opacity*0.5}'/><line x1='${spacing/2}' y1='${spacing/2 + starSize/2}' x2='${spacing/2}' y2='${spacing}' stroke='${color}' stroke-width='${sw*0.4}' opacity='${opacity*0.5}'/><line x1='0' y1='${spacing/2}' x2='${spacing/2 - starSize/2}' y2='${spacing/2}' stroke='${color}' stroke-width='${sw*0.4}' opacity='${opacity*0.5}'/><line x1='${spacing/2 + starSize/2}' y1='${spacing/2}' x2='${spacing}' y2='${spacing/2}' stroke='${color}' stroke-width='${sw*0.4}' opacity='${opacity*0.5}'/></svg>`);
  const bg = `url("data:image/svg+xml,${starSvg}")`;

  return (
    <>
      {/* Top */}
      <div style={{ position:'absolute', top: -2, left: 4, right: 4, height: spacing, zIndex: 51, backgroundImage: bg, backgroundRepeat: 'repeat-x', backgroundSize: `${spacing}px ${spacing}px`, pointerEvents:'none' }} />
      {/* Bottom */}
      <div style={{ position:'absolute', bottom: -2, left: 4, right: 4, height: spacing, zIndex: 51, backgroundImage: bg, backgroundRepeat: 'repeat-x', backgroundSize: `${spacing}px ${spacing}px`, pointerEvents:'none' }} />
      {/* Left */}
      <div style={{ position:'absolute', top: spacing, left: -2, width: spacing, bottom: spacing, zIndex: 51, backgroundImage: bg, backgroundRepeat: 'repeat-y', backgroundSize: `${spacing}px ${spacing}px`, pointerEvents:'none' }} />
      {/* Right */}
      <div style={{ position:'absolute', top: spacing, right: -2, width: spacing, bottom: spacing, zIndex: 51, backgroundImage: bg, backgroundRepeat: 'repeat-y', backgroundSize: `${spacing}px ${spacing}px`, pointerEvents:'none' }} />
      {/* Corner circles */}
      {[{top:-3,left:-3},{top:-3,right:-3},{bottom:-3,left:-3},{bottom:-3,right:-3}].map((pos,i) => (
        <div key={i} style={{
          position:'absolute', width: 10, height: 10, borderRadius: '50%',
          background: c2, border: `${sw}px solid ${c}`, zIndex: 52, pointerEvents:'none',
          animation: animate ? 'frame-spin 12s linear infinite' : undefined, ...pos
        }} />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════
// 4. Art Deco — geometric fans + double lines
// ═══════════════════════════════════════════════════
function DecoFrame({ color, opacity, strokeWidth, animate }: FrameProps) {
  const c = hexToRgba(color, opacity);
  const c2 = hexToRgba(color, opacity * 0.3);
  const sw = Math.max(0.8, strokeWidth * 0.7);

  return (
    <>
      {/* Outer frame */}
      <div style={{ position:'absolute', inset: 1, border: `${sw}px solid ${c}`, borderRadius: 12, zIndex: 51, pointerEvents:'none' }} />
      {/* Inner frame */}
      <div style={{ position:'absolute', inset: 4, border: `${sw*0.5}px solid ${c2}`, borderRadius: 10, zIndex: 51, pointerEvents:'none' }} />
      {/* Top center fan */}
      <div style={{ position:'absolute', top: -6, left: '50%', transform: 'translateX(-50%)', zIndex: 52, pointerEvents:'none', animation: animate ? 'deco-pulse 3s ease-in-out infinite' : undefined }}>
        <svg width="36" height="18" viewBox="0 0 36 18" fill="none">
          {[...Array(7)].map((_,i) => {
            const angle = -75 + i * 25;
            const r = 16;
            const x2 = 18 + r * Math.sin(angle * Math.PI/180);
            const y2 = 16 - r * Math.cos(angle * Math.PI/180);
            return <line key={i} x1="18" y1="16" x2={x2} y2={y2} stroke={c} strokeWidth={sw} />;
          })}
          <circle cx="18" cy="16" r="2.5" fill={c} />
        </svg>
      </div>
      {/* Bottom center fan */}
      <div style={{ position:'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%) scaleY(-1)', zIndex: 52, pointerEvents:'none', animation: animate ? 'deco-pulse 3s ease-in-out infinite 1.5s' : undefined }}>
        <svg width="36" height="18" viewBox="0 0 36 18" fill="none">
          {[...Array(7)].map((_,i) => {
            const angle = -75 + i * 25;
            const r = 16;
            const x2 = 18 + r * Math.sin(angle * Math.PI/180);
            const y2 = 16 - r * Math.cos(angle * Math.PI/180);
            return <line key={i} x1="18" y1="16" x2={x2} y2={y2} stroke={c} strokeWidth={sw} />;
          })}
          <circle cx="18" cy="16" r="2.5" fill={c} />
        </svg>
      </div>
      {/* Corner diamonds */}
      {[{top:4,left:4},{top:4,right:4},{bottom:4,left:4},{bottom:4,right:4}].map((pos,i) => (
        <div key={i} style={{ position:'absolute', width: 10, height: 10, transform: 'rotate(45deg)', background: c2, border: `${sw}px solid ${c}`, zIndex: 52, pointerEvents:'none', ...pos }} />
      ))}
      {/* Side dots */}
      {[{top:'50%',left:0,transform:'translateY(-50%)'},{top:'50%',right:0,transform:'translateY(-50%)'}].map((pos,i) => (
        <div key={i} style={{ position:'absolute', width: 4, height: 4, borderRadius: '50%', background: c, zIndex: 52, pointerEvents:'none', ...pos }} />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════
// 5. Royal Classic — ornate flourishes + double border
// ═══════════════════════════════════════════════════
function RoyalFrame({ color, opacity, strokeWidth, animate }: FrameProps) {
  const c = hexToRgba(color, opacity);
  const c2 = hexToRgba(color, opacity * 0.3);
  const sw = Math.max(0.8, strokeWidth * 0.6);

  return (
    <>
      {/* Double frame */}
      <div style={{ position:'absolute', inset: 0, border: `${sw*1.2}px solid ${c}`, borderRadius: 14, zIndex: 51, pointerEvents:'none' }} />
      <div style={{ position:'absolute', inset: 4, border: `${sw*0.6}px solid ${c2}`, borderRadius: 11, zIndex: 51, pointerEvents:'none' }} />
      {/* Top ornament — fleur-de-lis */}
      <div style={{ position:'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', zIndex: 52, pointerEvents:'none', animation: animate ? 'deco-pulse 4s ease-in-out infinite' : undefined }}>
        <svg width="30" height="20" viewBox="0 0 30 20" fill="none">
          {/* Center leaf */}
          <path d="M15,18 Q15,4 15,2 Q12,8 8,12 Q14,10 15,18 Z" fill={c2} stroke={c} strokeWidth={sw} />
          <path d="M15,18 Q15,4 15,2 Q18,8 22,12 Q16,10 15,18 Z" fill={c2} stroke={c} strokeWidth={sw} />
          <circle cx="15" cy="2" r="1.5" fill={c} />
          {/* Side curves */}
          <path d="M6,16 Q2,10 8,6" fill="none" stroke={c} strokeWidth={sw*0.8} />
          <path d="M24,16 Q28,10 22,6" fill="none" stroke={c} strokeWidth={sw*0.8} />
        </svg>
      </div>
      {/* Bottom ornament */}
      <div style={{ position:'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%) scaleY(-1)', zIndex: 52, pointerEvents:'none', animation: animate ? 'deco-pulse 4s ease-in-out infinite 2s' : undefined }}>
        <svg width="30" height="20" viewBox="0 0 30 20" fill="none">
          <path d="M15,18 Q15,4 15,2 Q12,8 8,12 Q14,10 15,18 Z" fill={c2} stroke={c} strokeWidth={sw} />
          <path d="M15,18 Q15,4 15,2 Q18,8 22,12 Q16,10 15,18 Z" fill={c2} stroke={c} strokeWidth={sw} />
          <circle cx="15" cy="2" r="1.5" fill={c} />
        </svg>
      </div>
      {/* Corner ornaments */}
      {[{top:2,left:2},{top:2,right:2},{bottom:2,left:2},{bottom:2,right:2}].map((pos,i) => (
        <div key={i} style={{ position:'absolute', zIndex: 52, pointerEvents:'none', ...pos }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="4" fill={c2} stroke={c} strokeWidth={sw} />
            <circle cx="6" cy="6" r="1.5" fill={c} />
          </svg>
        </div>
      ))}
      {/* Side dashes */}
      <div style={{ position:'absolute', top: 0, left: 20, right: 20, height: 0, borderTop: `${sw*0.8}px dashed ${hexToRgba(color, opacity*0.4)}`, zIndex: 51, pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom: 0, left: 20, right: 20, height: 0, borderTop: `${sw*0.8}px dashed ${hexToRgba(color, opacity*0.4)}`, zIndex: 51, pointerEvents:'none' }} />
    </>
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
