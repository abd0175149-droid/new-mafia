'use client';

// ══════════════════════════════════════════════════════
// 📝 محرّر أسئلة الاستبيان — الأسئلة بياناتٌ لا شيفرة
// ══════════════════════════════════════════════════════
// كانت الأسئلة ثابتةً في الشيفرة وأعمدةً في الجدول، فلا تُحرَّر إلّا بنشرة.
// هنا تُحرَّر، وبمعاينةٍ حيّة لفقاعة الواتساب كما ستصل العميل — لأنّ قيود
// واتساب (ثلاثة أزرارٍ بعنوانٍ ≤٢٠ حرفاً) لا تُكتشف إلّا بعد وصول رسالةٍ
// مكسورة، ما لم تُعرض هنا.

import { useCallback, useEffect, useState } from 'react';
import { swalConfirm, swalToast, swalAlert } from '@/lib/swal';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;
interface Opt { label: string; score: number }
interface Q {
  id: number; key: string; text: string;
  type: 'scale' | 'likert' | 'text';
  channel: 'app' | 'wa' | 'both';
  options: Opt[]; sortOrder: number; enabled: boolean; column: string | null;
}
interface S {
  enabled: boolean; delayMin: number; validHours: number; onceHours: number;
  lowThreshold: number; notePrompt: string; maxWaQuestions: number;
}

const TYPES: Record<Q['type'], string> = { scale: 'خيارات مخصّصة', likert: 'مقياس ١–٥', text: 'نصّ حرّ' };
const CH: Record<Q['channel'], string> = { both: 'الاثنتان', wa: 'واتساب فقط', app: 'التطبيق فقط' };

