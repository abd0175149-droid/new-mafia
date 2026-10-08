'use client';

// ══════════════════════════════════════════════════════
// 🗳️ سجلّ التصويت — عرضٌ واحد لثلاثة أماكن: تبويبُ المفكرة، شاشةُ المتفرّج، وسجلّ المباريات.
// البيانات من الخادم (game/vote-history.ts): جولاتٌ مفروزة، علنيّة، بلا أدوار. الصوتُ النهائيّ
// وحده كما عرضته الورقة الحيّة. قرار المالك 2026-10-08.
// ══════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';

export interface VoteRoundVoter { voterPhysicalId: number; name: string; weight: number; via?: 'proxy' | 'auto' }
export interface VoteRoundCandidate {
  type: 'PLAYER' | 'DEAL'; targetPhysicalId: number; name: string;
  initiatorPhysicalId?: number; initiatorName?: string;
  votes: number; people: number; unnamed: number; voters: VoteRoundVoter[];
}
export interface VoteRound {
  id: string; round: number; seq: number; kind: string; resolvedAt: number;
  shieldedPhysicalId: number | null; candidates: VoteRoundCandidate[]; withdrawn: number[];
  outcome: { type: string; eliminated?: number[]; names?: string[]; viaDeal?: boolean; savedPhysicalId?: number; savedName?: string; withdrawnVotes?: number; neededVotes?: number } | null;
}

const KIND_SHORT: Record<string, string> = { TIE_REVOTE: 'إعادة', TIE_NARROW: 'حصر', WITHDRAWAL_REVOTE: 'بعد السحب', MAYOR_REVOTE: 'بأمر العمدة', RESTART: 'إعادة' };
const KIND_LONG: Record<string, string> = {
  DAY: 'تصويت النهار', TIE_REVOTE: 'إعادة بعد التعادل', TIE_NARROW: 'حصرٌ بين المتعادلين',
  WITHDRAWAL_REVOTE: 'إعادة بعد سحب الأصوات', MAYOR_REVOTE: 'إعادة بأمر العمدة', RESTART: 'إعادة التصويت',
};

const roundLabel = (r: VoteRound) => `اليوم ${r.round}${r.seq > 1 ? ` · ${KIND_SHORT[r.kind] || 'إعادة'}` : ''}`;
const candLabel = (c: VoteRoundCandidate) => c.type === 'DEAL'
  ? `ديل: ${c.initiatorName || `#${c.initiatorPhysicalId}`} ⇄ ${c.name}` : c.name;
const candSub = (c: VoteRoundCandidate) => c.type === 'DEAL'
  ? `#${c.initiatorPhysicalId} ⇄ #${c.targetPhysicalId}` : `مقعد ${c.targetPhysicalId}`;

