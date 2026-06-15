'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, Target, Shield, Eye, Vote, MessageCircle } from 'lucide-react';
import { ROLE_NAMES, ROLE_ICONS, Role } from '@/lib/constants';

interface AssassinContract {
  id: number;
  type: string;
  targetRole: string;
  description: string;
  descriptionAr?: string;
  completed: boolean;
  completedAtRound?: number;
}

interface MafiaTeamGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  team: {
    physicalId: number;
    name: string;
    role: string;
    avatarUrl?: string | null;
  }[];
  // 🔪 بيانات السفّاح
  isAssassin?: boolean;
  assassinContracts?: {
    contracts: AssassinContract[];
    currentIndex: number;
    completedCount: number;
    totalRequired: number;
  } | null;
}

// ── أيقونة الدور حسب role string ──
function getRoleIcon(role: string): string {
  return ROLE_ICONS[role as Role] || '🎭';
}
function getRoleName(role: string): string {
  return ROLE_NAMES[role as Role] || role;
}

export default function MafiaTeamGallery({ isOpen, onClose, team, isAssassin, assassinContracts }: MafiaTeamGalleryProps) {
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center isolate">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-sm mx-auto flex flex-col items-center justify-center p-4"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute -top-12 right-4 p-2 bg-[#1a0505] border border-[#8A0303]/50 rounded-full text-[#8A0303] hover:bg-[#8A0303] hover:text-white transition-colors z-10"
            >
              <X size={24} />
            </button>

            {/* ══ عرض السفّاح: المهام ══ */}
            {isAssassin && assassinContracts ? (
              <>
                <div className="mb-6 flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-[#1a0505] border border-[#8A0303] flex items-center justify-center mb-2 shadow-[0_0_15px_rgba(138,3,3,0.5)]">
                    <Target size={24} className="text-[#8A0303]" />
                  </div>
                  <h2 className="text-xl font-bold text-red-500 tracking-widest text-center">
                    عقود الاغتيال
                  </h2>
                  <p className="text-red-500/60 text-xs mt-1 text-center font-mono">
                    {assassinContracts.completedCount}/{assassinContracts.totalRequired} عقود مُنجزة
                  </p>
                </div>

                {/* شريط التقدم */}
                <div className="w-full max-w-sm mb-5 px-2">
                  <div className="h-2 bg-[#1a0505] rounded-full overflow-hidden border border-[#8A0303]/20">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(assassinContracts.completedCount / assassinContracts.totalRequired) * 100}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ background: 'linear-gradient(90deg, #8A0303, #dc2626)' }}
                    />
                  </div>
                </div>

                {/* قائمة العقود */}
                <div className="w-full max-w-sm space-y-3 max-h-[50vh] overflow-y-auto px-2 pb-4">
                {assassinContracts.contracts.map((contract, i) => {
                    const isCompleted = contract.completed;
                    const isActive = !contract.completed;

                    return (
                      <motion.div
                        key={contract.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className={`relative rounded-2xl p-4 border-2 transition-all ${
                          isCompleted
                            ? 'border-green-500/30 bg-gradient-to-r from-green-950/30 to-green-950/10'
                            : 'border-[#8A0303]/60 bg-gradient-to-r from-[#1a0505] to-[#0d0202] shadow-[0_0_20px_rgba(138,3,3,0.3)]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* رقم العقد */}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-black text-sm ${
                            isCompleted
                              ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                              : 'bg-[#8A0303]/20 border-2 border-[#8A0303] text-red-400'
                          }`}>
                            {isCompleted ? '✅' : (
                              <motion.span
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                              >
                                🔪
                              </motion.span>
                            )}
                          </div>

                          {/* وصف المهمة */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold ${
                              isCompleted ? 'text-green-400 line-through' : 'text-white'
                            }`}>
                              {contract.descriptionAr || contract.description}
                            </p>
                            {isCompleted && contract.completedAtRound && (
                              <p className="text-[10px] text-green-500/60 font-mono mt-0.5">
                                أُنجز في الجولة {contract.completedAtRound}
                              </p>
                            )}
                            {isActive && (
                              <p className="text-[10px] text-red-400/60 font-mono mt-0.5 animate-pulse">
                                اقتل صاحب هذا الدور!
                              </p>
                            )}
                          </div>
                        </div>

                        {/* مؤشر النشاط */}
                        {isActive && (
                          <motion.div
                            className="absolute -right-1 top-1/2 -translate-y-1/2 w-1.5 h-8 rounded-full"
                            style={{ background: '#8A0303' }}
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                          />
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </>
            ) : (
              /* ══ عرض المافيا / المواطن ══ */
              <>
                {team.length > 0 ? (
                  /* ── فريق المافيا: Grid مضغوط ثابت ── */
                  <>
                    <div className="mb-5 flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-[#1a0505] border border-[#8A0303] flex items-center justify-center mb-2 shadow-[0_0_15px_rgba(138,3,3,0.5)]">
                        <Users size={24} className="text-[#8A0303]" />
                      </div>
                      <h2 className="text-xl font-bold text-red-500 tracking-widest text-center" style={{ fontFamily: 'Amiri, serif' }}>
                        شركاؤك
                      </h2>
                      <p className="text-red-500/40 text-[10px] mt-1 text-center font-mono tracking-widest uppercase">
                        {team.length} في الفريق
                      </p>
                    </div>

                    {/* Grid: 3 أعمدة — كل شيء مرئي دفعة واحدة */}
                    <div className="w-full grid grid-cols-3 gap-3 px-2">
                      {team.map((member, i) => (
                        <motion.div
                          key={member.physicalId}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.07, type: 'spring', stiffness: 300, damping: 25 }}
                          className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border border-[#8A0303]/30 bg-gradient-to-b from-[#1a0505] to-[#0d0202]"
                        >
                          {/* الأفاتار / الأيقونة */}
                          <div className="relative">
                            {member.avatarUrl ? (
                              <img
                                src={member.avatarUrl}
                                alt={member.name}
                                className="w-14 h-14 rounded-full object-cover border-2 border-[#8A0303]/60"
                              />
                            ) : (
                              <div className="w-14 h-14 rounded-full bg-[#0d0202] border-2 border-[#8A0303]/60 flex items-center justify-center text-2xl">
                                {getRoleIcon(member.role)}
                              </div>
                            )}
                            {/* رقم المقعد */}
                            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#8A0303] flex items-center justify-center">
                              <span className="text-white text-[10px] font-black font-mono">{member.physicalId}</span>
                            </div>
                          </div>

                          {/* الاسم */}
                          <p className="text-white text-[11px] font-bold text-center leading-tight truncate w-full" dir="rtl">
                            {member.name}
                          </p>

                          {/* الدور */}
                          <span className="text-red-400/70 text-[9px] font-mono text-center leading-tight">
                            {getRoleName(member.role)}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </>
                ) : (
                  /* ── المواطن / المحايد: محتوى بنفس الحجم البصري ── */
                  <>
                    <div className="mb-5 flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-[#1a0505] border border-[#8A0303] flex items-center justify-center mb-2 shadow-[0_0_15px_rgba(138,3,3,0.5)]">
                        <Shield size={24} className="text-[#8A0303]" />
                      </div>
                      <h2 className="text-xl font-bold text-red-500 tracking-widest text-center" style={{ fontFamily: 'Amiri, serif' }}>
                        ملف استخباراتي
                      </h2>
                      <p className="text-red-500/40 text-[10px] mt-1 text-center font-mono tracking-widest uppercase">
                        INTELLIGENCE BRIEFING
                      </p>
                    </div>

                    <div className="w-full space-y-3 px-2">
                      {[
                        { icon: <Eye size={18} className="text-red-400" />, text: 'راقب ردود فعل اللاعبين أثناء النقاش', sub: 'التوتر المفاجئ قد يكشف المافيا' },
                        { icon: <MessageCircle size={18} className="text-red-400" />, text: 'انتبه لمن يُوجّه الاتهامات بدون دليل', sub: 'المافيا تحاول تشتيت الانتباه' },
                        { icon: <Vote size={18} className="text-red-400" />, text: 'صوّت بحكمة بناءً على الملاحظات', sub: 'لا تتبع القطيع — فكّر بنفسك' },
                        { icon: <Shield size={18} className="text-red-400" />, text: 'لا تكشف دورك حتى لو ضُغط عليك', sub: 'الصمت أحياناً أقوى سلاح' },
                      ].map((tip, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.08 }}
                          className="flex items-start gap-3 p-3 rounded-xl border border-[#8A0303]/20 bg-gradient-to-r from-[#1a0505]/80 to-[#0d0202]/50"
                        >
                          <div className="w-9 h-9 rounded-lg bg-[#8A0303]/10 border border-[#8A0303]/30 flex items-center justify-center shrink-0">
                            {tip.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs font-bold" dir="rtl">{tip.text}</p>
                            <p className="text-red-500/40 text-[10px] mt-0.5 font-mono" dir="rtl">{tip.sub}</p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
