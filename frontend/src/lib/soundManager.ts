// ══════════════════════════════════════════════════════
// 🔊 Sound Manager — مدير الأصوات المركزي
// يجلب الأصوات المخصصة من السيرفر ويشغلها مع Fallback
// ══════════════════════════════════════════════════════

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// ── خريطة الأصوات المخصصة (يتم تحميلها مرة واحدة) ──
let customSoundMap: Record<string, string> = {};
let preloadedAudios: Record<string, HTMLAudioElement> = {};
let isLoaded = false;

// ── الأصوات الحالية التي تعمل (للتحكم بالإيقاف) ──
let ambientAudio: HTMLAudioElement | null = null;
let ambientKey: string | null = null;
/** مستوى الفراش كما أرسله الموجّه — تُعيده `retryAmbient` بدل حسابه محلّيّاً. */
let ambientVol: number | null = null;

// ── الأصوات المقطعية الجارية (one-shot) — تُتعقَّب ليمكن إيقافها (مثل أغنية الفوز عند العودة للوبي) ──
const oneShotAudios: Set<HTMLAudioElement> = new Set();
function trackOneShot(a: HTMLAudioElement): void {
  oneShotAudios.add(a);
  a.addEventListener('ended', () => oneShotAudios.delete(a));
}

// ══════════════════════════════════════════════════════
// 🔊 مرآة الأصوات — شاشة العرض «القائد» تبثّ كل صوت لتُعيده شاشة الليدر «التابع»
// - تُسجّل شاشة العرض callback عبر setSoundMirror فتبثّ كل نداء صوت.
// - الدوالّ العامّة (المُصدَّرة) تبثّ مرّة واحدة ثم تُنفّذ الـ impl الداخلية.
// - الـ impl الداخلية (_fn) تستدعي بعضها فقط ⇒ بثّ واحد بالضبط لكل نداء، بلا حلقة.
// - المُستقبِل (الليدر) لا يُسجّل باعثاً ⇒ applyRemoteSound تستدعي impl مباشرةً بلا بثّ راجع.
// ══════════════════════════════════════════════════════
type MirrorPayload = { fn: string; args: any[]; vol?: number };
let mirrorEmit: ((p: MirrorPayload) => void) | null = null;

export function setSoundMirror(cb: ((p: MirrorPayload) => void) | null): void {
  mirrorEmit = cb;
}

// ── تشغيل محلي: القائد (الليدر) = true فيُشغّل ويبثّ؛ التابع (العرض) = false فلا يُقرّر صوتاً بنفسه ──
// نداءات الصوت المحلية في شاشة العرض تصبح بلا مفعول؛ لكن applyRemoteSound (ما يصل من الليدر) يبقى يعمل
// لأنه يستدعي الدوالّ الداخلية (_impl) مباشرةً متجاوزاً هذه البوابة.
let localPlaybackEnabled = true;
export function setLocalPlayback(enabled: boolean): void {
  localPlaybackEnabled = enabled;
}

// ── 🔇 كتم هذا الجهاز وحده — منفصل تماماً عن البثّ للقاعة ─────────────
//
// ⚠️ لماذا يجب أن يكون منفصلاً: زرّ الكتم في شاشة الليدر كان يعود **قبل**
//    استدعاء دوالّ الصوت، والبثّ للقاعة يُطلَق من داخل تلك الدوالّ — فكتم
//    جهاز الليدر (ردّ فعل طبيعي عند صدى السماعات) كان يُسكت القاعة كلها:
//    أصوات الأطوار، والإقصاء، وأغنية الميلاد، ونغمة النصر التي دفع لاعب
//    مالاً حقيقياً ثمنها. والحالة محفوظة محلياً فتنجو عبر الجلسات.
//
//    الآن: البثّ يقع دائماً، والكتم يمنع **التشغيل المحلي فقط**.
let localMuted = false;
export function setLocalMuted(muted: boolean): void {
  localMuted = muted;
  // إسكات ما يعمل الآن على هذا الجهاز — بلا بثّ إيقاف للقاعة
  if (muted) { try { _stopOneShotSounds(); _stopAmbientSound(); } catch { /* تجاهل */ } }
}
export function isLocalMuted(): boolean { return localMuted; }

// ══════════════════════════════════════════════════════
// 🔈 AudioContext مشترَك — يُنشأ ويُستأنف عند أول تفاعل ويُعاد استخدامه لكل الأصوات المُركّبة
// إنشاء سياق جديد لكل صوت (خاصة داخل setInterval للمؤقّت) يبقى «suspended» على الجوال/Safari
// فلا يصدر صوت، كما يستنزف حدّ عدد السياقات. سياق واحد مستأنَف يحلّ المشكلتين.
// ══════════════════════════════════════════════════════
let sharedCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    const ctx: AudioContext = sharedCtx || (sharedCtx = new AC());
    if (ctx.state === 'suspended') { void ctx.resume().catch(() => {}); }
    return ctx;
  } catch { return null; }
}

// ── 🔕→🔊 iOS/iPadOS: الوضع الصامت يكتم Web Audio عبر السمّاعة المدمجة فقط
// (لا يكتم ملفات الوسائط HTMLAudio، والسماعات الخارجية تتجاوزه — لذا «يعمل مع سماعة فقط»).
// الحل المعروف (unmute hack): <audio> صامت يعمل بحلقة يُرقّي جلسة الصفحة لفئة «تشغيل وسائط»
// فتُسمَع أصوات Web Audio (تكّات المؤقّت/الجرس/synth) من سماعة الجهاز حتى مع الوضع الصامت.
let silentKeepAlive: HTMLAudioElement | null = null;
function buildSilentWavUrl(seconds = 0.5): string {
  const rate = 8000;
  const n = Math.floor(rate * seconds);
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);   // صمت PCM 8-bit
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
function startSilentKeepAlive(): void {
  try {
    if (!silentKeepAlive) {
      const a = new Audio(buildSilentWavUrl());
      a.loop = true;
      (a as any).playsInline = true;
      silentKeepAlive = a;
      // iOS يوقف الصوت عند إخفاء الصفحة — أعد تشغيله واستئناف السياق عند العودة
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            silentKeepAlive?.play().catch(() => {});
            if (sharedCtx && sharedCtx.state === 'suspended') { void sharedCtx.resume().catch(() => {}); }
          }
        });
      }
    }
    silentKeepAlive.play().catch(() => {});
  } catch {}
}

