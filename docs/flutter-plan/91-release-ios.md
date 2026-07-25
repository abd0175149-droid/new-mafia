# 91 — إصدار iOS: الحساب، APNs، القدرات، TestFlight، المراجعة

> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

---

## 1. الهدف والنطاق

هذا الملف هو **الدليل التنفيذي الكامل والقابل للتطبيق خطوةً بخطوة** لبناء نسخة iOS من تطبيق اللاعب وتوزيعها ونشرها على App Store — **دون امتلاك جهاز Mac** (عبر Codemagic). كل بند هنا مهمة قابلة للتنفيذ يتبعها المطوّر حرفياً.

**داخل النطاق:**
1. حساب **Apple Developer Program** (99 دولار/سنة) — فتحه، الأدوار، Team ID.
2. **Bundle ID** النهائي وتسجيله في Apple + Firebase (نفس مشروع `mafia-b1c74`) وتنزيل `GoogleService-Info.plist`.
3. **مفتاح APNs Authentication Key (`.p8`)** — إنشاؤه ورفعه إلى Firebase (يستبدل Web Push/VAPID كلياً على iOS).
4. **Capabilities** (Push Notifications, Background Modes, Associated Domains) و**Info.plist** بالنصوص الحرفية لأوصاف الأذونات (Microphone/PhotoLibrary/Camera).
5. **Background Modes**: `remote-notification` + `audio` + `voip` — بما فيها القيود والقرارات (CallKit لـ voip).
6. **Universal Links**: ملف `apple-app-site-association` وقدرة Associated Domains (المحتوى في 08؛ الجانب iOS هنا: Team ID، appIDs، Entitlements).
7. **البناء بدون Mac** عبر **Codemagic** (`codemagic.yaml` كامل + التوقيع التلقائي عبر App Store Connect API Key).
8. **TestFlight** (المختبرون الداخليون/الخارجيون، Beta App Review، معلومات الاختبار).
9. **مراجعة App Store**: صفحة المنتج (نصوص عربية، لقطات، تصنيف)، الحساب التجريبي، الفيديو التوضيحي، و**مخاطر المراجعة الحرجة وتخفيفها** (إجبار الإشعارات، حذف الحساب، voip).
10. **بوابة الإصدار (Force Update)** الجانب iOS: مفاتيح Remote Config و`store_url_ios` (التصميم في 11-shell-navigation.md).
11. **الأيقونة وشاشة الإقلاع** من `mafia_logo.png`، و**Notification Service Extension** الاختياري للصور الكبيرة.

**خارج النطاق (ملفات أخرى):**
- إصدار Android → `90-release-android.md`.
- منطق FCM/الأذونات/التوجيه داخل التطبيق → `06-push-notifications.md`.
- محتوى ملفَي `assetlinks.json` و`apple-app-site-association` وقواعد nginx → `08-deeplinks-routing.md` §7.5.
- تصميم شاشة التحديث الإجباري وبانر التحديث الاختياري → `11-shell-navigation.md` §4.4 و`12-home.md`.
- منطق الصوت المباشر وRealtimeKit → `31-voice-realtimekit.md`؛ جلسة الصوت → `07-sound-system.md`.
- خطة الاختبار الشاملة والتكافؤ → `92-qa-parity.md`.

**مبدأ حاكم:** iOS يستقبل الإشعارات **حصراً** عبر APNs من خلال FCM؛ الـ backend يرسل كتلة `apns` جاهزة (تم التحقق منها حرفياً — §7.2). **ممنوع** اختراع أي endpoint أو تغيير أي عقد؛ التغييرات على الخادم محصورة في الإضافات الأربع للخطة الأم (§10) + بندَي مراجعة App Store الإلزاميَين المرصودَين في §6.7 (حذف الحساب + صفحة الخصوصية).

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

| الملف | ما يؤخذ منه |
|---|---|
| `unified-mafia/backend/src/services/fcm.service.ts` (سطور 99–116) | كتلة `apns` على السلك: `apns-priority:10`, `apns-push-type:alert`, `apns-collapse-id:<type>`, و`aps` = `alert{title,body}` + `badge:1` + `sound:'default'` + `mutable-content:1` + `content-available:1` — **تم التحقق حرفياً**، لا تغيير مطلوب لدعم iOS الأصلي |
| `unified-mafia/backend/src/routes/player-notification.routes.ts` | `POST /api/player-notifications/register-token` — يقبل توكن FCM خام للموبايل بلا تمييز منصة (المنصة تُشتق من التوكن نفسه في `firebase-admin`) |
| `unified-mafia/frontend/src/app/layout.tsx` | `APP_VERSION = '2.5.0'` (مفتاح `mafia_app_version`)؛ `apple-mobile-web-app-status-bar-style: black-translucent`؛ `viewport userScalable=false`؛ `themeColor #050505` — تُنقل مكافئاتها إلى Info.plist/`SystemChrome` |
| `unified-mafia/frontend/public/mafia_logo.png` | مصدر الأيقونة (1024×1024) وشاشة الإقلاع — **يجب تسطيحه على خلفية معتمة** (§11) |
| `unified-mafia/frontend/public/icons/icon-512x512.png` | أيقونة manifest الحالية (مرجع بصري إضافي للأيقونة) |
| `unified-mafia/context/DEPLOYMENT.md` (سطور 566–570) | الدومينات: `club-mafia.grade.sbs` ← `127.0.0.1:3010` (إنتاج)، `mafia.grade.sbs` ← `:3000` (staging) — تحدد Associated Domains لكل flavor |
| `unified-mafia/docs/FLUTTER_PLAYER_APP_PLAN.md` (§12.2) | القرارات المعتمدة: حساب 99$، Bundle ID = `sbs.grade.mafiaclub`، مفتاح `.p8` إلى Firebase، Codemagic، حساب تجريبي + فيديو للمراجعين |

> ملاحظة: لا يوجد مشروع Flutter/Xcode فعلي بعد — مجلد `ios/` يُولَّد بـ `flutter create` في المرحلة M0 (01-foundation-theme.md). كل تعديلات Info.plist/Entitlements/Podfile أدناه تُطبَّق على المجلد المُولَّد.

---

## 3. التبعيات على ملفات الخطة الأخرى

