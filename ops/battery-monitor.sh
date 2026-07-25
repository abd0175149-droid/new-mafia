#!/usr/bin/env bash
# ══════════════════════════════════════════════════════
# 🔋 مراقب بطارية السيرفر-اللابتوب (Mafia prod)
# يرسل Push لمجموعة حسابات عند:
#   • توصيل/فصل الشاحن
#   • نزول البطارية (تفريغ) عبر العتبات: 80 60 40 20 10 5
# الإرسال يعيد استخدام نظام الـ push في الباكند عبر:
#   docker exec mafia-prod-backend-1 npx tsx src/scripts/battery-alert.ts
# ══════════════════════════════════════════════════════
set -u

# ── إعدادات ──
POLL_INTERVAL="${POLL_INTERVAL:-15}"                       # ثواني بين كل فحص
BAT_DIR="${BAT_DIR:-/sys/class/power_supply/BAT0}"
AC_FILE="${AC_FILE:-/sys/class/power_supply/AC/online}"    # 1=موصول بالشاحن، 0=على البطارية
THRESHOLDS=(80 60 40 20 10 5)                              # عتبات التفريغ (تنازلياً)
BACKEND_CONTAINER="${BACKEND_CONTAINER:-mafia-prod-backend-1}"
ALERT_SCRIPT_HOST="${ALERT_SCRIPT_HOST:-$HOME/mafia-prod/backend/src/scripts/battery-alert.ts}"
ALERT_SCRIPT_REL="src/scripts/battery-alert.ts"

STATE_DIR="${STATE_DIR:-$HOME/battery-monitor}"
STATE_FILE="$STATE_DIR/state"
LOG_FILE="$STATE_DIR/monitor.log"
mkdir -p "$STATE_DIR"

log() { echo "$(date '+%F %T')  $*" >> "$LOG_FILE"; }

read_int() {
  local v
  v=$(cat "$1" 2>/dev/null)
  if [[ "$v" =~ ^[0-9]+$ ]]; then echo "$v"; else echo ""; fi
}

# send_alert <title> <body>
send_alert() {
  local title="$1" body="$2"
  log "ALERT → $title | $body"
  # نضمن وجود سكربت الإرسال داخل الكونتينر (قد يكون أُعيد إنشاؤه) — نسخ idempotent
  docker cp "$ALERT_SCRIPT_HOST" "${BACKEND_CONTAINER}:/app/${ALERT_SCRIPT_REL}" >/dev/null 2>&1
  if docker exec "$BACKEND_CONTAINER" npx tsx "$ALERT_SCRIPT_REL" "$title" "$body" >> "$LOG_FILE" 2>&1; then
    log "   ✓ delivered"
  else
    log "   ✗ delivery failed (سيُكمل المراقبة)"
  fi
}

# ── تحميل الحالة ──
# ALERTED: مجموعة العتبات التي نُبّه عنها في دورة التفريغ الحالية، بصيغة :80:60:
PREV_AC=""
ALERTED=":"
if [[ -f "$STATE_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"
fi

save_state() {
  { echo "PREV_AC=$PREV_AC"; echo "ALERTED=$ALERTED"; } > "$STATE_FILE"
}

# يضبط ALERTED بحيث تُعتبر كل عتبة ≥ السعة الحالية "تم تجاوزها" (حتى لا ننبّه عليها لاحقاً)
arm_for_discharge() {
  local cap="$1" t
  ALERTED=":"
  for t in "${THRESHOLDS[@]}"; do
    if [[ "$cap" -le "$t" ]]; then ALERTED="${ALERTED}${t}:"; fi
  done
}

log "battery-monitor بدأ (interval=${POLL_INTERVAL}s, container=${BACKEND_CONTAINER})"

while true; do
  CAP=$(read_int "$BAT_DIR/capacity")
  ACV=$(read_int "$AC_FILE")

  if [[ -z "$CAP" || -z "$ACV" ]]; then
    log "⚠️ تعذّر قراءة البطارية/الشاحن (CAP='$CAP' AC='$ACV')"
    sleep "$POLL_INTERVAL"; continue
  fi

  # ── أول تشغيل: تسجيل الأساس بدون أي تنبيه ──
  if [[ -z "$PREV_AC" ]]; then
    PREV_AC="$ACV"
    if [[ "$ACV" -eq 0 ]]; then arm_for_discharge "$CAP"; else ALERTED=":"; fi
    save_state
    log "baseline: AC=$ACV CAP=${CAP}% passed='${ALERTED}'"
    sleep "$POLL_INTERVAL"; continue
  fi

  # ── تغيّر حالة الشاحن (مع تأكيد لمنع الارتداد) ──
  if [[ "$ACV" != "$PREV_AC" ]]; then
    sleep 2
    ACV2=$(read_int "$AC_FILE")
    if [[ "$ACV2" != "$ACV" ]]; then
      log "ارتداد في حالة الشاحن، تجاهل (AC=$ACV ثم $ACV2)"
      sleep "$POLL_INTERVAL"; continue
    fi
    CAP=$(read_int "$BAT_DIR/capacity")

    if [[ "$ACV" -eq 1 ]]; then
      send_alert "✅ تم توصيل الشاحن" "اللابتوب-السيرفر اتوصل بالشاحن ✅ — البطارية الآن ${CAP}%."
      ALERTED=":"                       # عند التوصيل: تُصفّر عتبات التفريغ لتُسلَّح من جديد عند الفصل
    else
      send_alert "⚠️ انفصل الشاحن عن السيرفر!" "انتبه: اللابتوب صار يشتغل على البطارية (${CAP}%). وصّله بالشاحن لتفادي إطفائه."
      arm_for_discharge "$CAP"          # عند الفصل: نعتبر العتبات الأدنى من السعة الحالية متجاوَزة
    fi
    PREV_AC="$ACV"
    save_state
  fi

  # ── عتبات التفريغ (فقط أثناء العمل على البطارية) ──
  if [[ "$ACV" -eq 0 ]]; then
    for t in "${THRESHOLDS[@]}"; do
      if [[ "$CAP" -le "$t" ]] && [[ "$ALERTED" != *":${t}:"* ]]; then
        if [[ "$t" -le 10 ]]; then
          title="🪫 بطارية السيرفر ${t}% — حرجة!"
          body="البطارية وصلت ${t}%. وصّل الشاحن فوراً قبل ما يطفي اللابتوب!"
        elif [[ "$t" -le 20 ]]; then
          title="🔋 بطارية السيرفر ${t}%"
          body="البطارية نزلت لـ ${t}% وهو شغّال على البطارية. يُفضّل توصيل الشاحن."
        else
          title="🔋 بطارية السيرفر ${t}%"
          body="البطارية وصلت ${t}% (على البطارية، بدون شاحن)."
        fi
        send_alert "$title" "$body"
        ALERTED="${ALERTED}${t}:"
        save_state
      fi
    done
  fi

  sleep "$POLL_INTERVAL"
done