/** تشغيل صوت محلياً على هذا الجهاز فقط — بلا بثّ للمرآة (لتنبيهات الليدر السرّية كتنبيه فتح قائمة المافيا). */
export function playLocalSound(eventKey: string): void {
  _playGameSound(eventKey);
}

/** يُهيّئ/يستأنف السياق الصوتي — يجب استدعاؤه داخل معالج تفاعل (نقرة/لمسة) لفكّ الحظر على الجوال. */
export function primeAudio(): void {
  const c = getAudioCtx();
  if (c && c.state === 'suspended') { void c.resume().catch(() => {}); }
  startSilentKeepAlive();   // يفكّ كتم Web Audio على سماعة iPad في الوضع الصامت
}

// ══════════════════════════════════════════════════════
// 📥 تحميل خريطة الأصوات المخصصة من السيرفر
// يُستدعى مرة واحدة عند فتح شاشة العرض
// ══════════════════════════════════════════════════════
export async function loadSoundMap(): Promise<void> {
  if (isLoaded) return;
  try {
    const res = await fetch(`${API_URL}/api/sounds/active-map`);
    const data = await res.json();
    if (data.success && data.map) {
      customSoundMap = data.map;

      // Pre-load كل الملفات الصوتية
      for (const [key, url] of Object.entries(customSoundMap)) {
        try {
          const fullUrl = `${API_URL}${url}`;
          const audio = new Audio(fullUrl);
          audio.preload = 'auto';
          audio.load();
          preloadedAudios[key] = audio;
        } catch {}
      }

      const count = Object.keys(customSoundMap).length;
      if (count > 0) {
        console.log(`🔊 SoundManager: Loaded ${count} custom sound(s)`);
      }
    }
  } catch (err) {
    console.warn('⚠️ SoundManager: Failed to load custom sounds', err);
  }
  isLoaded = true;
}

// ══════════════════════════════════════════════════════
// 🔄 إعادة تحميل الخريطة (عند تحديث الأصوات من الأدمن)
// ══════════════════════════════════════════════════════
export async function reloadSoundMap(): Promise<void> {
  isLoaded = false;
  customSoundMap = {};
  preloadedAudios = {};
  await loadSoundMap();
}

// ══════════════════════════════════════════════════════
// 🎵 تشغيل صوت حدث (مع Fallback للأصوات الافتراضية)
// ══════════════════════════════════════════════════════
export function playGameSound(eventKey: string): void {
  if (!localPlaybackEnabled) return;
  mirrorEmit?.({ fn: 'playGameSound', args: [eventKey], vol: resolveVol(eventKey) });
  if (!localMuted) _playGameSound(eventKey);
}
// ── مستوى الصوت لكل مفتاح (افتراضي 0.7) — أصوات المؤقّت/التصويت بمستوى كامل؛ تنبيه الليدر مخفّض لطيف ──
const VOLUME_BY_KEY: Record<string, number> = {
  timer_tick: 1.0, timer_heartbeat_fast: 1.0, timer_heartbeat_slow: 0.9, timer_buzzer: 1.0,
  vote_cast: 1.0, vote_shift: 0.9, voting_complete: 0.9,
  leader_gallery_alert: 0.5, leader_departure_alert: 0.6,
};


// ══════════════════════════════════════════════════════
// 🎚️ مازج الصوت — خمس فئات، لكلٍّ مستوى
//
// 🔴 المستوى **حاصل ضرب** لا استبدال: `فئة × مفتاح`. خفضُ فئة المؤقّت إلى
//    النصف يُبقي التدرّج بين التكّة (1.0) والنبض البطيء (0.9) بدل أن يسوّيهما.
//
// 🔴 والمقابض تضبط **القاعة والموجّه معاً** (قرار المالك): المستوى يُحسب عند
//    الموجّه ويُرسَل مع البثّ فتُشغّله الشاشة به. مقبضٌ واحدٌ لكلّ فئة ولا حيرة
//    أيّهما يعمل. وزرّ الكتم يبقى لحالته الخاصّة: «كتم جهازي والقاعة تسمع».
//
// 🔴 والفئتان الأخيرتان تنبيهان للموجّه وحده — لا تُبثّان للقاعة أصلاً
//    (playLocalSound لا يمرّ بالمرآة)، فمستواهما شأن أذنه لا شأن الطاولة.
// ══════════════════════════════════════════════════════

export type SoundCategory = 'alerts' | 'ambientVote' | 'ambientNight' | 'victory' | 'timer' | 'departure' | 'gallery';

export const SOUND_CATEGORIES: { key: SoundCategory; labelAr: string; icon: string; hallToo: boolean }[] = [
  { key: 'alerts',      labelAr: 'التنبيهات العامّة',   icon: '🔔', hallToo: true },
  { key: 'ambientVote', labelAr: 'خلفيّة التصويت والتبرير', icon: '🗳️', hallToo: true },
  { key: 'ambientNight',labelAr: 'خلفيّة الليل وباقي المراحل', icon: '🌙', hallToo: true },
  { key: 'victory',   labelAr: 'موسيقى الفوز',      icon: '🏆', hallToo: true },
  { key: 'timer',     labelAr: 'المؤقّت والصافرة',   icon: '⏱️', hallToo: true },
  { key: 'departure', labelAr: 'خروجٌ من التطبيق',  icon: '🚪', hallToo: false },
  { key: 'gallery',   labelAr: 'فتح قائمة المافيا', icon: '🎭', hallToo: false },
];

