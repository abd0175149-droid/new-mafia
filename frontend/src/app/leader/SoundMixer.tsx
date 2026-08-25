'use client';

// ══════════════════════════════════════════════════════
// 🎚️ مازج الصوت — خمسة مقابض في يد الموجّه
//
// 🔴 المقابض تضبط **القاعة والموجّه معاً**: المستوى يُحسب هنا ويُرسَل مع بثّ
//    الصوت فتُشغّله الشاشة به. مقبضٌ واحدٌ لكلّ فئة ولا حيرة أيّهما يعمل.
//    وزرّ الكتم يبقى لحالته الخاصّة: «كتم جهازي والقاعة تسمع».
//
// 🔴 والفئتان الأخيرتان تنبيهان للموجّه وحده ولا تُبثّان للقاعة أصلاً —
//    مُعلَّمتان في اللوحة كي لا يظنّ أنّه يخفض صوتاً تسمعه الطاولة.
//
// 🔴 والمعاينة عند رفع الإصبع لا مع كلّ حركة: نغمةٌ تُطلَق مع كلّ بكسل
//    تُحوّل الضبط إلى ضجيج.
// ══════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import {
  SOUND_CATEGORIES, getSoundLevels, setSoundLevel, resetSoundLevels,
  getDefaultSoundLevels, playLocalSound, type SoundCategory,
} from '@/lib/soundManager';

/** صوتُ معاينةٍ ممثّلٌ لكلّ فئة — يُسمع الموجّه ما يضبطه بالضبط. */
const PREVIEW: Record<SoundCategory, string> = {
  alerts: 'vote_cast',
  victory: 'win_citizen',
  timer: 'timer_buzzer',
  departure: 'leader_departure_alert',
  gallery: 'leader_gallery_alert',
};

export default function SoundMixer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [levels, setLevels] = useState(() => getSoundLevels());
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { if (open) setLevels(getSoundLevels()); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('[data-mixer]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  const change = (cat: SoundCategory, v: number) => {
    setSoundLevel(cat, v);
    setLevels(getSoundLevels());
  };

  const preview = (cat: SoundCategory) => {
    try { playLocalSound(PREVIEW[cat]); } catch { /* الصوت لا يحجب */ }
  };

  const reset = () => {
    resetSoundLevels();
    setLevels(getSoundLevels());
  };

  const defaults = getDefaultSoundLevels();
  const isDefault = SOUND_CATEGORIES.every(c => Math.abs(levels[c.key] - defaults[c.key]) < 0.005);

  return (
    <div ref={boxRef} data-mixer dir="rtl"
      /* 🔴 تحت الرأس لا فوق زاوية الشاشة: تُفتح من زرّ الرأس، فتظهر عنده لا في الجهة المقابلة */
      className="fixed top-16 left-4 z-[116] w-[min(94vw,23rem)] max-h-[80vh] overflow-y-auto rounded-2xl border border-[#C5A059]/30 bg-[#080808]/97 backdrop-blur-md shadow-2xl">

      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07]">
        <span className="text-[13px]">🎚️</span>
        <b className="text-[13px] text-[#C5A059]">مستويات الصوت</b>
        <button onClick={reset} disabled={isDefault}
          className="mr-auto text-[10.5px] px-2 py-1 rounded-lg border border-white/10 text-zinc-400 hover:text-white disabled:opacity-35">
          الافتراضيّ
        </button>
        <button onClick={onClose} className="text-zinc-500 hover:text-white text-sm px-1">✕</button>
      </div>

      <div className="px-3 py-2.5 space-y-3">
        {SOUND_CATEGORIES.map(c => {
          const pct = Math.round(levels[c.key] * 100);
          const off = pct === 0;
          return (
            <div key={c.key}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[13px] leading-none">{c.icon}</span>
                <span className="text-[12px] font-bold text-zinc-200 flex-1 min-w-0 truncate">{c.labelAr}</span>
                {!c.hallToo && (
                  <span className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-500">
                    لك وحدك
                  </span>
                )}
                <b className={`shrink-0 text-[12px] font-mono tabular-nums w-9 text-left ${off ? 'text-red-400' : 'text-[#C5A059]'}`} dir="ltr">
                  {pct}%
                </b>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={0} max={100} step={5} value={pct}
                  onChange={e => change(c.key, parseInt(e.target.value) / 100)}
                  onPointerUp={() => preview(c.key)}
                  onKeyUp={() => preview(c.key)}
                  className="flex-1 accent-[#C5A059] h-1.5"
                  aria-label={c.labelAr}
                />
                <button onClick={() => preview(c.key)} title="استمع"
                  className="shrink-0 w-7 h-7 rounded-lg border border-white/10 text-[11px] text-zinc-400 hover:text-white">
                  ▶
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="px-3 pb-3 text-[10px] leading-relaxed text-zinc-600">
        تُضبط القاعة وجهازك معاً. ولإسكات جهازك وحده مع بقاء القاعة تسمع — استعمل زرّ 🔊.
      </p>
    </div>
  );
}
