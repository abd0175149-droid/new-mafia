// ══════════════════════════════════════════════════════
// 📋 سجل عمليات الموظفين — Staff Action Log
// يوثّق كل تدخّل يدوي للّيدر داخل اللعبة (تصويت بالنيابة، عقوبة، تغيير مقعد، تعديل حدث ليلي…)
// مصنّفاً حسب النوع/المستخدم/الفعالية/الغرفة مع طابع زمني. غير حاجب (fire-and-forget).
// ══════════════════════════════════════════════════════

import { getDB } from '../config/db.js';

// ── كتالوج الأفعال اليدوية التي تُسجَّل + تصنيفها ──────────────────────
// أي حدث سوكت/مسار غير موجود هنا لا يُسجَّل (لتفادي الضجيج). أضِف مفتاحاً لتسجيله.
export const ACTION_CATALOG: Record<string, { category: string; labelAr: string }> = {
  // ── العقوبات ──
  'leader:record-penalty': { category: 'PENALTY', labelAr: 'تسجيل عقوبة على لاعب' },
  'ui:penalty-menu-open': { category: 'PENALTY', labelAr: 'فتح قائمة العقوبات' },
  // ── التصويت بالنيابة + النهار ──
  'day:cast-vote': { category: 'PROXY_VOTE', labelAr: 'تصويت الليدر بالنيابة عن لاعب' },
  'day:create-deal': { category: 'DEAL', labelAr: 'إنشاء اتفاقية (ديل)' },
  'day:remove-deal': { category: 'DEAL', labelAr: 'إلغاء اتفاقية (ديل)' },
  'day:resolve': { category: 'GAME_FLOW', labelAr: 'حسم التصويت' },
  'day:execute-elimination': { category: 'GAME_FLOW', labelAr: 'تنفيذ الإقصاء' },
  'day:trigger-reveal': { category: 'GAME_FLOW', labelAr: 'كشف الأدوار' },
  'day:bomb-decision': { category: 'GAME_FLOW', labelAr: 'قرار القنبلة' },
  'day:tie-action': { category: 'GAME_FLOW', labelAr: 'إجراء تعادل' },
  'day:un-narrow': { category: 'GAME_FLOW', labelAr: 'إلغاء الحصر' },
  'day:start-voting': { category: 'GAME_FLOW', labelAr: 'بدء التصويت' },
  'day:start-withdrawal': { category: 'GAME_FLOW', labelAr: 'بدء الانسحاب' },
  // ── الليل (تعديل يدوي / أوتو) ──
  'night:submit-action': { category: 'NIGHT_ACTION', labelAr: 'إدخال حدث ليلي يدوياً' },
  'night:skip-action': { category: 'NIGHT_ACTION', labelAr: 'تخطّي حدث ليلي' },
  'night:auto-approve-step': { category: 'NIGHT_OVERRIDE', labelAr: 'تعديل/اعتماد خطوة ليل (أوتو)' },
  'night:auto-advance-step': { category: 'NIGHT_ACTION', labelAr: 'تقديم خطوة ليل (أوتو)' },
  'night:retry-auto': { category: 'NIGHT_ACTION', labelAr: 'إعادة محاولة الليل (أوتو)' },
  'night:activate-nurse': { category: 'NIGHT_ACTION', labelAr: 'تفعيل الممرضة' },
  'nurse:activation-response': { category: 'NIGHT_ACTION', labelAr: 'رد تفعيل الممرضة' },
  'policewoman:execute': { category: 'NIGHT_ACTION', labelAr: 'تنفيذ الشرطية' },
  'policewoman:skip': { category: 'NIGHT_ACTION', labelAr: 'تخطّي الشرطية' },
  'night:resolve': { category: 'GAME_FLOW', labelAr: 'حسم الليل' },
  'night:begin-queue': { category: 'GAME_FLOW', labelAr: 'بدء طابور الليل' },
  'night:start': { category: 'GAME_FLOW', labelAr: 'بدء الليل' },
  'night:end-recap': { category: 'GAME_FLOW', labelAr: 'إنهاء ملخص الصباح' },
  // ── المقاعد/اللاعبون ──
  'room:override-player': { category: 'SEAT_EDIT', labelAr: 'تعديل اسم/رقم لاعب يدوياً' },
  'room:renumber-players': { category: 'SEAT_EDIT', labelAr: 'إعادة ترقيم المقاعد' },
  'room:resync-template': { category: 'SEAT_EDIT', labelAr: 'تحديث المقاعد من القالب' },
  'room:release-held-seat': { category: 'SEAT_EDIT', labelAr: 'تحرير مقعد محجوز' },
  'room:kick-player': { category: 'PLAYER', labelAr: 'طرد لاعب' },
  'room:force-add-player': { category: 'PLAYER', labelAr: 'إضافة لاعب يدوياً' },
  'ui:seat-edit-open': { category: 'SEAT_EDIT', labelAr: 'فتح تعديل مقعد لاعب' },
  'ui:renumber-open': { category: 'SEAT_EDIT', labelAr: 'فتح إعادة الترقيم' },
  // ── إعدادات الغرفة ──
  'room:update-max-players': { category: 'ROOM_CONFIG', labelAr: 'تغيير سعة الغرفة' },
  'room:update-penalty-settings': { category: 'ROOM_CONFIG', labelAr: 'تغيير إعدادات العقوبات' },
  'room:update-bomb-setting': { category: 'ROOM_CONFIG', labelAr: 'تغيير إعداد القنبلة' },
  'room:update-mafia-reveal': { category: 'ROOM_CONFIG', labelAr: 'تغيير كشف المافيا' },
  'room:update-max-consecutive-mafia': { category: 'ROOM_CONFIG', labelAr: 'تغيير حد المافيا المتتالي' },
  'game:set-night-mode': { category: 'ROOM_CONFIG', labelAr: 'تغيير نمط الليل' },
  'game:set-timer': { category: 'ROOM_CONFIG', labelAr: 'ضبط مؤقّت اللعبة' },
  // ── تدفّق اللعبة ──
  'game:confirm-end': { category: 'GAME_FLOW', labelAr: 'إنهاء اللعبة' },
  'game:restart': { category: 'GAME_FLOW', labelAr: 'إعادة تشغيل اللعبة' },
  'room:reset-to-lobby': { category: 'GAME_FLOW', labelAr: 'إعادة الغرفة للوبي' },
  'room:new-game': { category: 'GAME_FLOW', labelAr: 'بدء لعبة جديدة' },
  'room:close-event': { category: 'GAME_FLOW', labelAr: 'إنهاء الفعالية' },
  // ── السحب العشوائي ──
  'room:lucky-draw:draw': { category: 'LUCKY_DRAW', labelAr: 'سحب عشوائي' },
  'room:lucky-draw:reveal': { category: 'LUCKY_DRAW', labelAr: 'كشف السحب على الشاشة' },
  'room:lucky-draw:clear': { category: 'LUCKY_DRAW', labelAr: 'إنهاء السحب' },
  // ── مسارات REST (تُسجَّل يدوياً من المعالجات) ──
  'rest:progression-adjust': { category: 'PROGRESSION_EDIT', labelAr: 'تعديل نقاط لاعب يدوياً' },
  'rest:seat-template-edit': { category: 'TEMPLATE_EDIT', labelAr: 'تعديل قالب مقاعد' },
  'rest:leader-force-add': { category: 'PLAYER', labelAr: 'إضافة لاعب يدوياً (REST)' },
};

