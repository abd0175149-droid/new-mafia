// ══════════════════════════════════════════════════════
// 🕵️ مسارات لوحة مكافحة الغش (Admin) — كشفٌ إحصائيّ + مراجعة بشريّة
// ══════════════════════════════════════════════════════
import { Router, type Request, type Response } from 'express';
import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { computeAnticheatOverview } from '../services/anticheat.service.js';

const router = Router();

// ── GET /overview — درجات المخاطر والأزواج المشتبهة + حالات المراجعة ──
router.get('/overview', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const sinceDays = Number.isFinite(parseInt(String(req.query.sinceDays)))
      ? parseInt(String(req.query.sinceDays)) : undefined;
    const overview = await computeAnticheatOverview({ sinceDays });

    // دمج حالات المراجعة المحفوظة (watching | cleared | flagged)
    const db = getDB();
    const reviews = db
      ? ((await db.execute(sql`SELECT player_id, status, note FROM cheat_reviews`)) as any).rows ?? []
      : [];
    const rmap = new Map<number, any>(reviews.map((r: any) => [Number(r.player_id), r]));
    const players = overview.players.map(p => ({
      ...p,
      review: rmap.get(p.playerId)?.status ?? null,
      note: rmap.get(p.playerId)?.note ?? '',
    }));

    res.json({ success: true, overview: { ...overview, players } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /room/:roomId/signals — إشاراتُ غرفةٍ واحدة لإعادة بناء لوحة الليدر ──
// لوحة المراقبة تُبنى من بثّ السوكِت، فكان تحديث صفحة الليدر (أو فتحها من جهازٍ
// ثانٍ) يمحو سجلّ المباراة كلّه. هنا تُعاد الإشارات المخزّنة بنفس شكل حمولة
// `leader:cheat-signal` تماماً، فتمرّ في نفس مُخفِّض الواجهة بلا منطقٍ ثانٍ.
// متاحةٌ لكلّ موظّف (ليدر/مدير/أدمن) — لا adminOnly: الليدر هو المستهلك الأصليّ.
router.get('/room/:roomId/signals', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const roomId = String(req.params.roomId || '');
    if (!roomId) return res.status(400).json({ error: 'roomId مطلوب' });
    const limit = Math.min(parseInt(String(req.query.limit)) || 500, 2000);

    const r: any = await db.execute(sql`
      SELECT physical_id, player_name, role, team, kind, weight, details, created_at
      FROM cheat_signals
      WHERE room_id = ${roomId}
      ORDER BY created_at ASC
      LIMIT ${limit}
    `);
    const rows: any[] = r?.rows ?? (Array.isArray(r) ? r : []);

    const teamArOf = (t: string) => (t === 'MAFIA' ? 'المافيا' : t === 'NEUTRAL' ? 'محايد' : 'المواطنون');
    // النصّ العربيّ لا يُخزَّن في الصفّ (يذهب لسجلّ العمليّات) — يُعاد بناؤه من النوع والمدّة
    const labelOf = (kind: string, d: any) => {
      const secs = Math.round((Number(d?.durationMs) || 0) / 1000);
      if (kind === 'app_left') return d?.secretOpen ? 'خرج من التطبيق وشاشة السرّ مفتوحة' : 'خرج من التطبيق (لم يعد بعد)';
      if (kind === 'app_departure') {
        return d?.secretOpen
          ? `غادر التطبيق وشاشة السرّ مفتوحة${secs ? ` (${secs}ث)` : ''}`
          : `غادر التطبيق أثناء المباراة${secs ? ` (${secs}ث)` : ''}`;
      }
      if (kind === 'screenshot') return '📸 التقط لقطة شاشة أثناء المباراة';
      if (kind === 'screen_recording') return '🎥 تسجيل شاشة نشط أثناء المباراة';
      return 'سلوكٌ مريب';
    };

    const signals = rows.map((x: any) => {
      const details = x.details || {};
      // ⚠️ الوقت من قاعدة البيانات لا من العميل — والمخفِّض يتوقّع epoch ms
      const at = new Date(x.created_at).getTime();
      return {
        roomId, physicalId: Number(x.physical_id), kind: x.kind,
        weight: Number(x.weight) || 0,
        labelAr: labelOf(String(x.kind), details), name: x.player_name,
        role: x.role, team: x.team, teamAr: teamArOf(String(x.team || '')),
        avatarUrl: null, details, at,
      };
    });

    res.json({ success: true, signals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /review — تعليم حالة لاعب (مراقبة/بريء/موسوم) ──
router.post('/review', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const playerId = parseInt(String(req.body?.playerId));
  const status = String(req.body?.status || '');
  const note = String(req.body?.note || '').slice(0, 500);
  if (!Number.isFinite(playerId)) return res.status(400).json({ error: 'معرّف لاعب غير صالح' });
  if (!['watching', 'cleared', 'flagged', 'none'].includes(status)) {
    return res.status(400).json({ error: 'حالة غير معروفة' });
  }
  try {
    if (status === 'none') {
      await db.execute(sql`DELETE FROM cheat_reviews WHERE player_id = ${playerId}`);
    } else {
      await db.execute(sql`
        INSERT INTO cheat_reviews (player_id, status, note, reviewed_by, reviewed_at)
        VALUES (${playerId}, ${status}, ${note}, ${req.user!.id}, NOW())
        ON CONFLICT (player_id) DO UPDATE
          SET status = ${status}, note = ${note}, reviewed_by = ${req.user!.id}, reviewed_at = NOW()`);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
