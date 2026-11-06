'use client';
// ══════════════════════════════════════════════════════
// ☀️ لبناتٌ مشتركة بين شاشات النهار في القمرة
// ══════════════════════════════════════════════════════
import { useEffect, useState, type ReactNode } from 'react';
import { Chip, Chips, HoldButton, ListRow, Section, Hint, teamOf, useCockpit } from '../../kit';

export const playersOf = (gs: any): any[] => gs?.players || [];
export const aliveOf = (gs: any): any[] => playersOf(gs).filter((p: any) => p.isAlive).sort((a: any, b: any) => a.physicalId - b.physicalId);
export const playerAt = (gs: any, seat: number | null | undefined) => (seat == null ? null : playersOf(gs).find((p: any) => p.physicalId === seat) || null);
export const nameAt = (gs: any, seat: number | null | undefined) => playerAt(gs, seat)?.name || '';

/** عدّاد الفرق للّيدر (كالنموذج): مافيا · مدينة · محايد · أحياء */
export function TeamCounts() {
  const { gameState } = useCockpit();
  const a = aliveOf(gameState);
  const m = a.filter(p => teamOf(p.role) === 'M').length;
  const c = a.filter(p => teamOf(p.role) === 'C').length;
  const n = a.filter(p => teamOf(p.role) === 'N').length;
  return (
    <Chips>
      <Chip tone="m">مافيا {m}</Chip>
      <Chip tone="c">مدينة {c}</Chip>
      {n > 0 && <Chip tone="n">محايد {n}</Chip>}
      <Chip>أحياء {a.length}</Chip>
    </Chips>
  );
}

/** صفّ ±الوقت (−30 −10 +10 +30) */
export function AdjRow({ onAdj, disabled }: { onAdj: (delta: number) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {[-30, -10, 10, 30].map(d => (
        <button key={d} type="button" disabled={disabled} onClick={() => onAdj(d)}
          className={`min-h-[44px] rounded-xl border bg-[#16130f] font-bold tabular-nums disabled:opacity-40 ${d > 0 ? 'border-[#C5A059]/45 text-[#C5A059]' : 'border-[#2a241c] text-[#efe8da]'}`}>
          {d > 0 ? `+${d}` : `−${Math.abs(d)}`}
        </button>
      ))}
    </div>
  );
}

/** شريطٌ صغير ثانويّ داخل الجسم (≥44px) */
export function MiniBtn({ children, onClick, disabled, tone, className = '', ariaLabel }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: 'gold' | 'red' | 'sky' | 'ok'; className?: string; ariaLabel?: string;
}) {
  const t = tone === 'gold' ? 'border-[#C5A059]/55 text-[#C5A059]'
    : tone === 'red' ? 'border-[#d0474c]/55 text-[#f2a6a9]'
    : tone === 'sky' ? 'border-[#63afd9]/55 text-[#a9d4ee]'
    : tone === 'ok' ? 'border-[#43b27f]/55 text-[#99dcba]'
    : 'border-[#2a241c] text-[#efe8da]';
  return (
    <button type="button" aria-label={ariaLabel} disabled={disabled} onClick={onClick}
      className={`min-h-[44px] min-w-[44px] rounded-xl border bg-[#16130f] px-3 text-[13.5px] font-bold disabled:opacity-40 ${t} ${className}`}>{children}</button>
  );
}

/**
 * 📺 تلميحاتُ الشاشة على الزرّ الرئيس في الشريط السفليّ (execution-arming/night-arming).
 * الهيكلُ يرسم الزرّ فلا نملك معالجاته؛ نلتقط الأحداث بالتفويض على جذر القمرة:
 * الزرّ الرئيس هو آخر زرٍّ في <footer>. نفس سلوك الواجهة القديمة: الاقتراب = تجهيز، الابتعاد = إلغاء.
 */
export function usePrimaryHint(active: boolean, arm: string, disarm: string) {
  const { sheetRoot, emit, gameState } = useCockpit();
  const roomId = gameState?.roomId;
  useEffect(() => {
    if (!active || !sheetRoot || !roomId) return;
    const primaryOf = (t: EventTarget | null): Element | null => {
      const el = t instanceof Element ? t.closest('footer > button:last-child') : null;
      return el && sheetRoot.contains(el) ? el : null;
    };
    const send = (kind: string) => { emit('display:hint', { roomId, kind }).catch(() => {}); };
    const crossing = (e: PointerEvent | FocusEvent) => {
      const b = primaryOf(e.target);
      if (!b) return null;
      const rel = e.relatedTarget;
      return rel instanceof Node && b.contains(rel) ? null : b;
    };
    const over = (e: PointerEvent) => { if (crossing(e)) send(arm); };
    const out = (e: PointerEvent) => { if (crossing(e)) send(disarm); };
    const fin = (e: FocusEvent) => { if (crossing(e)) send(arm); };
    const fout = (e: FocusEvent) => { if (crossing(e)) send(disarm); };
    sheetRoot.addEventListener('pointerover', over);
    sheetRoot.addEventListener('pointerout', out);
    sheetRoot.addEventListener('focusin', fin);
    sheetRoot.addEventListener('focusout', fout);
    return () => {
      sheetRoot.removeEventListener('pointerover', over);
      sheetRoot.removeEventListener('pointerout', out);
      sheetRoot.removeEventListener('focusin', fin);
      sheetRoot.removeEventListener('focusout', fout);
    };
  }, [active, sheetRoot, roomId, arm, disarm, emit]);
}

/** ⛔ المُقصَون بالعقوبات — «أرجعه» ما دام كرتُه لم يُعرض (الخادم يحرس الشرط) */
export function PenalizedRow() {
  const { gameState, emit, run } = useCockpit();
  const [busy, setBusy] = useState<number | null>(null);
  const kicked = playersOf(gameState).filter((p: any) => !p.isAlive && p.penaltyKicked);
  if (!kicked.length) return null;
  return (
    <Section title="⛔ خرجوا بالعقوبات" tone="red">
      {kicked.map((p: any) => (
        <ListRow key={p.physicalId} n={p.physicalId} title={p.name}
          sub={p.cardRevealed ? 'عُرض كرتُه — صار دورُه معروفاً فلا يُعاد' : 'يعود حيّاً وتُصفَّر عقوباته'}
          right={p.cardRevealed ? <Chip>كُشف كرتُه</Chip> : (
            <HoldButton tone="gold" disabled={busy === p.physicalId} className="min-h-[44px] px-3 text-[13px]" ariaLabel={`اضغط مطوّلاً لإرجاع ${p.name}`}
              onHold={async () => {
                setBusy(p.physicalId);
                await run(() => emit('leader:restore-penalized', { roomId: gameState.roomId, targetPhysicalId: p.physicalId }), `↩ رجع ${p.name} للّعبة`);
                setBusy(null);
              }}>↩ أرجعه</HoldButton>
          )} />
      ))}
      <Hint>تُصفَّر عقوباتُه لأنّ من بلغ الحدّ لا تُسجَّل عليه عقوبةٌ جديدة.</Hint>
    </Section>
  );
}