| الملف | الاعتماد |
|---|---|
| `00-MASTER-PLAN.md` | Bundle ID المثبّت `sbs.grade.mafiaclub`؛ flavors dev/prod؛ الإضافات الأربع للـ backend (§10) |
| `01-foundation-theme.md` | إنشاء المشروع وflavors وConfigurations في Xcode؛ الخطوط العربية المضمّنة؛ لون `#050505` لشاشة الإقلاع؛ قفل الاتجاه portrait |
| `06-push-notifications.md` | خط FCM الكامل، آلة حالة الإذن، الخطوات الست للتشخيص، `foregroundPresentationOptions(alert:false,badge:false,sound:false)`، Notification Service Extension (§10.7)، تصفير badge |
| `07-sound-system.md` | فئة `AVAudioSessionCategory.playback` → تبرّر Background Mode `audio` (§6.5) |
| `08-deeplinks-routing.md` | محتوى `apple-app-site-association` (§7.5-ب)؛ `FlutterDeepLinkingEnabled=YES`؛ Entitlements Associated Domains؛ قيد Safari اليدوي |
| `11-shell-navigation.md` | بوابة الإصدار: Firebase Remote Config + `min_supported_build_ios`/`latest_build_ios`/`store_url_ios`؛ نصوص شاشة التحديث الإجبارية |
| `13-profile.md` | `NSPhotoLibraryUsageDescription` (رفع الأفاتار)؛ سلوك HEIC؛ PHPicker بلا إذن على iOS 14+ |
| `30-host-console.md` / `31-voice-realtimekit.md` | Background Modes `audio` + `voip`؛ `NSMicrophoneUsageDescription`؛ قرار CallKit (§6.6) — تُشحن في M5 لا M4 |
| `90-release-android.md` | النظير على Android؛ نفس مفاتيح Remote Config بلاحقة `_android`؛ نفس Bundle/Package وبصمات AASA؛ جدول الفروق في §10 |
| `92-qa-parity.md` | ترحيل معايير القبول §12 كبنود Definition of Done للإصدار |

---

## 4. الواجهة والتجربة تفصيلياً

هذا ملف إصدار وبنية تحتية — «الواجهة» المملوكة له هي **مصنوعات المتجر** (صفحة App Store، تجربة المُراجِع/المختبر) و**النصوص العابرة إلى شاشات مملوكة لملفات أخرى لكن قيمتها iOS تنشأ هنا**. أي شاشة داخل التطبيق مملوكة لملفها؛ الجديد هنا:

### 4.1 صفحة منتج App Store (App Store Connect → App Information + Version)

| الحقل | القيمة المقترحة (تُعتمد من المنتج قبل النشر) | قيد Apple |
|---|---|---|
| **Name** (اسم المتجر) | **«نادي المافيا»** | ≤ 30 حرفاً، فريد عالمياً — تحقّق من التوفر؛ إن مأخوذ: **«نادي المافيا - Mafia Club»** |
| **Subtitle** | **«العب المافيا في ناديك المفضّل»** | ≤ 30 حرفاً |
| **Primary Language** | العربية (Arabic) | — |
| **Bundle ID** | `sbs.grade.mafiaclub` (prod) | يجب أن يطابق التطبيق المسجّل |
| **SKU** | `mafiaclub-ios-001` (داخلي، غير معروض) | فريد داخل الحساب |
| **Primary Category** | Games → **Board** | فئتان كحد أقصى |
| **Secondary Category** | Entertainment | اختياري |
| **Age Rating** | **12+** (استبيان: «Infrequent/Mild Cartoon or Fantasy Violence» = نعم خفيف؛ **Simulated Gambling = لا**، لا رهان حقيقي ولا عملة) | من الاستبيان لا يدوياً |
| **Price** | مجاني (Free) | — |
| **Privacy Policy URL** | `https://club-mafia.grade.sbs/privacy` | **إلزامي** — يجب أن تُنشر الصفحة قبل الرفع (§6.7) |
| **Support URL** | `https://club-mafia.grade.sbs/support` أو رابط واتساب الدعم | إلزامي |
| **Marketing URL** | `https://club-mafia.grade.sbs` | اختياري |

**Description (عربي — مسوّدة قابلة للتعديل من المنتج، ≤ 4000 حرف):**
> «نادي المافيا هو رفيقك داخل جلسات لعبة المافيا في النادي: انضمّ إلى الغرفة بمسح رمز QR أو رابط دعوة، استلم دورك السري لحظة توزيع الأدوار، صوّت في النهار وتحرّك في الليل، وتابع ترتيبك ورتبتك وسجل مبارياتك. صُمّم التطبيق ليعمل جنباً إلى جنب مع مضيف اللعبة في النادي الفعلي، مع إشعارات فورية تنبّهك بدورك فور بدء الجولة. مزايا: بطاقات أدوار مصمّمة، مؤقتات ومراحل حيّة، سجل مباريات وترتيب موسمي، طلب المشروبات والوجبات من طاولتك، ودعوات الأصدقاء للغرف.»

**Keywords** (حقل واحد، فواصل، ≤ 100 حرف): `مافيا,لعبة,نادي,ادوار,اصدقاء,جلسة,تصويت,mafia,club,party`

**«What's New in This Version»** (لكل تحديث؛ للإصدار الأول): «الإصدار الأول من تطبيق نادي المافيا.»

### 4.2 لقطات الشاشة (Screenshots) — إلزامية للرفع

- الاتجاه **portrait فقط** (التطبيق مقفول portrait — §5).
- **iPhone 6.7"** (1290×2796 بكسل — iPhone 15/16 Pro Max): **إلزامية** (تغطي كل أحجام iPhone الأحدث).
- **iPad 12.9"/13"** (2048×2732 بكسل): **إلزامية لأن التطبيق Universal** (يدعم التابلت — §5). حذفها = رفض أو إجبار على تعطيل دعم iPad.
- 3–10 لقطات لكل مقاس. المحتوى المقترح: الرئيسية، بطاقة الدور، مرحلة التصويت، الترتيب/الرتبة، سجل المباريات.
- **لا تحتوي إطارات أجهزة وهمية توحي بميزات غير موجودة، ولا نصوص «Beta».**

### 4.3 نصّ App Review Information (تجربة المُراجِع) — إلزامي

- **Sign-In Required**: نعم → **حساب تجريبي**:
  - `Username` = رقم هاتف تجريبي مُفعّل مسبقاً في قاعدة الإنتاج (مثال: `0790000000`).
  - `Password` = كلمة مرور ثابتة للمُراجِع (تُدار كسرّ — §13).
- **Notes** (عربي + إنجليزي — النص الفعلي المرسل لـ Apple):
  > «هذا التطبيق رفيقٌ للعبة المافيا التي تُلعب داخل نادٍ فعلي بحضور مضيف بشري. يمكن تجربة كل الشاشات (الملف الشخصي، الترتيب، السجل، الطلبات، الدعوات) بالحساب التجريبي دون جلسة مباشرة. مرفقٌ فيديو يوضّح دخول جلسة لعب كاملة. الإشعارات الفورية أساسية لتنبيه اللاعب بدوره لحظة بدء الجولة — راجِع ملاحظة الإشعارات أدناه.»
  > “This app is a companion to the physical Mafia party game hosted by a human moderator in a real club. All screens (profile, rank, history, ordering, invites) are testable with the demo account without a live session. A video demonstrating a full game session is attached.”
- **Attachment**: فيديو `.mp4` قصير (30–90 ثانية) يُظهر: مسح QR → استلام الدور → التصويت → انتهاء الجولة (يعالج قيد «لا يمكن للمراجع رؤية اللعب الكامل بلا جلسة فعلية» — Guideline 2.1).
- **Contact**: بريد/هاتف مسؤول الحساب.

### 4.4 شاشة التحديث الإجباري (النصوص مملوكة لـ 11-shell-navigation.md — الجانب iOS هنا: الوجهة)

