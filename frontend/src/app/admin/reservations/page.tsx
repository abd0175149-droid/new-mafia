'use client';

// ══════════════════════════════════════════════════════
// 📋 متابعة الحجوزات — مرجعُ التصميم هو الهاتف
//
// الصفحةُ تُستعمل من داخل WebView في تطبيق الموظّفين. وكانت مصمّمةً كجدول
// إدارةٍ مُصغَّر، فقِيست على ٣٩٠×٨٤٤ فظهر:
//   • فائضٌ أفقيٌّ ١٤٠ بكسل — صفُّ رأسٍ بستّة أزرارٍ بلا التفافٍ ولا تمرير،
//     و«＋ حجز سريع» عند `left: −140` أيْ خارج الشاشة تماماً.
//   • «عبدالرزاق الخطيب» يُقصّ إلى «عبدا…» لأنّ خمسَ شاراتٍ لا تنكمش والاسمَ
//     وحده يملك `truncate`.
//   • صفر من ٢٣ زرّاً يبلغ ٤٤ بكسل. أصغرها ٣٠×٣١.
//   • ١٧٥ بكسل للحجز الواحد ⇒ ثماني شاشاتٍ لواحدٍ وثلاثين حجزاً.
//
// فالبنيةُ الآن: رأسٌ ثابتٌ فيه الاسمُ وشريطُ التقدّم والبحثُ والشرائح ·
// صفوفٌ ٧٦ بكسل تُسحب لتعليم الحضور · وأوراقٌ سفليّة لكلّ فعل ·
// وشريطٌ في قوس الإبهام. والأدواتُ الموسميّة في «⋯».
//
// ⚠️ لا قدرةَ حُذفت — كلُّ فعلٍ كان موجوداً له موضعٌ جديد.
// ══════════════════════════════════════════════════════

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { saveFile, isIOS, isStandalone } from '@/lib/saveFile';
import { fillTemplate, ensureHttp, openWhatsApp, type TemplateVar } from '@/lib/whatsapp';
import MessageTemplateEditor from '@/components/MessageTemplateEditor';
import { swalConfirm } from '@/lib/swal';
import {
  RES_COLORS, isPending, normPhoneKey, statusMeta, needsWa,
} from '@/lib/reservation-status';
import { useReservations, getToken, type Reservation } from '@/hooks/useReservations';
import ResRow, { ar } from '@/components/reservations/ResRow';
import PersonSheet from '@/components/reservations/PersonSheet';
import QuickAddSheet from '@/components/reservations/QuickAddSheet';
import WaConfirmBar from '@/components/reservations/WaConfirmBar';
import { Sheet, SheetHead, ActionRow } from '@/components/reservations/Sheet';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// ── قالبُ رسالة التأكيد ──
export interface ResVars {
  name: string; activityName: string; count: number;
  locationName?: string; region?: string; when?: string; mapUrl?: string;
}
// النصُّ الافتراضيّ ومتغيّراتُه — منقولان حرفاً بحرف عن النسخة السابقة.
// 🔴 القالبُ محفوظٌ على جهاز الموظّف لا على الخادم: كلٌّ يصوغ رسالته بلا أن
//    يفرضها على غيره. والمفتاحُ نفسُه، فلا يفقد أحدٌ قالبه بهذا التغيير.
const RES_VARS: TemplateVar<ResVars>[] = [
  { token: '{الاسم}', label: 'الاسم', get: (r) => r.name || '' },
  { token: '{الفعالية}', label: 'الفعاليّة', get: (r) => r.activityName || '' },
  { token: '{العدد}', label: 'عدد الأشخاص',
    get: (r) => (r.count === 1 ? 'شخص واحد' : r.count === 2 ? 'شخصين' : `${r.count} أشخاص`) },
  { token: '{المكان}', label: 'المكان', optional: true,
    get: (r) => [r.locationName, r.region].filter(Boolean).join(' — ') },
  { token: '{الخريطة}', label: 'رابط الخريطة', optional: true, get: (r) => ensureHttp(r.mapUrl) },
  { token: '{الموعد}', label: 'الموعد', optional: true, get: (r) => r.when || '' },
];

