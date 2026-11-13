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
import type { CSSProperties, ReactNode } from 'react';
import { AlertTriangle, ChevronLeft, Save } from 'lucide-react';
import { swalToast } from '@/lib/swal';
import { Badge, Banner, Card, Empty, Field, HBar, PageHead, Seg, Skel, Tile } from './wa-ui';
import type { Tone } from './wa-ui';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;

const n = (x: any) => Number(x || 0).toLocaleString('ar-JO');
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}٪` : '—');
const secs = (ms: number | null) => (ms == null ? '—' : ms < 60000 ? `${(ms / 1000).toFixed(1)} ث` : `${Math.round(ms / 60000)} د`);
const fmtDate = (iso: string) => new Date(iso).toLocaleString('ar-JO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' });
const usd = (v: number) => (v >= 1 ? `$${v.toFixed(2)}` : v >= 0.01 ? `$${v.toFixed(3)}` : `$${v.toFixed(5)}`);
const tok = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}م` : v >= 1e3 ? `${Math.round(v / 1e3)}ألف` : String(v || 0));

const KIND: Record<string, { label: string; tone: Tone }> = {
  unknown: { label: 'بلا جواب', tone: 'warn' },
  handoff: { label: 'حُوّل لموظّف', tone: 'info' },
  fail: { label: 'عطل', tone: 'danger' },
};

// ── أنماط عرضٍ صغيرة (كلّها من رموز النظام) ──
const SMALL: CSSProperties = { font: '500 12px/16px var(--font-sans)' };
const STRONG: CSSProperties = { color: 'var(--ink-2)' };
const SWATCH: CSSProperties = { display: 'inline-block', width: 10, height: 10, borderRadius: 2, verticalAlign: 'middle', marginInlineEnd: 4 };
const ROWBTN: CSSProperties = { background: 'none', border: 0, color: 'inherit', width: '100%', textAlign: 'start', cursor: 'pointer', font: 'inherit' };
const AXIS: CSSProperties = { fill: 'var(--ink-3)' };

/** قيمة بلاطةٍ بلون التحذير — البلاطة نفسها لا تحمل هذه النبرة */
const warnV = (v: string): ReactNode => <span style={{ color: 'var(--warn)' }}>{v}</span>;

