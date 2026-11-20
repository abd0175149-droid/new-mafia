// ══════════════════════════════════════════════════════
// 🎴 تجهيز اللعبة v2 — الحوض، التوزيع، التثبيت، التبديل، المراجعة (منطقٌ نقيّ بلا مقابس)
//
// قرار المالك 2026-11-20 (الخطّة الموحّدة، المرحلة 2):
//   الطاولة ⟵ اللعبة والكروت ⟵ التوزيع والاعتماد. التوزيعُ يُحضَّر بطلبٍ واحد تحت قفل الغرفة
//   (setup:prepare-deal) بدل ستّة طلبات متتابعة، ويحترم المثبَّت. التبديلُ برقمين طلبٌ واحد.
//   كلّ تغييرٍ يُسقط «أُرسلت» ويرفع رقم النسخة، فلا يرسل جهازٌ توزيعاً لم يره.
//
// الدوالّ هنا تعدّل كائن الحالة في الذاكرة ولا تحفظ — المستدعي يحفظ تحت withRoomLock.
// ══════════════════════════════════════════════════════

import { Role, isMafiaRole, teamOfRole, validateRoleDistribution, ROLE_NAMES_AR } from './roles.js';
import { analyzeDuplicates, isAssassinMode } from './role-duplicates.js';
import { bindingDiff, exactIssues, sendableIssues, bumpBindingRev } from './role-binding.js';

const nameOf = (r: string) => (ROLE_NAMES_AR as Record<string, string>)[r] || r;

export interface PoolParams {
  roles: string[];
  assassinContractCount?: number;
  jesterSurviveRounds?: number;
  witchDisableRounds?: number;
  mayorVoteWeight?: number;
  phoenixRebirths?: number;
  confirmDuplicates?: boolean;
  supportsDuplicatePrompt?: boolean;
  assassinMode?: 'RIVALS' | 'PARTNERS';
}

export type Fail = { ok: false; code: string; error: string; duplicates?: any };

/** يتحقّق من الحوض ويكتب معاملاته في config — منطقُ setup:roles-confirmed نفسه. */
export function applyPoolRules(state: any, data: PoolParams): ({ ok: true; nightModeSwitched: boolean; duplicateRoles: boolean } | Fail) {
  const roles = Array.isArray(data.roles) ? data.roles : [];
  const aliveCount = state.players.filter((p: any) => p.isAlive !== false).length;
  const validation = validateRoleDistribution(roles as Role[], aliveCount);
  if (!validation.valid) return { ok: false, code: 'ROLE_COUNT', error: validation.error || 'عدد الكروت لا يطابق اللاعبين' };
  if (roles.some((r) => !(Object.values(Role) as string[]).includes(r))) return { ok: false, code: 'BAD_ROLE', error: 'كرتٌ غير معروف' };

  const dup = analyzeDuplicates(roles);
  if (dup.blocked.length) {
    return { ok: false, code: 'DUPLICATE_ROLES_BLOCKED', duplicates: dup,
      error: `كرتٌ لا يتكرّر: ${dup.blocked.map(d => `${nameOf(d.role)} (${d.reason})`).join(' · ')}` };
  }
  if (dup.allowed.length && state.config.isRemote) {
    return { ok: false, code: 'DUPLICATE_ROLES_REMOTE', duplicates: dup, error: 'الغرف عن بُعد لا تدعم الكروت المكرّرة' };
  }
  if (dup.allowed.length && !data.confirmDuplicates) {
    return { ok: false, code: 'DUPLICATE_ROLES', duplicates: dup,
      error: data.supportsDuplicatePrompt
        ? `في التوزيع كروتٌ مكرّرة: ${dup.allowed.map(d => `${nameOf(d.role)} ×${d.count}`).join(' · ')} — أكّدها`
        : 'في التوزيع كرتٌ مكرّر — حدّث صفحة الليدر (Ctrl+F5) ليظهر سؤال التأكيد' };
  }
  const c = state.config;
  c.duplicateRoles = dup.allowed.length > 0;
  let nightModeSwitched = false;
  if (c.duplicateRoles) {
    c.useDynamicEngine = true;
    if (c.nightMode === 'auto') { c.nightMode = 'manual'; nightModeSwitched = true; }
  }
  const assassinCount = roles.filter(r => r === 'ASSASSIN').length;
  if (assassinCount >= 2) c.assassinMode = isAssassinMode(data.assassinMode) ? data.assassinMode : 'RIVALS';
  else delete c.assassinMode;
  if (data.assassinContractCount !== undefined) c.assassinContractCount = Math.min(6, Math.max(2, Math.floor(Number(data.assassinContractCount)) || 3));
  if (data.jesterSurviveRounds !== undefined) c.jesterSurviveRounds = Math.min(5, Math.max(1, Math.floor(Number(data.jesterSurviveRounds)) || 3));
  if (data.witchDisableRounds !== undefined) c.witchDisableRounds = Math.min(6, Math.max(1, Math.floor(Number(data.witchDisableRounds)) || 3));
  if (data.mayorVoteWeight !== undefined) c.mayorVoteWeight = Math.min(4, Math.max(1, Math.floor(Number(data.mayorVoteWeight)) || 2));
  if (data.phoenixRebirths !== undefined) c.phoenixRebirths = Math.min(3, Math.max(1, Math.floor(Number(data.phoenixRebirths)) || 1));
  return { ok: true, nightModeSwitched, duplicateRoles: c.duplicateRoles };
}

