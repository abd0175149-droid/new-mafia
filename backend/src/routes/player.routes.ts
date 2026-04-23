// ══════════════════════════════════════════════════════
// 🎮 Player Routes — البحث والتسجيل والبروفايل
// يُستخدم من واجهة اللاعب (PlayerFlow) للبحث والتسجيل
// + GET /api/player/:id/profile للبروفايل الكامل
// ══════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { getDB } from '../config/db.js';
import { sessionPlayers } from '../schemas/game.schema.js';
import { eq, desc } from 'drizzle-orm';
import {
  findPlayerByPhone,
  createPlayer,
  touchPlayerActivity,
  getPlayerProfile,
} from '../services/player.service.js';

const router = Router();

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

    // التحقق من لعبة نشطة (real-time من Redis)
    let activeGame = null;
    try {
      const { getAllGameStates } = await import('../config/redis.js');
      const allStates = await getAllGameStates();

      for (const state of allStates) {
        if (!state || state.phase === 'GAME_OVER') continue;
        const p = state.players?.find((pl: any) =>
          pl.playerId === playerId || pl.phone === profile.player.phone
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

export default router;
