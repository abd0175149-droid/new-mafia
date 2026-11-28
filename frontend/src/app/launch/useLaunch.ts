'use client';
// 🎬 حالة عرض ليلة الإطلاق: سؤالٌ دوريّ للسيرفر + فرق ساعة الجهاز عن ساعة السيرفر
// (كلّ الشاشات تحسب التوقيت من stageAt بساعة السيرفر، فتتحرّك معاً)
import { useCallback, useEffect, useRef, useState } from 'react';

export const API = process.env.NEXT_PUBLIC_API_URL || '';

export const staffToken = () => {
  try { return localStorage.getItem('token') || localStorage.getItem('leader_token') || ''; } catch { return ''; }
};

/** role: من يسأل (للأضواء في جهاز الليدر) — tv · guest · sound. playing: ما يشغّله لابتوب الصوت الآن */
export function useLaunch<T = any>(pollMs = 800, staff = false, role?: 'tv' | 'guest' | 'sound', playing?: () => string) {
  const [state, setState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offset = useRef(0);
  const bestRtt = useRef(Infinity);
  const [, tick] = useState(0);
  const playRef = useRef(playing); playRef.current = playing;

  const pull = useCallback(async () => {
    const t0 = Date.now();
    try {
      const q = new URLSearchParams();
      if (!staff) { const k = previewKey(); if (k) q.set('k', k); }
      if (role === 'sound') { q.set('r', 'sound'); q.set('p', playRef.current?.() || ''); }
      else if (role) { q.set('r', role); q.set('c', deviceId()); }
      const qs = q.toString() ? `?${q}` : '';
      const r = await fetch(`${API}/api/launch-show/${staff ? 'control/state' : 'state'}${qs}`, {
        cache: 'no-store', headers: staff ? { Authorization: `Bearer ${staffToken()}` } : undefined,
      });
      const t1 = Date.now();
      if (r.status === 401 || r.status === 403) { setError('auth'); return; }
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error || 'تعذّر الاتّصال');
      const rtt = t1 - t0;
      if (typeof b.now === 'number' && (rtt < bestRtt.current * 1.5 || rtt < 400)) {
        bestRtt.current = Math.min(bestRtt.current, rtt);
        offset.current = b.now - (t0 + t1) / 2;
      }
      setError(null);
      setState(b);
    } catch (e: any) { setError(e?.message || 'تعذّر الاتّصال'); }
  }, [staff, role]);

  useEffect(() => {
    let alive = true; let h: any;
    const loop = async () => { if (!alive) return; await pull(); h = setTimeout(loop, pollMs); };
    loop();
    const t = setInterval(() => tick(x => x + 1), 200);
    return () => { alive = false; clearTimeout(h); clearInterval(t); };
  }, [pull, pollMs]);

  const serverNow = useCallback(() => Date.now() + offset.current, []);
  return { state, error, serverNow, refresh: pull };
}

/** مفتاح المعاينة من رابط الشاشة (?k=…) — للتجربة قبل يوم الإطلاق فقط */
export function previewKey() {
  try { return new URLSearchParams(window.location.search).get('k') || ''; } catch { return ''; }
}
export function previewQuery() { const k = previewKey(); return k ? `?k=${encodeURIComponent(k)}` : ''; }
export const cardSrc = (src: string) => src + previewQuery();

export const toAr = (v: number | string) => String(v).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

export function deviceId() {
  try {
    let d = localStorage.getItem('launch_device');
    if (!d) { d = (crypto as any).randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem('launch_device', d!); }
    return d!;
  } catch { return `tmp-${Math.random().toString(36).slice(2, 12)}`; }
}

/** الوقت المتبقّي «س:د:ث» بالأرقام العربيّة */
export function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return toAr(h > 0 ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`);
}

export type Line = { t: number; text: string; kind?: 'narr' | 'verse' };
export type Card = { key: string; name: string; slogan: string; text: string; entry: string; image: string };
