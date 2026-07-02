// ══════════════════════════════════════════════════════
// 🖨️ خدمة تخطيط الطباعة — تحميل/حلّ التخطيط + تضمين الورق الرسمي
// تُستخدم من مسارات print-layout ومن مُصيّر التقارير (reports /export).
// ══════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { Database } from '../config/db.js';
import { printLayouts, letterheads } from '../schemas/print-layout.schema.js';

export const LETTERHEADS_DIR = path.resolve(process.cwd(), 'uploads/letterheads');

// ── الأنواع ──
export interface ElementPos {
  x: number; y: number; w?: number; fontSize?: number;
  color?: string; bold?: boolean; align?: 'right' | 'left' | 'center';
  hidden?: boolean; text?: string; zone?: 'header' | 'footer';
}
export interface SectionConfig {
  hidden?: boolean;
  order?: number;
  x?: number;    // إزاحة أفقية بالمليمتر من يمين منطقة المحتوى
  y?: number;    // مسافة قبل القسم بالمليمتر (تقبل سالباً للسحب لأعلى)
  w?: number;    // عرض القسم بالمليمتر (فارغ = تلقائي)
  fs?: number;   // حجم خط القسم (px، فارغ = يرث baseFontSize)
}

export interface LayoutConfig {
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number };
  headerHeight: number;
  footerHeight: number;
  showLetterhead: boolean;
  elements: Record<string, ElementPos>;
  // إعدادات أقسام جسم التقرير (إخفاء/ترتيب) — المفتاح من sectionKeyOf
  sections: Record<string, SectionConfig>;
  table: { thBg: string; thColor: string; thBorder: string; stripe: boolean; baseFontSize: number };
}
export interface ResolvedLayout extends LayoutConfig {
  letterheadDataUri: string | null;
}

export const DEFAULT_LAYOUT: LayoutConfig = {
  orientation: 'portrait',
  margins: { top: 30, right: 12, bottom: 18, left: 12 },
  headerHeight: 0,
  footerHeight: 0,
  showLetterhead: true,
  elements: {},
  sections: {},
  table: { thBg: '#f2ede2', thColor: '#5a4a2a', thBorder: '#e2d9c5', stripe: true, baseFontSize: 11 },
};

// دمج تخطيط خام مع الافتراضي (حماية من الحقول الناقصة)
export function mergeLayout(raw: any): LayoutConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    orientation: r.orientation === 'landscape' ? 'landscape' : 'portrait',
    margins: { ...DEFAULT_LAYOUT.margins, ...(r.margins || {}) },
    headerHeight: Number.isFinite(r.headerHeight) ? r.headerHeight : DEFAULT_LAYOUT.headerHeight,
    footerHeight: Number.isFinite(r.footerHeight) ? r.footerHeight : DEFAULT_LAYOUT.footerHeight,
    showLetterhead: r.showLetterhead !== false,
    elements: r.elements && typeof r.elements === 'object' ? r.elements : {},
    sections: r.sections && typeof r.sections === 'object' ? r.sections : {},
    table: { ...DEFAULT_LAYOUT.table, ...(r.table || {}) },
  };
}

// قراءة صورة الورق الرسمي وتحويلها إلى data URI (لتضمينها في HTML لـ Puppeteer)
export async function letterheadDataUri(db: Database, letterheadId: number | null | undefined): Promise<string | null> {
  if (!letterheadId) return null;
  const [lh] = await db.select().from(letterheads).where(eq(letterheads.id, letterheadId)).limit(1);
  if (!lh || lh.deletedAt) return null;
  try {
    const filePath = path.join(LETTERHEADS_DIR, lh.imageFilename);
    const buf = fs.readFileSync(filePath);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

// جلب صف التخطيط لنوع تقرير (مع fallback إلى 'default')
async function getRow(db: Database, reportKey: string) {
  const [specific] = await db.select().from(printLayouts).where(eq(printLayouts.reportKey, reportKey)).limit(1);
  if (specific) return specific;
  const [def] = await db.select().from(printLayouts).where(eq(printLayouts.reportKey, 'default')).limit(1);
  return def || null;
}

// ── كاش بسيط ──
let cache: Record<string, { data: ResolvedLayout | null; ts: number }> = {};
const TTL = 60_000;
export function invalidateLayoutCache() { cache = {}; }

// حلّ تخطيط جاهز للتصيير لنوع تقرير (أو null إن لا يوجد تخطيط محفوظ → سلوك افتراضي)
export async function resolveLayoutForKey(db: Database, reportKey: string): Promise<ResolvedLayout | null> {
  const hit = cache[reportKey];
  if (hit && Date.now() - hit.ts < TTL) return hit.data;

  const row = await getRow(db, reportKey);
  let data: ResolvedLayout | null = null;
  if (row) {
    const merged = mergeLayout(row.layout);
    const uri = merged.showLetterhead ? await letterheadDataUri(db, row.letterheadId) : null;
    data = { ...merged, letterheadDataUri: uri };
  }
  cache[reportKey] = { data, ts: Date.now() };
  return data;
}

// حلّ تخطيط من كائن خام (للمعاينة الحيّة قبل الحفظ)
export async function resolveFromRaw(db: Database, rawLayout: any, letterheadId: number | null): Promise<ResolvedLayout> {
  const merged = mergeLayout(rawLayout);
  const uri = merged.showLetterhead ? await letterheadDataUri(db, letterheadId) : null;
  return { ...merged, letterheadDataUri: uri };
}
