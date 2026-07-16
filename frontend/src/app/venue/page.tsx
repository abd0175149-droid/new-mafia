'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// /venue → التبويب الافتراضيّ (المنيو)
export default function VenueIndex() {
  const router = useRouter();
  useEffect(() => { router.replace('/venue/menu'); }, [router]);
  return null;
}
