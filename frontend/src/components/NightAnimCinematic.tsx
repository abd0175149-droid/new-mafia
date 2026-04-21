'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import MafiaCard from '@/components/MafiaCard';

// ══════════════════════════════════════════════════════
// 🌙 Night Cinematic Animation — GSAP-powered
// تأثيرات بصرية سينمائية لأحداث الليل
// ══════════════════════════════════════════════════════

interface NightAnimProps {
  data: {
    type: string;
    targetPhysicalId?: number;
    targetName?: string;
    extra?: { targetRole?: string; [key: string]: any };
  };
}

// ── مؤثر صوتي بسيط عبر Web Audio API ──
function playImpactSound(type: string) {
  try {
    const ACClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!ACClass) return;
    const ctx = new ACClass();

    if (type === 'slash') {
      // صوت قطع حاد
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === 'shield') {
      // صوت درع (ارتداد معدني)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } else if (type === 'snipe') {
      // صوت طلقة
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(2000, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'eye') {
      // صوت نبض خافت
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.8);
    } else if (type === 'silence') {
      // صوت ثابت مكتوم
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.6);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    }
  } catch (_) {}
}

// ══════════════════════════════════════════
// 🔪 Assassination Animation — خط قطع أحمر يعبر الشاشة
// ══════════════════════════════════════════
function AssassinationAnim() {
  const slashRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    playImpactSound('slash');
  }, []);

  return (
    <div className="relative w-full h-[300px] flex items-center justify-center overflow-hidden">
      {/* خط القطع — يعبر الشاشة قُطرياً */}
      <motion.div
        ref={slashRef}
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <motion.div
          className="absolute top-0 left-0 w-[200%] h-[3px] bg-gradient-to-r from-transparent via-[#ff0000] to-transparent origin-left"
          style={{ transform: 'rotate(25deg)', top: '50%', left: '-50%' }}
          initial={{ x: '-100%', opacity: 0 }}
          animate={{ x: '100%', opacity: [0, 1, 1, 0] }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
        />
        {/* بقع دموية */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-[#8A0303]"
            style={{
              width: 8 + Math.random() * 20,
              height: 8 + Math.random() * 20,
              top: `${30 + Math.random() * 40}%`,
              left: `${20 + Math.random() * 60}%`,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.5, 1], opacity: [0, 0.8, 0.4] }}
            transition={{ delay: 0.3 + i * 0.08, duration: 0.5, ease: 'easeOut' }}
          />
        ))}
      </motion.div>

      {/* الأيقونة + النص */}
      <motion.div className="relative z-10 text-center">
        <motion.div
          className="text-8xl mb-4 drop-shadow-[0_0_30px_rgba(138,3,3,0.8)]"
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: [0, 1.4, 1], rotate: [-90, 10, 0] }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          🔪
        </motion.div>
        <motion.p
          className="text-3xl md:text-4xl font-black text-[#8A0303] tracking-widest"
          style={{ fontFamily: 'Amiri, serif' }}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          عملية اغتيال جارية
        </motion.p>
      </motion.div>

      {/* وهج أحمر خلفي */}
      <motion.div
        className="absolute inset-0 bg-[#8A0303]/10 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.3, 0] }}
        transition={{ duration: 1.2, ease: 'easeInOut' }}
      />
    </div>
  );
}

