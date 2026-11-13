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
import BroadcastTab from './BroadcastTab';
import PerformanceTab from './PerformanceTab';
import RewardsTab from './RewardsTab';
import BookingOffersTab from './BookingOffersTab';
import { useWaHealth } from './HealthBar';
import ChannelsSection from './ChannelsSection';
import LineContactsSection from './LineContactsSection';
import { apiFetch, getUser, API_URL, MUTE_KEY, WA_CAPTION_MAX, RANK_AR, ROLE_AR, FILTERS, SORTS, WIN_SORTS, fmtLeft, winTone, fmtTime, fmtWhen, fmtDay, intlPhone, CONV_PAGE, MSG_PAGE, isPendingMsg, chOf, CH_AR, inView, viewUnread, readInView, withoutPreview, insertByTime, windowHoursLeft, playPing, Ticks, SourceTag, messageInfoText, type InboxCh } from './wa-lib';
import { AudioBubble, ImageBubble, OutVideoBubble, OutImageBubble, FileBubble, ConvAvatar } from './bubbles';
import { BotSettingsView } from './BotSettings';
import { useVisibleViewport } from '@/hooks/useVisibleViewport';
import { Toggle, Seg, Chip, Badge, Setting, Tile, Banner, Meter, Empty, Skel, Pop, Field } from './wa-ui';
import {
  MessageSquare, Settings, Bell, BellOff, Search, ChevronRight, ChevronLeft, User, Bot, Megaphone, Info, Trash2,
  Image as ImageIcon, VenetianMask, Sparkles, Send, X, Link2, Unlink, Copy, CalendarPlus, ExternalLink, Cloud, Smartphone,
  Clock, Lock, TriangleAlert, EyeOff, Ban, BookOpen, Activity, Ticket, Gift, Shuffle, Contact, Download, CirclePause,
  CornerUpLeft, Headset, PanelLeft, Video, NotebookPen, Pencil, Minus, Plus, Check, FlaskConical, SlidersHorizontal, type LucideIcon,
} from 'lucide-react';
import './wa.css';

// ── ثلاثة أبواب: الوارد · الوصول للناس (عمل يوميّ) · الإعدادات (ضبط نادر). خمسة أقسام بدل ثمانية. ──
type Door = 'reach' | 'admin';
type AdminSec = 'cast' | 'offers' | 'don' | 'perf' | 'numbers';
const DOOR_AR: Record<Door, string> = { reach: 'الوصول للناس', admin: 'الإعدادات' };
const ADMIN_SECS: Array<{ key: AdminSec; door: Door; label: string; hint: string; Icon: LucideIcon }> = [
  { key: 'cast', door: 'reach', label: 'البثّ', hint: 'رسالة لكثيرين، وسجلّ ما أُرسل', Icon: Megaphone },
  { key: 'offers', door: 'reach', label: 'العروض', hint: 'جيب صحابك، السعر المبكّر، نقاط الحديث', Icon: Ticket },
  { key: 'don', door: 'admin', label: 'الدون', hint: 'السلوك، الأدوات، الشخصيّة، المعرفة', Icon: Bot },
  { key: 'perf', door: 'admin', label: 'الأداء والكلفة', hint: 'هل يؤدّي الدون عمله، وبكم', Icon: Activity },
  { key: 'numbers', door: 'admin', label: 'الأرقام', hint: 'القنوات وجهات خطّ الأعمال', Icon: Shuffle },
];
const TONE_VAR: Record<string, string> = { ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)', closed: 'var(--ink-3)' };

