'use client';
import { useEffect, useState } from 'react';
import { waDirectEnabled } from '@/lib/whatsapp';

/** هل ترسل هذه الصفحة عبر رقم الأعمال مباشرة؟ (false ⇒ تفتح تطبيق واتساب كما كانت) */
export function useWaDirect(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => { let alive = true; waDirectEnabled().then(v => { if (alive) setOn(v); }); return () => { alive = false; }; }, []);
  return on;
}
