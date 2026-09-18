#!/bin/bash
# 🎟️ اختبار دخان لبطاقة الولاء على الإنتاج — يُشغَّل على الخادم بعد النشر.
# يتحقّق من: الجداول، مسار اللاعب (enabled:false قبل التشغيل)، إعدادات الإدارة، المحاكاة، الحماية.
set -u
API=${API:-http://localhost:4000}
ADMIN_USER=${ADMIN_USER:-}
ADMIN_PASS=${ADMIN_PASS:-}
DB="docker exec mafia-prod-database-1 psql -U mafia_user -d mafia_db -tA -c"

echo "== tables"
$DB "select table_name from information_schema.tables where table_name in ('loyalty_config','loyalty_stamps','loyalty_rewards') order by 1"
$DB "select column_name from information_schema.columns where table_name='bookings' and column_name='loyalty_reward_id'"
$DB "select column_name from information_schema.columns where table_name='order_invoices' and column_name in ('loyalty_discount','loyalty_reward_id')"

echo "== player route without token (expect 401)"
curl -s -o /dev/null -w "%{http_code}\n" "$API/api/loyalty/me"

echo "== admin route without token (expect 401)"
curl -s -o /dev/null -w "%{http_code}\n" "$API/api/loyalty/admin/config"

if [ -n "$ADMIN_USER" ]; then
  TOKEN=$(curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  echo "== admin config"; curl -s "$API/api/loyalty/admin/config" -H "Authorization: Bearer $TOKEN" | head -c 600; echo
  echo "== simulate 6h current month"; curl -s "$API/api/loyalty/admin/simulate?hours=6" -H "Authorization: Bearer $TOKEN"; echo
  echo "== overview"; curl -s "$API/api/loyalty/admin/overview" -H "Authorization: Bearer $TOKEN" | head -c 500; echo
  echo "== players"; curl -s "$API/api/loyalty/admin/players?size=5" -H "Authorization: Bearer $TOKEN" | head -c 500; echo
fi
echo "== upcoming activities carry loyaltyCutoffAt (null while disabled)"
curl -s "$API/api/player-app/activities/upcoming?cityId=all" | grep -o '"loyaltyCutoffAt":[^,]*' | head -3
