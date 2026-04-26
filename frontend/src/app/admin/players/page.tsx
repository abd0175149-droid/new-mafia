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
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // ── Load Players ──
  async function loadPlayers() {
    setLoading(true);
    try {
      const data = await apiFetch('/api/player/all');
      setPlayers(data.players || []);
    } catch (err: any) {
      showToast(err.message || 'خطأ في جلب اللاعبين', 'error');
    } finally {
      setLoading(false);
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

  // ── Filtered Players ──
  const filtered = players.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name?.toLowerCase().includes(q) || p.phone?.includes(q);
  });

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
            onChange={e => setSearch(e.target.value)}
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
                {filtered.map(p => {
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
                        {p.mustChangePassword ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20">افتراضي</span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">مفعّل</span>
                        )}
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
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>



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
