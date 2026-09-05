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
import { motion, AnimatePresence } from 'framer-motion';

interface DayPlan {
  dow: number;
  labelAr: string;
  dateUtc: string;
  dateAmman: string;
  name: string;
  maxCapacity: number;
  exists: null | { id: number; name: string; status: string };
}

interface Preview {
  weekStartAmman: string;
  locationId: number | null;
  locationName: string;
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
  const months = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيّار', 'حزيران',
    'تمّوز', 'آب', 'أيلول', 'تشرين الأوّل', 'تشرين الثاني', 'كانون الأوّل'];
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

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const d: Preview = await apiFetch('/api/activities/week/preview');
      setPv(d);
      setRows(d.days || []);
    } catch (e: any) {
      setErr(e?.message || 'تعذّر تحميل المعاينة');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const pending = rows.filter(r => !r.exists);

  const create = async () => {
    if (!pv || pending.length === 0) return;
    setBusy(true); setErr('');
    try {
      const res = await apiFetch('/api/activities/week', {
        method: 'POST',
        body: JSON.stringify({
          days: pending.map(r => ({ dateUtc: r.dateUtc, name: r.name, maxCapacity: r.maxCapacity })),
          locationId: pv.locationId,
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
                  {pv ? `من الأحد ${prettyAmman(pv.weekStartAmman + ' 00:00').split(' · ')[0]} · ${pv.locationName || 'بلا مكان'}` : 'يُحمّل…'}
                </span>
              </div>
              <button onClick={onClose} className="w-9 h-9 rounded-lg text-gray-500 hover:text-white">✕</button>
            </div>

            {/* ── الجسم ── */}
            <div className="overflow-y-auto p-3 space-y-2.5 flex-1">
              {loading ? (
                <p className="text-center text-gray-500 text-sm py-12">يُحمّل المعاينة…</p>
              ) : err && !pv ? (
                <p className="text-center text-rose-400 text-sm py-12">{err}</p>
              ) : (
                <>
                  {rows.map((r, i) => (
                    <div
                      key={r.dow}
                      className="rounded-xl px-3.5 py-3"
                      style={r.exists
                        ? { background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)' }
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
                disabled={busy || loading || pending.length === 0}
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
