// ══════════════════════════════════════════════════════
// 🧭 خطّة توحيد الحجز م٢-أ — ترحيل القناة والفاعل والرابط (2026-11-21)
// ══════════════════════════════════════════════════════
// ── 🧭 خطّة توحيد الحجز م٢-أ: القناة والفاعل صريحان، ورابطٌ صريح من صفّ الحجز إلى صفّ المتابعة ──
// كانت القناة تُستنتج من نصّ «أُنشئ بواسطة» (برموز) في كلّ قراءة، والرابط بين الجدولين مطابقةٌ
// بالحساب أو الرقم في تسعة مواضع. الآن أعمدةٌ صريحة يملؤها مشغّلٌ (trigger) لكلّ كتابة من أيّ
// مسار — فلا يتغيّر سلوك — ويُملأ القديم مرّةً بالمطابقة نفسها. أوامر الخدمة الموحّدة (م٢) ستكتبها
// صراحةً لاحقاً، ويبقى المشغّل شبكة أمان.
// آمنٌ للتكرار: الأعمدة IF NOT EXISTS، والدوالّ OR REPLACE، والمشغّلات والقيد بفحص الوجود،
// والملء القديم مرّةً واحدة بمفتاح في one_time_migrations.
import { sql } from 'drizzle-orm';

