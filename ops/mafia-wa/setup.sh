#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# تهيئة بوّابة واتساب المافيا (مرّة واحدة، وآمنة للتكرار) — ~/mafia-wa/setup.sh
#   1) أسرار البوّابة في ~/mafia-wa/.env (تُولَّد إن غابت، ولا تُطبع)
#   2) تشغيل db + redis + gateway وانتظار جاهزيّتها
#   3) جلسة «mafia» + مفتاح operator محصور بها (allowedSessions) + فحص العزل
#   4) نقل القيم الأربع إلى ~/mafia-prod/.env (بنسخة احتياطيّة) — يقرؤها الخادم عند إقلاعه التالي
# تسجيل الويبهوك يفعله خادم المافيا بنفسه عند الإقلاع (ensureWebhook) — لا هنا.
# الربط بالهاتف لاحقاً: من «مركز واتساب ← الصحّة ← ربط الجلسة» أو ./setup.sh pair 9627XXXXXXXX
# ════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"
touch .env; chmod 600 .env
getv() { grep -E "^$1=" "${2:-.env}" 2>/dev/null | tail -1 | cut -d= -f2- || true; }
setv() { local f="${3:-.env}"; grep -vE "^$1=" "$f" > "$f.tmp" || true; printf '%s=%s\n' "$1" "$2" >> "$f.tmp"; mv "$f.tmp" "$f"; chmod 600 "$f"; }
rnd() { openssl rand -base64 64 | tr -dc A-Za-z0-9 | head -c "$1"; }
pyget() { python3 -c "import sys,json; d=json.load(sys.stdin); d=d.get('data',d) if isinstance(d,dict) else d; print(d.get('$1') or '')"; }

GWX() { docker exec -i mafia-wa-gateway curl -sS -H "X-API-Key: $1" -H 'Content-Type: application/json' "${@:2}"; }

if [ "${1:-}" = "pair" ]; then
  # رمز اقتران بديل عن QR: يُكتب في الهاتف ← الأجهزة المرتبطة ← ربط بالرقم
  PHONE="${2:?اكتب رقم الأعمال بصيغة 9627XXXXXXXX}"
  set -a; . ./.env; set +a
  SID="$(getv OPENWA_SESSION_ID)"
  GWX "$GW_MASTER_KEY" -X POST "http://localhost:2785/api/sessions/$SID/start" >/dev/null 2>&1 || true
  sleep 5
  GWX "$GW_MASTER_KEY" -X POST "http://localhost:2785/api/sessions/$SID/pairing-code" -d "{\"phoneNumber\":\"$PHONE\"}"
  echo; exit 0
fi

# 1) الأسرار
for k in GW_MASTER_KEY:48 GW_KEY_PEPPER:48 GW_DB_PASSWORD:32 OPENWA_WEBHOOK_SECRET:48; do
  n=${k%%:*}; l=${k##*:}; [ -n "$(getv "$n")" ] || setv "$n" "$(rnd "$l")"
done
echo "  ✔ الأسرار في .env (600)"

# 2) التشغيل
set -a; . ./.env; set +a
docker image inspect "wbagent-openwa:${OPENWA_VERSION:-0.24.0}" >/dev/null 2>&1 \
  || { echo "✗ صورة wbagent-openwa:${OPENWA_VERSION:-0.24.0} غير موجودة — شغّل ~/wbagent/deploy.sh أوّلاً"; exit 1; }
docker compose up -d 2>&1 | tail -3
ok=0
for i in $(seq 1 60); do docker exec mafia-wa-gateway curl -fsS http://localhost:2785/api/health/ready >/dev/null 2>&1 && ok=1 && break; sleep 3; done
[ "$ok" = 1 ] || { echo "✗ البوّابة لم تجهز"; docker logs --tail 40 mafia-wa-gateway; exit 1; }
echo "  ✔ البوّابة تعمل (mafia-wa-gateway)"

# 3) الجلسة + المفتاح المحصور
SID="$(getv OPENWA_SESSION_ID)"
if [ -z "$SID" ]; then
  SID="$(GWX "$GW_MASTER_KEY" -X POST http://localhost:2785/api/sessions -d '{"name":"mafia","config":{"autoRejectCalls":false}}' | pyget id)"
  [ -n "$SID" ] || { echo "✗ تعذّر إنشاء الجلسة"; exit 1; }
  setv OPENWA_SESSION_ID "$SID"
fi
if [ -z "$(getv OPENWA_API_KEY)" ]; then
  KEY="$(GWX "$GW_MASTER_KEY" -X POST http://localhost:2785/api/auth/api-keys -d "{\"name\":\"mafia-backend\",\"role\":\"operator\",\"allowedSessions\":[\"$SID\"]}" | pyget apiKey)"
  [ -n "$KEY" ] || { echo "✗ تعذّر إنشاء المفتاح"; exit 1; }
  setv OPENWA_API_KEY "$KEY"; unset KEY
fi
K="$(getv OPENWA_API_KEY)"
own=$(docker exec mafia-wa-gateway curl -s -o /dev/null -w '%{http_code}' "http://localhost:2785/api/sessions/$SID" -H "X-API-Key: $K")
keys=$(docker exec mafia-wa-gateway curl -s -o /dev/null -w '%{http_code}' http://localhost:2785/api/auth/api-keys -H "X-API-Key: $K")
echo "  جلسة mafia بمفتاح الخادم: $own (المتوقّع 200) · إدارة المفاتيح به: $keys (المتوقّع 403)"
[ "$own" = 200 ] && [ "$keys" = 403 ] || { echo "✗ فحص عزل المفتاح فشل"; exit 1; }
echo "  ✔ جلسة mafia ($SID) ومفتاح محصور بها"

# 4) قيم خادم المافيا
PROD="$HOME/mafia-prod/.env"
if [ -f "$PROD" ]; then
  cp "$PROD" "$PROD.bak-openwa-$(date +%Y%m%d-%H%M%S)"
  setv OPENWA_URL "http://mafia-wa-gateway:2785" "$PROD"
  setv OPENWA_SESSION_ID "$SID" "$PROD"
  setv OPENWA_API_KEY "$K" "$PROD"
  setv OPENWA_WEBHOOK_SECRET "$(getv OPENWA_WEBHOOK_SECRET)" "$PROD"
  echo "  ✔ ~/mafia-prod/.env: OPENWA_URL/SESSION_ID/API_KEY/WEBHOOK_SECRET (نسخة احتياطيّة بجانبه)"
fi
unset K
echo "✔ تمّت التهيئة. الخطوة التالية: الربط بهاتف رقم الأعمال."
