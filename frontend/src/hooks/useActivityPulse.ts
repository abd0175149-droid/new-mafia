'use client';

// ══════════════════════════════════════════════════════
// 🌙 نبض الليلة — لقطةٌ ثمّ نبض
//
// 🔴 لا يُبثّ عدٌّ تنازليّ إطلاقاً: الخادم يرسل startedAt و totalSeconds مرّةً،
//    والعميل يحسب المتبقّي محلّيّاً — نمطُ التطبيق القائم، ولا يوجد timer:tick
//    في المشروع كلّه.
//
// 🔴 ساعةُ الهاتف قد تنحرف دقائق، فتُعاير على serverNow في كلّ لقطة.
//    بلا هذا يظهر مؤقّتٌ سالبٌ أو لعبةٌ «انتهت» وهي تجري.
//
// 🔴 حدث activity:pulse إشارةٌ لا حمولة: النبض شخصيّ (me · الغرفة المختارة)
//    فالعميل يسحب لقطتَه عند كلّ إشارة.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '@/lib/socket';

export type SlotState = 'done' | 'live' | 'future';

export interface PulseSlot {
  ordinal: number;
  label: string;
  planStart: string | null;
  planEnd: string | null;
  outsidePlan: boolean;
  state: SlotState;
  matchId: number | null;
  actualStart: number | null;
  actualEnd: number | null;
  projectedStart: number;
  projectedEnd: number;
  driftMin: number | null;
  winner: string | null;
}
export interface PulseCounts { mafiaAlive: number; citizenAlive: number; neutralAlive: number }
export interface ActivityPulse {
  serverNow: number;
  activities: { id: number; name: string; date: string; place: string | null; roomCount: number; selected: boolean }[];
  rooms: { id: number; name: string; joinCode: string; isMine: boolean; isRemote: boolean; selected: boolean }[];
  activityId: number | null;
  activityName: string | null;
  place: string | null;
  roomId: number | null;
  status: 'pre' | 'live' | 'break' | 'ended' | 'no-room';
  slots: PulseSlot[];
  live: {
    round: number; phase: string; rolesConfirmed: boolean; isRemote: boolean;
    timer: { totalSeconds: number; startedAt: number; expired: boolean } | null;
    teamCounts: PulseCounts | null;
    teamTotals: PulseCounts | null;
    roomOrdinal: number; ofRoom: number; outsidePlan: boolean;
  } | null;
  me: { inRoom: true; seat: number; isAlive: boolean } | null;
}

const POLL_MS = 60_000;

export function useActivityPulse(token: string | null | undefined, enabled = true) {
  const [pulse, setPulse] = useState<ActivityPulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // اختيار اللاعب يتفوّق على اختيار الخادم بعد أوّل تبديل
  const [pickAct, setPickAct] = useState<number | null>(null);
  const [pickRoom, setPickRoom] = useState<number | null>(null);

  // انحرافُ ساعة الجهاز عن ساعة الخادم (ms)
  const offsetRef = useRef(0);
  const inflight = useRef(false);
  const subscribed = useRef<number | null>(null);

  const fetchPulse = useCallback(async (actId?: number | null, roomId?: number | null) => {
    if (!token || !enabled) return;
    if (inflight.current) return;
    inflight.current = true;
    try {
      const q = new URLSearchParams();
      if (actId != null) q.set('activityId', String(actId));
      if (roomId != null) q.set('roomId', String(roomId));
      const res = await fetch(`/api/player-app/pulse${q.toString() ? '?' + q : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) { setDenied(true); setPulse(null); return; }
      const data = await res.json();
      if (!data?.success || !data.pulse) { setError(data?.error || 'تعذّر الجلب'); return; }
      offsetRef.current = data.pulse.serverNow - Date.now();
      setDenied(false); setError(null);
      setPulse(data.pulse);
    } catch {
      setError('تعذّر الاتّصال');
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [token, enabled]);

  // ── اللقطة الأولى + شبكةُ أمانٍ كلّ دقيقة إن سقط السوكِت ──
  useEffect(() => {
    if (!enabled || !token) return;
    fetchPulse(pickAct, pickRoom);
    const t = setInterval(() => fetchPulse(pickAct, pickRoom), POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') fetchPulse(pickAct, pickRoom); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [enabled, token, pickAct, pickRoom, fetchPulse]);

  // ── النبض: اشتراكٌ في غرفة الفعاليّة، وإعادةُ اشتراكٍ عند كلّ اتّصال ──
  const activeActivityId = pulse?.activityId ?? null;
  useEffect(() => {
    if (!enabled || !token || activeActivityId == null) return;
    const socket = getSocket();

    const subscribe = () => {
      socket.emit('activity:subscribe', { activityId: activeActivityId }, (r: any) => {
        subscribed.current = r?.success ? activeActivityId : null;
      });
    };
    subscribe();
    socket.on('connect', subscribe);

    const onPulse = (p: { activityId: number }) => {
      if (p?.activityId === activeActivityId) fetchPulse(pickAct, pickRoom);
    };
    socket.on('activity:pulse', onPulse);

    return () => {
      socket.off('connect', subscribe);
      socket.off('activity:pulse', onPulse);
      if (subscribed.current != null) socket.emit('activity:unsubscribe');
      subscribed.current = null;
    };
  }, [enabled, token, activeActivityId, pickAct, pickRoom, fetchPulse]);

  const selectActivity = useCallback((id: number) => {
    setPickAct(id); setPickRoom(null); setLoading(true);
  }, []);
  const selectRoom = useCallback((id: number) => {
    setPickRoom(id);
  }, []);

  /** الآن بساعة الخادم — كلّ حسابٍ زمنيّ يمرّ من هنا */
  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  return { pulse, loading, denied, error, selectActivity, selectRoom, serverNow, refresh: () => fetchPulse(pickAct, pickRoom) };
}
