import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { connectDB, disconnectDB } from '../src/config/db.js';
import * as schema from '../src/schemas/admin.schema.js';

// Connection strings
const SQLITE_DB_PATH = 'C:/Projects/new mafia/data/mafia.db';

// Helper for parsing json safely
function parseJsonSafe(str: any, defaultVal = []) {
  if (!str) return defaultVal;
  try {
    return JSON.parse(str);
  } catch (e) {
    return defaultVal;
  }
}

// Format SQLite datetime strings to Date objects for pg timestamp compatibility
function toDate(str: any): Date {
  if (!str) return new Date();
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date() : d;
}

async function migrate() {
  console.log('🚀 بدء عملية الترحيل (Migration) من SQLite...');

  let sqliteDb: any;
  try {
    sqliteDb = new Database(SQLITE_DB_PATH, { readonly: true });
    console.log('✅ تم الاتصال بقاعدة SQLite بنجاح.');
  } catch (err: any) {
    console.error('❌ فشل الاتصال بقاعدة SQLite:', err.message);
    process.exit(1);
  }

  const db = await connectDB();
  
  // 1. Locations
  console.log('📍 ترحيل جدول locations...');
  const locationsData = sqliteDb.prepare('SELECT * FROM locations').all();
  if (locationsData.length > 0) {
    await db.insert(schema.locations).values(locationsData.map((row: any) => ({
      id: row.id,
      name: row.name,
      mapUrl: row.mapUrl || '',
      offers: parseJsonSafe(row.offers),
      createdAt: toDate(row.createdAt),
    }))).onConflictDoNothing();
  }

  // 2. Staff
  console.log('👥 ترحيل جدول staff...');
  const staffData = sqliteDb.prepare('SELECT * FROM staff').all();
  if (staffData.length > 0) {
    await db.insert(schema.staff).values(staffData.map((row: any) => ({
      id: row.id,
      username: row.username,
      passwordHash: row.password, // Schema mapping change
      displayName: row.displayName,
      role: row.role as any, // 'admin' | 'manager' | 'leader' | 'location_owner'
      photoUrl: row.photoURL || null,
      permissions: parseJsonSafe(row.permissions, ['activities', 'bookings', 'finances', 'locations']),
      lastLogin: row.lastLogin ? toDate(row.lastLogin) : null,
      isPartner: !!row.isPartner,
      isActive: true, // New field explicitly initialized
      locationId: row.locationId || null,
      createdAt: toDate(row.createdAt),
    }))).onConflictDoNothing();
  }

  // 3. User Settings
  console.log('⚙️ ترحيل جدول user_settings...');
  const userSettingsData = sqliteDb.prepare('SELECT * FROM user_settings').all();
  if (userSettingsData.length > 0) {
    await db.insert(schema.userSettings).values(userSettingsData.map((row: any) => ({
      userId: row.userId,
      newBooking: !!row.newBooking,
      upcomingActivity: !!row.upcomingActivity,
      costAlert: !!row.costAlert,
      dashboardLayout: parseJsonSafe(row.dashboardLayout, ['revenue', 'costs', 'profit', 'bookings', 'upcoming']),
    }))).onConflictDoNothing();
  }

  // 4. Activities
  console.log('🎯 ترحيل جدول activities...');
  const activitiesData = sqliteDb.prepare('SELECT * FROM activities').all();
  if (activitiesData.length > 0) {
    await db.insert(schema.activities).values(activitiesData.map((row: any) => ({
      id: row.id,
      name: row.name,
      date: toDate(row.date),
      description: row.description || '',
      basePrice: String(row.basePrice || 0), // Base form needs validation based on PG Decimal mappings
      status: row.status as any,
      locationId: row.locationId || null,
      driveLink: row.driveLink || '',
      enabledOfferIds: parseJsonSafe(row.enabledOfferIds),
      isLocked: !!row.isLocked,
      createdAt: toDate(row.createdAt),
    }))).onConflictDoNothing();
  }

  // 5. Bookings
  console.log('🎟️ ترحيل جدول bookings...');
  const bookingsData = sqliteDb.prepare('SELECT * FROM bookings').all();
  if (bookingsData.length > 0) {
    await db.insert(schema.bookings).values(bookingsData.map((row: any) => ({
      id: row.id,
      activityId: row.activityId,
      name: row.name,
      phone: row.phone || '',
      count: row.count || 1,
      isPaid: !!row.isPaid,
      paidAmount: String(row.paidAmount || 0),
      receivedBy: row.receivedBy || '',
      isFree: !!row.isFree,
      notes: row.notes || '',
      offerItems: parseJsonSafe(row.offerItems),
      createdBy: row.createdBy || '',
      createdAt: toDate(row.createdAt),
    }))).onConflictDoNothing();
  }

  // 6. Foundational Costs
  console.log('🏢 ترحيل جدول foundational_costs...');
  const fCostsData = sqliteDb.prepare('SELECT * FROM foundational_costs').all();
  if (fCostsData.length > 0) {
    await db.insert(schema.foundationalCosts).values(fCostsData.map((row: any) => ({
      id: row.id,
      item: row.item,
      amount: String(row.amount || 0),
      paidBy: row.paidBy || '',
      source: row.source || '',
      date: toDate(row.date),
      isProcessed: !!row.isProcessed,
    }))).onConflictDoNothing();
  }

  // 7. Costs
  console.log('💸 ترحيل جدول costs...');
  const costsData = sqliteDb.prepare('SELECT * FROM costs').all();
  if (costsData.length > 0) {
    await db.insert(schema.costs).values(costsData.map((row: any) => ({
      id: row.id,
      activityId: row.activityId || null,
      item: row.item,
      amount: String(row.amount || 0),
      date: toDate(row.date),
      paidBy: row.paidBy || '',
      type: row.type || 'general',
    }))).onConflictDoNothing();
  }

  // 8. Notifications
  console.log('🔔 ترحيل جدول notifications...');
  const notifyData = sqliteDb.prepare('SELECT * FROM notifications').all();
  if (notifyData.length > 0) {
    await db.insert(schema.notifications).values(notifyData.map((row: any) => ({
      id: row.id,
      userId: row.userId,
      title: row.title,
      message: row.message || '',
      type: row.type as any,
      read: !!row.read,
      targetId: row.targetId || null,
      createdAt: toDate(row.createdAt),
    }))).onConflictDoNothing();
  }

  // 9. Fix Sequences (Postgres specific reset to highest ID to avoid future collision)
  console.log('🔄 جاري تحديث مؤشرات التسلسل (Sequences) لتجنب التعارض...');
  const tablesToUpdate = [
    'locations', 'staff', 'activities', 'bookings', 
    'foundational_costs', 'costs', 'notifications'
  ];
  
  for (const table of tablesToUpdate) {
    try {
      await db.execute(sql.raw(`SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`));
    } catch (e: any) {
      console.warn(`⚠️ فشل تحديث تسلسل ${table} (قد يكون الجدول فارغاً):`, e.message);
    }
  }

  console.log('✅✅ تم ترحيل جميع البيانات بنجاح.');
  
  sqliteDb.close();
  await disconnectDB();
  process.exit(0);
}

migrate().catch(err => {
  console.error('❌ حدث خطأ فادح أثناء الترحيل:', err);
  process.exit(1);
});