const DEFAULT_LEVELS: Record<SoundCategory, number> = {
  alerts: 0.70, ambientVote: 0.30, ambientNight: 0.30,
  victory: 0.90, timer: 1.00, departure: 0.45, gallery: 0.35,
};

/** المفاتيح التي لا تقع في «التنبيهات العامّة». ما عداها يقع فيها. */
const CATEGORY_OF: Record<string, SoundCategory> = {
  win_mafia: 'victory', win_citizen: 'victory', win_assassin: 'victory',
  win_jester: 'victory', birthday_song: 'victory',
  timer_tick: 'timer', timer_heartbeat_slow: 'timer',
  timer_heartbeat_fast: 'timer', timer_buzzer: 'timer',
  leader_departure_alert: 'departure',
  leader_gallery_alert: 'gallery',
  // 🔴 أصوات الخلفيّة تُفصَل عن التنبيهات: فراشٌ مستمرّ يزاحم الكلام
  //    لا نغمةٌ عابرة، وحاجته للخفض مختلفة تماماً.
  //    وخلفيّة التصويت وحدها لأنّها تعمل والطاولة تتكلّم وتتداول.
  ambient_voting: 'ambientVote',
  ambient_justification: 'ambientVote',   // التبرير امتدادُ التصويت: الطاولة تسمع وتتداول
  ambient_night: 'ambientNight',
  ambient_lobby: 'ambientNight',
  ambient_night_kill: 'ambientNight',
  ambient_night_silence: 'ambientNight',
  ambient_night_assassin: 'ambientNight',
  ambient_night_snipe: 'ambientNight',
  ambient_night_protect: 'ambientNight',
  ambient_night_investigate: 'ambientNight',
};

/** المستوى الأساسيّ لفراش الخلفيّة قبل ضربه بالفئة (وعند الخفض التلقائيّ). */
const AMBIENT_BASE = 1.0;
const AMBIENT_DUCK = 0.27;   // 0.08/0.3 — نفس النسبة القديمة، محفوظةً كنسبة لا رقماً

export function categoryOf(eventKey: string): SoundCategory {
  const c = CATEGORY_OF[eventKey];
  if (c) return c;
  // 🔴 قاعدةٌ لا تعداد: ambient_day وambient_morning وambient_elimination كانت
  //    تقع في «التنبيهات العامّة» — فمقبض التنبيهات يخفض فراشاً، ومقبض الخلفيّة
  //    لا يمسّه. وأيّ فراشٍ يُضاف غداً يدخل الفئة الصحيحة من تلقائه.
  if (eventKey.startsWith('ambient_')) return 'ambientNight';
  return 'alerts';
}

const LEVELS_KEY = 'mafia_sound_levels';
let levels: Record<SoundCategory, number> = { ...DEFAULT_LEVELS };

