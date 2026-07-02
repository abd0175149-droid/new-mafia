// ══════════════════════════════════════════════════════
// 📄 قالب HTML لتوليد PDF (RTL عربي) — يُغذّى إلى Puppeteer
// يمشي على نفس أقسام ReportDocument المستخدمة في الشاشة و Excel.
// ══════════════════════════════════════════════════════

import type { ReportDocument, ReportSection, ReportColumn } from '../types.js';
import { formatCell } from './format.js';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toneColor(tone?: string): string {
  switch (tone) {
    case 'green': return '#059669';
    case 'red':   return '#dc2626';
    case 'blue':  return '#2563eb';
    case 'purple':return '#7c3aed';
    case 'gray':  return '#6b7280';
    default:      return '#b45309'; // amber
  }
}

function renderCell(row: Record<string, unknown>, col: ReportColumn): string {
  const raw = row[col.key];
  if (col.format === 'badge') {
    return `<span class="badge">${esc(formatCell(raw, 'badge'))}</span>`;
  }
  return esc(formatCell(raw, col.format));
}

function renderSection(s: ReportSection): string {
  switch (s.type) {
    case 'kpis':
      return `
        ${s.titleAr ? `<h3 class="sec-title">${esc(s.titleAr)}</h3>` : ''}
        <div class="kpi-grid">
          ${s.items.map((k) => `
            <div class="kpi" style="border-color:${toneColor(k.tone)}22">
              <div class="kpi-icon">${esc(k.icon ?? '')}</div>
              <div class="kpi-label">${esc(k.labelAr)}</div>
              <div class="kpi-value" style="color:${toneColor(k.tone)}">${esc(formatCell(k.value, k.format))}</div>
              ${k.sub ? `<div class="kpi-sub">${esc(k.sub)}</div>` : ''}
            </div>`).join('')}
        </div>`;

    case 'keyvalue':
      return `
        ${s.titleAr ? `<h3 class="sec-title">${esc(s.titleAr)}</h3>` : ''}
        <table class="kv">
          ${s.items.map((it) => `
            <tr><td class="kv-label">${esc(it.labelAr)}</td>
                <td class="kv-value">${esc(formatCell(it.value, it.format))}</td></tr>`).join('')}
        </table>`;

    case 'table': {
      if (!s.rows?.length) {
        return `${s.titleAr ? `<h3 class="sec-title">${esc(s.titleAr)}</h3>` : ''}<p class="empty">${esc(s.emptyAr ?? 'لا توجد بيانات')}</p>`;
      }
      const head = s.columns.map((c) => `<th>${esc(c.labelAr)}</th>`).join('');
      const body = s.rows.map((r) =>
        `<tr>${s.columns.map((c) => `<td class="al-${c.align ?? 'right'}">${renderCell(r, c)}</td>`).join('')}</tr>`).join('');
      const foot = s.totalsRow
        ? `<tr class="totals">${s.columns.map((c) => `<td class="al-${c.align ?? 'right'}">${renderCell(s.totalsRow!, c)}</td>`).join('')}</tr>`
        : '';
      return `
        ${s.titleAr ? `<h3 class="sec-title">${esc(s.titleAr)}</h3>` : ''}
        <table class="data"><thead><tr>${head}</tr></thead><tbody>${body}${foot}</tbody></table>`;
    }

    case 'group':
      return `
        ${s.titleAr ? `<h2 class="grp-title">${esc(s.titleAr)}</h2>` : ''}
        ${s.children.map(renderSection).join('')}`;
  }
}

