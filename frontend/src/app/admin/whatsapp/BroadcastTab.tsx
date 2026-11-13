'use client';

// ══════════════════════════════════════════════════════
// 📢 تبويب البثّ — رسالة واحدة لمن نافذتهم (24 ساعة) ما زالت مفتوحة
// القيود كلّها في الخادم (whatsapp-broadcast.service): هذه الواجهة تعرضها ولا تفرضها.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getSocket } from '@/lib/socket';
import Swal from 'sweetalert2';
import { swalAlert, swalConfirm, swalToast } from '@/lib/swal';
import BroadcastHistory from './BroadcastHistory';
import PlayedActivityPicker from './PlayedActivityPicker';
import {
  Ban, CalendarCheck, Check, ChevronDown, ChevronUp, CircleCheck, CircleStop, Cloud, Dice5, DoorOpen, FileText, FlaskConical, Globe, Hand,
  History, Hourglass, Image as ImageIcon, Info, Loader2, Megaphone, PenLine, Play, RotateCw, Save, Search, SlidersHorizontal, Smartphone,
  Square, SquareCheck, Ticket, Trash2, TriangleAlert, Users, Video, type LucideIcon,
} from 'lucide-react';
import { Banner, Chip, Field, Meter, PageHead, Pop, Seg, Setting, Toggle } from './wa-ui';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;
type Filter = 'all' | 'players' | 'visitors' | 'booked_upcoming' | 'activity' | 'not_booked_activity' | 'played';
interface Tpl { id: number; name: string; body: string; usedCount: number }
interface Target { id: number; phone: string; name: string; isPlayer: boolean; rank: string; windowClosesAt: string | null; via?: 'cloud' | 'web' | null }

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'الكلّ' },
  { key: 'players', label: 'لاعبون مسجّلون' },
  { key: 'visitors', label: 'زوّار غير مسجّلين' },
  { key: 'booked_upcoming', label: 'لهم حجز قادم' },
  { key: 'activity', label: 'حاجزو فعاليّة محدّدة' },
  { key: 'not_booked_activity', label: 'لم يحجزوا بعد في فعاليّة' },
  { key: 'played', label: '🎲 لعبوا معنا في فعاليّة سابقة' },
];
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';   // `/uploads` من الخادم؛ البادئة للتطوير (النشر يتركها فارغةً ويحوّل next.config)
// 📇 فلتر خطّ الأعمال: مَن نراسله ابتداءً — '' يتبع الافتراضيّ العامّ من «القنوات»
const LINE_OPTS: Array<{ key: '' | 'all' | 'warm' | 'two_way'; label: string }> = [
  { key: '', label: 'الافتراضيّ' },
  { key: 'all', label: 'الكلّ' },
  { key: 'warm', label: 'له خيطٌ معنا (ولو منّا فقط)' },
  { key: 'two_way', label: 'راسَلنا (في أيّ وقت)' },
];

// ══════════════════════════════════════════════════════
// ✂️ حدود النصّ — كلّها مرآةٌ لما يفرضه الخادم، لا اجتهادَ هنا
// ══════════════════════════════════════════════════════
const BODY_MAX = 900;                                    // حدّ النصّ (whatsapp-broadcast.service)
const CAPTION_MAX = 1024;                                // حدّ واتساب لتعليق الصورة (WA_CAPTION_MAX)
const OPTOUT_FOOTER = '\n\n— لإيقاف هذه الرسائل أرسل: إيقاف';   // نصّاً بنصّ كما في الخادم
const VAR_SLACK = 60;                                    // هامشُ الخادم لتوسّع المتغيّرات عند الإرسال
// 🖼️ الخادم يسجّل صورةَ البثّ سطراً أوّلَ في نصّه المحفوظ (`🖼️ /uploads/...`)؛ نفصله كي
//    لا يظهر مسارُ ملفٍّ في السجلّ مكانَ الرسالة.
const bodyOf = (raw: any) => {
  const t = String(raw || '');
  const m = /^(🖼️|🎬) \/uploads\/wa-out\/[\w.-]+\n?/.exec(t);
  return m ? `${m[1]} ${t.slice(m[0].length)}` : t;
};
const VIDEO_MAX_MB = 16;                                 // حدّ واتساب للفيديو (ميتا والجلسة معاً)

