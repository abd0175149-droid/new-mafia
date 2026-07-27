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
  INFORMANT: 'مُخبر', SOLDIER: 'جندي', CAPO: 'كابو', UNDERBOSS: 'ساعد الزعيم', GODFATHER: 'العرّاب',
};
const ROLE_AR: Record<string, string> = {
  GODFATHER: 'شيخ المافيا', SILENCER: 'قص المافيا', CHAMELEON: 'الحرباية', WITCH: 'الساحرة',
  OLDER_BROTHER: 'الأخ الأكبر', MAFIA_REGULAR: 'مافيا', SHERIFF: 'الشريف', DOCTOR: 'الطبيب',
  SNIPER: 'القناص', POLICEWOMAN: 'الشرطية', NURSE: 'الممرضة', YOUNGER_BROTHER: 'الأخ الأصغر',
  CITIZEN: 'مواطن', JESTER: 'المهرج', ASSASSIN: 'السفّاح', MAYOR: 'العمدة',
};
const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'unread', label: 'غير مقروء' },
  { key: 'bot', label: '🤖 بوت' },
  { key: 'human', label: '👤 بشري' },
  { key: 'attn', label: '⚠️ تدخل' },
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
  if (m.source === 'broadcast') return <span className="text-teal-400 font-bold">📢 بث</span>;
  return null;
}

const STATUS_AR: Record<string, string> = { sent: 'أُرسلت', delivered: 'وصلت', read: 'قُرئت', failed: 'فشلت', received: 'استُلمت' };
const SOURCE_AR: Record<string, string> = { customer: 'العميل', bot: 'البوت 🤖', staff: 'موظف 👤', system: 'النظام ⚙️', template: 'قالب 📋', broadcast: 'بث جماعي 📢' };

