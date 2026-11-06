'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Role, ROLE_NAMES, ROLE_ICONS, MAFIA_ROLES, NEUTRAL_ROLES } from '@/lib/constants';
import { analyzeDuplicates, DUPLICABLE_ROLES, FILLER_ROLES, SINGLE_ROLE_REASON, DUPLICATE_BEHAVIOR, type AssassinMode } from '@/lib/role-duplicates';

interface LeaderRoleConfiguratorProps {
  gameState: any;
  emit: (event: string, payload: any) => Promise<any>;
  setError: (err: string) => void;
  hideMafiaChat?: boolean; // 🌐 للغرف البعيدة: يُخفي مبدّل دردشة المافيا هنا (يُضبط في إعدادات الإنشاء)
}

export default function LeaderRoleConfigurator({ gameState, emit, setError, hideMafiaChat }: LeaderRoleConfiguratorProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const [assassinContractCount, setAssassinContractCount] = useState(4);  // 🔪 عدد عقود السفّاح
  const [mayorVoteWeight, setMayorVoteWeight] = useState(2);              // 🎩 وزن صوت العمدة بعد كشفه
  const [jesterSurviveRounds, setJesterSurviveRounds] = useState(2);      // 🤡 عدد جولات نجاة المهرج
  const [witchDisableRounds, setWitchDisableRounds] = useState(3);        // 🧙‍♀️ عدد راوندات تعطيل الساحرة
  const [phoenixRebirths, setPhoenixRebirths] = useState(1);             // 🔥 رصيد نهوض العنقاء
  // 🃏 الكروت المكرّرة: نمطُ السفّاحين حين يتعدّدون + سؤالُ التأكيد قبل الاعتماد
  const [assassinMode, setAssassinMode] = useState<AssassinMode>(gameState?.config?.assassinMode === 'PARTNERS' ? 'PARTNERS' : 'RIVALS');
  const [dupAsk, setDupAsk] = useState(false);
  // 🗣️ غرفة تشاور المافيا السرّية — خيار الليدر عند بداية كل جولة (يتذكّر آخر اختيار من config)
  const [mafiaChatOn, setMafiaChatOn] = useState<boolean>(gameState?.config?.mafiaChatEnabled === true);
  const [chatToggleBusy, setChatToggleBusy] = useState(false);
  // ⚔️ مواجهة النهار الوجاهيّة — تفعيل + حدّ الطلبات لكلّ لاعب في اللعبة (يُصفَّر مع كلّ لعبة)
  const [confOn, setConfOn] = useState<boolean>(gameState?.config?.confrontationEnabled === true);
  const [confPerPlayer, setConfPerPlayer] = useState<number>(gameState?.config?.confrontationsPerPlayer ?? 1);
  const [confBusy, setConfBusy] = useState(false);
  const setConfSettings = async (patch: { enabled?: boolean; perPlayer?: number }) => {
    if (confBusy) return;
    setConfBusy(true);
    try {
      const r: any = await emit('leader:confrontation-settings', { roomId: gameState.roomId, ...patch });
      if (r?.success) { setConfOn(r.enabled === true); setConfPerPlayer(r.perPlayer ?? 1); }
      else setError(r?.error || 'تعذّر تغيير إعداد المواجهة');
    } catch (err: any) {
      setError(err.message || 'تعذّر تغيير إعداد المواجهة');
    } finally {
      setConfBusy(false);
    }
  };
  const toggleMafiaChat = async () => {
    if (chatToggleBusy) return;
    setChatToggleBusy(true);
    try {
      const r: any = await emit('leader:mafia-chat-toggle', { roomId: gameState.roomId, enabled: !mafiaChatOn });
      if (r?.success) setMafiaChatOn(r.enabled === true);
    } catch (err: any) {
      setError(err.message || 'تعذّر تغيير إعداد غرفة التشاور');
    } finally {
      setChatToggleBusy(false);
    }
  };

  // 🔒 العددُ وحده يُطلق إعادة التوليد — لا مرجعُ المصفوفة.
  // كان الاعتماد على `gameState.players` يعيد بناء التركيبة من الصفر عند أيّ
  // تعديل اسمٍ أو تحديث مظهرٍ أو انضمام، فتُمحى تعديلات الليدر اليدويّة
  // (المهرّج/السفّاح/التوأمان) وهو في منتصف الضبط.
  const presentCount = gameState.players.filter(
    (p: any) => p.isAlive !== false && !p.seatHeld && !p.frozen,
  ).length;

  useEffect(() => {
    const playerCount = presentCount;
    const totalMafia = Math.ceil(playerCount / 4);

    // خوارزمية المهرج: يُضاف تلقائياً عند 8+ لاعبين (يأخذ مقعد مواطن)
    const hasJester = playerCount >= 8;
    const totalNeutral = hasJester ? 1 : 0;
    const totalCitizens = playerCount - totalMafia - totalNeutral;

    const mafiaOrder = [Role.GODFATHER, Role.SILENCER, Role.CHAMELEON, Role.WITCH, Role.MAFIA_REGULAR];
    // 🎩 العمدة في المرتبة السادسة — لا يدخل تلقائيّاً إلا بستّة مقاعد مواطنين (≈ ٩+ لاعبين، كالمحرّك الديناميكيّ)
    // 🔥 العنقاء سابعاً: طاولةٌ صغيرةٌ تصير المافيا فيها عاجزةً عن الاغتيال ليلتين إن دخل مبكّراً
    const citizenOrder = [Role.SHERIFF, Role.DOCTOR, Role.SNIPER, Role.POLICEWOMAN, Role.NURSE, Role.MAYOR, Role.PHOENIX, Role.CITIZEN];

    let generated: Role[] = [];
    
    for (let i = 0; i < totalMafia; i++) {
       generated.push(i < mafiaOrder.length - 1 ? mafiaOrder[i] : Role.MAFIA_REGULAR);
    }
    
    for (let i = 0; i < totalCitizens; i++) {
       generated.push(i < citizenOrder.length - 1 ? citizenOrder[i] : Role.CITIZEN);
    }

    // إضافة المهرج
    if (hasJester) {
      generated.push(Role.JESTER);
    }

    setRoles(generated);
    setLoading(false);
  }, [presentCount]);

  const handleRoleChange = (index: number, newRole: Role) => {
    const newRoles = [...roles];
    newRoles[index] = newRole;
    setRoles(newRoles);
  };

  // تبديل المهرج ↔ مواطن
  const toggleJester = () => {
    const newRoles = [...roles];
    const jesterIdx = newRoles.indexOf(Role.JESTER);
    if (jesterIdx >= 0) {
      // إزالة المهرج → مواطن
      newRoles[jesterIdx] = Role.CITIZEN;
    } else {
      // إضافة المهرج → يبدل آخر مواطن عادي
      const lastCitizenIdx = newRoles.lastIndexOf(Role.CITIZEN);
      if (lastCitizenIdx >= 0) {
        newRoles[lastCitizenIdx] = Role.JESTER;
      }
    }
    setRoles(newRoles);
  };

  // 🔪 تبديل السفّاح ↔ مواطن
  const toggleAssassin = () => {
    const newRoles = [...roles];
    const assassinIdx = newRoles.indexOf(Role.ASSASSIN);
    if (assassinIdx >= 0) {
      newRoles[assassinIdx] = Role.CITIZEN;
    } else {
      const lastCitizenIdx = newRoles.lastIndexOf(Role.CITIZEN);
      if (lastCitizenIdx >= 0) {
        newRoles[lastCitizenIdx] = Role.ASSASSIN;
      }
    }
    setRoles(newRoles);
  };

  // 👥 تبديل التوأمين (يأتيان معاً أو يُلغيان معاً)
  const toggleTwins = () => {
    const newRoles = [...roles];
    const hasOlder = newRoles.includes(Role.OLDER_BROTHER);
    const hasYounger = newRoles.includes(Role.YOUNGER_BROTHER);

    if (hasOlder || hasYounger) {
      // إزالة التوأمين → إعادة مقاعد مافيا عادي + مواطن
      const olderIdx = newRoles.indexOf(Role.OLDER_BROTHER);
      if (olderIdx >= 0) newRoles[olderIdx] = Role.MAFIA_REGULAR;
      const youngerIdx = newRoles.indexOf(Role.YOUNGER_BROTHER);
      if (youngerIdx >= 0) newRoles[youngerIdx] = Role.CITIZEN;
    } else {
      // إضافة التوأمين: سحب مقعد مافيا عادي + مواطن
      const lastMafiaIdx = newRoles.lastIndexOf(Role.MAFIA_REGULAR);
      if (lastMafiaIdx >= 0) {
        newRoles[lastMafiaIdx] = Role.OLDER_BROTHER;
      }
      const lastCitizenIdx = newRoles.lastIndexOf(Role.CITIZEN);
      if (lastCitizenIdx >= 0) {
        newRoles[lastCitizenIdx] = Role.YOUNGER_BROTHER;
      }
    }
    setRoles(newRoles);
  };

  const handleConfirm = async (duplicatesConfirmed = false) => {
    // 🃏 الممنوعُ يُوقف هنا، والمسموحُ يُسأل عنه أوّلاً — والخادمُ يحكم بالقاعدة نفسها
    const d = analyzeDuplicates(roles);
    if (d.blocked.length) {
      setError(`كرتٌ لا يتكرّر: ${d.blocked.map(b => ROLE_NAMES[b.role as Role] || b.role).join('، ')}`);
      return;
    }
    if (d.allowed.length && !duplicatesConfirmed) { setDupAsk(true); return; }
    setDupAsk(false);
    try {
      setLoading(true);
      await emit('setup:roles-confirmed', {
        roomId: gameState.roomId,
        roles,
        assassinContractCount: roles.includes(Role.ASSASSIN) ? assassinContractCount : undefined,
        mayorVoteWeight: roles.includes(Role.MAYOR) ? mayorVoteWeight : undefined,
        jesterSurviveRounds: roles.includes(Role.JESTER) ? jesterSurviveRounds : undefined,
        witchDisableRounds: roles.includes(Role.WITCH) ? witchDisableRounds : undefined,
        phoenixRebirths: roles.includes(Role.PHOENIX) ? phoenixRebirths : undefined,
        supportsDuplicatePrompt: true,
        confirmDuplicates: duplicatesConfirmed,
        assassinMode: roles.filter(r => r === Role.ASSASSIN).length >= 2 ? assassinMode : undefined,
      });
    } catch (err: any) {
      setLoading(false);
      // الخادمُ رأى تكراراً لم يُؤكَّد (توزيعٌ تغيّر بين الحساب والإرسال) — اسأل بدل الخطأ
      if (err?.response?.code === 'DUPLICATE_ROLES') { setDupAsk(true); return; }
      setError(err.message);
    }
  };

  const allRolesList = Object.values(Role);

  if (loading) return <div className="text-center p-12 text-[#555] font-mono tracking-widest">INITIALIZING ROSTER...</div>;

  const mafiaRoles = roles.filter(r => MAFIA_ROLES.includes(r));
  const citizenRoles = roles.filter(r => !MAFIA_ROLES.includes(r) && !NEUTRAL_ROLES.includes(r));
  const neutralRoles = roles.filter(r => NEUTRAL_ROLES.includes(r));
  const hasJesterInRoles = roles.includes(Role.JESTER);
  const hasMayorInRoles = roles.includes(Role.MAYOR);
  const hasPhoenixInRoles = roles.includes(Role.PHOENIX);
  const hasAssassinInRoles = roles.includes(Role.ASSASSIN);
  const hasTwinsInRoles = roles.includes(Role.OLDER_BROTHER) && roles.includes(Role.YOUNGER_BROTHER);
  const dup = analyzeDuplicates(roles);
  const assassinCount = roles.filter(r => r === Role.ASSASSIN).length;
  const nameOf = (r: string) => ROLE_NAMES[r as Role] || r;
  const playerCount = gameState.players.filter((p: any) => p.isAlive !== false).length;

  // تحديد أي قسم فيه dropdown مفتوح لرفع z-index ديناميكياً
  const openRole = openDropdown !== null ? roles[openDropdown] : null;
  const activeSection = openRole 
    ? MAFIA_ROLES.includes(openRole) ? 'mafia' 
    : NEUTRAL_ROLES.includes(openRole) ? 'neutral' 
    : 'citizen'
    : null;

  // دالة مساعدة لبناء كارد الدور
  const renderRoleCard = (r: Role, i: number, teamColor: string, borderColor: string) => (
    <div key={i} className={`bg-[#0a0a0a] border ${borderColor} rounded-lg p-2 flex items-center gap-3 hover:border-opacity-60 transition-colors group flex-1 min-w-[200px] sm:flex-none`}>
      <div className={`w-12 h-12 shrink-0 rounded bg-[#111] border ${borderColor} flex items-center justify-center text-2xl grayscale opacity-70 group-hover:opacity-100 transition-opacity`}>
        {ROLE_ICONS[r]}
      </div>
      <div className="relative flex-1">
        <div 
          onClick={() => setOpenDropdown(openDropdown === i ? null : i)}
          className="w-full bg-transparent text-white font-mono text-xs md:text-sm px-3 py-2 cursor-pointer tracking-widest font-bold flex justify-between items-center"
          dir="ltr"
        >
          <span className={`${teamColor} pr-2 whitespace-nowrap`}>{ROLE_NAMES[r]}</span>
          <span className={`${teamColor} text-[10px] shrink-0`}>▼</span>
        </div>

        <AnimatePresence>
          {openDropdown === i && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -10 }}
              className={`absolute top-full right-0 w-[220px] mt-2 bg-[#0c0c0c] border ${borderColor} rounded-lg shadow-2xl z-50 overflow-hidden`}
              dir="rtl"
            >
              <div className="max-h-[220px] overflow-y-auto">
                {allRolesList.map(role => (
                  <div 
                    key={role}
                    onClick={() => { handleRoleChange(i, role); setOpenDropdown(null); }}
                    className={`px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors ${r === role ? `bg-white/10 border-l-2 ${borderColor}` : ''}`}
                  >
                    <span className="text-xl grayscale opacity-70 w-6 text-center">{ROLE_ICONS[role]}</span>
                    <span className="font-mono text-xs text-[#C5A059] flex-1">{ROLE_NAMES[role]}</span>
                    {NEUTRAL_ROLES.includes(role) && <span className="text-[8px] text-amber-400 font-mono">محايد</span>}
                    {/* 🃏 الكرتُ موجودٌ في خانةٍ أخرى: «تكرار» إن جاز، و«نسخة واحدة» إن لم يَجُز */}
                    {r !== role && !FILLER_ROLES.has(role) && roles.includes(role) && (
                      DUPLICABLE_ROLES.has(role)
                        ? <span className="text-[8px] text-sky-300 font-mono" title="سيُطلب تأكيدك قبل الاعتماد">تكرار</span>
                        : <span className="text-[8px] text-red-400 font-mono" title={SINGLE_ROLE_REASON[role] || ''}>نسخة واحدة</span>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  return (
    <div className="mb-10 w-full max-w-5xl mx-auto">
      {/* Header Container */}
      <div className="bg-black/30 border border-[#2a2a2a] rounded-xl p-8 mb-8 backdrop-blur-sm relative overflow-hidden text-center">
        <div className="absolute left-0 top-0 w-1 h-full bg-[#C5A059]/40" />
        <h2 className="text-3xl font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>تدقيق وإعداد المهام السرية</h2>
        <p className="text-[#808080] font-mono tracking-[0.3em] mt-3 uppercase text-xs">ROLE COMPOSITION MATRIX CONFIGURATION</p>
      </div>

      <div className="flex flex-col gap-6 mb-8 w-full">
        {/* Mafia Column */}
        <div className={`bg-black/40 border border-[#8A0303]/30 rounded-xl p-6 backdrop-blur-sm relative ${activeSection === 'mafia' ? 'z-30' : 'z-0'}`}>
          <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-l from-transparent via-[#8A0303]/50 to-transparent rounded-t-xl" />
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#8A0303]/20">
            <h3 className="text-sm font-mono text-[#8A0303] uppercase tracking-[0.2em] font-bold">
              SYNDICATE (المافيا)
            </h3>
            <span className="bg-[#8A0303]/20 text-[#8A0303] font-mono border border-[#8A0303]/30 rounded px-3 py-1 text-xs">
              {mafiaRoles.length} OP(s)
            </span>
          </div>
          
          <div className="flex flex-wrap gap-3">
            {roles.map((r, i) => {
              if (!MAFIA_ROLES.includes(r)) return null;
              return renderRoleCard(r, i, 'text-[#C5A059]', 'border-[#8A0303]/20');
            })}
          </div>

          {/* 🧙‍♀️ إعدادات الساحرة */}
          {roles.includes(Role.WITCH) && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} 
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 p-4 bg-purple-500/5 border border-purple-500/10 rounded-lg space-y-3"
            >
              <p className="text-purple-400/80 text-xs font-mono leading-relaxed" dir="rtl">
                🧙‍♀️ الساحرة: تعطّل قدرة لاعب من المواطنين أو المستقلين لعدة راوندات. لاعب مختلف كل مرة. تكشف الحرباية إذا معطّلة.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-purple-400/60 text-xs font-mono" dir="rtl">راوندات التعطيل:</span>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setWitchDisableRounds(Math.max(1, witchDisableRounds - 1))}
                    className="w-7 h-7 rounded bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 text-sm font-bold transition-colors"
                  >−</button>
                  <span className="text-purple-300 font-mono font-bold w-6 text-center">{witchDisableRounds}</span>
                  <button 
                    onClick={() => setWitchDisableRounds(Math.min(6, witchDisableRounds + 1))}
                    className="w-7 h-7 rounded bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 text-sm font-bold transition-colors"
                  >+</button>
                </div>
              </div>
            </motion.div>
          )}

          {/* 🗣️ غرفة تشاور المافيا — خيار الليدر لكل جولة (تُخفى للبُعد؛ تُضبط عند الإنشاء) */}
          {!hideMafiaChat && (
          <div className="mt-4 p-4 bg-red-500/5 border border-red-500/10 rounded-lg flex items-center justify-between gap-3" dir="rtl">
            <div className="min-w-0">
              <p className="text-red-400/90 text-xs font-mono font-bold">🗣️ غرفة تشاور المافيا</p>
              <p className="text-red-400/50 text-[10px] font-mono mt-1 leading-relaxed">
                محادثة سرّية للمافيا الأحياء داخل «مفكرة التحري» — تراقبها أنت بالكامل من زرّ 🕵️
              </p>
            </div>
            <button
              onClick={toggleMafiaChat}
              disabled={chatToggleBusy}
              className={`shrink-0 px-4 py-2 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${
                mafiaChatOn
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  : 'bg-[#1a1a1a] border-[#333] text-gray-500 hover:border-[#555]'
              }`}
            >
              {mafiaChatOn ? '✓ مفعّلة' : 'معطّلة'}
            </button>
          </div>
          )}

          {/* ⚔️ مواجهة النهار الوجاهيّة — للغرف الحضوريّة (البعيدة لها مواجهتها الصوتيّة) */}
          {!hideMafiaChat && (
          <div className="mt-3 p-4 bg-[#C5A059]/5 border border-[#C5A059]/15 rounded-lg flex items-center justify-between gap-3 flex-wrap" dir="rtl">
            <div className="min-w-0">
              <p className="text-[#C5A059]/90 text-xs font-mono font-bold">⚔️ مواجهة النهار</p>
              <p className="text-[#C5A059]/50 text-[10px] font-mono mt-1 leading-relaxed">
                يطلبها اللاعب من هاتفه أثناء النقاش (من الجولة الثانية) وتُنفَّذ بعد آخر متحدّث: كلمته 30ث ثمّ ردّ المستهدَف 30ث. الرصيد يُصفَّر مع كلّ لعبة.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={confPerPlayer}
                disabled={confBusy || !confOn}
                onChange={(e) => setConfSettings({ perPlayer: Number(e.target.value) })}
                className="bg-[#050505] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-lg disabled:opacity-40"
                title="حدّ طلبات المواجهة لكلّ لاعب في اللعبة الواحدة"
              >
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} لكلّ لاعب</option>)}
              </select>
              <button
                onClick={() => setConfSettings({ enabled: !confOn })}
                disabled={confBusy}
                className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${
                  confOn
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                    : 'bg-[#1a1a1a] border-[#333] text-gray-500 hover:border-[#555]'
                }`}
              >
                {confOn ? '✓ مفعّلة' : 'معطّلة'}
              </button>
            </div>
          </div>
          )}
        </div>

        {/* Citizens Section */}
        <div className={`bg-black/40 border border-[#C5A059]/30 rounded-xl p-6 backdrop-blur-sm relative ${activeSection === 'citizen' ? 'z-30' : 'z-0'}`}>
          <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-l from-transparent via-[#C5A059]/50 to-transparent rounded-t-xl" />
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#2a2a2a]">
            <h3 className="text-sm font-mono text-[#C5A059] uppercase tracking-[0.2em] font-bold">
              CITIZENS (المواطنون)
            </h3>
            <span className="bg-[#111] text-[#C5A059] font-mono border border-[#C5A059]/30 rounded px-3 py-1 text-xs">
              {citizenRoles.length} OP(s)
            </span>
          </div>
          
          <div className="flex flex-wrap gap-3">
            {roles.map((r, i) => {
              if (MAFIA_ROLES.includes(r) || NEUTRAL_ROLES.includes(r)) return null;
              return renderRoleCard(r, i, 'text-white', 'border-[#2a2a2a]');
            })}
          </div>
        </div>

        {/* 🤡 Neutral Section */}
        <div className={`bg-black/40 border border-amber-500/30 rounded-xl p-6 backdrop-blur-sm relative ${activeSection === 'neutral' ? 'z-30' : 'z-0'}`}>
          <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-l from-transparent via-amber-500/50 to-transparent rounded-t-xl" />
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-amber-500/20">
            <h3 className="text-sm font-mono text-amber-400 uppercase tracking-[0.2em] font-bold">
              🤡 NEUTRAL (المحايدون)
            </h3>
            <div className="flex items-center gap-3">
              <span className="bg-amber-500/10 text-amber-400 font-mono border border-amber-500/30 rounded px-3 py-1 text-xs">
                {neutralRoles.length} OP(s)
              </span>
              {/* زر تبديل المهرج ↔ مواطن */}
              <button
                onClick={toggleJester}
                className={`px-4 py-1.5 rounded-lg font-mono text-xs font-bold transition-all border ${
                  hasJesterInRoles
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                    : 'bg-[#111] text-[#555] border-[#2a2a2a] hover:border-amber-500/40 hover:text-amber-400'
                }`}
              >
                {hasJesterInRoles ? '🤡 إزالة المهرج' : '➕ إضافة المهرج'}
              </button>
              {/* 🔪 زر السفّاح — يظهر فقط عند 10+ لاعبين */}
              {playerCount >= 10 && (
                <button
                  onClick={toggleAssassin}
                  className={`px-4 py-1.5 rounded-lg font-mono text-xs font-bold transition-all border ${
                    hasAssassinInRoles
                      ? 'bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/30'
                      : 'bg-[#111] text-[#555] border-[#2a2a2a] hover:border-red-500/40 hover:text-red-400'
                  }`}
                >
                  {hasAssassinInRoles ? '🔪 إزالة السفّاح' : '➕ إضافة السفّاح'}
                </button>
              )}
              {/* 👥 زر التوأمين — يظهر فقط عند 10+ لاعبين */}
              {playerCount >= 10 && (
                <button
                  onClick={toggleTwins}
                  className={`px-4 py-1.5 rounded-lg font-mono text-xs font-bold transition-all border ${
                    hasTwinsInRoles
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 hover:bg-purple-500/30'
                      : 'bg-[#111] text-[#555] border-[#2a2a2a] hover:border-purple-500/40 hover:text-purple-400'
                  }`}
                >
                  {hasTwinsInRoles ? '👥 إزالة التوأمين' : '➕ إضافة التوأمين'}
                </button>
              )}
            </div>
          </div>
          
          {neutralRoles.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {roles.map((r, i) => {
                if (!NEUTRAL_ROLES.includes(r)) return null;
                return renderRoleCard(r, i, 'text-amber-400', 'border-amber-500/20');
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-[#555] font-mono text-xs tracking-widest">
              {playerCount < 8 
                ? 'يتطلب 8 لاعبين على الأقل لتفعيل المحايدين' 
                : 'لا يوجد أدوار محايدة — اضغط "إضافة المهرج" لتفعيله'}
            </div>
          )}

          {/* وصف المهرج وإعدادات النجاة */}
          {hasJesterInRoles && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} 
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 p-4 bg-amber-500/5 border border-amber-500/10 rounded-lg space-y-3"
            >
              <p className="text-amber-400/80 text-xs font-mono leading-relaxed" dir="rtl">
                🤡 المهرج يفوز إذا أقصته المدينة (تصويت / اتفاقية / قنص). يجب أن يبقى على قيد الحياة للمدة المحددة أدناه ليفوز عند إقصائه، وإلا يخسر مثل أي لاعب.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-amber-400/60 text-xs font-mono" dir="rtl">جولات النجاة المطلوبة:</span>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setJesterSurviveRounds(Math.max(1, jesterSurviveRounds - 1))}
                    className="w-7 h-7 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-sm font-bold transition-colors"
                  >−</button>
                  <span className="text-amber-300 font-mono font-bold w-6 text-center">{jesterSurviveRounds}</span>
                  <button 
                    onClick={() => setJesterSurviveRounds(Math.min(6, jesterSurviveRounds + 1))}
                    className="w-7 h-7 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-sm font-bold transition-colors"
                  >+</button>
                </div>
              </div>
            </motion.div>
          )}

          {/* 🔪 إعدادات السفّاح */}
          {hasAssassinInRoles && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} 
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 p-4 bg-red-500/5 border border-red-500/10 rounded-lg space-y-3"
            >
              <p className="text-red-400/80 text-xs font-mono leading-relaxed" dir="rtl">
                🔪 السفّاح: قاتل محترف بنظام عقود اغتيال ذكية. يقتل كل ليلة (ما عدا الأولى). إذا قتل نفس هدف المافيا لا يُحسب. يظهر كمواطن عند التحقيق.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-red-400/60 text-xs font-mono" dir="rtl">عدد العقود المطلوبة:</span>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setAssassinContractCount(Math.max(2, assassinContractCount - 1))}
                    className="w-7 h-7 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm font-bold transition-colors"
                  >−</button>
                  <span className="text-red-300 font-mono font-bold w-6 text-center">{assassinContractCount}</span>
                  <button 
                    onClick={() => setAssassinContractCount(Math.min(6, assassinContractCount + 1))}
                    className="w-7 h-7 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm font-bold transition-colors"
                  >+</button>
                </div>
              </div>
            </motion.div>
          )}

          {/* 🎩 إعدادات العمدة */}
          {hasMayorInRoles && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 p-4 bg-amber-500/5 border border-amber-500/10 rounded-lg space-y-3"
            >
              <p className="text-amber-400/80 text-xs font-mono leading-relaxed" dir="rtl">
                🎩 العمدة: مرّة واحدة بعد فرز التصويت يكشف نفسه ويُلغي الإعدام — تصويت جديد على الجميع أو تأجيل بلا موت. بعد الكشف يُحسب صوته بالوزن المحدَّد هنا.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-amber-400/60 text-xs font-mono" dir="rtl">وزن صوته بعد الكشف:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMayorVoteWeight(Math.max(1, mayorVoteWeight - 1))}
                    className="w-7 h-7 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-sm font-bold transition-colors"
                  >−</button>
                  <span className="text-amber-300 font-mono font-bold w-10 text-center">×{mayorVoteWeight}</span>
                  <button
                    onClick={() => setMayorVoteWeight(Math.min(4, mayorVoteWeight + 1))}
                    className="w-7 h-7 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-sm font-bold transition-colors"
                  >+</button>
                </div>
              </div>
            </motion.div>
          )}

          {/* 🔥 إعدادات العنقاء */}
          {hasPhoenixInRoles && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 p-4 bg-orange-500/5 border border-orange-500/10 rounded-lg space-y-3"
            >
              <p className="text-orange-400/80 text-xs font-mono leading-relaxed" dir="rtl">
                🔥 العنقاء: لا يستيقظ ولا يختار. مَن حاول إخراجه ليلاً احترق معه ونهض هو من رماده — والرصيدُ هنا هو عدد مرّات النهوض. وبعد نفاده يخرج ومعه مَن أخرجه.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-orange-400/60 text-xs font-mono" dir="rtl">مرّات النهوض:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPhoenixRebirths(Math.max(1, phoenixRebirths - 1))}
                    className="w-7 h-7 rounded bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 text-sm font-bold transition-colors"
                  >−</button>
                  <span className="text-orange-300 font-mono font-bold w-6 text-center">{phoenixRebirths}</span>
                  <button
                    onClick={() => setPhoenixRebirths(Math.min(3, phoenixRebirths + 1))}
                    className="w-7 h-7 rounded bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 text-sm font-bold transition-colors"
                  >+</button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* 🃏 الكروت المكرّرة — تنبيهٌ حيّ قبل الاعتماد */}
      {(dup.allowed.length > 0 || dup.blocked.length > 0) && (
        <div className="space-y-3" dir="rtl">
          {dup.blocked.length > 0 && (
            <div className="p-4 rounded-xl border border-red-500/40 bg-red-500/10">
              <p className="text-red-300 text-sm font-bold">⛔ كروتٌ لا تتكرّر — غيّر النسخة الزائدة لتعتمد</p>
              <ul className="mt-2 space-y-1">
                {dup.blocked.map(b => (
                  <li key={b.role} className="text-red-200/80 text-xs">
                    <span className="font-bold">{ROLE_ICONS[b.role as Role]} {nameOf(b.role)} ×{b.count}</span> — {b.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {dup.allowed.length > 0 && (
            <div className="p-4 rounded-xl border border-sky-400/40 bg-sky-500/10">
              <p className="text-sky-200 text-sm font-bold">🃏 في التوزيع كروتٌ مكرّرة — سيُطلب تأكيدك</p>
              <ul className="mt-2 space-y-1.5">
                {dup.allowed.map(a => (
                  <li key={a.role} className="text-sky-100/80 text-xs leading-relaxed">
                    <span className="font-bold">{ROLE_ICONS[a.role as Role]} {nameOf(a.role)} ×{a.count}</span> — {DUPLICATE_BEHAVIOR[a.role]}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sky-200/60 text-[11px]">🌙 الوضع الآليّ لليل يُقفل لهذه اللعبة — الليل بـ«الليلة الواحدة» أو الطابور اليدويّ.</p>
            </div>
          )}
          {assassinCount >= 2 && (
            <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/5">
              <p className="text-red-300 text-sm font-bold">🔪🔪 {assassinCount} سفّاحين — ما العلاقة بينهم؟</p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([
                  ['RIVALS', '⚔️ متنافسون', 'لكلٍّ عقودُه على هاتفه. قتلُه يُحتسب لعقوده هو، وأوّلُ من يُكمل عقودَه يفوز وحده.'],
                  ['PARTNERS', '🤝 شركاء', 'عقودٌ مشتركة يراها الجميع. قتلُ أيٍّ منهم يُكملها، ويفوزون معاً — حتّى من مات منهم.'],
                ] as [AssassinMode, string, string][]).map(([mode, label, desc]) => (
                  <button
                    key={mode}
                    onClick={() => setAssassinMode(mode)}
                    className={`text-right p-3 rounded-lg border transition-colors ${
                      assassinMode === mode ? 'border-red-400/70 bg-red-500/15' : 'border-[#2a2a2a] bg-black/30 hover:border-red-500/40'
                    }`}
                  >
                    <span className={`block text-sm font-bold ${assassinMode === mode ? 'text-red-200' : 'text-gray-400'}`}>{assassinMode === mode ? '● ' : '○ '}{label}</span>
                    <span className="block mt-1 text-[11px] text-gray-400 leading-relaxed">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="text-center mt-12 mb-6">
        <button
          onClick={() => handleConfirm(false)}
          disabled={dup.blocked.length > 0}
          className="btn-premium px-12 py-5 w-full md:w-auto min-w-[300px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="text-white text-xs tracking-[0.3em] font-bold">CONFIRM OP_DISTRIBUTION</span>
        </button>
      </div>

      {/* 🃏 سؤالُ التأكيد — لا يُعتمد توزيعٌ فيه تكرارٌ إلّا من هنا */}
      <AnimatePresence>
        {dupAsk && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setDupAsk(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-[#0c0c0c] border border-sky-400/40 rounded-2xl p-6 shadow-2xl"
              dir="rtl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>🃏 تأكيد الكروت المكرّرة</h3>
              <p className="mt-2 text-sm text-gray-400">في هذه اللعبة أكثرُ من نسخةٍ من:</p>
              <ul className="mt-3 space-y-2">
                {dup.allowed.map(a => (
                  <li key={a.role} className="p-3 rounded-lg bg-sky-500/10 border border-sky-400/20">
                    <span className="block text-sm font-bold text-sky-100">{ROLE_ICONS[a.role as Role]} {nameOf(a.role)} ×{a.count}</span>
                    <span className="block mt-1 text-xs text-sky-100/70 leading-relaxed">
                      {a.role === 'ASSASSIN'
                        ? (assassinMode === 'PARTNERS' ? '🤝 شركاء — عقودٌ مشتركة ويفوزون معاً' : '⚔️ متنافسون — لكلٍّ عقودُه وأوّلُ من يُكملها يفوز وحده')
                        : DUPLICATE_BEHAVIOR[a.role]}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-gray-500">🌙 الوضع الآليّ لليل يُقفل لهذه اللعبة.</p>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => handleConfirm(true)}
                  className="flex-1 py-3 rounded-xl bg-sky-500/20 border border-sky-400/50 text-sky-100 font-bold text-sm hover:bg-sky-500/30"
                >نعم، اعتمد التوزيع</button>
                <button
                  onClick={() => setDupAsk(false)}
                  className="px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[#333] text-gray-300 text-sm hover:border-[#555]"
                >رجوع للتعديل</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
