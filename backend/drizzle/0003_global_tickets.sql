-- ══════════════════════════════════════════════════════
-- Migration 0003: Global Tickets System
-- نظام التذاكر المركزي (مستقل عن الأنشطة)
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  ticket_number VARCHAR(50) NOT NULL UNIQUE,
  batch_name VARCHAR(100),
  ticket_type VARCHAR(30) DEFAULT 'regular',
  price NUMERIC(10,2),
  details TEXT,
  seller_name VARCHAR(100),
  seller_phone VARCHAR(20),
  notes TEXT,
  -- حالة الاستخدام
  is_used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP,
  used_by_player_id INTEGER,
  used_by_name VARCHAR(100),
  used_by_phone VARCHAR(20),
  used_in_activity_id INTEGER,
  -- metadata
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  created_by VARCHAR(100)
);

-- فهارس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_tickets_batch ON tickets(batch_name);
CREATE INDEX IF NOT EXISTS idx_tickets_seller ON tickets(seller_name);
CREATE INDEX IF NOT EXISTS idx_tickets_used ON tickets(is_used);
CREATE INDEX IF NOT EXISTS idx_tickets_activity ON tickets(used_in_activity_id);
CREATE INDEX IF NOT EXISTS idx_tickets_number ON tickets(ticket_number);