// ── أسماء الفئات بالعربية (للعرض والفلترة) ─────────────────────────────
export const CATEGORY_LABELS: Record<string, string> = {
  PENALTY: 'العقوبات',
  PROXY_VOTE: 'تصويت بالنيابة',
  DEAL: 'الاتفاقيات',
  NIGHT_ACTION: 'أحداث الليل',
  NIGHT_OVERRIDE: 'تعديل ليل (أوتو)',
  SEAT_EDIT: 'تعديل المقاعد',
  PLAYER: 'إدارة اللاعبين',
  ROOM_CONFIG: 'إعدادات الغرفة',
  GAME_FLOW: 'تدفّق اللعبة',
  LUCKY_DRAW: 'السحب العشوائي',
  PROGRESSION_EDIT: 'تعديل النقاط',
  TEMPLATE_EDIT: 'قوالب المقاعد',
  ACTIVITY: 'الفعاليات',
  OTHER: 'أخرى',
};

export interface StaffActionEntry {
  staffId?: number | null; staffUsername?: string | null; staffRole?: string | null;
  source?: string; action: string; category?: string; labelAr?: string;
  outcome?: string | null; // success | blocked | null
  activityId?: number | null; roomId?: string | null; roomCode?: string | null; matchId?: number | null;
  targetPhysicalId?: number | null; targetName?: string | null; details?: any;
}

// ── تنقية الحمولة (حذف الأسرار + اقتطاع الطويل) ─────────────────────────
export function sanitizeDetails(payload: any): any {
  if (payload == null || typeof payload !== 'object') return payload;
  const out: any = Array.isArray(payload) ? [] : {};
  for (const [k, v] of Object.entries(payload)) {
    if (/token|password|secret|\bcode\b|\bpin\b/i.test(k)) { out[k] = '***'; continue; }
    if (typeof v === 'string' && v.length > 300) { out[k] = v.slice(0, 300) + '…'; continue; }
    if (v && typeof v === 'object' && JSON.stringify(v).length > 2000) { out[k] = '[كبير — مُختصَر]'; continue; }
    out[k] = v;
  }
  return out;
}

