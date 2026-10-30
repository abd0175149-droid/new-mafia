'use client';

// ══════════════════════════════════════════════════════
// 🧾 التحصيل — /venue/invoices · إعادة البناء 2026-10-30 (الهاتف أوّلاً)
// الكاشير يقف عند الباب والهاتف بيده: سؤاله الوحيد «من بقي عليه، وكم؟».
// لذلك الصفحة دفترُ ليلةٍ واحدة: ليالي التحصيل حبوبٌ في الأعلى، ثمّ شريط تقدّم،
// ثمّ قائمة «لم يُحصَّل» افتراضاً — وكلّ صفٍّ عليه زرّ «حصّل» مباشرةً.
// التفاصيل والطباعة وإسقاط الدخوليّة في ورقةٍ سفليّة، والتأكيد داخلها بخطوتين
// (لا confirm() رماديّة)، والتراجع من الإشعار ٦ ثوانٍ لأنّ النقرة الخاطئة واردة.
// الصفحة نفسها تُركَّب في /admin/venues/invoices للإدارة (isHQ و can()=>true).
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVenue } from '../context';
import { EM, TX, SHARE, f2, nightLabel, hhmm, pPlayers, pItems, pInvoices } from '../ember';
import { Icon, SeatBadge, Sheet, useToast, Toast, Segmented, Btn, Swatch, Amount, Skeleton, PageHead, useVenueApi } from '../ui';
import { refreshBadges } from '../VenueShell';
import { getSocket } from '@/lib/socket';

// ── الأنواع (مطابقة لردود الخادم) ─────────────────────
interface Night {
  activityId: number; activityName: string; activityDate: string;
  collected: number; due: number; total: number; paidCount: number; dueCount: number;
}

interface Row {
  key: string; kind: 'open' | 'paid';
  playerId: number; playerName: string; seat: number | null; bookingId: number | null;
  invoiceId: number | null; invoiceNo: number | null; printedAt: string | null;
  isPaid: boolean; paidAt: string | null; paidById: number | null; paidByName: string;
  canUndoUntil: string | null;
  ordersCount: number; ordersTotal: number; minTopup: number; waterCharge: number;
  loyaltyDiscount: number; gameFee: number; grandTotal: number;
  isFree: boolean; noInvoice: boolean;
}

interface Ledger {
  activity: { id: number; name: string; date: string };
  gameFeeEnabled: boolean; minChargeEnabled: boolean; minimumCharge: number;
  autoWaterEnabled: boolean; waterPrice: number;
  totals: { collected: number; due: number; total: number; paidCount: number; dueCount: number };
  candidates: Row[];
  /** 🧾 فواتير واتساب: آخر حالة إرسال لكلّ لاعب (2026-10-30) */
  wa?: Record<number, WaState>;
  waEnabled?: boolean;
}

interface WaState {
  kind?: string; status?: string; reason?: string; channel?: string | null; invoiceNo?: number | null; at?: string | null;
  transfer?: { at: string; forwarded: boolean; amountRead: number | null; short: boolean; over?: boolean; payeeMismatch?: boolean };
}

/** حالة واتساب على الصفّ — الشكل (أيقونة + كلمة) مع اللون، لا اللون وحده */
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

interface InvoiceLine {
  name: string; quantity: number; unitPrice: number; lineTotal: number;
  options: { group: string; value: string }[];
  components: { name: string; qty: number; options?: { group: string; value: string }[] }[];
}

interface Detail {
  lines: InvoiceLine[];
  ordersCount: number; ordersTotal: number; minTopup: number; waterCharge: number;
  loyaltyDiscount?: number; loyaltyItemName?: string | null;
  gameFeeApplied: boolean; gameFeeAmount: number; grandTotal: number;
  seat: number | null; invoiceId: number | null; invoiceNo: number | null;
  isPaid: boolean; paidAt: string | null;
  bookingIsPaid: boolean; bookingIsFree: boolean;
  playerName: string; activityName: string;
}

type Tab = 'due' | 'paid' | 'all';

// لون مكوّنات الباقة في سطر الفاتورة — نفس درجة شاشة الطلبات في النموذج المعتمد
// (EM.bundle نفسه داكنٌ على البطاقة بخطٍّ صغير)
const COMP_TX = '#C2AEEB';
// رماديّ «الحجز المجّانيّ»: صفرٌ لا يذهب لأحد، فلا يأخذ لون حصّة
const FREE_SW = '#3A4640';

/** يوم عمّان الحاليّ «YYYY-MM-DD» — الليلة تُقاس بتقويم المكان لا بتقويم الجهاز */
const ammanToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Amman' });
/** يوم الفعاليّة — بنفس قراءة UTC التي يستعملها nightLabel كي لا يختلف «الليلة» عن التسمية */
const dayKey = (d: string) => { const t = new Date(d); return isNaN(+t) ? '' : t.toISOString().slice(0, 10); };

/** لوحة المفاتيح العربيّة تكتب «١٢»؛ المقعد مخزّنٌ «12» — نوحّد قبل المقارنة */
const latinDigits = (s: string) => s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660));

/** سطر التفكيك تحت الاسم: الأجزاء غير الصفريّة وحدها، كي يُقرأ في نظرة */
function breakdown(r: Row): string {
  const p: string[] = [];
  if (r.ordersTotal > 0) p.push(`طلبات ${f2(r.ordersTotal)}`);
  if (r.waterCharge > 0) p.push(`مياه ${f2(r.waterCharge)}`);
  if (r.minTopup > 0) p.push(`حدّ أدنى ${f2(r.minTopup)}`);
  if (r.gameFee > 0) p.push(`دخوليّة ${f2(r.gameFee)}`);
  if (r.loyaltyDiscount > 0) p.push(`− ولاء ${f2(r.loyaltyDiscount)}`);
  if (r.isFree) p.push('حجز مجّانيّ');
  if (r.kind === 'open' && r.noInvoice) p.push('بلا فاتورة');
  return p.length ? p.join(' · ') : 'لم يطلب شيئاً';
}

