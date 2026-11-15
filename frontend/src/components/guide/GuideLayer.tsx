'use client';

// ══════════════════════════════════════════════════════
// 🕴️ طبقة الدون — الضوء والبطاقة والورقة (2026-11-15)
//
// تُرسم فوق صفحات التطبيق الحقيقيّة وفوق غرفة التدريب، ولا تعرف شيئاً عن الخطوات:
// تأخذ «ما يُضاء» و«ما يُقال» وتتكفّل بالقياس والحجب.
//   • خطوةُ فعلٍ (wait): ما حول الهدف محجوب، والهدف وحده يُلمس.
//   • خطوةُ شرحٍ (نصّ + «التالي»): كلّ شيء محجوب حتى الهدف — إلّا مع open.
//   • dim=false: لا حجب إطلاقاً (اللاعب يتصرّف بحرّيّة: قائمة الليل، شبكة التصويت).
// ══════════════════════════════════════════════════════

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DonSeal } from '../DonSeal';
import './guide.css';

export type CoachPos = 'top' | 'bottom' | 'low' | 'mid';

export interface LayerStep {
  /** محدِّد CSS للعنصر المُضاء */
  target?: string | null;
  text?: ReactNode;
  /** ما على اللاعب فعله — وجودُه يجعل الخطوة خطوةَ فعل بلا «التالي» */
  wait?: ReactNode;
  whisper?: boolean;
  pos?: CoachPos;
  dim?: boolean;
  /** الثقب يبقى قابلاً للّمس حتى في خطوة شرح */
  open?: boolean;
  nextLabel?: string;
  /** لا بطاقة — ضوءٌ فقط (الشرح مكتوبٌ داخل الشاشة نفسها) */
  silent?: boolean;
}

interface Box { top: number; left: number; width: number; height: number }
const same = (a: Box | null, b: Box | null) => !!a && !!b && Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;

/** يقيس الهدف باستمرار (الصفحات تتحرّك تحته: حركات الدخول، اللوحات المنزلقة) */
function useTargetBox(selector?: string | null): { box: Box | null; missingFor: number } {
  const [box, setBox] = useState<Box | null>(null);
  const [missingFor, setMissingFor] = useState(0);
  useEffect(() => {
    setBox(null); setMissingFor(0);
    if (!selector) return;
    let alive = true, scrolled = false, since = Date.now();
    const tick = () => {
      if (!alive) return;
      let el: Element | null = null;
      try { el = document.querySelector(selector); } catch { el = null; }
      if (el) {
        if (!scrolled) { scrolled = true; try { (el as HTMLElement).scrollIntoView({ block: 'center', inline: 'nearest' }); } catch { /* متصفّح قديم */ } }
        const r = el.getBoundingClientRect();
        const b = { top: r.top, left: r.left, width: r.width, height: r.height };
        setBox(prev => (same(prev, b) ? prev : b));
        since = Date.now(); setMissingFor(0);
      } else {
        setBox(null); setMissingFor(Date.now() - since);
      }
    };
    tick();
    const t = setInterval(tick, 140);
    addEventListener('scroll', tick, true); addEventListener('resize', tick);
    return () => { alive = false; clearInterval(t); removeEventListener('scroll', tick, true); removeEventListener('resize', tick); };
  }, [selector]);
  return { box, missingFor };
}

interface Props {
  step: LayerStep;
  /** «٧/٤٢» */
  count?: string;
  onNext?: () => void;
  onPrev?: (() => void) | null;
  /** «لاحقاً» — تأجيل الجولة */
  onLater?: () => void;
  /** مخرجٌ إن لم يظهر الهدف (لا تُحبس الجولة على عنصرٍ غاب) */
  onSkip?: (() => void) | null;
}

export default function GuideLayer({ step, count, onNext, onPrev, onLater, onSkip }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const { box, missingFor } = useTargetBox(step.target);
  if (!mounted) return null;

  const isAction = !!step.wait;
  const dim = step.dim !== false && (!!step.target || !isAction);
  const holeOpen = isAction || !!step.open;
  const P = 6;
  const vw = window.innerWidth, vh = window.innerHeight;
  const hole = box ? { top: Math.max(0, box.top - P), left: Math.max(0, box.left - P), right: Math.min(vw, box.left + box.width + P), bottom: Math.min(vh, box.top + box.height + P) } : null;
  const pos: CoachPos = step.pos || (box ? (box.top + box.height / 2 < vh / 2 ? 'bottom' : 'top') : 'bottom');
  const slim = !step.text;
  const stuck = isAction && !!step.target && !box && missingFor > 3500;

  return createPortal(
    <>
      {dim && !hole && <div className="gd-block" style={{ inset: 0 }} />}
      {dim && hole && (
        <>
          <div className="gd-block" style={{ top: 0, left: 0, right: 0, height: hole.top }} />
          <div className="gd-block" style={{ top: hole.bottom, left: 0, right: 0, bottom: 0 }} />
          <div className="gd-block" style={{ top: hole.top, left: 0, width: hole.left, height: hole.bottom - hole.top }} />
          <div className="gd-block" style={{ top: hole.top, left: hole.right, right: 0, height: hole.bottom - hole.top }} />
          {!holeOpen && <div className="gd-guard" style={{ top: hole.top, left: hole.left, width: hole.right - hole.left, height: hole.bottom - hole.top }} />}
        </>
      )}
      {hole && <div className="gd-ring" aria-hidden style={{ top: hole.top, left: hole.left, width: hole.right - hole.left, height: hole.bottom - hole.top }} />}

      {!step.silent && (
        <div className={`gd-coach ${pos}${slim ? ' slim' : ''}${step.whisper ? ' whisper' : ''}`} role="status" aria-live="polite">
          <div className="gd-coach-h">
            {!step.whisper && <DonSeal size={30} tilt={-6} />}
            <b>{step.whisper ? 'همسة تدريب — لا تظهر في اللعب الحقيقيّ' : 'الدون'}</b>
            {count && <span className="cnt">{count}</span>}
            {onLater && !step.whisper && <button type="button" className="later" onClick={onLater}>لاحقاً</button>}
          </div>
          {step.text}
          <div className="gd-coach-f">
            {isAction ? (
              <>
                <span className="try">{step.wait}</span>
                {stuck && onSkip && <button type="button" className="skipstep" onClick={onSkip}>تخطَّ الخطوة</button>}
              </>
            ) : (
              <>
                {onPrev && <button type="button" onClick={onPrev}>رجوع</button>}
                <button type="button" className="go" onClick={onNext}>{step.nextLabel || 'التالي'}</button>
              </>
            )}
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}

/** ورقة الدون: الدعوة والختم واختيار الدور */
export function DonSheet({ title, children }: { title: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(
    <div className="gd-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <div>
        <span className="seal"><DonSeal size={76} tilt={-6} /></span>
        <h3>{title}</h3>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** همسةٌ داخل الشاشة نفسها (بين سؤال الليل وقائمته، فوق شبكة التصويت) */
export function InlineWhisper({ label = 'همسة تدريب', flow, children }: { label?: string; flow?: boolean; children: ReactNode }) {
  return <div className={`gd-whisper-in${flow ? ' flow' : ''}`}><b>{label}</b>{children}</div>;
}

export function GuideToast({ text }: { text: string | null }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || !text) return null;
  return createPortal(<div className="gd-toast" role="status">{text}</div>, document.body);
}
