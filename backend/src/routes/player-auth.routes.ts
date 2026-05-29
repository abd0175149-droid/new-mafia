// ══════════════════════════════════════════════════════
// 🔐 مسارات مصادقة اللاعبين — Player Auth Routes
// POST /api/player-auth/register  — إنشاء حساب
// POST /api/player-auth/login     — تسجيل دخول
// GET  /api/player-auth/me        — بيانات اللاعب
// POST /api/player-auth/change-password — تغيير كلمة السر
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { players, PLAYER_DEFAULT_PASSWORD } from '../schemas/player.schema.js';
import {
  generatePlayerToken,
  hashPlayerPassword,
  verifyPlayerPassword,
  authenticatePlayer,
} from '../middleware/player-auth.middleware.js';

const router = Router();

// ── POST /api/player-auth/register — إنشاء حساب لاعب جديد ──
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { phone, password, name, gender, dob } = req.body;

    if (!phone || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'رقم الهاتف والاسم وكلمة المرور مطلوبون',
      });
    }

    if (password.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل',
      });
    }

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متوفرة' });

    // تحقق من التكرار
    const existing = await db.select().from(players).where(eq(players.phone, phone)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'رقم الهاتف مسجل مسبقاً — يرجى تسجيل الدخول',
      });
    }

    // إنشاء الحساب مع مكافأة ترحيبية 200 XP
    const passwordHash = await hashPlayerPassword(password);
    const result = await db.insert(players).values({
      phone,
      passwordHash,
      mustChangePassword: false,
      name,
      gender: gender || 'MALE',
      dob: dob || null,
      xp: 200,
      welcomeBonusApplied: true,
      lastActiveAt: new Date(),
    } as any).returning();

    const player = result[0];
    if (!player) {
      return res.status(500).json({ success: false, error: 'فشل في إنشاء الحساب' });
    }

    // إصدار Token
    const token = generatePlayerToken({
      playerId: player.id,
      phone: player.phone,
      name: player.name,
    });

    console.log(`🔐 New player registered: ${player.name} (${player.phone}) → ID: ${player.id} [+200 XP welcome bonus]`);

    // 🔔 Push للأدمنز (لاعب جديد)
    import('../services/fcm.service.js').then(({ sendPushToAdmins }) => {
      sendPushToAdmins('👤 لاعب جديد', `${player.name} (${player.phone}) سجّل في التطبيق`, 'new_booking', {
        targetId: `player-${player.id}`,
        url: '/admin/players',
      });
    }).catch(() => {});

    return res.json({
      success: true,
      token,
      welcomeBonus: 200,
      player: {
        id: player.id,
        playerId: player.id,
        phone: player.phone,
        name: player.name,
        gender: player.gender,
        dob: player.dob,
        mustChangePassword: false,
      },
    });
  } catch (err: any) {
    console.error('❌ Player register error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في إنشاء الحساب' });
  }
});

// ── POST /api/player-auth/login — تسجيل دخول ──
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        error: 'رقم الهاتف وكلمة المرور مطلوبان',
      });
    }

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متوفرة' });

    const result = await db.select().from(players).where(eq(players.phone, phone)).limit(1);
    const player = result[0];

    if (!player) {
      return res.status(401).json({
        success: false,
        error: 'رقم الهاتف أو كلمة المرور غير صحيحة',
      });
    }

    // التحقق من وجود كلمة سر
    if (!player.passwordHash) {
      return res.status(401).json({
        success: false,
        error: 'هذا الحساب لم يُنشَأ له كلمة سر بعد — يرجى التسجيل',
      });
    }

    const valid = await verifyPlayerPassword(password, player.passwordHash);
    if (!valid) {
      return res.status(401).json({
        success: false,
        error: 'رقم الهاتف أو كلمة المرور غير صحيحة',
      });
    }

    // تحديث آخر نشاط
    await db.update(players).set({ lastActiveAt: new Date() } as any).where(eq(players.id, player.id));

    // إصدار Token
    const token = generatePlayerToken({
      playerId: player.id,
      phone: player.phone,
      name: player.name,
    });

    console.log(`🔐 Player login: ${player.name} (${player.phone})${player.mustChangePassword ? ' [MUST CHANGE PASSWORD]' : ''}`);

    return res.json({
      success: true,
      token,
      player: {
        id: player.id,
        playerId: player.id,
        phone: player.phone,
        name: player.name,
        gender: player.gender,
        dob: player.dob,
        avatarUrl: player.avatarUrl,
        mustChangePassword: player.mustChangePassword || false,
      },
    });
  } catch (err: any) {
    console.error('❌ Player login error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في تسجيل الدخول' });
  }
});

