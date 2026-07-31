'use client';

import React, { useState } from 'react';
import './RankEffects.css';
import { RankFrame } from './RankFrames';
import { ChipsEmblem, type EmblemId } from './ChipsEmblems';
import { CardFxBoundary } from './CardFxBoundary';
import { normalizeFx, mergeFx, hasAnyEnabled, hasLayerVisuals } from '@/lib/chips-fx';
import { useGameConfig, type CardTemplateDef, type RoleDef } from '@/hooks/useGameConfig';
import { Role, ROLE_NAMES, isMafiaRole } from '@/lib/constants';
import {
  User, HeartPulse, Shield, Syringe, Crosshair,
  BadgeAlert, Skull, Crown, Drama, Scissors,
  Flame, Ghost, Eye, Zap, Sword, Heart, Landmark,
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
  Flame, Ghost, Eye, Zap, Sword, Heart, Landmark,
};

function getLucideIcon(name: string): LucideIcon {
  return LUCIDE_ICONS[name] || User;
}

// ── Props ──────────────────────────────────────

// ── Rank Helper ─────────────────────────────────
// ⚠️ محصَّنة: كانت تستدعي slice على قيمة قد تكون undefined فترمي وتُسقط
//    شجرة البطاقة كاملة — وعلى شاشة القاعة يعني ذلك اختفاء كل البطاقات معاً.
function hexToRgba(hex: string, a: number) {
  const h = (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex)) ? hex : '#6b7280';
  const r = parseInt(h.slice(1,3),16), g = parseInt(h.slice(3,5),16), b = parseInt(h.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

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
  /** مدّة حركة القلب بالمللي ثانية (افتراضي 700) — نُبطّئها في كشف الدور */
  flipDurationMs?: number;
  className?: string;
  avatarUrl?: string | null;
  rankTier?: string;
  /** تمرير تأثيرات الرتبة مباشرة (للمعاينة الحية في المحرر) */
  rankEffectsOverride?: any;
  /**
   * 🪙 مظهر مشترى من خزنة الدون (إطار/لقب/تأثير اسم).
   * الأولوية: معاينة المحرر ← الإطار المشترى ← تأثيرات الرتبة.
   * الإطار المدفوع يظهر على **وجهي البطاقة** (قرار مقفل).
   */
  cosmetics?: {
    /** `emblemId` شعار SVG يعلو البطاقة — كان يُرسم في معاينة المتجر فقط */
    frame?: { config?: any; emblemId?: string | null } | null;
    title?: { config?: { text?: string; style?: string } } | null;
    nameFx?: { config?: { nameEffect?: any } } | null;
  } | null;
  /** وضع السحب — يسمح بتحريك العناصر */
  rankEditable?: boolean;
  /** تجاوز: استخدم القالب القديم (MafiaCard) بدلاً من DB */
  forceClassic?: boolean;
  /** إخفاء هوية اللاعب (الرقم/الاسم) على الوجه السري — لعرض الدور فقط */
  hideIdentity?: boolean;
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
  flipDurationMs = 700,
  className = '',
  avatarUrl = null,
  rankTier = 'INFORMANT',
  rankEffectsOverride,
  rankEditable = false,
  forceClassic = false,
  hideIdentity = false,
  cosmetics = null,
}: DynamicMafiaCardProps) {
  const tier = (rankTier || 'INFORMANT');
  const { getRoleById, getCardForRole, getRoleName, isDynamicMafia, isDynamicNeutral, getRankEffectsForTier, loading } = useGameConfig();
  const rankDef = getRankEffectsForTier(tier);
  const paidFrameCfg = cosmetics?.frame?.config;

  // 🪙 تسوية التأثيرات — بعدها يقرأ المُصيّر كل القنوات بلا حماية:
  //    كل مفتاح موجود، وكل لون صالح، وكل رقم مقصوص.
  //
  // الأولوية: معاينة المحرّر ← دمج (المشترى فوق الرتبة) ← الرتبة وحدها.
  // ⚠️ إعداد مشترى فارغ أو مكسور **لا يحجب** تأثير الرتبة — كان `{}` كائناً
  //    صادقاً منطقياً فيُسقط شكل الرتبة ولا يعطي شيئاً مكانه.
  const fx = React.useMemo(() => {
    if (rankEffectsOverride) return normalizeFx(rankEffectsOverride);
    const paid = normalizeFx(paidFrameCfg);
    return hasAnyEnabled(paid) ? mergeFx(rankDef?.effects, paidFrameCfg) : normalizeFx(rankDef?.effects);
  }, [rankEffectsOverride, paidFrameCfg, rankDef]);

  // تأثير الاسم المشترى يعلو تأثير الإطار/الرتبة
  const nameFx = React.useMemo(() => {
    const bought = cosmetics?.nameFx?.config?.nameEffect;
    return bought ? normalizeFx({ nameEffect: bought }).nameEffect : fx.nameEffect;
  }, [cosmetics?.nameFx?.config?.nameEffect, fx]);

  // 🪙 نمط الاسم المشترك بين وجهَي البطاقة — قرار المالك (٤): تأثير الاسم على
  //    الوجهين، ولوحة اللقب على وجه الغلاف فقط (وجه الدور مزدحم وستتصادم
  //    اللوحة مع اسم الدور). لا يُعاد فتح هذا القرار.
  const nameFxStyle: React.CSSProperties = nameFx?.enabled
    ? {
        color: nameFx.color,
        textShadow: `0 0 ${nameFx.glowSize}px ${hexToRgba(nameFx.glowColor, 0.45)}, 0 0 ${nameFx.glowSize * 2.5}px ${hexToRgba(nameFx.glowColor, 0.18)}`,
      }
    : {};

  const titleCfg = cosmetics?.title?.config || null;
  const emblemId = cosmetics?.frame?.emblemId || null;
  /** حجم الشعار تبعاً لحجم البطاقة — يبقى متناسباً من الهاتف إلى شاشة القاعة */
  const emblemSize = size === 'sm' ? 40 : size === 'lg' ? 72 : 56;
  const hasRankEffects = hasLayerVisuals(fx);
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
  const borderColor = cardTemplate?.borderColor || 'rgba(197,160,89,0.55)'; // fallback ذهبي (كان zinc رمادياً خارج الهوية)
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
  let iconImageUrl: string | null = null;

  if (iconConfig) {
    if (iconConfig.type === 'lucide') {
      RoleIcon = getLucideIcon(iconConfig.value);
    } else if (iconConfig.type === 'emoji') {
      iconEmoji = iconConfig.value;
    } else if (iconConfig.type === 'image' || iconConfig.type === 'IMAGE') {
      // صورة مرفوعة — القيمة هي URL الصورة
      const imgVal = iconConfig.value || iconConfig.url || '';
      iconImageUrl = imgVal.startsWith('http') ? imgVal : (imgVal ? `${SOCKET_URL}${imgVal}` : null);
    }
  } else {
    // fallback للأيقونات القديمة
    const classicIcons: Record<string, LucideIcon> = {
      GODFATHER: Crown, SILENCER: Scissors, CHAMELEON: Drama,
      MAFIA_REGULAR: Skull, SHERIFF: Shield, DOCTOR: HeartPulse,
      SNIPER: Crosshair, POLICEWOMAN: BadgeAlert, NURSE: Syringe, MAYOR: Landmark, CITIZEN: User,
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
        className="relative w-full h-full cursor-pointer"
        style={{
          transition: `transform ${flipDurationMs}ms cubic-bezier(.2,.7,.2,1)`,
          transformStyle: 'preserve-3d',
          WebkitTransformStyle: 'preserve-3d' as any,
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* ══════════════════════════════════ */}
        {/* 🂠 الوجه الأمامي — الشكل السري    */}
        {/* ══════════════════════════════════ */}
        <div
          className={`absolute inset-0 rounded-2xl overflow-hidden bg-black ${isSilenced ? 'ring-2 ring-rose-600/60' : ''}`}
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden' as any,
            transform: 'translateZ(0)',
            border: `2px solid ${borderColor || (isFemale ? 'rgba(168,85,247,0.4)' : 'rgba(197,160,89,0.4)')}`,
          }}
        >
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

            {isSilenced && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-rose-900/80 border border-rose-500/40 px-2 py-0.5 rounded-full" style={{ zIndex: 20 }}>
                <span className="text-[10px] text-rose-300 font-bold">🔇 مُسكَت</span>
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
                  <h2 className={`${nameSize} font-black text-white leading-tight`} style={{ fontFamily: font, ...nameFxStyle }}>{truncatedName}</h2>
                  <span className={`font-mono font-black transition-all duration-300 ${{ sm: 'text-3xl', md: 'text-4xl', lg: 'text-5xl', fluid: 'text-4xl' }[size]} ${votes > 0 ? 'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.6)]' : 'text-zinc-600 group-hover:text-zinc-400'}`}>{votes}</span>
                </div>
                <p className="text-[8px] font-mono tracking-[0.25em] uppercase mt-1" style={{ color: isFemale ? 'rgba(192,132,252,0.4)' : 'rgba(197,160,89,0.4)', ...(cardTemplate?.elements?.positions?.coverBranding ? { transform: `translate(${cardTemplate.elements.positions.coverBranding.x}px, ${cardTemplate.elements.positions.coverBranding.y}px) scale(${cardTemplate.elements.positions.coverBranding.s || 1})` } : {}) }}>MAFIA CLUB</p>
              </div>
            ) : (
              <>
                <h2 className={`${nameSize} font-black text-white text-center leading-tight ${tier === 'GODFATHER' && !nameFx?.enabled ? 'rank-name-glow' : ''}`} style={{ fontFamily: font, ...nameFxStyle, ...(cardTemplate?.elements?.positions?.coverName ? { transform: `translate(${cardTemplate.elements.positions.coverName.x}px, ${cardTemplate.elements.positions.coverName.y}px) scale(${cardTemplate.elements.positions.coverName.s || 1})` } : {}) }}>{truncatedName}</h2>
                {/* 🪙 لوحة اللقب المشترى — تحت الاسم مباشرة */}
                {titleCfg?.text && (
                  <div className={`chips-title-plaque chips-title-${titleCfg.style || 'gold'}`}>{titleCfg.text}</div>
                )}
                <p className="text-[8px] font-mono tracking-[0.25em] uppercase mt-1" style={{ color: isFemale ? 'rgba(192,132,252,0.4)' : 'rgba(197,160,89,0.4)', ...(cardTemplate?.elements?.positions?.coverBranding ? { transform: `translate(${cardTemplate.elements.positions.coverBranding.x}px, ${cardTemplate.elements.positions.coverBranding.y}px) scale(${cardTemplate.elements.positions.coverBranding.s || 1})` } : {}) }}>MAFIA CLUB</p>
                {flippable && (
                  <span className="text-[10px] text-zinc-500 mt-1" style={cardTemplate?.elements?.positions?.coverFooter ? { transform: `translate(${cardTemplate.elements.positions.coverFooter.x}px, ${cardTemplate.elements.positions.coverFooter.y}px) scale(${cardTemplate.elements.positions.coverFooter.s || 1})` } : {}}>اضغط للكشف</span>
                )}
              </>
            )}

          </div>

          {/* Shapes on Cover Face — على مستوى الكارد كامل (مثل المحرر) */}
          {(cardTemplate?.elements?.shapes || []).filter((s:any) => s.face === 'cover').map((s:any) => (
            <div key={s.id} className="absolute pointer-events-none" style={{ width: s.w, height: s.h, backgroundColor: s.bg, opacity: s.opacity, zIndex: s.zIndex || 3, borderRadius: s.radius, top: '50%', left: '50%', marginTop: -s.h/2, marginLeft: -s.w/2, transform: `translate(${s.x || 0}px, ${s.y || 0}px)` }} />
          ))}

          {/* رقم اللاعب — خارج overflow-hidden ليكون دائماً فوق الأشكال */}
          <div className="absolute pointer-events-none flex items-center justify-center" style={{ top: 0, left: 0, right: 0, height: '66.66%', zIndex: 15 }}>
            {playerNumber >= 10 ? (
              <div
                className="font-mono font-black flex flex-col items-center leading-none"
                style={{
                  color: isFemale ? 'rgba(216,180,254,1)' : 'rgba(197,160,89,1)',
                  fontSize: size === 'sm' ? '3.2rem' : size === 'md' ? '4.5rem' : size === 'lg' ? '5.5rem' : '4.5rem',
                  opacity: resolvedAvatarUrl ? 0.9 : 0.55,
                  textShadow: resolvedAvatarUrl ? '0 2px 10px rgba(0,0,0,0.9)' : '0 2px 12px rgba(0,0,0,0.95), 0 0 30px rgba(197,160,89,0.15)',
                  lineHeight: 0.85,
                  ...(cardTemplate?.elements?.positions?.coverNumber ? { transform: `translate(${cardTemplate.elements.positions.coverNumber.x}px, ${cardTemplate.elements.positions.coverNumber.y}px) scale(${cardTemplate.elements.positions.coverNumber.s || 1})` } : {})
                }}
              >
                {String(playerNumber).split('').map((digit, i) => (
                  <span key={i}>{digit}</span>
                ))}
              </div>
            ) : (
              <span
                className="font-mono font-black"
                style={{
                  color: isFemale ? 'rgba(216,180,254,1)' : 'rgba(197,160,89,1)',
                  fontSize: size === 'sm' ? '4rem' : size === 'md' ? '5.5rem' : size === 'lg' ? '7rem' : '5.5rem',
                  opacity: resolvedAvatarUrl ? 0.9 : 0.55,
                  textShadow: resolvedAvatarUrl ? '0 2px 10px rgba(0,0,0,0.9)' : '0 2px 12px rgba(0,0,0,0.95), 0 0 30px rgba(197,160,89,0.15)',
                  lineHeight: 1,
                  ...(cardTemplate?.elements?.positions?.coverNumber ? { transform: `translate(${cardTemplate.elements.positions.coverNumber.x}px, ${cardTemplate.elements.positions.coverNumber.y}px) scale(${cardTemplate.elements.positions.coverNumber.s || 1})` } : {})
                }}
              >
                {playerNumber}
              </span>
            )}
          </div>
        </div>

        {/* ── 🎖️ Rank Effects Overlay — طبقة منفصلة فوق الكارد ── */}
        {/* 🪙 تُرسم مرتين: للوجه الأمامي وللوجه الخلفي (الإطار المدفوع على الوجهين — قرار مقفل) */}
        {(hasRankEffects || !!emblemId) && [false, true].map((isBack) => (
          <CardFxBoundary key={isBack ? 'fx-back' : 'fx-front'}>
          <div
            className={`absolute inset-0 rounded-2xl overflow-visible ${rankEditable && !isBack ? '' : 'pointer-events-none'}`}
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden' as any,
              transform: isBack ? 'rotateY(180deg) translateZ(1px)' : 'translateZ(1px)',
              zIndex: 60,
            }}
          >
            {/* Border */}
            {fx.border.enabled && (
              <div style={{
                position: 'absolute', inset: `${fx.border.inset}px`, borderRadius: '1rem', pointerEvents: 'none', zIndex: 50,
                border: fx.border.style === 'solid' ? `${fx.border.width}px solid ${hexToRgba(fx.border.color, 0.5)}` : 'none',
                ...(fx.border.style !== 'solid' ? {
                  padding: `${fx.border.width}px`,
                  background: `linear-gradient(135deg, ${(fx.border.gradientColors || [fx.border.color]).join(', ')})`,
                  backgroundSize: fx.border.style === 'traveling' ? '200% 200%' : undefined,
                  animation: [
                    fx.border.style === 'traveling' ? `border-travel ${fx.border.travelSpeed}s linear infinite` : '',
                    fx.glow.pulseEnabled ? `rank-pulse ${fx.glow.pulseDuration}s ease-in-out infinite` : '',
                  ].filter(Boolean).join(', ') || undefined,
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  maskComposite: 'exclude' as any,
                } : {}),
                boxShadow: fx.glow.enabled ? `0 0 ${fx.glow.size}px ${hexToRgba(fx.glow.color, fx.glow.opacity)}` : undefined,
                ...(fx.glow.pulseEnabled && fx.border.style === 'solid' ? { animation: `rank-pulse ${fx.glow.pulseDuration}s ease-in-out infinite`, '--rank-glow': `0 0 ${fx.glow.size}px ${hexToRgba(fx.glow.color, fx.glow.opacity)}`, '--rank-glow-strong': `0 0 ${fx.glow.size * 1.6}px ${hexToRgba(fx.glow.color, Math.min(1, fx.glow.opacity * 1.5))}` } as any : {}),
              }} />
            )}
            {/* Corners — أربع زوايا زخرفية.
                ⚠️ كانت قناة ميتة: معرَّفة في النوع، ومبذورة في كل صفّ، ولها
                CSS جاهز — ولا تُرسم أبداً. ورتبة CAPO تشحنها مفعّلة، أي أن
                تنفيذها يُصلح رتبة مكسورة لا يضيف ميزة (قرار المالك ٢). */}
            {fx.corners.enabled && (['tl', 'tr', 'bl', 'br'] as const).map((pos) => (
              <div
                key={`corner-${pos}`}
                style={{
                  position: 'absolute', zIndex: 51, pointerEvents: 'none',
                  width: fx.corners.size, height: fx.corners.size,
                  borderColor: hexToRgba(fx.corners.color, 0.75),
                  borderStyle: 'solid', borderWidth: 0,
                  ...(pos === 'tl' ? { top: 2, left: 2, borderTopWidth: fx.corners.width, borderLeftWidth: fx.corners.width, borderTopLeftRadius: 4 } : {}),
                  ...(pos === 'tr' ? { top: 2, right: 2, borderTopWidth: fx.corners.width, borderRightWidth: fx.corners.width, borderTopRightRadius: 4 } : {}),
                  ...(pos === 'bl' ? { bottom: 2, left: 2, borderBottomWidth: fx.corners.width, borderLeftWidth: fx.corners.width, borderBottomLeftRadius: 4 } : {}),
                  ...(pos === 'br' ? { bottom: 2, right: 2, borderBottomWidth: fx.corners.width, borderRightWidth: fx.corners.width, borderBottomRightRadius: 4 } : {}),
                  ...(fx.corners.pulseEnabled ? { animation: 'corner-pulse 2.5s ease-in-out infinite' } : {}),
                }}
              />
            ))}
            {/* Badge */}
            {fx.badge.enabled && (
              <div data-rank-el="badge" style={{
                position: 'absolute', top: 4 + (fx.badge.offsetY || 0), left: 4 + (fx.badge.offsetX || 0), zIndex: 55,
                display: 'flex', alignItems: 'center', gap: 2,
                padding: '2px 5px', borderRadius: 6,
                fontSize: 10, fontWeight: 700, fontFamily: 'Inter, sans-serif', letterSpacing: '0.05em',
                backdropFilter: 'blur(4px)', pointerEvents: rankEditable ? 'auto' : 'none',
                cursor: rankEditable ? 'grab' : undefined,
                background: fx.badge.bgColor, color: fx.badge.textColor,
                border: `1px solid ${fx.badge.borderColor}`,
                transform: `scale(${fx.badge.scale || 1})`, transformOrigin: 'top left',
              }}>
                <span>{fx.badge.emoji}</span>
                <span>{fx.badge.label}</span>
              </div>
            )}
            {/* SVG Decorative Frame */}
            {fx.frame?.enabled && fx.frame.type !== 'none' && (
              <RankFrame
                type={fx.frame.type}
                color={fx.frame.color}
                opacity={fx.frame.opacity}
                strokeWidth={fx.frame.strokeWidth}
                animate={fx.frame.animate}
              />
            )}
            {/* Gradient overlay */}
            {fx.gradientOverlay.enabled && (
              <div style={{ position: 'absolute', inset: 0, borderRadius: '1rem', pointerEvents: 'none', zIndex: 49, background: `linear-gradient(${fx.gradientOverlay.direction}, ${hexToRgba(fx.gradientOverlay.color, fx.gradientOverlay.opacity)}, transparent 50%)` }} />
            )}
            {/* Shimmer */}
            {fx.shimmer.enabled && (
              <div style={{ position: 'absolute', inset: 0, borderRadius: '1rem', overflow: 'hidden', pointerEvents: 'none', zIndex: 52 }}>
                <div style={{ position: 'absolute', top: '-50%', left: '-50%', width: '40%', height: '200%', background: `linear-gradient(90deg, transparent, ${hexToRgba(fx.shimmer.color, fx.shimmer.opacity)}, ${hexToRgba('#ffffff', 0.04)}, transparent)`, animation: `rank-shimmer ${fx.shimmer.duration}s ease-in-out infinite`, transform: 'rotate(25deg)' }} />
              </div>
            )}
            {/* Particles */}
            {fx.particles.enabled && Array.from({ length: fx.particles.count }).map((_, i) => {
              const isBurst = fx.particles.animationType === 'burst';
              const originX = fx.particles.originX ?? 50;
              const originY = fx.particles.originY ?? 50;
              return (
                <div key={i} data-rank-el="particle" style={{
                  position: 'absolute', width: fx.particles.size, height: fx.particles.size,
                  background: hexToRgba(fx.particles.color, 0.8), borderRadius: '50%',
                  top: `${originY}%`, left: `${originX}%`, zIndex: 53,
                  boxShadow: `0 0 ${fx.particles.size * 2}px ${hexToRgba(fx.particles.color, 0.4)}`,
                  ...(isBurst ? {
                    animation: `particle-burst-${i % 8} ${fx.particles.baseDuration + i * 0.3}s ease-out infinite`,
                    animationDelay: `${i * (fx.particles.baseDuration / fx.particles.count)}s`,
                  } : {
                    '--orbit-radius': fx.particles.orbitRadius,
                    '--duration': `${fx.particles.baseDuration + i * 0.8}s`,
                    '--delay': `${i * 0.7}s`,
                    animation: `particle-orbit var(--duration) linear infinite`,
                    animationDelay: `var(--delay)`,
                  }),
                } as React.CSSProperties} />
              );
            })}
            {/* Floating element */}
            {fx.floating.enabled && (
              <div data-rank-el="floating" style={{
                position: 'absolute',
                top: (fx.floating.offsetY !== undefined ? fx.floating.offsetY : (fx.floating.position === 'top' ? -14 : undefined)),
                bottom: (fx.floating.offsetY === undefined && fx.floating.position === 'bottom') ? -14 : undefined,
                left: `calc(50% + ${fx.floating.offsetX || 0}px)`, transform: `translateX(-50%) scale(${fx.floating.scale || 1})`, fontSize: fx.floating.size, zIndex: 55, lineHeight: 1,
                animation: rankEditable ? 'none' : (fx.floating.animation === 'float' ? 'crown-float 2.5s ease-in-out infinite' : fx.floating.animation === 'spin' ? 'particle-orbit 4s linear infinite' : 'crown-float 1.5s ease-in-out infinite'),
                filter: `drop-shadow(0 0 6px ${hexToRgba(fx.floating.glowColor, 0.6)})`,
                pointerEvents: rankEditable ? 'auto' : 'none',
                cursor: rankEditable ? 'grab' : undefined,
              }}>{fx.floating.content}</div>
            )}
            {/* 🪙 شعار الإطار المشترى — يعلو البطاقة.
                ⚠️ كان يُرسم في **معاينة المتجر فقط** ولا يقرؤه المحرّك إطلاقاً،
                فكان «جرّب قبل الشراء» يعرض أكثر مما يُسلَّم — أسوأ فئة خلل
                تجارياً. يُرسم الآن على البطاقة الحقيقية وعلى وجهَيها. */}
            {emblemId && (
              <div
                className="absolute pointer-events-none"
                style={{
                  top: -Math.round(emblemSize * 0.42), left: '50%', transform: 'translateX(-50%)',
                  zIndex: 75, filter: 'drop-shadow(0 5px 10px rgba(0,0,0,0.65))',
                }}
              >
                <ChipsEmblem id={emblemId as EmblemId} size={emblemSize} />
              </div>
            )}
          </div>
          </CardFxBoundary>
        ))}

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
          {/* ── محتوى الوجه الخلفي: صورة مخصصة أو تصميم ديناميكي ── */}
          {cardTemplate?.secretFace?.customImageUrl ? (
            /* ✅ وضع الصورة المخصصة — تُعرض كخلفية كاملة بدون أي عنصر ديناميكي */
            <img
              src={cardTemplate.secretFace.customImageUrl.startsWith('http')
                ? cardTemplate.secretFace.customImageUrl
                : `${SOCKET_URL}${cardTemplate.secretFace.customImageUrl}`}
              alt={roleName}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            /* التصميم الديناميكي العادي (gradient + icon + badge...) */
            <>
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
                {/* رقم اللاعب صغير — يُخفى عند hideIdentity (مثل تعطيل الساحرة) */}
                {!hideIdentity && (
                  <div
                    className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center font-mono text-sm font-bold rounded-md bg-black/40"
                    style={{ border: `1px solid ${borderColor}`, color: textColor, ...(cardTemplate?.elements?.positions?.number ? { transform: `translate(${cardTemplate.elements.positions.number.x}px, ${cardTemplate.elements.positions.number.y}px) scale(${cardTemplate.elements.positions.number.s || 1})` } : {}) }}
                  >
                    {playerNumber}
                  </div>
                )}

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
                  {iconImageUrl ? (
                    <img src={iconImageUrl} alt={roleName} className="w-full h-full object-cover rounded-full" />
                  ) : iconEmoji ? (
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

                {/* اسم اللاعب — يُخفى عند hideIdentity */}
                {/* 🪙 تأثير الاسم المشترى يسري هنا أيضاً (قرار المالك ٤): كان
                    يظهر على وجه الغلاف فقط فيختفي لحظة انقلاب البطاقة في
                    مراسم الكشف — أي في أكثر لحظة يراها الجميع. */}
                {!hideIdentity && cardTemplate?.elements?.showPlayerNumber !== false && (
                  <p
                    className={`text-sm max-w-[85%] truncate mx-auto ${nameFx?.enabled ? 'font-bold' : 'text-white/50'}`}
                    dir="auto"
                    style={{ fontFamily: 'Amiri, serif', ...nameFxStyle, ...(cardTemplate?.elements?.positions?.playerName ? { transform: `translate(${cardTemplate.elements.positions.playerName.x}px, ${cardTemplate.elements.positions.playerName.y}px) scale(${cardTemplate.elements.positions.playerName.s || 1})` } : {}) }}
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
                    flippable && <span className="text-[10px] text-zinc-500">
                      اضغط للإخفاء
                    </span>
                  )}
                </div>
              </div>

              {/* Shapes on Role Face (Rendered last to sit on top) */}
              {(cardTemplate?.elements?.shapes || []).filter((s:any) => s.face === 'role').map((s:any) => (
                <div key={s.id} className="absolute pointer-events-none" style={{ width: s.w, height: s.h, backgroundColor: s.bg, opacity: s.opacity, zIndex: s.zIndex, borderRadius: s.radius, top: '50%', left: '50%', marginTop: -s.h/2, marginLeft: -s.w/2 }} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
