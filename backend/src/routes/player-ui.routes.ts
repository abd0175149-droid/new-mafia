// ══════════════════════════════════════════════════════
// 📱 مفتاح «شاشة اللاعب الجديدة» — /api/player-ui (2026-11-06)
//
// قرار المالك: الواجهة الجديدة لهاتف اللاعب داخل الغرفة (زرّ «اللعبة» في منتصف
// الشريط السفليّ، شاشاتٌ متطابقة لكلّ الأدوار، الخاصّ بالضغط المطوّل) تُشغَّل
// أو تُطفأ لكلّ الغرف من الداشبورد. القراءة عامّة (قيمةٌ منطقيّة لا سرّ فيها —
// يسألها هاتف اللاعب)، والتبديل للأدمن. مخزَّن في wa_runtime_flags كمفتاح القمرة.
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { sql } from 'drizzle-orm';
import { authenticate, authorize } from '../middleware/auth.js';
import { getDB } from '../config/db.js';

const FLAG = 'player_ui_v2';
const rows = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);
const router = Router();

async function status() {
  const db = getDB();
  if (!db) return { enabled: false };
  const [r] = rows(await db.execute(sql`SELECT value FROM wa_runtime_flags WHERE key = ${FLAG} LIMIT 1`));
  const v = r?.value || {};
  return { enabled: v.enabled === true, by: v.by || '', at: v.at || null };
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const s = await status();
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, enabled: s.enabled });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/admin', authenticate, async (_req: Request, res: Response) => {
  try { res.json({ success: true, ...(await status()) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'enabled مطلوب (true/false)' });
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const by = req.user?.displayName || req.user?.username || '';
    await db.execute(sql`INSERT INTO wa_runtime_flags (key, value, updated_at)
      VALUES (${FLAG}, ${JSON.stringify({ enabled: req.body.enabled, by, at: new Date().toISOString() })}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`);
    res.json({ success: true, ...(await status()) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
