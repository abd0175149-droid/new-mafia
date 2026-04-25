'use client';

import React, { useState } from 'react';
import { Role, ROLE_NAMES, isMafiaRole } from '@/lib/constants';
import {
  User,
  HeartPulse,
  Shield,
  Syringe,
  Crosshair,
  BadgeAlert,
  Skull,
  Crown,
  Drama,
  Scissors,
  type LucideIcon,
} from 'lucide-react';

// ══════════════════════════════════════════════════════
// 🎴 MafiaCard — كارد اللاعب الموحد (Unified Player Card)
// حالتين: السرية (الوجه) والكشف (الخلف)
// يُستخدم في كل مكان يظهر فيه كارد لاعب
// ══════════════════════════════════════════════════════

// ── أنماط الأدوار (Theme per Role) ────────────────

interface RoleTheme {
  gradient: string;
  border: string;
  text: string;
  glow: string;
  Icon: LucideIcon;
  teamBadge: string;
  teamColor: string;
}

function getRoleTheme(role: Role | string | null): RoleTheme {
  const r = role as Role;
  switch (r) {
    // ── المواطنون (Cool Tones) ──
    case Role.CITIZEN:
      return {
        gradient: 'from-zinc-700 via-zinc-800 to-zinc-900',
        border: 'border-zinc-500/60',
        text: 'text-zinc-300',
        glow: 'shadow-[0_0_30px_rgba(161,161,170,0.15)]',
        Icon: User,
        teamBadge: 'فريق المدينة 🔵',
        teamColor: 'bg-blue-900/60 text-blue-300 border-blue-500/30',
      };
    case Role.DOCTOR:
      return {
        gradient: 'from-emerald-800 via-emerald-900 to-green-950',
        border: 'border-emerald-500/60',
        text: 'text-emerald-300',
        glow: 'shadow-[0_0_30px_rgba(52,211,153,0.2)]',
        Icon: HeartPulse,
        teamBadge: 'فريق المدينة 🔵',
        teamColor: 'bg-blue-900/60 text-blue-300 border-blue-500/30',
      };
    case Role.SHERIFF:
      return {
        gradient: 'from-blue-800 via-blue-900 to-blue-950',
        border: 'border-blue-500/60',
        text: 'text-blue-300',
        glow: 'shadow-[0_0_30px_rgba(96,165,250,0.2)]',
        Icon: Shield,
        teamBadge: 'فريق المدينة 🔵',
        teamColor: 'bg-blue-900/60 text-blue-300 border-blue-500/30',
      };
    case Role.NURSE:
      return {
        gradient: 'from-teal-800 via-teal-900 to-teal-950',
        border: 'border-teal-500/60',
        text: 'text-teal-300',
        glow: 'shadow-[0_0_30px_rgba(94,234,212,0.2)]',
        Icon: Syringe,
        teamBadge: 'فريق المدينة 🔵',
        teamColor: 'bg-blue-900/60 text-blue-300 border-blue-500/30',
      };
    case Role.SNIPER:
      return {
        gradient: 'from-cyan-800 via-cyan-900 to-cyan-950',
        border: 'border-cyan-500/60',
        text: 'text-cyan-300',
        glow: 'shadow-[0_0_30px_rgba(103,232,249,0.2)]',
        Icon: Crosshair,
        teamBadge: 'فريق المدينة 🔵',
        teamColor: 'bg-blue-900/60 text-blue-300 border-blue-500/30',
      };
    case Role.POLICEWOMAN:
      return {
        gradient: 'from-indigo-800 via-indigo-900 to-indigo-950',
        border: 'border-indigo-500/60',
        text: 'text-indigo-300',
        glow: 'shadow-[0_0_30px_rgba(129,140,248,0.2)]',
        Icon: BadgeAlert,
        teamBadge: 'فريق المدينة 🔵',
        teamColor: 'bg-blue-900/60 text-blue-300 border-blue-500/30',
      };

    // ── المافيا (Warm/Danger Tones) ──
    case Role.MAFIA_REGULAR:
      return {
        gradient: 'from-red-800 via-red-900 to-red-950',
        border: 'border-red-500/60',
        text: 'text-red-300',
        glow: 'shadow-[0_0_30px_rgba(248,113,113,0.25)]',
        Icon: Skull,
        teamBadge: 'فريق المافيا 🔴',
        teamColor: 'bg-red-900/60 text-red-300 border-red-500/30',
      };
    case Role.GODFATHER:
      return {
        gradient: 'from-amber-800 via-amber-900 to-yellow-950',
        border: 'border-amber-400/60',
        text: 'text-amber-300',
        glow: 'shadow-[0_0_40px_rgba(251,191,36,0.25)]',
        Icon: Crown,
        teamBadge: 'فريق المافيا 🔴',
        teamColor: 'bg-red-900/60 text-red-300 border-red-500/30',
      };
    case Role.CHAMELEON:
      return {
        gradient: 'from-fuchsia-800 via-fuchsia-900 to-fuchsia-950',
        border: 'border-fuchsia-500/60',
        text: 'text-fuchsia-300',
        glow: 'shadow-[0_0_30px_rgba(232,121,249,0.2)]',
        Icon: Drama,
        teamBadge: 'فريق المافيا 🔴',
        teamColor: 'bg-red-900/60 text-red-300 border-red-500/30',
      };
    case Role.SILENCER:
      return {
        gradient: 'from-rose-800 via-rose-900 to-rose-950',
        border: 'border-rose-500/60',
        text: 'text-rose-300',
        glow: 'shadow-[0_0_30px_rgba(251,113,133,0.2)]',
        Icon: Scissors,
        teamBadge: 'فريق المافيا 🔴',
        teamColor: 'bg-red-900/60 text-red-300 border-red-500/30',
      };

    default:
      return {
        gradient: 'from-zinc-700 via-zinc-800 to-zinc-900',
        border: 'border-zinc-500/40',
        text: 'text-zinc-400',
        glow: '',
        Icon: User,
        teamBadge: 'غير معروف',
        teamColor: 'bg-zinc-800 text-zinc-400 border-zinc-600/30',
      };
  }
}

