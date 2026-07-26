// ══════════════════════════════════════════════════════
// 📢 البث الجماعي — رسائل النوافذ المفتوحة (24 ساعة)
// ══════════════════════════════════════════════════════
// القرارات المعتمدة من المالك (2026-07-26):
//   • المستلمون: كل النوافذ المفتوحة + فلاتر جاهزة + استبعاد يدوي
//   • المتغيرات: {الاسم} {اسم_اللاعب} {الرتبة} {الفعالية}
//   • البث لا يوقف البوت — الدون يرد على الردود طبيعياً
//   • الوتيرة: رسالة كل ~ثانية (مع تفاوت بسيط) لحماية جودة الرقم
// المعتذرون (waOptouts) مستبعدون إجبارياً، والنافذة تُفحص لحظة إرسال كل رسالة.

import { eq, and, desc, gte, sql, isNull, inArray } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import {
  waConversations, waOptouts, waBroadcasts, waMessageTemplates, activities, bookings,
} from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { sendMessage } from './whatsapp-inbox.service.js';

const WINDOW_MS = 24 * 3600e3;
const RANK_AR: Record<string, string> = {
  INFORMANT: 'مُخبر', SOLDIER: 'جندي', CAPO: 'كابو', UNDERBOSS: 'ساعد الزعيم', GODFATHER: 'العرّاب',
};

function emitInbox(event: string, payload: any) {
  try {
    const io = (global as any).io;
    if (io) io.to('wa:inbox').emit(event, payload);
  } catch { /* السوكيت تكميلي */ }
}

// ── 🎮 فلترة باللعب (قرار المالك: الدفعتان معاً) ──
// النطاق: فعالية محددة أو آخر N ساعة · الشروط تتراكب بمنطق «و»
// «آخر مباراة له بالنطاق» هي مرجع الدور/النتيجة/الإقصاء المبكر
export interface GameFilter {
  activityId?: number;
  withinHours?: number;
  team?: 'MAFIA' | 'CITIZEN' | 'NEUTRAL';
  role?: string;
  result?: 'won' | 'lost';
  firstTimer?: boolean;   // أول مباراة بحياته كانت ضمن النطاق
  noShow?: boolean;       // حجز الفعالية وما لعب (يتطلب فعالية)
  earlyOut?: boolean;     // أُقصي بالجولة الأولى بآخر مباراة
  topScorer?: boolean;    // توب 3 نقاطاً (XP) بالنطاق
}

function gameFilterActive(g?: GameFilter | null): boolean {
  if (!g) return false;
  return !!(g.activityId || g.withinHours || g.team || g.role || g.result ||
    g.firstTimer || g.noShow || g.earlyOut || g.topScorer);
}

