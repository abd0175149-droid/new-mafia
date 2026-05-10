// ══════════════════════════════════════════════════════
// 🧹 حذف الأنشطة الوهمية (غير ثلاثاء/خميس/جمعة + أربعاء 29/4)
// مع باك أب كامل قبل الحذف
// ══════════════════════════════════════════════════════
// التشغيل:
// cd ~/unified-mafia && docker compose exec postgres psql -U mafia_user -d mafia_db -f /dev/stdin < backend/src/scripts/cleanup_fake_activities.sql

-- ═══════════════════════════════════════════
-- الخطوة 1: تحديد الأنشطة المستهدفة للحذف
-- ═══════════════════════════════════════════
-- الأيام المسموحة: الثلاثاء (2), الخميس (4), الجمعة (5)
-- + استثناء: الأربعاء 2026-04-29

-- عرض الأنشطة التي ستُحذف (للمراجعة):
SELECT '=== الأنشطة المستهدفة للحذف ===' AS info;
SELECT 
  id, name, date, status,
  TO_CHAR(date, 'Day') AS day_name,
  EXTRACT(DOW FROM date) AS day_num
FROM activities
WHERE 
  EXTRACT(DOW FROM date) NOT IN (2, 4, 5)  -- ليست ثلاثاء/خميس/جمعة
  AND date::date != '2026-04-29'             -- وليست أربعاء 29/4
ORDER BY date;

-- عرض الأنشطة التي ستبقى (للتأكد):
SELECT '=== الأنشطة التي ستبقى ===' AS info;
SELECT 
  id, name, date, status,
  TO_CHAR(date, 'Day') AS day_name
FROM activities
WHERE 
  EXTRACT(DOW FROM date) IN (2, 4, 5)  -- ثلاثاء/خميس/جمعة
  OR date::date = '2026-04-29'           -- أو أربعاء 29/4
ORDER BY date;

-- ═══════════════════════════════════════════
-- الخطوة 2: باك أب كامل (JSON) 
-- يتم تصديره كـ COPY TO
-- ═══════════════════════════════════════════

-- باك أب الأنشطة المستهدفة
\copy (SELECT row_to_json(a) FROM activities a WHERE EXTRACT(DOW FROM a.date) NOT IN (2, 4, 5) AND a.date::date != '2026-04-29') TO '/tmp/backup_activities.json'

-- باك أب الحجوزات المرتبطة
\copy (SELECT row_to_json(b) FROM bookings b WHERE b.activity_id IN (SELECT id FROM activities WHERE EXTRACT(DOW FROM date) NOT IN (2, 4, 5) AND date::date != '2026-04-29')) TO '/tmp/backup_bookings.json'

-- باك أب التكاليف المرتبطة
\copy (SELECT row_to_json(c) FROM costs c WHERE c.activity_id IN (SELECT id FROM activities WHERE EXTRACT(DOW FROM date) NOT IN (2, 4, 5) AND date::date != '2026-04-29')) TO '/tmp/backup_costs.json'

-- باك أب الغرف المرتبطة
\copy (SELECT row_to_json(s) FROM sessions s WHERE s.activity_id IN (SELECT id FROM activities WHERE EXTRACT(DOW FROM date) NOT IN (2, 4, 5) AND date::date != '2026-04-29')) TO '/tmp/backup_sessions.json'

-- باك أب المباريات المرتبطة بالغرف
\copy (SELECT row_to_json(m) FROM matches m WHERE m.session_id IN (SELECT s.id FROM sessions s WHERE s.activity_id IN (SELECT id FROM activities WHERE EXTRACT(DOW FROM date) NOT IN (2, 4, 5) AND date::date != '2026-04-29'))) TO '/tmp/backup_matches.json'

-- باك أب لاعبي المباريات
\copy (SELECT row_to_json(mp) FROM match_players mp WHERE mp.match_id IN (SELECT m.id FROM matches m WHERE m.session_id IN (SELECT s.id FROM sessions s WHERE s.activity_id IN (SELECT id FROM activities WHERE EXTRACT(DOW FROM date) NOT IN (2, 4, 5) AND date::date != '2026-04-29')))) TO '/tmp/backup_match_players.json'

