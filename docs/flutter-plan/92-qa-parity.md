# خطة الاختبار والتكافؤ مع الـ PWA
> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

---

## 1. الهدف والنطاق

هذا الملف هو **بوابة الجودة النهائية (M6)** لتطبيق اللاعب. لا يصف شاشة جديدة؛ بل يصف **كيف نُثبت أن تطبيق Flutter مكافئ للـ PWA** ويعمل بالتوازي معها على نفس السيرفر دون كسر أي عميل. هو المرجع العملي لفريق الاختبار وقائمة الإقفال قبل كل رفع للمتاجر.

### 1.1 تعريف «التكافؤ» (Parity) — المعيار الحاكم

التطبيق يُعدّ مكافئاً للـ PWA حين يحقق، لكل شاشة وتدفّق، الأبعاد الأربعة التالية **مجتمعة**:

1. **تكافؤ نصّي:** كل نص واجهة عربي يظهر **حرفياً** كما في الـ PWA (رسائل، أزرار، عناوين، أخطاء الخادم، الوقت النسبي). أي حرف مختلف = عيب.
2. **تكافؤ الحالات:** نفس آلة الحالات، نفس الحالات الفرعية (فارغ/تحميل/خطأ)، نفس ترتيب المراحل، نفس منطق إعادة الاتصال والاستعادة.
3. **تكافؤ العقود:** نفس نداءات REST ونفس أحداث Socket بنفس الحمولات وبنفس التوقيت — يُتحقَّق منه بالتقاط شبكة متوازٍ (§7).
4. **تكافؤ سلوكي محسوس:** نفس الأنيميشن (نوعاً ومدةً)، نفس الاهتزازات، نفس الألوان hex والأبعاد، نفس الأمان (عدم تسريب أدوار الآخرين، تنبيه معرض المافيا).

**قاعدة الاختبار الذهبية:** لا نقارن التطبيق بمواصفة مكتوبة فقط — نُشغّل **الجهازين جنباً إلى جنب على نفس الغرفة على staging** (App + PWA) ونطابق كل خطوة. المواصفة تحدّد ما نتوقّعه، والـ PWA الحيّة هي الحكَم عند أي غموض.

### 1.2 داخل النطاق

- كل شاشات اللاعب المغطاة في الملفات 10→27 و30→31 (قاعة + عن بُعد + الصوت المباشر).
- كل البنية التحتية 01→08 (جلسة، socket، push، deep links، صوت، ثيم، تكيّف الشاشات).
- **مصفوفة الاختبار:** كل شاشة × ثلاث فئات حجم (compact / medium / expanded) × منصّتين (Android / iOS).
- **سيناريوهات لعب كاملة:** قاعة فيزيائية + غرفة عن بُعد بالصوت.
- **اختبارات الصمود:** reconnect، الخلفية/العودة للمقدمة، قفل الشاشة، انقطاع الشبكة، تبديل التطبيقات.
- **الاختبار المتوازي مع الـ PWA** في فعالية حقيقية (بشر فعليون).
- **التعايش:** إثبات أن التطبيق لا يكسر عملاء الـ PWA على نفس السيرفر خلال فترة التعايش.
- **قائمة الإقفال قبل الإطلاق** (Pre-launch lockdown).

### 1.3 خارج النطاق

- اختبار لوحة الأدمن، واجهة الليدر المستقلة، شاشة العرض (Display)، واجهة الـ venue، صفحات الطباعة — تبقى ويب وتُختبَر ضمن مسار الـ PWA المنفصل. **استثناء:** مكوّنات الليدر الثلاثة المستوردة في كونسول المضيف عن بُعد (`LeaderDayView`، `LeaderNightView`، `LeaderRoleConfigurator`) داخل النطاق وتُختبَر ضمن 30-host-console.md.
- اختبار الـ backend كوحدة (يملك مجموعة اختباراته: `test-game.ts`/`test-twins.ts`). نحن نختبر **العميل** ومطابقته للعقد فقط.
- اختبارات الأداء العميقة للسيرفر/قاعدة البيانات.

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

**المرجع الأساسي للتكافؤ هو الـ PWA نفسها مُشغَّلة على staging.** المصادر التي تحدّد السلوك المتوقَّع (تُفتَح عند أي غموض):

- `c:/Projects/new mafia/unified-mafia/frontend/src/components/PlayerFlow.tsx` — المكوّن الأحادي (3967 سطراً) الذي يقود كل تجربة اللاعب (قاعة + عن بُعد): آلة الخطوات، منطق الصمود، wiring الـ socket، كل المعالجات.
- `c:/Projects/new mafia/unified-mafia/frontend/src/hooks/useGameState.ts` — hook حالة اللعبة المشترك (262 سطراً).
- `c:/Projects/new mafia/unified-mafia/frontend/src/hooks/useSocket.ts` — دلالات `emit`/`on` (ack بمهلة 15s).
- `c:/Projects/new mafia/unified-mafia/frontend/src/hooks/usePushNotifications.ts` — منطق تسجيل الدفع الذي نطابق مخرجاته (توكن يصل، يوجّه صحيح).
- `c:/Projects/new mafia/unified-mafia/frontend/src/context/PlayerContext.tsx` — دورة الجلسة/المصادقة ومفاتيح التخزين المتزامنة الثلاثة.
- `c:/Projects/new mafia/unified-mafia/frontend/src/lib/constants.ts` — `Phase`، `ROLE_NAMES`، `ROLE_ICONS`، `MAFIA_ROLES`، `NEUTRAL_ROLES` (مرجع الأدوار والمراحل التي تُختبَر).
- `c:/Projects/new mafia/unified-mafia/frontend/src/lib/soundManager.ts` — نموذج الصوت leader-source (نطابق: هاتف اللاعب لا يشغّل أصوات القاعة، فقط الاهتزازات + نغمة الدور).
- `c:/Projects/new mafia/unified-mafia/frontend/src/styles/globals.css` + `tailwind.config.js` — الألوان hex والأبعاد والأنيميشن التي نطابقها بصرياً.
- `c:/Projects/new mafia/unified-mafia/frontend/src/app/layout.tsx` — بوابة الإصدار `APP_VERSION='2.5.0'`، RTL، الخطوط.
- `c:/Projects/new mafia/unified-mafia/frontend/public/manifest.json` + `sw.js` + `firebase-messaging-sw.js` — سلوك الدفع والتوجيه العميق المرجعي.
- `c:/Projects/new mafia/unified-mafia/backend/src/routes/player-*.routes.ts` — عقود REST (auth، notifications، sounds).
- `c:/Projects/new mafia/unified-mafia/backend/src/sockets/*` — عقود Socket.IO (المصدر الوحيد لأسماء الأحداث وحمولاتها — ممنوع اختراع أي حدث).
- **تقارير الشرائح المرجعية** (خلاصات التحليل): `reports/playerflow-a.md`، `playerflow-b.md`، `phase-views.md`، `cards-gallery.md`، `cinematics.md`، `notepad-chat.md`، `host-remote.md`، `voice.md`، `sound.md`، `pwa-push.md`، `rank-history.md`، `profile.md`، `home.md`، `games-invites.md`، `order-feedback.md`، `shell-auth.md`، `contract.md`، `design-system.md`.

---

## 3. التبعيات على ملفات الخطة الأخرى

هذا الملف **يجمّع ويستهلك §12 (معايير القبول) من كل ملفات الخطة**. لكل شاشة، قائمة القبول الرسمية موجودة في ملفها؛ هنا نضيف طبقة التكافؤ الشاملة (مصفوفة الأجهزة، السيناريوهات، الصمود، التعايش، الإقفال).

- **01-foundation-theme.md** — §5 هو **مصدر الحقيقة** لفئات الحجم والتوكنات (compact/medium/expanded، `contentMaxWidth`، `pageMaxWidth`، `gameScale`، `dialogMaxWidth`). §5 هنا يُحيل إليه ولا يعيد تعريف الأرقام. كما نطابق كل ألوان الثيم منه.
- **02-models-data-layer.md** — النماذج التي نتحقق من صحة إزالة تسلسلها (deserialization) ضد حمولات السيرفر الحقيقية.
- **03-networking-rest.md** — جدول endpoints المرجعي لالتقاط الشبكة المتوازي (§7).
- **04-socket-layer.md** — جدول أحداث Socket المرجعي؛ المصافحة وreconnect (§6 اختبارات الصمود تعتمده).
- **05-session-auth.md** — دورة الجلسة، `/me`، حارس المسارات، auto-login الموظف — تُختبَر حالاتها الحدّية.
- **06-push-notifications.md** — كل حالات الدفع والتوجيه (§10 هنا يعتمده لاختبار المنصّتين).
- **07-sound-system.md** — الاهتزازات والنغمة على هاتف اللاعب؛ تأكيد أن التطبيق **تابع** لأصوات الليدر لا مصدر.
- **08-deeplinks-routing.md** — حالات `/join/:code` وdeep link الدعوة (§10 يعتمده).
- **10→19** — الصفحات الثابتة؛ كل واحدة لها صف في مصفوفة §4.3 وبنود في قائمة §12.
- **20-game-state-core.md** — بروتوكول rejoin وبوابة تجاوز المرحلة (phase-override) — قلب اختبارات الصمود §6.
- **21→27** — تجربة اللعب بالقاعة؛ سيناريو القاعة الكامل §4.5.1 يمرّ بها كلها.
- **30-host-console.md** + **31-voice-realtimekit.md** — تجربة عن بُعد؛ سيناريو الريموت §4.5.2.
- **90-release-android.md** + **91-release-ios.md** — خطوات المتاجر والتوقيع والقدرات؛ قائمة §12 تتقاطع معهما في بنود الإطلاق.

