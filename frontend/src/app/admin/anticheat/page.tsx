'use client';

// ══════════════════════════════════════════════════════
// 🕵️ لوحة مكافحة الغش — الكشف الإحصائيّ (Admin)
// تُظهر الاشتباه بأدلّته؛ القرار النهائيّ بشريّ. طابور مراجعة: مراقبة/بريء/موسوم.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...opts?.headers },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `API ${r.status}`);
  return r.json();
}

type Band = 'green' | 'amber' | 'red';
interface PlayerRisk {
  playerId: number; name: string; matches: number; survivalRate: number;
  citizenDeals: number; citizenDealSuccess: number; dealZ: number | null;
  behavioralWeight: number; behavioralCount: number; pairZMax: number | null;
  band: Band; evidence: string[]; review: string | null; note: string;
}
interface Pair {
  aId: number; aName: string; bId: number; bName: string;
  coMatches: number; bSurvivalWhenAMafia: number; bBaselineSurvival: number; lift: number; z: number; band: Band;
}
interface Departure {
  playerId: number | null; name: string; physicalId: number | null;
  roomId: string | null; durationMs: number; secretOpen: boolean; at: string;
}
interface FollowOut { aId: number; aName: string; bId: number; bName: string; count: number; }
interface Overview {
  generatedAt: string; totalMatches: number; analyzedPlayers: number;
  populationDealBaseline: number; players: PlayerRisk[]; pairs: Pair[];
  recentDepartures: Departure[]; followOutPairs: FollowOut[];
}

const BAND_STYLE: Record<Band, { bg: string; border: string; color: string; label: string }> = {
  red: { bg: 'rgba(224,73,43,0.08)', border: 'rgba(224,73,43,0.4)', color: '#F08163', label: 'أحمر' },
  amber: { bg: 'rgba(217,138,43,0.07)', border: 'rgba(217,138,43,0.35)', color: '#E8B84B', label: 'أصفر' },
  green: { bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.07)', color: '#8B9A92', label: 'أخضر' },
};
const REVIEW_LABEL: Record<string, string> = { watching: '👁️ مراقبة', cleared: '✅ بريء', flagged: '🚩 موسوم' };

