'use client';
// ══════════════════════════════════════════════════════
// ⚔️ مواجهة النهار على شاشة العرض
//   - طلبٌ معلّق/مقبول: شريطٌ أعلى الشاشة
//   - رفض: إعلانٌ لثوانٍ («رفض فلان مواجهة فلان») — قرار المالك: الرفض علنيّ
//   - جارية: طبقةٌ كاملة ببطاقتين مضاءتين معاً (الطرفان يتحدّثان) ومؤقّتٍ واحد في المنتصف
// تُركَّب على مستوى الصفحة (لا داخل فرع مرحلة) كي لا تُقطع بالانتقالات.
// ══════════════════════════════════════════════════════
import { memo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSocket } from '@/lib/socket';
import MafiaCard from '@/components/MafiaCard';
import type { ConfPayload, ConfItem } from '@/app/leader/LeaderConfrontationPanel';

interface Props {
  roomId: string;
  players: any[];   // الروستر العامّ (اسم/جنس/صورة/رتبة/تجميل) — الوجه العلنيّ للكرت
}

  // 🎴 الوجه العلنيّ لكرت اللاعب (كما على طاولة النقاش):
  //   المتحدّث يتقدّم ويكبر بنبضة توهّجٍ ذهبيّة وموجاتٍ صوتيّة مرئيّة؛ المستمع يتراجع ويبهت ويميل قليلاً.
  //   تبدُّل الدور يُعلَن بشريطٍ ينزلق من الأعلى ونبضة ضوءٍ تعبر الشاشة.
// 🔴 مُعرَّفة خارج المكوّن ومُحفَّظة (memo): تعريفها داخله كان يعيد تركيبها مع كلّ نبضة مؤقّت (٤ مرّات في الثانية)
//    فتُعاد حركة الدخول والتوهّج من الصفر — وهذا «الرمش» الذي رآه المالك. الآن لا تُعاد إلّا عند تبدّل الدور.
const Card = memo(function Card({ pid, p, side }: { pid: number; p: any; side: 'req' | 'tgt' }) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 30, scale: .9 }}
        animate={{ opacity: 1, y: 0, scale: 1.12 }}
        transition={{ type: 'spring', damping: 18, stiffness: 120 }}
        className="flex flex-col items-center gap-4 will-change-transform"
      >
        <p className="text-xs font-mono uppercase tracking-[0.42em] text-[#C5A059]">
          {side === 'req' ? 'الطالب · CHALLENGER' : 'المستهدَف · ACCUSED'}
        </p>
        <div className="relative rounded-2xl conf-glow ring-2 ring-[#C5A059]">
          <span className="conf-orbit" aria-hidden />
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
          <span className="absolute -top-5 -left-5 w-14 h-14 rounded-full bg-[#C5A059] text-black text-2xl flex items-center justify-center shadow-[0_0_30px_rgba(197,160,89,.8)]">🎙️</span>
        </div>
        {/* 🎙️ موجات صوتيّة — تحت كلا الطرفين لأنّهما يتحدّثان معاً (مرئيّة فقط) */}
        <div className="h-14 flex items-end justify-center gap-[5px]" aria-hidden>
          {Array.from({ length: 17 }).map((_, i) => (
            <span
              key={i}
              className="conf-wave-bar block w-[6px] rounded-full bg-[#C5A059]"
              style={{ animationDelay: `${((i * 97) + (side === 'tgt' ? 350 : 0)) % 700}ms`, animationDuration: `${600 + ((i * 131) % 500)}ms` }}
            />
          ))}
        </div>
      </motion.div>
    );
});

