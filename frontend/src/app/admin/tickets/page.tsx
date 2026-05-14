'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

const TYPE_MAP: Record<string, { label: string; color: string; icon: string }> = {
  regular: { label: 'عادية', color: 'bg-gray-500/15 text-gray-400 border-gray-500/20', icon: '🎫' },
  vip:     { label: 'VIP', color: 'bg-amber-500/15 text-amber-400 border-amber-500/20', icon: '⭐' },
  free:    { label: 'مجانية', color: 'bg-blue-500/15 text-blue-400 border-blue-500/20', icon: '🎁' },
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ total: 0, used: 0, available: 0, bySeller: {}, byBatch: {}, byType: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'available' | 'used'>('all');
  const [batchFilter, setBatchFilter] = useState('');

  // Upload form
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBatch, setUploadBatch] = useState('');
  const [uploadType, setUploadType] = useState('regular');
  const [uploadPrice, setUploadPrice] = useState('');
  const [uploadSeller, setUploadSeller] = useState('');
  const [uploadSellerPhone, setUploadSellerPhone] = useState('');
  const [uploadDetails, setUploadDetails] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  const fetchAll = async () => {
    try {
      const [tix, st] = await Promise.all([
        apiFetch('/api/tickets?limit=500'),
        apiFetch('/api/tickets/stats'),
      ]);
      setTickets(tix);
      setStats(st);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // فلترة
  const filtered = useMemo(() => {
    let list = tickets;
    if (filter === 'available') list = list.filter(t => !t.isUsed);
    if (filter === 'used') list = list.filter(t => t.isUsed);
    if (batchFilter) list = list.filter(t => t.batchName === batchFilter);
    if (search) list = list.filter(t => t.ticketNumber.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [tickets, filter, batchFilter, search]);

  const batches = useMemo(() => {
    const set = new Set(tickets.map(t => t.batchName).filter(Boolean));
    return Array.from(set) as string[];
  }, [tickets]);

  // رفع ملف
  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    setUploadResult(null);

    try {
      const text = await uploadFile.text();
      let ticketNumbers: string[];

      if (uploadFile.name.endsWith('.xlsx') || uploadFile.name.endsWith('.xls')) {
        setUploadResult('⚠️ يرجى تصدير الملف كـ CSV أولاً');
        setUploading(false);
        return;
      }

      ticketNumbers = text.split(/[\r\n,;]+/).map(t => t.trim()).filter(Boolean);

      if (ticketNumbers.length === 0) {
        setUploadResult('⚠️ لم يتم العثور على أرقام تذاكر');
        setUploading(false);
        return;
      }

      const res = await apiFetch('/api/tickets/upload', {
        method: 'POST',
        body: JSON.stringify({
          ticketNumbers,
          batchName: uploadBatch || undefined,
          ticketType: uploadType,
          price: uploadPrice || undefined,
          sellerName: uploadSeller || undefined,
          sellerPhone: uploadSellerPhone || undefined,
          details: uploadDetails || undefined,
        }),
      });

      setUploadResult(`✅ تم رفع ${res.uploaded} تذكرة${res.duplicates > 0 ? ` (${res.duplicates} مكررة)` : ''}`);
      setUploadFile(null);
      fetchAll();
    } catch (err: any) {
      setUploadResult('❌ فشل: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  // حذف دفعة
  const handleDeleteBatch = async (batchName: string) => {
    if (!confirm(`⚠️ حذف كل تذاكر دفعة "${batchName}"؟`)) return;
    try {
      await apiFetch(`/api/tickets/batch/${encodeURIComponent(batchName)}`, { method: 'DELETE' });
      fetchAll();
    } catch (err: any) {
      alert('فشل: ' + err.message);
    }
  };

  // حذف تذكرة
  const handleDeleteTicket = async (id: number) => {
    try {
      await apiFetch(`/api/tickets/${id}`, { method: 'DELETE' });
      setTickets(prev => prev.filter(t => t.id !== id));
    } catch (err: any) {
      alert('فشل: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-10" dir="rtl">
      {/* ══ Header ══ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            🎫 إدارة التذاكر المركزية
          </h1>
          <p className="text-sm text-gray-500 mt-1">إدارة جميع تذاكر الأنشطة من مكان واحد</p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-violet-600 text-white font-bold text-sm hover:opacity-90 transition flex items-center gap-2"
        >
          {showUpload ? '✕ إغلاق' : '📂 رفع تذاكر جديدة'}
        </button>
      </div>

      {/* ══ Stats Cards ══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي التذاكر', value: stats.total, icon: '🎫', color: 'purple' },
          { label: 'متاحة', value: stats.available, icon: '✅', color: 'emerald' },
          { label: 'مستخدمة', value: stats.used, icon: '📌', color: 'amber' },
          { label: 'الباعة', value: Object.keys(stats.bySeller || {}).length, icon: '👤', color: 'blue' },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`bg-gray-800/50 border border-${s.color}-500/20 rounded-xl p-4`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{s.icon}</span>
              <span className={`text-2xl font-bold text-${s.color}-400`}>{s.value}</span>
            </div>
            <p className="text-xs text-gray-500">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ══ Upload Form ══ */}
      <AnimatePresence>
        {showUpload && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-gray-800/50 border border-purple-500/20 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">📂 رفع دفعة تذاكر جديدة</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* ملف */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">ملف التذاكر (CSV / TXT)</label>
                  <input type="file" accept=".csv,.txt"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-500/20 file:text-purple-400 file:text-xs file:font-bold hover:file:bg-purple-500/30 file:cursor-pointer"
                  />
                </div>

                {/* اسم الدفعة */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">اسم الدفعة</label>
                  <input type="text" value={uploadBatch} onChange={e => setUploadBatch(e.target.value)}
                    placeholder="مثال: دفعة مايو 2026"
                    className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/30 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-sm"
                  />
                </div>

                {/* نوع التذكرة */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">نوع التذكرة</label>
                  <select value={uploadType} onChange={e => setUploadType(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/30 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-sm"
                  >
                    <option value="regular">🎫 عادية</option>
                    <option value="vip">⭐ VIP</option>
                    <option value="free">🎁 مجانية</option>
                  </select>
                </div>

                {/* السعر */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">سعر التذكرة (د.أ)</label>
                  <input type="number" value={uploadPrice} onChange={e => setUploadPrice(e.target.value)}
                    placeholder="0.00" dir="ltr"
                    className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/30 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-sm font-mono"
                  />
                </div>

                {/* اسم البائع */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">اسم البائع / الموزع</label>
                  <input type="text" value={uploadSeller} onChange={e => setUploadSeller(e.target.value)}
                    placeholder="اسم الشخص الذي يبيع هذه التذاكر"
                    className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/30 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-sm"
                  />
                </div>

                {/* هاتف البائع */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">هاتف البائع</label>
                  <input type="text" value={uploadSellerPhone} onChange={e => setUploadSellerPhone(e.target.value)}
                    placeholder="07xxxxxxxxx" dir="ltr"
                    className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/30 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-sm font-mono"
                  />
                </div>
              </div>

              {/* تفاصيل إضافية */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">تفاصيل إضافية</label>
                <textarea value={uploadDetails} onChange={e => setUploadDetails(e.target.value)}
                  placeholder="أي ملاحظات أو تفاصيل..."
                  rows={2}
                  className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/30 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-sm resize-none"
                />
              </div>

              {/* زر الرفع */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleUpload}
                  disabled={!uploadFile || uploading}
                  className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-violet-600 text-white font-bold text-sm rounded-xl hover:opacity-90 transition disabled:opacity-50"
                >
                  {uploading ? '⏳ جارٍ الرفع...' : `📤 رفع ${uploadFile ? uploadFile.name : ''}`}
                </button>
                {uploadResult && (
                  <span className={`text-xs ${uploadResult.startsWith('✅') ? 'text-emerald-400' : uploadResult.startsWith('❌') ? 'text-rose-400' : 'text-amber-400'}`}>
                    {uploadResult}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ Batches Overview ══ */}
      {batches.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">📦 الدفعات</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setBatchFilter('')}
              className={`text-xs px-3 py-1.5 rounded-lg border transition ${!batchFilter ? 'bg-purple-500/20 border-purple-500/30 text-purple-400' : 'border-gray-600/30 text-gray-400 hover:border-gray-500'}`}
            >
              الكل ({stats.total})
            </button>
            {batches.map(b => {
              const batchStats = stats.byBatch?.[b] || { total: 0, used: 0 };
              return (
                <div key={b} className="flex items-center gap-1">
                  <button
                    onClick={() => setBatchFilter(batchFilter === b ? '' : b)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition ${batchFilter === b ? 'bg-purple-500/20 border-purple-500/30 text-purple-400' : 'border-gray-600/30 text-gray-400 hover:border-gray-500'}`}
                  >
                    {b} ({batchStats.total - batchStats.used}/{batchStats.total})
                  </button>
                  <button onClick={() => handleDeleteBatch(b)} className="text-rose-500/50 hover:text-rose-400 text-xs" title="حذف الدفعة">🗑</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ Filter + Search ══ */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 bg-gray-800/50 border border-gray-700/40 rounded-xl p-1">
          {([['all', 'الكل'], ['available', 'متاحة'], ['used', 'مستخدمة']] as const).map(([key, label]) => (
            <button key={key}
              onClick={() => setFilter(key)}
              className={`text-xs px-3 py-1.5 rounded-lg transition ${filter === key ? 'bg-purple-500/20 text-purple-400' : 'text-gray-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 بحث برقم التذكرة..."
          dir="ltr"
          className="flex-1 min-w-[200px] px-4 py-2.5 bg-gray-800/50 border border-gray-700/40 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-sm font-mono"
        />
        <span className="text-xs text-gray-500">{filtered.length} تذكرة</span>
      </div>

      {/* ══ Tickets Table ══ */}
      <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl overflow-hidden">
        {filtered.length > 0 ? (
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm" dir="rtl">
              <thead>
                <tr className="bg-gray-900/50 text-gray-500 text-xs sticky top-0 z-10">
                  <th className="text-right px-3 py-2.5 font-medium">#</th>
                  <th className="text-right px-3 py-2.5 font-medium">رقم التذكرة</th>
                  <th className="text-center px-3 py-2.5 font-medium">النوع</th>
                  <th className="text-center px-3 py-2.5 font-medium">السعر</th>
                  <th className="text-right px-3 py-2.5 font-medium">البائع</th>
                  <th className="text-right px-3 py-2.5 font-medium">الدفعة</th>
                  <th className="text-center px-3 py-2.5 font-medium">الحالة</th>
                  <th className="text-right px-3 py-2.5 font-medium">مستخدمة بواسطة</th>
                  <th className="text-center px-3 py-2.5 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => {
                  const type = TYPE_MAP[t.ticketType] || TYPE_MAP.regular;
                  return (
                    <tr key={t.id} className="border-t border-gray-700/20 hover:bg-gray-700/10 transition">
                      <td className="px-3 py-2.5 text-gray-600 text-xs">{i + 1}</td>
                      <td className="px-3 py-2.5 text-white font-mono text-xs" dir="ltr">{t.ticketNumber}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${type.color}`}>
                          {type.icon} {type.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-400 text-xs font-mono">{t.price ? `${t.price} د.أ` : '—'}</td>
                      <td className="px-3 py-2.5 text-gray-400 text-xs">{t.sellerName || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-400 text-xs">{t.batchName || '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        {t.isUsed ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/20">
                            ✓ مستخدمة
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                            متاحة
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {t.isUsed ? (
                          <div>
                            <p className="text-white">{t.usedByName || '—'}</p>
                            <p className="text-gray-600 font-mono text-[10px]" dir="ltr">{t.usedByPhone || ''}</p>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {!t.isUsed && (
                          <button onClick={() => handleDeleteTicket(t.id)} className="text-rose-500/40 hover:text-rose-400 transition" title="حذف">
                            🗑
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-600">
            <span className="text-4xl block mb-3 opacity-30">🎫</span>
            <p className="text-sm">{tickets.length === 0 ? 'لم يتم رفع أي تذاكر بعد' : 'لا نتائج مطابقة للفلتر'}</p>
          </div>
        )}
      </div>

      {/* ══ Sellers Summary ══ */}
      {Object.keys(stats.bySeller || {}).length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">👤 حسب البائع</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Object.entries(stats.bySeller as Record<string, { total: number; used: number }>).map(([name, s]) => (
              <div key={name} className="bg-gray-900/50 border border-gray-700/20 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-white font-medium">{name}</span>
                  <span className="text-xs text-gray-500">{s.total} تذكرة</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-gradient-to-l from-purple-500 to-violet-400 rounded-full transition-all"
                    style={{ width: `${s.total > 0 ? (s.used / s.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-600 mt-1">{s.used} مستخدمة — {s.total - s.used} متبقية</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
