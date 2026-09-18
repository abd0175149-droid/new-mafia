// ══════════════════════════════════════════════════════
// 🎟️ بطاقة الولاء — المسارات
//   /api/loyalty/me/*        → اللاعب (authenticatePlayer)
//   /api/loyalty/admin/*     → الإدارة (admin, manager)
//   /api/loyalty/venue/*     → شاشة المكان (authenticate)
// عند إيقاف الميزة: مسارات اللاعب تعيد {enabled:false} فقط — لا تفاصيل.
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { authenticate, managerOrAbove } from '../middleware/auth.js';
import { authenticatePlayer } from '../middleware/player-auth.middleware.js';
import { logStaffAction } from '../services/staff-action-log.service.js';
import {
  getLoyaltyConfig, saveLoyaltyConfig, getMyLoyalty, chooseReward, currentPeriod,
  adminOverview, adminPlayers, adminPlayerDetail, manualStamp, voidStamp, adminRewards, voidReward, manualRedeem, simulate, statusForPlayers,
} from '../services/loyalty.service.js';
import { LOYALTY_REWARD_KINDS } from '../schemas/loyalty.schema.js';

const router = Router();
const periodParam = (q: any) => (typeof q === 'string' && /^\d{4}-\d{2}$/.test(q)) ? q : currentPeriod();

// ── 📱 اللاعب ──
router.get('/me', authenticatePlayer, async (req: Request, res: Response) => {
  const pid = (req as any).playerAccount?.playerId;
  if (!pid) return res.status(401).json({ error: 'غير مصادق' });
  try { res.json(await getMyLoyalty(pid)); }
  catch (e: any) { console.error('❌ loyalty/me:', e.message); res.status(500).json({ error: e.message }); }
});

router.post('/me/rewards/:id/choose', authenticatePlayer, async (req: Request, res: Response) => {
  const pid = (req as any).playerAccount?.playerId;
  if (!pid) return res.status(401).json({ error: 'غير مصادق' });
  const id = parseInt(req.params.id); const kind = String(req.body?.kind || '');
  if (!Number.isFinite(id) || !(LOYALTY_REWARD_KINDS as readonly string[]).includes(kind)) return res.status(400).json({ error: 'طلب غير صالح' });
  try {
    const cfg = await getLoyaltyConfig();
    if (!cfg.enabled) return res.status(404).json({ enabled: false, error: 'الميزة متوقّفة' });
    const r = await chooseReward(pid, id, kind as any);
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ success: true, reward: r.reward, me: await getMyLoyalty(pid) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── 🏪 المكان: شارات لاعبي الليلة ──
router.get('/venue/status', authenticate, async (req: Request, res: Response) => {
  const ids = String(req.query.playerIds || '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 200);
  const m = await statusForPlayers(ids);
  const out: Record<string, any> = {}; m.forEach((v, k) => { out[k] = v; });
  res.json({ enabled: m.size > 0 || (await getLoyaltyConfig()).enabled, players: out });
});

// ── 🛠️ الإدارة ──
router.use('/admin', authenticate, managerOrAbove);

router.get('/admin/config', async (_req: Request, res: Response) => { res.json(await getLoyaltyConfig()); });

router.put('/admin/config', async (req: Request, res: Response) => {
  try {
    const before = await getLoyaltyConfig();
    const next = await saveLoyaltyConfig(req.body || {});
    void logStaffAction({
      staffId: (req as any).user?.id, staffUsername: (req as any).user?.username, staffRole: (req as any).user?.role, source: 'rest',
      action: before.enabled !== next.enabled ? 'rest:loyalty-toggle' : 'rest:loyalty-config-save',
      details: { enabled: next.enabled, stampsPerReward: next.stampsPerReward, minLeadHours: next.minLeadHours, maxRewardsPerMonth: next.maxRewardsPerMonth, rewards: next.rewards, locationIds: next.locationIds },
    });
    res.json(next);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/admin/overview', async (req: Request, res: Response) => {
  try { res.json(await adminOverview(periodParam(req.query.period), req.query.locationId ? Number(req.query.locationId) : null)); }
  catch (e: any) { console.error('❌ loyalty overview:', e.message); res.status(500).json({ error: e.message }); }
});

router.get('/admin/players', async (req: Request, res: Response) => {
  try {
    res.json(await adminPlayers(periodParam(req.query.period), {
      q: String(req.query.q || ''), filter: String(req.query.filter || 'all'),
      locationId: req.query.locationId ? Number(req.query.locationId) : null,
      page: Number(req.query.page) || 1, size: Number(req.query.size) || 20,
    }));
  } catch (e: any) { console.error('❌ loyalty players:', e.message); res.status(500).json({ error: e.message }); }
});

router.get('/admin/players/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
  try {
    const d = await adminPlayerDetail(id, periodParam(req.query.period));
    if (!d) return res.status(404).json({ error: 'اللاعب غير موجود' });
    res.json(d);
  } catch (e: any) { console.error('❌ loyalty player:', e.message); res.status(500).json({ error: e.message }); }
});

router.post('/admin/players/:id/stamps', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id); const activityId = Number(req.body?.activityId); const note = String(req.body?.note || '');
  if (!Number.isFinite(id) || !Number.isFinite(activityId)) return res.status(400).json({ error: 'طلب غير صالح' });
  const r = await manualStamp(id, activityId, (req as any).user?.id, note);
  if (!r.ok) return res.status(400).json({ error: r.error });
  void logStaffAction({ staffId: (req as any).user?.id, staffUsername: (req as any).user?.username, staffRole: (req as any).user?.role, source: 'rest', action: 'rest:loyalty-stamp-manual', activityId, details: { playerId: id, stampId: r.stampId, rewardId: r.rewardId, note } });
  res.json({ success: true, ...r });
});

router.post('/admin/stamps/:id/void', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id); const reason = String(req.body?.reason || '');
  const r = await voidStamp(id, (req as any).user?.id, reason);
  if (!r.ok) return res.status(400).json({ error: r.error });
  void logStaffAction({ staffId: (req as any).user?.id, staffUsername: (req as any).user?.username, staffRole: (req as any).user?.role, source: 'rest', action: 'rest:loyalty-stamp-void', details: { stampId: id, reason } });
  res.json({ success: true });
});

