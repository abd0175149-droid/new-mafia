'use client';
// ══════════════════════════════════════════════════════
// 💀 الكشف — DAY_ELIMINATION (بانتظار الكشف/القنبلة/قرار العمدة) و DAY_REVEALED (بعده)
// شاشةٌ واحدة للطورين حتى يبقى الكرت نفسه في الشجرة فيُقلب أمامك عند الكشف.
//   day:trigger-reveal {result: pendingResolution} + display:hint execution-arming/disarm
//   day:bomb-decision {eliminateAbove, eliminateBelow}
//   game:confirm-end (فائز) · وإلّا بدء الليل عبر useStartNight (+ display:hint night-arming/disarm)
// ══════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { ActionBar, BottomSheet, Btn, Hint, HoldButton, Section, Status, TEAM_AR, roleIcon, roleName, teamOf, useCockpit } from '../../kit';
import { useStartNight } from '../../nightStart';
import { nameAt, playerAt, usePrimaryHint } from './shared';

const CAUSE_AR: Record<string, string> = {
  DAY_VOTE: 'بالتصويت', DEAL: 'باتفاقيّة', DEAL_BACKFIRE: 'ارتدّت عليه اتفاقيّته', ELIMINATE_ALL: 'إقصاء المتعادلين',
  TWIN_SUICIDE: 'لحق بأخيه', GODFATHER_BOMB: 'قنبلة الشيخ',
};

