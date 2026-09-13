'use client';
// ══════════════════════════════════════════════════════
// ⚖️ ExecutionCeremony — مراسم الإقصاء النهاريّ فوق مشهد الشارع (قرارات المالك 2026-09-13)
// ══════════════════════════════════════════════════════
// المحرّك يمثّل الساحة (execution.ts) ويُطلق بِيتات؛ هذه الطبقة تعرض البطاقات المُرساة يميناً (36% كتقرير الفجر)
// وتقلبها بمنطق DeadRevealCard نفسه، وتعزف الطلقة والطبل والضربة **من الشاشة** لضمان التزامن التامّ (قرار المالك).
// المحرّك لا يستلم أسماء ولا أدواراً: مقاعد وجنس وفريق فقط. الفريق يُشتقّ من تعريف الدور لحظة الكشف، لا قبله.
// الضحايا الثانويّة (ديل مرتدّ/توأم في الحدث نفسه، قنبلة/رماد لاحقاً) تُمرَّر عبر secondary وتسقط من بين الحشد.
// ══════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import MafiaCard from '@/components/MafiaCard';
import { useGameConfig } from '@/hooks/useGameConfig';
import { isMafiaRole, isNeutralRole, type Role } from '@/lib/constants';
import { playEliminationSound, playCeremonySound } from '@/lib/soundManager';
import { getStreetEngine, type ExecBeat, type ExecTeam, type ExecFigure, type ExecVictim } from '@/components/display/street/engine';

export type ExecEntry = { physicalId: number; role: string; cause?: string; key?: string };
type Stage = 'hidden' | 'face-down' | 'flipping' | 'revealed' | 'grayed';

const CAUSE_AR: Record<string, string> = { DAY_VOTE: 'بقرار المدينة', DEAL: 'أُقصي بالديل', DEAL_BACKFIRE: 'ارتداد الديل على صاحبه', TWIN_SUICIDE: 'انتحار التوأم', ELIMINATE_ALL: 'تعادل: إقصاء الجميع', GODFATHER_BOMB: 'قنبلة شيخ المافيا', ASH_CURSE: 'رماد العنقاء' };
const TEAM_AR: Record<ExecTeam, { label: string; color: string }> = { CITIZEN: { label: 'فريق المدينة', color: '#4aa3ff' }, MAFIA: { label: 'فريق المافيا', color: '#ff3b3b' }, NEUTRAL: { label: 'محايد', color: '#ffd23f' } };

/** 🔫 طلقة مُخلَّقة (لا ملفّ): نبضة ضجيج + دويّ منخفض + ذيل — تُعزف من الشاشة لأنّ توقيتها داخل المشهد */
let actx: AudioContext | null = null;
function playGunshot() {
  try {
    actx = actx || new (window.AudioContext || (window as any).webkitAudioContext)(); const ctx = actx; if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime; const master = ctx.createGain(); master.gain.value = .9; master.connect(ctx.destination);
    const n = ctx.sampleRate * .35; const buf = ctx.createBuffer(1, n, ctx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
    const src = ctx.createBufferSource(); src.buffer = buf; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(400, t + .3); src.connect(lp); lp.connect(master); src.start(t);
    const osc = ctx.createOscillator(); const g = ctx.createGain(); osc.type = 'sine'; osc.frequency.setValueAtTime(110, t); osc.frequency.exponentialRampToValueAtTime(28, t + .45); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(.001, t + .5); osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + .5);
    const tail = ctx.createBufferSource(); const tn = ctx.sampleRate * 1.4; const tb = ctx.createBuffer(1, tn, ctx.sampleRate); const td = tb.getChannelData(0); for (let i = 0; i < tn; i++) td[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / tn, 4) * .25; tail.buffer = tb; const tl = ctx.createBiquadFilter(); tl.type = 'lowpass'; tl.frequency.value = 900; tail.connect(tl); tl.connect(master); tail.start(t + .05);
  } catch { /* noop */ }
}

export function teamOf(role: string | null | undefined, getTeamForRole: (r: string | null) => string | null): ExecTeam {
  const t = role ? getTeamForRole(role) : null; if (t === 'MAFIA' || t === 'CITIZEN' || t === 'NEUTRAL') return t;
  if (role && isMafiaRole(role as Role)) return 'MAFIA'; if (role && isNeutralRole(role as Role)) return 'NEUTRAL'; return 'CITIZEN';
}
const genderOf = (p: any): 'M' | 'F' => (p?.gender === 'FEMALE' ? 'F' : 'M');

