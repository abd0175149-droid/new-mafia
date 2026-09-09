'use client';

// ══════════════════════════════════════════════════════
// 🏙️ إدارة المدن — /admin/cities
// ══════════════════════════════════════════════════════
// كلُّ ما يخصّ المدن في مكانٍ واحد: الإضافة، التسمية، التفعيل/التعطيل، الترتيب،
// وأماكنُ كلّ مدينة مع نقلِ مكانٍ من مدينةٍ إلى أخرى.
//
// 🔴 المدينةُ صفةٌ للمكان لا للاعب: كلُّ مكانٍ يتبع مدينةً واحدة، ومدينةُ الفعاليّة
//    من مكانها، ونقاطُ المباراة تذهب لمدينة المكان الذي لُعبت فيه. ولكلّ مدينةٍ
//    ترتيبُها المستقلّ داخل الموسم الواحد.
//
// 🔴 لا حذف: المدنُ مُشارٌ إليها من الأماكن والمباريات وإحصاءات المواسم — والتعطيلُ
//    يُخفيها من الفلاتر ومنتقي المدينة ويبقي تاريخَها سليماً.
// ══════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { swalConfirm } from '@/lib/swal';
import { useCities, fetchCities, invalidateCities, type City } from '@/hooks/useCities';
import CityBadge, { cityTone, CITY_TONE_CLASSES, CITY_TONE_HEX } from '@/components/admin/CityBadge';

