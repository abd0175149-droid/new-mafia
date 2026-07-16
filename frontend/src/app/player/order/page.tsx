'use client';

// ══════════════════════════════════════════════════════
// 🍽️ اطلب من المكان — /player/order
// يظهر فقط عندما يكون للاعب سياق طلب (حجز + نافذة الفعاليّة أو غرفة حيّة)
// تسعير العرض إرشاديّ — الخادم يعيد التسعير من قاعدة البيانات عند الإرسال
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayer } from '@/context/PlayerContext';
import { useRouter } from 'next/navigation';

interface Ctx {
  activityId: number;
  activityName: string;
  locationName: string;
  source: 'live' | 'booking';
}
interface Item { id: number; category: string; name: string; description: string; price: string; imageUrl: string | null }
interface MyOrder {
  id: number; status: string; total: string; note: string; createdAt: string;
  items: { name: string; unitPrice: string; quantity: number }[];
}

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  new: { label: 'جديد — بانتظار المكان', color: '#3b82f6', icon: '🕐' },
  preparing: { label: 'قيد التحضير', color: '#f59e0b', icon: '👨‍🍳' },
  delivered: { label: 'تمّ التسليم', color: '#22c55e', icon: '✅' },
  cancelled: { label: 'ملغى', color: '#6b7280', icon: '✖️' },
};

