'use client';

// ══════════════════════════════════════════════════════════════════════════
// 📸 زاوية بلا تصوير — لوحة الليدر (2026-11-01)
//
// حالة الكتلة تُشتقّ من الحالة نفسها في كلّ مرّة (lib/photoZone — نسخة حرفيّة من الخادم)،
// فتتبع أيّ نقلٍ أو ترقيمٍ أو دخولٍ بلا حدثٍ إضافيّ. الخادم يرسل فقط ما لا تراه الحالة:
// «جلس خارج الكتلة» و«غيّر رأيه» (leader:photo-zone-alert) — ولا ينقل أحداً بنفسه (القرار ٦).
//
// في الرأس: شريحة «📵 ٤ · ١–٤ ✓» تفتح اللوحة: الحالة، «🧩 أصلح»، المرساة، علمُ كلّ لاعب،
// و«📋 للمصوّر» (شاشة كبيرة تُرفع أمام المصوّر).
// ══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import FixedLayer from '@/components/FixedLayer';
import { zoneReport, type ZoneOccupant, type ZoneReport, type PhotoZoneCtx } from '@/lib/photoZone';
import { swalConfirm } from '@/lib/swal';

type Emit = (event: string, payload: any) => Promise<any>;
type On = (event: string, handler: (...args: any[]) => void) => () => void;

/** الشاغلون كما تراهم الزاوية: اللاعبون والمتفرّجون (كلّهم على كراسي الحلقة) */
export function zoneOccupancyOf(gameState: any): Map<number, ZoneOccupant> {
  const m = new Map<number, ZoneOccupant>();
  for (const p of gameState?.players || []) {
    if (!p?.physicalId) continue;
    m.set(Number(p.physicalId), { noPhoto: p.noPhoto === true, locked: !!(p.seatHeld || p.frozen), name: p.name });
  }
  for (const s of gameState?.spectators || []) {
    if (!s?.physicalId || m.has(Number(s.physicalId))) continue;
    m.set(Number(s.physicalId), { noPhoto: s.noPhoto === true, locked: true, name: s.name });
  }
  return m;
}

export function zoneCtxOf(gameState: any): PhotoZoneCtx | null {
  const z = gameState?.photoZone;
  if (!z?.on) return null;
  return { anchor: Number(z.anchor) || 1, pending: Number(z.pending) || 0 };
}

/** تقرير الكتلة لحالة الغرفة — null إن كانت الميزة مطفأة */
export function usePhotoZone(gameState: any): { ctx: PhotoZoneCtx; report: ZoneReport; n: number } | null {
  return useMemo(() => {
    const ctx = zoneCtxOf(gameState);
    if (!ctx) return null;
    const n = Number(gameState?.config?.maxPlayers) || 27;
    return { ctx, report: zoneReport(zoneOccupancyOf(gameState), ctx, n), n };
  }, [gameState]);
}

/** شارة 📵 على بطاقة لاعب — للعرض وحده */
export function NoPhotoBadge({ on }: { on?: boolean }) {
  if (!on) return null;
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
      style={{ background: 'rgba(249,115,22,.18)', border: '1px solid rgba(249,115,22,.55)', color: '#fdba74' }}
      title="لا يقبل التصوير">
      📵
    </span>
  );
}

interface Alert { id: number; text: string; seat: number; outside: boolean }

