'use client';

// ══════════════════════════════════════════════════════
// ⚙️ HostSettingsModal — إدارة كل إعدادات اللعبة من لوبي المضيف (تعديلٌ حيّ قبل بدء التوزيع).
// يُهيّأ من gameState.config ويبثّ room:update-settings؛ الخادم يعيد بثّ الحالة فتتحدّث الواجهة.
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';

interface Props {
  gameState: any;
  emit: (event: string, payload: any) => Promise<any>;
  onClose: () => void;
}

export default function HostSettingsModal({ gameState, emit, onClose }: Props) {
  const c = gameState.config || {};
  const [gameName, setGameName] = useState<string>(c.gameName || 'غرفة عن بُعد');
  const [autoNightTime, setAutoNightTime] = useState<number>(c.autoNightTime ?? 15);
  const [gameTimerMinutes, setGameTimerMinutes] = useState<number>(c.gameTimerEnabled ? (c.gameTimerMinutes || 30) : 0);
  const [maxJustifications, setMaxJustifications] = useState<number>(c.maxJustifications ?? 2);
  const [maxPenalties, setMaxPenalties] = useState<number>(c.maxPenalties ?? 3);
  const [penaltyScope, setPenaltyScope] = useState<'room' | 'game'>(c.penaltyScope === 'game' ? 'game' : 'room');
  const [bombEnabled, setBombEnabled] = useState<boolean>(c.bombEnabled !== false);
  const [mafiaChatEnabled, setMafiaChatEnabled] = useState<boolean>(c.mafiaChatEnabled === true);
  const [allowPlayerInvites, setAllowPlayerInvites] = useState<boolean>(c.allowPlayerInvites === true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  // منع تمرير الخلفية أثناء فتح المودال
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const res = await emit('room:update-settings', {
        roomId: gameState.roomId,
        gameName: gameName.trim() || 'غرفة عن بُعد',
        autoNightTime,
        gameTimerMinutes,
        maxJustifications,
        maxPenalties,
        penaltyScope,
        bombEnabled,
        mafiaChatEnabled,
        allowPlayerInvites,
      });
      if (res?.success) {
        setSaved(true);
        setTimeout(() => onClose(), 700);
      } else {
        setErr(res?.error || 'تعذّر حفظ الإعدادات');
      }
    } catch (e: any) {
      setErr(e?.message || 'تعذّر حفظ الإعدادات');
    } finally {
      setBusy(false);
    }
  };

  const Toggle = ({ value, onYes, onNo, yes, no }: { value: boolean; onYes: () => void; onNo: () => void; yes: string; no: string }) => (
    <div className="flex gap-2">
      <button type="button" onClick={onYes} className={`flex-1 py-2 rounded-lg text-sm border transition ${value ? 'bg-emerald-500/15 border-emerald-600 text-emerald-300' : 'border-[#222] text-[#888]'}`}>{yes}</button>
      <button type="button" onClick={onNo} className={`flex-1 py-2 rounded-lg text-sm border transition ${!value ? 'bg-[#1a1a1a] border-[#333] text-white' : 'border-[#222] text-[#888]'}`}>{no}</button>
    </div>
  );

  const Stepper = ({ value, set, min, max, unit }: { value: number; set: (n: number) => void; min: number; max: number; unit?: string }) => (
    <div className="flex items-center bg-[#050505] border border-[#222] rounded-lg w-fit">
      <button type="button" onClick={() => set(Math.max(min, value - 1))} className="px-3 py-1.5 text-[#888]">−</button>
      <span className="px-3 font-mono text-white text-sm min-w-[3rem] text-center">{value}{unit ? ` ${unit}` : ''}</span>
      <button type="button" onClick={() => set(Math.min(max, value + 1))} className="px-3 py-1.5 text-[#888]">+</button>
    </div>
  );

  const label = (t: string) => <div className="text-[10px] font-mono text-[#808080] tracking-widest uppercase mb-2">{t}</div>;

  return (
    <div dir="rtl" className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0a0a0a] border border-[#C5A059]/30 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[88vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* الرأس */}
        <div className="flex items-center justify-between p-4 border-b border-[#1a1a1a]">
          <div className="text-[#C5A059] font-black text-lg" style={{ fontFamily: 'Amiri, serif' }}>⚙️ إعدادات اللعبة</div>
          <button onClick={onClose} className="text-[#888] hover:text-white text-xl w-8 h-8 leading-none">✕</button>
        </div>

        {/* المحتوى */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            {label('🏷️ اسم الغرفة')}
            <input value={gameName} onChange={e => setGameName(e.target.value)} maxLength={60}
              className="w-full bg-[#050505] border border-[#222] rounded-lg px-3 py-2.5 text-white text-base outline-none focus:border-[#C5A059]" />
          </div>

          <div>
            {label('⏱️ مهلة إجراء الليل (ثوانٍ)')}
            <Stepper value={autoNightTime} set={setAutoNightTime} min={5} max={60} unit="ث" />
          </div>

          <div>
            {label('⏳ مؤقّت اللعبة (دقائق — 0 = مطفأ)')}
            <Stepper value={gameTimerMinutes} set={setGameTimerMinutes} min={0} max={180} unit="د" />
          </div>

          <div>
            {label('🎙️ أقصى عدد تبريرات')}
            <Stepper value={maxJustifications} set={setMaxJustifications} min={1} max={5} />
          </div>

          <div>
            {label('⚠️ أقصى عدد عقوبات')}
            <Stepper value={maxPenalties} set={setMaxPenalties} min={1} max={10} />
          </div>

          <div>
            {label('📋 نطاق العقوبات')}
            <div className="flex gap-2">
              <button type="button" onClick={() => setPenaltyScope('room')} className={`flex-1 py-2 rounded-lg text-sm border transition ${penaltyScope === 'room' ? 'bg-[#C5A059]/15 border-[#C5A059] text-[#C5A059]' : 'border-[#222] text-[#888]'}`}>الغرفة</button>
              <button type="button" onClick={() => setPenaltyScope('game')} className={`flex-1 py-2 rounded-lg text-sm border transition ${penaltyScope === 'game' ? 'bg-[#C5A059]/15 border-[#C5A059] text-[#C5A059]' : 'border-[#222] text-[#888]'}`}>اللعبة</button>
            </div>
          </div>

          <div>
            {label('💣 قنبلة الأب الروحيّ')}
            <Toggle value={bombEnabled} onYes={() => setBombEnabled(true)} onNo={() => setBombEnabled(false)} yes="مفعّلة" no="معطّلة" />
          </div>

          <div>
            {label('🗣️ غرفة تشاور المافيا السرّية')}
            <Toggle value={mafiaChatEnabled} onYes={() => setMafiaChatEnabled(true)} onNo={() => setMafiaChatEnabled(false)} yes="مفعّلة" no="معطّلة" />
          </div>

          <div>
            {label('📨 دعوة اللاعبين لأصدقائهم')}
            <div className="flex gap-2">
              <button type="button" onClick={() => setAllowPlayerInvites(true)} className={`flex-1 py-2 rounded-lg text-sm border transition ${allowPlayerInvites ? 'bg-sky-500/15 border-sky-600 text-sky-300' : 'border-[#222] text-[#888]'}`}>مسموح</button>
              <button type="button" onClick={() => setAllowPlayerInvites(false)} className={`flex-1 py-2 rounded-lg text-sm border transition ${!allowPlayerInvites ? 'bg-[#1a1a1a] border-[#333] text-white' : 'border-[#222] text-[#888]'}`}>للمضيف فقط</button>
            </div>
          </div>

          {err && <div className="text-center text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg py-2">{err}</div>}
        </div>

        {/* الحفظ */}
        <div className="p-4 border-t border-[#1a1a1a]">
          <button onClick={save} disabled={busy || saved}
            className="btn-premium w-full !py-3 !rounded-xl disabled:opacity-50">
            <span>{saved ? '✓ حُفظت' : busy ? 'جارٍ الحفظ…' : '💾 حفظ الإعدادات'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
