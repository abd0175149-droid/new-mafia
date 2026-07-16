'use client';

// ══════════════════════════════════════════════════════
// 📥 صندوق الطلبات — الصفحة التشغيليّة الرئيسيّة لحساب المكان
// فلسفة: طابور عملٍ لا قائمة. الجديد أوّلاً وأكبر، إجراء رئيسيّ واحد لكل بطاقة،
// عدّاد انتظارٍ يتلوّن مع التأخّر، والسجلّ المنجز مطويّ بعيداً عن العين.
// وصول لحظيّ (سوكيت) + نغمة (قابلة للكتم) + بوش + مسح احتياطيّ.
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

// عمر الطلب بالدقائق + لون الاستعجال (للجديد وقيد التحضير)
function ageInfo(createdAt: string, now: number) {
  const mins = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60000));
  const color = mins >= 10 ? '#ef4444' : mins >= 5 ? '#f59e0b' : '#6b7280';
  const label = mins === 0 ? 'الآن' : `منذ ${mins} د`;
  return { mins, color, label };
}

export default function VenueOrdersPage() {
  const { locationId, authHeaders, can, isHQ } = useVenue();
  const [ordersList, setOrdersList] = useState<VOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [toast, setToast] = useState('');
  const [pushState, setPushState] = useState<'idle' | 'granted' | 'busy'>('idle');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [muted, setMuted] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const flashRef = useRef<Set<number>>(new Set());
  const mutedRef = useRef(false);

  const locParam = isHQ && locationId ? `locationId=${locationId}` : '';
  const withLoc = (url: string) => locParam ? `${url}${url.includes('?') ? '&' : '?'}${locParam}` : url;
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // ⏱️ تحديث عدّادات الانتظار كل 30 ثانية
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const m = localStorage.getItem('venue_sound_muted') === '1';
    setMuted(m); mutedRef.current = m;
  }, []);
  const toggleMute = () => {
    setMuted(prev => {
      const next = !prev;
      mutedRef.current = next;
      localStorage.setItem('venue_sound_muted', next ? '1' : '0');
      return next;
    });
  };

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
      if (!mutedRef.current) playDing();
      setNow(Date.now());
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
  const newOrders = ordersList.filter(o => o.status === 'new');
  const preparing = ordersList.filter(o => o.status === 'preparing');
  const done = ordersList.filter(o => o.status === 'delivered' || o.status === 'cancelled');
  const salesToday = ordersList.filter(o => o.status !== 'cancelled').reduce((s, o) => s + parseFloat(o.total), 0);
  const deliveredCount = ordersList.filter(o => o.status === 'delivered').length;

  // ── بطاقة طلب نشط (جديد/تحضير) — إجراء رئيسيّ واحد كبير ──
  const ActiveCard = ({ o }: { o: VOrder }) => {
    const isNew = o.status === 'new';
    const age = ageInfo(o.createdAt, now);
    const isFlashing = flashRef.current.has(o.id);
    const accent = isNew ? '#3b82f6' : '#f59e0b';
    return (
      <div
        className={`rounded-2xl p-4 border transition-all ${isFlashing ? 'animate-pulse' : ''}`}
        style={{
          background: isFlashing ? 'rgba(59,130,246,0.10)' : 'rgba(255,255,255,0.03)',
          borderColor: `${accent}45`,
          borderRightWidth: 4,
        }}
      >
        {/* الترويسة: مَن + متى + بكم */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="min-w-0">
            <p className="text-white text-[15px] font-bold truncate leading-tight">{o.playerName}</p>
            <p className="text-[10px] text-gray-500 mt-0.5 truncate">
              {o.physicalId != null && <span className="text-gray-400">مقعد {o.physicalId} • </span>}
              {o.activityName}
            </p>
          </div>
          <div className="text-left shrink-0">
            <p className="text-emerald-400 text-[15px] font-bold leading-tight">{parseFloat(o.total).toFixed(2)} <span className="text-[10px] font-normal">د.أ</span></p>
            <p className="text-[10px] font-bold mt-0.5" style={{ color: age.color }}>⏱ {age.label}</p>
          </div>
        </div>

        {/* البنود */}
        <div className="rounded-xl px-3 py-2 mb-2.5 space-y-1" style={{ background: 'rgba(0,0,0,0.25)' }}>
          {o.items.map((i, idx) => (
            <div key={idx} className="flex items-center justify-between text-[13px]">
              <span className="text-gray-200">
                <span className="inline-block min-w-[26px] font-bold" style={{ color: accent }}>×{i.quantity}</span>
                {i.name}
              </span>
              <span className="text-gray-500 text-[11px]">{(parseFloat(i.unitPrice) * i.quantity).toFixed(2)}</span>
            </div>
          ))}
          {o.note && (
            <p className="text-amber-300 text-[12px] pt-1 border-t border-white/5">📝 {o.note}</p>
          )}
        </div>

        {/* الإجراءات: رئيسيّ واحد كبير + إلغاء صغير */}
        {canManage && (
          <div className="flex gap-2">
            <button
              onClick={() => changeStatus(o, isNew ? 'preparing' : 'delivered')}
              disabled={busyId === o.id}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
              style={{ background: isNew ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#10b981,#0d9488)' }}
            >
              {busyId === o.id ? '⏳…' : isNew ? '👨‍🍳 بدء التحضير' : '✅ تسليم'}
            </button>
            {isNew && (
              <button
                onClick={() => changeStatus(o, 'delivered')}
                disabled={busyId === o.id}
                title="تسليم مباشر بلا تحضير"
                className="px-3.5 py-2.5 rounded-xl text-sm font-bold bg-emerald-500/12 border border-emerald-500/30 text-emerald-400 disabled:opacity-50"
              >
                ✅
              </button>
            )}
            <button
              onClick={() => changeStatus(o, 'cancelled')}
              disabled={busyId === o.id}
              title="إلغاء الطلب"
              className="px-3.5 py-2.5 rounded-xl text-sm bg-rose-500/8 border border-rose-500/20 text-rose-400/80 disabled:opacity-50"
            >
              ✖️
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* ── الترويسة: الحالة اللحظيّة + أدوات الجهاز ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold">📥 الطلبات</h2>
          <span
            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
              live ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/8' : 'text-gray-500 border-gray-700 bg-gray-800/50'
            }`}
            title={live ? 'متّصل — الطلبات تصل فوراً' : 'غير متّصل — يعمل المسح كل ٣٠ ثانية'}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
            {live ? 'مباشر' : 'مسح دوريّ'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleMute}
            title={muted ? 'الصوت مكتوم — اضغط للتفعيل' : 'نغمة الطلب الجديد مفعّلة'}
            className={`w-9 h-9 rounded-xl border text-base ${muted ? 'bg-gray-800/60 border-gray-700 text-gray-500' : 'bg-emerald-500/8 border-emerald-500/25 text-emerald-400'}`}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          {pushState !== 'granted' && (
            <button onClick={enablePush} disabled={pushState === 'busy'}
              className="text-[11px] px-3 h-9 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 disabled:opacity-50">
              {pushState === 'busy' ? '⏳…' : '🔔 إشعارات الجهاز'}
            </button>
          )}
        </div>
      </div>

      {/* ── نظرة الليلة: ٤ أرقام تُقرأ بلمحة ── */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'بالانتظار', value: newOrders.length, color: '#3b82f6', hot: newOrders.length > 0 },
          { label: 'قيد التحضير', value: preparing.length, color: '#f59e0b', hot: false },
          { label: 'سُلّم', value: deliveredCount, color: '#22c55e', hot: false },
          { label: 'مبيعات (د.أ)', value: salesToday.toFixed(2), color: '#10b981', hot: false },
        ].map((k, i) => (
          <div key={i} className={`rounded-xl px-2 py-2.5 text-center border ${k.hot ? 'animate-pulse' : ''}`}
            style={{ background: `${k.color}0d`, borderColor: `${k.color}30` }}>
            <div className="text-base font-bold leading-tight" style={{ color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div className="text-[9px] text-gray-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── ١) بانتظار القبول — الأعلى والأبرز ── */}
          {newOrders.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-blue-400 mb-2 flex items-center gap-2">
                🕐 بانتظار القبول ({newOrders.length})
                <span className="flex-1 h-px bg-blue-500/15" />
              </h3>
              <div className="space-y-2.5">
                {newOrders.map(o => <ActiveCard key={o.id} o={o} />)}
              </div>
            </section>
          )}

          {/* ── ٢) قيد التحضير ── */}
          {preparing.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-amber-400 mb-2 flex items-center gap-2">
                👨‍🍳 قيد التحضير ({preparing.length})
                <span className="flex-1 h-px bg-amber-500/15" />
              </h3>
              <div className="space-y-2.5">
                {preparing.map(o => <ActiveCard key={o.id} o={o} />)}
              </div>
            </section>
          )}

          {/* لا طلبات نشطة */}
          {newOrders.length === 0 && preparing.length === 0 && (
            <div className="text-center py-14 rounded-2xl border border-dashed border-gray-700">
              <div className="text-4xl mb-3">😌</div>
              <p className="text-gray-400 text-sm">لا طلبات نشطة حاليّاً</p>
              <p className="text-gray-600 text-xs mt-1">أبقِ هذه الصفحة مفتوحة — الطلب الجديد يظهر فوراً مع تنبيه صوتيّ</p>
            </div>
          )}

          {/* ── ٣) السجلّ المنجز — مطويّ افتراضيّاً ── */}
          {done.length > 0 && (
            <section>
              <button
                onClick={() => setShowHistory(v => !v)}
                className="w-full flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors py-1"
              >
                <span>{showHistory ? '▾' : '◂'}</span>
                <span>السجلّ — {deliveredCount} سُلّم{done.length - deliveredCount > 0 ? ` • ${done.length - deliveredCount} ملغى` : ''} (آخر 24 ساعة)</span>
                <span className="flex-1 h-px bg-gray-800" />
              </button>
              {showHistory && (
                <div className="space-y-1.5 mt-2">
                  {done.map(o => {
                    const delivered = o.status === 'delivered';
                    return (
                      <div key={o.id} className={`rounded-xl px-3 py-2 flex items-center gap-3 border border-white/5 ${delivered ? 'bg-white/[0.02]' : 'bg-white/[0.01] opacity-60'}`}>
                        <span className="text-sm shrink-0">{delivered ? '✅' : '✖️'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-300 text-[12px] truncate">
                            {o.playerName}
                            <span className="text-gray-600"> — {o.items.map(i => `${i.name} ×${i.quantity}`).join('، ')}</span>
                          </p>
                        </div>
                        <span className={`text-[11px] font-bold shrink-0 ${delivered ? 'text-gray-400' : 'text-gray-600 line-through'}`}>
                          {parseFloat(o.total).toFixed(2)}
                        </span>
                        <span className="text-gray-600 text-[10px] shrink-0">
                          {new Date(o.createdAt).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {toast && (
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-gray-800 border border-emerald-500/30 rounded-xl px-4 py-2 text-sm shadow-xl whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
}