(function loadLevels() {
  try {
    const raw = localStorage.getItem(LEVELS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    for (const c of SOUND_CATEGORIES) {
      const v = parsed?.[c.key];
      if (typeof v === 'number' && v >= 0 && v <= 1) levels[c.key] = v;
    }
  } catch { /* تصفّح خاصّ أو قيمة تالفة — تبقى الافتراضيّات */ }
})();

export function getSoundLevels(): Record<SoundCategory, number> { return { ...levels }; }
export function getDefaultSoundLevels(): Record<SoundCategory, number> { return { ...DEFAULT_LEVELS }; }

export function setSoundLevel(cat: SoundCategory, v: number): void {
  levels[cat] = Math.max(0, Math.min(1, v));
  try { localStorage.setItem(LEVELS_KEY, JSON.stringify(levels)); } catch { /* تصفّح خاصّ */ }
  syncAmbientVolume(cat);
}

/**
 * 🔴 فراش الخلفيّة يتغيّر **وهو يعمل**. خلاف النغمة العابرة، الفراش
 * يستمرّ دقائق — فمستوىً يسري على «المرّة القادمة» لا ينفع موجّهاً
 * يخفض صوتاً يزاحم الطاولة الآن. ويُبَثّ للقاعة فتتغيّر معه.
 */
function syncAmbientVolume(cat?: SoundCategory): void {
  if (!ambientKey || !ambientAudio) return;
  if (cat && categoryOf(ambientKey) !== cat) return;
  const v = resolveVol(ambientKey) * AMBIENT_BASE;
  try { ambientAudio.volume = Math.max(0, Math.min(1, v)); } catch { /* تجاهل */ }
  mirrorEmit?.({ fn: 'setAmbientVolume', args: [], vol: v });
}

/** يُطبّق مستوى الموجّه على فراش الشاشة الجاري. */
function _setAmbientVolume(): void {
  if (!ambientAudio) return;
  const v = volOverride;
  if (typeof v !== 'number') return;
  try { ambientAudio.volume = Math.max(0, Math.min(1, v)); } catch { /* تجاهل */ }
}

export function resetSoundLevels(): void {
  levels = { ...DEFAULT_LEVELS };
  try { localStorage.setItem(LEVELS_KEY, JSON.stringify(levels)); } catch { /* تصفّح خاصّ */ }
  syncAmbientVolume();
}

// 🔴 المستوى الواصل من الموجّه يعلو حساب الشاشة: الشاشة جهازٌ آخر بلا إعدادات
//    الموجّه، فلو حسبت بنفسها لسمعت القاعة مستوىً غير الذي ضبطه.
let volOverride: number | null = null;

/**
 * المستوى النهائيّ لمفتاح — أو ما فرضه الموجّه إن كنّا شاشةً تابعة.
 *
 * 🔴 وفراش الخلفيّة معامله ١ لا ٠٫٧. الافتراضيّ ٠٫٧ وُضع للنغمات العابرة كي
 *    لا تصكّ الأذن، لكنّ الفراش لا مفتاحَ له في VOLUME_BY_KEY — فكان يُضرب
 *    بـ٠٫٧ صامتاً: المقبض يقول ٣٠٪ والقاعة تسمع ٢١٪، والخفض التلقائيّ ٥٫٧٪
 *    بدل ٨٪. أي أنّ إدخال الفراش في المازج خفضه ٣٠٪ عمّا كان — وهو ما يُفقد
 *    فراشاً هادئاً وسط طاولةٍ تتجادل. مستوى الفئة **هو** مستوى الفراش.
 */
function resolveVol(eventKey: string): number {
  if (volOverride != null) return volOverride;
  const keyMul = VOLUME_BY_KEY[eventKey] ?? (eventKey.startsWith('ambient_') ? 1 : 0.7);
  return levels[categoryOf(eventKey)] * keyMul;
}

/** حارسٌ للإسناد: volume خارج [0,1] أو NaN يرمي فيُسكت الفراش بلا أثر. */
function clampVol(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.3;
}

function _playGameSound(eventKey: string): void {
  const vol = resolveVol(eventKey);
  // أولاً: فحص الأصوات المخصصة
  if (customSoundMap[eventKey]) {
    try {
      const audio = preloadedAudios[eventKey];
      if (audio) {
        // إنشاء نسخة جديدة لتجنب تداخل التشغيل
        const clone = audio.cloneNode(true) as HTMLAudioElement;
        clone.volume = vol;
        trackOneShot(clone);
        clone.play().catch(() => {});
        return;
      }
      // Fallback: تحميل مباشر
      const newAudio = new Audio(`${API_URL}${customSoundMap[eventKey]}`);
      newAudio.volume = vol;
      trackOneShot(newAudio);
      newAudio.play().catch(() => {});
      return;
    } catch {}
  }

  // ثانياً: تشغيل الصوت الافتراضي (Web Audio API) — بنفس المستوى المحسوب
  playDefaultSound(eventKey, vol);
}

// ══════════════════════════════════════════════════════
// 🌙 تشغيل صوت خلفي (Ambient) — يتكرر حتى الإيقاف
// ══════════════════════════════════════════════════════
export function playAmbientSound(eventKey: string): void {
  if (!localPlaybackEnabled) return;
  mirrorEmit?.({ fn: 'playAmbientSound', args: [eventKey], vol: resolveVol(eventKey) });
  if (!localMuted) _playAmbientSound(eventKey);
}
function _playAmbientSound(eventKey: string): void {
  // إيقاف أي صوت خلفي سابق
  _stopAmbientSound();

  if (customSoundMap[eventKey]) {
    try {
      const audio = new Audio(`${API_URL}${customSoundMap[eventKey]}`);
      audio.loop = true;
      ambientAudio = audio;
      ambientKey = eventKey;
      // 🔴 المستوى في try خاصّته و**قبله** التسجيل، والتشغيل بعده: كان إسناد
      //    volume يسبق play داخل try واحد، فرميةٌ منه (قيمةٌ شاذّة أو NaN)
      //    تبتلع النداء كلّه فيصمت الفراش بلا أثرٍ في الطرفيّة.
      try {
        ambientVol = resolveVol(eventKey);
        audio.volume = clampVol(ambientVol * AMBIENT_BASE);
      } catch { /* يبقى الافتراضيّ */ }
      audio.play().catch(() => {});
      return;
    } catch {}
  }

  // لا يوجد صوت خلفي افتراضي — يعمل فقط بملف مخصص
  ambientKey = eventKey;
}

/**
 * يُعيد تشغيل فراش الخلفيّة الحاليّ إن كان صامتاً — بعد فكّ قفل التشغيل التلقائيّ.
 *
 * 🔴 شاشةُ العرض تابعةٌ لا تُقرّر صوتاً، فكلُّ نداءٍ محلّيّ فيها بلا مفعول
 *    (`setLocalPlayback(false)`) — وفيها «فراشٌ معلّق» يُعاد عند أوّل لمسة،
 *    وهو نداءٌ محلّيّ فلا يعمل. والنتيجة: فراشٌ يصل من الموجّه قبل أن تُلمس
 *    الشاشة يرفضه المتصفّح ولا يُعاد أبداً. هذه تتجاوز البوّابة كما تفعل
 *    `applyRemoteSound`، وتُنادى داخل معالج اللمسة.
 *
 * 🔴 وتفحص `paused` لا وجودَ الكائن: `play()` المرفوضة تترك الكائن قائماً
 *    ومتوقّفاً، فاختبارُ الوجود وحده كان سيراه «يعمل».
 */
export function retryAmbient(): boolean {
  if (!ambientKey || localMuted) return false;
  if (ambientAudio && !ambientAudio.paused) return false;
  // 🔴 يُعاد بمستوى الموجّه لا بحساب الشاشة: هي جهازٌ آخر بلا إعداداته،
  //    ولو حسبت بنفسها لعادت القاعةُ بمستوىً غير الذي ضُبط لها.
  const prev = volOverride;
  volOverride = ambientVol;
  try { _playAmbientSound(ambientKey); } finally { volOverride = prev; }
  return true;
}

// ══════════════════════════════════════════════════════
// ⏹️ إيقاف الصوت الخلفي
// ══════════════════════════════════════════════════════
export function stopAmbientSound(): void {
  if (!localPlaybackEnabled) return;
  mirrorEmit?.({ fn: 'stopAmbientSound', args: [] });
  if (!localMuted) _stopAmbientSound();
}
function _stopAmbientSound(): void {
  if (ambientAudio) {
    ambientAudio.pause();
    ambientAudio.currentTime = 0;
    ambientAudio = null;
    ambientKey = null;
    ambientVol = null;
  }
}

// ══════════════════════════════════════════════════════
// ⏹️ إيقاف كل الأصوات المقطعية الجارية (أغنية فوز، مؤثّر طويل…)
// يُستدعى عند العودة للوبي/إعادة اللعبة أو عند الكتم
// ══════════════════════════════════════════════════════
export function stopOneShotSounds(): void {
  if (!localPlaybackEnabled) return;
  mirrorEmit?.({ fn: 'stopOneShotSounds', args: [] });
  if (!localMuted) _stopOneShotSounds();
}
function _stopOneShotSounds(): void {
  oneShotAudios.forEach((a) => {
    try { a.pause(); a.currentTime = 0; } catch {}
  });
  oneShotAudios.clear();
}

// ══════════════════════════════════════════════════════
// 🔉 خفض صوت الخلفية مؤقتاً (عند تشغيل حدث)
// ══════════════════════════════════════════════════════
export function duckAmbient(): void {
  if (!localPlaybackEnabled) return;
  mirrorEmit?.({ fn: 'duckAmbient', args: [] });
  if (!localMuted) _duckAmbient();
}
function _duckAmbient(): void {
  // 🔴 نسبةٌ من مستوى الفئة لا رقمٌ مطلق: من خفض الخلفيّة إلى ١٠٪
  //    كان الخفض التلقائيّ **يرفعها** إلى 0.08 بدل أن يخفضها.
  if (ambientAudio && ambientKey) {
    ambientAudio.volume = clampVol(resolveVol(ambientKey) * AMBIENT_BASE * AMBIENT_DUCK);
  }
}

export function unduckAmbient(): void {
  if (!localPlaybackEnabled) return;
  mirrorEmit?.({ fn: 'unduckAmbient', args: [] });
  if (!localMuted) _unduckAmbient();
}
function _unduckAmbient(): void {
  if (ambientAudio && ambientKey) {
    ambientAudio.volume = clampVol(resolveVol(ambientKey) * AMBIENT_BASE);
  }
}

// ══════════════════════════════════════════════════════
// 🎵 تشغيل صوت حدث مع Duck/Unduck تلقائي للخلفية
// ══════════════════════════════════════════════════════
export function playEventSound(eventKey: string, durationMs: number = 3000): void {
  if (!localPlaybackEnabled) return;
  mirrorEmit?.({ fn: 'playEventSound', args: [eventKey, durationMs], vol: resolveVol(eventKey) });
  if (!localMuted) _playEventSound(eventKey, durationMs);
}
function _playEventSound(eventKey: string, durationMs: number = 3000): void {
  // خفض الخلفية
  _duckAmbient();

  // تشغيل صوت الحدث
  _playGameSound(eventKey);

  // إعادة الخلفية بعد المدة
  setTimeout(() => _unduckAmbient(), durationMs);
}

// ══════════════════════════════════════════════════════
// 💀 تشغيل صوت الإقصاء حسب الدور (مع Fallback للفريق)
// ══════════════════════════════════════════════════════
const MAFIA_ROLE_KEYS = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'WITCH', 'OLDER_BROTHER', 'MAFIA_REGULAR'];

