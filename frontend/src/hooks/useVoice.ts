'use client';

// ══════════════════════════════════════════════════════
// 🎙️ useVoice — عميل RealtimeKit للّعب عن بُعد (headless)
// ══════════════════════════════════════════════════════
// ينضمّ لاجتماع الغرفة مرّةً واحدة، يربط صوت المشاركين، ويوفّر تحكّم المايك/الكاميرا.
// المضيف ينضمّ ومايكه مفتوح؛ اللاعب ينضمّ ومايكه مغلق (يُفتح في دوره — منطق V3).
// خرائط الحالة مفهرَسة بـ physicalId (المضيف = مفتاح -1) لربطها بالكروت.

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadRealtimeKit, rtkArray, physicalIdFromCustom } from '../lib/voice';

export const VOICE_HOST_KEY = -1;

export interface VoiceApi {
  connected: boolean;
  error: string | null;
  selfAudioOn: boolean;
  selfVideoOn: boolean;
  canMute: boolean; // صلاحية كتم الآخرين (المضيف)
  selfVideoTrack: MediaStreamTrack | null;
  audioByPid: Record<number, boolean>;              // من مايكه مفتوح
  videoByPid: Record<number, MediaStreamTrack | null>; // كاميرات المشاركين
  participantCount: number;
  log: string[];                                       // سجلّ تشخيصيّ (للمضيف)
  speakerMode: boolean;                                // خرج الصوت من السمّاعة الخارجية
  setSpeakerphone: (on: boolean) => void;
  enableSelfAudio: () => Promise<void>;
  disableSelfAudio: () => Promise<void>;
  enableSelfVideo: () => Promise<void>;
  disableSelfVideo: () => Promise<void>;
  muteParticipantByPid: (pid: number, name?: string) => Promise<void>;
}

