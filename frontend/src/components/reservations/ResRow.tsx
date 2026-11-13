'use client';

// ══════════════════════════════════════════════════════
// 📋 صفُّ حجزٍ واحد — ٧٦ بكسل على الهاتف، ٦٠ في أعمدة الحاسوب
//
// 🔴 الاسمُ وحده على سطره فلا يُقصّ بسبب الشارات — الشاراتُ في السطر الثاني.
//
// 🔴 السحبُ لتعليم الحضور (قرار المالك):
//    • السحبُ يبدأ فقط بعد تجاوز عتبةٍ **أفقيّةٍ أوضح من العموديّة** — وإلّا
//      اختطف كلَّ محاولة تمريرٍ للقائمة داخل WebView.
//    • ويُلغى إن غلبت الحركةُ العموديّة، فيعود الصفّ ولا يُعلَّم شيء.
//    • والاتّجاهُ منطقيٌّ في RTL: السحبُ إلى **اليسار** (باتّجاه التقدّم) = حضر،
//      وإلى **اليمين** (رجوعاً) = لم يحضر.
//    • ولمن لا يعرف السحب: النقرةُ تفتح بطاقةً فيها الزرّان كبيرَين.
//
// ⏱ طرفُ الصفّ يقول أين صاحبه الآن: شريحةُ وقت الوصول لمن في الطريق (حمراء إن
//    تجاوز وقته)، وحالةُ رسالة المتابعة لمن لم يردّ، وعلامةٌ لمن وصل أو اعتذر.
// ══════════════════════════════════════════════════════

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Armchair, BellOff, BookUser, Check, CheckCheck, Clock, Smartphone, StickyNote, X,
} from 'lucide-react';
import { statusMeta, resStatus, isWaSent, waAgo } from '@/lib/reservation-status';
import { Badge } from '@/app/admin/whatsapp/wa-ui';
import type { Reservation } from '@/hooks/useReservations';
import { arrivalGroup, etaLabel, followupState, hm, num, peopleLabel } from './arrival';

const AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
/** أرقام عربيّة — باقية لوضع الباب الذي يستوردها */
export const ar = (v: any) => String(v ?? 0).replace(/[0-9]/g, d => AR[+d]);
/** يردّ أيّ رقمٍ عربيّ إلى لاتينيّ (دوالّ المكتبة المشتركة تكتب بالعربيّة) */
export const latin = (s: string) => String(s ?? '').replace(/[٠-٩]/g, d => String(AR.indexOf(d)));

/** المسافةُ التي يُعتدّ بها فعلاً */
const TRIGGER = 84;
/** عتبةُ البدء — أفقيٌّ أوضحُ من عموديٍّ بمرّةٍ ونصف قبل أن نأخذ الإيماءة */
const START = 12;

export const initial = (name: string | null | undefined) => (String(name || '').trim()[0] || '+');