const waveCss = `
    /* ⚔️ أثناء المواجهة يُخفى شريط ترتيب النقاش الجانبيّ (قرار المالك) — هذا الـstyle لا يُركَّب إلّا مع الطبقة */
    .discussion-queue-rail { display: none !important; }
    @keyframes confWave { 0%,100% { height: 6px; opacity: .55 } 50% { height: 52px; opacity: 1 } }
    .conf-wave-bar { height: 6px; animation-name: confWave; animation-timing-function: ease-in-out; animation-iteration-count: infinite; box-shadow: 0 0 10px rgba(197,160,89,.6); }
    @keyframes confGlow { 0%,100% { box-shadow: 0 0 40px rgba(197,160,89,.35), 0 0 0 0 rgba(197,160,89,.35) } 50% { box-shadow: 0 0 110px rgba(197,160,89,.65), 0 0 0 18px rgba(197,160,89,0) } }
    .conf-glow { box-shadow: 0 0 70px rgba(197,160,89,.5); }
    @keyframes confOrbit { to { transform: rotate(360deg) } }
    .conf-orbit { position: absolute; inset: -14px; border-radius: 22px; pointer-events: none;
      background: conic-gradient(from 0deg, transparent 0 70%, rgba(197,160,89,.9) 85%, transparent 100%);
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; padding: 3px;
      animation: confOrbit 2.6s linear infinite; }
    @keyframes confSweep { from { transform: translateX(-120%) } to { transform: translateX(120%) } }
    .conf-sweep { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    .conf-sweep::after { content: ''; position: absolute; top: 0; bottom: 0; width: 40%; background: linear-gradient(90deg, transparent, rgba(197,160,89,.18), transparent); animation: confSweep 1.1s ease-out 1; }
    @media (prefers-reduced-motion: reduce) { .conf-wave-bar, .conf-glow, .conf-orbit, .conf-sweep::after { animation: none !important; } .conf-wave-bar { height: 24px } }
  `;

// ⏱️ حلقة تقدّم حول المؤقّت (تحمرّ تحت ١٠ث)
function Ring({ left, total }: { left: number; total: number }) {
    const r = 118, C = 2 * Math.PI * r, frac = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
    const danger = left <= 10;
    return (
      <div className={`relative w-[300px] h-[300px] flex items-center justify-center `}>
        <svg viewBox="0 0 300 300" className="absolute inset-0 -rotate-90">
          <circle cx="150" cy="150" r={r} fill="none" stroke="#1f1a12" strokeWidth="10" />
          <circle cx="150" cy="150" r={r} fill="none" stroke={danger ? '#8A0303' : '#C5A059'} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: 'stroke-dashoffset .25s linear, stroke .3s' }} />
        </svg>
        <div className="text-center">
          <span className={`block text-[8.5rem] leading-none font-black font-mono ${danger ? 'text-[#ff4d4d]' : 'text-white'}`}>{left}</span>
          <span className="text-[#808080] font-mono tracking-[0.4em] text-sm">SEC · من {total}</span>
        </div>
      </div>
    );
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
  const active = list.find(c => c.status === 'LIVE') || null;
  const pending = list.filter(c => c.status === 'PENDING');
  const accepted = list.filter(c => c.status === 'ACCEPTED');
  useEffect(() => {
    if (!active && pending.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active, pending.length]);

  const P = (pid: number) => players.find(p => p.physicalId === pid);
  const secsLeft = (dl: number) => Math.max(0, Math.ceil((dl - now) / 1000));

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
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }}
            className="fixed inset-0 z-[65] bg-black/92 backdrop-blur-md flex flex-col items-center justify-center gap-6 overflow-hidden"
            dir="rtl"
          >
            <style>{waveCss}</style>
            {/* نبضة ضوءٍ تعبر الشاشة عند البدء */}
            <div className="conf-sweep" aria-hidden />
            <div className="text-center relative z-10">
              <p className="text-[#8A0303] font-mono tracking-[0.5em] text-sm uppercase">Confrontation</p>
              <h2 className="text-5xl font-black text-white mt-1" style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 30px rgba(138,3,3,0.5)' }}>⚔️ مواجهة</h2>
              <motion.p
                initial={{ y: -24, opacity: 0, scale: .9 }} animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ type: 'spring', damping: 14, stiffness: 160 }}
                className="inline-block mt-3 px-6 py-1.5 rounded-full border border-[#C5A059]/60 bg-[#C5A059]/10 text-[#C5A059] text-xl"
              >
                🎙️ الطرفان يتحدّثان معاً
              </motion.p>
            </div>
            <div className="flex items-center gap-10 relative z-10" style={{ perspective: 1400 }}>
              <Card pid={active.requesterPhysicalId} p={P(active.requesterPhysicalId)} side="req" />
              <Ring
                left={active.stageStartedAt ? secsLeft(active.stageStartedAt + active.stageSeconds * 1000) : active.stageSeconds}
                total={active.stageSeconds}
              />
              <Card pid={active.targetPhysicalId} p={P(active.targetPhysicalId)} side="tgt" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
