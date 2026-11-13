'use client';

// شريط صحّة واتساب — حالة الرقمين في سطر واحد، يتمدّد إلى لوحة فيها السبب وروابط ميتا (أدمن فقط)
// السطر في رأس الصفحة واللوحة تحته، فالمكوّن خطّاف يعيد القطعتين.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Lock, TriangleAlert, Info, RefreshCw, BellRing, ExternalLink } from 'lucide-react';
import { swalConfirm, swalToast } from '@/lib/swal';
import { Banner } from './wa-ui';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;
type Lvl = 'ok' | 'warn' | 'danger' | 'off';
const LEVEL: Record<string, Lvl> = { ok: 'ok', degraded: 'warn', blocked: 'danger', unreachable: 'warn', unconfigured: 'off' };
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60e3); return m < 1 ? 'الآن' : `قبل ${m} د`; };

// رقم الأعمال (جلسة OpenWA) — يظهر حين تكون القناة مهيّأة. التفاصيل والربط في «الإدارة ← القنوات»
const WEB_STATUS_AR: Record<string, string> = { ready: 'يعمل', qr_ready: 'ينتظر الربط', disconnected: 'مفصول', created: 'غير مربوط', unreachable: 'البوّابة لا تستجيب', failed: 'فشل', initializing: 'يبدأ…', authenticating: 'يتحقّق…' };
const MODE_AR: Record<string, string> = { cloud_only: 'ميتا وحدها', dual: 'مزدوج', web_primary: 'الجلسة أوّلاً', web_final: 'الجلسة + ميتا للتحويل' };

