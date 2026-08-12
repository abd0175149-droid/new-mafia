// ══════════════════════════════════════════════════════
// 🎭 Unified Mafia Platform — Entry Point
// يجمع بين REST API (Club) + Socket.IO (Game Engine)
// ══════════════════════════════════════════════════════

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { env } from './config/env.js';
import { projectDisplayState } from './services/display-state.projection.js';
import { mintDisplayToken, pinAttemptKey, pinLockState, recordPinFailure, clearPinFailures, pinEquals } from './services/display-auth.service.js';
import { connectDB } from './config/db.js';
import { connectRedis } from './config/redis.js';
import { seedDatabase } from './utils/seed.js';
import jwt from 'jsonwebtoken';
import { verifyPlayerToken } from './middleware/player-auth.middleware.js';

// ── Routes (Club Admin) ─────────────────────────────
import authRoutes from './routes/auth.routes.js';
import activitiesRoutes from './routes/activities.routes.js';
import bookingsRoutes from './routes/bookings.routes.js';
import costsRoutes from './routes/costs.routes.js';
import foundationalRoutes from './routes/foundational.routes.js';
import expenseCategoriesRoutes from './routes/expense-categories.routes.js';
import staffRoutes from './routes/staff.routes.js';
import locationsRoutes from './routes/locations.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import leaderRoutes from './routes/leader.routes.js';
import driveRoutes from './routes/drive.routes.js';
import playerRoutes from './routes/player.routes.js';
import playerAuthRoutes from './routes/player-auth.routes.js';
import playerAppRoutes from './routes/player-app.routes.js';
import playerNotificationRoutes from './routes/player-notification.routes.js';
import staffNotificationRoutes from './routes/staff-notification.routes.js';
import playerFeedbackRoutes from './routes/player-feedback.routes.js';
import feedbackAnalyticsRoutes from './routes/feedback-analytics.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import soundsRoutes from './routes/sounds.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import printLayoutRoutes from './routes/print-layout.routes.js';
import gameConfigRoutes from './routes/game-config.routes.js';
import ticketsRoutes from './routes/tickets.routes.js';
import progressionSettingsRoutes from './routes/progression-settings.routes.js';
import anticheatRoutes from './routes/anticheat.routes.js';
import whatsappRoutes from './routes/whatsapp.routes.js';
import whatsappInboxRoutes from './routes/whatsapp-inbox.routes.js';
import seatingRoutes from './routes/seating.routes.js';
import seatTemplatesRoutes from './routes/seat-templates.routes.js';
import reservationsRoutes from './routes/reservations.routes.js';
import seasonsRoutes from './routes/seasons.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import staffActionLogRoutes from './routes/staff-action-log.routes.js';
import { venueRouter, playerFnbRouter } from './routes/fnb.routes.js';
import chipsRoutes from './routes/chips.routes.js';
import chipsStoreRoutes from './routes/chips-store.routes.js';
import appReleaseRoutes from './routes/app-release.routes.js';
import { registerVenueEvents } from './sockets/venue.socket.js';

// ── Socket Handlers (Game Engine) ───────────────────
import { registerLobbyEvents, seedDummyGame, rehydrateActiveRooms } from './sockets/lobby.socket.js';
import { registerAuditLogging } from './services/staff-action-log.service.js';
import { registerDayEvents } from './sockets/day.socket.js';
import { registerNightEvents } from './sockets/night.socket.js';
import { registerMafiaChatEvents } from './sockets/mafia-chat.socket.js';
import { registerGameEvents } from './sockets/game.socket.js';
import { registerVoiceEvents } from './sockets/voice.socket.js';
import { registerConfrontationEvents } from './sockets/confrontation.socket.js';
import { isMafiaRole } from './game/roles.js';

// ── Game API Routes ─────────────────────────────────
import { getFinishedMatches, getMatchDetails, getMatchesBySession } from './services/match.service.js';
import { getClosedSessions, getAllSessions } from './services/session.service.js';

const app = express();
const server = createServer(app);

// ── Socket.IO ───────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: env.FRONTEND_URL ? env.FRONTEND_URL.split(',') : '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 15000,   // 15 ثانية (كان 60) — اكتشاف أسرع للانقطاع
  pingInterval: 10000,  // 10 ثوانٍ (كان 25) — فحص حياة الاتصال أكثر تواتراً
});
(global as any).io = io;

// ── مصادقة السوكيت (إضافية — لا ترفض أي اتصال) ──────────
// تربط هوية موثّقة بالسوكيت من التوكن المرفق في handshake.auth:
//  • توكن موظف صالح (admin/manager/leader) → socket.data.role = 'leader' + authStaff
//  • توكن لاعب صالح → socket.data.authPlayer
// بهذا تعمل حُرّاس "role !== 'leader'" الموجودة أصلاً للموثّقين فقط، ويُمنع المجهول.
io.use((socket, next) => {
  try {
    const a: any = socket.handshake.auth || {};
    // ⚠️ نجرّب كل توكن موظف مرسَل حتى ينجح واحد — لا نكتفي بالأول.
    //    العميل يخزّن توكن الموظف في مفتاحين (`token` لدخول الأدمن/اللاعب
    //    المرتبط بموظف، و`leader_token` لدخول الليدر)، وقد يبقى أحدهما قديماً
    //    بعد تسجيل دخول ناجح بالآخر. الاكتفاء بالأول كان يترك الساكت غير
    //    مصادَق بصمت، فتفشل كل أوامر الليدر بينما الواجهة تبدو متصلة.
    const staffCandidates: string[] = [a.token, a.leaderToken]
      .filter((t: any) => typeof t === 'string' && t.length > 0);
    for (const staffTok of staffCandidates) {
      try {
        const dec: any = jwt.verify(staffTok, env.JWT_SECRET);
        if (dec && ['admin', 'manager', 'leader'].includes(dec.role)) {
          socket.data.authStaff = { id: dec.id, role: dec.role, username: dec.username };
          socket.data.role = 'leader';
          break;
        } else if (dec && dec.role === 'location_owner') {
          // 🏪 حساب مكان — هويّة فقط، بلا دور leader (لا يدير ألعاباً)
          socket.data.authVenue = { id: dec.id };
          break;
        }
      } catch { /* توكن موظف غير صالح — نجرّب التالي بلا رفض الاتصال */ }
    }
    const playerTok: string | undefined = a.playerToken;
    if (playerTok) {
      const p = verifyPlayerToken(playerTok);
      if (p) socket.data.authPlayer = { playerId: p.playerId, phone: p.phone, name: p.name };
    }
  } catch { /* تجاهل — لا نمنع الاتصال */ }
  next();
});

// ── Middleware ───────────────────────────────────────
app.use(cors({
  origin: env.FRONTEND_URL ? env.FRONTEND_URL.split(',') : '*',
  credentials: true,
}));
// ── رؤوس أمان أساسية (بلا تبعية؛ بلا CSP/CORP حتى لا تنكسر الصور و/uploads) ──
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  next();
});
app.use(express.json({
  limit: '10mb',
  // 💬 التقاط الجسم الخام — لازم للتحقق من توقيع webhook واتساب (X-Hub-Signature-256)
  verify: (req, _res, buf) => { (req as any).rawBody = buf; },
}));
app.use('/uploads', express.static('uploads'));

// ── Health Check ────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    platform: 'Unified Mafia Platform v2.0',
    timestamp: new Date().toISOString(),
  });
});

