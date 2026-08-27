'use client';

// ══════════════════════════════════════════════════════
// 🃏 دليلُ الأدوار — كارتٌ بملء الشاشة (السيناريو المعتمَد)
//
// 🔴 وجهُ الكارت هو **الملفّ نفسه** الذي يراه اللاعب حين يقلب بطاقته في اللعبة،
//    لا شبيهٌ له. والوجهُ السرّيُّ صورةٌ خالصةٌ بلا اسمٍ ولا رقم، فيصلح للعرض
//    في دليلٍ كما هو.
//
// 🔴 ويُطلَب **المصغَّر** لا الأصل: الأصلُ ~٢ ميغابايت، وستّةَ عشرَ منه ٣٢ ميغا
//    على شبكة قاعة. والأصلُ يبقى لكشف البطاقة — أكثرِ لحظةٍ يراها اللاعب.
//    وإن غاب المصغَّر (لم يُولَّد بعد) يعود الأصلُ فيثقل ولا ينكسر شيء.
//
// 🔴 وشريطُ القفز يعالج عيبَ الكروت الوحيد: بلاه يحتاج الوصولُ إلى دورٍ بعينه
//    ستَّ إيماءات. ضغطةٌ واحدة تكفي.
//
// 🔴 وبعد بدء اللعبة تُعرض أدوارُ هذه الطاولة وحدها (قرارُ المالك). القائمةُ
//    تأتي من الخادم لا من حالةٍ محلّيّة — تركيبةُ اللعبة معلومةٌ ثمينة.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const MEDIA_URL = process.env.NEXT_PUBLIC_SOCKET_URL || API_URL || '';

export interface RoleLimit { text: string; auto: boolean }
export interface GuideRole {
  id: string; nameAr: string; nameEn: string; team: 'MAFIA' | 'CITIZEN' | 'NEUTRAL';
  genPriority: number;
  oneLiner: string | null;
  howItWorks: string | null;
  limits: RoleLimit[];
  tips: string[];
  interactsWith: string[];
  phaseNotes: Record<string, string>;
  actsIn: string[];
  winConditionDescription: string | null;
  face: { url: string; thumbUrl?: string; thumbSmUrl?: string } | null;
}

const TEAMS = {
  MAFIA: { ar: 'المافيا', c: '#d9636a' },
  CITIZEN: { ar: 'المواطنون', c: '#5db98c' },
  NEUTRAL: { ar: 'المستقلّون', c: '#d7a73f' },
} as const;

const FALLBACK_ICON: Record<string, string> = {
  GODFATHER: '🎩', SILENCER: '🤫', CHAMELEON: '🦎', WITCH: '🧙‍♀️',
  OLDER_BROTHER: '👴', MAFIA_REGULAR: '🔪', SHERIFF: '🕵️', DOCTOR: '🩺',
  NURSE: '💉', SNIPER: '🎯', POLICEWOMAN: '👮‍♀️', MAYOR: '🏛️',
  YOUNGER_BROTHER: '👦', CITIZEN: '👤', JESTER: '🃏', ASSASSIN: '🗡️',
};

