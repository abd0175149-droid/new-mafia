'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// ── تعريف جميع الأحداث الصوتية ──
const EVENT_GROUPS = [
  {
    label: '🌙 مرحلة الليل (خلفية)',
    events: [
      { key: 'ambient_night', label: '🌙 صوت خلفي لليل', desc: 'يعمل طوال مرحلة الليل ويتكرر' },
    ],
  },
  {
    label: '🔪 أحداث الليل',
    events: [
      { key: 'night_assassination', label: '🔪 اغتيال', desc: 'عند تفعيل حدث الاغتيال' },
      { key: 'night_investigation', label: '👁️ تحقيق', desc: 'عند تحقيق الشريف' },
      { key: 'night_protection', label: '🛡️ حماية', desc: 'عند تفعيل الحماية الطبية' },
      { key: 'night_snipe', label: '🎯 قنص', desc: 'عند تصويب القناص' },
      { key: 'night_silence', label: '🤐 إسكات', desc: 'عند تفعيل الإسكات' },
    ],
  },
  {
    label: '☀️ ملخص الصباح',
    events: [
      { key: 'morning_assassination_success', label: '🩸 اغتيال ناجح', desc: 'عند كشف نجاح الاغتيال' },
      { key: 'morning_protection_success', label: '🛡️ نجاة بالحماية', desc: 'عند نجاح الحماية' },
      { key: 'morning_snipe_mafia', label: '🎯 قنص ناجح', desc: 'القناص أصاب مافيا' },
      { key: 'morning_snipe_citizen', label: '💀 قنص فاشل', desc: 'القناص أصاب مواطن' },
      { key: 'morning_silenced', label: '🤐 إسكات لاعب', desc: 'تم إسكات لاعب' },
    ],
  },
  {
    label: '🃏 كشف الكروت',
    events: [
      { key: 'card_flip_godfather', label: '👑 شيخ المافيا', desc: 'كشف كارت الشيخ' },
      { key: 'card_flip_sheriff', label: '⭐ الشريف', desc: 'كشف كارت الشريف' },
      { key: 'card_flip_mafia', label: '🔴 مافيا', desc: 'كشف كارت أي مافيا' },
      { key: 'card_flip_citizen', label: '🔵 مواطن', desc: 'كشف كارت مواطن' },
    ],
  },
  {
    label: '🏆 نهاية اللعبة',
    events: [
      { key: 'win_mafia', label: '🔴 فوز المافيا', desc: 'موسيقى فوز المافيا' },
      { key: 'win_citizen', label: '🟢 فوز المواطنين', desc: 'موسيقى فوز المواطنين' },
    ],
  },
  {
    label: '⏱️ المؤقت',
    events: [
      { key: 'timer_heartbeat_slow', label: '💓 دقات بطيئة', desc: 'آخر 10 ثوانٍ' },
      { key: 'timer_heartbeat_fast', label: '💗 دقات سريعة', desc: 'آخر 5 ثوانٍ' },
      { key: 'timer_tick', label: '⏱️ نقرة', desc: 'صوت تيك العداد' },
      { key: 'timer_buzzer', label: '📢 صافرة', desc: 'انتهاء الوقت' },
    ],
  },
  {
    label: '🗳️ التصويت',
    events: [
      { key: 'ambient_voting', label: '🗳️ صوت خلفي للتصويت', desc: 'يعمل طوال مرحلة التصويت/التبرير ويتكرر' },
      { key: 'vote_cast', label: '🗳️ إضافة صوت', desc: 'عند التصويت' },
      { key: 'vote_shift', label: '🔄 تبديل مرشح', desc: 'عند تغيير المرشح المعروض' },
    ],
  },
  {
    label: '🔄 انتقال المراحل',
    events: [
      { key: 'ambient_day', label: '☀️ صوت خلفي للنهار', desc: 'يعمل طوال مرحلة النهار' },
      { key: 'phase_day_start', label: '☀️ بداية النهار', desc: 'صوت انتقال للنهار' },
      { key: 'phase_night_start', label: '🌙 بداية الليل', desc: 'صوت انتقال لليل' },
      { key: 'phase_voting_start', label: '🗳️ بداية التصويت', desc: 'صوت بدء التصويت' },
      { key: 'phase_elimination', label: '⚡ لحظة الإقصاء', desc: 'صوت عند الإقصاء' },
    ],
  },
];

// Flatten for lookup
const ALL_EVENTS = EVENT_GROUPS.flatMap(g => g.events);

interface SoundRecord {
  id: number;
  name: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  eventKeys: string[];
  isActive: boolean;
  uploadedBy: string;
  createdAt: string;
}

