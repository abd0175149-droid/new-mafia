'use client';

// 📥 طلبات المكان من لوحة الإدارة — /admin/venues/orders
// إشراف الأدمن على الطلبات الحيّة (يسدّ الفجوة: لم تكن هناك لوحة طلبات للأدمن).
// نفس طابور كونسول المكان — بثٌّ لحظيّ ونغمة وتغيير حالات.
import VenueOrdersPage from '../../../venue/orders/page';

export default function AdminVenueOrdersPage() {
  return <VenueOrdersPage />;
}
