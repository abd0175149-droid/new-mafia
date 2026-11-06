// ══════════════════════════════════════════════════════
// 🚌 جسرٌ صغير بين غرفة اللعبة والشريط السفليّ (2026-11-06)
//
// الشريط السفليّ يُرسم في layout اللاعب، والغرفة داخل صفحة «ادخل» — لا أبٌ
// مشترك يحمل الحالة. قرار المالك: شريطٌ سفليّ واحد، وزرّ المنتصف يصبح «اللعبة»
// ما دام اللاعب داخل الغرفة (بحلقة وقت المرحلة) ويفتح أدوات اللعبة.
// الغرفة تكتب هنا، والشريط يقرأ عبر useSyncExternalStore.
// ══════════════════════════════════════════════════════

import { useSyncExternalStore } from 'react';

export interface RoomBusState {
  /** داخل غرفة لعبة على الواجهة الجديدة */
  active: boolean;
  /** نهاية وقت المرحلة الحاليّة (ms epoch) — للحلقة حول زرّ المنتصف */
  endsAt: number | null;
  /** طول المرحلة بالثواني — لحساب نسبة الحلقة */
  totalSec: number;
  /** عدد ما في سلّة المنيو — شارةٌ على الزرّ */
  cart: number;
}

const EMPTY: RoomBusState = { active: false, endsAt: null, totalSec: 0, cart: 0 };
let state: RoomBusState = EMPTY;
let openHub: (() => void) | null = null;
const subs = new Set<() => void>();

export function setRoomBus(patch: Partial<RoomBusState>) {
  const next = { ...state, ...patch };
  if (next.active === state.active && next.endsAt === state.endsAt && next.totalSec === state.totalSec && next.cart === state.cart) return;
  state = next;
  subs.forEach(f => f());
}

export function clearRoomBus() { openHub = null; setRoomBus(EMPTY); }

export function setHubOpener(f: (() => void) | null) { openHub = f; }
export function requestHub(): boolean { if (!openHub) return false; openHub(); return true; }

export function useRoomBus(): RoomBusState {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    () => state,
    () => EMPTY,
  );
}
