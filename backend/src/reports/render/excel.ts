// ══════════════════════════════════════════════════════
// 📊 توليد Excel عبر ExcelJS (سيرفر) — RTL بتنسيقات أرقام
// كل جدول جذري → ورقة؛ kpis/keyvalue → ورقة "ملخّص"؛ group → ورقة لكل جدول ابن.
// ══════════════════════════════════════════════════════

import ExcelJS from 'exceljs';
import type { ReportDocument, ReportSection } from '../types.js';
import { formatCell, rawNumber, excelNumFmt } from './format.js';

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2EDE2' } };
const TOTALS_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F1E6' } };

let sheetSeq = 0;
function safeSheetName(wb: ExcelJS.Workbook, name: string): string {
  let base = (name || 'ورقة').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'ورقة';
  let candidate = base;
  while (wb.getWorksheet(candidate)) candidate = `${base} ${++sheetSeq}`;
  return candidate;
}

function addTableSheet(wb: ExcelJS.Workbook, title: string, section: Extract<ReportSection, { type: 'table' }>) {
  const ws = wb.addWorksheet(safeSheetName(wb, title), { views: [{ rightToLeft: true }] });

  const header = ws.addRow(section.columns.map((c) => c.labelAr));
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, color: { argb: 'FF5A4A2A' } };
    cell.alignment = { horizontal: 'right' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2D9C5' } } };
  });

  for (const r of section.rows) {
    const row = ws.addRow(section.columns.map((c) => {
      const numeric = c.format === 'currency' || c.format === 'number' || c.format === 'percent';
      return numeric ? rawNumber(r[c.key]) : formatCell(r[c.key], c.format);
    }));
    section.columns.forEach((c, i) => {
      const fmt = excelNumFmt(c.format);
      if (fmt) row.getCell(i + 1).numFmt = fmt;
      row.getCell(i + 1).alignment = { horizontal: c.align ?? 'right' };
    });
  }

  if (section.totalsRow) {
    const row = ws.addRow(section.columns.map((c) => {
      const numeric = c.format === 'currency' || c.format === 'number' || c.format === 'percent';
      return numeric ? rawNumber(section.totalsRow![c.key]) : formatCell(section.totalsRow![c.key], c.format);
    }));
    row.eachCell((cell, i) => {
      cell.fill = TOTALS_FILL;
      cell.font = { bold: true };
      const fmt = excelNumFmt(section.columns[i - 1]?.format);
      if (fmt) cell.numFmt = fmt;
    });
  }

  section.columns.forEach((c, i) => {
    const maxLen = Math.max(c.labelAr.length, ...section.rows.map((r) => String(formatCell(r[c.key], c.format)).length));
    ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 2, 12), 40);
  });

  return ws;
}

export async function renderExcel(doc: ReportDocument): Promise<Buffer> {
  sheetSeq = 0;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Mafia Club Reports';
  wb.created = new Date();

  // ── ورقة ملخّص (رأس + kpis + keyvalue + totals) ──
  const summary = wb.addWorksheet('ملخّص', { views: [{ rightToLeft: true }] });
  summary.addRow([doc.header.titleAr]).font = { bold: true, size: 14 };
  if (doc.header.subtitleAr) summary.addRow([doc.header.subtitleAr]);
  for (const f of doc.header.filtersSummaryAr ?? []) summary.addRow([f]);
  summary.addRow([`أُنشئ في: ${(() => { try { return new Date(doc.header.generatedAt).toLocaleString('ar-IQ'); } catch { return doc.header.generatedAt; } })()}`]);
  summary.addRow([]);

  const pushKvRow = (label: string, value: string) => {
    const row = summary.addRow([label, value]);
    row.getCell(1).font = { color: { argb: 'FF777777' } };
    row.getCell(2).font = { bold: true };
  };

  const walkSummary = (sections: ReportSection[]) => {
    for (const s of sections) {
      if (s.type === 'kpis') {
        if (s.titleAr) summary.addRow([s.titleAr]).font = { bold: true };
        for (const k of s.items) pushKvRow(k.labelAr, formatCell(k.value, k.format));
        summary.addRow([]);
      } else if (s.type === 'keyvalue') {
        if (s.titleAr) summary.addRow([s.titleAr]).font = { bold: true };
        for (const it of s.items) pushKvRow(it.labelAr, formatCell(it.value, it.format));
        summary.addRow([]);
      } else if (s.type === 'group') {
        walkSummary(s.children);
      }
    }
  };
  walkSummary(doc.sections);

  if (doc.totals?.length) {
    summary.addRow([]);
    summary.addRow(['الإجماليات']).font = { bold: true };
    for (const t of doc.totals) pushKvRow(t.labelAr, formatCell(t.value, t.format));
  }
  summary.getColumn(1).width = 32;
  summary.getColumn(2).width = 26;

  // ── أوراق الجداول ──
  const walkTables = (sections: ReportSection[], prefix = '') => {
    for (const s of sections) {
      if (s.type === 'table') {
        addTableSheet(wb, s.titleAr ? `${prefix}${s.titleAr}` : 'جدول', s);
      } else if (s.type === 'group') {
        walkTables(s.children, s.titleAr ? `${s.titleAr} — ` : prefix);
      }
    }
  };
  walkTables(doc.sections);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
