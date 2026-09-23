// ══════════════════════════════════════════════════════
// 🔒 إبطال رموز الموظّفين — إغلاق الجلسات
// ══════════════════════════════════════════════════════
// رموز الموظّفين JWT **بلا حالة**: لا جدول جلسات ولا قائمة إبطال، والمصادقة
// تتحقّق من التوقيع ولا تقرأ صفّ الموظّف إطلاقاً. فمن سجّل دخولاً بقي داخلاً
// حتّى تنتهي مدّة رمزه (٧ أيّام) — حتّى لو عُطّل حسابه أو غُيّرت كلمة سرّه.
// لحسابٍ بدور `admin` هذا يعني صلاحيّةً كاملةً في البرّيّة لأسبوع.
//
// العلاج هنا عمودٌ واحد: `staff.tokens_valid_from`. كلّ رمزٍ صدر **قبله**
// يُرفض. و«أغلق جلساته» تصير: اضبط العمود على الآن.
//
// 🔴 لماذا خريطةٌ في الذاكرة لا استعلامٌ لكلّ طلب:
//    قراءةُ صفٍّ مع كلّ طلبٍ تحوّل المصادقة من فحصِ توقيعٍ خالص إلى رحلةٍ
//    لقاعدة البيانات في كلّ نداء. والصفوف المبطَلة قليلةٌ جدّاً بطبيعتها،
//    فنحمل **المبطَلين وحدهم** كلّ ٣٠ ثانية باستعلامٍ واحد، وتبقى المصادقة
//    متزامنةً كما كانت. والإبطال من لوحتنا يُنعش الخريطة فوراً فلا ينتظر.

import { sql } from 'drizzle-orm';

/** staffId → لحظةُ الإبطال (ميلي ثانية). الغياب = لا إبطال على هذا الحساب. */
let revoked = new Map<number, number>();
let timer: NodeJS.Timeout | null = null;
let lastError = 0;

/** يعيد تحميل قائمة المبطَلين. يُنادى دوريّاً وبعد كلّ إبطال. */
export async function reloadRevocations(): Promise<void> {
  try {
    const { getDB } = await import('../config/db.js');
    const db = getDB();
    if (!db) return;
    const res: any = await db.execute(
      sql`SELECT id, tokens_valid_from FROM staff WHERE tokens_valid_from IS NOT NULL`,
    );
    const rows: any[] = res.rows || res || [];
    const next = new Map<number, number>();
    for (const r of rows) {
      const t = new Date(r.tokens_valid_from).getTime();
      if (Number.isFinite(t)) next.set(Number(r.id), t);
    }
    revoked = next;
  } catch (e: any) {
    // 🔴 لا نُفرِغ الخريطة عند الفشل: إفراغها يعني إعادةَ إحياء جلساتٍ أُغلقت.
    //    نُبقي آخر نسخةٍ صالحة ونسجّل مرّةً كلّ دقيقة حتّى لا نغرق السجلّ.
    if (Date.now() - lastError > 60_000) {
      lastError = Date.now();
      console.warn('⚠️ [revocation] تعذّر تحميل قائمة الإبطال:', e?.message);
    }
  }
}

/** يبدأ التحديث الدوريّ — يُنادى مرّةً عند الإقلاع */
export function startRevocationWatcher(everyMs = 30_000): void {
  if (timer) return;
  void reloadRevocations();
  timer = setInterval(() => void reloadRevocations(), everyMs);
  timer.unref?.();
}

/**
 * هل هذا الرمز مبطَل؟ متزامنة عمداً — لا تلمس قاعدة البيانات.
 * `iat` يضعه jsonwebtoken في كلّ رمزٍ يوقّعه (بالثواني).
 */
export function isStaffTokenRevoked(payload: { id?: number; iat?: number } | null | undefined): boolean {
  if (!payload?.id) return false;
  const cut = revoked.get(Number(payload.id));
  if (!cut) return false;
  // رمزٌ بلا `iat` لا يمكن الحكم على زمنه — ومع وجود إبطالٍ على الحساب
  // يُرفض. الخطأ في جانب الإغلاق لا في جانب الفتح.
  if (!payload.iat) return true;
  return payload.iat * 1000 < cut;
}

/** يضبط لحظة الإبطال لموظّف ويُنعش الخريطة فوراً */
export async function revokeStaffSessions(staffId: number): Promise<Date> {
  const { getDB } = await import('../config/db.js');
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  const now = new Date();
  await db.execute(sql`UPDATE staff SET tokens_valid_from = ${now} WHERE id = ${staffId}`);
  revoked.set(staffId, now.getTime());   // فوريّ، لا ينتظر الدورة التالية
  return now;
}