export default function VenueInvoicesPage() {
  const { locationId, can } = useVenue();
  const api = useVenueApi();
  // 🔴 authHeaders يُبنى من جديد في كلّ رسمٍ للغلاف، فتتغيّر get/send كلّ مرّة.
  //    لو دخلت تبعيّات المؤثّرات لدار الجلب بلا نهاية — نقرؤها من مرجعٍ ثابت.
  const apiRef = useRef(api);
  apiRef.current = api;
  const { toast, show, hide } = useToast();

  const [nights, setNights] = useState<Night[] | null>(null);
  const [actId, setActId] = useState<number | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [ledgerFor, setLedgerFor] = useState<number | null>(null);
  const [ledgerErr, setLedgerErr] = useState('');
  const [tab, setTab] = useState<Tab>('due');
  const [q, setQ] = useState('');

  // ── ورقة الفاتورة ──
  const [sheetRow, setSheetRow] = useState<Row | null>(null);
  const [step, setStep] = useState<'view' | 'confirm'>('view');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [reason, setReason] = useState('');

  // ── طباعة الكلّ ──
  const [printAllOpen, setPrintAllOpen] = useState(false);
  const [printingAll, setPrintingAll] = useState(false);

  // مراجع للمؤقّت والسوكيت: يقرآن آخر حالٍ بلا إعادة اشتراك في كلّ رسم
  const actIdRef = useRef<number | null>(null);
  actIdRef.current = actId;
  const sheetRef = useRef<{ row: Row | null; total: number | null; busy: boolean }>({ row: null, total: null, busy: false });
  sheetRef.current = { row: sheetRow, total: detail?.grandTotal ?? sheetRow?.grandTotal ?? null, busy };
  // ?activityId=N من صفحة «الحساب» — يُقرأ مرّةً واحدة؛ window لا useSearchParams
  // كي لا تحتاج الصفحة حدَّ Suspense في الإنتاج
  const wantedRef = useRef<number | null | undefined>(undefined);

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

  const fetchDetail = useCallback(async (row: Row) => {
    const id = actIdRef.current;
    if (!id) return;
    try {
      // الفاتورة المحصّلة لقطةٌ ثابتة برقمها؛ المفتوحة تُحسب حيّةً من الطلبات
      const qs = row.kind === 'paid' && row.invoiceId ? `?invoiceId=${row.invoiceId}` : '';
      const r = await apiRef.current.get(`/api/venue/invoices/${id}/${row.playerId}${qs}`);
      // الورقة ربّما أُغلقت أو تبدّلت أثناء الانتظار — لا نكتب تفاصيل لاعبٍ على ورقة غيره
      if (sheetRef.current.row?.key !== row.key) return;
      if (r.ok) setDetail(r.data.invoice);
      else show(r.data?.error || 'تعذّر جلب تفاصيل الفاتورة', { tone: 'bad' });
    } catch {
      if (sheetRef.current.row?.key === row.key) show('خطأ في الاتصال', { tone: 'bad' });
    }
  }, [show]);

  /**
   * دفتر الليلة. background = تحديثٌ لم يطلبه الكاشير (مؤقّت/سوكيت): إن تغيّر
   * مبلغ الورقة المفتوحة نُعيده لخطوة العرض وننبّهه — كي لا يؤكّد مبلغاً قديماً
   * وصل بعده طلبٌ جديد. بعد أفعاله هو نحن نعيد جلب التفاصيل صراحةً فلا تنبيه.
   */
  const loadLedger = useCallback(async (id: number, background = false) => {
    try {
      const r = await apiRef.current.get(`/api/venue/invoices/candidates?activityId=${id}`);
      if (actIdRef.current !== id) return;          // بدّل الليلة أثناء الانتظار
      if (!r.ok) { if (!background) setLedgerErr(r.data?.error || 'تعذّر تحميل التحصيل'); return; }
      const L: Ledger = r.data;
      setLedger(L); setLedgerFor(id); setLedgerErr('');

      const cur = sheetRef.current;
      if (!cur.row) return;
      const fresh = L.candidates.find(x => x.key === cur.row!.key);
      if (fresh) {
        setSheetRow(fresh);
        // نقارن بصفّ الدفتر السابق لا بالتفاصيل: مصدران مختلفان قد يفترقان بقرشٍ فيتكرّر التنبيه
        if (background && !cur.busy && cur.row.kind === 'open' && Math.abs(fresh.grandTotal - cur.row.grandTotal) > 0.004) {
          setStep('view'); setDetail(null);
          show(`تغيّر مبلغ ${fresh.playerName} — صار ${f2(fresh.grandTotal)} د.أ`, { tone: 'bad' });
          fetchDetail(fresh);
        }
      } else if (background && !cur.busy && cur.row.kind === 'open') {
        // حُصّلت من جهازٍ آخر (أو لم يبقَ عليه شيء) — الورقة صارت تعرض شيئاً غير موجود
        setSheetRow(null);
        show(`فاتورة ${cur.row.playerName} لم تعد مفتوحة — حُدّثت القائمة`);
      }
    } catch {
      if (!background && actIdRef.current === id) setLedgerErr('خطأ في الاتصال');
    }
  }, [fetchDetail, show]);

  // الليالي عند فتح الصفحة أو تبديل المكان (للإدارة)
  useEffect(() => {
    if (!locationId) return;
    setActId(null); actIdRef.current = null; setLedger(null); setLedgerFor(null); setNights(null);
    loadNights();
  }, [locationId, loadNights]);

  useEffect(() => { if (actId) loadLedger(actId); }, [actId, loadLedger]);

  // ── التحديث الحيّ: مؤقّت ٣٠ ث + عودة الظهور + سوكيت إن وُجد ──
  // حساب الكاشير قد لا يكون في غرفة المكان على السوكيت (لا نرسل venue:join هنا
  // عمداً — الانضمام شأن شاشة الطلبات)، فالمؤقّت هو الضمان والسوكيت تسريع.
  useEffect(() => {
    if (!locationId || !actId) return;
    let deb: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      loadLedger(actId, true);
      loadNights();
    };
    // دفعة طلباتٍ متتالية = تحديثٌ واحد
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

  // ── الورقة ────────────────────────────────────────
  const openSheet = (row: Row, confirm: boolean) => {
    sheetRef.current = { row, total: row.grandTotal, busy: false };
    setSheetRow(row); setDetail(null); setStep(confirm ? 'confirm' : 'view');
    setWaiveOpen(false); setReason('');
    fetchDetail(row);
  };
  // مرجعٌ ثابت: Sheet يعيد ربط Esc كلّما تغيّر onClose
  const closeSheet = useCallback(() => {
    sheetRef.current = { row: null, total: null, busy: false };
    setSheetRow(null); setDetail(null); setStep('view'); setWaiveOpen(false); setReason('');
  }, []);

  const pickNight = (id: number) => {
    if (id === actId) return;
    closeSheet();
    setActId(id); setTab('due'); setQ(''); setLedgerErr('');
  };

  const reloadAll = async () => {
    const id = actIdRef.current;
    if (id) await loadLedger(id);
    loadNights();
    refreshBadges();
  };

  // ── PDF: جلبٌ ← blob ← رابط كائنٍ في لسانٍ جديد (التوكن في الترويسة لا في الرابط) ──
  const openPdf = async (url: string, method: 'GET' | 'POST'): Promise<boolean> => {
    // 🍎 النافذة تُفتح **قبل** أوّل await — ما زلنا داخل نقرة المستخدم. فتحها بعد الجلب
    //    يجعل سفاري الآيفون يعدّها منبثقةً فيحجبها. نملؤها بالـPDF حين يصل.
    const pre = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    try {
      const { withLoc, authHeaders } = apiRef.current;
      const r = await fetch(withLoc(url), { method, headers: authHeaders });
      if (!r.ok) {
        pre?.close();
        const d = await r.json().catch(() => ({}));
        show((d as any).error || 'فشل توليد الفاتورة', { tone: 'bad' });
        return false;
      }
      const blobUrl = URL.createObjectURL(await r.blob());
      const w = pre ?? window.open(blobUrl, '_blank');
      if (pre) pre.location.href = blobUrl;
      if (!w) show('المتصفّح منع فتح الفاتورة — اسمح بالنوافذ المنبثقة لهذا الموقع', { tone: 'bad' });
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
      return true;
    } catch {
      pre?.close();
      show('خطأ في الاتصال', { tone: 'bad' });
      return false;
    }
  };

  // kind: 'pdf' ملفّ A6 للمشاركة · 'receipt' إيصال 80مم يفتح نافذة الطباعة بنفسه (طابعة الكاش)
  const printOne = async (kind: 'pdf' | 'receipt' = 'pdf') => {
    if (!sheetRow || !actId || printing) return;
    setPrinting(true);
    const row = sheetRow;
    const qs = row.kind === 'paid' && row.invoiceId ? `?invoiceId=${row.invoiceId}` : '';
    const ok = await openPdf(`/api/venue/invoices/${actId}/${row.playerId}/${kind}${qs}`, 'POST');
    setPrinting(false);
    // أوّل طباعة لفاتورةٍ مفتوحة تُثبّت رقمها — نُريه في الورقة والقائمة
    if (ok && row.kind === 'open') { await loadLedger(actId); fetchDetail(row); }
  };

  // 🧾 «أرسل على واتساب» — يمرّ بطابور الخادم نفسه، والحالة تتحدّث بالمقبس
  const [waBusy, setWaBusy] = useState(false);
  const waSend = async () => {
    if (!sheetRow || !actId || waBusy) return;
    setWaBusy(true);
    const row = sheetRow;
    const qs = row.kind === 'paid' && row.invoiceId ? `?invoiceId=${row.invoiceId}` : '';
    const r = await apiRef.current.send(`/api/venue/invoices/${actId}/${row.playerId}/wa-send${qs}`, 'POST').catch(() => null);
    setWaBusy(false);
    if (!r?.ok) { show(r?.data?.error || 'تعذّر الإرسال', { tone: 'bad' }); return; }
    show(row.kind === 'paid' ? 'يُرسل الختم الآن' : 'تُرسل الفاتورة الآن');
    loadLedger(actId, true);
  };

  const printAll = async () => {
    if (!actId || printingAll) return;
    setPrintingAll(true);
    const ok = await openPdf(`/api/venue/invoices/${actId}/print-all`, 'GET');
    setPrintingAll(false);
    setPrintAllOpen(false);
    if (ok) loadLedger(actId);
  };

  // ── التحصيل ───────────────────────────────────────
  const undoPay = async (invoiceId: number, invoiceNo: number | null) => {
    let msg: { text: string; bad: boolean };
    try {
      const r = await apiRef.current.send(`/api/venue/invoices/unpay/${invoiceId}`, 'POST', {});
      msg = r.ok
        ? { text: `أُلغي تحصيل الفاتورة #${r.data?.invoiceNo ?? invoiceNo ?? ''} — عادت إلى «لم يُحصَّل»`, bad: false }
        : { text: r.data?.error || 'تعذّر التراجع عن التحصيل', bad: true };
    } catch { msg = { text: 'خطأ في الاتصال — لم يُلغَ التحصيل', bad: true }; }
    await reloadAll();
    // الإشعار يُخفي نفسه بعد انتهاء دالّة التراجع، فنؤجّل النتيجة خطوةً كي لا تُمحى معه
    setTimeout(() => show(msg.text, { tone: msg.bad ? 'bad' : 'ok' }), 0);
  };

  const pay = async () => {
    if (!sheetRow || !actId || busy || sheetRow.kind !== 'open') return;
    const row = sheetRow;
    // المبلغ الذي رآه الكاشير بعينه — الخادم يرفض (409) إن تغيّر بطلبٍ وصل للتوّ
    const expectedTotal = detail?.grandTotal ?? row.grandTotal;
    setBusy(true);
    sheetRef.current = { ...sheetRef.current, busy: true };
    let r: { ok: boolean; status: number; data: any } | null = null;
    try { r = await apiRef.current.send(`/api/venue/invoices/${actId}/${row.playerId}/pay`, 'POST', { expectedTotal }); }
    catch { r = null; }
    setBusy(false);
    sheetRef.current = { ...sheetRef.current, busy: false };

    if (!r) { show('خطأ في الاتصال — لم يُسجَّل التحصيل', { tone: 'bad' }); return; }
    if (!r.ok) {
      show(r.data?.error || 'فشل تسجيل التحصيل', { tone: 'bad' });
      if (r.status === 409) {
        // المبلغ تغيّر: نعيده لخطوة العرض بالمبلغ الجديد — لا تأكيد على رقمٍ لم يره
        setStep('view'); setDetail(null);
        await loadLedger(actId);
        fetchDetail(sheetRef.current.row ?? row);
        loadNights(); refreshBadges();
      }
      return;
    }

    const d = r.data;
    closeSheet();
    await reloadAll();
    const text = `حُصّلت فاتورة #${d.invoiceNo} · ${f2(d.grandTotal)} د.أ`
      + (Number(d.gameFeeSettled) > 0 ? ` · منها ${f2(d.gameFeeSettled)} للنادي` : '');
    // لا تراجع لفاتورةٍ استهلكت مشروب الولاء — الخادم لا يعيد canUndoUntil لها
    show(text, d.canUndoUntil && d.invoiceId ? { undo: () => undoPay(d.invoiceId, d.invoiceNo), ms: 6000 } : {});
  };

  // ── إسقاط الدخوليّة / إعادتها ─────────────────────
  const waive = async (on: boolean) => {
    if (!sheetRow || !actId || busy) return;
    const row = sheetRow;
    const why = reason.trim();
    if (on && why.length < 3) return;
    setBusy(true);
    let r: { ok: boolean; data: any } | null = null;
    try {
      r = await apiRef.current.send(`/api/venue/invoices/${actId}/${row.playerId}/waive-fee`, 'POST',
        on ? { waive: true, reason: why } : { waive: false });
    } catch { r = null; }
    setBusy(false);
    if (!r) { show('خطأ في الاتصال', { tone: 'bad' }); return; }
    if (!r.ok) { show(r.data?.error || 'فشل الإجراء', { tone: 'bad' }); return; }
    setWaiveOpen(false); setReason(''); setStep('view');
    show(on ? `أُسقطت الدخوليّة عن ${row.playerName}` : `أُعيد احتساب الدخوليّة على ${row.playerName}`);
    await reloadAll();
    fetchDetail(sheetRef.current.row ?? row);
  };

  // ── المشتقّات ─────────────────────────────────────
  const rows = useMemo(() => (ledger && ledgerFor === actId ? ledger.candidates : []), [ledger, ledgerFor, actId]);
  const openRows = rows.filter(r => r.kind === 'open');
  const paidRows = rows.filter(r => r.kind === 'paid');
  const needle = latinDigits(q.trim()).toLowerCase();
  const base = tab === 'due' ? openRows : tab === 'paid' ? paidRows : rows;
  const visible = needle
    ? base.filter(r => r.playerName.toLowerCase().includes(needle) || (r.seat != null && String(r.seat) === needle))
    : base;

  const today = ammanToday();
  const curNight = nights?.find(n => n.activityId === actId) ?? null;
  // ليلةٌ مطلوبة بالرابط ليست في القائمة (أقدم من النافذة) — نضيف حبّتها كي يُرى أين نحن
  const chips: Night[] = useMemo(() => {
    const list = nights ?? [];
    if (actId && !list.some(n => n.activityId === actId) && ledger && ledgerFor === actId) {
      return [...list, {
        activityId: actId, activityName: ledger.activity.name, activityDate: ledger.activity.date,
        ...ledger.totals,
      }];
    }
    return list;
  }, [nights, actId, ledger, ledgerFor]);
  // ليلةٌ سابقة فيها مالٌ لم يُحصَّل والكاشير ينظر إلى غيرها — المال المنسيّ لا يُنسى
  const staleNight = (nights ?? []).find(n => n.activityId !== actId && n.due > 0 && dayKey(n.activityDate) !== today) ?? null;

  const T = ledger && ledgerFor === actId ? ledger.totals : null;
  const pct = T ? (T.total > 0 ? Math.min(100, Math.max(0, (T.collected / T.total) * 100)) : 100) : 0;

  // ── الحراسات ──────────────────────────────────────
  if (!can('invoices.print')) {
    return <div className="text-center py-16 text-[14px]" style={{ color: TX.dim }}>ليس لدى حسابك صلاحيّة التحصيل والفواتير</div>;
  }
  if (!locationId) {
    return <div className="text-center py-16 text-[14px]" style={{ color: TX.dim }}>اختر مكاناً لعرض تحصيله</div>;
  }

  // ── الورقة: قيمٌ مشتقّة ────────────────────────────
  const shownTotal = detail?.grandTotal ?? sheetRow?.grandTotal ?? 0;
  const sheetSub = sheetRow ? (() => {
    const no = detail?.invoiceNo ?? sheetRow.invoiceNo;
    const first = sheetRow.kind === 'paid' ? `فاتورة #${no ?? ''}`
      : no != null ? `فاتورة #${no} صدرت ولم تُحصَّل`
      : sheetRow.noInvoice ? 'طلب بلا فاتورة — تُصدر عند التحصيل' : 'لم تُصدر بعد';
    const second = detail ? (detail.lines.length ? pItems(detail.lines.length) : 'بلا طلبات') : null;
    return second ? `${first} · ${second}` : first;
  })() : '';
  const sheetTotals: { label: string; v: string; sw: string }[] = [];
  if (detail) {
    if (detail.ordersTotal > 0) sheetTotals.push({ label: 'الطلبات', v: f2(detail.ordersTotal), sw: SHARE.venue });
    if (detail.waterCharge > 0) sheetTotals.push({ label: 'مياه', v: f2(detail.waterCharge), sw: SHARE.venue });
    if (detail.minTopup > 0) sheetTotals.push({
      label: `تكملة الحدّ الأدنى${ledger?.minimumCharge ? ` (${f2(ledger.minimumCharge)})` : ''}`, v: f2(detail.minTopup), sw: SHARE.venue,
    });
    if ((detail.loyaltyDiscount || 0) > 0) sheetTotals.push({
      label: `مشروب بطاقة الولاء${detail.loyaltyItemName ? ` (${detail.loyaltyItemName})` : ''}`, v: `− ${f2(detail.loyaltyDiscount || 0)}`, sw: SHARE.venue,
    });
    if (detail.gameFeeApplied && detail.gameFeeAmount > 0) sheetTotals.push({ label: 'دخوليّة اللعبة', v: f2(detail.gameFeeAmount), sw: SHARE.club });
    if (detail.bookingIsFree) sheetTotals.push({ label: 'الحجز مجّانيّ — بلا دخوليّة', v: '0.00', sw: FREE_SW });
  }
  const isOpenRow = sheetRow?.kind === 'open';
  const canWaive = !!(canPay && isOpenRow && detail && !detail.isPaid && !detail.bookingIsPaid && !detail.bookingIsFree && detail.gameFeeApplied);
  const canRestore = !!(canPay && isOpenRow && detail && !detail.isPaid && !detail.bookingIsPaid && detail.bookingIsFree);
  const paidAtShown = detail?.paidAt ?? sheetRow?.paidAt ?? null;
  const paidNoShown = detail?.invoiceNo ?? sheetRow?.invoiceNo ?? null;

  return (
    <div className="flex flex-col gap-[14px]">
      <PageHead title="التحصيل" sub="لكلّ من طلب أو لعب فاتورة" />

      {/* ── الليالي ── */}
      {nights === null ? (
        <Skeleton h={44} n={1} />
      ) : chips.length === 0 ? (
        <div className="text-center py-12 px-3 text-[14px] leading-relaxed rounded-2xl" style={{ color: TX.dim, border: `1px dashed ${EM.line}` }}>
          لا ليالٍ مفعَّل فيها المنيو مؤخّراً
        </div>
      ) : (
        <div className="vc-scroll flex gap-2 overflow-x-auto" role="tablist" aria-label="الليلة">
          {chips.map(n => {
            const on = n.activityId === actId;
            const isToday = dayKey(n.activityDate) === today;
            return (
              <button key={n.activityId} type="button" role="tab" aria-selected={on} onClick={() => pickNight(n.activityId)}
                title={n.activityName}
                className="vc-press shrink-0 flex items-center gap-2 rounded-full px-[14px] text-[14px] font-extrabold whitespace-nowrap"
                style={{
                  height: 44,
                  background: on ? 'rgba(204,127,34,.16)' : EM.ink2,
                  border: `1px solid ${on ? SHARE.venue : EM.line2}`,
                  color: on ? TX.amber : TX.sub,
                }}>
                {isToday ? `الليلة · ${nightLabel(n.activityDate)}` : nightLabel(n.activityDate)}
                {n.dueCount > 0 && (
                  <span className="vc-num inline-flex items-center justify-center rounded-full text-[12px]"
                    aria-label={`${n.dueCount} لم يُحصَّل`}
                    style={{ minWidth: 22, height: 22, padding: '0 6px', background: TX.amberHi, color: '#1A1208' }}>
                    {n.dueCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── ليلةٌ سابقة لم تُحصَّل ── */}
      {staleNight && (
        <div className="vc-enter flex items-center gap-2.5 rounded-xl" role="alert"
          style={{ padding: '6px 6px 6px 12px', background: 'rgba(224,73,43,.08)', border: '1px solid rgba(224,73,43,.35)' }}>
          <Icon name="warn" size={18} stroke={2.2} color={TX.bad} />
          <span className="flex-1 min-w-0 text-[13.5px] font-bold leading-snug py-1.5">
            ليلة {nightLabel(staleNight.activityDate)} فيها <span className="vc-num">{f2(staleNight.due)}</span> د.أ لم تُحصَّل
          </span>
          <button type="button" onClick={() => pickNight(staleNight.activityId)}
            className="vc-press shrink-0 h-11 px-3.5 rounded-[10px] text-[14px] font-extrabold"
            style={{ background: 'rgba(255,255,255,.06)', color: TX.bad }}>
            عرض
          </button>
        </div>
      )}

      {actId != null && (ledgerErr && !T ? (
        <div className="flex flex-col items-center gap-3 py-12 text-[14px]" style={{ color: TX.dim }}>
          <span>{ledgerErr}</span>
          <Btn kind="ghost" h={44} onClick={() => loadLedger(actId)}>
            <Icon name="refresh" size={18} /> أعد المحاولة
          </Btn>
        </div>
      ) : !T ? (
        <>
          <Skeleton h={92} n={1} />
          <Skeleton h={68} n={4} />
        </>
      ) : (
        <>
          {/* ── التقدّم ── */}
          <section aria-label="تقدّم التحصيل">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-baseline gap-1.5 min-w-0 flex-wrap">
                <span className="vc-num font-semibold leading-none" style={{ fontSize: 34 }}>{f2(T.collected)}</span>
                <span className="text-[14px]" style={{ color: TX.dim }}>من <span className="vc-num">{f2(T.total)}</span> د.أ</span>
              </div>
              {rows.length > 0 && (
                <button type="button" onClick={() => setPrintAllOpen(true)} aria-label="طباعة كلّ فواتير الليلة"
                  className="vc-press shrink-0 h-11 px-3 rounded-xl flex items-center gap-1.5 text-[13.5px] font-bold"
                  style={{ border: `1px solid ${EM.line2}`, color: TX.sub }}>
                  <Icon name="printer" size={18} /> طباعة الكلّ
                </button>
              )}
            </div>
            <div role="progressbar" aria-label="نسبة المحصَّل" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
              className="overflow-hidden rounded-full mt-2.5" style={{ height: 10, background: '#1B211D' }}>
              <div className="vc-seg h-full rounded-full" style={{ width: `${pct}%`, background: EM.go }} />
            </div>
            <div className="flex justify-between gap-3 mt-2.5 text-[13.5px]">
              <span className="font-bold">
                {T.dueCount > 0
                  ? <>بقي {pPlayers(T.dueCount)} · <span className="vc-num">{f2(T.due)}</span> د.أ</>
                  : 'حُصّل من الجميع'}
              </span>
              <span style={{ color: TX.dim }}>{T.paidCount > 0 ? `${pInvoices(T.paidCount)} محصّلة` : 'لا شيء محصَّل بعد'}</span>
            </div>
          </section>

          {/* ── التبويبات ── */}
          <Segmented<Tab> label="حالة الفاتورة" value={tab} onChange={setTab} items={[
            { value: 'due', label: <>لم يُحصَّل <span className="vc-num">{openRows.length}</span></> },
            { value: 'paid', label: <>محصَّل <span className="vc-num">{paidRows.length}</span></> },
            { value: 'all', label: <>الكلّ <span className="vc-num">{rows.length}</span></> },
          ]} />

          {/* ── البحث ── */}
          <label className="flex items-center gap-2 rounded-[14px] px-3.5" style={{ height: 48, background: EM.ink2, border: `1px solid ${EM.line2}` }}>
            <Icon name="search" size={18} color={TX.dim} />
            <input type="search" value={q} onChange={e => setQ(e.target.value)}
              aria-label="بحث باسم اللاعب أو رقم المقعد" placeholder="اسم اللاعب أو رقم مقعده"
              className="flex-1 min-w-0 bg-transparent border-none outline-none placeholder:text-[#5A6862]"
              style={{ height: 44, fontSize: 16, color: EM.text }} />
            {q && (
              <button type="button" onClick={() => setQ('')} aria-label="مسح البحث"
                className="vc-press w-11 h-11 flex items-center justify-center rounded-xl shrink-0" style={{ color: TX.dim }}>
                <Icon name="x" size={16} stroke={2.2} />
              </button>
            )}
          </label>

          {/* ── الصفوف ── */}
          <div className="flex flex-col gap-2">
            {visible.map(r => {
              const paid = r.kind === 'paid';
              const stateLabel = paid
                ? `#${r.invoiceNo ?? ''} · ${hhmm(r.paidAt)}`
                : r.invoiceNo != null ? `#${r.invoiceNo} · لم يُحصَّل` : 'لم يُحصَّل';
              const wa = ledger?.waEnabled ? waPill(r, ledger.wa?.[r.playerId]) : null;
              return (
                <div key={r.key} className="vc-enter flex items-center gap-2.5 rounded-[14px]"
                  style={{ padding: '10px 10px 10px 12px', background: EM.card, border: `1px solid ${EM.line}` }}>
                  <button type="button" onClick={() => openSheet(r, false)} aria-label={`تفاصيل فاتورة ${r.playerName}`}
                    className="flex-1 min-w-0 flex items-center gap-2.5 text-right bg-transparent" style={{ minHeight: 48, color: 'inherit' }}>
                    <SeatBadge seat={r.seat} size={38} />
                    <span className="flex-1 min-w-0 block">
                      <span className="block text-[15px] font-extrabold truncate">{r.playerName}</span>
                      <span className="block text-[12.5px] truncate" style={{ color: TX.dim }}>{breakdown(r)}</span>
                      {wa && (
                        <span className="flex items-center gap-1 text-[12px] font-bold truncate" style={{ color: wa.color }}>
                          <Icon name={wa.icon} size={13} stroke={2.2} /><span className="truncate">{wa.text}</span>
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-left block">
                      <span className="vc-num block font-semibold" style={{ fontSize: 17 }}>{f2(r.grandTotal)}</span>
                      {tab !== 'due' && (
                        <span className="block text-[12px] font-bold whitespace-nowrap" style={{ color: paid ? TX.good : TX.amber }}>
                          <span className="vc-num">{stateLabel}</span>
                        </span>
                      )}
                    </span>
                  </button>
                  {canPay && !paid && (
                    <button type="button" onClick={() => openSheet(r, true)} aria-label={`حصّل من ${r.playerName}`}
                      className="vc-press shrink-0 h-11 px-4 rounded-xl text-[14px] font-extrabold"
                      style={{ background: EM.go, color: '#04231A' }}>
                      حصّل
                    </button>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && (
              <div className="text-center py-7 px-3 text-[14px] leading-relaxed" style={{ color: TX.dim }}>
                {needle ? 'لا أحد بهذا الاسم أو المقعد'
                  : rows.length === 0 ? 'لا طلبات ولا لاعبين في هذه الليلة بعد'
                  : tab === 'due' ? 'حُصّل من الجميع في هذه الليلة'
                  : 'لا فواتير محصّلة بعد'}
              </div>
            )}
          </div>
        </>
      ))}

      {/* ══ ورقة الفاتورة ══ */}
      <Sheet open={!!sheetRow} onClose={closeSheet}
        title={sheetRow?.playerName}
        subtitle={sheetSub}
        lead={<SeatBadge seat={sheetRow?.seat ?? detail?.seat ?? null} size={40} />}>
        {sheetRow && (
          <>
            {/* البنود والمجاميع */}
            <div className="mt-3.5 rounded-[14px]" style={{ background: EM.ink2, border: `1px solid ${EM.line}`, padding: '4px 12px' }}>
              {!detail ? (
                <div className="py-2.5"><Skeleton h={36} n={3} /></div>
              ) : (
                <>
                  {detail.lines.map((l, i) => {
                    const opt = l.options.map(o => o.value).join(' · ');
                    const comps = l.components.map(c => {
                      const co = (c.options ?? []).map(o => o.value).join('/');
                      return `${c.name}${co ? ` (${co})` : ''} ×${c.qty * l.quantity}`;
                    }).join(' + ');
                    return (
                      <div key={i} className="flex gap-2 items-baseline text-[14px]" style={{ padding: '9px 0', borderBottom: `1px solid ${EM.line}` }}>
                        <span className="vc-num" style={{ color: TX.dim, minWidth: 22 }}>×{l.quantity}</span>
                        <span className="flex-1 min-w-0">
                          {l.name}
                          {opt && <span className="block text-[12.5px]" style={{ color: EM.opt }}>{opt}</span>}
                          {comps && <span className="block text-[12.5px]" style={{ color: COMP_TX }}>{comps}</span>}
                        </span>
                        <span className="vc-num">{f2(l.lineTotal)}</span>
                      </div>
                    );
                  })}
                  {detail.lines.length === 0 && (
                    <div className="text-[13.5px]" style={{ padding: '10px 0', color: TX.dim, borderBottom: `1px solid ${EM.line}` }}>
                      لم يطلب شيئاً — لعب الليلة
                    </div>
                  )}
                  {sheetTotals.map(t => (
                    <div key={t.label} className="flex items-center gap-2 text-[14px]" style={{ padding: '8px 0' }}>
                      <Swatch color={t.sw} size={8} />
                      <span className="flex-1 min-w-0" style={{ color: TX.sub }}>{t.label}</span>
                      <span className="vc-num">{t.v}</span>
                    </div>
                  ))}
                </>
              )}
              <div className="flex justify-between items-baseline text-[16px] font-extrabold" style={{ padding: '10px 0 8px', borderTop: `1px solid ${EM.line2}` }}>
                <span>الإجماليّ</span>
                <Amount value={f2(shownTotal)} size={22} />
              </div>
            </div>

            {/* التحصيل بخطوتين — داخل الورقة نفسها */}
            {isOpenRow && canPay && (step === 'confirm' ? (
              <div className="vc-enter mt-3.5 rounded-2xl p-3.5" style={{ background: 'rgba(37,192,138,.08)', border: '1px solid rgba(37,192,138,.35)' }}>
                <div className="text-[16px] font-extrabold">
                  استلمتَ <span className="vc-num">{f2(shownTotal)}</span> د.أ من {sheetRow.playerName}؟
                </div>
                <div className="text-[12.5px] mt-1 leading-relaxed" style={{ color: TX.sub }}>
                  يُثبَّت رقم الفاتورة وتُغلق على طلباتها. أيّ طلبٍ بعدها يفتح فاتورةً جديدة.
                  {(detail?.gameFeeApplied ?? sheetRow.gameFee > 0) ? ' ويُسجَّل حجزه مدفوعاً باسمك.' : ''}
                </div>
                <div className="flex gap-2 mt-3">
                  <Btn kind="go" h={52} className="flex-1" style={{ fontSize: 16 }} onClick={pay} disabled={busy}>
                    {busy ? 'يُسجَّل…' : 'نعم، استلمت'}
                  </Btn>
                  <Btn kind="ghost" h={52} style={{ color: TX.sub, fontSize: 15 }} onClick={() => setStep('view')} disabled={busy}>
                    رجوع
                  </Btn>
                </div>
              </div>
            ) : (
              <Btn kind="go" h={54} full className="mt-3.5" style={{ fontSize: 16 }} onClick={() => { setWaiveOpen(false); setStep('confirm'); }} disabled={busy}>
                حصّل <span className="vc-num">{f2(shownTotal)}</span> د.أ
              </Btn>
            ))}
            {isOpenRow && !canPay && (
              <div className="mt-3.5 text-[13px]" style={{ color: TX.dim }}>تسجيل التحصيل يحتاج صلاحيّة «تسجيل الدفع»</div>
            )}

            {!isOpenRow && (
              <div className="mt-3.5 flex items-center gap-2 rounded-[14px] text-[14px] font-bold"
                style={{ padding: '12px 14px', background: 'rgba(37,192,138,.08)', color: TX.good }}>
                <Icon name="check" size={18} stroke={2.4} />
                <span>
                  حُصّلت · فاتورة <span className="vc-num">#{paidNoShown ?? ''}</span>
                  {paidAtShown && <> · <span className="vc-num">{hhmm(paidAtShown)}</span></>}
                  {sheetRow.paidByName && <span style={{ color: TX.dim, fontWeight: 600 }}> · {sheetRow.paidByName}</span>}
                </span>
              </div>
            )}

            {/* الطباعة: إيصال طابعة الكاش أوّلاً (الأكثر استعمالاً)، وملفّ A6 للمشاركة */}
            <div className="flex gap-2 mt-2.5">
              <Btn kind="ghost" h={48} className="flex-1" style={{ fontSize: 14 }} onClick={() => printOne('receipt')} disabled={printing}>
                <Icon name="printer" size={18} /> {printing ? 'يُجهَّز…' : 'إيصال الكاشير'}
              </Btn>
              <Btn kind="ghost" h={48} style={{ fontSize: 14 }} onClick={() => printOne('pdf')} disabled={printing}>
                ملفّ A6
              </Btn>
            </div>
            {/* 🧾 واتساب: حالة آخر إرسال وزرّ الإرسال الآن */}
            {ledger?.waEnabled && (() => {
              const w = waPill(sheetRow, ledger.wa?.[sheetRow.playerId]);
              return (
                <div className="flex items-center gap-2 mt-2">
                  <span className="flex-1 min-w-0 flex items-center gap-1.5 text-[13px] font-bold" style={{ color: w?.color || TX.dim }}>
                    {w ? <><Icon name={w.icon} size={15} stroke={2.2} /><span className="truncate">{w.text}</span></> : 'لم يُرسل له شيء على واتساب بعد'}
                  </span>
                  <Btn kind="ghost" h={44} style={{ fontSize: 13.5 }} disabled={waBusy} onClick={waSend}>
                    {waBusy ? 'يُرسل…' : isOpenRow ? 'أرسل الفاتورة' : 'أرسل الختم'}
                  </Btn>
                </div>
              );
            })()}
            {/* الإسقاط */}
            <div className="flex gap-2 mt-2 empty:hidden">
              {canWaive && !waiveOpen && (
                <Btn kind="ghost" h={48} className="flex-1" style={{ fontSize: 14 }} disabled={busy}
                  onClick={() => { setStep('view'); setWaiveOpen(true); }}>
                  إسقاط الدخوليّة…
                </Btn>
              )}
              {canRestore && (
                <Btn kind="ghost" h={48} className="flex-1" style={{ fontSize: 14 }} disabled={busy} onClick={() => waive(false)}>
                  إعادة احتساب الدخوليّة
                </Btn>
              )}
            </div>

            {canWaive && waiveOpen && (
              <div className="vc-enter mt-2.5 rounded-2xl p-3.5" style={{ background: 'rgba(224,73,43,.08)', border: '1px solid rgba(224,73,43,.35)' }}>
                <label className="block text-[14px] font-extrabold" htmlFor="waive-reason">
                  إسقاط دخوليّة {sheetRow.playerName} — لماذا؟
                </label>
                <input id="waive-reason" value={reason} onChange={e => setReason(e.target.value)} autoFocus maxLength={200}
                  placeholder="مثلاً: ضيف الإدارة، تعويض عن خطأ…"
                  className="w-full mt-2 rounded-xl px-3 outline-none placeholder:text-[#5A6862]"
                  style={{ height: 48, fontSize: 16, background: EM.ink, border: `1px solid ${EM.line2}`, color: EM.text }} />
                <div className="flex gap-2 mt-2.5">
                  <Btn kind="danger" h={48} className="flex-1" disabled={busy || reason.trim().length < 3} onClick={() => waive(true)}>
                    {busy ? 'يُسجَّل…' : 'أسقط الدخوليّة'}
                  </Btn>
                  <Btn kind="ghost" h={48} style={{ color: TX.sub }} disabled={busy} onClick={() => { setWaiveOpen(false); setReason(''); }}>
                    رجوع
                  </Btn>
                </div>
              </div>
            )}
            {canWaive && (
              <div className="text-[12px] mt-2" style={{ color: TX.dim }}>الإسقاط يطلب سبباً، ويُسجَّل باسمك ويظهر للإدارة.</div>
            )}
          </>
        )}
      </Sheet>

      {/* ══ تأكيد طباعة الكلّ ══ */}
      <Sheet open={printAllOpen} onClose={() => !printingAll && setPrintAllOpen(false)} maxWidth={440}
        title={<>طباعة {pInvoices(rows.length)}؟</>}
        subtitle={curNight ? nightLabel(curNight.activityDate) : undefined}>
        <div className="text-[14px] mt-2 leading-relaxed" style={{ color: TX.sub }}>
          تُثبَّت أرقامٌ للفواتير المفتوحة — إعادة الطباعة لاحقاً لا تستهلك أرقاماً جديدة.
        </div>
        <div className="flex gap-2 mt-4">
          <Btn kind="primary" h={52} className="flex-1" onClick={printAll} disabled={printingAll}>
            <Icon name="printer" size={18} /> {printingAll ? 'يُجهَّز الملفّ…' : 'اطبع'}
          </Btn>
          <Btn kind="ghost" h={52} style={{ color: TX.sub }} onClick={() => setPrintAllOpen(false)} disabled={printingAll}>
            رجوع
          </Btn>
        </div>
      </Sheet>

      <Toast toast={toast} onHide={hide} />
    </div>
  );
}
