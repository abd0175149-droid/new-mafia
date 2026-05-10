'use client';
import { type ReportFilter } from '../registry';

interface Props {
  filters: ReportFilter[];
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
  onApply: () => void;
  loading: boolean;
}

export default function ReportConfigForm({ filters, values, onChange, onApply, loading }: Props) {
  if (!filters.length) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap print:hidden">
      {filters.map((f) => {
        if (f.type === 'period' || f.type === 'select') {
          return (
            <div key={f.id} className="flex items-center gap-2">
              <label className="text-xs text-gray-500 font-medium">{f.label}:</label>
              <select
                value={values[f.id] || f.defaultValue || ''}
                onChange={(e) => onChange(f.id, e.target.value)}
                className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-amber-500/50"
              >
                {f.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          );
        }
        return null;
      })}
      <button
        onClick={onApply}
        disabled={loading}
        className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black font-bold rounded-lg text-xs transition"
      >
        {loading ? (
          <div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
        ) : '🔄'} تطبيق
      </button>
    </div>
  );
}
