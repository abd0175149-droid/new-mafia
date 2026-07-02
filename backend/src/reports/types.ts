// ══════════════════════════════════════════════════════
// 📊 أنواع نظام التقارير — Report Management Types
// نظام مُعرّف بالبيانات: كل تقرير = تعريف واحد (params + resolve)
// يُنتج مستنداً موحّداً (ReportDocument) يُعرض على الشاشة ويُصدَّر PDF/Excel.
// ══════════════════════════════════════════════════════

import type { Database } from '../config/db.js';

// ── أنواع حقول المدخلات ───────────────────────────────
export type ReportParamType =
  | 'activity-picker'   // → activityId: number
  | 'player-picker'     // → playerId: number
  | 'location-picker'   // → locationId: number
  | 'season-picker'     // → seasonId: number
  | 'date-range'        // → { from: string; to: string }  (ISO YYYY-MM-DD)
  | 'select'            // → string
  | 'multi-select'      // → string[]
  | 'toggle';           // → boolean

export type OptionSource =
  | 'activities' | 'players' | 'locations' | 'seasons' | 'expenseCategories' | 'staff';

export interface ReportParam {
  key: string;
  type: ReportParamType;
  labelAr: string;
  required?: boolean;
  defaultValue?: unknown;
  options?: { value: string; labelAr: string }[];   // ثابتة (select / multi-select)
  optionsSource?: OptionSource;                      // ديناميكية (pickers)
  helpAr?: string;
}

// ── أقسام المستند ─────────────────────────────────────
export type CellFormat =
  | 'currency' | 'number' | 'percent' | 'date' | 'datetime' | 'text' | 'badge';

export type Tone = 'amber' | 'green' | 'red' | 'blue' | 'purple' | 'gray';

export interface ReportKpi {
  icon?: string;
  labelAr: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
  format?: CellFormat;
}

export interface ReportColumn {
  key: string;
  labelAr: string;
  align?: 'right' | 'left' | 'center';
  format?: CellFormat;
}

export type ReportSection =
  | { type: 'kpis'; titleAr?: string; items: ReportKpi[] }
  | {
      type: 'table';
      titleAr?: string;
      columns: ReportColumn[];
      rows: Record<string, unknown>[];
      totalsRow?: Record<string, unknown>;
      emptyAr?: string;
    }
  | { type: 'keyvalue'; titleAr?: string; items: { labelAr: string; value: string | number; format?: CellFormat }[] }
  | { type: 'group'; titleAr?: string; children: ReportSection[] };

export interface ReportTotal {
  labelAr: string;
  value: string | number;
  format?: CellFormat;
  tone?: Tone;
}

export interface ReportDocument {
  header: {
    titleAr: string;
    subtitleAr?: string;
    generatedAt: string;              // ISO
    generatedByAr?: string;
    filtersSummaryAr?: string[];
    currency: 'IQD';
  };
  sections: ReportSection[];
  totals?: ReportTotal[];
}

// ── سياق التنفيذ ──────────────────────────────────────
export type StaffRole = 'admin' | 'manager' | 'leader' | 'location_owner' | 'accountant';

export interface ReportUser {
  id: number;
  username: string;
  role: StaffRole;
  displayName: string;
}

export interface ReportContext {
  db: Database;
  params: Record<string, any>;
  user: ReportUser;
}

// ── تعريف التقرير ─────────────────────────────────────
export type ReportCategory = 'financial' | 'players' | 'games' | 'operations' | 'staff';
export type ReportFormat = 'pdf' | 'excel';

export interface ReportDefinition {
  key: string;
  titleAr: string;
  descriptionAr: string;
  icon: string;
  category: ReportCategory;
  roles: StaffRole[];
  params: ReportParam[];
  formats: ReportFormat[];
  resolve: (ctx: ReportContext) => Promise<ReportDocument>;
}

// شكل التعريف المُرسَل للواجهة (بلا resolve)
export interface ReportDefinitionDTO {
  key: string;
  titleAr: string;
  descriptionAr: string;
  icon: string;
  category: ReportCategory;
  params: ReportParam[];
  formats: ReportFormat[];
}

export const CATEGORY_LABELS: Record<ReportCategory, { labelAr: string; icon: string }> = {
  financial:  { labelAr: 'التقارير المالية', icon: '💰' },
  operations: { labelAr: 'تقارير العمليات', icon: '🏢' },
  players:    { labelAr: 'تقارير اللاعبين', icon: '🎮' },
  games:      { labelAr: 'تقارير المباريات', icon: '⚔️' },
  staff:      { labelAr: 'الحوكمة والإشراف', icon: '🛡️' },
};
