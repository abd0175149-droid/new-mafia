'use client';

// 🏪 /admin/venues → المنيو (الصفحة الأكثر استعمالاً في القسم)
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminVenuesIndex() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/venues/menu'); }, [router]);
  return null;
}
