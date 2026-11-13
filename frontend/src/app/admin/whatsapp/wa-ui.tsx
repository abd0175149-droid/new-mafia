'use client';

// ══════════════════════════════════════════════════════
// مركز واتساب — المكوّنات الأوّليّة المشتركة (أصناف wa-* في wa.css)
// كلّ قسم يبني منها، فلا يعيد أحد كتابة مفتاح أو حقل أو بطاقة.
// ══════════════════════════════════════════════════════

import type { CSSProperties, ReactNode } from 'react';
import { X } from 'lucide-react';

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'violet' | 'gold' | 'web' | 'meta';
const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(' ');

/** مفتاح تشغيل/إيقاف — `label` يُقرأ لقارئ الشاشة */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" className="wa-toggle" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} />;
}

/** اختيار واحد من قليل */
export function Seg<T extends string>({ value, options, onChange, block, label }: {
  value: T; options: ReadonlyArray<readonly [T, ReactNode]>; onChange: (v: T) => void; block?: boolean; label?: string;
}) {
  return (
    <div className={cx('wa-seg', block && 'block')} role="group" aria-label={label}>
      {options.map(([k, l]) => <button type="button" key={k} aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

/** شريحة فلتر — `n` عدّاد اختياريّ */
export function Chip({ on, onClick, children, n }: { on: boolean; onClick: () => void; children: ReactNode; n?: ReactNode }) {
  return <button type="button" className="wa-chip" aria-pressed={on} onClick={onClick}>{children}{n != null && <span className="n">{n}</span>}</button>;
}

export function Badge({ tone, children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span className={cx('wa-badge', tone)} title={title}>{children}</span>;
}

/** حقل بعنوان وتلميح — مرّر `htmlFor` مطابقاً لـ id الحقل */
export function Field({ label, hint, err, htmlFor, children, style }: { label: ReactNode; hint?: ReactNode; err?: ReactNode; htmlFor?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="wa-field" style={style}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {err ? <span className="hint err">{err}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/** سطر إعداد: نصّ يشرح + عنصر تحكّم في طرفه */
export function Setting({ title, hint, children }: { title: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="wa-setting">
      <div className="txt"><b>{title}</b>{hint && <span>{hint}</span>}</div>
      {children}
    </div>
  );
}

export function Card({ title, aside, children, className, style }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={cx('wa-card', className)} style={style}>
      {(title || aside) && <h3>{title}{aside && <small>{aside}</small>}</h3>}
      {children}
    </section>
  );
}

/** بلاطة رقم: عنوان صغير، قيمة كبيرة، سطر توضيح */
export function Tile({ k, v, h, tone }: { k: ReactNode; v: ReactNode; h?: ReactNode; tone?: 'ok' | 'danger' | 'gold' }) {
  return <div className={cx('wa-tile', tone)}><div className="k">{k}</div><div className="v">{v}</div>{h && <div className="h">{h}</div>}</div>;
}

export function Banner({ tone, icon, children, action, onAction, flat }: { tone?: Exclude<Tone, 'gold' | 'web' | 'meta'>; icon?: ReactNode; children: ReactNode; action?: ReactNode; onAction?: () => void; flat?: boolean }) {
  return (
    <div className={cx('wa-banner', tone, flat && 'flat')} role={tone === 'danger' ? 'alert' : undefined}>
      {icon}<span>{children}</span>
      {action && <button type="button" className="act" onClick={onAction}>{action}</button>}
    </div>
  );
}

/** شريط نسبة 0–100 */
export function Meter({ pct, tone, style }: { pct: number; tone?: 'warn' | 'danger' | 'info' | 'gold'; style?: CSSProperties }) {
  return <div className={cx('wa-meter', tone)} style={style}><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
}

/** سطر شريط أفقيّ: تسمية · شريط · رقم */
export function HBar({ label, pct, value, tone }: { label: ReactNode; pct: number; value: ReactNode; tone?: 'warn' | 'danger' | 'info' | 'gold' }) {
  return <div className="wa-hbar"><span>{label}</span><Meter pct={pct} tone={tone} /><b>{value}</b></div>;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return <div className="wa-empty">{icon}<b>{title}</b>{children && <span>{children}</span>}</div>;
}

export function Skel({ h = 16, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="wa-skel" style={{ height: h, width: w }} aria-hidden="true" />;
}

/** رأس القسم: عنوان (يختفي على الهاتف — شريط القسم يحمله) + وصف + أزرار */
export function PageHead({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="wa-pagehead">
      <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
      {children && <div className="acts">{children}</div>}
    </div>
  );
}

/** نافذة: لوح سفليّ على الهاتف ونافذة وسطيّة على الحاسوب. يجب أن تُرسم داخل عنصر يحمل الصنف wa. */
export function Pop({ title, onClose, children, wide, label }: { title?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; label?: string }) {
  return (
    <div className="wa-pop" onClick={onClose}>
      <div className={cx('box', wide && 'wide')} role="dialog" aria-modal="true" aria-label={label} onClick={e => e.stopPropagation()}>
        <span className="grab" />
        {title && (
          <h2>
            <span className="grow">{title}</span>
            <button type="button" className="wa-iconbtn" aria-label="إغلاق" onClick={onClose}><X /></button>
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}
