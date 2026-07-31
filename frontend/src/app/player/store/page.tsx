'use client';

// ══════════════════════════════════════════════════════
// 🏦 خزنة الدون — متجر اللاعب
// كل عنصر إيجار لمدة (30 يوماً غالباً) — لا تملّك أبدي.
// جرّب على بطاقتك أنت قبل الشراء.
// ══════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { usePlayer } from '@/context/PlayerContext';
import DynamicMafiaCard from '@/components/DynamicMafiaCard';
import { ChipsEmblem, type EmblemId } from '@/components/ChipsEmblems';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function token() {
  return typeof window !== 'undefined' ? localStorage.getItem('mafia_player_token') : null;
}
async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `خطأ ${res.status}`);
  return data;
}
function newRequestId() {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

interface StoreItem {
  id: number; kind: string; itemKey: string; nameAr: string; hookAr: string;
  rarity: string; priceChips: number; durationDays: number; emblemId?: string | null;
  config: any; isPurchasable: boolean; closed: boolean; owned: boolean; expiresAt: string | null;
}

const KIND_TABS: { key: string; label: string; icon: string }[] = [
  { key: 'frame', label: 'الإطارات', icon: '🃏' },
  { key: 'title', label: 'الألقاب', icon: '🏷️' },
  { key: 'name_fx', label: 'تأثير الاسم', icon: '✨' },
  { key: 'entrance', label: 'تشريفة الدخول', icon: '🚪' },
  { key: 'elimination', label: 'الإقصاء', icon: '🔥' },
  { key: 'victory_sting', label: 'نغمة النصر', icon: '🔊' },
  { key: 'xp_boost', label: 'المعزّزات', icon: '⚡' },
];

const RARITY: Record<string, { label: string; cls: string }> = {
  common: { label: 'شائع', cls: 'bg-zinc-800 text-zinc-300 border-zinc-600' },
  rare: { label: 'نادر', cls: 'bg-sky-950 text-sky-300 border-sky-700' },
  epic: { label: 'ملحمي', cls: 'bg-purple-950 text-purple-300 border-purple-700' },
  myth: { label: 'أسطوري', cls: 'bg-amber-950 text-amber-300 border-amber-600' },
  achievement: { label: 'إنجاز', cls: 'bg-slate-800 text-slate-200 border-slate-500' },
};

function daysLeft(iso: string | null) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

export default function StorePage() {
  const router = useRouter();
  const { player } = usePlayer();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [cosmetics, setCosmetics] = useState<any>(null);
  // بطاقة اللاعب الحقيقية (صورته ورتبته) — لا تتوفر في سياق اللاعب
  const [me, setMe] = useState<{ name?: string; avatarUrl?: string | null; rankTier?: string; gender?: string } | null>(null);
  const [tab, setTab] = useState('frame');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [tryOn, setTryOn] = useState<StoreItem | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [requestId, setRequestId] = useState(newRequestId());

  const say = (ok: boolean, text: string) => { setToast({ ok, text }); setTimeout(() => setToast(null), 3800); };

  const load = async () => {
    try {
      const d = await api('/api/chips/store');
      setItems(d.items || []);
      setBalance(Number(d.balance || 0));
      setCosmetics(d.cosmetics || null);
      setMe(d.me || null);
    } catch (e: any) {
      say(false, e.message || 'تعذّر تحميل الخزنة');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const shown = useMemo(() => items.filter(i => i.kind === tab), [items, tab]);
  const owned = useMemo(() => items.filter(i => i.owned), [items]);

  // معاينة البطاقة: المُجرَّب ← المُجهَّز الحالي
  const previewCosmetics = useMemo(() => {
    if (!tryOn) return cosmetics;
    const base = { ...(cosmetics || {}) };
    // ⚠️ الشعار يُمرَّر مع الإطار: البطاقة نفسها ترسمه الآن، فما تراه هنا هو
    //    ما تعرضه شاشة القاعة حرفياً. سابقاً كان يُرسم بطبقة يدوية في المتجر
    //    فقط — أي أن المعاينة كانت تَعِد بأكثر مما يُسلَّم.
    if (tryOn.kind === 'frame') base.frame = { config: tryOn.config, emblemId: tryOn.emblemId ?? null };
    else if (tryOn.kind === 'title') base.title = { config: tryOn.config };
    else if (tryOn.kind === 'name_fx') base.nameFx = { config: tryOn.config };
    return base;
  }, [tryOn, cosmetics]);

  const doRent = async (item: StoreItem) => {
    setBusy(item.id);
    try {
      const d = await api('/api/chips/store/rent', {
        method: 'POST',
        body: JSON.stringify({ itemId: item.id, requestId }),
      });
      setRequestId(newRequestId());
      setBalance(Number(d.balance ?? balance));
      // ⚠️ لا نُعلن ملكية بلا تاريخ انتهاء. الخادم صار يُنشئ الإيجار في نفس
      //    معاملة الخصم ويُصلح أي إيجار مفقود عند إعادة المحاولة، فغياب
      //    التاريخ حالة شاذّة — نقولها كما هي بدل تأكيدٍ كاذب.
      if (!d.expiresAt) {
        say(false, 'تمّت العملية لكن لم نتأكّد من تفعيل العنصر — أعد فتح الخزنة، وراجع الإدارة إن لم يظهر');
      } else {
        say(true, d.renewed
          ? `🔄 جُدِّد «${item.nameAr}» — متبقٍ ${daysLeft(d.expiresAt)} يوماً`
          : `✅ صار «${item.nameAr}» لك ${item.durationDays} يوماً`);
      }
      setTryOn(null);
      load();
    } catch (e: any) {
      say(false, e.message || 'تعذّر إتمام العملية');
    } finally { setBusy(null); }
  };

  const doEquip = async (item: StoreItem | null, kind: string) => {
    setBusy(item?.id ?? -1);
    try {
      const d = await api('/api/chips/store/equip', {
        method: 'POST',
        body: JSON.stringify({ kind, itemId: item?.id ?? null }),
      });
      setCosmetics(d.cosmetics || null);
      setTryOn(null);
      say(true, item ? `🎽 جُهِّز «${item.nameAr}»` : 'أُزيل من بطاقتك');
    } catch (e: any) {
      say(false, e.message || 'تعذّر التجهيز');
    } finally { setBusy(null); }
  };

  const equippedIdFor = (kind: string) => {
    if (!cosmetics) return null;
    if (kind === 'frame') return cosmetics.frame?.itemId ?? null;
    if (kind === 'title') return cosmetics.title?.itemId ?? null;
    if (kind === 'name_fx') return cosmetics.nameFx?.itemId ?? null;
    return null;
  };

  const canPreview = ['frame', 'title', 'name_fx'].includes(tab);

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a0f] pb-24">
      {/* الترويسة */}
      <div className="sticky top-0 z-30 px-4 py-3 backdrop-blur-xl bg-[#0a0a0f]/85 border-b border-amber-500/15">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => router.back()} className="text-gray-500 text-sm px-2 py-1">← رجوع</button>
          <h1 className="text-lg font-black text-amber-400" style={{ fontFamily: 'Amiri, serif' }}>🏦 خزنة الدون</h1>
          {/* الرصيد يفتح المحفظة: من أين جاء وعلى ماذا صُرف */}
          <button onClick={() => router.push('/player/wallet')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-black tabular-nums"
            style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.16), rgba(245,158,11,0.05))', border: '1px solid rgba(245,158,11,0.32)', color: '#fbbf24' }}>
            🪙 {balance.toLocaleString('en-US')}
          </button>
        </div>
        <p className="text-[10px] text-gray-500 mt-1.5 text-center">
          رصيدك لا ينتهي أبداً — والمزايا اشتراكات لمدة معلنة تُجدَّد متى شئت
        </p>
      </div>

      {/* معاينة حية على بطاقتك */}
      {canPreview && (
        <div className="flex flex-col items-center py-5">
          <div style={{ paddingTop: 30 }} className="relative">
            <DynamicMafiaCard
              playerNumber={player?.playerId ?? 1}
              playerName={me?.name || player?.name || 'أنت'}
              role={null}
              gender={me?.gender === 'FEMALE' ? 'FEMALE' : 'MALE'}
              size="md"
              flippable={false}
              rankTier={me?.rankTier || 'INFORMANT'}
              avatarUrl={me?.avatarUrl || null}
              cosmetics={previewCosmetics}
            />
            {/* الشعار يرسمه محرّك البطاقة نفسه الآن — أُزيلت الطبقة اليدوية
                كي لا تفترق المعاينة عمّا يظهر في القاعة. */}
          </div>
          <p className="text-[11px] text-gray-500 mt-3">
            {tryOn ? `👀 تُعاين «${tryOn.nameAr}» — لم تُشترَ بعد` : 'بطاقتك كما يراها الجميع'}
          </p>
          {tryOn && (
            <button onClick={() => setTryOn(null)} className="text-[11px] text-gray-400 underline mt-1">إلغاء المعاينة</button>
          )}
        </div>
      )}

      {/* التبويبات */}
      <div className="px-3 overflow-x-auto">
        <div className="flex gap-2 pb-2 min-w-max">
          {KIND_TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setTryOn(null); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                tab === t.key ? 'bg-amber-500/15 border-amber-500/50 text-amber-300' : 'bg-white/5 border-white/10 text-gray-400'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* العناصر */}
      <div className="px-3 mt-3 space-y-3">
        {loading && <p className="text-center text-gray-600 text-sm py-10">جارٍ فتح الخزنة…</p>}
        {!loading && shown.length === 0 && <p className="text-center text-gray-600 text-sm py-10">لا عناصر في هذا القسم بعد</p>}

        {shown.map(item => {
          const r = RARITY[item.rarity] || RARITY.common;
          const isEquipped = equippedIdFor(item.kind) === item.id;
          const left = daysLeft(item.expiresAt);
          const affordable = balance >= item.priceChips;

          return (
            <div key={item.id}
              className={`rounded-2xl p-3.5 border transition-all ${
                isEquipped ? 'bg-amber-500/10 border-amber-500/40' : 'bg-white/[0.04] border-white/10'
              }`}>
              <div className="flex items-start gap-3">
                {item.emblemId && (
                  <div className="shrink-0 w-14 h-14 flex items-center justify-center rounded-xl bg-black/40 border border-white/10">
                    <ChipsEmblem id={item.emblemId as EmblemId} size={40} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>{item.nameAr}</h3>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold ${r.cls}`}>{r.label}</span>
                    {isEquipped && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-amber-500/50 text-amber-300 font-bold">مُجهَّز</span>}
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed mt-1">{item.hookAr}</p>

                  {item.owned ? (
                    <p className="text-[11px] text-emerald-400 mt-1.5 font-bold">
                      ⏳ متبقٍ {left} {left === 1 ? 'يوم' : 'أيام'}
                      {left <= 3 && <span className="text-amber-400"> — جدّده قبل أن ينتهي</span>}
                    </p>
                  ) : !item.isPurchasable ? (
                    <p className="text-[11px] text-slate-300 mt-1.5 font-bold">🏆 لا يُشترى — يُنال بالإنجاز</p>
                  ) : (
                    <p className="text-[11px] text-amber-400 mt-1.5 font-bold tabular-nums">
                      🪙 {item.priceChips} / {item.durationDays} يوماً
                    </p>
                  )}
                </div>
              </div>

              {/* الأزرار */}
              <div className="flex gap-2 mt-3">
                {canPreview && (
                  <button onClick={() => setTryOn(tryOn?.id === item.id ? null : item)}
                    className="px-3 py-2 rounded-xl text-[11px] font-bold bg-white/5 border border-white/10 text-gray-300">
                    {tryOn?.id === item.id ? '↩︎ إلغاء' : '👀 جرّب'}
                  </button>
                )}

                {item.owned ? (
                  <>
                    {['frame', 'title', 'name_fx'].includes(item.kind) && (
                      isEquipped ? (
                        <button onClick={() => doEquip(null, item.kind)} disabled={busy != null}
                          className="flex-1 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/10 text-gray-300 disabled:opacity-40">
                          إزالة من بطاقتي
                        </button>
                      ) : (
                        <button onClick={() => doEquip(item, item.kind)} disabled={busy != null}
                          className="flex-1 py-2 rounded-xl text-xs font-black bg-amber-500 text-black disabled:opacity-40">
                          🎽 جهّزه الآن
                        </button>
                      )
                    )}
                    <button onClick={() => doRent(item)} disabled={busy != null || !affordable}
                      className="px-3 py-2 rounded-xl text-[11px] font-bold bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 disabled:opacity-40">
                      🔄 جدّد 🪙{item.priceChips}
                    </button>
                  </>
                ) : item.isPurchasable && !item.closed ? (
                  <button onClick={() => doRent(item)} disabled={busy != null || !affordable}
                    className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
                      affordable ? 'bg-amber-500 text-black' : 'bg-white/5 border border-white/10 text-gray-500'
                    }`}>
                    {busy === item.id ? '…' : affordable ? `🛒 استأجر — 🪙 ${item.priceChips}` : 'رصيدك لا يكفي'}
                  </button>
                ) : (
                  <div className="flex-1 py-2 rounded-xl text-xs font-bold text-center bg-white/5 border border-white/10 text-gray-500">
                    {item.closed ? 'أُغلق نهائياً' : 'إنجاز فقط'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* مظهري */}
      {owned.length > 0 && (
        <div className="px-3 mt-8">
          <h2 className="text-sm font-black text-gray-300 mb-2">🎭 مظهري — ما تملكه الآن</h2>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] divide-y divide-white/5">
            {owned.map(o => (
              <div key={o.id} className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs text-gray-300">{o.nameAr}</span>
                <span className={`text-[11px] tabular-nums font-bold ${daysLeft(o.expiresAt) <= 3 ? 'text-amber-400' : 'text-gray-500'}`}>
                  {daysLeft(o.expiresAt)} يوماً
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-600 mt-2 leading-relaxed">
            عند انتهاء المدة يُزال العنصر من بطاقتك تلقائياً — والتجديد يضيف المدة فوق المتبقّي فلا تضيع أيامك.
          </p>
        </div>
      )}

      {/* التنبيه */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-xs font-bold border shadow-2xl max-w-[90%] text-center ${
              toast.ok ? 'bg-emerald-900/90 border-emerald-500/50 text-emerald-200' : 'bg-rose-900/90 border-rose-500/50 text-rose-200'
            }`}>
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
