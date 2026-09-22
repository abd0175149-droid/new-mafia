'use client';

// ══════════════════════════════════════════════════════
// 🎁 تبويب العروض — نقاطٌ هديّة لمن يحادث الدون خلال ساعاتٍ محدَّدة
// المنحُ آليٌّ من خطّاف الرسائل الواردة؛ هذه الشاشة تُنشئ العرض وتراقبه فقط.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;

const n = (x: any) => Number(x || 0).toLocaleString('ar-JO');
const KINDS = [
  { key: 'RR', label: '🎖️ نقاط رانك', unit: 'نقطة رانك' },
  { key: 'XP', label: '⭐ نقاط خبرة', unit: 'نقطة خبرة' },
  { key: 'CHIPS', label: '🪙 تشبس', unit: 'تشبس' },
] as const;
type Kind = typeof KINDS[number]['key'];

const STATE_AR: Record<string, { label: string; cls: string }> = {
  awarded: { label: 'أخذوا نقاطهم', cls: 'text-emerald-300' },
  pending_link: { label: 'بانتظار فتح حساب', cls: 'text-amber-300' },
  pending_city: { label: 'بانتظار اختيار مدينة', cls: 'text-sky-300' },
  counting: { label: 'حادثوا ولم يكتمل شرطهم', cls: 'text-gray-300' },
  rejected: { label: 'مستبعَدون', cls: 'text-rose-300' },
  expired: { label: 'انتهت مهلتهم', cls: 'text-gray-500' },
};

const REJECT_AR: Record<string, string> = {
  STAFF: 'موظّف/أدمن', LOCKED: 'حساب موقوف', TEST_ACCOUNT: 'حساب اختباريّ',
  COOLDOWN: 'أخذ من عرضٍ قريب', OTHER_CITY: 'من مدينةٍ أخرى', NO_PLAYER: 'حساب محذوف',
  ALREADY_AWARDED: 'أخذها من رقمٍ آخر', OTHER_CLAIM: 'له مطالبة أخرى', REVOKED: 'سُحبت يدويّاً',
};

