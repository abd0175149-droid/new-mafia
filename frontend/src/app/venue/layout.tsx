// ══════════════════════════════════════════════════════
// 🏪 تخطيط كونسول المكان — طبقةُ خادمٍ رقيقة فوق الغلاف العميل
// وجودها لسببٍ واحد: **manifest خاصّ بالكونسول**.
// 🔴 الجذر يعلن manifest.json وفيه `start_url: /player`، فإضافة الكونسول إلى
//    الشاشة الرئيسيّة على الآيفون كانت تُنتج أيقونةً تفتح **تطبيق اللاعب** لا
//    الكونسول — والأسوأ أنّ إشعارات iOS مرتبطة بنطاق التطبيق المثبَّت، فكان
//    جهاز البار يُثبَّت على النطاق الخطأ ثمّ لا تصله إشعارات الطلبات.
//    هذا الملفّ يتجاوز الإعلان بـ venue-manifest.json (start_url: /venue/orders).
// المكوّنات العميلة لا تُصدّر metadata — لذا فُصل الغلاف إلى VenueShell.
// ══════════════════════════════════════════════════════

import type { Metadata } from 'next';
import VenueShell from './VenueShell';

export const metadata: Metadata = {
  title: 'كونسول المكان — نادي المافيا',
  manifest: '/venue-manifest.json',
  // 🔥 أيقونة لهبٍ مختلفة عن قناع اللاعب — أيقونتان متطابقتان على شاشةٍ واحدة
  //    تعني نقرةً خاطئة كلّ ليلة. iOS يقرأ apple-touch-icon لا أيقونات manifest.
  icons: { apple: '/icons/venue-192x192.png', icon: '/icons/venue-192x192.png' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'كونسول المكان',
  },
};

export default function VenueLayout({ children }: { children: React.ReactNode }) {
  return <VenueShell>{children}</VenueShell>;
}
