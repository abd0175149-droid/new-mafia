'use client';

// ══════════════════════════════════════════════════════
// 📱 حلقة كروت اللاعب البعيد (بديل شاشة العرض) — وضعان
// ══════════════════════════════════════════════════════
// FOCUS (مكبّر): كارد أمامي كبير يدور لصاحب الدور، الباقي خارج العرض.
// OVERVIEW (مصغّر): كل الكروت موزّعة على حلقة، والضغط يكبّر محليّاً.
// - صاحب الدور من السيرفر: نقاش=currentSpeakerId، تبرير=مؤقّت المتّهم.
// - بين الأدوار (لا متحدّث) → يرجع مصغّر تلقائياً.
// - الإقصاء: يدور للمُقصى → فليب يكشف الدور → يرجع مقلوب رماديّ (بلا إعادة كشف).
// لا يُكشف أي دور حيّ: الـ roster معقّم (role=null)؛ الكشف الوحيد لحظة الإقصاء عبر revealedRoles.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ROLE_NAMES, ROLE_ICONS, MAFIA_ROLES, type Role } from '@/lib/constants';

interface PhoneSpectatorViewProps {
  roster: any[];
  physicalId: string;
  gamePhase: string;
  on: (event: string, handler: (...args: any[]) => void) => (() => void);
  initialDiscussionState?: any;
  videoByPid?: Record<number, MediaStreamTrack | null>; // 📷 كاميرات (self + المتحدّث فقط)
  speakingByPid?: Record<number, boolean>;              // 🔊 من يتكلّم صوتياً الآن
  winnerReveal?: { winner: string | null; players: any[] } | null; // 🏁 كشف الفائز + الأدوار على الطاولة
}

const PHASE_LABELS: Record<string, string> = {
  DAY_DISCUSSION: 'نقاش النهار',
  DAY_JUSTIFICATION: 'مرحلة الدفاع',
  DAY_ELIMINATION: 'كشف الإقصاء',
  ELIMINATION_PENDING: 'كشف الإقصاء',
  DAY_TIEBREAKER: 'كسر التعادل',
  NIGHT: 'الليل',
  MORNING_RECAP: 'أحداث الصباح',
};

function roleMeta(role: string | null | undefined): { text: string; icon: string; mafia: boolean } | null {
  if (!role) return null;
  return {
    text: (ROLE_NAMES as Record<string, string>)[role] || role,
    icon: (ROLE_ICONS as Record<string, string>)[role] || '🎭',
    mafia: (MAFIA_ROLES as string[]).includes(role as Role),
  };
}

function readCounts(tc: any): { cit: number | null; maf: number | null } {
  if (!tc) return { cit: null, maf: null };
  return {
    cit: tc.citizenAlive ?? tc.citizens ?? tc.citizen ?? tc.town ?? null,
    maf: tc.mafiaAlive ?? tc.mafia ?? tc.mafiaCount ?? null,
  };
}

// أقصر مسافة دائريّة بين موقعين على الحلقة
function shortest(i: number, f: number, n: number): number {
  let d = i - f;
  while (d > n / 2) d -= n;
  while (d < -n / 2) d += n;
  return d;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// كارد فيديو (يربط MediaStreamTrack عبر ref)
function VideoTile({ track }: { track: MediaStreamTrack }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && track) { try { el.srcObject = new MediaStream([track]); } catch { /* noop */ } }
    return () => { if (el) el.srcObject = null; };
  }, [track]);
  return <video ref={ref} autoPlay muted playsInline className="rt-avimg" />;
}

