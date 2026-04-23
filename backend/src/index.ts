// ══════════════════════════════════════════════════════
// 🎭 Unified Mafia Platform — Entry Point
// يجمع بين REST API (Club) + Socket.IO (Game Engine)
// ══════════════════════════════════════════════════════

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { connectRedis } from './config/redis.js';
import { seedDatabase } from './utils/seed.js';

// ── Routes (Club Admin) ─────────────────────────────
import authRoutes from './routes/auth.routes.js';
import activitiesRoutes from './routes/activities.routes.js';
import bookingsRoutes from './routes/bookings.routes.js';
import costsRoutes from './routes/costs.routes.js';
import foundationalRoutes from './routes/foundational.routes.js';
import staffRoutes from './routes/staff.routes.js';
import locationsRoutes from './routes/locations.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import leaderRoutes from './routes/leader.routes.js';
import driveRoutes from './routes/drive.routes.js';
import playerRoutes from './routes/player.routes.js';

// ── Socket Handlers (Game Engine) ───────────────────
import { registerLobbyEvents, seedDummyGame, rehydrateActiveRooms } from './sockets/lobby.socket.js';
import { registerDayEvents } from './sockets/day.socket.js';
import { registerNightEvents } from './sockets/night.socket.js';
import { registerGameEvents } from './sockets/game.socket.js';

// ── Game API Routes ─────────────────────────────────
import { getFinishedMatches, getMatchDetails, getMatchesBySession } from './services/match.service.js';
import { getClosedSessions } from './services/session.service.js';

const app = express();
const server = createServer(app);

// ── Socket.IO ───────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: env.FRONTEND_URL ? env.FRONTEND_URL.split(',') : '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ── Middleware ───────────────────────────────────────
app.use(cors({
  origin: env.FRONTEND_URL ? env.FRONTEND_URL.split(',') : '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

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
app.use('/api/staff', staffRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/leader', leaderRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/player', playerRoutes);

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

// GET /api/leader/sessions — الغرف المنتهية
app.get('/api/leader/sessions', async (_req, res) => {
  const sessions = await getClosedSessions();
  res.json(sessions);
});

// GET /api/leader/sessions/:id/matches — ألعاب غرفة محددة
app.get('/api/leader/sessions/:id/matches', async (req, res) => {
  const matches = await getMatchesBySession(parseInt(req.params.id));
  res.json(matches);
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
  }));
  res.json({ success: true, rooms });
});

// POST /api/game/verify-pin — التحقق من PIN شاشة العرض
app.post('/api/game/verify-pin', async (req, res) => {
  try {
    const { roomId, pin } = req.body;
    if (!roomId || !pin) {
      return res.json({ success: false, error: 'roomId and pin are required' });
    }

    const room = activeRooms.get(roomId);
    if (!room) {
      return res.json({ success: false, error: 'اللعبة غير موجودة' });
    }

    if (room.displayPin !== pin) {
      return res.json({ success: false, error: 'الرقم السري غير صحيح' });
    }

    // جلب حالة الغرفة الكاملة
    const state = await getRoom(roomId);

    res.json({
      success: true,
      gameName: room.gameName,
      roomCode: room.roomCode,
      playerCount: room.playerCount,
      maxPlayers: room.maxPlayers,
      state: state ? {
        phase: state.phase,
        players: state.players.map(p => ({
          physicalId: p.physicalId,
          name: p.name,
          isAlive: p.isAlive,
          gender: p.gender,
          role: p.role,
        })),
        winner: (state as any).winner || null,
        discussionState: (state as any).discussionState || null,
      } : null,
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

  // تسجيل كل مجموعات الأحداث
  registerLobbyEvents(io, socket);
  registerDayEvents(io, socket);
  registerNightEvents(io, socket);
  registerGameEvents(io, socket);
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

  // ── إعادة بناء الغرف النشطة من Redis ──
  await rehydrateActiveRooms();

  // ── بذر لعبة تجريبية (تطوير فقط) ──
  if (env.NODE_ENV === 'development') {
    await seedDummyGame();
  }

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
}

main().catch(console.error);
