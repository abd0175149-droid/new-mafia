// ══════════════════════════════════════════════════════
// 🎨 تنسيق الخلايا (عميل) — مطابق لـ backend render/format.ts
// ══════════════════════════════════════════════════════

import type { CellFormat } from './reportsApi';

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
