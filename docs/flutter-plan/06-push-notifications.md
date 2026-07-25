# 06 — الإشعارات: FCM، القنوات، النقر والتوجيه، الأذونات

> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

---

## 1. الهدف والنطاق

بناء خط أنابيب الإشعارات الفورية للتطبيق الأصلي (Android + iOS) كبديل كامل لخط الأنابيب المزدوج في الـ PWA (FCM web + raw Web Push)، مع الحفاظ على **عقد الـ backend كما هو دون أي تغيير**.

**داخل النطاق:**
- تهيئة `firebase_messaging` وتسجيل توكن FCM لدى السيرفر (`POST /api/player-notifications/register-token`) ودورة حياته الكاملة (تسجيل، تجديد، إعادة تسجيل عند تبديل الحساب).
- قناة إشعارات Android (`mafia_default`) وعرض رسائل الـ data-only محلياً عبر `flutter_local_notifications`.
- استقبال iOS عبر APNs من خلال FCM (الـ backend يرسل `aps.alert` جاهزاً — النظام يعرض بنفسه).
- التوجيه العميق عند النقر على الإشعار في الحالات الثلاث: cold start / background / foreground — بديل حيلة `/__pending_nav` في الـ PWA.
- **بوابات الأذونات الحاجبة** (prompt / denied / unsupported) — النسخة الأصلية البديلة لبوابات الـ PWA ملء الشاشة، بنصوصها الحرفية، مع سلوك native جديد محدد أدناه.
- رمز تجاوز «غير مدعوم» **1998** (يُعاد توظيفه لأجهزة Android بلا خدمات Google Play).
- شاشة التشخيص المخفية (منفذ native لصفحة `/player/debug-push`).
- badge على iOS، صوت الإشعار، الاهتزاز، الصورة الكبيرة (BigPicture).

**خارج النطاق (ملفات أخرى):**
- واجهة جرس الإشعارات وصندوق الوارد والمودال الغني → `19-notifications-inbox.md` (هذا الملف يوفر لها: حالة الإذن، مشغّل إعادة الجلب عند وصول رسالة foreground، وعقد REST للصندوق).
- تنفيذ شاشات الوجهات (Join/Games/Feedback/Order) → ملفاتها؛ وخريطة المسارات المركزية → `08-deeplinks-routing.md`.
- إعدادات Firebase على مستوى المشروع (google-services.json / GoogleService-Info.plist / مفتاح APNs) → `90-release-android.md` و`91-release-ios.md`.

**يُحذف نهائياً من الويب ولا يُنقل** (كله workarounds لثغرات منصة الويب):
- فرع `WEBPUSH::` بالكامل، مفاتيح VAPID، `GET /api/push/vapid-public-key`، حدث `pushsubscriptionchange`، منطق «الاشتراك الحي أقوى من الإذن» على iOS.
- Service Worker كاملاً (`sw.js`, `firebase-messaging-sw.js`)، مخزن auth داخل الـ SW (cache `mafia-auth` بمفاتيح `/__player_token`, `/__device_id`, `/__pending_nav`)، رسائل `SET_AUTH_TOKEN` و`PUSH_RECEIVED` postMessage.
- `manifest.json`، سكربت cache-nuke (`mafia_app_version` = '2.5.0')، بوابة تثبيت iOS (`needsInstall`).
- حارس التركيب الثلاثي (`autoRegisterInFlight`/`autoRegisteredForToken`) — في Flutter توجد خدمة واحدة singleton.
- workaround `localStorage.push_notifications_enabled` (حالة الإذن الأصلية موثوقة؛ يبقى كاش اختياري للعرض الفوري فقط).

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

| الملف | ماذا يحوي |
|---|---|
| `unified-mafia/frontend/src/hooks/usePushNotifications.ts` | آلة حالة الإذن (`prompt/granted/denied/unsupported`)، auto-register الصامت، polling الصندوق 60s |
| `unified-mafia/frontend/src/lib/firebase.ts` | استراتيجية الحصول على التوكن (FCM ثم Web Push خام)، `onForegroundMessage` |
| `unified-mafia/frontend/public/sw.js` | `resolveNotificationUrl` (النسخة المرجعية الأشمل)، `notificationclick`، منطق منع التكرار، `/__pending_nav` |
| `unified-mafia/frontend/src/app/player/layout.tsx` (سطور 178–393) | **البوابات الحاجبة الأربع بنصوصها الحرفية** + رمز التجاوز 1998 + استهلاك `/__pending_nav` (سطور 113–136) + شاشة التحميل |
| `unified-mafia/frontend/src/components/NotificationBell.tsx` | لافتات الإذن داخل الـ dropdown (نصوصها هنا؛ الـ UI في ملف 19) |
| `unified-mafia/frontend/src/app/player/debug-push/page.tsx` | صفحة التشخيص ذات الست خطوات |
| `unified-mafia/backend/src/routes/player-notification.routes.ts` | REST: register-token، الصندوق، unread-count، read/read-all/delete (تم التحقق منه حرفياً) |
| `unified-mafia/backend/src/services/fcm.service.ts` (سطور 65–166) | `buildFCMPayload` (شكل الرسالة على السلك: data + webpush + **apns**) و`registerPlayerToken` (منطق dedup بالـ deviceId عبر قفل استشاري) |
| `unified-mafia/backend/src/index.ts` (سطور 156، 179) | mount: `/api/player-notifications` و`/api/push/vapid-public-key` |

---

## 3. التبعيات على ملفات الخطة الأخرى

- **01-foundation-theme.md** — ألوان Dark Noir، خطوط Tajawal/Amiri، أنيميشن `fade-in-up`/`pulse-slow`، نمط gate-modal.
- **02-models-data-layer.md** — نموذج `PlayerNotification` وقاعدة تحويل JSON.
- **03-networking-rest.md** — عميل REST، base URL، حقن `Authorization: Bearer`، مهلات القياسية.
- **05-session-auth.md** — توكن اللاعب، حدث «auth جاهز» (بوابة تأجيل التنقل العميق)، إعادة تسجيل التوكن بعد login/تبديل حساب.
- **08-deeplinks-routing.md** — خريطة المسارات الداخلية و`DeepLinkService` (الخدمة القانونية للتوجيه) التي تغذّيها مصادر النقر هنا.
- **11-shell-navigation.md** — موضع البوابات الحاجبة فوق الـ shell، والصفحات العامة المستثناة.
- **19-notifications-inbox.md** — مستهلك حالة الإذن ومشغّلات إعادة الجلب (foreground message / resume).
- **90-release-android.md / 91-release-ios.md** — google-services.json، مفتاح APNs، القدرات (Push Notifications, Background Modes)، أيقونة الإشعار monochrome.
- **92-qa-parity.md** — بنود القبول في §12 تُرحَّل إليه.

---

## 4. الواجهة والتجربة تفصيلياً

> كل البوابات أدناه: ملء شاشة فوق كل شيء (في الويب `z-[99999]`)، خلفية `#050505`، `dir=rtl`، بطاقة مركزية بعرض أقصى 448dp (`max-w-md`)، خلفية البطاقة `#0C0C0C` بشفافية 90% + backdrop-blur قوي (في Flutter: يجوز استبدال الـ blur بخلفية `#0C0C0C` معتمة — الـ blur مكلف على Android الضعيف والخلف أسود صرف أصلاً)، زوايا 24 (`rounded-3xl`)، padding 24 (و32 عند medium/expanded)، محاذاة مركزية، فجوة عمودية 24 بين المقاطع، دخول بأنيميشن `fade-in-up` (انزلاق من y+20 إلى 0 مع fade، مدة 0.5s).

