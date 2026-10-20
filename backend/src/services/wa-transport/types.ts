// ══════════════════════════════════════════════════════
// 🔀 طبقة النقل — قناتان خلف sendMessage / processWebhookPayload
// ══════════════════════════════════════════════════════
// cloud = Cloud API الرسميّ (رقم ميتا) · web = جلسة رقم الأعمال عبر بوّابة OpenWA.
//
// القاعدة الذهبيّة: الشكل القانونيّ داخل النظام هو **حمولة ميتا**. ما يصل من الجلسة
// يُترجَم إليها، وما يُرسَل يُخزَّن بها — فلا يعرف البوت ولا التحليلات ولا الواجهة
// من أيّ قناة جاءت الرسالة إلّا من عمود `channel`.

export type Channel = 'cloud' | 'web';
export const CHANNELS: Channel[] = ['cloud', 'web'];

/**
 * مسار الإرسال — يحدّد التباعد والسقف في طابور الجلسة، والبديل بين القناتين.
 *   reply  : ردّ على وارد (البوت، الموظّف، النظام)
 *   timely : مقيّد بوقت (تذكير، مقعد متحرّر، تنبيه أدمن، رسالة حجز)
 *   bulk   : جماعيّ (بثّ، متابعة، استبيان، عروض، فئات التحليلات)
 */
export type Lane = 'reply' | 'timely' | 'bulk';

/** أوضاع التشغيل — تُبدَّل من «الإدارة ← القنوات» بلا نشر */
export type TransportMode = 'cloud_only' | 'dual' | 'web_primary' | 'web_final';
export const TRANSPORT_MODES: TransportMode[] = ['cloud_only', 'dual', 'web_primary', 'web_final'];

export interface TransportSettings {
  mode: TransportMode;
  /** البديل حين تتعطّل القناة المختارة — لكلّ مسار (قرار المالك: timely وحده) */
  failover: Record<Lane, boolean>;
  /** البوت يردّ على قناة الجلسة؟ (مطفأ في مرحلة «الظلّ») */
  webBot: boolean;
  /** سقوف طابور الجلسة الجماعيّ: سقف يوميّ + سقف بالساعة + تباعد + ساعات العمل */
  bulk: { dailyCap: number; hourlyCap: number; gapMinSec: number; gapMaxSec: number; from: string; to: string };
  timely: { gapMinSec: number; gapMaxSec: number; serviceDailyCap: number };
  /** المحادثة الباردة (لم يراسلنا صاحبها على رقم الأعمال قطّ) — أخطر ما يُحظر عليه الرقم،
   *  فسقفها أصغر وتباعدها أوسع، وتُنثر على أيّام بدل أن تُرسل دفعةً واحدة. */
  cold: { dailyCap: number; gapMinSec: number; gapMaxSec: number };
  /** تسخين الجلسة: سقفٌ يوميّ متدرّج يُحسب من يوم ربط الرقم (كلّ ربطٍ جديد يبدأ من الصفر).
   *  schedule سقف اليوم ٠،١،٢… · coldSchedule سقف المحادثات الباردة بالتدرّج نفسه. */
  warmup: { enabled: boolean; schedule: number[]; coldSchedule: number[] };
  /** استراحةٌ بشريّة: بعد كلّ عددٍ من الرسائل الجماعيّة، توقّفٌ أطول (ثوانٍ) */
  longPause: { everyN: number; seconds: number };
  /** ردود ميتا تعرّف برقم الأعمال (مرّة في اليوم لكلّ محادثة) */
  cloudRedirect: { enabled: boolean; businessNumber: string; oncePerDay: boolean };
  /** الإرسال المباشر من صفحات الحجوزات والتحليلات والمستكشف */
  outreach: { direct: boolean; cohortFreqDays: number };
  /** المتابعات على الجلسة: أقصى عمرٍ لآخر وارد يُتابَع (لا نافذة على الجلسة، لكن لا نوقظ محادثات قديمة) */
  followupMaxAgeHours: number;
}

export const DEFAULT_TRANSPORT_SETTINGS: TransportSettings = {
  mode: 'cloud_only',
  failover: { reply: false, timely: true, bulk: false },
  webBot: false,
  // سقوفٌ متحفّظة بعد تقييد 2026-10-20: ٤٥–١٢٠ث بدل ١٥–٤٥، وسقفٌ بالساعة، وساعاتٌ أضيق
  bulk: { dailyCap: 150, hourlyCap: 20, gapMinSec: 45, gapMaxSec: 120, from: '10:00', to: '22:00' },
  timely: { gapMinSec: 5, gapMaxSec: 15, serviceDailyCap: 120 },
  cold: { dailyCap: 20, gapMinSec: 120, gapMaxSec: 300 },
  warmup: { enabled: true, schedule: [20, 30, 40, 60, 90, 120, 160, 200, 250], coldSchedule: [10, 15, 20, 25, 30, 40, 50] },
  longPause: { everyN: 12, seconds: 240 },
  cloudRedirect: { enabled: true, businessNumber: '', oncePerDay: true },
  outreach: { direct: true, cohortFreqDays: 3 },
  followupMaxAgeHours: 48,
};

/** محتوى رسالة صادرة — نفس حقول SendMessageInput */
export interface OutboundContent {
  text?: string;
  interactive?: any;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  image?: { link?: string; mediaId?: string; localPath?: string; caption?: string };
}

export interface SendResult {
  /** wamid.HBg… لميتا · true_9627…@c.us_3EB0… للجلسة · null إن بقيت في الطابور */
  wamid: string | null;
  /** حمولة ميتا القانونيّة التي تُخزَّن في wa_messages.payload */
  storedPayload: any;
  /** الجلسة: الرسالة في الطابور ولم تخرج بعد */
  queued?: boolean;
}

/** ما يكفي من صفّ المحادثة لاختيار القناة */
export interface ConvRoutingRow {
  id: number;
  phone: string;
  waPhone: string;
  channel?: string | null;
  channelPin?: string | null;
  cloudLastInboundAt?: Date | string | null;
  webLastInboundAt?: Date | string | null;
  lastInboundAt?: Date | string | null;
  webChatId?: string | null;
}

export interface PickResult {
  channel: Channel | null;
  /** عند غياب القناة: WINDOW_EXPIRED (ميتا وحدها والنافذة مغلقة) أو CHANNEL_UNAVAILABLE */
  code?: 'WINDOW_EXPIRED' | 'CHANNEL_UNAVAILABLE';
  reason?: string;
  /** اختيرت بديلاً عن القناة الأصليّة */
  failover?: boolean;
}

/** أخطاء «تعذّر الوصول» التي يصنّفها المستدعون «تخطّى» لا «فشل» */
export const UNREACHABLE_CODES = ['WINDOW_EXPIRED', 'OPTED_OUT', 'CHANNEL_UNAVAILABLE'] as const;
export function isUnreachable(e: any): boolean {
  return UNREACHABLE_CODES.includes(e?.code);
}