async function buildGameData(g: GameFilter) {
  const db = getDB();
  const { matches, matchPlayers, sessions } = await import('../schemas/game.schema.js');
  const { MAFIA_ROLES, NEUTRAL_ROLES, ROLE_NAMES_AR } = await import('../game/roles.js');

  // نطاق المباريات
  let matchRows: any[] = [];
  if (g.activityId) {
    matchRows = await db
      .select({ id: matches.id, winner: matches.winner, createdAt: matches.createdAt })
      .from(matches)
      .innerJoin(sessions, eq(matches.sessionId, sessions.id))
      .where(and(eq(sessions.activityId, g.activityId), isNull(matches.deletedAt)));
  } else {
    const cutoff = new Date(Date.now() - (g.withinHours || 24) * 3600e3);
    matchRows = await db
      .select({ id: matches.id, winner: matches.winner, createdAt: matches.createdAt })
      .from(matches)
      .where(and(gte(matches.createdAt, cutoff), isNull(matches.deletedAt)));
  }
  const matchById = new Map(matchRows.map((m: any) => [m.id, m]));
  const matchIds = matchRows.map((m: any) => m.id);

  const mps: any[] = matchIds.length
    ? await db
        .select({ matchId: matchPlayers.matchId, playerId: matchPlayers.playerId, role: matchPlayers.role, eliminatedAtRound: matchPlayers.eliminatedAtRound, xpEarned: matchPlayers.xpEarned })
        .from(matchPlayers)
        .where(inArray(matchPlayers.matchId, matchIds))
    : [];

  const teamOf = (role: string): 'MAFIA' | 'CITIZEN' | 'NEUTRAL' =>
    (MAFIA_ROLES as any[]).includes(role) ? 'MAFIA' : (NEUTRAL_ROLES as any[]).includes(role) ? 'NEUTRAL' : 'CITIZEN';
  const wonMatch = (mp: any): boolean => {
    const w = matchById.get(mp.matchId)?.winner;
    if (!w) return false;
    if (w === 'JESTER') return mp.role === 'JESTER';
    if (w === 'ASSASSIN') return mp.role === 'ASSASSIN';
    return teamOf(mp.role) === w;
  };

  // آخر مباراة لكل لاعب بالنطاق + مجموع نقاطه
  const lastMp = new Map<number, any>();
  const xpSum = new Map<number, number>();
  for (const mp of mps) {
    if (!mp.playerId) continue;
    const cur = lastMp.get(mp.playerId);
    const at = new Date(matchById.get(mp.matchId)?.createdAt || 0).getTime();
    if (!cur || at >= new Date(matchById.get(cur.matchId)?.createdAt || 0).getTime()) lastMp.set(mp.playerId, mp);
    xpSum.set(mp.playerId, (xpSum.get(mp.playerId) || 0) + Number(mp.xpEarned || 0));
  }
  const playedSet = new Set(lastMp.keys());

  // أول مباراة بالحياة ⊂ النطاق؟
  let firstTimerSet = new Set<number>();
  if (g.firstTimer && playedSet.size) {
    const hist: any[] = await db
      .select({ playerId: matchPlayers.playerId, matchId: matchPlayers.matchId, createdAt: matches.createdAt })
      .from(matchPlayers)
      .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
      .where(and(inArray(matchPlayers.playerId, Array.from(playedSet)), isNull(matches.deletedAt)));
    const firstEver = new Map<number, any>();
    for (const h of hist) {
      const cur = firstEver.get(h.playerId);
      if (!cur || new Date(h.createdAt).getTime() < new Date(cur.createdAt).getTime()) firstEver.set(h.playerId, h);
    }
    const scopeIds = new Set(matchIds);
    for (const [pid, h] of firstEver) if (scopeIds.has(h.matchId)) firstTimerSet.add(pid);
  }

  // حجزوا وما لعبوا (بالفعالية المحددة)
  const noShowPhones = new Set<string>();
  const noShowPlayerIds = new Set<number>();
  if (g.noShow && g.activityId) {
    const bks: any[] = await db
      .select({ phone: bookings.phone, playerId: bookings.playerId, checkedIn: bookings.checkedIn })
      .from(bookings)
      .where(and(eq(bookings.activityId, g.activityId), isNull(bookings.deletedAt)));
    const { reservations } = await import('../schemas/admin.schema.js');
    const rvs: any[] = await db
      .select({ phone: reservations.phone, playerId: reservations.playerId, attended: reservations.attended })
      .from(reservations)
      .where(and(eq(reservations.activityId, g.activityId), isNull(reservations.deletedAt)));
    for (const b of [...bks, ...rvs]) {
      const attended = (b as any).checkedIn === true || (b as any).attended === true;
      const played = b.playerId && playedSet.has(b.playerId);
      if (!attended && !played) {
        if (b.phone) noShowPhones.add(b.phone);
        if (b.playerId) noShowPlayerIds.add(b.playerId);
      }
    }
  }

  // توب 3 نقاطاً بالنطاق
  let topSet = new Set<number>();
  if (g.topScorer) {
    topSet = new Set(Array.from(xpSum.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([pid]) => pid));
  }

  return { lastMp, playedSet, firstTimerSet, noShowPhones, noShowPlayerIds, topSet, teamOf, wonMatch, ROLE_NAMES_AR };
}

