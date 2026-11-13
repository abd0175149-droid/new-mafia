'use client';

// ══════════════════════════════════════════════════════
// 📜 سجلّ البثّ — بصفحات، وترتيبٍ، وتصفيةٍ بالحالة، وبحثٍ، وتفصيلٍ كاملٍ لكلّ بثّ
// البيانات من /api/whatsapp/open-window-broadcast/history (whatsapp-broadcast.service → pageBroadcasts)
// ══════════════════════════════════════════════════════

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Copy, Eye, FileText, Image as ImageIcon, Search, TriangleAlert, Video } from 'lucide-react';
import { Badge, Chip, Empty, Skel, type Tone } from './wa-ui';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;
interface ReadStats { recipients: number; read: number; delivered: number; notDelivered: number; failed: number; queued?: number }
interface Row {
  id: number; status: string; createdBy: string; createdAt: string; finishedAt: string | null; durationSec: number | null;
  text: string; imageUrl: string | null; videoUrl?: string | null; templateId: number | null; templateName: string | null;
  totalTargets: number; sentCount: number; skippedCount: number; failedCount: number;
  readStats: ReadStats | null; readRate: number | null;
  origin?: string; lane?: string; audienceLabel?: string;
}
const ORIGIN_AR: Record<string, string> = { reservations: 'من الحجوزات', analytics: 'من التحليلات', explorer: 'من المستكشف' };

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const STATUS: Record<string, { label: string; tone?: Tone }> = {
  done: { label: 'اكتمل', tone: 'ok' },
  running: { label: 'جارٍ', tone: 'warn' },
  sending: { label: 'يُرسَل', tone: 'info' },
  stopped: { label: 'أُوقف', tone: 'danger' },
};
const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: 'الكلّ' }, { key: 'done', label: 'اكتمل' }, { key: 'sending', label: 'يُرسَل' }, { key: 'running', label: 'جارٍ' }, { key: 'stopped', label: 'أُوقف' },
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
const small = { font: '500 12px/16px var(--font-sans)' } as const;
const READ_GROUPS: Array<{ key: string; label: string; color: string; hint?: string }> = [
  { key: 'read', label: 'قرأها', color: 'var(--info)' },
  { key: 'delivered', label: 'وصلت ولم تُقرأ', color: 'var(--ink-2)', hint: 'تشمل من أطفأ «إيصالات القراءة» — واتساب لا يخبرنا بقراءته أصلاً' },
  { key: 'queued', label: 'في الطابور', color: 'var(--ch-web)', hint: 'لم تخرج بعد — رقم الأعمال يرسل الجماعيّ متباعداً (١٥–٤٥ث، ٢٥٠/يوم، ١٠:٠٠–٢٣:٣٠)' },
  { key: 'notDelivered', label: 'لم تصل بعد', color: 'var(--warn)', hint: 'خرجت ولم تصل الجهاز — هاتفه مطفأ أو بلا إنترنت منذ الإرسال' },
  { key: 'failed', label: 'رفضها واتساب', color: 'var(--danger)' },
];
function ReadReport({ id, apiFetch }: { id: number; apiFetch: Fetcher }) {
  const [rep, setRep] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/whatsapp/open-window-broadcast/${id}/report`).then((d: any) => { if (alive) setRep(d); }).catch((e: any) => { if (alive) setErr(e?.message || 'تعذّر التحميل'); });
    return () => { alive = false; };
  }, [id, apiFetch]);
  if (err) return <p style={{ ...small, margin: 0, color: 'var(--danger)' }}>{err}</p>;
  if (!rep) return <div className="stack" aria-label="جارٍ التحميل…"><Skel h={18} w="40%" /><Skel h={36} /></div>;
  return (
    <div className="stack">
      {READ_GROUPS.map(g => {
        const list = rep.recipients.filter((r: any) => r.group === g.key);
        if (!list.length) return null;
        return (
          <div key={g.key}>
            <div style={{ font: '700 13px/18px var(--font-sans)', color: g.color }}>{g.label} · <span className="ltr">{list.length}</span></div>
            {g.hint && <div className="muted" style={small}>{g.hint}</div>}
            <div className="flex flex-wrap gap-2" style={{ marginTop: 6 }}>
              {list.map((r: any) => (
                <a key={r.conversationId} href={`/admin/whatsapp?conv=${r.conversationId}`} target="_blank" rel="noreferrer"
                  title={`${r.phone}${r.deliveredAt ? ` · وصلت ${hm(r.deliveredAt)}` : ''}${r.readAt ? ` · قُرئت ${hm(r.readAt)}` : ''}`}
                  className="wa-who">
                  {r.name}{r.readAt && <span className="ltr muted" style={{ fontSize: 12 }}>{hm(r.readAt)}</span>}
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
    { n: s.read, c: 'var(--info)' }, { n: s.delivered, c: 'var(--ink-3)' },
    { n: s.notDelivered, c: 'var(--warn)' }, { n: s.queued || 0, c: 'var(--ch-web)' }, { n: s.failed, c: 'var(--danger)' },
  ];
  return (
    <div className="wa-readbar">
      {parts.map((p, i) => p.n > 0 && <i key={i} style={{ width: `${(p.n / Math.max(1, s.recipients)) * 100}%`, background: p.c }} />)}
    </div>
  );
}

/** بلاطة رقمٍ صغيرة — `color` متغيّر لونٍ اختياريّ للقيمة */
function Stat({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div className="wa-tile">
      <div className="k">{label}</div>
      <div className="v" style={{ fontSize: 18, lineHeight: '24px', color }}>{value}</div>
    </div>
  );
}
function KV({ label, children }: { label: string; children: ReactNode }) {
  return <div className="wa-kv"><span>{label}</span><b>{children}</b></div>;
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
    <div className="wa-card" style={{ padding: 0 }}>
      {/* ── الرأس ── */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" style={{ padding: 'var(--space-3) var(--space-4) 0' }}>
        <h3 style={{ margin: 0, font: '700 16px/24px var(--font-sans)' }}>سجلّ البثّ</h3>
        {data && (
          <span className="muted" style={{ font: '400 13px/20px var(--font-sans)' }}>
            <span className="ltr">{total}</span> بثّاً · أُرسل <span className="ltr">{data.summary.sent}</span> من <span className="ltr">{data.summary.targets}</span>{data.summary.failed ? <> · فشل <span className="ltr">{data.summary.failed}</span></> : ''}
          </span>
        )}
      </div>

      {/* ── الأدوات ── */}
      <div className="flex flex-wrap items-center gap-3" style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--line)' }}>
        <div className="wa-search grow" style={{ minWidth: 200, maxWidth: 340 }}>
          <Search aria-hidden />
          <input value={qInput} onChange={e => setQInput(e.target.value)} placeholder="ابحث في النصّ أو المرسِل أو #الرقم"
            className="wa-input" aria-label="بحث في السجلّ" />
        </div>
        <div className="wa-chips grow" role="group" aria-label="تصفية بالحالة">
          {STATUS_FILTERS.map(f => (
            <Chip key={f.key || 'all'} on={status === f.key} onClick={() => { setStatus(f.key); setPage(1); }}>{f.label}</Chip>
          ))}
        </div>
        <select value={sortKey} onChange={e => { setSortKey(e.target.value); setPage(1); }}
          className="wa-select" aria-label="الترتيب" style={{ width: 190 }}>
          {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/* ── الجدول ── */}
      {err && <div className="wa-banner danger flat" role="alert"><TriangleAlert aria-hidden /><span>{err}</span></div>}
      {loading && !data ? (
        <div className="stack" style={{ padding: 'var(--space-4)' }} aria-label="جاري التحميل…"><Skel h={48} /><Skel h={48} /><Skel h={48} /></div>
      ) : !data?.rows.length ? (
        <Empty title={q || status ? 'لا بثّ يطابق البحث.' : 'لا بثّ سابق.'} />
      ) : (
        <div>
          {/* رأس الأعمدة — للشاشات العريضة */}
          <div className="hidden md:grid grid-cols-[64px_minmax(0,1fr)_120px_150px_28px] gap-3 muted"
            style={{ padding: 'var(--space-2) var(--space-4)', font: '700 12px/16px var(--font-sans)', borderBottom: '1px solid var(--line)' }}>
            <span>البثّ</span><span>الرسالة</span><span>الإرسال</span><span>القراءة</span><span />
          </div>
          <div className="wa-legend" aria-label="مفتاح ألوان شريط القراءة">
            <span><i style={{ background: 'var(--info)' }} />قرأها</span>
            <span><i style={{ background: 'var(--ink-3)' }} />وصلت</span>
            <span><i style={{ background: 'var(--warn)' }} />لم تصل</span>
            <span><i style={{ background: 'var(--ch-web)' }} />في الطابور</span>
            <span><i style={{ background: 'var(--danger)' }} />رُفضت</span>
          </div>
          <div>
            {data.rows.map(r => {
              const st = STATUS[r.status] || { label: r.status };
              const isOpen = open === r.id;
              const rs = r.readStats;
              return (
                <div key={r.id} style={{ borderBottom: '1px solid var(--line)', background: isOpen ? 'var(--bg-200)' : undefined }}>
                  <button type="button" aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? null : r.id); if (isOpen && report === r.id) setReport(null); }}
                    className="w-full grid grid-cols-[1fr_auto] md:grid-cols-[64px_minmax(0,1fr)_120px_150px_28px] gap-x-3 gap-y-2"
                    style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'start', background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', minHeight: 'var(--hit)' }}>
                    {/* البثّ */}
                    <div className="flex md:flex-col items-center md:items-start gap-2 md:gap-1 col-span-1">
                      <b className="ltr">#{r.id}</b>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <span className="md:hidden self-center" style={{ color: isOpen ? 'var(--gold)' : 'var(--ink-3)' }}>{isOpen ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}</span>
                    {/* الرسالة */}
                    <div className="min-w-0 col-span-2 md:col-span-1">
                      <div className="flex flex-wrap gap-x-2 muted" style={small}>
                        <span>{dt(r.createdAt)}</span>
                        {r.createdBy && <span>· {r.createdBy}</span>}
                        {r.origin && ORIGIN_AR[r.origin] && <span style={{ color: 'var(--ch-web)' }}>· {ORIGIN_AR[r.origin]}{r.audienceLabel ? ` (${r.audienceLabel})` : ''}</span>}
                        {r.templateName && <span className="row" style={{ gap: 4, color: 'var(--gold)' }}>· <FileText className="s" aria-hidden /> {r.templateName}</span>}
                      </div>
                      <p className="row" style={{ margin: '2px 0 0', gap: 6, font: '400 14px/22px var(--font-sans)' }}>
                        {r.imageUrl ? <ImageIcon className="s" aria-label="صورة" /> : r.videoUrl ? <Video className="s" aria-label="فيديو" /> : null}
                        <span className="trunc grow">{r.text.split('\n').find(l => l.trim()) || '—'}</span>
                      </p>
                    </div>
                    {/* الإرسال */}
                    <div>
                      <div><b className="ltr">{r.sentCount} / {r.totalTargets}</b></div>
                      <div className="muted" style={small}>
                        {r.skippedCount ? `تخطّي ${r.skippedCount}` : ''}{r.skippedCount && r.failedCount ? ' · ' : ''}{r.failedCount ? <span style={{ color: 'var(--danger)' }}>فشل {r.failedCount}</span> : ''}
                        {!r.skippedCount && !r.failedCount ? 'بلا تخطٍّ ولا فشل' : ''}
                      </div>
                    </div>
                    {/* القراءة */}
                    <div className="stack" style={{ gap: 4 }}>
                      {rs && rs.recipients > 0 ? (
                        <>
                          <div className="row"><Eye className="s" aria-hidden style={{ color: 'var(--info)' }} /><b className="ltr" style={{ color: 'var(--info)' }}>{pct(rs.read, rs.recipients)}%</b><span className="muted" style={small}>{rs.read} من {rs.recipients}</span></div>
                          <ReadBar s={rs} />
                        </>
                      ) : <span className="muted">—</span>}
                    </div>
                    <span className="hidden md:block self-center text-center" style={{ color: isOpen ? 'var(--gold)' : 'var(--ink-3)' }}>{isOpen ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}</span>
                  </button>

                  {/* ── التفصيل ── */}
                  {isOpen && (
                    <div className="grid grid-cols-1 md:grid-cols-[340px_minmax(0,1fr)] gap-5" style={{ padding: '0 var(--space-4) var(--space-4)' }}>
                      <div className="stack min-w-0">
                        <div className="muted" style={small}>الرسالة كاملة{r.templateName ? ` · من القالب «${r.templateName}»` : ''}</div>
                        <div className="wa-wamock">
                          <div className="b">
                            {r.imageUrl && <img src={`${API_URL}${r.imageUrl}`} alt="" />}
                            {r.videoUrl && <video src={`${API_URL}${r.videoUrl}`} controls preload="metadata" />}
                            {r.text}
                          </div>
                        </div>
                        <div>
                          <KV label="بدأ"><span className="ltr">{hm(r.createdAt)}</span></KV>
                          <KV label="انتهى">{r.status === 'running' || r.status === 'sending' ? 'جارٍ…' : (hm(r.finishedAt) ? <span className="ltr">{hm(r.finishedAt)}</span> : '—')}</KV>
                          <KV label="المدّة">{dur(r.durationSec)}</KV>
                          <KV label="بواسطة">{r.createdBy || '—'}</KV>
                        </div>
                        {onReuse && (
                          <button type="button" className="wa-btn" onClick={() => onReuse(r.text.replace(/\n\n— لإيقاف هذه الرسائل أرسل: إيقاف$/, ''))}>
                            <Copy aria-hidden />استعمل النصّ في رسالةٍ جديدة
                          </button>
                        )}
                      </div>
                      <div className="stack min-w-0">
                        <div className="wa-grid4 keep2">
                          <Stat label="المستهدفون" value={r.totalTargets} />
                          <Stat label={r.status === 'sending' ? 'خرج فعلاً حتّى الآن' : 'أُرسل'} value={r.sentCount} color="var(--ok)" />
                          <Stat label="تخطّي (نافذة أُغلقت/إيقاف)" value={r.skippedCount} color={r.skippedCount ? 'var(--warn)' : undefined} />
                          <Stat label="فشل" value={r.failedCount} color={r.failedCount ? 'var(--danger)' : undefined} />
                        </div>
                        {rs && rs.recipients > 0 && (
                          <div className="wa-grid4 keep2">
                            <Stat label="قرأها" value={`${rs.read} · ${pct(rs.read, rs.recipients)}%`} color="var(--info)" />
                            <Stat label="وصلت ولم تُقرأ" value={rs.delivered} />
                            {(rs.queued || 0) > 0 && <Stat label="في الطابور" value={rs.queued} color="var(--ch-web)" />}
                            <Stat label="لم تصل بعد" value={rs.notDelivered} color={rs.notDelivered ? 'var(--warn)' : undefined} />
                            <Stat label="رفضها واتساب" value={rs.failed} color={rs.failed ? 'var(--danger)' : undefined} />
                          </div>
                        )}
                        {rs && rs.recipients > 0 && (
                          <button type="button" className="wa-btn" style={{ alignSelf: 'flex-start' }} aria-expanded={report === r.id} onClick={() => setReport(report === r.id ? null : r.id)}>
                            <Eye aria-hidden />{report === r.id ? 'إخفاء المستلمين' : 'من قرأ؟'}
                          </button>
                        )}
                        {report === r.id && <ReadReport id={r.id} apiFetch={apiFetch} />}
                      </div>
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
        <div className="flex flex-wrap items-center gap-2" style={{ padding: 'var(--space-3) var(--space-4)' }}>
          <span className="muted" style={{ font: '400 13px/20px var(--font-sans)' }}>عرض <span className="ltr">{from}–{to}</span> من <span className="ltr">{total}</span></span>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="wa-select" aria-label="عدد الصفوف في الصفحة" style={{ width: 150 }}>
            {PAGE_SIZES.map(n => <option key={n} value={n}>{n} في الصفحة</option>)}
          </select>
          <div className="flex flex-wrap items-center gap-1" style={{ marginInlineStart: 'auto' }}>
            <button type="button" className="wa-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>السابق</button>
            {nums.map((n, i) => (
              <span key={n} className="row" style={{ gap: 4 }}>
                {i > 0 && n - nums[i - 1] > 1 && <span className="muted">…</span>}
                <button type="button" className="wa-btn" aria-current={n === page ? 'page' : undefined} onClick={() => setPage(n)}
                  style={{ minWidth: 'var(--hit)', padding: '0 var(--space-2)', fontFamily: 'var(--font-mono)', ...(n === page ? { borderColor: 'var(--gold)', background: 'var(--gold-soft)', color: 'var(--gold)' } : null) }}>{n}</button>
              </span>
            ))}
            <button type="button" className="wa-btn" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>التالي</button>
          </div>
        </div>
      )}
    </div>
  );
}
