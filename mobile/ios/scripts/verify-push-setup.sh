#!/bin/bash
# ══════════════════════════════════════════════════════
# 🔔 تحقّقٌ من جاهزيّة الإشعارات على iOS — الملفّ 99
# ══════════════════════════════════════════════════════
# يُشغَّل بعد شراء حساب أبل المدفوع ووضع ملفّات Firebase.
# لا يعدّل شيئاً — يفحص ويقول ما ينقص بالضبط.
#
# 🔴 الإشعارات محجوبةٌ بحاجزين لا واحد، وهذا السكربت يفحصهما معاً:
#    ① ملفّ GoogleService-Info.plist لكلّ نكهة.
#    ② قدرة Push في التوقيع — وهي **مستحيلة** على الحساب المجّانيّ.
#
# الاستعمال:  bash ios/scripts/verify-push-setup.sh

set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1     # ← mobile/

OK=0; FAIL=0
ok()   { echo "  ✅ $1"; OK=$((OK+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠️  $1"; }

echo "═══════════════════════════════════════════"
echo " فحص جاهزيّة الإشعارات على iOS"
echo "═══════════════════════════════════════════"

# ── ① ملفّات Firebase ──
echo
echo "① ملفّات Firebase"
for f in dev prod; do
  P="ios/config/$f/GoogleService-Info.plist"
  if [ -f "$P" ]; then
    BID=$(/usr/libexec/PlistBuddy -c 'Print :BUNDLE_ID' "$P" 2>/dev/null || echo '؟')
    ok "$f — موجود (BUNDLE_ID: $BID)"
    # 🔴 معرّف الحزمة في الملفّ يجب أن يطابق نكهته، وإلّا سجّل التطبيق
    #    نفسه في مشروع Firebase خاطئ ولم يصل إشعارٌ قطّ بلا رسالة خطأ.
    EXPECT="sbs.grade.mafiaclub"
    [ "$f" = "dev" ] && EXPECT="sbs.grade.mafiaclub.dev"
    if [ "$BID" != "$EXPECT" ]; then
      bad "   معرّف الحزمة لا يطابق النكهة (المتوقَّع $EXPECT)"
    fi
  else
    bad "$f — مفقود: $P"
  fi
done

# ── ② التخويل ──
echo
echo "② قدرة Push في ملفّات التخويل"
for e in Runner RunnerDev; do
  E="ios/Runner/$e.entitlements"
  if grep -q 'aps-environment' "$E" 2>/dev/null; then
    ok "$e.entitlements — يعلن aps-environment"
  else
    bad "$e.entitlements — بلا aps-environment"
  fi
done

# ── ③ التوقيع المحلّيّ ──
echo
echo "③ التوقيع المحلّيّ"
LS="ios/Flutter/local-signing.xcconfig"
if [ -f "$LS" ]; then
  ENT=$(grep -E '^\s*CODE_SIGN_ENTITLEMENTS' "$LS" | sed 's/.*=\s*//' | tr -d ' \r')
  if [[ "$ENT" == *"FreeTeam"* ]]; then
    bad "يستعمل RunnerFreeTeam.entitlements — وهو **فارغٌ عمداً**"
    echo "     الحساب المجّانيّ لا يملك قدرة Push. بعد الاشتراك المدفوع:"
    echo "     غيّر السطر إلى:  CODE_SIGN_ENTITLEMENTS = Runner/RunnerDev.entitlements"
  elif [ -n "$ENT" ]; then
    ok "التخويل: $ENT"
  else
    warn "لا CODE_SIGN_ENTITLEMENTS في الملفّ — تُقرأ من إعدادات المشروع"
  fi
  BID=$(grep -E '^\s*PRODUCT_BUNDLE_IDENTIFIER' "$LS" | sed 's/.*=\s*//' | tr -d ' \r')
  if [[ "$BID" == *".local" ]]; then
    warn "معرّف الحزمة $BID ينتهي بـ.local — لاحقةٌ للحساب المجّانيّ."
    echo "     بعد الاشتراك استعمل sbs.grade.mafiaclub.dev كي يطابق ملفّ Firebase."
  fi
else
  warn "لا local-signing.xcconfig — التوقيع من إعدادات المشروع مباشرةً"
fi

# ── ④ الشهادة والبروفايل ──
echo
echo "④ الشهادة وبروفايل التخصيص"
if security find-identity -v -p codesigning 2>/dev/null | grep -qi 'apple development'; then
  ok "شهادة Apple Development موجودة"
else
  bad "لا شهادة تطوير في سلسلة المفاتيح"
fi

PDIR="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
N=$(ls -1 "$PDIR" 2>/dev/null | wc -l | tr -d ' ')
if [ "${N:-0}" -gt 0 ]; then
  ok "$N بروفايل على القرص"
  FOUND=0
  for p in "$PDIR"/*.mobileprovision; do
    [ -e "$p" ] || continue
    if security cms -D -i "$p" 2>/dev/null | grep -q 'aps-environment'; then FOUND=1; fi
  done
  if [ "$FOUND" = "1" ]; then
    ok "أحد البروفايلات يحمل قدرة Push"
  else
    bad "لا بروفايل يحمل aps-environment — التوقيع سيسقطها بصمت"
  fi
else
  bad "لا بروفايلات — افتح Xcode ودع التوقيع التلقائيّ يولّدها"
fi

# ── ⑤ الروابط العميقة ──
echo
echo "⑤ الروابط العميقة (Associated Domains)"
if grep -q 'associated-domains' ios/Runner/RunnerDev.entitlements 2>/dev/null; then
  ok "RunnerDev يعلن associated-domains"
  warn "تحتاج أيضاً متغيّرَي IOS_TEAM_ID وIOS_BUNDLE_ID على الخادم كي يولّد AASA"
else
  bad "RunnerDev بلا associated-domains"
fi

echo
echo "═══════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo " ✅ جاهز — $OK فحصاً ناجحاً"
  echo " التالي: flutter build ios --release --flavor dev -t lib/main_dev.dart"
else
  echo " ❌ $FAIL عائقاً · $OK ناجحاً"
  echo " عالج ما فوق ثمّ أعد التشغيل."
fi
echo "═══════════════════════════════════════════"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
