// ══════════════════════════════════════════════════════
// 🕴️ جولة «الليلة الأولى» — /api/player-guide (2026-11-15)
//
// قرار المالك: جولةٌ تعلّم اللاعبَ التطبيقَ من أوّل فتحة حتى نهاية أوّل لعبة، تُدعى إليها
// الحساباتُ الجديدة ومن كان آخر نشاطه قبل ١ تشرين الثاني ٢٠٢٦، وتُشغَّل أو تُطفأ من
// الداشبورد («مفاتيح النظام»). الغرفةُ التدريبيّة تُحاكى على الهاتف كلّها — لا شيء منها
// يمرّ بمحرّك اللعبة ولا بالرتب ولا بالتقارير؛ الخادم يحفظ هنا حالةَ الجولة وحدها.
//
// 🔴 الأهليّة لقطةٌ لا قراءةٌ حيّة: `last_active_at` يُختم مع كلّ طلبٍ مصادَق (ومنها هذا
//    الطلب نفسه)، ففحصُه هنا لا يجد «عائداً» واحداً. اللقطةُ تؤخذ مرّةً في deploy.sh
//    وتُكتب في `guide_due`. والحسابُ الذي أُنشئ بعدها (guide_due = NULL) يُقيَّم عند أوّل
//    سؤال: لم يلعب مباراةً قط ⇒ جديد.
//
// القراءة العامّة قيمةٌ منطقيّة لا سرّ فيها (يسألها هاتف اللاعب قبل أيّ شيء)، والتبديل للأدمن.
// المفتاح مخزَّن في wa_runtime_flags كمفتاح شاشة اللاعب.
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { sql } from 'drizzle-orm';
import { authenticate, authorize } from '../middleware/auth.js';
import { authenticatePlayer } from '../middleware/player-auth.middleware.js';
import { getDB } from '../config/db.js';

const FLAG = 'first_night_guide';
const rows = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);
const router = Router();

async function flag() {
  const db = getDB();
  if (!db) return { enabled: false, by: '', at: null as string | null };
  const [r] = rows(await db.execute(sql`SELECT value FROM wa_runtime_flags WHERE key = ${FLAG} LIMIT 1`));
  const v = r?.value || {};
  return { enabled: v.enabled === true, by: v.by || '', at: v.at || null };
}

