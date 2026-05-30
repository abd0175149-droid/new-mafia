'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, Target } from 'lucide-react';
import MafiaCard from './MafiaCard';

interface AssassinContract {
  id: number;
  type: string;
  targetRole: string;
  description: string;
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
            className="relative w-full max-w-lg mx-auto flex flex-col items-center justify-center p-4"
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
                    const isCurrent = i === assassinContracts.currentIndex && !contract.completed;
                    const isCompleted = contract.completed;
                    const isFuture = i > assassinContracts.currentIndex && !contract.completed;

                    return (
                      <motion.div
                        key={contract.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className={`relative rounded-2xl p-4 border-2 transition-all ${
                          isCompleted
                            ? 'border-green-500/30 bg-gradient-to-r from-green-950/30 to-green-950/10'
                            : isCurrent
                            ? 'border-[#8A0303]/60 bg-gradient-to-r from-[#1a0505] to-[#0d0202] shadow-[0_0_20px_rgba(138,3,3,0.3)]'
                            : 'border-[#222] bg-[#111]/50 opacity-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* رقم العقد */}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-black text-sm ${
                            isCompleted
                              ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                              : isCurrent
                              ? 'bg-[#8A0303]/20 border-2 border-[#8A0303] text-red-400'
                              : 'bg-[#1a1a1a] border border-[#333] text-[#555]'
                          }`}>
                            {isCompleted ? '✅' : isCurrent ? (
                              <motion.span
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                              >
                                🔪
                              </motion.span>
                            ) : `${contract.id}`}
                          </div>

                          {/* وصف المهمة */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold ${
                              isCompleted ? 'text-green-400 line-through' : isCurrent ? 'text-white' : 'text-[#555]'
                            }`}>
                              {contract.description}
                            </p>
                            {isCompleted && contract.completedAtRound && (
                              <p className="text-[10px] text-green-500/60 font-mono mt-0.5">
                                أُنجز في الجولة {contract.completedAtRound}
                              </p>
                            )}
                            {isCurrent && (
                              <p className="text-[10px] text-red-400/60 font-mono mt-0.5 animate-pulse">
                                المهمة الحالية — أنجزها!
                              </p>
                            )}
                          </div>
                        </div>

                        {/* مؤشر الحالة الحالية */}
                        {isCurrent && (
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
              /* ══ عرض المافيا العادي ══ */
              <>
                <div className="mb-6 flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-[#1a0505] border border-[#8A0303] flex items-center justify-center mb-2 shadow-[0_0_15px_rgba(138,3,3,0.5)]">
                    <Users size={24} className="text-[#8A0303]" />
                  </div>
                  <h2 className="text-xl font-bold text-red-500 tracking-widest text-center">
                    فريق المافيا
                  </h2>
                  <p className="text-red-500/60 text-xs mt-1 text-center font-mono">
                    اسحب يميناً ويساراً للتنقل - اضغط على الكارد لكشف الدور
                  </p>
                </div>

                {team.length > 0 ? (
                  <>
                    {/* Gallery Container */}
                    <div className="w-full max-w-[100vw] overflow-x-auto snap-x snap-mandatory flex gap-4 px-4 pb-8 pt-4 hide-scrollbar touch-pan-x">
                      {team.map((member, index) => (
                        <div 
                          key={member.physicalId} 
                          className="snap-center shrink-0 flex items-center justify-center"
                          style={{ width: '80vw', maxWidth: '280px' }}
                        >
                          <MafiaCard
                            playerNumber={member.physicalId}
                            playerName={member.name}
                            role={member.role}
                            avatarUrl={member.avatarUrl}
                            size="fluid"
                            className="w-full aspect-[3/4] max-h-[60vh]"
                            flippable={true}
                          />
                        </div>
                      ))}
                    </div>
                    
                    {/* Dots indicator */}
                    {team.length > 1 && (
                      <div className="flex gap-2 mt-2">
                        {team.map((_, i) => (
                          <div key={i} className="w-2 h-2 rounded-full bg-[#8A0303]/40 border border-[#8A0303]/20" />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12 px-4 border border-[#8A0303]/20 bg-[#1a0505]/50 rounded-2xl w-full max-w-sm mt-4">
                    <Users size={48} className="mx-auto text-[#8A0303]/40 mb-4" />
                    <p className="text-[#8A0303] font-bold text-lg">أنت لست من المافيا</p>
                    <p className="text-[#8A0303]/60 text-sm mt-2">ليس لديك شركاء لتتعرف عليهم</p>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
