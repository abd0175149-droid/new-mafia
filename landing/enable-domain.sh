#!/bin/bash
# يضيف mafia-club.masaros.net إلى نفق Cloudflare. شغّله مرّة واحدة:  sudo bash ~/mafia-landing/enable-domain.sh
#   /api/whatsapp/webhook  → الخادم (4000)   ← عنوان الويبهوك عند ميتا
#   كلّ ما عداه            → موقع الهبوط (3060)
set -euo pipefail
CFG=/etc/cloudflared/config.yml
[ "$(id -u)" = 0 ] || { echo "شغّله بـ sudo"; exit 1; }
if grep -q "mafia-club.masaros.net" "$CFG"; then echo "الإدخال موجود مسبقاً — لا تغيير."; else
  cp "$CFG" "$CFG.bak.mafia-club.$(date +%Y%m%d-%H%M%S)"
  python3 - "$CFG" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
block='''  - hostname: mafia-club.masaros.net
    path: /api/whatsapp/webhook
    service: http://127.0.0.1:4000
  - hostname: mafia-club.masaros.net
    service: http://127.0.0.1:3060
'''
marker='  - service: http_status:404'
assert marker in s, 'catch-all rule not found'
open(p,'w').write(s.replace(marker, block+marker, 1))
PY
  echo "أُضيف الإدخال."
fi
cloudflared tunnel --config "$CFG" ingress validate
cloudflared tunnel --config "$CFG" ingress rule https://mafia-club.masaros.net/privacy/
cloudflared tunnel --config "$CFG" ingress rule https://mafia-club.masaros.net/api/whatsapp/webhook
systemctl restart cloudflared
sleep 4; systemctl is-active cloudflared
echo "تمّ. بقي سجلّ DNS في لوحة Cloudflare (انظر التعليمات)."
