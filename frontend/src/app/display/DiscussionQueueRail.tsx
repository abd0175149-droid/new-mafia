'use client';

// ══════════════════════════════════════════════════════
// 🎤 شريط ترتيب النقاش — شاشة القاعة
// ══════════════════════════════════════════════════════
// «مين الدور؟» كان يُجاب بأحد أمرين: مقاطعةٌ شفهيّة تقطع النقاش، أو نظرةٌ
// إلى الهاتف — وإخراجُ الهاتف أثناء النقاش هو بالضبط ما يطارده نظامُ مكافحة
// الغشّ. الشريطُ يُغني عن الاثنين.
//
// 🔴 لا نداءَ جديداً إلى الخادم: `discussionState` يصل الشاشةَ أصلاً عبر
//    `day:discussion-updated` المبثوث للغرفة كلّها. والطابورُ ليس فيه سرّ —
//    يُبنى من الأحياء مرتَّبين بأرقام مقاعدهم مُدارين ليبدأ من اختيار الليدر،
//    فلا دورَ فيه ولا نيّةَ ليل. والقاعةُ ترى المقاعد ومن حيٌّ على الشاشة نفسها.
//
// 🔴 معلَّقٌ على body عبر FixedLayer، ولا يقتطع عرضاً من التخطيط. هذا شرطٌ
//    لا تجميل: كاميرا شاشة النقاش تلتقط مركزَ اللوح **مرّةً واحدة** عند
//    الراحة، فأيّ عنصرٍ يغيّر عرضَ اللوح أثناء الجولة يُبطل ذلك المرجع
//    وتنحرف كلُّ حركةٍ بعده — بلا خطأٍ ولا تحذير.
//
// 🔴 الشفافيّةُ في الخلفيّة وحدها، لا في النصّ.
//    أوّلُ نسخةٍ خفّضت شفافيّةَ العنصر كلّه أثناء الحديث فذهب معها النصّ:
//    اسمٌ عند ٤٦٪ فوق صفٍّ عند ٤٢٪ يساوي ١٩٪ — أي لا شيء يُقرأ من آخر
//    القاعة. الآن يزداد السطحُ شفافيّةً حين يتحدّث أحد (فلا يحجب المشهد)
//    بينما تبقى الأسماءُ والأرقام بكامل عتامتها، ومعها ظلُّ نصٍّ يفصلها
//    عمّا يمرّ خلفها. التمييزُ بين الحالات باللون والوزن لا بالشفافيّة.
// ══════════════════════════════════════════════════════

import { useEffect, useMemo, useRef } from 'react';
import FixedLayer from '@/components/FixedLayer';

interface Props {
  /** الحالة كما تصل من الخادم — لا يُشتقّ منها شيءٌ هنا */
  discussionState: any;
  /** لأخذ الأسماء وحدها؛ الترتيبُ من الطابور لا من هذه */
  players: Array<{ physicalId: number; name: string; isAlive?: boolean }>;
}

type RowState = 'done' | 'current' | 'upcoming';

