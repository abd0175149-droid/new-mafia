'use client';

// ══════════════════════════════════════════════════════
// 👤 بطاقةُ الشخص — كلُّ فعلٍ يخصّ حجزاً في مكانٍ واحد
//
// المحتوى واحد (PersonPanel) في موضعين: ورقةٌ سفليّة على الهاتف، ولوحٌ جانبيّ على الحاسوب.
//
// 🔴 «إلغاء التثبيت» بتأكيدٍ يشرح الأثر وبعيدٌ عن جيرانه — هو يحذف حجزَ اللاعب من تطبيقه فعلاً.
//
// 🔴 وقائمةُ الحالة ثلاثيّة: نافذةُ التعديل القديمة كانت تدهس `waitlist` إلى
//    `pending` صامتةً عند أيّ حفظ، فيضيع أنّ صاحبَها رُفض لامتلاء المقاعد.
//
// 🔴 «وصل» و«متى يصل» شيئان: الأوّل يضغطه إنسانٌ (أو الباب أو الغرفة)، والثاني
//    يسجّله الموظّف أو الدون من ردّ العميل. لا شيء هنا يوحي بأنّ الدون يعلّم الوصول.
// ══════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import {
  BellOff, Bot, Check, CircleCheck, MessageCircle, Pencil, Phone, RotateCcw, Smartphone,
  StickyNote, Trash2, Undo2, UserRound, X,
} from 'lucide-react';
import { swalAlert, swalConfirm } from '@/lib/swal';
// 🔴 لا نسخةَ محلّيّة من تطبيع الرقم — المكتبة تُصدّرها، ونسختان تنحرفان يوماً.
import { normalizePhoneIntl } from '@/lib/whatsapp';
import { resStatus, statusMeta, isWaSent, waAgo, type ResStatus } from '@/lib/reservation-status';
import { Badge, Banner } from '@/app/admin/whatsapp/wa-ui';
import { Sheet, SheetHead, ActionRow, Field, Counter, PrimaryButton } from './Sheet';
import { initial, latin } from './ResRow';
import EtaControls from './EtaControls';
import { arrivalGroup, etaLabel, followupState, hm, peopleLabel, type ResEvent } from './arrival';
import type { Reservation } from '@/hooks/useReservations';

const STATUSES: { v: ResStatus; label: string }[] = [
  { v: 'pending', label: 'غير مثبّت' },
  { v: 'confirmed', label: 'مثبّت' },
  { v: 'waitlist', label: 'قائمة انتظار' },
];

export type PersonAction = 'confirm' | 'unconfirm' | 'delete' | 'wa' | 'save';

export interface PersonProps {
  row: Reservation | null;
  now: number;
  /** سجلّ الدون — منه يُعرف متى قرأ ردّ العميل */
  events?: ResEvent[];
  /** أبرِز «متى يصل؟» (فُتحت البطاقة من «حدّد الوقت») */
  focusEta?: boolean;
  onAttend: (id: number, v: boolean | null) => void;
  onConfirm: (r: Reservation, confirmed: boolean) => void;
  onUpdate: (id: number, patch: Record<string, any>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onEta: (id: number, etaAt: string | null) => Promise<boolean>;
  /** تفتح واتساب وتُعلّم الصفَّ مُرسَلاً — الصفحةُ تملك شريطَ التأكيد عند العودة */
  onWaSend: (r: Reservation) => void;
  /** تراجعٌ عن التعليم */
  onWaClear: (r: Reservation) => void;
}

export function PersonPanel({
  row, now, events, focusEta, onAttend, onConfirm, onUpdate, onDelete, onEta, onWaSend, onWaClear, afterAction,
}: PersonProps & { row: Reservation; afterAction: (a: PersonAction) => void }) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [contact, setContact] = useState('');
  const [count, setCount] = useState(1);
  const [notes, setNotes] = useState('');
  const [st, setSt] = useState<ResStatus>('pending');
  const [busy, setBusy] = useState(false);

  // 🔴 على المعرّف لا على الكائن: الاستطلاع يبدّل الكائن كلّ ٣٠ث، ولو أعاد ضبط النموذج لمحا ما يكتبه الموظّف
  useEffect(() => { setMode('view'); }, [row.id]);

  const startEdit = () => {
    setName(row.contactName || '');
    setPhone(row.phone || '');
    setContact(row.contactMethod || '');
    setCount(row.peopleCount || 1);
    setNotes(row.notes || '');
    setSt(resStatus(row));
    setMode('edit');
  };

  const meta = statusMeta(row);
  const status = resStatus(row);
  const confirmed = status === 'confirmed';
  const intl = row.phone ? normalizePhoneIntl(row.phone) : null;
  const group = arrivalGroup(row);
  const eta = group === 'onway' ? etaLabel(row.etaAt, now) : null;
  const fu = group === 'silent' ? followupState(row) : null;

