'use client';

// ══════════════════════════════════════════════════════
// 🗓️ حساب فعاليّة — داخل «الحساب» (2026-10-30)
// يختار صاحب المكان ليلةً مرّت فيرى حسابها كاملاً: كم حُصّل ولمن، وما بقي،
// وكلّ فاتورة بمن حصّلها ومتى، وما بيع، وما أُسقط من دخوليّات، ومن حجز ومن لعب.
// كلّ رقمٍ من /api/venue/money/night — نفس دفتر «الفواتير» ونفس لقطات «الحساب».
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import { EM, TX, f2, pPlayers, pInvoices, pOrders, nightLabel, hhmm } from '../ember';
import { Icon, Sheet, Btn, Amount, Skeleton, SeatBadge, useVenueApi } from '../ui';
import { MoneySplit } from './MoneySplit';

interface PastNight {
  activityId: number; activityName: string; activityDate: string;
  collected: number; paidCount: number; ordersCount: number; hasOpen: boolean;
}
interface Row {
  key: string; kind: 'open' | 'paid'; playerId: number; playerName: string; seat: number | null;
  invoiceNo: number | null; paidAt: string | null; paidByName: string;
  ordersCount: number; ordersTotal: number; minTopup: number; waterCharge: number;
  loyaltyDiscount: number; gameFee: number; grandTotal: number; isFree: boolean; noInvoice: boolean;
}
interface Account {
  activity: { id: number; name: string; date: string };
  rules: { gameFeeEnabled: boolean; minChargeEnabled: boolean; minimumCharge: number; autoWaterEnabled: boolean; waterPrice: number };
  totals: {
    collected: number; venue: number; club: number; orders: number; topup: number; water: number;
    fees: number; loyalty: number; feeCount: number; paidCount: number; due: number; dueCount: number;
  };
  counts: { booked: number; played: number; free: number; directPaid: number; cancelledOrders: number; cancelledTotal: number };
  rows: Row[];
  items: { name: string; qty: number; amount: number }[];
  waivers: { playerId: number; playerName: string; reason: string; staffName: string; at: string }[];
}

const SHOW_ROWS = 10;
const SHOW_ITEMS = 8;

/** «الخميس 29/10 · 20:00» — تاريخ الفعاليّة بأساس nightLabel ووقتها بتوقيت عمّان */
const whenNight = (d: string) => `${nightLabel(d)} · ${hhmm(d)}`;
const monthKey = (d: string) => new Date(d).toLocaleDateString('ar-JO', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** تفصيل سطر الفاتورة بكلماتٍ قصيرة: «طلبات 7.00 · دخوليّة 3.00» */
function rowParts(r: Row): string {
  const p: string[] = [];
  if (r.ordersTotal > 0) p.push(`طلبات ${f2(r.ordersTotal)}`);
  if (r.minTopup > 0) p.push(`حدّ أدنى ${f2(r.minTopup)}`);
  if (r.waterCharge > 0) p.push(`ماء ${f2(r.waterCharge)}`);
  if (r.gameFee > 0) p.push(`دخوليّة ${f2(r.gameFee)}`);
  if (r.loyaltyDiscount > 0) p.push(`− ولاء ${f2(r.loyaltyDiscount)}`);
  if (r.isFree) p.push('حجز مجّانيّ');
  return p.join(' · ');
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[14px] px-3 py-2.5" style={{ background: EM.ink2, border: `1px solid ${EM.line}` }}>
      <div className="vc-num text-[20px] font-semibold leading-tight">{value}</div>
      <div className="text-[12.5px] mt-0.5" style={{ color: TX.dim }}>{label}</div>
    </div>
  );
}

