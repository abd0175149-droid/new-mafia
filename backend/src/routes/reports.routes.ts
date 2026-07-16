// ══════════════════════════════════════════════════════
// 📊 Reports API — نظام إدارة التقارير (definition-driven)
// نحيف: يفوّض كل شيء إلى src/reports/*
//   GET  /api/reports/types            قائمة التقارير المتاحة لدور المستخدم
//   GET  /api/reports/options          خيارات المنتقيات (activities/players/…)
//   POST /api/reports/generate         توليد ReportDocument للعرض على الشاشة
//   POST /api/reports/export           تصدير PDF/Excel كملف
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { getDB } from '../config/db.js';
import { authenticate, accountantOrAbove, managerOrAbove } from '../middleware/auth.js';
import type { StaffRole } from '../reports/types.js';
import { getByKey, getForRole, toDTO } from '../reports/registry.js';
import { coerceAndValidate } from '../reports/validate.js';
import { loadOptions } from '../reports/options.js';
import type { OptionSource } from '../reports/types.js';
import { renderPdf } from '../reports/render/pdf.js';
import { renderExcel } from '../reports/render/excel.js';
import { resolveLayoutForKey, resolveFromRaw } from '../reports/print-layout.service.js';

const router = Router();

const VALID_SOURCES: OptionSource[] = ['activities', 'players', 'locations', 'seasons', 'expenseCategories', 'staff'];

// ── قائمة أنواع التقارير المتاحة لدور المستخدم ──
router.get('/types', authenticate, accountantOrAbove, (req: Request, res: Response) => {
  const role = req.user!.role as StaffRole;
  const list = getForRole(role).map(toDTO);
  res.json({ success: true, reports: list });
});

// ── خيارات المنتقيات ──
router.get('/options', authenticate, accountantOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  const source = req.query.source as OptionSource;
  if (!VALID_SOURCES.includes(source)) return res.status(400).json({ error: 'مصدر خيارات غير صالح' });
  try {
    const options = await loadOptions(db, source, (req.query.q as string) || undefined);
    res.json({ success: true, options });
  } catch (err: any) {
    console.error('❌ reports/options error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── توليد المستند للعرض على الشاشة ──
router.post('/generate', authenticate, accountantOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const def = getByKey(req.body?.key);
  if (!def) return res.status(404).json({ error: 'تقرير غير معروف' });
  if (!def.roles.includes(req.user!.role as StaffRole)) return res.status(403).json({ error: 'ليس لديك صلاحية لهذا التقرير' });

  const v = coerceAndValidate(def, req.body?.params ?? {});
  if (!v.ok) return res.status(400).json({ error: v.errorAr });

  try {
    const document = await def.resolve({ db, params: v.params, user: req.user! as any });
    res.json({ success: true, document });
  } catch (err: any) {
    console.error(`❌ report generate [${def.key}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── تصدير ملف (PDF/Excel) ──
// الحارس الفعليّ هو def.roles لكلّ تقرير (أدناه) — فتح المسار لأيّ موظّف مصادَق يتيح
// كشوفاً تشغيليّة (كشف الحجوزات) للّيدر دون توسيع أيّ تقرير ماليّ (أدواره كما هي).
router.post('/export', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const def = getByKey(req.body?.key);
  if (!def) return res.status(404).json({ error: 'تقرير غير معروف' });
  if (!def.roles.includes(req.user!.role as StaffRole)) return res.status(403).json({ error: 'ليس لديك صلاحية لهذا التقرير' });

  const format = req.body?.format === 'excel' ? 'excel' : 'pdf';
  if (!def.formats.includes(format)) return res.status(400).json({ error: 'صيغة غير مدعومة لهذا التقرير' });

  const v = coerceAndValidate(def, req.body?.params ?? {});
  if (!v.ok) return res.status(400).json({ error: v.errorAr });

  try {
    const document = await def.resolve({ db, params: v.params, user: req.user! as any });
    const stamp = new Date().toISOString().slice(0, 10);
    const baseName = `${document.header.titleAr} - ${stamp}`;

    if (format === 'excel') {
      const buf = await renderExcel(document);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(baseName)}.xlsx`);
      return res.send(buf);
    }

    const layout = await resolveLayoutForKey(db, def.key);
    const buf = await renderPdf(document, layout);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(baseName)}.pdf`);
    return res.send(buf);
  } catch (err: any) {
    console.error(`❌ report export [${def.key}/${format}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── معاينة PDF بتخطيط غير محفوظ (للمحرّر) ──
router.post('/preview-pdf', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const def = getByKey(req.body?.key);
  if (!def) return res.status(404).json({ error: 'تقرير غير معروف' });

  const v = coerceAndValidate(def, req.body?.params ?? {});
  if (!v.ok) return res.status(400).json({ error: v.errorAr });

  try {
    const document = await def.resolve({ db, params: v.params, user: req.user! as any });
    const resolved = await resolveFromRaw(db, req.body?.layout ?? {}, req.body?.letterheadId ?? null);
    const buf = await renderPdf(document, resolved);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    return res.send(buf);
  } catch (err: any) {
    console.error(`❌ report preview [${def.key}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
