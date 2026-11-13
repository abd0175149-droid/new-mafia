'use client';

// ══════════════════════════════════════════════════════
// قائمة الحجوزات والدفع — جدول بالأعمدة الأساسيّة على الحاسوب وبطاقات على الهاتف.
// الباقي (وقت الحجز، الملاحظات، التذكرة، الإجراءات الثانويّة) داخل توسعة الصفّ.
// نقاط الاتّصال بالخادم كما كانت تماماً.
// ══════════════════════════════════════════════════════

import { Fragment, useState, type Dispatch, type SetStateAction } from 'react';
import { BadgePercent, Banknote, ChevronDown, Gamepad2, Search, Tag, Trash2, Undo2, Users } from 'lucide-react';
import WhatsAppButton from '@/components/WhatsAppButton';
import { swalConfirm, swalToast } from '@/lib/swal';
import { Badge, Banner, Empty, Field, Pop } from '../../whatsapp/wa-ui';
import { apiFetch, CURRENCY, fmtDayShort, fmtTime, num } from '../components/acts-shared';

export default function BookingsPanel({
  activityId, activity, bookings, setBookings, staffList, rosterGroups, gamesForBooking,
  isAdmin, isAccountant, unpaidFirst, totalAttendees, revenue, unpaidAttendees, unpaidExpected,
}: {
  activityId: number;
  activity: any;
  bookings: any[];
  setBookings: Dispatch<SetStateAction<any[]>>;
  staffList: any[];
  rosterGroups: { newcomers: any; companions: any } | null;
  gamesForBooking: (b: any) => number;
  isAdmin: boolean;
  isAccountant: boolean;
  /** مرحلة «بعد»: غير المدفوع أوّلاً */
  unpaidFirst: boolean;
  totalAttendees: number;
  revenue: number;
  unpaidAttendees: number;
  unpaidExpected: number;
}) {
  const [bookingSearch, setBookingSearch] = useState('');
  const [selectedBookings, setSelectedBookings] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  // Payment modal
  const [payModal, setPayModal] = useState<any[] | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payReceiver, setPayReceiver] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);

  const expectedOf = (b: any) => b.offerItems?.length > 0
    ? b.offerItems.reduce((s: number, item: any) => s + ((item.unitPrice || item.price || 0) * (item.quantity || 0)), 0)
    : (Number(b.unitPrice ?? activity?.basePrice ?? 0)) * (b.count || 1);   // 💸 السعر المقفول وإلّا سعر الفعاليّة

  // ── Payment handlers ──
  function openPayModal(bookingsToPay: any[]) {
    const totalSuggested = bookingsToPay.reduce((s, b) => s + expectedOf(b), 0);
    setPayModal(bookingsToPay);
    setPayAmount(String(totalSuggested || ''));
    setPayReceiver('');
    setPayNotes(bookingsToPay.length === 1 ? (bookingsToPay[0].notes || '') : '');
  }

  async function confirmPayment() {
    if (!payModal || payModal.length === 0) return;
    setPaySubmitting(true);

    // حساب المبلغ المتوقع لكل حجز لتوزيع المبلغ الكلي إذا تم تعديله
    const expectedPerBooking = payModal.map(expectedOf);
    const totalExpected = expectedPerBooking.reduce((a, b) => a + b, 0);
    const actualTotalPaid = Number(payAmount) || 0;

    try {
      const promises = payModal.map(async (booking, i) => {
        let bookingPaid = expectedPerBooking[i];

        // توزيع المبلغ المدفوع بشكل نسبي إذا كان مختلف عن المجموع المتوقع
        if (totalExpected > 0 && actualTotalPaid !== totalExpected) {
          bookingPaid = Number(((expectedPerBooking[i] / totalExpected) * actualTotalPaid).toFixed(2));
        } else if (totalExpected === 0 && actualTotalPaid > 0) {
          bookingPaid = Number((actualTotalPaid / payModal.length).toFixed(2));
        }

        return apiFetch(`/api/bookings/${booking.id}/pay`, {
          method: 'PUT',
          body: JSON.stringify({
            paidAmount: bookingPaid,
            receivedBy: payReceiver,
            notes: payNotes,
          }),
        });
      });

      const updatedBookings = await Promise.all(promises);

      setBookings(prev => prev.map(b => {
        const updated = updatedBookings.find((u: any) => u.id === b.id);
        return updated ? updated : b;
      }));
      setPayModal(null);
      setSelectedBookings([]);
      swalToast('تمّ تأكيد الدفع', 'success');
    } catch (err: any) {
      swalToast('فشل تأكيد الدفع: ' + err.message, 'error');
    } finally {
      setPaySubmitting(false);
    }
  }

  // 💸 تطبيق سعر الدون المبكّر أو إزالته يدويّاً (أدمن — يُسجَّل في سجلّ الموظّفين)
  async function toggleEarly(b: any) {
    const on = b.unitPrice == null;
    if (!(await swalConfirm(on ? `تطبيق سعر الدون المبكّر يدويّاً على حجز ${b.name}؟` : `إزالة سعر الدون المبكّر عن حجز ${b.name}؟ يعود لسعر الفعاليّة.`, { icon: 'question' }))) return;
    try {
      await apiFetch(`/api/early-price/booking/${b.id}`, { method: 'POST', body: JSON.stringify({ on }) });
      setBookings(await apiFetch(`/api/bookings?activityId=${activityId}`));
    } catch (e: any) { swalToast(e.message || 'فشل', 'error'); }
  }

  async function handleUnpay(bookingId: number) {
    if (!(await swalConfirm('هل تريد إلغاء تأكيد الدفع لهذا الحجز؟'))) return;
    try {
      const updated = await apiFetch(`/api/bookings/${bookingId}`, {
        method: 'PUT',
        body: JSON.stringify({ isPaid: false, paidAmount: '0' }),
      });
      setBookings(prev => prev.map(b => b.id === bookingId ? updated : b));
    } catch (err: any) {
      swalToast('فشل: ' + err.message, 'error');
    }
  }

  async function handleDeleteBooking(bookingId: number) {
    if (!(await swalConfirm('حذف هذا الحجز نهائيّاً؟', { danger: true, confirmText: 'احذف' }))) return;
    try {
      await apiFetch(`/api/bookings/${bookingId}`, { method: 'DELETE' });
      setBookings(prev => prev.filter(b => b.id !== bookingId));
      setSelectedBookings(prev => prev.filter(id => id !== bookingId));
    } catch (err: any) {
      swalToast('فشل الحذف: ' + err.message, 'error');
    }
  }

  async function handleMakeFree() {
    if (selectedBookings.length === 0) return;
    if (!(await swalConfirm('هل أنت متأكد من تحويل الحجوزات المحددة إلى مجانية لهذا النشاط فقط؟ ستصبح قيمة الدفع 0 ولن يطالبوا بالدفع.'))) return;
    try {
      const promises = selectedBookings.map(id =>
        apiFetch(`/api/bookings/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ isFree: true, isPaid: true, paidAmount: '0' })
        })
      );
      const updated = await Promise.all(promises);
      setBookings(prev => prev.map(b => {
        const u = updated.find((upd: any) => upd.id === b.id);
        return u ? u : b;
      }));
      setSelectedBookings([]);
      swalToast('حُوّلت الحجوزات المحدّدة إلى مجّانيّة', 'success');
    } catch (err: any) {
      swalToast('فشل التحويل: ' + err.message, 'error');
    }
  }

  const unpaidIds = bookings.filter((b: any) => !b.isPaid && !b.isFree).map((b: any) => b.id);
  const allSelected = selectedBookings.length > 0 && selectedBookings.length === unpaidIds.length;
  const q = bookingSearch.toLowerCase();
  const priority = (bk: any) => unpaidFirst
    ? (bk.isFree ? 2 : bk.isPaid ? 1 : 0)
    : (bk.isFree ? 2 : bk.isPaid ? 0 : 1);
  const rows = [...bookings]
    .filter((b: any) => bookingSearch ? ((b.name && b.name.toLowerCase().includes(q)) || (b.phone && b.phone.includes(bookingSearch))) : true)
    .sort((a: any, b: any) => priority(a) - priority(b));

  return (
    <div className="stack">
      {bookings.length === 0 ? (
        <div className="wa-card"><Empty icon={<Users />} title="لا حجوزات لهذا النشاط بعد" /></div>
      ) : (
        <>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <div className="wa-search grow" style={{ minWidth: 200 }}>
              <Search />
              <input type="search" className="wa-input" placeholder="ابحث بالاسم أو رقم الهاتف" aria-label="بحث في الحجوزات" value={bookingSearch} onChange={e => setBookingSearch(e.target.value)} />
            </div>
            {unpaidIds.length > 0 && (
              <label className="acts-checkline">
                <input
                  type="checkbox" className="acts-check" checked={allSelected}
                  onChange={e => setSelectedBookings(e.target.checked ? unpaidIds : [])}
                />
                حدّد كلّ غير المدفوع (<span className="ltr">{unpaidIds.length}</span>)
              </label>
            )}
          </div>

          {/* إجراءات جماعيّة — أزرار حقيقيّة خارج أيّ زرّ آخر */}
          {selectedBookings.length > 0 && (
            <div className="acts-bulk" role="region" aria-label="إجراءات على الحجوزات المحدّدة">
              <b>المحدّد: <span className="ltr">{selectedBookings.length}</span></b>
              <button type="button" className="wa-btn send" onClick={() => openPayModal(bookings.filter((b: any) => selectedBookings.includes(b.id)))}>
                <Banknote />دفع المحدّد
              </button>
              <button type="button" className="wa-btn" onClick={handleMakeFree}><Tag />تحويل لمجّانيّ</button>
              <button type="button" className="wa-btn ghost" onClick={() => setSelectedBookings([])}>إلغاء التحديد</button>
            </div>
          )}

          <div className="wa-card" style={{ padding: 0 }}>
            <div className="wa-tablewrap">
              <table className="wa-table cards acts-bk">
                <thead>
                  <tr>
                    <th aria-label="تحديد" />
                    <th>الحاجز</th>
                    <th>الهاتف</th>
                    <th>العدد</th>
                    <th>الحضور</th>
                    <th>الدفع</th>
                    <th>المستلم</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b: any) => {
                    const unpaid = !b.isPaid && !b.isFree;
                    const g = gamesForBooking(b);
                    const open = expanded === b.id;
                    return (
                      <Fragment key={b.id}>
                        <tr className={unpaid ? 'unpaid' : undefined}>
                          <td>
                            {unpaid && (
                              <label className="acts-checkhit">
                                <input
                                  type="checkbox" className="acts-check" aria-label={`تحديد حجز ${b.name}`}
                                  checked={selectedBookings.includes(b.id)}
                                  onChange={e => setSelectedBookings(prev => e.target.checked ? [...prev, b.id] : prev.filter(id => id !== b.id))}
                                />
                              </label>
                            )}
                          </td>
                          <td className="acts-main">{b.name}</td>
                          <td data-l="الهاتف">
                            <span className="row"><span className="ltr">{b.phone || '—'}</span><WhatsAppButton phone={b.phone} size={13} /></span>
                          </td>
                          <td data-l="العدد"><span className="ltr">{b.count || 1}</span></td>
                          <td data-l="الحضور">
                            <span className="row" style={{ flexWrap: 'wrap' }}>
                              {b.checkedIn ? <Badge tone="ok">حضر</Badge> : <span className="muted">—</span>}
                              {g > 0 && <Badge tone="violet" title="عدد الألعاب التي لعبها في هذا النشاط عبر كلّ الغرف"><Gamepad2 /><span className="ltr">{g}</span></Badge>}
                            </span>
                          </td>
                          <td data-l="الدفع">
                            <span>
                              {b.isFree ? <Badge tone="info">مجّانيّ</Badge>
                                : b.isPaid ? <Badge tone="ok">مدفوع · <span className="ltr">{num(b.paidAmount)}</span></Badge>
                                  : <Badge tone="warn">غير مدفوع</Badge>}
                              {b.unitPrice != null && !b.isFree && (
                                <span className="acts-two" title="سعر الدون المبكّر المقفول لهذا الحجز">سعر مبكّر <span className="ltr">{num(b.unitPrice)}</span> {CURRENCY}</span>
                              )}
                            </span>
                          </td>
                          <td data-l="المستلم">{b.receivedBy || '—'}</td>
                          <td>
                            <div className="acts-rowacts">
                              {unpaid && (
                                <button type="button" className="wa-btn send sm" onClick={() => openPayModal([b])}><Banknote />تأكيد دفع</button>
                              )}
                              <button type="button" className="wa-btn sm" aria-expanded={open} aria-label={`تفاصيل حجز ${b.name}`} onClick={() => setExpanded(open ? null : b.id)}>
                                المزيد<ChevronDown className={open ? 'acts-flip' : undefined} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {open && (
                          <tr className="acts-x">
                            <td colSpan={8}>
                              <div className="acts-xgrid">
                                <div><span>وقت الحجز</span>{b.createdAt ? <>{fmtDayShort(b.createdAt)} · <span className="ltr">{fmtTime(b.createdAt)}</span></> : '—'}</div>
                                <div><span>ملاحظات</span>{b.notes || '—'}</div>
                                <div><span>المبلغ المدفوع</span>{b.isFree ? '—' : <><span className="ltr">{num(b.paidAmount)}</span> {CURRENCY}</>}</div>
                                <div><span>ألعاب في هذا النشاط</span><span className="ltr">{g}</span></div>
                                {b.ticketNumber && <div><span>التذكرة</span><span className="ltr">{b.ticketNumber}</span></div>}
                              </div>
                              {(isAdmin && unpaid) || (b.isPaid && !b.isFree && !isAccountant) || !isAccountant ? (
                                <div className="acts-xacts">
                                  {isAdmin && unpaid && (
                                    <button type="button" className="wa-btn" onClick={() => toggleEarly(b)}>
                                      <BadgePercent />{b.unitPrice != null ? 'أزل السعر المبكّر' : 'طبّق السعر المبكّر'}
                                    </button>
                                  )}
                                  {b.isPaid && !b.isFree && !isAccountant && (
                                    <button type="button" className="wa-btn" onClick={() => handleUnpay(b.id)}><Undo2 />إلغاء تأكيد الدفع</button>
                                  )}
                                  {!isAccountant && (
                                    <button type="button" className="wa-btn danger" onClick={() => handleDeleteBooking(b.id)}><Trash2 />حذف الحجز</button>
                                  )}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* بنودٌ مجمَّعة: من لا صفَّ حجزٍ لهم — يُشتقّون من متابعة الحجوزات */}
          {(rosterGroups?.newcomers?.count ?? 0) > 0 && (
            <Banner tone="info">
              <b>لاعبون جدد (<span className="ltr">{rosterGroups!.newcomers.count}</span>):</b>{' '}
              {rosterGroups!.newcomers.entries.map((e: any) => `${e.name}${e.people > 1 ? ` (${e.people})` : ''}`).join(' · ')}
              <br />حجوزات مثبَّتة بلا حساب لاعب — تُحتسب من السعة ولا تظهر في التطبيق.
            </Banner>
          )}
          {(rosterGroups?.companions?.count ?? 0) > 0 && (
            <Banner tone="violet">
              <b>مرافقو لاعبين حاجزين (<span className="ltr">{rosterGroups!.companions.count}</span>):</b>{' '}
              {rosterGroups!.companions.entries.map((e: any) => `مع ${e.name} (${e.people})`).join(' · ')}
              <br />أشخاصٌ مع لاعبٍ حاجز — صفّ الحجز يحمل صاحبه وحده.
            </Banner>
          )}

          <div className="acts-sumline">
            <span>الحضور <b>{num(totalAttendees)}</b></span>
            <span>المحصَّل <b className="acts-pos">{num(revenue)}</b> {CURRENCY}</span>
            {unpaidAttendees > 0 && (
              <span className="acts-warn">متوقَّع تحصيله <b className="acts-warn">{num(Math.round(unpaidExpected * 100) / 100)}</b> {CURRENCY}</span>
            )}
          </div>
        </>
      )}

      {/* ── تأكيد الدفع ── */}
      {payModal && (
        <Pop title="تأكيد الدفع" onClose={() => setPayModal(null)}>
          <div className="wa-xpbox">
            {payModal.length === 1 ? (
              <>
                <div className="wa-kv"><span>الاسم</span><b>{payModal[0].name}</b></div>
                <div className="wa-kv"><span>العدد</span><b><span className="ltr">{payModal[0].count || 1}</span> شخص</b></div>
                {payModal[0].phone && <div className="wa-kv"><span>الهاتف</span><span className="ltr">{payModal[0].phone}</span></div>}
              </>
            ) : (
              <>
                <div className="wa-kv"><span>الحجوزات المحدّدة</span><b><span className="ltr">{payModal.length}</span> حجوزات</b></div>
                <div className="wa-kv"><span>إجماليّ الأشخاص</span><b><span className="ltr">{payModal.reduce((s: number, b: any) => s + (b.count || 1), 0)}</span> شخص</b></div>
              </>
            )}
          </div>
          <Field label={`المبلغ المدفوع (${CURRENCY}) *`} htmlFor="acts-pay-amount">
            <input id="acts-pay-amount" type="number" inputMode="decimal" min="0" step="0.5" className="wa-input" dir="ltr" value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus />
          </Field>
          <Field label="المستلم" htmlFor="acts-pay-receiver">
            <select id="acts-pay-receiver" className="wa-select" value={payReceiver} onChange={e => setPayReceiver(e.target.value)}>
              <option value="">اختر المستلم</option>
              {staffList.map((s: any) => <option key={s.id} value={s.displayName}>{s.displayName}</option>)}
            </select>
          </Field>
          <Field label="ملاحظات" htmlFor="acts-pay-notes">
            <input id="acts-pay-notes" type="text" className="wa-input" placeholder="اختياريّة" value={payNotes} onChange={e => setPayNotes(e.target.value)} />
          </Field>
          <div className="acts">
            <button type="button" className="wa-btn" onClick={() => setPayModal(null)}>إلغاء</button>
            <button type="button" className="wa-btn send" onClick={confirmPayment} disabled={paySubmitting || !payAmount || Number(payAmount) <= 0}>
              {paySubmitting ? 'جارٍ التأكيد…' : 'تأكيد الدفع'}
            </button>
          </div>
        </Pop>
      )}
    </div>
  );
}
