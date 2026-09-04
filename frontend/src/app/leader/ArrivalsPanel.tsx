'use client';

// ══════════════════════════════════════════════════════
// 🚶 لوحة الوصول + 🪄 إعادة الترتيب الذكيّة — كونسول الليدر
// ══════════════════════════════════════════════════════
// تحلّ مشكلتين وصفهما المالك:
//   ① الواصل المتأخّر كان يُرفض بصمت ولا يعلم به الليدر إطلاقاً — الآن يظهر هنا
//      بمقعده المحجوز لحظة وصوله، ويُرقّى تلقائيّاً عند اللعبة التالية.
//   ② فصل الأصدقاء كان تبديلاً يدويّاً بالتخمين — الآن زرٌّ يقترح ترتيباً كاملاً
//      بمعاينة الفروق قبل التطبيق، ويُطبَّق في رحلةٍ واحدة عبر إعادة الترقيم الذرّيّة.
//
// القرارات المقفلة المطبَّقة هنا: ١ (المتفرّج في الحلقة) · ٦ (الاسم الأوّل على
// الشاشة، والقائمة الكاملة للّيدر وحده) · ٧ («أدخله الآن» يدويّ قبل اعتماد
// الأدوار) · ٨ (زرّ «رتّب» يظهر عند وجود تعارض، والمقاعد ثابتة افتراضيّاً).
// ══════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';

interface Spectator {
  physicalId: number;
  name: string;
  phone: string | null;
  playerId: number | null;
  joinedAt: number;
}

interface Props {
  roomId: string;
  gameState: any;
  emit: (event: string, data: any) => Promise<any>;
  on: (event: string, handler: (...args: any[]) => void) => (() => void);
  swalConfirm?: (opts: any) => Promise<boolean>;
}

const sinceLabel = (ts: number) => {
  const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (m < 1) return 'الآن';
  if (m < 60) return `منذ ${m} د`;
  return `منذ ${Math.floor(m / 60)} س`;
};

