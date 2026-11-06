'use client';
// ══════════════════════════════════════════════════════
// ➕ إضافة لاعب من اللوبي — الهاتف ⟵ (التسجيل إن كان جديداً) ⟵ المقعد
//
// نفس مسارات REST في LeaderLobbyView حرفيّاً:
//   POST /api/player/lookup {phone} · POST /api/player/register {phone,displayName,dateOfBirth,gender}
//   POST /api/leader/force-add-player {roomId,physicalId,name,phone,dob,gender,playerId,noPhoto?}
// ══════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import { BottomSheet, Btn, Chip, Chips, Hint, Seg, SetRow, useCockpit } from '../../kit';
import { usePhotoZone } from '../../../PhotoZonePanel';
import { zoneRank } from '@/lib/photoZone';
import { SheetError, SheetNote, inputCls } from './ui';

type Step = 'phone' | 'register' | 'seat';

const normPhone = (p: string) => (p.startsWith('0') ? p : '0' + p);

export default function AddPlayerSheet({ open, onClose, initialSeat }: { open: boolean; onClose: () => void; initialSeat?: number | null }) {
  const { gameState, emit, toast } = useCockpit();
  const pz = usePhotoZone(gameState);

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const [seat, setSeat] = useState<number | null>(null);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [found, setFound] = useState(false);
  const [noPhoto, setNoPhoto] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [waWarn, setWaWarn] = useState('');

  // كلُّ فتحٍ يبدأ من أوّل الطريق — والمقعدُ الذي لُمس (إن وُجد) محفوظ
  useEffect(() => {
    if (!open) return;
    setStep('phone'); setPhone(''); setName(''); setDob(''); setGender('MALE');
    setSeat(initialSeat ?? null); setPlayerId(null); setFound(false); setNoPhoto(null);
    setLoading(false); setErr(''); setWaWarn('');
  }, [open, initialSeat]);

  // 🔴 المتفرّجون يشغلون مقاعدهم — لا يُعرض مقعدُهم فارغاً
  const available = useMemo(() => {
    const occ = new Set<number>([
      ...(gameState?.players || []).map((p: any) => Number(p.physicalId)),
      ...(gameState?.spectators || []).map((s: any) => Number(s?.physicalId)).filter((n: number) => n > 0),
    ]);
    const max = Number(gameState?.config?.maxPlayers) || 0;
    return Array.from({ length: max }, (_, i) => i + 1).filter((n) => !occ.has(n));
  }, [gameState?.players, gameState?.spectators, gameState?.config?.maxPlayers]);

  const zoneSet = useMemo(() => new Set(pz?.report.zone || []), [pz]);
  // 📸 المقعد الأنسب حسب جواب التصوير — نفس رتبة المحرّك (كما في اللوبي القديم)
  const suggested = useMemo(() => {
    if (!pz || noPhoto === null || available.length === 0) return null;
    const occ = new Map<number, { noPhoto?: boolean }>();
    for (const p of gameState?.players || []) occ.set(Number(p.physicalId), { noPhoto: p.noPhoto === true });
    for (const sp of gameState?.spectators || []) if (sp?.physicalId > 0) occ.set(Number(sp.physicalId), { noPhoto: sp.noPhoto === true });
    return available.slice().sort((a, b) => zoneRank(a, noPhoto, occ, pz.ctx, pz.n) - zoneRank(b, noPhoto, occ, pz.ctx, pz.n) || a - b)[0] ?? null;
  }, [pz, noPhoto, available, gameState?.players, gameState?.spectators]);

  const chosen = seat != null && available.includes(seat) ? seat : (suggested ?? available[0] ?? null);

  const lookup = async () => {
    if (phone.length < 9) { setErr('أدخل رقم هاتفٍ صحيحاً (9 أرقام على الأقلّ)'); return; }
    setErr(''); setLoading(true);
    try {
      const res = await fetch('/api/player/lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normPhone(phone) }),
      });
      if (!res.ok) { setErr(`تعذّر البحث (${res.status})`); return; }
      const data = await res.json();
      if (data.found && data.player) {
        setName(data.player.displayName || '');
        setPlayerId(data.player.playerId || data.player.id || null);
        setGender(data.player.gender === 'FEMALE' ? 'FEMALE' : 'MALE');
        if (data.player.dateOfBirth) setDob(data.player.dateOfBirth);
        setFound(true);
        setStep('seat');
      } else {
        if (data.dbError) setErr(`${data.dbError} — سيُسجَّل لاعباً جديداً`);
        setFound(false);
        setStep('register');
      }
    } catch (e: any) {
      setErr('تعذّر الاتّصال: ' + (e?.message || 'تحقّق من الشبكة'));
    } finally { setLoading(false); }
  };

  const register = async () => {
    if (!name.trim()) { setErr('أدخل اسم اللاعب'); return; }
    setErr(''); setLoading(true);
    try {
      const res = await fetch('/api/player/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normPhone(phone), displayName: name.trim(), dateOfBirth: dob || null, gender: gender || 'MALE' }),
      });
      const data = await res.json();
      if (data.success) {
        setPlayerId(data.player?.playerId || data.player?.id || null);
        setWaWarn(data.waWarning || '');
        setStep('seat');
      } else setErr(data.error || 'فشل التسجيل');
    } catch { setErr('تعذّر الاتّصال'); } finally { setLoading(false); }
  };

  const submit = async () => {
    if (chosen == null) { setErr('لا مقعد فارغ — زِد عدد المقاعد أوّلاً'); return; }
    setErr(''); setLoading(true);
    const nm = name.trim();
    try {
      const r = await fetch('/api/leader/force-add-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('leader_token') || ''}` },
        body: JSON.stringify({
          roomId: gameState.roomId, physicalId: Number(chosen), name: nm, phone: normPhone(phone),
          dob, gender, playerId,
          ...(pz && noPhoto !== null ? { noPhoto } : {}),
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.success) throw new Error(data.error || 'فشلت إضافة اللاعب');
      const s = Number(chosen);
      onClose();
      toast(`أُضيف «${nm}» في المقعد ${s}`, {
        undo: () => { emit('room:kick-player', { roomId: gameState.roomId, physicalId: s }).catch((e: any) => toast(e?.message || 'تعذّر التراجع', { tone: 'red' })); },
      });
    } catch (e: any) {
      setErr(e?.message || 'فشلت إضافة اللاعب');
    } finally { setLoading(false); }
  };

  const title = step === 'phone' ? 'إضافة لاعب' : step === 'register' ? 'لاعبٌ جديد' : `أين يجلس ${name.trim() || ''}؟`;

  return (
    <BottomSheet open={open} title={title} onClose={() => { if (!loading) onClose(); }}>
      <SheetError>{err}</SheetError>

      {step === 'phone' && (
        <>
          <label className="text-[13px] text-[#9a8f7e]" htmlFor="ck-add-phone">رقم الهاتف — نبحث عن حسابه</label>
          <input id="ck-add-phone" type="tel" inputMode="tel" dir="ltr" autoFocus value={phone} placeholder="07XXXXXXXX"
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') void lookup(); }}
            className={`${inputCls} text-center tracking-[0.15em] tabular-nums`} />
          {initialSeat ? <Hint>سيجلس في المقعد {initialSeat} إن بقي فارغاً.</Hint> : null}
          <Btn tone="gold" className="w-full min-h-[50px]" disabled={loading || phone.length < 9} onClick={() => void lookup()}>
            {loading ? '…' : 'ابحث'}
          </Btn>
        </>
      )}

      {step === 'register' && (
        <>
          <Chips><Chip>📱 <span dir="ltr">{normPhone(phone)}</span></Chip><Chip tone="n">لا حساب بهذا الرقم</Chip></Chips>
          <label className="text-[13px] text-[#9a8f7e]" htmlFor="ck-add-name">الاسم كما يظهر على الشاشة</label>
          <input id="ck-add-name" type="text" dir="rtl" autoFocus maxLength={40} value={name}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void register(); }}
            className={inputCls} />
          <label className="text-[13px] text-[#9a8f7e]" htmlFor="ck-add-dob">تاريخ الميلاد (اختياريّ)</label>
          <input id="ck-add-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
          <Seg<'MALE' | 'FEMALE'> value={gender} onChange={setGender} options={[{ v: 'MALE', l: '♂ ذكر' }, { v: 'FEMALE', l: '♀ أنثى' }]} />
          <div className="flex gap-2">
            <Btn className="flex-1" disabled={loading} onClick={() => { setErr(''); setStep('phone'); }}>رجوع</Btn>
            <Btn tone="gold" className="flex-[2]" disabled={loading || !name.trim()} onClick={() => void register()}>{loading ? '…' : 'سجّله وتابع'}</Btn>
          </div>
        </>
      )}

      {step === 'seat' && (
        <>
          <Chips>
            <Chip>📱 <span dir="ltr">{normPhone(phone)}</span></Chip>
            {found ? <Chip tone="ok">✓ حسابٌ موجود</Chip> : <Chip tone="g">حسابٌ جديد</Chip>}
          </Chips>
          <SheetNote>{waWarn}</SheetNote>
          {pz && (
            <SetRow title="📸 يقبل التصوير؟" sub={noPhoto === null ? 'إن لم تسأله يؤخذ جواب حسابه، وإلّا يُعامَل بلا تصوير' : suggested ? `المقعد المقترح: ${suggested}` : undefined}>
              <div className="w-[150px] shrink-0">
                <Seg<string> value={noPhoto === null ? '' : noPhoto ? 'no' : 'yes'} onChange={(v) => setNoPhoto(v === 'no')}
                  options={[{ v: 'yes', l: 'نعم' }, { v: 'no', l: '📵 لا' }]} />
              </div>
            </SetRow>
          )}
          {available.length === 0 ? (
            <Hint>لا مقعد فارغ — زِد عدد المقاعد من اللوبي ثمّ أعد المحاولة.</Hint>
          ) : (
            <>
              <p className="m-0 text-[13px] text-[#9a8f7e]">المقعد{suggested ? ' · الأخضر هو المقترح' : ''}{pz ? ' · 📵 داخل الزاوية' : ''}</p>
              <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="المقعد">
                {available.map((n) => {
                  const sel = chosen === n;
                  const cls = sel ? 'border-[#C5A059] bg-[#C5A059]/20 text-[#C5A059]'
                    : suggested === n ? 'border-[#43b27f]/70 bg-[#43b27f]/10 text-[#99dcba]'
                    : zoneSet.has(n) ? 'border-[#d9a23a]/50 text-[#f0c879]'
                    : 'border-[#2a241c] text-[#efe8da]';
                  return (
                    <button key={n} type="button" role="radio" aria-checked={sel} aria-label={`مقعد ${n}`} onClick={() => setSeat(n)}
                      className={`relative min-h-[48px] rounded-[12px] border bg-[#16130f] text-[18px] font-extrabold tabular-nums ${cls}`}>
                      {n}{zoneSet.has(n) && <span className="absolute top-0.5 left-1 text-[11px]">📵</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <div className="flex gap-2">
            <Btn className="flex-1" disabled={loading} onClick={() => { setErr(''); setStep(found ? 'phone' : 'register'); }}>رجوع</Btn>
            <Btn tone="gold" className="flex-[2]" disabled={loading || chosen == null} onClick={() => void submit()}>
              {loading ? '…' : chosen != null ? `أجلِسه في ${chosen}` : 'لا مقعد'}
            </Btn>
          </div>
        </>
      )}
    </BottomSheet>
  );
}
