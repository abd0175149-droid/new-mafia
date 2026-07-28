'use client';

import React from 'react';

// ══════════════════════════════════════════════════════
// 🪙 شعارات إطارات متجر التشبس — SVG Crests
// شعارات مرسومة بتدرجات وتفاصيل حقيقية تعلو الكارد
// (بديل الإيموجي الصغيرة) — لاحقاً تُدمج كـ primitive
// «emblem» في محرك تأثيرات الرتب.
// ══════════════════════════════════════════════════════

export type EmblemId = 'don' | 'blood' | 'neon' | 'bullet' | 'smoke' | 'deal' | 'crime' | 'champ';

// ── 👑 تاج العرّاب — تاج ذهبي بجواهر وهالة ──────────
function DonCrown({ s }: { s: number }) {
  return (
    <svg width={s} height={(s * 56) / 72} viewBox="0 0 72 56" fill="none">
      <defs>
        <linearGradient id="emb-don-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde68a" /><stop offset="0.5" stopColor="#f59e0b" /><stop offset="1" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id="emb-don-b" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b45309" /><stop offset="0.5" stopColor="#fcd34d" /><stop offset="1" stopColor="#b45309" />
        </linearGradient>
        <radialGradient id="emb-don-r">
          <stop offset="0" stopColor="rgba(253,230,138,0.45)" /><stop offset="1" stopColor="rgba(253,230,138,0)" />
        </radialGradient>
      </defs>
      <circle cx="36" cy="30" r="26" fill="url(#emb-don-r)" />
      <path d="M11,40 L15,19 L25,31 L36,11 L47,31 L57,19 L61,40 Z" fill="url(#emb-don-g)" stroke="#92400e" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="11" y="40" width="50" height="9" rx="2.5" fill="url(#emb-don-b)" stroke="#92400e" strokeWidth="1.2" />
      <circle cx="36" cy="44.5" r="3.2" fill="#dc2626" stroke="#7f1d1d" strokeWidth="0.8" />
      <circle cx="22" cy="44.5" r="2.2" fill="#2563eb" stroke="#1e3a8a" strokeWidth="0.8" />
      <circle cx="50" cy="44.5" r="2.2" fill="#2563eb" stroke="#1e3a8a" strokeWidth="0.8" />
      <circle cx="15" cy="19" r="2.6" fill="#fef3c7" stroke="#d97706" strokeWidth="0.8" />
      <circle cx="36" cy="11" r="3" fill="#fef3c7" stroke="#d97706" strokeWidth="0.8" />
      <circle cx="57" cy="19" r="2.6" fill="#fef3c7" stroke="#d97706" strokeWidth="0.8" />
      <path className="emblem-spark" d="M63,6 l1.6,3.4 3.4,1.6 -3.4,1.6 -1.6,3.4 -1.6,-3.4 -3.4,-1.6 3.4,-1.6 Z" fill="#fef9c3" />
    </svg>
  );
}

// ── 🗡️ قَسَم الدم — خنجر مرصّع بقطرة تنزف ────────────
function BloodDagger({ s }: { s: number }) {
  return (
    <svg width={(s * 40) / 76} height={s} viewBox="0 0 40 76" fill="none">
      <defs>
        <linearGradient id="emb-bl-steel" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f8fafc" /><stop offset="0.5" stopColor="#94a3b8" /><stop offset="1" stopColor="#475569" />
        </linearGradient>
        <linearGradient id="emb-bl-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fcd34d" /><stop offset="1" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="8" r="4.5" fill="url(#emb-bl-gold)" stroke="#78350f" strokeWidth="1" />
      <circle cx="20" cy="8" r="1.7" fill="#dc2626" />
      <rect x="16.5" y="12" width="7" height="14" rx="3" fill="#450a0a" stroke="#7f1d1d" strokeWidth="1" />
      <path d="M16.5,16.5 h7 M16.5,20.5 h7" stroke="#7f1d1d" strokeWidth="0.9" />
      <rect x="7" y="26" width="26" height="5.5" rx="2.5" fill="url(#emb-bl-gold)" stroke="#78350f" strokeWidth="1" />
      <path d="M14.5,31.5 L20,70 L25.5,31.5 Z" fill="url(#emb-bl-steel)" stroke="#64748b" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M20,34 L20,60" stroke="#e2e8f0" strokeWidth="1" opacity="0.7" />
      <ellipse className="emblem-drop" cx="20" cy="72" rx="2.2" ry="2.8" fill="#dc2626" />
    </svg>
  );
}

