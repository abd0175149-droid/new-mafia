// ══════════════════════════════════════════════════════
// 💬 إدارةُ مجموعات الواتساب — منطقةٌ وجنسٌ ورابط
//
// 🔴 المنطقةُ نقطةٌ ونصفُ قطر لا اسمُ مدينة: حدودُ المدن الإداريّة متداخلة،
//    وأقربُ ما يفهمه الجهازُ دائرةٌ حول نقطة.
//
// 🔴 والقاعدةُ الافتراضيّة **واحدةٌ إلزاماً**: بلا واحدةٍ يصير زرُّ من لم
//    تطابقه دائرةٌ زرّاً ميّتاً، وباثنتين يصير الاختيارُ بينهما عشوائيّاً.
// ══════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { logStaffAction } from '../services/staff-action-log.service.js';

const router = Router();
const rows = (r: any): any[] => (r?.rows ?? r ?? []);

const GENDERS = ['ANY', 'MALE', 'FEMALE'];

/** يتحقّق من الجسم ويُرجع خطأً نصّيّاً أو null */
function validate(b: any): string | null {
  if (!String(b?.name ?? '').trim()) return 'الاسم مطلوب';
  const url = String(b?.url ?? '').trim();
  // 🔴 رابطُ دعوةٍ لا أيَّ رابط: رابطُ محادثةٍ فرديّة (wa.me) يُفتح ولا يضمّ
  //    أحداً إلى شيء، والخطأُ لا يُكتشف إلّا بشكوى لاعب.
  if (!/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{6,}/.test(url)) {
    return 'الرابط يجب أن يكون رابطَ دعوةِ مجموعة (chat.whatsapp.com/…)';
  }
  if (!GENDERS.includes(String(b?.gender ?? 'ANY'))) return 'الجنس غير صالح';

  const isDefault = !!b?.isDefault;
  if (!isDefault) {
    const la = Number(b?.latitude), ln = Number(b?.longitude), r = Number(b?.radiusKm);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return 'حدّد الموقع على الخريطة';
    if (la < -90 || la > 90 || ln < -180 || ln > 180) return 'إحداثيّات غير صالحة';
    if (!Number.isFinite(r) || r <= 0 || r > 200) return 'نصفُ القطر بين ١ و٢٠٠ كم';
  }
  return null;
}

// ── GET / — كلُّ القواعد ──
router.get('/', authenticate, adminOnly, async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
  try {
    const r = await db.execute(sql`
      SELECT id, name, latitude, longitude, radius_km AS "radiusKm", gender, url,
             is_default AS "isDefault", is_active AS "isActive", updated_at AS "updatedAt"
      FROM wa_groups ORDER BY is_default DESC, radius_km ASC NULLS LAST, id ASC
    `);
    return res.json({ success: true, groups: rows(r) });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST / — إضافة ──
router.post('/', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
  const bad = validate(req.body);
  if (bad) return res.status(400).json({ success: false, error: bad });
  try {
    const b = req.body;
    const isDefault = !!b.isDefault;
    // افتراضيّةٌ واحدةٌ فقط — تُنزَع من غيرها قبل الإسناد
    if (isDefault) await db.execute(sql`UPDATE wa_groups SET is_default = false`);
    const r = await db.execute(sql`
      INSERT INTO wa_groups (name, latitude, longitude, radius_km, gender, url, is_default, is_active)
      VALUES (${String(b.name).trim().slice(0, 80)},
              ${isDefault ? null : Number(b.latitude)},
              ${isDefault ? null : Number(b.longitude)},
              ${isDefault ? null : Number(b.radiusKm)},
              ${String(b.gender ?? 'ANY')}, ${String(b.url).trim()},
              ${isDefault}, ${b.isActive !== false})
      RETURNING id
    `);
    logStaffAction({
      staffId: (req as any).user?.id, staffUsername: (req as any).user?.username,
      staffRole: (req as any).user?.role, source: 'rest', action: 'rest:wa-group-edit',
      outcome: 'success', targetName: String(b.name), details: { op: 'create', name: b.name },
    });
    return res.json({ success: true, id: rows(r)[0]?.id });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /:id — تعديل ──
router.put('/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
  const bad = validate(req.body);
  if (bad) return res.status(400).json({ success: false, error: bad });
  try {
    const b = req.body;
    const isDefault = !!b.isDefault;
    if (isDefault) await db.execute(sql`UPDATE wa_groups SET is_default = false WHERE id <> ${id}`);
    await db.execute(sql`
      UPDATE wa_groups SET
        name = ${String(b.name).trim().slice(0, 80)},
        latitude = ${isDefault ? null : Number(b.latitude)},
        longitude = ${isDefault ? null : Number(b.longitude)},
        radius_km = ${isDefault ? null : Number(b.radiusKm)},
        gender = ${String(b.gender ?? 'ANY')},
        url = ${String(b.url).trim()},
        is_default = ${isDefault},
        is_active = ${b.isActive !== false},
        updated_at = NOW()
      WHERE id = ${id}
    `);
    logStaffAction({
      staffId: (req as any).user?.id, staffUsername: (req as any).user?.username,
      staffRole: (req as any).user?.role, source: 'rest', action: 'rest:wa-group-edit',
      outcome: 'success', targetName: String(b.name), details: { op: 'update', id },
    });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /:id ──
router.delete('/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
  try {
    // 🔴 لا تُحذف الافتراضيّة: حذفُها يُميت زرَّ كلِّ من لا تطابقه دائرة.
    const cur = rows(await db.execute(sql`SELECT is_default, name FROM wa_groups WHERE id = ${id}`))[0];
    if (!cur) return res.status(404).json({ success: false, error: 'غير موجودة' });
    if (cur.is_default) {
      return res.status(409).json({
        success: false,
        error: 'لا تُحذف المجموعةُ الافتراضيّة — اجعل غيرَها افتراضيّةً أوّلاً',
      });
    }
    await db.execute(sql`DELETE FROM wa_groups WHERE id = ${id}`);
    logStaffAction({
      staffId: (req as any).user?.id, staffUsername: (req as any).user?.username,
      staffRole: (req as any).user?.role, source: 'rest', action: 'rest:wa-group-edit',
      outcome: 'success', targetName: String(cur.name), details: { op: 'delete', id },
    });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /preview — أيُّ مجموعةٍ يراها لاعبٌ هنا؟ ──
//
// 🔴 معاينةٌ لا تخمين: الدوائرُ تتداخل وقاعدةُ الأخصّ ليست بديهيّة، فالمالكُ
//    يجرّب نقطةً وجنساً ويرى الجوابَ قبل أن يعتمد القاعدة.
router.post('/preview', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { resolveGroup } = await import('../lib/city-groups.js');
    const r = await resolveGroup(req.body?.latitude, req.body?.longitude, req.body?.gender);
    return res.json({ success: true, ...r });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
