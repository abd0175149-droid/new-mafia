'use client';
// ══════════════════════════════════════════════════════
// 🌙 بدءُ الليل — الطريقة تُختار عند حلول الليل لا في الإعدادات مسبقاً
//
// القمرة تعمل بنمط الخادم «اليدويّ» دائماً للغرف الحضوريّة، وتختار لكلّ ليلة:
//   • الليلة الواحدة: night:start {oneNight} ⇒ (قرار الممرّضة إن لزم) ⇒ night:one-start
//   • الطابور: night:start ⇒ (قرار الممرّضة إن لزم ⇒ night:begin-queue)
// الوضعُ الآليّ القديم يبقى للغرف البعيدة وحدها (الخادم يفرضه هناك).
// ══════════════════════════════════════════════════════
import { useState } from 'react';
import { BottomSheet, Seg, Stepper, SetRow, Hint, ListRow, useCockpit } from './kit';
import { useHost } from './host';

export type NightKind = 'one' | 'queue';

export function useStartNight() {
  const { gameState, emit, run, toast } = useCockpit();
  const host = useHost();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<NightKind>('one');
  const [secs, setSecs] = useState<number>(60);
  const [nurseAsk, setNurseAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const isRemote = gameState?.config?.isRemote === true;

  const ensureManual = async () => {
    // الغرفة على «آليّ» من إعدادٍ قديم ⇒ القمرة تحوّلها يدويّاً (تختار الطريقة بنفسها كلّ ليلة)
    if (!isRemote && gameState?.config?.nightMode === 'auto') {
      await emit('room:update-settings', { roomId: gameState.roomId, nightMode: 'manual' }).catch(() => {});
    }
  };

  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await ensureManual();
      const r: any = await run(() => emit('night:start', { roomId: gameState.roomId, oneNight: kind === 'one' }));
      if (!r) return;
      if (r.nurseAvailable) { setNurseAsk(true); return; }
      setOpen(false);
      if (kind === 'one' && !r.resumed) await run(() => host.oneNight.start(secs));
    } finally { setBusy(false); }
  };

  const nurse = async (activate: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const r: any = await run(() => emit('night:begin-queue', { roomId: gameState.roomId, activateNurse: activate, oneNight: kind === 'one' }));
      if (!r) return;
      setNurseAsk(false); setOpen(false);
      if (activate) toast('💉 الممرّضة تصحو من الليلة');
      if (kind === 'one') await run(() => host.oneNight.start(secs));
    } finally { setBusy(false); }
  };

  const element = (
    <BottomSheet open={open} title={nurseAsk ? 'الطبيب خرج' : `بدء الليل · الجولة ${(gameState?.round || 0) + 1}`} onClose={() => { if (!busy) { setOpen(false); setNurseAsk(false); } }}>
      {nurseAsk ? (
        <>
          <ListRow n="💉" title="الممرّضة حيّة" sub="تصحو بقدرة الحماية من هذه الليلة؟" />
          <button type="button" disabled={busy} onClick={() => nurse(true)} className="min-h-[50px] rounded-[13px] bg-[#C5A059] text-[#110d08] font-bold disabled:opacity-40">فعّل الممرّضة وابدأ</button>
          <button type="button" disabled={busy} onClick={() => nurse(false)} className="min-h-[46px] rounded-[13px] border border-[#2a241c] bg-[#16130f] font-bold disabled:opacity-40">تخطَّ — ابدأ بدونها</button>
        </>
      ) : (
        <>
          <Hint>القاعة تغمض أعينها. اختر طريقة هذه الليلة.</Hint>
          <Seg<NightKind> vertical value={kind} onChange={setKind} options={[
            { v: 'one', l: '🌙 الليلة الواحدة', sub: 'الكلّ يختار معاً من هاتفه، ثمّ تراجع وتحسب' },
            { v: 'queue', l: '🧭 الطابور', sub: 'تمرّ على الأدوار دوراً دوراً وتختار بنفسك' },
          ]} />
          {kind === 'one' && (
            <SetRow title="مدّة الاختيار" sub="بعدها تُفتح المراجعة تلقائيّاً">
              <Stepper value={secs} min={30} max={180} step={15} unit="ث" onChange={setSecs} />
            </SetRow>
          )}
          <button type="button" disabled={busy} onClick={go} className="min-h-[52px] rounded-[15px] bg-[#C5A059] text-[#110d08] text-[16px] font-bold disabled:opacity-40">
            {busy ? '…' : kind === 'one' ? `ابدأ الليلة (${secs} ث)` : 'ابدأ الطابور'}
          </button>
        </>
      )}
    </BottomSheet>
  );

  return { open: () => setOpen(true), element, busy };
}
