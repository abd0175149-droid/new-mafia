'use client';

// بطاقة نشاط في قائمة الأنشطة (الخيار ب: بطاقات). بطاقة خاصّة بهذه الصفحة —
// ActivityCard القديمة في admin/components لم تُمسّ.

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ListChecks, Lock, MapPin, MoreVertical, Play } from 'lucide-react';
import { Badge, Tile } from '../../whatsapp/wa-ui';
import { daysUntil, fmtDay, fmtTime, num } from './acts-shared';

export interface ActStats {
  revenue: number; expense: number; profit: number;
  attendees: number; freeAttendees: number; paidAttendees: number;
  /** من سُجّل حضورهم عند الباب (bookings.checkedIn) */
  arrived: number;
  /** أشخاص حجزهم مقفول بالسعر المبكّر */
  early: number;
}

function whenBadge(activity: any) {
  if (activity.status === 'active') return <Badge tone="ok"><i className="wa-dot ok" />جارية الآن</Badge>;
  if (activity.status === 'completed') return <Badge>منتهية</Badge>;
  if (activity.status === 'cancelled') return <Badge tone="danger">ملغاة</Badge>;
  const d = daysUntil(activity.date);
  if (d == null) return <Badge>قادمة</Badge>;
  if (d < 0) return <Badge tone="warn">فات موعدها</Badge>;
  if (d === 0) return <Badge tone="gold">اليوم</Badge>;
  if (d === 1) return <Badge tone="info">غداً</Badge>;
  if (d === 2) return <Badge>بعد يومين</Badge>;
  return <Badge>بعد <span className="ltr">{d}</span> {d <= 10 ? 'أيّام' : 'يوماً'}</Badge>;
}

export default function ActCard({ activity, stats, location, activeRooms, canManage, onMenu, onEnterRoom }: {
  activity: any;
  stats: ActStats;
  /** صفّ المكان من قائمة الأماكن — احتياط حين لا يحمل صفّ النشاط اسم مكانه ومدينته */
  location?: any;
  /** الغرف النشطة لهذا النشاط (تُجلب للأنشطة الجارية فقط) */
  activeRooms: any[];
  canManage: boolean;
  onMenu: () => void;
  onEnterRoom: (room: any) => void;
}) {
  const cap = activity.maxCapacity || 20;
  const pct = Math.min(100, Math.round((stats.attendees / cap) * 100));
  const running = activity.status === 'active';
  const over = activity.status === 'completed' || activity.status === 'cancelled';
  const href = `/admin/activities/${activity.id}`;
  const cityName = activity.cityName ?? location?.cityName ?? null;
  const locationName = activity.locationName ?? location?.name ?? null;
  const region = activity.locationRegion ?? location?.region ?? null;
  const place = [locationName, region, cityName].filter(Boolean).join(' · ');
  const ringTone = running ? 'var(--ok)' : over ? 'var(--line-strong)' : pct >= 100 ? 'var(--ok)' : 'var(--gold)';
  const ratio = `${stats.attendees}/${cap}`;

  return (
    <article className={`wa-card acts-card${running ? ' live' : ''}${activity.status === 'cancelled' ? ' off' : ''}`}>
      <div className="acts-top">
        <div
          className={`acts-ring${ratio.length > 5 ? ' sm' : ''}`}
          style={{ '--acts-pct': pct, '--acts-ring': ringTone } as CSSProperties}
          role="img" aria-label={`الحجز ${stats.attendees} من ${cap}`}
        >
          <span>{ratio}</span>
        </div>
        <div className="grow">
          <div className="acts-badges">
            {whenBadge(activity)}
            {activity.isLocked && <Badge tone="danger" title="مقفول إداريّاً — لا تعديل ولا حذف"><Lock />مقفول</Badge>}
          </div>
          <Link href={href} className="acts-ttl">
            <b>{activity.name || 'بدون اسم'}</b>
            <span>{fmtDay(activity.date)}{fmtTime(activity.date) && <> · <span className="ltr">{fmtTime(activity.date)}</span></>}</span>
          </Link>
        </div>
        {canManage && (
          <button type="button" className="wa-iconbtn" aria-label={`إجراءات ${activity.name || 'النشاط'}`} onClick={onMenu}><MoreVertical /></button>
        )}
      </div>

      <div className="acts-place">
        <MapPin />
        <span className="trunc">{place || 'بلا مكان'}</span>
      </div>

      <div className="acts-tiles">
        {running || activity.status === 'completed'
          ? <Tile k="وصلوا" v={num(stats.arrived)} tone="ok" />
          : <Tile k="مثبَّت" v={num(stats.attendees)} />}
        <Tile k="الدخل" v={num(stats.revenue)} />
        {!running && activity.status !== 'completed' && stats.early > 0
          ? <Tile k="سعر مبكّر" v={num(stats.early)} tone="gold" />
          : <Tile k="مجّانيّ" v={num(stats.freeAttendees)} />}
      </div>

      <div className="acts-go">
        {running && activeRooms.length === 1 ? (
          <button type="button" className="wa-btn send" onClick={() => onEnterRoom(activeRooms[0])}><Play />الغرفة</button>
        ) : running && activeRooms.length > 1 ? (
          <Link href={href} className="wa-btn send"><Play />الغرف (<span className="ltr">{activeRooms.length}</span>)</Link>
        ) : (
          <Link href={`/admin/reservations?activityId=${activity.id}`} className="wa-btn"><ListChecks />المتابعة</Link>
        )}
        <Link href={href} className="wa-btn">افتح</Link>
      </div>
    </article>
  );
}