/** المقاعد المثبّتة الصالحة: لاعبٌ حيّ دوره في الحوض. */
export function livePins(state: any): number[] {
  const pins: number[] = Array.isArray(state.dealPins) ? state.dealPins.map(Number) : [];
  const seats = new Set(state.players.filter((p: any) => p.isAlive !== false && p.role).map((p: any) => Number(p.physicalId)));
  return Array.from(new Set(pins.filter((s) => seats.has(s))));
}

/**
 * يوزّع ما ليس مثبّتاً عشوائيّاً (Fisher-Yates) مع حدّ «أقصى مافيا متتالية».
 * `lastRolesOf` يُمرَّر من المقبس (قراءة قاعدة البيانات) — بدونه لا قيد.
 * لا يكتب شيئاً إن لم يطابق الناتجُ الحوض تماماً.
 */
export async function dealRandom(
  state: any, lockedIds: number[],
  lastRolesOf?: (playerId: number, n: number) => Promise<string[]>,
): Promise<{ ok: true; locked: number; restricted: number; randomized: number } | Fail> {
  const pool = [...(state.rolesPool || [])];
  const alive = state.players.filter((p: any) => p.isAlive !== false);
  if (pool.length !== alive.length) {
    return { ok: false, code: 'ROLE_COUNT', error: `عدد الأدوار (${pool.length}) لا يطابق عدد اللاعبين (${alive.length})` };
  }
  const before = new Map(alive.map((p: any) => [p.physicalId, p.role]));
  const locked = alive.filter((p: any) => lockedIds.includes(p.physicalId) && p.role);
  const rest = alive.filter((p: any) => !locked.includes(p));
  const remaining = [...pool];
  for (const lp of [...locked]) {
    const i = remaining.indexOf(lp.role);
    if (i !== -1) remaining.splice(i, 1);
    else { locked.splice(locked.indexOf(lp), 1); rest.push(lp); }
  }
  const maxConsecutive = state.config.maxConsecutiveMafiaGames ?? 3;
  let restrictedIds: number[] = [];
  if (maxConsecutive > 0 && lastRolesOf) {
    for (const p of rest) {
      if (!p.playerId) continue;
      try {
        const last = await lastRolesOf(p.playerId, maxConsecutive);
        if (last.length >= maxConsecutive && last.every(r => isMafiaRole(r as Role))) restrictedIds.push(p.physicalId);
      } catch { /* قراءةٌ فاشلة ⇒ بلا قيد لهذا اللاعب */ }
    }
  }
  const maxRestricted = rest.length - remaining.filter(r => isMafiaRole(r as Role)).length;
  if (restrictedIds.length > maxRestricted) restrictedIds = restrictedIds.slice(0, Math.max(0, maxRestricted));
  const restricted = rest.filter((p: any) => restrictedIds.includes(p.physicalId));
  const free = rest.filter((p: any) => !restrictedIds.includes(p.physicalId));
  const bag = [...remaining];
  for (const p of rest) p.role = null;
  for (const p of restricted) {
    const k = bag.findIndex(r => !isMafiaRole(r as Role));
    if (k !== -1) { p.role = bag[k]; bag.splice(k, 1); }
  }
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  for (let i = 0; i < free.length; i++) free[i].role = bag[i] ?? null;
  const issue = exactIssues(bindingDiff(state));
  if (issue) {
    for (const p of alive) p.role = before.get(p.physicalId) ?? null;   // لا أثر لتوزيعٍ فاشل
    return { ok: false, code: 'ROLE_MISMATCH', error: issue };
  }
  return { ok: true, locked: locked.length, restricted: restricted.length, randomized: free.length };
}