// ══════════════════════════════════════════
// 👁️ Investigation Animation — عين تفتح وتغلق
// ══════════════════════════════════════════
function InvestigationAnim() {
  useEffect(() => {
    playImpactSound('eye');
  }, []);

  return (
    <div className="relative w-full h-[300px] flex items-center justify-center overflow-hidden">
      {/* حلقة نبض دائرية */}
      <motion.div
        className="absolute w-[250px] h-[250px] rounded-full border-2 border-[#C5A059]/40"
        animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-[180px] h-[180px] rounded-full border border-[#C5A059]/20"
        animate={{ scale: [1, 1.6, 1], opacity: [0.3, 0, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
      />

      <motion.div className="relative z-10 text-center">
        {/* عين تفتح وتغلق */}
        <motion.div
          className="text-8xl mb-4 drop-shadow-[0_0_40px_rgba(197,160,89,0.6)]"
          animate={{
            scaleY: [0.1, 1, 1, 0.1, 0.1, 1],
            opacity: [0.5, 1, 1, 0.3, 0.3, 1],
          }}
          transition={{ duration: 3, repeat: Infinity, times: [0, 0.15, 0.7, 0.8, 0.85, 1] }}
        >
          👁️
        </motion.div>
        <motion.p
          className="text-3xl md:text-4xl font-black text-[#C5A059] tracking-widest"
          style={{ fontFamily: 'Amiri, serif' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0.4, 0.4, 1] }}
          transition={{ duration: 3, repeat: Infinity, times: [0, 0.15, 0.7, 0.8, 0.85, 1] }}
        >
          تحقيق جارٍ
        </motion.p>
      </motion.div>
    </div>
  );
}

// ══════════════════════════════════════════
// 🛡️ Protection Animation — درع يظهر ويتوهج
// ══════════════════════════════════════════
function ProtectionAnim() {
  useEffect(() => {
    playImpactSound('shield');
  }, []);

  return (
    <div className="relative w-full h-[300px] flex items-center justify-center overflow-hidden">
      {/* هالة خضراء */}
      <motion.div
        className="absolute w-[300px] h-[300px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(46,92,49,0.3) 0%, transparent 70%)' }}
        animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 2, repeat: Infinity }}
      />

      <motion.div className="relative z-10 text-center">
        <motion.div
          className="text-8xl mb-4 drop-shadow-[0_0_30px_rgba(46,92,49,0.8)]"
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.3, 1] }}
          transition={{ duration: 0.6, type: 'spring', damping: 10 }}
        >
          🛡️
        </motion.div>
        {/* خط حماية أفقي ينبض */}
        <motion.div
          className="w-48 h-[2px] bg-gradient-to-r from-transparent via-[#2E5C31] to-transparent mx-auto mb-4"
          animate={{ opacity: [0.3, 1, 0.3], scaleX: [0.8, 1.2, 0.8] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <motion.p
          className="text-3xl md:text-4xl font-black text-[#2E5C31] tracking-widest"
          style={{ fontFamily: 'Amiri, serif' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          حماية طبية
        </motion.p>
      </motion.div>
    </div>
  );
}

// ══════════════════════════════════════════
// 🎯 Snipe Animation — تصويب + طلقة
// ══════════════════════════════════════════
function SnipeAnim() {
  useEffect(() => {
    const timer = setTimeout(() => playImpactSound('snipe'), 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative w-full h-[300px] flex items-center justify-center overflow-hidden">
      {/* شعيرات التصويب */}
      <motion.div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {/* أفقي */}
        <motion.div
          className="absolute w-[80%] h-[1px] bg-[#8A0303]/60"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
        {/* عمودي */}
        <motion.div
          className="absolute w-[1px] h-[80%] bg-[#8A0303]/60"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
        {/* دائرة التصويب */}
        <motion.div
          className="absolute w-24 h-24 rounded-full border-2 border-[#8A0303]/80"
          initial={{ scale: 3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
        <motion.div
          className="absolute w-12 h-12 rounded-full border border-[#8A0303]/40"
          initial={{ scale: 3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
        />
      </motion.div>

      {/* وميض الطلقة */}
      <motion.div
        className="absolute inset-0 bg-white pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 0, 0.8, 0] }}
        transition={{ duration: 1.2, times: [0, 0.49, 0.5, 0.52, 0.6] }}
      />

      <motion.div className="relative z-10 text-center">
        <motion.div
          className="text-8xl mb-4 drop-shadow-[0_0_30px_rgba(138,3,3,0.8)]"
          initial={{ scale: 2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          🎯
        </motion.div>
        <motion.p
          className="text-3xl md:text-4xl font-black text-[#8A0303] tracking-widest"
          style={{ fontFamily: 'Amiri, serif' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          تصويب القناص
        </motion.p>
      </motion.div>
    </div>
  );
}

// ══════════════════════════════════════════
// 🤐 Silence Animation — شريط عبر الفم
// ══════════════════════════════════════════
function SilenceAnim() {
  useEffect(() => {
    playImpactSound('silence');
  }, []);

  return (
    <div className="relative w-full h-[300px] flex items-center justify-center overflow-hidden">
      <motion.div className="relative z-10 text-center">
        <motion.div
          className="text-8xl mb-4 relative"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          🤐
          {/* شريط لاصق متحرك */}
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-6 bg-[#555]/80 border border-[#333]"
            style={{ transform: 'translate(-50%, -50%) rotate(-5deg)' }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.3, duration: 0.4, ease: 'easeOut' }}
          />
        </motion.div>
        <motion.p
          className="text-3xl md:text-4xl font-black text-[#555] tracking-widest"
          style={{ fontFamily: 'Amiri, serif' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          عملية إسكات
        </motion.p>
      </motion.div>

      {/* خطوط ستاتيك (Glitch lines) */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-[1px] bg-[#555]/30"
          style={{
            width: `${30 + Math.random() * 50}%`,
            top: `${10 + Math.random() * 80}%`,
            left: `${Math.random() * 40}%`,
          }}
          animate={{ opacity: [0, 1, 0], x: [0, Math.random() * 20 - 10, 0] }}
          transition={{ duration: 0.3, repeat: Infinity, repeatDelay: Math.random() * 2, delay: Math.random() * 1.5 }}
        />
      ))}
    </div>
  );
}

// ══════════════════════════════════════════
// 🩸 Morning: Assassination Success
// ══════════════════════════════════════════
function MorningAssassinationAnim({ data }: NightAnimProps) {
  useEffect(() => { playImpactSound('slash'); }, []);
  const targetRole = data.extra?.targetRole || null;

  return (
    <div className="text-center py-4">
      <motion.div
        className="text-8xl mb-4 drop-shadow-[0_0_40px_rgba(138,3,3,0.8)]"
        animate={{ scale: [0.8, 1.2, 1], rotate: [0, -5, 5, 0] }}
        transition={{ duration: 0.8 }}
      >
        🩸
      </motion.div>
      <motion.p
        className="text-3xl md:text-4xl font-black text-[#8A0303] tracking-widest mb-3"
        style={{ fontFamily: 'Amiri, serif' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        تم الاغتيال
      </motion.p>
      {/* كارت اللاعب */}
      {targetRole ? (
        <motion.div
          className="flex justify-center mt-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, type: 'spring', damping: 12 }}
        >
          <MafiaCard
            playerNumber={data.targetPhysicalId!}
            playerName={data.targetName || 'Unknown'}
            role={targetRole}
            isFlipped={true}
            flippable={false}
            isAlive={true}
            size="fluid"
            className="w-48 h-[16rem] md:w-56 md:h-[19rem]"
          />
        </motion.div>
      ) : data.targetName && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
          <p className="text-white text-2xl font-black mt-4" style={{ fontFamily: 'Amiri, serif' }}>{data.targetName}</p>
          <p className="text-[#555] font-mono text-sm mt-1">#{data.targetPhysicalId}</p>
        </motion.div>
      )}
      {/* خط أحمر يعبر ثابت */}
      <motion.div
        className="w-64 h-[2px] bg-gradient-to-r from-transparent via-[#8A0303] to-transparent mx-auto mt-6"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.5, duration: 0.6 }}
      />
    </div>
  );
}

// ══════════════════════════════════════════
// 🛡️ Morning: Protection Success
// ══════════════════════════════════════════
function MorningProtectionAnim() {
  useEffect(() => { playImpactSound('shield'); }, []);

  return (
    <div className="text-center py-4">
      <motion.div
        className="text-8xl mb-4 drop-shadow-[0_0_30px_rgba(46,92,49,0.8)]"
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: [0, 1.4, 1], rotate: [20, -5, 0] }}
        transition={{ duration: 0.7, type: 'spring' }}
      >
        🛡️
      </motion.div>
      <motion.p
        className="text-3xl md:text-4xl font-black text-[#2E5C31] tracking-widest mb-3"
        style={{ fontFamily: 'Amiri, serif' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        نجاة بالحماية
      </motion.p>
      <motion.p
        className="text-[#2E5C31] text-lg font-mono mt-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        تم إنقاذ أحد اللاعبين من الاغتيال
      </motion.p>
    </div>
  );
}

// ══════════════════════════════════════════
// 🎯 Morning: Snipe Results
// ══════════════════════════════════════════
function MorningSnipeAnim({ data, success }: NightAnimProps & { success: boolean }) {
  useEffect(() => { playImpactSound('snipe'); }, []);
  const targetRole = data.extra?.targetRole || null;
  const sniperPhysicalId = data.extra?.sniperPhysicalId as number | undefined;
  const sniperName = data.extra?.sniperName as string | undefined;

  return (
    <div className="text-center py-4">
      <motion.div
        className={`text-8xl mb-4 drop-shadow-[0_0_30px_${success ? 'rgba(197,160,89,0.8)' : 'rgba(138,3,3,0.8)'}]`}
        initial={{ scale: 0.5 }}
        animate={{ scale: [0.5, 1.3, 1] }}
        transition={{ duration: 0.5 }}
      >
        {success ? '🎯' : '💀'}
      </motion.div>
      <motion.p
        className={`text-3xl md:text-4xl font-black ${success ? 'text-[#C5A059]' : 'text-[#8A0303]'} tracking-widest mb-3`}
        style={{ fontFamily: 'Amiri, serif' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        {success ? 'القناص نجح' : 'القناص فشل'}
      </motion.p>

      {/* القنص الفاشل — عرض كارد القناص + كارد الهدف */}
      {!success && sniperPhysicalId && targetRole ? (
        <motion.div
          className="flex justify-center items-end gap-6 mt-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, type: 'spring', damping: 12 }}
        >
          {/* كارد القناص */}
          <div className="flex flex-col items-center">
            <p className="text-[#C5A059] text-xs font-mono mb-2 tracking-widest">القناص</p>
            <MafiaCard
              playerNumber={sniperPhysicalId}
              playerName={sniperName || 'Unknown'}
              role="SNIPER"
              isFlipped={true}
              flippable={false}
              isAlive={true}
              size="fluid"
              className="w-40 h-[14rem] md:w-48 md:h-[16rem]"
            />
          </div>
          {/* كارد الهدف */}
          <div className="flex flex-col items-center">
            <p className="text-[#8A0303] text-xs font-mono mb-2 tracking-widest">الهدف</p>
            <MafiaCard
              playerNumber={data.targetPhysicalId!}
              playerName={data.targetName || 'Unknown'}
              role={targetRole}
              isFlipped={true}
              flippable={false}
              isAlive={true}
              size="fluid"
              className="w-40 h-[14rem] md:w-48 md:h-[16rem]"
            />
          </div>
        </motion.div>
      ) : targetRole ? (
        /* القنص الناجح — عرض كارد الهدف فقط */
        <motion.div
          className="flex justify-center mt-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, type: 'spring', damping: 12 }}
        >
          <MafiaCard
            playerNumber={data.targetPhysicalId!}
            playerName={data.targetName || 'Unknown'}
            role={targetRole}
            isFlipped={true}
            flippable={false}
            isAlive={true}
            size="fluid"
            className="w-48 h-[16rem] md:w-56 md:h-[19rem]"
          />
        </motion.div>
      ) : (
        <motion.p
          className={`${success ? 'text-[#C5A059]' : 'text-[#8A0303]'} text-lg font-mono mt-4`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          {success ? 'خرج عضو مافيا من اللعبة' : 'خرج لاعبان من اللعبة (القناص + الهدف)'}
        </motion.p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// 🤐 Morning: Silenced Player
// ══════════════════════════════════════════
function MorningSilencedAnim({ data }: NightAnimProps) {
  useEffect(() => { playImpactSound('silence'); }, []);

  return (
    <div className="text-center py-4">
      <motion.div
        className="text-8xl mb-4 drop-shadow-[0_0_30px_rgba(100,100,100,0.6)]"
        initial={{ scale: 0.8 }}
        animate={{ scale: [0.8, 1.2, 1] }}
        transition={{ duration: 0.6 }}
      >
        🤐
      </motion.div>
      <motion.p
        className="text-3xl md:text-4xl font-black text-[#888] tracking-widest mb-3"
        style={{ fontFamily: 'Amiri, serif' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        تم إسكات لاعب
      </motion.p>
      {data.targetName && (
        <motion.div
          className="flex justify-center mt-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, type: 'spring', damping: 12 }}
        >
          <MafiaCard
            playerNumber={data.targetPhysicalId!}
            playerName={data.targetName}
            role={null}
            isFlipped={false}
            flippable={false}
            isAlive={true}
            isSilenced={true}
            size="fluid"
            className="w-48 h-[16rem] md:w-56 md:h-[19rem]"
          />
        </motion.div>
      )}
      <motion.div
        className="w-64 h-[2px] bg-gradient-to-r from-transparent via-[#555] to-transparent mx-auto mt-6"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.5, duration: 0.6 }}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🌙 Main NightAnimCinematic — Entry Point
// يختار الأنيميشن المناسبة حسب نوع الحدث
// ══════════════════════════════════════════════════════
export default function NightAnimCinematic({ data }: NightAnimProps) {
  switch (data.type) {
    // أحداث الطابور الليلي (Queue)
    case 'ASSASSINATION_ATTEMPT':
      return <AssassinationAnim />;
    case 'INVESTIGATION':
      return <InvestigationAnim />;
    case 'PROTECTION':
      return <ProtectionAnim />;
    case 'SNIPE':
      return <SnipeAnim />;
    case 'SILENCE':
      return <SilenceAnim />;

    // أحداث ملخص الصباح (Morning Recap)
    case 'ASSASSINATION':
      return <MorningAssassinationAnim data={data} />;
    case 'ASSASSINATION_BLOCKED':
      return <MorningProtectionAnim />;
    case 'SILENCED':
      return <MorningSilencedAnim data={data} />;
    case 'SNIPE_MAFIA':
      return <MorningSnipeAnim data={data} success={true} />;
    case 'SNIPE_CITIZEN':
      return <MorningSnipeAnim data={data} success={false} />;

    // Fallback — عرض أساسي
    default:
      return (
        <div className="text-center py-4">
          <div className="text-7xl md:text-8xl mb-4">❓</div>
          <p className="text-2xl font-black text-[#808080] tracking-widest" style={{ fontFamily: 'Amiri, serif' }}>
            {data.type}
          </p>
        </div>
      );
  }
}
