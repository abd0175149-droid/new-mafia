'use client';

// ══════════════════════════════════════════════════════
// 📇 جهات اتصال الآيفون — دفتر أرقام MC (مزامنةٌ حيّة CardDAV)
// ══════════════════════════════════════════════════════
// الآيفون يضيف حساب جهات اتصال يشير إلى خادمنا، فتتحدّث الأسماء والملاحظات وحدها،
// ويظهر الجديد، ويختفي من حذف حسابه. أقصر طريق: افتح هذه الصفحة على الآيفون نفسه
// واضغط «ثبّت على هذا الآيفون». قراءةٌ فقط: التعديل على الهاتف لا يمسّ النظام.

import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '';
const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
async function api(path: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(`${API}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}`, ...opts?.headers } });
  let body: any = null; try { body = await res.json(); } catch { /* بلا جسم */ }
  if (!res.ok) throw new Error(body?.error || `خطأ ${res.status}`);
  return body;
}
const n = (x: any) => Number(x || 0).toLocaleString('ar-JO');
function fmtDT(v: any) {
  if (!v) return '—';
  return new Date(v).toLocaleString('ar-JO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' });
}
function ago(v: any) {
  if (!v) return 'لم يتّصل بعد';
  const m = Math.round((Date.now() - new Date(v).getTime()) / 60000);
  if (m < 1) return 'الآن'; if (m < 60) return `قبل ${n(m)} دقيقة`;
  const h = Math.round(m / 60); if (h < 48) return `قبل ${n(h)} ساعة`;
  return `قبل ${n(Math.round(h / 24))} يوماً`;
}
const SRC: Record<string, string> = { player: 'لاعبون', wa: 'راسلوا الدون', res: 'حجوزات موظّفين', campaign: 'أرقام حملة' };
const PARTS: [string, string][] = [['join', 'الانضمام ونوعه'], ['place', 'المدينة والرتبة'], ['play', 'اللعب وآخر زيارة'], ['loyal', 'أختام الولاء'], ['msg', 'آخر رسالة للدون'], ['noshow', 'الغياب'], ['link', 'رابط ملفّه في الداشبورد']];
const card = 'rounded-2xl border border-gray-800 bg-gray-900/60 p-4';
const btn = 'text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50';

function Copy({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="text-[11px] text-amber-300 hover:text-amber-200" onClick={() => {
      navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }).catch(() => {});
    }}>{ok ? 'نُسخ ✓' : 'نسخ'}</button>
  );
}

