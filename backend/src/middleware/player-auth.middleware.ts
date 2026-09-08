// ══════════════════════════════════════════════════════
// 🔐 نظام مصادقة اللاعبين — Player JWT Auth Middleware
// منفصل عن مصادقة Staff/Admin
// ══════════════════════════════════════════════════════

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { PLAYER_TOKEN_EXPIRY } from '../schemas/player.schema.js';
import { LOCKED_MESSAGE, LOCKED_CODE } from '../lib/account-lock.js';
import { touchLastActive, platformFromHeaders } from '../lib/last-active.js';

// ── أنواع البيانات ──────────────────────────────────

export interface PlayerJwtPayload {
  playerId: number;
  phone: string;
  name: string;
}

// إضافة playerAccount لـ Request
declare global {
  namespace Express {
    interface Request {
      playerAccount?: PlayerJwtPayload;
    }
  }
}

// ── JWT Secret مخصص للاعبين (يُشتق من JWT_SECRET الأصلي) ──

const PLAYER_JWT_SECRET = env.JWT_SECRET + '_PLAYER';

// ── توليد Token للاعب ────────────────────────────

export function generatePlayerToken(payload: PlayerJwtPayload): string {
  return jwt.sign(payload, PLAYER_JWT_SECRET, {
    expiresIn: PLAYER_TOKEN_EXPIRY as any,
  });
}

// ── التحقق من Token اللاعب ──────────────────────

export function verifyPlayerToken(token: string): PlayerJwtPayload | null {
  try {
    return jwt.verify(token, PLAYER_JWT_SECRET) as PlayerJwtPayload;
  } catch {
    return null;
  }
}

// ── تشفير كلمة السر ──────────────────────────────

export async function hashPlayerPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// ── التحقق من كلمة السر ──────────────────────────

export async function verifyPlayerPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── Middleware: التحقق من توكن اللاعب ─────────────

// 🔐 الهويّةُ تُقرأ من القاعدة لا من الرمز.
//
//    الرمزُ كان يحمل الهاتف والاسم داخله وصلاحيّتُه ثلاثون يوماً — أيْ أنّ فكّ
//    ترميزه (وهو متاحٌ بلا مفتاح) يكشف بياناتٍ شخصيّة. صار يُقرأ منه المعرّفُ
//    وحده، ويُهيّأ الباقي من القاعدة في كلّ طلب.
//
//    وفائدةٌ ثانية: تغيّرُ الحالة يسري فوراً — حسابٌ جُهّل أو جُدول للحذف
//    يُمنَع هنا لا بعد أن يصل إلى مسارٍ نسي فحصه.
//
//    ⚠️ الرموزُ القديمة تبقى صالحة: نقرأ `playerId` منها ونتجاهل ما سواه.
export async function authenticatePlayer(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'غير مصادق — يرجى تسجيل الدخول' });
    return;
  }

  const decoded = verifyPlayerToken(authHeader.split(' ')[1]);
  if (!decoded?.playerId) {
    res.status(401).json({ error: 'توكن غير صالح أو منتهي الصلاحية' });
    return;
  }

  try {
    const { getDB } = await import('../config/db.js');
    const { players } = await import('../schemas/player.schema.js');
    const { eq } = await import('drizzle-orm');
    const db = getDB();
    if (!db) { req.playerAccount = decoded; return next(); }

    const [row] = await db.select({
      id: players.id, phone: players.phone, name: players.name,
      deletedAt: players.deletedAt, anonymizedAt: players.anonymizedAt,
      isLocked: players.isLocked, lastActiveAt: players.lastActiveAt,
    }).from(players).where(eq(players.id, decoded.playerId)).limit(1);

    if (!row || row.anonymizedAt) {
      res.status(401).json({ error: 'الحساب لم يعد موجوداً', code: 'ACCOUNT_GONE' });
      return;
    }

    // 🔒 القفلُ يسري على الجلسة القائمة لا على الدخول التالي وحده.
    //    الرمزُ يعيش ثلاثين يوماً، فمنعُ الدخول وحده يترك المقفولَ يلعب شهراً
    //    كاملاً — وهو نقضٌ للقرار الإداريّ لا تأخيرٌ في تنفيذه.
    if (row.isLocked) {
      res.status(403).json({ success: false, code: LOCKED_CODE, error: LOCKED_MESSAGE });
      return;
    }

    // ══════════════════════════════════════════════════════
    // 📡 ختمُ آخرِ تفاعل — هنا لا في المسارات
    //
    // 🔴 هذه النقطةُ يمرّ بها **كلُّ طلبٍ مصادَق** من الويب المثبَّت ومن فلاتر
    //    معاً (كلاهما يرسل نفسَ ترويسة Bearer، والاثنان ينادِيان /me عند كلّ
    //    فتحة). فتغطيةُ نقطةٍ واحدةٍ كاملةٌ بلا سطرٍ في العميل — بخلاف توزيعِها
    //    على عشرات المسارات حيث نسيانُ واحدٍ يترك ثقباً صامتاً.
    //
    // 🔴 والصفُّ مقروءٌ أصلاً أعلاه، فالمقارنةُ مجّانيّةٌ والكتابةُ وحدها جديدة.
    //    ولا تُنتظر: ختمٌ إحصائيٌّ لا يجوز أن يضيف زمناً إلى كلّ طلب.
    // ══════════════════════════════════════════════════════
    void touchLastActive(row.id, row.lastActiveAt, 'request', platformFromHeaders(req.headers));

    req.playerAccount = { playerId: row.id, phone: row.phone, name: row.name };
    (req as any).playerDeletion = row.deletedAt
      ? { scheduled: true, dueAt: (row as any).deletionDueAt ?? null }
      : null;
    next();
  } catch (err: any) {
    // خللٌ في القاعدة لا يُسقط المصادقة: نمرّ بحمولة الرمز كما كان السلوك سابقاً
    console.warn('⚠️ authenticatePlayer hydrate:', err.message);
    req.playerAccount = decoded;
    next();
  }
}