export function renderDocumentHtml(doc: ReportDocument): string {
  const generated = (() => {
    try { return new Date(doc.header.generatedAt).toLocaleString('ar-IQ'); }
    catch { return doc.header.generatedAt; }
  })();

  const filters = (doc.header.filtersSummaryAr ?? []).filter(Boolean);

  const totals = doc.totals?.length
    ? `<div class="grand-totals">
        ${doc.totals.map((t) => `
          <div class="gt"><span class="gt-label">${esc(t.labelAr)}</span>
          <span class="gt-value" style="color:${toneColor(t.tone)}">${esc(formatCell(t.value, t.format))}</span></div>`).join('')}
      </div>`
    : '';

  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Noto Naskh Arabic", "Noto Sans Arabic", "Tajawal", "DejaVu Sans", sans-serif;
    color: #1a1a1a; font-size: 12px; line-height: 1.6; direction: rtl;
  }
  .cover { text-align: center; padding: 24px 0 14px; border-bottom: 3px solid #C5A059; margin-bottom: 18px; }
  .cover .logo { font-size: 34px; }
  .cover h1 { font-size: 20px; margin: 6px 0 2px; font-weight: 800; }
  .cover .sub { font-size: 11px; color: #777; margin: 0; }
  .cover h2 { font-size: 16px; margin: 12px 0 2px; color: #222; }
  .cover .meta { font-size: 10px; color: #999; margin-top: 8px; }
  .chips { margin-top: 8px; }
  .chip { display: inline-block; background: #f4efe4; color: #6b5a2e; border-radius: 10px; padding: 2px 10px; font-size: 10px; margin: 2px; }
  .grp-title { font-size: 15px; font-weight: 800; margin: 20px 0 8px; color: #111; border-right: 4px solid #C5A059; padding-right: 8px; }
  .sec-title { font-size: 13px; font-weight: 700; margin: 16px 0 8px; color: #333; }
  .kpi-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .kpi { flex: 1 1 140px; border: 1px solid #ddd; border-radius: 10px; padding: 8px 10px; background: #fafafa; }
  .kpi-icon { font-size: 16px; }
  .kpi-label { font-size: 10px; color: #777; }
  .kpi-value { font-size: 16px; font-weight: 800; }
  .kpi-sub { font-size: 9px; color: #999; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; }
  table.data th { background: #f2ede2; color: #5a4a2a; font-size: 11px; padding: 6px 8px; border: 1px solid #e2d9c5; text-align: right; }
  table.data td { padding: 5px 8px; border: 1px solid #eee; font-size: 11px; }
  table.data tr:nth-child(even) td { background: #fafafa; }
  table.data tr.totals td { background: #f6f1e6; font-weight: 800; border-top: 2px solid #C5A059; }
  .al-left { text-align: left; } .al-center { text-align: center; } .al-right { text-align: right; }
  .badge { background: #eef1f4; border-radius: 8px; padding: 1px 8px; font-size: 10px; }
  table.kv td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 11px; }
  .kv-label { color: #777; width: 40%; } .kv-value { font-weight: 700; }
  .empty { color: #999; text-align: center; padding: 12px; font-size: 11px; }
  .grand-totals { margin-top: 16px; padding: 10px; background: #f8f5ee; border: 1px solid #e7ddc7; border-radius: 10px; display: flex; flex-wrap: wrap; gap: 16px; }
  .gt { display: flex; flex-direction: column; }
  .gt-label { font-size: 10px; color: #777; } .gt-value { font-size: 16px; font-weight: 800; }
</style></head>
<body>
  <div class="cover">
    <div class="logo">🎭</div>
    <h1>نادي المافيا</h1>
    <p class="sub">Mafia Club — نظام التقارير</p>
    <h2>${esc(doc.header.titleAr)}</h2>
    ${doc.header.subtitleAr ? `<p class="sub">${esc(doc.header.subtitleAr)}</p>` : ''}
    ${filters.length ? `<div class="chips">${filters.map((f) => `<span class="chip">${esc(f)}</span>`).join('')}</div>` : ''}
    <div class="meta">أُنشئ في: ${esc(generated)}${doc.header.generatedByAr ? ` — بواسطة: ${esc(doc.header.generatedByAr)}` : ''}</div>
  </div>
  ${doc.sections.map(renderSection).join('')}
  ${totals}
</body></html>`;
}
