'use client';

// ══════════════════════════════════════════════════════
// 👤 ورقةُ الشخص — كلُّ فعلٍ يخصّ حجزاً في مكانٍ واحد
//
// 🔴 «إلغاء التثبيت» كان بلا تأكيدٍ إطلاقاً وبجوار زرّي التعديل والحذف،
//    وكلُّها تحت ٣٥ بكسل — وهو يحذف حجزَ اللاعب من تطبيقه فعلاً.
//    صار له تأكيدٌ يشرح الأثر، وابتعد عن جيرانه.
//
// 🔴 وقائمةُ الحالة ثلاثيّة: نافذةُ التعديل القديمة كانت تدهس `waitlist` إلى
//    `pending` صامتةً عند أيّ حفظ، فيضيع أنّ صاحبَها رُفض لامتلاء المقاعد.
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { swalConfirm } from '@/lib/swal';
// 🔴 لا نسخةَ محلّيّة من تطبيع الرقم: كانت مكرّرةً حرفيّاً في الصفحة
//    رغم أنّ المكتبة تُصدّرها — نسختان تنحرفان يوماً.
import { normalizePhoneIntl } from '@/lib/whatsapp';
import { RES_COLORS, resStatus, statusMeta, isWaSent, waAgo, type ResStatus } from '@/lib/reservation-status';
import { Sheet, SheetHead, ActionRow, Field, Counter, PrimaryButton } from './Sheet';
import { ar } from './ResRow';
import type { Reservation } from '@/hooks/useReservations';

const STATUSES: { v: ResStatus; label: string; color: string }[] = [
  { v: 'pending', label: 'غير مثبّت', color: RES_COLORS.pending },
  { v: 'confirmed', label: 'مثبّت', color: RES_COLORS.attended },
  { v: 'waitlist', label: 'قائمة انتظار', color: RES_COLORS.waitlist },
];

