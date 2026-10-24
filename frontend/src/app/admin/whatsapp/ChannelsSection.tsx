'use client';

// ══════════════════════════════════════════════════════
// 🔀 القنوات — ميتا (Cloud API) ورقم الأعمال (جلسة OpenWA)
// ══════════════════════════════════════════════════════
// وضع التشغيل يُبدَّل هنا بلا نشر، والسقوف والبديل وسطر التحويل وربط رقم الأعمال واستيراد
// تاريخه وأقفال القناتين — كلّها من شاشةٍ واحدة. كلّ حفظٍ يُسجَّل في سجلّ عمليّات الموظّفين.

import { useCallback, useEffect, useRef, useState } from 'react';
import { swalConfirm, swalToast } from '@/lib/swal';

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
  if (value.startsWith('data:')) return <img src={value} alt="رمز ربط واتساب" className="w-56 h-56 bg-white p-2 rounded-xl" />;
  return Svg ? <div className="bg-white p-3 rounded-xl inline-block"><Svg value={value} size={208} /></div> : <div className="text-gray-500">…</div>;
}

const inp = 'bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-sm text-white focus:border-amber-500 outline-none';

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

  if (!d || !draft) return <div className="text-gray-500 p-4">⏳ تحميل القنوات…</div>;
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

  const webTone = !d.configured.web ? 'text-gray-500' : web.locked ? 'text-rose-300' : web.ready ? 'text-emerald-300' : 'text-amber-300';
  const ob = d.outbox;

  return (
    <div className="space-y-3 text-sm" dir="rtl">
      {/* ── حالة القناتين ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-3 space-y-1.5">
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-indigo-400" /><b className="text-white">ميتا (Cloud API)</b>
            <span className="mr-auto text-xs text-gray-500">{d.configured.cloud ? 'مهيّأة' : 'غير مهيّأة'}</span></div>
          <div className="text-gray-400 text-xs">{d.cloud?.summary || '—'}</div>
          {d.locks.cloud && <div className="flex flex-wrap items-center gap-2 text-rose-200 text-xs">⛔ {d.locks.cloud}<button onClick={() => resume('cloud')} className="px-2 py-0.5 rounded border border-rose-500/40 hover:bg-rose-500/10">رفع القفل</button></div>}
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-3 space-y-1.5">
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /><b className="text-white">رقم الأعمال (جلسة)</b>
            <span className={`mr-auto text-xs font-bold ${webTone}`}>{!d.configured.web ? 'غير مهيّأ' : STATUS_AR[web.status] || web.status}</span></div>
          {d.configured.web && (
            <div className="text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
              <span>الرقم: <b className="text-gray-200" dir="ltr">{web.phone ? '+' + web.phone : '—'}</b></span>
              <span>آخر فحص حقيقيّ: <b className="text-gray-200">{web.lastProbeOk === false ? '✗' : web.lastProbeOk ? '✓' : '—'} {ago(web.lastProbeAt)}</b></span>
              <span>آخر حدث: <b className="text-gray-200">{ago(web.lastEventAt)}</b></span>
              <span>الويبهوك: <b className={web.webhook?.ok ? 'text-emerald-300' : 'text-amber-300'}>{web.webhook?.ok ? 'مسجّل' : web.webhook?.error || '—'}</b></span>
            </div>
          )}
          {web.restriction && <div className="text-amber-200 text-xs">⚠️ قيد من واتساب: {web.restriction.kind}{web.restriction.expiresAt ? ` حتّى ${new Date(web.restriction.expiresAt).toLocaleString('ar-JO')}` : ''}</div>}
          {web.locked && <div className="flex flex-wrap items-center gap-2 text-rose-200 text-xs">⛔ {web.locked}<button onClick={() => resume('web')} className="px-2 py-0.5 rounded border border-rose-500/40 hover:bg-rose-500/10">رفع القفل</button></div>}
          {d.configured.web && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={async () => { try { setD(await apiFetch('/api/whatsapp/channels/web/check', { method: 'POST' })); } catch (e: any) { swalToast(e.message, 'error'); } }} className="px-2.5 py-1 rounded-lg border border-gray-800 text-gray-300 hover:text-white text-xs">↻ افحص الآن</button>
              {!web.linked && <>
                <button onClick={() => startPair('qr')} className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold text-xs">🔗 ربط برمز QR</button>
                <input value={pairPhone} onChange={e => setPairPhone(e.target.value)} placeholder="9627XXXXXXXX" dir="ltr" className={inp + ' w-36 text-xs'} />
                <button onClick={() => startPair('code')} className="px-2.5 py-1 rounded-lg border border-emerald-500/40 text-emerald-300 text-xs">🔢 رمز اقتران</button>
              </>}
            </div>
          )}
        </div>
      </div>

      {pair && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 flex flex-col sm:flex-row gap-4 items-start">
          {pair.busy && !pair.qr && !pair.code && <div className="text-gray-400">⏳ تجهيز الجلسة…</div>}
          {pair.qr && <QrImage value={pair.qr} />}
          {pair.code && <div className="text-3xl font-mono font-bold tracking-[.3em] text-white bg-gray-950 px-4 py-3 rounded-xl" dir="ltr">{pair.code}</div>}
          <div className="text-gray-300 space-y-1 text-[13px]">
            <b className="block text-white">على هاتف رقم الأعمال:</b>
            <div>١) افتح واتساب للأعمال ← ⋮ ← <b>الأجهزة المرتبطة</b> ← <b>ربط جهاز</b>.</div>
            <div>٢) {pair.mode === 'qr' ? 'امسح الرمز الظاهر هنا (يتجدّد كلّ دقيقة).' : 'اختر «الربط برقم الهاتف بدلاً من ذلك» واكتب الرمز.'}</div>
            <div className="text-gray-500">الهاتف يبقى الجهاز الأساسيّ — أبقِه متّصلاً بالإنترنت (يُفصل الربط إن غاب نحو ١٤ يوماً).</div>
            <button onClick={() => setPair(null)} className="text-gray-500 hover:text-white text-xs">إلغاء</button>
          </div>
        </div>
      )}

      {/* ── وضع التشغيل ── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-3">
        <b className="text-white block mb-2">وضع التشغيل</b>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {d.modes.map((m: any) => (
            <button key={m.id} onClick={() => switchMode(m.id)} disabled={saving}
              className={`text-right rounded-xl border p-2.5 ${s.mode === m.id ? 'border-amber-500 bg-amber-500/10' : 'border-gray-800 hover:border-gray-600'}`}>
              <b className={`block ${s.mode === m.id ? 'text-amber-300' : 'text-gray-200'}`}>{s.mode === m.id ? '● ' : ''}{MODE_INFO[m.id]?.title || m.label}</b>
              <span className="block text-[11.5px] text-gray-500 leading-snug mt-1">{MODE_INFO[m.id]?.desc}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 mt-3 text-gray-300">
          <input type="checkbox" checked={!!draft.webBot} onChange={e => set('webBot', e.target.checked)} />
          الدون يردّ على رقم الأعمال <span className="text-gray-500 text-xs">(مطفأ = رسائل رقم الأعمال تُعرض فقط والموظّفون يردّون)</span>
        </label>
        <label className="flex items-start gap-2 mt-2 text-gray-300">
          <input type="checkbox" className="mt-1" checked={!!draft.webBotKnown} onChange={e => set('webBotKnown', e.target.checked)} />
          <span>الدون يردّ على غير اللاعبين في محادثات رقم الأعمال
            <span className="block text-gray-500 text-xs leading-snug">مطفأ = محادثات رقم الأعمال القديمة لغير اللاعبين تُفتح والبوت مطفأ (موردون ومعارف). مفعّل = يردّ عليهم كعملاء.
              يُطبَّق عند الحفظ على محادثاتهم القائمة أيضاً — ومن غيّرتَ بوته يدويّاً (🤖) يبقى على اختيارك.</span></span>
        </label>
      </div>

      {/* ── الطابور والسقوف ── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-3 space-y-2">
        <b className="text-white block">طابور رقم الأعمال</b>
        {ob && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              {(['reply', 'timely', 'bulk'] as const).map(l => (
                <div key={l} className="rounded-lg border border-gray-800 p-2">
                  <div className="text-[11px] text-gray-500">{LANE_AR[l]}</div>
                  <div className="text-white font-bold tabular-nums">{ob.sentToday[l]}{l === 'bulk' ? ` / ${ob.caps?.bulkDaily ?? s.bulk.dailyCap}` : l === 'timely' ? ` / ${s.timely.serviceDailyCap}` : ''}</div>
                  <div className="text-[11px] text-gray-500">اليوم · في الطابور {ob.queued[l]}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-gray-400">
              {ob.warmup?.enabled && (
                ob.warmup.linked
                  ? <span>🔥 تسخين الجلسة: اليوم {ob.warmup.ageDays} — سقف اليوم {ob.caps?.bulkDaily} (البارد {ob.caps?.coldDaily})</span>
                  : <span className="text-amber-300">🔥 التسخين: الرقم غير مربوط — لا إرسال جماعيّ حتّى يُربط</span>
              )}
              <span>❄️ بارد اليوم: {ob.sentToday.coldBulk} / {ob.caps?.coldDaily} · في الطابور {ob.queued.coldBulk}</span>
              <span>⏳ آخر ساعة: {ob.sentLastHour} / {ob.caps?.bulkHourly}</span>
            </div>
          </>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-gray-300">
          <span>الجماعيّ يوميّاً <input type="number" min={0} value={draft.bulk.dailyCap} onChange={e => set('bulk.dailyCap', Number(e.target.value))} className={inp + ' w-20'} /></span>
          <span>بالساعة <input type="number" min={1} value={draft.bulk.hourlyCap} onChange={e => set('bulk.hourlyCap', Number(e.target.value))} className={inp + ' w-16'} /></span>
          <span>التباعد <input type="number" min={1} value={draft.bulk.gapMinSec} onChange={e => set('bulk.gapMinSec', Number(e.target.value))} className={inp + ' w-16'} /> – <input type="number" min={1} value={draft.bulk.gapMaxSec} onChange={e => set('bulk.gapMaxSec', Number(e.target.value))} className={inp + ' w-16'} /> ث</span>
          <span>الساعات <input type="time" value={draft.bulk.from} onChange={e => set('bulk.from', e.target.value)} className={inp} /> – <input type="time" value={draft.bulk.to} onChange={e => set('bulk.to', e.target.value)} className={inp} /></span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-gray-300 border-t border-gray-800/60 pt-2">
          <span className="text-amber-300 font-bold text-[12px]">❄️ المحادثات الباردة (أوّل رسالة منّا):</span>
          <span>يوميّاً <input type="number" min={0} value={draft.cold.dailyCap} onChange={e => set('cold.dailyCap', Number(e.target.value))} className={inp + ' w-16'} /></span>
          <span>التباعد <input type="number" min={10} value={draft.cold.gapMinSec} onChange={e => set('cold.gapMinSec', Number(e.target.value))} className={inp + ' w-16'} /> – <input type="number" min={10} value={draft.cold.gapMaxSec} onChange={e => set('cold.gapMaxSec', Number(e.target.value))} className={inp + ' w-16'} /> ث</span>
        </div>
        <label className="flex items-center gap-2 text-gray-300">
          <input type="checkbox" checked={!!draft.warmup.enabled} onChange={e => set('warmup.enabled', e.target.checked)} />
          🔥 تسخين تدريجيّ لكلّ ربطٍ جديد <span className="text-gray-500 text-xs">(يبدأ السقف منخفضاً ويرتفع يوميّاً — أهمّ حماية بعد فكّ الربط أو التقييد)</span>
        </label>
        {draft.warmup.enabled && (
          <label className="flex items-start gap-2 text-gray-300 mr-6">
            <input type="checkbox" className="mt-1" checked={!!draft.warmup.warmExempt} onChange={e => set('warmup.warmExempt', e.target.checked)} />
            <span>إعفاء الدافئ من التسخين <span className="block text-gray-500 text-xs leading-snug">من له محادثة معنا لا يخضع لتدرّج عمر الربط — يبقى سقفا اليوم والساعة المضبوطان أعلاه، والبارد يبقى بتدرّجه.
              ⚠️ التسخين يحمي <b>الرقم</b> من قفزة حجمٍ بعد ربطٍ جديد أيّاً كان المستلم — الإعفاء أنسب بعد أيّامٍ من الربط بلا إنذارات.</span></span>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-gray-300">
          <span>المقيّد بوقت: تباعد <input type="number" min={0} value={draft.timely.gapMinSec} onChange={e => set('timely.gapMinSec', Number(e.target.value))} className={inp + ' w-16'} /> – <input type="number" min={0} value={draft.timely.gapMaxSec} onChange={e => set('timely.gapMaxSec', Number(e.target.value))} className={inp + ' w-16'} /> ث</span>
          <span>سقفه اليوميّ <input type="number" min={0} value={draft.timely.serviceDailyCap} onChange={e => set('timely.serviceDailyCap', Number(e.target.value))} className={inp + ' w-20'} /></span>
          <span>المتابعة لا تتجاوز <input type="number" min={1} value={draft.followupMaxAgeHours} onChange={e => set('followupMaxAgeHours', Number(e.target.value))} className={inp + ' w-16'} /> ساعة من آخر رسالة</span>
        </div>
      </div>

      {/* ── البديل والتحويل والإرسال المباشر ── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-3 space-y-2 text-gray-300">
        <b className="text-white block">البديل بين الرقمين</b>
        <div className="flex flex-wrap gap-4">
          {(['reply', 'timely', 'bulk'] as const).map(l => (
            <label key={l} className="flex items-center gap-1.5"><input type="checkbox" checked={!!draft.failover[l]} onChange={e => set(`failover.${l}`, e.target.checked)} />{LANE_AR[l]}</label>
          ))}
        </div>
        <div className="text-xs text-gray-500">إن تعطّلت القناة المختارة ونافذة الأخرى مفتوحة، تخرج الرسالة من الأخرى مع سطر «نراسلك من رقمنا الآخر».</div>
        <b className="text-white block pt-2">التحويل من رقم ميتا</b>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!draft.cloudRedirect.enabled} onChange={e => set('cloudRedirect.enabled', e.target.checked)} />سطر «رقمنا للحجز» في ردود ميتا</label>
          <input value={draft.cloudRedirect.businessNumber} onChange={e => set('cloudRedirect.businessNumber', e.target.value)} placeholder="رقم الأعمال 07XXXXXXXX" dir="ltr" className={inp + ' w-44'} />
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!draft.cloudRedirect.oncePerDay} onChange={e => set('cloudRedirect.oncePerDay', e.target.checked)} />مرّة في اليوم لكلّ محادثة</label>
        </div>
        <div className="text-xs text-gray-500">يعمل في «الجلسة أوّلاً» و«الجلسة + ميتا للتحويل».</div>
        <b className="text-white block pt-2">الإرسال المباشر من الصفحات</b>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!draft.outreach.direct} onChange={e => set('outreach.direct', e.target.checked)} />الحجوزات والتحليلات والمستكشف ترسل من النظام</label>
          <span>رسالة فئة للّاعب نفسه مرّة كلّ <input type="number" min={0} value={draft.outreach.cohortFreqDays} onChange={e => set('outreach.cohortFreqDays', Number(e.target.value))} className={inp + ' w-14'} /> أيّام</span>
        </div>
        {/* ── الجمهور الافتراضيّ لكلّ الصفحات ── */}
        <div className="border-t border-gray-800/60 pt-2">
          <b className="text-white block mb-1">الجمهور الافتراضيّ في كلّ الصفحات</b>
          <div className="text-xs text-gray-500 mb-2">يُطبَّق على التحليلات والحجوزات والمتابعة والبثّ ما لم تغيّره في الصفحة نفسها. يحمي من بدء محادثةٍ باردةٍ عن غير قصد.</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(['all', 'warm', 'two_way'] as const).map(k => (
              <button key={k} type="button" onClick={() => set('lineDefault', k)}
                className={`text-right rounded-xl border p-2.5 ${(draft.lineDefault || 'all') === k ? 'border-amber-500 bg-amber-500/10' : 'border-gray-800 hover:border-gray-600'}`}>
                <b className={`block ${(draft.lineDefault || 'all') === k ? 'text-amber-300' : 'text-gray-200'}`}>{(draft.lineDefault || 'all') === k ? '● ' : ''}{LINE_DEFAULT[k].t}</b>
                <span className="block text-[11px] text-gray-500 leading-snug mt-1">{LINE_DEFAULT[k].d}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button disabled={!dirty || saving} onClick={() => save()} className="px-4 py-2 rounded-xl bg-amber-500 text-black font-bold disabled:opacity-40">{saving ? '⏳ يحفظ…' : 'احفظ الإعدادات'}</button>
        {dirty && <button onClick={() => setDraft(structuredClone(s))} className="px-3 py-2 rounded-xl border border-gray-800 text-gray-400">تراجع</button>}
        <span className="mr-auto" />
        {d.configured.web && web.linked && (
          <button disabled={importing || d.historyImport?.running} onClick={() => runImport(!!d.historyImport)} className="px-3 py-2 rounded-xl border border-gray-800 text-gray-300 hover:text-white disabled:opacity-50">
            {importing ? '⏳ يبدأ…'
              : d.historyImport?.running ? `⏳ المرآة جارية… ${d.historyImport.done || 0}/${d.historyImport.chats} محادثة · ${d.historyImport.messages} رسالة`
                : d.historyImport ? `🗄️ حدّث مرآة المحادثات (آخر مرّة: ${d.historyImport.chats} محادثة · ${d.historyImport.messages} رسالة)` : '🗄️ مرآة محادثات رقم الأعمال في الوارد'}
          </button>
        )}
        {d.historyImport?.error && !d.historyImport?.running && (
          <span className="text-[11px] text-amber-300">⚠️ {d.historyImport.error}</span>
        )}
      </div>
    </div>
  );
}
