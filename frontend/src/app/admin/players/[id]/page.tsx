'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

const ROLE_LABELS: Record<string, string> = {
  GODFATHER: 'الأب الروحي', SILENCER: 'المُسكِت', CHAMELEON: 'الحرباء', MAFIA_REGULAR: 'مافيا عادي',
  CITIZEN: 'مواطن', SHERIFF: 'المحقق', DOCTOR: 'الطبيب', BODYGUARD: 'الحارس', SNIPER: 'القناص',
  SURVIVOR: 'الناجي', JOURNALIST: 'الصحفي',
};

const RANK_MAP: Record<string, { label: string; icon: string; color: string }> = {
  INFORMANT:  { label: 'المُخبر',       icon: '⭐',  color: 'text-gray-400' },
  ASSOCIATE:  { label: 'المُشارك',      icon: '⭐⭐', color: 'text-blue-400' },
  SOLDIER:    { label: 'الجندي',        icon: '⭐⭐⭐', color: 'text-emerald-400' },
  CAPO:       { label: 'الكابو',        icon: '🌟',  color: 'text-amber-400' },
  UNDERBOSS:  { label: 'نائب الزعيم',   icon: '🌟🌟', color: 'text-orange-400' },
  GODFATHER:  { label: 'الأب الروحي',   icon: '👑',  color: 'text-rose-400' },
};

