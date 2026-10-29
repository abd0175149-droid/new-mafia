'use client';

// ══════════════════════════════════════════════════════
// 🧩 قطع كونسول المكان المشتركة — إعادة البناء 2026-10-30
// ورقةٌ سفليّة، إشعارٌ بتراجع، تبويباتٌ مقسّمة، شارة مقعد، مفتاح، وأيقوناتٌ
// مرسومة بخطٍّ واحد (لا إيموجي: الإيموجي لا يتبع اللون ولا الحجم ولا الخطّ).
// كلّ صفحات /venue تبني منها، فيبقى الشكل واحداً والسلوك واحداً.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { EM, TX } from './ember';
import { useVenue } from './context';

// ── الأيقونات ─────────────────────────────────────────
const P: Record<string, ReactNode> = {
  flame: <path d="M12 22c4 0 7-2.7 7-6.8 0-3.6-2.4-6-4.2-8.4-.4 1.9-1.4 3.2-2.8 3.9.2-3-1.2-6-3.6-8.2C8 6 5 9.2 5 15.2 5 19.3 8 22 12 22z" />,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1.3" /></>,
  menu: <><path d="M5 4h14v16H5z" /><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" /></>,
  sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  warn: <><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4.5M12 17.5v.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  chevron: <path d="M15 18l-6-6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  printer: <><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>,
  bell: <><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  bellOff: <><path d="M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2H9" /><path d="M10 20a2 2 0 0 0 4 0M3 3l18 18" /></>,
  sound: <><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></>,
  mute: <><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M17 9l5 6M22 9l-5 6" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  logout: <><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" /></>,
};
export type IconName = keyof typeof P;

export function Icon({ name, size = 20, stroke = 1.9, color = 'currentColor', style }: { name: IconName; size?: number; stroke?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', ...style }}>
      {P[name]}
    </svg>
  );
}

// ── شارة المقعد ───────────────────────────────────────
export function SeatBadge({ seat, size = 40, line = EM.line2 }: { seat: number | null | undefined; size?: number; line?: string }) {
  return (
    <span className="vc-num shrink-0 flex items-center justify-center font-semibold"
      aria-label={seat != null ? `مقعد ${seat}` : 'بلا مقعد'}
      style={{ width: size, height: size, borderRadius: 11, background: '#0F1311', border: `1px solid ${line}`, fontSize: size >= 42 ? 17 : 15, color: seat != null ? EM.text : EM.faint }}>
      {seat ?? '—'}
    </span>
  );
}

