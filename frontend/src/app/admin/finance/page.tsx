'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

type FinTab = 'transactions' | 'foundational' | 'venue_dues';

export default function FinancePage() {
  const user = useMemo(() => getUser(), []);
  const isLocationOwner = user.role === 'location_owner';
  const isAdmin = user.username === 'admin' || user.role === 'admin';

  // ── Data ──
  const [bookings, setBookings] = useState<any[]>([]);
  const [costs, setCosts] = useState<any[]>([]);
  const [foundational, setFoundational] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Tab ──
  const [activeTab, setActiveTab] = useState<FinTab>('transactions');

  // ── Transactions filters ──
  const [filterType, setFilterType] = useState('all');
  const [filterReference, setFilterReference] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // ── Transactions pagination ──
  const [txPage, setTxPage] = useState(1);
  const txPageSize = 10;

  // ── Cost form ──
  const [costItem, setCostItem] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costPaidBy, setCostPaidBy] = useState('');
  const [costActivityId, setCostActivityId] = useState('general');
  const [addingCost, setAddingCost] = useState(false);

  // ── Foundational form ──
  const [fItem, setFItem] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fPaidBy, setFPaidBy] = useState('');
  const [fSource, setFSource] = useState('');
  const [addingF, setAddingF] = useState(false);

  // ── Foundational pagination ──
  const [fPage, setFPage] = useState(1);
  const fPageSize = 10;

  // ── Partner stats dialog ──
  const [partnerStatsName, setPartnerStatsName] = useState<string | null>(null);

  // ══ Fetch ══
  const fetchAll = useCallback(async () => {
    try {
      const [bks, csts, fnd, acts, locs] = await Promise.all([
        apiFetch('/api/bookings'),
        apiFetch('/api/costs'),
        apiFetch('/api/foundational'),
        apiFetch('/api/activities'),
        apiFetch('/api/locations'),
      ]);
      setBookings(bks);
      setCosts(csts);
      setFoundational(fnd);
      setActivities(acts);
      setLocations(locs);
      try { setStaffList(await apiFetch('/api/staff')); } catch {}
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); const iv = setInterval(fetchAll, 30000); return () => clearInterval(iv); }, [fetchAll]);

  // ══════════════════════════════════════════════════════
  // ██ TRANSACTIONS TAB — Logic
  // ══════════════════════════════════════════════════════

  // مبلغ الحجز حسب الدور
  function getBookingDisplayAmount(b: any): number {
    if (isLocationOwner) {
      if (b.offerItems?.length > 0) return b.offerItems.reduce((s: number, i: any) => s + ((i.venueShare || 0) * (i.quantity || 0)), 0);
      return 0;
    }
    if (b.offerItems?.length > 0) return b.offerItems.reduce((s: number, i: any) => s + ((i.clubShare || 0) * (i.quantity || 0)), 0);
    return Number(b.paidAmount || 0);
  }

  // بناء allTransactions
  const allTransactions = useMemo(() => {
    const revenues = bookings.filter(b => b.isPaid).map(b => ({
      id: `rev-${b.id}`, date: b.createdAt,
      description: `حجز: ${b.name}`,
      amount: getBookingDisplayAmount(b),
      type: 'revenue' as const,
      reference: activities.find(a => a.id === b.activityId)?.name || 'غير معروف',
      rawId: b.id, activityId: b.activityId,
    }));

    const expenses = isLocationOwner ? [] : costs.map(c => ({
      id: `exp-${c.id}`, date: c.date,
      description: c.item,
      amount: Number(c.amount || 0),
      type: 'expense' as const,
      reference: c.type === 'activity' ? (activities.find(a => a.id === c.activityId)?.name || 'نشاط محذوف') : 'تكاليف عامة',
      rawId: c.id, activityId: c.activityId,
    }));

    return [...revenues, ...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [bookings, costs, activities, isLocationOwner]);

  // الفلاتر
  const filteredTransactions = useMemo(() => {
    let result = allTransactions;
    if (filterType !== 'all') result = result.filter(t => t.type === filterType);
    if (filterReference !== 'all') result = result.filter(t => t.reference === filterReference);
    if (filterDateFrom) { const from = new Date(filterDateFrom); from.setHours(0,0,0,0); result = result.filter(t => t.date && new Date(t.date) >= from); }
    if (filterDateTo) { const to = new Date(filterDateTo); to.setHours(23,59,59,999); result = result.filter(t => t.date && new Date(t.date) <= to); }
    return result;
  }, [allTransactions, filterType, filterReference, filterDateFrom, filterDateTo]);

  const txTotalPages = Math.ceil(filteredTransactions.length / txPageSize) || 1;
  const txPaginated = filteredTransactions.slice((txPage - 1) * txPageSize, txPage * txPageSize);
  useEffect(() => { setTxPage(1); }, [filterType, filterReference, filterDateFrom, filterDateTo]);

  // أسماء الأنشطة الفريدة للفلتر
  const referenceOptions = useMemo(() => {
    const names = new Set(allTransactions.map(t => t.reference));
    return Array.from(names);
  }, [allTransactions]);

  // إضافة تكلفة
  async function handleAddCost(e: React.FormEvent) {
    e.preventDefault();
    if (!costItem || !costAmount) return;
    setAddingCost(true);
    try {
      await apiFetch('/api/costs', { method: 'POST', body: JSON.stringify({
        item: costItem, amount: parseFloat(costAmount),
        activityId: costActivityId === 'general' ? null : Number(costActivityId),
        date: new Date().toISOString(), paidBy: costPaidBy,
        type: costActivityId === 'general' ? 'general' : 'activity',
      })});
      setCostItem(''); setCostAmount(''); setCostPaidBy(''); setCostActivityId('general');
      fetchAll();
    } catch {} finally { setAddingCost(false); }
  }

  // حذف تكلفة
  async function handleDeleteCost(id: number) {
    if (!confirm('هل تريد حذف هذه التكلفة؟')) return;
    await apiFetch(`/api/costs/${id}`, { method: 'DELETE' });
    fetchAll();
  }

  // ══════════════════════════════════════════════════════
  // ██ FOUNDATIONAL TAB — Logic
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
    if (!confirm('هل تريد حذف هذا المصروف التأسيسي؟')) return;
    await apiFetch(`/api/foundational/${id}`, { method: 'DELETE' });
    fetchAll();
  }

  async function handleToggleProcessed(id: number, current: boolean) {
    try {
      await apiFetch(`/api/foundational/${id}/process`, { method: 'PUT', body: JSON.stringify({ isProcessed: !current }) });
      fetchAll();
    } catch {}
  }

  // إحصائيات الشريك
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
  // ██ VENUE DUES TAB — Logic
  // ══════════════════════════════════════════════════════

  const venueDues = useMemo(() => {
    const duesMap = new Map<number, { locationName: string; totalDue: number; details: { actName: string; amount: number }[] }>();

    bookings.filter(b => b.isPaid && b.offerItems?.length > 0).forEach((b: any) => {
      const act = activities.find(a => a.id === b.activityId);
      if (!act?.locationId) return;
      const loc = locations.find(l => l.id === act.locationId);
      if (!loc) return;

      const venueAmount = b.offerItems.reduce((s: number, item: any) => s + ((item.venueShare || 0) * (item.quantity || 0)), 0);
      if (venueAmount <= 0) return;

      if (!duesMap.has(loc.id)) duesMap.set(loc.id, { locationName: loc.name, totalDue: 0, details: [] });
      const entry = duesMap.get(loc.id)!;
      entry.totalDue += venueAmount;

      const existing = entry.details.find(d => d.actName === act.name);
      if (existing) existing.amount += venueAmount;
      else entry.details.push({ actName: act.name, amount: venueAmount });
    });

    return Array.from(duesMap.values()).sort((a, b) => b.totalDue - a.totalDue);
  }, [bookings, activities, locations]);

  const grandDuesTotal = venueDues.reduce((s, d) => s + d.totalDue, 0);

  // ══ Loading ══
  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>;

  // ══════════════════════════════════════════════════════
  // ██ RENDER
  // ══════════════════════════════════════════════════════

  const TABS: { key: FinTab; label: string; icon: string; hidden?: boolean }[] = [
    { key: 'transactions', label: isLocationOwner ? 'الإيرادات' : 'المالية والحركات', icon: '↔️' },
    { key: 'foundational', label: 'مصاريف التأسيس', icon: '🏢', hidden: isLocationOwner },
    { key: 'venue_dues', label: 'مستحقات الأماكن', icon: '📍', hidden: isLocationOwner },
  ];

  return (
    <div className="flex flex-col md:flex-row gap-6" dir="rtl">

      {/* ══ SIDEBAR ══ */}
      <div className="md:w-56 shrink-0 space-y-2">
        {TABS.filter(t => !t.hidden).map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition ${
              activeTab === t.key
                ? 'bg-gray-900 text-white shadow-lg'
                : 'bg-gray-800/30 text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ══ CONTENT ══ */}
      <div className="flex-1 space-y-5">

        {/* ════════════════════════════════════════ */}
        {/* ██ TRANSACTIONS TAB                     */}
        {/* ════════════════════════════════════════ */}
        {activeTab === 'transactions' && (
          <>
            <h2 className="text-xl font-bold text-white">{isLocationOwner ? '💰 إيرادات المكان' : '💰 الحركات المالية وتكاليف الأنشطة'}</h2>

            {/* نموذج إضافة تكلفة */}
            {!isLocationOwner && (
              <form onSubmit={handleAddCost} className="flex flex-wrap items-end gap-3 bg-gray-800/30 border border-gray-700/30 rounded-xl p-4">
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-[10px] text-gray-500 mb-1">وصف التكلفة *</label>
                  <input type="text" value={costItem} onChange={e => setCostItem(e.target.value)} placeholder="وصف التكلفة..." required className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600" />
                </div>
                <div className="w-24">
                  <label className="block text-[10px] text-gray-500 mb-1">المبلغ *</label>
                  <input type="number" min="0" step="0.5" value={costAmount} onChange={e => setCostAmount(e.target.value)} placeholder="المبلغ" required className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600" />
                </div>
                <div className="w-28">
                  <label className="block text-[10px] text-gray-500 mb-1">دفع بواسطة</label>
                  <input type="text" value={costPaidBy} onChange={e => setCostPaidBy(e.target.value)} placeholder="اختياري" className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600" />
                </div>
                <div className="w-36">
                  <label className="block text-[10px] text-gray-500 mb-1">ارتباط</label>
                  <select value={costActivityId} onChange={e => setCostActivityId(e.target.value)} className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30">
                    <option value="general">تكاليف عامة</option>
                    {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <button type="submit" disabled={addingCost} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-bold hover:bg-gray-800 transition disabled:opacity-50">
                  {addingCost ? '...' : '+ تسجيل'}
                </button>
              </form>
            )}

            {/* فلاتر */}
            <div className="flex items-center gap-3 flex-wrap bg-gray-800/20 border border-gray-700/20 rounded-xl py-2.5 px-4">
              <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-1.5 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30">
                <option value="all">كل الأنواع</option>
                <option value="revenue">إيرادات</option>
                {!isLocationOwner && <option value="expense">مصروفات</option>}
              </select>
              <select value={filterReference} onChange={e => setFilterReference(e.target.value)} className="px-3 py-1.5 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30 max-w-[180px]">
                <option value="all">كل الارتباطات</option>
                {referenceOptions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="px-3 py-1.5 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30" />
              <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="px-3 py-1.5 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30" />
              <span className="text-[10px] text-gray-600 mr-auto">{filteredTransactions.length} حركة</span>
            </div>

            {/* جدول الحركات */}
            <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl overflow-hidden">
              {txPaginated.length === 0 ? (
                <div className="text-center py-16"><span className="text-4xl block mb-3 opacity-30">💰</span><p className="text-gray-500">لا توجد حركات مالية</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" dir="rtl">
                    <thead>
                      <tr className="bg-gray-900/50 text-gray-500 text-xs border-b border-gray-700/30">
                        <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                        <th className="text-right px-4 py-3 font-medium">البيان</th>
                        <th className="text-right px-4 py-3 font-medium">الارتباط</th>
                        {!isLocationOwner && <th className="text-center px-4 py-3 font-medium">النوع</th>}
                        <th className="text-center px-4 py-3 font-medium">المبلغ</th>
                        {isAdmin && <th className="text-center px-4 py-3 font-medium">إجراءات</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {txPaginated.map((t: any) => {
                        const locked = activities.find(a => a.id === t.activityId)?.isLocked;
                        const canDelete = isAdmin && t.type === 'expense' && !locked;
                        return (
                          <tr key={t.id} id={`glow-${t.id.startsWith('rev') ? 'booking' : 'cost'}-${t.rawId}`} className="border-b border-gray-700/15 hover:bg-gray-700/10 transition">
                            <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(t.date)}</td>
                            <td className="px-4 py-3 text-white font-medium text-xs">{t.description}</td>
                            <td className="px-4 py-3"><span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-700/40 text-gray-400 border border-gray-600/30">{t.reference}</span></td>
                            {!isLocationOwner && (
                              <td className="px-4 py-3 text-center">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${t.type === 'revenue' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                                  {t.type === 'revenue' ? 'إيراد' : 'صرف'}
                                </span>
                              </td>
                            )}
                            <td className="px-4 py-3 text-center font-bold">
                              <span className={t.type === 'revenue' ? 'text-emerald-400' : 'text-rose-400'}>
                                {t.type === 'revenue' ? '+' : '-'}{Number(t.amount).toLocaleString()} {CURRENCY}
                              </span>
                            </td>
                            {isAdmin && (
                              <td className="px-4 py-3 text-center">
                                {canDelete && <button onClick={() => handleDeleteCost(t.rawId)} className="p-1.5 rounded-lg text-rose-400/50 hover:text-rose-400 hover:bg-rose-500/10 transition" title="حذف">🗑️</button>}
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

            {/* Pagination */}
            {filteredTransactions.length > txPageSize && (
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => setTxPage(p => Math.max(1, p-1))} disabled={txPage <= 1} className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-sm disabled:opacity-30">◄</button>
                <span className="text-sm text-gray-400">صفحة {txPage} من {txTotalPages}</span>
                <button onClick={() => setTxPage(p => Math.min(txTotalPages, p+1))} disabled={txPage >= txTotalPages} className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-sm disabled:opacity-30">►</button>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════ */}
        {/* ██ FOUNDATIONAL TAB                     */}
        {/* ════════════════════════════════════════ */}
        {activeTab === 'foundational' && !isLocationOwner && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-xl font-bold text-white">🏢 مصاريف التأسيس</h2>
              <span className="text-xs px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
                الإجمالي: {totalFoundational.toLocaleString()} {CURRENCY}
              </span>
            </div>

            {/* نموذج إضافة */}
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
              <button type="submit" disabled={addingF} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-bold hover:bg-gray-800 transition disabled:opacity-50">
                {addingF ? '...' : '+ أضف مصاريف'}
              </button>
            </form>

            {/* جدول التأسيس */}
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
                        {isAdmin && <th className="text-center px-4 py-3 font-medium">إجراءات</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {fPaginated.map((c: any) => {
                        const isProcessed = !!c.isProcessed;
                        const canToggle = isAdmin || staffList.find(s => s.username === user.username)?.isPartner;
                        return (
                          <tr key={c.id} className="border-b border-gray-700/15 hover:bg-gray-700/10 transition">
                            <td className="px-4 py-3 text-gray-500 text-xs">{fmtDateFull(c.date)}</td>
                            <td className="px-4 py-3 text-white font-medium text-xs">{c.item}</td>
                            <td className="px-4 py-3 text-center font-bold text-rose-400">{Number(c.amount || 0).toLocaleString()} {CURRENCY}</td>
                            <td className="px-4 py-3">
                              {c.paidBy ? (
                                <button onClick={() => setPartnerStatsName(c.paidBy)} className="text-xs text-blue-400 hover:underline cursor-pointer">
                                  {c.paidBy}{c.source ? ` | ${c.source}` : ''}
                                </button>
                              ) : <span className="text-gray-600 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={isProcessed}
                                onChange={() => canToggle && handleToggleProcessed(c.id, isProcessed)}
                                disabled={!canToggle}
                                className={`accent-emerald-500 w-4 h-4 ${!canToggle ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                              />
                            </td>
                            {isAdmin && (
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

            {/* Pagination */}
            {foundational.length > fPageSize && (
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => setFPage(p => Math.max(1, p-1))} disabled={fPage <= 1} className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-sm disabled:opacity-30">◄</button>
                <span className="text-sm text-gray-400">صفحة {fPage} من {fTotalPages}</span>
                <button onClick={() => setFPage(p => Math.min(fTotalPages, p+1))} disabled={fPage >= fTotalPages} className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-sm disabled:opacity-30">►</button>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════ */}
        {/* ██ VENUE DUES TAB                       */}
        {/* ════════════════════════════════════════ */}
        {activeTab === 'venue_dues' && !isLocationOwner && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-xl font-bold text-white">📍 مستحقات الأماكن</h2>
              <span className="text-xs px-3 py-1.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-bold">
                إجمالي المستحقات: {grandDuesTotal.toLocaleString()} {CURRENCY}
              </span>
            </div>

            <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl overflow-hidden">
              {venueDues.length === 0 ? (
                <div className="text-center py-16"><span className="text-4xl block mb-3 opacity-30">📍</span><p className="text-gray-500">لا توجد مستحقات للأماكن حالياً</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" dir="rtl">
                    <thead>
                      <tr className="bg-gray-900/50 text-gray-500 text-xs border-b border-gray-700/30">
                        <th className="text-right px-4 py-3 font-medium">المكان</th>
                        <th className="text-right px-4 py-3 font-medium">التفاصيل</th>
                        <th className="text-center px-4 py-3 font-medium">المبلغ المستحق</th>
                      </tr>
                    </thead>
                    <tbody>
                      {venueDues.map((due, i) => (
                        <tr key={i} className="border-b border-gray-700/15 hover:bg-gray-700/10 transition">
                          <td className="px-4 py-3 text-white font-bold">{due.locationName}</td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              {due.details.map((d, j) => (
                                <div key={j} className="text-xs text-gray-500">
                                  {d.actName}: <strong className="text-gray-300">{d.amount.toLocaleString()} {CURRENCY}</strong>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-violet-400 text-lg">
                            {due.totalDue.toLocaleString()} {CURRENCY}
                          </td>
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

      {/* ══ PARTNER STATS DIALOG ══ */}
      <AnimatePresence>
        {partnerStatsName && (() => {
          const stats = getPartnerStats(partnerStatsName);
          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPartnerStatsName(null)}>
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 w-full max-w-sm space-y-4">
                <h3 className="text-lg font-bold text-white text-center">📊 إحصائيات المساهمة</h3>

                <div className="space-y-3">
                  <div className="bg-gray-900/50 rounded-xl p-3 flex justify-between">
                    <span className="text-xs text-gray-500">الشريك</span>
                    <span className="text-sm font-bold text-white">{partnerStatsName}</span>
                  </div>
                  <div className="bg-gray-900/50 rounded-xl p-3 flex justify-between">
                    <span className="text-xs text-gray-500">إجمالي المبالغ غير المعالجة</span>
                    <span className="text-sm font-bold text-amber-400">{stats.personUnprocessed.toLocaleString()} {CURRENCY}</span>
                  </div>
                  <div className="bg-gray-900/50 rounded-xl p-3 flex justify-between">
                    <span className="text-xs text-gray-500">إجمالي المعالج للجميع</span>
                    <span className="text-sm font-bold text-emerald-400">{stats.allProcessedTotal.toLocaleString()} {CURRENCY}</span>
                  </div>
                  <div className="bg-gray-900/50 rounded-xl p-3 flex justify-between">
                    <span className="text-xs text-gray-500">عدد الشركاء بالقسمة</span>
                    <span className="text-sm font-bold text-white">{stats.partnerCount}</span>
                  </div>
                  <hr className="border-gray-700/30" />
                  <div className="bg-gray-900/50 rounded-xl p-3 flex justify-between">
                    <span className="text-xs text-gray-500">إجمالي مصاريف التأسيس</span>
                    <span className="text-sm font-bold text-white">{stats.grandTotal.toLocaleString()} {CURRENCY}</span>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex justify-between">
                    <span className="text-xs text-amber-400">نسبة المساهمة الحالية</span>
                    <span className="text-lg font-bold text-amber-400">%{stats.percentage}</span>
                  </div>
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
