// ══════════════════════════════════════════════════════
// 🎮 Player Routes — البحث والتسجيل للاعبين
// يُستخدم من واجهة اللاعب (PlayerFlow) للبحث برقم الهاتف
// والتسجيل المبدئي قبل الانضمام للغرفة عبر Socket
// ══════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { getDB } from '../config/db.js';
import { sessionPlayers } from '../schemas/game.schema.js';
import { eq, desc } from 'drizzle-orm';

const router = Router();

// ── POST /api/player/lookup — البحث عن لاعب برقم الهاتف ──
router.post('/lookup', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ found: false, error: 'Database not ready' });

    const { phone } = req.body;
    if (!phone) {
      return res.json({ found: false, player: null });
    }

    // نبحث عن آخر مرة سجل فيها هذا الرقم
    const results = await db
      .select()
      .from(sessionPlayers)
      .where(eq(sessionPlayers.phone, phone))
      .orderBy(desc(sessionPlayers.id))
      .limit(1);

    if (results.length > 0) {
      const p = results[0];
      return res.json({
        found: true,
        player: {
          id: p.id,
          displayName: p.playerName,
          phone: p.phone,
          gender: p.gender,
          dateOfBirth: p.dateOfBirth,
        },
      });
    }

    return res.json({ found: false, player: null });
  } catch (err: any) {
    console.error('❌ Player lookup error:', err.message);
    return res.status(500).json({ found: false, error: 'خطأ في البحث' });
  }
});

// ── POST /api/player/register — تسجيل لاعب جديد (مبدئي) ──
// لا يحفظ بقاعدة البيانات — فقط يُرجع بيانات اللاعب
// الحفظ الفعلي يتم وقت الانضمام للغرفة عبر Socket (room:join)
router.post('/register', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });

    const { phone, displayName, dateOfBirth, gender } = req.body;

    if (!phone || !displayName) {
      return res.status(400).json({ success: false, error: 'الاسم ورقم الهاتف مطلوبان' });
    }

    // نتحقق أولاً إذا اللاعب موجود مسبقاً
    const existing = await db
      .select()
      .from(sessionPlayers)
      .where(eq(sessionPlayers.phone, phone))
      .orderBy(desc(sessionPlayers.id))
      .limit(1);

    if (existing.length > 0) {
      const p = existing[0];
      return res.json({
        success: true,
        player: {
          id: p.id,
          displayName: p.playerName,
          phone: p.phone,
        },
      });
    }

    // لاعب جديد — نرجع بياناته بدون حفظ (الحفظ وقت الانضمام)
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

export default router;
