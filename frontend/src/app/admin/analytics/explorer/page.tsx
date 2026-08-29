'use client';

// ══════════════════════════════════════════════════════
// 🔎 مستكشف اللاعبين — صفحةٌ حيّة تقرأ من قاعدة البيانات في كلّ طلب
// لا كاش هنا: صفحة «تحليل اللاعبين» المجاورة تخدم الشرائح والقواعد من كاشٍ ليليّ،
// وهذه تخدم السؤال المفتوح «أيُّ فوجٍ فعل ماذا في أيّ فترة؟» بلا جمود.
//
// 🔑 قاعدة العدسة: كلُّ فلترٍ تحليليّ يعيش في العدسة (تُرسَل للخادم) — البحث النصّيّ
//    وحده محلّيٌّ لأنّه أداةُ عثورٍ لا تحليل. بهذا يبقى ما على الشاشة هو ما يُصدَّر.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { exportReport } from '@/app/admin/reports/lib/reportsApi';
import {
  EMPTY_LENS, WA_DEFAULT, WA_VARS,
  fetchExplore, fetchOptions, fetchViews, saveView, removeView,
  fmtMoney, fmtNum, lensToReportParams, pctOf, shiftDays, todayISO,
  type ExploreResult, type Lens, type Option, type Player, type SavedView,
} from './lib';
import { CohortMatrix, ConversionStrip, Funnel, Kpi, SignupWeeks, Waffle } from './panels';
import { COLUMNS, COL_GROUPS, DEFAULT_COLS, PlayerTable, type ColKey } from './table';

const COLS_KEY = 'explorer_cols';
const TPL_KEY = 'explorer_wa_template';
const TITLE_KEY = 'explorer_notif_title';

// اختصارات جاهزة — تضبط العدسة كاملةً بضغطة
const PRESETS: { label: string; icon: string; lens: () => Partial<Lens> }[] = [
  { label: 'كلّ اللاعبين', icon: '🌐', lens: () => ({ ...EMPTY_LENS }) },
  { label: 'مسجّلو آخر ٣٠ يوم', icon: '🌱', lens: () => ({ signupFrom: shiftDays(todayISO(), -30), signupTo: '' }) },
  { label: 'مسجّلو آخر ٩٠ يوم', icon: '📆', lens: () => ({ signupFrom: shiftDays(todayISO(), -90), signupTo: '' }) },
  { label: 'سجّلوا ولم يحضروا', icon: '🚫', lens: () => ({ minActivities: 0, maxActivities: 0 }) },
  { label: 'حضروا مرّةً ولم يعودوا', icon: '💤', lens: () => ({ minActivities: 1, maxActivities: 1 }) },
  { label: 'المنتظمون (٣ فأكثر)', icon: '⭐', lens: () => ({ minActivities: 3, maxActivities: null }) },
];

