'use client';

// ══════════════════════════════════════════════════════
// 🪙 اقتصاد التشبس — لوحة الإدارة (المرحلة 0)
// شحن بالباقات المعتمدة · تصحيح يدوي · أرصدة · الدفتر · تدقيق
// ══════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }

async function apiGet(path: string) {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `API ${res.status}`);
  return data;
}
async function apiPost(path: string, body: any) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `API ${res.status}`);
  return data;
}

const REASON_LABEL: Record<string, string> = {
  admin_topup: '💵 شحن إداري',
  admin_adjust: '✏️ تصحيح يدوي',
  drop_win: '🏆 قطرة فوز',
  drop_top3: '🥉 قطرة توب-3',
  drop_first_match: '🎉 أول مباراة',
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
  if (!res.ok) throw new Error(data?.error || `API ${res.status}`);
  return data;
}

const KIND_LABEL: Record<string, string> = {
  frame: '🃏 إطار', title: '🏷️ لقب', name_fx: '✨ تأثير اسم', entrance: '🚪 تشريفة دخول',
  elimination: '🔥 إقصاء', victory_sting: '🔊 نغمة نصر', xp_boost: '⚡ معزّز',
};

export default function ChipsAdminPage() {
  const [tab, setTab] = useState<'topup' | 'ledger' | 'catalog'>('topup');
  const [stats, setStats] = useState<any>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const showToast = (kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };

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
        {([['topup', '💵 الشحن والأرصدة'], ['catalog', '🏦 كتالوج الخزنة'], ['ledger', '📒 الدفتر']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-bold transition-all border-b-2 -mb-px ${
              tab === k ? 'text-amber-400 border-amber-400' : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'topup' && <TopupView packs={packs} onChanged={loadStats} toast={showToast} />}
      {tab === 'catalog' && <CatalogView toast={showToast} />}
      {tab === 'ledger' && <LedgerView />}

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
// 📒 الدفتر
// ══════════════════════════════════════════════════════
function LedgerView() {
  const [rows, setRows] = useState<any[]>([]);
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
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="py-8 text-center text-gray-600 text-xs">جارٍ التحميل…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-gray-600 text-xs">لا حركات بعد</td></tr>}
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
    </div>
  );
}
