'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// ── تعريف جميع الأحداث الصوتية ──
const EVENT_GROUPS = [
  {
    label: '🏠 اللوبي',
    events: [
      { key: 'ambient_lobby', label: '🏠 صوت خلفي للوبي', desc: 'يعمل أثناء انتظار اللاعبين في اللوبي ويتكرر (اختياري)' },
    ],
  },
  {
    label: '☀️ مراحل النهار (خلفية)',
    events: [
      { key: 'ambient_day', label: '☀️ صوت خلفي للنقاش', desc: 'يعمل أثناء مرحلة النقاش ويتكرر' },
      { key: 'ambient_voting', label: '🗳️ صوت خلفي للتصويت', desc: 'يعمل فقط أثناء مرحلة التصويت المفتوح ويتكرر' },
      { key: 'ambient_justification', label: '⚖️ صوت خلفي للتبرير', desc: 'يعمل أثناء مرحلة التبرير ويتكرر' },
    ],
  },
  {
    label: '🌙 مراحل الليل (خلفية)',
    events: [
      { key: 'ambient_night', label: '🌙 صوت خلفي لليل', desc: 'يعمل كخلفية افتراضية طوال مرحلة الليل ويتكرر' },
      { key: 'ambient_night_kill', label: '🔪 خلفية الاغتيال', desc: 'يعمل أثناء انتظار اختيار هدف الاغتيال' },
      { key: 'ambient_night_silence', label: '🤐 خلفية الإسكات', desc: 'يعمل أثناء انتظار اختيار هدف الإسكات' },
      { key: 'ambient_night_investigate', label: '👁️ خلفية التحقيق', desc: 'يعمل أثناء انتظار اختيار هدف التحقيق' },
      { key: 'ambient_night_protect', label: '🛡️ خلفية الحماية', desc: 'يعمل أثناء انتظار اختيار هدف الحماية' },
      { key: 'ambient_night_snipe', label: '🎯 خلفية القنص', desc: 'يعمل أثناء انتظار اختيار هدف القنص' },
    ],
  },
  {
    label: '🔪 أحداث الليل (تنفيذ)',
    events: [
      { key: 'night_assassination', label: '🔪 تنفيذ اغتيال', desc: 'عند تنفيذ حدث الاغتيال' },
      { key: 'night_investigation', label: '👁️ تنفيذ تحقيق', desc: 'عند تنفيذ تحقيق الشريف' },
      { key: 'night_protection', label: '🛡️ تنفيذ حماية', desc: 'عند تنفيذ الحماية الطبية' },
      { key: 'night_snipe', label: '🎯 تنفيذ قنص', desc: 'عند تنفيذ تصويب القناص' },
      { key: 'night_silence', label: '🤐 تنفيذ إسكات', desc: 'عند تنفيذ الإسكات' },
    ],
  },
  {
    label: '☀️ ملخص الصباح',
    events: [
      { key: 'ambient_morning', label: '☀️ صوت خلفي للصباح', desc: 'يعمل أثناء عرض ملخص الصباح ويتكرر (اختياري)' },
      { key: 'morning_assassination_success', label: '🩸 اغتيال ناجح', desc: 'عند كشف نجاح الاغتيال' },
      { key: 'morning_protection_success', label: '🛡️ نجاة بالحماية', desc: 'عند نجاح الحماية' },
      { key: 'morning_snipe_mafia', label: '🎯 قنص ناجح', desc: 'القناص أصاب مافيا' },
      { key: 'morning_snipe_citizen', label: '💀 قنص فاشل', desc: 'القناص أصاب مواطن' },
      { key: 'morning_silenced', label: '🤐 إسكات لاعب', desc: 'تم إسكات لاعب' },
    ],
  },
  {
    label: '💀 أصوات الإقصاء',
    events: [
      { key: 'elimination_godfather', label: '👑 إقصاء شيخ المافيا', desc: 'صوت خاص عند إقصاء شيخ المافيا (اختياري — يستخدم صوت المافيا كبديل)' },
      { key: 'elimination_silencer', label: '🤐 إقصاء قص المافيا', desc: 'صوت خاص عند إقصاء القص (اختياري — يستخدم صوت المافيا كبديل)' },
      { key: 'elimination_chameleon', label: '🦎 إقصاء الحرباية', desc: 'صوت خاص عند إقصاء الحرباية (اختياري — يستخدم صوت المافيا كبديل)' },
      { key: 'elimination_mafia', label: '🔴 إقصاء مافيا (افتراضي)', desc: 'صوت افتراضي لإقصاء أي عضو مافيا ليس له صوت خاص' },
      { key: 'elimination_sheriff', label: '🔍 إقصاء الشريف', desc: 'صوت خاص عند إقصاء الشريف (اختياري — يستخدم صوت المواطن كبديل)' },
      { key: 'elimination_doctor', label: '💉 إقصاء الطبيب', desc: 'صوت خاص عند إقصاء الطبيب (اختياري — يستخدم صوت المواطن كبديل)' },
      { key: 'elimination_sniper', label: '🎯 إقصاء القناص', desc: 'صوت خاص عند إقصاء القناص (اختياري — يستخدم صوت المواطن كبديل)' },
      { key: 'elimination_policewoman', label: '👮 إقصاء الشرطية', desc: 'صوت خاص عند إقصاء الشرطية (اختياري — يستخدم صوت المواطن كبديل)' },
      { key: 'elimination_nurse', label: '🏥 إقصاء الممرضة', desc: 'صوت خاص عند إقصاء الممرضة (اختياري — يستخدم صوت المواطن كبديل)' },
      { key: 'elimination_citizen', label: '👤 إقصاء مواطن (افتراضي)', desc: 'صوت افتراضي لإقصاء أي مواطن ليس له صوت خاص' },
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
      { key: 'vote_cast', label: '🗳️ إضافة صوت', desc: 'عند التصويت' },
      { key: 'vote_shift', label: '🔄 تبديل مرشح', desc: 'عند تغيير المرشح المعروض' },
    ],
  },
  {
    label: '🔄 انتقال المراحل',
    events: [
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

  // ── Audio Trimmer State ──
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [audioDuration, setAudioDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [playbackPos, setPlaybackPos] = useState(0);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewCtxRef = useRef<AudioContext | null>(null);
  const playbackTimerRef = useRef<any>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);

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

  // ══════════════════════════════════════════════════
  // 🎵 معالجة اختيار الملف الصوتي وتحليله
  // ══════════════════════════════════════════════════
  const handleFileSelect = async (file: File | null) => {
    setSelectedFile(file);
    stopTrimPreview();
    if (!file) {
      setAudioBuffer(null); setWaveformData([]); setAudioDuration(0);
      setTrimStart(0); setTrimEnd(0);
      return;
    }
    try {
      const ACClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new ACClass();
      const arrayBuf = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      setAudioBuffer(decoded);
      setAudioDuration(decoded.duration);
      setTrimStart(0);
      setTrimEnd(decoded.duration);
      // استخراج بيانات الموجة الصوتية
      const raw = decoded.getChannelData(0);
      const bars = 200;
      const blockSize = Math.floor(raw.length / bars);
      const peaks: number[] = [];
      for (let i = 0; i < bars; i++) {
        let max = 0;
        for (let j = 0; j < blockSize; j++) {
          const v = Math.abs(raw[i * blockSize + j]);
          if (v > max) max = v;
        }
        peaks.push(max);
      }
      setWaveformData(peaks);
      ctx.close();
    } catch (err) {
      console.warn('⚠️ Failed to decode audio:', err);
    }
  };

  // ══════════════════════════════════════════════════
  // 🎨 رسم الموجة الصوتية على Canvas
  // ══════════════════════════════════════════════════
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || waveformData.length === 0 || audioDuration <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const barW = w / waveformData.length;
    const startPx = (trimStart / audioDuration) * w;
    const endPx = (trimEnd / audioDuration) * w;
    const posPx = (playbackPos / audioDuration) * w;

    // خلفية المنطقة الغير مختارة
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(0, 0, w, h);

    // رسم الأعمدة
    for (let i = 0; i < waveformData.length; i++) {
      const x = i * barW;
      const barH = Math.max(2, waveformData[i] * h * 0.85);
      const inRange = x >= startPx && x <= endPx;
      ctx.fillStyle = inRange ? 'rgba(245, 158, 11, 0.7)' : 'rgba(107, 114, 128, 0.25)';
      ctx.fillRect(x, (h - barH) / 2, Math.max(1, barW - 1), barH);
    }

    // خط البداية (أخضر)
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(startPx - 1, 0, 3, h);
    // خط النهاية (أحمر)
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(endPx - 1, 0, 3, h);
    // خط التشغيل (أبيض)
    if (isPreviewPlaying && posPx > startPx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(posPx - 0.5, 0, 2, h);
    }
  }, [waveformData, trimStart, trimEnd, audioDuration, playbackPos, isPreviewPlaying]);

  // ══════════════════════════════════════════════════
  // ▶️ معاينة المقطع المقتطع
  // ══════════════════════════════════════════════════
  const playTrimPreview = () => {
    stopTrimPreview();
    if (!audioBuffer) return;
    try {
      const ACClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new ACClass();
      previewCtxRef.current = ctx;
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      const offset = trimStart;
      const dur = trimEnd - trimStart;
      source.start(0, offset, dur);
      previewSourceRef.current = source;
      setIsPreviewPlaying(true);
      setPlaybackPos(trimStart);
      const startedAt = Date.now();
      playbackTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startedAt) / 1000;
        const pos = trimStart + elapsed;
        if (pos >= trimEnd) {
          stopTrimPreview();
          return;
        }
        setPlaybackPos(pos);
      }, 50);
      source.onended = () => stopTrimPreview();
    } catch {}
  };

  const stopTrimPreview = () => {
    try { previewSourceRef.current?.stop(); } catch {}
    previewSourceRef.current = null;
    try { previewCtxRef.current?.close(); } catch {}
    previewCtxRef.current = null;
    if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    playbackTimerRef.current = null;
    setIsPreviewPlaying(false);
    setPlaybackPos(0);
  };

  // ══════════════════════════════════════════════════
  // ✂️ تصدير المقطع المقتطع كـ WAV Blob
  // ══════════════════════════════════════════════════
  const exportTrimmedAudio = async (): Promise<File | null> => {
    if (!audioBuffer) return null;
    const isTrimmed = trimStart > 0.05 || (audioDuration - trimEnd) > 0.05;
    if (!isTrimmed) return selectedFile; // لا حاجة للقص
    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;
    const startSample = Math.floor(trimStart * sampleRate);
    const endSample = Math.floor(trimEnd * sampleRate);
    const length = endSample - startSample;
    const offlineCtx = new OfflineAudioContext(channels, length, sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0, trimStart, trimEnd - trimStart);
    const rendered = await offlineCtx.startRendering();
    // تحويل AudioBuffer إلى WAV
    const wavBlob = audioBufferToWav(rendered);
    const trimmedName = (selectedFile?.name || 'trimmed').replace(/\.[^.]+$/, '') + '_trimmed.wav';
    return new File([wavBlob], trimmedName, { type: 'audio/wav' });
  };

  // ── تحويل AudioBuffer إلى WAV ──
  const audioBufferToWav = (buffer: AudioBuffer): Blob => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const dataSize = length * numChannels * 2;
    const buf = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buf);
    const writeStr = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    return new Blob([buf], { type: 'audio/wav' });
  };

  // ── مساعد: تنسيق الوقت ──
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m}:${String(s).padStart(2, '0')}.${ms}`;
  };

  // ── رفع ملف جديد (مع دعم القص) ──
  const handleUpload = async () => {
    if (!selectedFile) return setUploadError('اختر ملف صوتي');
    if (!uploadName.trim()) return setUploadError('أدخل اسم للصوت');
    if (selectedKeys.length === 0) return setUploadError('اختر مرحلة واحدة على الأقل');

    setUploading(true);
    setUploadError('');
    stopTrimPreview();

    try {
      // تصدير المقطع المقتطع (أو الملف الأصلي إن لم يُقص)
      const fileToUpload = await exportTrimmedAudio();
      if (!fileToUpload) { setUploadError('فشل تجهيز الملف'); setUploading(false); return; }

      const formData = new FormData();
      formData.append('file', fileToUpload);
      formData.append('name', uploadName.trim());
      formData.append('eventKeys', JSON.stringify(selectedKeys));

      const res = await fetch(`${API_URL}/api/sounds/upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setUploadName(''); setSelectedKeys([]); setSelectedFile(null);
        setAudioBuffer(null); setWaveformData([]); setAudioDuration(0);
        setTrimStart(0); setTrimEnd(0);
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
              onChange={e => handleFileSelect(e.target.files?.[0] || null)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white file:bg-amber-600 file:text-white file:border-0 file:rounded-lg file:px-3 file:py-1 file:mr-3 file:cursor-pointer focus:outline-none"
            />
          </div>
        </div>

        {/* ═══ Audio Trimmer ═══ */}
        {audioBuffer && waveformData.length > 0 && (
          <div className="mb-4 bg-gray-800/60 border border-gray-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-amber-400">✂️ قص المقطع الصوتي</h3>
              <span className="text-xs text-gray-500 font-mono">
                المدة: {formatTime(audioDuration)} → المقتطع: {formatTime(trimEnd - trimStart)}
              </span>
            </div>

            {/* Waveform Canvas */}
            <div className="relative mb-3 rounded-lg overflow-hidden border border-gray-700/50 bg-gray-900/80">
              <canvas
                ref={waveformCanvasRef}
                width={800} height={80}
                className="w-full h-20 cursor-crosshair"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const ratio = clickX / rect.width;
                  const clickTime = ratio * audioDuration;
                  // إن كان أقرب للبداية → حرّك البداية، وإلا → حرّك النهاية
                  const distToStart = Math.abs(clickTime - trimStart);
                  const distToEnd = Math.abs(clickTime - trimEnd);
                  if (distToStart < distToEnd) {
                    setTrimStart(Math.min(clickTime, trimEnd - 0.1));
                  } else {
                    setTrimEnd(Math.max(clickTime, trimStart + 0.1));
                  }
                }}
              />
              {/* علامات الوقت */}
              <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 py-0.5">
                <span className="text-[9px] text-green-400 font-mono">▶ {formatTime(trimStart)}</span>
                <span className="text-[9px] text-gray-600 font-mono">{formatTime(audioDuration / 2)}</span>
                <span className="text-[9px] text-red-400 font-mono">{formatTime(trimEnd)} ◀</span>
              </div>
            </div>

            {/* Range Sliders */}
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <label className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>🟢 البداية</span>
                  <input
                    type="number" step="0.1" min={0} max={trimEnd - 0.1}
                    value={Number(trimStart.toFixed(1))}
                    onChange={e => setTrimStart(Math.max(0, Math.min(Number(e.target.value), trimEnd - 0.1)))}
                    className="w-20 bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-green-400 text-xs font-mono text-center focus:border-green-500 focus:outline-none"
                  />
                </label>
                <input
                  type="range" min={0} max={audioDuration} step={0.05}
                  value={trimStart}
                  onChange={e => setTrimStart(Math.min(Number(e.target.value), trimEnd - 0.1))}
                  className="w-full accent-green-500 h-1.5"
                />
              </div>
              <div>
                <label className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>🔴 النهاية</span>
                  <input
                    type="number" step="0.1" min={trimStart + 0.1} max={audioDuration}
                    value={Number(trimEnd.toFixed(1))}
                    onChange={e => setTrimEnd(Math.max(trimStart + 0.1, Math.min(Number(e.target.value), audioDuration)))}
                    className="w-20 bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-red-400 text-xs font-mono text-center focus:border-red-500 focus:outline-none"
                  />
                </label>
                <input
                  type="range" min={0} max={audioDuration} step={0.05}
                  value={trimEnd}
                  onChange={e => setTrimEnd(Math.max(Number(e.target.value), trimStart + 0.1))}
                  className="w-full accent-red-500 h-1.5"
                />
              </div>
            </div>

            {/* Preview Controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={isPreviewPlaying ? stopTrimPreview : playTrimPreview}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  isPreviewPlaying
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                }`}
              >
                {isPreviewPlaying ? '⏹ إيقاف المعاينة' : '▶ معاينة المقتطع'}
              </button>
              <button
                onClick={() => { setTrimStart(0); setTrimEnd(audioDuration); }}
                className="px-3 py-2 bg-gray-700/50 text-gray-400 rounded-xl text-xs hover:bg-gray-700 transition"
              >
                ↺ إعادة تعيين
              </button>
              {(trimStart > 0.05 || (audioDuration - trimEnd) > 0.05) && (
                <span className="text-xs text-amber-500">✂️ سيتم قص المقطع عند الرفع</span>
              )}
            </div>
          </div>
        )}

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

        {/* Upload Button */}
        <div className="flex items-center gap-3 flex-wrap">
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
