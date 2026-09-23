'use client';

// ══════════════════════════════════════════════════════
// 📈 الأداء والكلفة — شاشةٌ واحدة تجيب سؤالاً واحداً
// ══════════════════════════════════════════════════════
// كان نصفا السؤال مفترقين: «هل يؤدّي الدون عمله؟» في تبويب الجودة، و«بكم؟»
// في تبويب البوت — ولكلٍّ سياقُه ومدّتُه وتمريرُه. هنا مكوّنٌ واحد بمدّةٍ
// واحدة وتمريرٍ واحد: العمل والكلفة سطرٌ واحد لأنّ الحكم عليهما واحد.
//
// 🔴 كلّ رسمٍ هنا SVG بـ`direction:ltr` صراحةً: `text-anchor` يتبع اتجاه
//    النصّ الموروث، فداخل dir="rtl" ينقلب معنى start/end وتنزاح ملصقات
//    المحاور فوق الرسم — عطلٌ صامت لا يظهر إلّا بالعين.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { swalToast } from '@/lib/swal';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;

const n = (x: any) => Number(x || 0).toLocaleString('ar-JO');
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}٪` : '—');
const secs = (ms: number | null) => (ms == null ? '—' : ms < 60000 ? `${(ms / 1000).toFixed(1)} ث` : `${Math.round(ms / 60000)} د`);
const fmtDate = (iso: string) => new Date(iso).toLocaleString('ar-JO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' });
const usd = (v: number) => (v >= 1 ? `$${v.toFixed(2)}` : v >= 0.01 ? `$${v.toFixed(3)}` : `$${v.toFixed(5)}`);
const tok = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}م` : v >= 1e3 ? `${Math.round(v / 1e3)}ألف` : String(v || 0));

const KIND: Record<string, { label: string; cls: string }> = {
  unknown: { label: 'بلا جواب', cls: 'bg-amber-500/10 text-amber-300' },
  handoff: { label: 'حُوّل لموظّف', cls: 'bg-sky-500/10 text-sky-300' },
  fail: { label: 'عطل', cls: 'bg-rose-500/10 text-rose-300' },
};

