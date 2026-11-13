'use client';

// ══════════════════════════════════════════════════════
// 📇 جهات خطّ الأعمال — السجلّ الكامل لمن يملك الخطّ محادثةً معه
// ══════════════════════════════════════════════════════
// شاشةٌ مستقلّة عن الوارد: دفتر علاقات الخطّ كاملاً، لاعبون وغيرهم بالأسماء والأرقام، مع مزامنةٍ يدويّة.
// «راسلَنا» = أرسل لنا ولو مرّةً في أيّ وقت (من التاريخ المسترجَع + المباشر). و«منّا فقط» تنقسم:
// «لم يراسلنا قطّ» حين التاريخ كاملٌ بين أيدينا، و«غير محسوم» حين بقي تاريخٌ أقدم على الهاتف.

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, Contact, History, Loader2, RefreshCw, ScrollText, Search, User } from 'lucide-react';
import { swalToast } from '@/lib/swal';
import { Badge, Card, Empty, PageHead, Skel, type Tone } from './wa-ui';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;
const STATUS_AR: Record<string, { t: string; tone?: Tone; title: string }> = {
  two_way: { t: 'راسلَنا', tone: 'ok', title: 'أرسل لنا رسالةً واحدة على الأقلّ على رقم الأعمال — الأأمن للإرسال' },
  never: { t: 'منّا فقط · لم يراسلنا', tone: 'danger', title: 'التاريخ كاملٌ بين أيدينا وليس فيه إلّا رسائلنا — أيّ إرسالٍ له مراسلةٌ من طرفٍ واحد' },
  partial: { t: 'منّا فقط · غير محسوم', tone: 'warn', title: 'لا رسالة منه فيما استرجعناه، وبقي تاريخٌ أقدم على الهاتف لم يُسترجع بعد' },
  unknown: { t: '—', title: '' },
};
const fmtDay = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const ago = (iso?: string | null) => {
  if (!iso) return '—';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60e3);
  return m < 1 ? 'الآن' : m < 60 ? `قبل ${m} د` : m < 1440 ? `قبل ${Math.round(m / 60)} س` : `قبل ${Math.round(m / 1440)} ي`;
};
const SMALL: CSSProperties = { font: '500 12px/18px var(--font-sans)' };
const N = ({ children }: { children: ReactNode }) => <span className="ltr" style={{ fontSize: 12 }}>{children}</span>;

/** بلاطة رقم هي نفسها فلتر */
function FilterTile({ k, v, on, onClick, tone, vColor }: { k: string; v: ReactNode; on: boolean; onClick: () => void; tone?: 'ok' | 'danger' | 'gold'; vColor?: string }) {
  return (
    <button type="button" className={`wa-tile${tone ? ' ' + tone : ''}`} aria-pressed={on} onClick={onClick}
      style={{ border: `1px solid var(${on ? '--gold' : '--line'})`, textAlign: 'start', color: 'inherit', font: 'inherit', cursor: 'pointer', minHeight: 'var(--hit)' }}>
      <div className="k">{k}</div>
      <div className="v" style={vColor ? { color: vColor } : undefined}>{v}</div>
    </button>
  );
}