  const save = async () => {
    setBusy(true);
    try {
      await onUpdate(row.id, {
        contactName: name.trim(), phone: phone.trim(), contactMethod: contact.trim(),
        peopleCount: count, notes: notes.trim(), status: st,
      });
      setMode('view');
      afterAction('save');
    } catch (e: any) { swalAlert('فشل الحفظ: ' + (e?.message || ''), 'error'); }
    finally { setBusy(false); }
  };

  const unconfirm = async () => {
    const ok = await swalConfirm(
      'إلغاء تثبيت هذا الحجز؟\n\nسيُحذف حجزُ اللاعب من تطبيقه ولن يظهر في قائمة حجوزات الفعاليّة.',
      { confirmText: 'ألغِ التثبيت', danger: true },
    );
    if (!ok) return;
    onConfirm(row, false);
    afterAction('unconfirm');
  };

  const del = async () => {
    if (!(await swalConfirm(`حذف حجز «${row.contactName}»؟`, { confirmText: 'احذف', danger: true }))) return;
    try { await onDelete(row.id); afterAction('delete'); }
    catch (e: any) { swalAlert('فشل الحذف: ' + (e?.message || ''), 'error'); }
  };

  if (mode === 'edit') {
    return (
      <div className="res-person">
        <SheetHead title="تعديل الحجز" sub={row.contactName} />
        <Field value={name} onChange={setName} placeholder="الاسم" />
        <Field value={phone} onChange={setPhone} placeholder="رقم الهاتف" dir="ltr" inputMode="tel" />
        <Field value={contact} onChange={setContact} placeholder="وسيلة التواصل (واتساب · انستا…)" />
        <Counter value={count} onChange={setCount} label="عدد الأشخاص" />
        <Field value={notes} onChange={setNotes} placeholder="ملاحظة" />

        <div>
          <div className="res-etahead">الحالة</div>
          <div className="res-seg3" role="group" aria-label="حالة الحجز">
            {STATUSES.map(s => (
              <button key={s.v} type="button" className="wa-pill" style={{ minHeight: 44, justifyContent: 'center' }}
                aria-pressed={st === s.v} onClick={() => setSt(s.v)}>
                {s.label}
              </button>
            ))}
          </div>
          <p className="res-fine" style={{ marginTop: 6 }}>
            قائمةُ الانتظار حالةٌ مستقلّة — لا تُحسب مثبَّتةً ولا تُدهَس عند الحفظ.
          </p>
        </div>

        <PrimaryButton onClick={save} disabled={busy || !name.trim()}>
          <Check />{busy ? 'يُحفظ…' : 'حفظ'}
        </PrimaryButton>
        <button type="button" className="wa-btn block" onClick={() => setMode('view')}>رجوع</button>
      </div>
    );
  }

  // ── متى قرأ الدون ردّ العميل: من السجلّ إن وُجد، وإلّا تُعرض الكلمات بلا وقت ──
  const botEv = row.etaSource === 'bot'
    ? (events || []).find(e => e.reservationId === row.id && e.kind === 'eta_set' && e.actor === 'bot' && !e.undone)
    : undefined;
  const quote = row.etaSource === 'bot' ? (row.etaNote || botEv?.quote || null) : null;