export default function DiscussionQueueRail({ discussionState, players }: Props) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const curRef = useRef<HTMLDivElement | null>(null);

  const nameOf = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of players) m.set(p.physicalId, p.name);
    return m;
  }, [players]);

  // الترتيبُ المعروض هو ترتيبُ الأدوار الحقيقيّ: من تكلّم، ثمّ المتحدّث، ثمّ الباقون.
  const order = useMemo(() => {
    const d = discussionState;
    if (!d) return [] as number[];
    return [
      ...(d.hasSpoken || []),
      ...(d.currentSpeakerId ? [d.currentSpeakerId] : []),
      ...(d.speakingQueue || []),
    ];
  }, [discussionState]);

  const speaking = !!discussionState?.currentSpeakerId;
  const doneCount = (discussionState?.hasSpoken || []).length;

  // القائمةُ أطولُ من الشاشة في الجلسات الكبيرة (٢٧ مقعداً)، فيُبقى الدورُ
  // الحاليّ في المنتصف تلقائيّاً بدل أن يختفي أسفلها.
  useEffect(() => {
    const el = curRef.current;
    const box = listRef.current;
    if (!el || !box) return;
    const target = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
    box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [discussionState?.currentSpeakerId, order.length]);

  if (!discussionState || order.length === 0) return null;

  const progress = order.length ? (doneCount / order.length) * 100 : 0;

  return (
    <FixedLayer>
      <aside
        dir="rtl"
        aria-label="ترتيب النقاش"
        className="fixed top-0 bottom-0 right-0 z-[45] flex flex-col pointer-events-none select-none"
        style={{
          width: 'clamp(214px, 15.5vw, 300px)',
          // السطحُ وحده يرقّ أثناء الحديث — النصّ لا يُمَسّ
          background: speaking
            ? 'linear-gradient(to left, rgba(5,5,7,0.80) 0%, rgba(5,5,7,0.66) 68%, rgba(5,5,7,0.34) 100%)'
            : 'linear-gradient(to left, rgba(5,5,7,0.93) 0%, rgba(5,5,7,0.86) 68%, rgba(5,5,7,0.58) 100%)',
          backdropFilter: 'blur(9px)',
          WebkitBackdropFilter: 'blur(9px)',
          borderInlineStart: `1px solid rgba(197,160,89,${speaking ? 0.18 : 0.3})`,
          boxShadow: '-26px 0 64px rgba(0,0,0,0.6)',
          transition: 'background .7s ease, border-color .7s ease',
        }}
      >
        {/* ── الرأس ── */}
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className="font-black text-[#E3C179]"
              style={{
                fontFamily: 'Amiri, serif',
                fontSize: 'clamp(17px, 1.25vw, 23px)',
                textShadow: '0 2px 8px rgba(0,0,0,0.95)',
              }}
            >
              ترتيب النقاش
            </span>
            <span
              className="font-mono tabular-nums font-bold text-[#9a968e]"
              dir="ltr"
              style={{ fontSize: 'clamp(12px, 0.85vw, 16px)', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
            >
              {doneCount}/{order.length}
            </span>
          </div>
          <div
            className="mt-1 font-mono tracking-[0.34em] text-[#5d5a54]"
            dir="ltr"
            style={{ fontSize: 'clamp(8px, 0.5vw, 10px)' }}
          >
            SPEAKING ORDER
          </div>

          {/* خيطُ التقدّم — كم قطعت الجولةُ من الطاولة */}
          <div className="mt-3 h-[2px] w-full" style={{ background: 'rgba(197,160,89,0.13)' }}>
            <div
              className="h-full"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #8A0303, #C5A059)',
                boxShadow: '0 0 10px rgba(197,160,89,0.55)',
                transition: 'width .8s cubic-bezier(.22,1,.28,1)',
              }}
            />
          </div>
        </div>

        {/* ── الطابور ── */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-3 pb-5"
          style={{ scrollbarWidth: 'none', maskImage: 'linear-gradient(to bottom, transparent 0, #000 6px, #000 calc(100% - 8px), transparent 100%)' }}
        >
          <style>{`aside[aria-label="ترتيب النقاش"] ::-webkit-scrollbar{width:0;height:0}`}</style>

          {order.map((seat, i) => {
            const isCurrent = seat === discussionState.currentSpeakerId;
            const state: RowState = isCurrent ? 'current' : i < doneCount ? 'done' : 'upcoming';
            const name = nameOf.get(seat) || `لاعب #${seat}`;

            return (
              <div
                key={`${seat}-${i}`}
                ref={isCurrent ? curRef : undefined}
                className="flex items-center gap-2.5 mb-[6px] rounded-[8px] px-2.5 py-[8px]"
                style={{
                  background:
                    state === 'current'
                      ? 'linear-gradient(90deg, rgba(197,160,89,0.42), rgba(197,160,89,0.14))'
                      : state === 'done'
                        ? 'rgba(255,255,255,0.03)'
                        : 'rgba(255,255,255,0.075)',
                  border: `1px solid ${
                    state === 'current' ? 'rgba(230,190,110,0.75)'
                      : state === 'done' ? 'transparent'
                      : 'rgba(255,255,255,0.09)'
                  }`,
                  boxShadow: state === 'current' ? '0 0 30px rgba(197,160,89,0.3)' : 'none',
                  // 🔴 لا تخفيتَ بالشفافيّة: من تكلّم يُميَّز بلونٍ أخفت وشطبٍ،
                  //    لا بطبقةٍ ثانية تُذيب النصّ فوق سطحٍ شفّافٍ أصلاً.
                  transition: 'background .5s, border-color .5s',
                }}
              >
                {/* رقمُ المقعد — لا ترتيبُ الدور: القاعةُ تعرف الناس بمقاعدهم.
                    وهو أوّلُ ما يُبحث عنه من آخر القاعة، فيُعطى شارةً مصمتة. */}
                <span
                  className="flex-none text-center font-mono tabular-nums rounded-[5px] py-[2px]"
                  style={{
                    minWidth: 'clamp(28px, 2.1vw, 40px)',
                    fontSize: 'clamp(13px, 0.92vw, 18px)',
                    fontWeight: 700,
                    color: state === 'current' ? '#15100a' : state === 'done' ? '#6f6c65' : '#0d0d10',
                    background:
                      state === 'current' ? '#F0CE7E'
                        : state === 'done' ? 'rgba(255,255,255,0.06)'
                        : 'rgba(212,208,199,0.82)',
                    textShadow: 'none',
                  }}
                >
                  {seat}
                </span>

                <span
                  className="flex-1 min-w-0 truncate"
                  style={{
                    fontSize: 'clamp(14.5px, 1.05vw, 20px)',
                    lineHeight: 1.35,
                    color: state === 'current' ? '#ffffff' : state === 'done' ? '#8b877f' : '#EFECE5',
                    fontWeight: state === 'current' ? 800 : state === 'done' ? 400 : 600,
                    textDecoration: state === 'done' ? 'line-through' : 'none',
                    textDecorationColor: 'rgba(139,135,127,0.7)',
                    // ظلٌّ يفصل الحرفَ عمّا يمرّ خلف السطح الشفّاف
                    textShadow: '0 1px 4px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.75)',
                  }}
                >
                  {name}
                </span>

                <span
                  className="flex-none text-center"
                  style={{ width: 'clamp(13px, 0.9vw, 18px)', fontSize: 'clamp(11px, 0.75vw, 15px)' }}
                >
                  {state === 'current' ? (
                    <span
                      style={{
                        color: '#F0CE7E',
                        animation: 'dqrBlink 1.15s steps(2, start) infinite',
                      }}
                    >
                      ●
                    </span>
                  ) : state === 'done' ? (
                    <span style={{ color: '#5FBF85' }}>✓</span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>

        <style>{`@keyframes dqrBlink{50%{opacity:0}}
          @media (prefers-reduced-motion: reduce){
            aside[aria-label="ترتيب النقاش"] *{animation:none!important;transition:none!important}
          }`}</style>
      </aside>
    </FixedLayer>
  );
}
