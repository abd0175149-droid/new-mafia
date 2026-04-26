'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('token') : null;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) throw new Error('API error');
  return res.json();
}

// ── أنواع البيانات ──

interface Session {
  id: number;
  sessionCode: string;
  displayPin: string;
  sessionName: string;
  maxPlayers: number;
  isActive: boolean;
  status: 'active' | 'closed' | 'deleted';
  activityId: number | null;
  createdAt: string;
  matchCount: number;
  finishedMatchCount: number;
  playerCount: number;
  lastMatchAt: string | null;
  lastWinner: string | null;
  totalDuration: number;
}

interface Match {
  id: number;
  gameName: string;
  roomCode: string;
  playerCount: number;
  winner: string | null;
  totalRounds: number;
  durationSeconds: number | null;
  createdAt: string;
  endedAt: string | null;
}

interface MatchDetail extends Match {
  durationFormatted: string;
  players: {
    physicalId: number;
    playerName: string;
    role: string;
    team: string;
    survivedToEnd: boolean;
  }[];
}

type StatusFilter = 'all' | 'active' | 'closed' | 'deleted';
type ActivityFilter = 'all' | 'linked' | 'standalone';

export default function GameHistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  // فلاتر
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');

  // حالة التوسيع
  const [expandedSession, setExpandedSession] = useState<number | null>(null);
  const [sessionMatches, setSessionMatches] = useState<Record<number, Match[]>>({});
  const [matchesLoading, setMatchesLoading] = useState<number | null>(null);

  // حالة Modal
  const [selectedMatch, setSelectedMatch] = useState<MatchDetail | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      const data = await apiFetch('/api/leader/sessions');
      setSessions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleSession(sessionId: number) {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
      return;
    }
    setExpandedSession(sessionId);
    if (!sessionMatches[sessionId]) {
      setMatchesLoading(sessionId);
      try {
        const matches = await apiFetch(`/api/leader/sessions/${sessionId}/matches`);
        setSessionMatches(prev => ({ ...prev, [sessionId]: matches }));
      } catch { /* ignore */ }
      setMatchesLoading(null);
    }
  }

  async function viewMatch(matchId: number) {
    try {
      const detail = await apiFetch(`/api/leader/match/${matchId}`);
      setSelectedMatch(detail);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeleteSession(sessionId: number, e: React.MouseEvent) {
    e.stopPropagation(); // منع فتح الكارد
    if (!confirm('⚠️ هل تريد حذف هذه الغرفة نهائياً؟ سيتم حذف جميع بياناتها.')) return;
    try {
      await apiFetch(`/api/leader/sessions/${sessionId}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (expandedSession === sessionId) setExpandedSession(null);
    } catch (err: any) {
      alert('فشل الحذف: ' + (err.message || 'خطأ غير متوقع'));
    }
  }

  function formatDuration(seconds: number | null | undefined): string {
    if (!seconds) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('ar-JO', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  // ── الفلترة ──
  const filteredSessions = sessions.filter(s => {
    // فلتر الحالة
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    // فلتر الربط بنشاط
    if (activityFilter === 'linked' && !s.activityId) return false;
    if (activityFilter === 'standalone' && s.activityId) return false;
    return true;
  });

  const statusCounts = {
    all: sessions.length,
    active: sessions.filter(s => s.status === 'active').length,
    closed: sessions.filter(s => s.status === 'closed').length,
    deleted: sessions.filter(s => s.status === 'deleted').length,
  };

  const activityCounts = {
    all: sessions.length,
    linked: sessions.filter(s => s.activityId).length,
    standalone: sessions.filter(s => !s.activityId).length,
  };

  // ── بيانات الفلاتر ──
  const statusOptions: { key: StatusFilter; label: string; icon: string; color: string }[] = [
    { key: 'all', label: 'الكل', icon: '📋', color: '' },
    { key: 'active', label: 'نشطة', icon: '🟢', color: 'text-emerald-400' },
    { key: 'closed', label: 'مغلقة', icon: '🔴', color: 'text-red-400' },
    { key: 'deleted', label: 'محذوفة', icon: '🗑️', color: 'text-gray-500' },
  ];

  const activityOptions: { key: ActivityFilter; label: string; icon: string }[] = [
    { key: 'all', label: 'الكل', icon: '📋' },
    { key: 'linked', label: 'مرتبطة بنشاط', icon: '🔗' },
    { key: 'standalone', label: 'مستقلة', icon: '📌' },
  ];

  // ── ألوان الحالة ──
  function getStatusStyle(status: string) {
    switch (status) {
      case 'active': return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: '🟢', label: 'نشطة' };
      case 'closed': return { bg: 'bg-red-500/20', text: 'text-red-400', icon: '🔴', label: 'مغلقة' };
      case 'deleted': return { bg: 'bg-gray-700/50', text: 'text-gray-500', icon: '🗑️', label: 'محذوفة' };
      default: return { bg: 'bg-gray-700/50', text: 'text-gray-400', icon: '❓', label: status };
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── الهيدر ── */}
      <div>
        <h1 className="text-3xl font-bold text-white">🎮 سجل الألعاب</h1>
        <p className="text-gray-400 mt-1">كل الغرف والمباريات في مكان واحد</p>
      </div>

      {/* ── الفلاتر ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* فلتر الحالة */}
        <div className="flex-1">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">حالة الغرفة</label>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="w-full appearance-none bg-gray-800/60 border border-gray-700/40 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/40 transition-colors cursor-pointer"
            >
              {statusOptions.map(opt => (
                <option key={opt.key} value={opt.key}>
                  {opt.icon} {opt.label} ({statusCounts[opt.key]})
                </option>
              ))}
            </select>
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs pointer-events-none">▼</span>
          </div>
        </div>

        {/* فلتر الربط بنشاط */}
        <div className="flex-1">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">الربط بنشاط</label>
          <div className="relative">
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value as ActivityFilter)}
              className="w-full appearance-none bg-gray-800/60 border border-gray-700/40 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/40 transition-colors cursor-pointer"
            >
              {activityOptions.map(opt => (
                <option key={opt.key} value={opt.key}>
                  {opt.icon} {opt.label} ({activityCounts[opt.key]})
                </option>
              ))}
            </select>
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs pointer-events-none">▼</span>
          </div>
        </div>
      </div>

      {/* ── عدد النتائج ── */}
      <p className="text-xs text-gray-600">
        عرض {filteredSessions.length} من {sessions.length} غرفة
      </p>

      {/* ── قائمة الغرف ── */}
      <div className="space-y-3">
        {filteredSessions.length === 0 ? (
          <div className="text-center py-16 text-gray-500">لا توجد غرف تطابق الفلتر</div>
        ) : (
          filteredSessions.map((session, i) => {
            const st = getStatusStyle(session.status);
            return (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                {/* ── كارت الغرفة ── */}
                <div
                  onClick={() => toggleSession(session.id)}
                  className={`rounded-xl p-4 cursor-pointer transition-all border group ${
                    expandedSession === session.id
                      ? 'bg-gray-800/70 border-amber-500/30'
                      : 'bg-gray-800/50 border-gray-700/40 hover:border-gray-600/50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* أيقونة الحالة */}
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shadow-lg ${st.bg}`}>
                      {st.icon}
                    </div>

                    {/* معلومات الغرفة */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-white text-sm">{session.sessionName}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${st.bg} ${st.text}`}>
                          {st.label}
                        </span>
                        {session.activityId && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400">
                            🔗 نشاط
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        كود: {session.sessionCode}
                        {' • '}{session.playerCount}/{session.maxPlayers} لاعب
                        {' • '}{session.matchCount} مباراة
                        {session.totalDuration > 0 && ` • ${formatDuration(session.totalDuration)}`}
                      </p>
                      <p className="text-[10px] text-gray-600 mt-0.5">
                        {formatDate(session.createdAt)}
                      </p>
                    </div>

                    {/* آخر نتيجة */}
                    {session.lastWinner && (
                      <span className={`text-xs px-2 py-1 rounded-full hidden sm:inline-block ${
                        session.lastWinner === 'MAFIA'
                          ? 'bg-rose-500/10 text-rose-400'
                          : 'bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {session.lastWinner === 'MAFIA' ? '🔴' : '🟢'} آخر فوز
                      </span>
                    )}

                    {/* سهم التوسيع + زر الحذف */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleDeleteSession(session.id, e)}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition opacity-0 group-hover:opacity-100"
                        title="حذف الغرفة نهائياً"
                      >
                        🗑️ حذف
                      </button>
                      <motion.span
                        animate={{ rotate: expandedSession === session.id ? 180 : 0 }}
                        className="text-gray-500 text-sm"
                      >
                        ▼
                      </motion.span>
                    </div>
                  </div>
                </div>

                {/* ── المباريات (Dropdown) ── */}
                <AnimatePresence>
                  {expandedSession === session.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mr-6 mt-1 border-r-2 border-gray-700/50 pr-4 space-y-2 py-2">
                        {matchesLoading === session.id ? (
                          <div className="flex items-center gap-2 py-4 justify-center">
                            <div className="animate-spin h-4 w-4 border-2 border-amber-500 border-t-transparent rounded-full" />
                            <span className="text-xs text-gray-500">جاري التحميل...</span>
                          </div>
                        ) : (sessionMatches[session.id] || []).length === 0 ? (
                          <p className="text-xs text-gray-600 py-3 text-center">لا توجد مباريات في هذه الغرفة</p>
                        ) : (
                          (sessionMatches[session.id] || []).map((match, mi) => (
                            <motion.div
                              key={match.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: mi * 0.05 }}
                              onClick={() => viewMatch(match.id)}
                              className="bg-gray-800/30 border border-gray-700/30 rounded-lg p-3 flex items-center gap-3 hover:border-amber-500/20 cursor-pointer transition-all group"
                            >
                              <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm ${
                                match.winner === 'MAFIA' ? 'bg-rose-500/15 text-rose-400' :
                                match.winner === 'CITIZEN' ? 'bg-emerald-500/15 text-emerald-400' :
                                'bg-amber-500/15 text-amber-400'
                              }`}>
                                {match.winner === 'MAFIA' ? '🔴' : match.winner === 'CITIZEN' ? '🟢' : '⏳'}
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white group-hover:text-amber-400 transition">
                                  {match.gameName}
                                </p>
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                  {match.playerCount} لاعب
                                  {' • '}{match.totalRounds} جولة
                                  {' • '}{formatDuration(match.durationSeconds)}
                                  {match.endedAt && ` • ${formatDate(match.endedAt)}`}
                                </p>
                              </div>

                              <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                                match.winner === 'MAFIA' ? 'bg-rose-500/10 text-rose-400' :
                                match.winner === 'CITIZEN' ? 'bg-emerald-500/10 text-emerald-400' :
                                'bg-amber-500/10 text-amber-400'
                              }`}>
                                {match.winner === 'MAFIA' ? 'مافيا' : match.winner === 'CITIZEN' ? 'مواطنين' : 'جارية'}
                              </span>
                            </motion.div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </div>

      {/* ── Modal تفاصيل المباراة ── */}
      <AnimatePresence>
        {selectedMatch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedMatch(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">{selectedMatch.gameName}</h3>
                <button onClick={() => setSelectedMatch(null)} className="text-gray-500 hover:text-white text-lg">✕</button>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { value: selectedMatch.playerCount, label: 'لاعب' },
                  { value: selectedMatch.totalRounds, label: 'جولة' },
                  { value: selectedMatch.durationFormatted, label: 'المدة' },
                ].map((s, i) => (
                  <div key={i} className="bg-gray-800/50 rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-white">{s.value}</p>
                    <p className="text-xs text-gray-500">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className={`rounded-xl p-3 mb-4 text-center font-bold ${
                selectedMatch.winner === 'MAFIA' ? 'bg-rose-500/10 text-rose-400'
                  : selectedMatch.winner === 'CITIZEN' ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-gray-700/30 text-gray-400'
              }`}>
                {selectedMatch.winner === 'MAFIA' ? '🔴 فازت المافيا'
                  : selectedMatch.winner === 'CITIZEN' ? '🟢 فاز المواطنون'
                  : '⏳ بدون نتيجة'}
              </div>

              <div className="flex justify-between text-[10px] text-gray-600 mb-3 px-1">
                <span>بدأت: {formatDate(selectedMatch.createdAt)}</span>
                {selectedMatch.endedAt && <span>انتهت: {formatDate(selectedMatch.endedAt)}</span>}
              </div>

              <h4 className="text-sm font-bold text-gray-300 mb-2">اللاعبون</h4>
              <div className="space-y-1.5">
                {selectedMatch.players.map((p) => (
                  <div key={p.physicalId} className="flex items-center gap-3 p-2.5 bg-gray-800/30 rounded-lg">
                    <span className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-white">
                      {p.physicalId}
                    </span>
                    <span className="flex-1 text-sm text-white">{p.playerName}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      p.team === 'MAFIA' ? 'bg-rose-500/10 text-rose-400' : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {p.role}
                    </span>
                    {!p.survivedToEnd && <span className="text-xs text-gray-600">💀</span>}
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