export function playEliminationSound(role: string | null): void {
  if (!localPlaybackEnabled) return;
  mirrorEmit?.({ fn: 'playEliminationSound', args: [role] });
  if (!localMuted) _playEliminationSound(role);
}
function _playEliminationSound(role: string | null): void {
  if (!role) {
    _playGameSound('elimination_citizen');
    return;
  }

  const roleUpper = role.toUpperCase();

  // 1. محاولة صوت الدور المحدد
  const roleKey = `elimination_${roleUpper.toLowerCase()}`;
  if (customSoundMap[roleKey]) {
    _playEventSound(roleKey, 5000);
    return;
  }

  // 2. Fallback لصوت الفريق
  const isMafia = MAFIA_ROLE_KEYS.includes(roleUpper);
  _playEventSound(isMafia ? 'elimination_mafia' : 'elimination_citizen', 5000);
}

// ══════════════════════════════════════════════════════
// 🌙 تشغيل صوت خلفي لخطوة ليلية (مع Fallback لـ ambient_night)
// ══════════════════════════════════════════════════════
const NIGHT_STEP_AMBIENT_MAP: Record<string, string> = {
  'GODFATHER': 'ambient_night_kill',
  'CHAMELEON': 'ambient_night_kill',
  'MAFIA_REGULAR': 'ambient_night_kill',
  'SILENCER': 'ambient_night_silence',
  'SHERIFF': 'ambient_night_investigate',
  'DOCTOR': 'ambient_night_protect',
  'NURSE': 'ambient_night_protect',
  'SNIPER': 'ambient_night_snipe',
  'ASSASSIN': 'ambient_night_assassin',
  // Dynamic engine ability IDs
  'KILL': 'ambient_night_kill',
  'SILENCE': 'ambient_night_silence',
  'INVESTIGATE': 'ambient_night_investigate',
  'PROTECT': 'ambient_night_protect',
  'SNIPE': 'ambient_night_snipe',
};

