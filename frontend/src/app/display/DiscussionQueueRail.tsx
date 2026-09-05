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
// 🔴 ويخفت أثناء الحديث عمداً. الشاشةُ تُضبّب كلَّ من عدا المتحدّث وتنزع
//    ألوانَهم؛ فقائمةُ أسماءٍ ساطعة في تلك اللحظة تُنافسه على الانتباه.
//    يبقى صفُّ المتحدّث وحده بكامل وضوحه — هو المعلومة التي تُطلب حينها.
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
          width: 'clamp(196px, 14.5vw, 268px)',
          background:
            'linear-gradient(to left, rgba(6,6,8,0.94) 0%, rgba(6,6,8,0.90) 62%, rgba(6,6,8,0.72) 100%)',
          borderInlineStart: '1px solid rgba(197,160,89,0.16)',
          boxShadow: '-24px 0 60px rgba(0,0,0,0.55)',
          // يخفت مع القاعة حين يتحدّث أحد — ولا يختفي
          opacity: speaking ? 0.46 : 1,
          filter: speaking ? 'saturate(0.55)' : 'none',
          transition: 'opacity .7s ease, filter .7s ease',
        }}
      >
        {/* ── الرأس ── */}
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className="text-[15px] font-black text-[#C5A059]"
              style={{ fontFamily: 'Amiri, serif' }}
            >
              ترتيب النقاش
            </span>
            <span
              className="text-[11px] font-mono tabular-nums text-[#6b6862]"
              dir="ltr"
            >
              {doneCount}/{order.length}
            </span>
          </div>
          <div
            className="mt-1 text-[8px] font-mono tracking-[0.34em] text-[#4a4842]"
            dir="ltr"
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
          style={{ scrollbarWidth: 'none', maskImage: 'linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 20px), transparent 100%)' }}
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
                className="flex items-center gap-2.5 mb-[5px] rounded-[7px] px-2.5 py-[7px]"
                style={{
                  background:
                    state === 'current'
                      ? 'linear-gradient(90deg, rgba(197,160,89,0.24), rgba(197,160,89,0.08))'
                      : 'rgba(255,255,255,0.035)',
                  border: `1px solid ${state === 'current' ? 'rgba(197,160,89,0.5)' : 'transparent'}`,
                  boxShadow: state === 'current' ? '0 0 24px rgba(197,160,89,0.18)' : 'none',
                  // صفُّ المتحدّث يقاوم خفوتَ الشريط: هو المعلومة المطلوبة حينها
                  opacity: state === 'done' ? 0.42 : 1,
                  transition: 'background .5s, border-color .5s, opacity .5s',
                }}
              >
                {/* رقمُ المقعد — لا ترتيبُ الدور: القاعةُ تعرف الناس بمقاعدهم */}
                <span
                  className="flex-none w-[26px] text-center font-mono tabular-nums rounded-[4px] py-[1px] text-[11px]"
                  style={{
                    color: state === 'current' ? '#1a1405' : state === 'done' ? '#4f4d48' : '#8a8780',
                    background: state === 'current' ? '#C5A059' : 'rgba(255,255,255,0.05)',
                    fontWeight: state === 'current' ? 700 : 400,
                  }}
                >
                  {seat}
                </span>

                <span
                  className="flex-1 min-w-0 truncate text-[13.5px]"
                  style={{
                    color: state === 'current' ? '#ffffff' : state === 'done' ? '#5f5d58' : '#a6a39c',
                    fontWeight: state === 'current' ? 700 : 400,
                    textDecoration: state === 'done' ? 'line-through' : 'none',
                  }}
                >
                  {name}
                </span>

                <span className="flex-none text-[10px] w-[12px] text-center">
                  {state === 'current' ? (
                    <span
                      style={{
                        color: '#C5A059',
                        animation: 'dqrBlink 1.15s steps(2, start) infinite',
                      }}
                    >
                      ●
                    </span>
                  ) : state === 'done' ? (
                    <span style={{ color: '#3f8f5c' }}>✓</span>
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