export default function SoundsPage() {
  const [sounds, setSounds] = useState<SoundRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload form state
  const [uploadName, setUploadName] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editKeys, setEditKeys] = useState<string[]>([]);

  // Playing preview
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  const headers = { Authorization: `Bearer ${token}` };

  // ── جلب الأصوات ──
  const fetchSounds = async () => {
    try {
      const res = await fetch(`${API_URL}/api/sounds`, { headers });
      const data = await res.json();
      if (data.success) setSounds(data.sounds || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchSounds(); }, []);

  // ── رفع ملف جديد ──
  const handleUpload = async () => {
    if (!selectedFile) return setUploadError('اختر ملف صوتي');
    if (!uploadName.trim()) return setUploadError('أدخل اسم للصوت');
    if (selectedKeys.length === 0) return setUploadError('اختر مرحلة واحدة على الأقل');

    setUploading(true);
    setUploadError('');

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('name', uploadName.trim());
    formData.append('eventKeys', JSON.stringify(selectedKeys));

    try {
      const res = await fetch(`${API_URL}/api/sounds/upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setUploadName(''); setSelectedKeys([]); setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchSounds();
      } else {
        setUploadError(data.error || 'فشل الرفع');
      }
    } catch (err: any) {
      setUploadError('خطأ في الاتصال');
    }
    setUploading(false);
  };

  // ── تبديل اختيار مرحلة ──
  const toggleKey = (key: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.includes(key) ? list.filter(k => k !== key) : [...list, key]);
  };

  // ── تفعيل/إلغاء ──
  const handleToggle = async (id: number) => {
    try {
      await fetch(`${API_URL}/api/sounds/${id}/toggle`, { method: 'PUT', headers });
      fetchSounds();
    } catch {}
  };

  // ── حذف ──
  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`هل تريد حذف "${name}" نهائياً؟`)) return;
    try {
      await fetch(`${API_URL}/api/sounds/${id}`, { method: 'DELETE', headers });
      fetchSounds();
    } catch {}
  };

  // ── حفظ التعديل ──
  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      await fetch(`${API_URL}/api/sounds/${editingId}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, eventKeys: editKeys }),
      });
      setEditingId(null);
      fetchSounds();
    } catch {}
  };

  // ── معاينة صوت ──
  const handlePlay = (sound: SoundRecord) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (playingId === sound.id) { setPlayingId(null); return; }
    const audio = new Audio(`${API_URL}/uploads/sounds/${sound.filename}`);
    audio.onended = () => setPlayingId(null);
    audio.play().catch(() => {});
    audioRef.current = audio;
    setPlayingId(sound.id);
  };

  // ── Helper: اسم الحدث ──
  const getEventLabel = (key: string) => ALL_EVENTS.find(e => e.key === key)?.label || key;

  // ── Helper: حجم الملف ──
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ── بناء خريطة: أي eventKey مربوط بأي صوت مفعّل ──
  const activeKeyMap: Record<string, string> = {};
  for (const s of sounds) {
    if (s.isActive) {
      for (const k of s.eventKeys) activeKeyMap[k] = s.name;
    }
  }

  return (
    <div className="space-y-8" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-white">🔊 المؤثرات الصوتية</h1>
        <p className="text-gray-500 text-sm mt-1 font-mono tracking-wide">SOUND EFFECTS MANAGER</p>
      </div>

      {/* ═══ Upload Form ═══ */}
      <div className="bg-gray-900/60 border border-gray-800/50 rounded-2xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-bold text-amber-400 mb-4">📁 رفع ملف صوتي جديد</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">اسم الصوت</label>
            <input
              type="text" value={uploadName} onChange={e => setUploadName(e.target.value)}
              placeholder="مثال: صوت الاغتيال الدراماتيكي"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder:text-gray-600 focus:border-amber-500 focus:outline-none transition"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">الملف الصوتي (mp3, wav, ogg — حد أقصى 5MB)</label>
            <input
              ref={fileInputRef} type="file" accept="audio/*"
              onChange={e => setSelectedFile(e.target.files?.[0] || null)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white file:bg-amber-600 file:text-white file:border-0 file:rounded-lg file:px-3 file:py-1 file:mr-3 file:cursor-pointer focus:outline-none"
            />
          </div>
        </div>

        {/* Event Keys Selection */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">📋 اختر المراحل المرتبطة:</label>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {EVENT_GROUPS.map(group => (
              <div key={group.label} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3">
                <h3 className="text-sm font-bold text-gray-300 mb-2">{group.label}</h3>
                <div className="space-y-1.5">
                  {group.events.map(ev => {
                    const isSelected = selectedKeys.includes(ev.key);
                    const assignedTo = activeKeyMap[ev.key];
                    return (
                      <button
                        key={ev.key}
                        onClick={() => toggleKey(ev.key, selectedKeys, setSelectedKeys)}
                        className={`w-full text-right px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-2 ${
                          isSelected
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-gray-700/30 text-gray-400 border border-transparent hover:bg-gray-700/50 hover:text-gray-300'
                        }`}
                      >
                        <span className="text-base">{isSelected ? '✅' : '⬜'}</span>
                        <span className="flex-1">{ev.label}</span>
                        {assignedTo && !isSelected && (
                          <span className="text-[10px] text-amber-600 truncate max-w-[80px]">({assignedTo})</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Preview + Upload Button */}
        <div className="flex items-center gap-3 flex-wrap">
          {selectedFile && (
            <button
              onClick={() => {
                if (audioRef.current) { audioRef.current.pause(); }
                const audio = new Audio(URL.createObjectURL(selectedFile));
                audio.play().catch(() => {});
                audioRef.current = audio;
              }}
              className="px-4 py-2 bg-gray-700 text-white rounded-xl hover:bg-gray-600 transition text-sm"
            >
              ▶ معاينة
            </button>
          )}
          <button
            onClick={handleUpload} disabled={uploading}
            className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold rounded-xl hover:from-amber-400 hover:to-amber-500 transition disabled:opacity-50 text-sm"
          >
            {uploading ? '⏳ جاري الرفع...' : '💾 رفع وحفظ'}
          </button>
          {uploadError && <span className="text-rose-400 text-sm">{uploadError}</span>}
          {selectedKeys.length > 0 && (
            <span className="text-gray-500 text-xs">({selectedKeys.length} مرحلة مختارة)</span>
          )}
        </div>
      </div>

      {/* ═══ Sounds List ═══ */}
      <div>
        <h2 className="text-lg font-bold text-white mb-4">📂 الأصوات المرفوعة ({sounds.length})</h2>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : sounds.length === 0 ? (
          <div className="text-center py-12 text-gray-600">
            <div className="text-5xl mb-3">🔇</div>
            <p>لم يتم رفع أي ملفات صوتية بعد</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {sounds.map(sound => (
                <motion.div
                  key={sound.id}
                  layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className={`bg-gray-900/60 border rounded-2xl p-4 transition-all ${
                    sound.isActive ? 'border-amber-500/30' : 'border-gray-800/50 opacity-60'
                  }`}
                >
                  {editingId === sound.id ? (
                    /* ── وضع التعديل ── */
                    <div className="space-y-3">
                      <input
                        type="text" value={editName} onChange={e => setEditName(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white focus:border-amber-500 focus:outline-none"
                      />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {ALL_EVENTS.map(ev => (
                          <button
                            key={ev.key}
                            onClick={() => toggleKey(ev.key, editKeys, setEditKeys)}
                            className={`px-2 py-1.5 rounded-lg text-xs transition ${
                              editKeys.includes(ev.key)
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-gray-700/30 text-gray-500 border border-transparent'
                            }`}
                          >
                            {ev.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleSaveEdit} className="px-4 py-1.5 bg-amber-500 text-black rounded-lg text-sm font-bold">💾 حفظ</button>
                        <button onClick={() => setEditingId(null)} className="px-4 py-1.5 bg-gray-700 text-gray-300 rounded-lg text-sm">إلغاء</button>
                      </div>
                    </div>
                  ) : (
                    /* ── وضع العرض ── */
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <h3 className="font-bold text-white flex items-center gap-2">
                          🔊 {sound.name}
                          {sound.isActive && <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">مفعّل</span>}
                          {!sound.isActive && <span className="text-[10px] bg-gray-700 text-gray-500 px-2 py-0.5 rounded-full">معطّل</span>}
                        </h3>
                        <p className="text-gray-500 text-xs mt-1 font-mono">
                          {sound.originalName} • {formatSize(sound.sizeBytes)} • {sound.uploadedBy}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {sound.eventKeys.map((k: string) => (
                            <span key={k} className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full border border-gray-700/50">
                              {getEventLabel(k)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handlePlay(sound)}
                          className={`px-3 py-1.5 rounded-lg text-sm transition ${
                            playingId === sound.id ? 'bg-amber-500 text-black' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {playingId === sound.id ? '⏹ إيقاف' : '▶ تشغيل'}
                        </button>
                        <button onClick={() => handleToggle(sound.id)}
                          className={`px-3 py-1.5 rounded-lg text-sm transition ${
                            sound.isActive ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          }`}
                        >
                          {sound.isActive ? '✅' : '⬜'}
                        </button>
                        <button onClick={() => { setEditingId(sound.id); setEditName(sound.name); setEditKeys([...sound.eventKeys]); }}
                          className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg text-sm hover:bg-gray-600 transition">✏️</button>
                        <button onClick={() => handleDelete(sound.id, sound.name)}
                          className="px-3 py-1.5 bg-rose-500/10 text-rose-400 rounded-lg text-sm hover:bg-rose-500/20 transition">🗑️</button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
