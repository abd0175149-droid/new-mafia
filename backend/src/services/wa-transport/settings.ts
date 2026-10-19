// ══════════════════════════════════════════════════════
// ⚙️ إعدادات القنوات — wa_runtime_flags.transport
// ══════════════════════════════════════════════════════
// تُقرأ متزامنةً من ذاكرةٍ مخبّأة (الموجِّه يُستدعى في كلّ إرسال)، وتُنعَّش من القاعدة
// كلّ ٣٠ ثانية وعند كلّ حفظ. الافتراضيّ cloud_only: النشر الأوّل لا يغيّر سلوكاً.

import { sql } from 'drizzle-orm';
import { getDB } from '../../config/db.js';
import { DEFAULT_TRANSPORT_SETTINGS, TRANSPORT_MODES, type TransportSettings } from './types.js';

let cached: TransportSettings = structuredClone(DEFAULT_TRANSPORT_SETTINGS);
let timer: NodeJS.Timeout | null = null;

const num = (v: any, d: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
};
const hhmm = (v: any, d: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : d);

/** يدمج قيمةً محفوظة (قد تكون جزئيّة أو قديمة) مع الافتراضيّ ويضبط الحدود */
export function normalizeSettings(raw: any): TransportSettings {
  const d = DEFAULT_TRANSPORT_SETTINGS;
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    mode: TRANSPORT_MODES.includes(r.mode) ? r.mode : d.mode,
    failover: {
      reply: typeof r.failover?.reply === 'boolean' ? r.failover.reply : d.failover.reply,
      timely: typeof r.failover?.timely === 'boolean' ? r.failover.timely : d.failover.timely,
      bulk: typeof r.failover?.bulk === 'boolean' ? r.failover.bulk : d.failover.bulk,
    },
    webBot: typeof r.webBot === 'boolean' ? r.webBot : d.webBot,
    bulk: {
      dailyCap: num(r.bulk?.dailyCap, d.bulk.dailyCap, 0, 5000),
      gapMinSec: num(r.bulk?.gapMinSec, d.bulk.gapMinSec, 1, 600),
      gapMaxSec: Math.max(num(r.bulk?.gapMinSec, d.bulk.gapMinSec, 1, 600), num(r.bulk?.gapMaxSec, d.bulk.gapMaxSec, 1, 900)),
      from: hhmm(r.bulk?.from, d.bulk.from),
      to: hhmm(r.bulk?.to, d.bulk.to),
    },
    timely: {
      gapMinSec: num(r.timely?.gapMinSec, d.timely.gapMinSec, 0, 120),
      gapMaxSec: Math.max(num(r.timely?.gapMinSec, d.timely.gapMinSec, 0, 120), num(r.timely?.gapMaxSec, d.timely.gapMaxSec, 0, 300)),
      serviceDailyCap: num(r.timely?.serviceDailyCap, d.timely.serviceDailyCap, 0, 5000),
    },
    cloudRedirect: {
      enabled: typeof r.cloudRedirect?.enabled === 'boolean' ? r.cloudRedirect.enabled : d.cloudRedirect.enabled,
      businessNumber: String(r.cloudRedirect?.businessNumber ?? d.cloudRedirect.businessNumber).replace(/[^\d+ ]/g, '').slice(0, 20),
      oncePerDay: typeof r.cloudRedirect?.oncePerDay === 'boolean' ? r.cloudRedirect.oncePerDay : d.cloudRedirect.oncePerDay,
    },
    outreach: {
      direct: typeof r.outreach?.direct === 'boolean' ? r.outreach.direct : d.outreach.direct,
      cohortFreqDays: num(r.outreach?.cohortFreqDays, d.outreach.cohortFreqDays, 0, 60),
    },
    followupMaxAgeHours: num(r.followupMaxAgeHours, d.followupMaxAgeHours, 1, 24 * 30),
  };
}

/** القيمة الحاليّة (متزامنة، من الذاكرة) */
export function transportSettings(): TransportSettings {
  return cached;
}

export async function loadTransportSettings(): Promise<TransportSettings> {
  try {
    const db = getDB();
    if (!db) return cached;
    const r: any = await db.execute(sql`SELECT value FROM wa_runtime_flags WHERE key = 'transport' LIMIT 1`);
    const v = (r?.rows ?? r ?? [])[0]?.value;
    cached = normalizeSettings(v);
  } catch { /* الجدول قد لا يكون موجوداً بعد — نبقى على المخبّأ */ }
  return cached;
}

export async function saveTransportSettings(patch: Partial<TransportSettings>): Promise<TransportSettings> {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  const merged = normalizeSettings({
    ...cached, ...patch,
    failover: { ...cached.failover, ...(patch.failover || {}) },
    bulk: { ...cached.bulk, ...(patch.bulk || {}) },
    timely: { ...cached.timely, ...(patch.timely || {}) },
    cloudRedirect: { ...cached.cloudRedirect, ...(patch.cloudRedirect || {}) },
    outreach: { ...cached.outreach, ...(patch.outreach || {}) },
  });
  await db.execute(sql`INSERT INTO wa_runtime_flags (key, value, updated_at) VALUES ('transport', ${JSON.stringify(merged)}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`);
  cached = merged;
  return cached;
}

export function startTransportSettingsRefresh(): void {
  if (timer) return;
  void loadTransportSettings();
  timer = setInterval(() => { void loadTransportSettings(); }, 30_000);
  timer.unref?.();
}

/** للاختبارات وحدها */
export function __setTransportSettingsForTest(s: Partial<TransportSettings>): void {
  cached = normalizeSettings({ ...DEFAULT_TRANSPORT_SETTINGS, ...s });
}
