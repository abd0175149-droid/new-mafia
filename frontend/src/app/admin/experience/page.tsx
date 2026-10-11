'use client';

// ══════════════════════════════════════════════════════
// 🌟 رأي اللاعبين بتجربتهم — حملاتٌ عامّة (لا لفعاليّة): الرسالة والأسئلة، الإرسال، النتائج، الآراء
// الخادم: /api/experience (backend/src/routes/experience.routes.ts)
// ══════════════════════════════════════════════════════

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { swalAlert, swalConfirm, swalToast } from '@/lib/swal';

type QType = 'stars' | 'nps' | 'choice' | 'multi' | 'text';
interface Q { key: string; type: QType; label: string; hint?: string; section?: string; required?: boolean; options?: string[]; maxSelect?: number; placeholder?: string; enabled?: boolean }
interface Campaign { id: number; title: string; intro: string; imageUrl: string | null; questions: Q[]; status: 'draft' | 'open' | 'closed'; pushTitle: string | null; pushBody: string | null; sentAt: string | null; sentBy: string | null; sentCount: number; responses?: number }

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const PUSH_BODY_MAX = 400;   // مرآةٌ لما يقصّه fcm.service للجهاز — الصندوق والصفحة كاملان
const TYPE_AR: Record<QType, string> = { stars: '⭐ نجوم (١–٥)', nps: '🔢 ترشيح (٠–١٠)', choice: '🔘 اختيار واحد', multi: '☑️ اختيار متعدّد', text: '✍️ نصّ حرّ' };
const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'مسوّدة', cls: 'bg-gray-700/40 text-gray-300 border-gray-600' },
  open: { label: 'مفتوحة', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40' },
  closed: { label: 'مغلقة', cls: 'bg-rose-500/10 text-rose-300 border-rose-500/40' },
};
const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('ar-JO', { timeZone: 'Asia/Amman', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + '…');
const starColor = (v: number | null) => v == null ? '#6b7280' : v >= 4 ? '#22c55e' : v >= 3 ? '#eab308' : '#ef4444';

function useApi() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return useCallback(async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { const e: any = new Error(d.error || `HTTP ${res.status}`); e.code = d.code; e.body = d; throw e; }
    return d;
  }, [token]);
}

export default function ExperienceAdminPage() {
  return <Suspense fallback={<div className="p-6 text-gray-500 text-sm">جارِ التحميل…</div>}><ExperienceAdmin /></Suspense>;
}

