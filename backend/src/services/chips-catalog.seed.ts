// ══════════════════════════════════════════════════════
// 🌱 بذر كتالوج خزنة الدون — التصاميم المعتمدة (أرتفاكت v4)
//
// يُبذَر مرة واحدة بمفتاح item_key الثابت (ON CONFLICT DO NOTHING)،
// فلا يُلمَس أي تعديل يجريه الأدمن لاحقاً على العنصر.
// أسعار الإيجار (30 يوماً) كما أُقرّت — عدا XP Boost (7 أيام).
//
// كائنات الإطارات: نفس بنية rank_effects حرفياً (كل المفاتيح العشرة
// إلزامية — المُصيّر يقرأها بلا optional chaining).
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';

function fx(over: Record<string, any>) {
  const base: any = {
    border: { enabled: false, color: '#f59e0b', width: 2, inset: 0, style: 'solid', gradientColors: ['#f59e0b'], travelSpeed: 3 },
    glow: { enabled: false, color: '#f59e0b', size: 12, opacity: 0.4, pulseEnabled: false, pulseDuration: 2.5 },
    shimmer: { enabled: false, color: '#ffffff', opacity: 0.1, duration: 4 },
    particles: { enabled: false, count: 4, color: '#f59e0b', size: 3, orbitRadius: '90px', baseDuration: 5, animationType: 'orbit' },
    corners: { enabled: false, color: '#f59e0b', size: 12, width: 2, pulseEnabled: false },
    frame: { enabled: false, type: 'none', color: '#f59e0b', opacity: 0.7, strokeWidth: 1.5, animate: true },
    gradientOverlay: { enabled: false, color: '#f59e0b', opacity: 0.1, direction: 'to top' },
    floating: { enabled: false, content: '', position: 'top', size: 18, animation: 'float', glowColor: '#f59e0b' },
    badge: { enabled: false, emoji: '', label: '', bgColor: 'rgba(0,0,0,0.6)', textColor: '#fcd34d', borderColor: 'rgba(245,158,11,0.4)' },
    nameEffect: { enabled: false, color: '#ffffff', glowColor: '#f59e0b', glowSize: 8 },
  };
  for (const k of Object.keys(over)) base[k] = { ...base[k], ...over[k] };
  return base;
}

interface SeedItem {
  kind: string; itemKey: string; nameAr: string; hookAr: string;
  rarity: string; price: number; days?: number; emblemId?: string;
  purchasable?: boolean; sort: number; config?: any;
}

