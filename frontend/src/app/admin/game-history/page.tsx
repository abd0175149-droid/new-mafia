'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('token') : null;
}

async function apiFetch(path: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('API error');
  return res.json();
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

interface Session {
  id: number;
  sessionCode: string;
  sessionName: string;
  maxPlayers: number;
  createdAt: string;
  matchCount: number;
  lastMatchAt: string | null;
  lastWinner: string | null;
  totalDuration: number;
}

export default function GameHistoryPage() {
  const [tab, setTab] = useState<'matches' | 'sessions'>('matches');
  const [matches, setMatches] = useState<Match[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [m, s] = await Promise.all([
        apiFetch('/api/leader/history'),
        apiFetch('/api/leader/sessions'),
      ]);
      setMatches(m);
      setSessions(s);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function viewMatch(id: number) {
    try {
      const detail = await apiFetch(`/api/leader/match/${id}`);
      setSelectedMatch(detail);
    } catch (err) {
      console.error(err);
    }
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
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
      <div>
        <h1 className="text-3xl font-bold text-white">🎮 سجل الألعاب</h1>
        <p className="text-gray-400 mt-1">تاريخ جميع المباريات والغرف السابقة</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['matches', 'sessions'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                : 'text-gray-400 hover:text-white bg-gray-800/40 border border-gray-700/30'
            }`}
          >
            {t === 'matches' ? `🎲 المباريات (${matches.length})` : `🏠 الغرف (${sessions.length})`}
          </button>
        ))}
      </div>

      {/* Matches Tab */}
      {tab === 'matches' && (
        <div className="grid gap-3">
          {matches.length === 0 ? (
            <div className="text-center py-16 text-gray-500">لا توجد مباريات مسجلة بعد</div>
          ) : (
            matches.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => viewMatch(m.id)}
                className="bg-gray-800/50 border border-gray-700/40 rounded-xl p-4 flex items-center gap-4 hover:border-amber-500/30 cursor-pointer transition-all group"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shadow-lg ${
                  m.winner === 'MAFIA' ? 'bg-rose-500/20 text-rose-400' :
                  m.winner === 'CITIZEN' ? 'bg-emerald-500/20 text-emerald-400' :
                  'bg-gray-700/50 text-gray-400'
                }`}>
                  {m.winner === 'MAFIA' ? '🔴' : m.winner === 'CITIZEN' ? '🟢' : '⏸'}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-sm group-hover:text-amber-400 transition">{m.gameName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    كود: {m.roomCode} • {m.playerCount} لاعب • {m.totalRounds} جولة • {formatDuration(m.durationSeconds)}
                  </p>
                </div>

                <div className="text-left">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    m.winner === 'MAFIA' ? 'bg-rose-500/10 text-rose-400' :
                    m.winner === 'CITIZEN' ? 'bg-emerald-500/10 text-emerald-400' :
                    'bg-gray-700/30 text-gray-500'
                  }`}>
                    {m.winner === 'MAFIA' ? 'فوز المافيا' : m.winner === 'CITIZEN' ? 'فوز المواطنين' : 'بدون نتيجة'}
                  </span>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* Sessions Tab */}
      {tab === 'sessions' && (
        <div className="grid gap-3">
          {sessions.length === 0 ? (
            <div className="text-center py-16 text-gray-500">لا توجد غرف منتهية بعد</div>
          ) : (
            sessions.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-gray-800/50 border border-gray-700/40 rounded-xl p-4 flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-lg">
                  🏠
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-sm">{s.sessionName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    كود: {s.sessionCode} • {s.matchCount} مباراة • {formatDuration(s.totalDuration)}
                  </p>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* Match Detail Modal */}
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
                <button onClick={() => setSelectedMatch(null)} className="text-gray-500 hover:text-white">✕</button>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-white">{selectedMatch.playerCount}</p>
                  <p className="text-xs text-gray-500">لاعب</p>
                </div>
                <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-white">{selectedMatch.totalRounds}</p>
                  <p className="text-xs text-gray-500">جولة</p>
                </div>
                <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-white">{selectedMatch.durationFormatted}</p>
                  <p className="text-xs text-gray-500">المدة</p>
                </div>
              </div>

              <div className={`rounded-xl p-3 mb-4 text-center font-bold ${
                selectedMatch.winner === 'MAFIA' ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'
              }`}>
                {selectedMatch.winner === 'MAFIA' ? '🔴 فازت المافيا' : '🟢 فاز المواطنون'}
              </div>

              {/* Players */}
              <h4 className="text-sm font-bold text-gray-300 mb-2">اللاعبون</h4>
              <div className="space-y-2">
                {selectedMatch.players.map((p) => (
                  <div key={p.physicalId} className="flex items-center gap-3 p-2 bg-gray-800/30 rounded-lg">
                    <span className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-white">
                      {p.physicalId}
                    </span>
                    <span className="flex-1 text-sm text-white">{p.playerName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
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
