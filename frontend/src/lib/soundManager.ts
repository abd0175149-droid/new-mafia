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
  // أولاً: فحص الأصوات المخصصة
  if (customSoundMap[eventKey]) {
    try {
      const audio = preloadedAudios[eventKey];
      if (audio) {
        // إنشاء نسخة جديدة لتجنب تداخل التشغيل
        const clone = audio.cloneNode(true) as HTMLAudioElement;
        clone.volume = 0.7;
        clone.play().catch(() => {});
        return;
      }
      // Fallback: تحميل مباشر
      const newAudio = new Audio(`${API_URL}${customSoundMap[eventKey]}`);
      newAudio.volume = 0.7;
      newAudio.play().catch(() => {});
      return;
    } catch {}
  }

  // ثانياً: تشغيل الصوت الافتراضي (Web Audio API)
  playDefaultSound(eventKey);
}

// ══════════════════════════════════════════════════════
// 🌙 تشغيل صوت خلفي (Ambient) — يتكرر حتى الإيقاف
// ══════════════════════════════════════════════════════
export function playAmbientSound(eventKey: string): void {
  // إيقاف أي صوت خلفي سابق
  stopAmbientSound();

  if (customSoundMap[eventKey]) {
    try {
      const audio = new Audio(`${API_URL}${customSoundMap[eventKey]}`);
      audio.loop = true;
      audio.volume = 0.3;
      audio.play().catch(() => {});
      ambientAudio = audio;
      ambientKey = eventKey;
      return;
    } catch {}
  }

  // لا يوجد صوت خلفي افتراضي — يعمل فقط بملف مخصص
  ambientKey = eventKey;
}

// ══════════════════════════════════════════════════════
// ⏹️ إيقاف الصوت الخلفي
// ══════════════════════════════════════════════════════
export function stopAmbientSound(): void {
  if (ambientAudio) {
    ambientAudio.pause();
    ambientAudio.currentTime = 0;
    ambientAudio = null;
    ambientKey = null;
  }
}

// ══════════════════════════════════════════════════════
// 🔉 خفض صوت الخلفية مؤقتاً (عند تشغيل حدث)
// ══════════════════════════════════════════════════════
export function duckAmbient(): void {
  if (ambientAudio) {
    ambientAudio.volume = 0.08;
  }
}

export function unduckAmbient(): void {
  if (ambientAudio) {
    ambientAudio.volume = 0.3;
  }
}

// ══════════════════════════════════════════════════════
// 🎵 تشغيل صوت حدث مع Duck/Unduck تلقائي للخلفية
// ══════════════════════════════════════════════════════
export function playEventSound(eventKey: string, durationMs: number = 3000): void {
  // خفض الخلفية
  duckAmbient();

  // تشغيل صوت الحدث
  playGameSound(eventKey);

  // إعادة الخلفية بعد المدة
  setTimeout(() => unduckAmbient(), durationMs);
}

// ══════════════════════════════════════════════════════
// 💀 تشغيل صوت الإقصاء حسب الدور (مع Fallback للفريق)
// ══════════════════════════════════════════════════════
const MAFIA_ROLE_KEYS = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'];

export function playEliminationSound(role: string | null): void {
  if (!role) {
    playGameSound('elimination_citizen');
    return;
  }

  const roleUpper = role.toUpperCase();

  // 1. محاولة صوت الدور المحدد
  const roleKey = `elimination_${roleUpper.toLowerCase()}`;
  if (customSoundMap[roleKey]) {
    playEventSound(roleKey, 5000);
    return;
  }

  // 2. Fallback لصوت الفريق
  const isMafia = MAFIA_ROLE_KEYS.includes(roleUpper);
  playEventSound(isMafia ? 'elimination_mafia' : 'elimination_citizen', 5000);
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
  // Dynamic engine ability IDs
  'KILL': 'ambient_night_kill',
  'SILENCE': 'ambient_night_silence',
  'INVESTIGATE': 'ambient_night_investigate',
  'PROTECT': 'ambient_night_protect',
  'SNIPE': 'ambient_night_snipe',
};

export function playNightStepAmbient(stepType: string): void {
  const ambientKey = NIGHT_STEP_AMBIENT_MAP[stepType.toUpperCase()];
  if (ambientKey && customSoundMap[ambientKey]) {
    playAmbientSound(ambientKey);
  }
  // إذا لا يوجد صوت مخصص للخطوة → يبقى ambient_night الحالي يعمل
}

// ══════════════════════════════════════════════════════
// 🔊 الأصوات الافتراضية (Web Audio API Fallback)
// ══════════════════════════════════════════════════════
function playDefaultSound(eventKey: string): void {
  try {
    const ACClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!ACClass) return;
    const ctx = new ACClass();

    switch (eventKey) {
      // ── أحداث الليل ──
      case 'night_assassination':
      case 'morning_assassination_success': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
        break;
      }

      case 'night_protection':
      case 'morning_protection_success': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
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
        osc.connect(gain); gain.connect(ctx.destination);
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
        osc.connect(gain); gain.connect(ctx.destination);
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
        osc.connect(gain); gain.connect(ctx.destination);
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
        osc.connect(gain); gain.connect(ctx.destination);
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
        osc.connect(gain); gain.connect(ctx.destination);
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
        osc.connect(gain); gain.connect(ctx.destination);
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
        osc.connect(gain); gain.connect(ctx.destination);
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
          osc.connect(gain).connect(ctx.destination);
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
          osc.connect(gain).connect(ctx.destination);
          osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur);
        };
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => playBrightNote(f, i * 0.25, 0.6));
        playBrightNote(262, 0, 2.5); playBrightNote(330, 0.5, 2); playBrightNote(392, 1, 2);
        break;
      }

      // ── مؤقت ──
      case 'timer_heartbeat_slow': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.08, ctx.currentTime + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
        break;
      }

      case 'timer_heartbeat_fast': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, ctx.currentTime);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
        break;
      }

      case 'timer_tick': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1);
        break;
      }

      case 'timer_buzzer': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.8);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.8);
        break;
      }

      // ── تصويت ──
      case 'vote_cast': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
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
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(1, ctx.currentTime);
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
  } catch (_) {}
}