const RES_TPL_DEFAULT = [
  'مرحباً {الاسم} 👋',
  'نؤكّد حجزك في «{الفعالية}» لعدد {العدد}.',
  '📍 المكان: {المكان}',
  '🗺️ الموقع على الخريطة: {الخريطة}',
  '🗓️ الموعد: {الموعد}',
  '',
  'يُرجى الردّ على هذه الرسالة لتثبيت الحجز بشكلٍ نهائيّ. بانتظارك! 🎭',
].join(String.fromCharCode(10));

const TPL_KEY = 'reservations_wa_template';

export default function ReservationsPage() {
  const R = useReservations();
  const [sel, setSel] = useState<Reservation | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showTpl, setShowTpl] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number; prev: boolean | null } | null>(null);
  const [waJust, setWaJust] = useState<Reservation | null>(null);

  const [tpl, setTpl] = useState(() => {
    if (typeof window === 'undefined') return RES_TPL_DEFAULT;
    return localStorage.getItem(TPL_KEY) || RES_TPL_DEFAULT;
  });
  const saveTpl = (v: string) => { setTpl(v); try { localStorage.setItem(TPL_KEY, v); } catch { /* لا شيء */ } };

  const single = R.activityId && R.activityId !== 'all';

  // ── نصُّ رسالة الواتساب لصفٍّ بعينه ──
  const waMessage = useCallback((r: Reservation) => {
    const act = R.activities.find(a => a.id === r.activityId);
    const loc = act?.locationId ? R.locations.find(l => l.id === act.locationId) : null;
    const when = act?.date
      ? new Date(act.date).toLocaleString('ar-JO', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
      : '';
    return fillTemplate(tpl, RES_VARS, {
      name: r.contactName, activityName: act?.name || '', count: r.peopleCount || 1,
      locationName: loc?.name, region: loc?.region, when, mapUrl: loc?.mapUrl,
    });
  }, [R.activities, R.locations, tpl]);

  // ══════════════════════════════════════════════════════
  // 💬 إرسالُ رسالةٍ يدويّةٍ وتسجيلُها
  //
  // يفتح واتساب فوراً ثمّ يُعلّم — بهذا الترتيب: فتحُ نافذةٍ بعد `await`
  // يعدّه المتصفّحُ نافذةً منبثقةً لا استجابةً للمسة، فيحجبها.
  // ══════════════════════════════════════════════════════
  const sendWa = useCallback((r: Reservation) => {
    if (!openWhatsApp(r.phone || '', waMessage(r))) {
      alert('رقمٌ غير صالحٍ للواتساب — صحّحه من «تعديل البيانات».');
      return;
    }
    R.markWaSent(r.id, true);
    setToast(null);   // يتشاركان الموضعَ نفسَه أسفلَ الشاشة
    setWaJust(r);
  }, [R, waMessage]);

  /** مَن ينتظر رسالةً في العرض الحاليّ — بترتيب الشاشة نفسِه لئلّا يقفز المؤشّر */
  const waQueue = useMemo(
    () => R.filtered.filter(x => needsWa(x) && x.id !== waJust?.id),
    [R.filtered, waJust],
  );

  // ── كشفُ التكرار — على صفوف الفعاليّة المستهدَفة ──
  const findDuplicate = useCallback((activityId: number, name: string, phone: string, playerId: number | null) => {
    const nm = name.trim().toLowerCase();
    const ph = normPhoneKey(phone);
    return R.reservations.find(r => {
      if (r.deletedAt || r.activityId !== activityId) return false;
      if (playerId && r.playerId === playerId) return true;
      if (ph.length >= 6 && normPhoneKey(r.phone) === ph) return true;
      return !playerId && ph.length < 6 && !!nm && (r.contactName || '').trim().toLowerCase() === nm;
    }) || null;
  }, [R.reservations]);

  // ── تعليمُ الحضور مع «تراجع» بدل نافذة تأكيد ──
  const markAttend = useCallback((id: number, v: boolean | null) => {
    const row = R.reservations.find(x => x.id === id);
    const prev = row?.attended ?? null;
    R.setAttendance(id, v);
    setToast({
      id, prev,
      text: `${row?.contactName ?? ''} — ${v === true ? 'حضر' : v === false ? 'لم يحضر' : 'أُزيل التعليم'}`,
    });
    window.setTimeout(() => setToast(t => (t && t.id === id ? null : t)), 4200);
  }, [R]);

  // ══ كشفُ الحاجزين (PDF / Excel) ══
  async function exportRoster(format: 'pdf' | 'excel') {
    if (!single) return;
    setBusy(format);
    try {
      const res = await fetch(`${API_URL}/api/reports/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ key: 'reservation-roster', format, params: { activityId: Number(R.activityId) } }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({} as any));
        throw new Error(d?.error || 'فشل توليد الكشف');
      }
      const blob = await res.blob();
      const base = `كشف حجوزات - ${R.activityName(Number(R.activityId))}`;
      // 🔴 `<a download>` و`window.open(blob:)` يسقطان في التطبيق المثبَّت على iOS
      //    — لا مديرَ تنزيلاتٍ هناك. saveFile يجرّب ورقةَ المشاركة أوّلاً.
      if (format === 'pdf' && !isIOS() && !isStandalone()) {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const r = await saveFile(blob, `${base}.${format === 'pdf' ? 'pdf' : 'xlsx'}`, { title: base });
        if (r === 'failed') alert('تعذّر حفظ الكشف على هذا الجهاز');
      }
    } catch (err: any) {
      alert('فشل توليد الكشف: ' + (err?.message || ''));
    } finally { setBusy(null); }
  }

  // ══ تحديثُ الحضور من الألعاب ══
  async function markFromGames() {
    const scope = single ? R.activityName(Number(R.activityId)) : 'كلّ الفعاليّات';
    if (!(await swalConfirm(`مراجعة الحجوزات المثبّتة في «${scope}» وتحويل من له لعبة مسجّلة إلى «حاضر»؟`))) return;
    setBusy('games');
    try {
      const r = await (await import('@/hooks/useReservations')).apiFetch(
        '/api/reservations/mark-attendance-from-games',
        { method: 'POST', body: JSON.stringify({ activityId: R.activityId || 'all' }) },
      );
      await R.fetchAll();
      alert(r.marked > 0
        ? `✅ حُوّل ${r.marked} حجزاً إلى «حاضر» بناءً على الألعاب المسجّلة.`
        : 'لا حجوزات جديدة للتحويل — كلّ من له ألعاب مُعلَّم حاضراً بالفعل.');
    } catch (err: any) { alert('فشل التحديث: ' + (err?.message || '')); }
    finally { setBusy(null); }
  }

  // ══ تثبيتُ كلّ المعلَّق — تتابعاً لا توازياً (يحمي ترقيم الحجوزات) ══
  async function confirmAllPending() {
    const rows = R.pendingRows;
    if (!rows.length) return;
    const people = rows.reduce((s, r) => s + (r.peopleCount || 1), 0);
    if (!(await swalConfirm(
      `تثبيت ${rows.length} حجزاً (${people} شخصاً)؟\n\nسيُسجَّل لكلّ حسابٍ مربوطٍ حجزٌ في الفعاليّة يظهر له في التطبيق.`,
    ))) return;
    setBusy('bulk');
    let ok = 0; const failed: string[] = [];
    const { apiFetch } = await import('@/hooks/useReservations');
    for (const r of rows) {
      try {
        await apiFetch(`/api/reservations/${r.id}`, { method: 'PUT', body: JSON.stringify({ status: 'confirmed' }) });
        ok++;
      } catch { failed.push(r.contactName || `#${r.id}`); }
    }
    setBusy(null);
    await R.fetchAll();
    alert(failed.length ? `ثُبّت ${ok} — وتعذّر ${failed.length}: ${failed.slice(0, 5).join('، ')}` : `✅ ثُبّت ${ok} حجزاً`);
  }

  const previewRow = useMemo((): { data: ResVars; labelAr: string } => {
    const r = R.filtered[0];
    if (r) {
      const act = R.activities.find(a => a.id === r.activityId);
      const loc = act?.locationId ? R.locations.find(l => l.id === act.locationId) : null;
      return {
        labelAr: `معاينة على: ${r.contactName}`,
        data: {
          name: r.contactName, activityName: act?.name || '', count: r.peopleCount || 1,
          locationName: loc?.name, region: loc?.region, mapUrl: loc?.mapUrl,
          when: act?.date ? new Date(act.date).toLocaleString('ar-JO', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '',
        },
      };
    }
    return {
      labelAr: 'معاينة على مثال',
      data: { name: 'محمد', activityName: 'ليلة الخميس', count: 2, locationName: 'مقهى النخبة', region: 'وسط البلد', when: 'الخميس ٨:٠٠ م', mapUrl: 'https://maps.app.goo.gl/xxx' },
    };
  }, [R.filtered, R.activities, R.locations]);

  if (R.loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const c = R.counts;
  const chips: { k: typeof R.status | 'unmarked' | 'attended' | 'noShow' | 'needsWa'; label: string; n: number; kind: 'status' | 'attend' | 'wa' }[] = [
    { k: 'all', label: 'الكلّ', n: c.total, kind: 'status' },
    { k: 'pending', label: 'غير مثبّت', n: c.pending, kind: 'status' },
    { k: 'waitlist', label: 'انتظار', n: c.waitlist, kind: 'status' },
    { k: 'needsWa', label: 'لم تُرسل', n: c.needsWa, kind: 'wa' },
    { k: 'unmarked', label: 'لم يُعلَّم', n: c.unmarked, kind: 'attend' },
    { k: 'attended', label: 'حضر', n: c.attended, kind: 'attend' },
    { k: 'noShow', label: 'لم يحضر', n: c.noShow, kind: 'attend' },
  ];

  return (
    <div dir="rtl" className="max-w-2xl mx-auto -mx-3 sm:mx-auto">
      {/* ══ الرأسُ الثابت ══ */}
      <div className="sticky top-0 z-30 px-3 pt-2 pb-2 space-y-2"
        style={{ background: 'rgba(10,10,12,.96)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        <div className="flex items-center gap-2">
          <select
            value={R.activityId}
            onChange={e => R.setActivityId(e.target.value)}
            className="flex-1 min-w-0 h-11 px-2 rounded-xl text-[14px] font-bold text-white outline-none"
            style={{ background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.09)' }}
          >
            <option value="">— اختر الفعاليّة —</option>
            <option value="all">كلّ الفعاليّات</option>
            {R.activityOptions.map(a => (
              <option key={a.id} value={a.id}>{a.name}{a.status === 'completed' ? ' (منتهي)' : ''}</option>
            ))}
          </select>
          {single && (
            <Link href="/admin/reservations/door"
              title="وضع الباب — تعليمُ الحضور سريعاً"
              className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-[18px]"
              style={{ background: RES_COLORS.attended + '1a', border: `1px solid ${RES_COLORS.attended}55`, color: RES_COLORS.attended }}>
              🚪
            </Link>
          )}
        </div>

        {R.activityId && (
          <>
            {/* شريطُ التقدّم — رقمٌ واحدٌ يُقرأ بلمحة بدل بطاقتين تأكلان ثلث الشاشة */}
            <div className="flex items-center gap-2.5">
              <div className="flex-1 h-2 rounded-full overflow-hidden flex gap-0.5" style={{ background: 'rgba(255,255,255,.06)' }}>
                {c.attended > 0 && <div style={{ flex: c.attended, background: RES_COLORS.attended, borderRadius: 99 }} />}
                {c.noShow > 0 && <div style={{ flex: c.noShow, background: RES_COLORS.noShow, borderRadius: 99 }} />}
                {c.unmarked > 0 && <div style={{ flex: c.unmarked, background: 'rgba(255,255,255,.10)', borderRadius: 99 }} />}
              </div>
              <span className="text-[12.5px] text-gray-400 whitespace-nowrap">
                <b className="text-white tabular-nums">{ar(c.attended)}</b> من {ar(c.total)} حضروا
                <span className="text-gray-600"> · {ar(c.people)} شخصاً</span>
              </span>
            </div>

            <div className="flex items-center gap-2 h-11 px-3 rounded-xl"
              style={{ background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.09)' }}>
              <span className="text-[15px]">🔍</span>
              <input
                value={R.search}
                onChange={e => R.setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو الرقم…"
                className="flex-1 min-w-0 h-full bg-transparent border-0 outline-none text-white text-[15px] placeholder-gray-600"
              />
              {R.search && (
                <button onClick={() => R.setSearch('')} className="text-gray-500 text-[15px] px-1">✕</button>
              )}
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
              {chips.map(ch => {
                const on = ch.kind === 'status' ? R.status === ch.k
                  : ch.kind === 'wa' ? R.wa === 'needs' : R.attend === ch.k;
                return (
                  <button
                    key={ch.k}
                    onClick={() => {
                      if (ch.kind === 'status') { R.setStatus(on ? 'all' : ch.k as any); R.setAttend('all'); R.setWa('all'); }
                      else if (ch.kind === 'wa') { R.setWa(on ? 'all' : 'needs'); R.setStatus('all'); R.setAttend('all'); }
                      else { R.setAttend(on ? 'all' : ch.k as any); R.setStatus('all'); R.setWa('all'); }
                    }}
                    className="shrink-0 h-11 px-3 rounded-full text-[13px] font-bold flex items-center gap-1.5 whitespace-nowrap"
                    style={on
                      ? { background: RES_COLORS.pending + '28', border: `1px solid ${RES_COLORS.pending}80`, color: RES_COLORS.pending }
                      : { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: '#9ca3af' }}
                  >
                    {ch.label}
                    <span className="text-[11.5px] opacity-70 tabular-nums">{ar(ch.n)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ══ القائمة ══ */}
      {!R.activityId ? (
        <div className="text-center py-24 px-6">
          <span className="text-5xl block mb-4 opacity-20">🎯</span>
          <p className="text-gray-500 text-sm">اختر فعاليّةً من الأعلى لعرض حجوزاتها</p>
        </div>
      ) : (
        <div className="px-3 pt-2 pb-28 space-y-1.5">
          {R.pendingRows.length > 0 && R.status === 'all' && (
            <button
              onClick={() => R.setStatus('pending')}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-right"
              style={{ background: RES_COLORS.pending + '12', border: `1px solid ${RES_COLORS.pending}44` }}
            >
              <span className="text-[15px]">⚠️</span>
              <span className="flex-1 text-[12.5px] leading-relaxed" style={{ color: RES_COLORS.pending }}>
                <b>{ar(R.pendingRows.length)} حجزاً غير مثبَّت</b> — لا يظهر للّاعب ولا في الفعاليّة
              </span>
              <span className="text-[12px] text-gray-500">←</span>
            </button>
          )}

          <AnimatePresence initial={false}>
            {R.filtered.map(r => (
              <ResRow key={r.id} r={r} onOpen={setSel} onAttend={markAttend} />
            ))}
          </AnimatePresence>

          {!R.filtered.length && (
            <p className="text-center text-gray-600 text-sm py-16">
              {R.search ? 'لا نتائج لهذا البحث' : 'لا حجوزات في هذا التصنيف'}
            </p>
          )}
        </div>
      )}

      {/* ══ «تراجع» بدل نافذة تأكيد ══ */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed left-3 right-3 z-40 flex items-center gap-2.5 px-4 py-3 rounded-2xl max-w-lg mx-auto"
            style={{ bottom: 84, background: '#12211d', border: `1px solid ${RES_COLORS.attended}66` }}
          >
            <span style={{ color: RES_COLORS.attended }}>✓</span>
            <span className="flex-1 text-[13.5px] text-gray-200 truncate">{toast.text}</span>
            <button
              onClick={() => { R.setAttendance(toast.id, toast.prev); setToast(null); }}
              className="text-[13.5px] font-extrabold px-2" style={{ color: RES_COLORS.pending }}
            >
              تراجع
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ الشريطُ السفليّ — قوسُ الإبهام ══ */}
      {R.activityId && (
        <div className="fixed left-0 right-0 bottom-0 z-30 px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]"
          style={{ background: 'linear-gradient(to top,#0a0a0c 62%,rgba(10,10,12,0))' }}>
          <div className="max-w-lg mx-auto flex gap-2">
            <button
              onClick={() => setShowAdd(true)}
              className="flex-1 h-[50px] rounded-2xl text-[16px] font-extrabold"
              style={{ background: 'linear-gradient(135deg,#E8B84B,#DCA83C)', color: '#1a1408' }}
            >
              ＋ حجز سريع
            </button>
            <button
              onClick={() => setShowMore(true)}
              className="w-[50px] h-[50px] shrink-0 rounded-2xl text-[20px] text-gray-300"
              style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}
            >
              ⋯
            </button>
          </div>
        </div>
      )}

      {/* ══ الأوراق ══ */}
      <PersonSheet
        row={sel} open={!!sel} onClose={() => setSel(null)}
        onAttend={markAttend} onConfirm={R.setConfirmed}
        onUpdate={R.updateRow} onDelete={R.removeRow}
        waMessage={waMessage}
        onWaSend={sendWa}
        onWaClear={(r) => { R.markWaSent(r.id, false); if (waJust?.id === r.id) setWaJust(null); }}
      />

      {/* ══ تأكيدُ الإرسال — يظهر عند العودة من واتساب ══ */}
      <WaConfirmBar
        row={waJust}
        remaining={waQueue.length}
        onUndo={() => { if (waJust) R.markWaSent(waJust.id, false); setWaJust(null); }}
        onNext={() => { const n = waQueue[0]; if (n) sendWa(n); else setWaJust(null); }}
        onClose={() => setWaJust(null)}
      />

      <QuickAddSheet
        open={showAdd} onClose={() => setShowAdd(false)}
        activityId={R.activityId} activities={R.activityOptions}
        onCreate={R.createRow} findDuplicate={findDuplicate}
      />

      <Sheet open={showMore} onClose={() => setShowMore(false)}>
        <SheetHead title="المزيد" sub={single ? R.activityName(Number(R.activityId)) : 'كلّ الفعاليّات'} />
        {R.pendingRows.length > 0 && (
          <button
            onClick={() => { setShowMore(false); confirmAllPending(); }}
            disabled={busy === 'bulk'}
            className="w-full flex items-center gap-3 p-3 rounded-2xl mb-2.5 text-right disabled:opacity-50"
            style={{ background: RES_COLORS.pending + '14', border: `1px solid ${RES_COLORS.pending}55` }}
          >
            <span className="text-[17px]">✅</span>
            <span className="flex-1">
              <b className="block text-[14.5px] font-bold" style={{ color: RES_COLORS.pending }}>
                ثبّت المعلَّق ({ar(R.pendingRows.length)})
              </b>
              <span className="block text-[11.5px] text-gray-500">غيرُ المثبَّت لا يظهر للّاعب ولا في الفعاليّة</span>
            </span>
          </button>
        )}
        {single && (
          <>
            <ActionRow icon="🖨️" title="كشف الحاجزين" sub={busy === 'pdf' ? 'يُجهَّز…' : 'PDF للطباعة'}
              onClick={() => exportRoster('pdf')} disabled={!!busy} />
            <ActionRow icon="🖼️" title="الكشف المصوّر" sub="بطاقاتٌ بالصور والرتب"
              onClick={() => window.open(`/print/attendance/${R.activityId}`, '_blank')} />
            <ActionRow icon="📊" title="تنزيل Excel" sub={busy === 'excel' ? 'يُجهَّز…' : 'جدولٌ كامل'}
              onClick={() => exportRoster('excel')} disabled={!!busy} />
          </>
        )}
        <ActionRow icon="✅" title="تحديث الحضور من الألعاب" sub="مَن لعب فعلاً يصير «حاضراً»"
          onClick={() => { setShowMore(false); markFromGames(); }} disabled={!!busy} />
        <ActionRow icon="💬" title="قالب رسالة التأكيد" sub="النصّ الذي يرسله زرّ الواتساب"
          onClick={() => { setShowMore(false); setShowTpl(true); }} />
      </Sheet>

      <Sheet open={showTpl} onClose={() => setShowTpl(false)}>
        <SheetHead title="قالب رسالة التأكيد" />
        <MessageTemplateEditor<ResVars>
          titleAr="💬 النصّ الذي يرسله زرّ الواتساب"
          value={tpl} onChange={saveTpl} onReset={() => saveTpl(RES_TPL_DEFAULT)}
          vars={RES_VARS}
          preview={fillTemplate(tpl, RES_VARS, previewRow.data)}
          previewOfAr={previewRow.labelAr}
        />
      </Sheet>
    </div>
  );
}
