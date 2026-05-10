'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { REPORT_CATEGORIES, type ReportDefinition } from '../registry';

interface Props {
  selectedCategory: string | null;
  selectedReport: string | null;
  onSelectCategory: (id: string) => void;
  onSelectReport: (report: ReportDefinition) => void;
  collapsed: boolean;
  onToggle: () => void;
  onBack: () => void;
}

export default function ReportSidebar({
  selectedCategory, selectedReport, onSelectCategory, onSelectReport, collapsed, onToggle, onBack,
}: Props) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 56 : 280 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="h-full bg-gray-900/80 backdrop-blur-xl border-l border-gray-800/40 flex flex-col overflow-hidden print:hidden"
    >
      {/* Header with back button */}
      <div className="p-3 flex items-center gap-2 border-b border-gray-800/40 shrink-0">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 transition text-sm shrink-0"
          title="العودة للوحة التحكم"
        >
          →
        </button>
        <button
          onClick={onToggle}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800/60 hover:bg-gray-700 text-gray-400 hover:text-white transition text-sm shrink-0"
        >
          {collapsed ? '◀' : '▶'}
        </button>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 overflow-hidden"
            >
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-white text-xs shrink-0">📋</div>
              <span className="text-sm font-bold text-white whitespace-nowrap">التقارير</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Categories */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {REPORT_CATEGORIES.map((cat) => {
          const isCatActive = selectedCategory === cat.id;
          return (
            <div key={cat.id}>
              <button
                onClick={() => onSelectCategory(cat.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ${
                  isCatActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/40 border border-transparent'
                }`}
              >
                <span className="text-base shrink-0">{cat.icon}</span>
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="font-medium whitespace-nowrap"
                    >
                      {cat.name}
                    </motion.span>
                  )}
                </AnimatePresence>
                {!collapsed && (
                  <span className="mr-auto text-[10px] text-gray-600">{cat.reports.length}</span>
                )}
              </button>

              {/* Reports list */}
              <AnimatePresence>
                {isCatActive && !collapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden pr-4 mt-1 space-y-0.5"
                  >
                    {cat.reports.map((report) => (
                      <button
                        key={report.id}
                        onClick={() => onSelectReport(report)}
                        className={`w-full text-right flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all ${
                          selectedReport === report.id
                            ? 'bg-amber-500/15 text-amber-300 font-bold'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
                        }`}
                      >
                        <span className="text-sm">{report.icon}</span>
                        <span className="truncate">{report.name}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-gray-800/40 shrink-0">
        <button
          onClick={onBack}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-500 hover:text-amber-400 hover:bg-amber-500/5 transition-all ${collapsed ? 'justify-center' : ''}`}
        >
          <span className="text-base shrink-0">🏠</span>
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap text-xs font-medium">
                العودة للوحة التحكم
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}
