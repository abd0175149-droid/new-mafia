'use client';

// ══════════════════════════════════════════════════════
// 🎚️ مازج الصوت — ثماني فئاتٍ في ثلاث مجموعات، بمعنى الصوت لا بموضع الكود
//
// 🔴 السؤالُ الذي يطرحه الموجّه وسط الليلة: «ما الذي يزعج الطاولة الآن؟» — فكلُّ
//    مقبضٍ يجمع أصواتاً تتشابه وظيفةً ومدّةً وحدّة. كان مقبضٌ واحد («التنبيهات
//    العامّة») يحكم ٤٥ صوتاً لا يجمعها شيء: خفضُ نقرة التصويت لأنّها تزعج كان
//    يخفض طلقةَ الاغتيال معها.
//
// 🔴 والرقمُ المعروض هو **المسموع**: المستوى = الفئة × المفتاح، والمفتاحُ بلا قيمةٍ
//    صريحة يُضرب بـ٠٫٧ — فكان الموجّه يرى ٧٠٪ ويسمع ٤٩٪. الآن يرى ما يصل الأذن.
//
// 🔴 والمقابض تضبط القاعة والموجّه معاً (قرار المالك): المستوى يُحسب هنا ويُرسَل مع
//    البثّ. وزرّ الكتم لحالته الخاصّة: «كتم جهازي والقاعة تسمع».
// ══════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import {
  SOUND_CATEGORIES, CATEGORY_GROUPS, getSoundLevels, setSoundLevel, resetSoundLevels,
  getDefaultSoundLevels, playLocalSound, previewAmbient, heardLevel, categoryCoverage,
  type SoundCategory,
} from '@/lib/soundManager';

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

  // 🔴 معاينةُ الخلفيّة مقطعُ ثلاثِ ثوانٍ لا يوقف الجاري: تشغيلُ فراشٍ للمعاينة
  //    كان يُسكت فراش القاعة وسط تصويتٍ حيّ.
  const preview = (c: typeof SOUND_CATEGORIES[number]) => {
    try {
      if (c.group === 'hallAmbient') previewAmbient(c.preview, 3000);
      else playLocalSound(c.preview);
    } catch { /* الصوت لا يحجب */ }
  };

  const reset = () => { resetSoundLevels(); setLevels(getSoundLevels()); };
  const defaults = getDefaultSoundLevels();
  const isDefault = SOUND_CATEGORIES.every(c => Math.abs(levels[c.key] - defaults[c.key]) < 0.005);

  return (
    <div ref={boxRef} data-mixer dir="rtl"
      className="fixed top-16 left-4 z-[116] w-[min(94vw,24rem)] max-h-[82vh] overflow-y-auto rounded-2xl border border-[#C5A059]/30 bg-[#080808]/97 backdrop-blur-md shadow-2xl">

      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07] sticky top-0 bg-[#080808]/97">
        <span className="text-[13px]">🎚️</span>
        <b className="text-[13px] text-[#C5A059]">مستويات الصوت</b>
        <span className="text-[9.5px] text-zinc-600 font-mono">ما يُسمع</span>
        <button onClick={reset} disabled={isDefault}
          className="mr-auto text-[10.5px] px-2 py-1 rounded-lg border border-white/10 text-zinc-400 hover:text-white disabled:opacity-35">
          الافتراضيّ
        </button>
        <button onClick={onClose} className="text-zinc-500 hover:text-white text-sm px-1">✕</button>
      </div>

      <div className="px-3 py-2">
        {CATEGORY_GROUPS.map(g => (
          <div key={g.key} className="mb-2">
            <p className="text-[9.5px] font-mono tracking-widest text-zinc-500 pt-2 pb-1.5">{g.labelAr}</p>
            <div className="space-y-2.5">
              {SOUND_CATEGORIES.filter(c => c.group === g.key).map(c => {
                const catPct = Math.round(levels[c.key] * 100);
                const heard = Math.round(heardLevel(c.preview) * 100);
                const cov = categoryCoverage(c.key);
                const off = catPct === 0;
                return (
                  <div key={c.key}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] leading-none">{c.icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-[12px] font-bold text-zinc-200 block truncate">{c.labelAr}</span>
                        <span className="text-[9.5px] text-zinc-600 block truncate">{c.hint}</span>
                      </div>
                      {!c.hallToo && (
                        <span className="shrink-0 text-[8.5px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-500">لك وحدك</span>
                      )}
                      {cov.silent > 0 && (
                        <span title={`${cov.silent} من ${cov.total} أصوات هذه الفئة بلا ملفٍّ ولا نغمة — يحكم صمتاً`}
                          className="shrink-0 w-2 h-2 rounded-full bg-red-500/80" />
                      )}
                      <b className={`shrink-0 text-[12px] font-mono tabular-nums w-9 text-left ${off ? 'text-red-400' : 'text-[#C5A059]'}`} dir="ltr">
                        {heard}%
                      </b>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range" min={0} max={100} step={5} value={catPct}
                        onChange={e => change(c.key, parseInt(e.target.value) / 100)}
                        onPointerUp={() => preview(c)}
                        onKeyUp={() => preview(c)}
                        className="flex-1 accent-[#C5A059] h-1.5"
                        aria-label={c.labelAr}
                      />
                      <button onClick={() => preview(c)} title={c.group === 'hallAmbient' ? 'استمع ٣ ثوانٍ' : 'استمع'}
                        className="shrink-0 w-7 h-7 rounded-lg border border-white/10 text-[11px] text-zinc-400 hover:text-white">
                        ▶
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="px-3 pb-3 text-[10px] leading-relaxed text-zinc-600">
        تُضبط القاعة وجهازك معاً. الرقمُ هو ما يُسمع فعلاً. النقطةُ الحمراء: أصواتٌ في الفئة بلا ملفٍّ مرفوع.
        ولإسكات جهازك وحده مع بقاء القاعة — زرّ 🔊.
      </p>
    </div>
  );
}
