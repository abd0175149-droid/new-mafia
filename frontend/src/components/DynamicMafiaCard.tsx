'use client';

import React, { useState } from 'react';
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
  forceClassic = false,
}: DynamicMafiaCardProps) {
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

  // ── تحديد الألوان ──
  // إذا فيه قالب من DB → نستخدمه، وإلا → ألوان افتراضية
  const gradient = cardTemplate?.gradient || (isMafia ? 'from-red-800 via-red-900 to-red-950' : isNeutral ? 'from-amber-800 via-amber-900 to-amber-950' : 'from-zinc-700 via-zinc-800 to-zinc-900');
  const borderColor = cardTemplate?.borderColor || (isMafia ? 'border-red-500/60' : isNeutral ? 'border-amber-500/60' : 'border-zinc-500/60');
  const textColor = cardTemplate?.textColor || (isMafia ? 'text-red-300' : isNeutral ? 'text-amber-300' : 'text-zinc-300');
  const glowEffect = cardTemplate?.glowEffect || '';

  // ── شارة الفريق ──
  const teamBadge = cardTemplate?.teamBadge || (
    isMafia
      ? { text: 'فريق المافيا 🔴', bgColor: 'bg-red-900/60', textColor: 'text-red-300', borderColor: 'border-red-500/30' }
      : isNeutral
      ? { text: 'محايد ⚪', bgColor: 'bg-amber-900/60', textColor: 'text-amber-300', borderColor: 'border-amber-500/30' }
      : { text: 'فريق المدينة 🔵', bgColor: 'bg-blue-900/60', textColor: 'text-blue-300', borderColor: 'border-blue-500/30' }
  );

  // ── الأيقونة ──
  const iconConfig = cardTemplate?.icon;
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
          className={`absolute inset-0 rounded-2xl overflow-hidden bg-black border-2 ${
            isFemale ? 'border-purple-500/40' : 'border-[#C5A059]/40'
          } ${isSilenced ? 'border-rose-600/60' : ''}`}
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden' as any,
            transform: 'translateZ(0)',
          }}
        >
          {/* القسم العلوي (2/3): صورة اللاعب */}
          <div className="relative" style={{ height: '66.66%' }}>
            {resolvedAvatarUrl ? (
              <img
                src={resolvedAvatarUrl}
                alt={playerName}
                className="absolute inset-0 w-full h-full object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div className={`absolute inset-0 bg-gradient-to-b ${
                isFemale
                  ? 'from-purple-900/60 via-purple-950/80 to-black'
                  : 'from-zinc-700/50 via-zinc-900/80 to-black'
              }`} />
            )}
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black to-transparent" />

            {/* Shapes on Cover Face */}
            {(cardTemplate?.elements?.shapes || []).filter((s:any) => s.face === 'cover').map((s:any) => (
              <div key={s.id} className="absolute" style={{ width: s.w, height: s.h, backgroundColor: s.bg, opacity: s.opacity, zIndex: s.zIndex, borderRadius: s.radius, top: '50%', left: '50%', marginTop: -s.h/2, marginLeft: -s.w/2 }} />
            ))}

            {/* رقم اللاعب */}
            {resolvedAvatarUrl ? (
              <div className="absolute top-[15%] right-3 z-10" style={cardTemplate?.elements?.positions?.coverNumber ? { transform: `translate(${cardTemplate.elements.positions.coverNumber.x}px, ${cardTemplate.elements.positions.coverNumber.y}px) scale(${cardTemplate.elements.positions.coverNumber.s || 1})` } : {}}>
                <div
                  className={`flex items-center justify-center font-mono font-black rounded-xl ${
                    isFemale ? 'text-purple-200' : 'text-[#C5A059]'
                  }`}
                  style={{
                    width: size === 'sm' ? 54 : size === 'md' ? 66 : size === 'lg' ? 78 : 66,
                    height: size === 'sm' ? 54 : size === 'md' ? 66 : size === 'lg' ? 78 : 66,
                    fontSize: size === 'sm' ? '1.9rem' : size === 'md' ? '2.25rem' : size === 'lg' ? '3rem' : '2.25rem',
                    backgroundColor: 'rgba(0, 0, 0, 0.45)',
                    backdropFilter: 'blur(4px)',
                    border: isFemale ? '1px solid rgba(168,85,247,0.3)' : '1px solid rgba(197,160,89,0.3)',
                  }}
                >
                  {playerNumber}
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span
                  className={`font-mono font-black ${isFemale ? 'text-purple-300' : 'text-[#C5A059]'}`}
                  style={{
                    fontSize: size === 'sm' ? '4rem' : size === 'md' ? '5.5rem' : size === 'lg' ? '7rem' : '5.5rem',
                    opacity: 0.35,
                    textShadow: '0 4px 20px rgba(0,0,0,0.8)',
                    lineHeight: 1,
                    ...(cardTemplate?.elements?.positions?.coverNumber ? { transform: `translate(${cardTemplate.elements.positions.coverNumber.x}px, ${cardTemplate.elements.positions.coverNumber.y}px) scale(${cardTemplate.elements.positions.coverNumber.s || 1})` } : {})
                  }}
                >
                  {playerNumber}
                </span>
              </div>
            )}

            {isSilenced && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-rose-900/80 border border-rose-500/40 px-2 py-0.5 rounded-full z-20">
                <span className="text-[10px] text-rose-300 font-mono tracking-widest">🔇 MUTED</span>
              </div>
            )}
          </div>

          {/* القسم السفلي (1/3): الاسم + الشعار */}
          <div className="relative flex flex-col items-center justify-center bg-black px-3" style={{ height: '33.33%' }}>
            <div className={`absolute top-0 left-[15%] right-[15%] h-[1px] ${
              isFemale ? 'bg-purple-400/30' : 'bg-[#C5A059]/30'
            }`} />

            {showVoting ? (
              <div onClick={handleVoteClick} className="w-full flex flex-col items-center justify-center cursor-pointer group relative flex-1">
                {votes > 0 && <div className="absolute inset-0 bg-red-900/15 animate-pulse rounded-b-xl" />}
                <div className="relative z-10 flex items-center justify-center gap-2 w-full" style={cardTemplate?.elements?.positions?.coverName ? { transform: `translate(${cardTemplate.elements.positions.coverName.x}px, ${cardTemplate.elements.positions.coverName.y}px) scale(${cardTemplate.elements.positions.coverName.s || 1})` } : {}}>
                  <h2 className={`${nameSize} font-black text-white leading-tight`} style={{ fontFamily: 'Amiri, serif' }}>
                    {truncatedName}
                  </h2>
                  <span className={`font-mono font-black transition-all duration-300 ${
                    { sm: 'text-3xl', md: 'text-4xl', lg: 'text-5xl', fluid: 'text-4xl' }[size]
                  } ${votes > 0 ? 'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.6)]' : 'text-zinc-600 group-hover:text-zinc-400'}`}>
                    {votes}
                  </span>
                </div>
                <p className={`text-[8px] font-mono tracking-[0.25em] uppercase mt-1 ${
                  isFemale ? 'text-purple-400/40' : 'text-[#C5A059]/40'
                }`} style={cardTemplate?.elements?.positions?.coverBranding ? { transform: `translate(${cardTemplate.elements.positions.coverBranding.x}px, ${cardTemplate.elements.positions.coverBranding.y}px) scale(${cardTemplate.elements.positions.coverBranding.s || 1})` } : {}}>MAFIA CLUB</p>
              </div>
            ) : (
              <>
                <h2 className={`${nameSize} font-black text-white text-center leading-tight`} style={{ fontFamily: 'Amiri, serif', ...(cardTemplate?.elements?.positions?.coverName ? { transform: `translate(${cardTemplate.elements.positions.coverName.x}px, ${cardTemplate.elements.positions.coverName.y}px) scale(${cardTemplate.elements.positions.coverName.s || 1})` } : {}) }}>
                  {truncatedName}
                </h2>
                <p className={`text-[8px] font-mono tracking-[0.25em] uppercase mt-1 ${
                  isFemale ? 'text-purple-400/40' : 'text-[#C5A059]/40'
                }`} style={cardTemplate?.elements?.positions?.coverBranding ? { transform: `translate(${cardTemplate.elements.positions.coverBranding.x}px, ${cardTemplate.elements.positions.coverBranding.y}px) scale(${cardTemplate.elements.positions.coverBranding.s || 1})` } : {}}>MAFIA CLUB</p>
                {flippable && (
                  <span className="text-[7px] text-zinc-600 font-mono tracking-widest uppercase mt-1" style={cardTemplate?.elements?.positions?.coverFooter ? { transform: `translate(${cardTemplate.elements.positions.coverFooter.x}px, ${cardTemplate.elements.positions.coverFooter.y}px) scale(${cardTemplate.elements.positions.coverFooter.s || 1})` } : {}}>اضغط للكشف</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════ */}
        {/* 🂡 الوجه الخلفي — الكشف (ديناميكي) */}
        {/* ══════════════════════════════════ */}
        <div
          className={`absolute inset-0 rounded-2xl overflow-hidden bg-black border-2 ${borderColor} ${glowEffect}`}
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden' as any,
            transform: 'rotateY(180deg) translateZ(0)',
          }}
        >
          {/* خلفية متدرجة من DB */}
          <div className={`absolute inset-0 bg-gradient-to-b ${gradient}`} />
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.03] to-transparent pointer-events-none" />

          {/* Shapes on Role Face */}
          {(cardTemplate?.elements?.shapes || []).filter((s:any) => s.face === 'role').map((s:any) => (
            <div key={s.id} className="absolute pointer-events-none" style={{ width: s.w, height: s.h, backgroundColor: s.bg, opacity: s.opacity, zIndex: s.zIndex, borderRadius: s.radius, top: '50%', left: '50%', marginTop: -s.h/2, marginLeft: -s.w/2 }} />
          ))}

          {/* شارة الفريق */}
          <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full border text-[10px] font-mono tracking-widest ${teamBadge.bgColor} ${teamBadge.textColor} ${teamBadge.borderColor}`}
               style={cardTemplate?.elements?.positions?.badge ? { transform: `translate(calc(-50% + ${cardTemplate.elements.positions.badge.x}px), ${cardTemplate.elements.positions.badge.y}px) scale(${cardTemplate.elements.positions.badge.s || 1})` } : {}}>
            {teamBadge.text}
          </div>

          {/* المحتوى */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full p-4 pt-12 overflow-hidden" dir="rtl" style={{ textAlign: 'center' }}>
            {/* رقم اللاعب صغير */}
            <div 
              className={`absolute top-3 right-3 w-8 h-8 border ${borderColor} flex items-center justify-center font-mono text-sm font-bold rounded-md bg-black/40 ${textColor}`}
              style={cardTemplate?.elements?.positions?.number ? { transform: `translate(${cardTemplate.elements.positions.number.x}px, ${cardTemplate.elements.positions.number.y}px) scale(${cardTemplate.elements.positions.number.s || 1})` } : {}}
            >
              {playerNumber}
            </div>

            {/* دائرة الأيقونة */}
            <div
              className={`w-24 h-24 rounded-full border-2 ${borderColor} flex items-center justify-center mb-5 ${textColor}`}
              style={{
                background: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(12px)',
                boxShadow: isMafia
                  ? '0 0 40px rgba(220, 38, 38, 0.15), inset 0 0 20px rgba(0,0,0,0.3)'
                  : isNeutral
                  ? '0 0 40px rgba(217, 119, 6, 0.15), inset 0 0 20px rgba(0,0,0,0.3)'
                  : '0 0 40px rgba(100, 200, 255, 0.1), inset 0 0 20px rgba(0,0,0,0.3)',
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
              className={`${roleNameSize} font-black mb-2 ${textColor}`} 
              style={{ fontFamily: 'Amiri, serif', ...(cardTemplate?.elements?.positions?.title ? { transform: `translate(${cardTemplate.elements.positions.title.x}px, ${cardTemplate.elements.positions.title.y}px) scale(${cardTemplate.elements.positions.title.s || 1})` } : {}) }}
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
            <div className={`w-20 h-[1px] my-4 ${
              isMafia ? 'bg-red-500/30' : isNeutral ? 'bg-amber-500/30' : 'bg-blue-500/30'
            }`} />

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
        </div>
      </div>
    </div>
  );
}
