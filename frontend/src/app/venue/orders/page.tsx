'use client';

// ══════════════════════════════════════════════════════
// 📥 سكّة الطلبات — الشاشة التشغيليّة الرئيسيّة · تصميم «الجمرة»
// تذكرةٌ لكلّ طلب على سكّة كما في المطابخ الحقيقيّة، وشريط حرارةٍ على حافّتها
// يبرد ويسخن مع عمر **المرحلة** — فتُقرأ الحالة قبل أن تصل العين للرقم.
// 🔴 الترتيب: الأقدم أوّلاً — عكس الشائع، لأنّ الأقدم هو الأخطر والسكّة
//    تُفرَّغ من رأسها.
// وصولٌ لحظيّ (سوكيت) + نغمة + إشعار + تذكير الخادم + مسحٌ احتياطيّ.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVenue } from '../context';
import { getSocket } from '@/lib/socket';
import { EM, MONO, STALL_SEC, heat, ageText, jod } from '../ember';

interface VOrder {
  id: number;
  status: string;
  total: string;
  note: string;
  createdAt: string;
  statusChangedAt?: string | null;
  playerName: string;
  physicalId: number | null;
  activityId: number;
  activityName: string;
  items: {
    name: string; unitPrice: string; quantity: number;
    components?: { name: string; qty: number; options?: { group: string; value: string }[] }[];
    options?: { group: string; value: string }[];
  }[];
}

// نغمة تنبيه قصيرة بلا ملفّ صوتيّ
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

/** عمر المرحلة الحاليّة بالثواني — نفس مرجع زمن تذكير الخادم. */
const stageAge = (o: VOrder, now: number) =>
  Math.max(0, Math.floor((now - new Date(o.statusChangedAt || o.createdAt).getTime()) / 1000));

