'use client';

// ══════════════════════════════════════════════════════
// 🎭 HostRoleBinding — ربط الأدوار للمضيف على الهاتف.
// نفس منطق LeaderRoleBinding (roleSlots + نفس الأحداث) بتخطيط هاتفيّ:
// صفوف مضغوطة بقائمة كاملة العرض + قفل، ملخّص المواطنين، ثم توزيع عشوائيّ/تأكيد/بدء.
// أُثبِت عدائياً قبل النشر لأنّ تعيين الأدوار حرجٌ على اللعبة.
// ══════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useRef } from 'react';
import { ROLE_NAMES, ROLE_ICONS, MAFIA_ROLES } from '@/lib/constants';

interface RoleSlot { id: string; role: string; assignedPlayerId: number | null; isLocked?: boolean; }
interface Props {
  gameState: any;
  emit: (event: string, payload: any) => Promise<any>;
  setError: (s: string) => void;
}

export default function HostRoleBinding({ gameState, emit, setError }: Props) {
  const [roleSlots, setRoleSlots] = useState<RoleSlot[]>([]);
  const [rolesConfirmed, setRolesConfirmed] = useState(false);
  const [randomLoading, setRandomLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allowMafiaReveal, setAllowMafiaReveal] = useState(gameState?.config?.allowMafiaReveal !== false);

  // تهيئة الأدوار من rolesPool — مرّةً واحدة لكل تغيّر في *محتوى* المجموعة، لا مع كل استطلاع دوريّ.
  // (الاستطلاع كل 2.5ث يعيد هويّة مصفوفة rolesPool عبر JSON.parse؛ التهيئة على الهويّة كانت تمسح
  //  الأقفال/التعيينات الجارية للمضيف — نفس صنف باگ إعادة-التهيئة بالاستطلاع.)
  const poolInitRef = useRef<string | null>(null);
  useEffect(() => {
    if (!gameState?.rolesPool) return;
    const sig = JSON.stringify(gameState.rolesPool);
    if (poolInitRef.current === sig) return;
    poolInitRef.current = sig;
    const pool: string[] = [...gameState.rolesPool];
    let idc = 0;
    const slots: RoleSlot[] = [];
    gameState.players.forEach((p: any) => {
      if (p.role) {
        const idx = pool.indexOf(p.role);
        if (idx !== -1) { slots.push({ id: `role-${idc++}`, role: p.role, assignedPlayerId: p.physicalId, isLocked: true }); pool.splice(idx, 1); }
      }
    });
    pool.forEach((role) => slots.push({ id: `role-${idc++}`, role, assignedPlayerId: null, isLocked: false }));
    setRoleSlots(slots);
  }, [gameState?.rolesPool]);

  const assignedIds = useMemo(() => new Set(roleSlots.filter((s) => s.assignedPlayerId !== null).map((s) => s.assignedPlayerId!)), [roleSlots]);
  const specials = roleSlots.filter((s) => s.role !== 'CITIZEN');
  const citizens = roleSlots.filter((s) => s.role === 'CITIZEN');
  const unassignedSpecial = specials.filter((s) => s.assignedPlayerId === null);
  const alive = (gameState.players || []).filter((p: any) => p.isAlive !== false);

  const handleAssign = async (slotId: string, newPid: number | null, oldPid: number | null) => {
    setRolesConfirmed(false);
    const slot = roleSlots.find((s) => s.id === slotId);
    setRoleSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, assignedPlayerId: newPid, isLocked: newPid !== null } : s)));
    if (!slot) return;
    try {
      if (oldPid !== null) await emit('setup:unbind-role', { roomId: gameState.roomId, physicalId: oldPid });
      if (newPid !== null) await emit('setup:bind-role', { roomId: gameState.roomId, physicalId: newPid, role: slot.role });
    } catch (e: any) {
      setError(e?.message || 'تعذّر');
      // فشل الربط → أرجِع الخانة لحالتها السابقة (كما LeaderRoleBinding) بدل بقاء تعيين وهميّ
      setRoleSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, assignedPlayerId: oldPid, isLocked: oldPid !== null } : s)));
    }
  };
  const toggleLock = (slotId: string) => setRoleSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, isLocked: !s.isLocked } : s)));

  const handleRandom = async () => {
    setRandomLoading(true); setError('');
    const lockedPhysicalIds = roleSlots.filter((s) => s.isLocked && s.assignedPlayerId !== null).map((s) => s.assignedPlayerId!);
    try {
      const res = await emit('setup:random-assign', { roomId: gameState.roomId, lockedPhysicalIds });
      if (res?.state) {
        const pool: string[] = [...(res.state.rolesPool || [])];
        let idc = 0; const ns: RoleSlot[] = [];
        for (const p of res.state.players) {
          if (p.role) { const idx = pool.indexOf(p.role); if (idx !== -1) { const wl = roleSlots.some((s) => s.assignedPlayerId === p.physicalId && s.isLocked); ns.push({ id: `role-${idc++}`, role: p.role, assignedPlayerId: p.physicalId, isLocked: wl }); pool.splice(idx, 1); } }
        }
        pool.forEach((role) => ns.push({ id: `role-${idc++}`, role, assignedPlayerId: null, isLocked: false }));
        setRoleSlots(ns); setRolesConfirmed(false);
      }
    } catch (e: any) { setError(e?.message || 'تعذّر'); } finally { setRandomLoading(false); }
  };

  const handleConfirm = async () => {
    if (unassignedSpecial.length > 0) { setError('يجب توزيع جميع الأدوار الخاصة قبل التأكيد'); return; }
    setConfirmLoading(true); setError('');
    try { await emit('setup:confirm-roles', { roomId: gameState.roomId }); setRolesConfirmed(true); }
    catch (e: any) { setError(e?.message || 'تعذّر'); } finally { setConfirmLoading(false); }
  };
  const handleStart = async () => {
    if (!rolesConfirmed) { setError('أكّد الأدوار أولاً'); return; }
    setLoading(true);
    try { await emit('setup:binding-complete', { roomId: gameState.roomId }); }
    catch (e: any) { setError(e?.message || 'تعذّر'); setLoading(false); }
  };

  const nameOf = (pid: number | null) => (pid == null ? '' : gameState.players.find((p: any) => p.physicalId === pid)?.name || `#${pid}`);
  const busy = randomLoading || confirmLoading || loading;

  return (
    <div className="px-3 pb-6">
      {/* ملخّص التوزيع */}
      <div className="flex items-center justify-around rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] py-2 mb-3 text-center">
        <div><div className="font-mono font-bold text-white text-sm">{roleSlots.length}</div><div className="text-[10px] text-[#9a9a9a]">أدوار</div></div>
        <div><div className="font-mono font-bold text-emerald-400 text-sm">{specials.length - unassignedSpecial.length}/{specials.length}</div><div className="text-[10px] text-[#9a9a9a]">خاصّة</div></div>
        <div><div className="font-mono font-bold text-[#C5A059] text-sm">{citizens.length}</div><div className="text-[10px] text-[#9a9a9a]">مواطن</div></div>
      </div>

      {/* الأدوار الخاصّة */}
      <div className="text-[10px] font-mono text-[#808080] uppercase tracking-wider mb-1.5">الأدوار الخاصّة — وزّعها كلها</div>
      <div className="space-y-1.5 mb-4">
        {specials.map((s) => {
          const isMafia = (MAFIA_ROLES as string[]).includes(s.role);
          const avail = alive.filter((p: any) => !assignedIds.has(p.physicalId) || p.physicalId === s.assignedPlayerId);
          return (
            <div key={s.id} className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${s.assignedPlayerId != null ? (isMafia ? 'border-[#8A0303]/30 bg-[#8A0303]/5' : 'border-[#265e33]/30 bg-[#0d1a0d]') : 'border-[#2a2a2a] bg-[#0a0a0a]'}`}>
              <span className="text-lg shrink-0">{(ROLE_ICONS as Record<string, string>)[s.role] || '🎭'}</span>
              <div className="shrink-0 min-w-[70px]">
                <div className={`text-[11px] font-bold ${isMafia ? 'text-[#e08a8a]' : 'text-[#8fc3ea]'}`}>{(ROLE_NAMES as Record<string, string>)[s.role] || s.role}</div>
              </div>
              <select value={s.assignedPlayerId ?? ''} disabled={busy}
                onChange={(e) => handleAssign(s.id, e.target.value ? Number(e.target.value) : null, s.assignedPlayerId)}
                className="flex-1 min-w-0 bg-[#050505] border border-[#2a2a2a] text-white text-[12px] rounded-lg px-2 py-1.5 focus:border-[#C5A059] outline-none">
                <option value="">— اختر لاعب —</option>
                {avail.map((p: any) => <option key={p.physicalId} value={p.physicalId}>#{p.physicalId} {p.name}</option>)}
              </select>
              {s.assignedPlayerId != null && (
                <button onClick={() => toggleLock(s.id)} className={`shrink-0 w-7 h-7 rounded-lg text-xs ${s.isLocked ? 'bg-[#C5A059]/15 text-[#C5A059] border border-[#C5A059]/40' : 'text-zinc-500 border border-[#2a2a2a]'}`}>{s.isLocked ? '🔒' : '🔓'}</button>
              )}
            </div>
          );
        })}
      </div>

      {/* المواطنون (يُوزَّعون تلقائياً عند البدء) */}
      {citizens.length > 0 && (
        <div className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-2.5 mb-4">
          <div className="text-[10px] font-mono text-[#808080] mb-1">👤 المواطنون ({citizens.length}) — يُوزَّعون تلقائياً على الباقين</div>
          <div className="flex flex-wrap gap-1">
            {citizens.map((s, i) => <span key={i} className="text-[10px] font-mono text-[#aaa] bg-[#0c0c0c] border border-[#222] rounded px-1.5 py-0.5">{s.assignedPlayerId != null ? nameOf(s.assignedPlayerId) : '—'}</span>)}
          </div>
        </div>
      )}

      {/* كشف المافيا لبعضهم */}
      <button onClick={() => { const v = !allowMafiaReveal; setAllowMafiaReveal(v); emit('room:update-mafia-reveal', { roomId: gameState.roomId, allowMafiaReveal: v }).catch(() => {}); }}
        className="w-full flex items-center justify-between rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] px-3 py-2.5 mb-3 text-xs text-[#b3b3b3]">
        🎭 المافيا تعرف بعضها
        <span className={`w-9 h-5 rounded-full relative transition-colors ${allowMafiaReveal ? 'bg-[#C5A059]' : 'bg-[#333]'}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${allowMafiaReveal ? 'end-0.5' : 'start-0.5'}`} /></span>
      </button>

      {/* أزرار */}
      <div className="space-y-2">
        <button onClick={handleRandom} disabled={busy} className="w-full py-3 rounded-xl border border-[#2a2a2a] bg-[#0e0e10] text-[#C5A059] font-bold text-sm disabled:opacity-40">🎲 توزيع عشوائيّ للباقي</button>
        <button onClick={handleConfirm} disabled={busy || unassignedSpecial.length > 0 || rolesConfirmed}
          className={`w-full py-3 rounded-xl font-bold text-sm border ${rolesConfirmed ? 'border-emerald-600/50 text-emerald-300 bg-emerald-900/10' : 'border-[#C5A059]/50 text-[#C5A059] bg-[#C5A059]/5'} disabled:opacity-40`}>
          {rolesConfirmed ? '✅ تمّ التأكيد والإرسال للاعبين' : '📨 تأكيد الأدوار وإرسالها'}
        </button>
        <button onClick={handleStart} disabled={!rolesConfirmed || loading} className="btn-premium w-full !py-3.5 !rounded-xl disabled:opacity-40"><span>🔒 قفل الهويّات وبدء اللعبة</span></button>
        {unassignedSpecial.length > 0 && <p className="text-center text-amber-400/80 font-mono text-[10px]">تبقّى {unassignedSpecial.length} دور خاصّ بلا توزيع</p>}
      </div>
    </div>
  );
}
