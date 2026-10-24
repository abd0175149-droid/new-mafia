// ══════════════════════════════════════════════════════
// ☁️ قناة ميتا — WhatsApp Cloud API
// ══════════════════════════════════════════════════════
// الكود الذي كان في whatsapp-inbox.service (callWaApi · uploadWaMedia) وفي
// wa-bot-ext (جلب الوسائط من Graph) منقولٌ هنا حرفيّاً — بلا تغيير سلوك.

import { env } from '../../config/env.js';
import { suspendSending } from './locks.js';
import type { OutboundContent, SendResult } from './types.js';

export const GRAPH_BASE = 'https://graph.facebook.com/v20.0';
/** حدّ ميتا لتعليق الصورة (حرفاً) */
export const WA_CAPTION_MAX = 1024;

export function cloudConfigured(): boolean {
  return !!(env.WA_TOKEN && env.WA_PHONE_NUMBER_ID);
}

// ── استدعاء Cloud API ────────────────────────────────
export async function callWaApi(path: string, body: any): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${GRAPH_BASE}/${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `WhatsApp API HTTP ${res.status}`;
      const err: any = new Error(msg);
      err.waError = data?.error || null;
      // ⛔ حظر على مستوى التطبيق/الحساب (OAuth 200 «API access blocked»، 368 حظر مؤقّت، 131031 حساب مقفل):
      //    كلّ محاولة لاحقة ستفشل بالمثل — نقفل الإرسال فوراً بدل مواصلة الطرق (2026-09-20: حُظر التطبيق ولم يُقفل شيء).
      const code = Number(data?.error?.code);
      if ((code === 200 && /access blocked/i.test(msg)) || code === 368 || code === 131031) {
        try { suspendSending(`ميتا ترفض الطلبات: ${msg} (code ${code})`, 'cloud'); } catch { /* غير حاجب */ }
      }
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ══════════════════════════════════════════════════════
// 🖼️ رفعُ صورةٍ إلى مكتبة وسائط ميتا
// ══════════════════════════════════════════════════════
// الرابط أبسط للرسالة الواحدة؛ أمّا البثّ فميتا تسحب الرابط **مرّةً لكلّ مستلم**
// (بثٌّ لـ300 نافذة بصورة 2 م.ب = 600 م.ب تخرج من اللابتوب) — فيُرفع مرّةً ويُعاد
// استعمالُ المعرّف. المعرّف صالحٌ ~30 يوماً عند ميتا.
export async function uploadCloudMedia(filePath: string, mime: string): Promise<string> {
  if (!cloudConfigured()) throw new Error('إرسال واتساب غير مفعّل');
  const fs = await import('node:fs');
  const buf = await fs.promises.readFile(filePath);
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([new Uint8Array(buf)], { type: mime }), filePath.split(/[\\/]/).pop() || 'image.jpg');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), mime.startsWith('video/') ? 180000 : 60000);   // الرفع أبطأ من رسالة نصّ (والفيديو أكثر)
  try {
    const res = await fetch(`${GRAPH_BASE}/${env.WA_PHONE_NUMBER_ID}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WA_TOKEN}` },   // لا Content-Type — fetch يضبط الحدّ الفاصل
      body: form,
      signal: ctrl.signal,
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data?.id) throw new Error(data?.error?.message || `فشل رفع الصورة لميتا (HTTP ${res.status})`);
    return String(data.id);
  } finally {
    clearTimeout(timer);
  }
}

/** تنزيل وسيطٍ من Graph بمعرّفه (رابطٌ مؤقّت ثمّ الملفّ) — null إن تعذّر */
export async function fetchCloudMedia(mediaId: string): Promise<{ buf: Buffer; mime: string } | null> {
  if (!env.WA_TOKEN) return null;
  try {
    const meta: any = await (await fetch(`${GRAPH_BASE}/${mediaId}`, { headers: { Authorization: `Bearer ${env.WA_TOKEN}` } })).json();
    if (!meta?.url) return null;
    const buf = Buffer.from(await (await fetch(meta.url, { headers: { Authorization: `Bearer ${env.WA_TOKEN}` } })).arrayBuffer());
    return { buf, mime: String(meta.mime_type || '') };
  } catch { return null; }
}

/** حمولة Cloud API لرسالة — نفس بناء sendMessage القديم */
export function buildCloudBody(to: string, c: OutboundContent): any {
  const caption = c.image ? (c.image.caption || '').slice(0, WA_CAPTION_MAX) : '';
  if (c.interactive) return { messaging_product: 'whatsapp', to, type: 'interactive', interactive: c.interactive };
  if (c.video && (c.video.link || c.video.mediaId)) {
    const vc = (c.video.caption || '').slice(0, WA_CAPTION_MAX);
    return {
      messaging_product: 'whatsapp', to, type: 'video',
      video: c.video.mediaId ? { id: c.video.mediaId, ...(vc ? { caption: vc } : {}) } : { link: c.video.link, ...(vc ? { caption: vc } : {}) },
    };
  }
  if (c.location) return { messaging_product: 'whatsapp', to, type: 'location', location: c.location };
  if (c.image && (c.image.link || c.image.mediaId)) {
    return {
      messaging_product: 'whatsapp', to, type: 'image',
      image: c.image.mediaId
        ? { id: c.image.mediaId, ...(caption ? { caption } : {}) }
        : { link: c.image.link, ...(caption ? { caption } : {}) },
    };
  }
  return { messaging_product: 'whatsapp', to, type: 'text', text: { body: (c.text || '').trim() } };
}

export async function sendCloud(waPhone: string, c: OutboundContent): Promise<SendResult> {
  const apiBody = buildCloudBody(waPhone, c);
  const apiRes = await callWaApi(`${env.WA_PHONE_NUMBER_ID}/messages`, apiBody);
  const wamid = apiRes?.messages?.[0]?.id || null;
  // 🖼️ صورةٌ أُرسلت بمعرّف ميتا (البثّ): المعرّف لا يُعرض في الانبوكس — نحفظ معه رابطنا العامّ
  //    للعرض فقط (لا يُرسل لميتا). بدونه كانت رسائل البثّ تظهر نصّاً بلا صورة.
  const storedPayload = c.image?.mediaId && c.image?.link
    ? { ...apiBody, image: { ...apiBody.image, link: c.image.link } }
    : c.video?.mediaId && c.video?.link
      ? { ...apiBody, video: { ...apiBody.video, link: c.video.link } }
      : apiBody;
  return { wamid, storedPayload };
}
