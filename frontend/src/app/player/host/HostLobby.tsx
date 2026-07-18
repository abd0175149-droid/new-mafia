'use client';

// ══════════════════════════════════════════════════════
// 🚪 HostLobby — لوبي المضيف على الهاتف: روستر مضغوط + تحكّم بالسعة + بدء التوزيع.
// أزرار الإجراء (طرد/عقوبة) باللمس لا بالتمرير (hover). يبثّ نفس أحداث LeaderLobbyView.
// إعدادات الغرفة تُضبط قبل الإنشاء (مخفيّة هنا). الحدّ الأدنى للبدء = 6.
// ══════════════════════════════════════════════════════

import { useState } from 'react';
import HostSettingsModal from './HostSettingsModal';

const MIN_PLAYERS = 6;

interface Props {
  gameState: any;
  emit: (event: string, payload: any) => Promise<any>;
  setError: (s: string) => void;
}

export default function HostLobby({ gameState, emit, setError }: Props) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirmKick, setConfirmKick] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const players = (gameState.players || []).filter((p: any) => !p.seatHeld).sort((a: any, b: any) => a.physicalId - b.physicalId);
  const held = (gameState.players || []).filter((p: any) => p.seatHeld === true);
  const maxPlayers = gameState.config?.maxPlayers || 12;
  const maxP = gameState.config?.maxPenalties || 3;
  const canStart = players.length >= MIN_PLAYERS;

  const run = async (fn: () => Promise<any>) => { setBusy(true); try { await fn(); } catch (e: any) { setError(e?.message || 'تعذّر'); } finally { setBusy(false); } };
  const setMax = (m: number) => run(() => emit('room:update-max-players', { roomId: gameState.roomId, maxPlayers: Math.max(MIN_PLAYERS, Math.min(50, m)) }));

  return (
    <div className="px-3 pb-6">
      {/* زرّ إعدادات اللعبة */}
      <button onClick={() => setShowSettings(true)}
        className="w-full mb-3 py-2.5 rounded-xl border border-[#C5A059]/40 bg-[#C5A059]/10 text-[#C5A059] text-sm font-bold flex items-center justify-center gap-2">
        ⚙️ إعدادات اللعبة
      </button>

      {/* سعة الغرفة */}
      <div className="flex items-center justify-between rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] px-3 py-2.5 mb-3">
        <span className="text-xs text-[#b3b3b3]">اللاعبون <span className="font-mono font-bold text-[#C5A059]">{players.length}</span> / {maxPlayers}</span>
        <div className="flex items-center bg-[#050505] border border-[#222] rounded-lg">
          <button onClick={() => setMax(maxPlayers - 1)} disabled={busy} className="px-3 py-1.5 text-[#888]">−</button>
          <span className="px-2 font-mono text-white text-sm">{maxPlayers}</span>
          <button onClick={() => setMax(maxPlayers + 1)} disabled={busy} className="px-3 py-1.5 text-[#888]">+</button>
        </div>
      </div>

      {/* الروستر */}
      {players.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#2a2a2a] bg-[#0a0a0a] py-10 px-4 text-center">
          <div className="text-3xl">🎴</div>
          <div className="text-sm text-[#b3a985] mt-2" style={{ fontFamily: 'Amiri, serif' }}>بانتظار انضمام اللاعبين…</div>
          <div className="text-[11px] text-[#9a9a9a] mt-1.5">شارك رمز الغرفة أو استخدم زر الدعوة لجلب أصدقائك</div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {players.map((p: any) => {
            const open = openId === p.physicalId;
            const fallback = p.gender === 'FEMALE' ? '👩' : '👨';
            return (
              <div key={p.physicalId} className="rounded-xl border border-[#1a1a1a] bg-gradient-to-b from-[#0d0d0e] to-[#0a0a0a] overflow-hidden">
                <button onClick={() => setOpenId(open ? null : p.physicalId)} className="w-full flex items-center gap-2.5 px-2.5 py-2 text-right">
                  <span className="w-9 h-9 rounded-full bg-gradient-to-b from-[#221e18] to-[#131110] border border-[#2a2a2a] flex items-center justify-center text-base overflow-hidden shrink-0">
                    {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" /> : fallback}
                  </span>
                  <span className="font-mono text-[11px] text-[#C5A059] w-7 shrink-0">#{p.physicalId}</span>
                  <span className="flex-1 text-sm text-white/90 truncate text-right">{p.name}</span>
                  {(p.penalties || 0) > 0 && (
                    <span className="flex gap-0.5 shrink-0">
                      {Array.from({ length: maxP }).map((_, i) => (
                        <span key={i} className={`w-1.5 h-1.5 rounded-full ${i < p.penalties ? 'bg-red-500' : 'bg-zinc-700'}`} />
                      ))}
                    </span>
                  )}
                  <span className="text-[#555] text-xs shrink-0">{open ? '▴' : '▾'}</span>
                </button>
                {open && (
                  <div className="flex gap-2 px-2.5 pb-2.5 pt-1">
                    <button onClick={() => run(() => emit('leader:record-penalty', { roomId: gameState.roomId, targetPhysicalId: p.physicalId }).then(() => setOpenId(null)))}
                      className="flex-1 py-2 rounded-lg text-xs font-bold border border-amber-500/40 text-amber-300 bg-amber-950/20">⚠️ عقوبة</button>
                    <button onClick={() => setConfirmKick(p.physicalId)}
                      className="flex-1 py-2 rounded-lg text-xs font-bold border border-red-700/50 text-red-300 bg-red-950/20">✕ طرد</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* مقاعد محجوزة */}
      {held.length > 0 && (
        <div className="mt-3 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-2.5">
          <div className="text-[10px] font-mono text-[#808080] mb-1.5">مقاعد محجوزة ({held.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {held.map((p: any) => (
              <button key={p.physicalId} onClick={() => run(() => emit('room:release-held-seat', { roomId: gameState.roomId, physicalId: p.physicalId }))}
                className="text-[11px] font-mono text-[#aaa] border border-[#333] rounded-md px-2 py-1">#{p.physicalId} {p.name} ✕</button>
            ))}
          </div>
        </div>
      )}

      {/* بدء التوزيع */}
      <div className="mt-4">
        {canStart ? (
          <button disabled={busy} onClick={() => run(() => emit('room:start-generation', { roomId: gameState.roomId }))}
            className="w-full py-3.5 rounded-xl font-black text-base text-black bg-gradient-to-b from-[#C5A059] to-[#8a6d3b] disabled:opacity-40"
            style={{ boxShadow: '0 0 18px rgba(197,160,89,0.4)' }}>🎴 بدء توزيع الأدوار</button>
        ) : (
          <button disabled
            className="w-full py-3.5 rounded-xl font-bold text-sm bg-[#0c0c0c] border border-[#2a2a2a] text-[#C5A059]/50">
            🎴 بدء التوزيع — {players.length}/{MIN_PLAYERS} لاعبين
          </button>
        )}
      </div>

      {/* تأكيد الطرد */}
      {confirmKick !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/80 backdrop-blur-sm" onClick={() => setConfirmKick(null)}>
          <div className="w-full max-w-xs rounded-2xl border border-red-800/50 bg-[#0a0a0a] p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-3xl mb-2">✕</div>
            <div className="text-white font-bold mb-4">طرد {players.find((p: any) => p.physicalId === confirmKick)?.name}؟</div>
            <div className="flex gap-2">
              <button onClick={() => { const id = confirmKick; setConfirmKick(null); setOpenId(null); run(() => emit('room:kick-player', { roomId: gameState.roomId, physicalId: id })); }}
                className="flex-1 py-2.5 rounded-lg bg-red-900/40 border border-red-700 text-red-200 font-bold">تأكيد الطرد</button>
              <button onClick={() => setConfirmKick(null)} className="flex-1 py-2.5 rounded-lg border border-[#333] text-[#aaa]">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* مودال إعدادات اللعبة */}
      {showSettings && (
        <HostSettingsModal gameState={gameState} emit={emit} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
