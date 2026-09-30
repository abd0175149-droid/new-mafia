// ══════════════════════════════════════════════════════
// 📇 إدارة دفتر أرقام MC — /api/contacts-sync (الأدمن فقط)
// ══════════════════════════════════════════════════════
// الإعدادات، والأجهزة (إنشاء/إلغاء)، ورابط ملفّ الإعداد للآيفون (عامّ برمزٍ لمرّةٍ
// واحدة لـ٣٠ دقيقة — الرمز هو الصلاحيّة)، وتنزيل الدفتر كلّه vCard احتياطاً،
// وآخر طلبات الهاتف للتشخيص.

import { Router, type Request, type Response } from 'express';
import { authenticate, adminOnly } from '../middleware/auth.js';
import {
  getContactsConfig, saveContactsConfig, buildContacts, buildVCard, refreshCards, cardStats, allVCards,
  createDevice, listDevices, revokeDevice, takeSetup, mobileConfig,
} from '../services/contacts-sync.service.js';
import { recentRequests } from './carddav.routes.js';
import { env } from '../config/env.js';

const router = Router();
const actorOf = (req: Request) => String((req as any).user?.displayName || (req as any).user?.username || 'أدمن');
const baseUrl = () => String(env.PUBLIC_URL || 'https://club-mafia.grade.sbs').replace(/\/$/, '');
async function audit(req: Request, action: string, labelAr: string, details: any) {
  try {
    const { logStaffAction } = await import('../services/staff-action-log.service.js');
    const u: any = (req as any).user || {};
    await logStaffAction({ staffId: u.id ?? null, staffUsername: u.username ?? null, staffRole: u.role ?? null, source: 'dashboard', action, category: 'players', labelAr, details, outcome: 'success' });
  } catch { /* تكميليّ */ }
}

// ── ملفّ الإعداد (عامّ: الرمز لمرّةٍ واحدة هو الصلاحيّة) ──
router.get('/setup/:token', async (req: Request, res: Response) => {
  if (!/^[a-f0-9]{48}$/.test(req.params.token)) return res.status(404).send('الرابط غير صالح');
  const s = await takeSetup(req.params.token);
  if (!s) return res.status(410).set('Content-Type', 'text/plain; charset=utf-8').send('انتهت صلاحيّة رابط الإعداد أو استُعمل — أنشئ جهازاً جديداً من الداشبورد.');
  res.status(200)
    .set('Content-Type', 'application/x-apple-aspen-config')
    .set('Content-Disposition', 'attachment; filename="mafia-club-contacts.mobileconfig"')
    .set('Cache-Control', 'no-store')
    .send(mobileConfig(s.username, s.password));
});

router.get('/', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try {
    await refreshCards();
    const cfg = await getContactsConfig();
    const { contacts, invalid } = await buildContacts(cfg);
    const bySrc = contacts.reduce((m: any, c) => { m[c.source] = (m[c.source] || 0) + 1; return m; }, {});
    const sample = contacts.filter(c => c.source === 'player' && c.played).slice(0, 2)
      .concat(contacts.filter(c => c.source === 'player' && !c.played).slice(0, 1), contacts.filter(c => c.source !== 'player').slice(0, 2))
      .map(c => ({ name: c.name, phone: c.intl, note: c.note, bday: c.bday, source: c.source, vcard: buildVCard(c, cfg) }));
    res.json({
      success: true, config: cfg, stats: await cardStats(), preview: { total: contacts.length, bySource: bySrc, fixedPhones: contacts.filter(c => c.fixedPhone).length },
      sample, invalid: invalid.slice(0, 200), invalidTotal: invalid.length, devices: await listDevices(), recent: recentRequests.slice(0, 30),
      server: { host: new URL(baseUrl()).hostname, principalBase: '/api/carddav/principals/' },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/config', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const cfg = await saveContactsConfig(req.body || {});
    await refreshCards(true);
    await audit(req, 'contacts.config', 'عدّل إعدادات جهات اتصال الآيفون', cfg);
    res.json({ success: true, config: cfg, stats: await cardStats() });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/refresh', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try { await refreshCards(true); res.json({ success: true, stats: await cardStats() }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/devices', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const label = String(req.body?.label || '').trim() || 'آيفون';
    const d = await createDevice(label, actorOf(req));
    await refreshCards(true);
    await audit(req, 'contacts.device_create', `أضاف جهاز جهات اتصال «${label}»`, { id: d.id, username: d.username });
    res.json({
      success: true, id: d.id, username: d.username, password: d.password,
      setupUrl: `${baseUrl()}/api/contacts-sync/setup/${d.setupToken}`,
      server: new URL(baseUrl()).hostname, principalUrl: `/api/carddav/principals/${d.username}/`,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/devices/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const ok = await revokeDevice(parseInt(req.params.id));
    if (!ok) return res.status(404).json({ error: 'الجهاز غير موجود أو أُلغي' });
    await audit(req, 'contacts.device_revoke', `ألغى جهاز جهات اتصال #${req.params.id}`, { id: Number(req.params.id) });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── الدفتر كلّه ملفّاً واحداً (احتياطاً، أو لجهازٍ بلا حساب) ──
router.get('/vcf', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    await refreshCards(true);
    const body = await allVCards();
    await audit(req, 'contacts.export_vcf', 'نزّل ملفّ جهات الاتصال كاملاً', { bytes: body.length });
    const d = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
    res.status(200).set('Content-Type', 'text/vcard; charset=utf-8').set('Content-Disposition', `attachment; filename="MC-${d}.vcf"`).send(body);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
