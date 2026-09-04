// ══════════════════════════════════════════════════════
// 🤝 أوزان التقارب الاجتماعيّ + قواعد أزواج المقاعد
// ══════════════════════════════════════════════════════
// يبني الخريطة التي يقرؤها SOCIAL_AFFINITY_SEPARATION من إشاراتٍ موجودة
// أصلاً في القاعدة، بلا أيّ إدخالٍ يدويّ من الليدر.
//
// قرار المالك المقفل (2026-09-04): **الوصول المتزامن أثقل الإشارات** — مصدره
// session_players.joined_at (موجود، ولا يُصفَّر عند عودة اللاعب لأنّ الترقية
// تمسّ الاسم والهاتف فقط)، والاستعلام الدفعيّ يضمّ الجدول أصلاً فالكلفة عمود
// إضافيّ لا استعلامٌ إضافيّ.
// ══════════════════════════════════════════════════════

import { getDB } from '../config/db.js';
import { sql } from 'drizzle-orm';
import {
  AFFINITY_WEIGHTS,
  SIMULTANEOUS_ARRIVAL_WINDOW_MS,
} from '../game/seating/constraints/social-affinity.constraint.js';
import { personKey, pairKey, normalizeSeatPhone } from '../game/seating/types.js';

export interface AffinityPerson {
  playerId: number | null;
  phone: string | null;
  name: string;
  physicalId?: number;
}

/** يُبقي أعلى وزنٍ لكلّ زوج (لا يجمع الإشارات كي لا يتضخّم الوزن فوق 1) */
function put(map: Map<string, number>, a: string, b: string, weight: number) {
  if (a === b) return;
  const k = pairKey(a, b);
  const cur = map.get(k) ?? 0;
  if (weight > cur) map.set(k, weight);
}

function rowsOf(res: any): any[] {
  return (res?.rows ?? res ?? []) as any[];
}

/**
 * يبني أوزان التقارب لمجموعة الحاضرين في غرفةٍ واحدة.
 * لا يرمي أبداً: أيّ استعلامٍ يفشل يُتخطّى وتبقى بقيّة الإشارات عاملة.
 */
