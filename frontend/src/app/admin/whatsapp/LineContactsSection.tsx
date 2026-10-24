'use client';

// ══════════════════════════════════════════════════════
// 📇 جهات خطّ الأعمال — السجلّ الكامل لمن يملك الخطّ محادثةً معه
// ══════════════════════════════════════════════════════
// شاشةٌ مستقلّة عن الوارد: دفتر علاقات الخطّ كاملاً، لاعبون وغيرهم بالأسماء والأرقام، مع مزامنةٍ يدويّة.
// «راسلَنا» = أرسل لنا ولو مرّةً في أيّ وقت (من التاريخ المسترجَع + المباشر). و«منّا فقط» تنقسم:
// «لم يراسلنا قطّ» حين التاريخ كاملٌ بين أيدينا، و«غير محسوم» حين بقي تاريخٌ أقدم على الهاتف.

import { useCallback, useEffect, useRef, useState } from 'react';
import { swalToast } from '@/lib/swal';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;
const STATUS_AR: Record<string, { t: string; cls: string; title: string }> = {
  two_way: { t: 'راسلَنا', cls: 'bg-emerald-500/15 text-emerald-300', title: 'أرسل لنا رسالةً واحدة على الأقلّ على رقم الأعمال — الأأمن للإرسال' },
  never: { t: 'منّا فقط · لم يراسلنا', cls: 'bg-rose-500/10 text-rose-300', title: 'التاريخ كاملٌ بين أيدينا وليس فيه إلّا رسائلنا — أيّ إرسالٍ له مراسلةٌ من طرفٍ واحد' },
  partial: { t: 'منّا فقط · غير محسوم', cls: 'bg-amber-500/10 text-amber-300', title: 'لا رسالة منه فيما استرجعناه، وبقي تاريخٌ أقدم على الهاتف لم يُسترجع بعد' },
  unknown: { t: '—', cls: 'bg-gray-800 text-gray-400', title: '' },
};
const fmtDay = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const ago = (iso?: string | null) => {
  if (!iso) return '—';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60e3);
  return m < 1 ? 'الآن' : m < 60 ? `قبل ${m} د` : m < 1440 ? `قبل ${Math.round(m / 60)} س` : `قبل ${Math.round(m / 1440)} ي`;
};
const inp = 'bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-sm text-white focus:border-amber-500 outline-none';

