// ══════════════════════════════════════════════════════
// 🎮 Player Routes — البحث والتسجيل والبروفايل
// يُستخدم من واجهة اللاعب (PlayerFlow) للبحث والتسجيل
// + GET /api/player/:id/profile للبروفايل الكامل
// ══════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { getDB } from '../config/db.js';
import { sessionPlayers } from '../schemas/game.schema.js';
import { players as playersTable, PLAYER_DEFAULT_PASSWORD } from '../schemas/player.schema.js';
import { eq, desc } from 'drizzle-orm';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { hashPlayerPassword } from '../middleware/player-auth.middleware.js';
import {
  findPlayerByPhone,
  createPlayer,
  touchPlayerActivity,
  getPlayerProfile,
} from '../services/player.service.js';

const router = Router();

// ── GET /api/player/all — جلب جميع اللاعبين (Admin only) ──
router.get('/all', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متوفرة' });

    const rows = await db.select({
      id: playersTable.id,
      phone: playersTable.phone,
      name: playersTable.name,
      gender: playersTable.gender,
      avatarUrl: playersTable.avatarUrl,
      totalMatches: playersTable.totalMatches,
      totalWins: playersTable.totalWins,
      totalSurvived: playersTable.totalSurvived,
      xp: playersTable.xp,
      level: playersTable.level,
      rankTier: playersTable.rankTier,
      rankRR: playersTable.rankRR,
      lastActiveAt: playersTable.lastActiveAt,
      createdAt: playersTable.createdAt,
      mustChangePassword: playersTable.mustChangePassword,
      email: playersTable.email,
    }).from(playersTable).orderBy(desc(playersTable.createdAt));

    return res.json({ success: true, players: rows });
  } catch (err: any) {
    console.error('❌ Fetch all players error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في جلب اللاعبين' });
  }
});

// ── POST /api/player/:id/reset-password — إعادة تعيين كلمة المرور (Admin only) ──
router.post('/:id/reset-password', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف اللاعب غير صالح' });
    }

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متوفرة' });

    // التحقق من وجود اللاعب
    const existing = await db.select({ id: playersTable.id, name: playersTable.name })
      .from(playersTable)
      .where(eq(playersTable.id, playerId))
      .limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });
    }

    // إعادة تعيين كلمة المرور للافتراضية
    const defaultHash = await hashPlayerPassword(PLAYER_DEFAULT_PASSWORD);
    await db.update(playersTable)
      .set({ passwordHash: defaultHash, mustChangePassword: true })
      .where(eq(playersTable.id, playerId));

    console.log(`🔄 Admin reset password for player #${playerId} (${existing[0].name}) to default`);
    return res.json({ success: true, message: 'تم إعادة تعيين كلمة المرور للافتراضية' });
  } catch (err: any) {
    console.error('❌ Reset password error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في إعادة تعيين كلمة المرور' });
  }
});

// ── DELETE /api/player/:id — حذف لاعب نهائياً (Admin only) ──
router.delete('/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف اللاعب غير صالح' });
    }

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متوفرة' });

    // التحقق من وجود اللاعب
    const existing = await db.select({ id: playersTable.id, name: playersTable.name })
      .from(playersTable)
      .where(eq(playersTable.id, playerId))
      .limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });
    }

    // حذف اللاعب
    await db.delete(playersTable).where(eq(playersTable.id, playerId));

    console.log(`🗑️ Admin deleted player #${playerId} (${existing[0].name})`);
    return res.json({ success: true, message: 'تم حذف اللاعب بنجاح' });
  } catch (err: any) {
    console.error('❌ Delete player error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في حذف اللاعب' });
  }
});

