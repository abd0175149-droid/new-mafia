'use client';

// ══════════════════════════════════════════════════════
// 🌙 شاشةُ الليلة الواحدة — اختيارٌ واحدٌ في الليلة كلِّها
//
// تحلّ محلّ ستِّ شاشاتٍ متتابعة كان يختار فيها كلُّ لاعبٍ ستَّ مرّات، خمسٌ منها
// بلا معنى. الخادمُ يرسل لكلّ مقعدٍ **فعلَه هو وقائمتَه هو**، ومَن لا فعلَ له
// يتلقّى سؤالاً محايداً بقائمةٍ معقولة — فلا يعرف أحدٌ أنّ لغيره فعلاً أصلاً.
//
// 🔴 وحاملُ قدرتين (القصُّ أو الساحرةُ إن ورث الاغتيال) يرى خطوتين بترتيبٍ
//    **مقفل**: الاغتيالُ أوّلاً دائماً ثمّ قدرتُه هو. ثباتُ الترتيب يمنع أن
//    يتعلّم اللاعبُ من موضع السؤال شيئاً — لو جاء الإسكاتُ أوّلاً عند القصّ
//    والتعطيلُ أوّلاً عند الساحرة لصار موضعُ السؤال نفسُه إشارة.
//    وإرسالٌ واحدٌ للاثنين: لا مهلتين ولا انتظار.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface OneNightStep {
  abilityId: string | null;
  ask: string;
  targets: { physicalId: number; name: string; avatarUrl?: string | null }[];
  canSkip: boolean;
}

