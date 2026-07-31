'use client';

// ══════════════════════════════════════════════════════
// 🏦 خزنة الدون — متجر اللاعب
//
// كل عنصر إيجار لمدة معلنة — لا تملّك أبدي. جرّب على بطاقتك أنت قبل الشراء.
//
// ⚠️ ما كان مكسوراً هنا (من تدقيق ٢٠٢٦-٠٧-٣٠):
//   • «رصيدك لا يكفي» زرّ رمادي معطّل — أعلى لحظة نيّة شرائية في المنتج كله
//     تنتهي عند حائط. الآن يفتح لوحة تقول كم ينقصك، وكيف تكسبه، وكم يساوي.
//   • ١٣ من ٢١ عنصراً بلا أي صورة — الآن لكل نوع تمثيل يشبه ما سيراه.
//   • «مظهري» قائمة جامدة تكرّر معلومة — الآن خزانة فيها تجديد وتجهيز وحلقة أيام.
//   • عنصر مُغلق نهائياً يظهر كصفّ ميت — الآن قسم يثبت أن الندرة حقيقية.
//   • الشراء يُنهيه إشعار صغير + إعادة تحميل كاملة تُفقد موضع التمرير —
//     الآن احتفال، وتحديث موضعي بلا إعادة جلب.
// ══════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { usePlayer } from '@/context/PlayerContext';
import { getSocket } from '@/lib/socket';
import DynamicMafiaCard from '@/components/DynamicMafiaCard';
import StoreItemVisual from '@/components/StoreItemVisual';
import StorePreviewButton from '@/components/StorePreviewButton';

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
  trialEligible?: boolean;
  achievementAr?: string | null;
  holderName?: string | null;
  soundUrl?: string | null;
  id: number; kind: string; itemKey: string; nameAr: string; hookAr: string;
  rarity: string; priceChips: number; durationDays: number; emblemId?: string | null;
  config: any; isPurchasable: boolean; closed: boolean; owned: boolean; expiresAt: string | null;
  owners: number; isHot: boolean; isNew: boolean; wasOwned: boolean;
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

// الندرة نظام مادّي لا رقاقة نصّ ٩ بكسل
const RARITY: Record<string, { label: string; chip: string; ring: string; glow: string }> = {
  common:      { label: 'شائع',   chip: 'bg-zinc-800 text-zinc-300 border-zinc-600',        ring: 'rgba(161,161,170,0.25)', glow: 'none' },
  rare:        { label: 'نادر',   chip: 'bg-sky-950 text-sky-300 border-sky-700',           ring: 'rgba(56,189,248,0.35)',  glow: '0 0 18px rgba(56,189,248,0.12)' },
  epic:        { label: 'ملحمي',  chip: 'bg-purple-950 text-purple-300 border-purple-700',  ring: 'rgba(192,132,252,0.40)', glow: '0 0 22px rgba(192,132,252,0.16)' },
  myth:        { label: 'أسطوري', chip: 'bg-amber-950 text-amber-300 border-amber-600',     ring: 'rgba(245,158,11,0.50)',  glow: '0 0 26px rgba(245,158,11,0.20)' },
  achievement: { label: 'إنجاز',  chip: 'bg-slate-800 text-slate-200 border-slate-500',     ring: 'rgba(203,213,225,0.40)', glow: '0 0 22px rgba(203,213,225,0.14)' },
};

const SLOT_LABEL: Record<string, string> = { frame: 'إطارك', title: 'لقبك', nameFx: 'تأثير اسمك' };
const SLOT_KIND: Record<string, string> = { frame: 'frame', title: 'title', nameFx: 'name_fx' };

function daysLeft(iso: string | null) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

