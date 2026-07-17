// ══════════════════════════════════════════════════════
// 📋 مسارات متابعة الحجوزات — Reservations Tracker Routes
// CRUD مستقل تماماً عن نظام الحجوزات المالي (bookings)
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc, and, isNull, inArray, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { reservations, activities, locations } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { authenticate } from '../middleware/auth.js';

const RANK_ORDER: Record<string, number> = { GODFATHER: 5, UNDERBOSS: 4, CAPO: 3, SOLDIER: 2, INFORMANT: 1 };

const router = Router();

// يطبّع الهاتف ويعيد لاعباً مطابقاً تماماً (بصفرٍ بادئ أو بدونه) — لربط الحجز بحساب مسجّل تلقائياً
async function findPlayerByPhone(db: any, phone: string): Promise<number | null> {
  const p = String(phone || '').replace(/[\s-]/g, '');
  if (p.length < 6) return null;
  const candidates = p.startsWith('0') ? [p, p.slice(1)] : [p, `0${p}`];
  try {
    const [row] = await db.select({ id: players.id }).from(players).where(inArray(players.phone, candidates)).limit(1);
    return row?.id ?? null;
  } catch { return null; }
}

// GET /api/reservations?activityId=
router.get('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const conditions: any[] = [isNull(reservations.deletedAt)];

  if (req.query.activityId && req.query.activityId !== 'all') {
    conditions.push(eq(reservations.activityId, parseInt(req.query.activityId as string)));
  }

  let query = db.select().from(reservations).orderBy(desc(reservations.createdAt)).$dynamic();
  if (conditions.length === 1) {
    query = query.where(conditions[0]);
  } else if (conditions.length > 1) {
    query = query.where(and(...conditions));
  }

  const rows = await query;
  res.json(rows);
});

// POST /api/reservations
router.post('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { activityId, contactName, contactMethod, phone, peopleCount, notes, playerId } = req.body;
  if (!contactName) return res.status(400).json({ error: 'اسم الشخص مطلوب' });

  const createdByName = req.user?.displayName || req.user?.username || '';

  // 🔗 الربط الذكي: مُعرّف اللاعب المُرسَل صراحةً، وإلّا مطابقة الهاتف تلقائياً بحساب مسجّل
  let linkedPlayerId: number | null = playerId ? Number(playerId) : null;
  if (!linkedPlayerId && phone) linkedPlayerId = await findPlayerByPhone(db, phone);

  const result = await db.insert(reservations).values({
    activityId: activityId || null,
    contactName,
    contactMethod: contactMethod || '',
    phone: phone || '',
    peopleCount: peopleCount || 1,
    playerId: linkedPlayerId,
    status: 'pending',
    notes: notes || '',
    createdBy: createdByName,
  } as any).returning();

  res.status(201).json(result[0]);
});

// PUT /api/reservations/:id
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const existing = await db.select().from(reservations)
    .where(and(eq(reservations.id, id), isNull(reservations.deletedAt))).limit(1);
  if (existing.length === 0) return res.status(404).json({ error: 'الحجز غير موجود' });

  const { contactName, contactMethod, phone, peopleCount, status, notes, attended, playerId } = req.body;

  const updates: any = { updatedAt: new Date() };
  if (contactName !== undefined) updates.contactName = contactName;
  if (contactMethod !== undefined) updates.contactMethod = contactMethod;
  if (phone !== undefined) updates.phone = phone;
  if (peopleCount !== undefined) updates.peopleCount = peopleCount;
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (attended !== undefined) updates.attended = attended;
  if (playerId !== undefined) updates.playerId = playerId === null ? null : Number(playerId);

  const result = await db.update(reservations).set(updates).where(eq(reservations.id, id)).returning();
  res.json(result[0]);
});

// DELETE /api/reservations/:id (soft delete)
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const existing = await db.select().from(reservations)
    .where(and(eq(reservations.id, id), isNull(reservations.deletedAt))).limit(1);
  if (existing.length === 0) return res.status(404).json({ error: 'الحجز غير موجود' });

  await db.update(reservations).set({ deletedAt: new Date() } as any).where(eq(reservations.id, id));
  res.json({ success: true });
});

