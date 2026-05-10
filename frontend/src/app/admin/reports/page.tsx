'use client';
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReportSidebar from './components/ReportSidebar';
import ReportConfigForm from './components/ReportConfigForm';
import ReportPrintView from './components/ReportPrintView';
import { REPORT_RENDERERS } from './components/renderers';
import { REPORT_CATEGORIES, getReportById, type ReportDefinition } from './registry';

const API = process.env.NEXT_PUBLIC_API_URL || '';

function getHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export default function ReportsPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>('kpi');
  const [selectedReport, setSelectedReport] = useState<ReportDefinition | null>(
    REPORT_CATEGORIES[0]?.reports[0] || null
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchReport = useCallback(async (report?: ReportDefinition, filters?: Record<string, string>) => {
    const r = report || selectedReport;
    const f = filters || filterValues;
    if (!r) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      r.filters.forEach((fi) => {
        const val = f[fi.id] || fi.defaultValue || '';
        if (val) params.set(fi.id, val);
      });
      const url = `${API}${r.endpoint}${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url, { headers: getHeaders() });
      const data = await res.json();
      if (data.success !== false) {
        setReportData(data);
        setHasLoaded(true);
      }
    } catch (e) {
      console.error('Report fetch error:', e);
    }
    setLoading(false);
  }, [selectedReport, filterValues]);

  const handleSelectCategory = (id: string) => {
    setSelectedCategory(id === selectedCategory ? null : id);
  };

  const handleSelectReport = (report: ReportDefinition) => {
    setSelectedReport(report);
    setReportData(null);
    setHasLoaded(false);
    // Initialize default filter values
    const defaults: Record<string, string> = {};
    report.filters.forEach((f) => {
      defaults[f.id] = f.defaultValue || '';
    });
    setFilterValues(defaults);
    // Auto-fetch
    setTimeout(() => fetchReport(report, defaults), 50);
  };

  const handleFilterChange = (id: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [id]: value }));
  };

  const renderer = selectedReport ? REPORT_RENDERERS[selectedReport.id] : null;

  return (
    <div className="flex h-[calc(100vh-48px)] -m-6 overflow-hidden" dir="rtl">
      {/* Sidebar */}
      <ReportSidebar
        selectedCategory={selectedCategory}
        selectedReport={selectedReport?.id || null}
        onSelectCategory={handleSelectCategory}
        onSelectReport={handleSelectReport}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="shrink-0 border-b border-gray-800/40 bg-gray-950/80 backdrop-blur-sm px-6 py-3 print:border-b-0">
          {selectedReport ? (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl">{selectedReport.icon}</span>
                <div className="min-w-0">
                  <h1 className="text-base font-black text-white truncate print:text-black">{selectedReport.name}</h1>
                  <p className="text-[11px] text-gray-500 truncate print:text-gray-600">{selectedReport.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <ReportConfigForm
                  filters={selectedReport.filters}
                  values={filterValues}
                  onChange={handleFilterChange}
                  onApply={() => fetchReport()}
                  loading={loading}
                />
                {hasLoaded && (
                  <ReportPrintView
                    reportName={selectedReport.name}
                    reportDescription={selectedReport.description}
                  >
                    <span />
                  </ReportPrintView>
                )}
              </div>
            </div>
          ) : (
            <h1 className="text-lg font-bold text-gray-400">📋 اختر تقريراً من القائمة</h1>
          )}
        </div>

        {/* Report Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center py-20"
              >
                <div className="text-center">
                  <div className="animate-spin h-10 w-10 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-sm text-gray-500">جاري تحميل التقرير...</p>
                </div>
              </motion.div>
            ) : !selectedReport ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-20"
              >
                <div className="text-6xl mb-6">📋</div>
                <h2 className="text-xl font-bold text-gray-400 mb-2">مرحباً بك في وحدة التقارير</h2>
                <p className="text-sm text-gray-600 mb-8 text-center max-w-md">
                  اختر فئة تقرير من القائمة الجانبية ثم اختر التقرير المطلوب لعرضه
                </p>
                <div className="grid grid-cols-5 gap-4">
                  {REPORT_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        handleSelectCategory(cat.id);
                        handleSelectReport(cat.reports[0]);
                      }}
                      className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gray-800/40 hover:bg-gray-800/60 border border-gray-800 hover:border-amber-500/20 transition-all"
                    >
                      <span className="text-2xl">{cat.icon}</span>
                      <span className="text-xs text-gray-400 font-medium">{cat.name}</span>
                      <span className="text-[10px] text-gray-600">{cat.reports.length} تقرير</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : hasLoaded && reportData && renderer ? (
              <motion.div
                key={selectedReport.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {/* Print wrapper - includes cover page inside ReportPrintView */}
                <div className="hidden print:block">
                  <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: '60px', marginBottom: '20px' }}>🎭</div>
                    <h1 style={{ fontSize: '28px', fontWeight: 900, marginBottom: '8px', color: '#1a1a1a' }}>نادي المافيا</h1>
                    <p style={{ fontSize: '13px', color: '#666', marginBottom: '40px' }}>Mafia Club — تقارير وتحليلات</p>
                    <div style={{ width: '80px', height: '3px', backgroundColor: '#f59e0b', margin: '0 auto 40px' }} />
                    <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#222', marginBottom: '12px' }}>{selectedReport.name}</h2>
                    <p style={{ fontSize: '14px', color: '#666', maxWidth: '400px' }}>{selectedReport.description}</p>
                    <div style={{ marginTop: '60px', fontSize: '12px', color: '#999' }}>
                      <p>تاريخ التقرير: {new Date().toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                  </div>
                </div>

                {/* Actual report content */}
                {renderer(reportData)}
              </motion.div>
            ) : hasLoaded ? (
              <motion.div key="no-data" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
                <p className="text-gray-500">لا توجد بيانات لهذا التقرير</p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden, nav, aside, header, footer { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:text-black { color: black !important; }
          .print\\:text-gray-600 { color: #4b5563 !important; }
          .print\\:bg-gray-50 { background: #f9fafb !important; }
          .print\\:border-gray-300 { border-color: #d1d5db !important; }
          .print\\:bg-gray-100 { background: #f3f4f6 !important; }
          .print\\:text-gray-700 { color: #374151 !important; }
          .print\\:text-gray-800 { color: #1f2937 !important; }
          .print\\:bg-gray-200 { background: #e5e7eb !important; }
          .print\\:text-amber-600 { color: #d97706 !important; }
          .print\\:text-green-700 { color: #15803d !important; }
          .print\\:text-red-700 { color: #b91c1c !important; }
          .print\\:border-b-0 { border-bottom: none !important; }
          .print\\:mt-4 { margin-top: 1rem !important; }
          .print\\:mb-6 { margin-bottom: 1.5rem !important; }
          .print\\:mt-8 { margin-top: 2rem !important; }
          @page { margin: 15mm; }
        }
      `}</style>
    </div>
  );
}
