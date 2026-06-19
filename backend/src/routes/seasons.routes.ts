// ══════════════════════════════════════════════════════
// 🏆 مسارات المواسم — Seasons Routes (admin)
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { authenticate, managerOrAbove } from '../middleware/auth.js';
import {
  listSeasons, getSeasonLeaderboard, getActiveRegularSeasonId, getActiveRegularSeason,
  startRegularSeason, startTournamentSeason, endSeason, renameSeason,
} from '../services/season.service.js';
import { getActiveRooms } from '../sockets/lobby.socket.js';

const router = Router();

// ── الموسم العادي النشط (عام — لواجهة اللاعب، بلا مصادقة) ──
router.get('/public/active', async (_req: Request, res: Response) => {
  try {
    const season = await getActiveRegularSeason();
    res.json({ success: true, season });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── قائمة المواسم العادية (عام — للتنقّل في واجهة اللاعب) ──
router.get('/public/list', async (_req: Request, res: Response) => {
  try {
    const all = await listSeasons();
    const regular = all
      .filter((s: any) => s.type === 'REGULAR')
      .map((s: any) => ({ id: s.id, name: s.name, seasonNumber: s.seasonNumber, status: s.status, startedAt: s.startedAt, endedAt: s.endedAt }));
    res.json({ success: true, seasons: regular });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── لوحة ترتيب موسم محدّد (عام — لواجهة اللاعب) ──
router.get('/public/:id/leaderboard', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    const rows = await getSeasonLeaderboard(id, Math.min(parseInt(req.query.limit as string) || 100, 200));
    // توحيد الشكل مع /leaderboard (playerId → id)
    const leaderboard = rows.map((r: any) => ({ id: r.playerId, ...r }));
    res.json({ success: true, leaderboard });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── قائمة كل المواسم ──
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, seasons: await listSeasons() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── الموسم العادي النشط ──
router.get('/active', authenticate, async (_req: Request, res: Response) => {
  try {
    const regularId = await getActiveRegularSeasonId();
    res.json({ success: true, activeRegularSeasonId: regularId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── لوحة ترتيب موسم محدّد ──
router.get('/:id/leaderboard', authenticate, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    res.json({ success: true, leaderboard: await getSeasonLeaderboard(id, limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── بدء موسم عادي جديد (يصفّر رانك الجميع) — يتطلّب عدم وجود مباريات جارية ──
router.post('/regular/start', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  try {
    const { name } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم الموسم مطلوب' });

    // 🛑 حارس: لا يُسمح ببدء موسم عادي جديد وهناك مباريات/غرف جارية
    const activeRooms = getActiveRooms().filter((r: any) => r && r.phase && r.phase !== 'GAME_OVER');
    if (activeRooms.length > 0) {
      return res.status(409).json({
        error: 'يجب إنهاء كل الفعاليات/المباريات الجارية أولاً قبل بدء موسم جديد',
        activeRooms: activeRooms.map((r: any) => ({ roomId: r.roomId, roomCode: r.roomCode, phase: r.phase, gameName: r.config?.gameName })),
      });
    }

    const userId = (req as any).user?.id;
    const season = await startRegularSeason(String(name).trim(), userId);
    res.json({ success: true, season, message: 'تم بدء الموسم العادي الجديد وتصفير الترتيب' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── بدء موسم بطولة لموقع (مستقل — لا يصفّر الرانك العادي) ──
router.post('/tournament/start', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  try {
    const { name, locationId } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم البطولة مطلوب' });
    if (!locationId || isNaN(parseInt(locationId))) return res.status(400).json({ error: 'موقع البطولة مطلوب' });
    const userId = (req as any).user?.id;
    const season = await startTournamentSeason(String(name).trim(), parseInt(locationId), userId);
    res.json({ success: true, season, message: 'تم بدء موسم البطولة' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── إعادة تسمية موسم ──
router.patch('/:id', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'اسم الموسم مطلوب' });
    await renameSeason(id, name);
    res.json({ success: true, message: 'تم تحديث اسم الموسم' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── إنهاء موسم (بطولة، أو إنهاء صريح) ──
router.post('/:id/end', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    await endSeason(id);
    res.json({ success: true, message: 'تم إنهاء الموسم' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
