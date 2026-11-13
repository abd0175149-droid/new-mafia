'use client';

// ══════════════════════════════════════════════════════
// 🧾 التحصيل — /venue/invoices · «تحصيل بلمستين» (2026-11-01، التصوّر المعتمد)
//   https://claude.ai/artifact/XTYdBUEsr7infzd6izWKp8 · والدفع عن الأصحاب: https://claude.ai/artifact/8yuFEpGS9h6UcsBPH3dJT8
//
// الكاشير يقف على الكاش والهاتف بيده، ومهاراته محدودة: يحتاج ثلاثة أشياء فقط —
// من بقي عليه، وكم، وكم يُرجع له من الكاش. لذلك ثلاث شاشات لا أوراق فوق أوراق:
//   ١ القائمة: «بقي على ٧ · ٤٥٫٧٥»، البحث برقم المقعد، وكلّ شخصٍ سطرٌ واحد (المقعد كبيراً، الاسم، المبلغ)
//      والسطر كلّه هدف اللمس — لا زرّ «حصّل» على كلّ سطرٍ يُضغط على الجار بالخطأ.
//   ٢ ادفع: المبلغ كبيراً بكلماتٍ عاديّة، «يدفع عن أصحابه؟»، كاش/فيزا/كليك، «كم أعطاك؟» ⟵ «أرجِع له»
//      أو «ناقص» (يقفل الدفع)، ثمّ «✓ تمّ الدفع» مرّةً واحدة — بلا نافذة تأكيد: التراجع بدلها.
//   ٣ تمّ: الباقي مرّةً أخرى، «اطبع إيصالاً»، «التالي». وشريط «تراجع» بعدّادٍ ظاهر طوال المهلة (دقيقتان).
// النادر خلف «خيارات»: الليالي، طباعة الكلّ، الطباعة قبل الدفع، واتساب، إسقاط دخول اللعبة.
// الصفحة نفسها تُركَّب في /admin/venues/invoices للإدارة (isHQ و can()=>true).
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVenue } from '../context';
import { EM, TX, f2, nightLabel, hhmm } from '../ember';
import { Icon, SeatBadge, Sheet, useToast, Toast, Btn, Skeleton, useVenueApi } from '../ui';
import { refreshBadges } from '../VenueShell';
import { getSocket } from '@/lib/socket';

// ── الأنواع (مطابقة لردود الخادم) ─────────────────────
interface Night {
  activityId: number; activityName: string; activityDate: string;
  collected: number; due: number; total: number; paidCount: number; dueCount: number;
}

interface Row {
  key: string; kind: 'open' | 'paid' | 'writeoff' | 'debt';
  playerId: number; playerName: string; seat: number | null; bookingId: number | null;
  invoiceId: number | null; invoiceNo: number | null; printedAt: string | null;
  isPaid: boolean; paidAt: string | null; paidById: number | null; paidByName: string;
  canUndoUntil: string | null;
  ordersCount: number; ordersTotal: number; minTopup: number; waterCharge: number;
  loyaltyDiscount: number; gameFee: number; grandTotal: number;
  /** 🧾 ضريبة الخدمة: النسبة ٪ والمبلغ — داخلةٌ في grandTotal */
  serviceRate?: number; serviceAmount?: number;
  isFree: boolean; noInvoice: boolean;
  /** 💳 أُسقط عنه الحدّ الأدنى الليلة */
  minWaived?: boolean;
  payMethod: string | null; paymentId: number | null; paidForBy: string | null; groupId: number | null;
  /** 🎁 ضيافة كاملة · 🧾 لم يدفع (السبب) · 💳 دينٌ من ليلة سابقة (تاريخها) */
  fullComp?: boolean; compAmount?: number; writeoffReason?: string | null; debtFrom?: string | null;
}

interface Ledger {
  activity: { id: number; name: string; date: string };
  totals: { collected: number; due: number; total: number; paidCount: number; dueCount: number };
  candidates: Row[];
  wa?: Record<number, WaState>;
  waEnabled?: boolean;
}

interface WaState {
  kind?: string; status?: string; reason?: string; channel?: string | null; invoiceNo?: number | null; at?: string | null;
  transfer?: { at: string; forwarded: boolean; amountRead: number | null; short: boolean; over?: boolean; payeeMismatch?: boolean };
}

interface InvoiceLine {
  name: string; quantity: number; unitPrice: number; lineTotal: number;
  options: { group: string; value: string }[];
  components: { name: string; qty: number; options?: { group: string; value: string }[] }[];
}

interface Detail {
  lines: InvoiceLine[];
  grandTotal: number; gameFeeApplied: boolean; gameFeeAmount: number;
  seat: number | null; invoiceId: number | null; invoiceNo: number | null;
  isPaid: boolean; paidAt: string | null;
  bookingIsPaid: boolean; bookingIsFree: boolean;
}

type Method = 'cash' | 'card' | 'cliq';
const METHODS: { v: Method; label: string }[] = [{ v: 'cash', label: 'كاش' }, { v: 'card', label: 'فيزا' }, { v: 'cliq', label: 'كليك' }];
const METHOD_AR: Record<string, string> = { cash: 'كاش', card: 'فيزا', cliq: 'كليك' };

/** آخر تحصيل — شريط «تراجع» وشاشة «تمّ» */
interface LastPay {
  invoiceId: number | null; paymentId: number | null; playerId: number;
  /** تسديد دينٍ قديم — التراجع من /debts/:id/unsettle */
  debt?: boolean;
  payer: string; others: string[]; total: number; method: Method; change: number;
  until: number | null; invoiceNo: number | null;
}

/** يوم عمّان الحاليّ «YYYY-MM-DD» — الليلة تُقاس بتقويم المكان لا بتقويم الجهاز */
const ammanToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Amman' });
const dayKey = (d: string) => { const t = new Date(d); return isNaN(+t) ? '' : t.toISOString().slice(0, 10); };
/** لوحة المفاتيح العربيّة تكتب «١٢»؛ المقعد مخزّنٌ «12» — نوحّد قبل المقارنة */
const latinDigits = (s: string) => s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/٫/g, '.');
const r2 = (n: number) => Math.round(n * 100) / 100;

/** ما عليه بكلماتٍ عاديّة — لا «حدّ أدنى · بلا فاتورة» */
function plainLines(r: Row): { label: string; v: number }[] {
  const out: { label: string; v: number }[] = [];
  if (r.ordersTotal > 0) out.push({ label: 'مشروبات وأكل', v: r.ordersTotal });
  if (r.waterCharge > 0) out.push({ label: 'مياه', v: r.waterCharge });
  if (r.minTopup > 0) out.push({ label: 'باقي الحدّ الأدنى', v: r.minTopup });
  if (r.loyaltyDiscount > 0) out.push({ label: 'مشروب بطاقة الولاء', v: -r.loyaltyDiscount });
  if ((r.serviceAmount ?? 0) > 0) out.push({ label: `ضريبة خدمة ${r2(r.serviceRate ?? 0)}%`, v: r.serviceAmount ?? 0 });
  if (r.gameFee > 0) out.push({ label: 'دخول اللعبة', v: r.gameFee });
  return out;
}

/** حالة واتساب على الصفّ — الشكل (أيقونة + كلمة) مع اللون */
function waPill(r: Row, w: WaState | undefined): { text: string; color: string; icon: 'check' | 'clock' | 'warn' | 'receipt' } | null {
  if (!w) return null;
  const paid = r.kind === 'paid';
  if (!paid && w.transfer && (!w.at || new Date(w.transfer.at) >= new Date(w.at))) {
    if (w.transfer.payeeMismatch) return { text: 'حوالة لاسمٍ غير حساب المكان', color: TX.bad, icon: 'warn' };
    if (w.transfer.short) return { text: 'وصلت حوالة · المبلغ أقلّ', color: TX.bad, icon: 'warn' };
    if (w.transfer.over) return { text: 'وصلت حوالة · المبلغ أكثر', color: TX.amber, icon: 'warn' };
    return { text: 'وصلت حوالة', color: TX.amber, icon: 'receipt' };
  }
  if (paid) {
    if (w.kind !== 'paid' && !(w.kind === 'manual' || w.kind === 'bot')) return null;
    if (w.status === 'sent') return { text: 'وصله الختم', color: TX.good, icon: 'check' };
    if (w.status === 'pending' || w.status === 'sending') return { text: 'الختم بعد دقيقتين', color: TX.dim, icon: 'clock' };
    if (w.status === 'failed') return { text: `لم يُرسل الختم — ${w.reason || ''}`, color: TX.bad, icon: 'warn' };
    return null;
  }
  if (w.kind === 'paid') return null;
  if (w.status === 'sent') return { text: 'وصلته الفاتورة', color: TX.good, icon: 'check' };
  if (w.status === 'pending' || w.status === 'sending') return { text: 'تُرسل خلال دقيقة', color: TX.dim, icon: 'clock' };
  if (w.status === 'failed') return { text: `لم تُرسل — ${w.reason || ''}`, color: TX.bad, icon: 'warn' };
  return null;
}

// ── أزرار الصفحة: كبيرة، والضغط ظاهر ─────────────────────
const big = { minHeight: 56, borderRadius: 16, fontSize: 17, fontWeight: 800 } as const;

