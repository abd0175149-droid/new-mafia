// ══════════════════════════════════════════════════════
// 🩺 صحّة جلسة رقم الأعمال — الحالة، الحارس، الويبهوك، الإنذار
// ══════════════════════════════════════════════════════
// درسان من WB web: «ready» قد تكون جلسةً متجمّدة ⇒ فحصٌ حقيقيّ (contacts/check على رقمنا) كلّ دقيقتين؛
// والإنذار عبر FCM لا واتساب، لأنّ تنبيه واتساب يموت مع العطل نفسه.
//
// الأقفال (sending_suspended:web):
//   • الجلسة غير مربوطة (LOGOUT/UNPAIRED/إعادة ربط)  ⟵ يُرفع تلقائيّاً متى عادت جاهزة وفحصها سليم
//   • قيد tos_block من واتساب                         ⟵ يدويّ حصراً (قرارٌ بشريّ كقيود ميتا)
//   • reachout_timelock                               ⟵ يوقف الجماعيّ وحده حتّى expiresAt (لا قفل)

import { sql } from 'drizzle-orm';
import { getDB } from '../../config/db.js';
import { env } from '../../config/env.js';
import * as gw from './openwa.client.js';
import { webConfigured, setWebReady } from './router.js';
import { suspendSending, resumeSending, channelSuspendedReason } from './locks.js';

const UNLINKED_PREFIX = 'رقم الأعمال غير مربوط';
const WEBHOOK_EVENTS = [
  'message.received', 'message.sent', 'message.ack', 'message.failed', 'message.reaction', 'message.revoked',
  'session.status', 'session.disconnected', 'session.restriction', 'session.reconnect_loop', 'session.authenticated',
];

export interface WebHealth {
  configured: boolean;
  status: string;                 // ready | qr_ready | disconnected | … | unreachable
  phone: string | null;
  pushName: string | null;
  linked: boolean;
  ready: boolean;                 // جاهزة + آخر فحص حقيقيّ سليم
  lastProbeAt: string | null;
  lastProbeOk: boolean | null;
  probeFailStreak: number;
  lastEventAt: string | null;
  lastEvent: string | null;
  disconnectReason: string | null;
  restriction: { kind: string; code?: string; expiresAt: string | null } | null;
  webhook: { ok: boolean; error?: string; at: string } | null;
  locked: string | null;
  checkedAt: string;
}

const state: WebHealth = {
  configured: false, status: 'unknown', phone: null, pushName: null, linked: false, ready: false,
  lastProbeAt: null, lastProbeOk: null, probeFailStreak: 0, lastEventAt: null, lastEvent: null,
  disconnectReason: null, restriction: null, webhook: null, locked: null, checkedAt: new Date().toISOString(),
};
let timer: NodeJS.Timeout | null = null;
let lastRestartAt = 0;
let lastSig = '';

export function getWebHealth(): WebHealth {
  return { ...state, configured: webConfigured(), locked: channelSuspendedReason('web') };
}

/** الجماعيّ موقوفٌ مؤقّتاً بقيد reachout_timelock؟ */
export function bulkPausedUntil(): number {
  const r = state.restriction;
  if (!r || r.kind !== 'reachout_timelock') return 0;
  const t = r.expiresAt ? new Date(r.expiresAt).getTime() : Date.now() + 3600e3;
  return t > Date.now() ? t : 0;
}

async function persist(): Promise<void> {
  const db = getDB(); if (!db) return;
  await db.execute(sql`INSERT INTO wa_runtime_flags (key, value, updated_at) VALUES ('web_session', ${JSON.stringify(getWebHealth())}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`).catch(() => {});
}

function emit(): void {
  try { const io = (global as any).io; if (io) io.to('wa:inbox').emit('wa:web:health', getWebHealth()); } catch { /* غير حرج */ }
}

/** إشعار الأدمن عند تغيّر الحالة فقط (لا عند كلّ فحص) */
async function notifyOnChange(): Promise<void> {
  const h = getWebHealth();
  const sig = `${h.linked}|${h.ready}|${h.restriction?.kind || ''}|${h.locked || ''}`;
  if (sig === lastSig) return;
  const first = lastSig === '';
  lastSig = sig;
  if (first) return;   // الإقلاع ليس تغيّراً
  let title = '', body = '';
  if (h.restriction?.kind === 'tos_block') { title = '⛔ واتساب قيّد رقم الأعمال'; body = 'الإرسال من رقم الأعمال مقفل حتّى يُراجع يدويّاً.'; }
  else if (h.restriction?.kind === 'reachout_timelock') { title = '⏸️ واتساب أوقف الرسائل الجماعيّة مؤقّتاً'; body = `الردود مستمرّة، والجماعيّ موقوف حتّى ${h.restriction.expiresAt || 'إشعارٍ آخر'}.`; }
  else if (!h.linked) { title = '📵 رقم الأعمال غير مربوط'; body = 'اربط الرقم من مركز واتساب ← الصحّة ← ربط الجلسة.'; }
  else if (!h.ready) { title = '⚠️ جلسة رقم الأعمال لا تستجيب'; body = 'الرسائل تنتظر في الطابور، وتُعاد الجلسة تلقائيّاً.'; }
  else { title = '✅ رقم الأعمال يعمل'; body = 'عادت جلسة واتساب للعمل.'; }
  try {
    const { notifyAdmins } = await import('../whatsapp-inbox.service.js');
    await notifyAdmins(title, body, { url: '/admin/whatsapp?tab=health', tag: 'wa-web-health' });
  } catch { /* غير حاجب */ }
}