### 4.1 بوابة طلب الإذن الحاجبة (prompt) — «ما يستبدل بوابة الـ PWA»

**في الـ PWA**: عند `permissionState === 'prompt'` تُحجب كل صفحات اللاعب المصادَق عليها (عدا login) خلف شاشة ملء الشاشة حتى يمنح الإذن. **في Flutter تبقى بوابة حاجبة بنفس الفلسفة والنصوص**، لكن آلية القبول تصبح native:
- Android 13+ (API 33): زر التفعيل يستدعي `FirebaseMessaging.instance.requestPermission()` → حوار `POST_NOTIFICATIONS` النظامي.
- Android 12 وأدنى: الإذن ممنوح افتراضياً → الحالة الأولية `granted` → **البوابة لا تظهر إطلاقاً**.
- iOS: حوار APNs النظامي (`alert + badge + sound`، بلا provisional — نريد قراراً صريحاً كما في الويب).

**التخطيط والنصوص (حرفياً من `player/layout.tsx`):**
- حد البطاقة: `#F59E0B` بشفافية 20%؛ ظل `0 0 50px rgba(245,158,11,0.15)`.
- أيقونة علوية: دائرة 80×80، خلفية `#F59E0B` بشفافية 10%، حد `#F59E0B` بشفافية 30%، ظل داخلي `inset 0 0 20px rgba(245,158,11,0.1)`؛ بداخلها أيقونة جرس (SVG stroke بلون `#F59E0B`، 40×40، سماكة 1.5) بأنيميشن bounce (1s لانهائي)؛ حولها حلقة ping (حد `#F59E0B` بشفافية 20%، opacity 0.3، توسّع لانهائي 1s).
- العنوان: **«تفعيل الإشعارات الفورية 🔔»** — أبيض، 24px، عريض.
- النص: **«تتطلب لعبة مافيا تفعيل الإشعارات الفورية لتنبيهك بدورك الفوري أثناء اللعب. لن تتمكن من المتابعة بدون تفعيلها لضمان سرعة اللعبة وحماسها للجميع.»** — `#9CA3AF`، 14px، lineHeight 1.625.
- زر CTA بعرض كامل: padding 16 عمودي / 24 أفقي، زوايا 16 (`rounded-2xl`)، تدرّج `linear-gradient(to left, #F59E0B, #CA8A04)` (amber-500→yellow-600؛ عند الضغط يغمق إلى `#D97706→#A16207`)، نص أسود عريض، ظل `0 4px 20px rgba(245,158,11,0.3)` (يقوى إلى `0 4px 30px rgba(245,158,11,0.5)` عند الضغط)، ضغطة = scale 0.95، انتقالات 300ms:
  - الحالة العادية: **«تفعيل الآن وسماح ⚡»**
  - أثناء الطلب (معطّل، opacity 0.5): spinner دائري 20×20 (حد 2px أسود بقمة شفافة، دوران 1s) + **«جاري التفعيل...»**
- caption أسفل الزر: 12px بلون `#6B7280`: **«عند الضغط، سيظهر لك طلب النظام، يرجى اختيار "سماح" (Allow).»**
  - ⚠️ *تعديل نصي وحيد ومسموح*: الأصل في الويب «سيظهر لك طلب **المتصفح** النظامي» — تُحذف كلمة «المتصفح» فقط. باقي الجملة حرفية بما فيها «"سماح" (Allow)» بلون `#F59E0B` semibold.
- رابط سفلي: **«🔧 صفحة تشخيص الإشعارات»** — 10px، `#4B5563`، underline، يتلوّن `#F59E0B` عند الضغط → يفتح شاشة التشخيص (§4.6).

**السلوك بعد الحوار النظامي:**
- سماح → `granted` → تسجيل التوكن (§6.2) → البوابة تختفي فوراً (بلا reload — تحسين عن الويب) ويظهر المحتوى المحجوب خلفها.
- رفض → `denied` → الانتقال مباشرة لبوابة الرفض (§4.2).
- إغلاق الحوار بلا قرار (Android يسمح بذلك) → تبقى الحالة `prompt` والبوابة قائمة، والزر قابل للضغط مجدداً.

### 4.2 بوابة الرفض (denied)

- حد البطاقة: `#EF4444` بشفافية 20%؛ ظل `0 0 50px rgba(239,68,68,0.1)`.
- أيقونة: دائرة 80×80 بخلفية `#EF4444` 10% وحد `#EF4444` 30%، بداخلها درع تحذير SVG بلون `#EF4444` 40×40 بأنيميشن pulse (2s).
- العنوان: **«الإشعارات محظورة بالخطأ! ⚠️»** — `#EF4444`، 24px، عريض.
- النص: **«لقد قمت برفض إذن الإشعارات مسبقاً. لا يمكنك اللعب أو تلقي دورك الفوري بدونها. يرجى إعادة تفعيلها باتباع الخطوات التالية:»** — `#9CA3AF`، 14px.
- صندوق الخطوات: خلفية `#121212` بشفافية 80%، حد أبيض 5%، padding 20، زوايا 16، نص 12px بلون `#D1D5DB`، فجوة 12 بين الأسطر؛ أرقام الخطوات دوائر 20×20 (خلفية `#EF4444` 10%، حد `#EF4444` 30%، رقم `#EF4444` عريض):
  1. *(معدّلة — الأصل خاص بالمتصفح: «انقر على رمز القفل 🔒 أو الإعدادات في شريط عنوان المتصفح بالأعلى.»)* → النص الجديد: **«اضغط زر "فتح إعدادات التطبيق" بالأسفل.»**
  2. حرفياً: **«ابحث عن خيار "الإشعارات" (Notifications).»** — كلمة «الإشعارات» بلون `#EF4444` semibold.
  3. حرفياً: **«قم بتغيير الإذن إلى "سماح" (Allow).»** — كلمة «سماح» بلون `#22C55E` semibold.
- **زر جديد أساسي** (لا مكافئ ويب — الميزة الأصلية تتيحه): بعرض كامل بنفس نمط CTA العنبري في §4.1، نص: **«فتح إعدادات التطبيق ⚙️»** → يستدعي `openAppSettings()` من `permission_handler`.
- زر ثانوي بعرض كامل: خلفية بيضاء 10% (تضيء 15% عند الضغط)، حد أبيض 10%، زوايا 16، نص أبيض semibold: **«إعادة التحقق 🔄»**
  - ⚠️ *تعديل نصي مسموح*: الأصل «تحديث **الصفحة** وإعادة التحقق 🔄» — تُحذف «تحديث الصفحة و» لأنها web-speak؛ الزر يعيد قراءة `getNotificationSettings()` فوراً.
- رابط **«🔧 صفحة تشخيص الإشعارات»** كما في §4.1.
- **سلوك native جديد**: عند العودة من الإعدادات (lifecycle resume) يُعاد فحص الإذن تلقائياً — إن أصبح `granted` تختفي البوابة **دون أي ضغطة** (الويب كان يتطلب reload يدوياً).

### 4.3 بوابة «غير مدعوم» + رمز التجاوز 1998

**إعادة توظيف**: في الويب تظهر عند غياب Notification API (متصفحات قديمة). في Flutter تظهر **فقط على Android بلا خدمات Google Play** (أجهزة Huawei ونحوها، أو فشل `getToken` النهائي بسبب `SERVICE_NOT_AVAILABLE` المتكرر). على iOS لا تظهر أبداً.