export default function ExplorerPage() {
  const [lens, setLens] = useState<Lens>(EMPTY_LENS);
  const [data, setData] = useState<ExploreResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locations, setLocations] = useState<Option[]>([]);
  const [seasons, setSeasons] = useState<Option[]>([]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [q, setQ] = useState('');
  const [cols, setCols] = useState<ColKey[]>(DEFAULT_COLS);
  const [showCols, setShowCols] = useState(false);
  const [showTpl, setShowTpl] = useState(false);
  const [waTemplate, setWaTemplate] = useState(WA_DEFAULT);
  const [notifTitle, setNotifTitle] = useState('نادي المافيا 🎭');
  const [toast, setToast] = useState('');
  const [exporting, setExporting] = useState<'' | 'pdf' | 'excel'>('');
  const abort = useRef<AbortController | null>(null);

  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); }, []);

  // ── تفضيلات محلّيّة ──
  useEffect(() => {
    try {
      const c = localStorage.getItem(COLS_KEY); if (c) setCols(JSON.parse(c));
      const t = localStorage.getItem(TPL_KEY); if (t) setWaTemplate(t);
      const n = localStorage.getItem(TITLE_KEY); if (n) setNotifTitle(n);
    } catch { /* تجاهل */ }
  }, []);
  const persistCols = (next: ColKey[]) => {
    setCols(next);
    try { localStorage.setItem(COLS_KEY, JSON.stringify(next)); } catch { /* تجاهل */ }
  };

  useEffect(() => {
    fetchOptions().then((o) => { setLocations(o.locations); setSeasons(o.seasons); }).catch(() => { /* اختياريّ */ });
    fetchViews().then(setViews).catch(() => { /* اختياريّ */ });
  }, []);

  // ── الجلب: كلّ تغيير في العدسة يعيد الاستعلام (مع إلغاء السابق) ──
  useEffect(() => {
    const id = setTimeout(() => {
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      setLoading(true); setError('');
      fetchExplore(lens, ac.signal)
        .then((r) => { setData(r); setLoading(false); })
        .catch((e) => {
          if (e.name === 'AbortError') return;
          setError(e.message || 'تعذّر الجلب'); setLoading(false);
        });
    }, 350);
    return () => clearTimeout(id);
  }, [lens]);

  const set = <K extends keyof Lens>(k: K, v: Lens[K]) => setLens((l) => ({ ...l, [k]: v }));

  const players = data?.players ?? [];
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return players;
    return players.filter((p) => p.name.toLowerCase().includes(s) || String(p.phone).includes(s));
  }, [players, q]);
  // الوافل يعرض الفوج كاملاً ويُعتّم من هو خارج البحث — لا يُخفيه
  const dimmed = useMemo(() => {
    if (shown.length === players.length) return new Set<number>();
    const inShown = new Set(shown.map((p) => p.id));
    return new Set(players.filter((p) => !inShown.has(p.id)).map((p) => p.id));
  }, [players, shown]);

  const t = data?.totals;
  const revenue = t ? t.paidTotal + t.fnbTotal : 0;
  const lensDirty = JSON.stringify(lens) !== JSON.stringify(EMPTY_LENS);

  const doExport = async (format: 'pdf' | 'excel') => {
    setExporting(format);
    try {
      await exportReport('player-explorer', lensToReportParams(lens), format);
      flash(format === 'pdf' ? 'صُدّر ملفّ PDF' : 'صُدّر ملفّ Excel');
    } catch (e: any) { flash(e.message || 'فشل التصدير'); }
    finally { setExporting(''); }
  };

  const copyTable = async () => {
    const head = ['الاسم', 'الهاتف', 'التسجيل', 'فعاليّات', 'مباريات', 'فوز', 'حجز', 'لم يحضر', 'أنفق', 'تقييمه', 'أوّل حضور', 'آخر حضور'];
    const body = shown.map((p: Player) => [
      p.name, p.phone, p.createdAt.slice(0, 10), p.activities, p.matches, p.wins,
      p.bookedActivities, p.noShows, (p.paidTotal + p.fnbTotal).toFixed(2),
      p.feedbackAvg ?? '', p.firstActivityAt || '', p.lastActivityAt || '',
    ].join('\t'));
    try {
      await navigator.clipboard.writeText([head.join('\t'), ...body].join('\n'));
      flash(`نُسخ ${shown.length} صفّاً — الصقه في Excel`);
    } catch { flash('تعذّر النسخ — المتصفّح منع الحافظة'); }
  };

  const onSaveView = async () => {
    const name = window.prompt('اسم العدسة؟ (مثلاً: دفعة جديدة لم تعد)');
    if (!name) return;
    try { setViews(await saveView(name, lens)); flash('حُفظت العدسة'); }
    catch (e: any) { flash(e.message || 'تعذّر الحفظ'); }
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* ── الرأس ── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-white">🔎 مستكشف اللاعبين</h1>
          <p className="text-[12.5px] text-gray-500 mt-1 max-w-[64ch] leading-relaxed">
            استعلامٌ حيٌّ من قاعدة البيانات — لا كاش. اختر فوجاً بتاريخ إنشاء الحساب، وفترةَ قياسٍ مستقلّة،
            فتُجيبك الصفحة: من حضر، ومن عاد، ومن حجز ولم يحضر، وكم دفع، وهل رضي.
          </p>
        </div>
        <div className="text-[11px] text-gray-500 text-left tabular-nums" dir="ltr">
          {data && <>{data.tookMs} ms · {new Date(data.generatedAt).toLocaleTimeString('ar-EG')}</>}
        </div>
      </div>

      {/* ── شريط العدسة ── */}
      <div className="sticky top-0 z-30 bg-gray-900/95 backdrop-blur border border-gray-700/40 rounded-2xl p-3.5 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <Field label="أُنشئ الحساب من">
            <DateInput value={lens.signupFrom} onChange={(v) => set('signupFrom', v)} />
          </Field>
          <Field label="إلى">
            <DateInput value={lens.signupTo} onChange={(v) => set('signupTo', v)} />
          </Field>
          <span className="w-px h-9 bg-gray-700/60 mx-1 self-end mb-1" />
          <Field label="نافذة القياس من" hint="فارغة = منذ تسجيل كلّ لاعب">
            <DateInput value={lens.windowFrom} onChange={(v) => set('windowFrom', v)} />
          </Field>
          <Field label="إلى">
            <DateInput value={lens.windowTo} onChange={(v) => set('windowTo', v)} />
          </Field>
          <span className="w-px h-9 bg-gray-700/60 mx-1 self-end mb-1" />
          <Field label="الموقع">
            <select value={lens.locationIds[0] ?? ''}
              onChange={(e) => set('locationIds', e.target.value ? [Number(e.target.value)] : [])}
              className={inputCls + ' w-40'}>
              <option value="">كلّ المواقع</option>
              {locations.map((o) => <option key={o.value} value={o.value}>{o.labelAr}</option>)}
            </select>
          </Field>
          <Field label="الموسم">
            <select value={lens.seasonIds[0] ?? ''}
              onChange={(e) => set('seasonIds', e.target.value ? [Number(e.target.value)] : [])}
              className={inputCls + ' w-36'}>
              <option value="">كلّ المواسم</option>
              {seasons.map((o) => <option key={o.value} value={o.value}>{o.labelAr}</option>)}
            </select>
          </Field>
          <Field label="الجنس">
            <select value={lens.gender} onChange={(e) => set('gender', e.target.value as Lens['gender'])} className={inputCls + ' w-24'}>
              <option value="">الكل</option><option value="MALE">ذكر</option><option value="FEMALE">أنثى</option>
            </select>
          </Field>
          <Field label="فعاليّات من">
            <NumInput value={lens.minActivities} onChange={(v) => set('minActivities', v)} />
          </Field>
          <Field label="إلى">
            <NumInput value={lens.maxActivities} onChange={(v) => set('maxActivities', v)} />
          </Field>

          <div className="flex items-center gap-3 self-end mb-1.5 mr-auto">
            <Check label="اشمل مواقع الاختبار" checked={lens.includeTestLocations} onChange={(v) => set('includeTestLocations', v)} />
            <Check label="اشمل الحسابات التجريبيّة" checked={lens.includeTestAccounts} onChange={(v) => set('includeTestAccounts', v)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center border-t border-gray-700/40 pt-3">
          {PRESETS.map((p) => (
            <button key={p.label} type="button"
              onClick={() => setLens({ ...EMPTY_LENS, ...p.lens() } as Lens)}
              className="text-[11.5px] px-2.5 py-1 rounded-full bg-gray-800/60 border border-gray-700/50 text-gray-300 hover:border-amber-500/60 hover:text-amber-400 transition">
              {p.icon} {p.label}
            </button>
          ))}
          {views.length > 0 && <span className="w-px h-5 bg-gray-700/60 mx-1" />}
          {views.map((v) => (
            <span key={v.id} className="inline-flex items-center rounded-full bg-amber-500/10 border border-amber-500/30 overflow-hidden">
              <button type="button" onClick={() => setLens({ ...EMPTY_LENS, ...v.lens })}
                title={v.createdBy ? `حفظها ${v.createdBy}` : undefined}
                className="text-[11.5px] px-2.5 py-1 text-amber-300 hover:text-white">💾 {v.name}</button>
              <button type="button" title="حذف العدسة"
                onClick={async () => { try { setViews(await removeView(v.id)); } catch { flash('تعذّر الحذف'); } }}
                className="px-1.5 text-[11px] text-amber-500/60 hover:text-rose-400">✕</button>
            </span>
          ))}
          <div className="mr-auto flex items-center gap-2">
            {lensDirty && (
              <>
                <button type="button" onClick={onSaveView}
                  className="text-[11.5px] px-2.5 py-1 rounded-lg bg-gray-800/60 border border-gray-700/50 text-gray-300 hover:border-amber-500/60">
                  💾 احفظ هذه العدسة
                </button>
                <button type="button" onClick={() => setLens(EMPTY_LENS)}
                  className="text-[11.5px] text-gray-500 hover:text-gray-300 underline">مسح الفلاتر</button>
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-[13px] text-rose-300">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="py-24 text-center text-gray-600 text-sm">⏳ يُستعلَم…</div>
      ) : t ? (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* ── المؤشّرات ── */}
          <div className="grid gap-2.5 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(158px,1fr))' }}>
            <Kpi icon="👥" label="لاعبو الفوج" value={fmtNum(t.players)} tone="sky"
              sub={q ? `معروض ${fmtNum(shown.length)} بالبحث` : undefined} />
            <Kpi icon="🎯" label="حضروا فعاليّة" value={fmtNum(t.attended)} tone="green"
              sub={`${pctOf(t.attended, t.players)}٪ من الفوج`} />
            <Kpi icon="🔁" label="عادوا" value={fmtNum(t.returned)} tone="gold"
              sub={`${t.returnRate}٪ ممّن حضروا`} />
            <Kpi icon="🚫" label="لم يحضروا إطلاقاً" value={fmtNum(t.neverAttended)} tone="red" />
            <Kpi icon="📊" label="متوسّط الفعاليّات" value={t.avgActivities} tone="violet" sub="لمن حضر" />
            <Kpi icon="💰" label="الإيراد المحصّل" value={fmtMoney(revenue)} tone="green"
              sub={`حجوزات ${t.paidTotal.toFixed(2)} · منيو ${t.fnbTotal.toFixed(2)}`} />
            <Kpi icon="⭐" label="متوسّط التقييم" value={t.feedbackAvg ?? '—'} tone="gold"
              sub={`${fmtNum(t.feedbackCount)} تقييماً`} />
            <Kpi icon="🔔" label="يمكن الوصول إليهم" value={fmtNum(t.withPush)} tone="sky" sub="لديهم جهاز إشعارات" />
          </div>

          {/* ── القمع + التحويل ── */}
          <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,.65fr)' }}>
            <div>
              <h3 className="text-sm font-bold text-white mb-2.5">
                📉 أين يتسرّب اللاعبون
                <span className="text-[10.5px] text-gray-500 font-normal mr-2.5">اضغط أيّ درجةٍ لتفلتر عليها</span>
              </h3>
              <Funnel data={data!.funnel} total={t.players} lens={lens}
                onGate={(min) => setLens((l) => ({ ...l, minActivities: min, maxActivities: null }))} />
            </div>
            <ConversionStrip t={t} />
          </div>

          {/* ── الوافل + الأفواج ── */}
          <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))' }}>
            <Waffle players={players} lens={lens} dimmed={dimmed}
              onRange={(min, max) => setLens((l) => ({ ...l, minActivities: min, maxActivities: max }))} />
            <SignupWeeks players={players} />
          </div>

          <div className="mb-5"><CohortMatrix players={players} /></div>

          {/* ── شريط أدوات الجدول ── */}
          <div className="flex flex-wrap gap-2 items-center mb-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو الهاتف…"
              className={inputCls + ' w-56'} />
            <div className="relative">
              <button type="button" onClick={() => setShowCols((v) => !v)} className={btnCls}>
                🧱 الأعمدة <span className="text-gray-500 tabular-nums">({cols.length})</span>
              </button>
              {showCols && (
                <div className="absolute z-40 mt-1.5 w-[320px] bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-2xl space-y-2.5">
                  {COL_GROUPS.map((g) => (
                    <div key={g.key}>
                      <p className="text-[10px] tracking-wider text-gray-500 font-semibold mb-1.5">{g.label}</p>
                      <div className="flex flex-wrap gap-1">
                        {COLUMNS.filter((c) => c.group === g.key).map((c) => {
                          const on = cols.includes(c.key);
                          return (
                            <button key={c.key} type="button" aria-pressed={on}
                              onClick={() => persistCols(on ? cols.filter((k) => k !== c.key) : [...cols, c.key])}
                              className={`text-[11px] px-2 py-0.5 rounded-full border transition ${on
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                                : 'bg-gray-800/60 border-gray-700/50 text-gray-400 hover:border-gray-600'}`}>
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 border-t border-gray-700/50 pt-2">
                    <button type="button" onClick={() => persistCols(DEFAULT_COLS)} className="text-[11px] text-gray-400 hover:text-white">الافتراضيّ</button>
                    <button type="button" onClick={() => persistCols(COLUMNS.map((c) => c.key))} className="text-[11px] text-gray-400 hover:text-white">الكلّ</button>
                    <button type="button" onClick={() => setShowCols(false)} className="text-[11px] text-amber-400 mr-auto">تمّ</button>
                  </div>
                </div>
              )}
            </div>
            <button type="button" onClick={() => setShowTpl((v) => !v)} className={btnCls}>💬 قالب الرسالة</button>
            <span className="w-px h-6 bg-gray-700/60" />
            <button type="button" onClick={() => doExport('pdf')} disabled={!!exporting} className={btnCls + ' disabled:opacity-50'}>
              {exporting === 'pdf' ? '⏳' : '🖨️'} PDF
            </button>
            <button type="button" onClick={() => doExport('excel')} disabled={!!exporting} className={btnCls + ' disabled:opacity-50'}>
              {exporting === 'excel' ? '⏳' : '📊'} Excel
            </button>
            <button type="button" onClick={copyTable} className={btnCls}>📋 نسخ</button>
            <span className="mr-auto text-[12px] text-gray-500">
              يعرض <b className="text-amber-400 tabular-nums">{fmtNum(shown.length)}</b> من {fmtNum(t.players)}
            </span>
          </div>

          {showTpl && (
            <div className="bg-gray-800/30 border border-green-500/20 rounded-2xl p-4 space-y-2.5 mb-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-green-400">💬 قالب الرسالة — واتساب وإشعار</h3>
                <button type="button" onClick={() => { setWaTemplate(WA_DEFAULT); localStorage.setItem(TPL_KEY, WA_DEFAULT); }}
                  className="text-[11px] text-gray-400 hover:text-white">استعادة الافتراضيّ</button>
              </div>
              <input value={notifTitle}
                onChange={(e) => { setNotifTitle(e.target.value); localStorage.setItem(TITLE_KEY, e.target.value); }}
                placeholder="عنوان الإشعار" className={inputCls + ' w-full'} />
              <textarea value={waTemplate} rows={4}
                onChange={(e) => { setWaTemplate(e.target.value); localStorage.setItem(TPL_KEY, e.target.value); }}
                className={inputCls + ' w-full leading-relaxed resize-y'} />
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] text-gray-500">أدرِج متغيّراً:</span>
                {WA_VARS.map((v) => (
                  <button key={v.token} type="button" title={v.token}
                    onClick={() => { const n = waTemplate + v.token; setWaTemplate(n); localStorage.setItem(TPL_KEY, n); }}
                    className="text-[11px] px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/25 text-green-300 hover:bg-green-500/20">
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <PlayerTable players={shown} cols={cols} waTemplate={waTemplate} notifTitle={notifTitle} onToast={flash} />

          {/* ── تحفّظات على البيانات — تُذكَر ولا تُخفى ── */}
          <div className="mt-6 grid gap-4 text-[11.5px] text-gray-500 leading-relaxed"
            style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
            <p className="border-r-2 border-gray-700 pr-3">
              <b className="text-gray-300">الحضور</b> يُشتقّ من سلسلة{' '}
              <span dir="ltr" className="font-mono text-[10.5px]">match_players → matches → sessions → activities</span>{' '}
              بعد استبعاد مواقع الاختبار. مباراةٌ في غرفةٍ أونلاين بلا فعاليّة تُحتسب في المباريات لا في الحضور.
            </p>
            <p className="border-r-2 border-gray-700 pr-3">
              <b className="text-gray-300">عدم الحضور</b> يُشتقّ من غياب صفّ مشاركةٍ في فعاليّة الحجز، لا من الحقل{' '}
              <span dir="ltr" className="font-mono text-[10.5px]">checked_in</span> — فذاك غير مُستعمَلٍ عمليّاً في النظام.
            </p>
            <p className="border-r-2 border-gray-700 pr-3">
              <b className="text-gray-300">التشبس</b> مؤشّرُ تفاعلٍ لا إيراد: كلّ حركاته جوائزُ داخل اللعبة،
              والشحن بالدينار شبه معدومٍ في السجلّ. لذلك لا يدخل خانة «الإيراد المحصّل».
            </p>
          </div>
        </div>
      ) : null}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-100 text-gray-900 px-4 py-2 rounded-lg text-[13px] shadow-2xl z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── عناصر صغيرة ──────────────────────────────────────
const inputCls = 'bg-gray-800/60 border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-[12.5px] text-white outline-none focus:border-amber-500/60';
const btnCls = 'text-[12px] px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/50 text-gray-200 hover:border-amber-500/60 hover:text-amber-400 transition';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] tracking-wide text-gray-500">{label}{hint && <span className="text-gray-600"> · {hint}</span>}</span>
      {children}
    </label>
  );
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
    className={inputCls + ' tabular-nums w-[142px]'} dir="ltr" />;
}

function NumInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return <input type="number" min={0} value={value ?? ''} placeholder="—"
    onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
    className={inputCls + ' w-[68px] text-center tabular-nums'} dir="ltr" />;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-[11.5px] text-gray-400 cursor-pointer whitespace-nowrap">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-amber-500" />
      {label}
    </label>
  );
}
