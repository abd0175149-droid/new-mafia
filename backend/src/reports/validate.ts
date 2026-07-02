// ══════════════════════════════════════════════════════
// ✅ التحقّق من مدخلات التقرير وتحويلها (Coerce + Validate)
// ══════════════════════════════════════════════════════

import type { ReportDefinition, ReportParam } from './types.js';

export interface ValidateResult {
  ok: boolean;
  params: Record<string, any>;
  errorAr?: string;
}

const isoDate = (s: unknown): string | null => {
  if (typeof s !== 'string' || !s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return s.length >= 10 ? s.slice(0, 10) : d.toISOString().slice(0, 10);
};

function coerceOne(p: ReportParam, raw: any): { value?: any; errorAr?: string } {
  const missing = raw === undefined || raw === null || raw === '';

  switch (p.type) {
    case 'activity-picker':
    case 'player-picker':
    case 'location-picker':
    case 'season-picker': {
      if (missing) return p.required ? { errorAr: `المعامل "${p.labelAr}" مطلوب` } : {};
      const n = parseInt(String(raw), 10);
      if (!Number.isFinite(n)) return { errorAr: `قيمة غير صالحة للمعامل "${p.labelAr}"` };
      return { value: n };
    }

    case 'date-range': {
      const from = isoDate(raw?.from) ?? (p.required ? null : '2020-01-01');
      const to = isoDate(raw?.to) ?? (p.required ? null : new Date().toISOString().slice(0, 10));
      if (!from || !to) return p.required ? { errorAr: `المعامل "${p.labelAr}" مطلوب` } : {};
      if (from > to) return { errorAr: `تاريخ البداية بعد تاريخ النهاية في "${p.labelAr}"` };
      return { value: { from, to } };
    }

    case 'select': {
      if (missing) return p.required ? { errorAr: `المعامل "${p.labelAr}" مطلوب` } : { value: p.defaultValue };
      const val = String(raw);
      if (p.options && !p.options.some((o) => o.value === val)) return { errorAr: `خيار غير صالح في "${p.labelAr}"` };
      return { value: val };
    }

    case 'multi-select': {
      if (missing) return p.required ? { errorAr: `المعامل "${p.labelAr}" مطلوب` } : { value: [] };
      const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      const allowed = p.options?.map((o) => o.value);
      const filtered = allowed ? arr.filter((v) => allowed.includes(v)) : arr;
      return { value: filtered };
    }

    case 'toggle':
      return { value: raw === true || raw === 'true' || raw === 1 || raw === '1' };

    default:
      return { value: raw };
  }
}

export function coerceAndValidate(def: ReportDefinition, raw: Record<string, any>): ValidateResult {
  const params: Record<string, any> = {};
  for (const p of def.params) {
    const res = coerceOne(p, raw?.[p.key]);
    if (res.errorAr) return { ok: false, params, errorAr: res.errorAr };
    if (res.value !== undefined) params[p.key] = res.value;
  }
  return { ok: true, params };
}
