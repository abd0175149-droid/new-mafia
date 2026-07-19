// ══════════════════════════════════════════════════════
// 🖼️ avatarThumb — يشتقّ رابط المصغّر WebP 192px من رابط الأفاتار الكامل
// /uploads/avatars/12.jpg?v=... → /uploads/avatars/thumbs/12.webp
// للاستخدام في القوائم الصغيرة (≤48px) مع onError يرجع للأصل — الحلقة تبقى على الدقة الكاملة.
// ══════════════════════════════════════════════════════

export function avatarThumb(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  const m = avatarUrl.match(/^(.*\/avatars\/)([^/?#.]+)\.[a-zA-Z]+(?:[?#].*)?$/);
  if (!m) return avatarUrl; // رابط خارجي/غير قياسي — استعمله كما هو
  return `${m[1]}thumbs/${m[2]}.webp`;
}
