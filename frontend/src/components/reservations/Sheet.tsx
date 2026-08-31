'use client';

// ══════════════════════════════════════════════════════
// 📄 ورقةٌ سفليّة — الحاوية المشتركة لكلّ نوافذ الصفحة
//
// 🔴 من الأسفل لا من الأعلى: أعلى الشاشة أبعدُ نقطةٍ عن إبهام اليد الواحدة،
//    والموظّفُ يقف على الباب بيدٍ واحدة.
// 🔴 وأهدافُ اللمس داخلها ٤٤ بكسل فأكثر — كانت ٣٠×٣١ في البطاقة القديمة.
// ══════════════════════════════════════════════════════

import { motion, AnimatePresence } from 'framer-motion';
import { RES_COLORS } from '@/lib/reservation-status';

export function Sheet({ open, onClose, children }: {
  open: boolean; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          dir="rtl"
        >
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 620) onClose(); }}
            className="w-full sm:max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl sm:mb-6"
            style={{ background: '#12141a', border: '1px solid rgba(255,255,255,.1)' }}
          >
            <div className="sticky top-0 pt-2 pb-1" style={{ background: '#12141a' }}>
              <div className="w-10 h-1 rounded-full mx-auto" style={{ background: 'rgba(255,255,255,.2)' }} />
            </div>
            <div className="px-4 pb-[max(18px,env(safe-area-inset-bottom))]">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SheetHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[19px] font-bold text-white leading-tight">{title}</h2>
      {sub && <p className="text-[12.5px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

/** صفُّ فعلٍ — ٥٢ بكسل حدّاً أدنى */
export function ActionRow({ icon, title, sub, onClick, tone, disabled }: {
  icon: string; title: string; sub?: string;
  onClick?: () => void; tone?: 'danger' | 'accent'; disabled?: boolean;
}) {
  const color = tone === 'danger' ? RES_COLORS.noShow : tone === 'accent' ? RES_COLORS.pending : '#e5e7eb';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 py-3 text-right disabled:opacity-40"
      style={{ minHeight: 52, borderBottom: '1px solid rgba(255,255,255,.05)' }}
    >
      <span className="w-7 text-center shrink-0 text-[17px]">{icon}</span>
      <span className="flex-1 min-w-0">
        <b className="block text-[14.5px] font-bold" style={{ color }}>{title}</b>
        {sub && <span className="block text-[11.5px] text-gray-500 leading-relaxed">{sub}</span>}
      </span>
      {onClick && <span className="text-[13px] text-gray-600 shrink-0">←</span>}
    </button>
  );
}

/** حقلُ إدخالٍ بارتفاع ٤٨ */
export function Field({ value, onChange, placeholder, dir, type, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder: string;
  dir?: 'ltr' | 'rtl'; type?: string; autoFocus?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      dir={dir}
      type={type}
      autoFocus={autoFocus}
      className="w-full h-12 px-3 rounded-xl text-white text-[15px] outline-none focus:ring-1 focus:ring-amber-500/50 placeholder-gray-600"
      style={{ background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.09)' }}
    />
  );
}

/** عدّادٌ بأزرارٍ بحجم الإبهام */
export function Counter({ value, onChange, label }: {
  value: number; onChange: (v: number) => void; label: string;
}) {
  const btn = 'w-12 h-12 rounded-xl text-[20px] text-white flex items-center justify-center';
  const style = { background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' };
  return (
    <div className="flex items-center gap-3">
      <span className="text-[14px] text-gray-400">{label}</span>
      <div className="flex items-center gap-2 ms-auto">
        <button className={btn} style={style} onClick={() => onChange(Math.max(1, value - 1))}>−</button>
        <b className="text-[18px] text-white min-w-[26px] text-center tabular-nums">{value}</b>
        <button className={btn} style={style} onClick={() => onChange(value + 1)}>＋</button>
      </div>
    </div>
  );
}

export function PrimaryButton({ children, onClick, disabled }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full h-[52px] rounded-2xl text-[16px] font-extrabold disabled:opacity-40"
      style={{ background: 'linear-gradient(135deg,#E8B84B,#DCA83C)', color: '#1a1408' }}
    >
      {children}
    </button>
  );
}
