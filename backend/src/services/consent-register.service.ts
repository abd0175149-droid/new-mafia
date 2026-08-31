// ══════════════════════════════════════════════════════
// ⚖️ سجلّ الموافقات — Consent Register (قانون ٢٤ لسنة ٢٠٢٣)
//
// استعلامٌ حيٌّ واحد يُجيب: من وافق، ومتى، وعلى أيّ نسخة، وبأيّ منصّة —
// ومَن **لعب ولم يوافق**، وهو السؤال الذي لم يكن أحدٌ يسأله.
//
// 🔴 عرضٌ فقط (قرار المالك 2026-08-31): لا يكتب شيئاً ولا يغيّر حالة موافقة.
//    الصفحة نافذةٌ على الانكشاف، والمعالجةُ قرارٌ لاحق.
//
// 🔴 القاصرون: **وسمٌ وتنبيه فقط** (قرار المالك) — لا حجب ولا إلزام هنا.
//
// 🔴 والسجلّ يُضاف إليه ولا يُعدَّل: الموافقةُ والسحبُ صفّان مستقلّان في
//    player_consents لا تحديثٌ لصفّ. لذلك يصلح دليلاً أمام جهةٍ رقابيّة،
//    ونصُّ كلّ نسخةٍ محفوظٌ في policy_versions لا في ملفّ — فيُعرَض ما وافق
//    عليه اللاعب فعلاً لا ما تقوله السياسة اليوم.
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import type { Database } from '../config/db.js';

export const ADULT_AGE = 18;

export type ConsentStatusKey =
  | 'complete'          // وافق على كلّ النسخ المنشورة
  | 'partial'           // وافق على بعضها
  | 'withdrawn'         // آخرُ فعلٍ له سحب
  | 'played_no_consent' // لعب ولا موافقة — الانكشاف الفعليّ
  | 'never_asked';      // لا موافقة ولا لعب

export interface ConsentTrailRow {
  at: string; kind: string; version: string; action: string;
  platform: string | null;
  guardianName: string | null; guardianPhone: string | null; guardianRelation: string | null;
}

export interface ConsentPlayer {
  id: number; name: string; phone: string;
  dob: string | null; age: number | null; ageKnown: boolean; isMinor: boolean;
  createdAt: string; lastActiveAt: string | null;
  privacyVersion: string | null; privacyAt: string | null; privacyPlatform: string | null;
  termsVersion: string | null; termsAt: string | null; termsPlatform: string | null;
  guardianName: string | null; guardianPhone: string | null; guardianRelation: string | null;
  guardianMissing: boolean;          // قاصرٌ وافق بلا وليّ أمر
  matches: number; activities: number;
  status: ConsentStatusKey;
  deletionStatus: string | null; deletionDueAt: string | null;
  trail: ConsentTrailRow[];
}

export interface ConsentTotals {
  players: number; complete: number; partial: number; withdrawn: number;
  playedNoConsent: number; neverAsked: number;
  minors: number; minorsConsented: number; guardianMissing: number; ageUnknown: number;
  trailRows: number; withDeletionRequest: number;
  completeRate: number;
}

export interface PublishedDoc {
  kind: string; version: string; title: string;
  publishedAt: string | null; requiresReconsent: boolean; grantedCount: number;
}

export interface ConsentLens {
  q?: string; status?: string; flag?: string; platform?: string;
  from?: string | null; to?: string | null;
}

export interface ConsentResult {
  generatedAt: string; tookMs: number;
  published: PublishedDoc[];
  totals: ConsentTotals;
  players: ConsentPlayer[];
}