/** تعليقٌ تحت الرسم: ما يجب أن تستنتجه منه. رسمٌ لا يغيّر قراراً لا يستحقّ مساحته. */
function Cap({ children }: { children: any }) {
  return (
    <p className="muted" style={{ margin: 'var(--space-3) 0 0', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--line)', font: '400 13px/20px var(--font-sans)' }}>
      {children}
    </p>
  );
}

// ══════════════════════════════════════════════════════
// 📊 الردود والكلفة يوماً بيوم
// ══════════════════════════════════════════════════════
function DailyChart({ daily }: { daily: any[] }) {
  const W = 720, H = 220, P = { t: 14, r: 64, b: 30, l: 52 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const maxR = Math.max(1, ...daily.map(d => d.replies));
  const maxC = Math.max(1e-6, ...daily.map(d => d.cost));
  const bw = iw / Math.max(1, daily.length);

  const bars = daily.map((d, i) => {
    const h = (d.replies / maxR) * ih;
    return <rect key={i} x={P.l + i * bw + 1.2} y={P.t + ih - h} width={Math.max(1, bw - 2.4)} height={h} rx={2} style={{ fill: 'var(--info)' }} opacity={0.75} />;
  });
  const pts = daily.map((d, i) => [P.l + i * bw + bw / 2, P.t + ih - (d.cost / maxC) * ih]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${P.t + ih} L${pts[0][0].toFixed(1)} ${P.t + ih} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 640, height: 'auto', display: 'block', direction: 'ltr', fontFamily: 'var(--font-mono)' }} role="img" aria-label="الردود والكلفة يوماً بيوم">
      <defs>
        <linearGradient id="perfCost" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--gold)' }} stopOpacity="0.5" />
          <stop offset="1" style={{ stopColor: 'var(--gold)' }} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map(i => {
        const y = P.t + (ih * i) / 3;
        return (
          <g key={i}>
            <line x1={P.l} y1={y} x2={P.l + iw} y2={y} style={{ stroke: 'var(--line)' }} strokeWidth={1} />
            <text x={P.l - 6} y={y + 4} style={AXIS} fontSize={13.5} textAnchor="end">{n(Math.round((maxR * (3 - i)) / 3))}</text>
            <text x={P.l + iw + 6} y={y + 4} style={{ fill: 'var(--gold)' }} fontSize={13.5}>{usd((maxC * (3 - i)) / 3)}</text>
          </g>
        );
      })}
      {bars}
      <path d={area} fill="url(#perfCost)" />
      <path d={line} fill="none" style={{ stroke: 'var(--gold)' }} strokeWidth={2} strokeLinejoin="round" />
      {daily.length > 2 && (
        <>
          <text x={P.l} y={H - 8} style={AXIS} fontSize={13.5} textAnchor="start">{daily[0].label}</text>
          <text x={P.l + iw / 2} y={H - 8} style={AXIS} fontSize={13.5} textAnchor="middle">{daily[Math.floor(daily.length / 2)].label}</text>
          <text x={P.l + iw} y={H - 8} style={AXIS} fontSize={13.5} textAnchor="end">اليوم</text>
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
    <svg viewBox="0 0 140 140" style={{ width: 140, height: 140, display: 'block', direction: 'ltr' }} role="img" aria-label={`توكن دخل ${share}٪`}>
      <g transform="translate(70,70) rotate(-90)">
        <circle r={R} fill="none" style={{ stroke: 'var(--info)' }} strokeWidth={19} />
        <circle r={R} fill="none" style={{ stroke: 'var(--gold)' }} strokeWidth={19} strokeDasharray={`${seg.toFixed(1)} ${(C - seg).toFixed(1)}`} />
      </g>
      <text x="70" y="66" style={{ fill: 'var(--ink)' }} fontSize={19} fontWeight="700" textAnchor="middle">{n(share)}٪</text>
      <text x="70" y="84" style={AXIS} fontSize={12} textAnchor="middle">توكن دخل</text>
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

  if (err) return <Banner tone="danger" icon={<AlertTriangle />}>{err}</Banner>;
  if (!q) {
    return (
      <div className="stack" aria-busy="true">
        <span className="muted">جاري التحميل…</span>
        <Skel h={88} />
        <Skel h={220} />
      </div>
    );
  }

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
    <div className="stack" style={{ gap: 'var(--space-5)' }} dir="rtl">
      {/* ═══ الترويسة: مدّةٌ واحدة تحكم الشاشة كلّها ═══ */}
      <PageHead title="الأداء والكلفة" sub="هل يؤدّي الدون عمله — وبكم؟">
        <Seg<string>
          label="المدّة"
          value={String(days)}
          onChange={v => setDays(Number(v))}
          options={[7, 30, 90].map(x => [String(x), `${n(x)} يوماً`] as const)}
        />
      </PageHead>

      {/* ═══ الخلاصة ═══ */}
      <div className="wa-kpis">
        <Tile k="محادثات" v={n(f.talked)} h={`${n(m.bot + m.staff)} ردّاً`} />
        <Tile k="نسبة الأتمتة" v={m.automationRate >= 85 ? `${n(m.automationRate)}٪` : warnV(`${n(m.automationRate)}٪`)} h={`${n(m.bot)} بوت · ${n(m.staff)} موظّف`} tone={m.automationRate >= 85 ? 'ok' : undefined} />
        <Tile k="زمن الردّ" v={measured && r.p50Ms > 15000 ? warnV(secs(r.p50Ms)) : secs(r.p50Ms)} h={measured ? `٩٠٪ خلال ${secs(r.p90Ms)}` : 'لم يُقس بعد'} />
        <Tile k="حجوزات البوت" v={n(f.reservations)} h={`${n(f.people)} شخصاً · ${pct(f.confirmed, f.talked)} تحويل`} tone="ok" />
        <Tile k="الكلفة" v={usd(cost)} h={`${n(replies)} ردّاً`} tone="gold" />
        <Tile k="كلفة الحجز" v={f.reservations ? usd(perBooking) : '—'} h={`الردّ ${usd(perReply)}`} tone="ok" />
      </div>

      {/* ═══ الردود والكلفة يوماً بيوم ═══ */}
      {daily.length > 0 && (
        <Card
          title="الردود والكلفة يوماً بيوم"
          aside={days === 7 ? 'آخر ٧ أيّام' : 'آخر ٣٠ يوماً (السلسلة لا تتجاوزها)'}
        >
          <div className="row muted" style={{ ...SMALL, gap: 'var(--space-4)', marginBottom: 'var(--space-2)' }}>
            <span><i style={{ ...SWATCH, background: 'var(--info)' }} />ردود</span>
            <span><i style={{ ...SWATCH, width: 16, height: 2, borderRadius: 0, background: 'var(--gold)' }} />كلفة</span>
          </div>
          <div className="wa-tablewrap">
            <DailyChart daily={daily} />
          </div>
          <Cap>
            الخطّ يلاصق الأعمدة لأنّ الكلفة تتبع <b style={STRONG}>عدد</b> الردود لا طولها.
            ولو انفصل الخطّ يوماً عن الأعمدة فذاك إنذار: محادثةٌ تأكل توكناً بلا مقابل —
            راجع «أغلى المحادثات» أدناه.
          </Cap>
        </Card>
      )}

      {/* ═══ القمع + ما يحتاج نظرك ═══ */}
      <div className="wa-grid2">
        <Card title="قمع الحجز" aside="أين يتسرّب الناس بين «مرحبا» والحجز المؤكَّد">
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            {steps.map((s, i) => (
              <HBar
                key={s.label}
                tone={i < steps.length - 1 ? 'gold' : undefined}
                pct={Math.max(2, (s.v / top) * 100)}
                label={<>
                  <span style={{ display: 'block', color: 'var(--ink)' }}>{s.label}</span>
                  <span className="muted" style={{ ...SMALL, display: 'block' }}>{s.hint}</span>
                </>}
                value={<>
                  {n(s.v)}
                  {i > 0 && <span className="muted" style={{ display: 'block', font: '500 12px/16px var(--font-mono)' }}>{pct(s.v, steps[i - 1].v)}</span>}
                </>}
              />
            ))}
          </div>
          <Cap>
            {worst.drop > 0
              ? <>أكبر تسرّبٍ بين «{worst.from}» و«{worst.to}» — <b style={{ color: 'var(--danger)' }}>{n(Math.round(worst.drop * 100))}٪</b> يسقطون هناك. وهذا ما تلاحقه المتابعة الآليّة.</>
              : 'لا بيانات كافية بعد لقراءة التسرّب.'}
            {f.waitlist ? <> · منها <b style={STRONG}>{n(f.waitlist)}</b> على قائمة الانتظار.</> : null}
          </Cap>
        </Card>

        {/* ═══ ما يحتاج نظرك ═══ */}
        <Card title="ما يحتاج نظرك" aside="أسئلة لم يعرف جوابها · حوّلها · تعطّل عندها">
          {q.issues.length === 0 ? (
            <Empty title="لا شيء مسجَّل في هذه الفترة." />
          ) : (
            <div className="wa-list">
              {q.issues.slice(0, 12).map((x: any, i: number) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => x.conversationId && onOpenConv(x.conversationId)}
                  style={ROWBTN}
                >
                  {/* الشارة خارج `.t`: قاعدة `.wa-list .t span` كانت ستمحو لونها */}
                  <Badge tone={KIND[x.kind]?.tone}>{KIND[x.kind]?.label}</Badge>
                  <div className="t">
                    <b style={{ overflowWrap: 'anywhere' }}>{x.question || '—'}</b>
                    <span style={{ overflowWrap: 'anywhere' }}>{x.who} · {fmtDate(x.at)}</span>
                    {x.detail && x.detail !== true && <span style={{ overflowWrap: 'anywhere' }}>{String(x.detail)}</span>}
                  </div>
                  <ChevronLeft className="muted" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
          {q.issues.length > 12 && (
            <p className="muted" style={{ ...SMALL, margin: 'var(--space-2) 0 0' }}>…و{n(q.issues.length - 12)} غيرها. عالِج هذه أوّلاً — «بلا جواب» تُحلّ بسطرٍ في قاعدة المعرفة.</p>
          )}
        </Card>
      </div>

      {/* ═══ الكلفة + الأسعار ═══ */}
      <div className="wa-grid2">
        <Card title="أين تذهب الكلفة" aside="دخل مقابل خرج">
          <div className="flex gap-4 items-center flex-wrap">
            <div style={{ flex: 'none' }}><Donut inT={inT} outT={outT} /></div>
            <div className="grow" style={{ minWidth: 150 }}>
              {[
                ['توكن دخل', tok(inT)],
                ['توكن خرج', tok(outT)],
                ['كلفة الردّ', usd(perReply)],
                ['كلفة الحجز', f.reservations ? usd(perBooking) : '—'],
                ...(bucket?.cacheHitRate ? [['من الكاش', `${n(bucket.cacheHitRate)}٪`]] : []),
              ].map(([k, v]) => (
                <div key={k as string} className="wa-kv" style={{ paddingBlock: 'var(--space-1)', borderBottom: '1px solid var(--line)' }}>
                  <span>{k}</span>
                  <b className="ltr">{v}</b>
                </div>
              ))}
            </div>
          </div>
          <Cap>
            معظم الكلفة توكنُ <b style={STRONG}>دخل</b> ⇒ التوفير في طول قاعدة المعرفة والسياق،
            لا في اختصار الردود. واختصارُ الردود يضرّ الخدمة ولا يوفّر شيئاً يُذكر.
          </Cap>
        </Card>

        {prices && (
          <Card title="أسعار النموذج" aside="$ لكلّ مليون توكن — أساس كلّ رقمٍ أعلاه">
            <div className="grid grid-cols-2 gap-3">
              {([['in', 'الدخل'], ['out', 'الخرج']] as const).map(([k, l]) => (
                <Field key={k} label={l} htmlFor={`perf-price-${k}`}>
                  <input
                    id={`perf-price-${k}`}
                    value={prices[k]}
                    onChange={e => setPrices(p => (p ? { ...p, [k]: e.target.value } : p))}
                    dir="ltr"
                    inputMode="decimal"
                    className="wa-input"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
                </Field>
              ))}
            </div>
            <button
              type="button"
              onClick={savePrices}
              disabled={savingPrices}
              className="wa-btn primary block"
              style={{ marginTop: 'var(--space-3)' }}
            ><Save />{savingPrices ? 'جارٍ الحفظ…' : 'حفظ الأسعار'}</button>
            <Cap>كلّ صفّ استهلاكٍ يُسعَّر <b style={STRONG}>بنموذجه هو</b>، فتبديل النموذج لا يفسد حساب التاريخ. وتوكنُ الكاش يُحتسب بربع سعر الدخل.</Cap>
          </Card>
        )}
      </div>

      {/* ═══ أغلى المحادثات + الأدوات ═══ */}
      <div className="wa-grid2">
        {(u?.topConversations || []).length > 0 && (
          <Card title="أغلى المحادثات" aside="آخر ٣٠ يوماً — اضغط لفتحها">
            <div className="wa-tablewrap">
              <table className="wa-table">
                <thead><tr><th>العميل</th><th>ردود</th><th>الكلفة</th></tr></thead>
                <tbody>
                  {u.topConversations.map((c: any) => (
                    <tr key={c.id} onClick={() => onOpenConv(c.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ paddingBlock: 0 }}>
                        {/* الزرّ يحمل لوحة المفاتيح؛ نقرتُه تصعد إلى الصفّ فلا تُفتح المحادثة مرّتين */}
                        <button type="button" style={{ ...ROWBTN, minHeight: 'var(--hit)' }}>{c.name}</button>
                      </td>
                      <td><span className="ltr">{n(c.replies)}</span></td>
                      <td><b className="ltr" style={{ color: 'var(--gold)' }}>{usd(c.cost)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Cap>محادثةٌ تتصدّر هنا بلا حجزٍ في مقابلها تستحقّ النظر: إمّا سؤالٌ لا تجيبه قاعدة المعرفة فيدور البوت حوله، وإمّا عميلٌ يحتاج إنساناً.</Cap>
          </Card>
        )}

        <Card title="أكثر الأدوات استعمالاً" aside="ما يطلبه الناس فعلاً">
          {q.tools.length === 0 ? (
            <Empty title="لا استدعاءات مسجَّلة بعد." />
          ) : (
            <div>
              {q.tools.map((t: any) => (
                <HBar
                  key={t.tool}
                  tone="gold"
                  pct={(t.n / q.tools[0].n) * 100}
                  label={<code className="ltr trunc" style={{ display: 'block', textAlign: 'right' }}>{t.tool}</code>}
                  value={n(t.n)}
                />
              ))}
            </div>
          )}
          <Cap>ما بُني ولم يُستعمل لا يظهر هنا — وهو مرشّحٌ للإطفاء: كلّ أداةٍ مفعّلة تزيد طول التعليمات وكلفة كلّ ردّ.</Cap>
        </Card>
      </div>

      {/* ═══ أثر بطاقة الولاء ═══ */}
      <Card title="الحجز المبكّر أسبوعيّاً" aside={`قبل الفعاليّة بـ${n(q.minLeadHours)} ساعات فأكثر — شرط ختم الولاء`}>
        {weekly.length === 0 ? (
          <Empty title="لا بيانات." />
        ) : (
          <div className="wa-tablewrap">
            <div className="flex items-end gap-2" style={{ minWidth: 460 }}>
              {weekly.map(w => {
                // ارتفاعات بالبكسل صراحةً: النِّسب داخل عمود flex بلا ارتفاعٍ محدَّد تنهار إلى صفر
                const H = 110;
                const colH = Math.max(5, Math.round((w.bookings / wMax) * H));
                const botH = Math.round((w.earlyBot / Math.max(1, w.bookings)) * colH);
                const appH = Math.round((w.earlyApp / Math.max(1, w.bookings)) * colH);
                return (
                  <div key={w.week} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${w.bookings} حجزاً · مبكّر من التطبيق ${w.earlyApp} · من البوت ${w.earlyBot}`}>
                    <span style={{ font: '500 12px/16px var(--font-mono)', color: 'var(--ink-2)' }}>{n(w.earlyRate)}٪</span>
                    <div className="w-full flex flex-col justify-end" style={{ height: H }}>
                      <div className="w-full flex flex-col justify-end" style={{ height: colH, background: 'var(--bg-300)', borderRadius: '4px 4px 0 0', overflow: 'hidden' }}>
                        <div style={{ height: botH, background: 'var(--ok)' }} />
                        <div style={{ height: appH, background: 'var(--gold)' }} />
                      </div>
                    </div>
                    <span className="ltr muted" style={{ fontSize: 12 }}>{w.week.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-3 muted" style={{ ...SMALL, marginTop: 'var(--space-3)' }}>
          <span><i style={{ ...SWATCH, background: 'var(--gold)' }} />من التطبيق</span>
          <span><i style={{ ...SWATCH, background: 'var(--ok)' }} />من البوت</span>
          <span><i style={{ ...SWATCH, background: 'var(--bg-300)' }} />باقي الحجوزات</span>
        </div>
      </Card>

      <p className="muted" style={{ ...SMALL, margin: 0 }}>
        {q.measuredSince
          ? `زمن الردّ والأعلام تُقاس منذ ${fmtDate(q.measuredSince)} — ما قبله غير مسجَّل. القمع والأتمتة من التاريخ كلّه.`
          : 'زمن الردّ والأعلام بدأ تسجيلها مع هذا الإصدار. القمع والأتمتة من التاريخ كلّه.'}
      </p>
    </div>
  );
}
