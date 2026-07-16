'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// /venue → الصفحة التشغيليّة الرئيسيّة: صندوق الطلبات
export default function VenueIndex() {
  const router = useRouter();
  useEffect(() => { router.replace('/venue/orders'); }, [router]);
  return null;
}
