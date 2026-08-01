// ══════════════════════════════════════════════════════
// 📋 قوالب ميتا — إدارة كاملة من النظام (استوديو القوالب)
// ══════════════════════════════════════════════════════
// الدفعة 1 من مركز الحملات (اعتماد المالك 2026-07-26):
//   • إنشاء/حذف/مزامنة قوالب WABA عبر Business Management API
//   • متابعة الموافقة لحظياً عبر ويبهوك message_template_status_update
//   • مرآة محلية wa_templates هي مصدر العرض بالواجهة
// التوكن مفحوص: يحمل whatsapp_business_management ✓ (2026-07-26)

import { eq, desc, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { env } from '../config/env.js';
import { waTemplates } from '../schemas/admin.schema.js';
import { notifyAdmins } from './whatsapp-inbox.service.js';

const GRAPH = 'https://graph.facebook.com/v20.0';

function emitInbox(event: string, payload: any) {
  try {
    const io = (global as any).io;
    if (io) io.to('wa:inbox').emit(event, payload);
  } catch { /* السوكيت تكميلي */ }
}

async function graphCall(path: string, opts: { method?: string; body?: any } = {}): Promise<any> {
  if (!env.WA_TOKEN || !env.WA_WABA_ID) throw new Error('WA_TOKEN / WA_WABA_ID غير مضبوطة');
  const res = await fetch(`${GRAPH}/${path}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${env.WA_TOKEN}`,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    throw new Error(e.error_user_msg || e.message || `Graph API ${res.status}`);
  }
  return json;
}

// ── الحالة بالعربية (للإشعارات) ──
const STATUS_AR: Record<string, string> = {
  APPROVED: 'معتمد ✅', PENDING: 'قيد المراجعة ⏳', REJECTED: 'مرفوض ❌',
  PAUSED: 'موقوف مؤقتاً ⏸️', DISABLED: 'معطّل 🚫', IN_APPEAL: 'قيد التظلم',
  PENDING_DELETION: 'قيد الحذف',
};

// ══════════════════════════════════════════════════════
// المزامنة: ميتا ← المرآة المحلية
// ══════════════════════════════════════════════════════

export async function syncTemplates(): Promise<any[]> {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  const res = await graphCall(
    `${env.WA_WABA_ID}/message_templates?limit=100&fields=id,name,language,status,category,components,rejected_reason,quality_score`,
  );
  const remote: any[] = res.data || [];
  const seenMetaIds = new Set<string>();

  for (const t of remote) {
    seenMetaIds.add(String(t.id));
    const row = {
      metaId: String(t.id),
      name: t.name,
      language: t.language || 'ar',
      category: t.category || '',
      status: t.status || '',
      components: t.components || [],
      rejectedReason: t.rejected_reason || '',
      qualityScore: t.quality_score?.score || '',
      lastSyncAt: new Date(),
      updatedAt: new Date(),
    };
    const [existing] = await db.select({ id: waTemplates.id }).from(waTemplates).where(eq(waTemplates.metaId, row.metaId)).limit(1);
    if (existing) await db.update(waTemplates).set(row as any).where(eq(waTemplates.id, existing.id));
    else await db.insert(waTemplates).values(row as any);
  }

  // ما حُذف من ميتا يُحذف من المرآة
  const local = await db.select({ id: waTemplates.id, metaId: waTemplates.metaId }).from(waTemplates);
  for (const l of local) {
    if (l.metaId && !seenMetaIds.has(l.metaId)) {
      await db.delete(waTemplates).where(eq(waTemplates.id, l.id));
    }
  }

  return db.select().from(waTemplates).orderBy(desc(waTemplates.updatedAt));
}

// ══════════════════════════════════════════════════════
// الإنشاء — نبني المكوّنات بقواعد ميتا ونفحص قبل الإرسال
// ══════════════════════════════════════════════════════

// ════════════════════════════════════════════════════
// 🚫 لا إنشاء قوالب — قراءة وحذف فقط
// ════════════════════════════════════════════════════
// كان هنا createTemplate — ينشئ قالباً بفئة MARKETING عند ميتا.
// أُزيل مع محرّك الحملات: نظام يردّ على من راسله لا يحتاج قوالب أصلاً
// (القالب أداة مخاطبة نافذة مغلقة، ونحن لا نخاطب نوافذ مغلقة).
//
// ما بقي: مزامنة وقراءة وحذف — والحذف مقصود: به تُمسح القوالب
// التسويقية القديمة من الحساب فور عودة الوصول إليه.

export async function deleteTemplate(name: string): Promise<void> {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  await graphCall(`${env.WA_WABA_ID}/message_templates?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
  await db.delete(waTemplates).where(eq(waTemplates.name, name));
}

// ══════════════════════════════════════════════════════
// ويبهوك الموافقات — message_template_status_update
// ══════════════════════════════════════════════════════

export async function handleTemplateStatusUpdate(value: any): Promise<void> {
  const db = getDB();
  if (!db) return;
  const metaId = String(value?.message_template_id || '');
  const name = value?.message_template_name || '';
  const event = String(value?.event || '').toUpperCase();   // APPROVED | REJECTED | PAUSED | PENDING | ...
  if (!metaId && !name) return;

  const patch: any = { status: event, updatedAt: new Date(), lastSyncAt: new Date() };
  if (value?.reason) patch.rejectedReason = String(value.reason);

  let updated: any[] = [];
  if (metaId) {
    updated = await db.update(waTemplates).set(patch).where(eq(waTemplates.metaId, metaId)).returning();
  }
  if (!updated.length && name) {
    updated = await db.update(waTemplates).set(patch).where(eq(waTemplates.name, name)).returning();
  }

  const label = STATUS_AR[event] || event;
  notifyAdmins(
    `📋 قالب «${name || metaId}» — ${label}`,
    value?.reason ? `السبب: ${value.reason}` : 'تحديث حالة القالب من ميتا',
    { url: '/admin/whatsapp', tag: `wa-template-${metaId || name}` },
  ).catch(() => {});
  emitInbox('wa:template:update', { metaId, name, status: event, reason: value?.reason || '' });
}

export async function listTemplatesLocal(): Promise<any[]> {
  const db = getDB();
  if (!db) return [];
  return db.select().from(waTemplates).orderBy(desc(waTemplates.updatedAt));
}
