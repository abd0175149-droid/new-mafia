'use client';
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ReportSidebar from './components/ReportSidebar';
import ReportConfigForm from './components/ReportConfigForm';
import { REPORT_RENDERERS } from './components/renderers';
import { REPORT_CATEGORIES, type ReportDefinition } from './registry';

const API = process.env.NEXT_PUBLIC_API_URL || '';

function getHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export default function ReportsPage() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string | null>('kpi');
  const [selectedReport, setSelectedReport] = useState<ReportDefinition | null>(
    REPORT_CATEGORIES[0]?.reports[0] || null
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Auto-fetch first report on mount
  useEffect(() => {
    if (selectedReport) {
      const defaults: Record<string, string> = {};
      selectedReport.filters.forEach((f) => { defaults[f.id] = f.defaultValue || ''; });
      setFilterValues(defaults);
      fetchReport(selectedReport, defaults);
    }
  }, []);

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
    } catch (e) { console.error('Report fetch error:', e); }
    setLoading(false);
  }, [selectedReport, filterValues]);

  const handleSelectCategory = (id: string) => {
    setSelectedCategory(id === selectedCategory ? null : id);
  };

  const handleSelectReport = (report: ReportDefinition) => {
    setSelectedReport(report);
    setReportData(null);
    setHasLoaded(false);
    const defaults: Record<string, string> = {};
    report.filters.forEach((f) => { defaults[f.id] = f.defaultValue || ''; });
    setFilterValues(defaults);
    setTimeout(() => fetchReport(report, defaults), 50);
  };

  const handleFilterChange = (id: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [id]: value }));
  };

  const handlePrint = () => window.print();

  const renderer = selectedReport ? REPORT_RENDERERS[selectedReport.id] : null;

  return (
    <>
      {/* ═══ Full-screen standalone overlay ═══ */}
      <div className="fixed inset-0 z-[9999] bg-gray-950 flex print:static print:block" dir="rtl">

        {/* ── Reports Sidebar ── */}
        <ReportSidebar
          selectedCategory={selectedCategory}
          selectedReport={selectedReport?.id || null}
          onSelectCategory={handleSelectCategory}
          onSelectReport={handleSelectReport}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onBack={() => router.push('/admin')}
        />

        {/* ── Main Content ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Top Bar */}
          <div className="shrink-0 border-b border-gray-800/40 bg-gray-900/60 backdrop-blur-xl px-6 py-3 flex items-center justify-between gap-4 print:hidden">
            {/* Left: Report info */}
            <div className="flex items-center gap-3 min-w-0">
              {selectedReport ? (
                <>
                  <span className="text-2xl shrink-0">{selectedReport.icon}</span>
                  <div className="min-w-0">
                    <h1 className="text-sm font-black text-white truncate">{selectedReport.name}</h1>
                    <p className="text-[10px] text-gray-500 truncate">{selectedReport.description}</p>
                  </div>
                </>
              ) : (
                <h1 className="text-sm font-bold text-gray-400">📋 اختر تقريراً من القائمة</h1>
              )}
            </div>

            {/* Right: Filters + Actions */}
            <div className="flex items-center gap-3 flex-wrap shrink-0">
              {selectedReport && (
                <ReportConfigForm
                  filters={selectedReport.filters}
                  values={filterValues}
                  onChange={handleFilterChange}
                  onApply={() => fetchReport()}
                  loading={loading}
                />
              )}
              {hasLoaded && (
                <button onClick={handlePrint}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-lg text-xs transition border border-gray-700">
                  🖨️ طباعة
                </button>
              )}
            </div>
          </div>

          {/* Report Content Area */}
          <div className="flex-1 overflow-y-auto p-6 print:p-0">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <div className="animate-spin h-10 w-10 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-sm text-gray-500">جاري تحميل التقرير...</p>
                  </div>
                </motion.div>

              ) : !selectedReport ? (
                <motion.div key="empty" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-20">
                  <div className="text-6xl mb-6">📋</div>
                  <h2 className="text-xl font-bold text-gray-400 mb-2">مرحباً بك في وحدة التقارير</h2>
                  <p className="text-sm text-gray-600 mb-8 text-center max-w-md">اختر فئة تقرير من القائمة الجانبية ثم اختر التقرير المطلوب</p>
                  <div className="grid grid-cols-5 gap-4">
                    {REPORT_CATEGORIES.map((cat) => (
                      <button key={cat.id} onClick={() => { handleSelectCategory(cat.id); handleSelectReport(cat.reports[0]); }}
                        className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gray-800/40 hover:bg-gray-800/60 border border-gray-800 hover:border-amber-500/20 transition-all">
                        <span className="text-2xl">{cat.icon}</span>
                        <span className="text-xs text-gray-400 font-medium">{cat.name}</span>
                        <span className="text-[10px] text-gray-600">{cat.reports.length} تقرير</span>
                      </button>
                    ))}
                  </div>
                </motion.div>

              ) : hasLoaded && reportData && renderer ? (
                <motion.div key={selectedReport.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  {/* Print cover page */}
                  <div className="hidden print:flex" style={{ height: '100vh', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', pageBreakAfter: 'always' }}>
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
                  {/* Print header */}
                  <div className="hidden print:flex justify-between items-center border-b-2 border-amber-500 pb-3 mb-6">
                    <h1 style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a' }}>🎭 نادي المافيا — {selectedReport.name}</h1>
                    <span style={{ fontSize: '11px', color: '#999' }}>{new Date().toLocaleDateString('ar-IQ')}</span>
                  </div>
                  {/* Report content */}
                  {renderer(reportData)}
                  {/* Print footer */}
                  <div className="hidden print:block mt-10 pt-3 border-t border-gray-300 text-center" style={{ fontSize: '10px', color: '#999' }}>
                    نادي المافيا — تقرير مُعَدّ آلياً | {new Date().toLocaleDateString('ar-IQ')}
                  </div>
                </motion.div>

              ) : hasLoaded ? (
                <motion.div key="no-data" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
                  <p className="text-gray-500">لا توجد بيانات لهذا التقرير</p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:flex { display: flex !important; }
          .print\\:block { display: block !important; }
          .print\\:static { position: static !important; }
          .print\\:p-0 { padding: 0 !important; }
          @page { margin: 15mm; }
        }
      `}</style>
    </>
  );
}
