'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import A4Canvas from './A4Canvas';
import { getTypes, getOptions, generateReport, type ReportDefinitionDTO, type ReportDocument, type ReportSection } from '../lib/reportsApi';
import { swalAlert, swalToast, swalConfirm } from '@/lib/swal';
import {
  getLayout, saveLayout, listLetterheads, uploadLetterhead, deleteLetterhead, previewPdf, assetUrl,
  type Letterhead,
} from '../lib/printLayoutApi';
import { pdfFileToPng } from '../lib/pdfToPng';
import {
  DEFAULT_LAYOUT, STANDARD_ELEMENTS, VARIABLES, labelForElement, sectionKeyOf, TOTALS_KEY,
  type LayoutConfig, type ElementPos, type SectionConfig,
} from '../lib/printLayoutContract';

// اسم عرض لقسم جسم التقرير
function sectionLabel(s: ReportSection): string {
  if (s.titleAr) return s.titleAr;
  switch (s.type) {
    case 'kpis': return 'المؤشرات (KPIs)';
    case 'keyvalue': return 'بيانات تفصيلية';
    case 'table': return 'جدول';
    case 'group': return 'مجموعة';
    default: return 'قسم';
  }
}

// توليد معاملات عيّنة تلقائياً (المنتقيات الإلزامية → أول خيار متاح)
async function buildSampleParams(def: ReportDefinitionDTO): Promise<Record<string, any> | null> {
  const params: Record<string, any> = {};
  for (const p of def.params) {
    if (p.type === 'date-range') { params[p.key] = {}; continue; }
    if (p.type === 'select') { if (p.defaultValue !== undefined) params[p.key] = p.defaultValue; continue; }
    if (p.type === 'toggle') { params[p.key] = false; continue; }
    if (p.required && p.optionsSource) {
      const opts = await getOptions(p.optionsSource);
      if (!opts.length) return null;   // لا بيانات لمعاينة هذا التقرير
      params[p.key] = opts[0].value;
    }
  }
  return params;
}

const clone = (o: any) => JSON.parse(JSON.stringify(o));
const inputCls = 'bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:border-amber-500/50 focus:outline-none w-full';

