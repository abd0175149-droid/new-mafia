'use client';

// ══════════════════════════════════════════════════════
// 🎁 تبويب العروض — نقاطٌ هديّة لمن يحادث الدون خلال ساعاتٍ محدَّدة
// المنحُ آليٌّ من خطّاف الرسائل الواردة؛ هذه الشاشة تُنشئ العرض وتراقبه فقط.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, BarChart3, Eye, Pause, Play, Rocket, Save, Settings, Square, X } from 'lucide-react';
import { swalConfirm } from '@/lib/swal';
import { Badge, Banner, Card, Field, HBar, PageHead, Seg, Setting, Tile, Toggle, type Tone } from './wa-ui';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;

const n = (x: any) => Number(x || 0).toLocaleString('ar-JO');
const KINDS = [
  { key: 'RR', label: 'نقاط رانك', unit: 'نقطة رانك' },
  { key: 'XP', label: 'نقاط خبرة', unit: 'نقطة خبرة' },
  { key: 'CHIPS', label: 'تشبس', unit: 'تشبس' },
] as const;
type Kind = typeof KINDS[number]['key'];

/** tone = لون شريط التقرير: ok أخضر (الافتراضيّ)، mute رماديّ باهت */
const STATE_AR: Record<string, { label: string; tone: 'ok' | 'warn' | 'info' | 'gold' | 'danger' | 'mute' }> = {
  awarded: { label: 'أخذوا نقاطهم', tone: 'ok' },
  pending_link: { label: 'بانتظار فتح حساب', tone: 'warn' },
  pending_city: { label: 'بانتظار اختيار مدينة', tone: 'info' },
  counting: { label: 'حادثوا ولم يكتمل شرطهم', tone: 'gold' },
  rejected: { label: 'مستبعَدون', tone: 'danger' },
  expired: { label: 'انتهت مهلتهم', tone: 'mute' },
};

const REJECT_AR: Record<string, string> = {
  STAFF: 'موظّف/أدمن', LOCKED: 'حساب موقوف', TEST_ACCOUNT: 'حساب اختباريّ',
  COOLDOWN: 'أخذ من عرضٍ قريب', OTHER_CITY: 'من مدينةٍ أخرى', NO_PLAYER: 'حساب محذوف',
  ALREADY_AWARDED: 'أخذها من رقمٍ آخر', OTHER_CLAIM: 'له مطالبة أخرى', REVOKED: 'سُحبت يدويّاً',
};

const STATUS_AR: Record<string, { label: string; tone?: Tone }> = {
  running: { label: 'يعمل', tone: 'ok' },
  scheduled: { label: 'مجدول', tone: 'info' },
  paused: { label: 'موقوف', tone: 'warn' },
  ended: { label: 'انتهى' },
  cancelled: { label: 'ملغى', tone: 'danger' },
};

// 🕒 طابعٌ بلا منطقة («2026-09-22 15:26:08») يقرؤه المتصفّح **محلّيّاً** فيخسر ٣ ساعات
//    في عمّان. الخادم يرسلها الآن بلاحقة Z، وهذا حارسٌ ثانٍ لا يزيد شيئاً إن كانت سليمة.
function toDate(v: any): Date {
  if (typeof v === 'string' && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(v)) return new Date(v.replace(' ', 'T') + 'Z');
  return new Date(v);
}

function fmtDT(v: any) {
  if (!v) return '—';
  return toDate(v).toLocaleString('ar-JO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' });
}

/** رقم/مبلغ بالأرقام — يُعزل اتّجاهه */
const L = (x: ReactNode) => <span className="ltr">{x}</span>;
const sub14 = { margin: 0, font: '400 14px/22px var(--font-sans)', color: 'var(--ink-2)' } as const;

// ══════════════════════════════════════════════════════

