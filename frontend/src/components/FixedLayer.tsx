'use client';

// ══════════════════════════════════════════════════════
// 📌 طبقةٌ مثبَّتة على body
// ══════════════════════════════════════════════════════
// 🔴 الفخّ الذي يبتلع كلّ لوحةٍ عائمة في هذا المشروع:
//    أيُّ سلفٍ يحمل `filter` أو `backdrop-filter` أو `transform` أو
//    `perspective` أو `contain:paint` يصير هو الإطارَ المرجعيّ لكلّ
//    `position:fixed` بداخله. فتُقاس `bottom-4 left-4` من ذلك السلف لا من
//    الشاشة، و`inset-0` تعني صندوقَه لا النافذة — فينتهي الزرّ في زاويةٍ
//    غريبة أو خارج الحافّة، بلا خطأٍ ولا تحذير.
//
//    ولأنّ السلفَ الجاني قد يظهر لاحقاً بتغييرٍ بصريٍّ بريء في مكانٍ بعيد،
//    لا يُعوَّل على «تنظيف الآباء»: كلُّ ما يجب أن يُقاس بالشاشة يُعلَّق هنا.
//
//    (كان هذا مكرّراً في SeatMove و AntiCheatWatch — والنسختان تشرحان الفخّ
//     نفسه. وحّدناهما هنا كي لا يبقى العلاجُ سرّاً في ملفَّين.)
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export default function FixedLayer({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(<>{children}</>, document.body);
}
