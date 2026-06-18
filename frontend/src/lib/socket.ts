'use client';

import { io, Socket } from 'socket.io-client';

// NEXT_PUBLIC_SOCKET_URL يشير لـ API hostname مباشرة
// في الإنتاج: فارغ → يستخدم نفس الدومين عبر Next.js rewrites
// محلياً: http://localhost:4000
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || '';

let socket: Socket | null = null;

// يقرأ التوكنات من localStorage عند كل (إعادة) اتصال — لإرسال هوية موثّقة للسيرفر
function readAuth() {
  try {
    return {
      token: localStorage.getItem('token') || localStorage.getItem('leader_token') || '',
      playerToken: localStorage.getItem('mafia_player_token') || '',
    };
  } catch {
    return {};
  }
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['polling', 'websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      // دالة auth تُستدعى عند كل اتصال/إعادة اتصال فتُعيد قراءة التوكن المحدّث
      auth: (cb: (data: Record<string, any>) => void) => cb(readAuth()),
    });

    socket.on('connect', () => {
      console.log('🔌 Socket connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('📴 Socket disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('❌ Socket connection error:', err.message);
    });
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// يُعيد الاتصال لإرسال التوكن المحدّث (يُستدعى بعد تسجيل الدخول مباشرةً)
export function reconnectSocketAuth(): void {
  if (socket) {
    try { (socket.auth as any) = readAuth(); } catch {}
    socket.disconnect();
    socket.connect();
  }
}
