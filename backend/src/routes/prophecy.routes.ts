// ══════════════════════════════════════════════════════
// 🔮 موسم النبوءة · السجلّات — /api/prophecy
//
//   GET /ledger            عامّ: سجلّ المخطوطتين لكلّ مدينة في الموسم العادي النشط بمحتوى النبوءة.
//                          سرٌّ حتّى الأسبوع الثامن (قرار ٢٠/٣٤): قبلها { hidden: true, revealAt } وحده.
//   GET /my-scroll         للّاعب: «مخطوطتك» — كم مرّةً صدّق الحقيقة وكم مرّةً صدّق القناع (له وحده)،
//                          و«صاحب العين» في مدينته إن كان الأعلى.
//   GET /admin/metrics     للإدارة: مقاييس كلّ كرت ونطاقها المقبول (المراجعة بعد ٣٠ و٨٠ و١٥٠ مباراة).
//
// بلا موسم نبوءةٍ نشط: السجلّ والمخطوطة فارغان، والمقاييس تقرأ مباريات التجربة نفسها (كلّ الصفوف).
// ══════════════════════════════════════════════════════
import { Router, type Request, type Response } from 'express';
import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { authenticatePlayer } from '../middleware/player-auth.middleware.js';

const router = Router();
const REVEAL_DAYS = 7 * 7;   // يُعلن السجلّ أوّل الأسبوع الثامن
const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : r?.rows || []);

async function prophecySeason(): Promise<{ id: number; startedAt: Date } | null> {
  const db = getDB(); if (!db) return null;
  const r = rowsOf(await db.execute(sql`SELECT id, started_at FROM seasons WHERE status = 'ACTIVE' AND type = 'REGULAR' AND content_pack = 'PROPHECY' ORDER BY started_at DESC LIMIT 1`));
  return r[0] ? { id: Number(r[0].id), startedAt: new Date(r[0].started_at) } : null;
}

