'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

interface BookingFormProps {
  activities: any[];
  locations: any[];
  staffList: any[];
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  userRole?: string;
  username?: string;
}

const CURRENCY = 'د.أ';

export default function BookingForm({ activities, locations, staffList, onSubmit, onCancel, userRole, username }: BookingFormProps) {
  const [activityId, setActivityId] = useState<string>('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [count, setCount] = useState(1);
  const [isFree, setIsFree] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [paidAmount, setPaidAmount] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // عدادات كمية العروض
  const [offerQuantities, setOfferQuantities] = useState<Record<number, number>>({});

  // الأنشطة المتاحة للحجز
  const availableActivities = useMemo(() =>
    activities.filter(a =>
      !a.isLocked &&
      a.status !== 'cancelled' &&
      (a.status !== 'completed' || username === 'admin')
    ), [activities, username]);

  // النشاط المختار
  const selectedActivity = activities.find(a => a.id === Number(activityId));

  // عروض النشاط المفعّلة
  const activeOffers = useMemo(() => {
    if (!selectedActivity?.enabledOfferIds?.length || !selectedActivity.locationId) return [];
    const location = locations.find(l => l.id === selectedActivity.locationId);
    if (!location?.offers) return [];
    const enabledIds = selectedActivity.enabledOfferIds;
    return (location.offers as any[]).filter((o: any, i: number) =>
      enabledIds.includes(o.id ?? i)
    );
  }, [selectedActivity, locations]);

  const hasOffers = activeOffers.length > 0;

  // حساب المبلغ عند وجود عروض
  const offersTotal = useMemo(() => {
    let totalCount = 0;
    let totalAmount = 0;
    let totalClubShare = 0;
    let totalVenueShare = 0;

    activeOffers.forEach((offer: any, i: number) => {
      const qty = offerQuantities[offer.id ?? i] || 0;
      totalCount += qty;
      totalAmount += (offer.price || 0) * qty;
      totalClubShare += (offer.clubShare || 0) * qty;
      totalVenueShare += (offer.venueShare || 0) * qty;
    });

    return { totalCount, totalAmount, totalClubShare, totalVenueShare };
  }, [activeOffers, offerQuantities]);

  function updateOfferQty(offerId: number, delta: number) {
    setOfferQuantities(prev => ({
      ...prev,
      [offerId]: Math.max(0, (prev[offerId] || 0) + delta),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activityId || !name) return;
    setSubmitting(true);

    const finalCount = hasOffers ? offersTotal.totalCount : count;
    const finalAmount = hasOffers ? offersTotal.totalAmount : (isPaid ? Number(paidAmount) || 0 : 0);

    const offerItems = hasOffers
      ? activeOffers.map((o: any, i: number) => ({
          offerId: o.id ?? i,
          description: o.description || o.name || '',
          quantity: offerQuantities[o.id ?? i] || 0,
          price: o.price || 0,
          clubShare: o.clubShare || 0,
          venueShare: o.venueShare || 0,
        })).filter((o: any) => o.quantity > 0)
      : [];

    try {
      await onSubmit({
        activityId: Number(activityId),
        name,
        phone,
        count: finalCount || 1,
        isFree,
        isPaid: isFree ? false : isPaid,
        paidAmount: isFree ? 0 : finalAmount,
        receivedBy: isPaid && !isFree ? receivedBy : '',
        notes,
        offerItems,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-gray-800/60 border border-gray-700/40 rounded-2xl p-6 backdrop-blur-sm"
    >
      <h3 className="text-lg font-bold text-white mb-4">حجز جديد</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* النشاط */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">النشاط *</label>
          <select
            value={activityId}
            onChange={e => { setActivityId(e.target.value); setOfferQuantities({}); }}
            required
            className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
          >
            <option value="">اختر النشاط</option>
            {availableActivities.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} — {new Date(a.date).toLocaleDateString('ar-EG')}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* الاسم */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">الاسم *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="اسم الحاجز"
              className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
            />
          </div>
          {/* الهاتف */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">رقم الهاتف</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="07XXXXXXXX"
              dir="ltr"
              className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
            />
          </div>
        </div>

        {/* عروض النشاط */}
        {hasOffers && (
          <div>
            <label className="block text-xs text-gray-400 mb-2">العروض (اختر الكمية)</label>
            <div className="space-y-2">
              {activeOffers.map((offer: any, i: number) => {
                const oid = offer.id ?? i;
                const qty = offerQuantities[oid] || 0;
                return (
                  <div key={oid} className="flex items-center gap-3 p-3 bg-gray-900/30 border border-gray-700/30 rounded-xl">
                    <div className="flex-1">
                      <p className="text-sm text-white">{offer.description || offer.name}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{offer.price} {CURRENCY}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => updateOfferQty(oid, -1)} className="w-8 h-8 rounded-lg bg-gray-700/50 text-white hover:bg-gray-700 transition text-lg">−</button>
                      <span className="w-8 text-center text-white font-bold">{qty}</span>
                      <button type="button" onClick={() => updateOfferQty(oid, 1)} className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition text-lg">+</button>
                    </div>
                  </div>
                );
              })}
              {/* ملخص العروض */}
              {offersTotal.totalCount > 0 && (
                <div className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-sm">
                  <span className="text-amber-300">المجموع: {offersTotal.totalCount} شخص</span>
                  <span className="text-amber-400 font-bold">{offersTotal.totalAmount} {CURRENCY}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* عدد الأشخاص — يختفي عند وجود عروض */}
          {!hasOffers && (
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">عدد الأشخاص</label>
              <input
                type="number"
                min="1"
                value={count}
                onChange={e => setCount(Number(e.target.value))}
                className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
              />
            </div>
          )}

          {/* نوع الحجز */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">نوع الحجز</label>
            <select
              value={isFree ? 'free' : 'paid'}
              onChange={e => setIsFree(e.target.value === 'free')}
              className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
            >
              <option value="paid">مدفوع</option>
              <option value="free">مجاني (ضيف)</option>
            </select>
          </div>

          {/* حالة الدفع */}
          {!isFree && (
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">حالة الدفع</label>
              <select
                value={isPaid ? 'paid' : 'unpaid'}
                onChange={e => setIsPaid(e.target.value === 'paid')}
                className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
              >
                <option value="unpaid">لم يدفع بعد</option>
                <option value="paid">تم الدفع</option>
              </select>
            </div>
          )}
        </div>

        {/* المستلم + المبلغ (عند الدفع) */}
        {!isFree && isPaid && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">الموظف المستلم</label>
              <select
                value={receivedBy}
                onChange={e => setReceivedBy(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
              >
                <option value="">غير محدد</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.displayName}>{s.displayName}</option>
                ))}
              </select>
            </div>
            {/* المبلغ — فقط بدون عروض */}
            {!hasOffers && (
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">المبلغ المدفوع ({CURRENCY})</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={paidAmount}
                  onChange={e => setPaidAmount(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
                />
              </div>
            )}
          </div>
        )}

        {/* ملاحظات */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">ملاحظات</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="ملاحظات اختيارية..."
            className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
          />
        </div>

        {/* أزرار */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || !activityId || !name}
            className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-rose-600 text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? 'جاري الحفظ...' : 'إضافة الحجز'}
          </button>
          <button type="button" onClick={onCancel} className="px-6 py-3 bg-gray-700/50 text-gray-300 rounded-xl hover:bg-gray-700/70 transition text-sm">
            إلغاء
          </button>
        </div>
      </form>
    </motion.div>
  );
}
