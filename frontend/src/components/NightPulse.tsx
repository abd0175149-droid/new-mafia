'use client';

// ══════════════════════════════════════════════════════
// 🌙 نبض الليلة — تبويب تقدّم الفعاليّة في تطبيق اللاعب
//
// الجدول الذي يُطبع قبل الليلة خطّةٌ لا وعد. هذا التبويب يجعل الفارق بين
// الخطّة والواقع مرئيّاً: في أيّ لعبةٍ نحن، وأيّ جولةٍ داخلها، وكم بقي لها،
// ومن ما زال حيّاً، ومتى يبدأ دورُك فعلاً لا حسب الورقة.
//
// 🔴 كلّ رقمٍ هنا مصدرُه الخادم. لا اشتقاقَ محلّيّ للترتيب ولا للانحراف —
//    مصدرٌ واحدٌ للحقيقة (activity-pulse.service.ts).
// 🔴 خانةُ المستقلّين تختفي عند الصفر: إظهار «مستقلّون ٠» يكشف أنّ الليلة
//    بلا مهرّج. ثابتٌ مورَّثٌ من TeamBar.tsx.
// ══════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ActivityPulse, PulseSlot } from '@/hooks/useActivityPulse';

const PHASE_AR: Record<string, string> = {
  LOBBY: 'غرفة الانتظار',
  ROLE_GENERATION: 'تجهيز الأدوار',
  ROLE_BINDING: 'توزيع الأدوار',
  DAY_DISCUSSION: 'نقاش النهار',
  DAY_VOTING: 'التصويت',
  DAY_JUSTIFICATION: 'مرحلة الدفاع',
  DAY_TIEBREAKER: 'كسر التعادل',
  DAY_ELIMINATION: 'كشف الإقصاء',
  NIGHT: 'الليل',
  MORNING_RECAP: 'أحداث الصباح',
  GAME_OVER: 'انتهت',
};
const WINNER_AR: Record<string, string> = { MAFIA: 'المافيا', CITIZEN: 'المواطنون', JESTER: 'المهرّج', ASSASSIN: 'السفّاح' };
const WINNER_COLOR: Record<string, string> = { MAFIA: '#D93A3F', CITIZEN: '#2A8FD4', JESTER: '#C08A1E', ASSASSIN: '#C08A1E' };

// ألوان الفرق — مُصادَقة على أرضيّة النوار:
// فصلُ عمى الألوان ΔE 8.2 (deutan) · الرؤية الطبيعيّة 18.0 · التباين ≥3:1
const TEAMS = [
  { k: 'mafiaAlive' as const,   icon: '🔪', label: 'مافيا',    c: '#D93A3F' },
  { k: 'citizenAlive' as const, icon: '🛡️', label: 'مواطنون',  c: '#2A8FD4' },
  { k: 'neutralAlive' as const, icon: '🎭', label: 'مستقلّون', c: '#C08A1E' },
];

/** عتبةُ الصمت: انحرافٌ دون سبع دقائق لا يُذكر — ليلةٌ تُعلن تأخّرها خمس دقائق تبدو متعثّرة وهي تسير جيّداً */
const DRIFT_FLOOR = 7;

const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Amman' });

