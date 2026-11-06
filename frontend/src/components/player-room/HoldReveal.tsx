'use client';

// ══════════════════════════════════════════════════════
// ✋ «اضغط مطوّلاً» — الطبقة الوحيدة التي تختلف من دورٍ لدور (2026-11-06)
//
// قاعدة المالك: اللاعبون متجاورون، فكلّ شاشةٍ متطابقة لكلّ الأدوار. ما يخصّ
// الدور (رسالة الليل، المهامّ، الفريق، العقود) يُرسم **فقط ما دام الإصبع ضاغطاً**
// ويُمحى من الصفحة عند الرفع — لا يوجد في DOM قبل الضغط ولا بعده.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import SecretWatermark from '../SecretWatermark';

const OPEN_AFTER_MS = 200;

/** خطّافٌ عامّ: الضغط المطوّل يفتح، والرفع/الخروج يغلق. */
export function useHold(onOpen?: () => void) {
  const [open, setOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opened = useRef(false);
  const end = useCallback(() => {
    if (t.current) { clearTimeout(t.current); t.current = null; }
    setHolding(false); setOpen(false); opened.current = false;
  }, []);
  const start = useCallback(() => {
    setHolding(true);
    t.current = setTimeout(() => {
      t.current = null; setOpen(true);
      if (!opened.current) { opened.current = true; onOpen?.(); }
    }, OPEN_AFTER_MS);
  }, [onOpen]);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  // الخروج من الصفحة (تبديل التطبيق/قفل الشاشة) يغلق دائماً
  useEffect(() => {
    const h = () => { if (document.hidden) end(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [end]);
  const bind = {
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); start(); },
    onPointerUp: end, onPointerCancel: end, onPointerLeave: end,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onKeyDown: (e: React.KeyboardEvent) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); setOpen(true); if (!opened.current) { opened.current = true; onOpen?.(); } } },
    onKeyUp: (e: React.KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') end(); },
  };
  return { open, holding, bind };
}

interface Props {
  title: string;
  hint?: string;
  watermark: string;
  /** يُستدعى مرّةً عند كلّ فتح (مثلاً تنبيه الليدر) */
  onOpen?: () => void;
  /** المحتوى الخاصّ — دالّة كي لا يُبنى قبل الضغط */
  children: () => ReactNode;
  className?: string;
  compact?: boolean;
}

export default function HoldReveal({ title, hint = 'اضغط مطوّلاً وغطِّ الشاشة بكفّك', watermark, onOpen, children, className = '', compact }: Props) {
  const { open, holding, bind } = useHold(onOpen);
  return (
    <div
      role="button" tabIndex={0} aria-label={`${title}، اضغط مطوّلاً`} {...bind}
      className={`pr-hold ${compact ? 'pr-hold-compact' : ''} ${holding ? 'is-holding' : ''} ${open ? 'is-open' : ''} ${className}`}
      style={{ touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
    >
      <svg className="pr-hold-ring" viewBox="0 0 24 24" aria-hidden><circle className="tr" cx="12" cy="12" r="9" /><circle className="pg" cx="12" cy="12" r="9" /></svg>
      <b>{title}</b>
      <small>{hint}</small>
      {open && (
        <div className="pr-hold-in" aria-live="polite">
          <SecretWatermark label={watermark} opacity={0.09} />
          <div className="relative">{children()}</div>
        </div>
      )}
    </div>
  );
}