// ══════════════════════════════════════════════════════
// 🏢 Club Admin REST API Routes
// ══════════════════════════════════════════════════════
app.use('/api/auth', authRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/costs', costsRoutes);
app.use('/api/foundational', foundationalRoutes);
app.use('/api/expense-categories', expenseCategoriesRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/leader', leaderRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/player-auth', playerAuthRoutes);
app.use('/api/player-app', playerAppRoutes);
app.use('/api/player-notifications', playerNotificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/staff-notifications', staffNotificationRoutes);
app.use('/api/player-feedback', playerFeedbackRoutes);
app.use('/api/feedback', feedbackAnalyticsRoutes);
app.use('/api/sounds', soundsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/print-layouts', printLayoutRoutes);
app.use('/api/staff-action-log', staffActionLogRoutes);
app.use('/api/game-config', gameConfigRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/progression-settings', progressionSettingsRoutes);
app.use('/api/anticheat', anticheatRoutes);
app.use('/api/seasons', seasonsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/whatsapp', whatsappInboxRoutes);  // 💬 مركز المحادثات: webhook + send + inbox
app.use('/api/seating', seatingRoutes);
app.use('/api/seat-templates', seatTemplatesRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/venue', venueRouter);      // 🏪 كونسول حساب المكان (منيو/طلبات/فواتير)
app.use('/api/fnb', playerFnbRouter);    // 🍽️ طلبات المنيو — جهة اللاعب
app.use('/api/chips', chipsRoutes);      // 🪙 اقتصاد التشبس (محفظة + دفتر + شحن إداري)
app.use('/api/chips', chipsStoreRoutes); // 🏦 خزنة الدون (كتالوج + إيجار + تجهيز)
app.use('/api/app', appReleaseRoutes);   // 📱 بوابة إصدار التطبيق + ملفّا روابط المنصّتين

// ── VAPID Public Key لـ Web Push (iOS Safari) ──
// مصدر واحد ثابت (config/vapid.ts) — نفس المفتاح الذي يوقّع به السيرفر الإرسال
app.get('/api/push/vapid-public-key', async (_req, res) => {
  try {
    const { getVapidKeys } = await import('./config/vapid.js');
    const keys = await getVapidKeys();
    res.json({ publicKey: keys?.publicKey || '' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// 🎮 Game REST API Routes (History & Stats + Frontend Endpoints)
// ══════════════════════════════════════════════════════

// GET /api/leader/history — الألعاب المنتهية
app.get('/api/leader/history', async (_req, res) => {
  const matches = await getFinishedMatches(50);
  res.json(matches);
});

// GET /api/leader/match/:id — تفاصيل مباراة
app.get('/api/leader/match/:id', async (req, res) => {
  const match = await getMatchDetails(parseInt(req.params.id));
  if (!match) return res.status(404).json({ error: 'Match not found' });
  res.json(match);
});

// GET /api/leader/sessions — كل الغرف (نشطة + مغلقة) مع إحصائياتها
app.get('/api/leader/sessions', async (_req, res) => {
  const sessions = await getAllSessions();
  res.json(sessions);
});

// GET /api/leader/sessions/:id/matches — ألعاب غرفة محددة
app.get('/api/leader/sessions/:id/matches', async (req, res) => {
  const matches = await getMatchesBySession(parseInt(req.params.id));
  res.json(matches);
});

// DELETE /api/leader/sessions/:id — حذف غرفة نهائياً
app.delete('/api/leader/sessions/:id', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const { deleteSession } = await import('./services/session.service.js');
    const deleted = await deleteSession(sessionId);
    if (!deleted) return res.status(500).json({ error: 'فشل حذف الغرفة' });
    console.log(`🗑️ Game History: Deleted Session #${sessionId}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/leader/sessions/:id/close — إغلاق غرفة
app.patch('/api/leader/sessions/:id/close', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const { getDB } = await import('./config/db.js');
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    const { sessions } = await import('./schemas/game.schema.js');
    const { eq } = await import('drizzle-orm');

    const [sessionData] = await db.select({ sessionCode: sessions.sessionCode })
      .from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    const sessionCode = sessionData?.sessionCode;

    const { closeSession } = await import('./services/session.service.js');
    const closed = await closeSession(sessionId);
    if (!closed) return res.status(500).json({ error: 'فشل إغلاق الغرفة' });

    if (sessionCode) {
      try {
        const { getRoomByCode } = await import('./game/state.js');
        const { deleteGameState } = await import('./config/redis.js');
        const { activeRooms } = await import('./sockets/lobby.socket.js');
        
        const existingState = await getRoomByCode(sessionCode);
        if (existingState) {
           const io = req.app.get('io');
           if (io) {
             io.to(existingState.roomId).emit('game:kicked', { reason: 'تم إنهاء الفعالية وإغلاق الغرفة من قبل الإدارة.' });
           }

           await deleteGameState(existingState.roomId);
           await deleteGameState(`code:${sessionCode}`);
           activeRooms.delete(existingState.roomId);
           console.log(`🧹 Cleared Session #${sessionId} (${sessionCode}) from Redis and activeRooms after close`);
        }
      } catch (e: any) {
        console.warn('⚠️ Could not clear Redis room on close:', e.message);
      }
    }

    console.log(`🔒 Game History: Closed Session #${sessionId}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Game frontend endpoints (used by leader page) ──

// GET /api/game/leader-rooms — الغرف النشطة
import { activeRooms } from './sockets/lobby.socket.js';
import { getRoom } from './game/state.js';

app.get('/api/game/leader-rooms', (_req, res) => {
  const rooms = Array.from(activeRooms.values());
  res.json({ success: true, rooms });
});

// GET /api/game/active — الألعاب النشطة (لشاشة العرض)
app.get('/api/game/active', (_req, res) => {
  const rooms = Array.from(activeRooms.values()).map(r => ({
    roomId: r.roomId,
    roomCode: r.roomCode,
    gameName: r.gameName,
    playerCount: r.playerCount,
    maxPlayers: r.maxPlayers,
    activityId: r.activityId || null,
    activityName: r.activityName || null,
  }));
  res.json({ success: true, rooms });
});

// GET /api/game/activities-with-rooms — الأنشطة مع غرفها (لشاشة العرض)
app.get('/api/game/activities-with-rooms', async (_req, res) => {
  try {
    const rooms = Array.from(activeRooms.values());

    // تجميع الغرف حسب النشاط
    const activitiesMap = new Map<string, { activityId: number | null; activityName: string; rooms: any[] }>();

    for (const r of rooms) {
      const key = r.activityId ? String(r.activityId) : 'unlinked';
      if (!activitiesMap.has(key)) {
        activitiesMap.set(key, {
          activityId: r.activityId || null,
          activityName: r.activityName || (r.activityId ? 'نشاط #' + r.activityId : 'بدون نشاط'),
          rooms: [],
        });
      }
      activitiesMap.get(key)!.rooms.push({
        roomId: r.roomId,
        roomCode: r.roomCode,
        gameName: r.gameName,
        playerCount: r.playerCount,
        maxPlayers: r.maxPlayers,
      });
    }

    // جلب أسماء الأنشطة من DB (دائماً — لضمان دقة الاسم)
    const { getDB } = await import('./config/db.js');
    const db = getDB();
    if (db) {
      const { inArray } = await import('drizzle-orm');
      const { activities } = await import('./schemas/admin.schema.js');

      // جمع كل الـ activityIds
      const activityIds = Array.from(activitiesMap.values())
        .filter(g => g.activityId)
        .map(g => g.activityId!);

      if (activityIds.length > 0) {
        try {
          const acts = await db.select({ id: activities.id, name: activities.name })
            .from(activities)
            .where(inArray(activities.id, activityIds));

          for (const act of acts) {
            for (const [, group] of activitiesMap) {
              if (group.activityId === act.id) {
                group.activityName = act.name;
              }
            }
          }
        } catch (err: any) {
          console.warn('⚠️ Failed to fetch activity names:', err.message);
        }
      }
    }

    res.json({ success: true, activities: Array.from(activitiesMap.values()) });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

// POST /api/game/verify-pin — التحقق من PIN شاشة العرض
app.post('/api/game/verify-pin', async (req, res) => {
  try {
    const { roomId, pin } = req.body;
    if (!roomId || !pin) {
      return res.json({ success: false, error: 'roomId and pin are required' });
    }

    // 🔒 قفل التخمين: الرمز ٤–٦ أرقام، والمسار غير مصادَق، وردّه عند النجاح
    //    يحمل أدوار كل اللاعبين — فمسح فضاء المفاتيح كان ممكناً في ثوانٍ.
    const attemptKey = pinAttemptKey(req, String(roomId));
    const lock = pinLockState(attemptKey);
    if (lock.locked) {
      res.setHeader('Retry-After', String(lock.retryAfterSec));
      return res.status(429).json({ success: false, error: `محاولات كثيرة — أعد المحاولة بعد ${Math.ceil(lock.retryAfterSec / 60)} دقيقة` });
    }

    const room = activeRooms.get(roomId);
    if (!room) {
      return res.json({ success: false, error: 'اللعبة غير موجودة' });
    }

    if (!pinEquals(String(room.displayPin ?? ''), String(pin ?? ''))) {
      const after = recordPinFailure(attemptKey);
      if (after.locked) res.setHeader('Retry-After', String(after.retryAfterSec));
      return res.status(after.locked ? 429 : 401).json({
        success: false,
        error: after.locked ? 'محاولات كثيرة — الرمز مقفل مؤقتاً' : 'الرقم السري غير صحيح',
      });
    }
    clearPinFailures(attemptKey);

    // جلب حالة الغرفة الكاملة
    const state = await getRoom(roomId);

    res.json({
      success: true,
      // 📺 توكن الشاشة — يُشترط لاحقاً في `display:join-room`.
      //    بلا هذا كان أي ساكت ينضم للغرفة ويقرأ أدوار الجميع.
      displayToken: mintDisplayToken(String(roomId)),
      gameName: room.gameName,
      roomCode: room.roomCode,
      playerCount: room.playerCount,
      maxPlayers: room.maxPlayers,
      state: projectDisplayState(state),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/game/verify-pin-by-code — التحقق عبر sessionCode (من صفحة النشاط)
app.post('/api/game/verify-pin-by-code', async (req, res) => {
  try {
    const { sessionCode, pin } = req.body;
    if (!sessionCode || !pin) {
      return res.json({ success: false, error: 'sessionCode and pin are required' });
    }

    // البحث عن الغرفة النشطة: أولاً بـ roomCode، ثم بقراءة state.sessionCode من Redis
    let room = Array.from(activeRooms.values()).find(r => r.roomCode === sessionCode);
    if (!room) {
      // sessionCode من DB مختلف عن roomCode — نبحث في Redis
      const { getAllGameStates } = await import('./config/redis.js');
      const allStates = await getAllGameStates();
      const matchingState = allStates.find((s: any) => s.sessionCode === sessionCode || s.roomCode === sessionCode);
      if (matchingState) {
        room = activeRooms.get(matchingState.roomId) || undefined;
      }
    }
    if (!room) {
      return res.json({ success: false, error: 'الغرفة غير نشطة — تأكد أن القائد دخلها' });
    }

    // 🔒 نفس قفل التخمين — هذا المسار يُعيد الأدوار أيضاً، فتأمين أحدهما وحده لا يكفي
    const attemptKey2 = pinAttemptKey(req, String(room.roomId));
    const lock2 = pinLockState(attemptKey2);
    if (lock2.locked) {
      res.setHeader('Retry-After', String(lock2.retryAfterSec));
      return res.status(429).json({ success: false, error: `محاولات كثيرة — أعد المحاولة بعد ${Math.ceil(lock2.retryAfterSec / 60)} دقيقة` });
    }

    if (!pinEquals(String(room.displayPin ?? ''), String(pin ?? ''))) {
      const after = recordPinFailure(attemptKey2);
      if (after.locked) res.setHeader('Retry-After', String(after.retryAfterSec));
      return res.status(after.locked ? 429 : 401).json({
        success: false,
        error: after.locked ? 'محاولات كثيرة — الرمز مقفل مؤقتاً' : 'الرقم السري غير صحيح',
      });
    }
    clearPinFailures(attemptKey2);

    const state = await getRoom(room.roomId);
    res.json({
      success: true,
      roomId: room.roomId,
      displayToken: mintDisplayToken(String(room.roomId)),
      gameName: room.gameName,
      roomCode: room.roomCode,
      playerCount: room.playerCount,
      maxPlayers: room.maxPlayers,
      state: projectDisplayState(state),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/game/closed-sessions — الغرف المنتهية
app.get('/api/game/closed-sessions', async (_req, res) => {
  const sessions = await getClosedSessions();
  res.json({ success: true, sessions });
});

// GET /api/game/history/:id — تفاصيل لعبة
app.get('/api/game/history/:id', async (req, res) => {
  const match = await getMatchDetails(parseInt(req.params.id));
  res.json({ success: true, match });
});

// GET /api/game/session-history/:id — ألعاب غرفة
app.get('/api/game/session-history/:id', async (req, res) => {
  const matches = await getMatchesBySession(parseInt(req.params.id));
  res.json({ success: true, matches });
});

// ══════════════════════════════════════════════════════
// 🔌 Socket.IO Connection Handler
// ══════════════════════════════════════════════════════
// حفظ io كـ app setting ليتم الوصول إليه من الـ routes
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // 💬 غرفة مركز محادثات واتساب — أدمن فقط (قرار المالك):
  // ينضم تلقائياً فيستقبل wa:message:new / wa:status:update لحظياً
  if (socket.data?.authStaff?.role === 'admin') {
    socket.join('wa:inbox');
  }

  // 🪙 غرفة اللاعب الخاصة — قناة لحظية شخصية (الرصيد/المشتريات/الإشعارات).
  // تُشتق من توكن اللاعب الموثّق في io.use أعلاه، فلا يمكن لأحد الانضمام لغرفة غيره.
  const authPlayerId = socket.data?.authPlayer?.playerId;
  if (authPlayerId) {
    socket.join(`player:${authPlayerId}`);
  }

  // 🔒 حصر اللاعب-المُضيف بغرفته فقط: أي حدثٍ يحمل roomId مختلفاً عن غرفة استضافته يُرفض.
  // المُضيف يُمنح role='leader' مسوّرة بـ hostRoomId، فهذا يمنع استغلاله للتحكّم بغرفٍ أخرى.
  // لا يمسّ الموظّفين/اللاعبين/الشاشة (يعمل فقط عند socket.data.isPlayerHost).
  socket.use((packet, next) => {
    try {
      if (socket.data?.isPlayerHost && socket.data?.hostRoomId) {
        const arg: any = packet[1];
        if (arg && typeof arg === 'object' && typeof arg.roomId === 'string' && arg.roomId !== socket.data.hostRoomId) {
          return next(new Error('forbidden: host is scoped to its own room'));
        }
      }
    } catch { /* لا نمنع في حال خطأ غير متوقّع */ }
    next();
  });

  // 📋 مُلتقِط سجل عمليات الموظفين — يوثّق كل تدخّل يدوي للّيدر تلقائياً (قبل تسجيل الأحداث)
  registerAuditLogging(socket);

  // تسجيل كل مجموعات الأحداث
  registerLobbyEvents(io, socket);
  registerDayEvents(io, socket);
  registerNightEvents(io, socket);
  registerGameEvents(io, socket);
  registerMafiaChatEvents(io, socket);
  registerVoiceEvents(io, socket);
  registerConfrontationEvents(io, socket);
  registerVenueEvents(io, socket);  // 🏪 انضمام حسابات الأماكن لغرف location:{id}
});

// ══════════════════════════════════════════════════════
// 🚀 Server Start
// ══════════════════════════════════════════════════════
async function main() {
  // ── الاتصال بالخدمات ──
  console.log('🔄 Connecting to Redis...');
  await connectRedis();

  console.log('🔄 Connecting to PostgreSQL...');
  await connectDB();

  // ── بذر البيانات ──
  await seedDatabase();

  // ── 🏆 تحميل إعدادات التقدّم على معاملات الحساب في الذاكرة ──
  // بدونها تُخدَم عتبات البروفايل (rrRequired/nextLevelXP) بالقيم الافتراضية المدمجة في الكود
  // بعد كل إعادة تشغيل، حتى تنتهي أول مباراة في العملية. (تُحدَّث أيضاً عند حفظ الإعدادات.)
  try {
    const { getProgressionConfig } = await import('./routes/progression-settings.routes.js');
    const { applyProgressionConfig } = await import('./services/progression.service.js');
    applyProgressionConfig(await getProgressionConfig());
    console.log('✅ Progression config loaded into runtime parameters');
  } catch (err: any) {
    console.warn('⚠️ Progression config boot load failed (defaults in effect):', err.message);
  }

  // ── إعادة بناء الغرف النشطة من Redis ──
  await rehydrateActiveRooms();

  // ── هجرة اللاعبين القدامى (تعيين كلمة سر افتراضية) ──
  try {
    const { migratePlayersWithDefaultPassword } = await import('./services/player.service.js');
    await migratePlayersWithDefaultPassword();
  } catch (err: any) {
    console.error('⚠️ Player migration skipped:', err.message);
  }

  // ── إضافة عمود welcome_bonus_applied (إن لم يكن موجوداً) ──
  try {
    const { getDB } = await import('./config/db.js');
    const { sql } = await import('drizzle-orm');
    const db = getDB();
    if (db) {
      await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS welcome_bonus_applied BOOLEAN DEFAULT false`);
      console.log('✅ welcome_bonus_applied column ensured');
    }
  } catch (err: any) {
    console.warn('⚠️ welcome_bonus_applied migration:', err.message);
  }

  // ── إضافة أعمدة اللعب عن بُعد على sessions (إن لم تكن موجودة) — إضافيّ لا يمسّ غرف القاعة ──
  try {
    const { getDB } = await import('./config/db.js');
    const { sql } = await import('drizzle-orm');
    const db = getDB();
    if (db) {
      await db.execute(sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_remote BOOLEAN DEFAULT false`);
      await db.execute(sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS host_player_id INTEGER`);
      console.log('✅ sessions remote-play columns ensured');
    }
  } catch (err: any) {
    console.warn('⚠️ sessions remote-play columns migration:', err.message);
  }

  // ── إضافة أعمدة صلاحيّات اللعب عن بُعد على players (إن لم تكن موجودة) — بوّابتا الاستضافة والانضمام ──
  try {
    const { getDB } = await import('./config/db.js');
    const { sql } = await import('drizzle-orm');
    const db = getDB();
    if (db) {
      await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS can_host_remote BOOLEAN DEFAULT false`);
      await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS remote_access_until TIMESTAMP`);
      await db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS player_id INTEGER`);
      // 🎁 مكافآت RR اليدويّة (حجز مبكر وغيرها) — تدخل في إعادة الاحتساب فلا تُمحى
      await db.execute(sql`CREATE TABLE IF NOT EXISTS rank_bonuses (
        id SERIAL PRIMARY KEY,
        player_id INTEGER NOT NULL,
        rr INTEGER NOT NULL,
        reason VARCHAR(200) DEFAULT '',
        season_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS analytics_cache (key VARCHAR(40) PRIMARY KEY, payload JSONB NOT NULL, refreshed_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS analytics_config (key VARCHAR(40) PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
      // ── 🍽️ نظام طلبات المنيو والفواتير (F&B) ──
      await db.execute(sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS menu_ordering_enabled BOOLEAN DEFAULT false`);
      await db.execute(sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS add_game_fee_to_bill BOOLEAN DEFAULT false`);
      await db.execute(sql`DO $$ BEGIN CREATE TYPE order_status AS ENUM ('new','preparing','delivered','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS menu_items (
        id SERIAL PRIMARY KEY, location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
        category VARCHAR(50) DEFAULT '', name VARCHAR(150) NOT NULL, description TEXT DEFAULT '',
        price DECIMAL(10,2) NOT NULL, club_share DECIMAL(10,2) DEFAULT 0, image_url TEXT,
        is_available BOOLEAN DEFAULT true, sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL, deleted_at TIMESTAMP)`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY, activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        location_id INTEGER NOT NULL REFERENCES locations(id), player_id INTEGER NOT NULL REFERENCES players(id),
        player_name VARCHAR(100) NOT NULL, booking_id INTEGER NOT NULL, session_id INTEGER, physical_id INTEGER,
        status order_status DEFAULT 'new' NOT NULL, total DECIMAL(10,2) NOT NULL, note TEXT DEFAULT '',
        status_changed_by INTEGER, status_changed_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
        name_snapshot VARCHAR(150) NOT NULL, unit_price_snapshot DECIMAL(10,2) NOT NULL,
        club_share_snapshot DECIMAL(10,2) DEFAULT 0, quantity INTEGER DEFAULT 1 NOT NULL)`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS order_invoices (
        id SERIAL PRIMARY KEY, invoice_no INTEGER NOT NULL, location_id INTEGER NOT NULL,
        activity_id INTEGER NOT NULL, player_id INTEGER NOT NULL, booking_id INTEGER,
        orders_total DECIMAL(10,2) DEFAULT 0, game_fee_applied BOOLEAN DEFAULT false,
        game_fee_amount DECIMAL(10,2) DEFAULT 0, grand_total DECIMAL(10,2) DEFAULT 0,
        printed_by INTEGER, printed_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
      await db.execute(sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_order'`);
      // ── 🎯 توحيد الكتالوج (2026-08-06): الباقات داخل المنيو + تحصيل الفاتورة ──
      await db.execute(sql`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_bundle BOOLEAN DEFAULT false NOT NULL`);
      await db.execute(sql`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS bundle_items JSONB DEFAULT '[]'::jsonb`);
      await db.execute(sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS components_snapshot JSONB DEFAULT '[]'::jsonb`);
      await db.execute(sql`ALTER TABLE order_invoices ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false NOT NULL`);
      await db.execute(sql`ALTER TABLE order_invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP`);
      await db.execute(sql`ALTER TABLE order_invoices ADD COLUMN IF NOT EXISTS paid_by INTEGER`);
      // ── 🗂️ أقسام المنيو بمستويين + ⚙️ مجموعات الخيارات (2026-08-06) ──
      await db.execute(sql`CREATE TABLE IF NOT EXISTS menu_categories (
        id SERIAL PRIMARY KEY, location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
        parent_id INTEGER, name VARCHAR(60) NOT NULL, sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL, deleted_at TIMESTAMP)`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS menu_option_groups (
        id SERIAL PRIMARY KEY, location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
        name VARCHAR(80) NOT NULL, selection_type VARCHAR(10) DEFAULT 'single' NOT NULL,
        is_required BOOLEAN DEFAULT false NOT NULL, max_select INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL, deleted_at TIMESTAMP)`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS menu_option_values (
        id SERIAL PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES menu_option_groups(id) ON DELETE CASCADE,
        name VARCHAR(80) NOT NULL, price_delta DECIMAL(10,2) DEFAULT 0 NOT NULL,
        is_available BOOLEAN DEFAULT true NOT NULL, sort_order INTEGER DEFAULT 0, deleted_at TIMESTAMP)`);
      await db.execute(sql`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS category_id INTEGER`);
      await db.execute(sql`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS option_group_ids JSONB DEFAULT '[]'::jsonb`);
      await db.execute(sql`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS custom_options JSONB DEFAULT '[]'::jsonb`);
      await db.execute(sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS options_snapshot JSONB DEFAULT '[]'::jsonb`);
      await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS region VARCHAR(80) DEFAULT ''`);
      // 🧪 استعارة منيو لمواقع الاختبار (2026-08-09)
      await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS menu_source_location_id INTEGER`);
      // 💳 الحدّ الأدنى للاستهلاك (2026-08-10) — تفعيلٌ ومبلغٌ لكلّ مكان، وتكملته تتجمّد في لقطة الفاتورة
      await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS min_charge_enabled BOOLEAN DEFAULT FALSE`);
      await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS minimum_charge DECIMAL(10,2) DEFAULT 2.00`);
      await db.execute(sql`ALTER TABLE order_invoices ADD COLUMN IF NOT EXISTS min_topup DECIMAL(10,2) DEFAULT 0`);
      // 💧 الماء التلقائيّ على الفواتير (2026-08-11)
      await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS auto_water BOOLEAN DEFAULT FALSE`);
      await db.execute(sql`ALTER TABLE order_invoices ADD COLUMN IF NOT EXISTS water_charge DECIMAL(10,2) DEFAULT 0`);
      // 🕵️ إشارات مكافحة الغش (2026-08-12) — سلوكٌ مشبوه من جهاز اللاعب أثناء المباراة
      await db.execute(sql`CREATE TABLE IF NOT EXISTS cheat_signals (
        id SERIAL PRIMARY KEY,
        match_id INTEGER,
        room_id VARCHAR(50),
        activity_id INTEGER,
        player_id INTEGER,
        physical_id INTEGER,
        player_name VARCHAR(255),
        role VARCHAR(50),
        team VARCHAR(20),
        kind VARCHAR(40) NOT NULL,
        weight INTEGER NOT NULL DEFAULT 1,
        details JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cheat_signals_player ON cheat_signals(player_id, created_at)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cheat_signals_match ON cheat_signals(match_id)`);
      // 🕵️ حالات مراجعة الأدمن لدرجات الاشتباه (2026-08-12)
      await db.execute(sql`CREATE TABLE IF NOT EXISTS cheat_reviews (
        player_id INTEGER PRIMARY KEY,
        status VARCHAR(20) NOT NULL,
        note VARCHAR(500) DEFAULT '',
        reviewed_by INTEGER,
        reviewed_at TIMESTAMP DEFAULT NOW()
      )`);
      await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP`);
      await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0 NOT NULL`);
      // ── 💨 طلبات خدمة الأرجيلة (2026-08-08) — فحمٌ أو تزبيط، بلا سعرٍ ولا فاتورة ──
      await db.execute(sql`CREATE TABLE IF NOT EXISTS service_requests (
        id SERIAL PRIMARY KEY,
        activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        location_id INTEGER NOT NULL REFERENCES locations(id),
        player_id INTEGER NOT NULL REFERENCES players(id),
        player_name VARCHAR(100) NOT NULL,
        kind VARCHAR(20) NOT NULL, note TEXT DEFAULT '',
        physical_id INTEGER, status VARCHAR(12) DEFAULT 'open' NOT NULL,
        resolved_by INTEGER, resolved_at TIMESTAMP,
        reminder_sent_at TIMESTAMP, reminder_count INTEGER DEFAULT 0 NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
      // فهرسٌ للاستعلام الساخن: المفتوح لكلّ فعاليّة (شاشة المكان + الماسح كلّ دقيقة)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_service_requests_open
        ON service_requests (activity_id, status)`);
      // 🔁 مفتاح تكرار الطلب (2026-08-10) — فريدٌ لكلّ (فعاليّة، لاعب) حين يوجد
      await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_key VARCHAR(40)`);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_client_key
        ON orders (activity_id, player_id, client_key) WHERE client_key IS NOT NULL`);
      // ترحيل لمرّة واحدة: كل قيمة category نصّيّة قائمة تصير قسماً رئيساً ويُربط بها أصنافها
      await db.execute(sql`
        INSERT INTO menu_categories (location_id, name, sort_order)
        SELECT DISTINCT m.location_id, TRIM(m.category), 0 FROM menu_items m
        WHERE m.deleted_at IS NULL AND COALESCE(TRIM(m.category), '') <> ''
          AND NOT EXISTS (SELECT 1 FROM menu_categories c
                          WHERE c.location_id = m.location_id AND c.name = TRIM(m.category) AND c.deleted_at IS NULL)`);
      await db.execute(sql`
        UPDATE menu_items m SET category_id = c.id FROM menu_categories c
        WHERE m.category_id IS NULL AND c.location_id = m.location_id
          AND c.name = TRIM(m.category) AND c.deleted_at IS NULL`);
      // 📱 وسم «تأكّد من التطبيق» على حجوزات المتابعة (+ تعبئة رجعيّة لما أنشأه التطبيق سابقاً)
      await db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS app_confirmed BOOLEAN DEFAULT false`);
      await db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS app_confirmed_at TIMESTAMP`);
      await db.execute(sql`UPDATE reservations SET app_confirmed = true, app_confirmed_at = COALESCE(app_confirmed_at, created_at) WHERE created_by = 'player-app' AND app_confirmed = false`);
      // 🎩 دور العمدة في المحرّك الديناميكيّ — إدراج آمن لا يمسّ أدوار الإنتاج المعدَّلة يدويّاً
      await db.execute(sql`
        INSERT INTO role_definitions (id, name_ar, name_en, team, abilities, gen_priority, gen_max_count, gen_min_players, gen_is_required, card_template_id, description, card_overrides)
        VALUES ('MAYOR', 'العمدة', 'Mayor', 'CITIZEN', '[]'::jsonb, 6, 1, 9, false, 'mayor_card',
                'مرّة واحدة بعد فرز التصويت: يكشف نفسه ويلغي الإعدام — تصويت جديد على الجميع أو تأجيل بلا موت. بعد الكشف صوته ×2',
                '{"icon":{"type":"EMOJI","value":"🎩"}}'::jsonb)
        ON CONFLICT (id) DO NOTHING`);
      // 🎩 قالب بطاقة العمدة الذهبيّ + ربط الدور به (مرّة واحدة — تعديلات المالك اللاحقة تُحترم)
      await db.execute(sql`
        INSERT INTO card_templates (id, gradient, border_color, text_color, glow_effect, team_badge, icon, secret_face, elements)
        VALUES ('mayor_card', 'from-amber-700 via-yellow-900 to-stone-950', '#eab308', '#fde68a', '0 0 30px rgba(234,179,8,0.35)',
                '{"text":"مواطنون","bgColor":"#064e3b","textColor":"#a7f3d0","borderColor":"#10b981"}'::jsonb,
                '{"type":"EMOJI","value":"🎩"}'::jsonb, '{"type":"GENERATED"}'::jsonb,
                '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":false}'::jsonb)
        ON CONFLICT (id) DO NOTHING`);
      await db.execute(sql`
        UPDATE role_definitions SET card_template_id = 'mayor_card', card_overrides = '{"icon":{"type":"EMOJI","value":"🎩"}}'::jsonb
        WHERE id = 'MAYOR' AND card_template_id = 'master'`);
      console.log('✅ players remote-access + reservations.player_id + analytics + fnb tables + MAYOR role ensured');
    }
  } catch (err: any) {
    console.warn('⚠️ players remote-access columns migration:', err.message);
  }

  // ── إنشاء جداول الإشعارات (إن لم تكن موجودة) ──
  try {
    const { getDB } = await import('./config/db.js');
    const { sql } = await import('drizzle-orm');
    const db = getDB();
    if (db) {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS player_fcm_tokens (
          id SERIAL PRIMARY KEY,
          player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          fcm_token TEXT NOT NULL,
          device_info VARCHAR(200) DEFAULT '',
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS staff_fcm_tokens (
          id SERIAL PRIMARY KEY,
          staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
          fcm_token TEXT NOT NULL,
          device_info VARCHAR(200) DEFAULT '',
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS player_notifications (
          id SERIAL PRIMARY KEY,
          player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
          title VARCHAR(200) NOT NULL,
          body TEXT DEFAULT '',
          type VARCHAR(30) NOT NULL,
          data JSONB DEFAULT '{}',
          is_read BOOLEAN DEFAULT false,
          is_push_sent BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ Notification tables ensured');
    }
  } catch (err: any) {
    console.warn('⚠️ Notification tables migration:', err.message);
  }

  // ── إنشاء جدول المؤثرات الصوتية ──
  try {
    const { getDB } = await import('./config/db.js');
    const { sql } = await import('drizzle-orm');
    const db = getDB();
    if (db) {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS sound_effects (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          filename VARCHAR(255) NOT NULL,
          original_name VARCHAR(255) NOT NULL,
          mime_type VARCHAR(50) NOT NULL,
          size_bytes INTEGER DEFAULT 0,
          event_keys JSONB DEFAULT '[]',
          is_active BOOLEAN DEFAULT true,
          uploaded_by VARCHAR(100) DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ Sound effects table ensured');
    }
  } catch (err: any) {
    console.warn('⚠️ Sound effects table migration:', err.message);
  }

  // ── إنشاء جداول نظام Data-Driven (Game Config) ──
  try {
    const { getDB } = await import('./config/db.js');
    const { sql } = await import('drizzle-orm');
    const db = getDB();
    if (db) {
      // Enums
      await db.execute(sql`DO $$ BEGIN CREATE TYPE ability_phase AS ENUM ('NIGHT','DAY','BOTH'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
      await db.execute(sql`DO $$ BEGIN CREATE TYPE target_type AS ENUM ('ENEMY','ALLY','ANY','SELF','NONE'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
      await db.execute(sql`DO $$ BEGIN CREATE TYPE effect_type AS ENUM ('ELIMINATE','BLOCK_ELIMINATE','REVEAL_TEAM','SILENCE','CONDITIONAL_ELIMINATE','PASSIVE'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
      await db.execute(sql`DO $$ BEGIN CREATE TYPE team_type AS ENUM ('MAFIA','CITIZEN','NEUTRAL'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
      await db.execute(sql`DO $$ BEGIN CREATE TYPE interaction_condition AS ENUM ('SAME_TARGET','ALWAYS','SPECIFIC_TARGET'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
      await db.execute(sql`DO $$ BEGIN CREATE TYPE interaction_resolution AS ENUM ('B_CANCELS_A','A_CANCELS_B','BOTH_CANCEL'); EXCEPTION WHEN duplicate_object THEN null; END $$`);

      // Tables
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS ability_definitions (
          id VARCHAR(50) PRIMARY KEY,
          name_ar VARCHAR(100) NOT NULL,
          name_en VARCHAR(100) NOT NULL,
          phase ability_phase NOT NULL,
          priority INTEGER NOT NULL,
          target_type target_type NOT NULL,
          exclude_self BOOLEAN DEFAULT true,
          exclude_last_target BOOLEAN DEFAULT false,
          max_targets INTEGER DEFAULT 1,
          effect_type effect_type NOT NULL,
          effect_on_success VARCHAR(100),
          effect_on_fail VARCHAR(100),
          can_skip BOOLEAN DEFAULT false,
          is_inheritable BOOLEAN DEFAULT false,
          inheritance_order JSONB,
          deception_rule VARCHAR(200),
          sound_event VARCHAR(100),
          animation_type VARCHAR(100),
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS card_templates (
          id VARCHAR(50) PRIMARY KEY,
          gradient VARCHAR(200) NOT NULL,
          border_color VARCHAR(100) NOT NULL,
          text_color VARCHAR(100) NOT NULL,
          glow_effect VARCHAR(200),
          team_badge JSONB NOT NULL,
          icon JSONB NOT NULL,
          secret_face JSONB,
          elements JSONB,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS role_definitions (
          id VARCHAR(50) PRIMARY KEY,
          name_ar VARCHAR(100) NOT NULL,
          name_en VARCHAR(100) NOT NULL,
          team team_type NOT NULL,
          abilities JSONB NOT NULL,
          gen_priority INTEGER NOT NULL,
          gen_max_count INTEGER DEFAULT 1,
          gen_min_players INTEGER DEFAULT 6,
          gen_is_required BOOLEAN DEFAULT false,
          win_condition_type VARCHAR(50),
          win_condition_description VARCHAR(255),
          win_condition_reveal_target BOOLEAN DEFAULT false,
          card_template_id VARCHAR(50),
          card_overrides JSONB,
          description TEXT,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS interaction_rules (
          id SERIAL PRIMARY KEY,
          ability_a VARCHAR(50) NOT NULL,
          ability_b VARCHAR(50) NOT NULL,
          condition interaction_condition NOT NULL,
          resolution interaction_resolution NOT NULL,
          result_event VARCHAR(100) NOT NULL,
          priority INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      console.log('✅ Data-Driven game config tables ensured');
    }
  } catch (err: any) {
    console.warn('⚠️ Data-Driven tables migration:', err.message);
  }

  // ── إنشاء جداول WhatsApp (سجلات الإرسال + القوالب) ──
  try {
    const { getDB } = await import('./config/db.js');
    const { sql } = await import('drizzle-orm');
    const db = getDB();
    if (db) {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS whatsapp_send_logs (
          id SERIAL PRIMARY KEY,
          activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
          message_template TEXT NOT NULL,
          total_sent INTEGER DEFAULT 0,
          total_failed INTEGER DEFAULT 0,
          recipients JSONB NOT NULL DEFAULT '[]',
          sent_by VARCHAR(100) DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS whatsapp_templates (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          category VARCHAR(50) DEFAULT 'general',
          template TEXT NOT NULL,
          variables JSONB DEFAULT '[]',
          created_by VARCHAR(100) DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      console.log('✅ WhatsApp tables ensured');
    }
  } catch (err: any) {
    console.warn('⚠️ WhatsApp tables migration:', err.message);
  }

  // ── إنشاء جدول سجل رسائل تغيير الرتبة ──
  try {
    const { getDB } = await import('./config/db.js');
    const { sql } = await import('drizzle-orm');
    const db = getDB();
    if (db) {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS whatsapp_rank_notifications (
          id SERIAL PRIMARY KEY,
          player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          rank_tier VARCHAR(20) NOT NULL,
          notification_type VARCHAR(20) DEFAULT 'promotion',
          sent_at TIMESTAMP DEFAULT NOW() NOT NULL,
          UNIQUE(player_id, rank_tier)
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_rank_notif_player
        ON whatsapp_rank_notifications(player_id)
      `);
      console.log('✅ WhatsApp rank notifications table ensured');
    }
  } catch (err: any) {
    console.warn('⚠️ WhatsApp rank notifications migration:', err.message);
  }

  // ── 💬 جداول مركز محادثات واتساب (وارد + صادر + بوت) ──
  try {
    const { getDB } = await import('./config/db.js');
    const { sql } = await import('drizzle-orm');
    const db = getDB();
    if (db) {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS wa_conversations (
          id SERIAL PRIMARY KEY,
          phone VARCHAR(20) NOT NULL UNIQUE,
          wa_phone VARCHAR(20) NOT NULL,
          player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
          display_name VARCHAR(150) DEFAULT '',
          bot_enabled BOOLEAN DEFAULT TRUE NOT NULL,
          bot_paused_until TIMESTAMP,
          last_inbound_at TIMESTAMP,
          last_message_at TIMESTAMP,
          last_message_preview TEXT DEFAULT '',
          unread_count INTEGER DEFAULT 0 NOT NULL,
          status VARCHAR(20) DEFAULT 'open' NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS wa_messages (
          id SERIAL PRIMARY KEY,
          conversation_id INTEGER NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
          wamid VARCHAR(255) UNIQUE,
          direction VARCHAR(3) NOT NULL,
          source VARCHAR(16) NOT NULL,
          msg_type VARCHAR(20) DEFAULT 'text' NOT NULL,
          body TEXT DEFAULT '',
          payload JSONB DEFAULT '{}',
          status VARCHAR(16) DEFAULT '',
          error_message TEXT DEFAULT '',
          staff_id INTEGER,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS wa_customer_notes (
          id SERIAL PRIMARY KEY,
          phone VARCHAR(20) NOT NULL,
          player_id INTEGER,
          note TEXT NOT NULL,
          source VARCHAR(16) DEFAULT 'bot' NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS wa_optouts (
          id SERIAL PRIMARY KEY,
          phone VARCHAR(20) NOT NULL UNIQUE,
          reason VARCHAR(200) DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wa_messages_conv ON wa_messages(conversation_id, id DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wa_messages_wamid ON wa_messages(wamid)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wa_conv_last_msg ON wa_conversations(last_message_at DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wa_notes_phone ON wa_customer_notes(phone)`);
      // 🤖 البوت الذكي: عمود «بحاجة تدخل» + جدول الإعدادات (صف واحد)
      await db.execute(sql`ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS needs_attention BOOLEAN DEFAULT FALSE NOT NULL`);
      // 🎯 مصدر الحملة على المحادثة — يعرف البوت أن العميل وصل من رسالة تسويقية
      await db.execute(sql`ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS campaign_id INTEGER`);
      await db.execute(sql`ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS campaign_at TIMESTAMP`);
      // 💬 تفعيل/تعطيل الأماكن لإجابات البوت
      await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS wa_bot_settings (
          id SERIAL PRIMARY KEY,
          enabled BOOLEAN DEFAULT FALSE NOT NULL,
          gemini_api_key TEXT DEFAULT '',
          model VARCHAR(60) DEFAULT 'gemini-2.5-flash' NOT NULL,
          system_prompt TEXT DEFAULT '' NOT NULL,
          knowledge_base TEXT DEFAULT '' NOT NULL,
          context_messages INTEGER DEFAULT 20 NOT NULL,
          pause_minutes INTEGER DEFAULT 30 NOT NULL,
          max_tool_loops INTEGER DEFAULT 4 NOT NULL,
          fail_message TEXT DEFAULT '' NOT NULL,
          fail_handoff BOOLEAN DEFAULT TRUE NOT NULL,
          tools_config JSONB DEFAULT '{}',
          updated_by VARCHAR(100) DEFAULT '',
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      // 🗑️ حذف ناعم للرسائل + 📢 البث الجماعي وقوالبه المحلية
      await db.execute(sql`ALTER TABLE wa_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
      await db.execute(sql`ALTER TABLE wa_messages ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(100)`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS wa_message_templates (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          body TEXT NOT NULL,
          used_count INTEGER DEFAULT 0,
          created_by VARCHAR(100) DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS wa_broadcasts (
          id SERIAL PRIMARY KEY,
          body TEXT NOT NULL,
          template_id INTEGER,
          total_targets INTEGER DEFAULT 0,
          sent_count INTEGER DEFAULT 0,
          skipped_count INTEGER DEFAULT 0,
          failed_count INTEGER DEFAULT 0,
          status VARCHAR(20) DEFAULT 'running',
          created_by VARCHAR(100) DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          finished_at TIMESTAMP
        )
      `);
      // 📋 مرآة قوالب ميتا (استوديو القوالب)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS wa_templates (
          id SERIAL PRIMARY KEY,
          meta_id VARCHAR(40) UNIQUE,
          name VARCHAR(512) NOT NULL,
          language VARCHAR(10) DEFAULT 'ar' NOT NULL,
          category VARCHAR(20) DEFAULT '',
          status VARCHAR(24) DEFAULT '',
          components JSONB DEFAULT '[]',
          rejected_reason TEXT DEFAULT '',
          quality_score VARCHAR(20) DEFAULT '',
          created_by VARCHAR(100) DEFAULT '',
          last_sync_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      // 📣 الحملات: القوالب المعتمدة ← شرائح ← موزّع ذكي
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS wa_campaigns (
          id SERIAL PRIMARY KEY,
          name VARCHAR(150) NOT NULL,
          template_name VARCHAR(512) NOT NULL,
          template_language VARCHAR(10) DEFAULT 'ar',
          var_mapping JSONB DEFAULT '[]',
          segment JSONB DEFAULT '{}',
          total_targets INTEGER DEFAULT 0,
          sent_count INTEGER DEFAULT 0,
          delivered_count INTEGER DEFAULT 0,
          read_count INTEGER DEFAULT 0,
          failed_count INTEGER DEFAULT 0,
          skipped_count INTEGER DEFAULT 0,
          replied_count INTEGER DEFAULT 0,
          converted_count INTEGER DEFAULT 0,
          status VARCHAR(20) DEFAULT 'running',
          created_by VARCHAR(100) DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          finished_at TIMESTAMP
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS wa_campaign_recipients (
          id SERIAL PRIMARY KEY,
          campaign_id INTEGER REFERENCES wa_campaigns(id) ON DELETE CASCADE NOT NULL,
          phone VARCHAR(20) NOT NULL,
          name VARCHAR(150) DEFAULT '',
          player_id INTEGER,
          vars JSONB DEFAULT '[]',
          status VARCHAR(16) DEFAULT 'pending',
          wamid VARCHAR(255),
          error TEXT DEFAULT '',
          sent_at TIMESTAMP,
          replied_at TIMESTAMP,
          converted_at TIMESTAMP
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wa_camp_rcpt ON wa_campaign_recipients(campaign_id, status)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wa_camp_rcpt_phone ON wa_campaign_recipients(phone, sent_at)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wa_camp_rcpt_wamid ON wa_campaign_recipients(wamid)`);
      // 📊 استهلاك Gemini الحقيقي + أسعار الفوترة الرسمية
      await db.execute(sql`ALTER TABLE wa_bot_settings ADD COLUMN IF NOT EXISTS price_input_per_1m NUMERIC(10,4) DEFAULT 0.10`);
      await db.execute(sql`ALTER TABLE wa_bot_settings ADD COLUMN IF NOT EXISTS price_output_per_1m NUMERIC(10,4) DEFAULT 0.40`);
      await db.execute(sql`ALTER TABLE wa_bot_settings ADD COLUMN IF NOT EXISTS model_prices JSONB DEFAULT '{}'`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS wa_bot_usage (
          id SERIAL PRIMARY KEY,
          conversation_id INTEGER,
          source VARCHAR(12) DEFAULT 'live' NOT NULL,
          model VARCHAR(60) DEFAULT '',
          calls INTEGER DEFAULT 0,
          prompt_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          thoughts_tokens INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wa_bot_usage_at ON wa_bot_usage(created_at DESC)`);
      console.log('✅ WhatsApp inbox tables ensured');

      // ── 📱 تهيئة التطبيق الأصليّ (Flutter) ──
      // منصّة التوكن: كل الصفوف القائمة توكنات ويب، فالافتراضيّ web صحيح أثريّاً.
      await db.execute(sql`ALTER TABLE player_fcm_tokens ADD COLUMN IF NOT EXISTS platform VARCHAR(10) DEFAULT 'web'`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_player_fcm_platform ON player_fcm_tokens(platform)`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS app_release (
          id INTEGER PRIMARY KEY,
          min_android VARCHAR(40) DEFAULT '0.0.0',
          min_ios VARCHAR(40) DEFAULT '0.0.0',
          latest_android VARCHAR(40) DEFAULT '0.0.0',
          latest_ios VARCHAR(40) DEFAULT '0.0.0',
          android_url VARCHAR(300) DEFAULT '',
          ios_url VARCHAR(300) DEFAULT '',
          message VARCHAR(500) DEFAULT '',
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      // صفّ الإعدادات الوحيد — حدّ صفر يعني «لا حجب أحداً» حتّى يُضبط.
      await db.execute(sql`
        INSERT INTO app_release (id, message) VALUES (1, 'صدر تحديث مطلوب للتطبيق — حدّثه للمتابعة.')
        ON CONFLICT (id) DO NOTHING
      `);
      console.log('✅ Native app tables ensured');
    }
  } catch (err: any) {
    console.warn('⚠️ WhatsApp inbox migration:', err.message);
  }

  // ── إنشاء جدول متابعة الحجوزات (مستقل عن الحجوزات المالية) ──
  try {
    const { getDB } = await import('./config/db.js');
    const { sql } = await import('drizzle-orm');
    const db = getDB();
    if (db) {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS reservations (
          id SERIAL PRIMARY KEY,
          activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
          contact_name VARCHAR(150) NOT NULL,
          contact_method VARCHAR(200) DEFAULT '',
          phone VARCHAR(30) DEFAULT '',
          people_count INTEGER DEFAULT 1,
          status VARCHAR(20) DEFAULT 'pending' NOT NULL,
          notes TEXT DEFAULT '',
          created_by VARCHAR(100) DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
          deleted_at TIMESTAMP
        )
      `);
      // إضافة عمود الهاتف إن لم يكن موجوداً (للجداول الموجودة مسبقاً)
      await db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS phone VARCHAR(30) DEFAULT ''`);
      // إضافة عمود الحضور
      await db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS attended BOOLEAN DEFAULT NULL`);
      console.log('✅ Reservations tracker table ensured');
    }
  } catch (err: any) {
    console.warn('⚠️ Reservations table migration:', err.message);
  }

  // ── إنشاء جدول قوالب المقاعد ──
  try {
    const { getDB } = await import('./config/db.js');
    const { sql } = await import('drizzle-orm');
    const db = getDB();
    if (db) {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS seat_templates (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          layout_type VARCHAR(20) DEFAULT 'circle' NOT NULL,
          total_seats INTEGER NOT NULL,
          reserved_tail_count INTEGER DEFAULT 5,
          pinned_seats JSONB DEFAULT '[]',
          constraints_config JSONB DEFAULT '[]',
          seat_positions JSONB,
          is_default BOOLEAN DEFAULT false,
          created_by INTEGER REFERENCES staff(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
          deleted_at TIMESTAMP
        )
      `);
      // إضافة عمود seat_template_id في activities
      await db.execute(sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS seat_template_id INTEGER`);
      console.log('✅ Seat templates table ensured');
    }
  } catch (err: any) {
    console.warn('⚠️ Seat templates migration:', err.message);
  }

  // ── 📋 سجل عمليات الموظفين + ربط المنشئ ──
  try {
    const { getDB } = await import('./config/db.js');
    const { sql } = await import('drizzle-orm');
    const db = getDB();
    if (!db) throw new Error('DB unavailable');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS staff_action_log (
        id SERIAL PRIMARY KEY,
        staff_id INTEGER,
        staff_username VARCHAR(50),
        staff_role VARCHAR(20),
        source VARCHAR(10) DEFAULT 'socket',
        action VARCHAR(80) NOT NULL,
        category VARCHAR(30) DEFAULT 'OTHER',
        label_ar VARCHAR(120),
        activity_id INTEGER,
        room_id VARCHAR(50),
        room_code VARCHAR(20),
        match_id INTEGER,
        target_physical_id INTEGER,
        target_name VARCHAR(100),
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_sal_activity ON staff_action_log (activity_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_sal_room ON staff_action_log (room_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_sal_staff ON staff_action_log (staff_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_sal_created ON staff_action_log (created_at DESC)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_sal_category ON staff_action_log (category)`);
    await db.execute(sql`ALTER TABLE staff_action_log ADD COLUMN IF NOT EXISTS outcome VARCHAR(10)`);
    // ربط المنشئ: الفعالية والمباراة (sessions.created_by موجود مسبقاً)
    await db.execute(sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS created_by INTEGER`);
    await db.execute(sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS created_by INTEGER`);
    // ── مصاريف: أنواع (expense_categories) + ارتباط (costs.scope/player_id) ──
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS expense_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        deleted_at TIMESTAMP
      )
    `);
    // بذر أنواع افتراضية عند فراغ الجدول فقط
    await db.execute(sql`
      INSERT INTO expense_categories (name)
      SELECT v.name FROM (VALUES ('إيجار'),('رواتب'),('ضيافة'),('مشتريات'),('تسويق'),('صيانة'),('مواصلات')) AS v(name)
      WHERE NOT EXISTS (SELECT 1 FROM expense_categories)
    `);
    await db.execute(sql`ALTER TABLE costs ADD COLUMN IF NOT EXISTS scope VARCHAR(20) DEFAULT 'general'`);
    await db.execute(sql`ALTER TABLE costs ADD COLUMN IF NOT EXISTS player_id INTEGER`);
    // نقل البيانات القديمة: المصاريف المرتبطة بنشاط → scope='activity'
    await db.execute(sql`UPDATE costs SET scope='activity' WHERE activity_id IS NOT NULL AND (scope IS NULL OR scope='general')`);
    // 💰 مستلم حساب الفعالية (يُعدَّل من صفحة المالية — يطغى على مستلمي الحجوزات في التقارير)
    await db.execute(sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS received_by VARCHAR(100) DEFAULT ''`);
    console.log('✅ Staff action log + creator columns + expense categories/scope ensured');
  } catch (err: any) {
    console.warn('⚠️ Staff action log migration:', err.message);
  }

  // ══════════════════════════════════════════════════
  // 🪙 اقتصاد التشبس Chips — المرحلة 0 (الأساس المالي)
  // الدفتر append-only + كاش الرصيد + خانات التجهيز.
  // ⚠️ chips_balance مستثنى من تصفير الموسم (season.service.ts
  //    يستخدم قائمة بيضاء صريحة — لا wildcard — فالاستثناء مضمون).
  // ══════════════════════════════════════════════════
  try {
    const { getDB } = await import('./config/db.js');
    const { sql } = await import('drizzle-orm');
    const db = getDB();
    if (db) {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS chips_ledger (
          id SERIAL PRIMARY KEY,
          player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          amount INTEGER NOT NULL,
          balance_after INTEGER NOT NULL,
          reason VARCHAR(40) NOT NULL,
          ref_type VARCHAR(20),
          ref_id VARCHAR(60),
          idempotency_key VARCHAR(120) NOT NULL,
          staff_id INTEGER,
          note TEXT,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      // 🔑 حجر الزاوية: التكرار يفشل هنا لا في المنطق التطبيقي
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_chips_ledger_idem ON chips_ledger(idempotency_key)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chips_ledger_player ON chips_ledger(player_id, id DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chips_ledger_at ON chips_ledger(created_at DESC)`);
      // كاش الرصيد + خانات التجهيز (خاملة حتى المرحلة 1)
      await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS chips_balance INTEGER DEFAULT 0 NOT NULL`);
      await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS chips_frame_item_id INTEGER`);
      await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS chips_title_item_id INTEGER`);
      await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS chips_name_fx_item_id INTEGER`);
      // ── 🏦 المرحلة 1: كتالوج الخزنة + الإيجارات (نموذج الإيجار الزمني) ──
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS chips_items (
          id SERIAL PRIMARY KEY,
          kind VARCHAR(20) NOT NULL,
          item_key VARCHAR(40) NOT NULL,
          name_ar VARCHAR(80) NOT NULL,
          description_ar TEXT DEFAULT '',
          hook_ar TEXT DEFAULT '',
          rarity VARCHAR(20) DEFAULT 'common' NOT NULL,
          price_chips INTEGER DEFAULT 0 NOT NULL,
          duration_days INTEGER DEFAULT 30 NOT NULL,
          emblem_id VARCHAR(30),
          config JSONB DEFAULT '{}'::jsonb,
          is_active BOOLEAN DEFAULT true NOT NULL,
          is_purchasable BOOLEAN DEFAULT true NOT NULL,
          closed_at TIMESTAMP,
          sort_order INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_chips_items_key ON chips_items(item_key)`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS chips_rentals (
          id SERIAL PRIMARY KEY,
          player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          item_id INTEGER NOT NULL REFERENCES chips_items(id) ON DELETE CASCADE,
          starts_at TIMESTAMP DEFAULT NOW() NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          source VARCHAR(20) DEFAULT 'rent' NOT NULL,
          ledger_id INTEGER,
          warned_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      // الملكية = إيجار نشط → الفهرس على (اللاعب، الانتهاء) هو مسار القراءة الساخن
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chips_rentals_player ON chips_rentals(player_id, expires_at DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chips_rentals_item ON chips_rentals(item_id)`);
      // إعدادات الاقتصاد القابلة للتعديل من اللوحة (مكافآت التوب-3 والعيديّة)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS chips_config (
          id SERIAL PRIMARY KEY,
          key VARCHAR(40) NOT NULL,
          value JSONB NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_chips_config_key ON chips_config(key)`);
      console.log('✅ Chips economy tables ensured (ledger + balance cache + store catalog + rentals)');

      // ══════════════════════════════════════════════════
      // 🛡️ المرحلة ٢ — ديمومة الدفتر (كتلة مستقلّة، آمنة التكرار)
      //
      // ⚠️ العلّة: الدفتر يُوصف بأنه «append-only لا يُحذف إطلاقاً» بينما مرجعه
      //    كان ON DELETE CASCADE — فحذف لاعب واحد يمحو سجلّه المالي كاملاً،
      //    ودمج حسابين مكرّرين (عملية نادٍ روتينية) يحرق رصيد لاعب دافع
      //    وكل تاريخ شرائه. الوعد كان تعليقاً، لا قيداً.
      //
      // كتلة منفصلة عن كتلة المرحلة ٠ عمداً: فشلٌ هنا يجب ألّا يمنع بذر
      // الكتالوج، والعكس.
      // ══════════════════════════════════════════════════
      try {
        // ① تحويل المراجع من CASCADE إلى RESTRICT — **بلا افتراض اسم القيد**
        //    (الاسم مولَّد تلقائياً لأن المرجع كُتب inline في CREATE TABLE).
        for (const t of [
          { table: 'chips_ledger', col: 'player_id' },
          { table: 'chips_rentals', col: 'player_id' },
        ]) {
          const conRows: any = await db.execute(sql.raw(`
            SELECT c.conname
              FROM pg_constraint c
              JOIN pg_class rel ON rel.oid = c.conrelid
              JOIN pg_attribute a ON a.attrelid = rel.oid AND a.attnum = ANY(c.conkey)
             WHERE rel.relname = '${t.table}' AND c.contype = 'f'
               AND a.attname = '${t.col}' AND c.confdeltype = 'c'
          `));
          const rows = conRows?.rows ?? (Array.isArray(conRows) ? conRows : []);
          for (const r of rows) {
            await db.execute(sql.raw(`ALTER TABLE ${t.table} DROP CONSTRAINT "${r.conname}"`));
            // NOT VALID ثم VALIDATE: القفل الحصري لحظيّ بدل مسح الجدول كاملاً
            await db.execute(sql.raw(`
              ALTER TABLE ${t.table}
                ADD CONSTRAINT ${t.table}_${t.col}_restrict_fk
                FOREIGN KEY (${t.col}) REFERENCES players(id) ON DELETE RESTRICT NOT VALID
            `));
            await db.execute(sql.raw(`ALTER TABLE ${t.table} VALIDATE CONSTRAINT ${t.table}_${t.col}_restrict_fk`));
            console.log(`🛡️ ${t.table}.${t.col} → ON DELETE RESTRICT (كان CASCADE)`);
          }
        }

        // ② الوعد يصير قيداً: لا UPDATE ولا DELETE على الدفتر.
        //    مخرج الصيانة الوحيد إعلان صريح داخل المعاملة:
        //      SET LOCAL app.chips_ledger_admin = 'on';
        //    فلا يقع تعديل بالمصادفة، ويبقى الإصلاح المتعمّد ممكناً وموثَّقاً.
        await db.execute(sql`
          CREATE OR REPLACE FUNCTION chips_ledger_immutable() RETURNS trigger AS $$
          BEGIN
            IF COALESCE(current_setting('app.chips_ledger_admin', true), '') = 'on' THEN
              RETURN COALESCE(NEW, OLD);
            END IF;
            RAISE EXCEPTION 'chips_ledger is append-only (% blocked). Set app.chips_ledger_admin to override.', TG_OP;
          END;
          $$ LANGUAGE plpgsql
        `);
        await db.execute(sql`DROP TRIGGER IF EXISTS trg_chips_ledger_immutable ON chips_ledger`);
        await db.execute(sql`
          CREATE TRIGGER trg_chips_ledger_immutable
          BEFORE UPDATE OR DELETE ON chips_ledger
          FOR EACH ROW EXECUTE FUNCTION chips_ledger_immutable()
        `);

        // ③ فهارس واجهة المتجر — بلاها تصير كل فتحة متجر مسحاً كاملاً
        //    لجدول الإيجارات (وهو أسرع جداول التشبس نموّاً).
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chips_rentals_item_exp ON chips_rentals(item_id, expires_at)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chips_rentals_player_exp ON chips_rentals(player_id, expires_at)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chips_ledger_ref ON chips_ledger(ref_type, ref_id)`);

        console.log('🛡️ Chips ledger durability ensured (RESTRICT + append-only trigger + store indexes)');
      } catch (e: any) {
        console.warn('⚠️ Chips ledger durability migration:', e?.message);
      }

      // ══════════════════════════════════════════════════
      // 💰 المرحلة ٣ — المحاسبة (كتلة مستقلّة، إضافية بالكامل)
      //
      // ⚠️ العلّة: إيراد الدينار كان يُعاد اشتقاقه **وقت القراءة** من ثوابت
      //    الباقات في الكود — فتعديل سعر باقة يُعيد كتابة كل تاريخ الإيراد،
      //    وسحب باقة يُخفي إيرادها. ولا سعر مسجَّل على الإيجار، فاسترجاع
      //    بالتناسب مستحيل بصدق. ولا رابط بين حركة واسترجاعها.
      //
      // كل ما هنا **إضافة**: أعمدة nullable وجداول جديدة. لا تعديل صفّ قائم
      //    ولا حذف — التاريخ يبقى كما هو ويُصنَّف عند القراءة.
      // ══════════════════════════════════════════════════
      try {
        // ① قيمة الدينار وقت الحركة — تُكتب للشحن فقط، وتبقى NULL لما قبلها
        await db.execute(sql`ALTER TABLE chips_ledger ADD COLUMN IF NOT EXISTS jod_amount NUMERIC(10,3)`);
        await db.execute(sql`ALTER TABLE chips_ledger ADD COLUMN IF NOT EXISTS pack_id VARCHAR(20)`);

        // ② ربط الاسترجاع بحركته — وقيد يمنع استرجاع الحركة مرتين
        await db.execute(sql`ALTER TABLE chips_ledger ADD COLUMN IF NOT EXISTS reverses_ledger_id INTEGER`);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_chips_ledger_reverses
            ON chips_ledger(reverses_ledger_id) WHERE reverses_ledger_id IS NOT NULL
        `);

        // ③ السعر المدفوع فعلاً على الإيجار — بدونه الاسترجاع بالتناسب تخمين
        await db.execute(sql`ALTER TABLE chips_rentals ADD COLUMN IF NOT EXISTS price_paid_chips INTEGER`);
        await db.execute(sql`ALTER TABLE chips_rentals ADD COLUMN IF NOT EXISTS duration_days_snapshot INTEGER`);
        // ⚠️ لا backfill: ملء السعر من سعر العنصر **الحالي** يخترع رقماً
        //    ماليّاً ثم يُصرف منه استرجاع. الصفوف القديمة تبقى NULL،
        //    ومسار الاسترجاع يرفض التناسب عليها صراحةً.

        // ④ تاريخ الأسعار — تعديل السعر يُغيّر الحاضر ولا يُعيد كتابة الماضي
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS chips_item_price_history (
            id SERIAL PRIMARY KEY,
            item_id INTEGER NOT NULL REFERENCES chips_items(id) ON DELETE CASCADE,
            price_chips INTEGER NOT NULL,
            duration_days INTEGER NOT NULL,
            changed_by INTEGER,
            changed_at TIMESTAMP DEFAULT NOW() NOT NULL
          )
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chips_price_hist_item ON chips_item_price_history(item_id, changed_at DESC)`);

        // بذر نقطة البداية لكل عنصر لا تاريخ له — فالسعر الحالي مؤرَّخ من الآن
        await db.execute(sql`
          INSERT INTO chips_item_price_history (item_id, price_chips, duration_days, changed_at)
          SELECT i.id, i.price_chips, i.duration_days, i.created_at
            FROM chips_items i
           WHERE NOT EXISTS (SELECT 1 FROM chips_item_price_history h WHERE h.item_id = i.id)
        `);

        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chips_ledger_reason_at ON chips_ledger(reason, created_at DESC)`);

        console.log('💰 Chips accounting schema ensured (jod snapshot + refund link + price history)');
      } catch (e: any) {
        console.warn('⚠️ Chips ledger durability migration:', e?.message);
      }

      // ── قمع المتجر: جدول أحداث خفيف ──
      //
      // ⚠️ الظهور مُقيَّد **يومياً لكل (لاعب، عنصر)**: بلا هذا القيد يكتب
      //    ٣٠ لاعباً × ٢٠ عنصراً صفوفاً مع كل تمريرة — آلاف يومياً بلا أي
      //    معنى إضافي، وجدول تحليلات يتضخّم حتى يُبطئ ما جاء ليقيسه.
      try {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS chips_store_events (
            id SERIAL PRIMARY KEY,
            player_id INTEGER NOT NULL,
            event VARCHAR(20) NOT NULL,
            item_id INTEGER,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS uniq_store_impression_day
            ON chips_store_events (player_id, item_id, (created_at::date))
            WHERE event = 'impression'
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_store_events_at ON chips_store_events (created_at DESC)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_store_events_event ON chips_store_events (event, created_at DESC)
        `);
        console.log('📉 Chips store funnel table ensured');
      } catch (e: any) {
        console.warn('⚠️ Chips store funnel migration:', e?.message);
      }

      // ── التجربة المجانية: مرّة واحدة للأبد، بقيدٍ لا بشرط ──
      //
      // ⚠️ فهرس **جزئي فريد على اللاعب وحده** حين يكون المصدر تجربة.
      //    الشرط في الكود يكفي للاستعمال العادي، لكن هذا مسار مجّاني:
      //    سباقٌ فيه يُنتج تجربتين ولا أثر مالي يكشفه لاحقاً.
      try {
        // دمج أي ازدواج سابق قبل القيد (لا يوجد اليوم — لكن الترحيل يجب
        // أن يصحّ على أي بيئة، وإلا فشل الإنشاء وبقيت القاعدة بلا قيد)
        await db.execute(sql`
          DELETE FROM chips_rentals a
           USING chips_rentals b
           WHERE a.player_id = b.player_id
             AND a.source IN ('trial','trial_converted')
             AND b.source IN ('trial','trial_converted')
             AND a.id > b.id
        `);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS uniq_chips_trial_once_per_player
            ON chips_rentals(player_id)
            WHERE source IN ('trial', 'trial_converted')
        `);
        console.log('🎁 Chips free-trial uniqueness ensured (once per player, ever)');
      } catch (e: any) {
        console.warn('⚠️ Chips trial index migration:', e?.message);
      }

      // ── ضبط التسويق: تجاوز يدوي للإشارات المشتقّة ──
      //
      // «الأكثر طلباً» و«جديد» يُحسبان من البيانات، وهذا صحيح افتراضاً —
      // لكن المالك لا يملك وسيلة لإبراز عنصر أطلقه للتوّ أو كتم آخر.
      // العمودان يسمحان بالتجاوز بلا تعطيل الاشتقاق.
      try {
        await db.execute(sql`
          ALTER TABLE chips_items ADD COLUMN IF NOT EXISTS hot_override BOOLEAN;
        `);
        await db.execute(sql`
          ALTER TABLE chips_items ADD COLUMN IF NOT EXISTS new_override BOOLEAN;
        `);
        console.log('🛍️ Chips merchandising overrides ensured');
      } catch (e: any) {
        console.warn('⚠️ Chips merch overrides migration:', e?.message);
      }

      // ── صفّ إيجار واحد لكل (لاعب، عنصر) — قيدٌ لا اتفاق ──
      //
      // الشيفرة صارت غير قادرة على إنتاج صفّ ثانٍ، لكن «غير قادرة» وعدٌ
      // يبقى صحيحاً حتى يكتب أحدهم مساراً رابعاً. القيد يجعله مستحيلاً.
      //
      // ⚠️ الدمج قبل الفهرس إلزامي: بيئة فيها صفّ مكرّر واحد تُفشل الإنشاء
      //    وتترك القاعدة بلا قيد بينما السجلّ يقول «تمّ».
      try {
        const merged: any = await db.execute(sql`
          WITH ranked AS (
            SELECT id, player_id, item_id, expires_at,
                   ROW_NUMBER() OVER (PARTITION BY player_id, item_id ORDER BY expires_at DESC, id DESC) AS rn
              FROM chips_rentals
          ),
          winners AS (SELECT * FROM ranked WHERE rn = 1),
          losers  AS (SELECT * FROM ranked WHERE rn > 1),
          -- الفائز يرث أبعد انتهاء (وهو أصلاً الأبعد بحكم الترتيب)
          gone AS (DELETE FROM chips_rentals WHERE id IN (SELECT id FROM losers) RETURNING id)
          SELECT (SELECT COUNT(*) FROM gone)::int AS removed,
                 (SELECT COUNT(*) FROM winners)::int AS kept
        `);
        const removed = Number((merged?.rows ?? merged)?.[0]?.removed ?? 0);
        if (removed > 0) console.log(`🧹 Chips rentals de-duplicated: ${removed} row(s) merged away`);

        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_chips_rentals_player_item
            ON chips_rentals(player_id, item_id)
        `);
        console.log('🔒 Chips rentals uniqueness ensured (one row per player+item)');
      } catch (e: any) {
        console.warn('⚠️ Chips rentals uniqueness migration:', e?.message);
      }

      // بذر الكتالوج المعتمد (آمن التكرار — لا يلمس تعديلات الأدمن)
      try {
        const { seedChipsCatalog } = await import('./services/chips-catalog.seed.js');
        const n = await seedChipsCatalog();
        if (n > 0) console.log(`🌱 Chips catalog seeded: ${n} new item(s)`);

        // ⚡🔊 العنصران صارا منفَّذين: معزّز الخبرة (مضاعِف XP في محرك المكافآت)
        //    ونغمة النصر (تُبثّ من finalizeMatch وتُعزف من جهاز القائد).
        //    نعيد عرضهما مرة واحدة، ولا نلمس ما عدّله الأدمن بنفسه.
        //    ملاحظة: نغمة النصر تبقى محجوبة عن المتجر ديناميكياً ما لم يُربط
        //    ملف صوت بمفتاحها — الفحص لحظي في مسار المتجر لا هنا.
        await db.execute(sql`
          UPDATE chips_items SET is_active = true
           WHERE kind IN ('xp_boost', 'victory_sting')
             AND is_active = false
             AND updated_at = created_at
        `);
        // ربط مفتاح الصوت للنغمة المبذورة قديماً بقيمة غير مستخدمة
        await db.execute(sql`
          UPDATE chips_items
             SET config = jsonb_build_object('soundKey', 'chips_victory_sting')
           WHERE item_key = 'sting_classic'
             AND updated_at = created_at
             AND NOT (config ? 'soundKey')
        `);
      } catch (e: any) {
        console.warn('⚠️ Chips catalog seed:', e.message);
      }
    }
  } catch (err: any) {
    console.warn('⚠️ Chips migration:', err.message);
  }

  // ── تهيئة Firebase ──
  try {
    const { initFirebase } = await import('./config/firebase.js');
    initFirebase();
  } catch (err: any) {
    console.warn('⚠️ Firebase init skipped:', err.message);
  }

  // ── إنشاء جدول الفيدباك إن لم يكن موجوداً (idempotent) ──
  try {
    const { ensureFeedbackTable } = await import('./services/feedback.service.js');
    await ensureFeedbackTable();
  } catch (err: any) {
    console.warn('⚠️ ensureFeedbackTable skipped:', err.message);
  }

  // ── تهيئة web-push (VAPID keys) مبكراً — مفاتيح ثابتة من البيئة أو ملف محفوظ ──
  try {
    const { initWebPush } = await import('./config/vapid.js');
    const wp = await initWebPush();
    if (wp) {
      console.log('✅ web-push initialized with stable VAPID keys at startup');
    } else {
      console.warn('⚠️ web-push init skipped: no VAPID keys available');
    }
  } catch (err: any) {
    console.warn('⚠️ web-push init skipped:', err.message);
  }

  // ── بذر لعبة تجريبية (تطوير فقط) ──
  if (env.NODE_ENV === 'development') {
    await seedDummyGame();
  }

  // ── حماية من الانهيار: التقاط الأخطاء غير المعالَجة (يمنع توقّف العملية) ──
  process.on('unhandledRejection', (reason: any) => {
    console.error('⚠️ Unhandled Rejection:', reason?.message || reason);
  });
  process.on('uncaughtException', (err: any) => {
    console.error('⚠️ Uncaught Exception:', err?.message || err);
  });

  // ── معالج أخطاء عام (آخر middleware) — رسالة عامة بلا تسريب تفاصيل داخلية ──
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error('❌ Route error:', err?.message || err);
    if (!res.headersSent) res.status(500).json({ error: 'حدث خطأ داخلي' });
  });

  // ── بدء الاستماع ──
  server.listen(env.PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║  🎭 Unified Mafia Platform v2.0                 ║
║  ─────────────────────────────────────────────── ║
║  Server:      http://localhost:${env.PORT}               ║
║  Environment: ${env.NODE_ENV}                      ║
║  Frontend:    ${env.FRONTEND_URL}            ║
║  ─────────────────────────────────────────────── ║
║  🏢 Club API:  /api/auth, /api/activities, ...   ║
║  🎮 Game API:  /api/leader/history, sessions     ║
║  🔌 Socket.IO: ws://localhost:${env.PORT}               ║
╚══════════════════════════════════════════════════╝
    `);
  });

  // ── 🔔 مجدول تذكير الحجوزات (قبل اللعبة بساعة) — ماسح كل 60 ثانية ──
  try {
    const { startReminderScheduler } = await import('./services/whatsapp-reminder.service.js');
    startReminderScheduler();
  } catch (e: any) { console.warn('⚠️ reminder scheduler init:', e.message); }

  // ── ⏰ ماسح الطلبات المتأخّرة — تذكير موظّفي المكان كل 5 دقائق (سقف 3) ──
  try {
    const { startStalledOrderScheduler } = await import('./services/fnb-reminder.service.js');
    startStalledOrderScheduler(io);
  } catch (e: any) { console.warn('⚠️ fnb reminder scheduler init:', e.message); }

  // ── 🎂 مجدول عيديّة الميلاد — ماسح كل 30 دقيقة بتوقيت الأردن ──
  // المنح محروس بمفتاح دفتر سنوي، فتكرار الفحص لا يمنح مرتين أبداً.
  try {
    const { startBirthdayScheduler } = await import('./services/chips-rewards.service.js');
    startBirthdayScheduler();
    const { startExpiryScheduler } = await import('./services/chips-store.service.js');
    startExpiryScheduler();
  } catch (e: any) { console.warn('⚠️ birthday scheduler init:', e.message); }

  // ── 📊 تحديث كاش التحليلات: عند الإقلاع إن كان قديماً + ليليّاً الساعة ٤ فجراً ──
  try {
    const { refreshCache, isCacheStale } = await import('./services/analytics.service.js');
    if (await isCacheStale(26)) {
      refreshCache().then(r => console.log(`📊 analytics cache refreshed on boot: ${r.count} players`)).catch(e => console.warn('⚠️ analytics boot refresh:', e.message));
    }
    // فحص كل ساعة: عند بلوغ الساعة ٤ فجراً ولم يُحدَّث اليوم → أعِد الحساب
    let lastRefreshDay = -1;
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 4 && now.getDate() !== lastRefreshDay) {
        lastRefreshDay = now.getDate();
        try { const r = await refreshCache(); console.log(`📊 nightly analytics refresh: ${r.count} players`); }
        catch (e: any) { console.warn('⚠️ nightly analytics refresh:', e.message); }
      }
    }, 60 * 60 * 1000);
  } catch (e: any) { console.warn('⚠️ analytics scheduler init:', e.message); }
}

main().catch(console.error);
