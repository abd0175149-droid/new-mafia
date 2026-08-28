'use client';

// ══════════════════════════════════════════════════════
// 🗓️ برنامج الليلة — محرّر الجدول الزمنيّ للفعاليّة
// ══════════════════════════════════════════════════════
// 🔴 خطّةٌ تُكتب لا سجلٌّ يُشتقّ: الغرف تُنشأ ليلتَها وقد لا تُنشأ، وكشفُ الحضور
//    يُطبع **قبل** الليلة ليعرف الناسُ متى يحضرون — فلا يصحّ أن يعتمد البرنامج
//    على شيءٍ يُولد بعده.
// 🔴 الوقتُ نصٌّ `HH:MM` لا طابعٌ زمنيّ: هذه ساعاتُ ليلةٍ لا لحظاتٌ مطلقة، فلا
//    منطقةَ زمنيّة تُزيحها ولا تاريخَ يجب أن يُطابق تاريخ الفعاليّة.

import { useEffect, useState } from 'react';

export type SlotKind = 'game' | 'break';
export interface Slot { kind: SlotKind; label: string; start: string; end: string }

const ORD = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة'];

const toMin = (t: string) => {
  const [h, m] = String(t || '').split(':');
  return (Number(h) || 0) * 60 + (Number(m) || 0);
};
const toHHMM = (x: number) => {
  const v = ((x % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};
/** المدّة عابرةً منتصفَ الليل — ليلةُ النادي تمتدّ بعد الثانية عشرة */
export const slotDur = (s: Slot) => {
  const d = toMin(s.end) - toMin(s.start);
  return d < 0 ? d + 1440 : d;
};
export const durText = (d: number) => {
  const h = Math.floor(d / 60), m = d % 60;
  return h && m ? `${h}س ${m}د` : h ? `${h}س` : `${m}د`;
};

export default function ScheduleEditor({
  activityId, activityDate, initial,
}: { activityId: number; activityDate?: string | null; initial?: Slot[] }) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<Slot[]>(Array.isArray(initial) ? initial : []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const [nGames, setNGames] = useState(3);
  const [dGame, setDGame] = useState(75);
  const [dBreak, setDBreak] = useState(15);

  useEffect(() => { if (Array.isArray(initial)) setSlots(initial); }, [initial]);

  /** وقتُ بدء الفعاليّة بتوقيت عمّان — نقطةُ انطلاق التوليد */
  const startAt = () => {
    if (!activityDate) return '19:30';
    const d = new Date(activityDate);
    if (isNaN(d.getTime())) return '19:30';
    const p = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Amman', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d);
    const g = (t: string) => p.find(x => x.type === t)?.value || '00';
    return `${g('hour')}:${g('minute')}`;
  };

  const issues = slots.flatMap((s, i) => {
    const out: string[] = [];
    if (slotDur(s) <= 0) out.push(`السطر ${i + 1}: وقت الانتهاء ليس بعد البدء`);
    if (i > 0) {
      const gap = toMin(s.start) - toMin(slots[i - 1].end);
      if (gap < 0 && Math.abs(gap) < 720) out.push(`السطر ${i + 1}: يبدأ قبل انتهاء ما قبله`);
    }
    return out;
  });

  const games = slots.filter(s => s.kind === 'game').length;
  const total = slots.length ? (toMin(slots[slots.length - 1].end) - toMin(slots[0].start) + 1440) % 1440 : 0;

  const set = (i: number, f: keyof Slot, v: string) => {
    setSlots(prev => prev.map((s, j) => (j === i ? { ...s, [f]: v } : s)));
    setSaved(false);
  };

  const addSlot = (kind: SlotKind) => {
    const last = slots.length ? slots[slots.length - 1].end : startAt();
    const n = slots.filter(s => s.kind === 'game').length;
    setSlots(prev => [...prev, {
      kind,
      label: kind === 'game' ? `اللعبة ${ORD[n] || n + 1}` : 'استراحة',
      start: last,
      end: toHHMM(toMin(last) + (kind === 'game' ? dGame : dBreak)),
    }]);
    setSaved(false);
  };

  const generate = () => {
    const n = Math.max(1, Math.min(8, nGames));
    const g = Math.max(15, Math.min(180, dGame));
    const b = Math.max(0, Math.min(60, dBreak));
    let t = toMin(startAt());
    const out: Slot[] = [];
    for (let i = 0; i < n; i++) {
      out.push({ kind: 'game', label: `اللعبة ${ORD[i] || i + 1}`, start: toHHMM(t), end: toHHMM(t + g) });
      t += g;
      if (b > 0 && i < n - 1) {
        out.push({ kind: 'break', label: 'استراحة', start: toHHMM(t), end: toHHMM(t + b) });
        t += b;
      }
    }
    setSlots(out);
    setSaved(false);
  };

  const save = async () => {
    setSaving(true); setErr('');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/activities/${activityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gameSchedule: slots }),
      });
      if (!res.ok) throw new Error(`خطأ ${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2600);
    } catch (e: any) {
      setErr(e.message || 'تعذّر الحفظ');
    }
    setSaving(false);
  };

  return (
    <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl overflow-hidden" dir="rtl">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-700/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🗓️</span>
          <span className="font-bold text-white">برنامج الليلة</span>
          {slots.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
              {games} ألعاب · {durText(total)}
            </span>
          )}
        </div>
        <span className="text-gray-500">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3">
          <p className="text-[11px] text-gray-500 leading-relaxed">
            يُطبع في كشف الحضور قبل بطاقات الحاجزين — فيعرف الناس متى تبدأ كلّ لعبة.
          </p>

          {/* المولّد */}
          <div className="flex items-center gap-2 flex-wrap bg-gray-900/60 border border-gray-700/40 rounded-xl px-3 py-2.5">
            <span className="text-[10.5px] text-gray-500">ألعاب</span>
            <input type="number" min={1} max={8} value={nGames}
              onChange={e => setNGames(Number(e.target.value) || 1)}
              className="w-12 bg-gray-900 border border-gray-700/60 rounded-md text-amber-400 text-xs text-center font-mono py-1" />
            <span className="text-[10.5px] text-gray-500">مدّة</span>
            <input type="number" min={15} max={180} step={5} value={dGame}
              onChange={e => setDGame(Number(e.target.value) || 60)}
              className="w-14 bg-gray-900 border border-gray-700/60 rounded-md text-amber-400 text-xs text-center font-mono py-1" />
            <span className="text-[10.5px] text-gray-500">استراحة</span>
            <input type="number" min={0} max={60} step={5} value={dBreak}
              onChange={e => setDBreak(Number(e.target.value) || 0)}
              className="w-12 bg-gray-900 border border-gray-700/60 rounded-md text-amber-400 text-xs text-center font-mono py-1" />
            <button onClick={generate}
              className="mr-auto text-[11px] font-bold px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition">
              ⚡ ولّد من {startAt()}
            </button>
          </div>

          {/* الصفوف */}
          <div className="space-y-1.5">
            {slots.map((s, i) => {
              const bad = slotDur(s) <= 0;
              return (
                <div key={i}
                  className={`flex items-center gap-2 rounded-xl px-2.5 py-2 border ${
                    bad ? 'border-rose-500/50' : 'border-gray-700/40'
                  } ${s.kind === 'break' ? 'bg-gray-900/40 border-dashed' : 'bg-gray-900/60'}`}>
                  <span className="text-gray-600 text-[11px] w-4 text-center shrink-0">
                    {s.kind === 'break' ? '☕' : slots.slice(0, i + 1).filter(x => x.kind === 'game').length}
                  </span>
                  <input type="text" value={s.label} onChange={e => set(i, 'label', e.target.value)}
                    className="flex-1 min-w-0 bg-transparent text-white text-xs font-bold focus:outline-none focus:bg-gray-800/60 rounded px-1 py-0.5" />
                  <input type="time" value={s.start} onChange={e => set(i, 'start', e.target.value)}
                    className="bg-gray-900 border border-gray-700/60 rounded-md text-gray-200 text-[11px] font-mono px-1.5 py-1" />
                  <input type="time" value={s.end} onChange={e => set(i, 'end', e.target.value)}
                    className="bg-gray-900 border border-gray-700/60 rounded-md text-gray-200 text-[11px] font-mono px-1.5 py-1" />
                  <span className="text-[10px] font-mono text-amber-400/80 w-10 text-center shrink-0">
                    {bad ? '—' : durText(slotDur(s))}
                  </span>
                  <button onClick={() => { setSlots(prev => prev.filter((_, j) => j !== i)); setSaved(false); }}
                    className="text-gray-600 hover:text-rose-400 transition text-sm px-1 shrink-0" title="حذف">✕</button>
                </div>
              );
            })}
            {slots.length === 0 && (
              <p className="text-center text-gray-600 text-xs py-4">
                لا برنامج بعد — ولّده آليّاً أو أضف لعبةً بيدك
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={() => addSlot('game')}
              className="flex-1 text-[11.5px] font-bold py-2 rounded-xl border border-dashed border-gray-700 text-gray-400 hover:border-amber-500/40 hover:text-amber-400 transition">
              ＋ لعبة
            </button>
            <button onClick={() => addSlot('break')}
              className="flex-1 text-[11.5px] font-bold py-2 rounded-xl border border-dashed border-gray-700 text-gray-400 hover:border-amber-500/40 hover:text-amber-400 transition">
              ＋ استراحة
            </button>
          </div>

          {issues.length > 0 && (
            <div className="text-[11px] text-rose-300 bg-rose-500/[0.07] border border-rose-500/25 rounded-xl px-3 py-2 space-y-0.5">
              {issues.map((w, i) => <p key={i}>⚠️ {w}</p>)}
            </div>
          )}
          {err && <p className="text-[11px] text-rose-400">❌ {err}</p>}

          <button onClick={save} disabled={saving}
            className="w-full py-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 transition font-bold text-sm disabled:opacity-40">
            {saving ? '⏳ جارٍ الحفظ...' : saved ? '✅ حُفظ — يظهر في كشف الحضور' : '💾 حفظ البرنامج'}
          </button>
        </div>
      )}
    </div>
  );
}
