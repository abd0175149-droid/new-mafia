// ══════════════════════════════════════════════════════
// 🌟 /api/experience — إدارة حملات «رأيك بتجربتك»: التحرير والنتائج والإرسال
// القراءة للأدمن والمدير؛ التعديل والإرسال للأدمن وحده.
// ══════════════════════════════════════════════════════
import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { authenticate, adminOnly, managerOrAbove } from '../middleware/auth.js';
import { getDB } from '../config/db.js';
import * as X from '../services/experience.service.js';

const router = Router();
const who = (req: Request) => { const u: any = (req as any).user; return u?.displayName || u?.username || ''; };
async function logAction(req: Request, action: string, labelAr: string, details: any) {
  try {
    const { logStaffAction } = await import('../services/staff-action-log.service.js');
    const u: any = (req as any).user;
    void logStaffAction({ staffId: u?.id, staffUsername: u?.username, staffRole: u?.role, source: 'rest', action, category: 'NOTIFICATIONS', labelAr, details });
  } catch { /* غير حاجب */ }
}

router.get('/campaigns', authenticate, managerOrAbove, async (_req, res) => {
  try { res.json({ success: true, campaigns: await X.listCampaigns() }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/campaigns', authenticate, adminOnly, async (req, res) => {
  try {
    const c = await X.createCampaign(who(req));
    await logAction(req, 'rest:experience-create', 'إنشاء حملة «رأيك بتجربتك»', { id: c?.id });
    res.json({ success: true, campaign: c });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/campaigns/:id', authenticate, managerOrAbove, async (req, res) => {
  try {
    const c = await X.getCampaign(parseInt(req.params.id));
    if (!c) return res.status(404).json({ error: 'الحملة غير موجودة' });
    res.json({ success: true, campaign: c, defaults: X.DEFAULT_EXP_QUESTIONS });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/campaigns/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const b = req.body || {};
    let questions: X.ExpQuestion[] | undefined;
    if (b.questions !== undefined) {
      const s = X.sanitizeQuestions(b.questions);
      if (!s.ok) return res.status(400).json({ error: s.error });
      questions = s.questions;
    }
    if (b.status && !['draft', 'open', 'closed'].includes(b.status)) return res.status(400).json({ error: 'حالةٌ غير معروفة' });
    const c = await X.updateCampaign(id, { title: b.title, intro: b.intro, imageUrl: b.imageUrl, questions, status: b.status, pushTitle: b.pushTitle, pushBody: b.pushBody });
    if (!c) return res.status(404).json({ error: 'الحملة غير موجودة' });
    await logAction(req, 'rest:experience-update', b.status ? `حملة «رأيك بتجربتك» ← ${b.status}` : 'تعديل حملة «رأيك بتجربتك»', { id, status: b.status });
    res.json({ success: true, campaign: c });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/campaigns/:id/summary', authenticate, managerOrAbove, async (req, res) => {
  try {
    const c = await X.getCampaign(parseInt(req.params.id));
    if (!c) return res.status(404).json({ error: 'الحملة غير موجودة' });
    res.json({ success: true, summary: await X.campaignSummary(c) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/campaigns/:id/responses', authenticate, managerOrAbove, async (req, res) => {
  try { res.json({ success: true, ...(await X.campaignResponses(parseInt(req.params.id), req.query as any)) }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// 👁 مَن فتح الإشعار — ?filter=opened|not_opened|page|opened_no_response|responded|device_not_opened&q&page
router.get('/campaigns/:id/opens', authenticate, managerOrAbove, async (req, res) => {
  try { res.json({ success: true, ...(await X.campaignOpens(parseInt(req.params.id), req.query as any)) }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/campaigns/:id/export.csv', authenticate, managerOrAbove, async (req, res) => {
  try {
    const c = await X.getCampaign(parseInt(req.params.id));
    if (!c) return res.status(404).json({ error: 'الحملة غير موجودة' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="experience-${c.id}.csv"`);
    res.send(await X.campaignCsv(c));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/audience', authenticate, managerOrAbove, async (_req, res) => {
  try { res.json({ success: true, ...(await X.audience()) }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * POST /campaigns/:id/send — { test?: { phone } } | { confirm: true, force?: true }
 * التجربة: لاعبٌ واحد برقم هاتفه (الحملة تُفتح له وحده ولا تُعلَّم مُرسَلة).
 * الحقيقيّ: كلّ اللاعبين — صفٌّ في صندوق كلٍّ منهم ودفعٌ لمن له جهاز؛ والحملة تُفتح.
 * 🔴 الإرسالُ الثاني للحملة نفسها يحتاج force: إشعارٌ مكرّرٌ لألف شخص لا يُستردّ.
 */
router.post('/campaigns/:id/send', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB(); if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const id = parseInt(req.params.id);
    let c = await X.getCampaign(id);
    if (!c) return res.status(404).json({ error: 'الحملة غير موجودة' });
    if (!c.intro.trim() && !(c.pushBody || '').trim()) return res.status(400).json({ error: 'نصّ الرسالة فارغ' });
    const { sendPushToPlayers, sendPushToAllPlayers } = await import('../services/fcm.service.js');

    if (req.body?.test) {
      const phone = String(req.body.test.phone || '').replace(/\D/g, '').replace(/^962/, '0');
      const r: any = await db.execute(sql`SELECT id, name FROM players WHERE phone = ${phone} AND deleted_at IS NULL LIMIT 1`);
      const p = (r?.rows ?? r ?? [])[0];
      if (!p) return res.status(404).json({ error: 'لا لاعب بهذا الرقم' });
      // التجربة تحتاج صفحةً تفتح: مسوّدةٌ تصير مفتوحة (لا أحدَ غيرُه يعرف رابطها بعد)
      if (c.status === 'draft') c = (await X.updateCampaign(id, { status: 'open' }))!;
      const n = X.notificationContent(c);
      await sendPushToPlayers([Number(p.id)], n.title, n.body, 'experience_review', { ...n.data, test: 1 });
      await logAction(req, 'rest:experience-test', `إشعار تجريبيّ لحملة «رأيك بتجربتك» إلى ${p.name}`, { id, playerId: p.id });
      return res.json({ success: true, test: true, to: p.name });
    }

    if (req.body?.confirm !== true) return res.status(400).json({ error: 'يلزم التأكيد' });
    if (c.sentAt && req.body?.force !== true) {
      return res.status(409).json({ code: 'ALREADY_SENT', error: 'أُرسل إشعار هذه الحملة من قبل', sentAt: c.sentAt, sentCount: c.sentCount });
    }
    if (c.status !== 'open') c = (await X.updateCampaign(id, { status: 'open' }))!;
    const aud = await X.audience();
    // يُعلَّم قبل الإرسال: ضغطةٌ ثانيةٌ أثناء الإرسال الطويل تصطدم بـALREADY_SENT لا بإرسالٍ مزدوج
    await db.execute(sql`UPDATE experience_campaigns SET sent_at = NOW(), sent_by = ${who(req)}, sent_count = ${aud.players}, updated_at = NOW() WHERE id = ${id}`);
    const n = X.notificationContent(c);
    const started = Date.now();
    await sendPushToAllPlayers(n.title, n.body, 'experience_review', n.data);
    await logAction(req, 'rest:experience-send', 'إرسال إشعار «رأيك بتجربتك» لكلّ اللاعبين', { id, players: aud.players, withPush: aud.withPush, ms: Date.now() - started });
    res.json({ success: true, players: aud.players, withPush: aud.withPush, ms: Date.now() - started });
  } catch (e: any) {
    console.error('❌ experience send:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
