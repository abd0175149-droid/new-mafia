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
  waConversations, waOptouts, waBroadcasts, waMessageTemplates, activities,
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

// ── المستلمون: النوافذ المفتوحة الآن (مع بيانات التخصيص) ──
export async function getOpenWindowRecipients(filters: { linked?: string; excludeAttention?: boolean } = {}) {
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

  return out.map((r: any) => ({
    id: r.id,
    phone: r.phone,
    displayName: r.displayName || r.playerName || r.phone,
    playerId: r.playerId,
    playerName: r.playerName || null,
    rankAr: r.playerTier ? (RANK_AR[r.playerTier] || r.playerTier) : null,
    needsAttention: !!r.needsAttention,
    minutesLeft: Math.max(0, Math.round((new Date(r.lastInboundAt).getTime() + WINDOW_MS - Date.now()) / 60000)),
  }));
}

// ── تعبئة المتغيرات لكل مستلم ──
export function renderBroadcastText(body: string, r: {
  displayName?: string | null; playerName?: string | null; rankAr?: string | null;
}, activityName: string | null): string {
  const name = (r.displayName || r.playerName || '').trim().split(/\s+/)[0] || 'يا غالي';
  return body
    .replaceAll('{الاسم}', name)
    .replaceAll('{اسم_اللاعب}', r.playerName || name)
    .replaceAll('{الرتبة}', r.rankAr || 'عضو العائلة')
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
  runBroadcast(row.id, opts.body.trim(), targets).catch((err) =>
    console.error('❌ WA broadcast runner:', err.message));

  return { broadcastId: row.id, totalTargets: targets.length };
}

async function runBroadcast(broadcastId: number, body: string, conversationIds: number[]) {
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
          const text = renderBroadcastText(body, { displayName: conv.displayName, playerName, rankAr }, activityName);
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
