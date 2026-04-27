'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ActivityFormProps {
  locations: any[];
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}

const CURRENCY = 'د.أ';

// أسماء الأشهر بالعربي
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function ActivityForm({ locations, onSubmit, onCancel }: ActivityFormProps) {
  const [date, setDate] = useState('');
  const [locationId, setLocationId] = useState<string>('');
  const [enabledOfferIds, setEnabledOfferIds] = useState<number[]>([]);
  const [basePrice, setBasePrice] = useState('0');
  const [description, setDescription] = useState('');
  const [maxCapacity, setMaxCapacity] = useState('20');
  const [difficulty, setDifficulty] = useState('medium');
  const [submitting, setSubmitting] = useState(false);

  // عروض المكان المختار
  const selectedLocation = locations.find(l => l.id === Number(locationId));
  const locationOffers: any[] = selectedLocation?.offers || [];
  const hasOffers = enabledOfferIds.length > 0;

  // عند تغيير المكان: إفراغ العروض
  useEffect(() => {
    setEnabledOfferIds([]);
  }, [locationId]);

  // توليد اسم النشاط تلقائياً
  function generateName(): string {
    if (!date) return '';
    const d = new Date(date);
    const locName = selectedLocation?.name || '';
    const day = d.getDate();
    const month = AR_MONTHS[d.getMonth()];
    return `${locName} ${day} ${month}`.trim();
  }

  // تفعيل/إلغاء عرض
  function toggleOffer(offerId: number) {
    setEnabledOfferIds(prev =>
      prev.includes(offerId) ? prev.filter(id => id !== offerId) : [...prev, offerId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return;
    setSubmitting(true);

    try {
      const d = new Date(date);
      const locName = selectedLocation?.name || 'Activity';
      const enDate = `${EN_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      const driveFolderName = `${locName} ${enDate}`;

      // Create Drive Folder First
      let driveLink = '';
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/drive/folder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: driveFolderName, parentId: '1MLgq3qx0by7pi_MStkAofEiUYb4n33ml' })
        });
        if (res.ok) {
          const driveData = await res.json();
          driveLink = driveData.webViewLink || '';
        } else {
          console.error('Failed to create Drive folder:', await res.json());
        }
      } catch (err) {
        console.error('Drive integration error:', err);
      }

      await onSubmit({
        name: generateName() || `نشاط ${d.toLocaleDateString('ar-EG')}`,
        date,
        description,
        basePrice: hasOffers ? 0 : Number(basePrice) || 0,
        locationId: locationId ? Number(locationId) : null,
        enabledOfferIds: hasOffers ? enabledOfferIds : [],
        status: 'planned',
        maxCapacity: Number(maxCapacity) || 20,
        difficulty,
        driveLink
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
      <h3 className="text-lg font-bold text-white mb-4">إضافة نشاط جديد</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* التاريخ */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">التاريخ والوقت *</label>
            <input
              type="datetime-local"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
            />
          </div>

          {/* المكان */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">موقع الفعالية</label>
            <select
              value={locationId}
              onChange={e => setLocationId(e.target.value)}
              className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
            >
              <option value="">غير محدد</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* سعر التذكرة — يختفي عند وجود عروض */}
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

          {/* الوصف */}
          <div className={hasOffers ? 'md:col-span-2' : ''}>
            <label className="block text-xs text-gray-400 mb-1.5">الوصف</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="وصف اختياري..."
              className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
            />
          </div>
        </div>

        {/* السعة القصوى + مستوى الصعوبة */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">السعة القصوى (عدد اللاعبين)</label>
            <input
              type="number"
              min="4"
              max="100"
              value={maxCapacity}
              onChange={e => setMaxCapacity(e.target.value)}
              className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">مستوى الصعوبة</label>
            <select
              value={difficulty}
              onChange={e => setDifficulty(e.target.value)}
              className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
            >
              <option value="easy">🟢 سهل</option>
              <option value="medium">🟡 متوسط</option>
              <option value="hard">🔴 صعب</option>
              <option value="expert">🟣 خبير</option>
            </select>
          </div>
        </div>

        {/* الاسم المُولّد */}
        {date && (
          <div className="text-xs text-gray-500">
            اسم النشاط: <strong className="text-amber-400">{generateName() || '—'}</strong>
          </div>
        )}

        {/* أزرار */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || !date}
            className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? 'جاري الإضافة...' : 'إضافة النشاط'}
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
