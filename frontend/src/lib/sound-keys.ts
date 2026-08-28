// ══════════════════════════════════════════════════════
// 🔑 مفاتيح الصوت — المصدر الواحد
// ══════════════════════════════════════════════════════
// 🔴 لماذا وُجد هذا الملفّ: كانت أربعُ قوائم للمفاتيح مكتوبةً بيدٍ في أربعة أماكن —
//    كتالوجُ الأدمن (٦٨)، وما يناديه الكود (٧٢)، وفئاتُ المازج، والنغماتُ المركّبة —
//    ولا شيء يفحص اتّفاقها. فمفتاحٌ يُنادى كلّ ليلة (ambient_elimination) لم يكن في
//    الكتالوج أصلاً فلا سبيل لرفع ملفٍّ له، ومقبضٌ واحد حكم ٤٥ صوتاً لا يجمعها شيء.
//
//    الآن: كلُّ مفتاحٍ يُعرَّف هنا مرّةً — باسمه ومجموعته في الكتالوج وفئته في المازج
//    وهل له نغمةٌ مركّبة. يستورده الأدمن ومديرُ الصوت والمازج، ويفحصه
//    scripts/test-sound-keys.ts: أيُّ مفتاحٍ يُنادى في الكود ولا يوجد هنا يُسقط البناء.
//
// 🔴 والفئاتُ بمعنى الصوت لا بموضع الكود: السؤالُ الذي يطرحه الموجّه وسط الليلة هو
//    «ما الذي يزعج الطاولة الآن؟» — فكلُّ مقبضٍ يجمع أصواتاً تتشابه وظيفةً ومدّةً وحدّة.
// ══════════════════════════════════════════════════════

export type SoundCategory =
  | 'ambientNight' | 'ambientDay'          // 🏛️ القاعة — مستمرّ
  | 'events' | 'transitions' | 'votes' | 'timer' | 'celebration'   // 🏛️ القاعة — لحظيّ
  | 'monitor';                             // 🎧 الموجّه وحده

export type CategoryGroup = 'hallAmbient' | 'hallMoment' | 'leaderOnly';

export interface CategoryDef {
  key: SoundCategory;
  labelAr: string;
  hint: string;
  icon: string;
  group: CategoryGroup;
  /** يُبَثّ للقاعة (لا: تنبيهٌ لأذن الموجّه وحده) */
  hallToo: boolean;
  /** المستوى الافتراضيّ */
  defaultLevel: number;
  /** صوتُ المعاينة الممثِّل للفئة */
  preview: string;
}

export const CATEGORY_GROUPS: { key: CategoryGroup; labelAr: string }[] = [
  { key: 'hallAmbient', labelAr: '🏛️ القاعة — خلفيّة مستمرّة' },
  { key: 'hallMoment',  labelAr: '🏛️ القاعة — لحظيّ' },
  { key: 'leaderOnly',  labelAr: '🎧 جهازك وحده' },
];

export const SOUND_CATEGORIES: CategoryDef[] = [
  { key: 'ambientNight', labelAr: 'خلفيّة الليل والصباح', hint: 'الليل · الصباح · اللوبي',        icon: '🌙', group: 'hallAmbient', hallToo: true,  defaultLevel: 0.30, preview: 'ambient_night' },
  { key: 'ambientDay',   labelAr: 'خلفيّة النهار',        hint: 'النقاش · التصويت · التبرير · الإقصاء', icon: '🗣️', group: 'hallAmbient', hallToo: true,  defaultLevel: 0.30, preview: 'ambient_voting' },
  { key: 'events',       labelAr: 'أحداث اللعبة',         hint: 'الليل · الصباح · الإقصاء · الكروت · القنبلة', icon: '⚡', group: 'hallMoment', hallToo: true, defaultLevel: 0.70, preview: 'night_assassination' },
  { key: 'transitions',  labelAr: 'انتقالات الأطوار',     hint: 'بداية كلّ طور · التعادل · اكتمال التصويت', icon: '🔄', group: 'hallMoment', hallToo: true, defaultLevel: 0.60, preview: 'phase_night_start' },
  { key: 'votes',        labelAr: 'نقرات التصويت',        hint: 'تتكرّر عشرات المرّات في الجولة',  icon: '🗳️', group: 'hallMoment', hallToo: true,  defaultLevel: 0.50, preview: 'vote_cast' },
  { key: 'timer',        labelAr: 'المؤقّت والصافرة',     hint: 'التكّة · النبض · الصافرة',        icon: '⏱️', group: 'hallMoment', hallToo: true,  defaultLevel: 1.00, preview: 'timer_buzzer' },
  { key: 'celebration',  labelAr: 'الاحتفالات',           hint: 'الفوز · نغمة النصر · الميلاد',    icon: '🎉', group: 'hallMoment', hallToo: true,  defaultLevel: 0.90, preview: 'win_citizen' },
  { key: 'monitor',      labelAr: 'تنبيهات المراقبة',     hint: 'فتح القائمة · الخروج من التطبيق', icon: '🕵️', group: 'leaderOnly', hallToo: false, defaultLevel: 0.40, preview: 'leader_gallery_alert' },
];