export function playNightStepAmbient(stepType: string): void {
  if (!localPlaybackEnabled) return;
  // 🔴 المستوى يُرسَل معه كبقيّة الأصوات: كان يُبثّ عارياً فتحسبه الشاشة
  //    بمقابضها هي لا بمقابض الموجّه — فينفلت فراشُ الخطوة وحده من المازج.
  const stepKey = NIGHT_STEP_AMBIENT_MAP[stepType.toUpperCase()];
  mirrorEmit?.({ fn: 'playNightStepAmbient', args: [stepType], vol: stepKey ? resolveVol(stepKey) : undefined });
  if (!localMuted) _playNightStepAmbient(stepType);
}
function _playNightStepAmbient(stepType: string): void {
  const stepKey = NIGHT_STEP_AMBIENT_MAP[stepType.toUpperCase()];
  if (stepKey && customSoundMap[stepKey]) {
    _playAmbientSound(stepKey);
  }
  // إذا لا يوجد صوت مخصص للخطوة → يبقى ambient_night الحالي يعمل
}

// ══════════════════════════════════════════════════════
// 🔊 الأصوات الافتراضية (Web Audio API Fallback)
// ══════════════════════════════════════════════════════
// ════════════════════════════════════════
// 🎚️ بوّابة الكسب — كي يسمع المستوى صوتُ Web Audio أيضاً
//
// 🔴 كانت الأصوات الافتراضيّة (٣٥ موضعاً) تصل ctx.destination مباشرةً،
//    فالمستوى يُطبّق على الملفّات المرفوعة وحدها. أيّ صوتٍ بلا ملفّ
//    مخصّص كان يتجاهل المازج تماماً — فيبدو المقبض معطّلاً وهو يعمل.
//
//    وعقدة الكسب **لكلّ نداء** لا واحدةٌ مشتركة: الأصوات تتداخل،
//    ومقبضٌ مشترك كان سيغيّر مستوى صوتٍ ما زال يعمل. وبناء الرسم
//    متزامنٌ داخل النداء، فالعقدة الجارية صحيحةٌ طوال بنائه.
// ════════════════════════════════════════
let callGain: GainNode | null = null;
function dest(ctx: AudioContext): AudioNode { return callGain ?? ctx.destination; }

