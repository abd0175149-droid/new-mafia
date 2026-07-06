'use client';

// ══════════════════════════════════════════════════════
// 🎙️ RemoteVoice — شريط الصوت للّعب عن بُعد (يُركّب مرّةً ويبقى طوال اللعبة)
// ══════════════════════════════════════════════════════
// V2: اتصال + مايك ذاتيّ + قائمة كتم للمضيف. الفتح التلقائيّ حسب الدور = V3.

import { useEffect, useRef, useState } from 'react';
import { useVoice, VOICE_HOST_KEY } from '../hooks/useVoice';

// معاينة كاميرا اللاعب نفسه (مرآة) — تظهر دائماً حين تُفتح الكاميرا
function SelfPreview({ track }: { track: MediaStreamTrack }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && track) { try { el.srcObject = new MediaStream([track]); } catch { /* noop */ } }
    return () => { if (el) el.srcObject = null; };
  }, [track]);
  return <video ref={ref} autoPlay muted playsInline className="w-[76px] h-[104px] rounded-xl object-cover border-2 border-sky-500/60 shadow-lg bg-black" style={{ transform: 'scaleX(-1)' }} />;
}

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
  const [showLog, setShowLog] = useState(false);
  // 🔊 اللوبي/ما قبل اللعب: مايك حرّ يدويّ للجميع (بلا قفل، بلا كتم من المضيف)
  const freeMic = ['LOBBY', 'ROLE_GENERATION', 'ROLE_BINDING', 'GAME_OVER'].includes(gamePhase || '');

  // 🎙️ قفل سياديّ لمايك اللاعب أثناء اللعب: يُفتح فقط في دوره؛ في اللوبي حرّ (لا قفل).
  useEffect(() => {
    if (isHost || !v.connected || freeMic) return;
    if (shouldOpenMic && !v.selfAudioOn) v.enableSelfAudio();
    else if (!shouldOpenMic && v.selfAudioOn) v.disableSelfAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldOpenMic, v.connected, isHost, v.selfAudioOn, freeMic]);

  // 🔇 المضيف يكتم كل متكلّم غير مسموح له (أثناء اللعب فقط — لا كتم في اللوبي الحرّ)
  useEffect(() => {
    if (!isHost || !v.connected || !v.canMute || freeMic) return;
    const allow = new Set(allowedPids || []);
    Object.entries(v.audioByPid).forEach(([pidStr, isOn]) => {
      const pid = Number(pidStr);
      if (isOn && pid !== VOICE_HOST_KEY && !allow.has(pid)) v.muteParticipantByPid(pid);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, v.connected, v.canMute, allowedPids, v.audioByPid, freeMic]);

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

  // ── اللاعب: زرّان عائمان (مايك آليّ + كاميرا) — بلا شريط حالة/عدد ──
  if (!isHost) {
    return (
      <div className="fixed left-3 bottom-28 z-40 flex flex-col gap-2 items-center">
        {v.selfVideoOn && v.selfVideoTrack && <SelfPreview track={v.selfVideoTrack} />}
        <button
          onClick={() => { if (freeMic && v.connected) { if (v.selfAudioOn) v.disableSelfAudio(); else v.enableSelfAudio(); } }}
          className={`w-11 h-11 rounded-full flex items-center justify-center text-lg border backdrop-blur transition-all ${freeMic ? 'cursor-pointer' : 'cursor-default'} ${
            v.selfAudioOn ? 'bg-emerald-500/25 border-emerald-500/60 text-emerald-200 shadow-[0_0_16px_rgba(52,211,153,.45)]' : 'bg-black/65 border-[#2a2a2a] text-[#808080]'
          }`}
          title={freeMic ? (v.selfAudioOn ? 'اضغط لكتم مايكك' : 'اضغط لفتح مايكك (لوبي)') : (v.selfAudioOn ? 'دورك — مايكك مفتوح' : 'مايكك مغلق (يُفتح في دورك)')}
        >
          {v.selfAudioOn ? '🎙️' : '🔇'}
        </button>
        <button
          onClick={() => (v.selfVideoOn ? v.disableSelfVideo() : v.enableSelfVideo())}
          disabled={!v.connected || gamePhase === 'NIGHT'}
          className={`w-11 h-11 rounded-full flex items-center justify-center text-lg border backdrop-blur transition-all disabled:opacity-40 ${
            v.selfVideoOn ? 'bg-sky-500/25 border-sky-500/60 text-sky-200 shadow-[0_0_16px_rgba(56,189,248,.45)]' : 'bg-black/65 border-[#2a2a2a] text-[#808080]'
          }`}
          title={gamePhase === 'NIGHT' ? 'الكاميرا معطّلة ليلاً' : 'الكاميرا'}
        >
          📷
        </button>
      </div>
    );
  }

  // ── المضيف: شريط الصوت + كتم المتكلّمين ──
  return (
    <div className="mb-3 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-block w-2 h-2 rounded-full ${v.connected ? 'bg-emerald-500' : v.error ? 'bg-red-500' : 'bg-amber-500 animate-pulse'}`} />
          <span className="text-[#c9c3b5] font-mono">
            {v.connected ? `صوت · ${v.participantCount + 1}` : v.error ? 'صوت غير متاح' : 'جارٍ الاتصال…'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowLog((s) => !s)}
            className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition-all ${showLog ? 'border-amber-500/50 text-amber-300 bg-amber-500/10' : 'border-[#2a2a2a] text-[#808080] bg-black/40'}`}
            title="سجلّ الصوت التشخيصيّ"
          >
            📋
          </button>
          <button
            onClick={() => (v.selfAudioOn ? v.disableSelfAudio() : v.enableSelfAudio())}
            disabled={!v.connected}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all disabled:opacity-40 ${v.selfAudioOn ? 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10' : 'border-[#2a2a2a] text-[#808080] bg-black/40'}`}
            title={v.selfAudioOn ? 'اضغط لكتم مايكك' : 'اضغط لفتح مايكك'}
          >
            {v.selfAudioOn ? '🎙️ مايكك مفتوح' : '🔇 مايكك مغلق'}
          </button>
        </div>
      </div>
      {v.canMute && talking.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {talking.map((pid) => (
            <button
              key={pid}
              onClick={() => v.muteParticipantByPid(pid, nameByPid?.[pid])}
              className="px-2 py-1 rounded-md text-[10px] font-bold border border-red-500/40 text-red-300 bg-red-500/10"
            >
              🔇 كتم {nameByPid?.[pid] || `#${pid}`}
            </button>
          ))}
        </div>
      )}
      {showLog && (
        <div className="mt-2 rounded-lg border border-[#1a1a1a] bg-black/50 p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[#c9c3b5] font-bold">📋 سجلّ الصوت</span>
            <span className="text-[9px] text-[#666]">اللاعب يفتح مايكه بنفسه؛ تقدر تكتمه من هنا</span>
          </div>
          <div className="max-h-28 overflow-y-auto flex flex-col gap-0.5 text-[10px] font-mono leading-relaxed" dir="rtl">
            {v.log.length === 0 ? (
              <span className="text-[#555]">لا أحداث بعد…</span>
            ) : (
              v.log.slice(-14).map((line, i) => (
                <span key={i} className="text-[#9a9a9a] whitespace-pre-wrap break-words">{line}</span>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
