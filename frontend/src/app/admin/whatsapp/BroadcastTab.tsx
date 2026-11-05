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
const fmt = (iso: string) => new Date(iso).toLocaleString('ar-JO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' });

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
    const t = d.toLocaleTimeString('ar-JO', { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `اليوم ${t}`;
    const tm = new Date(now); tm.setDate(now.getDate() + 1);
    if (d.toDateString() === tm.toDateString()) return `غداً ${t}`;
    const ys = new Date(now); ys.setDate(now.getDate() - 1);
    if (d.toDateString() === ys.toDateString()) return `أمس ${t}`;
    return `${d.toLocaleDateString('ar-JO', { weekday: 'long', day: 'numeric', month: 'short' })} ${t}`;
  };
  const LANE_TONE: Record<string, { dot: string; text: string; label: string }> = {
    sending: { dot: 'bg-emerald-400 animate-pulse', text: 'text-emerald-300', label: '🟢 يُرسل الآن' },
    paused: { dot: 'bg-amber-400', text: 'text-amber-300', label: '⏸️ متوقّف مؤقّتاً' },
    idle: { dot: 'bg-gray-500', text: 'text-gray-400', label: '✓ لا شيء في الطابور' },
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
    if (getComputedStyle(el).overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 1) { el.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const anchor = stepAnchorRef.current || el;
    const top = anchor.getBoundingClientRect().top + window.scrollY - (window.innerWidth < 768 ? 64 : 0);
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
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
      return aud?.byChannel ? `☁️ ${aud.byChannel.cloud} · 📱 ${aud.byChannel.web}` : '';
    }
    if (step === 2) {
      if (imgBusy) return 'يُرفع الوسيط…';
      if (body.trim().length < 5) return 'اكتب الرسالة (5 أحرف على الأقلّ)';
      if (body.length > bodyMax) return `النصّ أطول من ${bodyMax}`;
      if (actVarsUsed && !activityId) return 'النصّ فيه متغيّرات فعاليّة — اختر الفعاليّة';
      return `${body.length} / ${bodyMax} حرفاً`;
    }
    if (blockedReason) return `⛔ ${blockedReason}`;
    if (missingActivity || missingPlayed) return 'ارجع وأكمل الجمهور';
    return testedOk ? '✅ وصل الاختبار — راجعه على هاتفك ثمّ أرسل' : 'الاختبار إلزاميّ قبل الإرسال';
  })();

  // ── عناصر مشتركة ──
  const upcomingList = (required: boolean) => (
    <div role="radiogroup" className="space-y-1.5">
      {!required && <OptionRow selected={!activityId} onClick={() => pickAct(null)} title="بلا فعاليّة قادمة" />}
      {activities.map(a => (
        <OptionRow key={a.id} selected={activityId === a.id} onClick={() => pickAct(a.id)}
          title={a.name} sub={`${a.when || fmt(a.date)}${a.venue ? ` · ${a.venue}` : ''}`} />
      ))}
      {activities.length === 0 && <p className="text-[12.5px] text-gray-500 px-1">لا فعاليّات قادمة.</p>}
    </div>
  );

  const liveStrip = live && live.broadcasts.length > 0 && (
    <div className="space-y-2">
      {live.broadcasts.map(b => {
        const ln = live.lane || {};
        const tone = LANE_TONE[ln.state] || LANE_TONE.paused;
        const done = b.sent + b.failed;
        const pct = b.total ? Math.round((done / b.total) * 100) : 0;
        const open = liveOpen.has(b.id);
        const canStop = status?.running === b.id;
        return (
          <div key={b.id} className="rounded-2xl border border-sky-500/25 bg-sky-500/5">
            <button type="button" onClick={() => setLiveOpen(p => { const n = new Set(p); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })}
              className="w-full text-right p-3 space-y-2" aria-expanded={open}>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${tone.dot}`} />
                <b className="text-white text-[13.5px]">بثّ #{b.id} {b.media === 'video' ? '🎬' : b.media === 'image' ? '🖼️' : ''}</b>
                <span className={`text-[12px] font-bold ${tone.text}`}>{b.queued === 0 ? '✓ خرجت كلّها' : tone.label}</span>
                <span className="mr-auto text-[12.5px] text-gray-300 tabular-nums">{b.sent}/{b.total}</span>
                <span className={`text-gray-500 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden"><div className="h-full bg-sky-400" style={{ width: `${pct}%` }} /></div>
            </button>
            {open && (
              <div className="px-3 pb-3 space-y-2">
                <div className="text-[12.5px] text-gray-400 truncate">{String(b.text || '').split('\n').find((l: string) => l.trim()) || ''}</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px] text-gray-300 tabular-nums">
                  <span>أُرسل <b className="text-white">{b.sent}</b> من {b.total}</span>
                  <span>في الطابور <b className="text-amber-200">{b.queued}</b>{b.sending ? ` (${b.sending} الآن)` : ''}</span>
                  <span>وصل {b.delivered} · قُرئ {b.read}</span>
                  {b.failed > 0 ? <span className="text-rose-300">فشل {b.failed}</span> : <span />}
                  <span className="col-span-2">آخر رسالة: <b className="text-white">{fmtAt(b.lastSentAt)}</b> · بدأ {fmtAt(b.createdAt)}{b.createdBy ? ` · ${b.createdBy}` : ''}</span>
                </div>
                {b.queued > 0 && ln.state && (
                  <div className={`text-[12.5px] rounded-xl px-3 py-2 border ${ln.state === 'sending' ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-200' : 'border-amber-500/25 bg-amber-500/5 text-amber-100'}`}>
                    <b>{ln.state === 'sending' ? 'يُرسل:' : 'سبب التوقّف:'}</b> {ln.reason}
                    {ln.resumeAt && <span> — {ln.state === 'sending' ? 'التالية' : 'يستأنف'} <b>{fmtAt(ln.resumeAt)}</b></span>}
                    {ln.code === 'daily_cap' && ln.tomorrowCap ? <span> بحدّ {ln.tomorrowCap}</span> : null}
                    <div className="text-[11.5px] text-gray-400 mt-1 tabular-nums">
                      اليوم {ln.todaySent}/{ln.dayCap ?? '∞'} · آخر ساعة {ln.hourSent}/{ln.hourCap} · ساعات الإرسال {ln.window}{ln.warmup ? ' · التسخين مفعّل' : ''}
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
                    }} className="min-h-[44px] px-4 rounded-xl text-[13px] font-bold bg-emerald-500/15 text-emerald-200 border border-emerald-500/40">▶ استأنف الآن</button>
                  )}
                  {canStop && (
                    <button type="button" onClick={() => stop(b.id)} className="min-h-[44px] px-4 rounded-xl text-[13px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">⏹ أوقف البثّ</button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // ══ الخطوة ١: لمن؟ ══
  const stepAudience = (
    <section className="space-y-5">
      <StepTitle n={1} title="لمن تُرسل؟" sub="اختر الجمهور، وضيّقه من «تضييق إضافي» إن احتجت." />
      {AUDIENCE_GROUPS.map(g => (
        <div key={g.title}>
          <div className="text-[12px] font-bold text-gray-500 mb-2">{g.title}</div>
          <div role="radiogroup" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {g.keys.map(k => {
              const m = FILTER_META[k];
              const on = filter === k;
              return (
                <button key={k} type="button" role="radio" aria-checked={on}
                  onClick={() => { setFilter(k); setExcluded(new Set()); }}
                  className={`flex items-center gap-3 text-right rounded-2xl border px-3.5 py-3 min-h-[60px] transition-colors ${on ? 'bg-amber-500/10 border-amber-500/50' : 'bg-gray-900/60 border-gray-800 hover:border-gray-700'}`}>
                  <span className="text-xl shrink-0" aria-hidden>{m.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-[14px] font-bold ${on ? 'text-amber-300' : 'text-white'}`}>{m.label}</span>
                    <span className="block text-[12px] text-gray-500 leading-snug">{m.hint}</span>
                  </span>
                  <span className={`w-5 h-5 rounded-full border-2 shrink-0 ${on ? 'border-amber-400 bg-amber-400 shadow-[inset_0_0_0_3px_#1a1a1a]' : 'border-gray-600'}`} />
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
        <div className="space-y-3">
          <PlayedActivityPicker apiFetch={apiFetch} value={playedIds} onChange={ids => { setPlayedIds(ids); setExcluded(new Set()); }} />
          <Panel title="ولم يحجزوا بعد في…" sub="اختياريّ — فعاليّة قادمة تدعوهم إليها، وتُستعمل أيضاً لمتغيّرات النصّ.">
            {upcomingList(false)}
            {activityId && (
              <Toggle checked={playedNotBooked} onChange={v => { setPlayedNotBooked(v); setExcluded(new Set()); }}
                label={<>فقط من <b className="text-white">لم يحجز بعد</b> في «{act?.name}»</>} />
            )}
          </Panel>
        </div>
      )}

      <Disclosure title="⚙️ تضييق إضافي" badge={advancedCount} open={advOpen} onToggle={() => setAdvOpen(v => !v)}>
        <div className="space-y-4">
          {showChannel && (
            <div>
              <div className="text-[12.5px] font-bold text-gray-300 mb-1.5">القناة</div>
              <div className="grid grid-cols-3 gap-1.5">
                {([['all', 'الكلّ', aud?.byChannel ? (aud.byChannel.cloud + aud.byChannel.web) : null], ['cloud', '☁️ ميتا', aud?.byChannel?.cloud], ['web', '📱 رقم الأعمال', aud?.byChannel?.web]] as const).map(([k, l, n]) => (
                  <button key={k} type="button" onClick={() => { setChannel(k); setExcluded(new Set()); }}
                    className={`min-h-[48px] rounded-xl text-[13px] font-bold border ${channel === k ? 'bg-teal-500/10 text-teal-300 border-teal-500/40' : 'border-gray-800 text-gray-400'}`}>
                    {l}{n != null && channel === 'all' ? <span className="block text-[11px] font-normal opacity-70 tabular-nums">{n}</span> : null}
                  </button>
                ))}
              </div>
              <p className="text-[12px] text-gray-500 mt-1.5">ميتا: لمن راسلنا خلال 24 ساعة فقط. رقم الأعمال: بلا نافذة، بطابورٍ متباعد.</p>
            </div>
          )}
          {showLine && (
            <div>
              <div className="text-[12.5px] font-bold text-gray-300 mb-1.5">من يراسله رقم الأعمال؟</div>
              <div role="radiogroup" className="space-y-1.5">
                {LINE_OPTS.map(o => (
                  <OptionRow key={o.key || 'def'} selected={line === o.key} onClick={() => { setLine(o.key); setExcluded(new Set()); }}
                    title={o.label} sub={o.key === '' ? 'ما ضبطته في «القنوات»' : o.key === 'all' ? 'قد يبدأ محادثةً باردة — بحذر' : undefined} />
                ))}
              </div>
              {line === 'two_way' && (
                <div className="mt-2.5">
                  <div className="text-[12px] text-gray-500 mb-1.5">راسَلنا خلال:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {([['', 'أيّ وقت'], ['7', '7 أيّام'], ['30', '30 يوماً'], ['90', '90 يوماً']] as const).map(([k, l]) => (
                      <button key={k || 'any'} type="button" onClick={() => { setLineSince(k); setExcluded(new Set()); }}
                        className={`min-h-[40px] px-3 rounded-xl text-[12.5px] font-bold border ${lineSince === k ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40' : 'border-gray-800 text-gray-400'}`}>{l}</button>
                    ))}
                    <label className={`flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl text-[12.5px] font-bold border ${/^\d{4}-/.test(lineSince) ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40' : 'border-gray-800 text-gray-400'}`}>
                      منذ
                      <input type="date" value={/^\d{4}-/.test(lineSince) ? lineSince : ''} max={new Date().toISOString().slice(0, 10)}
                        onChange={e => { setLineSince(e.target.value); setExcluded(new Set()); }}
                        className="bg-transparent text-white outline-none [color-scheme:dark]" style={{ fontSize: 16 }} aria-label="راسَلنا منذ تاريخ" />
                    </label>
                  </div>
                  <p className="text-[12px] text-gray-500 mt-1.5">بحسب آخر رسالةٍ منه.</p>
                </div>
              )}
            </div>
          )}
          {sentHistory.length > 0 && (
            <div>
              <div className="text-[12.5px] font-bold text-gray-300 mb-1.5">استثنِ من وصلهم بثّ سابق</div>
              <div className="space-y-1.5">
                {sentHistory.map(h => {
                  const on = exB.includes(h.id);
                  return (
                    <button key={h.id} type="button" onClick={() => { setExB(p => on ? p.filter(x => x !== h.id) : [...p, h.id]); setExcluded(new Set()); }}
                      className={`w-full flex items-center gap-3 text-right rounded-xl border px-3 py-2 min-h-[52px] ${on ? 'bg-rose-500/10 border-rose-500/40' : 'border-gray-800'}`}>
                      <span className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center text-[12px] ${on ? 'border-rose-400 bg-rose-500/30 text-rose-100' : 'border-gray-600'}`}>{on ? '✓' : ''}</span>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-[13px] font-bold ${on ? 'text-rose-200' : 'text-gray-200'}`}>#{h.id} · {fmt(h.createdAt)} · {h.sentCount} مستلماً</span>
                        <span className="block text-[12px] text-gray-500 truncate">{bodyOf(h.body).split('\n')[0]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!showChannel && !showLine && sentHistory.length === 0 && <p className="text-[12.5px] text-gray-500">لا خيارات إضافيّة لهذا الجمهور.</p>}
        </div>
      </Disclosure>

      <Disclosure title="ℹ️ كيف يعمل البثّ؟" open={helpOpen} onToggle={() => setHelpOpen(v => !v)}>
        <ul className="text-[13px] leading-relaxed text-gray-300 space-y-1.5 list-disc pr-4">
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
    <section className="space-y-4">
      <StepTitle n={2} title="الرسالة" sub="اكتبها أو ابدأ من قالب، وأضف صورة أو فيديو إن شئت." />

      <button type="button" onClick={() => setTplSheet(true)}
        className="w-full flex items-center gap-3 text-right rounded-2xl border border-gray-800 bg-gray-900/60 px-3.5 min-h-[52px]">
        <span aria-hidden>📄</span>
        <span className="flex-1 min-w-0 text-[14px] truncate">
          {currentTpl ? <><span className="text-gray-500">القالب: </span><b className="text-white">{currentTpl.name}</b>{tplDirty ? <span className="text-amber-300 text-[12px]"> · معدَّل</span> : null}</>
            : <span className="text-gray-300">{tpls.length ? `ابدأ من قالب محفوظ (${tpls.length})` : 'لا قوالب محفوظة بعد'}</span>}
        </span>
        <span className="text-gray-500">▾</span>
      </button>

      <div>
        <textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} rows={8} maxLength={bodyMax} dir="rtl"
          placeholder={'مثال:\nمسا الخير {الاسم} 🎭\nبكرا الخميس لعبة الساعة 7 بمزاج أفندينا — بقي مقاعد قليلة. احجز من هون بكلمة «احجز».'}
          className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-3.5 py-3 text-white leading-relaxed focus:border-amber-500/50 outline-none"
          style={{ fontSize: 16 }} />
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`text-[12px] tabular-nums ${body.length > bodyMax - 50 ? 'text-rose-400' : 'text-gray-500'}`}>
            {body.length} / {bodyMax}{img && <span className="text-amber-400/70"> · تعليق {body.length + (footer ? OPTOUT_FOOTER.length : 0)} / {CAPTION_MAX}</span>}
          </span>
          <span className="mr-auto flex gap-1.5">
            <button type="button" onClick={saveTpl} className="min-h-[36px] px-3 rounded-xl text-[12.5px] font-bold border border-gray-800 text-gray-300">💾 {currentTpl && tplDirty ? 'حفظ التعديل' : 'حفظ كقالب'}</button>
            {currentTpl && <button type="button" onClick={deleteTpl} aria-label="حذف القالب" className="min-h-[36px] px-3 rounded-xl text-[12.5px] font-bold border border-gray-800 text-rose-300/80">🗑</button>}
          </span>
        </div>
      </div>

      {/* المتغيّرات: شريطٌ أفقيّ — يُدرج عند المؤشّر */}
      <div>
        <div className="text-[12px] text-gray-500 mb-1.5">أدرج في النصّ:</div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]">
          {VARS.map(v => (
            <button key={v.token} type="button" onMouseDown={e => e.preventDefault()} onClick={() => insertVar(v.token)}
              className="shrink-0 min-h-[40px] px-3 rounded-xl text-[12.5px] bg-gray-800 text-gray-200 border border-gray-700/60">{v.label}</button>
          ))}
        </div>
        <Disclosure title="ما معنى المتغيّرات؟" open={varsHelp} onToggle={() => setVarsHelp(v => !v)} compact>
          <ul className="text-[12.5px] leading-relaxed text-gray-400 space-y-1 list-disc pr-4">
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
            <div className="flex items-center gap-3">
              <span className="flex-1 min-w-0 text-[13.5px] text-white truncate">✓ {act?.name} <span className="text-gray-500">· {act?.when || (act ? fmt(act.date) : '')}</span></span>
              <button type="button" onClick={() => setActListOpen(true)} className="min-h-[40px] px-3 rounded-xl text-[12.5px] font-bold border border-gray-800 text-gray-300">تغيير</button>
            </div>
          ) : (
            <div onClick={() => setActListOpen(false)}>{upcomingList(true)}</div>
          )}
        </Panel>
      )}

      {/* الوسيط */}
      <input ref={imgRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={e => pickImg(e.target.files?.[0])} />
      <input ref={vidRef} type="file" accept="video/mp4" className="hidden" onChange={e => pickVid(e.target.files?.[0])} />
      {img ? (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-2.5">
          {img.kind === 'video'
            ? <video src={`${API_URL}${img.url}`} muted preload="metadata" className="w-14 h-14 rounded-xl object-cover bg-black" />
            : <img src={`${API_URL}${img.url}`} alt="" className="w-14 h-14 rounded-xl object-cover" />}
          <span className="flex-1 text-[13px] text-amber-100/90 tabular-nums">
            {img.kind === 'video' ? `🎬 فيديو · ${(img.bytes / 1048576).toFixed(1)} م.ب` : `🖼️ صورة · ${Math.round(img.bytes / 1024)} ك.ب`}
            <span className="block text-[12px] text-gray-500">النصّ يصير تعليقها</span>
          </span>
          <button type="button" onClick={() => setImg(null)} className="min-h-[44px] px-3 rounded-xl text-[13px] font-bold text-rose-300 border border-rose-500/30">إزالة</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={imgBusy} onClick={() => imgRef.current?.click()}
            className="min-h-[52px] rounded-2xl text-[13.5px] font-bold border border-gray-800 bg-gray-900/60 text-gray-200 disabled:opacity-40">
            {imgBusy ? '⏳ يُرفع…' : '🖼️ أضف صورة'}
          </button>
          <button type="button" disabled={imgBusy} onClick={() => vidRef.current?.click()}
            className="min-h-[52px] rounded-2xl text-[13.5px] font-bold border border-gray-800 bg-gray-900/60 text-gray-200 disabled:opacity-40">
            🎬 أضف فيديو
          </button>
        </div>
      )}
      {!img && <p className="text-[12px] text-gray-500 -mt-2">صورة JPG/PNG أو فيديو MP4 حتّى {VIDEO_MAX_MB} م.ب — رسالةٌ واحدة لا رسالتان.</p>}

      <Toggle checked={footer} onChange={setFooter}
        label={<>تذييل «لإيقاف هذه الرسائل أرسل: إيقاف» <span className="block text-[12px] text-gray-500">يُنصح بإبقائه — البلاغات هي ما يُغلق الحسابات</span></>} />
    </section>
  );

  // ══ الخطوة ٣: راجع وأرسل ══
  const stepReview = (
    <section className="space-y-4">
      <StepTitle n={3} title="راجع وأرسل" sub="اختبر على هاتفك أوّلاً، ثمّ اعتمد البثّ." />

      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 divide-y divide-gray-800/80">
        <SummaryRow label="لمن" onEdit={() => go(1)}>
          <span className="text-white">{audienceText}</span>
          {advancedCount > 0 && <span className="block text-[12px] text-gray-500">+ {advancedCount} تضييق إضافي</span>}
        </SummaryRow>
        <SummaryRow label="العدد">
          <b className="text-amber-300 text-[16px] tabular-nums">{targets.length}</b> <span className="text-gray-400">مستلماً</span>
          {excluded.size > 0 && <span className="text-gray-500"> · استبعدت {excluded.size}</span>}
          {aud?.byChannel && <span className="block text-[12px] text-gray-500">☁️ ميتا {aud.byChannel.cloud} · 📱 رقم الأعمال {aud.byChannel.web}</span>}
          {aud?.capped && <span className="block text-[12px] text-amber-300/90">الجمهور أكبر من السقف — يُرسل لأوّل {aud.maxTargets}</span>}
          {aud?.estimate && <span className="block text-[12px] text-teal-200/90">📱 نحو {aud.estimate.minutesFirstDay} دقيقة اليوم{aud.estimate.days > 1 ? ` — تكتمل خلال ${aud.estimate.days} أيّام (${aud.estimate.perDay} يوميّاً)` : ''}</span>}
        </SummaryRow>
        <SummaryRow label="الرسالة" onEdit={() => go(2)}>
          <span className="text-white">{img ? (img.kind === 'video' ? '🎬 فيديو بتعليق' : '🖼️ صورة بتعليق') : '💬 نصّ'}</span>
          <span className="text-gray-500"> · {footer ? 'مع تذييل الإيقاف' : 'بلا تذييل'}</span>
          {currentTpl && !tplDirty && <span className="block text-[12px] text-gray-500">القالب «{currentTpl.name}»</span>}
        </SummaryRow>
      </div>

      {body.trim() && (
        <div>
          <div className="text-[12px] text-gray-500 mb-1.5">كما تصل إلى {sample?.name || 'المستلم'}:</div>
          <div className="rounded-2xl p-3" style={{ background: '#0b141a' }}>
            <div className="max-w-[88%] mr-auto rounded-2xl rounded-tr-sm px-3 py-2 text-[14px] text-white whitespace-pre-wrap leading-relaxed" style={{ background: '#005c4b' }}>
              {img && (img.kind === 'video'
                ? <video src={`${API_URL}${img.url}`} controls preload="metadata" className="block w-full max-h-60 rounded-xl mb-1.5 bg-black" />
                : <img src={`${API_URL}${img.url}`} alt="" className="block w-full max-h-56 object-cover rounded-xl mb-1.5" />)}
              {fill(body, { ...(sample || { name: '', rank: '' }), activity: act?.name, venue: act?.venue, place: (act as any)?.place, when: act?.when })}{footer ? OPTOUT_FOOTER : ''}
            </div>
          </div>
        </div>
      )}

      <Disclosure title={`👥 المستلمون (${targets.length})`} badge={excluded.size || undefined} open={rcptOpen} onToggle={() => setRcptOpen(v => !v)}>
        {err && <p className="text-[12.5px] text-rose-400 mb-2">⚠️ {err}</p>}
        {loading ? <p className="text-[12.5px] text-gray-500">جاري التحميل…</p> : rows.length === 0 ? (
          <p className="text-[12.5px] text-gray-500">لا أحد يمكن مراسلته ضمن هذا الجمهور.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <input value={rcptQ} onChange={e => setRcptQ(e.target.value)} placeholder="ابحث باسم أو رقم…"
                className="flex-1 min-w-0 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white outline-none" style={{ fontSize: 16 }} />
              {excluded.size > 0 && <button type="button" onClick={() => setExcluded(new Set())} className="min-h-[44px] px-3 rounded-xl text-[12.5px] border border-gray-800 text-gray-300 whitespace-nowrap">أعد ({excluded.size})</button>}
            </div>
            <p className="text-[12px] text-gray-500 mb-1">أزل العلامة عمّن لا تريد مراسلته.</p>
            <div className="max-h-[50vh] overflow-y-auto divide-y divide-gray-800/70 -mx-1 px-1">
              {rcptRows.map(r => {
                const off = excluded.has(r.id);
                return (
                  <label key={r.id} className={`flex items-center gap-3 min-h-[52px] py-1.5 cursor-pointer ${off ? 'opacity-40' : ''}`}>
                    <input type="checkbox" checked={!off} className="w-5 h-5 accent-amber-500 shrink-0"
                      onChange={() => setExcluded(p => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] text-white truncate">{r.name}</span>
                      <span className="block text-[12px] text-gray-500" dir="ltr" style={{ textAlign: 'right' }}>{r.phone}{r.rank ? ` · ${r.rank}` : r.isPlayer ? '' : ' · زائر'}</span>
                    </span>
                    {r.via === 'web'
                      ? <span className="text-[12px] text-teal-300 whitespace-nowrap" title="يصله من رقم الأعمال — بلا نافذة">📱</span>
                      : <span className="text-[12px] text-gray-400 tabular-nums whitespace-nowrap" title="الوقت المتبقّي قبل إغلاق نافذته">⏳ {r.windowClosesAt ? hoursLeft(r.windowClosesAt) : '—'}</span>}
                  </label>
                );
              })}
              {rcptRows.length === 0 && <p className="text-[12.5px] text-gray-500 py-3">لا نتائج.</p>}
            </div>
          </>
        )}
      </Disclosure>

      {/* 🧪 الاختبار الإلزاميّ */}
      <div className={`rounded-2xl border p-3.5 space-y-2 ${testedOk ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-sky-500/30 bg-sky-500/5'}`}>
        <div className="flex items-center gap-2">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-black ${testedOk ? 'bg-emerald-500/20 text-emerald-300' : 'bg-sky-500/20 text-sky-300'}`}>{testedOk ? '✓' : '🧪'}</span>
          <b className={`text-[14px] ${testedOk ? 'text-emerald-300' : 'text-sky-300'}`}>{testedOk ? 'وصل الاختبار' : 'الاختبار قبل الإرسال (إلزاميّ)'}</b>
        </div>
        <p className="text-[12.5px] text-gray-400 leading-relaxed">
          يصل من رقم الأعمال كما سيصل الناس (بالاسم والتذييل{img ? (img.kind === 'video' ? ' والفيديو' : ' والصورة') : ''}) إلى:{' '}
          {testRcpts === null ? '…' : testRcpts.length ? <b className="text-gray-200">{testRcpts.map(r => r.name).join('، ')}</b> : <span className="text-rose-300">لا أرقام إداريّين مربوطة</span>}
        </p>
        {testedOk && <p className="text-[12.5px] text-emerald-300">خرج {new Date(tested!.at).toLocaleTimeString('ar-JO', { hour: 'numeric', minute: '2-digit' })} — راجعوه على هواتفكم ثمّ اضغط «أرسل».</p>}
        {tested && !testedOk && <p className="text-[12.5px] text-amber-300">⚠️ تغيّرت الرسالة بعد الاختبار (أو مضى عليه 12 ساعة) — اختبر من جديد.</p>}
        {testedOk && tested!.sentTo.some(x => !x.ok) && (
          <p className="text-[12px] text-amber-300/90">{tested!.sentTo.filter(x => !x.ok).map(x => `${x.name}: ${x.error}`).join(' · ')}</p>
        )}
        {testedOk && (
          <button type="button" disabled={!canTest} onClick={runTest} className="min-h-[40px] px-3 rounded-xl text-[12.5px] font-bold border border-sky-500/40 text-sky-200 disabled:opacity-40">
            {testing ? '⏳ يرسل…' : '↻ أعد الاختبار'}
          </button>
        )}
      </div>

      {blockedReason && <p className="text-[13px] text-rose-300 font-bold">⛔ {blockedReason}</p>}
    </section>
  );

  // ══ الزرّ الرئيس في الشريط السفليّ ══
  const primary = step === 1
    ? { label: 'التالي: الرسالة', disabled: !audienceOk || (!loading && rows.length === 0), onClick: () => go(2), tone: 'amber' }
    : step === 2
      ? { label: 'التالي: المراجعة', disabled: !messageOk, onClick: () => go(3), tone: 'amber' }
      : !testedOk
        ? { label: testing ? '⏳ يرسل الاختبار…' : '🧪 أرسل الاختبار', disabled: !canTest || !audienceOk, onClick: runTest, tone: 'sky' }
        : { label: sending ? '⏳ جاري البدء…' : `📢 أرسل إلى ${targets.length}`, disabled: !canSend, onClick: send, tone: 'amber' };

  return (
    <div ref={rootRef} className="flex-1 md:min-h-0 md:overflow-y-auto" dir="rtl">
      <div className="max-w-3xl mx-auto px-0.5 pt-1 space-y-3">
        {liveStrip}

        {/* بثّ جديد | السجلّ */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-gray-900/80 border border-gray-800" role="tablist">
          {([['compose', '✍️ بثّ جديد'], ['history', '📜 السجلّ']] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
              className={`min-h-[44px] rounded-xl text-[14px] font-bold transition-colors ${view === k ? 'bg-amber-500/15 text-amber-300' : 'text-gray-400'}`}>{l}</button>
          ))}
        </div>

        {view === 'history' ? (
          <div className="pb-6">
            <BroadcastHistory apiFetch={apiFetch} refreshKey={historyTick}
              onReuse={text => { setBody(text); setTplId(null); setView('compose'); go(audienceOk ? 2 : 1); swalToast('نُسخ النصّ إلى المحرّر', 'success'); }} />
          </div>
        ) : (
          <>
            {/* رأس الخطوات — لاصقٌ تحت شريط الإدارة على الهاتف */}
            <div ref={stepAnchorRef} />
            <div className="sticky top-[var(--admin-top,0px)] md:top-0 z-20 -mx-0.5 px-0.5 pt-1 pb-2 bg-[#0b0b0d]/95 backdrop-blur">
              <ol className="grid grid-cols-3 gap-1.5">
                {STEPS.map(s => {
                  const on = step === s.n;
                  const doneS = s.n < step || (s.n === 1 && audienceOk && step > 1) || (s.n === 2 && messageOk && step > 2);
                  const reachable = canReach(s.n);
                  return (
                    <li key={s.n}>
                      <button type="button" onClick={() => go(s.n)} disabled={!reachable} aria-current={on ? 'step' : undefined}
                        className={`w-full min-h-[44px] rounded-xl border text-[12.5px] font-bold flex items-center justify-center gap-1.5 transition-colors ${on ? 'border-amber-500/50 bg-amber-500/10 text-amber-300' : doneS ? 'border-emerald-500/25 text-emerald-300/90' : 'border-gray-800 text-gray-500'} disabled:opacity-40`}>
                        <span className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center ${on ? 'bg-amber-400 text-black' : doneS ? 'bg-emerald-500/25' : 'bg-gray-800'}`}>{doneS && !on ? '✓' : s.n}</span>
                        {s.label}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="pb-4">
              {step === 1 ? stepAudience : step === 2 ? stepMessage : stepReview}
            </div>

            {/* الشريط السفليّ الثابت: العدد + الرجوع + التالي */}
            <div className="sticky bottom-0 z-20 -mx-0.5 border-t border-gray-800 bg-[#0b0b0d]/95 backdrop-blur px-2.5 pt-2.5" style={{ paddingBottom: 'calc(10px + env(safe-area-inset-bottom))' }}>
              <div className="flex items-center gap-2">
                {step > 1 && (
                  <button type="button" onClick={() => go((step - 1) as Step)} className="min-h-[48px] px-3.5 rounded-xl border border-gray-800 text-[13.5px] font-bold text-gray-300">رجوع</button>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-white">👥 <b className="tabular-nums text-amber-300">{loading ? '…' : targets.length}</b> مستلماً</div>
                  <div className={`text-[11.5px] truncate ${barHint.startsWith('⛔') ? 'text-rose-300' : 'text-gray-500'}`}>{barHint}</div>
                </div>
                <button type="button" disabled={primary.disabled} onClick={primary.onClick}
                  className={`min-h-[48px] px-4 rounded-xl text-[14px] font-black whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${primary.tone === 'sky' ? 'bg-sky-500/20 text-sky-100 border border-sky-500/50' : 'text-black'}`}
                  style={primary.tone === 'sky' ? undefined : { background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}>
                  {primary.label}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 📄 لوح القوالب */}
      {tplSheet && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={() => setTplSheet(false)}>
          <div role="dialog" aria-label="القوالب المحفوظة" onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[78vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#141210] border border-gray-800 p-3"
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
            <div className="w-10 h-1 rounded-full bg-gray-700 mx-auto mb-3 sm:hidden" />
            <div className="flex items-center justify-between mb-2 px-1">
              <b className="text-white text-[15px]">القوالب المحفوظة</b>
              <button type="button" onClick={() => setTplSheet(false)} className="min-h-[40px] px-3 text-gray-400 text-[13px]">إغلاق</button>
            </div>
            <div className="space-y-1.5">
              <OptionRow selected={tplId === null} onClick={() => { setTplId(null); setTplSheet(false); }} title="بلا قالب" sub="أكمل بالنصّ الحاليّ" />
              {tpls.map(t => (
                <OptionRow key={t.id} selected={tplId === t.id}
                  onClick={() => { setTplId(t.id); setBody(t.body); setTplSheet(false); }}
                  title={`${t.name}${t.usedCount ? ` · استُعمل ${t.usedCount}` : ''}`} sub={t.body.split('\n').find(l => l.trim()) || ''} />
              ))}
              {tpls.length === 0 && <p className="text-[12.5px] text-gray-500 px-1 py-2">اكتب رسالة ثمّ «💾 حفظ كقالب» لتظهر هنا.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🧩 عناصر العرض — بلا حالة، مقاسات لمس ٤٤+ وخطّ ١٢٫٥+ (قواعد الواجهة المقفلة)
// ══════════════════════════════════════════════════════
type Step = 1 | 2 | 3;
const STEPS: Array<{ n: Step; label: string }> = [
  { n: 1, label: 'لمن؟' },
  { n: 2, label: 'الرسالة' },
  { n: 3, label: 'أرسل' },
];
const FILTER_META: Record<Filter, { icon: string; label: string; hint: string }> = {
  all: { icon: '🌐', label: 'الكلّ', hint: 'كلّ من يمكن مراسلته' },
  players: { icon: '🎭', label: 'لاعبون مسجّلون', hint: 'لهم حساب في التطبيق' },
  visitors: { icon: '👋', label: 'زوّار', hint: 'راسلونا بلا حساب' },
  booked_upcoming: { icon: '📅', label: 'لهم حجز قادم', hint: 'في أيّ فعاليّة قادمة' },
  activity: { icon: '🎟️', label: 'حاجزو فعاليّة', hint: 'من حجز في فعاليّة تختارها' },
  not_booked_activity: { icon: '🚪', label: 'لم يحجزوا في فعاليّة', hint: 'لتذكير من لم يحجز بعد' },
  played: { icon: '🎲', label: 'لعبوا معنا', hint: 'في فعاليّة سابقة — ولم يحجزوا في القادمة (اختياريّ)' },
};
const AUDIENCE_GROUPS: Array<{ title: string; keys: Filter[] }> = [
  { title: 'عامّ', keys: ['all', 'players', 'visitors'] },
  { title: 'حسب الحجز', keys: ['booked_upcoming', 'activity', 'not_booked_activity'] },
  { title: 'حسب اللعب', keys: ['played'] },
];
const VARS: Array<{ token: string; label: string }> = [
  { token: '{الاسم}', label: '👤 الاسم' },
  { token: '{الاسم_الكامل}', label: 'الاسم الكامل' },
  { token: '{الرتبة}', label: '🏅 الرتبة' },
  { token: '{الفعالية}', label: '🎟️ الفعاليّة' },
  { token: '{الموعد}', label: '🕗 الموعد' },
  { token: '{المكان}', label: '📍 المكان' },
  { token: '{الموقع}', label: '🗺️ الموقع الكامل' },
];

function StepTitle({ n, title, sub }: { n: number; title: string; sub?: string }) {
  return (
    <div>
      <div className="text-[12px] font-bold text-amber-400/80">الخطوة {n} من 3</div>
      <h2 className="text-[19px] font-black text-white leading-tight">{title}</h2>
      {sub && <p className="text-[13px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Panel({ title, sub, children, tone = 'default' }: { title: string; sub?: string; children: ReactNode; tone?: 'default' | 'warn' }) {
  return (
    <div className={`rounded-2xl border p-3 space-y-2.5 ${tone === 'warn' ? 'border-amber-500/40 bg-amber-500/5' : 'border-gray-800 bg-gray-950/60'}`}>
      <div>
        <div className="text-[13.5px] font-bold text-gray-200">{title}</div>
        {sub && <div className="text-[12px] text-gray-500">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function OptionRow({ selected, onClick, title, sub }: { selected: boolean; onClick: () => void; title: string; sub?: string }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick}
      className={`w-full flex items-center gap-3 text-right rounded-xl border px-3 py-2 min-h-[52px] transition-colors ${selected ? 'bg-amber-500/10 border-amber-500/45' : 'border-gray-800 hover:border-gray-700'}`}>
      <span className={`w-5 h-5 rounded-full border-2 shrink-0 ${selected ? 'border-amber-400 bg-amber-400 shadow-[inset_0_0_0_3px_#1a1a1a]' : 'border-gray-600'}`} />
      <span className="flex-1 min-w-0">
        <span className={`block text-[13.5px] font-bold truncate ${selected ? 'text-amber-200' : 'text-white'}`}>{title}</span>
        {sub && <span className="block text-[12px] text-gray-500 truncate">{sub}</span>}
      </span>
    </button>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 text-right min-h-[52px] rounded-xl border border-gray-800 px-3 py-2">
      <span className="flex-1 text-[13px] text-gray-300">{label}</span>
      <span className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${checked ? 'bg-amber-500' : 'bg-gray-700'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${checked ? 'right-0.5' : 'right-[22px]'}`} />
      </span>
    </button>
  );
}

function Disclosure({ title, badge, open, onToggle, children, compact }: { title: string; badge?: number; open: boolean; onToggle: () => void; children: ReactNode; compact?: boolean }) {
  return (
    <div className={compact ? 'mt-1' : 'rounded-2xl border border-gray-800 bg-gray-900/40'}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className={`w-full flex items-center gap-2 text-right ${compact ? 'min-h-[40px] text-[12.5px] text-gray-400' : 'min-h-[52px] px-3.5 text-[14px] font-bold text-gray-200'}`}>
        <span className="flex-1">{title}</span>
        {badge ? <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-500/20 text-amber-300 text-[12px] font-bold flex items-center justify-center">{badge}</span> : null}
        <span className={`text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className={compact ? 'pb-1' : 'px-3.5 pb-3.5'}>{children}</div>}
    </div>
  );
}

function SummaryRow({ label, onEdit, children }: { label: string; onEdit?: () => void; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-3.5 py-3">
      <span className="w-14 shrink-0 text-[12.5px] text-gray-500 pt-0.5">{label}</span>
      <span className="flex-1 min-w-0 text-[13.5px] leading-relaxed">{children}</span>
      {onEdit && <button type="button" onClick={onEdit} className="shrink-0 min-h-[36px] px-2.5 rounded-lg text-[12.5px] font-bold text-amber-300/90 border border-gray-800">تعديل</button>}
    </div>
  );
}
