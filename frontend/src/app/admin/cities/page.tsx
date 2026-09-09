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
import { swalConfirm } from '@/lib/swal';
import { useCities, fetchCities, invalidateCities, type City } from '@/hooks/useCities';
import CityBadge, { cityTone, CITY_TONE_CLASSES } from '@/components/admin/CityBadge';

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

  useEffect(() => { loadLocations(); }, []);

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
      await Promise.all([reload(), fetchCities('public', true).catch(() => []), loadLocations()]);
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
