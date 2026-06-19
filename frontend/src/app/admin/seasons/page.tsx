'use client';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `API error ${res.status}`), { data });
  return data;
}

const TIER_AR: Record<string, string> = { INFORMANT: 'مُخبر', SOLDIER: 'جندي', CAPO: 'كابو', UNDERBOSS: 'أندربوس', GODFATHER: 'الأب الروحي' };

interface Season {
  id: number; name: string; seasonNumber: number;
  type: 'REGULAR' | 'TOURNAMENT'; locationId: number | null; status: 'ACTIVE' | 'ENDED';
  startedAt: string; endedAt: string | null; matchCount: number;
}

export default function SeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // نماذج
  const [showRegular, setShowRegular] = useState(false);
  const [regularName, setRegularName] = useState('');
  const [activeGames, setActiveGames] = useState<any[] | null>(null);
  const [showTournament, setShowTournament] = useState(false);
  const [tName, setTName] = useState('');
  const [tLocation, setTLocation] = useState('');

  // لوحة ترتيب موسم
  const [board, setBoard] = useState<{ season: Season; rows: any[] } | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [s, l] = await Promise.all([apiFetch('/api/seasons'), apiFetch('/api/locations').catch(() => ({ locations: [] }))]);
      setSeasons(s.seasons || []);
      setLocations(Array.isArray(l) ? l : (l.locations || l || []));
      setError('');
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const activeRegular = seasons.find(s => s.type === 'REGULAR' && s.status === 'ACTIVE');
  const activeTournaments = seasons.filter(s => s.type === 'TOURNAMENT' && s.status === 'ACTIVE');
  const locName = (id: number | null) => locations.find((x: any) => x.id === id)?.name || (id ? `#${id}` : '—');

  async function startRegular() {
    setBusy(true); setError(''); setActiveGames(null);
    try {
      await apiFetch('/api/seasons/regular/start', { method: 'POST', body: JSON.stringify({ name: regularName.trim() }) });
      setShowRegular(false); setRegularName(''); await load();
    } catch (e: any) {
      if (e.data?.activeRooms) setActiveGames(e.data.activeRooms);
      setError(e.message);
    } finally { setBusy(false); }
  }

  async function startTournament() {
    setBusy(true); setError('');
    try {
      await apiFetch('/api/seasons/tournament/start', { method: 'POST', body: JSON.stringify({ name: tName.trim(), locationId: Number(tLocation) }) });
      setShowTournament(false); setTName(''); setTLocation(''); await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function endSeason(id: number, name: string) {
    if (!confirm(`إنهاء الموسم "${name}"؟ ستُحفظ إحصاءاته ويمكن مراجعتها لاحقاً.`)) return;
    setBusy(true); setError('');
    try { await apiFetch(`/api/seasons/${id}/end`, { method: 'POST' }); await load(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function rename(id: number, current: string) {
    const name = (prompt('اسم الموسم الجديد:', current) || '').trim();
    if (!name || name === current) return;
    setBusy(true); setError('');
    try { await apiFetch(`/api/seasons/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }); await load(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function openBoard(s: Season) {
    setBusy(true);
    try { const r = await apiFetch(`/api/seasons/${s.id}/leaderboard?limit=50`); setBoard({ season: s, rows: r.leaderboard || [] }); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a0a] text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Amiri, serif' }}>🏆 إدارة المواسم</h1>
          <button onClick={load} className="text-xs text-[#C5A059] border border-[#C5A059]/40 rounded px-3 py-1.5 hover:bg-[#C5A059]/10">↻ تحديث</button>
        </div>

        {error && !activeGames && <div className="mb-4 p-3 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>}

        {/* الموسم العادي الحالي */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="p-5 rounded-2xl bg-gradient-to-b from-[#1a1a2e] to-[#0c0c14] border border-[#C5A059]/30">
            <p className="text-[10px] font-mono tracking-widest text-[#808080] uppercase mb-1">الموسم العادي النشط</p>
            {activeRegular ? (
              <>
                <p className="text-xl font-black text-[#C5A059]">{activeRegular.name}</p>
                <p className="text-xs text-[#888] mt-1">موسم #{activeRegular.seasonNumber} · {activeRegular.matchCount} مباراة · منذ {new Date(activeRegular.startedAt).toLocaleDateString('ar')}</p>
              </>
            ) : <p className="text-[#888] text-sm">لا يوجد موسم عادي نشط</p>}
            <button onClick={() => { setShowRegular(true); setActiveGames(null); setError(''); }} disabled={busy}
              className="mt-4 w-full py-2.5 rounded-xl bg-[#C5A059] text-black font-bold text-sm hover:brightness-110 disabled:opacity-50">
              ▶ بدء موسم عادي جديد (تصفير الترتيب)
            </button>
          </div>

          <div className="p-5 rounded-2xl bg-gradient-to-b from-[#2e1a1a] to-[#140c0c] border border-[#8A0303]/30">
            <p className="text-[10px] font-mono tracking-widest text-[#808080] uppercase mb-1">بطولات نشطة (مرتبطة بموقع)</p>
            {activeTournaments.length ? activeTournaments.map(t => (
              <p key={t.id} className="text-sm text-[#e08]"><span className="font-bold">{t.name}</span> — {locName(t.locationId)} ({t.matchCount} مباراة)</p>
            )) : <p className="text-[#888] text-sm">لا توجد بطولات نشطة</p>}
            <button onClick={() => { setShowTournament(true); setError(''); }} disabled={busy}
              className="mt-4 w-full py-2.5 rounded-xl border border-[#8A0303] text-[#ff6b6b] font-bold text-sm hover:bg-[#8A0303]/15 disabled:opacity-50">
              ➕ بدء موسم بطولة لموقع
            </button>
          </div>
        </div>

        {/* جدول كل المواسم */}
        <div className="rounded-2xl border border-[#2a2a2a] overflow-hidden">
          <div className="px-4 py-3 bg-[#111] text-[11px] font-mono tracking-widest text-[#808080] uppercase">كل المواسم</div>
          {loading ? <div className="p-8 text-center text-[#555]">جارٍ التحميل…</div> : (
            <table className="w-full text-sm">
              <thead><tr className="text-[#666] text-[11px] border-b border-[#2a2a2a]">
                <th className="text-right p-3">#</th><th className="text-right p-3">الاسم</th><th className="text-right p-3">النوع</th>
                <th className="text-right p-3">الموقع</th><th className="text-right p-3">الحالة</th><th className="text-right p-3">مباريات</th><th className="text-right p-3"></th>
              </tr></thead>
              <tbody>
                {seasons.map(s => (
                  <tr key={s.id} className="border-b border-[#1a1a1a] hover:bg-[#111]">
                    <td className="p-3 text-[#888]">{s.seasonNumber}</td>
                    <td className="p-3 font-bold">{s.name}</td>
                    <td className="p-3">{s.type === 'REGULAR' ? '🔵 عادي' : '🏆 بطولة'}</td>
                    <td className="p-3 text-[#888]">{s.type === 'TOURNAMENT' ? locName(s.locationId) : '—'}</td>
                    <td className="p-3">{s.status === 'ACTIVE' ? <span className="text-green-400">● نشط</span> : <span className="text-[#666]">منتهٍ</span>}</td>
                    <td className="p-3 text-[#888]">{s.matchCount}</td>
                    <td className="p-3 flex gap-2 justify-end">
                      <button onClick={() => openBoard(s)} className="text-[11px] text-[#C5A059] border border-[#C5A059]/30 rounded px-2 py-1 hover:bg-[#C5A059]/10">الترتيب</button>
                      <button onClick={() => rename(s.id, s.name)} className="text-[11px] text-[#888] border border-[#333] rounded px-2 py-1 hover:bg-white/5">✏️ تسمية</button>
                      {s.status === 'ACTIVE' && <button onClick={() => endSeason(s.id, s.name)} className="text-[11px] text-[#ff6b6b] border border-[#8A0303]/30 rounded px-2 py-1 hover:bg-[#8A0303]/10">إنهاء</button>}
                    </td>
                  </tr>
                ))}
                {!seasons.length && <tr><td colSpan={7} className="p-8 text-center text-[#555]">لا مواسم</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* نموذج: موسم عادي جديد */}
      <AnimatePresence>
        {showRegular && (
          <Modal onClose={() => setShowRegular(false)}>
            <h2 className="text-lg font-black mb-2 text-[#C5A059]">بدء موسم عادي جديد</h2>
            <p className="text-xs text-[#ff6b6b] mb-3 leading-relaxed">⚠️ سيُصفّر ترتيب/نقاط جميع اللاعبين (تبقى محفوظة في الموسم المنتهي). عدد المباريات «مدى الحياة» لا يُصفَّر. لا يمكن بدء موسم وهناك مباريات جارية.</p>
            <input value={regularName} onChange={e => setRegularName(e.target.value)} placeholder="اسم الموسم (مثل: الموسم الثاني)"
              className="w-full p-3 rounded-xl bg-[#0a0a0a] border border-[#2a2a2a] text-sm mb-3 focus:border-[#C5A059] outline-none" />
            {activeGames && (
              <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                <p className="font-bold mb-1">يجب إنهاء هذه الفعاليات الجارية أولاً:</p>
                {activeGames.map((g, i) => <p key={i}>• {g.gameName || g.roomCode} ({g.phase})</p>)}
                <p className="mt-2 text-[#aaa]">أنهِها من واجهة القائد بزر «انتهت الفعالية» ثم أعد المحاولة.</p>
              </div>
            )}
            <button onClick={startRegular} disabled={busy || !regularName.trim()}
              className="w-full py-2.5 rounded-xl bg-[#C5A059] text-black font-bold text-sm disabled:opacity-50">{busy ? '…' : 'تأكيد وبدء الموسم'}</button>
          </Modal>
        )}
        {showTournament && (
          <Modal onClose={() => setShowTournament(false)}>
            <h2 className="text-lg font-black mb-2 text-[#ff6b6b]">بدء موسم بطولة</h2>
            <p className="text-xs text-[#888] mb-3 leading-relaxed">بطولة مرتبطة بموقع محدّد — كل مبارياتها في هذا الموقع تُحتسب لها فقط، وإحصاءاتها مستقلة تماماً عن الترتيب العادي.</p>
            <input value={tName} onChange={e => setTName(e.target.value)} placeholder="اسم البطولة"
              className="w-full p-3 rounded-xl bg-[#0a0a0a] border border-[#2a2a2a] text-sm mb-3 focus:border-[#8A0303] outline-none" />
            <select value={tLocation} onChange={e => setTLocation(e.target.value)}
              className="w-full p-3 rounded-xl bg-[#0a0a0a] border border-[#2a2a2a] text-sm mb-3 focus:border-[#8A0303] outline-none">
              <option value="">اختر الموقع…</option>
              {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button onClick={startTournament} disabled={busy || !tName.trim() || !tLocation}
              className="w-full py-2.5 rounded-xl border border-[#8A0303] text-[#ff6b6b] font-bold text-sm disabled:opacity-50">{busy ? '…' : 'بدء البطولة'}</button>
          </Modal>
        )}
        {board && (
          <Modal onClose={() => setBoard(null)} wide>
            <h2 className="text-lg font-black mb-3 text-[#C5A059]">ترتيب: {board.season.name}</h2>
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-[#666] text-[11px] border-b border-[#2a2a2a]">
                  <th className="text-right p-2">#</th><th className="text-right p-2">اللاعب</th><th className="text-right p-2">الرتبة</th><th className="text-right p-2">RR</th><th className="text-right p-2">المستوى</th><th className="text-right p-2">مباريات</th>
                </tr></thead>
                <tbody>
                  {board.rows.map((r, i) => (
                    <tr key={r.playerId} className="border-b border-[#1a1a1a]">
                      <td className="p-2 text-[#888]">{i + 1}</td>
                      <td className="p-2 font-bold">{r.name}</td>
                      <td className="p-2 text-[#C5A059]">{TIER_AR[r.rankTier] || r.rankTier}</td>
                      <td className="p-2">{r.rankRR}</td>
                      <td className="p-2 text-[#888]">{r.level}</td>
                      <td className="p-2 text-[#888]">{r.totalMatches}</td>
                    </tr>
                  ))}
                  {!board.rows.length && <tr><td colSpan={6} className="p-6 text-center text-[#555]">لا لاعبين بعد</td></tr>}
                </tbody>
              </table>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        className={`bg-[#0f0f14] border border-[#2a2a2a] rounded-2xl p-5 w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`} onClick={e => e.stopPropagation()} dir="rtl">
        {children}
      </motion.div>
    </motion.div>
  );
}