---

## 4. الواجهة والتجربة تفصيلياً (أدوات ووثائق الاختبار)

بما أن هذا ملف اختبار، «الواجهة والتجربة» = **أدوات ووثائق الاختبار وصياغتها الحرفية**: البيئات، مختبر الأجهزة، مصفوفة الاختبار، كتالوج النصوص المرجعية، سيناريوهات اللعب، إجراءات الصمود، بروتوكول التوازي مع الـ PWA، ونموذج بلاغ العيب.

### 4.1 بيئات الاختبار

| البيئة | flavor | baseUrl | الاستعمال |
|---|---|---|---|
| **Staging** | `dev` | `https://mafia.grade.sbs` | **كل الاختبار الوظيفي والتوازي مع الـ PWA** — لا نخاطر ببيانات حقيقية |
| **Production** | `prod` | `https://club-mafia.grade.sbs` | اختبار الدخان (smoke) بعد الرفع فقط؛ لا اختبار تدميري |

- التطبيق يستهلك نفس السيرفر الذي تستهلكه الـ PWA بالضبط — لا بروكسي Next؛ كل الروابط مطلقة من `AppConfig.baseUrl` وصور `/uploads/*` عبر `ApiClient.resolveUploads`.
- **الـ PWA المرجعية** تُفتَح على `https://mafia.grade.sbs/player` من متصفح ثانٍ (Chrome Android + Safari iOS) بنفس حساب الاختبار أو حساب مقعد مجاور.
- تطبيع الهاتف (بادئة `0` أردنية) يجب أن يطابق الـ PWA حرفياً وإلا فشل rejoin/join بالهاتف.

### 4.2 مختبر الأجهزة (Device Lab) — التغطية الدنيا

**الاتجاه portrait مقفول على كل الأجهزة** (تكافؤ manifest)؛ الفئة تُقاس بالعرض المنطقي للبورتريه.

| # | فئة الحجم | جهاز نموذجي | نظام | عرض بورتريه تقريبي |
|---|---|---|---|---|
| D1 | **compact** | هاتف Android 6.1 إنش (مثل Pixel 6a / Galaxy A) | Android 13/14 | ~360–412dp |
| D2 | **compact** | iPhone SE (شاشة صغيرة) + iPhone 14/15 | iOS 16/17 | ~375–393dp |
| D3 | **medium** | تابلت Android 8 إنش (مثل Galaxy Tab A8) | Android 13+ | ~600–720dp |
| D4 | **medium/expanded** | iPad mini (8.3 إنش) | iPadOS 16+ | ~744dp |
| D5 | **expanded** | تابلت Android 10–11 إنش (مثل Galaxy Tab S) | Android 13+ | ~800–900dp |
| D6 | **expanded** | iPad (10.9 إنش) / iPad Air | iPadOS 16+ | ~820dp |
| D7 | **compact — الحد الأدنى** | جهاز Android قديم `minSdk 23`، ذاكرة منخفضة | Android 6 | ~360dp |

- **D7 إلزامي:** أضعف جهاز مدعوم — يكشف مشاكل الأداء وZWJ emoji والاهتزاز و`BackdropFilter` المكلف.
- يُستحسن Firebase Test Lab / device farm لتوسيع التغطية بعد الاختبار اليدوي على D1–D7.

### 4.3 مصفوفة الاختبار: كل شاشة × (compact/medium/expanded) × (Android/iOS)

لكل شاشة، السلوك المتوقّع لكل فئة حجم موثّق في §5 الخاص بملفها. الجدول التالي هو **قائمة تشغيل الاختبار**: العمود «تحقّق التكيّف» يلخّص ما يتغيّر بين الفئات (يجب أن يطابق §5 لملف الشاشة)، والعمود «تحقّق منصّي» يبرز ما يُختبَر خصيصاً على كل نظام. تُنفَّذ كل خلية على جهاز واحد على الأقل من كل فئة/نظام (D1–D7).

| الملف / الشاشة | تحقّق التكيّف (compact → medium → expanded) | تحقّق منصّي (Android ‖ iOS) |
|---|---|---|
| **10** الدخول/التسجيل/تغيير كلمة المرور/المكافأة | عمود واحد → نموذج بسقف 640 متمركز → سقف 720؛ حقلا الهاتف/كلمة المرور `dir=ltr` في كل الفئات | لوحة مفاتيح رقمية للهاتف ‖ حقل كلمة المرور آمن؛ autofill iOS لا يكسر التطبيع |
| **11** الشل/BottomNav/بوابة الإشعارات/بوابة الإصدار/سحب-للتحديث | شريط سفلي ثابت؛ سقف المحتوى يتوسّع؛ لا two-pane | زر رجوع Android يغلق/يتنقل صحيحاً ‖ home indicator iOS؛ شريط الحالة شفاف فوق `#050505` |
| **12** الرئيسية (البطاقات/الأقسام/المودالات) | عمود واحد → بطاقات الحجوزات `ContentConstraint(640)` وفعاليات عمودان → شبكة 3 أعمدة داخل 960 | تحديث بالسحب ‖ سلاسة التمرير على D7 |
| **13** الملف + الأفاتار (اختيار/قص/ضغط/رفع) | نموذج بسقف عرض؛ صورة الأفاتار لا تُمطّط | `image_picker`+`image_cropper` (uCrop) ‖ (TOCropViewController) + إذن مكتبة الصور iOS |
| **14** الألعاب + الدعوات + واتساب | قائمة عمود واحد → شبكة أعمدة أعلى؛ مودال الدعوة `dialogMaxWidth` ثابت | `url_launcher` واتساب `wa.me` (خارجي) على المنصّتين |
| **15** الرتب + إطارات الرتب وتأثيراتها + المواسم | خلايا الإحصاء ترفع أعمدتها؛ إطار الرتبة يُكبَّر بـ `gameScale` لا يُمطّط | أداء أنيميشن الجسيمات (particle-orbit/shimmer) 60fps على D7 |
| **16** سجل المباريات | عمود واحد → قائمة بسقف 720 → **two-pane (قائمة + تفاصيل)** في expanded حيث ينص ملفه | تمرير طويل سلس؛ سحب-للحذف iOS/Android متكافئ إن وُجد |
| **17** طلبات المطعم (F&B) | منيو عمود واحد → شبكة أعمدة أعلى؛ الفاتورة بسقف عرض | — لا اختلاف جوهري |
| **18** التقييم/الاستبيانات | نموذج بسقف عرض متمركز | لوحة مفاتيح لا تحجب أزرار الإرسال ‖ inset iOS |
| **19** جرس الإشعارات وصندوق الوارد + المودال الغني | لوحة 340 على الهاتف → **شاشة/bottom sheet كاملة** أو لوحة متمركزة؛ badge ثابت | `BackdropFilter` blur مكلف — خفّفه على D7؛ فيديو المودال الغني `video_player`+`chewie` ‖ playsInline iOS |
| **20** قلب اللعبة (لا UI مباشر) | يُختبَر عبر كل شاشات اللعب؛ آلة المراحل واحدة | — |
| **21** الانضمام واللوبي (9 خطوات + المقاعد + الانتظار) | خطوة واحدة بسقف عرض؛ شبكة المقاعد `AdaptiveGrid` 4→6→7–8 أعمدة؛ رقم مقعدي الذهبي × `gameScale` | القياس الحيّ للمقاعد؛ portrait مقفول |
| **22** بطاقات الأدوار + الكشف + معرض المافيا + معلومات الأدوار | البطاقة (نسبة ~63:88) × `gameScale` متمركزة، **لا تُمطّط**؛ المعرض شبكة أعمدة أعلى | فتح المعرض يُطلق تنبيه الليدر على المنصّتين؛ أنيميشن قلب البطاقة 60fps على D7 |
| **23** مرحلة الليل الأوتوماتيكي | أزرار اختيار الهدف تُكبَّر لمساً (≥56) × `gameScale`؛ prompt الطُعم (decoy) مطابق بكسلياً للحقيقي | الاهتزاز `[100,50,200,50,300]` (Android أنماط) ‖ ترجمة haptic iOS؛ wakelock يمنع القفل |
| **24** الصباح والسينمائيات والمؤقت الدائري | المؤقت الدائري (أساس 200dp على الشاشة → حسب ملف الشاشة) × `gameScale`؛ نص الطور الدرامي × `gameScale` | أنيميشن CustomPainter 60fps؛ wakelock؛ lottie `.lottie` (fireworks/winner) يعمل |
| **25** النهار: نقاش/تبرير/تصويت/ديل/انسحاب/تعادل/إقصاء/عمدة/قنبلة | قائمة المرشحين عمود → عمودان داخل 720؛ أزرار التصويت min-height 56 على التابلت؛ prompt العمدة × `gameScale` | الاهتزاز عند بدء التصويت `[100,200]` ونجاحه `100`؛ auto-vote على المهلة يعمل بلا تعليق |
| **26** النوتة وشات المافيا السري | عمود واحد → **two-pane (نوتة + شات جنباً لجنب)** في expanded حيث ينص ملفه | لوحة مفاتيح لا تحجب حقل الشات ‖ inset؛ سرية الشات (لا تسريب) |
| **27** المتفرج + Game Over + سحب الهدايا | طاولة الحلقة تتوسّع؛ بطاقات الفائزين تُكبَّر؛ lottie prize-podium/winner | lottie/dotLottie يعمل على المنصّتين؛ الأداء عند كثرة اللاعبين |
| **30** كونسول المضيف عن بُعد (9 شاشات + مكوّنات الليدر الثلاثة) | عمود واحد → **two-pane (قائمة لاعبين + لوح تحكم)** في expanded | RECORD_AUDIO/mic؛ خلفية الصوت voip iOS |
| **31** الصوت المباشر RealtimeKit + الكتم + المتحدث النشط + المواجهة | عناصر الطاولة تتوسّع؛ مؤشر المتحدث النشط واضح على كل الأحجام | Background Mode `audio`+`voip` iOS؛ `BLUETOOTH_CONNECT` Android؛ قطع/استعادة WebRTC |

