#!/bin/bash
# ينشر التطبيق على Cloudflare Workers من الصفر أو يحدّثه. آمن لإعادة التشغيل.
#   bash scripts/deploy-cloudflare.sh                 (بعد npx wrangler login)
#   CLOUDFLARE_API_TOKEN=... bash scripts/deploy-cloudflare.sh   (أو بتوكن)
#   ADMIN_PASSWORD=... لتحديد كلمة مرور الأدمن بدل توليدها
# يحتاج توكن بصلاحيات: Workers Scripts:Edit، D1:Edit، Workers KV Storage:Edit (للحساب)،
# وWorkers Routes:Edit وDNS:Edit لنطاق masaros.net.
set -euo pipefail
cd "$(dirname "$0")/.."
export WRANGLER_SEND_METRICS=false
W="npx --no-install wrangler"

[ -x node_modules/.bin/wrangler ] || npm ci

echo "── الحساب"
$W whoami | grep -q "associated with the email\|You are logged in" || { echo "سجّل الدخول أولاً: npx wrangler login (أو مرّر CLOUDFLARE_API_TOKEN)"; exit 1; }

echo "── قاعدة D1"
DB_ID=$($W d1 list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s).find(d=>d.name==="contacts-app");console.log(x?x.uuid:"")})')
if [ -z "$DB_ID" ]; then
  $W d1 create contacts-app >/dev/null
  DB_ID=$($W d1 list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).find(d=>d.name==="contacts-app").uuid)})')
fi
echo "D1: $DB_ID"

echo "── مخزن KV"
KV_ID=$($W kv namespace list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s).find(n=>n.title==="contacts-app-files"||n.title.endsWith("-contacts-app-files"));console.log(x?x.id:"")})')
if [ -z "$KV_ID" ]; then
  $W kv namespace create contacts-app-files >/dev/null
  KV_ID=$($W kv namespace list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).find(n=>n.title==="contacts-app-files"||n.title.endsWith("-contacts-app-files")).id)})')
fi
echo "KV: $KV_ID"

sed -i -E "s/^database_id = \".*\"/database_id = \"$DB_ID\"/; /^\[\[kv_namespaces\]\]/,/^id =/ s/^id = \".*\"/id = \"$KV_ID\"/" wrangler.toml

echo "── جداول القاعدة"
$W d1 migrations apply contacts-app --remote

echo "── الأسرار"
SECRETS=$(mktemp); trap 'rm -f "$SECRETS"' EXIT
EXISTING=$($W secret list --format json 2>/dev/null || echo '[]')
has() { echo "$EXISTING" | grep -q "\"$1\""; }
{
  has SESSION_SECRET || echo "SESSION_SECRET=$(openssl rand -hex 32)"
  if [ -n "${ADMIN_PASSWORD:-}" ]; then
    echo "ADMIN_PASSWORD=$ADMIN_PASSWORD"
  elif ! has ADMIN_PASSWORD; then
    GEN=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)
    echo "$GEN" > .admin-password && chmod 600 .admin-password
    echo "ADMIN_PASSWORD=$GEN"
    echo "كلمة مرور الأدمن المولّدة محفوظة في contacts-app/.admin-password" >&2
  fi
} > "$SECRETS"

echo "── النشر"
if [ -s "$SECRETS" ]; then $W deploy --secrets-file "$SECRETS"; else $W deploy; fi

echo "── فحص"
HOST=$(grep -oE 'pattern = "[^"]+"' wrangler.toml | head -1 | cut -d'"' -f2)
for i in $(seq 1 30); do
  curl -fsS "https://$HOST/api/admin/me" 2>/dev/null && { echo; echo "تمّ: https://$HOST   والأدمن: https://$HOST/admin"; exit 0; }
  sleep 5
done
echo "النشر تم، لكن https://$HOST لم يستجب بعد (شهادة SSL للدومين الجديد قد تأخذ دقائق)."
