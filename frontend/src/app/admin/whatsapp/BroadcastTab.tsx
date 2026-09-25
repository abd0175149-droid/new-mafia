'use client';

// ══════════════════════════════════════════════════════
// 📢 تبويب البثّ — رسالة واحدة لمن نافذتهم (24 ساعة) ما زالت مفتوحة
// القيود كلّها في الخادم (whatsapp-broadcast.service): هذه الواجهة تعرضها ولا تفرضها.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSocket } from '@/lib/socket';
import Swal from 'sweetalert2';
import { swalConfirm, swalToast } from '@/lib/swal';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;
type Filter = 'all' | 'players' | 'visitors' | 'booked_upcoming' | 'activity' | 'not_booked_activity';
interface Tpl { id: number; name: string; body: string; usedCount: number }
interface Target { id: number; phone: string; name: string; isPlayer: boolean; rank: string; windowClosesAt: string }

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'الكلّ' },
  { key: 'players', label: 'لاعبون مسجّلون' },
  { key: 'visitors', label: 'زوّار غير مسجّلين' },
  { key: 'booked_upcoming', label: 'لهم حجز قادم' },
  { key: 'activity', label: 'حاجزو فعاليّة محدّدة' },
  { key: 'not_booked_activity', label: 'لم يحجزوا بعد في فعاليّة' },
];
const STATUS_AR: Record<string, string> = { running: 'جارٍ', done: 'اكتمل', stopped: 'أُوقف' };

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
  const [activityId, setActivityId] = useState<number | null>(null);
  const [rows, setRows] = useState<Target[]>([]);
  const [activities, setActivities] = useState<Array<{ id: number; name: string; date: string; venue?: string; when?: string }>>([]);
  const [status, setStatus] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [body, setBody] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

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
    if (next.length > 900) return;             // الحدّ نفسه الذي يفرضه الحقل
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const at = start + v.length;
      el.setSelectionRange(at, at);
    });
  };
  const [footer, setFooter] = useState(true);
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

  const load = useCallback(async () => {
    try {
      const qs = `filter=${filter}${(filter === 'activity' || filter === 'not_booked_activity') && activityId ? `&activityId=${activityId}` : ''}`;
      const d = await apiFetch(`/api/whatsapp/open-window-broadcast/audience?${qs}${exB.length ? `&excludeBroadcasts=${exB.join(',')}` : ''}`);
      setRows(d.rows || []); setStatus(d.status || null); setHistory(d.history || []); setActivities(d.activities || []);
      setErr(null);
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [apiFetch, filter, activityId, exB]);

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
  const canSend = !blockedReason && !sending && !missingActivity && targets.length > 0 && body.trim().length >= 5 && body.length <= 900;

  const send = async () => {
    const ok = await swalConfirm(
      `ستُرسَل هذه الرسالة إلى ${targets.length} شخصاً نافذتهم مفتوحة الآن.\nلا يمكن التراجع عمّا أُرسل.`,
      { title: 'تأكيد البثّ', confirmText: `أرسل إلى ${targets.length}`, icon: 'warning' },
    );
    if (!ok) return;
    setSending(true);
    try {
      const r = await apiFetch('/api/whatsapp/open-window-broadcast', { method: 'POST', body: JSON.stringify({ body, filter, activityId, templateId: currentTpl && !tplDirty ? currentTpl.id : null, excludeBroadcastIds: exB, excludeIds: Array.from(excluded), appendOptout: footer }) });
      swalToast(`بدأ البثّ إلى ${r.total}`, 'success');
      setBody(''); setTplId(null); setExcluded(new Set()); setExB([]);
      await load(); loadTpls();
    } catch (e: any) { swalToast(e.message || 'تعذّر بدء البثّ', 'error'); }
    setSending(false);
  };

  const stop = async (id: number) => {
    if (!(await swalConfirm('إيقاف البثّ الجاري؟ ما أُرسل لن يُسترجع.', { confirmText: 'أوقفه', danger: true }))) return;
    await apiFetch(`/api/whatsapp/open-window-broadcast/${id}/stop`, { method: 'POST' }).catch(() => {});
    setTimeout(load, 1500);
  };

  const runningRow = history.find(h => h.id === status?.running);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" dir="rtl">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4">
        {/* ── الكتابة ── */}
        <div className="space-y-4 min-w-0">
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-[13px] leading-relaxed text-amber-100/90">
            <b className="text-amber-400">ما يفعله هذا التبويب:</b> يرسل رسالة نصّيّة واحدة لمن راسلونا خلال آخر 24 ساعة فقط — هؤلاء وحدهم تسمح ميتا بمراسلتهم مجّاناً وبلا قالب.
            لا يصل لمن أُغلقت نافذته، ولا لمن كتب «إيقاف». السقف: {status?.maxTargets ?? 300} مستلم للبثّ الواحد.
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
                      <button key={h.id} onClick={() => { setExB(p => on ? p.filter(x => x !== h.id) : [...p, h.id]); setExcluded(new Set()); }} title={h.body}
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] border max-w-full text-right ${on ? 'bg-rose-500/10 text-rose-200 border-rose-500/40' : 'border-gray-800 text-gray-400 hover:text-white'}`}>
                        {on ? '⊘ ' : ''}#{h.id} · {fmt(h.createdAt)} · {h.sentCount} مستلماً
                        <span className="block text-[10.5px] opacity-70 truncate max-w-[240px]">{String(h.body || '').split('\n')[0]}</span>
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
              <textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} rows={7} maxLength={900} dir="rtl"
                placeholder={'مثال:\nمسا الخير {الاسم} 🎭\nبكرا الخميس لعبة الساعة 7 بمزاج أفندينا — بقي مقاعد قليلة. احجز من هون بكلمة «احجز».'}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white leading-relaxed focus:border-amber-500/50 outline-none" />
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {['{الاسم}', '{الاسم_الكامل}', '{الرتبة}', '{الفعالية}', '{المكان}', '{الموقع}', '{الموعد}'].map(v => (
                  <button key={v} type="button" onMouseDown={e => e.preventDefault()} onClick={() => insertVar(v)}
                    className="px-2 py-1 rounded-lg text-[11px] bg-gray-800 text-gray-300 hover:text-white" dir="rtl">{v}</button>
                ))}
                <span className={`mr-auto text-[11px] tabular-nums ${body.length > 850 ? 'text-rose-400' : 'text-gray-500'}`}>{body.length} / 900</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">{'{الرتبة}'} تبقى فارغة للزائر غير المسجّل — لا تبنِ الجملة عليها. {'{المكان}'} اسم الكافيه وحده، و{'{الموقع}'} الاسم والمنطقة والمدينة معاً («مزاج افندينا — الشميساني، عمّان») — وهو الأنسب لمن لم يزُرنا قطّ. {'{الفعالية}'} و{'{المكان}'} و{'{الموقع}'} و{'{الموعد}'} تتبع الفعاليّة المختارة. الروابط الخارجيّة مرفوضة (روابط النادي فقط).</p>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input type="checkbox" checked={footer} onChange={e => setFooter(e.target.checked)} className="accent-amber-500" />
              تذييل «لإيقاف هذه الرسائل أرسل: إيقاف» <span className="text-gray-500">— يُنصح بإبقائه: البلاغات هي ما يُغلق الحسابات</span>
            </label>

            {sample && body.trim() && (
              <div>
                <div className="text-[11px] text-gray-500 mb-1">معاينة كما تصل إلى {sample.name}:</div>
                <div className="max-w-md rounded-2xl rounded-tr-sm px-3 py-2 text-sm text-white whitespace-pre-wrap leading-relaxed" style={{ background: '#005c4b' }}>
                  {fill(body, { ...sample, activity: act?.name, venue: act?.venue, place: (act as any)?.place, when: act?.when })}{footer ? '\n\n— لإيقاف هذه الرسائل أرسل: إيقاف' : ''}
                </div>
              </div>
            )}

            {missingActivity && <p className="text-xs text-amber-300 font-bold">اختر الفعاليّة أوّلاً.</p>}
            {blockedReason && <p className="text-xs text-rose-300 font-bold">⛔ {blockedReason}</p>}
            <button disabled={!canSend} onClick={send}
              className="w-full py-3 rounded-xl text-sm font-black text-black disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}>
              {sending ? '⏳ جاري البدء…' : `📢 أرسل إلى ${targets.length} شخصاً`}
            </button>
          </div>

          {/* ── السجلّ ── */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
            <h3 className="text-sm font-bold text-white mb-2">سجلّ البثّ</h3>
            {history.length === 0 ? <p className="text-xs text-gray-500">لا بثّ سابق.</p> : (
              <div className="divide-y divide-gray-800">
                {history.map(h => (
                  <div key={h.id} className="py-2.5 text-xs">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-400">
                      <span className="text-gray-300 font-bold">#{h.id}</span>
                      <span>{fmt(h.createdAt)}</span>
                      <span>{h.createdBy}</span>
                      <span className={`px-1.5 py-0.5 rounded ${h.status === 'done' ? 'bg-emerald-500/10 text-emerald-300' : h.status === 'running' ? 'bg-amber-500/10 text-amber-300' : 'bg-rose-500/10 text-rose-300'}`}>{STATUS_AR[h.status] || h.status}</span>
                      <span className="tabular-nums mr-auto">✓ {h.sentCount}/{h.totalTargets}{h.skippedCount ? ` · تخطّي ${h.skippedCount}` : ''}{h.failedCount ? ` · فشل ${h.failedCount}` : ''}</span>
                    </div>
                    <p className="text-gray-300 mt-1 whitespace-pre-wrap line-clamp-3">{h.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── المستلمون ── */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 min-w-0 lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-140px)] flex flex-col">
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-sm font-bold text-white">المستلمون <span className="text-amber-400 tabular-nums">{targets.length}</span></h3>
            {excluded.size > 0 && <button onClick={() => setExcluded(new Set())} className="text-[11px] text-gray-400 hover:text-white">أعد المستبعدين ({excluded.size})</button>}
          </div>
          {err && <p className="text-xs text-rose-400">⚠️ {err}</p>}
          {loading ? <p className="text-xs text-gray-500">جاري التحميل…</p> : rows.length === 0 ? (
            <p className="text-xs text-gray-500">لا أحد نافذته مفتوحة ضمن هذا الفلتر.</p>
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
                    <span className="text-[11px] text-gray-400 tabular-nums whitespace-nowrap" title="الوقت المتبقّي قبل إغلاق نافذته">⏳ {hoursLeft(r.windowClosesAt)}</span>
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