export default function VenueOrdersPage() {
  const { locationId, authHeaders, can, isHQ } = useVenue();
  const [ordersList, setOrdersList] = useState<VOrder[]>([]);
  const [svcList, setSvcList] = useState<{
    id: number; kind: string; playerName: string; note: string;
    physicalId: number | null; createdAt: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [toast, setToast] = useState('');
  const [pushState, setPushState] = useState<'idle' | 'granted' | 'busy'>('idle');
  const [isIOS, setIsIOS] = useState(false);
  const [pushStatus, setPushStatus] = useState<{
    totalDevices: number; accountsWithoutDevice: number;
    accounts?: { staffId: number; displayName: string; devices: number }[];
  } | null>(null);
  // 🔇 المتصفّح يمنع الصوت قبل أوّل إيماءة — نكشف القفل ونعرض زرّ فكّه
  const [audioLocked, setAudioLocked] = useState(false);
  // 🔕 تحذير الخادم: طلبٌ وصل ولا جهاز يستلم إشعارات المكان
  const [blackout, setBlackout] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // 🔎 فلتر المؤشّرات: نقرةٌ على «بانتظار/قيد التحضير/متأخّر» تحصر السكّة، وثانيةٌ تلغي
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'preparing' | 'late'>('all');
  // 👥 «في الغرفة»: من جلس في الغرفة الحيّة ولم يطلب بعد يظهر ساخناً — فيُذكَّر
  const [rooms, setRooms] = useState<{
    activityId: number; activityName: string;
    players: { physicalId: number; playerName: string; joinedAt: string; ordersCount: number; ordersTotal: number }[];
  }[]>([]);
  const [roomOpen, setRoomOpen] = useState(true);
  const [muted, setMuted] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const flashRef = useRef<Set<number>>(new Set());
  const mutedRef = useRef(false);

  const locParam = isHQ && locationId ? `locationId=${locationId}` : '';
  const withLoc = (url: string) => locParam ? `${url}${url.includes('?') ? '&' : '?'}${locParam}` : url;
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // ⏱️ نبضة كلّ ١٠ ثوانٍ: الحرارة تتدرّج أمام العين بدل قفزةٍ كلّ نصف دقيقة
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const m = localStorage.getItem('venue_sound_muted') === '1';
    setMuted(m); mutedRef.current = m;
  }, []);

  // 🔊 سياسة autoplay: AudioContext يولد «suspended» قبل أوّل إيماءةٍ للصفحة —
  //    شاشةٌ فُتحت وتُركت بلا لمسٍ لا تُصدر نغمة الطلب. نكشف الحالة ونعرض زرّاً،
  //    وأيّ نقرةٍ في الصفحة تفكّ القفل تلقائيّاً.
  useEffect(() => {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const probe = new AC();
      if (probe.state === 'suspended') setAudioLocked(true);
      probe.close();
    } catch { /* لا صوت أصلاً */ }
    const unlock = () => setAudioLocked(false);
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
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

  // 💨 طلبات خدمة الأرجيلة — صلاحيّةٌ مستقلّة، فمن لا يملكها لا يُحمَّل نداءها
  const loadSvc = useCallback(() => {
    if (!locationId || !can('service.shisha')) return;
    fetch(withLoc('/api/venue/service'), { headers: authHeaders })
      .then(r => r.json())
      .then(d => { if (d.success) setSvcList(d.requests); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  // 👥 «في الغرفة» — كلّ جالسٍ في غرفةٍ حيّة الآن، وعدد طلباته (صفر = يُذكَّر)
  const loadRooms = useCallback(() => {
    if (!locationId) return;
    fetch(withLoc('/api/venue/room-attendance'), { headers: authHeaders })
      .then(r => r.json())
      .then(d => { if (d.success) setRooms(d.rooms); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  const resolveSvc = async (id: number) => {
    setSvcList(prev => prev.filter(s => s.id !== id));   // تفاؤليّ — الشاشة لا تنتظر
    try {
      const r = await fetch(withLoc(`/api/venue/service/${id}/done`), { method: 'PUT', headers: authHeaders });
      const d = await r.json().catch(() => null);
      // 🔴 الردّ الواصل بفشلٍ (500/404) ليس catch — بلا هذا الفحص كان الطلب
      //    يختفي من الشاشة وهو مفتوحٌ على الخادم واللاعب ينتظر فحمه
      if (!r.ok || d?.success !== true) { flash('⚠️ تعذّر الإغلاق — أُعيد الطلب'); loadSvc(); }
    } catch { loadSvc(); }
  };

  useEffect(() => { load(); loadSvc(); loadRooms(); }, [load, loadSvc, loadRooms]);

  // ── سوكيت: انضمام لغرفة المكان + استقبال لحظيّ ──
  useEffect(() => {
    if (!locationId) return;
    const s = getSocket();

    const join = () => { s.emit('venue:join', { locationId }, (res: any) => setLive(!!res?.success)); };
    join();
    s.on('connect', join);

    const onNew = (data: { order: VOrder }) => {
      setOrdersList(prev => [data.order, ...prev.filter(o => o.id !== data.order.id)]);
      flashRef.current.add(data.order.id);
      setTimeout(() => { flashRef.current.delete(data.order.id); setOrdersList(p => [...p]); }, 6000);
      if (!mutedRef.current) playDing();
      setNow(Date.now());
      flash(`🍽️ طلب جديد من ${data.order.playerName}`);
      loadRooms();   // 👥 صاحب الطلب ينتقل فوراً من «لم يطلبوا» إلى «طلبوا»
    };
    const onUpdated = (data: { orderId: number; status: string }) => {
      // الوقت يُصفَّر محليّاً كما يفعل الخادم — التذكرة تبرد فور انتقالها
      setOrdersList(prev => prev.map(o => o.id === data.orderId
        ? { ...o, status: data.status, statusChangedAt: new Date().toISOString() } : o));
      // 👥 إلغاء طلبٍ وحيد يعيد صاحبه إلى «لم يطلبوا»
      if (data.status === 'cancelled') loadRooms();
    };
    // ⏰ الخادم يذكّر بطلبٍ تجاوز ٥ دقائق في مرحلته
    const onStalled = (data: { orderId: number; minutes: number }) => {
      flashRef.current.add(data.orderId);
      setOrdersList(p => [...p]);
      setTimeout(() => { flashRef.current.delete(data.orderId); setOrdersList(p => [...p]); }, 8000);
      if (!mutedRef.current) playDing();
      flash(`⏰ طلبٌ متأخّر منذ ${data.minutes} دقيقة`);
    };
    // 💨 طلب خدمة: نفس الجرس والوميض — الانتظار بأرجيلةٍ تبرد لا يقلّ إلحاحاً
    const onSvc = (r: any) => {
      setSvcList(prev => [...prev.filter(x => x.id !== r.id), r]);
      if (!mutedRef.current) playDing();
      flash(`💨 ${r.label || 'خدمة أرجيلة'} — ${r.playerName}`);
    };
    const onSvcDone = (d: { id: number }) => setSvcList(prev => prev.filter(x => x.id !== d.id));
    // ⏰ خدمةٌ متأخّرة: نفس جرس الطلب المتأخّر — الشاشة المفتوحة لا تحتاج بوشاً
    const onSvcStalled = (d: { id: number; minutes: number }) => {
      if (!mutedRef.current) playDing();
      flash(`⏰ خدمة أرجيلة متأخّرة منذ ${d.minutes} دقيقة`);
      loadSvc();
    };

    // 🔕 الخادم اكتشف أنّ الإشعار لم يصل أيّ جهاز — لافتة حمراء ثابتة
    const onBlackout = (d: { message?: string }) =>
      setBlackout(d?.message || 'طلبٌ وصل ولا جهاز مسجّل يستلم إشعارات المكان — فعّلوا الإشعارات');

    s.on('fnb:new-order', onNew);
    s.on('fnb:order-updated', onUpdated);
    s.on('fnb:order-stalled', onStalled);
    s.on('fnb:service-request', onSvc);
    s.on('fnb:service-done', onSvcDone);
    s.on('fnb:service-stalled', onSvcStalled);
    s.on('fnb:push-blackout', onBlackout);

    const refresh = () => { if (document.visibilityState === 'visible') { load(); loadSvc(); loadRooms(); } };
    const iv = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      s.off('connect', join);
      s.off('fnb:new-order', onNew);
      s.off('fnb:order-updated', onUpdated);
      s.off('fnb:order-stalled', onStalled);
      s.off('fnb:service-request', onSvc);
      s.off('fnb:service-done', onSvcDone);
      s.off('fnb:service-stalled', onSvcStalled);
      s.off('fnb:push-blackout', onBlackout);
      clearInterval(iv);
      document.removeEventListener('visibilitychange', refresh);
      setLive(false);
    };
  }, [locationId, load]);

  // ── بوش: حالة الجهاز + كشف الحسابات بلا أجهزة ──
  useEffect(() => {
    // 🔁 الإذن ممنوح؟ يُعاد تسجيل التوكن **للحساب الحاليّ** في كلّ فتحة —
    //    التسجيل يتبع من يسجّله آخِراً: تسجيلُ دخولٍ بحسابٍ آخر على نفس الجهاز
    //    كان يُبقي التوكن مملوكاً للحساب السابق (علمُ localStorage عامٌّ للجهاز)
    //    فتضيع إشعارات الحساب الجديد بصمتٍ تامّ — وهذا ما حدث في مزاج ١٠/٠٨.
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      (async () => {
        try {
          const { requestNotificationPermission } = await import('@/lib/firebase');
          const token = await requestNotificationPermission();
          if (!token) { setPushState('idle'); return; }
          const r = await fetch('/api/staff-notifications/register-token', {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, deviceInfo: 'venue-console' }),
          }).then(x => x.json());
          if (r.success) { localStorage.setItem('venue_push_registered', '1'); setPushState('granted'); }
          else setPushState('idle');
        } catch { setPushState('idle'); }
      })();
    }
    if (typeof navigator !== 'undefined') setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!locationId) return;
    fetch(withLoc('/api/venue/push-status'), { headers: authHeaders })
      .then(r => r.json())
      .then(d => { if (d.success) setPushStatus(d); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, pushState]);

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
    if (r.success) {
      setOrdersList(prev => prev.map(x => x.id === o.id
        ? { ...x, status, statusChangedAt: new Date().toISOString() } : x));
    } else flash(`❌ ${r.error || 'فشل تغيير الحالة'}`);
  };

  if (!can('orders.receive')) {
    return <div className="text-center py-16 text-sm" style={{ color: EM.faint }}>ليس لدى حسابك صلاحيّة استقبال الطلبات</div>;
  }

  const canManage = can('orders.manage');
  // 📺 شاشة مطبخ: عرضٌ لا تفاعل — خطٌّ أكبر يُقرأ من مترين، وبلا أزرار فلا لمس ولا خطأ
  const kds = !canManage;

  const byAge = (a: VOrder, b: VOrder) => stageAge(b, now) - stageAge(a, now); // الأقدم أوّلاً
  const newOrders = ordersList.filter(o => o.status === 'new').sort(byAge);
  const preparing = ordersList.filter(o => o.status === 'preparing').sort(byAge);
  const done = ordersList.filter(o => o.status === 'delivered' || o.status === 'cancelled');
  const sales = ordersList.filter(o => o.status !== 'cancelled').reduce((s, o) => s + parseFloat(o.total), 0);
  const lateOrders = [...newOrders, ...preparing].filter(o => stageAge(o, now) >= STALL_SEC).sort(byAge);

  // ── تذكرة ──
  const Ticket = ({ o }: { o: VOrder }) => {
    const sec = stageAge(o, now);
    const ht = heat(sec);
    const flashing = flashRef.current.has(o.id);
    const isNew = o.status === 'new';

    return (
      <div className="relative rounded-2xl overflow-hidden mb-2.5 transition-all"
        style={{
          background: EM.card,
          border: `1px solid ${ht.hot ? 'rgba(224,73,43,0.45)' : EM.line}`,
          boxShadow: ht.hot ? '0 0 0 1px rgba(224,73,43,0.18), 0 6px 22px rgba(224,73,43,0.08)'
            : flashing ? `0 0 0 1px ${EM.warm}` : 'none',
        }}
      >
        {/* شريط الحرارة على الحافّة — يُقرأ قبل النصّ */}
        <span className="absolute top-0 bottom-0 right-0"
          style={{ width: 4, background: ht.color, transition: 'background .6s' }} />

        <div className={kds ? 'p-5 pr-6' : 'p-4 pr-5'}>
          {/* مَن · أين · منذ متى */}
          <div className="flex items-start gap-2.5">
            {o.physicalId != null && (
              <span className="rounded-lg px-2 py-1 shrink-0 font-bold"
                style={{ ...({ fontFamily: MONO } as any), fontSize: kds ? 13 : 11, background: 'rgba(255,255,255,0.06)', border: `1px solid ${EM.line2}`, color: EM.dim }}>
                {o.physicalId}
              </span>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate leading-tight" style={{ fontSize: kds ? 20 : 15 }}>{o.playerName}</p>
              <p className="truncate" style={{ fontSize: kds ? 12 : 10.5, color: EM.faint }}>
                #{o.id} · {o.activityName}
              </p>
            </div>
            <div className="text-left shrink-0">
              <p className="font-bold leading-none"
                style={{ ...({ fontFamily: MONO } as any), fontSize: kds ? 17 : 13, color: ht.color }}>
                {ageText(sec)}
              </p>
              <p style={{ fontSize: 9, color: EM.faint }}>{isNew ? 'بانتظار' : 'تحضير'}</p>
            </div>
          </div>

          {/* البنود */}
          <div className="mt-2.5 pt-2.5" style={{ borderTop: `1px dashed ${EM.line2}` }}>
            {o.items.map((i, idx) => (
              <div key={idx} className="py-0.5">
                <div className="flex gap-2 items-baseline" style={{ fontSize: kds ? 16 : 13 }}>
                  <span className="font-bold shrink-0" style={{ ...({ fontFamily: MONO } as any), color: EM.warm, minWidth: 26 }}>
                    ×{i.quantity}
                  </span>
                  <span className="flex-1">{i.name}</span>
                  {!kds && (
                    <span style={{ ...({ fontFamily: MONO } as any), fontSize: 11, color: EM.faint }}>
                      {(parseFloat(i.unitPrice) * i.quantity).toFixed(2)}
                    </span>
                  )}
                </div>
                {/* ⚙️ الخيارات — إغفالها يعني تحضيراً خاطئاً، فلها أبرز لون */}
                {i.options && i.options.length > 0 && (
                  <p style={{ fontSize: kds ? 14 : 11.5, color: EM.opt, paddingRight: 30, lineHeight: 1.5 }}>
                    ⚙️ {i.options.map(x => `${x.group}: ${x.value}`).join(' · ')}
                  </p>
                )}
                {i.components && i.components.length > 0 && (
                  <p style={{ fontSize: kds ? 13 : 11, color: EM.bundle, paddingRight: 30, lineHeight: 1.5 }}>
                    🎁 {i.components.map(c => {
                      const co = (c.options ?? []).map(x => x.value).join('/');
                      return `${c.name}${co ? ` (${co})` : ''} ×${c.qty * i.quantity}`;
                    }).join(' + ')}
                  </p>
                )}
              </div>
            ))}
            {o.note && (
              <p className="mt-1.5 rounded-lg px-2.5 py-1.5"
                style={{ fontSize: kds ? 14 : 11.5, color: EM.warm, background: 'rgba(217,138,43,0.1)' }}>
                📝 {o.note}
              </p>
            )}
          </div>

          {/* الإجراءات — رئيسيّ واحد عريض لهدف لمسٍ كبير */}
          {canManage && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => changeStatus(o, isNew ? 'preparing' : 'delivered')}
                disabled={busyId === o.id}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-transform active:scale-[0.98] disabled:opacity-50"
                style={{
                  background: isNew ? `linear-gradient(140deg, ${EM.warm}, #C2751F)` : `linear-gradient(140deg, ${EM.go}, #1A9E70)`,
                  color: isNew ? '#1A1208' : '#04231A',
                }}
              >
                {busyId === o.id ? '⏳…' : isNew ? '👨‍🍳 بدء التحضير' : '✅ تسليم'}
              </button>
              {isNew && (
                <button onClick={() => changeStatus(o, 'delivered')} disabled={busyId === o.id}
                  title="تسليم مباشر بلا تحضير"
                  className="px-3.5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                  style={{ background: 'rgba(37,192,138,0.12)', border: `1px solid rgba(37,192,138,0.3)`, color: EM.go }}>
                  ✅
                </button>
              )}
              <button onClick={() => changeStatus(o, 'cancelled')} disabled={busyId === o.id}
                title="إلغاء الطلب"
                className="px-3.5 py-2.5 rounded-xl text-sm disabled:opacity-50"
                style={{ background: 'rgba(224,73,43,0.08)', border: `1px solid rgba(224,73,43,0.22)`, color: '#F08163' }}>
                ✖️
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const Rail = ({ title, list }: { title: string; list: VOrder[] }) => (
    <>
      <div className="flex items-center gap-2.5 mt-5 mb-2.5">
        <b className="text-[12.5px]">{title}</b>
        <span className="flex-1 h-px" style={{ background: EM.line }} />
        <span style={{ ...({ fontFamily: MONO } as any), fontSize: 12, color: EM.faint }}>{list.length}</span>
      </div>
      {list.map(o => <Ticket key={o.id} o={o} />)}
    </>
  );

  return (
    <div>
      {/* ── 💨 طلبات خدمة الأرجيلة — فوق الطلبات: بلا سعرٍ لكنّها أعجل ──
          من طلب فحماً ينتظر بأرجيلةٍ تبرد، وتأخيره أظهر من تأخير طلبٍ لم يبدأ. */}
      {can('service.shisha') && svcList.length > 0 && (
        <div className="rounded-2xl p-3 mb-3"
          style={{ background: 'rgba(224,73,43,0.08)', border: '1px solid rgba(224,73,43,0.3)' }}>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-base">💨</span>
            <b className="text-[12.5px] flex-1" style={{ color: '#F08163' }}>خدمة أرجيلة ({svcList.length})</b>
          </div>
          {svcList.map(s => {
            const mins = Math.max(0, Math.floor((now - new Date(s.createdAt).getTime()) / 60000));
            const late = mins >= 5;
            return (
              <div key={s.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 mb-1.5"
                style={{ background: EM.card, border: `1px solid ${late ? 'rgba(224,73,43,0.45)' : EM.line}` }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-bold truncate">
                    {s.kind === 'coal' ? '🔥 فحم' : '🔧 تزبيط'} — {s.playerName}
                    {s.physicalId ? <span style={{ color: EM.dim }}> · مقعد {s.physicalId}</span> : null}
                  </p>
                  {s.note && <p className="text-[10.5px] truncate" style={{ color: EM.dim }}>📝 {s.note}</p>}
                  <p className="text-[10px]" style={{ ...({ fontFamily: MONO } as any), color: late ? '#F08163' : EM.faint }}>
                    منذ {mins} دقيقة{late ? ' — متأخّر' : ''}
                  </p>
                </div>
                <button onClick={() => resolveSvc(s.id)}
                  className="px-3 py-2 rounded-lg text-[11.5px] font-bold shrink-0"
                  style={{ background: 'rgba(37,192,138,0.15)', border: '1px solid rgba(37,192,138,0.4)', color: EM.go }}>
                  ✓ تمّ
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 🔇 لا صمت: جهازٌ بلا إشعارات يجب أن يُرى لا أن يُخمَّن */}
      {pushState !== 'granted' && (
        <div className="rounded-xl px-3.5 py-2.5 text-[11px] leading-relaxed mb-3"
          style={{ background: 'rgba(217,138,43,0.1)', border: `1px solid rgba(217,138,43,0.3)`, color: EM.warm }}>
          <b>🔕 إشعارات هذا الجهاز غير مفعّلة</b> — ستصلك الطلبات على هذه الشاشة فقط ما دامت مفتوحة.
          {isIOS && <span className="block mt-1" style={{ color: 'rgba(217,138,43,0.85)' }}>
            🍎 على الآيفون: أضف الكونسول إلى الشاشة الرئيسيّة أوّلاً وافتحه من أيقونته — Safari العاديّ لا يستقبل إشعارات.
          </span>}
        </div>
      )}
      {blackout && (
        <div className="rounded-xl px-3.5 py-2.5 text-[11.5px] mb-3 flex items-start gap-2"
          style={{ background: 'rgba(224,43,43,0.14)', border: '1.5px solid rgba(224,43,43,0.45)', color: '#F87171' }}>
          <span className="flex-1"><b>🔕 {blackout}</b></span>
          <button onClick={() => setBlackout('')} className="shrink-0 opacity-70">✕</button>
        </div>
      )}
      {pushStatus && pushStatus.accountsWithoutDevice > 0 && (
        <div className="rounded-xl px-3.5 py-2.5 text-[11px] mb-3"
          style={{ background: 'rgba(224,73,43,0.08)', border: `1px solid rgba(224,73,43,0.25)`, color: '#F08163' }}>
          ⚠️ {pushStatus.accountsWithoutDevice} من حسابات المكان بلا جهازٍ مسجَّل — لن تصلهم إشعارات الطلبات.
          <span style={{ color: EM.faint }}> (أجهزة مسجّلة: {pushStatus.totalDevices})</span>
          {/* 🧾 بالاسم لا بالعدد: «من الأصمّ؟» هو السؤال الذي تجيب عنه هذه اللوحة */}
          {(pushStatus.accounts?.length ?? 0) > 0 && (
            <span className="flex flex-wrap gap-1.5 mt-1.5">
              {pushStatus.accounts!.map(a => (
                <span key={a.staffId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={a.devices > 0
                    ? { background: 'rgba(37,192,138,0.12)', color: EM.go }
                    : { background: 'rgba(224,73,43,0.14)', color: '#F08163' }}>
                  {a.devices > 0 ? '🔔' : '🔕'} {a.displayName}
                  {a.devices > 0 ? ` (${a.devices})` : ' — بلا جهاز'}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      {audioLocked && !muted && (
        <button onClick={() => { setAudioLocked(false); playDing(); }}
          className="w-full rounded-xl px-3.5 py-2.5 text-[11.5px] mb-3 text-right font-bold"
          style={{ background: 'rgba(217,138,43,0.12)', border: '1px solid rgba(217,138,43,0.35)', color: EM.warm }}>
          🔊 اضغط لتفعيل صوت تنبيه الطلبات — المتصفّح يكتم الصوت قبل أوّل لمسة
        </button>
      )}

      {/* ── الحالة اللحظيّة + أدوات الجهاز ── */}
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full"
          style={{
            background: live ? 'rgba(37,192,138,0.14)' : 'rgba(255,255,255,0.04)',
            color: live ? EM.go : EM.faint,
          }}
          title={live ? 'متّصل — الطلبات تصل فوراً' : 'غير متّصل — يعمل المسح كل ٣٠ ثانية'}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${live ? 'animate-pulse' : ''}`}
            style={{ background: live ? EM.go : EM.faint }} />
          {live ? 'مباشر' : 'مسح دوريّ'}
        </span>

        <div className="flex items-center gap-1.5 mr-auto">
          <button onClick={toggleMute}
            title={muted ? 'الصوت مكتوم — اضغط للتفعيل' : 'نغمة الطلب الجديد مفعّلة'}
            className="w-9 h-9 rounded-xl text-base"
            style={{
              background: muted ? 'rgba(255,255,255,0.04)' : 'rgba(217,138,43,0.12)',
              border: `1px solid ${muted ? EM.line2 : 'rgba(217,138,43,0.3)'}`,
              color: muted ? EM.faint : EM.warm,
            }}>
            {muted ? '🔇' : '🔊'}
          </button>
          {pushState !== 'granted' && (
            <button onClick={enablePush} disabled={pushState === 'busy'}
              className="text-[11px] px-3 py-2 rounded-xl font-bold disabled:opacity-50"
              style={{ background: 'rgba(217,138,43,0.12)', border: `1px solid rgba(217,138,43,0.3)`, color: EM.warm }}>
              {pushState === 'busy' ? '⏳…' : '🔔 إشعارات الجهاز'}
            </button>
          )}
        </div>
      </div>

      {/* ── المؤشّرات: الثلاثة الأولى فلاتر تبديل لا عدّادات فحسب ── */}
      <div className="grid grid-cols-4 gap-2">
        <Kpi n={newOrders.length} label="بانتظار" color={EM.cool} pulse={newOrders.length > 0}
          active={statusFilter === 'new'}
          onClick={() => setStatusFilter(f => f === 'new' ? 'all' : 'new')} />
        <Kpi n={preparing.length} label="قيد التحضير" color={EM.warm}
          active={statusFilter === 'preparing'}
          onClick={() => setStatusFilter(f => f === 'preparing' ? 'all' : 'preparing')} />
        <Kpi n={lateOrders.length} label="متأخّر ٥ د+" color={lateOrders.length ? EM.hot : EM.faint} pulse={lateOrders.length > 0}
          active={statusFilter === 'late'}
          onClick={() => setStatusFilter(f => f === 'late' ? 'all' : 'late')} />
        <Kpi n={sales} label="مبيعات د.أ" color={EM.text} money />
      </div>

      {/* ── 👥 في الغرفة — من جلس ولم يطلب بعد يُرى ويُذكَّر ──
          نفس سُلّم الجمرة: الجالس بلا طلبٍ «يسخن» بمرور الوقت كالتذكرة المتروكة */}
      {rooms.map(room => {
        const withMin = room.players.map(p => ({
          ...p, mins: Math.max(0, Math.floor((now - new Date(p.joinedAt).getTime()) / 60000)),
        }));
        const noOrder = withMin.filter(p => p.ordersCount === 0).sort((a, b) => b.mins - a.mins);
        const ordered = withMin.filter(p => p.ordersCount > 0).sort((a, b) => a.physicalId - b.physicalId);
        const seatChip = (p: typeof withMin[number]) => {
          if (p.ordersCount === 0) {
            const ht = heat(p.mins * 60);
            return (
              <div key={p.physicalId} className="flex items-center gap-2 rounded-xl px-2.5 py-2"
                style={{
                  background: ht.hot ? 'rgba(224,73,43,0.07)' : 'rgba(217,138,43,0.06)',
                  border: `1px solid ${ht.hot ? 'rgba(224,73,43,0.5)' : 'rgba(217,138,43,0.4)'}`,
                }}>
                <span className="rounded-lg px-2 py-0.5 shrink-0 font-bold text-[11px]"
                  style={{ ...({ fontFamily: MONO } as any), background: 'rgba(255,255,255,0.06)', border: `1px solid ${EM.line2}`, color: EM.dim }}>
                  {p.physicalId}
                </span>
                <span className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold truncate">{p.playerName}</p>
                  <small className="block text-[9.5px] font-bold leading-snug"
                    style={{ color: ht.hot ? '#F08163' : EM.warm }}>
                    ⚠️ لم يطلب — في الغرفة منذ <span style={{ fontFamily: MONO } as any}>{ageText(p.mins * 60)}</span>
                  </small>
                </span>
                <span className="shrink-0 text-[14px]">🕐</span>
              </div>
            );
          }
          return (
            <div key={p.physicalId} className="flex items-center gap-2 rounded-xl px-2.5 py-2 opacity-80"
              style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${EM.line}` }}>
              <span className="rounded-lg px-2 py-0.5 shrink-0 font-bold text-[11px]"
                style={{ ...({ fontFamily: MONO } as any), background: 'rgba(255,255,255,0.06)', border: `1px solid ${EM.line2}`, color: EM.dim }}>
                {p.physicalId}
              </span>
              <span className="flex-1 min-w-0">
                <p className="text-[12px] font-bold truncate">{p.playerName}</p>
                <small className="block text-[9.5px]" style={{ color: EM.faint }}>
                  {p.ordersCount} {p.ordersCount === 1 ? 'طلب' : 'طلبات'} · <span style={{ fontFamily: MONO } as any}>{jod(p.ordersTotal)}</span>
                </small>
              </span>
              <span className="shrink-0 text-[14px]" style={{ color: EM.go }}>✓</span>
            </div>
          );
        };
        return (
          <div key={room.activityId} className="rounded-2xl overflow-hidden mt-3"
            style={{ background: EM.card, border: `1px solid ${EM.line}` }}>
            <button onClick={() => setRoomOpen(v => !v)}
              className="w-full flex items-center gap-2.5 px-3.5 py-3 text-right">
              <span className="text-[15px]">👥</span>
              <b className="text-[12.5px]">في الغرفة ({room.players.length})</b>
              {rooms.length > 1 && <span className="text-[10px]" style={{ color: EM.faint }}>{room.activityName}</span>}
              {noOrder.length > 0 ? (
                <span className="text-[11px] font-black rounded-full px-2.5 py-px"
                  style={{ color: EM.warm, background: 'rgba(217,138,43,0.12)', border: '1px solid rgba(217,138,43,0.3)' }}>
                  ⚠️ {noOrder.length} لم يطلبوا بعد
                </span>
              ) : (
                <span className="text-[10.5px]" style={{ color: EM.go }}>✓ الكلّ طلب</span>
              )}
              <span className="mr-auto text-[11px]" style={{ color: EM.faint }}>{roomOpen ? '▼' : '◀'}</span>
            </button>
            {roomOpen && (
              <div className="px-3 pb-3 pt-1" style={{ borderTop: `1px solid ${EM.line}` }}>
                {noOrder.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mt-2 mb-1.5 text-[10px] font-bold" style={{ color: EM.faint }}>
                      🕐 لم يطلبوا — الأقدم جلوساً أوّلاً
                      <span className="flex-1 h-px" style={{ background: EM.line }} />
                      <span style={{ fontFamily: MONO } as any}>{noOrder.length}</span>
                    </div>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))' }}>
                      {noOrder.map(seatChip)}
                    </div>
                  </>
                )}
                {ordered.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mt-2.5 mb-1.5 text-[10px] font-bold" style={{ color: EM.faint }}>
                      ✓ طلبوا
                      <span className="flex-1 h-px" style={{ background: EM.line }} />
                      <span style={{ fontFamily: MONO } as any}>{ordered.length}</span>
                    </div>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))' }}>
                      {ordered.map(seatChip)}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 rounded-full animate-spin"
            style={{ border: `2px solid ${EM.line2}`, borderTopColor: EM.warm }} />
        </div>
      ) : (() => {
        const visNew = statusFilter === 'all' || statusFilter === 'new' ? newOrders : [];
        const visPrep = statusFilter === 'all' || statusFilter === 'preparing' ? preparing : [];
        const visLate = statusFilter === 'late' ? lateOrders : [];
        if (visNew.length + visPrep.length + visLate.length === 0) {
          return statusFilter === 'all' ? (
            <div className="text-center py-16" style={{ color: EM.faint }}>
              <div className="text-4xl mb-3 opacity-50">😌</div>
              <p className="text-sm" style={{ color: EM.dim }}>السكّة فارغة</p>
              <p className="text-xs mt-1">أبقِ هذه الشاشة مفتوحة — الطلب الجديد يظهر فوراً مع تنبيهٍ صوتيّ</p>
            </div>
          ) : (
            <div className="text-center py-16" style={{ color: EM.faint }}>
              <div className="text-4xl mb-3 opacity-50">🔎</div>
              <p className="text-sm" style={{ color: EM.dim }}>لا طلبات ضمن هذا الفلتر</p>
              <button onClick={() => setStatusFilter('all')}
                className="mt-3 text-[11.5px] px-4 py-2 rounded-xl font-bold"
                style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${EM.line2}`, color: EM.dim }}>
                عرض الكلّ
              </button>
            </div>
          );
        }
        return (
          <>
            {visLate.length > 0 && <Rail title="⏰ متأخّر ٥ د+" list={visLate} />}
            {visNew.length > 0 && <Rail title="🕐 بانتظار القبول" list={visNew} />}
            {visPrep.length > 0 && <Rail title="👨‍🍳 قيد التحضير" list={visPrep} />}
          </>
        );
      })()}

      {/* ── السجلّ — مطويّ بعيداً عن العين ── */}
      {done.length > 0 && !kds && (
        <div className="mt-6">
          <button onClick={() => setShowHistory(v => !v)}
            className="w-full flex items-center gap-2.5 text-[12px] py-2" style={{ color: EM.faint }}>
            <span>{showHistory ? '▼' : '◀'}</span>
            <span>السجلّ — {done.filter(o => o.status === 'delivered').length} سُلّم · {done.filter(o => o.status === 'cancelled').length} ملغى</span>
            <span className="flex-1 h-px" style={{ background: EM.line }} />
          </button>
          {showHistory && done.map(o => (
            <div key={o.id} className="flex justify-between text-[12px] py-2"
              style={{ color: EM.faint, borderBottom: `1px dashed ${EM.line}` }}>
              <span>{o.status === 'delivered' ? '✅' : '✖️'} #{o.id} — {o.playerName}</span>
              <span style={{ fontFamily: MONO }}>{jod(parseFloat(o.total))}</span>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] rounded-xl px-4 py-2 text-sm max-w-[92vw] text-center"
          style={{ background: EM.card, border: `1px solid ${EM.warm}`, color: EM.text, boxShadow: '0 8px 32px rgba(0,0,0,.6)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function Kpi({ n, label, color, pulse, money, active, onClick }: {
  n: number; label: string; color: string; pulse?: boolean; money?: boolean;
  /** فلتر: يحوّل المؤشّر زرّاً — الحدود واللون يعلنان التفعيل */
  active?: boolean; onClick?: () => void;
}) {
  const Tag: any = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick}
      className="rounded-xl px-2 py-2.5 text-center relative overflow-hidden w-full"
      style={{
        background: active ? 'rgba(255,255,255,0.07)' : EM.card,
        border: `1px solid ${active ? color : EM.line}`,
        boxShadow: active ? `0 0 0 1px ${color} inset` : undefined,
        cursor: onClick ? 'pointer' : undefined,
      }}
      title={onClick ? (active ? 'اضغط لإلغاء الفلتر' : 'اضغط لعرض هذه الطلبات وحدها') : undefined}>
      <b className="block leading-tight"
        style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontSize: money ? 18 : 23, color }}>
        {money ? n.toFixed(2) : n}
      </b>
      <span className="text-[10.5px] font-bold" style={{ color: active ? color : EM.faint }}>
        {active ? `✓ ${label}` : label}
      </span>
      {pulse && !active && (
        <span className="absolute inset-0 rounded-xl pointer-events-none animate-pulse"
          style={{ border: `1px solid ${color}`, opacity: 0.5 }} />
      )}
    </Tag>
  );
}
