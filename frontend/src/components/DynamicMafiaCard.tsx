'use client';

import React, { useState } from 'react';
import './RankEffects.css';
import { useGameConfig, type CardTemplateDef, type RoleDef } from '@/hooks/useGameConfig';
import { Role, ROLE_NAMES, isMafiaRole } from '@/lib/constants';
import {
  User, HeartPulse, Shield, Syringe, Crosshair,
  BadgeAlert, Skull, Crown, Drama, Scissors,
  Flame, Ghost, Eye, Zap, Sword, Heart,
  type LucideIcon,
} from 'lucide-react';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || '';

// ══════════════════════════════════════════════════════
// 🎴 DynamicMafiaCard — كارد ديناميكي يقرأ التصميم من DB
// يدعم الكروت القديمة + الكروت المخصصة الجديدة
// ══════════════════════════════════════════════════════

// ── قاموس أيقونات Lucide ──────────────────────

const LUCIDE_ICONS: Record<string, LucideIcon> = {
  User, HeartPulse, Shield, Syringe, Crosshair,
  BadgeAlert, Skull, Crown, Drama, Scissors,
  Flame, Ghost, Eye, Zap, Sword, Heart,
};

function getLucideIcon(name: string): LucideIcon {
  return LUCIDE_ICONS[name] || User;
}

// ── Props ──────────────────────────────────────

// ── Rank Visual Config ─────────────────────────
type RankTier = 'INFORMANT' | 'SOLDIER' | 'CAPO' | 'UNDERBOSS' | 'GODFATHER';
const RANK_BADGE_CONFIG: Record<RankTier, { emoji: string; label: string } | null> = {
  INFORMANT: null,
  SOLDIER: { emoji: '⚔️', label: 'جندي' },
  CAPO: { emoji: '🎖️', label: 'كابو' },
  UNDERBOSS: { emoji: '👑', label: 'نائب' },
  GODFATHER: { emoji: '👑', label: 'العراب' },
};

export interface DynamicMafiaCardProps {
  playerNumber: number;
  playerName: string;
  role: string | null;
  isFlipped?: boolean;
  onFlip?: () => void;
  votes?: number;
  onVote?: (e: React.MouseEvent) => void;
  showVoting?: boolean;
  isAlive?: boolean;
  isSilenced?: boolean;
  gender?: 'MALE' | 'FEMALE';
  size?: 'sm' | 'md' | 'lg' | 'fluid';
  flippable?: boolean;
  className?: string;
  avatarUrl?: string | null;
  rankTier?: string;
  /** تجاوز: استخدم القالب القديم (MafiaCard) بدلاً من DB */
  forceClassic?: boolean;
}

// ── Component ──────────────────────────────────

