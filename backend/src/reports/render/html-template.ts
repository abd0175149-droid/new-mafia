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

export function renderDocumentHtml(doc: ReportDocument, layout?: ResolvedLayout | null, metrics?: LayoutMetrics | null): string {
  if (layout) return renderLayoutHtml(doc, layout, metrics);
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
    <!-- كروميوم الحاوية بلا خطّ إيموجي: شعار 🎭 كان يُطبع مربّعاً في كلّ التقارير فأُزيل -->
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

// ══════════════════════════════════════════════════════
// 🖨️ وضع التخطيط — ترقيم صفحات بقياس فعلي (measure-then-paginate)
// نقيس ارتفاع كل قسم وكل صف جدول فعلياً في المتصفح ثم نوزّع على الصفحات
// بدقّة — فلا يُقصّ أي صف أبداً (overflow يبقى للأمان فقط).
// ══════════════════════════════════════════════════════

const PXMM = 96 / 25.4; // بكسل لكل مليمتر @96dpi

type TableSection = Extract<ReportSection, { type: 'table' }>;
type SectionCfg = NonNullable<ResolvedLayout['sections']>[string];

export interface LayoutMetrics {
  blocks: Record<string, number>;                                             // key → ارتفاع الكتلة (px)
  tables: Record<string, { over: number; head: number; rows: number[]; tot: number }>; // px
}

// دالة القياس التي تُنفَّذ داخل المتصفح (page.evaluate)
export const MEASURE_FN = `() => {
  const blocks = {}; const tables = {};
  document.querySelectorAll('.mb').forEach((el) => {
    const key = el.dataset.mk;
    const h = el.getBoundingClientRect().height;
    blocks[key] = h;
    const table = el.querySelector('table.data');
    if (table) {
      const thead = table.querySelector('thead');
      const headH = thead ? thead.getBoundingClientRect().height : 0;
      const rows = Array.from(table.querySelectorAll('tbody > tr:not(.totals)')).map(tr => tr.getBoundingClientRect().height);
      const totEl = table.querySelector('tbody > tr.totals');
      const tot = totEl ? totEl.getBoundingClientRect().height : 0;
      const sumRows = rows.reduce((s, r) => s + r, 0);
      tables[key] = { over: Math.max(0, h - headH - sumRows - tot), head: headH, rows, tot };
    }
  });
  return { blocks, tables };
}`;

function renderTableChunk(s: TableSection, rows: Record<string, unknown>[], cont: boolean, withTotals: boolean): string {
  const head = s.columns.map((c) => `<th>${esc(c.labelAr)}</th>`).join('');
  const body = rows.map((r) =>
    `<tr>${s.columns.map((c) => `<td class="al-${c.align ?? 'right'}">${renderCell(r, c)}</td>`).join('')}</tr>`).join('');
  const foot = (withTotals && s.totalsRow)
    ? `<tr class="totals">${s.columns.map((c) => `<td class="al-${c.align ?? 'right'}">${renderCell(s.totalsRow!, c)}</td>`).join('')}</tr>`
    : '';
  const title = s.titleAr
    ? `<h3 class="sec-title">${esc(s.titleAr)}${cont ? '<span class="cont"> — تتمة</span>' : ''}</h3>`
    : '';
  return `${title}<table class="data"><thead><tr>${head}</tr></thead><tbody>${body}${foot}</tbody></table>`;
}

function totalsInner(doc: ReportDocument): string {
  return `<div class="grand-totals">${(doc.totals || []).map((gt) =>
    `<div class="gt"><span class="gt-label">${esc(gt.labelAr)}</span><span class="gt-value" style="color:${toneColor(gt.tone)}">${esc(formatCell(gt.value, gt.format))}</span></div>`).join('')}</div>`;
}

// أنماط CSS مشتركة بين قالب القياس والقالب النهائي
function layoutCss(L: ResolvedLayout, pageW: number, pageH: number): string {
  const t = L.table; const m = L.margins; const baseFs = t.baseFontSize || 11;
  const isLand = L.orientation === 'landscape';
  return `
    @page { size: A4 ${isLand ? 'landscape' : 'portrait'}; margin: 0; }
    * { box-sizing: border-box; }
    html,body { margin:0; padding:0; }
    body { font-family:"Noto Naskh Arabic","Noto Sans Arabic","Tajawal","DejaVu Sans",sans-serif; color:#1f1f1f; font-size:${baseFs}px; line-height:1.5; direction:rtl; }
    .page { position:relative; width:${pageW}mm; height:${pageH}mm; overflow:hidden; page-break-after:always; background:#fff; }
    .page:last-child { page-break-after:auto; }
    .lh { position:absolute; inset:0; width:100%; height:100%; z-index:0; }
    .content { position:absolute; right:${m.right}mm; left:${m.left}mm; bottom:${m.bottom}mm; overflow:hidden; z-index:2; }
    .mb { overflow:hidden; }
    .grp-title { font-size:1.25em; font-weight:800; margin:0 0 2mm; color:#111; border-right:1.2mm solid ${t.thColor}; padding-right:2mm; }
    .sec-title { font-size:1.12em; font-weight:700; margin:0 0 1.6mm; color:#2b2b2b; }
    .sec-title:before { content:''; display:inline-block; width:1.1mm; height:3.2mm; background:${t.thColor}; border-radius:1mm; margin-left:1.6mm; vertical-align:-0.4mm; }
    .cont { font-weight:400; color:#999; font-size:0.82em; }
    .kpi-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(36mm, 1fr)); gap:2mm; }
    .kpi { border:0.3mm solid #e5dfd2; border-radius:2mm; padding:2mm 2.5mm; background:rgba(252,251,248,0.92); height:13.5mm; overflow:hidden; }
    .kpi-icon { display:none; }
    .kpi-label { font-size:0.78em; color:#8a8a8a; margin-bottom:0.6mm; white-space:nowrap; overflow:hidden; }
    .kpi-value { font-size:1.25em; font-weight:800; white-space:nowrap; }
    .kpi-sub { display:none; }
    table { width:100%; border-collapse:collapse; }
    table.data { margin:0; }
    table.data th { background:${t.thBg}; color:${t.thColor}; font-size:0.92em; font-weight:700; padding:1.8mm 2mm; border:0.25mm solid ${t.thBorder}; text-align:right; line-height:1.4; white-space:nowrap; }
    table.data td { padding:1.4mm 2mm; border:0.25mm solid #ececec; font-size:0.92em; line-height:1.5; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:60mm; }
    ${t.stripe ? 'table.data tbody tr:nth-child(even) td { background:rgba(249,247,242,0.9); }' : ''}
    table.data tr.totals td { background:#f6f1e6; font-weight:800; border-top:0.5mm solid #C5A059; }
    .al-left { text-align:left; } .al-center { text-align:center; } .al-right { text-align:right; }
    .badge { background:#f0ede6; color:#6b5f47; border-radius:2mm; padding:0.3mm 2mm; font-size:0.82em; }
    table.kv td { padding:1.5mm 2mm; border-bottom:0.25mm solid #eee; font-size:0.92em; line-height:1.4; }
    .kv-label { color:#8a8a8a; width:40%; } .kv-value { font-weight:700; }
    .empty { color:#999; text-align:center; padding:4mm; font-size:0.92em; }
    .grand-totals { padding:3mm 4mm; background:rgba(250,247,240,0.95); border:0.3mm solid #e7ddc7; border-radius:2.5mm; display:flex; gap:8mm; flex-wrap:wrap; }
    .gt { display:flex; flex-direction:column; } .gt-label { font-size:0.78em; color:#8a8a8a; } .gt-value { font-size:1.3em; font-weight:800; }`;
}

// ترتيب/تصفية أقسام الجسم حسب التخطيط
function orderBlocks(doc: ReportDocument, L: ResolvedLayout) {
  const cfg = L.sections || {};
  return doc.sections
    .map((s, i) => ({ s, i, key: sectionKeyOf(s, i) }))
    .filter(({ key }) => !cfg[key]?.hidden)
    .sort((a, b) => (cfg[a.key]?.order ?? a.i) - (cfg[b.key]?.order ?? b.i));
}

function blockStyle(c: SectionCfg | undefined): string {
  return [
    c?.x ? `margin-right:${c.x}mm` : '',
    c?.w ? `width:${c.w}mm` : '',
    c?.fs ? `font-size:${c.fs}px` : '',
  ].filter(Boolean).join(';');
}

// ── قالب القياس: كل الأقسام في حاوية بعرض المحتوى، مُعلّمة بـ data-mk ──
export function renderMeasureHtml(doc: ReportDocument, L: ResolvedLayout): string {
  const isLand = L.orientation === 'landscape';
  const pageW = isLand ? 297 : 210;
  const pageH = isLand ? 210 : 297;
  const contentW = Math.max(60, pageW - L.margins.left - L.margins.right);
  const blocks = orderBlocks(doc, L);

  const body = blocks.map(({ s, key }) => {
    const cfg = (L.sections || {})[key];
    const inner = s.type === 'table' && s.rows.length > 0
      ? renderTableChunk(s, s.rows, false, true)
      : renderSection(s);
    return `<div class="mb" data-mk="${esc(key)}" style="${blockStyle(cfg)}">${inner}</div>`;
  }).join('');

  const totalsCfg = (L.sections || {})[TOTALS_KEY];
  const totalsBlock = (doc.totals?.length && !totalsCfg?.hidden)
    ? `<div class="mb" data-mk="${TOTALS_KEY}" style="${blockStyle(totalsCfg)}">${totalsInner(doc)}</div>` : '';

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
    ${layoutCss(L, pageW, pageH)}
    .measure { position:absolute; top:0; right:0; width:${contentW}mm; }
  </style></head><body><div class="measure">${body}${totalsBlock}</div></body></html>`;
}

// ── التوزيع النهائي على الصفحات باستخدام القياسات الفعلية ──
function renderLayoutHtml(doc: ReportDocument, L: ResolvedLayout, metrics?: LayoutMetrics | null): string {
  const isLand = L.orientation === 'landscape';
  const pageW = isLand ? 297 : 210;
  const pageH = isLand ? 210 : 297;
  const m = L.margins;
  const topFirst = m.top;
  const topNext = Number.isFinite(L.contentTopNext) ? L.contentTopNext : m.top;
  const capFirstPx = Math.max(40, pageH - topFirst - m.bottom) * PXMM;
  const capNextPx = Math.max(40, pageH - topNext - m.bottom) * PXMM;
  const rowsPerPage = Math.max(3, Math.min(60, L.rowsPerPage || 22));
  const cfg = L.sections || {};

  // تقدير احتياطي (px) إن غابت القياسات
  const estPx = (h: number) => h * PXMM;
  const blockH = (key: string, fallbackMm: number) => metrics?.blocks?.[key] ?? estPx(fallbackMm);

  const pages: string[][] = [[]];
  let cap = capFirstPx;
  let used = 0;
  const remaining = () => cap - used;
  const newPage = () => { pages.push([]); cap = capNextPx; used = 0; };
  const push = (html: string, hpx: number) => { pages[pages.length - 1].push(html); used += hpx; };

  const placeBlock = (key: string, inner: string, gapMm: number, fallbackMm: number) => {
    const c = cfg[key];
    const gapPx = gapMm * PXMM;
    const hpx = blockH(key, fallbackMm);
    if (used > 0 && gapPx + hpx > remaining()) newPage();
    push(`<div class="mb" style="margin-top:${gapMm}mm;${blockStyle(c)}">${inner}</div>`, gapPx + hpx);
  };

  for (const { s, key } of orderBlocks(doc, L)) {
    const c = cfg[key];
    const gap = Math.max(-20, 3 + (c?.y ?? 0));

    if (s.type === 'table' && s.rows.length > 0) {
      const tm = metrics?.tables?.[key];
      // ارتفاعات فعلية أو تقديرية
      const fs = c?.fs ?? (L.table.baseFontSize || 11);
      const rowPx = (r: number) => tm?.rows[r] ?? (fs * 1.5 * PXMM + 2.8 * PXMM);
      const headPx = tm?.head ?? (fs * 1.5 * PXMM + 3.6 * PXMM);
      const overPx = tm?.over ?? (s.titleAr ? 7 * PXMM : 0);
      const totPx = s.totalsRow ? (tm?.tot ?? rowPx(0)) : 0;

      let idx = 0, firstChunk = true, guard = 0;
      while (idx < s.rows.length && guard++ < 2000) {
        const gapPx = (firstChunk ? gap : 3) * PXMM;
        const baseOverhead = gapPx + overPx + headPx;
        // تأكّد من وجود مكان للعنوان+الرأس+أول صف؛ وإلا صفحة جديدة
        if (used > 0 && remaining() < baseOverhead + rowPx(idx)) { newPage(); continue; }
        const avail = remaining() - baseOverhead;
        let fit = 0, hsum = 0;
        while (idx + fit < s.rows.length && fit < rowsPerPage && hsum + rowPx(idx + fit) <= avail) {
          hsum += rowPx(idx + fit); fit++;
        }
        if (fit === 0) { fit = 1; hsum = rowPx(idx); }
        // احجز مكاناً لصف الإجمالي إن كانت هذه آخر قطعة ولا يتّسع
        let isLast = idx + fit >= s.rows.length;
        if (isLast && totPx > 0 && (avail - hsum) < totPx && fit > 1) { fit -= 1; hsum -= rowPx(idx + fit); }
        isLast = idx + fit >= s.rows.length;
        const html = `<div class="mb" style="margin-top:${firstChunk ? gap : 3}mm;${blockStyle(c)}">${renderTableChunk(s, s.rows.slice(idx, idx + fit), !firstChunk, isLast)}</div>`;
        push(html, baseOverhead + hsum + (isLast && s.totalsRow ? totPx : 0));
        idx += fit; firstChunk = false;
        if (idx < s.rows.length) newPage();
      }
    } else {
      placeBlock(key, renderSection(s), gap, 20);
    }
  }

  // شريط الإجماليات النهائية
  const totalsCfg = cfg[TOTALS_KEY];
  if (doc.totals?.length && !totalsCfg?.hidden) {
    placeBlock(TOTALS_KEY, totalsInner(doc), 4 + (totalsCfg?.y ?? 0), 22);
  }

  // ── عناصر الإطار لكل صفحة ──
  const pageCount = pages.length;
  const elementsFor = (pageIdx: number): string =>
    Object.entries(L.elements || {}).map(([id, el]) => {
      if (!el || el.hidden) return '';
      const mode = el.pages ?? (id === 'signature' || id === 'footer' ? 'last' : id === 'page_number' ? 'all' : 'first');
      if (mode === 'first' && pageIdx !== 0) return '';
      if (mode === 'last' && pageIdx !== pageCount - 1) return '';
      let content = id === 'page_number' && !el.text ? 'صفحة {{page}} من {{pages}}' : elementContent(id, el, doc);
      if (!content) return '';
      content = content
        .replace(/\{\{\s*page\s*\}\}/g, String(pageIdx + 1))
        .replace(/\{\{\s*pages\s*\}\}/g, String(pageCount));
      const styles = [
        'position:absolute', `top:${el.y ?? 0}mm`, `right:${el.x ?? 0}mm`,
        el.w ? `width:${el.w}mm` : '', `font-size:${el.fontSize ?? 11}pt`,
        el.color ? `color:${el.color}` : '', el.bold ? 'font-weight:800' : '',
        `text-align:${el.align ?? 'right'}`, 'z-index:3',
      ].filter(Boolean).join(';');
      return `<div style="${styles}">${content}</div>`;
    }).join('');

  const lh = (L.showLetterhead && L.letterheadDataUri)
    ? `<img class="lh" src="${L.letterheadDataUri}" alt="">` : '';

  const pagesHtml = pages.map((blocks, i) => `
  <div class="page">
    ${lh}
    ${elementsFor(i)}
    <div class="content" style="top:${i === 0 ? topFirst : topNext}mm">${blocks.join('')}</div>
  </div>`).join('');

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${layoutCss(L, pageW, pageH)}</style></head><body>${pagesHtml}</body></html>`;
}