/** كلّ تغييرٍ في التوزيع: يسقط «أُرسلت» ويرفع النسخة. */
export function touchDeal(state: any): number {
  if (state.rolesConfirmed) state.dealResendPending = true;   // 📱 الإرسال القادم «راجع بطاقتك»
  state.rolesConfirmed = false;
  return bumpBindingRev(state);
}

function seatOf(state: any, seat: number) {
  return state.players.find((p: any) => Number(p.physicalId) === Number(seat) && p.isAlive !== false);
}

/** ⇄ تبديل كرتَي مقعدين. المقعدان يصيران مثبّتين (نيّةٌ صريحة لا يمحوها «أعد الخلط»). */
export function swapSeatRoles(state: any, a: number, b: number): { ok: true } | Fail {
  if (a === b) return { ok: false, code: 'SAME_SEAT', error: 'اختر مقعدين مختلفين' };
  const pa = seatOf(state, a), pb = seatOf(state, b);
  if (!pa || !pb) return { ok: false, code: 'NO_SEAT', error: 'المقعد بلا لاعب' };
  if (!pa.role || !pb.role) return { ok: false, code: 'UNBOUND', error: 'وزّع الكروت أوّلاً' };
  [pa.role, pb.role] = [pb.role, pa.role];
  const pins = new Set(livePins(state)); pins.add(a); pins.add(b);
  state.dealPins = Array.from(pins);
  return { ok: true };
}

/** 📌 ثبّت `role` على `seat`: يبادل مع حاملٍ له غير مثبَّت (والمثبَّتُ آخراً). */
export function pinRoleToSeat(state: any, seat: number, role: string): { ok: true; swappedWith: number | null } | Fail {
  const p = seatOf(state, seat);
  if (!p) return { ok: false, code: 'NO_SEAT', error: 'المقعد بلا لاعب' };
  const pins = new Set(livePins(state));
  if (p.role === role) { pins.add(seat); state.dealPins = Array.from(pins); return { ok: true, swappedWith: null }; }
  if (!(state.rolesPool || []).includes(role)) return { ok: false, code: 'ROLE_NOT_IN_POOL', error: `«${nameOf(role)}» ليس في كروت هذه اللعبة — استعمل «غيّر كرته»` };
  const holders = state.players.filter((x: any) => x.isAlive !== false && x.role === role && Number(x.physicalId) !== Number(seat));
  const holder = holders.find((x: any) => !pins.has(Number(x.physicalId)));
  if (!holder) return { ok: false, code: 'ALL_PINNED', error: `كلّ نسخ «${nameOf(role)}» مثبّتة على مقاعد أخرى — فكّ أحدها أوّلاً` };
  [p.role, holder.role] = [holder.role, p.role];
  pins.add(seat);
  state.dealPins = Array.from(pins);
  return { ok: true, swappedWith: Number(holder.physicalId) };
}

/** ✏️ غيّر كرت مقعد إلى كرتٍ آخر — يتغيّر الحوض نفسه (قبل البدء فقط). */
export function changeSeatCard(state: any, seat: number, role: string): { ok: true; from: string } | Fail {
  const p = seatOf(state, seat);
  if (!p || !p.role) return { ok: false, code: 'NO_SEAT', error: 'المقعد بلا كرت' };
  if (!(Object.values(Role) as string[]).includes(role)) return { ok: false, code: 'BAD_ROLE', error: 'كرتٌ غير معروف' };
  if (p.role === role) return { ok: true, from: role };
  const pool: string[] = [...(state.rolesPool || [])];
  const i = pool.indexOf(p.role);
  if (i === -1) return { ok: false, code: 'ROLE_MISMATCH', error: 'التوزيع لا يطابق الحوض — أعد الخلط' };
  pool.splice(i, 1, role);
  const dup = analyzeDuplicates(pool);
  const bad = dup.blocked.find(d => d.role === role);
  if (bad) return { ok: false, code: 'DUPLICATE_ROLES_BLOCKED', error: `«${nameOf(role)}» لا يتكرّر — ${bad.reason}` };
  if (dup.allowed.some(d => d.role === role) && state.config.isRemote) return { ok: false, code: 'DUPLICATE_ROLES_REMOTE', error: 'الغرف عن بُعد لا تدعم الكروت المكرّرة' };
  const from = p.role;
  p.role = role;
  state.rolesPool = pool;
  state.config.duplicateRoles = dup.allowed.length > 0;
  if (state.config.duplicateRoles) { state.config.useDynamicEngine = true; if (state.config.nightMode === 'auto') state.config.nightMode = 'manual'; }
  if (pool.filter(r => r === 'ASSASSIN').length < 2) delete state.config.assassinMode;
  else if (!isAssassinMode(state.config.assassinMode)) state.config.assassinMode = 'RIVALS';
  const pins = new Set(livePins(state)); pins.add(seat); state.dealPins = Array.from(pins);
  return { ok: true, from };
}

