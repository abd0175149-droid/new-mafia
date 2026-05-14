-- ══════════════════════════════════════════════════════
-- Migration: نظام التذاكر والتوزيع التلقائي للمقاعد
-- ══════════════════════════════════════════════════════

-- 1. حقول جديدة على activities
ALTER TABLE activities ADD COLUMN IF NOT EXISTS require_ticket BOOLEAN DEFAULT false;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS seat_constraints JSONB DEFAULT NULL;

-- 2. حقل جديد على bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ticket_number VARCHAR(50);

-- 3. جدول التذاكر المعتمدة
CREATE TABLE IF NOT EXISTS activity_tickets (
  id SERIAL PRIMARY KEY,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  ticket_number VARCHAR(50) NOT NULL,
  is_used BOOLEAN DEFAULT false,
  used_by_phone VARCHAR(20),
  used_by_name VARCHAR(100),
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- فهارس
CREATE INDEX IF NOT EXISTS idx_activity_tickets_activity ON activity_tickets(activity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_tickets_unique ON activity_tickets(activity_id, ticket_number);
