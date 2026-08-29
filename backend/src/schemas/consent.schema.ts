// ══════════════════════════════════════════════════════
// 🔐 الموافقة والخصوصيّة — قانون حماية البيانات الشخصيّة الأردنيّ ٢٤/٢٠٢٣
//
// 🔴 الموافقة تُخزَّن على الخادم لا في ذاكرة الجهاز: القانون يشترط أن يُثبت
//    المتحكّم أنّه حصل عليها، ودليلٌ يمّحي بمسح التطبيق ليس دليلاً.
//
// 🔴 وتُربط بنسخةٍ مرقّمة من النصّ: «وافق» بلا معرفة ما وافق عليه لا قيمة له،
//    وتغيّرُ السياسة جوهريّاً يُبطل الموافقة السابقة ويستوجب أخذَ جديدة.
//
// 🔴 ولا تُحذف الموافقاتُ أبداً حتّى عند حذف الحساب — تُجهَّل. سجلُّ الموافقة
//    هو ما يحمي النادي إن سُئل يوماً: بأيّ سندٍ عالجتَ بيانات هذا الشخص؟
// ══════════════════════════════════════════════════════

import { pgTable, serial, integer, varchar, timestamp, text, boolean, index } from 'drizzle-orm/pg-core';

// ── نسخُ الوثائق ────────────────────────────────────
// كلُّ نصٍّ يُنشر يأخذ صفّاً. النصُّ نفسه يُخزَّن هنا لا في ملفٍّ يتغيّر مع النشر،
// وإلّا لم نستطع يوماً إظهار ما وافق عليه لاعبٌ قبل سنة.
export const policyVersions = pgTable('policy_versions', {
  id: serial('id').primaryKey(),
  // 'privacy' | 'terms'
  kind: varchar('kind', { length: 20 }).notNull(),
  // '1.0' · '1.1' — يُقارَن نصّاً لا رقماً
  version: varchar('version', { length: 20 }).notNull(),
  lang: varchar('lang', { length: 5 }).default('ar').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  // النصّ الكامل — Markdown مبسّط
  body: text('body').notNull(),
  // ملخّصُ ما تغيّر عن سابقتها — يُعرض في شاشة إعادة الموافقة
  changeSummary: text('change_summary').default(''),
  // 🔴 جوهريٌّ = يُبطل الموافقات السابقة ويُعيد البوّابة. شكليٌّ = يُبلَّغ ولا يحجب.
  requiresReconsent: boolean('requires_reconsent').default(true).notNull(),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, t => ({
  kindIdx: index('policy_versions_kind_idx').on(t.kind, t.version),
}));

// ── موافقاتُ اللاعبين ───────────────────────────────
export const playerConsents = pgTable('player_consents', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').notNull(),
  kind: varchar('kind', { length: 20 }).notNull(),          // privacy | terms
  version: varchar('version', { length: 20 }).notNull(),
  // 'granted' | 'withdrawn'
  action: varchar('action', { length: 12 }).notNull(),
  // web | android | ios — من أين وافق
  platform: varchar('platform', { length: 10 }).default('web'),
  // 👨‍👦 موافقةُ وليّ الأمر: تُسجَّل باسمه وهاتفه وصفته، لا باسم القاصر
  guardianPhone: varchar('guardian_phone', { length: 20 }),
  guardianName: varchar('guardian_name', { length: 100 }),
  guardianRelation: varchar('guardian_relation', { length: 30 }),
  // ⚠️ لا يُخزَّن عنوان IP: النظام لا يحفظه في أيّ جدول اليوم، وإدخالُه هنا
  //    يفتح فئةَ بياناتٍ جديدةً لأجل سجلٍّ لا يحتاجها.
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, t => ({
  playerIdx: index('player_consents_player_idx').on(t.playerId, t.kind),
}));

// ── طلباتُ حذف الحساب ───────────────────────────────
// جدولٌ مستقلٌّ عن `players` كي يبقى السجلُّ بعد تجهيل الحساب:
// «مَن طلب ومتى ولماذا واكتمل أم تُرووجع» سؤالٌ قد يُسأل بعد الحذف لا قبله.
export const deletionRequests = pgTable('deletion_requests', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').notNull(),
  // refused_consent | withdrew_consent | user_request | admin
  reason: varchar('reason', { length: 30 }).notNull(),
  requestedAt: timestamp('requested_at').defaultNow().notNull(),
  dueAt: timestamp('due_at').notNull(),
  // pending | restored | completed | blocked
  status: varchar('status', { length: 12 }).default('pending').notNull(),
  restoredAt: timestamp('restored_at'),
  completedAt: timestamp('completed_at'),
  // رصيدُ الرقائق لحظةَ الطلب — دليلٌ إن نُوزع في التسوية
  chipsAtRequest: integer('chips_at_request').default(0),
  note: varchar('note', { length: 300 }).default(''),
  platform: varchar('platform', { length: 10 }).default('web'),
}, t => ({
  dueIdx: index('deletion_requests_due_idx').on(t.status, t.dueAt),
  playerIdx: index('deletion_requests_player_idx').on(t.playerId),
}));
