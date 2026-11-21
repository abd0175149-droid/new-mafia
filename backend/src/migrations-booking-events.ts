// ══════════════════════════════════════════════════════
// 📜 خطّة توحيد الحجز م٣ — سجلّ الحجز، والإلغاء حالةٌ ظاهرة (2026-11-21)
// ══════════════════════════════════════════════════════
// • الإلغاء كان حذفاً ناعماً بلا سبب ولا فاعل ولا قناة. الآن أعمدة cancelled_* على صفّ المتابعة:
//   الإلغاء يملؤها (ويبقى deleted_at كما هو، فكلّ العدّ والقوائم لا تتغيّر)، والحذف الخالي منها
//   = إدخالٌ خاطئ (ق٩). فيظهر الملغى تحت «ملغى» بسببه وفاعله، ويختفي الخطأ.
// • booking_events: سطرٌ لكلّ تغييرٍ مهمّ على الحجز، يكتبه مشغّلٌ من أيّ مسار — فلا تغيير بلا سطر.
//   منفصلٌ عن reservation_events (سجلّ متابعة الوصول) كي لا يُكسر ولا يزدحم شريط الدون.
//   الفاعل: app.actor إن ضبطه الأمر في معاملته، وإلّا فاعل الإلغاء أو منشئ الصفّ، وإلّا system.
// آمنٌ للتكرار.
import { sql } from 'drizzle-orm';

