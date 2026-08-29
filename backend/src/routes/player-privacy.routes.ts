// ══════════════════════════════════════════════════════
// 🔐 مركز الخصوصيّة — حقوق صاحب البيانات (قانون ٢٤/٢٠٢٣، المادّة ٤)
//
// الوصول · التصحيح · الحذف · النقل · سحب الموافقة · الاعتراض.
// كلُّها بلا مقابلٍ ولا شرطٍ — القانون يمنع أن يترتّب على ممارسة الحقّ ضررٌ
// ماليٌّ أو تعاقديّ.
//
// 🔴 الوثائقُ العامّة (privacy/terms) بلا مصادقة عمداً: المتجران يشترطان رابطاً
//    يفتحه المراجعُ بلا حساب، ومَن لم يوافق بعد يجب أن يقرأ قبل أن يقرّر.
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { players } from '../schemas/player.schema.js';
import { policyVersions, playerConsents, deletionRequests } from '../schemas/consent.schema.js';
import { authenticatePlayer } from '../middleware/player-auth.middleware.js';
import {
  consentStatus, recordConsent, publishedVersions, ageFromDob, ADULT_AGE,
  CONSENT_KINDS, type ConsentKind,
} from '../services/consent.service.js';
import {
  previewDeletion, requestDeletion, restoreAccount, GRACE_DAYS,
} from '../services/account-deletion.service.js';

const router = Router();

const isKind = (v: any): v is ConsentKind => CONSENT_KINDS.includes(v);
const platformOf = (req: Request) => {
  const p = String(req.body?.platform ?? req.query?.platform ?? '').toLowerCase();
  return ['web', 'android', 'ios'].includes(p) ? p : 'web';
};

// ════════ الوثائق العامّة — بلا مصادقة ════════

