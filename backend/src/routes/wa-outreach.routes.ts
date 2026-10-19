// ══════════════════════════════════════════════════════
// 📤 الإرسال المباشر من الصفحات — /api/whatsapp/outreach
// ══════════════════════════════════════════════════════
// الحجوزات: كلّ من يملك صفحة الحجوزات (كما كان «أُرسلت» اليدويّ)، والخادم يتحقّق أنّ الرقم رقم الحجز.
// التحليلات والمستكشف: أدمن فقط (كالصفحتين). كلّ دفعة في سجلّ عمليّات الموظّفين.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { inArray, isNull, and } from 'drizzle-orm';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { getDB } from '../config/db.js';
import { reservations } from '../schemas/admin.schema.js';
import { samePhone } from '../utils/phone.util.js';
import {
  previewOutreach, startOutreach, stopOutreach, outreachProgress, directEnabled,
  OUTREACH_ORIGINS, type OutreachOrigin, type OutreachItem,
} from '../services/wa-outreach.service.js';
import { transportSettings } from '../services/wa-transport/settings.js';

const router = Router();
const ORIGIN_AR: Record<string, string> = { reservations: 'الحجوزات', analytics: 'تحليلات اللاعبين', explorer: 'مستكشف اللاعبين' };

/** الحجوزات لكلّ موظّفٍ يملك الصفحة؛ الفئات للأدمن وحده */
function guard(req: Request, res: Response, next: NextFunction) {
  const origin = String(req.body?.origin || req.query.origin || '');
  if (!OUTREACH_ORIGINS.includes(origin as OutreachOrigin)) return res.status(400).json({ error: 'مصدرٌ غير معروف' });
  if (origin === 'reservations') return next();
  return adminOnly(req, res, next);
}

/** رسائل الحجز: الرقم يجب أن يكون رقم الحجز نفسه — لا يُستعمل المسار لمراسلة غيره */
async function sanitize(origin: OutreachOrigin, items: any[]): Promise<OutreachItem[]> {
  const list: OutreachItem[] = (Array.isArray(items) ? items : []).slice(0, 1000).map((x: any) => ({
    phone: String(x?.phone || ''), text: String(x?.text || ''), name: x?.name ? String(x.name).slice(0, 150) : undefined,
    playerId: Number.isInteger(Number(x?.playerId)) && Number(x.playerId) > 0 ? Number(x.playerId) : null,
    reservationId: Number.isInteger(Number(x?.reservationId)) && Number(x.reservationId) > 0 ? Number(x.reservationId) : null,
  }));
  if (origin !== 'reservations') return list.map(x => ({ ...x, reservationId: null }));
  const db = getDB(); if (!db) return [];
  const ids = list.map(x => x.reservationId).filter(Boolean) as number[];
  if (!ids.length) return [];
  const rows = await db.select({ id: reservations.id, phone: reservations.phone }).from(reservations)
    .where(and(inArray(reservations.id, ids), isNull(reservations.deletedAt)));
  const byId = new Map(rows.map((r: any) => [Number(r.id), String(r.phone || '')]));
  return list.filter(x => x.reservationId && samePhone(byId.get(x.reservationId), x.phone));
}

router.get('/outreach/config', authenticate, (_req: Request, res: Response) => {
  const s = transportSettings();
  res.json({ success: true, direct: directEnabled(), mode: s.mode, bulk: s.bulk, cohortFreqDays: s.outreach.cohortFreqDays });
});

router.post('/outreach/preview', authenticate, guard, async (req: Request, res: Response) => {
  try {
    const origin = req.body.origin as OutreachOrigin;
    const items = await sanitize(origin, req.body.items);
    const pv = await previewOutreach(origin, items);
    res.json({ success: true, ...pv, rows: pv.rows.map(r => ({ name: r.name, phone: r.local, via: r.via, firstContact: r.firstContact })) });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post('/outreach', authenticate, guard, async (req: Request, res: Response) => {
  try {
    const u: any = (req as any).user;
    const origin = req.body.origin as OutreachOrigin;
    const items = await sanitize(origin, req.body.items);
    const staffName = String(u?.displayName || u?.username || '');
    const r = await startOutreach({ origin, items, staffId: u?.id, staffName, label: req.body.label, excludePhones: req.body.excludePhones });
    if (!r.ok) return res.status(400).json({ error: r.error });
    try {
      const { logStaffAction } = await import('../services/staff-action-log.service.js');
      void logStaffAction({
        staffId: u?.id, staffUsername: u?.username, staffRole: u?.role, source: 'rest', action: 'wa:outreach', category: 'WHATSAPP_ADMIN',
        labelAr: `واتساب: إرسال من ${ORIGIN_AR[origin]} إلى ${r.queued} مستلم`,
        details: { outreachId: r.id, origin, count: r.queued, label: String(req.body.label || '').slice(0, 300), sample: String(items[0]?.text || '').slice(0, 200) },
      });
    } catch { /* غير حاجب */ }
    res.json({ success: true, id: r.id, queued: r.queued, preview: r.preview });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/outreach/:id', authenticate, async (req: Request, res: Response) => {
  const p = await outreachProgress(parseInt(req.params.id));
  if (!p) return res.status(404).json({ error: 'الدفعة غير موجودة' });
  if ((p as any).origin !== 'reservations' && (req as any).user?.role !== 'admin') return res.status(403).json({ error: 'للأدمن فقط' });
  res.json({ success: true, ...p });
});

router.post('/outreach/:id/stop', authenticate, async (req: Request, res: Response) => {
  const p: any = await outreachProgress(parseInt(req.params.id));
  if (!p) return res.status(404).json({ error: 'الدفعة غير موجودة' });
  if (p.origin !== 'reservations' && (req as any).user?.role !== 'admin') return res.status(403).json({ error: 'للأدمن فقط' });
  await stopOutreach(parseInt(req.params.id));
  res.json({ success: true });
});

export default router;
