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
    <Sheet open={open} onClose={onClose}>
      <SheetHead title="حجز سريع" sub={act?.name || 'اختر الفعاليّة'} />

      <div className="space-y-2.5">
        {(!activityId || activityId === 'all' || activities.length > 1) && (
          <select
            value={target}
            onChange={e => setTarget(e.target.value)}
            className="w-full h-12 px-3 rounded-xl text-white text-[15px] outline-none"
            style={{ background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.09)' }}
          >
            <option value="">— اختر الفعاليّة —</option>
            {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}

        <Field value={name} onChange={v => { setName(v); if (playerId) setPlayerId(null); }}
          placeholder="الاسم *" autoFocus />

        {hits.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,.09)' }}>
            {hits.map(p => (
              <button
                key={p.id}
                onClick={() => { setName(p.name || ''); if (p.phone) setPhone(p.phone); setPlayerId(p.id); setHits([]); }}
                className="w-full flex items-center gap-3 px-3 text-right"
                style={{ minHeight: 52, background: 'rgba(255,255,255,.03)', borderBottom: '1px solid rgba(255,255,255,.05)' }}
              >
                <span className="text-[16px]">👤</span>
                <span className="flex-1 min-w-0">
                  <b className="block text-[14px] text-white truncate">{p.name}</b>
                  {p.phone && <span className="block text-[11.5px] text-gray-500 font-mono" dir="ltr">{p.phone}</span>}
                </span>
              </button>
            ))}
          </div>
        )}

        {playerId && (
          <p className="text-[12px] text-sky-400">👤 مربوطٌ بحساب لاعب — سيصله إشعارٌ عند التثبيت</p>
        )}

        <Field value={phone} onChange={v => { setPhone(v); if (playerId) setPlayerId(null); }}
          placeholder="رقم الهاتف" dir="ltr" />
        <Field value={contact} onChange={setContact} placeholder="وسيلة التواصل (واتساب · انستا…)" />
        <Counter value={count} onChange={setCount} label="عدد الأشخاص" />
        <Field value={notes} onChange={setNotes} placeholder="ملاحظة" />

        {err && (
          <p className="text-[13px] leading-relaxed px-3 py-2 rounded-xl"
            style={{ color: '#F0A9A4', background: 'rgba(217,69,63,.1)', border: '1px solid rgba(217,69,63,.35)' }}>
            {err}
          </p>
        )}

        <div className="pt-1">
          <PrimaryButton onClick={submit} disabled={busy || !name.trim()}>
            {busy ? '…' : '✓ سجّل الحجز'}
          </PrimaryButton>
        </div>
        <p className="text-[11.5px] text-gray-600 text-center leading-relaxed">
          يُسجَّل «غير مثبَّت» — والتثبيتُ خطوةٌ واعية تُنشئ حجزَ الفعاليّة.
        </p>
      </div>
    </Sheet>
  );
}
