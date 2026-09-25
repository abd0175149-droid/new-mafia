'use client';

// ══════════════════════════════════════════════════════
// 📅 ألعابُ الأسبوع — نافذةُ معاينةٍ ثمّ إنشاء
//
// 🔴 لا تُنشئ شيئاً قبل أن يرى المالكُ ما سيُنشأ: تُحمَّل المعاينةُ من الخادم،
//    وتُعرض الأيّامُ الأربعة بحالة كلٍّ منها — «سيُنشأ» أو «موجودٌ سلفاً».
//    ويومٌ موجودٌ لا يُعرض للتعديل أصلاً، فلا يظنّ أحدٌ أنّه سيُستبدل.
//
// 🔴 والاسمُ والسعةُ قابلان للتعديل قبل الإنشاء: القالبُ مبنيٌّ على متوسّط ستّة
//    أسابيع، لكنّ الأسبوعَ القادم قد يختلف — عيدٌ أو حجزٌ خاصّ. القالبُ اقتراحٌ
//    لا قَدَر.
//
// 🔴 وإشعارٌ واحدٌ للأسبوع كلِّه — يُنفَّذ في الخادم، ويُقال هنا صراحةً كي لا
//    يظنّ المالكُ أنّه يُرسل أربعةَ إشعاراتٍ للاعبين.
// ══════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';
import { AR_MONTHS } from '@/lib/constants';
import { motion, AnimatePresence } from 'framer-motion';
import { LocationOptgroups } from '@/components/admin/CityBadge';

interface DayPlan {
  dow: number;
  labelAr: string;
  dateUtc: string;
  dateAmman: string;
  name: string;
  maxCapacity: number;
  exists: null | { id: number; name: string; status: string };
  /** ليلةٌ أضافها المالكُ بيده — خارج القالب، وتمرّ ولو كان لليوم نشاطٌ سلفاً */
  extra?: boolean;
}

const DOW_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** «٢٠٢٦-٠٩-٠٦» + «19:00» ⇒ لحظةُ UTC. عمّان +٣ ثابتةً منذ إلغاء التوقيت الصيفيّ. */
function ammanToUtcIso(day: string, hhmm: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h - 3, mi)).toISOString();
}

function dowOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

interface Preview {
  weekStartAmman: string;
  locationId: number | null;
  locationName: string;
  /** 🏙️ مدينةُ مكان القالب — تُعرض في الرأس */
  cityId?: number | null;
  cityName?: string | null;
  seatTemplateId: number | null;
  schedule: { kind: string; label: string; start: string; end: string }[];
  seatConstraints: any;
  days: DayPlan[];
  toCreate: number;
}

const ar = (n: number | string) => String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

/** «٢٠٢٦-٠٩-٠٦ ١٩:٠٠» ← «٦ أيلول · ٧:٠٠ م» */
function prettyAmman(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/.exec(s || '');
  if (!m) return s;
  const months = AR_MONTHS;
  let h = Number(m[4]);
  const period = h >= 12 ? 'م' : 'ص';
  h = h % 12 || 12;
  return `${ar(Number(m[3]))} ${months[Number(m[2]) - 1]} · ${ar(h)}:${ar(m[5])} ${period}`;
}

function hhmmAr(t: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return t;
  let h = Number(m[1]);
  const period = h >= 12 ? 'م' : 'ص';
  h = h % 12 || 12;
  return `${ar(h)}:${ar(m[2])} ${period}`;
}