// MapLibre يلمس window عند التحميل — لا تُصيَّر على الخادم
const VenueMap = dynamic(() => import('@/components/VenueMap'), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...opts?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

interface Loc {
  id: number;
  name: string;
  region?: string | null;
  cityId?: number | null;
  cityName?: string | null;
  isActive?: boolean;
  isTestLocation?: boolean;
  activeSeasonMatches?: number;
  latitude?: string | number | null;
  longitude?: string | number | null;
}

interface CoverageCity { id: number; name: string; isActive: boolean; hasArea: boolean; playersInside: number }
interface Coverage {
  days: number; totalPlayers: number; withFix: number; noFix: number; outside: number;
  cities: CoverageCity[];
}

export default function CitiesPage() {
  const { cities, loading, reload } = useCities('all');
  const [locations, setLocations] = useState<Loc[]>([]);
  const [locLoading, setLocLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | 'new' | null>(null);
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [moving, setMoving] = useState<Loc | null>(null);
  // 🗺️ نطاقُ المدينة على الخريطة + قياسُ التغطية
  const [areaFor, setAreaFor] = useState<City | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [covDays, setCovDays] = useState(30);
  const [covLoading, setCovLoading] = useState(false);

  const loadLocations = async () => {
    setLocLoading(true);
    try {
      const rows = await apiFetch('/api/locations');
      setLocations(Array.isArray(rows) ? rows : (rows?.locations ?? []));
    } catch (e: any) {
      setError(e?.message || 'تعذّر جلب الأماكن');
    } finally {
      setLocLoading(false);
    }
  };

  const loadCoverage = async (days = covDays) => {
    setCovLoading(true);
    try { setCoverage(await apiFetch(`/api/cities/coverage?days=${days}`)); }
    catch { setCoverage(null); }
    finally { setCovLoading(false); }
  };

  useEffect(() => { loadLocations(); }, []);
  useEffect(() => { loadCoverage(covDays); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [covDays]);

  // أماكنُ كلّ مدينة (المحذوفة ناعماً لا تصل من الخادم أصلاً)
  const byCity = useMemo(() => {
    const m = new Map<number, Loc[]>();
    for (const l of locations) {
      if (l.cityId == null) continue;
      const list = m.get(l.cityId) || [];
      list.push(l);
      m.set(l.cityId, list);
    }
    m.forEach((list: Loc[]) => list.sort((a: Loc, b: Loc) => a.name.localeCompare(b.name, 'ar')));
    return m;
  }, [locations]);

  const orphans = useMemo(() => locations.filter(l => l.cityId == null), [locations]);
  const activeCities = useMemo(() => cities.filter(c => c.isActive), [cities]);

  async function mutate(id: number | 'new', fn: () => Promise<void>) {
    setBusyId(id); setError('');
    try {
      await fn();
      invalidateCities();
      await Promise.all([reload(), fetchCities('public', true).catch(() => []), loadLocations(), loadCoverage()]);
    } catch (e: any) {
      setError(e?.message || 'فشل الحفظ');
    } finally { setBusyId(null); }
  }

  const addCity = () => {
    const name = newName.trim();
    if (!name) return;
    mutate('new', async () => {
      await apiFetch('/api/cities', { method: 'POST', body: JSON.stringify({ name }) });
      setNewName('');
    });
  };

  const rename = (c: City) => {
    const name = editName.trim();
    if (!name || name === c.name) { setEditId(null); return; }
    mutate(c.id, async () => {
      await apiFetch(`/api/cities/${c.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      setEditId(null);
    });
  };

  const toggle = async (c: City) => {
    const venues = byCity.get(c.id)?.length ?? 0;
    if (c.isActive) {
      const extra = venues > 0
        ? `\n\nفيها ${venues} مكاناً — لن تظهر في منتقي المدينة عند إضافة مكانٍ جديد، وأماكنها ومبارياتها تبقى كما هي.`
        : '';
      if (!(await swalConfirm(`تعطيل «${c.name}»؟ تختفي من فلاتر التطبيق ومن منتقي المدينة.${extra}`))) return;
    }
    mutate(c.id, async () => {
      await apiFetch(`/api/cities/${c.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !c.isActive }) });
    });
  };

  // ↑↓ الترتيب — يحدّد ظهورها في الشرائح والفلاتر ومنتقي التطبيق
  const move = (c: City, dir: -1 | 1) => {
    const sorted = [...cities].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    const i = sorted.findIndex(x => x.id === c.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    const other = sorted[j];
    mutate(c.id, async () => {
      await apiFetch(`/api/cities/${c.id}`, { method: 'PATCH', body: JSON.stringify({ sortOrder: other.sortOrder }) });
      await apiFetch(`/api/cities/${other.id}`, { method: 'PATCH', body: JSON.stringify({ sortOrder: c.sortOrder }) });
    });
  };

  const moveVenue = async (loc: Loc, toCityId: number) => {
    const target = cities.find(c => c.id === toCityId);
    if (!target) return;
    const played = loc.activeSeasonMatches ?? 0;
    const warn = played > 0
      ? `\n\n⚠️ لهذا المكان ${played} مباراة في الموسم الحاليّ محسوبةً لتصنيف «${loc.cityName || '—'}». النقلُ يسري على المباريات القادمة فقط؛ التاريخ يبقى مختوماً بمدينته.`
      : '';
    if (!(await swalConfirm(`نقل «${loc.name}» إلى «${target.name}»؟${warn}`))) return;
    await mutate(loc.id, async () => {
      await apiFetch(`/api/locations/${loc.id}/city`, { method: 'PATCH', body: JSON.stringify({ cityId: toCityId }) });
      setMoving(null);
    });
  };

  const sorted = [...cities].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  return (
    <div className="space-y-6" dir="rtl">
      {/* ══ العنوان ══ */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">🏙️ المدن</h1>
          <p className="text-xs text-gray-500 mt-1">
            كلُّ مكانٍ يتبع مدينةً واحدة، ومدينةُ الفعاليّة من مكانها. ولكلّ مدينةٍ ترتيبُها المستقلّ داخل الموسم — لا تنتقل نقاطٌ بين المدن.
          </p>
        </div>
        <a href="/admin/locations" className="text-xs px-3 py-2 rounded-xl bg-gray-800/60 text-gray-300 border border-gray-700/50 hover:bg-gray-700/60 transition whitespace-nowrap">
          📍 الأماكن والحسابات ↗
        </a>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-2.5 text-sm text-rose-300 flex items-center justify-between gap-3">
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} className="text-rose-400/70 hover:text-rose-300">✕</button>
        </div>
      )}

      {/* ══ أماكن بلا مدينة (لا يقع إلا ببياناتٍ قديمة) ══ */}
      {orphans.length > 0 && (
        <div className="bg-amber-500/[0.06] border border-amber-500/25 rounded-2xl p-4">
          <p className="text-sm text-amber-300 font-bold mb-2">⚠️ {orphans.length} مكاناً بلا مدينة</p>
          <p className="text-[11px] text-amber-200/70 mb-3">مبارياتُها لا تُحتسب في أيّ تصنيف حتى تُحدَّد مدينتها.</p>
          <div className="flex flex-wrap gap-2">
            {orphans.map(l => (
              <button key={l.id} onClick={() => setMoving(l)}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-900/60 border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 transition">
                {l.name} — تحديد المدينة
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══ 🗺️ التغطية — أين يقع لاعبونا فعلاً ══ */}
      <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-sm font-bold text-white">🗺️ أين يقع لاعبونا</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              آخرُ موقعٍ معروف لكلّ لاعب داخل النافذة، يُطابَق بدائرة المدينة. رقمٌ إداريّ يقرّر أين تُفتح المدينة القادمة — لا يُعرض للاعبين ولا يغيّر رتبةً ولا يُخفي فعاليّة.
            </p>
          </div>
          <div className="flex items-center gap-1 bg-gray-900/60 border border-gray-700/50 rounded-xl p-0.5">
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setCovDays(d)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${covDays === d ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
                {d} يوم
              </button>
            ))}
          </div>
        </div>

        {covLoading && !coverage ? (
          <p className="text-xs text-gray-500 text-center py-3">جارٍ الحساب…</p>
        ) : !coverage ? (
          <p className="text-xs text-gray-500 text-center py-3">تعذّر حساب التغطية</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              {coverage.cities.filter(c => c.hasArea).map(c => (
                <div key={c.id} className="px-3 py-2 rounded-xl bg-gray-900/50 border border-gray-700/40 min-w-[110px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: CITY_TONE_HEX[cityTone(c.id, c.name)] }} />
                    <span className="text-[11px] text-gray-400">{c.name}</span>
                  </div>
                  <div className="text-lg font-bold text-white font-mono">{c.playersInside}</div>
                  <div className="text-[10px] text-gray-500">لاعبًا داخل الدائرة</div>
                </div>
              ))}
              <div className="px-3 py-2 rounded-xl bg-gray-900/50 border border-gray-700/40 min-w-[110px]">
                <div className="text-[11px] text-gray-400 mb-1">خارج كلّ الدوائر</div>
                <div className="text-lg font-bold text-gray-300 font-mono">{coverage.outside}</div>
                <div className="text-[10px] text-gray-500">فرصةُ مدينةٍ قادمة</div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-gray-900/50 border border-gray-700/40 min-w-[110px]">
                <div className="text-[11px] text-gray-400 mb-1">بلا موقعٍ معروف</div>
                <div className="text-lg font-bold text-gray-500 font-mono">{coverage.noFix}</div>
                <div className="text-[10px] text-gray-500">من {coverage.totalPlayers} لاعبًا</div>
              </div>
            </div>
            {coverage.cities.some(c => !c.hasArea) && (
              <p className="text-[11px] text-amber-400/80">
                ⚠️ بلا نطاقٍ على الخريطة: {coverage.cities.filter(c => !c.hasArea).map(c => c.name).join('، ')} — حدّد نطاقها لتدخل القياس.
              </p>
            )}
          </>
        )}
      </div>

      {/* ══ إضافة مدينة ══ */}
      <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-4">
        <label className="block text-xs text-gray-400 mb-2">إضافة مدينة جديدة</label>
        <div className="flex gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="مثال: إربد"
            onKeyDown={e => { if (e.key === 'Enter') addCity(); }}
            className="flex-1 px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600" />
          <button onClick={addCity} disabled={busyId === 'new' || !newName.trim()}
            className="px-5 py-2.5 rounded-xl bg-gray-900 text-white font-bold text-sm hover:bg-gray-700 transition disabled:opacity-50 whitespace-nowrap">
            {busyId === 'new' ? 'جارٍ…' : '+ إضافة'}
          </button>
        </div>
        <p className="text-[10px] text-gray-500 mt-2">
          تُنشأ فعّالةً وتظهر فوراً في التطبيق. لتجهيزها قبل الإطلاق: أضِفها ثمّ عطّلها، وأضِف أماكنها، ثمّ فعّلها يوم الإطلاق.
        </p>
      </div>

      {/* ══ المدن ══ */}
      {loading && cities.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">جارٍ التحميل…</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">لا مدن بعد — أضف الأولى من الأعلى</div>
      ) : (
        <div className="space-y-3">
          {sorted.map((c, idx) => {
            const venues = byCity.get(c.id) || [];
            const busy = busyId === c.id;
            const open = expanded === c.id;
            const tone = cityTone(c.id, c.name, c.slug);
            return (
              <motion.div key={c.id} layout
                className={`bg-gray-800/50 border rounded-2xl overflow-hidden transition ${c.isActive ? 'border-gray-700/40' : 'border-gray-700/30 opacity-75'}`}>
                {/* ── رأس البطاقة ── */}
                <div className="p-4 flex items-center gap-3 flex-wrap">
                  {/* الترتيب */}
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => move(c, -1)} disabled={busy || idx === 0}
                      className="w-6 h-5 rounded text-[10px] bg-gray-900/60 border border-gray-700/50 text-gray-400 hover:text-white disabled:opacity-25 transition" title="أعلى">▲</button>
                    <button onClick={() => move(c, 1)} disabled={busy || idx === sorted.length - 1}
                      className="w-6 h-5 rounded text-[10px] bg-gray-900/60 border border-gray-700/50 text-gray-400 hover:text-white disabled:opacity-25 transition" title="أسفل">▼</button>
                  </div>

                  {/* الاسم */}
                  <div className="min-w-0 flex-1">
                    {editId === c.id ? (
                      <div className="flex items-center gap-1.5">
                        <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') rename(c); if (e.key === 'Escape') setEditId(null); }}
                          className="w-44 px-2.5 py-1.5 bg-gray-900/60 border border-amber-500/40 rounded-lg text-white text-sm focus:outline-none" />
                        <button onClick={() => rename(c)} disabled={busy}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50">حفظ</button>
                        <button onClick={() => setEditId(null)} className="text-xs text-gray-500 hover:text-white px-1">إلغاء</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <CityBadge cityId={c.id} cityName={c.name} slug={c.slug} size="sm" />
                        <button onClick={() => { setEditId(c.id); setEditName(c.name); }}
                          className="text-gray-500 hover:text-amber-400 text-xs transition" title="تعديل الاسم">✏️</button>
                        {c.isActive
                          ? <span className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-bold">فعّالة</span>
                          : <span className="text-[10px] px-2 py-0.5 rounded-full border bg-gray-700/40 text-gray-400 border-gray-600/40 font-bold">معطّلة</span>}
                      </div>
                    )}
                  </div>

                  {/* الأرقام */}
                  <div className="flex items-center gap-4 text-center">
                    <div><div className="text-base font-bold text-white font-mono">{venues.length}</div><div className="text-[10px] text-gray-500">مكان</div></div>
                    <div><div className="text-base font-bold text-white font-mono">{c.seasonPlayers ?? 0}</div><div className="text-[10px] text-gray-500">لاعب الموسم</div></div>
                    <div><div className="text-base font-bold text-white font-mono">{c.seasonMatches ?? 0}</div><div className="text-[10px] text-gray-500">مباراة</div></div>
                  </div>

                  {/* الإجراءات */}
                  <div className="flex items-center gap-2">
                    <button onClick={() => setAreaFor(c)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition whitespace-nowrap ${
                        c.centerLat != null ? 'border-gray-600/50 text-gray-300 hover:bg-gray-700/60' : 'border-amber-500/30 text-amber-400 bg-amber-500/[0.06] hover:bg-amber-500/15'}`}
                      title="نقطةُ المدينة ونصفُ قطرها على الخريطة">
                      🗺️ {c.centerLat != null ? `النطاق · ${c.radiusKm} كم` : 'حدّد النطاق'}
                    </button>
                    <button onClick={() => setExpanded(open ? null : c.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-600/50 text-gray-300 hover:bg-gray-700/60 transition whitespace-nowrap">
                      {open ? 'إخفاء الأماكن' : `الأماكن (${venues.length})`}
                    </button>
                    <button onClick={() => toggle(c)} disabled={busy}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition disabled:opacity-50 whitespace-nowrap ${
                        c.isActive ? 'border-gray-600/50 text-gray-300 hover:bg-gray-700/60'
                          : 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'}`}>
                      {busy ? '…' : c.isActive ? 'تعطيل' : 'تفعيل'}
                    </button>
                  </div>
                </div>

                {/* ── أماكن المدينة ── */}
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-gray-700/30">
                      <div className="p-4 space-y-2">
                        {locLoading ? (
                          <p className="text-xs text-gray-500 text-center py-2">جارٍ التحميل…</p>
                        ) : venues.length === 0 ? (
                          <p className="text-xs text-gray-500 text-center py-2">
                            لا أماكن في هذه المدينة — أضِف مكاناً من صفحة «الأماكن والحسابات» واختر «{c.name}» في حقل المدينة.
                          </p>
                        ) : venues.map(l => (
                          <div key={l.id} className="flex items-center gap-3 flex-wrap bg-gray-900/40 border border-gray-700/30 rounded-xl px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-white font-bold truncate">
                                {l.name}
                                {l.isTestLocation && <span className="mr-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">🧪 اختبار</span>}
                                {l.isActive === false && <span className="mr-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-400">موقوف</span>}
                              </div>
                              <div className="text-[11px] text-gray-500">
                                {l.region ? `📍 ${l.region}` : '📍 بلا منطقة'}
                                {(l.activeSeasonMatches ?? 0) > 0 && <span className="mr-2">· {l.activeSeasonMatches} مباراة هذا الموسم</span>}
                              </div>
                            </div>
                            <button onClick={() => setMoving(l)}
                              className="text-xs px-3 py-1.5 rounded-lg border border-gray-600/50 text-gray-300 hover:bg-gray-700/60 transition whitespace-nowrap">
                              نقل لمدينة أخرى
                            </button>
                          </div>
                        ))}
                        <p className={`text-[10px] mt-2 px-2 py-1.5 rounded-lg border ${CITY_TONE_CLASSES[tone]}`}>
                          مبارياتُ هذه الأماكن تُحتسب لتصنيف «{c.name}» — ولا تنتقل نقاطُها إلى أيّ مدينةٍ أخرى.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-gray-600 text-center">
        لا حذف للمدن — المفاتيح مُشارٌ إليها من الأماكن والمباريات وإحصاءات المواسم. التعطيلُ يُخفيها ويحفظ تاريخها.
      </p>

      {/* ══ 🗺️ نافذة نطاق المدينة ══ */}
      <AnimatePresence>
        {areaFor && (
          <CityAreaDialog
            city={areaFor}
            venues={(byCity.get(areaFor.id) || []).filter(v => v.latitude != null && v.longitude != null)}
            onClose={() => setAreaFor(null)}
            onSaved={async () => { setAreaFor(null); await mutate(areaFor.id, async () => {}); }}
          />
        )}
      </AnimatePresence>

      {/* ══ نافذة نقل مكان ══ */}
      <AnimatePresence>
        {moving && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setMoving(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 w-full max-w-[480px] space-y-4" dir="rtl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">نقل «{moving.name}»</h3>
                <button onClick={() => setMoving(null)} className="text-gray-500 hover:text-white transition">✕</button>
              </div>
              <p className="text-xs text-gray-400">
                المدينة الحاليّة: {moving.cityName ? <CityBadge cityId={moving.cityId} cityName={moving.cityName} /> : <span className="text-amber-400">بلا مدينة</span>}
              </p>
              {(moving.activeSeasonMatches ?? 0) > 0 && (
                <div className="bg-amber-500/[0.06] border border-amber-500/25 rounded-xl px-3 py-2 text-[11px] text-amber-300">
                  لهذا المكان <b>{moving.activeSeasonMatches} مباراة</b> في الموسم الحاليّ. النقلُ يسري على المباريات القادمة فقط — التاريخ يبقى مختوماً بمدينته.
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {activeCities.filter(c => c.id !== moving.cityId).map(c => (
                  <button key={c.id} onClick={() => moveVenue(moving, c.id)} disabled={busyId === moving.id}
                    className="px-3 py-3 rounded-xl bg-gray-900/60 border border-gray-700/50 hover:border-gray-500/60 transition text-sm text-white font-bold disabled:opacity-50">
                    🏙️ {c.name}
                  </button>
                ))}
              </div>
              {activeCities.filter(c => c.id !== moving.cityId).length === 0 && (
                <p className="text-xs text-gray-500 text-center">لا مدينة أخرى فعّالة — فعّل مدينةً أوّلاً.</p>
              )}
              <button onClick={() => setMoving(null)} className="w-full py-2.5 rounded-xl bg-gray-700/50 text-gray-300 text-sm hover:bg-gray-700/70 transition">إلغاء</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🗺️ نطاقُ المدينة — نقطةٌ ونصفُ قطر على الخريطة
// ══════════════════════════════════════════════════════
// 🔴 دائرةٌ لا حدودٌ إداريّة: حدودُ المدن متداخلةٌ ولا يعرفها الجهاز، والدائرةُ
//    تُرسم وتُفهم. نفسُ نموذج مجموعات الواتساب القائم منذ شهور.
// 🔴 للاقتراح والقياس لا للقرار: لا تُغيّر رتبةً ولا تُخفي فعاليّة — الرتبةُ من
//    مكان اللعب، والمدينةُ الأساسيّة اختيارُ اللاعب.
// 🔴 المركزُ يُقترَح من أماكن المدينة إن وُجدت لها نقاط: من يضبط نطاق مدينةٍ من
//    مكتبه لا يعرف إحداثيّاتها، وأماكنُه هي أدقُّ ما يملك.
function CityAreaDialog({ city, venues, onClose, onSaved }: {
  city: City;
  venues: Loc[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const suggested = useMemo(() => {
    if (venues.length === 0) return null;
    const pts = venues.map(v => ({ lat: Number(v.latitude), lng: Number(v.longitude) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (pts.length === 0) return null;
    return {
      lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
      lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
    };
  }, [venues]);

  const [lat, setLat] = useState<number | null>(city.centerLat ?? null);
  const [lng, setLng] = useState<number | null>(city.centerLng ?? null);
  const [radius, setRadius] = useState<number>(city.radiusKm ?? 15);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const center = lat != null && lng != null ? { lat, lng } : null;

  const save = async () => {
    if (lat == null || lng == null) { setErr('حدّد نقطة المركز على الخريطة'); return; }
    setBusy(true); setErr('');
    try {
      await apiFetch(`/api/cities/${city.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ centerLat: lat, centerLng: lng, radiusKm: radius }),
      });
      invalidateCities();
      await fetchCities('public', true).catch(() => []);
      await onSaved();
    } catch (e: any) { setErr(e?.message || 'فشل الحفظ'); setBusy(false); }
  };

  const clear = async () => {
    if (!(await swalConfirm(`مسح نطاق «${city.name}» من الخريطة؟ تخرج من قياس التغطية ولا يتغيّر شيءٌ آخر.`))) return;
    setBusy(true); setErr('');
    try {
      await apiFetch(`/api/cities/${city.id}`, { method: 'PATCH', body: JSON.stringify({ centerLat: null, centerLng: null, radiusKm: null }) });
      invalidateCities();
      await fetchCities('public', true).catch(() => []);
      await onSaved();
    } catch (e: any) { setErr(e?.message || 'فشل الحفظ'); setBusy(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-gray-800 border border-gray-700/50 rounded-2xl p-5 w-full max-w-[720px] space-y-3 max-h-[92vh] overflow-y-auto" dir="rtl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">🗺️ نطاق «{city.name}» على الخريطة</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">نقطةٌ ونصفُ قطر — للاقتراح وقياس التغطية. لا تُغيّر رتبةً ولا تُخفي فعاليّة.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition">✕</button>
        </div>

        {err && <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2 text-xs text-rose-300">⚠️ {err}</div>}

        <VenueMap
          center={center}
          radiusM={center ? radius * 1000 : null}
          draggablePin
          onPinMove={(a, b) => { setLat(a); setLng(b); }}
          onMapClick={(a, b) => { setLat(a); setLng(b); }}
          dots={venues.map(v => ({ id: v.id, lat: Number(v.latitude), lng: Number(v.longitude), color: '#F59E0B', label: v.name }))}
          height={320}
          className="rounded-xl overflow-hidden border border-gray-700/50"
        />
        <p className="text-[10px] text-gray-500">انقر على الخريطة لوضع المركز، أو اسحب الدبّوس. النقاط الكهرمانيّة أماكنُ المدينة.</p>

        {!center && suggested && (
          <button onClick={() => { setLat(suggested.lat); setLng(suggested.lng); }}
            className="w-full py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold hover:bg-amber-500/20 transition">
            📍 ابدأ من متوسّط أماكن المدينة ({venues.length} مكانًا)
          </button>
        )}

        <div>
          <label className="block text-xs text-gray-400 mb-1">نصف القطر: <span className="text-white font-mono">{radius} كم</span></label>
          <input type="range" min={1} max={60} step={1} value={radius} onChange={e => setRadius(Number(e.target.value))}
            className="w-full accent-amber-500" />
          <div className="flex justify-between text-[10px] text-gray-600"><span>١ كم</span><span>٦٠ كم</span></div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><label className="block text-[10px] text-gray-500 mb-1">خطّ العرض</label>
            <input value={lat ?? ''} onChange={e => setLat(e.target.value === '' ? null : Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white font-mono text-xs" dir="ltr" /></div>
          <div><label className="block text-[10px] text-gray-500 mb-1">خطّ الطول</label>
            <input value={lng ?? ''} onChange={e => setLng(e.target.value === '' ? null : Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white font-mono text-xs" dir="ltr" /></div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={busy || lat == null || lng == null}
            className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white font-bold text-sm hover:bg-gray-700 transition disabled:opacity-50">
            {busy ? 'جارٍ الحفظ…' : 'حفظ النطاق'}
          </button>
          {city.centerLat != null && (
            <button onClick={clear} disabled={busy}
              className="px-4 py-2.5 rounded-xl border border-rose-500/30 text-rose-300 text-sm hover:bg-rose-500/10 transition disabled:opacity-50">
              مسح النطاق
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-gray-700/50 text-gray-300 text-sm hover:bg-gray-700/70 transition">إلغاء</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