export default function ResRow({ r, now, onOpen, onAttend, dense, selected, swipe = true, arrival = true }: {
  r: Reservation;
  /** اللحظة الحاليّة — تتجدّد كلّ ٣٠ث من الصفحة فتبقى «بعد ١٠ د» و«تأخّر» صحيحتين */
  now: number;
  onOpen: (r: Reservation) => void;
  onAttend: (id: number, v: boolean | null) => void;
  /** صفّ أعمدة الحاسوب: أقصر وبلا سحب */
  dense?: boolean;
  selected?: boolean;
  swipe?: boolean;
  /** false: لا شريحة وقت ولا حالة متابعة */
  arrival?: boolean;
}) {
  const [dx, setDx] = useState(0);
  const st = resStatus(r);
  const meta = statusMeta(r);
  // بلا مجموعات وصول («كلّ الفعاليّات»): وقتُ فعاليّةٍ مضت لا يُقرأ «متأخّراً» اليوم — تبقى علامة الحضور وحدها
  const g0 = arrivalGroup(r);
  const group = arrival || g0 === 'arrived' || g0 === 'declined' ? g0 : 'other';
  const eta = group === 'onway' ? etaLabel(r.etaAt, now) : null;
  const fu = group === 'silent' ? followupState(r) : null;

  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<'none' | 'x' | 'y'>('none');

  const onDown = (e: React.PointerEvent) => {
    if (!swipe) return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = 'none';
  };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x, my = e.clientY - s.y;
    if (axis.current === 'none') {
      if (Math.abs(my) > START && Math.abs(my) > Math.abs(mx)) { axis.current = 'y'; return; }
      if (Math.abs(mx) > START && Math.abs(mx) > Math.abs(my) * 1.5) {
        axis.current = 'x';
        try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* لا شيء */ }
      } else return;
    }
    if (axis.current !== 'x') return;
    // مقاومةٌ بعد العتبة: لا ينزلق الصفّ بلا حدّ
    const capped = Math.sign(mx) * Math.min(Math.abs(mx), TRIGGER + (Math.abs(mx) - TRIGGER) * 0.25);
    setDx(Math.abs(mx) > TRIGGER ? capped : mx);
  };
  const onUp = () => {
    if (axis.current === 'x' && Math.abs(dx) >= TRIGGER) {
      // RTL: يساراً = تقدّمٌ = حضر · يميناً = رجوعٌ = لم يحضر
      const want = dx < 0;
      onAttend(r.id, r.attended === want ? null : want);
    }
    start.current = null; axis.current = 'none'; setDx(0);
  };

  const revealYes = dx < 0;
  const armed = Math.abs(dx) >= TRIGGER;

  // ── السطر الثاني: العدد · من أين جاء الوقت أو ما حال المتابعة ──
  const people = peopleLabel(r.peopleCount);
  let context: string | null = null;
  if (group === 'onway') {
    const quote = r.etaNote ? `«${r.etaNote}»` : null;
    context = r.etaSource === 'bot' ? (quote || 'سجّله الدون من ردّه') : (quote || 'سجّله موظّف');
  } else if (group === 'silent') {
    context = fu ? fu.text : 'لم تُرسل له متابعة';
  } else if (group === 'declined' && r.declinedAt) {
    context = r.declinedVia === 'followup' ? `اعتذر للدون ${hm(r.declinedAt)}` : `لن يحضر · ${hm(r.declinedAt)}`;
  }

  const waSt = (r as any).waStatus as string | undefined;
  const job = (r as any).confirmJob as { status?: string; dueAt?: string; reason?: string } | undefined;
  const line = (r as any).lineStatus as string | undefined;

  return (
    <div className="res-swipe">
      {/* ما يظهر خلف الصفّ أثناء السحب */}
      {dx !== 0 && (
        <div className={`res-reveal ${revealYes ? 'yes' : 'no'}${armed ? ' armed' : ''}`}>
          {revealYes ? <><Check /> حضر</> : <><X /> لم يحضر</>}
        </div>
      )}

      <motion.button
        type="button"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={() => { if (axis.current !== 'x' && dx === 0) onOpen(r); }}
        animate={{ x: dx }}
        transition={dx === 0 ? { type: 'spring', stiffness: 520, damping: 38 } : { duration: 0 }}
        aria-current={selected ? 'true' : undefined}
        className={`res-row${dense ? ' dense' : ''}${eta?.late ? ' late' : ''}`}
      >
        <span className={`wa-avatar sm${r.playerId ? ' linked' : ''}`} aria-hidden="true">{initial(r.contactName)}</span>

        <span className="t">
          <span className="nm">{r.contactName || <span className="ltr">{r.phone}</span>}</span>
          <span className="sub">
            <span>{people}</span>
            {context && <span>· {context}</span>}
            {!dense && r.phone && r.contactName && <span className="ltr">{r.phone}</span>}
            {/* مجموعةٌ انطوت: حجزَ لأصدقائه ثمّ حجز كلٌّ منهم لنفسه، فطُوي عددُه إلى واحد. الرقم الأصليّ يبقى ظاهراً. */}
            {(r.companionsCollapsed ?? 0) > 0 && (
              <Badge tone="info" title="كان حاجزاً لمجموعة، وانطوى عددُه بعد أن حجز أصدقاؤه لأنفسهم — الرقم الأصليّ محفوظ">
                <Armchair /> كان {num(1 + (r.companionsCollapsed ?? 0))}
              </Badge>
            )}
            {st !== 'confirmed' && <Badge tone={st === 'waitlist' ? 'violet' : 'gold'}>{meta.short}</Badge>}
            {/* رسالة يدويّة أُرسلت — الوقتُ جزءٌ من الشارة: «أُرسلت» وحدها لا تميّز اليوم من الأسبوع الماضي */}
            {isWaSent(r) && (
              <Badge tone="ok" title={`رسالةُ واتساب${r.waSentBy ? ' — ' + r.waSentBy : ''}`}>
                <Check /> {latin(waAgo(r.waSentAt))}
              </Badge>
            )}
            {/* رسالة من النظام: في الطابور / قُرئت / تعذّرت */}
            {(waSt === 'queued' || waSt === 'sending') && <span title="رسالة الحجز في طابور رقم الأعمال"><Clock /></span>}
            {waSt === 'read' && <span className="info" title="قرأ رسالة الحجز"><CheckCheck /></span>}
            {waSt === 'failed' && <span className="danger" title="تعذّر إرسال رسالة الحجز"><X /></span>}
            {/* رسالة التثبيت التلقائيّة: مجدولة متى · تعذّرت ولماذا */}
            {job && !isWaSent(r) && (job.status === 'pending' || job.status === 'sending') && (
              <Badge tone="info" title="رسالة التثبيت مجدولة — فكّ التثبيت قبلها يلغيها">
                <Clock /> <span className="ltr">{hm(job.dueAt)}</span>
              </Badge>
            )}
            {job && !isWaSent(r) && (job.status === 'failed' || job.status === 'skipped') && (
              <Badge tone={job.status === 'failed' ? 'danger' : 'warn'}
                title={`رسالة التثبيت: ${job.reason || (job.status === 'failed' ? 'تعذّرت' : 'لم تُرسل')}`}>
                <X /> {job.reason || 'لم تُرسل'}
              </Badge>
            )}
            {r.appConfirmed && <span title="تأكّد من التطبيق"><Smartphone /></span>}
            {/* له محادثة مع خطّ الأعمال — إرساله إليه ليس محادثةً باردة */}
            {(line === 'two_way' || line === 'has_chat') && (
              <span className="ok" title={line === 'two_way' ? 'راسَلنا على خطّ الأعمال — ليست محادثةً باردة' : 'له محادثة سابقة على خطّ الأعمال'}><BookUser /></span>
            )}
            {r.remindOptIn === false && <span title="طلب عدم إرسال تذكيرات"><BellOff /></span>}
            {r.notes && <span title={r.notes}><StickyNote /></span>}
          </span>
        </span>

        {(eta || fu || group === 'arrived' || group === 'declined') && (
          <span className="end">
            {eta && <span className={`res-eta${eta.late ? ' late' : ''}`}>{eta.text}</span>}
            {fu && <Badge tone={fu.tone}>{fu.short}</Badge>}
            {group === 'arrived' && <span className="res-mark yes" title="حضر"><Check /></span>}
            {group === 'declined' && <span className="res-mark no" title="لم يحضر"><X /></span>}
          </span>
        )}
      </motion.button>
    </div>
  );
}
