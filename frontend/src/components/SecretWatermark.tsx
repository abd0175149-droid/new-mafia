'use client';

// ══════════════════════════════════════════════════════
// 💧 علامةٌ مائيّة تُغطّي الشاشة السريّة — تجعل أيّ لقطةٍ تفضح صاحبها
// ══════════════════════════════════════════════════════
// نصٌّ شفّافٌ مائلٌ مكرّرٌ (اسم + مقعد + رمز + وقت). لأنّ المكان يعرف الجميع،
// أيّ لقطةٍ مسرَّبة تُعلن مسرّبها. تعمل حتى حيث يستحيل منع اللقطة (الويب/iOS).
// طبقةٌ ثابتةٌ فوق المحتوى، بلا اعتراضٍ للمس (pointer-events:none).

export default function SecretWatermark({ label, opacity = 0.10 }: { label: string; opacity?: number }) {
  if (!label) return null;
  // بلاطةٌ واحدة تتكرّر عبر background-image (SVG data URI) — مائلةٌ وخفيفة
  const svg = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='120'>` +
    `<text x='0' y='60' transform='rotate(-28 150 60)' ` +
    `font-family='Tahoma, sans-serif' font-size='13' font-weight='700' ` +
    `fill='rgba(255,255,255,${opacity})'>${escapeXml(label)}</text></svg>`,
  );
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-30"
      style={{
        backgroundImage: `url("data:image/svg+xml,${svg}")`,
        backgroundRepeat: 'repeat',
      }}
    />
  );
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, c =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;');
}
