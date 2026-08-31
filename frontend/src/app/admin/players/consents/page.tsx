'use client';

// ══════════════════════════════════════════════════════
// ⚖️ سجلّ الموافقات — قانون حماية البيانات الأردنيّ ٢٤ لسنة ٢٠٢٣
//
// 🔴 عرضٌ فقط (قرار المالك): لا زرّ يغيّر حالة موافقة. الموافقةُ فعلُ اللاعب،
//    وتغييرُها من لوحة الإدارة يُفسد قيمةَ السجلّ كدليل.
// 🔴 القاصرون: وسمٌ وتنبيه فقط — لا حجب ولا إلزام من هنا.
// 🔴 الصفحةُ تبدأ بالانكشاف لا بالجدول: من يفتحها يريد أن يعرف أين نقف قبل
//    أن يبحث عن لاعبٍ بعينه.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react';
import { exportReport } from '@/app/admin/reports/lib/reportsApi';

const API = process.env.NEXT_PUBLIC_API_URL || '';
const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null);

type StatusKey = 'complete' | 'partial' | 'withdrawn' | 'played_no_consent' | 'never_asked';

interface Trail {
  at: string; kind: string; version: string; action: string; platform: string | null;
  guardianName: string | null; guardianPhone: string | null; guardianRelation: string | null;
}
interface P {
  id: number; name: string; phone: string;
  dob: string | null; age: number | null; ageKnown: boolean; isMinor: boolean;
  createdAt: string; lastActiveAt: string | null;
  privacyVersion: string | null; privacyAt: string | null; privacyPlatform: string | null;
  termsVersion: string | null; termsAt: string | null; termsPlatform: string | null;
  guardianName: string | null; guardianPhone: string | null; guardianRelation: string | null;
  guardianMissing: boolean; matches: number; activities: number; status: StatusKey;
  deletionStatus: string | null; deletionDueAt: string | null; trail: Trail[];
}
interface Doc { kind: string; version: string; title: string; publishedAt: string | null; requiresReconsent: boolean; grantedCount: number }
interface Totals {
  players: number; complete: number; partial: number; withdrawn: number;
  playedNoConsent: number; neverAsked: number; minors: number; minorsConsented: number;
  guardianMissing: number; ageUnknown: number; trailRows: number; withDeletionRequest: number;
  completeRate: number;
}

