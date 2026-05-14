'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ActivityFormProps {
  locations: any[];
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}

const CURRENCY = 'د.أ';
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }

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
  const [sendNotification, setSendNotification] = useState(true);
  const [requireTicket, setRequireTicket] = useState(false);

  // Tickets
  const [availableTickets, setAvailableTickets] = useState<any[]>([]);
  const [selectedTicketIds, setSelectedTicketIds] = useState<number[]>([]);
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketsLoading, setTicketsLoading] = useState(false);

  const selectedLocation = locations.find(l => l.id === Number(locationId));
  const locationOffers: any[] = selectedLocation?.offers || [];
  const hasOffers = enabledOfferIds.length > 0;

  useEffect(() => { setEnabledOfferIds([]); }, [locationId]);

  // جلب التذاكر عند تفعيل requireTicket
  useEffect(() => {
    if (!requireTicket) { setAvailableTickets([]); setSelectedTicketIds([]); return; }
    setTicketsLoading(true);
    const token = getToken();
    fetch(`${API_URL}/api/tickets/available`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setAvailableTickets(Array.isArray(data) ? data : []))
      .catch(() => setAvailableTickets([]))
      .finally(() => setTicketsLoading(false));
  }, [requireTicket]);

  function generateName(): string {
    if (!date) return '';
    const d = new Date(date);
    const locName = selectedLocation?.name || '';
    return `${locName} ${d.getDate()} ${AR_MONTHS[d.getMonth()]}`.trim();
  }

  function toggleOffer(offerId: number) {
    setEnabledOfferIds(prev =>
      prev.includes(offerId) ? prev.filter(id => id !== offerId) : [...prev, offerId]
    );
  }

  function toggleTicket(id: number) {
    setSelectedTicketIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
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
      let driveLink = '';
      try {
        const token = getToken();
        const res = await fetch(`${API_URL}/api/drive/folder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: `${locName} ${enDate}`, parentId: '1MLgq3qx0by7pi_MStkAofEiUYb4n33ml' })
        });
        if (res.ok) { const d2 = await res.json(); driveLink = d2.webViewLink || ''; }
      } catch {}

      await onSubmit({
        name: generateName() || `نشاط ${d.toLocaleDateString('ar-EG')}`,
        date, description,
        basePrice: hasOffers ? 0 : Number(basePrice) || 0,
        locationId: locationId ? Number(locationId) : null,
        enabledOfferIds: hasOffers ? enabledOfferIds : [],
        status: 'planned',
        maxCapacity: Number(maxCapacity) || 20,
        difficulty, driveLink, sendNotification, requireTicket,
        selectedTicketIds: requireTicket ? selectedTicketIds : [],
      });
    } finally { setSubmitting(false); }
  }

  const filteredTickets = availableTickets.filter(t =>
    !ticketSearch || t.ticketNumber.toLowerCase().includes(ticketSearch.toLowerCase())
  );

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      className="bg-gray-800/60 border border-gray-700/40 rounded-2xl p-6 backdrop-blur-sm">
      <h3 className="text-lg font-bold text-white mb-4">إضافة نشاط جديد</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">التاريخ والوقت *</label>
            <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} required
              className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">موقع الفعالية</label>
            <select value={locationId} onChange={e => setLocationId(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-sm">
              <option value="">غير محدد</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>

        {date && selectedLocation && (
          <div className="text-xs text-gray-500">اسم النشاط: <span className="text-amber-400 font-bold">{generateName()}</span></div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">سعر التذكرة ({CURRENCY})</label>
            <input type="number" value={basePrice} onChange={e => setBasePrice(e.target.value)} min="0" step="0.5"
              className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">الوصف</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="وصف اختياري.."
              className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">السعة القصوى (عدد اللاعبين)</label>
            <input type="number" value={maxCapacity} onChange={e => setMaxCapacity(e.target.value)} min="2" max="100"
              className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">مستوى الصعوبة</label>
            <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-sm">
              <option value="easy">🟢 سهل</option>
              <option value="medium">🟡 متوسط</option>
              <option value="hard">🔴 صعب</option>
              <option value="expert">🟣 خبير</option>
            </select>
          </div>
        </div>

        {/* Offers */}
        {locationOffers.length > 0 && (
          <div className="space-y-2">
            <label className="block text-xs text-gray-400">العروض المتاحة</label>
            <div className="flex flex-wrap gap-2">
              {locationOffers.map((offer: any) => (
                <button key={offer.id} type="button" onClick={() => toggleOffer(offer.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition ${enabledOfferIds.includes(offer.id) ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'border-gray-600/30 text-gray-400 hover:border-gray-500'}`}>
                  {offer.name} — {offer.price} {CURRENCY}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notification */}
        <div onClick={() => setSendNotification(v => !v)}
          className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all select-none ${sendNotification ? 'bg-amber-500/10 border-amber-500/30' : 'bg-gray-900/40 border-gray-700/30'}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔔</span>
            <div>
              <p className="text-sm font-medium text-white">إرسال إشعار للاعبين</p>
              <p className="text-xs text-gray-500 mt-0.5">{sendNotification ? 'سيتلقى جميع اللاعبين إشعار Push بهذا النشاط الجديد' : 'لن يتم إرسال إشعارات'}</p>
            </div>
          </div>
          <div className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${sendNotification ? 'bg-amber-500' : 'bg-gray-600'}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${sendNotification ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
        </div>

        {/* Require Ticket Toggle */}
        <div onClick={() => setRequireTicket(v => !v)}
          className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all select-none ${requireTicket ? 'bg-purple-500/10 border-purple-500/30' : 'bg-gray-900/40 border-gray-700/30'}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{requireTicket ? '🎫' : '🔓'}</span>
            <div>
              <p className="text-sm font-medium text-white">{requireTicket ? 'يتطلب رقم تذكرة للدخول' : 'دخول بدون تذكرة'}</p>
              <p className="text-xs text-gray-500 mt-0.5">{requireTicket ? 'اللاعب يجب أن يدخل رقم تذكرة صالح عند الانضمام' : 'اللاعب يدخل الغرفة مباشرة بدون الحاجة لتذكرة'}</p>
            </div>
          </div>
          <div className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${requireTicket ? 'bg-purple-500' : 'bg-gray-600'}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${requireTicket ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
        </div>

        {/* ── Ticket Picker ── */}
        <AnimatePresence>
          {requireTicket && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-400">🎫 اختر التذاكر لهذا النشاط ({selectedTicketIds.length} مختارة)</span>
                  {filteredTickets.length > 0 && (
                    <button type="button" onClick={() => setSelectedTicketIds(filteredTickets.map(t => t.id))}
                      className="text-[10px] px-2 py-1 bg-purple-500/20 border border-purple-500/30 rounded-lg text-purple-400 hover:bg-purple-500/30 transition">
                      اختيار الكل ({filteredTickets.length})
                    </button>
                  )}
                </div>

                <input type="text" value={ticketSearch} onChange={e => setTicketSearch(e.target.value)}
                  placeholder="🔍 بحث برقم التذكرة..." dir="ltr"
                  className="w-full px-3 py-1.5 bg-gray-900/60 border border-gray-600/20 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/30 text-xs font-mono" />

                {ticketsLoading ? (
                  <p className="text-xs text-gray-500 text-center py-2">⏳ جارٍ التحميل...</p>
                ) : availableTickets.length === 0 ? (
                  <div className="text-center py-3">
                    <p className="text-xs text-gray-500">لا توجد تذاكر متاحة</p>
                    <a href="/admin/tickets" target="_blank" className="text-[10px] text-purple-400 hover:underline">← أضف تذاكر أولاً</a>
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {filteredTickets.slice(0, 50).map(t => {
                      const sel = selectedTicketIds.includes(t.id);
                      return (
                        <div key={t.id} onClick={() => toggleTicket(t.id)}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition text-xs ${sel ? 'bg-purple-500/15 border border-purple-500/30' : 'bg-gray-800/30 hover:bg-gray-700/30 border border-transparent'}`}>
                          <div className="flex items-center gap-2">
                            <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${sel ? 'bg-purple-500 border-purple-500 text-white' : 'border-gray-600'}`}>
                              {sel && '✓'}
                            </span>
                            <span className="font-mono text-white">{t.ticketNumber}</span>
                            {t.batchName && <span className="text-gray-600">{t.batchName}</span>}
                          </div>
                          {t.price && <span className="text-gray-500 font-mono">{t.price} {CURRENCY}</span>}
                        </div>
                      );
                    })}
                    {filteredTickets.length > 50 && <p className="text-[10px] text-gray-600 text-center">... و {filteredTickets.length - 50} أخرى</p>}
                  </div>
                )}

                {selectedTicketIds.length > 0 && (
                  <div className="flex items-center justify-between pt-1 border-t border-purple-500/10">
                    <span className="text-[11px] text-emerald-400">✅ {selectedTicketIds.length} تذكرة سيتم ربطها بالنشاط عند الإنشاء</span>
                    <button type="button" onClick={() => setSelectedTicketIds([])} className="text-[10px] text-rose-400/60 hover:text-rose-400">مسح الكل</button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={submitting || !date}
            className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50">
            {submitting ? 'جاري الإضافة...' : 'إضافة النشاط'}
          </button>
          <button type="button" onClick={onCancel}
            className="px-6 py-3 bg-gray-700/50 text-gray-300 rounded-xl hover:bg-gray-700/70 transition text-sm">
            إلغاء
          </button>
        </div>
      </form>
    </motion.div>
  );
}
