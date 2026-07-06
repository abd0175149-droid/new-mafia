'use client';

// ══════════════════════════════════════════════════════
// 🎙️ RemoteVoice — شريط الصوت للّعب عن بُعد (يُركّب مرّةً ويبقى طوال اللعبة)
// ══════════════════════════════════════════════════════
// V2: اتصال + مايك ذاتيّ + قائمة كتم للمضيف. الفتح التلقائيّ حسب الدور = V3.

import { useEffect } from 'react';
import { useVoice, VOICE_HOST_KEY } from '../hooks/useVoice';

interface RemoteVoiceProps {
  roomId: string | null;
  enabled: boolean;
  isHost: boolean;
  selfPhysicalId: number | null;
  emit: (event: string, payload: any) => Promise<any>;
  nameByPid?: Record<number, string>;
  allowedPids?: number[];           // من يُسمح لهم بالكلام (للمضيف: يكتم غيرهم)
  shouldOpenMic?: boolean;          // للّاعب: افتح مايكه الآن (دوره حيّ أو مواجهة)
  gamePhase?: string | null;        // لإطفاء الكاميرا ليلاً
  onVoiceMaps?: (m: { videoByPid: Record<number, MediaStreamTrack | null>; audioByPid: Record<number, boolean> }) => void;
}

export default function RemoteVoice({ roomId, enabled, isHost, selfPhysicalId, emit, nameByPid, allowedPids, shouldOpenMic, gamePhase, onVoiceMaps }: RemoteVoiceProps) {
  const v = useVoice({ roomId, enabled, isHost, selfPhysicalId, emit });

  // 🎙️ فتح/غلق مايك اللاعب تلقائياً حسب دوره (V3) — لا يُقاوِم كتم اللاعب اليدويّ بين الأدوار
  useEffect(() => {
    if (isHost || !v.connected) return;
    if (shouldOpenMic && !v.selfAudioOn) v.enableSelfAudio();
    else if (!shouldOpenMic && v.selfAudioOn) v.disableSelfAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldOpenMic, v.connected, isHost]);

  // 🔇 المضيف يكتم كل متكلّم غير مسموح له (تعزيز الـ turn والمواجهة)
  useEffect(() => {
    if (!isHost || !v.connected || !v.canMute) return;
    const allow = new Set(allowedPids || []);
    Object.entries(v.audioByPid).forEach(([pidStr, isOn]) => {
      const pid = Number(pidStr);
      if (isOn && pid !== VOICE_HOST_KEY && !allow.has(pid)) v.muteParticipantByPid(pid);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, v.connected, v.canMute, allowedPids, v.audioByPid]);

  // 📷 إطفاء الكاميرا تلقائياً في الليل (مكافحة غش — لا كروت تُعرض ليلاً)
  useEffect(() => {
    if (gamePhase === 'NIGHT' && v.selfVideoOn) v.disableSelfVideo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamePhase, v.selfVideoOn]);

  // ترحيل خرائط الفيديو/الكلام للأعلى (لعرضها على الكروت في الحلقة)
  useEffect(() => {
    onVoiceMaps?.({ videoByPid: v.videoByPid, audioByPid: v.audioByPid });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.videoByPid, v.audioByPid]);

  if (!enabled) return null;

  const talking = Object.entries(v.audioByPid)
    .filter(([pid, on]) => on && Number(pid) !== VOICE_HOST_KEY && Number(pid) !== selfPhysicalId)
    .map(([pid]) => Number(pid));

  return (
    <div className="mb-3 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-block w-2 h-2 rounded-full ${v.connected ? 'bg-emerald-500' : v.error ? 'bg-red-500' : 'bg-amber-500 animate-pulse'}`} />
          <span className="text-[#c9c3b5] font-mono">
            {v.connected ? `صوت متصل · ${v.participantCount + 1}` : v.error ? 'صوت غير متاح' : 'جارٍ الاتصال…'}
          </span>
        </div>

        {/* مايك + كاميرا ذاتيّة — المضيف مايكه دائم، اللاعب يتحكّم */}
        {!isHost && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => (v.selfAudioOn ? v.disableSelfAudio() : v.enableSelfAudio())}
              disabled={!v.connected}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all disabled:opacity-40 ${
                v.selfAudioOn ? 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10' : 'border-[#2a2a2a] text-[#808080] bg-black/40'
              }`}
            >
              {v.selfAudioOn ? '🎙️ مفتوح' : '🔇 مغلق'}
            </button>
            <button
              onClick={() => (v.selfVideoOn ? v.disableSelfVideo() : v.enableSelfVideo())}
              disabled={!v.connected || gamePhase === 'NIGHT'}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all disabled:opacity-40 ${
                v.selfVideoOn ? 'border-sky-500/50 text-sky-300 bg-sky-500/10' : 'border-[#2a2a2a] text-[#808080] bg-black/40'
              }`}
              title={gamePhase === 'NIGHT' ? 'الكاميرا معطّلة ليلاً' : 'الكاميرا'}
            >
              📷
            </button>
          </div>
        )}
        {isHost && (
          <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${v.selfAudioOn ? 'border-emerald-500/50 text-emerald-300' : 'border-[#2a2a2a] text-[#808080]'}`}>
            🎙️ مايك المُوجِّه {v.selfAudioOn ? 'مفتوح' : 'مغلق'}
          </span>
        )}
      </div>

      {v.error && (
        <div className="mt-1 text-[10px] font-mono text-red-400/80">{v.error}</div>
      )}

      {/* المضيف: كتم المتكلّمين */}
      {isHost && v.canMute && talking.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {talking.map((pid) => (
            <button
              key={pid}
              onClick={() => v.muteParticipantByPid(pid)}
              className="px-2 py-1 rounded-md text-[10px] font-bold border border-red-500/40 text-red-300 bg-red-500/10"
            >
              🔇 كتم {nameByPid?.[pid] || `#${pid}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
