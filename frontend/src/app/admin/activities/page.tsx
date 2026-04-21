'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ActivityCard from '../components/ActivityCard';
import ActivityForm from '../components/ActivityForm';
import BookingForm from '../components/BookingForm';
import EditActivityForm from '../components/EditActivityForm';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
function getUser() {
  try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
}

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

// ── تحديث الحالة التلقائي ──
function getAutoStatus(dateStr: string, currentStatus: string): string | null {
  if (currentStatus === 'cancelled') return null;
  const now = new Date();
  const actDate = new Date(dateStr);
  const nextDay = new Date(actDate);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(0, 0, 0, 0);

  let newStatus = currentStatus;
  if (now >= nextDay) newStatus = 'completed';
  else if (now >= actDate) newStatus = 'active';
  else newStatus = 'planned';

  return newStatus !== currentStatus ? newStatus : null;
}

// ── Pagination ──
const PAGE_SIZE_OPTIONS = [6, 9, 12, 24];

export default function ActivitiesPage() {
  // ── State ──
  const [activities, setActivities] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [costs, setCosts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Forms
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState<any | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState('planned');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);

  // Detail view
  const [selectedActivity, setSelectedActivity] = useState<any | null>(null);

  const user = useMemo(() => getUser(), []);

  // ── Data Fetch ──
  const fetchAll = useCallback(async () => {
    try {
      const [acts, bks, csts, locs] = await Promise.all([
        apiFetch('/api/activities'),
        apiFetch('/api/bookings'),
        apiFetch('/api/costs'),
        apiFetch('/api/locations'),
      ]);
      setActivities(acts);
      setBookings(bks);
      setCosts(csts);
      setLocations(locs);

      // Staff (admin only)
      try { setStaffList(await apiFetch('/api/staff')); } catch {}

      // Auto-status update
      for (const act of acts) {
        const newStatus = getAutoStatus(act.date, act.status);
        if (newStatus) {
          try {
            await apiFetch(`/api/activities/${act.id}`, {
              method: 'PUT',
              body: JSON.stringify({ status: newStatus }),
            });
          } catch {}
        }
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // ── Computed Stats ──
  const getActivityStats = useCallback((activity: any) => {
    const actBookings = bookings.filter(b => b.activityId === activity.id);
    const actCosts = costs.filter(c => c.activityId === activity.id);

    const revenue = actBookings.reduce((sum: number, b: any) => sum + (b.isPaid ? Number(b.paidAmount || 0) : 0), 0);
    const venueRevenue = 0; // TODO: compute from offers
    const expense = actCosts.reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);

    return {
      revenue,
      venueRevenue,
      expense,
      profit: revenue - expense,
      attendees: actBookings.reduce((sum: number, b: any) => sum + (b.count || 1), 0),
      freeAttendees: actBookings.filter((b: any) => b.isFree).reduce((sum: number, b: any) => sum + (b.count || 1), 0),
      paidAttendees: actBookings.filter((b: any) => b.isPaid && !b.isFree).reduce((sum: number, b: any) => sum + (b.count || 1), 0),
    };
  }, [bookings, costs]);

  // ── Filtered + Sorted ──
  const filteredActivities = useMemo(() => {
    let result = [...activities];

    // فلتر الحالة
    if (filterStatus !== 'all') {
      result = result.filter(a => a.status === filterStatus);
    }

    // فلتر التاريخ
    if (filterDateFrom) {
      result = result.filter(a => new Date(a.date) >= new Date(filterDateFrom));
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59);
      result = result.filter(a => new Date(a.date) <= to);
    }

    return result;
  }, [activities, filterStatus, filterDateFrom, filterDateTo]);

  // ── Pagination ──
  const totalPages = Math.ceil(filteredActivities.length / pageSize) || 1;
  const paginatedData = filteredActivities.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { setCurrentPage(1); }, [filterStatus, filterDateFrom, filterDateTo, pageSize]);

  // ── Handlers ──
  async function handleCreateActivity(data: any) {
    await apiFetch('/api/activities', { method: 'POST', body: JSON.stringify(data) });
    setShowActivityForm(false);
    fetchAll();
  }

  async function handleCreateBooking(data: any) {
    await apiFetch('/api/bookings', { method: 'POST', body: JSON.stringify(data) });
    setShowBookingForm(false);
    fetchAll();
  }

  async function handleEditActivity(id: number, data: any) {
    await apiFetch(`/api/activities/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    setShowEditForm(null);
    fetchAll();
  }

  async function handleStatusChange(id: number, newStatus: string) {
    await apiFetch(`/api/activities/${id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
    fetchAll();
  }

  async function handleDelete(id: number) {
    const confirmation = prompt('تأكيد الحذف؟ اكتب "نعم" للمتابعة:');
    if (confirmation !== 'نعم') return;
    try {
       await apiFetch(`/api/activities/${id}`, { method: 'DELETE' });
       fetchAll();
       alert('تم الحذف بنجاح');
    } catch (err: any) {
       alert('فشل الحذف: ' + (err.message || ''));
    }
  }

  const hasActiveFilters = filterStatus !== 'planned' || filterDateFrom || filterDateTo;

  function clearFilters() {
    setFilterStatus('planned');
    setFilterDateFrom('');
    setFilterDateTo('');
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* ══ Header ══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">الأنشطة المجدولة</h1>
          <p className="text-gray-400 text-sm mt-1">إدارة الجلسات والفعاليات</p>
        </div>
        {user.role !== 'location_owner' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowBookingForm(!showBookingForm); setShowActivityForm(false); }}
              className="px-4 py-2.5 border border-gray-600/50 text-gray-300 rounded-xl text-sm hover:bg-gray-800 transition"
            >
              📅 حجز جديد
            </button>
            <button
              onClick={() => { setShowActivityForm(!showActivityForm); setShowBookingForm(false); }}
              className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-rose-600 text-white rounded-xl text-sm font-bold hover:opacity-90 transition"
            >
              + إضافة نشاط جديد
            </button>
          </div>
        )}
      </div>

      {/* ══ Forms ══ */}
      <AnimatePresence>
        {showActivityForm && (
          <ActivityForm
            locations={locations}
            onSubmit={handleCreateActivity}
            onCancel={() => setShowActivityForm(false)}
          />
        )}
        {showBookingForm && (
          <BookingForm
            activities={activities}
            locations={locations}
            staffList={staffList}
            onSubmit={handleCreateBooking}
            onCancel={() => setShowBookingForm(false)}
            userRole={user.role}
            username={user.username}
          />
        )}
        {showEditForm && (
          <EditActivityForm
            activity={showEditForm}
            locations={locations}
            onSubmit={handleEditActivity}
            onCancel={() => setShowEditForm(null)}
          />
        )}
      </AnimatePresence>

      {/* ══ Filters Bar ══ */}
      <div className="flex items-center gap-3 flex-wrap bg-gray-800/30 border border-gray-700/30 rounded-xl py-3 px-4">
        {/* حالة */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30"
        >
          <option value="all">كل الحالات</option>
          <option value="planned">مخطط له</option>
          <option value="active">نشط</option>
          <option value="completed">مكتمل</option>
          <option value="cancelled">ملغي</option>
        </select>

        {/* من تاريخ */}
        <input
          type="date"
          value={filterDateFrom}
          onChange={e => setFilterDateFrom(e.target.value)}
          placeholder="من تاريخ"
          className="px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30"
        />

        {/* إلى تاريخ */}
        <input
          type="date"
          value={filterDateTo}
          onChange={e => setFilterDateTo(e.target.value)}
          placeholder="إلى تاريخ"
          className="px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30"
        />

        {/* عداد */}
        <span className="text-xs text-gray-500 mr-auto">
          {filteredActivities.length} من {activities.length} نشاط
        </span>

        {/* مسح */}
        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-amber-400 transition">
            ✕ مسح الفلاتر
          </button>
        )}
      </div>

      {/* ══ Cards Grid ══ */}
      {paginatedData.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4 opacity-30">📅</div>
          <p className="text-gray-500 font-medium">لا توجد أنشطة حالياً</p>
          <p className="text-gray-600 text-sm mt-1">ابدأ بإضافة نشاط جديد</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedData.map((activity: any) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              stats={getActivityStats(activity)}
              userRole={user.role}
              onStatusChange={(newStatus) => handleStatusChange(activity.id, newStatus)}
              onSelect={() => {
                // TODO: navigate to detail page or show inline
                window.location.href = `/admin/activities/${activity.id}`;
              }}
              onEdit={() => setShowEditForm(activity)}
              onDelete={() => handleDelete(activity.id)}
            />
          ))}
        </div>
      )}

      {/* ══ Pagination ══ */}
      {filteredActivities.length > pageSize && (
        <div className="flex items-center justify-between flex-wrap gap-3 bg-gray-800/30 border border-gray-700/30 rounded-xl py-3 px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition disabled:opacity-30"
            >
              ◄
            </button>
            <span className="text-sm text-gray-400">صفحة {currentPage} من {totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition disabled:opacity-30"
            >
              ►
            </button>
          </div>
          <div className="flex items-center gap-1">
            {PAGE_SIZE_OPTIONS.map(size => (
              <button
                key={size}
                onClick={() => setPageSize(size)}
                className={`px-2.5 py-1 rounded-lg text-xs transition ${
                  pageSize === size
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'text-gray-500 hover:text-white'
                }`}
              >
                {size}
              </button>
            ))}
            <span className="text-xs text-gray-600 mr-1">لكل صفحة</span>
          </div>
        </div>
      )}
    </div>
  );
}
