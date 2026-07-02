'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ReportSidebar from './components/ReportSidebar';
import ParamForm from './components/ParamForm';
import DocumentRenderer from './components/DocumentRenderer';
import { swalAlert } from '@/lib/swal';
import {
  getTypes, generateReport, exportReport,
  type ReportDefinitionDTO, type ReportDocument, type ReportParam,
} from './lib/reportsApi';

function defaultsFor(params: ReportParam[]): Record<string, any> {
  const d: Record<string, any> = {};
  for (const p of params) {
    if (p.type === 'date-range') d[p.key] = {};
    else if (p.defaultValue !== undefined) d[p.key] = p.defaultValue;
    else if (p.type === 'toggle') d[p.key] = false;
  }
  return d;
}

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportDefinitionDTO[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReportDefinitionDTO | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, any>>({});
  const [document_, setDocument] = useState<ReportDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    getTypes()
      .then((list) => {
        setReports(list);
        if (list[0]) { setSelectedCategory(list[0].category); }
      })
      .catch((e) => swalAlert(e.message || 'تعذّر تحميل التقارير'))
      .finally(() => setLoadingTypes(false));
  }, []);

  const handleSelectReport = (report: ReportDefinitionDTO) => {
    setSelected(report);
    setDocument(null);
    setParamValues(defaultsFor(report.params));
    // توليد تلقائي إن لم يكن هناك معامل إلزامي
    const needsInput = report.params.some((p) => p.required);
    if (!needsInput) setTimeout(() => runGenerate(report, defaultsFor(report.params)), 30);
  };

  const runGenerate = useCallback(async (report?: ReportDefinitionDTO, params?: Record<string, any>) => {
    const r = report || selected;
    const p = params || paramValues;
    if (!r) return;
    setLoading(true);
    try {
      const doc = await generateReport(r.key, p);
      setDocument(doc);
    } catch (e: any) {
      swalAlert(e.message || 'تعذّر توليد التقرير');
    } finally {
      setLoading(false);
    }
  }, [selected, paramValues]);

  const handleExport = async (format: 'pdf' | 'excel') => {
    if (!selected) return;
    setExporting(format);
    try {
      await exportReport(selected.key, paramValues, format);
    } catch (e: any) {
      swalAlert(e.message || 'فشل التصدير');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-950 flex" dir="rtl">
      <ReportSidebar
        reports={reports}
        selectedCategory={selectedCategory}
        selectedReport={selected?.key || null}
        onSelectCategory={(id) => setSelectedCategory(id === selectedCategory ? null : id)}
        onSelectReport={handleSelectReport}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        onBack={() => router.push('/admin')}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="shrink-0 border-b border-gray-800/40 bg-gray-900/60 backdrop-blur-xl px-6 py-3 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 pt-1">
            {selected ? (
              <>
                <span className="text-2xl shrink-0">{selected.icon}</span>
                <div className="min-w-0">
                  <h1 className="text-sm font-black text-white truncate">{selected.titleAr}</h1>
                  <p className="text-[10px] text-gray-500 truncate">{selected.descriptionAr}</p>
                </div>
              </>
            ) : (
              <h1 className="text-sm font-bold text-gray-400">📋 اختر تقريراً من القائمة</h1>
            )}
          </div>

          <div className="flex items-end gap-3 flex-wrap shrink-0">
            {selected && (
              <ParamForm
                params={selected.params}
                values={paramValues}
                onChange={(k, v) => setParamValues((prev) => ({ ...prev, [k]: v }))}
                onSubmit={() => runGenerate()}
                loading={loading}
              />
            )}
            {document_ && selected && (
              <div className="flex items-center gap-2">
                {selected.formats.includes('pdf') && (
                  <button onClick={() => handleExport('pdf')} disabled={!!exporting}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/90 hover:bg-rose-600 text-white font-bold rounded-lg text-xs transition disabled:opacity-50">
                    {exporting === 'pdf' ? '⏳' : '🖨️'} تصدير PDF
                  </button>
                )}
                {selected.formats.includes('excel') && (
                  <button onClick={() => handleExport('excel')} disabled={!!exporting}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-600 text-white font-bold rounded-lg text-xs transition disabled:opacity-50">
                    {exporting === 'excel' ? '⏳' : '📊'} تصدير Excel
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {loadingTypes ? (
              <motion.div key="lt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center py-20">
                <div className="animate-spin h-10 w-10 border-4 border-amber-500 border-t-transparent rounded-full" />
              </motion.div>
            ) : loading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="animate-spin h-10 w-10 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-sm text-gray-500">جاري توليد التقرير...</p>
                </div>
              </motion.div>
            ) : !selected ? (
              <motion.div key="empty" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-20">
                <div className="text-6xl mb-6">📋</div>
                <h2 className="text-xl font-bold text-gray-400 mb-2">مرحباً بك في نظام التقارير</h2>
                <p className="text-sm text-gray-600 text-center max-w-md">اختر تقريراً من القائمة الجانبية، عبّئ الحقول المطلوبة، ثم ولّد التقرير وصدّره PDF أو Excel.</p>
              </motion.div>
            ) : document_ ? (
              <motion.div key={selected.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <DocumentRenderer doc={document_} />
              </motion.div>
            ) : (
              <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20">
                <div className="text-5xl mb-4">{selected.icon}</div>
                <p className="text-sm text-gray-500 text-center max-w-md">عبّئ الحقول في الأعلى ثم اضغط «توليد التقرير».</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
