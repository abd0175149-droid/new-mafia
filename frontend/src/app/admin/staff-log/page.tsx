'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
async function apiFetch(path: string) {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// لون كل فئة (اتّساق بصري)
const CAT_COLOR: Record<string, string> = {
  PENALTY: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  PROXY_VOTE: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  DEAL: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  NIGHT_ACTION: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  NIGHT_OVERRIDE: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  SEAT_EDIT: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  PLAYER: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  ROOM_CONFIG: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  GAME_FLOW: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  LUCKY_DRAW: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  PROGRESSION_EDIT: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  TEMPLATE_EDIT: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  OTHER: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
};
const SOURCE_LABEL: Record<string, string> = { socket: 'داخل اللعبة', rest: 'لوحة الإدارة', ui: 'واجهة' };
const ROLE_LABEL: Record<string, string> = { admin: 'أدمن', manager: 'مدير', leader: 'قائد', accountant: 'محاسب', location_owner: 'مالك موقع' };

function fmt(ts: string) {
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString('ar-JO', { month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
}

export default function StaffLogPage() {
  const [meta, setMeta] = useState<{ activities: any[]; staff: any[]; categories: Record<string, string> }>({ activities: [], staff: [], categories: {} });
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [f, setF] = useState({ activityId: '', staffId: '', category: '', roomCode: '', from: '', to: '' });
  const limit = 50;
  const pages = Math.max(1, Math.ceil(total / limit));

  useEffect(() => { apiFetch('/api/staff-action-log/meta').then(setMeta).catch(() => {}); }, []);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (f.activityId) qs.set('activityId', f.activityId);
      if (f.staffId) qs.set('staffId', f.staffId);
      if (f.category) qs.set('category', f.category);
      if (f.roomCode) qs.set('roomCode', f.roomCode.trim());
      if (f.from) qs.set('from', f.from);
      if (f.to) qs.set('to', `${f.to}T23:59:59`);
      qs.set('page', String(p)); qs.set('limit', String(limit));
      const d = await apiFetch(`/api/staff-action-log?${qs.toString()}`);
      setRows(d.logs || []); setTotal(d.total || 0); setPage(p); setExpanded(null);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [f, page]);

  useEffect(() => { load(1); /* أول تحميل */ }, []); // eslint-disable-line

  const apply = () => load(1);
  const clear = () => { setF({ activityId: '', staffId: '', category: '', roomCode: '', from: '', to: '' }); setTimeout(() => load(1), 0); };

  return (
    <div dir="rtl" className="pb-10">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">📋 سجل عمليات الموظفين</h1>
        <p className="text-sm text-gray-500 mt-1">توثيق دقيق لكل تدخّل يدوي للقائد داخل الألعاب — مصنّف حسب النوع والموظف والفعالية والغرفة والوقت.</p>
      </div>

      {/* Filters */}
      <div className="bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <Select label="الفعالية" value={f.activityId} onChange={(v) => setF({ ...f, activityId: v })}
            options={[{ v: '', l: 'الكل' }, ...meta.activities.map((a) => ({ v: String(a.id), l: `#${a.id} — ${a.name}` }))]} />
          <Select label="الموظف" value={f.staffId} onChange={(v) => setF({ ...f, staffId: v })}
            options={[{ v: '', l: 'الكل' }, ...meta.staff.map((s) => ({ v: String(s.id), l: s.displayName || s.username }))]} />
          <Select label="نوع العملية" value={f.category} onChange={(v) => setF({ ...f, category: v })}
            options={[{ v: '', l: 'الكل' }, ...Object.entries(meta.categories).map(([k, l]) => ({ v: k, l: l as string }))]} />
          <Field label="رمز الغرفة"><input value={f.roomCode} onChange={(e) => setF({ ...f, roomCode: e.target.value })} placeholder="مثال: 1144"
            className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" /></Field>
          <Field label="من تاريخ"><input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })}
            className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" /></Field>
          <Field label="إلى تاريخ"><input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}
            className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" /></Field>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button onClick={apply} className="px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-500 transition">تطبيق</button>
          <button onClick={clear} className="px-4 py-2 bg-gray-800 border border-gray-600 text-gray-300 text-sm rounded-lg hover:bg-gray-700 transition">مسح</button>
          <span className="mr-auto text-xs text-gray-500">النتائج: <span className="text-gray-300 font-bold">{total}</span></span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-500 border-b border-gray-700/40 bg-gray-900/40">
                <Th>الوقت</Th><Th>الموظف</Th><Th>العملية</Th><Th>الفعالية</Th><Th>الغرفة</Th><Th>الهدف</Th><Th>المصدر</Th><Th> </Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-500">جارٍ التحميل…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-600">لا سجلات مطابقة.</td></tr>
              ) : rows.map((r) => {
                const t = fmt(r.createdAt);
                const isOpen = expanded === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr onClick={() => setExpanded(isOpen ? null : r.id)}
                      className={`border-b border-gray-800/60 cursor-pointer transition ${isOpen ? 'bg-indigo-500/5' : 'hover:bg-gray-800/40'}`}>
                      <td className="px-3 py-2.5 whitespace-nowrap"><span className="text-gray-300">{t.time}</span><span className="text-gray-600 text-[10px] block">{t.date}</span></td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-white font-medium">{r.staffName || r.staffUsername || '—'}</span>
                        {r.staffRole && <span className="mr-1.5 text-[9px] text-gray-500">({ROLE_LABEL[r.staffRole] || r.staffRole})</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-gray-200">{r.labelAr || r.action}</span>
                        <span className={`mr-2 text-[9px] px-1.5 py-0.5 rounded border ${CAT_COLOR[r.category] || CAT_COLOR.OTHER}`}>{meta.categories[r.category] || r.category}</span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap max-w-[160px] truncate">{r.activityName ? `#${r.activityId} ${r.activityName}` : '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{r.roomCode ? <span className="font-mono text-[#C5A059]">{r.roomCode}</span> : '—'}</td>
                      <td className="px-3 py-2.5 text-gray-300 whitespace-nowrap">{r.targetName ? `${r.targetName}` : (r.targetPhysicalId != null ? `#${r.targetPhysicalId}` : '—')}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap"><span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700/40 text-gray-400">{SOURCE_LABEL[r.source] || r.source}</span></td>
                      <td className="px-3 py-2.5 text-gray-600 text-center">{r.details ? (isOpen ? '▲' : '▼') : ''}</td>
                    </tr>
                    {isOpen && r.details && (
                      <tr className="bg-gray-950/60 border-b border-gray-800/60">
                        <td colSpan={8} className="px-4 py-3">
                          <p className="text-[10px] text-gray-500 mb-1">التفاصيل ({r.action}):</p>
                          <pre className="text-[11px] text-gray-300 bg-black/40 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap" dir="ltr">{JSON.stringify(r.details, null, 2)}</pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button disabled={page <= 1} onClick={() => load(page - 1)} className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 disabled:opacity-40 hover:bg-gray-700">السابق</button>
          <span className="text-xs text-gray-500">صفحة {page} من {pages}</span>
          <button disabled={page >= pages} onClick={() => load(page + 1)} className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 disabled:opacity-40 hover:bg-gray-700">التالي</button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-[11px] text-gray-400 block mb-1">{label}</label>{children}</div>;
}
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
        {options.map((o) => <option key={o.v} value={o.v} className="bg-gray-900">{o.l}</option>)}
      </select>
    </Field>
  );
}
function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-2.5 text-right font-bold">{children}</th>; }