// ── ⚡ نيون الليل — سبيد نيون داخل حلقة وردية ─────────
function NeonSign({ s }: { s: number }) {
  return (
    <svg className="emblem-flick" width={s} height={s} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="27" stroke="#ec4899" strokeWidth="3" style={{ filter: 'drop-shadow(0 0 5px rgba(236,72,153,0.9))' }} />
      <path
        d="M32,13 C23,25 16,29 16,37 C16,43.5 22.5,46 27.5,42.5 C27,47.5 25,50.5 22,53 L42,53 C39,50.5 37,47.5 36.5,42.5 C41.5,46 48,43.5 48,37 C48,29 41,25 32,13 Z"
        stroke="#22d3ee" strokeWidth="2.6" strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.9))' }}
      />
    </svg>
  );
}

// ── 🎯 رصاص ونحاس — رصاصتان متقاطعتان ────────────────
function BrassBullets({ s }: { s: number }) {
  const bullet = (
    <>
      <rect x="6" y="17" width="28" height="10" rx="2" fill="url(#emb-bu-brass)" stroke="#78350f" strokeWidth="0.9" />
      <path d="M9,17 L9,27 M13,17 L13,27" stroke="#92400e" strokeWidth="0.8" opacity="0.7" />
      <path d="M34,17 L47,22 L34,27 Z" fill="url(#emb-bu-cu)" stroke="#7c2d12" strokeWidth="0.9" strokeLinejoin="round" />
    </>
  );
  return (
    <svg width={s} height={(s * 44) / 64} viewBox="0 0 64 44" fill="none">
      <defs>
        <linearGradient id="emb-bu-brass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde68a" /><stop offset="0.5" stopColor="#d97706" /><stop offset="1" stopColor="#92400e" />
        </linearGradient>
        <linearGradient id="emb-bu-cu" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f59e0b" /><stop offset="1" stopColor="#7c2d12" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="22" r="14" fill="rgba(120,53,15,0.35)" stroke="#78350f" strokeWidth="1" />
      <g transform="rotate(20 32 22)">{bullet}</g>
      <g transform="rotate(-20 32 22)">{bullet}</g>
    </svg>
  );
}

// ── 🚬 دخان الحانة — قبعة فيدورا بدخان ────────────────
function NoirFedora({ s }: { s: number }) {
  return (
    <svg width={s} height={(s * 52) / 72} viewBox="0 0 72 52" fill="none">
      <path className="emblem-smoke-wisp" d="M58,30 C62,24 56,20 60,14 C63,9 59,6 61,2" stroke="#d4d4d8" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.55" />
      <ellipse cx="34" cy="42" rx="30" ry="7" fill="#18181b" stroke="#52525b" strokeWidth="1.2" />
      <path d="M14,42 C14,24 21,13 34,13 C47,13 54,24 54,42" fill="#1c1c1f" stroke="#52525b" strokeWidth="1.2" />
      <path d="M14,36 C20,39 48,39 54,36 L54,42 L14,42 Z" fill="#3f3f46" stroke="#52525b" strokeWidth="0.8" />
      <path d="M17,34 C17,22 23,15 30,14" stroke="#a1a1aa" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" fill="none" />
    </svg>
  );
}

// ── ♠️ طاولة القمار — رقاقة كازينو تدور ────────────────
function CasinoChip({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <g className="emblem-spin" style={{ transformOrigin: '32px 32px' }}>
        <circle cx="32" cy="32" r="28" fill="#065f46" stroke="#022c22" strokeWidth="2" />
        {[0, 60, 120, 180, 240, 300].map(a => (
          <rect key={a} x="29" y="4.5" width="6" height="9" rx="1.5" fill="#ecfdf5" transform={`rotate(${a} 32 32)`} />
        ))}
        <circle cx="32" cy="32" r="17.5" fill="#047857" stroke="#fbbf24" strokeWidth="1.2" strokeDasharray="4 3" />
        <path
          d="M32,22 C27.5,28 24.5,30 24.5,34 C24.5,37 27.5,38.5 30,37 C29.5,39.5 28.5,41 27,42 L37,42 C35.5,41 34.5,39.5 34,37 C36.5,38.5 39.5,37 39.5,34 C39.5,30 36.5,28 32,22 Z"
          fill="#fbbf24"
        />
      </g>
    </svg>
  );
}

