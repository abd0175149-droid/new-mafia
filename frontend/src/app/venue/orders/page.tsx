'use client';

// ══════════════════════════════════════════════════════
// 📥 سكّة الطلبات — الشاشة التشغيليّة الرئيسيّة · «الجمرة» · إعادة البناء 2026-10-30
// الهاتف أوّلاً: عمودٌ واحد، والمتأخّر مثبّتٌ في الرأس تحت «متأخّر — ابدأ بها»،
// ثمّ «بانتظار القبول» ثمّ «قيد التحضير». على الشاشة العريضة (md+) شاشة بار:
// عمودان «بانتظار القبول | قيد التحضير» وعمودٌ جانبيّ للأرجيلة و«سُلّم مؤخّراً».
// 🔴 الترتيب: الأقدم أوّلاً — عكس الشائع، لأنّ الأقدم هو الأخطر والسكّة
//    تُفرَّغ من رأسها.
// 🌡️ الحرارة حبّةٌ على يسار التذكرة (heatPill) وحدّ شارة المقعد — لا شريط حافّة:
//    الشريط الملوّن كان يُقرأ «تصنيفاً» لا «عمراً».
// وصولٌ لحظيّ (سوكيت) + نغمة + إشعار + تذكير الخادم + مسحٌ احتياطيّ.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVenue } from '../context';
import { getSocket } from '@/lib/socket';
import { EM, TX, SHARE, STALL_SEC, heatPill, f2, pOrders } from '../ember';
import { Icon, SeatBadge, Btn, Skeleton, Toast, useToast, useVenueApi } from '../ui';
import { refreshBadges } from '../VenueShell';

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

interface VSvc {
  id: number; kind: string; label?: string; playerName: string; note: string;
  physicalId: number | null; createdAt: string;
}

interface VRoom {
  activityId: number; activityName: string;
  players: { physicalId: number; playerName: string; joinedAt: string; ordersCount: number; ordersTotal: number }[];
}

/** عتبة «متأخّر» في السكّة — ١٠ دقائق على عمر المرحلة (نفس عتبة heatPill.late).
 *  تذكير الخادم يبقى على ٥ دقائق (STALL_SEC): ذاك نداءٌ مبكر، وهذا ترتيبٌ للعين. */
const LATE_SEC = 600;

// 💨 أسماء الخدمة إن لم يُرسل الخادم label (المسح الدوريّ يعيد kind وحده)
const SVC_LABEL: Record<string, string> = { coal: 'فحم', fix: 'تزبيط الأرجيلة' };
const svcLabel = (s: VSvc) => s.label || SVC_LABEL[s.kind] || 'خدمة أرجيلة';

// 🧾 «تغيير راس» خدمةٌ مدفوعة (قرار المالك 2026-10-27) — حبّةٌ تميّزها عن الفحم المجّانيّ
const SHISHA_PAID = 'تغيير راس';

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

const minsSince = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));

/** 📐 الشاشة العريضة (md = 768px) تأخذ تخطيط البار. matchMedia لا صنفا hidden/flex:
 *  التذكرة تُرسم مرّةً واحدة، فلا تتكرّر في الشجرة ولا تتضاعف حالتها. */
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const on = () => setWide(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on); };
  }, []);
  return wide;
}

