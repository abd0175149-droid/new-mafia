#!/bin/bash
# ينشر contacts-app على السيرفر ويضيف سب دومين إلى نفق Cloudflare الموجود.
# شغّله من داخل مجلد contacts-app على السيرفر:
#   sudo bash deploy/setup-server.sh contacts.masaros.net
# آمن لإعادة التشغيل: لا يكرر إدخال النفق، ولا يمس .env الموجود.
set -euo pipefail

HOST="${1:-contacts.masaros.net}"
CFG="${CLOUDFLARED_CONFIG:-/etc/cloudflared/config.yml}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

[ "$(id -u)" = 0 ] || { echo "شغّله بـ sudo"; exit 1; }
command -v docker >/dev/null || { echo "Docker غير مثبّت"; exit 1; }
[ -f "$CFG" ] || { echo "لم أجد إعدادات النفق في $CFG (حدّد CLOUDFLARED_CONFIG=...)"; exit 1; }

# ── 1) ملف .env ──
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$(openssl rand -hex 32)/" .env
  read -rsp "كلمة مرور لوحة الأدمن (8 أحرف على الأقل): " PW; echo
  [ ${#PW} -ge 8 ] || { echo "قصيرة جداً"; rm .env; exit 1; }
  PW_ESC=$(printf '%s' "$PW" | sed 's/[\/&|]/\\&/g')
  sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$PW_ESC|" .env
  chmod 600 .env
  echo "أُنشئ .env"
fi
PORT=$(grep -E '^HOST_PORT=' .env | cut -d= -f2); PORT=${PORT:-3070}

# المنفذ يجب ألا يكون مستخدماً من خدمة أخرى (إلا حاويتنا نفسها)
if ss -ltn "sport = :$PORT" | grep -q LISTEN && ! docker compose ps --status running 2>/dev/null | grep -q app; then
  echo "المنفذ $PORT مستخدم. غيّر HOST_PORT في .env"; exit 1
fi

# ── 2) الحاوية ──
mkdir -p data && chown -R 1000:1000 data
docker compose up -d --build
for i in $(seq 1 20); do
  curl -fs "http://127.0.0.1:$PORT/api/admin/me" >/dev/null && break
  sleep 1
done
curl -fs "http://127.0.0.1:$PORT/api/admin/me" >/dev/null || { echo "الحاوية لا تستجيب:"; docker compose logs --tail 50; exit 1; }
echo "الحاوية تعمل على 127.0.0.1:$PORT"

# ── 3) النفق ──
if grep -q "hostname: $HOST\$" "$CFG"; then
  echo "$HOST موجود مسبقاً في النفق — لا تغيير."
else
  cp "$CFG" "$CFG.bak.contacts.$(date +%Y%m%d-%H%M%S)"
  python3 - "$CFG" "$HOST" "$PORT" <<'PY'
import sys
p, host, port = sys.argv[1:]
s = open(p).read()
marker = '  - service: http_status:404'
assert marker in s, 'catch-all rule not found'
block = f'  - hostname: {host}\n    service: http://127.0.0.1:{port}\n'
open(p, 'w').write(s.replace(marker, block + marker, 1))
PY
  echo "أُضيف $HOST إلى النفق."
fi
cloudflared tunnel --config "$CFG" ingress validate
cloudflared tunnel --config "$CFG" ingress rule "https://$HOST/"
systemctl restart cloudflared
sleep 4; systemctl is-active cloudflared

# ── 4) DNS ──
TUNNEL=$(grep -E '^tunnel:' "$CFG" | awk '{print $2}')
if cloudflared tunnel route dns "$TUNNEL" "$HOST" 2>/dev/null; then
  echo "أُضيف سجل DNS لـ $HOST."
else
  echo "لم أستطع إضافة DNS تلقائياً. أضفه يدوياً في لوحة Cloudflare → masaros.net → DNS:"
  echo "  النوع CNAME   الاسم ${HOST%%.masaros.net}   الهدف $TUNNEL.cfargotunnel.com   Proxied (برتقالي)"
fi
echo "تمّ: https://$HOST   والأدمن: https://$HOST/admin"
