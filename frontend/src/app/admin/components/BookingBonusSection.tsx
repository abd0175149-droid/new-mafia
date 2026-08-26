'use client';

// ══════════════════════════════════════════════════════
// 🎁 مكافأة الحجز المبكر — قسمٌ في صفحة تفاصيل الفعاليّة
// ══════════════════════════════════════════════════════
// المعاينة **مرآةٌ لقائمة الحجوزات** التي فوقها في الصفحة: تعرض كلّ صفّ حجزٍ لا
// المؤهّلين وحدهم، ومعه سببُ استبعاده إن استُبعد. بدون ذلك يصير الفارق بين
// «١٤ مؤهّلاً» و«٢٣ حجزاً» لغزاً يُخمَّن — والتخمين في منح النقاط مكلف.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { swalConfirm, swalAlert } from '@/lib/swal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('token') : null;
}

/** fetch يُظهر رسالة الخادم وكوده — apiFetch العامّ يبتلعهما ويرمي «API error 409» */
async function bonusFetch(path: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...opts?.headers },
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* ردٌّ بلا جسم */ }
  if (!res.ok) {
    const err: any = new Error(body?.error || `خطأ ${res.status}`);
    err.code = body?.code;
    err.body = body;
    throw err;
  }
  return body;
}

// ── تنسيق التاريخ بتوقيت الأردن (نفس نمط EditActivityForm) ──
// لا نعتمد على منطقة المتصفّح: الخادم يقرأ `datetime-local` كتوقيت عمّان،
// فلو أدخله موظّفٌ من منطقةٍ أخرى انزاح موعد القطع بلا أن يلاحظ أحد.
function ammanParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Amman',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '00';
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute') };
}

function toLocalInput(d: Date): string {
  const p = ammanParts(d);
  return `${p.y}-${p.mo}-${p.d}T${p.h}:${p.mi}`;
}

/** يعرض قيمة حقل datetime-local كما هي - الخادم يقرؤها توقيتَ عمّان،
 *  فتمريرها عبر `new Date()` يفسّرها بمنطقة المتصفّح ويُظهر للموظّف موعداً
 *  غير الذي سيُطبَّق فعلاً إن كان خارج الأردن. */
function fmtInput(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || '');
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : (v || '-');
}

function fmtShort(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const p = ammanParts(d);
  return `${p.d}/${p.mo} ${p.h}:${p.mi}`;
}

const SOURCE_LABEL: Record<string, string> = {
  app: '📱 تطبيق',
  whatsapp: '💬 واتساب',
  'reservation-confirm': '✅ تثبيت',
  manual: '✍️ يدوي',
};

