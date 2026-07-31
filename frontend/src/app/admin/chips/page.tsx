'use client';

// ══════════════════════════════════════════════════════
// 🪙 اقتصاد التشبس — لوحة الإدارة (المرحلة 0)
// شحن بالباقات المعتمدة · تصحيح يدوي · أرصدة · الدفتر · تدقيق
// ══════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';
import DynamicMafiaCard from '@/components/DynamicMafiaCard';
import { ChipsEmblem, type EmblemId } from '@/components/ChipsEmblems';
import FxEditor from '@/components/effects/FxEditor';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }

async function apiGet(path: string) {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  const data = await res.json().catch(() => ({}));
  // ⚠️ نُرفق حمولة الخادم بالخطأ: الرسالة وحدها تُضيّع اسم الحقل المرفوض
  //    الذي يعيده المُطبِّع، فلا تستطيع الواجهة تمييزه للمؤلّف.
  if (!res.ok) throw Object.assign(new Error(data?.error || `API ${res.status}`), { body: data, status: res.status });
  return data;
}
async function apiPost(path: string, body: any) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  // ⚠️ نُرفق حمولة الخادم بالخطأ: الرسالة وحدها تُضيّع اسم الحقل المرفوض
  //    الذي يعيده المُطبِّع، فلا تستطيع الواجهة تمييزه للمؤلّف.
  if (!res.ok) throw Object.assign(new Error(data?.error || `API ${res.status}`), { body: data, status: res.status });
  return data;
}

const REASON_LABEL: Record<string, string> = {
  admin_topup: '💵 شحن إداري',
  admin_adjust: '✏️ تصحيح يدوي',
  drop_win: '🏆 قطرة فوز',
  drop_top3: '🥉 قطرة توب-3',
  drop_first_match: '🎉 أول مباراة',
  reward_top3: '🏅 مكافأة توب-3',
  reward_birthday: '🎂 هديّة ميلاد',
  rent_item: '🛒 استئجار عنصر',
  renew_item: '🔄 تجديد إيجار',
  refund: '↩️ استرجاع',
  gift_in: '🎁 إهداء وارد',
  gift_out: '🎁 إهداء صادر',
};

function newRequestId() {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

function fmtDT(ts: string) {
  const d = new Date(ts);
  return `${d.toLocaleDateString('ar-JO', { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' })}`;
}

interface PlayerRow { id: number; name: string; phone: string; avatarUrl?: string | null; rankTier?: string; balance: number }
interface Pack { id: string; jod: number; chips: number; labelAr: string }

async function apiPut(path: string, body: any) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  // ⚠️ نُرفق حمولة الخادم بالخطأ: الرسالة وحدها تُضيّع اسم الحقل المرفوض
  //    الذي يعيده المُطبِّع، فلا تستطيع الواجهة تمييزه للمؤلّف.
  if (!res.ok) throw Object.assign(new Error(data?.error || `API ${res.status}`), { body: data, status: res.status });
  return data;
}

const KIND_LABEL: Record<string, string> = {
  frame: '🃏 إطار', title: '🏷️ لقب', name_fx: '✨ تأثير اسم', entrance: '🚪 تشريفة دخول',
  elimination: '🔥 إقصاء', victory_sting: '🔊 نغمة نصر', xp_boost: '⚡ معزّز',
};