export const DEFAULT_LEVELS: Record<SoundCategory, number> = Object.fromEntries(
  SOUND_CATEGORIES.map(c => [c.key, c.defaultLevel]),
) as Record<SoundCategory, number>;

/**
 * هجرةُ ضبط الموجّه من الفئات القديمة (٧) إلى الجديدة (٨) — كي لا يفقد ما ضبطه.
 * الخلفيّتان تُنقلان كما هما؛ «التنبيهات العامّة» تُنقل إلى الأحداث والانتقالات والنقرات
 * لأنّها كانت تحكمها كلَّها؛ والمراقبة تأخذ متوسّط المقبضين القديمين.
 */
export const LEGACY_LEVEL_MAP: Record<string, SoundCategory[]> = {
  ambientNight: ['ambientNight'],
  ambientVote:  ['ambientDay'],
  alerts:       ['events', 'transitions', 'votes'],
  victory:      ['celebration'],
  timer:        ['timer'],
  departure:    ['monitor'],
  gallery:      ['monitor'],
};

// ══════════════════════════════════════════════════════
// الكتالوج — كلُّ مفتاحٍ مرّةً واحدة
// ══════════════════════════════════════════════════════

export interface SoundKeyDef {
  key: string;
  label: string;
  desc: string;
  /** فئةُ المقبض */
  cat: SoundCategory;
  /** له نغمةٌ مركّبة في soundManager إن غاب الملفّ */
  synth?: boolean;
  /** فراشٌ يتكرّر (لا نغمةٌ عابرة) */
  ambient?: boolean;
}

export interface SoundGroupDef { label: string; events: SoundKeyDef[] }