// ── حلّ سياق الغرفة (الفعالية/الرمز/المباراة/أسماء اللاعبين) مع كاش قصير ──
type RoomCtx = { activityId?: number; roomCode?: string; matchId?: number; names?: Record<number, string> };
const ctxCache = new Map<string, { data: RoomCtx; at: number }>();

export async function resolveRoomContext(roomId?: string | null): Promise<RoomCtx> {
  if (!roomId) return {};
  const c = ctxCache.get(roomId);
  if (c && Date.now() - c.at < 10000) return c.data;
  try {
    const { getGameState } = await import('../config/redis.js');
    const st: any = await getGameState(roomId);
    const names: Record<number, string> = {};
    (st?.players || []).forEach((p: any) => { if (p?.physicalId != null) names[p.physicalId] = p.name; });
    const data: RoomCtx = { activityId: st?.activityId, roomCode: st?.roomCode, matchId: st?.matchId, names };
    ctxCache.set(roomId, { data, at: Date.now() });
    return data;
  } catch { return {}; }
}

// ── الإدراج (غير حاجب — لا يُفشِل الفعل أبداً) ───────────────────────────
export async function logStaffAction(entry: StaffActionEntry): Promise<void> {
  try {
    const db = getDB();
    if (!db) return;
    const { staffActionLog } = await import('../schemas/admin.schema.js');
    const cat = entry.category || ACTION_CATALOG[entry.action]?.category || 'OTHER';
    const label = entry.labelAr || ACTION_CATALOG[entry.action]?.labelAr || entry.action;
    await db.insert(staffActionLog).values({
      staffId: entry.staffId ?? null,
      staffUsername: entry.staffUsername ?? null,
      staffRole: entry.staffRole ?? null,
      source: entry.source || 'socket',
      action: entry.action,
      category: cat,
      labelAr: label,
      outcome: entry.outcome ?? null,
      activityId: entry.activityId ?? null,
      roomId: entry.roomId ?? null,
      roomCode: entry.roomCode ?? null,
      matchId: entry.matchId ?? null,
      targetPhysicalId: entry.targetPhysicalId ?? null,
      targetName: entry.targetName ?? null,
      details: entry.details ?? null,
    } as any);
  } catch (e: any) {
    console.warn('⚠️ logStaffAction failed:', e?.message);
  }
}

// ── مُلتقِط السوكت: يسجّل كل حدث موظف موجود في الكتالوج تلقائياً ─────────
// إن كان للحدث ردّ (ack callback) نلتقط نتيجته: نجح (success) أم مُحجوب (blocked) مع السبب.
// وإلا نسجّله كمحاولة (outcome=null). كلّه غير حاجب — لا يُفشِل الحدث.
export function registerAuditLogging(socket: any): void {
  socket.use((packet: any[], next: (err?: any) => void) => {
    try {
      const event = packet?.[0];
      const staff = socket.data?.authStaff;
      if (staff && typeof event === 'string' && ACTION_CATALOG[event]) {
        const payload = packet[1];
        const p = payload && typeof payload === 'object' ? payload : {};
        const roomId: string | undefined = p.roomId || socket.data?.roomId;
        const targetPhysicalId: number | undefined =
          p.physicalId ?? p.voterPhysicalId ?? p.targetPhysicalId ?? p.penaltyPlayerId ?? undefined;

        const emit = (outcome: string | null, extraDetails?: any) => {
          (async () => {
            const ctx = await resolveRoomContext(roomId);
            await logStaffAction({
              staffId: staff.id, staffUsername: staff.username, staffRole: staff.role,
              source: event.startsWith('ui:') ? 'ui' : 'socket',
              action: event, outcome,
              activityId: ctx.activityId, roomId, roomCode: ctx.roomCode, matchId: ctx.matchId,
              targetPhysicalId,
              targetName: targetPhysicalId != null ? ctx.names?.[targetPhysicalId] : undefined,
              details: extraDetails ? { ...sanitizeDetails(payload), ...extraDetails } : sanitizeDetails(payload),
            });
          })().catch(() => {});
        };

        // إن كان آخر وسيط دالة → هو ردّ الـ ack؛ نلفّه لالتقاط النتيجة (نجح/محجوب)
        const lastIdx = packet.length - 1;
        const ack = lastIdx >= 1 ? packet[lastIdx] : undefined;
        if (typeof ack === 'function') {
          packet[lastIdx] = function (this: any, ...ackArgs: any[]) {
            try {
              const resp = ackArgs[0];
              const blocked = !!resp && resp.success === false;
              emit(blocked ? 'blocked' : 'success', blocked ? { _blockedReason: resp?.error || 'blocked' } : undefined);
            } catch { /* تجاهل */ }
            return ack.apply(this, ackArgs);
          };
        } else {
          // بلا ردّ (مثل ui:*) → محاولة
          emit(null);
        }
      }
    } catch { /* لا نُفشِل الحدث أبداً */ }
    next();
  });
}
