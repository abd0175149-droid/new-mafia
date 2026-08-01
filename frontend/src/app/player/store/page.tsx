'use client';

// ══════════════════════════════════════════════════════
// 🏦 خزنة الدون — متجر اللاعب
//
// كل عنصر إيجار لمدة معلنة — لا تملّك أبدي.
//
// 📐 المبدأ الحاكم بعد إعادة التصميم (معتمَد ٢٠٢٦-٠٨-٠١): **المرآة**.
//    المتجر يبيع مظهراً، والمظهر لا يُوصف بل يُرى — فالمنتَج ليس القائمة
//    بل البطاقة. لذلك:
//      • البطاقة مثبَّتة أعلى الشاشة دائماً.
//      • **اللمس هو التجربة** — لا زرّ «جرّب» إطلاقاً.
//      • زرّ أساسي واحد في المرآة: الشراء. ولا أزرار على بطاقات العناصر.
//      • كل معاينة تحاكي موضع العنصر في الواقع.
//
// ⚠️ ما كان مكسوراً في النسخة السابقة (مراجعة ٢٠٢٦-٠٨-٠١):
//   • «جرّب» يُغيّر بطاقةً في أعلى الصفحة واللاعب عند العنصر العاشر —
//     يضغط ولا يرى شيئاً، فيظنّ الزرّ معطّلاً. أخطر عطل: آلية البيع
//     كلّها غير مرئية لحظة استعمالها.
//   • حتى ٤ أزرار على البطاقة الواحدة تلتفّ سطرين على ٣٦٠px، ولا واحد
//     منها أساسي بصرياً. ومعها زرّ معاينة ثانٍ = مفهومان متنافسان.
//   • العنصر الواحد يظهر ٣ مرّات (مختارات · كان لك · تبويبه).
//   • ≈٤٠٠٠px من مستطيلات متشابهة بارتفاع ١٩٠px لكل عنصر.
// ══════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { usePlayer } from '@/context/PlayerContext';
import { getSocket } from '@/lib/socket';
import DynamicMafiaCard from '@/components/DynamicMafiaCard';
import StoreItemVisual from '@/components/StoreItemVisual';
import EliminationFx from '@/components/EliminationFx';
import EntranceStage from '@/components/EntranceStage';
import { trackStore, installFunnelFlush } from '@/lib/store-funnel';

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

/** ما يُلبَس على البطاقة — يُعاين على المرآة فوراً، ويُعرض في شبكة */
const WEARABLE = ['frame', 'title', 'name_fx'];
/** ما يُعرَض أو يُسمَع — معاينته زمنيّة، فيُعرض في صفوف بزرّ تشغيل */
const TEMPORAL = ['entrance', 'elimination', 'victory_sting'];

const KIND_TABS: { key: string; label: string; icon: string }[] = [
  { key: 'frame', label: 'إطارات', icon: '🃏' },
  { key: 'title', label: 'ألقاب', icon: '🏷️' },
  { key: 'name_fx', label: 'الاسم', icon: '✨' },
  { key: 'entrance', label: 'تشريفات', icon: '🚪' },
  { key: 'elimination', label: 'إقصاء', icon: '🔥' },
  { key: 'victory_sting', label: 'نغمات', icon: '🔊' },
  { key: 'xp_boost', label: 'معزّزات', icon: '⚡' },
];

const RARITY_DOT: Record<string, string> = {
  common: '#9ca3af', rare: '#38bdf8', epic: '#c084fc', myth: '#f59e0b', achievement: '#e2e8f0',
};
const RARITY_LABEL: Record<string, string> = {
  common: 'شائع', rare: 'نادر', epic: 'ملحمي', myth: 'أسطوري', achievement: 'إنجاز',
};