export async function buildAffinityPairs(params: {
  sessionId?: number;
  activityId?: number;
  people: AffinityPerson[];
}): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const { sessionId, activityId, people } = params;
  if (!people || people.length < 2) return map;

  const db = getDB();
  if (!db) return map;

  const withAccounts = people.filter(p => p.playerId);
  const idList = withAccounts.map(p => Number(p.playerId)).filter(Number.isFinite);
  const keyById = new Map<number, string>();
  for (const p of withAccounts) keyById.set(Number(p.playerId), personKey(p));

  // ── 1️⃣ الوصول المتزامن (الأثقل) — من session_players.joined_at ──
  if (sessionId) {
    try {
      const res = await db.execute(sql`
        SELECT physical_id, player_id, phone, player_name,
               EXTRACT(EPOCH FROM joined_at) * 1000 AS joined_ms
        FROM session_players
        WHERE session_id = ${sessionId}
      `);
      const arrivals = rowsOf(res)
        .map(r => ({
          key: personKey({
            playerId: r.player_id ? Number(r.player_id) : null,
            phone: r.phone,
            name: r.player_name,
          }),
          at: Number(r.joined_ms) || 0,
        }))
        .filter(a => a.at > 0)
        .sort((a, b) => a.at - b.at);

      // نافذة منزلقة: كلّ زوجٍ يقع داخل ٩٠ ثانية من بعضه
      for (let i = 0; i < arrivals.length; i++) {
        for (let j = i + 1; j < arrivals.length; j++) {
          if (arrivals[j].at - arrivals[i].at > SIMULTANEOUS_ARRIVAL_WINDOW_MS) break;
          put(map, arrivals[i].key, arrivals[j].key, AFFINITY_WEIGHTS.SIMULTANEOUS_ARRIVAL);
        }
      }
    } catch (e: any) {
      console.warn('⚠️ affinity: simultaneous-arrival signal skipped:', e.message);
    }
  }

  // ── 2️⃣ الحجز الجماعيّ — حجزٌ واحد بعدّة أشخاص، أو مرافقون مسجّلون ──
  if (activityId) {
    try {
      const res = await db.execute(sql`
        SELECT phone, people_count
        FROM reservations
        WHERE activity_id = ${activityId} AND people_count > 1 AND status = 'confirmed'
      `);
      // صاحبُ حجزٍ جماعيّ: كلّ الواصلين بهاتفه أو باسمه يُعدّون مجموعةً واحدة.
      // ما دام المرافقون بلا هويّة (booking_members لا يُكتب) فالإشارة تقتصر على
      // صاحب الحجز نفسه — تبقى معلَّقة حتّى C4، ولا تُنتج إيجابيّات كاذبة.
      const groupPhones = new Set(
        rowsOf(res).map(r => normalizeSeatPhone(r.phone)).filter(Boolean),
      );
      if (groupPhones.size > 0) {
        const members = people.filter(p => groupPhones.has(normalizeSeatPhone(p.phone)));
        for (let i = 0; i < members.length; i++)
          for (let j = i + 1; j < members.length; j++)
            put(map, personKey(members[i]), personKey(members[j]), AFFINITY_WEIGHTS.GROUP_BOOKING);
      }
    } catch (e: any) {
      console.warn('⚠️ affinity: group-booking signal skipped:', e.message);
    }
  }

  if (idList.length >= 2) {
    const ids = idList.join(',');

    // ── 3️⃣ المتابعة (متبادلة أثقل من أحاديّة) ──
    try {
      const res = await db.execute(sql.raw(`
        SELECT follower_id, following_id FROM player_follows
        WHERE follower_id IN (${ids}) AND following_id IN (${ids})
      `));
      const edges = new Set<string>();
      for (const r of rowsOf(res)) edges.add(`${r.follower_id}>${r.following_id}`);
      for (const r of rowsOf(res)) {
        const a = Number(r.follower_id), b = Number(r.following_id);
        const ka = keyById.get(a), kb = keyById.get(b);
        if (!ka || !kb) continue;
        const mutual = edges.has(`${b}>${a}`);
        put(map, ka, kb, mutual ? AFFINITY_WEIGHTS.MUTUAL_FOLLOW : AFFINITY_WEIGHTS.ONE_WAY_FOLLOW);
      }
    } catch (e: any) {
      console.warn('⚠️ affinity: follow signal skipped:', e.message);
    }

    // ── 4️⃣ التجاور المتكرّر في آخر عشر مباريات لكلّ لاعب ──
    try {
      const res = await db.execute(sql.raw(`
        WITH recent AS (
          SELECT mp.match_id, mp.player_id, mp.physical_id, m.player_count,
                 ROW_NUMBER() OVER (PARTITION BY mp.player_id ORDER BY mp.match_id DESC) AS rn
          FROM match_players mp
          JOIN matches m ON m.id = mp.match_id
          WHERE mp.player_id IN (${ids})
        ), win AS (SELECT * FROM recent WHERE rn <= 10)
        SELECT a.player_id AS a_id, b.player_id AS b_id, COUNT(*) AS times
        FROM win a
        JOIN win b ON a.match_id = b.match_id AND a.player_id < b.player_id
        WHERE a.physical_id IS NOT NULL AND b.physical_id IS NOT NULL
          AND (
            ABS(a.physical_id - b.physical_id) = 1
            OR ABS(a.physical_id - b.physical_id) = COALESCE(NULLIF(a.player_count, 0), 0) - 1
          )
        GROUP BY a.player_id, b.player_id
        HAVING COUNT(*) >= 2
      `));
      for (const r of rowsOf(res)) {
        const ka = keyById.get(Number(r.a_id)), kb = keyById.get(Number(r.b_id));
        if (ka && kb) put(map, ka, kb, AFFINITY_WEIGHTS.REPEATED_ADJACENCY);
      }
    } catch (e: any) {
      console.warn('⚠️ affinity: repeated-adjacency signal skipped:', e.message);
    }
  }

  return map;
}

// ══════════════════════════════════════════════════════
// 📏 قواعد الأزواج المسجَّلة (blocked_pairs + seat_pair_rules)
// ══════════════════════════════════════════════════════

