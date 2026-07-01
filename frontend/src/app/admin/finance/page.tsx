'use client';

import { useEffect, useState, useMemo, useCallback, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { swalConfirm } from '@/lib/swal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const CURRENCY = 'د.أ';

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
function getUser() { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } }

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

function safeDate(d: any) { return d ? new Date(d) : new Date(); }
function fmtDate(d: any) { const dt = safeDate(d); return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`; }
function fmtDateFull(d: any) { return safeDate(d).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' }); }

// ── حالات ارتباط المصروف (5) ──
const SCOPE_OPTIONS = [
  { v: 'general',   l: 'مصروف عام (غير مرتبط)' },
  { v: 'activity',  l: 'مرتبط بنشاط' },
  { v: 'player',    l: 'مرتبط بلاعب' },
  { v: 'equipment', l: 'معدات وأدوات' },
  { v: 'other',     l: 'أخرى' },
];
const SCOPE_LABEL: Record<string, string> = { general: 'عام', activity: 'نشاط', player: 'لاعب', equipment: 'معدات وأدوات', other: 'أخرى' };
const SCOPE_COLOR: Record<string, string> = {
  general: 'bg-gray-600/30 text-gray-300 border-gray-500/30',
  activity: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  player: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  equipment: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  other: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
};

type FinTab = 'transactions' | 'foundational' | 'activity_stats';

export default function FinancePage() {
  const user = useMemo(() => getUser(), []);
  const isLocationOwner = user.role === 'location_owner';
  const isAdmin = user.username === 'admin' || user.role === 'admin';
  const isFinanceManager = isAdmin || user.role === 'accountant'; // المحاسب له نفس صلاحيات الأدمن المالية

  // ── Data ──
  const [bookings, setBookings] = useState<any[]>([]);
  const [costs, setCosts] = useState<any[]>([]);
  const [foundational, setFoundational] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Tab ──
  const [activeTab, setActiveTab] = useState<FinTab>('transactions');

  // ── Transactions (per-activity) ──
  const [expandedFin, setExpandedFin] = useState<number | null>(null);
  const [finSearch, setFinSearch] = useState('');
  const [finDateFrom, setFinDateFrom] = useState('');
  const [finDateTo, setFinDateTo] = useState('');
  const [finPage, setFinPage] = useState(1);
  const finPageSize = 8;

  // ── Add-expense modal ──
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [exCategory, setExCategory] = useState('');
  const [exAmount, setExAmount] = useState('');
  const [exPaidBy, setExPaidBy] = useState('');
  const [exScope, setExScope] = useState('general');
  const [exActivityId, setExActivityId] = useState('');
  const [exPlayerId, setExPlayerId] = useState('');
  const [addingExpense, setAddingExpense] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);

  // ── Foundational form ──
  const [fItem, setFItem] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fPaidBy, setFPaidBy] = useState('');
  const [fSource, setFSource] = useState('');
  const [addingF, setAddingF] = useState(false);
  const [fPage, setFPage] = useState(1);
  const fPageSize = 10;

  // ── Partner stats dialog ──
  const [partnerStatsName, setPartnerStatsName] = useState<string | null>(null);

  // ── Stats filter ──
  const [statsDateFrom, setStatsDateFrom] = useState('2026-06-01');
  const [statsDateTo, setStatsDateTo] = useState('');

  // ══ Fetch ══
  const fetchAll = useCallback(async () => {
    try {
      const [bks, csts, fnd, acts, locs, cats] = await Promise.all([
        apiFetch('/api/bookings'),
        apiFetch('/api/costs'),
        apiFetch('/api/foundational'),
        apiFetch('/api/activities'),
        apiFetch('/api/locations'),
        apiFetch('/api/expense-categories').catch(() => []),
      ]);
      setBookings(bks);
      setCosts(csts);
      setFoundational(fnd);
      setActivities(acts);
      setLocations(locs);
      setExpenseCategories(cats || []);
      try { setStaffList(await apiFetch('/api/staff')); } catch {}
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); const iv = setInterval(fetchAll, 30000); return () => clearInterval(iv); }, [fetchAll]);

  // اللاعبون (مرّة واحدة — للربط بلاعب وعرض أسمائهم). المسار الإداري: /api/player/all
  useEffect(() => { (async () => { try { const d = await apiFetch('/api/player/all'); setPlayers(d?.players || []); } catch {} })(); }, []);
  const playerMap = useMemo(() => { const m = new Map<number, any>(); players.forEach(p => m.set(p.id, p)); return m; }, [players]);

  // مبلغ الحجز حسب الدور
  const getBookingDisplayAmount = useCallback((b: any): number => {
    if (isLocationOwner) {
      if (b.offerItems?.length > 0) return b.offerItems.reduce((s: number, i: any) => s + ((i.venueShare || 0) * (i.quantity || 0)), 0);
      return 0;
    }
    if (b.offerItems?.length > 0) return b.offerItems.reduce((s: number, i: any) => s + ((i.clubShare || 0) * (i.quantity || 0)), 0);
    return Number(b.paidAmount || 0);
  }, [isLocationOwner]);

  // ══════════════════════════════════════════════════════
  // ██ TRANSACTIONS TAB — Per-activity finance
  // ══════════════════════════════════════════════════════

  // استبعاد فعاليات Test Location (مطابقة بالاسم)
  const testLocationIds = useMemo(() => new Set(
    locations.filter((l: any) => String(l.name || '').trim().toLowerCase().includes('test location')).map((l: any) => l.id)
  ), [locations]);
  const visibleActivities = useMemo(() => activities.filter((a: any) => !testLocationIds.has(a.locationId)), [activities, testLocationIds]);

  const activityFinance = useMemo(() => {
    const rows = visibleActivities.map((act: any) => {
      const actBookings = bookings.filter(b => b.activityId === act.id);
      const revenue = actBookings.filter(b => b.isPaid).reduce((s, b) => s + getBookingDisplayAmount(b), 0);
      const freePlayers = actBookings.filter(b => b.isFree).reduce((s, b) => s + (b.count || 1), 0);
      const paidPlayers = actBookings.filter(b => b.isPaid && !b.isFree).reduce((s, b) => s + (b.count || 1), 0);
      const expenses = costs.filter(c => c.scope === 'activity' && c.activityId === act.id);
      const expensesTotal = expenses.reduce((s, c) => s + Number(c.amount || 0), 0);
      return {
        id: act.id, name: act.name, date: act.date,
        revenue, freePlayers, paidPlayers, totalPlayers: freePlayers + paidPlayers,
        expenses, expensesTotal, net: revenue - expensesTotal,
      };
    });
    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [visibleActivities, bookings, costs, getBookingDisplayAmount]);

  // المصاريف غير المرتبطة بنشاط (عام/لاعب/معدات/أخرى)
  const otherExpenses = useMemo(() => costs.filter(c => c.scope !== 'activity').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [costs]);
  // فلترة زمنية (تاريخ النشاط / تاريخ المصروف) + بحث بالاسم
  const inFinRange = useCallback((d: any) => {
    if (finDateFrom) { const from = new Date(finDateFrom); from.setHours(0,0,0,0); if (new Date(d) < from) return false; }
    if (finDateTo) { const to = new Date(finDateTo); to.setHours(23,59,59,999); if (new Date(d) > to) return false; }
    return true;
  }, [finDateFrom, finDateTo]);

  const filteredFinance = useMemo(() => {
    const term = finSearch.trim().toLowerCase();
    return activityFinance.filter(r => (!term || r.name.toLowerCase().includes(term)) && inFinRange(r.date));
  }, [activityFinance, finSearch, inFinRange]);
  const filteredOtherExpenses = useMemo(() => otherExpenses.filter(c => inFinRange(c.date)), [otherExpenses, inFinRange]);
  const filteredOtherExpensesTotal = useMemo(() => filteredOtherExpenses.reduce((s, c) => s + Number(c.amount || 0), 0), [filteredOtherExpenses]);

  const finTotalPages = Math.ceil(filteredFinance.length / finPageSize) || 1;
  const finPaginated = filteredFinance.slice((finPage - 1) * finPageSize, finPage * finPageSize);
  useEffect(() => { setFinPage(1); }, [finSearch, finDateFrom, finDateTo]);

  const finTotals = useMemo(() => {
    const revenue = filteredFinance.reduce((s, r) => s + r.revenue, 0);
    const activityExp = filteredFinance.reduce((s, r) => s + r.expensesTotal, 0);
    const expenses = activityExp + filteredOtherExpensesTotal;
    return { revenue, expenses, net: revenue - expenses };
  }, [filteredFinance, filteredOtherExpensesTotal]);

  const finColSpan = isLocationOwner ? 4 : 6;

  function openExpenseModal() {
    setExCategory(''); setExAmount(''); setExPaidBy(''); setExScope('general'); setExActivityId(''); setExPlayerId('');
    setShowNewCat(false); setNewCatName('');
    setShowExpenseModal(true);
  }

  async function handleAddCategory() {
    const name = newCatName.trim();
    if (!name) return;
    setAddingCat(true);
    try {
      const created = await apiFetch('/api/expense-categories', { method: 'POST', body: JSON.stringify({ name }) });
      setExpenseCategories(prev => prev.some((c: any) => c.id === created.id)
        ? prev
        : [...prev, created].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), 'ar')));
      setExCategory(created.name);
      setNewCatName(''); setShowNewCat(false);
    } catch {} finally { setAddingCat(false); }
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!exCategory || !exAmount) return;
    if (exScope === 'activity' && !exActivityId) return;
    if (exScope === 'player' && !exPlayerId) return;
    setAddingExpense(true);
    try {
      await apiFetch('/api/costs', { method: 'POST', body: JSON.stringify({
        item: exCategory,
        amount: parseFloat(exAmount),
        paidBy: exPaidBy,
        scope: exScope,
        activityId: exScope === 'activity' ? Number(exActivityId) : null,
        playerId: exScope === 'player' ? Number(exPlayerId) : null,
        type: exScope === 'activity' ? 'activity' : 'general',
        date: new Date().toISOString(),
      })});
      setShowExpenseModal(false);
      fetchAll();
    } catch {} finally { setAddingExpense(false); }
  }

  async function handleDeleteCost(id: number) {
    if (!(await swalConfirm('هل تريد حذف هذا المصروف؟'))) return;
    await apiFetch(`/api/costs/${id}`, { method: 'DELETE' });
    fetchAll();
  }

  // ══════════════════════════════════════════════════════
  // ██ FOUNDATIONAL TAB — Logic (بدون تعديل)
  // ══════════════════════════════════════════════════════

  const totalFoundational = foundational.reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
  const fTotalPages = Math.ceil(foundational.length / fPageSize) || 1;
  const fPaginated = foundational.slice((fPage - 1) * fPageSize, fPage * fPageSize);

  async function handleAddFoundational(e: React.FormEvent) {
    e.preventDefault();
    if (!fItem || !fAmount) return;
    setAddingF(true);
    try {
      await apiFetch('/api/foundational', { method: 'POST', body: JSON.stringify({
        item: fItem, amount: parseFloat(fAmount), paidBy: fPaidBy, source: fSource, date: new Date().toISOString(),
      })});
      setFItem(''); setFAmount(''); setFPaidBy(''); setFSource('');
      fetchAll();
    } catch {} finally { setAddingF(false); }
  }

  async function handleDeleteFoundational(id: number) {
    if (!(await swalConfirm('هل تريد حذف هذا المصروف التأسيسي؟'))) return;
    await apiFetch(`/api/foundational/${id}`, { method: 'DELETE' });
    fetchAll();
  }

  async function handleToggleProcessed(id: number, current: boolean) {
    try {
      await apiFetch(`/api/foundational/${id}/process`, { method: 'PUT', body: JSON.stringify({ isProcessed: !current }) });
      fetchAll();
    } catch {}
  }

  function getPartnerStats(person: string) {
    const partners = staffList.filter(s => s.isPartner);
    const partnerCount = Math.max(partners.length, 1);
    const allProcessedTotal = foundational.filter((c: any) => c.isProcessed).reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
    const personUnprocessed = foundational.filter((c: any) => c.paidBy === person && !c.isProcessed).reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
    const grandTotal = totalFoundational;
    const fraction = grandTotal > 0 ? (personUnprocessed + (allProcessedTotal / partnerCount)) / grandTotal : 0;
    return { personUnprocessed, allProcessedTotal, partnerCount, grandTotal, percentage: (fraction * 100).toFixed(2) };
  }

  // ══════════════════════════════════════════════════════
  // ██ ACTIVITY STATS TAB — Logic (بدون تعديل)
  // ══════════════════════════════════════════════════════

  const activityStats = useMemo(() => {
    let filteredActs = activities;
    if (statsDateFrom) { const from = new Date(statsDateFrom); from.setHours(0,0,0,0); filteredActs = filteredActs.filter(a => new Date(a.date) >= from); }
    if (statsDateTo) { const to = new Date(statsDateTo); to.setHours(23,59,59,999); filteredActs = filteredActs.filter(a => new Date(a.date) <= to); }
    const stats = filteredActs.map(act => {
      const actBookings = bookings.filter(b => b.activityId === act.id);
      const actCosts = costs.filter(c => c.activityId === act.id);
      const revenue = actBookings.filter(b => b.isPaid).reduce((sum, b) => sum + getBookingDisplayAmount(b), 0);
      const expenses = actCosts.reduce((sum, c) => sum + Number(c.amount || 0), 0);
      const netProfit = revenue - expenses;
      const freePlayers = actBookings.filter(b => b.isFree).reduce((sum, b) => sum + (b.count || 1), 0);
      const paidPlayers = actBookings.filter(b => !b.isFree).reduce((sum, b) => sum + (b.count || 1), 0);
      return { id: act.id, name: act.name, date: act.date, revenue, expenses, netProfit, freePlayers, paidPlayers, totalPlayers: freePlayers + paidPlayers };
    });
    return stats.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activities, bookings, costs, statsDateFrom, statsDateTo, getBookingDisplayAmount]);

  const statsTotals = useMemo(() => activityStats.reduce((acc, curr) => ({
    revenue: acc.revenue + curr.revenue, expenses: acc.expenses + curr.expenses, netProfit: acc.netProfit + curr.netProfit,
    freePlayers: acc.freePlayers + curr.freePlayers, paidPlayers: acc.paidPlayers + curr.paidPlayers, totalPlayers: acc.totalPlayers + curr.totalPlayers,
  }), { revenue: 0, expenses: 0, netProfit: 0, freePlayers: 0, paidPlayers: 0, totalPlayers: 0 }), [activityStats]);

  // ══ Loading ══
  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>;

  const TABS: { key: FinTab; label: string; icon: string; hidden?: boolean }[] = [
    { key: 'transactions', label: isLocationOwner ? 'الإيرادات' : 'المالية والحركات', icon: '↔️' },
    { key: 'foundational', label: 'مصاريف التأسيس', icon: '🏢', hidden: isLocationOwner },
    { key: 'activity_stats', label: 'إحصائيات الأنشطة', icon: '📊', hidden: isLocationOwner },
  ];

  return (
    <div className="flex flex-col md:flex-row gap-6" dir="rtl">

      {/* ══ SIDEBAR ══ */}
      <div className="md:w-56 shrink-0 space-y-2">
        {TABS.filter(t => !t.hidden).map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition ${activeTab === t.key ? 'bg-gray-900 text-white shadow-lg' : 'bg-gray-800/30 text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ══ CONTENT ══ */}
      <div className="flex-1 space-y-5">

        {/* ════════ TRANSACTIONS TAB ════════ */}
        {activeTab === 'transactions' && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-xl font-bold text-white">{isLocationOwner ? '💰 إيرادات المكان' : '💰 المالية والحركات'}</h2>
              {isFinanceManager && (
                <button onClick={openExpenseModal} className="px-4 py-2 bg-gradient-to-r from-amber-500 to-rose-600 text-white rounded-xl text-sm font-bold hover:opacity-90 transition">
                  + إضافة مصروف
                </button>
              )}
            </div>

            {/* بطاقات الإجمالي */}
            {!isLocationOwner && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                  <p className="text-xs text-emerald-400/80 mb-1">إجمالي الإيرادات</p>
                  <p className="text-lg font-bold text-emerald-400">{finTotals.revenue.toLocaleString()} {CURRENCY}</p>
                </div>
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                  <p className="text-xs text-rose-400/80 mb-1">إجمالي المصاريف</p>
                  <p className="text-lg font-bold text-rose-400">{finTotals.expenses.toLocaleString()} {CURRENCY}</p>
                </div>
                <div className={`border rounded-xl p-3 ${finTotals.net >= 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                  <p className={`text-xs mb-1 ${finTotals.net >= 0 ? 'text-amber-400/80' : 'text-red-400/80'}`}>الصافي</p>
                  <p className={`text-lg font-bold ${finTotals.net >= 0 ? 'text-amber-400' : 'text-red-400'}`}>{finTotals.net.toLocaleString()} {CURRENCY}</p>
                </div>
              </div>
            )}

            {/* بحث + فلترة زمنية */}
            <div className="flex items-center gap-3 flex-wrap bg-gray-800/20 border border-gray-700/20 rounded-xl py-2.5 px-4">
              <input value={finSearch} onChange={e => setFinSearch(e.target.value)} placeholder="🔍 ابحث عن نشاط..."
                className="flex-1 min-w-[150px] px-3 py-1.5 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600" />
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] text-gray-400">من</label>
                <input type="date" value={finDateFrom} onChange={e => setFinDateFrom(e.target.value)} className="px-2 py-1.5 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30" />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] text-gray-400">إلى</label>
                <input type="date" value={finDateTo} onChange={e => setFinDateTo(e.target.value)} className="px-2 py-1.5 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30" />
              </div>
              {(finSearch || finDateFrom || finDateTo) && (
                <button onClick={() => { setFinSearch(''); setFinDateFrom(''); setFinDateTo(''); }} className="text-[10px] text-gray-500 hover:text-amber-400 transition">✕ مسح</button>
              )}
              <span className="text-[10px] text-gray-600 mr-auto">{filteredFinance.length} نشاط</span>
            </div>

            {/* جدول الأنشطة (قابل للتوسّع) */}
            <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl overflow-hidden">
              {finPaginated.length === 0 ? (
                <div className="text-center py-16"><span className="text-4xl block mb-3 opacity-30">📅</span><p className="text-gray-500">لا توجد أنشطة</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" dir="rtl">
                    <thead>
                      <tr className="bg-gray-900/50 text-gray-500 text-xs border-b border-gray-700/30">
                        <th className="w-8 px-3 py-3"></th>
                        <th className="text-right px-4 py-3 font-medium">النشاط والتاريخ</th>
                        <th className="text-center px-4 py-3 font-medium">اللاعبون</th>
                        <th className="text-center px-4 py-3 font-medium">الإيرادات</th>
                        {!isLocationOwner && <th className="text-center px-4 py-3 font-medium">المصاريف</th>}
                        {!isLocationOwner && <th className="text-center px-4 py-3 font-medium">الصافي</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {finPaginated.map((row) => {
                        const open = expandedFin === row.id;
                        return (
                          <Fragment key={row.id}>
                            <tr onClick={() => setExpandedFin(open ? null : row.id)} className={`border-b border-gray-700/15 cursor-pointer transition ${open ? 'bg-amber-500/[0.04]' : 'hover:bg-gray-700/10'}`}>
                              <td className="px-3 py-3 text-center text-gray-500">{open ? '▲' : '▼'}</td>
                              <td className="px-4 py-3">
                                <div className="font-bold text-white mb-0.5 text-xs">{row.name}</div>
                                <div className="text-[10px] text-gray-500">{fmtDate(row.date)}</div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="font-bold text-white">{row.totalPlayers}</span>
                                <div className="text-[10px] text-gray-500 mt-0.5"><span className="text-emerald-400">{row.paidPlayers} مدفوع</span> · <span className="text-blue-400">{row.freePlayers} مجاني</span></div>
                              </td>
                              <td className="px-4 py-3 text-center text-emerald-400 font-bold text-xs">{row.revenue.toLocaleString()} {CURRENCY}</td>
                              {!isLocationOwner && <td className="px-4 py-3 text-center text-rose-400 font-bold text-xs">{row.expensesTotal.toLocaleString()} {CURRENCY}</td>}
                              {!isLocationOwner && (
                                <td className="px-4 py-3 text-center font-bold text-sm">
                                  <span className={row.net >= 0 ? 'text-amber-400' : 'text-red-400'}>{row.net.toLocaleString()} {CURRENCY}</span>
                                </td>
                              )}
                            </tr>
                            {open && (
                              <tr className="bg-gray-950/50 border-b border-gray-800/60">
                                <td colSpan={finColSpan} className="px-6 py-4">
                                  {/* تفاصيل الإيراد */}
                                  <div className="flex flex-wrap gap-4 text-xs mb-3">
                                    <span className="text-gray-400">👥 لاعبون مدفوعون: <b className="text-emerald-400">{row.paidPlayers}</b></span>
                                    <span className="text-gray-400">🎟️ مجانيون: <b className="text-blue-400">{row.freePlayers}</b></span>
                                    <span className="text-gray-400">💵 الإيراد: <b className="text-emerald-400">{row.revenue.toLocaleString()} {CURRENCY}</b></span>
                                    {!isLocationOwner && <span className="text-gray-400">📉 المصاريف: <b className="text-rose-400">{row.expensesTotal.toLocaleString()} {CURRENCY}</b></span>}
                                  </div>
                                  {/* تفاصيل المصاريف */}
                                  {!isLocationOwner && (
                                    <div>
                                      <p className="text-[10px] text-gray-500 mb-1.5 font-bold">مصاريف النشاط:</p>
                                      {row.expenses.length === 0 ? (
                                        <p className="text-xs text-gray-600">لا مصاريف مسجّلة لهذا النشاط.</p>
                                      ) : (
                                        <div className="space-y-1">
                                          {row.expenses.map((c: any) => (
                                            <div key={c.id} className="flex items-center gap-3 text-xs bg-gray-900/40 rounded-lg px-3 py-1.5">
                                              <span className="text-white font-medium flex-1">{c.item}</span>
                                              <span className="text-rose-400 font-bold">{Number(c.amount || 0).toLocaleString()} {CURRENCY}</span>
                                              {c.paidBy && <span className="text-gray-500">دفعها: {c.paidBy}</span>}
                                              <span className="text-gray-600 text-[10px]">{fmtDate(c.date)}</span>
                                              {isFinanceManager && <button onClick={() => handleDeleteCost(c.id)} className="text-rose-400/50 hover:text-rose-400" title="حذف">🗑️</button>}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination */}
            {filteredFinance.length > finPageSize && (
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => setFinPage(p => Math.max(1, p-1))} disabled={finPage <= 1} className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-sm disabled:opacity-30">◄</button>
                <span className="text-sm text-gray-400">صفحة {finPage} من {finTotalPages}</span>
                <button onClick={() => setFinPage(p => Math.min(finTotalPages, p+1))} disabled={finPage >= finTotalPages} className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-sm disabled:opacity-30">►</button>
              </div>
            )}

            {/* ── مصاريف غير مرتبطة بنشاط ── */}
            {!isLocationOwner && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">🏛️ مصاريف غير مرتبطة بنشاط <span className="text-[10px] text-gray-500">({filteredOtherExpenses.length})</span></h3>
                  <span className="text-xs px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">الإجمالي: {filteredOtherExpensesTotal.toLocaleString()} {CURRENCY}</span>
                </div>
                <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl overflow-hidden">
                  {filteredOtherExpenses.length === 0 ? (
                    <div className="text-center py-10"><p className="text-gray-600 text-sm">لا مصاريف عامة/أخرى</p></div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" dir="rtl">
                        <thead>
                          <tr className="bg-gray-900/50 text-gray-500 text-xs border-b border-gray-700/30">
                            <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                            <th className="text-right px-4 py-3 font-medium">النوع</th>
                            <th className="text-center px-4 py-3 font-medium">الحالة</th>
                            <th className="text-right px-4 py-3 font-medium">الهدف</th>
                            <th className="text-center px-4 py-3 font-medium">المبلغ</th>
                            <th className="text-right px-4 py-3 font-medium">من دفعه</th>
                            {isFinanceManager && <th className="text-center px-4 py-3 font-medium">إجراء</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredOtherExpenses.map((c: any) => (
                            <tr key={c.id} className="border-b border-gray-700/15 hover:bg-gray-700/10 transition">
                              <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(c.date)}</td>
                              <td className="px-4 py-3 text-white font-medium text-xs">{c.item}</td>
                              <td className="px-4 py-3 text-center"><span className={`text-[10px] px-2 py-0.5 rounded-full border ${SCOPE_COLOR[c.scope] || SCOPE_COLOR.general}`}>{SCOPE_LABEL[c.scope] || c.scope}</span></td>
                              <td className="px-4 py-3 text-xs text-gray-300">{c.scope === 'player' ? (playerMap.get(c.playerId)?.name || (c.playerId ? `#${c.playerId}` : '—')) : '—'}</td>
                              <td className="px-4 py-3 text-center text-rose-400 font-bold text-xs">{Number(c.amount || 0).toLocaleString()} {CURRENCY}</td>
                              <td className="px-4 py-3 text-xs text-gray-400">{c.paidBy || '—'}</td>
                              {isFinanceManager && (
                                <td className="px-4 py-3 text-center">
                                  <button onClick={() => handleDeleteCost(c.id)} className="p-1.5 rounded-lg text-rose-400/50 hover:text-rose-400 hover:bg-rose-500/10 transition" title="حذف">🗑️</button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════ FOUNDATIONAL TAB ════════ */}
        {activeTab === 'foundational' && !isLocationOwner && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-xl font-bold text-white">🏢 مصاريف التأسيس</h2>
              <span className="text-xs px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">الإجمالي: {totalFoundational.toLocaleString()} {CURRENCY}</span>
            </div>

            <form onSubmit={handleAddFoundational} className="flex flex-wrap items-end gap-3 bg-gray-800/30 border border-gray-700/30 rounded-xl p-4">
              <div className="flex-1 min-w-[130px]">
                <label className="block text-[10px] text-gray-500 mb-1">البيان *</label>
                <input type="text" value={fItem} onChange={e => setFItem(e.target.value)} placeholder="البيان..." required className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600" />
              </div>
              <div className="w-24">
                <label className="block text-[10px] text-gray-500 mb-1">المبلغ *</label>
                <input type="number" min="0" value={fAmount} onChange={e => setFAmount(e.target.value)} placeholder="المبلغ" required className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600" />
              </div>
              <div className="w-28">
                <label className="block text-[10px] text-gray-500 mb-1">دفع بواسطة</label>
                <input type="text" value={fPaidBy} onChange={e => setFPaidBy(e.target.value)} placeholder="اختياري" className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600" />
              </div>
              <div className="w-28">
                <label className="block text-[10px] text-gray-500 mb-1">المصدر</label>
                <input type="text" value={fSource} onChange={e => setFSource(e.target.value)} placeholder="تفاصيل" className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600" />
              </div>
              <button type="submit" disabled={addingF} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-bold hover:bg-gray-800 transition disabled:opacity-50">{addingF ? '...' : '+ أضف مصاريف'}</button>
            </form>

            <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl overflow-hidden">
              {fPaginated.length === 0 ? (
                <div className="text-center py-16"><span className="text-4xl block mb-3 opacity-30">🏢</span><p className="text-gray-500">لا توجد مصاريف تأسيسية</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" dir="rtl">
                    <thead>
                      <tr className="bg-gray-900/50 text-gray-500 text-xs border-b border-gray-700/30">
                        <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                        <th className="text-right px-4 py-3 font-medium">البيان</th>
                        <th className="text-center px-4 py-3 font-medium">المبلغ</th>
                        <th className="text-right px-4 py-3 font-medium">معلومات الدفع</th>
                        <th className="text-center px-4 py-3 font-medium">معالج؟</th>
                        {isFinanceManager && <th className="text-center px-4 py-3 font-medium">إجراءات</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {fPaginated.map((c: any) => {
                        const isProcessed = !!c.isProcessed;
                        const canToggle = isFinanceManager || staffList.find(s => s.username === user.username)?.isPartner;
                        return (
                          <tr key={c.id} className="border-b border-gray-700/15 hover:bg-gray-700/10 transition">
                            <td className="px-4 py-3 text-gray-500 text-xs">{fmtDateFull(c.date)}</td>
                            <td className="px-4 py-3 text-white font-medium text-xs">{c.item}</td>
                            <td className="px-4 py-3 text-center font-bold text-rose-400">{Number(c.amount || 0).toLocaleString()} {CURRENCY}</td>
                            <td className="px-4 py-3">
                              {c.paidBy ? (
                                <button onClick={() => setPartnerStatsName(c.paidBy)} className="text-xs text-blue-400 hover:underline cursor-pointer">{c.paidBy}{c.source ? ` | ${c.source}` : ''}</button>
                              ) : <span className="text-gray-600 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input type="checkbox" checked={isProcessed} onChange={() => canToggle && handleToggleProcessed(c.id, isProcessed)} disabled={!canToggle} className={`accent-emerald-500 w-4 h-4 ${!canToggle ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`} />
                            </td>
                            {isFinanceManager && (
                              <td className="px-4 py-3 text-center">
                                <button onClick={() => handleDeleteFoundational(c.id)} className="p-1.5 rounded-lg text-rose-400/50 hover:text-rose-400 hover:bg-rose-500/10 transition">🗑️</button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {foundational.length > fPageSize && (
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => setFPage(p => Math.max(1, p-1))} disabled={fPage <= 1} className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-sm disabled:opacity-30">◄</button>
                <span className="text-sm text-gray-400">صفحة {fPage} من {fTotalPages}</span>
                <button onClick={() => setFPage(p => Math.min(fTotalPages, p+1))} disabled={fPage >= fTotalPages} className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-sm disabled:opacity-30">►</button>
              </div>
            )}
          </>
        )}

        {/* ════════ ACTIVITY STATS TAB ════════ */}
        {activeTab === 'activity_stats' && !isLocationOwner && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-xl font-bold text-white">📊 إحصائيات الأنشطة التفصيلية</h2>
            </div>

            <div className="flex items-center gap-3 flex-wrap bg-gray-800/20 border border-gray-700/20 rounded-xl py-2.5 px-4">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">من تاريخ:</label>
                <input type="date" value={statsDateFrom} onChange={e => setStatsDateFrom(e.target.value)} className="px-3 py-1.5 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">إلى تاريخ:</label>
                <input type="date" value={statsDateTo} onChange={e => setStatsDateTo(e.target.value)} className="px-3 py-1.5 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30" />
              </div>
              <span className="text-[10px] text-gray-600 mr-auto">{activityStats.length} نشاط</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                <p className="text-xs text-emerald-400/80 mb-1">إجمالي الإيرادات</p>
                <p className="text-lg font-bold text-emerald-400">{statsTotals.revenue.toLocaleString()} {CURRENCY}</p>
              </div>
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                <p className="text-xs text-rose-400/80 mb-1">إجمالي التكاليف</p>
                <p className="text-lg font-bold text-rose-400">{statsTotals.expenses.toLocaleString()} {CURRENCY}</p>
              </div>
              <div className={`border rounded-xl p-3 ${statsTotals.netProfit >= 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                <p className={`text-xs mb-1 ${statsTotals.netProfit >= 0 ? 'text-amber-400/80' : 'text-red-400/80'}`}>صافي الربح</p>
                <p className={`text-lg font-bold ${statsTotals.netProfit >= 0 ? 'text-amber-400' : 'text-red-400'}`}>{statsTotals.netProfit.toLocaleString()} {CURRENCY}</p>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                <p className="text-xs text-blue-400/80 mb-1">إجمالي اللاعبين</p>
                <p className="text-lg font-bold text-blue-400">{statsTotals.totalPlayers} <span className="text-xs font-normal text-gray-400">({statsTotals.paidPlayers} مدفوع / {statsTotals.freePlayers} مجاني)</span></p>
              </div>
            </div>

            <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl overflow-hidden">
              {activityStats.length === 0 ? (
                <div className="text-center py-16"><span className="text-4xl block mb-3 opacity-30">📊</span><p className="text-gray-500">لا توجد أنشطة مطابقة للفلاتر</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" dir="rtl">
                    <thead>
                      <tr className="bg-gray-900/50 text-gray-500 text-xs border-b border-gray-700/30">
                        <th className="text-right px-4 py-3 font-medium">النشاط والتاريخ</th>
                        <th className="text-center px-4 py-3 font-medium">اللاعبون (مجاني/مدفوع)</th>
                        <th className="text-center px-4 py-3 font-medium">الإيرادات</th>
                        <th className="text-center px-4 py-3 font-medium">المصاريف</th>
                        <th className="text-center px-4 py-3 font-medium">الصافي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityStats.map((stat) => (
                        <tr key={stat.id} className="border-b border-gray-700/15 hover:bg-gray-700/10 transition">
                          <td className="px-4 py-3">
                            <div className="font-bold text-white mb-0.5">{stat.name}</div>
                            <div className="text-[10px] text-gray-500">{fmtDate(stat.date)}</div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-bold text-white">{stat.totalPlayers}</span>
                            <div className="text-[10px] text-gray-500 mt-0.5"><span className="text-blue-400">{stat.freePlayers} مجاني</span> | <span className="text-emerald-400">{stat.paidPlayers} مدفوع</span></div>
                          </td>
                          <td className="px-4 py-3 text-center text-emerald-400 font-bold text-xs">{stat.revenue.toLocaleString()} {CURRENCY}</td>
                          <td className="px-4 py-3 text-center text-rose-400 font-bold text-xs">{stat.expenses.toLocaleString()} {CURRENCY}</td>
                          <td className="px-4 py-3 text-center font-bold text-sm"><span className={stat.netProfit >= 0 ? 'text-amber-400' : 'text-red-400'}>{stat.netProfit.toLocaleString()} {CURRENCY}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ══ ADD-EXPENSE MODAL ══ */}
      <AnimatePresence>
        {showExpenseModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowExpenseModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">💸 إضافة مصروف</h3>
              <form onSubmit={handleAddExpense} className="space-y-4">
                {/* نوع المصروف */}
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">نوع المصروف *</label>
                  <div className="flex gap-2">
                    <select value={exCategory} onChange={e => setExCategory(e.target.value)} required className="flex-1 px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30">
                      <option value="">اختر النوع...</option>
                      {expenseCategories.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <button type="button" onClick={() => setShowNewCat(s => !s)} className="px-3 py-2 bg-gray-700/60 text-gray-200 rounded-lg text-xs font-bold hover:bg-gray-700 transition whitespace-nowrap">+ نوع جديد</button>
                  </div>
                  {showNewCat && (
                    <div className="flex gap-2 mt-2">
                      <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="اسم النوع الجديد..." className="flex-1 px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }} />
                      <button type="button" onClick={handleAddCategory} disabled={addingCat || !newCatName.trim()} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition disabled:opacity-40">{addingCat ? '...' : 'حفظ'}</button>
                    </div>
                  )}
                </div>

                {/* الارتباط (5 حالات) */}
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">الارتباط *</label>
                  <select value={exScope} onChange={e => { setExScope(e.target.value); setExActivityId(''); setExPlayerId(''); }} className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30">
                    {SCOPE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>

                {/* اختيار النشاط */}
                {exScope === 'activity' && (
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">النشاط *</label>
                    <select value={exActivityId} onChange={e => setExActivityId(e.target.value)} required className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30">
                      <option value="">اختر النشاط...</option>
                      {visibleActivities.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                )}

                {/* اختيار اللاعب */}
                {exScope === 'player' && (
                  <PlayerSelect players={players} value={exPlayerId} onChange={setExPlayerId} />
                )}

                {/* المبلغ + من دفعه */}
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-[11px] text-gray-400 mb-1">المبلغ *</label>
                    <input type="number" min="0" step="0.5" value={exAmount} onChange={e => setExAmount(e.target.value)} placeholder="0" required className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[11px] text-gray-400 mb-1">من دفعه</label>
                    <input type="text" value={exPaidBy} onChange={e => setExPaidBy(e.target.value)} placeholder="اختياري" className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600" />
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <button type="submit" disabled={addingExpense} className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-rose-600 text-white rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-50">{addingExpense ? 'جارٍ الحفظ...' : 'حفظ المصروف'}</button>
                  <button type="button" onClick={() => setShowExpenseModal(false)} className="px-5 py-2.5 bg-gray-700/50 text-gray-300 rounded-xl text-sm hover:bg-gray-700/70 transition">إلغاء</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ PARTNER STATS DIALOG ══ */}
      <AnimatePresence>
        {partnerStatsName && (() => {
          const stats = getPartnerStats(partnerStatsName);
          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPartnerStatsName(null)}>
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 w-full max-w-sm space-y-4">
                <h3 className="text-lg font-bold text-white text-center">📊 إحصائيات المساهمة</h3>
                <div className="space-y-3">
                  <div className="bg-gray-900/50 rounded-xl p-3 flex justify-between"><span className="text-xs text-gray-500">الشريك</span><span className="text-sm font-bold text-white">{partnerStatsName}</span></div>
                  <div className="bg-gray-900/50 rounded-xl p-3 flex justify-between"><span className="text-xs text-gray-500">إجمالي المبالغ غير المعالجة</span><span className="text-sm font-bold text-amber-400">{stats.personUnprocessed.toLocaleString()} {CURRENCY}</span></div>
                  <div className="bg-gray-900/50 rounded-xl p-3 flex justify-between"><span className="text-xs text-gray-500">إجمالي المعالج للجميع</span><span className="text-sm font-bold text-emerald-400">{stats.allProcessedTotal.toLocaleString()} {CURRENCY}</span></div>
                  <div className="bg-gray-900/50 rounded-xl p-3 flex justify-between"><span className="text-xs text-gray-500">عدد الشركاء بالقسمة</span><span className="text-sm font-bold text-white">{stats.partnerCount}</span></div>
                  <hr className="border-gray-700/30" />
                  <div className="bg-gray-900/50 rounded-xl p-3 flex justify-between"><span className="text-xs text-gray-500">إجمالي مصاريف التأسيس</span><span className="text-sm font-bold text-white">{stats.grandTotal.toLocaleString()} {CURRENCY}</span></div>
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex justify-between"><span className="text-xs text-amber-400">نسبة المساهمة الحالية</span><span className="text-lg font-bold text-amber-400">%{stats.percentage}</span></div>
                </div>
                <button onClick={() => setPartnerStatsName(null)} className="w-full py-2.5 bg-gray-700/50 text-gray-300 rounded-xl hover:bg-gray-700/70 transition text-sm">إغلاق</button>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

// قائمة اللاعبين القابلة للبحث (لربط مصروف بلاعب)
function PlayerSelect({ players, value, onChange }: { players: any[]; value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const selected = players.find(p => String(p.id) === String(value));
  const term = q.trim().toLowerCase();
  const filtered = term ? players.filter(p => String(p.name || '').toLowerCase().includes(term) || String(p.phone || '').includes(term)) : players;
  return (
    <div>
      <label className="block text-[11px] text-gray-400 mb-1">اللاعب *</label>
      <div className="relative">
        <button type="button" onClick={() => setOpen(o => !o)} className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm text-right focus:outline-none focus:ring-1 focus:ring-amber-500/30 flex items-center justify-between gap-2">
          <span className={selected ? 'text-white truncate' : 'text-gray-500'}>{selected ? `${selected.name} — ${selected.phone || ''}` : 'اختر لاعباً...'}</span>
          <span className="text-gray-500 text-[10px]">▾</span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setQ(''); }} />
            <div className="absolute z-50 mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-h-64 overflow-hidden flex flex-col">
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ابحث بالاسم أو الهاتف..." className="w-full bg-gray-950 border-b border-gray-700 px-3 py-2 text-sm text-white focus:outline-none" />
              <div className="overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-gray-600 text-center">لا نتائج</div>
                ) : filtered.slice(0, 100).map(p => (
                  <button key={p.id} type="button" onClick={() => { onChange(String(p.id)); setOpen(false); setQ(''); }} className={`w-full text-right px-3 py-2 text-sm hover:bg-gray-800 flex items-center justify-between gap-2 ${String(p.id) === String(value) ? 'bg-indigo-500/10 text-indigo-300' : 'text-gray-200'}`}>
                    <span className="truncate">{p.name}</span>
                    <span className="text-[10px] text-gray-500 font-mono" dir="ltr">{p.phone || ''}</span>
                  </button>
                ))}
                {filtered.length > 100 && <div className="px-3 py-2 text-[10px] text-gray-600 text-center">أول 100 نتيجة — استخدم البحث للتضييق</div>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
