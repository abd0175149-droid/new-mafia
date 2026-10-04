'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '@/lib/socket';
import type { Socket } from 'socket.io-client';

const SEAT_CLAIM_EVENTS = new Set(['room:auto-join', 'room:rejoin-player', 'room:get-my-state']);

/**
 * Hook مخصص لإدارة اتصال Socket.IO
 */
export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    function onConnect() {
      setIsConnected(true);
    }
    function onDisconnect() {
      setIsConnected(false);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // Check current connection state
    if (socket.connected) {
      setIsConnected(true);
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  /**
   * إرسال حدث مع callback و Timeout
   */
  const emit = useCallback((event: string, rawData: any): Promise<any> => {
    // 🪪 أحداثُ استرداد المقعد تحمل توكنَ اللاعب نفسَه: الخادمُ لا يقبل ادّعاءَ مقعدٍ مربوطٍ
    //    بحساب إلّا بتوكنه، ومقبسٌ فُتح قبل تسجيل الدخول لا يحمله في المصافحة.
    let data = rawData;
    if (SEAT_CLAIM_EVENTS.has(event) && data && typeof data === 'object' && !data.playerToken) {
      try {
        const t = typeof window !== 'undefined' ? localStorage.getItem('mafia_player_token') : null;
        if (t) data = { ...data, playerToken: t };
      } catch { /* التخزين غير متاح */ }
    }
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        return reject(new Error('Socket not initialized'));
      }
      
      console.log(`[useSocket] Emitting '${event}' | Socket ID: ${socketRef.current.id} | Connected: ${socketRef.current.connected}`);

      // نضيف Timeout لمدة 15 ثانية (العمليات المعقدة مثل التوزيع العشوائي تحتاج وقت)
      if (typeof socketRef.current.timeout === 'function') {
        socketRef.current.timeout(15000).emit(event, data, (err: Error, response: any) => {
          if (err) {
            console.error(`[useSocket] ❌ Timeout emitting ${event}:`, err);
            return reject(new Error('الخادم في وضع قطع الاتصال أو لا يستجيب (Timeout)'));
          }
          if (response?.success) {
            resolve(response);
          } else {
            console.error(`[useSocket] ❌ Server returned error for ${event}:`, response?.error);
            const errorObj: any = new Error(response?.error || 'Unknown error');
            errorObj.response = response;
            reject(errorObj);
          }
        });
      } else {
        // Fallback for older Socket.io clients
        socketRef.current.emit(event, data, (response: any) => {
          if (response?.success) {
            resolve(response);
          } else {
            console.error(`[useSocket] ❌ Server returned error for ${event}:`, response?.error);
            const errorObj: any = new Error(response?.error || 'Unknown error');
            errorObj.response = response;
            reject(errorObj);
          }
        });
      }
    });
  }, []);

  /**
   * الاستماع لحدث
   */
  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.on(event, handler);
    return () => {
      socketRef.current?.off(event, handler);
    };
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    emit,
    on,
  };
}
