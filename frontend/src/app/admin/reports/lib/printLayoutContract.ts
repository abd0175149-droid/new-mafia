// ══════════════════════════════════════════════════════
// 🖨️ عقد تخطيط الطباعة — العناصر المعياريّة + الافتراضات + المتغيّرات
// مشترك بين المحرّر والمُصيّر (نفس معرّفات العناصر).
// ══════════════════════════════════════════════════════

export interface ElementPos {
  x: number; y: number; w?: number; fontSize?: number;
  color?: string; bold?: boolean; align?: 'right' | 'left' | 'center';
  hidden?: boolean; text?: string; zone?: 'header' | 'footer';
}

export interface SectionConfig { hidden?: boolean; order?: number; }

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

// مفتاح ثابت لكل قسم — مطابق حرفياً لدالة السيرفر (html-template.sectionKeyOf)
export function sectionKeyOf(s: { type: string; titleAr?: string }, i: number): string {
  return `${s.type}|${s.titleAr || i}`;
}
export const TOTALS_KEY = '__totals';

// العناصر المعياريّة المتاحة لكل تقرير (بنية موحّدة لأن تقاريرنا متجانسة)
export const STANDARD_ELEMENTS: { id: string; labelAr: string; hasText?: boolean }[] = [
  { id: 'title',     labelAr: 'عنوان التقرير' },
  { id: 'subtitle',  labelAr: 'العنوان الفرعي' },
  { id: 'generated', labelAr: 'تاريخ الإنشاء والمُنشئ' },
  { id: 'filters',   labelAr: 'ملخّص الفلاتر' },
  { id: 'signature', labelAr: 'التوقيع', hasText: true },
  { id: 'footer',    labelAr: 'تذييل', hasText: true },
];

export const VARIABLES: { key: string; labelAr: string }[] = [
  { key: '{{report_title}}', labelAr: 'عنوان التقرير' },
  { key: '{{subtitle}}',     labelAr: 'العنوان الفرعي' },
  { key: '{{period}}',       labelAr: 'الفترة' },
  { key: '{{filters}}',      labelAr: 'الفلاتر' },
  { key: '{{generated_by}}', labelAr: 'المُنشئ' },
  { key: '{{generated_at}}', labelAr: 'تاريخ الإنشاء' },
  { key: '{{currency}}',     labelAr: 'العملة' },
];

export const DEFAULT_LAYOUT: LayoutConfig = {
  orientation: 'portrait',
  margins: { top: 30, right: 12, bottom: 18, left: 12 },
  headerHeight: 0,
  footerHeight: 0,
  showLetterhead: true,
  elements: {
    title:     { x: 12, y: 8,  w: 150, fontSize: 16, color: '#111111', bold: true, hidden: false },
    subtitle:  { x: 12, y: 20, fontSize: 10, color: '#555555', hidden: false },
    generated: { x: 12, y: 28, fontSize: 8,  color: '#888888', hidden: false },
  },
  sections: {},
  table: { thBg: '#f2ede2', thColor: '#5a4a2a', thBorder: '#e2d9c5', stripe: true, baseFontSize: 11 },
};

export function labelForElement(id: string): string {
  const std = STANDARD_ELEMENTS.find((e) => e.id === id);
  if (std) return std.labelAr;
  if (id.startsWith('custom_')) return 'حقل نصّي';
  return id;
}
