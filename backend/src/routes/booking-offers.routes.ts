// ══════════════════════════════════════════════════════
// 🎟️ عروض الحجز الجماعيّ («جيب صحابك») — /api/booking-offers
// ══════════════════════════════════════════════════════
// • العامّ (بلا دخول): صفحةُ دعوة الصديق /g/<token> — رمزٌ عشوائيّ هو الصلاحيّة
//   نفسها، ولا يكشف رقماً ولا حساباً: الاسمُ الأوّل لصاحب المجموعة والفعاليّة فقط.
// • الأدمن: إنشاءُ العروض وتعديلُها وحالتُها، ومعاينةُ إبلاغ الحاجزين وإرسالُه.
// • القائد فما فوق: مجموعاتُ الفعاليّة وحسمُها عند الباب (الحضور الفعليّ).

import { Router, type Request, type Response } from 'express';
import { authenticate, adminOnly, leaderOrAbove } from '../middleware/auth.js';
import { getDB } from '../config/db.js';
import { bookingOffers } from '../schemas/admin.schema.js';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  listOfferRows, offerStats, offerState, ruleText, validateOffer, offerValues, loadActivity,
  notifyPreview, notifySend, groupsForActivity, settleGroup, removeMember,
  inviteInfo, acceptInvite, declineInvite, type OfferInput,
} from '../services/booking-offers.service.js';

const router = Router();
const actorOf = (req: Request) => String((req as any).user?.displayName || (req as any).user?.username || 'أدمن');
const TOKEN = /^[a-f0-9]{24,48}$/;

/** بدءُ عرضٍ أو تعديلُه يغيّر ما يقوله البوت — الحقائق الحيّة تُبنى من جديد */
async function refreshBot() {
  try { const { invalidateLiveFacts } = await import('../services/whatsapp-bot.service.js'); invalidateLiveFacts(); } catch { /* غير حرج */ }
}