const abs = (rel?: string | null) =>
  !rel ? null : (/^https?:\/\//i.test(rel) ? rel : `${MEDIA_URL}${rel}`);

/** للعرض: المصغَّر، ويعود للأصل إن لم يُولَّد. */
function faceSrc(face: GuideRole['face']): string | null {
  return abs(face?.thumbUrl || face?.url);
}

/**
 * للتكبير: **الأصل** لا المصغَّر.
 * 🔴 المصغَّر ٧٢٠بك يكفي كارتاً بعرض ٢١٥ نقطة، ويبهت ملءَ الشاشة. وتنزيلُ
 *    الأصل هنا مقصود: ضغطةٌ صريحة على صورةٍ واحدة، لا ستّةَ عشرَ تلقائيّاً.
 */
function faceFull(face: GuideRole['face']): string | null {
  return abs(face?.url || face?.thumbUrl);
}

let _cache: GuideRole[] | null = null;

export default function RolesDeck({ open, onClose, roleIds }: {
  open: boolean;
  onClose: () => void;
  /** أدوارُ هذه الطاولة — يُمرَّر بعد بدء اللعبة فقط. `null` ⇒ الكتالوج كاملاً. */
  roleIds?: string[] | null;
}) {
  const [all, setAll] = useState<GuideRole[]>(_cache || []);
  const [loading, setLoading] = useState(!_cache);
  const [error, setError] = useState(false);
  const [team, setTeam] = useState<'MAFIA' | 'CITIZEN' | 'NEUTRAL'>('MAFIA');
  const [idx, setIdx] = useState(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  /** صورةُ التكبير — الكارتُ في الدليل صغير، ومَن أراد التفاصيل يضغطه. */
  const [zoom, setZoom] = useState<string | null>(null);
  const jumpRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || _cache) return;
    setLoading(true); setError(false);
    fetch(`${API_URL}/api/game-config/roles-guide`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d?.data)) { _cache = d.data; setAll(d.data); }
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open]);

  // أدوارُ الطاولة إن حُدِّدت — والترتيبُ يبقى ترتيبَ التوليد لا ترتيبَ الوصول
  const pool = useMemo(() => {
    const list = roleIds && roleIds.length
      ? all.filter(r => roleIds.includes(r.id))
      : all;
    return [...list].sort((a, b) => a.genPriority - b.genPriority);
  }, [all, roleIds]);

  const teamsPresent = useMemo(
    () => (['MAFIA', 'CITIZEN', 'NEUTRAL'] as const).filter(t => pool.some(r => r.team === t)),
    [pool],
  );

  const list = useMemo(() => pool.filter(r => r.team === team), [pool, team]);

  // ══════════════════════════════════════════════════
  // 🔴 يُفتح على **شيخ المافيا دائماً** — لا على دور صاحب الجهاز.
  //
  // كان يُفتح على دورك بحجّة أنّ مَن يفتح الدليل وسط جولةٍ يبحث عن نفسه.
  // وهي حجّةٌ خاطئة: نظرةٌ عابرة على الشاشة تكشف دورَ صاحبها فوراً، والدليلُ
  // يُفتح في قاعةٍ لا في خلوة. ونقطةُ الفتح ثابتةٌ للجميع فلا تقول شيئاً عن أحد.
  //
  // 🔴 ولا يُشترط وجودُ الشيخ: بعد بدء اللعبة تُعرض أدوارُ الطاولة وحدها وقد لا
  //    يكون فيها. فالبدائلُ بالترتيب: الشيخ ← أوّلُ مافيويّ ← أوّلُ ما في القائمة.
  // ══════════════════════════════════════════════════
  const opened = useRef(false);
  useEffect(() => {
    if (!open) { opened.current = false; return; }
    if (opened.current || !pool.length) return;
    opened.current = true;
    const anchor = pool.find(r => r.id === 'GODFATHER')
      ?? pool.find(r => r.team === 'MAFIA')
      ?? pool[0];
    const t = anchor.team;
    setTeam(t);
    const within = pool.filter(r => r.team === t);
    setIdx(Math.max(0, within.findIndex(r => r.id === anchor.id)));
  }, [open, pool]);

  const go = useCallback((d: number) => {
    setIdx(i => {
      const n = list.length;
      if (!n) return 0;
      return (i + d + n) % n;
    });
  }, [list.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // 🔴 التكبيرُ يُغلق أوّلاً: Escape يجب أن يُنهي الطبقة العليا لا الشاشة كلَّها
      if (e.key === 'Escape') { if (zoom) { setZoom(null); return; } onClose(); return; }
      if (e.key === 'ArrowRight') go(-1);
      if (e.key === 'ArrowLeft') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, go, zoom]);

  // يُبقي الرقاقةَ الجارية مرئيّةً في شريط القفز
  useEffect(() => {
    const el = jumpRef.current?.querySelector<HTMLElement>('[data-on="1"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [idx, team]);

  useEffect(() => { if (!open) setZoom(null); }, [open]);

  // ══════════════════════════════════════════════════
  // 🔒 قفلُ السكرول خلف اللوحة — كلُّ سكرولٍ داخلها وحدها
  //
  // 🔴 `position: fixed` على الجسم يقفز بالصفحة إلى أعلاها ما لم نحفظ الموضع
  //    ونُعِدْه عند الإغلاق: كان اللاعب يفتح الدليل ويغلقه فيجد نفسه في رأس
  //    الصفحة. و`top` السالبة تُبقيه بصريّاً حيث كان.
  // 🔴 و`modal-open` هو العرفُ القائم في المستودع — يُطفئ «اسحب لتحديث» أيضاً.
  // ══════════════════════════════════════════════════
  useEffect(() => {
    if (!open) return;
    const y = window.scrollY;
    document.body.classList.add('modal-open');
    document.body.style.top = `-${y}px`;
    return () => {
      document.body.classList.remove('modal-open');
      document.body.style.top = '';
      window.scrollTo(0, y);
    };
  }, [open]);

  if (!open) return null;

  const cur = list[Math.min(idx, Math.max(0, list.length - 1))];
  const c = cur ? TEAMS[cur.team].c : '#c5a059';
  const src = cur ? faceSrc(cur.face) : null;

  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    // 🔴 الأفقيُّ وحده يُبدّل: سحبةٌ مائلةٌ أثناء التمرير الرأسيّ كانت تقلب كارتاً
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) go(dx > 0 ? -1 : 1);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center" dir="rtl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        style={{ touchAction: 'none' }} />

      <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="relative w-full sm:max-w-md h-[92dvh] sm:h-[86vh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden border border-[#2b2621]"
        style={{ background: '#0a0a0b' }}>

        {/* الرأس */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#221f1a] shrink-0" style={{ background: '#0d0c0b' }}>
          <span className="text-base">🃏</span>
          <b className="text-[15px] flex-1" style={{ fontFamily: 'Amiri, serif', color: '#c5a059' }}>الأدوار</b>
          {roleIds && roleIds.length ? (
            <span className="text-[10px] px-2 py-0.5 rounded-md border border-[#2b2621] text-[#8d8271]">
              أدوارُ هذه الطاولة
            </span>
          ) : null}
          <button onClick={onClose} aria-label="إغلاق"
            className="w-8 h-8 rounded-lg border border-[#2b2621] text-[#7e7466] hover:text-white grid place-items-center text-sm">✕</button>
        </div>

        {/* رقائق الفرق */}
        {teamsPresent.length > 1 && (
          <div className="flex gap-1.5 px-4 pt-3 shrink-0">
            {teamsPresent.map(tk => {
              const on = team === tk;
              return (
                <button key={tk} onClick={() => { setTeam(tk as any); setIdx(0); }}
                  className="text-[11.5px] font-bold px-3 py-1.5 rounded-full border transition"
                  style={on
                    ? { background: TEAMS[tk].c, borderColor: TEAMS[tk].c, color: '#0a0a0b' }
                    : { borderColor: '#2b2621', color: '#8d8271' }}>
                  {TEAMS[tk].ar} {pool.filter(r => r.team === tk).length}
                </button>
              );
            })}
          </div>
        )}

        {loading && (
          <div className="flex-1 grid place-items-center">
            <div className="w-8 h-8 border-4 border-[#c5a059] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="flex-1 grid place-items-center text-center px-8">
            <p className="text-[13px] text-[#8d8271]">تعذّر تحميل الأدوار — تحقّق من الاتّصال وأعد المحاولة.</p>
          </div>
        )}

        {!loading && !error && !cur && (
          <div className="flex-1 grid place-items-center text-center px-8">
            <p className="text-[13px] text-[#8d8271]">لا أدوارَ لعرضها.</p>
          </div>
        )}

        {!loading && !error && cur && (
          <div className="flex-1 flex flex-col px-4 pb-3 pt-3 min-h-0"
            onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>

            <AnimatePresence mode="wait">
              <motion.div key={cur.id}
                initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.16 }}
                className="flex-1 flex flex-col min-h-0 rounded-2xl border p-4"
                style={{ borderColor: '#2b2621', background: 'linear-gradient(165deg,#16130f,#0c0b0a)' }}>

                {/* ══════════════════════════════════════════
                    وجهُ الكارت الحقيقيّ — كاملاً بلا قصّ
                    🔴 كان صندوقاً عرضيّاً (ارتفاعُه ١٦٨ وعرضُه عرضُ اللوحة)
                       بـobject-cover، والصورةُ كارتٌ **طوليّ** ٧٢٠×١٠٧٣.
                       فالتغطيةُ تملأ العرض وتقصّ نحو ثلثَي الطول — يظهر وسطُ
                       الكارت وحده. الصندوقُ صار يتبع نسبةَ الكارت، والارتفاعُ
                       محدودٌ بالشاشة فيبقى للنصّ مكان.
                    🔴 وcontain لا cover: رفعُ صورةٍ بنسبةٍ أخرى غداً يُحاط
                       بفراغٍ ولا يُقصّ. القصُّ الصامت هو ما أنتج هذا البلاغ.
                    ══════════════════════════════════════════ */}
                <button type="button" onClick={() => { const z = faceFull(cur.face); if (z) setZoom(z); }}
                  aria-label="تكبير صورة الكارت"
                  className="shrink-0 mx-auto rounded-xl overflow-hidden grid place-items-center"
                  style={{
                    // 🔴 أصغرُ ٢٠٪ من ٣٦dvh/٣٢٠ — الفارقُ يذهب كلُّه إلى النصّ تحته
                    height: 'min(29dvh, 256px)', aspectRatio: '720 / 1073',
                    border: `1px solid ${c}44`, background: '#0e0d0c',
                    cursor: src ? 'zoom-in' : 'default',
                  }}>
                  {src ? (
                    <img src={src} alt={cur.nameAr} loading="lazy" decoding="async"
                      className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-4xl opacity-80">{FALLBACK_ICON[cur.id] || '🎭'}</span>
                  )}
                </button>

                <h3 className="text-center mt-3 text-[26px] leading-tight font-black"
                  style={{ fontFamily: 'Amiri, serif', color: c }}>{cur.nameAr}</h3>
                <p className="text-center text-[10px] tracking-[0.22em] text-[#645c50]" dir="ltr">{cur.nameEn}</p>

                {cur.oneLiner && (
                  <p className="text-center text-[13px] leading-relaxed text-[#cdc3af] font-light mt-2">{cur.oneLiner}</p>
                )}

                <div className="flex-1 overflow-y-auto mt-3 pt-3 border-t border-[#221f1a] space-y-3"
                  style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
                  {cur.howItWorks && (
                    <Block title="كيف يعمل"><p className="text-[12.5px] leading-[1.85] text-[#b3a996] font-light">{cur.howItWorks}</p></Block>
                  )}
                  {cur.limits.length > 0 && (
                    <Block title="القيود"><Lines items={cur.limits.map(l => ({ text: l.text, tag: l.auto }))} /></Block>
                  )}
                  {cur.interactsWith.length > 0 && (
                    <Block title="يتقاطع مع"><Lines items={cur.interactsWith.map(text => ({ text }))} /></Block>
                  )}
                  {cur.tips.length > 0 && (
                    <Block title="نصائح"><Lines items={cur.tips.map(text => ({ text }))} /></Block>
                  )}
                  {cur.winConditionDescription && (
                    <div className="rounded-lg px-3 py-2 text-[11.5px] leading-relaxed font-light"
                      style={{ background: 'rgba(197,160,89,.07)', border: '1px solid rgba(197,160,89,.2)', color: '#c5a059' }}>
                      🏆 {cur.winConditionDescription}
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* التنقّل */}
            <div className="flex items-center gap-2.5 mt-3 shrink-0">
              <button onClick={() => go(-1)} aria-label="السابق"
                className="w-9 h-9 rounded-xl border border-[#2b2621] text-[#c5a059] grid place-items-center"
                style={{ background: '#151310' }}>›</button>
              <span className="flex-1 text-center text-[11px] text-[#645c50] font-mono tabular-nums" dir="ltr">
                {Math.min(idx, list.length - 1) + 1} / {list.length}
              </span>
              <button onClick={() => go(1)} aria-label="التالي"
                className="w-9 h-9 rounded-xl border border-[#2b2621] text-[#c5a059] grid place-items-center"
                style={{ background: '#151310' }}>‹</button>
            </div>

            {/* شريطُ القفز — ضغطةٌ واحدة إلى أيّ دور */}
            <div ref={jumpRef} className="flex gap-1.5 overflow-x-auto mt-2 pb-1 shrink-0"
              style={{ overscrollBehavior: 'contain' }}>
              {/* 🔴 ولا وسمَ لدورك هنا: النجمةُ كانت تُعلّمه في الشريط — وهو
                  التسريبُ نفسُه في موضعٍ أصغر. الرقاقاتُ متساويةٌ كلُّها. */}
              {list.map((r, k) => {
                const on = k === Math.min(idx, list.length - 1);
                return (
                  <button key={r.id} onClick={() => setIdx(k)} data-on={on ? '1' : '0'}
                    className="shrink-0 text-[10.5px] px-2.5 py-1 rounded-lg border whitespace-nowrap transition"
                    style={on
                      ? { background: '#efe9dc', color: '#0a0a0b', borderColor: '#efe9dc', fontWeight: 700 }
                      : { borderColor: '#2b2621', color: '#8d8271' }}>
                    {r.nameAr}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>

      {/* 🔍 التكبير — الصورةُ كاملةً على الشاشة، ضغطةٌ تُغلقها */}
      {zoom && (
        <div onClick={() => setZoom(null)}
          className="fixed inset-0 z-[310] bg-black/95 flex items-center justify-center p-4"
          style={{ cursor: 'zoom-out' }}>
          <img src={zoom} alt="" className="max-w-full max-h-full object-contain rounded-xl" />
          <button onClick={() => setZoom(null)} aria-label="إغلاق"
            className="absolute top-4 left-4 w-9 h-9 rounded-xl border border-[#2b2621] text-[#cdc3af] grid place-items-center"
            style={{ background: 'rgba(21,19,16,0.9)' }}>✕</button>
        </div>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h5 className="text-[10.5px] tracking-[0.1em] font-bold mb-1.5" style={{ color: '#c5a059' }}>{title}</h5>
      {children}
    </div>
  );
}

function Lines({ items }: { items: { text: string; tag?: boolean }[] }) {
  return (
    <ul className="space-y-1">
      {items.map((l, i) => (
        <li key={i} className="text-[12px] leading-[1.75] text-[#b3a996] font-light flex gap-1.5">
          <span className="shrink-0" style={{ color: '#c5a059' }}>—</span>
          <span>{l.text}</span>
        </li>
      ))}
    </ul>
  );
}