- حد البطاقة: `#3B82F6` بشفافية 20%؛ ظل `0 0 50px rgba(59,130,246,0.1)`.
- أيقونة: دائرة 80×80 بخلفية `#3B82F6` 10% وحد 30%، كرة أرضية SVG `#3B82F6` 40×40 (ساكنة).
- العنوان: **«الإشعارات غير مدعومة على جهازك 🌐»** — أبيض 24px عريض.
  - ⚠️ *تعديل نصي مسموح*: الأصل «**المتصفح** غير مدعوم 🌐».
- النص: **«جهازك الحالي لا يدعم الإشعارات الفورية المطلوبة لتنبيهك بدورك الفوري أثناء اللعب.»** — `#9CA3AF` 14px.
  - ⚠️ *تعديل نصي مسموح*: الأصل «متصفحك الحالي لا يدعم إشعارات الويب المطلوبة...».
- *(يُحذف)* صندوق «يرجى فتح اللعبة باستخدام متصفح حديث... Google Chrome أو Safari...» — لا معنى له native. بديله صندوق بنفس النمط (خلفية `#121212` 80%، حد أبيض 5%، padding 16، زوايا 16، نص 12px `#D1D5DB`): **«يتطلب هذا الجهاز خدمات Google Play لتلقي الإشعارات. يمكنك المتابعة بدون إشعارات عبر رمز التجاوز أدناه.»**
- زر: خلفية بيضاء 10%، نص أبيض semibold، بعرض كامل، زوايا 16: **«إعادة المحاولة 🔄»** (⚠️ الأصل: «تحديث الصفحة 🔄») → يعيد محاولة `getToken()`.
- **قسم التجاوز** (تحت خط فاصل أبيض 10%، padding-top 16):
  - نص حرفي: **«جهازك قديم ولا يدعم الإشعارات؟ أدخل رمز التجاوز للمتابعة بدون إشعارات:»** — `#9CA3AF`، 12px.
  - صف: حقل إدخال (flex 1، نص مركزي، تباعد أحرف 0.5em — *أرقام لاتينية فلا يكسر العربية*، padding عمودي 12، زوايا 12، خلفية `#121212`، حد أبيض 10% يتحول `#F59E0B` بشفافية 50% عند التركيز، نص أبيض 18px، placeholder **«••••»**، `keyboardType: number`، حد أقصى 4 أرقام، تنقية غير الأرقام، تسمية وصولية **«رمز التجاوز»**) + زر **«دخول»** (padding أفقي 20، زوايا 12، خلفية `#F59E0B`، نص أسود عريض، معطّل بـ opacity 0.4 حتى اكتمال 4 أرقام؛ Enter في الحقل = ضغط الزر).
  - الرمز الصحيح: **`1998`** → يُخزَّن `notifications_unsupported = true` في `shared_preferences` → البوابة تختفي نهائياً (حتى عبر عمليات التشغيل اللاحقة) ويعمل التطبيق بلا إشعارات (لا تسجيل توكن؛ صندوق الوارد REST يعمل عادي).
  - رمز خاطئ: رسالة **«الرمز غير صحيح»** — `#EF4444`، 12px، تحت الصف؛ تختفي عند أول تعديل للحقل.

### 4.4 بوابة تثبيت iOS (needsInstall) — تُحذف كلياً

لا مفهوم PWA install في تطبيق أصلي. نصوصها التاريخية للسجل فقط (لا تُنقل): «خطوة أخيرة للعب! 📱»، «لتلقي إشعارات دورك الفورية واللعب بسلاسة، يجب تثبيت اللعبة على الشاشة الرئيسية لهاتف الآيفون الخاص بك (قيود نظام iOS).»، الخطوات «اضغط زر المشاركة» / «إضافة للشاشة الرئيسية» / «افتح التطبيق وابدأ اللعب»، «⚠️ نظام Apple يمنع تفعيل الإشعارات إلا من خلال التطبيق المضاف للشاشة الرئيسية.». كذلك يُحذف بانر «📱 لتفعيل الإشعارات على iPhone» من جرس الإشعارات (ملف 19).

### 4.5 شاشة التحميل قبل حسم حالة البوابات

مطابقة للويب: خلفية `#050505`، عمود مركزي بفجوة 16: spinner دائري 48×48 (حد 2px بلون `#F59E0B` شفافية 30% وقوسه العلوي `#F59E0B` كامل، دوران 1s خطي لانهائي) + نص **«جاري التحميل...»** بلون `#F59E0B` شفافية 60%، 14px. تظهر فقط ريثما تُقرأ حالة الإذن المخبأة (يجب أن تكون < 100ms عملياً بفضل الكاش في §6.1).

### 4.6 شاشة التشخيص المخفية (منفذ `/player/debug-push`)

شاشة كاملة يُوصل إليها فقط من رابط «🔧 صفحة تشخيص الإشعارات» في البوابات (+ اختيارياً من شاشة الإعدادات بضغطة مطولة). **الشاشة الوحيدة LTR في التطبيق** (`Directionality.ltr`)، خط monospace (JetBrains Mono من ملف 01)، حجم 12px:
- خلفية الصفحة `#0A0A0A`، النص الافتراضي `#EEE`.
- العنوان: **«🔧 Push Notifications Debugger v2»** — `#F59E0B`، 18px، مركزي.
- صف زرين:
  1. **«▶️ ابدأ التشخيص»** — بعرض كامل (flex)، تدرّج `#F59E0B→#D97706`، نص أسود عريض 16px؛ أثناء التشغيل: معطّل، خلفية `#333`، opacity 0.6، نص **«⏳ جاري...»**.
  2. **«📋 نسخ»** — خلفية `#3B82F6` (معطّل: `#222` + opacity 0.4 حتى وجود سجلات)؛ ينسخ كل الأسطر عبر `Clipboard.setData` ثم snackbar/حوار **«✅ تم نسخ التشخيص!»**.
- كونسول السجل: خلفية `#111`، زوايا 10، ارتفاع أقصى 75% من الشاشة، تمرير تلقائي ناعم لآخر سطر (بعد 50ms من كل إضافة)؛ كل سطر بطابع **`[HH:MM:SS]`**؛ تلوين حسب المحتوى: يحوي ❌ أو 🚨 → `#EF4444`؛ ✅ → `#22C55E`؛ ⚠️ → `#F59E0B`؛ يبدأ بـ `═══` (فواصل الأقسام) → `#60A5FA` عريض؛ الافتراضي `#AAA`؛ كسر الكلمات الطويلة (`word-break: break-all` ≈ `softWrap` مع سماح كسر داخل التوكن).
- الحالة الفارغة: **«اضغط الزر أعلاه لبدء التشخيص الشامل خطوة بخطوة»** — `#555`.
- **الخطوات الست native** (كل فشل يوقف التشغيل بسطر **«🛑 توقف»** + تفسير عربي؛ الأخطاء غير المتوقعة تسجَّل name/message/stack مع 💥):
  1. **البيئة**: المنصة + إصدار النظام + موديل الجهاز (`device_info_plus`) + إصدار التطبيق (`package_info_plus`) + توافر خدمات Google Play (Android) / حالة APNs token (iOS).
  2. **الإذن**: `getNotificationSettings()` الحالية ثم `requestPermission()` مع النتيجة (إن كانت `denied` مسبقاً: شرح أن التفعيل من إعدادات النظام فقط — مكافئ short-circuit الويب).
  3. **القناة/العرض**: التحقق من وجود قناة `mafia_default` وإعداداتها (Android) / خيارات foreground presentation (iOS). *(تحل محل خطوة تسجيل الـ SW)*
  4. **التوكن**: `FirebaseMessaging.instance.getToken()` — يسجّل أول 40 حرفاً + الطول الكلي (نفس أسلوب الويب مع مفتاح VAPID). *(تحل محل خطوتي VAPID وsubscribe)*
  5. **الهوية**: قيمة `mafia_device_id` المخزنة + آخر حدث `onTokenRefresh` إن وجد.
  6. **التسجيل**: `POST /api/player-notifications/register-token` بتوكن اللاعب المخزن (إن غاب: يتابع بلا auth لاختبار قابلية الوصول — مطابق للويب) — يسجّل HTTP status + جسم JSON كاملاً.
