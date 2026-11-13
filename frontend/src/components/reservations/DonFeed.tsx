'use client';

// ══════════════════════════════════════════════════════
// 🤖 «الدون يتابع» — كلّ ما تغيّر في القائمة باسم صاحبه، ومعه تراجع
//
// كلّ سطر: الوقت + جملةٌ جاهزة من الخادم + كلمات العميل + «تراجع» حيث يصحّ.
// وما لم يفهمه الدون (needs_review) يُبرَز بزرّ «حدّد الوقت» يفتح أزرار الوقت لصاحبه.
//
// 🔴 لا سطر هنا يعني «وصل»: الدون يسجّل وقتاً أو اعتذاراً أكّده العميل، ولا يعلّم وصولاً.
// ══════════════════════════════════════════════════════

import { Bot } from 'lucide-react';
import { Empty } from '@/app/admin/whatsapp/wa-ui';
import type { Reservation } from '@/hooks/useReservations';
import { hm, type ResEvent } from './arrival';

/** «يحتاج نظرك» ما زال مفتوحاً: لم يُتراجع عنه، وصاحبه بلا وقتٍ ولم يُحسم حضوره */
export function reviewOpen(e: ResEvent, rows: Reservation[]): boolean {
  if (e.kind !== 'needs_review' || e.undone) return false;
  const r = e.reservationId ? rows.find(x => x.id === e.reservationId) : null;
  return !r || (r.attended == null && !r.etaAt);
}

export default function DonFeed({ events, rows, busyId, onUndo, onPick }: {
  events: ResEvent[];
  rows: Reservation[];
  busyId: number | null;
  onUndo: (e: ResEvent) => void;
  /** «حدّد الوقت» — تفتح بطاقة صاحب الحجز على أزرار الوقت */
  onPick: (reservationId: number) => void;
}) {
  if (!events.length) {
    return <Empty icon={<Bot />} title="لا شيء بعد">حين يردّ عميلٌ على المتابعة يظهر هنا ما سجّله الدون.</Empty>;
  }
  return (
    <div>
      {events.map(e => {
        const review = reviewOpen(e, rows);
        const text = String(e.text || '');
        const showName = !!e.name && !text.includes(e.name);
        const showQuote = !!e.quote && !text.includes(e.quote);
        return (
          <div key={e.id} className={`res-feed${review ? ' review' : ''}${e.undone ? ' undone' : ''}`}>
            <span className="ltr">{hm(e.at)}</span>
            <div className="b">
              <span>
                {showName && <><b>{e.name}</b>{text ? ': ' : ''}</>}
                {text}
                {showQuote && <span className="q"> «{e.quote}»</span>}
                {e.actor === 'staff' && e.actorName && !text.includes(e.actorName) && <span className="q"> — {e.actorName}</span>}
              </span>
              {review && <span className="flag"> يحتاج نظرك</span>}
              {e.undone && <span className="q" style={{ textDecoration: 'none', display: 'inline-block' }}> (تُراجِع عنه)</span>}
              {(review || (e.undoable && !e.undone)) && (
                <div className="acts">
                  {review && e.reservationId != null && (
                    <button type="button" className="wa-btn sm" onClick={() => onPick(e.reservationId!)}>حدّد الوقت</button>
                  )}
                  {e.undoable && !e.undone && (
                    <button type="button" className="lnk" disabled={busyId === e.id} onClick={() => onUndo(e)}>
                      {busyId === e.id ? '…' : 'تراجع'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
