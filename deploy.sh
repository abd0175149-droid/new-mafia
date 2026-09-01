#!/bin/bash
# ══════════════════════════════════════════════════════
# 🎭 Unified Mafia Platform — Deploy Script
#
# ⚠️ لماذا أُعيدت كتابته: النسخة السابقة كانت تطبع «Deployment Successful!»
#    دائماً — تنجح الرسالة ولو انهار الخادم. وكانت تبتلع أخطاء الترحيل بـ
#    `2>/dev/null || true` ثم تعلن «✅ Database columns verified»، فإخفاق
#    عمود واحد يمرّ صامتاً ويظهر لاحقاً على شكل خطأ في وجه لاعب.
#
#    الآن: نسخة احتياطية قبل أي لمس · صور محفوظة للتراجع · الترحيل يُظهر
#    خطأه · بوّابة صحّة تُقرّر النجاح · وتراجع تلقائي عند الفشل.
# ══════════════════════════════════════════════════════

set -Eeuo pipefail

DB_USER="${DB_USER:-mafia_user}"
DB_NAME="${DB_NAME:-mafia_db}"
HEALTH_URL="${HEALTH_URL:-http://localhost:4000/api/health}"
HEALTH_TRIES="${HEALTH_TRIES:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/backup_deploy_${STAMP}.sql.gz"
PREV_SHA="$(git rev-parse --short HEAD)"
ROLLED_BACK=0

say()  { echo -e "$1"; }
fail() { echo -e "\n❌ $1" >&2; }

# ── التراجع: نُعيد الصور السابقة ثم نُعلن ما يلزم يدوياً ──
rollback() {
  [ "$ROLLED_BACK" = "1" ] && return 0
  ROLLED_BACK=1
  say ""
  say "🔙 التراجع — نُعيد تشغيل الصور السابقة…"
  local restored=0
  for svc in backend frontend; do
    if docker image inspect "mafia-prod-${svc}:rollback-${STAMP}" >/dev/null 2>&1; then
      docker tag "mafia-prod-${svc}:rollback-${STAMP}" "mafia-prod-${svc}:latest" && restored=1
    fi
  done
  if [ "$restored" = "1" ]; then
    docker compose up -d --force-recreate backend frontend || true
    say "   ✅ عادت الحاويات إلى صور ما قبل النشر"
  else
    say "   ⚠️ لا صور سابقة محفوظة — التراجع يدوي"
  fi
  say ""
  say "   الشيفرة ما زالت على الإصدار الجديد. للعودة إليه:"
  say "     git checkout ${PREV_SHA} && ./deploy.sh"
  say ""
  say "   ⚠️ إن كان الترحيل قد لمس البيانات، الاستعادة من النسخة:"
  say "     gunzip -c ${BACKUP} | docker exec -i mafia-prod-database-1 psql -U ${DB_USER} -d ${DB_NAME}"
}

trap 'fail "توقّف النشر عند السطر $LINENO"; rollback; exit 1' ERR

say "🎭 ══════════════════════════════════════════"
say "   Unified Mafia Platform — Deployment"
say "══════════════════════════════════════════════"

# ── 0. نسخة احتياطية — قبل كل شيء ──
say ""
say "0️⃣  نسخة احتياطية من قاعدة البيانات…"
if ! docker exec mafia-prod-database-1 pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip > "$BACKUP"; then
  fail "فشل أخذ النسخة الاحتياطية — لا نشر بلا نسخة."
  rm -f "$BACKUP"; exit 1
fi
BACKUP_SIZE=$(stat -c%s "$BACKUP" 2>/dev/null || echo 0)
if [ "$BACKUP_SIZE" -lt 10000 ]; then
  fail "النسخة الاحتياطية صغيرة بشكل مريب (${BACKUP_SIZE} بايت) — غالباً pg_dump فشل صامتاً. أُلغي النشر."
  rm -f "$BACKUP"; exit 1
fi
say "   ✅ $(du -h "$BACKUP" | cut -f1) → $BACKUP"

# ── 1. الشيفرة ──
say ""
say "1️⃣  جلب آخر شيفرة…"
git pull origin master
say "   من ${PREV_SHA} إلى $(git rev-parse --short HEAD)"

# ── 2. البيئة ──
if [ ! -f .env ]; then
  fail "لا ملف .env — انسخ .env.production وعدّله ثم أعد التشغيل."
  exit 1
fi