- نجاح كامل: **«🏁🏁🏁 التشخيص اكتمل بنجاح! 🏁🏁🏁»**.

### 4.7 شكل الإشعار النظامي نفسه

**Android** (يُبنى محلياً من رسالة data-only في background handler وفي `onMessage` لا يُبنى إطلاقاً):
- القناة: id `mafia_default`، الاسم المعروض **«إشعارات نادي المافيا»**، الوصف **«إشعارات الأنشطة والألعاب والطلبات»** *(نصان جديدان — لا مكافئ ويب لأن الويب بلا قنوات)*، أهمية High (heads-up)، نمط اهتزاز `[0, 200, 100, 200]` (مطابق لـ `vibrate:[200,100,200]` في الـ SW مع صفر تمهيدي إلزامي في Android)، صوت النظام الافتراضي، إظهار badge مفعّل.
- العنوان: `data.title` وإلا الافتراضي **«🎭 نادي المافيا»**؛ النص: `data.body` وإلا فارغ.
- الأيقونة الصغيرة: `@drawable/ic_stat_mafia` (monochrome أبيض — انظر §11)؛ الأيقونة الكبيرة: شعار `mafia_logo` (مكافئ `icon: '/mafia_logo.png'`)؛ لون التمييز (accent) `#8A0303`.
- `data.imageUrl` موجود → `BigPictureStyle` بعد تنزيل الصورة لملف مؤقت (مهلة 10 ثوانٍ؛ فشل التنزيل = عرض بلا صورة، لا إسقاط للإشعار).
- معرّف الإشعار: `hashCode` لقيمة `data.tag` (والـ backend يولّدها `${type}-${Date.now()}` فريدة لكل إرسال) → **الإشعارات لا تتراكب على Android** (تكافؤ مع الويب).
- الحمولة المرفقة بالنقرة: خريطة `data` كاملة بصيغة JSON.

**iOS** (يعرضه النظام مباشرة — الـ backend يرسل `aps.alert {title, body}` + `sound: 'default'` + `badge: 1` جاهزة):
- لا عرض محلي إطلاقاً — أي استدعاء لـ `flutter_local_notifications.show` على iOS = **إشعار مكرر** (انظر قاعدة منع التكرار §6.3).
- `apns-collapse-id = type` من الـ backend → إشعارات النوع الواحد تستبدل بعضها في مركز إشعارات iOS (سلوك الـ backend القائم — يُحافظ عليه).
- الصورة الكبيرة تتطلب Notification Service Extension (انظر §10) — **ليست شرط تكافؤ** (iOS PWA لم يعرض صوراً كبيرة أصلاً).

### 4.8 لافتات الإذن داخل جرس الإشعارات (تنفيذها في ملف 19 — النصوص والقرارات هنا)

- بانر prompt: CTA **«🔔 تفعيل الإشعارات على هاتفك»** / أثناء التفعيل **«⏳ جاري التفعيل...»** + caption **«اضغط للحصول على إشعارات فورية»** — يستدعي نفس `requestPermission()` من هذا الملف. (عملياً نادر الظهور: البوابة الحاجبة تحسم الحالة قبل الوصول للجرس.)
- بانر denied: النص الأصلي **«❌ تم رفض الإشعارات — يمكنك تفعيلها من إعدادات المتصفح»** → ⚠️ *تعديل نصي مسموح*: **«❌ تم رفض الإشعارات — يمكنك تفعيلها من إعدادات التطبيق»** ويصبح البانر قابلاً للنقر → `openAppSettings()`.
- بانر تثبيت iOS: يُحذف (§4.4).

---

## 5. التكيّف مع الشاشات 6→11 إنش

**compact (< 600dp — هواتف 6–7 إنش):**
- البوابات: البطاقة بعرض `min(شاشة − 32, 448)dp`، padding 24، متمركزة عمودياً داخل `SingleChildScrollView` (بوابة «غير مدعوم» تطول مع الكيبورد المفتوح — يجب أن تبقى قابلة للتمرير كما في الويب `overflow-y-auto`).
- التشخيص: عمود واحد؛ الزران في صف واحد (النسخ يأخذ عرضه الطبيعي والتشغيل يتمدد)؛ الكونسول بعرض كامل.

**medium (600–840dp — تابلت 8 إنش):**
- البوابات: نفس بطاقة 448dp متمركزة (لا تمدد — البطاقة عنصر قراءة/قرار)، padding يرتفع إلى 32 (مطابق لـ `md:p-8` في الويب)؛ الأيقونة تبقى 80×80.
- التشخيص: سقف عرض المحتوى **640dp** متمركز؛ حجم خط الكونسول يبقى 12px (سجلات تقنية — لا تكبير).

**expanded (> 840dp — تابلت 10–11 إنش):**
- البوابات: البطاقة ترتفع إلى **520dp** كحد أقصى، الأيقونة العلوية تكبر إلى 96×96، العنوان إلى 28px — «مضاعفة عناصر القرار الحساسة بدل تمديدها»؛ ما تبقى كما هو.
- التشخيص: سقف عرض **840dp**؛ يجوز صف علوي ثنائي (بطاقة ملخص البيئة يميناً + الكونسول يساراً) لكنه اختياري — عمود واحد بسقف 840dp مقبول.
- الإشعار النظامي نفسه: يرسمه نظام التشغيل — لا تكيّف مطلوب.

---

## 6. المنطق والتدفقات

### 6.1 آلة حالة الإذن (state machine)

الحالات: `prompt | granted | denied | unsupported` (نفس مفردات الويب) + علم `bypassed` (تجاوز 1998).

**الحسم عند الإقلاع** (بعد `Firebase.initializeApp`):
1. اقرأ الكاش المتزامن `push_permission_state_cache` من shared_preferences لعرض فوري بلا وميض (مكافئ القراءة المتزامنة لـ `localStorage.push_notifications_enabled` في الويب) — ثم صحّح async.
2. `notifications_unsupported == true` → تخطَّ البوابات كلياً (وضع بلا إشعارات).
3. Android: افحص توافر خدمات Google Play → غير متوفرة → `unsupported`.
4. `getNotificationSettings()`:
   - `notDetermined` → `prompt`
   - `authorized` أو `provisional` → `granted`
   - `denied` → `denied`
   - (Android ≤ 12: تعود `authorized` افتراضياً → `granted` مباشرة)
5. حدّث الكاش.

