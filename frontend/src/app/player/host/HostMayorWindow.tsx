'use client';

// ══════════════════════════════════════════════════════
// 🎩 HostMayorWindow — نافذة العمدة عند مضيف الغرفة البعيدة.
//
// 🔴 كان الخادمُ يرسل `day:mayor-window` للمضيف (دوره leader) ويقبل قرارَه، لكنّ واجهةَ
//    المضيف لم تستمع ولم تعرض شيئاً: فإن لم يحسم العمدةُ من هاتفه علقت الجولة — زرُّ
//    «تنفيذ الإقصاء» يعيد فتح النافذة نفسها بلا نهاية. هنا الخيارات الثلاثة نفسُها التي
//    في LeaderDayView، والقرارُ للعمدة أوّلاً: المضيفُ يتدخّل حين لا يحسم.
//
// المصدر الحيّ: الأحداث مباشرةً من المقبس. ومصدرُ إعادة الاتصال: `mayorState.window`
// في حالة المضيف (تصله كاملةً لأنّه موثوق) — فالنافذةُ تعود بعد إعادة التحميل.
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { swalConfirm } from '@/lib/swal';

interface Props {
  gameState: any;
  emit: (event: string, payload: any) => Promise<any>;
  setError: (s: string) => void;
}

interface LiveWindow {
  winner: any;
  topVotes: number;
  mayorPhysicalId?: number;
  voteWeight?: number;
  openedAt: number;
  timeout: number;
}

const CONFIRM: Record<string, string> = {
  PASS: 'لا تدخّل من العمدة — تنفيذ الإعدام كالمعتاد؟',
  REVOTE: 'العمدة يكشف نفسه ويُلغي الإعدام — تصويت جديد على الجميع عدا مَن أنقذه؟\n(كشفٌ دائم + صوته المضاعف + تُستهلك القدرة)',
  POSTPONE: 'العمدة يكشف نفسه ويؤجّل — لا موت اليوم وتبدأ الليلة؟\n(كشفٌ دائم + صوته المضاعف + تُستهلك القدرة)',
};