-- باك أب لاعبي الغرف
\copy (SELECT row_to_json(sp) FROM session_players sp WHERE sp.session_id IN (SELECT s.id FROM sessions s WHERE s.activity_id IN (SELECT id FROM activities WHERE EXTRACT(DOW FROM date) NOT IN (2, 4, 5) AND date::date != '2026-04-29'))) TO '/tmp/backup_session_players.json'

-- باك أب التقييمات
\copy (SELECT row_to_json(sv) FROM surveys sv WHERE sv.match_id IN (SELECT m.id FROM matches m WHERE m.session_id IN (SELECT s.id FROM sessions s WHERE s.activity_id IN (SELECT id FROM activities WHERE EXTRACT(DOW FROM date) NOT IN (2, 4, 5) AND date::date != '2026-04-29')))) TO '/tmp/backup_surveys.json'

SELECT '✅ تم إنشاء الباك أب في /tmp/backup_*.json' AS info;

-- ═══════════════════════════════════════════
-- الخطوة 3: الحذف (بالترتيب الصحيح بسبب FK)
-- ═══════════════════════════════════════════

BEGIN;

-- 3.1 حذف التقييمات المرتبطة
DELETE FROM surveys 
WHERE match_id IN (
  SELECT m.id FROM matches m 
  WHERE m.session_id IN (
    SELECT s.id FROM sessions s 
    WHERE s.activity_id IN (
      SELECT id FROM activities 
      WHERE EXTRACT(DOW FROM date) NOT IN (2, 4, 5) 
      AND date::date != '2026-04-29'
    )
  )
);

-- 3.2 حذف لاعبي المباريات
DELETE FROM match_players 
WHERE match_id IN (
  SELECT m.id FROM matches m 
  WHERE m.session_id IN (
    SELECT s.id FROM sessions s 
    WHERE s.activity_id IN (
      SELECT id FROM activities 
      WHERE EXTRACT(DOW FROM date) NOT IN (2, 4, 5) 
      AND date::date != '2026-04-29'
    )
  )
);

-- 3.3 حذف المباريات
DELETE FROM matches 
WHERE session_id IN (
  SELECT s.id FROM sessions s 
  WHERE s.activity_id IN (
    SELECT id FROM activities 
    WHERE EXTRACT(DOW FROM date) NOT IN (2, 4, 5) 
    AND date::date != '2026-04-29'
  )
);

-- 3.4 حذف لاعبي الغرف
DELETE FROM session_players 
WHERE session_id IN (
  SELECT s.id FROM sessions s 
  WHERE s.activity_id IN (
    SELECT id FROM activities 
    WHERE EXTRACT(DOW FROM date) NOT IN (2, 4, 5) 
    AND date::date != '2026-04-29'
  )
);

-- 3.5 حذف الغرف
DELETE FROM sessions 
WHERE activity_id IN (
  SELECT id FROM activities 
  WHERE EXTRACT(DOW FROM date) NOT IN (2, 4, 5) 
  AND date::date != '2026-04-29'
);

-- 3.6 حذف التكاليف المرتبطة
DELETE FROM costs 
WHERE activity_id IN (
  SELECT id FROM activities 
  WHERE EXTRACT(DOW FROM date) NOT IN (2, 4, 5) 
  AND date::date != '2026-04-29'
);

-- 3.7 حذف الحجوزات (cascade من activities لكن نحذفها يدوياً للأمان)
DELETE FROM bookings 
WHERE activity_id IN (
  SELECT id FROM activities 
  WHERE EXTRACT(DOW FROM date) NOT IN (2, 4, 5) 
  AND date::date != '2026-04-29'
);

-- 3.8 حذف الأنشطة نفسها
DELETE FROM activities 
WHERE EXTRACT(DOW FROM date) NOT IN (2, 4, 5) 
AND date::date != '2026-04-29';

COMMIT;

SELECT '✅ تم الحذف بنجاح!' AS info;

-- التحقق: عرض الأنشطة المتبقية
SELECT '=== الأنشطة المتبقية ===' AS info;
SELECT id, name, date, status, TO_CHAR(date, 'Day') AS day_name
FROM activities ORDER BY date;
