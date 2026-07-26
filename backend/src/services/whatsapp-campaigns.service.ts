// ══════════════════════════════════════════════════════
// 📣 محرك الحملات — شرائح + موزّع ذكي + عزو الحجوزات
// ══════════════════════════════════════════════════════
// قرارات المالك المعتمدة (2026-07-26):
//   • سقف الإزعاج: لا رسالة تسويقية لنفس الرقم أكثر من مرة كل 7 أيام
//   • عزو الحجز للحملة: خلال 24 ساعة من وصول الرسالة
//   • ردود الحملات يستقبلها الدون طبيعياً (القالب لا يوقف البوت)
//   • الحساب غير موثق ⇒ سقف ميتا اليومي 250 محادثة يبدؤها العمل —
//     الموزّع يرسل حتى السقف ويكمل تلقائياً بعد انفراج النافذة
// المستلمون يُجمَّدون وقت الإنشاء (شريحة + استبعادات) بقيم متغيرات محلولة.

import { eq, and, desc, gte, lt, sql, isNull, inArray } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import {
  waCampaigns, waCampaignRecipients, waOptouts, waTemplates, activities, bookings,
} from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { sendTemplateMessage, notifyAdmins } from './whatsapp-inbox.service.js';

const FREQ_CAP_DAYS = 7;          // قرار المالك — سقف الإزعاج
const ATTRIBUTION_HOURS = 24;     // قرار المالك — نافذة عزو الحجز
const DAILY_CAP = 250;            // سقف ميتا للحساب غير الموثق (يرتفع بالتوثيق)
const SEND_INTERVAL_MS = 1100;    // ~رسالة/ثانية
const CAP_RECHECK_MS = 30 * 60e3; // إعادة فحص نافذة السقف كل 30 دقيقة

const RANK_ORDER = ['INFORMANT', 'SOLDIER', 'CAPO', 'UNDERBOSS', 'GODFATHER'];
const RANK_AR: Record<string, string> = {
  INFORMANT: 'مُخبر', SOLDIER: 'جندي', CAPO: 'كابو', UNDERBOSS: 'ساعد الزعيم', GODFATHER: 'العرّاب',
};

function emitInbox(event: string, payload: any) {
  try {
    const io = (global as any).io;
    if (io) io.to('wa:inbox').emit(event, payload);
  } catch { /* السوكيت تكميلي */ }
}

// ══════════════════════════════════════════════════════
// الشرائح — من بيانات اللاعبين الحقيقية
// ══════════════════════════════════════════════════════

export interface SegmentDef {
  type: 'all' | 'rank_min' | 'new_players' | 'lapsed';
  rankMin?: string;        // rank_min: الرتبة فأعلى
  days?: number;           // new_players: سُجّل خلال N يوم · lapsed: لم يلعب منذ N يوم
}

async function buildSegment(seg: SegmentDef): Promise<Array<{ phone: string; name: string; playerId: number; rankTier: string }>> {
  const db = getDB();
  const rows = await db
    .select({ id: players.id, name: players.name, phone: players.phone, rankTier: players.rankTier, createdAt: players.createdAt })
    .from(players);

  const { normalizeLocalPhone } = await import('../utils/phone.util.js');
  let list = rows
    .map((p: any) => ({ ...p, phone: normalizeLocalPhone(p.phone) }))
    .filter((p: any) => p.phone); // أرقام صالحة فقط

  if (seg.type === 'rank_min' && seg.rankMin) {
    const minIdx = RANK_ORDER.indexOf(seg.rankMin);
    if (minIdx >= 0) list = list.filter((p: any) => RANK_ORDER.indexOf(p.rankTier || 'INFORMANT') >= minIdx);
  } else if (seg.type === 'new_players') {
    const cutoff = new Date(Date.now() - (seg.days || 30) * 86400e3);
    list = list.filter((p: any) => p.createdAt && new Date(p.createdAt) > cutoff);
  } else if (seg.type === 'lapsed') {
    // الغائبون: آخر مباراة لهم أقدم من N يوم (أو لم يلعبوا قط)
    const cutoff = new Date(Date.now() - (seg.days || 30) * 86400e3);
    const { matchPlayers, matches } = await import('../schemas/game.schema.js');
    const recent = await db
      .select({ playerId: matchPlayers.playerId })
      .from(matchPlayers)
      .leftJoin(matches, eq(matchPlayers.matchId, matches.id))
      .where(gte(matches.createdAt, cutoff));
    const activeIds = new Set(recent.map((r: any) => r.playerId).filter(Boolean));
    list = list.filter((p: any) => !activeIds.has(p.id));
  }

  // إزالة التكرار بالهاتف
  const seen = new Set<string>();
  return list.filter((p: any) => {
    if (seen.has(p.phone)) return false;
    seen.add(p.phone);
    return true;
  }).map((p: any) => ({ phone: p.phone, name: p.name || '', playerId: p.id, rankTier: p.rankTier || 'INFORMANT' }));
}