export default function HostMayorWindow({ gameState, emit, setError }: Props) {
  const [live, setLive] = useState<LiveWindow | null>(null);
  const [busy, setBusy] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [, setTick] = useState(0);

  // ── الأحداث الحيّة — من getSocket مباشرةً (كما في LeaderDayView) ──
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const onWindow = (p: any) => {
      if (p?.forMayor) return; // نسخةُ هاتف العمدة لا تخصّ المضيف
      setLive({
        winner: p?.winner, topVotes: Number(p?.topVotes) || 0,
        mayorPhysicalId: p?.mayorPhysicalId, voteWeight: p?.voteWeight,
        openedAt: Date.now(), timeout: Number(p?.timeoutSeconds) || 30,
      });
      setMinimized(false);
    };
    const onClosed = () => setLive(null);
    s.on('day:mayor-window', onWindow);
    s.on('day:mayor-window-closed', onClosed);
    s.on('day:mayor-revealed', onClosed);
    return () => {
      s.off('day:mayor-window', onWindow);
      s.off('day:mayor-window-closed', onClosed);
      s.off('day:mayor-revealed', onClosed);
    };
  }, []);

  // العدّادُ الإرشاديّ (ثلاثون ثانية للعمدة على هاتفه) — لا يقرّر شيئاً
  useEffect(() => {
    if (!live) return;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [live]);

  const ms = gameState?.mayorState;
  const players: any[] = gameState?.players || [];
  const nameOf = (seat?: number | null) => players.find((p: any) => p.physicalId === seat)?.name || '';

  // مصدرُ إعادة الاتصال: النافذة في حالة الخادم
  const serverWindow: LiveWindow | null = ms?.window && !ms?.vetoUsed
    ? { winner: ms.window.winner, topVotes: Number(ms.window.topVotes) || 0, mayorPhysicalId: ms.mayorPhysicalId, openedAt: 0, timeout: 0 }
    : null;
  const win: LiveWindow | null = ms?.vetoUsed ? null : (live || serverWindow);
  if (!win || !win.winner) return null;

  const w = win.winner;
  const isDeal = w.type === 'DEAL';
  const tgt = w.targetPhysicalId;
  const tgtName = w.targetName || nameOf(tgt);
  const init = w.initiatorPhysicalId;
  const initName = w.initiatorName || nameOf(init);
  const targetLabel = isDeal ? `صفقة: #${init} ${initName} ← #${tgt} ${tgtName}` : `#${tgt} ${tgtName}`;
  const mayorSeat = win.mayorPhysicalId ?? ms?.mayorPhysicalId;
  const weight = win.voteWeight ?? gameState?.config?.mayorVoteWeight ?? 2;
  const left = win.openedAt ? Math.max(0, Math.ceil(win.timeout - (Date.now() - win.openedAt) / 1000)) : 0;

  const decide = async (decision: 'PASS' | 'REVOTE' | 'POSTPONE') => {
    if (busy) return;
    const ok = await swalConfirm(CONFIRM[decision]);
    if (!ok) return;
    setBusy(true);
    try {
      const res = await emit('day:mayor-decision', { roomId: gameState.roomId, decision });
      if (res && res.success === false) throw new Error(res.error || 'تعذّر');
      setLive(null);
    } catch (e: any) {
      setError(e?.message || 'تعذّر تسجيل قرار العمدة');
    } finally {
      setBusy(false);
    }
  };

  if (minimized) {
    return (
      <button onClick={() => setMinimized(false)} dir="rtl"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] px-4 py-2.5 rounded-full border-2 border-[#C5A059] bg-[#1d160c] text-[#C5A059] text-sm font-bold shadow-[0_0_24px_rgba(197,160,89,0.35)]">
        🎩 نافذة العمدة مفتوحة — {left > 0 ? `${left}ث` : 'احسم'}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm rounded-2xl p-4 border-2 border-[#C5A059] shadow-[0_0_40px_rgba(197,160,89,0.25)]"
        style={{ background: 'linear-gradient(170deg,#1d160c,#0f0b06)' }}>
        <div className="flex items-start justify-between gap-2">
          <div className="text-3xl leading-none">🎩</div>
          <button onClick={() => setMinimized(true)} className="text-[11px] text-[#9a9a9a] border border-[#333] rounded-lg px-2 py-1">تصغير</button>
        </div>
        <h3 className="text-center text-[#C5A059] font-black text-lg mt-1 mb-1">نافذة العمدة</h3>
        <p className="text-center text-[#d8cfbd] text-xs leading-6 mb-2">
          نتيجة التصويت: إعدام <b className="text-[#ff6b64]">{targetLabel}</b> ({win.topVotes} أصوات)
        </p>
        <div className="rounded-xl border border-[#C5A059]/30 bg-black/30 px-3 py-2 mb-3 text-[11px] text-[#c9c3b5] text-center leading-5">
          🔒 القرار للعمدة{mayorSeat != null ? <> <b className="text-[#C5A059]">#{mayorSeat} {nameOf(mayorSeat)}</b></> : null} — ينتظر قراره على هاتفه.
          <br />
          {left > 0
            ? <span className="text-[#9a9a9a]">⏳ {left} ثانية — تدخّل فقط إن طلب منك أو لم يحسم</span>
            : <span className="text-amber-300">لم يحسم العمدة بعد — احسم أنت إن لزم</span>}
        </div>
        <div className="space-y-2">
          <button onClick={() => decide('PASS')} disabled={busy}
            className="w-full py-2.5 rounded-xl font-bold text-white text-xs disabled:opacity-50 border"
            style={{ background: 'linear-gradient(135deg,#a5322b,#7e241f)', borderColor: '#c94a42' }}>⚔️ لا تدخّل — تنفيذ الإعدام</button>
          <button onClick={() => decide('REVOTE')} disabled={busy}
            className="w-full py-2.5 rounded-xl font-bold text-white text-xs disabled:opacity-50 border"
            style={{ background: 'linear-gradient(135deg,#3b6fd4,#2b4f9e)', borderColor: '#4f8ef7' }}>🎩🔄 إلغاء الإعدام — تصويت جديد عدا المُنقَذ</button>
          <button onClick={() => decide('POSTPONE')} disabled={busy}
            className="w-full py-2.5 rounded-xl font-bold text-white text-xs disabled:opacity-50 border"
            style={{ background: 'linear-gradient(135deg,#7a4b8f,#5b3570)', borderColor: '#9b6dd6' }}>🎩🌙 تأجيل — لا موت اليوم</button>
        </div>
        <p className="text-center text-[10px] text-[#8a8070] mt-3 leading-5">
          أيّ خيارَي عمدةٍ = كشفٌ دائم للجميع + صوت ×{weight} فوريّ + استهلاك القدرة (مرّة واحدة باللعبة)
        </p>
      </div>
    </div>
  );
}
