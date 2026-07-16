'use client';

// ══════════════════════════════════════════════════════
// 📥 صندوق الطلبات الحيّ — /venue/orders
// وصول لحظيّ عبر سوكيت location:{id} + مسح دوريّ احتياطيّ + بوش اختياريّ
// دورة الحالة: جديد → قيد التحضير → تمّ التسليم (أو إلغاء)
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVenue } from '../context';
import { getSocket } from '@/lib/socket';

interface VOrder {
  id: number;
  status: string;
  total: string;
  note: string;
  createdAt: string;
  playerName: string;
  physicalId: number | null;
  activityId: number;
  activityName: string;
  items: { name: string; unitPrice: string; quantity: number }[];
}

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  new: { label: 'جديد', color: '#3b82f6', icon: '🕐' },
  preparing: { label: 'قيد التحضير', color: '#f59e0b', icon: '👨‍🍳' },
  delivered: { label: 'تمّ التسليم', color: '#22c55e', icon: '✅' },
  cancelled: { label: 'ملغى', color: '#6b7280', icon: '✖️' },
};

const FILTERS = [
  { key: 'active', label: '🔥 النشطة' },
  { key: 'new', label: '🕐 جديد' },
  { key: 'preparing', label: '👨‍🍳 تحضير' },
  { key: 'delivered', label: '✅ سُلّم' },
  { key: 'all', label: 'الكل' },
];

// نغمة تنبيه قصيرة بلا ملفّ صوتيّ (طلب جديد)
function playDing() {
  try {
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    [880, 1174.7].forEach((freq, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.frequency.value = freq;
      o.type = 'sine';
      const t = ac.currentTime + i * 0.15;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.start(t); o.stop(t + 0.45);
    });
  } catch { /* بلا صوت */ }
}