// ── GET /attendance/:activityId — بيانات «كشف الحضور المصوّر» (بطاقات) ──
// يجمع حجوزات الفعاليّة مع بيانات اللاعب المرتبط (الصورة/الرتبة/المستوى) + إحصاءات السعة.
router.get('/attendance/:activityId', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  const actId = parseInt(req.params.activityId);
  if (!Number.isFinite(actId)) return res.status(400).json({ error: 'معرّف غير صالح' });
  try {
    const [act] = await db.select({
      id: activities.id, name: activities.name, date: activities.date,
      maxCapacity: activities.maxCapacity, locationName: locations.name,
    }).from(activities).leftJoin(locations, eq(activities.locationId, locations.id))
      .where(and(eq(activities.id, actId), isNull(activities.deletedAt))).limit(1);
    if (!act) return res.status(404).json({ error: 'الفعاليّة غير موجودة' });

    const rows = await db.select({
      contactName: reservations.contactName, peopleCount: reservations.peopleCount,
      status: reservations.status, attended: reservations.attended, playerId: reservations.playerId,
      pName: players.name, avatarUrl: players.avatarUrl, rankTier: players.rankTier, level: players.level,
    }).from(reservations).leftJoin(players, eq(reservations.playerId, players.id))
      .where(and(eq(reservations.activityId, actId), isNull(reservations.deletedAt)));

    const members = rows.filter(r => r.playerId).map(r => ({
      name: r.pName || r.contactName, avatarUrl: r.avatarUrl || null,
      rankTier: r.rankTier || 'INFORMANT', level: r.level || 1,
      peopleCount: r.peopleCount || 1, attended: r.attended === true,
    })).sort((a, b) => (RANK_ORDER[b.rankTier] || 1) - (RANK_ORDER[a.rankTier] || 1) || (b.level - a.level) || a.name.localeCompare(b.name, 'ar'));

    const guests = rows.filter(r => !r.playerId).map(r => ({
      name: r.contactName, peopleCount: r.peopleCount || 1, attended: r.attended === true,
    })).sort((a, b) => b.peopleCount - a.peopleCount || a.name.localeCompare(b.name, 'ar'));

    const persons = rows.reduce((s, r) => s + (r.peopleCount || 1), 0);
    const cap = act.maxCapacity || 0;

    res.json({
      success: true,
      activity: { name: act.name, date: act.date, locationName: act.locationName || '', maxCapacity: cap },
      stats: {
        reservations: rows.length, persons, members: members.length, guests: guests.length,
        remaining: cap > 0 ? Math.max(0, cap - persons) : null,
      },
      members, guests,
    });
  } catch (err: any) {
    console.error('❌ attendance data:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /mark-attendance-from-games ──
// يراجع الحجوزات المثبّتة ويحوّل «حاضر» كلّ لاعبٍ له لعبةٌ فعليّة مسجّلة في فعاليّة حجزه.
// المطابقة: بحساب اللاعب (الأقوى) أو بآخر ٩ أرقام من الهاتف أو بالاسم. لا يمسّ من ثبت حضوره،
// ولا يُعلّم غياباً (الألعاب دليل حضورٍ لا دليل غياب — قد لا يُطابق الاسم فيُترك للتحديد اليدويّ).
router.post('/mark-attendance-from-games', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const rawAct = req.body?.activityId;
  const activityId = (rawAct && rawAct !== 'all') ? parseInt(rawAct) : null;

  try {
    const result: any = await db.execute(sql`
      UPDATE reservations r
      SET attended = true, updated_at = now()
      WHERE r.deleted_at IS NULL
        AND r.status <> 'pending'                 -- المثبّتة فقط
        AND r.attended IS DISTINCT FROM true       -- لا نلمس من ثبت حضوره
        AND r.activity_id IS NOT NULL
        ${activityId ? sql`AND r.activity_id = ${activityId}` : sql``}
        AND EXISTS (
          SELECT 1 FROM session_players sp
          JOIN sessions s ON s.id = sp.session_id AND s.deleted_at IS NULL
          WHERE s.activity_id = r.activity_id
            AND (
              (r.player_id IS NOT NULL AND sp.player_id = r.player_id)
              OR (
                length(regexp_replace(COALESCE(r.phone,''), '[^0-9]', '', 'g')) >= 9
                AND right(regexp_replace(COALESCE(sp.phone,''), '[^0-9]', '', 'g'), 9)
                  = right(regexp_replace(COALESCE(r.phone,''), '[^0-9]', '', 'g'), 9)
              )
              OR (
                btrim(r.contact_name) <> ''
                AND lower(btrim(sp.player_name)) = lower(btrim(r.contact_name))
              )
            )
        )
      RETURNING r.id
    `);
    const marked = (result.rows ? result.rows.length : (Array.isArray(result) ? result.length : (result.rowCount ?? 0)));
    res.json({ success: true, marked });
  } catch (err: any) {
    console.error('❌ mark-attendance-from-games:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
