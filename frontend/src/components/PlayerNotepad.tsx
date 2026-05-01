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
  players: any[];
  isOpen: boolean;
  onClose: () => void;
  onNotesChange: (notes: Record<number, PlayerNote>) => void;
}

export default function PlayerNotepad({ roomId, myPhysicalId, players, isOpen, onClose, onNotesChange }: PlayerNotepadProps) {
  const [notes, setNotes] = useState<Record<number, PlayerNote>>({});
  const [activeTab, setActiveTab] = useState<'add' | 'view'>('add');
  const [currentInput, setCurrentInput] = useState('');
  
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

  const updateNote = (targetPhysicalId: number, appendedText: string, suspicion?: SuspicionLevel) => {
    setNotes((prev) => {
      const current = prev[targetPhysicalId] || { text: '', suspicion: 'none' };
      const newText = appendedText ? (current.text ? current.text + '\n' + appendedText : appendedText) : current.text;
      const updated = {
        ...prev,
        [targetPhysicalId]: {
          text: newText,
          suspicion: suspicion !== undefined ? suspicion : current.suspicion,
        },
      };
      localStorage.setItem(storageKey, JSON.stringify(updated));
      onNotesChange(updated);
      return updated;
    });
  };

  const handleAddNote = () => {
    if (!currentInput.trim()) return;
    
    // Extract @number from text
    const matches = [...currentInput.matchAll(/@(\d+)/g)];
    const pids = new Set<number>();
    matches.forEach(m => {
      const pid = parseInt(m[1]);
      if (!isNaN(pid)) pids.add(pid);
    });

    if (pids.size > 0) {
      // Add note to mentioned players
      pids.forEach(pid => {
        updateNote(pid, currentInput.trim());
      });
    } else {
      // Add to general notes (ID: 0)
      updateNote(0, currentInput.trim());
    }

    setCurrentInput('');
    // Optionally switch to view tab
    // setActiveTab('view');
  };

  const clearPlayerNoteText = (pid: number) => {
    setNotes((prev) => {
      const updated = { ...prev };
      if (updated[pid]) {
        updated[pid] = { ...updated[pid], text: '' };
      }
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-md"
        >
          {/* Header */}
          <div className="flex flex-col p-4 bg-[#111] border-b border-[#333] shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[#C5A059] flex items-center gap-2" style={{ fontFamily: 'Amiri, serif' }}>
                <span>📝</span> مفكرة التحري
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#222] text-white hover:bg-red-500 transition-colors"
              >
                ✕
              </button>
            </div>
            
            {/* Tabs */}
            <div className="flex bg-[#222] rounded-lg p-1 gap-1">
              <button
                onClick={() => setActiveTab('add')}
                className={`flex-1 py-2 rounded-md text-sm font-bold transition-colors ${activeTab === 'add' ? 'bg-[#C5A059] text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}
              >
                إدخال الملاحظات
              </button>
              <button
                onClick={() => setActiveTab('view')}
                className={`flex-1 py-2 rounded-md text-sm font-bold transition-colors ${activeTab === 'view' ? 'bg-[#C5A059] text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}
              >
                عرض الملاحظات
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 pb-24">
            {activeTab === 'add' ? (
              <div className="flex flex-col gap-4 h-full">
                <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-4 flex-1 flex flex-col shadow-inner">
                  <p className="text-gray-400 text-xs mb-3 font-mono leading-relaxed">
                    💡 يمكنك كتابة ملاحظاتك هنا. إذا أردت ربط الملاحظة بلاعب معين، اكتب <span className="text-[#C5A059] font-bold">@</span> متبوعة برقم اللاعب.
                    <br/>مثال: <span className="text-white">@3 يبدو مرتبكاً جداً اليوم</span>
                  </p>
                  <textarea
                    placeholder="دوّن ملاحظاتك هنا..."
                    value={currentInput}
                    onChange={(e) => setCurrentInput(e.target.value)}
                    className="flex-1 w-full bg-[#0a0a0a] text-gray-200 text-base p-3 rounded-lg border border-[#333] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none resize-none"
                    dir="auto"
                  />
                </div>
                <button
                  onClick={handleAddNote}
                  disabled={!currentInput.trim()}
                  className="w-full bg-gradient-to-r from-[#C5A059] to-[#b38b47] text-black font-black py-4 rounded-xl shadow-lg disabled:opacity-50 disabled:grayscale transition-all active:scale-[0.98]"
                  style={{ fontFamily: 'Amiri, serif' }}
                >
                  حفظ الملاحظة
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* General Notes */}
                {notes[0] && notes[0].text && (
                  <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#333] flex flex-col gap-2 shadow-lg">
                    <div className="flex justify-between items-center border-b border-[#333] pb-2">
                      <span className="font-bold text-[#C5A059]">ملاحظات عامة</span>
                      <button onClick={() => clearPlayerNoteText(0)} className="text-red-400 text-xs hover:text-red-300">مسح</button>
                    </div>
                    <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{notes[0].text}</p>
                  </div>
                )}

                {/* Player Notes */}
                {players.map((p) => {
                  const note = notes[p.physicalId] || { text: '', suspicion: 'none' };
                  // Show player if they have text OR a suspicion tag
                  if (!note.text && note.suspicion === 'none') return null;

                  return (
                    <div key={p.physicalId} className="bg-[#1a1a1a] p-4 rounded-xl border border-[#333] flex flex-col gap-3 shadow-lg">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-[#222] border border-[#555] flex items-center justify-center text-sm font-bold text-white overflow-hidden">
                            {p.avatarUrl ? (
                              <img src={p.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                            ) : (
                              p.physicalId
                            )}
                          </div>
                          <span className="font-bold text-gray-200">{p.name || `لاعب #${p.physicalId}`}</span>
                        </div>

                        {/* Suspicion Buttons */}
                        <div className="flex gap-1">
                          {(['safe', 'suspect', 'mafia'] as SuspicionLevel[]).map((level) => {
                            const isActive = note.suspicion === level;
                            return (
                              <button
                                key={level}
                                onClick={() => updateNote(p.physicalId, '', isActive ? 'none' : level)}
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

                      {note.text && (
                        <div className="bg-[#0a0a0a] p-3 rounded-lg border border-[#222] relative group">
                          <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed pr-6">{note.text}</p>
                          <button 
                            onClick={() => clearPlayerNoteText(p.physicalId)} 
                            className="absolute top-2 right-2 text-red-500 opacity-50 hover:opacity-100 p-1"
                            title="مسح الملاحظات المكتوبة"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Empty State */}
                {Object.keys(notes).length === 0 && (
                  <div className="text-center py-10 opacity-50">
                    <div className="text-4xl mb-3">📭</div>
                    <p className="text-gray-300 text-sm">لا توجد ملاحظات مسجلة بعد.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
