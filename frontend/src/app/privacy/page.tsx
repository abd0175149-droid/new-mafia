'use client';

// ══════════════════════════════════════════════════════
// 📜 صفحةُ سياسة الخصوصيّة — عامّةٌ بلا مصادقة
//
// 🔴 بلا حسابٍ عمداً: المتجران (آبل وGoogle) يشترطان رابطاً يفتحه المراجعُ
//    بلا تسجيل دخول، ومَن لم يوافق بعد يجب أن يقرأ قبل أن يقرّر.
//    وهي أيضاً الرابطُ المعلَن في نموذج «أمان البيانات» على Google Play.
// ══════════════════════════════════════════════════════

import Link from 'next/link';
import { PolicyBody, usePolicyDoc } from '@/components/PolicyDoc';

export default function PrivacyPage() {
  const { doc, loading, error } = usePolicyDoc('privacy');

  return (
    <div className="min-h-screen bg-[#050505] py-10 px-5" dir="rtl">
      <div className="max-w-2xl mx-auto">
        <div className="mb-7">
          <p className="text-[12px] font-bold" style={{ color: '#C5A059' }}>مافيا كلوب</p>
          <h1 className="text-[30px] font-bold text-white mt-1" style={{ fontFamily: 'Amiri, serif' }}>
            سياسة الخصوصيّة
          </h1>
          {doc && (
            <p className="text-[12px] text-gray-500 mt-2">
              النسخة {doc.version}
              {doc.publishedAt && ` · نُشرت ${new Date(doc.publishedAt).toLocaleDateString('ar-JO', { dateStyle: 'long' })}`}
            </p>
          )}
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-9 h-9 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          </div>
        )}
        {error && <p className="text-red-400 text-sm py-10 text-center">{error}</p>}
        {doc && <PolicyBody body={doc.body} />}

        <div className="mt-10 pt-6 flex flex-wrap gap-4 text-[13px]"
          style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <Link href="/terms" className="text-amber-400 hover:underline">شروط الاستخدام ←</Link>
          <Link href="/privacy/delete" className="text-red-400 hover:underline">طلبُ حذف الحساب ←</Link>
          <a href="mailto:privacy@club-mafia.grade.sbs" className="text-gray-400 hover:underline" dir="ltr">
            privacy@club-mafia.grade.sbs
          </a>
        </div>
      </div>
    </div>
  );
}
