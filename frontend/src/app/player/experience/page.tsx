'use client';

// ══════════════════════════════════════════════════════
// 🌟 رأيك بتجربتك — تقييمٌ عامّ لنادي المافيا (لا لفعاليّةٍ بعينها)
// الحملة والأسئلة من /api/player-experience (backend/src/services/experience.service.ts).
// يصلها اللاعب من إشعار «رأيك يهمّنا» (data.url = /player/experience?c=ID).
// ══════════════════════════════════════════════════════

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePlayer } from '@/context/PlayerContext';

type QType = 'stars' | 'nps' | 'choice' | 'multi' | 'text';
interface Q { key: string; type: QType; label: string; hint?: string; section?: string; required?: boolean; options?: string[]; maxSelect?: number; placeholder?: string }
interface Campaign { id: number; title: string; intro: string; imageUrl: string | null; status: 'open' | 'closed'; questions: Q[] }

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const GOLD = '#C5A059';
const STAR_LABELS = ['سيّئة جداً', 'سيّئة', 'مقبولة', 'حلوة', 'ممتازة'];
const npsColor = (n: number) => (n <= 6 ? '#ef4444' : n <= 8 ? '#eab308' : '#22c55e');

function filled(q: Q, v: any): boolean {
  if (v == null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (q.type === 'text') return String(v).trim().length > 0;
  return true;
}

function ExperienceInner() {
  const { player } = usePlayer();
  const router = useRouter();
  const sp = useSearchParams();
  const cid = sp.get('c');
  const src = sp.get('src') || 'link';

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [textMax, setTextMax] = useState(2000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);          // أرسل (أو أرسل سابقاً ولم يطلب التعديل)
  const [hadResponse, setHadResponse] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);

  const headers = useCallback(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${player?.token}` }), [player]);

  useEffect(() => {
    if (!player) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/player-experience/current${cid ? `?c=${encodeURIComponent(cid)}` : ''}`, { headers: headers() });
        const d = await r.json();
        if (!alive) return;
        if (!d.success) { setError(d.error || 'تعذّر التحميل'); return; }
        setCampaign(d.campaign || null);
        if (d.textMax) setTextMax(d.textMax);
        if (d.response) { setAnswers(d.response.answers || {}); setHadResponse(true); setDone(true); }
      } catch { if (alive) setError('خطأ في الاتصال بالخادم'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [player, cid, headers]);

  const sections = useMemo(() => {
    const out: Array<{ title: string; qs: Q[] }> = [];
    for (const q of campaign?.questions || []) {
      const t = q.section || '';
      const last = out[out.length - 1];
      if (last && last.title === t) last.qs.push(q); else out.push({ title: t, qs: [q] });
    }
    return out;
  }, [campaign]);

  const missing = (campaign?.questions || []).filter(q => q.required && !filled(q, answers[q.key]));
  const answeredCount = (campaign?.questions || []).filter(q => filled(q, answers[q.key])).length;
  const set = (k: string, v: any) => setAnswers(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!campaign || missing.length || submitting) return;
    setSubmitting(true); setError('');
    try {
      const r = await fetch(`/api/player-experience/${campaign.id}`, { method: 'POST', headers: headers(), body: JSON.stringify({ answers, source: src }) });
      const d = await r.json();
      if (!r.ok || !d.success) { setError(d.error || 'تعذّر الإرسال'); return; }
      setHadResponse(true); setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch { setError('خطأ في الاتصال بالخادم'); }
    finally { setSubmitting(false); }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm" dir="rtl">جارِ التحميل…</div>;
  }

  const back = (
    <button onClick={() => router.push('/player/home')} className="text-gray-400 hover:text-white text-sm">◀ الرئيسية</button>
  );

  if (!campaign) {
    return (
      <div className="min-h-screen px-5 py-6" dir="rtl">
        {back}
        <div className="mt-24 text-center">
          <div className="text-5xl mb-3">🌟</div>
          <p className="text-white font-bold">لا يوجد استبيانٌ مفتوح حالياً</p>
          <p className="text-gray-500 text-sm mt-1">{error || 'شكراً لاهتمامك — رح نرجعلك قريباً'}</p>
        </div>
      </div>
    );
  }

  const intro = (
    <div className="rounded-3xl overflow-hidden border border-white/10 bg-[#0f0f0f]">
      {campaign.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${API_URL}${campaign.imageUrl}`} alt="" className="block w-full max-h-[340px] object-cover" />
      )}
      <div className="p-4">
        <h1 className="text-lg font-black text-white leading-snug">{campaign.title}</h1>
        {campaign.intro && (
          <>
            <div className={`relative mt-2 text-[14px] leading-7 text-gray-300 whitespace-pre-wrap ${introOpen ? '' : 'max-h-[8.5rem] overflow-hidden'}`}>
              {campaign.intro}
              {!introOpen && <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#0f0f0f] to-transparent" />}
            </div>
            <button onClick={() => setIntroOpen(o => !o)} className="mt-1 text-[13px] font-bold" style={{ color: GOLD }}>
              {introOpen ? 'إخفاء ▴' : 'اقرأ الرسالة كاملة ▾'}
            </button>
          </>
        )}
      </div>
    </div>
  );

  // ── شكراً (أرسل الآن أو سابقاً) ──
  if (done) {
    return (
      <div className="min-h-screen px-4 py-5 pb-28 max-w-xl mx-auto" dir="rtl">
        {back}
        <div className="mt-4">{intro}</div>
        <div className="mt-4 rounded-3xl border p-6 text-center" style={{ borderColor: `${GOLD}55`, background: `${GOLD}12` }}>
          <div className="text-5xl mb-2">🫶🏻</div>
          <p className="text-white text-lg font-black">وصلنا رأيك — شكراً إلك!</p>
          <p className="text-gray-300 text-sm mt-1 leading-6">كلّ كلمة كتبتها بتساعدنا نطوّر Mafia Club ونحافظ على روحه الحلوة.</p>
          {campaign.status === 'open' ? (
            <button onClick={() => setDone(false)} className="mt-4 px-5 py-2.5 rounded-xl text-sm font-bold border border-white/15 text-white hover:bg-white/5">✏️ عدّل رأيك</button>
          ) : (
            <p className="text-gray-500 text-xs mt-3">انتهى استقبال الآراء لهذا الاستبيان.</p>
          )}
        </div>
      </div>
    );
  }

  if (campaign.status !== 'open') {
    return (
      <div className="min-h-screen px-4 py-5 max-w-xl mx-auto" dir="rtl">
        {back}
        <div className="mt-4">{intro}</div>
        <p className="mt-6 text-center text-gray-400 text-sm">انتهى استقبال الآراء لهذا الاستبيان — شكراً لاهتمامك 🌟</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-5 pb-32 max-w-xl mx-auto" dir="rtl">
      {back}
      <div className="mt-4">{intro}</div>

      {sections.map((s, si) => (
        <section key={si} className="mt-6">
          {s.title && <h2 className="text-[13px] font-black mb-2.5" style={{ color: GOLD }}>{s.title}</h2>}
          <div className="flex flex-col gap-3">
            {s.qs.map(q => (
              <div key={q.key} className="rounded-2xl border border-white/10 bg-[#111] p-4">
                <p className="text-white text-[15px] font-bold leading-6">
                  {q.label}{q.required && <span className="text-rose-400 mr-1">*</span>}
                </p>
                {q.hint && <p className="text-gray-500 text-[12px] mt-0.5">{q.hint}</p>}

                {q.type === 'stars' && (
                  <div className="mt-3">
                    <div className="flex justify-between gap-1.5" dir="ltr">
                      {[1, 2, 3, 4, 5].map(n => {
                        const on = Number(answers[q.key]) >= n;
                        return (
                          <button key={n} type="button" onClick={() => set(q.key, n)} aria-label={`${n}`}
                            className="flex-1 aspect-square max-w-[58px] rounded-xl text-3xl transition-transform active:scale-90"
                            style={{ background: on ? `${GOLD}22` : '#1a1a1a', color: on ? GOLD : '#3a3a3a', border: `1px solid ${on ? `${GOLD}66` : '#262626'}` }}>
                            ★
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-center text-[12px] mt-1.5 h-4" style={{ color: GOLD }}>{answers[q.key] ? STAR_LABELS[answers[q.key] - 1] : ''}</p>
                  </div>
                )}

                {q.type === 'nps' && (
                  <div className="mt-3 grid grid-cols-11 gap-1" dir="ltr">
                    {Array.from({ length: 11 }, (_, n) => {
                      const on = answers[q.key] === n;
                      return (
                        <button key={n} type="button" onClick={() => set(q.key, n)}
                          className="h-10 rounded-lg text-sm font-black tabular-nums"
                          style={{ background: on ? npsColor(n) : '#1a1a1a', color: on ? '#000' : '#9ca3af', border: `1px solid ${on ? npsColor(n) : '#262626'}` }}>
                          {n}
                        </button>
                      );
                    })}
                  </div>
                )}

                {(q.type === 'choice' || q.type === 'multi') && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(q.options || []).map(o => {
                      const cur = answers[q.key];
                      const on = q.type === 'multi' ? Array.isArray(cur) && cur.includes(o) : cur === o;
                      const toggle = () => {
                        if (q.type === 'choice') { set(q.key, on ? undefined : o); return; }
                        const arr: string[] = Array.isArray(cur) ? cur : [];
                        if (on) set(q.key, arr.filter(x => x !== o));
                        else if (!q.maxSelect || arr.length < q.maxSelect) set(q.key, [...arr, o]);
                      };
                      return (
                        <button key={o} type="button" onClick={toggle}
                          className="px-3.5 py-2 rounded-full text-[13px] font-bold border transition-colors"
                          style={{ background: on ? `${GOLD}22` : '#161616', color: on ? GOLD : '#d1d5db', borderColor: on ? `${GOLD}88` : '#2a2a2a' }}>
                          {q.type === 'multi' && on ? '✓ ' : ''}{o}
                        </button>
                      );
                    })}
                  </div>
                )}

                {q.type === 'text' && (
                  <div className="mt-3">
                    <textarea value={answers[q.key] || ''} onChange={e => set(q.key, e.target.value.slice(0, textMax))}
                      rows={4} placeholder={q.placeholder || 'اكتب هون…'}
                      className="w-full bg-[#0b0b0b] border border-white/10 rounded-xl px-3 py-2.5 text-[14px] text-white leading-6 outline-none focus:border-[#C5A059]/60 resize-y" />
                    <p className="text-left text-[11px] text-gray-600 tabular-nums">{String(answers[q.key] || '').length} / {textMax}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {error && <p className="mt-4 text-center text-rose-400 text-sm">{error}</p>}

      {/* 🔴 فوق شريط التنقّل لا تحته: الشريطُ ثابتٌ أسفل الشاشة (z-50) وكان يغطّي الزرَّ كلَّه
             فلا يستطيع أحدٌ الإرسال — كلُّ ما يُثبَّت أسفلَ الشاشة يقيس من --nav-h (globals.css) */}
      <div className="fixed inset-x-0 z-40 px-4 pb-3 pt-3 bg-gradient-to-t from-black via-black/95 to-transparent" style={{ bottom: 'var(--nav-h)' }}>
        <div className="max-w-xl mx-auto">
          <button onClick={submit} disabled={!!missing.length || submitting}
            className="w-full py-3.5 rounded-2xl text-[15px] font-black text-black disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, #f6e7bd, ${GOLD})` }}>
            {submitting ? '⏳ جارِ الإرسال…' : missing.length ? `أجب على «${missing[0].label.slice(0, 26)}${missing[0].label.length > 26 ? '…' : ''}»` : hadResponse ? 'حفظ التعديل ❤️' : `أرسل رأيك ❤️ ${answeredCount ? `(${answeredCount})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ExperiencePage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ExperienceInner />
    </Suspense>
  );
}