export default function RewardsTab({ apiFetch }: { apiFetch: Fetcher }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [report, setReport] = useState<any>(null);
  const [showCfg, setShowCfg] = useState(false);
  const [cfg, setCfg] = useState<any>(null);

  // نموذج الإنشاء
  const [form, setForm] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch('/api/whatsapp/rewards/events');
      setData(d);
      setCfg((c: any) => c ?? d.config);
      setForm((f: any) => f ?? {
        name: '', kind: 'RR' as Kind, amount: d.config.defaultAmount.RR, hours: 3,
        minMessages: d.config.defaultMinMessages, maxPlayers: d.config.defaultMaxPlayers,
        maxTotalPoints: d.config.defaultMaxTotalPoints, graceHours: d.config.defaultGraceHours,
        cooldownDays: d.config.defaultCooldownDays, excludeStaff: d.config.defaultExcludeStaff,
        skipActivityHours: d.config.defaultSkipActivityHours, promoteInBot: d.config.defaultPromoteInBot,
        onlyCityId: null as number | null, announce: { push: true },
      });
      setErr(null);
    } catch (e: any) { setErr(e.message); }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);
  // تحديثٌ دوريّ للوحة الحيّة + عدّادٌ تنازليّ كلّ ثانية
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const p = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 20000);
    return () => { clearInterval(t); clearInterval(p); };
  }, [load]);

  const patch = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const doPreview = async () => {
    setBusy(true);
    try { const r = await apiFetch('/api/whatsapp/rewards/preview', { method: 'POST', body: JSON.stringify(form) }); setPreview(r.preview); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const doCreate = async () => {
    if (!(await swalConfirm(`تشغيل «${form.name || 'عرض'}» الآن؟ كلّ من يحادث البوت سيأخذ ${form.amount} ${KINDS.find(k => k.key === form.kind)!.unit}.`, { icon: 'question' }))) return;
    setBusy(true);
    try {
      const r = await apiFetch('/api/whatsapp/rewards/events', { method: 'POST', body: JSON.stringify(form) });
      if (r.error) { setErr(r.error); return; }
      setPreview(null); setForm((f: any) => ({ ...f, name: '' }));
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const setStatus = async (id: number, status: string, confirmText?: string) => {
    if (confirmText && !(await swalConfirm(confirmText, { danger: true }))) return;
    setBusy(true);
    try { await apiFetch(`/api/whatsapp/rewards/events/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }); await load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const openReport = async (id: number) => {
    setBusy(true);
    try { setReport(await apiFetch(`/api/whatsapp/rewards/events/${id}`)); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const saveCfg = async () => {
    setBusy(true);
    try { const r = await apiFetch('/api/whatsapp/rewards/config', { method: 'PUT', body: JSON.stringify(cfg) }); setCfg(r.config); await load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (!data || !form) {
    return err
      ? <Banner tone="danger" icon={<AlertTriangle />}>{err}</Banner>
      : <p className="muted" style={{ margin: 0, fontSize: 14 }}>جاري التحميل…</p>;
  }

  const live = data.live;
  const maxAmount = (cfg || data.config).maxAmount[form.kind as Kind];

  const remainMs = live ? toDate(live.ends_at).getTime() - now : 0;
  const hh = Math.max(0, Math.floor(remainMs / 3600e3));
  const mm = Math.max(0, Math.floor((remainMs % 3600e3) / 60000));
  const ss = Math.max(0, Math.floor((remainMs % 60000) / 1000));

  const cfgBtn = (
    <button type="button" className="wa-btn ghost" aria-expanded={showCfg} onClick={() => setShowCfg(s => !s)}><Settings />الإعدادات العامّة</button>
  );
  const num = (v: any, set: (x: number) => void, fallback: number, extra?: { min?: number; max?: number; id?: string; label?: string }) => (
    <input type="number" dir="ltr" className="wa-input ltr" id={extra?.id} aria-label={extra?.label} min={extra?.min} max={extra?.max} value={v}
      onChange={e => set(parseInt(e.target.value) || fallback)} />
  );

  // ═══ التقرير: عرضٌ مستقلّ ═══
  const reportTotal = report ? Object.keys(STATE_AR).reduce((s, k) => s + Number(report.byState?.[k]?.n || 0), 0) : 0;
  const reportView = report && (
    <>
      <div className="wa-pagehead">
        <button type="button" className="wa-iconbtn" aria-label="إغلاق التقرير والرجوع" onClick={() => setReport(null)}><ArrowRight className="l" /></button>
        <div className="grow">
          <h2>تقرير «{report.event.name}»</h2>
          <p>
            <b className="wa-only-phone" style={{ color: 'var(--ink)' }}>«{report.event.name}» · </b>
            {L(n(report.event.amount))} {KINDS.find(k => k.key === report.event.kind)?.unit} لكلّ لاعب · {fmtDT(report.event.starts_at)} ← {fmtDT(report.event.ends_at)}
            {' · '}<Badge tone={STATUS_AR[report.event.status]?.tone}>{STATUS_AR[report.event.status]?.label || report.event.status}</Badge>
          </p>
        </div>
        <div className="acts">{cfgBtn}</div>
      </div>

      <div className={report.awarded?.length > 0 ? 'wa-grid2' : undefined}>
        <div className="stack" style={{ gap: 'var(--space-5)' }}>
          <Card title="أين انتهى كلّ من حادث الدون">
            {Object.entries(STATE_AR).map(([k, v]) => {
              const c = Number(report.byState?.[k]?.n || 0);
              const pct = reportTotal ? (c / reportTotal) * 100 : 0;
              return v.tone === 'mute' ? (
                <div key={k} className="wa-hbar">
                  <span>{v.label}</span>
                  <div className="wa-meter" style={{ opacity: 0.5 }}><i style={{ width: `${pct}%`, background: 'var(--ink-3)' }} /></div>
                  <b>{n(c)}</b>
                </div>
              ) : (
                <HBar key={k} label={v.label} pct={pct} value={n(c)} tone={v.tone === 'ok' ? undefined : v.tone} />
              );
            })}
            {report.rejects?.length > 0 && (
              <div className="row" style={{ flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
                <span className="muted" style={{ font: '700 12px/16px var(--font-sans)' }}>أسباب الاستبعاد</span>
                {report.rejects.map((r: any) => (
                  <Badge key={r.code}>{REJECT_AR[r.code] || r.code}: {L(n(r.n))}</Badge>
                ))}
              </div>
            )}
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Tile tone="ok" k="حجزوا خلال ٤٨ ساعة" v={n(report.bookedWithin48h)} h="الأثر الحقيقيّ للعرض" />
            <Tile k="حسابات فُتحت خلال العرض" v={n(report.newAccounts?.length || 0)} h="راجعها إن شككت بتعدّد الحسابات" />
            <Tile k="ردود البوت في النافذة" v={n(report.aiUsage?.replies)} />
            <Tile tone="gold" k="النقاط المصروفة" v={n(report.event.awarded_points)} />
          </div>
        </div>

        {report.awarded?.length > 0 && (
          <Card title="آخر المستفيدين" aside={L(n(report.awarded.length))}>
            <div className="wa-tablewrap" style={{ maxHeight: 480, overflowY: 'auto' }}>
              <table className="wa-table cards">
                <thead><tr><th>اللاعب</th><th>الرقم</th><th>النقاط</th><th>متى</th></tr></thead>
                <tbody>
                  {report.awarded.map((a: any) => (
                    <tr key={a.player_id}>
                      <td data-l="اللاعب"><b>{a.name || a.phone}</b></td>
                      <td data-l="الرقم"><span className="ltr">{a.phone}</span></td>
                      <td data-l="النقاط"><span className="ltr" style={{ color: 'var(--ok)' }}>+{n(a.amount)}</span></td>
                      <td data-l="متى"><span className="muted" style={{ fontSize: 13 }}>{fmtDT(a.awarded_at)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );

  // ═══ الشاشة الرئيسة ═══
  const mainView = !report && (
    <>
      <PageHead title="نقاط الحديث" sub="نقاط لمن يحادث الدون خلال نافذة محدودة.">{cfgBtn}</PageHead>

      {/* ═══ العرض العامل الآن ═══ */}
      {live ? (
        <Card style={{ borderColor: 'var(--ok)', background: 'var(--ok-soft)' }}>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-5 items-center">
            <div className="min-w-0">
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <Badge tone="ok"><i className="wa-dot ok" />يعمل الآن</Badge>
                <b className="trunc" style={{ font: '700 16px/24px var(--font-sans)' }}>{live.name}</b>
              </div>
              <div style={{ ...sub14, marginTop: 4 }}>
                {L(n(live.amount))} {KINDS.find(k => k.key === live.kind)?.unit} لكلّ لاعب · من {fmtDT(live.starts_at)} إلى {fmtDT(live.ends_at)}
              </div>
              <div className="wa-grid4 keep2" style={{ marginTop: 'var(--space-3)' }}>
                <Tile tone="ok" k="أخذوا نقاطهم" v={n(live.awarded_count)} />
                <Tile k="بانتظار حساب" v={n(live.pending_link)} />
                <Tile k="بانتظار مدينة" v={n(live.pending_city)} />
                <Tile tone="gold" k="النقاط المصروفة" v={n(live.awarded_points)}
                  h={Number(live.max_total_points) > 0 ? <>/ {L(n(live.max_total_points))}</> : undefined} />
              </div>
            </div>
            <div className="stack" style={{ alignItems: 'center' }}>
              <div className="muted" style={{ font: '700 12px/16px var(--font-sans)' }}>المتبقّي</div>
              <div className="wa-code" style={{ color: 'var(--ok)', letterSpacing: 2 }} role="timer">
                {String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
              </div>
              <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                <button type="button" disabled={busy} onClick={() => setStatus(live.id, 'paused')} className="wa-btn"><Pause />إيقاف مؤقّت</button>
                <button type="button" disabled={busy} onClick={() => setStatus(live.id, 'ended', 'إنهاء العرض الآن؟ ما مُنح يبقى، والمعلَّقات تُصرف حتّى نهاية مهلتها.')} className="wa-btn danger"><Square />إنهاء الآن</button>
                <button type="button" disabled={busy} onClick={() => openReport(live.id)} className="wa-btn"><BarChart3 />التفاصيل</button>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card title="لا عرض يعمل الآن">
          <p style={sub14}>
            العرض يمنح نقاطاً <b style={{ color: 'var(--ink)' }}>آليّاً</b> لكلّ لاعبٍ مربوطٍ بحساب يحادث البوت خلال ساعاته — مرّةً واحدة لكلّ لاعب.
            من لا حساب له تُحجز نقاطه وتُصرف فور تسجيله.
          </p>
        </Card>
      )}

      <div className="wa-grid2">
        {/* ═══ إنشاء عرض ═══ */}
        <Card title="عرضٌ جديد">
          <div className="stack">
            <Field label="اسم العرض" hint="يظهر للاعب في الإشعار وفي رسالة البوت" htmlFor="rw-name">
              <input id="rw-name" className="wa-input" value={form.name} onChange={e => patch('name', e.target.value)} placeholder="مثال: ساعة الدون" />
            </Field>
            <Field label="نوع المكافأة">
              <Seg<Kind> block label="نوع المكافأة" value={form.kind} options={KINDS.map(k => [k.key, k.label] as const)}
                onChange={k => { setForm((f: any) => ({ ...f, kind: k, amount: (cfg || data.config).defaultAmount[k] })); setPreview(null); }} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={<>القيمة لكلّ لاعب (حتّى {L(maxAmount)})</>} htmlFor="rw-amount"
                hint={form.kind === 'RR' ? 'نقاط الرانك تدخل الترتيب التنافسيّ — راجع نسبتها في المعاينة' : undefined}>
                <input id="rw-amount" type="number" min={1} max={maxAmount} dir="ltr" className="wa-input ltr" value={form.amount}
                  onChange={e => { patch('amount', Math.min(maxAmount, Math.max(1, parseInt(e.target.value) || 1))); setPreview(null); }} />
              </Field>
              <Field label="المدّة (ساعات)" htmlFor="rw-hours">
                <input id="rw-hours" type="number" min={1} max={720} dir="ltr" className="wa-input ltr" value={form.hours}
                  onChange={e => { patch('hours', Math.max(1, parseInt(e.target.value) || 1)); setPreview(null); }} />
              </Field>
              <Field label="رسائل لازمة للاستحقاق" hint="١ = أيّ رسالة تكفي" htmlFor="rw-min">
                {num(form.minMessages, v => patch('minMessages', v), 1, { min: 1, max: 10, id: 'rw-min' })}
              </Field>
              <Field label="سقف عدد المستفيدين" hint="٠ = بلا سقف" htmlFor="rw-maxp">
                {num(form.maxPlayers, v => patch('maxPlayers', v), 0, { min: 0, id: 'rw-maxp' })}
              </Field>
              <Field label="سقف مجموع النقاط" hint="٠ = بلا سقف" htmlFor="rw-maxt">
                {num(form.maxTotalPoints, v => patch('maxTotalPoints', v), 0, { min: 0, id: 'rw-maxt' })}
              </Field>
              <Field label="مهلة صرف المعلَّق (ساعات)" hint="من فتح حسابه خلالها يأخذ نقاطه المحجوزة" htmlFor="rw-grace">
                {num(form.graceHours, v => patch('graceHours', v), 0, { min: 0, max: 168, id: 'rw-grace' })}
              </Field>
              <Field label="تهدئة بين العروض (أيّام)" hint="لا يأخذ اللاعب من عرضين خلال هذه المدّة" htmlFor="rw-cool">
                {num(form.cooldownDays, v => patch('cooldownDays', v), 0, { min: 0, max: 365, id: 'rw-cool' })}
              </Field>
              {form.kind !== 'CHIPS' && (data.cities?.length || 0) > 0 && (
                <Field label="قصر العرض على مدينة" hint="من مدينته الأساسيّة غيرها لا يستحقّ" htmlFor="rw-city">
                  <select id="rw-city" className="wa-select" value={form.onlyCityId ?? ''} onChange={e => patch('onlyCityId', e.target.value ? parseInt(e.target.value) : null)}>
                    <option value="">كلّ المدن</option>
                    {(data.cities || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              )}
            </div>

            <div>
              <Setting title="استثناء الموظّفين والأدمن" hint="أرقامهم لا تأخذ نقاطاً">
                <Toggle on={!!form.excludeStaff} onChange={v => patch('excludeStaff', v)} label="استثناء الموظّفين والأدمن" />
              </Setting>
              <Setting title="استثناء ساعات الفعاليّات" hint={<>لا منح قرب موعد أيّ فعاليّة ({L(`±${(cfg || data.config).activityHoursWindow}`)} ساعة)</>}>
                <Toggle on={!!form.skipActivityHours} onChange={v => patch('skipActivityHours', v)} label="استثناء ساعات الفعاليّات" />
              </Setting>
              <Setting title="البوت يروّج للعرض" hint="يذكره لمن يحادثه لأيّ سبب">
                <Toggle on={!!form.promoteInBot} onChange={v => patch('promoteInBot', v)} label="البوت يروّج للعرض" />
              </Setting>
              <Setting title="إشعار لكلّ اللاعبين" hint="بلا إعلانٍ لن يعرف أحد">
                <Toggle on={form.announce?.push !== false} onChange={v => patch('announce', { ...form.announce, push: v })} label="إشعار لكلّ اللاعبين" />
              </Setting>
            </div>

            {/* ── المعاينة ── */}
            {preview && (
              <div className="stack" style={{ gap: 'var(--space-2)' }}>
                {preview.impact && <Banner tone="info" icon={<BarChart3 />}>{preview.impact}</Banner>}
                {preview.blockers?.map((b: string, i: number) => (
                  <Banner key={`b${i}`} tone="danger" icon={<AlertTriangle />}>{b}</Banner>
                ))}
                {preview.warnings?.map((w: string, i: number) => (
                  <Banner key={`w${i}`} tone="warn" icon={<AlertTriangle />}>{w}</Banner>
                ))}
                <div className="muted" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 24px', font: '500 13px/20px var(--font-sans)' }}>
                  <span>الموسم: <b style={{ color: 'var(--ink)' }}>{preview.seasonName || (form.kind === 'CHIPS' ? 'لا يلزم' : '—')}</b></span>
                  <span>المدّة: <b style={{ color: 'var(--ink)' }}>{L(n(preview.hours))} ساعة</b></span>
                  <span>محادثات آخر ٣٠ يوماً: <b style={{ color: 'var(--ink)' }}>{L(n(preview.reach?.conversations30d))}</b> (منها {L(n(preview.reach?.linked30d))} مربوطة بحساب)</span>
                  <span>كلفة النماذج التقديريّة: <b className="ltr" style={{ color: 'var(--ink)' }}>${preview.estimatedAiCostUsd}</b></span>
                </div>
              </div>
            )}

            <div className="row">
              <button type="button" disabled={busy} onClick={doPreview} className="wa-btn" style={{ flex: 1 }}><Eye />معاينة</button>
              <button type="button" disabled={busy || !preview?.ok || !!live} onClick={doCreate} className="wa-btn send" style={{ flex: 1 }}
                title={live ? 'هناك عرضٌ يعمل — أنهِه أوّلاً' : !preview ? 'عايِن أوّلاً' : ''}>
                <Rocket />تشغيل الآن
              </button>
            </div>
          </div>
        </Card>

        {/* ═══ السجلّ ═══ */}
        <Card title="سجلّ العروض">
          {data.events.length === 0 ? <p className="muted" style={{ margin: 0, fontSize: 14 }}>لا عروض بعد.</p> : (
            <div className="wa-tablewrap">
              <table className="wa-table cards">
                <thead><tr><th>العرض</th><th>الحالة</th><th>مستفيدون</th><th>النقاط</th><th></th></tr></thead>
                <tbody>
                  {data.events.map((e: any) => (
                    <tr key={e.id}>
                      <td data-l="العرض">
                        <span style={{ minWidth: 0 }}>
                          <b className="trunc" style={{ display: 'block', maxWidth: 220 }}>{e.name}</b>
                          <span className="muted" style={{ display: 'block', fontSize: 12, lineHeight: '18px' }}>
                            {L(n(e.amount))} {KINDS.find(k => k.key === e.kind)?.unit} · {fmtDT(e.starts_at)} ← {fmtDT(e.ends_at)}
                          </span>
                        </span>
                      </td>
                      <td data-l="الحالة">
                        <span className="row" style={{ flexWrap: 'wrap' }}>
                          <Badge tone={STATUS_AR[e.status]?.tone}>{STATUS_AR[e.status]?.label || e.status}</Badge>
                          {Number(e.pending_link) > 0 && <Badge tone="warn">{L(n(e.pending_link))} بانتظار حساب</Badge>}
                        </span>
                      </td>
                      <td data-l="مستفيدون"><span className="ltr">{n(e.awarded_count)}</span></td>
                      <td data-l="النقاط"><span className="ltr">{n(e.awarded_points)}</span></td>
                      <td>
                        <span className="row" style={{ gap: 0, justifyContent: 'flex-end' }}>
                          {e.status === 'paused' && (
                            <button type="button" className="wa-iconbtn" aria-label="استئناف" title="استئناف" style={{ color: 'var(--ok)' }}
                              disabled={busy || !!live} onClick={() => setStatus(e.id, 'running')}><Play /></button>
                          )}
                          {(e.status === 'scheduled' || e.status === 'paused') && (
                            <button type="button" className="wa-iconbtn" aria-label="إلغاء" title="إلغاء" style={{ color: 'var(--danger)' }}
                              disabled={busy} onClick={() => setStatus(e.id, 'cancelled', 'إلغاء هذا العرض؟')}><X /></button>
                          )}
                          <button type="button" className="wa-iconbtn" aria-label="التقرير" title="التقرير"
                            disabled={busy} onClick={() => openReport(e.id)}><BarChart3 /></button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );

  return (
    <>
      {err && <Banner tone="danger" icon={<AlertTriangle />}>{err}</Banner>}

      {reportView}
      {mainView}

      {/* ═══ الإعدادات العامّة ═══ */}
      {showCfg && cfg && (
        <Card title={<><Settings />الإعدادات العامّة</>}>
          <div className="stack">
            <p style={sub14}>القيم الافتراضيّة تُقترح في كلّ عرضٍ جديد، والحدّ الأقصى سقفٌ صلب لا تتجاوزه الشاشة.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              <div>
                <Setting title="الميزة مفعّلة" hint="إطفاؤها يوقف المنح فوراً في كلّ العروض">
                  <Toggle on={!!cfg.enabled} onChange={v => setCfg({ ...cfg, enabled: v })} label="الميزة مفعّلة" />
                </Setting>
                <Setting title="استثناء الموظّفين (افتراضيّ)">
                  <Toggle on={!!cfg.defaultExcludeStaff} onChange={v => setCfg({ ...cfg, defaultExcludeStaff: v })} label="استثناء الموظّفين (افتراضيّ)" />
                </Setting>
                <Setting title="استثناء ساعات الفعاليّات (افتراضيّ)">
                  <Toggle on={!!cfg.defaultSkipActivityHours} onChange={v => setCfg({ ...cfg, defaultSkipActivityHours: v })} label="استثناء ساعات الفعاليّات (افتراضيّ)" />
                </Setting>
                <Setting title="البوت يروّج للعرض (افتراضيّ)">
                  <Toggle on={!!cfg.defaultPromoteInBot} onChange={v => setCfg({ ...cfg, defaultPromoteInBot: v })} label="البوت يروّج للعرض (افتراضيّ)" />
                </Setting>
              </div>
              <div className="stack">
                {KINDS.map(k => (
                  <Field key={k.key} label={k.label} hint="الافتراضيّ · الأقصى">
                    <div className="row">
                      {num(cfg.defaultAmount[k.key], v => setCfg({ ...cfg, defaultAmount: { ...cfg.defaultAmount, [k.key]: v } }), 1, { min: 1, label: `${k.label} — الافتراضيّ` })}
                      <span className="muted" style={{ fontSize: 13 }}>حتّى</span>
                      {num(cfg.maxAmount[k.key], v => setCfg({ ...cfg, maxAmount: { ...cfg.maxAmount, [k.key]: v } }), 1, { min: 1, label: `${k.label} — الأقصى` })}
                    </div>
                  </Field>
                ))}
              </div>
            </div>
            <div className="wa-grid4 keep2">
              <Field label="رسائل لازمة (افتراضيّ)" htmlFor="rw-c-min">
                {num(cfg.defaultMinMessages, v => setCfg({ ...cfg, defaultMinMessages: v }), 1, { min: 1, max: 10, id: 'rw-c-min' })}
              </Field>
              <Field label="مهلة المعلَّق (ساعات)" htmlFor="rw-c-grace">
                {num(cfg.defaultGraceHours, v => setCfg({ ...cfg, defaultGraceHours: v }), 0, { min: 0, max: 168, id: 'rw-c-grace' })}
              </Field>
              <Field label="تهدئة (أيّام)" htmlFor="rw-c-cool">
                {num(cfg.defaultCooldownDays, v => setCfg({ ...cfg, defaultCooldownDays: v }), 0, { min: 0, max: 365, id: 'rw-c-cool' })}
              </Field>
              <Field label="نافذة ساعات الفعاليّة (±ساعة)" hint="تُستعمل عند تفعيل استثناء ساعات الفعاليّات" htmlFor="rw-c-win">
                {num(cfg.activityHoursWindow, v => setCfg({ ...cfg, activityHoursWindow: v }), 0, { min: 0, max: 12, id: 'rw-c-win' })}
              </Field>
            </div>
            <div className="row">
              <button type="button" disabled={busy} onClick={saveCfg} className="wa-btn primary"><Save />حفظ الإعدادات</button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