// الاستبعادات الإجبارية: المعتذرون + سقف الإزعاج (7 أيام)
async function applyExclusions(list: Array<{ phone: string; name: string; playerId: number; rankTier: string }>) {
  const db = getDB();
  const optouts = await db.select({ phone: waOptouts.phone }).from(waOptouts);
  const optSet = new Set(optouts.map((o: any) => o.phone));

  const freqCutoff = new Date(Date.now() - FREQ_CAP_DAYS * 86400e3);
  const recentlySent = await db
    .select({ phone: waCampaignRecipients.phone })
    .from(waCampaignRecipients)
    .where(gte(waCampaignRecipients.sentAt, freqCutoff));
  const freqSet = new Set(recentlySent.map((r: any) => r.phone));

  let excludedOptout = 0, excludedFreq = 0;
  const kept = list.filter((p) => {
    if (optSet.has(p.phone)) { excludedOptout++; return false; }
    if (freqSet.has(p.phone)) { excludedFreq++; return false; }
    return true;
  });
  return { kept, excludedOptout, excludedFreq };
}

export async function previewSegment(seg: SegmentDef) {
  const base = await buildSegment(seg);
  const { kept, excludedOptout, excludedFreq } = await applyExclusions(base);
  return {
    total: kept.length,
    excludedOptout,
    excludedFreq,
    dailyCap: DAILY_CAP,
    days: Math.max(1, Math.ceil(kept.length / DAILY_CAP)),
    sample: kept.slice(0, 5).map((p) => ({ name: p.name, phone: p.phone, rank: RANK_AR[p.rankTier] || p.rankTier })),
  };
}

// ══════════════════════════════════════════════════════
// حل المتغيرات — وقت الإنشاء (قيم مجمّدة لكل مستلم)
// ══════════════════════════════════════════════════════

export interface VarMap { type: 'static' | 'field'; value: string }

async function resolveVars(mapping: VarMap[], p: { phone: string; name: string; rankTier: string }, activityName: string | null): Promise<string[]> {
  return mapping.map((m) => {
    if (m.type === 'static') return m.value || '';
    switch (m.value) {
      case 'firstName': return (p.name || '').trim().split(/\s+/)[0] || 'يا غالي';
      case 'fullName': return p.name || 'عضو العائلة';
      case 'rank': return RANK_AR[p.rankTier] || 'عضو العائلة';
      case 'nextActivity': return activityName || 'فعاليتنا القادمة';
      default: return '';
    }
  });
}

function renderPreview(bodyText: string, vars: string[]): string {
  let t = bodyText;
  vars.forEach((v, i) => { t = t.replaceAll(`{{${i + 1}}}`, v); });
  return t;
}

// ══════════════════════════════════════════════════════
// إنشاء الحملة + الموزّع الذكي
// ══════════════════════════════════════════════════════

const runners = new Map<number, boolean>(); // حارس: لا مشغّلين متوازيين لنفس الحملة

