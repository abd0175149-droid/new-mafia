// ══════════════════════════════════════════════════════
// 🎫 مسارات التذاكر المركزية — Global Tickets Routes
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc, sql, and, isNull, ilike } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { tickets, activities } from '../schemas/admin.schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ── تحقق من الصلاحيات (admin أو accountant) ──
function canManageTickets(req: Request, res: Response): boolean {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'accountant') {
    res.status(403).json({ error: 'ليس لديك صلاحية إدارة التذاكر' });
    return false;
  }
  return true;
}

// ── GET /api/tickets — قائمة التذاكر مع فلاتر ──
router.get('/', authenticate, async (req: Request, res: Response) => {
  if (!canManageTickets(req, res)) return;
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { batch, seller, used, search, limit: lim, offset: off } = req.query;

  const conditions: any[] = [];
  if (batch) conditions.push(eq(tickets.batchName, String(batch)));
  if (seller) conditions.push(eq(tickets.sellerName, String(seller)));
  if (used === 'true') conditions.push(eq(tickets.isUsed, true));
  if (used === 'false') conditions.push(eq(tickets.isUsed, false));
  if (search) conditions.push(ilike(tickets.ticketNumber, `%${String(search)}%`));

  const query = db.select().from(tickets)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tickets.createdAt))
    .limit(Number(lim) || 200)
    .offset(Number(off) || 0);

  const result = await query;
  res.json(result);
});

// ── GET /api/tickets/stats — إحصائيات ──
router.get('/stats', authenticate, async (req: Request, res: Response) => {
  if (!canManageTickets(req, res)) return;
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const allTickets = await db.select({
    isUsed: tickets.isUsed,
    batchName: tickets.batchName,
    sellerName: tickets.sellerName,
    ticketType: tickets.ticketType,
  }).from(tickets);

  const total = allTickets.length;
  const used = allTickets.filter(t => t.isUsed).length;
  const available = total - used;

  // حسب البائع
  const bySeller: Record<string, { total: number; used: number }> = {};
  allTickets.forEach(t => {
    const s = t.sellerName || 'غير محدد';
    if (!bySeller[s]) bySeller[s] = { total: 0, used: 0 };
    bySeller[s].total++;
    if (t.isUsed) bySeller[s].used++;
  });

  // حسب الدفعة
  const byBatch: Record<string, { total: number; used: number }> = {};
  allTickets.forEach(t => {
    const b = t.batchName || 'بدون دفعة';
    if (!byBatch[b]) byBatch[b] = { total: 0, used: 0 };
    byBatch[b].total++;
    if (t.isUsed) byBatch[b].used++;
  });

  // حسب النوع
  const byType: Record<string, number> = {};
  allTickets.forEach(t => {
    const tp = t.ticketType || 'regular';
    byType[tp] = (byType[tp] || 0) + 1;
  });

  res.json({ total, used, available, bySeller, byBatch, byType });
});

// ── POST /api/tickets/upload — رفع تذاكر (كائنات كاملة أو أرقام فقط) ──
router.post('/upload', authenticate, async (req: Request, res: Response) => {
  if (!canManageTickets(req, res)) return;
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { tickets: inputTickets, ticketNumbers, batchName, ticketType, price, sellerName, sellerPhone, details } = req.body;

  // دعم الصيغتين:
  // 1) tickets: [{ticketNumber, ticketType, price, sellerName, ...}] — من CSV
  // 2) ticketNumbers: ["TKT-001", "TKT-002"] — القديمة (أرقام فقط + metadata مشتركة)
  let ticketRows: any[] = [];

  if (Array.isArray(inputTickets) && inputTickets.length > 0) {
    // صيغة CSV: كل تذكرة ببياناتها
    ticketRows = inputTickets
      .filter((t: any) => t.ticketNumber && String(t.ticketNumber).trim())
      .map((t: any) => ({
        ticketNumber: String(t.ticketNumber).trim(),
        batchName: t.batchName || null,
        ticketType: t.ticketType || 'regular',
        price: t.price ? String(t.price) : null,
        details: t.details || null,
        notes: t.notes || null,
        sellerName: t.sellerName || null,
        sellerPhone: t.sellerPhone || null,
      }));
  } else if (Array.isArray(ticketNumbers) && ticketNumbers.length > 0) {
    // صيغة قديمة: أرقام + metadata مشتركة
    ticketRows = ticketNumbers
      .map((t: string) => String(t).trim())
      .filter(Boolean)
      .map(t => ({
        ticketNumber: t,
        batchName: batchName || null,
        ticketType: ticketType || 'regular',
        price: price ? String(price) : null,
        details: details || null,
        sellerName: sellerName || null,
        sellerPhone: sellerPhone || null,
      }));
  }

  if (ticketRows.length === 0) {
    return res.status(400).json({ error: 'يرجى إرسال بيانات التذاكر' });
  }

  // جلب الأرقام الموجودة
  const existing = await db.select({ ticketNumber: tickets.ticketNumber }).from(tickets);
  const existingSet = new Set(existing.map(t => t.ticketNumber));

  // فلترة المكررات
  const seen = new Set<string>();
  const newTickets = ticketRows.filter(t => {
    if (existingSet.has(t.ticketNumber) || seen.has(t.ticketNumber)) return false;
    seen.add(t.ticketNumber);
    return true;
  });
  const duplicates = ticketRows.length - newTickets.length;

  const createdBy = req.user?.displayName || req.user?.username || '';

  if (newTickets.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < newTickets.length; i += batchSize) {
      const chunk = newTickets.slice(i, i + batchSize);
      await db.insert(tickets).values(
        chunk.map(t => ({
          ...t,
          createdBy,
        } as any))
      );
    }
  }

  console.log(`🎫 Uploaded ${newTickets.length} tickets (${duplicates} duplicates skipped) by ${createdBy}`);
  res.json({
    success: true,
    uploaded: newTickets.length,
    duplicates,
    total: existingSet.size + newTickets.length,
  });
});

// ── DELETE /api/tickets/:id — حذف تذكرة واحدة ──
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  if (!canManageTickets(req, res)) return;
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  await db.delete(tickets).where(eq(tickets.id, id));
  res.json({ success: true });
});

// ── DELETE /api/tickets/batch/:batchName — حذف دفعة كاملة ──
router.delete('/batch/:batchName', authenticate, async (req: Request, res: Response) => {
  if (!canManageTickets(req, res)) return;
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const batchName = decodeURIComponent(req.params.batchName);
  const deleted = await db.delete(tickets).where(eq(tickets.batchName, batchName)).returning();
  res.json({ success: true, deleted: deleted.length });
});

// ── GET /api/tickets/batches — قائمة الدفعات ──
router.get('/batches', authenticate, async (req: Request, res: Response) => {
  if (!canManageTickets(req, res)) return;
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const result = await db.select({
    batchName: tickets.batchName,
    count: sql<number>`count(*)::int`,
    used: sql<number>`count(*) filter (where ${tickets.isUsed} = true)::int`,
  }).from(tickets).groupBy(tickets.batchName);

  res.json(result);
});

export default router;