export default function OneNightAsk({ steps, deadline, onSubmit, submitted }: {
  steps: OneNightStep[];
  deadline: number | null;
  /** يُرجِع true عند نجاح الإرسال. */
  onSubmit: (picks: { abilityId: string | null; targetPhysicalId: number | null }[]) => Promise<boolean>;
  submitted: boolean;
}) {
  const [idx, setIdx] = useState(0);
  const [picks, setPicks] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const two = steps.length > 1;
  const cur = steps[Math.min(idx, steps.length - 1)];
  const key = (s: OneNightStep) => s.abilityId ?? '_';
  const chosen = cur ? picks[key(cur)] ?? null : null;

  useEffect(() => {
    if (!deadline) { setLeft(null); return; }
    const upd = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    upd();
    if (tick.current) clearInterval(tick.current);
    tick.current = setInterval(upd, 1000);
    return () => { if (tick.current) clearInterval(tick.current); };
  }, [deadline]);

  // 🔴 تصفيرٌ عند وصول ليلةٍ جديدة: خطواتٌ جديدةٌ تعني اختياراتٍ جديدة، وبقاءُ
  //    القديمة كان يُرسل هدفَ الأمس بلا أن يلمس اللاعبُ شيئاً.
  const sig = steps.map(s => s.abilityId ?? '_').join('|');
  useEffect(() => { setPicks({}); setIdx(0); }, [sig]);

  const send = useCallback(async (all: Record<string, number | null>) => {
    setBusy(true);
    try {
      await onSubmit(steps.map(s => ({ abilityId: s.abilityId, targetPhysicalId: all[key(s)] ?? null })));
    } finally { setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSubmit, sig]);

  if (submitted) {
    return (
      <div className="text-center py-10 px-6">
        <div className="text-5xl mb-3">🌙</div>
        <p className="text-[#C5A059] text-base font-bold" style={{ fontFamily: 'Amiri, serif' }}>وصل اختيارُك</p>
        <p className="text-[#808080] text-[13px] mt-2 leading-relaxed">انتظرِ الصباح — لا شيءَ عليك الآن.</p>
        {left !== null && left > 0 && (
          <p className="text-[#5c554a] text-[11px] mt-4 font-mono tabular-nums" dir="ltr">{left}s</p>
        )}
      </div>
    );
  }

  if (!cur) return null;

  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* الرأس */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2 shrink-0">
        <span className="text-lg">🌙</span>
        <b className="text-[15px] flex-1" style={{ fontFamily: 'Amiri, serif', color: '#C5A059' }}>الليل</b>
        {left !== null && (
          <span className={`text-[12px] font-mono tabular-nums ${left <= 10 ? 'text-red-400' : 'text-[#7e7466]'}`} dir="ltr">
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </span>
        )}
      </div>

      {/* شارتا الخطوتين — لحامل القدرتين وحده */}
      {two && (
        <div className="flex gap-1.5 justify-center px-4 pb-2 shrink-0">
          {steps.map((s, i) => (
            <span key={key(s)} className="text-[10.5px] font-bold rounded-lg px-2.5 py-1 border transition"
              style={i === idx
                ? { borderColor: '#C5A059', color: '#C5A059', background: 'rgba(197,160,89,.1)' }
                : { borderColor: '#2b2621', color: '#645c50' }}>
              {i + 1} · {s.ask.replace(/^(اختر هدفَ |مَن )/, '').replace(/[؟.]$/, '')}
            </span>
          ))}
        </div>
      )}

      <p className="text-center text-[15px] text-[#efe9dc] font-light px-6 pb-3 shrink-0">{cur.ask}</p>

      {/* القائمة */}
      <div className="flex-1 overflow-y-auto px-4 pb-2 min-h-0">
        <AnimatePresence mode="wait">
          <motion.div key={key(cur)} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.15 }}>
            {cur.targets.map(t => {
              const on = chosen === t.physicalId;
              return (
                <button key={t.physicalId}
                  onClick={() => setPicks(p => ({ ...p, [key(cur)]: t.physicalId }))}
                  className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 mb-1.5 border transition text-right"
                  style={on
                    ? { borderColor: '#C5A059', background: 'rgba(197,160,89,.08)' }
                    : { borderColor: '#221f1a', background: '#111010' }}>
                  <span className="text-[11px] font-mono text-[#7e7466] w-6">#{t.physicalId}</span>
                  <b className="text-[13.5px] flex-1 text-[#efe9dc] font-semibold">{t.name}</b>
                  {on && <span className="text-[#C5A059]">✓</span>}
                </button>
              );
            })}
            {cur.targets.length === 0 && (
              <p className="text-center text-[12.5px] text-[#645c50] py-8">لا هدفَ متاحاً الليلة.</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* الأزرار */}
      <div className="px-4 pt-2 pb-4 shrink-0 border-t border-[#221f1a]">
        {two && idx < steps.length - 1 ? (
          <button disabled={chosen == null || busy}
            onClick={() => setIdx(i => i + 1)}
            className="w-full rounded-xl py-3 text-[13.5px] font-black transition disabled:opacity-45"
            style={{ background: '#C5A059', color: '#0a0a0b' }}>
            التالي ←
          </button>
        ) : (
          <button disabled={busy || (chosen == null && !cur.canSkip)}
            onClick={() => send(picks)}
            className="w-full rounded-xl py-3 text-[13.5px] font-black transition disabled:opacity-45"
            style={{ background: '#C5A059', color: '#0a0a0b' }}>
            {busy ? 'يُرسل…' : two ? 'تأكيدُ الاختيارين' : chosen != null ? 'تأكيدُ الاختيار' : cur.canSkip ? 'تخطٍّ — لا أحد' : 'اختر لاعباً'}
          </button>
        )}

        {two && idx > 0 && (
          <button onClick={() => setIdx(i => i - 1)}
            className="w-full text-[11.5px] text-[#645c50] mt-2 py-1">
            → رجوعٌ إلى الخطوة السابقة
          </button>
        )}
        {!two && cur.canSkip && chosen != null && (
          <button onClick={() => send({ ...picks, [key(cur)]: null })}
            className="w-full text-[11.5px] text-[#645c50] mt-2 py-1">
            تخطٍّ بلا هدف
          </button>
        )}
        <p className="text-center text-[10.5px] text-[#5c554a] mt-2 font-light">
          اختيارٌ واحدٌ في الليلة — ثمّ انتظرِ الصباح.
        </p>
      </div>
    </div>
  );
}