// ── 🚧 مسرح الجريمة — رسم الطبشورة وشريط ─────────────
function CrimeChalk({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <rect x="4" y="4" width="56" height="56" rx="9" fill="#131316" stroke="#3f3f46" strokeWidth="1.4" />
      <circle cx="26" cy="21" r="5.5" stroke="#e4e4e7" strokeWidth="1.8" strokeDasharray="4 2.5" strokeLinecap="round" />
      <path
        d="M27,27 C32,29 35,32 36,37 L45,41 M36,37 C35,43 33,46 29,49 L21,55 M29,49 L37,53 M25,27 C20,30 17,34 16,39 L9,42"
        stroke="#e4e4e7" strokeWidth="1.8" strokeDasharray="4 2.5" strokeLinecap="round" fill="none"
      />
      <g transform="rotate(-16 18 12)">
        <rect x="-8" y="8" width="52" height="7.5" fill="#eab308" />
        <path d="M-4,8 l-4,7.5 M6,8 l-4,7.5 M16,8 l-4,7.5 M26,8 l-4,7.5 M36,8 l-4,7.5" stroke="#111" strokeWidth="2.4" />
      </g>
    </svg>
  );
}

// ── 🏆 إكليل البطل — غار بلاتيني بنجمة ────────────────
function ChampLaurel({ s }: { s: number }) {
  const leaves = [
    { x: 15, y: 44, r: -50 }, { x: 12.5, y: 36, r: -30 }, { x: 13.5, y: 27, r: -12 },
    { x: 17.5, y: 19, r: 8 }, { x: 24, y: 13, r: 30 },
  ];
  return (
    <svg width={s} height={(s * 56) / 76} viewBox="0 0 76 56" fill="none">
      <defs>
        <linearGradient id="emb-ch-p" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8fafc" /><stop offset="0.55" stopColor="#cbd5e1" /><stop offset="1" stopColor="#94a3b8" />
        </linearGradient>
      </defs>
      {[false, true].map(mir => (
        <g key={String(mir)} transform={mir ? 'scale(-1,1) translate(-76,0)' : undefined}>
          <path d="M17,48 C12,36 15,22 27,12" stroke="url(#emb-ch-p)" strokeWidth="2" fill="none" strokeLinecap="round" />
          {leaves.map((l, i) => (
            <ellipse key={i} cx={l.x} cy={l.y} rx="2.7" ry="5.6" fill="url(#emb-ch-p)" stroke="#64748b" strokeWidth="0.6" transform={`rotate(${l.r} ${l.x} ${l.y})`} />
          ))}
        </g>
      ))}
      <path
        d="M38,14 l3.4,7.4 8.1,0.9 -6,5.5 1.6,8 -7.1,-4 -7.1,4 1.6,-8 -6,-5.5 8.1,-0.9 Z"
        fill="url(#emb-ch-p)" stroke="#64748b" strokeWidth="1" strokeLinejoin="round"
      />
    </svg>
  );
}

// ── المُصدَّر الرئيسي ──────────────────────────────────
export function ChipsEmblem({ id, size = 60 }: { id: EmblemId; size?: number }) {
  switch (id) {
    case 'don': return <DonCrown s={size} />;
    case 'blood': return <BloodDagger s={size} />;
    case 'neon': return <NeonSign s={size} />;
    case 'bullet': return <BrassBullets s={size} />;
    case 'smoke': return <NoirFedora s={size} />;
    case 'deal': return <CasinoChip s={size} />;
    case 'crime': return <CrimeChalk s={size} />;
    case 'champ': return <ChampLaurel s={size} />;
    default: return null;
  }
}
