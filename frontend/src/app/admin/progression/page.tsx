'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `API error ${res.status}`); }
  return res.json();
}

// تم هيكلة الأحداث كفئات لدعم إضافة أحداث أو قدرات شخصيات مستقبلاً بسهولة
const ACTION_CATEGORIES = [
  {
    id: 'basics', label: '🔰 أساسيات المباراة',
    actions: [
      { key: 'participation', label: 'مشاركة في مباراة', icon: '🎮', type: 'XP', desc: 'نقطة دخول لكل لاعب' },
      { key: 'teamWin', label: 'فوز الفريق', icon: '🏆', type: 'BOTH', desc: 'مكافأة الفوز لفريق اللاعب' },
      { key: 'teamLoss', label: 'خسارة الفريق', icon: '💀', type: 'RR', desc: 'خصم الخسارة (سالب عادة)' },
      { key: 'survivalPerRound', label: 'نجاة لكل جولة', icon: '⏳', type: 'XP', desc: 'لكل جولة يظل فيها حياً' },
      { key: 'survivedToEnd', label: 'نجاة حتى النهاية', icon: '🎖️', type: 'RR', desc: 'نجا حتى نهاية المباراة' },
      { key: 'teamEliminationBonus', label: 'مكافأة إقصاء خصم', icon: '⚔️', type: 'XP', desc: 'تمنح للفريق لكل خصم يُقصى' }
    ]
  },
  {
    id: 'deals', label: '🤝 الديلات والاتفاقات',
    actions: [
      { key: 'citizenDealOnMafia', label: 'ديل مواطن ناجح', icon: '✨', type: 'BOTH', desc: 'مواطن أخرج عنصر مافيا' },
      { key: 'failedDeal', label: 'ديل فاشل', icon: '💔', type: 'BOTH', desc: 'مواطن أخرج مواطناً' },
      { key: 'mafiaDealOnMafia', label: 'ديل مافيا على مافيا', icon: '🔴', type: 'BOTH', desc: 'غدر بالزميل (عقوبة)' },
    ]
  },
  {
    id: 'roles', label: '🎯 قدرات الأدوار',
    actions: [
      { key: 'abilityCorrect', label: 'قدرة صحيحة', icon: '✅', type: 'BOTH', desc: 'إصابة صحيحة لشريف/قناص/طبيب' },
      { key: 'abilityIncorrect', label: 'قدرة خاطئة', icon: '❌', type: 'BOTH', desc: 'إصابة خاطئة (عقوبة)' },
      // مساحة مستقبلية:
      // { key: 'sniperHitMafia', label: 'قناص أصاب مافيا', icon: '🔫', type: 'BOTH', desc: 'مخصصة للقناص فقط' }
    ]
  },
  {
    id: 'penalties', label: '⚖️ نظام العقوبات',
    actions: [
      { key: 'penaltyDeduction', label: 'عقوبة عادية', icon: '⚠️', type: 'RR', desc: 'خصم نقاط رتبة عند تلقي عقوبة (سالب عادة)' },
      { key: 'penaltyKickDeduction', label: 'عقوبة الإقصاء', icon: '🚫', type: 'RR', desc: 'خصم إضافي عند طرد اللاعب لتجاوزه حد العقوبات' }
    ]
  },
  {
    id: 'bomb', label: '💣 قدرة القنبلة (شيخ المافيا)',
    actions: [
      { key: 'bombHitCitizen', label: 'قنبلة أصابت مواطن', icon: '💣', type: 'RR', desc: 'مكافأة شيخ المافيا عند إقصاء مواطن بالقنبلة' },
      { key: 'bombHitMafia', label: 'قنبلة أصابت مافيا', icon: '💥', type: 'RR', desc: 'خصم على شيخ المافيا عند إقصاء حليف بالقنبلة (سالب عادة)' }
    ]
  }
];

