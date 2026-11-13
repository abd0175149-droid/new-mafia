'use client';

// ══════════════════════════════════════════════════════
// الأنشطة — أدوات مشتركة بين القائمة وصفحة التفاصيل
// (جلب، تنسيق أرقام وتواريخ بتوقيت عمّان، دخول الغرفة، أكورديون)
// ══════════════════════════════════════════════════════

import { useRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Tone } from '../../whatsapp/wa-ui';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
export const CURRENCY = 'د.أ';
const LOC = 'ar-JO-u-nu-latn';
const TZ = 'Asia/Amman';

export function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
export function getUser(): any {
  try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
}

export async function apiFetch(path: string, opts?: RequestInit) {
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

// ── تنسيق ──
const valid = (d: any) => { const x = d ? new Date(d) : null; return x && !isNaN(x.getTime()) ? x : null; };
export const num = (n: any) => Number(n || 0).toLocaleString(LOC, { maximumFractionDigits: 2 });
export const fmtDay = (d: any) => valid(d)?.toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }) ?? '—';
export const fmtDayShort = (d: any) => valid(d)?.toLocaleDateString(LOC, { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) ?? '—';
export const fmtTime = (d: any) => valid(d)?.toLocaleTimeString(LOC, { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }) ?? '';
export const fmtDateTime = (d: any) => valid(d)?.toLocaleString(LOC, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }) ?? '—';
/** yyyy-mm-dd بتوقيت عمّان */
export const ymd = (d: any) => valid(d)?.toLocaleDateString('en-CA', { timeZone: TZ }) ?? '';
/** دقائق منذ منتصف الليل بتوقيت عمّان */
export function ammanMinutes(d: Date = new Date()): number {
  const [h, m] = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).split(':').map(Number);
  return (h % 24) * 60 + m;
}
/** فرق الأيّام (بتقويم عمّان) بين اليوم وموعدٍ ما — سالب لما فات */
export function daysUntil(d: any): number | null {
  const a = ymd(d); const b = ymd(new Date());
  if (!a || !b) return null;
  return Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
}

// ── الحالة ──
export const STATUS_META: Record<string, { label: string; tone?: Tone }> = {
  planned: { label: 'قادمة', tone: 'info' },
  active: { label: 'جارية', tone: 'ok' },
  completed: { label: 'منتهية' },
  cancelled: { label: 'ملغاة', tone: 'danger' },
};
export const STATUS_OPTIONS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'planned', label: 'مخطَّط له', hint: 'قادم ويقبل الحجز' },
  { value: 'active', label: 'نشط', hint: 'جارٍ الآن' },
  { value: 'completed', label: 'مكتمل', hint: 'انتهى' },
  { value: 'cancelled', label: 'ملغى', hint: 'يُعرض عليك من ستصله رسالة الإلغاء قبل التأكيد' },
];

/**
 * دخول غرفة القائد — نفس آليّة صفحة التفاصيل القديمة (sessionStorage ثمّ /leader)،
 * لكن في التبويب نفسه. تحميلٌ كامل للصفحة كما كان يفعل التبويب الجديد.
 */
export function enterRoom(room: any, activityId: number) {
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
  window.location.assign('/leader');
}

/** يركّب محتواه عند أوّل ظهور ثمّ يخفيه فقط — فلا تضيع حالة غير محفوظة عند تبديل المرحلة */
export function Show({ when, children }: { when: boolean; children: ReactNode }) {
  const seen = useRef(false);
  if (when) seen.current = true;
  if (!seen.current) return null;
  return <div className="acts-show" hidden={!when}>{children}</div>;
}

/** قسم يُفتح بنقرة. المحتوى يُركَّب عند أوّل فتح ويبقى مركّباً بعدها. */
export function Acc({ id, title, icon, end, open, onToggle, children }: {
  id: string; title: ReactNode; icon?: ReactNode; end?: ReactNode; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  const seen = useRef(false);
  if (open) seen.current = true;
  return (
    <section id={`sec-${id}`} className="acts-sec">
      <button type="button" className="wa-acc" aria-expanded={open} aria-controls={`sec-${id}-body`} onClick={onToggle}>
        {icon}
        <span className="grow trunc">{title}</span>
        <span className="end">{end}<ChevronDown className={open ? 'acts-flip' : undefined} /></span>
      </button>
      {seen.current && <div id={`sec-${id}-body`} className="acts-accbody" hidden={!open}>{children}</div>}
    </section>
  );
}
