'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Role, ROLE_NAMES, ROLE_ICONS } from '@/lib/constants';

interface LeaderRoleBindingProps {
  gameState: any;
  emit: (event: string, payload: any) => Promise<any>;
  setError: (err: string) => void;
}

// ══════════════════════════════════════════════════════
// تعديل جذري: واجهة DDL لتوزيع الأدوار
// كل دور يظهر كصف يحتوي على: أيقونة الدور + اسمه + DDL لاختيار اللاعب
// ══════════════════════════════════════════════════════

interface RoleSlot {
  id: string;
  role: Role;
  assignedPlayerId: number | null;
}

export default function LeaderRoleBinding({ gameState, emit, setError }: LeaderRoleBindingProps) {
  const [roleSlots, setRoleSlots] = useState<RoleSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [randomLoading, setRandomLoading] = useState(false);
  const [randomDone, setRandomDone] = useState(false);
  const [rolesConfirmed, setRolesConfirmed] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // ── تهيئة الأدوار من rolesPool ──
  useEffect(() => {
    if (!gameState?.rolesPool) return;

    const pool: Role[] = [...gameState.rolesPool];
    let idCounter = 0;

    // بناء قائمة الأدوار مع الربط الموجود مسبقاً
    const slots: RoleSlot[] = [];
    const usedRoles: Role[] = [];

    // أولاً: الأدوار المربوطة مسبقاً
    gameState.players.forEach((p: any) => {
      if (p.role) {
        const roleIdx = pool.indexOf(p.role);
        if (roleIdx !== -1) {
          slots.push({
            id: `role-${idCounter++}`,
            role: p.role,
            assignedPlayerId: p.physicalId,
          });
          pool.splice(roleIdx, 1);
          usedRoles.push(p.role);
        }
      }
    });

    // ثانياً: الأدوار غير المربوطة
    pool.forEach(role => {
      slots.push({
        id: `role-${idCounter++}`,
        role,
        assignedPlayerId: null,
      });
    });

    setRoleSlots(slots);
  }, [gameState?.rolesPool]);

  // ── اللاعبين المربوطين (لفلترة DDL) ──
  const assignedPlayerIds = useMemo(() => {
    return new Set(roleSlots.filter(s => s.assignedPlayerId !== null).map(s => s.assignedPlayerId!));
  }, [roleSlots]);

  // ── تغيير اختيار اللاعب في DDL ──
  const handleAssign = async (slotId: string, newPlayerId: number | null, oldPlayerId: number | null) => {
    // عند تغيير أي دور، يتم إلغاء التأكيد
    setRolesConfirmed(false);

    // تحديث محلي فوري
    setRoleSlots(prev =>
      prev.map(s => (s.id === slotId ? { ...s, assignedPlayerId: newPlayerId } : s))
    );

    const slot = roleSlots.find(s => s.id === slotId);
    if (!slot) return;

    try {
      // إلغاء ربط اللاعب القديم (إن وجد)
      if (oldPlayerId !== null) {
        await emit('setup:unbind-role', {
          roomId: gameState.roomId,
          physicalId: oldPlayerId,
        });
      }

      // ربط اللاعب الجديد (إن تم اختياره)
      if (newPlayerId !== null) {
        await emit('setup:bind-role', {
          roomId: gameState.roomId,
          physicalId: newPlayerId,
          role: slot.role,
        });
      }
    } catch (err: any) {
      // إرجاع الحالة عند الفشل
      setRoleSlots(prev =>
        prev.map(s => (s.id === slotId ? { ...s, assignedPlayerId: oldPlayerId } : s))
      );
      setError(err.message);
    }
  };

  // ── توزيع عشوائي كامل ──
  const handleRandomAssign = async () => {
    setRandomLoading(true);
    setError('');
    try {
      const res = await emit('setup:random-assign', { roomId: gameState.roomId });
      if (res.state) {
        // تحديث roleSlots من الحالة المُرجعة
        const pool: Role[] = [...(res.state.rolesPool || [])];
        let idCounter = 0;
        const newSlots: RoleSlot[] = [];
        for (const p of res.state.players) {
          if (p.role) {
            const roleIdx = pool.indexOf(p.role);
            if (roleIdx !== -1) {
              newSlots.push({ id: `role-${idCounter++}`, role: p.role, assignedPlayerId: p.physicalId });
              pool.splice(roleIdx, 1);
            }
          }
        }
        pool.forEach(role => {
          newSlots.push({ id: `role-${idCounter++}`, role, assignedPlayerId: null });
        });
        setRoleSlots(newSlots);
        setRandomDone(true);
        setRolesConfirmed(false); // التوزيع العشوائي يلغي التأكيد السابق
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRandomLoading(false);
    }
  };

  // ── تأكيد الأدوار وإرسالها للاعبين ──
  const handleConfirmRoles = async () => {
    const essentialUnassigned = roleSlots.filter(
      s => s.role !== Role.CITIZEN && s.assignedPlayerId === null
    );
    if (essentialUnassigned.length > 0) {
      setError('يجب توزيع جميع الأدوار الخاصة قبل التأكيد');
      return;
    }
    setConfirmLoading(true);
    setError('');
    try {
      await emit('setup:confirm-roles', { roomId: gameState.roomId });
      setRolesConfirmed(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setConfirmLoading(false);
    }
  };

  // ── بدء اللعبة (يشترط تأكيد الأدوار) ──
  const handleStartGame = async () => {
    if (!rolesConfirmed) {
      setError('يجب تأكيد الأدوار أولاً قبل بدء اللعبة');
      return;
    }
    setLoading(true);
    try {
      await emit('setup:binding-complete', { roomId: gameState.roomId });
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  // ── فصل الأدوار الخاصة عن المواطنين ──
  const specialRoles = roleSlots.filter(s => s.role !== Role.CITIZEN);
  const citizenRoles = roleSlots.filter(s => s.role === Role.CITIZEN);
  const unassignedSpecial = specialRoles.filter(s => s.assignedPlayerId === null);

  const isMafiaRole = (role: Role) =>
    [Role.GODFATHER, Role.SILENCER, Role.CHAMELEON, Role.MAFIA_REGULAR].includes(role);

  const alivePlayers = (gameState.players || [])
    .filter((p: any) => p.isAlive !== false)
    .sort((a: any, b: any) => a.physicalId - b.physicalId);

  return (
    <div className="mb-10 w-full max-w-2xl mx-auto">
      {/* ═══ Header ═══ */}
      <div className="bg-black/30 border border-[#2a2a2a] rounded-xl p-6 mb-6 backdrop-blur-sm relative overflow-hidden text-center">
        <div className="absolute left-0 top-0 w-1 h-full bg-[#C5A059]/40" />
        <h2 className="text-2xl font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>
          توزيع الأدوار والسِّريّة
        </h2>
        <p className="text-[#808080] font-mono tracking-[0.3em] mt-2 uppercase text-[10px]">
          SELECT A PLAYER FOR EACH ROLE FROM THE DROPDOWN
        </p>
      </div>

      {/* ═══ Special Roles (Mafia + Citizen Specials) ═══ */}
      {specialRoles.length > 0 && (
        <div className="bg-black/40 border border-[#8A0303]/30 rounded-xl mb-4 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
            <h3 className="text-[10px] font-mono text-[#C5A059] uppercase tracking-[0.2em] font-bold">
              ACTION ROLES ({specialRoles.length - unassignedSpecial.length}/{specialRoles.length})
            </h3>
            {unassignedSpecial.length > 0 && (
              <span className="text-[#8A0303] text-[9px] font-mono uppercase tracking-widest animate-pulse">
                {unassignedSpecial.length} UNASSIGNED
              </span>
            )}
          </div>

          <div className="divide-y divide-[#1a1a1a]">
            {specialRoles.map((slot) => (
              <RoleRow
                key={slot.id}
                slot={slot}
                players={alivePlayers}
                assignedPlayerIds={assignedPlayerIds}
                isMafia={isMafiaRole(slot.role)}
                onAssign={(newPlayerId) =>
                  handleAssign(slot.id, newPlayerId, slot.assignedPlayerId)
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* ═══ Citizen Roles ═══ */}
      {citizenRoles.length > 0 && (
        <div className="bg-black/40 border border-[#2a2a2a] rounded-xl mb-6 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-[#2a2a2a]">
            <h3 className="text-[10px] font-mono text-[#808080] uppercase tracking-[0.2em] font-bold">
              CITIZENS ({citizenRoles.filter(s => s.assignedPlayerId !== null).length}/{citizenRoles.length})
            </h3>
            <p className="text-[9px] font-mono text-[#555] mt-1">
              يتم توزيعهم تلقائياً على اللاعبين المتبقيين
            </p>
          </div>

          <div className="divide-y divide-[#111]">
            {citizenRoles.map((slot) => (
              <RoleRow
                key={slot.id}
                slot={slot}
                players={alivePlayers}
                assignedPlayerIds={assignedPlayerIds}
                isMafia={false}
                onAssign={(newPlayerId) =>
                  handleAssign(slot.id, newPlayerId, slot.assignedPlayerId)
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* ═══ Random Assign + Confirm + Start Buttons ═══ */}
      <div className="text-center mb-10 space-y-4">
        {/* زر التوزيع العشوائي */}
        <button
          onClick={handleRandomAssign}
          disabled={randomLoading || loading || confirmLoading}
          className="w-full py-4 rounded-xl font-mono text-sm uppercase tracking-[0.2em] font-bold transition-all duration-300 border-2 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: randomDone
              ? 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(16,185,129,0.1))'
              : 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.1))',
            borderColor: randomDone ? 'rgba(34,197,94,0.5)' : 'rgba(139,92,246,0.4)',
            color: randomDone ? '#4ade80' : '#a78bfa',
          }}
        >
          {randomLoading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              جارِ التوزيع...
            </span>
          ) : randomDone ? (
            <span>✅ تم التوزيع العشوائي — اضغط مجدداً لإعادة الخلط</span>
          ) : (
            <span>🎲 توزيع عشوائي للأدوار</span>
          )}
        </button>

        {/* زر تأكيد الأدوار */}
        <button
          onClick={handleConfirmRoles}
          disabled={unassignedSpecial.length > 0 || confirmLoading || loading || rolesConfirmed}
          className="w-full py-4 rounded-xl font-mono text-sm uppercase tracking-[0.2em] font-bold transition-all duration-300 border-2 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: rolesConfirmed
              ? 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(16,185,129,0.15))'
              : 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.1))',
            borderColor: rolesConfirmed ? 'rgba(34,197,94,0.6)' : 'rgba(251,191,36,0.5)',
            color: rolesConfirmed ? '#4ade80' : '#fbbf24',
          }}
        >
          {confirmLoading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              جارِ الإرسال...
            </span>
          ) : rolesConfirmed ? (
            <span>✅ تم تأكيد الأدوار وإرسالها للاعبين</span>
          ) : (
            <span>📨 تأكيد الأدوار — إرسال للاعبين</span>
          )}
        </button>

        {rolesConfirmed && (
          <p className="text-emerald-500/70 text-[10px] font-mono uppercase tracking-[0.2em]">
            ROLES CONFIRMED & SENT TO ALL PLAYER DEVICES
          </p>
        )}

        {!rolesConfirmed && unassignedSpecial.length === 0 && (randomDone || roleSlots.some(s => s.assignedPlayerId !== null)) && (
          <p className="text-amber-500/70 text-[10px] font-mono uppercase tracking-[0.2em] animate-pulse">
            ⚠️ يجب تأكيد الأدوار قبل بدء اللعبة
          </p>
        )}

        {/* زر بدء اللعبة — يشترط تأكيد الأدوار */}
        <button
          onClick={handleStartGame}
          disabled={!rolesConfirmed || loading}
          className="btn-premium px-12 py-4 w-full disabled:opacity-50 disabled:grayscale transition-all"
        >
          <span className="text-white">
            {loading ? 'INITIALIZING...' : 'LOCK IDENTITIES & COMMENCE DAY'}
          </span>
        </button>
        {unassignedSpecial.length > 0 && (
          <p className="text-[#8A0303] text-[10px] font-mono mt-3 uppercase tracking-[0.2em] animate-pulse">
            WARNING: {unassignedSpecial.length} ACTION ROLES UNASSIGNED
          </p>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// صف الدور — أيقونة + اسم + DDL
// ══════════════════════════════════════════════════════
function RoleRow({
  slot,
  players,
  assignedPlayerIds,
  isMafia,
  onAssign,
}: {
  slot: RoleSlot;
  players: any[];
  assignedPlayerIds: Set<number>;
  isMafia: boolean;
  onAssign: (playerId: number | null) => void;
}) {
  const isAssigned = slot.assignedPlayerId !== null;
  const assignedPlayer = isAssigned
    ? players.find((p: any) => p.physicalId === slot.assignedPlayerId)
    : null;

  return (
    <motion.div
      layout
      className={`flex items-center gap-3 px-5 py-3 transition-colors ${
        isAssigned
          ? isMafia
            ? 'bg-[#0f0505]/50'
            : 'bg-[#050505]/50'
          : 'bg-transparent'
      }`}
    >
      {/* أيقونة الدور */}
      <div
        className={`w-10 h-10 flex items-center justify-center rounded-lg border shrink-0 ${
          isMafia
            ? 'border-[#8A0303]/60 bg-[#0f0505]'
            : 'border-[#2a2a2a] bg-[#050505]'
        }`}
      >
        <span className="grayscale text-lg">{ROLE_ICONS[slot.role]}</span>
      </div>

      {/* اسم الدور */}
      <div className="flex-1 min-w-0">
        <span
          className={`font-mono text-xs uppercase tracking-widest ${
            isMafia ? 'text-[#ff4444]' : 'text-white'
          }`}
        >
          {ROLE_NAMES[slot.role]}
        </span>
      </div>

      {/* DDL اختيار اللاعب */}
      <div className="shrink-0 w-[180px]">
        <select
          value={slot.assignedPlayerId ?? ''}
          onChange={(e) => {
            const val = e.target.value;
            onAssign(val === '' ? null : Number(val));
          }}
          className={`w-full px-3 py-2.5 rounded-lg border font-mono text-sm text-right appearance-none cursor-pointer transition-all focus:outline-none focus:border-[#C5A059] ${
            isAssigned
              ? isMafia
                ? 'bg-[#1a0808] border-[#8A0303]/50 text-white'
                : 'bg-[#0a0a0a] border-[#C5A059]/40 text-white'
              : 'bg-[#050505] border-[#2a2a2a] text-[#555]'
          }`}
          dir="rtl"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23808080' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'left 10px center',
            paddingLeft: '30px',
          }}
        >
          <option value="">— اختر لاعب —</option>
          {players.map((p: any) => {
            const isTaken = assignedPlayerIds.has(p.physicalId) && p.physicalId !== slot.assignedPlayerId;
            return (
              <option
                key={p.physicalId}
                value={p.physicalId}
                disabled={isTaken}
              >
                #{p.physicalId} — {p.name} {isTaken ? '(مربوط)' : ''}
              </option>
            );
          })}
        </select>
      </div>
    </motion.div>
  );
}
