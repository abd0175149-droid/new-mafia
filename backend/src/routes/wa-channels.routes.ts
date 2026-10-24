// ══════════════════════════════════════════════════════
// 🔀 مسارات القنوات — /api/whatsapp/channels (أدمن فقط)
// ══════════════════════════════════════════════════════
// وضع التشغيل والسقوف والبديل، وصحّة رقم الأعمال وربطه، واستيراد تاريخه، وأقفال القناتين،
// وتثبيت قناة محادثة. كلّ تغييرٍ يُسجَّل في staff_action_log.

import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { getDB } from '../config/db.js';
import { waConversations } from '../schemas/admin.schema.js';
import { transportSettings, saveTransportSettings } from '../services/wa-transport/settings.js';
import { allLocks, resumeSending } from '../services/wa-transport/locks.js';
import { webConfigured } from '../services/wa-transport/router.js';
import { cloudConfigured } from '../services/wa-transport/cloud.transport.js';
import { TRANSPORT_MODES, type Channel } from '../services/wa-transport/types.js';

const router = Router();
const MODE_AR: Record<string, string> = { cloud_only: 'ميتا وحدها', dual: 'مزدوج', web_primary: 'الجلسة أوّلاً', web_final: 'الجلسة + ميتا للتحويل' };

async function audit(req: Request, action: string, labelAr: string, details: any) {
  try {
    const { logStaffAction } = await import('../services/staff-action-log.service.js');
    const u = (req as any).user;
    void logStaffAction({ staffId: u?.id, staffUsername: u?.username, staffRole: u?.role, source: 'rest', action, category: 'WHATSAPP_ADMIN', labelAr, details });
  } catch { /* غير حاجب */ }
}

async function snapshot() {
  const { getWebHealth } = await import('../services/wa-transport/web.health.js');
  const { outboxStats } = await import('../services/wa-transport/web.transport.js');
  const { getWaHealth } = await import('../services/wa-health.service.js');
  const { getDB: g } = await import('../config/db.js');
  const db = g();
  let imp: any = null;
  if (db) {
    const { sql } = await import('drizzle-orm');
    const r: any = await db.execute(sql`SELECT value FROM wa_runtime_flags WHERE key = 'web_history_import' LIMIT 1`).catch(() => null);
    imp = (r?.rows ?? r ?? [])[0]?.value ?? null;
  }
  return {
    settings: transportSettings(),
    modes: TRANSPORT_MODES.map(m => ({ id: m, label: MODE_AR[m] })),
    configured: { cloud: cloudConfigured(), web: webConfigured() },
    locks: allLocks(),
    web: getWebHealth(),
    cloud: getWaHealth(),
    outbox: webConfigured() ? await outboxStats().catch(() => null) : null,
    historyImport: imp,
  };
}