export default function AnticheatPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [sinceDays, setSinceDays] = useState<number | null>(null);
  const [showGreen, setShowGreen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true); setErr('');
    apiFetch(`/api/anticheat/overview${sinceDays ? `?sinceDays=${sinceDays}` : ''}`)
      .then(d => setData(d.overview))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [sinceDays]);
  useEffect(() => { load(); }, [load]);

  const setReview = async (playerId: number, status: string) => {
    setBusyId(playerId);
    try {
      await apiFetch('/api/anticheat/review', { method: 'POST', body: JSON.stringify({ playerId, status }) });
      setData(d => d && ({ ...d, players: d.players.map(p => p.playerId === playerId ? { ...p, review: status === 'none' ? null : status } : p) }));
    } catch (e: any) { alert(e.message); }
    finally { setBusyId(null); }
  };

  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
  const players = (data?.players || []).filter(p => showGreen || p.band !== 'green');
  const counts = (data?.players || []).reduce((a, p) => (a[p.band]++, a), { red: 0, amber: 0, green: 0 } as Record<Band, number>);

  return (
    <div className="max-w-4xl mx-auto space-y-4" dir="rtl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">🕵️ مكافحة الغش — الكشف الإحصائيّ</h1>
        <p className="text-[12px] text-gray-400 mt-1 leading-relaxed">
          يُظهر الاشتباه بأدلّته من أنماط اللعب عبر المباريات — <b>لا يُدين</b>. الإيجابيّة الكاذبة أسوأ من تفويت غشّاش،
          فالقرار النهائيّ لك. الكواشف: تواطؤ زوجيّ (نجاة المواطن الشاذّة حين يكون شريكه مافيا) · دقّة اتفاقيّاتٍ مستحيلة · إشاراتٌ سلوكيّة.
        </p>
      </div>

      {/* شريط الفترة + الملخّص */}
      <div className="flex items-center gap-2 flex-wrap">
        {[[null, 'كل الأوقات'], [30, '٣٠ يوماً'], [7, '٧ أيام']].map(([v, l]) => (
          <button key={String(v)} onClick={() => setSinceDays(v as number | null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${sinceDays === v ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-white/5 text-gray-400 border-transparent'}`}>
            {l as string}
          </button>
        ))}
        <button onClick={load} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/10 mr-auto">↻ تحديث</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-gray-700 border-t-amber-500 rounded-full animate-spin" /></div>
      ) : err ? (
        <div className="text-center py-12 text-rose-400 text-sm">{err}</div>
      ) : data && (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <Kpi label="مباريات" value={String(data.totalMatches)} />
            <Kpi label="لاعبون" value={String(data.analyzedPlayers)} />
            <Kpi label="أساس الاتفاقيّات" value={pct(data.populationDealBaseline)} />
            <Kpi label="أحمر" value={String(counts.red)} tone="red" />
            <Kpi label="أصفر" value={String(counts.amber)} tone="amber" />
          </div>

          {/* درجات المخاطر */}
          <div className="flex items-center justify-between mt-4">
            <h2 className="text-sm font-bold text-gray-300">درجات المخاطر ({players.length})</h2>
            <label className="text-[11px] text-gray-500 flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showGreen} onChange={e => setShowGreen(e.target.checked)} className="accent-emerald-500" />
              إظهار الأخضر
            </label>
          </div>
          <div className="space-y-2">
            {players.map(p => {
              const st = BAND_STYLE[p.band];
              return (
                <div key={p.playerId} className="rounded-xl p-3.5" style={{ background: st.bg, border: `1px solid ${st.border}` }}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm truncate">{p.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color }}>{st.label}</span>
                        {p.review && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300">{REVIEW_LABEL[p.review]}</span>}
                        <span className="text-[10px] text-gray-500">{p.matches} مباراة · نجاة {pct(p.survivalRate)}</span>
                      </div>
                      {p.evidence.length > 0 ? (
                        <ul className="mt-1.5 space-y-1">
                          {p.evidence.map((e, i) => <li key={i} className="text-[11.5px] text-gray-300 leading-snug">• {e}</li>)}
                        </ul>
                      ) : <p className="text-[11px] text-gray-500 mt-1">لا أدلّة تتجاوز العتبة</p>}
                    </div>
                  </div>
                  {/* أزرار المراجعة */}
                  <div className="flex gap-1.5 mt-2.5 pt-2.5 border-t border-white/5">
                    {(['watching', 'flagged', 'cleared'] as const).map(s => (
                      <button key={s} disabled={busyId === p.playerId}
                        onClick={() => setReview(p.playerId, p.review === s ? 'none' : s)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50 ${p.review === s ? 'bg-white/10 border-white/20 text-white' : 'bg-white/[0.03] border-white/8 text-gray-400'}`}>
                        {REVIEW_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {players.length === 0 && <div className="text-center py-10 text-gray-500 text-sm">لا اشتباهات فوق العتبة {showGreen ? '' : '— جرّب «إظهار الأخضر»'}</div>}
          </div>

          {/* أزواج التواطؤ */}
          {data.pairs.length > 0 && (
            <>
              <h2 className="text-sm font-bold text-gray-300 mt-6">أقوى أزواج التواطؤ ({data.pairs.length})</h2>
              <p className="text-[11px] text-gray-500 -mt-1">«المافيا لا تقتل مُخبِرها»: نجاة المواطن حين يكون شريكه مافيا مقابل خطّ أساسه.</p>
              <div className="overflow-x-auto rounded-xl border border-white/8">
                <table className="w-full text-[12px]" style={{ minWidth: 560 }}>
                  <thead><tr className="text-gray-500 text-[10.5px]">
                    <th className="text-right p-2.5">مافيا (المسرِّب؟)</th>
                    <th className="text-right p-2.5">مواطن (المستقبِل؟)</th>
                    <th className="p-2.5">نجاته</th>
                    <th className="p-2.5">أساسه</th>
                    <th className="p-2.5">مباريات</th>
                    <th className="p-2.5">z</th>
                  </tr></thead>
                  <tbody>
                    {data.pairs.map((pr, i) => (
                      <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <td className="p-2.5 font-bold" style={{ color: BAND_STYLE[pr.band].color }}>{pr.aName}</td>
                        <td className="p-2.5">{pr.bName}</td>
                        <td className="p-2.5 text-center tabular-nums text-emerald-400 font-bold">{pct(pr.bSurvivalWhenAMafia)}</td>
                        <td className="p-2.5 text-center tabular-nums text-gray-500">{pct(pr.bBaselineSurvival)}</td>
                        <td className="p-2.5 text-center tabular-nums text-gray-400">{pr.coMatches}</td>
                        <td className="p-2.5 text-center tabular-nums font-bold" style={{ color: BAND_STYLE[pr.band].color }}>{pr.z.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* 🔗 من خرج بعد من — توقيع التسريب اللحظيّ */}
          <h2 className="text-sm font-bold text-gray-300 mt-6">🔗 من خرج بعد من</h2>
          <p className="text-[11px] text-gray-500 -mt-1">خروجُ لاعبٍ من التطبيق خلال ٩٠ ثانية بعد خروج آخر في نفس الغرفة — «سرّب ثمّ تلقّى». يتراكم مع اللعب.</p>
          {data.followOutPairs.length > 0 ? (
            <div className="space-y-1.5">
              {data.followOutPairs.map((f, i) => (
                <div key={i} className="rounded-lg px-3 py-2 text-[12px] flex items-center gap-2" style={{ background: 'rgba(217,138,43,0.06)', border: '1px solid rgba(217,138,43,0.25)' }}>
                  <span className="font-bold text-amber-300">{f.aName}</span>
                  <span className="text-gray-500">خرج ثمّ تبعه</span>
                  <span className="font-bold text-white">{f.bName}</span>
                  <span className="mr-auto text-[11px] text-amber-400 font-bold tabular-nums">×{f.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg px-3 py-3 text-[11.5px] text-gray-500" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              لا أنماط خروجٍ متتابعة بعد — تتراكم كلّما لعب اللاعبون بالتطبيق المُحدَّث.
            </div>
          )}

          {/* آخر الخروجات */}
          <h2 className="text-sm font-bold text-gray-300 mt-6">آخر الخروجات من التطبيق ({data.recentDepartures.length})</h2>
          {data.recentDepartures.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-white/8">
              <table className="w-full text-[12px]" style={{ minWidth: 480 }}>
                <thead><tr className="text-gray-500 text-[10.5px]">
                  <th className="text-right p-2.5">اللاعب</th>
                  <th className="p-2.5">مدّة الغياب</th>
                  <th className="p-2.5">السرّ مفتوح؟</th>
                  <th className="p-2.5">الوقت</th>
                </tr></thead>
                <tbody>
                  {data.recentDepartures.map((d, i) => {
                    const secs = Math.round(d.durationMs / 1000);
                    return (
                      <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <td className="p-2.5 font-bold">{d.name}</td>
                        <td className="p-2.5 text-center tabular-nums" style={{ color: secs >= 30 ? '#F08163' : secs >= 10 ? '#E8B84B' : '#8B9A92' }}>
                          {secs >= 60 ? `${Math.floor(secs / 60)}د ${secs % 60}ث` : `${secs}ث`}
                        </td>
                        <td className="p-2.5 text-center">{d.secretOpen ? <span className="text-rose-400">🔴 نعم</span> : <span className="text-gray-600">—</span>}</td>
                        <td className="p-2.5 text-center text-gray-500 text-[11px]">{new Date(d.at).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg px-3 py-3 text-[11.5px] text-gray-500" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              لا خروجاتٌ مسجّلة بعد — تظهر هنا فور أن يلعب اللاعبون بالإصدار المُحدَّث.
            </div>
          )}

          <p className="text-[10.5px] text-gray-600 mt-4 leading-relaxed">
            🔒 z = عدد الانحرافات المعياريّة فوق المتوقّع صدفةً (2 ≈ اشتباه، 3+ ≈ قويّ). الأزواج تحتاج ≥٥ مباريات مشتركة، والاتفاقيّات ≥٦ كي تُحسب.
            تولّدت {new Date(data.generatedAt).toLocaleString('ar-JO', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'amber' }) {
  const color = tone === 'red' ? '#F08163' : tone === 'amber' ? '#E8B84B' : '#fff';
  return (
    <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-base font-bold tabular-nums" style={{ color }}>{value}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