export default function LineContactsSection({ apiFetch }: { apiFetch: Fetcher }) {
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

  return (
    <div className="space-y-3 text-sm" dir="rtl">
      <div className="flex items-start gap-2 flex-wrap">
        <b className="text-white text-base">📇 جهات خطّ الأعمال</b>
        <span className="text-gray-500 text-xs">كلّ من بينه وبين رقم الأعمال محادثة — وأساس فلتر «راسلَنا» في كلّ الصفحات</span>
        <button onClick={sync} disabled={syncing || st?.syncing} className="mr-auto px-3 py-1.5 rounded-xl bg-amber-500 text-black font-bold text-xs disabled:opacity-50">
          {st?.syncing ? '⏳ تُزامن…' : '↻ مزامنة الآن'}
        </button>
      </div>

      {st && (
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center">
          <div className="rounded-xl border border-gray-800 p-2"><div className="text-xl font-bold text-white tabular-nums">{st.total}</div><div className="text-[11px] text-gray-400">الإجمالي</div></div>
          <button onClick={() => { setStatus('two_way'); setPage(0); }} className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-2"><div className="text-xl font-bold text-emerald-300 tabular-nums">{st.two_way}</div><div className="text-[11px] text-gray-400">راسلَنا (في أيّ وقت)</div></button>
          <button onClick={() => { setStatus('never'); setPage(0); }} className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-2"><div className="text-xl font-bold text-rose-300 tabular-nums">{st.never ?? 0}</div><div className="text-[11px] text-gray-400">منّا فقط · لم يراسلنا</div></button>
          <button onClick={() => { setStatus('partial'); setPage(0); }} className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-2"><div className="text-xl font-bold text-amber-300 tabular-nums">{st.partial ?? st.has_chat}</div><div className="text-[11px] text-gray-400">منّا فقط · غير محسوم</div></button>
          <div className="rounded-xl border border-gray-800 p-2"><div className="text-xl font-bold text-amber-300 tabular-nums">{st.players}</div><div className="text-[11px] text-gray-400">لاعبون</div></div>
          <div className="rounded-xl border border-gray-800 p-2"><div className="text-xl font-bold text-gray-300 tabular-nums">{st.others}</div><div className="text-[11px] text-gray-400">غير لاعبين</div></div>
        </div>
      )}
      {st?.lastSync && (
        <div className="text-[11px] text-gray-500">آخر مزامنة: {ago(st.lastSync.at)} · {st.lastSync.added || 0} جهة من {st.lastSync.chats || 0} محادثة{st.lastSync.error ? ` · ⚠️ ${st.lastSync.error}` : ''}</div>
      )}
      {st?.historyScan && (
        <div className="text-[11px] text-gray-500">
          📜 آخر فحصٍ لتاريخ الرسائل: {ago(st.historyScan.at)} · {st.historyScan.chats} محادثة · {st.historyScan.messages} رسالة
          {' '}· تاريخها كامل {st.historyScan.complete} · بقي لها تاريخٌ أقدم على الهاتف {st.historyScan.partial}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <input defaultValue={q} onChange={e => onSearch(e.target.value)} placeholder="🔍 بحث بالاسم أو الرقم…" className={inp + ' flex-1 min-w-[180px]'} />
        <select value={status} onChange={e => { setStatus(e.target.value as any); setPage(0); }} className={inp}>
          <option value="">كلّ الحالات</option><option value="two_way">راسلَنا (في أيّ وقت)</option><option value="has_chat">منّا فقط (الكلّ)</option>
          <option value="never">منّا فقط · لم يراسلنا قطّ</option><option value="partial">منّا فقط · غير محسوم</option>
        </select>
        <select value={who} onChange={e => { setWho(e.target.value as any); setPage(0); }} className={inp}>
          <option value="all">الكلّ</option><option value="players">لاعبون</option><option value="others">غير لاعبين</option>
        </select>
      </div>

      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <div className="max-h-[52vh] overflow-y-auto divide-y divide-gray-800/70">
          {(d?.rows || []).map((r: any) => {
            const s = STATUS_AR[r.status] || STATUS_AR.unknown;
            return (
              <div key={r.phone} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-gray-100 truncate">{r.player_name || r.name || '—'}{r.player_id && <span className="text-[10px] text-amber-400 mr-1.5">👤 لاعب</span>}</div>
                  <div className="text-[11px] text-gray-500"><span dir="ltr">{r.phone}</span>
                    {r.status === 'two_way' && Number(r.inbound_count) > 0 && <span className="mr-2 text-emerald-400/80">{r.inbound_count} رسالة منه{r.first_inbound_at ? ` · أوّلها ${fmtDay(r.first_inbound_at)}` : ''}</span>}
                  </div>
                </div>
                {r.unread > 0 && <span className="text-[10px] bg-rose-500/15 text-rose-300 rounded-full px-1.5">غير مقروء {r.unread}</span>}
                <span title={s.title} className={`text-[10.5px] font-bold rounded-full px-2 py-0.5 ${s.cls}`}>{s.t}</span>
                <span className="text-[10px] text-gray-500 w-14 text-left shrink-0">{ago(r.inbound_at || r.last_chat_at)}</span>
              </div>
            );
          })}
          {d && d.rows?.length === 0 && <div className="text-gray-500 text-center py-6">لا نتائج{st?.total === 0 ? ' — شغّل «مزامنة الآن» بعد ربط الرقم' : ''}</div>}
        </div>
      </div>

      {total > 50 && (
        <div className="flex items-center justify-center gap-3 text-xs">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded-lg border border-gray-800 text-gray-300 disabled:opacity-40">السابق</button>
          <span className="text-gray-500">{page * 50 + 1}–{Math.min((page + 1) * 50, total)} من {total}</span>
          <button disabled={(page + 1) * 50 >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded-lg border border-gray-800 text-gray-300 disabled:opacity-40">التالي</button>
        </div>
      )}
    </div>
  );
}
