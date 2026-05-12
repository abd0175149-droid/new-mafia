'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { gcFetch, TEAM_OPTIONS } from './helpers';

interface RoleGen {
  id: string;
  nameAr: string;
  team: string;
  genPriority: number;
  genMaxCount: number;
  genMinPlayers: number;
  genIsRequired: boolean;
}

export default function GenerationTab() {
  const [roles, setRoles] = useState<RoleGen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [testCount, setTestCount] = useState(10);
  const [mafiaRatio, setMafiaRatio] = useState(33); // نسبة المافيا %
  const [testResult, setTestResult] = useState<any>(null);

  const load = () => {
    setLoading(true);
    gcFetch('/roles').then(d => setRoles(d.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // حفظ تعديل سريع على دور
  const quickUpdate = async (roleId: string, field: string, value: any) => {
    setSaving(roleId);
    try {
      await gcFetch(`/roles/${roleId}`, {
        method: 'PUT',
        body: JSON.stringify({ [field]: value }),
      });
      setRoles(prev => prev.map(r => r.id === roleId ? { ...r, [field]: value } : r));
    } catch (e: any) { setError(e.message); }
    finally { setSaving(null); }
  };

  // محاكاة التوليد
  const simulateGeneration = () => {
    // حساب محلي بسيط لعرض التوقعات
    const playerCount = testCount;
    const ratio = mafiaRatio / 100;
    const mafiaCount = Math.max(1, Math.round(playerCount * ratio));
    const citizenCount = playerCount - mafiaCount;

    const mafiaRoles = roles.filter(r => r.team === 'MAFIA').sort((a, b) => a.genPriority - b.genPriority);
    const citizenRoles = roles.filter(r => r.team === 'CITIZEN').sort((a, b) => a.genPriority - b.genPriority);
    const neutralRoles = roles.filter(r => r.team === 'NEUTRAL').sort((a, b) => a.genPriority - b.genPriority);

    // توزيع المافيا
    const assignedMafia: { role: string; nameAr: string }[] = [];
    let remainingMafia = mafiaCount;
    for (const role of mafiaRoles) {
      if (remainingMafia <= 0) break;
      if (role.genMinPlayers > playerCount) continue;
      const count = Math.min(remainingMafia, role.genMaxCount);
      for (let i = 0; i < count; i++) {
        assignedMafia.push({ role: role.id, nameAr: role.nameAr });
        remainingMafia--;
      }
    }

    // توزيع المواطنين
    const assignedCitizen: { role: string; nameAr: string }[] = [];
    let remainingCitizen = citizenCount;
    for (const role of citizenRoles) {
      if (remainingCitizen <= 0) break;
      if (role.genMinPlayers > playerCount) continue;
      if (role.id === 'CITIZEN') continue; // المواطن العادي يملأ الباقي
      const count = Math.min(remainingCitizen, role.genMaxCount);
      for (let i = 0; i < count; i++) {
        assignedCitizen.push({ role: role.id, nameAr: role.nameAr });
        remainingCitizen--;
      }
    }
    // ملء الباقي بمواطنين عاديين
    const citizenRegular = citizenRoles.find(r => r.id === 'CITIZEN');
    while (remainingCitizen > 0 && citizenRegular) {
      assignedCitizen.push({ role: 'CITIZEN', nameAr: citizenRegular.nameAr });
      remainingCitizen--;
    }

    setTestResult({
      playerCount,
      mafia: assignedMafia,
      citizen: assignedCitizen,
      neutral: [], // لا محايدين في المحاكاة البسيطة حالياً
    });
  };

  const getTeamColor = (team: string) => {
    return team === 'MAFIA' ? 'text-rose-400' : team === 'CITIZEN' ? 'text-blue-400' : 'text-amber-400';
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      {error && <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm">{error}</div>}

      {/* ── أولويات وإعدادات التوليد ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">⚙️ ترتيب الأولوية وإعدادات التوليد</h3>
        <p className="text-xs text-gray-500">الأولوية الأقل = يُولّد أولاً. الأدوار الإجبارية تظهر دائماً.</p>

        {['MAFIA', 'CITIZEN', 'NEUTRAL'].map(team => {
          const teamRoles = roles.filter(r => r.team === team).sort((a, b) => a.genPriority - b.genPriority);
          if (teamRoles.length === 0) return null;
          const teamInfo = TEAM_OPTIONS.find(t => t.value === team)!;
          return (
            <div key={team} className="space-y-2">
              <h4 className={`text-xs font-bold ${teamInfo.color} flex items-center gap-2`}>
                {team === 'MAFIA' ? '🔴' : team === 'CITIZEN' ? '🔵' : '🟡'} {teamInfo.label}
              </h4>
              <div className="space-y-1.5">
                {teamRoles.map((r, i) => (
                  <motion.div key={r.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    className={`bg-gray-800/50 border border-gray-700/40 rounded-xl p-3 flex items-center gap-3 ${saving === r.id ? 'opacity-50' : ''}`}>
                    {/* الأولوية */}
                    <input type="number" value={r.genPriority} onChange={e => quickUpdate(r.id, 'genPriority', parseInt(e.target.value) || 0)}
                      className="w-14 px-2 py-1 bg-gray-900/80 border border-gray-700/50 rounded-lg text-white text-sm text-center focus:border-amber-500/50 focus:outline-none" />
                    
                    {/* الاسم */}
                    <div className="flex-1 min-w-0">
                      <span className="text-white text-sm">{r.nameAr}</span>
                      <span className="text-gray-600 text-xs mr-2">({r.id})</span>
                    </div>

                    {/* الحد الأقصى */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-600">حد:</span>
                      <input type="number" value={r.genMaxCount} onChange={e => quickUpdate(r.id, 'genMaxCount', parseInt(e.target.value) || 1)} min={1} max={20}
                        className="w-12 px-1 py-0.5 bg-gray-900/80 border border-gray-700/50 rounded text-white text-xs text-center focus:border-amber-500/50 focus:outline-none" />
                    </div>

                    {/* أقل عدد لاعبين */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-600">≥</span>
                      <input type="number" value={r.genMinPlayers} onChange={e => quickUpdate(r.id, 'genMinPlayers', parseInt(e.target.value) || 6)} min={1} max={30}
                        className="w-12 px-1 py-0.5 bg-gray-900/80 border border-gray-700/50 rounded text-white text-xs text-center focus:border-amber-500/50 focus:outline-none" />
                    </div>

                    {/* إجباري */}
                    <button onClick={() => quickUpdate(r.id, 'genIsRequired', !r.genIsRequired)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] border transition ${r.genIsRequired ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-gray-800/50 text-gray-500 border-gray-700/40 hover:text-gray-300'}`}>
                      {r.genIsRequired ? '✓ إجباري' : 'اختياري'}
                    </button>
                  </motion.div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── محاكاة التوليد ── */}
      <div className="bg-gray-800/30 border border-gray-700/40 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">🎲 محاكاة التوليد</h3>
        <p className="text-xs text-gray-500">اختر عدد اللاعبين لمعاينة التوزيع المتوقع.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* عدد اللاعبين */}
          <div className="space-y-2">
            <label className="text-xs text-gray-500 flex items-center justify-between">
              <span>عدد اللاعبين</span>
              <span className="text-amber-400 font-mono font-bold text-lg">{testCount}</span>
            </label>
            <input type="range" min={4} max={25} value={testCount} onChange={e => setTestCount(parseInt(e.target.value))}
              className="w-full accent-amber-500" />
          </div>

          {/* نسبة المافيا */}
          <div className="space-y-2">
            <label className="text-xs text-gray-500 flex items-center justify-between">
              <span>نسبة المافيا</span>
              <span className="text-rose-400 font-mono font-bold text-lg">{mafiaRatio}%</span>
            </label>
            <input type="range" min={20} max={50} value={mafiaRatio} onChange={e => setMafiaRatio(parseInt(e.target.value))}
              className="w-full accent-rose-500" />
          </div>
        </div>

        <button onClick={simulateGeneration}
          className="w-full py-2.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-xl text-sm hover:bg-amber-500/25 transition font-bold">🎲 محاكاة التوزيع</button>

        {testResult && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 mt-3">
            <div className="flex gap-4 text-sm">
              <span className="text-rose-400 font-bold">🔴 مافيا: {testResult.mafia.length}</span>
              <span className="text-blue-400 font-bold">🔵 مواطنون: {testResult.citizen.length}</span>
              {testResult.neutral.length > 0 && <span className="text-amber-400 font-bold">🟡 محايد: {testResult.neutral.length}</span>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3">
                <p className="text-rose-400 text-xs font-bold mb-2">فريق المافيا</p>
                {testResult.mafia.map((r: any, i: number) => (
                  <p key={i} className="text-white text-sm">{r.nameAr}</p>
                ))}
              </div>
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3">
                <p className="text-blue-400 text-xs font-bold mb-2">فريق المدينة</p>
                {testResult.citizen.map((r: any, i: number) => (
                  <p key={i} className="text-white text-sm">{r.nameAr}</p>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
