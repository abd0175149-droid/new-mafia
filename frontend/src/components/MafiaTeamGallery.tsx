'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users } from 'lucide-react';
import MafiaCard from './MafiaCard';

interface MafiaTeamGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  team: {
    physicalId: number;
    name: string;
    role: string;
    avatarUrl?: string | null;
  }[];
}

export default function MafiaTeamGallery({ isOpen, onClose, team }: MafiaTeamGalleryProps) {
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
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