router.get('/admin/rewards', async (req: Request, res: Response) => {
  try {
    res.json(await adminRewards({ period: req.query.period === 'all' ? undefined : periodParam(req.query.period), status: String(req.query.status || 'all'), kind: String(req.query.kind || 'all'), page: Number(req.query.page) || 1, size: Number(req.query.size) || 30 }));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/rewards/:id/void', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id); const reason = String(req.body?.reason || '');
  const r = await voidReward(id, (req as any).user?.id, reason);
  if (!r.ok) return res.status(400).json({ error: r.error });
  void logStaffAction({ staffId: (req as any).user?.id, staffUsername: (req as any).user?.username, staffRole: (req as any).user?.role, source: 'rest', action: 'rest:loyalty-reward-void', details: { rewardId: id, reason } });
  res.json({ success: true });
});

router.post('/admin/rewards/:id/redeem', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id); const note = String(req.body?.note || '');
  const r = await manualRedeem(id, (req as any).user?.id, note);
  if (!r.ok) return res.status(400).json({ error: r.error });
  void logStaffAction({ staffId: (req as any).user?.id, staffUsername: (req as any).user?.username, staffRole: (req as any).user?.role, source: 'rest', action: 'rest:loyalty-reward-redeem', details: { rewardId: id, note } });
  res.json({ success: true });
});

router.post('/admin/rewards/:id/choose', async (req: Request, res: Response) => {
  // اختيارٌ بالنيابة (لاعب بلا هاتف / طلب شفويّ) — بالحساب نفسه
  const id = parseInt(req.params.id); const playerId = Number(req.body?.playerId); const kind = String(req.body?.kind || '');
  if (!Number.isFinite(id) || !Number.isFinite(playerId) || !(LOYALTY_REWARD_KINDS as readonly string[]).includes(kind)) return res.status(400).json({ error: 'طلب غير صالح' });
  const r = await chooseReward(playerId, id, kind as any, { staffId: (req as any).user?.id });
  if (!r.ok) return res.status(400).json({ error: r.error });
  void logStaffAction({ staffId: (req as any).user?.id, staffUsername: (req as any).user?.username, staffRole: (req as any).user?.role, source: 'rest', action: 'rest:loyalty-reward-redeem', details: { rewardId: id, playerId, kind, byStaff: true } });
  res.json({ success: true, reward: r.reward });
});

router.get('/admin/simulate', async (req: Request, res: Response) => {
  const hours = Number(req.query.hours); if (!Number.isFinite(hours) || hours < 0 || hours > 168) return res.status(400).json({ error: 'ساعات غير صالحة' });
  try { res.json(await simulate(periodParam(req.query.period), hours, req.query.locationId ? Number(req.query.locationId) : null)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
