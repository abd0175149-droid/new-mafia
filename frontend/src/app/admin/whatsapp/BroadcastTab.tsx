'use client';

// ══════════════════════════════════════════════════════
// 📢 تبويب البثّ — رسالة واحدة لمن نافذتهم (24 ساعة) ما زالت مفتوحة
// القيود كلّها في الخادم (whatsapp-broadcast.service): هذه الواجهة تعرضها ولا تفرضها.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { swalConfirm, swalToast } from '@/lib/swal';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;
type Filter = 'all' | 'players' | 'visitors' | 'booked_upcoming' | 'activity';
interface Target { id: number; phone: string; name: string; isPlayer: boolean; rank: string; windowClosesAt: string }

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'الكلّ' },
  { key: 'players', label: 'لاعبون مسجّلون' },
  { key: 'visitors', label: 'زوّار غير مسجّلين' },
  { key: 'booked_upcoming', label: 'لهم حجز قادم' },
  { key: 'activity', label: 'حاجزو فعاليّة محدّدة' },
];
const STATUS_AR: Record<string, string> = { running: 'جارٍ', done: 'اكتمل', stopped: 'أُوقف' };

function fill(body: string, t: { name: string; rank: string }) {
  const first = (t.name || '').trim().split(/\s+/)[0] || '';
  return body.replace(/\{الاسم\}/g, first).replace(/\{الاسم_الكامل\}/g, t.name || '').replace(/\{الرتبة\}/g, t.rank || '');
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
  const [activities, setActivities] = useState<Array<{ id: number; name: string; date: string }>>([]);
  const [status, setStatus] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [body, setBody] = useState('');
  const [footer, setFooter] = useState(true);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = `filter=${filter}${filter === 'activity' && activityId ? `&activityId=${activityId}` : ''}`;
      const d = await apiFetch(`/api/whatsapp/open-window-broadcast/audience?${qs}`);
      setRows(d.rows || []); setStatus(d.status || null); setHistory(d.history || []); setActivities(d.activities || []);
      setErr(null);
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [apiFetch, filter, activityId]);

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
  const blockedReason: string | null =
    status?.suspended ? `الإرسال مقفل: ${status.suspended}`
    : status?.running ? 'هناك بثّ جارٍ الآن'
    : status?.nextAllowedAt ? `بثّ واحد كلّ ١٢ ساعة — المتاح ${fmt(status.nextAllowedAt)}`
    : null;
  const canSend = !blockedReason && !sending && targets.length > 0 && body.trim().length >= 5 && body.length <= 900;

  const send = async () => {
    const ok = await swalConfirm(
      `ستُرسَل هذه الرسالة إلى ${targets.length} شخصاً نافذتهم مفتوحة الآن.\nلا يمكن التراجع عمّا أُرسل، ولن يتاح بثّ آخر قبل ١٢ ساعة.`,
      { title: 'تأكيد البثّ', confirmText: `أرسل إلى ${targets.length}`, icon: 'warning' },
    );
    if (!ok) return;
    setSending(true);
    try {
      const r = await apiFetch('/api/whatsapp/open-window-broadcast', { method: 'POST', body: JSON.stringify({ body, filter, activityId, excludeIds: Array.from(excluded), appendOptout: footer }) });
      swalToast(`بدأ البثّ إلى ${r.total}`, 'success');
      setBody(''); setExcluded(new Set());
      await load();
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
            لا يصل لمن أُغلقت نافذته، ولا لمن كتب «إيقاف». السقف: بثّ واحد كلّ ١٢ ساعة و{status?.maxTargets ?? 300} مستلم.
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
            {filter === 'activity' && (
              <select value={activityId ?? ''} onChange={e => { setActivityId(e.target.value ? Number(e.target.value) : null); setExcluded(new Set()); }}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white">
                <option value="">— اختر الفعاليّة —</option>
                {activities.map(a => <option key={a.id} value={a.id}>{a.name} · {fmt(a.date)}</option>)}
              </select>
            )}

            <div>
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={7} maxLength={900} dir="rtl"
                placeholder={'مثال:\nمسا الخير {الاسم} 🎭\nبكرا الخميس لعبة الساعة 7 بمزاج أفندينا — بقي مقاعد قليلة. احجز من هون بكلمة «احجز».'}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white leading-relaxed focus:border-amber-500/50 outline-none" />
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {['{الاسم}', '{الاسم_الكامل}', '{الرتبة}'].map(v => (
                  <button key={v} onClick={() => setBody(b => b + v)} className="px-2 py-1 rounded-lg text-[11px] bg-gray-800 text-gray-300 hover:text-white" dir="rtl">{v}</button>
                ))}
                <span className={`mr-auto text-[11px] tabular-nums ${body.length > 850 ? 'text-rose-400' : 'text-gray-500'}`}>{body.length} / 900</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">{'{الرتبة}'} تبقى فارغة للزائر غير المسجّل — لا تبنِ الجملة عليها. الروابط الخارجيّة مرفوضة (روابط النادي فقط).</p>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input type="checkbox" checked={footer} onChange={e => setFooter(e.target.checked)} className="accent-amber-500" />
              تذييل «لإيقاف هذه الرسائل أرسل: إيقاف» <span className="text-gray-500">— يُنصح بإبقائه: البلاغات هي ما يُغلق الحسابات</span>
            </label>

            {sample && body.trim() && (
              <div>
                <div className="text-[11px] text-gray-500 mb-1">معاينة كما تصل إلى {sample.name}:</div>
                <div className="max-w-md rounded-2xl rounded-tr-sm px-3 py-2 text-sm text-white whitespace-pre-wrap leading-relaxed" style={{ background: '#005c4b' }}>
                  {fill(body, sample)}{footer ? '\n\n— لإيقاف هذه الرسائل أرسل: إيقاف' : ''}
                </div>
              </div>
            )}

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
