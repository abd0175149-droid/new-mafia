// ══════════════════════════════════════════════════════
// 📄 قالب HTML لتوليد PDF (RTL عربي) — يُغذّى إلى Puppeteer
// يمشي على نفس أقسام ReportDocument المستخدمة في الشاشة و Excel.
// ══════════════════════════════════════════════════════

import type { ReportDocument, ReportSection, ReportColumn } from '../types.js';
import type { ResolvedLayout, ElementPos } from '../print-layout.service.js';
import { formatCell, resolveVars } from './format.js';

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

export function renderDocumentHtml(doc: ReportDocument, layout?: ResolvedLayout | null): string {
  if (layout) return renderLayoutHtml(doc, layout);
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

// ══════════════════════════════════════════════════════
// 🖨️ وضع التخطيط — HTML يطبّق تخطيط الطباعة المخصّص + الورق الرسمي
// الورق والعناصر position:fixed (تتكرّر كل صفحة، مرجعها حافة الصفحة)؛
// المحتوى يتدفّق داخل هوامش Puppeteer.
// ══════════════════════════════════════════════════════

function elementContent(id: string, el: ElementPos, doc: ReportDocument): string {
  if (el.text) return esc(resolveVars(el.text, doc));
  const h = doc.header;
  switch (id) {
    case 'title':    return esc(h.titleAr);
    case 'subtitle': return esc(h.subtitleAr || '');
    case 'filters':  return esc((h.filtersSummaryAr || []).filter(Boolean).join('  •  '));
    case 'generated': {
      let g = ''; try { g = new Date(h.generatedAt).toLocaleString('ar-IQ'); } catch { g = h.generatedAt; }
      return esc(`أُنشئ في: ${g}${h.generatedByAr ? ` — بواسطة: ${h.generatedByAr}` : ''}`);
    }
    default: return '';
  }
}

// مفتاح ثابت لكل قسم — مطابق حرفياً لدالة الواجهة (printLayoutContract.sectionKeyOf)
export function sectionKeyOf(s: ReportSection, i: number): string {
  return `${s.type}|${(s as any).titleAr || i}`;
}
export const TOTALS_KEY = '__totals';

function renderLayoutHtml(doc: ReportDocument, L: ResolvedLayout): string {
  const isLand = L.orientation === 'landscape';
  const t = L.table;

  // إخفاء/ترتيب أقسام الجسم حسب إعدادات التخطيط
  const cfg = L.sections || {};
  const orderedSections = doc.sections
    .map((s, i) => ({ s, i, key: sectionKeyOf(s, i) }))
    .filter(({ key }) => !cfg[key]?.hidden)
    .sort((a, b) => (cfg[a.key]?.order ?? a.i) - (cfg[b.key]?.order ?? b.i));
  const totalsHidden = !!cfg[TOTALS_KEY]?.hidden;

  // غلاف قسم بموضع/عرض/خط مخصّص (يبقى في التدفّق → ترقيم صفحات سليم)
  const sectionStyle = (key: string): string => {
    const c = cfg[key] || {};
    return [
      c.y ? `margin-top:${c.y}mm` : '',
      c.x ? `margin-right:${c.x}mm` : '',
      c.w ? `width:${c.w}mm` : '',
      c.fs ? `font-size:${c.fs}px` : '',
    ].filter(Boolean).join(';');
  };
  const wrapSection = (inner: string, key: string): string => {
    const st = sectionStyle(key);
    return st ? `<div style="${st}">${inner}</div>` : inner;
  };

  const elsHtml = Object.entries(L.elements || {}).map(([id, el]) => {
    if (!el || el.hidden) return '';
    const content = elementContent(id, el, doc);
    if (!content) return '';
    const styles = [
      'position:fixed',
      `top:${el.y ?? 0}mm`,
      `right:${el.x ?? 0}mm`,
      el.w ? `width:${el.w}mm` : '',
      `font-size:${el.fontSize ?? 11}pt`,
      el.color ? `color:${el.color}` : '',
      el.bold ? 'font-weight:800' : '',
      `text-align:${el.align ?? 'right'}`,
      'z-index:3',
    ].filter(Boolean).join(';');
    return `<div style="${styles}">${content}</div>`;
  }).join('');

  const lhBg = (L.showLetterhead && L.letterheadDataUri)
    ? `<div style="position:fixed;inset:0;z-index:0;background-image:url('${L.letterheadDataUri}');background-size:100% 100%;background-repeat:no-repeat;"></div>`
    : '';

  const grand = (doc.totals?.length && !totalsHidden)
    ? wrapSection(`<div class="grand-totals">${doc.totals.map((gt) => `<div class="gt"><span class="gt-label">${esc(gt.labelAr)}</span><span class="gt-value" style="color:${toneColor(gt.tone)}">${esc(formatCell(gt.value, gt.format))}</span></div>`).join('')}</div>`, TOTALS_KEY)
    : '';

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
    @page { size: A4 ${isLand ? 'landscape' : 'portrait'}; margin: 0; }
    * { box-sizing: border-box; }
    html,body { margin:0; padding:0; }
    body { font-family:"Noto Naskh Arabic","Noto Sans Arabic","Tajawal","DejaVu Sans",sans-serif; color:#1a1a1a; font-size:${t.baseFontSize}px; line-height:1.6; direction:rtl; }
    .content { position:relative; z-index:2; }
    /* أحجام em نسبية داخل المحتوى — تسمح بتخصيص حجم خط كل قسم عبر غلافه */
    .grp-title{font-size:1.3em;font-weight:800;margin:16px 0 8px;color:#111;border-right:4px solid #C5A059;padding-right:8px;}
    .sec-title{font-size:1.15em;font-weight:700;margin:14px 0 6px;color:#333;}
    .kpi-grid{display:flex;flex-wrap:wrap;gap:8px;}
    .kpi{flex:1 1 140px;border:1px solid #ddd;border-radius:10px;padding:8px 10px;background:rgba(250,250,250,0.85);}
    .kpi-icon{font-size:1.4em;} .kpi-label{font-size:0.85em;color:#777;} .kpi-value{font-size:1.4em;font-weight:800;} .kpi-sub{font-size:0.8em;color:#999;margin-top:2px;}
    table{width:100%;border-collapse:collapse;margin:4px 0 8px;}
    table.data th{background:${t.thBg};color:${t.thColor};font-size:0.95em;padding:6px 8px;border:1px solid ${t.thBorder};text-align:right;}
    table.data td{padding:5px 8px;border:1px solid #eee;font-size:0.95em;}
    ${t.stripe ? 'table.data tr:nth-child(even) td{background:rgba(250,250,250,0.7);}' : ''}
    table.data tr.totals td{background:#f6f1e6;font-weight:800;border-top:2px solid #C5A059;}
    .al-left{text-align:left;} .al-center{text-align:center;} .al-right{text-align:right;}
    .badge{background:#eef1f4;border-radius:8px;padding:1px 8px;font-size:0.85em;}
    table.kv td{padding:5px 8px;border-bottom:1px solid #eee;font-size:0.95em;} .kv-label{color:#777;width:40%;} .kv-value{font-weight:700;}
    .empty{color:#999;text-align:center;padding:12px;font-size:0.95em;}
    .grand-totals{margin-top:16px;padding:10px;background:rgba(248,245,238,0.9);border:1px solid #e7ddc7;border-radius:10px;display:flex;flex-wrap:wrap;gap:16px;}
    .gt{display:flex;flex-direction:column;} .gt-label{font-size:0.85em;color:#777;} .gt-value{font-size:1.4em;font-weight:800;}
  </style></head><body>
    ${lhBg}
    ${elsHtml}
    <div class="content">
      ${orderedSections.map(({ s, key }) => wrapSection(renderSection(s), key)).join('')}
      ${grand}
    </div>
  </body></html>`;
}
