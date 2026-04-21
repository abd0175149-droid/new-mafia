'use client';

import { motion } from 'framer-motion';

// ── أنواع ──
interface ActivityStats {
  revenue: number;
  venueRevenue: number;
  expense: number;
  profit: number;
  attendees: number;
  freeAttendees: number;
  paidAttendees: number;
}

interface ActivityCardProps {
  activity: any;
  stats: ActivityStats;
  onDelete?: () => void;
  onStatusChange?: (newStatus: string) => void;
  onSelect?: () => void;
  onEdit?: () => void;
  userRole?: string;
}

// ── ثوابت ──
const CURRENCY = 'د.أ';

const STATUS_MAP: Record<string, { label: string; bg: string; text: string; border: string }> = {
  planned:   { label: 'مخطط له',   bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20' },
  active:    { label: 'نشط حالياً', bg: 'bg-emerald-500/10', text: 'text-emerald-400',  border: 'border-emerald-500/20' },
  completed: { label: 'مكتمل',     bg: 'bg-gray-500/10',    text: 'text-gray-400',     border: 'border-gray-500/20' },
  cancelled: { label: 'ملغي',      bg: 'bg-rose-500/10',    text: 'text-rose-400',     border: 'border-rose-500/20' },
};

const STATUS_OPTIONS = [
  { value: 'planned', label: 'مخطط له' },
  { value: 'active', label: 'نشط' },
  { value: 'completed', label: 'مكتمل' },
  { value: 'cancelled', label: 'ملغي' },
];

function safeDate(date: any): Date {
  if (!date) return new Date();
  return new Date(date);
}

export default function ActivityCard({ activity, stats, onDelete, onStatusChange, onSelect, onEdit, userRole }: ActivityCardProps) {
  const status = STATUS_MAP[activity.status] || STATUS_MAP.planned;
  const isLocked = activity.isLocked;
  const isLocationOwner = userRole === 'location_owner';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-800/50 border border-gray-700/40 rounded-2xl overflow-hidden hover:border-gray-600/50 transition-all group"
    >
      {/* ── Header ── */}
      <div className="p-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {/* Badge الحالة */}
            <span className={`text-[11px] px-2.5 py-1 rounded-full border ${status.bg} ${status.text} ${status.border} font-medium`}>
              {status.label}
            </span>
            {/* Badge مقفول */}
            {isLocked && (
              <span className="text-[11px] px-2 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                🔒 مقفول
              </span>
            )}
          </div>
          {/* التاريخ */}
          <span className="text-xs text-gray-500 font-mono">
            {safeDate(activity.date).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })}
          </span>
        </div>

        {/* الاسم */}
        <h3 className="text-sm font-bold text-white mb-1 line-clamp-1">{activity.name || 'بدون اسم'}</h3>
        {/* الوصف */}
        {activity.description && (
          <p className="text-xs text-gray-500 line-clamp-1">{activity.description}</p>
        )}
      </div>

      {/* ── الإحصائيات ── */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-2 gap-2 mb-3">
          {/* الحضور */}
          <div className="bg-gray-900/50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-white">{stats.attendees}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">الحضور</div>
          </div>
          {/* الربح */}
          <div className="bg-gray-900/50 rounded-xl p-3 text-center">
            <div className={`text-lg font-bold ${stats.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stats.profit.toLocaleString()}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">{CURRENCY} الربح</div>
          </div>
        </div>

        {/* الحضور المجاني + السعر */}
        <div className="flex items-center justify-between text-[11px] text-gray-500">
          <span>👥 {stats.freeAttendees} مجاني</span>
          <span>💰 {Number(activity.basePrice || 0)} {CURRENCY} / شخص</span>
        </div>
      </div>

      {/* ── أزرار الإجراءات ── */}
      <div className="border-t border-gray-700/30 px-4 py-3 flex items-center justify-between">
        {/* تغيير الحالة */}
        <div>
          {!isLocked && !isLocationOwner && onStatusChange ? (
            <select
              value={activity.status}
              onChange={(e) => onStatusChange(e.target.value)}
              className="text-xs bg-gray-900/50 border border-gray-700/50 rounded-lg px-2 py-1.5 text-gray-300 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          ) : (
            <span className={`text-[11px] px-2 py-1 rounded-md ${status.bg} ${status.text}`}>
              {status.label}
            </span>
          )}
        </div>

        {/* أزرار التعديل/التفاصيل/الحذف */}
        <div className="flex items-center gap-1">
          {/* تعديل */}
          {!isLocked && !isLocationOwner && onEdit && activity.status === 'planned' && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(); }}
              className="p-1.5 rounded-lg text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
              title="تعديل"
            >
              ✏️
            </button>
          )}
          {/* تفاصيل */}
          {onSelect && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(); }}
              className="p-1.5 rounded-lg text-blue-400/70 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
              title="التفاصيل"
            >
              ℹ️
            </button>
          )}
          {/* حذف */}
          {!isLocked && !isLocationOwner && onDelete && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
              className="p-1.5 rounded-lg text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
              title="حذف"
            >
              🗑️
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