export default function PhotoZoneToggle({ gameState, emit, on }: { gameState: any; emit: Emit; on: On }) {
  const pz = usePhotoZone(gameState);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [alert, setAlert] = useState<Alert | null>(null);
  const [cameraView, setCameraView] = useState(false);
  const [anchorEdit, setAnchorEdit] = useState(false);
  const roomId = gameState?.roomId;

  // 🔔 تنبيهات الخادم: جلس خارج الكتلة / غيّر رأيه
  useEffect(() => {
    if (!roomId) return;
    return on('leader:photo-zone-alert', (d: any) => {
      const who = d?.name ? `«${d.name}»` : `#${d?.physicalId}`;
      const text = d?.kind === 'changed'
        ? `📵 ${who} (مقعد ${d.physicalId}) صار لا يقبل التصوير${d.outside ? ' — خارج الزاوية' : ''}`
        : `📵 ${who} جلس في ${d?.physicalId} خارج الزاوية`;
      setAlert({ id: Date.now(), text, seat: Number(d?.physicalId) || 0, outside: !!d?.outside });
    });
  }, [on, roomId]);
  useEffect(() => {
    if (!alert) return;
    const t = setTimeout(() => setAlert(a => (a && a.id === alert.id ? null : a)), 12000);
    return () => clearTimeout(t);
  }, [alert]);

  const fix = useCallback(async (seat?: number, confirmHazard?: boolean) => {
    if (!roomId || busy) return;
    setBusy(true); setMsg('');
    try {
      const r = await emit('room:photo-zone-fix', { roomId, ...(seat ? { physicalId: seat } : {}), ...(confirmHazard ? { confirmHazard: true } : {}) });
      const f = r?.fix;
      setMsg(r?.applied ? (f?.swapWith ? `✓ بُدّل ${f.from} ⇄ ${f.to} (مع «${f.swapWith}»)` : `✓ نُقل ${f?.from} إلى ${f?.to}`) : 'الكتلة سليمة');
      setAlert(null);
    } catch (err: any) {
      const res = err?.response;
      if (res?.code === 'HAZARD_CONFIRM') {
        setBusy(false);
        if (await swalConfirm(res.error || 'أكّد النقل الآن', { title: 'قرارٌ جارٍ', confirmText: 'نفّذ' })) return fix(seat, true);
        return;
      }
      setMsg(res?.code === 'TOOLS_LOCKED'
        ? '🔒 أثناء اللعب يلزم الرقم السرّي — افتحه من «🪑 المقاعد» ثمّ أعد المحاولة'
        : (res?.error || err?.message || 'تعذّر الإصلاح'));
    } finally { setBusy(false); }
  }, [roomId, busy, emit]);

  const setNoPhoto = useCallback(async (seat: number, noPhoto: boolean) => {
    if (!roomId) return;
    try { await emit('room:set-no-photo', { roomId, physicalId: seat, noPhoto }); }
    catch (err: any) { setMsg(err?.response?.error || err?.message || 'تعذّر الحفظ'); }
  }, [roomId, emit]);

  const setAnchor = useCallback(async (anchor: number | null) => {
    if (!roomId) return;
    try { await emit('room:set-photo-anchor', { roomId, anchor }); setAnchorEdit(false); }
    catch (err: any) { setMsg(err?.response?.error || err?.message || 'تعذّر الحفظ'); }
  }, [roomId, emit]);

  if (!pz) return null;
  const { report, ctx, n } = pz;
  const ok = report.contiguous;
  const people = [
    ...(gameState.players || []).filter((p: any) => !p.seatHeld).map((p: any) => ({ seat: p.physicalId, name: p.name, noPhoto: p.noPhoto === true, spec: false })),
    ...(gameState.spectators || []).filter((s: any) => s.physicalId > 0).map((s: any) => ({ seat: s.physicalId, name: s.name, noPhoto: s.noPhoto === true, spec: true })),
  ].sort((a, b) => a.seat - b.seat);
  const zoneSet = new Set(report.zone);
  const anchorSource = gameState.photoZone?.anchorSource;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title="زاوية بلا تصوير"
        className={`text-[10px] font-mono tracking-[0.1em] transition-colors border px-3 py-1.5 ${
          !ok ? 'text-rose-300 border-rose-500/60 bg-rose-500/10 animate-pulse'
          : open ? 'text-orange-200 border-orange-400/70 bg-orange-500/10'
          : 'text-orange-300 border-orange-500/30 hover:border-orange-400'
        }`}
      >
        📵 {report.count}{report.count ? ` · ${report.label}` : ''} {ok ? '✓' : '✗'}
      </button>

      <FixedLayer>
        <AnimatePresence>
          {open && (
            <motion.div
              dir="rtl"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              className="fixed bottom-4 right-4 z-[110] w-[min(94vw,26rem)] max-h-[82vh] overflow-y-auto rounded-2xl border border-orange-500/30 bg-[#080808]/95 backdrop-blur-md shadow-2xl p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-white text-sm font-bold" style={{ fontFamily: 'Amiri, serif' }}>📵 زاوية بلا تصوير</p>
                  <p className={`text-[12px] mt-1 font-bold ${ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {report.count === 0
                      ? 'لا أحد بلا تصوير بعد'
                      : ok ? `${report.count} — المقاعد ${report.label} ✓ متّصلة` : `${report.count} — مقطّعة: ${report.label}`}
                  </p>
                  {ctx.pending > 0 && <p className="text-[11px] text-[#9a8f7d] mt-0.5">محجوزٌ للزاوية {ctx.pending} لم يصلوا بعد</p>}
                </div>
                <button type="button" onClick={() => setOpen(false)} className="w-9 h-9 rounded text-[#808080] hover:text-white text-base" aria-label="إغلاق">✕</button>
              </div>

              {!ok && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 space-y-2">
                  <p className="text-[12px] text-rose-200 leading-relaxed">
                    {report.fix
                      ? (report.fix.swapWith
                          ? <>اقتراح: بدّل المقعد <b className="font-mono">{report.fix.from}</b> مع «{report.fix.swapWith}» في <b className="font-mono">{report.fix.to}</b></>
                          : <>اقتراح: انقل المقعد <b className="font-mono">{report.fix.from}</b> إلى <b className="font-mono">{report.fix.to}</b> (فارغ)</>)
                      : 'لا مقعد ملاصق للزاوية يمكن تحريره — انقل يدويّاً من «🪑 المقاعد»'}
                  </p>
                  {report.fix && (
                    <button type="button" disabled={busy} onClick={() => fix(report.fix!.from)}
                      className="w-full h-11 rounded-xl bg-rose-500/20 border border-rose-400 text-rose-100 text-sm font-bold hover:bg-rose-500/30 disabled:opacity-40">
                      {busy ? '...' : '🧩 أصلح الآن'}
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setCameraView(true)}
                  className="h-11 rounded-xl border border-orange-500/40 text-orange-200 text-[12px] font-bold hover:bg-orange-500/10">
                  📋 للمصوّر
                </button>
                <button type="button" onClick={() => setAnchorEdit(v => !v)}
                  className="h-11 rounded-xl border border-[#C5A059]/40 text-[#C5A059] text-[12px] font-bold hover:bg-[#C5A059]/10">
                  ⚓ المرساة: {ctx.anchor}{anchorSource === 'leader' ? ' (للّيلة)' : anchorSource === 'template' ? ' (القالب)' : ''}
                </button>
              </div>

              {anchorEdit && (
                <div className="rounded-xl border border-[#C5A059]/30 bg-black/40 p-2.5 space-y-2">
                  <p className="text-[11px] text-[#9a8f7d]">المس أوّل كرسيّ في الجانب البعيد عن الكاميرا — الزاوية تمتدّ منه مع الترقيم.</p>
                  <div className="grid grid-cols-7 gap-1.5">
                    {Array.from({ length: n }, (_, i) => i + 1).map(s => (
                      <button key={s} type="button" onClick={() => setAnchor(s)}
                        className={`h-10 rounded-lg border font-mono text-sm font-bold ${s === ctx.anchor ? 'border-[#C5A059] bg-[#C5A059]/20 text-[#C5A059]' : 'border-[#2a2a2a] text-zinc-400 hover:border-[#C5A059]/60'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                  {anchorSource === 'leader' && (
                    <button type="button" onClick={() => setAnchor(null)} className="text-[11px] text-zinc-400 hover:text-white">↺ عُد لمرساة القالب</button>
                  )}
                </div>
              )}

              <div>
                <p className="text-[11px] text-[#9a8f7d] mb-1.5">المس لاعباً لتغيير علمه (يُحفظ في حسابه، والقاصر للّيلة وحدها). لا يُنقل تلقائيّاً.</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {people.map(p => (
                    <button key={`${p.spec ? 's' : 'p'}${p.seat}`} type="button"
                      onClick={async () => {
                        const to = !p.noPhoto;
                        if (await swalConfirm(`«${p.name}» — مقعد ${p.seat}`, { title: to ? '📵 بلا تصوير؟' : '📸 يقبل التصوير؟', confirmText: 'نعم', icon: 'question' })) setNoPhoto(p.seat, to);
                      }}
                      className={`min-h-[44px] rounded-lg border px-2 py-1.5 flex items-center gap-2 text-right ${
                        p.noPhoto ? 'border-orange-500/50 bg-orange-500/10 text-orange-100' : 'border-[#2a2a2a] text-zinc-300 hover:border-zinc-500'
                      } ${zoneSet.has(p.seat) && !p.noPhoto ? 'ring-1 ring-orange-500/30' : ''}`}>
                      <span className="font-mono font-black text-sm w-6 text-center">{p.seat}</span>
                      <span className="flex-1 truncate text-[12px]">{p.name}{p.spec ? ' 👁️' : ''}</span>
                      <span className="text-sm">{p.noPhoto ? '📵' : '📸'}</span>
                    </button>
                  ))}
                </div>
              </div>

              {msg && <p role="status" className="text-[12px] text-sky-200 bg-sky-500/10 rounded-lg p-2">{msg}</p>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 🔔 تنبيه الخادم — يبقى ١٢ ثانية، وزرّ الإصلاح بلمسة */}
        <AnimatePresence>
          {alert && !open && (
            <motion.div key={alert.id} dir="rtl"
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="fixed top-20 left-1/2 -translate-x-1/2 z-[125] w-[min(94vw,28rem)] rounded-2xl border border-orange-500/50 bg-[#1a0f06]/95 shadow-2xl p-3 flex items-center gap-2">
              <span className="flex-1 text-[12.5px] text-orange-100 font-bold leading-snug">{alert.text}</span>
              {alert.outside && (
                <button type="button" disabled={busy} onClick={() => fix(alert.seat)}
                  className="shrink-0 h-10 px-3 rounded-lg bg-orange-500/20 border border-orange-400 text-orange-100 text-[12px] font-bold disabled:opacity-40">
                  🧩 أصلح
                </button>
              )}
              <button type="button" onClick={() => setAlert(null)} className="shrink-0 w-8 h-8 text-orange-200/60 hover:text-orange-100" aria-label="إغلاق">✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 📋 شاشة المصوّر — نصٌّ ضخم يُرفع أمامه، بلا أسماء */}
        <AnimatePresence>
          {cameraView && (
            <motion.button type="button" dir="rtl" onClick={() => setCameraView(false)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[140] bg-black flex flex-col items-center justify-center gap-6 p-6 text-center">
              <span className="text-6xl" aria-hidden="true">📵</span>
              <span className="text-white font-black leading-tight" style={{ fontFamily: 'Amiri, serif', fontSize: 'clamp(32px, 9vw, 84px)' }}>
                {report.count ? <>لا تصوّر المقاعد<br /><span className="text-orange-400 font-mono" dir="ltr">{report.label}</span></> : 'لا استثناء الليلة'}
              </span>
              {report.count > 0 && <span className="text-zinc-400 text-lg">{report.count} {report.count === 1 ? 'شخص' : 'أشخاص'}{!ok ? ' — الزاوية مقطّعة' : ''}</span>}
              <span className="text-zinc-600 text-sm">المس للإغلاق</span>
            </motion.button>
          )}
        </AnimatePresence>
      </FixedLayer>
    </>
  );
}