// ── Props Interface ────────────────────────────

export interface MafiaCardProps {
  /** رقم اللاعب الفيزيائي */
  playerNumber: number;
  /** اسم اللاعب */
  playerName: string;
  /** دور اللاعب (null = مجهول) */
  role: Role | string | null;
  /** هل الكارد مقلوب (الدور ظاهر) — controlled mode */
  isFlipped?: boolean;
  /** callback عند الضغط على الكارد */
  onFlip?: () => void;
  /** عدد الأصوات */
  votes?: number;
  /** callback عند الضغط على منطقة التصويت */
  onVote?: (e: React.MouseEvent) => void;
  /** هل يظهر منطقة التصويت */
  showVoting?: boolean;
  /** هل اللاعب حي */
  isAlive?: boolean;
  /** هل اللاعب مسكت */
  isSilenced?: boolean;
  /** الجنس لتمييز الكارد بصرياً */
  gender?: 'MALE' | 'FEMALE';
  /** حجم الكارد */
  size?: 'sm' | 'md' | 'lg' | 'fluid';
  /** هل الكارد قابل للقلب */
  flippable?: boolean;
  /** className إضافي للحاوية الخارجية */
  className?: string;
  /** رابط صورة اللاعب الشخصية */
  avatarUrl?: string | null;
}

// ── Component ────────────────────────────────