// ── حارسُ الحساب المجدول للحذف ──
// 🔴 يُركَّب على مسارات الفعل لا القراءة: صاحبُ الحساب يجب أن يبقى قادراً على
//    رؤية حالته واستعادته، وأن يُمنع من إنشاء حجزٍ أو طلبٍ جديد أثناء المهلة.
export function blockIfDeleting(req: Request, res: Response, next: NextFunction): void {
  const d = (req as any).playerDeletion;
  if (d?.scheduled) {
    res.status(403).json({
      success: false, code: 'ACCOUNT_DELETING',
      error: 'حسابُك مجدولٌ للحذف. استعِده أوّلاً من مركز الخصوصيّة.',
      dueAt: d.dueAt ?? null,
    });
    return;
  }
  next();
}

// ── Middleware: البوّابةُ المتسلسلة — ميلادٌ ← وليُّ أمرٍ ← موافقة ──
//
// 🔴 `hasAllConsents` كانت معرَّفةً منذ إنشاء النظام و**لا يستدعيها أحد**:
//    بحثٌ في الخادم والواجهة والتطبيق أعطى صفرَ مستدعين. فبوّابةُ الموافقة
//    كانت تعيش في العميل وحدَه، ونتيجتُها مقيسةٌ على الإنتاج: ٥٣٩ لاعباً
//    لعبوا بلا صفِّ موافقةٍ إطلاقاً، و٢٦ قاصراً بلا وليّ أمرٍ واحد.
//
// 🔴 وتُركَّب على مسارات **الفعل** وحدها (حجزٌ وانضمام) لا على القراءة:
//    حجبُ التصفّح يترك اللاعبَ أمام شاشةٍ فارغةٍ لا يفهم سببَها، وحجبُ
//    الفعل يقع في اللحظة التي يفهم فيها لماذا يُطلب منه شيء.
export async function requireConsent(req: Request, res: Response, next: NextFunction): Promise<void> {
  const playerId = req.playerAccount?.playerId;
  if (!playerId) { res.status(401).json({ error: 'غير مصادق' }); return; }
  try {
    const { consentStatus } = await import('../services/consent.service.js');
    const st = await consentStatus(playerId);
    if (st.required) {
      res.status(403).json({
        success: false,
        code: 'CONSENT_REQUIRED',
        error: st.needsDob
          ? 'أكمِل تاريخَ ميلادك للمتابعة'
          : st.needsGuardian
            ? 'يلزم تسجيلُ وليّ أمرٍ للمتابعة'
            : 'يلزم قبولُ الشروط وسياسة الخصوصيّة للمتابعة',
        needsDob: st.needsDob, needsGuardian: st.needsGuardian, isMinor: st.isMinor,
      });
      return;
    }
    next();
  } catch (err: any) {
    // 🔴 لا يُحجب عند عطلٍ تقنيّ: البوّابةُ سندٌ قانونيٌّ لا قفلُ أمان،
    //    وإسقاطُ ليلةِ فعاليّةٍ بسبب تعثّرِ استعلامٍ ضررٌ أكبرُ من تأخّرِ سند.
    console.warn('⚠️ requireConsent error:', err.message);
    next();
  }
}

// 🔴 حُذف `requireNoPendingFeedback` (قرارُ المالك: أُلغي حجبُ الاستبيان).
//    لم يُترك معطَّلاً بل حُذف: تنفيذٌ حاجبٌ غيرُ مركَّبٍ يبقى فخّاً — يُعاد
//    تركيبُه سهواً بعد شهور، ويُقرأ من الشفرة كأنّ الحجبَ ما زال سياسة.
//    الاستبيانُ يبقى تذكيراً بإشعار.

// ── Middleware اختياري: يحاول فك التوكن بدون حظر ──

export function optionalPlayerAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyPlayerToken(token);
    if (decoded) {
      req.playerAccount = decoded;
    }
  }

  next();
}
