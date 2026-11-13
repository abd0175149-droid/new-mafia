'use client';

// ══════════════════════════════════════════════════════
// 🔀 القنوات — ميتا (Cloud API) ورقم الأعمال (جلسة OpenWA)
// ══════════════════════════════════════════════════════
// وضع التشغيل يُبدَّل هنا بلا نشر، والسقوف والبديل وسطر التحويل وربط رقم الأعمال واستيراد
// تاريخه وأقفال القناتين — كلّها من شاشةٍ واحدة. كلّ حفظٍ يُسجَّل في سجلّ عمليّات الموظّفين.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  AlertTriangle, Ban, Bot, Check, Cloud, DatabaseBackup, Flame, KeyRound, Loader2, QrCode, RefreshCw, Save, Smartphone, Snowflake, Undo2, X,
} from 'lucide-react';
import { swalConfirm, swalToast } from '@/lib/swal';
import { Badge, Banner, Card, Field, HBar, PageHead, Setting, Skel, Toggle, type Tone } from './wa-ui';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;

const MODE_INFO: Record<string, { title: string; desc: string }> = {
  cloud_only: { title: 'ميتا وحدها', desc: 'الوضع السابق تماماً. رسائل رقم الأعمال تُخزَّن وتُعرض بلا ردٍّ آليّ.' },
  dual: { title: 'مزدوج', desc: 'كلّ عميل يُخدم من الرقم الذي راسله. وما يبادر به النادي يصل عبر رقم الأعمال حين تكون نافذة ميتا مغلقة.' },
  web_primary: { title: 'الجلسة أوّلاً', desc: 'رقم الأعمال هو الأساس. ميتا تجيب من يراسلها وتعرّفه برقم الأعمال مرّة في اليوم.' },
  web_final: { title: 'الجلسة + ميتا للتحويل', desc: 'كلّ إرسال من رقم الأعمال. ميتا يردّ عليها البوت كاملاً ويوجّه، ولا جماعيّ منها.' },
};
const LANE_AR: Record<string, string> = { reply: 'الردود', timely: 'المقيّد بوقت', bulk: 'الجماعيّ' };
// الفلتر الكونيّ الافتراضيّ لكلّ صفحات النظام: مَن نرسل له ابتداءً
const LINE_DEFAULT: Record<string, { t: string; d: string }> = {
  all: { t: 'الكلّ', d: 'لا تقييد — قد يبدأ محادثةً باردة (يعتمد على سقف البارد والتسخين)' },
  warm: { t: 'مَن له خيطٌ معنا', d: 'راسَلنا، أو راسلناه نحن من قبل ولو لم يردّ — لا أوّل تواصل، لكنّه ليس بالضرورة من طرفين' },
  two_way: { t: 'مَن راسَلنا', d: 'الأأمن — مَن أرسل لنا رسالةً واحدة على الأقلّ في أيّ وقت (من التاريخ الكامل + المباشر)' },
};
const STATUS_AR: Record<string, string> = {
  ready: 'متّصل', qr_ready: 'ينتظر الربط', initializing: 'يبدأ…', authenticating: 'يتحقّق…', created: 'لم يبدأ',
  disconnected: 'مفصول', failed: 'فشل', action_required: 'يحتاج إجراءً', unreachable: 'البوّابة لا تستجيب', unknown: '—',
};
const ago = (iso?: string | null) => {
  if (!iso) return '—';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60e3);
  return m < 1 ? 'الآن' : m < 60 ? `قبل ${m} د` : `قبل ${Math.round(m / 60)} س`;
};

function QrImage({ value }: { value: string }) {
  const [Svg, setSvg] = useState<any>(null);
  useEffect(() => {
    if (value.startsWith('data:')) return;
    import('qrcode.react').then((m: any) => setSvg(() => m.QRCodeSVG || m.default)).catch(() => {});
  }, [value]);
  if (value.startsWith('data:')) return <img src={value} alt="رمز ربط واتساب" className="wa-qrimg" />;
  return Svg ? <div className="wa-qrimg"><Svg value={value} size={180} /></div> : <Skel h={200} w={200} />;
}

