'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '@/lib/socket';
import type { Socket } from 'socket.io-client';

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
  const emit = useCallback((event: string, data: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        return reject(new Error('Socket not initialized'));
      }
      
      console.log(`[useSocket] Emitting '${event}' | Socket ID: ${socketRef.current.id} | Connected: ${socketRef.current.connected}`);

      // نضيف Timeout لمدة 5 ثواني حتى لا يظل معلقاً للأبد
      if (typeof socketRef.current.timeout === 'function') {
        socketRef.current.timeout(5000).emit(event, data, (err: Error, response: any) => {
          if (err) {
            console.error(`[useSocket] ❌ Timeout emitting ${event}:`, err);
            return reject(new Error('الخادم في وضع قطع الاتصال أو لا يستجيب (Timeout)'));
          }
          if (response?.success) {
            resolve(response);
          } else {
            console.error(`[useSocket] ❌ Server returned error for ${event}:`, response?.error);
            reject(new Error(response?.error || 'Unknown error'));
          }
        });
      } else {
        // Fallback for older Socket.io clients
        socketRef.current.emit(event, data, (response: any) => {
          if (response?.success) {
            resolve(response);
          } else {
            console.error(`[useSocket] ❌ Server returned error for ${event}:`, response?.error);
            reject(new Error(response?.error || 'Unknown error'));
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