**التحويلات:**
- `prompt` —(requestPermission ⇒ سماح)→ `granted` → §6.2
- `prompt` —(رفض)→ `denied`
- `prompt` —(إغلاق حوار Android بلا قرار)→ `prompt` (يبقى)
- `denied` —(resume بعد تغيير من إعدادات النظام)→ إعادة فحص → `granted`/`prompt`
- `unsupported` —(رمز 1998)→ `bypassed` (دائم عبر التشغيلات)
- `unsupported` —(«إعادة المحاولة 🔄» ⇒ نجاح getToken)→ `granted`
- **يُحذف**: heuristic الويب «denied قديمة على iOS تُتجاهل وتبقى prompt» — حالة iOS الأصلية موثوقة.

**موضع الحجب** (مطابق للويب): البوابات تحجب **كل** الشاشات المصادَق عليها بما فيها شاشة اللعب؛ المستثنى فقط الصفحات العامة (login/register — ملف 10). ترتيب الفحص: `unsupported` (مع bypass) ← `prompt` ← `denied` ← مرور.

### 6.2 دورة حياة التوكن

```
login/إقلاع + granted
  └→ getToken()  ──(null/فشل)──→ إعادة محاولة واحدة مؤجلة 5s ثم استسلام صامت
        └→ POST /api/player-notifications/register-token
             {token, deviceId, deviceInfo}
             ├─ 200 {success:true} → علِّم "سُجِّل لهذا (playerToken+fcmToken)"
             └─ فشل → صفّر العلم (إعادة محاولة عند التشغيل القادم — تكافؤ سلوك الويب)
onTokenRefresh.listen(token) → POST نفسه فوراً (يستبدل كل آلة pushsubscriptionchange)
تبديل حساب (05-session-auth.md) → POST نفسه تحت الحساب الجديد
```

- **مرة لكل زوج (توكن لاعب، توكن FCM)** لكل تشغيل — خدمة singleton واحدة (يُحذف حارس التركيب الثلاثي).
- `deviceId`: يُولَّد UUID v4 مرة واحدة ويُخزَّن في shared_preferences بمفتاح **`mafia_device_id`** (نفس اسم مفتاح الويب) — لا يتغير أبداً بعد التوليد.
- `deviceInfo`: `"<platform> <model> <osVersion>"` مقصوصة إلى **150 حرفاً** (مكافئ `UA.slice(0,150)`).
- **عند الخروج (logout): لا حذف للتوكن** — الويب لا يلغي التسجيل، والـ backend يعالج الجهاز المشترك: `registerPlayerToken` يحذف أي صف بنفس التوكن ثم أي صف بـ `deviceInfo LIKE '<deviceId>|%'` عبر **كل** اللاعبين داخل معاملة بقفل استشاري (`pg_advisory_xact_lock(playerId)`) ثم يدرج — أي أن آخر من يسجّل دخوله على الجهاز يمتلك إشعاراته (سلوك مقصود، لا تكرار).

### 6.3 قاعدة منع التكرار — الترجمة الأصلية

الويب: «مصدر عرض واحد لكل بيئة». الرسالة على السلك (من `buildFCMPayload` — تم التحقق):
- **بلا** `notification` في المستوى الأعلى → على Android هي **data-only** → لا يعرض نظام Android شيئاً بنفسه.
- كتلة `apns` تحوي `aps.alert {title, body}` → على iOS **يعرضها النظام بنفسه**.

| | المصدر الوحيد للعرض | الممنوع |
|---|---|---|
| Android (background/terminated) | `onBackgroundMessage` (top-level، `@pragma('vm:entry-point')`) يبني الإشعار عبر `flutter_local_notifications` | لا شيء آخر يعرض |
| Android (foreground) | لا عرض — `onMessage` يعيد جلب الصندوق فقط (تكافؤ الويب) | لا local notification في foreground |
| iOS (background/terminated) | النظام (APNs alert) | **يُمنع** أي عرض من `onBackgroundMessage` — تكرار مضمون |
| iOS (foreground) | لا عرض: `setForegroundNotificationPresentationOptions(alert: false, badge: false, sound: false)` + `onMessage` يعيد جلب الصندوق | — |

### 6.4 التوجيه عند النقر — بديل `/__pending_nav`

**مصادر النقر الأربعة** تصب كلها في دالة واحدة `DeepLinkService.dispatch(Map<String,String> data)` (الخدمة معرّفة ومملوكة في 08-deeplinks-routing.md):
1. `FirebaseMessaging.instance.getInitialMessage()` — iOS cold start (النظام عرض الإشعار).
2. `FirebaseMessaging.onMessageOpenedApp` — iOS من الخلفية.
3. `getNotificationAppLaunchDetails()` من flutter_local_notifications — **Android cold start** (لأن إشعاراتنا معروضة محلياً؛ نقرها لا يمر عبر getInitialMessage).
4. `onDidReceiveNotificationResponse` — Android والتطبيق حي.

> ⚠️ هذا التقسيم إلزامي: على Android مع رسائل data-only معروضة محلياً، `getInitialMessage`/`onMessageOpenedApp` **لا يُستدعيان** — النقر يصل عبر قنوات flutter_local_notifications فقط. على iOS العكس تماماً.

**بوابة انتظار الـ auth** (مكافئ استهلاك `/__pending_nav` في `player/layout.tsx` بعد جاهزية اللاعب): `dispatch` لا ينفّذ التنقل مباشرة؛ يخزّن الوجهة في `PendingNavigationController` (08) ولا يتنقل إلا بعد إشارة «auth جاهز واللاعب مسجّل» من ملف 05 (وبعد اجتياز البوابات §6.1). وجهة واحدة فقط تُحفظ (الأحدث تكسب)، وتُمسح بعد التنفيذ، ولا تنفَّذ إن كانت تطابق الشاشة الحالية (تكافؤ `router.replace` الشرطي في الويب).

**خوارزمية حل الوجهة (حرفية من `sw.js`):**
```
url = data['url'] غير فارغ ؟ data['url'] : resolveByType(type, data) ?? '/player/home'
```
> ملاحظة تكافؤ: الـ backend يحقن دائماً `url` في data (افتراضه `/player/home`)، لذا `data.url` يفوز عملياً في كل نقرة — جدول الأنواع fallback للحمولات الناقصة فقط. هذا **سلوك الويب الحرفي** (`notificationclick`: `data.url || resolveNotificationUrl(...)`).

جدول `resolveByType` (نسخة الـ SW — الأشمل، المعتمدة؛ نسخة NotificationBell الأضيق تناقض داخلي لا يُنقل):

| `type` | الوجهة |
|---|---|
| `activity_started` | `roomCode` موجود → `/player/join?code={roomCode}` وإلا `/player/home` |
| `room_invite` | `data.url` وإلا `roomCode` → `/player/join?code={roomCode}&invite=1[&by={inviterName مُرمَّز}]` وإلا `/player/home` |
| `new_activity` | `activityId` → `/player/games?activityId={activityId}` وإلا `/player/games` |
| `booking_confirmed` | `/player/home` |
| `game_ended` | `/player/home` |
| `feedback_survey` | `sessionId` → `/player/feedback?sessionId={sessionId}` وإلا `/player/feedback` |
| `order_status` | `data.url` وإلا `/player/order` |
| `new_order` | `data.url` وإلا `/venue/orders` — **مسار كونسول المكان، خارج تطبيق اللاعب**: يُصنَّف في 08 §6.5 كمسار ويب خارجي فيُفتح بالمتصفح على `https://club-mafia.grade.sbs/venue/orders` (لا يُوجَّه داخلياً) |
| `custom` وأي نوع مجهول | `data.url` وإلا `/player/home` |