// 📜 سطرُ الافتتاح (قرار ٣٣): الموجّه يفتتح كلّ لعبةٍ بسطر الأسبوع — بلا موسمٍ نشط الأسبوع الأوّل
router.get('/week', async (_req: Request, res: Response) => {
  try {
    const { seasonWeek, WEEK_LINES } = await import('../game/prophecy-content.js');
    const s = await prophecySeason();
    const week = seasonWeek(s?.startedAt ?? null);
    res.json({ success: true, active: !!s, week, line: WEEK_LINES[week - 1] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/ledger', async (_req: Request, res: Response) => {
  try {
    const db = getDB(); if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const s = await prophecySeason();
    if (!s) return res.json({ success: true, active: false, cities: [] });
    const revealAt = new Date(s.startedAt.getTime() + REVEAL_DAYS * 86400000);
    if (Date.now() < revealAt.getTime()) return res.json({ success: true, active: true, hidden: true, revealAt });
    const rows = rowsOf(await db.execute(sql`
      SELECT l.city_id, c.name AS city_name,
             SUM(CASE WHEN l.line = 'TRUTH' THEN 1 ELSE 0 END)::int AS truth,
             SUM(CASE WHEN l.line = 'MASK' THEN 1 ELSE 0 END)::int AS mask,
             SUM(l.withdrawn)::int AS withdrawn
      FROM prophecy_ledger l LEFT JOIN cities c ON c.id = l.city_id
      WHERE l.season_id = ${s.id} AND NOT l.is_test GROUP BY l.city_id, c.name ORDER BY truth DESC`));
    // «ما سُحب» عمودٌ ثالث سرّيّ يُعلن في الختام وحده
    res.json({ success: true, active: true, hidden: false, cities: rows.map((r: any) => ({ cityId: r.city_id, cityName: r.city_name, truth: r.truth, mask: r.mask })) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/my-scroll', authenticatePlayer, async (req: Request, res: Response) => {
  try {
    const db = getDB(); if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const playerId = (req as any).player?.playerId ?? (req as any).player?.id;
    if (!playerId) return res.status(401).json({ error: 'غير مصرّح' });
    const s = await prophecySeason();
    if (!s) return res.json({ success: true, active: false });
    const [mine] = rowsOf(await db.execute(sql`SELECT COALESCE(SUM(truth),0)::int AS truth, COALESCE(SUM(mask),0)::int AS mask FROM prophecy_marks WHERE player_id = ${playerId} AND season_id = ${s.id}`));
    // 👁️ «صاحب العين»: الأعلى صدقاً في مدينته (٥ علاماتٍ على الأقلّ) — بلا لقبٍ سلبيّ لأحد
    const eye = rowsOf(await db.execute(sql`
      WITH t AS (SELECT city_id, player_id, SUM(truth) AS tr, SUM(mask) AS mk FROM prophecy_marks WHERE season_id = ${s.id} GROUP BY city_id, player_id HAVING SUM(truth) + SUM(mask) >= 5),
           r AS (SELECT city_id, player_id, RANK() OVER (PARTITION BY city_id ORDER BY tr::float / NULLIF(tr + mk, 0) DESC, tr DESC) AS rk FROM t)
      SELECT city_id FROM r WHERE player_id = ${playerId} AND rk = 1`));
    res.json({ success: true, active: true, truth: mine?.truth ?? 0, mask: mine?.mask ?? 0, eyeOfCities: eye.map((x: any) => x.city_id) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── المقاييس ونطاقاتها المقبولة (من المراجعة) ──
const RANGES: Record<string, { min: number; max: number; label: string }> = {
  dividedCross: { min: 35, max: 65, label: 'نسبة عبور المنقسم إلى المافيا' },
  prophecyTrue: { min: 40, max: 70, label: 'النبوءات الصادقة من التي مرّت' },
  maskBurned: { min: 30, max: 80, label: 'أقنعةٌ قُرئت' },
  frameLanded: { min: 10, max: 40, label: 'تلفيقٌ نافذ من الأقنعة المحترقة' },
  cupDeparted: { min: 15, max: 45, label: 'رحيل القارئة فائزة' },
  kafalaSaved: { min: 40, max: 75, label: 'كفالاتٌ أنقذت بريئاً' },
  mafiaWin: { min: 40, max: 55, label: 'فوز المافيا في مباريات النبوءة' },
};

router.get('/admin/metrics', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try {
    const db = getDB(); if (!db) return res.status(503).json({ error: 'DB unavailable' });
    // مباريات التجربة داخلةٌ هنا عمداً: المراجعة الأولى تُقرأ منها
    const rows = rowsOf(await db.execute(sql`SELECT l.summary, l.line, l.is_test, m.winner FROM prophecy_ledger l LEFT JOIN matches m ON m.id = l.match_id ORDER BY l.match_id DESC LIMIT 2000`));
    const n = rows.length;
    let dv = 0, dvCross = 0, pp = 0, ppTrue = 0, masks = 0, burned = 0, framed = 0, cup = 0, cupDep = 0, kaf = 0, kafSaved = 0, mafiaWins = 0, truthLines = 0;
    for (const r of rows) {
      const s = r.summary || {};
      if (s.divided?.choice) { dv++; if (s.divided.choice === 'MAFIA') dvCross++; }
      if (s.oracle && (s.oracle.outcome === 'TRUE' || s.oracle.outcome === 'FALSE')) { pp++; if (s.oracle.outcome === 'TRUE') ppTrue++; }
      for (const m of s.masks || []) { masks++; if (m.burned) { burned++; if (m.executedBecauseOfMask) framed++; } }
      if (s.cup) { cup++; if (s.cup.departed) cupDep++; }
      if (s.guarantor?.used) { kaf++; if (s.guarantor.result?.outcome === 'SAVED') kafSaved++; }
      if (r.winner === 'MAFIA') mafiaWins++;
      if (r.line === 'TRUTH') truthLines++;
    }
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
    const metrics = {
      dividedCross: { value: pct(dvCross, dv), n: dv },
      prophecyTrue: { value: pct(ppTrue, pp), n: pp },
      maskBurned: { value: pct(burned, masks), n: masks },
      frameLanded: { value: pct(framed, burned), n: burned },
      cupDeparted: { value: pct(cupDep, cup), n: cup },
      kafalaSaved: { value: pct(kafSaved, kaf), n: kaf },
      mafiaWin: { value: pct(mafiaWins, n), n },
    };
    const out = Object.entries(metrics).map(([k, v]) => ({
      key: k, label: RANGES[k].label, value: v.value, n: v.n, min: RANGES[k].min, max: RANGES[k].max,
      status: v.value == null ? 'NO_DATA' : v.value < RANGES[k].min ? 'LOW' : v.value > RANGES[k].max ? 'HIGH' : 'OK',
    }));
    // نقاط المراجعة: ٣٠ و٨٠ و١٥٠ مباراة
    const checkpoints = [30, 80, 150].map(c => ({ at: c, reached: n >= c }));
    res.json({ success: true, matches: n, trialMatches: rows.filter((r: any) => r.is_test).length, truthLines, maskLines: n - truthLines, metrics: out, checkpoints });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