**قاعدة تنفيذ المصفوفة:** كل شاشة تُمرَّر مرة على الأقل في كل فئة حجم وعلى كل نظام. الشاشات الحساسة للعب (21–27، 30–31) تُختبَر ضمن **سيناريو لعب كامل** (§4.5) لا كوحدات منعزلة، لأن حالاتها متسلسلة.

### 4.4 كتالوج النصوص المرجعية (يُتحقَّق منه حرفياً — «حرف واحد مختلف = عيب»)

هذه عيّنة إلزامية من النصوص الحرفية التي يجب أن تظهر **مطابقة تماماً** للـ PWA. القائمة الكاملة لكل شاشة في §4 من ملفها؛ هذه أكثرها عرضة للانحراف أثناء النقل:

**قمع الدخول والانضمام (21):**
- خطأ إيجاد الغرفة: `لم يتم العثور على اللعبة`
- خطأ عدم تحديد الغرفة: `لم يتم تحديد الغرفة`
- تحقّق كلمة مرور التسجيل/التغيير: `كلمة المرور يجب أن تكون 4 أحرف على الأقل`
- فشل الدخول: `خطأ في تسجيل الدخول`
- عنوان مودال تأكيد الانتقال: `تأكيد الانتقال` — زراه: `إلغاء` و`موافق، انتقل`
- عنوان مودال الدعوة: `دعوة للانضمام` — غرفة ميتة: `الغرفة لم تعد متاحة`

**العقوبات والطرد (22/25):**
- عنوان مودال العقوبة: `تنبيه مخالفة القوانين!`
- عدّاد العقوبات (mono): `PENALTIES: n / m`
- زر إغلاق العقوبة: `فهمت وتعهدت بالالتزام`
- طرد من الليدر (بلا سبب): `تم إزالتك من اللعبة من قبل الليدر`
- بانر تغيير المقعد: `تم تغيير رقمك: X ← Y` (بنفس اتجاه السهم في المصدر)

**إغلاق الغرفة/الفعالية (20/27):**
- حذف الغرفة: `تم إغلاق الغرفة`
- إنهاء الفعالية (افتراضي): `تم إنهاء الفعالية وإغلاق الغرفة`

**التوستات (نوع/أيقونة) (21):** `penalty` 🔴 · `warning` ⚠️ · `success` ✅ · `info` ℹ️ — النص محاذاته `text-right` بخط Amiri عريض.

**الإشعارات (19):**
- بانر تفعيل الدفع: `🔔 تفعيل الإشعارات على هاتفك` / أثناء التفعيل: `⏳ جاري التفعيل...` / caption: `اضغط للحصول على إشعارات فورية`
- الحالة الفارغة: `لا توجد إشعارات`
- زر قراءة الكل: `قراءة الكل ✓`
- الوقت النسبي حرفياً: `الآن` / `قبل N د` / `قبل N ساعة` / `قبل N يوم`
- زر إجراء المودال الغني: `🔗 فتح الرابط` (خارجي) / `انتقال ◀` (داخلي)

**عام (11):** شاشة التحميل: `جاري التحميل...` (رمادي، spinner حدود amber-500).

**الصوت — أزرار الليدر (07، ضمن كونسول المضيف):** `كتم أصوات الليدر` / `تشغيل أصوات الليدر`.

> **إجراء التحقّق:** لقطة شاشة من التطبيق بجانب لقطة من الـ PWA لكل نص أعلاه، ومطابقة الحروف والتشكيل والإيموجي (بلا ZWJ: 🔮 لا 🧙‍♀️، 👮 لا 👮‍♀️). حقول الهاتف/كلمة المرور فقط LTR؛ كل شيء آخر RTL.

### 4.5 سيناريوهات اللعب الكاملة

تُنفَّذ **بالتوازي مع الـ PWA**: بعض اللاعبين على التطبيق وبعضهم على الـ PWA في نفس الغرفة على staging. الليدر/الشاشة على الويب (خارج النطاق) لكن ضروريان لتشغيل اللعبة.

#### 4.5.1 سيناريو القاعة الكامل (Hall) — «الرحلة الذهبية»

**الإعداد:** غرفة على staging، 10–12 مقعداً، أدوار موزّعة تغطي: GODFATHER + MAFIA_REGULAR + SILENCER + CHAMELEON + OLDER_BROTHER/YOUNGER_BROTHER (توأم) + SHERIFF + DOCTOR + NURSE + SNIPER + POLICEWOMAN + WITCH + MAYOR + CITIZEN + JESTER + ASSASSIN حسب العدد. نصف اللاعبين على التطبيق، نصف على الـ PWA.