/** حلقة الأيام المتبقية — نفس نمط الحلقات في صفحة الحساب */
function DaysRing({ left, total }: { left: number; total: number }) {
  const pct = Math.max(0, Math.min(1, total > 0 ? left / total : 0));
  const tone = left <= 3 ? '#fb7185' : left <= 7 ? '#fbbf24' : '#52525b';
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: 34, height: 34 }}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" width={34} height={34}>
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
        <circle cx="18" cy="18" r="15.5" fill="none" stroke={tone} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${pct * 97.4} 97.4`} />
      </svg>
      <span className="text-[10px] font-black tabular-nums" style={{ color: tone }}>{left}</span>
    </span>
  );
}

export default function StorePage() {
  const router = useRouter();
  const { player } = usePlayer();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [cosmetics, setCosmetics] = useState<any>(null);
  const [me, setMe] = useState<{ name?: string; avatarUrl?: string | null; rankTier?: string; gender?: string } | null>(null);
  const [packs, setPacks] = useState<any[]>([]);
  const [earnRates, setEarnRates] = useState<any>(null);
  const [tab, setTab] = useState('frame');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [tryOn, setTryOn] = useState<StoreItem | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [shortfall, setShortfall] = useState<StoreItem | null>(null);
  const [celebrate, setCelebrate] = useState<StoreItem | null>(null);
  const [requestId, setRequestId] = useState(newRequestId());

  const say = (ok: boolean, text: string) => { setToast({ ok, text }); setTimeout(() => setToast(null), 3800); };

  const load = async () => {
    try {
      const d = await api('/api/chips/store');
      setItems(d.items || []);
      setBalance(Number(d.balance || 0));
      setCosmetics(d.cosmetics || null);
      setMe(d.me || null);
      setPacks(d.packs || []);
      setEarnRates(d.earnRates || null);
      setLoadError(false);
    } catch (e: any) {
      // ⚠️ حالة خطأ صريحة: كانت تبدو تماماً كقسم فارغ، بلا إعادة محاولة
      setLoadError(true);
      say(false, e.message || 'تعذّر تحميل الخزنة');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // الرصيد قد يتغيّر ونحن هنا (قطرة فوز، شحن من الإدارة)
  useEffect(() => {
    if (!token()) return;
    const socket = getSocket();
    const onBal = (p: { balance: number }) => setBalance(Number(p?.balance || 0));
    socket.on('chips:balance-updated', onBal);
    return () => { socket.off('chips:balance-updated', onBal); };
  }, []);

  const shown = useMemo(() => items.filter(i => i.kind === tab && !i.closed), [items, tab]);
  const owned = useMemo(() => items.filter(i => i.owned), [items]);
  const closedForever = useMemo(() => items.filter(i => i.closed), [items]);
  const expiringSoon = useMemo(
    () => owned.filter(i => daysLeft(i.expiresAt) <= 3).sort((a, b) => daysLeft(a.expiresAt) - daysLeft(b.expiresAt)),
    [owned],
  );
  const comeback = useMemo(() => items.filter(i => i.wasOwned && i.isPurchasable && !i.closed).slice(0, 4), [items]);
  const featured = useMemo(
    () => items.filter(i => (i.isHot || i.isNew) && !i.owned && i.isPurchasable && !i.closed).slice(0, 4),
    [items],
  );

  // الخانات الفارغة — أقوى دعوة شراء: فراغ في مكان يراه الجميع
  const emptySlots = useMemo(() => {
    if (!cosmetics) return [];
    return (['frame', 'title', 'nameFx'] as const)
      .filter(s => !cosmetics[s])
      .map(s => ({ slot: s, kind: SLOT_KIND[s], label: SLOT_LABEL[s] }));
  }, [cosmetics]);

  const cheapestFor = (kind: string) =>
    items.filter(i => i.kind === kind && i.isPurchasable && !i.closed && !i.owned)
      .sort((a, b) => a.priceChips - b.priceChips)[0];

  // سعر التشبس بالدينار — من الباقات، فالمرساة حقيقية لا مخترعة
  const jodPerChip = useMemo(() => {
    if (!packs.length) return 0;
    const best = packs.reduce((a: any, b: any) => (a.chips / a.jod > b.chips / b.jod ? a : b));
    return best.jod / best.chips;
  }, [packs]);
  const jodOf = (chips: number) => (jodPerChip ? (chips * jodPerChip).toFixed(2) : null);

  const previewCosmetics = useMemo(() => {
    if (!tryOn) return cosmetics;
    const base = { ...(cosmetics || {}) };
    if (tryOn.kind === 'frame') base.frame = { config: tryOn.config, emblemId: tryOn.emblemId ?? null };
    else if (tryOn.kind === 'title') base.title = { config: tryOn.config };
    else if (tryOn.kind === 'name_fx') base.nameFx = { config: tryOn.config };
    return base;
  }, [tryOn, cosmetics]);

  /**
   * 🎁 التجربة المجانية — مرّة واحدة للأبد لكل لاعب (قرار المالك ٩).
   * سبب الرفض يُعرَض كما جاء من الخادم لا برسالة عامة: «استعملتها سابقاً»
   * و«سبق أن اشتريته» قراران مختلفان تماماً بالنسبة للاعب.
   */
  const doTrial = async (item: StoreItem) => {
    setBusy(item.id);
    try {
      const d = await api('/api/chips/store/trial', {
        method: 'POST',
        body: JSON.stringify({ itemId: item.id }),
      });
      setItems(prev => prev.map(i => i.id === item.id
        ? { ...i, owned: true, expiresAt: d.expiresAt, wasOwned: false, trialEligible: false }
        // التجربة مرّة واحدة — فتسقط أهليّتها عن كل العناصر فوراً
        : { ...i, trialEligible: false }));
      setTryOn(null);
      setCelebrate({ ...item, expiresAt: d.expiresAt, owned: true });
      api('/api/chips/store/cosmetics').then(c => setCosmetics(c.cosmetics || null)).catch(() => {});
    } catch (e: any) {
      say(false, e?.message || 'تعذّرت التجربة');
    } finally { setBusy(null); }
  };

  const doRent = async (item: StoreItem) => {
    if (balance < item.priceChips) { setShortfall(item); return; }
    setBusy(item.id);
    try {
      const d = await api('/api/chips/store/rent', {
        method: 'POST',
        body: JSON.stringify({ itemId: item.id, requestId }),
      });
      setRequestId(newRequestId());
      setBalance(Number(d.balance ?? balance));
      if (!d.expiresAt) {
        say(false, 'تمّت العملية لكن لم نتأكّد من تفعيل العنصر — أعد فتح الخزنة، وراجع الإدارة إن لم يظهر');
        load();
        return;
      }
      // 🎉 تحديث موضعي: لا إعادة جلب تُفقد موضع التمرير وتُعيد إطلاق الإشعارات
      setItems(prev => prev.map(i => i.id === item.id
        ? { ...i, owned: true, expiresAt: d.expiresAt, wasOwned: false, owners: i.owners + (item.owned ? 0 : 1) }
        : i));
      setTryOn(null);
      setCelebrate({ ...item, expiresAt: d.expiresAt, owned: true });
      // المظهر يصله البثّ من الخادم؛ نجلبه لتحديث الخانات المُجهَّزة
      api('/api/chips/store/cosmetics').then(c => setCosmetics(c.cosmetics || null)).catch(() => {});
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
  const myName = me?.name || player?.name || 'أنت';

  // ── بطاقة عنصر ──
  const ItemCard = ({ item }: { item: StoreItem }) => {
    const r = RARITY[item.rarity] || RARITY.common;
    const isEquipped = equippedIdFor(item.kind) === item.id;
    const left = daysLeft(item.expiresAt);
    const affordable = balance >= item.priceChips;
    const perDay = item.durationDays > 0 ? (item.priceChips / item.durationDays) : 0;
    const jod = jodOf(item.priceChips);

    return (
      <div className="rounded-2xl p-3.5 border transition-all"
        style={{
          background: isEquipped ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.035)',
          borderColor: isEquipped ? 'rgba(245,158,11,0.45)' : r.ring,
          boxShadow: item.rarity === 'myth' || item.rarity === 'epic' ? r.glow : undefined,
        }}>
        <div className="flex items-start gap-3">
          <StoreItemVisual item={item} playerName={myName} size={56} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-base font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>{item.nameAr}</h3>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold ${r.chip}`}>{r.label}</span>
              {isEquipped && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-amber-500/50 text-amber-300 font-bold">مُجهَّز</span>}
              {item.isHot && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-rose-500/40 text-rose-300 font-bold">🔥 الأكثر طلباً</span>}
              {item.isNew && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-emerald-500/40 text-emerald-300 font-bold">✦ جديد</span>}
              {item.wasOwned && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-sky-500/40 text-sky-300 font-bold">كان لك</span>}
            </div>

            {/* جملة البيع مُرقّاة إلى نصّ أساسي — كانت أصغر نصّ في البطاقة */}
            {item.hookAr && <p className="text-[12.5px] text-gray-300 leading-relaxed mt-1">{item.hookAr}</p>}

            {/* ▶︎ معاينة ما لا يُرى — والنغمة تُسمَع قبل الشراء */}
            <StorePreviewButton item={item} playerName={myName} />

            {/* دليل اجتماعي — يُكتم تحت الثلاثة كي لا ينقلب إلى دليل عكسي */}
            {item.owners >= 3 && (
              <p className="text-[10px] text-gray-500 mt-1">يملكه {item.owners} لاعباً الآن</p>
            )}

            {item.owned ? (
              <p className="text-[11px] text-emerald-400 mt-1.5 font-bold">
                ⏳ متبقٍ {left} {left === 1 ? 'يوم' : 'أيام'}
                {left <= 3 && <span className="text-amber-400"> — جدّده قبل أن ينتهي</span>}
              </p>
            ) : !item.isPurchasable ? (
              <p className="text-[11px] text-slate-300 mt-1.5 font-bold">🏆 لا يُشترى — يُنال بالإنجاز (بطل الموسم)</p>
            ) : (
              <p className="text-[11px] mt-1.5 font-bold tabular-nums text-amber-400">
                🪙 {item.priceChips} / {item.durationDays} يوماً
                <span className="text-gray-500 font-normal"> · {perDay.toFixed(1)} 🪙 يومياً</span>
                {jod && <span className="text-gray-600 font-normal"> · ≈ {jod} د.أ</span>}
              </p>
            )}
          </div>
        </div>

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
              <button onClick={() => doRent(item)} disabled={busy != null}
                className="px-3 py-2 rounded-xl text-[11px] font-bold bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 disabled:opacity-40">
                🔄 جدّد 🪙{item.priceChips}
              </button>
            </>
          ) : item.isPurchasable ? (
            /* ⚠️ الزرّ فعّال دائماً: نقص الرصيد يفتح مساراً لا يوقف اللاعب عند حائط */
            <button onClick={() => doRent(item)} disabled={busy === item.id}
              className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${affordable
                ? 'text-black' : 'bg-white/5 border border-amber-500/30 text-amber-300'}`}
              style={affordable ? { background: 'linear-gradient(135deg,#fbbf24,#d97706)', boxShadow: '0 0 20px rgba(251,191,36,0.2)' } : undefined}>
              {busy === item.id ? '…' : affordable
                ? `🛒 استأجر — 🪙 ${item.priceChips}`
                : `ينقصك ${item.priceChips - balance} 🪙 — كيف أحصل عليها؟`}
            </button>
          ) : (
            <div className="flex-1 py-2 px-3 rounded-xl text-center bg-white/5 border border-white/10">
              {/* كان «إنجاز فقط» وحدها: صندوق رمادي لا يقول أيّ إنجاز
                  ولا من ناله — طموح معروض بلا طريق إليه. */}
              <div className="text-xs font-bold text-gray-300">
                👑 {item.achievementAr ? `يُنال بـ${item.achievementAr}` : 'إنجاز فقط'}
              </div>
              {item.holderName && (
                <div className="text-[10px] text-amber-400/80 mt-0.5">يحمله الآن: {item.holderName}</div>
              )}
            </div>
          )}

          {/* 🎁 التجربة المجانية — تظهر فقط حيث تُقبل فعلاً،
              فلا يراها لاعب ليُرفض عند الضغط */}
          {item.trialEligible && (
            <button onClick={() => doTrial(item)} disabled={busy === item.id}
              className="px-3 py-2 rounded-xl text-[11px] font-black bg-sky-600/20 border border-sky-500/40 text-sky-200 hover:bg-sky-600/30 transition-all disabled:opacity-40">
              🎁 جرّبه ٣ أيام
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#050505] pb-28">
      {/* الترويسة */}
      <div className="sticky top-0 z-30 px-4 py-3 backdrop-blur-xl bg-[#050505]/85 border-b border-amber-500/15">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <button onClick={() => router.push('/player/home')} className="text-gray-500 text-sm px-2 py-1">← رجوع</button>
          <h1 className="text-lg font-black text-amber-400" style={{ fontFamily: 'Amiri, serif' }}>🏦 خزنة الدون</h1>
          <button onClick={() => router.push('/player/wallet')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-black tabular-nums"
            style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.16), rgba(245,158,11,0.05))', border: '1px solid rgba(245,158,11,0.32)', color: '#fbbf24' }}>
            🪙 {balance.toLocaleString('en-US')}
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4">
        {/* ── البطل: بطاقتك كما يراها الجميع ── */}
        <div className="mt-5 rounded-2xl p-5 flex flex-col items-center"
          style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(5,5,5,0.9))', border: '1px solid rgba(251,191,36,0.15)' }}>
          <div style={{ paddingTop: 30 }} className="relative">
            <DynamicMafiaCard
              playerNumber={player?.playerId ?? 1}
              playerName={myName}
              role={null}
              gender={me?.gender === 'FEMALE' ? 'FEMALE' : 'MALE'}
              size="lg"
              flippable={false}
              rankTier={me?.rankTier || 'INFORMANT'}
              avatarUrl={me?.avatarUrl || null}
              cosmetics={previewCosmetics}
            />
          </div>
          <p className="text-[11px] text-gray-500 mt-3 text-center">
            {tryOn ? `👀 تُعاين «${tryOn.nameAr}» — لم تُشترَ بعد` : 'بطاقتك كما يراها كل من في القاعة'}
          </p>
          {tryOn && (
            <button onClick={() => setTryOn(null)}
              className="mt-2 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white/5 border border-white/10 text-gray-300">
              إلغاء المعاينة
            </button>
          )}

          {/* الخانات الفارغة — الفراغ في مكان يراه الجميع */}
          {!tryOn && emptySlots.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {emptySlots.map(s => {
                const cheap = cheapestFor(s.kind);
                return (
                  <button key={s.slot} onClick={() => { setTab(s.kind); }}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-white/5 border border-dashed border-amber-500/30 text-amber-300/90">
                    {s.label} فاضي{cheap ? ` — من 🪙${cheap.priceChips}` : ''}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── ينتهي قريباً ── */}
        {expiringSoon.length > 0 && (
          <section className="mt-5">
            <h2 className="text-sm font-black text-rose-300 mb-2">⏳ ينتهي قريباً</h2>
            <div className="space-y-2">
              {expiringSoon.map(i => (
                <div key={i.id} className="flex items-center gap-3 rounded-2xl p-3 border border-rose-500/25 bg-rose-950/10">
                  <DaysRing left={daysLeft(i.expiresAt)} total={i.durationDays} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 font-bold truncate">{i.nameAr}</p>
                    <p className="text-[10px] text-gray-500">يُزال من بطاقتك تلقائياً عند انتهائه</p>
                  </div>
                  <button onClick={() => doRent(i)} disabled={busy != null}
                    className="px-3 py-2 rounded-xl text-[11px] font-black bg-amber-500 text-black disabled:opacity-40">
                    جدّد 🪙{i.priceChips}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── مختارات ── */}
        {featured.length > 0 && (
          <section className="mt-5">
            <h2 className="text-sm font-black text-gray-300 mb-2">🔥 الأكثر طلباً وجديد الخزنة</h2>
            <div className="space-y-3">{featured.map(i => <ItemCard key={`f${i.id}`} item={i} />)}</div>
          </section>
        )}

        {/* ── كان لك ── */}
        {comeback.length > 0 && (
          <section className="mt-5">
            <h2 className="text-sm font-black text-sky-300 mb-2">↩︎ كان لك — استرجعه</h2>
            <div className="space-y-3">{comeback.map(i => <ItemCard key={`c${i.id}`} item={i} />)}</div>
          </section>
        )}

        {/* ── التبويبات ── */}
        <div className="mt-6 -mx-4 px-4 overflow-x-auto">
          <div className="flex gap-2 pb-2 min-w-max">
            {KIND_TABS.map(t => {
              const n = items.filter(i => i.kind === t.key && !i.closed).length;
              if (n === 0) return null;
              return (
                <button key={t.key} onClick={() => { setTab(t.key); setTryOn(null); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                    tab === t.key ? 'bg-amber-500/15 border-amber-500/50 text-amber-300' : 'bg-white/5 border-white/10 text-gray-400'
                  }`}>
                  {t.icon} {t.label} <span className="opacity-50 tabular-nums">{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── العناصر ── */}
        <div className="mt-3 space-y-3">
          {loading && <p className="text-center text-gray-600 text-sm py-10">جارٍ فتح الخزنة…</p>}

          {!loading && loadError && (
            <div className="text-center py-10 px-6 rounded-2xl border border-dashed border-rose-500/30">
              <p className="text-rose-300 text-sm mb-3">تعذّر فتح الخزنة</p>
              <button onClick={() => { setLoading(true); load(); }}
                className="px-4 py-2 rounded-xl text-xs font-black bg-amber-500 text-black">أعد المحاولة</button>
            </div>
          )}

          {!loading && !loadError && shown.length === 0 && (
            <p className="text-center text-gray-600 text-sm py-10">لا عناصر في هذا القسم بعد</p>
          )}

          {shown.map(item => <ItemCard key={item.id} item={item} />)}
        </div>

        {/* ── الخزانة ── */}
        {owned.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-black text-gray-300 mb-2">🎭 خزانتي</h2>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] divide-y divide-white/5">
              {owned.map(o => {
                const left = daysLeft(o.expiresAt);
                const slotKind = ['frame', 'title', 'name_fx'].includes(o.kind);
                const isEquipped = equippedIdFor(o.kind) === o.id;
                return (
                  <div key={o.id} className="flex items-center gap-3 px-3 py-3">
                    <DaysRing left={left} total={o.durationDays} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-200 font-bold truncate">{o.nameAr}</p>
                      <p className="text-[10px] text-gray-500">
                        {slotKind
                          ? (isEquipped ? 'مُجهَّز على بطاقتك' : 'في خزانتك — غير مُجهَّز')
                          : 'يعمل تلقائياً ما دام إيجارك سارياً'}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {slotKind && !isEquipped && (
                        <button onClick={() => doEquip(o, o.kind)} disabled={busy != null}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-black bg-amber-500 text-black disabled:opacity-40">جهّز</button>
                      )}
                      <button onClick={() => doRent(o)} disabled={busy != null}
                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-white/5 border border-white/10 text-gray-300 disabled:opacity-40">جدّد</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-600 mt-2 leading-relaxed">
              عند انتهاء المدة يُزال العنصر من بطاقتك تلقائياً — والتجديد يضيف المدة فوق المتبقّي فلا تضيع أيامك.
            </p>
          </section>
        )}

        {/* ── خزنة مقفلة: الندرة حقيقية ── */}
        {closedForever.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-black text-gray-400 mb-1">🔒 خزنة مقفلة — لا تعود</h2>
            <p className="text-[11px] text-gray-600 mb-2">أُغلقت نهائياً. من اقتناها احتفظ بشيء لن يُطرح ثانيةً.</p>
            <div className="rounded-2xl border border-white/[0.06] bg-black/30 divide-y divide-white/5">
              {closedForever.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 opacity-70">
                  <StoreItemVisual item={c} playerName={myName} size={34} />
                  <p className="flex-1 text-xs text-gray-400 truncate">{c.nameAr}</p>
                  {c.owners > 0 && <span className="text-[10px] text-gray-600 shrink-0">{c.owners} يملكونها</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* كيف أكسب */}
        {earnRates && (
          <div className="mt-8 rounded-2xl p-4 border border-amber-500/20 bg-amber-500/[0.06]">
            <h3 className="text-sm font-black text-amber-400 mb-2">كيف تكسب تشبس؟</h3>
            <ul className="text-[12.5px] text-gray-400 space-y-1.5 leading-relaxed">
              {earnRates.win > 0 && <li>🏆 اربح المباراة — <b className="text-amber-400">+{earnRates.win}</b></li>}
              {earnRates.top3 > 0 && <li>🥉 ضمن أفضل ثلاثة — <b className="text-amber-400">+{earnRates.top3}</b></li>}
              {earnRates.birthday > 0 && <li>🎂 عيد ميلادك — <b className="text-amber-400">+{earnRates.birthday}</b></li>}
              <li>💵 أو اشحن من الإدارة بالحضور</li>
            </ul>
          </div>
        )}
      </div>

      {/* ══ لوحة النقص — بديل الحائط الرمادي ══ */}
      <AnimatePresence>
        {shortfall && (
          <motion.div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShortfall(null)}>
            <motion.div className="w-full max-w-lg mx-auto rounded-t-3xl p-6 pb-10"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              style={{ background: 'linear-gradient(180deg,#1a1a1a,#0a0a0a)', border: '1px solid rgba(251,191,36,0.2)', borderBottom: 'none' }}
              onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
              <h3 className="text-base font-black text-white text-center" style={{ fontFamily: 'Amiri, serif' }}>
                ينقصك {shortfall.priceChips - balance} 🪙 لـ«{shortfall.nameAr}»
              </h3>

              <div className="mt-4">
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <motion.div className="h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (balance / Math.max(1, shortfall.priceChips)) * 100)}%` }}
                    style={{ background: 'linear-gradient(90deg,#fbbf24,#d97706)' }} />
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5 text-center tabular-nums">
                  {balance} من {shortfall.priceChips} 🪙
                </p>
              </div>

              {earnRates && (
                <div className="mt-5">
                  <h4 className="text-xs font-black text-gray-300 mb-2">اكسبها باللعب</h4>
                  <ul className="text-[12.5px] text-gray-400 space-y-1">
                    {earnRates.win > 0 && (
                      <li>🏆 كل فوز <b className="text-amber-400">+{earnRates.win}</b> — أي {Math.ceil((shortfall.priceChips - balance) / earnRates.win)} فوزاً</li>
                    )}
                    {earnRates.top3 > 0 && <li>🥉 ضمن أفضل ثلاثة <b className="text-amber-400">+{earnRates.top3}</b></li>}
                    {earnRates.birthday > 0 && <li>🎂 عيديّة النادي <b className="text-amber-400">+{earnRates.birthday}</b></li>}
                  </ul>
                </div>
              )}

              {packs.length > 0 && (
                <div className="mt-5">
                  <h4 className="text-xs font-black text-gray-300 mb-2">أو اشحن من الإدارة</h4>
                  <div className="space-y-1.5">
                    {packs.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between rounded-xl px-3 py-2 bg-white/[0.04] border border-white/8">
                        <span className="text-xs text-gray-300 font-bold">{p.jod} د.أ</span>
                        <span className="text-xs text-amber-400 font-black tabular-nums">{p.chips} 🪙</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2 text-center">
                    الشحن يتم في النادي عند الحضور — كلّم الإدارة.
                  </p>
                </div>
              )}

              <button onClick={() => setShortfall(null)}
                className="w-full mt-6 py-3 rounded-xl font-black text-sm bg-white/5 border border-white/10 text-gray-300">
                تمام
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ احتفال الشراء ══ */}
      <AnimatePresence>
        {celebrate && (
          <motion.div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setCelebrate(null)}>
            <motion.div className="text-center" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 16 }} onClick={e => e.stopPropagation()}>
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(circle at center, rgba(245,158,11,0.22), transparent 60%)' }} />
              <div style={{ paddingTop: 30 }} className="relative inline-block">
                <DynamicMafiaCard
                  playerNumber={player?.playerId ?? 1}
                  playerName={myName}
                  role={null}
                  gender={me?.gender === 'FEMALE' ? 'FEMALE' : 'MALE'}
                  size="lg"
                  flippable={false}
                  rankTier={me?.rankTier || 'INFORMANT'}
                  avatarUrl={me?.avatarUrl || null}
                  cosmetics={(() => {
                    const b = { ...(cosmetics || {}) };
                    if (celebrate.kind === 'frame') b.frame = { config: celebrate.config, emblemId: celebrate.emblemId ?? null };
                    if (celebrate.kind === 'title') b.title = { config: celebrate.config };
                    if (celebrate.kind === 'name_fx') b.nameFx = { config: celebrate.config };
                    return b;
                  })()}
                />
              </div>
              <h3 className="relative text-xl font-black text-amber-400 mt-5" style={{ fontFamily: 'Amiri, serif' }}>
                صار «{celebrate.nameAr}» لك
              </h3>
              <p className="relative text-xs text-gray-400 mt-1">
                {daysLeft(celebrate.expiresAt)} يوماً — وسيراه كل من في القاعة على الشاشة
              </p>
              <div className="relative flex gap-2 mt-5 justify-center">
                {['frame', 'title', 'name_fx'].includes(celebrate.kind) && equippedIdFor(celebrate.kind) !== celebrate.id && (
                  <button onClick={() => { doEquip(celebrate, celebrate.kind); setCelebrate(null); }}
                    className="px-4 py-2.5 rounded-xl text-xs font-black bg-amber-500 text-black">🎽 جهّزها الآن</button>
                )}
                <button onClick={() => setCelebrate(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white/10 border border-white/15 text-gray-200">
                  شوف باقي الخزنة
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* التنبيه */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-xl text-xs font-bold border shadow-2xl max-w-[90%] text-center ${
              toast.ok ? 'bg-emerald-900/90 border-emerald-500/50 text-emerald-200' : 'bg-rose-900/90 border-rose-500/50 text-rose-200'
            }`}>
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
