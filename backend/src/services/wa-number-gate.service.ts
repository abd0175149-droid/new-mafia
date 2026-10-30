// ══════════════════════════════════════════════════════
// 📱 بوّابة رقم الواتساب — كلّ لاعب يدخل التطبيق رقمه على واتساب (2026-10-30، التصوّر المعتمد)
//   https://claude.ai/artifact/TQyWqVu8KTUaPjQCbLo5Yo
//
// الفحص صامت: رقم الأعمال يسأل واتساب «هل هذا الرقم مسجّل؟» (contacts/check) — لا محادثة ولا رسالة.
// النتيجة في wa_number_checks (✓ ٣٠ يوماً، ✗ ٣ أيّام ثمّ يُعاد).
//
// قرارات المالك المقفلة:
//   ١ الرقم الجديد: فحص واتساب + رمز تأكيد ٦ أرقام عبر واتساب (الرسالة الوحيدة، يطلبها اللاعب بنفسه)
//   ٢ لاعبٌ داخل لعبةٍ جارية (أو متفرّج) لا تُقطع لعبته — البوّابة عند أوّل فتحٍ بعد خروجه
//   ٣ تعطّل الفحص (رقم الأعمال مفصول): يدخل ويُعاد الفحص لاحقاً — من كان «بلا واتساب» يبقى ممنوعاً
//   ٤ الموظّف في القاعة: يُحفظ الحساب بتنبيه، واللاعب يُلزم عند دخوله
//   ٥ الأرقام المكرّرة: دمجٌ تلقائيّ (للشخص نفسه — انظر scripts/wa-gate-migrate.ts)
// والبوّابة لا تعمل حتّى يشغّلها المالك من الداشبورد (wa_runtime_flags.wa_number_gate).
// ══════════════════════════════════════════════════════

import crypto from 'crypto';
import { and, eq, ne, sql, isNull } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { players } from '../schemas/player.schema.js';
import { normalizeLocalPhone, normalizeAnyPhone } from '../utils/phone.util.js';

const FLAG = 'wa_number_gate';
const rows = (r: any): any[] => r?.rows ?? r ?? [];
const OTP_TTL_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_HOUR = 5;

/** 🧪 للفحوص وحدها (e2e-wa-gate): مفتاحٌ مفروض، فحصٌ وإرسالٌ مستبدَلان — لا يُلمس واتساب */
export const gateHooks: {
  forceEnabled: boolean | null;
  check: null | ((local: string) => Promise<boolean | null>);
  sendOtp: null | ((phone: string, code: string) => Promise<void>);
} = { forceEnabled: null, check: null, sendOtp: null };

// ── المفتاح ───────────────────────────────────────────
let flagCache: { on: boolean; at: number } | null = null;
export async function waGateEnabled(): Promise<boolean> {
  if (gateHooks.forceEnabled !== null) return gateHooks.forceEnabled;
  if (flagCache && Date.now() - flagCache.at < 15_000) return flagCache.on;
  const db = getDB(); if (!db) return false;
  try {
    const [r] = rows(await db.execute(sql`SELECT value FROM wa_runtime_flags WHERE key = ${FLAG} LIMIT 1`));
    flagCache = { on: r?.value?.enabled === true, at: Date.now() };
  } catch { flagCache = { on: false, at: Date.now() }; }
  return flagCache.on;
}
export async function setWaGateEnabled(on: boolean, by: string): Promise<void> {
  const db = getDB(); if (!db) throw new Error('DB unavailable');
  await db.execute(sql`INSERT INTO wa_runtime_flags (key, value, updated_at)
    VALUES (${FLAG}, ${JSON.stringify({ enabled: on, by, at: new Date().toISOString() })}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`);
  flagCache = { on, at: Date.now() };
}

// ── الرقم: صيغته وحالته ───────────────────────────────
/** الرقم بصيغته المعتمدة: أردنيّ 07XXXXXXXX، أو دوليّ كما يعيده normalizeAnyPhone. null = غير صالح */
export function canonicalPhone(raw: string | null | undefined): { local: string; wa: string } | null {
  const j = normalizeLocalPhone(raw);
  if (j) return { local: j, wa: '962' + j.slice(1) };
  const a = normalizeAnyPhone(raw);
  return a?.local && a?.wa ? { local: String(a.local), wa: String(a.wa) } : null;
}

export type WaState = 'active' | 'none' | 'invalid' | 'shared' | 'unknown';