export default function ContactsSyncPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<any>(null);
  const [label, setLabel] = useState('آيفوني');
  const [created, setCreated] = useState<any>(null);
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    try { const r = await api('/api/contacts-sync'); setD(r); setCfg((c: any) => c ?? r.config); setErr(null); }
    catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addDevice() {
    setBusy(true);
    try { const r = await api('/api/contacts-sync/devices', { method: 'POST', body: JSON.stringify({ label }) }); setCreated(r); await load(); }
    catch (e: any) { alert(`❌ ${e.message}`); }
    setBusy(false);
  }
  async function revoke(dev: any) {
    if (!confirm(`إلغاء «${dev.label}»؟ يتوقّف تحديث جهات الاتصال على هذا الهاتف (احذف الحساب من الهاتف لإزالتها).`)) return;
    try { await api(`/api/contacts-sync/devices/${dev.id}`, { method: 'DELETE' }); await load(); } catch (e: any) { alert(`❌ ${e.message}`); }
  }
  async function saveCfg() {
    setBusy(true);
    try { const r = await api('/api/contacts-sync/config', { method: 'PUT', body: JSON.stringify(cfg) }); setCfg(r.config); await load(); alert('✅ حُفظ — الهواتف تأخذ التغيير في مزامنتها القادمة'); }
    catch (e: any) { alert(`❌ ${e.message}`); }
    setBusy(false);
  }
  async function downloadVcf() {
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/contacts-sync/vcf`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (!res.ok) throw new Error(`خطأ ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `MC-${new Date().toISOString().slice(0, 10)}.vcf`; document.body.appendChild(a); a.click(); a.remove();
    } catch (e: any) { alert(`❌ ${e.message}`); }
    setBusy(false);
  }

  if (err && !d) return <div className="p-6 text-rose-300 text-sm" dir="rtl">{err}</div>;
  if (!d || !cfg) return <div className="p-6 text-gray-500 text-sm" dir="rtl">…</div>;
  const st = d.stats || {};
  const pv = d.preview || {};
  const live = (d.devices || []).filter((x: any) => !x.revoked_at);
  const setSrc = (k: string, v: boolean) => setCfg((c: any) => ({ ...c, sources: { ...c.sources, [k]: v } }));
  const setPart = (k: string, v: boolean) => setCfg((c: any) => ({ ...c, parts: { ...c.parts, [k]: v } }));

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="text-xl font-bold text-white">📇 جهات اتصال الآيفون</h1>
        <p className="text-xs text-gray-400 mt-1 leading-relaxed max-w-3xl">
          حسابُ جهات اتصال على هاتفك يأخذ من النظام مباشرةً: كلّ اسمٍ يبدأ بـ<b className="text-gray-200">{cfg.prefix}</b> وتحته ملاحظة تعرّفك به.
          الملاحظات تتحدّث وحدها، والجديد يظهر، ومن حذف حسابه يختفي. حذفُ الحساب من إعدادات الهاتف يزيلهم كلّهم. قراءةٌ فقط: ما تعدّله على الهاتف لا يمسّ النظام.
        </p>
      </div>

      {/* ── الحالة ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={card}><div className="text-[11px] text-gray-500">في الدفتر الآن</div><div className="text-2xl font-black text-white tabular-nums">{n(st.total)}</div></div>
        {['player', 'wa', 'res'].map(k => (
          <div key={k} className={card}><div className="text-[11px] text-gray-500">{SRC[k]}</div><div className="text-2xl font-black text-amber-300 tabular-nums">{n(st[k])}</div></div>
        ))}
      </div>
      <p className="text-[11px] text-gray-500 -mt-2">آخر تغيير: {fmtDT(st.lastChangeAt)} · إصدار الدفتر {n(st.version)} · {pv.fixedPhones ? `${n(pv.fixedPhones)} رقماً صُحّحت صيغته في الدفتر · ` : ''}{d.invalidTotal ? `${n(d.invalidTotal)} رقماً غير صالح خارج الدفتر` : ''}</p>

      {/* ── إضافة جهاز ── */}
      <section className={`${card} border-amber-600/30`}>
        <h2 className="text-sm font-bold text-white">📱 أضِف هاتفاً</h2>
        <p className="text-[11px] text-gray-400 mt-1">أسهل طريق: افتح هذه الصفحة <b>على الآيفون نفسه</b> من Safari، ثمّ «إنشاء» ثمّ «ثبّت على هذا الآيفون».</p>
        {!created ? (
          <div className="flex gap-2 mt-3 flex-wrap items-center">
            <input id="dev-label" className="bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white w-48" value={label} onChange={e => setLabel(e.target.value)} placeholder="اسم الجهاز" />
            <button disabled={busy} onClick={addDevice} className={`${btn} bg-amber-500 text-black hover:bg-amber-400`}>إنشاء</button>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <a href={created.setupUrl} className="self-start text-sm font-bold px-4 py-2 rounded-xl bg-emerald-500 text-black hover:bg-emerald-400">📲 ثبّت على هذا الآيفون</a>
            <ol className="text-[11.5px] text-gray-300 leading-relaxed list-decimal pr-5 space-y-0.5">
              <li>اضغط الزرّ من Safari على الآيفون ثمّ «السماح» لتنزيل ملفّ الإعداد.</li>
              <li>افتح الإعدادات ← «تمّ تنزيل ملفّ تعريف» ← تثبيت (يظهر «غير موقَّع»: هذا طبيعيّ).</li>
              <li>افتح جهات الاتصال بعد دقيقة: تظهر مجموعة «Mafia Club».</li>
            </ol>
            <p className="text-[11px] text-amber-300">الرابط صالح ٣٠ دقيقة ولمرّةٍ واحدة. كلمة السرّ لا تُعرض مرّةً ثانية.</p>
            <details className="text-[11.5px] text-gray-300">
              <summary className="cursor-pointer text-gray-400">أو أضِف الحساب يدويّاً</summary>
              <div className="mt-2 grid gap-1.5">
                <p className="text-gray-500">الإعدادات ← جهات الاتصال ← الحسابات ← إضافة حساب ← آخر ← إضافة حساب CardDAV:</p>
                {[['الخادم', created.server], ['اسم المستخدم', created.username], ['كلمة السرّ', created.password]].map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2"><span className="text-gray-500 w-24">{k}</span><code className="bg-gray-950 px-2 py-0.5 rounded font-mono" dir="ltr">{v}</code><Copy text={v} /></div>
                ))}
                <p className="text-gray-500">إن لم يجده الآيفون: الإعدادات المتقدّمة ← رابط الحساب: <code dir="ltr">https://{created.server}{created.principalUrl}</code></p>
              </div>
            </details>
            <button onClick={() => setCreated(null)} className="self-start text-[11px] text-gray-400 hover:text-white">تمّ ✓</button>
          </div>
        )}
      </section>

      {/* ── الأجهزة ── */}
      <section className={card}>
        <h2 className="text-sm font-bold text-white">الأجهزة ({n(live.length)})</h2>
        {(d.devices || []).length === 0 ? <p className="text-[11px] text-gray-500 mt-2">لا أجهزة بعد.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500 text-[10.5px]"><tr><th className="text-right px-2 py-1.5">الجهاز</th><th className="text-right px-2 py-1.5">آخر مزامنة</th><th className="text-right px-2 py-1.5">أُنشئ</th><th className="px-2 py-1.5"></th></tr></thead>
              <tbody>
                {d.devices.map((x: any) => (
                  <tr key={x.id} className={`border-t border-gray-800 ${x.revoked_at ? 'opacity-40' : ''}`}>
                    <td className="px-2 py-1.5 text-gray-200">{x.label}<span className="block text-[10px] text-gray-600 font-mono" dir="ltr">{x.username}</span></td>
                    <td className="px-2 py-1.5 text-gray-300">{x.revoked_at ? 'ملغى' : ago(x.last_seen_at)}</td>
                    <td className="px-2 py-1.5 text-gray-500">{fmtDT(x.created_at)} · {x.created_by}</td>
                    <td className="px-2 py-1.5 text-left">{!x.revoked_at && <button onClick={() => revoke(x)} className="text-[11px] text-rose-300 hover:text-rose-200">إلغاء</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── الإعدادات ── */}
      <section className={card}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-bold text-white">ما يظهر على الهاتف</h2>
          <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={cfg.enabled} onChange={e => setCfg({ ...cfg, enabled: e.target.checked })} /> المزامنة مفعّلة <span className="text-gray-500">(إطفاؤها يفرغ الدفتر على كلّ الهواتف)</span></label>
        </div>
        <div className="grid md:grid-cols-3 gap-4 mt-3 text-xs">
          <div className="flex flex-col gap-1.5">
            <b className="text-gray-400 text-[11px]">من</b>
            {[['players', 'لاعبون بحسابات'], ['wa', 'راسلوا الدون بلا حساب'], ['res', 'حجوزات الموظّفين فقط'], ['campaign', 'أرقام حملة لم تردّ']].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-gray-200"><input type="checkbox" checked={!!cfg.sources[k]} onChange={e => setSrc(k, e.target.checked)} /> {l}</label>
            ))}
            <label className="flex items-center gap-2 text-gray-200"><input type="checkbox" checked={cfg.includeTestPlayed} onChange={e => setCfg({ ...cfg, includeTestPlayed: e.target.checked })} /> المعلَّمون «تجريبيّ» ممّن لعبوا</label>
          </div>
          <div className="flex flex-col gap-1.5">
            <b className="text-gray-400 text-[11px]">الاسم</b>
            <label className="flex items-center gap-2 text-gray-200">البادئة <input className="bg-gray-950 border border-gray-800 rounded px-2 py-0.5 w-20 text-white" value={cfg.prefix} onChange={e => setCfg({ ...cfg, prefix: e.target.value })} /></label>
            {[['plain', `${cfg.prefix} الاسم`], ['status', `${cfg.prefix} الاسم + ⭐/🆕`], ['city', `${cfg.prefix} الاسم · المدينة`]].map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 text-gray-200"><input type="radio" name="nf" checked={cfg.nameFormat === v} onChange={() => setCfg({ ...cfg, nameFormat: v })} /> {l}</label>
            ))}
            <label className="flex items-center gap-2 text-gray-200 mt-1"><input type="checkbox" checked={cfg.birthday} onChange={e => setCfg({ ...cfg, birthday: e.target.checked })} /> عيد الميلاد (يظهر في التقويم)</label>
          </div>
          <div className="flex flex-col gap-1.5">
            <b className="text-gray-400 text-[11px]">الملاحظة</b>
            {PARTS.map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-gray-200"><input type="checkbox" checked={!!cfg.parts[k]} onChange={e => setPart(k, e.target.checked)} /> {l}</label>
            ))}
          </div>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          <button disabled={busy} onClick={saveCfg} className={`${btn} bg-amber-500 text-black hover:bg-amber-400`}>حفظ</button>
          <button disabled={busy} onClick={downloadVcf} className={`${btn} border border-gray-700 text-gray-300 hover:text-white`}>⬇️ تنزيل الدفتر ملفّاً (.vcf)</button>
        </div>
      </section>

      {/* ── معاينة ── */}
      <section className={card}>
        <h2 className="text-sm font-bold text-white">كيف يظهرون</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          {(d.sample || []).map((s: any, i: number) => (
            <div key={i} className="rounded-xl bg-gray-950/60 border border-gray-800 p-3 text-xs">
              <div className="font-bold text-white">{s.name}</div>
              <div className="text-sky-300 font-mono text-[11px]" dir="ltr">{s.phone}</div>
              <div className="mt-1.5 text-gray-400 whitespace-pre-line leading-relaxed text-[11px]">{s.note.join('\n')}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── أرقامٌ غير صالحة ── */}
      {d.invalidTotal > 0 && (
        <section className={card}>
          <h2 className="text-sm font-bold text-white">أرقامٌ غير صالحة ({n(d.invalidTotal)}) — خارج الدفتر حتّى تُصحَّح</h2>
          <p className="text-[11px] text-gray-500 mt-1">صحّح الرقم من ملفّ اللاعب فيدخل الدفتر في المزامنة التالية.</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {d.invalid.map((x: any, i: number) => (
              <a key={i} href={x.playerId ? `/admin/players/${x.playerId}` : undefined} className={`text-[11px] px-2 py-0.5 rounded-md border ${x.played ? 'border-amber-700/50 text-amber-200' : 'border-gray-800 text-gray-400'}`} title={x.played ? 'لعب' : 'لم يلعب'}>
                {x.name} <span className="font-mono text-gray-500" dir="ltr">{x.phone || '—'}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── آخر طلبات الهاتف (للتشخيص) ── */}
      <section className={card}>
        <button onClick={() => setShowLog(s => !s)} className="text-xs text-gray-400 hover:text-white">{showLog ? '▲' : '▼'} آخر اتّصالات الهواتف ({n((d.recent || []).length)}) — للتشخيص إن تعثّر الإعداد</button>
        {showLog && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[11px] font-mono" dir="ltr">
              <tbody>
                {(d.recent || []).map((r: any, i: number) => (
                  <tr key={i} className="border-t border-gray-800 text-gray-400">
                    <td className="px-2 py-1 whitespace-nowrap">{fmtDT(r.at)}</td><td className="px-2 py-1">{r.method}</td>
                    <td className="px-2 py-1">{r.path}</td><td className="px-2 py-1">{r.depth ?? ''}</td>
                    <td className={`px-2 py-1 ${r.status >= 400 ? 'text-rose-300' : 'text-emerald-300'}`}>{r.status}</td><td className="px-2 py-1">{r.user || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
