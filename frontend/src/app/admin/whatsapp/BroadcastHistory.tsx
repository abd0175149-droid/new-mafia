'use client';

// ══════════════════════════════════════════════════════
// 📜 سجلّ البثّ — بصفحات، وترتيبٍ، وتصفيةٍ بالحالة، وبحثٍ، وتفصيلٍ كاملٍ لكلّ بثّ
// البيانات من /api/whatsapp/open-window-broadcast/history (whatsapp-broadcast.service → pageBroadcasts)
// ══════════════════════════════════════════════════════

import { useEffect, useState, type ReactNode } from 'react';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;
interface ReadStats { recipients: number; read: number; delivered: number; notDelivered: number; failed: number }
interface Row {
  id: number; status: string; createdBy: string; createdAt: string; finishedAt: string | null; durationSec: number | null;
  text: string; imageUrl: string | null; templateId: number | null; templateName: string | null;
  totalTargets: number; sentCount: number; skippedCount: number; failedCount: number;
  readStats: ReadStats | null; readRate: number | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const STATUS: Record<string, { label: string; cls: string }> = {
  done: { label: 'اكتمل', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  running: { label: 'جارٍ', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  stopped: { label: 'أُوقف', cls: 'bg-rose-500/10 text-rose-300 border-rose-500/30' },
};
const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: 'الكلّ' }, { key: 'done', label: 'اكتمل' }, { key: 'running', label: 'جارٍ' }, { key: 'stopped', label: 'أُوقف' },
];
const SORTS: Array<{ key: string; label: string; sort: string; order: 'asc' | 'desc' }> = [
  { key: 'new', label: 'الأحدث أوّلاً', sort: 'created', order: 'desc' },
  { key: 'old', label: 'الأقدم أوّلاً', sort: 'created', order: 'asc' },
  { key: 'sent', label: 'الأكثر مستلمين', sort: 'sent', order: 'desc' },
  { key: 'readHi', label: 'الأعلى قراءة', sort: 'read', order: 'desc' },
  { key: 'readLo', label: 'الأقلّ قراءة', sort: 'read', order: 'asc' },
  { key: 'failed', label: 'الأكثر فشلاً', sort: 'failed', order: 'desc' },
];
const PAGE_SIZES = [10, 20, 50];

const dt = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('ar-JO', { timeZone: 'Asia/Amman', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—';
const hm = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('ar-EG', { timeZone: 'Asia/Amman', day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '';
const dur = (s: number | null) => s == null ? '—' : s < 60 ? `${s} ث` : s < 3600 ? `${Math.floor(s / 60)} د ${s % 60} ث` : `${Math.floor(s / 3600)} س ${Math.floor((s % 3600) / 60)} د`;
const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;

// ══════════════════════════════════════════════════════
// 👁 من قرأ البثّ؟ — قرأها / وصلت ولم تُقرأ / لم تصل / رفضها واتساب
// ══════════════════════════════════════════════════════
const READ_GROUPS: Array<{ key: string; label: string; cls: string; hint?: string }> = [
  { key: 'read', label: '👁 قرأها', cls: 'text-sky-300' },
  { key: 'delivered', label: '✓✓ وصلت ولم تُقرأ', cls: 'text-gray-300', hint: 'تشمل من أطفأ «إيصالات القراءة» — واتساب لا يخبرنا بقراءته أصلاً' },
  { key: 'notDelivered', label: '✓ لم تصل بعد', cls: 'text-amber-300', hint: 'هاتفه مطفأ أو بلا إنترنت منذ الإرسال' },
  { key: 'failed', label: '✗ رفضها واتساب', cls: 'text-rose-300' },
];
function ReadReport({ id, apiFetch }: { id: number; apiFetch: Fetcher }) {
  const [rep, setRep] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/whatsapp/open-window-broadcast/${id}/report`).then((d: any) => { if (alive) setRep(d); }).catch((e: any) => { if (alive) setErr(e?.message || 'تعذّر التحميل'); });
    return () => { alive = false; };
  }, [id, apiFetch]);
  if (err) return <p className="text-xs text-rose-300">{err}</p>;
  if (!rep) return <p className="text-xs text-gray-500">⏳ جارٍ التحميل…</p>;
  return (
    <div className="space-y-2.5 text-xs">
      {READ_GROUPS.map(g => {
        const list = rep.recipients.filter((r: any) => r.group === g.key);
        if (!list.length) return null;
        return (
          <div key={g.key}>
            <div className={`font-bold ${g.cls}`}>{g.label} · {list.length}</div>
            {g.hint && <div className="text-[10.5px] text-gray-500 mb-1">{g.hint}</div>}
            <div className="flex flex-wrap gap-1.5 mt-1">
              {list.map((r: any) => (
                <a key={r.conversationId} href={`/admin/whatsapp?conv=${r.conversationId}`} target="_blank" rel="noreferrer"
                  title={`${r.phone}${r.deliveredAt ? ` · وصلت ${hm(r.deliveredAt)}` : ''}${r.readAt ? ` · قُرئت ${hm(r.readAt)}` : ''}`}
                  className="px-2 py-1 rounded-lg border border-gray-800 bg-gray-900/70 text-gray-200 hover:border-gray-600">
                  {r.name}{r.readAt && <span className="text-[10px] text-sky-400/80 mr-1">{hm(r.readAt)}</span>}
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** شريطُ القراءة: قرأها / وصلت / لم تصل / رُفضت — بنسبها */
function ReadBar({ s }: { s: ReadStats }) {
  const parts = [
    { n: s.read, cls: 'bg-sky-400' }, { n: s.delivered, cls: 'bg-gray-400' },
    { n: s.notDelivered, cls: 'bg-amber-400' }, { n: s.failed, cls: 'bg-rose-400' },
  ];
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-800" dir="ltr">
      {parts.map((p, i) => p.n > 0 && <div key={i} className={p.cls} style={{ width: `${(p.n / Math.max(1, s.recipients)) * 100}%` }} />)}
    </div>
  );
}

function Stat({ label, value, cls = 'text-white' }: { label: string; value: ReactNode; cls?: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2">
      <div className="text-[10.5px] text-gray-500">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

export default function BroadcastHistory({ apiFetch, refreshKey, onReuse }: {
  apiFetch: Fetcher;
  /** يتغيّر عند كلّ تحديثٍ للتبويب (إرسال، إيقاف، كلّ ٥ ثوانٍ أثناء بثٍّ جارٍ) */
  refreshKey: number;
  /** نسخُ نصّ بثٍّ سابق إلى المحرّر */
  onReuse?: (text: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState('new');
  const [status, setStatus] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ rows: Row[]; total: number; summary: { sent: number; targets: number; failed: number } } | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [report, setReport] = useState<number | null>(null);

  // البحث بعد توقّف الكتابة
  useEffect(() => { const t = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [qInput]);

  useEffect(() => {
    let alive = true;
    const s = SORTS.find(x => x.key === sortKey) || SORTS[0];
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: s.sort, order: s.order });
    if (status) qs.set('status', status);
    if (q) qs.set('q', q);
    apiFetch(`/api/whatsapp/open-window-broadcast/history?${qs}`)
      .then((d: any) => { if (!alive) return; setData({ rows: d.rows || [], total: d.total || 0, summary: d.summary || { sent: 0, targets: 0, failed: 0 } }); setErr(''); })
      .catch((e: any) => { if (alive) setErr(e?.message || 'تعذّر تحميل السجلّ'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [apiFetch, page, pageSize, sortKey, status, q, refreshKey]);

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  // أرقامُ الصفحات: الأولى والأخيرة وما حول الحاليّة
  const nums = Array.from(new Set([1, page - 1, page, page + 1, pages].filter(n => n >= 1 && n <= pages))).sort((a, b) => a - b);

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 space-y-3">
      {/* ── الرأس ── */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold text-white">سجلّ البثّ</h3>
        {data && (
          <span className="text-[11px] text-gray-500 tabular-nums">
            {total} بثّاً · أُرسل {data.summary.sent} من {data.summary.targets}{data.summary.failed ? ` · فشل ${data.summary.failed}` : ''}
          </span>
        )}
      </div>

      {/* ── الأدوات ── */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={qInput} onChange={e => setQInput(e.target.value)} placeholder="ابحث في النصّ أو المرسِل أو #الرقم"
          className="flex-1 min-w-[180px] bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-amber-500/50 outline-none" />
        <select value={sortKey} onChange={e => { setSortKey(e.target.value); setPage(1); }}
          className="bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white">
          {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map(f => (
          <button key={f.key || 'all'} onClick={() => { setStatus(f.key); setPage(1); }}
            className={`px-3 py-1 rounded-xl text-xs font-bold border ${status === f.key ? 'bg-amber-500/10 text-amber-400 border-amber-500/40' : 'border-gray-800 text-gray-400 hover:text-white'}`}>{f.label}</button>
        ))}
      </div>

      {/* ── الجدول ── */}
      {err && <p className="text-xs text-rose-400">⚠️ {err}</p>}
      {loading && !data ? <p className="text-xs text-gray-500">جاري التحميل…</p> : !data?.rows.length ? (
        <p className="text-xs text-gray-500 py-4 text-center">{q || status ? 'لا بثّ يطابق البحث.' : 'لا بثّ سابق.'}</p>
      ) : (
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          {/* رأس الأعمدة — للشاشات العريضة */}
          <div className="hidden md:grid grid-cols-[64px_minmax(0,1fr)_120px_150px_28px] gap-3 px-3 py-2 bg-gray-950/60 text-[11px] text-gray-500 font-bold">
            <span>البثّ</span><span>الرسالة</span><span>الإرسال</span><span>القراءة</span><span />
          </div>
          <div className="divide-y divide-gray-800">
            {data.rows.map(r => {
              const st = STATUS[r.status] || { label: r.status, cls: 'bg-gray-800 text-gray-300 border-gray-700' };
              const isOpen = open === r.id;
              const rs = r.readStats;
              return (
                <div key={r.id} className={isOpen ? 'bg-gray-950/40' : ''}>
                  <button type="button" onClick={() => { setOpen(isOpen ? null : r.id); if (isOpen && report === r.id) setReport(null); }}
                    className="w-full text-right grid grid-cols-[1fr_auto] md:grid-cols-[64px_minmax(0,1fr)_120px_150px_28px] gap-x-3 gap-y-2 px-3 py-3 hover:bg-gray-800/30">
                    {/* البثّ */}
                    <div className="flex md:flex-col items-center md:items-start gap-2 md:gap-1 col-span-1">
                      <span className="text-sm text-gray-200 font-bold tabular-nums">#{r.id}</span>
                      <span className={`px-1.5 py-0.5 rounded border text-[10.5px] font-bold ${st.cls}`}>{st.label}</span>
                    </div>
                    <span className="md:hidden text-gray-500 text-xs self-center">{isOpen ? '▲' : '▼'}</span>
                    {/* الرسالة */}
                    <div className="min-w-0 col-span-2 md:col-span-1">
                      <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-2">
                        <span>{dt(r.createdAt)}</span>
                        {r.createdBy && <span>· {r.createdBy}</span>}
                        {r.templateName && <span className="text-amber-400/70">· 📋 {r.templateName}</span>}
                      </div>
                      <p className="text-[13px] text-gray-200 mt-0.5 truncate">{r.imageUrl ? '🖼️ ' : ''}{r.text.split('\n').find(l => l.trim()) || '—'}</p>
                    </div>
                    {/* الإرسال */}
                    <div className="text-xs tabular-nums">
                      <div className="text-white font-bold">✓ {r.sentCount} <span className="text-gray-500 font-normal">/ {r.totalTargets}</span></div>
                      <div className="text-[10.5px] text-gray-500">
                        {r.skippedCount ? `تخطّي ${r.skippedCount}` : ''}{r.skippedCount && r.failedCount ? ' · ' : ''}{r.failedCount ? <span className="text-rose-300">فشل {r.failedCount}</span> : ''}
                        {!r.skippedCount && !r.failedCount ? 'بلا تخطٍّ ولا فشل' : ''}
                      </div>
                    </div>
                    {/* القراءة */}
                    <div className="text-xs tabular-nums space-y-1">
                      {rs && rs.recipients > 0 ? (
                        <>
                          <div className="flex items-baseline gap-1.5"><span className="text-sky-300 font-bold">👁 {pct(rs.read, rs.recipients)}٪</span><span className="text-[10.5px] text-gray-500">{rs.read} من {rs.recipients}</span></div>
                          <ReadBar s={rs} />
                        </>
                      ) : <span className="text-gray-600">—</span>}
                    </div>
                    <span className="hidden md:block text-gray-500 text-xs self-center text-center">{isOpen ? '▲' : '▼'}</span>
                  </button>

                  {/* ── التفصيل ── */}
                  {isOpen && (
                    <div className="px-3 pb-4 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <Stat label="بدأ" value={hm(r.createdAt)} />
                        <Stat label="انتهى" value={r.status === 'running' ? 'جارٍ…' : (hm(r.finishedAt) || '—')} />
                        <Stat label="المدّة" value={dur(r.durationSec)} />
                        <Stat label="بواسطة" value={r.createdBy || '—'} />
                        <Stat label="المستهدفون" value={r.totalTargets} />
                        <Stat label="أُرسل" value={r.sentCount} cls="text-emerald-300" />
                        <Stat label="تخطّي (نافذة أُغلقت/إيقاف)" value={r.skippedCount} cls={r.skippedCount ? 'text-amber-300' : 'text-white'} />
                        <Stat label="فشل" value={r.failedCount} cls={r.failedCount ? 'text-rose-300' : 'text-white'} />
                      </div>
                      {rs && rs.recipients > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <Stat label="👁 قرأها" value={`${rs.read} · ${pct(rs.read, rs.recipients)}٪`} cls="text-sky-300" />
                          <Stat label="✓✓ وصلت ولم تُقرأ" value={rs.delivered} cls="text-gray-200" />
                          <Stat label="✓ لم تصل بعد" value={rs.notDelivered} cls={rs.notDelivered ? 'text-amber-300' : 'text-white'} />
                          <Stat label="✗ رفضها واتساب" value={rs.failed} cls={rs.failed ? 'text-rose-300' : 'text-white'} />
                        </div>
                      )}
                      <div>
                        <div className="text-[11px] text-gray-500 mb-1">الرسالة كاملة{r.templateName ? ` · من القالب «${r.templateName}»` : ''}</div>
                        <div className="max-w-md rounded-2xl rounded-tr-sm px-3 py-2 text-sm text-white whitespace-pre-wrap leading-relaxed" style={{ background: '#005c4b' }}>
                          {r.imageUrl && <img src={`${API_URL}${r.imageUrl}`} alt="" className="block w-full max-h-52 object-cover rounded-xl mb-1.5" />}
                          {r.text}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {rs && rs.recipients > 0 && (
                          <button onClick={() => setReport(report === r.id ? null : r.id)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold border border-gray-700 text-gray-200 hover:bg-gray-800">
                            {report === r.id ? 'إخفاء المستلمين' : '👁 من قرأ؟'}
                          </button>
                        )}
                        {onReuse && (
                          <button onClick={() => onReuse(r.text.replace(/\n\n— لإيقاف هذه الرسائل أرسل: إيقاف$/, ''))}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold border border-gray-700 text-gray-200 hover:bg-gray-800">
                            ✏️ استعمل النصّ في رسالةٍ جديدة
                          </button>
                        )}
                      </div>
                      {report === r.id && <ReadReport id={r.id} apiFetch={apiFetch} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── الصفحات ── */}
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-500 tabular-nums">عرض {from}–{to} من {total}</span>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="bg-gray-950 border border-gray-800 rounded-lg px-2 py-1 text-xs text-white">
            {PAGE_SIZES.map(n => <option key={n} value={n}>{n} في الصفحة</option>)}
          </select>
          <div className="flex items-center gap-1 mr-auto">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-2.5 py-1 rounded-lg border border-gray-800 text-gray-300 disabled:opacity-30 hover:bg-gray-800">السابق</button>
            {nums.map((n, i) => (
              <span key={n} className="flex items-center gap-1">
                {i > 0 && n - nums[i - 1] > 1 && <span className="text-gray-600">…</span>}
                <button onClick={() => setPage(n)}
                  className={`min-w-[28px] px-2 py-1 rounded-lg border tabular-nums ${n === page ? 'border-amber-500/50 bg-amber-500/10 text-amber-400 font-bold' : 'border-gray-800 text-gray-300 hover:bg-gray-800'}`}>{n}</button>
              </span>
            ))}
            <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
              className="px-2.5 py-1 rounded-lg border border-gray-800 text-gray-300 disabled:opacity-30 hover:bg-gray-800">التالي</button>
          </div>
        </div>
      )}
    </div>
  );
}
