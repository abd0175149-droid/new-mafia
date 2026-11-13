'use client';

// ══════════════════════════════════════════════════════
// 🤖 «الدون في المتابعة» — ما يُسمح للدون أن يغيّره في قائمة الحجوزات (للأدمن)
//
// 🔴 لا مفتاح هنا لتعليم «وصل»: الوصول يقرّره الباب والغرفة والموظّف فقط (قرار المالك).
// 🔴 والتحذير ثابتٌ لا يُطوى: المرافق بلا حساب يبقى «لم يصل» ولو كان جالساً —
//    فمتابعةٌ آليّة بلا تعليم الباب أوّلاً تراسل من هم في القاعة.
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { Bot, Check, TriangleAlert } from 'lucide-react';
import { apiFetch } from '@/hooks/useReservations';
import { swalAlert, swalToast } from '@/lib/swal';
import { Banner, Card, Field, Pop, Setting, Skel, Toggle } from '@/app/admin/whatsapp/wa-ui';

interface Settings {
  botSetEta: boolean; botDecline: boolean; lateReminderMinutes: number;
  autoEnabled: boolean; autoAfterMinutes: number; template: string;
}

const norm = (d: any): Settings => ({
  botSetEta: !!d?.botSetEta,
  botDecline: !!d?.botDecline,
  lateReminderMinutes: Math.max(0, Number(d?.lateReminderMinutes) || 0),
  autoEnabled: !!d?.autoEnabled,
  autoAfterMinutes: Math.max(0, Number(d?.autoAfterMinutes) || 0),
  template: String(d?.template ?? ''),
});
const digits = (v: string) => Math.max(0, Math.min(600, Number(v.replace(/\D/g, '')) || 0));

export default function BotSettingsPop({ onClose, onUnavailable }: {
  onClose: () => void;
  onUnavailable: () => void;
}) {
  const [s, setS] = useState<Settings | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await apiFetch('/api/reservations/followup/settings');
        if (alive) setS(norm(d));
      } catch (e: any) {
        if (!alive) return;
        if (e?.status === 404) { onUnavailable(); swalToast('إعدادات الدون غير متاحة على الخادم بعد', 'info'); onClose(); return; }
        setErr(e?.status === 403 ? 'هذه الإعدادات للأدمن فقط.' : (e?.message || 'تعذّر تحميل الإعدادات'));
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => { setS(p => (p ? { ...p, [k]: v } : p)); setDirty(true); };

  const save = async () => {
    if (!s || saving) return;
    setSaving(true);
    try {
      await apiFetch('/api/reservations/followup/settings', { method: 'PUT', body: JSON.stringify(s) });
      setDirty(false);
      swalToast('حُفظت إعدادات الدون', 'success');
      onClose();
    } catch (e: any) {
      swalAlert('تعذّر الحفظ: ' + (e?.message || ''), 'error');
    } finally { setSaving(false); }
  };

  return (
    <Pop title="الدون في المتابعة" onClose={onClose} label="الدون في المتابعة" wide>
      <p className="res-fine">ما يُسمح للدون أن يغيّره في قائمة الحجوزات. كلّ ما يغيّره يظهر في «الدون يتابع» ومعه تراجع.</p>

      {err ? (
        <Banner tone="danger" icon={<TriangleAlert />}>{err}</Banner>
      ) : !s ? (
        <><Skel h={64} /><Skel h={64} /><Skel h={64} /><Skel h={120} /></>
      ) : (
        <>
          <Card title={<><Bot style={{ color: 'var(--info)' }} />ما يفعله الدون وحده</>}>
            <Setting title="يسجّل وقت الوصول من ردّ العميل" hint="«ربع ساعة»، «8 ونص»، «بعد الاستراحة». ما لا يفهمه يرفعه لك.">
              <Toggle on={s.botSetEta} onChange={v => set('botSetEta', v)} label="يسجّل وقت الوصول من ردّ العميل" />
            </Setting>
            <Setting title="يحوّل الحجز إلى «لن يحضر» بعد تأكيد العميل بزرّ" hint="فقط بعد أن يضغط العميل زرّ التأكيد. يبقى التراجع متاحاً لك.">
              <Toggle on={s.botDecline} onChange={v => set('botDecline', v)} label="يحوّل الحجز إلى لن يحضر بعد تأكيد العميل بزرّ" />
            </Setting>
            <Setting title="يذكّر من تجاوز وقته بعد (دقيقة) — 0 = لا يذكّر" hint="رسالة واحدة بعد التأخّر بهذه المدّة، ولا يكرّر.">
              <input className="wa-input num" dir="ltr" inputMode="numeric" aria-label="دقائق التأخّر قبل التذكير"
                value={String(s.lateReminderMinutes)} onChange={e => set('lateReminderMinutes', digits(e.target.value))} />
            </Setting>
          </Card>

          <Card title="المتابعة الآليّة" aside="بلا ضغطة منك">
            <Setting title="أرسل المتابعة تلقائيّاً بعد بدء الفعاليّة" hint="لمن لم يصل ولم يحدّد وقتاً.">
              <Toggle on={s.autoEnabled} onChange={v => set('autoEnabled', v)} label="أرسل المتابعة تلقائيّاً بعد بدء الفعاليّة" />
            </Setting>
            <Setting title="بعد البدء بـ (دقيقة)" hint={s.autoEnabled ? undefined : 'يُستعمل حين تُشغَّل المتابعة الآليّة.'}>
              <input className="wa-input num" dir="ltr" inputMode="numeric" aria-label="دقائق بعد البدء" disabled={!s.autoEnabled}
                value={String(s.autoAfterMinutes)} onChange={e => set('autoAfterMinutes', digits(e.target.value))} />
            </Setting>
          </Card>

          <Banner tone="warn" icon={<TriangleAlert />}>
            المرافقون والضيوف بلا حساب يبقون «لم يصلوا» ولو كانوا في القاعة. علّمهم من الباب قبل الإرسال.
          </Banner>

          <Field label="نصّ رسالة المتابعة" htmlFor="res-bot-tpl" hint={'المتغيّرات: {الاسم}، {الفعاليّة} — تُملأ لكلّ مستلم.'}>
            <textarea id="res-bot-tpl" className="wa-textarea" rows={7} value={s.template} onChange={e => set('template', e.target.value)} />
          </Field>

          <div className="wa-actionbar res-popbar">
            <div className="sum">
              <b>{dirty ? 'تغييرات لم تُحفظ' : 'لا تغييرات'}</b>
              <span>تسري على كلّ الفعاليّات</span>
            </div>
            <button type="button" className="wa-btn primary" disabled={!dirty || saving || !s.template.trim()} onClick={save}>
              <Check />{saving ? 'يُحفظ…' : 'حفظ'}
            </button>
          </div>
        </>
      )}
    </Pop>
  );
}