/** GET /api/privacy/documents — أحدثُ نسخةٍ منشورة من كلّ وثيقة */
router.get('/documents', async (_req: Request, res: Response) => {
  try {
    const docs = await publishedVersions();
    res.json({
      success: true,
      documents: docs.map((d: any) => ({
        kind: d.kind, version: d.version, lang: d.lang, title: d.title,
        body: d.body, changeSummary: d.changeSummary,
        publishedAt: d.publishedAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/privacy/documents/:kind — وثيقةٌ بعينها */
router.get('/documents/:kind', async (req: Request, res: Response) => {
  const kind = req.params.kind;
  if (!isKind(kind)) return res.status(400).json({ error: 'وثيقة غير معروفة' });
  try {
    const docs = await publishedVersions();
    const d: any = docs.find((x: any) => x.kind === kind);
    if (!d) return res.status(404).json({ error: 'لم تُنشر بعد' });
    res.json({ success: true, document: {
      kind: d.kind, version: d.version, lang: d.lang, title: d.title,
      body: d.body, changeSummary: d.changeSummary, publishedAt: d.publishedAt,
    } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ════════ حالةُ الموافقة والتسجيل ════════

/** GET /api/privacy/consent/status — ماذا ينقصني */
router.get('/consent/status', authenticatePlayer, async (req: Request, res: Response) => {
  const acc = (req as any).playerAccount;
  if (!acc?.playerId) return res.status(401).json({ error: 'غير مصادق' });
  try {
    const st = await consentStatus(acc.playerId);
    const db = getDB();
    let deletion: any = null;
    if (db) {
      const [p] = await db.select({
        deletedAt: players.deletedAt, dueAt: players.deletionDueAt, dob: players.dob,
      }).from(players).where(eq(players.id, acc.playerId)).limit(1);
      if (p?.deletedAt) deletion = { scheduled: true, dueAt: p.dueAt, graceDays: GRACE_DAYS };
      (st as any).age = ageFromDob(p?.dob);
    }
    res.json({ success: true, status: st, deletion, adultAge: ADULT_AGE });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/privacy/consent — تسجيلُ موافقة (وموافقةِ وليّ الأمر للقاصر) */
router.post('/consent', authenticatePlayer, async (req: Request, res: Response) => {
  const acc = (req as any).playerAccount;
  if (!acc?.playerId) return res.status(401).json({ error: 'غير مصادق' });

  const items = Array.isArray(req.body?.accept) ? req.body.accept : [];
  if (!items.length) return res.status(400).json({ error: 'لا موافقات في الطلب' });

  try {
    const pubs = await publishedVersions();
    const st = await consentStatus(acc.playerId);

    // 👨‍👦 القاصرُ لا تصحّ موافقتُه وحدها — بيانات الوليّ شرطٌ لا خيار
    const g = req.body?.guardian ?? null;
    if (st.isMinor) {
      const phone = String(g?.phone ?? '').trim();
      const name = String(g?.name ?? '').trim();
      if (!/^0?7[789]\d{7}$/.test(phone.replace(/\s|-/g, '')) || name.length < 3) {
        return res.status(400).json({
          success: false, code: 'GUARDIAN_REQUIRED',
          error: 'حسابُ من هو دون الثامنة عشرة يحتاج تأكيدَ وليّ الأمر: الاسمُ ورقمُ الهاتف',
        });
      }
    }

    for (const it of items) {
      const kind = it?.kind;
      if (!isKind(kind)) continue;
      const doc: any = pubs.find((d: any) => d.kind === kind);
      if (!doc) continue;
      if (String(it?.version) !== String(doc.version)) {
        return res.status(409).json({
          success: false, code: 'VERSION_MISMATCH',
          error: 'تغيّرت الوثيقة — أعد قراءتها', kind, expected: doc.version,
        });
      }
      await recordConsent({
        playerId: acc.playerId, kind, version: doc.version, action: 'granted',
        platform: platformOf(req),
        guardianPhone: st.isMinor ? String(g?.phone ?? '').trim() : null,
        guardianName: st.isMinor ? String(g?.name ?? '').trim() : null,
        guardianRelation: st.isMinor ? String(g?.relation ?? 'وليّ أمر').trim() : null,
      });
    }

    res.json({ success: true, status: await consentStatus(acc.playerId) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ════════ الحذف ════════

/** GET /api/privacy/deletion/preview — ما الذي سأفقده */
router.get('/deletion/preview', authenticatePlayer, async (req: Request, res: Response) => {
  const acc = (req as any).playerAccount;
  if (!acc?.playerId) return res.status(401).json({ error: 'غير مصادق' });
  try {
    const p = await previewDeletion(acc.playerId);
    if (!p) return res.status(404).json({ error: 'الحساب غير موجود' });
    res.json({ success: true, preview: p, graceDays: GRACE_DAYS });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/privacy/deletion — طلبُ الحذف.
 * 🔴 رصيدٌ اشتُري بمالٍ حقيقيّ لا يُصادَر: يُوقَف الطلبُ ويُطلب الإقرارُ صراحةً
 *    بعد عرض القيمة، أو تُسوّى القيمةُ في المكان. القانون يمنع الضرر الماليّ.
 */
router.post('/deletion', authenticatePlayer, async (req: Request, res: Response) => {
  const acc = (req as any).playerAccount;
  if (!acc?.playerId) return res.status(401).json({ error: 'غير مصادق' });

  const reason = ['refused_consent', 'withdrew_consent', 'user_request'].includes(req.body?.reason)
    ? req.body.reason : 'user_request';

  try {
    const pv = await previewDeletion(acc.playerId);
    if (pv?.needsSettlement && req.body?.acknowledgeBalance !== true) {
      return res.status(409).json({
        success: false, code: 'BALANCE_PENDING',
        error: 'لديك رصيدٌ قائم. تواصل معنا لتسويته، أو أقرّ صراحةً بالتنازل عنه قبل المتابعة.',
        chipsBalance: pv.chipsBalance,
      });
    }

    const r = await requestDeletion(acc.playerId, reason as any, platformOf(req), String(req.body?.note ?? ''));
    if (!r.ok) return res.status(400).json({ success: false, error: r.error });

    // سحبُ الموافقة يُسجَّل حدثاً مستقلّاً عن الحذف — سندان مختلفان
    if (reason !== 'user_request') {
      for (const d of await publishedVersions()) {
        await recordConsent({
          playerId: acc.playerId, kind: d.kind, version: d.version,
          action: 'withdrawn', platform: platformOf(req),
        });
      }
    }
    res.json({ success: true, dueAt: r.dueAt, graceDays: GRACE_DAYS });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/privacy/deletion/restore — التراجع خلال المهلة */
router.post('/deletion/restore', authenticatePlayer, async (req: Request, res: Response) => {
  const acc = (req as any).playerAccount;
  if (!acc?.playerId) return res.status(401).json({ error: 'غير مصادق' });
  try {
    const r = await restoreAccount(acc.playerId);
    if (!r.ok) return res.status(409).json({ success: false, error: r.error });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ════════ حقُّ الوصول والنقل ════════

/** GET /api/privacy/export — نسخةٌ من بياناتي، بلا مقابل */
router.get('/export', authenticatePlayer, async (req: Request, res: Response) => {
  const acc = (req as any).playerAccount;
  const db = getDB();
  if (!acc?.playerId || !db) return res.status(401).json({ error: 'غير مصادق' });
  const id = acc.playerId;

  try {
    const q = async (label: string, stmt: any) => {
      try { const r: any = await db.execute(stmt); return r?.rows ?? r ?? []; }
      catch { console.warn(`⚠️ تصدير (${label}) تعذّر`); return []; }
    };

    const [me] = await db.select({
      id: players.id, name: players.name, phone: players.phone, email: players.email,
      dob: players.dob, gender: players.gender, avatarUrl: players.avatarUrl,
      level: players.level, xp: players.xp, rankTier: players.rankTier, rankRR: players.rankRR,
      totalMatches: players.totalMatches, totalWins: players.totalWins,
      chipsBalance: players.chipsBalance, createdAt: players.createdAt,
    }).from(players).where(eq(players.id, id)).limit(1);

    const consents = await db.select().from(playerConsents)
      .where(eq(playerConsents.playerId, id)).orderBy(desc(playerConsents.createdAt));

    const payload = {
      generatedAt: new Date().toISOString(),
      notice: 'نسخةٌ من بياناتك الشخصيّة وفق المادّة ٤ من قانون حماية البيانات الشخصيّة الأردنيّ رقم ٢٤ لسنة ٢٠٢٣.',
      account: me ?? null,
      consents,
      matches: await q('matches', sql`
        SELECT mp.match_id, mp.role, mp.survived_to_end, mp.rounds_survived,
               mp.xp_earned, mp.rr_change, m.winner, m.created_at
        FROM match_players mp LEFT JOIN matches m ON m.id = mp.match_id
        WHERE mp.player_id = ${id} ORDER BY m.created_at DESC`),
      chipsLedger: await q('chips', sql`
        SELECT amount, balance_after, reason, jod_amount, created_at
        FROM chips_ledger WHERE player_id = ${id} ORDER BY created_at DESC`),
      bookings: await q('bookings', sql`
        SELECT b.activity_id, a.name AS activity_name, a.date, b.is_paid, b.created_at
        FROM bookings b LEFT JOIN activities a ON a.id = b.activity_id
        WHERE b.player_id = ${id} AND b.deleted_at IS NULL ORDER BY a.date DESC`),
      orders: await q('orders', sql`
        SELECT id, activity_id, total, status, created_at FROM orders
        WHERE player_id = ${id} ORDER BY created_at DESC`),
      feedback: await q('feedback', sql`
        SELECT overall, venue, gameplay, leader, notes, submitted_at
        FROM room_feedback WHERE player_id = ${id} ORDER BY submitted_at DESC`),
      presenceChecks: await q('presence', sql`
        SELECT activity_id, gate, result, distance_m, created_at
        FROM presence_checks WHERE player_id = ${id} ORDER BY created_at DESC LIMIT 500`),
      devices: await q('devices', sql`
        SELECT platform, device_info, is_active, created_at
        FROM player_fcm_tokens WHERE player_id = ${id}`),
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mafia-club-data-${id}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