// ── POST /api/player/lookup — البحث عن لاعب برقم الهاتف ──
router.post('/lookup', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.json({ found: false, player: null });
    }

    // التأكد من اتصال DB — محاولة إعادة الاتصال إن لم يكن متصلاً
    let db = getDB();
    if (!db) {
      console.warn('[Lookup] ⚠️ DB is null, attempting reconnection...');
      try {
        const { connectDB } = await import('../config/db.js');
        await connectDB();
        db = getDB();
        console.log('[Lookup]', db ? '✅ DB reconnected!' : '❌ DB still null after reconnection');
      } catch (dbErr: any) {
        console.error('[Lookup] ❌ DB reconnection failed:', dbErr.message);
      }
    }

    if (!db) {
      console.error('[Lookup] ❌ CRITICAL: No DB connection — cannot lookup player');
      return res.json({ found: false, player: null, dbError: 'لا يوجد اتصال بقاعدة البيانات' });
    }

    // 1. البحث في جدول players الموحد
    console.log(`[Lookup] 🔍 Searching for phone: "${phone}"`);
    const unified = await findPlayerByPhone(phone);
    console.log(`[Lookup] 📦 Unified result:`, unified ? `Found: ${unified.name} (id=${unified.id})` : 'NOT FOUND');

    if (unified) {
      await touchPlayerActivity(unified.id);
      return res.json({
        found: true,
        player: {
          id: unified.id,
          displayName: unified.name,
          phone: unified.phone,
          gender: unified.gender,
          dateOfBirth: unified.dob,
          playerId: unified.id,
        },
      });
    }

    // 2. Fallback: البحث في session_players (قديم)
    const results = await db
      .select()
      .from(sessionPlayers)
      .where(eq(sessionPlayers.phone, phone))
      .orderBy(desc(sessionPlayers.id))
      .limit(1);

    console.log(`[Lookup] 📦 Session fallback:`, results.length > 0 ? `Found: ${results[0].playerName}` : 'NOT FOUND');

    if (results.length > 0) {
      const p = results[0];
      // ترحيل تلقائي: إنشاء حساب في جدول players الموحد
      let unifiedPlayerId = null;
      try {
        const migratedPlayer = await createPlayer({
          phone: p.phone || phone,
          name: p.playerName,
          gender: p.gender || 'MALE',
          dob: p.dateOfBirth || undefined,
        });
        if (migratedPlayer) unifiedPlayerId = migratedPlayer.id;
      } catch { /* ignore migration errors */ }

      return res.json({
        found: true,
        player: {
          id: unifiedPlayerId || p.id,
          displayName: p.playerName,
          phone: p.phone,
          gender: p.gender,
          dateOfBirth: p.dateOfBirth,
          playerId: unifiedPlayerId || null,
        },
      });
    }

    console.log(`[Lookup] ℹ️ Player with phone "${phone}" not found in any table`);
    return res.json({ found: false, player: null });
  } catch (err: any) {
    console.error('❌ Player lookup error:', err.message);
    return res.status(500).json({ found: false, error: 'خطأ في البحث: ' + err.message });
  }
});

// ── POST /api/player/register — تسجيل لاعب جديد (إنشاء حساب تلقائي) ──
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { phone, displayName, dateOfBirth, gender } = req.body;

    if (!phone || !displayName) {
      return res.status(400).json({ success: false, error: 'الاسم ورقم الهاتف مطلوبان' });
    }

    // إنشاء أو إيجاد اللاعب في جدول players الموحد
    const player = await createPlayer({
      phone,
      name: displayName,
      gender: gender || 'MALE',
      dob: dateOfBirth || undefined,
    });

    if (player) {
      return res.json({
        success: true,
        player: {
          id: player.id,
          playerId: player.id,
          displayName: player.name,
          phone: player.phone,
        },
      });
    }

    // Fallback إذا DB مش متوفرة
    return res.json({
      success: true,
      player: {
        id: null,
        displayName,
        phone,
      },
    });
  } catch (err: any) {
    console.error('❌ Player register error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في التسجيل' });
  }
});