export async function createCampaign(input: {
  name: string;
  templateName: string;
  varMapping: VarMap[];
  segment: SegmentDef;
  createdBy: string;
}): Promise<any> {
  const db = getDB();
  if (!input.name?.trim()) throw new Error('اسم الحملة مطلوب');

  const [tpl] = await db.select().from(waTemplates).where(eq(waTemplates.name, input.templateName)).limit(1);
  if (!tpl) throw new Error('القالب غير موجود — زامن القوالب أولاً');
  if (tpl.status !== 'APPROVED') throw new Error(`القالب «${tpl.name}» غير معتمد (حالته: ${tpl.status}) — لا يمكن الإرسال به`);
  const bodyText = ((tpl.components as any[]) || []).find((c: any) => c.type === 'BODY')?.text || '';
  const varCount = Math.max(0, ...(bodyText.match(/\{\{\d+\}\}/g) || []).map((s: string) => parseInt(s.replace(/\D/g, ''))));
  if ((input.varMapping || []).length < varCount) throw new Error(`القالب يحتاج ${varCount} متغيراً — أكمل ربط المتغيرات`);

  const base = await buildSegment(input.segment);
  const { kept } = await applyExclusions(base);
  if (!kept.length) throw new Error('الشريحة فارغة بعد الاستبعادات — لا يوجد مستلمون');

  // أقرب فعالية قادمة — لقيمة {الفعالية}
  let activityName: string | null = null;
  try {
    const [act] = await db.select({ name: activities.name }).from(activities)
      .where(gte(activities.date, new Date() as any)).orderBy(activities.date).limit(1);
    activityName = act?.name || null;
  } catch { /* تكميلي */ }

  const [camp] = await db.insert(waCampaigns).values({
    name: input.name.trim().slice(0, 150),
    templateName: tpl.name,
    templateLanguage: tpl.language || 'ar',
    varMapping: input.varMapping || [],
    segment: input.segment,
    totalTargets: kept.length,
    status: 'running',
    createdBy: input.createdBy || '',
  } as any).returning();

  // تجميد المستلمين بقيم متغيرات محلولة
  for (let i = 0; i < kept.length; i += 200) {
    const chunk = kept.slice(i, i + 200);
    const values = await Promise.all(chunk.map(async (p) => ({
      campaignId: camp.id,
      phone: p.phone,
      name: p.name,
      playerId: p.playerId,
      vars: await resolveVars(input.varMapping || [], p, activityName),
      status: 'pending',
    })));
    await db.insert(waCampaignRecipients).values(values as any);
  }

  runCampaign(camp.id).catch((err) => console.error('❌ campaign runner:', err.message));
  return camp;
}

// كم رقماً فريداً بدأنا معه محادثة (قالب) خلال آخر 24 ساعة — لحساب سقف ميتا
async function usedDailyCap(): Promise<number> {
  const db = getDB();
  const cutoff = new Date(Date.now() - 24 * 3600e3);
  const rows = await db
    .select({ phone: waCampaignRecipients.phone })
    .from(waCampaignRecipients)
    .where(gte(waCampaignRecipients.sentAt, cutoff));
  return new Set(rows.map((r: any) => r.phone)).size;
}

