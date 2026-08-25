'use client';

// ══════════════════════════════════════════════════════
// 🚦 بوّابة إصدار التطبيق — الحدّ الأدنى المدعوم والأحدث
//
// 🔴 السياسة هنا لا في التطبيق: تغييرها يحتاج ضغطة زرّ لا إصداراً جديداً على
//    المتجر — وهو ما لا يمكن دفعه إلى من حُجب أصلاً.
//
// ⚠️ ومفارقةٌ يجب أن تُقرأ قبل الضبط: شفرة الحجب تعيش داخل النسخة الجديدة.
//    النسخ الأقدم من 0.3.0 لا تستدعي البوّابة ولا تعرف بوجودها — فرفع الحدّ
//    لا يفعل بها شيئاً. انتقالها الأوّل يدويٌّ حتماً (إشعار + زرّ التحميل).
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null);

const APK_URL = '/api/app/android/apk';

export default function AppReleasePage() {
  const [f, setF] = useState({
    minAndroid: '0.0.0', latestAndroid: '0.0.0',
    minIos: '0.0.0', latestIos: '0.0.0',
    androidUrl: '', iosUrl: '', message: '',
  });
  const [apk, setApk] = useState<{ available: boolean; version?: string; sizeMb?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [r1, r2] = await Promise.all([
        fetch(`${API_URL}/api/app/release`).then(x => x.json()),
        fetch(`${API_URL}/api/app/android/info`).then(x => x.json()).catch(() => null),
      ]);
      setF({
        minAndroid: r1.minAndroid || '0.0.0', latestAndroid: r1.latestAndroid || '0.0.0',
        minIos: r1.minIos || '0.0.0', latestIos: r1.latestIos || '0.0.0',
        androidUrl: r1.androidUrl || '', iosUrl: r1.iosUrl || '', message: r1.message || '',
      });
      setApk(r2);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      const r = await fetch(`${API_URL}/api/app/release`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify(f),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'تعذّر الحفظ');
      setMsg('حُفظت السياسة'); setTimeout(() => setMsg(''), 3000);
      load();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const set = (k: keyof typeof f) => (e: any) => setF(v => ({ ...v, [k]: e.target.value }));

  const Field = ({ k, label, hint, ltr = true }: { k: keyof typeof f; label: string; hint?: string; ltr?: boolean }) => (
    <label className="block">
      <span className="block text-xs text-gray-400 mb-1">{label}</span>
      <input value={f[k]} onChange={set(k)} dir={ltr ? 'ltr' : 'rtl'}
        className="w-full px-3.5 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white text-sm font-mono outline-none focus:border-amber-500/50" />
      {hint && <span className="block text-[10.5px] text-gray-600 mt-1">{hint}</span>}
    </label>
  );

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-5">
        <span className="w-11 h-11 rounded-2xl grid place-items-center text-xl bg-amber-500/10 border border-amber-500/25">🚦</span>
        <div className="flex-1">
          <h1 className="text-xl font-black text-white">بوّابة إصدار التطبيق</h1>
          <p className="text-xs text-gray-500 mt-0.5">من يُحجَب، ومن يُنبَّه، وإلى أين يُرسَل</p>
        </div>
        <button onClick={load} className="px-3 py-2 rounded-xl text-xs font-bold bg-gray-800/60 border border-gray-700/50 text-gray-300 hover:text-white">
          {loading ? '…' : '↻'}
        </button>
      </div>

      {/* الحزمة المرفوعة */}
      <div className="rounded-2xl p-4 mb-4 border"
        style={{ background: apk?.available ? 'rgba(16,185,129,0.06)' : 'rgba(217,138,43,0.07)',
                 borderColor: apk?.available ? 'rgba(16,185,129,0.25)' : 'rgba(217,138,43,0.28)' }}>
        <div className="flex items-center gap-2.5 flex-wrap text-[13px]">
          <span className="text-lg">📦</span>
          {apk?.available ? (
            <>
              <b className="text-emerald-400">حزمة مرفوعة</b>
              <span className="text-gray-400 font-mono" dir="ltr">v{apk.version || '؟'}</span>
              {apk.sizeMb && <span className="text-gray-600 font-mono" dir="ltr">{apk.sizeMb} MB</span>}
              <a href={APK_URL} className="mr-auto text-[12px] underline text-emerald-400">تنزيل</a>
            </>
          ) : (
            <b className="text-amber-400">لا حزمة مرفوعة — زرّ التحميل في صفحة اللاعب لن يظهر</b>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-white mb-3">أندرويد</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field k="minAndroid" label="الحدّ الأدنى المدعوم" hint="أقدم منه ⇒ شاشة حجب" />
            <Field k="latestAndroid" label="الأحدث" hint="أقدم منه ⇒ تنبيهٌ لطيف" />
          </div>
          <div className="mt-3">
            <Field k="androidUrl" label="رابط التحديث" hint="حزمتنا على الخادم: /api/app/android/apk" />
          </div>
        </div>

        <div className="pt-3 border-t border-gray-800">
          <h2 className="text-sm font-bold text-white mb-3">iOS</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field k="minIos" label="الحدّ الأدنى المدعوم" />
            <Field k="latestIos" label="الأحدث" />
          </div>
          <div className="mt-3"><Field k="iosUrl" label="رابط المتجر" /></div>
        </div>

        <div className="pt-3 border-t border-gray-800">
          <Field k="message" label="نصّ شاشة الحجب" ltr={false} />
        </div>

        {err && <div className="rounded-xl px-3.5 py-2.5 text-[13px] bg-rose-500/10 border border-rose-500/30 text-rose-300">{err}</div>}
        {msg && <div className="rounded-xl px-3.5 py-2.5 text-[13px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">{msg}</div>}

        <button onClick={save} disabled={saving}
          className="w-full py-3 rounded-xl text-sm font-black bg-amber-500 text-black disabled:opacity-50">
          {saving ? 'يحفظ…' : 'احفظ السياسة'}
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-dashed border-amber-500/25 bg-amber-500/[0.04] p-4">
        <h3 className="text-[13px] font-bold text-amber-400 mb-1.5">اقرأ قبل رفع الحدّ</h3>
        <p className="text-[12px] text-gray-400 leading-relaxed">
          شفرة الحجب تعيش <b className="text-gray-300">داخل النسخة الجديدة</b>. النسخ الأقدم من
          <span className="font-mono" dir="ltr"> 0.3.0 </span>
          لا تستدعي هذه البوّابة ولا تعرف بوجودها — فرفع الحدّ لا يفعل بها شيئاً.
          انتقالها الأوّل يدويٌّ حتماً: <b className="text-gray-300">إشعارٌ للجميع</b> وزرّ التحميل
          في صفحة دخول اللاعب. ومن <span className="font-mono" dir="ltr">0.3.0</span> فصاعداً يعمل
          الإجبار من تلقائه.
        </p>
      </div>
    </div>
  );
}
