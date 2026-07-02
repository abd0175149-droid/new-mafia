// ══════════════════════════════════════════════════════
// 🔽 مُحمّلات قوائم الخيارات للمنتقيات (activity/player/…)
// endpoint خفيف يُبقي /types صغيراً.
// ══════════════════════════════════════════════════════

import { and, asc, desc, eq, isNull, or, ilike } from 'drizzle-orm';
import type { Database } from '../config/db.js';
import type { OptionSource } from './types.js';
import { activities, locations, expenseCategories, staff } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { seasons } from '../schemas/season.schema.js';

export interface PickerOption { value: string; labelAr: string; }

export async function loadOptions(db: Database, source: OptionSource, q?: string): Promise<PickerOption[]> {
  switch (source) {
    case 'activities': {
      const rows = await db.select({ id: activities.id, name: activities.name, date: activities.date, isTest: locations.isTestLocation })
        .from(activities)
        .leftJoin(locations, eq(activities.locationId, locations.id))
        .where(isNull(activities.deletedAt))
        .orderBy(desc(activities.date))
        .limit(500);
      return rows.map((r) => ({
        value: String(r.id),
        labelAr: `${r.name} — ${r.date ? new Date(r.date).toLocaleDateString('ar-IQ') : ''}${r.isTest ? ' (اختبار)' : ''}`,
      }));
    }

    case 'players': {
      // منتقي تقرير اللاعب = بحث مباشر عن شخص محدّد، فلا نستبعد الحسابات التجريبية
      // (بعض اللاعبين الحقيقيين مُعلَّمون test). الاستبعاد يبقى في التقارير التجميعية فقط.
      const search = q
        ? or(ilike(players.name, `%${q}%`), ilike(players.phone, `%${q}%`))
        : undefined;
      const rows = await db.select({ id: players.id, name: players.name, phone: players.phone, isTest: players.isTestAccount })
        .from(players)
        .where(search)
        .orderBy(q ? asc(players.name) : desc(players.lastActiveAt))
        .limit(50);
      return rows.map((r) => ({ value: String(r.id), labelAr: `${r.name} — ${r.phone}${r.isTest ? ' (تجريبي)' : ''}` }));
    }

    case 'locations': {
      const rows = await db.select({ id: locations.id, name: locations.name })
        .from(locations).where(isNull(locations.deletedAt)).orderBy(locations.name);
      return rows.map((r) => ({ value: String(r.id), labelAr: r.name }));
    }

    case 'seasons': {
      const rows = await db.select({ id: seasons.id, name: seasons.name, type: seasons.type, status: seasons.status })
        .from(seasons).orderBy(desc(seasons.startedAt));
      return rows.map((r) => ({
        value: String(r.id),
        labelAr: `${r.name} (${r.type === 'TOURNAMENT' ? 'بطولة' : 'عادي'}${r.status === 'ACTIVE' ? ' — نشط' : ''})`,
      }));
    }

    case 'expenseCategories': {
      const rows = await db.select({ id: expenseCategories.id, name: expenseCategories.name })
        .from(expenseCategories).where(isNull(expenseCategories.deletedAt)).orderBy(expenseCategories.name);
      return rows.map((r) => ({ value: String(r.name), labelAr: r.name }));
    }

    case 'staff': {
      const rows = await db.select({ id: staff.id, name: staff.displayName, role: staff.role })
        .from(staff).where(and(eq(staff.isActive, true), isNull(staff.deletedAt))).orderBy(staff.displayName);
      return rows.map((r) => ({ value: String(r.id), labelAr: `${r.name} (${r.role})` }));
    }

    default:
      return [];
  }
}