| # | الخطوة | ما يُتحقَّق منه (تكافؤ App ↔ PWA) |
|---|---|---|
| 1 | فتح التطبيق وإدخال كود الغرفة (4 أرقام) | `room:find-by-code` يعيد نفس `roomId/gameName`؛ خطأ الغرفة نصّه حرفي |
| 2 | المصادقة (لاعب مسجّل يتخطى، جديد يسجّل) | نفس تدفّق `phone→login\|register→change_password`؛ التطبيع الأردني |
| 3 | التذكرة (إن طُلبت) | خطوة `ticket`؛ رسائل التذكرة العربية |
| 4 | الانضمام التلقائي | `room:auto-join` **بلا مقعد مفضّل**؛ نفس `assignedSeat` منطقياً؛ بانر المقعد |
| 5 | انتظار اللوبي | بطاقة الغطاء + «وجّه انتباهك للشاشة»؛ roster متزامن مع الـ PWA |
| 6 | بدء اللعبة وتوزيع الأدوار | `player:role-assigned`؛ اهتزاز `[100,50,200,50,300]`؛ البطاقة تبدأ مقلوبة ثم تُكشَف؛ mafiaTeam/sibling يُستبدلان دائماً |
| 7 | كشف الدور + معرض المافيا (لمافيوي) | فتح المعرض يُطلق `player:mafia-gallery-open` (تنبيه الليدر فوري) — **لا يُسقَط**؛ تعارف الفريق؛ التوأم أحادي الاتجاه (الأكبر يرى الأصغر، الأصغر أعمى) |
| 8 | الليل الأوتوماتيكي | `night:action-required`؛ عدّاد 1s؛ الطُعم (decoy) مطابق بكسلياً؛ عند المهلة السيرفر يختار، «submitted» بعد 2s ثم إغلاق بعد 1.5s؛ الاهتزاز؛ wakelock فعّال |
| 9 | الصباح والسينمائيات | نفس أحداث الصباح، نفس ترتيبها؛ المؤقت الدائري والعتبات اللونية؛ هاتف اللاعب **تابع** لا مصدر صوت |
| 10 | النقاش + «دوري بالكلام» | نغمة الدور (3 sine صاعدة) + اهتزاز `[200,100,200,100,300]` حين `currentSpeakerId=أنا` |
| 11 | التبرير/الانسحاب (إن وُجد) | نفس نوافذ التبرير والانسحاب |
| 12 | التصويت | `day:voting-started` اهتزاز `[100,200]`؛ عدّاد؛ تغيير الصوت مسموح؛ نجاح `100`؛ **auto-vote على المهلة** (self وإلا index 0، `autoVote:true`) — الجولة لا تتعلّق |
| 13 | قرار العمدة (إن ظهر) | `day:mayor-window` (forMayor فقط)؛ اهتزاز `[120,80,120,80,240]`؛ PASS/REVOTE/POSTPONE؛ صوت مضاعف ×2؛ بانر الكشف 8s |
| 14 | التعادل/الإقصاء | `day:elimination-pending`؛ إقصائي يقلب بطاقتي ويعطّل أفعالي؛ اهتزاز `[200,100,200]` |
| 15 | القنبلة (عند إقصاء GODFATHER) | تسلسل القنبلة كما في المصدر |
| 16 | النوتة أثناء اللعب | حفظ محلي لكل غرفة/مقعد؛ شات المافيا مشروط بـ `mafiaChatEnabled` (علم عام لا يكشف هوية) |
| 17 | عقوبة أثناء اللعب | مودال العقوبة + توست + اهتزاز `[300,100,300,100,500]` (عليّ) / `[100,100]` (على غيري) |
| 18 | Game Over | `game:over`؛ يُبقى الدور والموت، يُمسح التصويت/الفريق/النوتة؛ سحب الهدايا إن وُجد |
| 19 | جولة جديدة على نفس الغرفة | `game:started` = إعادة ضبط كاملة؛ نظافة الجولة الجديدة (مسح mafiaTeam/sibling/الدور/النوتة) |

**معيار النجاح:** كل حدث يظهر على التطبيق والـ PWA في نفس اللحظة تقريباً وبنفس النص/الاهتزاز؛ لا يرى لاعب أي معلومة ليست له؛ الطُعم لا يُميَّز عن الحقيقي.

#### 4.5.2 سيناريو الغرفة عن بُعد (Remote) — بالصوت

**الإعداد:** غرفة `isRemote` عبر كونسول المضيف (30)، صوت RealtimeKit (31)، لاعبون على التطبيق + بعضهم على الـ PWA، `allowPlayerInvites` مفعّل.

| # | الخطوة | ما يُتحقَّق منه |
|---|---|---|
| 1 | إنشاء غرفة بعيدة من كونسول المضيف | 9 شاشات الكونسول؛ مكوّنات الليدر الثلاثة (`LeaderDayView/NightView/RoleConfigurator`) |
| 2 | دعوة لاعبين (in-app + رابط) | دعوة push `?invite=1&by=` لا تنضم صامتاً — تحلّ اسم الغرفة ثم مودال تأكيد؛ رفض الدعوة يذهب `/player/home` |
| 3 | انضمام + طاولة الحلقة | تخطيط `isRemote` (خلفية `#050505` قرب-أسود، padding سفلي للتحكم)؛ شريط تقدّم المقاعد |
| 4 | تفعيل الميكروفون | إذن RECORD_AUDIO/mic؛ الصوت يعمل على المنصّتين؛ iOS `audio`+`voip` background |
| 5 | كتم لكل مرحلة | قواعد المتحدث النشط (`useActiveSpeaker`): من يُسمح له بالكلام في النقاش/التبرير/المواجهة |
| 6 | المواجهة الثنائية (confrontation) | تفعيل/إنهاء المواجهة؛ الميك يُفتَح للطرفين فقط |
| 7 | قطع الشبكة أثناء الصوت | استعادة WebRTC؛ عودة الصوت بعد reconnect |
| 8 | مرور دورة لعب كاملة عن بُعد | نفس مراحل §4.5.1 لكن على الطاولة البعيدة؛ Game Over على الطاولة |

**معيار النجاح:** الصوت لا ينقطع عند تبديل التطبيقات/قفل الشاشة على iOS (الميزة الأساسية التي يحلّها التطبيق مقابل WebRTC في متصفح iOS)؛ قواعد الكتم لكل مرحلة مطابقة للـ PWA.

### 4.6 إجراءات اختبار الصمود (reconnect / الخلفية / قفل الشاشة)

تُنفَّذ في **منتصف كل مرحلة** (لوبي، ليل، تصويت، عمدة) للتأكد من استعادة الحالة الصحيحة. المرجع الكامل في 20-game-state-core.md.

| الاختبار | الإجراء | النتيجة المتوقّعة |
|---|---|---|
| **R1 — قفل الشاشة** | داخل التصويت، اقفل الشاشة 30s ثم افتح | wakelock يمنع القفل التلقائي أثناء المرحلة النشطة؛ عند القفل اليدوي والعودة: `room:get-my-state` فوري (عبر `AppLifecycleState.resumed`) يستعيد المرحلة والعدّاد المتبقي |
| **R2 — الخلفية/تبديل التطبيق** | بدّل لتطبيق آخر 60s أثناء الليل ثم عُد | عند العودة: reconnect socket → `room:rejoin-player` → poll؛ لا فقدان للـ prompt؛ العدّاد يُحتسَب من `votingStartTime`/`durationSeconds` لا من الصفر |
| **R3 — reconnect socket** | افصل الشبكة 10s ثم أعِدها أثناء أي مرحلة | على `connect`: إعادة `room:rejoin-player` (السوكِت أخذ id جديداً وغادر الغرف)؛ إعادة قراءة التوكنات في المصافحة (مرآة `reconnectSocketAuth`)؛ لا انقطاع للبثّ |
| **R4 — إعادة تشغيل التطبيق (kill)** | أغلق التطبيق تماماً أثناء التصويت وأعِد فتحه | القراءة المتزامنة لمفاتيح `mafia_*` قبل أول إطار → يهبط اللاعب مباشرة على شاشة التصويت المستعادة (المرشحون/صوتي/العدّاد) بلا وميض |
| **R5 — بوابة تجاوز المرحلة** | افتعل انتقال مرحلة عبر socket ثم دع poll يتأخر | حدث الـ socket يفوز على poll لمدة 6s (`OVERRIDE_TTL=6000`)؛ لا ارتداد/وميض للمرحلة؛ بعدها poll يشفي الأجهزة التي فوّتت الحدث |
| **R6 — poll الـ 3 ثوانٍ** | راقب أثناء اللعب | `room:get-my-state` كل 3s (المقدمة فقط)؛ يشفي المقعد/الدور/الحياة/المرحلة/التصويت؛ يوقَف في الخلفية لتوفير البطارية |
| **R7 — تبديل الحساب على نفس الجهاز** | سجّل خروج ثم دخول بحساب آخر | الجلسة القديمة تُهمَل عند اختلاف playerId؛ الدخول يمسح جلسة اللاعب الآخر |
| **R8 — QR لغرفة مختلفة أثناء لعبة نشطة** | امسح QR لغرفة بينما أنت في غرفة أخرى | مودال تبديل الغرفة مع freeze للمقعد القديم (`room:freeze-player`) — لا انضمام صامت |
| **R9 — المقعد المحجوز (held seat)** | سجّل خروج ثم عُد خلال أقل من 10 دقائق | إعادة إيجاد تلقائية لنفس الغرفة (بعد 300ms)؛ بعد 10 دقائق المفتاح يُحذَف |
| **R10 — النقر على إشعار (cold/warm/foreground)** | أرسل إشعار دعوة والتطبيق مغلق/بالخلفية/مفتوح | `getInitialMessage` (cold) / `onMessageOpenedApp` (warm) / `onMessage` (foreground)؛ التوجيه صحيح **بعد** تحميل auth اللاعب (بوابة الانتظار) |

**ملاحظة حرجة للتطبيق:** مؤقّتات Flutter تستمر بالخلفية (بخلاف مؤقّتات الويب المخنوقة)، لكن الـ socket قد يموت — لذا الاعتماد على `AppLifecycleState.resumed` + `connectivity_plus` لإطلاق poll فوري عند العودة، وإيقاف poll الـ 3s في الخلفية.

### 4.7 بروتوكول الاختبار المتوازي مع الـ PWA في فعالية حقيقية