/**
 * حالة رقم اللاعب: active (عليه واتساب) · none (لا واتساب) · invalid (ليس رقماً) · shared (رقمه
 * مسجّلٌ بصيغته الصحيحة لحسابٍ آخر — شخصان على رقمٍ واحد) · unknown (لم يُفحص/انتهى فحصه الإيجابيّ —
 * يدخل ويُفحص في الخلفيّة، القرار ٣).
 */
export async function phoneState(playerId: number, rawPhone: string): Promise<{ state: WaState; local: string | null }> {
  const db = getDB();
  const c = canonicalPhone(rawPhone);
  if (!c) return { state: 'invalid', local: null };
  if (!db) return { state: 'unknown', local: c.local };
  // شخصان على رقمٍ واحد: من لم يُحفظ رقمه بالصيغة المعتمدة هو من يربط رقمه الخاصّ
  if (String(rawPhone).trim() !== c.local) {
    const [other] = await db.select({ id: players.id }).from(players)
      .where(and(eq(players.phone, c.local), ne(players.id, playerId), isNull(players.deletedAt))).limit(1);
    if (other) return { state: 'shared', local: c.local };
  }
  const [chk] = rows(await db.execute(sql`SELECT on_wa, checked_at > NOW() - (CASE WHEN on_wa THEN 30 ELSE 3 END * INTERVAL '1 day') AS fresh
    FROM wa_number_checks WHERE phone = ${c.local}`));
  const { scheduleChecks } = await import('./wa-transport/number-check.js');
  if (!chk) { scheduleChecks([c.local]); return { state: 'unknown', local: c.local }; }
  if (!chk.fresh) scheduleChecks([c.local]);
  if (chk.on_wa) return { state: 'active', local: c.local };       // ✓ منتهٍ: يدخل والفحص يُجدَّد بصمت
  return { state: 'none', local: c.local };                         // ✗ منتهٍ: يبقى ممنوعاً حتّى يثبت الفحص الجديد غير ذلك
}

/** ما يُرسل في /me: هل البوّابة مطلوبة الآن؟ (المفتاح · لا تُقطع لعبةٌ جارية · الحالة) */
export async function gateFor(player: { id: number; phone: string }, inGame: boolean): Promise<null | { required: true; reason: WaState; phone: string }> {
  if (!(await waGateEnabled())) return null;
  if (inGame) return null;
  const s = await phoneState(player.id, player.phone);
  if (s.state === 'none' || s.state === 'invalid' || s.state === 'shared') return { required: true, reason: s.state, phone: player.phone };
  return null;
}

// ── فحصٌ لحظيّ (التسجيل، الرقم الجديد، الموظّف) ───────
/** يسأل واتساب الآن (مهلة قصيرة) ويحفظ النتيجة. null = تعذّر الفحص (رقم الأعمال غير متّصل) */
export async function checkNow(local: string, timeoutMs = 8000): Promise<boolean | null> {
  const c = canonicalPhone(local);
  if (!c) return false;
  if (gateHooks.check) {
    const r = await gateHooks.check(c.local);
    if (r !== null) { const { recordCheck } = await import('./wa-transport/number-check.js'); await recordCheck(c.local, r); }
    return r;
  }
  const { isWebReady, webConfigured } = await import('./wa-transport/router.js');
  if (!webConfigured() || !isWebReady()) return null;
  const gw = await import('./wa-transport/openwa.client.js');
  const { recordCheck } = await import('./wa-transport/number-check.js');
  try {
    const r: any = await Promise.race([gw.checkNumber(c.wa), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))]);
    if (r && typeof r.exists === 'boolean') { await recordCheck(c.local, r.exists, r.whatsappId || null); return r.exists; }
    return null;
  } catch { return null; }
}

// ── تغيير الرقم: فحص ⟵ رمز ⟵ اعتماد ────────────────────
export class GateError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }

/** الخطوة ١: الرقم الجديد صالح؟ غير مأخوذ؟ عليه واتساب؟ ⟵ رمزٌ واحد عبر واتساب */
export async function startPhoneChange(playerId: number, raw: string): Promise<{ phone: string; codeSent: boolean; sameNumber?: boolean }> {
  const db = getDB(); if (!db) throw new GateError('DB', 'قاعدة البيانات غير متوفرة', 503);
  const c = canonicalPhone(raw);
  if (!c) throw new GateError('INVALID', 'اكتب رقم موبايل كاملاً — 10 خانات تبدأ بـ 07');
  const [me] = await db.select({ id: players.id, phone: players.phone }).from(players).where(eq(players.id, playerId)).limit(1);
  if (!me) throw new GateError('GONE', 'الحساب غير موجود', 404);
  const [taken] = await db.select({ id: players.id }).from(players)
    .where(and(eq(players.phone, c.local), ne(players.id, playerId), isNull(players.deletedAt))).limit(1);
  if (taken) throw new GateError('TAKEN', 'هذا الرقم مسجّل لحسابٍ آخر — إن كان رقمك راجع موظّف الباب', 409);
  const onWa = await checkNow(c.local);
  if (onWa === null) throw new GateError('CHECK_UNAVAILABLE', 'تعذّر التحقّق من الرقم الآن — حاول بعد دقيقة', 503);
  if (!onWa) throw new GateError('NOT_ON_WA', `لا يوجد واتساب على ${c.local} — اكتب الرقم الذي عليه واتساب`);
  // رقمه نفسه صار عليه واتساب (ثبّت التطبيق مثلاً) ⟵ يكفي الفحص: الرقم رقم حسابه أصلاً
  if (me.phone === c.local) return { phone: c.local, codeSent: false, sameNumber: true };

  const [{ n }] = rows(await db.execute(sql`SELECT COUNT(*)::int AS n FROM phone_change_otps WHERE player_id = ${playerId} AND created_at > NOW() - INTERVAL '1 hour'`));
  if (Number(n) >= OTP_MAX_PER_HOUR) throw new GateError('TOO_MANY', 'طلبت رموزاً كثيرة — حاول بعد ساعة', 429);
  const code = String(crypto.randomInt(100000, 1000000));
  const hash = crypto.createHash('sha256').update(`${playerId}:${c.local}:${code}`).digest('hex');
  await db.execute(sql`UPDATE phone_change_otps SET used_at = NOW() WHERE player_id = ${playerId} AND used_at IS NULL`);
  await db.execute(sql`INSERT INTO phone_change_otps (player_id, phone, code_hash, expires_at)
    VALUES (${playerId}, ${c.local}, ${hash}, ${new Date(Date.now() + OTP_TTL_MS).toISOString()}::timestamptz)`);
  const { sendMessage } = await import('./whatsapp-inbox.service.js');
  try {
    if (gateHooks.sendOtp) { await gateHooks.sendOtp(c.local, code); return { phone: c.local, codeSent: true }; }
    // مسار «invoice»: بلا سقفٍ ولا ساعات — رمزٌ يطلبه اللاعب الآن يجب أن يصل الآن
    await sendMessage({ phone: c.local, text: `رمز تأكيد رقمك في نادي المافيا: ${code}\nلا تشاركه مع أحد — صالح ١٠ دقائق.`, source: 'system', lane: 'invoice', meta: { phoneOtp: true } });
  } catch (e: any) {
    throw new GateError('SEND_FAILED', 'تعذّر إرسال الرمز الآن — حاول بعد دقيقة', 503);
  }
  return { phone: c.local, codeSent: true };
}

