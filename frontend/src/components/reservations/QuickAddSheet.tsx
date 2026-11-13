'use client';

// ══════════════════════════════════════════════════════
// ＋ حجزٌ سريع — ورقةٌ سفليّة
//
// 🔴 كان الزرُّ في أعلى اليسار: أبعدُ نقطةٍ عن الإبهام، وفي RTL أوّلُ ما يخرج
//    من الشاشة — قِيس عند `left: −140` أيْ خارجها تماماً. صار في قوس الإبهام.
//
// 🔴 والاقتراحاتُ صفوفٌ بحجم اللمس لا قائمةً ضيّقةً تُغلق بمهلة ١٥٠ملّي —
//    وتلك مهلةٌ تتسابق مع اللمس على الهاتف فتضيع النقرة.
//
// 🔴 ولا يُنشأ حجزٌ بلا فعاليّة: كان يُكتب بـ`activityId: null` فلا يمكن
//    تثبيتُه أبداً ولا يظهر تحت أيّ مرشِّح — يُولد ميّتاً.
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { Check, TriangleAlert, UserRound } from 'lucide-react';
import { Banner } from '@/app/admin/whatsapp/wa-ui';
import { Sheet, SheetHead, Field, Counter, PrimaryButton } from './Sheet';
import { apiFetch, type Activity } from '@/hooks/useReservations';

export interface PlayerHit { id: number; name: string; phone?: string; avatarUrl?: string }

export default function QuickAddSheet({
  open, onClose, activityId, activities, onCreate, findDuplicate,
}: {
  open: boolean;
  onClose: () => void;
  /** '' | 'all' | '<id>' — القيمةُ المختارة في الصفحة */
  activityId: string;
  activities: Activity[];
  onCreate: (body: Record<string, any>) => Promise<void>;
  /** يعيد الحجزَ المكرّر إن وُجد — الصفحةُ تملك القائمة كاملةً */
  findDuplicate: (activityId: number, name: string, phone: string, playerId: number | null) => any | null;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [contact, setContact] = useState('');
  const [count, setCount] = useState(1);
  const [notes, setNotes] = useState('');
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [target, setTarget] = useState('');
  const [hits, setHits] = useState<PlayerHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(''); setPhone(''); setContact(''); setCount(1); setNotes('');
    setPlayerId(null); setHits([]); setErr('');
    setTarget(activityId && activityId !== 'all' ? activityId : '');
  }, [open, activityId]);

  // اقتراحُ اللاعبين — بحثٌ واحدٌ للاسم والرقم معاً
  useEffect(() => {
    if (!open || playerId) { setHits([]); return; }
    const term = (name.trim().length >= 2 ? name : phone).trim();
    if (term.length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      try {
        const d = await apiFetch(`/api/staff-notifications/players/search?q=${encodeURIComponent(term)}`);
        setHits(Array.isArray(d?.players) ? d.players.slice(0, 5) : []);
      } catch { setHits([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [name, phone, playerId, open]);

  const submit = async () => {
    setErr('');
    if (!name.trim()) return;
    const id = Number(target);
    if (!Number.isFinite(id) || id <= 0) {
      setErr('اختر الفعاليّة — حجزٌ بلا فعاليّة لا يمكن تثبيتُه ولا يظهر لأحد.');
      return;
    }
    const dup = findDuplicate(id, name, phone, playerId);
    if (dup) { setErr(`يوجد حجزٌ مسبق لـ«${dup.contactName}» في هذه الفعاليّة.`); return; }
    setBusy(true);
    try {
      await onCreate({
        activityId: id,
        contactName: name.trim(),
        contactMethod: contact.trim(),
        phone: phone.trim(),
        peopleCount: count,
        notes: notes.trim(),
        playerId,
      });
      onClose();
    } catch (e: any) { setErr('فشل التسجيل: ' + (e?.message || '')); }
    finally { setBusy(false); }
  };

  const act = activities.find(a => a.id === Number(target));

  return (
    <Sheet open={open} onClose={onClose} label="حجز سريع">
      <SheetHead title="حجز سريع" sub={act?.name || 'اختر الفعاليّة'} />

      {(!activityId || activityId === 'all' || activities.length > 1) && (
        <select value={target} onChange={e => setTarget(e.target.value)} className="wa-select" aria-label="الفعاليّة">
          <option value="">— اختر الفعاليّة —</option>
          {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}

      <Field value={name} onChange={v => { setName(v); if (playerId) setPlayerId(null); }}
        placeholder="الاسم *" autoFocus />

      {hits.length > 0 && (
        <div className="res-hits">
          {hits.map(p => (
            <button
              key={p.id} type="button"
              onClick={() => { setName(p.name || ''); if (p.phone) setPhone(p.phone); setPlayerId(p.id); setHits([]); }}
            >
              <UserRound />
              <span className="grow">
                <b>{p.name}</b>
                {p.phone && <span className="ltr muted">{p.phone}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {playerId && (
        <Banner tone="info" icon={<UserRound />}>مربوطٌ بحساب لاعب — سيصله إشعارٌ عند التثبيت</Banner>
      )}

      <Field value={phone} onChange={v => { setPhone(v); if (playerId) setPlayerId(null); }}
        placeholder="رقم الهاتف" dir="ltr" inputMode="tel" />
      <Field value={contact} onChange={setContact} placeholder="وسيلة التواصل (واتساب · انستا…)" />
      <Counter value={count} onChange={setCount} label="عدد الأشخاص" />
      <Field value={notes} onChange={setNotes} placeholder="ملاحظة" />

      {err && <Banner tone="danger" icon={<TriangleAlert />}>{err}</Banner>}

      <PrimaryButton onClick={submit} disabled={busy || !name.trim()}>
        <Check />{busy ? 'يُسجَّل…' : 'سجّل الحجز'}
      </PrimaryButton>
      <p className="res-fine center">
        يُسجَّل «غير مثبَّت» — والتثبيتُ خطوةٌ واعية تُنشئ حجزَ الفعاليّة.
      </p>
    </Sheet>
  );
}