عند `currentBuild < min_supported_build_ios`: تُعرض الشاشة الحاجبة بنصوصها الحرفية من 11 (العنوان `تحديث جديد إلزامي! ⬆️`، الشرح `هذه النسخة من التطبيق أصبحت قديمة ولا يمكنها الاتصال بالنظام. حدّث التطبيق من المتجر للمتابعة باللعب.`، الزر `تحديث الآن من المتجر ⬆️`). **على iOS** الزر يفتح `store_url_ios` مباشرة عبر `url_launcher(LaunchMode.externalApplication)` — لا In-App Update (خاص بـ Android). `store_url_ios` = رابط صفحة التطبيق على App Store بصيغة `https://apps.apple.com/app/id<APP_ID>` (يُعبّأ في Remote Config بعد أول نشر واعتماد Apple ID الرقمي).

### 4.5 تجربة مختبر TestFlight (نص «What to Test»)

يُعرض للمختبرين داخل تطبيق TestFlight عند تثبيت البناء (عربي):
> «شكراً لمشاركتك في تجربة نادي المافيا. جرّب: تسجيل الدخول برقمك، تصفّح الرئيسية والترتيب والسجل، فتح رابط دعوة/رمز QR لغرفة، والسماح بالإشعارات ثم تأكد من وصول تنبيه دورك. أبلغنا عن أي بطء أو خطأ عبر لقطة شاشة.»

### 4.6 شكل الإشعار النظامي على iOS (مملوك لـ 06؛ يُذكر للاكتمال)

يعرضه النظام مباشرة من `aps.alert{title,body}` + `sound:'default'` + `badge:1` — **لا عرض محلي إطلاقاً** على iOS (أي `flutter_local_notifications.show` = إشعار مكرر). في foreground: `setForegroundNotificationPresentationOptions(alert:false, badge:false, sound:false)` (لا banner — تكافؤ الويب). تصفير الـ badge عند open/resume عبر `app_badge_plus`.

---

## 5. التكيّف مع الشاشات 6→11 إنش

**قرار الأجهزة: تطبيق Universal (iPhone + iPad)** — لأن الخطة تدعم صراحةً 6→11 إنش (تابلت). عليه يجب توفير لقطات iPad وتشغيل التطبيق بلا حواف سوداء على التابلت.

- **الاتجاه مقفول portrait** على iPhone وiPad (`UISupportedInterfaceOrientations` و`~ipad` = `UIInterfaceOrientationPortrait` فقط) — تكافؤ مع manifest؛ التكيّف بالعرض المنطقي لا بالدوران (00-MASTER-PLAN §8.2 قاعدة 7).
- **التكيّف الفعلي داخل الشاشات** تحدده Window Size Classes في 01-foundation-theme.md §5 وكل ملف شاشة في §5 الخاص به — هذا الملف لا يعيد تعريفه.
- **ربط فئات الحجم بمصنوعات المتجر (خاص بهذا الملف):**

| فئة الحجم | الجهاز النموذجي على iOS | مقاس اللقطة المطلوب | ما يجب أن يظهر |
|---|---|---|---|
| **compact** (< 600dp) | iPhone 15/16 (Pro Max) | **6.7"** 1290×2796 (إلزامي) | عمود واحد مطابق للـ PWA |
| **medium** (600–840dp) | iPad mini 8.3" portrait | (تُغطّى بلقطة iPad — لا مقاس منفصل في App Store) | عمود بعرض محدود + شبكات أوسع |
| **expanded** (> 840dp) | iPad Pro 11"/12.9" portrait | **12.9"/13"** 2048×2732 (إلزامي) | محتوى مسقوف ومتمركز + شبكات موسّعة + عناصر لعب مضاعفة |

- **قاعدة القبول:** التقط لقطات المتجر من جهازَين حقيقيَّين على الأقل (iPhone 6.7" + iPad 12.9") **بعد** تطبيق تكيّف §5 في الشاشات — أي خطأ تخطيط على iPad (تمديد أزرار، أسطر قراءة طويلة) يظهر فوراً في اللقطة ويجب إصلاحه قبل الرفع.
- **Multitasking/Split View على iPad**: التطبيق portrait-only لا يدعم Slide Over/Split متعدد الاتجاهات؛ اضبط `UIRequiresFullScreen = YES` في Info.plist لتفادي مطالبة Apple بدعم كل أوضاع التعدد (قرار: full-screen فقط لتطابق قفل الاتجاه).

---

## 6. المنطق والتدفقات — خطوات التنفيذ بالترتيب

### 6.0 خط الإنتاج (نظرة عامة — آلة حالة الإصدار)
```
[0] حساب Apple Developer (99$) مُفعّل  ── قد يأخذ ساعات→أيام (ابدأه أولاً)
      ↓
[1] Bundle ID مسجّل (Identifiers) + Capabilities مُفعّلة
      ↓
[2] مفتاح APNs (.p8) → مرفوع في Firebase (مشروع mafia-b1c74)
      ↓
[3] تطبيق iOS مسجّل في Firebase → GoogleService-Info.plist
      ↓
[4] App Store Connect API Key (.p8 مختلف!) → Codemagic
      ↓
[5] codemagic.yaml: build ipa + توقيع تلقائي + رفع TestFlight
      ↓
[6] Beta App Review (خارجي) → توزيع TestFlight
      ↓
[7] Submit for Review → مراجعة App Store → Phased Release
```