# ── 3. حفظ الصور الحالية للتراجع ثم البناء ──
say ""
say "2️⃣  حفظ الصور الحالية ثم البناء (الحاويات القديمة ما زالت تعمل)…"
for svc in backend frontend; do
  docker image inspect "mafia-prod-${svc}:latest" >/dev/null 2>&1 \
    && docker tag "mafia-prod-${svc}:latest" "mafia-prod-${svc}:rollback-${STAMP}" \
    && say "   📌 mafia-prod-${svc}:rollback-${STAMP}"
done
docker compose build --no-cache

# ── 4. الاستبدال ──
say ""
say "3️⃣  استبدال الحاويات…"
docker compose up -d --force-recreate

# ── 5. الترحيل — الخطأ يُظهَر لا يُبتلع ──
say ""
say "4️⃣  ترحيل قاعدة البيانات…"
sleep 5
MIGRATION_LOG="$(mktemp)"
if docker compose exec -T database psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL' >"$MIGRATION_LOG" 2>&1
ALTER TABLE players ADD COLUMN IF NOT EXISTS email VARCHAR(200);
ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE players ADD COLUMN IF NOT EXISTS rank_tier VARCHAR(20) DEFAULT 'INFORMANT';
ALTER TABLE players ADD COLUMN IF NOT EXISTS rank_rr INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS total_deals INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS successful_deals INTEGER DEFAULT 0;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS rounds_survived INTEGER DEFAULT 0;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS deal_initiated BOOLEAN DEFAULT false;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS deal_success BOOLEAN;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS ability_used BOOLEAN DEFAULT false;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS ability_correct BOOLEAN;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS xp_earned INTEGER DEFAULT 0;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS rr_change INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS player_id INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS max_capacity INTEGER DEFAULT 20;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) DEFAULT 'medium';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS seat_assignments JSONB DEFAULT '[]';
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS remind_opt_in BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS remind_sent_at TIMESTAMP;
-- تعليمُ رسالةِ الواتساب اليدويّة — منفصلٌ عن remind_sent_at (تذكيرُ البوت الآليّ):
-- الأوّل «موظّفٌ راسل هذا الشخص»، والثاني «النظامُ ذكّره قبل ساعة». خلطُهما يُفقد المعنيين.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS wa_sent_at TIMESTAMP;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS wa_sent_by VARCHAR(100) DEFAULT '';
-- 🔒 قفلُ حساب اللاعب — منعُ الدخول بقرارٍ إداريّ، منفصلٌ عن الحذف
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE players ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP;
ALTER TABLE players ADD COLUMN IF NOT EXISTS locked_by INTEGER;
ALTER TABLE players ADD COLUMN IF NOT EXISTS locked_reason VARCHAR(200) DEFAULT '';
-- 🔒📍 محاولاتُ الدخول على الحسابات المقفولة — مصدرُ المحاولة وزمنُها
CREATE TABLE IF NOT EXISTS locked_login_attempts (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  phone_tried VARCHAR(30) DEFAULT '',
  ip VARCHAR(60) DEFAULT '',
  user_agent VARCHAR(300) DEFAULT '',
  password_ok BOOLEAN NOT NULL DEFAULT false,
  at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_locked_attempts_player ON locked_login_attempts (player_id, at DESC);
ALTER TABLE wa_bot_settings ADD COLUMN IF NOT EXISTS admin_only_tools JSONB DEFAULT '[]';
-- 📍 سياج الفعاليّة — النقطة على المكان، والقرار على الفعاليّة
ALTER TABLE locations  ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6);
ALTER TABLE locations  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6);
ALTER TABLE locations  ADD COLUMN IF NOT EXISTS geofence_radius_m INTEGER NOT NULL DEFAULT 200;
ALTER TABLE locations  ADD COLUMN IF NOT EXISTS geofence_set_by INTEGER;
ALTER TABLE locations  ADD COLUMN IF NOT EXISTS geofence_set_at TIMESTAMP;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS geofence_enabled BOOLEAN DEFAULT false;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS geofence_radius_m INTEGER;
CREATE TABLE IF NOT EXISTS player_last_fix (
  player_id   INTEGER PRIMARY KEY,
  latitude    NUMERIC(9,6) NOT NULL,
  longitude   NUMERIC(9,6) NOT NULL,
  accuracy_m  INTEGER,
  is_mocked   BOOLEAN DEFAULT false,
  source      VARCHAR(10) DEFAULT 'web',
  captured_at TIMESTAMP NOT NULL,
  updated_at  TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE TABLE IF NOT EXISTS presence_checks (
  id          SERIAL PRIMARY KEY,
  player_id   INTEGER NOT NULL,
  activity_id INTEGER,
  gate        VARCHAR(12) NOT NULL,
  result      VARCHAR(24) NOT NULL,
  distance_m  INTEGER,
  accuracy_m  INTEGER,
  is_mocked   BOOLEAN DEFAULT false,
  enforced    BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS presence_checks_activity_idx ON presence_checks (activity_id, created_at DESC);
UPDATE sessions SET status = 'closed' WHERE is_active = false AND status IS NULL;
UPDATE sessions SET status = 'closed' WHERE is_active = false AND status = 'active';
UPDATE sessions SET status = 'active' WHERE is_active = true AND (status IS NULL OR status = '');
CREATE TABLE IF NOT EXISTS player_follows (
  id SERIAL PRIMARY KEY,
  follower_id INTEGER NOT NULL,
  following_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(follower_id, following_id)
);
-- 📖 محتوى شرح الأدوار للاعب — يُحرَّر من لوحة الإدارة (RolesTab)
ALTER TABLE role_definitions ADD COLUMN IF NOT EXISTS one_liner VARCHAR(160);
ALTER TABLE role_definitions ADD COLUMN IF NOT EXISTS how_it_works TEXT;
ALTER TABLE role_definitions ADD COLUMN IF NOT EXISTS tips JSONB;
ALTER TABLE role_definitions ADD COLUMN IF NOT EXISTS extra_limits JSONB;
ALTER TABLE role_definitions ADD COLUMN IF NOT EXISTS interacts_with JSONB;
ALTER TABLE role_definitions ADD COLUMN IF NOT EXISTS phase_notes JSONB;
ALTER TABLE role_definitions ADD COLUMN IF NOT EXISTS acts_in_phases JSONB;
SQL
then
  say "   ✅ الترحيل تمّ"
  rm -f "$MIGRATION_LOG"
else
  fail "فشل الترحيل — هذا ما قالته القاعدة:"
  cat "$MIGRATION_LOG" >&2
  rm -f "$MIGRATION_LOG"
  rollback
  exit 1
fi

# ── 6. بوّابة الصحّة — هي التي تقرّر النجاح، لا نهاية السكربت ──
say ""
say "5️⃣  انتظار استجابة الخادم…"
HEALTHY=0
for i in $(seq 1 "$HEALTH_TRIES"); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 4 "$HEALTH_URL" || true)"
  if [ "$CODE" = "200" ]; then HEALTHY=1; say "   ✅ استجاب بعد ${i}ث"; break; fi
  sleep 1
done

if [ "$HEALTHY" != "1" ]; then
  fail "الخادم لم يستجب خلال ${HEALTH_TRIES}ث — آخر ٤٠ سطراً من السجلّ:"
  docker logs mafia-prod-backend-1 --tail 40 >&2 || true
  rollback
  exit 1
fi

# الواجهة أيضاً — «الخادم حيّ» لا يعني «الموقع يفتح»
FRONT_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 http://localhost:3010 || true)"
if [ "$FRONT_CODE" != "200" ] && [ "$FRONT_CODE" != "307" ] && [ "$FRONT_CODE" != "308" ]; then
  fail "الواجهة ردّت ${FRONT_CODE} بدل 200 — آخر ٣٠ سطراً:"
  docker logs mafia-prod-frontend-1 --tail 30 >&2 || true
  rollback
  exit 1
fi
say "   ✅ الواجهة ترد (${FRONT_CODE})"

# ── 7. تنظيف الصور ──
say ""
say "6️⃣  تنظيف الصور القديمة…"
docker image prune -f >/dev/null
# نُبقي آخر ٣ صور تراجع فقط — ما زاد يملأ القرص بلا فائدة
for svc in backend frontend; do
  docker images --format '{{.Repository}}:{{.Tag}}' \
    | grep -E "^mafia-prod-${svc}:rollback-" | sort -r | tail -n +4 \
    | xargs -r -n1 docker rmi -f >/dev/null 2>&1 || true
done

trap - ERR
say ""
say "✅ ══════════════════════════════════════════"
say "   نُشر بنجاح — الخادم والواجهة يستجيبان"
say "   🌐 https://club-mafia.grade.sbs"
say "   💾 نسخة احتياطية: $BACKUP"
say "   🔙 للتراجع: docker tag mafia-prod-backend:rollback-${STAMP} mafia-prod-backend:latest && docker compose up -d"
say "══════════════════════════════════════════════"
