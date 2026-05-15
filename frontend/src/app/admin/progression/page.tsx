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

const ACTIONS_XP = [
  { key: 'participation', label: 'مشاركة في مباراة', icon: '🎮', desc: 'كل لاعب يحصل عليها بمجرد اللعب' },
  { key: 'teamWin', label: 'فوز الفريق', icon: '🏆', desc: 'عندما يفوز فريقك' },
  { key: 'survivalPerRound', label: 'نجاة لكل جولة', icon: '💪', desc: 'لكل جولة عاشها اللاعب' },
  { key: 'abilityCorrect', label: 'قدرة صحيحة', icon: '✅', desc: 'شريف/قناص/طبيب أصاب' },
  { key: 'abilityIncorrect', label: 'قدرة خاطئة', icon: '❌', desc: 'شريف/قناص/طبيب أخطأ (عقوبة)' },
  { key: 'citizenDealOnMafia', label: 'ديل مواطن ناجح', icon: '🤝', desc: 'مواطن عمل ديل وأخرج مافيا' },
  { key: 'failedDeal', label: 'ديل فاشل', icon: '💔', desc: 'مواطن عمل ديل وأخرج مواطن' },
  { key: 'mafiaDealOnMafia', label: 'ديل مافيا على مافيا', icon: '🔴', desc: 'مافيا عمل ديل وأخرج زميله (عقوبة)' },
  { key: 'teamEliminationBonus', label: 'مكافأة إقصاء خصم', icon: '⚔️', desc: 'لكل عضو أُقصي من الفريق المعادي' },
];
const ACTIONS_RR = [
  { key: 'teamWin', label: 'فوز الفريق', icon: '🏆' },
  { key: 'teamLoss', label: 'خسارة الفريق', icon: '💀' },
  { key: 'citizenDealOnMafia', label: 'ديل مواطن ناجح', icon: '🤝' },
  { key: 'failedDeal', label: 'ديل فاشل', icon: '💔' },
  { key: 'mafiaDealOnMafia', label: 'ديل مافيا على مافيا', icon: '🔴' },
  { key: 'survivedToEnd', label: 'نجاة حتى النهاية', icon: '💪' },
  { key: 'abilityCorrect', label: 'قدرة صحيحة', icon: '✅' },
  { key: 'abilityIncorrect', label: 'قدرة خاطئة', icon: '❌' },
];
const RANK_TIERS = [
  { key: 'INFORMANT', label: 'المُخبر', icon: '⭐' },
  { key: 'SOLDIER', label: 'الجندي', icon: '⭐⭐' },
  { key: 'CAPO', label: 'الكابو', icon: '🌟' },
  { key: 'UNDERBOSS', label: 'الأندربوس', icon: '🌟🌟' },
  { key: 'GODFATHER', label: 'الأب الروحي', icon: '👑' },
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
  const [xpDelta, setXpDelta] = useState(0);
  const [rrDelta, setRrDelta] = useState(0);
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

  function updateField(section: string, key: string, value: number) {
    setConfig((prev: any) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
  }
  function updateRank(tier: string, value: number) {
    setConfig((prev: any) => ({ ...prev, ranks: { ...prev.ranks, [tier]: { rrRequired: value } } }));
  }

  // Adjust tab
  async function loadPlayers() {
    try { const d = await apiFetch('/api/player/all'); setPlayers(d.players || []); } catch {}
  }
  async function loadPlayerMatches(playerId: number) {
    try {
      const d = await apiFetch(`/api/progression-settings/player/${playerId}/matches`);
      setPlayerMatches(d.matches || []);
      setSelPlayer(d.player);
    } catch (err: any) { showToast(err.message, 'error'); }
  }
  async function submitAdjust() {
    if (!selPlayer || !selMatch) return;
    setAdjusting(true);
    try {
      await apiFetch(`/api/progression-settings/player/${selPlayer.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ matchPlayerId: selMatch.mpId, xpDelta, rrDelta, reason: adjustReason }),
      });
      showToast(`تم تعديل نقاط ${selPlayer.name}`, 'success');
      loadPlayerMatches(selPlayer.id);
      setXpDelta(0); setRrDelta(0); setAdjustReason('');
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setAdjusting(false); }
  }

  useEffect(() => { if (tab === 'adjust') loadPlayers(); }, [tab]);

  if (loading || !config) return <div className="flex items-center justify-center h-96"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>;

  const filteredPlayers = players.filter(p => !searchQ.trim() || p.name?.toLowerCase().includes(searchQ.toLowerCase()) || p.phone?.includes(searchQ));

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">🏆 إعدادات نظام التقدم</h1>
        <p className="text-gray-400 text-sm mt-1">تحكم بقيم النقاط والرتب لكل إجراء في اللعبة</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: 'xp', label: '⭐ نقاط XP', color: 'amber' },
          { key: 'rr', label: '🎖️ نقاط RR', color: 'blue' },
          { key: 'ranks', label: '👑 الرتب', color: 'purple' },
          { key: 'adjust', label: '🔧 تعديل يدوي', color: 'rose' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === t.key ? `bg-${t.color}-500/15 text-${t.color}-400 border border-${t.color}-500/30` : 'bg-gray-800/50 text-gray-500 border border-gray-700/30 hover:text-white'}`}
          >{t.label}</button>
        ))}
      </div>

      {/* XP Tab */}
      {tab === 'xp' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-6 space-y-4">
          <h3 className="text-lg font-bold text-white">⭐ نقاط الخبرة (XP) لكل إجراء</h3>
          <p className="text-xs text-gray-500">هذه النقاط تؤثر على مستوى اللاعب (Level). لا يمكن أن يكون إجمالي XP المباراة بالسالب.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ACTIONS_XP.map(a => (
              <div key={a.key} className="flex items-center gap-3 p-3 bg-gray-900/50 rounded-xl border border-gray-700/20">
                <span className="text-lg shrink-0">{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{a.label}</p>
                  <p className="text-[10px] text-gray-500 truncate">{a.desc}</p>
                </div>
                <input type="number" value={config.xp?.[a.key] ?? 0} onChange={e => updateField('xp', a.key, Number(e.target.value))}
                  className={`w-20 px-2 py-1.5 rounded-lg text-center text-sm font-bold border focus:outline-none focus:ring-2 ${(config.xp?.[a.key] ?? 0) >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 focus:ring-emerald-500/30' : 'bg-rose-500/10 border-rose-500/20 text-rose-400 focus:ring-rose-500/30'}`}
                />
              </div>
            ))}
          </div>
          {/* Level config */}
          <div className="mt-4 p-4 bg-gray-900/40 rounded-xl border border-gray-700/20 space-y-3">
            <h4 className="text-sm font-bold text-white">📈 معادلة المستوى: XP = baseXP × Level^exponent</h4>
            <div className="flex gap-4">
              <div>
                <label className="text-xs text-gray-500">الأساس (baseXP)</label>
                <input type="number" value={config.level?.baseXP ?? 500} onChange={e => setConfig((p: any) => ({ ...p, level: { ...p.level, baseXP: Number(e.target.value) } }))}
                  className="w-24 px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-600/50 text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
              </div>
              <div>
                <label className="text-xs text-gray-500">الأس (exponent)</label>
                <input type="number" step="0.1" value={config.level?.exponent ?? 1.2} onChange={e => setConfig((p: any) => ({ ...p, level: { ...p.level, exponent: Number(e.target.value) } }))}
                  className="w-24 px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-600/50 text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* RR Tab */}
      {tab === 'rr' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-6 space-y-4">
          <h3 className="text-lg font-bold text-white">🎖️ نقاط الرانك (RR) لكل إجراء</h3>
          <p className="text-xs text-gray-500">هذه النقاط تؤثر على الرتبة. يمكن أن تكون سالبة (عقوبة).</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ACTIONS_RR.map(a => (
              <div key={a.key} className="flex items-center gap-3 p-3 bg-gray-900/50 rounded-xl border border-gray-700/20">
                <span className="text-lg shrink-0">{a.icon}</span>
                <div className="flex-1"><p className="text-sm font-medium text-white">{a.label}</p></div>
                <input type="number" value={config.rr?.[a.key] ?? 0} onChange={e => updateField('rr', a.key, Number(e.target.value))}
                  className={`w-20 px-2 py-1.5 rounded-lg text-center text-sm font-bold border focus:outline-none focus:ring-2 ${(config.rr?.[a.key] ?? 0) >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 focus:ring-emerald-500/30' : 'bg-rose-500/10 border-rose-500/20 text-rose-400 focus:ring-rose-500/30'}`}
                />
              </div>
            ))}
          </div>
          <div className="mt-4 p-4 bg-gray-900/40 rounded-xl border border-gray-700/20">
            <h4 className="text-sm font-bold text-white mb-2">⬇️ نسبة الاسترداد عند التنزيل</h4>
            <div className="flex items-center gap-3">
              <input type="number" min="0" max="100" value={config.demotionReturnPercent ?? 80} onChange={e => setConfig((p: any) => ({ ...p, demotionReturnPercent: Number(e.target.value) }))}
                className="w-20 px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-600/50 text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
              <span className="text-gray-400 text-sm">% من RR الرتبة الأدنى يُعاد عند التنزيل</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Ranks Tab */}
      {tab === 'ranks' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-6 space-y-4">
          <h3 className="text-lg font-bold text-white">👑 RR المطلوب للترقية من كل رتبة</h3>
          <div className="space-y-3">
            {RANK_TIERS.map((r, i) => (
              <div key={r.key} className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-xl border border-gray-700/20">
                <span className="text-xl shrink-0">{r.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">{r.label}</p>
                  <p className="text-[10px] text-gray-500">{i < RANK_TIERS.length - 1 ? `→ ${RANK_TIERS[i + 1].label}` : 'أعلى رتبة (سقف)'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" value={config.ranks?.[r.key]?.rrRequired ?? 100} onChange={e => updateRank(r.key, Number(e.target.value))}
                    className="w-24 px-2 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/30" />
                  <span className="text-xs text-gray-500">RR</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Adjust Tab */}
      {tab === 'adjust' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">🔧 تعديل نقاط لاعب يدوياً</h3>
            <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="🔍 بحث عن لاعب بالاسم أو الهاتف..."
              className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-500" />
            <div className="max-h-48 overflow-y-auto space-y-1.5">
              {filteredPlayers.slice(0, 20).map((p: any) => (
                <button key={p.id} onClick={() => { loadPlayerMatches(p.id); setSelMatch(null); }}
                  className={`w-full text-right p-2.5 rounded-xl text-sm transition flex items-center gap-3 ${selPlayer?.id === p.id ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-gray-900/30 text-gray-300 hover:bg-gray-800/50 border border-transparent'}`}>
                  <span className="font-bold">{p.name}</span>
                  <span className="text-[10px] text-gray-500 font-mono" dir="ltr">{p.phone}</span>
                  <span className="mr-auto text-[10px] text-gray-600">Lv.{p.level || 1} • {p.rankTier || 'INFORMANT'}</span>
                </button>
              ))}
            </div>
          </div>

          {selPlayer && (
            <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-6 space-y-4">
              <h4 className="text-sm font-bold text-white">📜 مباريات {selPlayer.name} — XP: {selPlayer.xp || 0} | RR: {selPlayer.rankRR || 0}</h4>
              <div className="max-h-60 overflow-y-auto space-y-1.5">
                {playerMatches.length === 0 && <p className="text-gray-600 text-sm text-center py-4">لا توجد مباريات</p>}
                {playerMatches.map((m: any) => {
                  const isMafia = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'].includes(m.role || '');
                  const won = (isMafia && m.matchWinner === 'MAFIA') || (!isMafia && m.matchWinner === 'CITIZEN');
                  return (
                    <button key={m.mpId} onClick={() => setSelMatch(m)}
                      className={`w-full text-right p-3 rounded-xl text-xs transition flex items-center gap-3 ${selMatch?.mpId === m.mpId ? 'bg-blue-500/15 border border-blue-500/30' : 'bg-gray-900/30 border border-transparent hover:bg-gray-800/50'}`}>
                      <span className={won ? 'text-emerald-400' : 'text-rose-400'}>{won ? '🏆' : '💀'}</span>
                      <span className="text-white font-medium">{m.role}</span>
                      <span className="text-gray-500">#{m.matchRoomCode}</span>
                      <span className="text-gray-600">{m.matchDate ? new Date(m.matchDate).toLocaleDateString('ar-JO', { month: 'short', day: 'numeric' }) : ''}</span>
                      <span className="mr-auto flex gap-2">
                        <span className="text-amber-400">XP: {m.xpEarned ?? 0}</span>
                        <span className="text-blue-400">RR: {m.rrChange ?? 0}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selMatch && (
            <div className="bg-gray-800/50 border border-rose-500/20 rounded-2xl p-6 space-y-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">🔧 تعديل النقاط — {selPlayer.name} في مباراة #{selMatch.matchRoomCode}</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">تعديل XP (+ أو −)</label>
                  <input type="number" value={xpDelta} onChange={e => setXpDelta(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-gray-900/60 border border-gray-600/50 text-amber-400 font-bold text-center focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">تعديل RR (+ أو −)</label>
                  <input type="number" value={rrDelta} onChange={e => setRrDelta(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-gray-900/60 border border-gray-600/50 text-blue-400 font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">السبب</label>
                  <input type="text" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="ديل لم يُسجّل..."
                    className="w-full px-3 py-2 rounded-lg bg-gray-900/60 border border-gray-600/50 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-500/30 placeholder-gray-600" />
                </div>
              </div>
              {/* أزرار مختصرة */}
              <div className="flex flex-wrap gap-2">
                {config && ACTIONS_XP.filter(a => a.key !== 'teamEliminationBonus').map(a => (
                  <button key={a.key} onClick={() => { setXpDelta(config.xp?.[a.key] || 0); setAdjustReason(a.label); }}
                    className="text-[10px] px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition">
                    {a.icon} {a.label} ({config.xp?.[a.key] > 0 ? '+' : ''}{config.xp?.[a.key]})
                  </button>
                ))}
              </div>
              <button onClick={submitAdjust} disabled={adjusting || (xpDelta === 0 && rrDelta === 0)}
                className="w-full py-3 bg-gradient-to-r from-rose-500 to-amber-600 text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50 text-sm">
                {adjusting ? '⏳ جاري التعديل...' : `✅ تطبيق (XP: ${xpDelta >= 0 ? '+' : ''}${xpDelta}, RR: ${rrDelta >= 0 ? '+' : ''}${rrDelta})`}
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* Save Button (for config tabs) */}
      {tab !== 'adjust' && (
        <button onClick={saveConfig} disabled={saving}
          className="w-full py-3 bg-gradient-to-r from-amber-500 to-rose-600 text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50">
          {saving ? '⏳ جاري الحفظ...' : '💾 حفظ الإعدادات'}
        </button>
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-xl text-sm font-bold shadow-xl ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