export default function DynamicMafiaCard({
  playerNumber,
  playerName,
  role,
  isFlipped: controlledFlip,
  onFlip,
  votes = 0,
  onVote,
  showVoting = false,
  isAlive = true,
  isSilenced = false,
  gender = 'MALE',
  size = 'md',
  flippable = true,
  className = '',
  avatarUrl = null,
  rankTier = 'INFORMANT',
  forceClassic = false,
}: DynamicMafiaCardProps) {
  const tier = (rankTier || 'INFORMANT') as RankTier;
  const rankBadge = RANK_BADGE_CONFIG[tier];
  const hasRankEffects = tier !== 'INFORMANT';
  const { getRoleById, getCardForRole, getRoleName, isDynamicMafia, isDynamicNeutral, loading } = useGameConfig();
  const [internalFlip, setInternalFlip] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const isFlipped = controlledFlip !== undefined ? controlledFlip : internalFlip;

  // بناء URL كامل للأفاتار
  const resolvedAvatarUrl = (!avatarUrl || avatarError) ? null
    : avatarUrl.startsWith('http') ? avatarUrl
    : `${SOCKET_URL}${avatarUrl}`;

  // ── الحصول على بيانات الدور والقالب ──
  const roleDef = getRoleById(role);
  const cardTemplate = getCardForRole(role);
  const roleName = getRoleName(role);
  const isMafia = roleDef ? roleDef.team === 'MAFIA' : (role ? isMafiaRole(role as Role) : false);
  const isNeutral = roleDef ? roleDef.team === 'NEUTRAL' : false;
  const isFemale = gender === 'FEMALE';

  // ── تحديد الألوان (CSS values مباشرة) ──
  const gradient = cardTemplate?.gradient || 'linear-gradient(to bottom, #3f3f46, #18181b)';
  const borderColor = cardTemplate?.borderColor || 'rgba(161,161,170,0.6)';
  const textColor = cardTemplate?.textColor || '#d4d4d8';
  const glowEffect = cardTemplate?.glowEffect || '';

  // ── شارة الفريق (النص والألوان من القالب مع تبديل النص حسب الفريق) ──
  const tb = (cardTemplate?.teamBadge || {}) as any;
  const teamText = isMafia
    ? (tb.mafiaText || 'فريق المافيا 🔴')
    : isNeutral
    ? (tb.neutralText || 'محايد ⚪')
    : (tb.citizenText || 'فريق المدينة 🔵');
  const teamBadge = {
    visible: tb.visible !== false,
    text: teamText,
    bgColor: tb.bgColor || (isMafia ? 'rgba(127,29,29,0.6)' : isNeutral ? 'rgba(120,53,15,0.6)' : 'rgba(30,58,138,0.6)'),
    textColor: tb.textColor || (isMafia ? '#fca5a5' : isNeutral ? '#fcd34d' : '#93c5fd'),
    borderColor: tb.borderColor || (isMafia ? 'rgba(239,68,68,0.3)' : isNeutral ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.3)'),
    fontSize: tb.fontSize || 10,
    borderRadius: tb.borderRadius != null ? `${tb.borderRadius}px` : '9999px',
  };

  // ── الأيقونة (role-specific override أو من القالب) ──
  const roleOverrides = roleDef?.cardOverrides as any;
  const iconConfig = roleOverrides?.icon || cardTemplate?.icon;
  let RoleIcon: LucideIcon = User;
  let iconEmoji: string | null = null;

  if (iconConfig) {
    if (iconConfig.type === 'lucide') {
      RoleIcon = getLucideIcon(iconConfig.value);
    } else if (iconConfig.type === 'emoji') {
      iconEmoji = iconConfig.value;
    }
  } else {
    // fallback للأيقونات القديمة
    const classicIcons: Record<string, LucideIcon> = {
      GODFATHER: Crown, SILENCER: Scissors, CHAMELEON: Drama,
      MAFIA_REGULAR: Skull, SHERIFF: Shield, DOCTOR: HeartPulse,
      SNIPER: Crosshair, POLICEWOMAN: BadgeAlert, NURSE: Syringe, CITIZEN: User,
    };
    RoleIcon = role ? (classicIcons[role] || User) : User;
  }

  // ── الأحجام ──
  const sizeClasses = { sm: 'w-44 h-[15rem]', md: 'w-56 h-[20rem]', lg: 'w-64 h-[22rem]', fluid: 'w-full h-full' }[size];
  const font = (cardTemplate?.elements as any)?.fontFamily || 'Amiri, serif';
  const iconSize = { sm: 32, md: 44, lg: 52, fluid: 48 }[size];
  const nameSize = { sm: 'text-base', md: 'text-xl', lg: 'text-2xl', fluid: 'text-xl md:text-2xl lg:text-3xl' }[size];
  const roleNameSize = { sm: 'text-lg', md: 'text-2xl', lg: 'text-3xl', fluid: 'text-2xl md:text-3xl lg:text-4xl' }[size];

  // قص الاسم
  const nameMaxLen = { sm: 10, md: 14, lg: 18, fluid: 14 }[size];
  const truncatedName = playerName.length > nameMaxLen ? playerName.slice(0, nameMaxLen) + '…' : playerName;

  const handleCardClick = () => {
    if (!flippable) return;
    if (onFlip) { onFlip(); } else { setInternalFlip(prev => !prev); }
  };

  const handleVoteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onVote) onVote(e);
  };

  return (
    <div
      className={`${sizeClasses} select-none ${!isAlive ? 'opacity-30 grayscale pointer-events-none' : ''} ${className}`}
      style={{ perspective: '1000px' }}
    >
      <div
        onClick={handleCardClick}
        className="relative w-full h-full transition-transform duration-700 cursor-pointer"
        style={{
          transformStyle: 'preserve-3d',
          WebkitTransformStyle: 'preserve-3d' as any,
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* ══════════════════════════════════ */}
        {/* 🂠 الوجه الأمامي — الشكل السري    */}
        {/* ══════════════════════════════════ */}
        <div
          className={`absolute inset-0 rounded-2xl overflow-visible bg-black rank-card-wrapper ${hasRankEffects ? `rank-${tier}` : ''} ${isSilenced ? 'ring-2 ring-rose-600/60' : ''}`}
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden' as any,
            transform: 'translateZ(0)',
            border: `2px solid ${borderColor || (isFemale ? 'rgba(168,85,247,0.4)' : 'rgba(197,160,89,0.4)')}`,
          }}
        >
          {/* ── Rank Visual Effects Layer ── */}
          {hasRankEffects && (<>
            <div className="rank-border-effect" style={{ borderRadius: 'inherit' }} />
            {rankBadge && (
              <div className={`rank-badge rank-badge-${tier}`}>
                <span>{rankBadge.emoji}</span>
                <span>{rankBadge.label}</span>
              </div>
            )}
            {(tier === 'CAPO') && (<>
              <div className="rank-corner rank-corner-tl" />
              <div className="rank-corner rank-corner-tr" />
              <div className="rank-corner rank-corner-bl" />
              <div className="rank-corner rank-corner-br" />
            </>)}
            {(tier === 'CAPO' || tier === 'UNDERBOSS' || tier === 'GODFATHER') && (
              <div className="rank-gradient-overlay" style={{ borderRadius: 'inherit' }} />
            )}
            {(tier === 'UNDERBOSS' || tier === 'GODFATHER') && (<>
              <div className="rank-shimmer" style={{ borderRadius: 'inherit' }} />
              {[0,1,2,3].map(i => (
                <div key={i} className="rank-particle" style={{ '--duration': `${3 + i * 0.8}s`, '--delay': `${i * 0.7}s` } as React.CSSProperties} />
              ))}
            </>)}
            {tier === 'GODFATHER' && (
              <div className="rank-crown">👑</div>
            )}
          </>)}
          {/* القسم العلوي (2/3): صورة اللاعب */}
          <div className="relative overflow-hidden" style={{ height: '66.66%' }}>
            {/* z-1: الخلفية: صورة اللاعب أو أفاتار حسب الجنس */}
            <div className="absolute inset-0" style={{ zIndex: 1, ...(cardTemplate?.elements?.positions?.coverPhoto ? { transform: `translate(${cardTemplate.elements.positions.coverPhoto.x}px, ${cardTemplate.elements.positions.coverPhoto.y}px) scale(${cardTemplate.elements.positions.coverPhoto.s || 1})` } : {}) }}>
              {resolvedAvatarUrl ? (
                <img src={resolvedAvatarUrl} alt={playerName} className="w-full h-full object-cover" style={{ opacity: 0.8 }} onError={() => setAvatarError(true)} />
              ) : (
                <img src={isFemale ? '/avatars/female.png' : '/avatars/male.png'} alt="avatar" className="w-full h-full object-cover" style={{ opacity: 0.7 }} />
              )}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black to-transparent pointer-events-none" style={{ zIndex: 2 }} />

            {/* رقم اللاعب — دائماً watermark كبير (مثل المحرر بالضبط) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 5 }}>
              <span
                className="font-mono font-black"
                style={{
                  color: isFemale ? 'rgba(216,180,254,1)' : 'rgba(197,160,89,1)',
                  fontSize: size === 'sm' ? '4rem' : size === 'md' ? '5.5rem' : size === 'lg' ? '7rem' : '5.5rem',
                  opacity: resolvedAvatarUrl ? 0.9 : 0.35,
                  textShadow: resolvedAvatarUrl ? '0 2px 10px rgba(0,0,0,0.9)' : '0 4px 20px rgba(0,0,0,0.8)',
                  lineHeight: 1,
                  ...(cardTemplate?.elements?.positions?.coverNumber ? { transform: `translate(${cardTemplate.elements.positions.coverNumber.x}px, ${cardTemplate.elements.positions.coverNumber.y}px) scale(${cardTemplate.elements.positions.coverNumber.s || 1})` } : {})
                }}
              >
                {playerNumber}
              </span>
            </div>

            {isSilenced && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-rose-900/80 border border-rose-500/40 px-2 py-0.5 rounded-full" style={{ zIndex: 20 }}>
                <span className="text-[10px] text-rose-300 font-mono tracking-widest">🔇 MUTED</span>
              </div>
            )}
          </div>

          {/* القسم السفلي (1/3): الاسم + الشعار */}
          <div className="relative flex flex-col items-center justify-center bg-black px-3" style={{ height: '33.33%', zIndex: 5 }}>
            <div className="absolute top-0 left-[15%] right-[15%] h-[1px]" style={{ backgroundColor: isFemale ? 'rgba(192,132,252,0.3)' : 'rgba(197,160,89,0.3)' }} />

            {showVoting ? (
              <div onClick={handleVoteClick} className="w-full flex flex-col items-center justify-center cursor-pointer group relative flex-1">
                {votes > 0 && <div className="absolute inset-0 bg-red-900/15 animate-pulse rounded-b-xl" />}
                <div className="relative z-10 flex items-center justify-center gap-2 w-full" style={cardTemplate?.elements?.positions?.coverName ? { transform: `translate(${cardTemplate.elements.positions.coverName.x}px, ${cardTemplate.elements.positions.coverName.y}px) scale(${cardTemplate.elements.positions.coverName.s || 1})` } : {}}>
                  <h2 className={`${nameSize} font-black text-white leading-tight ${tier === 'GODFATHER' ? 'rank-name-glow' : ''}`} style={{ fontFamily: font }}>{truncatedName}</h2>
                  <span className={`font-mono font-black transition-all duration-300 ${{ sm: 'text-3xl', md: 'text-4xl', lg: 'text-5xl', fluid: 'text-4xl' }[size]} ${votes > 0 ? 'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.6)]' : 'text-zinc-600 group-hover:text-zinc-400'}`}>{votes}</span>
                </div>
                <p className="text-[8px] font-mono tracking-[0.25em] uppercase mt-1" style={{ color: isFemale ? 'rgba(192,132,252,0.4)' : 'rgba(197,160,89,0.4)', ...(cardTemplate?.elements?.positions?.coverBranding ? { transform: `translate(${cardTemplate.elements.positions.coverBranding.x}px, ${cardTemplate.elements.positions.coverBranding.y}px) scale(${cardTemplate.elements.positions.coverBranding.s || 1})` } : {}) }}>MAFIA CLUB</p>
              </div>
            ) : (
              <>
                <h2 className={`${nameSize} font-black text-white text-center leading-tight ${tier === 'GODFATHER' ? 'rank-name-glow' : ''}`} style={{ fontFamily: font, ...(cardTemplate?.elements?.positions?.coverName ? { transform: `translate(${cardTemplate.elements.positions.coverName.x}px, ${cardTemplate.elements.positions.coverName.y}px) scale(${cardTemplate.elements.positions.coverName.s || 1})` } : {}) }}>{truncatedName}</h2>
                <p className="text-[8px] font-mono tracking-[0.25em] uppercase mt-1" style={{ color: isFemale ? 'rgba(192,132,252,0.4)' : 'rgba(197,160,89,0.4)', ...(cardTemplate?.elements?.positions?.coverBranding ? { transform: `translate(${cardTemplate.elements.positions.coverBranding.x}px, ${cardTemplate.elements.positions.coverBranding.y}px) scale(${cardTemplate.elements.positions.coverBranding.s || 1})` } : {}) }}>MAFIA CLUB</p>
                {flippable && (
                  <span className="text-[7px] text-zinc-600 font-mono tracking-widest uppercase mt-1" style={cardTemplate?.elements?.positions?.coverFooter ? { transform: `translate(${cardTemplate.elements.positions.coverFooter.x}px, ${cardTemplate.elements.positions.coverFooter.y}px) scale(${cardTemplate.elements.positions.coverFooter.s || 1})` } : {}}>اضغط للكشف</span>
                )}
              </>
            )}

          </div>

          {/* Shapes on Cover Face — على مستوى الكارد كامل (مثل المحرر) */}
          {(cardTemplate?.elements?.shapes || []).filter((s:any) => s.face === 'cover').map((s:any) => (
            <div key={s.id} className="absolute pointer-events-none" style={{ width: s.w, height: s.h, backgroundColor: s.bg, opacity: s.opacity, zIndex: s.zIndex || 3, borderRadius: s.radius, top: '50%', left: '50%', marginTop: -s.h/2, marginLeft: -s.w/2, transform: `translate(${s.x || 0}px, ${s.y || 0}px)` }} />
          ))}
        </div>

        {/* ══════════════════════════════════ */}
        {/* 🂡 الوجه الخلفي — الكشف (ديناميكي) */}
        {/* ══════════════════════════════════ */}
        <div
          className={`absolute inset-0 rounded-2xl overflow-hidden bg-black`}
          style={{
            border: `2px solid ${borderColor}`,
            boxShadow: glowEffect || 'none',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden' as any,
            transform: 'rotateY(180deg) translateZ(0)',
          }}
        >
          {/* خلفية متدرجة من DB — CSS */}
          <div className="absolute inset-0" style={{ background: gradient }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top right, transparent, rgba(255,255,255,0.03), transparent)' }} />

          {/* شارة الفريق */}
          {teamBadge.visible && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1 font-mono tracking-widest whitespace-nowrap"
                 style={{ fontSize: `${teamBadge.fontSize}px`, borderRadius: teamBadge.borderRadius, backgroundColor: teamBadge.bgColor, color: teamBadge.textColor, border: `1px solid ${teamBadge.borderColor}`, ...(cardTemplate?.elements?.positions?.badge ? { transform: `translate(calc(-50% + ${cardTemplate.elements.positions.badge.x}px), ${cardTemplate.elements.positions.badge.y}px) scale(${cardTemplate.elements.positions.badge.s || 1})` } : {}) }}>
              {teamBadge.text}
            </div>
          )}

          {/* المحتوى */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full p-4 pt-12 overflow-hidden" dir="rtl" style={{ textAlign: 'center' }}>
            {/* رقم اللاعب صغير */}
            <div 
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center font-mono text-sm font-bold rounded-md bg-black/40"
              style={{ border: `1px solid ${borderColor}`, color: textColor, ...(cardTemplate?.elements?.positions?.number ? { transform: `translate(${cardTemplate.elements.positions.number.x}px, ${cardTemplate.elements.positions.number.y}px) scale(${cardTemplate.elements.positions.number.s || 1})` } : {}) }}
            >
              {playerNumber}
            </div>

            {/* دائرة الأيقونة */}
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center mb-5"
              style={{
                border: `2px solid ${borderColor}`,
                color: textColor,
                background: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(12px)',
                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.3)',
                ...(cardTemplate?.elements?.positions?.icon ? { transform: `translate(${cardTemplate.elements.positions.icon.x}px, ${cardTemplate.elements.positions.icon.y}px) scale(${cardTemplate.elements.positions.icon.s || 1})` } : {})
              }}
            >
              {iconEmoji ? (
                <span style={{ fontSize: iconSize }}>{iconEmoji}</span>
              ) : (
                <RoleIcon size={iconSize} strokeWidth={1.5} />
              )}
            </div>

            {/* اسم الدور */}
            <h3 
              className={`${roleNameSize} font-black mb-2`} 
              style={{ fontFamily: 'Amiri, serif', color: textColor, ...(cardTemplate?.elements?.positions?.title ? { transform: `translate(${cardTemplate.elements.positions.title.x}px, ${cardTemplate.elements.positions.title.y}px) scale(${cardTemplate.elements.positions.title.s || 1})` } : {}) }}
            >
              {roleName}
            </h3>

            {/* اسم اللاعب */}
            {cardTemplate?.elements?.showPlayerNumber !== false && (
              <p 
                className="text-white/40 text-sm font-mono tracking-widest" 
                dir="ltr"
                style={cardTemplate?.elements?.positions?.playerName ? { transform: `translate(${cardTemplate.elements.positions.playerName.x}px, ${cardTemplate.elements.positions.playerName.y}px) scale(${cardTemplate.elements.positions.playerName.s || 1})` } : {}}
              >
                {playerName}
              </p>
            )}

            {/* الخط الفاصل */}
            <div className="w-20 h-[1px] my-4" style={{ backgroundColor: borderColor }} />

            {/* نص أسفل */}
            <div 
              className="mt-auto"
              style={cardTemplate?.elements?.positions?.footer ? { transform: `translate(${cardTemplate.elements.positions.footer.x}px, ${cardTemplate.elements.positions.footer.y}px) scale(${cardTemplate.elements.positions.footer.s || 1})` } : {}}
            >
              {cardTemplate?.elements?.customFooterText ? (
                <span className="text-[9px] text-zinc-500 font-mono" style={{ fontFamily: cardTemplate.elements.fontFamily || 'Amiri, serif' }}>
                  {cardTemplate.elements.customFooterText}
                </span>
              ) : (
                flippable && <span className="text-[9px] text-zinc-600 font-mono tracking-widest uppercase" dir="ltr">
                  اضغط للإخفاء
                </span>
              )}
            </div>
          </div>

          {/* Shapes on Role Face (Rendered last to sit on top) */}
          {(cardTemplate?.elements?.shapes || []).filter((s:any) => s.face === 'role').map((s:any) => (
            <div key={s.id} className="absolute pointer-events-none" style={{ width: s.w, height: s.h, backgroundColor: s.bg, opacity: s.opacity, zIndex: s.zIndex, borderRadius: s.radius, top: '50%', left: '50%', marginTop: -s.h/2, marginLeft: -s.w/2 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
