'use client';

import { io, Socket } from 'socket.io-client';

// NEXT_PUBLIC_SOCKET_URL يشير لـ API hostname مباشرة
// في الإنتاج: فارغ → يستخدم نفس الدومين عبر Next.js rewrites
// محلياً: http://localhost:4000
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || '';

let socket: Socket | null = null;

// يقرأ التوكنات من localStorage عند كل (إعادة) اتصال — لإرسال هوية موثّقة للسيرفر
//
// ⚠️ يُرسَل المفتاحان منفصلين عمداً ولا يُطويان في حقل واحد:
//    `token` يكتبه دخول الأدمن ودخول اللاعب المرتبط بموظف، و`leader_token`
//    يكتبه دخول الليدر. طيّهما بـ«الأول أو الثاني» كان يجعل توكناً قديماً
//    في `token` يحجب توكن ليدر جديداً صالحاً، فيبقى الساكت غير مصادَق بعد
//    تسجيل دخول ناجح بلا أي رسالة خطأ. السيرفر يجرّب كل مرشّح حتى ينجح واحد
//    (backend/src/index.ts — io.use) فلا تهمّ الأولوية بعد اليوم.
function readAuth() {
  try {
    return {
      token: localStorage.getItem('token') || '',
      leaderToken: localStorage.getItem('leader_token') || '',
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
//
// ⚠️ نُعيد ضبط `auth` بصيغة الدالة لا بكائن جامد: الكائن يُجمّد لقطة التوكن
//    فتفقد كل إعادة اتصال لاحقة قدرتها على قراءة localStorage من جديد.
export function reconnectSocketAuth(): void {
  if (socket) {
    try { (socket.auth as any) = (cb: (data: Record<string, any>) => void) => cb(readAuth()); } catch {}
    socket.disconnect();
    socket.connect();
  }
}
