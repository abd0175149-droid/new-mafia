'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Role, ROLE_NAMES, ROLE_ICONS, MAFIA_ROLES, NEUTRAL_ROLES } from '@/lib/constants';

interface LeaderRoleConfiguratorProps {
  gameState: any;
  emit: (event: string, payload: any) => Promise<any>;
  setError: (err: string) => void;
}

export default function LeaderRoleConfigurator({ gameState, emit, setError }: LeaderRoleConfiguratorProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);

  useEffect(() => {
    const playerCount = gameState.players.filter((p: any) => p.isAlive !== false).length;
    const totalMafia = Math.ceil(playerCount / 4);

    // خوارزمية المهرج: يُضاف تلقائياً عند 8+ لاعبين (يأخذ مقعد مواطن)
    const hasJester = playerCount >= 8;
    const totalNeutral = hasJester ? 1 : 0;
    const totalCitizens = playerCount - totalMafia - totalNeutral;

    const mafiaOrder = [Role.GODFATHER, Role.SILENCER, Role.CHAMELEON, Role.MAFIA_REGULAR];
    const citizenOrder = [Role.SHERIFF, Role.DOCTOR, Role.SNIPER, Role.POLICEWOMAN, Role.NURSE, Role.CITIZEN];

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
  }, [gameState.players]);

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

  const handleConfirm = async () => {
    try {
      setLoading(true);
      await emit('setup:roles-confirmed', { roomId: gameState.roomId, roles });
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const allRolesList = Object.values(Role);

  if (loading) return <div className="text-center p-12 text-[#555] font-mono tracking-widest">INITIALIZING ROSTER...</div>;

  const mafiaRoles = roles.filter(r => MAFIA_ROLES.includes(r));
  const citizenRoles = roles.filter(r => !MAFIA_ROLES.includes(r) && !NEUTRAL_ROLES.includes(r));
  const neutralRoles = roles.filter(r => NEUTRAL_ROLES.includes(r));
  const hasJesterInRoles = roles.includes(Role.JESTER);
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

          {/* وصف المهرج */}
          {hasJesterInRoles && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} 
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg"
            >
              <p className="text-amber-400/80 text-xs font-mono leading-relaxed" dir="rtl">
                🤡 المهرج يفوز إذا أقصته المدينة (تصويت / اتفاقية / قنص). إذا فاز — تنتهي اللعبة فوراً.
              </p>
            </motion.div>
          )}
        </div>
      </div>

      <div className="text-center mt-12 mb-6">
        <button onClick={handleConfirm} className="btn-premium px-12 py-5 w-full md:w-auto min-w-[300px]">
          <span className="text-white text-xs tracking-[0.3em] font-bold">CONFIRM OP_DISTRIBUTION</span>
        </button>
      </div>

    </div>
  );
}