الاختبار الحاسم قبل الإطلاق: **فعالية مافيا حقيقية في النادي** بلاعبين فعليين، بعضهم على التطبيق وبعضهم على الـ PWA، على **production** (`club-mafia.grade.sbs`) مع مراقبة.

- **التحضير:** جهّز ≥3 أجهزة تطبيق (Android + iOS، فئات مختلفة) + ≥3 أجهزة PWA، كلها في نفس الغرفة. اربط Crashlytics. سجّل الأجهزة ومقاعدها.
- **أثناء الفعالية:** راقب أن كل حدث يصل للعميلين متزامناً؛ سجّل أي اختلاف في التوقيت/النص/السلوك فوراً في سجل الجلسة.
- **حالات حرجة تحت الرصد:** إشعارات iOS (الميزة الأساسية)، الصوت عن بُعد على iOS تحت القفل، reconnect بعد انقطاع Wi-Fi النادي، الأداء عند 12+ لاعباً.
- **نموذج سجل جلسة التوازي (Parallel-Run Session Log):**

| الحقل | مثال |
|---|---|
| `sessionId` | جلسة النادي + التاريخ |
| `roomCode` / `gameName` | — |
| `appDevices[]` | {device, os, sizeClass, seat, buildNumber} |
| `pwaDevices[]` | {browser, os, seat} |
| `phaseTimeline[]` | {phase, tServer, tAppSeen, tPwaSeen, deltaMs} |
| `divergences[]` | {phase, screen, expected(PWA), actual(App), severity} |
| `crashes[]` | من Crashlytics |
| `verdict` | pass / blocked + الأسباب |

**قاعدة الإقفال:** لا يُطلَق إصدار عام قبل **جلستَي توازي حقيقيتين متتاليتين بلا عيب P0/P1** (§4.9).

### 4.8 نموذج بلاغ العيب (Defect Report Template)

| الحقل | الوصف |
|---|---|
| `id` | معرّف تسلسلي |
| `title` | ملخّص سطر واحد |
| `severity` | P0/P1/P2/P3 (§4.9) |
| `screen` | ملف الشاشة (مثل 25-day-voting.md) |
| `sizeClass` | compact / medium / expanded |
| `platform` | Android / iOS + إصدار النظام + الجهاز |
| `buildNumber` | رقم البناء |
| `parityRef` | ما تفعله الـ PWA في نفس الموقف (لقطة/فيديو) |
| `steps` | خطوات إعادة الإنتاج |
| `expected` / `actual` | المتوقّع (سلوك الـ PWA) ‖ الفعلي |
| `evidence` | لقطات/فيديو/سجل شبكة/سجل Crashlytics |
| `suspectedCode` | الملف/الدالة المرجّحة في التطبيق |

### 4.9 تصنيف الخطورة (Severity)

- **P0 — حاصر إطلاق:** تعطّل، فقدان جلسة/مقعد، تسريب دور/معلومة لاعب آخر، فشل إشعار iOS، الطُعم يُميَّز عن الحقيقي، auto-vote لا يعمل (تعليق الجولة)، الصوت عن بُعد ينقطع على iOS تحت القفل، كسر عقد يؤثّر على عملاء الـ PWA.
- **P1 — يجب الإصلاح قبل الإطلاق العام:** اختلاف نصّي، حالة مرحلة خاطئة، فشل reconnect/استعادة، خطأ اهتزاز، انكسار تخطيط في فئة حجم.
- **P2 — يُصلَح قريباً:** فروق بصرية طفيفة، أنيميشن غير دقيق المدّة، حواف تكيّف غير مثلى.
- **P3 — تجميلي/تحسيني:** لا يؤثّر على التكافؤ الوظيفي.

---

## 5. التكيّف مع الشاشات 6→11 إنش (منهجية اختبار التكيّف)

**المرجع المعياري للتوكنات والفئات في 01-foundation-theme.md §5** — هذا الملف لا يعيد تعريف أي رقم، بل يحدّد **كيف نختبر** التكيّف عبر الفئات الثلاث. تخصيص كل شاشة موجود في §5 من ملفها؛ مهمة الاختبار مطابقة السلوك الفعلي لذلك التخصيص.

### 5.1 فئات الحجم وأعراض الاختبار

| الفئة | العرض (dp) | ما نتوقّع رؤيته عند الاختبار |
|---|---|---|
| **compact** | < 600 | **مطابق للـ PWA حرفياً** — عمود واحد، padding 16، نفس ترتيب العناصر وأحجام الخطوط. هذا خط الأساس للتكافؤ |
| **medium** | 600 ≤ w < 840 | محتوى نصي/نماذج/قوائم بسقف **640dp** متمركز؛ شبكات ترفع أعمدتها (`AdaptiveGrid`)؛ لا two-pane |
| **expanded** | ≥ 840 | سقف صفحة **960dp** متمركز (هوامش `#050505`)؛ شبكات أوسع؛ عناصر اللعب الحساسة × `gameScale=1.5` (تُكبَّر لا تُمطّط)؛ two-pane فقط حيث ينص ملف الشاشة (16 سجل، 26 نوتة+شات، 30 كونسول) |

### 5.2 أعراض الأحجام الأربعة الإلزامية للاختبار

اختبر **كل شاشة** عند العروض الحدّية الأربعة (كما ينص 01 §5.2 بند 8): **360 / 600 / 840 / 1100dp**.

- **360dp** (حد compact الأدنى، جهاز D7): لا فيض أفقي، لا نص مقصوص، أهداف لمس ≥48×48dp.
- **600dp** (بداية medium): يبدأ سقف المحتوى 640 والتمركز؛ الشبكات ترفع عموداً.
- **840dp** (بداية expanded): سقف الصفحة 960؛ خلفية الأجواء تغطي كامل الشاشة الفيزيائية لا عمود المحتوى فقط؛ عناصر اللعب تكبر.
- **1100dp** (تابلت 11 كبير): سقف 960 يترك هوامش سوداء متمركزة؛ two-pane حيث يُنص عليه؛ الحوارات لا تتمدّد (`dialogMaxWidth` 512 كحد).

### 5.3 قائمة تحقّق التكيّف (تنطبق على كل شاشة)

- [ ] compact مطابق للـ PWA بصرياً (لقطة بلقطة).
- [ ] لا تمدّد للبطاقات/النماذج/النصوص على كامل عرض التابلت — تُسقَف وتُمركَز.
- [ ] الشبكات تتوسّع **بالأعمدة** لا بحجم الخلية.
- [ ] عناصر اللعب الحساسة (البطاقة، المؤقت الدائري، رقم المقعد، أزرار الليل/التصويت) تُكبَّر بـ `gameScale` وتبقى متمركزة.
- [ ] الحوارات والتوستات لا تتبع عرض الشاشة (`dialogMaxWidth` 448/448/512؛ توست ≤360dp أعلى-البداية).
- [ ] الأنيميشن والمدد لا تتغيّر بين الفئات.
- [ ] portrait مقفول — لا landscape؛ التكيّف بالعرض لا بالدوران.
- [ ] two-pane يظهر **فقط** في الشاشات المنصوص عليها (16/26/30) وفي expanded فقط.
- [ ] `MediaQuery.textScaler` مقيّد (clamp ≤1.3): رفع خط النظام لا يكسر التخطيط ولا يقصّ النص.

---

## 6. المنطق والتدفقات (تدفّقات الاختبار كآلات حالة)

### 6.1 آلة حالة الصمود (المرجع 20-game-state-core.md)

```
[in-game] ──(قفل/خلفية/kill)──► [detached/paused]
   │                                   │
   │◄──(resume/connect/online)─────────┘
   ▼
resume:
  1. AppLifecycleState.resumed  → poll فوري room:get-my-state
  2. socket 'connect'           → room:rejoin-player (id جديد)
  3. صمام تجاوز المرحلة 6s      → حدث socket يفوز على poll مؤقتاً
  4. القراءة المتزامنة لـ mafia_* قبل أول إطار (على kill)
```

- **حالات حدّية للاختبار:**
  - reconnect أثناء `DAY_VOTING`: استعادة المرشحين + إجمالي الأصوات + أصوات كل لاعب + صوتي (بالـ physicalId) + العدّاد المتبقي.
  - reconnect أثناء `NIGHT`: إعادة اشتقاق `actionType` من `autoNightStepRole` (SHERIFF→INVESTIGATE، DOCTOR/NURSE→PROTECT، SNIPER→SNIPE، WITCH→DISABLE، SILENCER-غير-منفّذ→DECOY، وإلا KILL)؛ `isDecoy = physicalId !== autoNightPerformerId`؛ عدّاد `max(3, config.autoNightTime||15)`.
  - reconnect بعد الموت: البطاقة تبقى مقلوبة، لا أفعال/تصويت.
  - jitter التوست: توست أحدث لا يُمسح بمؤقّت أقدم (حارس هوية الرسالة/رقم تسلسلي).