export function useVoice(opts: {
  roomId: string | null;
  enabled: boolean;
  isHost: boolean;
  selfPhysicalId: number | null;
  emit: (event: string, payload: any) => Promise<any>;
}): VoiceApi {
  const { roomId, enabled, isHost, selfPhysicalId, emit } = opts;

  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selfAudioOn, setSelfAudioOn] = useState(false);
  const [selfVideoOn, setSelfVideoOn] = useState(false);
  const [canMute, setCanMute] = useState(false);
  const [selfVideoTrack, setSelfVideoTrack] = useState<MediaStreamTrack | null>(null);
  const [audioByPid, setAudioByPid] = useState<Record<number, boolean>>({});
  const [videoByPid, setVideoByPid] = useState<Record<number, MediaStreamTrack | null>>({});
  const [participantCount, setParticipantCount] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const pushLog = useCallback((msg: string) => {
    let t = ''; try { t = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { /* noop */ }
    setLog((l) => [...l.slice(-40), `${t} · ${msg}`]);
  }, []);
  const pushLogRef = useRef(pushLog);
  useEffect(() => { pushLogRef.current = pushLog; }, [pushLog]);

  const meetingRef = useRef<any>(null);
  const audioEls = useRef<Map<string, HTMLAudioElement>>(new Map());
  const srcNodes = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const selfPidRef = useRef<number | null>(selfPhysicalId);
  const emitRef = useRef(emit);
  // 🔊 وضع السمّاعة الخارجية: نمرّر صوت المشاركين عبر AudioContext ليخرج من السبيكر لا سمّاعة الأذن (أندرويد)
  const speakerModeRef = useRef(true);
  const [speakerMode, setSpeakerModeState] = useState(true);
  useEffect(() => { selfPidRef.current = selfPhysicalId; }, [selfPhysicalId]);
  useEffect(() => { emitRef.current = emit; }, [emit]);

  const ensureAudioCtx = useCallback((): AudioContext | null => {
    try {
      if (!audioCtxRef.current) {
        const Ctor = (window.AudioContext || (window as any).webkitAudioContext);
        if (!Ctor) return null;
        audioCtxRef.current = new Ctor();
      }
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume().catch(() => {});
      return audioCtxRef.current;
    } catch { return null; }
  }, []);
  const ensureAudioCtxRef = useRef(ensureAudioCtx);
  useEffect(() => { ensureAudioCtxRef.current = ensureAudioCtx; }, [ensureAudioCtx]);

  const attachAudio = useCallback((p: any) => {
    try {
      if (!p?.audioTrack) {
        const old = audioEls.current.get(p.id);
        if (old) { try { old.pause(); } catch { /* noop */ } old.srcObject = null; old.remove(); audioEls.current.delete(p.id); }
        const oldSn = srcNodes.current.get(p.id);
        if (oldSn) { try { oldSn.disconnect(); } catch { /* noop */ } srcNodes.current.delete(p.id); }
        return;
      }
      let el = audioEls.current.get(p.id);
      if (!el) {
        el = document.createElement('audio');
        el.autoplay = true;
        (el as any).playsInline = true;
        document.body.appendChild(el);
        audioEls.current.set(p.id, el);
      }
      const stream = new MediaStream([p.audioTrack]);
      el.srcObject = stream;
      // أعد بناء عقدة المصدر دائماً (التراك قد يتغيّر)
      const prevSn = srcNodes.current.get(p.id);
      if (prevSn) { try { prevSn.disconnect(); } catch { /* noop */ } srcNodes.current.delete(p.id); }
      const ac = speakerModeRef.current ? ensureAudioCtx() : null;
      if (ac) {
        try {
          const sn = ac.createMediaStreamSource(stream);
          sn.connect(ac.destination);
          srcNodes.current.set(p.id, sn);
          el.muted = true;            // الخرج عبر AudioContext ← السبيكر؛ نكتم العنصر لتجنّب سمّاعة الأذن/الازدواج
        } catch { el.muted = false; } // فشل التوجيه ← ارجع لتشغيل العنصر مباشرة
      } else {
        el.muted = false;
      }
      const pr = el.play?.();
      if (pr && pr.catch) pr.catch(() => {});
    } catch { /* noop */ }
  }, [ensureAudioCtx]);

  const setSpeakerphone = useCallback((on: boolean) => {
    speakerModeRef.current = on;
    setSpeakerModeState(on);
    if (on) ensureAudioCtx();
    const m = meetingRef.current;
    if (m) rtkArray(m.participants?.joined).forEach((p: any) => attachRef.current(p));
  }, [ensureAudioCtx]);

  const pidOf = (p: any): number | null =>
    p?.customParticipantId === 'host' ? VOICE_HOST_KEY : physicalIdFromCustom(p?.customParticipantId);

  const rebuild = useCallback(() => {
    const m = meetingRef.current;
    if (!m) return;
    const a: Record<number, boolean> = {};
    const v: Record<number, MediaStreamTrack | null> = {};
    const selfPid = isHost ? VOICE_HOST_KEY : selfPidRef.current;
    if (selfPid != null) {
      a[selfPid] = !!m.self?.audioEnabled;
      v[selfPid] = m.self?.videoEnabled ? (m.self?.videoTrack ?? null) : null;
    }
    const joined = rtkArray(m.participants?.joined);
    joined.forEach((p: any) => {
      const pid = pidOf(p);
      if (pid == null) return;
      a[pid] = !!p.audioEnabled;
      v[pid] = p.videoEnabled ? (p.videoTrack ?? null) : null;
    });
    setSelfAudioOn(!!m.self?.audioEnabled);
    setSelfVideoOn(!!m.self?.videoEnabled);
    setSelfVideoTrack(m.self?.videoEnabled ? (m.self?.videoTrack ?? null) : null);
    setCanMute(!!m.self?.permissions?.canDisableParticipantAudio);
    setAudioByPid(a);
    setVideoByPid(v);
    setParticipantCount(joined.length);
  }, [isHost]);
  const rebuildRef = useRef(rebuild);
  const attachRef = useRef(attachAudio);
  useEffect(() => { rebuildRef.current = rebuild; }, [rebuild]);
  useEffect(() => { attachRef.current = attachAudio; }, [attachAudio]);

  useEffect(() => {
    if (!enabled || !roomId) return;
    let cancelled = false;

    const wireP = (p: any) => {
      attachRef.current(p);
      p.on?.('audioUpdate', () => { attachRef.current(p); rebuildRef.current(); });
      p.on?.('videoUpdate', () => rebuildRef.current());
    };

    (async () => {
      try {
        const res = await emitRef.current('voice:get-token', { roomId });
        if (!res?.success) { if (!cancelled) { setError(res?.error || 'voice_token_failed'); pushLogRef.current(`❌ تعذّر توكن الصوت: ${res?.error || 'خطأ'}`); } return; }
        const RealtimeKitClient = await loadRealtimeKit();
        const meeting = await RealtimeKitClient.init({ authToken: res.authToken, defaults: { audio: isHost, video: false } });
        if (cancelled) { try { meeting.leave(); } catch { /* noop */ } return; }
        meetingRef.current = meeting;

        const j = meeting.participants?.joined;
        if (j?.on) {
          j.on('participantJoined', (p: any) => { wireP(p); rebuildRef.current(); pushLogRef.current(`➕ انضمّ ${p?.name || pidOf(p) || 'مشارك'}`); });
          j.on('participantLeft', (p: any) => {
            const el = audioEls.current.get(p.id);
            if (el) { el.remove(); audioEls.current.delete(p.id); }
            rebuildRef.current();
            pushLogRef.current(`➖ غادر ${p?.name || pidOf(p) || 'مشارك'}`);
          });
        }
        if (meeting.self?.on) {
          meeting.self.on('audioUpdate', () => rebuildRef.current());
          meeting.self.on('videoUpdate', () => rebuildRef.current());
          meeting.self.on('permissionsUpdate', () => rebuildRef.current());
          meeting.self.on('roomJoined', () => rebuildRef.current());
        }

        await meeting.join();
        if (cancelled) { try { meeting.leave(); } catch { /* noop */ } return; }
        rtkArray(meeting.participants?.joined).forEach(wireP);
        setConnected(true);
        setError(null);
        if (speakerModeRef.current) ensureAudioCtxRef.current();
        rebuildRef.current();
        pushLogRef.current(`✅ متّصل بالصوت (${isHost ? 'مضيف' : 'لاعب'})`);
      } catch (e: any) {
        if (!cancelled) { setError(e?.message || 'voice_join_failed'); pushLogRef.current(`❌ فشل الاتصال بالصوت: ${e?.message || 'خطأ'}`); }
      }
    })();

    return () => {
      cancelled = true;
      try { meetingRef.current?.leave(); } catch { /* noop */ }
      meetingRef.current = null;
      srcNodes.current.forEach((sn) => { try { sn.disconnect(); } catch { /* noop */ } });
      srcNodes.current.clear();
      audioEls.current.forEach((el) => { try { el.pause(); } catch { /* noop */ } el.srcObject = null; el.remove(); });
      audioEls.current.clear();
      try { audioCtxRef.current?.close(); } catch { /* noop */ }
      audioCtxRef.current = null;
      setConnected(false);
    };
  }, [enabled, roomId, isHost]);

  // 🔊 استئناف AudioContext عند أوّل تفاعل (سياسة التشغيل التلقائي تُبقيه معلّقاً حتى إيماءة المستخدم)
  useEffect(() => {
    if (!enabled) return;
    const resume = () => { if (speakerModeRef.current) ensureAudioCtxRef.current(); };
    window.addEventListener('pointerdown', resume, { passive: true });
    window.addEventListener('touchstart', resume, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('touchstart', resume);
    };
  }, [enabled]);

  const enableSelfAudio = useCallback(async () => { try { await meetingRef.current?.self?.enableAudio(); } catch { /* noop */ } }, []);
  const disableSelfAudio = useCallback(async () => { try { await meetingRef.current?.self?.disableAudio(); } catch { /* noop */ } }, []);
  const enableSelfVideo = useCallback(async () => { try { await meetingRef.current?.self?.enableVideo(); } catch { /* noop */ } setTimeout(() => rebuildRef.current(), 120); rebuildRef.current(); }, []);
  const disableSelfVideo = useCallback(async () => { try { await meetingRef.current?.self?.disableVideo(); } catch { /* noop */ } rebuildRef.current(); }, []);
  const muteParticipantByPid = useCallback(async (pid: number, name?: string) => {
    const m = meetingRef.current;
    const label = name || `#${pid}`;
    if (!m) return;
    const p = rtkArray(m.participants?.joined).find(
      (x: any) => (x.customParticipantId === 'host' ? VOICE_HOST_KEY : physicalIdFromCustom(x.customParticipantId)) === pid,
    );
    if (!p) { pushLogRef.current(`⚠️ ${label} غير موجود في الصوت`); return; }
    if (!p.audioEnabled) { pushLogRef.current(`${label} مايكه مغلق أصلاً`); return; }
    try { await p.disableAudio(); pushLogRef.current(`🔇 كتمتَ ${label}`); }
    catch (e: any) { pushLogRef.current(`❌ فشل كتم ${label}: ${e?.message || 'خطأ'}`); }
  }, []);

  return {
    connected, error, selfAudioOn, selfVideoOn, canMute, selfVideoTrack,
    audioByPid, videoByPid, participantCount, log, speakerMode, setSpeakerphone,
    enableSelfAudio, disableSelfAudio, enableSelfVideo, disableSelfVideo, muteParticipantByPid,
  };
}
