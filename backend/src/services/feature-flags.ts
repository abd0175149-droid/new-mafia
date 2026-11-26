// ══════════════════════════════════════════════════════
// 🎚️ مفاتيح الميزات (wa_runtime_flags) — قراءةٌ مخبّأة 20 ثانية
// live_cards_v1: أداة الكروت أثناء اللعب + الدخول المتأخّر (الخطّة الموحّدة 2026-11-20، المرحلة 7):
//   تُنشر مطفأة، وتُفعَّل بعد أن تعرف كلّ الهواتف سطر «راجع بطاقتك» (تطبيق 0.4.27).
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';

const cache = new Map<string, { v: boolean; at: number }>();
export async function flagOn(key: string): Promise<boolean> {
  // 🧪 الاختبار داخل العمليّة (بلا قاعدة بيانات): FORCE_FLAGS=live_cards_v1
  if ((process.env.FORCE_FLAGS || '').split(',').includes(key)) return true;
  const c = cache.get(key);
  if (c && Date.now() - c.at < 20_000) return c.v;
  let v = false;
  try {
    const db = getDB();
    if (db) {
      const r: any = await db.execute(sql`SELECT value FROM wa_runtime_flags WHERE key = ${key} LIMIT 1`);
      const row = (r?.rows ?? r ?? [])[0];
      v = row?.value?.enabled === true;
    }
  } catch { /* مطفأ عند الخطأ */ }
  cache.set(key, { v, at: Date.now() });
  return v;
}
export const LIVE_CARDS = 'live_cards_v1';

/** 🧪 الميزة تعمل إن فُعّل مفتاحها، أو في غرفةٍ بموقع اختبار (لا رانك ولا لاعبين حقيقيّين) */
export async function liveCardsOn(state: any): Promise<boolean> {
  if (await flagOn(LIVE_CARDS)) return true;
  try {
    const { isTestScope } = await import('./match.service.js');
    return await isTestScope(state);
  } catch { return false; }
}

// ══════════════════════════════════════════════════════
// 🔮 موسم النبوءة (2026-11-26) — الموسمُ يُبنى مسودّةً ولا يمسّ الموسم النشط
//
// الكروت الخمسة تعمل في غرفةٍ إذا:
//   • كان الموسم العاديّ النشط يحمل محتوى «النبوءة» (seasons.content_pack = 'PROPHECY')، أو
//   • كانت الغرفة في موقع اختبار (قبل التفعيل: هنا وحدها)، أو
//   • فُتح المفتاح prophecy_v1 يدويّاً (طوارئ/تجربة).
// ويُحسب ذلك مرّةً عند تحضير التوزيع ويُحفظ في config.prophecy — لا تتغيّر قواعد مباراةٍ جارية
// إن فُعّل الموسم في منتصفها.
// ولكلّ كرتٍ مفتاحُ إطفاء: card_off_<ROLE> = {"enabled": true} يمنعه وحده من التوزيع.
// ══════════════════════════════════════════════════════
export const PROPHECY = 'prophecy_v1';
export const PROPHECY_PACK = 'PROPHECY';

export async function prophecyOn(state: any): Promise<boolean> {
  if (await flagOn(PROPHECY)) return true;
  try {
    const { getActiveContentPack } = await import('./season.service.js');
    if ((await getActiveContentPack()) === PROPHECY_PACK) return true;
  } catch { /* لا موسم ⇒ نكمل إلى فحص موقع الاختبار */ }
  try {
    const { isTestScope } = await import('./match.service.js');
    return await isTestScope(state);
  } catch { return false; }
}

/** الكروت المطفأة بمفاتيحها (card_off_<ROLE>) من بين أدوار النبوءة */
export async function prophecyCardsOff(roles: readonly string[]): Promise<string[]> {
  const off: string[] = [];
  for (const r of roles) if (await flagOn(`card_off_${r}`)) off.push(r);
  return off;
}