const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// ══════════ قائمةٌ منسدلة ══════════
function Picker({ label, items, onPick }: {
  label: string;
  items: { id: number; label: string; sub?: string; on: boolean }[];
  onPick: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative flex-1 min-w-0" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold truncate transition-colors"
        style={{
          background: open ? 'rgba(197,160,89,.14)' : 'rgba(255,255,255,.04)',
          border: `1px solid ${open ? 'rgba(197,160,89,.5)' : 'rgba(255,255,255,.09)'}`,
          color: open ? '#C5A059' : '#E7E2D6',
        }}
      >
        <span className="truncate">{label}</span>
        <span className="text-[10px] shrink-0" style={{ color: '#C5A059' }}>▾</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14 }}
            className="absolute top-full mt-1.5 right-0 left-0 z-30 rounded-xl overflow-hidden"
            style={{ background: '#0F0F12', border: '1px solid rgba(197,160,89,.3)', boxShadow: '0 16px 34px rgba(0,0,0,.8)' }}
          >
            {items.map(it => (
              <button
                key={it.id}
                onClick={() => { onPick(it.id); setOpen(false); }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-right"
                style={{ background: it.on ? 'rgba(197,160,89,.1)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,.05)' }}
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold text-white truncate">{it.label}</span>
                  {it.sub && <span className="block text-[10px] text-gray-500 truncate">{it.sub}</span>}
                </span>
                {it.on && <span className="text-[12px] shrink-0" style={{ color: '#C5A059' }}>✓</span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════ حلقة الوقت المتبقّي ══════════
function TimerRing({ remaining, total }: { remaining: number; total: number }) {
  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const R = 33, C = 2 * Math.PI * R;
  const col = frac > 0.5 ? '#C5A059' : frac > 0.2 ? '#D9822B' : '#D93A3F';
  return (
    <div className="relative w-20 h-20 shrink-0">
      <svg width="80" height="80" viewBox="0 0 80 80" className="block -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="5" />
        <circle cx="40" cy="40" r={R} fill="none" stroke={col} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: 'stroke-dashoffset .9s linear' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[15px] font-bold text-white tabular-nums" dir="ltr">{mmss(remaining)}</span>
        <span className="text-[9px] text-gray-500">بقي للّعبة</span>
      </div>
    </div>
  );
}

// ══════════ الكتلة ══════════
const Block = ({ label, children, accent }: { label?: string; children: React.ReactNode; accent?: boolean }) => (
  <div className="rounded-2xl p-3.5" style={{
    background: accent ? 'rgba(197,160,89,.055)' : 'rgba(255,255,255,.028)',
    border: `1px solid ${accent ? 'rgba(197,160,89,.24)' : 'rgba(255,255,255,.06)'}`,
  }}>
    {label && <p className="text-[11px] text-gray-500 mb-2.5">{label}</p>}
    {children}
  </div>
);

// ══════════ التبويب ══════════
export default function NightPulse({ pulse, serverNow, onSelectActivity, onSelectRoom, loading, denied }: {
  pulse: ActivityPulse | null;
  serverNow: () => number;
  onSelectActivity: (id: number) => void;
  onSelectRoom: (id: number) => void;
  loading: boolean;
  denied: boolean;
}) {
  // العدّ التنازليّ يُحسب محلّيّاً من startedAt — لا يُبثّ ولا يُخزَّن
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(v => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (loading && !pulse) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (denied || !pulse) {
    return (
      <div className="text-center py-14 px-6">
        <p className="text-4xl mb-3">🌙</p>
        <p className="text-gray-400 text-sm font-bold mb-1.5">لا فعاليّة جارية</p>
        <p className="text-gray-600 text-xs leading-relaxed">
          يظهر نبض الليلة عند اقتراب موعد فعاليّةٍ حجزتَها، ويبقى حتّى تنتهي.
        </p>
      </div>
    );
  }

  const now = serverNow();
  const room = pulse.rooms.find(r => r.selected) || null;
  const live = pulse.live;
  const liveSlot = pulse.slots.find(s => s.state === 'live') || null;
  const nextSlot = pulse.slots.find(s => s.state === 'future') || null;
  const lastDone = [...pulse.slots].reverse().find(s => s.state === 'done') || null;

  const remaining = live?.timer && !live.timer.expired
    ? Math.max(0, live.timer.totalSeconds - (now - live.timer.startedAt) / 1000)
    : null;

  const showDrift = liveSlot?.driftMin != null && Math.abs(liveSlot.driftMin) >= DRIFT_FLOOR;
  const counts = live?.teamCounts || null;
  const totals = live?.teamTotals || null;

  return (
    <div className="space-y-2.5 pb-6">

      {/* ── القائمتان: لا تظهران إلّا لتعدُّدٍ حقيقيّ ── */}
      {(pulse.activities.length > 1 || pulse.rooms.length > 1) && (
        <div className="flex gap-2">
          {pulse.activities.length > 1 && (
            <Picker
              label={pulse.activityName || 'الفعاليّة'}
              items={pulse.activities.map(a => ({ id: a.id, label: a.name, sub: a.place || undefined, on: a.selected }))}
              onPick={onSelectActivity}
            />
          )}
          {pulse.rooms.length > 1 && (
            <Picker
              label={(room?.name || 'الغرفة') + (room?.isMine ? ' · أنت' : '')}
              items={pulse.rooms.map(r => ({
                id: r.id,
                label: r.name + (r.isMine ? ' · غرفتك' : ''),
                sub: `كود ${r.joinCode}`,
                on: r.selected,
              }))}
              onPick={onSelectRoom}
            />
          )}
        </div>
      )}

      {/* ── ١ · بطاقة الآن ── */}
      <Block>
        {live && liveSlot ? (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[20px] font-bold text-white leading-tight" style={{ fontFamily: 'Amiri, serif' }}>
                  {liveSlot.label}
                </p>
                <p className="text-[11px] text-gray-500 font-mono" dir="ltr">
                  {live.roomOrdinal} / {live.ofRoom} · {room?.name}
                </p>
                {live.outsidePlan && <p className="text-[10px] mt-0.5" style={{ color: '#C5A059' }}>↑ خارج الجدول المكتوب</p>}
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {live.phase === 'GAME_OVER' && liveSlot.winner ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-bold"
                      style={{ color: WINNER_COLOR[liveSlot.winner], border: `1px solid ${WINNER_COLOR[liveSlot.winner]}`, background: 'rgba(255,255,255,.04)' }}>
                      فاز {WINNER_AR[liveSlot.winner] || liveSlot.winner}
                    </span>
                  ) : !live.rolesConfirmed ? (
                    <span className="text-[12px] text-gray-400">يجري توزيع الأدوار</span>
                  ) : (
                    <>
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-bold"
                        style={{ color: '#C5A059', border: '1px solid rgba(197,160,89,.35)', background: 'rgba(197,160,89,.14)' }}>
                        الجولة {live.round}
                      </span>
                      <span className="text-[12px] text-gray-300">{PHASE_AR[live.phase] || live.phase}</span>
                    </>
                  )}
                </div>
              </div>
              {remaining != null && live.phase !== 'GAME_OVER' && (
                <TimerRing remaining={remaining} total={live.timer!.totalSeconds} />
              )}
            </div>
            {showDrift && (
              <div className="flex items-center justify-between mt-3 pt-2.5 text-[12px]" style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>
                <span className="text-gray-400">{liveSlot.driftMin! > 0 ? 'بدأت متأخّرةً عن الخطّة' : 'بدأت قبل الخطّة'}</span>
                <span className="font-mono font-bold" style={{ color: '#C5A059' }} dir="ltr">
                  {liveSlot.driftMin! > 0 ? '+' : ''}{liveSlot.driftMin} د
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-[19px] font-bold text-white" style={{ fontFamily: 'Amiri, serif' }}>
              {pulse.status === 'ended' ? 'انتهت ألعاب هذه الغرفة'
                : pulse.status === 'break' ? 'استراحة'
                : pulse.status === 'no-room' ? 'لم تُفتح غرفٌ بعد'
                : 'لم تبدأ هذه الغرفة بعد'}
            </p>
            <div className="mt-1.5 text-[12px] text-gray-400">
              {pulse.status === 'break' && lastDone?.winner && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-bold"
                  style={{ color: WINNER_COLOR[lastDone.winner], border: `1px solid ${WINNER_COLOR[lastDone.winner]}`, background: 'rgba(255,255,255,.04)' }}>
                  {lastDone.label} · فاز {WINNER_AR[lastDone.winner] || lastDone.winner}
                </span>
              )}
              {pulse.status === 'ended' && lastDone?.actualEnd && (
                <span>{pulse.slots.length} ألعاب · آخرها {hhmm(lastDone.actualEnd)}</span>
              )}
              {(pulse.status === 'pre' || pulse.status === 'no-room') && nextSlot && (
                <span>تبدأ ≈ {hhmm(nextSlot.projectedStart)}</span>
              )}
            </div>
          </>
        )}
      </Block>

      {/* ── ٢ · الغرفة وزرّ الدخول — الرؤية تصحبها قدرةُ الدخول ── */}
      {room && (
        <Block accent>
          <div className="flex items-center justify-between gap-2.5">
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-white truncate">{room.name}</p>
              <p className="text-[11px] text-gray-500">
                كود <span className="font-mono" dir="ltr">{room.joinCode}</span>
              </p>
            </div>
            {room.isMine ? (
              <span className="text-[11px] px-2.5 py-1 rounded-full font-bold shrink-0"
                style={{ color: '#2A8FD4', border: '1px solid rgba(42,143,212,.45)', background: 'rgba(42,143,212,.1)' }}>
                {pulse.me?.isAlive === false ? `مقعدك ${pulse.me.seat} · أُقصيت` : `أنت هنا · مقعد ${pulse.me?.seat ?? ''}`}
              </span>
            ) : pulse.status === 'ended' ? (
              <span className="text-[12px] text-gray-600 shrink-0">أُغلقت</span>
            ) : (
              <a href={`/player/join?code=${room.joinCode}`}
                className="text-[13px] font-extrabold px-4 py-2 rounded-xl shrink-0"
                style={{ background: 'linear-gradient(135deg,#D8B36A,#C5A059)', color: '#100D08' }}>
                دخول ←
              </a>
            )}
          </div>
        </Block>
      )}

      {/* ── ٣ · ميزان الطاولة ── */}
      <Block label="من بقي على الطاولة">
        {counts && totals ? (
          <>
            <div className="flex gap-0.5 h-3 rounded-md overflow-hidden" style={{ background: 'rgba(255,255,255,.05)' }}>
              {TEAMS.map(t => counts[t.k] > 0 && (
                <div key={t.k} className="rounded-sm transition-all duration-500"
                  style={{ background: t.c, flex: `${counts[t.k]} 1 0` }} />
              ))}
            </div>
            <div className="flex justify-between gap-2 mt-3">
              {TEAMS.map(t => counts[t.k] > 0 && (
                <div key={t.k} className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="flex items-center gap-1 text-[11px] text-gray-400">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: t.c }} />
                    {t.icon} {t.label}
                  </span>
                  <span className="font-mono text-[15px] font-bold text-white tabular-nums" dir="ltr">
                    {counts[t.k]}<span className="text-[11px] text-gray-600 font-normal"> / {totals[t.k]}</span>
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[12px] text-gray-600 text-center py-2 leading-relaxed">
            {live && !live.rolesConfirmed ? 'الأدوار قيد التوزيع — لا أعداد بعد'
              : live?.isRemote ? 'غرفة عن بُعد — الأعداد محجوبة'
              : 'لا مباراةَ تجري في هذه الغرفة'}
          </p>
        )}
      </Block>

      {/* ── ٤ · ألعاب هذه الغرفة ── */}
      {pulse.slots.length > 0 && (
        <Block label="ألعاب هذه الغرفة">
          <div className="flex gap-1 h-7">
            {pulse.slots.map(s => (
              <SlotChip key={s.ordinal} slot={s} />
            ))}
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-gray-600 font-mono">
            <span dir="ltr">{hhmm(pulse.slots[0].actualStart ?? pulse.slots[0].projectedStart)}</span>
            <span dir="ltr">
              {pulse.status === 'ended' ? '' : '≈ '}
              {hhmm(pulse.slots[pulse.slots.length - 1].actualEnd ?? pulse.slots[pulse.slots.length - 1].projectedEnd)}
            </span>
          </div>
        </Block>
      )}

      {/* ── ٥ · التالي — نقول الوقت الجديد، لا «متأخّرون» ── */}
      {nextSlot && (
        <Block label="التالي في هذه الغرفة">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-gray-300">
              {nextSlot.label}{nextSlot.outsidePlan ? ' · خارج الجدول' : ''}
            </span>
            <span className="text-left">
              <span className="block font-mono text-[17px] font-bold" style={{ color: '#C5A059' }} dir="ltr">
                {nextSlot.projectedStart <= now ? 'الآن تقريباً' : `≈ ${hhmm(nextSlot.projectedStart)}`}
              </span>
              {nextSlot.projectedStart > now && nextSlot.driftMin != null && Math.abs(nextSlot.driftMin) >= DRIFT_FLOOR && nextSlot.planStart && (
                <span className="block text-[11px] text-gray-600 line-through font-mono" dir="ltr">{nextSlot.planStart}</span>
              )}
            </span>
          </div>
        </Block>
      )}
    </div>
  );
}

function SlotChip({ slot }: { slot: PulseSlot }) {
  const done = slot.state === 'done';
  const live = slot.state === 'live';
  const t = slot.actualStart ?? slot.projectedStart;
  return (
    <div
      className="flex-1 rounded-lg flex items-center justify-center text-[10px] font-mono overflow-hidden whitespace-nowrap px-1"
      style={{
        flexGrow: live ? 1.5 : 1,
        background: live ? 'rgba(197,160,89,.14)' : done ? 'rgba(255,255,255,.05)' : 'transparent',
        border: `1px ${slot.state === 'future' ? 'dashed' : 'solid'} ${live ? 'rgba(197,160,89,.5)' : 'rgba(255,255,255,.07)'}`,
        color: live ? '#C5A059' : '#6B655C',
      }}
      title={slot.label}
      dir="ltr"
    >
      {live ? '● ' : slot.state === 'future' ? '≈' : ''}{hhmm(t)}
    </div>
  );
}