export interface PairRule {
  kind: 'block' | 'separate' | 'affinity';
  personA: string;
  personB: string;
  nameA?: string;
  nameB?: string;
  weight: number;
  scope: 'global' | 'activity' | 'room';
}

/**
 * يجلب قواعد الأزواج السارية على هذه الغرفة: العالميّة + قواعد هذه الفعاليّة
 * + قواعد هذه الغرفة، بعد إسقاط ما انتهت مدّته.
 */
export async function loadPairRules(params: {
  activityId?: number;
  roomId?: string;
}): Promise<PairRule[]> {
  const db = getDB();
  if (!db) return [];
  const out: PairRule[] = [];

  try {
    const res = await db.execute(sql`
      SELECT kind, person_a, person_b, name_a, name_b, weight, scope
      FROM seat_pair_rules
      WHERE (expires_at IS NULL OR expires_at > NOW())
        AND (
          scope = 'global'
          OR (scope = 'activity' AND activity_id = ${params.activityId ?? -1})
          OR (scope = 'room' AND room_id = ${params.roomId ?? ''})
        )
    `);
    for (const r of rowsOf(res)) {
      out.push({
        kind: (r.kind || 'separate') as PairRule['kind'],
        personA: r.person_a,
        personB: r.person_b,
        nameA: r.name_a || undefined,
        nameB: r.name_b || undefined,
        weight: Number(r.weight ?? 1),
        scope: (r.scope || 'global') as PairRule['scope'],
      });
    }
  } catch (e: any) {
    // الجدول قد لا يكون أُنشئ بعد على قاعدةٍ قديمة — لا يُسقط الانضمام
    console.warn('⚠️ loadPairRules skipped:', e.message);
  }

  return out;
}

/** يسجّل قاعدة زوج (upsert على النطاق نفسه) */
export async function upsertPairRule(rule: {
  kind: 'block' | 'separate' | 'affinity';
  personA: string;
  personB: string;
  nameA?: string;
  nameB?: string;
  weight?: number;
  scope: 'global' | 'activity' | 'room';
  activityId?: number | null;
  roomId?: string | null;
  source?: string;
  reason?: string;
  createdBy?: number | null;
  expiresAt?: Date | null;
}): Promise<boolean> {
  const db = getDB();
  if (!db) return false;
  try {
    await db.execute(sql`
      INSERT INTO seat_pair_rules
        (kind, person_a, person_b, name_a, name_b, weight, scope, activity_id, room_id, source, reason, created_by, expires_at)
      VALUES (${rule.kind}, ${rule.personA}, ${rule.personB}, ${rule.nameA ?? null}, ${rule.nameB ?? null},
              ${rule.weight ?? 1}, ${rule.scope}, ${rule.activityId ?? null}, ${rule.roomId ?? null},
              ${rule.source ?? 'leader'}, ${rule.reason ?? null}, ${rule.createdBy ?? null}, ${rule.expiresAt ?? null})
      ON CONFLICT (LEAST(person_a, person_b), GREATEST(person_a, person_b), scope,
                   COALESCE(activity_id, 0), COALESCE(room_id, ''))
      DO UPDATE SET kind = EXCLUDED.kind, weight = EXCLUDED.weight,
                    expires_at = EXCLUDED.expires_at, reason = EXCLUDED.reason,
                    name_a = EXCLUDED.name_a, name_b = EXCLUDED.name_b
    `);
    return true;
  } catch (e: any) {
    console.error('❌ upsertPairRule failed:', e.message);
    return false;
  }
}

/** يدمج قواعد الأزواج في خريطة الأوزان (القواعد المسجَّلة تتفوّق على المشتقّة) */
export function mergeRulesIntoAffinity(map: Map<string, number>, rules: PairRule[]): Map<string, number> {
  for (const r of rules) {
    if (r.kind === 'block') continue; // الصارمة تذهب إلى NO_ADJACENT_PAIRS لا هنا
    const k = pairKey(r.personA, r.personB);
    map.set(k, Math.max(map.get(k) ?? 0, r.weight)); // المسجَّل يفوز صعوداً
  }
  return map;
}
