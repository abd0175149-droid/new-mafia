'use client';
import { useEffect, useRef } from 'react';
import type { LayoutConfig, SectionConfig } from '../lib/printLayoutContract';
import { labelForElement, sectionKeyOf, TOTALS_KEY } from '../lib/printLayoutContract';
import type { ReportDocument, ReportSection } from '../lib/reportsApi';
import { formatCell } from '../lib/formatCell';

interface Props {
  layout: LayoutConfig;
  letterheadUrl: string | null;
  doc: ReportDocument | null;          // مستند حيّ للمعاينة (قد يكون null أثناء التحميل)
  docLoading: boolean;
  selectedId: string | null;           // عنصر إطار محدّد
  selectedSection: string | null;      // قسم جسم محدّد
  onSelect: (id: string | null) => void;
  onSelectSection: (key: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onSectionPatch: (key: string, patch: Partial<SectionConfig>) => void;
}

// ── مُصيّر مصغّر لقسم من جسم التقرير (مطابق بصرياً لوضع الطباعة) ──
function MiniSection({ s, t, fs }: { s: ReportSection; t: LayoutConfig['table']; fs: number }) {
  switch (s.type) {
    case 'kpis':
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {s.items.map((k, i) => (
            <div key={i} style={{ flex: '1 1 60px', border: '1px solid #ddd', borderRadius: 4, padding: '2px 4px', background: 'rgba(250,250,250,0.85)' }}>
              <div style={{ fontSize: fs * 0.75, color: '#777' }}>{k.icon} {k.labelAr}</div>
              <div style={{ fontSize: fs * 1.1, fontWeight: 800 }}>{formatCell(k.value, k.format)}</div>
            </div>
          ))}
        </div>
      );
    case 'keyvalue':
      return (
        <div style={{ marginBottom: 6 }}>
          {s.titleAr && <div style={{ fontSize: fs, fontWeight: 700, margin: '4px 0 2px', color: '#333' }}>{s.titleAr}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            {s.items.slice(0, 8).map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', fontSize: fs * 0.85, padding: '1px 2px' }}>
                <span style={{ color: '#777' }}>{it.labelAr}</span>
                <span style={{ fontWeight: 700 }}>{formatCell(it.value, it.format)}</span>
              </div>
            ))}
          </div>
          {s.items.length > 8 && <div style={{ fontSize: fs * 0.7, color: '#999' }}>… +{s.items.length - 8}</div>}
        </div>
      );
    case 'table': {
      const rows = s.rows.slice(0, 6);
      return (
        <div style={{ marginBottom: 6 }}>
          {s.titleAr && <div style={{ fontSize: fs, fontWeight: 700, margin: '4px 0 2px', color: '#333' }}>{s.titleAr}</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {s.columns.map((c) => (
                <th key={c.key} style={{ background: t.thBg, color: t.thColor, border: `1px solid ${t.thBorder}`, fontSize: fs * 0.8, padding: '1px 3px', textAlign: 'right' }}>{c.labelAr}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} style={t.stripe && ri % 2 ? { background: 'rgba(250,250,250,0.7)' } : undefined}>
                  {s.columns.map((c) => (
                    <td key={c.key} style={{ border: '1px solid #eee', fontSize: fs * 0.75, padding: '1px 3px', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: 90, textAlign: c.align === 'center' ? 'center' : c.align === 'left' ? 'left' : 'right' }}>
                      {formatCell(r[c.key], c.format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {s.rows.length > 6 && <div style={{ fontSize: fs * 0.7, color: '#999' }}>… +{s.rows.length - 6} صف</div>}
        </div>
      );
    }
    case 'group':
      return (
        <div style={{ marginBottom: 6 }}>
          {s.titleAr && <div style={{ fontSize: fs * 1.1, fontWeight: 800, borderRight: '3px solid #C5A059', paddingRight: 4, margin: '4px 0' }}>{s.titleAr}</div>}
          {s.children.map((c, i) => <MiniSection key={i} s={c} t={t} fs={fs} />)}
        </div>
      );
  }
}

export default function A4Canvas({ layout, letterheadUrl, doc, docLoading, selectedId, selectedSection, onSelect, onSelectSection, onMove, onSectionPatch }: Props) {
  const isLand = layout.orientation === 'landscape';
  const pageWmm = isLand ? 297 : 210;
  const pageHmm = isLand ? 210 : 297;
  const targetW = isLand ? 620 : 440;
  const pxPerMm = targetW / pageWmm;
  const boxW = pageWmm * pxPerMm;
  const boxH = pageHmm * pxPerMm;
  const contentWmm = pageWmm - layout.margins.left - layout.margins.right;

  const drag = useRef<{ id: string; mx: number; my: number; ox: number; oy: number } | null>(null);
  const secDrag = useRef<{ key: string; mx: number; my: number; ox: number; oy: number } | null>(null);
  const secResize = useRef<{ key: string; mx: number; ow: number } | null>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current;
      if (d) {
        const nx = Math.max(0, Math.min(pageWmm, d.ox - (e.clientX - d.mx) / pxPerMm));
        const ny = Math.max(0, Math.min(pageHmm, d.oy + (e.clientY - d.my) / pxPerMm));
        onMove(d.id, Math.round(nx * 10) / 10, Math.round(ny * 10) / 10);
        return;
      }
      const sd = secDrag.current;
      if (sd) {
        const nx = Math.max(0, Math.min(contentWmm - 20, sd.ox - (e.clientX - sd.mx) / pxPerMm));
        const ny = Math.max(-30, Math.min(200, sd.oy + (e.clientY - sd.my) / pxPerMm));
        onSectionPatch(sd.key, { x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10 });
        return;
      }
      const sr = secResize.current;
      if (sr) {
        // مرساة يمين: السحب لليسار يوسّع القسم
        const nw = Math.max(30, Math.min(contentWmm, sr.ow - (e.clientX - sr.mx) / pxPerMm));
        onSectionPatch(sr.key, { w: Math.round(nw * 10) / 10 });
      }
    };
    const up = () => { drag.current = null; secDrag.current = null; secResize.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [pxPerMm, pageWmm, pageHmm, contentWmm, onMove, onSectionPatch]);

  const m = layout.margins;
  const cfg = layout.sections || {};

  // أقسام الجسم مرتّبة ومُرشّحة كما ستُطبع
  const ordered = (doc?.sections || [])
    .map((s, i) => ({ s, i, key: sectionKeyOf(s, i) }))
    .filter(({ key }) => !cfg[key]?.hidden)
    .sort((a, b) => (cfg[a.key]?.order ?? a.i) - (cfg[b.key]?.order ?? b.i));
  const totalsHidden = !!cfg[TOTALS_KEY]?.hidden;

  // نص عناصر الإطار من المستند الحيّ إن وُجد
  const frameText = (id: string, el: { text?: string }): string => {
    if (el.text) return el.text;
    if (!doc) {
      return id === 'title' ? '«عنوان التقرير»' : id === 'subtitle' ? '«العنوان الفرعي»'
        : id === 'generated' ? '«تاريخ الإنشاء»' : id === 'filters' ? '«الفلاتر»' : labelForElement(id);
    }
    const h = doc.header;
    switch (id) {
      case 'title': return h.titleAr;
      case 'subtitle': return h.subtitleAr || '';
      case 'filters': return (h.filtersSummaryAr || []).filter(Boolean).join('  •  ');
      case 'generated': {
        let g = ''; try { g = new Date(h.generatedAt).toLocaleString('ar-IQ'); } catch { g = h.generatedAt; }
        return `أُنشئ في: ${g}${h.generatedByAr ? ` — بواسطة: ${h.generatedByAr}` : ''}`;
      }
      default: return labelForElement(id);
    }
  };

  return (
    <div className="flex justify-center">
      <div
        className="relative bg-white shadow-2xl overflow-hidden select-none"
        style={{ width: boxW, height: boxH, direction: 'rtl' }}
        onMouseDown={() => { onSelect(null); onSelectSection(null); }}
      >
        {/* الورق الرسمي */}
        {layout.showLetterhead && letterheadUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={letterheadUrl} alt="letterhead" className="absolute inset-0 w-full h-full object-fill pointer-events-none" />
        )}

        {/* منطقة المحتوى — معاينة حيّة لأقسام التقرير */}
        <div
          className="absolute border border-dashed border-amber-400/60 overflow-hidden"
          style={{
            top: m.top * pxPerMm, right: m.right * pxPerMm,
            width: (pageWmm - m.left - m.right) * pxPerMm,
            height: (pageHmm - m.top - m.bottom) * pxPerMm,
            color: '#1a1a1a',
          }}
        >
          <span className="absolute -top-0 left-0 text-[9px] text-amber-600 bg-white/70 px-1 z-10">منطقة المحتوى</span>
          {docLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" />
            </div>
          ) : doc ? (
            <div style={{ padding: 4 }}>
              {ordered.map(({ s, key }) => {
                const c = cfg[key] || {};
                const secFs = Math.max(6, (c.fs ?? layout.table.baseFontSize) * pxPerMm * 0.32);
                const isSel = selectedSection === key;
                return (
                  <div
                    key={key}
                    onMouseDown={(e) => {
                      e.stopPropagation(); onSelect(null); onSelectSection(key);
                      secDrag.current = { key, mx: e.clientX, my: e.clientY, ox: c.x ?? 0, oy: c.y ?? 0 };
                    }}
                    className={`relative cursor-move rounded ${isSel ? 'ring-2 ring-blue-500 bg-blue-500/5' : 'hover:bg-blue-500/5'}`}
                    style={{
                      marginTop: (c.y ?? 0) * pxPerMm,
                      marginRight: (c.x ?? 0) * pxPerMm,
                      width: c.w ? c.w * pxPerMm : undefined,
                    }}
                  >
                    <MiniSection s={s} t={layout.table} fs={secFs} />
                    {isSel && (
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          secResize.current = { key, mx: e.clientX, ow: c.w ?? (contentWmm - (c.x ?? 0)) };
                        }}
                        title="سحب لتغيير العرض"
                        className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-6 bg-blue-500 rounded cursor-ew-resize z-10"
                      />
                    )}
                  </div>
                );
              })}
              {doc.totals?.length && !totalsHidden ? (() => {
                const c = cfg[TOTALS_KEY] || {};
                const tfs = Math.max(6, (c.fs ?? layout.table.baseFontSize) * pxPerMm * 0.32);
                const isSel = selectedSection === TOTALS_KEY;
                return (
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation(); onSelect(null); onSelectSection(TOTALS_KEY);
                      secDrag.current = { key: TOTALS_KEY, mx: e.clientX, my: e.clientY, ox: c.x ?? 0, oy: c.y ?? 0 };
                    }}
                    className={`relative cursor-move rounded ${isSel ? 'ring-2 ring-blue-500 bg-blue-500/5' : 'hover:bg-blue-500/5'}`}
                    style={{
                      marginTop: 6 + (c.y ?? 0) * pxPerMm,
                      marginRight: (c.x ?? 0) * pxPerMm,
                      width: c.w ? c.w * pxPerMm : undefined,
                      padding: 4, background: 'rgba(248,245,238,0.9)', border: '1px solid #e7ddc7', borderRadius: 4, display: 'flex', gap: 10, flexWrap: 'wrap',
                    }}
                  >
                    {doc.totals!.map((t, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: tfs * 0.7, color: '#777' }}>{t.labelAr}</span>
                        <span style={{ fontSize: tfs * 1.1, fontWeight: 800 }}>{formatCell(t.value, t.format)}</span>
                      </div>
                    ))}
                    {isSel && (
                      <div
                        onMouseDown={(e) => { e.stopPropagation(); secResize.current = { key: TOTALS_KEY, mx: e.clientX, ow: c.w ?? (contentWmm - (c.x ?? 0)) }; }}
                        title="سحب لتغيير العرض"
                        className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-6 bg-blue-500 rounded cursor-ew-resize z-10"
                      />
                    )}
                  </div>
                );
              })() : null}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-[10px] text-gray-400 text-center px-4">
              اختر تقريراً من القائمة لعرض معاينة حيّة لعناصره
            </div>
          )}
        </div>

        {/* عناصر الإطار المسحوبة */}
        {Object.entries(layout.elements || {}).map(([id, el]) => {
          if (!el || el.hidden) return null;
          const isSel = selectedId === id;
          return (
            <div
              key={id}
              onMouseDown={(e) => { e.stopPropagation(); onSelectSection(null); onSelect(id); drag.current = { id, mx: e.clientX, my: e.clientY, ox: el.x, oy: el.y }; }}
              className={`absolute cursor-move whitespace-nowrap px-1 rounded ${isSel ? 'ring-2 ring-amber-500 bg-amber-500/10' : 'hover:bg-amber-500/10'}`}
              style={{
                top: el.y * pxPerMm, right: el.x * pxPerMm,
                width: el.w ? el.w * pxPerMm : undefined,
                fontSize: Math.max(6, (el.fontSize || 11) * pxPerMm * 0.35),
                color: el.color || '#111', fontWeight: el.bold ? 800 : 400,
                textAlign: el.align || 'right',
                zIndex: 20,
              }}
            >
              {frameText(id, el)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
