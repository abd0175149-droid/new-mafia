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
  const [f, setF] = useState({ activityId: '', staffId: '', category: '', outcome: '', roomId: '', matchId: '', targetName: '', from: '', to: '' });
  const [rooms, setRooms] = useState<any[]>([]);
  const [games, setGames] = useState<{ games: any[]; lobbyCount: number }>({ games: [], lobbyCount: 0 });
  const [targets, setTargets] = useState<{ name: string; physicalId?: number | null; phone?: string }[]>([]);
  const [targetsSource, setTargetsSource] = useState<'log' | 'players'>('players');
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
      if (f.outcome) qs.set('outcome', f.outcome);
      if (f.roomId) qs.set('roomId', f.roomId);
      if (f.matchId) qs.set('matchId', f.matchId);
      if (f.targetName) qs.set('targetName', f.targetName);
      if (f.from) qs.set('from', f.from);
      if (f.to) qs.set('to', `${f.to}T23:59:59`);
      qs.set('page', String(p)); qs.set('limit', String(limit));
      const d = await apiFetch(`/api/staff-action-log?${qs.toString()}`);
      setRows(d.logs || []); setTotal(d.total || 0); setPage(p); setExpanded(null);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [f, page]);

  // مرشّحو «الهدف» — يتعاقبون مع (فعالية/غرفة/لعبة): الأكثر تحديداً يفوز، وإلا كل المستخدمين
  const loadTargets = useCallback((activityId: string, roomId: string, matchId: string) => {
    const qs = new URLSearchParams();
    if (activityId) qs.set('activityId', activityId);
    if (roomId) qs.set('roomId', roomId);
    if (matchId) qs.set('matchId', matchId);
    apiFetch(`/api/staff-action-log/targets?${qs.toString()}`)
      .then((d) => { setTargets(d.targets || []); setTargetsSource(d.source || 'players'); })
      .catch(() => { setTargets([]); });
  }, []);

  useEffect(() => { load(1); loadTargets('', '', ''); /* أول تحميل */ }, []); // eslint-disable-line

  const apply = () => load(1);
  const clear = () => {
    setF({ activityId: '', staffId: '', category: '', outcome: '', roomId: '', matchId: '', targetName: '', from: '', to: '' });
    setRooms([]); setGames({ games: [], lobbyCount: 0 }); loadTargets('', '', '');
    setTimeout(() => load(1), 0);
  };

  // تعاقب الفلاتر: فعالية ← غرفة ← لعبة (وكل تغيير يعيد جلب الأهداف ويصفّر الهدف المختار)
  const onActivityChange = (v: string) => {
    setF((p) => ({ ...p, activityId: v, roomId: '', matchId: '', targetName: '' }));
    setGames({ games: [], lobbyCount: 0 });
    if (v) apiFetch(`/api/staff-action-log/rooms?activityId=${v}`).then((d) => setRooms(d.rooms || [])).catch(() => setRooms([]));
    else setRooms([]);
    loadTargets(v, '', '');
  };
  const onRoomChange = (v: string) => {
    setF((p) => ({ ...p, roomId: v, matchId: '', targetName: '' }));
    if (v) apiFetch(`/api/staff-action-log/games?roomId=${encodeURIComponent(v)}`).then((d) => setGames({ games: d.games || [], lobbyCount: d.lobbyCount || 0 })).catch(() => setGames({ games: [], lobbyCount: 0 }));
    else setGames({ games: [], lobbyCount: 0 });
    loadTargets(f.activityId, v, '');
  };
  const onMatchChange = (v: string) => {
    setF((p) => ({ ...p, matchId: v, targetName: '' }));
    loadTargets(f.activityId, f.roomId, v);
  };
  const winnerAr = (w: string) => ({ MAFIA: 'المافيا', CITIZEN: 'المواطنون', JESTER: 'المهرّج', ASSASSIN: 'السفّاح' } as Record<string, string>)[w] || w;

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
          <Select label="① الفعالية" value={f.activityId} onChange={onActivityChange}
            options={[{ v: '', l: 'الكل' }, ...meta.activities.map((a) => ({ v: String(a.id), l: `#${a.id} — ${a.name}` }))]} />
          <Select label="② الغرفة" value={f.roomId} onChange={onRoomChange} disabled={!f.activityId}
            options={[{ v: '', l: f.activityId ? 'كل غرف الفعالية' : 'اختر فعالية أولاً' }, ...rooms.map((r) => ({ v: r.roomId, l: `غرفة ${r.roomCode || r.roomId}` }))]} />
          <Select label="③ اللعبة" value={f.matchId} onChange={onMatchChange} disabled={!f.roomId}
            options={[
              { v: '', l: f.roomId ? 'كل ألعاب الغرفة' : 'اختر غرفة أولاً' },
              ...games.games.map((g) => ({ v: String(g.id), l: `لعبة #${g.id}${g.winner ? ' — فاز ' + winnerAr(g.winner) : ''} · ${new Date(g.createdAt).toLocaleDateString('ar-JO', { month: 'short', day: 'numeric' })}` })),
              ...(games.lobbyCount > 0 ? [{ v: 'lobby', l: `أحداث اللوبي (غير مرتبطة بلعبة) · ${games.lobbyCount}` }] : []),
            ]} />
          <SearchSelect label="④ الهدف" value={f.targetName} onChange={(v) => setF({ ...f, targetName: v })}
            placeholder={targetsSource === 'players' ? 'كل المستخدمين — ابحث بالاسم' : 'كل الأهداف'}
            options={targets.map((t) => ({ v: t.name, l: t.name, sub: t.phone || (t.physicalId != null ? `مقعد #${t.physicalId}` : undefined) }))} />
          <Select label="الموظف" value={f.staffId} onChange={(v) => setF({ ...f, staffId: v })}
            options={[{ v: '', l: 'الكل' }, ...meta.staff.map((s) => ({ v: String(s.id), l: s.displayName || s.username }))]} />
          <Select label="نوع العملية" value={f.category} onChange={(v) => setF({ ...f, category: v })}
            options={[{ v: '', l: 'الكل' }, ...Object.entries(meta.categories).map(([k, l]) => ({ v: k, l: l as string }))]} />
          <Select label="النتيجة" value={f.outcome} onChange={(v) => setF({ ...f, outcome: v })}
            options={[{ v: '', l: 'الكل' }, { v: 'success', l: '✅ نجحت' }, { v: 'blocked', l: '⛔ محجوبة' }]} />
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
                <Th>الوقت</Th><Th>الموظف</Th><Th>العملية</Th><Th>النتيجة</Th><Th>الفعالية</Th><Th>الغرفة</Th><Th>الهدف</Th><Th>المصدر</Th><Th> </Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-500">جارٍ التحميل…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-600">لا سجلات مطابقة.</td></tr>
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
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {r.outcome === 'success' ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">✅ نجحت</span>
                        ) : r.outcome === 'blocked' ? (
                          <span title={r.details?._blockedReason || 'محجوبة'} className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">⛔ محجوبة</span>
                        ) : (
                          <span className="text-[10px] text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap max-w-[160px] truncate">{r.activityName ? `#${r.activityId} ${r.activityName}` : '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{r.roomCode ? <span className="font-mono text-[#C5A059]">{r.roomCode}</span> : '—'}</td>
                      <td className="px-3 py-2.5 text-gray-300 whitespace-nowrap">{r.targetName ? `${r.targetName}` : (r.targetPhysicalId != null ? `#${r.targetPhysicalId}` : '—')}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap"><span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700/40 text-gray-400">{SOURCE_LABEL[r.source] || r.source}</span></td>
                      <td className="px-3 py-2.5 text-gray-600 text-center">{r.details ? (isOpen ? '▲' : '▼') : ''}</td>
                    </tr>
                    {isOpen && r.details && (
                      <tr className="bg-gray-950/60 border-b border-gray-800/60">
                        <td colSpan={9} className="px-4 py-3">
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
function Select({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[]; disabled?: boolean }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">
        {options.map((o) => <option key={o.v} value={o.v} className="bg-gray-900">{o.l}</option>)}
      </select>
    </Field>
  );
}
// قائمة قابلة للبحث (combobox) — للهدف حيث قد تكون القائمة كبيرة جداً (كل المستخدمين)
function SearchSelect({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { v: string; l: string; sub?: string }[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = options.find((o) => o.v === value);
  const term = q.trim().toLowerCase();
  const filtered = term ? options.filter((o) => o.l.toLowerCase().includes(term) || (o.sub || '').toLowerCase().includes(term)) : options;
  return (
    <Field label={label}>
      <div className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-right text-white focus:outline-none focus:border-indigo-500 flex items-center justify-between gap-2">
          <span className={`truncate ${value ? 'text-white' : 'text-gray-500'}`}>{value || placeholder || 'الكل'}</span>
          <span className="text-gray-500 text-[10px] shrink-0">▾</span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setQ(''); }} />
            <div className="absolute z-50 mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-h-72 overflow-hidden flex flex-col">
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 بحث بالاسم…"
                className="w-full bg-gray-950 border-b border-gray-700 px-3 py-2 text-sm text-white focus:outline-none" />
              <div className="overflow-y-auto">
                <button type="button" onClick={() => { onChange(''); setOpen(false); setQ(''); }}
                  className={`w-full text-right px-3 py-2 text-sm hover:bg-gray-800 ${!value ? 'text-indigo-300' : 'text-gray-400'}`}>الكل</button>
                {filtered.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-gray-600 text-center">لا نتائج</div>
                ) : filtered.slice(0, 200).map((o, i) => (
                  <button key={`${o.v}_${i}`} type="button" onClick={() => { onChange(o.v); setOpen(false); setQ(''); }}
                    className={`w-full text-right px-3 py-2 text-sm hover:bg-gray-800 flex items-center justify-between gap-2 ${o.v === value ? 'bg-indigo-500/10 text-indigo-300' : 'text-gray-200'}`}>
                    <span className="truncate">{o.l}</span>
                    {o.sub && <span className="text-[10px] text-gray-500 font-mono shrink-0" dir="ltr">{o.sub}</span>}
                  </button>
                ))}
                {filtered.length > 200 && <div className="px-3 py-2 text-[10px] text-gray-600 text-center">أول 200 نتيجة — استخدم البحث للتضييق</div>}
              </div>
            </div>
          </>
        )}
      </div>
    </Field>
  );
}
function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-2.5 text-right font-bold">{children}</th>; }
