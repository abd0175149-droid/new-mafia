'use client';

// ══════════════════════════════════════════════════════
// صفحة اللاعبين — النوافذ: سببُ القفل/الإعفاء، نقلُ السجلّ الماليّ قبل الحذف،
// ومحاولاتُ الدخول على حسابٍ مقفول. تُرسم كلّها داخل الجذر `.wa`.
// ══════════════════════════════════════════════════════

import { useState, type ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { Badge, Banner, Empty, Field, Pop, Skel } from '../../whatsapp/wa-ui';
import { LOCALE } from './shared';

/** نموذجُ سببٍ — بديلُ window.prompt. الشرحُ فوق الحقل هو التأكيد نفسُه. */
export function ReasonPop({ title, intro, label, hint, initial = '', confirmText, danger, onCancel, onConfirm }: {
  title: ReactNode;
  intro: ReactNode;
  label: string;
  hint?: string;
  initial?: string;
  confirmText: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState(initial);
  return (
    <Pop title={title} onClose={onCancel}>
      <form className="stack" onSubmit={e => { e.preventDefault(); onConfirm(reason.trim()); }}>
        <div className="pl-intro">{intro}</div>
        <Field label={label} hint={hint} htmlFor="pl-reason">
          <input id="pl-reason" className="wa-input" value={reason} onChange={e => setReason(e.target.value)} maxLength={300} autoFocus />
        </Field>
        <div className="acts">
          <button type="button" className="wa-btn" onClick={onCancel}>إلغاء</button>
          <button type="submit" className={`wa-btn ${danger ? 'danger' : 'primary'}`}>{confirmText}</button>
        </div>
      </form>
    </Pop>
  );
}

/**
 * 🪙 الخادم رفض الحذف لأنّ للحساب سجلّاً ماليّاً — يُسأل هنا عن الحساب الباقي
 * الذي يُنقل إليه السجلّ (بديلُ window.prompt). التأكيدُ الأخير عند الصفحة.
 */
export function TransferPop({ player, detail, players, onCancel, onConfirm }: {
  player: any;
  detail: string;
  players: any[];
  onCancel: () => void;
  onConfirm: (toId: number) => void;
}) {
  const [raw, setRaw] = useState('');
  const toId = /^\d+$/.test(raw.trim()) ? parseInt(raw.trim(), 10) : NaN;
  const dest = Number.isFinite(toId) ? players.find(p => p.id === toId) : null;
  const same = toId === player.id;
  const valid = Number.isFinite(toId) && toId > 0 && !same;
  return (
    <Pop title="انقل السجلّ الماليّ أوّلاً" onClose={onCancel}>
      <form className="stack" onSubmit={e => { e.preventDefault(); if (valid) onConfirm(toId); }}>
        <Banner tone="warn">
          <b>لا يُحذف «{player.name}»</b> — {detail}.
        </Banner>
        <Field
          label="رقم الحساب الذي يُنقل إليه سجلّه (الحساب الباقي بعد الدمج)"
          htmlFor="pl-transfer"
          err={same ? 'لا يمكن النقل إلى الحساب نفسه' : undefined}
          hint={dest ? <>سيُنقل إلى «{dest.name}» <span className="ltr">#{dest.id}</span></>
            : valid ? 'ليس في القائمة المحمّلة — يتحقّق منه الخادم'
            : 'الرقم الظاهر بعد # تحت اسم اللاعب'}
        >
          <input id="pl-transfer" className={`wa-input ltr${same ? ' invalid' : ''}`} inputMode="numeric" pattern="[0-9]*"
            value={raw} onChange={e => setRaw(e.target.value.replace(/\D/g, ''))} placeholder="مثال: 412" autoFocus />
        </Field>
        <div className="acts">
          <button type="button" className="wa-btn" onClick={onCancel}>إلغاء</button>
          <button type="submit" className="wa-btn danger" disabled={!valid}>تابع إلى النقل والحذف</button>
        </div>
      </form>
    </Pop>
  );
}

/** 📍 محاولاتُ الدخول على حسابٍ مقفول — تُجلب عند الطلب (`attempts === null` = جارٍ الجلب) */
export function AttemptsPop({ player, attempts, onClose }: { player: any; attempts: any[] | null; onClose: () => void }) {
  return (
    <Pop wide onClose={onClose} title={<>محاولات الدخول <span className="pl-poptitle-sub">· {player.name}</span></>}>
      {attempts === null ? (
        <div className="stack"><Skel h={72} /><Skel h={72} /></div>
      ) : !attempts.length ? (
        <Empty title="لا محاولةَ دخولٍ منذ القفل" />
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {attempts.map((a: any) => (
            <div key={a.id} className="pl-attempt">
              <div className="row">
                <Badge tone={a.passwordOk ? 'danger' : undefined}>{a.passwordOk ? 'كلمة السرّ صحيحة' : 'كلمة سرّ خاطئة'}</Badge>
                <span className="grow" />
                <span className="ltr muted">{new Date(a.at).toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
              <div className="ltr pl-attempt-ip">{a.ip || '—'}</div>
              {a.phoneTried && a.phoneTried !== player.phone && (
                <div className="pl-attempt-note warn">كُتب الرقم: <span className="ltr">{a.phoneTried}</span></div>
              )}
              {/* النقطة — تُقرأ بمنطق صفحة مواقع اللاعبين: الدقّة تُذكر لأنّها تُضاف لا تُقارَن،
                  والتزييفُ يُعلَّم، وعمرُ القراءة من capturedAt لا من وقت وصولها. */}
              {a.latitude != null && a.longitude != null ? (
                <div className="row pl-attempt-loc">
                  <a href={`https://www.google.com/maps?q=${a.latitude},${a.longitude}`} target="_blank" rel="noopener noreferrer" className="pl-attempt-map">
                    <MapPin className="s" /><span className="ltr">{Number(a.latitude).toFixed(5)}, {Number(a.longitude).toFixed(5)}</span>
                  </a>
                  {a.accuracyM != null && <span className="pl-attempt-note">دقّة <span className="ltr">±{Math.round(a.accuracyM)}</span> م</span>}
                  {a.fixSource && <span className="pl-attempt-note">{a.fixSource === 'app' ? 'تطبيق' : 'ويب'}</span>}
                  {a.isMocked && <Badge tone="danger">موقعٌ مزيّف</Badge>}
                  {a.capturedAt && Math.abs(new Date(a.at).getTime() - new Date(a.capturedAt).getTime()) > 120000 && (
                    <span className="pl-attempt-note warn">قراءةٌ أقدمُ من المحاولة</span>
                  )}
                </div>
              ) : (
                <div className="pl-attempt-note">لا نقطةَ موقع — الإذنُ غير ممنوحٍ على ذلك الجهاز</div>
              )}
              {a.userAgent && <div className="ltr pl-attempt-ua">{a.userAgent}</div>}
            </div>
          ))}
        </div>
      )}
      <p className="pl-footnote">
        العنوانُ يُقرأ من الاتّصال نفسِه لا من ترويسةٍ يرسلها الجهاز — فلا يُنتحل.
        والنقطةُ تصل من الجهاز إن كان إذنُ الموقع ممنوحاً عليه سلفاً — ولا تُطلب في شاشة الدخول.
      </p>
    </Pop>
  );
}