function FlipCard({ seat, name, role, flipped, small, cause }: { seat: number; name: string; role?: string | null; flipped: boolean; small?: boolean; cause?: string }) {
  const t = teamOf(role);
  const col = t === 'M' ? '#d0474c' : t === 'N' ? '#d9a23a' : '#63afd9';
  const W = small ? 150 : 200, H = small ? 210 : 280;
  const face = 'absolute inset-0 rounded-[18px] flex flex-col items-center justify-center gap-2 border border-[#C5A059]/50';
  return (
    <div className="flex flex-col items-center gap-1.5" style={{ perspective: 900 }}>
      <div className="relative transition-transform duration-700 motion-reduce:transition-none"
        style={{ width: W, height: H, transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'none' }}
        aria-label={flipped ? `${seat} ${name}: ${roleName(role)}` : `${seat} ${name}: الكرت مقلوب`}>
        <div className={face} style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', background: 'repeating-linear-gradient(45deg,#15110c 0 10px,#110d09 10px 20px)' }}>
          <b className="text-[#C5A059] tabular-nums" style={{ fontFamily: 'Amiri, serif', fontSize: small ? 34 : 44 }}>{seat}</b>
          <span className="max-w-full truncate px-2 text-[14px] text-[#9a8f7e]">{name}</span>
        </div>
        <div className={face} style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)', background: 'linear-gradient(#1b1510,#0d0a07)' }}>
          <span style={{ fontSize: small ? 40 : 54 }}>{roleIcon(role) || '🎭'}</span>
          <span style={{ fontFamily: 'Amiri, serif', fontSize: small ? 22 : 28, color: col }}>{roleName(role)}</span>
          {t && <span className="rounded-full px-3 py-0.5 text-[13px]" style={{ border: `1px solid ${col}`, color: col }}>{TEAM_AR[t]}</span>}
          <small className="max-w-full truncate px-2 text-[12.5px] text-[#9a8f7e]">{seat} · {name}</small>
        </div>
      </div>
      {cause && <small className="text-[12.5px] text-[#9a8f7e]">{cause}</small>}
    </div>
  );
}

export default function Reveal() {
  const { gameState, emit, run, peek } = useCockpit();
  const night = useStartNight();
  const roomId = gameState.roomId;
  const revealed = gameState.phase === 'DAY_REVEALED';
  const pending = gameState.pendingResolution;
  const rd = gameState.revealedData;
  // بعد الكشف: revealedData، واحتياطاً (إعادة اتصالٍ قبل وصوله) pendingResolution
  const src = revealed && rd ? rd : pending;
  const ids: number[] = src?.eliminated || [];
  const rolesArr: any[] = src?.revealedRoles || [];
  const roleMap: Record<number, string> = {};
  rolesArr.forEach((r: any) => { roleMap[r.physicalId] = r.role; });
  const causes: any[] = src?.causes || [];
  const causeOf = (id: number) => { const c = causes.find((x: any) => x.physicalId === id); return c ? CAUSE_AR[c.by] : undefined; };
  const roleOf = (id: number) => roleMap[id] || playerAt(gameState, id)?.role || null;

  const postponed = !revealed && pending?.type === 'MAYOR_POSTPONED';
  const bomb = gameState.pendingBomb;
  const bombKey = bomb ? `${gameState.round}:${bomb.godfatherPhysicalId}` : '';
  const [bombSent, setBombSent] = useState('');
  const bombActive = !revealed && !!bomb && bombKey !== bombSent && ids.some(id => roleOf(id) === 'GODFATHER');
  const [bombOpen, setBombOpen] = useState(false);
  useEffect(() => { if (bombActive) setBombOpen(true); }, [bombActive]);

  const pendingWinner = gameState.pendingWinner;
  const [busy, setBusy] = useState(false);
  usePrimaryHint(!revealed && !postponed && !bombActive && !!pending, 'execution-arming', 'execution-disarm');
  usePrimaryHint(revealed && !pendingWinner, 'night-arming', 'night-disarm');

  const triggerReveal = async () => {
    if (!gameState.pendingResolution || busy) return;
    setBusy(true);
    await run(() => emit('day:trigger-reveal', { roomId, result: gameState.pendingResolution }));
    setBusy(false);
  };
  const bombDecision = async (eliminateAbove: boolean, eliminateBelow: boolean) => {
    if (busy) return;
    setBusy(true);
    const r = await run(() => emit('day:bomb-decision', { roomId, eliminateAbove, eliminateBelow }),
      eliminateAbove || eliminateBelow ? '💣 فُعّلت القنبلة — تظهر نتيجتها مع الكشف' : 'أُوقفت القنبلة — الشيخ وحده');
    setBusy(false);
    if (r) { setBombSent(bombKey); setBombOpen(false); }
  };

  const small = ids.length > 1;
  const flipped = revealed || peek;
  const nextRound = (gameState.round || 0) + 1;

  return (
    <>
      <Status meta={revealed ? 'قُلب الكرت على شاشة القاعة' : postponed ? 'العمدة أجّل الإعدام' : bombActive ? '💣 الشيخ يُقصى — قرار القنبلة أوّلاً' : 'الكرت مقلوبٌ على الشاشة بانتظارك'} />

      {postponed || (revealed && ids.length === 0) ? (
        <Section title="🎩 لا موت اليوم">
          <Hint>
            {gameState.mayorState?.mayorPhysicalId
              ? <>كشف <b className="text-[#efe8da]">{gameState.mayorState.mayorPhysicalId} {nameAt(gameState, gameState.mayorState.mayorPhysicalId)}</b> نفسه عمدةً وألغى إعدام اليوم. صوتُه ×{gameState.config?.mayorVoteWeight ?? 2} من الآن، وغداً نهارٌ جديد.</>
              : 'لم يخرج أحدٌ اليوم.'}
          </Hint>
        </Section>
      ) : (
        <div className="flex flex-wrap justify-center gap-3 py-2">
          {ids.map(id => (
            <FlipCard key={id} seat={id} name={nameAt(gameState, id) || '—'} role={roleOf(id)} flipped={flipped} small={small} cause={causeOf(id)} />
          ))}
        </div>
      )}
      {!revealed && !postponed && ids.length > 0 && (
        <Hint className="text-center">{peek ? '👁 تُرى الأدوار لك وحدك ما دمت تضغط.' : 'دورُه يظهر لك هنا بعد الكشف — أو اضغط 👁 مطوّلاً.'}</Hint>
      )}
      {bombActive && (
        <Section title="💣 قدرة القنبلة" tone="red">
          <Hint>شيخ المافيا يُقصى ويأخذ معه من جاريه من يختار — أو تُوقَف القدرة. الكشف بعد القرار.</Hint>
          <Btn tone="red" onClick={() => setBombOpen(true)}>افتح قرار القنبلة</Btn>
        </Section>
      )}

      {bomb && (
        <BottomSheet open={bombOpen && bombActive} title="💣 قنبلة الشيخ" onClose={() => setBombOpen(false)}>
          <Hint>الشيخ {bomb.godfatherPhysicalId} {nameAt(gameState, bomb.godfatherPhysicalId)} يُقصى. من يأخذ معه؟ 🔒 الأدوار للّيدر وحده.</Hint>
          <div className="grid grid-cols-2 gap-2">
            {[{ n: bomb.below, l: 'الجار السابق', below: true }, { n: bomb.above, l: 'الجار التالي', below: false }].map(s => s.n ? (
              <HoldButton key={s.l} disabled={busy} className="min-h-[76px] px-2" ariaLabel={`اضغط مطوّلاً: ${s.n.physicalId} ${s.n.name} فقط`}
                onHold={() => bombDecision(!s.below, s.below)}>
                <b className="block text-[20px] tabular-nums">مطوّلاً: {s.n.physicalId}</b>
                <span className="block truncate text-[14px]">{s.n.name}</span>
                <small className="block text-[12px] font-medium opacity-85">{s.l} · 🔒 {roleName(s.n.role)}</small>
              </HoldButton>
            ) : (
              <div key={s.l} className="min-h-[76px] rounded-[15px] border border-dashed border-[#2a241c] grid place-items-center text-[13px] text-[#9a8f7e]">{s.l}: لا أحد</div>
            ))}
          </div>
          {bomb.above && bomb.below && (
            <HoldButton disabled={busy} className="w-full min-h-[52px]" onHold={() => bombDecision(true, true)}>
              اضغط مطوّلاً: الاثنان معاً ({bomb.below.physicalId} و{bomb.above.physicalId})
            </HoldButton>
          )}
          <Btn disabled={busy} onClick={() => bombDecision(false, false)}>بلا قنبلة — الشيخ وحده</Btn>
        </BottomSheet>
      )}

      {night.element}

      {!revealed ? (
        postponed ? (
          <ActionBar primary={{ label: 'أعلن قرار العمدة على الشاشة', disabled: busy || !pending, onPress: triggerReveal }} />
        ) : bombActive ? (
          <ActionBar primary={{ label: '💣 قرار القنبلة', onPress: () => setBombOpen(true) }} />
        ) : (
          <ActionBar primary={{ label: 'اكشف الدور على الشاشة', disabled: busy || !pending, onPress: triggerReveal }} />
        )
      ) : pendingWinner ? (
        <ActionBar primary={{
          label: '🏁 اعرض النتيجة', disabled: busy,
          onPress: async () => { setBusy(true); await run(() => emit('game:confirm-end', { roomId })); setBusy(false); },
        }} />
      ) : (
        <ActionBar primary={{ label: `ابدأ الليل · الجولة ${nextRound}`, disabled: night.busy, onPress: night.open }} />
      )}
    </>
  );
}