const STATUS_AR: Record<string, { label: string; cls: string }> = {
  running: { label: '🟢 يعمل', cls: 'text-emerald-400' },
  scheduled: { label: '🕒 مجدول', cls: 'text-sky-400' },
  paused: { label: '⏸️ موقوف', cls: 'text-amber-400' },
  ended: { label: '✅ انتهى', cls: 'text-gray-400' },
  cancelled: { label: '✖️ ملغى', cls: 'text-gray-500' },
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

function Field({ label, hint, children }: { label: string; hint?: string; children: any }) {
  return (
    <div className="min-w-0">
      <label className="text-[11px] text-gray-400 font-bold block mb-1">{label}</label>
      {children}
      {hint && <div className="text-[10px] text-gray-600 mt-0.5 leading-snug">{hint}</div>}
    </div>
  );
}

const inputCls = 'w-full bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500';

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-start gap-2 text-right w-full">
      <span className={`mt-0.5 w-9 h-5 rounded-full shrink-0 transition-colors ${on ? 'bg-emerald-500/80' : 'bg-gray-700'} relative`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'right-0.5' : 'right-4'}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-gray-200">{label}</span>
        {hint && <span className="block text-[10px] text-gray-600 leading-snug">{hint}</span>}
      </span>
    </button>
  );
}

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
    if (!confirm(`تشغيل «${form.name || 'عرض'}» الآن؟ كلّ من يحادث البوت سيأخذ ${form.amount} ${KINDS.find(k => k.key === form.kind)!.unit}.`)) return;
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
    if (confirmText && !confirm(confirmText)) return;
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

  if (!data || !form) return <p className="text-sm text-gray-500 p-4">{err ? `⚠️ ${err}` : 'جاري التحميل…'}</p>;

  const live = data.live;
  const unit = KINDS.find(k => k.key === form.kind)!.unit;
  const maxAmount = (cfg || data.config).maxAmount[form.kind as Kind];

  const remainMs = live ? toDate(live.ends_at).getTime() - now : 0;
  const hh = Math.max(0, Math.floor(remainMs / 3600e3));
  const mm = Math.max(0, Math.floor((remainMs % 3600e3) / 60000));
  const ss = Math.max(0, Math.floor((remainMs % 60000) / 1000));

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-4" dir="rtl">
      {err && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">⚠️ {err}</p>}

      {/* ═══ العرض العامل الآن ═══ */}
      {live ? (
        <section className="rounded-2xl border border-emerald-600/40 bg-emerald-500/[0.06] p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-[11px] text-emerald-400 font-bold">🟢 يعمل الآن</div>
              <h3 className="text-lg font-bold text-white truncate">{live.name}</h3>
              <div className="text-[11px] text-gray-400">
                {n(live.amount)} {KINDS.find(k => k.key === live.kind)?.unit} لكلّ لاعب · من {fmtDT(live.starts_at)} إلى {fmtDT(live.ends_at)}
              </div>
            </div>
            <div className="text-left">
              <div className="text-[10px] text-gray-500 font-bold">المتبقّي</div>
              <div className="text-2xl font-black text-white tabular-nums" dir="ltr">
                {String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-emerald-600/20">
            <div><div className="text-[10px] text-gray-500">أخذوا نقاطهم</div><div className="text-xl font-black text-emerald-300 tabular-nums">{n(live.awarded_count)}</div></div>
            <div><div className="text-[10px] text-gray-500">بانتظار حساب</div><div className="text-xl font-black text-amber-300 tabular-nums">{n(live.pending_link)}</div></div>
            <div><div className="text-[10px] text-gray-500">بانتظار مدينة</div><div className="text-xl font-black text-sky-300 tabular-nums">{n(live.pending_city)}</div></div>
            <div>
              <div className="text-[10px] text-gray-500">النقاط المصروفة</div>
              <div className="text-xl font-black text-white tabular-nums">
                {n(live.awarded_points)}{Number(live.max_total_points) > 0 && <span className="text-[11px] font-normal text-gray-500"> / {n(live.max_total_points)}</span>}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-3 flex-wrap">
            <button disabled={busy} onClick={() => setStatus(live.id, 'paused')}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-amber-600/40 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50">⏸️ إيقاف مؤقّت</button>
            <button disabled={busy} onClick={() => setStatus(live.id, 'ended', 'إنهاء العرض الآن؟ ما مُنح يبقى، والمعلَّقات تُصرف حتّى نهاية مهلتها.')}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-rose-600/40 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">⏹️ إنهاء الآن</button>
            <button disabled={busy} onClick={() => openReport(live.id)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:text-white disabled:opacity-50">📊 التفاصيل</button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
          <h3 className="text-sm font-bold text-white">لا عرض يعمل الآن</h3>
          <p className="text-[11px] text-gray-500 mt-1">
            العرض يمنح نقاطاً <b className="text-gray-300">آليّاً</b> لكلّ لاعبٍ مربوطٍ بحساب يحادث البوت خلال ساعاته — مرّةً واحدة لكلّ لاعب.
            من لا حساب له تُحجز نقاطه وتُصرف فور تسجيله.
          </p>
        </section>
      )}

      {/* ═══ إنشاء عرض ═══ */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h3 className="text-sm font-bold text-white">عرضٌ جديد</h3>
          <button onClick={() => setShowCfg(s => !s)} className="text-[11px] text-gray-400 hover:text-white">⚙️ الإعدادات العامّة</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2">
            <Field label="اسم العرض" hint="يظهر للاعب في الإشعار وفي رسالة البوت">
              <input className={inputCls} value={form.name} onChange={e => patch('name', e.target.value)} placeholder="مثال: ساعة الدون" />
            </Field>
          </div>
          <Field label="نوع المكافأة">
            <select className={inputCls} value={form.kind}
              onChange={e => { const k = e.target.value as Kind; setForm((f: any) => ({ ...f, kind: k, amount: (cfg || data.config).defaultAmount[k] })); setPreview(null); }}>
              {KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </Field>
          <Field label={`القيمة لكلّ لاعب (حتّى ${maxAmount})`} hint={form.kind === 'RR' ? 'نقاط الرانك تدخل الترتيب التنافسيّ — راجع نسبتها في المعاينة' : undefined}>
            <input type="number" min={1} max={maxAmount} className={inputCls} value={form.amount}
              onChange={e => { patch('amount', Math.min(maxAmount, Math.max(1, parseInt(e.target.value) || 1))); setPreview(null); }} />
          </Field>

          <Field label="المدّة (ساعات)">
            <input type="number" min={1} max={720} className={inputCls} value={form.hours}
              onChange={e => { patch('hours', Math.max(1, parseInt(e.target.value) || 1)); setPreview(null); }} />
          </Field>
          <Field label="رسائل لازمة للاستحقاق" hint="١ = أيّ رسالة تكفي">
            <input type="number" min={1} max={10} className={inputCls} value={form.minMessages} onChange={e => patch('minMessages', parseInt(e.target.value) || 1)} />
          </Field>
          <Field label="سقف عدد المستفيدين" hint="٠ = بلا سقف">
            <input type="number" min={0} className={inputCls} value={form.maxPlayers} onChange={e => patch('maxPlayers', parseInt(e.target.value) || 0)} />
          </Field>
          <Field label="سقف مجموع النقاط" hint="٠ = بلا سقف">
            <input type="number" min={0} className={inputCls} value={form.maxTotalPoints} onChange={e => patch('maxTotalPoints', parseInt(e.target.value) || 0)} />
          </Field>

          <Field label="مهلة صرف المعلَّق (ساعات)" hint="من فتح حسابه خلالها يأخذ نقاطه المحجوزة">
            <input type="number" min={0} max={168} className={inputCls} value={form.graceHours} onChange={e => patch('graceHours', parseInt(e.target.value) || 0)} />
          </Field>
          <Field label="تهدئة بين العروض (أيّام)" hint="لا يأخذ اللاعب من عرضين خلال هذه المدّة">
            <input type="number" min={0} max={365} className={inputCls} value={form.cooldownDays} onChange={e => patch('cooldownDays', parseInt(e.target.value) || 0)} />
          </Field>
          {form.kind !== 'CHIPS' && (data.cities?.length || 0) > 0 ? (
            <Field label="قصر العرض على مدينة" hint="من مدينته الأساسيّة غيرها لا يستحقّ">
              <select className={inputCls} value={form.onlyCityId ?? ''} onChange={e => patch('onlyCityId', e.target.value ? parseInt(e.target.value) : null)}>
                <option value="">كلّ المدن</option>
                {(data.cities || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          ) : <div />}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-800">
          <Toggle on={!!form.excludeStaff} onChange={v => patch('excludeStaff', v)} label="استثناء الموظّفين والأدمن" hint="أرقامهم لا تأخذ نقاطاً" />
          <Toggle on={!!form.skipActivityHours} onChange={v => patch('skipActivityHours', v)} label="استثناء ساعات الفعاليّات" hint={`لا منح قرب موعد أيّ فعاليّة (±${(cfg || data.config).activityHoursWindow} ساعة)`} />
          <Toggle on={!!form.promoteInBot} onChange={v => patch('promoteInBot', v)} label="البوت يروّج للعرض" hint="يذكره لمن يحادثه لأيّ سبب" />
          <Toggle on={form.announce?.push !== false} onChange={v => patch('announce', { ...form.announce, push: v })} label="إشعار لكلّ اللاعبين" hint="بلا إعلانٍ لن يعرف أحد" />
        </div>

        {/* ── المعاينة ── */}
        {preview && (
          <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
            {preview.impact && <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">📊 {preview.impact}</p>}
            {preview.blockers?.map((b: string, i: number) => (
              <p key={i} className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{b}</p>
            ))}
            {preview.warnings?.map((w: string, i: number) => (
              <p key={i} className="text-xs text-amber-300 bg-amber-500/[0.07] border border-amber-500/20 rounded-lg px-3 py-2">{w}</p>
            ))}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-gray-400">
              <span>الموسم: <b className="text-gray-200">{preview.seasonName || (form.kind === 'CHIPS' ? 'لا يلزم' : '—')}</b></span>
              <span>المدّة: <b className="text-gray-200">{n(preview.hours)} ساعة</b></span>
              <span>محادثات آخر ٣٠ يوماً: <b className="text-gray-200">{n(preview.reach?.conversations30d)}</b> (منها {n(preview.reach?.linked30d)} مربوطة بحساب)</span>
              <span>كلفة النماذج التقديريّة: <b className="text-gray-200" dir="ltr">${preview.estimatedAiCostUsd}</b></span>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <button disabled={busy} onClick={doPreview}
            className="text-xs font-bold px-4 py-2 rounded-lg border border-gray-700 text-gray-200 hover:text-white disabled:opacity-50">👁️ معاينة</button>
          <button disabled={busy || !preview?.ok || !!live} onClick={doCreate}
            className="text-xs font-bold px-4 py-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 disabled:opacity-40"
            title={live ? 'هناك عرضٌ يعمل — أنهِه أوّلاً' : !preview ? 'عايِن أوّلاً' : ''}>
            🚀 تشغيل الآن
          </button>
        </div>
      </section>

      {/* ═══ الإعدادات العامّة ═══ */}
      {showCfg && cfg && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
          <h3 className="text-sm font-bold text-white mb-1">⚙️ الإعدادات العامّة</h3>
          <p className="text-[11px] text-gray-500 mb-3">القيم الافتراضيّة تُقترح في كلّ عرضٍ جديد، والحدّ الأقصى سقفٌ صلب لا تتجاوزه الشاشة.</p>
          <Toggle on={!!cfg.enabled} onChange={v => setCfg({ ...cfg, enabled: v })} label="الميزة مفعّلة" hint="إطفاؤها يوقف المنح فوراً في كلّ العروض" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            {KINDS.map(k => (
              <div key={k.key} className="bg-gray-950 border border-gray-800 rounded-xl p-3">
                <div className="text-[11px] text-gray-300 font-bold mb-2">{k.label}</div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="الافتراضيّ">
                    <input type="number" min={1} className={inputCls} value={cfg.defaultAmount[k.key]}
                      onChange={e => setCfg({ ...cfg, defaultAmount: { ...cfg.defaultAmount, [k.key]: parseInt(e.target.value) || 1 } })} />
                  </Field>
                  <Field label="الأقصى">
                    <input type="number" min={1} className={inputCls} value={cfg.maxAmount[k.key]}
                      onChange={e => setCfg({ ...cfg, maxAmount: { ...cfg.maxAmount, [k.key]: parseInt(e.target.value) || 1 } })} />
                  </Field>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <Field label="رسائل لازمة (افتراضيّ)"><input type="number" min={1} max={10} className={inputCls} value={cfg.defaultMinMessages} onChange={e => setCfg({ ...cfg, defaultMinMessages: parseInt(e.target.value) || 1 })} /></Field>
            <Field label="مهلة المعلَّق (ساعات)"><input type="number" min={0} max={168} className={inputCls} value={cfg.defaultGraceHours} onChange={e => setCfg({ ...cfg, defaultGraceHours: parseInt(e.target.value) || 0 })} /></Field>
            <Field label="تهدئة (أيّام)"><input type="number" min={0} max={365} className={inputCls} value={cfg.defaultCooldownDays} onChange={e => setCfg({ ...cfg, defaultCooldownDays: parseInt(e.target.value) || 0 })} /></Field>
            <Field label="نافذة ساعات الفعاليّة (±ساعة)" hint="تُستعمل عند تفعيل استثناء ساعات الفعاليّات"><input type="number" min={0} max={12} className={inputCls} value={cfg.activityHoursWindow} onChange={e => setCfg({ ...cfg, activityHoursWindow: parseInt(e.target.value) || 0 })} /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <Toggle on={!!cfg.defaultExcludeStaff} onChange={v => setCfg({ ...cfg, defaultExcludeStaff: v })} label="استثناء الموظّفين (افتراضيّ)" />
            <Toggle on={!!cfg.defaultSkipActivityHours} onChange={v => setCfg({ ...cfg, defaultSkipActivityHours: v })} label="استثناء ساعات الفعاليّات (افتراضيّ)" />
            <Toggle on={!!cfg.defaultPromoteInBot} onChange={v => setCfg({ ...cfg, defaultPromoteInBot: v })} label="البوت يروّج للعرض (افتراضيّ)" />
          </div>
          <button disabled={busy} onClick={saveCfg} className="mt-3 text-xs font-bold px-4 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50">💾 حفظ الإعدادات</button>
        </section>
      )}

      {/* ═══ السجلّ ═══ */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
        <h3 className="text-sm font-bold text-white mb-2">سجلّ العروض</h3>
        {data.events.length === 0 ? <p className="text-xs text-gray-500">لا عروض بعد.</p> : (
          <div className="divide-y divide-gray-800">
            {data.events.map((e: any) => (
              <div key={e.id} className="py-2 flex items-center gap-3 flex-wrap">
                <span className={`text-[11px] font-bold ${STATUS_AR[e.status]?.cls || 'text-gray-400'}`}>{STATUS_AR[e.status]?.label || e.status}</span>
                <span className="text-sm text-gray-200 font-bold truncate max-w-[200px]">{e.name}</span>
                <span className="text-[11px] text-gray-500">{n(e.amount)} {KINDS.find(k => k.key === e.kind)?.unit}</span>
                <span className="text-[11px] text-gray-500">{fmtDT(e.starts_at)} ← {fmtDT(e.ends_at)}</span>
                <span className="text-[11px] text-emerald-300">{n(e.awarded_count)} مستفيد · {n(e.awarded_points)} نقطة</span>
                {Number(e.pending_link) > 0 && <span className="text-[11px] text-amber-300">{n(e.pending_link)} بانتظار حساب</span>}
                <span className="mr-auto flex gap-2">
                  {e.status === 'paused' && (
                    <button disabled={busy || !!live} onClick={() => setStatus(e.id, 'running')} className="text-[11px] font-bold text-emerald-300 hover:text-emerald-200 disabled:opacity-40">▶️ استئناف</button>
                  )}
                  {(e.status === 'scheduled' || e.status === 'paused') && (
                    <button disabled={busy} onClick={() => setStatus(e.id, 'cancelled', 'إلغاء هذا العرض؟')} className="text-[11px] font-bold text-rose-300 hover:text-rose-200 disabled:opacity-50">✖️ إلغاء</button>
                  )}
                  <button disabled={busy} onClick={() => openReport(e.id)} className="text-[11px] font-bold text-gray-400 hover:text-white disabled:opacity-50">📊 التقرير</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ═══ التقرير ═══ */}
      {report && (
        <section className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-bold text-white">📊 تقرير «{report.event.name}»</h3>
            <button onClick={() => setReport(null)} className="text-xs text-gray-500 hover:text-white">إغلاق ✕</button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(STATE_AR).map(([k, v]) => (
              <div key={k}>
                <div className="text-[10px] text-gray-500">{v.label}</div>
                <div className={`text-xl font-black tabular-nums ${v.cls}`}>{n(report.byState?.[k]?.n || 0)}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-800">
            <div>
              <div className="text-[10px] text-gray-500">حسابات فُتحت خلال العرض</div>
              <div className="text-xl font-black text-white tabular-nums">{n(report.newAccounts?.length || 0)}</div>
              <div className="text-[10px] text-gray-600">راجعها إن شككت بتعدّد الحسابات</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500">حجزوا خلال ٤٨ ساعة</div>
              <div className="text-xl font-black text-emerald-300 tabular-nums">{n(report.bookedWithin48h)}</div>
              <div className="text-[10px] text-gray-600">الأثر الحقيقيّ للعرض</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500">ردود البوت في النافذة</div>
              <div className="text-xl font-black text-white tabular-nums">{n(report.aiUsage?.replies)}</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500">النقاط المصروفة</div>
              <div className="text-xl font-black text-white tabular-nums">{n(report.event.awarded_points)}</div>
            </div>
          </div>

          {report.rejects?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <div className="text-[11px] text-gray-400 font-bold mb-1">أسباب الاستبعاد</div>
              <div className="flex flex-wrap gap-2">
                {report.rejects.map((r: any) => (
                  <span key={r.code} className="text-[11px] bg-gray-800/60 rounded-lg px-2 py-1 text-gray-300">
                    {REJECT_AR[r.code] || r.code}: <b className="text-white">{n(r.n)}</b>
                  </span>
                ))}
              </div>
            </div>
          )}

          {report.awarded?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <div className="text-[11px] text-gray-400 font-bold mb-1">آخر المستفيدين</div>
              <div className="max-h-64 overflow-y-auto divide-y divide-gray-800/60">
                {report.awarded.map((a: any) => (
                  <div key={a.player_id} className="py-1.5 flex items-center gap-3 text-[11px]">
                    <span className="text-gray-200 font-bold truncate max-w-[160px]">{a.name || a.phone}</span>
                    <span className="text-gray-600" dir="ltr">{a.phone}</span>
                    <span className="text-emerald-300">+{n(a.amount)}</span>
                    <span className="text-gray-600 mr-auto">{fmtDT(a.awarded_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