const RANK_TIERS = [
  { key: 'INFORMANT', label: 'المُخبر', icon: '⭐', color: 'text-gray-400', border: 'border-gray-500/30' },
  { key: 'SOLDIER', label: 'الجندي', icon: '⭐⭐', color: 'text-emerald-400', border: 'border-emerald-500/30' },
  { key: 'CAPO', label: 'الكابو', icon: '🌟', color: 'text-blue-400', border: 'border-blue-500/30' },
  { key: 'UNDERBOSS', label: 'الأندربوس', icon: '🌟🌟', color: 'text-purple-400', border: 'border-purple-500/30' },
  { key: 'GODFATHER', label: 'الأب الروحي', icon: '👑', color: 'text-amber-400', border: 'border-amber-500/30' },
];

type Tab = 'xp' | 'rr' | 'ranks' | 'adjust';

export default function ProgressionPage() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('xp');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Adjust state
  const [players, setPlayers] = useState<any[]>([]);
  const [selPlayer, setSelPlayer] = useState<any>(null);
  const [playerMatches, setPlayerMatches] = useState<any[]>([]);
  const [selMatch, setSelMatch] = useState<any>(null);
  
  // Adjust Form
  const [xpDelta, setXpDelta] = useState<number | ''>('');
  const [rrDelta, setRrDelta] = useState<number | ''>('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [searchQ, setSearchQ] = useState('');

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    try {
      const data = await apiFetch('/api/progression-settings');
      setConfig(data.config);
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setLoading(false); }
  }

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  }

  async function saveConfig() {
    setSaving(true);
    try {
      await apiFetch('/api/progression-settings', { method: 'PUT', body: JSON.stringify({ config }) });
      showToast('تم حفظ الإعدادات بنجاح', 'success');
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  }

  function updateField(section: 'xp' | 'rr', key: string, value: string) {
    const val = value === '' ? 0 : Number(value);
    setConfig((prev: any) => ({ ...prev, [section]: { ...prev[section], [key]: val } }));
  }
  function updateRank(tier: string, value: string) {
    const val = value === '' ? 0 : Number(value);
    setConfig((prev: any) => ({ ...prev, ranks: { ...prev.ranks, [tier]: { rrRequired: val } } }));
  }

  // Adjust actions
  async function loadPlayers() {
    try { const d = await apiFetch('/api/player/all'); setPlayers(d.players || []); } catch {}
  }
  async function loadPlayerMatches(playerId: number) {
    try {
      const d = await apiFetch(`/api/progression-settings/player/${playerId}/matches`);
      setPlayerMatches(d.matches || []);
      setSelPlayer(d.player);
      setSelMatch(null);
      setXpDelta(''); setRrDelta(''); setAdjustReason('');
    } catch (err: any) { showToast(err.message, 'error'); }
  }
  async function submitAdjust() {
    if (!selPlayer || !selMatch) return;
    const xpVal = Number(xpDelta) || 0;
    const rrVal = Number(rrDelta) || 0;
    if (xpVal === 0 && rrVal === 0) return;
    setAdjusting(true);
    try {
      await apiFetch(`/api/progression-settings/player/${selPlayer.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ matchPlayerId: selMatch.mpId, xpDelta: xpVal, rrDelta: rrVal, reason: adjustReason || 'تعديل إداري' }),
      });
      showToast(`تم تعديل نقاط ${selPlayer.name} بنجاح`, 'success');
      loadPlayerMatches(selPlayer.id); // Refresh
      setXpDelta(''); setRrDelta(''); setAdjustReason('');
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setAdjusting(false); }
  }

  useEffect(() => { if (tab === 'adjust' && players.length === 0) loadPlayers(); }, [tab]);

  if (loading || !config) return <div className="flex items-center justify-center h-screen"><div className="animate-spin h-10 w-10 border-4 border-amber-500 border-t-transparent rounded-full" /></div>;

  const filteredPlayers = players.filter(p => !searchQ.trim() || p.name?.toLowerCase().includes(searchQ.toLowerCase()) || p.phone?.includes(searchQ));

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20" dir="rtl">
      <div>
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-l from-amber-400 to-rose-500 flex items-center gap-2">
          🏆 الإدارة المتقدمة للتقدم
        </h1>
        <p className="text-gray-400 text-sm mt-1">نظام ديناميكي يتيح التحكم الشامل وتوسيع الأحداث المترتبة عليها نقاط للاعبين.</p>
      </div>

      {/* Tabs Menu */}
      <div className="flex gap-2 p-1.5 bg-gray-900/60 backdrop-blur-md rounded-2xl w-fit border border-gray-800/60 overflow-x-auto max-w-full">
        {([
          { key: 'xp', label: '⭐ مستويات (XP)', color: 'amber' },
          { key: 'rr', label: '🎖️ رانك (RR)', color: 'blue' },
          { key: 'ranks', label: '👑 الرتب (Tiers)', color: 'purple' },
          { key: 'adjust', label: '🔧 التعديل اليدوي', color: 'rose' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${tab === t.key ? `bg-${t.color}-500 text-white shadow-lg shadow-${t.color}-500/25` : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >{t.label}</button>
        ))}
      </div>

      {/* ─── XP / RR Configuration Tabs ─── */}
      {(tab === 'xp' || tab === 'rr') && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="bg-gray-800/40 border border-gray-700/50 rounded-3xl p-6 md:p-8 backdrop-blur-sm">
            <h3 className="text-xl font-bold text-white mb-2">
              {tab === 'xp' ? '⭐ إعدادات نقاط الخبرة (تؤثر على المستوى)' : '🎖️ إعدادات الرانك (تؤثر على الرتبة)'}
            </h3>
            <p className="text-gray-400 text-sm mb-6">قسّمنا الإعدادات لفئات لتسهيل إضافة أحداث أو قدرات شخصيات جديدة مستقبلاً بكل مرونة.</p>

            <div className="space-y-8">
              {ACTION_CATEGORIES.map(category => {
                const categoryActions = category.actions.filter(a => a.type === 'BOTH' || a.type === tab.toUpperCase());
                if (categoryActions.length === 0) return null;
                return (
                  <div key={category.id} className="space-y-4">
                    <h4 className="text-lg font-bold text-gray-200 border-b border-gray-700/50 pb-2">{category.label}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {categoryActions.map(action => {
                        const val = config[tab]?.[action.key] ?? 0;
                        const isPositive = val >= 0;
                        return (
                          <div key={action.key} className="flex flex-col gap-2 p-4 bg-gray-900/50 rounded-2xl border border-gray-700/30 hover:border-gray-600/50 transition-colors">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xl">{action.icon}</span>
                                <span className="font-bold text-sm text-gray-200">{action.label}</span>
                              </div>
                              <input 
                                type="number" 
                                value={val} 
                                onChange={e => updateField(tab, action.key, e.target.value)}
                                className={`w-20 px-2 py-1 rounded-lg text-center font-bold bg-gray-950 border focus:outline-none focus:ring-2 ${isPositive ? 'text-emerald-400 border-emerald-500/30 focus:ring-emerald-500/20' : 'text-rose-400 border-rose-500/30 focus:ring-rose-500/20'}`}
                              />
                            </div>
                            <p className="text-[11px] text-gray-500">{action.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Special Section for each tab */}
            {tab === 'xp' && (
              <div className="mt-8 p-6 bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-amber-500/20">
                <h4 className="text-md font-bold text-amber-400 mb-2">📈 معادلة المستوى المتقدمة</h4>
                <p className="text-xs text-gray-400 mb-4">Level = floor( (TotalXP / BaseXP) ^ (1 / Exponent) )</p>
                <div className="flex flex-wrap gap-6">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">الأساس (BaseXP)</label>
                    <input type="number" value={config.level?.baseXP ?? 500} onChange={e => setConfig((p: any) => ({ ...p, level: { ...p.level, baseXP: Number(e.target.value) } }))}
                      className="w-32 px-3 py-2 rounded-xl bg-gray-950 border border-gray-700 text-white focus:outline-none focus:border-amber-500/50" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">المُعامل (Exponent)</label>
                    <input type="number" step="0.1" value={config.level?.exponent ?? 1.2} onChange={e => setConfig((p: any) => ({ ...p, level: { ...p.level, exponent: Number(e.target.value) } }))}
                      className="w-32 px-3 py-2 rounded-xl bg-gray-950 border border-gray-700 text-white focus:outline-none focus:border-amber-500/50" />
                  </div>
                </div>
              </div>
            )}

            {tab === 'rr' && (
              <div className="mt-8 p-6 bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-blue-500/20 flex flex-col sm:flex-row items-center gap-4">
                <div className="flex-1">
                  <h4 className="text-md font-bold text-blue-400 mb-1">⬇️ سياسة التنزيل (Demotion Refund)</h4>
                  <p className="text-xs text-gray-400">كم النسبة المئوية التي يستردها اللاعب من رتبته الأدنى عند نزول رتبته بسبب خسارة متتالية.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" max="100" value={config.demotionReturnPercent ?? 80} onChange={e => setConfig((p: any) => ({ ...p, demotionReturnPercent: Number(e.target.value) }))}
                    className="w-24 px-3 py-2 rounded-xl bg-gray-950 border border-gray-700 text-white text-center focus:outline-none focus:border-blue-500/50" />
                  <span className="text-gray-400 font-bold">%</span>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ─── Ranks Config Tab ─── */}
      {tab === 'ranks' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gray-800/40 border border-gray-700/50 rounded-3xl p-6 md:p-8 backdrop-blur-sm">
          <h3 className="text-xl font-bold text-white mb-2">👑 حدود الترقية (Rank Tiers)</h3>
          <p className="text-gray-400 text-sm mb-6">حدد كم نقطة RR يحتاجها اللاعب للوصول لكل رتبة.</p>
          <div className="max-w-2xl mx-auto space-y-4 relative">
            {/* خط التوصيل في الخلفية */}
            <div className="absolute right-[2.25rem] top-8 bottom-8 w-0.5 bg-gradient-to-b from-gray-600/20 to-amber-500/20 z-0 hidden sm:block" />
            
            {RANK_TIERS.map((r, i) => (
              <div key={r.key} className={`relative z-10 flex items-center gap-4 p-5 bg-gray-900/80 rounded-2xl border ${r.border} backdrop-blur-md shadow-lg`}>
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl bg-gray-950 border ${r.border} shrink-0 shadow-inner`}>
                  {r.icon}
                </div>
                <div className="flex-1">
                  <p className={`text-lg font-bold ${r.color}`}>{r.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{i < RANK_TIERS.length - 1 ? `الرتبة القادمة: ${RANK_TIERS[i + 1].label}` : 'سقف الرتب الحالي'}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <label className="text-[10px] text-gray-500">مطلوب RR</label>
                  <input type="number" value={config.ranks?.[r.key]?.rrRequired ?? 0} onChange={e => updateRank(r.key, e.target.value)}
                    className="w-28 px-3 py-2 rounded-xl bg-gray-950 border border-gray-700 text-white font-bold text-center focus:outline-none focus:border-purple-500/50" />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Save Button for Config Tabs */}
      {tab !== 'adjust' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-end">
          <button onClick={saveConfig} disabled={saving}
            className="px-8 py-3 bg-gradient-to-r from-amber-500 to-rose-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-amber-500/20 transition-all disabled:opacity-50 flex items-center gap-2">
            {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '💾'}
            {saving ? 'جاري الحفظ...' : 'حفظ ونشر التعديلات الحالية'}
          </button>
        </motion.div>
      )}

      {/* ─── Adjust Tab (Advanced 2-Pane UI) ─── */}
      {tab === 'adjust' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col lg:flex-row gap-6 h-[75vh]">
          
          {/* Left Pane: Search & Players List */}
          <div className="w-full lg:w-1/3 flex flex-col bg-gray-800/40 border border-gray-700/50 rounded-3xl overflow-hidden backdrop-blur-sm shadow-xl">
            <div className="p-5 border-b border-gray-700/50 bg-gray-900/40">
              <h3 className="text-lg font-bold text-white mb-4">🔍 البحث عن لاعب</h3>
              <div className="relative">
                <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="ابحث بالاسم أو الهاتف..."
                  className="w-full pl-4 pr-10 py-3 bg-gray-950 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 transition-colors" />
                <span className="absolute right-3 top-3.5 text-gray-500">🔎</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}>
              {filteredPlayers.length === 0 ? <p className="text-center text-gray-500 mt-10 text-sm">لا يوجد لاعبين</p> : null}
              {filteredPlayers.slice(0, 30).map((p: any) => {
                const isSelected = selPlayer?.id === p.id;
                return (
                  <button key={p.id} onClick={() => loadPlayerMatches(p.id)}
                    className={`w-full text-right p-3 rounded-2xl transition-all border ${isSelected ? 'bg-amber-500/10 border-amber-500/30 shadow-sm' : 'bg-transparent border-transparent hover:bg-gray-700/30'}`}>
                    <div className="flex justify-between items-center">
                      <span className={`font-bold text-sm ${isSelected ? 'text-amber-400' : 'text-gray-200'}`}>{p.name}</span>
                      <span className="text-[10px] text-gray-500 font-mono" dir="ltr">{p.phone}</span>
                    </div>
                    <div className="flex gap-3 mt-1.5 text-[11px]">
                      <span className="text-gray-400">Lv.{p.level || 1}</span>
                      <span className="text-gray-500">•</span>
                      <span className="text-purple-400">{p.rankTier || 'INFORMANT'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Pane: Match Timeline & Adjust Form */}
          <div className="w-full lg:w-2/3 flex flex-col bg-gray-800/40 border border-gray-700/50 rounded-3xl overflow-hidden backdrop-blur-sm shadow-xl">
            {selPlayer ? (
              <>
                {/* Player Header */}
                <div className="p-5 border-b border-gray-700/50 bg-gradient-to-r from-gray-900/80 to-gray-800/80 flex flex-wrap justify-between items-center gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      👤 {selPlayer.name}
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">إجمالي النقاط المسجلة</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="bg-gray-950 border border-amber-500/20 px-4 py-2 rounded-xl text-center">
                      <span className="block text-[10px] text-gray-500 mb-0.5">نقاط الخبرة (XP)</span>
                      <span className="font-bold text-amber-400 text-lg">{selPlayer.xp || 0}</span>
                    </div>
                    <div className="bg-gray-950 border border-blue-500/20 px-4 py-2 rounded-xl text-center">
                      <span className="block text-[10px] text-gray-500 mb-0.5">الرانك (RR)</span>
                      <span className="font-bold text-blue-400 text-lg">{selPlayer.rankRR || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Match Timeline */}
                <div className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}>
                  <h3 className="text-sm font-bold text-gray-300 mb-4">📜 سجل المباريات (اختر مباراة للتعديل)</h3>
                  <div className="space-y-3">
                    {playerMatches.length === 0 ? <p className="text-gray-500 text-sm text-center py-10">لم يلعب أي مباراة بعد.</p> : null}
                    {playerMatches.map((m: any) => {
                      const isMafia = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'].includes(m.role || '');
                      const won = (isMafia && m.matchWinner === 'MAFIA') || (!isMafia && m.matchWinner === 'CITIZEN');
                      const isSelected = selMatch?.mpId === m.mpId;
                      return (
                        <button key={m.mpId} onClick={() => setSelMatch(m)}
                          className={`w-full text-right p-4 rounded-2xl border transition-all flex flex-wrap items-center gap-4 ${isSelected ? 'bg-indigo-500/10 border-indigo-500/40 shadow-inner' : 'bg-gray-900/50 border-gray-700/50 hover:border-gray-500/50'}`}>
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${won ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                            {won ? '🏆' : '💀'}
                          </div>
                          <div className="flex-1 min-w-[120px]">
                            <p className="font-bold text-sm text-gray-200">الدور: {m.role}</p>
                            <p className="text-[11px] text-gray-500 mt-1">مباراة #{m.matchRoomCode} • {new Date(m.matchDate).toLocaleDateString('ar-JO', { month: 'short', day: 'numeric' })}</p>
                          </div>
                          <div className="flex gap-3 text-sm">
                            <span className="bg-amber-500/10 text-amber-400 px-3 py-1 rounded-lg">+{m.xpEarned ?? 0} XP</span>
                            <span className={`px-3 py-1 rounded-lg ${m.rrChange >= 0 ? 'bg-blue-500/10 text-blue-400' : 'bg-rose-500/10 text-rose-400'}`}>
                              {m.rrChange > 0 ? '+' : ''}{m.rrChange ?? 0} RR
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Adjust Form Panel */}
                <AnimatePresence>
                  {selMatch && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                      className="p-5 border-t border-gray-700/50 bg-gray-900 shadow-[0_-10px_30px_rgba(0,0,0,0.3)] z-10 relative">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-indigo-400 flex items-center gap-2">
                          <span className="text-xl">🛠️</span> لوحة التعديل والتفاصيل — مباراة #{selMatch.matchRoomCode}
                        </h4>
                        <button onClick={() => setSelMatch(null)} className="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
                      </div>

                      {/* ── Match Breakdown ── */}
                      <div className="mb-6 bg-gray-950/50 border border-gray-800 rounded-xl p-4">
                        <h5 className="text-xs font-bold text-gray-400 mb-3 border-b border-gray-800 pb-2">تفاصيل النقاط المكتسبة (تقديرية بناءً على الإعدادات الحالية):</h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                          {/* Participation & Win/Loss */}
                          <div className="flex justify-between text-gray-300">
                            <span>🎮 مشاركة:</span>
                            <span className="text-amber-400" dir="ltr">+{config?.xp?.participation || 0} XP</span>
                          </div>
                          {(() => {
                            const isMafia = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'].includes(selMatch.role || '');
                            const won = (isMafia && selMatch.matchWinner === 'MAFIA') || (!isMafia && selMatch.matchWinner === 'CITIZEN');
                            return (
                              <div className="flex justify-between text-gray-300">
                                <span>{won ? '🏆 فوز:' : '💀 خسارة:'}</span>
                                <div>
                                  {won ? <span className="text-amber-400 ml-2" dir="ltr">+{config?.xp?.teamWin || 0} XP</span> : null}
                                  <span className={won ? 'text-blue-400' : 'text-rose-400'} dir="ltr">{won ? `+${config?.rr?.teamWin || 0}` : (config?.rr?.teamLoss || 0)} RR</span>
                                </div>
                              </div>
                            );
                          })()}
                          {/* Survival */}
                          <div className="flex justify-between text-gray-300">
                            <span>⏳ النجاة ({selMatch.roundsSurvived || 0} جولات):</span>
                            <span className="text-amber-400" dir="ltr">+{(selMatch.roundsSurvived || 0) * (config?.xp?.survivalPerRound || 0)} XP</span>
                          </div>
                          {selMatch.survivedToEnd && (
                            <div className="flex justify-between text-gray-300">
                              <span>🎖️ النجاة للنهاية:</span>
                              <span className="text-blue-400" dir="ltr">+{config?.rr?.survivedToEnd || 0} RR</span>
                            </div>
                          )}
                          {/* Deals */}
                          {selMatch.dealInitiated && (() => {
                            const isMafia = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'].includes(selMatch.role || '');
                            let xp = 0; let rr = 0;
                            if (isMafia) {
                              if (!selMatch.dealSuccess) { xp = config?.xp?.mafiaDealOnMafia || 0; rr = config?.rr?.mafiaDealOnMafia || 0; }
                            } else {
                              if (selMatch.dealSuccess) { xp = config?.xp?.citizenDealOnMafia || 0; rr = config?.rr?.citizenDealOnMafia || 0; }
                              else { xp = config?.xp?.failedDeal || 0; rr = config?.rr?.failedDeal || 0; }
                            }
                            return (
                              <div className="flex justify-between text-gray-300">
                                <span>🤝 الديل (نتيجة):</span>
                                <div className="text-right">
                                  <span className={selMatch.dealSuccess ? 'text-emerald-400 block mb-0.5' : 'text-rose-400 block mb-0.5'}>
                                    {selMatch.dealSuccess ? 'نجاح' : 'فشل/غدر'}
                                  </span>
                                  {(xp !== 0 || rr !== 0) && (
                                    <div>
                                      {xp !== 0 && <span className={xp > 0 ? 'text-amber-400 ml-2' : 'text-rose-400 ml-2'} dir="ltr">{xp > 0 ? '+' : ''}{xp} XP</span>}
                                      {rr !== 0 && <span className={rr > 0 ? 'text-blue-400' : 'text-rose-400'} dir="ltr">{rr > 0 ? '+' : ''}{rr} RR</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                          {/* Abilities */}
                          {selMatch.abilityUsed && (() => {
                            const xp = selMatch.abilityCorrect ? (config?.xp?.abilityCorrect || 0) : (config?.xp?.abilityIncorrect || 0);
                            const rr = selMatch.abilityCorrect ? (config?.rr?.abilityCorrect || 0) : (config?.rr?.abilityIncorrect || 0);
                            return (
                              <div className="flex justify-between text-gray-300">
                                <span>🎯 القدرة (نتيجة):</span>
                                <div className="text-right">
                                  <span className={selMatch.abilityCorrect ? 'text-emerald-400 block mb-0.5' : 'text-rose-400 block mb-0.5'}>
                                    {selMatch.abilityCorrect ? 'أصاب الهدف' : 'أخطأ الهدف'}
                                  </span>
                                  {(xp !== 0 || rr !== 0) && (
                                    <div>
                                      {xp !== 0 && <span className={xp > 0 ? 'text-amber-400 ml-2' : 'text-rose-400 ml-2'} dir="ltr">{xp > 0 ? '+' : ''}{xp} XP</span>}
                                      {rr !== 0 && <span className={rr > 0 ? 'text-blue-400' : 'text-rose-400'} dir="ltr">{rr > 0 ? '+' : ''}{rr} RR</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Quick Macros */}
                      <div className="mb-5">
                        <p className="text-[11px] text-gray-400 mb-2">إضافات سريعة (Macro):</p>
                        <div className="flex flex-wrap gap-2">
                          {ACTION_CATEGORIES.flatMap(c => c.actions).map(a => {
                            if(a.key === 'participation' || a.key === 'teamWin' || a.key === 'teamLoss') return null; // غالبًا لا يتم نسيانها
                            const defXp = config.xp?.[a.key] || 0;
                            const defRr = config.rr?.[a.key] || 0;
                            if(defXp === 0 && defRr === 0) return null;
                            return (
                              <button key={a.key} onClick={() => { setXpDelta(defXp); setRrDelta(defRr); setAdjustReason(a.label); }}
                                className="text-[10px] px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-600 text-gray-300 hover:bg-indigo-500/20 hover:border-indigo-500/40 hover:text-indigo-300 transition-colors">
                                {a.icon} {a.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        <div className="md:col-span-3">
                          <label className="text-[11px] text-gray-400 block mb-1">XP (+ أو -)</label>
                          <input type="number" value={xpDelta} onChange={e => setXpDelta(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0"
                            className="w-full px-3 py-2.5 rounded-xl bg-gray-950 border border-gray-700 text-amber-400 font-bold text-center focus:outline-none focus:border-amber-500" />
                        </div>
                        <div className="md:col-span-3">
                          <label className="text-[11px] text-gray-400 block mb-1">RR (+ أو -)</label>
                          <input type="number" value={rrDelta} onChange={e => setRrDelta(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0"
                            className="w-full px-3 py-2.5 rounded-xl bg-gray-950 border border-gray-700 text-blue-400 font-bold text-center focus:outline-none focus:border-blue-500" />
                        </div>
                        <div className="md:col-span-4">
                          <label className="text-[11px] text-gray-400 block mb-1">سبب التعديل</label>
                          <input type="text" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="مثال: تعويض ديل لم يُسجل..."
                            className="w-full px-3 py-2.5 rounded-xl bg-gray-950 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500" />
                        </div>
                        <div className="md:col-span-2">
                          <button onClick={submitAdjust} disabled={adjusting || (!xpDelta && !rrDelta)}
                            className="w-full h-[42px] bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 transition-colors disabled:opacity-50 text-sm">
                            {adjusting ? '...' : 'تطبيق'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-10">
                <span className="text-6xl mb-4 opacity-50">👥</span>
                <p>اختر لاعباً من القائمة لعرض سجل مبارياته وتعديل نقاطه</p>
              </div>
            )}
          </div>

        </motion.div>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl text-sm font-bold shadow-2xl flex items-center gap-3 ${toast.type === 'success' ? 'bg-emerald-500 text-gray-950' : 'bg-rose-500 text-white'}`}>
            <span className="text-xl">{toast.type === 'success' ? '✅' : '⚠️'}</span>
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
