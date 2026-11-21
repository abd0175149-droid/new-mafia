'use client';

// ══════════════════════════════════════════════════════
// 🌙 «عروض هذه الليلة» — شرائح أعلى المتابعة (خطّة التوحيد م٤-أ · ق٢٣)
// ما ينطبق على هذه الفعاليّة من الفهرس الموحّد: المبكّر، والمجموعة، والولاء. الضغط يفتح الفهرس.
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { apiFetch } from '@/hooks/useReservations';

const ICON: Record<string, string> = { early: '💸', group: '👥', loyalty_visit: '🎟️', loyalty_drink: '☕', loyalty_chips: '🪙' };

export default function TonightOffers({ activityId }: { activityId: number }) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    let live = true;
    apiFetch(`/api/booking-rules/offers/activity/${activityId}`).then((r) => { if (live) setRows(r.offers || []); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [activityId]);
  if (!rows || !rows.length) return null;
  return (
    <div className="res-tonight" role="list" aria-label="عروض هذه الليلة">
      <span className="h">عروض الليلة</span>
      {rows.map((o) => (
        <a key={o.key} role="listitem" href="/admin/booking-rules" className={`c${o.applies ? ' on' : ''}`} title={`${o.rule} — ${o.stackText}`}>
          <span aria-hidden="true">{ICON[o.kind] || '🏷️'}</span>{o.name}<small>{o.note}</small>
        </a>
      ))}
    </div>
  );
}
