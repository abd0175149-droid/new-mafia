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
import playerAuthRoutes from './routes/player-auth.routes.js';
import playerAppRoutes from './routes/player-app.routes.js';
import playerNotificationRoutes from './routes/player-notification.routes.js';
import staffNotificationRoutes from './routes/staff-notification.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import soundsRoutes from './routes/sounds.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import gameConfigRoutes from './routes/game-config.routes.js';
import ticketsRoutes from './routes/tickets.routes.js';
import progressionSettingsRoutes from './routes/progression-settings.routes.js';
import whatsappRoutes from './routes/whatsapp.routes.js';

// ── Socket Handlers (Game Engine) ───────────────────
import { registerLobbyEvents, seedDummyGame, rehydrateActiveRooms } from './sockets/lobby.socket.js';
import { registerDayEvents } from './sockets/day.socket.js';
import { registerNightEvents } from './sockets/night.socket.js';
import { registerGameEvents } from './sockets/game.socket.js';
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

// ── Middleware ───────────────────────────────────────
app.use(cors({
  origin: env.FRONTEND_URL ? env.FRONTEND_URL.split(',') : '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
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
app.use('/api/sounds', soundsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/game-config', gameConfigRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/progression-settings', progressionSettingsRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// ── VAPID Public Key لـ Web Push (iOS Safari) ──
app.get('/api/push/vapid-public-key', async (_req, res) => {
  try {
    const wp = await import('web-push');
    let publicKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';
    let privateKey = process.env.VAPID_PRIVATE_KEY || '';

    // إذا ما فيه مفتاح خاص → نولّد زوج مفاتيح
    if (!privateKey) {
      // نستخدم نفس الحيلة: الحفظ في متغير عملية (لا يضيع بين الطلبات)
      if (!(global as any).__vapidKeys) {
        const keys = wp.generateVAPIDKeys();
        (global as any).__vapidKeys = keys;
        console.log('🔑 VAPID keys generated for /api/push/vapid-public-key');
      }
      publicKey = (global as any).__vapidKeys.publicKey;
    }

    res.json({ publicKey });
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
          physicalId: p.physicalId, name: p.name, isAlive: p.isAlive,
          gender: p.gender, role: p.role, avatarUrl: (p as any).avatarUrl || null,
          rankTier: p.rankTier || 'INFORMANT',
        })),
        winner: (state as any).winner || null,
        discussionState: (state as any).discussionState || null,
        teamCounts: (() => {
          const alive = state.players.filter(p => p.isAlive);
          return {
            mafiaAlive: alive.filter(p => p.role && isMafiaRole(p.role as any)).length,
            citizenAlive: alive.filter(p => p.role && !isMafiaRole(p.role as any)).length,
          };
        })(),
        gameTimer: (state as any).gameTimer || null,
      } : null,
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

    if (room.displayPin !== pin) {
      return res.json({ success: false, error: 'الرقم السري غير صحيح' });
    }

    const state = await getRoom(room.roomId);
    res.json({
      success: true,
      roomId: room.roomId,
      gameName: room.gameName,
      roomCode: room.roomCode,
      playerCount: room.playerCount,
      maxPlayers: room.maxPlayers,
      state: state ? {
        phase: state.phase,
        players: state.players.map(p => ({
          physicalId: p.physicalId, name: p.name, isAlive: p.isAlive,
          gender: p.gender, role: p.role, avatarUrl: (p as any).avatarUrl || null,
          rankTier: p.rankTier || 'INFORMANT',
        })),
        winner: state.winner || null,
        discussionState: state.discussionState || null,
        teamCounts: (() => {
          const alive = state.players.filter(p => p.isAlive);
          return {
            mafiaAlive: alive.filter(p => p.role && isMafiaRole(p.role as any)).length,
            citizenAlive: alive.filter(p => p.role && !isMafiaRole(p.role as any)).length,
          };
        })(),
        gameTimer: state.gameTimer || null,
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

  // ── تهيئة Firebase ──
  try {
    const { initFirebase } = await import('./config/firebase.js');
    initFirebase();
  } catch (err: any) {
    console.warn('⚠️ Firebase init skipped:', err.message);
  }

  // ── تهيئة web-push (VAPID keys) مبكراً — يجب أن تكون جاهزة قبل أي طلب ──
  try {
    const wp = await import('web-push');
    const webpush = (wp as any).default || wp;
    let publicKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';
    let privateKey = process.env.VAPID_PRIVATE_KEY || '';
    
    if (!privateKey) {
      if (!(global as any).__vapidKeys) {
        const keys = webpush.generateVAPIDKeys();
        (global as any).__vapidKeys = keys;
        console.log('══════════════════════════════════════════════════');
        console.log('🔑 VAPID Keys Generated at startup:');
        console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
        console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
        console.log('══════════════════════════════════════════════════');
      }
      publicKey = (global as any).__vapidKeys.publicKey;
      privateKey = (global as any).__vapidKeys.privateKey;
    }
    webpush.setVapidDetails('mailto:admin@club-mafia.grade.sbs', publicKey, privateKey);
    console.log('✅ web-push initialized with VAPID keys at startup');
  } catch (err: any) {
    console.warn('⚠️ web-push init skipped:', err.message);
  }

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