**التنفيذ**: المسار الداخلي يُمرَّر لخريطة ملف 08 (`/player/join`, `/player/games`, `/player/home`, `/player/feedback`, `/player/order`). الرابط الخارجي (يبدأ بـ `http(s)://` ومضيفه ≠ مضيف الـ backend) → `url_launcher` بـ `LaunchMode.externalApplication` (مكافئ `clients.openWindow` بتبويب جديد). أي scheme آخر يُرفض.

**foreground**: `onMessage` لا يوجّه أبداً — فقط يبث حدث «وصلت رسالة» فيعيد ملف 19 جلب الصندوق (مكافئ `PUSH_RECEIVED`).

### 6.5 badge على iOS

- الـ backend يرسل `badge: 1` ثابتة (ليست عدّاداً) — لا تغيير backend.
- عند فتح التطبيق وعند كل resume: تصفير الـ badge (`app_badge_plus` → `updateBadge(0)`).
- خيارات foreground presentation تُبقي `badge: false` (لا معنى لإظهار 1 والتطبيق مفتوح).
- Android: لا إدارة يدوية — نقاط الـ launcher تتبع إشعارات القناة تلقائياً حسب الـ OEM.

### 6.6 الحالات الحدّية

- **إشعار يصل والبوابة الحاجبة ظاهرة**: يستحيل تقريباً في `prompt` (لا إذن = لا عرض)، لكن نقرة إشعار قديم قد تفتح التطبيق على البوابة → الوجهة تبقى معلّقة في `pendingNotificationRoute` وتنفَّذ فور اجتياز البوابة.
- **Android force-stop**: لا تسليم حتى يفتح المستخدم التطبيق يدوياً (قيد نظام) — يوثَّق في 92 كقيد معروف.
- **Doze**: الـ backend لا يرسل `android: {priority: 'high'}` حالياً (يرسل فقط `webpush.headers.Urgency: high` و`apns-priority: 10`) → رسائل data-only قد تتأخر في Doze العميق. **توصية backend صغيرة غير كاسرة للويب**: إضافة كتلة `android: { priority: 'high' }` في `buildFCMPayload` — تُدرج كمهمة backend مصاحبة، وليست شرطاً لبناء التطبيق.
- **iOS إيقاظ صامت**: `content-available: 1` مضبوطة أصلاً من الـ backend (تم التحقق سطر 112 في fcm.service.ts) — لا عمل مطلوب.
- **انتهاء صلاحية JWT أثناء register-token** → 401 `{error:'غير مصادق'}` → لا إعادة فورية؛ يُعاد بعد تجديد الجلسة (ملف 05).
- **وصول رسالتين بنفس النوع على iOS**: تستبدل إحداهما الأخرى (`apns-collapse-id`) — سلوك مقصود.
- **حقل `data` في سجل الصندوق قد يكون null** — كل قراءة اختيارية.

### 6.7 إعادة الاتصال واستعادة الحالة

عند `AppLifecycleState.resumed`:
1. أعد فحص إذن الإشعارات (قد تغيّر من إعدادات النظام) → حدّث البوابات فوراً.
2. صفّر badge (iOS).
3. أطلق حدث resume ليعيد ملف 19 جلب الصندوق (الويب لم يكن يملك خطاف resume — تحسين مقصود ومذكور في تقرير المصدر).
4. إن كانت الحالة `granted` ولم يُسجَّل التوكن بنجاح في هذا التشغيل → أعد محاولة التسجيل.

لا يوجد أي polling في الخلفية — polling الصندوق (60s) يخص ملف 19 وفي foreground فقط.

---

## 7. عقود التكامل

### REST (كلها عبر عميل ملف 03؛ المصادَقة `Authorization: Bearer <player JWT>`)

| Method + Path | Request | Response | ملاحظات |
|---|---|---|---|
| POST `/api/player-notifications/register-token` | `{ token: string, deviceId: string, deviceInfo: string }` | `{ success: true }` | 400 `{error:'token مطلوب'}`؛ 401 `{error:'غير مصادق'}`. `token` = توكن FCM خام (فرع `WEBPUSH::` يبقى مدعوماً في الـ backend لكنه غير مستعمل من Flutter) |
| GET `/api/player-notifications?limit=50` | — | `{ success: true, notifications: PlayerNotification[] }` مرتبة `createdAt DESC` | limit افتراضي 50؛ 503 `{error:'DB unavailable'}` |
| GET `/api/player-notifications/unread-count` | — | `{ success: true, count: number }` | غير مستعمل في الويب؛ **يُستعمل في Flutter** لشارة رخيصة (ملف 19) |
| PUT `/api/player-notifications/:id/read` | — | `{ success: true }` | مقيّد باللاعب المالك |
| PUT `/api/player-notifications/read-all` | — | `{ success: true }` | |
| DELETE `/api/player-notifications/:id` | — | `{ success: true }` | بلا UI في الويب؛ فرصة swipe-to-delete (ملف 19) |
| ~~GET `/api/push/vapid-public-key`~~ | | | **لا يُستدعى من Flutter** (خاص بـ Web Push) |

### حمولة الدفع على السلك (من `buildFCMPayload` — التحقق حرفي)

```jsonc
{
  "data": {                     // كل القيم strings — هذا ما يصل لهاندلرات Flutter
    "type": "...",              // انظر قائمة الأنواع
    "title": "...", "body": "...",
    "tag": "<type>-<timestamp>",// فريدة لكل إرسال
    "url": "...",               // دائماً موجودة (افتراض backend: /player/home)
    // + أي مفاتيح إضافية من المرسل مُحوّلة String:
    // imageUrl?, videoUrl?, richBody?, roomCode?, activityId?, sessionId?, inviterName?
  },
  "apns": {
    "headers": { "apns-priority": "10", "apns-push-type": "alert", "apns-collapse-id": "<type>" },
    "payload": { "aps": { "alert": { "title", "body" }, "badge": 1, "sound": "default",
                          "mutable-content": 1, "content-available": 1 } }
  },
  "webpush": { /* يخص الـ PWA فقط — يتجاهله Flutter */ }
}
```

قيم `type` المعروفة: `activity_started`, `room_invite`, `new_activity`, `booking_confirmed`, `game_ended`, `feedback_survey`, `order_status`, `new_order`, `custom`, `reminder`, `friend_booked`, `level_up`, `comeback`.

### Socket

**لا شيء** — هذه الشريحة صفر Socket.IO في الويب وتبقى كذلك في Flutter. القنوات المكافئة للويب (`PUSH_RECEIVED`, `SET_AUTH_TOKEN`) تُستبدل باستدعاءات مباشرة داخل العملية (stream داخلي `onPushReceived` تستهلكه شاشة الصندوق).

---

## 8. نماذج Dart المطلوبة