// ══════════ العامّ: دعوة الصديق ══════════
router.get('/invite/:token', async (req: Request, res: Response) => {
  if (!TOKEN.test(req.params.token)) return res.status(404).json({ error: 'الرابط غير صالح' });
  try {
    const info = await inviteInfo(req.params.token);
    if (!info) return res.status(404).json({ error: 'الرابط غير صالح أو انتهت صلاحيّته' });
    res.json({ success: true, invite: info });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/invite/:token/accept', async (req: Request, res: Response) => {
  if (!TOKEN.test(req.params.token)) return res.status(404).json({ error: 'الرابط غير صالح' });
  try {
    const info = await inviteInfo(req.params.token);
    if (!info) return res.status(404).json({ error: 'الرابط غير صالح أو انتهت صلاحيّته' });
    if (info.past) return res.status(410).json({ error: 'الفعاليّة انتهت' });
    const r = await acceptInvite(req.params.token);
    if (!r.ok) return res.status(409).json({ error: r.status === 'removed' || r.status === 'declined' ? 'هالحجز انلغى' : 'ما قدرنا نثبّت — راجع صاحبك' });
    res.json({ success: true, status: r.status });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/invite/:token/decline', async (req: Request, res: Response) => {
  if (!TOKEN.test(req.params.token)) return res.status(404).json({ error: 'الرابط غير صالح' });
  try {
    const info = await inviteInfo(req.params.token);
    if (!info) return res.status(404).json({ error: 'الرابط غير صالح أو انتهت صلاحيّته' });
    if (info.past) return res.status(410).json({ error: 'الفعاليّة انتهت' });
    const r = await declineInvite(req.params.token);
    res.json({ success: r.ok, status: r.status });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ══════════ الأدمن: العروض ══════════
router.get('/', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try {
    const db = getDB(); if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const rows = await listOfferRows();
    const now = Date.now();
    const offers = [];
    for (const r of rows) {
      const like: any = {
        status: r.status, N: r.groupSize, K: r.payFor, repeat: r.repeat,
        bookFrom: new Date(r.bookFrom).getTime(), bookUntil: new Date(r.bookUntil).getTime(),
      };
      const acts = [];
      for (const id of (Array.isArray(r.activityIds) ? r.activityIds : []) as number[]) {
        const a = await loadActivity(Number(id));
        if (a) acts.push({ id: a.id, name: a.name, date: a.date, price: a.price, location: a.locationName, past: new Date(a.date).getTime() < now });
      }
      offers.push({ ...r, state: offerState(like, now), rule: ruleText(like), activities: acts, stats: await offerStats(r.id) });
    }
    // الفعاليّات القادمة للاختيار — مواقعُ الاختبار مستبعدة (لا عروض عليها)
    const up: any = await db.execute(sql`
      SELECT a.id, a.name, a.date, a.base_price AS price, l.name AS location
        FROM activities a LEFT JOIN locations l ON l.id = a.location_id
       WHERE a.date > NOW() - INTERVAL '6 hours'
         AND COALESCE(l.is_test_location, false) = false
       ORDER BY a.date LIMIT 80`);
    const upcoming = ((up?.rows ?? up) || []).map((a: any) => ({ id: Number(a.id), name: a.name, date: a.date, price: Number(a.price || 0), location: a.location || '' }));
    res.json({ success: true, offers, upcoming });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB(); if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const input = (req.body || {}) as OfferInput;
    const bad = await validateOffer(input);
    if (bad) return res.status(400).json({ error: bad });
    const status = input.status === 'live' ? 'live' : 'draft';
    const [row] = await db.insert(bookingOffers).values({ ...offerValues(input), status, createdBy: actorOf(req) } as any).returning();
    await refreshBot();
    res.json({ success: true, offer: row });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB(); if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const id = parseInt(req.params.id);
    const input = (req.body || {}) as OfferInput;
    const bad = await validateOffer(input);
    if (bad) return res.status(400).json({ error: bad });
    // المجموعاتُ القائمة تحمل نسخةً من شروطها (terms) — تعديلُ العرض لا يغيّر ما وُعد به أحد
    const [row] = await db.update(bookingOffers).set({ ...offerValues(input), updatedAt: new Date() } as any)
      .where(and(eq(bookingOffers.id, id), isNull(bookingOffers.deletedAt))).returning();
    if (!row) return res.status(404).json({ error: 'العرض غير موجود' });
    await refreshBot();
    res.json({ success: true, offer: row });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/status', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB(); if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const id = parseInt(req.params.id);
    const status = String(req.body?.status || '');
    if (!['draft', 'live', 'paused'].includes(status)) return res.status(400).json({ error: 'حالة غير صالحة' });
    const [cur] = await db.select().from(bookingOffers).where(and(eq(bookingOffers.id, id), isNull(bookingOffers.deletedAt))).limit(1);
    if (!cur) return res.status(404).json({ error: 'العرض غير موجود' });
    if (status === 'live') {
      const bad = await validateOffer({ ...(cur as any), bookFrom: cur.bookFrom as any, bookUntil: cur.bookUntil as any, activityIds: cur.activityIds as any, status } as any);
      if (bad) return res.status(400).json({ error: bad });
    }
    await db.update(bookingOffers).set({ status, updatedAt: new Date() } as any).where(eq(bookingOffers.id, id));
    await refreshBot();
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB(); if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const id = parseInt(req.params.id);
    const st = await offerStats(id);
    // عرضٌ عليه مجموعاتٌ قائمة لا يُحذف — يُوقَف؛ حذفُه يُخفي من اللوحة ما وُعد به ناسٌ فعلاً
    if (Number(st.groups || 0) > 0) return res.status(409).json({ error: `عليه ${st.groups} مجموعة — أوقفه بدل الحذف` });
    await db.update(bookingOffers).set({ deletedAt: new Date(), status: 'paused', updatedAt: new Date() } as any).where(eq(bookingOffers.id, id));
    await refreshBot();
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── إبلاغُ الحاجزين مسبقاً: معاينةٌ كاملة ثمّ إرسالٌ لمن نافذته مفتوحة فقط ──
router.get('/:id/notify', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const pv = await notifyPreview(parseInt(req.params.id));
    if (pv.error) return res.status(404).json({ error: pv.error });
    res.json({ success: true, ...pv });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/:id/notify', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const out = await notifySend(parseInt(req.params.id), actorOf(req));
    if (!out.ok) return res.status(400).json({ error: out.error });
    res.json({ success: true, queued: out.queued });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ══════════ القائد فما فوق: المجموعات والحسم عند الباب ══════════
router.get('/activity/:activityId/groups', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  try { res.json({ success: true, groups: await groupsForActivity(parseInt(req.params.activityId)) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/groups/:groupId/settle', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  try {
    const present = (Array.isArray(req.body?.present) ? req.body.present : []).map(Number).filter(Number.isFinite);
    const out = await settleGroup(parseInt(req.params.groupId), present, actorOf(req));
    if (!out.ok) return res.status(400).json({ error: out.error });
    res.json({ success: true, ...out });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.delete('/members/:memberId', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  try {
    const out = await removeMember(parseInt(req.params.memberId));
    if (!out.ok) return res.status(400).json({ error: out.error });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
