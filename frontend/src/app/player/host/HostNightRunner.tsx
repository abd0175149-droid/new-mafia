'use client';

// ══════════════════════════════════════════════════════
// 🌙 مُشغّل الليل للمُضيف — يعيد إنتاج لوحة تحكّم الليل الأوتوماتيكيّ (بحالتها ومستمعاتها)
// المنسوخة من صفحة الليدر الأمّ، ويعرض LeaderNightView لكشف أحداث الصباح.
// مستقلٌّ تماماً — لا يمسّ صفحة الموظّفين.
// ══════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import LeaderNightView from '@/app/leader/LeaderNightView';
import HostMorningRecap from './HostMorningRecap';

interface HostNightRunnerProps {
  gameState: any;
  emit: (event: string, payload: any) => Promise<any>;
  on: (event: string, handler: (...args: any[]) => void) => (() => void);
  setError: (err: string) => void;
  readOnlyChoices?: boolean; // 🌐 للغرف البعيدة: المُضيف لا يعدّل اختيارات اللاعبين (اعتمادٌ فقط)
}

export default function HostNightRunner({ gameState, emit, on, setError, readOnlyChoices }: HostNightRunnerProps) {
  const [autoNightProgress, setAutoNightProgress] = useState<{ total: number; submitted: number; missingPlayers?: { physicalId: number; name: string }[]; choices?: any[] } | null>(null);
  const [autoNightStep, setAutoNightStep] = useState<any | null>(null);
  const [autoNightApproval, setAutoNightApproval] = useState<{ choices: any[]; nextIndex: number } | null>(null);
  const [customNightTimer, setCustomNightTimer] = useState<number | null>(null);

  // ── مستمعات بروتوكول الليل الأوتوماتيكيّ (مطابقة لصفحة الليدر) ──
  useEffect(() => {
    const offs: Array<() => void> = [];
    offs.push(on('night:auto-progress', (data: any) => setAutoNightProgress(data)));
    offs.push(on('night:auto-started', (data: any) => {
      setAutoNightProgress({ total: data.totalAlive, submitted: 0 });
      setAutoNightStep(null);
      setAutoNightApproval(null);
    }));
    offs.push(on('night:auto-step-ready', (data: any) => {
      setAutoNightStep({ ...data, dispatched: false });
      setAutoNightProgress((prev: any) => (prev ? { ...prev, submitted: 0, choices: [] } : null));
      setAutoNightApproval(null);
      setCustomNightTimer(null);
    }));
    offs.push(on('night:auto-step-started', () => setAutoNightStep((prev: any) => (prev ? { ...prev, dispatched: true } : null))));
    offs.push(on('night:auto-step-approval', (data: any) => setAutoNightApproval(data)));
    return () => { offs.forEach((f) => f && f()); };
  }, [on]);

  // إعادة ضبط حالة الليل عند مغادرة طور NIGHT
  useEffect(() => {
    if (gameState.phase !== 'NIGHT') {
      setAutoNightStep(null);
      setAutoNightProgress(null);
      setAutoNightApproval(null);
      setCustomNightTimer(null);
    }
  }, [gameState.phase]);

  const isAutoNight = gameState.phase === 'NIGHT' && (gameState.config as any).nightMode === 'auto';

  return (
    <div dir="rtl">
      {isAutoNight && (
        <div className="mb-4 px-1">
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-4">
            {/* عنوان */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-[#808080] tracking-widest">🌙 AUTO NIGHT</span>
              {autoNightProgress && (
                <span className="text-xs font-mono text-[#C5A059]">
                  {autoNightProgress.submitted} / {autoNightProgress.total} أرسلوا
                </span>
              )}
            </div>

            {/* الخطوة الحالية */}
            {autoNightStep ? (
              <div className="space-y-3">
                <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-3 text-center">
                  <p className="text-[9px] font-mono text-[#666] tracking-widest uppercase mb-1">CURRENT STEP</p>
                  <p className="text-[#C5A059] font-black text-lg" style={{ fontFamily: 'Amiri, serif' }}>
                    {autoNightStep.roleName}
                  </p>
                  <p className="text-[#555] text-xs font-mono mt-1">
                    #{autoNightStep.performerPhysicalId} — {autoNightStep.performerName}
                  </p>
                  <p className="text-[10px] text-[#444] font-mono mt-1">
                    المدة: {customNightTimer || autoNightStep.timeoutSeconds} ثانية
                  </p>
                  {!autoNightStep.dispatched && (
                    <div className="mt-2 flex items-center justify-center gap-2">
                      {[15, 20, 30].map((t) => (
                        <button
                          key={t}
                          onClick={() => setCustomNightTimer(t)}
                          className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                            (customNightTimer === t) || (!customNightTimer && autoNightStep.timeoutSeconds === t)
                              ? 'bg-[#C5A059] text-black font-bold'
                              : 'bg-[#111] text-[#808080] border border-[#2a2a2a] hover:border-[#C5A059]'
                          }`}
                        >
                          {t}s
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* زر بدء الخطوة أو حالة التقدم */}
                {!autoNightStep.dispatched ? (
                  <button
                    onClick={async () => {
                      setAutoNightStep((prev: any) => (prev ? { ...prev, dispatched: true } : null));
                      try {
                        const res = await emit('night:auto-advance-step', {
                          roomId: gameState.roomId,
                          durationSeconds: customNightTimer || autoNightStep.timeoutSeconds,
                        });
                        if (!res?.success) {
                          setError(res?.error || 'فشل بدء الخطوة');
                          setAutoNightStep((prev: any) => (prev ? { ...prev, dispatched: false } : null));
                        }
                      } catch (err: any) {
                        setError(err.message);
                        setAutoNightStep((prev: any) => (prev ? { ...prev, dispatched: false } : null));
                      }
                    }}
                    className="w-full py-3.5 bg-gradient-to-r from-[#C5A059] to-[#b38b47] text-black font-black text-sm rounded-xl hover:from-[#d4af63] hover:to-[#c49b52] transition-all"
                    style={{ boxShadow: '0 0 20px rgba(197,160,89,0.3)' }}
                  >
                    ▶ بدء {autoNightStep.roleName}
                  </button>
                ) : autoNightApproval ? (
                  <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
                    <p className="text-center text-[#C5A059] font-bold mb-3">{readOnlyChoices ? '✅ اكتملت اختيارات اللاعبين — اعتمِد للمتابعة (لا يمكن التعديل)' : '✅ اكتمل الاختيار — مرحلة مراجعة الليدر'}</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
                      {[...autoNightApproval.choices]
                        .sort((a, b) => {
                          if (a.isReal && !b.isReal) return -1;
                          if (!a.isReal && b.isReal) return 1;
                          return a.physicalId - b.physicalId;
                        })
                        .map((c: any) => {
                          const isReal = c.isReal;
                          const isRandom = c.isRandom;
                          const chooser = gameState.players.find((p: any) => p.physicalId === c.physicalId);
                          return (
                            <div key={c.physicalId} className={`p-3 rounded-lg border ${isReal ? 'bg-[#C5A059]/10 border-[#C5A059] shadow-[0_0_10px_rgba(197,160,89,0.2)]' : 'bg-[#222] border-[#333]'}`}>
                              <div className="flex items-center justify-between mb-2">
                                <span className={`text-xs font-mono ${isReal ? 'font-black text-white' : 'text-[#ccc]'}`}>
                                  #{chooser?.physicalId} {chooser?.name}
                                  {isReal && <span className="mr-2 px-2 py-0.5 bg-[#C5A059] text-black rounded text-[10px] font-bold">صاحب الدور</span>}
                                  {isRandom ? (
                                    <span className="mr-1 px-1.5 py-0.5 bg-gray-600 text-white rounded text-[9px]">عشوائي</span>
                                  ) : (
                                    <span className="mr-1 px-1.5 py-0.5 bg-[#4CAF50] text-white rounded text-[9px]">يدوي</span>
                                  )}
                                </span>
                              </div>
                              <div className="mt-2 text-left">
                                <select
                                  className={`text-[11px] bg-black border ${isReal ? 'border-[#C5A059]/50 focus:border-[#C5A059]' : 'border-[#444] opacity-70'} focus:outline-none text-white p-1.5 rounded w-full`}
                                  value={c.targetPhysicalId || ''}
                                  disabled={!isReal || readOnlyChoices}
                                  onChange={(e) => {
                                    if (!isReal || readOnlyChoices) return;
                                    const newChoices = [...autoNightApproval.choices];
                                    const originalIdx = newChoices.findIndex((nc: any) => nc.physicalId === c.physicalId);
                                    if (originalIdx >= 0) {
                                      newChoices[originalIdx].targetPhysicalId = e.target.value ? Number(e.target.value) : null;
                                      setAutoNightApproval({ ...autoNightApproval, choices: newChoices });
                                    }
                                  }}
                                >
                                  <option value="">تخطي / لا أحد</option>
                                  {gameState.players.filter((p: any) => p.isAlive).map((p: any) => (
                                    <option key={p.physicalId} value={p.physicalId}>#{p.physicalId} {p.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          const res = await emit('night:auto-approve-step', {
                            roomId: gameState.roomId,
                            ...(readOnlyChoices ? {} : { modifiedChoices: autoNightApproval.choices }),
                            nextIndex: autoNightApproval.nextIndex,
                          });
                          if (!res?.success) setError(res?.error || 'فشل اعتماد الخطوة');
                          else setAutoNightApproval(null);
                        } catch (err: any) { setError(err.message); }
                      }}
                      className="w-full py-2 bg-[#C5A059] text-black font-bold text-sm rounded hover:bg-[#d4af63] transition-colors"
                    >
                      اعتماد الإجراء
                    </button>
                  </div>
                ) : (
                  <div>
                    {autoNightProgress && (
                      <div>
                        <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden mb-2">
                          <div
                            className="h-full bg-gradient-to-r from-[#C5A059] to-[#b38b47] rounded-full transition-all duration-500"
                            style={{ width: `${autoNightProgress.total > 0 ? (autoNightProgress.submitted / autoNightProgress.total) * 100 : 0}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-[#555] font-mono text-center tracking-widest mb-3">
                          اللاعبون يختارون من أجهزتهم...
                        </p>
                        {autoNightProgress.choices && autoNightProgress.choices.length > 0 && (
                          <div className="space-y-2 mb-3">
                            {[...autoNightProgress.choices]
                              .sort((a, b) => {
                                if (a.isReal && !b.isReal) return -1;
                                if (!a.isReal && b.isReal) return 1;
                                return a.physicalId - b.physicalId;
                              })
                              .map((c: any) => {
                                const isReal = c.isReal;
                                const chooser = gameState.players.find((p: any) => p.physicalId === c.physicalId);
                                const target = gameState.players.find((p: any) => p.physicalId === c.targetPhysicalId);
                                return (
                                  <div key={c.physicalId} className={`p-2 rounded-lg border ${isReal ? 'bg-[#C5A059]/10 border-[#C5A059]/50 shadow-[0_0_8px_rgba(197,160,89,0.1)]' : 'bg-[#222] border-[#333]'}`}>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className={`text-[11px] font-mono ${isReal ? 'font-bold text-white' : 'text-[#aaa]'}`}>
                                        #{chooser?.physicalId} {chooser?.name}
                                        {isReal && <span className="mr-1 px-1.5 py-0.5 bg-[#C5A059] text-black rounded text-[9px] font-bold">صاحب الدور</span>}
                                      </span>
                                      <span className={`text-[11px] ${isReal ? 'text-[#C5A059] font-bold' : 'text-[#888]'}`}>
                                        ← {target ? `#${target.physicalId} ${target.name}` : 'تخطي'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                        {autoNightProgress.missingPlayers && autoNightProgress.missingPlayers.length > 0 && (
                          <div className="bg-[#111] border border-[#2a2a2a] rounded-lg p-2 max-h-32 overflow-y-auto">
                            <p className="text-[9px] text-[#888] font-mono mb-1">في انتظار الإرسال:</p>
                            <div className="flex flex-wrap gap-1">
                              {autoNightProgress.missingPlayers.map((p) => (
                                <span key={p.physicalId} className="text-[10px] px-2 py-0.5 bg-[#222] border border-[#333] text-[#ccc] rounded-md">
                                  #{p.physicalId} {p.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 🔪 عقود السفّاح — Auto Mode */}
                {autoNightStep.role === 'ASSASSIN' && gameState.assassinState && (
                  <div className="mb-3 border border-[#6b21a8]/30 rounded-xl p-3 bg-[#0d0015]/60">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">🗡️</span>
                      <span className="text-xs font-bold text-purple-300">عقود السفّاح</span>
                      <span className="text-[10px] text-purple-400/60 font-mono mr-auto">
                        {gameState.assassinState.completedCount}/{gameState.assassinState.totalRequired}
                      </span>
                    </div>
                    <div className="h-1 bg-[#1a0030] rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all"
                        style={{ width: `${(gameState.assassinState.completedCount / gameState.assassinState.totalRequired) * 100}%` }}
                      />
                    </div>
                    <div className="space-y-1">
                      {gameState.assassinState.contracts.map((contract: any, i: number) => {
                        const isCurrent = i === gameState.assassinState.currentContractIndex && !contract.completed;
                        return (
                          <div key={i} className={`flex items-center gap-2 text-[10px] px-2 py-1 rounded-lg ${
                            contract.completed ? 'bg-green-900/20 text-green-400' :
                            isCurrent ? 'bg-purple-900/30 text-purple-300 border border-purple-500/30' :
                            'bg-[#111] text-[#555]'
                          }`}>
                            <span>{contract.completed ? '✅' : isCurrent ? '🎯' : '⏳'}</span>
                            <span>{contract.descriptionAr || `اغتيال ${contract.targetRole}`}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {autoNightStep.canSkip && !autoNightStep.dispatched && (
                  <button
                    onClick={async () => {
                      try {
                        const res = await emit('night:skip-action', { roomId: gameState.roomId, role: autoNightStep.role });
                        if (res?.success) setAutoNightStep(null);
                      } catch { /* ignore */ }
                    }}
                    className="w-full py-2 text-[#666] hover:text-[#999] text-xs font-mono transition-colors"
                  >
                    تخطي ←
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="w-8 h-8 border-2 border-[#C5A059]/30 border-t-[#C5A059] rounded-full animate-spin mx-auto mb-2" />
                <p className="text-[10px] text-[#555] font-mono tracking-widest">
                  جارٍ تحضير الخطوة التالية...
                </p>
                <button
                  onClick={async () => {
                    try { await emit('night:retry-auto', { roomId: gameState.roomId }); } catch { /* ignore */ }
                  }}
                  className="mt-3 px-4 py-1 text-[10px] text-[#C5A059] border border-[#C5A059]/30 rounded hover:bg-[#C5A059]/10 font-mono transition-colors"
                >
                  🔄 إعادة تشغيل الخطوة
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* أحداث الصباح: عرض هاتفيّ مُعاد تصميمه (عمود واحد)؛ الليل اليدويّ (نادر عن بُعد) يبقى على LeaderNightView */}
      {gameState.phase === 'MORNING_RECAP' ? (
        <HostMorningRecap gameState={gameState} emit={emit} setError={setError} />
      ) : (gameState.config as any).nightMode !== 'auto' ? (
        <LeaderNightView gameState={gameState} emit={emit} setError={setError} />
      ) : null}
    </div>
  );
}
