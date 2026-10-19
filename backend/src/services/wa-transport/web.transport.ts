// ══════════════════════════════════════════════════════
// 📱 قناة رقم الأعمال — جلسة واتساب عبر بوّابة OpenWA
// ══════════════════════════════════════════════════════
// (م١: الهيكل فقط — الإرسال الفعليّ والطابور في م٣. الوضع cloud_only لا يختار هذه القناة.)

import { buildCloudBody } from './cloud.transport.js';
import type { Lane, OutboundContent } from './types.js';

/** الحمولة المخزَّنة: شكل ميتا نفسه (to = رقم الإرسال) — فتبقى الواجهة والتحليلات كما هي */
export function buildWebStoredPayload(conv: { waPhone?: string; webChatId?: string | null }, c: OutboundContent): any {
  return buildCloudBody(conv.waPhone || conv.webChatId || '', c);
}

export async function enqueueWeb(saved: any, _conv: any, _c: OutboundContent, _lane: Lane): Promise<any> {
  void saved;
  const err: any = new Error('قناة رقم الأعمال لم تُفعَّل بعد');
  err.code = 'CHANNEL_UNAVAILABLE';
  throw err;
}
