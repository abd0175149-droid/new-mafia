// ══════════════════════════════════════════════════════
// 🔌 عميل بوّابة OpenWA — جلسة رقم الأعمال وحدها
// ══════════════════════════════════════════════════════
// مأخوذ من hub/src/server/openwa.js (WB web) بنمطه: call + GatewayError، بلا إعادة محاولة
// هنا (الطابور يقرّر)، والمفتاح محصور بجلسة mafia (allowedSessions) فلا يصل غيرها.
// البوّابة تحدّ ~100 طلب/دقيقة لكلّ عنوان: الطلبات الجماعيّة (السجلّ، الحلّ) تُباعَد 700ms.

import { env } from '../../config/env.js';

export class GatewayError extends Error {
  status: number; body: any; code?: string;
  constructor(status: number, msg: string, body?: any) {
    super(msg); this.name = 'GatewayError'; this.status = status; this.body = body;
    if (body?.code) this.code = String(body.code);
  }
}

let lastBulk = 0;
async function call(method: string, path: string, body?: any,
  o: { timeout?: number; raw?: boolean; bulk?: boolean; headers?: Record<string, string> } = {}): Promise<any> {
  if (o.bulk) {
    const wait = lastBulk + 700 - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastBulk = Date.now();
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), o.timeout ?? 30000);
  try {
    const res = await fetch(`${env.OPENWA_URL}/api${path}`, {
      method, signal: ctl.signal,
      headers: { 'X-API-Key': env.OPENWA_API_KEY, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(o.headers || {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (o.raw) {
      if (!res.ok) throw new GatewayError(res.status, `HTTP ${res.status}`);
      return res;
    }
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const m = data && (data.message || data.error);
      throw new GatewayError(res.status, m ? String(Array.isArray(m) ? m.join('; ') : m) : `HTTP ${res.status}`, data);
    }
    return data;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new GatewayError(0, 'انتهت مهلة الاتصال بالبوّابة');
    if (e instanceof GatewayError) throw e;
    throw new GatewayError(0, `تعذّر الاتصال بالبوّابة: ${e?.message || e}`);
  } finally { clearTimeout(t); }
}

const SID = () => env.OPENWA_SESSION_ID;
const S = (method: string, path: string, body?: any, o?: any) => call(method, `/sessions/${SID()}${path}`, body, o);
const unwrap = (d: any) => (d && typeof d === 'object' && !Array.isArray(d) && d.data !== undefined ? d.data : d);

// ── الجلسة ────────────────────────────────────────────
export const session = async () => unwrap(await call('GET', `/sessions/${SID()}`));
/** مطابقة حرفيّة: «qr_ready» تحتوي ready وتعني «ينتظر الربط» */
export const isLinked = (s: any) => String(s?.status || '').toLowerCase() === 'ready' && !!String(s?.phone || '').replace(/\D/g, '');
export const start = () => S('POST', '/start', undefined, { timeout: 150000 });
export const stop = () => S('POST', '/stop', undefined, { timeout: 60000 });
export const qr = async () => unwrap(await S('GET', '/qr'));
export const pairingCode = async (phoneNumber: string) =>
  unwrap(await S('POST', '/pairing-code', { phoneNumber: String(phoneNumber).replace(/\D/g, '') }, { timeout: 60000 }));
export async function restart(): Promise<void> {
  await stop().catch(() => {});
  await new Promise(r => setTimeout(r, 5000));
  await start().catch(() => {});
}

// ── الويبهوك ──────────────────────────────────────────
export const listWebhooks = async () => {
  const d = unwrap(await S('GET', '/webhooks'));
  return Array.isArray(d) ? d : (d?.items || []);
};
export const createWebhook = (body: any) => S('POST', '/webhooks', body);
export const updateWebhook = (id: string, body: any) => S('PUT', `/webhooks/${encodeURIComponent(id)}`, body);

// ── المحادثات والسجلّ وجهات الاتصال ─────────────────────
export const chats = async (limit = 100) => {
  const d = unwrap(await S('GET', `/chats?limit=${limit}`, undefined, { timeout: 60000 }));
  return Array.isArray(d) ? d : (d?.items || d?.chats || []);
};
/** deep: يرفع سقف البوّابة من 100 إلى 2000 (يقرأ كلّ ما في واتساب ويب محلّيّاً، بلا وسائط) */
export const history = async (chatId: string, limit = 30, deep = false) => {
  const d = unwrap(await S('GET', `/messages/${encodeURIComponent(chatId)}/history?limit=${limit}${deep ? '&deep=true' : ''}`, undefined, { timeout: 180000, bulk: true }));
  return Array.isArray(d) ? d : (d?.items || d?.messages || []);
};
/** معرّف خصوصيّة (@lid) ← الرقم، أو null إن لم تعرفه واتساب */
export async function resolvePhone(jid: string): Promise<string | null> {
  try {
    const d = unwrap(await S('GET', `/contacts/${encodeURIComponent(jid)}/phone`, undefined, { bulk: true }));
    const p = String(d?.phone || '').replace(/\D/g, '');
    return p || null;
  } catch { return null; }
}
export const checkNumber = async (digits: string) =>
  unwrap(await S('GET', `/contacts/check/${String(digits).replace(/\D/g, '')}`, undefined, { bulk: true }));
export async function media(chatId: string, msgId: string): Promise<{ buf: Buffer; mime: string }> {
  const res = await call('GET', `/sessions/${SID()}/messages/${encodeURIComponent(chatId)}/${encodeURIComponent(msgId)}/media`, undefined, { raw: true, timeout: 60000 });
  return { buf: Buffer.from(await res.arrayBuffer()), mime: res.headers.get('content-type') || 'application/octet-stream' };
}
export const markRead = (chatId: string) => S('POST', '/chats/read', { chatId }).catch(() => null);

// ── الإرسال ───────────────────────────────────────────
export type SendKind = 'text' | 'image' | 'location' | 'reply' | 'audio' | 'document';
const SEND_PATH: Record<SendKind, string> = {
  text: 'send-text', image: 'send-image', location: 'send-location', reply: 'reply', audio: 'send-audio', document: 'send-document',
};
/** يعيد معرّف الرسالة عند واتساب (true_9627…@c.us_3EB0…). Idempotency-Key يمنع الإرسال المزدوج عند الإعادة */
export async function send(kind: SendKind, body: any, idempotencyKey?: string): Promise<string | null> {
  const r = unwrap(await S('POST', `/messages/${SEND_PATH[kind]}`, body, {
    timeout: 90000, headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  }));
  return (r?.messageId || r?.id || null) as string | null;
}

/** فحص الاتصال الحقيقيّ (درس WB web: «ready» قد تكون جلسةً متجمّدة) */
export async function probe(ownPhone: string): Promise<boolean> {
  if (!ownPhone) return false;
  try { const r = await checkNumber(ownPhone); return !!(r && (r.exists !== undefined || r.number)); } catch { return false; }
}