async function applyStatus(status: string, extra: { phone?: string | null; pushName?: string | null } = {}): Promise<void> {
  state.status = status || state.status;
  if (extra.phone !== undefined) state.phone = extra.phone;
  if (extra.pushName !== undefined) state.pushName = extra.pushName;
  state.linked = String(state.status).toLowerCase() === 'ready' && !!String(state.phone || '').replace(/\D/g, '');
}

/** حدثٌ وصل من البوّابة (أيّ نوع) — دليل حياة */
export function noteWebEvent(event: string): void {
  state.lastEventAt = new Date().toISOString();
  state.lastEvent = event;
}

export async function onSessionEvent(event: string, d: any): Promise<void> {
  switch (event) {
    case 'session.status':
      await applyStatus(String(d.status || ''));
      if (String(d.status).toLowerCase() === 'ready') void tick();
      break;
    case 'session.authenticated':
      await applyStatus('ready', { phone: String(d.phone || '').replace(/\D/g, '') || state.phone, pushName: d.pushName ?? state.pushName });
      void ensureWebhook();
      void tick();
      break;
    case 'session.disconnected': {
      state.disconnectReason = String(d.reason || '');
      await applyStatus('disconnected');
      const terminal = /logout|unpaired|conflict|banned|tos/i.test(state.disconnectReason);
      if (terminal && !channelSuspendedReason('web')) suspendSending(`${UNLINKED_PREFIX}: ${state.disconnectReason}`, 'web');
      setWebReady(false);
      break;
    }
    case 'session.restriction':
      if (d.active === false) {
        state.restriction = null;
      } else {
        state.restriction = { kind: String(d.kind || ''), code: d.code, expiresAt: d.expiresAt || null };
        if (state.restriction.kind === 'tos_block' || state.restriction.kind === 'proxy_block') {
          suspendSending(`قيد واتساب على رقم الأعمال (${state.restriction.kind}${d.code ? ` ${d.code}` : ''})`, 'web');
        }
      }
      break;
    case 'session.reconnect_loop':
      state.ready = false; setWebReady(false);
      break;
  }
  state.checkedAt = new Date().toISOString();
  await persist(); emit(); await notifyOnChange();
}

// ── الويبهوك: يُسجَّل بالرابط (upsert) — آمن للتكرار ────
export async function ensureWebhook(): Promise<void> {
  if (!webConfigured() || !env.OPENWA_WEBHOOK_SECRET) return;
  try {
    const list = await gw.listWebhooks();
    const body = { url: env.OPENWA_WEBHOOK_URL, events: WEBHOOK_EVENTS, secret: env.OPENWA_WEBHOOK_SECRET, retryCount: 5, active: true };
    const hit = list.find((w: any) => w?.url === env.OPENWA_WEBHOOK_URL);
    if (!hit) await gw.createWebhook(body);
    else {
      const same = Array.isArray(hit.events) && WEBHOOK_EVENTS.every(e => hit.events.includes(e)) && hit.active !== false && (hit.retryCount ?? 5) === 5;
      if (!same) await gw.updateWebhook(String(hit.id), body);
    }
    state.webhook = { ok: true, at: new Date().toISOString() };
  } catch (e: any) {
    state.webhook = { ok: false, error: String(e?.message || e), at: new Date().toISOString() };
    console.warn('⚠️ WA web ensureWebhook:', e?.message);
  }
}

// ── الحارس: كلّ دقيقتين ────────────────────────────────
async function tick(): Promise<void> {
  if (!webConfigured()) return;
  try {
    const s = await gw.session();
    await applyStatus(String(s?.status || ''), {
      phone: String(s?.phone || '').replace(/\D/g, '') || null,
      pushName: s?.pushName ?? null,
    });
    if (s?.restriction) state.restriction = { kind: String(s.restriction.kind || ''), code: s.restriction.code, expiresAt: s.restriction.expiresAt || null };
  } catch (e: any) {
    state.status = 'unreachable';
    state.linked = false;
  }

  if (state.linked && state.phone) {
    const ok = await gw.probe(state.phone);
    state.lastProbeAt = new Date().toISOString();
    state.lastProbeOk = ok;
    state.probeFailStreak = ok ? 0 : state.probeFailStreak + 1;
  } else {
    state.probeFailStreak = 0;
  }
  state.ready = state.linked && state.lastProbeOk !== false;
  setWebReady(state.ready);

  // رفع قفل «غير مربوط» تلقائيّاً متى عادت الجلسة سليمة — لا يُمسّ قفل القيود
  const lock = channelSuspendedReason('web');
  if (state.ready && lock && lock.startsWith(UNLINKED_PREFIX)) await resumeSending('web');

  // جلسة «جاهزة» لا تستجيب ثلاث مرّات ⟵ إعادة تشغيل (مرّة كلّ ٣٠ دقيقة على الأكثر)
  if (state.probeFailStreak >= 3 && Date.now() - lastRestartAt > 30 * 60e3) {
    lastRestartAt = Date.now();
    console.warn('🔁 WA web session wedged — restarting');
    void gw.restart().catch(() => {});
  }
  state.checkedAt = new Date().toISOString();
  await persist(); emit(); await notifyOnChange();
}

export async function checkWebNow(): Promise<WebHealth> {
  await tick();
  return getWebHealth();
}

export async function startWebHealth(): Promise<void> {
  if (timer || !webConfigured()) return;
  await ensureWebhook();
  await tick().catch(() => {});
  timer = setInterval(() => {
    void tick().catch(() => {});
    if (!state.webhook?.ok) void ensureWebhook();
  }, 2 * 60e3);
  timer.unref?.();
  console.log(`📱 WA web session monitor started (${state.status}${state.phone ? ` · ${state.phone}` : ''})`);
}
