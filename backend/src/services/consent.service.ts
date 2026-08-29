// ══════════════════════════════════════════════════════
// 🔐 الموافقة — التحقّق والتسجيل
//
// 🔴 الحالةُ تُحسب على الخادم لا على العميل: بوّابةٌ تقرّرها الواجهة وحدها
//    يتجاوزها مَن يعرف كيف. والخادمُ يرفض الخدمة لغير الموافق أصلاً.
//
// 🔴 والموافقةُ تُربط بنسخةٍ منشورة: «وافق» بلا معرفة ما وافق عليه لا قيمة له.
//    تغيُّرُ نسخةٍ جوهريّاً يُبطل الموافقة السابقة ويُعيد البوّابة.
// ══════════════════════════════════════════════════════

import { and, desc, eq, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { players } from '../schemas/player.schema.js';
import { playerConsents, policyVersions } from '../schemas/consent.schema.js';

export const CONSENT_KINDS = ['privacy', 'terms'] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

/** سنُّ الأهليّة الكاملة — دونها يلزم وليُّ أمر (قانون ٢٤/٢٠٢٣) */
export const ADULT_AGE = 18;

export interface ConsentStatus {
  required: boolean;
  isMinor: boolean;
  needsGuardian: boolean;
  /** الوثائقُ التي تنقص موافقةً على نسختها المنشورة */
  missing: { kind: ConsentKind; version: string; title: string; changeSummary: string; isUpdate: boolean }[];
  current: { kind: ConsentKind; version: string; grantedAt: string | null }[];
}

/** العمرُ بالسنوات من نصّ تاريخ الميلاد، أو null إن كان غيرَ صالح */
export function ageFromDob(dob: unknown): number | null {
  const s = String(dob ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  const before = now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d);
  if (before) age--;
  return age >= 0 && age < 120 ? age : null;
}

/** أحدثُ نسخةٍ منشورة من كلّ وثيقة */
export async function publishedVersions() {
  const db = getDB();
  if (!db) return [] as any[];
  const rows = await db.select()
    .from(policyVersions)
    .where(sql`${policyVersions.publishedAt} IS NOT NULL`)
    .orderBy(desc(policyVersions.publishedAt));
  const latest = new Map<string, any>();
  for (const r of rows) if (!latest.has(r.kind)) latest.set(r.kind, r);
  return [...latest.values()];
}

/** ما الذي ينقص هذا اللاعب من موافقات */
export async function consentStatus(playerId: number): Promise<ConsentStatus> {
  const db = getDB();
  const empty: ConsentStatus = { required: false, isMinor: false, needsGuardian: false, missing: [], current: [] };
  if (!db) return empty;

  const [p] = await db.select({ dob: players.dob }).from(players).where(eq(players.id, playerId)).limit(1);
  const age = ageFromDob(p?.dob);
  const isMinor = age != null && age < ADULT_AGE;

  const pubs = await publishedVersions();
  if (!pubs.length) return { ...empty, isMinor };   // لا نصَّ منشورٌ ⇒ لا حجب

  const granted = await db.select()
    .from(playerConsents)
    .where(eq(playerConsents.playerId, playerId))
    .orderBy(desc(playerConsents.createdAt));

  const missing: ConsentStatus['missing'] = [];
  const current: ConsentStatus['current'] = [];
  let needsGuardian = false;

  for (const doc of pubs) {
    // آخرُ فعلٍ لهذه الوثيقة بهذه النسخة
    const last = granted.find(g => g.kind === doc.kind && g.version === doc.version);
    const ok = last?.action === 'granted';
    if (ok) {
      current.push({ kind: doc.kind, version: doc.version, grantedAt: last!.createdAt?.toISOString?.() ?? null });
      if (isMinor && doc.kind === 'privacy' && !last!.guardianPhone) needsGuardian = true;
    } else {
      const hadOlder = granted.some(g => g.kind === doc.kind && g.action === 'granted');
      missing.push({
        kind: doc.kind, version: doc.version, title: doc.title,
        changeSummary: doc.changeSummary ?? '',
        isUpdate: hadOlder,
      });
      if (isMinor && doc.kind === 'privacy') needsGuardian = true;
    }
  }

  return { required: missing.length > 0 || needsGuardian, isMinor, needsGuardian, missing, current };
}

/** تسجيلُ موافقةٍ أو سحبها */
export async function recordConsent(opts: {
  playerId: number; kind: ConsentKind; version: string;
  action: 'granted' | 'withdrawn'; platform?: string;
  guardianPhone?: string | null; guardianName?: string | null; guardianRelation?: string | null;
}): Promise<void> {
  const db = getDB();
  if (!db) return;
  await db.insert(playerConsents).values({
    playerId: opts.playerId,
    kind: opts.kind,
    version: opts.version,
    action: opts.action,
    platform: (opts.platform ?? 'web').slice(0, 10),
    guardianPhone: opts.guardianPhone?.slice(0, 20) ?? null,
    guardianName: opts.guardianName?.slice(0, 100) ?? null,
    guardianRelation: opts.guardianRelation?.slice(0, 30) ?? null,
  } as any);
}

/** هل يجوز خدمةُ هذا اللاعب؟ يُستدعى من الوسيط الحارس */
export async function hasAllConsents(playerId: number): Promise<boolean> {
  const st = await consentStatus(playerId);
  return !st.required;
}