### 6.2 تدفّقات المهل والمؤقّتات (يجب مطابقتها زمنياً)

- poll: كل **3s** (مقدمة فقط).
- عدّادات 1s: التصويت، الليل، prompt العمدة، مؤشّر `now` (أثناء DAY_VOTING فقط).
- مهل setTimeout: إخفاء التوست 5s/6s، بانر تغيير المقعد 5s، بانر العمدة 8s، شبكة أمان ما بعد rejoin 500ms، تأجيل الانضمام 100ms، إعادة إيجاد المقعد المحجوز 300ms، تحويل feedback 1.5s، إغلاق انتهاء الليل 2s ثم 1.5s.
- بوابة تجاوز المرحلة: TTL **6000ms** (مقارنة طابع زمني لا مؤقّت).

### 6.3 حالات حدّية إضافية للاختبار (من playerflow-a)

- `room:find-by-code` قد يعيد `{success:false}` **بلا رفض** — يُعالَج صراحةً في حلّ الدعوة.
- أخطاء `emit` تحمل بيانات مهيكلة: `response.code === 'PENDING_SURVEYS'` (تحويل feedback بعد 1.5s)، `response.requiresConfirmation` (مودال تأكيد الانتقال) — تُختبَر كاستثناءات مصنّفة لا كمطابقة نصّية.
- أخطاء poll تُبتلع بصمت؛ فشل rejoin يمسح الجلسة الفاسدة.
- **تسرّب مستمعين معروف في الويب لا يُنقَل:** `night:action-required`/`nurse:activation-request` مُسجَّلان بلا تنظيف — في Flutter يجب إلغاء الاشتراكات في `dispose`؛ اختبار عدم تراكمها عبر إعادة الدخول المتكررة.

---

## 7. عقود التكامل (تحقّق تكافؤ العقود)

**المنهج:** التقاط شبكة متوازٍ — تشغيل التطبيق والـ PWA على نفس السيناريو ومطابقة الحمولات **بايتاً ببايت** (mitmproxy/Charles للـ REST؛ سجل socket.io للأحداث). لا نخترع أي endpoint/حدث؛ نتحقّق أن التطبيق يرسل/يستقبل **نفس** ما ترسله/تستقبله الـ PWA. الجداول المرجعية الكاملة في 03-networking-rest.md و04-socket-layer.md.

### 7.1 REST — نقاط يجب مطابقة طلبها/ردّها

| Method + Path | Request | حقول الرد المستعملة | مرجع |
|---|---|---|---|
| GET `/api/player-auth/me` | Bearer | `success, player{id,name,phone,gender,mustChangePassword,avatarUrl}, activeGame{roomId,roomCode,physicalId,gameName?,role?,isAlive?}` | 05 |
| POST `/api/player/lookup` | `{phone}` (بادئة 0) | `found, player{displayName,id,playerId?}` | 05/10 |
| POST `/api/player-auth/login` | `{phone,password}` | `success, token, player{id,name,avatarUrl?,mustChangePassword?}, error` | 10 |
| POST `/api/player-auth/register` | `{phone,password,name,gender('MALE'/'FEMALE'),dob('YYYY-MM-DD'\|null)}` | `success, token, player{id}, error` | 10 |
| POST `/api/player-auth/change-password` | `{oldPassword,newPassword}` + Bearer | `success, token?(مُدوَّر), error` | 10 |
| GET `/api/push/vapid-public-key` | — | (لا يُستعمَل في التطبيق — iOS عبر APNs) | 06 |
| POST `/api/player-notifications/register-token` | `{token,deviceId,deviceInfo}` + Bearer | dedup لكل deviceId؛ `platform:'android'\|'ios'` | 06 |
| GET `/api/player-notifications?limit=` | Bearer | صندوق الوارد (افتراضي 50، `createdAt DESC`) | 19 |
| PUT `/api/player-notifications/:id/read` · `.../read-all` · DELETE `/:id` | Bearer | تعليم مقروء / حذف | 19 |
| GET `/api/sounds/active-map` | (بلا auth) | `{success:true, map:{eventKey:"/uploads/sounds/<file>"}}` | 07 |

- **حمولة الدفع (data-only، كل القيم strings):** `{title, body, tag?, type, url?, imageUrl?, videoUrl?, richBody?, roomCode?, activityId?, sessionId?, inviterName?}`. أنواع `type`: `activity_started, room_invite, new_activity, booking_confirmed, game_ended, feedback_survey, order_status, new_order, custom, reminder, friend_booked, level_up, comeback` — تُطابَق مع خريطة التوجيه.

### 7.2 Socket — أحداث يجب مطابقة اتجاهها/حمولتها/توقيتها

**المصافحة (handshake):** نفس حمولة `auth` (playerToken + token + deviceId)، بروتوكول **EIO4** لمطابقة Socket.IO v4، وإعادة قراءة التوكنات عند **كل** reconnect (مرآة `reconnectSocketAuth`). دلالات `emit`: ack بمهلة **15s**، ينجح فقط عند `response.success===true` وإلا يرفض بـ `Error(response.error)` حاملاً `response.code`/`requiresConfirmation`.

**Emits للتحقّق:** `room:rejoin-player` (physicalId:0 = بحث بالهاتف) · `room:find-by-code` · `room:auto-join` (**بلا `preferredSeat`**) · `room:get-my-state` · `room:player-exit` · `room:freeze-player` · `player:cast-vote {..., autoVote:true}` · `day:mayor-decision {decision:'PASS'\|'REVOTE'\|'POSTPONE'}` · (اللعب الكامل: إرسال التصويت اليدوي، أفعال الليل — عبر ملفات 23/25) · `player:mafia-gallery-open` (تنبيه الليدر — **إلزامي عدم إسقاطه**).

**Listeners للتحقّق (عيّنة حرجة):** `connect` (re-rejoin) · `player:seat-changed` · `player:kicked-self` · `game:penalty-recorded` · `player:penalty-ejected` · `player:role-assigned` · `mafia:team-updated` · `assassin:contracts-update` · `game:started`/`game:state-sync` · `day:mayor-window`/`-closed`/`-revealed` · `day:voting-started`/`day:vote-update`/`day:voting-complete` · `game:phase-changed` · `day:justification-started` · `day:elimination-pending` · `game:over`/`game:closed`/`game:room-deleted`/`game:kicked`/`event:closed` · `night:action-required` · `nurse:activation-request`.

**إجراء التحقّق:** لكل حدث، سجّل من الجهازين: (1) وصل؟ (2) نفس الحمولة؟ (3) نفس رد الفعل (نص/اهتزاز/انتقال)؟ (4) نفس التوقيت (delta < ~250ms)؟

---

## 8. نماذج Dart المطلوبة (تجهيزات الاختبار — Test Fixtures)

هذا الملف لا يضيف نماذج إنتاج (كلها في 02-models-data-layer.md). يعرّف **تجهيزات اختبار** فقط، تعيش في `test/` و`integration_test/`:

```dart
/// حساب/غرفة اختبار على staging
class TestAccount { final String phone; final String password;
  final String displayName; final int? playerId; final String? token; }

class TestRoom { final String roomCode; final int roomId;
  final String gameName; final bool requireTicket; final bool isRemote; }

/// خلية في مصفوفة §4.3
enum SizeClassT { compact, medium, expanded }
enum PlatformT { android, ios }
class TestCell { final String screenFile; final SizeClassT size;
  final PlatformT platform; final double widthDp; }

/// نتيجة تحقّق تكافؤ نصّي/سلوكي
class ParityCheck { final String key;        // مفتاح النص/السلوك
  final String expectedPwa; final String actualApp;
  final bool pass; }

/// بلاغ عيب (§4.8)
enum Severity { p0, p1, p2, p3 }
class DefectRecord { final String id; final String title;
  final Severity severity; final String screen; final SizeClassT size;
  final PlatformT platform; final String buildNumber;
  final String steps; final String expected; final String actual;
  final List<String> evidence; final String? suspectedCode; }

/// سجل جلسة التوازي (§4.7)
class PhaseTick { final String phase; final int tServer;
  final int tAppSeen; final int tPwaSeen; int get deltaMs => (tAppSeen - tPwaSeen).abs(); }
class ParallelSessionLog { final String sessionId; final String roomCode;
  final List<PhaseTick> timeline; final List<DefectRecord> divergences;
  final List<String> crashes; final String verdict; }
```

- **golden fixtures:** لقطات مرجعية من الـ PWA لكل شاشة/فئة حجم لمطابقة `flutter_test` golden.

---

## 9. الحزم المستخدمة (أدوات الاختبار)

