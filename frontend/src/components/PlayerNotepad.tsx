import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type SuspicionLevel = 'safe' | 'suspect' | 'mafia' | 'none';

export interface PlayerNote {
  text: string;
  suspicion: SuspicionLevel;
}

interface PlayerNotepadProps {
  roomId: string;
  myPhysicalId: number;
  players: any[]; // Array of player objects with { physicalId, name, avatarUrl }
  isOpen: boolean;
  onClose: () => void;
  onNotesChange: (notes: Record<number, PlayerNote>) => void;
}

export default function PlayerNotepad({ roomId, myPhysicalId, players, isOpen, onClose, onNotesChange }: PlayerNotepadProps) {
  const [notes, setNotes] = useState<Record<number, PlayerNote>>({});
  const storageKey = `mafia_notes_${roomId}_${myPhysicalId}`;

  // Load notes on mount or open
  useEffect(() => {
    if (isOpen) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          setNotes(parsed);
          onNotesChange(parsed);
        }
      } catch (e) {
        console.error('Failed to load notes', e);
      }
    }
  }, [isOpen, roomId, myPhysicalId, storageKey]);

  const updateNote = (targetPhysicalId: number, text: string, suspicion?: SuspicionLevel) => {
    setNotes((prev) => {
      const current = prev[targetPhysicalId] || { text: '', suspicion: 'none' };
      const updated = {
        ...prev,
        [targetPhysicalId]: {
          text: text,
          suspicion: suspicion !== undefined ? suspicion : current.suspicion,
        },
      };
      localStorage.setItem(storageKey, JSON.stringify(updated));
      onNotesChange(updated);
      return updated;
    });
  };

  const getSuspicionColor = (level: SuspicionLevel) => {
    switch (level) {
      case 'safe': return 'bg-green-500 text-white border-green-400';
      case 'suspect': return 'bg-yellow-500 text-black border-yellow-400';
      case 'mafia': return 'bg-[#8A0303] text-white border-red-500';
      default: return 'bg-[#222] text-gray-400 border-[#444]';
    }
  };

  const getSuspicionLabel = (level: SuspicionLevel) => {
    switch (level) {
      case 'safe': return 'بريء 🟢';
      case 'suspect': return 'مشتبه 🟡';
      case 'mafia': return 'مافيا 🔴';
      default: return 'بلا تقييم ⚪';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className="fixed inset-0 z-[100] flex flex-col bg-black/80 backdrop-blur-md"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-[#111] border-b border-[#333]">
            <h2 className="text-xl font-bold text-[#C5A059] flex items-center gap-2">
              <span>📝</span> مفكرة التحري
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#222] text-white hover:bg-red-500 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* List of Players */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
            {players.length === 0 && (
              <p className="text-gray-400 text-center mt-10 text-sm">لم يتم العثور على لاعبين.</p>
            )}
            
            {players.map((p) => {
              if (p.physicalId === myPhysicalId) return null; // لا نكتب ملاحظات عن أنفسنا عادة، لكن ممكن تركها
              const note = notes[p.physicalId] || { text: '', suspicion: 'none' };
              
              return (
                <div key={p.physicalId} className="bg-[#1a1a1a] p-3 rounded-xl border border-[#333] flex flex-col gap-3 shadow-lg">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#222] border border-[#555] flex items-center justify-center text-sm font-bold text-white overflow-hidden">
                        {p.avatarUrl ? (
                          <img src={p.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                        ) : (
                          p.physicalId
                        )}
                      </div>
                      <span className="font-bold text-gray-200">{p.name || `لاعب ${p.physicalId}`}</span>
                    </div>

                    {/* أزرار التقييم */}
                    <div className="flex gap-1">
                      {(['safe', 'suspect', 'mafia'] as SuspicionLevel[]).map((level) => {
                        const isActive = note.suspicion === level;
                        return (
                          <button
                            key={level}
                            onClick={() => updateNote(p.physicalId, note.text, isActive ? 'none' : level)}
                            className={`px-2 py-1 text-[10px] rounded-md font-bold transition-all border ${
                              isActive ? getSuspicionColor(level) : 'bg-[#222] text-gray-400 border-[#444] opacity-50 hover:opacity-100'
                            }`}
                          >
                            {level === 'safe' ? '🟢' : level === 'suspect' ? '🟡' : '🔴'}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <textarea
                    placeholder="دوّن ملاحظاتك هنا..."
                    value={note.text}
                    onChange={(e) => updateNote(p.physicalId, e.target.value)}
                    className="w-full bg-[#0a0a0a] text-gray-300 text-sm p-2 rounded-lg border border-[#333] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none min-h-[60px] resize-none"
                    dir="auto"
                  />
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