export async function runCampaign(campaignId: number): Promise<void> {
  if (runners.get(campaignId)) return;
  runners.set(campaignId, true);
  const db = getDB();

  try {
    for (;;) {
      const [camp] = await db.select().from(waCampaigns).where(eq(waCampaigns.id, campaignId)).limit(1);
      if (!camp || camp.status !== 'running') break;

      // سقف ميتا اليومي — الموزّع الذكي
      const used = await usedDailyCap();
      if (used >= DAILY_CAP) {
        emitInbox('wa:campaign:progress', { campaignId, waitingCap: true, used, cap: DAILY_CAP });
        await new Promise((res) => setTimeout(res, CAP_RECHECK_MS));
        continue;
      }

      const [next] = await db.select().from(waCampaignRecipients)
        .where(and(eq(waCampaignRecipients.campaignId, campaignId), eq(waCampaignRecipients.status, 'pending')))
        .orderBy(waCampaignRecipients.id).limit(1);
      if (!next) {
        await db.update(waCampaigns).set({ status: 'done', finishedAt: new Date() } as any).where(eq(waCampaigns.id, campaignId));
        emitInbox('wa:campaign:progress', { campaignId, finished: true });
        notifyAdmins('📣 اكتملت الحملة', `«${camp.name}» — أُرسلت ${camp.sentCount + 0} من ${camp.totalTargets}`, { url: '/admin/whatsapp' }).catch(() => {});
        break;
      }

      // فحص الاعتذار لحظة الإرسال (قد ينضم للقائمة بين الإنشاء والإرسال)
      const [opt] = await db.select({ id: waOptouts.id }).from(waOptouts).where(eq(waOptouts.phone, next.phone)).limit(1);
      if (opt) {
        await db.update(waCampaignRecipients).set({ status: 'skipped', error: 'معتذر عن الرسائل' } as any).where(eq(waCampaignRecipients.id, next.id));
        await db.update(waCampaigns).set({ skippedCount: sql`${waCampaigns.skippedCount} + 1` } as any).where(eq(waCampaigns.id, campaignId));
      } else {
        try {
          const [tpl] = await db.select().from(waTemplates).where(eq(waTemplates.name, camp.templateName)).limit(1);
          const bodyText = ((tpl?.components as any[]) || []).find((c: any) => c.type === 'BODY')?.text || '';
          const vars: string[] = (next.vars as any[]) || [];
          const { wamid } = await sendTemplateMessage({
            phone: next.phone,
            templateName: camp.templateName,
            language: camp.templateLanguage || 'ar',
            bodyParams: vars,
            previewText: renderPreview(bodyText, vars) || `📋 ${camp.templateName}`,
          });
          await db.update(waCampaignRecipients)
            .set({ status: 'sent', wamid, sentAt: new Date() } as any)
            .where(eq(waCampaignRecipients.id, next.id));
          await db.update(waCampaigns).set({ sentCount: sql`${waCampaigns.sentCount} + 1` } as any).where(eq(waCampaigns.id, campaignId));
        } catch (err: any) {
          await db.update(waCampaignRecipients)
            .set({ status: 'failed', error: String(err.message || '').slice(0, 300) } as any)
            .where(eq(waCampaignRecipients.id, next.id));
          await db.update(waCampaigns).set({ failedCount: sql`${waCampaigns.failedCount} + 1` } as any).where(eq(waCampaigns.id, campaignId));
        }
      }

      const [fresh] = await db.select().from(waCampaigns).where(eq(waCampaigns.id, campaignId)).limit(1);
      emitInbox('wa:campaign:progress', {
        campaignId,
        sent: fresh?.sentCount || 0, failed: fresh?.failedCount || 0, skipped: fresh?.skippedCount || 0,
        total: fresh?.totalTargets || 0,
      });

      await new Promise((res) => setTimeout(res, SEND_INTERVAL_MS));
    }
  } finally {
    runners.delete(campaignId);
  }
}

// استئناف الحملات الجارية بعد إعادة تشغيل الخادم
export async function resumeRunningCampaigns(): Promise<void> {
  try {
    const db = getDB();
    if (!db) return;
    const running = await db.select({ id: waCampaigns.id }).from(waCampaigns).where(eq(waCampaigns.status, 'running'));
    for (const c of running) {
      runCampaign(c.id).catch((err) => console.error('❌ campaign resume:', err.message));
      console.log(`📣 استئناف الحملة #${c.id} بعد الإقلاع`);
    }
  } catch (err: any) {
    console.warn('⚠️ resumeRunningCampaigns:', err.message);
  }
}

export async function setCampaignStatus(id: number, status: 'running' | 'paused' | 'stopped'): Promise<void> {
  const db = getDB();
  const patch: any = { status };
  if (status === 'stopped') patch.finishedAt = new Date();
  await db.update(waCampaigns).set(patch).where(eq(waCampaigns.id, id));
  if (status === 'running') runCampaign(id).catch(() => {});
}

// ══════════════════════════════════════════════════════
// الخطافات: حالات التسليم + الردود + عزو الحجوزات (24 ساعة)
// ══════════════════════════════════════════════════════

export async function onCampaignStatusUpdate(wamid: string, status: string, error: string): Promise<void> {
  if (!wamid) return;
  const db = getDB();
  const [r] = await db.select().from(waCampaignRecipients).where(eq(waCampaignRecipients.wamid, wamid)).limit(1);
  if (!r) return;
  if (status === 'delivered' && r.status === 'sent') {
    await db.update(waCampaignRecipients).set({ status: 'delivered' } as any).where(eq(waCampaignRecipients.id, r.id));
    await db.update(waCampaigns).set({ deliveredCount: sql`${waCampaigns.deliveredCount} + 1` } as any).where(eq(waCampaigns.id, r.campaignId));
  } else if (status === 'read' && ['sent', 'delivered'].includes(r.status)) {
    const patch: any = { status: 'read' };
    await db.update(waCampaignRecipients).set(patch).where(eq(waCampaignRecipients.id, r.id));
    const inc: any = { readCount: sql`${waCampaigns.readCount} + 1` };
    if (r.status === 'sent') inc.deliveredCount = sql`${waCampaigns.deliveredCount} + 1`; // قُرئت دون حدث وصول منفصل
    await db.update(waCampaigns).set(inc).where(eq(waCampaigns.id, r.campaignId));
  } else if (status === 'failed') {
    await db.update(waCampaignRecipients).set({ status: 'failed', error } as any).where(eq(waCampaignRecipients.id, r.id));
    await db.update(waCampaigns).set({ failedCount: sql`${waCampaigns.failedCount} + 1` } as any).where(eq(waCampaigns.id, r.campaignId));
  }
}