function Num({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-gray-500">{label}</span>
      <input type="number" step={step} className={inputCls} value={value ?? 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </label>
  );
}

export default function PrintLayoutEditor() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportDefinitionDTO[]>([]);
  const [reportKey, setReportKey] = useState('default');
  const [layout, setLayout] = useState<LayoutConfig>(clone(DEFAULT_LAYOUT));
  const [letterheadId, setLetterheadId] = useState<number | null>(null);
  const [letterheadUrl, setLetterheadUrl] = useState<string | null>(null);
  const [letterheads, setLetterheads] = useState<Letterhead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ReportDocument | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewSeq = useRef(0);

  const refreshLetterheads = useCallback(async () => {
    try { setLetterheads(await listLetterheads()); } catch { /* ignore */ }
  }, []);

  const loadForKey = useCallback(async (key: string) => {
    try {
      const r = await getLayout(key);
      setLayout(r.layout);
      setLetterheadId(r.letterheadId);
      setLetterheadUrl(r.letterheadUrl ? assetUrl(r.letterheadUrl) : null);
      setSelectedId(null);
    } catch (e: any) { swalAlert(e.message || 'تعذّر تحميل التخطيط'); }
  }, []);

  useEffect(() => {
    getTypes().then(setReports).catch(() => {});
    refreshLetterheads();
    loadForKey('default');
  }, [refreshLetterheads, loadForKey]);

  // ── معاينة حيّة: توليد مستند التقرير الفعلي للنوع المختار ──
  useEffect(() => {
    if (!reports.length) return;
    // للتخطيط الافتراضي نعرض عيّنة من أول تقرير بلا مدخلات إلزامية
    const def = reportKey === 'default'
      ? reports.find((r) => !r.params.some((p) => p.required)) || reports[0]
      : reports.find((r) => r.key === reportKey);
    if (!def) { setPreviewDoc(null); return; }

    const seq = ++previewSeq.current;
    setDocLoading(true);
    (async () => {
      try {
        const params = await buildSampleParams(def);
        if (seq !== previewSeq.current) return;
        if (!params) { setPreviewDoc(null); setDocLoading(false); return; }
        const doc = await generateReport(def.key, params);
        if (seq !== previewSeq.current) return;
        setPreviewDoc(doc);
      } catch {
        if (seq === previewSeq.current) setPreviewDoc(null);
      } finally {
        if (seq === previewSeq.current) setDocLoading(false);
      }
    })();
  }, [reportKey, reports]);

  const onSelectReport = (key: string) => { setReportKey(key); setSelectedSection(null); loadForKey(key); };

  // ── تعديلات التخطيط ──
  const patchLayout = (patch: Partial<LayoutConfig>) => setLayout((p) => ({ ...p, ...patch }));
  const patchMargins = (patch: Partial<LayoutConfig['margins']>) => setLayout((p) => ({ ...p, margins: { ...p.margins, ...patch } }));
  const patchTable = (patch: Partial<LayoutConfig['table']>) => setLayout((p) => ({ ...p, table: { ...p.table, ...patch } }));
  const patchElement = (id: string, patch: Partial<ElementPos>) =>
    setLayout((p) => ({ ...p, elements: { ...p.elements, [id]: { ...(p.elements[id] || { x: 10, y: 10 }), ...patch } } }));
  const moveElement = useCallback((id: string, x: number, y: number) => patchElement(id, { x, y }), []);
  const toggleHidden = (id: string) => {
    const cur = layout.elements[id];
    if (cur) patchElement(id, { hidden: !cur.hidden });
    else patchElement(id, { x: 12, y: 40, fontSize: 11, hidden: false });  // إظهار عنصر معياري غير موجود
  };
  const addCustomField = () => {
    const id = `custom_${Date.now()}`;
    patchElement(id, { x: 60, y: 40, fontSize: 11, color: '#111111', text: 'نص مخصّص', align: 'right' });
    setSelectedId(id);
  };
  const removeElement = (id: string) => {
    setLayout((p) => { const els = { ...p.elements }; delete els[id]; return { ...p, elements: els }; });
    if (selectedId === id) setSelectedId(null);
  };
  const insertVar = (v: string) => { if (selectedId) { const el = layout.elements[selectedId]; patchElement(selectedId, { text: `${el?.text || ''}${v}` }); } };

  // ── أقسام جسم التقرير: إخفاء/ترتيب ──
  const sectionEntries = (previewDoc?.sections || []).map((s, i) => ({ key: sectionKeyOf(s, i), label: sectionLabel(s), idx: i }));
  const orderedEntries = [...sectionEntries].sort(
    (a, b) => (layout.sections?.[a.key]?.order ?? a.idx) - (layout.sections?.[b.key]?.order ?? b.idx),
  );
  const patchSection = useCallback((key: string, patch: Partial<SectionConfig>) =>
    setLayout((p) => ({ ...p, sections: { ...(p.sections || {}), [key]: { ...(p.sections?.[key] || {}), ...patch } } })), []);
  const toggleSectionHidden = (key: string) => patchSection(key, { hidden: !layout.sections?.[key]?.hidden });
  const moveSection = (key: string, dir: -1 | 1) => {
    const keys = orderedEntries.map((e) => e.key);
    const i = keys.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    setLayout((p) => {
      const sections = { ...(p.sections || {}) };
      keys.forEach((k, idx) => { sections[k] = { ...(sections[k] || {}), order: idx }; });
      return { ...p, sections };
    });
  };

  // ── الورق الرسمي ──
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf') return swalAlert('الرجاء اختيار ملف PDF');
    setBusy('upload');
    try {
      const { blob, width, height } = await pdfFileToPng(file, 2.5);
      const lh = await uploadLetterhead(blob, file.name.replace(/\.pdf$/i, ''), width, height, file);
      await refreshLetterheads();
      setLetterheadId(lh.id);
      setLetterheadUrl(assetUrl(lh.url));
      swalToast('تم رفع الورق الرسمي', 'success');
    } catch (e: any) { swalAlert(e.message || 'فشل رفع الورق'); }
    setBusy(null);
  };
  const onSelectLetterhead = (id: number | null) => {
    setLetterheadId(id);
    setLetterheadUrl(id ? assetUrl(letterheads.find((l) => l.id === id)?.url) : null);
  };
  const onDeleteLetterhead = async (id: number) => {
    if (!(await swalConfirm('حذف هذا الورق الرسمي؟'))) return;
    try { await deleteLetterhead(id); if (letterheadId === id) onSelectLetterhead(null); await refreshLetterheads(); } catch (e: any) { swalAlert(e.message); }
  };

  // ── حفظ / معاينة / إعادة تعيين ──
  const onSave = async () => {
    setBusy('save');
    try { await saveLayout(reportKey, layout, letterheadId); swalToast('تم الحفظ', 'success'); }
    catch (e: any) { swalAlert(e.message || 'فشل الحفظ'); }
    setBusy(null);
  };
  const onReset = () => { setLayout(clone(DEFAULT_LAYOUT)); setSelectedId(null); };
  const onPreview = async () => {
    const def = reportKey !== 'default'
      ? reports.find((r) => r.key === reportKey)
      : reports.find((r) => !r.params.some((p) => p.required)) || reports[0];
    if (!def) return swalAlert('لا يوجد تقرير متاح للمعاينة.');
    setBusy('preview');
    try {
      const params = await buildSampleParams(def);
      if (!params) throw new Error('لا بيانات كافية لمعاينة هذا التقرير');
      await previewPdf(def.key, params, layout, letterheadId);
    } catch (e: any) { swalAlert(e.message || 'تعذّرت المعاينة'); }
    setBusy(null);
  };

  // قائمة العناصر الظاهرة في اللوحة (المعياريّة + المخصّصة الموجودة)
  const elementIds = Array.from(new Set([...STANDARD_ELEMENTS.map((e) => e.id), ...Object.keys(layout.elements)]));
  const sel = selectedId ? layout.elements[selectedId] : null;
  const isCustom = selectedId?.startsWith('custom_');
  const hasText = isCustom || selectedId === 'signature' || selectedId === 'footer';

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-950 flex" dir="rtl">
      {/* لوحة التحكم */}
      <aside className="w-80 shrink-0 h-full bg-gray-900/80 border-l border-gray-800/40 flex flex-col overflow-y-auto">
        <div className="p-3 border-b border-gray-800/40 flex items-center gap-2">
          <button onClick={() => router.push('/admin/reports')} className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 text-sm">→</button>
          <span className="text-sm font-bold text-white">🖨️ تخطيط الطباعة</span>
        </div>

        <div className="p-3 space-y-4 text-xs">
          {/* التقرير */}
          <div>
            <label className="text-[10px] text-gray-500">التقرير</label>
            <select className={inputCls} value={reportKey} onChange={(e) => onSelectReport(e.target.value)}>
              <option value="default">◆ الافتراضي (لكل التقارير)</option>
              {reports.map((r) => <option key={r.key} value={r.key}>{r.titleAr}</option>)}
            </select>
          </div>

          {/* الورق الرسمي */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-gray-300">الورق الرسمي</span>
              <label className="flex items-center gap-1 text-[10px] text-gray-400">
                <input type="checkbox" checked={layout.showLetterhead} onChange={(e) => patchLayout({ showLetterhead: e.target.checked })} className="accent-amber-500" /> إظهار
              </label>
            </div>
            <select className={inputCls} value={letterheadId ?? ''} onChange={(e) => onSelectLetterhead(e.target.value ? parseInt(e.target.value) : null)}>
              <option value="">— بلا ورق —</option>
              {letterheads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <div className="flex gap-1.5">
              <button onClick={() => fileRef.current?.click()} disabled={busy === 'upload'}
                className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-white disabled:opacity-50">
                {busy === 'upload' ? 'جارٍ الرفع…' : '⬆️ رفع PDF'}
              </button>
              {letterheadId && <button onClick={() => onDeleteLetterhead(letterheadId)} className="px-2 py-1.5 bg-rose-600/80 rounded text-white">🗑️</button>}
            </div>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onPickFile} />
          </div>

          {/* الصفحة */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-gray-300">الصفحة</span>
            <div className="flex gap-1.5">
              {(['portrait', 'landscape'] as const).map((o) => (
                <button key={o} onClick={() => patchLayout({ orientation: o })}
                  className={`flex-1 py-1.5 rounded ${layout.orientation === o ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-800 text-gray-400'}`}>
                  {o === 'portrait' ? 'عمودي' : 'أفقي'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <Num label="أعلى" value={layout.margins.top} onChange={(v) => patchMargins({ top: v })} />
              <Num label="يمين" value={layout.margins.right} onChange={(v) => patchMargins({ right: v })} />
              <Num label="أسفل" value={layout.margins.bottom} onChange={(v) => patchMargins({ bottom: v })} />
              <Num label="يسار" value={layout.margins.left} onChange={(v) => patchMargins({ left: v })} />
            </div>
          </div>

          {/* العناصر */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-gray-300">العناصر</span>
              <button onClick={addCustomField} className="text-[10px] text-amber-400 hover:text-amber-300">+ حقل نص</button>
            </div>
            {elementIds.map((id) => {
              const el = layout.elements[id];
              const visible = el && !el.hidden;
              return (
                <div key={id} className={`flex items-center gap-1.5 px-2 py-1 rounded ${selectedId === id ? 'bg-amber-500/10' : 'hover:bg-gray-800/40'}`}>
                  <button onClick={() => toggleHidden(id)} className="text-xs" title={visible ? 'إخفاء' : 'إظهار'}>{visible ? '👁️' : '🚫'}</button>
                  <button onClick={() => setSelectedId(id)} className={`flex-1 text-right ${visible ? 'text-gray-300' : 'text-gray-600'}`}>{labelForElement(id)}</button>
                  {id.startsWith('custom_') && <button onClick={() => removeElement(id)} className="text-rose-400 text-xs">✕</button>}
                </div>
              );
            })}
          </div>

          {/* أقسام التقرير (من المعاينة الحيّة) */}
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-gray-300">أقسام التقرير</span>
            {docLoading ? (
              <div className="text-[10px] text-gray-500 px-2 py-1">جاري توليد المعاينة…</div>
            ) : !previewDoc ? (
              <div className="text-[10px] text-gray-600 px-2 py-1">لا معاينة متاحة (لا بيانات لهذا التقرير)</div>
            ) : (
              <>
                {orderedEntries.map(({ key, label }, pos) => {
                  const hidden = !!layout.sections?.[key]?.hidden;
                  return (
                    <div key={key} className={`flex items-center gap-1.5 px-2 py-1 rounded ${selectedSection === key ? 'bg-blue-500/10' : 'hover:bg-gray-800/40'}`}>
                      <button onClick={() => toggleSectionHidden(key)} className="text-xs" title={hidden ? 'إظهار' : 'إخفاء'}>{hidden ? '🚫' : '👁️'}</button>
                      <button onClick={() => setSelectedSection(key)} className={`flex-1 text-right truncate ${hidden ? 'text-gray-600 line-through' : 'text-gray-300'}`}>{label}</button>
                      <button onClick={() => moveSection(key, -1)} disabled={pos === 0} className="text-gray-500 hover:text-white disabled:opacity-20">↑</button>
                      <button onClick={() => moveSection(key, 1)} disabled={pos === orderedEntries.length - 1} className="text-gray-500 hover:text-white disabled:opacity-20">↓</button>
                    </div>
                  );
                })}
                {previewDoc.totals?.length ? (
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded ${selectedSection === TOTALS_KEY ? 'bg-blue-500/10' : 'hover:bg-gray-800/40'}`}>
                    <button onClick={() => toggleSectionHidden(TOTALS_KEY)} className="text-xs">{layout.sections?.[TOTALS_KEY]?.hidden ? '🚫' : '👁️'}</button>
                    <button onClick={() => setSelectedSection(TOTALS_KEY)} className={`flex-1 text-right ${layout.sections?.[TOTALS_KEY]?.hidden ? 'text-gray-600 line-through' : 'text-gray-300'}`}>الإجماليات النهائية</button>
                  </div>
                ) : null}
                {reportKey === 'default' && <p className="text-[9px] text-gray-600 px-2">⚠️ في الوضع الافتراضي تُطبَّق هذه الإعدادات على الأقسام المطابقة بالاسم في كل التقارير.</p>}
              </>
            )}
          </div>

          {/* مفتّش القسم المحدّد */}
          {selectedSection && previewDoc && (() => {
            const c = layout.sections?.[selectedSection] || {};
            const label = selectedSection === TOTALS_KEY
              ? 'الإجماليات النهائية'
              : sectionEntries.find((e) => e.key === selectedSection)?.label || 'قسم';
            return (
              <div className="space-y-1.5 border border-blue-800/50 rounded-lg p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-blue-300">📄 {label}</span>
                  <button
                    onClick={() => patchSection(selectedSection, { x: undefined, y: undefined, w: undefined, fs: undefined })}
                    className="text-[9px] text-gray-500 hover:text-white" title="إعادة الموضع والحجم للوضع التلقائي">↺ تلقائي</button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <Num label="X (يمين)" value={c.x ?? 0} onChange={(v) => patchSection(selectedSection, { x: v || undefined })} step={0.5} />
                  <Num label="مسافة قبل" value={c.y ?? 0} onChange={(v) => patchSection(selectedSection, { y: v || undefined })} step={0.5} />
                  <Num label="عرض" value={c.w ?? 0} onChange={(v) => patchSection(selectedSection, { w: v || undefined })} />
                  <Num label="الخط" value={c.fs ?? layout.table.baseFontSize} onChange={(v) => patchSection(selectedSection, { fs: v || undefined })} />
                </div>
                <p className="text-[9px] text-gray-600">اسحب القسم في المعاينة لتحريكه، والمقبض الأزرق يساره لتغيير عرضه. عرض/خط = 0 → تلقائي.</p>
              </div>
            );
          })()}

          {/* المفتّش */}
          {sel && selectedId && (
            <div className="space-y-1.5 border border-gray-800 rounded-lg p-2">
              <span className="text-[11px] font-bold text-amber-300">{labelForElement(selectedId)}</span>
              <div className="grid grid-cols-3 gap-1.5">
                <Num label="X (يمين)" value={sel.x} onChange={(v) => patchElement(selectedId, { x: v })} step={0.5} />
                <Num label="Y (أعلى)" value={sel.y} onChange={(v) => patchElement(selectedId, { y: v })} step={0.5} />
                <Num label="عرض" value={sel.w ?? 0} onChange={(v) => patchElement(selectedId, { w: v || undefined })} />
                <Num label="الخط" value={sel.fontSize ?? 11} onChange={(v) => patchElement(selectedId, { fontSize: v })} />
              </div>
              <div className="flex items-center gap-2">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-gray-500">اللون</span>
                  <input type="color" value={sel.color || '#111111'} onChange={(e) => patchElement(selectedId, { color: e.target.value })} className="w-8 h-6 bg-transparent" />
                </label>
                <label className="flex items-center gap-1 text-[10px] text-gray-400 mt-3">
                  <input type="checkbox" checked={!!sel.bold} onChange={(e) => patchElement(selectedId, { bold: e.target.checked })} className="accent-amber-500" /> سميك
                </label>
                <select className={inputCls + ' mt-3'} value={sel.align || 'right'} onChange={(e) => patchElement(selectedId, { align: e.target.value as any })}>
                  <option value="right">يمين</option><option value="center">وسط</option><option value="left">يسار</option>
                </select>
              </div>
              {hasText && (
                <div className="space-y-1">
                  <span className="text-[10px] text-gray-500">النص</span>
                  <textarea className={inputCls + ' h-14 resize-none'} value={sel.text || ''} onChange={(e) => patchElement(selectedId, { text: e.target.value })} />
                  <div className="flex flex-wrap gap-1">
                    {VARIABLES.map((v) => <button key={v.key} onClick={() => insertVar(v.key)} className="px-1.5 py-0.5 bg-gray-800 rounded text-[9px] text-gray-400 hover:text-amber-300">{v.labelAr}</button>)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* الجدول */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-gray-300">تنسيق الجدول</span>
            <div className="flex items-center gap-2 flex-wrap">
              {([['thBg', 'خلفية الرأس'], ['thColor', 'لون الرأس'], ['thBorder', 'حدود']] as const).map(([k, lbl]) => (
                <label key={k} className="flex flex-col gap-0.5">
                  <span className="text-[9px] text-gray-500">{lbl}</span>
                  <input type="color" value={(layout.table as any)[k]} onChange={(e) => patchTable({ [k]: e.target.value } as any)} className="w-7 h-6 bg-transparent" />
                </label>
              ))}
              <label className="flex items-center gap-1 text-[10px] text-gray-400 mt-3">
                <input type="checkbox" checked={layout.table.stripe} onChange={(e) => patchTable({ stripe: e.target.checked })} className="accent-amber-500" /> تخطيط
              </label>
            </div>
          </div>
        </div>

        {/* أزرار */}
        <div className="mt-auto p-3 border-t border-gray-800/40 flex gap-1.5 sticky bottom-0 bg-gray-900/95">
          <button onClick={onSave} disabled={busy === 'save'} className="flex-1 py-2 bg-gradient-to-r from-amber-500 to-rose-600 text-white font-bold rounded-lg disabled:opacity-50 text-xs">{busy === 'save' ? '…' : '💾 حفظ'}</button>
          <button onClick={onPreview} disabled={busy === 'preview'} className="px-3 py-2 bg-blue-600/80 text-white rounded-lg text-xs disabled:opacity-50">{busy === 'preview' ? '…' : '👁️ معاينة'}</button>
          <button onClick={onReset} className="px-3 py-2 bg-gray-800 text-gray-300 rounded-lg text-xs">↺</button>
        </div>
      </aside>

      {/* المعاينة */}
      <div className="flex-1 h-full overflow-auto p-8 flex items-start justify-center bg-gray-900/40">
        <A4Canvas
          layout={layout} letterheadUrl={letterheadUrl}
          doc={previewDoc} docLoading={docLoading}
          selectedId={selectedId} selectedSection={selectedSection}
          onSelect={setSelectedId} onSelectSection={setSelectedSection}
          onMove={moveElement} onSectionPatch={patchSection}
        />
      </div>
    </div>
  );
}