const asDate = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export async function consentRegister(db: Database, raw: ConsentLens = {}): Promise<ConsentResult> {
  const t0 = Date.now();
  const from = asDate(raw.from), to = asDate(raw.to);

  // ── النسخ المنشورة: الأحدثُ نشراً لكلّ وثيقة ──
  const pubRes: any = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (kind) kind, version, title, published_at, requires_reconsent
      FROM policy_versions WHERE published_at IS NOT NULL
      ORDER BY kind, published_at DESC
    )
    SELECT l.kind, l.version, l.title,
           to_char(l.published_at,'YYYY-MM-DD"T"HH24:MI:SS') AS "publishedAt",
           COALESCE(l.requires_reconsent,false) AS "requiresReconsent",
           (SELECT COUNT(DISTINCT c.player_id)::int FROM player_consents c
            WHERE c.kind = l.kind AND c.version = l.version AND c.action = 'granted') AS "grantedCount"
      FROM latest l ORDER BY l.kind`);
  const published: PublishedDoc[] = (pubRes.rows ?? pubRes) as any;

  const res: any = await db.execute(sql`
    WITH pub AS (
      SELECT DISTINCT ON (kind) kind, version
      FROM policy_versions WHERE published_at IS NOT NULL
      ORDER BY kind, published_at DESC
    ),
    -- آخرُ فعلٍ لكلّ (لاعب، وثيقة) على النسخة المنشورة — الترتيبُ يحسم لا الوجود
    last_act AS (
      SELECT DISTINCT ON (c.player_id, c.kind)
             c.player_id, c.kind, c.version, c.action, c.platform,
             c.guardian_name, c.guardian_phone, c.guardian_relation, c.created_at
      FROM player_consents c
      JOIN pub ON pub.kind = c.kind AND pub.version = c.version
      ORDER BY c.player_id, c.kind, c.created_at DESC
    ),
    played AS (
      SELECT mp.player_id AS pid,
             COUNT(DISTINCT mp.match_id)::int AS matches,
             COUNT(DISTINCT s.activity_id)::int AS activities
      FROM match_players mp
      JOIN matches m ON m.id = mp.match_id AND m.deleted_at IS NULL
      LEFT JOIN sessions s ON s.id = m.session_id
      WHERE mp.player_id IS NOT NULL
      GROUP BY mp.player_id
    ),
    del AS (
      SELECT DISTINCT ON (player_id) player_id, status,
             to_char(due_at,'YYYY-MM-DD') AS due_at
      FROM deletion_requests ORDER BY player_id, requested_at DESC
    )
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.matches DESC NULLS LAST, t.id), '[]'::json) AS payload
    FROM (
      SELECT
        p.id, BTRIM(p.name) AS name, p.phone,
        NULLIF(BTRIM(p.dob),'') AS dob,
        CASE WHEN p.dob ~ '^\\d{4}-\\d{2}-\\d{2}$'
             THEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob::date))::int END AS age,
        to_char(p.created_at,'YYYY-MM-DD') AS "createdAt",
        to_char(p.last_active_at,'YYYY-MM-DD') AS "lastActiveAt",

        pv.version AS "privacyVersion",
        to_char(pv.created_at,'YYYY-MM-DD"T"HH24:MI:SS') AS "privacyAt",
        pv.platform AS "privacyPlatform", pv.action AS "privacyAction",
        tv.version AS "termsVersion",
        to_char(tv.created_at,'YYYY-MM-DD"T"HH24:MI:SS') AS "termsAt",
        tv.platform AS "termsPlatform", tv.action AS "termsAction",

        NULLIF(BTRIM(pv.guardian_name),'')     AS "guardianName",
        NULLIF(BTRIM(pv.guardian_phone),'')    AS "guardianPhone",
        NULLIF(BTRIM(pv.guardian_relation),'') AS "guardianRelation",

        COALESCE(pl.matches,0) AS matches,
        COALESCE(pl.activities,0) AS activities,
        d.status AS "deletionStatus", d.due_at AS "deletionDueAt",

        COALESCE((
          SELECT json_agg(json_build_object(
            'at', to_char(c.created_at,'YYYY-MM-DD"T"HH24:MI:SS'),
            'kind', c.kind, 'version', c.version, 'action', c.action,
            'platform', c.platform,
            'guardianName', NULLIF(BTRIM(c.guardian_name),''),
            'guardianPhone', NULLIF(BTRIM(c.guardian_phone),''),
            'guardianRelation', NULLIF(BTRIM(c.guardian_relation),'')
          ) ORDER BY c.created_at)
          FROM player_consents c WHERE c.player_id = p.id), '[]'::json) AS trail
      FROM players p
      LEFT JOIN last_act pv ON pv.player_id = p.id AND pv.kind = 'privacy'
      LEFT JOIN last_act tv ON tv.player_id = p.id AND tv.kind = 'terms'
      LEFT JOIN played  pl ON pl.pid = p.id
      LEFT JOIN del     d  ON d.player_id = p.id
    ) t`);

  const rows: any[] = ((res.rows ? res.rows[0]?.payload : res[0]?.payload) || []) as any;
  const kinds = published.map((d) => d.kind);

  const all: ConsentPlayer[] = rows.map((r) => {
    const age: number | null = r.age ?? null;
    const isMinor = age != null && age < ADULT_AGE;
    const grantedKinds = kinds.filter((k) =>
      (k === 'privacy' ? r.privacyAction : k === 'terms' ? r.termsAction : null) === 'granted');
    const anyWithdrawn = kinds.some((k) =>
      (k === 'privacy' ? r.privacyAction : k === 'terms' ? r.termsAction : null) === 'withdrawn');

    let status: ConsentStatusKey;
    if (anyWithdrawn) status = 'withdrawn';
    else if (kinds.length && grantedKinds.length === kinds.length) status = 'complete';
    else if (grantedKinds.length > 0) status = 'partial';
    else if (r.matches > 0) status = 'played_no_consent';
    else status = 'never_asked';

    return {
      id: r.id, name: r.name, phone: r.phone,
      dob: r.dob ?? null, age, ageKnown: age != null, isMinor,
      createdAt: r.createdAt, lastActiveAt: r.lastActiveAt ?? null,
      privacyVersion: r.privacyAction === 'granted' ? r.privacyVersion : null,
      privacyAt: r.privacyAction === 'granted' ? r.privacyAt : null,
      privacyPlatform: r.privacyPlatform ?? null,
      termsVersion: r.termsAction === 'granted' ? r.termsVersion : null,
      termsAt: r.termsAction === 'granted' ? r.termsAt : null,
      termsPlatform: r.termsPlatform ?? null,
      guardianName: r.guardianName ?? null, guardianPhone: r.guardianPhone ?? null,
      guardianRelation: r.guardianRelation ?? null,
      // وليٌّ ناقص = قاصرٌ **وافق** بلا وليّ. من لم يوافق أصلاً ليس نقصاً بل غياباً.
      guardianMissing: isMinor && grantedKinds.includes('privacy') && !r.guardianPhone,
      matches: r.matches, activities: r.activities,
      status,
      deletionStatus: r.deletionStatus ?? null, deletionDueAt: r.deletionDueAt ?? null,
      trail: (r.trail || []) as ConsentTrailRow[],
    };
  });

  const players = filterPlayers(all, raw, from, to);
  return {
    generatedAt: new Date().toISOString(),
    tookMs: Date.now() - t0,
    published,
    totals: computeTotals(players),
    players,
  };
}

function filterPlayers(a: ConsentPlayer[], l: ConsentLens, from: string | null, to: string | null): ConsentPlayer[] {
  const q = String(l.q ?? '').trim().toLowerCase();
  return a.filter((p) => {
    if (l.status && l.status !== 'all' && p.status !== l.status) return false;
    if (l.flag === 'minor' && !p.isMinor) return false;
    if (l.flag === 'ageUnknown' && p.ageKnown) return false;
    if (l.flag === 'guardianMissing' && !p.guardianMissing) return false;
    if (l.flag === 'deletion' && !p.deletionStatus) return false;
    if (l.platform && l.platform !== 'all'
        && p.privacyPlatform !== l.platform && p.termsPlatform !== l.platform) return false;
    // نطاقُ التاريخ على **تاريخ الموافقة** — من لا موافقةَ له يسقط منه بطبيعته
    if (from || to) {
      const at = (p.privacyAt || p.termsAt || '').slice(0, 10);
      if (!at) return false;
      if (from && at < from) return false;
      if (to && at > to) return false;
    }
    if (q && !(p.name.toLowerCase().includes(q) || String(p.phone).includes(q))) return false;
    return true;
  });
}

export function computeTotals(a: ConsentPlayer[]): ConsentTotals {
  const by = (s: ConsentStatusKey) => a.filter((p) => p.status === s).length;
  const complete = by('complete');
  return {
    players: a.length,
    complete, partial: by('partial'), withdrawn: by('withdrawn'),
    playedNoConsent: by('played_no_consent'), neverAsked: by('never_asked'),
    minors: a.filter((p) => p.isMinor).length,
    minorsConsented: a.filter((p) => p.isMinor && p.status === 'complete').length,
    guardianMissing: a.filter((p) => p.guardianMissing).length,
    ageUnknown: a.filter((p) => !p.ageKnown).length,
    trailRows: a.reduce((s, p) => s + p.trail.length, 0),
    withDeletionRequest: a.filter((p) => p.deletionStatus).length,
    completeRate: a.length ? Math.round((complete / a.length) * 1000) / 10 : 0,
  };
}

export const STATUS_LABELS: Record<ConsentStatusKey, string> = {
  complete: 'مكتملة',
  partial: 'ناقصة',
  withdrawn: 'مسحوبة',
  played_no_consent: 'لعب بلا موافقة',
  never_asked: 'لم يُسأل بعد',
};