// ── الورقة السفليّة ───────────────────────────────────
/** ورقةٌ تصعد من الأسفل: الخلفيّة تغلقها، وزرّ ✕ صريح، وEsc على الحاسوب. */
export function Sheet({ open, onClose, title, subtitle, lead, children, maxWidth = 560 }: {
  open: boolean; onClose: () => void; title?: ReactNode; subtitle?: ReactNode; lead?: ReactNode; children: ReactNode; maxWidth?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="vc-scrim fixed inset-0 z-[80] flex flex-col justify-end sm:justify-center sm:items-center" style={{ background: 'rgba(0,0,0,.62)' }} dir="rtl">
      <button type="button" aria-label="إغلاق" onClick={onClose} className="absolute inset-0 w-full h-full cursor-default" style={{ background: 'transparent' }} />
      <div role="dialog" aria-modal="true" className="vc-sheet vc-scroll relative w-full overflow-y-auto sm:rounded-3xl"
        style={{ maxWidth, maxHeight: '92dvh', background: EM.card, borderTop: `1px solid ${EM.line2}`, borderRadius: '24px 24px 0 0', padding: '10px 16px calc(20px + env(safe-area-inset-bottom))' }}>
        <div className="sm:hidden" style={{ width: 44, height: 4, borderRadius: 4, background: '#3A4640', margin: '0 auto 12px' }} />
        {(title || lead) && (
          <div className="flex items-center gap-3 mb-1">
            {lead}
            <div className="flex-1 min-w-0">
              {title && <div className="text-[18px] font-extrabold leading-tight">{title}</div>}
              {subtitle && <div className="text-[12.5px] mt-0.5" style={{ color: TX.dim }}>{subtitle}</div>}
            </div>
            <button type="button" onClick={onClose} aria-label="إغلاق" className="vc-press w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ border: `1px solid ${EM.line2}`, color: TX.sub }}>
              <Icon name="x" size={18} stroke={2} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ── الإشعار العائم بتراجعٍ اختياريّ ─────────────────────
export interface ToastMsg { id: number; text: string; tone?: 'ok' | 'bad'; undo?: () => void | Promise<void>; ms?: number }

export function useToast() {
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, opts: { tone?: 'ok' | 'bad'; undo?: () => void | Promise<void>; ms?: number } = {}) => {
    if (timer.current) clearTimeout(timer.current);
    const t: ToastMsg = { id: Date.now(), text, ...opts };
    setToast(t);
    timer.current = setTimeout(() => setToast(null), opts.ms ?? (opts.undo ? 6000 : 2800));
  }, []);
  const hide = useCallback(() => { if (timer.current) clearTimeout(timer.current); setToast(null); }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { toast, show, hide };
}

export function Toast({ toast, onHide }: { toast: ToastMsg | null; onHide: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!toast) return null;
  const bad = toast.tone === 'bad';
  return (
    <div role="status" key={toast.id} className="vc-toast fixed z-[95] left-3 right-3 sm:left-auto sm:right-6 sm:w-[420px] flex items-center gap-2.5"
      style={{
        bottom: 'calc(88px + env(safe-area-inset-bottom))', minHeight: 52, padding: '4px 6px 4px 14px', borderRadius: 14,
        background: bad ? '#2A1B18' : '#1C2722', border: `1px solid ${bad ? 'rgba(224,73,43,.5)' : 'rgba(37,192,138,.45)'}`,
        color: bad ? '#FBD3C8' : '#D6F5E8', fontSize: 14, fontWeight: 700, boxShadow: '0 10px 28px rgba(0,0,0,.5)',
      }} dir="rtl">
      <Icon name={bad ? 'warn' : 'check'} size={18} stroke={2.4} color={bad ? TX.bad : TX.good} />
      <span className="flex-1 leading-snug py-2">{toast.text}</span>
      {toast.undo && (
        <button type="button" disabled={busy} className="vc-press h-11 px-3.5 rounded-[10px] shrink-0 font-extrabold text-[14px]"
          style={{ background: 'rgba(255,255,255,.08)', color: TX.amber }}
          onClick={async () => { setBusy(true); try { await toast.undo!(); } finally { setBusy(false); onHide(); } }}>
          تراجع
        </button>
      )}
    </div>
  );
}

// ── تبويباتٌ مقسّمة (حبّاتٌ داخل علبة) ────────────────
export function Segmented<T extends string>({ value, onChange, items, label, size = 'md' }: {
  value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; label: string; size?: 'sm' | 'md';
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 p-1 rounded-[14px]" style={{ background: EM.ink2, border: `1px solid ${EM.line}` }}>
      {items.map(it => {
        const on = it.value === value;
        return (
          <button key={it.value} type="button" role="tab" aria-selected={on} onClick={() => onChange(it.value)}
            className="vc-press flex-1 rounded-[10px] font-extrabold whitespace-nowrap px-3"
            style={{ height: size === 'sm' ? 36 : 40, fontSize: size === 'sm' ? 13.5 : 14, background: on ? EM.line : 'transparent', color: on ? EM.text : TX.dim }}>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

// ── المفتاح ───────────────────────────────────────────
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onChange}
      className="w-14 h-12 flex items-center justify-center shrink-0 disabled:opacity-40">
      <span className="flex items-center rounded-full p-[3px]"
        style={{ width: 46, height: 28, background: on ? EM.go : '#3A4640', justifyContent: on ? 'flex-start' : 'flex-end', transition: 'background-color 160ms ease' }}>
        <span className="rounded-full" style={{ width: 22, height: 22, background: '#F4F7F5', boxShadow: '0 1px 3px rgba(0,0,0,.35)' }} />
      </span>
    </button>
  );
}

// ── الأزرار ───────────────────────────────────────────
const BTN: Record<string, CSSProperties> = {
  primary: { background: '#CC7F22', color: '#1A1208', border: 'none' },
  go: { background: EM.go, color: '#04231A', border: 'none' },
  club: { background: 'rgba(85,150,204,.12)', color: '#D6E6F3', border: '1px solid #3B5F80' },
  ghost: { background: 'transparent', color: '#C9D4CD', border: `1px solid ${EM.line2}` },
  danger: { background: '#E0492B', color: '#fff', border: 'none' },
  quietBad: { background: 'transparent', color: TX.bad, border: 'none' },
};
export function Btn({ kind = 'ghost', h = 48, full, className = '', style, children, ...rest }: {
  kind?: keyof typeof BTN; h?: number; full?: boolean; className?: string; style?: CSSProperties; children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest} className={`vc-press rounded-xl font-extrabold flex items-center justify-center gap-2 px-4 ${full ? 'w-full' : ''} ${className}`}
      style={{ height: h, fontSize: h >= 52 ? 16 : 14.5, ...BTN[kind], ...style }}>
      {children}
    </button>
  );
}

// ── مربّعات اللون «لك / للنادي» ──────────────────────
export function Swatch({ color, size = 10 }: { color: string; size?: number }) {
  return <span aria-hidden="true" className="inline-block shrink-0" style={{ width: size, height: size, borderRadius: 3, background: color }} />;
}

// ── المبلغ بوحدته الصغيرة ─────────────────────────────
export function Amount({ value, size = 17, unit = true, color }: { value: string; size?: number; unit?: boolean; color?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="vc-num font-semibold" style={{ fontSize: size, color }}>{value}</span>
      {unit && <span style={{ fontSize: Math.max(12, Math.round(size * 0.42)), color: TX.dim }}>د.أ</span>}
    </span>
  );
}

// ── جلب واجهة المكان مع locationId للإدارة ─────────────
export function useVenueApi() {
  const { locationId, authHeaders, isHQ } = useVenue();
  const withLoc = useCallback((url: string) => (isHQ && locationId)
    ? `${url}${url.includes('?') ? '&' : '?'}locationId=${locationId}` : url, [isHQ, locationId]);
  const get = useCallback(async (url: string) => {
    const r = await fetch(withLoc(url), { headers: authHeaders });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok && d?.success !== false, status: r.status, data: d };
  }, [withLoc, authHeaders]);
  const send = useCallback(async (url: string, method: string, body?: any) => {
    const r = await fetch(withLoc(url), {
      method, headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok && d?.success !== false, status: r.status, data: d };
  }, [withLoc, authHeaders]);
  return { withLoc, get, send, authHeaders };
}

// ── عنوان الصفحة ──────────────────────────────────────
export function PageHead({ title, sub, side }: { title: string; sub?: ReactNode; side?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-extrabold leading-tight">{title}</h1>
        {sub && <div className="text-[13px] mt-0.5" style={{ color: TX.dim }}>{sub}</div>}
      </div>
      {side}
    </div>
  );
}

// ── هيكلٌ عظميّ أثناء التحميل (لا دوّاماتٍ وسط المحتوى) ──
export function Skeleton({ h = 64, n = 3 }: { h?: number; n?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-[14px]" style={{ height: h, background: EM.card, border: `1px solid ${EM.line}` }} />
      ))}
    </div>
  );
}