const SUB: CSSProperties = { font: '700 14px/20px var(--font-sans)', color: 'var(--ink-2)' };
const H3: CSSProperties = { font: '700 16px/24px var(--font-sans)', marginTop: 'var(--space-5)' };
const NOTE: CSSProperties = { font: '400 13px/20px var(--font-sans)', margin: 0 };
const SMALL: CSSProperties = { font: '500 12px/18px var(--font-sans)' };
const pc = (n: any, cap: any) => (Number(cap) > 0 ? (Number(n || 0) / Number(cap)) * 100 : 0);
const barTone = (p: number, base?: 'info') => (p >= 100 ? 'danger' : p >= 75 ? 'warn' : base);
const frac = (n: any, cap: any) => <span style={{ whiteSpace: 'nowrap' }}>{n}/{cap ?? '—'}</span>;

export default function ChannelsSection({ apiFetch }: { apiFetch: Fetcher }) {
  const [d, setD] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [pair, setPair] = useState<{ mode: 'qr' | 'code'; qr?: string; code?: string; busy?: boolean } | null>(null);
  const [pairPhone, setPairPhone] = useState('');
  const [importing, setImporting] = useState(false);
  const pollRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/whatsapp/channels');
      setD(r);
      setDraft((cur: any) => cur ?? structuredClone(r.settings));
      if (pair && r.web?.linked) { setPair(null); swalToast('✅ رُبط رقم الأعمال', 'success'); }
    } catch (e: any) { swalToast(e.message, 'error'); }
  }, [apiFetch, pair]);

  // المرآة جارية ⟵ تحديثٌ كلّ ٥ ثوانٍ كالربط
  const mirroring = !!d?.historyImport?.running;
  useEffect(() => { load(); const t = setInterval(load, pair || mirroring ? 5000 : 60000); pollRef.current = t; return () => clearInterval(t); }, [load, pair, mirroring]);

  if (!d || !draft) return (
    <div className="stack" role="status" aria-label="تحميل القنوات…">
      <Skel h={28} w={180} />
      <Skel h={150} />
      <Skel h={150} />
    </div>
  );
  const s = d.settings;
  const web = d.web || {};
  const dirty = JSON.stringify(draft) !== JSON.stringify(s);
  const set = (path: string, v: any) => setDraft((cur: any) => {
    const n = structuredClone(cur); const ks = path.split('.'); let o = n;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = v; return n;
  });

  const save = async (patch?: any) => {
    setSaving(true);
    try {
      const r = await apiFetch('/api/whatsapp/channels', { method: 'PUT', body: JSON.stringify(patch || draft) });
      setD(r); setDraft(structuredClone(r.settings));
      swalToast(r.knownBotChanged != null
        ? `حُفظت — ${r.settings.webBotKnown ? 'شُغّل' : 'أُطفئ'} الدون على ${r.knownBotChanged} محادثة لغير اللاعبين`
        : 'حُفظت إعدادات القنوات', 'success');
    } catch (e: any) { swalToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const switchMode = async (m: string) => {
    if (m === s.mode) return;
    if (m !== 'cloud_only' && !web.linked) {
      swalToast('اربط رقم الأعمال أوّلاً — لا يمكن الإرسال منه وهو غير مربوط', 'warning'); return;
    }
    if (!(await swalConfirm(`تبديل الوضع إلى «${MODE_INFO[m].title}»؟\n\n${MODE_INFO[m].desc}\n\nالتبديل فوريّ ويمكن الرجوع عنه بضغطة.`, { confirmText: 'بدّل الآن' }))) return;
    await save({ ...draft, mode: m });
  };

  const startPair = async (mode: 'qr' | 'code') => {
    if (mode === 'code' && !/^\d{11,13}$/.test(pairPhone.replace(/\D/g, ''))) { swalToast('اكتب رقم الأعمال بصيغة 9627XXXXXXXX', 'warning'); return; }
    setPair({ mode, busy: true });
    try {
      const r = await apiFetch('/api/whatsapp/channels/web/pair', { method: 'POST', body: JSON.stringify({ mode, phone: pairPhone }) });
      if (r.linked) { setPair(null); swalToast('رقم الأعمال مربوط أصلاً', 'success'); load(); return; }
      setPair({ mode, qr: r.qr, code: r.code });
    } catch (e: any) { setPair(null); swalToast(e.message, 'error'); }
  };

  const resume = async (ch: 'cloud' | 'web') => {
    if (!(await swalConfirm(`رفع قفل ${ch === 'cloud' ? 'ميتا' : 'رقم الأعمال'} يدويّاً؟ افعل ذلك بعد التأكّد أنّ السبب انتهى.`, { confirmText: 'ارفع القفل', icon: 'warning' }))) return;
    try { setD(await apiFetch(`/api/whatsapp/channels/${ch}/resume`, { method: 'POST' })); swalToast('رُفع القفل', 'success'); } catch (e: any) { swalToast(e.message, 'error'); }
  };

  const runImport = async (force = false) => {
    if (!(await swalConfirm((force ? 'إعادة مرآة محادثات رقم الأعمال؟ (المكرّر لا يُضاف مرّتين)' : 'مرآة محادثات رقم الأعمال في الوارد؟')
      + '\n\nكلّ محادثةٍ على رقم الأعمال تصير محادثةً في الوارد بتاريخها كاملاً — لاعبين وغيرهم — بلا إشعارات ولا ردود ولا «غير مقروء». غير اللاعبين تُفتح محادثاتهم والبوت مطفأ. تعمل في الخلفيّة بضع دقائق.', { confirmText: 'ابدأ' }))) return;
    setImporting(true);
    try { await apiFetch('/api/whatsapp/channels/web/import', { method: 'POST', body: JSON.stringify({ force }) }); swalToast('بدأت المرآة في الخلفيّة — تُحدَّث حالتها هنا', 'info'); setTimeout(load, 3000); }
    catch (e: any) { swalToast(e.message, 'error'); }
    finally { setImporting(false); }
  };

  const webTone: Tone | undefined = !d.configured.web ? undefined : web.locked ? 'danger' : web.ready ? 'ok' : 'warn';
  const ob = d.outbox;
  const num = (path: string, value: any, label: string, min: number) => (
    <input type="number" inputMode="numeric" min={min} value={value} onChange={e => set(path, Number(e.target.value))} className="wa-input num" dir="ltr" aria-label={label} />
  );
  const fnum = (id: string, label: string, path: string, value: any, min: number) => (
    <Field label={label} htmlFor={id}>
      <input id={id} type="number" inputMode="numeric" min={min} value={value} onChange={e => set(path, Number(e.target.value))} className="wa-input" dir="ltr" />
    </Field>
  );
  const lineDefault = draft.lineDefault || 'all';
  const hi = d.historyImport;

  return (
    <>
      <PageHead title="القنوات" sub="ميتا (Cloud API) ورقم الأعمال (جلسة) — الوضع والسقوف والبديل والتحويل وربط رقم الأعمال من شاشةٍ واحدة." />

      {/* ── حالة القناتين ── */}
      <div className="wa-grid2">
        <Card style={{ borderColor: 'var(--ch-meta)' }}
          title={<><Cloud style={{ color: 'var(--ch-meta)' }} aria-hidden="true" />ميتا (Cloud API)</>}
          aside={<Badge tone={d.configured.cloud ? 'ok' : undefined}><i className={`wa-dot ${d.configured.cloud ? 'ok' : ''}`} />{d.configured.cloud ? 'مهيّأة' : 'غير مهيّأة'}</Badge>}>
          <div className="stack">
            <p className="muted" style={NOTE}>{d.cloud?.summary || '—'}</p>
            {d.locks.cloud && (
              <Banner tone="danger" icon={<Ban aria-hidden="true" />} action="رفع القفل" onAction={() => resume('cloud')}>{d.locks.cloud}</Banner>
            )}
          </div>
        </Card>

        <Card style={{ borderColor: 'var(--ch-web)' }}
          title={<><Smartphone style={{ color: 'var(--ch-web)' }} aria-hidden="true" />رقم الأعمال (جلسة)</>}
          aside={<Badge tone={webTone}><i className={`wa-dot ${webTone || ''}`} />{!d.configured.web ? 'غير مهيّأ' : STATUS_AR[web.status] || web.status}</Badge>}>
          <div className="stack">
            {d.configured.web && (
              <div>
                <div className="wa-kv"><span>الرقم</span><b className="ltr">{web.phone ? '+' + web.phone : '—'}</b></div>
                <div className="wa-kv"><span>آخر فحص حقيقيّ</span>
                  <b className="row" style={{ gap: 4 }}>
                    {web.lastProbeOk === false ? <X className="s" style={{ color: 'var(--danger)' }} aria-label="فشل" />
                      : web.lastProbeOk ? <Check className="s" style={{ color: 'var(--ok)' }} aria-label="نجح" /> : '— '}
                    {ago(web.lastProbeAt)}
                  </b>
                </div>
                <div className="wa-kv"><span>آخر حدث</span><b>{ago(web.lastEventAt)}</b></div>
                <div className="wa-kv"><span>الويبهوك</span>
                  <Badge tone={web.webhook?.ok ? 'ok' : 'warn'}><i className={`wa-dot ${web.webhook?.ok ? 'ok' : 'warn'}`} />{web.webhook?.ok ? 'مسجّل' : web.webhook?.error || '—'}</Badge>
                </div>
              </div>
            )}
            {web.restriction && (
              <Banner tone="warn" icon={<AlertTriangle aria-hidden="true" />}>
                قيد من واتساب: {web.restriction.kind}{web.restriction.expiresAt ? ` حتّى ${new Date(web.restriction.expiresAt).toLocaleString('ar-JO-u-nu-latn')}` : ''}
              </Banner>
            )}
            {web.locked && (
              <Banner tone="danger" icon={<Ban aria-hidden="true" />} action="رفع القفل" onAction={() => resume('web')}>{web.locked}</Banner>
            )}
            {d.configured.web && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="wa-btn"
                  onClick={async () => { try { setD(await apiFetch('/api/whatsapp/channels/web/check', { method: 'POST' })); } catch (e: any) { swalToast(e.message, 'error'); } }}>
                  <RefreshCw aria-hidden="true" />افحص الآن
                </button>
                {!web.linked && <>
                  <button type="button" className="wa-btn primary" onClick={() => startPair('qr')}><QrCode aria-hidden="true" />ربط برمز QR</button>
                  <div className="flex gap-2 w-full">
                    <input value={pairPhone} onChange={e => setPairPhone(e.target.value)} placeholder="9627XXXXXXXX" dir="ltr" inputMode="numeric"
                      aria-label="رقم الأعمال لرمز الاقتران" className="wa-input grow" />
                    <button type="button" className="wa-btn" onClick={() => startPair('code')}><KeyRound aria-hidden="true" />رمز اقتران</button>
                  </div>
                </>}
              </div>
            )}
          </div>
        </Card>
      </div>

      {pair && (
        <Card style={{ borderColor: 'var(--ch-web)' }}>
          <div className="flex flex-col md:flex-row gap-4 items-center md:items-start">
            {pair.busy && !pair.qr && !pair.code && (
              <div className="row muted" role="status"><Loader2 className="animate-spin" aria-hidden="true" />تجهيز الجلسة…</div>
            )}
            {pair.qr && <QrImage value={pair.qr} />}
            {pair.code && (
              <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 'var(--space-1)' }}>
                <div className="muted" style={{ font: '700 12px/16px var(--font-sans)' }}>رمز الاقتران</div>
                <span className="wa-code">{pair.code}</span>
              </div>
            )}
            <div className="stack grow" style={{ gap: 'var(--space-2)' }}>
              <b style={{ font: '700 14px/20px var(--font-sans)' }}>على هاتف رقم الأعمال:</b>
              <ol style={{ margin: 0, paddingInlineStart: 20, font: '400 14px/24px var(--font-sans)', color: 'var(--ink-2)', listStyle: 'decimal' }}>
                <li>افتح واتساب للأعمال ← ⋮ ← <strong>الأجهزة المرتبطة</strong> ← <strong>ربط جهاز</strong>.</li>
                <li>{pair.mode === 'qr' ? 'امسح الرمز الظاهر هنا (يتجدّد كلّ دقيقة).' : 'اختر «الربط برقم الهاتف بدلاً من ذلك» واكتب الرمز.'}</li>
              </ol>
              <p className="muted" style={NOTE}>الهاتف يبقى الجهاز الأساسيّ — أبقِه متّصلاً بالإنترنت (يُفصل الربط إن غاب نحو ١٤ يوماً).</p>
              <div><button type="button" className="wa-btn ghost" onClick={() => setPair(null)}>إلغاء</button></div>
            </div>
          </div>
        </Card>
      )}

      {/* ── وضع التشغيل ── */}
      <Card title="وضع التشغيل" aside="التبديل فوريّ ويمكن الرجوع عنه">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3" role="radiogroup" aria-label="وضع التشغيل">
          {d.modes.map((m: any) => (
            <button key={m.id} type="button" className="wa-radio" role="radio" aria-checked={s.mode === m.id} disabled={saving}
              style={{ alignItems: 'flex-start', height: '100%' }} onClick={() => switchMode(m.id)}>
              <span className="t"><b>{MODE_INFO[m.id]?.title || m.label}</b><span>{MODE_INFO[m.id]?.desc}</span></span>
              <span className="o" />
            </button>
          ))}
        </div>
      </Card>

      {/* ── الطابور والسقوف ── */}
      <Card title="طابور رقم الأعمال">
        <div className="stack">
          {ob && (
            <div>
              <div className="wa-kv"><span>{LANE_AR.reply} اليوم</span><b className="ltr">{ob.sentToday.reply}</b></div>
              {(() => { const p = pc(ob.sentToday.timely, s.timely.serviceDailyCap); return <HBar label={`${LANE_AR.timely} اليوم`} pct={p} tone={barTone(p)} value={frac(ob.sentToday.timely, s.timely.serviceDailyCap)} />; })()}
              {ob.sentToday.confirm != null && (() => { const cap = s.timely.confirmDailyCap ?? 300; const p = pc(ob.sentToday.confirm, cap); return <HBar label="تثبيت الحجز" pct={p} tone={barTone(p)} value={frac(ob.sentToday.confirm, cap)} />; })()}
              {(() => { const cap = ob.caps?.bulkDaily ?? s.bulk.dailyCap; const p = pc(ob.sentToday.bulk, cap); return <HBar label={`${LANE_AR.bulk} اليوم`} pct={p} tone={barTone(p, 'info')} value={frac(ob.sentToday.bulk, cap)} />; })()}
              {(() => { const p = pc(ob.sentToday.coldBulk, ob.caps?.coldDaily); return <HBar label="بارد اليوم" pct={p} tone={barTone(p, 'info')} value={frac(ob.sentToday.coldBulk, ob.caps?.coldDaily)} />; })()}
              {(() => { const p = pc(ob.sentLastHour, ob.caps?.bulkHourly); return <HBar label="آخر ساعة" pct={p} tone={barTone(p)} value={frac(ob.sentLastHour, ob.caps?.bulkHourly)} />; })()}
              <div className="wa-kv" style={{ flexWrap: 'wrap' }}><span>في الطابور</span>
                <b style={{ font: '500 13px/22px var(--font-sans)' }}>
                  {LANE_AR.reply} <span className="ltr">{ob.queued.reply}</span> · {LANE_AR.timely} <span className="ltr">{ob.queued.timely}</span> · {LANE_AR.bulk} <span className="ltr">{ob.queued.bulk}</span> · البارد <span className="ltr">{ob.queued.coldBulk}</span>
                </b>
              </div>
              {ob.warmup?.enabled && (
                ob.warmup.linked
                  ? <div className="row muted" style={{ ...SMALL, marginTop: 'var(--space-2)' }}><Flame className="s" aria-hidden="true" />
                    <span>تسخين الجلسة: اليوم <span className="ltr">{ob.warmup.ageDays}</span> — سقف اليوم <span className="ltr">{ob.caps?.bulkDaily}</span> (البارد <span className="ltr">{ob.caps?.coldDaily}</span>)</span></div>
                  : <div style={{ marginTop: 'var(--space-2)' }}><Banner tone="warn" icon={<Flame aria-hidden="true" />}>التسخين: الرقم غير مربوط — لا إرسال جماعيّ حتّى يُربط</Banner></div>
              )}
            </div>
          )}

          <div style={SUB}>{LANE_AR.bulk}</div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {fnum('ch-bulk-daily', 'الجماعيّ يوميّاً', 'bulk.dailyCap', draft.bulk.dailyCap, 0)}
            {fnum('ch-bulk-hourly', 'بالساعة', 'bulk.hourlyCap', draft.bulk.hourlyCap, 1)}
            {fnum('ch-bulk-gapmin', 'التباعد من (ث)', 'bulk.gapMinSec', draft.bulk.gapMinSec, 1)}
            {fnum('ch-bulk-gapmax', 'التباعد إلى (ث)', 'bulk.gapMaxSec', draft.bulk.gapMaxSec, 1)}
            <Field label="الساعات من" htmlFor="ch-bulk-from">
              <input id="ch-bulk-from" type="time" value={draft.bulk.from} onChange={e => set('bulk.from', e.target.value)} className="wa-input" dir="ltr" />
            </Field>
            <Field label="الساعات إلى" htmlFor="ch-bulk-to">
              <input id="ch-bulk-to" type="time" value={draft.bulk.to} onChange={e => set('bulk.to', e.target.value)} className="wa-input" dir="ltr" />
            </Field>
          </div>

          <div className="row" style={{ ...SUB, color: 'var(--warn)' }}><Snowflake className="s" aria-hidden="true" />المحادثات الباردة (أوّل رسالة منّا)</div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {fnum('ch-cold-daily', 'يوميّاً', 'cold.dailyCap', draft.cold.dailyCap, 0)}
            {fnum('ch-cold-gapmin', 'التباعد من (ث)', 'cold.gapMinSec', draft.cold.gapMinSec, 10)}
            {fnum('ch-cold-gapmax', 'التباعد إلى (ث)', 'cold.gapMaxSec', draft.cold.gapMaxSec, 10)}
          </div>

          <div>
            <Setting title="تسخين تدريجيّ لكلّ ربطٍ جديد" hint="يبدأ السقف منخفضاً ويرتفع يوميّاً — أهمّ حماية بعد فكّ الربط أو التقييد">
              <Toggle on={!!draft.warmup.enabled} onChange={v => set('warmup.enabled', v)} label="تسخين تدريجيّ لكلّ ربطٍ جديد" />
            </Setting>
            {draft.warmup.enabled && (
              <Setting title="إعفاء الدافئ من التسخين"
                hint={<>من له محادثة معنا لا يخضع لتدرّج عمر الربط — يبقى سقفا اليوم والساعة المضبوطان أعلاه، والبارد يبقى بتدرّجه.
                  {' '}تنبيه: التسخين يحمي <strong>الرقم</strong> من قفزة حجمٍ بعد ربطٍ جديد أيّاً كان المستلم — الإعفاء أنسب بعد أيّامٍ من الربط بلا إنذارات.</>}>
                <Toggle on={!!draft.warmup.warmExempt} onChange={v => set('warmup.warmExempt', v)} label="إعفاء الدافئ من التسخين" />
              </Setting>
            )}
          </div>

          <div style={SUB}>{LANE_AR.timely}</div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {fnum('ch-timely-gapmin', 'التباعد من (ث)', 'timely.gapMinSec', draft.timely.gapMinSec, 0)}
            {fnum('ch-timely-gapmax', 'التباعد إلى (ث)', 'timely.gapMaxSec', draft.timely.gapMaxSec, 0)}
            {fnum('ch-timely-cap', 'سقفه اليوميّ', 'timely.serviceDailyCap', draft.timely.serviceDailyCap, 0)}
            {fnum('ch-timely-confirm', 'سقف تثبيت الحجز', 'timely.confirmDailyCap', draft.timely.confirmDailyCap ?? 300, 0)}
          </div>
          <p className="muted" style={{ ...SMALL, margin: 0 }}>رسائل تثبيت الحجز بسقفٍ مستقلّ عن سقف المقيّد بوقت.</p>
          <div>
            <Setting title="المتابعة لا تتجاوز (ساعة)" hint="عدد الساعات من آخر رسالة">
              {num('followupMaxAgeHours', draft.followupMaxAgeHours, 'المتابعة لا تتجاوز — ساعة من آخر رسالة', 1)}
            </Setting>
          </div>
        </div>
      </Card>

      <div className="wa-grid2">
        {/* ── الدون على رقم الأعمال ── */}
        <Card title="الدون على رقم الأعمال">
          <Setting title="الدون يردّ على رقم الأعمال" hint="مطفأ = رسائل رقم الأعمال تُعرض فقط والموظّفون يردّون">
            <Toggle on={!!draft.webBot} onChange={v => set('webBot', v)} label="الدون يردّ على رقم الأعمال" />
          </Setting>
          <Setting title="الدون يردّ على غير اللاعبين في محادثات رقم الأعمال"
            hint={<>مطفأ = محادثات رقم الأعمال القديمة لغير اللاعبين تُفتح والبوت مطفأ (موردون ومعارف). مفعّل = يردّ عليهم كعملاء.
              {' '}يُطبَّق عند الحفظ على محادثاتهم القائمة أيضاً — ومن غيّرتَ بوته يدويّاً (<Bot className="s" style={{ display: 'inline', verticalAlign: '-2px' }} aria-label="زرّ البوت" />) يبقى على اختيارك.</>}>
            <Toggle on={!!draft.webBotKnown} onChange={v => set('webBotKnown', v)} label="الدون يردّ على غير اللاعبين في محادثات رقم الأعمال" />
          </Setting>
          {d.configured.web && web.linked && (
            <Setting title="مرآة محادثات رقم الأعمال في الوارد"
              hint={hi?.running ? `المرآة جارية… ${hi.done || 0}/${hi.chats} محادثة · ${hi.messages} رسالة`
                : hi ? `آخر مرّة: ${hi.chats} محادثة · ${hi.messages} رسالة` : undefined}>
              <button type="button" className="wa-btn" disabled={importing || hi?.running} onClick={() => runImport(!!hi)}>
                {importing || hi?.running ? <Loader2 className="animate-spin" aria-hidden="true" /> : <DatabaseBackup aria-hidden="true" />}
                {importing ? 'يبدأ…' : hi?.running ? 'جارية…' : hi ? 'حدّثها' : 'ابدأ'}
              </button>
            </Setting>
          )}
          {hi?.error && !hi?.running && (
            <Banner tone="warn" icon={<AlertTriangle aria-hidden="true" />}>{hi.error}</Banner>
          )}
        </Card>

        {/* ── البديل والتحويل ── */}
        <Card title="البديل بين الرقمين">
          {(['reply', 'timely', 'bulk'] as const).map(l => (
            <Setting key={l} title={LANE_AR[l]}>
              <Toggle on={!!draft.failover[l]} onChange={v => set(`failover.${l}`, v)} label={`البديل بين الرقمين — ${LANE_AR[l]}`} />
            </Setting>
          ))}
          <p className="muted" style={{ ...SMALL, margin: 'var(--space-2) 0 0' }}>إن تعطّلت القناة المختارة ونافذة الأخرى مفتوحة، تخرج الرسالة من الأخرى مع سطر «نراسلك من رقمنا الآخر».</p>

          <div style={H3}>التحويل من رقم ميتا</div>
          <Setting title="سطر «رقمنا للحجز» في ردود ميتا" hint="يعمل في «الجلسة أوّلاً» و«الجلسة + ميتا للتحويل».">
            <Toggle on={!!draft.cloudRedirect.enabled} onChange={v => set('cloudRedirect.enabled', v)} label="سطر «رقمنا للحجز» في ردود ميتا" />
          </Setting>
          <Setting title="مرّة في اليوم لكلّ محادثة">
            <Toggle on={!!draft.cloudRedirect.oncePerDay} onChange={v => set('cloudRedirect.oncePerDay', v)} label="مرّة في اليوم لكلّ محادثة" />
          </Setting>
          <Field label="رقم الأعمال" htmlFor="ch-redirect-number" style={{ marginTop: 'var(--space-3)' }}>
            <input id="ch-redirect-number" value={draft.cloudRedirect.businessNumber} onChange={e => set('cloudRedirect.businessNumber', e.target.value)}
              placeholder="07XXXXXXXX" dir="ltr" inputMode="tel" className="wa-input" />
          </Field>
        </Card>
      </div>

      {/* ── الإرسال المباشر والجمهور الافتراضيّ ── */}
      <Card title="الإرسال المباشر من الصفحات">
        <Setting title="الحجوزات والتحليلات والمستكشف ترسل من النظام">
          <Toggle on={!!draft.outreach.direct} onChange={v => set('outreach.direct', v)} label="الحجوزات والتحليلات والمستكشف ترسل من النظام" />
        </Setting>
        <Setting title="رسالة فئة للّاعب نفسه مرّة كلّ (أيّام)">
          {num('outreach.cohortFreqDays', draft.outreach.cohortFreqDays, 'رسالة فئة للّاعب نفسه مرّة كلّ — أيّام', 0)}
        </Setting>

        <div style={H3}>الجمهور الافتراضيّ في كلّ الصفحات</div>
        <p className="muted" style={{ ...NOTE, margin: '4px 0 var(--space-3)' }}>يُطبَّق على التحليلات والحجوزات والمتابعة والبثّ ما لم تغيّره في الصفحة نفسها. يحمي من بدء محادثةٍ باردةٍ عن غير قصد.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" role="radiogroup" aria-label="الجمهور الافتراضيّ في كلّ الصفحات">
          {(['all', 'warm', 'two_way'] as const).map(k => (
            <button key={k} type="button" className="wa-radio" role="radio" aria-checked={lineDefault === k}
              style={{ alignItems: 'flex-start', height: '100%' }} onClick={() => set('lineDefault', k)}>
              <span className="t"><b>{LINE_DEFAULT[k].t}</b><span>{LINE_DEFAULT[k].d}</span></span>
              <span className="o" />
            </button>
          ))}
        </div>
      </Card>

      <div className={dirty ? 'wa-card wa-savebar row' : 'row'} style={{ flexWrap: 'wrap' }}>
        <button type="button" className="wa-btn primary" disabled={!dirty || saving} onClick={() => save()}>
          {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}{saving ? 'يحفظ…' : 'احفظ الإعدادات'}
        </button>
        {dirty && <button type="button" className="wa-btn ghost" onClick={() => setDraft(structuredClone(s))}><Undo2 aria-hidden="true" />تراجع</button>}
      </div>
    </>
  );
}