export default function VenueOrdersPage() {
  const { locationId, authHeaders, can, isHQ } = useVenue();
  const [ordersList, setOrdersList] = useState<VOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');
  const [live, setLive] = useState(false);
  const [toast, setToast] = useState('');
  const [pushState, setPushState] = useState<'idle' | 'granted' | 'busy'>('idle');
  const [busyId, setBusyId] = useState<number | null>(null);
  const flashRef = useRef<Set<number>>(new Set());

  const locParam = isHQ && locationId ? `locationId=${locationId}` : '';
  const withLoc = (url: string) => locParam ? `${url}${url.includes('?') ? '&' : '?'}${locParam}` : url;

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(() => {
    if (!locationId) return;
    fetch(withLoc('/api/venue/orders'), { headers: authHeaders })
      .then(r => r.json())
      .then(d => { if (d.success) setOrdersList(d.orders); })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  useEffect(() => { load(); }, [load]);

  // ── سوكيت: انضمام لغرفة المكان + استقبال لحظيّ ──
  useEffect(() => {
    if (!locationId) return;
    const s = getSocket();

    const join = () => {
      s.emit('venue:join', { locationId }, (res: any) => setLive(!!res?.success));
    };
    if (s.connected) join();
    s.on('connect', join);

    const onNew = (data: { order: VOrder }) => {
      if (!data?.order) return;
      setOrdersList(prev => [data.order, ...prev.filter(o => o.id !== data.order.id)]);
      flashRef.current.add(data.order.id);
      setTimeout(() => { flashRef.current.delete(data.order.id); setOrdersList(p => [...p]); }, 6000);
      playDing();
      flash(`🍽️ طلب جديد من ${data.order.playerName}`);
    };
    const onUpdated = (data: { orderId: number; status: string }) => {
      setOrdersList(prev => prev.map(o => o.id === data.orderId ? { ...o, status: data.status } : o));
    };
    s.on('fnb:new-order', onNew);
    s.on('fnb:order-updated', onUpdated);

    // مسح احتياطيّ كل 30 ثانية + عند العودة للتبويب (لو فات بثّ)
    const refresh = () => { if (document.visibilityState === 'visible') load(); };
    const iv = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      s.off('connect', join);
      s.off('fnb:new-order', onNew);
      s.off('fnb:order-updated', onUpdated);
      clearInterval(iv);
      document.removeEventListener('visibilitychange', refresh);
      setLive(false);
    };
  }, [locationId, load]);

  // ── بوش: تسجيل جهاز المكان ──
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
        && localStorage.getItem('venue_push_registered') === '1') {
      setPushState('granted');
    }
  }, []);

  const enablePush = async () => {
    setPushState('busy');
    try {
      const { requestNotificationPermission } = await import('@/lib/firebase');
      const token = await requestNotificationPermission();
      if (!token) { flash('❌ لم يُمنح إذن الإشعارات'); setPushState('idle'); return; }
      const r = await fetch('/api/staff-notifications/register-token', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, deviceInfo: 'venue-console' }),
      }).then(x => x.json());
      if (r.success) { localStorage.setItem('venue_push_registered', '1'); setPushState('granted'); flash('🔔 ستصلك الطلبات الجديدة كإشعارات'); }
      else { flash('❌ فشل تسجيل الجهاز'); setPushState('idle'); }
    } catch { flash('❌ فشل تفعيل الإشعارات'); setPushState('idle'); }
  };

  const changeStatus = async (o: VOrder, status: string) => {
    if (status === 'cancelled' && !confirm(`إلغاء طلب ${o.playerName}؟ سيصله إشعار بالإلغاء.`)) return;
    setBusyId(o.id);
    const r = await fetch(withLoc(`/api/venue/orders/${o.id}/status`), {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).then(x => x.json()).catch(() => ({ success: false, error: 'خطأ في الاتصال' }));
    setBusyId(null);
    if (r.success) setOrdersList(prev => prev.map(x => x.id === o.id ? { ...x, status } : x));
    else flash(`❌ ${r.error || 'فشل تغيير الحالة'}`);
  };

  if (!can('orders.receive')) {
    return <div className="text-center py-16 text-gray-500 text-sm">ليس لدى حسابك صلاحيّة استقبال الطلبات</div>;
  }

  const canManage = can('orders.manage');
  const visible = ordersList.filter(o =>
    filter === 'all' ? true :
    filter === 'active' ? (o.status === 'new' || o.status === 'preparing') :
    o.status === filter
  );
  const counts = {
    new: ordersList.filter(o => o.status === 'new').length,
    preparing: ordersList.filter(o => o.status === 'preparing').length,
  };

  return (
    <div className="space-y-4">
      {/* ── الشريط العلويّ ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            📥 الطلبات
            <span className={`inline-block w-2 h-2 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} title={live ? 'متّصل لحظيّاً' : 'غير متّصل — يعمل المسح الدوريّ'} />
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {counts.new} جديد • {counts.preparing} قيد التحضير • آخر 24 ساعة
          </p>
        </div>
        {pushState !== 'granted' && (
          <button onClick={enablePush} disabled={pushState === 'busy'}
            className="text-[11px] px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 disabled:opacity-50">
            {pushState === 'busy' ? '⏳…' : '🔔 إشعارات الطلبات على هذا الجهاز'}
          </button>
        )}
      </div>

      {/* ── فلاتر ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors ${
              filter === f.key ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-gray-400 border border-transparent'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-gray-700">
          <div className="text-4xl mb-3">😌</div>
          <p className="text-gray-400 text-sm">لا طلبات {filter === 'active' ? 'نشطة' : ''} حاليّاً</p>
          <p className="text-gray-600 text-xs mt-1">الطلبات الجديدة تظهر هنا فوراً مع تنبيه صوتيّ</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map(o => {
            const meta = STATUS_META[o.status] || STATUS_META.new;
            const isFlashing = flashRef.current.has(o.id);
            return (
              <div key={o.id}
                className={`rounded-xl p-3.5 border transition-all ${isFlashing ? 'animate-pulse' : ''}`}
                style={{ background: isFlashing ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.03)', borderColor: `${meta.color}35` }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: `${meta.color}18`, color: meta.color }}>
                      {meta.icon} {meta.label}
                    </span>
                    <span className="text-white text-sm font-medium truncate">{o.playerName}</span>
                    {o.physicalId != null && <span className="text-[10px] text-gray-500 shrink-0">مقعد {o.physicalId}</span>}
                  </div>
                  <span className="text-emerald-400 text-sm font-bold shrink-0">{parseFloat(o.total).toFixed(2)} د.أ</span>
                </div>

                <div className="space-y-0.5 mb-2">
                  {o.items.map((i, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[12px]">
                      <span className="text-gray-300">{i.name} <span className="text-gray-600">×{i.quantity}</span></span>
                      <span className="text-gray-500">{(parseFloat(i.unitPrice) * i.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                {o.note && <p className="text-amber-400/90 text-[11px] mb-2">📝 {o.note}</p>}

                <div className="flex items-center justify-between">
                  <span className="text-gray-600 text-[10px]">
                    {o.activityName && `${o.activityName} • `}
                    {new Date(o.createdAt).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {canManage && (
                    <div className="flex gap-1.5">
                      {o.status === 'new' && (
                        <button onClick={() => changeStatus(o, 'preparing')} disabled={busyId === o.id}
                          className="text-[11px] px-3 py-1.5 rounded-lg font-bold bg-amber-500/15 border border-amber-500/35 text-amber-400 disabled:opacity-50">
                          👨‍🍳 بدء التحضير
                        </button>
                      )}
                      {(o.status === 'new' || o.status === 'preparing') && (
                        <>
                          <button onClick={() => changeStatus(o, 'delivered')} disabled={busyId === o.id}
                            className="text-[11px] px-3 py-1.5 rounded-lg font-bold bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 disabled:opacity-50">
                            ✅ تسليم
                          </button>
                          <button onClick={() => changeStatus(o, 'cancelled')} disabled={busyId === o.id}
                            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 disabled:opacity-50">
                            ✖️
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-gray-800 border border-emerald-500/30 rounded-xl px-4 py-2 text-sm shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
