# 🏙️ Runbook — الرانك حسب المدينة (ترتيبٌ لكلّ مدينة داخل الموسم الواحد)

التاريخ: 2026-09-09 · الحالة: الكود جاهز (backend + frontend + mobile 0.4.0) · **لم يُنشر بعد**

المرجع: أرت-فاكت التحليل والمحاكاة — https://claude.ai/code/artifact/73f048cf-43fb-4949-8c0d-797388b7a879

## ما الذي يتغيّر في القاعدة (كلّه idempotent، في `deploy.sh` وفي إقلاع `index.ts`)
- جدول `cities` + بذر: عمّان (1، فعّالة)، الزرقاء (2، **معطّلة حتى الإطلاق**).
- `locations.city_id NOT NULL` (تعبئة الكلّ → 1) · `sessions.location_id` · `matches.city_id` (ختمٌ مجمَّد) ·
  `player_season_stats.city_id` + قيد وحدانيّة `(player_id, season_id, COALESCE(city_id,0))` ·
  `rank_bonuses.city_id` · `players.home_city_id/home_city_source` · `whatsapp_rank_notifications.city_id` + قيد جديد.
- كلّ تاريخ اللعب يُعبَّأ **عمّان**. مباريات الموسم العادي التاريخيّة بلا نشاط → عمّان أيضاً (لا تُفقد نقطة).

## بوّابة القبول (لا تُخطى)
كلّ التاريخ في عمّان ⇒ بعد الترحيل والمصالحة يجب أن تتطابق أرقام «عمّان — الموسم النشط» مع الأرقام الحاليّة **حرفيّاً**.

```bash
# 0) لقطةٌ مرجعيّة قبل النشر (على الخادم)
docker exec mafia-prod-database-1 psql -U mafia_user -d mafia_db -At -c "
SELECT md5(string_agg(player_id||':'||COALESCE(rank_tier,'')||':'||COALESCE(rank_rr,0)||':'||COALESCE(xp,0)||':'||COALESCE(level,1)||':'||COALESCE(total_matches,0)||':'||COALESCE(total_wins,0), '|' ORDER BY player_id))
FROM player_season_stats WHERE season_id = (SELECT id FROM seasons WHERE type='REGULAR' AND status='ACTIVE')"
# واحفظ أيضاً بصمة players.*:
docker exec mafia-prod-database-1 psql -U mafia_user -d mafia_db -At -c "
SELECT md5(string_agg(id||':'||COALESCE(rank_tier,'')||':'||COALESCE(rank_rr,0)||':'||COALESCE(xp,0)||':'||COALESCE(level,1)||':'||COALESCE(total_matches,0), '|' ORDER BY id)) FROM players"

# 1) النشر (يأخذ نسخةً احتياطيّة ويشغّل SQL الترحيل ثمّ بوّابة الصحّة)
ssh mafia-prod 'cd ~/mafia-prod && git pull && ./deploy.sh'

# 2) مصالحةٌ كاملة للموسم النشط — تقرير ثمّ تطبيق
docker compose exec -T backend npx tsx src/scripts/recalc-progression-v2.ts
docker compose exec -T backend npx tsx src/scripts/recalc-progression-v2.ts --apply

# 3) التحقّق: البصمة الجديدة لصفوف عمّان (city_id = 1) يجب أن تساوي لقطة الخطوة 0
docker exec mafia-prod-database-1 psql -U mafia_user -d mafia_db -At -c "
SELECT md5(string_agg(player_id||':'||COALESCE(rank_tier,'')||':'||COALESCE(rank_rr,0)||':'||COALESCE(xp,0)||':'||COALESCE(level,1)||':'||COALESCE(total_matches,0)||':'||COALESCE(total_wins,0), '|' ORDER BY player_id))
FROM player_season_stats WHERE city_id = 1 AND season_id = (SELECT id FROM seasons WHERE type='REGULAR' AND status='ACTIVE')"
# ولا صفوف لأيّ مدينةٍ أخرى بعد:
docker exec mafia-prod-database-1 psql -U mafia_user -d mafia_db -At -c "
SELECT city_id, COUNT(*) FROM player_season_stats WHERE season_id = (SELECT id FROM seasons WHERE type='REGULAR' AND status='ACTIVE') GROUP BY city_id"
# وثوابت البيانات:
docker exec mafia-prod-database-1 psql -U mafia_user -d mafia_db -At -c "
SELECT (SELECT COUNT(*) FROM locations WHERE city_id IS NULL AND deleted_at IS NULL) AS loc_no_city,
       (SELECT COUNT(*) FROM matches m JOIN sessions s ON s.id=m.session_id WHERE m.city_id IS NULL AND COALESCE(s.is_remote,false)=false AND m.season_id=(SELECT id FROM seasons WHERE type='REGULAR' AND status='ACTIVE')) AS regular_matches_no_city"

# 4) الفحص الشامل «مدينتان، لاعبٌ واحد» (يُنشئ ويُنظّف آثاره)
docker compose exec -T backend npx tsx src/scripts/e2e-city-scope.ts
```

أيّ فرقٍ في البصمة = إيقافٌ وتراجع: `docker tag mafia-prod-backend:rollback-<stamp> mafia-prod-backend:latest && docker compose up -d`
(الأعمدة الجديدة تبقى بلا استعمال ولا تضرّ الكود القديم — عدا `locations.city_id NOT NULL` التي تمنع إنشاء مكانٍ من النسخة القديمة).

## بعد النشر
- الداشبورد: الشريط الجانبيّ فيه مبدّل النطاق؛ الأماكن تعرض مدينتها؛ «المواسم» في القائمة.
- الليدر: إنشاء الغرفة يعرض «ستُحتسب لتصنيف عمّان — الموسم»؛ «بدون نشاط» يطلب مكاناً وإلا UNRANKED.
- التطبيق: نسخة 0.4.0 (Flutter) — النسخ القديمة تعمل (الحقول القديمة = المدينة الأساسيّة). الـPWA محدَّث فوراً.
- الإشعارات: فعاليّةٌ جديدة تصل لاعبي مدينتها؛ «أرسل للكلّ هذه المرّة» من نموذج الفعاليّة.

## إطلاق الزرقاء
1. الداشبورد ← الأماكن ← «إدارة المدن» ← تفعيل «الزرقاء».
2. إضافة مكان الزرقاء بمدينته (إلزاميّ) + نقطة السياج.
3. فعاليّةٌ أولى مع «أرسل للكلّ هذه المرّة» (لا لاعبين في الزرقاء بعد).
4. بعد الليلة الأولى: `SELECT city_id, COUNT(*) FROM player_season_stats WHERE season_id=<active> GROUP BY city_id` → صفوف city_id=2 فقط جديدة، وصفوف عمّان لمن شارك لم تتحرّك.

## السكربتات المتأثّرة
- `recalc-progression-v2.ts` — كما هو (المصالحة صارت بالمدينة داخليّاً).
- `start-regular-season.ts --dry-run` — يطبع أعداد كلّ مدينة قبل التجميد.
- `grant-early-booking-bonus.ts` — يسجّل المكافأة بمدينة الفعاليّة ويطبّقها بالمصالحة.
- `recalculate_progression.ts` (القديم) — **لا يُستعمل**: لا يعرف المدن ولا المواسم.
