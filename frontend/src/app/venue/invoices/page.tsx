'use client';

// ══════════════════════════════════════════════════════
// 🧾 فواتير المنيو والتحصيل — /venue/invoices
// فاتورةٌ باسم كل لاعب: بطاقةٌ مختصرة تُفتح على تفاصيلها الكاملة.
// بحثٌ بالاسم · طباعةٌ جماعيّة لكل فواتير الفعاليّة · تسجيل تحصيل ·
// إسقاط رسوم اللعبة (يجعل حجز اللاعب مجّانيّاً لهذه الفعاليّة تحديداً).
// الرقم التسلسليّ يثبت من أوّل إصدار؛ إعادة الطباعة لا تستهلك رقماً جديداً.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import { useVenue } from '../context';

interface Candidate {
  playerId: number;
  playerName: string;
  ordersCount: number;
  ordersTotal: number;
  minTopup: number;
  waterCharge: number;
  gameFee: number;
  grandTotal: number;
  invoiceNo: number | null;
  printedAt: string | null;
  isPaid: boolean;
  paidAt: string | null;
}

interface InvoiceLine {
  name: string; quantity: number; unitPrice: number; lineTotal: number;
  components: { name: string; qty: number; options?: { group: string; value: string }[] }[];
  options: { group: string; value: string }[];
}

interface InvoiceDetail {
  locationName: string; activityName: string; activityDate: string;
  playerName: string; lines: InvoiceLine[];
  ordersCount: number; ordersTotal: number; minTopup: number; waterCharge: number;
  gameFeeApplied: boolean; gameFeeAmount: number; grandTotal: number;
  invoiceNo: number | null; printedAt: string | null;
  isPaid: boolean; paidAt: string | null;
  bookingIsPaid: boolean; bookingIsFree: boolean;
}

const jod = (n: number) => `${n.toFixed(2)} د.أ`;

