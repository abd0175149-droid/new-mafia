'use client';

// ══════════════════════════════════════════════════════
// ⏳ PhaseLoading — حالة تحميل موحّدة بين أطوار الغرفة عن بُعد
// (بديل الأنماط الأربعة المتفرّقة: نص خام / سبينر / إيموجي ⏳)
// ══════════════════════════════════════════════════════

export default function PhaseLoading({ icon, text }: { icon?: string; text?: string }) {
  return (
    <div className="py-10 text-center">
      {icon && <div className="text-3xl mb-3">{icon}</div>}
      <div className="w-8 h-8 border-2 border-[#C5A059]/30 border-t-[#C5A059] rounded-full animate-spin mx-auto mb-3" />
      <p className="text-[11px] font-mono text-[#9a9a9a]">{text || 'جارٍ التحميل…'}</p>
    </div>
  );
}
