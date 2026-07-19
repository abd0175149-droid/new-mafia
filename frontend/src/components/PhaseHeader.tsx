'use client';

// ══════════════════════════════════════════════════════
// 🏷️ PhaseHeader — رأس طورٍ موحّد لشاشات المضيف عن بُعد
// أيقونة + عنوان Amiri فاخر + سطر mono لاتيني اختياري — يجيب دائماً «في أي طور أنا؟»
// ══════════════════════════════════════════════════════

export default function PhaseHeader({ icon, title, sub }: { icon?: string; title: string; sub?: string }) {
  return (
    <div className="text-center mb-3">
      {icon && <div className="text-2xl leading-none mb-1">{icon}</div>}
      <div className="text-lg font-black text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>{title}</div>
      {sub && <div className="text-[10px] font-mono text-[#9a9a9a] tracking-widest uppercase mt-0.5">{sub}</div>}
    </div>
  );
}