export default function ChipsAdminPage() {
  const [tab, setTab] = useState<'topup' | 'ledger' | 'catalog' | 'rewards' | 'inventory' | 'report'>('topup');
  const [stats, setStats] = useState<any>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // ⚠️ مُثبَّتة الهوية عمداً: كانت تُعاد إنشاؤها عند كل رسم، وهي تبعية لـ
  //    useCallback داخل تبويب المكافآت — فكل تنبيه (بل واختفاؤه بعد ٤ ثوانٍ)
  //    كان يُعيد إطلاق التحميل بلا معرّف موسم، فيرتدّ اختيار الموسم إلى
  //    الافتراضي وتُدهس المبالغ التي كتبها المشغّل. المُثبِّت يقطع الحلقة.
  const showToast = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadStats = useCallback(() => {
    apiGet('/api/chips/admin/stats').then(d => setStats(d.stats)).catch(() => {});
  }, []);

  useEffect(() => {
    loadStats();
    apiGet('/api/chips/admin/packs').then(d => setPacks(d.packs || [])).catch(() => {});
  }, [loadStats]);

  return (
    <div dir="rtl" className="pb-10">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">🪙 اقتصاد التشبس</h1>
          <p className="text-sm text-gray-500 mt-1">
            المحفظة والدفتر — الدفتر مصدر الحقيقة الوحيد وكل حركة موثّقة بمفتاح لا يقبل التكرار.
            الشحن بالباقات المعتمدة حصراً.
          </p>
        </div>
        <AuditButton onDone={(msg, ok) => { showToast(ok ? 'ok' : 'err', msg); loadStats(); }} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Kpi label="قيد التداول" value={stats?.circulating} unit="🪙" tone="amber" hint="مجموع أرصدة اللاعبين الآن" />
        <Kpi label="إجمالي المُصدَر" value={stats?.issued} unit="🪙" tone="emerald" hint="كل ما دخل النظام" />
        <Kpi label="إجمالي المصروف" value={stats?.spent} unit="🪙" tone="rose" hint="كل ما خرج من المحافظ" />
        <Kpi label="حاملو رصيد" value={stats?.holders} unit="لاعب" tone="sky" hint="أرصدتهم > 0" />
        <Kpi label="إيراد الشحن" value={stats?.topupJod} unit="د.أ" tone="violet" hint="مشتقّ من الباقات المسجَّلة" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 border-b border-gray-700/40">
        {([['topup', '💵 الشحن والأرصدة'], ['rewards', '🎁 المكافآت'], ['catalog', '🏦 كتالوج الخزنة'], ['inventory', '📊 المخزون'], ['ledger', '📒 الدفتر'], ['report', '📈 التقرير']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-bold transition-all border-b-2 -mb-px ${
              tab === k ? 'text-amber-400 border-amber-400' : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'topup' && <TopupView packs={packs} onChanged={loadStats} toast={showToast} />}
      {tab === 'rewards' && <RewardsView toast={showToast} onChanged={loadStats} />}
      {tab === 'catalog' && <CatalogView toast={showToast} />}
      {tab === 'inventory' && <InventoryView toast={showToast} />}
      {tab === 'ledger' && <LedgerView toast={showToast} />}
      {tab === 'report' && <ReportView toast={showToast} />}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl border text-sm font-bold shadow-2xl ${
          toast.kind === 'ok' ? 'bg-emerald-900/90 border-emerald-500/50 text-emerald-200' : 'bg-rose-900/90 border-rose-500/50 text-rose-200'
        }`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ── بطاقة مؤشّر ──────────────────────────────────────
function Kpi({ label, value, unit, tone, hint }: { label: string; value: any; unit: string; tone: string; hint: string }) {
  const tones: Record<string, string> = {
    amber: 'text-amber-400', emerald: 'text-emerald-400', rose: 'text-rose-400', sky: 'text-sky-400', violet: 'text-violet-400',
  };
  return (
    <div className="bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4" title={hint}>
      <p className="text-[11px] text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${tones[tone] || 'text-white'}`}>
        {value == null ? '—' : Number(value).toLocaleString('en-US')}
        <span className="text-xs font-normal text-gray-500 mr-1">{unit}</span>
      </p>
    </div>
  );
}

// ── زر التدقيق ───────────────────────────────────────
function AuditButton({ onDone }: { onDone: (msg: string, ok: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const run = async (fix: boolean) => {
    setBusy(true);
    try {
      const d = await apiGet(`/api/chips/admin/audit${fix ? '?fix=1' : ''}`);
      const n = (d.drifted || []).length;
      if (n === 0) onDone(`✅ التدقيق سليم — ${d.checked} لاعباً، لا انحراف بين الكاش والدفتر`, true);
      else if (fix) onDone(`🔧 أُصلح ${d.fixed} رصيداً منحرفاً بإعادة الاشتقاق من الدفتر`, true);
      else onDone(`⚠️ ${n} رصيداً منحرفاً عن الدفتر — اضغط «إصلاح» لإعادة الاشتقاق`, false);
    } catch (e: any) {
      onDone(e.message || 'فشل التدقيق', false);
    } finally { setBusy(false); }
  };
  return (
    <div className="flex gap-2">
      <button onClick={() => run(false)} disabled={busy}
        className="px-3 py-2 rounded-lg text-xs font-bold bg-gray-800/60 border border-gray-700/40 text-gray-300 hover:bg-gray-700/60 transition-all disabled:opacity-50">
        🔍 تدقيق الأرصدة
      </button>
      <button onClick={() => run(true)} disabled={busy}
        className="px-3 py-2 rounded-lg text-xs font-bold bg-amber-900/40 border border-amber-600/40 text-amber-300 hover:bg-amber-900/60 transition-all disabled:opacity-50">
        🔧 إصلاح
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 💵 الشحن والأرصدة
// ══════════════════════════════════════════════════════
function TopupView({ packs, onChanged, toast }: { packs: Pack[]; onChanged: () => void; toast: (k: 'ok' | 'err', t: string) => void }) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PlayerRow | null>(null);
  const [packId, setPackId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId());

  // وضع التصحيح اليدوي
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');

  const load = useCallback(async (s: string) => {
    setLoading(true);
    try {
      const d = await apiGet(`/api/chips/admin/balances?limit=50${s ? `&search=${encodeURIComponent(s)}` : ''}`);
      setRows(d.players || []);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(''); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  // 🔑 معرّف طلب جديد عند تبديل اللاعب.
  //    المفتاح صار مربوطاً باللاعب والباقة في الخادم، لكن تجديده هنا يمنع
  //    أيضاً ظهور رسالة «مُنفَّذة سابقاً» المربكة حين يعيد الموظّف المحاولة
  //    لزبون آخر بعد ردّ ضائع.
  useEffect(() => { setRequestId(newRequestId()); }, [selected?.id]);

  const doTopup = async () => {
    if (!selected || !packId) return;
    setBusy(true);
    try {
      const d = await apiPost('/api/chips/admin/topup', {
        playerId: selected.id, packId, note: note || undefined, requestId,
      });
      if (d.duplicate) {
        toast('ok', `↩️ هذه العملية مُنفَّذة سابقاً — الرصيد ${d.balance} 🪙 (لم يتكرر الخصم)`);
      } else {
        toast('ok', `✅ شُحن ${d.pack?.chips} 🪙 لـ ${selected.name} — الرصيد الآن ${d.balance} 🪙`);
      }
      setRequestId(newRequestId());   // مفتاح جديد للعملية التالية
      setPackId(''); setNote('');
      setSelected(s => (s ? { ...s, balance: d.balance } : s));
      load(search); onChanged();
    } catch (e: any) {
      toast('err', e.message || 'فشل الشحن');
    } finally { setBusy(false); }
  };

  const doAdjust = async () => {
    if (!selected) return;
    const amount = parseInt(adjAmount);
    if (!amount || isNaN(amount)) { toast('err', 'أدخل قيمة موجبة أو سالبة'); return; }
    if (adjNote.trim().length < 3) { toast('err', 'الملاحظة إلزامية للتصحيح اليدوي'); return; }
    setBusy(true);
    try {
      const d = await apiPost('/api/chips/admin/adjust', {
        playerId: selected.id, amount, note: adjNote, requestId,
      });
      toast('ok', d.duplicate
        ? `↩️ العملية مُنفَّذة سابقاً — الرصيد ${d.balance} 🪙`
        : `✅ ${amount > 0 ? 'أُضيف' : 'خُصم'} ${Math.abs(amount)} 🪙 — الرصيد الآن ${d.balance} 🪙`);
      setRequestId(newRequestId());
      setAdjAmount(''); setAdjNote(''); setAdjustOpen(false);
      setSelected(s => (s ? { ...s, balance: d.balance } : s));
      load(search); onChanged();
    } catch (e: any) {
      toast('err', e.message || 'فشل التصحيح');
    } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
      {/* قائمة اللاعبين */}
      <div className="bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-bold text-gray-300">أرصدة اللاعبين</h2>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو الهاتف…"
            className="w-56 bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-500 border-b border-gray-700/40">
                <th className="text-right py-2 px-2 font-medium">اللاعب</th>
                <th className="text-right py-2 px-2 font-medium">الهاتف</th>
                <th className="text-left py-2 px-2 font-medium">الرصيد</th>
                <th className="py-2 px-2" />
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4} className="py-8 text-center text-gray-600 text-xs">جارٍ التحميل…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-gray-600 text-xs">لا نتائج</td></tr>}
              {!loading && rows.map(p => (
                <tr key={p.id} className={`border-b border-gray-800/50 hover:bg-gray-700/20 transition-colors ${selected?.id === p.id ? 'bg-amber-900/15' : ''}`}>
                  <td className="py-2 px-2 text-gray-200">{p.name} <span className="text-gray-600 text-[10px]">#{p.id}</span></td>
                  <td className="py-2 px-2 text-gray-500 text-xs" dir="ltr">{p.phone}</td>
                  <td className="py-2 px-2 text-left tabular-nums font-bold text-amber-400">{Number(p.balance || 0).toLocaleString('en-US')} 🪙</td>
                  <td className="py-2 px-2 text-left">
                    <button onClick={() => { setSelected(p); setAdjustOpen(false); }}
                      className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-900/30 border border-amber-600/40 text-amber-300 hover:bg-amber-900/50 transition-all">
                      اختيار
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* لوحة الشحن */}
      <div className="bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4 h-fit lg:sticky lg:top-4">
        <h2 className="text-sm font-bold text-gray-300 mb-3">💵 شحن رصيد</h2>

        {!selected ? (
          <p className="text-xs text-gray-600 py-8 text-center">اختر لاعباً من القائمة للبدء</p>
        ) : (
          <>
            <div className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-3 mb-4">
              <p className="text-gray-200 font-bold">{selected.name}</p>
              <p className="text-[11px] text-gray-500" dir="ltr">{selected.phone}</p>
              <p className="text-lg font-black text-amber-400 tabular-nums mt-1">
                {Number(selected.balance || 0).toLocaleString('en-US')} 🪙
                <span className="text-[10px] font-normal text-gray-600 mr-2">الرصيد الحالي</span>
              </p>
            </div>

            {!adjustOpen ? (
              <>
                <p className="text-[11px] text-gray-500 mb-2">الباقات المعتمدة (الشحن بالباقات حصراً)</p>
                <div className="space-y-2 mb-4">
                  {packs.map(p => (
                    <button key={p.id} onClick={() => setPackId(p.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${
                        packId === p.id
                          ? 'bg-amber-900/30 border-amber-500/60 text-amber-200'
                          : 'bg-gray-900/50 border-gray-700/40 text-gray-300 hover:border-gray-600'
                      }`}>
                      <span className="font-bold">{p.jod} د.أ</span>
                      <span className="tabular-nums font-black">{p.chips} 🪙</span>
                    </button>
                  ))}
                </div>

                <input
                  value={note} onChange={e => setNote(e.target.value)}
                  placeholder="ملاحظة (اختيارية)"
                  className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 mb-3"
                />

                <button onClick={doTopup} disabled={!packId || busy}
                  className="w-full py-2.5 rounded-xl font-bold text-sm bg-amber-600 hover:bg-amber-500 text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  {busy ? 'جارٍ التنفيذ…' : '💵 تأكيد الشحن'}
                </button>

                <button onClick={() => setAdjustOpen(true)}
                  className="w-full mt-2 py-2 rounded-xl font-bold text-xs bg-gray-800/60 border border-gray-700/40 text-gray-400 hover:text-gray-200 transition-all">
                  ✏️ تصحيح يدوي بدل الشحن
                </button>
              </>
            ) : (
              <>
                <p className="text-[11px] text-gray-500 mb-2">تصحيح يدوي — موجب للإضافة، سالب للخصم</p>
                <input
                  value={adjAmount} onChange={e => setAdjAmount(e.target.value)}
                  placeholder="مثال: 10  أو  -5" inputMode="numeric"
                  className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 mb-2 tabular-nums"
                />
                <input
                  value={adjNote} onChange={e => setAdjNote(e.target.value)}
                  placeholder="سبب التصحيح (إلزامي)"
                  className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 mb-3"
                />
                <button onClick={doAdjust} disabled={busy}
                  className="w-full py-2.5 rounded-xl font-bold text-sm bg-violet-600 hover:bg-violet-500 text-white transition-all disabled:opacity-40">
                  {busy ? 'جارٍ التنفيذ…' : '✏️ تنفيذ التصحيح'}
                </button>
                <button onClick={() => setAdjustOpen(false)}
                  className="w-full mt-2 py-2 rounded-xl font-bold text-xs bg-gray-800/60 border border-gray-700/40 text-gray-400 hover:text-gray-200 transition-all">
                  رجوع للشحن بالباقات
                </button>
              </>
            )}

            <p className="text-[10px] text-gray-600 mt-3 leading-relaxed">
              🔒 كل عملية تحمل مفتاحاً فريداً — لو ضغطت مرتين لا يتكرر الشحن.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🎁 المكافآت — أفضل ثلاثة + عيديّة الميلاد
// ══════════════════════════════════════════════════════
function RewardsView({ toast, onChanged }: { toast: (k: 'ok' | 'err', t: string) => void; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [seasonId, setSeasonId] = useState<string>('');
  const [amounts, setAmounts] = useState<string[]>(['100', '100', '100']);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId());
  const [bdays, setBdays] = useState<any>(null);
  const [cfg, setCfg] = useState<any>(null);

  const loadTop = useCallback(async (sid?: string) => {
    try {
      const d = await apiGet(`/api/chips/admin/rewards/top3${sid ? `?seasonId=${sid}` : ''}`);
      setData(d);
      if (!sid && d.season) setSeasonId(String(d.season.id));
      if (d.config) {
        setCfg(d.config);
        setAmounts((d.config.top3?.amounts || [100, 100, 100]).map((n: any) => String(n)));
      }
    } catch (e: any) { toast('err', e.message || 'تعذّر جلب الترتيب'); }
  }, [toast]);

  const loadBdays = useCallback(async () => {
    try { setBdays(await apiGet('/api/chips/admin/rewards/birthdays')); } catch { /* تجاهل */ }
  }, []);

  useEffect(() => { loadTop(); loadBdays(); }, [loadTop, loadBdays]);

  // 🎁 المنح. المفتاح حتميّ في الخادم، فالنقر المزدوج لا يدفع مرتين.
  //    والمنح المتعمّد ثانيةً يحتاج كتابة كلمة «تأكيد» — لا نقرة زائدة.
  const grant = async (repeat = false) => {
    if (!data?.season) return;
    const names = (data.top || []).map((p: any, i: number) => `${p.name} (${amounts[i] || 0} 🪙)`).join('، ');
    const total = amounts.reduce((s, a) => s + (Number(a) || 0), 0);

    if (repeat) {
      const typed = prompt(
        `⚠️ منح متعمّد **مرة أخرى** لموسم «${data.season.name}».\n\n`
        + `${names}\nالإجمالي: ${total} 🪙\n\n`
        + `هؤلاء استلموا مكافأة هذا الموسم سابقاً. للمتابعة اكتب: تأكيد`,
      );
      if (String(typed || '').trim() !== 'تأكيد') return;
    } else if (!confirm(`منح مكافأة «${data.season.name}»؟\n\n${names}\nالإجمالي: ${total} 🪙\n\nسيصل إشعار لكل واحد منهم.`)) {
      return;
    }

    setBusy(true);
    try {
      const d = await apiPost('/api/chips/admin/rewards/top3', {
        seasonId: data.season.id,
        amounts: amounts.map(a => Number(a) || 0),
        requestId,
        ...(repeat ? { allowRepeat: true } : {}),
      });
      setRequestId(newRequestId());
      const fresh = (d.results || []).filter((r: any) => r.ok && !r.duplicate);
      const skipped = (d.results || []).filter((r: any) => r.skipped);
      toast('ok', fresh.length
        ? `✅ مُنحت ${d.totalGranted} 🪙 لـ ${fresh.length} لاعبين`
        : skipped.length
          ? `↩️ لم يُمنح شيء — ${skipped.length} استلموا هذا الموسم سابقاً`
          : '↩️ هذه العملية مُنفَّذة سابقاً');
      loadTop(seasonId); onChanged();
    } catch (e: any) { toast('err', e.message || 'فشل المنح'); }
    finally { setBusy(false); }
  };

  const saveCfg = async (patch: any) => {
    try {
      const d = await apiPut('/api/chips/admin/rewards/config', patch);
      setCfg(d.config);
      toast('ok', '✅ حُفظت الإعدادات');
      loadBdays();
    } catch (e: any) { toast('err', e.message || 'فشل الحفظ'); }
  };

  const runBdays = async (playerId?: number) => {
    setBusy(true);
    try {
      const d = await apiPost('/api/chips/admin/rewards/birthdays/run', playerId ? { playerId } : {});
      const fresh = (d.granted || []).filter((g: any) => !g.duplicate);
      toast(fresh.length ? 'ok' : 'err', fresh.length ? `🎂 مُنحت العيديّة لـ ${fresh.length}` : 'لا أحد يستحق الآن (أو مُنحت مسبقاً)');
      loadBdays(); onChanged();
    } catch (e: any) { toast('err', e.message || 'فشل المنح'); }
    finally { setBusy(false); }
  };

  const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : '🥉');

  return (
    <div className="space-y-5">
      {/* ── أفضل ثلاثة ── */}
      <div className="bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-sm font-bold text-gray-300">🏆 مكافأة أفضل ثلاثة في الموسم</h2>
          <select
            value={seasonId}
            onChange={e => { setSeasonId(e.target.value); loadTop(e.target.value); }}
            className="bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
          >
            {(data?.seasons || []).map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.type === 'ONLINE' ? '🌐 أونلاين' : s.type === 'TOURNAMENT' ? '🏆 بطولة' : '⭐ عادي'} — {s.name}{s.status === 'ACTIVE' ? ' (نشط)' : ''}
              </option>
            ))}
          </select>
        </div>

        <p className="text-[11px] text-gray-500 mb-3">
          الترتيب محسوب <b>بنفس معادلة صفحة التصنيف</b> (وزن الرتبة ← الرانك ← المستوى) لهذا الموسم تحديداً.
        </p>

        {!data?.season && <p className="text-center text-gray-600 text-xs py-6">اختر موسماً</p>}

        {data?.top?.length === 0 && data?.season && (
          <p className="text-center text-gray-600 text-xs py-6">لا لاعبين في هذا الموسم بعد</p>
        )}

        <div className="space-y-2">
          {(data?.top || []).map((p: any, i: number) => (
            <div key={p.playerId} className="flex items-center gap-3 bg-gray-900/50 border border-gray-700/40 rounded-xl p-3">
              <span className="text-2xl">{medal(p.rank)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-gray-200 font-bold text-sm">
                  {p.name}
                  {p.isTestAccount && <span className="text-[9px] text-amber-400 mr-2 px-1.5 py-0.5 rounded border border-amber-600/40">حساب اختبار</span>}
                  {p.alreadyGranted && <span className="text-[9px] text-emerald-400 mr-2 px-1.5 py-0.5 rounded border border-emerald-600/40">✔︎ استلم هذا الموسم</span>}
                </p>
                <p className="text-[10px] text-gray-500">
                  {p.rankTier} · {p.rankRR} RR · مستوى {p.level} · {p.totalMatches} مباراة
                </p>
              </div>
              <div className="flex items-center gap-1">
                <input
                  value={amounts[i] ?? ''}
                  onChange={e => setAmounts(a => { const n = [...a]; n[i] = e.target.value; return n; })}
                  className="w-20 bg-gray-900/70 border border-gray-700/40 rounded-lg px-2 py-1.5 text-sm text-white tabular-nums text-center focus:outline-none focus:border-amber-500"
                />
                <span className="text-amber-400 text-sm">🪙</span>
              </div>
            </div>
          ))}
        </div>

        {data?.guardUnavailable && (
          <div className="mt-3 rounded-xl px-3 py-2 text-[11px] font-bold bg-rose-950/40 border border-rose-700/40 text-rose-300">
            ⚠️ تعذّر التحقّق من «مُنح سابقاً» لهذا الموسم — المنح موقوف حتى ينجح الفحص، منعاً لدفع مزدوج. أعد التحميل.
          </div>
        )}
        {(data?.top?.length || 0) > 0 && (() => {
          const eligible = (data.top || []).filter((_: any, i: number) => (Number(amounts[i]) || 0) > 0);
          const allPaid = eligible.length > 0 && eligible.every((p: any) => p.alreadyGranted === true);
          if (data?.guardUnavailable) return null;   // لا زرّ منح ونحن لا نعرف من استلم
          return (
            <div className="flex items-center gap-2 mt-4">
              {allPaid ? (
                <button onClick={() => grant(true)} disabled={busy}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-gray-800/60 border border-rose-700/40 text-rose-300 hover:bg-rose-950/40 transition-all disabled:opacity-40">
                  {busy ? 'جارٍ المنح…' : '♻️ مُنحت سابقاً — امنح مرة أخرى (تأكيد مكتوب)'}
                </button>
              ) : (
                <button onClick={() => grant(false)} disabled={busy}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-amber-600 hover:bg-amber-500 text-black transition-all disabled:opacity-40">
                  {busy ? 'جارٍ المنح…' : '🎁 امنح المكافأة الآن'}
                </button>
              )}
              <button onClick={() => saveCfg({ top3: { amounts: amounts.map(a => Number(a) || 0) } })}
                className="px-4 py-2.5 rounded-xl font-bold text-xs bg-gray-800/60 border border-gray-700/40 text-gray-300">
                💾 احفظ كافتراضي
              </button>
            </div>
          );
        })()}
        <p className="text-[10px] text-gray-600 mt-2">🔒 المفتاح حتميّ لكل (موسم + لاعب) — الضغط مرّتين لا يدفع مرّتين. ومن استلم يظهر بعلامة ✔︎، والمنح المتعمّد ثانيةً يحتاج كتابة «تأكيد».</p>
      </div>

      {/* ── 💧 قطرات نهاية المباراة ── */}
      <div className="bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <h2 className="text-sm font-bold text-gray-300">💧 قطرات نهاية المباراة</h2>
          <label className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer">
            <input type="checkbox" checked={cfg?.drops?.enabled !== false}
              onChange={e => saveCfg({ drops: { enabled: e.target.checked } })}
              className="accent-amber-500" />
            مفعّلة
          </label>
        </div>
        <p className="text-[11px] text-gray-500 mb-3">
          هذه هي <b>أكبر صنبور إصدار</b> في الاقتصاد. المواسم العادية فقط، وغير الاختبارية.
          كانت أرقاماً مُصرَّفة في الكود — ضبطها كان يحتاج نشرة.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {([['win', '🏆 فوز'], ['top3', '🥉 أفضل ثلاثة'], ['firstMatch', '🎉 أول مباراة']] as const).map(([k, label]) => (
            <div key={k}>
              <label className="block text-[11px] text-gray-500 mb-1">{label}</label>
              <input type="number" min={0} max={100}
                value={String(cfg?.drops?.[k] ?? '')}
                onChange={e => setCfg((c: any) => ({ ...c, drops: { ...(c?.drops || {}), [k]: Number(e.target.value) } }))}
                onBlur={e => saveCfg({ drops: { [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } })}
                className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-2 py-2 text-sm text-white tabular-nums focus:outline-none focus:border-amber-500" />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-600 mt-2">
          يُحفظ عند مغادرة الحقل. صفر = تعطيل تلك القطرة وحدها. الحدّ الأقصى ١٠٠ لكل قطرة.
        </p>
      </div>

      {/* ── عيديّة الميلاد ── */}
      <div className="bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-sm font-bold text-gray-300">🎂 عيديّة الميلاد</h2>
          <span className="text-[11px] text-gray-500">اليوم: {bdays?.today || '—'}</span>
        </div>

        {cfg && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">مبلغ العيديّة 🪙</label>
              <input
                defaultValue={cfg.birthday?.amount}
                onBlur={e => saveCfg({ birthday: { amount: Number(e.target.value) || 0 } })}
                className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white tabular-nums focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">التشغيل التلقائي</label>
              <button
                onClick={() => saveCfg({ birthday: { enabled: !cfg.birthday?.enabled } })}
                className={`w-full py-2 rounded-lg text-xs font-bold border transition-all ${
                  cfg.birthday?.enabled
                    ? 'bg-emerald-900/30 border-emerald-600/40 text-emerald-300'
                    : 'bg-gray-800/60 border-gray-700/40 text-gray-400'
                }`}>
                {cfg.birthday?.enabled ? '✅ يعمل تلقائياً' : '⏸ متوقف'}
              </button>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">نص الإشعار (متغيّر {'{العدد}'})</label>
              <input
                defaultValue={cfg.birthday?.messageBody}
                onBlur={e => saveCfg({ birthday: { messageBody: e.target.value } })}
                className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          {(bdays?.birthdays || []).length === 0 && (
            <p className="text-center text-gray-600 text-xs py-4">لا أعياد ميلاد اليوم</p>
          )}
          {(bdays?.birthdays || []).map((b: any) => (
            <div key={b.playerId} className="flex items-center gap-3 bg-gray-900/50 border border-gray-700/40 rounded-xl p-3">
              <span className="text-xl">🎂</span>
              <div className="flex-1 min-w-0">
                <p className="text-gray-200 font-bold text-sm">
                  {b.name}
                  {b.isTestAccount && <span className="text-[9px] text-amber-400 mr-2">اختبار</span>}
                </p>
                <p className="text-[10px] text-gray-500">{b.dob} · الرصيد {b.balance} 🪙</p>
              </div>
              {b.alreadyGranted ? (
                <span className="text-[11px] text-emerald-400 font-bold">✅ استلمها</span>
              ) : (
                <button onClick={() => runBdays(b.playerId)} disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-900/30 border border-amber-600/40 text-amber-300 disabled:opacity-40">
                  امنح الآن
                </button>
              )}
            </div>
          ))}
        </div>

        {(bdays?.birthdays || []).some((b: any) => !b.alreadyGranted) && (
          <button onClick={() => runBdays()} disabled={busy}
            className="w-full mt-3 py-2.5 rounded-xl font-bold text-sm bg-amber-600 hover:bg-amber-500 text-black transition-all disabled:opacity-40">
            🎁 امنح الجميع
          </button>
        )}

        <p className="text-[10px] text-gray-600 mt-3 leading-relaxed">
          الفحص التلقائي يعمل كل 30 دقيقة بتوقيت الأردن، ومفتاح الحركة السنوي يضمن <b>عيديّة واحدة لكل لاعب في السنة</b>
          مهما تكرّر الفحص أو أُعيد تشغيل الخادم.
        </p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🏦 كتالوج الخزنة — السعر والمدة والعرض والإغلاق النهائي
// ══════════════════════════════════════════════════════
function CatalogView({ toast }: { toast: (k: 'ok' | 'err', t: string) => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Record<number, { priceChips: string; durationDays: string }>>({});
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet('/api/chips/items');
      setItems(d.items || []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (item: any, patch: any, label: string) => {
    setBusy(item.id);
    try {
      await apiPut(`/api/chips/items/${item.id}`, patch);
      toast('ok', `✅ ${label} — ${item.nameAr}`);
      load();
    } catch (e: any) {
      toast('err', e.message || 'فشل الحفظ');
    } finally { setBusy(null); }
  };

  const closeForever = async (item: any) => {
    if (!confirm(`إغلاق «${item.nameAr}» نهائياً؟\n\nلن يعود للمتجر أبداً — والإيجارات الجارية تُكمل مدتها. هذا القرار لا رجعة فيه.`)) return;
    await save(item, { close: true, isActive: false }, '🔒 أُغلق نهائياً');
  };

  const grouped = items.reduce((acc: Record<string, any[]>, it: any) => {
    (acc[it.kind] = acc[it.kind] || []).push(it);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* ➕ إضافة عنصر جديد */}
      <AddItemPanel onCreated={() => { load(); toast('ok', '✅ أُضيف العنصر للخزنة'); }} toast={toast} />

      <div className="bg-amber-950/20 border border-amber-700/30 rounded-2xl p-3">
        <p className="text-xs text-amber-300/90 leading-relaxed">
          ⏳ كل عنصر <b>يُستأجر</b> لمدته المعلنة — لا تملّك أبدي. تغيير السعر يسري على العمليات الجديدة فقط،
          والإيجارات الجارية تُكمل مدتها. «الإغلاق النهائي» يخدم ندرة العناصر الموسمية ولا رجعة فيه.
        </p>
      </div>

      {loading && <p className="text-center text-gray-600 text-xs py-10">جارٍ التحميل…</p>}

      {Object.entries(grouped).map(([kind, list]) => (
        <div key={kind} className="bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-gray-300 mb-3">{KIND_LABEL[kind] || kind}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-gray-500 border-b border-gray-700/40">
                  <th className="text-right py-2 px-2 font-medium">العنصر</th>
                  <th className="text-right py-2 px-2 font-medium">الندرة</th>
                  <th className="text-right py-2 px-2 font-medium">السعر 🪙</th>
                  <th className="text-right py-2 px-2 font-medium">المدة (يوم)</th>
                  <th className="text-right py-2 px-2 font-medium">الحالة</th>
                  <th className="py-2 px-2" />
                </tr>
              </thead>
              <tbody>
                {(list as any[]).map(it => {
                  const e = edit[it.id] || { priceChips: String(it.priceChips), durationDays: String(it.durationDays) };
                  const dirty = Number(e.priceChips) !== it.priceChips || Number(e.durationDays) !== it.durationDays;
                  return (
                    <tr key={it.id} className="border-b border-gray-800/50">
                      <td className="py-2 px-2 text-gray-200">
                        {it.nameAr}
                        <span className="block text-[10px] text-gray-600" dir="ltr">{it.itemKey}</span>
                      </td>
                      <td className="py-2 px-2 text-gray-500 text-xs">{it.rarity}</td>
                      <td className="py-2 px-2">
                        <input value={e.priceChips} disabled={!it.isPurchasable}
                          onChange={ev => setEdit(p => ({ ...p, [it.id]: { ...e, priceChips: ev.target.value } }))}
                          className="w-20 bg-gray-900/70 border border-gray-700/40 rounded-lg px-2 py-1 text-xs text-white tabular-nums disabled:opacity-40" />
                      </td>
                      <td className="py-2 px-2">
                        <input value={e.durationDays}
                          onChange={ev => setEdit(p => ({ ...p, [it.id]: { ...e, durationDays: ev.target.value } }))}
                          className="w-16 bg-gray-900/70 border border-gray-700/40 rounded-lg px-2 py-1 text-xs text-white tabular-nums" />
                      </td>
                      <td className="py-2 px-2 text-xs">
                        {it.closedAt ? <span className="text-rose-400">🔒 مُغلق نهائياً</span>
                          : it.isActive ? <span className="text-emerald-400">معروض</span>
                          : <span className="text-gray-500">مخفي</span>}
                        {!it.isPurchasable && <span className="block text-[10px] text-slate-400">إنجاز فقط</span>}
                      </td>
                      <td className="py-2 px-2 text-left whitespace-nowrap">
                        {dirty && (
                          <button disabled={busy === it.id}
                            onClick={() => save(it, { priceChips: Number(e.priceChips), durationDays: Number(e.durationDays) }, '💾 حُفظ')}
                            className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-600 text-black ml-1">حفظ</button>
                        )}
                        {!it.closedAt && (
                          <>
                            <button disabled={busy === it.id}
                              onClick={() => save(it, { isActive: !it.isActive }, it.isActive ? '👁️ أُخفي' : '👁️ عُرض')}
                              className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-gray-800/60 border border-gray-700/40 text-gray-300 ml-1">
                              {it.isActive ? 'إخفاء' : 'عرض'}
                            </button>
                            <button disabled={busy === it.id} onClick={() => closeForever(it)}
                              className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-900/30 border border-rose-700/40 text-rose-300">
                              إغلاق نهائي
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// ➕ إضافة عنصر للخزنة (لقب / تشريفة دخول / تأثير اسم) — مع معاينة قبل الاعتماد
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
// ➕ تأليف عنصر جديد — **الأنواع السبعة كلها**
//
// ⚠️ كان هذا اللوح يقبل ثلاثة أنواع فقط، وقوائمه ثوابت منسوخة في العميل
//    قد تُقدّم خياراً يرفضه الخادم أو يُبدَّل بصمت. والمعاينة كانت رسماً
//    يدوياً يختلف عمّا تعرضه القاعة فعلاً.
//    الآن: الخيارات من سجلّ الخادم، والمعاينة **بمكوّن البطاقة الحقيقي**،
//    والخادم يطبّع كل إعداد قبل تخزينه.
// ══════════════════════════════════════════════════════

const KIND_META: Record<string, { label: string; icon: string; hint: string }> = {
  frame:         { label: 'إطار',           icon: '🃏', hint: 'يحيط بطاقة اللاعب على وجهَيها' },
  title:         { label: 'لقب',            icon: '🏷️', hint: 'لوحة تحت الاسم' },
  name_fx:       { label: 'تأثير اسم',      icon: '✨', hint: 'لون وتوهّج الاسم' },
  entrance:      { label: 'تشريفة دخول',    icon: '🚪', hint: 'تُعرض على شاشة القاعة عند دخوله' },
  elimination:   { label: 'أنيميشن إقصاء',  icon: '🔥', hint: 'يحلّ محلّ الإطفاء الرمادي' },
  victory_sting: { label: 'نغمة نصر',       icon: '🔊', hint: 'تُعزف في القاعة لحظة فوزه' },
  xp_boost:      { label: 'معزّز خبرة',      icon: '⚡', hint: 'خبرة فقط — لا يمسّ الرانك' },
};

const ENTRANCE_LABEL: Record<string, string> = {
  don: '👑 موكب العرّاب', seal: '🩸 ختم العائلة', neon: '⚡ لافتة النيون', file: '🗂️ الملف السري',
};
const TITLE_STYLE_LABEL: Record<string, string> = { gold: 'ذهبي', blood: 'دموي (نابض)', ghost: 'شبحي (متلاشٍ)' };

function AddItemPanel({ onCreated, toast }: { onCreated: () => void; toast: (k: 'ok' | 'err', t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [registry, setRegistry] = useState<any>(null);
  const [kind, setKind] = useState<string>('frame');
  const [nameAr, setNameAr] = useState('');
  const [hookAr, setHookAr] = useState('');
  const [price, setPrice] = useState('35');
  const [days, setDays] = useState('30');
  const [rarity, setRarity] = useState('rare');
  const [sortOrder, setSortOrder] = useState('900');
  const [emblemId, setEmblemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fieldErr, setFieldErr] = useState<string | null>(null);

  // إعداد كل نوع
  const [fx, setFx] = useState<any>({ border: { enabled: true, color: '#f59e0b', style: 'solid' } });
  const [titleText, setTitleText] = useState('');
  const [titleStyle, setTitleStyle] = useState('gold');
  const [fxColor, setFxColor] = useState('#fcd34d');
  const [fxGlow, setFxGlow] = useState('#f59e0b');
  const [fxGlowSize, setFxGlowSize] = useState('10');
  const [entranceDesign, setEntranceDesign] = useState('don');
  const [entranceMs, setEntranceMs] = useState('3500');
  const [elimDesign, setElimDesign] = useState('burn');
  const [soundKey, setSoundKey] = useState('chips_victory_sting');
  const [multiplier, setMultiplier] = useState('2');

  useEffect(() => {
    if (!open || registry) return;
    apiGet('/api/chips/items/design-registry')
      .then(d => setRegistry(d))
      .catch(() => toast('err', 'تعذّر تحميل سجلّ التصاميم'));
  }, [open, registry, toast]);

  // المدّة الافتراضية تتبع النوع (معزّز الخبرة ٧ أيام)
  useEffect(() => {
    const def = registry?.registry?.defaultDaysByKind?.[kind];
    if (def) setDays(String(def));
  }, [kind, registry]);

  const reset = () => {
    setNameAr(''); setHookAr(''); setTitleText(''); setFieldErr(null);
    setPrice('35'); setSortOrder('900'); setEmblemId(null);
  };

  const buildConfig = (): any => {
    switch (kind) {
      case 'frame': return fx;
      case 'title': return { text: titleText, style: titleStyle };
      case 'name_fx': return { nameEffect: { color: fxColor, glowColor: fxGlow, glowSize: Number(fxGlowSize) || 10 } };
      case 'entrance': return { design: entranceDesign, durationMs: Number(entranceMs) || 3500 };
      case 'elimination': return { design: elimDesign };
      case 'victory_sting': return { soundKey };
      case 'xp_boost': return { multiplier: Number(multiplier) || 2 };
      default: return {};
    }
  };

  // معاينة على مكوّن البطاقة الحقيقي — ما تراه هنا هو ما تعرضه القاعة
  const previewCosmetics = (): any => {
    if (kind === 'frame') return { frame: { config: fx, emblemId } };
    if (kind === 'title') return { title: { config: { text: titleText, style: titleStyle } } };
    if (kind === 'name_fx') return { nameFx: { config: { nameEffect: { enabled: true, color: fxColor, glowColor: fxGlow, glowSize: Number(fxGlowSize) || 10 } } } };
    return null;
  };

  const create = async () => {
    setBusy(true); setFieldErr(null);
    try {
      await apiPost('/api/chips/items', {
        kind, nameAr, hookAr, rarity,
        priceChips: Math.max(0, Math.trunc(Number(price) || 0)),
        durationDays: Math.max(1, Math.trunc(Number(days) || 30)),
        sortOrder: Math.trunc(Number(sortOrder) || 900),
        emblemId: kind === 'frame' ? emblemId : null,
        config: buildConfig(),
      });
      reset(); setOpen(false); onCreated();
    } catch (e: any) {
      // الخادم يسمّي الحقل المرفوض — نعرضه بدل رسالة عامة
      setFieldErr(e?.body?.field || null);
      toast('err', e.message || 'تعذّرت الإضافة');
    } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full py-3 rounded-2xl font-bold text-sm bg-gray-800/40 border border-dashed border-gray-600/50 text-gray-300 hover:border-amber-500/50 hover:text-amber-400 transition-all">
        ➕ أضف عنصراً جديداً للخزنة — الأنواع السبعة كلها
      </button>
    );
  }

  const kinds: string[] = registry?.kinds || Object.keys(KIND_META);
  const reg = registry?.registry;
  const valid = nameAr.trim().length >= 2 && (kind !== 'title' || titleText.trim().length >= 1);
  const cos = previewCosmetics();

  return (
    <div className="bg-gray-800/40 border border-amber-600/30 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-amber-400">➕ عنصر جديد</h2>
        <button onClick={() => setOpen(false)} className="text-gray-500 text-xs">✕ إغلاق</button>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {kinds.map(k => (
          <button key={k} onClick={() => { setKind(k); setFieldErr(null); }}
            title={KIND_META[k]?.hint}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${kind === k
              ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
              : 'bg-gray-900/50 border-gray-700/40 text-gray-400'}`}>
            {KIND_META[k]?.icon} {KIND_META[k]?.label || k}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-gray-500 mb-4">{KIND_META[kind]?.hint}</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">اسم العنصر بالمتجر</label>
            <input value={nameAr} onChange={e => setNameAr(e.target.value)} placeholder="مثال: تاج العرّاب"
              className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
          </div>

          {kind === 'frame' && (
            <>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">الشعار فوق البطاقة</label>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setEmblemId(null)}
                    className={`px-2 py-1 rounded text-[10px] border ${!emblemId ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'text-gray-500 border-gray-700/40'}`}>بلا شعار</button>
                  {(reg?.emblems || []).map((id: string) => (
                    <button key={id} onClick={() => setEmblemId(id)}
                      className={`px-1.5 py-1 rounded border ${emblemId === id ? 'bg-amber-500/20 border-amber-500/40' : 'border-gray-700/40'}`}>
                      <ChipsEmblem id={id as EmblemId} size={26} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">التأثيرات</label>
                <FxEditor value={fx} onChange={setFx} frameTypes={reg?.frameSvgTypes} />
              </div>
            </>
          )}

          {kind === 'title' && (
            <>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">نص اللقب كما يظهر على البطاقة</label>
                <input value={titleText} onChange={e => setTitleText(e.target.value)} placeholder="☠️ سفّاح الليل"
                  className={`w-full bg-gray-900/70 border rounded-lg px-3 py-2 text-sm text-white focus:outline-none ${fieldErr === 'config.text' ? 'border-rose-500' : 'border-gray-700/40 focus:border-amber-500'}`} />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">النمط</label>
                <div className="flex gap-2">
                  {(reg?.titleStyles || ['gold', 'blood', 'ghost']).map((s: string) => (
                    <button key={s} onClick={() => setTitleStyle(s)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${titleStyle === s
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300' : 'bg-gray-900/50 border-gray-700/40 text-gray-400'}`}>
                      {TITLE_STYLE_LABEL[s] || s}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {kind === 'name_fx' && (
            <>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-[11px] text-gray-500 mb-1">لون الاسم</label>
                  <input type="color" value={fxColor} onChange={e => setFxColor(e.target.value)} className="w-full h-9 bg-gray-900/70 border border-gray-700/40 rounded-lg" />
                </div>
                <div className="flex-1">
                  <label className="block text-[11px] text-gray-500 mb-1">لون التوهّج</label>
                  <input type="color" value={fxGlow} onChange={e => setFxGlow(e.target.value)} className="w-full h-9 bg-gray-900/70 border border-gray-700/40 rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">حجم التوهّج ({fxGlowSize}px)</label>
                <input type="range" min={0} max={30} value={fxGlowSize} onChange={e => setFxGlowSize(e.target.value)} className="w-full accent-amber-500" />
              </div>
            </>
          )}

          {kind === 'entrance' && (
            <>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">شكل الدخول</label>
                <div className="space-y-2">
                  {(reg?.entranceDesigns || ['don', 'seal', 'neon', 'file']).map((d: string) => (
                    <button key={d} onClick={() => setEntranceDesign(d)}
                      className={`w-full text-right px-3 py-2 rounded-xl border ${entranceDesign === d ? 'bg-amber-500/10 border-amber-500/50 text-amber-300' : 'bg-gray-900/50 border-gray-700/40 text-gray-300'}`}>
                      <span className="text-xs font-bold">{ENTRANCE_LABEL[d] || d}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">المدّة ({(Number(entranceMs) / 1000).toFixed(1)} ثانية)</label>
                <input type="range" min={1200} max={6000} step={100} value={entranceMs} onChange={e => setEntranceMs(e.target.value)} className="w-full accent-amber-500" />
                <p className="text-[10px] text-gray-600 mt-1">أثناء مباراة جارية تُعرض نسخة مختصرة صامتة كي لا تقطع النقاش.</p>
              </div>
            </>
          )}

          {kind === 'elimination' && (
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">نمط الإقصاء</label>
              <div className="flex gap-2">
                {(reg?.eliminationDesigns || ['burn']).map((d: string) => (
                  <button key={d} onClick={() => setElimDesign(d)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${elimDesign === d ? 'bg-amber-500/15 border-amber-500/50 text-amber-300' : 'bg-gray-900/50 border-gray-700/40 text-gray-400'}`}>
                    {d === 'burn' ? '🔥 موت بالنار' : d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {kind === 'victory_sting' && (
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">مفتاح الصوت</label>
              <input value={soundKey} onChange={e => setSoundKey(e.target.value)} dir="ltr"
                className={`w-full bg-gray-900/70 border rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none ${fieldErr === 'config.soundKey' ? 'border-rose-500' : 'border-gray-700/40 focus:border-amber-500'}`} />
              <p className="text-[10px] text-amber-500/80 mt-1">
                يجب أن يكون مربوطاً بملف صوت من لوحة المؤثرات — وإلا رُفض الإنشاء. لا تُباع نغمة بلا صوت.
              </p>
            </div>
          )}

          {kind === 'xp_boost' && (
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">المضاعِف (×{multiplier})</label>
              <input type="range" min={1} max={3} step={0.5} value={multiplier} onChange={e => setMultiplier(e.target.value)} className="w-full accent-amber-500" />
              <p className="text-[10px] text-gray-600 mt-1">خبرة فقط — لا يمسّ الرانك ولا نتيجة المباراة.</p>
            </div>
          )}

          <div>
            <label className="block text-[11px] text-gray-500 mb-1">جملة البيع</label>
            <input value={hookAr} onChange={e => setHookAr(e.target.value)} placeholder="لماذا يشتريه اللاعب؟"
              className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">السعر 🪙</label>
              <input type="number" min={0} step={1} value={price} onChange={e => setPrice(e.target.value)}
                className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-2 py-2 text-sm text-white tabular-nums focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">المدة</label>
              <input type="number" min={1} max={365} step={1} value={days} onChange={e => setDays(e.target.value)}
                className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-2 py-2 text-sm text-white tabular-nums focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">الندرة</label>
              <select value={rarity} onChange={e => setRarity(e.target.value)}
                className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-1 py-2 text-xs text-white focus:outline-none focus:border-amber-500">
                <option value="common">شائع</option>
                <option value="rare">نادر</option>
                <option value="epic">ملحمي</option>
                <option value="myth">أسطوري</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">الترتيب</label>
              <input type="number" step={10} value={sortOrder} onChange={e => setSortOrder(e.target.value)}
                className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-2 py-2 text-sm text-white tabular-nums focus:outline-none focus:border-amber-500" />
            </div>
          </div>
        </div>

        <div className="bg-black/40 border border-gray-700/40 rounded-2xl p-4 flex flex-col items-center justify-start min-h-[260px] sticky top-4 self-start">
          <p className="text-[11px] text-gray-500 mb-3">👁️ المعاينة — بمكوّن البطاقة الحقيقي</p>
          {cos ? (
            <div style={{ paddingTop: 26 }}>
              <DynamicMafiaCard
                playerNumber={7}
                playerName="اسم اللاعب"
                role={null}
                gender="MALE"
                size="md"
                flippable={false}
                rankTier="GODFATHER"
                cosmetics={cos}
              />
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">{KIND_META[kind]?.icon}</div>
              <p className="text-xs text-gray-400 font-bold">{KIND_META[kind]?.label}</p>
              <p className="text-[11px] text-gray-600 mt-2 max-w-[220px]">
                {kind === 'entrance' && 'تُعرض على شاشة القاعة لحظة دخوله — عايِنها من صفحة العرض التجريبية.'}
                {kind === 'elimination' && 'تحلّ محلّ الإطفاء الرمادي لحظة خروجه أمام الجميع.'}
                {kind === 'victory_sting' && 'تُعزف في القاعة لحظة فوزه — الشاشة هي مصدر الصوت.'}
                {kind === 'xp_boost' && 'يضاعف الخبرة فقط. لا يمسّ الرانك ولا نتيجة المباراة.'}
              </p>
            </div>
          )}
          <div className="mt-4 text-center">
            <p className="text-amber-400 font-bold text-sm tabular-nums">🪙 {price || 0} / {days || 30} يوماً</p>
            {hookAr && <p className="text-[11px] text-gray-500 mt-1 max-w-[240px]">{hookAr}</p>}
          </div>
        </div>
      </div>

      <button onClick={create} disabled={!valid || busy}
        className="w-full mt-4 py-2.5 rounded-xl font-bold text-sm bg-amber-600 hover:bg-amber-500 text-black transition-all disabled:opacity-40">
        {busy ? 'جارٍ الإضافة…' : '✅ اعتمد وأضف للخزنة'}
      </button>
      <p className="text-[10px] text-gray-600 mt-2 text-center">
        الخادم يطبّع كل إعداد قبل تخزينه — لا يمكن حفظ تصميم يعجز المُصيّر عن رسمه.
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 📊 دفتر المخزون — ما يملكه الناس فعلاً
//
// ⚠️ جدول الإيجارات هو دفتر مخزون العمل كله، ولم تكن له أي واجهة إطلاقاً:
//    لا «أي عنصر يُباع»، ولا «كم إيجاراً نشطاً»، ولا «من ينتهي إيجاره هذا
//    الأسبوع كي نُذكّره»، ولا زرّ تعويض. ومساران جاهزان في الخادم بلا مستدعٍ.
//    كان المتجر يُدار على العمياني.
// ══════════════════════════════════════════════════════
function InventoryView({ toast }: { toast: (k: 'ok' | 'err', t: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try { setData(await apiGet(`/api/chips/items/inventory?days=${d}`)); }
    catch { setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(days); }, [load, days]);

  // 🎁 منح/تعويض — المسار كان موجوداً في الخادم بلا أي زرّ يستدعيه
  const grant = async (itemId: number, itemName: string) => {
    const pid = prompt(`منح «${itemName}» بلا مقابل.\n\nاكتب معرّف اللاعب:`);
    const playerId = parseInt(String(pid || '').trim());
    if (!playerId || isNaN(playerId)) return;
    const d = prompt('عدد الأيام (اتركه فارغاً للمدّة الافتراضية):');
    const daysNum = d && !isNaN(parseInt(d)) ? parseInt(d) : undefined;
    if (!confirm(`منح «${itemName}» للاعب #${playerId}${daysNum ? ` لمدة ${daysNum} يوماً` : ''}؟\n\nبلا خصم من رصيده — يُستعمل للتعويض والإنجاز.`)) return;
    setBusy(true);
    try {
      await apiPost('/api/chips/items/grant', { playerId, itemId, days: daysNum });
      toast('ok', `✅ مُنح «${itemName}» للاعب #${playerId}`);
      load(days);
    } catch (e: any) { toast('err', e.message || 'فشل المنح'); }
    finally { setBusy(false); }
  };

  const t = data?.totals;
  const items: any[] = data?.items || [];
  const expiring: any[] = data?.expiring || [];
  const sold = items.filter(i => i.totalRentals > 0);
  const never = items.filter(i => i.totalRentals === 0 && i.isPurchasable && !i.closed);

  return (
    <div className="space-y-5">
      {/* ملخّص */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="إيجارات نشطة" value={t?.activeOwners} unit="إيجار" tone="emerald" hint="ما يملكه اللاعبون الآن فعلاً" />
        <Kpi label="إيراد الخزنة" value={t?.revenueChips} unit="🪙" tone="amber" hint="من الدفتر — يشمل التجديدات" />
        <Kpi label="عمليات شراء" value={t?.purchases} unit="عملية" tone="sky" hint="استئجار + تجديد" />
        <Kpi label={`ينتهي خلال ${days} أيام`} value={t?.expiringSoon} unit="إيجار" tone="rose" hint="فرصة تذكير قبل الانقطاع" />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] text-gray-500">نافذة الانتهاء:</span>
        {[3, 7, 14, 30].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${days === d
              ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
              : 'bg-gray-900/50 border-gray-700/40 text-gray-400'}`}>
            {d} أيام
          </button>
        ))}
      </div>

      {loading && <p className="text-center text-gray-600 text-xs py-10">جارٍ التحميل…</p>}

      {/* لكل عنصر */}
      {!loading && (
        <div className="bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-gray-300 mb-3">🏦 أداء كل عنصر</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-gray-500 border-b border-gray-700/40">
                  <th className="text-right py-2 px-2 font-medium">العنصر</th>
                  <th className="text-right py-2 px-2 font-medium">نشط الآن</th>
                  <th className="text-right py-2 px-2 font-medium">عمليات</th>
                  <th className="text-right py-2 px-2 font-medium">الإيراد 🪙</th>
                  <th className="text-right py-2 px-2 font-medium">ينتهي قريباً</th>
                  <th className="py-2 px-2" />
                </tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} className="border-b border-gray-800/50">
                    <td className="py-2 px-2 text-gray-200">
                      <span className="flex items-center gap-2">
                        {i.emblemId && <ChipsEmblem id={i.emblemId as EmblemId} size={20} />}
                        <span>
                          {i.nameAr}
                          <span className="block text-[10px] text-gray-600">
                            {i.kind} · 🪙{i.priceChips} / {i.durationDays}ي
                            {i.closed ? ' · 🔒 مُغلق' : i.isActive ? '' : ' · مخفي'}
                            {!i.isPurchasable && ' · إنجاز فقط'}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className={`py-2 px-2 tabular-nums font-bold ${i.activeOwners > 0 ? 'text-emerald-400' : 'text-gray-600'}`}>{i.activeOwners}</td>
                    <td className="py-2 px-2 tabular-nums text-gray-400">{i.purchases}</td>
                    <td className="py-2 px-2 tabular-nums text-amber-400">{i.revenueChips.toLocaleString('en-US')}</td>
                    <td className={`py-2 px-2 tabular-nums ${i.expiringSoon > 0 ? 'text-rose-400' : 'text-gray-600'}`}>{i.expiringSoon}</td>
                    <td className="py-2 px-2 text-left">
                      <button disabled={busy} onClick={() => grant(i.id, i.nameAr)}
                        className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-gray-800/60 border border-gray-700/40 text-gray-300 hover:border-amber-500/40 hover:text-amber-300">
                        🎁 منح
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {never.length > 0 && (
            <p className="text-[11px] text-amber-400/80 mt-3">
              ⚠️ {never.length} عنصراً معروضاً لم يُشترَ ولا مرة — راجع سعره أو جملة بيعه أو موضعه في الترتيب.
            </p>
          )}
          {sold.length === 0 && !never.length && (
            <p className="text-center text-gray-600 text-xs py-6">لا مبيعات بعد</p>
          )}
        </div>
      )}

      {/* من ينتهي إيجاره */}
      {!loading && (
        <div className="bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-gray-300 mb-1">⏳ ينتهي خلال {days} أيام</h3>
          <p className="text-[11px] text-gray-500 mb-3">
            قائمة التذكير: هؤلاء يفقدون ما دفعوا ثمنه قريباً. التنبيه التلقائي يصلهم عند فتح الخزنة.
          </p>
          {expiring.length === 0 ? (
            <p className="text-center text-gray-600 text-xs py-6">لا شيء ينتهي في هذه النافذة</p>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-800/50">
              {expiring.map(e => {
                const left = Math.max(0, Math.ceil((new Date(e.expiresAt).getTime() - Date.now()) / 86400000));
                return (
                  <div key={e.rentalId} className="flex items-center justify-between py-2 px-1">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-200 font-bold truncate">
                        {e.playerName} <span className="text-gray-600 font-normal">#{e.playerId}</span>
                      </p>
                      <p className="text-[10px] text-gray-500">{e.itemName} · 🪙{e.priceChips}</p>
                    </div>
                    <div className="text-left shrink-0">
                      <p className={`text-xs font-bold tabular-nums ${left <= 2 ? 'text-rose-400' : 'text-amber-400'}`}>
                        {left} {left === 1 ? 'يوم' : 'أيام'}
                      </p>
                      <p className="text-[9px] text-gray-600">{e.warnedAt ? 'نُبّه' : 'لم يُنبَّه'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 📒 الدفتر
// ══════════════════════════════════════════════════════
function LedgerView({ toast }: { toast: (k: 'ok' | 'err', t: string) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [refunding, setRefunding] = useState<any>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState({ playerId: '', reason: '', from: '', to: '' });
  const limit = 50;
  const pages = Math.max(1, Math.ceil(total / limit));

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (f.playerId) qs.set('playerId', f.playerId);
      if (f.reason) qs.set('reason', f.reason);
      if (f.from) qs.set('from', f.from);
      if (f.to) qs.set('to', `${f.to}T23:59:59`);
      qs.set('limit', String(limit)); qs.set('offset', String((p - 1) * limit));
      const d = await apiGet(`/api/chips/admin/ledger?${qs.toString()}`);
      setRows(d.ledger || []); setTotal(d.total || 0); setPage(p);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [f]);

  useEffect(() => { load(1); }, []); // eslint-disable-line

  return (
    <div>
      {/* فلاتر */}
      <div className="bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">معرّف اللاعب</label>
            <input value={f.playerId} onChange={e => setF({ ...f, playerId: e.target.value })} placeholder="#"
              className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">نوع الحركة</label>
            <select value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })}
              className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500">
              <option value="">الكل</option>
              {Object.entries(REASON_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">من تاريخ</label>
            <input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })}
              className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">إلى تاريخ</label>
            <input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })}
              className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
          </div>
          <div className="flex items-end gap-2">
            <button onClick={() => load(1)} className="flex-1 py-2 rounded-lg text-sm font-bold bg-amber-600 hover:bg-amber-500 text-black transition-all">تطبيق</button>
            <button onClick={() => { setF({ playerId: '', reason: '', from: '', to: '' }); setTimeout(() => load(1), 0); }}
              className="px-3 py-2 rounded-lg text-xs font-bold bg-gray-800/60 border border-gray-700/40 text-gray-400 hover:text-gray-200 transition-all">مسح</button>
          </div>
        </div>
      </div>

      {/* الجدول */}
      <div className="bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-500 border-b border-gray-700/40">
                <th className="text-right py-2 px-2 font-medium">#</th>
                <th className="text-right py-2 px-2 font-medium">اللاعب</th>
                <th className="text-right py-2 px-2 font-medium">الحركة</th>
                <th className="text-left py-2 px-2 font-medium">القيمة</th>
                <th className="text-left py-2 px-2 font-medium">الرصيد بعدها</th>
                <th className="text-right py-2 px-2 font-medium">ملاحظة</th>
                <th className="text-right py-2 px-2 font-medium">الوقت</th>
                <th className="text-center py-2 px-2 font-medium">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="py-8 text-center text-gray-600 text-xs">جارٍ التحميل…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-gray-600 text-xs">لا حركات بعد</td></tr>}
              {!loading && rows.map(r => (
                <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-700/20 transition-colors">
                  <td className="py-2 px-2 text-gray-600 text-[11px] tabular-nums">{r.id}</td>
                  <td className="py-2 px-2 text-gray-200">{r.playerName || `#${r.playerId}`}</td>
                  <td className="py-2 px-2 text-gray-400 text-xs">{REASON_LABEL[r.reason] || r.reason}</td>
                  <td className={`py-2 px-2 text-left tabular-nums font-bold ${r.amount > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {r.amount > 0 ? '+' : ''}{r.amount}
                  </td>
                  <td className="py-2 px-2 text-left tabular-nums text-gray-400">{r.balanceAfter}</td>
                  <td className="py-2 px-2 text-gray-500 text-[11px] max-w-[220px] truncate" title={r.note || ''}>{r.note || '—'}</td>
                  <td className="py-2 px-2 text-gray-500 text-[11px] whitespace-nowrap">{fmtDT(r.createdAt)}</td>
                  <td className="py-2 px-2 text-center whitespace-nowrap">
                    {r.refundedById ? (
                      <span className="text-[10px] text-gray-600" title={`الحركة المُعاكِسة #${r.refundedById}`}>مُسترجَعة</span>
                    ) : r.reversesLedgerId ? (
                      <span className="text-[10px] text-sky-500/70" title={`تعكس الحركة #${r.reversesLedgerId}`}>عكس #{r.reversesLedgerId}</span>
                    ) : (r.amount < 0 && ['rent_item', 'renew_item'].includes(r.reason)) ? (
                      <button onClick={() => setRefunding(r)}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold bg-gray-800/70 border border-gray-700/40 text-amber-400 hover:border-amber-500/50 hover:text-amber-300 transition-all">
                        ↩️ استرجاع
                      </button>
                    ) : <span className="text-gray-700 text-[10px]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ترقيم */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button disabled={page <= 1} onClick={() => load(page - 1)}
              className="px-3 py-1.5 rounded-lg text-xs bg-gray-800/60 border border-gray-700/40 text-gray-300 disabled:opacity-30">السابق</button>
            <span className="text-xs text-gray-500 tabular-nums">{page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => load(page + 1)}
              className="px-3 py-1.5 rounded-lg text-xs bg-gray-800/60 border border-gray-700/40 text-gray-300 disabled:opacity-30">التالي</button>
          </div>
        )}
      </div>

      {refunding && (
        <RefundDialog row={refunding} onClose={() => setRefunding(null)}
          onDone={(msg) => { setRefunding(null); toast('ok', msg); load(page); }} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// ↩️ نافذة الاسترجاع — التناسب افتراضياً، والكامل يحتاج تبريراً مكتوباً
//    الاسترجاع يسحب الميزة مع المال، وإلا صار هديّة.
// ══════════════════════════════════════════════════════
function RefundDialog({ row, onClose, onDone }: {
  row: any; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [mode, setMode] = useState<'prorata' | 'full'>('prorata');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const d = await apiPost('/api/chips/admin/refund', { ledgerId: row.id, mode, note });
      onDone(`↩️ استُرجع ${d.refunded} 🪙 — سُحبت الميزة وأُبلغ اللاعب`);
    } catch (e: any) {
      // 422 = إيجار بلا سعر مسجَّل: نوجّه للكامل بدل ترك الأدمن حائراً
      setErr(e.status === 422
        ? `${e.message}`
        : e.message);
      if (e.status === 422) setMode('full');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-black text-white mb-1">↩️ استرجاع حركة #{row.id}</h3>
        <p className="text-xs text-gray-500 mb-4">
          {row.playerName || `#${row.playerId}`} · {REASON_LABEL[row.reason] || row.reason} · دُفع {Math.abs(row.amount)} 🪙
        </p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={() => setMode('prorata')}
            className={`p-3 rounded-xl border text-right transition-all ${
              mode === 'prorata' ? 'border-amber-500 bg-amber-900/20' : 'border-gray-700/40 bg-gray-800/40 hover:border-gray-600'
            }`}>
            <div className="text-sm font-bold text-white">بالتناسب</div>
            <div className="text-[11px] text-gray-500 mt-0.5">حسب الأيام المتبقية</div>
          </button>
          <button onClick={() => setMode('full')}
            className={`p-3 rounded-xl border text-right transition-all ${
              mode === 'full' ? 'border-rose-500 bg-rose-900/20' : 'border-gray-700/40 bg-gray-800/40 hover:border-gray-600'
            }`}>
            <div className="text-sm font-bold text-white">كامل</div>
            <div className="text-[11px] text-gray-500 mt-0.5">{Math.abs(row.amount)} 🪙 — بتبرير</div>
          </button>
        </div>

        <label className="block text-[11px] text-gray-500 mb-1">
          الملاحظة {mode === 'full' && <span className="text-rose-400">— إلزامية للكامل</span>}
        </label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={300}
          placeholder="سبب الاسترجاع — يُحفظ في سجل الموظفين"
          className="w-full bg-gray-800/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 resize-none" />

        {err && <div className="mt-3 text-xs text-rose-300 bg-rose-900/25 border border-rose-700/40 rounded-lg px-3 py-2 leading-relaxed">{err}</div>}

        <div className="flex gap-2 mt-4">
          <button onClick={submit} disabled={busy || (mode === 'full' && note.trim().length < 3)}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-amber-600 hover:bg-amber-500 text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? '…' : 'تأكيد الاسترجاع'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-gray-800 border border-gray-700/40 text-gray-400 hover:text-gray-200 transition-all">إلغاء</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 📈 تقرير الاقتصاد — الإصدار مقابل الاستهلاك مقابل الالتزام
//    كل رقم هنا مشتقّ من الدفتر. لا حقل مُجمَّع يُحدَّث يدوياً،
//    لأن أي مُجمَّع يمكن أن ينحرف والدفتر لا ينحرف.
// ══════════════════════════════════════════════════════

async function downloadLedgerCsv(qs: string) {
  const res = await fetch(`${API_URL}/api/chips/admin/ledger.csv?${qs}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `API ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chips-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function ReportView({ toast }: { toast: (k: 'ok' | 'err', t: string) => void }) {
  const [rep, setRep] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState({ from: '', to: '' });
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (range.from) qs.set('from', range.from);
      if (range.to) qs.set('to', `${range.to}T23:59:59`);
      const d = await apiGet(`/api/chips/admin/report?${qs.toString()}`);
      setRep(d.report);
    } catch (e: any) { toast('err', e.message); setRep(null); }
    finally { setLoading(false); }
  }, [range.from, range.to]); // eslint-disable-line

  useEffect(() => { load(); }, []); // eslint-disable-line

  const doExport = async () => {
    setExporting(true);
    try {
      const qs = new URLSearchParams();
      if (range.from) qs.set('from', range.from);
      if (range.to) qs.set('to', `${range.to}T23:59:59`);
      await downloadLedgerCsv(qs.toString());
      toast('ok', '📤 نُزِّل ملف الدفتر — يفتح في Excel بالعربية');
    } catch (e: any) { toast('err', e.message); }
    finally { setExporting(false); }
  };

  if (loading) return <div className="py-16 text-center text-gray-600 text-sm">جارٍ حساب التقرير…</div>;
  if (!rep) return <div className="py-16 text-center text-gray-600 text-sm">تعذّر تحميل التقرير</div>;

  const issuedTotal = Object.values(rep.issuance || {}).reduce((s: number, v: any) => s + Number(v || 0), 0);
  const sunkTotal = Object.values(rep.sinks || {}).reduce((s: number, v: any) => s + Number(v || 0), 0);
  const burnRate = issuedTotal > 0 ? Math.round((sunkTotal / issuedTotal) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* المدى + التصدير */}
      <div className="bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">من تاريخ</label>
            <input type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })}
              className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">إلى تاريخ</label>
            <input type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })}
              className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
          </div>
          <div className="flex items-end">
            <button onClick={load} className="w-full py-2 rounded-lg text-sm font-bold bg-amber-600 hover:bg-amber-500 text-black transition-all">تطبيق</button>
          </div>
          <div className="flex items-end">
            <button onClick={doExport} disabled={exporting}
              className="w-full py-2 rounded-lg text-sm font-bold bg-emerald-700/80 hover:bg-emerald-600 text-white transition-all disabled:opacity-50">
              {exporting ? '…' : '📤 تصدير الدفتر CSV'}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-gray-600 mt-2">
          المدى الافتراضي آخر ٩٠ يوماً · التصدير يتبع نفس المدى ويفتح في Excel بالعربية مباشرة
        </p>
      </div>

      {/* الإيراد + الالتزام */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-emerald-900/30 to-gray-800/40 border border-emerald-700/30 rounded-2xl p-4">
          <div className="text-[11px] text-emerald-400/70 mb-1">💰 الإيراد المُسجَّل (دينار)</div>
          <div className="text-3xl font-black text-emerald-300 tabular-nums">{Number(rep.revenue.jodRecorded).toFixed(2)}</div>
          <div className="text-[11px] text-gray-500 mt-2">من {rep.revenue.recordedRows} عملية شحن موثّقة القيمة</div>
          {rep.revenue.legacyRows > 0 && (
            <div className="mt-2 text-[11px] text-amber-500/80 bg-amber-900/20 border border-amber-700/30 rounded-lg px-2 py-1.5 leading-relaxed">
              ⚠️ {rep.revenue.legacyRows} عملية شحن أقدم من تسجيل القيمة — غير محتسبة هنا.
              لم نُقدّرها لأن رقماً مُقدَّراً في تقرير مالي أسوأ من رقم ناقص مُعلَن.
            </div>
          )}
        </div>

        <div className="bg-gradient-to-br from-rose-900/25 to-gray-800/40 border border-rose-700/30 rounded-2xl p-4">
          <div className="text-[11px] text-rose-400/70 mb-1">📉 الالتزام — تشبس متداول</div>
          <div className="text-3xl font-black text-rose-300 tabular-nums">{rep.liability.circulatingChips.toLocaleString()}</div>
          <div className="text-[11px] text-gray-500 mt-2">
            بحوزة {rep.liability.holders} لاعباً · ≈ {rep.liability.estimatedJod} د.أ بأفضل باقة
          </div>
          <div className="text-[10px] text-gray-600 mt-1">
            هذا دَين خدمة على النادي: تشبس مدفوع ولم يُستهلك بعد
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-900/25 to-gray-800/40 border border-amber-700/30 rounded-2xl p-4">
          <div className="text-[11px] text-amber-400/70 mb-1">🔥 نسبة الاستهلاك</div>
          <div className="text-3xl font-black text-amber-300 tabular-nums">{burnRate}%</div>
          <div className="text-[11px] text-gray-500 mt-2">
            صُرف {sunkTotal.toLocaleString()} من {issuedTotal.toLocaleString()} 🪙 صادر
          </div>
          <div className="text-[10px] text-gray-600 mt-1">
            {rep.liability.activeRentals} إيجاراً فعّالاً · دُفع فيها {rep.liability.paidForActiveChips.toLocaleString()} 🪙
          </div>
        </div>
      </div>

      {/* الإصدار مقابل الاستهلاك */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-emerald-400 mb-3">⬆️ الإصدار — من أين دخل التشبس</h3>
          <FlowRows rows={[
            ['💵 شحن إداري (مدفوع)', rep.issuance.topup, 'emerald'],
            ['🎁 مكافآت (توب-3 · ميلاد)', rep.issuance.rewards, 'sky'],
            ['🎲 قطرات اللعب', rep.issuance.drops, 'violet'],
            ['✏️ تصحيحات يدوية', rep.issuance.adjustments, 'gray'],
            ['↩️ استرجاعات', rep.issuance.refunds, 'gray'],
          ]} total={issuedTotal} />
          <p className="text-[11px] text-gray-600 mt-3 leading-relaxed">
            المدفوع مقابل المجّاني: {issuedTotal > 0 ? Math.round((rep.issuance.topup / issuedTotal) * 100) : 0}%
            من التشبس الصادر جاء بمقابل نقدي. الباقي تكلفة تسويق.
          </p>
        </div>

        <div className="bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-rose-400 mb-3">⬇️ الاستهلاك — أين صُرف</h3>
          <FlowRows rows={[
            ['🏦 الخزنة (استئجار وتجديد)', rep.sinks.store, 'amber'],
            ['✏️ خصم يدوي', rep.sinks.adjustments, 'gray'],
          ]} total={sunkTotal} />
          {sunkTotal === 0 && (
            <p className="text-[11px] text-amber-500/80 mt-3">
              لا استهلاك في هذا المدى — التشبس يتراكم بلا مصرف، وهذا يُفقد الشراء معناه.
            </p>
          )}
        </div>
      </div>

      {/* تفصيل بحسب نوع الحركة */}
      <div className="bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4">
        <h3 className="text-sm font-bold text-gray-300 mb-3">📊 تفصيل الحركات</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-500 border-b border-gray-700/40">
                <th className="text-right py-2 px-2 font-medium">الحركة</th>
                <th className="text-left py-2 px-2 font-medium">العدد</th>
                <th className="text-left py-2 px-2 font-medium">وارد 🪙</th>
                <th className="text-left py-2 px-2 font-medium">صادر 🪙</th>
                <th className="text-left py-2 px-2 font-medium">دينار</th>
              </tr>
            </thead>
            <tbody>
              {rep.byReason.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-gray-600 text-xs">لا حركات في هذا المدى</td></tr>
              )}
              {rep.byReason.map((r: any) => (
                <tr key={r.reason} className="border-b border-gray-800/50">
                  <td className="py-2 px-2 text-gray-200 text-xs">{REASON_LABEL[r.reason] || r.reason}</td>
                  <td className="py-2 px-2 text-left tabular-nums text-gray-400">{r.moves}</td>
                  <td className="py-2 px-2 text-left tabular-nums text-emerald-400">{r.credited ? `+${r.credited}` : '—'}</td>
                  <td className="py-2 px-2 text-left tabular-nums text-rose-400">{r.debited ? `−${r.debited}` : '—'}</td>
                  <td className="py-2 px-2 text-left tabular-nums text-amber-400">{Number(r.jod) ? Number(r.jod).toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FlowRows({ rows, total }: { rows: [string, number, string][]; total: number }) {
  const tone: Record<string, string> = {
    emerald: 'bg-emerald-500', sky: 'bg-sky-500', violet: 'bg-violet-500',
    amber: 'bg-amber-500', gray: 'bg-gray-600',
  };
  return (
    <div className="space-y-2.5">
      {rows.map(([label, value, c]) => (
        <div key={label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-400">{label}</span>
            <span className="tabular-nums text-gray-200 font-bold">{Number(value || 0).toLocaleString()}</span>
          </div>
          <div className="h-1.5 bg-gray-900/70 rounded-full overflow-hidden">
            <div className={`h-full ${tone[c] || 'bg-gray-600'} rounded-full transition-all`}
              style={{ width: `${total > 0 ? Math.min(100, (Number(value || 0) / total) * 100) : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
