'use client';
// ══════════════════════════════════════════════════════
// 📐 FitToScreen — كلّ محتوى شاشة العرض داخل الشاشة، بلا تمرير، مهما كان قياسها
// ══════════════════════════════════════════════════════
// قرار المالك 2026-09-12: لا يجوز أن يُقصّ شيءٌ ولا أن يُمرَّر — في كلّ مرحلةٍ وحالة.
//
// الآلية: يُقاس الارتفاع الطبيعيّ للمحتوى مقابل الارتفاع المتاح، وإذا فاض
// يُصغَّر المحتوى كلّه بنسبةٍ واحدة (`zoom`) حتى يتّسع؛ وإذا اتّسع يبقى 1.
//
// 🔴 لماذا `zoom` لا `transform: scale`؟ لأنّ `transform` على سلفٍ يجعله
//    الإطارَ المرجعيّ لكلّ `position:fixed` بداخله (انظر FixedLayer)، فتنكمش
//    طبقاتُ المواجهة والمُسكَت وشريطُ الطابور مع المحتوى. `zoom` لا يفعل ذلك:
//    تبقى الطبقات الثابتة على الشاشة كاملةً ويُصغَّر ما بداخلها فقط.
//
// العرض: الابن يأخذ `100/zoom %` من العرض كي يملأ الشاشة بعد التصغير (لا يبقى
// شريطٌ فارغٌ على الجانبين). القياس عبر getBoundingClientRect (يعكس zoom) مقسوماً
// على zoom الحاليّ ⇒ الارتفاع الطبيعيّ، فلا يعتمد على تفاصيل تنفيذ offsetHeight.
//
// من يقيس الشاشة بالبكسل الحقيقيّ (كاميرا لوح النقاش) يقرأ `data-fit-zoom` ويقسم عليه.
// ══════════════════════════════════════════════════════
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const MIN_ZOOM = 0.45;

export default function FitToScreen({ children, className = '' }: { children: ReactNode; className?: string }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);

  const measure = () => {
    const outer = outerRef.current, inner = innerRef.current;
    if (!outer || !inner) return;
    const avail = outer.clientHeight;
    if (avail <= 0) return;
    const rendered = inner.getBoundingClientRect().height;
    const natural = rendered / (zoomRef.current || 1);
    const next = natural > 0 ? Math.max(MIN_ZOOM, Math.min(1, avail / natural)) : 1;
    // تسامحٌ صغير كي لا نتذبذب بين قيمتين متقاربتين عند إعادة الانسياب
    if (Math.abs(next - zoomRef.current) > 0.004) {
      zoomRef.current = next;
      setZoom(next);
    }
  };

  useLayoutEffect(() => { measure(); });

  useEffect(() => {
    const outer = outerRef.current, inner = innerRef.current;
    if (!outer || !inner) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(outer); ro.observe(inner);
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    // بعد تحميل الخطوط تتغيّر الارتفاعات
    (document as any).fonts?.ready?.then(() => measure()).catch(() => {});
    return () => { ro.disconnect(); window.removeEventListener('resize', onResize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={outerRef} className={`relative w-full h-full min-h-0 flex flex-col items-center justify-center overflow-hidden ${className}`}>
      <div
        ref={innerRef}
        data-fit-zoom={zoom}
        className="flex flex-col items-center justify-center"
        style={{ zoom, width: `${100 / zoom}%` } as any}
      >
        {children}
      </div>
    </div>
  );
}