export default function SurveyQuestions({ apiFetch }: { apiFetch: Fetcher }) {
  const [qs, setQs] = useState<Q[]>([]);
  const [st, setSt] = useState<S | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [draft, setDraft] = useState<Q | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch('/api/feedback/questions');
      setQs(d.questions || []);
      setSt(d.settings || null);
      setErr(null);
    } catch (e: any) { setErr(e.message); }
  }, [apiFetch]);
  useEffect(() => { load(); }, [load]);

  const pick = (q: Q) => { setSel(q.id); setDraft({ ...q, options: (q.options || []).map(o => ({ ...o })) }); };

  const saveQ = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const body = JSON.stringify({
        text: draft.text, type: draft.type, channel: draft.channel,
        options: draft.options, sortOrder: draft.sortOrder, enabled: draft.enabled,
      });
      if (draft.id > 0) await apiFetch(`/api/feedback/questions/${draft.id}`, { method: 'PUT', body });
      else await apiFetch('/api/feedback/questions', { method: 'POST', body });
      swalToast('حُفظ السؤال ✅', 'success');
      setSel(null); setDraft(null);
      load();
    } catch (e: any) { swalAlert(e.message || 'تعذّر الحفظ'); }
    finally { setBusy(false); }
  };

  const retire = async (q: Q) => {
    const ok = await swalConfirm(
      `سيختفي «${q.text.slice(0, 40)}…» من الاستبيان.\n\nلا يُحذف حذفاً: إجاباتُه المحفوظة تبقى، لأنّ حذف نصّ السؤال يجعل أرقامه بلا معنى.`,
      { title: '🗄️ تقاعُد السؤال؟', confirmText: 'أخرجه', danger: true },
    );
    if (!ok) return;
    try { await apiFetch(`/api/feedback/questions/${q.id}`, { method: 'DELETE' }); swalToast('تقاعد السؤال', 'success'); setSel(null); setDraft(null); load(); }
    catch (e: any) { swalAlert(e.message); }
  };

  const toggle = async (q: Q) => {
    try {
      await apiFetch(`/api/feedback/questions/${q.id}`, {
        method: 'PUT',
        body: JSON.stringify({ text: q.text, type: q.type, channel: q.channel, options: q.options, sortOrder: q.sortOrder, enabled: !q.enabled }),
      });
      load();
    } catch (e: any) { swalAlert(e.message); }
  };

  const saveSettings = async (patch: Partial<S>) => {
    if (!st) return;
    const next = { ...st, ...patch };
    setSt(next);
    try { await apiFetch('/api/feedback/survey-settings', { method: 'PUT', body: JSON.stringify(next) }); }
    catch (e: any) { swalAlert(e.message); }
  };

  const addNew = () => {
    setSel(-1);
    setDraft({
      id: -1, key: '', text: '', type: 'scale', channel: 'app', enabled: true,
      sortOrder: (qs.reduce((m, q) => Math.max(m, q.sortOrder), 0) || 100) + 10, column: null,
      options: [{ label: 'ممتاز', score: 5 }, { label: 'عادي', score: 3 }, { label: 'سيّئ', score: 1 }],
    });
  };

  if (err) return <p className="text-sm text-rose-400 p-4">⚠️ {err}</p>;
  if (!st) return <p className="text-sm text-gray-500 p-4">جاري التحميل…</p>;

  const waList = qs.filter(q => q.enabled && q.channel !== 'app' && q.type !== 'text').slice(0, st.maxWaQuestions);
  const overLimit = qs.filter(q => q.enabled && q.channel !== 'app' && q.type !== 'text').length - waList.length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_330px] gap-3" dir="rtl">
      {/* ── الأسئلة ── */}
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-bold text-white">الأسئلة</h3>
          <span className="text-[11px] text-gray-500">
            {qs.filter(q => q.enabled).length} مفعَّلاً · {waList.length} على الواتساب
          </span>
          <button onClick={addNew} className="mr-auto text-[11.5px] font-bold border border-gray-700 hover:border-amber-500 hover:text-amber-400 text-gray-300 rounded-lg px-3 py-1.5">
            + سؤال جديد
          </button>
        </div>

        {qs.map(q => (
          <div
            key={q.id}
            onClick={() => pick(q)}
            className={`grid grid-cols-[1fr_auto] gap-2 items-center rounded-xl border p-2.5 cursor-pointer transition-colors ${
              sel === q.id ? 'border-amber-500 bg-amber-500/5' : 'border-gray-800 bg-gray-900/60 hover:border-gray-700'
            } ${q.enabled ? '' : 'opacity-50'}`}
          >
            <div className="min-w-0">
              <div className="text-[12.5px] text-gray-100 truncate">{q.text}</div>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                <span className="text-[9px] font-bold rounded-full px-1.5 py-px bg-violet-500/15 text-violet-300">{TYPES[q.type]}</span>
                {q.channel !== 'app' && <span className="text-[9px] font-bold rounded-full px-1.5 py-px bg-emerald-500/15 text-emerald-300">واتساب</span>}
                {q.channel !== 'wa' && <span className="text-[9px] font-bold rounded-full px-1.5 py-px bg-sky-500/15 text-sky-300">التطبيق</span>}
                {q.column && <span className="text-[9px] font-bold rounded-full px-1.5 py-px bg-amber-500/12 text-amber-400">عمود {q.column}</span>}
              </div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); toggle(q); }}
              className={`w-9 h-5 rounded-full relative shrink-0 transition-colors ${q.enabled ? 'bg-emerald-500' : 'bg-gray-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${q.enabled ? 'right-0.5' : 'right-4'}`} />
            </button>
          </div>
        ))}

        {/* ── المحرّر ── */}
        {draft && (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3 mt-3">
            <h4 className="text-[13px] font-bold mb-2.5">✏️ {draft.id > 0 ? 'تعديل السؤال' : 'سؤال جديد'}</h4>

            <label className="block mb-2.5">
              <span className="block text-[10.5px] text-gray-500 mb-1">
                نصّ السؤال {draft.channel !== 'app' && <>· <code className="text-amber-400">{'{الفعاليّة}'}</code> تُستبدل باسمها</>}
              </span>
              <textarea
                rows={2} value={draft.text}
                onChange={e => setDraft({ ...draft, text: e.target.value })}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-2 text-[12.5px] text-white focus:border-amber-500 outline-none resize-y"
              />
            </label>

            <div className="grid grid-cols-2 gap-2 mb-2.5">
              <label className="block">
                <span className="block text-[10.5px] text-gray-500 mb-1">النوع</span>
                <select
                  value={draft.type}
                  onChange={e => {
                    const type = e.target.value as Q['type'];
                    setDraft({ ...draft, type, options: type === 'scale' && !draft.options.length
                      ? [{ label: 'ممتاز', score: 5 }, { label: 'عادي', score: 3 }, { label: 'سيّئ', score: 1 }] : draft.options });
                  }}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-white focus:border-amber-500 outline-none"
                >
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-[10.5px] text-gray-500 mb-1">القناة</span>
                <select
                  value={draft.channel}
                  onChange={e => setDraft({ ...draft, channel: e.target.value as Q['channel'] })}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-white focus:border-amber-500 outline-none"
                >
                  {Object.entries(CH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>

            {draft.type === 'scale' && (
              <div className="mb-2.5">
                <span className="block text-[10.5px] text-gray-500 mb-1">الخيارات ودرجةُ كلٍّ منها (١–٥)</span>
                <div className="space-y-1.5">
                  {draft.options.map((o, j) => (
                    <div key={j} className="grid grid-cols-[1fr_64px_auto] gap-1.5">
                      <input
                        value={o.label}
                        onChange={e => setDraft({ ...draft, options: draft.options.map((x, k) => k === j ? { ...x, label: e.target.value } : x) })}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-white focus:border-amber-500 outline-none"
                      />
                      <input
                        value={o.score} type="number" min={1} max={5}
                        onChange={e => setDraft({ ...draft, options: draft.options.map((x, k) => k === j ? { ...x, score: parseInt(e.target.value) || 1 } : x) })}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-white focus:border-amber-500 outline-none"
                      />
                      <button onClick={() => setDraft({ ...draft, options: draft.options.filter((_, k) => k !== j) })}
                        className="text-gray-600 hover:text-rose-400 px-1.5 text-xs">✕</button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setDraft({ ...draft, options: [...draft.options, { label: 'خيار', score: 3 }] })}
                  className="text-[11px] text-gray-500 hover:text-white border border-gray-800 rounded-lg px-2.5 py-1 mt-1.5">+ خيار</button>

                {draft.channel !== 'app' && draft.options.length > 3 && (
                  <div className="mt-2 text-[11px] leading-relaxed rounded-lg px-2.5 py-2 bg-emerald-500/[0.06] border border-emerald-500/30 text-emerald-200">
                    أكثر من ثلاثة خيارات ⇒ يُرسل <b>قائمةً تفاعليّة</b> تلقائيّاً (تحتمل عشرة). نقرةٌ إضافيّة للعميل، ومقياسٌ كامل لك.
                  </div>
                )}
                {draft.channel !== 'app' && draft.options.some(o => o.label.length > 20) && (
                  <div className="mt-2 text-[11px] leading-relaxed rounded-lg px-2.5 py-2 bg-rose-500/[0.07] border border-rose-500/35 text-rose-200">
                    عنوانُ خيارٍ يتجاوز ٢٠ حرفاً — واتساب يقصّه في الأزرار. قصّره أو أضف خياراً رابعاً ليصير قائمة.
                  </div>
                )}
              </div>
            )}

            {draft.column && (
              <div className="mb-2.5 text-[11px] leading-relaxed rounded-lg px-2.5 py-2 bg-amber-500/[0.07] border border-amber-500/35 text-amber-200">
                مربوطٌ بعمود <b>{draft.column}</b> القائم. تغييرُ نصّه يُبقي التاريخ لكنّه <b>يخلط سؤالين في متوسّطٍ واحد</b> —
                الأنسب إطفاؤه وإنشاء سؤالٍ جديد.
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={saveQ} disabled={busy || !draft.text.trim()}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-gray-950 font-bold rounded-lg py-2 text-xs">
                {busy ? '…' : '💾 حفظ'}
              </button>
              <button onClick={() => { setSel(null); setDraft(null); }}
                className="border border-gray-700 text-gray-400 hover:text-white rounded-lg px-3 text-xs">إلغاء</button>
              {draft.id > 0 && (
                <button onClick={() => retire(draft)} className="border border-gray-700 text-gray-500 hover:text-rose-400 rounded-lg px-3 text-xs">🗄️ تقاعُد</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── المعاينة والإعدادات ── */}
      <div className="min-w-0 space-y-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
          <h4 className="text-[13px] font-bold mb-2">📱 كما تصل العميل</h4>
          <div className="rounded-xl p-2.5" style={{ background: '#0B141A', border: '1px solid #223038' }}>
            {waList.length === 0 ? (
              <p className="text-[11.5px] text-gray-500 m-0">لا سؤال على الواتساب — لن تُرسل رسالة.</p>
            ) : waList.map((q, i) => {
              const opts = q.type === 'scale' && q.options.length ? q.options : [{ label: '٥', score: 5 }, { label: '٤', score: 4 }, { label: '٣', score: 3 }, { label: '٢', score: 2 }, { label: '١', score: 1 }];
              return (
                <div key={q.id} className="rounded-lg px-2.5 py-2 mb-1.5 text-[12px] leading-relaxed"
                  style={{ background: '#1F2C33', borderTopRightRadius: 3 }}>
                  {q.text.replace('{الفعاليّة}', 'مزاج افندينا')}{waList.length > 1 ? ` (${i + 1}/${waList.length})` : ''}
                  {opts.length <= 3 ? (
                    <div className="mt-1.5 space-y-1">
                      {opts.map((o, j) => (
                        <div key={j} className="text-center rounded-md py-1 text-[11.5px]" style={{ background: '#1F2C33', border: '1px solid #2a3942', color: '#53BDEB' }}>{o.label}</div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="mt-1.5 text-center rounded-md py-1 text-[11.5px]" style={{ background: '#1F2C33', border: '1px solid #2a3942', color: '#53BDEB' }}>📋 اختر تقييمك</div>
                      <div className="mt-1 rounded-md overflow-hidden" style={{ border: '1px solid #2a3942' }}>
                        {opts.slice(0, 10).map((o, j) => (
                          <div key={j} className="px-2 py-1 text-[11px]" style={{ background: '#131E24', color: '#d6e2e7', borderBottom: j < opts.length - 1 ? '1px solid #2a3942' : '0' }}>{o.label}</div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {overLimit > 0 && (
            <p className="text-[10.5px] text-amber-400/90 mt-2 leading-relaxed">
              ⚠️ {overLimit} سؤالاً إضافيّاً على قناة الواتساب لن يُرسل: السقف {st.maxWaQuestions}.
            </p>
          )}
          <p className="text-[10.5px] text-gray-600 mt-2 leading-relaxed">
            تُرسل بعد {st.delayMin} دقيقة من إغلاق الغرفة، <b>ولمن نافذته مفتوحة فقط</b> —
            ومن لا نافذة له يصله إشعار التطبيق بدلاً منها.
          </p>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
          <h4 className="text-[13px] font-bold mb-2">⏱️ الإرسال</h4>
          {([
            ['enabled', 'رسالة الواتساب مفعّلة', 'toggle'],
            ['delayMin', 'تُرسل بعد (دقيقة)', 'num'],
            ['validHours', 'تبطل بعد (ساعة)', 'num'],
            ['onceHours', 'مرّة لكلّ لاعب كلّ (ساعة)', 'num'],
            ['maxWaQuestions', 'سقف أسئلة الواتساب', 'num'],
            ['lowThreshold', 'تنبيهٌ عند تقييم ≤', 'num'],
          ] as const).map(([k, label, kind]) => (
            <div key={k} className="flex items-center justify-between gap-2 py-1.5 border-b border-dashed border-gray-800 last:border-0">
              <span className="text-[11.5px] text-gray-400">{label}</span>
              {kind === 'toggle' ? (
                <button onClick={() => saveSettings({ enabled: !st.enabled } as any)}
                  className={`w-9 h-5 rounded-full relative shrink-0 ${st.enabled ? 'bg-emerald-500' : 'bg-gray-700'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${st.enabled ? 'right-0.5' : 'right-4'}`} />
                </button>
              ) : (
                <input
                  type="number" value={(st as any)[k]}
                  onChange={e => setSt({ ...st, [k]: parseInt(e.target.value) || 0 } as S)}
                  onBlur={e => saveSettings({ [k]: parseInt(e.target.value) || 0 } as any)}
                  className="w-16 bg-gray-950 border border-gray-800 rounded-lg px-2 py-1 text-xs text-white text-center focus:border-amber-500 outline-none"
                />
              )}
            </div>
          ))}
          <label className="block mt-2">
            <span className="block text-[10.5px] text-gray-500 mb-1">نصّ طلب الملاحظة بعد التقييم</span>
            <input
              value={st.notePrompt}
              onChange={e => setSt({ ...st, notePrompt: e.target.value })}
              onBlur={e => saveSettings({ notePrompt: e.target.value })}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-500 outline-none"
            />
          </label>
          <p className="text-[10.5px] text-gray-600 mt-2 leading-relaxed">
            السقفُ الأقصى لأسئلة الواتساب أربعة، و«مرّة كلّ» لا تتجاوز ٢٤ ساعة —
            مفتاحُ «أُرسل له» يعيش يوماً واحداً، وقيمةٌ أكبر تَعِد بما لا يقع.
          </p>
        </div>
      </div>
    </div>
  );
}