export function useWaHealth(apiFetch: Fetcher, onOpenChannels: () => void): { strip: ReactNode; panel: ReactNode; webIssue: string | null; webReady: boolean } {
  const [h, setH] = useState<any>(null);
  const [c, setC] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (force = false) => {
    try { setH(await apiFetch(`/api/whatsapp/health${force ? '?force=1' : ''}`)); } catch { /* الشريط غير حاجب */ }
  }, [apiFetch]);
  useEffect(() => { load(); const t = setInterval(() => load(), 120e3); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    const loadC = () => apiFetch('/api/whatsapp/channels').then(setC).catch(() => {});
    loadC(); const t = setInterval(loadC, 60e3); return () => clearInterval(t);
  }, [apiFetch]);

  const web = c?.configured?.web ? (c.web || {}) : null;
  const webOk = web ? web.ready && !web.locked : true;
  const webIssue = web && !webOk ? `رقم الأعمال ${web.locked ? 'مقفل' : (WEB_STATUS_AR[web.status] || web.status)}` : null;
  const queued = c?.outbox ? c.outbox.queued.reply + c.outbox.queued.timely + c.outbox.queued.bulk : 0;

  const webReady = !!web && !!web.ready && !web.locked;
  if (!h && !web) return { strip: null, panel: null, webIssue, webReady };

  const metaLvl: Lvl = h ? (LEVEL[h.level] || 'off') : 'off';
  const locked = !!h?.sendingLocked;
  const lvl: Lvl = locked || metaLvl === 'danger' || web?.locked ? 'danger' : (metaLvl === 'warn' || !webOk) ? 'warn' : metaLvl === 'off' && !web ? 'off' : 'ok';
  const bad = lvl === 'danger' || lvl === 'warn';
  const shown = open || bad;

  const resume = async () => {
    if (!(await swalConfirm('رفع قفل الإرسال يدويّاً؟\nافعل ذلك فقط بعد التأكّد من صفحات ميتا أنّ المشكلة انتهت.', { confirmText: 'ارفع القفل', icon: 'warning' }))) return;
    try { await apiFetch('/api/whatsapp/sending-resume', { method: 'POST' }); swalToast('رُفع القفل', 'success'); load(true); } catch (e: any) { swalToast(e.message, 'error'); }
  };

  const strip = (
    <button type="button" className={`wa-health${lvl === 'danger' ? ' danger' : lvl === 'warn' ? ' warn' : ''}`} aria-expanded={shown} onClick={() => setOpen(o => !o)}>
      <i className={`wa-dot${lvl === 'off' ? '' : ` ${lvl}`}`} />
      <span className="trunc grow">
        <b>{locked ? 'الإرسال من رقم ميتا مقفل' : h ? h.summary : 'رقم ميتا: لا بيانات'}</b>
        {web && <span className="wa-only-desk"> · رقم الأعمال: {WEB_STATUS_AR[web.status] || web.status}{web.locked ? ' — مقفل' : ''}</span>}
      </span>
      <span className="end">{h?.checkedAt && <span className="wa-only-desk">{ago(h.checkedAt)}</span>}{shown && open ? <ChevronUp /> : <ChevronDown />}</span>
    </button>
  );

  const panel = shown ? (
    <div className={`wa-healthpanel${lvl === 'danger' ? ' danger' : lvl === 'warn' ? ' warn' : ''}`}>
      {locked && (
        <Banner tone="danger" icon={<Lock />} action="ارفع القفل يدويّاً" onAction={resume}><b>سبب القفل:</b> {h.sendingLocked}</Banner>
      )}
      {h?.issues?.map((x: string, i: number) => <Banner key={'i' + i} tone="warn" icon={<TriangleAlert />}>{x}</Banner>)}
      {webIssue && <Banner tone="warn" icon={<TriangleAlert />} action="افتح الأرقام" onAction={onOpenChannels}>{webIssue}.</Banner>}
      {open && h?.notes?.map((x: string, i: number) => <Banner key={'n' + i} icon={<Info />}>{x} <span className="muted">— معروف، لا يمنع العمل.</span></Banner>)}
      {open && (
        <div className="wa-grid3" style={{ gap: '0 var(--space-6)' }}>
          {h?.phone && <>
            <div className="wa-kv"><span>الرقم</span><b>{h.phone.status}</b></div>
            <div className="wa-kv"><span>الجودة</span><b>{h.phone.quality}</b></div>
            <div className="wa-kv"><span>السقف اليوميّ</span><b className="ltr">{String(h.phone.tier || '').replace('TIER_', '')}</b></div>
            <div className="wa-kv"><span>اسم العرض</span><b>{h.phone.nameStatus}</b></div>
          </>}
          {h?.waba && <>
            <div className="wa-kv"><span>مراجعة الحساب</span><b>{h.waba.review}</b></div>
            <div className="wa-kv"><span>توثيق النشاط</span><b>{h.waba.businessVerification}</b></div>
          </>}
          {web && <>
            <div className="wa-kv"><span>رقم الأعمال</span><b>{WEB_STATUS_AR[web.status] || web.status}</b></div>
            <div className="wa-kv"><span>وضع التشغيل</span><b>{MODE_AR[c.settings?.mode] || c.settings?.mode}</b></div>
            <div className="wa-kv"><span>في الطابور</span><b className="ltr">{queued}</b></div>
          </>}
        </div>
      )}
      {(h?.links || []).length > 0 && (
        <div className="wa-grid3">
          {h.links.map((l: any) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="wa-mlink">
              <b>{l.label}<ExternalLink className="s" /></b><span>{l.hint}</span>
            </a>
          ))}
        </div>
      )}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="wa-btn sm" disabled={busy} onClick={async () => { setBusy(true); await load(true); setBusy(false); }}><RefreshCw />{busy ? 'يفحص…' : 'افحص الآن'}</button>
        <button type="button" className="wa-btn sm ghost" onClick={async () => { try { const r = await apiFetch('/api/whatsapp/health/test-alert', { method: 'POST' }); swalToast(`أُرسل إشعار تجريبيّ إلى ${r.players} أدمن — افحص هاتفك`, 'info'); } catch (e: any) { swalToast(e.message, 'error'); } }}><BellRing />جرّب التنبيه</button>
        {web && <button type="button" className="wa-btn sm ghost" onClick={onOpenChannels}>الأرقام</button>}
        <span className="muted grow" style={{ font: '500 12px/16px var(--font-sans)' }}>يُفحص تلقائيّاً كلّ 10 دقائق، وأيّ تغيّر يصلك إشعاراً على التطبيق.</span>
      </div>
    </div>
  ) : null;

  return { strip, panel, webIssue, webReady };
}
