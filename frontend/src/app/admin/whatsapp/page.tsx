'use client';

// ══════════════════════════════════════════════════════
// 💬 مركز محادثات واتساب — /admin/whatsapp (أدمن فقط)
// ══════════════════════════════════════════════════════
// ثلاث لوحات: المحادثات | المحادثة | العميل — لحظي عبر غرفة wa:inbox
// مبني على الـ APIs الحية من المرحلة 1 + إضافات context/link/note
// القرارات المعتمدة: فتح المحادثة يعلّمها مقروءة، الرد اليدوي يوقف البوت
// 30 دقيقة (الشريط الأصفر)، المفتاح إيقاف دائم، صوت تنبيه قابل للكتم.

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import { swalConfirm, swalAlert, swalToast } from '@/lib/swal';
import BookingForm from '../components/BookingForm';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const MUTE_KEY = 'wa_inbox_muted';

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
function getUser() { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } }

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e: any = new Error(err.error || `API error ${res.status}`);
    e.code = err.code; e.status = res.status;
    throw e;
  }
  return res.json();
}

// ── ثوابت العرض ──
const RANK_AR: Record<string, string> = {
  INFORMANT: 'مخبر', SOLDIER: 'جندي', CAPO: 'كابو', UNDERBOSS: 'أندربوس', GODFATHER: 'الأب الروحي',
};
const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'unread', label: 'غير مقروء' },
  { key: 'bot', label: '🤖 بوت' },
  { key: 'human', label: '👤 بشري' },
] as const;

function fmtTime(d: any) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('ar-JO', { hour: 'numeric', minute: '2-digit' });
}
function fmtWhen(d: any) {
  if (!d) return '';
  const dt = new Date(d);
  const today = new Date();
  if (dt.toDateString() === today.toDateString()) return fmtTime(dt);
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (dt.toDateString() === yest.toDateString()) return 'أمس';
  return dt.toLocaleDateString('ar-JO', { day: 'numeric', month: 'short' });
}
function fmtDay(d: any) {
  const dt = new Date(d);
  const today = new Date();
  if (dt.toDateString() === today.toDateString()) return 'اليوم';
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (dt.toDateString() === yest.toDateString()) return 'أمس';
  return dt.toLocaleDateString('ar-JO', { weekday: 'long', day: 'numeric', month: 'long' });
}
function intlPhone(local: string) { return local ? '+962 ' + local.slice(1) : ''; }
function windowHoursLeft(lastInboundAt: any): number {
  if (!lastInboundAt) return 0;
  const left = 24 * 3600e3 - (Date.now() - new Date(lastInboundAt).getTime());
  return Math.max(0, left / 3600e3);
}

// صوت تنبيه خفيف (WebAudio — بلا ملفات خارجية)
let audioCtx: AudioContext | null = null;
function playPing() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.12, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
    o.start(); o.stop(audioCtx.currentTime + 0.36);
    o.frequency.setValueAtTime(1174, audioCtx.currentTime + 0.12);
  } catch { /* الصوت ليس حرجاً */ }
}

// ── صحّات التسليم ──
function Ticks({ status }: { status: string }) {
  if (status === 'failed') return <span className="text-rose-400 text-[11px] font-bold">✗ فشل</span>;
  if (status === 'read') return <span className="text-sky-400 text-xs tracking-[-2px]">✓✓</span>;
  if (status === 'delivered') return <span className="text-gray-500 text-xs tracking-[-2px]">✓✓</span>;
  if (status === 'sent') return <span className="text-gray-500 text-xs">✓</span>;
  return null;
}
function SourceTag({ m }: { m: any }) {
  if (m.source === 'bot') return <span className="text-sky-400 font-bold">🤖 البوت</span>;
  if (m.source === 'staff') return <span className="text-amber-400 font-bold">👤 موظف</span>;
  if (m.source === 'system') return <span className="text-violet-400 font-bold">⚙️ النظام</span>;
  if (m.source === 'template') return <span className="text-violet-400 font-bold">📋 قالب</span>;
  return null;
}

