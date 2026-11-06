'use client';

// ══════════════════════════════════════════════════════
// ✋ «اضغط مطوّلاً» — الطبقة الوحيدة التي تختلف من دورٍ لدور (2026-11-06)
//
// قاعدة المالك: اللاعبون متجاورون، فكلّ شاشةٍ متطابقة لكلّ الأدوار. ما يخصّ
// الدور (رسالة الليل، المهامّ، الفريق، العقود) لا يوجد في الصفحة قبل الضغط.
//
// 🔁 بعد أوّل ليلةٍ حيّة (2026-11-06): «يظهر ما دام الإصبع ضاغطاً» فشل في القاعة —
//    الإصبع يغطّي المحتوى نفسه، والمهامّ الطويلة لا تُمرَّر والإصبع ممسك.
//    الآن: الضغط المطوّل **يفتح** لوحةً خاصّة في أعلى الشاشة (بعيداً عن الإصبع)،
//    تبقى مفتوحة وتُمرَّر، وتُغلق بـ«إخفاء» أو بتبدّل المرحلة أو بمغادرة التطبيق
//    أو وحدها بعد مهلة. الإطار نفسه لكلّ الأدوار — المحتوى وحده يختلف.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import SecretWatermark from '../SecretWatermark';

const OPEN_AFTER_MS = 350;
/** تُغلق اللوحة وحدها — هاتفٌ نُسي مفتوحاً على الطاولة لا يبقى مكشوفاً */
const AUTO_CLOSE_MS = 45_000;

/**
 * الضغط المطوّل يفتح. `latch` (الافتراضيّ): يبقى مفتوحاً بعد رفع الإصبع حتى `close()`.
 * بدونه: الرفع يغلق (السلوك القديم).
 */
export function useHold(onOpen?: () => void, opts: { latch?: boolean; autoCloseMs?: number } = {}) {
  const latch = opts.latch !== false;
  const autoMs = opts.autoCloseMs ?? AUTO_CLOSE_MS;
  const [open, setOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(false);
  openRef.current = open;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const cancel = useCallback(() => { if (t.current) { clearTimeout(t.current); t.current = null; } setHolding(false); }, []);
  const close = useCallback(() => { cancel(); setOpen(false); }, [cancel]);
  const doOpen = useCallback(() => { setOpen(true); onOpenRef.current?.(); }, []);
  const start = useCallback(() => {
    if (openRef.current) return;
    setHolding(true);
    t.current = setTimeout(() => { t.current = null; setHolding(false); doOpen(); }, OPEN_AFTER_MS);
  }, [doOpen]);
  const release = useCallback(() => { if (latch && openRef.current) { cancel(); return; } close(); }, [latch, cancel, close]);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  // الخروج من الصفحة (تبديل التطبيق/قفل الشاشة) يغلق دائماً
  useEffect(() => {
    const h = () => { if (document.hidden) close(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [close]);
  useEffect(() => {
    if (!open || !latch || !autoMs) return;
    const a = setTimeout(close, autoMs);
    return () => clearTimeout(a);
  }, [open, latch, autoMs, close]);
  const bind = {
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); start(); },
    onPointerUp: release, onPointerCancel: release, onPointerLeave: release,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onKeyDown: (e: React.KeyboardEvent) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); if (!openRef.current) doOpen(); } },
    onKeyUp: (e: React.KeyboardEvent) => { if (!latch && (e.key === ' ' || e.key === 'Enter')) close(); },
  };
  return { open, holding, bind, close };
}

/** لوحة السرّ: أعلى الشاشة، فوق كلّ شيء، تُمرَّر، وزرّ «إخفاء» كبير أسفلها. */
export function PrivatePanel({ title, watermark, onClose, children }: { title: string; watermark: string; onClose: () => void; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className="pr-peek" role="dialog" aria-modal="true" aria-label={title} dir="rtl">
      <div className="pr-peek-card">
        <SecretWatermark label={watermark} opacity={0.08} />
        <div className="pr-peek-hd"><b>{title}</b><small>غطِّ الشاشة بكفّك</small></div>
        <div className="pr-peek-bd">{children}</div>
      </div>
      <button type="button" className="pr-peek-x" onClick={onClose}>إخفاء</button>
    </div>,
    document.body,
  );
}

interface Props {
  title: string;
  hint?: string;
  watermark: string;
  /** يُستدعى مرّةً عند كلّ فتح (مثلاً تنبيه الليدر) */
  onOpen?: () => void;
  /** المحتوى الخاصّ — دالّة كي لا يُبنى قبل الفتح */
  children: () => ReactNode;
  /** عنوان لوحة السرّ (الافتراضيّ: title) */
  panelTitle?: string;
  className?: string;
  compact?: boolean;
}

export default function HoldReveal({ title, hint = 'اضغط مطوّلاً لتفتح — وغطِّ الشاشة بكفّك', watermark, onOpen, children, panelTitle, className = '', compact }: Props) {
  const { open, holding, bind, close } = useHold(onOpen);
  return (
    <>
      <div
        role="button" tabIndex={0} aria-label={`${title}، اضغط مطوّلاً`} {...bind}
        className={`pr-hold ${compact ? 'pr-hold-compact' : ''} ${holding ? 'is-holding' : ''} ${className}`}
        style={{ touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
      >
        <svg className="pr-hold-ring" viewBox="0 0 24 24" aria-hidden><circle className="tr" cx="12" cy="12" r="9" /><circle className="pg" cx="12" cy="12" r="9" /></svg>
        <b>{title}</b>
        {hint && <small>{hint}</small>}
      </div>
      {open && <PrivatePanel title={panelTitle || title} watermark={watermark} onClose={close}>{children()}</PrivatePanel>}
    </>
  );
}