// ── المستلمون: النوافذ المفتوحة الآن (مع بيانات التخصيص + فلترة اللعب) ──
export async function getOpenWindowRecipients(filters: { linked?: string; excludeAttention?: boolean; game?: GameFilter | null } = {}) {
  const db = getDB();
  const cutoff = new Date(Date.now() - WINDOW_MS);

  const rows = await db
    .select({
      id: waConversations.id,
      phone: waConversations.phone,
      displayName: waConversations.displayName,
      playerId: waConversations.playerId,
      lastInboundAt: waConversations.lastInboundAt,
      needsAttention: waConversations.needsAttention,
      botEnabled: waConversations.botEnabled,
      playerName: players.name,
      playerTier: players.rankTier,
    })
    .from(waConversations)
    .leftJoin(players, eq(waConversations.playerId, players.id))
    .leftJoin(waOptouts, eq(waConversations.phone, waOptouts.phone))
    .where(and(
      gte(waConversations.lastInboundAt, cutoff),
      isNull(waOptouts.id), // المعتذرون لا يظهرون أصلاً — استبعاد إجباري
    ))
    .orderBy(desc(waConversations.lastInboundAt));

  let out = rows;
  if (filters.linked === 'linked') out = out.filter((r: any) => r.playerId);
  if (filters.linked === 'unlinked') out = out.filter((r: any) => !r.playerId);
  if (filters.excludeAttention) out = out.filter((r: any) => !r.needsAttention);

  // 🎮 فلترة اللعب
  const lastRoleByConv = new Map<number, string>();
  if (gameFilterActive(filters.game)) {
    const g = filters.game as GameFilter;
    const gd = await buildGameData(g);
    out = out.filter((r: any) => {
      if (g.noShow) {
        // حجز وما لعب: بالهاتف أو الحساب — لا يشترط ربط الحساب
        return gd.noShowPhones.has(r.phone) || (r.playerId && gd.noShowPlayerIds.has(r.playerId));
      }
      if (!r.playerId) return false; // بقية فلاتر اللعب تحتاج حساباً مربوطاً
      const mp = gd.lastMp.get(r.playerId);
      if (!mp) return false; // ما لعب بالنطاق
      if (g.team && gd.teamOf(mp.role) !== g.team) return false;
      if (g.role && mp.role !== g.role) return false;
      if (g.result === 'won' && !gd.wonMatch(mp)) return false;
      if (g.result === 'lost' && gd.wonMatch(mp)) return false;
      if (g.firstTimer && !gd.firstTimerSet.has(r.playerId)) return false;
      if (g.earlyOut && mp.eliminatedAtRound !== 1) return false;
      if (g.topScorer && !gd.topSet.has(r.playerId)) return false;
      return true;
    });
    for (const r of out) {
      const mp = r.playerId ? gd.lastMp.get(r.playerId) : null;
      if (mp) lastRoleByConv.set(r.id, (gd.ROLE_NAMES_AR as any)[mp.role] || mp.role);
    }
  }

  return out.map((r: any) => ({
    id: r.id,
    phone: r.phone,
    displayName: r.displayName || r.playerName || r.phone,
    playerId: r.playerId,
    playerName: r.playerName || null,
    rankAr: r.playerTier ? (RANK_AR[r.playerTier] || r.playerTier) : null,
    lastRoleAr: lastRoleByConv.get(r.id) || null,
    needsAttention: !!r.needsAttention,
    minutesLeft: Math.max(0, Math.round((new Date(r.lastInboundAt).getTime() + WINDOW_MS - Date.now()) / 60000)),
  }));
}

// ── تعبئة المتغيرات لكل مستلم ──
export function renderBroadcastText(body: string, r: {
  displayName?: string | null; playerName?: string | null; rankAr?: string | null; lastRoleAr?: string | null;
}, activityName: string | null): string {
  const name = (r.displayName || r.playerName || '').trim().split(/\s+/)[0] || 'يا غالي';
  return body
    .replaceAll('{الاسم}', name)
    .replaceAll('{اسم_اللاعب}', r.playerName || name)
    .replaceAll('{الرتبة}', r.rankAr || 'عضو العائلة')
    .replaceAll('{آخر_دور}', r.lastRoleAr || 'لاعب')
    .replaceAll('{الفعالية}', activityName || 'فعاليتنا القادمة');
}

// أقرب فعالية قادمة — قيمة {الفعالية}
export async function nearestUpcomingActivityName(): Promise<string | null> {
  try {
    const db = getDB();
    const [act] = await db
      .select({ name: activities.name })
      .from(activities)
      .where(gte(activities.date, new Date() as any))
      .orderBy(activities.date)
      .limit(1);
    return act?.name || null;
  } catch {
    return null;
  }
}

// ── محرك التنفيذ ──
const stopFlags = new Set<number>();

export function stopBroadcast(id: number) {
  stopFlags.add(id);
}