export default function PlayerOrderPage() {
  const { player } = usePlayer();
  const router = useRouter();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [myOrders, setMyOrders] = useState<MyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Map<number, number>>(new Map());
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);

  const headers = useMemo(() => ({ Authorization: `Bearer ${player?.token || ''}` }), [player?.token]);

  const loadOrders = useCallback((activityId: number) => {
    fetch(`/api/fnb/my-orders?activityId=${activityId}`, { headers })
      .then(r => r.json())
      .then(d => { if (d.success) setMyOrders(d.orders); })
      .catch(() => {});
  }, [headers]);

  useEffect(() => {
    if (!player) return;
    fetch('/api/fnb/context', { headers })
      .then(r => r.json())
      .then(async (d) => {
        if (!d.success || !d.context) { setReason(d.reason || ''); return; }
        setCtx(d.context);
        const menuRes = await fetch(`/api/fnb/menu?activityId=${d.context.activityId}`, { headers }).then(r => r.json());
        if (menuRes.success) setItems(menuRes.items);
        loadOrders(d.context.activityId);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // تحديث حالة الطلبات عند العودة للتبويب + كل 30 ثانية
  useEffect(() => {
    if (!ctx) return;
    const refresh = () => { if (document.visibilityState === 'visible') loadOrders(ctx.activityId); };
    const iv = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', refresh); };
  }, [ctx, loadOrders]);

  const setQty = (id: number, qty: number) => {
    setCart(prev => {
      const next = new Map(prev);
      if (qty <= 0) next.delete(id); else next.set(id, Math.min(qty, 20));
      return next;
    });
  };

  const cartCount = Array.from(cart.values()).reduce((s, q) => s + q, 0);
  const cartTotal = Array.from(cart.entries()).reduce((s, [id, q]) => {
    const it = items.find(i => i.id === id);
    return s + (it ? parseFloat(it.price) * q : 0);
  }, 0);

  const submit = async () => {
    if (cartCount === 0 || !ctx) return;
    setSending(true); setErr('');
    try {
      const r = await fetch('/api/fnb/orders', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: Array.from(cart.entries()).map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
          note: note.trim(),
        }),
      });
      const d = await r.json();
      if (d.success) {
        setCart(new Map()); setNote(''); setSent(true);
        loadOrders(ctx.activityId);
        setTimeout(() => setSent(false), 2500);
      } else setErr(d.error || 'فشل إرسال الطلب');
    } catch { setErr('خطأ في الاتصال'); }
    setSending(false);
  };

  const cancelOrder = async (id: number) => {
    if (!ctx) return;
    const r = await fetch(`/api/fnb/orders/${id}/cancel`, { method: 'POST', headers }).then(x => x.json()).catch(() => ({ success: false }));
    if (r.success) loadOrders(ctx.activityId);
    else setErr(r.error || 'تعذّر الإلغاء');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-16 text-center" dir="rtl">
        <div className="text-5xl mb-4">🍽️</div>
        <h1 className="text-white text-lg font-bold mb-2">لا يوجد نشاط متاح للطلب الآن</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          {reason || 'الطلب من المكان يفتح للحاجزين قبل ساعةٍ من موعد الفعاليّة وأثناءها.'}
        </p>
        <button onClick={() => router.push('/player/home')} className="text-emerald-400 text-sm underline">← الرئيسيّة</button>
      </div>
    );
  }

  const categories = Array.from(new Set(items.map(i => i.category || '')));
  const activeOrders = myOrders.filter(o => o.status !== 'cancelled');

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 space-y-5 pb-32" dir="rtl">
      {/* ── الترويسة ── */}
      <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,5,5,0.9))', border: '1px solid rgba(16,185,129,0.25)' }}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">🍽️</span>
          <div>
            <h1 className="text-white text-base font-bold">اطلب من {ctx.locationName}</h1>
            <p className="text-gray-500 text-[11px] mt-0.5">
              {ctx.activityName} • {ctx.source === 'live' ? '🎮 أنت داخل اللعبة' : '🎟️ حجزك مؤكّد للطلب'}
            </p>
          </div>
        </div>
      </div>

      {/* ── طلباتي ── */}
      {myOrders.length > 0 && (
        <div>
          <h2 className="text-white text-sm font-semibold mb-2">📋 طلباتي ({activeOrders.length})</h2>
          <div className="space-y-2">
            {myOrders.map(o => {
              const meta = STATUS_META[o.status] || STATUS_META.new;
              return (
                <div key={o.id} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${meta.color}25` }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium" style={{ color: meta.color }}>{meta.icon} {meta.label}</span>
                    <span className="text-white text-xs font-bold">{parseFloat(o.total).toFixed(2)} د.أ</span>
                  </div>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    {o.items.map(i => `${i.name} ×${i.quantity}`).join(' • ')}
                  </p>
                  {o.note && <p className="text-gray-600 text-[10px] mt-1">📝 {o.note}</p>}
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-gray-600 text-[9px]">
                      {new Date(o.createdAt).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {o.status === 'new' && (
                      <button onClick={() => cancelOrder(o.id)} className="text-[10px] text-rose-400/80 underline">إلغاء الطلب</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── المنيو ── */}
      {items.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-dashed border-gray-800">
          <p className="text-gray-500 text-sm">المكان لم يضف أصنافاً بعد</p>
        </div>
      ) : (
        categories.map(cat => (
          <div key={cat || '_none'}>
            <h3 className="text-xs font-bold text-emerald-400/80 mb-2 flex items-center gap-2">
              <span>{cat || 'المنيو'}</span>
              <span className="flex-1 h-px bg-emerald-500/10" />
            </h3>
            <div className="space-y-2">
              {items.filter(i => (i.category || '') === cat).map(it => {
                const qty = cart.get(it.id) || 0;
                return (
                  <div key={it.id} className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: qty > 0 ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center shrink-0">
                      {it.imageUrl ? <img src={it.imageUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-lg">🍴</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{it.name}</p>
                      {it.description && <p className="text-gray-600 text-[10px] truncate">{it.description}</p>}
                      <p className="text-emerald-400 text-[11px] font-bold mt-0.5">{parseFloat(it.price).toFixed(2)} د.أ</p>
                    </div>
                    {qty === 0 ? (
                      <button onClick={() => setQty(it.id, 1)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold shrink-0"
                        style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }}>
                        + أضف
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setQty(it.id, qty - 1)} className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-white text-sm">−</button>
                        <span className="text-white text-sm font-bold w-5 text-center">{qty}</span>
                        <button onClick={() => setQty(it.id, qty + 1)} className="w-7 h-7 rounded-lg text-sm font-bold" style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399' }}>+</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {err && <p className="text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">{err}</p>}

      {/* ── شريط السلّة الثابت ── */}
      <AnimatePresence>
        {cartCount > 0 && (
          <motion.div
            initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 120 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-20 inset-x-0 z-40 px-4"
          >
            <div className="max-w-lg mx-auto rounded-2xl p-3.5 backdrop-blur-xl" style={{ background: 'rgba(6,20,14,0.95)', border: '1px solid rgba(16,185,129,0.4)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }} dir="rtl">
              <input
                value={note} onChange={e => setNote(e.target.value)} maxLength={300}
                placeholder="ملاحظة للمكان (اختياريّ)…"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 mb-2.5 focus:outline-none focus:border-emerald-500/40"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={submit} disabled={sending}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #10b981, #0d9488)' }}
                >
                  {sending ? '⏳ يُرسل…' : `إرسال الطلب • ${cartTotal.toFixed(2)} د.أ`}
                </button>
                <div className="text-center shrink-0">
                  <div className="text-white text-sm font-bold">{cartCount}</div>
                  <div className="text-gray-500 text-[9px]">أصناف</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── تأكيد الإرسال ── */}
      <AnimatePresence>
        {sent && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center pointer-events-none">
            <div className="rounded-2xl px-6 py-5 text-center" style={{ background: 'rgba(6,20,14,0.97)', border: '1px solid rgba(16,185,129,0.5)' }}>
              <div className="text-4xl mb-2">✅</div>
              <p className="text-white text-sm font-bold">وصل طلبك للمكان!</p>
              <p className="text-gray-500 text-[11px] mt-1">تابع حالته في «طلباتي» أعلى الصفحة</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