export async function onCampaignReply(phone: string): Promise<void> {
  const db = getDB();
  const cutoff = new Date(Date.now() - FREQ_CAP_DAYS * 86400e3);
  const [r] = await db.select().from(waCampaignRecipients)
    .where(and(
      eq(waCampaignRecipients.phone, phone),
      gte(waCampaignRecipients.sentAt, cutoff),
      isNull(waCampaignRecipients.repliedAt),
    ))
    .orderBy(desc(waCampaignRecipients.sentAt)).limit(1);
  if (!r) return;
  await db.update(waCampaignRecipients).set({ repliedAt: new Date() } as any).where(eq(waCampaignRecipients.id, r.id));
  await db.update(waCampaigns).set({ repliedCount: sql`${waCampaigns.repliedCount} + 1` } as any).where(eq(waCampaigns.id, r.campaignId));
}

// العزو: حجز (متابعة أو تطبيق) خلال 24 ساعة من الإرسال — يُحسب عند فتح المراقبة
export async function computeConversions(campaignId: number): Promise<void> {
  const db = getDB();
  const recips = await db.select().from(waCampaignRecipients)
    .where(and(eq(waCampaignRecipients.campaignId, campaignId), isNull(waCampaignRecipients.convertedAt)));
  if (!recips.length) return;
  const { reservations } = await import('../schemas/admin.schema.js');
  let newConv = 0;
  for (const r of recips) {
    if (!r.sentAt) continue;
    const winEnd = new Date(new Date(r.sentAt).getTime() + ATTRIBUTION_HOURS * 3600e3);
    const [resv] = await db.select({ id: reservations.id }).from(reservations)
      .where(and(eq(reservations.phone, r.phone), gte(reservations.createdAt, r.sentAt), lt(reservations.createdAt, winEnd)))
      .limit(1);
    let hit = !!resv;
    if (!hit) {
      const [bk] = await db.select({ id: bookings.id }).from(bookings)
        .where(and(eq(bookings.phone, r.phone), gte(bookings.createdAt, r.sentAt), lt(bookings.createdAt, winEnd)))
        .limit(1);
      hit = !!bk;
    }
    if (hit) {
      await db.update(waCampaignRecipients).set({ convertedAt: new Date() } as any).where(eq(waCampaignRecipients.id, r.id));
      newConv++;
    }
  }
  if (newConv) {
    await db.update(waCampaigns).set({ convertedCount: sql`${waCampaigns.convertedCount} + ${newConv}` } as any).where(eq(waCampaigns.id, campaignId));
  }
}

export async function listCampaigns(): Promise<any[]> {
  const db = getDB();
  const list = await db.select().from(waCampaigns).orderBy(desc(waCampaigns.id)).limit(30);
  for (const c of list.filter((x: any) => x.sentCount > 0)) {
    try { await computeConversions(c.id); } catch { /* تكميلي */ }
  }
  return db.select().from(waCampaigns).orderBy(desc(waCampaigns.id)).limit(30);
}

export async function campaignDetails(id: number): Promise<any> {
  const db = getDB();
  await computeConversions(id).catch(() => {});
  const [camp] = await db.select().from(waCampaigns).where(eq(waCampaigns.id, id)).limit(1);
  if (!camp) throw new Error('الحملة غير موجودة');
  const recipients = await db.select().from(waCampaignRecipients)
    .where(eq(waCampaignRecipients.campaignId, id))
    .orderBy(waCampaignRecipients.id).limit(500);
  return { campaign: camp, recipients, dailyCap: DAILY_CAP };
}
