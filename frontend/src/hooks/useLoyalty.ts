'use client';

// ══════════════════════════════════════════════════════
// 🎟️ بطاقة الولاء — جلب حالة اللاعب
// القاعدة الحاكمة: enabled=false ⇒ لا يظهر أيّ أثرٍ للميزة في أيّ واجهة.
// كلّ مستهلكٍ لهذا الهوك يشترط `data?.enabled` قبل أن يرسم شيئاً.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';

export type LoyaltyVerdict = 'stamped' | 'late' | 'channel' | 'no_booking' | 'voided' | 'no_show' | 'location';
export interface LoyaltyVisit {
  activityId: number; activityName: string; date: string; locationName: string | null;
  played: boolean; verdict: LoyaltyVerdict; leadHours: number | null; bookingCreatedBy: string | null; stampNo: number | null; stampId: number | null;
}
export interface LoyaltyReward {
  id: number; period: string; seq: number; kind: 'free_visit' | 'free_drink' | 'chips' | null;
  status: 'pending_choice' | 'available' | 'redeemed' | 'expired' | 'void';
  value: any; earnedAt: string; chooseBy: string | null; expiresAt: string | null; redeemedAt: string | null;
  redeemedRefType: string | null; redeemedRefId: number | null; note: string | null;
}
export interface LoyaltyMe {
  enabled: boolean;
  period?: string;
  config?: { stampsPerReward: number; minLeadHours: number; maxRewardsPerMonth: number; rewardValidityDays: number; chooseWindowDays: number; kinds: ('free_visit' | 'free_drink' | 'chips')[]; chipsAmount: number; drinkCapJod: number; channel: string };
  card?: { stamps: number; inCard: number; needed: number; cardsCompleted: number; capReached: boolean };
  visits?: LoyaltyVisit[];
  rewards?: LoyaltyReward[];
  pendingChoice?: LoyaltyReward | null;
  available?: LoyaltyReward[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
let cache: { v: LoyaltyMe; at: number } | null = null;

export function tokenOf(): string | null {
  try { return typeof window !== 'undefined' ? localStorage.getItem('mafia_player_token') : null; } catch { return null; }
}

export async function fetchLoyaltyMe(force = false): Promise<LoyaltyMe> {
  if (!force && cache && Date.now() - cache.at < 20_000) return cache.v;
  const token = tokenOf();
  if (!token) return { enabled: false };
  try {
    const r = await fetch(`${API_URL}/api/loyalty/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return { enabled: false };
    const v = await r.json();
    const out: LoyaltyMe = v && v.enabled ? v : { enabled: false };
    cache = { v: out, at: Date.now() };
    return out;
  } catch { return { enabled: false }; }
}

export function useLoyalty() {
  const [data, setData] = useState<LoyaltyMe | null>(cache?.v ?? null);
  const [loading, setLoading] = useState(!cache);
  const alive = useRef(true);
  const refresh = useCallback(async (force = true) => {
    const v = await fetchLoyaltyMe(force);
    if (alive.current) { setData(v); setLoading(false); }
    return v;
  }, []);
  useEffect(() => { alive.current = true; void refresh(false); return () => { alive.current = false; }; }, [refresh]);

  const choose = useCallback(async (rewardId: number, kind: 'free_visit' | 'free_drink' | 'chips') => {
    const token = tokenOf(); if (!token) return { ok: false, error: 'غير مصادق' };
    try {
      const r = await fetch(`${API_URL}/api/loyalty/me/rewards/${rewardId}/choose`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ kind }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) return { ok: false, error: d.error || 'تعذّر تثبيت الاختيار' };
      cache = { v: d.me, at: Date.now() }; if (alive.current) setData(d.me);
      if (kind === 'chips') { try { window.dispatchEvent(new CustomEvent('chips:balance-updated', { detail: { delta: d.reward?.value?.chips || 0 } })); } catch { /* noop */ } }
      return { ok: true };
    } catch { return { ok: false, error: 'تعذّر الاتصال — أعد المحاولة' }; }
  }, []);

  return { data, loading, refresh, choose, enabled: !!data?.enabled };
}

// ── مساعدات نصّيّة مشتركة ──
const AR_D = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
export const arNum = (v: string | number) => String(v).replace(/[0-9]/g, c => AR_D[+c]);
export const AR_MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيّار', 'حزيران', 'تمّوز', 'آب', 'أيلول', 'تشرين الأوّل', 'تشرين الثاني', 'كانون الأوّل'];
export function periodNameAr(period?: string): string {
  if (!period) return '';
  const m = Number(period.split('-')[1]); return AR_MONTHS[m - 1] || period;
}
export function fmtLeadAr(h: number): string {
  const a = Math.abs(h);
  if (a >= 48) return `${arNum(Math.round(a / 24))} أيّام`;
  if (a >= 24) return 'يوم';
  const whole = Math.floor(a); const m = Math.round((a - whole) * 60);
  if (whole <= 0) return `${arNum(m)} دقيقة`;
  return m ? `${arNum(whole)} س ${arNum(m)} د` : `${arNum(whole)} ساعات`;
}
export function fmtTimeAr(d: Date): string {
  return arNum(d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Amman' })
    .replace('am', 'صباحاً').replace('pm', 'مساءً').replace('AM', 'صباحاً').replace('PM', 'مساءً'));
}
export function fmtDateAr(iso: string | null | undefined): string {
  if (!iso) return '';
  return arNum(new Date(iso).toLocaleDateString('ar-JO', { day: 'numeric', month: 'long', timeZone: 'Asia/Amman' }));
}
/** «باقي X س Y د» حتى موعدٍ، أو null إن فات */
export function remainingAr(until: string | Date | null | undefined): string | null {
  if (!until) return null;
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600e3); const m = Math.floor((ms % 3600e3) / 60e3);
  if (h >= 48) return `باقي ${arNum(Math.floor(h / 24))} أيّام`;
  if (h >= 24) return `باقي يوم و${arNum(h - 24)} س`;
  return `باقي ${arNum(h)} س ${arNum(m)} د`;
}
export function verdictLabel(v: LoyaltyVisit): { text: string; tone: 'ok' | 'bad' | 'warn' | 'muted'; why: string } {
  switch (v.verdict) {
    case 'stamped': return { text: `✦ ختم ${arNum(v.stampNo ?? '')}`, tone: 'ok', why: v.leadHours != null ? `حجزت قبل ${fmtLeadAr(v.leadHours)} · لعبت` : 'لعبت' };
    case 'late': return { text: 'بلا ختم', tone: 'bad', why: v.leadHours != null && v.leadHours < 0 ? 'حجزت بعد بدء الفعاليّة' : `حجزت قبل ${fmtLeadAr(v.leadHours ?? 0)} فقط` };
    case 'channel': return { text: 'بلا ختم', tone: 'bad', why: 'الحجز لم يكن من التطبيق' };
    case 'no_booking': return { text: 'بلا ختم', tone: 'bad', why: 'لعبت بلا حجز من التطبيق' };
    case 'no_show': return { text: 'لم تلعب', tone: 'warn', why: 'حجزت ولم تلعب مباراة' };
    case 'voided': return { text: 'ختم ملغى', tone: 'muted', why: 'أُلغي من الإدارة' };
    default: return { text: 'خارج البرنامج', tone: 'muted', why: 'المكان خارج بطاقة الولاء' };
  }
}
export const KIND_LABEL: Record<string, { icon: string; label: string }> = {
  free_visit: { icon: '🎟️', label: 'زيارة مجّانيّة' },
  free_drink: { icon: '☕', label: 'مشروب مجّاني' },
  chips: { icon: '🪙', label: 'تشبس' },
};
