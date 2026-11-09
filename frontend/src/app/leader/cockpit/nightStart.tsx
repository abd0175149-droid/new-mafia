'use client';
// ══════════════════════════════════════════════════════
// 🌙 بدءُ الليل — الطريقة محسومةٌ مرّةً قبل اللعبة (صفحة «اللعبة»)، فلا يُسأل الليدر كلّ ليلة
//
// القمرة تعمل بنمط الخادم «اليدويّ» دائماً للغرف الحضوريّة، وتقرأ من إعدادات الغرفة:
//   • nightKind 'one' (آليّ): night:start {oneNight} ⇒ night:one-start بمهلة nightSeconds
//   • nightKind 'queue' (يدويّ): night:start ⇒ الطابور
//   • nurseAuto: حين يخرج كلُّ الأطبّاء تصحو الممرّضة (أو لا) بلا سؤال ⇒ night:begin-queue
// الوضعُ الآليّ القديم يبقى للغرف البعيدة وحدها (الخادم يفرضه هناك).
// ══════════════════════════════════════════════════════
import { useState } from 'react';
import { useCockpit } from './kit';
import { useHost } from './host';

export type NightKind = 'one' | 'queue';

export function useStartNight() {
  const { gameState, emit, run, toast } = useCockpit();
  const host = useHost();
  const [busy, setBusy] = useState(false);
  const cfg = gameState?.config || {};
  const isRemote = cfg.isRemote === true;
  const kind: NightKind = cfg.nightKind === 'queue' ? 'queue' : 'one';
  const secs: number = Math.min(180, Math.max(30, Number(cfg.nightSeconds) || 60));
  const nurseAuto = cfg.nurseAuto !== false;

  const ensureManual = async () => {
    // الغرفة على «آليّ» من إعدادٍ قديم ⇒ القمرة تحوّلها يدويّاً (تختار الطريقة بنفسها)
    if (!isRemote && cfg.nightMode === 'auto') {
      await emit('room:update-settings', { roomId: gameState.roomId, nightMode: 'manual' }).catch(() => {});
    }
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await ensureManual();
      const r: any = await run(() => emit('night:start', { roomId: gameState.roomId, oneNight: kind === 'one' }));
      if (!r) return;
      if (r.nurseAvailable) {
        // 💉 محسومٌ مسبقاً — لا سؤال
        const q: any = await run(() => emit('night:begin-queue', { roomId: gameState.roomId, activateNurse: nurseAuto, oneNight: kind === 'one' }));
        if (!q) return;
        toast(nurseAuto ? '💉 الطبيب خرج — الممرّضة تصحو من هذه الليلة' : 'الطبيب خرج — الليل بلا حماية');
      }
      if (kind === 'one' && !r.resumed) await run(() => host.oneNight.start(secs));
    } finally { setBusy(false); }
  };

  return { open: () => void start(), element: null, busy, kind, secs };
}