export const CHIPS_CATALOG_SEED: SeedItem[] = [
  // ── 🃏 الإطارات ──────────────────────────────────
  {
    kind: 'frame', itemKey: 'frame_don', nameAr: 'تاج العرّاب', emblemId: 'don',
    hookAr: 'ذهب حيّ وتاج مرصّع يعلو بطاقتك — يُعرف صاحبه من آخر الصالة.',
    rarity: 'myth', price: 120, sort: 10,
    config: fx({
      border: { enabled: true, style: 'traveling', gradientColors: ['#b45309', '#fcd34d', '#f59e0b', '#fde68a'], width: 3, travelSpeed: 3 },
      glow: { enabled: true, color: '#f59e0b', size: 26, opacity: 0.55, pulseEnabled: true, pulseDuration: 2.2 },
      shimmer: { enabled: true, color: '#fde68a', opacity: 0.35, duration: 3 },
      particles: { enabled: true, count: 6, color: '#fcd34d', size: 3, orbitRadius: '95px', baseDuration: 6 },
      frame: { enabled: true, type: 'royal', color: '#f59e0b', opacity: 0.85, strokeWidth: 1.6, animate: true },
      gradientOverlay: { enabled: true, color: '#f59e0b', opacity: 0.12, direction: 'to top' },
      badge: { enabled: true, emoji: '👑', label: 'أسطوري', bgColor: 'rgba(69,26,3,0.75)', textColor: '#fcd34d', borderColor: 'rgba(245,158,11,0.5)' },
      nameEffect: { enabled: true, color: '#fcd34d', glowColor: '#f59e0b', glowSize: 10 },
    }),
  },
  {
    kind: 'frame', itemKey: 'frame_blood', nameAr: 'قَسَم الدم', emblemId: 'blood',
    hookAr: 'نبض شرياني وخنجر ينزف — لأصحاب الولاء الأعمى للعائلة.',
    rarity: 'epic', price: 60, sort: 20,
    config: fx({
      border: { enabled: true, style: 'gradient', gradientColors: ['#7f1d1d', '#ef4444', '#450a0a'], width: 3 },
      glow: { enabled: true, color: '#dc2626', size: 20, opacity: 0.5, pulseEnabled: true, pulseDuration: 1.5 },
      frame: { enabled: true, type: 'simple', color: '#b91c1c', opacity: 0.8, strokeWidth: 2, animate: false },
      gradientOverlay: { enabled: true, color: '#7f1d1d', opacity: 0.18, direction: 'to bottom' },
      badge: { enabled: true, emoji: '🩸', label: 'ملحمي', bgColor: 'rgba(69,10,10,0.75)', textColor: '#fca5a5', borderColor: 'rgba(220,38,38,0.5)' },
      nameEffect: { enabled: true, color: '#fca5a5', glowColor: '#dc2626', glowSize: 8 },
    }),
  },
  {
    kind: 'frame', itemKey: 'frame_neon', nameAr: 'نيون الليل', emblemId: 'neon',
    hookAr: 'لافتة نيون شخصية ترفّ رفة كهرباء حقيقية.',
    rarity: 'epic', price: 60, sort: 30,
    config: fx({
      border: { enabled: true, style: 'solid', color: '#22d3ee', width: 2, inset: 2 },
      glow: { enabled: true, color: '#22d3ee', size: 24, opacity: 0.6, pulseEnabled: true, pulseDuration: 3.2 },
      frame: { enabled: true, type: 'simple', color: '#ec4899', opacity: 0.9, strokeWidth: 2, animate: false },
      gradientOverlay: { enabled: true, color: '#0ea5e9', opacity: 0.08, direction: 'to top' },
      badge: { enabled: true, emoji: '⚡', label: 'ملحمي', bgColor: 'rgba(8,51,68,0.75)', textColor: '#67e8f9', borderColor: 'rgba(34,211,238,0.5)' },
      nameEffect: { enabled: true, color: '#67e8f9', glowColor: '#06b6d4', glowSize: 10 },
    }),
  },
  {
    kind: 'frame', itemKey: 'frame_bullet', nameAr: 'رصاص ونحاس', emblemId: 'bullet',
    hookAr: 'آرت-ديكو نحاسي بثقوب رصاص — ثابت بلا وميض لمن يكره الحركة.',
    rarity: 'rare', price: 35, sort: 40,
    config: fx({
      border: { enabled: true, style: 'solid', color: '#b45309', width: 2 },
      glow: { enabled: true, color: '#d97706', size: 10, opacity: 0.3 },
      frame: { enabled: true, type: 'deco', color: '#d97706', opacity: 0.9, strokeWidth: 1.6, animate: false },
      badge: { enabled: true, emoji: '🎯', label: 'نادر', bgColor: 'rgba(69,39,3,0.75)', textColor: '#fbbf24', borderColor: 'rgba(217,119,6,0.5)' },
    }),
  },
  {
    kind: 'frame', itemKey: 'frame_smoke', nameAr: 'دخان الحانة', emblemId: 'smoke',
    hookAr: 'نوار أبيض وأسود وفيدورا تعتمر بطاقتك.',
    rarity: 'rare', price: 35, sort: 50,
    config: fx({
      border: { enabled: true, style: 'solid', color: '#71717a', width: 2 },
      glow: { enabled: true, color: '#a1a1aa', size: 14, opacity: 0.35, pulseEnabled: true, pulseDuration: 4 },
      frame: { enabled: true, type: 'simple', color: '#d4d4d8', opacity: 0.7, strokeWidth: 1.2, animate: false },
      gradientOverlay: { enabled: true, color: '#ffffff', opacity: 0.06, direction: 'to bottom' },
      badge: { enabled: true, emoji: '🚬', label: 'نادر', bgColor: 'rgba(39,39,42,0.75)', textColor: '#d4d4d8', borderColor: 'rgba(161,161,170,0.5)' },
    }),
  },
  {
    kind: 'frame', itemKey: 'frame_deal', nameAr: 'طاولة القمار', emblemId: 'deal',
    hookAr: 'جوخ أخضر ورقاقات ذهبية تدور حول صورتك طوال الليل.',
    rarity: 'rare', price: 35, sort: 60,
    config: fx({
      border: { enabled: true, style: 'traveling', gradientColors: ['#064e3b', '#10b981', '#065f46', '#34d399'], width: 2.5, travelSpeed: 5 },
      glow: { enabled: true, color: '#10b981', size: 18, opacity: 0.45, pulseEnabled: true, pulseDuration: 3 },
      particles: { enabled: true, count: 5, color: '#fbbf24', size: 4, orbitRadius: '85px', baseDuration: 7 },
      frame: { enabled: true, type: 'simple', color: '#10b981', opacity: 0.8, strokeWidth: 1.5, animate: false },
      badge: { enabled: true, emoji: '♠️', label: 'نادر', bgColor: 'rgba(6,78,59,0.75)', textColor: '#6ee7b7', borderColor: 'rgba(16,185,129,0.5)' },
    }),
  },
  {
    kind: 'frame', itemKey: 'frame_crime', nameAr: 'مسرح الجريمة', emblemId: 'crime',
    hookAr: 'شريط الشرطة يلفّ بطاقتك — لمن يموت أول ليلة ويضحك.',
    rarity: 'common', price: 20, sort: 70,
    config: fx({
      border: { enabled: true, style: 'solid', color: '#eab308', width: 2 },
      glow: { enabled: true, color: '#eab308', size: 10, opacity: 0.3 },
      badge: { enabled: true, emoji: '🚧', label: 'شائع', bgColor: 'rgba(66,50,3,0.75)', textColor: '#fde047', borderColor: 'rgba(234,179,8,0.5)' },
    }),
  },
  {
    kind: 'frame', itemKey: 'frame_champ', nameAr: 'إكليل البطل', emblemId: 'champ',
    hookAr: 'لا يُشترى بأي ثمن — لبطل الموسم وحده حتى تتويج التالي.',
    rarity: 'achievement', price: 0, purchasable: false, sort: 5,
    config: fx({
      border: { enabled: true, style: 'traveling', gradientColors: ['#94a3b8', '#f8fafc', '#cbd5e1', '#e2e8f0'], width: 3, travelSpeed: 4 },
      glow: { enabled: true, color: '#e2e8f0', size: 22, opacity: 0.5, pulseEnabled: true, pulseDuration: 2.8 },
      shimmer: { enabled: true, color: '#ffffff', opacity: 0.4, duration: 2.6 },
      particles: { enabled: true, count: 4, color: '#f1f5f9', size: 3, orbitRadius: '92px', baseDuration: 6 },
      frame: { enabled: true, type: 'greek', color: '#cbd5e1', opacity: 0.8, strokeWidth: 1.4, animate: true },
      badge: { enabled: true, emoji: '🏆', label: 'إنجاز فقط', bgColor: 'rgba(30,41,59,0.75)', textColor: '#f1f5f9', borderColor: 'rgba(203,213,225,0.5)' },
      nameEffect: { enabled: true, color: '#f1f5f9', glowColor: '#94a3b8', glowSize: 8 },
    }),
  },

  // ── ✨ تأثيرات الاسم (أوسع انتشار بأرخص سعر) ──────
  {
    kind: 'name_fx', itemKey: 'namefx_gold', nameAr: 'اسم ذهبي', rarity: 'rare', price: 15, sort: 110,
    hookAr: 'اسمك يلمع ذهباً في كل واجهة يظهر فيها.',
    config: { nameEffect: { enabled: true, color: '#fcd34d', glowColor: '#f59e0b', glowSize: 10 } },
  },
  {
    kind: 'name_fx', itemKey: 'namefx_blood', nameAr: 'اسم دموي', rarity: 'rare', price: 15, sort: 120,
    hookAr: 'توهّج قرمزي ينبض تحت اسمك.',
    config: { nameEffect: { enabled: true, color: '#fca5a5', glowColor: '#dc2626', glowSize: 9 } },
  },
  {
    kind: 'name_fx', itemKey: 'namefx_ghost', nameAr: 'اسم شبحي', rarity: 'rare', price: 15, sort: 130,
    hookAr: 'اسمك يتلاشى ويعود كأنه طيف.',
    config: { nameEffect: { enabled: true, color: '#d4d4d8', glowColor: '#a1a1aa', glowSize: 12 } },
  },

  // ── 🏷️ الألقاب ───────────────────────────────────
  {
    kind: 'title', itemKey: 'title_night_butcher', nameAr: 'سفّاح الليل', rarity: 'epic', price: 25, sort: 210,
    hookAr: 'لوحة تحت اسمك يراها كل من ينظر لبطاقتك.',
    config: { text: '☠️ سفّاح الليل', style: 'gold' },
  },
  {
    kind: 'title', itemKey: 'title_family_voice', nameAr: 'صوت العائلة', rarity: 'epic', price: 25, sort: 220,
    hookAr: 'لمن لا يُحسم نقاش دونه.',
    config: { text: '🩸 صوت العائلة', style: 'blood' },
  },
  {
    kind: 'title', itemKey: 'title_ghost', nameAr: 'الشبح', rarity: 'rare', price: 25, sort: 230,
    hookAr: 'لمن ينجو دائماً بلا أن ينتبه أحد.',
    config: { text: '👻 الشبح', style: 'ghost' },
  },

  // ── 🚪 تشريفات الدخول (شاشة العرض) ────────────────
  {
    kind: 'entrance', itemKey: 'entrance_don', nameAr: 'موكب العرّاب', rarity: 'myth', price: 50, sort: 310,
    hookAr: 'شريط ذهبي يعمّ الشاشة وتاج يهبط فوق اسمك عند دخولك.',
    config: { design: 'don', durationMs: 3500 },
  },
  {
    kind: 'entrance', itemKey: 'entrance_seal', nameAr: 'ختم العائلة', rarity: 'epic', price: 35, sort: 320,
    hookAr: 'ختم شمع قرمزي يُصفع على الشاشة باسمك.',
    config: { design: 'seal', durationMs: 3500 },
  },
  {
    kind: 'entrance', itemKey: 'entrance_neon', nameAr: 'لافتة النيون', rarity: 'epic', price: 35, sort: 330,
    hookAr: 'اسمك يشتعل لافتة نيون قبل أن يثبت.',
    config: { design: 'neon', durationMs: 3500 },
  },
  {
    kind: 'entrance', itemKey: 'entrance_file', nameAr: 'الملف السري', rarity: 'rare', price: 25, sort: 340,
    hookAr: 'ملف مخابرات ينزلق بصورتك وختم «وصل للتوّ».',
    config: { design: 'file', durationMs: 3500 },
  },

  // ── 🔥 أنيميشن الإقصاء ──────────────────────────
  {
    kind: 'elimination', itemKey: 'elim_burn', nameAr: 'موت بالنار', rarity: 'epic', price: 40, sort: 410,
    hookAr: 'بطاقتك تحترق أمام الجميع بدل أن تُطفأ بصمت — أسوأ لحظة تصير أقوى استعراض.',
    config: { design: 'burn' },
  },

  // ── 🔊 نغمة النصر ───────────────────────────────
  {
    kind: 'victory_sting', itemKey: 'sting_classic', nameAr: 'نغمة النصر', rarity: 'rare', price: 15, sort: 510,
    hookAr: 'نغمتك الخاصة تُعزف في الصالة لحظة فوزك — يسمعها الجميع.',
    // 🔊 مفتاح الحدث: يربطه المالك بأي ملف صوت من لوحة المؤثرات.
    //    ما لم يُربط ملف بهذا المفتاح لا يُعرض العنصر للبيع إطلاقاً.
    config: { soundKey: 'chips_victory_sting' },
  },

  // ── ⚡ معزّز الخبرة (٧ أيام — الاستثناء الوحيد) ───
  {
    kind: 'xp_boost', itemKey: 'boost_xp2', nameAr: 'معزّز الخبرة ×2', rarity: 'rare', price: 15, days: 7, sort: 610,
    hookAr: 'ضاعف نقاط خبرتك أسبوعاً كاملاً — لا يمسّ الرانك ولا نتائج المباريات.',
    config: { multiplier: 2, applies: 'xp_only' },
  },
];

/** بذر الكتالوج — آمن التكرار، لا يلمس تعديلات الأدمن */
export async function seedChipsCatalog(): Promise<number> {
  const db = getDB();
  if (!db) return 0;
  let inserted = 0;
  for (const it of CHIPS_CATALOG_SEED) {
    const res: any = await db.execute(sql`
      INSERT INTO chips_items
        (kind, item_key, name_ar, description_ar, hook_ar, rarity, price_chips, duration_days,
         emblem_id, config, is_active, is_purchasable, sort_order)
      VALUES
        (${it.kind}, ${it.itemKey}, ${it.nameAr}, '', ${it.hookAr}, ${it.rarity}, ${it.price},
         ${it.days ?? 30}, ${it.emblemId ?? null}, ${JSON.stringify(it.config ?? {})}::jsonb,
         true, ${it.purchasable !== false}, ${it.sort})
      ON CONFLICT (item_key) DO NOTHING
      RETURNING id
    `);
    const rows = res?.rows ?? (Array.isArray(res) ? res : []);
    if (rows.length) inserted++;
  }
  return inserted;
}
