'use client';
import { useEffect, useRef, useState } from 'react';
import { getOptions, type ReportParam, type PickerOption } from '../lib/reportsApi';

interface Props {
  params: ReportParam[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onSubmit: () => void;
  loading: boolean;
}

const inputCls =
  'bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-amber-500/50 focus:outline-none';

// ── منتقٍ يحمّل خياراته من الخادم ──
function AsyncPicker({ source, value, onChange, searchable, placeholder }: {
  source: string; value: any; onChange: (v: string) => void; searchable?: boolean; placeholder: string;
}) {
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getOptions(source, searchable ? q : undefined)
      .then((opts) => { if (alive) setOptions(opts); })
      .catch(() => { if (alive) setOptions([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, searchable ? q : '']);

  if (!searchable) {
    return (
      <select className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{loading ? 'جاري التحميل…' : placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.labelAr}</option>)}
      </select>
    );
  }

  const selected = options.find((o) => o.value === String(value));
  return (
    <div className="relative">
      <input
        className={inputCls + ' w-56'}
        placeholder={placeholder}
        value={open ? q : (selected?.labelAr ?? q)}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value); setOpen(true);
          if (timer.current) clearTimeout(timer.current);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="absolute z-50 mt-1 w-64 max-h-56 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-xl">
          {loading && <div className="px-3 py-2 text-[11px] text-gray-500">جاري البحث…</div>}
          {!loading && options.length === 0 && <div className="px-3 py-2 text-[11px] text-gray-500">لا نتائج</div>}
          {options.map((o) => (
            <button key={o.value} type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(o.value); setQ(''); setOpen(false); }}
              className="w-full text-right px-3 py-1.5 text-[11px] text-gray-300 hover:bg-amber-500/10 hover:text-amber-300">
              {o.labelAr}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ param, value, onChange }: { param: ReportParam; value: any; onChange: (v: any) => void }) {
  switch (param.type) {
    case 'activity-picker':
    case 'location-picker':
    case 'season-picker':
      return <AsyncPicker source={param.optionsSource!} value={value} onChange={onChange} placeholder={`اختر ${param.labelAr}`} />;
    case 'player-picker':
      return <AsyncPicker source={param.optionsSource!} value={value} onChange={onChange} searchable placeholder="ابحث بالاسم أو الهاتف" />;
    case 'date-range':
      return (
        <div className="flex items-center gap-1.5">
          <input type="date" className={inputCls} value={value?.from ?? ''}
            onChange={(e) => onChange({ ...(value ?? {}), from: e.target.value })} />
          <span className="text-gray-500 text-xs">→</span>
          <input type="date" className={inputCls} value={value?.to ?? ''}
            onChange={(e) => onChange({ ...(value ?? {}), to: e.target.value })} />
        </div>
      );
    case 'select':
      return (
        <select className={inputCls} value={value ?? param.defaultValue ?? ''} onChange={(e) => onChange(e.target.value)}>
          {param.optionsSource
            ? <AsyncOptions source={param.optionsSource} />
            : (param.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.labelAr}</option>)}
        </select>
      );
    case 'multi-select':
      return (
        <div className="flex flex-wrap gap-1.5">
          {(param.options ?? []).map((o) => {
            const arr: string[] = Array.isArray(value) ? value : [];
            const on = arr.includes(o.value);
            return (
              <button key={o.value} type="button"
                onClick={() => onChange(on ? arr.filter((v) => v !== o.value) : [...arr, o.value])}
                className={`px-2 py-1 rounded-lg text-[11px] border ${on ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                {o.labelAr}
              </button>
            );
          })}
        </div>
      );
    case 'toggle':
      return (
        <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="accent-amber-500" />
          {param.labelAr}
        </label>
      );
    default:
      return null;
  }
}

// خيارات select من مصدر ديناميكي (staff مثلاً) — تُحمّل مرة
function AsyncOptions({ source }: { source: string }) {
  const [options, setOptions] = useState<PickerOption[]>([]);
  useEffect(() => { getOptions(source).then(setOptions).catch(() => setOptions([])); }, [source]);
  return <>
    <option value="">الكل</option>
    {options.map((o) => <option key={o.value} value={o.value}>{o.labelAr}</option>)}
  </>;
}

export default function ParamForm({ params, values, onChange, onSubmit, loading }: Props) {
  return (
    <div className="flex items-end gap-3 flex-wrap">
      {params.map((p) => (
        <div key={p.key} className="flex flex-col gap-1">
          {p.type !== 'toggle' && <label className="text-[10px] text-gray-500">{p.labelAr}{p.required && <span className="text-rose-400"> *</span>}</label>}
          <Field param={p} value={values[p.key]} onChange={(v) => onChange(p.key, v)} />
        </div>
      ))}
      <button onClick={onSubmit} disabled={loading}
        className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-rose-600 text-white font-bold rounded-lg text-xs disabled:opacity-50">
        {loading ? 'جاري التوليد…' : 'توليد التقرير'}
      </button>
    </div>
  );
}
