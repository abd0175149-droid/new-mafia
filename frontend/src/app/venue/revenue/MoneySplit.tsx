'use client';

// شريط «لك / للنادي» وسطراه — مشترَكٌ بين ملخّص الفترة وحساب الفعاليّة كي لا يختلف شكلهما.
// الأرقام من الخادم كما هي؛ هنا عرضٌ فقط.

import { EM, TX, SHARE, f2, pPlayers } from '../ember';
import { Swatch, Amount } from '../ui';

export interface SplitTotals {
  collected: number; venue: number; club: number;
  orders: number; topup: number; water: number; loyalty: number; feeCount: number;
}

export function MoneySplit({ t, emptyText = 'لا شيء محصَّل في هذه الفترة بعد' }: { t: SplitTotals; emptyText?: string }) {
  const collected = t.collected;
  // عرض شريحة المكان: نسبةٌ من المحصَّل محصورة بين 4 و96 كي تبقى الشريحتان مرئيّتين
  const venuePct = collected > 0 ? Math.min(96, Math.max(4, Math.round((t.venue / collected) * 100))) : 0;
  return (
    <>
      {collected > 0 ? (
        <div role="img" aria-label={`لك ${f2(t.venue)} وللنادي ${f2(t.club)}`} className="flex mt-3.5" style={{ gap: 2, height: 14 }}>
          {/* شريحة المكان أوّلاً — في RTL تقع يميناً حيث تبدأ القراءة */}
          <div className="vc-seg" style={{ width: `${venuePct}%`, background: SHARE.venue, borderRadius: '0 4px 4px 0' }} />
          <div style={{ flex: 1, background: SHARE.club, borderRadius: '4px 0 0 4px' }} />
        </div>
      ) : (
        <>
          <div aria-hidden="true" className="mt-3.5" style={{ height: 14, borderRadius: 4, background: EM.line }} />
          <div className="text-[13px] mt-2" style={{ color: TX.dim }}>{emptyText}</div>
        </>
      )}

      <div className="mt-1.5 flex flex-col">
        <div className="flex items-center gap-2.5 py-3" style={{ borderBottom: `1px solid ${EM.line}` }}>
          <Swatch color={SHARE.venue} size={12} />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-extrabold">لك</div>
            <div className="text-[12.5px]" style={{ color: TX.dim }}>
              طلبات <span className="vc-num">{f2(t.orders)}</span> + تكملة حدّ أدنى <span className="vc-num">{f2(t.topup)}</span>
              {t.water > 0 && <> + ماء <span className="vc-num">{f2(t.water)}</span></>}
            </div>
          </div>
          <Amount value={f2(t.venue)} size={20} unit={false} />
        </div>
        <div className="flex items-center gap-2.5 py-3">
          <Swatch color={SHARE.club} size={12} />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-extrabold">للنادي</div>
            <div className="text-[12.5px]" style={{ color: TX.dim }}>
              دخوليّة {pPlayers(t.feeCount)}
              {t.loyalty > 0 && <> − ولاء <span className="vc-num">{f2(t.loyalty)}</span></>}
            </div>
          </div>
          <Amount value={f2(t.club)} size={20} unit={false} />
        </div>
      </div>
    </>
  );
}
