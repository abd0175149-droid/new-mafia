// ══════════════════════════════════════════════════════
// 📋 Reports Registry — Config/Schema لكل تقرير
// ══════════════════════════════════════════════════════

export type FilterType = 'period' | 'select' | 'date-range';

export interface ReportFilter {
  id: string;
  type: FilterType;
  label: string;
  defaultValue?: string;
  options?: { value: string; label: string }[];
}

export interface ReportSection {
  type: 'stats' | 'table' | 'chart-bar' | 'grid-cards';
  title?: string;
  icon?: string;
}

export interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  endpoint: string;
  filters: ReportFilter[];
}

export interface ReportCategory {
  id: string;
  name: string;
  icon: string;
  reports: ReportDefinition[];
}

// ── فلاتر مشتركة ──
const PERIOD_FILTER: ReportFilter = {
  id: 'period',
  type: 'period',
  label: 'الفترة الزمنية',
  defaultValue: 'month',
  options: [
    { value: 'week', label: 'أسبوع' },
    { value: 'month', label: 'شهر' },
    { value: 'quarter', label: 'ربع سنة' },
    { value: 'year', label: 'سنة' },
    { value: 'all', label: 'الكل' },
  ],
};

// ══════════════════════════════════════════
// التقارير مصنّفة حسب الفئة
// ══════════════════════════════════════════
export const REPORT_CATEGORIES: ReportCategory[] = [
  // ── 📊 KPI ──
  {
    id: 'kpi',
    name: 'مؤشرات الأداء',
    icon: '📊',
    reports: [
      {
        id: 'dashboard-kpis',
        name: 'لوحة المؤشرات الرئيسية',
        description: 'نظرة شاملة على أهم مؤشرات أداء النادي مقارنة بالشهر الماضي',
        category: 'kpi',
        icon: '📊',
        endpoint: '/api/reports/kpi',
        filters: [],
      },
    ],
  },
  // ── 💰 المالية ──
  {
    id: 'financial',
    name: 'التقارير المالية',
    icon: '💰',
    reports: [
      {
        id: 'revenue-overview',
        name: 'الإيرادات والأرباح',
        description: 'ملخص شامل للإيرادات والتكاليف التشغيلية والتأسيسية وصافي الأرباح',
        category: 'financial',
        icon: '💰',
        endpoint: '/api/reports/financial',
        filters: [PERIOD_FILTER],
      },
      {
        id: 'activity-performance',
        name: 'أداء الأنشطة مالياً',
        description: 'إيرادات وتكاليف وربح كل نشاط مع نسبة الإشغال',
        category: 'financial',
        icon: '🎯',
        endpoint: '/api/reports/financial',
        filters: [PERIOD_FILTER],
      },
      {
        id: 'bookings-status',
        name: 'حالة الحجوزات',
        description: 'الحجوزات المدفوعة والمعلقة والمجانية مع المبالغ المستحقة',
        category: 'financial',
        icon: '📅',
        endpoint: '/api/reports/financial',
        filters: [PERIOD_FILTER],
      },
      {
        id: 'monthly-revenue',
        name: 'الإيرادات الشهرية',
        description: 'اتجاه الإيرادات وعدد الحجوزات حسب الشهر',
        category: 'financial',
        icon: '📆',
        endpoint: '/api/reports/financial',
        filters: [PERIOD_FILTER],
      },
    ],
  },
  // ── 🎮 اللاعبون ──
  {
    id: 'players',
    name: 'تقارير اللاعبين',
    icon: '🎮',
    reports: [
      {
        id: 'active-players',
        name: 'المستخدمين النشطين',
        description: 'توزيع اللاعبين حسب النشاط ومعدل الاحتفاظ',
        category: 'players',
        icon: '👥',
        endpoint: '/api/reports/players',
        filters: [PERIOD_FILTER],
      },
      {
        id: 'rank-distribution',
        name: 'توزيع الرتب والمستويات',
        description: 'عدد اللاعبين في كل رتبة مع متوسط RR لكل رتبة',
        category: 'players',
        icon: '🏆',
        endpoint: '/api/reports/players',
        filters: [PERIOD_FILTER],
      },
      {
        id: 'top-players',
        name: 'أفضل 20 لاعب',
        description: 'ترتيب اللاعبين حسب الرتبة والمستوى والانتصارات',
        category: 'players',
        icon: '⭐',
        endpoint: '/api/reports/players',
        filters: [PERIOD_FILTER],
      },
      {
        id: 'player-growth',
        name: 'نمو قاعدة اللاعبين',
        description: 'عدد اللاعبين الجدد شهرياً ومعدل النمو',
        category: 'players',
        icon: '📈',
        endpoint: '/api/reports/players',
        filters: [PERIOD_FILTER],
      },
    ],
  },
  // ── ⚔️ المباريات ──
  {
    id: 'games',
    name: 'تقارير المباريات',
    icon: '⚔️',
    reports: [
      {
        id: 'match-results',
        name: 'نتائج المباريات',
        description: 'إحصائيات الفوز والخسارة ومتوسط المدة وعدد اللاعبين',
        category: 'games',
        icon: '🎮',
        endpoint: '/api/reports/games',
        filters: [PERIOD_FILTER],
      },
      {
        id: 'role-distribution',
        name: 'توزيع الأدوار والأداء',
        description: 'نسبة استخدام كل دور ونجاح القدرات والصفقات',
        category: 'games',
        icon: '🃏',
        endpoint: '/api/reports/games',
        filters: [PERIOD_FILTER],
      },
      {
        id: 'play-trends',
        name: 'اتجاهات اللعب',
        description: 'المباريات حسب يوم الأسبوع وتحديد أوقات الذروة',
        category: 'games',
        icon: '📅',
        endpoint: '/api/reports/games',
        filters: [PERIOD_FILTER],
      },
      {
        id: 'leader-ratings',
        name: 'تقييمات الليدر',
        description: 'متوسط التقييم وتوزيع التقييمات الإيجابية والسلبية',
        category: 'games',
        icon: '⭐',
        endpoint: '/api/reports/games',
        filters: [PERIOD_FILTER],
      },
    ],
  },
  // ── 🏢 العمليات ──
  {
    id: 'operations',
    name: 'تقارير العمليات',
    icon: '🏢',
    reports: [
      {
        id: 'sessions-rooms',
        name: 'الجلسات والغرف',
        description: 'عدد الغرف ومتوسط المباريات لكل جلسة وأكثر الليدرات نشاطاً',
        category: 'operations',
        icon: '🏠',
        endpoint: '/api/reports/sessions',
        filters: [PERIOD_FILTER],
      },
      {
        id: 'location-performance',
        name: 'أداء المواقع',
        description: 'إيرادات وحضور ونسبة إشغال كل موقع',
        category: 'operations',
        icon: '📍',
        endpoint: '/api/reports/locations',
        filters: [PERIOD_FILTER],
      },
      {
        id: 'partners-report',
        name: 'تقرير الشركاء',
        description: 'إيرادات وتكاليف وأرباح كل شريك',
        category: 'operations',
        icon: '🤝',
        endpoint: '/api/reports/partners',
        filters: [],
      },
      {
        id: 'audit-trail',
        name: 'سجل العمليات',
        description: 'آخر العمليات الإدارية وأكثر المستخدمين نشاطاً',
        category: 'operations',
        icon: '📜',
        endpoint: '/api/reports/audit',
        filters: [PERIOD_FILTER],
      },
    ],
  },
];