// ══════════════════════════════════════════════════════
// 📅 أحدُ الأسبوع لأيّ تاريخ
// ══════════════════════════════════════════════════════
// القاعدةُ نفسُها التي في الخادم حرفيّاً (`weekStartAmman`): السبتُ يومٌ خارج
// الأسبوع لا آخرُه، فمن اختاره أراد الأسبوعَ الذي يبدأ غداً. ولو خالفت الواجهةُ
// الخادمَ هنا لرأى المستخدمُ أسبوعاً واختار الخادمُ غيرَه.
function sundayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dow = new Date(t).getUTCDay();
  return new Date(dow === 6 ? t + 86400000 : t - dow * 86400000).toISOString().slice(0, 10);
}
const shiftDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
/** كم يوماً بين اليوم وذلك التاريخ (موجبٌ للمستقبل) */
const daysFromToday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())) / 86400000);
};
// 🔴 الخادم يتخطّى أيّ تاريخٍ يبعد عن الآن أكثر من ٦٠ يوماً («خارج المدى
//    المعقول» — حارسٌ وُضع بعد نشاطِ ٤:٠٠ فجراً أُنشئ بالخطأ). فالنافذة تقف
//    عند الحدّ نفسه بدل أن تَعِد بإنشاءٍ يُتخطّى صامتاً.
const MAX_AHEAD_DAYS = 60;

/**
 * يُعيد ضبط ساعة فتح الأبواب لصفٍّ لم يُنشأ بعد.
 * 🔴 عمّان +٣ طوال العام منذ إلغاء التوقيت الصيفيّ (٢٠٢٢) — وهو الافتراضُ
 *    نفسُه في `ammanWallToUtc` بالخادم. لو اختلفا لأُنشئت الألعاب بساعةٍ غير
 *    التي تُعرض.
 */
function atTime(row: { dateAmman: string; dateUtc: string }, hhmm: string) {
  const day = row.dateAmman.split(' ')[0];
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  if (![y, m, d, h, mi].every(Number.isFinite)) return row;
  return {
    ...row,
    dateUtc: new Date(Date.UTC(y, m - 1, d, h - 3, mi)).toISOString(),
    dateAmman: `${day} ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`,
  };
}