| الحزمة/الأداة | الغرض |
|---|---|
| `flutter_test` | اختبارات وحدة/widget؛ golden tests لمطابقة اللقطات المرجعية |
| `integration_test` | تدفّقات E2E على جهاز حقيقي/محاكي |
| `patrol` (أو `flutter_driver`) | أتمتة عبر الأنظمة، التعامل مع حوارات الأذونات الأصلية (push/mic/photos) |
| `mocktail` / `mockito` | عزل الوحدات (socket/dio) عند الحاجة |
| `alchemist` / `golden_toolkit` | golden متعدّد الأحجام (360/600/840/1100dp) بلا جهاز |
| `network_image_mock` | تثبيت صور الأفاتار في golden |
| Firebase **Test Lab** / **Crashlytics** | مزرعة أجهزة + تتبّع الأعطال في التوازي الحقيقي |
| **mitmproxy** / **Charles** (خارجي) | التقاط REST + socket.io المتوازي لمطابقة الحمولات (§7) |
| **Codemagic** | بناء iOS + توزيع TestFlight للمختبرين (91) |
| `accessibility` عبر `flutter_test` semantics + فحص textScaler | تحقّق الوصولية وحدود تكبير الخط |

> ملاحظة: الحزم الإنتاجية (socket_io_client، dio، firebase_messaging، just_audio، وغيرها) موثّقة في §9 من ملفاتها؛ لا تُكرَّر هنا.

---

## 10. اختلافات Android / iOS (اختبارات خاصة بكل نظام)

الاختبار المتوازي يجب أن يُنفَّذ على **كلا النظامين** لأن جوهر مبرّر التطبيق فروق منصّية (إشعارات/صوت/خلفية). أبرز ما يُختبَر مختلفاً:

| المجال | Android — يُختبَر | iOS — يُختبَر | مرجع |
|---|---|---|---|
| **الإشعارات** | قناة `mafia_default` (importance high، اهتزاز `[0,200,100,200]`)، إذن `POST_NOTIFICATIONS` صريح (API 33+)، أيقونة أحادية اللون + accent، data-only لا يُخنق تحت Doze/force-stop | APNs عبر FCM (مفتاح `.p8`)، `content-available` في رؤوس APNs لـ data-only، foreground presentation مطفأ (تحديث الصندوق فقط)، صور الإشعار تتطلب Notification Service Extension (imageUrl **ليس مجانياً**) | 06, 90, 91 |
| **Deep/Universal Links** | App Links عبر `assetlinks.json` + `autoVerify`؛ فتح `https://club-mafia.grade.sbs/join/*` مباشرةً في التطبيق | Universal Links عبر `apple-app-site-association` + Associated Domains `applinks:club-mafia.grade.sbs` | 08, 90, 91 |
| **الصوت في الخلفية** | (اختياري) foreground service للصوت المطوّل | Background Mode `audio`+`voip`؛ الصوت عن بُعد **لا ينقطع** تحت القفل/تبديل التطبيق (الاختبار الأهم على iOS) | 07, 31, 91 |
| **الاهتزاز** | `Vibration.vibrate(pattern:[...])` — الأنماط الـ11 كاملة (role `[100,50,200,50,300]`، seat `[200,100,200]`، penalty-self `[300,100,300,100,500]`، penalty-eject `[500,200,500,200,500]`، mayor `[120,80,120,80,240]`، vote-start `[100,200]`، game-start `200`، warn `[100,100]`، إقصاء `[200,100,200]`، دوري بالكلام `[200,100,200,100,300]`) | لا أنماط أصلية → ترجمة إلى `HapticFeedback`/CoreHaptics؛ تحقّق أنها لا تصمت تماماً | 07 |
| **اختيار/قص الصورة** | `image_picker`+`image_cropper` (uCrop) | نفسها (TOCropViewController) + إذن `NSPhotoLibraryUsageDescription`؛ (الكاميرا اختيارية) | 13 |
| **status/navigation bar** | `systemNavigationBarColor` قابل للضبط؛ زر الرجوع الفيزيائي/الإيمائي يتنقّل صحيحاً | لا شريط تنقّل سفلي؛ ضبط home indicator؛ إيماءة الرجوع | 01, 11 |
| **تكبير خط النظام** | يُحترَم — نقيّده clamp ≤1.3 | Dynamic Type — مشابه، clamp ≤1.3 | 01 |
| **الأذونات (حوارات أصلية)** | POST_NOTIFICATIONS، RECORD_AUDIO، (CAMERA اختياري) | Push، Microphone، Photo Library — نصوص الاستخدام في Info.plist | 06, 13, 31, 90, 91 |
| **البناء والتوزيع** | keystore + Play App Signing + Play Console + `assetlinks.json` على nginx | Apple Developer + Xcode/Codemagic + TestFlight + مراجعة App Store + `apple-app-site-association` | 90, 91 |

**بنود منصّية إلزامية في التوازي الحقيقي:** (1) إشعار iOS يصل ويوجّه من cold start (السبب الأول لبناء التطبيق أصلاً)؛ (2) الصوت عن بُعد على iOS لا ينقطع تحت القفل؛ (3) App/Universal Links تفتح التطبيق من رابط الدعوة على النظامين.

---

## 11. الأصول المطلوبة (أصول الاختبار)

- **حسابات اختبار على staging:** ≥6 حسابات لاعبين (مسجّلين مسبقاً + جدد للتسجيل)، تغطي genders، وحساب `mustChangePassword` لاختبار تغيير كلمة المرور الإجباري، وحساب موظف (staff) لاختبار auto-login في المصافحة.
- **غرف staging جاهزة:** غرفة قاعة عادية، غرفة تتطلب تذكرة، غرفة `isRemote` مع `allowPlayerInvites`.
- **روابط/رموز deep link:** QR لـ `/join/{code}`، رابط دعوة `/player/join?code=XXXX&invite=1&by=NAME`، رابط لغرفة ميتة (لاختبار «الغرفة لم تعد متاحة»).
- **إشعارات اختبار:** واحدة لكل `type` (خصوصاً `room_invite`, `feedback_survey`, `order_status`, `activity_started`) لاختبار التوجيه؛ إشعار غني بـ `imageUrl` و`videoUrl` لاختبار المودال الغني.
- **مختبر أجهزة D1–D7** (§4.2) + جهازا PWA مرجعيان (Chrome Android + Safari iOS).
- **أدوات التقاط الشبكة** (mitmproxy/Charles) مهيّأة على شبكة الاختبار.
- **لقطات مرجعية من الـ PWA** لكل شاشة × فئة حجم (golden baseline).
- **فتحة فعالية حقيقية في النادي** مع ليدر/شاشة على الويب + لاعبين فعليين للاختبار المتوازي (§4.7).
- **حسابات مراجعة المتاجر:** حساب تجريبي للمراجعين + فيديو قصير يشرح أن اللعب داخل نادٍ فعلي (91).

---

## 12. معايير القبول — قائمة الإقفال قبل الإطلاق (Pre-launch Lockdown)

قائمة قابلة للتعليم (✓). **لا يُطلَق إصدار عام قبل اكتمال كل بنود P0/P1 وجلستَي توازي حقيقيتين بلا عيب P0/P1.**

### 12.1 البنية التحتية والتعايش
- [ ] التطبيق يتصل بـ staging (`mafia.grade.sbs`) وprod (`club-mafia.grade.sbs`) عبر flavors صحيحة؛ كل الروابط مطلقة، صور `/uploads/*` تُحلّ صحيحاً.
- [ ] المصافحة تطابق EIO4/Socket.IO v4 بنفس حمولة `auth`؛ reconnect يعيد قراءة التوكنات (مرآة `reconnectSocketAuth`).
- [ ] **التعايش مُثبَت:** جلسة توازي كاملة (App + PWA في نفس الغرفة) بلا كسر لأي عميل، ولا تعديل عقد على الـ backend خارج الإضافات الأربع الحصرية.
- [ ] بوابة الإصدار/التحديث القسري تعمل (شاشة «حدّث التطبيق» غير قابلة للتجاوز عند إصدار أدنى من المدعوم).

### 12.2 المصادقة والجلسة والصفحات الثابتة (10→19)
- [ ] تدفّق الدخول/التسجيل/تغيير كلمة المرور/المكافأة مطابق نصّياً وسلوكياً؛ التطبيع الأردني للهاتف صحيح.
- [ ] auto-login الموظف في المصافحة يعمل (بلا واجهات ليدر) — تمييز الليدر لتنبيه معرض المافيا سليم.
- [ ] الرئيسية، الملف+الأفاتار (اختيار/قص/ضغط/رفع)، الألعاب+الدعوات+واتساب، الرتب+الإطارات، السجل، الطلبات F&B، التقييم، الإشعارات — كلها مكافئة (كل §12 في ملفها مُعلَّم ✓).
- [ ] كتالوج النصوص المرجعية (§4.4) مطابق حرفياً على لقطات جنباً لجنب.

