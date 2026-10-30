// ══════════════════════════════════════════════════════
// 🧭 الموجِّه — من أيّ رقم تخرج هذه الرسالة؟
// ══════════════════════════════════════════════════════
// الأهليّة:
//   cloud : مهيّأة + نافذة ميتا (٢٤ ساعة من آخر وارد عبر ميتا) — قيدٌ تفرضه ميتا نفسها
//   web   : مهيّأة — **بلا أيّ شرط** على نافذةٍ أو محادثةٍ سابقة (قرار المالك 2026-10-20)
// ثمّ الوضع يحدّد المسموح، واللصوق يحدّد المفضّل، والبديل يُستعمل للمسار المسموح فقط.
// طلب العميل إيقاف التسويق (wa_optouts) يفحصه المستدعون كما كانوا — ليس من شأن الموجِّه.

import { sql, type SQL } from 'drizzle-orm';
import { env } from '../../config/env.js';
import type { Channel, ConvRoutingRow, Lane, PickResult } from './types.js';
import { transportSettings } from './settings.js';
import { channelSuspendedReason } from './locks.js';
import { cloudConfigured } from './cloud.transport.js';

export const CLOUD_WINDOW_MS = 24 * 60 * 60 * 1000;

export function webConfigured(): boolean {
  return !!(env.OPENWA_URL && env.OPENWA_API_KEY && env.OPENWA_SESSION_ID);
}

// جاهزيّة الجلسة يضبطها مراقب الصحّة (ready + آخر فحص حقيقيّ ناجح). قبل أوّل فحص نفترضها جاهزة:
// الطابور ينتظر الجلسة على أيّ حال، والبديل وحده يحتاج هذا الحكم.
let webReady = true;
export function setWebReady(v: boolean): void { webReady = v; }
export function isWebReady(): boolean { return webConfigured() && webReady; }

const ts = (v: any): number => (v ? new Date(v).getTime() : 0);

/** نافذة ميتا مفتوحة لهذه المحادثة؟ (صفوف قديمة بلا العمود الجديد تقع على last_inbound_at) */
export function cloudWindowOpen(conv: Pick<ConvRoutingRow, 'cloudLastInboundAt' | 'lastInboundAt' | 'channel'>, marginMs = 0): boolean {
  const at = conv.cloudLastInboundAt !== undefined
    ? ts(conv.cloudLastInboundAt)
    : (conv.channel === 'web' ? 0 : ts(conv.lastInboundAt));
  return !!at && Date.now() - at < CLOUD_WINDOW_MS - marginMs;
}

/** هل يسمح الوضع بإرسال هذه القناة لهذا المسار؟ (بلا البديل) */
function modeAllows(ch: Channel, lane: Lane, conv: ConvRoutingRow): boolean {
  const m = transportSettings().mode;
  if (ch === 'cloud') {
    if (m === 'web_final') return lane === 'reply' && (conv.channel || 'cloud') === 'cloud';
    return true;
  }
  return m !== 'cloud_only';
}

function eligible(ch: Channel, conv: ConvRoutingRow): boolean {
  if (ch === 'cloud') return cloudConfigured() && cloudWindowOpen(conv);
  return webConfigured();
}

function usable(ch: Channel): boolean {
  if (channelSuspendedReason(ch)) return false;
  return ch === 'web' ? isWebReady() : true;
}

