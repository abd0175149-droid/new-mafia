'use client';
import { motion } from 'framer-motion';

export function StatCard({ icon, label, value, sub, color = 'amber' }: {
  icon: string; label: string; value: string | number; sub?: string; color?: string;
}) {
  const colors: Record<string, string> = {
    amber:  'border-amber-500/20 bg-amber-500/5 text-amber-400',
    green:  'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
    red:    'border-rose-500/20 bg-rose-500/5 text-rose-400',
    blue:   'border-blue-500/20 bg-blue-500/5 text-blue-400',
    purple: 'border-purple-500/20 bg-purple-500/5 text-purple-400',
  };
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`rounded-2xl border p-4 ${colors[color] || colors.amber}`}
    >
      <div className="text-2xl mb-1">{icon}</div>
      <p className="text-[11px] text-gray-500 mb-1 leading-tight">{label}</p>
      <p className="text-xl font-black">{value}</p>
      {sub && <p className="text-[10px] text-gray-600 mt-1">{sub}</p>}
    </motion.div>
  );
}

export function SectionTitle({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="flex items-center gap-3 mb-4 mt-6 print:mt-4">
      <span className="text-xl">{icon}</span>
      <h3 className="text-base font-bold text-white print:text-black">{title}</h3>
      <div className="flex-1 h-px bg-gray-800 print:bg-gray-300" />
    </div>
  );
}

export function DataTable({ headers, rows, emptyMsg = 'لا توجد بيانات' }: {
  headers: string[]; rows: any[][]; emptyMsg?: string;
}) {
  if (!rows?.length) return <p className="text-center text-gray-600 py-8 text-sm">{emptyMsg}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800 print:border-gray-300">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900/60 print:bg-gray-100 print:border-gray-300">
            {headers.map((h) => (
              <th key={h} className="text-right px-4 py-3 text-xs text-gray-400 print:text-gray-700 font-bold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-800/40 hover:bg-gray-800/20 transition print:border-gray-200 print:hover:bg-transparent">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-gray-300 print:text-gray-800 whitespace-nowrap">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
