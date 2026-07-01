'use client';

import { useEffect } from 'react';
import { installGlobalSwal } from '@/lib/swal';

// يوجّه كل نداءات window.alert في المشروع إلى SweetAlert2 (تنبيهات موحّدة).
export default function SwalProvider() {
  useEffect(() => { installGlobalSwal(); }, []);
  return null;
}