const SLOT_LABEL: Record<string, string> = { frame: 'إطارك', title: 'لقبك', nameFx: 'تأثير اسمك' };
const SLOT_KIND: Record<string, string> = { frame: 'frame', title: 'title', nameFx: 'name_fx' };

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
  const [me, setMe] = useState<{ name?: string; avatarUrl?: string | null; rankTier?: string; gender?: string } | null>(null);
  const [packs, setPacks] = useState<any[]>([]);
  const [earnRates, setEarnRates] = useState<any>(null);
  const [tab, setTab] = useState('offers');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  /** العنصر المُعايَن على المرآة — اللمس هو التجربة، فلا زرّ لها */
  const [tryOn, setTryOn] = useState<StoreItem | null>(null);
  /** معاينة زمنيّة جارية فوق المرآة (تشريفة · إقصاء · نغمة) */
  const [stage, setStage] = useState<StoreItem | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [shortfall, setShortfall] = useState<StoreItem | null>(null);
  const [celebrate, setCelebrate] = useState<StoreItem | null>(null);
  const [requestId, setRequestId] = useState(newRequestId());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setLoadError(true);
      say(false, e.message || 'تعذّر تحميل الخزنة');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    trackStore('open');
    return installFunnelFlush();
  }, []);

  useEffect(() => {
    if (!token()) return;
    const socket = getSocket();
    const onBal = (p: { balance: number }) => setBalance(Number(p?.balance || 0));
    socket.on('chips:balance-updated', onBal);
    return () => { socket.off('chips:balance-updated', onBal); };
  }, []);

  // إيقاف أي معاينة زمنيّة عند مغادرة الصفحة — صوت يتبع اللاعب خارج المتجر عطل
  useEffect(() => () => {
    audioRef.current?.pause();
    if (stageTimer.current) clearTimeout(stageTimer.current);
  }, []);

  const owned = useMemo(() => items.filter(i => i.owned), [items]);
  const closedForever = useMemo(() => items.filter(i => i.closed), [items]);
  const expiringSoon = useMemo(
    () => owned.filter(i => daysLeft(i.expiresAt) <= 3).sort((a, b) => daysLeft(a.expiresAt) - daysLeft(b.expiresAt)),
    [owned],
  );

  /**
   * 🔥 العروض — الأكثر طلباً · جديد · كان لك، مجموعةً واحدة.
   * قرار مقفل: **العنصر لا يتكرّر** — يظهر هنا ويُستبعد من تبويب نوعه،
   * فلا يرى اللاعب البطاقة نفسها ثلاث مرّات بثلاثة أزرار شراء.
   */
  const offers = useMemo(
    () => items.filter(i => (i.isHot || i.isNew || i.wasOwned) && !i.owned && i.isPurchasable && !i.closed).slice(0, 6),
    [items],
  );
  const offerIds = useMemo(() => new Set(offers.map(i => i.id)), [offers]);

  const shown = useMemo(() => {
    if (tab === 'offers') return offers;
    if (tab === 'mine') return owned;
    return items.filter(i => i.kind === tab && !i.closed && !offerIds.has(i.id));
  }, [items, tab, offers, offerIds, owned]);

  const tabs = useMemo(() => {
    const list: { key: string; label: string; icon: string; n: number }[] = [];
    if (offers.length) list.push({ key: 'offers', label: 'عروض', icon: '🔥', n: offers.length });
    for (const t of KIND_TABS) {
      const n = items.filter(i => i.kind === t.key && !i.closed && !offerIds.has(i.id)).length;
      if (n > 0) list.push({ ...t, n });
    }
    if (owned.length) list.push({ key: 'mine', label: 'خزانتي', icon: '🎭', n: owned.length });
    return list;
  }, [items, offers, offerIds, owned]);

  // التبويب الافتراضي يجب أن يكون موجوداً فعلاً
  useEffect(() => {
    if (!loading && tabs.length && !tabs.some(t => t.key === tab)) setTab(tabs[0].key);
  }, [loading, tabs, tab]);

  const emptySlots = useMemo(() => {
    if (!cosmetics) return [];
    return (['frame', 'title', 'nameFx'] as const)
      .filter(s => !cosmetics[s])
      .map(s => ({ slot: s, kind: SLOT_KIND[s], label: SLOT_LABEL[s] }));
  }, [cosmetics]);

  const cheapestFor = (kind: string) =>
    items.filter(i => i.kind === kind && i.isPurchasable && !i.closed && !i.owned)
      .sort((a, b) => a.priceChips - b.priceChips)[0];

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

  const equippedIdFor = (kind: string) => {
    if (!cosmetics) return null;
    if (kind === 'frame') return cosmetics.frame?.itemId ?? null;
    if (kind === 'title') return cosmetics.title?.itemId ?? null;
    if (kind === 'name_fx') return cosmetics.nameFx?.itemId ?? null;
    return null;
  };

  const myName = me?.name || player?.name || 'أنت';

  // ── الأفعال ───────────────────────────────────────────

  const doTrial = async (item: StoreItem) => {
    setBusy(item.id);
    try {
      const d = await api('/api/chips/store/trial', { method: 'POST', body: JSON.stringify({ itemId: item.id }) });
      setItems(prev => prev.map(i => i.id === item.id
        ? { ...i, owned: true, expiresAt: d.expiresAt, wasOwned: false, trialEligible: false }
        : { ...i, trialEligible: false }));
      setTryOn(null);
      setCelebrate({ ...item, expiresAt: d.expiresAt, owned: true });
      api('/api/chips/store/cosmetics').then(c => setCosmetics(c.cosmetics || null)).catch(() => {});
    } catch (e: any) {
      say(false, e?.message || 'تعذّرت التجربة');
    } finally { setBusy(null); }
  };

  const doRent = async (item: StoreItem) => {
    if (balance < item.priceChips) {
      trackStore('shortfall', item.id);
      setShortfall(item);
      return;
    }
    setBusy(item.id);
    try {
      const d = await api('/api/chips/store/rent', {
        method: 'POST', body: JSON.stringify({ itemId: item.id, requestId }),
      });
      setRequestId(newRequestId());
      setBalance(Number(d.balance ?? balance));
      if (!d.expiresAt) {
        say(false, 'تمّت العملية لكن لم نتأكّد من تفعيل العنصر — أعد فتح الخزنة، وراجع الإدارة إن لم يظهر');
        load();
        return;
      }
      setItems(prev => prev.map(i => i.id === item.id
        ? { ...i, owned: true, expiresAt: d.expiresAt, wasOwned: false, owners: i.owners + (item.owned ? 0 : 1) }
        : i));
      setTryOn(null);
      setCelebrate({ ...item, expiresAt: d.expiresAt, owned: true });
      api('/api/chips/store/cosmetics').then(c => setCosmetics(c.cosmetics || null)).catch(() => {});
    } catch (e: any) {
      say(false, e.message || 'تعذّر إتمام العملية');
    } finally { setBusy(null); }
  };

  const doEquip = async (item: StoreItem | null, kind: string) => {
    setBusy(item?.id ?? -1);
    try {
      const d = await api('/api/chips/store/equip', {
        method: 'POST', body: JSON.stringify({ kind, itemId: item?.id ?? null }),
      });
      setCosmetics(d.cosmetics || null);
      setTryOn(null);
      say(true, item ? `🎽 جُهِّز «${item.nameAr}»` : 'أُزيل من بطاقتك');
    } catch (e: any) {
      say(false, e.message || 'تعذّر التجهيز');
    } finally { setBusy(null); }
  };

  /**
   * 🎬 المعاينة الزمنيّة — تُشغَّل **فوق المرآة**، لأن هذا موضعها في الواقع:
   * التشريفة حول بطاقتك، والإقصاء يحرق بطاقتك، والنغمة تُعزف وأنت تنظر إليها.
   *
   * 🔇 النغمة تُشغَّل على سمّاعة اللاعب وحده ولا تمرّ بأي مسار بثّ — جهاز
   *    القائد مصدر صوت القاعة الحصري، ومعاينةٌ تُبَثّ تعني نغمة نصر تُسمَع
   *    في الصالة لأن أحدهم يتصفّح المتجر.
   */
  const playStage = (item: StoreItem) => {
    if (stageTimer.current) clearTimeout(stageTimer.current);
    audioRef.current?.pause();

    if (item.kind === 'victory_sting') {
      if (!item.soundUrl) { say(false, 'لا ملف صوت لهذه النغمة بعد'); return; }
      try {
        const a = new Audio(item.soundUrl);
        a.volume = 0.85;
        audioRef.current = a;
        a.onended = () => setStage(null);
        void a.play().catch(() => setStage(null));
      } catch { /* المعاينة زخرفة */ }
    }

    setStage(item);
    const ms = item.kind === 'entrance'
      ? Math.min(6000, Math.max(1500, Number(item.config?.durationMs) || 3500))
      : item.kind === 'elimination' ? 3200 : 6000;
    stageTimer.current = setTimeout(() => setStage(null), ms);
  };

  /** لمسة على أي عنصر = تجربته. لا زرّ «جرّب» في هذه الشاشة. */
  const pick = (item: StoreItem) => {
    trackStore('try_on', item.id);
    if (WEARABLE.includes(item.kind)) {
      setStage(null);
      setTryOn(tryOn?.id === item.id ? null : item);
    } else {
      setTryOn(item);
      playStage(item);
    }
  };

  const clearPick = () => {
    setTryOn(null);
    setStage(null);
    audioRef.current?.pause();
    if (stageTimer.current) clearTimeout(stageTimer.current);
  };

  // ── المرآة ────────────────────────────────────────────

  const sel = tryOn;
  const selEquipped = sel ? equippedIdFor(sel.kind) === sel.id : false;
  const selLeft = sel ? daysLeft(sel.expiresAt) : 0;

  const MirrorStage = () => {
    if (!stage) return null;
    if (stage.kind === 'elimination') {
      return <EliminationFx config={stage.config} className="!rounded-xl" />;
    }
    if (stage.kind === 'entrance') {
      return stage.config?.design === 'custom'
        ? <EntranceStage elements={stage.config?.elements} playerName={myName} className="!rounded-xl" />
        : (
          <div className="absolute inset-0 rounded-xl overflow-hidden flex flex-col items-center justify-center gap-1"
            style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(69,26,3,0.95), #000)' }}>
            <motion.span initial={{ scale: 2.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="text-2xl">
              {stage.config?.design === 'seal' ? '🩸' : stage.config?.design === 'neon' ? '⚡'
                : stage.config?.design === 'file' ? '🗂️' : '👑'}
            </motion.span>
            <motion.span initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }} className="text-sm font-black text-amber-300"
              style={{ fontFamily: 'Amiri, serif' }}>
              {myName}
            </motion.span>
          </div>
        );
    }
    // نغمة — موجة صوتية فوق البطاقة أثناء العزف
    return (
      <div className="absolute inset-0 rounded-xl bg-black/55 flex items-center justify-center gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <motion.span key={i} className="w-1 rounded-full bg-amber-400"
            animate={{ scaleY: [0.5, 1.3, 0.5] }}
            transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.07 }}
            style={{ height: 12 + ((i * 13) % 24) }} />
        ))}
      </div>
    );
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#050505] pb-24">
      {/* ══ الترويسة ══ */}
      <div className="sticky top-0 z-40 px-3 py-2.5 backdrop-blur-xl bg-[#050505]/92 border-b border-amber-500/15">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          <button onClick={() => router.push('/player/home')} className="text-gray-500 text-xs px-1.5 py-1">← رجوع</button>
          <h1 className="text-base font-black text-amber-400" style={{ fontFamily: 'Amiri, serif' }}>🏦 خزنة الدون</h1>
          <button onClick={() => router.push('/player/wallet')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[13px] font-black tabular-nums"
            style={{ background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.32)', color: '#fbbf24' }}>
            🪙 {balance.toLocaleString('en-US')}
          </button>
        </div>
      </div>

      {/* ══ المرآة — مثبَّتة، وكل لمسة تُطبَّق عليها فوراً ══ */}
      <div className="sticky top-[45px] z-30 backdrop-blur-lg border-b border-white/[0.07]"
        style={{ background: 'linear-gradient(180deg,rgba(5,5,5,.97),rgba(5,5,5,.88))' }}>
        <div className="max-w-lg mx-auto px-3 py-2.5 flex gap-3 items-center">
          <div className="relative shrink-0" style={{ width: 92 }}>
            <div className="origin-top" style={{ transform: 'scale(0.52)', width: 177, height: 248, marginBottom: -119, marginRight: -43 }}>
              <DynamicMafiaCard
                playerNumber={player?.playerId ?? 1}
                playerName={myName}
                role={null}
                gender={me?.gender === 'FEMALE' ? 'FEMALE' : 'MALE'}
                size="md"
                flippable={false}
                rankTier={me?.rankTier || 'INFORMANT'}
                avatarUrl={me?.avatarUrl || null}
                cosmetics={previewCosmetics}
              />
            </div>
            <AnimatePresence>
              {stage && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                  <MirrorStage />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex-1 min-w-0">
            {!sel ? (
              <>
                <p className="text-[11px] text-gray-400">بطاقتك كما يراها كل من في القاعة</p>
                {emptySlots.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {emptySlots.map(s => {
                      const cheap = cheapestFor(s.kind);
                      return (
                        <button key={s.slot} onClick={() => setTab(s.kind)}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold border border-dashed border-amber-500/30 text-amber-300/90 bg-amber-500/[0.06]">
                          {s.label} فاضي{cheap ? ` — من 🪙${cheap.priceChips}` : ''}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-600 mt-1.5 leading-relaxed">المس أي عنصر لتراه على بطاقتك فوراً</p>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: RARITY_DOT[sel.rarity] }} />
                  <p className="text-[10px] text-gray-500">
                    {sel.owned ? 'تملكه' : !sel.isPurchasable ? '👑 إنجاز' : 'تعاينه الآن'} · {RARITY_LABEL[sel.rarity] || sel.rarity}
                  </p>
                </div>
                <h2 className="text-[15px] font-black text-white leading-tight truncate" style={{ fontFamily: 'Amiri, serif' }}>
                  {sel.nameAr}
                </h2>
                {/* جملة البيع مكانها هنا لا في الشبكة — يقرؤها من اهتمّ فعلاً */}
                {sel.hookAr && <p className="text-[10.5px] text-gray-400 leading-snug mt-0.5 line-clamp-2">{sel.hookAr}</p>}

                {sel.owned ? (
                  <p className="text-[11px] font-bold text-emerald-400 mt-1 tabular-nums">
                    ⏳ متبقٍ {selLeft} {selLeft === 1 ? 'يوم' : 'أيام'}
                  </p>
                ) : sel.isPurchasable ? (
                  <p className="text-[11px] font-black text-amber-400 mt-1 tabular-nums">
                    🪙 {sel.priceChips}
                    <span className="text-gray-500 font-normal"> · {(sel.priceChips / Math.max(1, sel.durationDays)).toFixed(1)} يومياً</span>
                    {jodOf(sel.priceChips) && <span className="text-gray-600 font-normal"> · ≈{jodOf(sel.priceChips)} د.أ</span>}
                  </p>
                ) : (
                  <p className="text-[10.5px] text-slate-300 mt-1 font-bold">
                    {sel.achievementAr ? `يُنال بـ${sel.achievementAr}` : 'إنجاز فقط'}
                    {sel.holderName && <span className="text-amber-400/80"> · يحمله {sel.holderName}</span>}
                  </p>
                )}

                {/* الفعل الأساسي الوحيد في الشاشة */}
                <div className="flex gap-1.5 mt-1.5">
                  {sel.isPurchasable && (
                    sel.owned ? (
                      <>
                        {WEARABLE.includes(sel.kind) && (
                          selEquipped ? (
                            <button onClick={() => doEquip(null, sel.kind)} disabled={busy != null}
                              className="flex-1 py-1.5 rounded-lg text-[11px] font-bold bg-white/6 border border-white/12 text-gray-300 disabled:opacity-40">
                              إزالة من بطاقتي
                            </button>
                          ) : (
                            <button onClick={() => doEquip(sel, sel.kind)} disabled={busy != null}
                              className="flex-1 py-1.5 rounded-lg text-[11px] font-black bg-amber-500 text-black disabled:opacity-40">
                              🎽 جهّزه الآن
                            </button>
                          )
                        )}
                        <button onClick={() => doRent(sel)} disabled={busy != null}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 disabled:opacity-40">
                          🔄 جدّد
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => doRent(sel)} disabled={busy === sel.id}
                          className="flex-1 py-1.5 rounded-lg text-[11.5px] font-black text-black disabled:opacity-40"
                          style={{ background: 'linear-gradient(135deg,#fbbf24,#d97706)' }}>
                          {busy === sel.id ? '…' : balance >= sel.priceChips
                            ? `استأجر — 🪙${sel.priceChips}`
                            : `ينقصك ${sel.priceChips - balance} 🪙`}
                        </button>
                        {sel.trialEligible && (
                          <button onClick={() => doTrial(sel)} disabled={busy === sel.id}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-black bg-sky-600/20 border border-sky-500/40 text-sky-200 disabled:opacity-40">
                            🎁 ٣ أيام
                          </button>
                        )}
                      </>
                    )
                  )}
                  {TEMPORAL.includes(sel.kind) && (
                    <button onClick={() => playStage(sel)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white/6 border border-white/12 text-gray-300">
                      ↻
                    </button>
                  )}
                  <button onClick={clearPick}
                    className="px-2 py-1.5 rounded-lg text-[11px] font-bold bg-white/6 border border-white/12 text-gray-400">
                    ↩︎
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* شريط تنبيه رفيع بدل قسم كامل */}
        {expiringSoon.length > 0 && !sel && (
          <button onClick={() => setTab('mine')}
            className="w-full px-3 py-1.5 text-[10.5px] font-bold text-rose-200 bg-rose-950/40 border-t border-rose-500/20">
            ⏳ {expiringSoon.length === 1
              ? `«${expiringSoon[0].nameAr}» ينتهي خلال ${daysLeft(expiringSoon[0].expiresAt)} أيام`
              : `${expiringSoon.length} عناصر تنتهي قريباً`} — جدّدها من خزانتك
          </button>
        )}
      </div>

      {/* ══ التبويبات — فوراً تحت المرآة ══ */}
      <div className="sticky z-20 backdrop-blur-lg bg-[#050505]/94 border-b border-white/[0.06]"
        style={{ top: expiringSoon.length > 0 && !sel ? 172 : 145 }}>
        <div className="max-w-lg mx-auto overflow-x-auto">
          <div className="flex gap-1.5 px-3 py-2 min-w-max">
            {tabs.map(t => (
              <button key={t.key} onClick={() => { setTab(t.key); clearPick(); }}
                className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold whitespace-nowrap border transition-all ${
                  tab === t.key ? 'bg-amber-500/15 border-amber-500/50 text-amber-300' : 'bg-white/5 border-white/10 text-gray-400'
                }`}>
                {t.icon} {t.label} <span className="opacity-50 tabular-nums">{t.n}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-3">
        {loading && <p className="text-center text-gray-600 text-sm py-12">جارٍ فتح الخزنة…</p>}

        {!loading && loadError && (
          <div className="text-center py-10 px-6 mt-4 rounded-2xl border border-dashed border-rose-500/30">
            <p className="text-rose-300 text-sm mb-3">تعذّر فتح الخزنة</p>
            <button onClick={() => { setLoading(true); load(); }}
              className="px-4 py-2 rounded-xl text-xs font-black bg-amber-500 text-black">أعد المحاولة</button>
          </div>
        )}

        {!loading && !loadError && shown.length === 0 && (
          <p className="text-center text-gray-600 text-sm py-12">لا عناصر في هذا القسم</p>
        )}

        {/* ══ الشبكة: ما يُلبَس ══ */}
        {!loading && shown.length > 0 && (tab === 'offers' || tab === 'mine' || WEARABLE.includes(tab)) && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {shown.map(item => (
              <GridItem key={item.id} item={item}
                selected={tryOn?.id === item.id}
                equipped={equippedIdFor(item.kind) === item.id}
                onPick={() => pick(item)} myName={myName} />
            ))}
          </div>
        )}

        {/* ══ الصفوف: ما يُعرَض ويُسمَع ══ */}
        {!loading && shown.length > 0 && TEMPORAL.concat('xp_boost').includes(tab) && (
          <div className="flex flex-col gap-2 mt-3">
            {shown.map(item => (
              <RowItem key={item.id} item={item}
                selected={tryOn?.id === item.id}
                onPick={() => pick(item)} myName={myName} />
            ))}
          </div>
        )}

        {/* ══ خزنة مقفلة ══ */}
        {closedForever.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[13px] font-black text-gray-400 mb-1">🔒 خزنة مقفلة — لا تعود</h2>
            <p className="text-[10.5px] text-gray-600 mb-2">أُغلقت نهائياً. من اقتناها احتفظ بشيء لن يُطرح ثانيةً.</p>
            <div className="rounded-2xl border border-white/[0.06] bg-black/30 divide-y divide-white/5">
              {closedForever.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 opacity-70">
                  <StoreItemVisual item={c} playerName={myName} size={32} />
                  <p className="flex-1 text-xs text-gray-400 truncate">{c.nameAr}</p>
                  {c.owners > 0 && <span className="text-[10px] text-gray-600 shrink-0">{c.owners} يملكونها</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ══ كيف أكسب ══ */}
        {earnRates && (
          <div className="mt-6 rounded-2xl p-3.5 border border-amber-500/20 bg-amber-500/[0.06]">
            <h3 className="text-[13px] font-black text-amber-400 mb-1.5">كيف تكسب تشبس؟</h3>
            <ul className="text-[12px] text-gray-400 space-y-1 leading-relaxed">
              {earnRates.win > 0 && <li>🏆 اربح المباراة — <b className="text-amber-400">+{earnRates.win}</b></li>}
              {earnRates.top3 > 0 && <li>🥉 ضمن أفضل ثلاثة — <b className="text-amber-400">+{earnRates.top3}</b></li>}
              {earnRates.birthday > 0 && <li>🎂 عيد ميلادك — <b className="text-amber-400">+{earnRates.birthday}</b></li>}
              <li>💵 أو اشحن من الإدارة بالحضور</li>
            </ul>
          </div>
        )}
      </div>

      {/* ══ لوحة النقص ══ */}
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
                  <p className="text-[11px] text-gray-500 mt-2 text-center">الشحن يتم في النادي عند الحضور — كلّم الإدارة.</p>
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
                {WEARABLE.includes(celebrate.kind) && equippedIdFor(celebrate.kind) !== celebrate.id && (
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

// ══════════════════════════════════════════════════════
// 🧱 بطاقة الشبكة — ما يُلبَس
//
// بلا أزرار وبلا جملة بيع: الصورة والاسم والسعر فقط. اللمس يُطبّقها على
// المرآة، والشراء هناك. هذا ما خفض ارتفاع الصفحة من ≈٤٠٠٠px إلى ≈١٤٠٠px
// وضاعف ما يُرى في شاشة واحدة من ١–٢ إلى ٦.
// ══════════════════════════════════════════════════════
function GridItem({ item, selected, equipped, onPick, myName }: {
  item: StoreItem; selected: boolean; equipped: boolean; onPick: () => void; myName: string;
}) {
  useEffect(() => { trackStore('impression', item.id); }, [item.id]);
  const left = daysLeft(item.expiresAt);

  return (
    <button onClick={onPick}
      className={`relative rounded-xl overflow-hidden text-right transition-all border ${
        selected ? 'border-amber-500/60 bg-amber-500/[0.09]' : 'border-white/[0.09] bg-white/[0.035]'
      }`}>
      <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full z-10"
        style={{ background: RARITY_DOT[item.rarity] }} />
      {equipped && (
        <span className="absolute top-1.5 left-1.5 z-10 text-[8px] font-black px-1.5 py-0.5 rounded
          bg-emerald-500/20 border border-emerald-500/45 text-emerald-300">مُجهَّز</span>
      )}
      {!item.owned && (item.isHot || item.isNew || item.wasOwned) && (
        <span className="absolute bottom-[52px] right-1.5 z-10 text-[8px] font-black px-1.5 py-0.5 rounded
          bg-black/70 border border-white/15 text-gray-200">
          {item.isHot ? '🔥' : item.isNew ? '✦ جديد' : '↩︎ كان لك'}
        </span>
      )}

      <div className="h-[78px] flex items-center justify-center bg-black/25 px-2">
        <StoreItemVisual item={item} playerName={myName} size={54} />
      </div>

      <div className="px-2 pt-1.5 pb-2">
        <p className="text-[11.5px] font-black text-gray-100 leading-tight line-clamp-2"
          style={{ fontFamily: 'Amiri, serif', minHeight: 28 }}>{item.nameAr}</p>
        <p className="text-[10.5px] font-black tabular-nums mt-0.5"
          style={{ color: item.owned ? '#6ee7b7' : !item.isPurchasable ? '#cbd5e1' : '#fbbf24' }}>
          {item.owned ? `⏳ ${left} يوماً` : !item.isPurchasable ? '👑 إنجاز' : `🪙 ${item.priceChips}`}
        </p>
      </div>
    </button>
  );
}

// ══════════════════════════════════════════════════════
// ▶︎ صفّ — ما يُعرَض ويُسمَع
//
// هذه معاينتها **زمنيّة** لا ساكنة: تشريفة تُشغَّل، ونار تحترق، ونغمة
// تُعزَف. فالصورة الساكنة لا تُمثّلها — تحتاج زرّ تشغيل وسطراً يشرح.
// ══════════════════════════════════════════════════════
function RowItem({ item, selected, onPick, myName }: {
  item: StoreItem; selected: boolean; onPick: () => void; myName: string;
}) {
  useEffect(() => { trackStore('impression', item.id); }, [item.id]);
  const left = daysLeft(item.expiresAt);
  const temporal = TEMPORAL.includes(item.kind);

  return (
    <button onClick={onPick}
      className={`flex items-center gap-2.5 p-2.5 rounded-xl text-right transition-all border w-full ${
        selected ? 'border-amber-500/60 bg-amber-500/[0.09]' : 'border-white/[0.09] bg-white/[0.035]'
      }`}>
      <div className="shrink-0"><StoreItemVisual item={item} playerName={myName} size={44} /></div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: RARITY_DOT[item.rarity] }} />
          <p className="text-[12.5px] font-black text-gray-100 truncate" style={{ fontFamily: 'Amiri, serif' }}>
            {item.nameAr}
          </p>
        </div>
        <p className="text-[10px] text-gray-400 leading-snug line-clamp-1 mt-0.5">{item.hookAr}</p>
        <p className="text-[10.5px] font-black tabular-nums mt-0.5"
          style={{ color: item.owned ? '#6ee7b7' : '#fbbf24' }}>
          {item.owned ? `⏳ ${left} يوماً` : `🪙 ${item.priceChips}`}
        </p>
      </div>

      {temporal && (
        <span className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px]
          bg-amber-500/15 border border-amber-500/40 text-amber-300">▶︎</span>
      )}
    </button>
  );
}