export default function WhatsAppInboxPage() {
  const user = useMemo(() => getUser(), []);

  // ── الحالة ──
  const [convs, setConvs] = useState<any[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [conv, setConv] = useState<any | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [ctx, setCtx] = useState<any | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState(false);
  const [mobilePane, setMobilePane] = useState<'list' | 'chat' | 'info'>('list');
  const [noteDraft, setNoteDraft] = useState('');
  const [showLink, setShowLink] = useState(false);
  const [linkQ, setLinkQ] = useState('');
  const [linkResults, setLinkResults] = useState<any[]>([]);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bkData, setBkData] = useState<{ activities: any[]; locations: any[]; staffList: any[] } | null>(null);
  const [, forceTick] = useState(0); // لتحديث عدّادات النافذة/الإيقاف المؤقت دورياً

  const threadRef = useRef<HTMLDivElement>(null);
  const selIdRef = useRef<number | null>(null);
  selIdRef.current = selId;
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  // ── جلب المحادثات ──
  const loadConvs = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoadingConvs(true);
      const data = await apiFetch(`/api/whatsapp/conversations?filter=${filter}&q=${encodeURIComponent(q)}&limit=100`);
      setConvs(data.conversations || []);
    } catch (e: any) {
      if (!opts?.silent) swalAlert('تعذر جلب المحادثات: ' + e.message, 'error');
    } finally {
      setLoadingConvs(false);
    }
  }, [filter, q]);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  // ── فتح محادثة: رسائل + مقروء + سياق العميل ──
  const openConv = useCallback(async (id: number) => {
    setSelId(id);
    setMobilePane('chat');
    setLoadingMsgs(true);
    setCtx(null);
    setShowLink(false);
    try {
      const data = await apiFetch(`/api/whatsapp/conversations/${id}/messages?limit=50`);
      setConv(data.conversation);
      setMessages((data.messages || []).slice().reverse()); // الأقدم أولاً للعرض
      setHasMore(!!data.hasMore);
      // فتح المحادثة يعلّمها مقروءة (بند معتمد)
      if (data.conversation?.unreadCount > 0) {
        apiFetch(`/api/whatsapp/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
      }
      setConvs(prev => prev.map(c => (c.id === id ? { ...c, unreadCount: 0 } : c)));
      // سياق العميل بالتوازي
      apiFetch(`/api/whatsapp/conversations/${id}/context`)
        .then(setCtx)
        .catch(() => setCtx({ player: null, bookings: [], notes: [], optedOut: false }));
    } catch (e: any) {
      swalAlert('تعذر فتح المحادثة: ' + e.message, 'error');
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  // ── تحميل رسائل أقدم ──
  const loadOlder = useCallback(async () => {
    if (!selId || messages.length === 0) return;
    const oldest = messages[0]?.id;
    try {
      const data = await apiFetch(`/api/whatsapp/conversations/${selId}/messages?limit=50&before=${oldest}`);
      setMessages(prev => [...(data.messages || []).slice().reverse(), ...prev]);
      setHasMore(!!data.hasMore);
    } catch { /* تجاهل */ }
  }, [selId, messages]);

  // ── التمرير لأسفل عند الرسائل الجديدة ──
  const scrollBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = threadRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);
  useEffect(() => { scrollBottom(); }, [selId, loadingMsgs, scrollBottom]);

  // ── السوكيت: أحداث لحظية ──
  useEffect(() => {
    const s = getSocket();

    const onNew = (payload: any) => {
      const { conversation, message } = payload || {};
      if (!conversation || !message) return;
      // تحديث القائمة: استبدال أو إدراج بالمقدمة
      setConvs(prev => {
        const rest = prev.filter(c => c.id !== conversation.id);
        const openNow = selIdRef.current === conversation.id && message.direction === 'in';
        const merged = { ...conversation, unreadCount: openNow ? 0 : conversation.unreadCount };
        return [merged, ...rest];
      });
      // المحادثة المفتوحة: إلحاق الرسالة + مقروء
      if (selIdRef.current === conversation.id) {
        setConv((prev: any) => ({ ...prev, ...conversation, unreadCount: 0 }));
        setMessages(prev => (prev.some(m => m.id === message.id) ? prev : [...prev, message]));
        if (message.direction === 'in') {
          apiFetch(`/api/whatsapp/conversations/${conversation.id}/read`, { method: 'POST' }).catch(() => {});
        }
        scrollBottom();
      }
      if (message.direction === 'in' && !mutedRef.current) playPing();
    };

    const onStatus = (upd: any) => {
      if (!upd?.id) return;
      setMessages(prev => prev.map(m => (m.id === upd.id ? { ...m, status: upd.status, errorMessage: upd.errorMessage } : m)));
    };

    s.on('wa:message:new', onNew);
    s.on('wa:status:update', onStatus);
    return () => {
      s.off('wa:message:new', onNew);
      s.off('wa:status:update', onStatus);
    };
  }, [scrollBottom]);

  // ── مؤقّت دوري: عدّادات النافذة والإيقاف المؤقت + تحديث صامت للقائمة ──
  useEffect(() => {
    const t = setInterval(() => { forceTick(x => x + 1); }, 30_000);
    const r = setInterval(() => { loadConvs({ silent: true }); }, 60_000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [loadConvs]);

  // ── كتم الصوت (محفوظ محلياً) ──
  useEffect(() => {
    try { setMuted(localStorage.getItem(MUTE_KEY) === '1'); } catch { /* تجاهل */ }
  }, []);
  const toggleMute = () => {
    setMuted(m => {
      try { localStorage.setItem(MUTE_KEY, m ? '0' : '1'); } catch { /* تجاهل */ }
      return !m;
    });
  };

  // ── الإرسال ──
  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !selId || sending) return;
    setSending(true);
    try {
      const res = await apiFetch('/api/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ conversationId: selId, text }),
      });
      setDraft('');
      if (res.message) setMessages(prev => (prev.some(m => m.id === res.message.id) ? prev : [...prev, res.message]));
      if (res.conversation) {
        setConv((prev: any) => ({ ...prev, ...res.conversation }));
        setConvs(prev => prev.map(c => (c.id === selId ? { ...c, ...res.conversation, unreadCount: 0 } : c)));
      }
      scrollBottom();
    } catch (e: any) {
      if (e.code === 'WINDOW_EXPIRED') swalAlert('نافذة الرد المجانية (24 ساعة) منتهية — لا يمكن الإرسال حتى يراسلك العميل من جديد.', 'warning');
      else swalAlert('فشل الإرسال: ' + e.message, 'error');
    } finally {
      setSending(false);
    }
  }, [draft, selId, sending, scrollBottom]);

  // ── مفتاح البوت ──
  const toggleBot = useCallback(async () => {
    if (!conv) return;
    const enabling = !conv.botEnabled;
    const ok = await swalConfirm(
      enabling
        ? 'سيعود البوت للرد تلقائياً على رسائل هذا العميل.'
        : 'لن يرد البوت حتى تعيد تفعيله يدوياً (الرد اليدوي العادي يوقفه 30 دقيقة فقط دون هذا الزر).',
      {
        title: enabling ? 'تفعيل البوت لهذه المحادثة؟' : 'إيقاف البوت نهائياً؟',
        danger: !enabling,
        confirmText: enabling ? 'تفعيل' : 'إيقاف',
      },
    );
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/whatsapp/conversations/${conv.id}/bot-toggle`, {
        method: 'POST',
        body: JSON.stringify({ enabled: enabling }),
      });
      setConv((prev: any) => ({ ...prev, ...res.conversation }));
      setConvs(prev => prev.map(c => (c.id === conv.id ? { ...c, ...res.conversation } : c)));
      swalToast(enabling ? 'تم تفعيل البوت ✅' : 'تم إيقاف البوت نهائياً لهذه المحادثة', enabling ? 'success' : 'info');
    } catch (e: any) {
      swalAlert(e.message, 'error');
    }
  }, [conv]);

  // ── الملاحظات ──
  const addNote = useCallback(async () => {
    const note = noteDraft.trim();
    if (!note || !selId) return;
    try {
      const res = await apiFetch(`/api/whatsapp/conversations/${selId}/note`, {
        method: 'POST', body: JSON.stringify({ note }),
      });
      setCtx((prev: any) => ({ ...prev, notes: [res.note, ...(prev?.notes || [])] }));
      setNoteDraft('');
      swalToast('حُفظت الملاحظة — سيقرأها البوت أيضاً', 'success');
    } catch (e: any) { swalAlert(e.message, 'error'); }
  }, [noteDraft, selId]);

  // ── الربط اليدوي ──
  useEffect(() => {
    if (!showLink || linkQ.trim().length < 2) { setLinkResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/whatsapp/player-search?q=${encodeURIComponent(linkQ.trim())}`);
        setLinkResults(res.players || []);
      } catch { setLinkResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [linkQ, showLink]);

  const linkPlayer = useCallback(async (playerId: number | null) => {
    if (!selId) return;
    try {
      const res = await apiFetch(`/api/whatsapp/conversations/${selId}/link-player`, {
        method: 'POST', body: JSON.stringify({ playerId }),
      });
      setConv((prev: any) => ({ ...prev, ...res.conversation }));
      setConvs(prev => prev.map(c => (c.id === selId ? { ...c, ...res.conversation } : c)));
      setShowLink(false); setLinkQ('');
      const c = await apiFetch(`/api/whatsapp/conversations/${selId}/context`);
      setCtx(c);
      swalToast(playerId ? 'تم ربط المحادثة باللاعب ✅' : 'تم فك الربط', 'success');
    } catch (e: any) { swalAlert(e.message, 'error'); }
  }, [selId]);

  // ── حجز جديد ──
  const openBooking = useCallback(async () => {
    try {
      if (!bkData) {
        const [a, l, s] = await Promise.all([
          apiFetch('/api/activities'),
          apiFetch('/api/locations'),
          apiFetch('/api/staff').catch(() => ({ staff: [] })),
        ]);
        setBkData({
          activities: a.activities || a || [],
          locations: l.locations || l || [],
          staffList: s.staff || s || [],
        });
      }
      setShowBookingForm(true);
    } catch (e: any) { swalAlert('تعذر تحميل بيانات الحجز: ' + e.message, 'error'); }
  }, [bkData]);

  const submitBooking = useCallback(async (data: any) => {
    await apiFetch('/api/bookings', { method: 'POST', body: JSON.stringify(data) });
    setShowBookingForm(false);
    swalToast('تم إنشاء الحجز ✅', 'success');
    if (selId) apiFetch(`/api/whatsapp/conversations/${selId}/context`).then(setCtx).catch(() => {});
  }, [selId]);

  // ── مشتقات العرض ──
  const paused = conv?.botPausedUntil && new Date(conv.botPausedUntil).getTime() > Date.now();
  const botActive = conv?.botEnabled && !paused;
  const winH = conv ? windowHoursLeft(conv.lastInboundAt) : 0;
  const totalUnread = convs.reduce((s, c) => s + (c.unreadCount || 0), 0);

  // تجميع الرسائل بفواصل الأيام
  const grouped = useMemo(() => {
    const out: Array<{ type: 'day'; label: string } | { type: 'msg'; m: any }> = [];
    let lastDay = '';
    for (const m of messages) {
      const day = new Date(m.createdAt).toDateString();
      if (day !== lastDay) { out.push({ type: 'day', label: fmtDay(m.createdAt) }); lastDay = day; }
      out.push({ type: 'msg', m });
    }
    return out;
  }, [messages]);

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center text-gray-400">
        <div className="text-4xl mb-3">🔒</div>
        مركز محادثات واتساب متاح لحسابات الأدمن فقط.
      </div>
    );
  }

  const paneHidden = (p: 'list' | 'chat' | 'info') =>
    `${mobilePane === p ? 'flex' : 'hidden'} md:flex`;

  return (
    <div className="h-[calc(100dvh-1rem)] md:h-[calc(100dvh-2rem)] flex flex-col" dir="rtl">
      {/* ═══ رأس الصفحة + تبويبات ═══ */}
      <div className="flex items-center gap-3 px-1 pb-3 flex-wrap">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          💬 واتساب
          {totalUnread > 0 && (
            <span className="bg-rose-500 text-white text-xs font-bold rounded-full px-2 py-0.5">{totalUnread}</span>
          )}
        </h1>
        <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 text-sm">
          <span className="px-3 py-1 rounded-lg bg-amber-500/10 text-amber-400 font-bold">المحادثات</span>
          <span className="px-3 py-1 text-gray-600 cursor-not-allowed" title="تُفعَّل مع مرحلة الحملات">الحملات <span className="text-[10px] border border-gray-700 rounded px-1">قريباً</span></span>
        </div>
        <button
          onClick={toggleMute}
          className="mr-auto text-sm px-3 py-1.5 rounded-xl border border-gray-800 bg-gray-900 text-gray-300 hover:text-white"
          title={muted ? 'تشغيل صوت التنبيه' : 'كتم صوت التنبيه'}
        >
          {muted ? '🔕 مكتوم' : '🔔 الصوت'}
        </button>
      </div>

      {/* ═══ اللوحات الثلاث ═══ */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[300px_1fr_280px] gap-0 bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">

        {/* ─── لوحة المحادثات ─── */}
        <div className={`${paneHidden('list')} flex-col min-h-0 border-l border-gray-800`}>
          <div className="p-3 border-b border-gray-800">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="🔍 بحث بالاسم أو الرقم…"
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2 text-sm text-white placeholder-gray-600 focus:border-amber-500 outline-none"
            />
          </div>
          <div className="flex gap-1.5 px-3 py-2 border-b border-gray-800 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`whitespace-nowrap text-xs font-bold rounded-full px-3 py-1 border transition-colors ${
                  filter === f.key
                    ? 'bg-amber-500 text-gray-950 border-amber-500'
                    : 'text-gray-400 border-gray-800 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="p-6 text-center text-gray-500 text-sm">جارٍ التحميل…</div>
            ) : convs.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                <div className="text-3xl mb-2">💬</div>
                لا محادثات {filter !== 'all' ? 'مطابقة للفلتر' : 'بعد — أول رسالة من عميل ستظهر هنا'}
              </div>
            ) : convs.map(c => {
              const cPaused = c.botPausedUntil && new Date(c.botPausedUntil).getTime() > Date.now();
              const cBot = c.botEnabled && !cPaused;
              const cWin = windowHoursLeft(c.lastInboundAt) > 0;
              return (
                <button
                  key={c.id}
                  onClick={() => openConv(c.id)}
                  className={`w-full text-right flex gap-2.5 px-3 py-2.5 border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors ${
                    selId === c.id ? 'bg-gray-800/60 shadow-[inset_3px_0_0_#f59e0b]' : ''
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                    c.playerId ? 'bg-gradient-to-br from-amber-500 to-amber-700 text-gray-950' : 'bg-gray-700 text-gray-200'
                  }`}>
                    {(c.displayName || c.phone || '?').trim().charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-[13px] text-white truncate">{c.displayName || intlPhone(c.phone)}</span>
                      <span className="text-[10px] text-gray-500 mr-auto shrink-0">{fmtWhen(c.lastMessageAt)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cWin ? 'bg-emerald-400' : 'bg-gray-600'}`} title={cWin ? 'نافذة الرد مفتوحة' : 'النافذة منتهية'} />
                      <span className="text-xs text-gray-400 truncate flex-1">{c.lastMessagePreview || '—'}</span>
                      <span className={`text-[9px] font-bold rounded-full px-1.5 py-px shrink-0 ${
                        cBot ? 'bg-sky-500/10 text-sky-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>{cBot ? '🤖' : '👤'}</span>
                      {c.unreadCount > 0 && (
                        <span className="bg-emerald-500 text-gray-950 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shrink-0">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── لوحة المحادثة ─── */}
        <div className={`${paneHidden('chat')} flex-col min-h-0`}>
          {!conv ? (
            <div className="flex-1 flex items-center justify-center text-gray-600 flex-col gap-3">
              <div className="text-5xl">💬</div>
              <div className="text-sm">اختر محادثة من القائمة</div>
            </div>
          ) : (
            <>
              {/* الرأس */}
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 bg-gray-900/80">
                <button className="md:hidden text-gray-400 text-lg" onClick={() => setMobilePane('list')}>▶</button>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                  conv.playerId ? 'bg-gradient-to-br from-amber-500 to-amber-700 text-gray-950' : 'bg-gray-700 text-gray-200'
                }`}>
                  {(conv.displayName || '?').trim().charAt(0) || '؟'}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm text-white flex items-center gap-2 flex-wrap">
                    {conv.displayName || intlPhone(conv.phone)}
                    {ctx?.player && (
                      <span className="text-[10px] font-bold text-amber-400 border border-amber-500/40 rounded px-1.5">
                        {RANK_AR[ctx.player.rankTier] || ctx.player.rankTier} · {ctx.player.rankRR}RR
                      </span>
                    )}
                    {ctx?.optedOut && (
                      <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 rounded-full px-2">🚫 أوقف التسويق</span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500" dir="ltr">{intlPhone(conv.phone)}</div>
                </div>
                <div className="mr-auto flex items-center gap-2.5 shrink-0">
                  <span className={`hidden sm:flex text-[11px] font-bold rounded-full px-2.5 py-1 ${
                    winH > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                  }`}>
                    {winH > 0 ? `🟢 ${Math.ceil(winH)} ساعة` : '🔴 النافذة منتهية'}
                  </span>
                  <button
                    onClick={toggleBot}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-gray-300"
                    title={conv.botEnabled ? 'إيقاف البوت نهائياً لهذه المحادثة' : 'تفعيل البوت'}
                  >
                    🤖
                    <span className={`w-9 h-5 rounded-full relative transition-colors ${conv.botEnabled ? 'bg-emerald-500' : 'bg-gray-700'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${conv.botEnabled ? 'right-0.5' : 'right-4'}`} />
                    </span>
                  </button>
                  <button className="hidden md:block text-gray-500 hover:text-white px-1" onClick={() => setMobilePane('info')} title="لوحة العميل">👤</button>
                </div>
              </div>

              {/* شريط الإيقاف المؤقت */}
              {conv.botEnabled && paused && (
                <div className="bg-amber-500/10 text-amber-400 text-xs font-bold text-center py-1.5 border-b border-gray-800">
                  ⏸️ البوت موقوف مؤقتاً بعد رد بشري — يعود {fmtTime(conv.botPausedUntil)} (كل رد يمدد 30 دقيقة)
                </div>
              )}

              {/* الرسائل */}
              <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1.5 bg-gray-950/40">
                {hasMore && (
                  <button onClick={loadOlder} className="self-center text-[11px] text-gray-500 hover:text-amber-400 border border-gray-800 rounded-full px-4 py-1 mb-1">
                    ⬆ تحميل رسائل أقدم
                  </button>
                )}
                {loadingMsgs ? (
                  <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">جارٍ التحميل…</div>
                ) : grouped.map((g, i) =>
                  g.type === 'day' ? (
                    <div key={'d' + i} className="self-center text-[10px] font-bold text-gray-500 bg-gray-900 border border-gray-800 rounded-full px-3.5 py-0.5 my-1.5">
                      {g.label}
                    </div>
                  ) : (
                    <div
                      key={g.m.id}
                      className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed ${
                        g.m.direction === 'in'
                          ? 'self-start bg-gray-800/80 border border-gray-700/60 rounded-tr-md text-gray-100'
                          : 'self-end bg-emerald-950/70 border border-emerald-900 rounded-tl-md text-gray-100'
                      }`}
                    >
                      <div className="whitespace-pre-wrap break-words">{g.m.body || <span className="text-gray-500 italic">[{g.m.msgType}]</span>}</div>
                      <div className="flex items-center gap-1.5 justify-end mt-0.5 text-[10px] text-gray-500">
                        {g.m.direction === 'out' && <SourceTag m={g.m} />}
                        <span>{fmtTime(g.m.createdAt)}</span>
                        {g.m.direction === 'out' && <Ticks status={g.m.status} />}
                      </div>
                      {g.m.status === 'failed' && g.m.errorMessage && (
                        <div className="text-[10px] text-rose-400 mt-1">⚠️ {g.m.errorMessage}</div>
                      )}
                    </div>
                  )
                )}
              </div>

              {/* صندوق الرد */}
              <div className="border-t border-gray-800 bg-gray-900/80 p-3">
                {winH > 0 ? (
                  <>
                    <div className="flex gap-2 items-center">
                      <span
                        className="text-gray-600 text-xs border border-dashed border-gray-700 rounded-xl px-3 py-2.5 cursor-not-allowed select-none"
                        title="القوالب تُفعَّل مع مرحلة الحملات"
                      >📋</span>
                      <input
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                        placeholder="اكتب رداً كموظف…"
                        className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-amber-500 outline-none"
                        disabled={sending}
                      />
                      <button
                        onClick={send}
                        disabled={sending || !draft.trim()}
                        className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-gray-950 font-bold rounded-xl px-5 py-2.5 text-sm transition-colors"
                      >
                        {sending ? '…' : 'إرسال ◀'}
                      </button>
                    </div>
                    <div className="text-[10.5px] text-gray-600 mt-1.5">
                      💡 الرد اليدوي يوقف البوت 30 دقيقة لهذه المحادثة
                    </div>
                  </>
                ) : (
                  <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl px-4 py-3 text-center text-xs font-bold">
                    🔒 نافذة الرد المجانية (24 ساعة) منتهية
                    <div className="font-normal text-gray-400 mt-1">
                      الرد الآن يتطلب قالباً معتمداً (يُفعَّل مع الحملات) — أو انتظر رسالة جديدة من العميل
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ─── لوحة العميل ─── */}
        <div className={`${paneHidden('info')} flex-col min-h-0 border-r border-gray-800 bg-gray-950/60`}>
          {!conv ? (
            <div className="flex-1 flex items-center justify-center text-gray-700 text-sm">—</div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-3">
              <button className="md:hidden self-start text-gray-400 text-sm" onClick={() => setMobilePane('chat')}>◀ رجوع للمحادثة</button>

              {/* بطاقة اللاعب */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3.5">
                <div className="text-[10.5px] font-bold text-gray-500 mb-2.5 flex items-center justify-between">
                  <span>🎭 اللاعب المرتبط</span>
                  {ctx?.player && <span className="text-emerald-400 text-[9.5px]">مربوط {conv.playerId ? '' : ''}</span>}
                </div>
                {!ctx ? (
                  <div className="text-center text-gray-600 text-xs py-3">جارٍ التحميل…</div>
                ) : ctx.player ? (
                  <>
                    <div className="flex items-center gap-2.5">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 text-gray-950 flex items-center justify-center font-bold">
                        {ctx.player.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-white truncate">{ctx.player.name}</div>
                        <div className="text-[10.5px] text-gray-500">
                          لاعب #{ctx.player.id} · مستوى {ctx.player.level} · <span className="text-amber-400 font-bold">{RANK_AR[ctx.player.rankTier] || ctx.player.rankTier} {ctx.player.rankRR}RR</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 mt-3 text-center">
                      {[
                        { v: ctx.player.totalMatches, l: 'مباراة' },
                        { v: ctx.player.totalWins, l: 'فوز' },
                        { v: ctx.player.totalMatches > 0 ? Math.round((ctx.player.totalWins / ctx.player.totalMatches) * 100) + '%' : '—', l: 'نسبة الفوز' },
                      ].map((s, i) => (
                        <div key={i} className="bg-gray-950 border border-gray-800 rounded-lg py-1.5">
                          <div className="font-bold text-sm text-white tabular-nums">{s.v}</div>
                          <div className="text-[9px] text-gray-600">{s.l}</div>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => linkPlayer(null)} className="w-full mt-2.5 text-[10.5px] text-gray-600 hover:text-rose-400">فك الربط</button>
                  </>
                ) : (
                  <div className="text-center py-2">
                    <div className="text-2xl mb-1">👤</div>
                    <div className="text-xs text-gray-500 mb-2.5">الرقم غير مربوط بأي لاعب مسجّل</div>
                    {!showLink ? (
                      <button onClick={() => setShowLink(true)} className="text-xs font-bold border border-gray-700 hover:border-amber-500 hover:text-amber-400 text-gray-300 rounded-lg px-3.5 py-1.5">
                        🔗 ربط يدوي بلاعب
                      </button>
                    ) : (
                      <div>
                        <input
                          value={linkQ}
                          onChange={e => setLinkQ(e.target.value)}
                          placeholder="ابحث بالاسم أو الرقم…"
                          autoFocus
                          className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:border-amber-500 outline-none"
                        />
                        <div className="mt-1.5 max-h-40 overflow-y-auto">
                          {linkResults.map(p => (
                            <button
                              key={p.id}
                              onClick={() => linkPlayer(p.id)}
                              className="w-full text-right text-xs bg-gray-950 hover:bg-gray-800 border border-gray-800 rounded-lg px-2.5 py-1.5 mb-1 flex items-center gap-2"
                            >
                              <span className="font-bold text-white">{p.name}</span>
                              <span className="text-gray-500" dir="ltr">{p.phone}</span>
                              <span className="mr-auto text-[9px] text-amber-400">{RANK_AR[p.rankTier] || ''}</span>
                            </button>
                          ))}
                          {linkQ.trim().length >= 2 && linkResults.length === 0 && (
                            <div className="text-[10.5px] text-gray-600 py-1">لا نتائج</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* آخر الحجوزات */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3.5">
                <div className="text-[10.5px] font-bold text-gray-500 mb-2">🎫 آخر الحجوزات</div>
                {!ctx ? null : ctx.bookings?.length ? ctx.bookings.map((b: any) => {
                  const st = b.isFree ? { l: 'مجاني', c: 'text-sky-400 bg-sky-500/10' } : b.isPaid ? { l: 'مدفوع', c: 'text-emerald-400 bg-emerald-500/10' } : { l: 'غير مدفوع', c: 'text-rose-400 bg-rose-500/10' };
                  return (
                    <div key={b.id} className="flex items-center gap-2 py-1.5 border-b border-dashed border-gray-800 last:border-0 text-xs">
                      <span className="flex-1 truncate text-gray-300">{b.name} × {b.count}</span>
                      <span className="text-[9.5px] text-gray-600">{fmtWhen(b.createdAt)}</span>
                      <span className={`text-[9px] font-bold rounded px-1.5 py-px ${st.c}`}>{st.l}</span>
                    </div>
                  );
                }) : (
                  <div className="text-center text-gray-600 text-[11px] py-1.5">لا حجوزات سابقة</div>
                )}
              </div>

              {/* الملاحظات الدائمة */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3.5">
                <div className="text-[10.5px] font-bold text-gray-500 mb-2 flex justify-between">
                  <span>📝 ملاحظات دائمة</span>
                  <span className="text-[9px] font-normal">ذاكرة البوت + الإدارة</span>
                </div>
                {ctx?.notes?.length ? ctx.notes.map((n: any) => (
                  <div key={n.id} className="bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 mb-1.5 text-xs text-gray-300">
                    {n.note}
                    <div className="text-[9px] text-gray-600 mt-0.5">{n.source === 'bot' ? '🤖 البوت' : '👤 الإدارة'} · {fmtWhen(n.createdAt)}</div>
                  </div>
                )) : <div className="text-center text-gray-600 text-[11px] py-1">لا ملاحظات بعد</div>}
                <div className="flex gap-1.5 mt-2">
                  <input
                    value={noteDraft}
                    onChange={e => setNoteDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addNote(); }}
                    placeholder="+ ملاحظة جديدة…"
                    className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:border-amber-500 outline-none"
                  />
                  <button onClick={addNote} disabled={!noteDraft.trim()} className="text-xs font-bold text-amber-400 border border-gray-800 rounded-lg px-2.5 disabled:opacity-30">حفظ</button>
                </div>
              </div>

              {/* إجراءات سريعة */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 flex flex-col gap-2">
                <div className="text-[10.5px] font-bold text-gray-500">⚡ إجراءات سريعة</div>
                <button onClick={openBooking} className="w-full bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold rounded-lg py-2 text-xs">
                  + حجز جديد
                </button>
                {ctx?.player && (
                  <a href={`/admin/players/${ctx.player.id}`} className="w-full text-center border border-gray-700 hover:border-amber-500 hover:text-amber-400 text-gray-300 font-bold rounded-lg py-2 text-xs">
                    👤 فتح ملف اللاعب
                  </a>
                )}
                <button
                  onClick={() => { navigator.clipboard?.writeText(intlPhone(conv.phone)); swalToast('نُسخ الرقم 📋', 'success'); }}
                  className="w-full border border-gray-700 hover:border-amber-500 hover:text-amber-400 text-gray-300 font-bold rounded-lg py-2 text-xs"
                >
                  📋 نسخ الرقم
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ تبويبات الموبايل ═══ */}
      <div className="md:hidden flex border-t border-gray-800 bg-gray-900 rounded-b-2xl -mt-px">
        {([['list', '💬 المحادثات'], ['chat', '📨 المحادثة'], ['info', '👤 العميل']] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setMobilePane(k)}
            className={`flex-1 py-2.5 text-xs font-bold ${mobilePane === k ? 'text-amber-400 shadow-[inset_0_2px_0_#f59e0b]' : 'text-gray-500'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ═══ نموذج الحجز ═══ */}
      {showBookingForm && bkData && conv && (
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowBookingForm(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-lg">
            <BookingForm
              activities={bkData.activities}
              locations={bkData.locations}
              staffList={bkData.staffList}
              onSubmit={submitBooking}
              onCancel={() => setShowBookingForm(false)}
              userRole={user?.role}
              username={user?.username}
              initialName={conv.displayName || ''}
              initialPhone={conv.phone || ''}
            />
          </div>
        </div>
      )}
    </div>
  );
}