### 12.3 تجربة اللعب بالقاعة (20→27)
- [ ] سيناريو القاعة الكامل (§4.5.1) يمرّ بلا اختلاف على App وPWA متزامنين.
- [ ] كشف الدور: البطاقة تبدأ مقلوبة، mafiaTeam/sibling يُستبدلان دائماً، التوأم أحادي الاتجاه.
- [ ] **فتح معرض المافيا يُطلق `player:mafia-gallery-open` (تنبيه الليدر الفوري)** — غير مُسقَط.
- [ ] الليل: prompt الطُعم مطابق بكسلياً للحقيقي؛ منطق المهلة (submitted بعد 2s، إغلاق بعد 1.5s).
- [ ] التصويت: تغيير الصوت مسموح؛ **auto-vote على المهلة** (self وإلا index 0، `autoVote:true`) يمنع تعليق الجولة.
- [ ] العمدة: PASS/REVOTE/POSTPONE، الصوت المضاعف ×2، بانر الكشف 8s.
- [ ] الإقصاء/القنبلة/الصباح/السينمائيات/المؤقت الدائري مطابقة (نوع الأنيميشن ومدّته والعتبات اللونية).
- [ ] النوتة تُحفَظ محلياً لكل غرفة/مقعد؛ شات المافيا مشروط بـ `mafiaChatEnabled` ولا يكشف هوية.
- [ ] هاتف اللاعب **تابع** للصوت لا مصدر؛ الاهتزازات الـ11 صحيحة؛ نغمة «دوري بالكلام» تعمل.
- [ ] Game Over يُبقي الدور والموت ويمسح البقية؛ `game:started` = إعادة ضبط كاملة.

### 12.4 عن بُعد (30→31)
- [ ] سيناريو الريموت الكامل (§4.5.2) يمرّ بالصوت.
- [ ] كونسول المضيف (9 شاشات + مكوّنات الليدر الثلاثة) يعمل.
- [ ] الصوت المباشر: قواعد الكتم لكل مرحلة، المتحدث النشط، المواجهة الثنائية مطابقة.
- [ ] **الصوت على iOS لا ينقطع تحت القفل/تبديل التطبيق** (Background `audio`+`voip`).
- [ ] استعادة WebRTC بعد قطع الشبكة.

### 12.5 الصمود والاستعادة (§4.6 / §6)
- [ ] R1–R10 كلها تمرّ: قفل الشاشة، الخلفية، reconnect، kill/restart، بوابة تجاوز المرحلة، poll 3s، تبديل الحساب، QR لغرفة مختلفة، المقعد المحجوز، النقر على الإشعار (cold/warm/foreground).
- [ ] استعادة منتصف التصويت/الليل صحيحة (العدّاد المتبقي، المرشحون، صوتي، prompt الليل).
- [ ] لا وميض/ارتداد للمرحلة عند تعارض socket/poll.

### 12.6 الدفع والروابط العميقة (06/08/19)
- [ ] توكن FCM يُسجَّل (`platform:'android'\|'ios'`)؛ إشعار يصل foreground/background/cold على النظامين.
- [ ] **إشعار iOS يصل ويوجّه من cold start** (الميزة الأساسية).
- [ ] التوجيه بالنوع صحيح (خريطة `resolveNotificationUrl` نسخة الـ SW الأشمل) **بعد** تحميل auth اللاعب.
- [ ] App/Universal Links تفتح التطبيق من رابط الدعوة (`assetlinks.json` + `apple-app-site-association` مرفوعان).

### 12.7 التكيّف مع الشاشات (§5)
- [ ] كل شاشة تمرّ على 360/600/840/1100dp بلا فيض/قصّ.
- [ ] compact مطابق للـ PWA؛ medium يسقف 640؛ expanded يسقف 960 + `gameScale=1.5` للعناصر الحساسة.
- [ ] two-pane يظهر فقط في 16/26/30 وفي expanded.
- [ ] textScaler clamp ≤1.3 لا يكسر أي تخطيط.
- [ ] مصفوفة §4.3 مكتملة (كل شاشة × 3 فئات × نظامين).

### 12.8 المنصّة والمتاجر (90/91)
- [ ] Android: توقيع + Play App Signing؛ الأذونات المطلوبة فقط؛ App Links مُتحقَّق منها؛ صفحة متجر عربية + سياسة خصوصية.
- [ ] iOS: APNs `.p8`، القدرات (Push، Background `remote-notification`/`audio`/`voip`، Associated Domains)، Info.plist usage strings؛ TestFlight؛ حساب مراجعة + فيديو.
- [ ] Crashlytics مفعّل ولا أعطال P0 في جلستَي التوازي.

### 12.9 الأمان والأداء (§13)
- [ ] لا يستقبل اللاعب أبداً أدوار/حالة لاعبين آخرين.
- [ ] لا أسرار في السجلّات؛ التوكنات في `flutter_secure_storage`؛ تحقّق شهادة TLS.
- [ ] 60fps في الأنيميشن الحساس (البطاقات/المؤقت/الرتب) على D7 (أضعف جهاز).
- [ ] cold start ضمن الميزانية؛ لا تسريب ذاكرة عبر إعادة الدخول المتكررة (لا تراكم مستمعين).

---

## 13. ملاحظات أداء وأمان

### 13.1 الأداء (يُقاس على D7 — أضعف جهاز مدعوم)
- **60fps للعناصر الحساسة:** قلب البطاقة (22)، المؤقت الدائري CustomPainter (24)، تأثيرات الرتب (particle-orbit/shimmer/border-travel) (15)، سينمائيات الليل/الصباح (24). قِس عبر Flutter DevTools timeline؛ لا jank > 16ms مستمر.
- **cold start:** القراءة المتزامنة لمفاتيح `mafia_*` قبل أول إطار (splash) بحيث يهبط اللاعب المستعاد مباشرة على شاشته بلا وميض؛ قِس وقت الوصول للإطار الأول.
- **تمرير القوائم:** الرئيسية/السجل/الإشعارات/المنيو بلا jank؛ `BackdropFilter` blur (لوحة الإشعارات/المودال الغني) مكلف على Android الضعيف — خفّفه أو استبدله بخلفية شبه معتمة على D7.
- **البطارية:** إيقاف poll الـ3s في الخلفية؛ `wakelock_plus` فقط أثناء المراحل النشطة (تصويت/ليل/صوت) لا طوال الجلسة.
- **الذاكرة:** إعادة الدخول/الخروج المتكررة لا تراكم مستمعي socket (إلغاء الاشتراكات في `dispose` — عكس تسرّب الويب المعروف)؛ صور الأفاتار عبر `cached_network_image` بحدود كاش معقولة.
- **الشبكة:** كاش خريطة/ملفات الأصوات محلياً؛ إبطالها عند `admin:sounds-updated` (الأسماء timestamped تسهّل ذلك).

### 13.2 الأمان (مبادئ محورية تُختبَر صراحةً)
- **عدم تسريب المعلومات:** اللاعب لا يستقبل أبداً أدوار لاعبين آخرين أو حالة داخلية ليست له — تحقّق بالتقاط الشبكة أن الحمولات الموجّهة له فقط لا تحوي أدوار الغير.
- **الطُعم (decoy):** prompts الليل الطُعمية **مطابقة بكسلياً** للحقيقية (مضادّ لكشف الأدوار بمراقبة الشاشة) — أي فرق بصري = P0.
- **تنبيه معرض المافيا:** `player:mafia-gallery-open` يُطلَق فور فتح المعرض (مضادّ غش) — لا يُسقَط تحت أي ظرف.
- **سرية شات المافيا:** `mafiaChatEnabled` علم عام لا يكشف هوية؛ الشات لا يظهر لغير المافيا ولا يسرّب أعضاء الفريق لغيرهم.
- **التخزين:** التوكنات في `flutter_secure_storage`؛ أعلام في `shared_preferences`؛ لا كتابة توكن في السجلّات أو Crashlytics.
- **النقل:** HTTPS فقط؛ تحقّق شهادة TLS؛ لا وضع تطوير يعطّل التحقّق في بناء prod.
- **الأذونات:** طلب الحد الأدنى (push، mic للريموت، photos للأفاتار)؛ لا أذونات زائدة تُرفَض في مراجعة المتاجر.
- **auto-login الموظف:** يبقى للمصافحة فقط بلا أي واجهات ليدر في تطبيق اللاعب؛ تحقّق أن لاعباً عادياً لا يحصل على صلاحيات ليدر.