const ACT_VARS = /\{(الفعالية|المكان|الموقع|الموعد)\}/;
function fill(body: string, t: { name: string; rank: string; activity?: string; venue?: string; place?: string; when?: string }) {
  const first = (t.name || '').trim().split(/\s+/)[0] || '';
  return body
    .replace(/\{الاسم\}/g, first)
    .replace(/\{الاسم_الكامل\}/g, t.name || '')
    .replace(/\{الرتبة\}/g, t.rank || '')
    .replace(/\{الفعالية\}/g, t.activity || '⟨اختر فعاليّة⟩')
    .replace(/\{الموقع\}/g, t.place || t.venue || '⟨الموقع⟩')
    .replace(/\{المكان\}/g, t.venue || '⟨المكان⟩')
    .replace(/\{الموعد\}/g, t.when || '⟨الموعد⟩');
}
function hoursLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'أُغلقت';
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
  return h ? `${h}س ${m}د` : `${m}د`;
}
const fmt = (iso: string) => new Date(iso).toLocaleString('ar-JO-u-nu-latn', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' });

export default function BroadcastTab({ apiFetch }: { apiFetch: Fetcher }) {
  const [filter, setFilter] = useState<Filter>('all');
  // 🔀 القناة: الكلّ / ميتا (نافذة مفتوحة) / رقم الأعمال (بلا نافذة)
  const [channel, setChannel] = useState<'all' | 'cloud' | 'web'>('all');
  // 📇 فلتر خطّ الأعمال ('' = الافتراضيّ العامّ) — يضيّق مستلمي رقم الأعمال وحدهم
  const [line, setLine] = useState<'' | 'all' | 'warm' | 'two_way'>('');
  // ⏱️ «راسَلنا منذ…» — مع two_way وحده: '' أيّ وقت · '7'/'30'/'90' أيّام · YYYY-MM-DD تاريخ
  const [lineSince, setLineSince] = useState('');
  const since = line === 'two_way' ? lineSince : '';
  const [aud, setAud] = useState<any>(null);
  const [activityId, setActivityId] = useState<number | null>(null);
  // 🎲 «لعبوا معنا»: الفعاليّات السابقة المختارة، و«ولم يحجزوا بعد في» الفعاليّة القادمة (activityId)
  const [playedIds, setPlayedIds] = useState<number[]>([]);
  const [playedNotBooked, setPlayedNotBooked] = useState(true);
  const [rows, setRows] = useState<Target[]>([]);
  const [activities, setActivities] = useState<Array<{ id: number; name: string; date: string; venue?: string; when?: string }>>([]);
  const [status, setStatus] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyTick, setHistoryTick] = useState(0);   // 📜 يُحدّث السجلّ مع كلّ تحميلٍ للتبويب
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [body, setBody] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [footer, setFooter] = useState(true);
  // 🖼️/🎬 وسيطٌ اختياريّ للبثّ (صورة أو فيديو MP4): يُرفع هنا مرّةً فيصير رابطاً، ويرفعه الخادم
  //    لميتا مرّةً واحدة ويُعيد استعمال معرّفه لكلّ مستلم. والنّصّ يصير تعليقه في الحالين.
  const [img, setImg] = useState<{ url: string; bytes: number; kind: 'image' | 'video' } | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  // 🧪 آخر اختبارٍ ناجح: بصمة المحتوى الذي اختُبر + متى + لمن
  const [tested, setTested] = useState<{ sig: string; at: number; sentTo: Array<{ name: string; phone: string; ok: boolean; error?: string }> } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testRcpts, setTestRcpts] = useState<Array<{ name: string; phone: string }> | null>(null);
  // 🧭 رحلة البثّ: العرض (بثّ جديد/السجلّ)، الخطوة، والأقسام المطويّة
  const rootRef = useRef<HTMLDivElement>(null);
  const stepAnchorRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'compose' | 'history'>('compose');
  const [step, setStep] = useState<Step>(1);
  const [advOpen, setAdvOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [varsHelp, setVarsHelp] = useState(false);
  const [tplSheet, setTplSheet] = useState(false);
  const [rcptOpen, setRcptOpen] = useState(false);
  const [rcptQ, setRcptQ] = useState('');
  const [liveOpen, setLiveOpen] = useState<Set<number>>(new Set());
  const [actListOpen, setActListOpen] = useState(false);

  // ══════════════════════════════════════════════════════
  // ✂️ الحدّ الفعليّ للنصّ: ٩٠٠ عادةً، وحدُّ التعليق مع صورة
  // ══════════════════════════════════════════════════════
  // مع صورةٍ لا يُرسَل النصُّ رسالةً، بل **تعليقاً** عليها — فيحكمه حدُّ واتساب للتعليق
  // (١٠٢٤) ناقصاً الذيلَ وهامشَ توسّع المتغيّرات، وهو ما يحسبه الخادم قبل أن يرفع شيئاً.
  // 🔴 وحدُّ النصّ (٩٠٠) يبقى قائماً فوقه، فالفعليُّ **أصغرُهما**: لا ترفعه إلى ٩٦٤ ظنّاً
  //    أنّ الصورة تُفرِج — يمرّ من هنا ويرجع ٤٠٠ من الخادم.
  const capBudget = CAPTION_MAX - (footer ? OPTOUT_FOOTER.length : 0) - VAR_SLACK;
  const bodyMax = img ? Math.min(BODY_MAX, capBudget) : BODY_MAX;

  // ══════════════════════════════════════════════════════
  // 🏷️ إدراج متغيّرٍ عند المؤشّر
  // ══════════════════════════════════════════════════════
  // كان الزرّ يُلحق المتغيّر بآخر النصّ دائماً (`setBody(b => b + v)`): تكتب
  // جملةً، تضع المؤشّر في وسطها، تضغط الزرّ — فيهبط المتغيّر في آخر الرسالة
  // بعيداً عمّا تنظر إليه، فيبدو كأنّ الزرّ لا يعمل. وهو يعمل في المكان الخطأ.
  //
  // و`onMouseDown` يمنع الافتراضيّ كي لا يفقد الحقلُ تركيزَه قبل النقرة،
  // فيبقى موضعُ المؤشّر معروفاً.
  const insertVar = (v: string) => {
    const el = bodyRef.current;
    if (!el) { setBody(b => b + v); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? start;
    const next = body.slice(0, start) + v + body.slice(end);
    if (next.length > bodyMax) return;         // الحدّ نفسه الذي يفرضه الحقل
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const at = start + v.length;
      el.setSelectionRange(at, at);
    });
  };
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [tplId, setTplId] = useState<number | null>(null);
  const [exB, setExB] = useState<number[]>([]);
  const needsActivity = filter === 'activity' || filter === 'not_booked_activity';

  const loadTpls = useCallback(async () => {
    try { const d = await apiFetch('/api/whatsapp/open-window-broadcast/templates'); setTpls(d.templates || []); } catch { /* غير حاجب */ }
  }, [apiFetch]);
  useEffect(() => { loadTpls(); }, [loadTpls]);
  // 📡 البثوث الجارية: يُرسل أم متوقّف ولماذا، وآخر رسالةٍ خرجت — تحديثٌ كلّ ٢٠ ثانية
  const [live, setLive] = useState<{ broadcasts: any[]; lane: any } | null>(null);
  useEffect(() => {
    let alive = true;
    const pull = () => apiFetch('/api/whatsapp/open-window-broadcast/live').then(d => { if (alive) setLive({ broadcasts: d.broadcasts || [], lane: d.lane || null }); }).catch(() => {});
    pull();
    const t = setInterval(pull, 20_000);
    return () => { alive = false; clearInterval(t); };
  }, [apiFetch, historyTick]);

  // 🧪 من يصله الاختبار (أرقام الإداريّين) — للعرض فقط؛ الخادم يحدّدهم عند الإرسال
  useEffect(() => {
    apiFetch('/api/whatsapp/open-window-broadcast/test-recipients').then(d => setTestRcpts(d.recipients || [])).catch(() => setTestRcpts([]));
  }, [apiFetch]);
  const currentTpl = tpls.find(t => t.id === tplId) || null;
  const tplDirty = !!currentTpl && currentTpl.body.trim() !== body.trim();

  const saveTpl = async () => {
    if (body.trim().length < 5) { swalToast('اكتب النصّ أوّلاً', 'warning'); return; }
    try {
      if (currentTpl && tplDirty && await swalConfirm(`تحديث القالب «${currentTpl.name}» بالنصّ الحاليّ؟\n(«لا» = حفظه كقالب جديد)`, { title: 'حفظ القالب', confirmText: 'حدّثه', cancelText: 'لا، جديد', icon: 'question' })) {
        await apiFetch(`/api/whatsapp/open-window-broadcast/templates/${currentTpl.id}`, { method: 'PUT', body: JSON.stringify({ body }) });
        swalToast('حُدّث القالب', 'success');
      } else {
        const r = await Swal.fire({ title: 'اسم القالب', input: 'text', inputPlaceholder: 'مثال: تذكير فعاليّة الغد', showCancelButton: true, confirmButtonText: 'احفظ', cancelButtonText: 'إلغاء', background: '#141210', color: '#e7e2d6', confirmButtonColor: '#d97706', inputValidator: v => (!v?.trim() ? 'اكتب اسماً' : undefined) });
        const name = String(r.value || '').trim();
        if (!r.isConfirmed || !name) return;
        const d = await apiFetch('/api/whatsapp/open-window-broadcast/templates', { method: 'POST', body: JSON.stringify({ name, body }) });
        setTplId(d.template?.id ?? null);
        swalToast('حُفظ القالب', 'success');
      }
      await loadTpls();
    } catch (e: any) { swalToast(e.message || 'تعذّر الحفظ', 'error'); }
  };
  const deleteTpl = async () => {
    if (!currentTpl || !(await swalConfirm(`حذف القالب «${currentTpl.name}»؟`, { confirmText: 'احذفه', danger: true }))) return;
    await apiFetch(`/api/whatsapp/open-window-broadcast/templates/${currentTpl.id}`, { method: 'DELETE' }).catch(() => {});
    setTplId(null); loadTpls();
  };

  // ══════════════════════════════════════════════════════
  // 🖼️ رفعُ صورة البثّ
  // ══════════════════════════════════════════════════════
  // الرفعُ لا يرسل شيئاً — يُنتج رابطاً فقط؛ والخادم يضغطه ويجرّده من EXIF ويعيد
  // حجمه النّهائيّ. وتفريغُ `value` بعد كلّ محاولة كي يُقبل اختيارُ الملفّ نفسه ثانيةً.
  const pickImg = async (f: File | null | undefined) => {
    if (!f) return;
    setImgBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', f);
      const d = await apiFetch('/api/whatsapp/media/upload', { method: 'POST', body: fd });
      setImg({ url: String(d.url), bytes: Number(d.bytes) || 0, kind: 'image' });
    } catch (e: any) { swalToast(e.message || 'تعذّر رفع الصورة', 'error'); }
    setImgBusy(false);
    if (imgRef.current) imgRef.current.value = '';
  };
  // 🎬 رفعُ فيديو البثّ: MP4 حتّى ١٦ م.ب — يُفحص الحجم هنا قبل رفعٍ طويلٍ يُرفض في آخره
  const pickVid = async (f: File | null | undefined) => {
    if (!f) return;
    if (vidRef.current) vidRef.current.value = '';
    if (f.size > VIDEO_MAX_MB * 1024 * 1024) { swalToast(`الفيديو ${(f.size / 1048576).toFixed(1)} م.ب — حدّ واتساب ${VIDEO_MAX_MB} م.ب`, 'error'); return; }
    if (f.type && f.type !== 'video/mp4') { swalToast('واتساب يقبل MP4 فقط — فيديو الآيفون (‎.mov) يُحوَّل أوّلاً', 'error'); return; }
    setImgBusy(true);
    try {
      const fd = new FormData();
      fd.append('video', f);
      const d = await apiFetch('/api/whatsapp/media/upload-video', { method: 'POST', body: fd });
      setImg({ url: String(d.url), bytes: Number(d.bytes) || 0, kind: 'video' });
    } catch (e: any) { swalToast(e.message || 'تعذّر رفع الفيديو', 'error'); }
    setImgBusy(false);
  };

  const load = useCallback(async () => {
    try {
      const qs = `filter=${filter}${(filter === 'activity' || filter === 'not_booked_activity') && activityId ? `&activityId=${activityId}` : ''}`
        + (filter === 'played' ? `&played=${playedIds.join(',')}${activityId && playedNotBooked ? `&activityId=${activityId}&notBooked=1` : ''}` : '');
      const d = await apiFetch(`/api/whatsapp/open-window-broadcast/audience?${qs}&channel=${channel}${line ? `&line=${line}` : ''}${since ? `&lineSince=${encodeURIComponent(since)}` : ''}${exB.length ? `&excludeBroadcasts=${exB.join(',')}` : ''}`);
      setAud(d);
      setRows(d.rows || []); setStatus(d.status || null); setHistory(d.history || []); setActivities(d.activities || []);
      setErr(null); setHistoryTick(t => t + 1);
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [apiFetch, filter, activityId, exB, channel, line, since, playedIds, playedNotBooked]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  // أثناء بثٍّ جارٍ: حدّث العدّادات كلّ 5 ثوانٍ، وعند انتهائه فوراً
  useEffect(() => {
    if (!status?.running) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [status?.running, load]);
  useEffect(() => {
    const s = getSocket();
    const onDone = () => { load(); swalToast('انتهى البثّ', 'success'); };
    s?.on('wa:broadcast:done', onDone);
    return () => { s?.off('wa:broadcast:done', onDone); };
  }, [load]);

  const targets = useMemo(() => rows.filter(r => !excluded.has(r.id)), [rows, excluded]);
  const sample = targets[0];
  const act = activities.find(a => a.id === activityId);
  const missingActivity = (needsActivity || ACT_VARS.test(body)) && !activityId;
  const missingPlayed = filter === 'played' && playedIds.length === 0;
  // الفاصل يسقط إن استُثني مستلمو كلّ بثوث آخر 12 ساعة (الخادم يعيد الفحص)
  const recentIds = history.filter(h => Date.now() - new Date(h.createdAt).getTime() < 12 * 3600e3).map(h => h.id as number);
  const coversRecent = recentIds.length > 0 && recentIds.every(id => exB.includes(id));
  const blockedReason: string | null =
    status?.suspended ? `الإرسال مقفل: ${status.suspended}`
    : status?.running ? 'هناك بثّ جارٍ الآن'
    : status?.nextAllowedAt && !coversRecent ? `بثّ واحد كلّ ١٢ ساعة — المتاح ${fmt(status.nextAllowedAt)}. أو استثنِ مستلمي البثّ السابق لترسل للباقي الآن`
    : null;
  // ══════════════════════════════════════════════════════
  // 🧪 الاختبار الإلزاميّ قبل البثّ (قرار المالك 2026-10-24)
  // ══════════════════════════════════════════════════════
  // المحتوى نفسه (نصّ/صورة/فيديو + التذييل + الفعاليّة إن كان متغيّرها في النصّ) يصل أرقامَ الإداريّين من رقم
  // الأعمال مباشرةً، ثمّ يُفتح زرّ البثّ. أيّ تعديلٍ بعد الاختبار يقفله من جديد — والخادم يفرض ذلك أيضاً.
  const TEST_VALID_MS = 12 * 3600e3;
  const contentSig = JSON.stringify([body.trim(), img?.kind || '', img?.url || '', footer, ACT_VARS.test(body) ? activityId : null]);
  const testedOk = !!tested && tested.sig === contentSig && Date.now() - tested.at < TEST_VALID_MS;
  const canTest = !testing && !imgBusy && !missingActivity && body.trim().length >= 5 && body.length <= bodyMax;
  const runTest = async () => {
    setTesting(true);
    try {
      const r = await apiFetch('/api/whatsapp/open-window-broadcast/test', { method: 'POST', body: JSON.stringify({ body, appendOptout: footer, activityId, imageUrl: img?.kind === 'image' ? img.url : null, videoUrl: img?.kind === 'video' ? img.url : null }) });
      setTested({ sig: contentSig, at: Number(r.at) || Date.now(), sentTo: r.sentTo || [] });
      const n = (r.sentTo || []).filter((x: any) => x.ok).length;
      swalToast(`🧪 خرج الاختبار من رقم الأعمال إلى ${n} — راجعوه على هواتفكم ثمّ اعتمد البثّ`, 'success');
    } catch (e: any) {
      setTested(null);
      const fails = (e.body?.sentTo || []).map((x: any) => `• ${x.name}: ${x.ok ? 'وصل' : x.error}`).join('\n');
      swalAlert(`تعذّر الاختبار: ${e.message}${fails ? `\n\n${fails}` : ''}`, 'error');
    }
    setTesting(false);
  };
  const canSend = testedOk && !blockedReason && !sending && !imgBusy && !missingActivity && !missingPlayed && targets.length > 0 && body.trim().length >= 5 && body.length <= bodyMax;

  const send = async () => {
    const ok = await swalConfirm(
      `ستُرسَل ${img ? (img.kind === 'video' ? 'هذا الفيديو بتعليقه' : 'هذه الصورة بتعليقها') : 'هذه الرسالة'} إلى ${targets.length} شخصاً نافذتهم مفتوحة الآن.\nلا يمكن التراجع عمّا أُرسل.`,
      { title: 'تأكيد البثّ', confirmText: `أرسل إلى ${targets.length}`, icon: 'warning' },
    );
    if (!ok) return;
    setSending(true);
    try {
      const r = await apiFetch('/api/whatsapp/open-window-broadcast', { method: 'POST', body: JSON.stringify({ body, filter, channel, lineFilter: line || undefined, lineSince: since || undefined, activityId, ...(filter === 'played' ? { playedActivityIds: playedIds, playedNotBooked: playedNotBooked && !!activityId } : {}), templateId: currentTpl && !tplDirty ? currentTpl.id : null, excludeBroadcastIds: exB, excludeIds: Array.from(excluded), appendOptout: footer, imageUrl: img?.kind === 'image' ? img.url : null, videoUrl: img?.kind === 'video' ? img.url : null }) });
      swalToast(`بدأ البثّ إلى ${r.total}`, 'success');
      setBody(''); setTplId(null); setExcluded(new Set()); setExB([]); setImg(null); setTested(null); setPlayedIds([]);
      setStep(1); setRcptOpen(false); setRcptQ('');
      scrollFlowTop();
      await load(); loadTpls();
    } catch (e: any) {
      if (e.code === 'TEST_REQUIRED') setTested(null);   // انتهت صلاحيّة الاختبار أو تغيّر المحتوى عند الخادم
      swalToast(e.message || 'تعذّر بدء البثّ', 'error');
    }
    setSending(false);
  };

  const stop = async (id: number) => {
    if (!(await swalConfirm('إيقاف البثّ الجاري؟ ما أُرسل لن يُسترجع.', { confirmText: 'أوقفه', danger: true }))) return;
    await apiFetch(`/api/whatsapp/open-window-broadcast/${id}/stop`, { method: 'POST' }).catch(() => {});
    setTimeout(load, 1500);
  };

  const runningRow = history.find(h => h.id === status?.running);

  const fmtAt = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso), now = new Date();
    const t = d.toLocaleTimeString('ar-JO-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `اليوم ${t}`;
    const tm = new Date(now); tm.setDate(now.getDate() + 1);
    if (d.toDateString() === tm.toDateString()) return `غداً ${t}`;
    const ys = new Date(now); ys.setDate(now.getDate() - 1);
    if (d.toDateString() === ys.toDateString()) return `أمس ${t}`;
    return `${d.toLocaleDateString('ar-JO-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'short' })} ${t}`;
  };
  const LANE_TONE: Record<string, { dot: string; color: string; label: string }> = {
    sending: { dot: 'ok', color: 'var(--ok)', label: 'يُرسل الآن' },
    paused: { dot: 'warn', color: 'var(--warn)', label: 'متوقّف مؤقّتاً' },
    idle: { dot: '', color: 'var(--ink-3)', label: 'لا شيء في الطابور' },
  };

  // ══════════════════════════════════════════════════════
  // 🧭 رحلة البثّ — ثلاث خطوات: لمن؟ ← الرسالة ← راجع وأرسل
  // ══════════════════════════════════════════════════════
  // كلّ خطوة تعرض ما يخصّها وحده، وشريطٌ سفليّ ثابت يحمل العدد والزرّ التالي. القيود كما
  // هي في الخادم؛ هنا ترتيب العرض فقط. الرجوع لأيّ خطوةٍ سابقة متاحٌ دائماً من الرأس.
  const actVarsUsed = ACT_VARS.test(body);
  const audienceOk = !(needsActivity && !activityId) && !missingPlayed;
  const messageOk = body.trim().length >= 5 && body.length <= bodyMax && !imgBusy && !(actVarsUsed && !activityId);
  const canReach = (s: Step) => s === 1 || (s === 2 ? audienceOk : audienceOk && messageOk);
  // أعلى الرحلة: على الحاسوب يتمرّر صندوق التبويب، وعلى الهاتف النافذة نفسها (تحت شريط الإدارة الثابت)
  // بعد أن تُرسم الخطوة الجديدة (قد تكون أقصر) — وإلّا حُسب الموضع على الخطوة القديمة
  const scrollFlowTop = () => setTimeout(() => requestAnimationFrame(() => {
    const el = rootRef.current;
    if (!el) return;
    // مركز واتساب الجديد: الصفحة لا تتمرّر كلّها — المتمرّر هو عمود ‎.wa-content
    const scroller = el.closest('.wa-content');
    if (scroller) { scroller.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); return; }
    if (getComputedStyle(el).overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 1) { el.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); return; }
    const anchor = stepAnchorRef.current || el;
    const top = anchor.getBoundingClientRect().top + window.scrollY - (window.innerWidth < 768 ? 64 : 0);
    // 'instant' صراحةً: الموقع يضبط scroll-behavior: smooth على html، والتمرير الناعم يُلغى مع إعادة الرسم
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' as ScrollBehavior });
  }), 0);
  const go = (s: Step) => {
    if (!canReach(s)) return;
    setStep(s);
    scrollFlowTop();
  };
  const pickAct = (id: number | null) => { setActivityId(id); setExcluded(new Set()); };
  const advancedCount = (channel !== 'all' ? 1 : 0) + (line ? 1 : 0) + (exB.length ? 1 : 0);
  const sentHistory = history.filter(h => h.sentCount > 0).slice(0, 6);
  const showLine = aud?.byChannel?.web > 0 || channel === 'web' || !!line;
  const showChannel = aud?.byChannel?.web > 0 || channel !== 'all';

  const audienceText = (() => {
    const m = FILTER_META[filter];
    if (filter === 'activity' || filter === 'not_booked_activity') return `${m.label}: ${act?.name ?? '—'}`;
    if (filter === 'played') return `لعبوا معنا في ${playedIds.length || '—'} فعاليّة${activityId && playedNotBooked ? ` · ولم يحجزوا في «${act?.name ?? ''}»` : ''}`;
    return m.label;
  })();

  const rcptRows = useMemo(() => {
    const q = rcptQ.trim();
    if (!q) return rows;
    return rows.filter(r => r.name.includes(q) || r.phone.includes(q.replace(/\D/g, '') || q));
  }, [rows, rcptQ]);

  const barHint = (() => {
    if (step === 1) {
      if (missingPlayed) return 'اختر فعاليّةً سابقة واحدة على الأقلّ';
      if (needsActivity && !activityId) return 'اختر الفعاليّة';
      if (!loading && rows.length === 0) return 'لا أحد ضمن هذا الجمهور';
      return aud?.byChannel ? `ميتا ${aud.byChannel.cloud} · رقم الأعمال ${aud.byChannel.web}` : '';
    }
    if (step === 2) {
      if (imgBusy) return 'يُرفع الوسيط…';
      if (body.trim().length < 5) return 'اكتب الرسالة (5 أحرف على الأقلّ)';
      if (body.length > bodyMax) return `النصّ أطول من ${bodyMax}`;
      if (actVarsUsed && !activityId) return 'النصّ فيه متغيّرات فعاليّة — اختر الفعاليّة';
      return `${body.length} / ${bodyMax} حرفاً`;
    }
    if (blockedReason) return blockedReason;
    if (missingActivity || missingPlayed) return 'ارجع وأكمل الجمهور';
    return testedOk ? 'وصل الاختبار — راجعه على هاتفك ثمّ أرسل' : 'الاختبار إلزاميّ قبل الإرسال';
  })();
  const barDanger = step === 3 && !!blockedReason;

  // ── عناصر مشتركة ──
  const upcomingList = (required: boolean) => (
    <div role="radiogroup" className="stack" style={{ gap: 'var(--space-2)' }}>
      {!required && <OptionRow selected={!activityId} onClick={() => pickAct(null)} title="بلا فعاليّة قادمة" />}
      {activities.map(a => (
        <OptionRow key={a.id} selected={activityId === a.id} onClick={() => pickAct(a.id)}
          title={a.name} sub={`${a.when || fmt(a.date)}${a.venue ? ` · ${a.venue}` : ''}`} />
      ))}
      {activities.length === 0 && <p className="muted" style={{ ...SMALL, margin: 0 }}>لا فعاليّات قادمة.</p>}
    </div>
  );

  const liveStrip = live && live.broadcasts.length > 0 && (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      {live.broadcasts.map(b => {
        const ln = live.lane || {};
        const tone = LANE_TONE[ln.state] || LANE_TONE.paused;
        const done = b.sent + b.failed;
        const pct = b.total ? Math.round((done / b.total) * 100) : 0;
        const open = liveOpen.has(b.id);
        const canStop = status?.running === b.id;
        return (
          <div key={b.id} className="stack" style={{ gap: 'var(--space-2)' }}>
            <button type="button" onClick={() => setLiveOpen(p => { const n = new Set(p); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })}
              className="wa-health" style={{ borderColor: 'var(--info)' }} aria-expanded={open}>
              <i className={`wa-dot ${tone.dot}`} />
              <span className="trunc" style={{ minWidth: 0 }}>
                <b>بثّ <bdi className="ltr">#{b.id}</bdi></b>
                {b.media === 'video' ? <Video className="s" aria-label="فيديو" style={{ display: 'inline', marginInline: 4 }} /> : b.media === 'image' ? <ImageIcon className="s" aria-label="صورة" style={{ display: 'inline', marginInline: 4 }} /> : null}
                {' · '}<span style={{ color: tone.color, fontWeight: 700 }}>{b.queued === 0 ? 'خرجت كلّها' : tone.label}</span>
              </span>
              <Meter pct={pct} tone="info" style={{ flex: 1, minWidth: 48, maxWidth: 220, marginInlineStart: 'var(--space-2)' }} />
              <span className="end"><bdi className="ltr">{b.sent}/{b.total}</bdi>{open ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}</span>
            </button>
            {open && (
              <div className="wa-card stack" style={{ gap: 'var(--space-2)' }}>
                <div className="trunc muted" style={{ font: '400 13px/20px var(--font-sans)' }}>{String(b.text || '').split('\n').find((l: string) => l.trim()) || ''}</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1" style={{ font: '400 13px/20px var(--font-sans)', color: 'var(--ink-2)' }}>
                  <span>أُرسل <b className="ltr" style={{ color: 'var(--ink)' }}>{b.sent}</b> من <bdi className="ltr">{b.total}</bdi></span>
                  <span>في الطابور <b className="ltr" style={{ color: 'var(--warn)' }}>{b.queued}</b>{b.sending ? ` (${b.sending} الآن)` : ''}</span>
                  <span>وصل <bdi className="ltr">{b.delivered}</bdi> · قُرئ <bdi className="ltr">{b.read}</bdi></span>
                  {b.failed > 0 ? <span style={{ color: 'var(--danger)' }}>فشل <bdi className="ltr">{b.failed}</bdi></span> : <span />}
                  <span className="col-span-2">آخر رسالة: <b style={{ color: 'var(--ink)' }}>{fmtAt(b.lastSentAt)}</b> · بدأ {fmtAt(b.createdAt)}{b.createdBy ? ` · ${b.createdBy}` : ''}</span>
                </div>
                {b.queued > 0 && ln.state && (
                  <div className={`wa-banner ${ln.state === 'sending' ? 'ok' : 'warn'}`}>
                    <div>
                      <b>{ln.state === 'sending' ? 'يُرسل:' : 'سبب التوقّف:'}</b> {ln.reason}
                      {ln.resumeAt && <span> — {ln.state === 'sending' ? 'التالية' : 'يستأنف'} <b>{fmtAt(ln.resumeAt)}</b></span>}
                      {ln.code === 'daily_cap' && ln.tomorrowCap ? <span> بحدّ {ln.tomorrowCap}</span> : null}
                      <div style={{ ...SMALL, color: 'var(--ink-2)', marginTop: 4 }}>
                        اليوم {ln.todaySent}/{ln.dayCap ?? '∞'} · آخر ساعة {ln.hourSent}/{ln.hourCap} · ساعات الإرسال {ln.window}{ln.warmup ? ' · التسخين مفعّل' : ''}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {b.queued > 0 && (ln.code === 'gateway' || ln.code === 'deferred') && (
                    <button type="button" onClick={async () => {
                      try {
                        const r = await apiFetch('/api/whatsapp/open-window-broadcast/resume-lane', { method: 'POST' });
                        swalToast(`▶ استُؤنف — ${r.released ? `فُكّ ${r.released} مؤجَّل، ` : ''}قيودنا تبقى سارية`, 'success');
                        setTimeout(() => apiFetch('/api/whatsapp/open-window-broadcast/live').then(d => setLive({ broadcasts: d.broadcasts || [], lane: d.lane || null })).catch(() => {}), 1500);
                      } catch (e: any) { swalToast(e.message, 'error'); }
                    }} className="wa-btn" style={{ borderColor: 'var(--ok)', color: 'var(--ok)' }}><Play aria-hidden />استأنف الآن</button>
                  )}
                  {canStop && (
                    <button type="button" onClick={() => stop(b.id)} className="wa-btn danger"><CircleStop aria-hidden />أوقف البثّ</button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // 📱 المعاينة: كما تصل إلى أوّل مستلم — تُعرض بجانب المحرّر على الحاسوب وفي خطوة المراجعة
  const preview = body.trim() ? (
    <div className="stack" style={{ gap: 6 }}>
      <div className="muted" style={LABEL}>كما تصل إلى {sample?.name || 'المستلم'}:</div>
      <div className="wa-wamock">
        <div className="b">
          {img && (img.kind === 'video'
            ? <video src={`${API_URL}${img.url}`} controls preload="metadata" />
            : <img src={`${API_URL}${img.url}`} alt="" />)}
          {fill(body, { ...(sample || { name: '', rank: '' }), activity: act?.name, venue: act?.venue, place: (act as any)?.place, when: act?.when })}{footer ? OPTOUT_FOOTER : ''}
        </div>
      </div>
    </div>
  ) : null;

  // ══ الخطوة ١: لمن؟ ══
  const stepAudience = (
    <section className="stack" style={{ gap: 'var(--space-4)' }}>
      <StepTitle n={1} title="لمن تُرسل؟" sub="اختر الجمهور، وضيّقه من «تضييق إضافي» إن احتجت." />
      {AUDIENCE_GROUPS.map(g => (
        <div key={g.title} className="stack" style={{ gap: 'var(--space-2)' }}>
          <div className="muted" style={LABEL}>{g.title}</div>
          <div role="radiogroup" aria-label={g.title} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {g.keys.map(k => {
              const m = FILTER_META[k];
              const on = filter === k;
              return (
                <button key={k} type="button" role="radio" aria-checked={on} className="wa-radio"
                  onClick={() => { setFilter(k); setExcluded(new Set()); }}>
                  <m.Icon className="l" aria-hidden />
                  <span className="t"><b>{m.label}</b><span>{m.hint}</span></span>
                  <span className="o" />
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {(filter === 'activity' || filter === 'not_booked_activity') && (
        <Panel title={filter === 'activity' ? 'أيّ فعاليّة؟' : 'لم يحجزوا في أيّ فعاليّة؟'}>{upcomingList(true)}</Panel>
      )}
      {filter === 'played' && (
        <div className="stack">
          <PlayedActivityPicker apiFetch={apiFetch} value={playedIds} onChange={ids => { setPlayedIds(ids); setExcluded(new Set()); }} />
          <Panel title="ولم يحجزوا بعد في…" sub="اختياريّ — فعاليّة قادمة تدعوهم إليها، وتُستعمل أيضاً لمتغيّرات النصّ.">
            {upcomingList(false)}
            {activityId && (
              <Setting title={<>فقط من لم يحجز بعد في «{act?.name}»</>}>
                <Toggle on={playedNotBooked} onChange={v => { setPlayedNotBooked(v); setExcluded(new Set()); }} label="فقط من لم يحجز بعد في الفعاليّة القادمة" />
              </Setting>
            )}
          </Panel>
        </div>
      )}

      <Disclosure title="تضييق إضافي" icon={<SlidersHorizontal aria-hidden />} badge={advancedCount} open={advOpen} onToggle={() => setAdvOpen(v => !v)}>
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          {showChannel && (
            <div className="stack" style={{ gap: 6 }}>
              <div style={SUBHEAD}>القناة</div>
              <div className="wa-chips" role="group" aria-label="القناة">
                {([['all', 'الكلّ', null, aud?.byChannel ? (aud.byChannel.cloud + aud.byChannel.web) : null], ['cloud', 'ميتا', <Cloud key="i" className="s" aria-hidden />, aud?.byChannel?.cloud], ['web', 'رقم الأعمال', <Smartphone key="i" className="s" aria-hidden />, aud?.byChannel?.web]] as Array<['all' | 'cloud' | 'web', string, ReactNode, number | null | undefined]>).map(([k, l, ic, n]) => (
                  <Chip key={k} on={channel === k} onClick={() => { setChannel(k); setExcluded(new Set()); }} n={n != null && channel === 'all' ? n : undefined}>{ic}{l}</Chip>
                ))}
              </div>
              <p className="muted" style={{ ...SMALL, margin: 0 }}>ميتا: لمن راسلنا خلال 24 ساعة فقط. رقم الأعمال: بلا نافذة، بطابورٍ متباعد.</p>
            </div>
          )}
          {showLine && (
            <div className="stack" style={{ gap: 6 }}>
              <div style={SUBHEAD}>من يراسله رقم الأعمال؟</div>
              <div role="radiogroup" className="stack" style={{ gap: 'var(--space-2)' }}>
                {LINE_OPTS.map(o => (
                  <OptionRow key={o.key || 'def'} selected={line === o.key} onClick={() => { setLine(o.key); setExcluded(new Set()); }}
                    title={o.label} sub={o.key === '' ? 'ما ضبطته في «القنوات»' : o.key === 'all' ? 'قد يبدأ محادثةً باردة — بحذر' : undefined} />
                ))}
              </div>
              {line === 'two_way' && (
                <div className="stack" style={{ gap: 6, marginTop: 'var(--space-1)' }}>
                  <div className="muted" style={SMALL}>راسَلنا خلال:</div>
                  <div className="flex flex-wrap gap-2">
                    {([['', 'أيّ وقت'], ['7', '7 أيّام'], ['30', '30 يوماً'], ['90', '90 يوماً']] as const).map(([k, l]) => (
                      <Chip key={k || 'any'} on={lineSince === k} onClick={() => { setLineSince(k); setExcluded(new Set()); }}>{l}</Chip>
                    ))}
                    <label className="wa-chip" style={/^\d{4}-/.test(lineSince) ? { background: 'var(--gold-soft)', borderColor: 'var(--gold)', color: 'var(--gold)' } : undefined}>
                      منذ
                      <input type="date" value={/^\d{4}-/.test(lineSince) ? lineSince : ''} max={new Date().toISOString().slice(0, 10)}
                        onChange={e => { setLineSince(e.target.value); setExcluded(new Set()); }}
                        style={{ fontSize: 16, background: 'transparent', border: 0, outline: 'none', color: 'var(--ink)', colorScheme: 'dark', fontFamily: 'var(--font-mono)' }} aria-label="راسَلنا منذ تاريخ" />
                    </label>
                  </div>
                  <p className="muted" style={{ ...SMALL, margin: 0 }}>بحسب آخر رسالةٍ منه.</p>
                </div>
              )}
            </div>
          )}
          {sentHistory.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <div style={SUBHEAD}>استثنِ من وصلهم بثّ سابق</div>
              <div className="stack" style={{ gap: 'var(--space-2)' }}>
                {sentHistory.map(h => {
                  const on = exB.includes(h.id);
                  return (
                    <button key={h.id} type="button" role="checkbox" aria-checked={on} className="wa-radio"
                      onClick={() => { setExB(p => on ? p.filter(x => x !== h.id) : [...p, h.id]); setExcluded(new Set()); }}
                      style={on ? { borderColor: 'var(--danger)', background: 'var(--danger-soft)' } : undefined}>
                      {on ? <SquareCheck aria-hidden style={{ color: 'var(--danger)' }} /> : <Square aria-hidden style={{ color: 'var(--ink-3)' }} />}
                      <span className="t">
                        <b><bdi className="ltr">#{h.id}</bdi> · {fmt(h.createdAt)} · <bdi className="ltr">{h.sentCount}</bdi> مستلماً</b>
                        <span className="trunc">{bodyOf(h.body).split('\n')[0]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!showChannel && !showLine && sentHistory.length === 0 && <p className="muted" style={{ ...SMALL, margin: 0 }}>لا خيارات إضافيّة لهذا الجمهور.</p>}
        </div>
      </Disclosure>

      <Disclosure title="كيف يعمل البثّ؟" icon={<Info aria-hidden />} open={helpOpen} onToggle={() => setHelpOpen(v => !v)}>
        <ul className="space-y-1.5 list-disc pr-4" style={{ margin: 0, font: '400 13px/22px var(--font-sans)', color: 'var(--ink-2)' }}>
          <li>رسالةٌ واحدة (نصّ، أو صورة/فيديو بتعليق) لكلّ من في الجمهور.</li>
          <li><b>ميتا</b>: لمن راسلنا خلال آخر 24 ساعة فقط. <b>رقم الأعمال</b>: بلا نافذة، بطابورٍ متباعد وسقفٍ يوميّ من «القنوات».</li>
          <li>لا يصل لمن كتب «إيقاف». السقف {status?.maxTargets ?? 300} مستلم للبثّ الواحد.</li>
          <li>الاختبار على هواتف الإداريّين <b>إلزاميّ</b> قبل كلّ إرسال.</li>
        </ul>
      </Disclosure>
    </section>
  );

  // ══ الخطوة ٢: الرسالة ══
  const stepMessage = (
    <section className="stack" style={{ gap: 'var(--space-4)' }}>
      <StepTitle n={2} title="الرسالة" sub="اكتبها أو ابدأ من قالب، وأضف صورة أو فيديو إن شئت." />

      <div className="wa-grid2">
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setTplSheet(true)} className="wa-btn" aria-haspopup="dialog"
              style={{ flex: '1 1 180px', minWidth: 0, justifyContent: 'flex-start' }}>
              <FileText aria-hidden />
              <span className="trunc" style={{ minWidth: 0, fontWeight: 500 }}>
                {currentTpl ? <>القالب: <b>{currentTpl.name}</b>{tplDirty ? <span style={{ color: 'var(--warn)' }}> · معدَّل</span> : null}</>
                  : (tpls.length ? `ابدأ من قالب محفوظ (${tpls.length})` : 'لا قوالب محفوظة بعد')}
              </span>
              <ChevronDown aria-hidden style={{ marginInlineStart: 'auto' }} />
            </button>
            <button type="button" onClick={saveTpl} className="wa-btn"><Save aria-hidden />{currentTpl && tplDirty ? 'حفظ التعديل' : 'حفظ كقالب'}</button>
            {currentTpl && <button type="button" onClick={deleteTpl} aria-label="حذف القالب" title="حذف القالب" className="wa-iconbtn" style={{ color: 'var(--danger)' }}><Trash2 aria-hidden /></button>}
          </div>

          <Field label="نصّ الرسالة" htmlFor="wa-cast-body"
            hint={<>
              <span className="ltr" style={body.length > bodyMax - 50 ? { color: 'var(--danger)' } : undefined}>{body.length} / {bodyMax}</span>
              {img && <span style={{ color: 'var(--warn)' }}> · تعليق <span className="ltr">{body.length + (footer ? OPTOUT_FOOTER.length : 0)} / {CAPTION_MAX}</span></span>}
            </>}>
            <textarea id="wa-cast-body" ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} rows={8} maxLength={bodyMax} dir="rtl"
              placeholder={'مثال:\nمسا الخير {الاسم} 🎭\nبكرا الخميس لعبة الساعة 7 بمزاج أفندينا — بقي مقاعد قليلة. احجز من هون بكلمة «احجز».'}
              className="wa-textarea" style={{ minHeight: 190 }} />
          </Field>

          {/* المتغيّرات: شريطٌ أفقيّ — يُدرج عند المؤشّر */}
          <div className="stack" style={{ gap: 6 }}>
            <div className="muted" style={LABEL}>أدرج في النصّ:</div>
            <div className="wa-chips">
              {VARS.map(v => (
                <button key={v.token} type="button" onMouseDown={e => e.preventDefault()} onClick={() => insertVar(v.token)} className="wa-chip">{v.label}</button>
              ))}
            </div>
            <Disclosure title="ما معنى المتغيّرات؟" open={varsHelp} onToggle={() => setVarsHelp(v => !v)} compact>
              <ul className="space-y-1 list-disc pr-4" style={{ margin: 0, font: '400 13px/22px var(--font-sans)', color: 'var(--ink-2)' }}>
                <li>{'{الاسم}'} الاسم الأوّل، و{'{الاسم_الكامل}'} كاملاً.</li>
                <li>{'{الرتبة}'} فارغة للزائر غير المسجّل — لا تبنِ الجملة عليها.</li>
                <li>{'{المكان}'} اسم الكافيه، و{'{الموقع}'} الاسم والمنطقة والمدينة معاً — الأنسب لمن لم يزُرنا.</li>
                <li>{'{الفعالية}'} و{'{المكان}'} و{'{الموقع}'} و{'{الموعد}'} تتبع الفعاليّة المختارة.</li>
                <li>الروابط الخارجيّة مرفوضة (روابط النادي فقط).</li>
              </ul>
            </Disclosure>
          </div>

          {actVarsUsed && (
            <Panel title="الفعاليّة في النصّ" sub={needsActivity || filter === 'played' ? 'هي نفسها فعاليّة الجمهور — تغييرها هنا يغيّره.' : 'تملأ {الفعالية} و{الموعد} و{المكان} و{الموقع}.'}
              tone={activityId ? 'default' : 'warn'}>
              {activityId && !actListOpen ? (
                <div className="row" style={{ gap: 'var(--space-3)' }}>
                  <Check aria-hidden style={{ color: 'var(--ok)' }} />
                  <span className="grow trunc" style={{ font: '500 14px/20px var(--font-sans)' }}>{act?.name} <span className="muted">· {act?.when || (act ? fmt(act.date) : '')}</span></span>
                  <button type="button" onClick={() => setActListOpen(true)} className="wa-btn">تغيير</button>
                </div>
              ) : (
                <div onClick={() => setActListOpen(false)}>{upcomingList(true)}</div>
              )}
            </Panel>
          )}

          {/* الوسيط */}
          <input ref={imgRef} type="file" accept="image/jpeg,image/png" style={{ display: 'none' }} onChange={e => pickImg(e.target.files?.[0])} />
          <input ref={vidRef} type="file" accept="video/mp4" style={{ display: 'none' }} onChange={e => pickVid(e.target.files?.[0])} />
          {img ? (
            <div className="wa-attach">
              {img.kind === 'video'
                ? <video src={`${API_URL}${img.url}`} muted preload="metadata" className="thumb" style={{ objectFit: 'cover' }} />
                : <img src={`${API_URL}${img.url}`} alt="" className="thumb" style={{ objectFit: 'cover' }} />}
              <div className="grow">
                <div className="row" style={{ font: '700 14px/20px var(--font-sans)' }}>
                  {img.kind === 'video' ? <Video aria-hidden /> : <ImageIcon aria-hidden />}
                  {img.kind === 'video' ? 'فيديو' : 'صورة'} · <span className="ltr">{img.kind === 'video' ? (img.bytes / 1048576).toFixed(1) : Math.round(img.bytes / 1024)}</span> {img.kind === 'video' ? 'م.ب' : 'ك.ب'}
                </div>
                <div className="muted" style={SMALL}>النصّ يصير تعليقها</div>
              </div>
              <button type="button" onClick={() => setImg(null)} className="wa-btn danger">إزالة</button>
            </div>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={imgBusy} onClick={() => imgRef.current?.click()} className="wa-btn">
                  {imgBusy ? <><Loader2 aria-hidden className="animate-spin" />يُرفع…</> : <><ImageIcon aria-hidden />أضف صورة</>}
                </button>
                <button type="button" disabled={imgBusy} onClick={() => vidRef.current?.click()} className="wa-btn">
                  <Video aria-hidden />أضف فيديو
                </button>
              </div>
              <p className="muted" style={{ ...SMALL, margin: 0 }}>صورة JPG/PNG أو فيديو MP4 حتّى {VIDEO_MAX_MB} م.ب — رسالةٌ واحدة لا رسالتان.</p>
            </div>
          )}

          <Setting title="تذييل «لإيقاف هذه الرسائل أرسل: إيقاف»" hint="يُنصح بإبقائه — البلاغات هي ما يُغلق الحسابات">
            <Toggle on={footer} onChange={setFooter} label="تذييل الإيقاف" />
          </Setting>
        </div>

        {/* المعاينة بجانب المحرّر — للحاسوب؛ الهاتف يراها في خطوة المراجعة */}
        <div className="stack wa-only-desk">
          {preview || <div className="muted" style={LABEL}>تظهر المعاينة هنا حين تكتب الرسالة.</div>}
        </div>
      </div>
    </section>
  );

  // ══ الخطوة ٣: راجع وأرسل ══
  const stepReview = (
    <section className="stack" style={{ gap: 'var(--space-4)' }}>
      <StepTitle n={3} title="راجع وأرسل" sub="اختبر على هاتفك أوّلاً، ثمّ اعتمد البثّ." />

      <div className="wa-grid2">
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          <div className="wa-card" style={{ paddingBlock: 'var(--space-1)' }}>
            <SummaryRow label="لمن" onEdit={() => go(1)}>
              <b>{audienceText}</b>
              {advancedCount > 0 && <div className="muted" style={SMALL}>+ {advancedCount} تضييق إضافي</div>}
            </SummaryRow>
            <SummaryRow label="العدد">
              <b className="ltr" style={{ fontSize: 20, color: 'var(--gold)' }}>{targets.length}</b> <span style={{ color: 'var(--ink-2)' }}>مستلماً</span>
              {excluded.size > 0 && <span className="muted"> · استبعدت {excluded.size}</span>}
              {aud?.byChannel && <div className="muted" style={SMALL}>ميتا <bdi className="ltr">{aud.byChannel.cloud}</bdi> · رقم الأعمال <bdi className="ltr">{aud.byChannel.web}</bdi></div>}
              {aud?.capped && <div style={{ ...SMALL, color: 'var(--warn)' }}>الجمهور أكبر من السقف — يُرسل لأوّل {aud.maxTargets}</div>}
              {aud?.estimate && <div style={{ ...SMALL, color: 'var(--ch-web)' }}>نحو {aud.estimate.minutesFirstDay} دقيقة اليوم{aud.estimate.days > 1 ? ` — تكتمل خلال ${aud.estimate.days} أيّام (${aud.estimate.perDay} يوميّاً)` : ''}</div>}
            </SummaryRow>
            <SummaryRow label="الرسالة" onEdit={() => go(2)}>
              <b>{img ? (img.kind === 'video' ? 'فيديو بتعليق' : 'صورة بتعليق') : 'نصّ'}</b>
              <span className="muted"> · {footer ? 'مع تذييل الإيقاف' : 'بلا تذييل'}</span>
              {currentTpl && !tplDirty && <div className="muted" style={SMALL}>القالب «{currentTpl.name}»</div>}
            </SummaryRow>
          </div>

          <Disclosure title={`المستلمون (${targets.length})`} icon={<Users aria-hidden />} badge={excluded.size || undefined} open={rcptOpen} onToggle={() => setRcptOpen(v => !v)}>
            {err && <div className="wa-banner danger" role="alert" style={{ marginBottom: 'var(--space-2)' }}><TriangleAlert aria-hidden /><span>{err}</span></div>}
            {loading ? <p className="muted" style={{ ...SMALL, margin: 0 }}>جاري التحميل…</p> : rows.length === 0 ? (
              <p className="muted" style={{ ...SMALL, margin: 0 }}>لا أحد يمكن مراسلته ضمن هذا الجمهور.</p>
            ) : (
              <div className="stack" style={{ gap: 'var(--space-2)' }}>
                <div className="row">
                  <div className="wa-search grow">
                    <Search aria-hidden />
                    <input value={rcptQ} onChange={e => setRcptQ(e.target.value)} placeholder="ابحث باسم أو رقم…" className="wa-input" aria-label="بحث في المستلمين" />
                  </div>
                  {excluded.size > 0 && <button type="button" onClick={() => setExcluded(new Set())} className="wa-btn"><RotateCw aria-hidden />أعد ({excluded.size})</button>}
                </div>
                <p className="muted" style={{ ...SMALL, margin: 0 }}>أزل العلامة عمّن لا تريد مراسلته.</p>
                <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                  {rcptRows.map(r => {
                    const off = excluded.has(r.id);
                    return (
                      <label key={r.id} className="row" style={{ gap: 'var(--space-3)', minHeight: 52, paddingBlock: 6, cursor: 'pointer', borderBottom: '1px solid var(--line)', opacity: off ? 0.45 : undefined }}>
                        <input type="checkbox" checked={!off} style={{ width: 20, height: 20, accentColor: 'var(--gold)', flex: 'none' }}
                          onChange={() => setExcluded(p => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                        <span className="grow">
                          <span className="trunc" style={{ display: 'block', font: '500 14px/20px var(--font-sans)' }}>{r.name}</span>
                          <span className="muted" style={{ display: 'block', ...SMALL }}><span className="ltr">{r.phone}</span>{r.rank ? ` · ${r.rank}` : r.isPlayer ? '' : ' · زائر'}</span>
                        </span>
                        {r.via === 'web'
                          ? <span className="wa-badge web" title="يصله من رقم الأعمال — بلا نافذة"><Smartphone aria-label="رقم الأعمال" /></span>
                          : <span className="row muted" style={{ ...SMALL, gap: 4, whiteSpace: 'nowrap' }} title="الوقت المتبقّي قبل إغلاق نافذته"><Hourglass className="s" aria-hidden /> {r.windowClosesAt ? hoursLeft(r.windowClosesAt) : '—'}</span>}
                      </label>
                    );
                  })}
                  {rcptRows.length === 0 && <p className="muted" style={{ ...SMALL, margin: 0, paddingBlock: 'var(--space-3)' }}>لا نتائج.</p>}
                </div>
              </div>
            )}
          </Disclosure>

          {/* 🧪 الاختبار الإلزاميّ */}
          <div className="wa-card stack" style={{ gap: 'var(--space-2)', borderColor: testedOk ? 'var(--ok)' : 'var(--info)', background: testedOk ? 'var(--ok-soft)' : 'var(--info-soft)' }}>
            <div className="row" style={{ color: testedOk ? 'var(--ok)' : 'var(--info)' }}>
              {testedOk ? <CircleCheck aria-hidden /> : <FlaskConical aria-hidden />}
              <b style={{ font: '700 14px/20px var(--font-sans)' }}>{testedOk ? 'وصل الاختبار' : 'الاختبار قبل الإرسال (إلزاميّ)'}</b>
            </div>
            <p style={{ margin: 0, font: '400 13px/20px var(--font-sans)', color: 'var(--ink-2)' }}>
              يصل من رقم الأعمال كما سيصل الناس (بالاسم والتذييل{img ? (img.kind === 'video' ? ' والفيديو' : ' والصورة') : ''}) إلى:{' '}
              {testRcpts === null ? '…' : testRcpts.length ? <b style={{ color: 'var(--ink)' }}>{testRcpts.map(r => r.name).join('، ')}</b> : <span style={{ color: 'var(--danger)' }}>لا أرقام إداريّين مربوطة</span>}
            </p>
            {testedOk && <p style={{ margin: 0, font: '500 13px/20px var(--font-sans)', color: 'var(--ok)' }}>خرج {new Date(tested!.at).toLocaleTimeString('ar-JO-u-nu-latn', { hour: 'numeric', minute: '2-digit' })} — راجعوه على هواتفكم ثمّ اضغط «أرسل».</p>}
            {tested && !testedOk && <p className="row" style={{ margin: 0, font: '500 13px/20px var(--font-sans)', color: 'var(--warn)', alignItems: 'flex-start' }}><TriangleAlert aria-hidden />تغيّرت الرسالة بعد الاختبار (أو مضى عليه 12 ساعة) — اختبر من جديد.</p>}
            {testedOk && tested!.sentTo.some(x => !x.ok) && (
              <p style={{ ...SMALL, margin: 0, color: 'var(--warn)' }}>{tested!.sentTo.filter(x => !x.ok).map(x => `${x.name}: ${x.error}`).join(' · ')}</p>
            )}
            {testedOk && (
              <button type="button" disabled={!canTest} onClick={runTest} className="wa-btn" style={{ alignSelf: 'flex-start' }}>
                {testing ? <><Loader2 aria-hidden className="animate-spin" />يرسل…</> : <><RotateCw aria-hidden />أعد الاختبار</>}
              </button>
            )}
          </div>

          {blockedReason && <Banner tone="danger" icon={<Ban aria-hidden />}><b>{blockedReason}</b></Banner>}
        </div>

        {preview}
      </div>
    </section>
  );

  // ══ الزرّ الرئيس في الشريط السفليّ ══
  const primary: { label: string; icon: ReactNode; disabled: boolean; onClick: () => void; cls: 'primary' | 'send' } = step === 1
    ? { label: 'التالي: الرسالة', icon: null, disabled: !audienceOk || (!loading && rows.length === 0), onClick: () => go(2), cls: 'primary' }
    : step === 2
      ? { label: 'التالي: المراجعة', icon: null, disabled: !messageOk, onClick: () => go(3), cls: 'primary' }
      : !testedOk
        ? { label: testing ? 'يرسل الاختبار…' : 'أرسل الاختبار', icon: testing ? <Loader2 aria-hidden className="animate-spin" /> : <FlaskConical aria-hidden />, disabled: !canTest || !audienceOk, onClick: runTest, cls: 'primary' }
        : { label: sending ? 'جاري البدء…' : `أرسل إلى ${targets.length}`, icon: sending ? <Loader2 aria-hidden className="animate-spin" /> : <Megaphone aria-hidden />, disabled: !canSend, onClick: send, cls: 'send' };

  return (
    <div ref={rootRef} className="stack" style={{ gap: 'var(--space-5)' }} dir="rtl">
      {/* بثّ جديد | السجلّ */}
      <PageHead title="البثّ">
        <Seg<'compose' | 'history'> value={view} onChange={setView} label="عرض البثّ"
          options={[['compose', <><PenLine aria-hidden />بثّ جديد</>], ['history', <><History aria-hidden />السجلّ</>]]} />
      </PageHead>

      {liveStrip}

      {view === 'history' ? (
        <BroadcastHistory apiFetch={apiFetch} refreshKey={historyTick}
          onReuse={text => { setBody(text); setTplId(null); setView('compose'); go(audienceOk ? 2 : 1); swalToast('نُسخ النصّ إلى المحرّر', 'success'); }} />
      ) : (
        <div className="wa-card" style={{ padding: 0 }}>
          {/* رأس الخطوات — لاصقٌ أعلى عمود التمرير */}
          <div ref={stepAnchorRef} />
          <div className="wa-steps wa-sticky" style={{ paddingInline: 'var(--space-2)', background: 'var(--bg-100)', borderRadius: 'var(--radius-md) var(--radius-md) 0 0' }}>
            {STEPS.map(s => {
              const on = step === s.n;
              const doneS = s.n < step || (s.n === 1 && audienceOk && step > 1) || (s.n === 2 && messageOk && step > 2);
              const reachable = canReach(s.n);
              return (
                <button key={s.n} type="button" onClick={() => go(s.n)} disabled={!reachable} aria-current={on ? 'step' : undefined}
                  className={doneS && !on ? 'done' : undefined} style={!reachable ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}>
                  <span className="i">{doneS && !on ? <Check className="s" aria-hidden /> : s.n}</span>
                  {s.label}
                </button>
              );
            })}
          </div>

          <div className="p-3 md:p-5">
            {step === 1 ? stepAudience : step === 2 ? stepMessage : stepReview}
          </div>

          {/* الشريط السفليّ الثابت: العدد + الرجوع + التالي */}
          <div className="wa-actionbar" style={{ position: 'sticky', bottom: 0, zIndex: 3, borderRadius: '0 0 var(--radius-md) var(--radius-md)' }}>
            <div className="sum">
              <b className="trunc"><bdi className="ltr">{loading ? '…' : targets.length}</bdi> مستلماً</b>
              <span className="trunc" style={barDanger ? { color: 'var(--danger)' } : undefined}>{barHint}</span>
            </div>
            {step > 1 && (
              <button type="button" onClick={() => go((step - 1) as Step)} className="wa-btn ghost" style={{ paddingInline: 'var(--space-2)' }}>رجوع</button>
            )}
            <button type="button" disabled={primary.disabled} onClick={primary.onClick} className={`wa-btn ${primary.cls}`}>
              {primary.icon}{primary.label}
            </button>
          </div>
        </div>
      )}

      {/* 📄 لوح القوالب */}
      {tplSheet && (
        <Pop title="القوالب المحفوظة" label="القوالب المحفوظة" onClose={() => setTplSheet(false)}>
          <div className="stack" role="radiogroup" style={{ gap: 'var(--space-2)' }}>
            <OptionRow selected={tplId === null} onClick={() => { setTplId(null); setTplSheet(false); }} title="بلا قالب" sub="أكمل بالنصّ الحاليّ" />
            {tpls.map(t => (
              <OptionRow key={t.id} selected={tplId === t.id}
                onClick={() => { setTplId(t.id); setBody(t.body); setTplSheet(false); }}
                title={`${t.name}${t.usedCount ? ` · استُعمل ${t.usedCount}` : ''}`} sub={t.body.split('\n').find(l => l.trim()) || ''} />
            ))}
            {tpls.length === 0 && <p className="muted" style={{ ...SMALL, margin: 0, paddingBlock: 'var(--space-2)' }}>اكتب رسالة ثمّ «حفظ كقالب» لتظهر هنا.</p>}
          </div>
        </Pop>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🧩 عناصر العرض — بلا حالة، من أصناف wa-* (مقاسات لمس ٤٤+ وخطّ ١٢+)
// ══════════════════════════════════════════════════════
type Step = 1 | 2 | 3;
const STEPS: Array<{ n: Step; label: string }> = [
  { n: 1, label: 'لمن؟' },
  { n: 2, label: 'الرسالة' },
  { n: 3, label: 'أرسل' },
];
const SMALL = { font: '500 12px/16px var(--font-sans)' } as const;
const LABEL = { font: '700 12px/16px var(--font-sans)' } as const;
const SUBHEAD = { font: '700 13px/18px var(--font-sans)', color: 'var(--ink-2)' } as const;
const FILTER_META: Record<Filter, { Icon: LucideIcon; label: string; hint: string }> = {
  all: { Icon: Globe, label: 'الكلّ', hint: 'كلّ من يمكن مراسلته' },
  players: { Icon: Users, label: 'لاعبون مسجّلون', hint: 'لهم حساب في التطبيق' },
  visitors: { Icon: Hand, label: 'زوّار', hint: 'راسلونا بلا حساب' },
  booked_upcoming: { Icon: CalendarCheck, label: 'لهم حجز قادم', hint: 'في أيّ فعاليّة قادمة' },
  activity: { Icon: Ticket, label: 'حاجزو فعاليّة', hint: 'من حجز في فعاليّة تختارها' },
  not_booked_activity: { Icon: DoorOpen, label: 'لم يحجزوا في فعاليّة', hint: 'لتذكير من لم يحجز بعد' },
  played: { Icon: Dice5, label: 'لعبوا معنا', hint: 'في فعاليّة سابقة — ولم يحجزوا في القادمة (اختياريّ)' },
};
const AUDIENCE_GROUPS: Array<{ title: string; keys: Filter[] }> = [
  { title: 'عامّ', keys: ['all', 'players', 'visitors'] },
  { title: 'حسب الحجز', keys: ['booked_upcoming', 'activity', 'not_booked_activity'] },
  { title: 'حسب اللعب', keys: ['played'] },
];
const VARS: Array<{ token: string; label: string }> = [
  { token: '{الاسم}', label: 'الاسم' },
  { token: '{الاسم_الكامل}', label: 'الاسم الكامل' },
  { token: '{الرتبة}', label: 'الرتبة' },
  { token: '{الفعالية}', label: 'الفعاليّة' },
  { token: '{الموعد}', label: 'الموعد' },
  { token: '{المكان}', label: 'المكان' },
  { token: '{الموقع}', label: 'الموقع الكامل' },
];

function StepTitle({ n, title, sub }: { n: number; title: string; sub?: string }) {
  return (
    <div>
      <div style={{ ...LABEL, color: 'var(--gold)' }}>الخطوة {n} من 3</div>
      <h3 style={{ margin: 0, font: '700 18px/26px var(--font-sans)', color: 'var(--ink)' }}>{title}</h3>
      {sub && <p className="muted" style={{ margin: 0, font: '400 13px/20px var(--font-sans)' }}>{sub}</p>}
    </div>
  );
}

function Panel({ title, sub, children, tone = 'default' }: { title: string; sub?: string; children: ReactNode; tone?: 'default' | 'warn' }) {
  return (
    <div className="wa-card stack" style={tone === 'warn' ? { borderColor: 'var(--warn)' } : undefined}>
      <div>
        <div style={{ font: '700 14px/20px var(--font-sans)' }}>{title}</div>
        {sub && <div className="muted" style={SMALL}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function OptionRow({ selected, onClick, title, sub }: { selected: boolean; onClick: () => void; title: string; sub?: string }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick} className="wa-radio">
      <span className="t">
        <b className="trunc">{title}</b>
        {sub && <span className="trunc">{sub}</span>}
      </span>
      <span className="o" />
    </button>
  );
}

function Disclosure({ title, icon, badge, open, onToggle, children, compact }: { title: string; icon?: ReactNode; badge?: number; open: boolean; onToggle: () => void; children: ReactNode; compact?: boolean }) {
  const chevron = open ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />;
  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      {compact ? (
        <button type="button" onClick={onToggle} aria-expanded={open} className="wa-btn ghost" style={{ alignSelf: 'flex-start', paddingInline: 0, fontWeight: 500, fontSize: 13 }}>
          {title}{chevron}
        </button>
      ) : (
        <button type="button" onClick={onToggle} aria-expanded={open} className="wa-acc">
          {icon}<span>{title}</span>
          <span className="end">{badge ? <span className="wa-badge gold">{badge}</span> : null}{chevron}</span>
        </button>
      )}
      {open && <div className={compact ? undefined : 'wa-card'}>{children}</div>}
    </div>
  );
}

function SummaryRow({ label, onEdit, children }: { label: string; onEdit?: () => void; children: ReactNode }) {
  return (
    <div className="wa-setting" style={{ alignItems: 'flex-start', gap: 'var(--space-3)' }}>
      <span className="muted" style={{ width: 56, flex: 'none', font: '400 13px/22px var(--font-sans)' }}>{label}</span>
      <div className="grow" style={{ font: '400 14px/22px var(--font-sans)' }}>{children}</div>
      {onEdit && <button type="button" onClick={onEdit} className="wa-btn ghost" style={{ color: 'var(--gold)', flex: 'none' }}>تعديل</button>}
    </div>
  );
}
