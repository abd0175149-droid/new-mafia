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

const STATUS_OPTIONS = [
  { value: 'planned', label: 'مخطط له', icon: '📅', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  { value: 'active', label: 'نشط حالياً', icon: '🟢', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  { value: 'completed', label: 'مكتمل', icon: '✅', color: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
  { value: 'cancelled', label: 'ملغي', icon: '❌', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'سهل', icon: '🟢' },
  { value: 'medium', label: 'متوسط', icon: '🟡' },
  { value: 'hard', label: 'صعب', icon: '🔴' },
  { value: 'expert', label: 'خبير', icon: '🟣' },
];

// ── مكون قسم قابل للطي ──
function Section({ 
  id, 
  title, 
  icon, 
  activeSection, 
  setActiveSection, 
  children 
}: { 
  id: string; 
  title: string; 
  icon: string; 
  activeSection: string | null;
  setActiveSection: (val: string | null) => void;
  children: React.ReactNode;
}) {
  const isOpen = activeSection === id;
  return (
    <div className="border border-gray-700/30 rounded-xl overflow-hidden transition-colors hover:border-gray-600/40">
      <button
        type="button"
        onClick={() => setActiveSection(isOpen ? null : id)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-900/40 hover:bg-gray-800/50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-white">
          <span>{icon}</span> {title}
        </span>
        <span className="text-gray-500 text-xs">{isOpen ? '▲' : '▼'}</span>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4 border-t border-gray-700/20">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function EditActivityForm({ activity, locations, onSubmit, onCancel }: EditActivityFormProps) {
  // ── الحقول الأساسية ──
  const [name, setName] = useState(activity.name || '');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState(activity.description || '');
  const [status, setStatus] = useState(activity.status || 'planned');

  // ── المكان والعروض ──
  const [locationId, setLocationId] = useState<string>(String(activity.locationId || ''));
  const [enabledOfferIds, setEnabledOfferIds] = useState<number[]>(activity.enabledOfferIds || []);

  // ── الأسعار والسعة ──
  const [basePrice, setBasePrice] = useState(String(activity.basePrice || 0));
  const [maxCapacity, setMaxCapacity] = useState(String(activity.maxCapacity || 20));
  const [difficulty, setDifficulty] = useState(activity.difficulty || 'medium');

  // ── روابط ──
  const [driveLink, setDriveLink] = useState(activity.driveLink || '');

  // ── نظام التذاكر ──
  const [requireTicket, setRequireTicket] = useState(activity.requireTicket || false);

  // ── UI ──
  const [submitting, setSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>('basic');

  // تحويل التاريخ لصيغة datetime-local بتوقيت الأردن
  useEffect(() => {
    if (activity.date) {
      const d = new Date(activity.date);
      if (!isNaN(d.getTime())) {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Amman',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false,
        }).formatToParts(d);

        const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
        setDate(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`);
      }
    }
  }, [activity.date]);

  const selectedLocation = locations.find(l => l.id === Number(locationId));
  const locationOffers: any[] = selectedLocation?.offers || [];
  const hasOffers = enabledOfferIds.length > 0;

  function handleLocationChange(newId: string) {
    setLocationId(newId);
    setEnabledOfferIds([]);
  }

  function toggleOffer(offerId: number) {
    setEnabledOfferIds(prev =>
      prev.includes(offerId) ? prev.filter(id => id !== offerId) : [...prev, offerId]
    );
  }

  // ── حساب التغييرات ──
  const hasChanges = (() => {
    if (name !== (activity.name || '')) return true;
    if (description !== (activity.description || '')) return true;
    if (status !== (activity.status || 'planned')) return true;
    if (locationId !== String(activity.locationId || '')) return true;
    if (basePrice !== String(activity.basePrice || 0)) return true;
    if (maxCapacity !== String(activity.maxCapacity || 20)) return true;
    if (difficulty !== (activity.difficulty || 'medium')) return true;
    if (driveLink !== (activity.driveLink || '')) return true;
    if (JSON.stringify(enabledOfferIds) !== JSON.stringify(activity.enabledOfferIds || [])) return true;
    if (requireTicket !== (activity.requireTicket || false)) return true;
    return false;
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(activity.id, {
        name,
        date: date || undefined,
        description,
        status,
        basePrice: hasOffers ? 0 : Number(basePrice) || 0,
        locationId: locationId ? Number(locationId) : null,
        enabledOfferIds: hasOffers ? enabledOfferIds : [],
        maxCapacity: Number(maxCapacity) || 20,
        difficulty,
        driveLink,
        requireTicket,
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
      {/* ── العنوان ── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-xl">✏️</div>
          <div>
            <h3 className="text-lg font-bold text-white">تعديل النشاط</h3>
            <p className="text-xs text-gray-500">{activity.name}</p>
          </div>
        </div>
        <button type="button" onClick={onCancel} className="text-gray-500 hover:text-white transition text-lg">✕</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* ══════════════════════════════════════════ */}
        {/* القسم 1: المعلومات الأساسية              */}
        {/* ══════════════════════════════════════════ */}
        <Section id="basic" title="المعلومات الأساسية" icon="📝" activeSection={activeSection} setActiveSection={setActiveSection}>
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

          {/* الوصف */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">الوصف</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="وصف اختياري للنشاط..."
              rows={3}
              className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm resize-none"
            />
          </div>
        </Section>

        {/* ══════════════════════════════════════════ */}
        {/* القسم 2: الحالة والإعدادات                */}
        {/* ══════════════════════════════════════════ */}
        <Section id="settings" title="الحالة والإعدادات" icon="⚙️" activeSection={activeSection} setActiveSection={setActiveSection}>
          {/* حالة النشاط */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">حالة النشاط</label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    status === opt.value
                      ? opt.color + ' ring-1 ring-current'
                      : 'bg-gray-900/40 border-gray-700/30 text-gray-500 hover:border-gray-600/50'
                  }`}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* السعة القصوى */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">السعة القصوى (لاعب)</label>
              <input
                type="number"
                min="4"
                max="100"
                value={maxCapacity}
                onChange={e => setMaxCapacity(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
              />
            </div>

            {/* مستوى الصعوبة */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">مستوى الصعوبة</label>
              <div className="flex gap-1.5">
                {DIFFICULTY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDifficulty(opt.value)}
                    className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg border text-xs transition-all ${
                      difficulty === opt.value
                        ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 ring-1 ring-amber-500/30'
                        : 'bg-gray-900/40 border-gray-700/30 text-gray-500 hover:border-gray-600/50'
                    }`}
                  >
                    <span>{opt.icon}</span>
                    <span className="text-[10px]">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ══════════════════════════════════════════ */}
        {/* القسم 3: المكان والعروض والأسعار          */}
        {/* ══════════════════════════════════════════ */}
        <Section id="pricing" title="المكان والأسعار" icon="💰" activeSection={activeSection} setActiveSection={setActiveSection}>
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

          {/* العروض */}
          <AnimatePresence>
            {locationOffers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <label className="block text-xs text-gray-400 mb-2">العروض المتاحة من المكان</label>
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

          {/* سعر التذكرة — يظهر فقط بدون عروض */}
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

          {hasOffers && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-400">
              💡 سعر التذكرة مخفي لأنك فعّلت عروضاً — الأسعار تُحسب تلقائياً من العروض المفعّلة.
            </div>
          )}
        </Section>

        {/* ══════════════════════════════════════════ */}
        {/* القسم 4: رابط Drive                       */}
        {/* ══════════════════════════════════════════ */}
        <Section id="drive" title="Google Drive" icon="📂" activeSection={activeSection} setActiveSection={setActiveSection}>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">رابط مجلد Google Drive</label>
            <input
              type="text"
              value={driveLink}
              onChange={e => setDriveLink(e.target.value)}
              placeholder="https://drive.google.com/..."
              dir="ltr"
              className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm font-mono text-xs"
            />
          </div>
          {driveLink && (
            <a
              href={driveLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition"
            >
              📂 فتح المجلد في Drive ←
            </a>
          )}
        </Section>

        {/* ══════════════════════════════════════════ */}
        {/* القسم 5: نظام التذاكر                    */}
        {/* ══════════════════════════════════════════ */}
        <Section id="tickets" title="نظام التذاكر" icon="🎫" activeSection={activeSection} setActiveSection={setActiveSection}>
          <div
            onClick={() => setRequireTicket((v: boolean) => !v)}
            className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all select-none ${
              requireTicket
                ? 'bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/15'
                : 'bg-gray-900/40 border-gray-700/30 hover:border-gray-600/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{requireTicket ? '🎫' : '🔓'}</span>
              <div>
                <p className="text-sm font-medium text-white">
                  {requireTicket ? 'يتطلب رقم تذكرة للدخول' : 'دخول بدون تذكرة'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {requireTicket
                    ? 'اللاعب يجب أن يدخل رقم تذكرة صالح عند الانضمام'
                    : 'اللاعب يدخل الغرفة مباشرة بدون الحاجة لتذكرة'}
                </p>
              </div>
            </div>
            <div className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
              requireTicket ? 'bg-purple-500' : 'bg-gray-600'
            }`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                requireTicket ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </div>
          </div>

          {requireTicket && (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 text-xs text-purple-400">
              💡 لرفع أرقام التذاكر: اذهب لصفحة تفاصيل النشاط → قسم التذاكر → رفع ملف Excel
            </div>
          )}
        </Section>

        {/* ══════════════════════════════════════════ */}
        {/* أزرار الحفظ والإلغاء                      */}
        {/* ══════════════════════════════════════════ */}
        <div className="flex items-center gap-3 pt-3 border-t border-gray-700/20">
          <button
            type="submit"
            disabled={submitting || !hasChanges}
            className={`flex-1 py-3 font-bold rounded-xl transition text-sm ${
              hasChanges
                ? 'bg-gradient-to-r from-amber-500 to-rose-600 text-white hover:opacity-90'
                : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                جاري الحفظ...
              </span>
            ) : hasChanges ? '💾 حفظ التعديلات' : 'لا توجد تعديلات'}
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