export async function launchBroadcast(opts: {
  body: string;
  templateId?: number | null;
  conversationIds: number[];
  createdBy: string;
  recipientMeta?: Record<number, { lastRoleAr?: string }>; // بيانات {آخر_دور} من الفلترة
}): Promise<{ broadcastId: number; totalTargets: number }> {
  const db = getDB();
  const targets = Array.from(new Set(opts.conversationIds)).filter(Boolean);
  if (!targets.length) throw new Error('لا يوجد مستلمون محددون');
  if (!opts.body?.trim()) throw new Error('نص الرسالة فارغ');

  const [row] = await db.insert(waBroadcasts).values({
    body: opts.body.trim(),
    templateId: opts.templateId || null,
    totalTargets: targets.length,
    status: 'running',
    createdBy: opts.createdBy || '',
  } as any).returning();

  if (opts.templateId) {
    db.update(waMessageTemplates)
      .set({ usedCount: sql`${waMessageTemplates.usedCount} + 1`, updatedAt: new Date() } as any)
      .where(eq(waMessageTemplates.id, opts.templateId))
      .then(() => {}, () => {});
  }

  // تنفيذ بالخلفية — التقدم عبر السوكيت
  runBroadcast(row.id, opts.body.trim(), targets, opts.recipientMeta || {}).catch((err) =>
    console.error('❌ WA broadcast runner:', err.message));

  return { broadcastId: row.id, totalTargets: targets.length };
}

async function runBroadcast(broadcastId: number, body: string, conversationIds: number[], recipientMeta: Record<number, { lastRoleAr?: string }> = {}) {
  const db = getDB();
  const activityName = await nearestUpcomingActivityName();
  const cutoffMs = WINDOW_MS;
  let sent = 0, skipped = 0, failed = 0;

  for (let i = 0; i < conversationIds.length; i++) {
    if (stopFlags.has(broadcastId)) break;
    const convId = conversationIds[i];
    try {
      // إعادة فحص لحظة الإرسال: النافذة + الاعتذار (قد يتغيران بين المعاينة والإرسال)
      const [conv] = await db
        .select({
          id: waConversations.id, phone: waConversations.phone,
          displayName: waConversations.displayName, playerId: waConversations.playerId,
          lastInboundAt: waConversations.lastInboundAt,
        })
        .from(waConversations).where(eq(waConversations.id, convId)).limit(1);
      if (!conv || !conv.lastInboundAt || (Date.now() - new Date(conv.lastInboundAt).getTime()) > cutoffMs) {
        skipped++;
      } else {
        const [opt] = await db.select({ id: waOptouts.id }).from(waOptouts).where(eq(waOptouts.phone, conv.phone)).limit(1);
        if (opt) {
          skipped++;
        } else {
          let playerName: string | null = null, rankAr: string | null = null;
          if (conv.playerId) {
            const [p] = await db.select({ name: players.name, tier: players.rankTier }).from(players).where(eq(players.id, conv.playerId)).limit(1);
            playerName = p?.name || null;
            rankAr = p?.tier ? (RANK_AR[p.tier] || p.tier) : null;
          }
          const text = renderBroadcastText(body, { displayName: conv.displayName, playerName, rankAr, lastRoleAr: recipientMeta[convId]?.lastRoleAr || null }, activityName);
          // المصدر broadcast: يمر بالأنبوب الموحد ولا يوقف البوت (بخلاف staff)
          await sendMessage({ conversationId: convId, text, source: 'broadcast' });
          sent++;
        }
      }
    } catch (err: any) {
      failed++;
      console.warn(`⚠️ WA broadcast → conv ${convId}:`, err.message);
    }

    await db.update(waBroadcasts)
      .set({ sentCount: sent, skippedCount: skipped, failedCount: failed } as any)
      .where(eq(waBroadcasts.id, broadcastId));
    emitInbox('wa:broadcast:progress', {
      broadcastId, sent, skipped, failed,
      total: conversationIds.length, done: i + 1,
    });

    // الوتيرة المعتمدة: ~رسالة/ثانية مع تفاوت بسيط
    if (i < conversationIds.length - 1 && !stopFlags.has(broadcastId)) {
      await new Promise((res) => setTimeout(res, 900 + Math.floor(Math.random() * 400)));
    }
  }

  const stopped = stopFlags.has(broadcastId);
  stopFlags.delete(broadcastId);
  await db.update(waBroadcasts)
    .set({ sentCount: sent, skippedCount: skipped, failedCount: failed, status: stopped ? 'stopped' : 'done', finishedAt: new Date() } as any)
    .where(eq(waBroadcasts.id, broadcastId));
  emitInbox('wa:broadcast:progress', {
    broadcastId, sent, skipped, failed,
    total: conversationIds.length, done: conversationIds.length,
    finished: true, status: stopped ? 'stopped' : 'done',
  });
}

// ── السجل ──
export async function getBroadcastHistory(limit = 20) {
  const db = getDB();
  return db.select().from(waBroadcasts).orderBy(desc(waBroadcasts.id)).limit(limit);
}