// ── GET /api/player/:id/profile — بروفايل اللاعب الكامل ──
router.get('/:id/profile', async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف اللاعب غير صالح' });
    }

    const profile = await getPlayerProfile(playerId);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });
    }

    // التحقق من لعبة نشطة (real-time من Redis) — تجاهل المجمدين
    let activeGame = null;
    try {
      const { getAllGameStates } = await import('../config/redis.js');
      const allStates = await getAllGameStates();

      for (const state of allStates) {
        if (!state || state.phase === 'GAME_OVER') continue;
        const p = state.players?.find((pl: any) =>
          (pl.playerId === playerId || pl.phone === profile.player.phone) && !pl.frozen
        );
        if (p) {
          activeGame = {
            roomId: state.roomId,
            roomCode: state.roomCode,
            gameName: state.config?.gameName,
            physicalId: p.physicalId,
            role: p.role,
            isAlive: p.isAlive,
            phase: state.phase,
          };
          break;
        }
      }
    } catch { /* Redis might be unavailable */ }

    return res.json({
      success: true,
      ...profile,
      activeGame,
    });
  } catch (err: any) {
    console.error('❌ Profile error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في جلب البروفايل' });
  }
});

// ── PUT /api/player/:id/profile — تعديل بيانات البروفايل ──
router.put('/:id/profile', async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف اللاعب غير صالح' });
    }

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متوفرة' });

    const { name, email, gender } = req.body;
    const updates: any = {};
    if (name && name.trim()) updates.name = name.trim();
    if (email !== undefined) updates.email = email?.trim() || null;
    if (gender && ['MALE', 'FEMALE'].includes(gender)) updates.gender = gender;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'لا توجد بيانات للتحديث' });
    }

    const { players } = await import('../schemas/player.schema.js');
    const result = await db.update(players)
      .set(updates)
      .where(eq(players.id, playerId))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });
    }

    // ── تحديث الاسم في الغرف النشطة (Redis) ──
    if (updates.name) {
      try {
        const { getAllGameStates, setGameState } = await import('../config/redis.js');
        const allStates = await getAllGameStates();
        for (const state of allStates) {
          if (!state || state.phase === 'GAME_OVER') continue;
          const player = state.players?.find((p: any) =>
            p.playerId === playerId || p.phone === result[0].phone
          );
          if (player) {
            player.name = updates.name;
            await setGameState(state.roomId, state);
            console.log(`🔄 Updated player name in Redis room ${state.roomId}: ${updates.name}`);
          }
        }
      } catch (err: any) {
        console.warn('⚠️ Failed to sync name to Redis:', err.message);
      }
    }

    console.log(`✏️ Player #${playerId} profile updated:`, updates);
    return res.json({ success: true, player: result[0] });
  } catch (err: any) {
    console.error('❌ Profile update error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في تعديل البروفايل' });
  }
});

// ── POST /api/player/:id/avatar — رفع صورة البروفايل (Base64) ──
router.post('/:id/avatar', async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف اللاعب غير صالح' });
    }

    const { image } = req.body; // base64 string: "data:image/jpeg;base64,..."
    if (!image || !image.startsWith('data:image/')) {
      return res.status(400).json({ success: false, error: 'صورة غير صالحة' });
    }

    const path = await import('path');
    const fs = await import('fs');

    const uploadDir = path.resolve('uploads/avatars');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // استخراج نوع الصورة و البيانات
    const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ success: false, error: 'تنسيق صورة غير صالح' });
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const base64Data = matches[2];
    const fileName = `${playerId}.${ext}`;
    const filePath = path.join(uploadDir, fileName);

    // حفظ الملف
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    const avatarUrl = `/uploads/avatars/${fileName}`;

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متوفرة' });

    const { players } = await import('../schemas/player.schema.js');
    await db.update(players)
      .set({ avatarUrl })
      .where(eq(players.id, playerId));

    console.log(`📸 Player #${playerId} avatar updated: ${avatarUrl}`);
    return res.json({ success: true, avatarUrl });
  } catch (err: any) {
    console.error('❌ Avatar upload error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في رفع الصورة' });
  }
});

export default router;