/** 👥 العدّ الواحد للّاعبين (القرار: دالّةٌ واحدة يقرؤها اللوبي والتوزيع والاعتماد). */
export function rosterCounts(state: any, excluded: number[] = []) {
  const ex = new Set(excluded.map(Number));
  const players: any[] = state?.players || [];
  const seated = players.filter((p) => !p.seatHeld);
  const playing = seated.filter((p) => !p.frozen && p.isAlive !== false && !ex.has(Number(p.physicalId)));
  return {
    seated: seated.length,
    playing: playing.length,
    connected: playing.filter((p) => p.isConnected !== false).length,
    offline: playing.filter((p) => p.isConnected === false).map((p) => ({ seat: Number(p.physicalId), name: p.name })),
    held: players.filter((p) => p.seatHeld).length,
    frozen: seated.filter((p) => p.frozen).length,
    excluded: seated.filter((p) => ex.has(Number(p.physicalId))).length,
    spectators: (state?.spectators || []).length,
  };
}

/** 📋 الاعتماد الختاميّ — ما يراه الموجّه قبل «اعتمد وأرسل». */
export function dealReview(state: any) {
  const pool: string[] = state.rolesPool || [];
  const cnt = { mafia: 0, citizen: 0, neutral: 0 };
  for (const r of pool) { const t = teamOfRole(r); if (t === 'MAFIA') cnt.mafia++; else if (t === 'NEUTRAL') cnt.neutral++; else cnt.citizen++; }
  const dup = analyzeDuplicates(pool);
  const diff = bindingDiff(state);
  const pins = livePins(state).map((s) => ({ seat: s, role: seatOf(state, s)?.role || null, name: seatOf(state, s)?.name || '' }));
  const c = state.config || {};
  const roster = rosterCounts(state);
  return {
    rev: Number(state.bindingRev) || 0,
    sent: state.rolesConfirmed === true,
    total: pool.length,
    players: state.players.filter((p: any) => p.isAlive !== false).length,
    counts: cnt,
    duplicates: dup.allowed,
    blocked: dup.blocked,
    assassinMode: pool.filter(r => r === 'ASSASSIN').length >= 2 ? (c.assassinMode || 'RIVALS') : null,
    issue: exactIssues(diff),
    sendIssue: sendableIssues(diff),
    pins,
    offline: roster.offline,
    settings: {
      minutes: c.gameTimerEnabled === false ? 0 : (c.gameTimerMinutes || 60),
      penalties: c.maxPenalties ?? 3,
      nightKind: c.nightKind || 'one',
      nightSeconds: c.nightSeconds ?? 60,
      bomb: c.bombEnabled !== false,
      chat: c.mafiaChatEnabled === true,
      conf: c.confrontationEnabled === true,
      reveal: c.allowMafiaReveal !== false,
      contracts: pool.includes('ASSASSIN') ? (c.assassinContractCount ?? 3) : null,
      jesterRound: pool.includes('JESTER') ? (c.jesterSurviveRounds ?? 3) : null,
      mayor: pool.includes('MAYOR') ? (c.mayorVoteWeight ?? 2) : null,
      phoenix: pool.includes('PHOENIX') ? (c.phoenixRebirths ?? 1) : null,
      consec: c.maxConsecutiveMafiaGames ?? 3,
      lateEntry: c.lateEntry?.enabled ? c.lateEntry : null,
    },
  };
}

/** ↩ رجوعٌ من التوزيع: إلى «اللعبة والكروت» (الكروت تبقى) أو إلى الطاولة (يُمسح كلّ شيء). */
export function reopenDeck(state: any, to: 'cards' | 'lobby'): void {
  touchDeal(state);
  if (to === 'lobby') {
    for (const p of state.players) p.role = null;
    state.rolesPool = [];
    state.dealPins = [];
    state.phase = 'LOBBY';
  } else {
    state.phase = 'ROLE_GENERATION';
  }
}