/** أعدادٌ للداشبورد: من يُدعى، ومن أتمّ، ومن توقّف. تعود أصفاراً قبل الترحيل. */
async function stats() {
  const db = getDB();
  const zero = { due: 0, done: 0, started: 0, deferred: 0 };
  if (!db) return zero;
  try {
    const [r] = rows(await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE guide_due IS TRUE AND guide_done_at IS NULL
                           AND linked_staff_id IS NULL AND NOT COALESCE(is_test_account, false))::int AS due,
        COUNT(*) FILTER (WHERE guide_done_at IS NOT NULL)::int AS done,
        COUNT(*) FILTER (WHERE guide_started_at IS NOT NULL AND guide_done_at IS NULL AND guide_deferred_at IS NULL)::int AS started,
        COUNT(*) FILTER (WHERE guide_deferred_at IS NOT NULL AND guide_done_at IS NULL)::int AS deferred
      FROM players
      WHERE anonymized_at IS NULL AND merged_into_id IS NULL AND deleted_at IS NULL`));
    return { due: r?.due ?? 0, done: r?.done ?? 0, started: r?.started ?? 0, deferred: r?.deferred ?? 0 };
  } catch { return zero; }
}

// ── عامّ: هل الجولة تعمل؟ ──
router.get('/', async (_req: Request, res: Response) => {
  try {
    const f = await flag();
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, enabled: f.enabled });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── الداشبورد ──
router.get('/admin', authenticate, async (_req: Request, res: Response) => {
  try { res.json({ success: true, ...(await flag()), stats: await stats() }); }
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
    res.json({ success: true, ...(await flag()), stats: await stats() });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── حالةُ جولة هذا اللاعب ──
const OFF = { success: true, enabled: false, required: false, status: 'new', step: null, returning: false };

router.get('/me', authenticatePlayer, async (req: Request, res: Response) => {
  const pid = Number((req as any).playerAccount?.playerId);
  const db = getDB();
  res.set('Cache-Control', 'no-store');
  if (!db || !pid) return res.json(OFF);
  try {
    const f = await flag();
    if (!f.enabled) return res.json(OFF);
    const [r] = rows(await db.execute(sql`
      SELECT guide_due, guide_step, guide_started_at, guide_deferred_at, guide_done_at,
             linked_staff_id, COALESCE(is_test_account, false) AS is_test,
             COALESCE(lifetime_matches, 0) AS lifetime_matches
      FROM players WHERE id = ${pid} LIMIT 1`));
    if (!r) return res.json(OFF);

    // حسابٌ أُنشئ بعد اللقطة: يُقيَّم مرّةً واحدة — لم يلعب قط ⇒ جديد
    let due: boolean = r.guide_due === true;
    if (r.guide_due === null || r.guide_due === undefined) {
      due = Number(r.lifetime_matches) === 0;
      await db.execute(sql`UPDATE players SET guide_due = ${due} WHERE id = ${pid} AND guide_due IS NULL`);
    }

    const done = !!r.guide_done_at;
    // 🔴 الموظّفون وحسابات الاختبار لا يُدعون تلقائيّاً — يجدونها في «حسابي»
    const excluded = !!r.linked_staff_id || r.is_test === true;
    res.json({
      success: true,
      enabled: true,
      required: due && !done && !excluded,
      status: done ? 'done' : r.guide_deferred_at ? 'deferred' : r.guide_started_at ? 'started' : 'new',
      step: r.guide_step || null,
      // «عائد» = له تاريخُ لعب؛ دعوتُه تقول ما الجديد لا «أهلاً بك»
      returning: Number(r.lifetime_matches) > 0,
    });
  } catch (err: any) {
    // قبل أن يُرحَّل الجدول (ثوانٍ بعد النشر): الجولة مطفأةٌ عمليّاً، لا خطأ يراه اللاعب
    console.warn('⚠️ player-guide/me:', err.message);
    res.json(OFF);
  }
});

const STEP_RE = /^[a-z0-9:_-]{1,40}$/;

router.post('/me', authenticatePlayer, async (req: Request, res: Response) => {
  const pid = Number((req as any).playerAccount?.playerId);
  const db = getDB();
  if (!db || !pid) return res.status(503).json({ error: 'DB unavailable' });
  const action = String(req.body?.action || '');
  const step = typeof req.body?.step === 'string' && STEP_RE.test(req.body.step) ? req.body.step : null;
  try {
    if (action === 'start') {
      await db.execute(sql`UPDATE players
        SET guide_started_at = COALESCE(guide_started_at, NOW()), guide_deferred_at = NULL,
            guide_step = COALESCE(${step}, guide_step)
        WHERE id = ${pid}`);
    } else if (action === 'step') {
      if (!step) return res.status(400).json({ error: 'step غير صالح' });
      await db.execute(sql`UPDATE players SET guide_step = ${step},
            guide_started_at = COALESCE(guide_started_at, NOW()) WHERE id = ${pid}`);
    } else if (action === 'defer') {
      await db.execute(sql`UPDATE players SET guide_deferred_at = NOW() WHERE id = ${pid} AND guide_done_at IS NULL`);
    } else if (action === 'done') {
      await db.execute(sql`UPDATE players
        SET guide_done_at = COALESCE(guide_done_at, NOW()), guide_deferred_at = NULL, guide_step = 'done',
            guide_started_at = COALESCE(guide_started_at, NOW())
        WHERE id = ${pid}`);
    } else {
      return res.status(400).json({ error: 'action غير معروف' });
    }
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
