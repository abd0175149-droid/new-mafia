'use client';
// ══════════════════════════════════════════════════════
// 🌙 بدءُ الليل — الطريقة محسومةٌ مرّةً قبل اللعبة (صفحة «اللعبة والكروت»)، فلا يُسأل الليدر كلّ ليلة
//
//   • nightKind 'one' (آليّ): night:start {oneNight} ⇒ night:one-start بمهلة nightSeconds
//   • nightKind 'queue' (يدويّ): night:start ⇒ الطابور
//   • nurseAuto: حين يخرج كلُّ الأطبّاء تصحو الممرّضة (أو لا) بلا سؤال ⇒ night:begin-queue
//   • 🚪 دفعة دخولٍ متأخّر مستحقّة ⇒ الخادم يعيد LATE_GATE فتُفتح البوّابة، ثمّ يُعاد البدء
// ══════════════════════════════════════════════════════
import { useState } from 'react';
import { useCockpit } from './kit';
import { useHost } from './host';
import { LateGateSheet } from './screens/LateEntry';

export type NightKind = 'one' | 'queue';

export function useStartNight() {
  const { gameState, emit, run, toast } = useCockpit();
  const host = useHost();
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<any | null>(null);
  const cfg = gameState?.config || {};
  const isRemote = cfg.isRemote === true;
  const kind: NightKind = cfg.nightKind === 'queue' ? 'queue' : 'one';
  const secs: number = Math.min(180, Math.max(30, Number(cfg.nightSeconds) || 60));
  const nurseAuto = cfg.nurseAuto !== false;

  const ensureManual = async () => {
    if (!isRemote && cfg.nightMode === 'auto') {
      await emit('room:update-settings', { roomId: gameState.roomId, nightMode: 'manual' }).catch(() => {});
    }
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await ensureManual();
      let r: any;
      try {
        r = await emit('night:start', { roomId: gameState.roomId, oneNight: kind === 'one', supportsLateGate: true });
      } catch (e: any) {
        const res = e?.response;
        if (res?.code === 'LATE_GATE' && res.gate) { setGate(res.gate); return; }
        toast(res?.error || e?.message || 'تعذّر بدء الليل', { tone: 'red' });
        return;
      }
      if (!r) return;
      if (r.nurseAvailable) {
        const q: any = await run(() => emit('night:begin-queue', { roomId: gameState.roomId, activateNurse: nurseAuto, oneNight: kind === 'one' }));
        if (!q) return;
        toast(nurseAuto ? '💉 الطبيب خرج — الممرّضة تصحو من هذه الليلة' : 'الطبيب خرج — الليل بلا حماية');
      }
      if (kind === 'one' && !r.resumed) await run(() => host.oneNight.start(secs));
    } finally { setBusy(false); }
  };

  const element = gate ? (
    <LateGateSheet gate={gate} onClose={() => setGate(null)} onDone={() => { setGate(null); void start(); }} />
  ) : null;

  return { open: () => void start(), element, busy, kind, secs };
}