const CODE_BADGE: Record<string, { label: string; cls: string }> = {
  ok: { label: '✅ مؤهّل', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  'no-account': { label: '👤 بلا حساب', cls: 'bg-gray-500/15 text-gray-400 border-gray-600/25' },
  'after-cutoff': { label: '⛔ بعد الموعد', cls: 'bg-rose-500/15 text-rose-400 border-rose-500/25' },
  'already-granted': { label: '♻️ نال سابقاً', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  'duplicate-row': { label: '🔁 صفّ مكرّر', cls: 'bg-gray-500/15 text-gray-500 border-gray-600/25' },
};

interface Props {
  activityId: number;
  activityName: string;
  activityDate?: string | null;
  /** دور الموظّف — التراجع لـadmin وحده، فنُخفي زرّاً سيُرفض على الخادم */
  role?: string;
}

export default function BookingBonusSection({ activityId, activityName, activityDate, role }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'RR' | 'XP'>('RR');
  const [amount, setAmount] = useState(20);
  const [cutoff, setCutoff] = useState('');
  const [basis, setBasis] = useState<'earliest' | 'booking' | 'reservation'>('earliest');

  const [preview, setPreview] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [granting, setGranting] = useState(false);
  const [showExcluded, setShowExcluded] = useState(true);
  const [history, setHistory] = useState<any[]>([]);

  // الافتراضيّ: ٢٤ ساعة قبل الفعاليّة — أشيع نافذة «حجز مبكر»
  useEffect(() => {
    if (cutoff) return;
    const base = activityDate ? new Date(activityDate) : new Date();
    if (isNaN(base.getTime())) return;
    setCutoff(toLocalInput(new Date(base.getTime() - 24 * 3600 * 1000)));
  }, [activityDate, cutoff]);

  const loadHistory = useCallback(async () => {
    try {
      const r = await bonusFetch(`/api/activities/${activityId}/booking-bonus/history`);
      setHistory(r.batches || []);
    } catch { /* السجلّ ميزةٌ مساعدة — لا يُعطّل القسم */ }
  }, [activityId]);

  useEffect(() => { if (open) void loadHistory(); }, [open, loadHistory]);

  const setPresetBefore = (hours: number) => {
    const base = activityDate ? new Date(activityDate) : new Date();
    if (isNaN(base.getTime())) return;
    setCutoff(toLocalInput(new Date(base.getTime() - hours * 3600 * 1000)));
    setPreview(null);
  };

  const qs = useMemo(() => new URLSearchParams({
    kind, amount: String(amount), cutoffAt: cutoff, basis,
  }).toString(), [kind, amount, cutoff, basis]);

  async function doPreview() {
    if (!cutoff) return swalAlert('حدّد موعد القطع أولاً');
    setLoadingPreview(true);
    try {
      setPreview(await bonusFetch(`/api/activities/${activityId}/booking-bonus/preview?${qs}`));
    } catch (e: any) {
      swalAlert(`❌ فشل جلب المعاينة: ${e.message}`);
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function doGrant(allowRepeat = false) {
    if (!preview) return;
    const n = preview.counts.eligible;
    if (!allowRepeat && n === 0) return swalAlert('لا يوجد حاجزٌ مؤهّل بهذه الشروط');

    const unit = kind === 'RR' ? 'نقطة رانك' : 'نقطة خبرة';
    if (!allowRepeat) {
      const ok = await swalConfirm(
        `سيُمنح ${n} لاعباً ${amount} ${unit} — بمجموع ${n * amount}.\n` +
        `الموعد: ${fmtInput(cutoff)} · الموسم: ${preview.seasonName || '—'}\n\n` +
        `ويصل كلَّ واحدٍ منهم إشعارٌ فوريّ.`,
        { title: '🎁 تأكيد المنح', confirmText: `نعم، امنح ${n}`, icon: 'question' },
      );
      if (!ok) return;
    }

    setGranting(true);
    try {
      const r = await bonusFetch(`/api/activities/${activityId}/booking-bonus/grant`, {
        method: 'POST',
        body: JSON.stringify({ kind, amount, cutoffAt: cutoff, basis, allowRepeat }),
      });
      const promoted = (r.results || []).filter((x: any) => x.promoted || x.leveledUp).length;
      swalAlert(
        `✅ مُنح ${r.granted} لاعباً ${amount} ${unit}\n` +
        `🔔 وصلت الإشعارات: ${r.notified}/${r.granted}` +
        (promoted ? `\n🏆 ${promoted} منهم ${kind === 'RR' ? 'تُرقّي' : 'رفع مستواه'}` : ''),
        'success',
      );
      setPreview(null);
      await loadHistory();
    } catch (e: any) {
      // 409 = الحارس الحتميّ. المنح مرّة أخرى قرارٌ متعمَّد لا خطأٌ يُعاد تلقائياً.
      if (e.code === 'ALREADY_GRANTED') {
        const again = await swalConfirm(
          `${e.message}\n\nهل تريد منحاً ثانياً متعمَّداً؟ سيُسجَّل كدفعةٍ مستقلّة، ` +
          `ومن نال الأولى سينال الثانية أيضاً.`,
          { title: '♻️ مُنحت سابقاً', confirmText: 'نعم، امنح دفعةً ثانية', danger: true },
        );
        if (again) await doGrant(true);
      } else {
        swalAlert(`❌ فشل المنح: ${e.message}`);
      }
    } finally {
      setGranting(false);
    }
  }

  async function doRevoke(batch: any) {
    const unit = batch.totalXP > 0 ? 'خبرة' : 'رانك';
    const ok = await swalConfirm(
      `سيُسحب ${unit} من ${batch.players} لاعباً، وتُحذف إشعاراتهم بها.\n` +
      `تعود أرصدتهم إلى ما كانت عليه قبل المنح بالضبط.`,
      { title: '↩️ تراجع عن الدفعة', confirmText: 'نعم، تراجع', danger: true },
    );
    if (!ok) return;
    try {
      const r = await bonusFetch(`/api/activities/${activityId}/booking-bonus`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: batch.reason }),
      });
      swalAlert(`✅ تمّ التراجع — ${r.players} لاعباً، وحُذف ${r.notifRemoved} إشعاراً`, 'success');
      setPreview(null);
      await loadHistory();
    } catch (e: any) {
      swalAlert(`❌ فشل التراجع: ${e.message}`);
    }
  }

  const rows: any[] = preview?.rows || [];
  const visibleRows = showExcluded ? rows : rows.filter((r: any) => r.eligible);
  const unitShort = kind === 'RR' ? 'RR' : 'XP';

  return (
    <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl overflow-hidden" dir="rtl">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-700/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🎁</span>
          <span className="font-bold text-white">مكافأة الحجز المبكر</span>
          {history.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
              {history.length} دفعة
            </span>
          )}
        </div>
        <span className="text-gray-500">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          {/* ── الشروط ── */}
          <div className="bg-gray-900/50 border border-gray-700/40 rounded-xl p-4 space-y-4">
            {/* النوع */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-gray-400 w-20">النوع:</span>
              {(['RR', 'XP'] as const).map(k => (
                <button
                  key={k}
                  onClick={() => { setKind(k); setPreview(null); }}
                  className={`text-xs px-4 py-2 rounded-lg border transition font-bold ${
                    kind === k
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                      : 'border-gray-600/40 text-gray-400 hover:text-white'
                  }`}
                >
                  {k === 'RR' ? '🏆 نقاط رانك' : '⚡ نقاط خبرة'}
                </button>
              ))}
              <span className="text-[10px] text-gray-600">
                {kind === 'RR' ? 'تؤثّر على الرتبة والترقية' : 'تؤثّر على المستوى فقط'}
              </span>
            </div>

            {/* القيمة */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-20">القيمة:</span>
              <input
                type="number" min={1} max={500} value={amount}
                onChange={e => { setAmount(Math.max(1, Math.min(500, Number(e.target.value) || 1))); setPreview(null); }}
                className="w-28 px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              />
              <span className="text-xs text-gray-500">{unitShort} لكل لاعب</span>
            </div>

            {/* الموعد */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-gray-400 w-20">الموعد:</span>
              <input
                type="datetime-local" value={cutoff}
                onChange={e => { setCutoff(e.target.value); setPreview(null); }}
                className="px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              />
              {activityDate && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-600">قبل الفعاليّة بـ</span>
                  {[[24, '24س'], [48, '48س'], [72, '3أيام'], [168, 'أسبوع']].map(([h, l]) => (
                    <button
                      key={h as number} onClick={() => setPresetBefore(h as number)}
                      className="text-[10px] px-2 py-1 rounded-md border border-gray-600/40 text-gray-400 hover:text-amber-400 hover:border-amber-500/30 transition"
                    >
                      {l as string}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* الأساس */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-gray-400 w-20">أساس الوقت:</span>
              <select
                value={basis}
                onChange={e => { setBasis(e.target.value as any); setPreview(null); }}
                className="px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              >
                <option value="earliest">أقدم حجز (موصى به)</option>
                <option value="booking">صفّ الحجز فقط</option>
                <option value="reservation">متابعة الحجوزات فقط</option>
              </select>
              <span className="text-[10px] text-gray-600 max-w-md">
                «أقدم حجز» يُنصف من حجز عبر الواتساب مبكّراً ولم يثبّته الموظّف إلّا لاحقاً
              </span>
            </div>

            <button
              onClick={doPreview} disabled={loadingPreview || !cutoff}
              className="w-full py-2.5 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition font-bold text-sm disabled:opacity-40"
            >
              {loadingPreview ? '⏳ جارٍ الفحص...' : '🔍 معاينة المؤهّلين'}
            </button>
          </div>

          {/* ── نتيجة المعاينة ── */}
          {preview && (
            <div className="space-y-3">
              {/* التحذيرات */}
              {preview.warnings?.length > 0 && (
                <div className="space-y-1.5">
                  {preview.warnings.map((w: string, i: number) => (
                    <p key={i} className="text-[11px] text-amber-400/90 bg-amber-500/[0.07] border border-amber-500/20 rounded-lg px-3 py-2">
                      {w}
                    </p>
                  ))}
                </div>
              )}

              {/* الشرائح */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-bold">
                  ✅ مؤهّل {preview.counts.eligible}
                </span>
                {preview.counts.afterCutoff > 0 && (
                  <span className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    ⛔ بعد الموعد {preview.counts.afterCutoff}
                  </span>
                )}
                {preview.counts.noAccount > 0 && (
                  <span className="px-3 py-1.5 rounded-lg bg-gray-500/10 text-gray-400 border border-gray-600/20">
                    👤 بلا حساب {preview.counts.noAccount}
                  </span>
                )}
                {preview.counts.alreadyGranted > 0 && (
                  <span className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    ♻️ نال سابقاً {preview.counts.alreadyGranted}
                  </span>
                )}
                {preview.counts.duplicateRow > 0 && (
                  <span className="px-3 py-1.5 rounded-lg bg-gray-500/10 text-gray-500 border border-gray-600/20">
                    🔁 صفّ مكرّر {preview.counts.duplicateRow}
                  </span>
                )}
                <label className="mr-auto flex items-center gap-1.5 text-gray-500 cursor-pointer">
                  <input
                    type="checkbox" checked={showExcluded}
                    onChange={e => setShowExcluded(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-700/50 text-amber-500 w-3.5 h-3.5"
                  />
                  إظهار المستبعدين
                </label>
              </div>

              {/* الجدول */}
              <div className="overflow-x-auto border border-gray-700/30 rounded-xl max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-900 text-gray-500 text-xs">
                      <th className="text-right px-3 py-2.5 font-medium">الاسم</th>
                      <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">وقت الحجز</th>
                      <th className="text-center px-3 py-2.5 font-medium">المصدر</th>
                      <th className="text-center px-3 py-2.5 font-medium whitespace-nowrap">
                        {kind === 'RR' ? 'الرتبة الآن' : 'المستوى الآن'}
                      </th>
                      <th className="text-center px-3 py-2.5 font-medium">الحكم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r: any) => {
                      const badge = CODE_BADGE[r.code] || CODE_BADGE.ok;
                      // الصفّ وُلد بعد زمن الحجز المعتمَد ⇒ حجزٌ سابقٌ ثُبِّت لاحقاً.
                      // إظهاره يمنع سؤال «لماذا هذا مؤهّل وجدول الحجوزات يعرض له تاريخاً متأخّراً؟»
                      const lateRow = r.bookedAt && r.bookingCreatedAt
                        && new Date(r.bookingCreatedAt).getTime() - new Date(r.bookedAt).getTime() > 60_000;
                      return (
                        <tr key={r.bookingId} className={`border-t border-gray-700/20 ${r.eligible ? 'hover:bg-emerald-500/[0.04]' : 'opacity-60 hover:bg-gray-700/10'}`}>
                          <td className="px-3 py-2.5 text-white">
                            {r.name}
                            {r.linkedBy === 'phone' && (
                              <span className="text-[10px] text-blue-400 mr-1.5" title="رُبط بالحساب عبر مطابقة الهاتف">🔗</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-gray-300 font-mono text-xs whitespace-nowrap">
                            {fmtShort(r.bookedAt)}
                            {lateRow && (
                              <span className="block text-[10px] text-gray-600" title="صفّ الحجز أُنشئ عند التثبيت، والطابع المعتمَد أقدم منه">
                                الصفّ: {fmtShort(r.bookingCreatedAt)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center text-[11px] text-gray-400 whitespace-nowrap">
                            {SOURCE_LABEL[r.sourceKind] || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-center text-[11px] text-gray-400 whitespace-nowrap">
                            {r.current
                              ? (kind === 'RR'
                                ? `${r.current.rankTier} · ${r.current.rankRR}RR`
                                : `L${r.current.level} · ${r.current.xp}XP`)
                              : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {visibleRows.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-6 text-gray-600 text-xs">لا صفوف لعرضها</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <button
                onClick={() => doGrant(false)}
                disabled={granting || preview.counts.eligible === 0 || !preview.seasonId}
                className="w-full py-3 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 transition font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {granting
                  ? '⏳ جارٍ المنح...'
                  : `🎁 منح ${preview.counts.eligible} لاعب × ${amount} ${unitShort}`}
              </button>
            </div>
          )}

          {/* ── السجلّ ── */}
          {history.length > 0 && (
            <div className="border-t border-gray-700/30 pt-4 space-y-2">
              <p className="text-xs text-gray-500 font-bold">📜 سجلّ المنح</p>
              {history.map((b: any) => (
                <div key={b.reason} className="flex items-center justify-between gap-3 bg-gray-900/40 border border-gray-700/30 rounded-lg px-3 py-2.5 flex-wrap">
                  <div className="text-xs">
                    <span className="text-amber-400 font-bold">
                      {b.totalXP > 0
                        ? `${b.meta?.amount ?? Math.round(b.totalXP / Math.max(1, b.players))} XP`
                        : `${b.meta?.amount ?? Math.round(b.totalRR / Math.max(1, b.players))} RR`}
                    </span>
                    <span className="text-gray-400"> · {b.players} لاعب</span>
                    <span className="text-gray-600"> · {fmtShort(b.grantedAt)}</span>
                    {b.grantedByName && <span className="text-gray-600"> · {b.grantedByName}</span>}
                    {b.meta?.cutoffAt && (
                      <span className="block text-[10px] text-gray-600 mt-0.5">
                        الموعد: {fmtShort(b.meta.cutoffAt)}
                      </span>
                    )}
                  </div>
                  {role === 'admin' && (
                    <button
                      onClick={() => doRevoke(b)}
                      className="text-[11px] px-2.5 py-1 rounded-md border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition"
                    >
                      ↩️ تراجع
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