function playDefaultSound(eventKey: string, vol: number = 1): void {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const g = ctx.createGain();
    g.gain.value = Math.max(0, Math.min(1, vol));
    g.connect(ctx.destination);
    callGain = g;

    switch (eventKey) {
      // ── أحداث الليل ──
      case 'night_assassination':
      case 'morning_assassination_success': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
        break;
      }

      // ══ 🔥 العنقاء — ثلاثةُ أصوات، لكلٍّ شكلُه ══
      // 🔴 افتراضيّاتٌ مركّبة كي لا يصمت الحدثُ قبل رفع الملفّات، ولا يُستعار
      //    صوتُ اغتيالٍ ناجحٍ لحدثٍ لم يُقتل فيه أحد.

      // نهوضٌ: صعودٌ من القرار — تردّدٌ يرتفع مع رنينٍ متأخّر
      case 'morning_phoenix_rebirth': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(120, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.55);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.38, ctx.currentTime + 0.35);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.0);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 1.0);
        break;
      }

      // احتراق: ضوضاءٌ بيضاءُ مرشَّحةٌ تهبط — لهبٌ يخبو
      case 'morning_phoenix_burn': {
        const dur = 0.9;
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1800, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + dur);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.45, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur);
        src.connect(filter); filter.connect(gain); gain.connect(dest(ctx));
        src.start(ctx.currentTime); src.stop(ctx.currentTime + dur);
        break;
      }

      // لعنةُ الرماد: نغمتان تهبطان معاً — اثنان يخرجان لا واحد
      case 'morning_phoenix_ash': {
        for (const [f, delay] of [[660, 0], [440, 0.18]] as [number, number][]) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(dest(ctx));
          osc.type = 'sawtooth';
          const t0 = ctx.currentTime + delay;
          osc.frequency.setValueAtTime(f, t0);
          osc.frequency.exponentialRampToValueAtTime(f * 0.25, t0 + 0.6);
          gain.gain.setValueAtTime(0.32, t0);
          gain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.7);
          osc.start(t0); osc.stop(t0 + 0.7);
        }
        break;
      }

      case 'night_protection':
      case 'morning_protection_success': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
        break;
      }

      case 'night_snipe':
      case 'morning_snipe_mafia':
      case 'morning_snipe_citizen': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'square';
        osc.frequency.setValueAtTime(2000, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
        break;
      }

      case 'night_investigation': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.8);
        break;
      }

      case 'night_silence':
      case 'morning_silenced': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.6);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
        break;
      }

      // ── كشف الكروت ──
      case 'card_flip_godfather': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.8);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.8);
        break;
      }

      case 'card_flip_sheriff': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523, ctx.currentTime);
        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15);
        osc.frequency.setValueAtTime(784, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
        break;
      }

      case 'card_flip_mafia': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
        break;
      }

      case 'card_flip_citizen': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
        break;
      }

      // ── فوز ──
      case 'win_mafia': {
        const playDarkNote = (freq: number, start: number, dur: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
          osc.frequency.exponentialRampToValueAtTime(freq * 0.7, ctx.currentTime + start + dur);
          gain.gain.setValueAtTime(0, ctx.currentTime + start);
          gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + start + 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
          osc.connect(gain).connect(dest(ctx));
          osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur);
        };
        playDarkNote(110, 0, 2); playDarkNote(92, 0.3, 2); playDarkNote(82, 0.6, 2.5);
        playDarkNote(65, 1, 3); playDarkNote(55, 1.5, 3);
        break;
      }

      case 'win_citizen': {
        const playBrightNote = (freq: number, start: number, dur: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
          gain.gain.setValueAtTime(0, ctx.currentTime + start);
          gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + start + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
          osc.connect(gain).connect(dest(ctx));
          osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur);
        };
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => playBrightNote(f, i * 0.25, 0.6));
        playBrightNote(262, 0, 2.5); playBrightNote(330, 0.5, 2); playBrightNote(392, 1, 2);
        break;
      }

      // 🤡 فوز المهرج — ضحك هستيري مشوّه
      case 'win_jester': {
        const playJesterNote = (freq: number, start: number, dur: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
          osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + start + dur * 0.3);
          osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + start + dur);
          gain.gain.setValueAtTime(0, ctx.currentTime + start);
          gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + start + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
          osc.connect(gain).connect(dest(ctx));
          osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur);
        };
        [440, 880, 330, 660, 550, 1100, 220].forEach((f, i) => playJesterNote(f, i * 0.2, 0.4));
        playJesterNote(110, 1.5, 2);
        break;
      }

      // 🔪 فوز السفّاح — طعنات متتابعة
      case 'win_assassin': {
        const playStabNote = (freq: number, start: number, dur: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
          osc.frequency.exponentialRampToValueAtTime(freq * 0.3, ctx.currentTime + start + dur);
          gain.gain.setValueAtTime(0.2, ctx.currentTime + start);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
          osc.connect(gain).connect(dest(ctx));
          osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur);
        };
        [600, 500, 400, 300, 200].forEach((f, i) => playStabNote(f, i * 0.3, 0.4));
        playStabNote(80, 1.5, 3);
        break;
      }

      // ── مؤقت (مستوى مرتفع وواضح — طبقة نقرة عالية فوق النبضة لأن 60Hz وحدها لا تُسمع على سماعات الأجهزة اللوحية) ──
      case 'timer_heartbeat_slow': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, ctx.currentTime);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.28, ctx.currentTime + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
        // نقرة عالية مسموعة
        const click = ctx.createOscillator();
        const cg = ctx.createGain();
        click.connect(cg); cg.connect(dest(ctx));
        click.type = 'triangle';
        click.frequency.setValueAtTime(700, ctx.currentTime);
        cg.gain.setValueAtTime(0.18, ctx.currentTime);
        cg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        click.start(ctx.currentTime); click.stop(ctx.currentTime + 0.08);
        break;
      }

      case 'timer_heartbeat_fast': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'sine';
        osc.frequency.setValueAtTime(90, ctx.currentTime);
        gain.gain.setValueAtTime(0.6, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.4, ctx.currentTime + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
        // نقرة عالية حادّة — تُسمع بوضوح في القاعة
        const click = ctx.createOscillator();
        const cg = ctx.createGain();
        click.connect(cg); cg.connect(dest(ctx));
        click.type = 'square';
        click.frequency.setValueAtTime(950, ctx.currentTime);
        cg.gain.setValueAtTime(0.3, ctx.currentTime);
        cg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
        click.start(ctx.currentTime); click.stop(ctx.currentTime + 0.09);
        break;
      }

      case 'timer_tick': {
        // نقرة مزدوجة الطبقات — أعلى وأوضح من السابق بكثير
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'square';
        osc.frequency.setValueAtTime(1100, ctx.currentTime);
        gain.gain.setValueAtTime(0.45, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.09);
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.connect(g2); g2.connect(dest(ctx));
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(2200, ctx.currentTime);
        g2.gain.setValueAtTime(0.18, ctx.currentTime);
        g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
        osc2.start(ctx.currentTime); osc2.stop(ctx.currentTime + 0.06);
        break;
      }

      case 'timer_buzzer': {
        // صافرة نهاية أقوى وأطول — طبقتان متنافرتان للإلحاح
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'square';
        osc.frequency.setValueAtTime(180, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 1.1);
        gain.gain.setValueAtTime(0.55, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.1);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 1.1);
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.connect(g2); g2.connect(dest(ctx));
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(360, ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 1.0);
        g2.gain.setValueAtTime(0.3, ctx.currentTime);
        g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
        osc2.start(ctx.currentTime); osc2.stop(ctx.currentTime + 1.0);
        break;
      }

      // ── 🕵️ تنبيه الليدر: لاعب فتح قائمة التعرف على المافيا — ثلاث نغمات صاعدة حادّة ──
      // 🚪 خروجٌ من التطبيق — نغمةٌ **نازلة** تميّزه عن فتح القائمة (صاعدة).
      //    المعنى في الاتّجاه: يصعد = فُتح شيء، ينزل = خرج أحد. فيميّزهما
      //    الموجّه بأذنه دون أن ينظر — وكانا نغمةً واحدة لحدثَين مختلفَين تماماً.
      case 'leader_departure_alert': {
        [740, 555, 415].forEach((f, i) => {
          const osc = ctx.createOscillator();
          const g2 = ctx.createGain();
          osc.connect(g2); g2.connect(dest(ctx));
          osc.type = 'triangle';
          const at = ctx.currentTime + i * 0.14;
          osc.frequency.setValueAtTime(f, at);
          g2.gain.setValueAtTime(0.34, at);
          g2.gain.exponentialRampToValueAtTime(0.001, at + 0.17);
          osc.start(at); osc.stop(at + 0.17);
        });
        break;
      }

      case 'leader_gallery_alert': {
        [880, 1320, 1760].forEach((f, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.connect(g); g.connect(dest(ctx));
          osc.type = 'square';
          osc.frequency.setValueAtTime(f, ctx.currentTime + i * 0.16);
          g.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.16);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.16 + 0.14);
          osc.start(ctx.currentTime + i * 0.16); osc.stop(ctx.currentTime + i * 0.16 + 0.14);
        });
        break;
      }

      // ── تصويت ──
      case 'vote_cast': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1);
        break;
      }

      case 'vote_shift': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
        break;
      }

      // ── 💣 انفجار القنبلة ──
      case 'bomb_explosion': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 1);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 1.2);
        // طبقة ثانية — رنين
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2); gain2.connect(dest(ctx));
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(80, ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.8);
        gain2.gain.setValueAtTime(0.3, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc2.start(ctx.currentTime); osc2.stop(ctx.currentTime + 0.8);
        break;
      }

      // ── 🔪 السفّاح ليلاً ──
      case 'night_assassin': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
        break;
      }

      // ── 🔪 اغتيال السفّاح صباحاً ──
      case 'morning_assassin_kill': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(900, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
        break;
      }

      // ── 👮 الشرطية ──
      case 'morning_policewoman': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
        break;
      }

      // ── 🔄 تعادل ──
      case 'day_tie': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(440, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
        // نغمة ثانية
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2); gain2.connect(dest(ctx));
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(440, ctx.currentTime + 0.5);
        gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.5);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.9);
        osc2.start(ctx.currentTime + 0.5); osc2.stop(ctx.currentTime + 0.9);
        break;
      }

      // ── 🤐 كشف المُسكت في النهار ──
      case 'day_show_silenced': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
        break;
      }

      // ── ✅ انتهاء التصويت ──
      case 'voting_complete': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(dest(ctx));
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
        break;
      }

      // ── انتقال المراحل (لا يوجد أصوات افتراضية) ──
      case 'phase_day_start':
      case 'phase_night_start':
      case 'phase_voting_start':
      case 'phase_elimination':
      default:
        break;
    }
  } catch (_) {
    /* صامت */
  } finally {
    callGain = null;
  }
}

