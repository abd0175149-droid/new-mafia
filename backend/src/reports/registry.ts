// ══════════════════════════════════════════════════════
// 🗂️ سجلّ التقارير — Report Registry
// كل تقرير مُسجّل هنا (استيراد صريح — لا glob تحت ESM/tsx).
// إضافة تقرير = ملف *.report.ts + سطر استيراد + إدراج في المصفوفة.
// ══════════════════════════════════════════════════════

import type { ReportDefinition, ReportDefinitionDTO, StaffRole } from './types.js';

// ── التقارير الأساسية ──
import { activitySummaryReport } from './definitions/activity-summary.report.js';
import { accountingBalanceReport } from './definitions/accounting-balance.report.js';
import { playerStatementReport } from './definitions/player-statement.report.js';

// ── التقارير الإضافية ──
import { receivablesReport } from './definitions/receivables.report.js';
import { expensesByCategoryReport } from './definitions/expenses-by-category.report.js';
import { foundationalCostsReport } from './definitions/foundational-costs.report.js';
import { locationPerformanceReport } from './definitions/location-performance.report.js';
import { partnerSettlementReport } from './definitions/partner-settlement.report.js';
import { staffPerformanceReport } from './definitions/staff-performance.report.js';
import { reservationsAttendanceReport } from './definitions/reservations-attendance.report.js';
import { reservationRosterReport } from './definitions/reservation-roster.report.js';
import { offersAddonSalesReport } from './definitions/offers-addon-sales.report.js';
import { ticketsReport } from './definitions/tickets.report.js';
import { seasonLeaderboardReport } from './definitions/season-leaderboard.report.js';
import { playerRetentionReport } from './definitions/player-retention.report.js';
import { gameAnalyticsReport } from './definitions/game-analytics.report.js';
import { revenueTrendReport } from './definitions/revenue-trend.report.js';
import { staffActionAuditReport } from './definitions/staff-action-audit.report.js';
import { noShowReport } from './definitions/no-show.report.js';

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  // مالية
  accountingBalanceReport,
  receivablesReport,
  expensesByCategoryReport,
  foundationalCostsReport,
  partnerSettlementReport,
  revenueTrendReport,
  // عمليات
  activitySummaryReport,
  locationPerformanceReport,
  reservationsAttendanceReport,
  reservationRosterReport,
  offersAddonSalesReport,
  ticketsReport,
  noShowReport,
  // لاعبون
  playerStatementReport,
  seasonLeaderboardReport,
  playerRetentionReport,
  // مباريات
  gameAnalyticsReport,
  // حوكمة
  staffPerformanceReport,
  staffActionAuditReport,
];

const BY_KEY = new Map(REPORT_DEFINITIONS.map((d) => [d.key, d]));

export function getByKey(key: string): ReportDefinition | undefined {
  return BY_KEY.get(key);
}

export function getForRole(role: StaffRole): ReportDefinition[] {
  return REPORT_DEFINITIONS.filter((d) => d.roles.includes(role));
}

export function toDTO(def: ReportDefinition): ReportDefinitionDTO {
  return {
    key: def.key, titleAr: def.titleAr, descriptionAr: def.descriptionAr,
    icon: def.icon, category: def.category, params: def.params, formats: def.formats,
  };
}
