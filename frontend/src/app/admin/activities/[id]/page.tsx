'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import DriveFolderBrowser from '../../components/DriveFolderBrowser';
import EditActivityForm from '../../components/EditActivityForm';
import WhatsAppButton from '@/components/WhatsAppButton';
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

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  planned:   { label: 'مخطط له',   color: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  active:    { label: 'نشط حالياً', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  completed: { label: 'مكتمل',     color: 'bg-gray-500/15 text-gray-400 border-gray-500/20' },
  cancelled: { label: 'ملغي',      color: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
};

function safeDate(d: any) { return d ? new Date(d) : new Date(); }

// نتيجة المباراة للعرض — تدعم كل الفائزين (مافيا/مواطن/مهرج/سفّاح)؛ "جارية" فقط حين لا فائز
function matchResult(winner: string | null | undefined): { icon: string; label: string; iconCls: string; badgeCls: string } {
  switch (winner) {
    case 'MAFIA':    return { icon: '🔴', label: 'فازت المافيا',  iconCls: 'bg-rose-500/15 text-rose-400',    badgeCls: 'bg-rose-500/10 text-rose-400' };
    case 'CITIZEN':  return { icon: '🟢', label: 'فاز المواطنون', iconCls: 'bg-emerald-500/15 text-emerald-400', badgeCls: 'bg-emerald-500/10 text-emerald-400' };
    case 'JESTER':   return { icon: '🤡', label: 'فاز المهرج',    iconCls: 'bg-amber-500/15 text-amber-400',   badgeCls: 'bg-amber-500/10 text-amber-400' };
    case 'ASSASSIN': return { icon: '🔪', label: 'فاز السفّاح',    iconCls: 'bg-purple-500/15 text-purple-400', badgeCls: 'bg-purple-500/10 text-purple-400' };
    default:         return { icon: '⏳', label: 'جارية',         iconCls: 'bg-gray-500/15 text-gray-400',     badgeCls: 'bg-gray-500/10 text-gray-400' };
  }
}

// ── CSS Donut Chart ──
function DonutChart({ data, size = 140 }: { data: { name: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="flex items-center justify-center" style={{ width: size, height: size }}><span className="text-gray-600 text-3xl">📊</span></div>;

  let accumulated = 0;
  const gradientParts = data.map(d => {
    const start = (accumulated / total) * 100;
    accumulated += d.value;
    const end = (accumulated / total) * 100;
    return `${d.color} ${start}% ${end}%`;
  });

  return (
    <div
      className="rounded-full relative"
      style={{
        width: size, height: size,
        background: `conic-gradient(${gradientParts.join(', ')})`,
      }}
    >
      <div className="absolute inset-[25%] rounded-full bg-gray-900" />
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🎮 قسم الغرف المرتبطة بالنشاط (مع ملخص الألعاب)
// ══════════════════════════════════════════════════════
function RoomsSection({ activityId, activityName }: { activityId: number; activityName: string }) {
  const [rooms, setRooms] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [expandedRoom, setExpandedRoom] = useState<number | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);

  const [unbookedPlayers, setUnbookedPlayers] = useState<any[]>([]);
  const [showUnbooked, setShowUnbooked] = useState(false);
  const [loadingUnbooked, setLoadingUnbooked] = useState(false);

  const fetchRooms = async () => {
    try {
      const [roomsData, summaryData] = await Promise.all([
        apiFetch(`/api/activities/${activityId}/rooms`),
        apiFetch(`/api/activities/${activityId}/rooms-summary`).catch(() => ({ rooms: [] })),
      ]);
      setRooms(roomsData);
      setSummary(summaryData.rooms || []);
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRooms(); }, [activityId]);

  const fetchUnbooked = async () => {
    setLoadingUnbooked(true);
    setShowUnbooked(true);
    try {
      const res = await apiFetch(`/api/activities/${activityId}/unbooked-players`);
      setUnbookedPlayers(res.unbooked || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUnbooked(false);
    }
  };

  const [bookingInProgress, setBookingInProgress] = useState<number[] | 'all' | null>(null);

  const handleAutoBook = async (playersToBook: any[]) => {
    if (!(await swalConfirm(`⚠️ هل تريد إنشاء حجز تلقائي لـ ${playersToBook.length} لاعب؟`))) return;
    
    setBookingInProgress(playersToBook.length > 1 ? 'all' : [playersToBook[0].player_id || playersToBook[0].player_name]);
    try {
      await apiFetch(`/api/activities/${activityId}/auto-book`, {
        method: 'POST',
        body: JSON.stringify({ players: playersToBook })
      });
      alert('✅ تم التسجيل بنجاح!');
      fetchUnbooked(); // إعادة التحديث
    } catch (err: any) {
      alert('فشل التسجيل: ' + err.message);
    } finally {
      setBookingInProgress(null);
    }
  };

  const [showAddRoomForm, setShowAddRoomForm] = useState(false);
  const [newRoomMaxPenalties, setNewRoomMaxPenalties] = useState(3);
  const [newRoomPenaltyScope, setNewRoomPenaltyScope] = useState<'room' | 'game'>('room');

  const handleAddRoom = async () => {
    setAdding(true);
    try {
      const newRoom = await apiFetch(`/api/activities/${activityId}/add-room`, { 
        method: 'POST', 
        body: JSON.stringify({
          maxPenalties: newRoomMaxPenalties,
          penaltyScope: newRoomPenaltyScope,
        }),
      });
      // إضافة إعدادات العقوبات للكائن المحلي (لتمريرها لـ enterRoom)
      newRoom.maxPenalties = newRoomMaxPenalties;
      newRoom.penaltyScope = newRoomPenaltyScope;
      setRooms(prev => [newRoom, ...prev]);
      setShowAddRoomForm(false);
      fetchRooms();
    } catch (err: any) {
      alert('فشل إنشاء الغرفة: ' + err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteRoom = async (sessionId: number) => {
    if (!(await swalConfirm('⚠️ هل تريد حذف هذه الغرفة نهائياً؟'))) return;
    try {
      await apiFetch(`/api/activities/${activityId}/rooms/${sessionId}`, { method: 'DELETE' });
      setRooms(prev => prev.filter(r => r.id !== sessionId));
      setSummary(prev => prev.filter(r => r.id !== sessionId));
    } catch (err: any) {
      alert('فشل الحذف: ' + err.message);
    }
  };

  const handleCloseRoom = async (sessionId: number) => {
    if (!(await swalConfirm('🔒 انتهت الفعالية؟ سيتم إغلاق هذه الغرفة ولن تظهر للقائد بعد الآن.'))) return;
    try {
      await apiFetch(`/api/activities/${activityId}/rooms/${sessionId}/close`, { method: 'PATCH' });
      setRooms(prev => prev.map(r => r.id === sessionId ? { ...r, isActive: false, status: 'closed' } : r));
      setSummary(prev => prev.map(r => r.id === sessionId ? { ...r, isActive: false, status: 'closed' } : r));
    } catch (err: any) {
      alert('فشل الإغلاق: ' + err.message);
    }
  };

  const copyCode = (code: string, id: number) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const enterRoom = (room: any) => {
    sessionStorage.setItem('leader_room_entry', JSON.stringify({
      sessionCode: room.sessionCode,
      displayPin: room.displayPin,
      sessionName: room.sessionName,
      sessionId: room.id,
      activityId,
      maxPlayers: room.maxPlayers || 10,
      maxPenalties: room.maxPenalties || 3,
      penaltyScope: room.penaltyScope || 'room',
    }));
    window.open('/leader', '_blank');
  };

  const fmtDuration = (s: number) => s > 0 ? `${Math.floor(s / 60)}د ${s % 60}ث` : '—';
  const fmtDate = (d: string) => d ? new Date(d).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' }) : '—';

  // دمج بيانات الغرف مع الملخص
  const mergedRooms = rooms.map(r => ({
    ...r,
    ...(summary.find(s => s.id === r.id) || {}),
  }));

  return (
    <div className="space-y-4">
      {/* ── رأس القسم ── */}
      <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            🎮 غرف اللعبة
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-400">{rooms.length}</span>
          </h3>
          <div className="flex gap-2">
            <button
              onClick={fetchUnbooked}
              className="text-xs px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition"
            >
              ⚠️ حضروا بدون حجز
            </button>
            <button
              onClick={() => setShowAddRoomForm(!showAddRoomForm)}
              className="text-xs px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition"
            >
              {showAddRoomForm ? '✕ إلغاء' : '➕ إضافة غرفة'}
            </button>
          </div>
        </div>

        {/* نموذج إعدادات الغرفة الجديدة */}
        {showAddRoomForm && (
          <div className="bg-gray-900/60 border border-amber-500/20 rounded-xl p-4 space-y-3 mb-4">
            <p className="text-amber-400 text-xs font-bold text-center">⚖️ إعدادات العقوبات للغرفة الجديدة</p>
            
            {/* الحد الأقصى للعقوبات */}
            <div className="flex items-center justify-center gap-3">
              <span className="text-gray-400 text-xs">الحد الأقصى:</span>
              <button onClick={() => setNewRoomMaxPenalties(Math.max(1, newRoomMaxPenalties - 1))}
                className="w-7 h-7 bg-gray-800 border border-gray-600 rounded text-gray-300 hover:text-white hover:border-gray-500 transition text-sm">−</button>
              <span className="text-amber-400 font-bold text-lg font-mono w-6 text-center">{newRoomMaxPenalties}</span>
              <button onClick={() => setNewRoomMaxPenalties(Math.min(10, newRoomMaxPenalties + 1))}
                className="w-7 h-7 bg-gray-800 border border-gray-600 rounded text-gray-300 hover:text-white hover:border-gray-500 transition text-sm">+</button>
            </div>
            
            {/* نطاق العقوبات */}
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setNewRoomPenaltyScope('room')}
                className={`px-4 py-1.5 rounded-lg text-xs transition ${newRoomPenaltyScope === 'room' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}
              >كامل الغرفة</button>
              <button
                onClick={() => setNewRoomPenaltyScope('game')}
                className={`px-4 py-1.5 rounded-lg text-xs transition ${newRoomPenaltyScope === 'game' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}
              >كل لعبة</button>
            </div>
            <p className="text-gray-600 text-[10px] text-center">
              {newRoomPenaltyScope === 'game' ? 'العقوبات تُصفّر تلقائياً عند بدء لعبة جديدة' : 'العقوبات تستمر طوال جلسة الغرفة'}
            </p>
            
            {/* زر الإنشاء */}
            <button
              onClick={handleAddRoom}
              disabled={adding}
              className="w-full py-2 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-lg text-sm font-bold hover:bg-amber-500/30 transition disabled:opacity-50"
            >
              {adding ? '⏳ جارٍ الإنشاء...' : '✅ إنشاء الغرفة'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" />
          </div>
        ) : mergedRooms.length > 0 ? (
          <div className="space-y-3">
            {mergedRooms.map((room, i) => {
              const stats = room.stats || { totalMatches: 0, mafiaWins: 0, citizenWins: 0, totalDuration: 0 };
              const isExpanded = expandedRoom === room.id;
              return (
                <motion.div key={room.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="bg-gray-900/50 border border-gray-700/30 rounded-xl overflow-hidden"
                >
                  {/* ── معلومات الغرفة ── */}
                  <div className="flex items-center justify-between p-3.5">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-xl">🕹️</div>
                      <div>
                        <p className="text-white font-bold text-sm">{room.sessionName}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-xs text-gray-500 font-mono">🔑 <span className="text-amber-400 font-bold">{room.sessionCode}</span></span>
                          <span className="text-xs text-gray-500 font-mono">🔒 PIN: <span className="text-blue-400">{room.displayPin || '—'}</span></span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${room.isActive ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : 'bg-gray-500/15 text-gray-500 border-gray-600/20'}`}>
                            {room.isActive ? '🟢 نشطة' : '⚪ مغلقة'}
                          </span>
                          {stats.totalMatches > 0 && (
                            <span className="text-[10px] text-gray-500">{stats.totalMatches} مباراة</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => copyCode(room.sessionCode, room.id)} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-600/40 text-gray-400 hover:text-white transition" title="نسخ">
                        {copiedId === room.id ? '✅' : '📋'}
                      </button>
                      <a href={`/display?sessionCode=${room.sessionCode}&pin=${room.displayPin}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition">
                        📺 العرض
                      </a>
                      {room.isActive && (
                        <button onClick={() => enterRoom(room)} className="text-xs px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition">
                          🎮 دخول
                        </button>
                      )}
                      {/* ── زر انتهت الفعالية ── */}
                      {room.isActive && (
                        <button
                          onClick={() => handleCloseRoom(room.id)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 transition font-bold"
                          title="إغلاق الفعالية نهائياً"
                        >
                          🏁 انتهت الفعالية
                        </button>
                      )}
                      <button onClick={() => handleDeleteRoom(room.id)} className="text-xs px-2.5 py-1.5 rounded-lg border border-rose-500/20 text-rose-500/60 hover:text-rose-400 hover:border-rose-500/30 transition" title="حذف">
                        🗑️
                      </button>
                      {stats.totalMatches > 0 && (
                        <button onClick={() => setExpandedRoom(isExpanded ? null : room.id)}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-amber-500/20 text-amber-400/70 hover:bg-amber-500/10 transition">
                          {isExpanded ? '▲ إخفاء' : '▼ الألعاب'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── إحصاءات الغرفة السريعة ── */}
                  {stats.totalMatches > 0 && (
                    <div className="px-3.5 pb-3 flex items-center gap-4 border-t border-white/5 pt-2.5">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-500">إجمالي: <span className="text-white font-bold">{stats.totalMatches}</span></span>
                        <span className="text-rose-400">🔴 مافيا: <strong>{stats.mafiaWins}</strong></span>
                        <span className="text-emerald-400">🟢 مواطنين: <strong>{stats.citizenWins}</strong></span>
                        {stats.totalDuration > 0 && (
                          <span className="text-gray-500">⏱️ {fmtDuration(stats.totalDuration)}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── قائمة الألعاب ── */}
                  {isExpanded && room.matches && room.matches.length > 0 && (
                    <div className="border-t border-white/5 px-3.5 pb-3 pt-2.5 space-y-2">
                      <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">📜 الألعاب</p>
                      {room.matches.map((match: any, mi: number) => (
                        <div key={match.id} onClick={() => setSelectedMatch(match)}
                          className="flex items-center justify-between bg-gray-800/40 border border-gray-700/20 rounded-lg px-3 py-2 cursor-pointer hover:border-amber-500/20 transition"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm ${matchResult(match.winner).iconCls}`}>
                              {matchResult(match.winner).icon}
                            </span>
                            <div>
                              <p className="text-xs text-white font-medium">لعبة {mi + 1}</p>
                              <p className="text-[10px] text-gray-500">{match.playerCount} لاعب • {match.totalRounds} جولة • {fmtDuration(match.durationSeconds)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${matchResult(match.winner).badgeCls}`}>
                              {matchResult(match.winner).label}
                            </span>
                            {match.endedAt && <span className="text-[10px] text-gray-600">{fmtDate(match.endedAt)}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-gray-600 text-sm">
            <span className="text-3xl block mb-2 opacity-30">🎮</span>
            لا توجد غرف مرتبطة بهذا النشاط
          </div>
        )}
      </div>

      {/* ── Modal تفاصيل مباراة ── */}
      {selectedMatch && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedMatch(null)}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            onClick={e => e.stopPropagation()}
            className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 max-w-sm w-full"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">تفاصيل اللعبة</h3>
              <button onClick={() => setSelectedMatch(null)} className="text-gray-500 hover:text-white text-lg">✕</button>
            </div>
            <div className={`rounded-xl p-3 mb-4 text-center font-bold ${matchResult(selectedMatch.winner).badgeCls}`}>
              {matchResult(selectedMatch.winner).icon} {matchResult(selectedMatch.winner).label}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { v: selectedMatch.playerCount, l: 'لاعب' },
                { v: selectedMatch.totalRounds, l: 'جولة' },
                { v: fmtDuration(selectedMatch.durationSeconds), l: 'المدة' },
              ].map((s, i) => (
                <div key={i} className="bg-gray-800/50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-white">{s.v}</p>
                  <p className="text-xs text-gray-500">{s.l}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Modal اللاعبون بدون حجز ── */}
      {showUnbooked && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowUnbooked(false)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={e => e.stopPropagation()} className="bg-gray-900 border border-rose-500/30 rounded-2xl p-6 w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-rose-400 flex items-center gap-2">⚠️ حضروا بدون حجز</h3>
              <button onClick={() => setShowUnbooked(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>
            
            {loadingUnbooked ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin h-8 w-8 border-2 border-rose-500 border-t-transparent rounded-full" />
              </div>
            ) : unbookedPlayers.length === 0 ? (
              <div className="py-10 text-center">
                <span className="text-4xl mb-3 block">🎉</span>
                <p className="text-emerald-400 font-bold">جميع اللاعبين المتواجدين في الغرف لديهم حجوزات مطابقة!</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-gray-400 text-sm">هؤلاء اللاعبون مسجلون في غرف اللعب لكن النظام لم يجد حجوزات تطابقهم:</p>
                  <button
                    onClick={() => handleAutoBook(unbookedPlayers)}
                    disabled={bookingInProgress === 'all'}
                    className="text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-1.5 rounded-lg border border-emerald-500/30 whitespace-nowrap disabled:opacity-50"
                  >
                    {bookingInProgress === 'all' ? '⏳...' : '✅ تسجيل الكل كحجز'}
                  </button>
                </div>
                {unbookedPlayers.map((p, i) => {
                  const idKey = p.player_id || p.player_name;
                  const isLoad = Array.isArray(bookingInProgress) && bookingInProgress.includes(idKey);
                  return (
                    <div key={i} className="bg-gray-800/80 border border-rose-500/20 rounded-xl p-3 flex justify-between items-center">
                      <div>
                        <p className="text-white font-bold">{p.player_name}</p>
                        <p className="text-xs text-gray-500 font-mono mt-0.5 flex items-center gap-2" dir="ltr">
                          {p.phone || '—'}
                          <WhatsAppButton phone={p.phone} size={13} />
                        </p>
                      </div>
                      <button
                        onClick={() => handleAutoBook([p])}
                        disabled={bookingInProgress !== null}
                        className="text-xs text-blue-400 border border-blue-500/30 hover:bg-blue-500/10 px-3 py-1 rounded-lg disabled:opacity-50 transition"
                      >
                        {isLoad ? '⏳...' : 'تسجيل حجز'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🎫 التذاكر المستخدمة مع هذا النشاط (من النظام المركزي)
// ══════════════════════════════════════════════════════
function TicketsSection({ activityId }: { activityId: number }) {
  const [usedTickets, setUsedTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // 1. التذاكر المربوطة بهذا النشاط (assigned)
        const assigned = await apiFetch(`/api/tickets/by-activity/${activityId}`);
        // 2. أيضاً التذاكر المستخدمة فعلياً في هذا النشاط (قد لا تكون مربوطة مسبقاً)
        const all = await apiFetch(`/api/tickets?limit=500`);
        const usedHere = (all || []).filter((t: any) => t.isUsed && Number(t.usedInActivityId) === activityId);
        // دمج بدون تكرار
        const merged = new Map<number, any>();
        for (const t of [...(assigned || []), ...usedHere]) {
          if (t.isUsed) merged.set(t.id, t);
        }
        setUsedTickets(Array.from(merged.values()));
      } catch (err) {
        console.error('Failed to fetch used tickets:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [activityId]);

  return (
    <div className="bg-gray-800/50 border border-purple-500/20 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          🎫 التذاكر المستخدمة في هذا النشاط
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/20">
            {usedTickets.length} تذكرة
          </span>
        </h3>
        <a href="/admin/tickets" className="text-xs px-3 py-1.5 rounded-lg border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition">
          📂 إدارة التذاكر المركزية ←
        </a>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="animate-spin h-6 w-6 border-2 border-purple-500 border-t-transparent rounded-full" />
        </div>
      ) : usedTickets.length > 0 ? (
        <div className="max-h-64 overflow-y-auto border border-gray-700/30 rounded-xl">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="bg-gray-900/50 text-gray-500 text-xs sticky top-0">
                <th className="text-right px-3 py-2 font-medium">#</th>
                <th className="text-right px-3 py-2 font-medium">رقم التذكرة</th>
                <th className="text-right px-3 py-2 font-medium">اللاعب</th>
                <th className="text-right px-3 py-2 font-medium">الهاتف</th>
                <th className="text-right px-3 py-2 font-medium">البائع</th>
                <th className="text-right px-3 py-2 font-medium">تاريخ الاستخدام</th>
              </tr>
            </thead>
            <tbody>
              {usedTickets.map((t: any, i: number) => (
                <tr key={t.id} className="border-t border-gray-700/20 hover:bg-gray-700/10">
                  <td className="px-3 py-2 text-gray-600 text-xs">{i + 1}</td>
                  <td className="px-3 py-2 text-white font-mono text-xs" dir="ltr">{t.ticketNumber}</td>
                  <td className="px-3 py-2 text-white text-xs">{t.usedByName || '—'}</td>
                  <td className="px-3 py-2 text-gray-400 font-mono text-[10px]" dir="ltr">{t.usedByPhone || '—'}</td>
                  <td className="px-3 py-2 text-gray-400 text-xs">{t.sellerName || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 text-[10px]">
                    {t.usedAt ? new Date(t.usedAt).toLocaleString('ar-JO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-6 text-gray-600 text-sm">
          <span className="text-2xl block mb-2 opacity-30">🎫</span>
          لم يتم استخدام أي تذاكر مع هذا النشاط بعد
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🪑 إعدادات الجلوس الذكي
// ══════════════════════════════════════════════════════
const CONSTRAINT_INFO: Record<string, { label: string; icon: string; desc: string; defaultEnabled: boolean }> = {
  NO_ADJACENT_PAIRS: {
    label: 'أزواج ممنوعة',
    icon: '🚫',
    desc: 'لاعبان محددان يدوياً لا يجلسان بجانب بعض',
    defaultEnabled: true,
  },
  PENALTY_NEIGHBOR_AVOIDANCE: {
    label: 'تجنب جيران المعاقب',
    icon: '⚠️',
    desc: 'اللاعب المعاقب لا يجلس بجانب نفس الجيران مرة أخرى',
    defaultEnabled: true,
  },
  NEW_PLAYER_SEPARATION: {
    label: 'فصل اللاعبين الجدد',
    icon: '👶',
    desc: 'لاعب جديد (أقل من 3 فعاليات) لا يُحاط بلاعبَين جديدَين',
    defaultEnabled: true,
  },
  HIGH_RANK_SEPARATION: {
    label: 'فصل الرتب العالية',
    icon: '⚔️',
    desc: 'لاعبان بتصنيف عالٍ لا يجلسان بجانب بعض',
    defaultEnabled: false,
  },
  GENDER_SEPARATION: {
    label: 'فصل الجنسين',
    icon: '🚹',
    desc: 'ذكر لا يجلس بجانب أنثى (أضعف قيد)',
    defaultEnabled: false,
  },
};

function SeatingConstraintsPanel({ activityId }: { activityId: number }) {
  const [engineEnabled, setEngineEnabled] = useState(false);
  const [constraints, setConstraints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchConstraints();
  }, [activityId]);

  const fetchConstraints = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/seating/constraints?activityId=${activityId}`);
      setEngineEnabled(res.engineEnabled || false);
      if (res.constraints && res.constraints.length > 0) {
        setConstraints(res.constraints);
      } else {
        // إعدادات افتراضية
        setConstraints(
          Object.entries(CONSTRAINT_INFO).map(([type, info]) => ({
            type,
            enabled: info.defaultEnabled,
            priority: type === 'NO_ADJACENT_PAIRS' ? 1 : type === 'PENALTY_NEIGHBOR_AVOIDANCE' ? 2 : type === 'NEW_PLAYER_SEPARATION' ? 3 : type === 'HIGH_RANK_SEPARATION' ? 4 : 8,
            params: {},
          }))
        );
      }
    } catch (err: any) {
      console.warn('Failed to fetch seating constraints:', err.message);
      // إعدادات افتراضية عند الخطأ
      setConstraints(
        Object.entries(CONSTRAINT_INFO).map(([type, info]) => ({
          type,
          enabled: info.defaultEnabled,
          priority: type === 'NO_ADJACENT_PAIRS' ? 1 : type === 'PENALTY_NEIGHBOR_AVOIDANCE' ? 2 : type === 'NEW_PLAYER_SEPARATION' ? 3 : type === 'HIGH_RANK_SEPARATION' ? 4 : 8,
          params: {},
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  const saveConstraints = async (newEnabled: boolean, newConstraints: any[]) => {
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch('/api/seating/constraints', {
        method: 'PUT',
        body: JSON.stringify({
          activityId,
          engineEnabled: newEnabled,
          constraints: newConstraints,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      console.warn('Failed to save seating constraints:', err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleEngine = () => {
    const next = !engineEnabled;
    setEngineEnabled(next);
    saveConstraints(next, constraints);
  };

  const toggleConstraint = (type: string) => {
    const updated = constraints.map(c =>
      c.type === type ? { ...c, enabled: !c.enabled } : c
    );
    setConstraints(updated);
    saveConstraints(engineEnabled, updated);
  };

  return (
    <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          🪑 إعدادات الجلوس الذكي
          {engineEnabled && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              مفعّل
            </span>
          )}
          {saved && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-[10px] text-emerald-400"
            >
              ✓ تم الحفظ
            </motion.span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {saving && (
            <div className="animate-spin h-4 w-4 border-2 border-amber-500 border-t-transparent rounded-full" />
          )}
          <button
            onClick={toggleEngine}
            className={`text-xs px-4 py-2 rounded-lg font-bold transition-all border ${
              engineEnabled
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                : 'bg-gray-700/30 text-gray-500 border-gray-600/30 hover:text-white hover:border-gray-500'
            }`}
          >
            {engineEnabled ? '✓ المحرك الذكي مفعّل' : 'تفعيل المحرك الذكي'}
          </button>
        </div>
      </div>

      {!engineEnabled && !loading && (
        <div className="text-center py-6">
          <span className="text-3xl block mb-3 opacity-30">🪑</span>
          <p className="text-gray-500 text-sm mb-2">المحرك الذكي معطّل حالياً</p>
          <p className="text-gray-600 text-xs">عند التفعيل، النظام يوزع المقاعد تلقائياً حسب القيود التي تحددها</p>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-6">
          <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" />
        </div>
      )}

      {engineEnabled && !loading && (
        <div className="space-y-3">
          <p className="text-gray-500 text-xs mb-3">
            حدد القيود التي تريد تطبيقها عند توزيع المقاعد. القيود المفعّلة تُطبّق تلقائياً عند دخول اللاعبين للغرفة.
          </p>

          {constraints.map(c => {
            const info = CONSTRAINT_INFO[c.type];
            if (!info) return null;
            return (
              <motion.div
                key={c.type}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-center justify-between bg-gray-900/50 border rounded-xl px-4 py-3.5 transition-all cursor-pointer hover:bg-gray-900/70 ${
                  c.enabled ? 'border-amber-500/30' : 'border-gray-700/20'
                }`}
                onClick={() => toggleConstraint(c.type)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                    c.enabled ? 'bg-amber-500/15 border border-amber-500/20' : 'bg-gray-800/50 border border-gray-700/20'
                  }`}>
                    {info.icon}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-bold ${c.enabled ? 'text-white' : 'text-gray-500'}`}>
                      {info.label}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">{info.desc}</p>
                  </div>
                </div>
                <div
                  className={`w-11 h-6 rounded-full relative transition-all shrink-0 ml-3 ${
                    c.enabled ? 'bg-amber-500/30' : 'bg-gray-700/30'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full absolute top-0.5 transition-all shadow-md ${
                      c.enabled
                        ? 'right-0.5 bg-amber-500'
                        : 'left-0.5 bg-gray-600'
                    }`}
                  />
                </div>
              </motion.div>
            );
          })}

          <div className="bg-gray-900/30 border border-gray-700/20 rounded-xl p-3 mt-3">
            <p className="text-[10px] text-gray-600 text-center">
              💡 القيود تُحفظ تلقائياً وتُطبّق على جميع الغرف المرتبطة بهذا النشاط
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ActivityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const activityId = Number(params.id);
  const user = useMemo(() => getUser(), []);
  const isAccountant = user.role === 'accountant';

  const [activity, setActivity] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [costs, setCosts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingsOpen, setBookingsOpen] = useState(false);
  const [bookingSearch, setBookingSearch] = useState('');
  const [costsOpen, setCostsOpen] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  // Payment modal
  const [payModal, setPayModal] = useState<any[] | null>(null);
  const [selectedBookings, setSelectedBookings] = useState<number[]>([]);
  const [payAmount, setPayAmount] = useState('');
  const [payReceiver, setPayReceiver] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [act, bks, csts, locs, stf] = await Promise.all([
          apiFetch(`/api/activities/${activityId}`),
          apiFetch(`/api/bookings?activityId=${activityId}`),
          apiFetch(`/api/costs?activityId=${activityId}`),
          apiFetch('/api/locations'),
          apiFetch('/api/staff').catch(() => []),
        ]);
        setActivity(act);
        setBookings(bks);
        setCosts(csts);
        setLocations(locs);
        setStaffList(stf);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [activityId]);

  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>;
  if (!activity) return <div className="text-center py-20 text-gray-500">النشاط غير موجود</div>;

  const actBookings = bookings;
  const actCosts = costs;
  const location = locations.find(l => l.id === activity.locationId) || null;

  const revenue = actBookings.reduce((s: number, b: any) => s + (b.isPaid ? Number(b.paidAmount || 0) : 0), 0);
  const expense = actCosts.reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
  const profit = revenue - expense;
  const totalAttendees = actBookings.reduce((s: number, b: any) => s + (b.count || 1), 0);
  const paidAttendees = actBookings.filter((b: any) => b.isPaid && !b.isFree).reduce((s: number, b: any) => s + (b.count || 1), 0);
  const freeAttendees = actBookings.filter((b: any) => b.isFree).reduce((s: number, b: any) => s + (b.count || 1), 0);
  const unpaidAttendees = actBookings.filter((b: any) => !b.isPaid && !b.isFree).reduce((s: number, b: any) => s + (b.count || 1), 0);

  const status = STATUS_MAP[activity.status] || STATUS_MAP.planned;

  async function toggleLock() {
    try {
      await apiFetch(`/api/activities/${activity.id}`, { method: 'PUT', body: JSON.stringify({ isLocked: !activity.isLocked }) });
      setActivity({ ...activity, isLocked: !activity.isLocked });
    } catch {}
  }

  async function handleEditActivity(id: number, data: any) {
    const updated = await apiFetch(`/api/activities/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    setActivity(updated);
    setShowEditForm(false);
  }

  // ── Payment handlers ──
  function openPayModal(bookingsToPay: any[]) {
    let totalSuggested = 0;
    bookingsToPay.forEach(booking => {
      if (booking.offerItems?.length > 0) {
        totalSuggested += booking.offerItems.reduce((s: number, item: any) => s + ((item.unitPrice || item.price || 0) * (item.quantity || 0)), 0);
      } else {
        totalSuggested += (Number(activity?.basePrice || 0)) * (booking.count || 1);
      }
    });

    setPayModal(bookingsToPay);
    setPayAmount(String(totalSuggested || ''));
    setPayReceiver('');
    setPayNotes(bookingsToPay.length === 1 ? (bookingsToPay[0].notes || '') : '');
  }

  async function confirmPayment() {
    if (!payModal || payModal.length === 0) return;
    setPaySubmitting(true);
    
    // حساب المبلغ المتوقع لكل حجز لتوزيع المبلغ الكلي إذا تم تعديله
    const expectedPerBooking = payModal.map(b => {
      let expected = 0;
      if (b.offerItems?.length > 0) {
        expected = b.offerItems.reduce((s: number, item: any) => s + ((item.unitPrice || item.price || 0) * (item.quantity || 0)), 0);
      } else {
        expected = (Number(activity?.basePrice || 0)) * (b.count || 1);
      }
      return expected;
    });
    
    const totalExpected = expectedPerBooking.reduce((a, b) => a + b, 0);
    const actualTotalPaid = Number(payAmount) || 0;

    try {
      const promises = payModal.map(async (booking, i) => {
        let bookingPaid = expectedPerBooking[i];
        
        // توزيع المبلغ المدفوع بشكل نسبي إذا كان مختلف عن المجموع المتوقع
        if (totalExpected > 0 && actualTotalPaid !== totalExpected) {
           bookingPaid = Number(((expectedPerBooking[i] / totalExpected) * actualTotalPaid).toFixed(2));
        } else if (totalExpected === 0 && actualTotalPaid > 0) {
           bookingPaid = Number((actualTotalPaid / payModal.length).toFixed(2));
        }

        return apiFetch(`/api/bookings/${booking.id}/pay`, {
          method: 'PUT',
          body: JSON.stringify({
            paidAmount: bookingPaid,
            receivedBy: payReceiver,
            notes: payNotes,
          }),
        });
      });

      const updatedBookings = await Promise.all(promises);
      
      setBookings(prev => prev.map(b => {
         const updated = updatedBookings.find((u: any) => u.id === b.id);
         return updated ? updated : b;
      }));
      setPayModal(null);
      setSelectedBookings([]);
    } catch (err: any) {
      alert('فشل تأكيد الدفع: ' + err.message);
    } finally {
      setPaySubmitting(false);
    }
  }

  async function handleUnpay(bookingId: number) {
    if (!(await swalConfirm('هل تريد إلغاء تأكيد الدفع لهذا الحجز؟'))) return;
    try {
      const updated = await apiFetch(`/api/bookings/${bookingId}`, {
        method: 'PUT',
        body: JSON.stringify({ isPaid: false, paidAmount: '0' }),
      });
      setBookings(prev => prev.map(b => b.id === bookingId ? updated : b));
    } catch (err: any) {
      alert('فشل: ' + err.message);
    }
  }

  async function handleDeleteBooking(bookingId: number) {
    if (!(await swalConfirm('⚠️ هل تريد حذف هذا الحجز نهائياً؟'))) return;
    try {
      await apiFetch(`/api/bookings/${bookingId}`, { method: 'DELETE' });
      setBookings(prev => prev.filter(b => b.id !== bookingId));
    } catch (err: any) {
      alert('فشل الحذف: ' + err.message);
    }
  }

  async function handleMakeFree() {
    if (selectedBookings.length === 0) return;
    if (!(await swalConfirm('هل أنت متأكد من تحويل الحجوزات المحددة إلى مجانية لهذا النشاط فقط؟ ستصبح قيمة الدفع 0 ولن يطالبوا بالدفع.'))) return;
    try {
      const promises = selectedBookings.map(id => 
        apiFetch(`/api/bookings/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ isFree: true, isPaid: true, paidAmount: '0' })
        })
      );
      const updated = await Promise.all(promises);
      setBookings(prev => prev.map(b => {
        const u = updated.find((upd: any) => upd.id === b.id);
        return u ? u : b;
      }));
      setSelectedBookings([]);
    } catch (err: any) {
      alert('فشل التحويل: ' + err.message);
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-10" dir="rtl">

      {/* ══ Header ══ */}
      <div className="pb-2">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/admin/activities')}
            className="w-10 h-10 rounded-full border border-gray-700/50 flex items-center justify-center text-gray-400 hover:text-white hover:border-gray-500 transition shrink-0"
          >
            →
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1 flex-wrap justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white">{activity.name}</h1>
                <span className={`text-[11px] px-2.5 py-1 rounded-full border ${status.color}`}>{status.label}</span>
                {activity.isLocked && (
                  <span className="text-[11px] px-2 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                    🔒 مقفول إدارياً
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isAccountant && (
                  <button
                    onClick={() => setShowEditForm(true)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition flex items-center gap-1.5"
                  >
                    ✏️ تعديل النشاط
                  </button>
                )}
                {user.role === 'admin' && (
                  <button
                    onClick={toggleLock}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                      activity.isLocked
                        ? 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10'
                        : 'border-gray-600/50 text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    {activity.isLocked ? '🔓 فك القفل' : '🔒 قفل النشاط'}
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
              <span>📅 {safeDate(activity.date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              <span>🎫 {Number(activity.basePrice || 0)} {CURRENCY} / شخص</span>
              {location && <span>📍 {location.name}</span>}
              <span>👥 {activity.maxCapacity || 20} لاعب كحد أقصى</span>
              <span>{{'easy':'🟢 سهل','medium':'🟡 متوسط','hard':'🔴 صعب','expert':'🟣 خبير'}[activity.difficulty as string] || '🟡 متوسط'}</span>
            </div>
            {activity.description && <p className="text-sm text-gray-500 mt-2">{activity.description}</p>}
            {activity.isLocked && (
              <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                <h4 className="font-bold text-rose-400 text-sm">🔒 هذا النشاط مقفول</h4>
                <p className="text-xs text-rose-400/70 mt-1">يمنع إجراء أي تعديلات مالية أو إدارية. فقط المدير العام بإمكانه تغيير حالة القفل.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ نموذج التعديل ══ */}
      {showEditForm && (
        <EditActivityForm
          activity={activity}
          locations={locations}
          onSubmit={handleEditActivity}
          onCancel={() => setShowEditForm(false)}
        />
      )}

      {/* ══ إعدادات الجلوس الذكي ══ */}
      <SeatingConstraintsPanel activityId={activity.id} />

      {/* ══ الغرف المرتبطة (متعددة) ══ */}
      <RoomsSection activityId={activity.id} activityName={activity.name} />

      {/* ══ إدارة التذاكر ══ */}
      {activity.requireTicket && (
        <TicketsSection activityId={activity.id} />
      )}

      {/* ══ Donut Charts ══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* المالي */}
        <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">💰 الملخص المالي</h3>
          <div className="flex items-center gap-6">
            <DonutChart data={[
              { name: 'إيرادات', value: revenue, color: '#10b981' },
              { name: 'تكاليف', value: expense, color: '#f43f5e' },
            ]} />
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between p-2.5 bg-gray-900/60 rounded-xl">
                <span className="text-gray-400 text-sm">صافي الربح</span>
                <span className={`font-bold text-lg ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {profit.toLocaleString()} {CURRENCY}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> الإيرادات
                </span>
                <span className="font-bold text-emerald-400">+{revenue.toLocaleString()} {CURRENCY}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> التكاليف
                </span>
                <span className="font-bold text-rose-400">-{expense.toLocaleString()} {CURRENCY}</span>
              </div>
            </div>
          </div>
        </div>

        {/* الحضور */}
        <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">👥 توزيع الحضور</h3>
          <div className="flex items-center gap-6">
            <DonutChart data={[
              { name: 'مدفوع', value: paidAttendees, color: '#10b981' },
              { name: 'مجاني', value: freeAttendees, color: '#3b82f6' },
              { name: 'غير مدفوع', value: unpaidAttendees, color: '#f59e0b' },
              { name: 'متبقي', value: Math.max(0, (activity.maxCapacity || 20) - totalAttendees), color: '#374151' },
            ]} />
            <div className="flex-1 space-y-3">
              <div className="p-2.5 bg-gray-900/60 rounded-xl">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-gray-400 text-sm">إجمالي الحضور</span>
                  <span className="font-bold text-lg text-white">
                    {totalAttendees}<span className="text-xs text-gray-500 font-normal">/{activity.maxCapacity || 20}</span>
                  </span>
                </div>
                {/* شريط التعبئة */}
                <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      totalAttendees >= (activity.maxCapacity || 20) ? 'bg-rose-500' :
                      totalAttendees >= (activity.maxCapacity || 20) * 0.8 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, (totalAttendees / (activity.maxCapacity || 20)) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-600 mt-1">{actBookings.length} حجز — {Math.max(0, (activity.maxCapacity || 20) - totalAttendees)} مقعد متبقي</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> مدفوع</span>
                <span className="font-bold text-emerald-400">{paidAttendees}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> مجاني</span>
                <span className="font-bold text-blue-400">{freeAttendees}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> غير مدفوع</span>
                <span className="font-bold text-amber-400">{unpaidAttendees}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══ Bookings Table (Collapsible) ══ */}
      <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl overflow-hidden">
        <button
          onClick={() => setBookingsOpen(!bookingsOpen)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-700/20 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">👥</span>
            <span className="font-bold text-white">قائمة الحجوزات</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-400">{actBookings.length} حجز</span>
            {selectedBookings.length > 0 && (
              <div className="flex items-center gap-2 mr-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openPayModal(actBookings.filter((b: any) => selectedBookings.includes(b.id)));
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition font-bold"
                >
                  💰 دفع المحدد ({selectedBookings.length})
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMakeFree();
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30 hover:bg-teal-500/30 transition font-bold"
                >
                  🏷️ تحويل لمجاني ({selectedBookings.length})
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {unpaidAttendees > 0 && (
              <span className="text-xs text-amber-400">⚠️ {unpaidAttendees} لم يدفعوا</span>
            )}
            <span className="text-gray-500">{bookingsOpen ? '▲' : '▼'}</span>
          </div>
        </button>

        {bookingsOpen && (
          <div className="px-5 pb-5">
            <div className="mb-4">
              <input
                type="text"
                placeholder="🔍 بحث باسم الشخص أو رقم الهاتف..."
                value={bookingSearch}
                onChange={e => setBookingSearch(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50 placeholder-gray-500"
              />
            </div>
            {actBookings.length > 0 ? (
              <>
                <div className="overflow-x-auto border border-gray-700/30 rounded-xl">
                  <table className="w-full text-sm" dir="rtl">
                    <thead>
                      <tr className="bg-gray-900/50 text-gray-500 text-xs">
                        <th className="text-right px-3 py-2.5 font-medium w-8">
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-600 bg-gray-700/50 text-emerald-500 focus:ring-emerald-500/30 w-3.5 h-3.5 cursor-pointer"
                            checked={selectedBookings.length > 0 && selectedBookings.length === actBookings.filter((b: any) => !b.isPaid && !b.isFree).length}
                            onChange={(e) => {
                               if (e.target.checked) {
                                 setSelectedBookings(actBookings.filter((b: any) => !b.isPaid && !b.isFree).map((b: any) => b.id));
                               } else {
                                 setSelectedBookings([]);
                               }
                            }}
                          />
                        </th>
                        <th className="text-right px-3 py-2.5 font-medium">#</th>
                        <th className="text-right px-3 py-2.5 font-medium">الاسم</th>
                        <th className="text-right px-3 py-2.5 font-medium">الهاتف</th>
                        <th className="text-center px-3 py-2.5 font-medium">العدد</th>
                        <th className="text-center px-3 py-2.5 font-medium">الحالة</th>
                        <th className="text-center px-3 py-2.5 font-medium">المبلغ</th>
                        <th className="text-right px-3 py-2.5 font-medium">المستلم</th>
                        <th className="text-right px-3 py-2.5 font-medium">ملاحظات</th>
                        <th className="text-center px-3 py-2.5 font-medium">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...actBookings].filter((b: any) => 
                        bookingSearch ? (
                          (b.name && b.name.toLowerCase().includes(bookingSearch.toLowerCase())) || 
                          (b.phone && b.phone.includes(bookingSearch))
                        ) : true
                      ).sort((a: any, b: any) => {
                        const priority = (bk: any) => bk.isFree ? 2 : bk.isPaid ? 0 : 1;
                        return priority(a) - priority(b);
                      }).map((b: any, i: number) => (
                        <tr key={b.id} className={`border-t border-gray-700/20 transition ${!b.isPaid && !b.isFree ? 'bg-amber-500/[0.03] hover:bg-amber-500/[0.06]' : 'hover:bg-gray-700/10'}`}>
                          <td className="px-3 py-2.5">
                            {!b.isPaid && !b.isFree && (
                              <input 
                                type="checkbox" 
                                className="rounded border-gray-600 bg-gray-700/50 text-emerald-500 focus:ring-emerald-500/30 w-3.5 h-3.5 cursor-pointer"
                                checked={selectedBookings.includes(b.id)}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedBookings(prev => [...prev, b.id]);
                                  else setSelectedBookings(prev => prev.filter(id => id !== b.id));
                                }}
                              />
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 text-xs font-mono">{i + 1}</td>
                          <td className="px-3 py-2.5 text-white font-medium">{b.name}</td>
                          <td className="px-3 py-2.5 text-gray-400 text-xs" dir="ltr">
                            <span className="inline-flex items-center gap-2">
                              {b.phone || '—'}
                              <WhatsAppButton phone={b.phone} size={13} />
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="bg-gray-700/50 text-gray-300 px-2 py-0.5 rounded text-xs font-bold">{b.count || 1}</span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex flex-col items-center gap-1">
                            {b.isFree ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-400 border border-teal-500/20">🏷️ مجاني</span>
                            ) : b.isPaid ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">✅ مدفوع</span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 animate-pulse">⏳ غير مدفوع</span>
                            )}
                            {b.ticketNumber && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/20 font-mono" dir="ltr">🎫 {b.ticketNumber}</span>
                            )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center font-medium">
                            {b.isFree ? <span className="text-gray-600">—</span> : (
                              <span className={b.isPaid ? 'text-emerald-400' : 'text-amber-400'}>
                                {Number(b.paidAmount || 0)} {CURRENCY}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-gray-400 text-xs">{b.receivedBy || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs max-w-[120px] truncate" title={b.notes}>{b.notes || '—'}</td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {!b.isFree && !b.isPaid && (
                                <button
                                  onClick={() => openPayModal([b])}
                                  className="text-[10px] px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25 transition font-bold"
                                  title="تأكيد الدفع"
                                >
                                  💰 تأكيد دفع
                                </button>
                              )}
                              {b.isPaid && !b.isFree && !isAccountant && (
                                <button
                                  onClick={() => handleUnpay(b.id)}
                                  className="text-[10px] px-2 py-1 rounded-lg text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 transition"
                                  title="إلغاء تأكيد الدفع"
                                >
                                  ↩️
                                </button>
                              )}
                              {!isAccountant && (
                                <button
                                  onClick={() => handleDeleteBooking(b.id)}
                                  className="text-[10px] px-2 py-1 rounded-lg text-rose-400/50 hover:text-rose-400 hover:bg-rose-500/10 transition"
                                  title="حذف الحجز"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Summary */}
                <div className="mt-3 flex flex-wrap items-center gap-5 text-sm text-gray-500 bg-gray-900/30 rounded-xl p-3 border border-gray-700/20">
                  <span>👥 <strong className="text-white">{totalAttendees}</strong> حضور</span>
                  <span>💳 <strong className="text-emerald-400">{revenue.toLocaleString()} {CURRENCY}</strong> محصّل</span>
                  {unpaidAttendees > 0 && (
                    <span className="text-amber-400">⚠️ <strong>{(Number(activity.basePrice || 0) * unpaidAttendees).toLocaleString()} {CURRENCY}</strong> متوقع تحصيله</span>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-10 text-gray-600">
                <span className="text-3xl block mb-2 opacity-30">👥</span>
                لا توجد حجوزات لهذا النشاط بعد
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ Payment Confirmation Modal ══ */}
      {payModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPayModal(null)}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            onClick={e => e.stopPropagation()}
            className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 max-w-md w-full"
            dir="rtl"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">💰 تأكيد الدفع</h3>
              <button onClick={() => setPayModal(null)} className="text-gray-500 hover:text-white text-lg">✕</button>
            </div>

            {/* معلومات الحجز */}
            <div className="bg-gray-800/60 border border-gray-700/30 rounded-xl p-4 mb-5 space-y-2">
              {payModal.length === 1 ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">الاسم</span>
                    <span className="text-white font-bold">{payModal[0].name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">العدد</span>
                    <span className="text-white">{payModal[0].count || 1} شخص</span>
                  </div>
                  {payModal[0].phone && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">الهاتف</span>
                      <span className="text-gray-300" dir="ltr">{payModal[0].phone}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">الحجوزات المحددة</span>
                    <span className="text-white font-bold">{payModal.length} حجوزات</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">إجمالي الأشخاص</span>
                    <span className="text-white">{payModal.reduce((s: number, b: any) => s + (b.count || 1), 0)} شخص</span>
                  </div>
                </>
              )}
            </div>

            {/* حقول التأكيد */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">المبلغ المدفوع ({CURRENCY}) *</label>
                <input
                  type="number" min="0" step="0.5"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800/60 border border-gray-600/50 rounded-xl text-white text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">المستلم</label>
                <select
                  value={payReceiver}
                  onChange={e => setPayReceiver(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  <option value="">اختر المستلم</option>
                  {staffList.map((s: any) => (
                    <option key={s.id} value={s.displayName}>{s.displayName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">ملاحظات</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  placeholder="ملاحظات اختيارية..."
                  className="w-full px-4 py-3 bg-gray-800/60 border border-gray-600/50 rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
            </div>

            {/* أزرار */}
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={confirmPayment}
                disabled={paySubmitting || !payAmount || Number(payAmount) <= 0}
                className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50 text-sm"
              >
                {paySubmitting ? '⏳ جاري التأكيد...' : '✅ تأكيد الدفع'}
              </button>
              <button
                onClick={() => setPayModal(null)}
                className="px-5 py-3 bg-gray-700/50 text-gray-300 rounded-xl hover:bg-gray-700/70 transition text-sm"
              >
                إلغاء
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ══ Costs Table (Collapsible) ══ */}
      <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl overflow-hidden">
        <button
          onClick={() => setCostsOpen(!costsOpen)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-700/20 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🧾</span>
            <span className="font-bold text-white">تكاليف النشاط</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-400">{actCosts.length} بند</span>
          </div>
          <div className="flex items-center gap-3">
            {actCosts.length > 0 && (
              <span className="text-sm font-bold text-rose-400">{expense.toLocaleString()} {CURRENCY}</span>
            )}
            <span className="text-gray-500">{costsOpen ? '▲' : '▼'}</span>
          </div>
        </button>

        {costsOpen && (
          <div className="px-5 pb-5">
            {actCosts.length > 0 ? (
              <div className="overflow-x-auto border border-gray-700/30 rounded-xl">
                <table className="w-full text-sm" dir="rtl">
                  <thead>
                    <tr className="bg-gray-900/50 text-gray-500 text-xs">
                      <th className="text-right px-3 py-2.5 font-medium">#</th>
                      <th className="text-right px-3 py-2.5 font-medium">البند</th>
                      <th className="text-center px-3 py-2.5 font-medium">المبلغ</th>
                      <th className="text-right px-3 py-2.5 font-medium">المدفوع بواسطة</th>
                      <th className="text-right px-3 py-2.5 font-medium">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actCosts.map((c: any, i: number) => (
                      <tr key={c.id} className="border-t border-gray-700/20 hover:bg-gray-700/10 transition">
                        <td className="px-3 py-2.5 text-gray-600 text-xs font-mono">{i + 1}</td>
                        <td className="px-3 py-2.5 text-white font-medium">{c.item}</td>
                        <td className="px-3 py-2.5 text-center font-bold text-rose-400">{Number(c.amount || 0).toLocaleString()} {CURRENCY}</td>
                        <td className="px-3 py-2.5 text-gray-400">{c.paidBy || '—'}</td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">{c.date ? safeDate(c.date).toLocaleDateString('ar-EG') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-600">
                <span className="text-3xl block mb-2 opacity-30">🧾</span>
                لا توجد تكاليف مسجلة
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ Location Card ══ */}
      <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">📍 مكان الفعالية</h3>
        {location ? (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <span className="font-bold text-lg text-white">{location.name}</span>
              {location.mapUrl && (
                <a href={location.mapUrl} target="_blank" rel="noreferrer" className="text-blue-400 bg-blue-500/10 p-2 rounded-lg hover:bg-blue-500/20 transition text-xs">
                  🗺️ الخريطة
                </a>
              )}
            </div>
            {location.offers && (location.offers as any[]).length > 0 && (
              <div className="bg-gray-900/30 rounded-xl p-3 border border-gray-700/20">
                <p className="text-xs font-bold text-gray-500 mb-2">🎁 عروض المكان</p>
                <ul className="text-sm space-y-1.5">
                  {(location.offers as any[]).map((offer: any, i: number) => (
                    <li key={i} className="text-gray-300 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <span>{typeof offer === 'string' ? offer : offer.description || offer.name}</span>
                      {typeof offer !== 'string' && offer.price && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/20">{offer.price} {CURRENCY}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-600 text-sm">لم يتم تحديد مكان لهذه الفعالية</div>
        )}
      </div>

      {/* ══ Drive Integration ══ */}
      <DriveFolderBrowser 
        driveLink={activity.driveLink || ''} 
        activityId={activity.id}
        onDriveLinkCreated={(newLink) => setActivity((prev: any) => ({ ...prev, driveLink: newLink }))}
      />

    </motion.div>
  );
}
