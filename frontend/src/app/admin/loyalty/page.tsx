'use client';

// ══════════════════════════════════════════════════════
// 🎟️ بطاقة الولاء (ختم الدون) — لوحة الإدارة
// نظرة عامّة · اللاعبون · المكافآت · الإعدادات
// المفتاح الرئيس في الأعلى: حين يُطفأ لا يظهر للاعبين أيّ أثر للميزة.
// ══════════════════════════════════════════════════════

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { swalConfirm } from '@/lib/swal';
import {
  api, Avatar, StampDots, StatusPill, RankBadge, PlayerDrawer, swalInput,
  STATUS_LABEL, KIND_LABEL, rewardText, rewardRef, fmtDate, fmtDateTime, type Reward,
} from './PlayerDrawer';

// ── الفترة الشهريّة (بتوقيت عمّان) ─────────────────────
function currentPeriod(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Amman' }).slice(0, 7);
}
function shiftPeriod(p: string, delta: number): string {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function periodLabel(p: string): string {
  const [y, m] = p.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('ar-JO', { timeZone: 'UTC', month: 'long', year: 'numeric' });
}
const num = (v: any) => (v == null || v === '' ? '—' : Number(v).toLocaleString('en-US'));

type LoyaltyConfig = {
  enabled: boolean; locationIds: number[]; stampsPerReward: number; minLeadHours: number; channel: 'app' | 'app_bot' | 'any';
  maxRewardsPerMonth: number; rewardValidityDays: number; chooseWindowDays: number;
  rewards: { freeVisit: { enabled: boolean }; freeDrink: { enabled: boolean; capJod: number; categories: string[] }; chips: { enabled: boolean; amount: number } };
  excludeTestAccounts: boolean; celebration: { enabled: boolean; durationMs: number };
  reminders: { preCutoff: { enabled: boolean; hourLocal: number }; missed: { enabled: boolean }; monthly: { enabled: boolean }; expiring: { enabled: boolean; daysBefore: number } };
  startedAt: string | null; disabledAt: string | null;
};
type Location = { id: number; name: string; isTestLocation?: boolean };
type Tab = 'overview' | 'players' | 'rewards' | 'settings';

const inputCls = 'bg-gray-900/60 border border-gray-600/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50';
const cardCls = 'bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4';

export default function LoyaltyAdminPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>}>
      <LoyaltyInner />
    </Suspense>
  );
}