export default function ArrivalsPanel({ roomId, gameState, emit, on }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<Array<{ physicalId: number; name: string; violations: string[]; at: number }>>([]);
  const [preview, setPreview] = useState<null | {
    changes: Array<{ from: number; to: number; name: string }>;
    violationsBefore: number;
    violationsAfter: number;
  }>(null);

  const spectators: Spectator[] = useMemo(
    () => (Array.isArray(gameState?.spectators) ? gameState.spectators : []),
    [gameState?.spectators],
  );
  const phase = gameState?.phase;
  const inRosterWindow = phase === 'LOBBY' || phase === 'ROLE_GENERATION' || phase === 'GAME_OVER';
  const canAdmitNow = (phase === 'ROLE_BINDING' || phase === 'ROLE_GENERATION') && !gameState?.rolesConfirmed;

  // 🔔 تنبيهات غير حاجبة: وصولٌ متأخّر، ومخالفةُ قيدٍ لحظة الإجلاس
  useEffect(() => {
    if (!on) return;
    const offJoin = on('room:spectator-joined', (d: any) => {
      setToast(`🚶 وصل ${d?.firstName || d?.name || 'لاعب'} — مقعد ${d?.physicalId || '—'}`);
      setTimeout(() => setToast(null), 6000);
    });
    const offWarn = on('leader:seat-constraint-warning', (d: any) => {
      setWarnings(w => [{ physicalId: d.physicalId, name: d.name, violations: d.violations || [], at: Date.now() }, ...w].slice(0, 5));
    });
    return () => { offJoin?.(); offWarn?.(); };
  }, [on]);

  const doRemove = async (physicalId: number) => {
    setBusy(true);
    try { await emit('room:remove-spectator', { roomId, physicalId }); }
    catch (e: any) { setToast(e?.message || 'تعذّر الإزالة'); setTimeout(() => setToast(null), 4000); }
    finally { setBusy(false); }
  };

  const doAdmit = async (physicalId: number) => {
    setBusy(true);
    try {
      await emit('setup:admit-spectator', { roomId, physicalId });
      setToast('أُدخل في هذا التوزيع — أعد اعتماد الأدوار');
      setTimeout(() => setToast(null), 6000);
    } catch (e: any) { setToast(e?.message || 'تعذّر الإدخال'); setTimeout(() => setToast(null), 5000); }
    finally { setBusy(false); }
  };

  const doPreview = async () => {
    setBusy(true);
    try {
      const res = await emit('room:reshuffle-seats', { roomId, dryRun: true });
      setPreview({
        changes: res.changes || [],
        violationsBefore: res.violationsBefore ?? 0,
        violationsAfter: res.violationsAfter ?? 0,
      });
    } catch (e: any) { setToast(e?.message || 'تعذّر الاقتراح'); setTimeout(() => setToast(null), 5000); }
    finally { setBusy(false); }
  };

  const doApply = async () => {
    setBusy(true);
    try {
      const res = await emit('room:reshuffle-seats', { roomId, dryRun: false });
      setToast(`✅ طُبّق الترتيب — تحرّك ${res.applied ?? 0} لاعباً`);
      setPreview(null);
      setTimeout(() => setToast(null), 6000);
    } catch (e: any) { setToast(e?.message || 'تعذّر التطبيق'); setTimeout(() => setToast(null), 5000); }
    finally { setBusy(false); }
  };

  const count = spectators.length;

  return (
    <div data-arrivals className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors"
        style={{
          background: count > 0 ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.03)',
          borderColor: count > 0 ? 'rgba(167,139,250,0.6)' : 'rgba(255,255,255,0.12)',
          color: count > 0 ? '#cbbcff' : '#9aa3b5',
        }}
        title="الواصلون متأخّراً وأداة إعادة الترتيب"
      >
        🚶 الوصول{count > 0 ? ` (${count})` : ''}
      </button>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[400] px-4 py-2 rounded-lg text-sm font-bold"
          style={{ background: 'rgba(20,22,30,0.97)', border: '1px solid rgba(167,139,250,0.5)', color: '#e7ebf2' }}>
          {toast}
        </div>
      )}

      {open && (
        <div
          className="absolute z-[300] mt-2 w-[360px] max-h-[70vh] overflow-auto rounded-xl p-3 text-right"
          style={{ background: '#12151c', border: '1px solid #262c3a', boxShadow: '0 20px 60px rgba(0,0,0,.6)', insetInlineStart: 0 }}
        >
          {/* ── الواصلون ── */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-bold text-[#cbbcff]">ينتظرون اللعبة القادمة</span>
            <span className="text-[11px] text-[#8f98ab]">{count}</span>
          </div>

          {count === 0 && (
            <p className="text-[12px] text-[#5f6779] mb-3">لا أحد ينتظر. من يصل أثناء اللعبة يظهر هنا تلقائيّاً بمقعده.</p>
          )}

          {spectators.slice().sort((a, b) => a.joinedAt - b.joinedAt).map(sp => (
            <div key={`${sp.physicalId}-${sp.joinedAt}`}
              className="flex items-center gap-2 mb-1.5 p-2 rounded-lg"
              style={{ background: '#181d29', border: '1px solid #262c3a' }}>
              <span className="font-black text-[#C5A059] text-sm min-w-[28px] text-center">
                {sp.physicalId > 0 ? sp.physicalId : '—'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-[#e9ecf3] truncate">{sp.name}</div>
                <div className="text-[10.5px] text-[#8f98ab]">{sinceLabel(sp.joinedAt)}</div>
              </div>
              {canAdmitNow && (
                <button disabled={busy} onClick={() => doAdmit(sp.physicalId)}
                  className="px-2 py-1 rounded text-[11px] font-bold disabled:opacity-40"
                  style={{ background: 'rgba(63,185,80,.15)', border: '1px solid rgba(63,185,80,.5)', color: '#7fe08f' }}>
                  أدخله الآن
                </button>
              )}
              <button disabled={busy} onClick={() => doRemove(sp.physicalId)}
                className="px-2 py-1 rounded text-[11px] disabled:opacity-40"
                style={{ background: 'rgba(229,72,77,.12)', border: '1px solid rgba(229,72,77,.45)', color: '#ff8d90' }}>
                إزالة
              </button>
            </div>
          ))}

          {/* ── تحذيرات القيود ── */}
          {warnings.length > 0 && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid #262c3a' }}>
              <div className="text-[13px] font-bold text-[#ff8d90] mb-1.5">⚠️ مخالفات إجلاس</div>
              {warnings.map((w, i) => (
                <div key={i} className="text-[11.5px] text-[#c9d0dd] mb-1">
                  <b>#{w.physicalId} {w.name}</b>
                  {w.violations.length > 0 && <span className="text-[#8f98ab]"> — {w.violations[0]}</span>}
                </div>
              ))}
            </div>
          )}

          {/* ── إعادة الترتيب ── */}
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid #262c3a' }}>
            <div className="text-[13px] font-bold text-[#e6b54a] mb-1.5">🪄 إعادة ترتيب ذكيّة</div>
            {!inRosterWindow ? (
              <p className="text-[11.5px] text-[#5f6779]">متاحة في اللوبي أو بعد انتهاء اللعبة فقط.</p>
            ) : !preview ? (
              <button disabled={busy} onClick={doPreview}
                className="w-full py-2 rounded-lg text-[12.5px] font-bold disabled:opacity-40"
                style={{ background: 'rgba(230,181,74,.15)', border: '1px solid rgba(230,181,74,.55)', color: '#f3cd6f' }}>
                {busy ? '…' : 'اقترح ترتيباً'}
              </button>
            ) : (
              <div>
                <div className="text-[11.5px] text-[#8f98ab] mb-1.5">
                  تجاورات: <b className="text-[#ff8d90]">{preview.violationsBefore}</b> ← <b className="text-[#7fe08f]">{preview.violationsAfter}</b>
                  {' · '}يتحرّك {preview.changes.length}
                </div>
                <div className="max-h-[140px] overflow-auto mb-2">
                  {preview.changes.length === 0 && (
                    <p className="text-[11.5px] text-[#5f6779]">لا تغيير مقترح — الترتيب الحاليّ جيّد.</p>
                  )}
                  {preview.changes.map((c, i) => (
                    <div key={i} className="flex justify-between text-[11.5px] py-0.5" style={{ borderBottom: '1px dashed rgba(255,255,255,.05)' }}>
                      <span className="text-[#c9d0dd]">{c.name}</span>
                      <span className="text-[#8f98ab] font-mono">{c.from} ← {c.to}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button disabled={busy || preview.changes.length === 0} onClick={doApply}
                    className="flex-1 py-2 rounded-lg text-[12.5px] font-bold disabled:opacity-40"
                    style={{ background: '#e6b54a', color: '#1a1405' }}>
                    طبّق
                  </button>
                  <button disabled={busy} onClick={() => setPreview(null)}
                    className="px-3 py-2 rounded-lg text-[12.5px] disabled:opacity-40"
                    style={{ background: 'rgba(255,255,255,.05)', border: '1px solid #323a4b', color: '#8f98ab' }}>
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
