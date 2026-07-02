// ══════════════════════════════════════════════════════
// 🎨 تنسيق الخلايا — مصدر واحد لتنسيق القيم (سيرفر)
// نسخة مطابقة لـ frontend formatCell.ts لضمان تطابق الشاشة/PDF/Excel.
// ══════════════════════════════════════════════════════

import type { CellFormat } from '../types.js';

const AR = 'ar-IQ';

export function formatCell(value: unknown, format?: CellFormat): string {
  if (value === null || value === undefined || value === '') {
    return format === 'currency' || format === 'number' || format === 'percent' ? '0' : '—';
  }

  switch (format) {
    case 'currency': {
      const n = Number(value);
      return `${(Number.isFinite(n) ? n : 0).toLocaleString(AR)} د.ع`;
    }
    case 'number': {
      const n = Number(value);
      return (Number.isFinite(n) ? n : 0).toLocaleString(AR);
    }
    case 'percent': {
      const n = Number(value);
      return `${Number.isFinite(n) ? n : 0}%`;
    }
    case 'date': {
      try { return new Date(value as any).toLocaleDateString(AR, { year: 'numeric', month: 'long', day: 'numeric' }); }
      catch { return String(value); }
    }
    case 'datetime': {
      try {
        const d = new Date(value as any);
        return `${d.toLocaleDateString(AR)} ${d.toLocaleTimeString(AR, { hour: '2-digit', minute: '2-digit' })}`;
      } catch { return String(value); }
    }
    case 'badge':
    case 'text':
    default:
      return String(value);
  }
}

/** استبدال متغيّرات القوالب {{...}} داخل نصوص الحقول المخصّصة من بيانات المستند. */
export function resolveVars(text: string, doc: { header: any; totals?: any[] }): string {
  if (!text || text.indexOf('{{') === -1) return text || '';
  const h = doc.header || {};
  const generatedAt = (() => { try { return new Date(h.generatedAt).toLocaleString('ar-IQ'); } catch { return h.generatedAt || ''; } })();
  const vars: Record<string, string> = {
    report_title: h.titleAr || '',
    subtitle: h.subtitleAr || '',
    period: h.subtitleAr || (Array.isArray(h.filtersSummaryAr) ? h.filtersSummaryAr.join(' — ') : ''),
    filters: Array.isArray(h.filtersSummaryAr) ? h.filtersSummaryAr.join(' — ') : '',
    generated_by: h.generatedByAr || '',
    generated_at: generatedAt,
    currency: 'د.ع',
  };
  // إجماليات حسب التسمية: {{total:اسم البند}}
  for (const t of doc.totals || []) {
    if (t?.labelAr) vars[`total:${t.labelAr}`] = String(t.value ?? '');
  }
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, key) => (key in vars ? vars[key] : `{{${key}}}`));
}

/** رقم خام غير مُنسّق (لخلايا Excel الرقمية). */
export function rawNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** تنسيق أرقام Excel المقابل لكل CellFormat. */
export function excelNumFmt(format?: CellFormat): string | undefined {
  switch (format) {
    case 'currency': return '#,##0 "د.ع"';
    case 'number':   return '#,##0';
    case 'percent':  return '0"%"';
    default:         return undefined;
  }
}