function fmtDate(d: any) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ar-JO', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function PlayerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const playerId = parseInt(params.id as string);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGender, setEditGender] = useState('MALE');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    if (!playerId) return;
    (async () => {
      try {
        const result = await apiFetch(`/api/player/${playerId}/profile`);
        setData(result);
      } catch (err: any) {
        setError('فشل جلب بيانات اللاعب');
      } finally {
        setLoading(false);
      }
    })();
  }, [playerId]);

  // ── Start editing ──
  function startEdit() {
    if (!data?.player) return;
    setEditName(data.player.name || '');
    setEditGender(data.player.gender || 'MALE');
    setEditEmail(data.player.email || '');
    setEditing(true);
  }

  // ── Save profile ──
  async function handleSave() {
    setSaving(true);
    try {
      const result = await apiFetch(`/api/player/${playerId}/profile`, {
        method: 'PUT',
        body: JSON.stringify({ name: editName, gender: editGender, email: editEmail }),
      });
      // Update local data
      setData((prev: any) => ({
        ...prev,
        player: { ...prev.player, name: editName, gender: editGender, email: editEmail },
      }));
      setEditing(false);
      showToast('تم حفظ التعديلات', 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Delete player ──
  async function handleDelete() {
    if (!confirm(`⚠️ هل تريد حذف اللاعب "${data?.player?.name}" نهائياً؟\nلن يمكن استرجاع الحساب.`)) return;
    try {
      await apiFetch(`/api/player/${playerId}`, { method: 'DELETE' });
      showToast('تم حذف اللاعب', 'success');
      setTimeout(() => router.push('/admin/players'), 500);
    } catch (err: any) {
      showToast(err.message || 'فشل الحذف', 'error');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !data?.player) {
    return (
      <div className="text-center py-20">
        <p className="text-rose-400 mb-4">{error || 'اللاعب غير موجود'}</p>
        <button onClick={() => router.back()} className="text-amber-400 text-sm hover:underline">← رجوع</button>
      </div>
    );
  }

  const p = data.player;
  const s = data.stats || {};
  const prog = data.progression || {};
  const rank = RANK_MAP[prog.rankTier] || RANK_MAP.INFORMANT;
  const winRate = s.totalMatches > 0 ? Math.round((s.totalWins / s.totalMatches) * 100) : 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto" dir="rtl">
      {/* ── زر الرجوع ── */}
      <button
        onClick={() => router.back()}
        className="text-gray-500 hover:text-white text-sm transition flex items-center gap-1"
      >
        ← رجوع للقائمة
      </button>

      {/* ═══ HEADER CARD ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-6 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
        
        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-white text-3xl font-bold overflow-hidden shrink-0 shadow-lg">
            {p.avatarUrl ? (
              <Image src={`${API_URL}${p.avatarUrl}`} alt="" width={80} height={80} className="w-full h-full object-cover" />
            ) : (
              p.name?.[0] || '👤'
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1 className="text-2xl font-black text-white">{p.name}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-sm text-gray-400 font-mono" dir="ltr">{p.phone}</span>
              {p.email && <span className="text-xs text-gray-500">• {p.email}</span>}
              <span className="text-xs text-gray-500">• {p.gender === 'FEMALE' ? 'أنثى' : 'ذكر'}</span>
              <span className="text-xs text-gray-600">• #{p.id}</span>
            </div>
            <p className="text-[10px] text-gray-600 mt-1">انضم: {fmtDate(p.createdAt)}</p>
          </div>

          {/* Level + Rank */}
          <div className="text-center shrink-0">
            <div className={`text-2xl font-black ${rank.color}`}>{rank.icon}</div>
            <p className={`text-sm font-bold ${rank.color}`}>{rank.label}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">المستوى {prog.level || 1}</p>
            <div className="w-24 h-1.5 bg-gray-700 rounded-full mt-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all"
                style={{ width: `${prog.xpProgress || 0}%` }}
              />
            </div>
            <p className="text-[9px] text-gray-600 mt-0.5">{prog.xp || 0} / {prog.nextLevelXP || 500} XP</p>
          </div>
        </div>

        {/* ── Admin Actions ── */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-700/30">
          <button
            onClick={startEdit}
            className="text-xs px-4 py-2 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition flex items-center gap-1.5"
          >
            ✏️ تعديل البيانات
          </button>
          <button
            onClick={handleDelete}
            className="text-xs px-4 py-2 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition flex items-center gap-1.5"
          >
            🗑️ حذف اللاعب
          </button>
        </div>
      </motion.div>

      {/* ═══ EDIT MODAL ═══ */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setEditing(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 w-full max-w-md space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">✏️ تعديل بيانات اللاعب</h3>
                <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-white text-lg">✕</button>
              </div>

              {/* Name */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">الاسم</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30"
                />
              </div>

              {/* Gender */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">الجنس</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditGender('MALE')}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition border ${
                      editGender === 'MALE'
                        ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                        : 'border-gray-600/30 text-gray-500 hover:border-gray-500'
                    }`}
                  >
                    ♂ ذكر
                  </button>
                  <button
                    onClick={() => setEditGender('FEMALE')}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition border ${
                      editGender === 'FEMALE'
                        ? 'border-pink-500/50 bg-pink-500/10 text-pink-400'
                        : 'border-gray-600/30 text-gray-500 hover:border-gray-500'
                    }`}
                  >
                    ♀ أنثى
                  </button>
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">البريد الإلكتروني (اختياري)</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600"
                  dir="ltr"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !editName.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 transition disabled:opacity-40"
                >
                  {saving ? '⏳ جاري الحفظ...' : '💾 حفظ'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-6 py-2.5 rounded-xl border border-gray-600/40 text-gray-400 text-sm hover:text-white transition"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ STATS GRID ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'مباريات', value: s.totalMatches || 0, color: 'text-white', icon: '🎯' },
          { label: 'فوز', value: s.totalWins || 0, color: 'text-emerald-400', icon: '🏆' },
          { label: 'نسبة الفوز', value: `${winRate}%`, color: 'text-amber-400', icon: '📊' },
          { label: 'نجاة', value: `${s.survivalRate || 0}%`, color: 'text-blue-400', icon: '🛡️' },
          { label: 'سلسلة فوز', value: s.longestWinStreak || 0, color: 'text-orange-400', icon: '🔥' },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-gray-800/30 border border-gray-700/30 rounded-xl p-4 text-center"
          >
            <span className="text-xl">{stat.icon}</span>
            <p className={`text-2xl font-black mt-1 ${stat.color}`}>{stat.value}</p>
            <p className="text-[10px] text-gray-500">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ═══ TEAM STATS ═══ */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800/30 border border-gray-700/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-3 h-3 rounded-full bg-rose-500" />
            <span className="text-sm font-bold text-rose-400">كـ مافيا</span>
          </div>
          <p className="text-xl font-black text-white">{s.mafiaGames || 0} <span className="text-xs text-gray-500 font-normal">مباراة</span></p>
          <p className="text-sm text-gray-400 mt-1">فوز: <span className="text-rose-400 font-bold">{s.mafiaWins || 0}</span> ({s.mafiaWinRate || 0}%)</p>
        </div>
        <div className="bg-gray-800/30 border border-gray-700/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-sm font-bold text-blue-400">كـ مواطن</span>
          </div>
          <p className="text-xl font-black text-white">{s.citizenGames || 0} <span className="text-xs text-gray-500 font-normal">مباراة</span></p>
          <p className="text-sm text-gray-400 mt-1">فوز: <span className="text-blue-400 font-bold">{s.citizenWins || 0}</span> ({s.citizenWinRate || 0}%)</p>
        </div>
      </div>

      {/* ═══ FAVORITE ROLE + RR ═══ */}
      <div className="flex gap-3 flex-wrap">
        {s.favoriteRole && (
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl px-5 py-3">
            <span className="text-[10px] text-gray-500 block">الدور المفضل</span>
            <p className="text-sm font-bold text-purple-400 mt-0.5">{ROLE_LABELS[s.favoriteRole] || s.favoriteRole}</p>
          </div>
        )}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-3">
          <span className="text-[10px] text-gray-500 block">نقاط التصنيف (RR)</span>
          <p className="text-sm font-bold text-amber-400 mt-0.5">{prog.rankRR || 0} RR</p>
        </div>
        {prog.totalDeals > 0 && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-5 py-3">
            <span className="text-[10px] text-gray-500 block">الصفقات</span>
            <p className="text-sm font-bold text-emerald-400 mt-0.5">
              {prog.successfulDeals}/{prog.totalDeals} ({prog.dealSuccessRate || 0}%)
            </p>
          </div>
        )}
      </div>

      {/* ═══ MATCH HISTORY ═══ */}
      {data.matchHistory?.length > 0 && (
        <div className="bg-gray-800/30 border border-gray-700/30 rounded-xl p-5">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">📜 سجل المباريات <span className="text-xs text-gray-500 font-normal">({data.matchHistory.length})</span></h3>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {data.matchHistory.slice(0, 30).map((m: any, i: number) => {
              const isMafia = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'].includes(m.role);
              const won = (isMafia && m.matchWinner === 'MAFIA') || (!isMafia && m.matchWinner === 'CITIZEN');
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="flex items-center justify-between bg-gray-900/30 rounded-lg px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${won ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    <span className="text-gray-300">{ROLE_LABELS[m.role] || m.role || '—'}</span>
                    <span className={`text-[10px] px-1.5 rounded ${isMafia ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>
                      {isMafia ? 'مافيا' : 'مواطن'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-500">
                    <span>{m.survived ? '✅ نجا' : '💀'}</span>
                    <span className={`font-bold ${won ? 'text-emerald-400' : 'text-rose-400'}`}>{won ? 'فوز' : 'خسارة'}</span>
                    <span className="font-mono text-gray-600">{fmtDate(m.matchDate)}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ ACTIVE GAME ═══ */}
      {data.activeGame && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <h3 className="text-sm font-bold text-emerald-400 mb-1">🟢 في لعبة نشطة الآن</h3>
          <p className="text-xs text-gray-400">
            {data.activeGame.gameName} — كود: <span className="text-amber-400 font-mono">{data.activeGame.roomCode}</span>
            {data.activeGame.role && <> — الدور: <span className="text-white">{ROLE_LABELS[data.activeGame.role] || data.activeGame.role}</span></>}
          </p>
        </div>
      )}

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
