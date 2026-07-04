'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { swalConfirm } from '@/lib/swal';

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
  // 🗣️ تبويب التشاور السرّي (يُحسب في PlayerFlow: مافيا حيّ + الغرفة مفعّلة + مرحلة لعب)
  chatVisible?: boolean;
}

const SUSPICION_CONFIG = {
  safe:    { label: '🟢 بريء',   cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
  suspect: { label: '🟡 مشتبه',  cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
  mafia:   { label: '🔴 مافيا',  cls: 'bg-red-500/20 text-red-400 border-red-500/40' },
  none:    { label: '⚪ غير محدد', cls: 'bg-[#222] text-gray-500 border-[#444]' },
};

export default function PlayerNotepad({
  roomId, myPhysicalId, players, isOpen, onClose, onNotesChange, chatVisible = false,
}: PlayerNotepadProps) {
  const storageKey = `mafia_notes_${roomId}_${myPhysicalId}`;

  // ── State ──
  const [notes, setNotes] = useState<Record<number, PlayerNote>>({});
  const [activeTab, setActiveTab] = useState<'add' | 'view' | 'chat'>('add');

  // ── 🗣️ حالة تبويب التشاور السرّي ──
  const [chatMessages, setChatMessages] = useState<Array<{ physicalId: number; name: string; text: string; at: number }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatUnread, setChatUnread] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; if (activeTab === 'chat') setChatUnread(false); }, [activeTab]);

  // اشتراك الرسائل الحيّة + جلب التاريخ عند فتح المفكرة (للمافيا المؤهّل فقط)
  useEffect(() => {
    if (!isOpen || !chatVisible) return;
    let off: (() => void) | null = null;
    (async () => {
      try {
        const { getSocket } = await import('@/lib/socket');
        const socket = getSocket();
        const onMsg = (m: any) => {
          if (!m?.text) return;
          setChatMessages(prev => [...prev.slice(-199), m]);
          if (activeTabRef.current !== 'chat') setChatUnread(true);
        };
        socket.on('mafia:chat-message', onMsg);
        off = () => socket.off('mafia:chat-message', onMsg);
        socket.emit('mafia:chat-history', { roomId }, (res: any) => {
          if (res?.success && Array.isArray(res.messages)) setChatMessages(res.messages);
        });
      } catch {}
    })();
    return () => { if (off) off(); };
  }, [isOpen, chatVisible, roomId]);

  // تمرير تلقائي لآخر رسالة
  useEffect(() => {
    if (activeTab === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, activeTab]);

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatSending) return;
    setChatSending(true);
    try {
      const { getSocket } = await import('@/lib/socket');
      getSocket().emit('mafia:chat-send', { roomId, text }, (res: any) => {
        if (res?.success) setChatInput('');
        setChatSending(false);
      });
      // أمان: فكّ التعطيل إن لم يصل ack (انقطاع)
      setTimeout(() => setChatSending(false), 3000);
    } catch { setChatSending(false); }
  };

  // إن اختفى التأهيل (موت/تعطيل الليدر) والمستخدم على تبويب التشاور → عُد للإضافة
  useEffect(() => {
    if (!chatVisible && activeTab === 'chat') setActiveTab('add');
  }, [chatVisible, activeTab]);

  // 🗣️ زر المفكرة هو «باب الغرفة»: عند الفتح، المافيا المؤهّل يدخل مباشرة على تبويب التشاور
  useEffect(() => {
    if (isOpen) setActiveTab(chatVisible ? 'chat' : 'add');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // حالة كتابة الملاحظة
  const [noteText, setNoteText] = useState('');
  const [targetPlayer, setTargetPlayer] = useState<any | null>(null); // اللاعب المربوط

  // @ mention picker
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerAnchor, setPickerAnchor] = useState(0); // موضع @ في النص

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load notes from localStorage
  useEffect(() => {
    if (isOpen) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          setNotes(parsed);
          onNotesChange(parsed);
        }
      } catch {}
    }
  }, [isOpen, storageKey]);

  // Filtered players for picker
  const pickerPlayers = players.filter(p => {
    if (p.physicalId === myPhysicalId) return false;
    const q = pickerQuery.toLowerCase();
    return (
      !q ||
      String(p.physicalId).includes(q) ||
      (p.name || '').toLowerCase().includes(q)
    );
  });

  // ── Textarea change handler ──
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    setNoteText(val);

    // كشف @ جديدة قبل الـ cursor
    const textBeforeCursor = val.slice(0, cursor);
    const atIdx = textBeforeCursor.lastIndexOf('@');

    if (atIdx !== -1) {
      const afterAt = textBeforeCursor.slice(atIdx + 1);
      // لا توجد مسافة بعد الـ @
      if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
        setPickerAnchor(atIdx);
        setPickerQuery(afterAt);
        setShowPicker(true);
        return;
      }
    }
    setShowPicker(false);
    setPickerQuery('');
  };

  // ── اختيار لاعب من الـ picker ──
  const selectPlayer = (player: any) => {
    // احذف الـ @ + الكلمة المكتوبة بعدها من النص
    const before = noteText.slice(0, pickerAnchor);
    const afterAt = noteText.slice(pickerAnchor + 1 + pickerQuery.length);
    setNoteText((before + afterAt).trimStart());

    setTargetPlayer(player);
    setShowPicker(false);
    setPickerQuery('');
    // إعادة التركيز على textarea
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // ── حفظ الملاحظة ──
  const saveNote = () => {
    const text = noteText.trim();
    if (!text && !targetPlayer) return;

    const pid = targetPlayer ? targetPlayer.physicalId : 0;

    setNotes(prev => {
      const current = prev[pid] || { text: '', suspicion: 'none' };
      const newText = text
        ? (current.text ? current.text + '\n' + text : text)
        : current.text;
      const updated = { ...prev, [pid]: { ...current, text: newText } };
      localStorage.setItem(storageKey, JSON.stringify(updated));
      onNotesChange(updated);
      return updated;
    });

    setNoteText('');
    setTargetPlayer(null);
  };

  // ── تعديل مستوى الريبة ──
  const setSuspicion = (pid: number, level: SuspicionLevel) => {
    setNotes(prev => {
      const current = prev[pid] || { text: '', suspicion: 'none' };
      const updated = { ...prev, [pid]: { ...current, suspicion: level === current.suspicion ? 'none' : level } };
      localStorage.setItem(storageKey, JSON.stringify(updated));
      onNotesChange(updated);
      return updated;
    });
  };

  // ── مسح نص ملاحظة ──
  const clearNoteText = (pid: number) => {
    setNotes(prev => {
      const updated = { ...prev };
      if (updated[pid]) updated[pid] = { ...updated[pid], text: '' };
      // إذا لا نص ولا ريبة → احذف المفتاح
      if (!updated[pid]?.text && updated[pid]?.suspicion === 'none') delete updated[pid];
      localStorage.setItem(storageKey, JSON.stringify(updated));
      onNotesChange(updated);
      return updated;
    });
  };

  // ── حذف ملاحظة اللاعب بالكامل (النص والريبة) ──
  const deletePlayerNote = (pid: number) => {
    setNotes(prev => {
      const updated = { ...prev };
      delete updated[pid];
      localStorage.setItem(storageKey, JSON.stringify(updated));
      onNotesChange(updated);
      return updated;
    });
  };

  // ── مسح جميع الملاحظات ──
  const clearAllNotes = async () => {
    if (!(await swalConfirm('هل أنت متأكد من مسح جميع الملاحظات ومستويات الريبة لجميع اللاعبين؟'))) return;
    setNotes({});
    localStorage.removeItem(storageKey);
    onNotesChange({});
  };

  // اللاعبون الذين عندهم ملاحظات
  const playersWithNotes = players.filter(p => {
    const n = notes[p.physicalId];
    return n && (n.text || n.suspicion !== 'none');
  });
  const generalNote = notes[0];
  const hasAnyNotes = playersWithNotes.length > 0 || (generalNote?.text);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          className="fixed inset-0 z-[100] flex flex-col bg-[#080808]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e1e] shrink-0 bg-[#0d0d0d]">
            <h2 className="text-lg font-black text-[#C5A059] flex items-center gap-2" style={{ fontFamily: 'Amiri, serif' }}>
              📝 <span>مفكرة التحري</span>
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1a1a1a] text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-colors text-lg"
            >
              ✕
            </button>
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-1 px-4 pt-3 pb-2 shrink-0">
            {(['add', 'view'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                  activeTab === tab
                    ? 'bg-[#C5A059] text-black shadow'
                    : 'bg-[#1a1a1a] text-gray-400 hover:text-white border border-[#2a2a2a]'
                }`}
              >
                {tab === 'add' ? '✏️ إضافة ملاحظة' : `📋 عرض الملاحظات${hasAnyNotes ? ` (${playersWithNotes.length + (generalNote?.text ? 1 : 0)})` : ''}`}
              </button>
            ))}
            {/* 🗣️ تبويب التشاور — يظهر فقط على أجهزة المافيا الأحياء عندما تكون الغرفة مفعّلة */}
            {chatVisible && (
              <button
                onClick={() => setActiveTab('chat')}
                className={`relative flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                  activeTab === 'chat'
                    ? 'bg-[#C5A059] text-black shadow'
                    : 'bg-[#1a1a1a] text-gray-400 hover:text-white border border-[#2a2a2a]'
                }`}
              >
                🗣️ التشاور
                {chatUnread && activeTab !== 'chat' && (
                  <span className="absolute top-1 left-2 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                )}
              </button>
            )}
          </div>

          {/* ── Body ── */}
          <div className="flex-1 overflow-y-auto px-4 pb-6">

            {/* ══ تبويب الإضافة ══ */}
            {activeTab === 'add' && (
              <div className="flex flex-col gap-3">

                {/* ── بطاقة اللاعب المحدد ── */}
                <div className="bg-[#111] border border-[#222] rounded-2xl p-3">
                  <p className="text-[10px] text-gray-600 font-mono uppercase tracking-widest mb-2">
                    الملاحظة مرتبطة بـ
                  </p>

                  {targetPlayer ? (
                    <div className="flex items-center justify-between bg-[#C5A059]/10 border border-[#C5A059]/30 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-[#1a1a1a] border border-[#C5A059]/40 flex items-center justify-center overflow-hidden shrink-0">
                          {targetPlayer.avatarUrl
                            ? <img src={targetPlayer.avatarUrl} alt="" className="w-full h-full object-cover" />
                            : <span className="text-sm font-black text-[#C5A059]">#{targetPlayer.physicalId}</span>
                          }
                        </div>
                        <div>
                          <p className="text-white font-bold text-sm">{targetPlayer.name || `لاعب #${targetPlayer.physicalId}`}</p>
                          <p className="text-[#C5A059] text-[10px] font-mono">مقعد #{targetPlayer.physicalId}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setTargetPlayer(null)}
                        className="text-gray-500 hover:text-red-400 text-sm transition-colors px-2"
                        title="إلغاء الربط"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="bg-[#0d0d0d] border border-dashed border-[#333] rounded-xl px-3 py-3 text-center">
                      <p className="text-gray-600 text-xs font-mono">
                        اكتب <span className="text-[#C5A059] font-bold">@</span> لاختيار لاعب — أو اترك فارغاً للملاحظات العامة
                      </p>
                    </div>
                  )}
                </div>

                {/* ── حقل الكتابة + picker ── */}
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={noteText}
                    onChange={handleTextChange}
                    placeholder={targetPlayer
                      ? `ملاحظتك عن ${targetPlayer.name || `لاعب #${targetPlayer.physicalId}`}...`
                      : 'اكتب ملاحظتك هنا... (اكتب @ لتحديد لاعب)'
                    }
                    rows={5}
                    dir="auto"
                    className="w-full bg-[#0d0d0d] text-gray-200 text-sm p-4 rounded-2xl border border-[#2a2a2a] focus:border-[#C5A059]/60 focus:ring-1 focus:ring-[#C5A059]/30 outline-none resize-none placeholder-gray-700"
                  />

                  {/* ── @ Picker Dropdown ── */}
                  <AnimatePresence>
                    {showPicker && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="absolute bottom-full left-0 right-0 mb-1 bg-[#111] border border-[#C5A059]/40 rounded-2xl overflow-hidden shadow-xl z-10 max-h-52 overflow-y-auto"
                      >
                        <p className="text-[9px] text-[#C5A059]/60 font-mono uppercase tracking-widest px-3 pt-2 pb-1">
                          اختر لاعباً
                        </p>
                        {pickerPlayers.length === 0 ? (
                          <p className="text-gray-600 text-xs text-center py-4">لا يوجد لاعبون مطابقون</p>
                        ) : (
                          pickerPlayers.map(player => (
                            <button
                              key={player.physicalId}
                              onMouseDown={e => { e.preventDefault(); selectPlayer(player); }}
                              className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-[#C5A059]/10 transition-colors text-right"
                            >
                              <div className="w-8 h-8 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center overflow-hidden shrink-0">
                                {player.avatarUrl
                                  ? <img src={player.avatarUrl} alt="" className="w-full h-full object-cover" />
                                  : <span className="text-xs font-black text-[#C5A059]">{player.physicalId}</span>
                                }
                              </div>
                              <div className="flex-1 text-right">
                                <p className="text-white text-sm font-bold">{player.name || `لاعب`}</p>
                                <p className="text-[#C5A059] text-[10px] font-mono">مقعد #{player.physicalId}</p>
                              </div>
                            </button>
                          ))
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* ── زر حفظ ── */}
                <button
                  onClick={saveNote}
                  disabled={!noteText.trim()}
                  className="w-full py-4 bg-gradient-to-r from-[#C5A059] to-[#b38b47] text-black font-black rounded-2xl shadow-lg disabled:opacity-30 disabled:grayscale transition-all active:scale-[0.98] text-base"
                  style={{ fontFamily: 'Amiri, serif' }}
                >
                  {targetPlayer
                    ? `💾 حفظ عن ${targetPlayer.name || `لاعب #${targetPlayer.physicalId}`}`
                    : '💾 حفظ ملاحظة عامة'
                  }
                </button>

                {/* ── قائمة اللاعبين السريعة للربط ── */}
                {!targetPlayer && players.filter(p => p.physicalId !== myPhysicalId).length > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-600 font-mono uppercase tracking-widest mb-2 px-1">أو اختر لاعباً مباشرة</p>
                    <div className="flex flex-wrap gap-2">
                      {players.filter(p => p.physicalId !== myPhysicalId).map(player => (
                        <button
                          key={player.physicalId}
                          onClick={() => setTargetPlayer(player)}
                          className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border border-[#333] rounded-xl hover:border-[#C5A059] hover:bg-[#C5A059]/10 transition-all shadow-sm"
                        >
                          {player.avatarUrl && (
                            <img src={player.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                          )}
                          <span className="text-[#C5A059] font-mono text-sm font-black shadow-sm">#{player.physicalId}</span>
                          <span className="text-gray-200 text-sm font-bold">{player.name || `لاعب`}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══ تبويب العرض ══ */}
            {activeTab === 'view' && (
              <div className="space-y-3">
                {hasAnyNotes && (
                  <div className="flex justify-end px-1">
                    <button
                      onClick={clearAllNotes}
                      className="text-red-500/80 hover:text-red-400 text-xs font-bold transition-colors flex items-center gap-1 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20"
                    >
                      <span>🗑️</span> مسح كل الملاحظات
                    </button>
                  </div>
                )}
                {/* ملاحظات عامة */}
                {generalNote?.text && (
                  <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[#C5A059] text-sm font-bold">📌 ملاحظات عامة</span>
                      <button onClick={() => clearNoteText(0)} className="text-red-500/60 hover:text-red-400 text-xs transition-colors">مسح</button>
                    </div>
                    <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{generalNote.text}</p>
                  </div>
                )}

                {/* ملاحظات اللاعبين */}
                {playersWithNotes.map(player => {
                  const note = notes[player.physicalId];
                  if (!note) return null;
                  return (
                    <div key={player.physicalId} className="bg-[#111] border border-[#2a2a2a] rounded-2xl p-4">
                      {/* رأس البطاقة */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center overflow-hidden shrink-0">
                          {player.avatarUrl
                            ? <img src={player.avatarUrl} alt="" className="w-full h-full object-cover" />
                            : <span className="text-sm font-black text-[#C5A059]">#{player.physicalId}</span>
                          }
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-bold text-sm">{player.name || `لاعب #${player.physicalId}`}</p>
                          <p className="text-[#C5A059] text-[10px] font-mono">مقعد #{player.physicalId}</p>
                        </div>
                        <button
                          onClick={() => deletePlayerNote(player.physicalId)}
                          className="text-red-500/50 hover:text-red-400 text-xs transition-colors bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/20"
                          title="حذف الملاحظة بالكامل"
                        >
                          🗑️ حذف
                        </button>
                      </div>

                      {/* أزرار الريبة */}
                      <div className="flex gap-1.5 mb-3">
                        {(['safe', 'suspect', 'mafia'] as SuspicionLevel[]).map(level => {
                          const cfg = SUSPICION_CONFIG[level];
                          const isActive = note.suspicion === level;
                          return (
                            <button
                              key={level}
                              onClick={() => setSuspicion(player.physicalId, level)}
                              className={`flex-1 py-1.5 text-[11px] rounded-lg font-bold transition-all border ${
                                isActive ? cfg.cls : 'bg-[#0d0d0d] text-gray-600 border-[#1e1e1e] hover:border-[#333]'
                              }`}
                            >
                              {cfg.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* نص الملاحظة */}
                      {note.text ? (
                        <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl p-3">
                          <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{note.text}</p>
                        </div>
                      ) : (
                        <p className="text-gray-700 text-xs text-center py-1">لا يوجد نص — فقط تصنيف</p>
                      )}

                      {/* إضافة ملاحظة إضافية */}
                      <button
                        onClick={() => {
                          setTargetPlayer(player);
                          setActiveTab('add');
                        }}
                        className="mt-2 w-full text-[11px] text-[#C5A059]/60 hover:text-[#C5A059] transition-colors font-mono"
                      >
                        + إضافة ملاحظة
                      </button>
                    </div>
                  );
                })}

                {/* حالة فارغة */}
                {!hasAnyNotes && (
                  <div className="text-center py-16 opacity-40">
                    <div className="text-5xl mb-3">📭</div>
                    <p className="text-gray-400 text-sm">لا توجد ملاحظات مسجّلة بعد</p>
                    <p className="text-gray-600 text-xs mt-1">انتقل لتبويب "إضافة ملاحظة" للبدء</p>
                  </div>
                )}
              </div>
            )}

            {/* ══ 🗣️ تبويب التشاور السرّي (مافيا أحياء فقط) ══ */}
            {activeTab === 'chat' && chatVisible && (
              <div className="flex flex-col h-full">
                {/* قائمة الرسائل */}
                <div className="flex-1 overflow-y-auto flex flex-col gap-2 py-2">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-16 opacity-40">
                      <div className="text-5xl mb-3">🤫</div>
                      <p className="text-gray-400 text-sm">لا رسائل بعد — ابدأ التشاور</p>
                    </div>
                  ) : chatMessages.map((m, i) => {
                    const mine = m.physicalId === myPhysicalId;
                    return (
                      <div key={`${m.at}-${i}`} className={`max-w-[85%] ${mine ? 'self-start' : 'self-end'}`}>
                        <div className={`rounded-2xl px-3 py-2 border ${
                          mine ? 'bg-[#C5A059]/15 border-[#C5A059]/30' : 'bg-[#141414] border-[#262626]'
                        }`}>
                          <p className={`text-[10px] font-bold mb-0.5 ${mine ? 'text-[#C5A059]' : 'text-red-400'}`}>
                            {m.name} <span className="font-mono opacity-70">(#{m.physicalId})</span>
                          </p>
                          <p className="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed break-words">{m.text}</p>
                          <p className="text-[9px] text-gray-600 mt-0.5 font-mono" dir="ltr">
                            {new Date(m.at).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
                {/* الإدخال */}
                <div className="shrink-0 flex gap-2 pt-2 pb-1">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value.slice(0, 300))}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
                    placeholder="اكتب رسالة للفريق…"
                    dir="rtl"
                    className="flex-1 bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white focus:border-[#C5A059]/50 focus:outline-none"
                  />
                  <button
                    onClick={sendChat}
                    disabled={chatSending || !chatInput.trim()}
                    className="px-4 rounded-xl bg-[#C5A059] text-black font-bold text-sm disabled:opacity-40 transition-opacity"
                  >
                    إرسال
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