export default function VenueInvoicesPage() {
  const { locationId, can } = useVenue();
  const api = useVenueApi();
  // 🔴 authHeaders يُبنى من جديد في كلّ رسمٍ للغلاف، فتتغيّر get/send كلّ مرّة — نقرؤها من مرجعٍ ثابت
  const apiRef = useRef(api);
  apiRef.current = api;
  const { toast, show, hide } = useToast();

  const [nights, setNights] = useState<Night[] | null>(null);
  const [actId, setActId] = useState<number | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [ledgerFor, setLedgerFor] = useState<number | null>(null);
  const [ledgerErr, setLedgerErr] = useState('');
  const [q, setQ] = useState('');
  const [byName, setByName] = useState(false);
  const [paidOpen, setPaidOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [printingAll, setPrintingAll] = useState(false);

  // ── شاشة الدفع ──
  const [view, setView] = useState<'list' | 'pay' | 'done'>('list');
  const [payId, setPayId] = useState<number | null>(null);          // صاحب الشاشة (playerId)
  const [friends, setFriends] = useState<number[]>([]);             // من يدفع عنهم
  const [showFriends, setShowFriends] = useState(false);
  const [payer, setPayer] = useState<number | 'other' | null>(null);
  const [otherName, setOtherName] = useState('');
  const [method, setMethod] = useState<Method>('cash');
  const [given, setGiven] = useState<number | null>(null);
  const [givenText, setGivenText] = useState('');
  const [seen, setSeen] = useState<Record<number, number>>({});     // المبلغ الذي رآه الكاشير لكلّ شخص
  const [payAlert, setPayAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [minOpen, setMinOpen] = useState(false);
  const [minReason, setMinReason] = useState('');
  const [printing, setPrinting] = useState(false);
  const [waBusy, setWaBusy] = useState(false);
  // 🧾 «لم يدفع» · 💳 تسديد دينٍ قديم
  const [woOpen, setWoOpen] = useState(false);
  const [woKind, setWoKind] = useState<'debt' | 'loss' | null>(null);
  const [woReason, setWoReason] = useState('');
  const [debtKey, setDebtKey] = useState<string | null>(null);

  // ── بعد الدفع ──
  const [last, setLast] = useState<LastPay | null>(null);
  const [tick, setTick] = useState(0);
  const [paidSheet, setPaidSheet] = useState<Row | null>(null);
  const [paidDetail, setPaidDetail] = useState<Detail | null>(null);

  const actIdRef = useRef<number | null>(null);
  actIdRef.current = actId;
  const wantedRef = useRef<number | null | undefined>(undefined);
  const viewRef = useRef(view); viewRef.current = view;
  const busyRef = useRef(busy); busyRef.current = busy;

  const canPay = can('payments.record');

  // ── الجلب ─────────────────────────────────────────
  const loadNights = useCallback(async () => {
    try {
      const r = await apiRef.current.get('/api/venue/collection-nights');
      if (!r.ok) { setNights(prev => prev ?? []); return; }
      const list: Night[] = r.data.nights || [];
      setNights(list);
      if (actIdRef.current == null) {
        if (wantedRef.current === undefined) {
          const v = parseInt(new URLSearchParams(window.location.search).get('activityId') || '', 10);
          wantedRef.current = Number.isFinite(v) && v > 0 ? v : null;
        }
        const pick = wantedRef.current ?? list[0]?.activityId ?? null;
        if (pick != null) setActId(pick);
      }
    } catch { setNights(prev => prev ?? []); }
  }, []);

  const loadLedger = useCallback(async (id: number, background = false) => {
    try {
      const r = await apiRef.current.get(`/api/venue/invoices/candidates?activityId=${id}`);
      if (actIdRef.current !== id) return;
      if (!r.ok) { if (!background) setLedgerErr(r.data?.error || 'تعذّر تحميل التحصيل'); return; }
      setLedger(r.data); setLedgerFor(id); setLedgerErr('');
    } catch {
      if (!background && actIdRef.current === id) setLedgerErr('خطأ في الاتصال');
    }
  }, []);

  const fetchDetail = useCallback(async (playerId: number, invoiceId: number | null, set: (d: Detail | null) => void) => {
    const id = actIdRef.current; if (!id) return;
    try {
      const qs = invoiceId ? `?invoiceId=${invoiceId}` : '';
      const r = await apiRef.current.get(`/api/venue/invoices/${id}/${playerId}${qs}`);
      if (r.ok) set(r.data.invoice);
    } catch { /* التفاصيل تكميليّة */ }
  }, []);

  useEffect(() => {
    if (!locationId) return;
    setActId(null); actIdRef.current = null; setLedger(null); setLedgerFor(null); setNights(null);
    loadNights();
  }, [locationId, loadNights]);

  useEffect(() => { if (actId) loadLedger(actId); }, [actId, loadLedger]);

  // ── التحديث الحيّ: مؤقّت ٣٠ ث + عودة الظهور + سوكيت إن وُجد ──
  useEffect(() => {
    if (!locationId || !actId) return;
    let deb: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      loadLedger(actId, true);
      loadNights();
    };
    const soon = () => { if (deb) clearTimeout(deb); deb = setTimeout(refresh, 400); };
    const iv = setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    let s: ReturnType<typeof getSocket> | null = null;
    try {
      s = getSocket();
      s.on('fnb:invoice-updated', soon);
      s.on('fnb:new-order', soon);
      s.on('fnb:invoice-wa', soon);
    } catch { s = null; }
    return () => {
      clearInterval(iv);
      if (deb) clearTimeout(deb);
      document.removeEventListener('visibilitychange', refresh);
      if (s) { s.off('fnb:invoice-updated', soon); s.off('fnb:new-order', soon); s.off('fnb:invoice-wa', soon); }
    };
  }, [locationId, actId, loadLedger, loadNights]);

  // عدّاد شريط التراجع
  useEffect(() => {
    if (!last?.until) return;
    const iv = setInterval(() => {
      setTick(t => t + 1);
      if (Date.now() >= (last.until as number)) { setLast(null); clearInterval(iv); }
    }, 1000);
    return () => clearInterval(iv);
  }, [last]);

  const reloadAll = useCallback(async () => {
    const id = actIdRef.current;
    if (id) await loadLedger(id);
    loadNights();
    refreshBadges();
  }, [loadLedger, loadNights]);

  // ── المشتقّات ─────────────────────────────────────
  const rows = useMemo(() => (ledger && ledgerFor === actId ? ledger.candidates : []), [ledger, ledgerFor, actId]);
  const openRows = useMemo(() => rows.filter(r => r.kind === 'open').sort((a, b) => (a.seat ?? 999) - (b.seat ?? 999)), [rows]);
  const paidRows = useMemo(() => rows.filter(r => r.kind === 'paid' || r.kind === 'writeoff'), [rows]);
  const debtRows = useMemo(() => rows.filter(r => r.kind === 'debt'), [rows]);
  const debtRow = debtKey ? debtRows.find(r => r.key === debtKey) ?? null : null;
  const openBy = useMemo(() => new Map(openRows.map(r => [r.playerId, r])), [openRows]);
  const T = ledger && ledgerFor === actId ? ledger.totals : null;
  const today = ammanToday();
  const curNight = nights?.find(n => n.activityId === actId) ?? null;
  const staleNight = (nights ?? []).find(n => n.activityId !== actId && n.due > 0 && dayKey(n.activityDate) !== today) ?? null;

  const primary = payId != null ? openBy.get(payId) ?? null : null;
  const selIds = payId != null ? [payId, ...friends] : [];
  const total = debtRow ? debtRow.grandTotal : r2(selIds.reduce((s, id) => s + (seen[id] ?? openBy.get(id)?.grandTotal ?? 0), 0));
  const short = method === 'cash' && given != null && given < total - 0.004;
  const change = method === 'cash' && given != null ? r2(given - total) : 0;

  // 🔔 المبلغ تغيّر أو شخصٌ حُصّل من جهازٍ آخر والكاشير على شاشة الدفع ⟵ تنبيهٌ يقفل الزرّ حتّى يقرّ بالجديد
  useEffect(() => {
    if (viewRef.current === 'pay' && !busyRef.current && debtKey && !debtRows.some(r => r.key === debtKey)) {
      setView('list'); setDebtKey(null); show('سُدّد هذا الدين للتوّ من جهازٍ آخر'); return;
    }
    if (viewRef.current !== 'pay' || busyRef.current || payId == null) return;
    if (!openBy.has(payId)) {
      setView('list'); setPayId(null);
      show('حُصّل للتوّ من جهازٍ آخر — حُدّثت القائمة');
      return;
    }
    const gone = friends.filter(id => !openBy.has(id));
    if (gone.length) {
      setFriends(f => f.filter(id => openBy.has(id)));
      setPayAlert('حُصّل أحد الأصحاب للتوّ من جهازٍ آخر — أُزيل من القائمة. راجع المجموع.');
      setGiven(null); setGivenText('');
      return;
    }
    const changed = selIds.filter(id => seen[id] != null && Math.abs((openBy.get(id)?.grandTotal ?? 0) - seen[id]) > 0.004);
    if (changed.length) {
      setPayAlert(changed.map(id => `طلبٌ جديد وصل لـ${openBy.get(id)!.playerName} — صار ${f2(openBy.get(id)!.grandTotal)} بدل ${f2(seen[id])}`).join(' · '));
      setGiven(null); setGivenText('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openBy]);

  // ── الأفعال ───────────────────────────────────────
  const openPay = (r: Row) => {
    if (!canPay) return;
    setDebtKey(null); setWoOpen(false); setWoKind(null); setWoReason('');
    setPayId(r.playerId); setFriends([]); setShowFriends(false); setPayer(r.playerId); setOtherName('');
    setMethod('cash'); setGiven(null); setGivenText(''); setSeen({ [r.playerId]: r.grandTotal });
    setPayAlert(null); setMoreOpen(false); setItemsOpen(false); setDetail(null); setWaiveOpen(false); setReason('');
    setView('pay');
    window.scrollTo({ top: 0 });
    fetchDetail(r.playerId, null, setDetail);
  };
  const backToList = () => { setView('list'); setPayId(null); setDebtKey(null); setQ(''); window.scrollTo({ top: 0 }); };
  /** 💳 دينٌ من ليلةٍ سابقة — شاشة الدفع نفسها بلا أصحابٍ ولا خيارات */
  const openDebt = (r: Row) => {
    if (!canPay) return;
    setDebtKey(r.key); setPayId(null); setFriends([]); setShowFriends(false);
    setMethod('cash'); setGiven(null); setGivenText(''); setPayAlert(null); setMoreOpen(false);
    setView('pay'); window.scrollTo({ top: 0 });
  };

  const toggleFriend = (id: number) => {
    setFriends(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
    setSeen(s => { const n = { ...s }; if (friends.includes(id)) delete n[id]; else n[id] = openBy.get(id)?.grandTotal ?? 0; return n; });
    if (payer === id && friends.includes(id)) setPayer(payId);
    setGiven(null); setGivenText('');
  };
  const groupMates = primary?.groupId ? openRows.filter(r => r.playerId !== payId && r.groupId === primary.groupId) : [];
  const toggleGroup = () => {
    const ids = groupMates.map(r => r.playerId);
    const all = ids.every(id => friends.includes(id));
    if (all) {
      setFriends(f => f.filter(id => !ids.includes(id)));
      setSeen(s => { const n = { ...s }; ids.forEach(id => delete n[id]); return n; });
    } else {
      setFriends(f => [...f, ...ids.filter(id => !f.includes(id))]);
      setSeen(s => { const n = { ...s }; ids.forEach(id => { if (n[id] == null) n[id] = openBy.get(id)?.grandTotal ?? 0; }); return n; });
    }
    setGiven(null); setGivenText('');
  };
  const ackAlert = () => {
    const s: Record<number, number> = {};
    selIds.forEach(id => { const r = openBy.get(id); if (r) s[id] = r.grandTotal; });
    setSeen(s); setPayAlert(null);
  };

  /** 💳 تسديد الدين القديم */
  const payDebt = async () => {
    if (!debtRow || busy || short) return;
    setBusy(true);
    const r = await apiRef.current.send(`/api/venue/debts/${debtRow.invoiceId}/settle`, 'POST', { method }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { await reloadAll(); show(r?.data?.error || 'تعذّر تسجيل الدفع', { tone: 'bad' }); return; }
    setLast({
      invoiceId: debtRow.invoiceId, paymentId: null, playerId: debtRow.playerId, debt: true,
      payer: debtRow.playerName, others: [], total: debtRow.grandTotal, method,
      change: method === 'cash' && given != null ? r2(given - debtRow.grandTotal) : 0,
      until: r.data?.canUndoUntil ? new Date(r.data.canUndoUntil).getTime() : null, invoiceNo: debtRow.invoiceNo,
    });
    setView('done'); setDebtKey(null); window.scrollTo({ top: 0 });
    reloadAll();
  };

  /** 🧾 «لم يدفع» بسبب — دين عليه أو خسارة */
  const writeoff = async () => {
    if (!actId || payId == null || busy || !woKind || woReason.trim().length < 3) return;
    setBusy(true);
    const name = openBy.get(payId)?.playerName || '';
    const r = await apiRef.current.send(`/api/venue/invoices/${actId}/${payId}/writeoff`, 'POST', { kind: woKind, reason: woReason.trim(), expectedTotal: seen[payId] }).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      await reloadAll();
      if (r?.status === 409) { setPayAlert(r.data?.error || 'تغيّر المبلغ للتوّ — راجع'); setWoOpen(false); }
      else show(r?.data?.error || 'تعذّر التسجيل', { tone: 'bad' });
      return;
    }
    const inv = r.data?.invoiceId;
    setWoOpen(false); setWoKind(null); setWoReason('');
    backToList();
    reloadAll();
    show(`سُجّلت فاتورة ${name} «${woKind === 'debt' ? 'دين عليه' : 'خسارة'}»`, inv && r.data?.canUndoUntil ? {
      undo: async () => {
        const u = await apiRef.current.send(`/api/venue/invoices/unpay/${inv}`, 'POST', {}).catch(() => null);
        if (!u?.ok) show(u?.data?.error || 'تعذّر التراجع', { tone: 'bad' }); else { show('أُعيدت الفاتورة مفتوحة'); reloadAll(); }
      }, ms: 8000,
    } : {});
  };

  const pay = async () => {
    if (debtRow) return payDebt();
    if (!actId || payId == null || busy || payAlert || short) return;
    if (friends.length && payer === 'other' && !otherName.trim()) { show('اكتب اسم من دفع', { tone: 'bad' }); return; }
    setBusy(true);
    const ids = selIds;
    const names = ids.map(id => openBy.get(id)?.playerName || '');
    let r: { ok: boolean; status: number; data: any } | null = null;
    try {
      r = friends.length === 0
        ? await apiRef.current.send(`/api/venue/invoices/${actId}/${payId}/pay`, 'POST', { expectedTotal: seen[payId], method })
        : await apiRef.current.send(`/api/venue/invoices/${actId}/pay-group`, 'POST', {
            items: ids.map(id => ({ playerId: id, expectedTotal: seen[id] })), method,
            ...(payer === 'other' ? { payerName: otherName.trim() } : { payerPlayerId: payer ?? payId }),
          });
    } catch { r = null; }
    setBusy(false);
    if (!r) { show('خطأ في الاتصال — لم يُسجَّل شيء', { tone: 'bad' }); return; }
    if (!r.ok) {
      await reloadAll();
      if (r.status === 409 || r.data?.code === 'CHANGED' || r.data?.code === 'GONE') {
        setPayAlert(r.data?.error || 'تغيّر شيءٌ للتوّ — راجع المجموع');
        setGiven(null); setGivenText('');
      } else {
        show(r.data?.error || 'تعذّر تسجيل الدفع', { tone: 'bad' });
      }
      return;
    }
    const d = r.data;
    const payerName = friends.length === 0 ? names[0] : (payer === 'other' ? otherName.trim() : (openBy.get(payer as number)?.playerName || names[0]));
    setLast({
      invoiceId: d.invoiceId ?? null, paymentId: d.paymentId ?? null, playerId: payId,
      payer: payerName, others: names.filter(n => n !== payerName), total: friends.length ? d.total : d.grandTotal,
      method, change: method === 'cash' && given != null ? r2(given - total) : 0,
      until: d.canUndoUntil ? new Date(d.canUndoUntil).getTime() : null, invoiceNo: d.invoiceNo ?? null,
    });
    setView('done'); setPayId(null);
    window.scrollTo({ top: 0 });
    reloadAll();
  };

  const undo = async () => {
    if (!last) return;
    const L = last;
    let r: { ok: boolean; data: any } | null = null;
    try {
      r = L.debt
        ? await apiRef.current.send(`/api/venue/debts/${L.invoiceId}/unsettle`, 'POST', {})
        : L.paymentId
          ? await apiRef.current.send(`/api/venue/invoices/unpay-payment/${L.paymentId}`, 'POST', {})
          : await apiRef.current.send(`/api/venue/invoices/unpay/${L.invoiceId}`, 'POST', {});
    } catch { r = null; }
    if (!r?.ok) { show(r?.data?.error || 'تعذّر التراجع', { tone: 'bad' }); return; }
    setLast(null);
    if (viewRef.current === 'done') setView('list');
    show(`أُلغي الدفع — عاد ${L.others.length ? `${L.payer} وأصحابه` : L.payer} إلى «بقي عليهم»`);
    reloadAll();
  };

  // ── PDF/إيصال: النافذة تُفتح قبل أوّل await (سفاري الآيفون يحجبها بعده) ──
  const openDoc = async (url: string, method: 'GET' | 'POST'): Promise<boolean> => {
    const pre = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    try {
      const { withLoc, authHeaders } = apiRef.current;
      const r = await fetch(withLoc(url), { method, headers: authHeaders });
      if (!r.ok) {
        pre?.close();
        const d = await r.json().catch(() => ({}));
        show((d as any).error || 'تعذّرت الطباعة', { tone: 'bad' });
        return false;
      }
      const blobUrl = URL.createObjectURL(await r.blob());
      const w = pre ?? window.open(blobUrl, '_blank');
      if (pre) pre.location.href = blobUrl;
      if (!w) show('المتصفّح منع فتح النافذة — اسمح بالنوافذ المنبثقة لهذا الموقع', { tone: 'bad' });
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
      return true;
    } catch {
      pre?.close();
      show('خطأ في الاتصال', { tone: 'bad' });
      return false;
    }
  };
  const printFor = async (playerId: number, invoiceId: number | null, kind: 'receipt' | 'pdf') => {
    if (!actId || printing) return;
    setPrinting(true);
    await openDoc(`/api/venue/invoices/${actId}/${playerId}/${kind}${invoiceId ? `?invoiceId=${invoiceId}` : ''}`, 'POST');
    setPrinting(false);
    loadLedger(actId, true);
  };
  const printLast = async () => {
    if (!last || printing) return;
    setPrinting(true);
    if (last.paymentId) await openDoc(`/api/venue/payments/${last.paymentId}/receipt`, 'POST');
    else if (actId) await openDoc(`/api/venue/invoices/${actId}/${last.playerId}/receipt${last.invoiceId ? `?invoiceId=${last.invoiceId}` : ''}`, 'POST');
    setPrinting(false);
  };
  const waSend = async (playerId: number, invoiceId: number | null, paid: boolean) => {
    if (!actId || waBusy) return;
    setWaBusy(true);
    const r = await apiRef.current.send(`/api/venue/invoices/${actId}/${playerId}/wa-send${invoiceId ? `?invoiceId=${invoiceId}` : ''}`, 'POST').catch(() => null);
    setWaBusy(false);
    if (!r?.ok) { show(r?.data?.error || 'تعذّر الإرسال', { tone: 'bad' }); return; }
    show(paid ? 'يُرسل الختم الآن' : 'تُرسل الفاتورة الآن');
    loadLedger(actId, true);
  };
  const printAll = async () => {
    if (!actId || printingAll) return;
    setPrintingAll(true);
    const ok = await openDoc(`/api/venue/invoices/${actId}/print-all`, 'GET');
    setPrintingAll(false);
    if (ok) { setOptionsOpen(false); loadLedger(actId); }
  };
  const waive = async (on: boolean) => {
    if (!actId || payId == null || busy) return;
    const why = reason.trim();
    if (on && why.length < 3) return;
    setBusy(true);
    const r = await apiRef.current.send(`/api/venue/invoices/${actId}/${payId}/waive-fee`, 'POST', on ? { waive: true, reason: why } : { waive: false }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { show(r?.data?.error || 'فشل الإجراء', { tone: 'bad' }); return; }
    setWaiveOpen(false); setReason('');
    show(on ? 'أُسقط دخول اللعبة' : 'أُعيد احتساب دخول اللعبة');
    await reloadAll();
    // المبلغ تغيّر بفعله هو — نعتمده بلا تنبيه
    const id = actIdRef.current;
    if (id) {
      const fresh = await apiRef.current.get(`/api/venue/invoices/candidates?activityId=${id}`);
      const row = fresh.ok ? (fresh.data.candidates as Row[]).find(x => x.kind === 'open' && x.playerId === payId) : null;
      if (row) setSeen(s => ({ ...s, [payId]: row.grandTotal })); else backToList();
    }
    fetchDetail(payId, null, setDetail);
  };
  const waiveMin = async (on: boolean) => {
    if (!actId || payId == null || busy) return;
    const why = minReason.trim();
    if (on && why.length < 3) return;
    setBusy(true);
    const r = await apiRef.current.send(`/api/venue/invoices/${actId}/${payId}/waive-min`, 'POST', on ? { waive: true, reason: why } : { waive: false }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { show(r?.data?.error || 'فشل الإجراء', { tone: 'bad' }); return; }
    setMinOpen(false); setMinReason('');
    show(on ? 'أُسقط الحدّ الأدنى' : 'أُعيد احتساب الحدّ الأدنى');
    await reloadAll();
    // المبلغ تغيّر بفعله هو — نعتمده بلا تنبيه
    const id = actIdRef.current;
    if (id) {
      const fresh = await apiRef.current.get(`/api/venue/invoices/candidates?activityId=${id}`);
      const row = fresh.ok ? (fresh.data.candidates as Row[]).find(x => x.kind === 'open' && x.playerId === payId) : null;
      if (row) setSeen(s => ({ ...s, [payId]: row.grandTotal })); else backToList();
    }
    fetchDetail(payId, null, setDetail);
  };
  const pickNight = (id: number) => {
    setOptionsOpen(false);
    if (id === actId) return;
    setView('list'); setPayId(null);
    setActId(id); setQ(''); setLedgerErr(''); setPaidOpen(false);
  };
  const openPaid = (r: Row) => { setPaidSheet(r); setPaidDetail(null); fetchDetail(r.playerId, r.invoiceId, setPaidDetail); };

  // ── الحراسات ──────────────────────────────────────
  if (!can('invoices.print')) {
    return <div className="text-center py-16 text-[15px]" style={{ color: TX.dim }}>ليس لدى حسابك صلاحيّة التحصيل والفواتير</div>;
  }
  if (!locationId) {
    return <div className="text-center py-16 text-[15px]" style={{ color: TX.dim }}>اختر مكاناً لعرض تحصيله</div>;
  }

  const isToday = curNight ? dayKey(curNight.activityDate) === today : true;
  const needle = latinDigits(q.trim()).toLowerCase();
  const visible = needle
    ? openRows.filter(r => byName ? r.playerName.toLowerCase().includes(needle) : (r.seat != null && String(r.seat).startsWith(needle)))
    : openRows;
  const remaining = last?.until ? Math.max(0, Math.ceil((last.until - Date.now()) / 1000)) : 0;
  void tick;

  const undoBar = last && last.until && remaining > 0 && view !== 'pay' ? (
    <div role="status" className="vc-enter fixed z-[70] left-3 right-3 sm:left-auto sm:right-6 sm:w-[420px] flex items-center gap-2.5"
      style={{ bottom: 'calc(88px + env(safe-area-inset-bottom))', padding: '8px 8px 8px 14px', borderRadius: 16,
        background: '#11291F', border: `1px solid ${EM.go}`, boxShadow: '0 10px 28px rgba(0,0,0,.55)' }} dir="rtl">
      <span className="flex-1 min-w-0 text-[15px] font-bold truncate">
        {last.payer}{last.others.length ? ` +${last.others.length}` : ''} · <span className="vc-num">{f2(last.total)}</span>
      </span>
      <button type="button" onClick={undo} className="vc-press shrink-0 h-12 px-4 rounded-xl text-[15px] font-extrabold flex items-center gap-2"
        style={{ background: 'rgba(255,255,255,.08)', color: TX.amber }}>
        ↩ تراجع <span className="vc-num">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</span>
      </button>
    </div>
  ) : null;

  // ══════════════════ شاشة «تمّ» ══════════════════
  if (view === 'done' && last) {
    return (
      <div className="flex flex-col items-center gap-4 text-center pt-8 pb-24 max-w-[460px] mx-auto w-full">
        <div className="flex items-center justify-center rounded-full" style={{ width: 96, height: 96, background: EM.go }}>
          <Icon name="check" size={56} stroke={2.6} color="#04231A" />
        </div>
        <h2 className="text-[28px] font-extrabold m-0">تمّ الدفع</h2>
        <p className="text-[17px] m-0 leading-relaxed" style={{ color: TX.sub }}>
          {last.payer} دفع <span className="vc-num font-bold" style={{ color: EM.text }}>{f2(last.total)}</span> {METHOD_AR[last.method]}
          {last.others.length > 0 && <><br />عنه وعن: {last.others.join('، ')}</>}
        </p>
        {last.change > 0 && (
          <div className="w-full rounded-2xl py-3 px-4 text-[18px] font-bold" style={{ background: '#2C2310', border: `1px solid ${TX.amberHi}`, color: TX.amber }}>
            لا تنسَ: أرجِع له
            <span className="vc-num block" style={{ fontSize: 36 }}>{f2(last.change)}</span>
          </div>
        )}
        {!last.until && <p className="text-[14px] m-0" style={{ color: TX.dim }}>فيها مشروب بطاقة ولاء — التراجع عنها من الإدارة.</p>}
        <Btn kind="ghost" full style={{ ...big, fontSize: 16 }} onClick={printLast} disabled={printing}>
          <Icon name="printer" size={20} /> {printing ? 'يُجهَّز…' : 'اطبع إيصالاً'}
        </Btn>
        <Btn kind="go" full style={{ ...big, minHeight: 64, fontSize: 20 }} onClick={backToList}>التالي</Btn>
        {/* هنا في مكانه لا عائماً — العائم كان يغطّي «اطبع إيصالاً» */}
        {last.until && remaining > 0 && (
          <Btn kind="ghost" full style={{ ...big, fontSize: 16, color: TX.amber }} onClick={undo}>
            ↩ تراجع عن الدفع <span className="vc-num">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</span>
          </Btn>
        )}
        <Toast toast={toast} onHide={hide} />
      </div>
    );
  }

  // ── كيف دفع؟ / كم أعطاك؟ — مشتركٌ بين الدفع وتسديد الدين ──
  const notesFor = [5, 10, 20, 50, 100].filter(n => n >= total).slice(0, 4);
  const methodCash = (
    <>
        {/* كيف دفع؟ */}
        <span className="text-[15px] font-bold" style={{ color: TX.dim }}>كيف دفع؟</span>
        <div className="grid grid-cols-3 gap-2">
          {METHODS.map(m => (
            <button key={m.v} type="button" aria-pressed={method === m.v} onClick={() => { setMethod(m.v); setGiven(null); setGivenText(''); }}
              className="vc-press rounded-2xl text-[18px] font-extrabold" style={{ minHeight: 60,
                ...(method === m.v ? { background: '#E9F5EF', color: '#0B2A1F' } : { background: EM.card, border: `1px solid ${EM.line2}`, color: EM.text }) }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* كم أعطاك؟ — النظام يحسب الباقي */}
        {method === 'cash' && (
          <>
            <span className="text-[15px] font-bold" style={{ color: TX.dim }}>كم أعطاك؟</span>
            <div className="flex flex-wrap gap-2">
              {[{ v: total, label: 'بالضبط' }, ...notesFor.filter(n => Math.abs(n - total) > 0.004).map(n => ({ v: n, label: String(n) }))].map(o => (
                <button key={o.label} type="button" aria-pressed={given === o.v && !givenText} onClick={() => { setGiven(o.v); setGivenText(''); }}
                  className={`vc-press flex-1 rounded-2xl text-[18px] font-extrabold ${o.label === 'بالضبط' ? '' : 'vc-num'}`} style={{ minHeight: 56, minWidth: 64,
                    ...(given === o.v && !givenText ? { background: '#E9F5EF', color: '#0B2A1F' } : { background: EM.card, border: `1px solid ${EM.line2}`, color: EM.text }) }}>
                  {o.label}
                </button>
              ))}
            </div>
            <input value={givenText} inputMode="decimal" placeholder="مبلغٌ آخر" aria-label="مبلغٌ آخر أعطاك إيّاه"
              onChange={e => { const t = latinDigits(e.target.value); setGivenText(e.target.value); const v = parseFloat(t); setGiven(Number.isFinite(v) ? v : null); }}
              className="w-full rounded-2xl px-4 outline-none placeholder:text-[#5A6862] vc-num"
              style={{ height: 56, fontSize: 18, background: EM.ink, border: `1px solid ${EM.line2}`, color: EM.text }} />
            {given != null && (
              change > 0.004 ? (
                <div className="rounded-2xl py-3 px-4 text-center text-[18px] font-bold" style={{ background: '#2C2310', border: `1px solid ${TX.amberHi}`, color: TX.amber }}>
                  أرجِع له<span className="vc-num block" style={{ fontSize: 36 }}>{f2(change)}</span>
                </div>
              ) : short ? (
                <div className="rounded-2xl py-3 px-4 text-center text-[17px] font-bold" style={{ background: '#34160F', border: '1px solid #E0492B', color: TX.bad }}>
                  ناقص<span className="vc-num block" style={{ fontSize: 36 }}>{f2(r2(total - given))}</span>اطلب منه الباقي قبل «تمّ الدفع»
                </div>
              ) : (
                <div className="rounded-2xl py-3 px-4 text-center text-[18px] font-bold" style={{ background: '#0F2A1F', border: `1px solid ${EM.go}`, color: TX.good }}>المبلغ بالضبط ✓</div>
              )
            )}
          </>
        )}

    </>
  );

  // ══════════════════ 💳 تسديد دينٍ من ليلةٍ سابقة ══════════════════
  if (view === 'pay' && debtRow) {
    return (
      <div className="flex flex-col gap-3.5 pb-8 max-w-[560px] mx-auto w-full">
        <div className="flex items-center gap-3">
          <button type="button" onClick={backToList} aria-label="رجوع إلى القائمة"
            className="vc-press w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ border: `1px solid ${EM.line2}`, background: EM.card, color: TX.sub }}>
            <Icon name="chevron" size={22} stroke={2.2} style={{ transform: 'scaleX(-1)' }} />
          </button>
          <SeatBadge seat={debtRow.seat} size={52} />
          <div className="flex-1 min-w-0">
            <div className="text-[22px] font-extrabold leading-tight truncate">{debtRow.playerName}</div>
            <div className="text-[14px]" style={{ color: TX.amber }}>دينٌ من ليلة {debtRow.debtFrom ? nightLabel(debtRow.debtFrom) : 'سابقة'}</div>
          </div>
        </div>
        <div className="text-center pt-1">
          <div className="text-[16px]" style={{ color: TX.dim }}>عليه من قبل</div>
          <div className="vc-num font-semibold leading-none mt-1" style={{ fontSize: 54 }}>{f2(total)}</div>
        </div>
        {debtRow.writeoffReason && (
          <div className="rounded-2xl px-4 py-3 text-[15px]" style={{ background: EM.ink2, border: `1px solid ${EM.line}`, color: TX.sub }}>
            سبب عدم الدفع يومها: {debtRow.writeoffReason}
          </div>
        )}
        {methodCash}
        <Btn kind="go" full style={{ ...big, minHeight: 66, fontSize: 21 }} onClick={pay} disabled={busy || short}>
          {busy ? 'يُسجَّل…' : <>✓ سدّد الدين <span className="vc-num">{f2(total)}</span></>}
        </Btn>
        <Toast toast={toast} onHide={hide} />
      </div>
    );
  }

  // ══════════════════ شاشة «ادفع» ══════════════════
  if (view === 'pay' && primary) {
    const others = openRows.filter(r => r.playerId !== payId && !r.fullComp);
    const lines = plainLines(primary);
    const canWaive = !!(detail && !detail.isPaid && !detail.bookingIsPaid && !detail.bookingIsFree && detail.gameFeeApplied);
    const canRestore = !!(detail && !detail.isPaid && !detail.bookingIsPaid && detail.bookingIsFree);
    // 💳 الحدّ الأدنى: يُسقط ما دامت عليه تكملة، ويُعاد لمن أُسقط عنه
    const canWaiveMin = !primary.fullComp && primary.minTopup > 0 && !primary.minWaived;
    const canRestoreMin = !primary.fullComp && primary.minWaived === true;
    const wa = ledger?.waEnabled ? waPill(primary, ledger.wa?.[primary.playerId]) : null;
    return (
      <div className="flex flex-col gap-3.5 pb-8 max-w-[560px] mx-auto w-full">
        <div className="flex items-center gap-3">
          <button type="button" onClick={backToList} aria-label="رجوع إلى القائمة"
            className="vc-press w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ border: `1px solid ${EM.line2}`, background: EM.card, color: TX.sub }}>
            <Icon name="chevron" size={22} stroke={2.2} style={{ transform: 'scaleX(-1)' }} />
          </button>
          <SeatBadge seat={primary.seat} size={52} />
          <div className="flex-1 min-w-0">
            <div className="text-[22px] font-extrabold leading-tight truncate">{primary.playerName}</div>
            <div className="text-[14px]" style={{ color: TX.dim }}>{primary.seat != null ? `المقعد ${primary.seat}` : 'بلا مقعد'}</div>
          </div>
        </div>

        {payAlert && (
          <div role="alert" className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ background: '#34160F', border: '1px solid #E0492B' }}>
            <span className="text-[16px] font-bold leading-relaxed" style={{ color: '#FBD3C8' }}>{payAlert}</span>
            <Btn kind="ghost" h={52} style={{ fontSize: 16, color: EM.text }} onClick={ackAlert}>فهمت — المبلغ الجديد {f2(selIds.reduce((s, id) => s + (openBy.get(id)?.grandTotal ?? 0), 0))}</Btn>
          </div>
        )}

        <div className="text-center pt-1">
          <div className="text-[16px]" style={{ color: TX.dim }}>{primary.fullComp ? 'ضيافة كاملة' : friends.length ? `المجموع عن ${selIds.length} أشخاص` : 'عليه'}</div>
          <div className="vc-num font-semibold leading-none mt-1" style={{ fontSize: 54 }}>{f2(total)}</div>
        </div>
        {primary.fullComp && (
          <div className="rounded-2xl px-4 py-3 text-[16px] font-bold text-center" style={{ background: 'rgba(37,192,138,.08)', border: `1px solid ${EM.go}`, color: TX.good }}>
            🎁 ضيافة كاملة — لا يُدفع شيء. قيمة ما طلبه <span className="vc-num">{f2(primary.compAmount || 0)}</span> يتحمّلها المكان.
          </div>
        )}

        {/* ما عليه — بكلماتٍ عاديّة، والأصناف عند الطلب */}
        <div className="rounded-2xl" style={{ background: EM.ink2, border: `1px solid ${EM.line}`, padding: '2px 14px' }}>
          {friends.length === 0 ? (
            <>
              {lines.map(l => (
                <div key={l.label} className="flex justify-between gap-3 text-[16px]" style={{ padding: '10px 0', borderBottom: `1px solid ${EM.line}` }}>
                  <span>{l.label}</span><span className="vc-num">{l.v < 0 ? '− ' : ''}{f2(Math.abs(l.v))}</span>
                </div>
              ))}
              {primary.isFree && <div className="text-[15px]" style={{ padding: '10px 0', color: TX.dim, borderBottom: `1px solid ${EM.line}` }}>حجزٌ مجّانيّ — بلا دخول لعبة</div>}
              {primary.ordersTotal > 0 && (
                <button type="button" onClick={() => setItemsOpen(o => !o)} className="w-full text-right text-[15px] font-bold" style={{ padding: '11px 0', color: TX.sub }}>
                  {itemsOpen ? '▾' : '‹'} شو طلب؟
                </button>
              )}
              {itemsOpen && (detail ? detail.lines.map((l, i) => (
                <div key={i} className="flex gap-2 text-[15px]" style={{ padding: '8px 0', borderTop: `1px solid ${EM.line}` }}>
                  <span className="vc-num" style={{ color: TX.dim, minWidth: 26 }}>×{l.quantity}</span>
                  <span className="flex-1 min-w-0">{l.name}{l.options.length > 0 && <span className="block text-[13px]" style={{ color: TX.dim }}>{l.options.map(o => o.value).join(' · ')}</span>}</span>
                  <span className="vc-num">{f2(l.lineTotal)}</span>
                </div>
              )) : <div className="py-2"><Skeleton h={30} n={2} /></div>)}
            </>
          ) : selIds.map(id => (
            <div key={id} className="flex justify-between gap-3 text-[16px]" style={{ padding: '10px 0', borderBottom: `1px solid ${EM.line}` }}>
              <span className="truncate">{openBy.get(id)?.playerName}</span><span className="vc-num">{f2(seen[id] ?? 0)}</span>
            </div>
          ))}
        </div>

        {/* 👥 يدفع عن أصحابه */}
        {others.length > 0 && !primary.fullComp && (
          <Btn kind="ghost" h={56} style={{ fontSize: 16 }} onClick={() => setShowFriends(s => !s)}>
            <Icon name="users" size={20} /> {showFriends ? 'إخفاء القائمة' : friends.length ? `يدفع عن ${friends.length} — عدّل` : 'يدفع عن أصحابه؟'}
          </Btn>
        )}
        {showFriends && (
          <div className="flex flex-col gap-2">
            {groupMates.length > 0 && (
              <button type="button" onClick={toggleGroup} aria-pressed={groupMates.every(r => friends.includes(r.playerId))}
                className="vc-press self-start h-11 px-4 rounded-full text-[15px] font-extrabold"
                style={groupMates.every(r => friends.includes(r.playerId))
                  ? { background: EM.go, color: '#04231A' } : { background: EM.ink2, border: `1px solid ${EM.line2}`, color: EM.text }}>
                👥 مجموعته ({groupMates.length})
              </button>
            )}
            {others.map(r => {
              const on = friends.includes(r.playerId);
              return (
                <button key={r.key} type="button" role="checkbox" aria-checked={on} onClick={() => toggleFriend(r.playerId)}
                  className="vc-press flex items-center gap-3 rounded-2xl text-right"
                  style={{ minHeight: 64, padding: '8px 12px', background: on ? '#173A2E' : EM.card, border: `1px solid ${on ? EM.go : EM.line}`, color: 'inherit' }}>
                  <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 30, height: 30, border: `2px solid ${on ? EM.go : TX.dim}`, background: on ? EM.go : 'transparent' }}>
                    {on && <Icon name="check" size={18} stroke={3} color="#04231A" />}
                  </span>
                  <SeatBadge seat={r.seat} size={42} />
                  <span className="flex-1 min-w-0 text-[17px] font-bold truncate">{r.playerName}</span>
                  <span className="vc-num text-[18px] shrink-0">{f2(r.grandTotal)}</span>
                </button>
              );
            })}
          </div>
        )}
        {friends.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-bold" style={{ color: TX.dim }}>من دفع؟</span>
            <div className="flex flex-wrap gap-2">
              {[...selIds.map(id => ({ v: id as number | 'other', label: openBy.get(id)?.playerName || '' })), { v: 'other' as const, label: 'شخصٌ آخر' }].map(o => (
                <button key={String(o.v)} type="button" aria-pressed={payer === o.v} onClick={() => setPayer(o.v)}
                  className="vc-press h-11 px-4 rounded-full text-[15px] font-bold"
                  style={payer === o.v ? { background: '#E9F5EF', color: '#0B2A1F' } : { background: EM.ink2, border: `1px solid ${EM.line2}`, color: EM.text }}>
                  {o.label}
                </button>
              ))}
            </div>
            {payer === 'other' && (
              <input value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="اسم من دفع" aria-label="اسم من دفع" maxLength={60}
                className="w-full rounded-2xl px-4 outline-none placeholder:text-[#5A6862]"
                style={{ height: 56, fontSize: 17, background: EM.ink, border: `1px solid ${EM.line2}`, color: EM.text }} />
            )}
          </div>
        )}

        {!primary.fullComp && methodCash}

        <Btn kind="go" full style={{ ...big, minHeight: 66, fontSize: 21 }} onClick={pay} disabled={busy || !!payAlert || short}>
          {busy ? 'يُسجَّل…' : primary.fullComp ? '✓ أغلق الفاتورة (ضيافة)' : <>✓ تمّ الدفع <span className="vc-num">{f2(total)}</span></>}
        </Btn>

        {/* خيارات أخرى — النادر لا يزاحم الدفع */}
        <button type="button" onClick={() => setMoreOpen(o => !o)} className="text-right text-[16px] font-bold py-2" style={{ color: TX.sub }}>
          {moreOpen ? '▾' : '‹'} خيارات أخرى
        </button>
        {moreOpen && (
          <div className="flex flex-col gap-2">
            <Btn kind="ghost" h={52} style={{ fontSize: 15 }} disabled={printing} onClick={() => printFor(primary.playerId, null, 'receipt')}>
              <Icon name="printer" size={18} /> اطبع الفاتورة قبل الدفع
            </Btn>
            <Btn kind="ghost" h={52} style={{ fontSize: 15 }} disabled={printing} onClick={() => printFor(primary.playerId, null, 'pdf')}>ملفّ للمشاركة (A6)</Btn>
            {ledger?.waEnabled && (
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0 text-[14px] font-bold truncate" style={{ color: wa?.color || TX.dim }}>{wa ? wa.text : 'لم يُرسل له شيء على واتساب'}</span>
                <Btn kind="ghost" h={52} style={{ fontSize: 15 }} disabled={waBusy} onClick={() => waSend(primary.playerId, null, false)}>{waBusy ? 'يُرسل…' : 'أرسل الفاتورة'}</Btn>
              </div>
            )}
            {!primary.fullComp && total > 0 && !woOpen && (
              <Btn kind="ghost" h={52} style={{ fontSize: 15, color: TX.bad }} disabled={busy} onClick={() => { setWoOpen(true); setWaiveOpen(false); }}>لم يدفع — سجّلها…</Btn>
            )}
            {woOpen && (
              <div className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ background: 'rgba(224,73,43,.08)', border: '1px solid rgba(224,73,43,.35)' }}>
                <span className="text-[15px] font-extrabold">{primary.playerName} لم يدفع <span className="vc-num">{f2(total)}</span> — كيف تُسجَّل؟</span>
                <div className="grid grid-cols-2 gap-2">
                  {([['debt', 'دين عليه', 'يظهر في زيارته القادمة ليدفعه'], ['loss', 'خسارة', 'تُغلق ولا يُطالَب بها']] as const).map(([k, l, d]) => (
                    <button key={k} type="button" aria-pressed={woKind === k} onClick={() => setWoKind(k)}
                      className="vc-press rounded-2xl text-right px-3 py-2.5" style={{ minHeight: 64,
                        ...(woKind === k ? { background: '#E9F5EF', color: '#0B2A1F' } : { background: EM.card, border: `1px solid ${EM.line2}`, color: EM.text }) }}>
                      <span className="block text-[16px] font-extrabold">{l}</span>
                      <span className="block text-[12.5px]" style={{ opacity: .8 }}>{d}</span>
                    </button>
                  ))}
                </div>
                <label className="text-[14px] font-bold" htmlFor="wo-reason">لماذا لم يدفع؟</label>
                <input id="wo-reason" value={woReason} onChange={e => setWoReason(e.target.value)} maxLength={200}
                  placeholder="مثلاً: غادر قبل الحساب، يدفع غداً…"
                  className="w-full rounded-xl px-3 outline-none placeholder:text-[#5A6862]"
                  style={{ height: 52, fontSize: 16, background: EM.ink, border: `1px solid ${EM.line2}`, color: EM.text }} />
                <div className="flex gap-2">
                  <Btn kind="danger" h={52} className="flex-1" disabled={busy || !woKind || woReason.trim().length < 3} onClick={writeoff}>{busy ? 'يُسجَّل…' : 'سجّلها'}</Btn>
                  <Btn kind="ghost" h={52} style={{ color: TX.sub }} disabled={busy} onClick={() => { setWoOpen(false); setWoKind(null); setWoReason(''); }}>رجوع</Btn>
                </div>
                <span className="text-[12.5px]" style={{ color: TX.dim }}>يُسجَّل باسمك مع السبب ويظهر للإدارة في «الحساب».</span>
              </div>
            )}
            {canWaive && !waiveOpen && <Btn kind="ghost" h={52} style={{ fontSize: 15 }} disabled={busy} onClick={() => setWaiveOpen(true)}>إسقاط دخول اللعبة…</Btn>}
            {canRestore && <Btn kind="ghost" h={52} style={{ fontSize: 15 }} disabled={busy} onClick={() => waive(false)}>إعادة احتساب دخول اللعبة</Btn>}
            {canWaive && waiveOpen && (
              <div className="rounded-2xl p-3.5" style={{ background: 'rgba(224,73,43,.08)', border: '1px solid rgba(224,73,43,.35)' }}>
                <label className="block text-[15px] font-extrabold" htmlFor="waive-reason">لماذا يُسقط دخول اللعبة عن {primary.playerName}؟</label>
                <input id="waive-reason" value={reason} onChange={e => setReason(e.target.value)} autoFocus maxLength={200}
                  placeholder="مثلاً: ضيف الإدارة، تعويض عن خطأ…"
                  className="w-full mt-2 rounded-xl px-3 outline-none placeholder:text-[#5A6862]"
                  style={{ height: 52, fontSize: 16, background: EM.ink, border: `1px solid ${EM.line2}`, color: EM.text }} />
                <div className="flex gap-2 mt-2.5">
                  <Btn kind="danger" h={52} className="flex-1" disabled={busy || reason.trim().length < 3} onClick={() => waive(true)}>{busy ? 'يُسجَّل…' : 'أسقطه'}</Btn>
                  <Btn kind="ghost" h={52} style={{ color: TX.sub }} disabled={busy} onClick={() => { setWaiveOpen(false); setReason(''); }}>رجوع</Btn>
                </div>
                <div className="text-[13px] mt-2" style={{ color: TX.dim }}>يُسجَّل باسمك ويظهر للإدارة.</div>
              </div>
            )}
            {canWaiveMin && !minOpen && <Btn kind="ghost" h={52} style={{ fontSize: 15 }} disabled={busy} onClick={() => { setMinOpen(true); setWaiveOpen(false); setWoOpen(false); }}>إسقاط الحدّ الأدنى…</Btn>}
            {canRestoreMin && <Btn kind="ghost" h={52} style={{ fontSize: 15 }} disabled={busy} onClick={() => waiveMin(false)}>إعادة احتساب الحدّ الأدنى</Btn>}
            {canWaiveMin && minOpen && (
              <div className="rounded-2xl p-3.5" style={{ background: 'rgba(224,73,43,.08)', border: '1px solid rgba(224,73,43,.35)' }}>
                <label className="block text-[15px] font-extrabold" htmlFor="min-reason">لماذا يُسقط الحدّ الأدنى (<span className="vc-num">{f2(primary.minTopup)}</span>) عن {primary.playerName}؟</label>
                <input id="min-reason" value={minReason} onChange={e => setMinReason(e.target.value)} autoFocus maxLength={200}
                  placeholder="مثلاً: بطلب الإدارة، ضيف…"
                  className="w-full mt-2 rounded-xl px-3 outline-none placeholder:text-[#5A6862]"
                  style={{ height: 52, fontSize: 16, background: EM.ink, border: `1px solid ${EM.line2}`, color: EM.text }} />
                <div className="flex gap-2 mt-2.5">
                  <Btn kind="danger" h={52} className="flex-1" disabled={busy || minReason.trim().length < 3} onClick={() => waiveMin(true)}>{busy ? 'يُسجَّل…' : 'أسقطه'}</Btn>
                  <Btn kind="ghost" h={52} style={{ color: TX.sub }} disabled={busy} onClick={() => { setMinOpen(false); setMinReason(''); }}>رجوع</Btn>
                </div>
                <div className="text-[13px] mt-2" style={{ color: TX.dim }}>لهذه الليلة وحدها · يُسجَّل باسمك ويظهر للإدارة.</div>
              </div>
            )}
          </div>
        )}
        <Toast toast={toast} onHide={hide} />
      </div>
    );
  }

  // ══════════════════ القائمة ══════════════════
  return (
    <div className="flex flex-col gap-3 pb-28 max-w-[640px] mx-auto w-full">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-[24px] font-extrabold leading-tight m-0">التحصيل</h1>
          <div className="text-[14px]" style={{ color: isToday ? TX.dim : TX.amber }}>
            {curNight ? (isToday ? 'الليلة' : `ليلة ${nightLabel(curNight.activityDate)} — ليست الليلة`) : ' '}
          </div>
        </div>
        <button type="button" onClick={() => setOptionsOpen(true)} aria-label="خيارات: الليالي وطباعة الكلّ"
          className="vc-press w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-[22px] font-extrabold"
          style={{ border: `1px solid ${EM.line2}`, background: EM.card, color: TX.sub }}>⋯</button>
      </div>

      {staleNight && (
        <button type="button" onClick={() => pickNight(staleNight.activityId)} role="alert"
          className="vc-press flex items-center gap-2.5 rounded-2xl text-right"
          style={{ padding: '10px 12px', background: 'rgba(224,73,43,.08)', border: '1px solid rgba(224,73,43,.35)', color: 'inherit' }}>
          <Icon name="warn" size={20} stroke={2.2} color={TX.bad} />
          <span className="flex-1 min-w-0 text-[15px] font-bold leading-snug">
            ليلة {nightLabel(staleNight.activityDate)} فيها <span className="vc-num">{f2(staleNight.due)}</span> لم تُحصَّل
          </span>
          <span className="text-[15px] font-extrabold shrink-0" style={{ color: TX.bad }}>عرض</span>
        </button>
      )}

      {nights !== null && nights.length === 0 && (
        <div className="text-center py-12 px-3 text-[16px] rounded-2xl" style={{ color: TX.dim, border: `1px dashed ${EM.line}` }}>لا ليالٍ مفعَّل فيها المنيو مؤخّراً</div>
      )}

      {actId != null && (ledgerErr && !T ? (
        <div className="flex flex-col items-center gap-3 py-12 text-[16px]" style={{ color: TX.dim }}>
          <span>{ledgerErr}</span>
          <Btn kind="ghost" h={52} onClick={() => loadLedger(actId)}><Icon name="refresh" size={18} /> أعد المحاولة</Btn>
        </div>
      ) : !T ? (
        <Skeleton h={74} n={5} />
      ) : (
        <>
          {/* سؤال الكاشير: من بقي؟ */}
          <div className="flex items-baseline justify-between gap-3 px-0.5">
            <span className="text-[20px] font-extrabold">{openRows.length ? `بقي على ${openRows.length}` : 'حُصّل من الجميع ✓'}</span>
            {openRows.length > 0 && <span className="vc-num font-semibold" style={{ fontSize: 24, color: TX.amber }}>{f2(T.due)}</span>}
          </div>

          {openRows.length > 0 && (
            <label className="flex items-center gap-2 rounded-2xl px-3.5" style={{ height: 60, background: EM.ink2, border: `1px solid ${EM.line2}` }}>
              <Icon name="search" size={20} color={TX.dim} />
              <input value={q} onChange={e => setQ(e.target.value)} inputMode={byName ? 'text' : 'numeric'}
                aria-label={byName ? 'ابحث بالاسم' : 'ابحث برقم المقعد'} placeholder={byName ? 'اكتب الاسم' : 'رقم المقعد'}
                className="flex-1 min-w-0 bg-transparent border-none outline-none placeholder:text-[#5A6862]"
                style={{ height: 52, fontSize: 19, fontWeight: 600, color: EM.text }} />
              <button type="button" onClick={() => { setByName(b => !b); setQ(''); }}
                className="vc-press h-11 px-3.5 rounded-xl text-[14px] font-bold shrink-0" style={{ background: EM.card, border: `1px solid ${EM.line2}`, color: TX.sub }}>
                {byName ? 'بالمقعد' : 'بالاسم'}
              </button>
            </label>
          )}

          <div className="flex flex-col gap-2">
            {visible.map(r => {
              const wa = ledger?.waEnabled ? waPill(r, ledger.wa?.[r.playerId]) : null;
              return (
                <button key={r.key} type="button" onClick={() => openPay(r)} disabled={!canPay}
                  aria-label={`${r.playerName}، المقعد ${r.seat ?? '—'}، عليه ${f2(r.grandTotal)}`}
                  className="vc-press flex items-center gap-3 rounded-[18px] text-right"
                  style={{ minHeight: 76, padding: '10px 12px', background: EM.card, border: `1px solid ${EM.line}`, color: 'inherit' }}>
                  <SeatBadge seat={r.seat} size={54} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[18px] font-extrabold truncate">{r.playerName}</span>
                    {wa && <span className="flex items-center gap-1 text-[13px] font-bold truncate" style={{ color: wa.color }}><Icon name={wa.icon} size={14} stroke={2.2} /><span className="truncate">{wa.text}</span></span>}
                  </span>
                  {r.fullComp
                    ? <span className="shrink-0 text-[15px] font-extrabold rounded-full px-3 py-1" style={{ background: 'rgba(37,192,138,.12)', color: TX.good }}>🎁 ضيافة</span>
                    : <span className="vc-num font-semibold shrink-0" style={{ fontSize: 22 }}>{f2(r.grandTotal)}</span>}
                  <Icon name="chevron" size={20} color={TX.dim} />
                </button>
              );
            })}
            {openRows.length > 0 && visible.length === 0 && (
              <div className="text-center py-6 text-[16px]" style={{ color: TX.dim }}>{byName ? 'لا أحد بهذا الاسم' : 'لا أحد بهذا المقعد'} — جرّب {byName ? 'رقم المقعد' : 'الاسم'}</div>
            )}
            {rows.length === 0 && <div className="text-center py-8 text-[16px]" style={{ color: TX.dim }}>لا طلبات ولا لاعبين في هذه الليلة بعد</div>}
          </div>

          {debtRows.length > 0 && (
            <section aria-label="ديون من ليالٍ سابقة" className="flex flex-col gap-2 mt-1">
              <span className="text-[16px] font-extrabold" style={{ color: TX.amber }}>
                ديون من ليالٍ سابقة · <span className="vc-num">{f2(debtRows.reduce((s, r) => s + r.grandTotal, 0))}</span>
              </span>
              {debtRows.map(r => (
                <button key={r.key} type="button" onClick={() => openDebt(r)} disabled={!canPay}
                  aria-label={`${r.playerName}، دينٌ ${f2(r.grandTotal)}`}
                  className="vc-press flex items-center gap-3 rounded-[18px] text-right"
                  style={{ minHeight: 72, padding: '10px 12px', background: 'rgba(204,127,34,.07)', border: '1px solid rgba(204,127,34,.4)', color: 'inherit' }}>
                  <SeatBadge seat={r.seat} size={50} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[17px] font-extrabold truncate">{r.playerName}</span>
                    <span className="block text-[13px] truncate" style={{ color: TX.amber }}>
                      من ليلة {r.debtFrom ? nightLabel(r.debtFrom) : 'سابقة'}{r.writeoffReason ? ` — ${r.writeoffReason}` : ''}
                    </span>
                  </span>
                  <span className="vc-num font-semibold shrink-0" style={{ fontSize: 21, color: TX.amber }}>{f2(r.grandTotal)}</span>
                  <Icon name="chevron" size={20} color={TX.dim} />
                </button>
              ))}
            </section>
          )}

          {paidRows.length > 0 && (
            <button type="button" onClick={() => setPaidOpen(o => !o)} className="vc-press rounded-2xl text-[16px] font-bold"
              style={{ height: 56, border: `1px dashed ${EM.line2}`, color: TX.sub }}>
              {paidOpen ? '▾' : '‹'} المحصّل الليلة ({paidRows.length}) · <span className="vc-num">{f2(T.collected)}</span>
            </button>
          )}
          {paidOpen && paidRows.map(r => (
            <button key={r.key} type="button" onClick={() => openPaid(r)} className="vc-press flex items-center gap-3 rounded-[18px] text-right"
              style={{ minHeight: 64, padding: '8px 12px', background: EM.ink2, border: `1px solid ${EM.line}`, color: 'inherit' }}>
              <SeatBadge seat={r.seat} size={44} />
              <span className="flex-1 min-w-0">
                <span className="block text-[16px] font-bold truncate">{r.playerName}</span>
                <span className="block text-[13px] truncate" style={{ color: r.kind === 'writeoff' ? TX.bad : TX.dim }}>
                  {r.kind === 'writeoff'
                    ? `لم يدفع · ${r.payMethod === 'debt' ? 'دين عليه' : 'خسارة'}${r.writeoffReason ? ` — ${r.writeoffReason}` : ''}`
                    : <>{hhmm(r.paidAt)}{r.payMethod ? ` · ${METHOD_AR[r.payMethod]}` : ''}{r.paidForBy ? ` · دفعها ${r.paidForBy}` : ''}{r.fullComp ? ' · ضيافة' : ''}</>}
                </span>
              </span>
              <span className="vc-num shrink-0" style={{ fontSize: 18, color: r.kind === 'writeoff' ? TX.bad : TX.good }}>{f2(r.grandTotal)}</span>
            </button>
          ))}
        </>
      ))}

      {/* ══ خيارات: الليالي وطباعة الكلّ ══ */}
      <Sheet open={optionsOpen} onClose={() => !printingAll && setOptionsOpen(false)} title="خيارات" maxWidth={460}>
        <div className="flex flex-col gap-2 mt-3">
          <span className="text-[14px] font-bold" style={{ color: TX.dim }}>الليلة</span>
          {(nights ?? []).map(n => {
            const on = n.activityId === actId;
            return (
              <button key={n.activityId} type="button" onClick={() => pickNight(n.activityId)} aria-pressed={on}
                className="vc-press flex items-center gap-3 rounded-2xl text-right"
                style={{ minHeight: 56, padding: '8px 14px', background: on ? 'rgba(37,192,138,.1)' : EM.ink2, border: `1px solid ${on ? EM.go : EM.line2}`, color: 'inherit' }}>
                <span className="flex-1 text-[16px] font-bold">{dayKey(n.activityDate) === today ? `الليلة · ${nightLabel(n.activityDate)}` : nightLabel(n.activityDate)}</span>
                {n.dueCount > 0 && <span className="text-[14px] font-bold" style={{ color: TX.amber }}>بقي {n.dueCount}</span>}
              </button>
            );
          })}
          {rows.length > 0 && (
            <Btn kind="ghost" h={56} style={{ fontSize: 16, marginTop: 8 }} onClick={printAll} disabled={printingAll}>
              <Icon name="printer" size={18} /> {printingAll ? 'يُجهَّز الملفّ…' : `اطبع كلّ فواتير الليلة (${rows.length})`}
            </Btn>
          )}
        </div>
      </Sheet>

      {/* ══ فاتورة محصّلة ══ */}
      <Sheet open={!!paidSheet} onClose={() => setPaidSheet(null)} title={paidSheet?.playerName}
        subtitle={paidSheet ? `#${paidSheet.invoiceNo ?? ''} · ${hhmm(paidSheet.paidAt)}${paidSheet.payMethod && METHOD_AR[paidSheet.payMethod] ? ` · ${METHOD_AR[paidSheet.payMethod]}` : ''}${paidSheet.paidForBy ? ` · دفعها ${paidSheet.paidForBy}` : ''}` : undefined}
        lead={<SeatBadge seat={paidSheet?.seat ?? null} size={44} />}>
        {paidSheet && (
          <div className="flex flex-col gap-2.5 mt-3">
            <div className="rounded-2xl" style={{ background: EM.ink2, border: `1px solid ${EM.line}`, padding: '2px 14px' }}>
              {plainLines(paidSheet).map(l => (
                <div key={l.label} className="flex justify-between gap-3 text-[16px]" style={{ padding: '10px 0', borderBottom: `1px solid ${EM.line}` }}>
                  <span>{l.label}</span><span className="vc-num">{l.v < 0 ? '− ' : ''}{f2(Math.abs(l.v))}</span>
                </div>
              ))}
              {paidDetail?.lines.map((l, i) => (
                <div key={i} className="flex gap-2 text-[14px]" style={{ padding: '7px 0', color: TX.sub }}>
                  <span className="vc-num" style={{ minWidth: 26 }}>×{l.quantity}</span><span className="flex-1 min-w-0">{l.name}</span><span className="vc-num">{f2(l.lineTotal)}</span>
                </div>
              ))}
              <div className="flex justify-between text-[18px] font-extrabold" style={{ padding: '10px 0', borderTop: `1px solid ${EM.line2}` }}>
                <span>{paidSheet.kind === 'writeoff' ? 'لم يُدفع' : 'المدفوع'}</span><span className="vc-num">{f2(paidSheet.grandTotal)}</span>
              </div>
            </div>
            {paidSheet.kind === 'writeoff' && (
              <div className="rounded-2xl px-4 py-3 text-[15px] flex flex-col gap-2" style={{ background: 'rgba(224,73,43,.08)', border: '1px solid rgba(224,73,43,.35)' }}>
                <span className="font-bold" style={{ color: TX.bad }}>لم يدفع · {paidSheet.payMethod === 'debt' ? 'دين عليه — يظهر في زيارته القادمة' : 'خسارة'}</span>
                {paidSheet.writeoffReason && <span style={{ color: TX.sub }}>السبب: {paidSheet.writeoffReason}{paidSheet.paidByName ? ` · سجّلها ${paidSheet.paidByName}` : ''}</span>}
                <Btn kind="ghost" h={52} style={{ fontSize: 15 }} onClick={async () => {
                  const u = await apiRef.current.send(`/api/venue/invoices/unpay/${paidSheet.invoiceId}`, 'POST', {}).catch(() => null);
                  if (!u?.ok) { show(u?.data?.error || 'تعذّر — إعادة الفتح بعد المهلة للإدارة', { tone: 'bad' }); return; }
                  setPaidSheet(null); show('أُعيدت الفاتورة مفتوحة'); reloadAll();
                }}>↩ أعد فتحها للتحصيل</Btn>
              </div>
            )}
            <Btn kind="ghost" h={52} style={{ fontSize: 15 }} disabled={printing} onClick={() => printFor(paidSheet.playerId, paidSheet.invoiceId, 'receipt')}>
              <Icon name="printer" size={18} /> اطبع إيصالاً
            </Btn>
            <Btn kind="ghost" h={52} style={{ fontSize: 15 }} disabled={printing} onClick={() => printFor(paidSheet.playerId, paidSheet.invoiceId, 'pdf')}>ملفّ للمشاركة (A6)</Btn>
            {ledger?.waEnabled && (
              <Btn kind="ghost" h={52} style={{ fontSize: 15 }} disabled={waBusy} onClick={() => waSend(paidSheet.playerId, paidSheet.invoiceId, true)}>{waBusy ? 'يُرسل…' : 'أرسل الختم على واتساب'}</Btn>
            )}
          </div>
        )}
      </Sheet>

      {undoBar}
      <Toast toast={toast} onHide={hide} />
    </div>
  );
}