export default function LineContactsSection({ apiFetch, onOpenPhone }: { apiFetch: Fetcher; onOpenPhone?: (phone: string) => void }) {
  const [d, setD] = useState<any>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'two_way' | 'has_chat' | 'never' | 'partial'>('');
  const [who, setWho] = useState<'all' | 'players' | 'others'>('all');
  const [page, setPage] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const qRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/whatsapp/channels/roster?q=${encodeURIComponent(q)}&status=${status}&players=${who}&limit=50&offset=${page * 50}`);
      setD(r);
    } catch (e: any) { swalToast(e.message, 'error'); }
  }, [apiFetch, q, status, who, page]);

  useEffect(() => { load(); }, [load]);
  // مزامنةٌ جارية؟ حدّث كلّ ٥ ثوانٍ
  useEffect(() => { if (!d?.stats?.syncing) return; const t = setInterval(load, 5000); return () => clearInterval(t); }, [d?.stats?.syncing, load]);

  const sync = async () => {
    setSyncing(true);
    try { await apiFetch('/api/whatsapp/channels/roster/sync', { method: 'POST', body: JSON.stringify({}) }); swalToast('بدأت المزامنة — تُحدَّث القائمة تلقائيّاً', 'info'); setTimeout(load, 1500); }
    catch (e: any) { swalToast(e.message, 'error'); }
    finally { setSyncing(false); }
  };

  const onSearch = (v: string) => { setQ(v); setPage(0); clearTimeout(qRef.current); qRef.current = setTimeout(load, 400); };
  const st = d?.stats;
  const total = Number(d?.total || 0);
  const rows: any[] = d?.rows || [];

  return (
    <>
      <PageHead title="جهات خطّ الأعمال" sub="كلّ من بينه وبين رقم الأعمال محادثة — وأساس فلتر «راسلَنا» في كلّ الصفحات">
        <button type="button" className="wa-btn primary" onClick={sync} disabled={syncing || st?.syncing}>
          {st?.syncing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
          {st?.syncing ? 'تُزامن…' : 'مزامنة الآن'}
        </button>
      </PageHead>

      {st && (
        <div className="wa-kpis" role="group" aria-label="فلاتر سريعة">
          <FilterTile k="الإجمالي" v={st.total} on={status === '' && who === 'all'} onClick={() => { setStatus(''); setWho('all'); setPage(0); }} />
          <FilterTile k="راسلَنا (في أيّ وقت)" v={st.two_way} tone="ok" on={status === 'two_way'} onClick={() => { setStatus('two_way'); setPage(0); }} />
          <FilterTile k="منّا فقط · لم يراسلنا" v={st.never ?? 0} tone="danger" on={status === 'never'} onClick={() => { setStatus('never'); setPage(0); }} />
          <FilterTile k="منّا فقط · غير محسوم" v={st.partial ?? st.has_chat} vColor="var(--warn)" on={status === 'partial'} onClick={() => { setStatus('partial'); setPage(0); }} />
          <FilterTile k="لاعبون" v={st.players} tone="gold" on={who === 'players'} onClick={() => { setWho('players'); setPage(0); }} />
          <FilterTile k="غير لاعبين" v={st.others} on={who === 'others'} onClick={() => { setWho('others'); setPage(0); }} />
        </div>
      )}

      {(st?.lastSync || st?.historyScan) && (
        <div className="stack muted" style={{ ...SMALL, gap: 'var(--space-1)' }}>
          {st?.lastSync && (
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <History className="s" style={{ marginTop: 3 }} aria-hidden="true" />
              <span>
                آخر مزامنة: {ago(st.lastSync.at)} · <N>{st.lastSync.added || 0}</N> جهة من <N>{st.lastSync.chats || 0}</N> محادثة
                {st.lastSync.error && (
                  <span style={{ color: 'var(--warn)' }}> · <AlertTriangle className="s" style={{ display: 'inline', verticalAlign: '-2px' }} aria-label="تحذير" /> {st.lastSync.error}</span>
                )}
              </span>
            </div>
          )}
          {st?.historyScan && (
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <ScrollText className="s" style={{ marginTop: 3 }} aria-hidden="true" />
              <span>
                آخر فحصٍ لتاريخ الرسائل: {ago(st.historyScan.at)} · <N>{st.historyScan.chats}</N> محادثة · <N>{st.historyScan.messages}</N> رسالة
                {' '}· تاريخها كامل <N>{st.historyScan.complete}</N> · بقي لها تاريخٌ أقدم على الهاتف <N>{st.historyScan.partial}</N>
              </span>
            </div>
          )}
        </div>
      )}

      <Card style={{ padding: 0 }}>
        <div className="flex flex-wrap gap-2 items-center" style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--line)' }}>
          <div className="wa-search" style={{ flex: '2 1 220px', minWidth: 0 }}>
            <Search aria-hidden="true" />
            <input defaultValue={q} onChange={e => onSearch(e.target.value)} placeholder="بحث بالاسم أو الرقم…" aria-label="بحث بالاسم أو الرقم" className="wa-input" />
          </div>
          <select value={status} onChange={e => { setStatus(e.target.value as any); setPage(0); }} className="wa-select" aria-label="الحالة" style={{ flex: '1 1 160px', width: 'auto', minWidth: 0 }}>
            <option value="">كلّ الحالات</option><option value="two_way">راسلَنا (في أيّ وقت)</option><option value="has_chat">منّا فقط (الكلّ)</option>
            <option value="never">منّا فقط · لم يراسلنا قطّ</option><option value="partial">منّا فقط · غير محسوم</option>
          </select>
          <select value={who} onChange={e => { setWho(e.target.value as any); setPage(0); }} className="wa-select" aria-label="لاعبون أم غيرهم" style={{ flex: '1 1 130px', width: 'auto', minWidth: 0 }}>
            <option value="all">الكلّ</option><option value="players">لاعبون</option><option value="others">غير لاعبين</option>
          </select>
        </div>

        {!d && (
          <div className="stack" style={{ padding: 'var(--space-4)' }} role="status" aria-label="تحميل…">
            <Skel h={44} /><Skel h={44} /><Skel h={44} /><Skel h={44} />
          </div>
        )}

        {rows.length > 0 && (
          <div className="wa-tablewrap">
            <table className="wa-table cards">
              <thead><tr><th>الجهة</th><th>الرقم</th><th>الرسائل منه</th><th>الحالة</th><th>آخر نشاط</th></tr></thead>
              <tbody>
                {rows.map((r: any) => {
                  const s = STATUS_AR[r.status] || STATUS_AR.unknown;
                  const nm = r.player_name || r.name;
                  return (
                    <tr key={r.phone} onClick={onOpenPhone ? () => onOpenPhone(r.phone) : undefined} style={onOpenPhone ? { cursor: 'pointer' } : undefined} title={onOpenPhone ? 'افتح محادثته' : undefined}>
                      <td>
                        <span className="row" style={{ minWidth: 0 }}>
                          {nm ? <b className="trunc">{nm}</b> : <span className="muted">—</span>}
                          {r.player_id && <Badge tone="gold"><User aria-hidden="true" />لاعب</Badge>}
                        </span>
                      </td>
                      <td data-l="الرقم"><span className="ltr">{r.phone}</span></td>
                      <td data-l="الرسائل منه">
                        {r.status === 'two_way' && Number(r.inbound_count) > 0
                          ? <span><span className="ltr">{r.inbound_count}</span> رسالة منه{r.first_inbound_at ? ` · أوّلها ${fmtDay(r.first_inbound_at)}` : ''}</span>
                          : <span className="muted">—</span>}
                      </td>
                      <td data-l="الحالة">
                        <span className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                          <Badge tone={s.tone} title={s.title}>{s.t}</Badge>
                          {r.unread > 0 && <Badge tone="danger">غير مقروء <span className="ltr" style={{ fontSize: 12 }}>{r.unread}</span></Badge>}
                        </span>
                      </td>
                      <td data-l="آخر نشاط"><span className="muted" style={{ whiteSpace: 'nowrap' }}>{ago(r.inbound_at || r.last_chat_at)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {d && d.rows?.length === 0 && (
          <Empty icon={<Contact aria-hidden="true" />} title="لا نتائج">{st?.total === 0 ? 'شغّل «مزامنة الآن» بعد ربط الرقم' : undefined}</Empty>
        )}

        {total > 50 && (
          <div className="row" style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--line)' }}>
            <span className="muted grow" style={{ font: '500 13px/18px var(--font-sans)' }}>
              <span className="ltr">{page * 50 + 1}–{Math.min((page + 1) * 50, total)}</span> من <span className="ltr">{total}</span>
            </span>
            <button type="button" className="wa-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>السابق</button>
            <button type="button" className="wa-btn" disabled={(page + 1) * 50 >= total} onClick={() => setPage(p => p + 1)}>التالي</button>
          </div>
        )}
      </Card>
    </>
  );
}
