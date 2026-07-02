// ══════════════════════════════════════════════════════
// 📡 عميل واجهة التقارير — Reports API client
// ══════════════════════════════════════════════════════

const API = process.env.NEXT_PUBLIC_API_URL || '';

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ── الأنواع ──
export type ParamType =
  | 'activity-picker' | 'player-picker' | 'location-picker' | 'season-picker'
  | 'date-range' | 'select' | 'multi-select' | 'toggle';

export interface ReportParam {
  key: string;
  type: ParamType;
  labelAr: string;
  required?: boolean;
  defaultValue?: unknown;
  options?: { value: string; labelAr: string }[];
  optionsSource?: string;
  helpAr?: string;
}

export interface ReportDefinitionDTO {
  key: string;
  titleAr: string;
  descriptionAr: string;
  icon: string;
  category: 'financial' | 'players' | 'games' | 'operations' | 'staff';
  params: ReportParam[];
  formats: ('pdf' | 'excel')[];
}

export type CellFormat = 'currency' | 'number' | 'percent' | 'date' | 'datetime' | 'text' | 'badge';
export type Tone = 'amber' | 'green' | 'red' | 'blue' | 'purple' | 'gray';

export interface ReportColumn { key: string; labelAr: string; align?: 'right' | 'left' | 'center'; format?: CellFormat; }
export interface ReportKpi { icon?: string; labelAr: string; value: string | number; sub?: string; tone?: Tone; format?: CellFormat; }

export type ReportSection =
  | { type: 'kpis'; titleAr?: string; items: ReportKpi[] }
  | { type: 'table'; titleAr?: string; columns: ReportColumn[]; rows: Record<string, unknown>[]; totalsRow?: Record<string, unknown>; emptyAr?: string }
  | { type: 'keyvalue'; titleAr?: string; items: { labelAr: string; value: string | number; format?: CellFormat }[] }
  | { type: 'group'; titleAr?: string; children: ReportSection[] };

export interface ReportDocument {
  header: { titleAr: string; subtitleAr?: string; generatedAt: string; generatedByAr?: string; filtersSummaryAr?: string[]; currency: 'IQD' };
  sections: ReportSection[];
  totals?: { labelAr: string; value: string | number; format?: CellFormat; tone?: Tone }[];
}

export interface PickerOption { value: string; labelAr: string; }

// ── الطلبات ──
async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.error || `خطأ ${res.status}`);
  return data;
}

export async function getTypes(): Promise<ReportDefinitionDTO[]> {
  const res = await fetch(`${API}/api/reports/types`, { headers: authHeaders() });
  const data = await jsonOrThrow(res);
  return data.reports as ReportDefinitionDTO[];
}

export async function getOptions(source: string, q?: string): Promise<PickerOption[]> {
  const qs = `source=${encodeURIComponent(source)}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  const res = await fetch(`${API}/api/reports/options?${qs}`, { headers: authHeaders() });
  const data = await jsonOrThrow(res);
  return data.options as PickerOption[];
}

export async function generateReport(key: string, params: Record<string, unknown>): Promise<ReportDocument> {
  const res = await fetch(`${API}/api/reports/generate`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ key, params }),
  });
  const data = await jsonOrThrow(res);
  return data.document as ReportDocument;
}

export async function exportReport(key: string, params: Record<string, unknown>, format: 'pdf' | 'excel'): Promise<void> {
  const res = await fetch(`${API}/api/reports/export`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ key, params, format }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'فشل التصدير');
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const match = cd.match(/filename\*=UTF-8''(.+)$/);
  const fallback = `report.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
  const name = match ? decodeURIComponent(match[1]) : fallback;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}