export default function WeekGamesModal({
  open, onClose, onDone, apiFetch,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
  apiFetch: (path: string, opts?: RequestInit) => Promise<any>;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pv, setPv] = useState<Preview | null>(null);
  const [rows, setRows] = useState<DayPlan[]>([]);
  const [showSchedule, setShowSchedule] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [nd, setNd] = useState({ day: '', time: '19:00', name: '', cap: 30 });
  // 🏙️ المكانُ قابلٌ للتبديل قبل الإنشاء — القالبُ يقترح مكانَه، والمدينةُ تتبع المكان
  const [locations, setLocations] = useState<any[]>([]);
  const [locId, setLocId] = useState<string>('');
  // 📅 أسبوعٌ مختار: '' = الأسبوع الذي يحسبه الخادم تلقائيّاً (السلوك القديم)
  const [weekRef, setWeekRef] = useState('');
  // ⏰ وقتُ بدايةٍ واحد يسري على كلّ ما سيُنشأ — كان ثابتاً في الشيفرة لكلّ يوم
  const [startTime, setStartTime] = useState('');
  const selLoc = locations.find(l => String(l.id) === locId);
  const locName: string = selLoc?.name || pv?.locationName || '';
  const cityName: string | null = selLoc ? (selLoc.cityName ?? null) : (pv?.cityName ?? null);

  const changeLocation = (id: string) => {
    const from = locName;
    const to = locations.find(l => String(l.id) === id)?.name || '';
    setLocId(id);
    // الأسماءُ المولَّدة تبدأ باسم المكان — تُستبدل للصفوف التي ستُنشأ فقط
    if (!from || !to || from === to) return;
    setRows(prev => prev.map(r => (!r.exists && r.name.startsWith(from) ? { ...r, name: to + r.name.slice(from.length) } : r)));
  };

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      // ظهرُ اليومِ بـUTC: يقع داخل اليوم المدنيّ نفسه في عمّان مهما كان الفارق
      const d: Preview = await apiFetch(
        '/api/activities/week/preview' + (weekRef ? `?ref=${weekRef}T12:00:00Z` : ''));
      setPv(d);
      setRows(d.days || []);
      // القالبُ يبدأ بوقتٍ واحد للأيّام كلّها عادةً — نأخذه افتراضاً بلا فرضِه
      const times = (d.days || []).map(x => (x.dateAmman || '').split(' ')[1]).filter(Boolean);
      const common = times.sort((a, b) =>
        times.filter(t => t === b).length - times.filter(t => t === a).length)[0] || '';
      setStartTime(common);
      setLocId(d.locationId ? String(d.locationId) : '');
      apiFetch('/api/locations').then(l => setLocations(Array.isArray(l) ? l : [])).catch(() => setLocations([]));
      // الاثنينُ افتراضاً: أوّلُ يومٍ في الأسبوع لا يشغله القالب
      const start = d.weekStartAmman;
      const taken = new Set((d.days || []).map(x => x.dow));
      const firstFree = [1, 3, 0, 2, 4, 5].find(x => !taken.has(x)) ?? 1;
      const [yy, mm, dd] = start.split('-').map(Number);
      const dt = new Date(Date.UTC(yy, mm - 1, dd + firstFree));
      setNd({ day: dt.toISOString().slice(0, 10), time: '19:00',
        name: '', cap: 30 });
    } catch (e: any) {
      setErr(e?.message || 'تعذّر تحميل المعاينة');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, weekRef]);

  useEffect(() => { if (open) load(); }, [open, load]);

  // الموجودُ سلفاً لا يُمسّ: الوقتُ الجديد لما سيُنشأ وحده
  const applyStartTime = (hhmm: string) => {
    setStartTime(hhmm);
    if (!/^\d{2}:\d{2}$/.test(hhmm)) return;
    setRows(prev => prev.map(r => (r.exists ? r : { ...r, ...atTime(r, hhmm) })));
  };

  const pending = rows.filter(r => !r.exists);
  // 🔴 مقياسٌ واحد للمدى: لو حسبه الشريطُ وحده لبقي الزرُّ يَعِد بإنشاءٍ
  //    يتخطّاه الخادمُ صامتاً — فالتعطيلُ هنا لا في الشريط فقط.
  const weekTooFar = !!pv && daysFromToday(shiftDays(pv.weekStartAmman, 4)) > MAX_AHEAD_DAYS;

  const create = async () => {
    if (!pv || pending.length === 0 || weekTooFar) return;
    const locationId = locId ? Number(locId) : pv.locationId;
    if (!locationId) { setErr('اختر المكان أوّلاً — لا تُنشأ فعاليّةٌ بلا مكان'); return; }
    setBusy(true); setErr('');
    try {
      const res = await apiFetch('/api/activities/week', {
        method: 'POST',
        body: JSON.stringify({
          days: pending.map(r => ({
            dateUtc: r.dateUtc, name: r.name, maxCapacity: r.maxCapacity,
            allowSameDay: !!r.extra,
          })),
          locationId,
          seatTemplateId: pv.seatTemplateId,
          schedule: pv.schedule,
          seatConstraints: pv.seatConstraints,
        }),
      });
      const n = (res?.created || []).length;
      const sk = (res?.skipped || []).length;
      onDone(`أُنشئت ${ar(n)} فعاليّة${sk ? ` · تُخطّيت ${ar(sk)}` : ''} — وأُرسل إشعارٌ واحدٌ للاعبين`);
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'فشل الإنشاء');
    } finally {
      setBusy(false);
    }
  };

  const patch = (i: number, k: 'name' | 'maxCapacity', v: any) =>
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));

  const dropExtra = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i));

  /** يضيف ليلةً خارج القالب بإعداداتها — بنفس برنامج الليلة والقيود. */
  const addExtra = () => {
    if (!nd.day || !/^\d{2}:\d{2}$/.test(nd.time)) { setErr('حدّدْ اليومَ والساعة'); return; }
    const dateUtc = ammanToUtcIso(nd.day, nd.time);
    if (rows.some(r => r.dateUtc === dateUtc)) { setErr('هذه الليلةُ مضافةٌ سلفاً'); return; }
    const dow = dowOf(nd.day);
    const name = nd.name.trim() || `${locName || 'فعاليّة'} ${Number(nd.day.slice(8, 10))}`;
    setErr('');
    setRows(prev => [...prev, {
      dow, labelAr: DOW_AR[dow], dateUtc,
      dateAmman: `${nd.day} ${nd.time}`,
      name, maxCapacity: Number(nd.cap) || 30,
      exists: null, extra: true,
    }].sort((a, b) => a.dateUtc.localeCompare(b.dateUtc)));
    setAddOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          dir="rtl"
          className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
        >
          <motion.div
            initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 28, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-gray-700 bg-[#0b0b0d] overflow-hidden flex flex-col"
            style={{ maxHeight: '88vh' }}
          >
            {/* ── الرأس ── */}
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2.5">
              <span className="text-xl">📅</span>
              <div className="flex-1 min-w-0">
                <b className="block text-[15px] text-white">ألعاب الأسبوع</b>
                <span className="block text-[11.5px] text-gray-500 truncate">
                  {pv ? `من الأحد ${prettyAmman(pv.weekStartAmman + ' 00:00').split(' · ')[0]} · ${locName || 'بلا مكان'}${cityName ? ` · 🏙️ ${cityName}` : ''}` : 'يُحمّل…'}
                </span>
              </div>
              <button onClick={onClose} className="w-9 h-9 rounded-lg text-gray-500 hover:text-white">✕</button>
            </div>

            {/* ── اختيار الأسبوع ── */}
            {pv && (() => {
              const start = pv.weekStartAmman;
              const end = shiftDays(start, 4);            // الجمعة: آخرُ أيّام القالب
              const ahead = daysFromToday(start);
              const tooFar = weekTooFar;
              const past = ahead < 0;
              return (
                <div className="px-4 py-2.5 border-b border-gray-800 bg-gray-950/50">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* 🔴 كلماتٌ لا أسهم: السهمُ في واجهةٍ عربيّة يحتمل قراءتين
                        (اتّجاهُ الزمن أم اتّجاهُ القراءة؟) — والكلمة لا تحتمل إلّا واحدة. */}
                    <button
                      onClick={() => setWeekRef(shiftDays(start, -7))}
                      className="px-2.5 h-8 rounded-lg border border-gray-800 text-[11.5px] font-bold text-gray-400 hover:text-white hover:border-gray-600 shrink-0"
                    >السابق</button>
                    <div className="flex-1 min-w-0 text-center">
                      <div className="text-[12.5px] font-bold text-white truncate">
                        {prettyAmman(start + ' 00:00').split(' · ')[0]} — {prettyAmman(end + ' 00:00').split(' · ')[0]}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {ahead === 0 ? 'هذا الأسبوع' : past ? `أسبوعٌ مضى · قبل ${Math.abs(ahead)} يوماً`
                          : ahead <= 7 ? 'الأسبوع القادم' : `بعد ${ahead} يوماً`}
                      </div>
                    </div>
                    <button
                      onClick={() => setWeekRef(shiftDays(start, 7))}
                      className="px-2.5 h-8 rounded-lg border border-gray-800 text-[11.5px] font-bold text-gray-400 hover:text-white hover:border-gray-600 shrink-0"
                    >التالي</button>
                    <input
                      type="date"
                      value={start}
                      onChange={e => e.target.value && setWeekRef(sundayOf(e.target.value))}
                      className="bg-gray-950 border border-gray-800 rounded-lg px-2 py-1.5 text-[11.5px] text-white focus:border-amber-500 outline-none shrink-0"
                      title="اختر أيّ يومٍ من الأسبوع — يُضبط على أحدِه"
                    />
                    {weekRef && (
                      <button
                        onClick={() => setWeekRef('')}
                        className="text-[11px] text-gray-500 hover:text-amber-400 border border-gray-800 rounded-lg px-2 py-1.5 shrink-0"
                      >↺ هذا الأسبوع</button>
                    )}
                  </div>
                  {/* ⏰ وقتُ بدايةٍ واحد لكلّ ما سيُنشأ */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <label className="text-[11px] text-gray-500 shrink-0">وقت البداية لكلّ الألعاب</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={e => applyStartTime(e.target.value)}
                      className="bg-gray-950 border border-gray-800 rounded-lg px-2 py-1.5 text-[12px] text-white focus:border-amber-500 outline-none"
                    />
                    <span className="text-[10.5px] text-gray-600">
                      {pending.length
                        ? `يسري على ${pending.length === 1 ? 'اللعبة التي ستُنشأ' : `الـ${pending.length} ألعاب التي ستُنشأ`} — والموجودُ سلفاً لا يُمسّ`
                        : 'لا شيء لإنشائه في هذا الأسبوع'}
                    </span>
                  </div>

                  {/* أيُّ تاريخٍ يُضبط على أحدِ أسبوعه، فالبداية أحدٌ دائماً */}
                  {past && (
                    <p className="text-[10.5px] text-amber-400/90 mt-1.5 leading-relaxed">
                      ⚠️ أسبوعٌ مضى — الإنشاء ممكنٌ لكنّ الأنشطة ستولد بتاريخٍ سابق.
                    </p>
                  )}
                  {tooFar && (
                    <p className="text-[10.5px] text-rose-400 mt-1.5 leading-relaxed">
                      ⛔ أبعدُ من {MAX_AHEAD_DAYS} يوماً — الخادم يتخطّى هذه التواريخ. اختر أسبوعاً أقرب.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* ── الجسم ── */}
            <div className="overflow-y-auto p-3 space-y-2.5 flex-1">
              {loading ? (
                <p className="text-center text-gray-500 text-sm py-12">يُحمّل المعاينة…</p>
              ) : err && !pv ? (
                <p className="text-center text-rose-400 text-sm py-12">{err}</p>
              ) : (
                <>
                  {/* 🏙️ المكان — يُبدَّل قبل الإنشاء؛ الأماكنُ مجمّعةٌ بالمدينة */}
                  <div className="rounded-xl px-3.5 py-2.5 flex items-center gap-2"
                    style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)' }}>
                    <span className="text-[12px] text-gray-500 shrink-0">📍 المكان</span>
                    <select value={locId} onChange={e => changeLocation(e.target.value)} disabled={busy}
                      className="flex-1 min-w-0 h-9 px-2 rounded-lg text-[13px] font-bold text-white outline-none disabled:opacity-50"
                      style={{ background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.09)' }}>
                      {!locId && <option value="">— اختر المكان —</option>}
                      {locations.length === 0 && locId && <option value={locId}>{locName || `#${locId}`}</option>}
                      <LocationOptgroups locations={locations} />
                    </select>
                    {cityName && <span className="text-[11px] text-gray-500 shrink-0 whitespace-nowrap">🏙️ {cityName}</span>}
                  </div>

                  {rows.map((r, i) => (
                    <div
                      key={r.extra ? `x-${r.dateUtc}` : `t-${r.dow}`}
                      className="rounded-xl px-3.5 py-3"
                      style={r.exists
                        ? { background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)' }
                        : r.extra
                        ? { background: 'rgba(139,123,232,.08)', border: '1px solid rgba(139,123,232,.35)' }
                        : { background: 'rgba(197,160,89,.07)', border: '1px solid rgba(197,160,89,.3)' }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <b className="text-[14px] text-white">{r.labelAr}</b>
                        <span className="text-[11.5px] text-gray-500">{prettyAmman(r.dateAmman)}</span>
                        <span className="flex-1" />
                        {r.exists ? (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border"
                            style={{ color: '#9ca3af', borderColor: 'rgba(255,255,255,.15)' }}>
                            موجودٌ سلفاً
                          </span>
                        ) : r.extra ? (
                          <>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border"
                              style={{ color: '#8B7BE8', borderColor: 'rgba(139,123,232,.55)' }}>
                              إضافيّة
                            </span>
                            <button onClick={() => dropExtra(i)}
                              className="w-7 h-7 rounded-lg text-gray-600 hover:text-rose-400 text-[13px]"
                              title="أزِلْ هذه الليلة">✕</button>
                          </>
                        ) : (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border"
                            style={{ color: '#C5A059', borderColor: 'rgba(197,160,89,.5)' }}>
                            سيُنشأ
                          </span>
                        )}
                      </div>

                      {r.exists ? (
                        <p className="text-[12px] text-gray-500 truncate">
                          «{r.exists.name}» — لا يُنشأ نشاطٌ ثانٍ في هذا اليوم
                        </p>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            value={r.name}
                            onChange={e => patch(i, 'name', e.target.value)}
                            className="flex-1 min-w-0 h-10 px-3 rounded-lg bg-gray-900/60 border border-gray-700 text-white text-[13.5px] outline-none focus:border-amber-500/50"
                          />
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11.5px] text-gray-500">سعة</span>
                            <input
                              type="number" min={1} max={200}
                              value={r.maxCapacity}
                              onChange={e => patch(i, 'maxCapacity', Number(e.target.value))}
                              className="w-16 h-10 px-2 rounded-lg bg-gray-900/60 border border-gray-700 text-white text-[13.5px] text-center outline-none focus:border-amber-500/50"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* ══ ➕ ليلةٌ خارج القالب ══
                      🔴 في النافذة نفسِها لا في نموذجٍ آخر: مَن يجهّز الأسبوع
                      يقرّر الاستثناءَ وهو يرى الأربعةَ أمامه — لا بعد أن يُغلق
                      ويفتح شاشةً ثانية فينسى ما رآه. */}
                  {!addOpen ? (
                    <button
                      onClick={() => { setAddOpen(true); setErr(''); }}
                      className="w-full h-11 rounded-xl text-[13px] font-bold border border-dashed"
                      style={{ borderColor: 'rgba(139,123,232,.45)', color: '#8B7BE8', background: 'rgba(139,123,232,.05)' }}
                    >
                      ➕ أضِفْ ليلةً خارج القالب
                    </button>
                  ) : (
                    <div className="rounded-xl px-3.5 py-3 space-y-2.5"
                      style={{ background: 'rgba(139,123,232,.07)', border: '1px solid rgba(139,123,232,.35)' }}>
                      <div className="flex items-center gap-2">
                        <b className="flex-1 text-[13px]" style={{ color: '#8B7BE8' }}>ليلةٌ إضافيّة</b>
                        <button onClick={() => setAddOpen(false)}
                          className="w-7 h-7 rounded-lg text-gray-500 hover:text-white text-[13px]">✕</button>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="date" value={nd.day}
                          onChange={e => setNd(v => ({ ...v, day: e.target.value }))}
                          className="flex-1 min-w-0 h-10 px-2.5 rounded-lg bg-gray-900/60 border border-gray-700 text-white text-[13px] outline-none"
                        />
                        <input
                          type="time" value={nd.time}
                          onChange={e => setNd(v => ({ ...v, time: e.target.value }))}
                          className="w-28 h-10 px-2.5 rounded-lg bg-gray-900/60 border border-gray-700 text-white text-[13px] outline-none"
                        />
                      </div>
                      {nd.day && (
                        <p className="text-[11px] text-gray-500">
                          {DOW_AR[dowOf(nd.day)]} · {prettyAmman(`${nd.day} ${nd.time}`)}
                        </p>
                      )}

                      <div className="flex items-center gap-2">
                        <input
                          value={nd.name}
                          onChange={e => setNd(v => ({ ...v, name: e.target.value }))}
                          placeholder={`${locName || 'فعاليّة'} …  (يُولَّد تلقائيّاً إن تُرك فارغاً)`}
                          className="flex-1 min-w-0 h-10 px-3 rounded-lg bg-gray-900/60 border border-gray-700 text-white text-[13px] outline-none placeholder-gray-600"
                        />
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[11.5px] text-gray-500">سعة</span>
                          <input
                            type="number" min={1} max={200} value={nd.cap}
                            onChange={e => setNd(v => ({ ...v, cap: Number(e.target.value) }))}
                            className="w-16 h-10 px-2 rounded-lg bg-gray-900/60 border border-gray-700 text-white text-[13px] text-center outline-none"
                          />
                        </div>
                      </div>

                      <button
                        onClick={addExtra}
                        className="w-full h-10 rounded-lg text-[13px] font-bold"
                        style={{ background: 'rgba(139,123,232,.9)', color: '#0a0812' }}
                      >
                        أضِفْها إلى القائمة
                      </button>
                      <p className="text-[10.5px] text-gray-500 leading-relaxed">
                        تأخذ برنامجَ الليلة وقيودَ الجلوس نفسَها. وتُنشأ ولو كان لليوم نشاطٌ سلفاً —
                        بخلاف أيّام القالب التي تُستثنى.
                      </p>
                    </div>
                  )}

                  {/* ── برنامجُ الليلة — مشتركٌ للأربع ── */}
                  {pv && (
                    <div className="rounded-xl border border-gray-800 bg-gray-900/30 overflow-hidden">
                      <button
                        onClick={() => setShowSchedule(v => !v)}
                        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-right"
                      >
                        <span className="text-[13px]">🕹️</span>
                        <b className="flex-1 text-[13px] text-gray-300">برنامج الليلة — نفسُه في الأربع</b>
                        <span className="text-[11px] text-gray-600">{showSchedule ? '▲' : '▼'}</span>
                      </button>
                      {showSchedule && (
                        <div className="px-3.5 pb-3 space-y-1">
                          {pv.schedule.map((s, k) => (
                            <div key={k} className="flex items-center gap-2 text-[12px]">
                              <span className={s.kind === 'break' ? 'text-gray-600' : 'text-gray-300'}>
                                {s.kind === 'break' ? '☕' : '🎭'} {s.label}
                              </span>
                              <span className="flex-1 border-b border-dashed border-gray-800" />
                              <span className="text-gray-500 tabular-nums">
                                {hhmmAr(s.start)} — {hhmmAr(s.end)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {err && (
                    <p className="text-[12.5px] px-3 py-2 rounded-xl"
                      style={{ color: '#F0A9A4', background: 'rgba(217,69,63,.1)', border: '1px solid rgba(217,69,63,.3)' }}>
                      {err}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* ── الذيل ── */}
            <div className="px-4 py-3 border-t border-gray-800 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[11.5px] text-gray-500 leading-relaxed">
                  {pending.length === 0
                    ? 'كلُّ أيّام الأسبوع لها أنشطةٌ بالفعل.'
                    : `سيُنشأ ${ar(pending.length)} · وسيصل اللاعبين إشعارٌ **واحد** بالأسبوع كلِّه.`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-4 h-11 rounded-xl border border-gray-700 text-gray-300 text-[13px] shrink-0"
              >
                إغلاق
              </button>
              <button
                onClick={create}
                disabled={busy || loading || pending.length === 0 || weekTooFar}
                className="px-5 h-11 rounded-xl text-[13.5px] font-bold shrink-0 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', color: '#0a0805' }}
              >
                {busy ? '…' : `أنشئ ${ar(pending.length)}`}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
