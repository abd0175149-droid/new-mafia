'use client';

// ══════════════════════════════════════════════════════
// 📜 سجلّ الحجز — كلّ تغييرٍ عليه بقناته وفاعله (خطّة التوحيد م٣)
// يجمع سجلّ الحجز (يكتبه مشغّلٌ من أيّ مسار) وسجلّ متابعة الوصول. يُحمَّل عند الفتح فقط.
// ══════════════════════════════════════════════════════

import { useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { apiFetch } from '@/hooks/useReservations';
import { latin } from './ResRow';

export const CHANNEL_LABEL: Record<string, string> = {
  app: '📱 التطبيق', bot: '🤖 الدون', botadmin: '🔒 أدمن البوت', group: '👥 مجموعة صاحبه',
  door: '🚪 الباب', staff: '👤 الإدارة', system: '⚙️ النظام',
};

const STATUS_AR: Record<string, string> = { pending: 'غير مثبّت', confirmed: 'مثبّت', waitlist: 'انتظار' };

function line(e: any): string {
  const d = e.detail || {};
  switch (e.kind) {
    case 'created': return `أُنشئ الحجز — ${latin(String(d.people ?? 1))} ${Number(d.people) > 1 ? 'أشخاص' : 'شخص'}`;
    case 'cancelled': return `أُلغي${e.reason ? ` — ${e.reason}` : ''}`;
    case 'deleted': return 'حُذف كإدخالٍ خاطئ';
    case 'restored': return 'استُرجع';
    case 'status': return `الحالة: ${STATUS_AR[d.from] || d.from || '—'} ← ${STATUS_AR[d.to] || d.to}`;
    case 'people': return `العدد: ${latin(String(d.from ?? '—'))} ← ${latin(String(d.to))}`;
    case 'price': return `السعر: ${d.from ?? 'العاديّ'} ← ${d.to ?? 'العاديّ'}`;
    case 'attended': return d.to === true ? 'تعلّم «حضر»' : d.to === false ? 'تعلّم «لم يحضر»' : 'أُزيل تعليم الحضور';
    case 'seat_added': return `مقعدٌ في التطبيق${d.name ? ` — ${d.name}` : ''}${d.free ? ' (مجّانيّ)' : ''}`;
    case 'seat_removed': return `أُزيل مقعد التطبيق${d.name ? ` — ${d.name}` : ''}`;
    case 'paid': return `دُفع${d.amount != null ? ` ${d.amount} د.أ` : ''}${d.name ? ` — ${d.name}` : ''}`;
    case 'unpaid': return 'أُلغي تعليم الدفع';
    case 'loyalty': return '🎁 طُبّقت مكافأة الولاء';
    case 'loyalty_back': return '🎁 أُعيدت مكافأة الولاء';
    case 'wl_offered': return `🪑 عُرض عليه مقعد${d.mins ? ` لمدّة ${d.mins} دقيقة` : ''}`;
    case 'wl_skipped': return 'اعتذر عن المقعد المعروض — آخر الدور';
    case 'wl_expired': return 'انتهت مهلة المقعد المعروض — آخر الدور';
    case 'moved': return `🔀 نُقل من «${d.fromName || d.from}» إلى «${d.toName || d.to}»${d.overCap ? ' (فوق السعة)' : ''}`;
    case 'price_manual': return d.price == null ? `أُعيد للسعر العاديّ${e.reason ? ` — ${e.reason}` : ''}` : `سعرٌ يدويّ ${d.price} د.أ${e.reason ? ` — ${e.reason}` : ''}`;
    case 'over_cap': return `ثُبّت فوق السعة${e.reason ? ` — ${e.reason}` : ''}`;
    case 'offer_manual': return d.promoId == null ? `أُزيل العرض يدويّاً${e.reason ? ` — ${e.reason}` : ''}` : `طُبّق «${d.name || 'عرض'}» يدويّاً بـ${d.price} د.أ${e.reason ? ` — ${e.reason}` : ''}`;
    case 'loyalty_manual': return `${d.on === false ? 'أُعيدت زيارة الولاء' : '🎟️ طُبّقت زيارة الولاء'}${e.reason ? ` — ${e.reason}` : ''}`;
    case 'eta_set': return `وقت الوصول${e.reason ? ` — «${e.reason}»` : ''}`;
    case 'eta_cleared': return 'أُزيل وقت الوصول';
    case 'declined': return 'اعتذر عن الحضور';
    case 'followup_sent': return 'أرسل الدون سؤال المتابعة';
    case 'late_reminder': return 'تذكيرٌ بالتأخّر';
    case 'needs_review': return 'يحتاج مراجعة';
    default: return e.kind;
  }
}

function when(iso: string): string {
  const d = new Date(iso);
  return latin(d.toLocaleString('ar-JO-u-nu-arab', { timeZone: 'Asia/Amman', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }));
}

export default function BookingTimeline({ resId }: { resId: number }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toggle = async () => {
    const next = !open; setOpen(next);
    if (next && rows === null) {
      try {
        setRows(await apiFetch(`/api/reservations/${resId}/timeline`));
      } catch (e: any) { setErr(e?.message || 'تعذّر التحميل'); setRows([]); }
    }
  };
  return (
    <div className="res-tl">
      <button type="button" className="res-tl-head" aria-expanded={open} onClick={toggle}>
        <History /><span>سجلّ الحجز</span><ChevronDown className={open ? 'up' : ''} />
      </button>
      {open && (
        <ol className="res-tl-list">
          {rows === null && <li className="res-fine">يُحمَّل…</li>}
          {err && <li className="res-fine">{err}</li>}
          {rows && !rows.length && !err && <li className="res-fine">لا سجلّ بعد — يبدأ السجلّ من هذا الإصدار</li>}
          {rows?.map((e) => (
            <li key={e.key} className={`k-${e.kind}`}>
              <span className="t">{line(e)}</span>
              <span className="m">{[e.channel ? CHANNEL_LABEL[e.channel] || e.channel : null, e.actor && e.actor !== 'system' ? e.actor : null, when(e.at)].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