export function EventAccount({ pickId, onOpenNight }: { pickId: number | null; onOpenNight: (activityId: number) => void }) {
  const { get } = useVenueApi();
  const getRef = useRef(get);
  getRef.current = get;

  const [nights, setNights] = useState<PastNight[] | null>(null);
  const [selId, setSelId] = useState<number | null>(pickId);
  const [acc, setAcc] = useState<Account | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [picker, setPicker] = useState(false);
  const [allRows, setAllRows] = useState(false);
  const [allItems, setAllItems] = useState(false);

  // القائمة مرّةً واحدة؛ وإن لم تُختر ليلةٌ بعد فأحدث ليلة
  useEffect(() => {
    let live = true;
    getRef.current('/api/venue/money/nights').then(r => {
      if (!live) return;
      if (r?.ok) {
        const list = (r.data.nights || []) as PastNight[];
        setNights(list);
        setSelId(s => s ?? list[0]?.activityId ?? null);
      } else { setNights([]); setErr(r?.data?.error || 'تعذّر تحميل الفعاليّات'); }
    }).catch(() => { if (live) { setNights([]); setErr('تعذّر تحميل الفعاليّات — تحقّق من الاتصال'); } });
    return () => { live = false; };
  }, []);

  // نقرةٌ على ليلةٍ في «ليلة بليلة» تختارها هنا
  useEffect(() => { if (pickId) setSelId(pickId); }, [pickId]);

  const load = useCallback(async (id: number, quiet = false) => {
    if (!quiet) { setLoading(true); setAcc(null); }
    const r = await getRef.current(`/api/venue/money/night?activityId=${id}`).catch(() => null);
    if (r?.ok) { setAcc(r.data as Account); setErr(''); }
    else if (!quiet) setErr(r?.data?.error || 'تعذّر تحميل حساب الفعاليّة — تحقّق من الاتصال');
    setLoading(false);
  }, []);

  useEffect(() => { if (selId) { setAllRows(false); setAllItems(false); load(selId); } }, [selId, load]);

  const choose = (id: number) => { setPicker(false); setSelId(id); };
  const sel = nights?.find(x => x.activityId === selId);

  if (nights && nights.length === 0 && !err) {
    return (
      <div className="text-center py-12 text-[14px]" style={{ color: TX.dim }}>
        <Icon name="calendar" size={28} color={TX.dim} style={{ display: 'block', margin: '0 auto 10px' }} />
        لا فعاليّات مرّت في هذا المكان خلال آخر ستّة أشهر
      </div>
    );
  }

  const t = acc?.totals;
  const c = acc?.counts;
  const rowsShown = acc ? (allRows ? acc.rows : acc.rows.slice(0, SHOW_ROWS)) : [];
  const itemsShown = acc ? (allItems ? acc.items : acc.items.slice(0, SHOW_ITEMS)) : [];
  const itemsTotal = acc ? acc.items.reduce((s, x) => s + x.amount, 0) : 0;

  // قائمة الاختيار مقسومةً بالأشهر — صاحب المكان يتذكّر «أوّل الشهر الماضي» لا التاريخ
  const groups: { month: string; list: PastNight[] }[] = [];
  for (const nt of nights ?? []) {
    const m = monthKey(nt.activityDate);
    const g = groups[groups.length - 1];
    if (g && g.month === m) g.list.push(nt); else groups.push({ month: m, list: [nt] });
  }

  return (
    <div className="flex flex-col gap-[18px]">
      {/* ── اختيار الفعاليّة ── */}
      <button type="button" onClick={() => setPicker(true)} disabled={!nights}
        aria-label="اختر فعاليّة"
        className="vc-press flex items-center gap-3 w-full px-3.5 rounded-[16px] text-right"
        style={{ minHeight: 64, background: EM.card, border: `1px solid ${EM.line2}`, color: 'inherit' }}>
        <Icon name="calendar" size={22} color={TX.amberHi} />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-bold" style={{ color: TX.dim }}>الفعاليّة</div>
          <div className="text-[16px] font-extrabold truncate">
            {sel ? whenNight(sel.activityDate) : acc ? whenNight(acc.activity.date) : 'جارٍ التحميل…'}
          </div>
          {(sel || acc) && <div className="text-[12.5px] truncate" style={{ color: TX.sub }}>{sel?.activityName ?? acc?.activity.name}</div>}
        </div>
        <span className="text-[13px] font-bold shrink-0" style={{ color: TX.amberHi }}>غيّر</span>
      </button>

      {err && (
        <div role="alert" className="flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 text-[14px]"
          style={{ background: 'rgba(224,73,43,.10)', border: '1px solid rgba(224,73,43,.35)', color: TX.bad }}>
          <Icon name="warn" size={18} />
          <span className="flex-1">{err}</span>
          {selId && <Btn kind="ghost" h={44} onClick={() => load(selId)}><Icon name="refresh" size={16} />أعد المحاولة</Btn>}
        </div>
      )}

      {loading || (!acc && !err) ? (
        <>
          <Skeleton h={150} n={1} />
          <Skeleton h={72} n={2} />
          <Skeleton h={58} n={4} />
        </>
      ) : acc && t && c ? (
        <>
          {/* ── ١. المحصَّل وتقسيمه ── */}
          <section aria-label="المحصَّل في الفعاليّة" className="vc-enter">
            <div className="text-[13.5px] font-bold" style={{ color: TX.sub }}>حُصّل في هذه الليلة</div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="vc-num font-semibold" style={{ fontSize: 42, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{f2(t.collected)}</span>
              <span className="text-[15px]" style={{ color: TX.dim }}>د.أ</span>
            </div>
            <div className="text-[12.5px] mt-0.5" style={{ color: TX.dim }}>{t.paidCount === 0 ? 'لا فواتير محصّلة' : pInvoices(t.paidCount)}</div>
            <MoneySplit t={t} emptyText="لم يُحصَّل شيءٌ في هذه الليلة" />
          </section>

          {/* ── ٢. ما بقي ── */}
          {t.due > 0 ? (
            <section aria-label="لم يُحصَّل من الليلة" className="rounded-[16px] p-3.5"
              style={{ background: 'rgba(204,127,34,.08)', border: '1px solid rgba(204,127,34,.35)' }}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-extrabold" style={{ color: TX.amber }}>لم يُحصَّل بعد</div>
                  <div className="text-[12.5px] mt-0.5" style={{ color: TX.dim }}>على {pPlayers(t.dueCount)} — فواتير مفتوحة أو طلبات بلا فاتورة</div>
                </div>
                <Amount value={f2(t.due)} size={22} />
              </div>
              <Btn kind="primary" full h={48} className="mt-3" onClick={() => onOpenNight(acc.activity.id)}>
                <Icon name="receipt" size={18} />افتح تحصيل هذه الليلة
              </Btn>
            </section>
          ) : (
            <div className="p-3.5 rounded-[14px] text-[14px] font-bold flex items-center gap-2" style={{ background: 'rgba(37,192,138,.08)', color: TX.good }}>
              <Icon name="check" size={18} stroke={2.4} />حُصّل كلّ شيء في هذه الليلة
            </div>
          )}

          {/* ── ٣. الحضور ── */}
          <section aria-label="الحضور">
            <h2 className="text-[15.5px] font-extrabold">الحضور</h2>
            <div className="grid grid-cols-2 gap-2 mt-2.5">
              <Stat label="حجزوا" value={c.booked} />
              <Stat label="لعبوا" value={c.played} />
              <Stat label="حجز مجّانيّ" value={c.free} />
              <Stat label="دفعوا الدخوليّة للنادي مباشرةً" value={c.directPaid} />
            </div>
          </section>

          {/* ── ٤. الفواتير ── */}
          <section aria-label="الفواتير">
            <h2 className="text-[15.5px] font-extrabold">الفواتير</h2>
            {acc.rows.length === 0 ? (
              <div className="text-[13.5px] mt-2" style={{ color: TX.dim }}>لا فواتير ولا طلبات في هذه الليلة</div>
            ) : rowsShown.map(r => {
              const paid = r.kind === 'paid';
              const sub = paid
                ? `#${r.invoiceNo ?? '—'} · ${hhmm(r.paidAt)}${r.paidByName ? ` · حصّلها ${r.paidByName}` : ''}`
                : r.noInvoice ? 'طلبات بلا فاتورة بعد' : `#${r.invoiceNo ?? '—'} · مفتوحة`;
              const parts = rowParts(r);
              return (
                <div key={r.key} className="flex items-start gap-2.5 py-3" style={{ borderTop: `1px solid ${EM.line}` }}>
                  <SeatBadge seat={r.seat} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14.5px] font-extrabold truncate">{r.playerName}</div>
                    <div className="text-[12.5px]" style={{ color: TX.sub }}>{sub}</div>
                    {parts && <div className="text-[12.5px]" style={{ color: TX.dim }}>{parts}</div>}
                  </div>
                  <div className="text-left shrink-0">
                    <Amount value={f2(r.grandTotal)} size={17} unit={false} />
                    <div className="flex items-center justify-end gap-1 mt-0.5 text-[12.5px] font-bold" style={{ color: paid ? TX.good : TX.amber }}>
                      <Icon name={paid ? 'check' : 'clock'} size={13} stroke={2.2} />{paid ? 'محصَّلة' : 'لم تُحصَّل'}
                    </div>
                  </div>
                </div>
              );
            })}
            {acc.rows.length > SHOW_ROWS && (
              <button type="button" onClick={() => setAllRows(v => !v)} className="vc-press w-full h-11 mt-1 text-[13.5px] font-bold" style={{ color: TX.amberHi }}>
                {allRows ? 'اعرض أقلّ' : `اعرض كلّ الفواتير (${acc.rows.length})`}
              </button>
            )}
          </section>

          {/* ── ٥. ما طُلب ── */}
          <section aria-label="ما طُلب">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[15.5px] font-extrabold">ما طُلب</h2>
              {acc.items.length > 0 && <span className="text-[12.5px]" style={{ color: TX.dim }}>المجموع <span className="vc-num">{f2(itemsTotal)}</span></span>}
            </div>
            {acc.items.length === 0 ? (
              <div className="text-[13.5px] mt-2" style={{ color: TX.dim }}>لم يُطلب شيءٌ من المنيو</div>
            ) : itemsShown.map(it => (
              <div key={it.name} className="flex items-center gap-2.5 py-2.5 text-[14px]" style={{ borderTop: `1px solid ${EM.line}` }}>
                <span className="flex-1 min-w-0 truncate font-bold">{it.name}</span>
                <span className="vc-num shrink-0" style={{ color: TX.sub }}>×{it.qty}</span>
                <span className="vc-num shrink-0 text-left" style={{ minWidth: 56 }}>{f2(it.amount)}</span>
              </div>
            ))}
            {acc.items.length > SHOW_ITEMS && (
              <button type="button" onClick={() => setAllItems(v => !v)} className="vc-press w-full h-11 mt-1 text-[13.5px] font-bold" style={{ color: TX.amberHi }}>
                {allItems ? 'اعرض أقلّ' : `اعرض كلّ الأصناف (${acc.items.length})`}
              </button>
            )}
            {acc.items.length > 0 && (
              <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: TX.dim }}>
                كلّ ما طُلب، المحصَّل منه وغير المحصَّل. الإجماليّ يختلف عن «لك» بقدر ما لم يُحصَّل بعد.
              </p>
            )}
            {c.cancelledOrders > 0 && (
              <div className="text-[12.5px] mt-2" style={{ color: TX.dim }}>
                أُلغي {pOrders(c.cancelledOrders)} بقيمة <span className="vc-num">{f2(c.cancelledTotal)}</span> — لا يدخل الحساب
              </div>
            )}
          </section>

          {/* ── ٦. دخوليّات أُسقطت ── */}
          {acc.waivers.length > 0 && (
            <section aria-label="دخوليّات أُسقطت">
              <h2 className="text-[15.5px] font-extrabold">دخوليّات أُسقطت</h2>
              <div className="text-[12.5px] mt-0.5" style={{ color: TX.dim }}>جُعل حجزهم مجّانيّاً من الكونسول</div>
              {acc.waivers.map(w => (
                <div key={w.playerId} className="py-2.5 mt-1.5 text-[14px]" style={{ borderTop: `1px solid ${EM.line}` }}>
                  <div className="font-bold">{w.playerName || `لاعب #${w.playerId}`}</div>
                  <div className="text-[12.5px]" style={{ color: TX.dim }}>
                    {w.reason || 'بلا سبب'}{w.staffName ? ` · ${w.staffName}` : ''}{w.at ? ` · ${hhmm(w.at)}` : ''}
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      ) : null}

      {/* ── ورقة الاختيار ── */}
      <Sheet open={picker} onClose={() => setPicker(false)} title="اختر فعاليّة" subtitle="الفعاليّات التي مرّت خلال آخر ستّة أشهر">
        <div className="mt-2">
          {groups.map(g => (
            <div key={g.month}>
              <div className="text-[12.5px] font-bold mt-3 mb-1" style={{ color: TX.dim }}>{g.month}</div>
              {g.list.map(nt => {
                const on = nt.activityId === selId;
                return (
                  <button key={nt.activityId} type="button" onClick={() => choose(nt.activityId)} aria-pressed={on}
                    className="vc-press flex items-center gap-2.5 w-full px-3 py-2.5 mt-1.5 rounded-[14px] text-right"
                    style={{ minHeight: 58, background: on ? EM.line : EM.ink2, border: `1px solid ${on ? EM.line2 : EM.line}`, color: 'inherit' }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14.5px] font-extrabold">{whenNight(nt.activityDate)}</div>
                      <div className="text-[12.5px] truncate" style={{ color: TX.dim }}>
                        {nt.activityName}{nt.paidCount > 0 ? ` · ${pInvoices(nt.paidCount)}` : nt.ordersCount > 0 ? ` · ${pOrders(nt.ordersCount)}` : ''}
                      </div>
                      {nt.hasOpen && <div className="text-[12.5px] font-bold" style={{ color: TX.amber }}>فيها مال لم يُحصَّل</div>}
                    </div>
                    <Amount value={f2(nt.collected)} size={16} unit={false} />
                    {on && <Icon name="check" size={18} color={TX.good} stroke={2.4} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