// ── GET /api/player-auth/me — بيانات اللاعب الحالي ──
router.get('/me', authenticatePlayer, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متوفرة' });

    const result = await db.select().from(players).where(eq(players.id, req.playerAccount!.playerId)).limit(1);
    const player = result[0];

    if (!player) {
      return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });
    }

    // ── جلب بيانات الموظف المرتبط (إن وجد) ──
    let staffInfo: any = null;
    let staffToken: string | null = null;
    if ((player as any).linkedStaffId) {
      try {
        const { staff } = await import('../schemas/admin.schema.js');
        const { generateToken } = await import('../middleware/auth.js');
        const staffRows = await db.select({
          id: staff.id,
          username: staff.username,
          displayName: staff.displayName,
          role: staff.role,
          permissions: staff.permissions,
          photoUrl: staff.photoUrl,
          locationId: staff.locationId,
          isPartner: staff.isPartner,
        }).from(staff).where(eq(staff.id, (player as any).linkedStaffId)).limit(1);

        const staffRow = staffRows[0];
        if (staffRow) {
          staffInfo = {
            staffId: staffRow.id,
            username: staffRow.username,
            role: staffRow.role,
            displayName: staffRow.displayName,
            permissions: (staffRow.permissions as string[]) || [],
          };
          // إصدار staff token تلقائي (Auto-login)
          staffToken = generateToken({
            id: staffRow.id,
            username: staffRow.username,
            role: staffRow.role as any,
            displayName: staffRow.displayName,
          });
        }
      } catch (staffErr: any) {
        console.warn('⚠️ Failed to fetch linked staff:', staffErr.message);
      }
    }

    // البحث عن لعبة نشطة + ألعاب مجمدة
    let activeGame = null;
    const frozenGames: any[] = [];
    try {
      const { getAllGameStates } = await import('../config/redis.js');
      const allStates = await getAllGameStates();

      for (const state of allStates) {
        if (!state || state.phase === 'GAME_OVER') continue;
        const p = state.players?.find((pl: any) =>
          pl.playerId === player.id || pl.phone === player.phone
        );
        if (p) {
          const gameInfo = {
            roomId: state.roomId,
            roomCode: state.roomCode,
            gameName: state.config?.gameName,
            physicalId: p.physicalId,
            role: state.rolesConfirmed ? (p.role || null) : null,
            isAlive: p.isAlive,
            phase: state.phase,
          };

          if (p.frozen) {
            frozenGames.push(gameInfo);
          } else if (!activeGame) {
            activeGame = gameInfo;
          }
        }
      }
    } catch { /* Redis might be unavailable */ }

    return res.json({
      success: true,
      player: {
        id: player.id,
        playerId: player.id,
        phone: player.phone,
        name: player.name,
        gender: player.gender,
        dob: player.dob,
        avatarUrl: player.avatarUrl,
        email: player.email,
        totalMatches: player.totalMatches,
        totalWins: player.totalWins,
        totalSurvived: player.totalSurvived,
        mustChangePassword: player.mustChangePassword || false,
      },
      staffInfo,
      staffToken,
      activeGame,
      frozenGames,
    });
  } catch (err: any) {
    console.error('❌ Player /me error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في جلب البيانات' });
  }
});

// ── POST /api/player-auth/change-password — تغيير كلمة السر ──
router.post('/change-password', authenticatePlayer, async (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل',
      });
    }

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متوفرة' });

    const result = await db.select().from(players).where(eq(players.id, req.playerAccount!.playerId)).limit(1);
    const player = result[0];

    if (!player) {
      return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });
    }

    // إذا اللاعب لازم يغيّر كلمة السر (مهاجر) → ما نطلب كلمة السر القديمة
    if (!player.mustChangePassword) {
      if (!oldPassword) {
        return res.status(400).json({ success: false, error: 'كلمة المرور القديمة مطلوبة' });
      }

      if (player.passwordHash) {
        const valid = await verifyPlayerPassword(oldPassword, player.passwordHash);
        if (!valid) {
          return res.status(401).json({ success: false, error: 'كلمة المرور القديمة غير صحيحة' });
        }
      }
    }

    const newHash = await hashPlayerPassword(newPassword);
    await db.update(players)
      .set({ passwordHash: newHash, mustChangePassword: false } as any)
      .where(eq(players.id, player.id));

    // إصدار Token جديد
    const token = generatePlayerToken({
      playerId: player.id,
      phone: player.phone,
      name: player.name,
    });

    console.log(`🔐 Player #${player.id} changed password`);

    return res.json({
      success: true,
      token,
      message: 'تم تغيير كلمة المرور بنجاح',
    });
  } catch (err: any) {
    console.error('❌ Change password error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في تغيير كلمة المرور' });
  }
});

// ── POST /api/player-auth/migrate-welcome-bonus — منح 200 XP لكل اللاعبين القدامى (مرة واحدة) ──
router.post('/migrate-welcome-bonus', async (_req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });

    const { sql } = await import('drizzle-orm');

    // 1. إنشاء العمود إن لم يكن موجوداً
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS welcome_bonus_applied BOOLEAN DEFAULT false`);

    // 2. تحديث كل اللاعبين الذين لم يحصلوا على المكافأة بعد
    const result = await db.execute(sql`
      UPDATE players
      SET xp = COALESCE(xp, 0) + 200, welcome_bonus_applied = true
      WHERE welcome_bonus_applied = false OR welcome_bonus_applied IS NULL
      RETURNING id, name
    `);

    const rows = (result as any).rows || result || [];
    console.log(`🎁 Welcome bonus applied to ${rows.length} players`);

    return res.json({
      success: true,
      updatedCount: rows.length,
      players: rows.map((p: any) => `${p.name} (ID: ${p.id})`),
    });
  } catch (err: any) {
    console.error('❌ Welcome bonus migration error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