  return (
    <div className="res-person">
      <div className="who">
        <span className={`wa-avatar lg${row.playerId ? ' linked' : ''}`} aria-hidden="true">{initial(row.contactName)}</span>
        <div className="grow">
          <h2>{row.contactName || <span className="ltr">{row.phone}</span>}</h2>
          <div className="s">
            {[peopleLabel(row.peopleCount), meta.label, row.contactMethod || null].filter(Boolean).join(' · ')}
          </div>
          {row.phone && <div className="s"><span className="ltr">{row.phone}</span></div>}
        </div>
        {eta && <span className={`res-eta${eta.late ? ' late' : ''}`}>{eta.text}</span>}
      </div>

      <div className="res-badges">
        <Badge tone={status === 'confirmed' ? 'ok' : status === 'waitlist' ? 'violet' : 'gold'}>{meta.label}</Badge>
        {row.appConfirmed && <Badge tone="violet"><Smartphone /> تأكّد من التطبيق</Badge>}
        {row.playerId && <Badge tone="info"><UserRound /> حساب لاعب</Badge>}
        {row.remindOptIn === false && <Badge title="طلب عدم إرسال تذكيرات على واتساب"><BellOff /> لا تذكيرات</Badge>}
        {fu && <Badge tone={fu.tone}>{fu.text}</Badge>}
        {group === 'declined' && row.declinedAt && (
          <Badge tone="danger">{row.declinedVia === 'followup' ? 'اعتذر للدون' : 'لن يحضر'} <span className="ltr">{hm(row.declinedAt)}</span></Badge>
        )}
      </div>

      {row.notes && <p className="res-note"><StickyNote /><span>{row.notes}</span></p>}

      {!confirmed && (
        <button type="button" className="res-callout" onClick={() => { onConfirm(row, true); afterAction('confirm'); }}>
          <CircleCheck />
          <span className="t">
            <b>ثبّت الحجز</b>
            <span>غيرُ المثبَّت لا يظهر للّاعب ولا في الفعاليّة</span>
          </span>
        </button>
      )}

      {quote && (
        <Banner tone="info" icon={<Bot />}>
          «{quote}» — قرأها الدون{botEv?.at ? <> <span className="ltr">{hm(botEv.at)}</span></> : null}.
        </Banner>
      )}
      {row.etaSource === 'staff' && row.etaNote && <p className="res-note"><StickyNote /><span>{row.etaNote}</span></p>}

      {(group === 'onway' || group === 'silent') && (
        <EtaControls rowId={row.id} hasEta={!!row.etaAt} flash={focusEta} onSet={onEta} />
      )}

      {/* الحضور — هدفان كبيران بعيدان عن بقيّة الأفعال. الضغط على المعلَّم يزيل التعليم. */}
      <div className="res-attend">
        <button type="button" aria-pressed={row.attended === false}
          className={`wa-btn ${row.attended === false ? 'on-no' : row.attended === true ? 'off' : 'danger'}`}
          onClick={() => onAttend(row.id, row.attended === false ? null : false)}>
          <X />{row.attended === false ? 'لن يحضر — أزل التعليم' : 'لم يحضر'}
        </button>
        <button type="button" aria-pressed={row.attended === true}
          className={`wa-btn ${row.attended === true ? 'on-yes' : row.attended === false ? 'off' : 'send'}`}
          onClick={() => onAttend(row.id, row.attended === true ? null : true)}>
          <Check />{row.attended === true ? 'حاضر — أزل التعليم' : 'حضر'}
        </button>
      </div>

      <div className="res-quick">
        <button type="button" className="wa-btn ghost" aria-disabled={!intl} disabled={!intl}
          onClick={() => { onWaSend(row); afterAction('wa'); }}>
          <MessageCircle />{isWaSent(row) ? 'أرسل ثانيةً' : 'رسالة واتساب'}
        </button>
        <a className="wa-btn ghost" aria-disabled={!row.phone} href={row.phone ? `tel:${row.phone}` : undefined}>
          <Phone />اتّصال
        </a>
        <a className="wa-btn ghost" aria-disabled={!row.playerId} href={row.playerId ? `/admin/players/${row.playerId}` : undefined}
          title={row.playerId ? 'حجوزاته، لعبه، حسابه' : 'الحجز غير مربوط بحساب'}>
          <UserRound />{row.playerId ? 'ملفّ اللاعب' : 'لا ملفّ'}
        </a>
        <button type="button" className="wa-btn ghost" onClick={startEdit}>
          <Pencil />تعديل
        </button>
      </div>

      <div className="res-acts">
        {/* 🔴 التعليمُ متفائل، فلا بدّ من طريقٍ لنفيه: رقمٌ خاطئ أو بلا واتساب يعني أنّ المحادثة فُتحت ولم تصل رسالة. */}
        {isWaSent(row) && (
          <ActionRow icon={<RotateCcw />} title="لم أُرسلها فعليّاً"
            sub={`أُرسلت ${latin(waAgo(row.waSentAt))}${row.waSentBy ? ' · ' + row.waSentBy : ''} — يُزيل علامةَ الإرسال ويُعيده إلى «لم تُرسل»`}
            onClick={() => onWaClear(row)} />
        )}
        {confirmed && (
          <ActionRow icon={<Undo2 />} title="إلغاء التثبيت"
            sub="يحذف حجزَ اللاعب من تطبيقه — بتأكيد" onClick={unconfirm} />
        )}
        <ActionRow icon={<Trash2 />} title="حذف الحجز" sub="بتأكيد" tone="danger" onClick={del} />
      </div>
    </div>
  );
}

export default function PersonSheet({ open, onClose, ...p }: PersonProps & { open: boolean; onClose: () => void }) {
  // الصفّ الأخير يبقى مرسوماً أثناء انزلاق الورقة للإغلاق — وإلّا أُفرغت قبل أن تختفي
  const last = useRef<Reservation | null>(null);
  if (p.row) last.current = p.row;
  const row = p.row ?? last.current;
  return (
    <Sheet open={open && !!p.row} onClose={onClose} label={row?.contactName || 'حجز'}>
      {row && <PersonPanel {...p} row={row} afterAction={() => onClose()} />}
    </Sheet>
  );
}
