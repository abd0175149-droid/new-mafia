'use client';
// ══════════════════════════════════════════════════════
// 🏁 نهاية اللعبة — الفائز · الأدوار على الشبكة · ملخّص النقاط (+تعديلٌ يدويّ لكلّ صفّ)
// · استبعادٌ من اللعبة التالية · «ابدأ لعبة جديدة» ⇒ host.newGame(excluded)
// REST كما في page.tsx: GET /api/leader/match/:id/points · POST /api/leader/match-player/:id/adjust
// «إغلاق الفعاليّة» في منطقة الخطر بالهيكل — لا يتكرّر هنا.
// ══════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { useSeatMove } from '../../SeatMove';
import { ActionBar, BottomSheet, Btn, Hint, ListRow, Section, SeatGrid, SetRow, Status, Switch, roleName, seatCells, useCockpit } from '../kit';
import { useHost } from '../host';

const WINNER: Record<string, { icon: string; label: string; color: string }> = {
  MAFIA: { icon: '🩸', label: 'فوز المافيا', color: '#d0474c' },
  CITIZEN: { icon: '⚖️', label: 'فوز المدينة', color: '#63afd9' },
  JESTER: { icon: '🤡', label: 'فوز المهرّج', color: '#d9a23a' },
  ASSASSIN: { icon: '🔪', label: 'فوز السفّاح', color: '#d9a23a' },
};

const authHeaders = (json = false): Record<string, string> => {
  const h: Record<string, string> = { Authorization: `Bearer ${(typeof window !== 'undefined' && localStorage.getItem('leader_token')) || ''}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
};

export default function GameOverScreen() {
  const { gameState } = useCockpit();
  const host = useHost();
  const seatMove = useSeatMove();
  const players: any[] = gameState?.players || [];
  const [excluded, setExcluded] = useState<number[]>([]);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (seatMove.remapVersion) setExcluded([]); }, [seatMove.remapVersion]);

  const w = WINNER[gameState?.winner as string] || null;
  const next = players.filter(p => !p.seatHeld && !excluded.includes(p.physicalId)).length;
  const toggle = (id: number) => setExcluded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const cells = seatCells(gameState).filter(c => c.player);

  return (
    <>
      <Status meta={`${gameState?.round || 0} جولات${gameState?.config?.gameName ? ` · ${gameState.config.gameName}` : ''}`} />
      <div className="text-center px-2.5 pt-3.5 pb-3 rounded-[18px] border border-[#2a241c] flex flex-col items-center gap-1"
        style={{ background: `radial-gradient(circle at 50% 0, ${w ? w.color + '33' : 'rgba(197,160,89,.2)'}, transparent 70%), #0e0c0a` }}>
        <span className="text-[44px] leading-none">{w?.icon || '🏁'}</span>
        <b className="text-[30px] leading-tight" style={{ fontFamily: 'Amiri, serif', color: w?.color || '#C5A059' }}>{w?.label || 'انتهت اللعبة'}</b>
        <span className="text-[13px] text-[#9a8f7e]">{gameState?.round || 0} جولات · {players.filter(p => p.isAlive).length} أحياء في النهاية</span>
      </div>

      <Section title="الأدوار" aside={excluded.length ? `${excluded.length} مستبعد من التالية` : undefined}>
        <SeatGrid cells={cells} showRoles
          mark={(c) => excluded.includes(c.seat) ? { ghost: true, topRight: '✕' } : null} />
      </Section>

      <div className="grid grid-cols-2 gap-2">
        <Btn tone="line" onClick={() => setPointsOpen(true)}>📊 النقاط</Btn>
        <Btn onClick={() => setExcludeOpen(true)}>👥 استبعاد من التالية{excluded.length ? ` (${excluded.length})` : ''}</Btn>
      </div>
      <Hint>إغلاق الفعاليّة من ☰ ← منطقة الخطر.</Hint>

      <PointsSheet open={pointsOpen} onClose={() => setPointsOpen(false)} />

      <BottomSheet open={excludeOpen} title="استبعاد من اللعبة التالية" onClose={() => setExcludeOpen(false)}>
        <Hint>لا يُطرد من الغرفة — يجلس متفرّجاً اللعبة القادمة.</Hint>
        <div>
          {players.slice().sort((a, b) => a.physicalId - b.physicalId).map((p: any) => (
            <SetRow key={p.physicalId} title={`${p.physicalId} · ${p.name}`} sub={p.role ? roleName(p.role) : undefined}>
              <Switch label={`استبعاد ${p.name}`} checked={excluded.includes(p.physicalId)} onChange={() => toggle(p.physicalId)} />
            </SetRow>
          ))}
        </div>
        {excluded.length > 0 && <Btn onClick={() => setExcluded([])}>ألغِ الاستبعاد كلّه</Btn>}
      </BottomSheet>

      <ActionBar
        primary={{
          label: `ابدأ لعبة جديدة (${next})`, disabled: busy,
          sub: excluded.length ? `بدون ${excluded.length} لاعب` : undefined,
          onPress: async () => {
            if (busy) return;
            setBusy(true);
            try { await host.newGame(excluded); setExcluded([]); } finally { setBusy(false); }
          },
        }}
        secondary={{ label: '📊 النقاط', onPress: () => setPointsOpen(true) }} />
    </>
  );
}