export async function migrateBookingEvents(db: any): Promise<void> {
  await db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP`);
  await db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(200)`);
  await db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(120)`);
  await db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cancel_channel VARCHAR(12)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_reservations_cancelled ON reservations (activity_id) WHERE cancelled_at IS NOT NULL`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS booking_events (
    id SERIAL PRIMARY KEY,
    reservation_id INTEGER,
    booking_id INTEGER,
    activity_id INTEGER,
    at TIMESTAMP DEFAULT NOW() NOT NULL,
    channel VARCHAR(12),
    actor VARCHAR(120),
    kind VARCHAR(24) NOT NULL,
    detail JSONB DEFAULT '{}'::jsonb,
    reason TEXT)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_booking_events_res ON booking_events (reservation_id, id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_booking_events_act ON booking_events (activity_id, id)`);

  await db.execute(sql`CREATE OR REPLACE FUNCTION booking_event_actor(fallback TEXT) RETURNS VARCHAR AS $fn$
    SELECT left(COALESCE(NULLIF(current_setting('app.actor', true), ''), NULLIF(fallback, ''), 'system'), 120)
  $fn$ LANGUAGE sql STABLE`);
  await db.execute(sql`CREATE OR REPLACE FUNCTION booking_event_channel(fallback TEXT) RETURNS VARCHAR AS $fn$
    SELECT left(COALESCE(NULLIF(current_setting('app.channel', true), ''), NULLIF(fallback, '')), 12)
  $fn$ LANGUAGE sql STABLE`);

  await db.execute(sql`CREATE OR REPLACE FUNCTION reservations_events() RETURNS trigger AS $fn$
    DECLARE a VARCHAR; c VARCHAR;
    BEGIN
      IF TG_OP = 'INSERT' THEN
        INSERT INTO booking_events (reservation_id, activity_id, channel, actor, kind, detail)
        VALUES (NEW.id, NEW.activity_id, booking_event_channel(NEW.channel), booking_event_actor(NEW.actor), 'created',
                jsonb_build_object('people', NEW.people_count, 'status', NEW.status, 'name', NEW.contact_name));
        RETURN NULL;
      END IF;
      a := booking_event_actor(NULL); c := booking_event_channel(NULL);
      IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        INSERT INTO booking_events (reservation_id, activity_id, channel, actor, kind, detail, reason)
        VALUES (NEW.id, NEW.activity_id, COALESCE(NEW.cancel_channel, c),
                CASE WHEN NEW.cancelled_at IS NOT NULL THEN left(COALESCE(NULLIF(NEW.cancelled_by, ''), a), 120) ELSE a END,
                CASE WHEN NEW.cancelled_at IS NOT NULL THEN 'cancelled' ELSE 'deleted' END,
                jsonb_build_object('people', NEW.people_count, 'status', NEW.status), NEW.cancel_reason);
      ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        INSERT INTO booking_events (reservation_id, activity_id, channel, actor, kind, detail)
        VALUES (NEW.id, NEW.activity_id, c, a, 'restored', jsonb_build_object('status', NEW.status));
      END IF;
      IF OLD.status IS DISTINCT FROM NEW.status AND NEW.deleted_at IS NULL THEN
        INSERT INTO booking_events (reservation_id, activity_id, channel, actor, kind, detail)
        VALUES (NEW.id, NEW.activity_id, c, a, 'status', jsonb_build_object('from', OLD.status, 'to', NEW.status));
      END IF;
      IF OLD.people_count IS DISTINCT FROM NEW.people_count AND NEW.deleted_at IS NULL THEN
        INSERT INTO booking_events (reservation_id, activity_id, channel, actor, kind, detail)
        VALUES (NEW.id, NEW.activity_id, c, a, 'people', jsonb_build_object('from', OLD.people_count, 'to', NEW.people_count));
      END IF;
      IF OLD.unit_price IS DISTINCT FROM NEW.unit_price THEN
        INSERT INTO booking_events (reservation_id, activity_id, channel, actor, kind, detail)
        VALUES (NEW.id, NEW.activity_id, c, a, 'price', jsonb_build_object('from', OLD.unit_price, 'to', NEW.unit_price, 'seats', NEW.promo_seats));
      END IF;
      IF OLD.attended IS DISTINCT FROM NEW.attended THEN
        INSERT INTO booking_events (reservation_id, activity_id, channel, actor, kind, detail)
        VALUES (NEW.id, NEW.activity_id, c, a, 'attended', jsonb_build_object('to', NEW.attended));
      END IF;
      RETURN NULL;
    END $fn$ LANGUAGE plpgsql`);

  await db.execute(sql`CREATE OR REPLACE FUNCTION bookings_events() RETURNS trigger AS $fn$
    DECLARE a VARCHAR; c VARCHAR;
    BEGIN
      IF TG_OP = 'INSERT' THEN
        INSERT INTO booking_events (reservation_id, booking_id, activity_id, channel, actor, kind, detail)
        VALUES (NEW.reservation_id, NEW.id, NEW.activity_id, booking_event_channel(NEW.channel), booking_event_actor(NEW.actor), 'seat_added',
                jsonb_build_object('name', NEW.name, 'paid', NEW.is_paid, 'free', NEW.is_free));
        RETURN NULL;
      END IF;
      a := booking_event_actor(NULL); c := booking_event_channel(NULL);
      IF COALESCE(OLD.is_paid, false) = false AND NEW.is_paid = true AND COALESCE(NEW.is_free, false) = false THEN
        INSERT INTO booking_events (reservation_id, booking_id, activity_id, channel, actor, kind, detail)
        VALUES (NEW.reservation_id, NEW.id, NEW.activity_id, c, COALESCE(NULLIF(NEW.received_by, ''), a), 'paid',
                jsonb_build_object('amount', NEW.paid_amount, 'name', NEW.name));
      ELSIF OLD.is_paid = true AND COALESCE(NEW.is_paid, false) = false THEN
        INSERT INTO booking_events (reservation_id, booking_id, activity_id, channel, actor, kind, detail)
        VALUES (NEW.reservation_id, NEW.id, NEW.activity_id, c, a, 'unpaid', jsonb_build_object('name', NEW.name));
      END IF;
      IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        INSERT INTO booking_events (reservation_id, booking_id, activity_id, channel, actor, kind, detail)
        VALUES (NEW.reservation_id, NEW.id, NEW.activity_id, c, a, 'seat_removed', jsonb_build_object('name', NEW.name));
      END IF;
      IF OLD.loyalty_reward_id IS NULL AND NEW.loyalty_reward_id IS NOT NULL THEN
        INSERT INTO booking_events (reservation_id, booking_id, activity_id, channel, actor, kind, detail)
        VALUES (NEW.reservation_id, NEW.id, NEW.activity_id, c, a, 'loyalty', jsonb_build_object('reward', NEW.loyalty_reward_id, 'name', NEW.name));
      ELSIF OLD.loyalty_reward_id IS NOT NULL AND NEW.loyalty_reward_id IS NULL THEN
        INSERT INTO booking_events (reservation_id, booking_id, activity_id, channel, actor, kind, detail)
        VALUES (NEW.reservation_id, NEW.id, NEW.activity_id, c, a, 'loyalty_back', jsonb_build_object('reward', OLD.loyalty_reward_id, 'name', NEW.name));
      END IF;
      IF OLD.unit_price IS DISTINCT FROM NEW.unit_price THEN
        INSERT INTO booking_events (reservation_id, booking_id, activity_id, channel, actor, kind, detail)
        VALUES (NEW.reservation_id, NEW.id, NEW.activity_id, c, a, 'price', jsonb_build_object('from', OLD.unit_price, 'to', NEW.unit_price, 'name', NEW.name));
      END IF;
      RETURN NULL;
    END $fn$ LANGUAGE plpgsql`);

  await db.execute(sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'reservations_events_trg') THEN
      CREATE TRIGGER reservations_events_trg AFTER INSERT OR UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION reservations_events();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'bookings_events_trg') THEN
      CREATE TRIGGER bookings_events_trg AFTER INSERT OR UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION bookings_events();
    END IF;
  END $$`);
}