const STATUS: Record<StatusKey, { label: string; cls: string }> = {
  complete:          { label: 'مكتملة',          cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  partial:           { label: 'ناقصة',           cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  withdrawn:         { label: 'مسحوبة',          cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  played_no_consent: { label: 'لعب بلا موافقة',  cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  never_asked:       { label: 'لم يُسأل بعد',    cls: 'bg-gray-600/20 text-gray-400 border-gray-600/30' },
};
const KIND_AR: Record<string, string> = { privacy: 'سياسة الخصوصيّة', terms: 'شروط الاستخدام' };
const ACTION_AR: Record<string, string> = { granted: 'موافقة', withdrawn: 'سحب' };

const inputCls = 'bg-gray-800/60 border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-[12.5px] text-white outline-none focus:border-rose-500/60';
const btnCls = 'text-[12px] px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/50 text-gray-200 hover:border-rose-500/60 hover:text-rose-300 transition disabled:opacity-50';

export default function ConsentsPage() {
  const [players, setPlayers] = useState<P[]>([]);
  const [published, setPublished] = useState<Doc[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tookMs, setTookMs] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [flag, setFlag] = useState('all');
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState<'' | 'pdf' | 'excel'>('');
  const [toast, setToast] = useState('');

  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); }, []);

  // الفلترةُ على الخادم كي يتطابق المعروضُ مع المُصدَّر حرفاً بحرف
  useEffect(() => {
    const id = setTimeout(() => {
      setLoading(true); setError('');
      const p = new URLSearchParams();
      if (status !== 'all') p.set('status', status);
      if (flag !== 'all') p.set('flag', flag);
      fetch(`${API}/api/admin/consents?${p}`, { headers: { Authorization: `Bearer ${tok()}` } })
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok || d.success === false) throw new Error(d.error || `خطأ ${r.status}`);
          setPlayers(d.players || []); setPublished(d.published || []);
          setTotals(d.totals || null); setTookMs(d.tookMs || 0);
        })
        .catch((e) => setError(e.message || 'تعذّر الجلب'))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(id);
  }, [status, flag]);

  // البحثُ محلّيّ — أداةُ عثورٍ لا تحليل، فلا يغيّر ما يُصدَّر
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return players;
    return players.filter((p) => p.name.toLowerCase().includes(s) || String(p.phone).includes(s));
  }, [players, q]);

  const chip = (key: string, val: string, label: string, n: number, tone = 'gray') => {
    const on = (key === 'status' ? status : flag) === val;
    const tones: Record<string, string> = {
      gray: 'border-gray-700/50 text-gray-300', rose: 'border-rose-500/40 text-rose-300',
      amber: 'border-amber-500/40 text-amber-300', emerald: 'border-emerald-500/40 text-emerald-300',
    };
    return (
      <button key={key + val} type="button" aria-pressed={on}
        onClick={() => { if (key === 'status') { setStatus(on ? 'all' : val); setFlag('all'); } else { setFlag(on ? 'all' : val); setStatus('all'); } }}
        className={`px-3 py-2 rounded-xl border text-right transition ${on ? 'bg-rose-500/15 border-rose-500 text-white' : `bg-gray-800/40 ${tones[tone]} hover:border-rose-500/50`}`}>
        <span className="block text-[19px] font-black tabular-nums leading-none" dir="ltr">{n.toLocaleString('en-US')}</span>
        <span className="block text-[10.5px] mt-1 opacity-80">{label}</span>
      </button>
    );
  };

  const doExport = async (fmt: 'pdf' | 'excel') => {
    setExporting(fmt);
    try {
      await exportReport('consent-register', { status, flag }, fmt);
      flash(fmt === 'pdf' ? 'صُدّر PDF' : 'صُدّر Excel');
    } catch (e: any) { flash(e.message || 'فشل التصدير'); }
    finally { setExporting(''); }
  };

  const t = totals;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-white">⚖️ سجلّ الموافقات</h1>
          <p className="text-[12.5px] text-gray-500 mt-1 max-w-[70ch] leading-relaxed">
            حالةُ الموافقة على سياسة الخصوصيّة وشروط الاستخدام لكلّ لاعب، وسجلُّها الكامل —
            سنداً لقانون حماية البيانات الشخصيّة الأردنيّ رقم ٢٤ لسنة ٢٠٢٣.
            <b className="text-gray-400"> عرضٌ فقط:</b> لا شيء هنا يغيّر موافقةَ أحد.
          </p>
        </div>
        <span className="text-[11px] text-gray-600 tabular-nums" dir="ltr">{tookMs ? `${tookMs} ms` : ''}</span>
      </div>

      {error && <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-[13px] text-rose-300">{error}</div>}

      {/* ── ١ · شريط الامتثال — كلّ رقمٍ مِقبضُ فلترة ── */}
      {t && (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(122px,1fr))' }}>
          {chip('status', 'all', 'لاعبون', t.players)}
          {chip('status', 'complete', 'موافقة مكتملة', t.complete, 'emerald')}
          {chip('status', 'played_no_consent', 'لعبوا بلا موافقة', t.playedNoConsent, 'rose')}
          {chip('status', 'never_asked', 'لم يُسألوا بعد', t.neverAsked)}
          {chip('status', 'partial', 'ناقصة', t.partial, 'amber')}
          {chip('status', 'withdrawn', 'مسحوبة', t.withdrawn)}
          {chip('flag', 'minor', 'قاصرون', t.minors, 'amber')}
          {chip('flag', 'ageUnknown', 'مجهولو السنّ', t.ageUnknown, 'amber')}
        </div>
      )}

      {/* ── ٢ · النسخ المنشورة ── */}
      {published.length > 0 && (
        <div className="bg-gray-800/20 border border-gray-700/30 rounded-2xl p-4">
          <h2 className="text-sm font-bold text-white mb-3">📜 النسخ المنشورة اليوم</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] min-w-[520px]">
              <thead><tr className="text-[10.5px] text-gray-500 border-b border-gray-700/40">
                <th className="text-right py-2 px-2 font-medium">الوثيقة</th>
                <th className="text-center py-2 px-2 font-medium">النسخة</th>
                <th className="text-right py-2 px-2 font-medium">نُشرت</th>
                <th className="text-center py-2 px-2 font-medium">وافق عليها</th>
                <th className="text-center py-2 px-2 font-medium">تُلزم بإعادة الموافقة</th>
              </tr></thead>
              <tbody>
                {published.map((d) => (
                  <tr key={d.kind} className="border-b border-gray-800/40 last:border-0">
                    <td className="py-2 px-2 text-gray-200">{KIND_AR[d.kind] || d.kind}<span className="text-gray-600 text-[11px] mr-2">{d.title}</span></td>
                    <td className="py-2 px-2 text-center tabular-nums" dir="ltr">{d.version}</td>
                    <td className="py-2 px-2 text-gray-400 tabular-nums" dir="ltr">{d.publishedAt?.slice(0, 10) || '—'}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-emerald-400 font-semibold">{d.grantedCount}</td>
                    <td className="py-2 px-2 text-center">
                      {d.requiresReconsent
                        ? <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">نعم</span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {published.some((d) => d.requiresReconsent) && t && (
            <p className="text-[11.5px] text-amber-300/90 border-r-2 border-amber-500/60 pr-3 mt-3 leading-relaxed">
              ⚠️ الوثائقُ الموسومة «تُلزم بإعادة الموافقة»: نشرُ نسخةٍ جديدة منها يُبطل موافقةَ
              <b className="tabular-nums"> {t.complete} </b> لاعباً فوراً ويحجبهم حتّى يوافقوا ثانيةً.
            </p>
          )}
        </div>
      )}

      {/* ── ٣ · شريط الأدوات ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو الهاتف…" className={inputCls + ' w-56'} />
        <button type="button" onClick={() => doExport('pdf')} disabled={!!exporting} className={btnCls}>{exporting === 'pdf' ? '⏳' : '🖨️'} PDF</button>
        <button type="button" onClick={() => doExport('excel')} disabled={!!exporting} className={btnCls}>{exporting === 'excel' ? '⏳' : '📊'} Excel</button>
        {(status !== 'all' || flag !== 'all') && (
          <button type="button" onClick={() => { setStatus('all'); setFlag('all'); }} className="text-[11.5px] text-gray-500 hover:text-gray-300 underline">مسح الفلتر</button>
        )}
        <span className="mr-auto text-[12px] text-gray-500">
          يعرض <b className="text-rose-300 tabular-nums">{shown.length.toLocaleString('en-US')}</b>
          {t && <> من {t.players.toLocaleString('en-US')}</>}
        </span>
      </div>

      {/* ── ٤ · الجدول + السجلّ ── */}
      <div className="bg-gray-800/20 border border-gray-700/30 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] min-w-[900px]">
            <thead>
              <tr className="bg-gray-900/50 border-b border-gray-700/40 text-[10px] uppercase tracking-wider text-gray-500">
                <th className="text-right px-3.5 py-2.5 font-medium">اللاعب</th>
                <th className="text-center px-2 py-2.5 font-medium">السنّ</th>
                <th className="text-right px-2 py-2.5 font-medium">الخصوصيّة</th>
                <th className="text-right px-2 py-2.5 font-medium">الشروط</th>
                <th className="text-center px-2 py-2.5 font-medium">وليّ الأمر</th>
                <th className="text-center px-2 py-2.5 font-medium">لعب</th>
                <th className="text-right px-2 py-2.5 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {loading && !players.length ? (
                <tr><td colSpan={7} className="py-14 text-center text-gray-600">⏳ يُستعلَم…</td></tr>
              ) : shown.map((p) => {
                const isOpen = open.has(p.id);
                const st = STATUS[p.status];
                return [
                  <tr key={p.id} onClick={() => setOpen((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                    className={`border-b border-gray-800/40 cursor-pointer ${isOpen ? 'bg-gray-800/50' : 'hover:bg-gray-800/30'}`}>
                    <td className="px-3.5 py-2">
                      <div className="flex items-center gap-2.5">
                        <span className={`text-[9px] transition-transform ${isOpen ? 'rotate-[-90deg] text-rose-400' : 'text-gray-600'}`}>◀</span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-white truncate max-w-[190px]">{p.name || '—'}</span>
                          <span className="block text-[10px] text-gray-500 tabular-nums" dir="ltr">{p.phone}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center">
                      {p.ageKnown
                        ? <span className={`tabular-nums ${p.isMinor ? 'text-amber-400 font-bold' : 'text-gray-300'}`}>{p.age}{p.isMinor && <span className="text-[9px] mr-1">قاصر</span>}</span>
                        : <span className="text-[10.5px] text-amber-400/70">مجهول</span>}
                    </td>
                    <td className="px-2 py-2">
                      {p.privacyAt
                        ? <span className="tabular-nums text-gray-300" dir="ltr">{p.privacyVersion} · {p.privacyAt.slice(0, 10)}<span className="text-gray-600 text-[10px] mr-1.5">{p.privacyPlatform}</span></span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-2 py-2">
                      {p.termsAt
                        ? <span className="tabular-nums text-gray-300" dir="ltr">{p.termsVersion} · {p.termsAt.slice(0, 10)}</span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {p.guardianMissing ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300">ناقص</span>
                        : p.guardianPhone ? <span className="text-[10.5px] text-emerald-400">{p.guardianName || 'مسجَّل'}</span>
                        : <span className="text-gray-700">—</span>}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums">
                      {p.matches ? <span className="text-gray-200">{p.matches}</span> : <span className="text-gray-700">0</span>}
                    </td>
                    <td className="px-2 py-2">
                      <span className={`text-[10.5px] px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                      {p.deletionStatus && <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 mr-1.5">حذف: {p.deletionStatus}</span>}
                    </td>
                  </tr>,
                  isOpen && (
                    <tr key={`${p.id}-d`}>
                      <td colSpan={7} className="bg-gray-900/40 border-b border-gray-700/40 p-0">
                        <div className="p-5">
                          <p className="text-[10.5px] tracking-wider text-gray-500 font-semibold mb-3">
                            سجلُّ الموافقات ({p.trail.length}) — يُضاف إليه ولا يُعدَّل
                          </p>
                          {p.trail.length === 0 ? (
                            <p className="text-[12px] text-gray-600">لا صفوف — لم يُسجَّل لهذا اللاعب أيُّ فعلِ موافقةٍ إطلاقاً.</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-[11.5px] min-w-[560px]">
                                <thead><tr className="text-[10px] text-gray-500 border-b border-gray-700/40">
                                  <th className="text-right py-1.5 px-2 font-medium">متى</th>
                                  <th className="text-right py-1.5 px-2 font-medium">الوثيقة</th>
                                  <th className="text-center py-1.5 px-2 font-medium">النسخة</th>
                                  <th className="text-center py-1.5 px-2 font-medium">الفعل</th>
                                  <th className="text-center py-1.5 px-2 font-medium">المنصّة</th>
                                  <th className="text-right py-1.5 px-2 font-medium">وليّ الأمر</th>
                                </tr></thead>
                                <tbody>
                                  {p.trail.map((r, i) => (
                                    <tr key={i} className="border-b border-gray-800/40 last:border-0">
                                      <td className="py-1.5 px-2 tabular-nums text-gray-400" dir="ltr">{r.at.replace('T', ' ')}</td>
                                      <td className="py-1.5 px-2 text-gray-200">{KIND_AR[r.kind] || r.kind}</td>
                                      <td className="py-1.5 px-2 text-center tabular-nums" dir="ltr">{r.version}</td>
                                      <td className="py-1.5 px-2 text-center">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${r.action === 'granted' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-violet-500/15 text-violet-300'}`}>
                                          {ACTION_AR[r.action] || r.action}
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-2 text-center text-gray-400">{r.platform || '—'}</td>
                                      <td className="py-1.5 px-2 text-gray-400">
                                        {r.guardianPhone ? `${r.guardianName || ''} ${r.guardianRelation || ''} · ${r.guardianPhone}` : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 text-[12px] mt-4 max-w-[420px]">
                            <dt className="text-gray-500">معرّف اللاعب</dt><dd className="text-gray-200 tabular-nums m-0" dir="ltr">{p.id}</dd>
                            <dt className="text-gray-500">تاريخ الميلاد</dt><dd className="text-gray-200 tabular-nums m-0" dir="ltr">{p.dob || '— غير مسجَّل'}</dd>
                            <dt className="text-gray-500">أنشئ الحساب</dt><dd className="text-gray-200 tabular-nums m-0" dir="ltr">{p.createdAt}</dd>
                            <dt className="text-gray-500">آخر ظهور</dt><dd className="text-gray-200 tabular-nums m-0" dir="ltr">{p.lastActiveAt || '—'}</dd>
                            <dt className="text-gray-500">مباريات · فعاليّات</dt><dd className="text-gray-200 tabular-nums m-0" dir="ltr">{p.matches} · {p.activities}</dd>
                            {p.deletionStatus && (<><dt className="text-gray-500">طلب حذف</dt><dd className="text-violet-300 m-0">{p.deletionStatus} · تستحقّ {p.deletionDueAt}</dd></>)}
                          </dl>
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
        {!loading && !shown.length && <div className="py-12 text-center text-gray-600 text-sm">لا لاعبين مطابقين.</div>}
      </div>

      {/* ── حواشٍ تُذكَر ولا تُخفى ── */}
      <div className="grid gap-4 text-[11.5px] text-gray-500 leading-relaxed" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
        <p className="border-r-2 border-gray-700 pr-3">
          <b className="text-gray-300">لماذا الرقم كبير:</b> بوّابةُ الموافقة تحرس شاشات تطبيق اللاعب،
          ومن يأتي للمكان ويلعب دون أن يفتح التطبيق لا يُسأل أصلاً. فالفجوة في تغطية المسار لا في المنطق.
        </p>
        <p className="border-r-2 border-gray-700 pr-3">
          <b className="text-gray-300">«لعب بلا موافقة» ≠ «لم يُسأل بعد»:</b> الأوّل انكشافٌ قائم —
          بياناتٌ عولجت في لعبةٍ حقيقيّة؛ والثاني حسابٌ خامل لم يجلس على طاولة. خلطُهما يُخفي الخطر في ضجيج.
        </p>
        <p className="border-r-2 border-gray-700 pr-3">
          <b className="text-gray-300">القاصرون وسمٌ لا حجب</b> (قرار المالك). و«وليّ ناقص» تعني قاصراً
          <b> وافق</b> بلا وليّ؛ من لم يوافق أصلاً يُحسب في حالته لا هنا.
        </p>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-100 text-gray-900 px-4 py-2 rounded-lg text-[13px] shadow-2xl z-50">{toast}</div>
      )}
    </div>
  );
}