export default function PersonSheet({
  row, open, onClose, onAttend, onConfirm, onUpdate, onDelete, waMessage, onWaSend, onWaClear,
}: {
  row: Reservation | null;
  open: boolean;
  onClose: () => void;
  onAttend: (id: number, v: boolean | null) => void;
  onConfirm: (r: Reservation, confirmed: boolean) => void;
  onUpdate: (id: number, patch: Record<string, any>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  /** نصُّ رسالة التأكيد جاهزاً — يُبنى في الصفحة حيث القالبُ ومتغيّراتُه */
  waMessage: (r: Reservation) => string;
  /** تفتح واتساب وتُعلّم الصفَّ مُرسَلاً — الصفحةُ تملك شريطَ التأكيد عند العودة */
  onWaSend: (r: Reservation) => void;
  /** تراجعٌ عن التعليم */
  onWaClear: (r: Reservation) => void;
}) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [contact, setContact] = useState('');
  const [count, setCount] = useState(1);
  const [notes, setNotes] = useState('');
  const [st, setSt] = useState<ResStatus>('pending');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!row) return;
    setMode('view');
    setName(row.contactName || '');
    setPhone(row.phone || '');
    setContact(row.contactMethod || '');
    setCount(row.peopleCount || 1);
    setNotes(row.notes || '');
    setSt(resStatus(row));
  }, [row]);

  if (!row) return <Sheet open={false} onClose={onClose}><div /></Sheet>;

  const meta = statusMeta(row);
  const confirmed = resStatus(row) === 'confirmed';
  const intl = row.phone ? normalizePhoneIntl(row.phone) : null;

  const save = async () => {
    setBusy(true);
    try {
      await onUpdate(row.id, {
        contactName: name.trim(), phone: phone.trim(), contactMethod: contact.trim(),
        peopleCount: count, notes: notes.trim(), status: st,
      });
      onClose();
    } catch (e: any) { alert('فشل الحفظ: ' + (e?.message || '')); }
    finally { setBusy(false); }
  };

  const unconfirm = async () => {
    const ok = await swalConfirm(
      'إلغاء تثبيت هذا الحجز؟\n\nسيُحذف حجزُ اللاعب من تطبيقه ولن يظهر في قائمة حجوزات الفعاليّة.',
    );
    if (!ok) return;
    onConfirm(row, false);
    onClose();
  };

  const del = async () => {
    if (!(await swalConfirm(`حذف حجز «${row.contactName}»؟`))) return;
    try { await onDelete(row.id); onClose(); }
    catch (e: any) { alert('فشل الحذف: ' + (e?.message || '')); }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      {mode === 'view' ? (
        <>
          <SheetHead
            title={row.contactName}
            sub={[
              row.phone,
              (row.peopleCount ?? 1) > 1 ? `${ar(row.peopleCount)} أشخاص` : 'شخص واحد',
              row.contactMethod || null,
            ].filter(Boolean).join(' · ')}
          />

          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-[11.5px] px-2 py-1 rounded-full border font-bold"
              style={{ color: meta.color, borderColor: meta.color + '66', background: meta.color + '14' }}>
              {meta.emoji} {meta.label}
            </span>
            {row.appConfirmed && (
              <span className="text-[11.5px] px-2 py-1 rounded-full border font-bold"
                style={{ color: RES_COLORS.waitlist, borderColor: RES_COLORS.waitlist + '55' }}>
                📱 تأكّد من التطبيق
              </span>
            )}
            {row.playerId && (
              <span className="text-[11.5px] px-2 py-1 rounded-full border font-bold text-sky-400 border-sky-500/40">
                👤 حساب لاعب
              </span>
            )}
            {row.remindOptIn === false && (
              <span className="text-[11.5px] px-2 py-1 rounded-full border font-bold text-gray-400 border-gray-600/50"
                title="طلب عدم إرسال تذكيرات على واتساب">
                🔕 لا تذكيرات
              </span>
            )}
          </div>

          {row.notes && (
            <p className="text-[13px] text-gray-400 mb-3 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,.03)' }}>💬 {row.notes}</p>
          )}

          {/* الحضور — هدفان بارتفاع ٥٦، بعيدان عن بقيّة الأفعال */}
          <div className="flex gap-2 mb-3">
            {([[true, '✓ حضر', RES_COLORS.attended], [false, '✕ لم يحضر', RES_COLORS.noShow]] as const).map(([v, label, c]) => {
              const on = row.attended === v;
              return (
                <button
                  key={String(v)}
                  onClick={() => onAttend(row.id, on ? null : v)}
                  className="flex-1 h-14 rounded-2xl text-[15px] font-extrabold border-[1.5px]"
                  style={on
                    ? { borderColor: c, background: c + '1f', color: c }
                    : { borderColor: 'rgba(255,255,255,.12)', color: '#9ca3af' }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {!confirmed && (
            <button
              onClick={() => { onConfirm(row, true); onClose(); }}
              className="w-full flex items-center gap-3 p-3 rounded-2xl mb-2 text-right"
              style={{ background: RES_COLORS.pending + '14', border: `1px solid ${RES_COLORS.pending}55` }}
            >
              <span className="text-[17px]">✅</span>
              <span className="flex-1">
                <b className="block text-[14.5px] font-bold" style={{ color: RES_COLORS.pending }}>ثبّت الحجز</b>
                <span className="block text-[11.5px] text-gray-500">غيرُ المثبَّت لا يظهر للّاعب ولا في الفعاليّة</span>
              </span>
            </button>
          )}

          {intl && (
            <ActionRow
              icon="💬"
              title={isWaSent(row) ? 'أرسل مرّةً أخرى' : 'رسالة واتساب'}
              sub={isWaSent(row)
                ? `أُرسلت ${waAgo(row.waSentAt)}${row.waSentBy ? ' · ' + row.waSentBy : ''}`
                : 'بنصّ التأكيد الجاهز'}
              onClick={() => { onWaSend(row); onClose(); }}
            />
          )}
          {/* 🔴 التعليمُ متفائل، فلا بدّ من طريقٍ لنفيه: رقمٌ خاطئ أو رقمٌ بلا
              حسابِ واتساب يعني أنّ المحادثة فُتحت ولم تصل رسالة. */}
          {isWaSent(row) && (
            <ActionRow icon="↺" title="لم أُرسلها فعليّاً"
              sub="يُزيل علامةَ الإرسال ويُعيده إلى «لم تُرسل»"
              onClick={() => onWaClear(row)} />
          )}
          {row.phone && (
            <ActionRow icon="📞" title="اتّصال" sub={row.phone}
              onClick={() => { window.location.href = `tel:${row.phone}`; }} />
          )}
          <ActionRow icon="✏️" title="تعديل البيانات" sub="الاسم · الرقم · العدد · الحالة · ملاحظة"
            onClick={() => setMode('edit')} />
          {confirmed && (
            <ActionRow icon="↩" title="إلغاء التثبيت"
              sub="يحذف حجزَ اللاعب من تطبيقه — بتأكيد" onClick={unconfirm} />
          )}
          <ActionRow icon="🗑" title="حذف الحجز" sub="بتأكيد" tone="danger" onClick={del} />
        </>
      ) : (
        <>
          <SheetHead title="تعديل الحجز" sub={row.contactName} />
          <div className="space-y-2.5">
            <Field value={name} onChange={setName} placeholder="الاسم" />
            <Field value={phone} onChange={setPhone} placeholder="رقم الهاتف" dir="ltr" />
            <Field value={contact} onChange={setContact} placeholder="وسيلة التواصل (واتساب · انستا…)" />
            <Counter value={count} onChange={setCount} label="عدد الأشخاص" />
            <Field value={notes} onChange={setNotes} placeholder="ملاحظة" />

            <div>
              <p className="text-[12.5px] text-gray-500 mb-1.5">الحالة</p>
              <div className="flex gap-1.5">
                {STATUSES.map(s => (
                  <button
                    key={s.v}
                    onClick={() => setSt(s.v)}
                    className="flex-1 h-11 rounded-xl text-[12.5px] font-bold border"
                    style={st === s.v
                      ? { borderColor: s.color, background: s.color + '1f', color: s.color }
                      : { borderColor: 'rgba(255,255,255,.1)', color: '#9ca3af' }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-600 mt-1.5 leading-relaxed">
                قائمةُ الانتظار حالةٌ مستقلّة — لا تُحسب مثبَّتةً ولا تُدهَس عند الحفظ.
              </p>
            </div>

            <div className="pt-1"><PrimaryButton onClick={save} disabled={busy || !name.trim()}>
              {busy ? '…' : '✓ حفظ'}
            </PrimaryButton></div>
            <button onClick={() => setMode('view')}
              className="w-full h-12 rounded-2xl text-[15px] font-bold"
              style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: '#9ca3af' }}>
              رجوع
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
