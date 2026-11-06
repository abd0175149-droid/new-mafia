// ══════════════════════════════════════════════════════
// 🔌 ما تملكه صفحة الليدر وتُعيره للقمرة
//
// الصفحة (page.tsx) تبقى «الدماغ»: مستمعو المقبس، حالة الغرفة، الليلة الواحدة،
// المؤقّت، التنبيهات، والنوافذ القديمة المشتركة (اختيار رابح، عيد ميلاد، الإعدادات…).
// القمرة «الوجه»: تقرأ من هنا وتنادي هذه الأفعال، ولا تفتح مستمعاً لحالةٍ تملكها الصفحة.
// ══════════════════════════════════════════════════════
import { createContext, useContext } from 'react';

export interface CockpitAlert {
  kind: 'gallery' | 'tasks';
  physicalId: number;
  name: string;
  role?: string | null;
  team?: string | null;
  teamAr?: string | null;
  wasDead?: boolean;
  at: number;
}

export interface OneNightHost {
  running: { deadline: number | null; acting: number; total: number } | null;
  progress: { done: number; total: number } | null;
  roster: Array<{ seat: number; name: string; submitted: boolean }>;
  review: { acting: any[]; idle: any[] } | null;
  busy: boolean;
  start: (seconds: number) => Promise<void>;
  close: () => Promise<void>;
  apply: (overrides: Array<{ seat: number; abilityId: string; targetPhysicalId: number | null }>) => Promise<void>;
}

export interface CockpitHost {
  alerts: CockpitAlert[];
  dismissAlert: (index: number) => void;
  clearAlerts: () => void;
  gameTimer: { remaining: number; expired: boolean } | null;
  oneNight: OneNightHost;
  policewomanChoice: any;
  setPolicewomanChoice: (v: any) => void;
  mafiaChatUnread: number;
  soundOn: boolean;
  open: {
    luckyDraw: () => void;
    birthday: () => void;
    settings: () => void;
    mixer: () => void;
    /** لوح الأسماء في القمرة (الصفحة تبثّ cockpit:open-names) */
    rename: () => void;
    renumber?: () => void;
    mafiaChat: () => void;
  };
  toggleSound: () => void;
  reflow?: () => void;
  adjustGameTimer: (minutes: number) => Promise<void>;
  /** إنهاء اللعبة والعودة للّوبي (Terminate) — يسأل الصفحة عن العقوبات كما اليوم */
  terminate: () => Promise<void>;
  deleteRoom: () => Promise<void>;
  closeEvent: () => Promise<void>;
  /** العودة للوحة الغرف بلا إغلاق */
  leave: () => void;
  /** «ابدأ توزيع الأدوار» من اللوبي — بسؤال الغياب والعقوبات كما اليوم */
  startGeneration: (excluded?: number[]) => Promise<void>;
  /** «لعبة جديدة» من نهاية اللعبة */
  newGame: (excluded: number[]) => Promise<void>;
  /** الإقصاء الإداريّ مع كشف الكرت على الشاشة */
  adminEliminate: (physicalId: number) => Promise<void>;
  /** كرتُ الإقصاء الإداريّ المكشوف على الشاشة الآن — يُغلق بـ dismissAdminReveal */
  adminReveal: { physicalId: number; name: string; role: string } | null;
  dismissAdminReveal: () => void;
  showClassic: () => void;
}

export const HostCtx = createContext<CockpitHost | null>(null);
export function useHost(): CockpitHost {
  const h = useContext(HostCtx);
  if (!h) throw new Error('useHost خارج القمرة');
  return h;
}