```dart
enum PushPermissionState { prompt, granted, denied, unsupported }

/// سجل صندوق الوارد (GET /api/player-notifications)
class PlayerNotification {
  final int id;
  final int playerId;
  final String title;
  final String body;
  final String type;
  final Map<String, dynamic>? data;   // JSON حر؛ قد يكون null
  final bool isRead;
  final DateTime createdAt;
}

/// عرض مكتوب فوق data القادمة في رسالة FCM (كلها strings) أو في سجل الصندوق
class PushPayloadData {
  final String? type, title, body, tag, url;
  final String? imageUrl, videoUrl, richBody;
  final String? roomCode, activityId, sessionId, inviterName;
  factory PushPayloadData.fromMap(Map<String, dynamic> raw);
}

class RegisterTokenRequest {
  final String token;      // FCM token خام
  final String deviceId;   // UUID ثابت لكل تثبيت (mafia_device_id)
  final String deviceInfo; // "<platform> <model> <osVersion>" ≤ 150 حرفاً
}

/// نتيجة حل وجهة النقر
sealed class ResolvedNotificationRoute {}
class InternalRoute extends ResolvedNotificationRoute {
  final String path;                    // مثال: /player/join
  final Map<String, String> query;      // code, invite, by, activityId, sessionId...
}
class ExternalRoute extends ResolvedNotificationRoute { final Uri uri; }

/// الخدمات (singletons عبر Riverpod/Provider حسب ملف 01):
/// PushService        — init/requestPermission/getToken/onTokenRefresh/registerToken + stream حالة الإذن + stream onPushReceived
/// DeepLinkService (مُعرَّف في 08-deeplinks-routing.md) — مصادر النقر الأربعة هنا تستدعي
///     `DeepLinkService.dispatch(data)`؛ الحلّ عبر NotificationRouteResolver والتخزين المعلّق
///     في PendingNavigationController وبوابة auth-جاهز (كلها في 08)
/// PermissionGateController — آلة الحالة §6.1 + bypass 1998 (notifications_unsupported)
/// PushDiagnostics    — الخطوات الست + سجل الأسطر الملونة
```

مفاتيح shared_preferences: `mafia_device_id`، `notifications_unsupported` (bool)، `push_permission_state_cache` (اختياري للعرض الفوري).

---

## 9. الحزم المستخدمة

| الحزمة | الغرض |
|---|---|
| `firebase_core` | تهيئة Firebase (نفس مشروع `mafia-b1c74`) |
| `firebase_messaging` | التوكن، الأذونات، onMessage/onMessageOpenedApp/getInitialMessage/onBackgroundMessage |
| `flutter_local_notifications` | قناة `mafia_default` + عرض data-only على Android + قنوات نقر Android |
| `permission_handler` | `openAppSettings()` في بوابة denied |
| `shared_preferences` | `mafia_device_id`, `notifications_unsupported`, كاش حالة الإذن |
| `device_info_plus` | `deviceInfo` للتسجيل + شاشة التشخيص |
| `package_info_plus` | إصدار التطبيق في التشخيص |
| `url_launcher` | الروابط الخارجية (`LaunchMode.externalApplication`) |
| `app_badge_plus` | تصفير badge على iOS |
| `uuid` | توليد `mafia_device_id` |
| `http` أو `dio` (من ملف 03) | register-token + تنزيل صورة BigPicture |

---

## 10. اختلافات Android / iOS — القسم الأثقل في هذا الملف

### 10.1 الأذونات
| | Android | iOS |
|---|---|---|
| الآلية | Android 13+ (API 33): إذن `POST_NOTIFICATIONS` وقت التشغيل — يجب إعلانه في `AndroidManifest.xml`: `<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>`. Android ≤ 12: ممنوح افتراضياً → بوابة prompt **لا تظهر** | حوار APNs النظامي دائماً عند أول `requestPermission(alert: true, badge: true, sound: true, provisional: false)` |
| «رفض» | Android 13+: رفضتان متتاليتان = حظر دائم (لا حوار ثالث) → بوابة denied + `openAppSettings()` | رفضة واحدة نهائية → بوابة denied + `openAppSettings()` |
| unsupported | ممكنة (لا Google Play Services) → بوابة §4.3 + رمز 1998 | **مستحيلة** — لا تظهر البوابة أبداً |

### 10.2 خط العرض (الاختلاف الجوهري)
- **Android**: الرسالة data-only → يجب handler خلفي **top-level خارج أي كلاس** موسوم `@pragma('vm:entry-point')` ومسجَّل قبل `runApp` بـ `FirebaseMessaging.onBackgroundMessage(...)`؛ يعمل في isolate منفصل → يعيد `Firebase.initializeApp` داخله؛ يبني الإشعار عبر flutter_local_notifications (§4.7). القناة `mafia_default` تُنشأ في `main()` قبل أي عرض (Android 8+). يُضاف في الـ Manifest: `com.google.firebase.messaging.default_notification_channel_id = mafia_default` و`default_notification_icon = @drawable/ic_stat_mafia`.
- **iOS**: النظام يعرض (`aps.alert`) — الـ handler الخلفي يُستدعى للإيقاظ الصامت فقط (`content-available: 1`) و**يجب ألا يعرض شيئاً** على iOS (فحص `Platform.isIOS` → return).

### 10.3 foreground presentation
- iOS: `setForegroundNotificationPresentationOptions(alert: false, badge: false, sound: false)` — مطابقة سلوك الويب (foreground = تحديث الصندوق فقط، بلا banner).
- Android: لا خيار مكافئ ولا حاجة — data-only في foreground لا تعرض شيئاً ما لم نعرضه نحن (ولن نفعل).

### 10.4 النقر والتوجيه
- iOS: `getInitialMessage()` (cold) + `onMessageOpenedApp` (background) — **يستبدلان حرفياً حيلة `/__pending_nav`**.
- Android: `getNotificationAppLaunchDetails()` (cold) + `onDidReceiveNotificationResponse` (حي) — لأن العرض محلي (§6.4).

### 10.5 الصوت
- Android: صوت القناة الافتراضي، يُضبط مرة عند إنشاء `mafia_default` (تغييره لاحقاً يتطلب قناة بمعرّف جديد — قيد نظام).
- iOS: `sound: 'default'` قادمة من `aps` — النظام يشغّلها؛ صوت مخصص يتطلب ملف `.caf` مضمّناً بالحزمة وتغيير قيمة الـ backend (غير مطلوب للتكافؤ).

### 10.6 badge
- iOS: `badge: 1` ثابتة من الـ backend؛ تصفير عند open/resume (§6.5).
- Android: نقاط الـ launcher تلقائية حسب الـ OEM؛ لا كود.

### 10.7 الصور الكبيرة (imageUrl)
- Android: `BigPictureStyle` مجاني — ينفَّذ من اليوم الأول.
- iOS: يتطلب **Notification Service Extension** بـ Swift (target مقترح: `NotificationImageService`) يلتقط الدفعة (`mutable-content: 1` مضبوطة أصلاً من الـ backend)، ينزّل `data.imageUrl` (سقف ~5s)، يرفقها `UNNotificationAttachment`. **مرحلة ثانية اختيارية** — ليست شرط تكافؤ (iOS PWA لم يعرض صوراً كبيرة). يُضاف الـ target في 91-release-ios.md.

### 10.8 التجميع (collapse)
- Android: `tag` فريدة لكل إرسال → إشعارات منفصلة دائماً.
- iOS: `apns-collapse-id = type` → الأحدث يستبدل الأقدم لنفس النوع. (كلاهما سلوك backend قائم — يُوثَّق ولا يُغيَّر.)

### 10.9 التهيئة والاعتماديات (تفصيلها في 90/91)
- Android: `google-services.json` لمشروع `mafia-b1c74`؛ حالة Doze/data-only (§6.6).
- iOS: مفتاح APNs في كونسول Firebase؛ Capabilities: Push Notifications + Background Modes → Remote notifications؛ التوكن يتطلب جهازاً حقيقياً (لا Simulator)؛ سباق «APNs token غير جاهز عند getToken» → أعد المحاولة بعد `onTokenRefresh` أو تأخير قصير.

---

## 11. الأصول المطلوبة