/** الخطوة ٢: الرمز صحيح ⟵ يُعتمد الرقم (رقم الدخول، محادثة واتساب، سجلّ التغيير) */
export async function confirmPhoneChange(playerId: number, raw: string, code: string | null): Promise<{ phone: string }> {
  const db = getDB(); if (!db) throw new GateError('DB', 'قاعدة البيانات غير متوفرة', 503);
  const c = canonicalPhone(raw);
  if (!c) throw new GateError('INVALID', 'رقمٌ غير صالح');
  const [me] = await db.select({ id: players.id, phone: players.phone }).from(players).where(eq(players.id, playerId)).limit(1);
  if (!me) throw new GateError('GONE', 'الحساب غير موجود', 404);

  if (me.phone !== c.local || code) {
    const [otp] = rows(await db.execute(sql`SELECT id, code_hash, attempts, expires_at > NOW() AS live FROM phone_change_otps
      WHERE player_id = ${playerId} AND phone = ${c.local} AND used_at IS NULL ORDER BY id DESC LIMIT 1`));
    if (!otp || !otp.live) throw new GateError('EXPIRED', 'انتهت صلاحيّة الرمز — اطلب رمزاً جديداً');
    if (Number(otp.attempts) >= OTP_MAX_ATTEMPTS) throw new GateError('LOCKED', 'محاولاتٌ كثيرة — اطلب رمزاً جديداً');
    const hash = crypto.createHash('sha256').update(`${playerId}:${c.local}:${String(code || '').trim()}`).digest('hex');
    if (hash !== otp.code_hash) {
      await db.execute(sql`UPDATE phone_change_otps SET attempts = attempts + 1 WHERE id = ${otp.id}`);
      throw new GateError('WRONG_CODE', 'الرمز غير صحيح — انسخه من رسالة واتساب');
    }
    await db.execute(sql`UPDATE phone_change_otps SET used_at = NOW() WHERE id = ${otp.id}`);
  } else {
    // نفس رقمه بلا رمز: يُقبل فقط إن ثبت الفحص للتوّ أنّه على واتساب
    const [chk] = rows(await db.execute(sql`SELECT on_wa FROM wa_number_checks WHERE phone = ${c.local} AND checked_at > NOW() - INTERVAL '15 minutes'`));
    if (!chk?.on_wa) throw new GateError('NOT_ON_WA', 'لم يثبت أنّ هذا الرقم على واتساب — أعد المحاولة');
  }

  const [taken] = await db.select({ id: players.id }).from(players)
    .where(and(eq(players.phone, c.local), ne(players.id, playerId), isNull(players.deletedAt))).limit(1);
  if (taken) throw new GateError('TAKEN', 'هذا الرقم مسجّل لحسابٍ آخر', 409);

  const old = me.phone;
  if (old !== c.local) {
    await db.update(players).set({ phone: c.local } as any).where(eq(players.id, playerId));
    await db.execute(sql`INSERT INTO player_phone_changes (player_id, old_phone, new_phone, source) VALUES (${playerId}, ${old}, ${c.local}, 'wa_gate')`);
    // محادثة الرقم الجديد تُربط بالحساب، والقديمة تُفكّ (البوت والفواتير يتبعان الحساب)
    await db.execute(sql`UPDATE wa_conversations SET player_id = NULL WHERE player_id = ${playerId} AND phone <> ${c.local}`);
    await db.execute(sql`UPDATE wa_conversations SET player_id = ${playerId} WHERE phone = ${c.local}`);
  }
  const { recordCheck } = await import('./wa-transport/number-check.js');
  await recordCheck(c.local, true);
  return { phone: c.local };
}

// ── الموظّف في القاعة (القرار ٤): يُحفظ بتنبيه ─────────
/** فحصٌ لحظيّ قصير لرقم حسابٍ أنشأه موظّف — تنبيهٌ نصّيّ أو null */
export async function staffCreateWarning(rawPhone: string): Promise<string | null> {
  const c = canonicalPhone(rawPhone);
  if (!c) return 'رقمٌ غير صالح — سيُطلب من اللاعب ربط رقم واتساب عند أوّل دخول';
  const r = await checkNow(c.local, 5000);
  if (r === false) return 'لا واتساب على هذا الرقم — سيُطلب من اللاعب ربط رقم واتساب عند أوّل دخول';
  return null;
}

// ── للداشبورد: صورة الأرقام ────────────────────────────
export async function gateOverview(): Promise<any> {
  const db = getDB(); if (!db) return {};
  const list = rows(await db.execute(sql`SELECT p.id, p.name, p.phone, p.last_active_at
    FROM players p WHERE p.deleted_at IS NULL AND p.merged_into_id IS NULL`));
  const checks = new Map<string, boolean>(rows(await db.execute(sql`SELECT phone, on_wa FROM wa_number_checks`)).map((x: any) => [String(x.phone), !!x.on_wa]));
  const out = { total: list.length, active: 0, none: 0, invalid: 0, unknown: 0, needs: [] as any[] };
  for (const p of list) {
    const c = canonicalPhone(p.phone);
    if (!c) { out.invalid++; out.needs.push({ id: p.id, name: p.name, phone: p.phone, reason: 'invalid', lastActive: p.last_active_at }); continue; }
    const onWa = checks.has(c.local) ? checks.get(c.local) : null;
    if (onWa === true) out.active++;
    else if (onWa === false) { out.none++; out.needs.push({ id: p.id, name: p.name, phone: p.phone, reason: 'none', lastActive: p.last_active_at }); }
    else out.unknown++;
  }
  out.needs.sort((a, b) => (new Date(b.lastActive || 0).getTime()) - (new Date(a.lastActive || 0).getTime()));
  return { enabled: await waGateEnabled(), ...out };
}