function LoyaltyInner() {
  const search = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [config, setConfig] = useState<LoyaltyConfig | null>(null);
  const [cfgErr, setCfgErr] = useState<string | null>(null);
  const [period, setPeriod] = useState(currentPeriod());
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<string>('');
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toggling, setToggling] = useState(false);

  const showToast = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadConfig = useCallback(() => {
    api('/api/loyalty/admin/config').then(setConfig).catch((e: any) => setCfgErr(e.message || 'تعذّر جلب الإعدادات'));
  }, []);

  useEffect(() => {
    loadConfig();
    api('/api/locations').then((rows: any) => {
      const list: Location[] = (Array.isArray(rows) ? rows : []).map((l: any) => ({ id: l.id, name: l.name, isTestLocation: !!l.isTestLocation }));
      setLocations(list);
    }).catch(() => setLocations([]));
  }, [loadConfig]);

  // ?player=<id> ⇒ فتح لوح التفاصيل مباشرةً
  useEffect(() => {
    const p = Number(search?.get('player'));
    if (Number.isInteger(p) && p > 0) { setDrawerId(p); setTab('players'); }
  }, [search]);

  const openPlayer = useCallback((id: number) => setDrawerId(id), []);
  const closeDrawer = useCallback(() => {
    setDrawerId(null);
    if (search?.get('player')) router.replace('/admin/loyalty');
  }, [router, search]);
  const bump = useCallback(() => setRefreshKey(k => k + 1), []);

  const toggleEnabled = async () => {
    if (!config) return;
    const next = !config.enabled;
    if (!next) {
      const ok = await swalConfirm('سيتوقّف البرنامج فوراً: لا أختام جديدة، ولا يظهر للاعبين أيّ أثر للبطاقة أو المكافآت.\nالبيانات المسجَّلة تبقى محفوظة.', { title: 'إيقاف بطاقة الولاء؟', confirmText: 'أوقف', danger: true });
      if (!ok) return;
    }
    setToggling(true);
    try {
      const c = await api('/api/loyalty/admin/config', { method: 'PUT', body: JSON.stringify({ enabled: next }) });
      setConfig(c);
      showToast('ok', next ? '✅ فُعّلت بطاقة الولاء' : 'أُوقفت بطاقة الولاء');
      bump();
    } catch (e: any) { showToast('err', e.message || 'فشل التبديل'); }
    finally { setToggling(false); }
  };

  const subtitle = config
    ? `${config.stampsPerReward} أختام = مكافأة · الحجز قبل ${config.minLeadHours} ساعات${config.channel === 'app' ? ' من التطبيق' : config.channel === 'app_bot' ? ' من التطبيق أو بوت الواتساب' : ''} · الحضور = مباراة واحدة · حتّى ${config.maxRewardsPerMonth} مكافآت في الشهر`
    : 'ختم لكلّ حجز مبكّر من التطبيق يتبعه حضور — والبطاقة تتجدّد كلَّ شهر.';

  const showPeriod = tab !== 'settings';

  return (
    <div dir="rtl" className="pb-10">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">🎟️ بطاقة الولاء</h1>
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        </div>
        {/* المفتاح الرئيس */}
        <div className="flex items-center gap-3">
          <span className={`text-sm font-bold ${config?.enabled ? 'text-emerald-400' : 'text-gray-500'}`}>
            {config ? (config.enabled ? 'الميزة مفعّلة' : 'الميزة متوقّفة') : '…'}
          </span>
          <button onClick={toggleEnabled} disabled={!config || toggling} aria-label="تفعيل/إيقاف بطاقة الولاء"
            className="relative w-[72px] h-9 rounded-full border transition-all disabled:opacity-50"
            style={{
              background: config?.enabled ? 'linear-gradient(90deg,#f59e0b,#e11d48)' : 'rgba(31,41,55,.8)',
              borderColor: config?.enabled ? 'rgba(251,191,36,.6)' : 'rgba(75,85,99,.6)',
              boxShadow: config?.enabled ? '0 0 18px rgba(245,158,11,.35)' : 'none',
            }}>
            <span className="absolute top-1 w-7 h-7 rounded-full bg-white shadow transition-all"
              style={{ right: config?.enabled ? 4 : 36 }} />
          </button>
        </div>
      </div>

      {cfgErr && <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-900/20 text-rose-200 text-sm px-4 py-3">{cfgErr}</div>}
      {config && !config.enabled && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-gradient-to-l from-rose-900/30 to-amber-900/20 text-amber-200 text-sm px-4 py-3 flex items-center gap-2">
          <span>⛔</span>
          <span><b>الميزة متوقّفة:</b> لا يظهر للاعبين أيّ أثر لها{config.disabledAt ? ` — منذ ${fmtDateTime(config.disabledAt)}` : ''}.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-gray-700/40 flex-wrap">
        {([['overview', '📊 نظرة عامّة'], ['players', '👥 اللاعبون'], ['rewards', '🎁 المكافآت'], ['settings', '⚙️ الإعدادات']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-bold transition-all border-b-2 -mb-px ${
              tab === k ? 'text-amber-400 border-amber-400' : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {/* شريط الفترة والمكان */}
      {showPeriod && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <div className="flex items-center bg-gray-900/60 border border-gray-600/50 rounded-xl overflow-hidden">
            <button onClick={() => setPeriod(p => shiftPeriod(p, -1))} className="px-3 py-2 text-gray-400 hover:text-white" aria-label="الشهر السابق">▶</button>
            <span className="px-3 text-sm font-bold text-white min-w-[130px] text-center">{periodLabel(period)}</span>
            <button onClick={() => setPeriod(p => shiftPeriod(p, 1))} disabled={period >= currentPeriod()}
              className="px-3 py-2 text-gray-400 hover:text-white disabled:opacity-30" aria-label="الشهر التالي">◀</button>
          </div>
          {period !== currentPeriod() && (
            <button onClick={() => setPeriod(currentPeriod())} className="text-[11px] text-amber-400 hover:underline">هذا الشهر</button>
          )}
          {locations.length > 0 && tab !== 'rewards' && (
            <select value={locationId} onChange={e => setLocationId(e.target.value)} className={inputCls}>
              <option value="">كلّ الأماكن</option>
              {locations.filter(l => !l.isTestLocation).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
        </div>
      )}

      {tab === 'overview' && <OverviewTab key={refreshKey} period={period} locationId={locationId} openPlayer={openPlayer} />}
      {tab === 'players' && <PlayersTab refreshKey={refreshKey} period={period} locationId={locationId} openPlayer={openPlayer} />}
      {tab === 'rewards' && <RewardsTab refreshKey={refreshKey} period={period} openPlayer={openPlayer} toast={showToast} onChanged={bump} />}
      {tab === 'settings' && config && <SettingsTab config={config} locations={locations} period={period} onSaved={c => { setConfig(c); bump(); }} toast={showToast} />}
      {tab === 'settings' && !config && !cfgErr && <p className="text-gray-500 text-sm py-10 text-center">جارٍ التحميل…</p>}

      {drawerId != null && (
        <PlayerDrawer playerId={drawerId} period={period} onClose={closeDrawer} onChanged={bump} toast={showToast} />
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[500] px-5 py-3 rounded-xl border text-sm font-bold shadow-2xl ${
          toast.kind === 'ok' ? 'bg-emerald-900/90 border-emerald-500/50 text-emerald-200' : 'bg-rose-900/90 border-rose-500/50 text-rose-200'
        }`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 📊 نظرة عامّة
// ══════════════════════════════════════════════════════
type Overview = {
  period: string;
  config: { enabled: boolean; stampsPerReward: number; minLeadHours: number; maxRewardsPerMonth: number; startedAt: string | null };
  totals: { visits: number; players: number; stamps: number; stampedPlayers: number; manualStamps: number; earlyRate: number };
  rewards: { status: string; kind: string | null; n: number; jod: number; chips: number }[];
  rewardTotals: { completed: number; redeemedJod: number; redeemedChips: number; pending: number; available: number };
  activities: { activityId: number; name: string; date: string; locationName: string | null; visits: number; stamps: number }[];
  topPlayers: { playerId: number; name: string; avatarUrl: string | null; stamps: number; rewards: number }[];
  frequentNoStamp: { playerId: number; name: string; avatarUrl: string | null; visits: number }[];
};

function OverviewTab({ period, locationId, openPlayer }: { period: string; locationId: string; openPlayer: (id: number) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setData(null); setErr(null);
    api(`/api/loyalty/admin/overview?period=${period}${locationId ? `&locationId=${locationId}` : ''}`)
      .then(setData).catch((e: any) => setErr(e.message || 'تعذّر الجلب'));
  }, [period, locationId]);

  if (err) return <p className="text-rose-400 text-sm py-10 text-center">{err}</p>;
  if (!data) return <p className="text-gray-500 text-sm py-10 text-center">جارٍ التحميل…</p>;

  const N = data.config.stampsPerReward || 5;
  const t = data.totals, rt = data.rewardTotals;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="أختام هذا الشهر" value={num(t.stamps)} unit="✦" tone="#f59e0b" hint={`${num(t.stampedPlayers)} لاعباً حصل على ختم · ${num(t.manualStamps)} يدويّ`} />
        <Kpi label="نسبة الحجز المبكّر" value={t.visits ? `${Number(t.earlyRate).toFixed(0)}%` : '—'} unit="" tone="#38bdf8" hint={`من ${num(t.visits)} زيارة`} />
        <Kpi label="لاعبون على البطاقة" value={num(t.stampedPlayers)} unit={`من ${num(t.players)}`} tone="#a78bfa" hint="حصلوا على ختم واحد على الأقلّ" />
        <Kpi label="بطاقات مكتملة" value={num(rt.completed)} unit="🎁" tone="#34d399" hint={`${num(rt.pending)} بانتظار الاختيار · ${num(rt.available)} متاحة`} />
        <Kpi label="كلفة المكافآت" value={`${Number(rt.redeemedJod || 0).toFixed(2)}`} unit="د.أ" tone="#fb7185" hint="ما استُخدم فعلاً هذا الشهر"
          extra={<span className="text-xs text-amber-400 font-bold tabular-nums">+ {num(rt.redeemedChips)} 🪙</span>} />
      </div>

      {/* الرسم */}
      <div className={cardCls}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-200">الأختام لكلّ فعاليّة</h3>
          <div className="flex items-center gap-3 text-[11px] text-gray-500">
            <span className="inline-flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgba(148,163,184,.18)' }} /> زيارات</span>
            <span className="inline-flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm" style={{ background: '#f59e0b' }} /> أختام</span>
          </div>
        </div>
        <ActivityChart rows={data.activities} />
      </div>

      {/* اللوحان الجانبيّان */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cardCls}>
          <h3 className="text-sm font-bold text-gray-200 mb-3">🏁 الأقرب لإكمال البطاقة</h3>
          {data.topPlayers.length === 0 ? <p className="text-[12px] text-gray-600 py-4 text-center">لا أختام بعد هذا الشهر</p> : (
            <div className="space-y-1.5">
              {data.topPlayers.map(p => {
                const inCard = p.stamps % N === 0 && p.stamps > 0 ? N : p.stamps % N;
                return (
                  <button key={p.playerId} onClick={() => openPlayer(p.playerId)}
                    className="w-full flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-gray-700/30 transition text-right">
                    <Avatar url={p.avatarUrl} name={p.name} size={28} />
                    <span className="flex-1 min-w-0 text-[13px] text-gray-200 truncate">{p.name}</span>
                    {p.rewards > 0 && <span className="text-[10px] font-bold px-1.5 rounded-full border border-emerald-500/40 text-emerald-300">🎁 ×{p.rewards}</span>}
                    <StampDots filled={inCard} total={N} size={9} />
                    <span className="text-[11px] text-gray-500 tabular-nums w-8 text-left">{p.stamps}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className={cardCls}>
          <h3 className="text-sm font-bold text-gray-200 mb-3">👣 زوّار دائمون بلا ختم</h3>
          <p className="text-[11px] text-gray-600 mb-2">يحضرون كثيراً لكن لا يحجزون من التطبيق مبكّراً — الأولى بالتذكير.</p>
          {data.frequentNoStamp.length === 0 ? <p className="text-[12px] text-gray-600 py-4 text-center">لا أحد — الكلّ على البطاقة</p> : (
            <div className="space-y-1.5">
              {data.frequentNoStamp.map(p => (
                <button key={p.playerId} onClick={() => openPlayer(p.playerId)}
                  className="w-full flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-rose-500/[0.06] transition text-right">
                  <Avatar url={p.avatarUrl} name={p.name} size={28} />
                  <span className="flex-1 min-w-0 text-[13px] text-gray-200 truncate">{p.name}</span>
                  <span className="text-[11px] text-rose-300 tabular-nums">{p.visits} زيارة</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* توزيع المكافآت */}
      {data.rewards.length > 0 && (
        <div className={cardCls}>
          <h3 className="text-sm font-bold text-gray-200 mb-3">🎁 المكافآت هذا الشهر</h3>
          <div className="flex flex-wrap gap-2">
            {data.rewards.map((r, i) => (
              <span key={i} className="text-[12px] px-3 py-1.5 rounded-xl border border-gray-700/40 bg-gray-900/40 text-gray-300 flex items-center gap-2">
                <StatusPill status={r.status} />
                <span>{r.kind ? KIND_LABEL[r.kind] || r.kind : 'لم يُختر'}</span>
                <b className="text-white tabular-nums">×{r.n}</b>
                {r.jod > 0 && <span className="text-gray-500 tabular-nums">{Number(r.jod).toFixed(2)} د.أ</span>}
                {r.chips > 0 && <span className="text-amber-400 tabular-nums">{r.chips} 🪙</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, unit, tone, hint, extra }: { label: string; value: string; unit: string; tone: string; hint?: string; extra?: ReactNode }) {
  return (
    <div className={cardCls} title={hint}>
      <p className="text-[11px] text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-black tabular-nums" style={{ color: tone }}>
        {value}
        {unit && <span className="text-xs font-normal text-gray-500 mr-1">{unit}</span>}
      </p>
      {extra}
      {hint && <p className="text-[10.5px] text-gray-600 mt-1 truncate">{hint}</p>}
    </div>
  );
}

/** أعمدة: زيارات خلفيّة باهتة + أختام كهرمانيّة — CSS خالص */
function ActivityChart({ rows }: { rows: Overview['activities'] }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [rows]);
  const max = Math.max(1, ...sorted.map(r => r.visits));
  if (!sorted.length) return <p className="text-[12px] text-gray-600 py-6 text-center">لا فعاليّات في هذا الشهر</p>;
  const H = 140;
  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-2 min-w-max" style={{ height: H + 34 }} dir="ltr">
        {sorted.map(r => {
          const vh = Math.round((r.visits / max) * H);
          const sh = Math.round((r.stamps / max) * H);
          const day = new Date(r.date).toLocaleDateString('en-GB', { timeZone: 'Asia/Amman', day: 'numeric' });
          return (
            <div key={r.activityId} className="flex flex-col items-center justify-end" style={{ width: 34 }}
              title={`${r.name}${r.locationName ? ` · ${r.locationName}` : ''}\n${fmtDate(r.date)}\nزيارات ${r.visits} · أختام ${r.stamps}`}>
              <span className="text-[10px] text-amber-400 font-bold tabular-nums mb-0.5">{r.stamps || ''}</span>
              <div className="relative w-full rounded-t-md overflow-hidden" style={{ height: H }}>
                <div className="absolute bottom-0 left-0 right-0 rounded-t-md" style={{ height: vh, background: 'rgba(148,163,184,.18)' }} />
                <div className="absolute bottom-0 left-1 right-1 rounded-t-md" style={{ height: sh, background: 'linear-gradient(180deg,#fbbf24,#d97706)' }} />
              </div>
              <span className="text-[10px] text-gray-500 tabular-nums mt-1">{day}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 👥 اللاعبون
// ══════════════════════════════════════════════════════
type PlayerRow = {
  playerId: number; name: string; phone: string; avatarUrl: string | null; rankTier: string | null;
  visits: number; stamps: number; manualStamps: number; appBooked: number; rewards: number; lastVisit: string | null;
  rewardsList: { id: number; status: string; kind: string | null; expiresAt: string | null }[];
};
const FILTERS = [['all', 'الكلّ'], ['on_card', 'على البطاقة'], ['completed', 'مكتملة'], ['no_stamp', 'زيارات بلا ختم']] as const;

function PlayersTab({ period, locationId, openPlayer, refreshKey }: { period: string; locationId: string; openPlayer: (id: number) => void; refreshKey: number }) {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const size = 20;
  const [data, setData] = useState<{ total: number; stampsPerReward: number; rows: PlayerRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setDq(q.trim()); setPage(1); }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);
  useEffect(() => { setPage(1); }, [filter, period, locationId]);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ period, filter, page: String(page), size: String(size) });
    if (dq) qs.set('q', dq);
    if (locationId) qs.set('locationId', locationId);
    api(`/api/loyalty/admin/players?${qs}`).then(setData).catch(() => setData({ total: 0, stampsPerReward: 5, rows: [] })).finally(() => setLoading(false));
  }, [period, filter, page, dq, locationId, refreshKey]);

  const N = data?.stampsPerReward || 5;
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / size));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 اسم أو هاتف…" className={`${inputCls} w-56`} />
        <div className="flex bg-gray-900/60 border border-gray-600/50 rounded-xl overflow-hidden">
          {FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-2 text-xs font-bold transition ${filter === k ? 'bg-amber-500/20 text-amber-300' : 'text-gray-400 hover:text-white'}`}>{l}</button>
          ))}
        </div>
        <span className="text-[11px] text-gray-500 tabular-nums">{data ? `${num(data.total)} لاعباً` : ''}{loading ? ' …' : ''}</span>
      </div>

      <div className={`${cardCls} p-0 overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-gray-500 border-b border-gray-700/40">
              <th className="text-right px-3 py-2 font-normal">اللاعب</th>
              <th className="text-right px-3 py-2 font-normal">بطاقة الشهر</th>
              <th className="text-center px-3 py-2 font-normal">زيارات</th>
              <th className="text-center px-3 py-2 font-normal">حجز التطبيق</th>
              <th className="text-right px-3 py-2 font-normal">المكافآت</th>
              <th className="text-right px-3 py-2 font-normal">آخر زيارة</th>
              <th className="text-left px-3 py-2 font-normal">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {!data && <tr><td colSpan={7} className="text-center text-gray-500 py-10">جارٍ التحميل…</td></tr>}
            {data && data.rows.length === 0 && <tr><td colSpan={7} className="text-center text-gray-600 py-10">لا نتائج</td></tr>}
            {data?.rows.map(r => {
              const completed = r.rewards > 0;
              const inCard = completed && r.stamps % N === 0 ? N : r.stamps % N;
              const warn = r.visits >= 3 && r.stamps === 0;
              return (
                <tr key={r.playerId} className={`border-b border-gray-800/60 hover:bg-gray-700/20 transition ${warn ? 'bg-rose-500/[0.03]' : ''}`}>
                  <td className="px-3 py-2">
                    <button onClick={() => openPlayer(r.playerId)} className="flex items-center gap-2 text-right">
                      <Avatar url={r.avatarUrl} name={r.name} size={28} />
                      <span className="min-w-0">
                        <span className="block text-[13px] text-white truncate max-w-[180px]">{r.name}</span>
                        <span className="block text-[10.5px] text-gray-500"><span dir="ltr">#{r.playerId}</span> <RankBadge tier={r.rankTier} /></span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StampDots filled={inCard} total={N} />
                      {completed && <span className="text-[10px] font-bold px-1.5 rounded-full border border-emerald-500/40 text-emerald-300">مكتملة{r.rewards > 1 ? ` ×${r.rewards}` : ''}</span>}
                      {r.manualStamps > 0 && <span className="text-[10px] px-1.5 rounded-full border border-sky-500/40 text-sky-300">يدويّ ×{r.manualStamps}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums text-gray-200">{r.visits}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-gray-400" dir="ltr">{r.appBooked}/{r.visits}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.rewardsList.length === 0 ? <span className="text-gray-700">—</span> : r.rewardsList.map(x => (
                        <span key={x.id} title={x.kind ? KIND_LABEL[x.kind] : 'لم يُختر'}><StatusPill status={x.status} /></span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[12px] text-gray-400 whitespace-nowrap">{fmtDate(r.lastVisit)}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openPlayer(r.playerId)} className="px-2 py-1 rounded-lg text-[11px] font-bold bg-gray-800/60 border border-gray-700/40 text-gray-300 hover:bg-gray-700/60">👁 تفاصيل</button>
                      <button onClick={() => openPlayer(r.playerId)} className="px-2 py-1 rounded-lg text-[11px] font-bold bg-amber-900/40 border border-amber-600/40 text-amber-300 hover:bg-amber-900/60">✦ ختم</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-800/60 border border-gray-700/40 text-gray-300 disabled:opacity-30">السابق</button>
          <span className="text-xs text-gray-400 tabular-nums">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-800/60 border border-gray-700/40 text-gray-300 disabled:opacity-30">التالي</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🎁 المكافآت
// ══════════════════════════════════════════════════════
function RewardsTab({ period, openPlayer, toast, onChanged, refreshKey }: {
  period: string; openPlayer: (id: number) => void; toast: (k: 'ok' | 'err', t: string) => void; onChanged: () => void; refreshKey: number;
}) {
  const [scope, setScope] = useState<'month' | 'all'>('month');
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const [page, setPage] = useState(1);
  const size = 30;
  const [data, setData] = useState<{ total: number; rows: Reward[] } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => { setPage(1); }, [scope, status, kind, period]);
  useEffect(() => {
    const qs = new URLSearchParams({ period: scope === 'all' ? 'all' : period, status, kind, page: String(page), size: String(size) });
    api(`/api/loyalty/admin/rewards?${qs}`).then(setData).catch(() => setData({ total: 0, rows: [] }));
  }, [scope, status, kind, period, page, refreshKey, tick]);

  const act = async (id: number, path: 'void' | 'redeem') => {
    const text = path === 'void'
      ? await swalInput('سبب إلغاء المكافأة', { placeholder: 'السبب…', danger: true, confirmText: 'إلغاء المكافأة' })
      : await swalInput('استخدام المكافأة يدويّاً', { placeholder: 'ملاحظة: أين ومتى استُخدمت', confirmText: 'تسجيل الاستخدام' });
    if (!text) return;
    setBusy(id);
    try {
      await api(`/api/loyalty/admin/rewards/${id}/${path}`, { method: 'POST', body: JSON.stringify(path === 'void' ? { reason: text } : { note: text }) });
      toast('ok', path === 'void' ? 'أُلغيت المكافأة' : 'سُجّل الاستخدام');
      setTick(t => t + 1); onChanged();
    } catch (e: any) { toast('err', e.message || 'فشل الإجراء'); }
    finally { setBusy(null); }
  };

  const totals = useMemo(() => {
    let jod = 0, chips = 0;
    for (const r of data?.rows || []) {
      if (r.status !== 'redeemed') continue;
      const v = r.value || {};
      if (r.kind === 'chips') chips += Number(v.chips || 0);
      else jod += Number(v.jod || 0);
    }
    return { jod, chips };
  }, [data]);
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / size));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-gray-900/60 border border-gray-600/50 rounded-xl overflow-hidden">
          {([['month', 'هذا الشهر'], ['all', 'الكلّ']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setScope(k)} className={`px-3 py-2 text-xs font-bold transition ${scope === k ? 'bg-amber-500/20 text-amber-300' : 'text-gray-400 hover:text-white'}`}>{l}</button>
          ))}
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
          <option value="all">كلّ الحالات</option>
          {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={kind} onChange={e => setKind(e.target.value)} className={inputCls}>
          <option value="all">كلّ الأنواع</option>
          {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="text-[11px] text-gray-500 tabular-nums">{data ? `${num(data.total)} مكافأة` : ''}</span>
      </div>

      <div className={`${cardCls} p-0 overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-gray-500 border-b border-gray-700/40">
              <th className="text-right px-3 py-2 font-normal">#</th>
              <th className="text-right px-3 py-2 font-normal">اللاعب</th>
              <th className="text-right px-3 py-2 font-normal">المكافأة</th>
              <th className="text-right px-3 py-2 font-normal">الحالة</th>
              <th className="text-right px-3 py-2 font-normal">المرجع</th>
              <th className="text-right px-3 py-2 font-normal">الوقت</th>
              <th className="text-left px-3 py-2 font-normal">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {!data && <tr><td colSpan={7} className="text-center text-gray-500 py-10">جارٍ التحميل…</td></tr>}
            {data && data.rows.length === 0 && <tr><td colSpan={7} className="text-center text-gray-600 py-10">لا مكافآت</td></tr>}
            {data?.rows.map(r => (
              <tr key={r.id} className="border-b border-gray-800/60 hover:bg-gray-700/20 transition">
                <td className="px-3 py-2 tabular-nums text-gray-500 text-[12px]">{r.id}</td>
                <td className="px-3 py-2">
                  <button onClick={() => r.playerId && openPlayer(r.playerId)} className="flex items-center gap-2 text-right">
                    <Avatar url={r.avatarUrl} name={r.playerName} size={26} />
                    <span className="text-[13px] text-white truncate max-w-[160px]">{r.playerName || `#${r.playerId ?? '—'}`}</span>
                  </button>
                </td>
                <td className="px-3 py-2 text-[13px] text-gray-200 whitespace-nowrap">{rewardText(r)}<span className="text-gray-600 text-[10.5px] mr-1">({r.period} · {r.seq})</span></td>
                <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                <td className="px-3 py-2 text-[12px] text-gray-400 max-w-[220px] truncate" title={rewardRef(r)}>{rewardRef(r)}{r.staffName ? <span className="text-gray-600"> · {r.staffName}</span> : null}</td>
                <td className="px-3 py-2 text-[12px] text-gray-400 whitespace-nowrap">{fmtDateTime(r.earnedAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 justify-end">
                    {r.status === 'available' && (
                      <button onClick={() => act(r.id, 'redeem')} disabled={busy === r.id} className="px-2 py-1 rounded-lg text-[11px] font-bold border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">✔ استخدام</button>
                    )}
                    {(r.status === 'available' || r.status === 'pending_choice') && (
                      <button onClick={() => act(r.id, 'void')} disabled={busy === r.id} className="px-2 py-1 rounded-lg text-[11px] font-bold border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">🚫 إلغاء</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {data && data.rows.length > 0 && (
            <tfoot>
              <tr className="text-[12px] text-gray-400 border-t border-gray-700/40">
                <td colSpan={7} className="px-3 py-2">
                  المستخدَم في هذه الصفحة: <b className="text-white tabular-nums">{totals.jod.toFixed(2)} د.أ</b> · <b className="text-amber-400 tabular-nums">{num(totals.chips)} 🪙</b>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-800/60 border border-gray-700/40 text-gray-300 disabled:opacity-30">السابق</button>
          <span className="text-xs text-gray-400 tabular-nums">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-800/60 border border-gray-700/40 text-gray-300 disabled:opacity-30">التالي</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// ⚙️ الإعدادات
// ══════════════════════════════════════════════════════
function setPath<T extends object>(obj: T, path: string[], value: any): T {
  if (!path.length) return value;
  const [k, ...rest] = path;
  return { ...(obj as any), [k]: setPath((obj as any)[k] ?? {}, rest, value) };
}
function getPath(obj: any, path: string[]): any { return path.reduce((o, k) => (o == null ? undefined : o[k]), obj); }

function SettingsTab({ config, locations, period, onSaved, toast }: {
  config: LoyaltyConfig; locations: Location[]; period: string; onSaved: (c: LoyaltyConfig) => void; toast: (k: 'ok' | 'err', t: string) => void;
}) {
  const [draft, setDraft] = useState<LoyaltyConfig>(() => JSON.parse(JSON.stringify(config)));
  const [cats, setCats] = useState<string>((config.rewards?.freeDrink?.categories || []).join('\n'));
  const [saving, setSaving] = useState(false);
  const [sim, setSim] = useState<{ hours: number; stamps: number; stampedPlayers: number; cards: number } | null>(null);
  const [simBusy, setSimBusy] = useState(false);

  useEffect(() => {
    setDraft(JSON.parse(JSON.stringify(config)));
    setCats((config.rewards?.freeDrink?.categories || []).join('\n'));
  }, [config]);

  const parsedCats = useMemo(() => cats.split(/[\n,،]/).map(s => s.trim()).filter(Boolean), [cats]);
  const payload = useMemo(() => {
    const { startedAt, disabledAt, ...rest } = draft;
    void startedAt; void disabledAt;
    return setPath(rest, ['rewards', 'freeDrink', 'categories'], parsedCats);
  }, [draft, parsedCats]);
  const baseline = useMemo(() => { const { startedAt, disabledAt, ...rest } = config; void startedAt; void disabledAt; return rest; }, [config]);
  const dirty = JSON.stringify(payload) !== JSON.stringify(baseline);

  const set = (path: string[], value: any) => setDraft(d => setPath(d, path, value));
  const g = (path: string[]) => getPath(draft, path);

  const save = async () => {
    if (!draft.rewards.freeVisit.enabled && !draft.rewards.freeDrink.enabled && !draft.rewards.chips.enabled) {
      return toast('err', 'فعّل نوع مكافأة واحداً على الأقلّ');
    }
    setSaving(true);
    try {
      const c = await api('/api/loyalty/admin/config', { method: 'PUT', body: JSON.stringify(payload) });
      onSaved(c);
      toast('ok', '💾 حُفظت الإعدادات ونُشرت');
    } catch (e: any) { toast('err', e.message || 'فشل الحفظ'); }
    finally { setSaving(false); }
  };

  const simulate = async () => {
    setSimBusy(true);
    try {
      const qs = new URLSearchParams({ period, hours: String(draft.minLeadHours) });
      const r = await api(`/api/loyalty/admin/simulate?${qs}`);
      setSim({ hours: r.hours, stamps: r.stamps, stampedPlayers: r.stampedPlayers, cards: r.cards });
    } catch (e: any) { toast('err', e.message || 'فشلت المعاينة'); }
    finally { setSimBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-800/40 border border-gray-700/50 rounded-3xl p-5 md:p-7">
        <h3 className="text-lg font-bold text-white mb-1">⚙️ قواعد البرنامج</h3>
        <p className="text-gray-400 text-sm mb-5">التغييرات تسري فور الحفظ على الأختام الجديدة؛ الأختام والمكافآت القائمة لا تُعاد حسبتها.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SettingCard icon="🔌" label="الميزة" control={<Toggle on={draft.enabled} onChange={v => set(['enabled'], v)} />}
            help="المفتاح الرئيس — حين يُطفأ لا يرى اللاعبون أيّ أثر للبرنامج." />

          <SettingCard icon="✦" label="أختام لكلّ مكافأة" control={<NumInput value={g(['stampsPerReward']) ?? 0} onChange={v => set(['stampsPerReward'], v)} min={1} max={20} />}
            help="حجم البطاقة: كم ختماً يلزم لإكمالها." />

          <SettingCard icon="⏳" label="الحدّ الأدنى للحجز المبكّر (ساعات)" control={<NumInput value={g(['minLeadHours']) ?? 0} onChange={v => set(['minLeadHours'], v)} min={0} max={168} />}
            help="الحجز يُحتسب ختماً إن سبق موعد الفعاليّة بهذا القدر.">
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[3, 6, 12, 24].map(h => (
                <button key={h} onClick={() => set(['minLeadHours'], h)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition ${draft.minLeadHours === h ? 'border-amber-400 text-amber-300 bg-amber-500/10' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>{h}س</button>
              ))}
              <span className="flex-1" />
              <button onClick={simulate} disabled={simBusy} className="text-[11px] px-2 py-0.5 rounded-full border border-sky-500/40 text-sky-300 hover:bg-sky-500/10 disabled:opacity-50">
                {simBusy ? '…' : `معاينة على ${periodLabel(period)}`}
              </button>
            </div>
            {sim && (
              <p className="text-[11.5px] text-sky-300 mt-2 tabular-nums">
                لو كان الحدّ {sim.hours}س: <b>{sim.stamps}</b> ختماً · <b>{sim.stampedPlayers}</b> لاعباً · <b>{sim.cards}</b> بطاقة
              </p>
            )}
          </SettingCard>

          <SettingCard icon="📲" label="قناة الحجز المحتسَبة"
            control={
              <select value={draft.channel} onChange={e => set(['channel'], e.target.value)} className={`${inputCls} py-1 text-xs`}>
                <option value="app">التطبيق فقط</option>
                <option value="app_bot">التطبيق أو بوت الواتساب</option>
                <option value="any">أيّ حجز مرتبط بالحساب</option>
              </select>
            }
            help="«التطبيق أو بوت الواتساب» يكافئ كلّ حجز ذاتيّ مبكّر (قرار إداريّ)؛ «أيّ حجز» يشمل ما يدخله الموظّف يدويّاً أيضاً." />

          <SettingCard icon="🎁" label="أقصى مكافآت في الشهر" control={<NumInput value={g(['maxRewardsPerMonth']) ?? 0} onChange={v => set(['maxRewardsPerMonth'], v)} min={1} max={20} />}
            help="بعد بلوغه تمتلئ البطاقة ولا تُمنح مكافآت جديدة حتّى الشهر التالي." />

          <SettingCard icon="📅" label="صلاحيّة المكافأة (أيّام)" control={<NumInput value={g(['rewardValidityDays']) ?? 0} onChange={v => set(['rewardValidityDays'], v)} min={1} max={365} />}
            help="من لحظة الاختيار حتّى انتهائها." />

          <SettingCard icon="🤔" label="مهلة الاختيار (أيّام)" control={<NumInput value={g(['chooseWindowDays']) ?? 0} onChange={v => set(['chooseWindowDays'], v)} min={1} max={60} />}
            help="كم يوماً يملك اللاعب لاختيار نوع المكافأة." />

          <SettingCard icon="🧪" label="استثناء حسابات الاختبار" control={<Toggle on={draft.excludeTestAccounts} onChange={v => set(['excludeTestAccounts'], v)} />}
            help="حسابات الاختبار لا تكسب أختاماً ولا تظهر في الإحصاءات." />

          <SettingCard icon="📍" label="الأماكن المشمولة"
            control={<span className="text-[11px] text-gray-500">{draft.locationIds.length ? `${draft.locationIds.length} مكان` : 'الكلّ'}</span>}
            help="بلا تحديد = كلّ الأماكن غير الاختباريّة.">
            <div className="flex flex-wrap gap-1.5 mt-2">
              {locations.filter(l => !l.isTestLocation).map(l => {
                const on = draft.locationIds.includes(l.id);
                return (
                  <label key={l.id} className={`text-[11px] px-2 py-0.5 rounded-full border cursor-pointer transition ${on ? 'border-amber-400 text-amber-300 bg-amber-500/10' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                    <input type="checkbox" className="hidden" checked={on}
                      onChange={e => set(['locationIds'], e.target.checked ? [...draft.locationIds, l.id] : draft.locationIds.filter(x => x !== l.id))} />
                    {l.name}
                  </label>
                );
              })}
              {locations.length === 0 && <span className="text-[11px] text-gray-600">لا أماكن</span>}
            </div>
          </SettingCard>
        </div>
      </div>

      {/* المكافآت */}
      <div className="bg-gray-800/40 border border-gray-700/50 rounded-3xl p-5 md:p-7">
        <h3 className="text-lg font-bold text-white mb-1">🎁 أنواع المكافآت</h3>
        <p className="text-gray-400 text-sm mb-5">يجب أن يبقى نوع واحد على الأقلّ مفعّلاً.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SettingCard icon="🎟️" label="زيارة مجّانيّة" control={<Toggle on={draft.rewards.freeVisit.enabled} onChange={v => set(['rewards', 'freeVisit', 'enabled'], v)} />}
            help="تُعفى رسوم المباراة من أوّل حجز تطبيق تالٍ — تلقائيّاً." />
          <SettingCard icon="☕" label="مشروب" control={<Toggle on={draft.rewards.freeDrink.enabled} onChange={v => set(['rewards', 'freeDrink', 'enabled'], v)} />}
            help="خصم على فاتورة المكان حتّى السقف.">
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] text-gray-500">السقف (د.أ)</span>
              <NumInput value={g(['rewards', 'freeDrink', 'capJod']) ?? 0} onChange={v => set(['rewards', 'freeDrink', 'capJod'], v)} min={0} step={0.25} />
            </div>
            <label className="block text-[11px] text-gray-500 mt-2 mb-1">الفئات المشمولة (سطر أو فاصلة لكلّ فئة — فارغ = الكلّ)</label>
            <textarea value={cats} onChange={e => setCats(e.target.value)} rows={3} placeholder={'مشروبات ساخنة\nعصائر'}
              className={`${inputCls} w-full text-xs`} />
          </SettingCard>
          <SettingCard icon="🪙" label="تشبس" control={<Toggle on={draft.rewards.chips.enabled} onChange={v => set(['rewards', 'chips', 'enabled'], v)} />}
            help="يُضاف للمحفظة فوراً عند الاختيار.">
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] text-gray-500">المقدار</span>
              <NumInput value={g(['rewards', 'chips', 'amount']) ?? 0} onChange={v => set(['rewards', 'chips', 'amount'], v)} min={1} />
            </div>
          </SettingCard>
        </div>
      </div>

      {/* التجربة والتذكيرات */}
      <div className="bg-gray-800/40 border border-gray-700/50 rounded-3xl p-5 md:p-7">
        <h3 className="text-lg font-bold text-white mb-1">🔔 الاحتفال والتذكيرات</h3>
        <p className="text-gray-400 text-sm mb-5">ما يراه اللاعب في تطبيقه وما يصله من إشعارات.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SettingCard icon="🎉" label="احتفال الختم" control={<Toggle on={draft.celebration.enabled} onChange={v => set(['celebration', 'enabled'], v)} />}
            help="مشهد قصير في التطبيق عند الحصول على ختم.">
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] text-gray-500">المدّة (ثوانٍ)</span>
              <input type="number" min={1} max={30} step={0.5} value={Math.round((draft.celebration.durationMs || 0) / 100) / 10}
                onChange={e => set(['celebration', 'durationMs'], Math.round(Number(e.target.value || 0) * 1000))}
                className="w-24 px-2 py-1 rounded-lg text-center font-bold bg-gray-950 border border-amber-500/30 text-amber-300 focus:outline-none tabular-nums" dir="ltr" />
            </div>
          </SettingCard>
          <SettingCard icon="⏰" label="تذكير قبل القطع" control={<Toggle on={draft.reminders.preCutoff.enabled} onChange={v => set(['reminders', 'preCutoff', 'enabled'], v)} />}
            help="إشعار لمن لم يحجز بعد، قبل انقضاء مهلة الختم.">
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] text-gray-500">الساعة (بتوقيت عمّان)</span>
              <NumInput value={g(['reminders', 'preCutoff', 'hourLocal']) ?? 0} onChange={v => set(['reminders', 'preCutoff', 'hourLocal'], v)} min={0} max={23} />
            </div>
          </SettingCard>
          <SettingCard icon="ℹ️" label="تنبيه الختم الفائت" control={<Toggle on={draft.reminders.missed.enabled} onChange={v => set(['reminders', 'missed', 'enabled'], v)} />}
            help="بعد ليلة لعب فيها بلا ختم: لماذا، وكيف يكسبه المرّة القادمة." />
          <SettingCard icon="🗓️" label="تذكير بداية الشهر" control={<Toggle on={draft.reminders.monthly.enabled} onChange={v => set(['reminders', 'monthly', 'enabled'], v)} />}
            help="بطاقة جديدة — أوّل كلّ شهر." />
          <SettingCard icon="⏳" label="تنبيه انتهاء المكافأة" control={<Toggle on={draft.reminders.expiring.enabled} onChange={v => set(['reminders', 'expiring', 'enabled'], v)} />}
            help="قبل انتهاء صلاحيّة مكافأة متاحة.">
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] text-gray-500">قبل (أيّام)</span>
              <NumInput value={g(['reminders', 'expiring', 'daysBefore']) ?? 0} onChange={v => set(['reminders', 'expiring', 'daysBefore'], v)} min={1} max={30} />
            </div>
          </SettingCard>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-gray-500">
          {config.startedAt ? `بدأ البرنامج ${fmtDateTime(config.startedAt)}` : 'لم يبدأ البرنامج بعد'}
          {dirty && <span className="text-amber-400 mr-2">· تعديلات غير محفوظة</span>}
        </p>
        <button onClick={save} disabled={!dirty || saving}
          className="px-8 py-3 bg-gradient-to-r from-amber-500 to-rose-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-amber-500/20 transition-all disabled:opacity-50 flex items-center gap-2">
          {saving ? 'جارٍ الحفظ…' : '💾 حفظ ونشر'}
        </button>
      </div>
    </div>
  );
}

function NumInput({ value, onChange, min, max, step }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input type="number" value={value} min={min} max={max} step={step}
      onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      className="w-24 px-2 py-1 rounded-lg text-center font-bold bg-gray-950 border border-amber-500/30 text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 tabular-nums" dir="ltr" />
  );
}

function SettingCard({ icon, label, control, help, children }: { icon: string; label: string; control: ReactNode; help: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 p-4 bg-gray-900/50 rounded-2xl border border-gray-700/30 hover:border-gray-600/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl">{icon}</span>
          <span className="font-bold text-sm text-gray-200">{label}</span>
        </div>
        {control}
      </div>
      <p className="text-[11px] text-gray-500">{help}</p>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} role="switch" aria-checked={on}
      className="relative w-11 h-6 rounded-full border transition-all shrink-0"
      style={{ background: on ? '#f59e0b' : 'rgba(31,41,55,.9)', borderColor: on ? 'rgba(251,191,36,.7)' : 'rgba(75,85,99,.6)' }}>
      <span className="absolute top-0.5 rounded-full bg-white shadow transition-all" style={{ width: 18, height: 18, right: on ? 2 : 22 }} />
    </button>
  );
}