### 6.1 الخطوة 0 — حساب Apple Developer
1. سجّل على [developer.apple.com/programs](https://developer.apple.com/programs) بـ **Apple ID** للمؤسسة (يفضَّل حساب منظّمة باسم النادي؛ يتطلب D-U-N-S Number وقد يطيل الموافقة — بديل أسرع: حساب فردي Individual).
2. ادفع **99 دولار/سنة**. الموافقة قد تأخذ **ساعات إلى عدة أيام** → **ابدأ هذا البند قبل كل شيء** (أطول بند زمنياً — قرار الخطة الأم).
3. بعد التفعيل: دوّن **Team ID** (10 محارف alphanumeric) من [Membership](https://developer.apple.com/account) — يدخل في `apple-app-site-association` (`<TEAMID>.sbs.grade.mafiaclub`) وفي توقيع Codemagic.
4. الأدوار في App Store Connect: عيّن **Admin** لمدير الحساب و**App Manager** للحساب المستخدم في مفتاح API الخاص بـ Codemagic.

### 6.2 الخطوة 1 — Bundle ID والقدرات
1. [Certificates, Identifiers & Profiles → Identifiers → «+» → App IDs → App](https://developer.apple.com/account/resources/identifiers):
   - Description: `Mafia Club Player`
   - Bundle ID: **Explicit** = `sbs.grade.mafiaclub`
2. فعّل الـ Capabilities التالية على الـ App ID:
   - **Push Notifications** ✅
   - **Associated Domains** ✅
   - (Background Modes لا يُفعَّل هنا — يُضبط في Xcode/Info.plist لا في Identifier.)
3. **flavor التطوير (dev)**: سجّل App ID منفصلاً `sbs.grade.mafiaclub.dev` بنفس القدرات، مرتبطاً بـ `applinks:mafia.grade.sbs`، ليُثبَّت التطبيقان جنباً إلى جنب (staging + prod) على نفس الجهاز. (يتطلب ملف AASA خاصاً على `mafia.grade.sbs` — 08 §7.5 وملاحظة staging.)

### 6.3 الخطوة 2 — مفتاح APNs (.p8) إلى Firebase (**البند الأهم للإشعارات**)
1. [Keys → «+»](https://developer.apple.com/account/resources/authkeys/list):
   - Name: `Mafia Club APNs Key`
   - فعّل **Apple Push Notifications service (APNs)** → Continue → Register.
2. **نزّل ملف `AuthKey_XXXXXXXXXX.p8` (مرة واحدة فقط — لا يمكن إعادة تنزيله)**. دوّن **Key ID** (10 محارف). احفظه خارج git في خزنة أسرار.
3. Firebase Console → مشروع **`mafia-b1c74`** → Project settings → **Cloud Messaging** → قسم **Apple app configuration** → التطبيق `sbs.grade.mafiaclub` → **APNs Authentication Key → Upload**:
   - ارفع `.p8` + أدخل **Key ID** + **Team ID**.
4. **ملاحظة جوهرية:** مفتاح `.p8` واحد يخدم **بيئتَي APNs معاً** (Sandbox لـ TestFlight/التطوير + Production لـ App Store) — لا حاجة لشهادات منفصلة ولا تجديد سنوي (خلاف شهادات `.p12`). هذا يستبدل كلياً مسار Web Push/VAPID على iOS.
5. تحقّق: بعد الرفع، توكن FCM على iOS الحقيقي يُصدَر بنجاح (شاشة التشخيص 06 §4.6 الخطوة 4).

### 6.4 الخطوة 3 — تسجيل تطبيق iOS في Firebase
1. Firebase Console → `mafia-b1c74` → Add app → **iOS**:
   - Apple bundle ID: `sbs.grade.mafiaclub` (وأضف تطبيقاً ثانياً `sbs.grade.mafiaclub.dev` لـ flavor dev).
2. نزّل **`GoogleService-Info.plist`** لكل تطبيق. ضعه في `ios/Runner/` (وملف dev في مجلد config الـ flavor). **خارج git** (`.gitignore`) — يُحقن في Codemagic كمتغيّر بيئة مشفّر (base64) ويُكتب وقت البناء.
3. لا حاجة لإضافة SDK يدوياً — `firebase_core`/`firebase_messaging` (Flutter) تتكفّل عبر CocoaPods.
4. **swizzling**: أبقِ `FirebaseAppDelegateProxyEnabled` **مفعّلاً** (الافتراضي) ليربط FCM توكن APNs تلقائياً. إن اضطُررت لتعطيله لاحقاً (تعارض مكتبات) مرّر توكن APNs يدوياً لـ `Messaging.messaging().apnsToken` في `AppDelegate`.

### 6.5 الخطوة — Info.plist و Entitlements (النصوص الحرفية)

**`ios/Runner/Info.plist`** — المفاتيح المطلوبة:

```xml
<!-- الهوية والعرض -->
<key>CFBundleDisplayName</key>            <string>نادي المافيا</string>
<key>CFBundleName</key>                   <string>Mafia Club</string>
<key>CFBundleDevelopmentRegion</key>      <string>ar</string>
<key>CFBundleLocalizations</key>          <array><string>ar</string></array>

<!-- الاتجاه: portrait فقط (iPhone + iPad) -->
<key>UISupportedInterfaceOrientations</key>
<array><string>UIInterfaceOrientationPortrait</string></array>
<key>UISupportedInterfaceOrientations~ipad</key>
<array><string>UIInterfaceOrientationPortrait</string></array>
<key>UIRequiresFullScreen</key>           <true/>

<!-- الروابط العميقة (08-deeplinks-routing.md §10) -->
<key>FlutterDeepLinkingEnabled</key>      <true/>

<!-- تخطّي امتثال التصدير (HTTPS فقط، لا تشفير خاص) -->
<key>ITSAppUsesNonExemptEncryption</key>  <false/>

<!-- أنماط الخلفية -->
<key>UIBackgroundModes</key>
<array>
  <string>remote-notification</string>
  <string>audio</string>
  <!-- voip يُضاف فقط مع مرحلة الصوت عن بُعد وبعد قرار CallKit — §6.6 -->
</array>

<!-- أوصاف الأذونات (عربية — تظهر في حوار النظام) -->
<key>NSPhotoLibraryUsageDescription</key>
<string>نستخدم صور معرضك لاختيار صورة ملفك الشخصي في نادي المافيا فقط.</string>
<!-- الميكروفون: يُضاف فقط في إصدار الصوت عن بُعد (M5) — §6.6 -->
<key>NSMicrophoneUsageDescription</key>
<string>نستخدم الميكروفون للتحدث الصوتي المباشر مع اللاعبين في الغرف عن بُعد.</string>
<!-- الكاميرا: غير مطلوبة للإصدار 1.0 (الأفاتار عبر المعرض يكفي) — تُضاف فقط إن فُعّلت الكاميرا -->
<!-- <key>NSCameraUsageDescription</key>
     <string>نستخدم الكاميرا لالتقاط صورة ملفك الشخصي.</string> -->
```

**قواعد صارمة لأوصاف الأذونات:**
- **لا تُعلن مفتاحاً لميزة غير موجودة في البناء المرفوع.** `NSMicrophoneUsageDescription` يُضاف **فقط** في إصدار M5 (الصوت عن بُعد)؛ إعلانه في إصدار القاعة 1.0 بلا ميزة صوت مرئية = خطر رفض (Guideline 5.1.1 — Apple تسأل عن سبب طلب صلاحية بلا وظيفة). كذلك `NSCameraUsageDescription` يُترك محذوفاً ما لم تُفعَّل الكاميرا (13-profile.md: المعرض يكفي).
- `NSPhotoLibraryUsageDescription` احتياطي للمسارات الأقدم من iOS 14؛ PHPicker على iOS 14+ لا يطلب إذناً (13-profile.md §10). يبقى مُعلناً لتغطية أجهزة أقدم.

**`ios/Runner/Runner.entitlements`:**
```xml
<key>aps-environment</key>
<string>development</string>   <!-- Xcode/CI يبدّلها production تلقائياً لبناء التوزيع -->
<key>com.apple.developer.associated-domains</key>
<array>
  <string>applinks:club-mafia.grade.sbs</string>
  <!-- flavor dev: applinks:mafia.grade.sbs -->
</array>
```
- **Push Notifications** و**Associated Domains** يُفعَّلان تلقائياً عند وجود المفاتيح أعلاه مع التوقيع التلقائي؛ يدوياً: Xcode → Signing & Capabilities → «+ Capability».
- **Background Modes** تُفعَّل كـ Capability في Xcode أو مباشرةً بمفتاح `UIBackgroundModes` أعلاه (كلاهما مكافئ).

**نظير `viewport`/status bar من الويب** (لا Info.plist بل كود Flutter في 01/11): شريط الحالة `SystemUiOverlayStyle.light` (نص فاتح على خلفية `#050505`)، ومنع تكبير الخط عبر clamp للـ `textScaler` (00-MASTER-PLAN §8.2 قاعدة 8) — مكافئ `userScalable=false`. لا `black-translucent` بمعناه الويبي؛ Flutter يرسم تحت شريط الحالة عبر `SafeArea`.

### 6.6 قرار Background Modes `audio` و`voip`
- **`remote-notification`**: **إلزامي دائماً** — يفعّل `content-available:1` (إيقاظ صامت لتحديث الصندوق). موجود من الإصدار 1.0.
- **`audio`**: مبرَّر بفئة `AVAudioSessionCategory.playback` (07-sound-system.md §6.8) — يبقي أصوات كونسول المضيف/اللعب مسموعة والتطبيق بالخلفية أو الشاشة مقفلة، ويحل مشكلة مفتاح الصمت. يُضاف مع مرحلة الصوت/المضيف عن بُعد (M5) — **ليس مطلوباً لإصدار القاعة 1.0 إن لم يشغّل تطبيق اللاعب صوتاً بالخلفية**؛ راجع القرار مع 07/31.
- **`voip`**: **قرار مفتوح بحذر.** يلزم لـ RealtimeKit إبقاء اتصال الصوت حياً بالخلفية، **لكن** Apple تشترط أن التطبيقات المعلِنة عن `voip` تستخدم **PushKit + CallKit** لعرض مكالمة نظامية (Guideline)؛ إعلان `voip` بلا CallKit **خطر رفض**. **التوصية:** ابدأ بـ `audio` فقط لصوت RealtimeKit المستمر بالخلفية (كافٍ لمعظم الحالات)؛ لا تُعلن `voip` إلا إن تطلّب SDK ذلك فعلياً **مع** دمج CallKit. يُحسم في spike المرحلة 0 (مخاطرة #1 في الخطة الأم) ويُوثَّق في 31-voice-realtimekit.md.

### 6.7 مخاطر مراجعة App Store — **حرجة، تُعالَج قبل الرفع**

| # | المخاطرة (Guideline) | الوصف | التخفيف الإلزامي |
|---|---|---|---|
| R1 | **إجبار الإشعارات (4.5.4 / 5.1.1)** | بوابة الإشعارات الحاجبة (06 §4.1) تمنع استخدام التطبيق قبل منح إذن Push. Apple: «يجب ألا تكون الإشعارات شرطاً لاستخدام التطبيق». رمز التجاوز 1998 **خاص بـ Android فقط** (لا يظهر على iOS). | **قرار منتج مطلوب قبل أول رفع:** إمّا (أ) إتاحة تجاوز البوابة على iOS للمُراجِع/المستخدم (زر «لاحقاً» يفتح التطبيق بلا إشعارات — يكسر تكافؤ الويب لكنه آمن للمراجعة)، أو (ب) إبقاء الحجب مع شرح مفصّل في App Review Notes أن الإشعار جوهري للّعبة (تنبيه الدور) + الفيديو — مع تقبّل احتمال رفض وجولة استئناف. **التوصية: (أ) على iOS حصراً** لتفادي رفض متكرر. يُحسم ويُوثَّق في 06/92. |
| R2 | **حذف الحساب داخل التطبيق (5.1.1(v))** | التطبيق ينشئ حسابات (هاتف + كلمة مرور). منذ 2022 Apple تُلزم بمسار **حذف حساب** داخل التطبيق لكل تطبيق يتيح إنشاء حساب. | **بند backend إضافي إلزامي للمراجعة** (خامس، خارج الأربعة الأصلية لكنه فرضته Apple): endpoint حذف حساب اللاعب + زر «حذف حسابي» في 13-profile.md. يُرفع للخطة الأم كإضافة معتمدة. بدونه = رفض مؤكد. |
| R3 | **صفحة سياسة خصوصية عاملة (5.1.1)** | حقل Privacy Policy URL إلزامي ويجب أن يفتح صفحة فعلية. | نشر `https://club-mafia.grade.sbs/privacy` (nginx static أو صفحة Next) قبل الرفع — بند نشر مشترك مع 90. |
| R4 | **الوظيفة الدنيا/السياق الفعلي (2.1 / 4.2)** | قد يظن المُراجِع أن التطبيق «فارغ» بلا جلسة لعب فعلية. | الحساب التجريبي يتيح كل الشاشات الثابتة + الفيديو يُظهر جلسة كاملة (§4.3). |
| R5 | **App Privacy (Data collection)** | نموذج App Privacy إلزامي قبل الرفع. | صرّح: **رقم الهاتف، الاسم، الصورة، إحصاءات اللعب، معرّف الجهاز (`mafia_device_id`)، تشخيصات الأعطال (Crashlytics)** — كلها مرتبطة بالهوية (Linked to You)، **لا شيء للتتبّع الإعلاني** (No Tracking، لا IDFA، لا ATT prompt). |

> **Sign in with Apple (4.8):** غير مطلوب — التطبيق لا يوفّر تسجيل دخول اجتماعياً من طرف ثالث (هاتف + كلمة مرور فقط). لا حاجة لإضافته.

### 6.8 إعادة الاتصال/الاستعادة والمؤقتات
هذا ملف إصدار — **لا حالة شبكة ولا مؤقتات مملوكة له**. المهل ذات الصلة (مملوكة لملفاتها): `fetchAndActivate` لـ Remote Config بمهلة 10s و`minimumFetchInterval: 1h` (11)؛ إعادة محاولة `getToken()` على iOS بعد `onTokenRefresh`/تأخير قصير عند «APNs token غير جاهز» (06 §10.9)؛ مهلة تنزيل صورة Notification Service Extension ~5s (06 §10.7).

---

## 7. عقود التكامل

### 7.1 REST
**لا endpoints مملوكة لهذا الملف.** الإشعارات تُسجَّل عبر عقد 06 (`POST /api/player-notifications/register-token`) — يقبل توكن FCM خام للموبايل بلا حاجة تغيير. **الإضافة الوحيدة التي يفرضها هذا الملف** هي endpoint **حذف الحساب** (§6.7-R2) — يُصمَّم في 13-profile.md ويُعتمد كإضافة backend خامسة فرضتها مراجعة Apple.

### 7.2 حمولة APNs على السلك (من `buildFCMPayload` — تم التحقق حرفياً، سطور 99–116)
```jsonc
{
  "apns": {
    "headers": {
      "apns-priority": "10",
      "apns-push-type": "alert",
      "apns-collapse-id": "<type>"        // إشعارات النوع الواحد تستبدل بعضها
    },
    "payload": {
      "aps": {
        "alert": { "title": "...", "body": "..." },  // النظام يعرضه بنفسه
        "badge": 1,                        // ثابتة — تُصفَّر عند open/resume (06 §6.5)
        "sound": "default",
        "mutable-content": 1,              // يمكّن Notification Service Extension (الصور)
        "content-available": 1             // إيقاظ صامت لتحديث الصندوق
      }
    }
  },
  "data": { "type", "title", "body", "tag", "url", ... }  // يصل هاندلرات Flutter (كلها strings)
}
```
- **لا تغيير على الخادم.** كتلة `apns` مكتملة أصلاً؛ iOS يعرض من `aps.alert` مباشرةً.
- `mutable-content:1` جاهزة → إن أُضيف Notification Service Extension (§10) تعمل الصور الكبيرة بلا تعديل backend.

### 7.3 Firebase Remote Config (بوابة الإصدار — مملوك لـ 11، مفاتيح iOS هنا)
| المفتاح | النوع | الاستخدام على iOS |
|---|---|---|
| `min_supported_build_ios` | int | `CFBundleVersion (buildNumber) < القيمة` → شاشة تحديث إجبارية |
| `latest_build_ios` | int | `min ≤ build < latest` → بانر تحديث اختياري |
| `store_url_ios` | string | `https://apps.apple.com/app/id<APP_ID>` — وجهة زر التحديث |

### 7.4 ملف Universal Links (متطلب خادم — المحتوى في 08 §7.5-ب)
- `https://club-mafia.grade.sbs/.well-known/apple-app-site-association` (وأيضاً بلا `.well-known` على المسار الجذر احتياطاً — Apple تقبل الاثنين، والأفضل `/.well-known/`).
- `appIDs`: `["<TEAMID>.sbs.grade.mafiaclub"]` — **`<TEAMID>` من §6.1**.
- `components`: `[{ "/": "/join/*" }]` — **`/join/*` فقط** (لا `/player/*` كي لا يخطف التطبيق روابط الـ PWA — قرار الخطة الأم مخاطرة #8).
- يُقدَّم HTTP 200، `Content-Type: application/json`، **بلا redirect**، **بلا امتداد**، أصغر من 128KB. (مقتطف nginx في 08 §7.5-ج.)
- **staging**: ملف مماثل على `mafia.grade.sbs` بـ `appIDs: ["<TEAMID>.sbs.grade.mafiaclub.dev"]` لاختبار App Links على flavor dev.

### 7.5 Socket
**لا أحداث Socket.IO لهذا الملف** — الإصدار عملية بناء/توزيع لا شبكة حيّة.

### 7.6 App Store Connect API Key (توقيع Codemagic — **مختلف عن مفتاح APNs**)
- ⚠️ **تمييز حاسم:** هذا مفتاح `.p8` **ثانٍ ومختلف تماماً** عن مفتاح APNs في §6.3. يُنشأ من مكان آخر ولغرض آخر.
- App Store Connect → **Users and Access → Integrations → App Store Connect API → «+»**:
  - Role: **App Manager** (أو Admin).
  - نزّل `AuthKey_YYYYYYYYYY.p8` (مرة واحدة)، ودوّن **Key ID** و**Issuer ID** (UUID).
- يُحقن في Codemagic (Issuer ID + Key ID + محتوى `.p8`) لأتمتة التوقيع (Automatic code signing) والرفع إلى TestFlight/App Store.

---

## 8. نماذج Dart المطلوبة

**لا نماذج Dart جديدة مملوكة لهذا الملف** — الإصدار بنية بناء/توزيع، لا بيانات وقت تشغيل. المراجع (كلها مملوكة لملفاتها):
- `VersionGateResult` (`forceUpdate`, `optionalUpdate`, `minSupportedBuild`, `latestBuild`, `storeUrl`) — 11-shell-navigation.md.
- `PushPayloadData` / `PlayerNotification` — 06-push-notifications.md.
- `AppConfig` (ثوابت flavor: `baseUrl`, `bundleId`, `appHost`) — 01-foundation-theme.md.

**ثوابت بناء خاصة بـ iOS (تُعرَّف في تهيئة flavor، ليست نماذج بيانات):**
```dart
// مرجعية فقط — التعريف الفعلي في 01-foundation-theme.md
abstract class IosBuildConfig {
  static const bundleIdProd = 'sbs.grade.mafiaclub';
  static const bundleIdDev  = 'sbs.grade.mafiaclub.dev';
  static const associatedDomainProd = 'applinks:club-mafia.grade.sbs';
  static const associatedDomainDev  = 'applinks:mafia.grade.sbs';
  static const minIosVersion = '13.0';   // Podfile platform :ios, '13.0'
}
```

---

## 9. الحزم المستخدمة

| الأداة/الحزمة | الغرض في مسار iOS |
|---|---|
| **Codemagic** (خدمة CI، ليست حزمة) | البناء على macOS سحابياً بلا Mac + توقيع تلقائي + رفع TestFlight |
| `flutter_launcher_icons` | توليد `AppIcon.appiconset` من `mafia_logo` (مسطّح، بلا شفافية) |
| `flutter_native_splash` | `LaunchScreen.storyboard` بخلفية `#050505` وشعار متمركز |
| `firebase_core` / `firebase_messaging` | تهيئة Firebase + استقبال APNs عبر FCM (CocoaPods) |
| `firebase_remote_config` | بوابة الإصدار (`min_supported_build_ios`) |
| `firebase_crashlytics` | تتبّع الأعطال (dSYM يُرفع عبر Codemagic) |
| `app_badge_plus` | تصفير badge iOS عند open/resume |
| `permission_handler` | `openAppSettings()` في بوابة الرفض (06) |
| `url_launcher` | فتح `store_url_ios` + الروابط الخارجية |
| `package_info_plus` | `CFBundleVersion (buildNumber)` لمقارنة بوابة الإصدار |
| **Notification Service Extension** (target Swift أصلي — اختياري M2+) | الصور الكبيرة في إشعارات iOS (`mutable-content:1`) — 06 §10.7 |
| `cocoapods` (أداة نظام على runner) | إدارة اعتماديات iOS الأصلية (يديرها Codemagic) |

---

## 10. اختلافات Android / iOS

**هذا الملف بأكمله خاص بـ iOS**؛ النظير على Android في `90-release-android.md`. أبرز الفروق التي تحكم قرارات الإصدار:

| المجال | Android (90) | iOS (هذا الملف) |
|---|---|---|
| **الحساب/الرسوم** | Google Play Console — **25$ مرة واحدة** | Apple Developer — **99$/سنة** (يتجدد؛ ابدأه أولاً) |
| **البناء بلا جهاز الشركة** | Gradle على أي منصة | **يتطلب macOS** → Codemagic (سحابي) |
| **التوقيع** | upload keystore + Play App Signing | App Store Connect API Key (`.p8`) + توقيع تلقائي؛ Provisioning Profiles تُدار سحابياً |
| **الإشعارات** | `google-services.json` + قناة `mafia_default` + عرض data-only محلي + أيقونة monochrome + accent `#8A0303` | مفتاح **APNs `.p8`** في Firebase + `aps.alert` يعرضه النظام + **لا أيقونة صغيرة ولا قناة** + `foregroundPresentationOptions(false,false,false)` |
| **الروابط العميقة** | App Links + `assetlinks.json` + `autoVerify` + بصمات SHA-256 | Universal Links + `apple-app-site-association` + Associated Domains + Team ID؛ **كتابة الرابط يدوياً في Safari لا تفتح التطبيق** (قيد نظام — 08 §10) |
| **الخلفية** | (اختياري) foreground service للصوت | Background Modes `remote-notification` (إلزامي) + `audio` + قرار `voip`/CallKit |
| **badge** | نقاط launcher تلقائية حسب OEM | `badge:1` من الخادم + تصفير يدوي عند open/resume |
| **الصور الكبيرة** | `BigPictureStyle` مجاناً من اليوم الأول | تتطلب **Notification Service Extension** (Swift) — مرحلة اختيارية |
| **بوابة «غير مدعوم» + رمز 1998** | ممكنة (أجهزة بلا Google Play) | **مستحيلة** — لا تظهر أبداً على iOS |
| **حذف الحساب** | مستحسن | **إلزامي للمراجعة** (5.1.1(v)) — §6.7-R2 |
| **إجبار الإشعارات** | مقبول (البوابة + رمز 1998) | **خطر رفض (4.5.4)** — قرار تجاوز iOS §6.7-R1 |
| **التوزيع التجريبي** | Internal testing / Closed track (بلا مراجعة داخلية) | TestFlight: داخلي بلا مراجعة، خارجي بـ **Beta App Review** |
| **الإطلاق التدريجي** | Staged rollout بنِسب مئوية | **Phased Release** آلي على 7 أيام |
| **امتثال التصدير** | لا مطالبة | `ITSAppUsesNonExemptEncryption=NO` لتخطّي المطالبة كل بناء |

---

## 11. الأصول المطلوبة

| الأصل | المواصفات | المصدر/الاستخدام |
|---|---|---|
| **App Icon** | **1024×1024 PNG، بلا قناة ألفا، بلا شفافية، بلا زوايا مدوّرة** (Apple تدوّرها) | من `frontend/public/mafia_logo.png` — **مسطّح على خلفية معتمة** (`#050505` أو الأحمر القاني `#8A0303`) قبل التوليد عبر `flutter_launcher_icons` (`remove_alpha_ios: true`) |
| **مجموعة أيقونات التطبيق** | كل مقاسات `AppIcon.appiconset` (20pt→1024pt، iPhone+iPad+App Store) | يولّدها `flutter_launcher_icons` تلقائياً |
| **Launch Screen** | خلفية `#050505` + شعار متمركز | `flutter_native_splash` → `LaunchScreen.storyboard` |
| **لقطات iPhone 6.7"** | 1290×2796 portrait، 3–10 لقطات | من جهاز/محاكي حقيقي بعد تكيّف §5 |
| **لقطات iPad 12.9"/13"** | 2048×2732 portrait، 3–10 لقطات | إلزامية (Universal) |
| **فيديو App Review** | `.mp4` 30–90s، جلسة لعب كاملة | مرفق App Review Information (§4.3) |
| **صفحة سياسة الخصوصية** | HTML على `club-mafia.grade.sbs/privacy` | خارج bundle — بند نشر §6.7-R3 |
| **ملف AASA** | `apple-app-site-association` (بلا امتداد) | على nginx — 08 §7.5-ب |

- **لا أيقونة إشعار صغيرة على iOS** (خلاف Android `ic_stat_mafia`) — النظام يستخدم أيقونة التطبيق.
- **لا أصوات مخصّصة** للإشعار (`sound:'default'`)؛ صوت `.caf` مخصّص يتطلب تضمينه + تغيير قيمة backend (غير مطلوب للتكافؤ — 06 §10.5).
- الخطوط العربية (Cairo/Tajawal/Amiri/Noto Kufi/Reem Kufi) تُضمَّن كـ assets عبر الثيم (01) — لا تخصيص iOS إضافي.

---

## 12. معايير القبول — checklist تكافؤ وإطلاق

**الحساب والهوية:**
- [ ] حساب Apple Developer مُفعّل ومدفوع؛ Team ID موثّق.
- [ ] Bundle ID `sbs.grade.mafiaclub` مسجّل بقدرات Push + Associated Domains؛ flavor dev = `.dev`.
- [ ] `GoogleService-Info.plist` (prod + dev) في المشروع وخارج git.

**الإشعارات (APNs):**
- [ ] مفتاح APNs `.p8` مرفوع في Firebase (`mafia-b1c74`) مع Key ID + Team ID.
- [ ] على iPhone **حقيقي** (لا محاكي): منح الإذن → يُصدَر توكن FCM → يُسجَّل عبر `register-token` → إشعار اختباري يصل ويُعرض من النظام بصوت default وbadge=1.
- [ ] foreground: **لا** banner (`presentationOptions` كلها false)، والصندوق يُعاد جلبه (19).
- [ ] نقر إشعار `room_invite` والتطبيق مقتول → بعد الإقلاع وحسم الجلسة يهبط على `/player/join?...&invite=1&by=...` (تكافؤ `/__pending_nav`).
- [ ] فتح التطبيق/resume يصفّر badge الأيقونة.

**القدرات والاتجاه:**
- [ ] Background Modes تحوي `remote-notification` (+ `audio` عند M5)؛ `voip` غائب ما لم يُدمج CallKit.
- [ ] التطبيق portrait-only على iPhone وiPad، `UIRequiresFullScreen=YES`، بلا حواف سوداء على iPad.
- [ ] أوصاف الأذونات العربية تظهر حرفياً في حوارات النظام؛ لا مفتاح ميكروفون/كاميرا في إصدار 1.0 القاعة.

**Universal Links:**
- [ ] `apple-app-site-association` يُخدم 200 JSON بلا redirect بلا امتداد على `club-mafia.grade.sbs`.
- [ ] رابط `https://club-mafia.grade.sbs/join/XXXX` من واتساب/الرسائل/QR يفتح **التطبيق** مباشرة (لا Safari) على جهاز مثبَّت؛ ويفتح الـ PWA على جهاز بلا تطبيق.
- [ ] `applinks:club-mafia.grade.sbs` في Entitlements ومطابق لـ appID في AASA.

**البناء والتوزيع:**
- [ ] `codemagic.yaml` يبني `.ipa` موقّعاً تلقائياً ويرفعه إلى TestFlight دون تدخّل يدوي.
- [ ] `CFBundleVersion` عدد صحيح تصاعدي يطابق `min_supported_build_ios` منطقياً؛ `ITSAppUsesNonExemptEncryption=NO` (لا مطالبة امتثال تصدير).
- [ ] بناء داخلي على TestFlight يعمل على جهاز مختبِر حقيقي (كل المزايا الثابتة + وصول الإشعار).
- [ ] بوابة الإصدار: build أقل من `min_supported_build_ios` تعرض شاشة `تحديث جديد إلزامي! ⬆️` غير قابلة للإغلاق، وزرها يفتح `store_url_ios` على App Store.

**المراجعة (مخاطر §6.7):**
- [ ] قرار تجاوز بوابة الإشعارات على iOS مُعتمَد ومطبَّق (R1).
- [ ] مسار «حذف حسابي» داخل التطبيق يعمل (endpoint backend) (R2).
- [ ] صفحة الخصوصية منشورة وتفتح من رابط App Store Connect (R3).
- [ ] حساب تجريبي + فيديو مرفقان في App Review Information (R4).
- [ ] نموذج App Privacy مكتمل: هاتف/اسم/صورة/إحصاءات/معرّف جهاز/تشخيصات = Linked، No Tracking (R5).
- [ ] صفحة المنتج: اسم/وصف/كلمات عربية، لقطات iPhone 6.7 + iPad 12.9، تصنيف 12+، فئة Games/Board.

---

## 13. ملاحظات أداء وأمان

**أمان الأسرار (حرج):**
- **مفتاحا `.p8` مختلفان** — APNs (Firebase) و App Store Connect API (Codemagic) — كلاهما **لا يُلتزم في git إطلاقاً**؛ يُحفظان في خزنة أسرار + كمتغيّرات بيئة مشفّرة في Codemagic. تنزيلهما لمرة واحدة → فقدهما يعني إعادة إنشاء.
- `GoogleService-Info.plist` خارج git (يُحقن base64 وقت البناء)؛ ليس سرّاً بالغاً لكنه يخص المشروع.
- **بيانات الحساب التجريبي** (هاتف/كلمة مرور المُراجِع): حساب مخصّص محدود الصلاحيات، كلمة مروره تُدوَّر بعد كل مراجعة كبرى؛ لا يملك صلاحيات موظّف/ليدر (staffToken غير ممنوح — تكافؤ قرار الخطة الأم مخاطرة #4).
- **توكن FCM** يُرسل عبر HTTPS بترويسة Bearer فقط؛ لا يُطبع كاملاً في سجلات الإنتاج (06 §13). Crashlytics **لا يُسجّل** التوكنات ولا JWT.
- **بيئة APNs**: مفتاح `.p8` يخدم Sandbox وProduction؛ تأكّد أن `aps-environment` = `production` في بناء التوزيع (Xcode/CI يبدّلها) وإلا لا تصل إشعارات التطبيق المنشور رغم عملها في التطوير — خطأ صامت شائع، أدرجه في فحص القبول.

**أداء:**
- **زمن معالجة TestFlight**: كل بناء يمرّ بمعالجة Apple (دقائق→ساعة)؛ خطّط له في جدول الإطلاق (M6). Beta App Review للمختبرين الخارجيين قد يأخذ يوماً.
- **حجم الحزمة**: الخطوط العربية الخمسة أثقل أصل مضمّن؛ فعّل App Thinning (تلقائي عبر App Store) وتجنّب تضمين أوزان خطوط غير مستخدمة.
- **dSYM/Crashlytics**: أعدّ Codemagic لرفع dSYM تلقائياً بعد البناء لفكّ رموز الأعطال (Bitcode معطّل افتراضياً في Flutter الحديث).
- **Notification Service Extension** (إن أُضيف): ميزانية زمنية/ذاكرة ضيّقة جداً من النظام (~24MB، ~30s)؛ مهلة تنزيل الصورة ≤5s وfail-open (إشعار بلا صورة) — لا تُسقط الإشعار (06 §10.7).
- **`content-available:1`**: iOS يخنق الإيقاظات الصامتة المتكررة (rate-limit نظامي)؛ لا تعتمد عليه للتسليم الفوري — التسليم المرئي يعتمد على `apns-priority:10` + `aps.alert`. لا polling بالخلفية إطلاقاً (البطارية) — polling الصندوق foreground فقط (19).

**قيود موثّقة (تُرحَّل إلى 92-qa-parity.md):**
- كتابة رابط `/join/` يدوياً في Safari على نفس الدومين لا تفتح التطبيق (قيد نظام iOS — 08 §10.5)؛ الفتح يعمل من الرسائل/واتساب/الكاميرا/تطبيقات أخرى.
- تحديث Apple لكاش AASA قد يتأخر ساعات بعد التثبيت؛ للتطوير استخدم `applinks:club-mafia.grade.sbs?mode=developer` مع Developer Mode (08 §10.4).
- توكن APNs غير جاهز فور `getToken()` أحياناً على iOS → إعادة محاولة بعد `onTokenRefresh` أو تأخير قصير (06 §10.9).

---

## ملحق أ — `codemagic.yaml` (البناء والرفع بلا Mac)

```yaml
workflows:
  ios-release:
    name: Mafia Club iOS Release
    instance_type: mac_mini_m2
    max_build_duration: 60
    integrations:
      app_store_connect: MafiaClubASCKey     # مفتاح API (.p8) مضاف في إعدادات Codemagic
    environment:
      ios_signing:
        distribution_type: app_store          # توقيع تلقائي عبر ASC API key
        bundle_identifier: sbs.grade.mafiaclub
      groups:
        - firebase_ios                        # يحوي GoogleService-Info.plist (base64)
      vars:
        APP_STORE_APPLE_ID: <رقم Apple ID للتطبيق بعد إنشائه في ASC>
      flutter: stable
      xcode: latest
      cocoapods: default
    scripts:
      - name: كتابة GoogleService-Info.plist من السرّ
        script: |
          echo $GOOGLE_SERVICE_INFO_PLIST_BASE64 | base64 --decode > ios/Runner/GoogleService-Info.plist
      - name: Flutter pub get
        script: flutter pub get
      - name: تثبيت pods
        script: |
          find . -name "Podfile" -execdir pod install \;
      - name: بناء IPA للإصدار (flavor prod)
        script: |
          flutter build ipa --release \
            --flavor prod -t lib/main_prod.dart \
            --export-options-plist=/Users/builder/export_options.plist
    artifacts:
      - build/ios/ipa/*.ipa
      - /tmp/xcodebuild_logs/*.log
      - flutter_drive.log
    publishing:
      app_store_connect:
        auth: integration
        submit_to_testflight: true            # رفع تلقائي إلى TestFlight
        beta_groups:
          - Internal Testers
        # submit_to_app_store: false          # فعّلها للنشر النهائي بعد اجتياز TestFlight
```

> ملاحظات: `MafiaClubASCKey` = مفتاح App Store Connect API (§7.6) المضاف في Codemagic → Teams/App settings → Integrations. `GOOGLE_SERVICE_INFO_PLIST_BASE64` متغيّر مشفّر في مجموعة `firebase_ios`. التوقيع «تلقائي» — Codemagic يولّد/يجلب Provisioning Profiles عبر مفتاح API بلا رفع يدوي لأي شهادة `.p12`.

---

## ملحق ب — تسلسل أول رفع (Runbook مختصر)

1. **الآن:** افتح حساب Apple Developer (§6.1) — لا تنتظر باقي البنود.
2. بالتوازي: جهّز `mafia_logo` المسطّح، الأيقونات، Launch Screen، صفحة الخصوصية، endpoint حذف الحساب.
3. بعد تفعيل الحساب: Bundle ID + Capabilities (§6.2) → مفتاح APNs → Firebase (§6.3) → تسجيل تطبيق iOS + plist (§6.4).
4. أنشئ التطبيق في App Store Connect (Apps → «+») بنفس Bundle ID → دوّن **Apple ID الرقمي** (يدخل `store_url_ios` وCodemagic).
5. مفتاح ASC API (§7.6) → Codemagic → أول بناء → TestFlight داخلي.
6. اختبار داخلي على أجهزة حقيقية (كل بنود §12) → أصلح → رفع بناء أعلى.
7. انشر AASA (08) + فعّل Associated Domains → اختبر Universal Link (§12).
8. عبّئ صفحة المنتج + App Privacy + App Review Info + الفيديو (§4، §6.7) → Submit for Review.
9. بعد الموافقة: **Phased Release** (7 أيام) + عبّئ `store_url_ios`/`min_supported_build_ios` في Remote Config.