export default function PhoneSpectatorView({ roster, physicalId, gamePhase, on, initialDiscussionState, videoByPid, speakingByPid, winnerReveal }: PhoneSpectatorViewProps) {
  const [mode, setMode] = useState<'focus' | 'overview'>('focus');
  const [discussion, setDiscussion] = useState<any>(initialDiscussionState || null);
  const [justTimer, setJustTimer] = useState<{ physicalId: number; timeLimitSeconds: number; startTime: number } | null>(null);
  const [teamCounts, setTeamCounts] = useState<any>(null);
  const [gameTimer, setGameTimer] = useState<{ totalSeconds: number; startedAt: number; expired?: boolean } | null>(null);
  const [revealing, setRevealing] = useState<{ id: number; role: string } | null>(null);
  const [localDead, setLocalDead] = useState<Set<number>>(new Set());
  const [silencedPids, setSilencedPids] = useState<Set<number>>(new Set()); // 🔇 لاعبون مُسكَتون هذا النهار
  const [morningBanner, setMorningBanner] = useState<{ icon: string; text: string; sub?: string } | null>(null); // 🛡️ حدث صباحيّ غير مميت (حماية…)
  const [focusId, setFocusId] = useState<number | null>(initialDiscussionState?.currentSpeakerId ?? null);
  const [tick, setTick] = useState(0);

  const revealSeq = useRef(false);

  const players = useMemo(
    () => (Array.isArray(roster) ? [...roster].sort((a, b) => (a.physicalId || 0) - (b.physicalId || 0)) : []),
    [roster],
  );
  const N = players.length;
  const myId = parseInt(physicalId, 10);

  // 🏁 كشف الفائز: خريطة الأدوار من حمولة game:over + وضع الطاولة كاملة
  const gameOver = gamePhase === 'GAME_OVER' && !!winnerReveal;
  const roleByPid = useMemo(() => {
    const m: Record<number, string> = {};
    (winnerReveal?.players || []).forEach((p: any) => { if (p?.physicalId != null && p.role) m[p.physicalId] = p.role; });
    return m;
  }, [winnerReveal]);
  useEffect(() => { if (gameOver) setMode('overview'); }, [gameOver]);

  // صاحب الدور من السيرفر: تبرير (مؤقّت المتّهم) أو نقاش (المتحدّث الحالي)
  const serverActiveId = useMemo(() => {
    if (gamePhase === 'DAY_JUSTIFICATION' && justTimer) return justTimer.physicalId;
    if (gamePhase === 'DAY_DISCUSSION' && discussion?.currentSpeakerId != null) return discussion.currentSpeakerId;
    return null;
  }, [gamePhase, justTimer, discussion]);
  const serverActiveRef = useRef(serverActiveId);
  useEffect(() => { serverActiveRef.current = serverActiveId; }, [serverActiveId]);

  // تسلسل كشف الإقصاء: يدور للكارد → فليب → يرجع مقلوب رماديّ
  const runReveal = useCallback(async (roles: { physicalId: number; role: string }[]) => {
    if (!roles?.length) return;
    revealSeq.current = true;
    for (const r of roles) {
      setMode('focus');
      setFocusId(r.physicalId);
      await sleep(650);
      setRevealing({ id: r.physicalId, role: r.role });
      await sleep(2600);
      setRevealing(null);
      setLocalDead((prev) => new Set(prev).add(r.physicalId));
      await sleep(350);
    }
    revealSeq.current = false;
    if (serverActiveRef.current == null) setMode('overview'); // بعد الكشف: بلا متحدّث → مصغّر
  }, []);

  // اشتراكات السيرفر
  useEffect(() => {
    const subs = [
      on('day:discussion-updated', (d: any) => setDiscussion(d?.discussionState ?? null)),
      on('game:phase-changed', (d: any) => {
        if (d?.teamCounts) setTeamCounts(d.teamCounts);
        if (d?.phase && d.phase !== 'DAY_DISCUSSION') setDiscussion(null);
        if (d?.phase !== 'DAY_JUSTIFICATION') setJustTimer(null);
        // الإسكات يدوم نهاراً واحداً → يُصفَّر مع دخول الليل؛ وبانر الصباح مؤقّت
        if (d?.phase === 'NIGHT') setSilencedPids(new Set());
        setMorningBanner(null);
      }),
      on('day:elimination-revealed', (d: any) => {
        if (d?.teamCounts) setTeamCounts(d.teamCounts);
        if (Array.isArray(d?.revealedRoles) && d.revealedRoles.length) runReveal(d.revealedRoles);
      }),
      // 🔇 إشارة إسكات: لاعب مُسكَت جاء دوره — تظهر عليه علامة (بلا كشف دوره)
      on('day:show-silenced', (d: any) => {
        if (d?.physicalId != null) setSilencedPids((prev) => new Set(prev).add(d.physicalId));
      }),
      on('game:timer-adjusted', (d: any) => { if (d?.gameTimer) setGameTimer(d.gameTimer); }),
      on('game:started', (d: any) => { if (d?.gameTimer) setGameTimer(d.gameTimer); }),
      on('day:justification-timer-started', (d: any) =>
        setJustTimer({ physicalId: d.physicalId, timeLimitSeconds: d.timeLimitSeconds || 30, startTime: d.startTime || Date.now() }),
      ),
      on('day:justification-timer-stopped', () => setJustTimer(null)),
      // حدث صباحيّ (قائمة سلبيّة آمنة): الحجب/الحماية بانر؛ السرّية/التحوّل تُتجاهَل (منعاً لتسريب الدور)؛
      // ما عداها = موت → إن عُرف الدور نقلب ونكشف وإلّا نتركه للروستر ليُجمّده. هكذا يشمل كلّ القتل (ثابت/ديناميكي/شرطية/توأم).
      on('display:morning-event', (d: any) => {
        const type: string = d?.type || '';
        const pid = d?.targetPhysicalId;
        if (pid == null) return;
        if (type === 'ASSASSINATION_BLOCKED' || type === 'ASSASSIN_BLOCKED' || type === 'PROTECTION') {
          setMorningBanner({ icon: '🛡️', text: 'فشل الاغتيال', sub: `نجت الحماية · ${d?.targetName || ''}`.trim() });
          setTimeout(() => setMorningBanner(null), 4500);
          return;
        }
        if (type === 'PROTECTION_FAILED') {
          setMorningBanner({ icon: '⚠️', text: 'لم تنفع الحماية', sub: d?.targetName || '' });
          setTimeout(() => setMorningBanner(null), 4500);
          return;
        }
        // أحداث ليست موتاً (سرّية/تحقيق/إسكات/تعطيل/تحوّل/نتائج) — لا تُعرض على الحلقة
        const NON_DEATH = ['SILENCED', 'SILENCE', 'SHERIFF_RESULT', 'INVESTIGATION', 'ABILITY_DISABLED', 'DISABLE_ABILITY',
          'TRANSFORM', 'TWIN_TRANSFORM', 'ASSASSINATION_ATTEMPT', 'ELIMINATE_ALL', 'SINGLE_WINNER', 'TIE', 'ELIMINATION'];
        if (NON_DEATH.includes(type)) return;
        // موت: اكشف الدور إن وُجد، وإلّا جمّد الكارد (الروستر سيؤكّده خلال ثوانٍ)
        const role = d?.extra?.targetRole || d?.targetRole || d?.role;
        if (role) runReveal([{ physicalId: pid, role }]);
        else setLocalDead((prev) => new Set(prev).add(pid));
      }),
    ];
    return () => subs.forEach((u) => u && u());
  }, [on, runReveal]);

  // الوضع التلقائيّ: صاحب دور → مكبّر عليه؛ بين الأدوار → مصغّر
  useEffect(() => {
    if (revealSeq.current) return; // لا نقاطع حركة الكشف
    if (serverActiveId != null) {
      setMode('focus');
      setFocusId(serverActiveId);
    } else {
      setMode('overview');
    }
  }, [serverActiveId]);

  // مؤقّت العدّاد (تبرير أو نقاش). base = الوقت المتبقّي عند startTime؛ ونطرح المنقضي فقط أثناء التحدّث.
  // نستعمل timeRemaining (يحدّثه السيرفر مع كل تعديل +/-) وليس timeLimitSeconds الثابت — كي تنعكس تعديلات الليدر.
  const activeTimer: { physicalId: number; base: number; startTime: number | null } | null =
    justTimer && gamePhase === 'DAY_JUSTIFICATION'
      ? { physicalId: justTimer.physicalId, base: justTimer.timeLimitSeconds, startTime: justTimer.startTime }
      : gamePhase === 'DAY_DISCUSSION' && discussion?.currentSpeakerId != null
      ? {
          physicalId: discussion.currentSpeakerId,
          base: typeof discussion.timeRemaining === 'number' ? discussion.timeRemaining : discussion.timeLimitSeconds ?? 0,
          startTime: discussion.startTime ?? null,
        }
      : null;
  useEffect(() => {
    if (!activeTimer?.startTime) return; // نعدّ فقط أثناء التحدّث الفعليّ (paused → startTime=null)
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [activeTimer?.physicalId, activeTimer?.startTime]);

  // مؤقّت اللعبة العامّ (يظهر في الشريط العلويّ)
  useEffect(() => {
    if (!gameTimer || gameTimer.expired || !gameTimer.startedAt) return;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [gameTimer]);
  const gameClock = (() => {
    void tick;
    if (!gameTimer || gameTimer.totalSeconds == null) return null;
    const rem = gameTimer.startedAt
      ? Math.max(0, Math.round(gameTimer.totalSeconds - (Date.now() - gameTimer.startedAt) / 1000))
      : gameTimer.totalSeconds;
    return `${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`;
  })();

  const remainingFor = (id: number): number | null => {
    void tick;
    if (!activeTimer || activeTimer.physicalId !== id) return null;
    if (activeTimer.startTime) {
      return Math.max(0, Math.round(activeTimer.base - (Date.now() - activeTimer.startTime) / 1000));
    }
    return Math.max(0, Math.round(activeTimer.base));
  };

  // تفاعل محلّي
  const onTapCard = (id: number) => {
    if (mode !== 'overview') return;
    setFocusId(id); // محلّي فقط
    setMode('focus');
  };
  const toggleMode = () => {
    setMode((m) => {
      const next = m === 'focus' ? 'overview' : 'focus';
      if (next === 'overview' && serverActiveId != null) setFocusId(serverActiveId);
      return next;
    });
  };
  const backToSpeaker = () => {
    if (serverActiveId != null) { setFocusId(serverActiveId); setMode('focus'); }
  };

  const aliveCount = players.filter((p) => p.isAlive && !localDead.has(p.physicalId)).length;
  const { cit, maf } = readCounts(teamCounts);
  const speaker = serverActiveId != null ? players.find((p) => p.physicalId === serverActiveId) : null;
  const focusIdx = focusId != null ? players.findIndex((p) => p.physicalId === focusId) : 0;
  const speakerRemaining = serverActiveId != null ? remainingFor(serverActiveId) : null;

  if (!players.length) {
    return (
      <div className="text-center py-8 text-[#808080] text-xs font-mono">
        <div className="w-6 h-6 border-2 border-[#C5A059]/30 border-t-[#C5A059] rounded-full animate-spin mx-auto mb-2" />
        جاري تحميل الطاولة…
      </div>
    );
  }

  return (
    <div className="rt-root rounded-xl border border-[#1a1a1a] bg-[#070707] overflow-hidden mb-3">
      <style>{RT_CSS}</style>

      {/* الرأس */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a1a1a] bg-[#0a0a0a]/95">
        <div className="text-[#C5A059] font-black text-sm" style={{ fontFamily: 'Amiri, serif' }}>
          {PHASE_LABELS[gamePhase] || gamePhase}
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          {cit != null && <span className="text-blue-400">🛡️ {cit}</span>}
          {maf != null && <span className="text-red-400">🔪 {maf}</span>}
          <span className="text-[#808080]">أحياء {aliveCount}</span>
          {gameClock && <span className="text-white font-black tabular-nums border-r border-[#2a2a2a] pr-3" style={{ fontVariantNumeric: 'tabular-nums' }}>⏱ {gameClock}</span>}
        </div>
      </div>

      {/* شريط المتحدّث */}
      <div className={`rt-speaker ${speaker ? 'on' : ''}`}>
        {speaker && (
          silencedPids.has(speaker.physicalId) ? (
            <span className="rt-pill silenced">
              🔇 <span className="rt-mono">#{speaker.physicalId}</span> {speaker.name} — مُسكَت، لا يمكنه الكلام
            </span>
          ) : (
            <span className="rt-pill">
              🎙️ {gamePhase === 'DAY_JUSTIFICATION' ? 'يُدافع الآن' : 'يتحدّث الآن'}:{' '}
              <span className="rt-mono">#{speaker.physicalId}</span> {speaker.name}
              {speakerRemaining != null && (
                <span className={`rt-mono ${speakerRemaining <= 10 ? 'warn' : ''}`}>· {speakerRemaining}s</span>
              )}
            </span>
          )
        )}
      </div>

      {/* الحلقة */}
      <div className={`rt-stage ${mode}`}>
        <div className="rt-felt" />
        {morningBanner && !gameOver && (
          <div className="rt-morning">
            <span className="rt-morning-ic">{morningBanner.icon}</span>
            <span className="rt-morning-t">{morningBanner.text}</span>
            {morningBanner.sub && <span className="rt-morning-sub">{morningBanner.sub}</span>}
          </div>
        )}
        {gameOver && (
          <div className="rt-winner">
            <span className="rt-winner-ic">{winnerReveal?.winner === 'MAFIA' ? '🩸' : winnerReveal?.winner === 'ASSASSIN' ? '🔪' : winnerReveal?.winner === 'JESTER' ? '🤡' : '⚖️'}</span>
            <span className="rt-winner-t">{winnerReveal?.winner === 'MAFIA' ? 'انتصار المافيا' : winnerReveal?.winner === 'ASSASSIN' ? 'انتصار السفّاح' : winnerReveal?.winner === 'JESTER' ? 'فوز المهرج' : 'تطهير المدينة'}</span>
          </div>
        )}
        <div className="rt-glow" />
        <div className="rt-ring">
          {players.map((p, i) => {
            const isDead = !p.isAlive || localDead.has(p.physicalId);
            const silenced = silencedPids.has(p.physicalId) && !isDead;
            const isSpeaker = serverActiveId != null && p.physicalId === serverActiveId;
            const revealedRole = gameOver ? (roleByPid[p.physicalId] ?? null) : (revealing?.id === p.physicalId ? revealing?.role : null);
            const isFlipped = gameOver || revealing?.id === p.physicalId;
            const rm = roleMeta(revealedRole);
            const rtimer = remainingFor(p.physicalId);
            const talking = !!speakingByPid?.[p.physicalId];
            // الكاميرا تُعرض على كارد كل لاعب فتح كاميرته (يبثّها للجميع) — قلائل يفتحونها فالأداء آمن
            const vTrack = videoByPid?.[p.physicalId] ?? null;
            let style: CSSProperties;
            if (mode === 'focus') {
              const off = shortest(i, focusIdx, N);
              const a = Math.abs(off);
              style = {
                transform: `translateX(${off * 150}px) translateZ(${-a * 210}px) rotateY(${-off * 46}deg) rotateZ(${off * 3}deg) scale(${off === 0 ? 1 : 0.72})`,
                opacity: a > 2.4 ? 0 : off === 0 ? 1 : 0.5,
                zIndex: 100 - a,
              };
            } else {
              const ang = (i / N) * 2 * Math.PI - Math.PI / 2;
              const foc = p.physicalId === focusId;
              const dz = Math.sin(ang) * 70; // عمق: الكروت الأماميّة أقرب، الخلفيّة تتراجع
              style = {
                transform: `translate(${Math.cos(ang) * 120}px, ${Math.sin(ang) * 120}px) translateZ(${dz}px) scale(${foc ? 0.62 : 0.44 + (Math.sin(ang) + 1) * 0.05})`,
                opacity: 1,
                zIndex: foc ? 70 : Math.round(50 + dz),
              };
            }
            const fallback = p.gender === 'FEMALE' ? '/avatars/female.png' : '/avatars/male.png';
            return (
              <div
                key={p.physicalId}
                className={`rt-card ${isDead ? 'dead' : ''} ${isSpeaker ? 'spot' : ''} ${talking ? 'talking' : ''}`}
                style={style}
                onClick={() => onTapCard(p.physicalId)}
              >
                <div className={`rt-inner ${isFlipped ? 'flip' : ''}`}>
                  {/* الوجه الأمامي — مقلوب (بلا دور) */}
                  <div className="rt-face rt-front">
                    <div className={`rt-av ${p.gender === 'FEMALE' ? 'f' : 'm'}`}>
                      {vTrack ? (
                        <VideoTile track={vTrack} />
                      ) : (
                        <img
                          src={p.avatarUrl || fallback}
                          alt={p.name}
                          className="rt-avimg"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                    </div>
                    {talking && <span className="rt-talk" />}
                    <div className={`rt-num ${p.gender === 'FEMALE' ? 'gf' : ''}`}>{p.physicalId}</div>
                    <div className="rt-name">{p.name}</div>
                    {p.physicalId === myId && <span className="rt-you">أنت</span>}
                    {isSpeaker && !isDead && !silenced && gamePhase !== 'DAY_JUSTIFICATION' && <span className="rt-mic">🎙️</span>}
                    {silenced && <span className="rt-silenced" title="مُسكَت — لا يمكنه الكلام">🔇</span>}
                    {rtimer != null && rtimer >= 0 && !silenced && (
                      <span className={`rt-timer ${rtimer <= 10 ? 'warn' : ''}`}>{rtimer}s</span>
                    )}
                    {isDead && <div className="rt-skull">💀</div>}
                  </div>
                  {/* الوجه الخلفي — يظهر لحظة الإقصاء فقط */}
                  <div className="rt-face rt-back">
                    {rm && (
                      <>
                        <div className="rt-role-ic">{rm.icon}</div>
                        <div className="rt-role" style={{ color: rm.mafia ? '#d13636' : '#3f83c4' }}>{rm.text}</div>
                        <div className="rt-role-sub">#{p.physicalId} · {p.name}</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {mode === 'overview' && <div className="rt-hint">اضغط أي كارد لتكبيره عندك</div>}
        <button className="rt-modebtn" onClick={toggleMode}>
          {mode === 'focus' ? '◱ عرض الحلقة كاملة' : '⊡ تكبير المتحدّث'}
        </button>
        {mode === 'focus' && serverActiveId != null && focusId !== serverActiveId && (
          <button className="rt-backbtn" onClick={backToSpeaker}>↺ للمتحدّث</button>
        )}
      </div>
    </div>
  );
}

const RT_CSS = `
.rt-speaker{display:flex;justify-content:center;min-height:0;padding:0;transition:.3s}
.rt-speaker.on{padding:8px 10px 2px}
.rt-pill{display:inline-flex;align-items:center;gap:6px;background:rgba(197,160,89,.15);border:1px solid rgba(197,160,89,.4);
  color:#C5A059;border-radius:999px;padding:5px 13px;font-size:12px;font-weight:700}
.rt-pill .rt-mono{font-family:'JetBrains Mono',monospace;font-weight:800}
.rt-pill .rt-mono.warn{color:#d13636}
.rt-stage{position:relative;height:410px;perspective:1000px;perspective-origin:50% 42%;overflow:hidden;transition:perspective-origin .5s}
.rt-stage.overview{perspective-origin:50% 30%}
.rt-felt{position:absolute;left:50%;top:57%;width:150%;height:82%;transform:translate(-50%,-50%) rotateX(72deg);
  background:radial-gradient(closest-side,rgba(46,92,49,.30),rgba(14,26,18,.55) 70%,transparent);border-radius:50%;filter:blur(2px);pointer-events:none}
.rt-glow{position:absolute;top:50%;left:50%;width:270px;height:350px;transform:translate(-50%,-50%);
  background:radial-gradient(closest-side,rgba(197,160,89,.16),transparent);filter:blur(10px);opacity:0;transition:.5s;pointer-events:none}
.rt-stage.focus .rt-glow{opacity:1}
.rt-ring{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .6s cubic-bezier(.15,.5,.3,.95)}
.rt-stage.overview .rt-ring{transform:rotateX(24deg)}
.rt-card{position:absolute;top:50%;left:50%;width:140px;height:196px;margin:-98px 0 0 -70px;
  transform-style:preserve-3d;transition:transform .6s cubic-bezier(.15,.5,.3,.95),opacity .45s;cursor:default}
.rt-stage.overview .rt-card{cursor:pointer}
.rt-inner{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .7s cubic-bezier(.5,.05,.2,1)}
.rt-inner.flip{transform:rotateY(180deg)}
.rt-face{position:absolute;inset:0;-webkit-backface-visibility:hidden;backface-visibility:hidden;border-radius:14px;overflow:hidden;
  border:1px solid #2c2620;background:#0a0a0a;box-shadow:0 20px 40px rgba(0,0,0,.6)}
.rt-av{position:absolute;inset:0 0 34% 0;overflow:hidden}
.rt-av::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(120% 90% at 50% 10%,rgba(255,240,210,.16),transparent 55%),linear-gradient(180deg,transparent 58%,rgba(0,0,0,.5))}
.rt-av.m{background:radial-gradient(120% 120% at 50% 18%,#6a5a34,#1c1811)}
.rt-av.f{background:radial-gradient(120% 120% at 50% 18%,#5b4a67,#1e1725)}
.rt-avimg{width:100%;height:100%;object-fit:cover}
.rt-num{position:absolute;top:0;left:0;right:0;height:66%;display:flex;align-items:center;justify-content:center;
  font-family:'JetBrains Mono',monospace;font-weight:800;font-size:54px;color:rgba(197,160,89,.95);text-shadow:0 3px 10px rgba(0,0,0,.85);pointer-events:none}
.rt-num.gf{color:rgba(216,180,254,.95)}
.rt-name{position:absolute;bottom:0;left:0;right:0;height:34%;display:flex;align-items:center;justify-content:center;
  background:#000;font-family:'Amiri',serif;font-weight:700;font-size:14px;color:#fff;padding:0 4px;text-align:center}
.rt-back{transform:rotateY(180deg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
  background:radial-gradient(120% 120% at 50% 25%,#1a1410,#070605)}
.rt-role-ic{font-size:34px}
.rt-role{font-family:'Amiri',serif;font-size:18px;font-weight:700;text-align:center;padding:0 6px}
.rt-role-sub{font-family:'JetBrains Mono',monospace;font-size:11px;color:#8a8578}
.rt-you{position:absolute;top:5px;left:5px;z-index:5;background:#C5A059;color:#000;font-family:'JetBrains Mono',monospace;font-weight:800;font-size:9px;border-radius:5px;padding:1px 4px}
.rt-mic{position:absolute;bottom:36%;left:50%;transform:translateX(-50%);z-index:6;width:24px;height:24px;border-radius:999px;
  background:#C5A059;color:#000;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 5px 14px rgba(197,160,89,.5)}
.rt-timer{position:absolute;top:6px;right:6px;z-index:6;font-family:'JetBrains Mono',monospace;font-weight:800;font-size:12px;
  background:rgba(0,0,0,.72);border:1px solid rgba(197,160,89,.4);color:#C5A059;border-radius:7px;padding:1px 6px}
.rt-timer.warn{color:#d13636;border-color:rgba(209,54,54,.5)}
.rt-skull{position:absolute;inset:0 0 34% 0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);font-size:26px;z-index:4}
.rt-silenced{position:absolute;bottom:36%;left:50%;transform:translateX(-50%);z-index:6;width:24px;height:24px;border-radius:999px;
  background:#7c2d2d;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 5px 14px rgba(124,45,45,.6)}
.rt-pill.silenced{background:rgba(124,45,45,.2);border-color:rgba(209,54,54,.5);color:#f0a3a3}
.rt-morning{position:absolute;top:6px;left:50%;transform:translateX(-50%);z-index:30;display:flex;flex-direction:column;align-items:center;gap:1px;pointer-events:none;animation:rtwin .5s ease-out;text-align:center}
.rt-morning-ic{font-size:34px;filter:drop-shadow(0 0 16px rgba(63,131,196,.5))}
.rt-morning-t{font-family:'Amiri',serif;font-weight:700;font-size:19px;color:#7fb4e6;text-shadow:0 2px 14px rgba(0,0,0,.85)}
.rt-morning-sub{font-family:'JetBrains Mono',monospace;font-size:10px;color:#cbd5e1;text-shadow:0 1px 8px rgba(0,0,0,.9)}
.rt-card.dead .rt-inner{filter:grayscale(1) brightness(.55)}
.rt-card.spot .rt-front{border-color:#C5A059;box-shadow:0 0 0 1px #C5A059,0 0 30px rgba(197,160,89,.5)}
.rt-talk{position:absolute;bottom:37%;right:8px;z-index:7;width:11px;height:11px;border-radius:999px;background:#34d399;box-shadow:0 0 9px #34d399;animation:rttalk 1s ease-in-out infinite}
@keyframes rttalk{50%{opacity:.35}}
.rt-winner{position:absolute;top:6px;left:50%;transform:translateX(-50%);z-index:30;display:flex;flex-direction:column;align-items:center;gap:1px;pointer-events:none;animation:rtwin .6s ease-out}
.rt-winner-ic{font-size:38px;filter:drop-shadow(0 0 20px rgba(197,160,89,.55))}
.rt-winner-t{font-family:'Amiri',serif;font-weight:700;font-size:22px;color:#C5A059;text-shadow:0 2px 14px rgba(0,0,0,.85)}
@keyframes rtwin{from{opacity:0;transform:translateX(-50%) scale(.7)}}
.rt-modebtn{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);z-index:45;display:inline-flex;align-items:center;gap:6px;
  background:rgba(10,10,10,.86);border:1px solid #262119;color:#C5A059;border-radius:999px;padding:8px 15px;
  font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:700;cursor:pointer;backdrop-filter:blur(6px)}
.rt-backbtn{position:absolute;bottom:10px;right:10px;z-index:45;background:rgba(10,10,10,.86);border:1px solid rgba(63,131,196,.35);
  color:#3f83c4;border-radius:999px;padding:8px 12px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;cursor:pointer}
.rt-hint{position:absolute;bottom:48px;left:0;right:0;z-index:44;text-align:center;font-family:'JetBrains Mono',monospace;font-size:11px;color:#8a8578;pointer-events:none}
@media (prefers-reduced-motion: reduce){.rt-card,.rt-inner{transition:none}}
`;
