'use client';
// ══════════════════════════════════════════════════════
// 🃏 طور ROLE_GENERATION — «اللعبة والكروت» بعد الرجوع من التوزيع (أو بعد تحديث الصفحة في منتصفه)
//
// الصفحةُ نفسها في اللوبي (GameCards). «التالي» يرسل الإعدادات ثمّ setup:prepare-deal؛
// «رجوع» يعيد الغرفة إلى الطاولة (setup:reopen-deck to:lobby).
// «أدخِله الآن» لمن وصل قبل الإرسال يبقى هنا: العدد يكبر والتركيبة تُبنى من جديد بالوصفة نفسها.
// ══════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { Role } from '@/lib/constants';
import { Section, ListRow, Btn, Hint, Status, useCockpit } from '../kit';
import { errMsg } from './setup/ui';
import GameCards from './GameCards';
import { StepRail } from './Setup';
import { applyPlan, dealPayload, initialPlan, useTemplates, type SetupPlan } from '../setupPlan';

export default function RolesScreen() {
  const { gameState, emit, run, toast } = useCockpit();
  const cfg = gameState?.config || {};
  const roomId: string = gameState?.roomId;
  const players: any[] = Array.isArray(gameState?.players) ? gameState.players : [];
  const spectators: any[] = Array.isArray(gameState?.spectators) ? gameState.spectators : [];
  const tpl = useTemplates(emit);
  const n = players.filter((p) => p.isAlive !== false).length;

  const [plan, setPlan] = useState<SetupPlan | null>(() => (cfg.setupPlan ? initialPlan(cfg, tpl.defaults) : null));
  useEffect(() => { if (!plan && tpl.loaded) setPlan(initialPlan(cfg, tpl.defaults)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tpl.loaded]);
  const [busy, setBusy] = useState(false);

  const next = async (p: SetupPlan, roles: Role[]) => {
    if (busy) return;
    setBusy(true);
    try {
      await applyPlan(emit, roomId, p);
      await emit('setup:prepare-deal', dealPayload(roomId, p, roles, cfg));
    } catch (e: any) { toast(errMsg(e, 'تعذّر تحضير التوزيع'), { tone: 'red' }); }
    finally { setBusy(false); }
  };
  const back = async () => {
    if (busy) return;
    setBusy(true);
    try { await emit('setup:reopen-deck', { roomId, to: 'lobby' }); }
    catch (e: any) { toast(errMsg(e, 'تعذّر الرجوع'), { tone: 'red' }); }
    finally { setBusy(false); }
  };

  const waiting = spectators.filter((s) => s && Number(s.physicalId) > 0);
  const meta = `${gameState?.roomCode || ''} · ${n} سيلعبون`;

  if (!plan) return <><Status meta={meta} /><StepRail step={2} /><Hint>تُحمَّل القوالب…</Hint></>;
  return (
    <>
      <GameCards plan={plan} setPlan={setPlan} n={n} meta={meta} busy={busy} onBack={() => void back()} onNext={next} />
      {!gameState?.rolesConfirmed && waiting.length > 0 && (
        <Section title={`🚶 وصلوا الآن (${waiting.length})`}>
          {waiting.map((s) => (
            <ListRow key={`${s.physicalId}-${s.joinedAt || ''}`} n={s.physicalId} title={s.name || 'متفرّج'} sub="إدخاله يكبّر العدد، والتركيبة تُبنى بالوصفة نفسها"
              right={<Btn tone="line" onClick={() => void run(() => emit('setup:admit-spectator', { roomId, physicalId: Number(s.physicalId) }), `أُدخل ${s.name || ''}`)}>أدخِله</Btn>} />
          ))}
        </Section>
      )}
    </>
  );
}
