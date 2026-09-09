'use client';

// ══════════════════════════════════════════════════════
// 🏙️ شارةُ المدينة وشرائحُها — عنصرٌ واحدٌ لكلّ شاشات الإدارة
//
// 🔴 اللونُ من المعرّف أوّلاً (عمّان = ١ كهرمانيّ، الزرقاء = ٢ أزرق — بحسب العقد)،
//    ثمّ من `slug`، ثمّ من الاسم احتياطاً فقط. الأسماءُ تأتي من الخادم ولا تُتّخذ
//    منطقاً؛ وكلُّ مدينةٍ أخرى بنفسجيّة.
// ══════════════════════════════════════════════════════

import type { ReactNode } from 'react';

export type CityTone = 'amber' | 'blue' | 'violet' | 'neutral';

export function cityTone(cityId?: number | null, cityName?: string | null, slug?: string | null): CityTone {
  if (cityId === 1) return 'amber';
  if (cityId === 2) return 'blue';
  const s = (slug || '').toLowerCase();
  if (s === 'amman') return 'amber';
  if (s === 'zarqa') return 'blue';
  const n = cityName || '';
  if (/عمّ?ان/.test(n) || /amman/i.test(n)) return 'amber';
  if (/زرقا/.test(n) || /zarqa/i.test(n)) return 'blue';
  if (cityId != null || n) return 'violet';
  return 'neutral';
}

/** شارةٌ صغيرة — نفسُ مقاس شارات الحالة في اللوحة */
export const CITY_TONE_CLASSES: Record<CityTone, string> = {
  amber: 'bg-amber-500/[0.12] text-amber-400 border-amber-500/30',
  blue: 'bg-[#4F9DDE]/15 text-[#8CC1F2] border-[#4F9DDE]/35',
  violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  neutral: 'bg-gray-700/40 text-gray-400 border-gray-600/40',
};

/** زرُّ الشريحة المختار */
export const CITY_TONE_SEG_ON: Record<CityTone, string> = {
  amber: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  blue: 'bg-[#4F9DDE]/20 text-[#8CC1F2] border-[#4F9DDE]/45',
  violet: 'bg-violet-500/20 text-violet-200 border-violet-500/40',
  neutral: 'bg-gray-700/70 text-white border-gray-600/60',
};

/** لونٌ صريح — للنقاط والحدود المرسومة بالأنماط المباشرة */
export const CITY_TONE_HEX: Record<CityTone, string> = {
  amber: '#FBBF24',
  blue: '#4F9DDE',
  violet: '#A78BFA',
  neutral: '#6B7280',
};

export interface CityLike { id: number; name: string; slug?: string | null }

export default function CityBadge({
  cityId, cityName, slug, icon = true, size = 'xs', className = '', title, children,
}: {
  cityId?: number | null;
  cityName?: string | null;
  slug?: string | null;
  icon?: boolean;
  size?: 'xs' | 'sm';
  className?: string;
  title?: string;
  /** نصٌّ بديلٌ للاسم — مثل «الزرقاء · 🕵️ مُخبر 40» */
  children?: ReactNode;
}) {
  if (!cityName && children == null) return null;
  const tone = cityTone(cityId, cityName, slug);
  const sz = size === 'sm' ? 'text-[11px] px-2.5 py-1' : 'text-[10px] px-2 py-0.5';
  return (
    <span title={title ?? undefined}
      className={`inline-flex items-center gap-1 rounded-full border font-bold whitespace-nowrap leading-none ${sz} ${CITY_TONE_CLASSES[tone]} ${className}`}>
      {icon && <span aria-hidden>🏙️</span>}
      <span>{children ?? cityName}</span>
    </span>
  );
}

/** نقطةٌ ملوّنةٌ بلون المدينة — لسطور التقسيم تحت أرقام اللوحة */
export function CityDot({ cityId, cityName, className = '' }: { cityId?: number | null; cityName?: string | null; className?: string }) {
  return (
    <i aria-hidden className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${className}`}
      style={{ background: CITY_TONE_HEX[cityTone(cityId, cityName)] }} />
  );
}

/**
 * مبدّلٌ مقسَّم: «الكلّ | مدينة | مدينة». `value === null` تعني الكلّ.
 * 🔴 لا يخفي نفسَه حين تكون مدينةٌ واحدة: الشريحةُ الوحيدةُ تقول للمستعمل
 *    «هذا النطاق مدينةٌ» — وهي معلومةٌ لا زينة.
 */
export function CitySegment({
  cities, value, onChange, allLabel = 'الكلّ', showAll = true, size = 'sm', className = '', disabled = false, ariaLabel = 'المدينة',
}: {
  cities: CityLike[];
  value: number | null;
  onChange: (id: number | null) => void;
  allLabel?: string;
  showAll?: boolean;
  size?: 'xs' | 'sm';
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const btn = size === 'xs' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';
  const base = `${btn} rounded-lg font-bold border transition whitespace-nowrap disabled:opacity-50`;
  const off = 'border-transparent text-gray-400 hover:text-white hover:bg-gray-800/60';
  return (
    <div role="tablist" aria-label={ariaLabel} dir="rtl"
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-gray-900/60 border border-gray-700/50 ${className}`}>
      {showAll && (
        <button type="button" role="tab" aria-selected={value === null} disabled={disabled}
          onClick={() => onChange(null)}
          className={`${base} ${value === null ? CITY_TONE_SEG_ON.neutral : off}`}>
          {allLabel}
        </button>
      )}
      {cities.map(c => {
        const on = value === c.id;
        return (
          <button key={c.id} type="button" role="tab" aria-selected={on} disabled={disabled}
            onClick={() => onChange(c.id)}
            className={`${base} ${on ? CITY_TONE_SEG_ON[cityTone(c.id, c.name, c.slug)] : off}`}>
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

// ── الأماكنُ مجمّعةً بالمدينة — لقوائم <select> ─────────────
export interface LocationGroup { key: string; cityId: number | null; cityName: string; items: any[] }

export function groupLocationsByCity(locations: any[]): LocationGroup[] {
  const map = new Map<string, LocationGroup>();
  for (const l of Array.isArray(locations) ? locations : []) {
    const cityId = l?.cityId == null ? null : Number(l.cityId);
    const cityName = l?.cityName || (cityId == null ? 'بلا مدينة' : `مدينة #${cityId}`);
    const key = cityId == null ? 'none' : String(cityId);
    if (!map.has(key)) map.set(key, { key, cityId, cityName, items: [] });
    map.get(key)!.items.push(l);
  }
  // «بلا مدينة» في الذيل دائماً؛ والبقيّةُ بترتيب المعرّف (عمّان ١ ثمّ الزرقاء ٢ …)
  return Array.from(map.values()).sort((a, b) => {
    if (a.cityId == null) return 1;
    if (b.cityId == null) return -1;
    return a.cityId - b.cityId;
  });
}

export const locationOptionLabel = (l: any): string =>
  `${l.name}${l.region ? ` · ${l.region}` : ''}${l.isTestLocation ? ' 🧪' : ''}`;

/** `<optgroup label="🏙️ المدينة">` لكلّ مدينة — يُوضع مباشرةً داخل `<select>` */
export function LocationOptgroups({ locations, labelOf = locationOptionLabel }: { locations: any[]; labelOf?: (l: any) => string }) {
  return (
    <>
      {groupLocationsByCity(locations).map(g => (
        <optgroup key={g.key} label={`🏙️ ${g.cityName}`}>
          {g.items.map((l: any) => (
            <option key={l.id} value={l.id}>{labelOf(l)}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
