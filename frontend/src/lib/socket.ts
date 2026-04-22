'use client';

import { io, Socket } from 'socket.io-client';

// NEXT_PUBLIC_SOCKET_URL يشير لـ API hostname مباشرة
// في الإنتاج: فارغ → يستخدم نفس الدومين عبر Next.js rewrites
// محلياً: http://localhost:4000
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || '';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['polling', 'websocket'], // Use polling first for maximum compatibility with strict firewalls/Cloudflare
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity, // Keep trying!
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
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