/** المفضّل بحسب الوضع واللصوق — قبل فحص القفل */
function preferenceOrder(conv: ConvRoutingRow, lane: Lane): Channel[] {
  const m = transportSettings().mode;
  const sticky: Channel = conv.channel === 'web' ? 'web' : 'cloud';
  const other: Channel = sticky === 'web' ? 'cloud' : 'web';
  const pin = conv.channelPin === 'web' || conv.channelPin === 'cloud' ? (conv.channelPin as Channel) : null;
  let order: Channel[];
  if (m === 'cloud_only') order = ['cloud'];
  else if (m === 'web_final') order = lane === 'reply' && sticky === 'cloud' ? ['cloud', 'web'] : ['web'];
  // 🧾 الفاتورة: آخر رقمٍ حكى منه اللاعب أوّلاً في كلّ وضع (قرار المالك 2026-10-30)، والآخر بديلاً
  else if (lane === 'reply' || lane === 'invoice' || m === 'dual') order = [sticky, other];
  else order = ['web', 'cloud'];                    // web_primary: ما يبادر به النادي يفضّل رقم الأعمال
  if (pin) order = [pin, ...order.filter(c => c !== pin)];
  return order;
}

/**
 * يختار القناة. القناة المختارة قد تكون مقفلة (ولا بديل مسموح) — حينها تعود هي نفسها
 * فيرمي sendMessage «الإرسال مقفل» كما كان يفعل دائماً، بدل أن تختفي الرسالة صامتة.
 */
export function pickChannel(conv: ConvRoutingRow, lane: Lane): PickResult {
  const s = transportSettings();
  const candidates = preferenceOrder(conv, lane).filter(ch => modeAllows(ch, lane, conv) && eligible(ch, conv));
  if (!candidates.length) {
    const onlyCloud = s.mode === 'cloud_only' || !webConfigured();
    return onlyCloud
      ? { channel: null, code: 'WINDOW_EXPIRED', reason: 'لا توجد نافذة خدمة مفتوحة مع هذا الرقم — لا نبدأ محادثة مع أحد. انتظر أن يراسلك العميل، فتُفتح نافذة الـ24 ساعة.' }
      : { channel: null, code: 'CHANNEL_UNAVAILABLE', reason: 'لا قناة متاحة لهذه المحادثة الآن (نافذة ميتا مغلقة ورقم الأعمال غير متاح).' };
  }
  const first = candidates[0];
  if (usable(first)) return { channel: first };

  // البديل: المسار مسموحٌ له، والقناة الأخرى مؤهّلة وغير مقفلة. في web_final يجوز البديل إلى ميتا
  // للمسار المقيّد بوقت (قرار المالك) ما دامت نافذتها مفتوحة — ولو منع الوضعُ ميتا أصلاً.
  if (s.failover[lane] && s.mode !== 'cloud_only') {
    const alt: Channel = first === 'web' ? 'cloud' : 'web';
    if (eligible(alt, conv) && usable(alt)) return { channel: alt, failover: true };
  }
  return { channel: first };
}

/**
 * شرط SQL «يمكن الوصول إليه» لاستعلامات الجمهور (البثّ، الاستبيان، المتابعة، تنبيه الأدمن…).
 * `marginMin` هامش أمانٍ قبل إغلاق نافذة ميتا (كلّ مستدعٍ كان يكتب هامشه بيده).
 * على الجلسة لا شرط ⇒ TRUE — والمستدعي يضيف شروطه الخاصّة (إيقاف التسويق، الحضور…).
 */
export function reachableSql(alias: string, lane: Lane, marginMin = 15): SQL {
  const a = sql.raw(alias);
  const m = transportSettings().mode;
  const cloudCond = sql`(COALESCE(${a}.cloud_last_inbound_at, ${a}.last_inbound_at) > NOW() - (${1440 - marginMin} * INTERVAL '1 minute'))`;
  // الجلسة تصل الجميع في كلّ الأوضاع غير cloud_only (لكلّ المسارات)، فيكفي «صحيح»
  void lane;
  return webConfigured() && m !== 'cloud_only' ? sql`TRUE` : cloudCond;
}

/** هل يمكن الوصول إلى هذه المحادثة الآن عبر أيّ قناة؟ (للفحوص قبل الإرسال) */
export function isReachable(conv: ConvRoutingRow, lane: Lane): boolean {
  return pickChannel(conv, lane).channel !== null;
}