// «معلومات الرسالة»: النوع والمصدر والحالة بسجلها الزمني والتفاعل
function messageInfoText(m: any): string {
  const lines: string[] = [];
  lines.push(`الاتجاه: ${m.direction === 'in' ? 'واردة من العميل' : 'صادرة'}`);
  lines.push(`المصدر: ${SOURCE_AR[m.source] || m.source}`);
  lines.push(`النوع: ${m.msgType}`);
  lines.push(`التوقيت: ${fmtWhen(m.createdAt)}`);
  if (m.direction === 'out') lines.push(`الحالة: ${STATUS_AR[m.status] || m.status || '—'}`);
  const hist = m.payload?.statusHistory;
  if (Array.isArray(hist) && hist.length) {
    lines.push('سجل الحالة:');
    for (const h of hist) lines.push(`  • ${STATUS_AR[h.status] || h.status} — ${fmtTime(h.at)}`);
  }
  if (m.payload?.customerReaction?.emoji) lines.push(`تفاعل العميل: ${m.payload.customerReaction.emoji} (${fmtTime(m.payload.customerReaction.at)})`);
  if (m.errorMessage) lines.push(`الخطأ: ${m.errorMessage}`);
  if (m.deletedAt) lines.push(`محذوفة من السجل: بواسطة ${m.deletedBy || 'أدمن'} — ${fmtWhen(m.deletedAt)}`);
  if (m.wamid) lines.push(`WAMID: ${m.wamid}`);
  return lines.join('\n');
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
  const [mainTab, setMainTab] = useState<'chat' | 'bot' | 'broadcast' | 'campaigns'>('chat');
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

    // رياكشن: تحديث الرسالة الهدف (الشارة) + معاينة القائمة
    const onReaction = (p: any) => {
      if (p?.message && selIdRef.current === p.conversationId) {
        setMessages(prev => prev.map(m => (m.id === p.message.id ? { ...m, payload: p.message.payload } : m)));
      }
      if (p?.conversationId) {
        setConvs(prev => prev.map(c => (c.id === p.conversationId
          ? { ...c, lastMessagePreview: p.emoji ? `تفاعل ${p.emoji} برسالتك` : 'أزال تفاعله عن رسالتك' }
          : c)));
      }
    };

    const onConvUpdate = (p: any) => {
      const c = p?.conversation || (p?.id ? p : null); // يدعم الشكلين: {conversation} أو مسطّحاً
      if (!c) return;
      setConvs(prev => prev.map(x => (x.id === c.id ? { ...x, ...c } : x)));
      if (selIdRef.current === c.id) setConv((prev: any) => ({ ...prev, ...c }));
    };

    const onDeleted = (d: any) => {
      if (!d?.id) return;
      setMessages(prev => prev.map(m => (m.id === d.id ? { ...m, deletedAt: d.deletedAt, deletedBy: d.deletedBy } : m)));
    };

    s.on('wa:message:new', onNew);
    s.on('wa:status:update', onStatus);
    s.on('wa:reaction', onReaction);
    s.on('wa:conversation:update', onConvUpdate);
    s.on('wa:message:deleted', onDeleted);
    return () => {
      s.off('wa:message:new', onNew);
      s.off('wa:status:update', onStatus);
      s.off('wa:reaction', onReaction);
      s.off('wa:conversation:update', onConvUpdate);
      s.off('wa:message:deleted', onDeleted);
    };
  }, [scrollBottom]);

  // ── حذف رسالة (ناعم — من سجلنا فقط) ──
  const deleteMessage = useCallback(async (m: any) => {
    const ok = await swalConfirm('حذف هذه الرسالة من سجل المحادثة؟', {
      title: 'حذف رسالة',
      danger: true,
      confirmText: 'حذف',
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/whatsapp/messages/${m.id}`, { method: 'DELETE' });
      setMessages(prev => prev.map(x => (x.id === m.id ? { ...x, deletedAt: new Date().toISOString(), deletedBy: getUser()?.displayName || 'أدمن' } : x)));
      swalToast('حُذفت من السجل (تبقى على هاتف العميل — واتساب لا يدعم السحب)', 'success');
    } catch (e: any) {
      swalAlert('تعذر الحذف: ' + e.message, 'error');
    }
  }, []);

  // ── مؤقّت دوري: عدّادات النافذة والإيقاف المؤقت + تحديث صامت للقائمة ──
  useEffect(() => {
    const t = setInterval(() => { forceTick(x => x + 1); }, 30_000);
    const r = setInterval(() => { loadConvs({ silent: true }); }, 60_000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [loadConvs]);

  // ── فتح مباشر من إشعار push: /admin/whatsapp?conv=ID ──
  useEffect(() => {
    try {
      const id = parseInt(new URLSearchParams(window.location.search).get('conv') || '');
      if (id) {
        setMainTab('chat');
        openConv(id);
        // تنظيف الرابط حتى لا يُعاد الفتح عند refresh
        window.history.replaceState({}, '', '/admin/whatsapp');
      }
    } catch { /* تجاهل */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // تجميع الرسائل بفواصل الأيام — صفوف الرياكشن لا تُعرض كفقاعات (تظهر شارةً على رسالتها)
  const grouped = useMemo(() => {
    const out: Array<{ type: 'day'; label: string } | { type: 'msg'; m: any }> = [];
    let lastDay = '';
    for (const m of messages) {
      if (m.msgType === 'reaction') continue;
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
          <button
            onClick={() => setMainTab('chat')}
            className={`px-3 py-1 rounded-lg font-bold ${mainTab === 'chat' ? 'bg-amber-500/10 text-amber-400' : 'text-gray-400 hover:text-white'}`}
          >المحادثات</button>
          <button
            onClick={() => setMainTab('bot')}
            className={`px-3 py-1 rounded-lg font-bold ${mainTab === 'bot' ? 'bg-amber-500/10 text-amber-400' : 'text-gray-400 hover:text-white'}`}
          >🤖 البوت</button>
          <button
            onClick={() => setMainTab('broadcast')}
            className={`px-3 py-1 rounded-lg font-bold ${mainTab === 'broadcast' ? 'bg-amber-500/10 text-amber-400' : 'text-gray-400 hover:text-white'}`}
          >📢 بث</button>
          <button
            onClick={() => setMainTab('campaigns')}
            className={`px-3 py-1 rounded-lg font-bold ${mainTab === 'campaigns' ? 'bg-amber-500/10 text-amber-400' : 'text-gray-400 hover:text-white'}`}
          >📣 الحملات</button>
        </div>
        <button
          onClick={toggleMute}
          className="mr-auto text-sm px-3 py-1.5 rounded-xl border border-gray-800 bg-gray-900 text-gray-300 hover:text-white"
          title={muted ? 'تشغيل صوت التنبيه' : 'كتم صوت التنبيه'}
        >
          {muted ? '🔕 مكتوم' : '🔔 الصوت'}
        </button>
      </div>

      {/* ═══ تبويب البوت ═══ */}
      {mainTab === 'bot' && <BotSettingsView />}

      {/* ═══ تبويب البث الجماعي ═══ */}
      {mainTab === 'broadcast' && <BroadcastView />}

      {/* ═══ تبويب الحملات (دفعة 1: استوديو القوالب) ═══ */}
      {mainTab === 'campaigns' && <CampaignsView />}

      {/* ═══ اللوحات الثلاث ═══ */}
      <div className={`${mainTab === 'chat' ? 'grid' : 'hidden'} flex-1 min-h-0 grid-cols-1 md:grid-cols-[300px_1fr_280px] gap-0 bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden`}>

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
                      {c.needsAttention && (
                        <span className="text-[9px] font-bold rounded-full px-1.5 py-px shrink-0 bg-rose-500/15 text-rose-400 animate-pulse">⚠️</span>
                      )}
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
                      className={`group relative max-w-[78%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed ${
                        g.m.direction === 'in'
                          ? 'self-start bg-gray-800/80 border border-gray-700/60 rounded-tr-md text-gray-100'
                          : 'self-end bg-emerald-950/70 border border-emerald-900 rounded-tl-md text-gray-100'
                      } ${g.m.payload?.customerReaction?.emoji ? 'mb-2.5' : ''}`}
                    >
                      {g.m.deletedAt ? (
                        <div className="italic text-gray-500 text-[12.5px]">🗑️ حُذفت من السجل بواسطة {g.m.deletedBy || 'أدمن'}</div>
                      ) : (
                        <div className="whitespace-pre-wrap break-words">{g.m.body || <span className="text-gray-500 italic">[{g.m.msgType}]</span>}</div>
                      )}
                      <div className="flex items-center gap-1.5 justify-end mt-0.5 text-[10px] text-gray-500">
                        {/* أدوات الرسالة: معلومات + حذف (تظهر عند المرور) */}
                        <span className="hidden group-hover:flex items-center gap-1 ml-auto">
                          <button
                            onClick={() => swalAlert(messageInfoText(g.m), 'info')}
                            className="text-gray-500 hover:text-sky-400 px-0.5"
                            title="معلومات الرسالة"
                          >ⓘ</button>
                          {!g.m.deletedAt && (
                            <button
                              onClick={() => deleteMessage(g.m)}
                              className="text-gray-500 hover:text-rose-400 px-0.5"
                              title="حذف من سجلنا (لا يمكن سحبها من هاتف العميل)"
                            >🗑</button>
                          )}
                        </span>
                        {g.m.direction === 'out' && <SourceTag m={g.m} />}
                        <span>{fmtTime(g.m.createdAt)}</span>
                        {g.m.direction === 'out' && <Ticks status={g.m.status} />}
                      </div>
                      {g.m.status === 'failed' && g.m.errorMessage && (
                        <div className="text-[10px] text-rose-400 mt-1">⚠️ {g.m.errorMessage}</div>
                      )}
                      {/* شارة تفاعل العميل (رياكشن) */}
                      {g.m.payload?.customerReaction?.emoji && !g.m.deletedAt && (
                        <span
                          className={`absolute -bottom-3 ${g.m.direction === 'in' ? 'left-2' : 'right-2'} bg-gray-900 border border-gray-700 rounded-full px-1.5 py-0 text-[13px] shadow`}
                          title={`تفاعل العميل ${fmtTime(g.m.payload.customerReaction.at)}`}
                        >{g.m.payload.customerReaction.emoji}</span>
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
                    {/* الهوية: صورة حقيقية + اسم + وسوم */}
                    <div className="flex items-center gap-2.5">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-amber-500 to-amber-700 text-gray-950 flex items-center justify-center font-bold shrink-0 border border-amber-500/40">
                        {ctx.player.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`${API_URL}${ctx.player.avatarUrl}`} alt="" className="w-full h-full object-cover" />
                        ) : (
                          ctx.player.name.charAt(0)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm text-white truncate flex items-center gap-1.5">
                          {ctx.player.name}
                          {ctx.player.isFree && <span className="text-[9px] font-bold bg-sky-500/10 text-sky-400 rounded px-1.5">🎁 مجاني</span>}
                        </div>
                        <div className="text-[10.5px] text-gray-500">
                          لاعب #{ctx.player.id}
                          {ctx.player.lastActiveAt && <> · آخر نشاط {fmtWhen(ctx.player.lastActiveAt)}</>}
                        </div>
                      </div>
                    </div>

                    {/* التقدم: الرتبة + شريط XP */}
                    <div className="mt-2.5 bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-amber-400">🎖️ {RANK_AR[ctx.player.rankTier] || ctx.player.rankTier}</span>
                        <span className="text-gray-400 tabular-nums">{ctx.player.rankRR} RR{ctx.player.rrRequired ? ` / ${ctx.player.rrRequired}` : ''}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-gray-500 mt-1.5">
                        <span>مستوى {ctx.player.level}</span>
                        <span className="tabular-nums">{ctx.player.xp}{ctx.player.nextLevelXP ? ` / ${ctx.player.nextLevelXP} XP` : ' XP'}</span>
                      </div>
                      {typeof ctx.player.xpProgress === 'number' && (
                        <div className="h-1 bg-gray-800 rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, ctx.player.xpProgress)}%` }} />
                        </div>
                      )}
                    </div>

                    {/* أداء الموسم الحالي — مطابق لصفحة التصنيف بواجهة اللاعب */}
                    <div className="text-[9px] text-gray-600 mt-2 mb-1 flex justify-between">
                      <span>الموسم الحالي</span>
                      <span>مدى الحياة: <b className="text-gray-400 tabular-nums">{ctx.player.lifetimeMatches ?? 0}</b> مباراة</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      {[
                        { v: ctx.player.totalMatches ?? 0, l: 'مباراة' },
                        { v: ctx.player.totalWins ?? 0, l: 'فوز' },
                        { v: (ctx.player.winRate ?? 0) + '%', l: 'نسبة الفوز' },
                      ].map((s, i) => (
                        <div key={i} className="bg-gray-950 border border-gray-800 rounded-lg py-1.5">
                          <div className="font-bold text-sm text-white tabular-nums">{s.v}</div>
                          <div className="text-[9px] text-gray-600">{s.l}</div>
                        </div>
                      ))}
                    </div>
                    {ctx.player.favoriteRole && (
                      <div className="mt-2 text-center text-[10.5px] text-gray-400 bg-gray-950 border border-gray-800 rounded-lg py-1.5">
                        🎭 الأكثر لعباً (كل المواسم): <b className="text-violet-400">{ROLE_AR[ctx.player.favoriteRole] || ctx.player.favoriteRole}</b>
                      </div>
                    )}
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
      <div className={`md:hidden ${mainTab === 'chat' ? 'flex' : 'hidden'} border-t border-gray-800 bg-gray-900 rounded-b-2xl -mt-px`}>
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
      {mainTab === 'chat' && showBookingForm && bkData && conv && (
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

// ══════════════════════════════════════════════════════
// 🤖 تبويب البوت — الإعدادات + ساحة الاختبار + النبض
// ══════════════════════════════════════════════════════

const MODEL_FALLBACK = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

const TOOL_LABELS: Record<string, string> = {
  activities: 'عرض الفعاليات (قائمة تفاعلية)',
  reservation: 'إنشاء حجز مؤكد (بأزرار تأكيد)',
  myBookings: '«شو حجوزاتي؟»',
  notes: 'الملاحظات الدائمة (الذاكرة)',
  handoff: 'التحويل للإدارة',
  playerStats: '«شو رتبتي؟» (إحصائيات اللاعب)',
  passwordReset: '🔐 إعادة تعيين كلمة السر (لرقم المحادثة فقط)',
  leaderboard: '🏆 ترتيب أفضل 10 لاعبين',
  locations: '📍 الأماكن وروابط الخرائط',
  social: '🔗 صفحات التواصل (إنستجرام/الموقع)',
  accountLink: '🔐 ربط الحساب برمز تحقق (للأرقام الجديدة)',
  cancellation: '❌ إلغاء الحجوزات (قاعدة 3 ساعات)',
  liveGame: '🎮 اللعبة الحية (حالة/وقت/مُقصَون/دوري)',
  matchHistory: '📜 سجل المباريات (ملخص + تفصيل نقاط)',
};

function Card({ title, children, wide }: { title: string; children: any; wide?: boolean }) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-4 ${wide ? 'md:col-span-2' : ''}`}>
      <div className="text-[11px] font-bold text-gray-500 mb-3">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: any }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-dashed border-gray-800 last:border-0">
      <span className="text-sm text-gray-300">{label}</span>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, min, max }: { value: number; onChange: (n: number) => void; min: number; max: number }) {
  return (
    <input
      type="number" value={value} min={min} max={max}
      onChange={e => onChange(parseInt(e.target.value) || min)}
      className="w-20 bg-gray-950 border border-gray-800 rounded-lg px-2 py-1 text-sm text-white text-center focus:border-amber-500 outline-none"
    />
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-10 h-[22px] rounded-full relative transition-colors shrink-0 ${on ? 'bg-emerald-500' : 'bg-gray-700'}`}>
      <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all ${on ? 'right-1' : 'right-5'}`} />
    </button>
  );
}

function BotSettingsView() {
  const [s, setS] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>(MODEL_FALLBACK);
  const [testingKey, setTestingKey] = useState(false);
  const [stats, setStats] = useState<any | null>(null);
  const [pg, setPg] = useState<Array<{ role: 'user' | 'model'; text: string; trace?: any[]; interactives?: any[] }>>([]);
  const [pgInput, setPgInput] = useState('');
  const [pgLoading, setPgLoading] = useState(false);
  const [locs, setLocs] = useState<any[]>([]);
  const pgRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [a, b, c] = await Promise.all([
        apiFetch('/api/whatsapp/bot/settings'),
        apiFetch('/api/whatsapp/bot/stats').catch(() => null),
        apiFetch('/api/whatsapp/bot/locations').catch(() => null),
      ]);
      setS(a.settings);
      if (b?.stats) setStats(b.stats);
      if (c?.locations) setLocs(c.locations);
      if (a.settings?.model && !MODEL_FALLBACK.includes(a.settings.model)) {
        setModels(prev => (prev.includes(a.settings.model) ? prev : [a.settings.model, ...prev]));
      }
    } catch (e: any) {
      swalAlert('تعذر جلب إعدادات البوت: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = (k: string, v: any) => setS((prev: any) => ({ ...prev, [k]: v }));
  const patchTool = (k: string, v: boolean) => setS((prev: any) => ({ ...prev, toolsConfig: { ...(prev.toolsConfig || {}), [k]: v } }));

  const save = async (extra: Record<string, any> = {}) => {
    if (!s) return;
    setSaving(true);
    try {
      const body: any = {
        enabled: s.enabled, model: s.model, systemPrompt: s.systemPrompt, knowledgeBase: s.knowledgeBase,
        contextMessages: s.contextMessages, pauseMinutes: s.pauseMinutes, maxToolLoops: s.maxToolLoops,
        failMessage: s.failMessage, failHandoff: s.failHandoff, toolsConfig: s.toolsConfig,
        ...extra,
      };
      if (s.priceInputPer1M !== undefined) body.priceInputPer1M = s.priceInputPer1M;
      if (s.priceOutputPer1M !== undefined) body.priceOutputPer1M = s.priceOutputPer1M;
      if (keyInput.trim()) body.geminiApiKey = keyInput.trim();
      const res = await apiFetch('/api/whatsapp/bot/settings', { method: 'PUT', body: JSON.stringify(body) });
      setS(res.settings);
      setKeyInput('');
      swalToast('حُفظت الإعدادات — تسري على الرسالة التالية فوراً ✅', 'success');
    } catch (e: any) {
      swalAlert('فشل الحفظ: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async () => {
    if (!s) return;
    const enabling = !s.enabled;
    if (enabling && !s.hasKey && !keyInput.trim()) {
      swalAlert('أدخل مفتاح Gemini واحفظه قبل تفعيل البوت', 'warning');
      return;
    }
    const ok = await swalConfirm(
      enabling
        ? 'سيبدأ البوت بالرد تلقائياً على كل رسائل العملاء الواردة (في المحادثات غير الموقوفة).'
        : 'سيتوقف البوت عن الرد في كل المحادثات فوراً.',
      { title: enabling ? 'تفعيل البوت للجميع؟' : 'إيقاف البوت العام؟', danger: !enabling, confirmText: enabling ? 'تفعيل' : 'إيقاف' },
    );
    if (!ok) return;
    patch('enabled', enabling);
    await save({ enabled: enabling });
  };

  const testKey = async () => {
    setTestingKey(true);
    try {
      const res = await apiFetch('/api/whatsapp/bot/test-key', {
        method: 'POST',
        body: JSON.stringify({ apiKey: keyInput.trim() || undefined }),
      });
      if (res.models?.length) {
        setModels(res.models);
        if (s && !res.models.includes(s.model)) patch('model', res.models[0]);
      }
      swalToast(`المفتاح صالح ✅ — ${res.models?.length || 0} نموذج متاح`, 'success');
    } catch (e: any) {
      swalAlert('فشل اختبار المفتاح: ' + e.message, 'error');
    } finally {
      setTestingKey(false);
    }
  };

  const pgSend = async () => {
    const text = pgInput.trim();
    if (!text || pgLoading) return;
    const next = [...pg, { role: 'user' as const, text }];
    setPg(next);
    setPgInput('');
    setPgLoading(true);
    try {
      const res = await apiFetch('/api/whatsapp/bot/playground', {
        method: 'POST',
        body: JSON.stringify({ history: next.map(m => ({ role: m.role, text: m.text })) }),
      });
      setPg(prev => [...prev, { role: 'model', text: res.text || '(بلا نص — أرسل رسالة تفاعلية)', trace: res.toolTrace, interactives: res.interactives }]);
    } catch (e: any) {
      setPg(prev => [...prev, { role: 'model', text: '⚠️ خطأ: ' + e.message }]);
    } finally {
      setPgLoading(false);
      requestAnimationFrame(() => { if (pgRef.current) pgRef.current.scrollTop = pgRef.current.scrollHeight; });
    }
  };

  if (loading || !s) {
    return <div className="flex-1 flex items-center justify-center text-gray-500">جارٍ تحميل إعدادات البوت…</div>;
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {/* شريط الحالة والحفظ */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border border-gray-800 rounded-2xl px-4 py-3 mb-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <Toggle on={!!s.enabled} onClick={toggleEnabled} />
          <div>
            <div className={`text-sm font-bold ${s.enabled ? 'text-emerald-400' : 'text-gray-400'}`}>
              {s.enabled ? '● البوت يعمل — يرد على العملاء' : '○ البوت مطفأ'}
            </div>
            <div className="text-[10.5px] text-gray-600">التفعيل يشمل كل المحادثات (عدا الموقوفة يدوياً)</div>
          </div>
        </div>
        {stats && (
          <div className="flex items-center gap-2 text-[11px] text-gray-400 mr-auto flex-wrap">
            <span className="bg-gray-900 border border-gray-800 rounded-full px-2.5 py-1">ردود اليوم: <b className="text-white">{stats.replies24h}</b></span>
            <span className="bg-gray-900 border border-gray-800 rounded-full px-2.5 py-1">الأسبوع: <b className="text-white">{stats.replies7d}</b></span>
            <span className="bg-gray-900 border border-gray-800 rounded-full px-2.5 py-1">حجوزات البوت: <b className="text-emerald-400">{stats.reservations7d}</b></span>
            <span className="bg-gray-900 border border-gray-800 rounded-full px-2.5 py-1">بحاجة تدخل: <b className="text-rose-400">{stats.attentionNow}</b></span>
          </div>
        )}
        <button
          onClick={() => save()}
          disabled={saving}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-bold rounded-xl px-6 py-2 text-sm"
        >{saving ? 'جارٍ الحفظ…' : '💾 حفظ الإعدادات'}</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-6">
        {/* 📊 الاستهلاك والتكلفة الحقيقية */}
        <UsageCard s={s} patch={patch} />
        {/* المفتاح والنموذج */}
        <Card title="🔑 الاتصال بالنموذج">
          <Row label="Gemini API Key">
            <div className="flex items-center gap-1.5 flex-1 max-w-[240px]">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder={s.hasKey ? s.geminiApiKey : 'AIza…'}
                className="flex-1 min-w-0 bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:border-amber-500 outline-none"
                dir="ltr"
              />
              <button onClick={() => setShowKey(v => !v)} className="text-gray-500 hover:text-white text-sm">{showKey ? '🙈' : '👁'}</button>
            </div>
          </Row>
          <Row label="النموذج">
            <select
              value={s.model}
              onChange={e => patch('model', e.target.value)}
              className="bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-500 outline-none max-w-[240px]"
              dir="ltr"
            >
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Row>
          <div className="flex gap-2 mt-3">
            <button onClick={testKey} disabled={testingKey} className="flex-1 border border-gray-700 hover:border-amber-500 hover:text-amber-400 text-gray-300 font-bold rounded-lg py-2 text-xs disabled:opacity-50">
              {testingKey ? 'جارٍ الاختبار…' : '🔍 اختبار المفتاح وجلب النماذج'}
            </button>
          </div>
          <div className="text-[10px] text-gray-600 mt-2">المفتاح من aistudio.google.com/apikey — يُخزن بالسيرفر ولا يظهر كاملاً بعد الحفظ</div>
        </Card>

        {/* سلوك التشغيل */}
        <Card title="⚙️ سلوك التشغيل">
          <Row label="عدد رسائل السياق (ذاكرة المحادثة)"><NumInput value={s.contextMessages} onChange={n => patch('contextMessages', n)} min={4} max={60} /></Row>
          <Row label="إيقاف البوت بعد رد بشري (دقائق)"><NumInput value={s.pauseMinutes} onChange={n => patch('pauseMinutes', n)} min={1} max={1440} /></Row>
          <Row label="أقصى دورات أدوات بالرد الواحد"><NumInput value={s.maxToolLoops} onChange={n => patch('maxToolLoops', n)} min={1} max={8} /></Row>
          <Row label="تحويل للإدارة تلقائياً عند خلل تقني"><Toggle on={!!s.failHandoff} onClick={() => patch('failHandoff', !s.failHandoff)} /></Row>
        </Card>

        {/* الأدوات */}
        <Card title="🧰 الأدوات المتاحة للبوت">
          {Object.keys(TOOL_LABELS).map(k => (
            <Row key={k} label={TOOL_LABELS[k]}>
              <Toggle on={(s.toolsConfig || {})[k] !== false} onClick={() => patchTool(k, (s.toolsConfig || {})[k] === false)} />
            </Row>
          ))}
        </Card>

        {/* الأماكن الفعالة */}
        <Card title="📍 الأماكن — البوت يجيب عن الفعالة فقط (بروابط خرائطها)">
          {locs.length === 0 ? (
            <div className="text-center text-gray-600 text-xs py-2">لا أماكن</div>
          ) : locs.map(l => (
            <Row key={l.id} label={`${l.name}${l.mapUrl ? '' : ' — ⚠️ بلا رابط خريطة'}`}>
              <Toggle
                on={!!l.isActive}
                onClick={async () => {
                  try {
                    const res = await apiFetch(`/api/whatsapp/bot/locations/${l.id}/toggle`, {
                      method: 'POST', body: JSON.stringify({ isActive: !l.isActive }),
                    });
                    setLocs(prev => prev.map(x => (x.id === l.id ? { ...x, isActive: res.location.isActive } : x)));
                  } catch (e: any) { swalAlert(e.message, 'error'); }
                }}
              />
            </Row>
          ))}
          <div className="text-[10px] text-gray-600 mt-2">رابط الخريطة يُدار من صفحة المواقع — التفعيل هنا يسري على إجابات البوت فوراً</div>
        </Card>

        {/* رسالة الفشل */}
        <Card title="🛡️ رسالة الخلل التقني (تُرسل للعميل عند فشل البوت)">
          <textarea
            value={s.failMessage}
            onChange={e => patch('failMessage', e.target.value)}
            rows={5}
            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 outline-none resize-y leading-relaxed"
          />
        </Card>

        {/* الشخصية */}
        <Card title="🎭 شخصية البوت (System Prompt)" wide>
          <textarea
            value={s.systemPrompt}
            onChange={e => patch('systemPrompt', e.target.value)}
            rows={10}
            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-[13px] text-white focus:border-amber-500 outline-none resize-y leading-relaxed"
          />
          <div className="text-[10px] text-gray-600 mt-1">{(s.systemPrompt || '').length} حرف</div>
        </Card>

        {/* قاعدة المعرفة */}
        <Card title="📚 قاعدة المعرفة (Markdown — كل ما يعرفه البوت عن النادي)" wide>
          <textarea
            value={s.knowledgeBase}
            onChange={e => patch('knowledgeBase', e.target.value)}
            rows={18}
            dir="rtl"
            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-[13px] text-white focus:border-amber-500 outline-none resize-y leading-relaxed"
          />
          <div className="text-[10px] text-gray-600 mt-1">{(s.knowledgeBase || '').length} حرف — التعديل يسري على الرسالة التالية فوراً بعد الحفظ</div>
        </Card>

        {/* ساحة الاختبار */}
        <Card title="🧪 ساحة الاختبار — جرّب البوت هنا (لا يرسل شيئاً لواتساب ولا يسجل حجوزات حقيقية)" wide>
          <div ref={pgRef} className="h-72 overflow-y-auto bg-gray-950 border border-gray-800 rounded-xl p-3 flex flex-col gap-2 mb-2">
            {pg.length === 0 && (
              <div className="m-auto text-center text-gray-600 text-xs">
                <div className="text-2xl mb-1">🧪</div>
                يستخدم الإعدادات <b>المحفوظة</b> — احفظ أولاً ثم جرّب<br />مثلاً: «شو الفعاليات القادمة؟» أو «بدي أحجز»
              </div>
            )}
            {pg.map((m, i) => (
              <div key={i} className={`max-w-[80%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                m.role === 'user' ? 'self-end bg-gray-800 text-gray-100' : 'self-start bg-emerald-950/70 border border-emerald-900 text-gray-100'
              }`}>
                <div className="whitespace-pre-wrap">{m.text}</div>
                {m.trace && m.trace.length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-gray-800 text-[10px] text-sky-400">
                    {m.trace.map((t: any, j: number) => <div key={j}>🔧 {t.name}({JSON.stringify(t.args)}) {t.result?.dryRun ? '· تجريبي' : '✓'}</div>)}
                  </div>
                )}
                {m.interactives && m.interactives.length > 0 && (
                  <div className="mt-1 text-[10px] text-violet-400">📋 {m.interactives.map((x: any) => x.kind === 'list' ? `قائمة (${x.preview?.length} خيار)` : 'أزرار تأكيد').join(' + ')} — ستُرسل للعميل فعلياً بالوضع الحي</div>
                )}
              </div>
            ))}
            {pgLoading && <div className="self-start text-gray-500 text-xs animate-pulse">🤖 يفكر…</div>}
          </div>
          <div className="flex gap-2">
            <input
              value={pgInput}
              onChange={e => setPgInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') pgSend(); }}
              placeholder="اكتب رسالة كأنك عميل…"
              className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-amber-500 outline-none"
              disabled={pgLoading}
            />
            <button onClick={pgSend} disabled={pgLoading || !pgInput.trim()} className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-gray-950 font-bold rounded-xl px-5 text-sm">إرسال</button>
            <button onClick={() => setPg([])} className="border border-gray-700 text-gray-400 hover:text-white rounded-xl px-3 text-xs" title="محادثة جديدة">🗑</button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 📢 البث الجماعي — النوافذ المفتوحة (القرارات المعتمدة 2026-07-26)
// المستلمون: كل النوافذ + فلاتر (مربوط/غير مربوط/استبعاد ⚠️) + استبعاد يدوي
// المتغيرات: {الاسم} {اسم_اللاعب} {الرتبة} {الفعالية} · البث لا يوقف البوت
// ══════════════════════════════════════════════════════

const BC_VARS = ['{الاسم}', '{اسم_اللاعب}', '{الرتبة}', '{آخر_دور}', '{الفعالية}'] as const;

function renderBcPreview(body: string, r: any, activityName: string | null): string {
  const name = (r?.displayName || r?.playerName || '').trim().split(/\s+/)[0] || 'يا غالي';
  return body
    .replaceAll('{الاسم}', name)
    .replaceAll('{اسم_اللاعب}', r?.playerName || name)
    .replaceAll('{الرتبة}', r?.rankAr || 'عضو العائلة')
    .replaceAll('{آخر_دور}', r?.lastRoleAr || 'لاعب')
    .replaceAll('{الفعالية}', activityName || 'فعاليتنا القادمة');
}

function BroadcastView() {
  const [recipients, setRecipients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [linkedFilter, setLinkedFilter] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [excludeAttn, setExcludeAttn] = useState(false);
  const [search, setSearch] = useState('');
  const [activityName, setActivityName] = useState<string | null>(null);
  // 🎮 فلترة باللعب (الدفعتان — قرار المالك)
  const [gameOn, setGameOn] = useState(false);
  const [recentActs, setRecentActs] = useState<any[]>([]);
  const [gActivity, setGActivity] = useState('');       // '' = نطاق زمني بدلاً من فعالية
  const [gHours, setGHours] = useState(24);
  const [gTeam, setGTeam] = useState('');
  const [gRole, setGRole] = useState('');
  const [gResult, setGResult] = useState('');
  const [gFirst, setGFirst] = useState(false);
  const [gNoShow, setGNoShow] = useState(false);
  const [gEarly, setGEarly] = useState(false);
  const [gTop, setGTop] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [tplId, setTplId] = useState<number | null>(null);
  const [body, setBody] = useState('');
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [showSaveTpl, setShowSaveTpl] = useState(false);
  const [tplName, setTplName] = useState('');
  const [run, setRun] = useState<{ id: number; total: number; sent: number; skipped: number; failed: number; done: number; finished?: boolean; status?: string } | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const loadRecipients = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams({ linked: linkedFilter, excludeAttention: excludeAttn ? '1' : '0' });
      if (gameOn) {
        if (gActivity) p.set('gActivity', gActivity);
        else p.set('gHours', String(gHours || 24));
        if (gNoShow) p.set('gNoShow', '1');
        else {
          if (gTeam) p.set('gTeam', gTeam);
          if (gRole) p.set('gRole', gRole);
          if (gResult) p.set('gResult', gResult);
          if (gFirst) p.set('gFirst', '1');
          if (gEarly) p.set('gEarly', '1');
          if (gTop) p.set('gTop', '1');
        }
      }
      const data = await apiFetch(`/api/whatsapp/broadcast/recipients?${p}`);
      const list = data.recipients || [];
      setRecipients(list);
      setActivityName(data.activityName || null);
      setRecentActs(data.recentActivities || []);
      setSelected(new Set(list.map((r: any) => r.id)));
      setPreviewId(list[0]?.id ?? null);
    } catch (e: any) {
      swalAlert('تعذر جلب المستلمين: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [linkedFilter, excludeAttn, gameOn, gActivity, gHours, gTeam, gRole, gResult, gFirst, gNoShow, gEarly, gTop]);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await apiFetch('/api/whatsapp/templates');
      setTemplates(data.templates || []);
    } catch { /* تكميلي */ }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const data = await apiFetch('/api/whatsapp/broadcast/history');
      setHistory(data.broadcasts || []);
    } catch { /* تكميلي */ }
  }, []);

  useEffect(() => { loadRecipients(); }, [loadRecipients]);
  useEffect(() => { loadTemplates(); loadHistory(); }, [loadTemplates, loadHistory]);

  // تقدم البث لحظياً
  useEffect(() => {
    const s = getSocket();
    const onProgress = (p: any) => {
      setRun(prev => (prev && prev.id === p.broadcastId
        ? { ...prev, sent: p.sent, skipped: p.skipped, failed: p.failed, done: p.done, finished: p.finished, status: p.status }
        : prev));
      if (p.finished) loadHistory();
    };
    s.on('wa:broadcast:progress', onProgress);
    return () => { s.off('wa:broadcast:progress', onProgress); };
  }, [loadHistory]);

  const visible = useMemo(() => {
    const q = search.trim();
    if (!q) return recipients;
    return recipients.filter((r: any) =>
      (r.displayName || '').includes(q) || (r.playerName || '').includes(q) || (r.phone || '').includes(q));
  }, [recipients, search]);

  const toggleOne = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const insertVar = (v: string) => {
    const el = bodyRef.current;
    if (el && typeof el.selectionStart === 'number') {
      const s = el.selectionStart, e = el.selectionEnd;
      setBody(prev => prev.slice(0, s) + v + prev.slice(e));
      requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + v.length; });
    } else {
      setBody(prev => prev + v);
    }
  };

  const pickTemplate = (id: string) => {
    const t = templates.find((x: any) => String(x.id) === id);
    setTplId(t ? t.id : null);
    if (t) setBody(t.body);
  };

  const saveTemplate = async () => {
    if (!tplName.trim() || !body.trim()) return;
    try {
      await apiFetch('/api/whatsapp/templates', { method: 'POST', body: JSON.stringify({ name: tplName.trim(), body: body.trim() }) });
      swalToast('حُفظ القالب ✅', 'success');
      setShowSaveTpl(false); setTplName('');
      loadTemplates();
    } catch (e: any) {
      swalAlert('تعذر حفظ القالب: ' + e.message, 'error');
    }
  };

  const deleteTemplate = async (t: any) => {
    if (!t) return;
    const ok = await swalConfirm(`حذف قالب «${t.name}»؟`, { title: 'حذف قالب', danger: true, confirmText: 'حذف' });
    if (!ok) return;
    try {
      await apiFetch(`/api/whatsapp/templates/${t.id}`, { method: 'DELETE' });
      if (tplId === t.id) setTplId(null);
      loadTemplates();
    } catch (e: any) {
      swalAlert('تعذر الحذف: ' + e.message, 'error');
    }
  };

  const launch = async () => {
    const ids = Array.from(selected);
    if (!ids.length || !body.trim()) return;
    const prev = renderBcPreview(body, recipients.find((r: any) => r.id === (previewId ?? ids[0])) || recipients[0], activityName);
    const ok = await swalConfirm(
      `إرسال لـ${ids.length} مستلم؟ (رسالة كل ~ثانية — البوت سيرد على ردودهم طبيعياً)\n\nمعاينة:\n${prev.slice(0, 300)}`,
      { title: '📢 تأكيد البث', confirmText: `إرسال (${ids.length})` },
    );
    if (!ok) return;
    try {
      const recipientMeta: Record<number, { lastRoleAr?: string }> = {};
      for (const r of recipients) if (ids.includes(r.id) && r.lastRoleAr) recipientMeta[r.id] = { lastRoleAr: r.lastRoleAr };
      const res = await apiFetch('/api/whatsapp/broadcast', {
        method: 'POST',
        body: JSON.stringify({ body: body.trim(), templateId: tplId, conversationIds: ids, recipientMeta }),
      });
      setRun({ id: res.broadcastId, total: res.totalTargets, sent: 0, skipped: 0, failed: 0, done: 0 });
    } catch (e: any) {
      swalAlert('تعذر إطلاق البث: ' + e.message, 'error');
    }
  };

  const stopRun = async () => {
    if (!run) return;
    try { await apiFetch(`/api/whatsapp/broadcast/${run.id}/stop`, { method: 'POST' }); } catch { /* تجاهل */ }
  };

  const previewRecipient = recipients.find((r: any) => r.id === previewId) || recipients[0] || null;
  const fmtLeft = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} س ${min % 60} د` : `${min} د`);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 pb-6">
      {/* ── المستلمون ── */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 flex flex-col min-h-0 max-h-[80vh]">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-white">المستلمون — نوافذ مفتوحة</h2>
          <span className="text-xs font-bold bg-emerald-500/10 text-emerald-400 rounded-full px-2.5 py-1">{selected.size} / {recipients.length}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mb-2 text-[11.5px]">
          {([['all', 'الكل'], ['linked', '🎖️ مربوط بلاعب'], ['unlinked', 'غير مربوط']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setLinkedFilter(k)}
              className={`rounded-full px-2.5 py-1 font-bold border ${linkedFilter === k ? 'bg-amber-500/10 text-amber-400 border-amber-500/40' : 'text-gray-400 border-gray-800 hover:text-white'}`}>{l}</button>
          ))}
          <label className="flex items-center gap-1 text-gray-400 font-bold cursor-pointer mr-auto">
            <input type="checkbox" checked={excludeAttn} onChange={e => setExcludeAttn(e.target.checked)} className="accent-amber-500" />
            استبعاد ⚠️
          </label>
        </div>

        {/* 🎮 فلترة باللعب */}
        <div className="border border-gray-800 rounded-xl p-2.5 mb-2">
          <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-300 cursor-pointer">
            <input type="checkbox" checked={gameOn} onChange={e => setGameOn(e.target.checked)} className="accent-amber-500" />
            🎮 فلترة باللعب
          </label>
          {gameOn && (
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="flex gap-1.5 items-center flex-wrap">
                <select value={gActivity} onChange={e => setGActivity(e.target.value)}
                  className="flex-1 min-w-[150px] bg-gray-950 border border-gray-800 rounded-lg px-2 py-1.5 text-[11.5px] text-white outline-none focus:border-amber-500">
                  <option value="">⏱️ حسب الزمن (بلا فعالية)</option>
                  {recentActs.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {!gActivity && (
                  <span className="flex items-center gap-1 text-[11px] text-gray-400">
                    آخر <input type="number" min={1} max={720} value={gHours} onChange={e => setGHours(parseInt(e.target.value) || 24)}
                      className="w-14 bg-gray-950 border border-gray-800 rounded px-1.5 py-1 text-[11px] text-white outline-none text-center" /> ساعة
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-wrap text-[10.5px]">
                {([['', 'الكل'], ['MAFIA', '🕵️ مافيا'], ['CITIZEN', '🛡️ مواطنين'], ['NEUTRAL', '🃏 محايد']] as const).map(([k, l]) => (
                  <button key={k} disabled={gNoShow} onClick={() => setGTeam(k)}
                    className={`rounded-full px-2 py-0.5 font-bold border disabled:opacity-30 ${gTeam === k ? 'bg-amber-500/10 text-amber-400 border-amber-500/40' : 'text-gray-400 border-gray-800'}`}>{l}</button>
                ))}
                <select value={gRole} disabled={gNoShow} onChange={e => setGRole(e.target.value)}
                  className="bg-gray-950 border border-gray-800 rounded px-1.5 py-0.5 text-[10.5px] text-gray-300 outline-none disabled:opacity-30">
                  <option value="">دور محدد…</option>
                  {Object.entries(ROLE_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1 flex-wrap text-[10.5px]">
                {([['', '—'], ['won', '🏆 فازوا'], ['lost', '💔 خسروا']] as const).map(([k, l]) => (
                  <button key={k} disabled={gNoShow} onClick={() => setGResult(k)}
                    className={`rounded-full px-2 py-0.5 font-bold border disabled:opacity-30 ${gResult === k ? 'bg-amber-500/10 text-amber-400 border-amber-500/40' : 'text-gray-400 border-gray-800'}`}>{l}</button>
                ))}
                <button disabled={gNoShow} onClick={() => setGFirst(v => !v)}
                  className={`rounded-full px-2 py-0.5 font-bold border disabled:opacity-30 ${gFirst ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40' : 'text-gray-400 border-gray-800'}`}>🆕 أول مرة</button>
                <button disabled={gNoShow} onClick={() => setGEarly(v => !v)}
                  className={`rounded-full px-2 py-0.5 font-bold border disabled:opacity-30 ${gEarly ? 'bg-rose-500/10 text-rose-400 border-rose-500/40' : 'text-gray-400 border-gray-800'}`}>💀 أُقصوا جولة 1</button>
                <button disabled={gNoShow} onClick={() => setGTop(v => !v)}
                  className={`rounded-full px-2 py-0.5 font-bold border disabled:opacity-30 ${gTop ? 'bg-sky-500/10 text-sky-400 border-sky-500/40' : 'text-gray-400 border-gray-800'}`}>⭐ توب 3</button>
                <button disabled={!gActivity} onClick={() => setGNoShow(v => !v)}
                  title={!gActivity ? 'يتطلب اختيار فعالية' : ''}
                  className={`rounded-full px-2 py-0.5 font-bold border disabled:opacity-30 ${gNoShow ? 'bg-violet-500/10 text-violet-400 border-violet-500/40' : 'text-gray-400 border-gray-800'}`}>👻 حجزوا وما حضروا</button>
              </div>
              <div className="text-[9.5px] text-gray-600">الدور/النتيجة تُقيَّم على آخر مباراة له بالنطاق · «ما حضروا» يستبعد بقية شروط اللعب · متغير {'{آخر_دور}'} متاح بالرسالة</div>
            </div>
          )}
        </div>

        <div className="flex gap-1.5 mb-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو الرقم…"
            className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:border-amber-500 outline-none" />
          <button onClick={() => setSelected(new Set(visible.map((r: any) => r.id)))} className="text-[11px] font-bold text-gray-400 hover:text-white border border-gray-800 rounded-lg px-2">الكل</button>
          <button onClick={() => setSelected(new Set())} className="text-[11px] font-bold text-gray-400 hover:text-white border border-gray-800 rounded-lg px-2">لا أحد</button>
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col gap-1 min-h-0">
          {loading ? (
            <div className="text-gray-600 text-sm text-center py-6">جارٍ التحميل…</div>
          ) : visible.length === 0 ? (
            <div className="text-gray-600 text-sm text-center py-6">لا نوافذ مفتوحة الآن — النافذة تفتح لما يراسلك العميل (24 ساعة)</div>
          ) : visible.map((r: any) => (
            <label key={r.id} className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 cursor-pointer ${selected.has(r.id) ? 'border-gray-700 bg-gray-800/50' : 'border-gray-800 opacity-55'}`}>
              <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} className="accent-emerald-500" />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-bold text-white truncate flex items-center gap-1.5">
                  {r.displayName}
                  {r.rankAr && <span className="text-[9.5px] text-amber-400 border border-amber-500/40 rounded px-1">{r.rankAr}</span>}
                  {r.lastRoleAr && <span className="text-[9.5px] text-sky-400 border border-sky-500/40 rounded px-1">🎭 {r.lastRoleAr}</span>}
                  {r.needsAttention && <span className="text-[9.5px]">⚠️</span>}
                </div>
                <div className="text-[10.5px] text-gray-500" dir="ltr">{r.phone}</div>
              </div>
              <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${r.minutesLeft < 120 ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>⏳ {fmtLeft(r.minutesLeft)}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ── الرسالة + الإرسال + السجل ── */}
      <div className="flex flex-col gap-4 min-h-0">
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <h2 className="font-bold text-white">✍️ الرسالة</h2>
            <select value={tplId ?? ''} onChange={e => pickTemplate(e.target.value)}
              className="bg-gray-950 border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-amber-500">
              <option value="">— بلا قالب —</option>
              {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {tplId && (
              <button onClick={() => deleteTemplate(templates.find((t: any) => t.id === tplId))} className="text-[11px] text-gray-500 hover:text-rose-400" title="حذف القالب المحدد">🗑 حذف القالب</button>
            )}
            <button onClick={() => setShowSaveTpl(v => !v)} className="mr-auto text-[11.5px] font-bold text-gray-300 hover:text-amber-400 border border-gray-800 rounded-lg px-2.5 py-1">💾 حفظ كقالب</button>
          </div>
          {showSaveTpl && (
            <div className="flex gap-1.5 mb-2">
              <input value={tplName} onChange={e => setTplName(e.target.value)} placeholder="اسم القالب (مثلاً: شكر بعد السهرة)"
                className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:border-amber-500 outline-none" />
              <button onClick={saveTemplate} disabled={!tplName.trim() || !body.trim()} className="bg-amber-500 disabled:opacity-40 text-gray-950 text-xs font-bold rounded-lg px-3">حفظ</button>
            </div>
          )}
          <textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} rows={4}
            placeholder={'مساء الخير {الاسم} 🎭 بكرا عندنا «{الفعالية}» — بتحب أحجزلك مكانك؟'}
            className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:border-amber-500 outline-none resize-y" />
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            <span className="text-[10.5px] text-gray-500 font-bold">متغيرات:</span>
            {BC_VARS.map(v => (
              <button key={v} onClick={() => insertVar(v)} className="text-[11px] font-mono text-sky-400 hover:text-sky-300 bg-sky-500/10 rounded px-1.5 py-0.5">{v}</button>
            ))}
            {activityName && <span className="text-[10.5px] text-gray-500">· {'{الفعالية}'} = «{activityName}»</span>}
          </div>
          {/* المعاينة الحية */}
          {body.trim() && (
            <div className="mt-3">
              <div className="flex items-center gap-2 text-[10.5px] text-gray-500 mb-1">
                معاينة على:
                <select value={previewId ?? ''} onChange={e => setPreviewId(parseInt(e.target.value) || null)}
                  className="bg-gray-950 border border-gray-800 rounded px-1.5 py-0.5 text-[11px] text-gray-300 outline-none">
                  {recipients.slice(0, 40).map((r: any) => <option key={r.id} value={r.id}>{r.displayName}</option>)}
                </select>
              </div>
              <div className="bg-emerald-950/60 border border-emerald-900 rounded-xl rounded-tl-md px-3.5 py-2.5 text-[13px] text-gray-100 whitespace-pre-wrap max-w-[520px]">
                {renderBcPreview(body, previewRecipient, activityName)}
              </div>
            </div>
          )}
          {/* الإطلاق / التقدم */}
          {run && !run.finished ? (
            <div className="mt-3 bg-gray-950 border border-gray-800 rounded-xl p-3">
              <div className="flex items-center justify-between text-xs font-bold text-gray-300 mb-1.5">
                <span>🚀 جارٍ الإرسال… {run.done} / {run.total}</span>
                <button onClick={stopRun} className="text-rose-400 hover:text-rose-300 border border-rose-500/40 rounded-lg px-2.5 py-1">⏹️ إيقاف</button>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((run.done / Math.max(1, run.total)) * 100)}%` }} />
              </div>
              <div className="flex gap-3 text-[10.5px] text-gray-500 mt-1.5">
                <span className="text-emerald-400">✅ {run.sent}</span>
                <span>⏭️ {run.skipped}</span>
                <span className="text-rose-400">❌ {run.failed}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <button onClick={launch} disabled={!body.trim() || selected.size === 0}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-gray-950 font-bold rounded-xl px-6 py-2.5 text-sm">
                📢 إرسال لـ{selected.size} مستلم
              </button>
              {run?.finished && (
                <span className="text-xs text-gray-400">
                  {run.status === 'stopped' ? '⏹️ أُوقف' : '✅ اكتمل'} — أُرسلت {run.sent} · تخطّي {run.skipped} · فشل {run.failed}
                </span>
              )}
              <span className="text-[10.5px] text-gray-600 mr-auto">مجاني (نافذة خدمة) · البوت يرد على الردود طبيعياً</span>
            </div>
          )}
        </div>

        {/* السجل */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
          <h2 className="font-bold text-white mb-2">🗂️ إرسالات سابقة</h2>
          {history.length === 0 ? (
            <div className="text-gray-600 text-sm">لا إرسالات بعد.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {history.map((b: any) => (
                <div key={b.id} className="flex items-center gap-3 border border-gray-800 rounded-xl px-3 py-2 text-[12px]">
                  <span className={`font-bold ${b.status === 'done' ? 'text-emerald-400' : b.status === 'stopped' ? 'text-amber-400' : 'text-sky-400'}`}>
                    {b.status === 'done' ? '✅' : b.status === 'stopped' ? '⏹️' : '🔄'}
                  </span>
                  <span className="text-gray-300 truncate flex-1">{b.body}</span>
                  <span className="text-gray-500 shrink-0">✅ {b.sentCount} · ⏭️ {b.skippedCount} · ❌ {b.failedCount}</span>
                  <span className="text-gray-600 shrink-0">{fmtWhen(b.createdAt)}</span>
                  <span className="text-gray-600 shrink-0 hidden sm:inline">{b.createdBy}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 📣 الحملات — دفعة 1: استوديو قوالب ميتا
// إنشاء/حذف/مزامنة القوالب + متابعة الموافقة لحظياً (ويبهوك + push)
// القرارات المعتمدة: سقف 7 أيام · عزو 24 ساعة · الدون يرد على الردود
// ══════════════════════════════════════════════════════

const TPL_STATUS: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: '✅ معتمد', cls: 'bg-emerald-500/10 text-emerald-400' },
  PENDING: { label: '⏳ قيد المراجعة', cls: 'bg-sky-500/10 text-sky-400' },
  REJECTED: { label: '❌ مرفوض', cls: 'bg-rose-500/10 text-rose-400' },
  PAUSED: { label: '⏸️ موقوف', cls: 'bg-amber-500/10 text-amber-400' },
  DISABLED: { label: '🚫 معطّل', cls: 'bg-rose-500/10 text-rose-400' },
  IN_APPEAL: { label: '⚖️ قيد التظلم', cls: 'bg-amber-500/10 text-amber-400' },
};

function tplBodyText(t: any): string {
  const comp = (t.components || []).find((c: any) => c.type === 'BODY');
  return comp?.text || '';
}

function CampaignsView() {
  const [subTab, setSubTab] = useState<'templates' | 'new' | 'list'>('templates');
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'MARKETING' | 'UTILITY'>('MARKETING');
  const [bodyText, setBodyText] = useState('');
  const [examples, setExamples] = useState<string[]>([]);
  const [footer, setFooter] = useState('');
  const [quickReplies, setQuickReplies] = useState<string[]>(['']);
  const [urlBtnText, setUrlBtnText] = useState('');
  const [urlBtnUrl, setUrlBtnUrl] = useState('');
  const bodyTplRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async (sync = true) => {
    try {
      setLoading(true);
      const data = await apiFetch(`/api/whatsapp/meta-templates${sync ? '' : '?sync=0'}`);
      setTemplates(data.templates || []);
    } catch (e: any) {
      swalAlert('تعذر جلب القوالب: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // موافقات القوالب لحظياً
  useEffect(() => {
    const s = getSocket();
    const onTpl = (p: any) => {
      setTemplates(prev => prev.map(t =>
        (t.metaId === p.metaId || t.name === p.name)
          ? { ...t, status: p.status, rejectedReason: p.reason || t.rejectedReason }
          : t));
      const st = TPL_STATUS[p.status]?.label || p.status;
      swalToast(`قالب «${p.name}»: ${st}`, p.status === 'APPROVED' ? 'success' : p.status === 'REJECTED' ? 'error' : 'info');
    };
    s.on('wa:template:update', onTpl);
    return () => { s.off('wa:template:update', onTpl); };
  }, []);

  // عدد المتغيرات بالنص ⇒ حقول الأمثلة
  const varCount = useMemo(() => {
    const ms = (bodyText.match(/\{\{\d+\}\}/g) || []).map(s => parseInt(s.replace(/\D/g, '')));
    return ms.length ? Math.max(...ms) : 0;
  }, [bodyText]);

  const insertVarTpl = () => {
    const v = `{{${varCount + 1}}}`;
    const el = bodyTplRef.current;
    if (el && typeof el.selectionStart === 'number') {
      const s = el.selectionStart, e = el.selectionEnd;
      setBodyText(prev => prev.slice(0, s) + v + prev.slice(e));
      requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + v.length; });
    } else setBodyText(prev => prev + v);
  };

  const previewText = useMemo(() => {
    let t = bodyText;
    for (let i = 1; i <= varCount; i++) t = t.replaceAll(`{{${i}}}`, examples[i - 1]?.trim() || `{{${i}}}`);
    return t;
  }, [bodyText, examples, varCount]);

  const resetForm = () => {
    setName(''); setBodyText(''); setExamples([]); setFooter('');
    setQuickReplies(['']); setUrlBtnText(''); setUrlBtnUrl(''); setCategory('MARKETING');
  };

  const submit = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await apiFetch('/api/whatsapp/meta-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(), category, bodyText, examples: examples.slice(0, varCount),
          footer: footer.trim(),
          quickReplies: quickReplies.map(q => q.trim()).filter(Boolean),
          urlButton: urlBtnText.trim() && urlBtnUrl.trim() ? { text: urlBtnText.trim(), url: urlBtnUrl.trim() } : null,
        }),
      });
      swalToast('أُرسل القالب لمراجعة ميتا ⏳ — ستصلك الموافقة إشعاراً', 'success');
      setShowCreate(false); resetForm();
      load(false); setTimeout(() => load(), 1200);
    } catch (e: any) {
      swalAlert('لم يُقبل القالب: ' + e.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const removeTpl = async (t: any) => {
    const ok = await swalConfirm(`حذف قالب «${t.name}» نهائياً من ميتا ومن النظام؟`, { title: 'حذف قالب', danger: true, confirmText: 'حذف' });
    if (!ok) return;
    try {
      await apiFetch(`/api/whatsapp/meta-templates/${encodeURIComponent(t.name)}`, { method: 'DELETE' });
      setTemplates(prev => prev.filter(x => x.name !== t.name));
      swalToast('حُذف القالب', 'success');
    } catch (e: any) {
      swalAlert('تعذر الحذف: ' + e.message, 'error');
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 pb-6">
      {/* شاشات الحملات الفرعية */}
      <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 text-[13px] self-start">
        {([['templates', '📋 القوالب'], ['new', '🚀 حملة جديدة'], ['list', '📈 الحملات']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSubTab(k)}
            className={`px-3 py-1 rounded-lg font-bold ${subTab === k ? 'bg-amber-500/10 text-amber-400' : 'text-gray-400 hover:text-white'}`}>{l}</button>
        ))}
      </div>

      {subTab === 'new' && (
        <CampaignWizard
          templates={templates.filter((t: any) => t.status === 'APPROVED')}
          onLaunched={() => setSubTab('list')}
        />
      )}
      {subTab === 'list' && <CampaignMonitor />}

      {subTab !== 'templates' ? null : (<>
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-bold text-white">📋 استوديو القوالب</h2>
          <span className="text-[11px] text-gray-500">قوالب ميتا المعتمدة هي مفتاح مراسلة من نافذته مغلقة — تُدار كاملة من هنا</span>
          <div className="mr-auto flex gap-2">
            <button onClick={() => load()} className="text-[11.5px] font-bold text-gray-300 hover:text-white border border-gray-800 rounded-lg px-3 py-1.5">🔄 مزامنة من ميتا</button>
            <button onClick={() => setShowCreate(v => !v)} className="bg-amber-500 hover:bg-amber-400 text-gray-950 text-[12px] font-bold rounded-lg px-3.5 py-1.5">+ قالب جديد</button>
          </div>
        </div>

        {showCreate && (
          <div className="mt-3 border border-gray-800 rounded-xl p-3.5 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
            <div className="flex flex-col gap-2.5">
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-[10.5px] text-gray-500 font-bold">اسم القالب (لاتيني: حروف صغيرة وأرقام و_)</label>
                  <input value={name} onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} placeholder="event_invite"
                    dir="ltr" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-amber-500 outline-none font-mono" />
                </div>
                <div>
                  <label className="text-[10.5px] text-gray-500 font-bold">التصنيف</label>
                  <select value={category} onChange={e => setCategory(e.target.value as any)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-2 py-2 text-sm text-white outline-none focus:border-amber-500">
                    <option value="MARKETING">تسويقي (عروض ودعوات)</option>
                    <option value="UTILITY">خدمي (تأكيدات وتذكيرات)</option>
                  </select>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10.5px] text-gray-500 font-bold">نص الرسالة</label>
                  <button onClick={insertVarTpl} className="text-[10.5px] font-mono text-sky-400 bg-sky-500/10 rounded px-1.5">+ متغير {'{{' + (varCount + 1) + '}}'}</button>
                </div>
                <textarea ref={bodyTplRef} value={bodyText} onChange={e => setBodyText(e.target.value)} rows={4}
                  placeholder={'مساء الخير {{1}} 🎭\nالأسبوع الجاي عندنا «{{2}}» — نحجزلك مكانك؟'}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-amber-500 outline-none resize-y" />
              </div>
              {varCount > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: varCount }, (_, i) => (
                    <div key={i}>
                      <label className="text-[10.5px] text-gray-500 font-bold">مثال للمتغير {'{{' + (i + 1) + '}}'} (شرط المراجعة)</label>
                      <input value={examples[i] || ''} onChange={e => setExamples(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white focus:border-amber-500 outline-none" />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <label className="text-[10.5px] text-gray-500 font-bold">تذييل (اختياري ≤60)</label>
                  <input value={footer} onChange={e => setFooter(e.target.value)} placeholder="نادي المافيا — الأردن 🎭"
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:border-amber-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="text-[10.5px] text-gray-500 font-bold">أزرار رد سريع (حتى 3 — ننصح بإبقاء «إيقاف الرسائل» للاعتذار)</label>
                {quickReplies.map((q, i) => (
                  <div key={i} className="flex gap-1.5 mt-1">
                    <input value={q} onChange={e => setQuickReplies(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
                      placeholder={i === 0 ? 'احجزلي 🎭' : 'إيقاف الرسائل'}
                      className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:border-amber-500 outline-none" />
                    {i === quickReplies.length - 1 && quickReplies.length < 3 && (
                      <button onClick={() => setQuickReplies(prev => [...prev, ''])} className="text-gray-400 hover:text-white border border-gray-800 rounded-lg px-2.5 text-xs">+</button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-[140px]">
                  <label className="text-[10.5px] text-gray-500 font-bold">زر رابط — النص (اختياري)</label>
                  <input value={urlBtnText} onChange={e => setUrlBtnText(e.target.value)} placeholder="🌐 موقعنا"
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:border-amber-500 outline-none" />
                </div>
                <div className="flex-[2] min-w-[200px]">
                  <label className="text-[10.5px] text-gray-500 font-bold">زر رابط — URL</label>
                  <input value={urlBtnUrl} onChange={e => setUrlBtnUrl(e.target.value)} placeholder="https://club-mafia.grade.sbs/player/home"
                    dir="ltr" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:border-amber-500 outline-none font-mono" />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <button onClick={submit} disabled={creating || !name.trim() || !bodyText.trim()}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-gray-950 font-bold rounded-xl px-5 py-2 text-sm">
                  {creating ? '…' : '🚀 إرسال لمراجعة ميتا'}
                </button>
                <span className="text-[10.5px] text-gray-600">المراجعة عادة دقائق حتى ساعات — الحالة توصلك إشعاراً ولحظياً هنا</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 font-bold mb-1">معاينة حيّة:</div>
              <div className="bg-emerald-950/60 border border-emerald-900 rounded-xl rounded-tl-md px-3.5 py-2.5 text-[13px] text-gray-100 whitespace-pre-wrap">
                {previewText || <span className="text-gray-600 italic">اكتب النص لتظهر المعاينة…</span>}
                {footer.trim() && <div className="text-[10.5px] text-gray-500 mt-1.5">{footer}</div>}
                {(quickReplies.some(q => q.trim()) || urlBtnText.trim()) && (
                  <div className="border-t border-dashed border-emerald-800 mt-2 pt-1.5 flex flex-col gap-1">
                    {quickReplies.filter(q => q.trim()).map((q, i) => (
                      <div key={i} className="text-center text-sky-400 text-[12px] font-bold">{q}</div>
                    ))}
                    {urlBtnText.trim() && <div className="text-center text-sky-400 text-[12px] font-bold">🔗 {urlBtnText}</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* قائمة القوالب */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
        {loading ? (
          <div className="text-gray-600 text-sm text-center py-6">جارٍ المزامنة مع ميتا…</div>
        ) : templates.length === 0 ? (
          <div className="text-gray-600 text-sm text-center py-6">لا قوالب بعد — أنشئ أول قالب من الأعلى.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {templates.map((t: any) => {
              const st = TPL_STATUS[t.status] || { label: t.status || '—', cls: 'bg-gray-800 text-gray-400' };
              return (
                <div key={t.id} className="border border-gray-800 rounded-xl px-3.5 py-2.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-[12.5px] font-bold text-white" dir="ltr">{t.name}</span>
                    <span className={`text-[10.5px] font-bold rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                    <span className="text-[10.5px] text-gray-500">{t.category === 'MARKETING' ? '📣 تسويقي' : t.category === 'UTILITY' ? '🔔 خدمي' : t.category}</span>
                    <span className="text-[10.5px] text-gray-600" dir="ltr">{t.language}</span>
                    {t.qualityScore && <span className="text-[10.5px] text-gray-500">جودة: {t.qualityScore}</span>}
                    <button onClick={() => removeTpl(t)} className="mr-auto text-gray-600 hover:text-rose-400 text-sm" title="حذف القالب">🗑</button>
                  </div>
                  <div className="text-[12px] text-gray-400 whitespace-pre-wrap mt-1 line-clamp-3">{tplBodyText(t)}</div>
                  {t.status === 'REJECTED' && t.rejectedReason && (
                    <div className="text-[11px] text-rose-400 mt-1">سبب الرفض: {t.rejectedReason}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      </>)}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🚀 معالج الحملة — قالب معتمد → متغيرات → شريحة → إطلاق
// ══════════════════════════════════════════════════════

const VAR_FIELDS = [
  { key: 'firstName', label: 'الاسم الأول' },
  { key: 'fullName', label: 'الاسم الكامل' },
  { key: 'rank', label: 'الرتبة' },
  { key: 'nextActivity', label: 'الفعالية القادمة' },
] as const;

const SEGMENTS = [
  { key: 'all', label: '👥 كل اللاعبين' },
  { key: 'rank_min', label: '🎖️ رتبة فأعلى' },
  { key: 'new_players', label: '🆕 الجدد (آخر N يوم)' },
  { key: 'lapsed', label: '😴 الغائبون (منذ N يوم)' },
] as const;

const RANKS_LIST = [
  { key: 'SOLDIER', label: 'جندي فأعلى' },
  { key: 'CAPO', label: 'كابو فأعلى' },
  { key: 'UNDERBOSS', label: 'ساعد الزعيم فأعلى' },
  { key: 'GODFATHER', label: 'العرّاب فقط' },
] as const;

function CampaignWizard({ templates, onLaunched }: { templates: any[]; onLaunched: () => void }) {
  const [tplName, setTplName] = useState('');
  const [campName, setCampName] = useState('');
  const [mapping, setMapping] = useState<Array<{ type: 'field' | 'static'; value: string }>>([]);
  const [segType, setSegType] = useState<'all' | 'rank_min' | 'new_players' | 'lapsed'>('all');
  const [rankMin, setRankMin] = useState('CAPO');
  const [days, setDays] = useState(30);
  const [preview, setPreview] = useState<any | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [launching, setLaunching] = useState(false);

  const tpl = templates.find((t: any) => t.name === tplName) || null;
  const bodyText = useMemo(() => tpl ? tplBodyText(tpl) : '', [tpl]);
  const varCount = useMemo(() => {
    const ms = (bodyText.match(/\{\{\d+\}\}/g) || []).map(s => parseInt(s.replace(/\D/g, '')));
    return ms.length ? Math.max(...ms) : 0;
  }, [bodyText]);

  useEffect(() => {
    setMapping(prev => Array.from({ length: varCount }, (_, i) => prev[i] || { type: 'field', value: 'firstName' }));
  }, [varCount]);

  useEffect(() => { setPreview(null); }, [segType, rankMin, days]);

  const fetchPreview = async () => {
    try {
      setPreviewing(true);
      const params = new URLSearchParams({ type: segType });
      if (segType === 'rank_min') params.set('rankMin', rankMin);
      if (segType === 'new_players' || segType === 'lapsed') params.set('days', String(days));
      const data = await apiFetch(`/api/whatsapp/campaigns/segment-preview?${params}`);
      setPreview(data);
    } catch (e: any) {
      swalAlert('تعذرت المعاينة: ' + e.message, 'error');
    } finally {
      setPreviewing(false);
    }
  };

  const sampleRender = useMemo(() => {
    if (!bodyText) return '';
    let t = bodyText;
    mapping.forEach((m, i) => {
      const v = m.type === 'static' ? (m.value || `{{${i + 1}}}`)
        : m.value === 'firstName' ? 'أحمد'
        : m.value === 'fullName' ? 'أحمد خالد'
        : m.value === 'rank' ? 'كابو'
        : 'مزاج افندينا';
      t = t.replaceAll(`{{${i + 1}}}`, v);
    });
    return t;
  }, [bodyText, mapping]);

  const launch = async () => {
    if (!tpl || !campName.trim()) return;
    if (!preview) { swalAlert('اعرض حجم الشريحة أولاً (زر المعاينة)', 'info'); return; }
    const ok = await swalConfirm(
      `إطلاق حملة «${campName.trim()}»؟\n\nالمستلمون: ${preview.total} (بعد استبعاد ${preview.excludedOptout} معتذر و${preview.excludedFreq} ضمن سقف الإزعاج)\nالتوزيع: ~${preview.days} ${preview.days > 1 ? 'أيام' : 'يوم'} ضمن سقف ${preview.dailyCap}/يوم\n\nعينة الرسالة:\n${sampleRender.slice(0, 250)}`,
      { title: '📣 تأكيد الإطلاق', confirmText: `إطلاق (${preview.total})` },
    );
    if (!ok) return;
    try {
      setLaunching(true);
      await apiFetch('/api/whatsapp/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: campName.trim(),
          templateName: tpl.name,
          varMapping: mapping,
          segment: { type: segType, ...(segType === 'rank_min' ? { rankMin } : {}), ...(segType === 'new_players' || segType === 'lapsed' ? { days } : {}) },
        }),
      });
      swalToast('🚀 انطلقت الحملة — تابعها من «📈 الحملات»', 'success');
      onLaunched();
    } catch (e: any) {
      swalAlert('تعذر الإطلاق: ' + e.message, 'error');
    } finally {
      setLaunching(false);
    }
  };

  if (!templates.length) {
    return (
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 text-center text-gray-500 text-sm">
        لا يوجد قوالب <b className="text-emerald-400">معتمدة</b> بعد — أنشئ قالباً من «📋 القوالب» وانتظر موافقة ميتا، ثم عد إلى هنا.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3.5">
        <div className="flex gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10.5px] text-gray-500 font-bold">اسم الحملة (داخلي)</label>
            <input value={campName} onChange={e => setCampName(e.target.value)} placeholder="استرجاع الغائبين — أغسطس"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-amber-500 outline-none" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10.5px] text-gray-500 font-bold">القالب المعتمد ✅</label>
            <select value={tplName} onChange={e => setTplName(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-2 py-2 text-sm text-white outline-none focus:border-amber-500">
              <option value="">— اختر قالباً —</option>
              {templates.map((t: any) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>
        </div>

        {tpl && varCount > 0 && (
          <div>
            <label className="text-[10.5px] text-gray-500 font-bold">ربط المتغيرات — لكل {'{{n}}'} قيمة من بياناتنا أو نص ثابت</label>
            <div className="flex flex-col gap-1.5 mt-1">
              {mapping.map((m, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <span className="font-mono text-[11px] text-sky-400 shrink-0" dir="ltr">{'{{' + (i + 1) + '}}'}</span>
                  <select value={m.type === 'static' ? 'static' : m.value}
                    onChange={e => setMapping(prev => prev.map((x, j) => j === i
                      ? (e.target.value === 'static' ? { type: 'static', value: '' } : { type: 'field', value: e.target.value })
                      : x))}
                    className="bg-gray-950 border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-amber-500">
                    {VAR_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    <option value="static">نص ثابت…</option>
                  </select>
                  {m.type === 'static' && (
                    <input value={m.value} onChange={e => setMapping(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                      placeholder="النص الثابت"
                      className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:border-amber-500 outline-none" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="text-[10.5px] text-gray-500 font-bold">الجمهور</label>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {SEGMENTS.map(s => (
              <button key={s.key} onClick={() => setSegType(s.key)}
                className={`rounded-full px-3 py-1 text-[12px] font-bold border ${segType === s.key ? 'bg-amber-500/10 text-amber-400 border-amber-500/40' : 'text-gray-400 border-gray-800 hover:text-white'}`}>{s.label}</button>
            ))}
            {segType === 'rank_min' && (
              <select value={rankMin} onChange={e => setRankMin(e.target.value)}
                className="bg-gray-950 border border-gray-800 rounded-lg px-2 py-1 text-xs text-white outline-none">
                {RANKS_LIST.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            )}
            {(segType === 'new_players' || segType === 'lapsed') && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <input type="number" min={1} max={365} value={days} onChange={e => setDays(parseInt(e.target.value) || 30)}
                  className="w-16 bg-gray-950 border border-gray-800 rounded-lg px-2 py-1 text-xs text-white outline-none text-center" /> يوم
              </span>
            )}
            <button onClick={fetchPreview} disabled={previewing}
              className="text-[11.5px] font-bold text-gray-300 hover:text-white border border-gray-800 rounded-lg px-3 py-1">
              {previewing ? '…' : '👁️ معاينة الحجم'}
            </button>
          </div>
          {preview && (
            <div className="mt-2 bg-gray-950 border border-gray-800 rounded-xl p-3 text-[12px] text-gray-300 flex flex-wrap gap-x-4 gap-y-1">
              <span>المستلمون: <b className="text-emerald-400">{preview.total}</b></span>
              <span className="text-gray-500">🚫 معتذرون: {preview.excludedOptout}</span>
              <span className="text-gray-500">😴 ضمن سقف 7 أيام: {preview.excludedFreq}</span>
              <span className="text-amber-400">⏱️ التوزيع: ~{preview.days} {preview.days > 1 ? 'أيام' : 'يوم'} (سقف {preview.dailyCap}/يوم)</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={launch} disabled={launching || !tpl || !campName.trim() || !preview?.total}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-gray-950 font-bold rounded-xl px-6 py-2.5 text-sm">
            {launching ? '…' : '📣 إطلاق الحملة'}
          </button>
          <span className="text-[10.5px] text-gray-600">مدفوعة لكل رسالة (خارج النافذة) · الردود يستقبلها الدون · الحجوزات خلال 24 ساعة تُنسب للحملة</span>
        </div>
      </div>

      <div>
        <div className="text-[11px] text-gray-500 font-bold mb-1">معاينة (على «أحمد» كابو):</div>
        <div className="bg-emerald-950/60 border border-emerald-900 rounded-xl rounded-tl-md px-3.5 py-2.5 text-[13px] text-gray-100 whitespace-pre-wrap">
          {sampleRender || <span className="text-gray-600 italic">اختر قالباً لتظهر المعاينة…</span>}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 📈 مراقبة الحملات — تقدم حي + عزو الحجوزات + تحكم
// ══════════════════════════════════════════════════════

const CAMP_STATUS: Record<string, { label: string; cls: string }> = {
  running: { label: '🔄 جارية', cls: 'bg-sky-500/10 text-sky-400' },
  paused: { label: '⏸️ موقوفة مؤقتاً', cls: 'bg-amber-500/10 text-amber-400' },
  stopped: { label: '⏹️ أُنهيت', cls: 'bg-rose-500/10 text-rose-400' },
  done: { label: '✅ اكتملت', cls: 'bg-emerald-500/10 text-emerald-400' },
};

function CampaignMonitor() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [capWait, setCapWait] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/api/whatsapp/campaigns');
      setCampaigns(data.campaigns || []);
    } catch (e: any) {
      swalAlert('تعذر جلب الحملات: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const s = getSocket();
    const onProgress = (p: any) => {
      if (p.waitingCap) { setCapWait(prev => ({ ...prev, [p.campaignId]: true })); return; }
      setCapWait(prev => ({ ...prev, [p.campaignId]: false }));
      setCampaigns(prev => prev.map(c => c.id === p.campaignId
        ? { ...c, sentCount: p.sent ?? c.sentCount, failedCount: p.failed ?? c.failedCount, skippedCount: p.skipped ?? c.skippedCount, status: p.finished ? 'done' : c.status }
        : c));
    };
    s.on('wa:campaign:progress', onProgress);
    return () => { s.off('wa:campaign:progress', onProgress); };
  }, []);

  const act = async (c: any, action: 'pause' | 'resume' | 'stop') => {
    if (action === 'stop') {
      const ok = await swalConfirm(`إنهاء حملة «${c.name}» نهائياً؟ (المتبقون لن يُراسَلوا)`, { title: 'إنهاء الحملة', danger: true, confirmText: 'إنهاء' });
      if (!ok) return;
    }
    try {
      await apiFetch(`/api/whatsapp/campaigns/${c.id}/${action}`, { method: 'POST' });
      load();
    } catch (e: any) {
      swalAlert('تعذر التنفيذ: ' + e.message, 'error');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {loading ? (
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 text-center text-gray-600 text-sm">جارٍ التحميل…</div>
      ) : campaigns.length === 0 ? (
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 text-center text-gray-600 text-sm">لا حملات بعد — أطلق أول حملة من «🚀 حملة جديدة».</div>
      ) : campaigns.map((c: any) => {
        const st = CAMP_STATUS[c.status] || { label: c.status, cls: 'bg-gray-800 text-gray-400' };
        const doneN = (c.sentCount || 0) + (c.failedCount || 0) + (c.skippedCount || 0);
        const pct = Math.round((doneN / Math.max(1, c.totalTargets)) * 100);
        return (
          <div key={c.id} className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <b className="text-white text-[14px]">{c.name}</b>
              <span className={`text-[10.5px] font-bold rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
              <span className="text-[10.5px] text-gray-500 font-mono" dir="ltr">{c.templateName}</span>
              {capWait[c.id] && <span className="text-[10.5px] text-amber-400 font-bold">⏳ بانتظار نافذة سقف ميتا اليومي — يُكمل تلقائياً</span>}
              <span className="mr-auto flex gap-1.5">
                {c.status === 'running' && <button onClick={() => act(c, 'pause')} className="text-[11px] font-bold text-amber-400 border border-amber-500/40 rounded-lg px-2.5 py-1">⏸️ إيقاف مؤقت</button>}
                {c.status === 'paused' && <button onClick={() => act(c, 'resume')} className="text-[11px] font-bold text-emerald-400 border border-emerald-500/40 rounded-lg px-2.5 py-1">▶️ استئناف</button>}
                {['running', 'paused'].includes(c.status) && <button onClick={() => act(c, 'stop')} className="text-[11px] font-bold text-rose-400 border border-rose-500/40 rounded-lg px-2.5 py-1">⏹️ إنهاء</button>}
              </span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mt-2.5">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 mt-2.5 text-center">
              {[
                ['المستهدفون', c.totalTargets, 'text-gray-300'],
                ['أُرسلت', c.sentCount, 'text-gray-300'],
                ['وصلت', c.deliveredCount, 'text-gray-300'],
                ['قُرئت', c.readCount, 'text-sky-400'],
                ['ردّوا 💬', c.repliedCount, 'text-amber-400'],
                ['حجزوا 🎯', c.convertedCount, 'text-emerald-400'],
                ['فشل/تخطٍّ', (c.failedCount || 0) + (c.skippedCount || 0), 'text-rose-400'],
              ].map(([l, v, cls], i) => (
                <div key={i} className="bg-gray-950 border border-gray-800 rounded-lg py-1.5">
                  <div className={`text-[15px] font-bold ${cls}`}>{v || 0}</div>
                  <div className="text-[9.5px] text-gray-600 font-bold">{l}</div>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-gray-600 mt-1.5">{fmtWhen(c.createdAt)} · {c.createdBy} · العزو: حجز خلال 24 ساعة من الإرسال</div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 📊 استهلاك Gemini والتكلفة الحقيقية — توكنز فعلية × أسعار جوجل الرسمية
// ══════════════════════════════════════════════════════

function fmtTok(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n || 0);
}
function fmtUSD(n: number): string {
  if (!n) return '$0';
  if (n < 0.01) return '$' + n.toFixed(4);
  return '$' + n.toFixed(2);
}

function UsageCard({ s, patch }: { s: any; patch: (k: string, v: any) => void }) {
  const [u, setU] = useState<any | null>(null);
  const [loadingU, setLoadingU] = useState(true);

  const loadUsage = useCallback(async () => {
    try {
      setLoadingU(true);
      const data = await apiFetch('/api/whatsapp/bot/usage');
      setU(data.usage);
    } catch { /* تكميلي */ } finally {
      setLoadingU(false);
    }
  }, []);
  useEffect(() => { loadUsage(); }, [loadUsage]);

  return (
    <Card title="📊 استهلاك Gemini والتكلفة (حقيقي)" wide>
      {loadingU || !u ? (
        <div className="text-gray-600 text-sm text-center py-4">{loadingU ? 'جارٍ الحساب…' : 'لا بيانات بعد — تبدأ مع أول رد للبوت'}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* الفترات */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {([['اليوم', u.today], ['7 أيام', u.d7], ['30 يوماً', u.d30], ['منذ البداية', u.allTime]] as const).map(([l, b]: any, i) => (
              <div key={i} className="bg-gray-950 border border-gray-800 rounded-xl py-2.5 px-2">
                <div className="text-[10px] text-gray-600 font-bold">{l}</div>
                <div className="text-[15px] font-bold text-white mt-0.5">{fmtTok(b.total)} <span className="text-[9px] text-gray-600">توكن</span></div>
                <div className="text-[12.5px] font-bold text-emerald-400">{fmtUSD(b.cost)}</div>
                <div className="text-[9px] text-gray-600">{b.replies} رد</div>
              </div>
            ))}
          </div>

          {/* المتوسطات المطلوبة */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
            <div className="bg-gray-950 border border-amber-500/30 rounded-xl py-2.5 px-2">
              <div className="text-[10px] text-amber-400 font-bold">📅 المتوسط اليومي (30 يوماً)</div>
              <div className="text-[13px] font-bold text-white mt-0.5">{fmtTok(u.avgDaily.tokens)} توكن · <span className="text-emerald-400">{fmtUSD(u.avgDaily.cost)}</span></div>
              <div className="text-[9px] text-gray-600">على {u.avgDaily.activeDays} يوم نشط</div>
            </div>
            <div className="bg-gray-950 border border-amber-500/30 rounded-xl py-2.5 px-2">
              <div className="text-[10px] text-amber-400 font-bold">💬 متوسط الرسالة الواحدة</div>
              <div className="text-[13px] font-bold text-emerald-400 mt-0.5">{fmtUSD(u.avgPerReply.cost)}</div>
              <div className="text-[9px] text-gray-600">على {u.avgPerReply.replies} رد حي (30 يوماً)</div>
            </div>
            <div className="bg-gray-950 border border-amber-500/30 rounded-xl py-2.5 px-2">
              <div className="text-[10px] text-amber-400 font-bold">🗨️ الدردشة الروتينية الواحدة</div>
              <div className="text-[13px] font-bold text-emerald-400 mt-0.5">{fmtUSD(u.routineChat.medianCost)} <span className="text-[9px] text-gray-500">(وسيط)</span></div>
              <div className="text-[9px] text-gray-600">المتوسط الحسابي {fmtUSD(u.routineChat.avgCost)} · {u.routineChat.conversations} محادثة</div>
            </div>
          </div>

          {/* آخر 7 أيام */}
          <div className="overflow-x-auto">
            <table className="w-full text-[10.5px] text-gray-400">
              <thead><tr className="text-gray-600">
                {u.last7.map((d: any) => <th key={d.day} className="font-bold pb-1">{d.day.slice(5)}</th>)}
              </tr></thead>
              <tbody>
                <tr className="text-center">
                  {u.last7.map((d: any) => (
                    <td key={d.day} className="py-1 border-t border-gray-800">
                      <div className="text-white font-bold">{fmtTok(d.total)}</div>
                      <div className="text-emerald-400">{fmtUSD(d.cost)}</div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* الأسعار الرسمية */}
          <div className="flex items-end gap-2 flex-wrap border-t border-gray-800 pt-2.5">
            <div>
              <label className="text-[10px] text-gray-500 font-bold">سعر الإدخال $/مليون توكن</label>
              <input type="number" step="0.01" min="0" value={s.priceInputPer1M ?? ''} onChange={e => patch('priceInputPer1M', e.target.value)}
                className="w-28 bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500" dir="ltr" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold">سعر الإخراج $/مليون توكن</label>
              <input type="number" step="0.01" min="0" value={s.priceOutputPer1M ?? ''} onChange={e => patch('priceOutputPer1M', e.target.value)}
                className="w-28 bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500" dir="ltr" />
            </div>
            <button onClick={loadUsage} className="text-[11px] font-bold text-gray-300 hover:text-white border border-gray-800 rounded-lg px-3 py-1.5">🔄 تحديث</button>
            <span className="text-[9.5px] text-gray-600 flex-1 min-w-[220px]">
              التوكنز أعداد فعلية من Gemini لكل نداء، والتكلفة = توكنز كل صف × سعر <b>نموذجه هو</b> (تبديل النماذج لا يخلط الحسابات). أسعار <b className="text-gray-400" dir="ltr">{u.prices.model}</b> تُحمَّل تلقائياً للنماذج المعروفة{!u.prices.knownModel && <b className="text-amber-400"> — ⚠️ هذا النموذج غير معروف الأسعار: أدخل سعريه من صفحة أسعار Google واحفظ</b>}. المرجع الوحيد للتحقق: <span dir="ltr">ai.google.dev/gemini-api/docs/pricing</span>. تشمل الأرقام ساحة الاختبار ({fmtUSD(u.playgroundCost30)} آخر 30 يوماً)؛ متوسطا الرسالة والدردشة على الردود الحية فقط.
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