export default function MafiaCard({
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
}: MafiaCardProps) {
  const [internalFlip, setInternalFlip] = useState(false);
  const isFlipped = controlledFlip !== undefined ? controlledFlip : internalFlip;

  const theme = getRoleTheme(role);
  const RoleIcon = theme.Icon;
  const roleName = role ? (ROLE_NAMES[role as Role] || role) : 'مجهول';
  const isMafia = role ? isMafiaRole(role as Role) : false;
  const isFemale = gender === 'FEMALE';

  // حجم الكارد
  const sizeClasses = {
    sm: 'w-44 h-[15rem]',
    md: 'w-56 h-[20rem]',
    lg: 'w-64 h-[22rem]',
    fluid: 'w-full h-full',
  }[size];

  // حجم الأيقونة
  const iconSize = { sm: 32, md: 44, lg: 52, fluid: 48 }[size];

  // حجم الخطوط
  const nameSize = { sm: 'text-base', md: 'text-xl', lg: 'text-2xl', fluid: 'text-xl md:text-2xl lg:text-3xl' }[size];
  const roleNameSize = { sm: 'text-lg', md: 'text-2xl', lg: 'text-3xl', fluid: 'text-2xl md:text-3xl lg:text-4xl' }[size];

  // حجم رقم اللاعب (Badge) — ديناميكي للقراءة من بعد على TV
  const numberBadgeSize = { sm: 'w-14 h-14', md: 'w-16 h-16', lg: 'w-20 h-20', fluid: 'w-16 h-16' }[size];
  const numberTextSize = { sm: 'text-2xl', md: 'text-3xl', lg: 'text-4xl', fluid: 'text-3xl' }[size];

  // حجم عدد الأصوات — كبير جداً للقراءة من بعد
  const voteCountSize = { sm: 'text-4xl', md: 'text-5xl', lg: 'text-6xl', fluid: 'text-5xl' }[size];
  const voteLabelSize = { sm: 'text-[10px]', md: 'text-xs', lg: 'text-sm', fluid: 'text-xs' }[size];

  // حد أقصى لطول الاسم في وضع التصويت — لضمان القص من النهاية دائماً
  const voteNameMaxLen = { sm: 10, md: 14, lg: 18, fluid: 14 }[size];
  const truncatedName = playerName.length > voteNameMaxLen
    ? playerName.slice(0, voteNameMaxLen) + '…'
    : playerName;

  const handleCardClick = () => {
    if (!flippable) return;
    if (onFlip) {
      onFlip();
    } else {
      setInternalFlip(prev => !prev);
    }
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
        {/* 🂠 الوجه الأمامي — التصميم الجديد */}
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
          {/* ── القسم العلوي (2/3): صورة اللاعب + رقم طافي ── */}
          <div className="relative" style={{ height: '66.66%' }}>
            {/* صورة اللاعب — تغطي كامل المساحة */}
            {avatarUrl ? (
              <img
                src={`${avatarUrl}`}
                alt={playerName}
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              /* خلفية افتراضية عند عدم وجود صورة */
              <div className={`absolute inset-0 bg-gradient-to-b ${
                isFemale
                  ? 'from-purple-900/60 via-purple-950/80 to-black'
                  : 'from-zinc-700/50 via-zinc-900/80 to-black'
              }`} />
            )}

            {/* تدرج سفلي لدمج الصورة مع القسم السفلي */}
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black to-transparent" />

            {/* رقم اللاعب — طافي فوق الصورة */}
            {avatarUrl ? (
              /* عند وجود صورة: رقم كبير يمين النصف العلوي مع خلفية رمادية شفافة */
              <div className="absolute top-[15%] right-3 z-10">
                <div
                  className={`flex items-center justify-center font-mono font-black rounded-xl ${
                    isFemale ? 'text-purple-200' : 'text-[#C5A059]'
                  }`}
                  style={{
                    width: size === 'sm' ? 72 : size === 'md' ? 88 : size === 'lg' ? 104 : 88,
                    height: size === 'sm' ? 72 : size === 'md' ? 88 : size === 'lg' ? 104 : 88,
                    fontSize: size === 'sm' ? '2.5rem' : size === 'md' ? '3rem' : size === 'lg' ? '4rem' : '3rem',
                    backgroundColor: 'rgba(0, 0, 0, 0.45)',
                    backdropFilter: 'blur(4px)',
                    border: isFemale ? '1px solid rgba(168,85,247,0.3)' : '1px solid rgba(197,160,89,0.3)',
                  }}
                >
                  {playerNumber}
                </div>
              </div>
            ) : (
              /* بدون صورة: رقم كبير شفاف في المنتصف */
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className={`font-mono font-black ${
                    isFemale ? 'text-purple-300' : 'text-[#C5A059]'
                  }`}
                  style={{
                    fontSize: size === 'sm' ? '4rem' : size === 'md' ? '5.5rem' : size === 'lg' ? '7rem' : '5.5rem',
                    opacity: 0.35,
                    textShadow: '0 4px 20px rgba(0,0,0,0.8)',
                    lineHeight: 1,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {playerNumber}
                </span>
              </div>
            )}

            {/* أيقونة الإسكات */}
            {isSilenced && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-rose-900/80 border border-rose-500/40 px-2 py-0.5 rounded-full z-20">
                <span className="text-[10px] text-rose-300 font-mono tracking-widest">🔇 MUTED</span>
              </div>
            )}
          </div>

          {/* ── القسم السفلي (1/3): الاسم + الشعار + الأصوات ── */}
          <div className="relative flex flex-col items-center justify-center bg-black px-3" style={{ height: '33.33%' }}>
            {/* خط فاصل ذهبي/بنفسجي رفيع */}
            <div className={`absolute top-0 left-[15%] right-[15%] h-[1px] ${
              isFemale ? 'bg-purple-400/30' : 'bg-[#C5A059]/30'
            }`} />

            {showVoting ? (
              /* ── وضع التصويت: الاسم + الأصوات ── */
              <div
                onClick={handleVoteClick}
                className="w-full flex flex-col items-center justify-center cursor-pointer group relative flex-1"
              >
                {/* تأثير خلفي عند وجود أصوات */}
                {votes > 0 && (
                  <div className="absolute inset-0 bg-red-900/15 animate-pulse rounded-b-xl" />
                )}

                {/* الاسم + عدد الأصوات */}
                <div className="relative z-10 flex items-center justify-center gap-2 w-full">
                  <h2
                    className={`${nameSize} font-black text-white leading-tight max-w-[70%] truncate`}
                    style={{
                      fontFamily: 'Amiri, serif',
                    }}
                  >
                    {truncatedName}
                  </h2>
                  <span
                    className={`font-mono font-black transition-all duration-300 ${
                      { sm: 'text-3xl', md: 'text-4xl', lg: 'text-5xl', fluid: 'text-4xl' }[size]
                    } ${
                      votes > 0
                        ? 'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.6)]'
                        : 'text-zinc-600 group-hover:text-zinc-400'
                    }`}
                  >
                    {votes}
                  </span>
                </div>

                {/* Mafia Club */}
                <p className={`text-[8px] font-mono tracking-[0.25em] uppercase mt-1 ${
                  isFemale ? 'text-purple-400/40' : 'text-[#C5A059]/40'
                }`}>
                  MAFIA CLUB
                </p>
              </div>
            ) : (
              /* ── الوضع العادي: الاسم + شعار ── */
              <>
                <h2
                  className={`${nameSize} font-black text-white text-center leading-tight`}
                  style={{ fontFamily: 'Amiri, serif' }}
                >
                  {playerName}
                </h2>
                <p className={`text-[8px] font-mono tracking-[0.25em] uppercase mt-1 ${
                  isFemale ? 'text-purple-400/40' : 'text-[#C5A059]/40'
                }`}>
                  MAFIA CLUB
                </p>
                {flippable && (
                  <span className="text-[7px] text-zinc-600 font-mono tracking-widest uppercase mt-1">
                    اضغط للكشف
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════ */}
        {/* 🂡 الوجه الخلفي — الكشف          */}
        {/* ══════════════════════════════════ */}
        <div
          className={`absolute inset-0 rounded-2xl overflow-hidden bg-black border-2 ${theme.border} ${theme.glow}`}
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden' as any,
            transform: 'rotateY(180deg) translateZ(0)',
          }}
        >
          {/* خلفية متدرجة حسب الدور */}
          <div className={`absolute inset-0 bg-gradient-to-b ${theme.gradient}`} />

          {/* Shimmer overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.03] to-transparent" />

          {/* شارة الفريق */}
          <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full border text-[10px] font-mono tracking-widest ${theme.teamColor}`}>
            {theme.teamBadge}
          </div>

          {/* المحتوى */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full p-4 pt-12" dir="rtl" style={{ textAlign: 'center' }}>
            {/* رقم اللاعب صغير */}
            <div className={`absolute top-3 right-3 w-8 h-8 border ${theme.border} flex items-center justify-center font-mono text-sm font-bold rounded-md bg-black/40 ${theme.text}`}>
              {playerNumber}
            </div>

            {/* دائرة الأيقونة — Glassmorphic */}
            <div
              className={`w-24 h-24 rounded-full border-2 ${theme.border} flex items-center justify-center mb-5 ${theme.text}`}
              style={{
                background: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(12px)',
                boxShadow: isMafia
                  ? '0 0 40px rgba(220, 38, 38, 0.15), inset 0 0 20px rgba(0,0,0,0.3)'
                  : '0 0 40px rgba(100, 200, 255, 0.1), inset 0 0 20px rgba(0,0,0,0.3)',
              }}
            >
              <RoleIcon size={iconSize} strokeWidth={1.5} />
            </div>

            {/* اسم الدور */}
            <h3
              className={`${roleNameSize} font-black mb-2 ${theme.text}`}
              style={{ fontFamily: 'Amiri, serif' }}
            >
              {roleName}
            </h3>

            {/* اسم اللاعب */}
            <p className="text-white/40 text-sm font-mono tracking-widest" dir="ltr">
              {playerName}
            </p>

            {/* الخط الفاصل */}
            <div className={`w-20 h-[1px] my-4 ${
              isMafia ? 'bg-red-500/30' : 'bg-blue-500/30'
            }`} />

            {/* نص أسفل */}
            {flippable && (
              <span className="text-[9px] text-zinc-600 font-mono tracking-widest uppercase mt-auto" dir="ltr">
                اضغط للإخفاء
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