export async function migrateBookingChannelLink(db: any): Promise<void> {
  await db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS channel VARCHAR(12)`);
  await db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS actor VARCHAR(120)`);
  await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS channel VARCHAR(12)`);
  await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS actor VARCHAR(120)`);
  await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reservation_id INTEGER`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_bookings_reservation ON bookings (reservation_id)`);
  // آخر تسعة أرقام: «0791234567» و«+962 79 123 4567» رقمٌ واحد (بلا \D كي لا يُفسد قالب النصّ)
  await db.execute(sql`CREATE OR REPLACE FUNCTION phone9(t TEXT) RETURNS TEXT AS $fn$
    SELECT CASE WHEN length(regexp_replace(COALESCE(t, ''), '[^0-9]', '', 'g')) >= 9
                THEN right(regexp_replace(t, '[^0-9]', '', 'g'), 9) ELSE '' END
  $fn$ LANGUAGE sql IMMUTABLE`);
  await db.execute(sql`CREATE OR REPLACE FUNCTION booking_channel_of(by TEXT) RETURNS VARCHAR AS $fn$
    SELECT CASE
      WHEN by = 'player-app' THEN 'app'
      WHEN by LIKE '🤖%' THEN 'bot'
      WHEN by LIKE '🔒%' THEN 'botadmin'
      WHEN by LIKE '👥%' THEN 'group'
      WHEN by LIKE '%Auto-Sync%' THEN 'door'
      WHEN by = 'reservation-confirm' THEN NULL
      WHEN by = 'poll-import' THEN 'import'
      WHEN by IN ('تسوية-سجل', 'مراجعة الحجوزات') THEN 'system'
      ELSE 'staff' END
  $fn$ LANGUAGE sql IMMUTABLE`);
  await db.execute(sql`CREATE OR REPLACE FUNCTION booking_actor_of(ch TEXT, by TEXT, pid INTEGER, ph TEXT) RETURNS VARCHAR AS $fn$
    SELECT CASE WHEN ch IN ('app', 'bot', 'group') THEN COALESCE('player:' || pid, 'phone:' || NULLIF(phone9(ph), ''))
                ELSE NULLIF(left(COALESCE(by, ''), 120), '') END
  $fn$ LANGUAGE sql IMMUTABLE`);
  await db.execute(sql`CREATE OR REPLACE FUNCTION reservations_fill() RETURNS trigger AS $fn$
    BEGIN
      IF NEW.channel IS NULL THEN NEW.channel := COALESCE(booking_channel_of(NEW.created_by), 'staff'); END IF;
      IF NEW.actor IS NULL THEN NEW.actor := booking_actor_of(NEW.channel, NEW.created_by, NEW.player_id, NEW.phone); END IF;
      RETURN NEW;
    END $fn$ LANGUAGE plpgsql`);
  await db.execute(sql`CREATE OR REPLACE FUNCTION bookings_fill() RETURNS trigger AS $fn$
    BEGIN
      IF NEW.reservation_id IS NULL AND NEW.activity_id IS NOT NULL THEN
        SELECT r.id INTO NEW.reservation_id FROM reservations r
         WHERE r.activity_id = NEW.activity_id AND r.deleted_at IS NULL
           AND ((NEW.player_id IS NOT NULL AND r.player_id = NEW.player_id) OR (phone9(NEW.phone) <> '' AND phone9(r.phone) = phone9(NEW.phone)))
         ORDER BY r.id LIMIT 1;
      END IF;
      IF NEW.channel IS NULL THEN
        NEW.channel := COALESCE(booking_channel_of(NEW.created_by), (SELECT r.channel FROM reservations r WHERE r.id = NEW.reservation_id), 'staff');
      END IF;
      IF NEW.actor IS NULL THEN NEW.actor := booking_actor_of(NEW.channel, NEW.created_by, NEW.player_id, NEW.phone); END IF;
      RETURN NEW;
    END $fn$ LANGUAGE plpgsql`);
  // صفّ متابعةٍ يُنشأ بعد صفّ حجزه (أو يُربط بحسابه لاحقاً) ⟵ يلتقط صفوف الحجز غير المربوطة
  await db.execute(sql`CREATE OR REPLACE FUNCTION reservations_link_bookings() RETURNS trigger AS $fn$
    BEGIN
      IF NEW.activity_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
        UPDATE bookings b SET reservation_id = NEW.id
         WHERE b.activity_id = NEW.activity_id AND b.reservation_id IS NULL AND b.deleted_at IS NULL
           AND ((NEW.player_id IS NOT NULL AND b.player_id = NEW.player_id) OR (phone9(NEW.phone) <> '' AND phone9(b.phone) = phone9(NEW.phone)));
      END IF;
      RETURN NULL;
    END $fn$ LANGUAGE plpgsql`);
  await db.execute(sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'reservations_fill_trg') THEN
      CREATE TRIGGER reservations_fill_trg BEFORE INSERT ON reservations FOR EACH ROW EXECUTE FUNCTION reservations_fill();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'bookings_fill_trg') THEN
      CREATE TRIGGER bookings_fill_trg BEFORE INSERT ON bookings FOR EACH ROW EXECUTE FUNCTION bookings_fill();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'reservations_link_bookings_trg') THEN
      CREATE TRIGGER reservations_link_bookings_trg AFTER INSERT OR UPDATE OF player_id, phone, activity_id ON reservations
        FOR EACH ROW EXECUTE FUNCTION reservations_link_bookings();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bookings_reservation') THEN
      ALTER TABLE bookings ADD CONSTRAINT fk_bookings_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;
    END IF;
  END $$`);
  // القديم مرّةً واحدة: القناة والفاعل من الوسوم، والرابط بالمطابقة (الحيّ أوّلاً ثمّ المحذوف)
  await db.execute(sql`CREATE TABLE IF NOT EXISTS one_time_migrations (key VARCHAR(100) PRIMARY KEY, ran_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
  const [claim]: any[] = ((await db.execute(sql`INSERT INTO one_time_migrations (key) VALUES ('booking-channel-link-2026-11-21') ON CONFLICT DO NOTHING RETURNING key`)) as any).rows ?? [];
  if (claim) {
    await db.execute(sql`UPDATE reservations SET channel = COALESCE(booking_channel_of(created_by), 'staff') WHERE channel IS NULL`);
    await db.execute(sql`UPDATE reservations SET actor = booking_actor_of(channel, created_by, player_id, phone) WHERE actor IS NULL`);
    await db.execute(sql`UPDATE bookings b SET reservation_id = (
        SELECT r.id FROM reservations r WHERE r.activity_id = b.activity_id
           AND ((b.player_id IS NOT NULL AND r.player_id = b.player_id) OR (phone9(b.phone) <> '' AND phone9(r.phone) = phone9(b.phone)))
         ORDER BY (r.deleted_at IS NULL) DESC, r.id LIMIT 1)
      WHERE b.reservation_id IS NULL AND b.activity_id IS NOT NULL`);
    await db.execute(sql`UPDATE bookings b SET channel = COALESCE(booking_channel_of(b.created_by), (SELECT r.channel FROM reservations r WHERE r.id = b.reservation_id), 'staff') WHERE b.channel IS NULL`);
    await db.execute(sql`UPDATE bookings SET actor = booking_actor_of(channel, created_by, player_id, phone) WHERE actor IS NULL`);
    console.log('🧭 booking channel/actor/link backfill done');
  }
}