function ExperienceAdmin() {
  const api = useApi();
  const sp = useSearchParams();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selId, setSelId] = useState<number | null>(sp.get('c') ? Number(sp.get('c')) : null);
  const [tab, setTab] = useState<'edit' | 'send' | 'results' | 'responses'>('edit');
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => {
    try {
      const d = await api('/api/experience/campaigns');
      setCampaigns(d.campaigns || []);
      setSelId(prev => prev ?? d.campaigns?.[0]?.id ?? null);
    } catch (e: any) { swalAlert(e.message, 'error'); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (sp.get('c')) setTab('responses'); }, [sp]);

  const sel = campaigns.find(c => c.id === selId) || null;

  const createNew = async () => {
    if (!(await swalConfirm('حملةٌ جديدة بالأسئلة الافتراضيّة — تبدأ مسوّدة لا يراها أحد.', { title: 'حملة جديدة؟', icon: 'question', confirmText: 'إنشاء' }))) return;
    try { const d = await api('/api/experience/campaigns', { method: 'POST' }); await loadList(); setSelId(d.campaign.id); setTab('edit'); }
    catch (e: any) { swalAlert(e.message, 'error'); }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-xl font-black text-white">🌟 رأي اللاعبين بتجربتهم</h1>
        <span className="text-xs text-gray-500">تقييمٌ عامّ لـMafia Club — لا لفعاليّةٍ بعينها</span>
        <button onClick={createNew} className="mr-auto px-3 py-1.5 rounded-xl text-xs font-bold border border-gray-700 text-gray-300 hover:text-white hover:border-amber-500/40">+ حملة جديدة</button>
      </div>

      {loading ? <p className="text-gray-500 text-sm">جارِ التحميل…</p> : !campaigns.length ? <p className="text-gray-500 text-sm">لا حملات.</p> : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {campaigns.map(c => (
              <button key={c.id} onClick={() => setSelId(c.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border text-right ${c.id === selId ? 'border-amber-500/50 bg-amber-500/10 text-amber-300' : 'border-gray-800 text-gray-400 hover:text-white'}`}>
                <span className="tabular-nums">#{c.id}</span> · {clip(c.title, 34)}
                <span className={`mr-2 px-1.5 py-0.5 rounded border text-[10px] ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span>
                <span className="mr-1 text-gray-500 tabular-nums">· {c.responses ?? 0} رأياً</span>
              </button>
            ))}
          </div>

          {sel && (
            <>
              <div className="flex flex-wrap gap-1.5 mb-4 border-b border-gray-800 pb-2">
                {([['edit', '📝 الرسالة والأسئلة'], ['send', '📣 الإرسال'], ['results', '📊 النتائج'], ['responses', '💬 الآراء']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setTab(k)}
                    className={`px-3.5 py-2 rounded-xl text-sm font-bold ${tab === k ? 'bg-amber-500/15 text-amber-300' : 'text-gray-400 hover:text-white'}`}>{l}</button>
                ))}
              </div>
              {tab === 'edit' && <EditTab key={`e${sel.id}`} campaign={sel} api={api} onSaved={loadList} />}
              {tab === 'send' && <SendTab key={`s${sel.id}`} campaign={sel} api={api} onSent={loadList} />}
              {tab === 'results' && <ResultsTab key={`r${sel.id}`} campaign={sel} api={api} />}
              {tab === 'responses' && <ResponsesTab key={`p${sel.id}`} campaign={sel} api={api} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 📝 الرسالة والأسئلة
// ══════════════════════════════════════════════════════
function EditTab({ campaign, api, onSaved }: { campaign: Campaign; api: ReturnType<typeof useApi>; onSaved: () => void }) {
  const [title, setTitle] = useState(campaign.title);
  const [intro, setIntro] = useState(campaign.intro);
  const [imageUrl, setImageUrl] = useState<string | null>(campaign.imageUrl);
  const [pushTitle, setPushTitle] = useState(campaign.pushTitle || '');
  const [pushBody, setPushBody] = useState(campaign.pushBody || '');
  const [qs, setQs] = useState<Q[]>(campaign.questions);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('media', file);
      const res = await fetch('/api/staff-notifications/upload-media', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, body: fd });
      const d = await res.json();
      if (!d.success || d.mediaType === 'video') throw new Error(d.error || 'صورةٌ فقط');
      setImageUrl(d.url);
    } catch (e: any) { swalAlert(e.message || 'فشل الرفع', 'error'); }
    finally { setUploading(false); }
  };

  const save = async (status?: string) => {
    setBusy(true);
    try {
      await api(`/api/experience/campaigns/${campaign.id}`, { method: 'PUT', body: JSON.stringify({ title, intro, imageUrl, pushTitle, pushBody, questions: qs, ...(status ? { status } : {}) }) });
      swalToast(status ? `الحملة ${STATUS[status].label} ✅` : 'حُفظ ✅', 'success');
      onSaved();
    } catch (e: any) { swalAlert(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const upd = (i: number, patch: Partial<Q>) => setQs(p => p.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: number) => setQs(p => { const a = [...p]; const j = i + d; if (j < 0 || j >= a.length) return p; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const addQ = (type: QType) => {
    let n = 1; while (qs.some(q => q.key === `q${n}`)) n++;
    setQs(p => [...p, { key: `q${n}`, type, label: 'سؤالٌ جديد', section: p[p.length - 1]?.section, enabled: true, ...(type === 'choice' || type === 'multi' ? { options: ['خيار ١', 'خيار ٢'] } : {}) }]);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-4 min-w-0">
        <Card title="الرسالة — رأسُ صفحة الاستبيان عند اللاعب">
          <Label>العنوان</Label>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} className={inputCls} />
          <Label>النصّ (يظهر كاملاً أعلى الصفحة)</Label>
          <textarea value={intro} onChange={e => setIntro(e.target.value)} rows={10} className={inputCls + ' leading-7'} />
          <Label>الصورة</Label>
          <div className="flex items-center gap-3">
            {imageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${API_URL}${imageUrl}`} alt="" className="w-24 h-24 object-cover rounded-xl border border-gray-700" />
                <button onClick={() => setImageUrl(null)} className="text-xs text-rose-300 hover:text-rose-200">× إزالة</button>
              </>
            ) : <span className="text-xs text-gray-500">بلا صورة</span>}
            <label className="mr-auto px-3 py-2 rounded-xl text-xs font-bold border border-gray-700 text-gray-300 hover:text-white cursor-pointer">
              {uploading ? '⏳ جارِ الرفع…' : imageUrl ? 'تغيير الصورة' : '🖼️ رفع صورة'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => upload(e.target.files?.[0])} />
            </label>
          </div>
          <p className="text-[11px] text-gray-500">تظهر في الإشعار (أندرويد وكروم)، وفي صندوق الإشعارات، وأعلى صفحة الاستبيان.</p>
        </Card>

        <Card title="الإشعار">
          <Label>عنوان الإشعار</Label>
          <input value={pushTitle} onChange={e => setPushTitle(e.target.value)} maxLength={200} placeholder={title} className={inputCls} />
          <Label>نصّ الإشعار</Label>
          <textarea value={pushBody} onChange={e => setPushBody(e.target.value)} rows={6} placeholder="فارغ ⇒ يُستعمل نصّ الرسالة" className={inputCls + ' leading-7'} />
          <p className="text-[11px] text-gray-500">على شاشة الجهاز يظهر أوّل {PUSH_BODY_MAX} حرف تقريباً (حدّ الإشعارات)؛ وفي صندوق الإشعارات داخل التطبيق يظهر النصّ كاملاً مع زرّ «✍️ اكتب رأيك».</p>
        </Card>

        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => save()} className="px-5 py-2.5 rounded-xl text-sm font-black text-black disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#fbbf24,#f59e0b)' }}>💾 حفظ</button>
          {campaign.status !== 'open' && <button disabled={busy} onClick={() => save('open')} className="px-4 py-2.5 rounded-xl text-sm font-bold border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10">فتح الاستقبال</button>}
          {campaign.status === 'open' && <button disabled={busy} onClick={async () => { if (await swalConfirm('لن يستطيع أحدٌ إرسال رأيٍ أو تعديله بعد الإغلاق.', { title: 'إغلاق الحملة؟', danger: true, confirmText: 'إغلاق' })) save('closed'); }} className="px-4 py-2.5 rounded-xl text-sm font-bold border border-rose-500/40 text-rose-300 hover:bg-rose-500/10">إغلاق الاستقبال</button>}
        </div>
      </div>

      <Card title={`الأسئلة (${qs.filter(q => q.enabled !== false).length} مفعّلاً)`}>
        <p className="text-[11px] text-gray-500 -mt-1">⭐ «التقييم العام» مطلوب. تعديلُ أسئلةٍ بعد وصول آراءٍ لا يمحو الإجابات القديمة، لكنّ إعادةَ تسمية سؤالٍ تغيّر معناه في النتائج.</p>
        <div className="space-y-2.5">
          {qs.map((q, i) => (
            <div key={q.key} className={`rounded-xl border p-3 space-y-2 ${q.enabled === false ? 'border-gray-800 opacity-50' : 'border-gray-700 bg-gray-950/40'}`}>
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                <span className="font-mono text-gray-500">{q.key}</span>
                <span>{TYPE_AR[q.type]}</span>
                <label className="flex items-center gap-1 mr-auto cursor-pointer"><input type="checkbox" className="accent-amber-500" checked={!!q.required} onChange={e => upd(i, { required: e.target.checked })} />مطلوب</label>
                <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" className="accent-amber-500" checked={q.enabled !== false} onChange={e => upd(i, { enabled: e.target.checked })} />مفعّل</label>
                <button onClick={() => move(i, -1)} className="px-1 hover:text-white">▲</button>
                <button onClick={() => move(i, 1)} className="px-1 hover:text-white">▼</button>
              </div>
              <input value={q.section || ''} onChange={e => upd(i, { section: e.target.value })} placeholder="القسم" className={inputCls + ' text-xs py-1.5'} />
              <input value={q.label} onChange={e => upd(i, { label: e.target.value })} className={inputCls + ' font-bold'} />
              <input value={q.hint || ''} onChange={e => upd(i, { hint: e.target.value })} placeholder="ملاحظة صغيرة تحت السؤال (اختياريّ)" className={inputCls + ' text-xs py-1.5'} />
              {(q.type === 'choice' || q.type === 'multi') && (
                <textarea value={(q.options || []).join('\n')} onChange={e => upd(i, { options: e.target.value.split('\n') })} rows={Math.max(2, (q.options || []).length)}
                  placeholder="خيارٌ في كلّ سطر" className={inputCls + ' text-xs'} />
              )}
              {q.type === 'text' && <input value={q.placeholder || ''} onChange={e => upd(i, { placeholder: e.target.value })} placeholder="نصٌّ داخل الحقل (اختياريّ)" className={inputCls + ' text-xs py-1.5'} />}
              {!['overall', 'nps', 'contact'].includes(q.key) && (
                <button onClick={async () => { if (await swalConfirm(`حذف «${q.label}»؟ الإجابات السابقة عليه تبقى في الملفّ المُصدَّر فقط.`, { title: 'حذف السؤال؟', danger: true, confirmText: 'حذف' })) setQs(p => p.filter((_, j) => j !== i)); }}
                  className="text-[11px] text-rose-300/80 hover:text-rose-300">🗑 حذف</button>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {(Object.keys(TYPE_AR) as QType[]).map(t => (
            <button key={t} onClick={() => addQ(t)} className="px-2.5 py-1.5 rounded-lg text-[11px] border border-gray-700 text-gray-300 hover:text-white">+ {TYPE_AR[t]}</button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 📣 الإرسال
// ══════════════════════════════════════════════════════
function SendTab({ campaign, api, onSent }: { campaign: Campaign; api: ReturnType<typeof useApi>; onSent: () => void }) {
  const [aud, setAud] = useState<{ players: number; withPush: number; devices: number } | null>(null);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/api/experience/audience').then(setAud).catch(() => {}); }, [api]);

  const title = (campaign.pushTitle || campaign.title || '').trim();
  const body = (campaign.pushBody || campaign.intro || '').trim();
  const empty = !body;

  const test = async () => {
    if (!phone.trim()) return;
    setBusy(true);
    try {
      const d = await api(`/api/experience/campaigns/${campaign.id}/send`, { method: 'POST', body: JSON.stringify({ test: { phone } }) });
      swalToast(`أُرسل إشعارٌ تجريبيّ إلى ${d.to} ✅`, 'success'); onSent();
    } catch (e: any) { swalAlert(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const sendAll = async () => {
    if (!aud) return;
    if (!(await swalConfirm(
      `سيصل الإشعار إلى ${aud.players} لاعباً في صندوق الإشعارات داخل التطبيق، ومنهم ${aud.withPush} على أجهزتهم مباشرةً (${aud.devices} جهازاً).\n\nالحملة تُفتح لاستقبال الآراء. لا يمكن سحبُ الإشعار بعد إرساله.`,
      { title: 'إرسال لكلّ اللاعبين؟', confirmText: 'أرسل الآن' },
    ))) return;
    setBusy(true);
    const send = (force: boolean) => api(`/api/experience/campaigns/${campaign.id}/send`, { method: 'POST', body: JSON.stringify({ confirm: true, ...(force ? { force: true } : {}) }) });
    try {
      let d: any;
      try { d = await send(false); }
      catch (e: any) {
        if (e.code !== 'ALREADY_SENT') throw e;
        if (!(await swalConfirm(`أُرسل إشعار هذه الحملة في ${fmt(e.body?.sentAt)} إلى ${e.body?.sentCount} لاعباً.\n\nإرسالٌ ثانٍ يصل الجميعَ مرّةً أخرى.`, { title: '⚠️ أُرسل من قبل', danger: true, confirmText: 'أرسل مرّة ثانية' }))) return;
        d = await send(true);
      }
      swalAlert(`✅ أُرسل إلى ${d.players} لاعباً (${d.withPush} على أجهزتهم) في ${Math.round((d.ms || 0) / 1000)} ثانية.`, 'success');
      onSent();
    } catch (e: any) { swalAlert(e.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-4">
        <Card title="الجمهور">
          {aud ? (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="كلّ اللاعبين (الصندوق)" value={aud.players} />
              <Stat label="يصلهم على الجهاز" value={aud.withPush} cls="text-emerald-300" />
              <Stat label="أجهزة" value={aud.devices} />
            </div>
          ) : <p className="text-xs text-gray-500">…</p>}
          <p className="text-[11px] text-gray-500">مَن لا جهازَ مسجّلاً له يرى الإشعار في الجرس داخل التطبيق عند فتحه.</p>
          {campaign.sentAt && <p className="text-[12px] text-amber-300">أُرسل في {fmt(campaign.sentAt)} بواسطة {campaign.sentBy || '—'} إلى {campaign.sentCount} لاعباً.</p>}
        </Card>

        <Card title="🧪 تجربة على هاتفٍ واحد أوّلاً">
          <div className="flex gap-2">
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="رقم هاتف لاعب (07…)" dir="ltr" className={inputCls + ' text-left'} />
            <button disabled={busy || !phone.trim() || empty} onClick={test} className="px-4 rounded-xl text-sm font-bold border border-gray-600 text-gray-200 hover:bg-gray-800 disabled:opacity-40 whitespace-nowrap">أرسل تجربة</button>
          </div>
          <p className="text-[11px] text-gray-500">يصل هذا اللاعبَ وحده — والمسوّدة تُفتح كي تفتح الصفحة عنده.</p>
        </Card>

        <button disabled={busy || empty || !aud} onClick={sendAll}
          className="w-full py-3.5 rounded-2xl text-[15px] font-black text-black disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#fbbf24,#f59e0b)' }}>
          {busy ? '⏳ جارِ الإرسال…' : `📣 أرسل لكلّ اللاعبين${aud ? ` (${aud.players})` : ''}`}
        </button>
        {empty && <p className="text-xs text-rose-300 text-center">النصّ فارغ — اكتبه في «الرسالة والأسئلة».</p>}
      </div>

      <div className="space-y-4">
        <Card title="معاينة: الإشعار على الجهاز">
          <div className="rounded-2xl bg-[#1f2937] p-3 flex gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">🎭</div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-bold truncate">{clip(title, 120)}</p>
              <p className="text-gray-300 text-[13px] leading-5 line-clamp-3">{clip(body, PUSH_BODY_MAX)}</p>
              {campaign.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${API_URL}${campaign.imageUrl}`} alt="" className="mt-2 w-full max-h-40 object-cover rounded-lg" />
              )}
            </div>
          </div>
          <p className="text-[11px] text-gray-500">الضغط عليه يفتح صفحة الاستبيان مباشرةً.</p>
        </Card>
        <Card title="معاينة: داخل التطبيق (صندوق الإشعارات)">
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#141414]">
            {campaign.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${API_URL}${campaign.imageUrl}`} alt="" className="w-full max-h-52 object-cover" />
            )}
            <div className="p-3">
              <p className="text-white font-bold text-sm">{title}</p>
              <p className="text-gray-300 text-[13px] leading-6 whitespace-pre-wrap mt-1 max-h-60 overflow-y-auto">{body}</p>
              <div className="mt-3 py-2.5 rounded-xl text-center text-sm font-bold text-black" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>✍️ اكتب رأيك</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 📊 النتائج
// ══════════════════════════════════════════════════════
function ResultsTab({ campaign, api }: { campaign: Campaign; api: ReturnType<typeof useApi> }) {
  const [s, setS] = useState<any>(null);
  useEffect(() => { api(`/api/experience/campaigns/${campaign.id}/summary`).then(d => setS(d.summary)).catch((e: any) => swalAlert(e.message, 'error')); }, [api, campaign.id]);
  if (!s) return <p className="text-gray-500 text-sm">جارِ التحميل…</p>;
  const overall = s.stars.find((x: any) => x.key === 'overall');
  const aspects = s.stars.filter((x: any) => x.key !== 'overall');
  const rate = s.notified ? Math.round((s.responses / s.notified) * 100) : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Stat label="آراء" value={s.responses} cls="text-amber-300" />
        <Stat label="وصلهم الإشعار" value={s.notified} />
        <Stat label="فتحوه" value={s.opened} />
        <Stat label="نسبة الاستجابة" value={rate == null ? '—' : `${rate}٪`} />
        <Stat label="يقبلون التواصل" value={s.contactYes} />
      </div>
      {!s.responses ? <p className="text-gray-500 text-sm">لا آراء بعد.</p> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="التقييم العام">
            <div className="flex items-center gap-4">
              <div className="text-5xl font-black tabular-nums" style={{ color: starColor(overall?.avg ?? null) }}>{overall?.avg ?? '—'}</div>
              <div className="text-xs text-gray-400">من ٥ · {overall?.n ?? 0} تقييماً</div>
            </div>
            {overall && <Dist dist={overall.dist} labels={['١', '٢', '٣', '٤', '٥']} colors={['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e']} />}
          </Card>
          {s.nps && (
            <Card title="مؤشّر الترشيح (NPS)">
              <div className="flex items-center gap-4">
                <div className="text-5xl font-black tabular-nums" style={{ color: s.nps.score == null ? '#6b7280' : s.nps.score >= 30 ? '#22c55e' : s.nps.score >= 0 ? '#eab308' : '#ef4444' }}>{s.nps.score ?? '—'}</div>
                <div className="text-xs text-gray-400 leading-5">مروّجون (٩–١٠): {s.nps.promoters}<br />محايدون (٧–٨): {s.nps.passives}<br />منتقدون (٠–٦): {s.nps.detractors}</div>
              </div>
              <Dist dist={s.nps.dist} labels={Array.from({ length: 11 }, (_, i) => String(i))} colors={Array.from({ length: 11 }, (_, i) => (i <= 6 ? '#ef4444' : i <= 8 ? '#eab308' : '#22c55e'))} />
            </Card>
          )}
          <Card title="الجوانب">
            <div className="space-y-2.5">
              {aspects.map((a: any) => (
                <div key={a.key}>
                  <div className="flex justify-between text-xs"><span className="text-gray-300">{a.label}</span><span className="tabular-nums font-bold" style={{ color: starColor(a.avg) }}>{a.avg ?? '—'} <span className="text-gray-500 font-normal">({a.n})</span></span></div>
                  <div className="h-2 rounded-full bg-gray-800 overflow-hidden mt-1"><div className="h-full rounded-full" style={{ width: `${((a.avg || 0) / 5) * 100}%`, background: starColor(a.avg) }} /></div>
                </div>
              ))}
            </div>
          </Card>
          {s.choices.map((c: any) => (
            <Card key={c.key} title={c.label}>
              <div className="space-y-2">
                {[...c.options].sort((a: any, b: any) => b.count - a.count).map((o: any) => (
                  <div key={o.label}>
                    <div className="flex justify-between text-xs"><span className="text-gray-300">{o.label}</span><span className="tabular-nums text-gray-400">{o.count} · {c.answered ? Math.round((o.count / c.answered) * 100) : 0}٪</span></div>
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden mt-1"><div className="h-full rounded-full bg-amber-500/70" style={{ width: `${c.answered ? (o.count / c.answered) * 100 : 0}%` }} /></div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
          <Card title="الإجابات النصّيّة">
            {s.texts.map((t: any) => <p key={t.key} className="text-xs text-gray-300 flex justify-between"><span>{t.label}</span><span className="tabular-nums text-amber-300">{t.count}</span></p>)}
            <p className="text-[11px] text-gray-500">تقرؤها كاملةً في «💬 الآراء».</p>
          </Card>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 💬 الآراء
// ══════════════════════════════════════════════════════
const FILTERS = [['', 'الكلّ'], ['text', 'فيها نصّ'], ['concerns', '⚠️ مواقف'], ['low', 'منخفض (١–٢)'], ['high', 'مرتفع (٤–٥)'], ['contact', 'يقبل التواصل']] as const;
function ResponsesTab({ campaign, api }: { campaign: Campaign; api: ReturnType<typeof useApi> }) {
  const [filter, setFilter] = useState('');
  const [qIn, setQIn] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [d, setD] = useState<any>(null);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { const t = setTimeout(() => { setQ(qIn.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [qIn]);
  useEffect(() => {
    const qs = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (filter) qs.set('filter', filter);
    if (q) qs.set('q', q);
    api(`/api/experience/campaigns/${campaign.id}/responses?${qs}`).then(setD).catch((e: any) => swalAlert(e.message, 'error'));
  }, [api, campaign.id, filter, q, page]);
  const questions = useMemo(() => campaign.questions.filter(x => x.enabled !== false), [campaign]);
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;

  const exportCsv = async () => {
    const res = await fetch(`/api/experience/campaigns/${campaign.id}/export.csv`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
    const blob = await res.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `experience-${campaign.id}.csv`; a.click();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([k, l]) => (
          <button key={k || 'all'} onClick={() => { setFilter(k); setPage(1); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${filter === k ? 'bg-amber-500/10 text-amber-400 border-amber-500/40' : 'border-gray-800 text-gray-400 hover:text-white'}`}>{l}</button>
        ))}
        <input value={qIn} onChange={e => setQIn(e.target.value)} placeholder="ابحث في الاسم أو الرقم أو النصّ" className={inputCls + ' max-w-xs text-xs py-1.5'} />
        <button onClick={exportCsv} className="mr-auto px-3 py-1.5 rounded-xl text-xs font-bold border border-gray-700 text-gray-300 hover:text-white">⬇️ تصدير CSV</button>
      </div>
      {!d ? <p className="text-gray-500 text-sm">جارِ التحميل…</p> : !d.rows.length ? <p className="text-gray-500 text-sm py-6 text-center">لا آراء تطابق.</p> : (
        <div className="rounded-xl border border-gray-800 divide-y divide-gray-800 overflow-hidden">
          {d.rows.map((r: any) => {
            const isOpen = open === r.id;
            const firstText = ['improve', 'ideas', 'concerns'].map(k => r.answers?.[k]).find(Boolean);
            return (
              <div key={r.id} className={isOpen ? 'bg-gray-950/50' : ''}>
                <button onClick={() => setOpen(isOpen ? null : r.id)} className="w-full text-right px-3 py-3 flex items-center gap-3 hover:bg-gray-800/30">
                  <span className="text-lg font-black tabular-nums w-8 text-center" style={{ color: starColor(r.overall) }}>{r.overall ?? '—'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-white font-bold truncate">{r.name}{r.answers?.concerns && <span className="text-rose-300 text-[11px] mr-2">⚠️ موقف</span>}{r.allowContact && <span className="text-sky-300 text-[11px] mr-2">📞 يقبل التواصل</span>}</span>
                    <span className="block text-[12px] text-gray-400 truncate">{firstText || '—'}</span>
                  </span>
                  <span className="text-[11px] text-gray-500 whitespace-nowrap">{fmt(r.submittedAt)}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-2 text-sm">
                    <div className="flex flex-wrap gap-3 text-[12px] text-gray-400">
                      <a href={`/admin/players/${r.playerId}`} target="_blank" rel="noreferrer" className="text-amber-300 hover:underline">👤 ملفّ اللاعب ↗</a>
                      <span dir="ltr">{r.phone}</span>
                      {r.updatedAt && r.updatedAt !== r.submittedAt && <span>عُدّل {fmt(r.updatedAt)}</span>}
                    </div>
                    {questions.map(qq => {
                      const v = r.answers?.[qq.key];
                      if (v == null || v === '' || (Array.isArray(v) && !v.length)) return null;
                      return (
                        <div key={qq.key} className="rounded-lg bg-gray-900/70 border border-gray-800 px-3 py-2">
                          <p className="text-[11px] text-gray-500">{qq.label}</p>
                          <p className="text-gray-100 whitespace-pre-wrap leading-6">
                            {qq.type === 'stars' ? `${'★'.repeat(v)}${'☆'.repeat(5 - v)}  (${v}/5)` : qq.type === 'nps' ? `${v} / 10` : Array.isArray(v) ? v.join(' · ') : String(v)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {d && d.total > d.pageSize && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500 tabular-nums">{(page - 1) * d.pageSize + 1}–{Math.min(d.total, page * d.pageSize)} من {d.total}</span>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="mr-auto px-2.5 py-1 rounded-lg border border-gray-800 text-gray-300 disabled:opacity-30">السابق</button>
          <span className="tabular-nums text-gray-400">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="px-2.5 py-1 rounded-lg border border-gray-800 text-gray-300 disabled:opacity-30">التالي</button>
        </div>
      )}
    </div>
  );
}

// ── عناصر صغيرة ──
const inputCls = 'w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50';
function Card({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 space-y-2.5"><h3 className="text-sm font-bold text-white">{title}</h3>{children}</div>;
}
function Label({ children }: { children: ReactNode }) { return <p className="text-[11px] text-gray-400 font-bold">{children}</p>; }
function Stat({ label, value, cls = 'text-white' }: { label: string; value: ReactNode; cls?: string }) {
  return <div className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"><div className="text-[10.5px] text-gray-500">{label}</div><div className={`text-lg font-black tabular-nums ${cls}`}>{value}</div></div>;
}
function Dist({ dist, labels, colors }: { dist: number[]; labels: string[]; colors: string[] }) {
  const max = Math.max(1, ...dist);
  return (
    <div className="flex items-end gap-1 h-20 mt-2" dir="ltr">
      {dist.map((n, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[10px] text-gray-400 tabular-nums">{n || ''}</span>
          <div className="w-full rounded-t" style={{ height: `${(n / max) * 52}px`, background: colors[i], opacity: n ? 0.85 : 0.15, minHeight: 2 }} />
          <span className="text-[10px] text-gray-500">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}
