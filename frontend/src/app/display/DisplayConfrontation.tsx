'use client';
// ══════════════════════════════════════════════════════
// ⚔️ مواجهة النهار على شاشة العرض
//   - طلبٌ معلّق/مقبول: شريطٌ أعلى الشاشة
//   - رفض: إعلانٌ لثوانٍ («رفض فلان مواجهة فلان») — قرار المالك: الرفض علنيّ
//   - جارية: طبقةٌ كاملة ببطاقتين ومؤقّتٍ كبير، الجانب المتحدّث مضاء
// تُركَّب على مستوى الصفحة (لا داخل فرع مرحلة) كي لا تُقطع بالانتقالات.
// ══════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSocket } from '@/lib/socket';
import MafiaCard from '@/components/MafiaCard';
import type { ConfPayload, ConfItem } from '@/app/leader/LeaderConfrontationPanel';

interface Props {
  roomId: string;
  players: any[];   // الروستر العامّ (اسم/جنس/صورة/رتبة/تجميل) — الوجه العلنيّ للكرت
}

export default function DisplayConfrontation({ roomId, players }: Props) {
  const [conf, setConf] = useState<ConfPayload | null>(null);
  const [notice, setNotice] = useState<{ text: string; kind: 'declined' | 'cancelled' | 'done' } | null>(null);
  const [now, setNow] = useState(Date.now());
  const noticeTimer = useRef<any>(null);

  useEffect(() => {
    const s = getSocket();
    if (!s || !roomId) return;
    const nameOf = (pid: number, list: any[]) => list.find(p => p.physicalId === pid)?.name || `#${pid}`;
    const onUpd = (p: ConfPayload) => {
      setConf(p);
      const c = p.id ? p.confrontations.find(x => x.id === p.id) : null;
      if (!c) return;
      let n: typeof notice = null;
      if (p.event === 'declined') n = { kind: 'declined', text: `${nameOf(c.targetPhysicalId, players)} رفض مواجهة ${nameOf(c.requesterPhysicalId, players)}` };
      else if (p.event === 'cancelled') n = { kind: 'cancelled', text: `أُلغيت مواجهة ${nameOf(c.requesterPhysicalId, players)} و${nameOf(c.targetPhysicalId, players)}` };
      else if (p.event === 'ended') n = { kind: 'done', text: `انتهت المواجهة — القرار للتصويت` };
      if (n) {
        setNotice(n);
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(null), 6000);
      }
    };
    const onPhase = (d: any) => {
      if (d?.phase !== 'DAY_DISCUSSION') { setConf(null); setNotice(null); }
      else s.emit('day:get-confrontations', { roomId }, (r: any) => { if (r?.success) setConf(r); });
    };
    s.emit('day:get-confrontations', { roomId }, (r: any) => { if (r?.success && r.phase === 'DAY_DISCUSSION') setConf(r); });
    s.on('day:confrontation-updated', onUpd);
    s.on('game:phase-changed', onPhase);
    return () => {
      s.off('day:confrontation-updated', onUpd);
      s.off('game:phase-changed', onPhase);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, players.length]);

  const list = conf?.confrontations || [];
  const active = list.find(c => c.status === 'OPENING' || c.status === 'RESPONSE') || null;
  const pending = list.filter(c => c.status === 'PENDING');
  const accepted = list.filter(c => c.status === 'ACCEPTED');
  useEffect(() => {
    if (!active && pending.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active, pending.length]);

  const P = (pid: number) => players.find(p => p.physicalId === pid);
  const secsLeft = (dl: number) => Math.max(0, Math.ceil((dl - now) / 1000));

  // 🎴 الوجه العلنيّ لكرت اللاعب (كما على طاولة النقاش) — المتحدّث أكبر ومضاء وتحته موجاتٌ صوتيّة (مرئيّة فقط، بلا صوت)
  const Card = ({ c, side }: { c: ConfItem; side: 'req' | 'tgt' }) => {
    const pid = side === 'req' ? c.requesterPhysicalId : c.targetPhysicalId;
    const on = side === 'req' ? c.status === 'OPENING' : c.status === 'RESPONSE';
    const p = P(pid);
    return (
      <motion.div
        animate={{ scale: on ? 1.18 : 0.82, opacity: on ? 1 : 0.4, y: on ? -10 : 10 }}
        transition={{ type: 'spring', damping: 18, stiffness: 110 }}
        className="flex flex-col items-center gap-4"
      >
        <p className={`text-xs font-mono tracking-[0.3em] uppercase ${on ? 'text-[#C5A059]' : 'text-[#666]'}`}>
          {side === 'req' ? 'الطالب · CHALLENGER' : 'المستهدَف · ACCUSED'}
        </p>
        <div className={on ? 'rounded-2xl shadow-[0_0_80px_rgba(197,160,89,0.45)] ring-2 ring-[#C5A059]' : 'rounded-2xl'}>
          <MafiaCard
            playerNumber={pid}
            playerName={p?.name || `لاعب #${pid}`}
            role={null}
            gender={p?.gender === 'FEMALE' ? 'FEMALE' : 'MALE'}
            isFlipped={false}
            flippable={false}
            size="lg"
            isAlive={true}
            avatarUrl={p?.avatarUrl}
            rankTier={p?.rankTier}
            cosmetics={p?.cosmetics}
          />
        </div>
        {/* 🎙️ موجات صوتيّة — أعمدة تتنفّس عشوائيّاً ما دام دورُه في الكلام */}
        <div className="h-12 flex items-end justify-center gap-[5px]" aria-hidden>
          {on ? Array.from({ length: 13 }).map((_, i) => (
            <span
              key={i}
              className="conf-wave-bar block w-[6px] rounded-full bg-[#C5A059]"
              style={{ animationDelay: `${(i * 97) % 700}ms`, animationDuration: `${650 + ((i * 131) % 450)}ms` }}
            />
          )) : (
            <span className="text-[#555] font-mono text-xs tracking-widest">يستمع</span>
          )}
        </div>
      </motion.div>
    );
  };

  const waveCss = `
    @keyframes confWave { 0%,100% { height: 6px; opacity: .55 } 50% { height: 44px; opacity: 1 } }
    .conf-wave-bar { height: 6px; animation-name: confWave; animation-timing-function: ease-in-out; animation-iteration-count: infinite; box-shadow: 0 0 10px rgba(197,160,89,.6); }
    @media (prefers-reduced-motion: reduce) { .conf-wave-bar { animation: none; height: 24px } }
  `;

  return (
    <>
      {/* ── شريط الطلبات/المقبولة ── */}
      <AnimatePresence>
        {!active && (pending.length > 0 || accepted.length > 0) && (
          <motion.div
            key="conf-bar"
            initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center"
            dir="rtl"
          >
            {pending.map(c => (
              <div key={c.id} className="px-6 py-2.5 rounded-full border border-amber-500/50 bg-black/80 backdrop-blur text-white text-lg flex items-center gap-3 shadow-lg">
                <span>⚔️</span>
                <span className="font-bold">{P(c.requesterPhysicalId)?.name || `#${c.requesterPhysicalId}`}</span>
                <span className="text-[#808080]">يطلب مواجهة</span>
                <span className="font-bold">{P(c.targetPhysicalId)?.name || `#${c.targetPhysicalId}`}</span>
                <span className="font-mono text-amber-300 text-sm">{c.timedOut ? 'بانتظار الليدر' : `${secsLeft(c.respondBy)}ث`}</span>
              </div>
            ))}
            {accepted.map(c => (
              <div key={c.id} className="px-6 py-2.5 rounded-full border border-[#C5A059]/60 bg-black/80 backdrop-blur text-white text-lg flex items-center gap-3 shadow-lg">
                <span>⚔️</span>
                <span className="font-bold">{P(c.requesterPhysicalId)?.name || `#${c.requesterPhysicalId}`}</span>
                <span className="text-[#C5A059]">×</span>
                <span className="font-bold">{P(c.targetPhysicalId)?.name || `#${c.targetPhysicalId}`}</span>
                <span className="text-[#C5A059] text-sm">مواجهة مقبولة — بعد آخر متحدّث</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── إعلان الرفض/الإلغاء/الانتهاء ── */}
      <AnimatePresence>
        {notice && !active && (
          <motion.div
            key="conf-notice"
            initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            className={`fixed top-24 left-1/2 -translate-x-1/2 z-[60] px-10 py-5 rounded-2xl border-2 bg-black/90 backdrop-blur text-center shadow-2xl ${notice.kind === 'done' ? 'border-emerald-500/60' : 'border-[#8A0303]'}`}
            dir="rtl"
          >
            <p className="text-3xl font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>
              {notice.kind === 'declined' ? '🚫 ' : notice.kind === 'cancelled' ? '✕ ' : '✅ '}{notice.text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── المواجهة الجارية: طبقة كاملة ── */}
      <AnimatePresence>
        {active && (
          <motion.div
            key="conf-active"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] bg-black/92 backdrop-blur-md flex flex-col items-center justify-center gap-8"
            dir="rtl"
          >
            <div className="text-center">
              <p className="text-[#8A0303] font-mono tracking-[0.5em] text-sm uppercase">Confrontation</p>
              <h2 className="text-5xl font-black text-white mt-1" style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 30px rgba(138,3,3,0.5)' }}>⚔️ مواجهة</h2>
              <p className="text-[#C5A059] text-xl mt-2">{active.status === 'OPENING' ? 'كلمة الطالب' : 'ردّ المستهدَف'}</p>
            </div>
            <style>{waveCss}</style>
            <div className="flex items-center gap-16">
              <Card c={active} side="req" />
              <div className="text-center px-4">
                <span className={`block text-[10rem] leading-none font-black font-mono ${active.stageStartedAt && secsLeft(active.stageStartedAt + active.stageSeconds * 1000) <= 10 ? 'text-[#8A0303] animate-pulse' : 'text-white'}`}>
                  {active.stageStartedAt ? secsLeft(active.stageStartedAt + active.stageSeconds * 1000) : active.stageSeconds}
                </span>
                <span className="text-[#808080] font-mono tracking-widest">SEC</span>
              </div>
              <Card c={active} side="tgt" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
