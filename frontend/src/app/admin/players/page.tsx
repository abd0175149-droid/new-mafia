'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `API error ${res.status}`);
  }
  return res.json();
}

function fmtDate(d: any) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`;
}

function fmtDateTime(d: any) {
  if (!d) return '—';
  const dt = new Date(d);
  const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
  return `${fmtDate(d)} ${dt.toLocaleTimeString('en-US', timeOpts)}`;
}

// ── Role label helpers ──
const RANK_MAP: Record<string, { label: string; icon: string; color: string }> = {
  INFORMANT:  { label: 'المُخبر',       icon: '⭐',  color: 'text-gray-400' },
  ASSOCIATE:  { label: 'المُشارك',      icon: '⭐⭐', color: 'text-blue-400' },
  SOLDIER:    { label: 'الجندي',        icon: '⭐⭐⭐', color: 'text-emerald-400' },
  CAPO:       { label: 'الكابو',        icon: '🌟',  color: 'text-amber-400' },
  UNDERBOSS:  { label: 'نائب الزعيم',   icon: '🌟🌟', color: 'text-orange-400' },
  GODFATHER:  { label: 'الأب الروحي',   icon: '👑',  color: 'text-rose-400' },
};

export default function PlayersManagementPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [togglingTestId, setTogglingTestId] = useState<number | null>(null);
  const [togglingFreeId, setTogglingFreeId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // ── Pagination ──
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // ── Load Players ──
  async function loadPlayers(background = false) {
    if (!background) setLoading(true);
    try {
      const data = await apiFetch('/api/player/all');
      setPlayers(data.players || []);
    } catch (err: any) {
      showToast(err.message || 'خطأ في جلب اللاعبين', 'error');
    } finally {
      if (!background) setLoading(false);
    }
  }
  useEffect(() => { loadPlayers(); }, []);

  // ── Toast ──
  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Reset Password ──
  async function handleResetPassword(player: any) {
    if (!confirm(`هل تريد إعادة تعيين كلمة مرور "${player.name}" إلى الافتراضية (1234)؟`)) return;
    setResettingId(player.id);
    try {
      await apiFetch(`/api/player/${player.id}/reset-password`, { method: 'POST' });
      showToast(`تم إعادة تعيين كلمة مرور ${player.name}`, 'success');
      loadPlayers();
    } catch (err: any) {
      showToast(err.message || 'فشل إعادة التعيين', 'error');
    } finally {
      setResettingId(null);
    }
  }

  // ── View Profile ──
  function handleViewProfile(playerId: number) {
    router.push(`/admin/players/${playerId}`);
  }

  // ── Delete Player ──
  async function handleDeletePlayer(player: any) {
    if (!confirm(`⚠️ هل تريد حذف اللاعب "${player.name}" نهائياً؟\nلن يمكن استرجاع الحساب.`)) return;
    try {
      await apiFetch(`/api/player/${player.id}`, { method: 'DELETE' });
      setPlayers(prev => prev.filter(p => p.id !== player.id));
      showToast(`تم حذف ${player.name}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل حذف اللاعب', 'error');
    }
  }

  // ── Toggle Test Account ──
  async function handleToggleTestAccount(player: any) {
    setTogglingTestId(player.id);
    try {
      await apiFetch(`/api/player/${player.id}/toggle-test`, { method: 'POST' });
      setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, isTestAccount: !p.isTestAccount } : p));
      showToast(`${player.name}: ${player.isTestAccount ? 'تم إلغاء حساب الاختبار' : 'تم تفعيل حساب الاختبار'}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل', 'error');
    } finally {
      setTogglingTestId(null);
    }
  }

  // ── Toggle Free Account ──
  async function handleToggleFreeAccount(player: any) {
    setTogglingFreeId(player.id);
    try {
      await apiFetch(`/api/player/${player.id}/toggle-free`, { method: 'POST' });
      setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, isFreeAccount: !p.isFreeAccount } : p));
      showToast(`${player.name}: ${player.isFreeAccount ? 'تم إلغاء الحساب المجاني' : 'تم تفعيل الحساب المجاني'}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل', 'error');
    } finally {
      setTogglingFreeId(null);
    }
  }

  // ── Filtered Players ──
  const filtered = players.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name?.toLowerCase().includes(q) || p.phone?.includes(q);
  });

  // ── Pagination Logic ──
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedPlayers = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // إعادة الصفحة لـ 1 عند تغيير البحث
  useEffect(() => { setCurrentPage(1); }, [search]);

  // ── Render ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>🎮</span> إدارة اللاعبين
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            عرض وإدارة حسابات اللاعبين المسجلين ({players.length} لاعب)
          </p>
        </div>
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="🔍 بحث بالاسم أو الهاتف..."
            className="px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 w-64 placeholder-gray-500"
          />
        </div>
      </div>

      {/* ═══ STATS CARDS ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي اللاعبين', value: players.length, icon: '👥', color: 'from-blue-500 to-blue-600' },
          { label: 'نشط (آخر 7 أيام)', value: players.filter(p => p.lastActiveAt && (Date.now() - new Date(p.lastActiveAt).getTime()) < 7 * 86400000).length, icon: '🟢', color: 'from-emerald-500 to-emerald-600' },
          { label: 'إجمالي المباريات', value: players.reduce((s, p) => s + (p.totalMatches || 0), 0), icon: '🎯', color: 'from-amber-500 to-amber-600' },
          { label: 'يحتاج تغيير كلمة مرور', value: players.filter(p => p.mustChangePassword).length, icon: '🔐', color: 'from-rose-500 to-rose-600' },
        ].map((stat, i) => (
          <div key={i} className="bg-gray-800/30 border border-gray-700/30 rounded-2xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-lg shrink-0`}>
              {stat.icon}
            </div>
            <div>
              <p className="text-2xl font-black text-white tabular-nums">{stat.value}</p>
              <p className="text-[10px] text-gray-500 font-medium">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ TABLE ═══ */}
      <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500 font-medium">
            {search ? 'لا توجد نتائج مطابقة' : 'لا يوجد لاعبين مسجلين'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900/50 text-gray-500 text-xs border-b border-gray-700/30">
                  <th className="text-right px-4 py-3 font-medium">اللاعب</th>
                  <th className="text-center px-4 py-3 font-medium" dir="ltr">الهاتف</th>
                  <th className="text-center px-4 py-3 font-medium">مباريات</th>
                  <th className="text-center px-4 py-3 font-medium">فوز</th>
                  <th className="text-center px-4 py-3 font-medium">نجا</th>
                  <th className="text-center px-4 py-3 font-medium">المستوى / الرانك</th>
                  <th className="text-center px-4 py-3 font-medium">آخر نشاط</th>
                  <th className="text-center px-4 py-3 font-medium">الحالة</th>
                  <th className="text-center px-4 py-3 font-medium">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPlayers.map(p => {
                  const winRate = p.totalMatches > 0 ? Math.round((p.totalWins / p.totalMatches) * 100) : 0;
                  return (
                    <tr key={p.id} className="border-b border-gray-700/15 hover:bg-gray-700/10 transition">
                      {/* Avatar + Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-white font-bold text-lg overflow-hidden shrink-0">
                            {p.avatarUrl ? (
                              <Image src={`${API_URL}${p.avatarUrl}`} alt="" width={40} height={40} className="w-full h-full object-cover" />
                            ) : (
                              p.name?.[0] || '👤'
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-white">{p.name}</p>
                            <p className="text-[10px] text-gray-500">{p.gender === 'FEMALE' ? 'أنثى' : 'ذكر'} • #{p.id}</p>
                          </div>
                        </div>
                      </td>
                      {/* Phone */}
                      <td className="px-4 py-3 text-center font-mono text-gray-300 text-xs" dir="ltr">{p.phone}</td>
                      {/* Matches */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-white font-bold">{p.totalMatches || 0}</span>
                      </td>
                      {/* Wins */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-emerald-400 font-bold">{p.totalWins || 0}</span>
                        {p.totalMatches > 0 && (
                          <span className="text-gray-600 text-[10px] mr-1">({winRate}%)</span>
                        )}
                      </td>
                      {/* Survived */}
                      <td className="px-4 py-3 text-center text-blue-400 font-bold">{p.totalSurvived || 0}</td>
                      {/* Level + Rank */}
                      <td className="px-4 py-3 text-center">
                        {(() => {
                          const rank = RANK_MAP[p.rankTier] || RANK_MAP.INFORMANT;
                          return (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`text-xs font-bold ${rank.color}`}>{rank.icon} {rank.label}</span>
                              <span className="text-[10px] text-gray-600">Lv.{p.level || 1}</span>
                            </div>
                          );
                        })()}
                      </td>
                      {/* Last Active */}
                      <td className="px-4 py-3 text-center text-gray-500 text-xs font-mono" dir="ltr">
                        {fmtDateTime(p.lastActiveAt)}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {p.mustChangePassword ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20">افتراضي</span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">مفعّل</span>
                          )}
                          {p.isTestAccount && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-purple-500/10 text-purple-400 border-purple-500/20">🧪 اختبار</span>
                          )}
                          {p.isFreeAccount && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-teal-500/10 text-teal-400 border-teal-500/20">🏷️ مجاني</span>
                          )}
                        </div>
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleResetPassword(p)}
                            disabled={resettingId === p.id}
                            className="p-1.5 rounded-lg text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 transition disabled:opacity-30"
                            title="إعادة تعيين كلمة المرور"
                          >
                            {resettingId === p.id ? (
                              <span className="animate-spin inline-block">⏳</span>
                            ) : '🔄'}
                          </button>
                          <button
                            onClick={() => handleViewProfile(p.id)}
                            className="p-1.5 rounded-lg text-blue-400/70 hover:text-blue-400 hover:bg-blue-500/10 transition"
                            title="عرض البروفايل"
                          >
                            👁
                          </button>
                          <button
                            onClick={() => handleToggleTestAccount(p)}
                            disabled={togglingTestId === p.id}
                            className={`p-1.5 rounded-lg transition ${p.isTestAccount ? 'text-purple-400 hover:bg-purple-500/10' : 'text-gray-500/50 hover:text-purple-400 hover:bg-purple-500/10'}`}
                            title={p.isTestAccount ? 'إلغاء حساب اختبار' : 'تفعيل حساب اختبار'}
                          >
                            {togglingTestId === p.id ? '⏳' : '🧪'}
                          </button>
                          <button
                            onClick={() => handleToggleFreeAccount(p)}
                            disabled={togglingFreeId === p.id}
                            className={`p-1.5 rounded-lg transition ${p.isFreeAccount ? 'text-teal-400 hover:bg-teal-500/10' : 'text-gray-500/50 hover:text-teal-400 hover:bg-teal-500/10'}`}
                            title={p.isFreeAccount ? 'إلغاء حساب مجاني' : 'تفعيل حساب مجاني'}
                          >
                            {togglingFreeId === p.id ? '⏳' : '🏷️'}
                          </button>
                          <button
                            onClick={() => handleDeletePlayer(p)}
                            className="p-1.5 rounded-lg text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 transition"
                            title="حذف اللاعب"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ══ PAGINATION ══ */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700/30">
            <p className="text-xs text-gray-500">
              عرض {((currentPage - 1) * itemsPerPage) + 1}–{Math.min(currentPage * itemsPerPage, filtered.length)} من {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-30 text-gray-400 hover:bg-gray-700/40"
              >◀</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`dots-${i}`} className="px-1.5 text-gray-600 text-xs">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p as number)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition ${
                        currentPage === p
                          ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                          : 'text-gray-400 hover:bg-gray-700/40'
                      }`}
                    >{p}</button>
                  )
                )}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-30 text-gray-400 hover:bg-gray-700/40"
              >▶</button>
            </div>
          </div>
        )}
      </div>



      {/* ═══ BLOCKED PAIRS ═══ */}
      <BlockedPairsPanel players={players} setPlayers={setPlayers} showToast={showToast} onLoadPlayers={loadPlayers} />

      {/* ═══ TOAST ═══ */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-xl text-sm font-bold shadow-xl ${
              toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
            }`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🚫 لوحة القيود المخصصة والذكية للاعبين