function outcomeText(r: VoteRound): { text: string; tone: 'bad' | 'warn' | 'dim' } {
  const o = r.outcome;
  const who = (ids?: number[], names?: string[]) => (ids || []).map((s, i) => `#${s} ${names?.[i] || ''}`.trim()).join('، ');
  if (!o) return { text: 'فُرزت — بانتظار النتيجة', tone: 'dim' };
  switch (o.type) {
    case 'ELIMINATED': return { text: `أُقصي ${who(o.eliminated, o.names)}${o.viaDeal ? ' (بالديل)' : ''}`, tone: 'bad' };
    case 'NO_ELIMINATION': return { text: 'لم يُقصَ أحد', tone: 'dim' };
    case 'TIE': return { text: 'تعادل — بانتظار قرار الموجّه', tone: 'warn' };
    case 'TIE_REVOTE': return { text: 'تعادل ⟵ إعادة التصويت', tone: 'warn' };
    case 'TIE_NARROW': return { text: 'تعادل ⟵ حصرٌ بين المتعادلين', tone: 'warn' };
    case 'TIE_CANCEL': return { text: 'تعادل ⟵ أُلغي التصويت', tone: 'dim' };
    case 'TIE_ELIMINATE_ALL': return { text: `تعادل ⟵ إقصاء المتعادلين${o.eliminated?.length ? `: ${who(o.eliminated, o.names)}` : ''}`, tone: 'bad' };
    case 'WITHDRAWN': return { text: `سُحب ${o.withdrawnVotes ?? '?'} من ${o.neededVotes ?? '?'} مطلوبة ⟵ إعادة التصويت`, tone: 'warn' };
    case 'MAYOR_SAVED': return { text: `العمدة أنقذ${o.savedPhysicalId != null ? ` #${o.savedPhysicalId} ${o.savedName || ''}` : ''} ⟵ إعادة`, tone: 'warn' };
    case 'MAYOR_POSTPONED': return { text: 'العمدة أجّل الإعدام — لا موت اليوم', tone: 'dim' };
    case 'RESTARTED': return { text: 'أُعيد التصويت', tone: 'dim' };
    default: return { text: '', tone: 'dim' };
  }
}

const TONE: Record<string, string> = { bad: 'text-red-400', warn: 'text-[#C5A059]', dim: 'text-gray-500' };

export default function VoteHistoryPanel({ rounds, myPhysicalId, footerHint }: {
  rounds: VoteRound[];
  myPhysicalId?: number | null;
  footerHint?: string;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState<'cand' | 'person'>('cand');
  const [person, setPerson] = useState<number | null>(myPhysicalId ?? null);
  const current = rounds.find(r => r.id === sel) || rounds[rounds.length - 1] || null;

  // الجولة الجديدة تُعرض تلقائيّاً ما دام اللاعب على آخر جولة
  useEffect(() => { if (sel && !rounds.some(r => r.id === sel)) setSel(null); }, [rounds, sel]);

  // كلُّ من ظهر في السجلّ — مصوّتاً أو مرشّحاً — باسمه الأخير
  const people = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rounds) for (const c of r.candidates) {
      m.set(c.targetPhysicalId, c.name);
      if (c.initiatorPhysicalId != null) m.set(c.initiatorPhysicalId, c.initiatorName || '');
      for (const v of c.voters) m.set(v.voterPhysicalId, v.name);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [rounds]);

  if (!rounds.length) {
    return (
      <div className="text-center py-10 px-4">
        <p className="text-3xl mb-2 opacity-60">🗳️</p>
        <p className="text-gray-400 text-sm">لا جولات تصويت بعد</p>
        <p className="text-gray-600 text-xs mt-1">كلُّ جولة تظهر هنا بعد فرزها</p>
      </div>
    );
  }

  const chip = (v: VoteRoundVoter, r: VoteRound) => {
    const withdrawn = r.withdrawn?.includes(v.voterPhysicalId);
    const me = v.voterPhysicalId === myPhysicalId;
    return (
      <span key={v.voterPhysicalId}
        title={withdrawn ? 'سحب صوته' : v.via === 'proxy' ? 'سجّله الموجّه باسمه' : v.via === 'auto' ? 'انتهى الوقت: صوتٌ على نفسه' : ''}
        className={`text-[11.5px] px-2 py-0.5 rounded-full border whitespace-nowrap ${me ? 'border-[#C5A059] text-[#C5A059]' : 'border-[#2c2c2c] text-gray-200'} ${withdrawn ? 'line-through opacity-50' : ''} ${v.via ? 'border-dashed' : ''} bg-[#1a1a1a]`}>
        #{v.voterPhysicalId} {v.name}{v.via === 'proxy' ? ' 🤝' : v.via === 'auto' ? ' ⏰' : ''}
        {v.weight > 1 && <b className="text-[#C5A059] mr-1">×{v.weight}</b>}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      {/* الجولات */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {rounds.map(r => (
          <button key={r.id} type="button" onClick={() => setSel(r.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${current?.id === r.id ? 'border-[#C5A059] text-[#C5A059] bg-[#C5A059]/10' : 'border-[#2a2a2a] text-gray-300 bg-[#141414]'}`}>
            {roundLabel(r)}
          </button>
        ))}
      </div>

      {/* العرض */}
      <div className="flex bg-[#141414] border border-[#2a2a2a] rounded-xl p-1">
        {([['cand', 'حسب المرشّح'], ['person', 'حسب اللاعب']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setView(k)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${view === k ? 'bg-[#262013] text-[#C5A059]' : 'text-gray-500'}`}>{l}</button>
        ))}
      </div>

      {view === 'cand' && current && (() => {
        const o = outcomeText(current);
        const sorted = [...current.candidates].sort((a, b) => b.votes - a.votes);
        const max = sorted[0]?.votes ?? 0;
        return (
          <>
            <div>
              <p className="text-[11px] text-gray-500">
                {KIND_LONG[current.kind] || 'تصويت'}
                {current.shieldedPhysicalId != null && ` · #${current.shieldedPhysicalId} محميّ بأمر العمدة`}
              </p>
              <p className={`text-[13px] font-bold ${TONE[o.tone]}`}>{o.text}</p>
            </div>
            {sorted.map((c, i) => (
              <div key={`${c.type}:${c.initiatorPhysicalId ?? ''}:${c.targetPhysicalId}:${i}`}
                className={`rounded-2xl border p-3 flex flex-col gap-2 bg-[#111] ${c.votes === max && max > 0 ? 'border-[#C5A059]/40' : 'border-[#222]'}`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 shrink-0 rounded-full bg-[#1d1d1d] border border-[#333] flex items-center justify-center text-[13px] font-black text-[#C5A059]">
                    {c.type === 'DEAL' ? '⇄' : c.targetPhysicalId}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-bold truncate">{candLabel(c)}</p>
                    <p className="text-[11px] text-gray-500">{candSub(c)}</p>
                  </div>
                  <div className="text-center shrink-0">
                    <p className="text-[#C5A059] text-lg font-black leading-none">{c.votes}</p>
                    <p className="text-[10px] text-gray-500">{c.votes !== c.people ? `${c.people} أشخاص` : 'صوت'}</p>
                  </div>
                </div>
                {(c.voters.length > 0 || c.unnamed > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {c.voters.map(v => chip(v, current))}
                    {c.unnamed > 0 && <span className="text-[11.5px] px-2 py-0.5 rounded-full border border-dashed border-[#2c2c2c] text-gray-500 bg-[#1a1a1a]">+{c.unnamed} بلا اسم</span>}
                  </div>
                )}
              </div>
            ))}
            {current.withdrawn?.length > 0 && <p className="text-[11px] text-gray-500">المشطوب سحب صوته أثناء التبرير.</p>}
          </>
        );
      })()}

      {view === 'person' && (
        <>
          <div className="grid grid-cols-4 gap-1.5">
            {people.map(([seat, name]) => (
              <button key={seat} type="button" onClick={() => setPerson(seat)}
                className={`py-1.5 px-1 rounded-lg text-[11px] border truncate ${person === seat ? 'border-[#C5A059] text-[#C5A059]' : 'border-[#2a2a2a] text-gray-300 bg-[#141414]'}`}>
                {seat} {name}
              </button>
            ))}
          </div>
          {person == null ? (
            <p className="text-center text-gray-500 text-xs py-4">اختر لاعباً لترى تصويته في كلّ جولة</p>
          ) : rounds.map(r => {
            let gave: string | null = null, flag = '';
            for (const c of r.candidates) for (const v of c.voters) if (v.voterPhysicalId === person) {
              gave = candLabel(c);
              flag = r.withdrawn?.includes(person) ? ' (سحب)' : v.via === 'auto' ? ' ⏰' : v.via === 'proxy' ? ' 🤝' : '';
            }
            const got = r.candidates.filter(c => c.targetPhysicalId === person || c.initiatorPhysicalId === person).flatMap(c => c.voters.map(v => v.name));
            return (
              <div key={r.id} className="rounded-xl border border-[#222] bg-[#111] px-3 py-2 text-[12.5px] leading-relaxed">
                <p className="text-[11px] text-gray-500">{roundLabel(r)}</p>
                <p className="text-gray-200">صوّت على <b className="text-[#C5A059] font-bold">{gave ?? '—'}{flag}</b></p>
                {got.length > 0 && <p className="text-gray-400">صوّت عليه: {got.join('، ')}</p>}
              </div>
            );
          })}
        </>
      )}

      {footerHint && <p className="text-center text-[11px] text-gray-600">{footerHint}</p>}
    </div>
  );
}

/** سجلّ اللعبة الجارية: يُجلب عند التفعيل ويتحدّث مع كلّ جولةٍ تُفرز (day:vote-history) */
export function useLiveVoteHistory(roomId: string | null | undefined, active: boolean, refreshKey?: unknown): VoteRound[] {
  const [rounds, setRounds] = useState<VoteRound[]>([]);
  useEffect(() => {
    if (!roomId) return;
    let off: (() => void) | null = null;
    let alive = true;
    (async () => {
      try {
        const { getSocket } = await import('@/lib/socket');
        const socket = getSocket();
        const onHist = (d: any) => { if (alive && Array.isArray(d?.history)) setRounds(d.history); };
        socket.on('day:vote-history', onHist);
        off = () => socket.off('day:vote-history', onHist);
        if (active) socket.emit('room:get-vote-history', { roomId }, (res: any) => {
          if (alive && res?.success && Array.isArray(res.history)) setRounds(res.history);
        });
      } catch { /* بلا سوكِت — يبقى فارغاً */ }
    })();
    return () => { alive = false; off?.(); };
  }, [roomId, active, refreshKey]);
  return rounds;
}

/** قسمٌ يُطوى — لشاشة المتفرّج: الجلبُ عند الفتح فقط */
export function CollapsibleVoteHistory({ roomId, myPhysicalId }: { roomId: string | null | undefined; myPhysicalId?: number | null }) {
  const [open, setOpen] = useState(false);
  const rounds = useLiveVoteHistory(roomId, open);
  if (!roomId) return null;
  return (
    <div className="mt-4 text-right" dir="rtl">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-[#C5A059]/30 bg-[#111] text-[#C5A059] text-sm font-bold">
        <span>🗳️ سجلّ التصويت{rounds.length ? ` (${rounds.length})` : ''}</span>
        <span className="text-gray-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="mt-3"><VoteHistoryPanel rounds={rounds} myPhysicalId={myPhysicalId} footerHint="الجولة الجارية تظهر بعد فرزها" /></div>}
    </div>
  );
}

/** سجلّ تصويت مباراةٍ منتهية — من سجلّ المباريات، يُجلب عند الضغط */
export function MatchVoteHistory({ playerId, matchId, headers }: { playerId: string | number; matchId: number; headers: Record<string, string> }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [rounds, setRounds] = useState<VoteRound[]>([]);
  const [mine, setMine] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const load = () => {
    setState('loading');
    fetch(`/api/player-app/${playerId}/matches/${matchId}/votes`, { headers })
      .then(r => r.json())
      .then(d => {
        if (!d?.success) { setErr(d?.error || 'تعذّر جلب السجلّ'); setState('error'); return; }
        setRounds(Array.isArray(d.rounds) ? d.rounds : []); setMine(d.myPhysicalId ?? null); setState('ready');
      })
      .catch(() => { setErr('خطأ في الاتصال بالخادم'); setState('error'); });
  };
  if (state === 'idle') {
    return (
      <button type="button" onClick={load}
        className="w-full py-3 rounded-2xl border border-[#C5A059]/30 bg-[#C5A059]/5 text-[#C5A059] text-sm font-bold">
        🗳️ سجلّ التصويت في هذه المباراة
      </button>
    );
  }
  if (state === 'loading') return <p className="text-center text-gray-500 text-xs py-4">جارِ التحميل…</p>;
  if (state === 'error') return <p className="text-center text-red-400 text-xs py-4">{err}</p>;
  return (
    <div className="rounded-2xl border border-white/10 p-3">
      <p className="text-white text-sm font-black mb-3">🗳️ سجلّ التصويت</p>
      <VoteHistoryPanel rounds={rounds} myPhysicalId={mine} />
    </div>
  );
}