| الأصل | الاستعمال |
|---|---|
| `ic_stat_mafia` (Android drawable، أبيض monochrome على شفاف، مقاسات mdpi→xxxhdpi) | الأيقونة الصغيرة للإشعار — **جديد إلزامي**؛ لا يوجد مكافئ ويب لأن الويب استعمل `mafia_logo.png` الملون وAndroid يرفض الملون للأيقونة الصغيرة |
| `mafia_logo.png` (من `frontend/public/mafia_logo.png`) | الأيقونة الكبيرة للإشعار على Android (تكافؤ `icon`/`badge` في الـ SW) |
| خط JetBrains Mono (من ملف 01) | كونسول شاشة التشخيص |
| لا أصوات مخصصة، لا مفاتيح VAPID، لا manifest، لا SW | — |

الوسائط الديناميكية (`data.imageUrl`) تُنزَّل وقت التشغيل ولا تُضمَّن.

---

## 12. معايير القبول — checklist تكافؤ

**الأذونات والبوابات:**
- [ ] Android ≤ 12: لا تظهر أي بوابة إذن؛ التوكن يُسجَّل تلقائياً بعد login.
- [ ] Android 13+ وiOS بحالة `notDetermined`: بوابة prompt تحجب كل الشاشات المصادَق عليها، بالنصوص الحرفية «تفعيل الإشعارات الفورية 🔔» / «تفعيل الآن وسماح ⚡» / «جاري التفعيل...».
- [ ] سماح → البوابة تختفي بلا إعادة تشغيل ويُسجَّل التوكن (يظهر صف جديد في `player_fcm_tokens` بصيغة `deviceId|deviceInfo`).
- [ ] رفض → بوابة denied بعنوان «الإشعارات محظورة بالخطأ! ⚠️»، وزر «فتح إعدادات التطبيق ⚙️» يفتح إعدادات النظام، والعودة بعد التفعيل تفك الحجب تلقائياً بلا ضغطة.
- [ ] جهاز Android بلا Google Play: بوابة «غير مدعوم» تظهر، رمز `1998` يتجاوزها نهائياً (يصمد بعد kill/restart)، رمز خاطئ يعرض «الرمز غير صحيح».
- [ ] بوابة تثبيت iOS غير موجودة في أي مسار.
- [ ] الصفحات العامة (login) لا تُحجب أبداً.

**العرض ومنع التكرار:**
- [ ] إشعار يصل وAndroid بالخلفية/مقتول (غير force-stopped) → إشعار واحد بالضبط: عنوانه `data.title` (أو «🎭 نادي المافيا» عند الغياب)، اهتزاز `[0,200,100,200]`، أيقونة صغيرة بيضاء + شعار كبير، قناة `mafia_default`.
- [ ] نفس السيناريو على iOS → إشعار واحد بالضبط (من النظام) بصوت default وbadge = 1.
- [ ] إشعار يصل والتطبيق foreground (كلا المنصتين) → **لا** banner نظامي؛ صندوق الوارد يُعاد جلبه (ملف 19).
- [ ] `imageUrl` على Android → BigPicture؛ فشل تنزيلها لا يمنع ظهور الإشعار.
- [ ] رسالتان متتاليتان بنفس النوع: تتراكمان على Android، وتستبدل الثانيةُ الأولى على iOS.

**النقر والتوجيه:**
- [ ] نقر إشعار `data.url = /player/join?code=ABCD` والتطبيق مقتول (cold): يفتح التطبيق ← ينتظر جاهزية auth ← يهبط على شاشة الانضمام بالكود ABCD — على **كلتا** المنصتين.
- [ ] نفس النقرة والتطبيق بالخلفية: تنقّل مباشر دون إعادة تشغيل.
- [ ] حمولة بلا `url` من نوع `feedback_survey` مع `sessionId` → شاشة التقييم بذلك المعرّف (جدول §6.4).
- [ ] `data.url` خارجي (مضيف مختلف https) → يفتح في المتصفح الخارجي ولا يبدّل شاشة التطبيق.
- [ ] النقرة والمستخدم واقف على الوجهة نفسها → لا إعادة تحميل/دفع مكرر للمسار.

**التوكن:**
- [ ] `onTokenRefresh` يعيد POST تلقائياً.
- [ ] تبديل حساب على نفس الجهاز: الإشعارات تصل للحساب الأخير فقط (dedup بالـ deviceId).
- [ ] فشل register-token لا يكسر الواجهة ويُعاد تلقائياً في التشغيل التالي.

**التشخيص:**
- [ ] شاشة التشخيص LTR monospace، «▶️ ابدأ التشخيص» يشغّل الخطوات الست بالترتيب مع طوابع `[HH:MM:SS]` والتلوين الرباعي، «📋 نسخ» ينسخ السجل كاملاً ويؤكد «✅ تم نسخ التشخيص!»، والنجاح يختم بـ«🏁🏁🏁 التشخيص اكتمل بنجاح! 🏁🏁🏁».

**badge:**
- [ ] فتح التطبيق على iOS يصفّر badge الأيقونة.

---

## 13. ملاحظات أداء وأمان

- **الـ handler الخلفي (Android)**: ميزانية زمنية ضيقة (~ثوانٍ) — لا أعمال غير ضرورية؛ تنزيل صورة BigPicture بمهلة 10s وفشله fail-open (إشعار بلا صورة)؛ لا شبكة أخرى داخل الـ isolate.
- **حجم الحمولة**: سقف FCM ‏4KB — `richBody`/`videoUrl` تمر كمراجع، والوسائط تُجلب عند الفتح فقط.
- **أمان التوجيه العميق**: `DeepLinkService` (08) يقبل حصراً المسارات الداخلية المذكورة في جدول §6.4؛ الروابط الخارجية http/https فقط عبر `url_launcher`؛ أي scheme آخر (`javascript:`, `file:`, `intent:` ...) يُرفض بصمت؛ `inviterName` يُفك ترميزه ويُعرض كنص خام دائماً (لا HTML).
- **سرية التوكنات**: توكن FCM يُرسل فقط عبر HTTPS بترويسة Bearer؛ شاشة التشخيص تعرض أول 40 حرفاً في السجل (تكافؤ الويب) لكن زر النسخ ينسخ السجل كما هو — الشاشة مخفية وليست في التنقل العام، ويُمنع أي تسجيل للتوكن الكامل في سجلات الإنتاج (`debugPrint` خلف علم build).
- **JWT اللاعب**: يُقرأ من طبقة الجلسة (ملف 05 — secure storage)؛ **لا** يُخزَّن في أي مكان إضافي (خلافاً للويب الذي احتاج نسخه إلى cache الـ SW — تلك الثغرة السطحية تختفي بالكامل).
- **البطارية**: لا polling بالخلفية إطلاقاً؛ polling الصندوق (60s) foreground فقط (ملف 19)؛ لا wakelocks في هذه الشريحة.
- **الجهاز المشترك**: قفل الـ backend الاستشاري يضمن ذرية إعادة الربط — لا معالجة إضافية في العميل؛ يجب عدم «تحسين» ذلك بحذف التوكن عند logout (يكسر سيناريو الويب الموازي الذي يشارك نفس الجدول).
- **الخصوصية**: حمولات الإشعارات قد تحوي أسماء لاعبين (`inviterName`) — تظهر على شاشة القفل بحكم النظام؛ سلوك مطابق للويب ومقبول (لا بيانات حساسة في الحمولة).
- **Doze**: راجع توصية `android.priority: high` في §6.6 — أثرها أداء تسليم فقط، ولا تغيّر أي عقد.
