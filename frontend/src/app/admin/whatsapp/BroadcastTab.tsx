'use client';

// ══════════════════════════════════════════════════════
// 📢 تبويب البثّ — رسالة واحدة لمن نافذتهم (24 ساعة) ما زالت مفتوحة
// القيود كلّها في الخادم (whatsapp-broadcast.service): هذه الواجهة تعرضها ولا تفرضها.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSocket } from '@/lib/socket';
import Swal from 'sweetalert2';
import { swalAlert, swalConfirm, swalToast } from '@/lib/swal';
import BroadcastHistory from './BroadcastHistory';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;
type Filter = 'all' | 'players' | 'visitors' | 'booked_upcoming' | 'activity' | 'not_booked_activity';
interface Tpl { id: number; name: string; body: string; usedCount: number }
interface Target { id: number; phone: string; name: string; isPlayer: boolean; rank: string; windowClosesAt: string | null; via?: 'cloud' | 'web' | null }

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'الكلّ' },
  { key: 'players', label: 'لاعبون مسجّلون' },
  { key: 'visitors', label: 'زوّار غير مسجّلين' },
  { key: 'booked_upcoming', label: 'لهم حجز قادم' },
  { key: 'activity', label: 'حاجزو فعاليّة محدّدة' },
  { key: 'not_booked_activity', label: 'لم يحجزوا بعد في فعاليّة' },
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
  const [aud, setAud] = useState<any>(null);
  const [activityId, setActivityId] = useState<number | null>(null);
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
      const qs = `filter=${filter}${(filter === 'activity' || filter === 'not_booked_activity') && activityId ? `&activityId=${activityId}` : ''}`;
      const d = await apiFetch(`/api/whatsapp/open-window-broadcast/audience?${qs}&channel=${channel}${line ? `&line=${line}` : ''}${exB.length ? `&excludeBroadcasts=${exB.join(',')}` : ''}`);
      setAud(d);
      setRows(d.rows || []); setStatus(d.status || null); setHistory(d.history || []); setActivities(d.activities || []);
      setErr(null); setHistoryTick(t => t + 1);
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [apiFetch, filter, activityId, exB, channel, line]);

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
  const canSend = testedOk && !blockedReason && !sending && !imgBusy && !missingActivity && targets.length > 0 && body.trim().length >= 5 && body.length <= bodyMax;

  const send = async () => {
    const ok = await swalConfirm(
      `ستُرسَل ${img ? (img.kind === 'video' ? 'هذا الفيديو بتعليقه' : 'هذه الصورة بتعليقها') : 'هذه الرسالة'} إلى ${targets.length} شخصاً نافذتهم مفتوحة الآن.\nلا يمكن التراجع عمّا أُرسل.`,
      { title: 'تأكيد البثّ', confirmText: `أرسل إلى ${targets.length}`, icon: 'warning' },
    );
    if (!ok) return;
    setSending(true);
    try {
      const r = await apiFetch('/api/whatsapp/open-window-broadcast', { method: 'POST', body: JSON.stringify({ body, filter, channel, lineFilter: line || undefined, activityId, templateId: currentTpl && !tplDirty ? currentTpl.id : null, excludeBroadcastIds: exB, excludeIds: Array.from(excluded), appendOptout: footer, imageUrl: img?.kind === 'image' ? img.url : null, videoUrl: img?.kind === 'video' ? img.url : null }) });
      swalToast(`بدأ البثّ إلى ${r.total}`, 'success');
      setBody(''); setTplId(null); setExcluded(new Set()); setExB([]); setImg(null); setTested(null);
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

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" dir="rtl">
      {/* ── 📡 البثوث الجارية: الحالة الآن وسببها ── */}
      {live && live.broadcasts.length > 0 && (
        <div className="mb-4 space-y-2">
          {live.broadcasts.map(b => {
            const ln = live.lane || {};
            const tone = LANE_TONE[ln.state] || LANE_TONE.paused;
            const done = b.sent + b.failed;
            const pct = b.total ? Math.round((done / b.total) * 100) : 0;
            return (
              <div key={b.id} className="rounded-2xl border border-sky-500/25 bg-sky-500/5 p-3.5 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`w-2.5 h-2.5 rounded-full ${tone.dot}`} />
                  <b className="text-white text-sm">📢 بثّ #{b.id} {b.media === 'video' ? '🎬' : b.media === 'image' ? '🖼️' : ''}</b>
                  <span className={`text-xs font-bold ${tone.text}`}>{b.queued === 0 ? '✓ خرجت كلّها' : tone.label}</span>
                  <span className="text-[11px] text-gray-500 truncate max-w-[50%]">{String(b.text || '').split('\n').find((l: string) => l.trim()) || ''}</span>
                  <span className="mr-auto text-[11px] text-gray-500">بدأ {fmtAt(b.createdAt)}{b.createdBy ? ` · ${b.createdBy}` : ''}</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden"><div className="h-full bg-sky-400" style={{ width: `${pct}%` }} /></div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-gray-300 tabular-nums">
                  <span>أُرسل فعلاً <b className="text-white">{b.sent}</b> من {b.total}</span>
                  <span>وصل {b.delivered} · قُرئ {b.read}</span>
                  <span>في الطابور <b className="text-amber-200">{b.queued}</b>{b.sending ? ` (${b.sending} يُرسل الآن)` : ''}</span>
                  {b.failed > 0 && <span className="text-rose-300">فشل {b.failed}</span>}
                  <span>آخر رسالة خرجت: <b className="text-white">{fmtAt(b.lastSentAt)}</b></span>
                </div>
                {b.queued > 0 && ln.state && (
                  <div className={`text-[12px] rounded-xl px-3 py-2 border ${ln.state === 'sending' ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-200' : 'border-amber-500/25 bg-amber-500/5 text-amber-100'}`}>
                    <b>{ln.state === 'sending' ? 'يُرسل:' : 'سبب التوقّف:'}</b> {ln.reason}
                    {ln.resumeAt && <span> — {ln.state === 'sending' ? 'التالية' : 'يستأنف'} <b>{fmtAt(ln.resumeAt)}</b></span>}
                    {ln.code === 'daily_cap' && ln.tomorrowCap ? <span> بحدّ {ln.tomorrowCap}</span> : null}
                    {(ln.code === 'gateway' || ln.code === 'deferred') && (
                      <button type="button" onClick={async () => {
                        try {
                          const r = await apiFetch('/api/whatsapp/open-window-broadcast/resume-lane', { method: 'POST' });
                          swalToast(`▶ استُؤنف — ${r.released ? `فُكّ ${r.released} مؤجَّل، ` : ''}قيودنا تبقى سارية`, 'success');
                          setTimeout(() => apiFetch('/api/whatsapp/open-window-broadcast/live').then(d => setLive({ broadcasts: d.broadcasts || [], lane: d.lane || null })).catch(() => {}), 1500);
                        } catch (e: any) { swalToast(e.message, 'error'); }
                      }} className="mr-2 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-200 border border-emerald-500/40 hover:bg-emerald-500/25">▶ استأنف الآن</button>
                    )}
                    <div className="text-[11px] text-gray-400 mt-0.5 tabular-nums">
                      اليوم {ln.todaySent}/{ln.dayCap ?? '∞'} · آخر ساعة {ln.hourSent}/{ln.hourCap} · ساعات الإرسال {ln.window}{ln.warmup ? ' · التسخين مفعّل' : ''}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4">
        {/* ── الكتابة ── */}
        <div className="space-y-4 min-w-0">
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-[13px] leading-relaxed text-amber-100/90">
            <b className="text-amber-400">ما يفعله هذا التبويب:</b> يرسل رسالةً واحدة (نصّاً أو صورةً بتعليق) لكلّ من في الفلتر.
            عبر ميتا: لمن راسلنا خلال آخر 24 ساعة فقط. عبر رقم الأعمال: بلا نافذة، بطابورٍ متباعد وسقفٍ يوميّ (من «القنوات»).
            لا يصل لمن كتب «إيقاف». السقف: {status?.maxTargets ?? 300} مستلم للبثّ الواحد.
          </div>

          {runningRow && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <div className="flex-1 min-w-0 text-sm text-white">
                بثّ #{runningRow.id} جارٍ — أُرسل <b className="tabular-nums">{runningRow.sentCount}</b> من <b className="tabular-nums">{runningRow.totalTargets}</b>
                {(runningRow.skippedCount > 0 || runningRow.failedCount > 0) && <span className="text-gray-400"> · تخطّي {runningRow.skippedCount} · فشل {runningRow.failedCount}</span>}
              </div>
              <button onClick={() => stop(runningRow.id)} className="px-3 py-1.5 rounded-xl text-sm font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25">⏹ إيقاف</button>
            </div>
          )}

          <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 space-y-3">
            {(aud?.byChannel?.web > 0 || channel !== 'all') && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-gray-500">القناة:</span>
                {([['all', 'الكلّ'], ['cloud', '☁️ ميتا'], ['web', '📱 رقم الأعمال']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => { setChannel(k); setExcluded(new Set()); }}
                    className={`px-2.5 py-1 rounded-lg font-bold border ${channel === k ? 'bg-teal-500/10 text-teal-300 border-teal-500/40' : 'border-gray-800 text-gray-400 hover:text-white'}`}>{l}</button>
                ))}
                {aud?.byChannel && <span className="text-gray-500 mr-1">☁️ {aud.byChannel.cloud} · 📱 {aud.byChannel.web}</span>}
              </div>
            )}
            {/* 📇 فلتر خطّ الأعمال — يضيّق مستلمي رقم الأعمال؛ مستلمو ميتا وارِدون أصلاً فلا يمسّهم */}
            {(aud?.byChannel?.web > 0 || channel === 'web' || line) && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-gray-500">خطّ الأعمال يراسل:</span>
                {LINE_OPTS.map(o => (
                  <button key={o.key || 'def'} onClick={() => { setLine(o.key); setExcluded(new Set()); }}
                    className={`px-2.5 py-1 rounded-lg font-bold border ${line === o.key ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40' : 'border-gray-800 text-gray-400 hover:text-white'}`}>{o.label}</button>
                ))}
                <span className="text-gray-600 w-full sm:w-auto sm:mr-1">يحمي من بدء محادثةٍ باردة. «الافتراضيّ» = ما ضبطته في «القنوات».</span>
              </div>
            )}
            {aud?.estimate && (
              <div className="text-[12px] text-teal-200/90 bg-teal-500/5 border border-teal-500/20 rounded-xl px-3 py-2">
                📱 {aud.estimate.messages} رسالة عبر رقم الأعمال: نحو {aud.estimate.minutesFirstDay} دقيقة اليوم
                {aud.estimate.days > 1 ? ` — وتكتمل خلال ${aud.estimate.days} أيّام (${aud.estimate.perDay} يوميّاً)` : ''}.
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map(f => (
                <button key={f.key} onClick={() => { setFilter(f.key); setExcluded(new Set()); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${filter === f.key ? 'bg-amber-500/10 text-amber-400 border-amber-500/40' : 'border-gray-800 text-gray-400 hover:text-white'}`}>{f.label}</button>
              ))}
            </div>
            {(needsActivity || ACT_VARS.test(body)) && (
              <select value={activityId ?? ''} onChange={e => { setActivityId(e.target.value ? Number(e.target.value) : null); setExcluded(new Set()); }}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white">
                <option value="">— اختر الفعاليّة —</option>
                {activities.map(a => <option key={a.id} value={a.id}>{a.name} · {fmt(a.date)}</option>)}
              </select>
            )}

            {/* ── استثناء من وصلهم بثّ سابق ── */}
            {history.filter(h => h.sentCount > 0).length > 0 && (
              <div>
                <div className="text-[11px] text-gray-500 mb-1">استثنِ من وصلهم بثّ سابق (يُرسَل للباقي فقط):</div>
                <div className="flex flex-wrap gap-1.5">
                  {history.filter(h => h.sentCount > 0).slice(0, 6).map(h => {
                    const on = exB.includes(h.id);
                    return (
                      <button key={h.id} onClick={() => { setExB(p => on ? p.filter(x => x !== h.id) : [...p, h.id]); setExcluded(new Set()); }} title={bodyOf(h.body)}
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] border max-w-full text-right ${on ? 'bg-rose-500/10 text-rose-200 border-rose-500/40' : 'border-gray-800 text-gray-400 hover:text-white'}`}>
                        {on ? '⊘ ' : ''}#{h.id} · {fmt(h.createdAt)} · {h.sentCount} مستلماً
                        <span className="block text-[10.5px] opacity-70 truncate max-w-[240px]">{bodyOf(h.body).split('\n')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── القوالب المحفوظة ── */}
            <div className="flex flex-wrap items-center gap-2">
              <select value={tplId ?? ''} onChange={e => { const id = e.target.value ? Number(e.target.value) : null; setTplId(id); const t = tpls.find(x => x.id === id); if (t) setBody(t.body); }}
                className="flex-1 min-w-[180px] bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white">
                <option value="">{tpls.length ? '— اختر قالباً محفوظاً —' : '— لا قوالب محفوظة بعد —'}</option>
                {tpls.map(t => <option key={t.id} value={t.id}>{t.name}{t.usedCount ? ` · استُعمل ${t.usedCount}` : ''}</option>)}
              </select>
              <button onClick={saveTpl} className="px-3 py-2 rounded-xl text-xs font-bold border border-gray-800 text-gray-300 hover:text-white hover:border-amber-500/40">💾 {currentTpl && tplDirty ? 'حفظ التعديل' : 'حفظ كقالب'}</button>
              {currentTpl && <button onClick={deleteTpl} className="px-3 py-2 rounded-xl text-xs font-bold border border-gray-800 text-rose-300/80 hover:text-rose-300" title="حذف القالب">🗑</button>}
            </div>

            <div>
              <textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} rows={7} maxLength={bodyMax} dir="rtl"
                placeholder={'مثال:\nمسا الخير {الاسم} 🎭\nبكرا الخميس لعبة الساعة 7 بمزاج أفندينا — بقي مقاعد قليلة. احجز من هون بكلمة «احجز».'}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white leading-relaxed focus:border-amber-500/50 outline-none" />
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {['{الاسم}', '{الاسم_الكامل}', '{الرتبة}', '{الفعالية}', '{المكان}', '{الموقع}', '{الموعد}'].map(v => (
                  <button key={v} type="button" onMouseDown={e => e.preventDefault()} onClick={() => insertVar(v)}
                    className="px-2 py-1 rounded-lg text-[11px] bg-gray-800 text-gray-300 hover:text-white" dir="rtl">{v}</button>
                ))}
                <span className={`mr-auto text-[11px] tabular-nums ${body.length > bodyMax - 50 ? 'text-rose-400' : 'text-gray-500'}`}>
                  {body.length} / {bodyMax}
                  {img && <span className="text-amber-400/70"> · تعليق {body.length + (footer ? OPTOUT_FOOTER.length : 0)} / {CAPTION_MAX}</span>}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">{'{الرتبة}'} تبقى فارغة للزائر غير المسجّل — لا تبنِ الجملة عليها. {'{المكان}'} اسم الكافيه وحده، و{'{الموقع}'} الاسم والمنطقة والمدينة معاً («مزاج افندينا — الشميساني، عمّان») — وهو الأنسب لمن لم يزُرنا قطّ. {'{الفعالية}'} و{'{المكان}'} و{'{الموقع}'} و{'{الموعد}'} تتبع الفعاليّة المختارة. الروابط الخارجيّة مرفوضة (روابط النادي فقط).</p>
            </div>

            {/* ── صورةٌ اختياريّة: رفعةٌ واحدة لميتا يُعاد استعمالها لكلّ مستلم ── */}
            <div className="flex flex-wrap items-center gap-2">
              <input ref={imgRef} type="file" accept="image/jpeg,image/png" className="hidden"
                onChange={e => pickImg(e.target.files?.[0])} />
              <input ref={vidRef} type="file" accept="video/mp4" className="hidden"
                onChange={e => pickVid(e.target.files?.[0])} />
              {img ? (
                <span className="flex items-center gap-2 py-1 pr-2 pl-1 rounded-xl border border-amber-500/30 bg-amber-500/5">
                  {img.kind === 'video'
                    ? <video src={`${API_URL}${img.url}`} muted preload="metadata" className="w-10 h-10 rounded-lg object-cover bg-black" />
                    : <img src={`${API_URL}${img.url}`} alt="" className="w-10 h-10 rounded-lg object-cover" />}
                  <span className="text-[11px] text-amber-100/90 tabular-nums">{img.kind === 'video' ? `🎬 ${(img.bytes / 1048576).toFixed(1)} م.ب` : `${Math.round(img.bytes / 1024)} ك.ب`}</span>
                  <button type="button" onClick={() => setImg(null)} title={img.kind === 'video' ? 'أزل الفيديو' : 'أزل الصورة'}
                    className="w-6 h-6 rounded-lg text-sm font-bold text-rose-300/80 hover:text-rose-300 hover:bg-rose-500/10">×</button>
                </span>
              ) : (
                <>
                  <button type="button" disabled={imgBusy} onClick={() => imgRef.current?.click()}
                    className="px-3 py-2 rounded-xl text-xs font-bold border border-gray-800 text-gray-300 hover:text-white hover:border-amber-500/40 disabled:opacity-40">
                    {imgBusy ? '⏳ جاري الرفع…' : '🖼️ أضف صورة'}
                  </button>
                  <button type="button" disabled={imgBusy} onClick={() => vidRef.current?.click()}
                    className="px-3 py-2 rounded-xl text-xs font-bold border border-gray-800 text-gray-300 hover:text-white hover:border-amber-500/40 disabled:opacity-40">
                    🎬 أضف فيديو
                  </button>
                </>
              )}
              <p className="text-[11px] text-gray-500 flex-1 min-w-[220px]">صورة <b className="text-gray-400">أو</b> فيديو: يُرفع لواتساب <b className="text-gray-400">مرّةً واحدة</b> ويُعاد استعماله لكلّ مستلم، والنّصّ يصير تعليقَه — رسالةٌ واحدة لا رسالتان. الصورة JPG/PNG، والفيديو MP4 حتّى {VIDEO_MAX_MB} م.ب (الأصغر أسرع: رقم الأعمال يرفعه مع كلّ رسالة).</p>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input type="checkbox" checked={footer} onChange={e => setFooter(e.target.checked)} className="accent-amber-500" />
              تذييل «لإيقاف هذه الرسائل أرسل: إيقاف» <span className="text-gray-500">— يُنصح بإبقائه: البلاغات هي ما يُغلق الحسابات</span>
            </label>

            {sample && body.trim() && (
              <div>
                <div className="text-[11px] text-gray-500 mb-1">معاينة كما تصل إلى {sample.name}:</div>
                <div className="max-w-md rounded-2xl rounded-tr-sm px-3 py-2 text-sm text-white whitespace-pre-wrap leading-relaxed" style={{ background: '#005c4b' }}>
                  {img && (img.kind === 'video'
                    ? <video src={`${API_URL}${img.url}`} controls preload="metadata" className="block w-full max-h-60 rounded-xl mb-1.5 bg-black" />
                    : <img src={`${API_URL}${img.url}`} alt="" className="block w-full max-h-52 object-cover rounded-xl mb-1.5" />)}
                  {fill(body, { ...sample, activity: act?.name, venue: act?.venue, place: (act as any)?.place, when: act?.when })}{footer ? OPTOUT_FOOTER : ''}
                </div>
              </div>
            )}

            {missingActivity && <p className="text-xs text-amber-300 font-bold">اختر الفعاليّة أوّلاً.</p>}

            {/* ── 🧪 الاختبار الإلزاميّ: من رقم الأعمال إلى الإداريّين ── */}
            <div className={`rounded-xl border p-3 space-y-2 ${testedOk ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-sky-500/30 bg-sky-500/5'}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <b className={`text-sm ${testedOk ? 'text-emerald-300' : 'text-sky-300'}`}>🧪 اختبار قبل البثّ</b>
                <span className="text-[11px] text-gray-400">إلزاميّ — يصل كما سيصل الناس (بالاسم والتذييل{img ? (img.kind === 'video' ? ' والفيديو' : ' والصورة') : ''}) من رقم الأعمال إلى:
                  {' '}{testRcpts === null ? '…' : testRcpts.length ? testRcpts.map(r => r.name).join('، ') : <span className="text-rose-300">لا أرقام إداريّين مربوطة</span>}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" disabled={!canTest} onClick={runTest}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-500/15 text-sky-200 border border-sky-500/40 hover:bg-sky-500/25 disabled:opacity-40 disabled:cursor-not-allowed">
                  {testing ? '⏳ يرسل الاختبار…' : testedOk ? '↻ أعد الاختبار' : '🧪 أرسل الاختبار للإداريّين'}
                </button>
                {testedOk && <span className="text-[11px] text-emerald-300">✅ خرج الاختبار {new Date(tested!.at).toLocaleTimeString('ar-JO', { hour: 'numeric', minute: '2-digit' })} — راجعوه على هواتفكم، ثمّ اعتمد البثّ</span>}
                {tested && !testedOk && <span className="text-[11px] text-amber-300">⚠️ تغيّرت الرسالة بعد الاختبار (أو مضى عليه ١٢ ساعة) — اختبر من جديد</span>}
              </div>
              {testedOk && tested!.sentTo.some(x => !x.ok) && (
                <div className="text-[11px] text-amber-300/90">{tested!.sentTo.filter(x => !x.ok).map(x => `${x.name}: ${x.error}`).join(' · ')}</div>
              )}
            </div>

            {blockedReason && <p className="text-xs text-rose-300 font-bold">⛔ {blockedReason}</p>}
            <button disabled={!canSend} onClick={send}
              className="w-full py-3 rounded-xl text-sm font-black text-black disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}>
              {sending ? '⏳ جاري البدء…' : !testedOk ? '🔒 اختبر الرسالة أوّلاً ثمّ اعتمد البثّ' : `📢 اعتمد البثّ — أرسل إلى ${targets.length} شخصاً`}
            </button>
          </div>

          {/* ── السجلّ ── */}
          <BroadcastHistory apiFetch={apiFetch} refreshKey={historyTick}
            onReuse={text => { setBody(text); setTplId(null); bodyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); swalToast('نُسخ النصّ إلى المحرّر', 'success'); }} />
        </div>

        {/* ── المستلمون ── */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 min-w-0 lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-140px)] flex flex-col">
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-sm font-bold text-white">المستلمون <span className="text-amber-400 tabular-nums">{targets.length}</span></h3>
            {excluded.size > 0 && <button onClick={() => setExcluded(new Set())} className="text-[11px] text-gray-400 hover:text-white">أعد المستبعدين ({excluded.size})</button>}
          </div>
          {err && <p className="text-xs text-rose-400">⚠️ {err}</p>}
          {loading ? <p className="text-xs text-gray-500">جاري التحميل…</p> : rows.length === 0 ? (
            <p className="text-xs text-gray-500">لا أحد يمكن مراسلته ضمن هذا الفلتر.</p>
          ) : (
            <div className="overflow-y-auto min-h-0 -mx-1 px-1 divide-y divide-gray-800/70">
              {rows.map(r => {
                const off = excluded.has(r.id);
                return (
                  <label key={r.id} className={`flex items-center gap-2 py-2 cursor-pointer ${off ? 'opacity-40' : ''}`}>
                    <input type="checkbox" checked={!off} className="accent-amber-500"
                      onChange={() => setExcluded(p => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-white truncate">{r.name}</span>
                      <span className="block text-[11px] text-gray-500" dir="ltr" style={{ textAlign: 'right' }}>{r.phone}{r.rank ? ` · ${r.rank}` : r.isPlayer ? '' : ' · زائر'}</span>
                    </span>
                    {r.via === 'web'
                      ? <span className="text-[11px] text-teal-300 whitespace-nowrap" title="يصله من رقم الأعمال — بلا نافذة">📱</span>
                      : <span className="text-[11px] text-gray-400 tabular-nums whitespace-nowrap" title="الوقت المتبقّي قبل إغلاق نافذته">⏳ {r.windowClosesAt ? hoursLeft(r.windowClosesAt) : '—'}</span>}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
