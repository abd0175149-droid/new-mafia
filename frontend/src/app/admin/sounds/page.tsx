'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { swalConfirm } from '@/lib/swal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// 🔑 الكتالوجُ من المصدر الواحد — lib/sound-keys.ts. كانت نسخةٌ محلّيّة هنا تفترق
//    عمّا يناديه الكود: مفتاحٌ يُنادى كلَّ ليلة لم يكن فيها فلا سبيل لرفع ملفٍّ له.
import { SOUND_GROUPS, ALL_SOUND_KEYS, SOUND_CATEGORIES, type SoundKeyDef } from '@/lib/sound-keys';
const EVENT_GROUPS = SOUND_GROUPS;
const ALL_EVENTS = ALL_SOUND_KEYS;

type Coverage = Record<string, { id: number; name: string; filename: string; isActive: boolean; others: number }>;
type KeyStatus = 'file' | 'inactive' | 'synth' | 'silent';
function keyStatus(k: SoundKeyDef, cov: Coverage): KeyStatus {
  const c = cov[k.key];
  if (c?.isActive) return 'file';
  if (c) return 'inactive';
  return k.synth ? 'synth' : 'silent';
}
const STATUS_UI: Record<KeyStatus, { label: string; cls: string }> = {
  file:     { label: '📁 ملفّ',        cls: 'bg-green-500/15 text-green-400 border-green-500/25' },
  inactive: { label: '⏸ ملفٌّ معطَّل', cls: 'bg-gray-500/15 text-gray-400 border-gray-600/30' },
  synth:    { label: '🎛️ مركّب',       cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  silent:   { label: '🔇 صامت',        cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
};

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
  // 📋 التبويب الرئيس «الأحداث»: يجيب «ماذا يُسمع عند كلّ حدث؟» — والملفّات تبويبٌ ثانٍ للإدارة الخام
  const [tab, setTab] = useState<'events' | 'files'>('events');
  const [coverage, setCoverage] = useState<Coverage>({});
  const [statusFilter, setStatusFilter] = useState<'all' | KeyStatus>('all');
  const uploadFormRef = useRef<HTMLDivElement | null>(null);
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
      // التغطية بالتوازي — لا تُعطّل القائمة إن فشلت
      fetch(`${API_URL}/api/sounds/coverage`, { headers }).then(r => r.json())
        .then(d => { if (d?.success) setCoverage(d.coverage || {}); }).catch(() => {});
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
    if (!(await swalConfirm(`هل تريد حذف "${name}" نهائياً؟`))) return;
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
        <div className="flex gap-2 mt-4">
          {([['events', '📋 الأحداث'], ['files', '📂 الملفّات']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition ${tab === k ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-gray-800/60 text-gray-400 border border-gray-700/50 hover:text-white'}`}>
              {l}
            </button>
          ))}
        </div>
        <p className="text-gray-500 text-sm mt-1 font-mono tracking-wide">SOUND EFFECTS MANAGER</p>
      </div>

      {/* ═══ الأحداث — خريطةُ ما يُسمع ═══ */}
      {tab === 'events' && (() => {
        const all = ALL_EVENTS.map(k => ({ k, st: keyStatus(k, coverage) }));
        const count = (st: KeyStatus) => all.filter(x => x.st === st).length;
        const catLabel = (c: string) => SOUND_CATEGORIES.find(x => x.key === c)?.labelAr || c;
        const gotoUpload = (key: string, replace = false) => {
          setSelectedKeys([key]);
          setUploadName(replace ? `${ALL_EVENTS.find(e => e.key === key)?.label || key} — بديل` : (ALL_EVENTS.find(e => e.key === key)?.label || key));
          setTab('files');
          setTimeout(() => uploadFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
        };
        return (
          <div className="mb-8">
            <div className="flex flex-wrap gap-2 mb-5">
              {([['all', `الكلّ ${all.length}`], ['silent', `🔇 صامت ${count('silent')}`], ['synth', `🎛️ مركّب ${count('synth')}`], ['file', `📁 ملفّ ${count('file')}`], ['inactive', `⏸ معطَّل ${count('inactive')}`]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setStatusFilter(k as any)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition ${statusFilter === k ? 'bg-amber-500/15 text-amber-400 border-amber-500/40' : 'bg-gray-800/50 text-gray-400 border-gray-700/50 hover:text-white'}`}>
                  {l}
                </button>
              ))}
            </div>
            {count('silent') > 0 && statusFilter === 'all' && (
              <p className="text-xs text-rose-300 bg-rose-500/[0.07] border border-rose-500/25 rounded-xl px-4 py-2.5 mb-4">
                🔇 <b>{count('silent')}</b> حدثاً يُنادى في اللعبة ولا يُصدر شيئاً — لا ملفَّ له ولا نغمة. اضغط ⬆ بجواره لرفع ملفّ.
              </p>
            )}
            <div className="space-y-5">
              {EVENT_GROUPS.map(group => {
                const rows = group.events.map(k => ({ k, st: keyStatus(k, coverage) }))
                  .filter(x => statusFilter === 'all' || x.st === statusFilter);
                if (rows.length === 0) return null;
                const covered = group.events.filter(k => keyStatus(k, coverage) === 'file').length;
                return (
                  <div key={group.label}>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-sm font-bold text-amber-400">{group.label}</h3>
                      <span className="flex-1 h-px bg-gray-800" />
                      <span className="text-[11px] text-gray-500 font-mono">{covered} / {group.events.length} بملفّ</span>
                    </div>
                    <div className="space-y-1.5">
                      {rows.map(({ k, st }) => {
                        const c = coverage[k.key];
                        const ui = STATUS_UI[st];
                        return (
                          <div key={k.key} className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 border ${st === 'silent' ? 'bg-rose-500/[0.04] border-rose-500/20' : 'bg-gray-900/50 border-gray-800/60'}`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white font-bold truncate">{k.label}</p>
                              <p className="text-[11px] text-gray-500 truncate">{k.desc} · <span className="text-gray-600">{catLabel(k.cat)}</span></p>
                            </div>
                            {c && (
                              <span className="text-[11px] text-gray-400 font-mono truncate max-w-[160px] hidden md:inline" title={c.filename}>
                                {c.name}{c.others > 0 && <span className="text-gray-600"> +{c.others}</span>}
                              </span>
                            )}
                            <span className={`text-[10.5px] px-2 py-0.5 rounded-full border whitespace-nowrap ${ui.cls}`}>{ui.label}</span>
                            <div className="flex gap-1 shrink-0">
                              {c && (
                                <button onClick={() => { const snd = sounds.find(x => x.id === c.id); if (snd) handlePlay(snd); }}
                                  className="w-8 h-8 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 text-xs" title="استمع">▶</button>
                              )}
                              {c && !c.isActive && (
                                <button onClick={() => handleToggle(c.id)}
                                  className="w-8 h-8 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 text-xs" title="فعّل الملفّ">✅</button>
                              )}
                              <button onClick={() => gotoUpload(k.key, !!c)}
                                className={`w-8 h-8 rounded-lg text-xs ${st === 'silent' ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                                title={c ? 'ارفع ملفّاً بديلاً' : 'ارفع ملفّاً لهذا الحدث'}>
                                {c ? '⇄' : '⬆'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {tab === 'files' && (<>
      {/* ═══ Upload Form ═══ */}
      <div className="bg-gray-900/60 border border-gray-800/50 rounded-2xl p-6 backdrop-blur-sm">
        <h2 ref={uploadFormRef as any} className="text-lg font-bold text-amber-400 mb-4">📁 رفع ملف صوتي جديد</h2>

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
                        {assignedTo && (
                          <span className="text-[10px] text-amber-600 truncate max-w-[80px]" title={isSelected ? `سيُستبدل ملفّ «${assignedTo}» على هذا الحدث` : ''}>
                            {isSelected ? '⚠️ يستبدل' : ''}({assignedTo})
                          </span>
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
      </>)}
    </div>
  );
}