export const SOUND_GROUPS: SoundGroupDef[] = [
  {
    label: '🏠 اللوبي',
    events: [
      { key: 'ambient_lobby', label: '🏠 خلفيّة اللوبي', desc: 'يعمل أثناء انتظار اللاعبين ويتكرّر', cat: 'ambientNight', ambient: true },
    ],
  },
  {
    label: '☀️ النهار — خلفيّات',
    events: [
      { key: 'ambient_day',           label: '☀️ خلفيّة النقاش',   desc: 'يعمل أثناء النقاش ويتكرّر',                    cat: 'ambientDay', ambient: true },
      { key: 'ambient_voting',        label: '🗳️ خلفيّة التصويت', desc: 'يعمل أثناء التصويت المفتوح ويتكرّر',            cat: 'ambientDay', ambient: true },
      { key: 'ambient_justification', label: '⚖️ خلفيّة التبرير', desc: 'يعمل أثناء التبرير ويتكرّر',                    cat: 'ambientDay', ambient: true },
      { key: 'ambient_elimination',   label: '⚡ خلفيّة الإقصاء',  desc: 'يعمل لحظة الإقصاء — إن غاب بقيت خلفيّة النهار', cat: 'ambientDay', ambient: true },
    ],
  },
  {
    label: '🌙 الليل — خلفيّات',
    events: [
      { key: 'ambient_night',             label: '🌙 خلفيّة الليل',        desc: 'الخلفيّة الافتراضيّة طوال الليل — وفي شاشة المراجعة',              cat: 'ambientNight', ambient: true },
      // 🌙 الليلةُ الواحدة: الجميعُ يختار معاً في نافذةٍ واحدة — لها صوتُها إن أردتَ تمييزها
      //    عن هدوء الليل. بلا ملفٍّ يستمرّ `ambient_night` كما هو.
      { key: 'ambient_night_choosing',    label: '⏳ نافذة الاختيار',      desc: 'الليلة الواحدة: من «ابدأ الليلة» حتى فتح المراجعة — الجميع يختار معاً', cat: 'ambientNight', ambient: true },
      // ⚠️ السبعةُ التالية للنمط اليدويّ وحده (الموجّه يمرّ على كلّ دورٍ بدوره).
      //    الليلةُ الواحدة لا تبثّ خطواتٍ فلا تنطلق فيها — رفعُ ملفٍّ لها هناك بلا أثر.
      { key: 'ambient_night_kill',        label: '🔪 خلفيّة الاغتيال', desc: 'النمط اليدويّ فقط — أثناء انتظار هدف الاغتيال', cat: 'ambientNight', ambient: true },
      { key: 'ambient_night_silence',     label: '🤐 خلفيّة الإسكات',  desc: 'النمط اليدويّ فقط — أثناء انتظار هدف الإسكات',   cat: 'ambientNight', ambient: true },
      { key: 'ambient_night_investigate', label: '👁️ خلفيّة التحقيق', desc: 'النمط اليدويّ فقط — أثناء انتظار هدف التحقيق',   cat: 'ambientNight', ambient: true },
      { key: 'ambient_night_protect',     label: '🛡️ خلفيّة الحماية', desc: 'النمط اليدويّ فقط — أثناء انتظار هدف الحماية',   cat: 'ambientNight', ambient: true },
      { key: 'ambient_night_snipe',       label: '🎯 خلفيّة القنص',    desc: 'النمط اليدويّ فقط — أثناء انتظار هدف القنص',     cat: 'ambientNight', ambient: true },
      { key: 'ambient_night_assassin',    label: '🔪 خلفيّة السفّاح',  desc: 'النمط اليدويّ فقط — أثناء انتظار هدف السفّاح',   cat: 'ambientNight', ambient: true },
      { key: 'ambient_night_witch',       label: '🧙 خلفيّة الساحرة',  desc: 'النمط اليدويّ فقط — أثناء انتظار هدف التعطيل',   cat: 'ambientNight', ambient: true },
    ],
  },
  {
    label: '🔪 الليل — تنفيذ',
    events: [
      { key: 'night_assassination', label: '🔪 تنفيذ اغتيال', desc: 'عند تنفيذ الاغتيال',       cat: 'events', synth: true },
      { key: 'night_investigation', label: '👁️ تنفيذ تحقيق',  desc: 'عند تحقيق الشريف',          cat: 'events', synth: true },
      { key: 'night_protection',    label: '🛡️ تنفيذ حماية',  desc: 'عند الحماية الطبّيّة',      cat: 'events', synth: true },
      { key: 'night_snipe',         label: '🎯 تنفيذ قنص',    desc: 'عند تصويب القنّاص',         cat: 'events', synth: true },
      { key: 'night_silence',       label: '🤐 تنفيذ إسكات',  desc: 'عند الإسكات',               cat: 'events', synth: true },
      { key: 'night_assassin',      label: '🔪 تنفيذ السفّاح', desc: 'عند اغتيال السفّاح',        cat: 'events', synth: true },
      { key: 'night_witch',         label: '🧙 تعطيل الساحرة', desc: 'عند تعطيل الساحرة قدرةً',   cat: 'events', synth: true },
    ],
  },
  {
    label: '☀️ الصباح — كشف',
    events: [
      { key: 'ambient_morning',               label: '☀️ خلفيّة الصباح',       desc: 'أثناء ملخّص الصباح ويتكرّر',           cat: 'ambientNight', ambient: true },
      { key: 'morning_assassination_success', label: '🩸 اغتيال ناجح',         desc: 'عند كشف نجاح الاغتيال',                cat: 'events', synth: true },
      { key: 'morning_protection_success',    label: '🛡️ نجاة بالحماية',       desc: 'عند نجاح الحماية',                     cat: 'events', synth: true },
      { key: 'morning_snipe_mafia',           label: '🎯 قنص ناجح',            desc: 'القنّاص أصاب مافيا',                   cat: 'events', synth: true },
      { key: 'morning_snipe_citizen',         label: '💀 قنص فاشل',            desc: 'القنّاص أصاب مواطناً',                 cat: 'events', synth: true },
      { key: 'morning_silenced',              label: '🤐 إسكات لاعب',          desc: 'تمّ إسكات لاعب',                       cat: 'events', synth: true },
      { key: 'morning_assassin_kill',         label: '🔪 اغتيال السفّاح',      desc: 'عند كشف اغتيال السفّاح',               cat: 'events', synth: true },
      { key: 'morning_policewoman',           label: '👮 صلاحيّة الشرطيّة',    desc: 'عند تنفيذ صلاحيّة الشرطيّة',           cat: 'events', synth: true },
      { key: 'morning_ability_disabled',      label: '🧙 تعطيل قدرة',          desc: 'عند كشف تعطيل الساحرة قدرةً',          cat: 'events' },
      { key: 'morning_phoenix_rebirth',       label: '🔥 نهوض العنقاء',        desc: 'محاولةُ إخراجٍ فشلت — العنقاء واقف',   cat: 'events', synth: true },
      { key: 'morning_phoenix_burn',          label: '🔥 نار العنقاء',         desc: 'خروجُ من مدّ يده إلى العنقاء',         cat: 'events', synth: true },
      { key: 'morning_phoenix_ash',           label: '🜂 لعنة الرماد',         desc: 'أعدمته المدينة فأخذ معه من صوّت عليه', cat: 'events', synth: true },
      // 🔥 لا حدثَ خاصّاً في المحرّك لسقوط العنقاء: موتُه يبقى حدثَ القتل الأصليّ
      //    (اغتيال/قنص/سفّاح) بدور PHOENIX، ومعه احتراقُ المنفّذ. الموجّه يميّزه بالدور.
      { key: 'morning_phoenix_fall',          label: '🔥 سقوط العنقاء',        desc: 'لا رصيدَ نهوضٍ بقي — خرج مع من حاول قتله', cat: 'events', synth: true },
    ],
  },
  {
    label: '💀 الإقصاء — بالدور',
    events: [
      { key: 'elimination_mafia',           label: '🔴 مافيا (الافتراضيّ)',  desc: 'لأيّ مافيا بلا صوتٍ خاصّ',            cat: 'events' },
      { key: 'elimination_citizen',         label: '🔵 مواطن (الافتراضيّ)',  desc: 'لأيّ مواطنٍ بلا صوتٍ خاصّ',           cat: 'events' },
      { key: 'elimination_godfather',       label: '👑 شيخ المافيا',         desc: 'اختياريّ — وإلّا صوت المافيا',        cat: 'events' },
      { key: 'elimination_silencer',        label: '🤐 قصّ المافيا',         desc: 'اختياريّ — وإلّا صوت المافيا',        cat: 'events' },
      { key: 'elimination_chameleon',       label: '🦎 الحرباية',            desc: 'اختياريّ — وإلّا صوت المافيا',        cat: 'events' },
      { key: 'elimination_witch',           label: '🧙 الساحرة',             desc: 'اختياريّ — وإلّا صوت المافيا',        cat: 'events' },
      { key: 'elimination_older_brother',   label: '👥 الأخ الأكبر',         desc: 'اختياريّ — وإلّا صوت المافيا',        cat: 'events' },
      { key: 'elimination_mafia_regular',   label: '🔴 مافيا عاديّ',         desc: 'اختياريّ — وإلّا صوت المافيا',        cat: 'events' },
      { key: 'elimination_sheriff',         label: '🔍 الشريف',              desc: 'اختياريّ — وإلّا صوت المواطن',        cat: 'events' },
      { key: 'elimination_doctor',          label: '💉 الطبيب',              desc: 'اختياريّ — وإلّا صوت المواطن',        cat: 'events' },
      { key: 'elimination_sniper',          label: '🎯 القنّاص',             desc: 'اختياريّ — وإلّا صوت المواطن',        cat: 'events' },
      { key: 'elimination_policewoman',     label: '👮 الشرطيّة',            desc: 'اختياريّ — وإلّا صوت المواطن',        cat: 'events' },
      { key: 'elimination_nurse',           label: '🏥 الممرّضة',            desc: 'اختياريّ — وإلّا صوت المواطن',        cat: 'events' },
      { key: 'elimination_mayor',           label: '🎩 العمدة',              desc: 'اختياريّ — وإلّا صوت المواطن',        cat: 'events' },
      { key: 'elimination_younger_brother', label: '👥 الأخ الأصغر',         desc: 'اختياريّ — وإلّا صوت المواطن',        cat: 'events' },
      { key: 'elimination_phoenix',         label: '🔥 العنقاء',             desc: 'اختياريّ — وإلّا صوت المواطن',        cat: 'events' },
      { key: 'elimination_jester',          label: '🤡 المهرّج',             desc: 'اختياريّ — وإلّا صوت المواطن',        cat: 'events' },
      { key: 'elimination_assassin',        label: '🔪 السفّاح',             desc: 'اختياريّ — وإلّا صوت المواطن',        cat: 'events' },
    ],
  },
  {
    label: '🃏 كشف الكروت والمراسم',
    events: [
      { key: 'card_flip_godfather', label: '👑 كرت الشيخ',     desc: 'عند كشف كرت شيخ المافيا', cat: 'events', synth: true },
      { key: 'card_flip_sheriff',   label: '⭐ كرت الشريف',    desc: 'عند كشف كرت الشريف',      cat: 'events', synth: true },
      { key: 'card_flip_mafia',     label: '🔴 كرت مافيا',     desc: 'عند كشف أيّ كرت مافيا',    cat: 'events', synth: true },
      { key: 'card_flip_citizen',   label: '🔵 كرت مواطن',     desc: 'عند كشف كرت مواطن',       cat: 'events', synth: true },
      { key: 'drumroll',            label: '🥁 طبول الكشف',    desc: 'قبل كشف كرت المُقصى',      cat: 'events', synth: true },
      { key: 'impact_boom',         label: '💥 ضربة الختام',   desc: 'بعد كشف كرت المُقصى',      cat: 'events', synth: true },
      { key: 'bomb_explosion',      label: '💣 انفجار القنبلة', desc: 'عند تفعيل قنبلة الشيخ',    cat: 'events', synth: true },
      { key: 'day_show_silenced',   label: '🤐 كشف المُسكَت',  desc: 'عند كشف المُسكَت نهاراً',   cat: 'events', synth: true },
    ],
  },
  {
    label: '🔄 انتقالات الأطوار',
    events: [
      { key: 'phase_night_start',  label: '🌙 بداية الليل',     desc: 'نغمة الانتقال إلى الليل',    cat: 'transitions', synth: true },
      { key: 'phase_day_start',    label: '☀️ بداية النهار',    desc: 'نغمة الانتقال إلى النهار',   cat: 'transitions', synth: true },
      { key: 'phase_voting_start', label: '🗳️ بداية التصويت',  desc: 'نغمة بدء التصويت',           cat: 'transitions', synth: true },
      { key: 'phase_elimination',  label: '⚡ لحظة الإقصاء',    desc: 'نغمة الانتقال إلى الإقصاء',  cat: 'transitions', synth: true },
      { key: 'day_tie',            label: '🔄 تعادل',           desc: 'عند تعادل التصويت',          cat: 'transitions', synth: true },
      { key: 'voting_complete',    label: '✅ اكتمال التصويت',  desc: 'عند اكتمال كلّ الأصوات',     cat: 'transitions', synth: true },
    ],
  },
  {
    label: '🗳️ التصويت',
    events: [
      { key: 'vote_cast',  label: '🗳️ إضافة صوت',   desc: 'عند كلّ تصويت',              cat: 'votes', synth: true },
      { key: 'vote_shift', label: '🔄 تبدّل الترتيب', desc: 'عند تغيّر المرشّح المتقدّم', cat: 'votes', synth: true },
    ],
  },
  {
    label: '⏱️ المؤقّت',
    events: [
      { key: 'timer_tick',           label: '⏱️ تكّة',         desc: 'آخر ١٠ ثوانٍ من النقاش', cat: 'timer', synth: true },
      { key: 'timer_heartbeat_slow', label: '💓 نبض بطيء',     desc: 'مؤقّت اللعبة: آخر ٦٠ث',  cat: 'timer', synth: true },
      { key: 'timer_heartbeat_fast', label: '💗 نبض سريع',     desc: 'مؤقّت اللعبة: آخر ١٠ث',  cat: 'timer', synth: true },
      { key: 'timer_buzzer',         label: '📢 صافرة',        desc: 'انتهاء الوقت',            cat: 'timer', synth: true },
    ],
  },
  {
    label: '🎉 الاحتفالات',
    events: [
      { key: 'win_mafia',           label: '🔴 فوز المافيا',      desc: 'موسيقى فوز المافيا',                        cat: 'celebration', synth: true },
      { key: 'win_citizen',         label: '🟢 فوز المواطنين',    desc: 'موسيقى فوز المواطنين',                      cat: 'celebration', synth: true },
      { key: 'win_jester',          label: '🤡 فوز المهرّج',      desc: 'موسيقى فوز المهرّج',                        cat: 'celebration', synth: true },
      { key: 'win_assassin',        label: '🔪 فوز السفّاح',      desc: 'موسيقى فوز السفّاح',                        cat: 'celebration', synth: true },
      { key: 'chips_victory_sting', label: '🪙 نغمة النصر المشتراة', desc: 'يستأجرها اللاعب من الخزنة — بلا ملفٍّ لا تُعرض للبيع', cat: 'celebration' },
      { key: 'birthday_song',       label: '🎂 أغنية الميلاد',    desc: 'عند إطلاق احتفاليّة الميلاد',               cat: 'celebration' },
    ],
  },
  {
    label: '🕵️ تنبيهات الموجّه (جهازه وحده)',
    events: [
      { key: 'leader_gallery_alert',   label: '🎭 فتح قائمة المافيا', desc: 'لاعبٌ ضغط زرّ التعرّف على المافيا — نغمة صاعدة', cat: 'monitor', synth: true },
      { key: 'leader_departure_alert', label: '🚪 خروج من التطبيق',   desc: 'لاعبٌ غادر التطبيق — نغمة نازلة',              cat: 'monitor', synth: true },
    ],
  },
];

export const ALL_SOUND_KEYS: SoundKeyDef[] = SOUND_GROUPS.flatMap(g => g.events);

const BY_KEY: Record<string, SoundKeyDef> = Object.fromEntries(ALL_SOUND_KEYS.map(k => [k.key, k]));

export function soundKeyDef(key: string): SoundKeyDef | undefined { return BY_KEY[key]; }

/**
 * فئةُ المقبض لمفتاحٍ — من الكتالوج، وقاعدةٌ احتياطيّة لمفتاحٍ غير معرَّف
 * (كي لا يصمت صوتٌ جديدٌ نُودي قبل تعريفه): الفراشُ خلفيّةُ ليل، وغيرُه حدث.
 */
export function categoryOfKey(key: string): SoundCategory {
  const d = BY_KEY[key];
  if (d) return d.cat;
  if (key.startsWith('ambient_')) return 'ambientNight';
  return 'events';
}

export function keysOfCategory(cat: SoundCategory): string[] {
  return ALL_SOUND_KEYS.filter(k => k.cat === cat).map(k => k.key);
}
