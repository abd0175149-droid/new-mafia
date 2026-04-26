'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import DriveFolderBrowser from '../../components/DriveFolderBrowser';

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
// 🎮 قسم الغرف المرتبطة بالنشاط
// ══════════════════════════════════════════════════════
function RoomsSection({ activityId, activityName }: { activityId: number; activityName: string }) {
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const fetchRooms = async () => {
    try {
      const data = await apiFetch(`/api/activities/${activityId}/rooms`);
      setRooms(data);
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRooms(); }, [activityId]);

  const handleAddRoom = async () => {
    setAdding(true);
    try {
      const newRoom = await apiFetch(`/api/activities/${activityId}/add-room`, {
        method: 'POST',
        body: JSON.stringify({ maxPlayers: 10 }),
      });
      setRooms(prev => [newRoom, ...prev]);
    } catch (err: any) {
      alert('فشل إنشاء الغرفة: ' + err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteRoom = async (sessionId: number) => {
    if (!confirm('⚠️ هل تريد حذف هذه الغرفة نهائياً؟ لن يمكن استرجاعها.')) return;
    try {
      await apiFetch(`/api/activities/${activityId}/rooms/${sessionId}`, {
        method: 'DELETE',
      });
      setRooms(prev => prev.filter(r => r.id !== sessionId));
    } catch (err: any) {
      alert('فشل الحذف: ' + err.message);
    }
  };

  const handleCloseRoom = async (sessionId: number) => {
    if (!confirm('🔒 هل تريد إغلاق هذه الغرفة؟')) return;
    try {
      await apiFetch(`/api/activities/${activityId}/rooms/${sessionId}/close`, {
        method: 'PATCH',
      });
      setRooms(prev => prev.map(r => r.id === sessionId ? { ...r, isActive: false, status: 'closed' } : r));
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
    // حفظ بيانات الغرفة في sessionStorage للليدر
    sessionStorage.setItem('leader_room_entry', JSON.stringify({
      sessionCode: room.sessionCode,
      displayPin: room.displayPin,
      sessionName: room.sessionName,
      sessionId: room.id,
      activityId,
    }));
    window.open('/leader', '_blank');
  };

  return (
    <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          🎮 غرف اللعبة
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-400">{rooms.length}</span>
        </h3>
        <button
          onClick={handleAddRoom}
          disabled={adding}
          className="text-xs px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition disabled:opacity-50"
        >
          {adding ? '⏳ جارٍ...' : '➕ إضافة غرفة'}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" />
        </div>
      ) : rooms.length > 0 ? (
        <div className="space-y-3">
          {rooms.map((room, i) => (
            <motion.div
              key={room.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center justify-between p-3.5 bg-gray-900/50 border border-gray-700/30 rounded-xl hover:border-gray-600/40 transition"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-xl">
                  🕹️
                </div>
                <div>
                  <p className="text-white font-bold text-sm">{room.sessionName}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-gray-500 font-mono flex items-center gap-1">
                      🔑 كود: <span className="text-amber-400 font-bold">{room.sessionCode}</span>
                    </span>
                    <span className="text-xs text-gray-500 font-mono flex items-center gap-1">
                      🔒 PIN: <span className="text-blue-400">{room.displayPin || '—'}</span>
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      room.isActive
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                        : 'bg-gray-500/15 text-gray-500 border-gray-600/20'
                    }`}>
                      {room.isActive ? '🟢 نشطة' : '⚪ مغلقة'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* نسخ الكود */}
                <button
                  onClick={() => copyCode(room.sessionCode, room.id)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-600/40 text-gray-400 hover:text-white hover:border-gray-500 transition"
                  title="نسخ كود الغرفة"
                >
                  {copiedId === room.id ? '✅' : '📋'}
                </button>

                {/* دخول الغرفة (توجيه للليدر) */}
                <button
                  onClick={() => enterRoom(room)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition flex items-center gap-1"
                  title="الدخول كقائد"
                >
                  🎮 دخول
                </button>

                {/* إغلاق الغرفة */}
                {room.isActive && (
                  <button
                    onClick={() => handleCloseRoom(room.id)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition"
                    title="إغلاق الغرفة"
                  >
                    🔒 إغلاق
                  </button>
                )}

                {/* حذف الغرفة نهائياً */}
                <button
                  onClick={() => handleDeleteRoom(room.id)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition"
                  title="حذف الغرفة نهائياً"
                >
                  🗑️ حذف
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-gray-600 text-sm">
          <span className="text-3xl block mb-2 opacity-30">🎮</span>
          لا توجد غرف مرتبطة بهذا النشاط
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

  const [activity, setActivity] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [costs, setCosts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingsOpen, setBookingsOpen] = useState(false);
  const [costsOpen, setCostsOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [act, bks, csts, locs] = await Promise.all([
          apiFetch(`/api/activities/${activityId}`),
          apiFetch(`/api/bookings?activityId=${activityId}`),
          apiFetch(`/api/costs?activityId=${activityId}`),
          apiFetch('/api/locations'),
        ]);
        setActivity(act);
        setBookings(bks);
        setCosts(csts);
        setLocations(locs);
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
            <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
              <span>📅 {safeDate(activity.date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              <span>🎫 {Number(activity.basePrice || 0)} {CURRENCY} / شخص</span>
              {location && <span>📍 {location.name}</span>}
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

      {/* ══ الغرف المرتبطة (متعددة) ══ */}
      <RoomsSection activityId={activity.id} activityName={activity.name} />

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
            ]} />
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between p-2.5 bg-gray-900/60 rounded-xl">
                <span className="text-gray-400 text-sm">إجمالي الحضور</span>
                <span className="font-bold text-lg text-white">
                  {totalAttendees} <span className="text-xs text-gray-500 font-normal">من {actBookings.length} حجز</span>
                </span>
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
            {actBookings.length > 0 ? (
              <>
                <div className="overflow-x-auto border border-gray-700/30 rounded-xl">
                  <table className="w-full text-sm" dir="rtl">
                    <thead>
                      <tr className="bg-gray-900/50 text-gray-500 text-xs">
                        <th className="text-right px-3 py-2.5 font-medium">#</th>
                        <th className="text-right px-3 py-2.5 font-medium">الاسم</th>
                        <th className="text-right px-3 py-2.5 font-medium">الهاتف</th>
                        <th className="text-center px-3 py-2.5 font-medium">العدد</th>
                        <th className="text-center px-3 py-2.5 font-medium">الحالة</th>
                        <th className="text-center px-3 py-2.5 font-medium">المبلغ</th>
                        <th className="text-right px-3 py-2.5 font-medium">المستلم</th>
                        <th className="text-right px-3 py-2.5 font-medium">ملاحظات</th>
                        <th className="text-right px-3 py-2.5 font-medium">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actBookings.map((b: any, i: number) => (
                        <tr key={b.id} className="border-t border-gray-700/20 hover:bg-gray-700/10 transition">
                          <td className="px-3 py-2.5 text-gray-600 text-xs font-mono">{i + 1}</td>
                          <td className="px-3 py-2.5 text-white font-medium">{b.name}</td>
                          <td className="px-3 py-2.5 text-gray-400 text-xs" dir="ltr">{b.phone || '—'}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="bg-gray-700/50 text-gray-300 px-2 py-0.5 rounded text-xs font-bold">{b.count || 1}</span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {b.isFree ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">مجاني</span>
                            ) : b.isPaid ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">مدفوع</span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">غير مدفوع</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center font-medium">
                            {b.isFree ? <span className="text-gray-600">—</span> : (
                              <span className={b.isPaid ? 'text-emerald-400' : 'text-amber-400'}>
                                {Number(b.paidAmount || 0)} {CURRENCY}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-gray-400 text-xs">{b.receivedBy || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs max-w-[150px] truncate" title={b.notes}>{b.notes || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-600 text-xs whitespace-nowrap">
                            {b.createdAt ? safeDate(b.createdAt).toLocaleDateString('ar-EG', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
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
