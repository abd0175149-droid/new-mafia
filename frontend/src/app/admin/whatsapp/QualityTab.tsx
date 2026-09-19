'use client';

// ══════════════════════════════════════════════════════
// 📈 تبويب الجودة — هل يؤدّي الدون عمله؟ (الكلفة في تبويب البوت)
// قمع الحجز والرسائل من wa_messages (التاريخ كلّه)؛ زمن الردّ والأعلام تُقاس منذ 2026-09-19 فقط.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;
const n = (x: number) => Number(x || 0).toLocaleString('ar-JO');
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}٪` : '—');
const secs = (ms: number | null) => (ms == null ? '—' : ms < 60000 ? `${(ms / 1000).toFixed(1)} ث` : `${Math.round(ms / 60000)} د`);
const fmt = (iso: string) => new Date(iso).toLocaleString('ar-JO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' });
const KIND: Record<string, { label: string; cls: string }> = {
  unknown: { label: 'بلا جواب', cls: 'bg-amber-500/10 text-amber-300' },
  handoff: { label: 'حُوّل لموظّف', cls: 'bg-sky-500/10 text-sky-300' },
  fail: { label: 'عطل', cls: 'bg-rose-500/10 text-rose-300' },
};

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const c = tone === 'good' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : tone === 'bad' ? 'text-rose-300' : 'text-white';
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`text-2xl font-black tabular-nums ${c}`}>{value}</div>
      {hint && <div className="text-[11px] text-gray-500 leading-snug">{hint}</div>}
    </div>
  );
}

export default function QualityTab({ apiFetch, onOpenConv }: { apiFetch: Fetcher; onOpenConv: (id: number) => void }) {
  const [days, setDays] = useState(30);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setD(await apiFetch(`/api/whatsapp/bot/quality?days=${days}`)); setErr(null); } catch (e: any) { setErr(e.message); }
  }, [apiFetch, days]);
  useEffect(() => { setD(null); load(); }, [load]);

  if (err) return <p className="text-sm text-rose-400 p-4">⚠️ {err}</p>;
  if (!d) return <p className="text-sm text-gray-500 p-4">جاري التحميل…</p>;

  const f = d.funnel, r = d.replies, m = d.messages;
  const steps = [
    { label: 'راسلونا', v: f.talked, hint: 'محادثات وصلتنا منها رسالة' },
    { label: 'رأوا قائمة الفعاليّات', v: f.listed, hint: 'أبدوا نيّة حجز' },
    { label: 'وصلوا لزرّ التأكيد', v: f.askedToConfirm, hint: 'اختاروا فعاليّة وعدداً' },
    { label: 'ضغطوا «أكّد»', v: f.confirmed, hint: 'الحجز لا يُنشأ إلا بهذه الضغطة' },
  ];
  const max = Math.max(1, ...steps.map(s => s.v));
  const weekly: any[] = d.loyaltyWeekly || [];
  const wMax = Math.max(1, ...weekly.map(w => w.bookings));
  const measured = r.p50Ms != null;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-white">جودة الدون</h2>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 text-xs mr-auto">
          {[7, 30, 90].map(x => (
            <button key={x} onClick={() => setDays(x)} className={`px-2.5 py-1 rounded-lg font-bold ${days === x ? 'bg-amber-500/10 text-amber-400' : 'text-gray-400 hover:text-white'}`}>{n(x)} يوماً</button>
          ))}
        </div>
      </div>

      {/* ── القمع ── */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
        <h3 className="text-sm font-bold text-white">قمع الحجز</h3>
        <p className="text-[11px] text-gray-500 mb-3">أين يتسرّب الناس بين «مرحبا» والحجز المؤكَّد. كلّ رقم = عدد محادثات.</p>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={s.label} className="grid grid-cols-[140px_1fr_auto] sm:grid-cols-[190px_1fr_auto] items-center gap-3">
              <div className="min-w-0">
                <div className="text-xs text-gray-200 truncate">{s.label}</div>
                <div className="text-[10.5px] text-gray-500 truncate">{s.hint}</div>
              </div>
              <div className="h-6 rounded-md bg-gray-800/70 overflow-hidden">
                <div className="h-full rounded-md" style={{ width: `${Math.max(2, (s.v / max) * 100)}%`, background: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }} />
              </div>
              <div className="text-sm font-bold text-white tabular-nums w-20 text-left">
                {n(s.v)} {i > 0 && <span className="text-[11px] font-normal text-gray-500">{pct(s.v, steps[i - 1].v)}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-gray-800 flex flex-wrap gap-x-8 gap-y-2">
          <Stat label="حجوزات أنشأها البوت" value={n(f.reservations)} hint={`${n(f.people)} شخصاً`} tone="good" />
          <Stat label="منها على قائمة الانتظار" value={n(f.waitlist)} />
          <Stat label="من كلّ من راسلنا" value={pct(f.confirmed, f.talked)} hint="نسبة التحويل الكلّيّة" />
        </div>
      </section>

      {/* ── الردود ── */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
        <h3 className="text-sm font-bold text-white mb-3">الردود</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          <Stat label="نسبة الأتمتة" value={`${n(m.automationRate)}٪`} hint={`${n(m.bot)} ردّ بوت · ${n(m.staff)} ردّ موظّف`} tone={m.automationRate >= 85 ? 'good' : 'warn'} />
          <Stat label="زمن الردّ (الوسيط)" value={secs(r.p50Ms)} hint={measured ? `٩٠٪ من الردود خلال ${secs(r.p90Ms)}` : 'لم تُسجَّل ردود بعد'} tone={measured && r.p50Ms > 15000 ? 'warn' : undefined} />
          <Stat label="سؤال بلا جواب" value={n(r.unknown)} hint={`من ${n(r.total)} ردّاً — أضف جوابها للمعرفة`} tone={r.unknown ? 'warn' : 'good'} />
          <Stat label="حُوّل لموظّف" value={n(r.handoff)} hint={pct(r.handoff, r.total)} />
          <Stat label="أعطال" value={n(r.fail)} hint="ردّ فشل توليده (وصل العميلَ اعتذار)" tone={r.fail ? 'bad' : 'good'} />
          <Stat label="حارس التسريب" value={n(r.leak)} hint="ردّ حُجب لأنّه كشف ما لا يجوز" tone={r.leak ? 'warn' : undefined} />
          <Stat label="رسائل صوتيّة" value={n(m.audioIn)} hint={r.audioOk + r.audioUnclear ? `فُهم ${n(r.audioOk)} · غير واضح ${n(r.audioUnclear)}` : 'لا تفريغ مسجَّل بعد'} />
          <Stat label="ردود استعملت أداة" value={pct(r.withTools, r.total)} hint="بيانات حيّة لا كلام عامّ" />
        </div>
        <p className="text-[11px] text-gray-500 mt-3">
          {d.measuredSince ? `زمن الردّ والأعلام تُقاس منذ ${fmt(d.measuredSince)} — ما قبله غير مسجَّل.` : 'زمن الردّ والأعلام بدأ تسجيلها مع هذا الإصدار — ستمتلئ مع أوّل محادثات حقيقيّة. القمع والأتمتة أعلاه من التاريخ كلّه.'}
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── ما يحتاج نظرك ── */}
        <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 min-w-0">
          <h3 className="text-sm font-bold text-white">ما يحتاج نظرك</h3>
          <p className="text-[11px] text-gray-500 mb-2">أسئلة لم يعرف جوابها، أو حوّلها، أو تعطّل عندها. اضغط لفتح المحادثة.</p>
          {d.issues.length === 0 ? <p className="text-xs text-gray-500">لا شيء مسجَّل في هذه الفترة.</p> : (
            <div className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
              {d.issues.map((x: any, i: number) => (
                <button key={i} onClick={() => x.conversationId && onOpenConv(x.conversationId)} className="w-full text-right py-2 hover:bg-white/[0.03] rounded-lg px-1">
                  <div className="flex items-center gap-2 text-[11px] text-gray-500">
                    <span className={`px-1.5 py-0.5 rounded ${KIND[x.kind]?.cls}`}>{KIND[x.kind]?.label}</span>
                    <span className="truncate">{x.who}</span>
                    <span className="mr-auto whitespace-nowrap">{fmt(x.at)}</span>
                  </div>
                  <p className="text-sm text-gray-200 mt-1 break-words">{x.question || '—'}</p>
                  {x.detail && x.detail !== true && <p className="text-[11px] text-gray-500 break-words">{String(x.detail)}</p>}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ── الأدوات ── */}
        <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 min-w-0">
          <h3 className="text-sm font-bold text-white">أكثر الأدوات استعمالاً</h3>
          <p className="text-[11px] text-gray-500 mb-2">ما يطلبه الناس فعلاً — وما بُني ولم يُستعمل لن يظهر هنا.</p>
          {d.tools.length === 0 ? <p className="text-xs text-gray-500">لا استدعاءات مسجَّلة بعد.</p> : (
            <div className="space-y-1.5">
              {d.tools.map((t: any) => (
                <div key={t.tool} className="grid grid-cols-[minmax(0,1fr)_90px_36px] items-center gap-2">
                  <code className="text-[11.5px] text-gray-300 truncate" dir="ltr" style={{ textAlign: 'right' }}>{t.tool}</code>
                  <div className="h-2 rounded bg-gray-800 overflow-hidden"><div className="h-full bg-amber-400/80" style={{ width: `${(t.n / d.tools[0].n) * 100}%` }} /></div>
                  <span className="text-xs text-white tabular-nums text-left">{n(t.n)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── أثر بطاقة الولاء ── */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
        <h3 className="text-sm font-bold text-white">الحجز المبكّر أسبوعيّاً</h3>
        <p className="text-[11px] text-gray-500 mb-3">
          حجوزات سُجّلت قبل الفعاليّة بـ{n(d.minLeadHours)} ساعات فأكثر (شرط الختم) من كلّ حجوزات الأسبوع — آخر ١٢ أسبوعاً. هذا مقياس نجاح بطاقة الولاء.
        </p>
        {weekly.length === 0 ? <p className="text-xs text-gray-500">لا بيانات.</p> : (
          <div className="overflow-x-auto">
            <div className="flex items-end gap-2 h-44 min-w-[520px]">
              {weekly.map(w => (
                <div key={w.week} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${w.bookings} حجزاً · مبكّر من التطبيق ${w.earlyApp} · من البوت ${w.earlyBot}`}>
                  <span className="text-[10.5px] text-gray-300 tabular-nums">{n(w.earlyRate)}٪</span>
                  <div className="w-full flex-1 flex flex-col justify-end rounded-t bg-gray-800/60 overflow-hidden" style={{ maxHeight: `${Math.max(8, (w.bookings / wMax) * 100)}%` }}>
                    <div style={{ height: `${(w.earlyBot / Math.max(1, w.bookings)) * 100}%`, background: '#34d399' }} />
                    <div style={{ height: `${(w.earlyApp / Math.max(1, w.bookings)) * 100}%`, background: '#fbbf24' }} />
                  </div>
                  <span className="text-[10px] text-gray-500 tabular-nums" dir="ltr">{w.week.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-4 mt-3 text-[11px] text-gray-400">
          <span><i className="inline-block w-2.5 h-2.5 rounded-sm align-middle ml-1" style={{ background: '#fbbf24' }} />مبكّر من التطبيق</span>
          <span><i className="inline-block w-2.5 h-2.5 rounded-sm align-middle ml-1" style={{ background: '#34d399' }} />مبكّر من البوت</span>
          <span><i className="inline-block w-2.5 h-2.5 rounded-sm align-middle ml-1 bg-gray-700" />باقي الحجوزات (ارتفاع العمود = حجم الأسبوع)</span>
        </div>
      </section>
    </div>
  );
}