function Card({ title, hint, children, className = '' }: { title: string; hint?: string; children: any; className?: string }) {
  return (
    <section className={`rounded-2xl border border-gray-800 bg-gray-900/60 p-4 min-w-0 ${className}`}>
      <div className="flex items-baseline gap-2 flex-wrap mb-3">
        <h3 className="text-[13.5px] font-bold text-white">{title}</h3>
        {hint && <span className="text-[10.5px] text-gray-500">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const c = tone === 'good' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : tone === 'bad' ? 'text-rose-300' : 'text-white';
  return (
    <div className="bg-gray-950/70 border border-gray-800 rounded-xl px-3 py-2.5 min-w-0">
      <div className="text-[10.5px] text-gray-500 truncate">{label}</div>
      <div className={`text-xl font-black tabular-nums ${c}`}>{value}</div>
      {hint && <div className="text-[10px] text-gray-600 leading-snug truncate">{hint}</div>}
    </div>
  );
}

/** تعليقٌ تحت الرسم: ما يجب أن تستنتجه منه. رسمٌ لا يغيّر قراراً لا يستحقّ مساحته. */
function Cap({ children }: { children: any }) {
  return <p className="text-[11px] text-gray-500 leading-relaxed mt-3 pt-2.5 border-t border-dashed border-gray-800">{children}</p>;
}

// ══════════════════════════════════════════════════════
// 📊 الردود والكلفة يوماً بيوم
// ══════════════════════════════════════════════════════
function DailyChart({ daily }: { daily: any[] }) {
  const W = 720, H = 210, P = { t: 14, r: 52, b: 26, l: 44 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const maxR = Math.max(1, ...daily.map(d => d.replies));
  const maxC = Math.max(1e-6, ...daily.map(d => d.cost));
  const bw = iw / Math.max(1, daily.length);

  const bars = daily.map((d, i) => {
    const h = (d.replies / maxR) * ih;
    return <rect key={i} x={P.l + i * bw + 1.2} y={P.t + ih - h} width={Math.max(1, bw - 2.4)} height={h} rx={2} fill="#2b6a8f" opacity={0.75} />;
  });
  const pts = daily.map((d, i) => [P.l + i * bw + bw / 2, P.t + ih - (d.cost / maxC) * ih]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${P.t + ih} L${pts[0][0].toFixed(1)} ${P.t + ih} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', direction: 'ltr' }} role="img">
      <defs>
        <linearGradient id="perfCost" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0b429" stopOpacity="0.5" />
          <stop offset="1" stopColor="#f0b429" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map(i => {
        const y = P.t + (ih * i) / 3;
        return (
          <g key={i}>
            <line x1={P.l} y1={y} x2={P.l + iw} y2={y} stroke="#23262e" strokeWidth={1} />
            <text x={P.l - 6} y={y + 4} fill="#5B6270" fontSize={10} textAnchor="end">{n(Math.round((maxR * (3 - i)) / 3))}</text>
            <text x={P.l + iw + 6} y={y + 4} fill="#B08A3C" fontSize={10}>{usd((maxC * (3 - i)) / 3)}</text>
          </g>
        );
      })}
      {bars}
      <path d={area} fill="url(#perfCost)" />
      <path d={line} fill="none" stroke="#f0b429" strokeWidth={2} strokeLinejoin="round" />
      {daily.length > 2 && (
        <>
          <text x={P.l} y={H - 8} fill="#5B6270" fontSize={10} textAnchor="start">{daily[0].label}</text>
          <text x={P.l + iw / 2} y={H - 8} fill="#5B6270" fontSize={10} textAnchor="middle">{daily[Math.floor(daily.length / 2)].label}</text>
          <text x={P.l + iw} y={H - 8} fill="#5B6270" fontSize={10} textAnchor="end">اليوم</text>
        </>
      )}
    </svg>
  );
}

// ══════════════════════════════════════════════════════
// 🍩 دخل مقابل خرج
// ══════════════════════════════════════════════════════
function Donut({ inT, outT }: { inT: number; outT: number }) {
  const tot = Math.max(1, inT + outT);
  const R = 50, C = 2 * Math.PI * R;
  const seg = (outT / tot) * C;
  const share = Math.round((inT / tot) * 1000) / 10;
  return (
    <svg viewBox="0 0 140 140" style={{ width: 140, height: 140, display: 'block', direction: 'ltr' }} role="img">
      <g transform="translate(70,70) rotate(-90)">
        <circle r={R} fill="none" stroke="#2b6a8f" strokeWidth={19} />
        <circle r={R} fill="none" stroke="#f0b429" strokeWidth={19} strokeDasharray={`${seg.toFixed(1)} ${(C - seg).toFixed(1)}`} />
      </g>
      <text x="70" y="66" fill="#E8EAF0" fontSize={19} fontWeight="700" textAnchor="middle">{n(share)}٪</text>
      <text x="70" y="83" fill="#5B6270" fontSize={10} textAnchor="middle">توكن دخل</text>
    </svg>
  );
}

// ══════════════════════════════════════════════════════
export default function PerformanceTab({ apiFetch, onOpenConv }: { apiFetch: Fetcher; onOpenConv: (id: number) => void }) {
  const [days, setDays] = useState(30);
  const [q, setQ] = useState<any>(null);       // الجودة
  const [u, setU] = useState<any>(null);       // الاستهلاك
  const [prices, setPrices] = useState<{ in: string; out: string } | null>(null);
  const [savingPrices, setSavingPrices] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const [a, b, c] = await Promise.all([
        apiFetch(`/api/whatsapp/bot/quality?days=${days}`),
        apiFetch('/api/whatsapp/bot/usage').catch(() => null),
        apiFetch('/api/whatsapp/bot/settings').catch(() => null),
      ]);
      setQ(a);
      if (b?.usage) setU(b.usage);
      if (c?.settings && !prices) {
        setPrices({ in: String(c.settings.priceInputPer1M ?? '0.10'), out: String(c.settings.priceOutputPer1M ?? '0.40') });
      }
    } catch (e: any) { setErr(e.message); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, days]);
  useEffect(() => { setQ(null); load(); }, [load]);

  const savePrices = async () => {
    if (!prices) return;
    setSavingPrices(true);
    try {
      // حفظٌ جزئيّ: الخادم يطبّق المفاتيح الموجودة في الجسم فقط
      await apiFetch('/api/whatsapp/bot/settings', {
        method: 'PUT',
        body: JSON.stringify({ priceInputPer1M: prices.in, priceOutputPer1M: prices.out }),
      });
      swalToast('حُفظت الأسعار — تُعاد التكلفة حسابها فوراً ✅', 'success');
      load();
    } catch (e: any) { swalToast('تعذّر الحفظ: ' + e.message, 'error'); }
    finally { setSavingPrices(false); }
  };

  // المدّة الواحدة تحكم النصفين: الاستهلاك بدلاءٌ جاهزة فنختار أقربها
  const bucket = useMemo(() => {
    if (!u) return null;
    return days === 7 ? u.d7 : days === 30 ? u.d30 : (u.allTime || u.d30);
  }, [u, days]);
  const daily = useMemo(() => {
    const d: any[] = u?.daily || [];
    return days === 7 ? d.slice(-7) : d;
  }, [u, days]);

  if (err) return <p className="text-sm text-rose-400 p-4">⚠️ {err}</p>;
  if (!q) return <p className="text-sm text-gray-500 p-4">جاري التحميل…</p>;

  const f = q.funnel, r = q.replies, m = q.messages;
  const cost = Number(bucket?.cost || 0);
  const replies = Number(bucket?.replies || 0);
  const perReply = replies ? cost / replies : 0;
  const perBooking = f.reservations ? cost / f.reservations : 0;
  const inT = Number(bucket?.prompt || 0), outT = Number(bucket?.output || 0);
  const measured = r.p50Ms != null;

  const steps = [
    { label: 'راسلونا', v: f.talked, hint: 'محادثات وصلتنا منها رسالة' },
    { label: 'رأوا قائمة الفعاليّات', v: f.listed, hint: 'أبدوا نيّة حجز' },
    { label: 'وصلوا لزرّ التأكيد', v: f.askedToConfirm, hint: 'اختاروا فعاليّة وعدداً' },
    { label: 'ضغطوا «أكّد»', v: f.confirmed, hint: 'الحجز لا يُنشأ إلا بهذه الضغطة' },
  ];
  const top = steps[0].v || 1;
  const worst = steps.reduce((acc, s, i) => {
    if (i === 0) return acc;
    const drop = steps[i - 1].v ? (steps[i - 1].v - s.v) / steps[i - 1].v : 0;
    return drop > acc.drop ? { drop, from: steps[i - 1].label, to: s.label } : acc;
  }, { drop: 0, from: '', to: '' });

  const weekly: any[] = q.loyaltyWeekly || [];
  const wMax = Math.max(1, ...weekly.map(w => w.bookings));

  return (
    <div className="space-y-3" dir="rtl">
      {/* ═══ الترويسة: مدّةٌ واحدة تحكم الشاشة كلّها ═══ */}
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-bold text-white">الأداء والكلفة</h2>
        <span className="text-[10.5px] text-gray-500">هل يؤدّي الدون عمله — وبكم؟</span>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 text-xs mr-auto">
          {[7, 30, 90].map(x => (
            <button
              key={x}
              onClick={() => setDays(x)}
              className={`px-2.5 py-1 rounded-lg font-bold ${days === x ? 'bg-amber-500/10 text-amber-400' : 'text-gray-400 hover:text-white'}`}
            >{n(x)} يوماً</button>
          ))}
        </div>
      </div>

      {/* ═══ الخلاصة ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Kpi label="محادثات" value={n(f.talked)} hint={`${n(m.bot + m.staff)} ردّاً`} />
        <Kpi label="نسبة الأتمتة" value={`${n(m.automationRate)}٪`} hint={`${n(m.bot)} بوت · ${n(m.staff)} موظّف`} tone={m.automationRate >= 85 ? 'good' : 'warn'} />
        <Kpi label="زمن الردّ" value={secs(r.p50Ms)} hint={measured ? `٩٠٪ خلال ${secs(r.p90Ms)}` : 'لم يُقس بعد'} tone={measured && r.p50Ms > 15000 ? 'warn' : undefined} />
        <Kpi label="حجوزات البوت" value={n(f.reservations)} hint={`${n(f.people)} شخصاً · ${pct(f.confirmed, f.talked)} تحويل`} tone="good" />
        <Kpi label="الكلفة" value={usd(cost)} hint={`${n(replies)} ردّاً`} tone="warn" />
        <Kpi label="كلفة الحجز" value={f.reservations ? usd(perBooking) : '—'} hint={`الردّ ${usd(perReply)}`} tone="good" />
      </div>

      {/* ═══ الردود والكلفة يوماً بيوم ═══ */}
      {daily.length > 0 && (
        <Card
          title="الردود والكلفة يوماً بيوم"
          hint={days === 7 ? 'آخر ٧ أيّام' : 'آخر ٣٠ يوماً (السلسلة لا تتجاوزها)'}
        >
          <div className="flex items-center gap-4 text-[10.5px] text-gray-500 mb-1">
            <span><i className="inline-block w-2.5 h-2.5 rounded-sm align-middle ml-1" style={{ background: '#2b6a8f' }} />ردود</span>
            <span><i className="inline-block w-4 h-[2px] align-middle ml-1" style={{ background: '#f0b429' }} />كلفة</span>
          </div>
          <DailyChart daily={daily} />
          <Cap>
            الخطّ يلاصق الأعمدة لأنّ الكلفة تتبع <b className="text-gray-300">عدد</b> الردود لا طولها.
            ولو انفصل الخطّ يوماً عن الأعمدة فذاك إنذار: محادثةٌ تأكل توكناً بلا مقابل —
            راجع «أغلى المحادثات» أدناه.
          </Cap>
        </Card>
      )}

      {/* ═══ القمع + الكلفة ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card title="قمع الحجز" hint="أين يتسرّب الناس بين «مرحبا» والحجز المؤكَّد">
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={s.label} className="grid grid-cols-[110px_1fr_auto] sm:grid-cols-[150px_1fr_auto] items-center gap-2.5">
                <div className="min-w-0">
                  <div className="text-[11.5px] text-gray-200 truncate">{s.label}</div>
                  <div className="text-[10px] text-gray-600 truncate">{s.hint}</div>
                </div>
                <div className="h-5 rounded-md bg-gray-800/70 overflow-hidden">
                  <div className="h-full rounded-md" style={{ width: `${Math.max(2, (s.v / top) * 100)}%`, background: 'linear-gradient(90deg,#f59e0b,#fbbf24)' }} />
                </div>
                <div className="text-[12.5px] font-bold text-white tabular-nums w-16 text-left">
                  {n(s.v)}
                  {i > 0 && <span className="text-[10px] font-normal text-gray-500 block">{pct(s.v, steps[i - 1].v)}</span>}
                </div>
              </div>
            ))}
          </div>
          <Cap>
            {worst.drop > 0
              ? <>أكبر تسرّبٍ بين «{worst.from}» و«{worst.to}» — <b className="text-rose-300">{n(Math.round(worst.drop * 100))}٪</b> يسقطون هناك. وهذا ما تلاحقه المتابعة الآليّة.</>
              : 'لا بيانات كافية بعد لقراءة التسرّب.'}
            {f.waitlist ? <> · منها <b className="text-gray-300">{n(f.waitlist)}</b> على قائمة الانتظار.</> : null}
          </Cap>
        </Card>

        <Card title="أين تذهب الكلفة" hint="دخل مقابل خرج">
          <div className="flex gap-4 items-center flex-wrap">
            <div className="shrink-0"><Donut inT={inT} outT={outT} /></div>
            <div className="flex-1 min-w-[150px] space-y-1">
              {[
                ['توكن دخل', tok(inT)],
                ['توكن خرج', tok(outT)],
                ['كلفة الردّ', usd(perReply)],
                ['كلفة الحجز', f.reservations ? usd(perBooking) : '—'],
                ...(bucket?.cacheHitRate ? [['من الكاش', `${n(bucket.cacheHitRate)}٪`]] : []),
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between text-[11.5px] py-1 border-b border-dashed border-gray-800 last:border-0">
                  <span className="text-gray-500">{k}</span>
                  <b className="text-white tabular-nums">{v}</b>
                </div>
              ))}
            </div>
          </div>
          <Cap>
            معظم الكلفة توكنُ <b className="text-gray-300">دخل</b> ⇒ التوفير في طول قاعدة المعرفة والسياق،
            لا في اختصار الردود. واختصارُ الردود يضرّ الخدمة ولا يوفّر شيئاً يُذكر.
          </Cap>
        </Card>
      </div>

      {/* ═══ أغلى المحادثات + الأسعار ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {(u?.topConversations || []).length > 0 && (
          <Card title="أغلى المحادثات" hint="آخر ٣٠ يوماً — اضغط لفتحها">
            <div className="space-y-1">
              {u.topConversations.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => onOpenConv(c.id)}
                  className="w-full text-right grid grid-cols-[1fr_auto_auto] items-center gap-2 py-1.5 px-1 rounded-lg hover:bg-white/[0.03] border-b border-dashed border-gray-800 last:border-0"
                >
                  <span className="text-[12px] text-gray-200 truncate">{c.name}</span>
                  <span className="text-[10.5px] text-gray-600 tabular-nums">{n(c.replies)} ردّاً</span>
                  <span className="text-[12px] font-bold text-amber-300 tabular-nums w-16 text-left">{usd(c.cost)}</span>
                </button>
              ))}
            </div>
            <Cap>محادثةٌ تتصدّر هنا بلا حجزٍ في مقابلها تستحقّ النظر: إمّا سؤالٌ لا تجيبه قاعدة المعرفة فيدور البوت حوله، وإمّا عميلٌ يحتاج إنساناً.</Cap>
          </Card>
        )}

        {prices && (
          <Card title="أسعار النموذج" hint="$ لكلّ مليون توكن — أساس كلّ رقمٍ أعلاه">
            <div className="grid grid-cols-2 gap-2">
              {([['in', 'الدخل'], ['out', 'الخرج']] as const).map(([k, l]) => (
                <label key={k} className="block">
                  <span className="block text-[10.5px] text-gray-500 mb-1">{l}</span>
                  <input
                    value={prices[k]}
                    onChange={e => setPrices(p => (p ? { ...p, [k]: e.target.value } : p))}
                    dir="ltr"
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-500 outline-none"
                  />
                </label>
              ))}
            </div>
            <button
              onClick={savePrices}
              disabled={savingPrices}
              className="w-full mt-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-bold rounded-lg py-1.5 text-xs"
            >{savingPrices ? 'جارٍ الحفظ…' : '💾 حفظ الأسعار'}</button>
            <Cap>كلّ صفّ استهلاكٍ يُسعَّر <b className="text-gray-300">بنموذجه هو</b>، فتبديل النموذج لا يفسد حساب التاريخ. وتوكنُ الكاش يُحتسب بربع سعر الدخل.</Cap>
          </Card>
        )}
      </div>

      {/* ═══ ما يحتاج نظرك ═══ */}
      <Card title="ما يحتاج نظرك" hint="أسئلة لم يعرف جوابها · حوّلها · تعطّل عندها">
        {q.issues.length === 0 ? (
          <p className="text-xs text-gray-500">لا شيء مسجَّل في هذه الفترة.</p>
        ) : (
          <div className="divide-y divide-gray-800">
            {q.issues.slice(0, 12).map((x: any, i: number) => (
              <button
                key={i}
                onClick={() => x.conversationId && onOpenConv(x.conversationId)}
                className="w-full text-right py-2 px-1 rounded-lg hover:bg-white/[0.03]"
              >
                <div className="flex items-center gap-2 text-[10.5px] text-gray-500">
                  <span className={`px-1.5 py-0.5 rounded ${KIND[x.kind]?.cls}`}>{KIND[x.kind]?.label}</span>
                  <span className="truncate">{x.who}</span>
                  <span className="mr-auto whitespace-nowrap">{fmtDate(x.at)}</span>
                </div>
                <p className="text-[12.5px] text-gray-200 mt-0.5 break-words">{x.question || '—'}</p>
                {x.detail && x.detail !== true && <p className="text-[10.5px] text-gray-500 break-words">{String(x.detail)}</p>}
              </button>
            ))}
          </div>
        )}
        {q.issues.length > 12 && (
          <p className="text-[10.5px] text-gray-600 mt-2">…و{n(q.issues.length - 12)} غيرها. عالِج هذه أوّلاً — «بلا جواب» تُحلّ بسطرٍ في قاعدة المعرفة.</p>
        )}
      </Card>

      {/* ═══ الأدوات + أثر بطاقة الولاء ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card title="أكثر الأدوات استعمالاً" hint="ما يطلبه الناس فعلاً">
          {q.tools.length === 0 ? (
            <p className="text-xs text-gray-500">لا استدعاءات مسجَّلة بعد.</p>
          ) : (
            <div className="space-y-1.5">
              {q.tools.map((t: any) => (
                <div key={t.tool} className="grid grid-cols-[minmax(0,1fr)_90px_36px] items-center gap-2">
                  <code className="text-[11px] text-gray-300 truncate" dir="ltr" style={{ textAlign: 'right' }}>{t.tool}</code>
                  <div className="h-2 rounded bg-gray-800 overflow-hidden">
                    <div className="h-full bg-amber-400/80" style={{ width: `${(t.n / q.tools[0].n) * 100}%` }} />
                  </div>
                  <span className="text-[11.5px] text-white tabular-nums text-left">{n(t.n)}</span>
                </div>
              ))}
            </div>
          )}
          <Cap>ما بُني ولم يُستعمل لا يظهر هنا — وهو مرشّحٌ للإطفاء: كلّ أداةٍ مفعّلة تزيد طول التعليمات وكلفة كلّ ردّ.</Cap>
        </Card>

        <Card title="الحجز المبكّر أسبوعيّاً" hint={`قبل الفعاليّة بـ${n(q.minLeadHours)} ساعات فأكثر — شرط ختم الولاء`}>
          {weekly.length === 0 ? (
            <p className="text-xs text-gray-500">لا بيانات.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex items-end gap-1.5 min-w-[460px]">
                {weekly.map(w => {
                  // ارتفاعات بالبكسل صراحةً: النِّسب داخل عمود flex بلا ارتفاعٍ محدَّد تنهار إلى صفر
                  const H = 110;
                  const colH = Math.max(5, Math.round((w.bookings / wMax) * H));
                  const botH = Math.round((w.earlyBot / Math.max(1, w.bookings)) * colH);
                  const appH = Math.round((w.earlyApp / Math.max(1, w.bookings)) * colH);
                  return (
                    <div key={w.week} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${w.bookings} حجزاً · مبكّر من التطبيق ${w.earlyApp} · من البوت ${w.earlyBot}`}>
                      <span className="text-[10px] text-gray-300 tabular-nums">{n(w.earlyRate)}٪</span>
                      <div className="w-full flex flex-col justify-end" style={{ height: H }}>
                        <div className="w-full flex flex-col justify-end rounded-t bg-gray-700/70 overflow-hidden" style={{ height: colH }}>
                          <div style={{ height: botH, background: '#34d399' }} />
                          <div style={{ height: appH, background: '#fbbf24' }} />
                        </div>
                      </div>
                      <span className="text-[9.5px] text-gray-500 tabular-nums" dir="ltr">{w.week.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-gray-500">
            <span><i className="inline-block w-2.5 h-2.5 rounded-sm align-middle ml-1" style={{ background: '#fbbf24' }} />من التطبيق</span>
            <span><i className="inline-block w-2.5 h-2.5 rounded-sm align-middle ml-1" style={{ background: '#34d399' }} />من البوت</span>
            <span><i className="inline-block w-2.5 h-2.5 rounded-sm align-middle ml-1 bg-gray-700" />باقي الحجوزات</span>
          </div>
        </Card>
      </div>

      <p className="text-[10.5px] text-gray-600 pb-2">
        {q.measuredSince
          ? `زمن الردّ والأعلام تُقاس منذ ${fmtDate(q.measuredSince)} — ما قبله غير مسجَّل. القمع والأتمتة من التاريخ كلّه.`
          : 'زمن الردّ والأعلام بدأ تسجيلها مع هذا الإصدار. القمع والأتمتة من التاريخ كلّه.'}
      </p>
    </div>
  );
}