/** لماذا لا يتوفّر المشهد؟ '' = متاح. (يُطبع في الكونسول لحظة الكشف ويظهر في شارة التشخيص) */
export function executionSceneReason(): string {
  const eng = getStreetEngine(); if (!eng) return 'no-webgl'; if (!eng.ok) return 'renderer-failed'; if (!eng.ready) return 'assets-loading';
  if (!(eng.exec.tpl.M || eng.exec.tpl.F)) return 'crowd-templates-missing'; if (eng.quality === 'low') return 'quality-low(poster)'; return '';
}
/** هل المشهد ثلاثيّ الأبعاد متاح لهذا الجهاز؟ (يعمل، أصوله وقوالب الحشد جاهزة، وليس على الجودة المنخفضة/الملصق). الإحماء ليس شرطاً: غيابه يكلّف تلعثم إطارٍ واحد لا المشهد كلّه */
export function executionSceneAvailable(): boolean { const r = executionSceneReason(); if (r) console.warn('⚖️ execution scene unavailable:', r); return !r; }

export default function ExecutionCeremony({ players, primary, secondary, holdForSecondary, notes, title, subtitle, onDone }: {
  players: any[]; primary: ExecEntry[]; secondary: ExecEntry[]; holdForSecondary?: boolean; notes?: Record<number, string>; title?: string; subtitle?: string; onDone?: () => void;
}) {
  const { getTeamForRole } = useGameConfig();
  const [stages, setStages] = useState<Record<number, Stage>>({});
  const [order, setOrder] = useState<number[]>([]);
  const firedSecondary = useRef<Set<string>>(new Set()); const primaryKey = primary.map(p => p.physicalId).join(',');
  const entries = useMemo(() => [...primary, ...secondary], [primary, secondary]);
  const alive = (): ExecFigure[] => players.filter((p: any) => p.isAlive !== false).map((p: any) => ({ id: p.physicalId, gender: genderOf(p) }));
  const victimOf = (e: ExecEntry): ExecVictim => ({ id: e.physicalId, gender: genderOf(players.find((p: any) => p.physicalId === e.physicalId)), team: teamOf(e.role, getTeamForRole) });

  // بِيتات المحرّك → مراحل البطاقات والأصوات
  useEffect(() => {
    const eng = getStreetEngine(); if (!eng) return;
    eng.exec.onBeat = (b: ExecBeat) => {
      const id = b.victimId; const set = (st: Stage) => { if (id == null) return; setStages(prev => ({ ...prev, [id]: st })); setOrder(prev => prev.includes(id) ? prev : [...prev, id]); };
      if (b.name === 'close' || b.name === 'pan') { set('face-down'); playCeremonySound('drumroll'); }
      if (b.name === 'shot') playGunshot();
      if (b.name === 'flip' || b.name === 'victim-flip') { set('flipping'); const e = entries.find(x => x.physicalId === id); if (e) playEliminationSound(e.role); setTimeout(() => setStages(prev => (prev[id!] === 'flipping' ? { ...prev, [id!]: 'revealed' } : prev)), 900); }
      if (b.name === 'gray' || b.name === 'victim-gray') { set('grayed'); playCeremonySound('impact'); }
      if (b.name === 'end') onDone?.();
    };
    return () => { eng.exec.onBeat = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  // المحكومون الأساسيّون: يُطلق المشهد مرّةً لكلّ كشف
  useEffect(() => {
    const eng = getStreetEngine(); if (!eng || !primary.length) return;
    const inline = secondary.filter(s => s.cause === 'DEAL_BACKFIRE' || s.cause === 'TWIN_SUICIDE');
    eng.exec.fire(primary.map(victimOf), alive(), { hold: !!holdForSecondary || inline.length > 0 });
    if (inline.length) { inline.forEach(s => firedSecondary.current.add(s.key || `${s.cause}:${s.physicalId}`)); eng.exec.fireSecondary(inline.map(victimOf), alive(), { hold: !!holdForSecondary }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryKey]);

  // ضحايا لاحقون (قنبلة/رماد) يصلون بعد الكشف
  useEffect(() => {
    const eng = getStreetEngine(); if (!eng) return;
    const fresh = secondary.filter(s => !firedSecondary.current.has(s.key || `${s.cause}:${s.physicalId}`) && s.cause !== 'DEAL_BACKFIRE' && s.cause !== 'TWIN_SUICIDE');
    if (!fresh.length) return; fresh.forEach(s => firedSecondary.current.add(s.key || `${s.cause}:${s.physicalId}`));
    eng.exec.fireSecondary(fresh.map(victimOf), alive(), { hold: !!holdForSecondary });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondary, holdForSecondary]);

  // انتهاء الطور أو فكّ التركيب: الحشد يتفرّق
  useEffect(() => () => { getStreetEngine()?.exec.end(); }, []);

  const shown = order.map(id => entries.find(e => e.physicalId === id)).filter(Boolean) as ExecEntry[];
  return (
    <motion.div key="execution-ceremony" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 pointer-events-none" dir="rtl">
      {/* العنوان أعلى المنتصف (المشهد في الثلثين الأيسرين) */}
      <div className="absolute inset-x-0 top-[4%] text-center">
        <h1 className="text-6xl font-black tracking-wide" style={{ fontFamily: 'Amiri, serif', background: 'linear-gradient(180deg,#f6e7bd 0%,#C5A059 52%,#7d5f2a 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 2px 0 rgba(0,0,0,.85)) drop-shadow(0 0 30px rgba(0,0,0,.7))' }}>{title || 'تمّ الإقصاء'}</h1>
        <p className="text-[#9a8f7d] font-mono text-xs tracking-[0.5em] uppercase mt-1" dir="ltr">{subtitle || 'IDENTITY DECLASSIFIED'}</p>
      </div>
      {/* الرصيف المُرسى يميناً: بطاقةٌ لكلّ خارج، بالمسار الكامل (وجه علنيّ ← دور) */}
      <div className="absolute right-[3%] top-[16%] bottom-[5%] w-[36%] flex flex-col items-center justify-center gap-3">
        {/* السابقون يصغرون في صفٍّ أعلى الرصيف؛ الأخير وحده كبير */}
        {shown.length > 1 && (
          <div className="flex flex-row-reverse flex-wrap items-end justify-center gap-3">
            {shown.slice(0, -1).map(e => { const p = players.find((x: any) => x.physicalId === e.physicalId); const team = teamOf(e.role, getTeamForRole); return (
              <div key={e.physicalId} className="flex flex-col items-center" style={{ zoom: .42, opacity: .75 } as any}>
                <MafiaCard playerNumber={e.physicalId} playerName={p?.name || ''} role={e.role} isFlipped flippable={false} isAlive={false} size="lg" avatarUrl={p?.avatarUrl} rankTier={p?.rankTier} cosmetics={(p as any)?.cosmetics} />
                <p className="text-2xl text-white mt-1" style={{ fontFamily: 'Amiri, serif', textDecoration: 'line-through', textShadow: '0 1px 0 #000' }}>#{e.physicalId} {p?.name || ''}</p>
                <p className="text-sm font-mono tracking-[0.25em]" style={{ color: TEAM_AR[team].color }}>{TEAM_AR[team].label}</p>
              </div>); })}
          </div>
        )}
        {shown.slice(-1).map(e => {
          const p = players.find((x: any) => x.physicalId === e.physicalId); const st = stages[e.physicalId] || 'hidden'; const team = teamOf(e.role, getTeamForRole); const flipped = st === 'flipping' || st === 'revealed' || st === 'grayed'; const grayed = st === 'grayed';
          const k = shown.length > 1 ? .85 : 1;
          return (
            <motion.div key={e.physicalId} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', damping: 16 }} className="flex flex-col items-center gap-2" style={{ zoom: k } as any}>
              <div className="relative transition-all duration-700" style={{ opacity: grayed ? .72 : 1, boxShadow: flipped && !grayed ? `0 0 40px ${TEAM_AR[team].color}88` : 'none', borderRadius: 16 }}>
                <MafiaCard playerNumber={e.physicalId} playerName={p?.name || 'Unknown'} role={e.role} isFlipped={flipped} flippable={false} isAlive={!grayed} flipDurationMs={900} gender={p?.gender === 'FEMALE' ? 'FEMALE' : 'MALE'} size="lg" avatarUrl={p?.avatarUrl} rankTier={p?.rankTier} cosmetics={(p as any)?.cosmetics} />
              </div>
              <div className="text-center leading-tight">
                <p className="text-2xl text-white" style={{ fontFamily: 'Amiri, serif', textDecoration: grayed ? 'line-through' : 'none', textShadow: '0 1px 0 #000, 0 0 18px rgba(0,0,0,.8)' }}>#{e.physicalId} {p?.name || ''}</p>
                {flipped && <p className="text-sm font-mono tracking-[0.25em]" style={{ color: TEAM_AR[team].color, textShadow: '0 1px 0 #000' }}>{TEAM_AR[team].label}</p>}
                {grayed && (e.cause || notes?.[e.physicalId]) && <p className="text-base text-[#C5A059]" style={{ fontFamily: 'Amiri, serif', textShadow: '0 1px 0 #000' }}>{[e.cause ? CAUSE_AR[e.cause] : null, notes?.[e.physicalId]].filter(Boolean).join(' · ')}</p>}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