// ══════════ 📊 ملخّص النقاط ══════════
function PointsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { gameState, toast } = useCockpit();
  const [rows, setRows] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const [rr, setRr] = useState('');
  const [xp, setXp] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const mid = gameState?.matchId;

  const load = async () => {
    if (!mid) { toast('لا يوجد معرّف للعبة الحاليّة', { tone: 'red' }); setRows(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/leader/match/${mid}/points`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setRows(data.players || []);
      else { toast(data.error || 'فشل جلب النقاط', { tone: 'red' }); setRows(null); }
    } catch (e: any) { toast(e?.message || 'فشل جلب النقاط', { tone: 'red' }); setRows(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (open) { setExpanded(null); load(); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, mid]);

  const submit = async () => {
    if (!edit) return;
    const xpN = Math.trunc(Number(xp) || 0), rrN = Math.trunc(Number(rr) || 0);
    if (!xpN && !rrN) { toast('أدخل تعديل RR أو XP', { tone: 'red' }); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/leader/match-player/${edit.matchPlayerId}/adjust`, {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify({ xpDelta: xpN, rrDelta: rrN, reason }),
      });
      const data = await res.json();
      if (data.success) { toast(`✓ عُدّلت نقاط ${edit.playerName}`); setEdit(null); setRr(''); setXp(''); setReason(''); await load(); }
      else toast(data.error || 'فشل التعديل', { tone: 'red' });
    } catch (e: any) { toast(e?.message || 'فشل التعديل', { tone: 'red' }); }
    finally { setSaving(false); }
  };

  const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;
  const input = 'w-full min-h-[46px] rounded-xl border border-[#2a241c] bg-[#16130f] px-3 text-[15px] text-[#efe8da] outline-none focus:border-[#C5A059]';

  return (
    <>
      <BottomSheet open={open && !edit} title="ملخّص النقاط" onClose={onClose}>
        {gameState?.cityName && <Hint>🏆 تُضاف إلى تصنيف {gameState.cityName}{gameState.seasonName ? ` — ${gameState.seasonName}` : ''}</Hint>}
        {loading && !rows ? <Hint className="text-center py-6">جارٍ التحميل…</Hint>
          : !rows || rows.length === 0 ? <Hint className="text-center py-6">لا توجد بيانات.</Hint>
          : rows.map((pl: any) => (
            <div key={pl.matchPlayerId} className="flex flex-col gap-1.5">
              <ListRow n={pl.physicalId} selected={expanded === pl.matchPlayerId}
                onClick={() => setExpanded(expanded === pl.matchPlayerId ? null : pl.matchPlayerId)}
                title={pl.playerName}
                sub={<span className="tabular-nums">كسب <span className="text-[#99dcba]">{pl.rrGained > 0 ? `+${pl.rrGained}` : 0}</span> · خسر <span className="text-[#f2a6a9]">{pl.rrLost < 0 ? pl.rrLost : 0}</span> · XP {pl.xpTotal ?? 0}</span>}
                right={<b className={`tabular-nums text-[16px] ${pl.rrTotal >= 0 ? 'text-[#99dcba]' : 'text-[#f2a6a9]'}`}>{signed(pl.rrTotal)}</b>} />
              {expanded === pl.matchPlayerId && (
                <div className="rounded-[13px] border border-[#1d1914] bg-[#0b0a08] p-2.5 flex flex-col gap-2 text-[13px]">
                  <div className="grid grid-cols-2 gap-3">
                    {[{ t: 'نقاط الرانك (RR)', l: pl.rrBreakdown }, { t: `الخبرة (XP) — ${pl.xpTotal ?? 0}`, l: pl.xpBreakdown }].map(col => (
                      <div key={col.t}>
                        <p className="m-0 mb-1 pb-1 border-b border-[#1d1914] font-bold text-[#9a8f7e] text-[12.5px]">{col.t}</p>
                        {!col.l || col.l.length === 0 ? <p className="m-0 text-[#9a8f7e]">—</p> : col.l.map((x: any, i: number) => (
                          <div key={i} className="flex justify-between gap-1 py-0.5"><span className="truncate">{x.icon} {x.label}</span><span className={`tabular-nums ${x.value >= 0 ? 'text-[#99dcba]' : 'text-[#f2a6a9]'}`}>{signed(x.value)}</span></div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <Btn tone="line" onClick={() => { setEdit(pl); setRr(''); setXp(''); setReason(''); }}>✏️ تعديل يدويّ</Btn>
                </div>
              )}
            </div>
          ))}
        <Hint>المس صفّاً لتفاصيله وتعديله يدويّاً.</Hint>
      </BottomSheet>

      <BottomSheet open={open && !!edit} title={edit ? `تعديل — ${edit.playerName}` : 'تعديل'} onClose={() => { if (!saving) setEdit(null); }}>
        <Hint>يُسجَّل تعديلاً يدويّاً لهذه اللعبة — الموجب يضيف والسالب يخصم.</Hint>
        <label className="text-[13px] text-[#9a8f7e]">تعديل نقاط الرانك RR (+/−)
          <input type="number" inputMode="numeric" dir="ltr" value={rr} onChange={(e) => setRr(e.target.value)} className={`${input} mt-1 tabular-nums`} />
        </label>
        <label className="text-[13px] text-[#9a8f7e]">تعديل الخبرة XP (+/−)
          <input type="number" inputMode="numeric" dir="ltr" value={xp} onChange={(e) => setXp(e.target.value)} className={`${input} mt-1 tabular-nums`} />
        </label>
        <label className="text-[13px] text-[#9a8f7e]">السبب (اختياريّ)
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب التعديل" className={`${input} mt-1`} />
        </label>
        <button type="button" disabled={saving || (!Math.trunc(Number(xp) || 0) && !Math.trunc(Number(rr) || 0))} onClick={submit}
          className="min-h-[50px] rounded-[13px] bg-[#C5A059] text-[#110d08] font-bold disabled:opacity-40">{saving ? '…' : 'احفظ التعديل'}</button>
        <Btn disabled={saving} onClick={() => setEdit(null)}>رجوع للملخّص</Btn>
      </BottomSheet>
    </>
  );
}
