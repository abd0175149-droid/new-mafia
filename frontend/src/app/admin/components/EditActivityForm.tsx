'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface EditActivityFormProps {
  activity: any;
  locations: any[];
  onSubmit: (id: number, data: any) => Promise<void>;
  onCancel: () => void;
}

const CURRENCY = 'د.أ';

export default function EditActivityForm({ activity, locations, onSubmit, onCancel }: EditActivityFormProps) {
  const [name, setName] = useState(activity.name || '');
  const [date, setDate] = useState('');
  const [locationId, setLocationId] = useState<string>(String(activity.locationId || ''));
  const [enabledOfferIds, setEnabledOfferIds] = useState<number[]>(activity.enabledOfferIds || []);
  const [basePrice, setBasePrice] = useState(String(activity.basePrice || 0));
  const [description, setDescription] = useState(activity.description || '');
  const [driveLink, setDriveLink] = useState(activity.driveLink || '');
  const [submitting, setSubmitting] = useState(false);

  // تحويل التاريخ لصيغة datetime-local — بدون تحويل timezone
  useEffect(() => {
    if (activity.date) {
      const s = String(activity.date);
      // استخراج التاريخ والوقت مباشرة من النص بدون new Date()
      const match = s.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
      if (match) {
        setDate(`${match[1]}T${match[2]}`);
      } else {
        // fallback: إذا الصيغة مختلفة (مثلاً "2026-04-28 18:30:00")
        const match2 = s.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
        if (match2) {
          setDate(`${match2[1]}T${match2[2]}`);
        } else {
          // آخر fallback
          const d = new Date(activity.date);
          const pad = (n: number) => String(n).padStart(2, '0');
          setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
        }
      }
    }
  }, [activity.date]);

  const selectedLocation = locations.find(l => l.id === Number(locationId));
  const locationOffers: any[] = selectedLocation?.offers || [];
  const hasOffers = enabledOfferIds.length > 0;

  // عند تغيير المكان → إفراغ العروض
  function handleLocationChange(newId: string) {
    setLocationId(newId);
    setEnabledOfferIds([]);
  }

  function toggleOffer(offerId: number) {
    setEnabledOfferIds(prev =>
      prev.includes(offerId) ? prev.filter(id => id !== offerId) : [...prev, offerId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(activity.id, {
        name,
        date: date || undefined,
        description,
        basePrice: hasOffers ? 0 : Number(basePrice) || 0,
        locationId: locationId ? Number(locationId) : null,
        enabledOfferIds: hasOffers ? enabledOfferIds : [],
        driveLink,
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
      <h3 className="text-lg font-bold text-white mb-4">تعديل النشاط</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* الاسم */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">اسم النشاط</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
            />
          </div>

          {/* التاريخ */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">التاريخ والوقت</label>
            <input
              type="datetime-local"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* المكان */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">موقع الفعالية</label>
            <select
              value={locationId}
              onChange={e => handleLocationChange(e.target.value)}
              className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
            >
              <option value="">غير محدد</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>

          {/* سعر التذكرة */}
          {!hasOffers && (
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">سعر التذكرة ({CURRENCY})</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={basePrice}
                onChange={e => setBasePrice(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
              />
            </div>
          )}
        </div>

        {/* العروض */}
        <AnimatePresence>
          {locationOffers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <label className="block text-xs text-gray-400 mb-2">العروض المتاحة</label>
              <div className="space-y-2">
                {locationOffers.map((offer: any, i: number) => (
                  <label
                    key={offer.id || i}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      enabledOfferIds.includes(offer.id || i)
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : 'bg-gray-900/30 border-gray-700/30 hover:border-gray-600/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={enabledOfferIds.includes(offer.id || i)}
                      onChange={() => toggleOffer(offer.id || i)}
                      className="mt-1 accent-amber-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm text-white">{offer.description || offer.name || `عرض ${i + 1}`}</p>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                        <span>السعر: <strong className="text-white">{offer.price || 0} {CURRENCY}</strong></span>
                        {offer.clubShare !== undefined && (
                          <span>حصة النادي: <strong className="text-emerald-400">{offer.clubShare} {CURRENCY}</strong></span>
                        )}
                        {offer.venueShare !== undefined && (
                          <span>حصة المكان: <strong className="text-blue-400">{offer.venueShare} {CURRENCY}</strong></span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* الوصف */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">الوصف</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="وصف اختياري..."
            className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
          />
        </div>

        {/* رابط Drive */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">رابط Google Drive</label>
          <input
            type="text"
            value={driveLink}
            onChange={e => setDriveLink(e.target.value)}
            placeholder="https://drive.google.com/..."
            dir="ltr"
            className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
          />
        </div>

        {/* أزرار */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-rose-600 text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? 'جاري الحفظ...' : 'حفظ التعديلات'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3 bg-gray-700/50 text-gray-300 rounded-xl hover:bg-gray-700/70 transition text-sm"
          >
            إلغاء
          </button>
        </div>
      </form>
    </motion.div>
  );
}
