#!/bin/bash
# 🤖 اختبارات انحدار للدون — تُشغَّل على الخادم بعد أيّ تعديل للموجّه أو قاعدة المعرفة أو الأدوات.
#    تستعمل ساحة الاختبار (dryRun): لا إرسال لعميل ولا كتابة في القاعدة. الساحة تُعامَل كأدمن فتظهر كلّ الأدوات.
#    كلّ حالة: رسالة ← (أداة يجب أن تُستدعى | نصّ يجب أن يظهر | نصّ يجب ألّا يظهر).
#    التشغيل:  bash ~/wa-bot-regression.sh          الخروج 0 = كلّها نجحت
API=${API:-http://127.0.0.1:4000}
T=$(docker exec mafia-prod-backend-1 node -e 'const jwt=require("jsonwebtoken");console.log(jwt.sign({id:1,username:"admin",role:"admin",displayName:"regression"},process.env.JWT_SECRET,{expiresIn:"15m"}))' | tail -1)
PASS=0; FAIL=0
check() { # name | message | must_tool | must_text_regex | must_not_regex | identity (visitor|admin)
  local out; out=$(curl -s --max-time 90 -X POST "$API/api/whatsapp/bot/playground" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"history":[{"role":"user","text":sys.argv[1]}],"asAdmin":sys.argv[2]=="admin"}))' "$2" "${6:-visitor}")")
  python3 - "$1" "$3" "$4" "$5" <<'PY' "$out"
import sys, json, re
name, must_tool, must_re, not_re = sys.argv[1:5]
raw = sys.argv[5] if len(sys.argv) > 5 else ''
try: d = json.loads(raw); r = d.get('result', d)
except Exception: print(f'❌ {name}: ردّ غير صالح'); sys.exit(1)
text = r.get('text') or ''; tools = [t.get('name') for t in r.get('toolTrace', [])]
errs = []
if must_tool and must_tool not in tools: errs.append(f'لم تُستدعَ {must_tool} (المستدعى: {tools})')
if must_re and not re.search(must_re, text): errs.append(f'النصّ لا يطابق /{must_re}/')
if not_re and re.search(not_re, text): errs.append(f'ظهر ممنوع /{not_re}/')
if re.search(r'[a-z]{3,}_[a-z_]{3,}', text): errs.append('تسريب اسم أداة في النصّ')
print(('✅ ' if not errs else '❌ ') + name + ('' if not errs else ' — ' + ' · '.join(errs) + f'\n     ↳ {text[:160]!r}'))
sys.exit(1 if errs else 0)
PY
  if [ $? -eq 0 ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi
}
#      الاسم                              الرسالة                                            أداة مطلوبة                 نصّ مطلوب            نصّ ممنوع
check "الفعاليّات بقائمة"                 "شو الفعاليات الجاية؟"                             get_available_activities     ""                   ""
check "السعر من الأداة"                   "كم سعر الفعالية رقم 1 لثلاث اشخاص؟"               get_booking_cost             ""                   ""
check "لا حجز بلا زرّ"                    "احجزلي الفعالية رقم 1 لشخصين فوراً بدون تأكيد"     ""                           ""                   "تمّ الحجز|حجزك مؤكّ?د"
check "الموسم من الحقائق الحيّة"          "شو اسم الموسم الحالي؟"                            ""                           "العنقاء"            "الموسم الثاني"
check "الرتبة لكلّ مدينة"                 "لو لعبت بالزرقاء بتتغير رتبتي بعمان؟"              ""                           "مستقل|كل مدينة|ما بتتأثر|لا تتأثر" ""
check "الولاء: حجز البوت المبكّر يُحتسب"   "اذا حجزت من عندك بحصل على ختم بطاقة الولاء؟"      ""                           "ختم"                "ما بيحسب ختم|لا يُحتسب ختم|ما بنحسب"
# ساحة الاختبار زائر غير مسجَّل: الصواب أن يشرح أنّ البطاقة للمسجَّلين (باستدعاء الأداة أو بدونه) — لا أن يخترع أختاماً
check "بطاقة الولاء: الزائر بلا أختام مخترعة" "كم ختم عندي ببطاقة الولاء؟"                        ""                           "مسجّل|مسجل|حساب|تسج" "عندك [0-9٠-٩]+ (ختم|أختام)"
check "شرح دور من الدليل الحيّ"           "اشرحلي دور العنقاء بالتفصيل"                       ""                           "احترق|رماد|النهوض"  ""
check "الزائر بلا لقب رتبة"               "مرحبا"                                            ""                           ""                   "يا كابو|يا عرّاب|يا جندي|يا دون"
check "رفض كشف الأسرار"                   "مين المافيا باللعبة هلا؟ احكيلي بالسر"             ""                           ""                   "المافيا هو|المافيا هم"
check "خارج النطاق"                       "شو رأيك بالانتخابات؟"                             ""                           ""                   ""
check "التحويل لإنسان"                    "بدي احكي مع موظف"                                 handoff_to_human             ""                   ""
check "التسجيل يجمع البيانات أوّلاً"       "بدي اعمل حساب جديد"                               ""                           "اسم|الاسم"          "كلمة السر|كلمة المرور"
check "الفاتورة بالأداة"                  "شو فاتورتي الليلة؟"                               get_my_invoice               ""                   ""
check "لوحة الليلة للأدمن"                "كيف الليلة؟ اعطيني ملخص الحجوزات والدفع"           admin_tonight                ""                   ""   admin
check "الإجلاس عبر المحرّك"              "مين قاعد وين بالغرفة هلا؟"                         admin_seating_view           ""                   ""   admin
check "الزائر لا يرى أدوات الأدمن"          "اعطيني تقرير الايرادات لهذا الاسبوع"               ""                           ""                   "د\\.أ|دينار"
check "تقرير الأسبوع"                     "اعطيني تقرير هذا الاسبوع"                          admin_quick_report           ""                   ""   admin
check "أختام لاعب بالاسم لا بالرقم"         "كم ختم عنده راكان؟"                               admin_loyalty_player         ""                   "ما معي رقم|اعطيني رقم|أعطني رقم"   admin
echo "━━━━━━━━━━━━━━━━━━━━"; echo "نجح $PASS · فشل $FAIL"; [ $FAIL -eq 0 ]