export default function VenueInvoicesPage() {
  const { locationId, authHeaders, can, isHQ } = useVenue();
  const [acts, setActs] = useState<{ id: number; name: string; date: string }[]>([]);
  const [actId, setActId] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [gameFeeEnabled, setGameFeeEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [printingAll, setPrintingAll] = useState(false);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  // الفاتورة المفتوحة تفاصيلها
  const [openFor, setOpenFor] = useState<Candidate | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const locParam = isHQ && locationId ? `locationId=${locationId}` : '';
  const withLoc = (url: string) => locParam ? `${url}${url.includes('?') ? '&' : '?'}${locParam}` : url;
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3200); };

  useEffect(() => {
    if (!locationId) return;
    fetch(withLoc('/api/venue/invoice-activities'), { headers: authHeaders })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setActs(d.activities);
          if (d.activities.length > 0) setActId(d.activities[0].id);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  const loadCandidates = useCallback(() => {
    if (!actId) { setCandidates([]); return; }
    setLoading(true);
    fetch(withLoc(`/api/venue/invoices/candidates?activityId=${actId}`), { headers: authHeaders })
      .then(r => r.json())
      .then(d => {
        if (d.success) { setCandidates(d.candidates); setGameFeeEnabled(d.gameFeeEnabled); }
        else flash(`❌ ${d.error || 'فشل التحميل'}`);
      })
      .catch(() => flash('❌ خطأ في الاتصال'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actId, locationId]);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  // ── تفاصيل فاتورة ──
  const openDetail = async (c: Candidate) => {
    setOpenFor(c); setDetail(null); setDetailLoading(true);
    try {
      const d = await fetch(withLoc(`/api/venue/invoices/${actId}/${c.playerId}`), { headers: authHeaders }).then(r => r.json());
      if (d.success) setDetail(d.invoice);
      else flash(`❌ ${d.error || 'تعذّر جلب التفاصيل'}`);
    } catch { flash('❌ خطأ في الاتصال'); }
    finally { setDetailLoading(false); }
  };

  const openPdf = async (c: Candidate) => {
    if (!actId) return;
    setBusyId(c.playerId);
    try {
      const r = await fetch(withLoc(`/api/venue/invoices/${actId}/${c.playerId}/pdf`), { method: 'POST', headers: authHeaders });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        flash(`❌ ${(d as any).error || 'فشل توليد الفاتورة'}`);
        return;
      }
      const url = URL.createObjectURL(await r.blob());
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      loadCandidates();
      if (openFor?.playerId === c.playerId) openDetail(c);
    } catch { flash('❌ خطأ في الاتصال'); }
    finally { setBusyId(null); }
  };

  // 🖨️ طباعة كل فواتير الفعاليّة في مستندٍ واحد
  const printAll = async () => {
    if (!actId || candidates.length === 0) return;
    if (!confirm(`طباعة ${candidates.length} فاتورة لهذه الفعاليّة؟\nسيُثبَّت رقمٌ تسلسليّ لكل فاتورة لم تُصدَر بعد.`)) return;
    setPrintingAll(true);
    try {
      const r = await fetch(withLoc(`/api/venue/invoices/${actId}/print-all`), { headers: authHeaders });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        flash(`❌ ${(d as any).error || 'فشل الطباعة الجماعيّة'}`);
        return;
      }
      const url = URL.createObjectURL(await r.blob());
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      loadCandidates();
    } catch { flash('❌ خطأ في الاتصال'); }
    finally { setPrintingAll(false); }
  };

  const recordPayment = async (c: Candidate) => {
    if (!actId || c.invoiceNo == null) return;
    const feeLine = c.gameFee > 0 ? `\nتشمل رسوم لعبة ${jod(c.gameFee)} — سيُسجَّل حجز اللاعب مدفوعاً باسمك.` : '';
    if (!confirm(`تأكيد استلام ${jod(c.grandTotal)} من ${c.playerName} كاملةً؟${feeLine}`)) return;
    setPayingId(c.playerId);
    try {
      const d = await fetch(withLoc(`/api/venue/invoices/${actId}/${c.playerId}/pay`), { method: 'POST', headers: authHeaders }).then(r => r.json());
      if (d.success) {
        flash(d.gameFeeSettled > 0
          ? `✅ حُصّلت الفاتورة #${c.invoiceNo} — وسُجّل حجز ${c.playerName} مدفوعاً`
          : `✅ حُصّلت الفاتورة #${c.invoiceNo}`);
        loadCandidates();
        if (openFor?.playerId === c.playerId) openDetail(c);
      } else flash(`❌ ${d.error || 'فشل تسجيل التحصيل'}`);
    } catch { flash('❌ خطأ في الاتصال'); }
    finally { setPayingId(null); }
  };

  // 🎮 إسقاط رسوم اللعبة — يحوّل حجز اللاعب إلى مجّانيّ لهذه الفعاليّة
  const waiveFee = async (c: Candidate, waive: boolean) => {
    if (!actId) return;
    const msg = waive
      ? `إسقاط رسوم اللعبة عن ${c.playerName}؟\nسيصبح حجزه مجّانيّاً في هذه الفعاليّة تحديداً، ويسقط سطر الرسوم من فاتورته.`
      : `إعادة احتساب رسوم اللعبة على ${c.playerName}؟`;
    if (!confirm(msg)) return;
    setPayingId(c.playerId);
    try {
      const d = await fetch(withLoc(`/api/venue/invoices/${actId}/${c.playerId}/waive-fee`), {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ waive }),
      }).then(r => r.json());
      if (d.success) {
        flash(waive ? `✅ أُسقطت رسوم اللعبة عن ${c.playerName}` : `✅ أُعيد احتساب الرسوم على ${c.playerName}`);
        loadCandidates();
        if (openFor?.playerId === c.playerId) openDetail(c);
      } else flash(`❌ ${d.error || 'فشل الإجراء'}`);
    } catch { flash('❌ خطأ في الاتصال'); }
    finally { setPayingId(null); }
  };

  if (!can('invoices.print')) {
    return <div className="text-center py-16 text-[#8B9A92] text-sm">ليس لدى حسابك صلاحيّة طباعة الفواتير</div>;
  }

  const canPay = can('payments.record');
  const q = search.trim().toLowerCase();
  const visible = q ? candidates.filter(c => c.playerName.toLowerCase().includes(q)) : candidates;
  const totals = candidates.reduce((s, c) => ({
    orders: s.orders + c.ordersTotal,
    grand: s.grand + c.grandTotal,
    collected: s.collected + (c.isPaid ? c.grandTotal : 0),
    fees: s.fees + c.gameFee,
  }), { orders: 0, grand: 0, collected: 0, fees: 0 });

  return (
    <div className="space-y-4">
      {/* ── الترويسة + اختيار الفعاليّة ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold">🧾 الفواتير والتحصيل</h2>
          <p className="text-[11px] text-[#8B9A92] mt-0.5">فاتورة A6 لكل لاعب — اضغط البطاقة لتفاصيلها</p>
        </div>
        <select
          value={actId ?? ''}
          onChange={e => { setActId(parseInt(e.target.value) || null); setOpenFor(null); }}
          className="bg-[#1B211D] border border-[#232B27] rounded-lg text-xs px-3 py-2 max-w-[220px]"
        >
          {acts.length === 0 && <option value="">لا فعاليّات مفعَّلة المنيو مؤخّراً</option>}
          {acts.map(a => (
            <option key={a.id} value={a.id}>
              {a.name} — {new Date(a.date).toLocaleDateString('ar-JO', { month: 'short', day: 'numeric' })}
            </option>
          ))}
        </select>
      </div>

      {/* ── ملخّص الفعاليّة ── */}
      {candidates.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Kpi label="فواتير" value={String(candidates.length)} tone="blue" />
          <Kpi label="الإجماليّ" value={jod(totals.grand)} tone="white" />
          <Kpi label="محصَّل" value={jod(totals.collected)} tone="green" />
          <Kpi label="متبقٍّ" value={jod(totals.grand - totals.collected)} tone="amber" />
        </div>
      )}

      {gameFeeEnabled && (
        <p className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          💰 رسوم اللعبة مفعَّلة — تُضاف لفاتورة من لم يدفع حجزه
          {canPay ? '، ويمكن إسقاطها عن لاعبٍ بعينه من تفاصيل فاتورته' : ''}
        </p>
      )}

      {/* ── بحث + طباعة جماعيّة ── */}
      {candidates.length > 0 && (
        <div className="flex gap-2">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔎 ابحث باسم اللاعب…"
            className="flex-1 bg-[#1B211D] border border-[#232B27] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#D98A2B]/50 placeholder:text-[#5A6862]"
          />
          <button
            onClick={printAll} disabled={printingAll}
            title="طباعة كل فواتير الفعاليّة في مستندٍ واحد"
            className="px-3.5 rounded-xl text-xs font-bold bg-white/5 border border-white/10 hover:border-[#D98A2B]/45 transition-colors disabled:opacity-50 shrink-0"
          >
            {printingAll ? '⏳…' : '🖨️ طباعة الكل'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#2E3833] border-t-[#D98A2B] rounded-full animate-spin" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-[#232B27]">
          <div className="text-4xl mb-3">🧾</div>
          <p className="text-[#8B9A92] text-sm">لا طلبات في هذه الفعاليّة بعد</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-dashed border-[#232B27]">
          <p className="text-[#8B9A92] text-sm">لا لاعب بهذا الاسم</p>
          <button onClick={() => setSearch('')} className="text-emerald-400 text-xs underline mt-2">مسح البحث</button>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(c => (
            <button
              key={c.playerId}
              onClick={() => openDetail(c)}
              className="w-full text-right rounded-xl p-3.5 flex items-center gap-3 transition-colors hover:border-emerald-500/30"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="w-9 h-9 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0">
                {c.playerName[0] || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white text-sm font-medium truncate">{c.playerName}</p>
                  {c.invoiceNo != null && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-[#8B9A92] border border-white/10 shrink-0">#{c.invoiceNo}</span>
                  )}
                  {c.isPaid
                    ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">💵 محصَّلة</span>
                    : <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25 shrink-0">بانتظار التحصيل</span>}
                </div>
                <p className="text-[10px] text-[#8B9A92] mt-0.5">
                  {c.ordersCount} {c.ordersCount === 1 ? 'طلب' : 'طلبات'} • {jod(c.ordersTotal)}
                  {c.waterCharge > 0 && <span className="text-cyan-400/90"> + مياه {jod(c.waterCharge)}</span>}
                  {c.minTopup > 0 && <span className="text-sky-400/90"> + حدّ أدنى {jod(c.minTopup)}</span>}
                  {c.gameFee > 0 && <span className="text-amber-400/90"> + رسوم {jod(c.gameFee)}</span>}
                </p>
              </div>
              <div className="text-left shrink-0">
                <p className="text-emerald-400 text-sm font-bold">{jod(c.grandTotal)}</p>
                <p className="text-[9px] text-[#5A6862]">التفاصيل ←</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ══ تفاصيل الفاتورة ══ */}
      {openFor && (
        <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setOpenFor(null)}>
          <div
            className="w-full max-w-lg bg-[#161B18] border-t sm:border border-[#232B27] rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold truncate">{openFor.playerName}</h3>
                {detail && (
                  <p className="text-[11px] text-[#8B9A92]">
                    {detail.activityName} • {detail.ordersCount} {detail.ordersCount === 1 ? 'طلب' : 'طلبات'}
                    {detail.invoiceNo != null && <span> • فاتورة #{detail.invoiceNo}</span>}
                  </p>
                )}
              </div>
              <button onClick={() => setOpenFor(null)} className="text-[#8B9A92] hover:text-white shrink-0">✕</button>
            </div>

            {detailLoading || !detail ? (
              <div className="flex justify-center py-12">
                <div className="w-7 h-7 border-2 border-[#2E3833] border-t-[#D98A2B] rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* بنود الفاتورة */}
                <div className="rounded-xl border border-white/[0.07] overflow-hidden mb-3">
                  <div className="flex text-[10px] text-[#8B9A92] bg-white/[0.04] px-3 py-1.5">
                    <span className="flex-1">الصنف</span>
                    <span className="w-10 text-center">كمّية</span>
                    <span className="w-14 text-center">السعر</span>
                    <span className="w-16 text-left">المجموع</span>
                  </div>
                  {detail.lines.map((l, i) => (
                    <div key={i} className="px-3 py-2 border-t border-white/[0.05]">
                      <div className="flex text-xs items-start">
                        <span className="flex-1 min-w-0 pl-1">{l.name}</span>
                        <span className="w-10 text-center tabular-nums">{l.quantity}</span>
                        <span className="w-14 text-center tabular-nums text-[#8B9A92]">{l.unitPrice.toFixed(2)}</span>
                        <span className="w-16 text-left tabular-nums font-bold">{l.lineTotal.toFixed(2)}</span>
                      </div>
                      {l.options.length > 0 && (
                        <p className="text-[10px] text-amber-300/80 mt-0.5">⚙️ {l.options.map(o => `${o.group}: ${o.value}`).join(' · ')}</p>
                      )}
                      {l.components.length > 0 && (
                        <p className="text-[10px] text-violet-300/70 mt-0.5">
                          🎁 {l.components.map(c => {
                            const co = (c.options ?? []).map(o => o.value).join('/');
                            return `${c.name}${co ? ` (${co})` : ''} ×${c.qty * l.quantity}`;
                          }).join(' + ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* المجاميع */}
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-3 space-y-1.5 mb-3">
                  <Row label="مجموع الطلبات" value={jod(detail.ordersTotal)} />
                  {detail.waterCharge > 0 && <Row label="مياه ×1" value={jod(detail.waterCharge)} tone="amber" />}
                  {detail.minTopup > 0 && <Row label="حدّ أدنى للاستهلاك" value={jod(detail.minTopup)} tone="amber" />}
                  {detail.gameFeeApplied && <Row label="رسوم اللعبة" value={jod(detail.gameFeeAmount)} tone="amber" />}
                  <div className="border-t border-white/10 pt-1.5 flex justify-between">
                    <span className="text-sm font-bold">الإجماليّ</span>
                    <span className="text-sm font-bold text-emerald-400 tabular-nums">{jod(detail.grandTotal)}</span>
                  </div>
                </div>

                {/* حالة الحجز ورسوم اللعبة */}
                <div className="text-[11px] text-[#8B9A92] mb-3 space-y-1">
                  {detail.bookingIsFree && <p className="text-emerald-400">🎁 حجز اللاعب مجّانيّ في هذه الفعاليّة — لا رسوم لعبة</p>}
                  {detail.bookingIsPaid && !detail.bookingIsFree && <p>✅ حجز اللاعب مدفوع مسبقاً — الرسوم حُصّلت من مسارها</p>}
                  {detail.isPaid && <p className="text-emerald-400">💵 حُصّلت الفاتورة{detail.paidAt ? ` — ${new Date(detail.paidAt).toLocaleString('ar-JO', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}` : ''}</p>}
                </div>

                {/* الإجراءات */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openPdf(openFor)} disabled={busyId === openFor.playerId}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-l from-[#D98A2B] to-[#C2751F] text-white disabled:opacity-50"
                    >
                      {busyId === openFor.playerId ? '⏳…' : detail.invoiceNo != null ? '🖨️ إعادة طباعة' : '🧾 إصدار فاتورة PDF'}
                    </button>
                    {canPay && detail.invoiceNo != null && !detail.isPaid && (
                      <button
                        onClick={() => recordPayment(openFor)} disabled={payingId === openFor.playerId}
                        className="px-4 py-2.5 rounded-xl text-sm font-bold bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 disabled:opacity-50"
                      >
                        {payingId === openFor.playerId ? '⏳…' : '💵 تسجيل الدفع'}
                      </button>
                    )}
                  </div>

                  {/* 🎮 إسقاط رسوم اللعبة — لهذه الفعاليّة تحديداً */}
                  {canPay && !detail.isPaid && !detail.bookingIsPaid && (
                    detail.bookingIsFree ? (
                      <button onClick={() => waiveFee(openFor, false)} disabled={payingId === openFor.playerId}
                        className="w-full py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-[#8B9A92] disabled:opacity-50">
                        ↩️ إعادة احتساب رسوم اللعبة
                      </button>
                    ) : gameFeeEnabled && detail.gameFeeApplied ? (
                      <button onClick={() => waiveFee(openFor, true)} disabled={payingId === openFor.playerId}
                        className="w-full py-2 rounded-xl text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 disabled:opacity-50">
                        🎁 إسقاط رسوم اللعبة (يجعل حجزه مجّانيّاً في هذه الفعاليّة)
                      </button>
                    ) : null
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-[#1B211D] border border-emerald-500/30 rounded-xl px-4 py-2 text-sm shadow-xl max-w-[92vw] text-center">
          {toast}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'green' | 'amber' | 'white' }) {
  const color = tone === 'green' ? '#34d399' : tone === 'amber' ? '#fbbf24' : tone === 'blue' ? '#60a5fa' : '#fff';
  return (
    <div className="rounded-xl px-3 py-2 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-sm font-bold tabular-nums" style={{ color }}>{value}</p>
      <p className="text-[10px] text-[#8B9A92] mt-0.5">{label}</p>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'amber' }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-[#8B9A92]">{label}</span>
      <span className={`tabular-nums ${tone === 'amber' ? 'text-amber-400' : 'text-[#E8EFEA]'}`}>{value}</span>
    </div>
  );
}
