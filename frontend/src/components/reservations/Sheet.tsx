'use client';

// ══════════════════════════════════════════════════════
// 📄 ورقةٌ سفليّة — الحاوية المشتركة لنوافذ صفحة الحجوزات
//
// 🔴 من الأسفل لا من الأعلى: أعلى الشاشة أبعدُ نقطةٍ عن إبهام اليد الواحدة،
//    والموظّفُ يقف على الباب بيدٍ واحدة. وتُسحب للأسفل فتُغلق.
// 🔴 وأهدافُ اللمس داخلها ٤٤ بكسل فأكثر.
//
// المظهر من نظام التصميم (wa.css + res.css) — يجب أن تُرسم داخل عنصرٍ يحمل الصنف wa.
// ══════════════════════════════════════════════════════

import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Minus, Plus } from 'lucide-react';

export function Sheet({ open, onClose, children, label }: {
  open: boolean; onClose: () => void; children: ReactNode; label?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
          className="res-scrim"
          dir="rtl"
        >
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 620) onClose(); }}
            className="res-sheet"
            role="dialog" aria-modal="true" aria-label={label}
          >
            <div className="grabwrap"><i /></div>
            <div className="body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SheetHead({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="res-sheethead">
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
    </div>
  );
}

/** صفُّ فعلٍ — ٥٢ بكسل حدّاً أدنى. `icon` عنصر lucide. */
export function ActionRow({ icon, title, sub, onClick, tone, disabled }: {
  icon: ReactNode; title: ReactNode; sub?: ReactNode;
  onClick?: () => void; tone?: 'danger' | 'accent' | 'ok'; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`res-act${tone ? ' ' + tone : ''}`}>
      <span className="ic">{icon}</span>
      <span className="t">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </span>
      {onClick && <span className="go"><ChevronLeft /></span>}
    </button>
  );
}

/** حقلُ إدخالٍ بارتفاع اللمس */
export function Field({ value, onChange, placeholder, dir, type, autoFocus, inputMode }: {
  value: string; onChange: (v: string) => void; placeholder: string;
  dir?: 'ltr' | 'rtl'; type?: string; autoFocus?: boolean;
  inputMode?: 'text' | 'tel' | 'numeric';
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      dir={dir}
      type={type}
      inputMode={inputMode}
      autoFocus={autoFocus}
      className="wa-input"
      style={dir === 'ltr' ? { textAlign: 'end' } : undefined}
    />
  );
}

/** عدّادٌ بأزرارٍ بحجم الإبهام */
export function Counter({ value, onChange, label }: {
  value: number; onChange: (v: number) => void; label: string;
}) {
  return (
    <div className="res-counter">
      <span>{label}</span>
      <div>
        <button type="button" className="wa-btn" aria-label="أنقص" onClick={() => onChange(Math.max(1, value - 1))}><Minus /></button>
        <b>{value}</b>
        <button type="button" className="wa-btn" aria-label="زِد" onClick={() => onChange(value + 1)}><Plus /></button>
      </div>
    </div>
  );
}

export function PrimaryButton({ children, onClick, disabled }: {
  children: ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="wa-btn primary block" style={{ minHeight: 52, fontSize: 16 }}>
      {children}
    </button>
  );
}