// ══════════════════════════════════════════════════════

function BlockedPairsPanel({ players, setPlayers, showToast, onLoadPlayers }: { players: any[]; setPlayers: React.Dispatch<React.SetStateAction<any[]>>; showToast: (msg: string, type: 'success' | 'error') => void; onLoadPlayers: (background?: boolean) => void }) {
  const [pairs, setPairs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [updatingGenderId, setUpdatingGenderId] = useState<number | null>(null);

  // ── إضافة لاعب جديد لتهيئة قيوده ──
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalDropdownOpen, setGlobalDropdownOpen] = useState(false);
  const [manuallySelectedPlayerIds, setManuallySelectedPlayerIds] = useState<number[]>([]);

  // ── إضافة أزواج ممنوعة لكل كارد ──
  const [partnerSearchMap, setPartnerSearchMap] = useState<Record<number, string>>({});
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);

  useEffect(() => {
    loadPairs();
  }, []);

  // إغلاق الـ dropdowns عند الضغط خارجها
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setGlobalDropdownOpen(false);
        setOpenDropdownId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function loadPairs() {
    setLoading(true);
    try {
      const data = await apiFetch('/api/seating/blocked-pairs');
      setPairs(data.pairs || []);
    } catch (err: any) {
      console.warn('Failed to load blocked pairs:', err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── تحديث قيد الجنس ──
  async function handleUpdateGenderConstraint(playerId: number, value: string) {
    setUpdatingGenderId(playerId);
    // تحديث الحالة المحلية فوراً لتفادي وميض أو إعادة تحميل الصفحة
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, genderConstraint: value } : p));
    try {
      await apiFetch(`/api/player/${playerId}/profile`, {
        method: 'PUT',
        body: JSON.stringify({ genderConstraint: value }),
      });
      showToast('تم تحديث شرط الجنس للاعب بنجاح', 'success');
      onLoadPlayers(true); // تحديث صامت في الخلفية للمزامنة
    } catch (err: any) {
      showToast(err.message || 'فشل التحديث', 'error');
      onLoadPlayers(true); // تراجع صامت
    } finally {
      setUpdatingGenderId(null);
    }
  }

  // ── إضافة قيد زوج ممنوع للاعب ──
  async function handleAddPartner(player1Id: number, player2Id: number) {
    try {
      await apiFetch('/api/seating/blocked-pairs', {
        method: 'POST',
        body: JSON.stringify({ player1Id, player2Id, reason: 'قيد مخصص للجلوس متجاورين' }),
      });
      showToast('تم إضافة القيد بنجاح', 'success');
      setPartnerSearchMap(prev => ({ ...prev, [player1Id]: '' }));
      setOpenDropdownId(null);
      loadPairs();
    } catch (err: any) {
      showToast(err.message || 'فشل الإضافة', 'error');
    }
  }

  // ── حذف قيد زوج ممنوع ──
  async function handleDeletePair(pairId: number) {
    if (!confirm('هل تريد إزالة هذا القيد؟')) return;
    try {
      await apiFetch(`/api/seating/blocked-pairs/${pairId}`, { method: 'DELETE' });
      setPairs(prev => prev.filter(p => p.id !== pairId));
      showToast('تم إزالة قيد المجاورة', 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل الحذف', 'error');
    }
  }

  // ── إزالة كل القيود للاعب ──
  async function handleRemoveAllConstraints(playerId: number) {
    if (!confirm('⚠️ هل تريد إزالة كافة قيود الجوار والجنس لهذا اللاعب؟')) return;
    try {
      // 1. إزالة قيد الجنس
      await apiFetch(`/api/player/${playerId}/profile`, {
        method: 'PUT',
        body: JSON.stringify({ genderConstraint: 'NONE' }),
      });

      // 2. إزالة كل الأزواج المرتبطة به
      const relatedPairs = pairs.filter(p => p.player1_id === playerId || p.player2_id === playerId);
      for (const pair of relatedPairs) {
        await apiFetch(`/api/seating/blocked-pairs/${pair.id}`, { method: 'DELETE' });
      }

      showToast('تم تنظيف كافة قيود اللاعب', 'success');
      setManuallySelectedPlayerIds(prev => prev.filter(id => id !== playerId));
      setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, genderConstraint: 'NONE' } : p));
      onLoadPlayers(true); // تحديث صامت في الخلفية
      loadPairs();
    } catch (err: any) {
      showToast(err.message || 'فشل تنظيف القيود', 'error');
    }
  }

  // ── فلترة اللاعبين ──
  function filterPlayers(query: string, excludeId?: number) {
    const q = query.toLowerCase().trim();
    return players
      .filter(p => {
        if (excludeId && p.id === excludeId) return false;
        if (!q) return true;
        return p.name?.toLowerCase().includes(q) || p.phone?.includes(q);
      })
      .slice(0, 8);
  }

  // ── تجميع البيانات للاعبين الحاصلين على قيود ──
  const playerConstraintsMap = new Map<number, {
    player: any;
    blockedPartners: any[];
    genderConstraint: string;
  }>();

  // إضافة من لديه قيد جنس
  players.forEach(p => {
    if (p.genderConstraint && p.genderConstraint !== 'NONE') {
      playerConstraintsMap.set(p.id, {
        player: p,
        blockedPartners: [],
        genderConstraint: p.genderConstraint,
      });
    }
  });

  // إضافة من لديه أزواج ممنوعة
  pairs.forEach(pair => {
    const p1 = players.find(p => p.id === pair.player1_id) || { id: pair.player1_id, name: pair.player1_name, phone: pair.player1_phone, gender: 'MALE', genderConstraint: 'NONE' };
    const p2 = players.find(p => p.id === pair.player2_id) || { id: pair.player2_id, name: pair.player2_name, phone: pair.player2_phone, gender: 'MALE', genderConstraint: 'NONE' };

    // Player 1
    if (!playerConstraintsMap.has(pair.player1_id)) {
      playerConstraintsMap.set(pair.player1_id, {
        player: p1,
        blockedPartners: [],
        genderConstraint: p1.genderConstraint || 'NONE',
      });
    }
    playerConstraintsMap.get(pair.player1_id)!.blockedPartners.push({
      pairId: pair.id,
      partnerId: pair.player2_id,
      partnerName: p2.name,
      partnerPhone: p2.phone,
    });

    // Player 2
    if (!playerConstraintsMap.has(pair.player2_id)) {
      playerConstraintsMap.set(pair.player2_id, {
        player: p2,
        blockedPartners: [],
        genderConstraint: p2.genderConstraint || 'NONE',
      });
    }
    playerConstraintsMap.get(pair.player2_id)!.blockedPartners.push({
      pairId: pair.id,
      partnerId: pair.player1_id,
      partnerName: p1.name,
      partnerPhone: p1.phone,
    });
  });

  // إضافة اللاعبين الذين تم اختيارهم يدوياً لبدء التعديل
  manuallySelectedPlayerIds.forEach(id => {
    if (!playerConstraintsMap.has(id)) {
      const p = players.find(x => x.id === id);
      if (p) {
        playerConstraintsMap.set(id, {
          player: p,
          blockedPartners: [],
          genderConstraint: p.genderConstraint || 'NONE',
        });
      }
    }
  });

  const constrainedPlayers = Array.from(playerConstraintsMap.values());

  return (
    <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl overflow-hidden">
      {/* ── Header ── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-700/10 transition"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center text-lg shrink-0">
            🚫
          </div>
          <div className="text-right">
            <h2 className="text-sm font-bold text-white">إدارة قيود اللاعبين (الجلوس الذكي)</h2>
            <p className="text-[10px] text-gray-500">
              تحديد قيود الجنس الفردية واللاعبين الممنوع مجاورتهم لـ {constrainedPlayers.length} لاعب
            </p>
          </div>
        </div>
        <span className={`text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {/* ── Content ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4 border-t border-gray-700/20 pt-4">

              {/* ── اختيار لاعب جديد لتهيئة قيوده ── */}
              <div className={`bg-gray-900/40 border border-gray-700/20 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3 relative ${
                globalDropdownOpen ? 'z-40' : 'z-20'
              }`}>
                <div className="flex-1">
                  <p className="text-xs font-bold text-gray-400">➕ تهيئة قيود مخصصة للاعب جديد</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">ابحث عن لاعب لفتحه في لوحة التحكم وتعديل شروطه الخاصة</p>
                </div>

                <div className="relative dropdown-container md:w-80 w-full">
                  <input
                    type="text"
                    value={globalSearch}
                    onChange={e => { setGlobalSearch(e.target.value); setGlobalDropdownOpen(true); }}
                    onFocus={() => setGlobalDropdownOpen(true)}
                    placeholder="ابحث عن لاعب باسمه أو هاتفه..."
                    className="w-full px-3 py-2 bg-gray-800/60 border border-gray-600/40 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600"
                  />
                  {globalDropdownOpen && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700/50 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                      {filterPlayers(globalSearch).length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-600">لا توجد نتائج</p>
                      ) : filterPlayers(globalSearch).map(p => (
                        <button
                          key={p.id}
                          onClick={() => {
                            if (!manuallySelectedPlayerIds.includes(p.id)) {
                              setManuallySelectedPlayerIds(prev => [...prev, p.id]);
                            }
                            setGlobalSearch('');
                            setGlobalDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-800/60 transition text-right"
                        >
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                            {p.name?.[0] || '?'}
                          </div>
                          <span className="text-sm text-white truncate flex-1">{p.name}</span>
                          <span className="text-[10px] text-gray-500 font-mono" dir="ltr">{p.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── لوحة الكروت الذكية ── */}
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
                </div>
              ) : constrainedPlayers.length === 0 ? (
                <div className="text-center py-12 bg-gray-950/20 border border-dashed border-gray-800 rounded-xl">
                  <span className="text-4xl block mb-2 opacity-20">🪑</span>
                  <p className="text-gray-500 text-sm">لا توجد قيود مخصصة لأي لاعب حتى الآن</p>
                  <p className="text-[10px] text-gray-700 mt-1">ابدأ بالبحث عن لاعب أعلاه لتعيين قيود مخصصة له</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {constrainedPlayers.map(({ player, blockedPartners, genderConstraint }) => (
                    <motion.div
                      key={player.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`bg-gray-900/60 border border-gray-700/40 backdrop-blur-sm rounded-2xl p-4 space-y-4 flex flex-col justify-between relative ${
                        openDropdownId === player.id ? 'z-30' : 'z-10'
                      }`}
                    >
                      {/* Player Header */}
                      <div className="flex items-center justify-between pb-2 border-b border-gray-800/60">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-white font-bold text-base overflow-hidden shrink-0">
                            {player.avatarUrl ? (
                              <img src={`${API_URL}${player.avatarUrl}`} alt="" className="w-full h-full object-cover" />
                            ) : (
                              player.name?.[0] || '👤'
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-white text-xs truncate">{player.name}</h3>
                            <p className="text-[9px] text-gray-500 font-mono truncate" dir="ltr">
                              {player.phone} • {player.gender === 'FEMALE' ? 'أنثى' : 'ذكر'}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveAllConstraints(player.id)}
                          className="text-[10px] text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 px-2 py-1 rounded-lg transition shrink-0 font-bold"
                          title="مسح كافة شروط هذا اللاعب"
                        >
                          🗑️ إزالة
                        </button>
                      </div>

                      {/* 1. Gender Constraint Selector */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-gray-400 block font-bold">🚺🚹 شرط الجوار مع الجنس:</label>
                        <div className="flex gap-1 bg-gray-950/40 p-0.5 rounded-lg border border-gray-800/60">
                          {[
                            { value: 'NONE', label: 'لا قيود' },
                            { value: 'FORBID_SAME', label: 'ممنوع نفس الجنس' },
                            { value: 'FORBID_OPPOSITE', label: 'ممنوع جنس آخر' },
                          ].map(opt => {
                            const active = genderConstraint === opt.value;
                            return (
                              <button
                                key={opt.value}
                                disabled={updatingGenderId === player.id}
                                onClick={() => handleUpdateGenderConstraint(player.id, opt.value)}
                                className={`flex-1 py-1.5 px-1 rounded-md text-[9px] font-black transition ${
                                  active
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    : 'text-gray-500 hover:text-gray-300'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 2. Forbidden Partners list */}
                      <div className="space-y-1.5 flex-1 flex flex-col justify-start">
                        <label className="text-[10px] text-gray-400 block font-bold">🚫 أزواج ممنوعة ({blockedPartners.length}):</label>
                        {blockedPartners.length === 0 ? (
                          <p className="text-[9px] text-gray-600 italic">لا توجد أزواج ممنوعة</p>
                        ) : (
                          <div className="space-y-1 max-h-24 overflow-y-auto">
                            {blockedPartners.map((bp: any) => (
                              <div key={bp.pairId} className="flex items-center justify-between bg-gray-950/30 border border-gray-800/40 rounded-lg px-2 py-1 group/partner hover:border-rose-500/20 transition">
                                <span className="text-[10px] text-gray-300 font-bold truncate flex-1">{bp.partnerName}</span>
                                <span className="text-[9px] text-gray-600 font-mono mx-2" dir="ltr">{bp.partnerPhone}</span>
                                <button
                                  onClick={() => handleDeletePair(bp.pairId)}
                                  className="text-gray-600 hover:text-rose-400 text-xs transition shrink-0"
                                  title="حذف هذا القيد"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 3. Add Forbidden Partner Dropdown */}
                      <div className="relative dropdown-container pt-2 border-t border-gray-800/40">
                        <input
                          type="text"
                          placeholder="🔍 منع الجلوس بجانب لاعب..."
                          value={partnerSearchMap[player.id] || ''}
                          onChange={e => {
                            setPartnerSearchMap(prev => ({ ...prev, [player.id]: e.target.value }));
                            setOpenDropdownId(player.id);
                          }}
                          onFocus={() => setOpenDropdownId(player.id)}
                          className="w-full px-2.5 py-1.5 bg-gray-950/50 border border-gray-800/80 rounded-lg text-[10px] text-white placeholder-gray-700 focus:outline-none focus:border-amber-500/30"
                        />
                        {openDropdownId === player.id && (
                          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-950 border border-gray-800 rounded-lg shadow-2xl max-h-32 overflow-y-auto">
                            {filterPlayers(partnerSearchMap[player.id] || '', player.id)
                              .filter(p => !blockedPartners.some((bp: any) => bp.partnerId === p.id))
                              .length === 0 ? (
                                <p className="px-3 py-1.5 text-[10px] text-gray-600">لا توجد نتائج</p>
                              ) : filterPlayers(partnerSearchMap[player.id] || '', player.id)
                                .filter(p => !blockedPartners.some((bp: any) => bp.partnerId === p.id))
                                .map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => handleAddPartner(player.id, p.id)}
                                    className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-gray-800/40 transition text-right"
                                  >
                                    <span className="text-[10px] text-white font-bold">{p.name}</span>
                                    <span className="text-[9px] text-gray-500 font-mono" dir="ltr">{p.phone}</span>
                                  </button>
                                ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* ── ملاحظة ── */}
              <div className="bg-gray-900/30 border border-gray-700/20 rounded-xl p-3">
                <p className="text-[10px] text-gray-600 text-center">
                  💡 هذه القيود مخصصة لكل لاعب وتُطبق تلقائياً على كل الأنشطة والألعاب لتنظيم الجلوس وحل التنازعات
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