// ── مساعدات ──
export function getReportById(id: string): ReportDefinition | undefined {
  for (const cat of REPORT_CATEGORIES) {
    const r = cat.reports.find(r => r.id === id);
    if (r) return r;
  }
  return undefined;
}

export function getCategoryById(id: string): ReportCategory | undefined {
  return REPORT_CATEGORIES.find(c => c.id === id);
}

// ── ثوابت الترجمة ──
export const RANK_AR: Record<string, string> = {
  INFORMANT: 'مُخبر', SOLDIER: 'جندي', CAPO: 'كابو', UNDERBOSS: 'أندربوس', GODFATHER: 'الأب الروحي'
};
export const RANK_ICONS: Record<string, string> = {
  INFORMANT: '🕵️', SOLDIER: '⚔️', CAPO: '🎖️', UNDERBOSS: '💎', GODFATHER: '👑'
};
export const ROLE_AR: Record<string, string> = {
  GODFATHER: 'شيخ المافيا', SILENCER: 'قص المافيا', CHAMELEON: 'حرباية',
  MAFIA_REGULAR: 'مافيا عادي', SHERIFF: 'الشريف', DOCTOR: 'الطبيب',
  SNIPER: 'القناص', POLICEWOMAN: 'الشرطية', NURSE: 'الممرضة', CITIZEN: 'مواطن'
};