export default function WhatsAppInboxPage() {
  const user = useMemo(() => getUser(), []);

  // ── الحالة ──
  const [convs, setConvs] = useState<any[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [sort, setSort] = useState<string>('recent');
  // 🔀 فلتر الرقم: كلّ المحادثات · رسائل رقم ميتا · رسائل رقم الأعمال — يُحفظ في المتصفّح
  const [inboxCh, setInboxCh] = useState<InboxCh>(() => {
    try { const v = localStorage.getItem('wa_inbox_channel'); return v === 'cloud' || v === 'web' ? v : 'all'; } catch { return 'all'; }
  });
  const inboxChRef = useRef(inboxCh);
  useEffect(() => { inboxChRef.current = inboxCh; try { localStorage.setItem('wa_inbox_channel', inboxCh); } catch { /* لا شيء */ } }, [inboxCh]);
  const chQs = (ch: string) => (ch === 'all' ? '' : `&channel=${ch}`);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [conv, setConv] = useState<any | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pending, setPending] = useState<any[]>([]);          // ⏳ شريط الطابور تحت الخيط
  const pendingRef = useRef<any[]>([]);
  pendingRef.current = pending;
  const [convHasMore, setConvHasMore] = useState(false);
  const [loadingMoreConvs, setLoadingMoreConvs] = useState(false);
  const convsRef = useRef<any[]>([]);
  convsRef.current = convs;
  const [ctx, setCtx] = useState<any | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [asCustomer, setAsCustomer] = useState(false);   // 🎭 وضع «تكلّم بلسان العميل»
  // ✨ الصياغة: مفعّلةٌ افتراضيّاً، وتُطفأ لرسالةٍ بعينها حين يكون الحرف مقدَّساً
  const [styleOn, setStyleOn] = useState(true);
  const [review, setReview] = useState<{ original: string; styled: string; reason: string } | null>(null);
  // 🖼️ صورةٌ مرحَّلة: تُرفع فور اختيارها لا عند الإرسال — فيرى الموظّف ما سيصل العميل
  //    فعلاً بعد ضغط الخادم، وما يكتبه يصير تعليقها: رسالةٌ واحدة لا رسالتان.
  const [img, setImg] = useState<{ url: string; bytes: number; width?: number | null; height?: number | null } | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [mobilePane, setMobilePane] = useState<'list' | 'chat' | 'info'>('list');
  // مستويان بدل خمسة تبويباتٍ متساوية: الوارد عملٌ يوميّ، والإدارة ضبطٌ وتحليل
  const [mainTab, setMainTab] = useState<'chat' | Door>('chat');
  const [adminSec, setAdminSec] = useState<AdminSec>('cast');
  // تبويبات داخل الأقسام المدموجة
  const [donSub, setDonSub] = useState<'don' | 'know'>('don');
  const [offSub, setOffSub] = useState<'book' | 'chat'>('book');
  const [numSub, setNumSub] = useState<'channels' | 'roster'>('channels');
  const [tryOpen, setTryOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  // 📱 الهاتف: الإدارة صفحة قائمة، والقسم يُفتح فوقها
  const [secOpen, setSecOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [showLink, setShowLink] = useState(false);
  const [linkQ, setLinkQ] = useState('');
  const [linkResults, setLinkResults] = useState<any[]>([]);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bkData, setBkData] = useState<{ activities: any[]; locations: any[]; staffList: any[] } | null>(null);
  const [, forceTick] = useState(0); // لتحديث عدّادات النافذة/الإيقاف المؤقت دورياً

  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);   // حقلُ الملفّ المخفيّ — الزرّ 🖼️ هو الواجهة
  const selIdRef = useRef<number | null>(null);
  selIdRef.current = selId;
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  // ── جلب المحادثات ──
  const loadConvs = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoadingConvs(true);
      // الصامت (كلّ دقيقة) يحدّث ما حُمِّل كلّه لا الصفحة الأولى وحدها — وإلّا انكمشت القائمة تحت يد المستخدم
      const loaded = convsRef.current.length;
      const n = opts?.silent ? Math.min(200, Math.max(CONV_PAGE, loaded)) : CONV_PAGE;
      const data = await apiFetch(`/api/whatsapp/conversations?filter=${filter}&sort=${sort}&q=${encodeURIComponent(q)}&limit=${n}&offset=0${chQs(inboxCh)}`);
      const fresh: any[] = data.conversations || [];
      setConvs(prev => (opts?.silent && prev.length > n
        ? [...fresh, ...prev.slice(n).filter(c => !fresh.some(f => f.id === c.id))]
        : fresh));
      if (!opts?.silent || loaded <= n) setConvHasMore(fresh.length === n);
      apiFetch(`/api/whatsapp/conversations/counts?x=1${chQs(inboxCh)}`).then(r => setCounts(r.counts)).catch(() => {});
    } catch (e: any) {
      if (!opts?.silent) swalAlert('تعذر جلب المحادثات: ' + e.message, 'error');
    } finally {
      setLoadingConvs(false);
    }
  }, [filter, sort, q, inboxCh]);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  // ── المحادثات الأقدم بالتمرير: ٢٠ كلّ مرّة بنفس الفلتر والترتيب والرقم المعروض ──
  const loadMoreConvs = useCallback(async () => {
    if (loadingMoreConvs || !convHasMore) return;
    setLoadingMoreConvs(true);
    try {
      const off = convsRef.current.length;
      const data = await apiFetch(`/api/whatsapp/conversations?filter=${filter}&sort=${sort}&q=${encodeURIComponent(q)}&limit=${CONV_PAGE}&offset=${off}${chQs(inboxCh)}`);
      const page: any[] = data.conversations || [];
      setConvs(prev => [...prev, ...page.filter(c => !prev.some(p => p.id === c.id))]);
      setConvHasMore(page.length === CONV_PAGE);
    } catch { /* المحاولة التالية بالتمرير */ }
    finally { setLoadingMoreConvs(false); }
  }, [filter, sort, q, inboxCh, loadingMoreConvs, convHasMore]);
  useEffect(() => { if (selIdRef.current) openConv(selIdRef.current); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboxCh]);

  // ── فتح محادثة: رسائل + مقروء + سياق العميل ──
  const openConv = useCallback(async (id: number) => {
    setSelId(id);
    setMobilePane('chat');
    setLoadingMsgs(true);
    setCtx(null);
    setImg(null); setImgErr(null);   // صورةُ محادثةٍ لا تُهاجر لغيرها
    setShowLink(false);
    try {
      const data = await apiFetch(`/api/whatsapp/conversations/${id}/messages?limit=${MSG_PAGE}${chQs(inboxChRef.current)}`);
      setConv(data.conversation);
      setMessages((data.messages || []).slice().reverse()); // الأقدم أولاً للعرض
      setPending(data.pending || []);
      setHasMore(!!data.hasMore);
      // فتح المحادثة يعلّمها مقروءة (بند معتمد) — في عرض رقمٍ واحد: رسائل ذلك الرقم وحده
      const chF = inboxChRef.current;
      if (data.conversation?.unreadCount > 0) {
        apiFetch(`/api/whatsapp/conversations/${id}/read?x=1${chQs(chF)}`, { method: 'POST' }).catch(() => {});
      }
      setConvs(prev => prev.map(c => (c.id === id ? { ...c, ...readInView(c, chF) } : c)));
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
    if (!selId || messages.length === 0 || loadingOlder) return;
    const oldest = messages[0]?.id;
    setLoadingOlder(true);
    const el = threadRef.current;
    const prevH = el?.scrollHeight || 0, prevTop = el?.scrollTop || 0;
    try {
      const data = await apiFetch(`/api/whatsapp/conversations/${selId}/messages?limit=${MSG_PAGE}&before=${oldest}${chQs(inboxChRef.current)}`);
      const older: any[] = (data.messages || []).slice().reverse();
      setMessages(prev => [...older.filter(o => !prev.some(p => p.id === o.id)), ...prev]);
      setHasMore(!!data.hasMore);
      // الموضع يبقى على ما كان يقرؤه — لا قفزٌ إلى أعلى الأقدم
      requestAnimationFrame(() => { const e2 = threadRef.current; if (e2) e2.scrollTop = e2.scrollHeight - prevH + prevTop; });
    } catch { /* تجاهل */ }
    finally { setLoadingOlder(false); }
  }, [selId, messages, loadingOlder]);

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
      const chF = inboxChRef.current;
      const visible = inView(message, chF);
      const isOpen = selIdRef.current === conversation.id;
      if (isPendingMsg(message)) {
        // ⏳ دخل طابور رقم الأعمال ولم يخرج: لا ترتيب ولا معاينة في القائمة، ولا خيط — شريط الطابور فقط
        setConvs(prev => prev.map(c => (c.id === conversation.id ? { ...c, ...withoutPreview(conversation) } : c)));
        if (isOpen && visible) setPending(prev => (prev.some(m => m.id === message.id) ? prev : [...prev, message]));
        return;
      }
      const readNow = isOpen && visible && message.direction === 'in';
      // تحديث القائمة: رسالةٌ على الرقم المعروض ⟵ للمقدّمة بمعاينتها (أو إدراجٌ إن لم تكن فيها).
      // رسالةٌ على الرقم الآخر ⟵ لا تُدرج محادثةً ليست في هذا العرض، ولا تغيّر معاينته ولا ترتيبه
      setConvs(prev => {
        if (!visible) {
          return prev.some(c => c.id === conversation.id)
            ? prev.map(c => (c.id === conversation.id ? { ...c, ...withoutPreview(conversation) } : c))
            : prev;
        }
        const rest = prev.filter(c => c.id !== conversation.id);
        return [{ ...conversation, ...(readNow ? readInView(conversation, chF) : {}) }, ...rest];
      });
      // المحادثة المفتوحة: إلحاقٌ بالترتيب الزمنيّ + مقروء — لرسائل الرقم المعروض وحدها
      if (isOpen) {
        setConv((prev: any) => ({ ...prev, ...(visible ? conversation : withoutPreview(conversation)), ...(readNow ? readInView(conversation, chF) : {}) }));
        if (visible) {
          // خرجت من الطابور ⟵ تغادر شريطه وتدخل الخيط بوقت خروجها الفعليّ
          setPending(prev => prev.filter(m => m.id !== message.id));
          setMessages(prev => insertByTime(prev.filter(m => m.id !== message.id), message));
          scrollBottom();
        }
        if (readNow) {
          apiFetch(`/api/whatsapp/conversations/${conversation.id}/read?x=1${chQs(chF)}`, { method: 'POST' }).catch(() => {});
        }
      }
      if (message.direction === 'in' && !mutedRef.current) playPing();
    };

    const onStatus = (upd: any) => {
      if (!upd?.id) return;
      const pm = pendingRef.current.find(m => m.id === upd.id);
      if (pm && !isPendingMsg(upd)) {
        // خرجت (أو فشلت) ⟵ من شريط الطابور إلى الخيط، بوقت خروجها إن وصل
        setPending(prev => prev.filter(m => m.id !== upd.id));
        setMessages(prev => insertByTime(prev.filter(m => m.id !== upd.id), { ...pm, status: upd.status, errorMessage: upd.errorMessage, ...(upd.createdAt ? { createdAt: upd.createdAt } : {}) }));
        return;
      }
      if (pm) { setPending(prev => prev.map(m => (m.id === upd.id ? { ...m, status: upd.status } : m))); return; }
      setMessages(prev => prev.map(m => (m.id === upd.id ? { ...m, status: upd.status, errorMessage: upd.errorMessage } : m)));
    };

    // رياكشن: تحديث الرسالة الهدف (الشارة) + معاينة القائمة
    const onReaction = (p: any) => {
      if (p?.message && selIdRef.current === p.conversationId) {
        setMessages(prev => prev.map(m => (m.id === p.message.id ? { ...m, payload: p.message.payload } : m)));
      }
      // (التفاعل ليس رسالة: لا يغيّر معاينة القائمة ولا ترتيبها — الترتيب بآخر رسالةٍ فعليّة)
    };

    const onConvUpdate = (p: any) => {
      const c = p?.conversation || (p?.id ? p : null); // يدعم الشكلين: {conversation} أو مسطّحاً
      if (!c) return;
      const patch = inboxChRef.current === 'all' ? c : withoutPreview(c);
      setConvs(prev => prev.map(x => (x.id === c.id ? { ...x, ...patch } : x)));
      if (selIdRef.current === c.id) setConv((prev: any) => ({ ...prev, ...patch }));
    };

    const onDeleted = (d: any) => {
      if (!d?.id) return;
      setMessages(prev => prev.map(m => (m.id === d.id ? { ...m, deletedAt: d.deletedAt, deletedBy: d.deletedBy } : m)));
    };

    const onTranscribed = (p: any) => {
      // التفريغ التلقائيّ يصل بعد ثوانٍ من الرسالة — بلا هذا يبقى «🎤 رسالة صوتية» حتّى إعادة التحميل
      setMessages(prev => prev.map(x => (x.id === p.id
        ? { ...x, body: p.body, payload: { ...(x.payload || {}), transcript: p.transcript, transcribed: true } }
        : x)));
    };
    s.on('wa:message:transcribed', onTranscribed);
    s.on('wa:message:new', onNew);
    s.on('wa:status:update', onStatus);
    s.on('wa:reaction', onReaction);
    s.on('wa:conversation:update', onConvUpdate);
    s.on('wa:message:deleted', onDeleted);
    return () => {
      s.off('wa:message:new', onNew);
      s.off('wa:message:transcribed', onTranscribed);
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
      const sp = new URLSearchParams(window.location.search);
      const id = parseInt(sp.get('conv') || '');
      // 📤 من زرّ واتساب في صفحات اللاعبين والفعاليّات: افتح محادثة الرقم (تُنشأ إن لم تكن)
      const byPhone = sp.get('phone');
      if (byPhone && !id) {
        apiFetch('/api/whatsapp/conversations/open-by-phone', { method: 'POST', body: JSON.stringify({ phone: byPhone }) })
          .then((r: any) => { if (r?.conversation?.id) { setMainTab('chat'); openConv(r.conversation.id); } })
          .catch((e: any) => swalToast(e.message, 'error'));
        window.history.replaceState({}, '', '/admin/whatsapp');
      }
      // `?tab=` كان يصل من إشعار العروض ولا يقرؤه أحد — رابطٌ ميّت منذ إضافته
      const tab = sp.get('tab');
      if (id) {
        setMainTab('chat');
        openConv(id);
      } else if (tab) {
        // روابط قديمة (ثمانية أقسام) تُحوَّل إلى القسم المدموج وتبويبه
        const SEC: Record<string, [Door, AdminSec, (() => void)?]> = {
          rewards: ['reach', 'offers', () => setOffSub('chat')], offers: ['reach', 'offers', () => setOffSub('chat')],
          bookoffers: ['reach', 'offers', () => setOffSub('book')], 'booking-offers': ['reach', 'offers', () => setOffSub('book')],
          broadcast: ['reach', 'cast'], cast: ['reach', 'cast'],
          quality: ['admin', 'perf'], perf: ['admin', 'perf'],
          bot: ['admin', 'don', () => setDonSub('don')], don: ['admin', 'don', () => setDonSub('don')], know: ['admin', 'don', () => setDonSub('know')],
          channels: ['admin', 'numbers', () => setNumSub('channels')], health: ['admin', 'numbers', () => setNumSub('channels')],
          roster: ['admin', 'numbers', () => setNumSub('roster')], contacts: ['admin', 'numbers', () => setNumSub('roster')],
        };
        const hit = SEC[tab];
        if (hit) { setMainTab(hit[0]); setAdminSec(hit[1]); hit[2]?.(); setSecOpen(true); }
      }
      if (id || tab) {
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

  // ── 🎭 الحقن: يُرسل بلسان العميل فيردّ الدون على العميل (نصّك لا يصل العميل) ──
  const injectAsCustomer = useCallback(async () => {
    const text = draft.trim();
    if (!text || !selId || sending) return;
    setSending(true);
    const post = (force: boolean) => apiFetch(`/api/whatsapp/conversations/${selId}/inject`, {
      method: 'POST', body: JSON.stringify({ text, force }),
    });
    try {
      await post(false);
      setDraft('');
      swalToast('🎭 وصلت للدون — ردّه في طريقه للعميل', 'success');
    } catch (e: any) {
      if (e.code === 'BOT_PAUSED') {
        const ok = await swalConfirm(`${e.message}\n\nتجاهل الإيقاف واجعل الدون يردّ الآن؟`, { title: '⏸️ البوت موقوف مؤقتاً', confirmText: 'تجاهل وأرسل' });
        if (ok) {
          try { await post(true); setDraft(''); swalToast('🎭 وصلت للدون', 'success'); }
          catch (e2: any) { swalAlert('تعذّر: ' + e2.message, 'error'); }
        }
      } else {
        swalAlert(e.message, 'warning');
      }
    } finally {
      setSending(false);
    }
  }, [draft, selId, sending]);

  // ── 🖼️ رفع الصورة ──
  /** الرفعُ لحظةَ الاختيار: الخادم يدوّرها بـEXIF ويضغطها JPEG ويمحو بيانات التصوير
   *  ويردّ الحجم النهائيّ — فالشريط يقول ما سيصل العميل لا ما اختاره الموظّف. */
  const pickImage = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    setImgErr(null);
    setImgBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const r = await apiFetch('/api/whatsapp/media/upload', { method: 'POST', body: fd });
      setImg({ url: r.url, bytes: r.bytes, width: r.width, height: r.height });
    } catch (e: any) {
      setImg(null);
      setImgErr(e.message || 'فشل رفع الصورة');   // رسالة الخادم عربيّةٌ أصلاً (النوع/الحجم)
    } finally {
      setImgBusy(false);
    }
  }, []);

  // ── الإرسال ──
  /** الإرسال الفعليّ — `opts.raw` يتخطّى الصياغة (تعطيلٌ يدويّ أو اختيارٌ بعد المراجعة) */
  const doSend = useCallback(async (text: string, opts?: { raw?: boolean; approved?: 'mine' | 'styled' }) => {
    // صورةٌ بلا تعليق رسالةٌ مكتملة — فشرطُ النصّ يسقط حين تكون هناك صورة
    // و`imgBusy` يقفل الطريق الموازي: زرّ الإرسال معطّلٌ أثناء الرفع، لكنّ Enter وبطاقة
    // المراجعة تناديان من هنا مباشرةً — فكان التعليق يُرسل نصّاً وحده وتُفقد الصورة.
    if ((!text && !img) || imgBusy || !selId || sending) return;
    setSending(true);
    try {
      const res = await apiFetch('/api/whatsapp/send', {
        method: 'POST',
        // مع `imageUrl` يصير `text` تعليقَ الصورة في الخادم — ويمرّ بالصياغة كأيّ ردٍّ
        body: JSON.stringify({ conversationId: selId, text, raw: !!opts?.raw, approved: opts?.approved, imageUrl: img?.url }),
      });
      setDraft('');
      setImg(null);
      setImgErr(null);
      setReview(null);
      const chF = inboxChRef.current;
      const shown = !res.message || inView(res.message, chF);
      if (res.message) {
        if (shown && isPendingMsg(res.message)) setPending(prev => (prev.some(m => m.id === res.message.id) ? prev : [...prev, res.message]));
        else if (shown) setMessages(prev => insertByTime(prev, res.message));
        else swalToast(`أُرسلت عبر ${CH_AR[chOf(res.message)]} — تظهر في عرضه أو في «كلا الرقمين»`, 'info');
      }
      if (res.conversation) {
        // ردّ الموظّف يصفّر غير المقروء على الرقمين (كما في الخادم)
        const rc = shown ? res.conversation : withoutPreview(res.conversation);
        setConv((prev: any) => ({ ...prev, ...rc }));
        setConvs(prev => prev.map(c => (c.id === selId ? { ...c, ...rc, unreadCount: 0, unreadWeb: 0 } : c)));
      }
      scrollBottom();
    } catch (e: any) {
      // ⚠️ الحارس أوقفها: الصياغة غيّرت رقماً أو رابطاً — النسختان تعودان للحكم
      if (e.code === 'RESTYLE_REVIEW') setReview({ original: e.body?.original, styled: e.body?.styled, reason: e.body?.reason });
      else if (e.code === 'WINDOW_EXPIRED') swalAlert('نافذة الرد المجانية (24 ساعة) منتهية — لا يمكن الإرسال حتى يراسلك العميل من جديد.', 'warning');
      else swalAlert('فشل الإرسال: ' + e.message, 'error');
    } finally {
      setSending(false);
    }
  }, [selId, sending, scrollBottom, img, imgBusy]);

  const send = useCallback(() => {
    const text = draft.trim();
    if ((!text && !img) || !selId || sending) return;
    if (asCustomer) return injectAsCustomer();
    return doSend(text, { raw: !styleOn });
  }, [draft, selId, sending, asCustomer, injectAsCustomer, doSend, styleOn, img]);

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
    const send = (force: boolean) => apiFetch(`/api/whatsapp/conversations/${conv.id}/bot-toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled: enabling, ...(force ? { force: true } : {}) }),
    });
    try {
      let res: any;
      try { res = await send(false); }
      catch (e: any) {
        // 🔴 محادثةٌ بانتظار ردّ بشريّ: التفعيل يمسح شارة «بحاجة تدخّل» فتختفي من المتابعة — تأكيدٌ ثانٍ بالسبب
        if (e.code !== 'PENDING_ATTENTION') throw e;
        const why = e.body?.reason ? `\n\nسبب التحويل: «${e.body.reason}»` : '';
        const sure = await swalConfirm(
          `هذا العميل طلب الإدارة ولم يردّ عليه أحد بعد.${why}\n\nتفعيل البوت سيمسح شارة «بحاجة تدخّل» وتختفي المحادثة من قائمة المتابعة. الأفضل أن تردّ عليه أوّلاً.`,
          { title: '⚠️ بانتظار ردّ من الإدارة', danger: true, confirmText: 'فعّل رغم ذلك' },
        );
        if (!sure) return;
        res = await send(true);
      }
      setConv((prev: any) => ({ ...prev, ...res.conversation }));
      setConvs(prev => prev.map(c => (c.id === conv.id ? { ...c, ...res.conversation } : c)));
      swalToast(enabling ? 'تم تفعيل البوت ✅' : 'تم إيقاف البوت نهائياً لهذه المحادثة', enabling ? 'success' : 'info');
    } catch (e: any) {
      swalAlert(e.message, 'error');
    }
  }, [conv]);

  // ══════════════════════════════════════════════════════
  // 📣 الرسائل التسويقية لهذا الرقم — بثٌّ ومتابعةٌ وعروضُ حجز (جدول wa_optouts)
  // ══════════════════════════════════════════════════════
  // ردودُ المحادثة والحجوزات وإلغاؤها ليست تسويقاً — تصله في الحالين.
  // 🔴 مَن كتب «إيقاف» بنفسه: تأكيدٌ ثانٍ بالسبب، فإعادتُها بلا طلبه تجلب البلاغات على الرقم.
  const pinChannel = useCallback(async (ch: string) => {
    if (!conv) return;
    try {
      const res = await apiFetch(`/api/whatsapp/conversations/${conv.id}/channel-pin`, { method: 'POST', body: JSON.stringify({ channel: ch || null }) });
      setConvs(prev => prev.map(c => (c.id === conv.id ? { ...c, ...res.conversation } : c)));
      swalToast(ch ? `ثُبّتت: ${ch === 'web' ? 'رقم الأعمال' : 'ميتا'}` : 'عادت تلقائيّة', 'success');
    } catch (e: any) { swalToast(e.message, 'error'); }
  }, [conv]);

  const toggleMarketing = useCallback(async () => {
    if (!conv || !ctx) return;
    const enabling = !!ctx.optedOut;
    const who = conv.displayName || intlPhone(conv.phone);
    const ok = await swalConfirm(
      enabling
        ? `ستعود تصل ${who} رسائلُ البثّ والمتابعة وعروض الحجز.`
        : `لن تصل ${who} رسائلُ البثّ ولا المتابعة ولا عروض الحجز. ردودُ المحادثة والحجوزات وإلغاؤها تبقى تصله.`,
      { title: enabling ? 'تشغيل الرسائل التسويقية؟' : 'إيقاف الرسائل التسويقية؟', danger: !enabling, confirmText: enabling ? 'تشغيل' : 'إيقاف' },
    );
    if (!ok) return;
    const send = (force: boolean) => apiFetch(`/api/whatsapp/conversations/${conv.id}/marketing`, {
      method: 'POST',
      body: JSON.stringify({ enabled: enabling, ...(force ? { force: true } : {}) }),
    });
    try {
      let res: any;
      try { res = await send(false); }
      catch (e: any) {
        if (e.code !== 'CUSTOMER_OPTOUT') throw e;
        const since = e.body?.since ? ` (${fmtWhen(e.body.since)})` : '';
        const sure = await swalConfirm(
          `${who} كتب «إيقاف» بنفسه${since} وطلب ألّا تصله رسائل تسويقيّة.\n\nإعادةُ تشغيلها دون طلبه قد تدفعه للإبلاغ عن الرقم — والبلاغات تخفض تصنيف رقم الواتساب عند ميتا وقد توقفه. شغّلها فقط إن طلب ذلك منك صراحةً.`,
          { title: '⚠️ العميل أوقفها بنفسه', danger: true, confirmText: 'شغّلها رغم ذلك' },
        );
        if (!sure) return;
        res = await send(true);
      }
      setCtx((prev: any) => ({ ...prev, optedOut: res.optedOut, optout: res.optout }));
      swalToast(res.optedOut ? 'أُوقفت الرسائل التسويقية لهذا الرقم' : 'شُغّلت الرسائل التسويقية ✅', res.optedOut ? 'info' : 'success');
    } catch (e: any) {
      swalAlert(e.message, 'error');
    }
  }, [conv, ctx]);

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
    // source: يظهر في «متابعة الحجوزات» بوسيلة التواصل «واتساب» (الخادم يُنشئ صفّ المتابعة)
    await apiFetch('/api/bookings', { method: 'POST', body: JSON.stringify({ ...data, source: 'whatsapp' }) });
    setShowBookingForm(false);
    swalToast('تم إنشاء الحجز ✅', 'success');
    if (selId) apiFetch(`/api/whatsapp/conversations/${selId}/context`).then(setCtx).catch(() => {});
  }, [selId]);

  // ── تعديل آخر حجز من لوحة العميل ──
  // صفّ المتابعة مصدر الحقيقة (تعديله ينعكس على صفّ الحجز)؛ الحجز القديم بلا صفّ متابعة يُعدَّل مباشرة.
  const [editBk, setEditBk] = useState<{ name: string; count: number; notes: string } | null>(null);
  const [bkSaving, setBkSaving] = useState(false);
  const latestBk = ctx?.latestBooking || null;
  const reloadCtx = useCallback(() => {
    if (selId) apiFetch(`/api/whatsapp/conversations/${selId}/context`).then(setCtx).catch(() => {});
  }, [selId]);
  const saveBk = useCallback(async () => {
    if (!latestBk || !editBk) return;
    const name = editBk.name.trim();
    const count = Math.max(1, Math.min(50, Math.round(Number(editBk.count) || 1)));
    if (!name) { swalToast('الاسم مطلوب', 'error'); return; }
    setBkSaving(true);
    try {
      if (latestBk.kind === 'reservation') {
        await apiFetch(`/api/reservations/${latestBk.id}`, { method: 'PUT', body: JSON.stringify({ contactName: name, peopleCount: count, notes: editBk.notes }) });
      } else {
        await apiFetch(`/api/bookings/${latestBk.id}`, { method: 'PUT', body: JSON.stringify({ name, count, notes: editBk.notes }) });
      }
      setEditBk(null);
      swalToast('حُفظ تعديل الحجز', 'success');
      reloadCtx();
    } catch (e: any) { swalToast(e.message, 'error'); }
    finally { setBkSaving(false); }
  }, [latestBk, editBk, reloadCtx]);
  const cancelBk = useCallback(async () => {
    if (!latestBk) return;
    if (!(await swalConfirm(`إلغاء حجز «${latestBk.name}»${latestBk.activityName ? ` في «${latestBk.activityName}»` : ''}؟\nيُحذف من المتابعة ومن قائمة الفعاليّة.`, { danger: true, confirmText: 'ألغِ الحجز', cancelText: 'تراجع' }))) return;
    setBkSaving(true);
    try {
      await apiFetch(latestBk.kind === 'reservation' ? `/api/reservations/${latestBk.id}` : `/api/bookings/${latestBk.id}`, { method: 'DELETE' });
      setEditBk(null);
      swalToast('أُلغي الحجز', 'success');
      reloadCtx();
    } catch (e: any) { swalToast(e.message, 'error'); }
    finally { setBkSaving(false); }
  }, [latestBk, reloadCtx]);

  // ── مشتقات العرض ──
  const paused = conv?.botPausedUntil && new Date(conv.botPausedUntil).getTime() > Date.now();
  const botActive = conv?.botEnabled && !paused;
  // 📱 رقم الأعمال: لا نافذة ولا قفل — الخادم يقول من أين سيخرج الردّ (sendVia)
  // (حدث المقبس يحمل الصفّ الخام بلا sendVia — قناة آخر وارد تكفي حتّى التحديث التالي)
  const viaWeb = conv ? (conv.sendVia ? conv.sendVia === 'web' : conv.channel === 'web') : false;
  const winH = conv ? (viaWeb ? 999 : windowHoursLeft(conv.cloudLastInboundAt ?? conv.lastInboundAt)) : 0;
  const capOver = img ? draft.trim().length - WA_CAPTION_MAX : 0;   // الزائدُ عن حدّ التعليق
  // 🔀 في عرض رقمٍ واحد: «آخر رسالةٍ منه» من ذلك الرقم، وتنبيهٌ إن كان الردّ سيخرج من الرقم الآخر
  //    (المستورد من تاريخ رقم الأعمال لا يضبط عمود آخر وارد — فالاحتياط آخر واردٍ في الخيط المعروض)
  const lastInView = !conv ? null
    : (inboxCh === 'web' ? conv.webLastInboundAt : inboxCh === 'cloud' ? conv.cloudLastInboundAt : conv.lastInboundAt)
      ?? [...messages].reverse().find(m => m.direction === 'in')?.createdAt ?? null;
  const replyElsewhere: 'cloud' | 'web' | null = conv && inboxCh !== 'all' && (viaWeb ? 'web' : 'cloud') !== inboxCh ? (viaWeb ? 'web' : 'cloud') : null;
  const totalUnread = convs.reduce((s, c) => s + viewUnread(c, inboxCh), 0);

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

  const vv = useVisibleViewport();
  const health = useWaHealth(apiFetch, () => { setMainTab('admin'); setAdminSec('numbers'); setNumSub('channels'); setSecOpen(true); });
  // «تمّ التعامل»: يُسقط شارة التحويل للإدارة بعد أن ردّ الموظّف
  const attentionDone = useCallback(async () => {
    if (!conv) return;
    try {
      const r = await apiFetch(`/api/whatsapp/conversations/${conv.id}/attention-done`, { method: 'POST' });
      setConv((prev: any) => ({ ...prev, ...r.conversation }));
      setConvs(prev => prev.map(c => (c.id === conv.id ? { ...c, ...r.conversation } : c)));
      swalToast('أُسقط التنبيه', 'success');
    } catch (e: any) { swalToast(e.message, 'error'); }
  }, [conv]);
  const openByPhone = useCallback((phone: string) => {
    apiFetch('/api/whatsapp/conversations/open-by-phone', { method: 'POST', body: JSON.stringify({ phone }) })
      .then((r: any) => { if (r?.conversation?.id) { setMainTab('chat'); openConv(r.conversation.id); } })
      .catch((e: any) => swalToast(e.message, 'error'));
  }, [openConv]);

  if (user?.role !== 'admin') {
    return (
      <div className="wa wa-page" dir="rtl">
        <Empty icon={<Lock />} title="للأدمن فقط">مركز محادثات واتساب متاح لحسابات الأدمن فقط.</Empty>
      </div>
    );
  }

  const convName = (c: any) => c.playerName || c.displayName || intlPhone(c.phone);
  const goSec = (k: AdminSec) => { setMainTab(ADMIN_SECS.find(s => s.key === k)!.door); setAdminSec(k); setSecOpen(true); };
  // فتح باب: على الحاسوب يُعرض أوّل قسم فيه إن كان القسم الحاليّ من باب آخر؛ على الهاتف تظهر قائمته
  const goDoor = (d: Door) => {
    setMainTab(d); setSecOpen(false);
    if (ADMIN_SECS.find(s => s.key === adminSec)?.door !== d) setAdminSec(ADMIN_SECS.find(s => s.door === d)!.key);
  };
  const door: Door = mainTab === 'chat' ? 'reach' : mainTab;
  const openFromAdmin = (id: number) => { setMainTab('chat'); openConv(id); };
  const secMeta = ADMIN_SECS.find(s => s.key === adminSec);
  const winT = winTone(winH);
  const canReply = winH > 0 || conv?.windowOpen;

  return (
    <div className="wa wa-page" dir="rtl" data-tab={mainTab === 'chat' ? 'chat' : 'admin'} data-pane={mobilePane} data-sec={secOpen ? 'open' : 'menu'} data-kb={vv.keyboard ? '1' : '0'}>
      {/* ═══ الرأس: العنوان، الوارد/الإدارة، شريط الصحّة، كتم التنبيه ═══ */}
      <div className="wa-head">
        <h1>واتساب</h1>
        <div className="wa-seg" role="group" aria-label="أقسام الصفحة">
          <button type="button" aria-pressed={mainTab === 'chat'} onClick={() => setMainTab('chat')}>
            <MessageSquare />الوارد{totalUnread > 0 && <span className="wa-count">{totalUnread}</span>}
          </button>
          <button type="button" aria-pressed={mainTab === 'reach'} onClick={() => goDoor('reach')}><Megaphone />الوصول للناس</button>
          <button type="button" aria-pressed={mainTab === 'admin'} onClick={() => goDoor('admin')}><Settings />الإعدادات</button>
        </div>
        <div className="wa-healthwrap">{health.strip}</div>
        <button type="button" className={`wa-iconbtn${muted ? '' : ' on'}`} onClick={toggleMute}
          aria-label={muted ? 'تشغيل صوت التنبيه' : 'كتم صوت التنبيه'} title={muted ? 'الصوت مكتوم — اضغط للتشغيل' : 'صوت التنبيه يعمل — اضغط للكتم'}>
          {muted ? <BellOff /> : <Bell />}
        </button>
      </div>
      {health.panel}

      {/* ═══ الإدارة ═══ */}
      {mainTab !== 'chat' && (
        <div className="wa-admin">
          {/* الحاسوب: شريط جانبيّ بأقسام الباب المفتوح */}
          <nav className="wa-sidenav" aria-label={DOOR_AR[door]}>
            <div className="grp">{DOOR_AR[door]}</div>
            {ADMIN_SECS.filter(s => s.door === door).map(s => (
              <button type="button" key={s.key} aria-current={adminSec === s.key ? 'page' : undefined} onClick={() => goSec(s.key)}>
                <s.Icon />{s.label}
              </button>
            ))}
          </nav>

          {/* الهاتف: صفحة قائمة كاملة */}
          <div className="wa-adminmenu">
            <div className="wa-card" style={{ padding: 0 }}>
              <div className="wa-menu">
                {ADMIN_SECS.filter(s => s.door === door).map(s => (
                  <button type="button" key={s.key} onClick={() => goSec(s.key)} style={{ minHeight: 64 }}>
                    <s.Icon style={{ color: 'var(--gold)' }} />
                    <span className="grow"><span style={{ display: 'block' }}>{s.label}</span>
                      <span style={{ display: 'block', font: '400 12px/16px var(--font-sans)', color: s.key === 'numbers' && health.webIssue ? 'var(--warn)' : 'var(--ink-3)' }}>{s.key === 'numbers' && health.webIssue ? health.webIssue : s.hint}</span></span>
                    <ChevronLeft style={{ color: 'var(--ink-3)' }} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* الهاتف: شريط القسم المفتوح */}
          <header className="wa-appbar wa-secbar">
            <button type="button" className="wa-iconbtn" aria-label="رجوع للقائمة" onClick={() => setSecOpen(false)}><ChevronRight className="l" /></button>
            <div className="grow"><div className="ttl">{secMeta?.label}</div></div>
            {adminSec === 'don' && <button type="button" className="wa-btn sm" onClick={() => setTryOpen(true)}><FlaskConical />جرّبه</button>}
          </header>

          <div className="wa-content">
            {adminSec === 'cast' && <BroadcastTab apiFetch={apiFetch} />}

            {adminSec === 'offers' && (
              <>
                <Seg block label="نوع العرض" value={offSub} onChange={setOffSub} options={[['book', 'عروض الحجز والسعر المبكّر'], ['chat', 'نقاط الحديث']] as const} />
                {offSub === 'book' ? <BookingOffersTab apiFetch={apiFetch} /> : <RewardsTab apiFetch={apiFetch} />}
              </>
            )}

            {adminSec === 'don' && (
              <>
                <div className="row">
                  <div className="grow"><Seg block label="إعدادات الدون" value={donSub} onChange={setDonSub} options={[['don', 'السلوك والأدوات'], ['know', 'الشخصيّة والمعرفة']] as const} /></div>
                  <button type="button" className="wa-btn wa-only-desk" aria-pressed={tryOpen} onClick={() => setTryOpen(v => !v)}><FlaskConical />جرّب الدون</button>
                </div>
                {/* المكوّن يبقى مركّباً عبر التبويبين فلا يضيع تعديلٌ غير محفوظ */}
                <BotSettingsView section={donSub} onOpenConv={openFromAdmin} tryOpen={tryOpen} onTryClose={() => setTryOpen(false)} />
              </>
            )}

            {adminSec === 'perf' && <PerformanceTab apiFetch={apiFetch} onOpenConv={openFromAdmin} />}

            {adminSec === 'numbers' && (
              <>
                <Seg block label="الأرقام" value={numSub} onChange={setNumSub} options={[['channels', 'القنوات'], ['roster', 'جهات الخطّ']] as const} />
                {numSub === 'channels' ? <ChannelsSection apiFetch={apiFetch} /> : <LineContactsSection apiFetch={apiFetch} onOpenPhone={openByPhone} />}
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ الوارد: ثلاث لوحات على الحاسوب، شاشة لكلّ لوحة على الهاتف ═══ */}
      <div className="wa-panes" style={mainTab === 'chat' ? undefined : { display: 'none' }}>

        {/* ─── القائمة ─── */}
        <div className="wa-pane list">
          <div className="tools">
            <div className="wa-only-desk"><Seg block label="أيّ رقم" value={inboxCh} onChange={setInboxCh}
              options={[['all', 'الرقمان'], ['cloud', <><Cloud style={{ color: 'var(--ch-meta)' }} />ميتا</>], ['web', <><Smartphone style={{ color: 'var(--ch-web)' }} />الأعمال</>]] as const} /></div>
            <div className="row">
              <div className="wa-search grow">
                <Search />
                <input className="wa-input" id="wa-q" value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم أو الرقم" aria-label="بحث في المحادثات" />
              </div>
              <button type="button" className={`wa-iconbtn wa-only-phone${inboxCh !== 'all' || sort !== 'recent' ? ' on' : ''}`} aria-label="تصفية وترتيب" onClick={() => setFilterOpen(true)}><SlidersHorizontal /></button>
            </div>
            <div className="wa-chips">
              {FILTERS.map(f => <Chip key={f.key} on={filter === f.key} onClick={() => setFilter(f.key)} n={counts ? (counts[f.key] ?? 0) : undefined}>{f.label}</Chip>)}
            </div>
            {/* الترتيب — منفصلٌ عن الفلتر، وافتراضيّه «الأحدث» فلا يتغيّر شيءٌ لمن لا يستعمله */}
            <select className="wa-select wa-only-desk" value={sort} onChange={e => setSort(e.target.value)} aria-label="ترتيب المحادثات"
              style={sort === 'recent' ? undefined : { borderColor: 'var(--info)', color: 'var(--info)' }}>
              {SORTS.map(o => <option key={o.key} value={o.key}>{o.key === 'recent' ? o.label : `الترتيب: ${o.label}`}</option>)}
            </select>
          </div>

          <div className="wa-scroll" onScroll={e => { const el = e.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) loadMoreConvs(); }}>
            {loadingConvs ? (
              <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {[0, 1, 2, 3, 4].map(i => <Skel key={i} h={52} />)}
              </div>
            ) : convs.length === 0 ? (
              <Empty icon={<MessageSquare />} title={filter !== 'all' || sort !== 'recent' || q ? 'لا محادثات مطابقة' : 'لا محادثات بعد'}>
                {filter !== 'all' || q ? 'جرّب فلتراً آخر أو امسح البحث.' : 'أوّل رسالة من عميل ستظهر هنا.'}
              </Empty>
            ) : (() => {
              const winMode = WIN_SORTS.includes(sort);
              let lastGroup = '';
              return convs.map(c => {
                const cPaused = c.botPausedUntil && new Date(c.botPausedUntil).getTime() > Date.now();
                const cBot = c.botEnabled && !cPaused;
                const cWeb = c.sendVia ? c.sendVia === 'web' : c.channel === 'web';
                const left = cWeb ? 24 : windowHoursLeft(c.cloudLastInboundAt ?? c.lastInboundAt);
                const tn = winTone(left);
                const head = winMode && tn.group !== lastGroup ? (lastGroup = tn.group) : null;
                const unread = viewUnread(c, inboxCh);
                return (
                  <div key={c.id}>
                    {head && <div className="wa-grouphead" style={{ color: TONE_VAR[tn.tone] }}>{head}</div>}
                    <button type="button" className={`wa-conv${unread > 0 ? ' unread' : ''}`} aria-current={selId === c.id ? 'true' : undefined} onClick={() => openConv(c.id)}>
                      <ConvAvatar c={c} ch={cWeb ? 'web' : 'cloud'} />
                      <span className="grow">
                        <span className="top">
                          <span className="name" dir="auto" style={{ textAlign: 'start' }}>{convName(c)}</span>
                          <span className="when">{fmtWhen(c.lastMessageAt)}</span>
                        </span>
                        <span className="bot">
                          <span className="prev">{c.lastMessagePreview || '—'}</span>
                          {c.needsAttention && <Badge tone="danger" title="حوّلها الدون للإدارة"><Headset />تدخّل</Badge>}
                          <span title={cBot ? 'الدون يردّ' : 'مع موظّف'} style={{ color: cBot ? 'var(--info)' : 'var(--gold)', display: 'inline-flex' }}>{cBot ? <Bot /> : <User />}</span>
                          {unread > 0 && <span className="wa-count">{unread}</span>}
                        </span>
                        {/* النافذة تظهر حين تهمّ فقط: تقترب من الإغلاق أو أُغلقت */}
                        {!cWeb && left <= 4 && (
                          <span className="win">
                            {left > 0 ? <><Meter pct={(left / 4) * 100} tone={tn.tone === 'warn' ? 'warn' : 'danger'} /><span style={{ color: TONE_VAR[tn.tone], fontSize: 12, flex: 'none' }}>{fmtLeft(left)}</span></>
                              : <span>النافذة مغلقة</span>}
                          </span>
                        )}
                      </span>
                    </button>
                  </div>
                );
              });
            })()}
            {!loadingConvs && convs.length > 0 && (
              <div className="wa-foot">
                {loadingMoreConvs ? 'جارٍ تحميل الأقدم…'
                  : convHasMore ? <button type="button" className="wa-more" onClick={loadMoreConvs}>محادثات أقدم</button>
                    : <span className="ltr">{convs.length}</span>}
                {!loadingMoreConvs && !convHasMore && ' محادثة'}
              </div>
            )}
          </div>
        </div>

        {/* ─── المحادثة ─── */}
        <div className="wa-pane chat">
          {!conv ? (
            <Empty icon={<MessageSquare />} title="اختر محادثة">اختر محادثة من القائمة لتقرأها وتردّ.</Empty>
          ) : (
            <>
              <div className="wa-chathead">
                <button type="button" className="wa-iconbtn wa-only-phone" aria-label="رجوع للقائمة" onClick={() => setMobilePane('list')}><ChevronRight className="l" /></button>
                <ConvAvatar c={conv} size="sm" />
                <div className="grow">
                  <div className="nm">
                    <span className="trunc">{convName(conv)}</span>
                    {ctx?.player && <Badge tone="gold">{RANK_AR[ctx.player.rankTier] || ctx.player.rankTier} · <span className="ltr">{ctx.player.rankRR}</span></Badge>}
                    {conv.phoneVerified === false && (
                      <Badge tone="warn" title="واتساب أخفى رقم المرسل ولم يُعرف بعد — أدوات الحساب والأدمن معطّلة لهذه المحادثة حتّى يُعرف"><EyeOff />رقم مخفيّ</Badge>
                    )}
                    {ctx?.optedOut && (
                      <Badge tone="danger" title={ctx.optout?.byCustomer ? `أوقفها العميل بنفسه${ctx.optout?.createdAt ? ` — ${fmtWhen(ctx.optout.createdAt)}` : ''}` : (ctx.optout?.reason || '')}>
                        <Ban />{ctx.optout?.byCustomer ? 'أوقف التسويق' : 'التسويق موقوف'}
                      </Badge>
                    )}
                  </div>
                  <div className="sub ltr" style={{ textAlign: 'start' }}>{intlPhone(conv.phone)}</div>
                </div>
                <div className="acts">
                  {/* حساب اللاعب — للمربوط وحده. لا زرَّ معطّلاً ولا زرّاً يقود إلى لا شيء. */}
                  {ctx?.player ? (
                    <a href={`/admin/players/${ctx.player.id}`} className="wa-btn sm wa-only-desk" title="فتح ملفّ اللاعب في لوحة الإدارة"><User />حساب اللاعب<ExternalLink className="s" /></a>
                  ) : ctx ? (
                    <button type="button" className="wa-btn sm ghost wa-only-desk" onClick={() => { setMobilePane('info'); setShowLink(true); }} title="الرقم غير مربوط بأيّ لاعب"><Link2 />ربط بلاعب</button>
                  ) : null}
                  <button type="button" className="wa-pill" aria-pressed={!!botActive} onClick={() => toggleBot()}
                    title={botActive ? 'الدون يردّ — اضغط لإيقافه لهذه المحادثة' : conv.botEnabled ? 'الدون متوقّف مؤقّتاً — اضغط لإيقافه نهائيّاً' : 'الدون متوقّف — اضغط لتفعيله'}>
                    {botActive ? <Bot /> : <User />}{botActive ? 'الدون يردّ' : 'موظّف'}
                  </button>
                  <button type="button" className={`wa-iconbtn wa-only-narrow${mobilePane === 'info' ? ' on' : ''}`} aria-label="لوحة العميل"
                    onClick={() => setMobilePane(mobilePane === 'info' ? 'chat' : 'info')}><PanelLeft /></button>
                </div>
              </div>

              {/* النافذة — مكانٌ واحد يقولها */}
              {viaWeb ? (
                <div className="wa-winline web">
                  <Smartphone className="s" /><span>يُرسل عبر رقم الأعمال — بلا نافذة{conv.channelPin ? ' (مثبَّت يدويّاً)' : ''}</span>
                  <span className="grow" />
                  <span className="rest wa-only-desk">آخر رسالة منه {fmtWhen(lastInView)}</span>
                </div>
              ) : (
                <div className={`wa-winline ${winT.tone}`}>
                  {winH > 0 ? <Clock className="s" /> : <Lock className="s" />}
                  <span>{winH > 0 ? <>النافذة تُغلق بعد {fmtLeft(winH)}</> : 'النافذة مغلقة'}</span>
                  {winH > 0 ? <Meter pct={(winH / 24) * 100} tone={winT.tone === 'ok' ? undefined : winT.tone === 'warn' ? 'warn' : 'danger'} /> : <span className="grow" />}
                  <span className="rest wa-only-desk">آخر رسالة منه {fmtWhen(lastInView)}</span>
                </div>
              )}

              {replyElsewhere && (
                <Banner flat tone="info" icon={<CornerUpLeft />}>ردّك هنا سيخرج من {CH_AR[replyElsewhere]}، فلن يظهر في هذا العرض (يظهر في «{CH_AR[replyElsewhere]}» و«الرقمان»).</Banner>
              )}
              {conv.botEnabled && paused && (
                <Banner flat tone="warn" icon={<CirclePause />}>الدون متوقّف مؤقّتاً بعد ردّ بشريّ — يعود {fmtTime(conv.botPausedUntil)} (كلّ ردّ يمدّد 30 دقيقة).</Banner>
              )}

              {/* الخيط */}
              <div ref={threadRef} className="wa-thread" onScroll={e => { if (e.currentTarget.scrollTop < 80 && hasMore && !loadingOlder && !loadingMsgs) loadOlder(); }}>
                {hasMore && (
                  loadingOlder ? <div className="wa-day">جارٍ تحميل الأقدم…</div>
                    : <button type="button" className="wa-more" onClick={loadOlder}>رسائل أقدم</button>
                )}
                {loadingMsgs ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <Skel h={44} w="55%" /><Skel h={64} w="70%" /><Skel h={44} w="45%" />
                  </div>
                ) : grouped.map((g, i) => {
                  if (g.type === 'day') return <div key={'d' + i} className="wa-day">{g.label}</div>;
                  const m = g.m;
                  const out = m.direction !== 'in';
                  const inject = !out && m.source === 'injected';
                  const react = m.payload?.customerReaction?.emoji && !m.deletedAt;
                  return (
                    <div key={m.id} className={`wa-msg${out ? ' out' : ''}${inject ? ' inject' : ''}${m.status === 'failed' ? ' failed' : ''}${m.deletedAt ? ' deleted' : ''}${react ? ' has-react' : ''}`}>
                      {/* ليست من العميل فعلاً — الإدارة تكلّمت بلسانه. السجلّ يقول الحقيقة. */}
                      {inject && <div className="who sys"><VenetianMask />بلسان العميل — كتبها {m.payload?.by || 'الإدارة'} (لم تصل العميل)</div>}
                      {out && <SourceTag m={m} />}
                      {m.deletedAt ? (
                        <p>حُذفت من السجلّ بواسطة {m.deletedBy || 'أدمن'}</p>
                      ) : m.msgType === 'audio' && !out ? (
                        <AudioBubble m={m} />
                      ) : ['image', 'sticker'].includes(m.msgType) && !out ? (
                        <ImageBubble m={m} onOpen={setLightbox} />
                      ) : m.msgType === 'image' && out && m.payload?.image?.link ? (
                        // صورةٌ أرسلناها نحن — رابطُنا في الحمولة يكفي، ولا وكيل
                        <OutImageBubble m={m} onOpen={setLightbox} />
                      ) : m.msgType === 'video' && out && m.payload?.video?.link ? (
                        <OutVideoBubble m={m} />
                      ) : ['video', 'document'].includes(m.msgType) && !out ? (
                        <FileBubble m={m} />
                      ) : (
                        <p>{m.body || <span className="muted">[{m.msgType}]</span>}</p>
                      )}
                      <div className="meta">
                        <span className="tools">
                          <button type="button" onClick={() => swalAlert(messageInfoText(m), 'info')} aria-label="معلومات الرسالة" title="معلومات الرسالة"><Info /></button>
                          {!m.deletedAt && (
                            <button type="button" onClick={() => deleteMessage(m)} aria-label="حذف من السجلّ" title="حذف من سجلّنا (لا يمكن سحبها من هاتف العميل)"><Trash2 /></button>
                          )}
                        </span>
                        {m.channel === 'web' && <span title="عبر رقم الأعمال" style={{ color: 'var(--ch-web)', display: 'inline-flex' }}><Smartphone /></span>}
                        <span>{fmtTime(m.createdAt)}</span>
                        {out && <Ticks status={m.status} />}
                      </div>
                      {m.status === 'failed' && m.errorMessage && <div className="err">{m.errorMessage}</div>}
                      {react && <span className="react" title={`تفاعل العميل ${fmtTime(m.payload.customerReaction.at)}`}>{m.payload.customerReaction.emoji}</span>}
                    </div>
                  );
                })}
                {!loadingMsgs && conv.needsAttention && (
                  <div className="wa-handoff"><Headset /><span>حوّلها الدون للإدارة — تنتظر ردّ موظّف</span><button type="button" className="wa-btn sm" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={attentionDone}><Check />تمّ التعامل</button></div>
                )}
                {!loadingMsgs && pending.length > 0 && (
                  <>
                    <div className="wa-day" style={{ color: 'var(--warn)' }}>في الطابور — لم تُرسل بعد (<span className="ltr">{pending.length}</span>)</div>
                    {pending.map(m => (
                      <div key={m.id} className="wa-msg out pending">
                        <p>{m.body || `[${m.msgType}]`}</p>
                        <div className="meta">
                          {m.msgType === 'video' ? <Video /> : m.msgType === 'image' ? <ImageIcon /> : null}
                          <span>{m.source === 'broadcast' ? 'بثّ' : m.source === 'staff' ? 'موظّف' : m.source === 'bot' ? 'الدون' : m.source} · {m.status === 'sending' ? 'يُرسل الآن…' : 'ينتظر دوره'}</span>
                          <Clock />
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* الردّ */}
              {canReply ? (
                <div className={`wa-composer${asCustomer ? ' inject' : ''}`}>
                  {/* بطاقة المراجعة — تظهر حين يمسك الحارس تفصيلاً تغيّر */}
                  {review && (
                    <div className="wa-review" role="alert">
                      <b style={{ color: 'var(--danger)', font: '700 13px/18px var(--font-sans)', display: 'flex', gap: 6, alignItems: 'center' }}><TriangleAlert />{review.reason} — لم تُرسل</b>
                      <div className="q"><small>نصّك</small>{review.original}</div>
                      <div className="q don"><small>صياغة الدون</small>{review.styled}</div>
                      <div className="row" style={{ flexWrap: 'wrap' }}>
                        <button type="button" className="wa-btn sm primary grow" disabled={sending} onClick={() => doSend(review.original, { raw: true, approved: 'mine' })}>أرسل نصّي</button>
                        <button type="button" className="wa-btn sm grow" disabled={sending} onClick={() => doSend(review.styled, { raw: true, approved: 'styled' })}>أرسل الصياغة</button>
                        <button type="button" className="wa-btn sm ghost" onClick={() => { setDraft(review.original); setReview(null); }}>عدّل</button>
                      </div>
                    </div>
                  )}
                  {/* الصورة المرحَّلة — مرفوعةٌ فعلاً، وما يُكتب أدناه تعليقُها */}
                  {(img || imgBusy || imgErr) && (
                    <div className="wa-attach">
                      {imgBusy ? <div className="thumb wa-skel" /> : img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`${API_URL}${img.url}`} alt="الصورة المرفقة" className="thumb" style={{ objectFit: 'cover', cursor: 'zoom-in' }} onClick={() => setLightbox(`${API_URL}${img.url}`)} />
                      ) : null}
                      <div className="grow" style={{ font: '500 13px/18px var(--font-sans)' }}>
                        {imgBusy ? <span className="muted">تُرفع وتُضغط…</span>
                          : imgErr ? <span style={{ color: 'var(--danger)' }}>{imgErr}</span>
                            : img ? (
                              <>
                                <div style={{ color: 'var(--ok)', fontWeight: 700 }}>صورة جاهزة · <span className="ltr">{Math.round(img.bytes / 1024)}</span> ك.ب{img.width ? <> · <span className="ltr">{img.width}×{img.height}</span></> : null}</div>
                                <div style={{ color: capOver > 0 ? 'var(--danger)' : 'var(--ink-3)', fontSize: 12 }}>
                                  {capOver > 0 ? `التعليق أطول من ${WA_CAPTION_MAX} حرفاً بـ${capOver} — سيُقصّ` : 'ما تكتبه أدناه يصير تعليقها — رسالة واحدة'}
                                </div>
                              </>
                            ) : null}
                      </div>
                      {!imgBusy && <button type="button" className="wa-iconbtn" aria-label="إزالة الصورة" onClick={() => { setImg(null); setImgErr(null); }}><X /></button>}
                    </div>
                  )}
                  <div className="line">
                    {/* «+»: الصورة و«بلسان العميل» — النادر والملتبس لا يجاور زرّ الإرسال */}
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png" hidden tabIndex={-1}
                      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; pickImage(f); }} />
                    <div style={{ position: 'relative' }}>
                      <button type="button" className={`wa-iconbtn${plusOpen || img ? ' on' : ''}${asCustomer ? ' violet on' : ''}`} aria-label="المزيد" aria-expanded={plusOpen} onClick={() => setPlusOpen(v => !v)}>{plusOpen ? <X /> : <Plus />}</button>
                      {plusOpen && (
                        <div className="wa-plusmenu wa-menu" role="menu">
                          <button type="button" role="menuitem" disabled={asCustomer || imgBusy || sending} onClick={() => { setPlusOpen(false); fileRef.current?.click(); }}>
                            <ImageIcon /><span className="grow"><span style={{ display: 'block' }}>صورة</span><span className="hint">JPG أو PNG — تصل مع تعليقها رسالة واحدة</span></span>
                          </button>
                          <button type="button" role="menuitem" disabled={!!img || imgBusy} onClick={() => { setPlusOpen(false); setAsCustomer(v => !v); }}>
                            <VenetianMask style={{ color: 'var(--violet)' }} /><span className="grow"><span style={{ display: 'block' }}>{asCustomer ? 'أوقف «بلسان العميل»' : 'بلسان العميل'}</span><span className="hint">نصّك لا يصل العميل — الدون يردّ عليه بدلاً منك</span></span>
                          </button>
                        </div>
                      )}
                    </div>
                    {/* إطفاءُ الصياغة لهذه الرسالة — للروابط وأرقام الحوالات ورموز التحقّق */}
                    {!asCustomer && (
                      <button type="button" className={`wa-iconbtn violet${styleOn ? ' on' : ''}`} onClick={() => setStyleOn(v => !v)}
                        aria-label="صياغة الدون" aria-pressed={styleOn}
                        title={styleOn ? 'الدون يعيد صياغة ردّك بصوته — اضغط لإرسال نصّك حرفيّاً' : 'الصياغة معطّلة لهذه الرسالة — اضغط لإعادتها'}><Sparkles /></button>
                    )}
                    <textarea
                      id="wa-draft" rows={Math.min(5, Math.max(1, draft.split('\n').length))} value={draft} disabled={sending}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                      placeholder={asCustomer ? 'اكتب بلسان العميل — الدون يردّ عليه' : img ? 'تعليق الصورة (اختياريّ)' : 'اكتب ردّاً'}
                      aria-label="نصّ الردّ"
                    />
                    <button type="button" className="sendbtn" onClick={send} disabled={sending || imgBusy || (!draft.trim() && !img)}
                      aria-label={asCustomer ? 'أرسل للدون' : 'إرسال'} style={sending || imgBusy || (!draft.trim() && !img) ? { opacity: 0.45 } : undefined}>
                      <Send style={{ transform: 'scaleX(-1)' }} />
                    </button>
                  </div>
                  <div className="mode" style={asCustomer || styleOn ? { color: 'var(--violet)' } : undefined}>
                    {asCustomer ? <><VenetianMask />نصّك لا يصل العميل — يصل الدون كأنّه كلام العميل، والعميل يستقبل ردّ الدون.</>
                      : sending && styleOn ? <><Sparkles />يصوغها الدون…</>
                        : styleOn ? <><Sparkles />الدون يعيد صياغة ردّك قبل إرساله، بلا إضافة معلومة · الردّ اليدويّ يوقف الدون 30 دقيقة</>
                          : <>تُرسل بنصّك حرفيّاً · الردّ اليدويّ يوقف الدون 30 دقيقة</>}
                  </div>
                </div>
              ) : (
                <div className="wa-composer">
                  <Banner tone="danger" icon={<Lock />}>
                    <b>نافذة الردّ المجّانيّة (24 ساعة) منتهية.</b> {health.webReady ? 'رقم الأعمال يصل بلا نافذة.' : 'انتظر رسالة جديدة من العميل، أو اربط رقم الأعمال من «الإعدادات ← الأرقام» فيصل بلا نافذة.'}
                  </Banner>
                  {health.webReady && <button type="button" className="wa-btn primary block" onClick={() => pinChannel('web')}><Smartphone />أرسل من رقم الأعمال</button>}
                </div>
              )}
            </>
          )}
        </div>

        {/* ─── لوحة العميل ─── */}
        <div className="wa-pane info">
          {!conv ? (
            <Empty icon={<User />} title="لا محادثة مختارة" />
          ) : (
            <>
              <header className="wa-appbar wa-only-narrow">
                <button type="button" className="wa-iconbtn" aria-label="رجوع للمحادثة" onClick={() => setMobilePane('chat')}><ChevronRight className="l" /></button>
                <div className="grow"><div className="ttl">لوحة العميل</div><div className="sub trunc">{convName(conv)}</div></div>
              </header>
              <div className="wa-scroll">
                {/* الإجراءات أوّلاً — أكثرها استعمالاً */}
                <div className="wa-sec">
                  <button type="button" className="wa-btn primary block" onClick={openBooking}><CalendarPlus />حجز جديد</button>
                  <div className="row">
                    {ctx?.player && <a href={`/admin/players/${ctx.player.id}`} className="wa-btn grow"><User />ملفّ اللاعب</a>}
                    <button type="button" className="wa-btn grow" onClick={() => { navigator.clipboard?.writeText(intlPhone(conv.phone)); swalToast('نُسخ الرقم', 'success'); }}><Copy />نسخ الرقم</button>
                  </div>
                </div>

                {/* التحكّم: الدون، التسويق، رقم الإرسال */}
                <div className="wa-sec" style={{ paddingBlock: 'var(--space-1)', gap: 0 }}>
                  <Setting title="الدون يردّ" hint={conv.botEnabled ? (paused ? `متوقّف مؤقّتاً حتّى ${fmtTime(conv.botPausedUntil)}` : 'يردّ على هذه المحادثة') : 'متوقّف نهائيّاً لهذه المحادثة'}>
                    <Toggle on={!!conv.botEnabled} onChange={() => toggleBot()} label="الدون يردّ على هذه المحادثة" />
                  </Setting>
                  <Setting title="الرسائل التسويقيّة" hint={!ctx ? '…' : ctx.optedOut ? 'موقوفة عن هذا الرقم' : 'تصل هذا الرقم'}>
                    <Toggle on={!!ctx && !ctx.optedOut} onChange={() => toggleMarketing()} disabled={!ctx} label="الرسائل التسويقيّة تصل هذا الرقم" />
                  </Setting>
                  {(conv.sendVia || conv.channelPin) && (
                    <Setting title="رقم الإرسال" hint="من أيّ رقم يخرج الردّ">
                      <select className="wa-select" style={{ width: 150 }} value={conv.channelPin || ''} onChange={e => pinChannel(e.target.value)} aria-label="رقم الإرسال لهذه المحادثة">
                        <option value="">{conv.sendVia === 'web' ? 'تلقائيّ (الأعمال)' : 'تلقائيّ (ميتا)'}</option>
                        <option value="web">ثبّت: الأعمال</option>
                        <option value="cloud">ثبّت: ميتا</option>
                      </select>
                    </Setting>
                  )}
                </div>

                {/* اللاعب المرتبط */}
                <div className="wa-sec">
                  <h3><User />اللاعب المرتبط{ctx?.player && <small style={{ color: 'var(--ok)' }}>مربوط</small>}</h3>
                  {!ctx ? <Skel h={56} /> : ctx.player ? (
                    <>
                      <div className="row" style={{ gap: 'var(--space-3)' }}>
                        <span className="wa-avatar lg linked">
                          {ctx.player.avatarUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={`${API_URL}${ctx.player.avatarUrl}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                            : ctx.player.name.charAt(0)}
                        </span>
                        <div className="grow">
                          <div className="row"><b className="trunc" style={{ font: '700 16px/22px var(--font-sans)' }}>{ctx.player.name}</b>{ctx.player.isFree && <Badge tone="info">مجّانيّ</Badge>}</div>
                          <div className="muted" style={{ font: '500 12px/16px var(--font-sans)' }}>لاعب <span className="ltr">#{ctx.player.id}</span>{ctx.player.lastActiveAt && <> · آخر نشاط {fmtWhen(ctx.player.lastActiveAt)}</>}</div>
                        </div>
                      </div>
                      <div className="wa-xpbox">
                        <div className="wa-kv"><span style={{ color: 'var(--gold)', fontWeight: 700 }}>{RANK_AR[ctx.player.rankTier] || ctx.player.rankTier}</span><b className="ltr">{ctx.player.rankRR}{ctx.player.rrRequired ? ` / ${ctx.player.rrRequired}` : ''} RR</b></div>
                        <div className="wa-kv"><span>مستوى <span className="ltr">{ctx.player.level}</span></span><b className="ltr">{ctx.player.xp}{ctx.player.nextLevelXP ? ` / ${ctx.player.nextLevelXP}` : ''} XP</b></div>
                        {typeof ctx.player.xpProgress === 'number' && <Meter pct={ctx.player.xpProgress} tone="gold" />}
                      </div>
                      {/* أداء الموسم الحالي — مطابق لصفحة التصنيف بواجهة اللاعب */}
                      <div className="row muted" style={{ font: '500 12px/16px var(--font-sans)' }}><span className="grow">الموسم الحاليّ</span><span>مدى الحياة: <b className="ltr">{ctx.player.lifetimeMatches ?? 0}</b> مباراة</span></div>
                      <div className="wa-grid3" style={{ gap: 'var(--space-2)' }}>
                        <Tile k="مباراة" v={ctx.player.totalMatches ?? 0} />
                        <Tile k="فوز" v={ctx.player.totalWins ?? 0} tone="ok" />
                        <Tile k="نسبة الفوز" v={`${ctx.player.winRate ?? 0}%`} tone="gold" />
                      </div>
                      {ctx.player.favoriteRole && (
                        <div className="wa-kv"><span>الأكثر لعباً (كلّ المواسم)</span><b style={{ color: 'var(--violet)' }}>{ROLE_AR[ctx.player.favoriteRole] || ctx.player.favoriteRole}</b></div>
                      )}
                      <button type="button" className="wa-btn sm ghost" onClick={() => linkPlayer(null)}><Unlink />فكّ الربط</button>
                    </>
                  ) : (
                    <>
                      <p className="muted" style={{ margin: 0, font: '400 14px/22px var(--font-sans)' }}>الرقم غير مربوط بأيّ لاعب مسجَّل.</p>
                      {!showLink ? (
                        <button type="button" className="wa-btn" onClick={() => setShowLink(true)}><Link2 />ربط يدويّ بلاعب</button>
                      ) : (
                        <>
                          <div className="wa-search">
                            <Search />
                            <input className="wa-input" id="wa-linkq" value={linkQ} onChange={e => setLinkQ(e.target.value)} placeholder="ابحث بالاسم أو الرقم" aria-label="بحث عن لاعب للربط" autoFocus />
                          </div>
                          <div className="wa-list" style={{ maxHeight: 220, overflowY: 'auto' }}>
                            {linkResults.map(p => (
                              <button type="button" key={p.id} onClick={() => linkPlayer(p.id)} style={{ border: 0, borderBottom: '1px solid var(--line)', background: 'transparent', color: 'inherit', cursor: 'pointer', textAlign: 'start', width: '100%' }}>
                                <span className="t"><b>{p.name}</b><span className="ltr">{p.phone}</span></span>
                                {RANK_AR[p.rankTier] && <Badge tone="gold">{RANK_AR[p.rankTier]}</Badge>}
                              </button>
                            ))}
                          </div>
                          {linkQ.trim().length >= 2 && linkResults.length === 0 && <span className="muted" style={{ font: '500 12px/16px var(--font-sans)' }}>لا نتائج</span>}
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* آخر الحجوزات */}
                <div className="wa-sec">
                  <h3><Ticket />آخر الحجوزات{ctx?.bookings?.length ? <small className="ltr">{ctx.bookings.length}</small> : null}</h3>
                  {latestBk && (
                    <div className="wa-xpbox">
                      <div className="row">
                        <b className="grow trunc" style={{ font: '700 14px/20px var(--font-sans)' }}>{latestBk.activityName || 'حجز بلا فعاليّة'}</b>
                        {latestBk.kind === 'reservation' && <Badge tone={latestBk.status === 'confirmed' || latestBk.status === 'paid_all' ? 'ok' : latestBk.status === 'waitlist' ? 'info' : 'warn'}>{latestBk.status === 'confirmed' || latestBk.status === 'paid_all' ? 'مثبَّت' : latestBk.status === 'waitlist' ? 'قائمة انتظار' : 'غير مثبَّت'}</Badge>}
                      </div>
                      <div className="muted" style={{ font: '500 12px/16px var(--font-sans)' }}>
                        {latestBk.activityDate ? fmtDay(latestBk.activityDate) + ' · ' + fmtTime(latestBk.activityDate) : 'بلا موعد'}
                        {latestBk.activityDate && new Date(latestBk.activityDate).getTime() < Date.now() ? ' · انتهت' : ''}
                      </div>
                      <div className="wa-kv"><span>باسم {latestBk.name}</span><b><span className="ltr">{latestBk.count}</span> {Number(latestBk.count) === 1 ? 'شخص' : 'أشخاص'}</b></div>
                      {latestBk.notes && <div className="muted" style={{ font: '400 13px/20px var(--font-sans)', whiteSpace: 'pre-wrap' }}>{latestBk.notes}</div>}
                      <button type="button" className="wa-btn block" onClick={() => setEditBk({ name: latestBk.name || '', count: Number(latestBk.count) || 1, notes: latestBk.notes || '' })}><Pencil />عدّل آخر حجز</button>
                    </div>
                  )}
                  {!ctx ? <Skel h={40} /> : ctx.bookings?.length ? (
                    <div className="wa-list">
                      {ctx.bookings.map((b: any) => (
                        <div key={b.id}>
                          <span className="t"><b>{b.name} × <span className="ltr">{b.count}</span></b><span>{fmtWhen(b.createdAt)}</span></span>
                          <Badge tone={b.isFree ? 'info' : b.isPaid ? 'ok' : 'danger'}>{b.isFree ? 'مجّانيّ' : b.isPaid ? 'مدفوع' : 'غير مدفوع'}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : !latestBk ? <span className="muted" style={{ font: '400 14px/22px var(--font-sans)' }}>لا حجوزات سابقة.</span> : null}
                </div>

                {/* الملاحظات الدائمة */}
                <div className="wa-sec">
                  <h3><NotebookPen />ملاحظات دائمة<small>ذاكرة الدون والإدارة</small></h3>
                  {ctx?.notes?.length ? ctx.notes.map((n: any) => (
                    <div key={n.id} className="wa-banner" style={{ flexDirection: 'column', gap: 2 }}>
                      <span style={{ color: 'var(--ink)' }}>{n.note}</span>
                      <span className="muted" style={{ fontSize: 12 }}>{n.source === 'bot' ? 'الدون' : 'الإدارة'} · {fmtWhen(n.createdAt)}</span>
                    </div>
                  )) : <span className="muted" style={{ font: '400 14px/22px var(--font-sans)' }}>لا ملاحظات بعد.</span>}
                  <div className="row">
                    <input className="wa-input grow" id="wa-note" value={noteDraft} onChange={e => setNoteDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addNote(); }} placeholder="ملاحظة جديدة" aria-label="ملاحظة جديدة" />
                    <button type="button" className="wa-btn" onClick={addNote} disabled={!noteDraft.trim()}>حفظ</button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══ الهاتف: شريط التنقّل السفليّ ═══ */}
      <nav className="wa-tabbar wa-phonebar" aria-label="تنقّل واتساب">
        <button type="button" aria-current={mainTab === 'chat' ? 'page' : undefined} onClick={() => { setMainTab('chat'); setMobilePane('list'); }}>
          <MessageSquare className="l" />الوارد{totalUnread > 0 && <span className="wa-count">{totalUnread}</span>}
        </button>
        <button type="button" aria-current={mainTab === 'reach' ? 'page' : undefined} onClick={() => goDoor('reach')}>
          <Megaphone className="l" />الوصول
        </button>
        <button type="button" aria-current={mainTab === 'admin' ? 'page' : undefined} onClick={() => goDoor('admin')}>
          <Settings className="l" />الإعدادات
        </button>
      </nav>

      {/* ═══ مكبِّر الصورة ═══ */}
      {lightbox && (
        <div className="wa-lightbox" onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label="الصورة مكبَّرة">
          <header className="wa-appbar" onClick={e => e.stopPropagation()}>
            <button type="button" className="wa-iconbtn" aria-label="إغلاق" onClick={() => setLightbox(null)} style={{ color: 'var(--ink)' }}><X className="l" /></button>
            <div className="grow"><div className="ttl">{conv ? convName(conv) : 'صورة'}</div></div>
            <a href={lightbox} download="wa-image" className="wa-iconbtn" aria-label="تنزيل الصورة" style={{ color: 'var(--ink)' }}><Download className="l" /></a>
          </header>
          <div className="stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox} alt="" onClick={e => e.stopPropagation()} />
          </div>
        </div>
      )}

      {/* ═══ الهاتف: التصفية والترتيب ═══ */}
      {filterOpen && (
        <Pop title="تصفية وترتيب" onClose={() => setFilterOpen(false)} label="تصفية وترتيب">
          <Field label="أيّ رقم">
            <Seg block label="أيّ رقم" value={inboxCh} onChange={setInboxCh}
              options={[['all', 'الرقمان'], ['cloud', <><Cloud style={{ color: 'var(--ch-meta)' }} />ميتا</>], ['web', <><Smartphone style={{ color: 'var(--ch-web)' }} />الأعمال</>]] as const} />
          </Field>
          <Field label="الترتيب" htmlFor="wa-sort-m">
            <select className="wa-select" id="wa-sort-m" value={sort} onChange={e => setSort(e.target.value)}>
              {SORTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </Field>
          <div className="acts">
            <button type="button" className="wa-btn ghost" onClick={() => { setInboxCh('all'); setSort('recent'); }}>أعد الافتراضيّ</button>
            <button type="button" className="wa-btn primary" onClick={() => setFilterOpen(false)}>تمّ</button>
          </div>
        </Pop>
      )}

      {/* ═══ تعديل آخر حجز ═══ */}
      {mainTab === 'chat' && editBk && latestBk && (
        <Pop title="تعديل الحجز" onClose={() => { if (!bkSaving) setEditBk(null); }} label="تعديل الحجز">
          <p className="muted" style={{ margin: 0, font: '400 14px/22px var(--font-sans)' }}>
            {latestBk.activityName || 'حجز بلا فعاليّة'}{latestBk.activityDate ? ` · ${fmtDay(latestBk.activityDate)} ${fmtTime(latestBk.activityDate)}` : ''}
          </p>
          <Setting title="عدد الأشخاص" hint="يشمل صاحب الحجز.">
            <div className="row">
              <button type="button" className="wa-iconbtn" style={{ border: '1px solid var(--line-strong)' }} aria-label="أنقص" disabled={editBk.count <= 1} onClick={() => setEditBk({ ...editBk, count: Math.max(1, editBk.count - 1) })}><Minus /></button>
              <b className="ltr" style={{ fontSize: 20, minWidth: 28, textAlign: 'center' }}>{editBk.count}</b>
              <button type="button" className="wa-iconbtn" style={{ border: '1px solid var(--line-strong)' }} aria-label="زِد" disabled={editBk.count >= 50} onClick={() => setEditBk({ ...editBk, count: editBk.count + 1 })}><Plus /></button>
            </div>
          </Setting>
          <Field label="الاسم" htmlFor="wa-bk-name"><input className="wa-input" id="wa-bk-name" value={editBk.name} onChange={e => setEditBk({ ...editBk, name: e.target.value })} /></Field>
          <Field label="ملاحظات" htmlFor="wa-bk-notes"><textarea className="wa-textarea" id="wa-bk-notes" value={editBk.notes} onChange={e => setEditBk({ ...editBk, notes: e.target.value })} style={{ minHeight: 72 }} /></Field>
          {latestBk.activityDate && new Date(latestBk.activityDate).getTime() < Date.now() && <Banner tone="warn" icon={<TriangleAlert />}>هذه الفعاليّة انتهت — التعديل يغيّر السجلّ فقط.</Banner>}
          <div className="acts">
            <button type="button" className="wa-btn danger" disabled={bkSaving} onClick={cancelBk}><Trash2 />ألغِ الحجز</button>
            <button type="button" className="wa-btn primary" disabled={bkSaving || !editBk.name.trim()} onClick={saveBk}>{bkSaving ? 'يحفظ…' : 'حفظ'}</button>
          </div>
        </Pop>
      )}

      {/* ═══ الحجز الجديد — لوح سفليّ على الهاتف، نافذة على الحاسوب ═══ */}
      {mainTab === 'chat' && showBookingForm && bkData && conv && (
        <Pop wide onClose={() => setShowBookingForm(false)} label="حجز جديد">
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
        </Pop>
      )}
    </div>
  );
}
