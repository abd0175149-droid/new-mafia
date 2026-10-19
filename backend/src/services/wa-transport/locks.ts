// ══════════════════════════════════════════════════════
// ⛔ قفل الإرسال — لكلّ قناة قفلها
// ══════════════════════════════════════════════════════
// كان قفلاً واحداً لميتا (wa_runtime_flags.sending_suspended). صار مفتاحاً لكلّ قناة:
// حظرُ ميتا لا يوقف رقم الأعمال، وحظرُ الجلسة لا يوقف ميتا.
//   sending_suspended:cloud — يضعه callWaApi وأحداث صحّة ميتا ومراقب الصحّة، أو WA_SUSPENDED
//   sending_suspended:web   — يضعه فصل الجلسة أو قيد tos_block أو تجمّدها
// كلاهما محفوظ في القاعدة (إعادة التشغيل لا ترفعه)، ويُرفع يدويّاً حصراً أو بقاعدة المراقب.

import { sql } from 'drizzle-orm';
import { getDB } from '../../config/db.js';
import { env } from '../../config/env.js';
import type { Channel } from './types.js';
import { transportSettings } from './settings.js';

const locks: Record<Channel, string | null> = { cloud: null, web: null };
const key = (ch: Channel) => `sending_suspended:${ch}`;

export function suspendSending(reason: string, channel: Channel = 'cloud'): void {
  locks[channel] = reason;
  console.warn(`⛔ WA[${channel}] sending suspended: ${reason}`);
  const db = getDB();
  if (db) db.execute(sql`INSERT INTO wa_runtime_flags (key, value, updated_at) VALUES (${key(channel)}, ${JSON.stringify({ reason, at: new Date().toISOString() })}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`).catch(() => {});
}

export async function resumeSending(channel: Channel = 'cloud'): Promise<void> {
  locks[channel] = null;
  const db = getDB();
  if (db) await db.execute(sql`DELETE FROM wa_runtime_flags WHERE key = ${key(channel)}`).catch(() => {});
  console.warn(`✅ WA[${channel}] sending resumed`);
}

export async function loadSendingSuspension(): Promise<void> {
  try {
    const db = getDB(); if (!db) return;
    // المفتاح القديم (قبل القناتين) يخصّ ميتا — يُنقل إن بقي
    await db.execute(sql`UPDATE wa_runtime_flags SET key = 'sending_suspended:cloud'
      WHERE key = 'sending_suspended' AND NOT EXISTS (SELECT 1 FROM wa_runtime_flags WHERE key = 'sending_suspended:cloud')`).catch(() => {});
    const r: any = await db.execute(sql`SELECT key, value FROM wa_runtime_flags WHERE key IN ('sending_suspended:cloud', 'sending_suspended:web')`);
    for (const row of (r?.rows ?? r ?? [])) {
      const ch = String(row.key).split(':')[1] as Channel;
      if (row.value?.reason && (ch === 'cloud' || ch === 'web')) {
        locks[ch] = String(row.value.reason);
        console.warn(`⛔ WA[${ch}] sending still suspended (persisted): ${locks[ch]}`);
      }
    }
  } catch { /* الجدول قد لا يكون موجوداً بعد */ }
}

/** سبب قفل قناة بعينها، أو null */
export function channelSuspendedReason(channel: Channel): string | null {
  if (channel === 'cloud' && env.WA_SUSPENDED) return 'إجراء إنفاذ قائم من ميتا (WA_SUSPENDED=1)';
  return locks[channel];
}

/** القنوات التي يُرسَل منها الجماعيّ في الوضع الحاليّ — أساس «هل الإرسال متوقّف كلّيّاً؟» */
function bulkChannels(): Channel[] {
  const m = transportSettings().mode;
  const webReady = !!(env.OPENWA_URL && env.OPENWA_API_KEY && env.OPENWA_SESSION_ID);
  if (m === 'cloud_only' || !webReady) return ['cloud'];
  if (m === 'web_final') return ['web'];
  return ['cloud', 'web'];
}

/**
 * بلا وسيط: سببٌ إن كان **كلّ** ما يُرسل منه الوضعُ الحاليّ مقفلاً، وإلّا null.
 * هكذا يتوقّف البثّ والجدولة حين لا قناة متاحة، ويستمرّان إن بقيت واحدة.
 * مع قناة: قفل تلك القناة وحدها.
 */
export function sendingSuspendedReason(channel?: Channel): string | null {
  if (channel) return channelSuspendedReason(channel);
  const reasons = bulkChannels().map(ch => channelSuspendedReason(ch));
  if (reasons.every(Boolean)) return reasons.length === 1 ? reasons[0] : reasons.map((r, i) => `${bulkChannels()[i] === 'cloud' ? 'ميتا' : 'الجلسة'}: ${r}`).join(' · ');
  return null;
}

/** حالة القفلين معاً — للواجهة */
export function allLocks(): Record<Channel, string | null> {
  return { cloud: channelSuspendedReason('cloud'), web: channelSuspendedReason('web') };
}