// ══════════════════════════════════════════════════════
// 🥁 Drumroll — يُستخدم في RevealCeremony و BombCeremony
// ══════════════════════════════════════════════════════
export function playDrumroll(): void {
  if (!localPlaybackEnabled) return;
  mirrorEmit?.({ fn: 'playDrumroll', args: [] });
  if (!localMuted) _playDrumroll();
}
function _playDrumroll(): void {
  if (customSoundMap['drumroll']) {
    _playGameSound('drumroll');
    return;
  }
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    // نبضات متسارعة تحاكي الدرامرول
    for (let i = 0; i < 20; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(dest(ctx));
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(100 + i * 3, ctx.currentTime + i * 0.06);
      gain.gain.setValueAtTime(0.06 + i * 0.005, ctx.currentTime + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.06 + 0.05);
      osc.start(ctx.currentTime + i * 0.06);
      osc.stop(ctx.currentTime + i * 0.06 + 0.05);
    }
  } catch {}
}

// ══════════════════════════════════════════════════════
// 💥 Impact Boom — صوت ارتطام عند الإقصاء النهائي
// ══════════════════════════════════════════════════════
export function playImpactBoom(): void {
  if (!localPlaybackEnabled) return;
  mirrorEmit?.({ fn: 'playImpactBoom', args: [] });
  if (!localMuted) _playImpactBoom();
}

/**
 * أصواتُ مراسم الكشف على شاشة العرض — الطبولُ وضربةُ الختام.
 *
 * 🔴 استثناءٌ مقصودٌ من قاعدة «الموجّه هو المصدر»، وشرطُه أنّ **الموجّه لا
 *    يعزفها أصلاً**: المراسمُ حركةٌ موقّتةٌ في الشاشة (خمسُ ثوانٍ لكلّ كرت)
 *    ولا يملك الموجّه إيقاعَها. فلمّا صار تابعاً في التشغيل المحلّيّ صمتت
 *    الطبولُ والضربةُ معاً — بلا خطأٍ يظهر، لأنّ النداء يعود بهدوء.
 *    ولا تزدوج: لا نداءَ لهما في صفحة الموجّه إطلاقاً.
 *
 * ⚠️ ولا يُوسَّع هذا الباب: أيُّ صوتٍ يعزفه الطرفان يُسمَع مرّتين في القاعة.
 */
export function playCeremonySound(kind: 'drumroll' | 'impact'): void {
  if (localMuted) return;
  if (kind === 'drumroll') _playDrumroll(); else _playImpactBoom();
}
function _playImpactBoom(): void {
  if (customSoundMap['impact_boom']) {
    _playGameSound('impact_boom');
    return;
  }
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(dest(ctx));
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

// ══════════════════════════════════════════════════════
// 🔊 المُستقبِل (شاشة الليدر) — يُشغّل صوتاً مُرحَّلاً من شاشة العرض
// يوجّه إلى الـ impl الداخلية (بلا بثّ راجع، بلا حلقة)
// ══════════════════════════════════════════════════════
const REMOTE_SOUND_FNS: Record<string, (...a: any[]) => void> = {
  playGameSound: _playGameSound,
  playAmbientSound: _playAmbientSound,
  stopAmbientSound: _stopAmbientSound,
  stopOneShotSounds: _stopOneShotSounds,
  duckAmbient: _duckAmbient,
  unduckAmbient: _unduckAmbient,
  playEventSound: _playEventSound,
  playEliminationSound: _playEliminationSound,
  playNightStepAmbient: _playNightStepAmbient,
  playDrumroll: _playDrumroll,
  playImpactBoom: _playImpactBoom,
  setAmbientVolume: _setAmbientVolume,
};

export function applyRemoteSound(payload: { fn: string; args?: any[]; vol?: number }): void {
  try {
    // 🔴 مستوى الموجّه يعلو حساب الشاشة: هي جهازٌ آخر بلا إعداداته،
    //    فلو حسبت بنفسها لسمعت القاعة مستوىً غير الذي ضبطه.
    volOverride = typeof payload?.vol === 'number' ? Math.max(0, Math.min(1, payload.vol)) : null;
    const fn = REMOTE_SOUND_FNS[payload?.fn];
    if (fn) fn(...(payload.args || []));
  } catch { /* صامت */ } finally {
    volOverride = null;
  }
}