export default function VenueOrdersPage() {
  const { locationId, authHeaders, can } = useVenue();
  const api = useVenueApi();
  const { toast, show, hide } = useToast();
  const wide = useWide();

  const [ordersList, setOrdersList] = useState<VOrder[]>([]);
  const [svcList, setSvcList] = useState<VSvc[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [pushState, setPushState] = useState<'idle' | 'granted' | 'busy'>('idle');
  const [isIOS, setIsIOS] = useState(false);
  const [pushStatus, setPushStatus] = useState<{
    totalDevices: number; accountsWithoutDevice: number;
    accounts?: { staffId: number; displayName: string; devices: number }[];
  } | null>(null);
  // 🔇 المتصفّح يمنع الصوت قبل أوّل إيماءة — نكشف القفل ونعرض سطر فكّه
  const [audioLocked, setAudioLocked] = useState(false);
  // 🔕 تحذير الخادم: طلبٌ وصل ولا جهاز يستلم إشعارات المكان
  const [blackout, setBlackout] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  // ✖️ تأكيد الإلغاء داخل التذكرة نفسها — لا confirm() يحجب الشاشة كلّها
  const [askCancel, setAskCancel] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // 🔎 فلتر المؤشّرات: نقرةٌ على «بانتظار/قيد التحضير/متأخّر» تحصر السكّة، وثانيةٌ تلغي
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'preparing' | 'late'>('all');
  // 👥 «في الغرفة»: مطويّ افتراضاً — تذكيرٌ يُفتح عند الحاجة لا ضجيجٌ فوق السكّة
  const [rooms, setRooms] = useState<VRoom[]>([]);
  const [roomOpen, setRoomOpen] = useState<number[]>([]);
  const [muted, setMuted] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // ✨ وميض التذكرة الواصلة/المذكَّر بها — حالةٌ لا مرجع، فلا حاجة لإعادة رسمٍ مفتعلة
  const [flashIds, setFlashIds] = useState<number[]>([]);
  const mutedRef = useRef(false);

  const pulse = useCallback((id: number, ms: number) => {
    setFlashIds(p => p.includes(id) ? p : [...p, id]);
    setTimeout(() => setFlashIds(p => p.filter(x => x !== id)), ms);
  }, []);

  // 🔔 تفعيل الإشعارات من ورقة «المكان» في الترويسة يُخفي شريط التنبيه هنا فوراً
  useEffect(() => {
    const onPush = () => setPushState('granted');
    window.addEventListener('venue:push', onPush);
    return () => window.removeEventListener('venue:push', onPush);
  }, []);

  // ⏱️ نبضة كلّ ١٠ ثوانٍ: الحرارة تتدرّج أمام العين بدل قفزةٍ كلّ نصف دقيقة
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(iv);
  }, []);

  // 🔊 الكتم صار في ورقة «المكان» بالترويسة — نقرأ المفتاح ونتبع حدث الشِّل
  useEffect(() => {
    const read = () => {
      const m = localStorage.getItem('venue_sound_muted') === '1';
      setMuted(m); mutedRef.current = m;
    };
    read();
    window.addEventListener('venue:sound', read);
    return () => window.removeEventListener('venue:sound', read);
  }, []);

  // 🔊 سياسة autoplay: AudioContext يولد «suspended» قبل أوّل إيماءةٍ للصفحة —
  //    شاشةٌ فُتحت وتُركت بلا لمسٍ لا تُصدر نغمة الطلب. نكشف الحالة ونعرض سطراً،
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

  // 🔁 authHeaders كائنٌ جديد في كلّ رسمٍ للشِّل، فـget/send تتبدّل معه —
  //    نمرّرها عبر مرجعٍ كي لا يُعاد تركيب السوكيت مع كلّ نبضة ساعة.
  const apiRef = useRef(api);
  apiRef.current = api;

  const load = useCallback(() => {
    if (!locationId) return;
    apiRef.current.get('/api/venue/orders')
      .then(({ data: d }) => { if (d.success) setOrdersList(d.orders); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [locationId]);

  // 💨 طلبات خدمة الأرجيلة — صلاحيّةٌ مستقلّة، فمن لا يملكها لا يُحمَّل نداءها
  const canSvc = can('service.shisha');
  const loadSvc = useCallback(() => {
    if (!locationId || !canSvc) return;
    apiRef.current.get('/api/venue/service')
      .then(({ data: d }) => { if (d.success) setSvcList(d.requests); })
      .catch(() => {});
  }, [locationId, canSvc]);

  // 👥 «في الغرفة» — كلّ جالسٍ في غرفةٍ حيّة الآن، وعدد طلباته (صفر = يُذكَّر)
  const loadRooms = useCallback(() => {
    if (!locationId) return;
    apiRef.current.get('/api/venue/room-attendance')
      .then(({ data: d }) => { if (d.success) setRooms(d.rooms); })
      .catch(() => {});
  }, [locationId]);

  // مستمعو السوكيت يُسجَّلون مرّةً لكلّ مكان — والمحمِّلات تُقرأ من مرجعٍ حديث
  const loadersRef = useRef({ load, loadSvc, loadRooms });
  loadersRef.current = { load, loadSvc, loadRooms };

  const resolveSvc = async (s: VSvc) => {
    setSvcList(prev => prev.filter(x => x.id !== s.id));   // تفاؤليّ — الشاشة لا تنتظر
    try {
      const r = await api.send(`/api/venue/service/${s.id}/done`, 'PUT');
      // 🔴 الردّ الواصل بفشلٍ (500/404) ليس catch — بلا هذا الفحص كان الطلب
      //    يختفي من الشاشة وهو مفتوحٌ على الخادم واللاعب ينتظر فحمه
      if (!r.ok) { show('تعذّر الإغلاق — أُعيد الطلب', { tone: 'bad' }); loadSvc(); return; }
      show(`أُغلق طلب ${svcLabel(s)}${s.physicalId != null ? ` · مقعد ${s.physicalId}` : ''}`);
    } catch { show('تعذّر الإغلاق — أُعيد الطلب', { tone: 'bad' }); loadSvc(); }
  };

  useEffect(() => { load(); loadSvc(); loadRooms(); }, [load, loadSvc, loadRooms]);

  // ── سوكيت: انضمام لغرفة المكان + استقبال لحظيّ ──
  useEffect(() => {
    if (!locationId) return;
    const s = getSocket();
    const L = () => loadersRef.current;

    const join = () => { s.emit('venue:join', { locationId }, (res: any) => setLive(!!res?.success)); };
    join();
    s.on('connect', join);

    const onNew = (data: { order: VOrder }) => {
      setOrdersList(prev => [data.order, ...prev.filter(o => o.id !== data.order.id)]);
      pulse(data.order.id, 6000);
      if (!mutedRef.current) playDing();
      setNow(Date.now());
      show(`طلب جديد من ${data.order.playerName}`);
      L().loadRooms();   // 👥 صاحب الطلب ينتقل فوراً من «لم يطلبوا» إلى «طلبوا»
      refreshBadges();
    };
    const onUpdated = (data: { orderId: number; status: string }) => {
      // الوقت يُصفَّر محليّاً كما يفعل الخادم — التذكرة تبرد فور انتقالها
      setOrdersList(prev => prev.map(o => o.id === data.orderId
        ? { ...o, status: data.status, statusChangedAt: new Date().toISOString() } : o));
      // 👥 إلغاء طلبٍ وحيد يعيد صاحبه إلى «لم يطلبوا»
      if (data.status === 'cancelled') L().loadRooms();
      refreshBadges();
    };
    // ⏰ الخادم يذكّر بطلبٍ تجاوز ٥ دقائق في مرحلته
    const onStalled = (data: { orderId: number; minutes: number }) => {
      pulse(data.orderId, 8000);
      if (!mutedRef.current) playDing();
      show(`طلبٌ متأخّر منذ ${data.minutes} دقيقة`, { tone: 'bad' });
    };
    // 💨 طلب خدمة: نفس الجرس — الانتظار بأرجيلةٍ تبرد لا يقلّ إلحاحاً
    const onSvc = (r: VSvc) => {
      setSvcList(prev => [...prev.filter(x => x.id !== r.id), r]);
      if (!mutedRef.current) playDing();
      show(`${svcLabel(r)} — ${r.playerName}`);
    };
    const onSvcDone = (d: { id: number }) => setSvcList(prev => prev.filter(x => x.id !== d.id));
    // ⏰ خدمةٌ متأخّرة: نفس جرس الطلب المتأخّر — الشاشة المفتوحة لا تحتاج بوشاً
    const onSvcStalled = (d: { id: number; minutes: number }) => {
      if (!mutedRef.current) playDing();
      show(`خدمة أرجيلة متأخّرة منذ ${d.minutes} دقيقة`, { tone: 'bad' });
      L().loadSvc();
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

    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const l = L(); l.load(); l.loadSvc(); l.loadRooms();
    };
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
  }, [locationId, pulse, show]);

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
          if (r.success) { localStorage.setItem('venue_push_registered', '1'); window.dispatchEvent(new Event('venue:push')); setPushState('granted'); }
          else setPushState('idle');
        } catch { setPushState('idle'); }
      })();
    }
    if (typeof navigator !== 'undefined') setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!locationId) return;
    apiRef.current.get('/api/venue/push-status')
      .then(({ data: d }) => { if (d.success) setPushStatus(d); })
      .catch(() => {});
  }, [locationId, pushState]);

  const enablePush = async () => {
    setPushState('busy');
    try {
      const { requestNotificationPermission } = await import('@/lib/firebase');
      const token = await requestNotificationPermission();
      if (!token) { show('لم يُمنح إذن الإشعارات', { tone: 'bad' }); setPushState('idle'); return; }
      const r = await fetch('/api/staff-notifications/register-token', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, deviceInfo: 'venue-console' }),
      }).then(x => x.json());
      if (r.success) { localStorage.setItem('venue_push_registered', '1'); window.dispatchEvent(new Event('venue:push')); setPushState('granted'); show('ستصلك الطلبات الجديدة كإشعارات'); }
      else { show('فشل تسجيل الجهاز', { tone: 'bad' }); setPushState('idle'); }
    } catch { show('فشل تفعيل الإشعارات', { tone: 'bad' }); setPushState('idle'); }
  };

  const changeStatus = async (o: VOrder, status: 'preparing' | 'delivered' | 'cancelled') => {
    setBusyId(o.id);
    let r: { ok: boolean; status: number; data: any };
    try { r = await api.send(`/api/venue/orders/${o.id}/status`, 'PUT', { status }); }
    catch { r = { ok: false, status: 0, data: { error: 'خطأ في الاتصال' } }; }
    setBusyId(null);
    if (!r.ok) {
      // 🔒 409 = الطلب داخل فاتورةٍ محصَّلة — نصّ الخادم يشرح ما العمل، فيُعرض كما هو
      show(r.data?.error || 'فشل تغيير الحالة', { tone: 'bad', ms: 5000 });
      return;
    }
    setAskCancel(null);
    setOrdersList(prev => prev.map(x => x.id === o.id
      ? { ...x, status, statusChangedAt: new Date().toISOString() } : x));
    show(status === 'preparing' ? `بدأ تحضير طلب ${o.playerName}`
      : status === 'delivered' ? `سُلّم طلب ${o.playerName} · وصله إشعار`
      : `أُلغي طلب ${o.playerName} · وصله إشعار`);
    if (status === 'cancelled') loadRooms();
    refreshBadges();
  };

  if (!can('orders.receive')) {
    return <div className="text-center py-16 text-[14px]" style={{ color: TX.dim }}>ليس لدى حسابك صلاحيّة استقبال الطلبات</div>;
  }

  const canManage = can('orders.manage');
  // 📺 شاشة مطبخ: عرضٌ لا تفاعل — خطٌّ أكبر يُقرأ من مترين، وبلا أزرار فلا لمس ولا خطأ
  const kds = !canManage;

  const byAge = (a: VOrder, b: VOrder) => stageAge(b, now) - stageAge(a, now); // الأقدم أوّلاً
  const isLate = (o: VOrder) => stageAge(o, now) >= LATE_SEC;
  const newOrders = ordersList.filter(o => o.status === 'new').sort(byAge);
  const preparing = ordersList.filter(o => o.status === 'preparing').sort(byAge);
  const lateOrders = [...newOrders, ...preparing].filter(isLate).sort(byAge);
  // الأحدث انتقالاً أوّلاً — «ماذا خرج للتوّ؟» هو سؤال السجلّ
  const recentFirst = (a: VOrder, b: VOrder) =>
    new Date(b.statusChangedAt || b.createdAt).getTime() - new Date(a.statusChangedAt || a.createdAt).getTime();
  const delivered = ordersList.filter(o => o.status === 'delivered').sort(recentFirst);
  const cancelled = ordersList.filter(o => o.status === 'cancelled');
  const done = ordersList.filter(o => o.status === 'delivered' || o.status === 'cancelled').sort(recentFirst);

  const ticket = (o: VOrder) => (
    <Ticket key={o.id} o={o} now={now} kds={kds} wide={wide}
      busy={busyId === o.id} asking={askCancel === o.id} flashing={flashIds.includes(o.id)}
      onAdvance={() => changeStatus(o, o.status === 'new' ? 'preparing' : 'delivered')}
      onAsk={() => setAskCancel(o.id)}
      onKeep={() => setAskCancel(null)}
      onCancel={() => changeStatus(o, 'cancelled')} />
  );

  // ── اللافتات: ثلاثٌ على الأكثر، كلٌّ سطرٌ واحد مضغوط ──
  const pushOff = pushState !== 'granted';
  const deafCount = pushStatus?.accountsWithoutDevice ?? 0;
  const deafNames = (pushStatus?.accounts ?? []).filter(a => a.devices === 0).map(a => a.displayName);
  const banners = (
    <>
      {audioLocked && !muted && (
        <button type="button" onClick={() => { setAudioLocked(false); playDing(); }}
          className="vc-press w-full rounded-xl flex items-center gap-2.5 px-3.5 text-right font-extrabold text-[13.5px]"
          style={{ minHeight: 48, background: 'rgba(204,127,34,.10)', border: '1px solid rgba(204,127,34,.35)', color: TX.amber }}>
          <Icon name="sound" size={18} />
          <span className="flex-1">اضغط لتفعيل صوت التنبيه</span>
          <span className="text-[12.5px] font-bold" style={{ color: TX.dim }}>المتصفّح يكتمه قبل أوّل لمسة</span>
        </button>
      )}

      {/* 🔇 لا صمت: جهازٌ بلا إشعارات — أو زميلٌ بلا جهاز — يجب أن يُرى لا أن يُخمَّن */}
      {(pushOff || deafCount > 0) && (
        <div role="status" className="rounded-xl flex items-center gap-2.5 px-3.5 py-2"
          style={{ minHeight: 52, background: 'rgba(240,197,140,.07)', border: '1px solid rgba(240,197,140,.30)', color: TX.amber }}>
          <Icon name="bellOff" size={18} />
          <div className="flex-1 min-w-0 leading-snug">
            <div className="text-[13.5px] font-extrabold">
              {pushOff ? 'الإشعارات مطفأة على هذا الجهاز' : `${deafCount} من حسابات المكان بلا جهازٍ مسجَّل`}
            </div>
            <div className="text-[12.5px]" style={{ color: TX.sub }}>
              {pushOff
                ? (isIOS ? 'على الآيفون افتح الكونسول من أيقونة الشاشة الرئيسيّة أوّلاً' : 'الطلبات تصل هنا فقط ما دامت الشاشة مفتوحة')
                : null}
              {/* 🧾 بالاسم لا بالعدد: «من الأصمّ؟» هو السؤال الذي يجيب عنه السطر */}
              {deafCount > 0 && (
                <span className="block truncate">
                  {pushOff && <>{deafCount} {deafCount === 1 ? 'حساب' : 'حسابات'} بلا جهاز</>}
                  {deafNames.length > 0 && <>{pushOff ? ': ' : 'بلا جهاز: '}{deafNames.join('، ')}</>}
                </span>
              )}
            </div>
          </div>
          {pushOff && (
            <button type="button" onClick={enablePush} disabled={pushState === 'busy'}
              className="vc-press h-11 px-3.5 rounded-[10px] font-extrabold text-[13.5px] shrink-0"
              style={{ background: SHARE.venue, color: '#1A1208' }}>
              {pushState === 'busy' ? 'جارٍ…' : 'فعّلها'}
            </button>
          )}
        </div>
      )}

      {blackout && (
        <div role="alert" className="rounded-xl flex items-center gap-2.5 pr-3.5 pl-1"
          style={{ minHeight: 52, background: 'rgba(224,43,43,.14)', border: '1.5px solid rgba(224,43,43,.45)', color: '#FBB4A4' }}>
          <Icon name="bellOff" size={18} color={TX.bad} />
          <b className="flex-1 text-[13.5px] font-extrabold leading-snug py-2">{blackout}</b>
          <button type="button" onClick={() => setBlackout('')} aria-label="إخفاء التنبيه"
            className="vc-press w-11 h-11 rounded-[10px] flex items-center justify-center shrink-0" style={{ color: TX.bad }}>
            <Icon name="x" size={18} stroke={2} />
          </button>
        </div>
      )}
    </>
  );

  // ── 💨 خدمة الأرجيلة — بلا سعرٍ لكنّها أعجل: من طلب فحماً ينتظر بأرجيلةٍ تبرد ──
  const serviceSection = (alwaysShow: boolean) => {
    if (!canSvc || (!alwaysShow && svcList.length === 0)) return null;
    return (
      <section aria-label="خدمة الأرجيلة" className="rounded-2xl px-3 pt-3 pb-1"
        style={{ background: 'rgba(204,127,34,.08)', border: '1px solid rgba(204,127,34,.32)' }}>
        <h2 className="flex items-center gap-2 text-[13.5px] font-extrabold" style={{ color: TX.amber }}>
          <Icon name="flame" size={16} stroke={2} />
          خدمة الأرجيلة {svcList.length > 0 && <span className="vc-num">{svcList.length}</span>}
        </h2>
        {svcList.length === 0 && (
          <p className="text-[13.5px] pt-2.5 pb-2" style={{ color: TX.sub }}>لا طلبات خدمة مفتوحة</p>
        )}
        {svcList.map(s => {
          const mins = minsSince(s.createdAt, now);
          const late = mins * 60 >= STALL_SEC;
          return (
            <div key={s.id} className="vc-enter flex items-center gap-2.5 py-2">
              <SeatBadge seat={s.physicalId} size={40} line={late ? EM.hot : EM.line2} />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-extrabold truncate">{svcLabel(s)} · {s.playerName}</div>
                {s.note && <div className="text-[12.5px] truncate" style={{ color: TX.sub }}>ملاحظة: {s.note}</div>}
                <div className="text-[12.5px] font-bold" style={{ color: late ? TX.bad : TX.sub }}>
                  منذ <span className="vc-num">{mins}</span> د{late ? ' · متأخّر' : ''}
                </div>
              </div>
              <button type="button" onClick={() => resolveSvc(s)} aria-label={`تمّ — ${svcLabel(s)} ${s.playerName}`}
                className="vc-press h-11 px-4 rounded-xl text-[14px] font-extrabold shrink-0"
                style={{ background: 'rgba(37,192,138,.12)', border: '1px solid rgba(37,192,138,.45)', color: TX.good }}>
                تمّ
              </button>
            </div>
          );
        })}
      </section>
    );
  };

  // ── 👥 في الغرفة — من جلس ولم يطلب بعد يُرى ويُذكَّر ──
  //    نفس سُلّم الجمرة: الجالس بلا طلبٍ «يسخن» بمرور الوقت كالتذكرة المتروكة
  const roomSections = rooms.map(room => {
    const withMin = room.players.map(p => ({ ...p, mins: minsSince(p.joinedAt, now) }));
    const noOrder = withMin.filter(p => p.ordersCount === 0).sort((a, b) => b.mins - a.mins);
    const ordered = withMin.filter(p => p.ordersCount > 0).sort((a, b) => a.physicalId - b.physicalId);
    const open = roomOpen.includes(room.activityId);
    const toggle = () => setRoomOpen(p => p.includes(room.activityId) ? p.filter(x => x !== room.activityId) : [...p, room.activityId]);
    const label = (t: string, n: number) => (
      <div className="flex items-center gap-2 mt-2.5 mb-1.5 text-[12.5px] font-bold" style={{ color: TX.dim }}>
        {t}<span className="flex-1 h-px" style={{ background: EM.line }} /><span className="vc-num">{n}</span>
      </div>
    );
    return (
      <section key={room.activityId} aria-label={`في الغرفة — ${room.activityName}`} className="rounded-2xl overflow-hidden"
        style={{ background: EM.ink2, border: `1px solid ${EM.line}` }}>
        <button type="button" onClick={toggle} aria-expanded={open}
          className="vc-press w-full flex items-center gap-2.5 px-3.5 text-right" style={{ minHeight: 48 }}>
          <Icon name="users" size={18} color={TX.sub} />
          <span className="flex-1 min-w-0 truncate text-[14px] font-bold" style={{ color: TX.sub }}>
            في الغرفة <span className="vc-num">{room.players.length}</span>
            {' · '}
            {noOrder.length > 0
              ? <span style={{ color: TX.amber }}><span className="vc-num">{noOrder.length}</span> لم يطلبوا</span>
              : <span style={{ color: TX.good }}>الكلّ طلب</span>}
            {rooms.length > 1 && <span style={{ color: TX.dim }}> · {room.activityName}</span>}
          </span>
          <Icon name="chevron" size={16} color={TX.dim}
            style={{ transform: open ? 'rotate(-90deg)' : 'none', transition: 'transform 200ms ease' }} />
        </button>
        {open && (
          <div className="px-3 pb-3" style={{ borderTop: `1px solid ${EM.line}` }}>
            {noOrder.length > 0 && (
              <>
                {label('لم يطلبوا — الأقدم جلوساً أوّلاً', noOrder.length)}
                <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))' }}>
                  {noOrder.map(p => {
                    const hp = heatPill(p.mins * 60);
                    return (
                      <div key={p.physicalId} className="flex items-center gap-2 rounded-xl px-2 py-1.5"
                        style={{ background: EM.card, border: `1px solid ${hp.late ? 'rgba(224,73,43,.45)' : EM.line}` }}>
                        <SeatBadge seat={p.physicalId} size={36} line={hp.line} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13.5px] font-bold truncate">{p.playerName}</span>
                          <span className="block text-[12.5px] font-bold" style={{ color: hp.fg }}>
                            {p.mins < 1 ? 'جلس الآن' : <>منذ <span className="vc-num">{p.mins}</span> د</>}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {ordered.length > 0 && (
              <>
                {label('طلبوا', ordered.length)}
                <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))' }}>
                  {ordered.map(p => (
                    <div key={p.physicalId} className="flex items-center gap-2 rounded-xl px-2 py-1.5"
                      style={{ background: 'rgba(255,255,255,.02)', border: `1px solid ${EM.line}` }}>
                      <SeatBadge seat={p.physicalId} size={36} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13.5px] font-bold truncate" style={{ color: TX.sub }}>{p.playerName}</span>
                        <span className="block text-[12.5px]" style={{ color: TX.dim }}>
                          {pOrders(p.ordersCount)}
                          {!kds && <> · <span className="vc-num">{f2(p.ordersTotal)}</span></>}
                        </span>
                      </span>
                      <Icon name="check" size={16} stroke={2.2} color={TX.good} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>
    );
  });

  // 📡 السوكيت منقطع؟ سطرٌ هادئ لا لافتة — المسح الدوريّ يغطّي، لكن لا نخفي التأخير
  const offlineNote = !loading && !live && (
    <p className="text-[12.5px] flex items-center gap-1.5" style={{ color: TX.dim }}>
      <span className="w-[7px] h-[7px] rounded-full" style={{ background: TX.amberHi }} />
      الاتصال اللحظيّ منقطع — تتحدّث السكّة كلّ <span className="vc-num">30</span> ثانية
    </p>
  );

  const railHead = (title: string, n: number, color: string) => (
    <h2 className="flex items-center gap-2 text-[13.5px] font-extrabold mt-1" style={{ color }}>
      <span>{title}</span><span className="vc-num" style={{ color: TX.dim }}>{n}</span>
      <span className="flex-1 h-px" style={{ background: EM.line }} />
    </h2>
  );

  // ══════════════ 🖥️ الشاشة العريضة: شاشة البار ══════════════
  if (wide) {
    const col = (title: string, dot: string, list: VOrder[]) => {
      const lateN = list.filter(isLate).length;
      return (
        <section aria-label={title} className="rounded-[18px] flex flex-col min-w-0"
          style={{ background: '#101412', border: '1px solid #1F2622' }}>
          <h2 className="flex items-center gap-2.5 px-4 py-3.5 text-[15px] font-extrabold" style={{ borderBottom: '1px solid #1F2622' }}>
            <span className="w-[9px] h-[9px] rounded-full" style={{ background: dot }} />
            {title}<span className="vc-num" style={{ color: TX.dim }}>{list.length}</span>
            {/* المتأخّر يبقى في عموده — مرتّبٌ أوّلاً بحدٍّ أحمر — وعدّه هنا يكفي */}
            {lateN > 0 && (
              <span className="mr-auto rounded-full px-2.5 py-0.5 text-[12.5px] font-extrabold"
                style={{ background: 'rgba(224,73,43,.18)', color: TX.bad }}>
                <span className="vc-num">{lateN}</span> متأخّر
              </span>
            )}
          </h2>
          <div className="p-3 flex flex-col gap-2.5">
            {list.map(ticket)}
            {list.length === 0 && <p className="py-7 text-center text-[14px]" style={{ color: TX.dim }}>لا شيء هنا الآن</p>}
          </div>
        </section>
      );
    };
    return (
      <div className="flex flex-col gap-3.5">
        {banners}
        {offlineNote}
        {loading ? <Skeleton h={180} n={2} /> : (
          <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr)) 300px' }}>
            {col('بانتظار القبول', '#6E93A8', newOrders)}
            {col('قيد التحضير', SHARE.venue, preparing)}
            <aside className="flex flex-col gap-4 sticky self-start" style={{ top: 128 }}>
              {serviceSection(true)}
              <section aria-label="سُلّم مؤخّراً" className="rounded-[18px] p-3.5"
                style={{ background: '#101412', border: '1px solid #1F2622' }}>
                <h2 className="text-[15px] font-extrabold mb-2">
                  سُلّم مؤخّراً <span className="vc-num" style={{ color: TX.dim }}>{delivered.length}</span>
                  {cancelled.length > 0 && (
                    <span className="text-[12.5px] font-bold" style={{ color: TX.bad }}> · أُلغي <span className="vc-num">{cancelled.length}</span></span>
                  )}
                </h2>
                {delivered.length === 0 && <p className="text-[13.5px] py-2" style={{ color: TX.dim }}>لم يُسلَّم شيءٌ بعد</p>}
                {delivered.slice(0, 12).map(o => (
                  <div key={o.id} className="vc-enter flex justify-between gap-2 py-2.5 text-[13.5px]" style={{ borderTop: '1px solid #1F2622' }}>
                    <span className="min-w-0 truncate">
                      {o.physicalId != null && <><span className="vc-num">{o.physicalId}</span> · </>}{o.playerName}
                    </span>
                    <span className="truncate shrink-0" style={{ color: TX.dim, maxWidth: 140 }}>{o.items[0]?.name}</span>
                  </div>
                ))}
              </section>
            </aside>
          </div>
        )}
        {roomSections}
        <Toast toast={toast} onHide={hide} />
      </div>
    );
  }

  // ══════════════ 📱 الهاتف: عمودٌ واحد ══════════════
  type Rail = { key: string; title: string; color: string; list: VOrder[] };
  let rails: Rail[];
  if (statusFilter === 'late') rails = [{ key: 'late', title: 'متأخّر — ابدأ بها', color: TX.bad, list: lateOrders }];
  else if (statusFilter === 'new') rails = [{ key: 'new', title: 'بانتظار القبول', color: TX.sub, list: newOrders }];
  else if (statusFilter === 'preparing') rails = [{ key: 'prep', title: 'قيد التحضير', color: TX.sub, list: preparing }];
  else rails = [
    { key: 'late', title: 'متأخّر — ابدأ بها', color: TX.bad, list: lateOrders },
    { key: 'new', title: 'بانتظار القبول', color: TX.sub, list: newOrders.filter(o => !isLate(o)) },
    { key: 'prep', title: 'قيد التحضير', color: TX.sub, list: preparing.filter(o => !isLate(o)) },
  ];
  rails = rails.filter(r => r.list.length > 0);

  const kpi = (key: 'new' | 'preparing' | 'late', label: string, n: number, dot: string, bgOn: string) => {
    const on = statusFilter === key;
    return (
      <button key={key} type="button" aria-pressed={on}
        onClick={() => setStatusFilter(f => f === key ? 'all' : key)}
        className="vc-press text-right rounded-[14px] px-3 py-2.5"
        style={{ minHeight: 66, background: on ? bgOn : EM.card, border: `1px solid ${on ? dot : EM.line}`, color: EM.text }}>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: dot }} />
          <span className="vc-num text-[24px] font-semibold leading-tight">{n}</span>
        </span>
        <span className="block text-[12.5px] font-bold mt-0.5" style={{ color: TX.sub }}>{label}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3.5">
      {banners}
      {serviceSection(false)}

      {/* ── المؤشّرات: فلاتر تبديل لا عدّادات فحسب ── */}
      <div role="group" aria-label="فلترة الطلبات" className="grid grid-cols-3 gap-2">
        {kpi('new', 'بانتظار', newOrders.length, '#6E93A8', 'rgba(91,122,140,.16)')}
        {kpi('preparing', 'قيد التحضير', preparing.length, SHARE.venue, 'rgba(204,127,34,.14)')}
        {kpi('late', 'متأخّر 10 د+', lateOrders.length, EM.hot, 'rgba(224,73,43,.14)')}
      </div>
      {offlineNote}

      {loading ? <Skeleton h={160} n={3} /> : rails.length === 0 ? (
        <div className="text-center px-4 py-8 rounded-2xl" style={{ border: `1px dashed ${EM.line2}` }}>
          <div className="text-[15px] font-extrabold">{statusFilter === 'all' ? 'السكّة فارغة' : 'لا طلبات ضمن هذا الفلتر'}</div>
          <div className="text-[13.5px] mt-1 leading-relaxed" style={{ color: TX.dim }}>
            {statusFilter === 'all'
              ? 'أبقِ الشاشة مفتوحة — الطلب الجديد يظهر هنا فوراً مع تنبيهٍ صوتيّ'
              : 'اضغط الفلتر مرّةً أخرى لعرض الكلّ'}
          </div>
        </div>
      ) : rails.map(r => (
        <section key={r.key} aria-label={r.title} className="flex flex-col gap-2.5">
          {railHead(r.title, r.list.length, r.color)}
          {r.list.map(ticket)}
        </section>
      ))}

      {roomSections}

      {/* ── السجلّ — مطويّ بعيداً عن العين ── */}
      {!kds && done.length > 0 && (
        <>
          <button type="button" onClick={() => setShowHistory(v => !v)} aria-expanded={showHistory}
            className="vc-press w-full flex items-center justify-between px-3.5 rounded-[14px] text-[14px] font-bold"
            style={{ minHeight: 48, border: `1px solid ${EM.line}`, background: EM.ink2, color: TX.sub }}>
            <span>سُلّم الليلة <span className="vc-num">{delivered.length}</span> · أُلغي <span className="vc-num">{cancelled.length}</span></span>
            <span>{showHistory ? 'إخفاء' : 'عرض'}</span>
          </button>
          {showHistory && (
            <div className="flex flex-col gap-1.5">
              {done.map(o => (
                <div key={o.id} className="vc-enter flex justify-between gap-2 px-3 py-2.5 rounded-[10px] text-[13.5px]" style={{ background: EM.ink2 }}>
                  <span className="min-w-0 truncate">{o.playerName} · <span className="vc-num">#{o.id}</span></span>
                  <span className="truncate shrink-0" style={{ maxWidth: '45%', color: o.status === 'cancelled' ? TX.bad : TX.dim }}>
                    {o.status === 'cancelled' ? 'أُلغي' : o.items[0]?.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Toast toast={toast} onHide={hide} />
    </div>
  );
}

// ── تذكرة ─────────────────────────────────────────────
// مكوّنٌ على مستوى الملفّ (لا داخل الصفحة): تعريفه داخلها كان يعيد تركيب كلّ
// تذكرةٍ مع نبضة الساعة — فتُعاد حركة الدخول ويضيع التركيز من الزرّ.
function Ticket({ o, now, kds, wide, busy, asking, flashing, onAdvance, onAsk, onKeep, onCancel }: {
  o: VOrder; now: number; kds: boolean; wide: boolean; busy: boolean; asking: boolean; flashing: boolean;
  onAdvance: () => void; onAsk: () => void; onKeep: () => void; onCancel: () => void;
}) {
  const sec = stageAge(o, now);
  const hp = heatPill(sec);
  const isNew = o.status === 'new';
  const shisha = o.items.some(i => i.name === SHISHA_PAID);
  // 📏 ثلاث درجات: هاتف · شاشة بار · شاشة مطبخ (تُقرأ من مترين)
  const fs = kds
    ? { seat: 50, name: 21, sub: 14, pill: 16, item: 19, opt: 16 }
    : wide
      ? { seat: 46, name: 18, sub: 13, pill: 14, item: 17, opt: 14.5 }
      : { seat: 42, name: 16, sub: 12.5, pill: 13, item: 15.5, opt: 13.5 };

  return (
    <article aria-label={`طلب ${o.playerName}`} className="vc-enter rounded-2xl p-3.5"
      style={{
        background: EM.card,
        border: `1px solid ${hp.late ? 'rgba(224,73,43,.45)' : flashing ? TX.amberHi : EM.line}`,
        boxShadow: flashing ? `0 0 0 1px ${TX.amberHi}` : 'none',
        transition: 'border-color .4s, box-shadow .4s',
      }}>
      {/* مَن · أين · منذ متى */}
      <div className="flex items-center gap-2.5">
        <SeatBadge seat={o.physicalId} size={fs.seat} line={hp.line} />
        <div className="flex-1 min-w-0">
          <div className="font-extrabold truncate leading-tight" style={{ fontSize: fs.name }}>{o.playerName}</div>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5" style={{ fontSize: fs.sub, color: TX.dim }}>
            <span>{isNew ? 'بانتظار القبول' : 'قيد التحضير'} · <span className="vc-num">#{o.id}</span></span>
            {shisha && (
              <span className="px-2 rounded-full font-bold" style={{ background: 'rgba(204,127,34,.16)', color: TX.amber }}>أرجيلة · مدفوعة</span>
            )}
          </div>
        </div>
        <span className="shrink-0 rounded-full font-extrabold whitespace-nowrap"
          style={{ padding: '5px 10px', background: hp.bg, color: hp.fg, fontSize: fs.pill }}>
          {sec < 60 ? 'الآن' : <>منذ <span className="vc-num">{Math.floor(sec / 60)}</span> د</>}
        </span>
      </div>

      <div style={{ borderTop: `1px dashed ${EM.line2}`, margin: '12px 0 8px' }} />

      {/* البنود */}
      {o.items.map((i, idx) => (
        <div key={idx} className="py-[3px]">
          <div className="flex gap-2 font-bold" style={{ fontSize: fs.item }}>
            <span className="vc-num shrink-0" style={{ color: TX.amberHi, minWidth: 26 }}>×{i.quantity}</span>
            <span className="min-w-0">{i.name}</span>
          </div>
          {/* الخيارات — إغفالها يعني تحضيراً خاطئاً، فلها أبرز لون */}
          {i.options && i.options.length > 0 && (
            <div style={{ fontSize: fs.opt, color: '#E8C25B', paddingInlineStart: 34, lineHeight: 1.5 }}>
              {i.options.map(x => `${x.group}: ${x.value}`).join(' · ')}
            </div>
          )}
          {i.components && i.components.length > 0 && (
            <div style={{ fontSize: fs.opt, color: '#C2AEEB', paddingInlineStart: 34, lineHeight: 1.5 }}>
              {i.components.map(c => {
                const co = (c.options ?? []).map(x => x.value).join('/');
                const q = c.qty * i.quantity;
                return `${c.name}${co ? ` (${co})` : ''}${q > 1 ? ` ×${q}` : ''}`;
              }).join(' · ')}
            </div>
          )}
        </div>
      ))}
      {o.note && (
        <div className="mt-2 rounded-[10px] px-2.5 py-2 leading-relaxed"
          style={{ fontSize: fs.opt, background: 'rgba(204,127,34,.10)', color: TX.amber }}>
          ملاحظة اللاعب: {o.note}
        </div>
      )}

      {/* الإجراءات — رئيسيٌّ واحد عريض، والإلغاء يسأل داخل التذكرة */}
      {!kds && (asking ? (
        <div className="vc-enter mt-3 p-3 rounded-xl" style={{ background: 'rgba(224,73,43,.08)', border: '1px solid rgba(224,73,43,.35)' }}>
          <div className="text-[14px] font-extrabold">إلغاء طلب {o.playerName}؟</div>
          <div className="text-[12.5px] mt-0.5" style={{ color: TX.sub }}>يصله إشعار بالإلغاء ولا يدخل فاتورته.</div>
          <div className="flex gap-2 mt-2.5">
            <Btn kind="danger" h={44} className="flex-1" onClick={onCancel} disabled={busy}>
              {busy ? 'جارٍ…' : 'نعم، ألغِ الطلب'}
            </Btn>
            <Btn kind="ghost" h={44} className="flex-1" onClick={onKeep} disabled={busy}>لا، أبقِه</Btn>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={onAdvance} disabled={busy}
            className="vc-press flex-1 rounded-xl font-extrabold"
            style={{
              height: wide ? 52 : 48, fontSize: wide ? 16 : 15,
              background: isNew ? SHARE.venue : EM.go, color: isNew ? '#1A1208' : '#04231A',
            }}>
            {busy ? 'جارٍ…' : isNew ? 'ابدأ التحضير' : 'سلّم الطلب'}
          </button>
          <button type="button" onClick={onAsk} disabled={busy} aria-label={`إلغاء طلب ${o.playerName}`}
            className="vc-press rounded-xl flex items-center justify-center shrink-0"
            style={{ width: wide ? 52 : 48, height: wide ? 52 : 48, border: `1px solid ${EM.line2}`, color: TX.sub }}>
            <Icon name="x" size={18} stroke={2} />
          </button>
        </div>
      ))}
    </article>
  );
}
