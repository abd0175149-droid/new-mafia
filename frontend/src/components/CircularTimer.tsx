'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface CircularTimerProps {
  /** الوقت المتبقي بالثواني */
  timeRemaining: number;
  /** إجمالي الوقت بالثواني */
  totalTime: number;
  /** حجم الدائرة بالبكسلات */
  size?: number;
  /** تفعيل صوت دقات القلب */
  enableHeartbeat?: boolean;
  /** تفعيل اهتزاز الشاشة */
  enableShake?: boolean;
}

// ── Web Audio: دقات قلب ──
function playHeartbeat(intensity: 'slow' | 'fast') {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';

    // نبضة مزدوجة (lub-dub)
    const vol = intensity === 'fast' ? 0.25 : 0.12;
    osc.frequency.setValueAtTime(60, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(vol * 0.7, ctx.currentTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (_) {}
}

export default function CircularTimer({
  timeRemaining,
  totalTime,
  size = 200,
  enableHeartbeat = true,
  enableShake = true,
}: CircularTimerProps) {
  const prevTimeRef = useRef(timeRemaining);

  // ── حساب النسبة ──
  const progress = totalTime > 0 ? timeRemaining / totalTime : 0;
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  // ── تحديد اللون بناءً على النسبة ──
  let strokeColor = '#2E5C31'; // أخضر
  let glowColor = 'rgba(46, 92, 49, 0.3)';
  if (progress <= 0.3) {
    strokeColor = '#8A0303'; // أحمر
    glowColor = 'rgba(138, 3, 3, 0.5)';
  } else if (progress <= 0.6) {
    strokeColor = '#C5A059'; // ذهبي
    glowColor = 'rgba(197, 160, 89, 0.3)';
  }

  // ── الرقم الظاهر ──
  const displayTime = Math.ceil(timeRemaining);
  const isUrgent = timeRemaining <= 10;
  const isCritical = timeRemaining <= 5;

  // ── دقات القلب ──
  useEffect(() => {
    if (!enableHeartbeat) return;
    if (timeRemaining <= 0 || timeRemaining === prevTimeRef.current) return;
    prevTimeRef.current = timeRemaining;

    if (isCritical && displayTime > 0) {
      playHeartbeat('fast');
    } else if (isUrgent && displayTime > 0 && displayTime % 2 === 0) {
      playHeartbeat('slow');
    }
  }, [displayTime, enableHeartbeat, isUrgent, isCritical]);

  return (
    <motion.div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      animate={
        enableShake && isCritical && displayTime > 0
          ? { x: [0, -2, 2, -1, 1, 0], y: [0, 1, -1, 1, -1, 0] }
          : {}
      }
      transition={
        isCritical
          ? { duration: 0.3, repeat: Infinity, repeatType: 'loop' }
          : {}
      }
    >
      {/* خلفية التوهج */}
      <div
        className="absolute inset-0 rounded-full transition-all duration-500"
        style={{
          boxShadow: `0 0 ${isUrgent ? 40 : 20}px ${glowColor}`,
        }}
      />

      {/* SVG الدائرة */}
      <svg
        width={size}
        height={size}
        className="absolute inset-0 -rotate-90"
      >
        {/* المسار الخلفي */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1a1a1a"
          strokeWidth="8"
        />
        {/* مسار التقدم */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-500 ease-linear"
          style={{
            filter: `drop-shadow(0 0 8px ${glowColor})`,
          }}
        />
      </svg>

      {/* الرقم في المنتصف */}
      <motion.div
        key={displayTime}
        initial={{ scale: 1.3, opacity: 0.7 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative z-10 flex flex-col items-center"
      >
        <span
          className={`font-mono font-black leading-none transition-colors duration-300 ${
            isCritical
              ? 'text-[#8A0303] animate-pulse'
              : isUrgent
              ? 'text-[#C5A059]'
              : 'text-white'
          }`}
          style={{ fontSize: size * 0.35 }}
        >
          {displayTime}
        </span>
        <span
          className="text-[#808080] font-mono uppercase tracking-widest"
          style={{ fontSize: size * 0.07 }}
        >
          SEC
        </span>
      </motion.div>
    </motion.div>
  );
}