router.get('/channels', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try { res.json({ success: true, ...(await snapshot()) }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/channels', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const before = transportSettings();
    const patch = req.body || {};
    if (patch.mode && !TRANSPORT_MODES.includes(patch.mode)) return res.status(400).json({ error: 'وضعٌ غير معروف' });
    if (patch.mode && patch.mode !== 'cloud_only' && !webConfigured()) {
      return res.status(409).json({ error: 'رقم الأعمال غير مهيّأ — لا يمكن تفعيل وضعٍ يرسل منه', code: 'WEB_NOT_CONFIGURED' });
    }
    const after = await saveTransportSettings(patch);
    // 🤖 مفتاح البوت لغير اللاعبين المعروفين تبدّل ⟵ يُطبَّق على محادثاتهم القائمة (الاختيار اليدويّ محترم)
    let knownBotChanged: number | null = null;
    if (after.webBotKnown !== before.webBotKnown) {
      const { applyKnownBotSetting } = await import('../services/wa-transport/web.history.js');
      knownBotChanged = await applyKnownBotSetting(after.webBotKnown);
    }
    const label = patch.mode && patch.mode !== before.mode
      ? `واتساب: تبديل الوضع ${MODE_AR[before.mode]} ← ${MODE_AR[after.mode]}`
      : 'واتساب: تعديل إعدادات القنوات';
    await audit(req, 'rest:wa-channels', label, { before, after, knownBotChanged });
    res.json({ success: true, ...(await snapshot()), knownBotChanged });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── صحّة رقم الأعمال: فحصٌ فوريّ ─────────────────────────
router.post('/channels/web/check', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try {
    const { checkWebNow } = await import('../services/wa-transport/web.health.js');
    await checkWebNow();
    res.json({ success: true, ...(await snapshot()) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── ربط رقم الأعمال: QR أو رمز اقتران ──────────────────
router.post('/channels/web/pair', authenticate, adminOnly, async (req: Request, res: Response) => {
  if (!webConfigured()) return res.status(409).json({ error: 'البوّابة غير مهيّأة (OPENWA_*)' });
  try {
    const gw = await import('../services/wa-transport/openwa.client.js');
    const s = await gw.session().catch(() => null);
    if (gw.isLinked(s)) return res.json({ success: true, linked: true, phone: s.phone });
    if (!['qr_ready', 'initializing', 'authenticating'].includes(String(s?.status || ''))) await gw.start().catch(() => {});
    const mode = req.body?.mode === 'code' ? 'code' : 'qr';
    if (mode === 'code') {
      const phone = String(req.body?.phone || '').replace(/\D/g, '');
      if (!/^\d{8,15}$/.test(phone)) return res.status(400).json({ error: 'اكتب رقم الأعمال بصيغة دوليّة 9627XXXXXXXX' });
      // البوّابة تقبل الرمز حين تصير الجلسة qr_ready — ننتظرها قليلاً
      let last: any = null;
      for (let i = 0; i < 12; i++) {
        try { const r = await gw.pairingCode(phone); await audit(req, 'rest:wa-web-pair', 'واتساب: طلب رمز ربط رقم الأعمال', { phone: phone.slice(0, 5) + '…' }); return res.json({ success: true, mode, code: r?.pairingCode || r?.code, status: r?.status }); }
        catch (e: any) { last = e; await new Promise(r => setTimeout(r, 4000)); }
      }
      return res.status(502).json({ error: last?.message || 'تعذّر طلب الرمز' });
    }
    let q: any = null;
    for (let i = 0; i < 15; i++) {
      q = await gw.qr().catch(() => null);
      if (q?.qrCode || q?.qr) break;
      await new Promise(r => setTimeout(r, 3000));
    }
    if (!(q?.qrCode || q?.qr)) return res.status(502).json({ error: 'لم يظهر رمز QR بعد — أعد المحاولة بعد لحظات' });
    res.json({ success: true, mode, qr: q.qrCode || q.qr, status: q.status });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── استيراد تاريخ رقم الأعمال (مرّة، أو force) ──────────
router.post('/channels/web/import', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { importWebHistory, importRunning } = await import('../services/wa-transport/web.history.js');
    if (importRunning()) return res.status(409).json({ error: 'الاستيراد جارٍ الآن — تُحدَّث حالته في الصفحة' });
    await audit(req, 'rest:wa-web-import', 'واتساب: مرآة محادثات رقم الأعمال في الوارد', { force: !!req.body?.force });
    // مرآةٌ كاملة (كلّ المحادثات بتاريخها) تأخذ دقائق — تعمل في الخلفيّة، وحالتها في web_history_import
    const onlyChats = Array.isArray(req.body?.onlyChats) ? req.body.onlyChats.map(String).slice(0, 200) : undefined;
    void importWebHistory({ force: !!req.body?.force, full: !!req.body?.full, onlyChats }).catch(e => console.warn('⚠️ WA web mirror:', e?.message));
    res.json({ success: true, started: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── رفع قفل قناة يدويّاً ────────────────────────────────
router.post('/channels/:ch/resume', authenticate, adminOnly, async (req: Request, res: Response) => {
  const ch = req.params.ch as Channel;
  if (ch !== 'cloud' && ch !== 'web') return res.status(400).json({ error: 'قناة غير معروفة' });
  const { env } = await import('../config/env.js');
  if (ch === 'cloud' && env.WA_SUSPENDED) return res.status(409).json({ error: 'القفل مضبوط في البيئة (WA_SUSPENDED=1)' });
  await resumeSending(ch);
  await audit(req, 'rest:wa-sending-resume', `رفع قفل إرسال واتساب يدويّاً (${ch === 'cloud' ? 'ميتا' : 'رقم الأعمال'})`, { channel: ch });
  res.json({ success: true, ...(await snapshot()) });
});

// ── تثبيت قناة محادثة (أو إلغاؤه) ─────────────────────
router.post('/conversations/:id/channel-pin', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB(); if (!db) return res.status(503).json({ error: 'DB' });
  const id = parseInt(req.params.id);
  const pin = req.body?.channel === 'cloud' || req.body?.channel === 'web' ? req.body.channel : null;
  const [u] = await db.update(waConversations).set({ channelPin: pin, updatedAt: new Date() } as any).where(eq(waConversations.id, id)).returning();
  if (!u) return res.status(404).json({ error: 'المحادثة غير موجودة' });
  await audit(req, 'rest:wa-channel-pin', `واتساب: تثبيت قناة المحادثة ← ${pin === 'web' ? 'رقم الأعمال' : pin === 'cloud' ? 'ميتا' : 'تلقائيّ'}`, { conversationId: id, pin });
  const { pickChannel } = await import('../services/wa-transport/router.js');
  res.json({ success: true, conversation: { ...u, sendVia: pickChannel(u as any, 'reply').channel } });
});

// ── فتح محادثة رقمٍ من صفحات النظام (زرّ واتساب الأخضر) — تُنشأ إن لم تكن ──
router.post('/conversations/open-by-phone', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { normalizeAnyPhone } = await import('../utils/phone.util.js');
    const norm = normalizeAnyPhone(String(req.body?.phone || ''));
    if (!norm) return res.status(400).json({ error: 'رقمٌ غير صالح' });
    const { getOrCreateConversation } = await import('../services/whatsapp-inbox.service.js');
    const conv: any = await getOrCreateConversation(norm.local, '', { channel: webConfigured() && transportSettings().mode !== 'cloud_only' ? 'web' : 'cloud' });
    res.json({ success: true, conversation: { id: conv?.id } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── 📇 سجلّ جهات خطّ الأعمال ──────────────────────────
router.get('/channels/roster', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { rosterStats, rosterList } = await import('../services/wa-transport/line-roster.js');
    const [stats, list] = await Promise.all([
      rosterStats(),
      rosterList({ q: String(req.query.q || ''), status: req.query.status as any, players: req.query.players as any, limit: Number(req.query.limit) || 50, offset: Number(req.query.offset) || 0 }),
    ]);
    res.json({ success: true, stats, ...list });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/channels/roster/sync', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { syncLineContacts, syncState } = await import('../services/wa-transport/line-roster.js');
    void syncLineContacts({ max: Number(req.body?.max) || 2000 });   // في الخلفيّة — قد يطول
    await audit(req, 'rest:wa-roster-sync', 'واتساب: مزامنة سجلّ جهات الخطّ', {});
    res.json({ success: true, state: syncState() });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
