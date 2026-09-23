'use client';

// ══════════════════════════════════════════════════════
// 🕴️ ختم الدون — القطعة البصريّة الوحيدة لبطاقة الولاء
// ══════════════════════════════════════════════════════
// شعار النادي كما هو (بلا تثخينٍ ولا إعادة رسم) مقنَّعاً على ذهبٍ واحد،
// داخل إطارٍ متّجه: حلقةٌ صلبة ثمّ حبّاتٌ مستديرة ثمّ خيطٌ رفيع.
// ما يحتمل التصغير متّجه، وما يحمل الهويّة يبقى كما رُسم.
// دون ٤٠ بكسلاً تخفت أدقّ الخطوط — الإطار وحده يقول «ختم»، وهو كافٍ.

import './DonSeal.css';

/** إزاحة البروز تكبر نسبيّاً كلّما صغر القرص، وإلّا اختفى النقش الصغير */
function embossVars(size: number): React.CSSProperties {
  const rx = Math.round((0.3 + size * 0.005) * 100) / 100;
  return { ['--sz' as string]: `${size}px`, ['--rx' as string]: `${rx}px`, ['--ry' as string]: `${Math.round(rx * 1.12 * 100) / 100}px` };
}

export function DonSeal({ size = 52, tilt = 0, className = '' }: { size?: number; tilt?: number; className?: string }) {
  // الميل على الغلاف لا على القرص: `transform` ينشئ سياق تكديسٍ يقلب حافّة
  // الشمع (z-index:-1) فوق الشمع بدل أن تبقى خلفه.
  return (
    <span className={`don-seal-wrap ${className}`} style={{ ...embossVars(size), transform: tilt ? `rotate(${tilt}deg)` : undefined }} aria-hidden>
      <span className="don-seal">
        <span className="don-seal__ring">
          <svg viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45.2" fill="none" stroke="currentColor" strokeWidth="2.6" />
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="0.1 6.6" strokeLinecap="round" />
            <circle cx="50" cy="50" r="35.2" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.75" />
          </svg>
        </span>
        <span className="don-seal__emboss">
          <span className="don-seal__mark" />
        </span>
      </span>
    </span>
  );
}

/** خانةٌ فارغة برقمها — والأخيرة بحلقةٍ صلبة: المكافأة على بعد ختمٍ واحد */
export function DonSlot({ size = 52, label, last = false }: { size?: number; label: string; last?: boolean }) {
  return (
    <span className={`don-slot ${last ? 'don-slot--last' : ''}`} style={{ ...embossVars(size), fontSize: Math.max(9, size * 0.3) }}>
      {label}
    </span>
  );
}

/** ميلٌ ثابتٌ لكلّ خانة — الشمع لا يُضغط مرّتين بالزاوية نفسها، ولا يتغيّر بإعادة الرسم */
export const sealTilt = (i: number) => [-7, 5, -4, 6, -5, 3, -6, 4][i % 8];
