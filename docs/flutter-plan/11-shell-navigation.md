# 11 — القشرة: BottomNav، بوابة الإشعارات، بوابة الإصدار، سحب-للتحديث، شاشة التحميل

> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

## 1. الهدف والنطاق

هذا الملف يواصف «القشرة» (Shell) الدائمة التي تلفّ كل شاشات اللاعب في تطبيق Flutter، وهي المكافئ المباشر لـ `/player/layout.tsx` + `app/layout.tsx` (الجذر) في الـ PWA الحالية:

1. **شاشة التحميل** أثناء استعادة الجلسة والتحقق منها.
2. **بوابة الإشعارات الإلزامية**: قاعدة منتج صارمة — *لا لعب بدون إشعارات*. في الويب 4 شاشات حجب كاملة؛ في التطبيق الأصلي تسقط شاشة «التثبيت» (iOS PWA install) كلياً وتبقى 3 حالات معدَّلة (prompt / denied / unsupported+bypass).
3. **بوابة الإصدار (Force Update)**: في الويب آلية صامتة (مقارنة `APP_VERSION` مع localStorage ثم مسح الكاش وإعادة تحميل)؛ في التطبيق تتحول إلى شاشة تحديث إجباري/اختياري عبر Firebase Remote Config + متاجر التطبيقات.
4. **سحب-للتحديث**: في الويب hack يدوي على iOS يعيد تحميل الصفحة بالكامل؛ في Flutter يُستبدل بـ `RefreshIndicator` يعيد جلب البيانات فقط (بدون reload).
5. **شريط التنقل السفلي BottomNav**: 5 تبويبات وزر مركزي مرتفع «ادخل»، مع مؤشر نشاط منزلق.
6. **قواعد توجيه القشرة**: حارس المصادقة على مستوى الـ Shell (تفاصيل الجلسة في 05-session-auth.md)، إعفاء مسار الانضمام، redirect جذر اللاعب، واستهلاك «التنقل المعلّق» القادم من إشعار push عند الإقلاع البارد.

**خارج النطاق**: محتوى شاشات التبويبات نفسها (12-home.md، 13-profile.md، 14-games-invites.md، 15-rank.md)، شاشات الدخول (10-login-register.md)، منطق الإشعارات الداخلي وFCM (06-push-notifications.md)، شاشة اللعب PlayerFlow (20/21).

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

| الملف | ماذا نأخذ منه |
|---|---|
| `unified-mafia/frontend/src/app/player/layout.tsx` | القشرة كاملة: شاشة التحميل، auth guard، بوابة الإشعارات (الشاشات الأربع بنصوصها)، سحب-للتحديث (usePullToRefresh)، pending-nav من الإشعار، الغلاف الطبيعي pb-20 |
| `unified-mafia/frontend/src/components/BottomNav.tsx` | الشريط السفلي: التبويبات الخمسة، أيقونات SVG، الزر المركزي، المؤشر المنزلق، كل الألوان والأبعاد |
| `unified-mafia/frontend/src/app/layout.tsx` | `APP_VERSION = '2.5.0'` + سكربت بوابة الإصدار (مفتاح `mafia_app_version`، مسح caches، إلغاء تسجيل SW، `location.reload` بعد 300ms)، خطوط جوجل العربية، `viewport` (themeColor `#050505`، userScalable=false)، `apple-mobile-web-app-status-bar-style: black-translucent` |
| `unified-mafia/frontend/src/app/player/page.tsx` | redirect فوري `/player` → `/player/home` مع spinner عنبري 40px |
| `unified-mafia/frontend/src/context/PlayerContext.tsx` | مصدر `player` و`isLoading` المستهلكَين في القشرة (المواصفة الكاملة في 05-session-auth.md) |
| `unified-mafia/frontend/src/hooks/usePushNotifications.ts` | مصدر `permissionState` / `needsInstall` / `requestPermission` (المواصفة الكاملة في 06-push-notifications.md) |
| `unified-mafia/frontend/tailwind.config.js` | تعريفات الأنيميشن الحرفية: `fade-in-up` = fadeInUp 0.5s ease-out forwards (opacity 0→1 + translateY 20px→0)؛ `pulse-slow` = pulse 3s cubic-bezier(0.4,0,0.6,1) infinite؛ `font-arabic` = Tajawal ثم Inter |
| `unified-mafia/frontend/src/lib/socket.ts` + `hooks/useSocket.ts` | لا تُنقل هنا — مرجعية فقط (04-socket-layer.md) |

**ملاحظة تحقق مهمة**: لا يوجد في الـ backend أي endpoint لإصدار التطبيق أو حدّه الأدنى (تم فحص `backend/src/routes/`). بوابة الإصدار في الويب client-side بالكامل. لذلك آلية Force Update في Flutter تُبنى على Firebase Remote Config (نفس مشروع Firebase المستخدم لـ FCM) — **ممنوع اختراع endpoint خاص بها**.

---

## 3. التبعيات على ملفات الخطة الأخرى

- **01-foundation-theme.md**: الألوان (`#050505`، `#0c0c0c`، `#121212`، العنبري `#fbbf24/#f59e0b/#b45309`، الأحمر `#ef4444`، الأزرق `#3b82f6`)، خط Tajawal، منحنيات وأزمنة الأنيميشن المشتركة (fadeInUp 500ms ease-out، pulse-slow 3s، ping/bounce/spin/pulse بمكافئات Tailwind).
- **02-models-data-layer.md**: نموذج `PlayerProfile` و`ActiveGameSummary` المستهلكان من `/me`.
- **03-networking-rest.md**: عميل REST، غلاف `{success, error}`، Bearer headers.
- **04-socket-layer.md**: singleton الـ socket وإعادة المصادقة `reconnectSocketAuth()` — القشرة لا تسجّل مستمعات لعبة لكنها تملك دورة حياته (init عند الإقلاع).
- **05-session-auth.md**: `PlayerSessionController` (مكافئ PlayerContext): حالات loading/unauthenticated/authenticated، استعادة الجلسة عبر `/me`، مفاتيح التخزين. القشرة تستهلك `isLoading` و`player` فقط.
- **06-push-notifications.md**: مصدر `NotificationGateStatus` (granted/prompt/denied/unsupported) و`requestPermission()` وخريطة حالات `firebase_messaging.authorizationStatus`، و`getInitialMessage()`/`onMessageOpenedApp` اللذان يعوّضان حيلة `/__pending_nav`.
- **08-deeplinks-routing.md**: شجرة go_router الكاملة، تعريف الـ StatefulShellRoute بفروعه الخمسة، إعفاءات الحارس (`/player/join`، `/join/:roomCode`)، App Links / Universal Links.
- **12-home.md، 13-profile.md، 14-games-invites.md، 15-rank.md، 21-join-lobby.md**: محتوى فروع التبويبات الخمسة.
- **90-release-android.md / 91-release-ios.md**: أرقام البناء وربطها بمفاتيح Remote Config وروابط المتاجر.

---

## 4. الواجهة والتجربة تفصيلياً

### 4.0 اللغة البصرية العامة للقشرة

- خلفية التطبيق كله: `#050505` (`scaffoldBackgroundColor`).
- شريط الحالة: خلفية `#050505` وأيقونات فاتحة (مكافئ `themeColor: '#050505'` + `black-translucent`).
- الاتجاه: التطبيق كله `Directionality(TextDirection.rtl)` (مكافئ `<html lang="ar" dir="rtl">`).
- تكبير النص: لا يوجد تكبير صفحة في الويب (`userScalable: false`) — في Flutter نسمح بـ textScale لكن نقيّده: `TextScaler.clamp(minScaleFactor: 1.0, maxScaleFactor: 1.3)` على مستوى MaterialApp (قرار نقل — الويب كان يمنع التكبير كلياً).
- بطاقات البوابات: `#0c0c0c` بشفافية 90% + blur (في Flutter يُفضَّل لون صلب مسبق الدمج `#E60C0C0C` بدل `BackdropFilter` — انظر §13)، زوايا 24px (rounded-3xl)، حشوة 24px (وعلى الشاشات ≥768dp: 32px)، عرض أقصى 448dp (max-w-md)، توسيط، دخول بأنيميشن **fadeInUp: 500ms ease-out، opacity 0→1 + إزاحة Y من 20px إلى 0**.

### 4.1 شاشة التحميل (Session-restore Loading)

تُعرض عندما تكون حالة الجلسة `loading` والمسار الحالي **ليس** تبويب الانضمام (`/player/join` يدير تحميله بنفسه — انظر §4.7).

- ملء الشاشة، خلفية `#050505`، عمود مركزي بمسافة 16px (gap-4) بين العنصرين:
  - حلقة spinner قطرها **48px** (w-12 h-12)، سماكة الحد **2px**، لون الحلقة `rgba(245,158,11,0.3)` (amber-500/30) مع قوس علوي `#f59e0b` (amber-500)، دوران مستمر (مكافئ animate-spin: دورة كاملة كل **1s linear infinite**).
  - نص: **`جاري التحميل...`** — لون `#f59e0b` بشفافية 60%، حجم 14sp (text-sm).
- لا زر، لا تفاعل، لا مهلة قصوى في الويب (تنتهي بانتهاء نداء `/me`). في Flutter: نفس السلوك؛ فشل الشبكة في `/me` يُسقط إلى unauthenticated (تفاصيل 05-session-auth.md).

### 4.2 جذر اللاعب `/player`

في الويب: صفحة redirect فوري إلى `/player/home` تعرض أثناءه spinner عنبري **40px** موسّطاً على `#050505`. في Flutter: قاعدة redirect في go_router (`/player` → `/player/home`) — لا شاشة وسيطة مطلوبة؛ إن ظهر إطار انتقالي يُعرض نفس الـ spinner.

### 4.3 بوابة الإشعارات الإلزامية

**قاعدة التفعيل**: تُقيَّم فقط عندما يوجد لاعب مسجَّل والمسار ليس عاماً. المسارات العامة في الويب: `['/player/login', '/player/debug-push']`. في Flutter تسقط صفحة `debug-push` كلياً (أداة ويب تشخيصية)، فيبقى المسار العام الوحيد هو شاشة الدخول. حالة `granted` تمرّ مباشرة إلى الغلاف الطبيعي.

**أسبقية الشاشات في الويب**: `needsInstall` ← `prompt` ← `denied` ← `unsupported (+bypass)`.
**في Flutter**: `prompt` ← `denied` ← `unsupported (+bypass)` — **شاشة needsInstall (4a) تسقط كلياً** لأن التثبيت لم يعد مطلوباً في تطبيق أصلي (لا PWA ولا قيود Safari).

كل شاشات البوابة: حجب كامل (route مستقل يستبدل الـ Shell كاملاً — لا يمكن التنقل خلفه؛ مكافئ `fixed inset-0 z-[99999]`)، خلفية `#050505`، حشوة خارجية 16px (p-4)، بطاقة مركزية كما في §4.0، محتوى موسّط النص، وعناصر داخلية بمسافة 24px (gap-6).

> رابط `🔧 صفحة تشخيص الإشعارات` الموجود أسفل كل شاشة في الويب (10px رمادي `#4b5563` مسطّر، يشير إلى `/player/debug-push`) — **يُحذف في Flutter** (الصفحة الهدف تسقط). بديله التشخيصي: شاشة «تشخيص الإشعارات» داخل الإعدادات إن لزم (خارج نطاق هذا الملف).

#### 4.3.a المرجع الحرفي — شاشة needsInstall في الويب (تسقط في Flutter — تُوثَّق للتكافؤ المرجعي فقط)

نصوصها الحرفية (لا تُنقل، لكنها مرجع مقارنة في 92-qa-parity.md):
- العنوان: `خطوة أخيرة للعب! 📱` (عنبري `#f59e0b`، 24sp bold)
- الشرح: `لتلقي إشعارات دورك الفورية واللعب بسلاسة، يجب تثبيت اللعبة على الشاشة الرئيسية لهاتف الآيفون الخاص بك (قيود نظام iOS).`
- الخطوات الثلاث: «اضغط زر المشاركة» / «إضافة للشاشة الرئيسية» / «افتح التطبيق وابدأ اللعب» مع نصوصها الفرعية (`انقر على أيقونة المشاركة 📤 في شريط Safari السفلي.` — `اسحب القائمة للأعلى ثم اختر "إضافة إلى الشاشة الرئيسية ➕" (Add to Home Screen).` — `افتح اللعبة من شاشتك الرئيسية وسجل دخولك لتفعيل الإشعارات فوراً.`)
- التحذير: `⚠️ نظام Apple يمنع تفعيل الإشعارات إلا من خلال التطبيق المضاف للشاشة الرئيسية.`
- أيقونتها: مربع 80×80 بتدرج عنبري→أصفر مع 🕵️‍♂️ و`pulse-slow` وحلقة ping.

#### 4.3.b شاشة طلب الإذن (prompt) — تُنقل مع تعديل نصي واحد

- **البطاقة**: حد `rgba(245,158,11,0.2)` (amber-500/20)، توهج `BoxShadow: 0 0 50px rgba(245,158,11,0.15)`.
- **بطل الجرس**: دائرة **80×80dp**، خلفية `rgba(245,158,11,0.1)`، حد `rgba(245,158,11,0.3)`، ظل داخلي عنبري (`inset 0 0 20px rgba(245,158,11,0.1)` — في Flutter يُحاكى بتدرج شعاعي داخلي). داخلها أيقونة جرس (SVG stroke خطوطه 1.5، مقاس **40×40dp**، لون `#f59e0b`) تتحرك حركة **bounce** مستمرة (مكافئ animate-bounce: دورة 1s، قفزة −25% مع منحنيات cubic-bezier(0.8,0,1,1)/(0,0,0.2,1))، وحولها حلقة **ping**: حد دائري `rgba(245,158,11,0.2)` يتمدد من scale 1 إلى 2 مع تلاشي إلى 0 خلال **1s cubic-bezier(0,0,0.2,1) infinite**، بشفافية قصوى 30%.
- **العنوان**: **`تفعيل الإشعارات الفورية 🔔`** — أبيض، 24sp bold، tracking واسع قليلاً.
- **الشرح** (حرفي): **`تتطلب لعبة مافيا تفعيل الإشعارات الفورية لتنبيهك بدورك الفوري أثناء اللعب. لن تتمكن من المتابعة بدون تفعيلها لضمان سرعة اللعبة وحماسها للجميع.`** — رمادي `#9ca3af`، 14sp، leading مريح.
- **زر CTA**: عرض كامل، حشوة رأسية 16px وأفقية 24px (py-4 px-6)، زوايا 16px (rounded-2xl)، تدرج `linear-gradient(90deg, #f59e0b, #ca8a04)` (from-amber-500 to-yellow-600)، نص أسود bold، ظل `0 4px 20px rgba(245,158,11,0.3)`، ضغط = تصغير إلى **0.95** (مكافئ active:scale-95، مدة ~100ms)، انتقالات 300ms.
  - التسمية: **`تفعيل الآن وسماح ⚡`**
  - أثناء الطلب: spinner **20px** أسود (حد 2px، قوس شفاف علوي) + نص **`جاري التفعيل...`**، الزر معطّل بشفافية 50%.
- **التلميح** (معدَّل للتطبيق — الأصل الويبي: `عند الضغط، سيظهر لك طلب المتصفح النظامي، يرجى اختيار "سماح" (Allow).`):
  - **النص في Flutter (جديد — تعديل كلمة «المتصفح» فقط)**: `عند الضغط، سيظهر لك طلب النظام، يرجى اختيار "سماح" (Allow).` — رمادي `#6b7280` 12sp، كلمة `"سماح" (Allow)` بعنبري `#f59e0b` semibold.
- **السلوك**: الضغط يستدعي `requestPermission()` من 06-push-notifications.md (`FirebaseMessaging.requestPermission()` + تسجيل التوكن). النجاح → إعادة تقييم البوابة (تصبح granted فيدخل الغلاف الطبيعي). الفشل → يُسجَّل فقط (console/crashlytics)، الزر يعود لحالته — **لا رسالة خطأ للمستخدم** (تكافؤ مع الويب).

#### 4.3.c شاشة الرفض (denied) — تُنقل مع استبدال خطوات المتصفح بفتح إعدادات التطبيق

- **البطاقة**: حد `rgba(239,68,68,0.2)` (red-500/20)، توهج أحمر `0 0 50px rgba(239,68,68,0.1)`.
- **البطل**: دائرة 80×80dp خلفية `rgba(239,68,68,0.1)` بحد `rgba(239,68,68,0.3)`؛ داخلها أيقونة درع-تعجب (shield-exclamation، stroke 1.5، 40×40dp، لون `#ef4444`) بنبض **pulse** (شفافية 1→0.5→1 خلال 2s cubic-bezier(0.4,0,0.6,1) infinite).
- **العنوان**: **`الإشعارات محظورة بالخطأ! ⚠️`** — أحمر `#ef4444`، 24sp bold.
- **الشرح** (حرفي من الويب — يبقى): **`لقد قمت برفض إذن الإشعارات مسبقاً. لا يمكنك اللعب أو تلقي دورك الفوري بدونها. يرجى إعادة تفعيلها باتباع الخطوات التالية:`**
- **بطاقة الخطوات** (الويب: 3 خطوات لمتصفح — `انقر على رمز القفل 🔒 أو الإعدادات في شريط عنوان المتصفح بالأعلى.` / `ابحث عن خيار "الإشعارات" (Notifications).` / `قم بتغيير الإذن إلى "سماح" (Allow).`). **في Flutter تُستبدل بخطوات إعدادات النظام (نصوص جديدة — تحتاج اعتماد المنتج)**، بنفس التنسيق: بطاقة `#121212` بشفافية 80%، حد `rgba(255,255,255,0.05)`، حشوة 20px، زوايا 16px، نص 12sp رمادي `#d1d5db`، أرقام دوائر 20×20 حمراء (`rgba(239,68,68,0.1)` بحد `rgba(239,68,68,0.3)`، رقم أحمر bold):
  1. `اضغط زر "فتح الإعدادات" بالأسفل.`
  2. `ابحث عن خيار "الإشعارات" (Notifications).` *(حرفي من الويب — يُعاد استخدامه)*
  3. `قم بتغيير الإذن إلى "سماح" (Allow).` *(حرفي من الويب — كلمة «سماح» بأخضر `#22c55e` semibold)*
- **الأزرار** (الويب: زر واحد `تحديث الصفحة وإعادة التحقق 🔄` يعمل reload — في Flutter زران):
  - أساسي (نص جديد): **`فتح الإعدادات ⚙️`** — نفس نمط زر الويب: عرض كامل py-4 px-6، خلفية `rgba(255,255,255,0.1)` (hover/pressed: 0.15)، نص أبيض semibold، زوايا 16px، حد `rgba(255,255,255,0.1)` → يستدعي `AppSettings.openAppSettings(type: AppSettingsType.notification)`.
  - ثانوي (نص معدَّل من الويب): **`إعادة التحقق 🔄`** — نفس النمط → يعيد قراءة حالة الإذن فوراً (`getNotificationSettings()`) ويعيد تقييم البوابة.
- **إعادة التقييم التلقائية**: عند عودة التطبيق من الخلفية (`AppLifecycleState.resumed`) تُعاد قراءة حالة الإذن تلقائياً — فالمستخدم العائد من الإعدادات بعد التفعيل يدخل مباشرة دون ضغط أي زر (تحسين على الويب الذي تطلّب reload يدوياً).

#### 4.3.d شاشة غير مدعوم (unsupported) + رمز التجاوز — تبقى لأجهزة Android بلا خدمات Google

في التطبيق الأصلي تحدث فقط عندما تفشل تهيئة FCM نهائياً (جهاز Android بلا Google Play Services). على iOS لا تحدث أبداً (APNs مدمج).

- **البطاقة**: حد `rgba(59,130,246,0.2)` (blue-500/20)، توهج أزرق `0 0 50px rgba(59,130,246,0.1)`.
- **البطل**: دائرة 80×80dp زرقاء (`rgba(59,130,246,0.1)` بحد `rgba(59,130,246,0.3)`) مع أيقونة كرة أرضية (globe SVG، stroke 1.5، 40×40dp، `#3b82f6`) — بلا أنيميشن.
- **العنوان** (معدَّل — الأصل الويبي `المتصفح غير مدعوم 🌐`): **نص جديد**: `جهازك لا يدعم خدمات الإشعارات 🌐` — أبيض 24sp bold.
- **الشرح** (معدَّل — الأصل: `متصفحك الحالي لا يدعم إشعارات الويب المطلوبة لتنبيهك بدورك الفوري أثناء اللعب.`): **نص جديد**: `جهازك الحالي لا يدعم خدمات الإشعارات المطلوبة لتنبيهك بدورك الفوري أثناء اللعب.`
- **بطاقة النصيحة** (الويب: نصيحة باستخدام Chrome/Safari — تسقط لأنها بلا معنى في تطبيق): **نص جديد**: بطاقة `#121212/80` حد `rgba(255,255,255,0.05)` حشوة 16px نص 12sp رمادي `#d1d5db`: `يتطلب التطبيق خدمات Google Play لتشغيل الإشعارات. إن كان جهازك لا يوفرها، استخدم رمز التجاوز أدناه.`
- **زر التحديث** (الويب: `تحديث الصفحة 🔄` = reload): **نص معدَّل**: `إعادة المحاولة 🔄` — نمط `rgba(255,255,255,0.1)` كامل العرض → يعيد محاولة تهيئة FCM وتقييم البوابة.
- **قسم رمز التجاوز** (يُنقل حرفياً): فاصل علوي `border-top: 1px rgba(255,255,255,0.1)` مع حشوة علوية 16px، ثم:
  - النص (حرفي): **`جهازك قديم ولا يدعم الإشعارات؟ أدخل رمز التجاوز للمتابعة بدون إشعارات:`** — رمادي `#9ca3af` 12sp.
  - صف بمسافة 8px: حقل رقمي (يتمدد) + زر:
    - **الحقل**: `keyboardType: number`، حد أقصى 4 خانات، **تصفية غير-الأرقام فورياً** (`FilteringTextInputFormatter.digitsOnly` + قص إلى 4)، placeholder **`••••`**، نص موسّط 18sp أبيض بتباعد أحرف واسع (`letterSpacing` مكافئ tracking-0.5em ≈ 9px عند 18sp)، حشوة رأسية 12px، زوايا 12px (rounded-xl)، خلفية `#121212`، حد `rgba(255,255,255,0.1)`، عند التركيز حد `rgba(245,158,11,0.5)`، semanticLabel: **`رمز التجاوز`**. إدخال «تم/Enter» في الكيبورد = إرسال. الكتابة تمسح رسالة الخطأ.
    - **الزر**: **`دخول`** — حشوة أفقية 20px، خلفية `#f59e0b`، نص أسود bold، زوايا 12px؛ **معطّل بشفافية 40% حتى اكتمال 4 خانات**.
  - **التحقق**: الرمز الصحيح **`1998`** (مقارنة بعد trim). صحيح → كتابة العلم `notifications_unsupported = 'true'` في التخزين الدائم (SharedPreferences) وفتح التطبيق **نهائياً** (العلم لا ينتهي). خاطئ → سطر خطأ أحمر `#ef4444` بحجم 12sp تحت الصف: **`الرمز غير صحيح`**.

### 4.4 بوابة الإصدار (Force Update)

**الآلية الويبية الحالية (المرجع)** — سكربت inline في `app/layout.tsx` يعمل قبل React:
- الثابت `APP_VERSION = '2.5.0'` مبثوق في HTML، ومفتاح التخزين `mafia_app_version`.
- إن وُجدت قيمة محفوظة **مختلفة**: يكتب الإصدار الجديد أولاً (منع loop)، يمسح **كل** الـ CacheStorage (`caches.keys()` → `delete`)، يلغي تسجيل كل Service Workers، ثم `location.reload(true)` بعد **300ms** (أو فوراً إن لا SW). لا واجهة مستخدم إطلاقاً — صامتة.
- إن لم توجد قيمة أو تطابقت: يكتب القيمة ويكمل.

**في Flutter — مركّبتان**:

**(أ) كشف تغيّر الإصدار محلياً (تكافؤ مباشر)**: عند كل إقلاع، قارن `PackageInfo.version+buildNumber` مع المفتاح `mafia_app_version` في SharedPreferences. عند الاختلاف: اكتب القيمة الجديدة أولاً، ثم امسح الكاشات المحلية القابلة للإبطال (كاش REST إن وُجد في 03-networking-rest.md + كاش الصور) — **بدون أي شاشة** (صامتة كالويب). هذا يضمن عدم بقاء بيانات schema قديم بعد التحديث.

**(ب) التحديث الإجباري من بعيد (جديد — لا مكافئ ويبي لأن الويب يتحدث ذاتياً)**: عبر **Firebase Remote Config** (نفس مشروع FCM — لا endpoint جديد في backend النادي):
- المفاتيح المقترحة (تُعتمد نهائياً في 90/91-release):
  - `min_supported_build_android` (int) — أقل build مسموح على Android.
  - `min_supported_build_ios` (int) — أقل build مسموح على iOS.
  - `latest_build_android` / `latest_build_ios` (int) — أحدث build منشور (للتحديث الاختياري).
  - `store_url_android` / `store_url_ios` (string) — روابط المتجرين.
- **الجلب**: عند الإقلاع (`fetchAndActivate` بمهلة اتصال 10s و`minimumFetchInterval: 1 ساعة`) وعند كل `AppLifecycleState.resumed`. فشل الجلب = استخدام آخر قيم مفعّلة؛ لا قيم إطلاقاً (تثبيت أول بلا إنترنت) = **لا حجب** (fail-open — القرار: لا نمنع اللعب بسبب تعذر Remote Config).
- **القرار**: `currentBuild < min_supported_build_*` → **شاشة حجب كاملة غير قابلة للإغلاق** (تسبق كل شيء حتى شاشة الدخول). `min ≤ currentBuild < latest_build_*` → **بانر اختياري** غير حاجب أعلى تبويب الرئيسية (تصميمه ضمن 12-home.md؛ هذا الملف يعرّف الشرط فقط).

**شاشة التحديث الإجباري** (كل نصوصها **جديدة** — لا مقابل ويبي — تحتاج اعتماد المنتج):
- نفس قالب بطاقات البوابة (§4.0): خلفية `#050505`، بطاقة `#0c0c0c/90` بحد `rgba(245,158,11,0.2)` وتوهج عنبري 0.15، fadeInUp 500ms.
- بطل: دائرة 80×80dp عنبرية (`rgba(245,158,11,0.1)` بحد `rgba(245,158,11,0.3)`) وبداخلها ⬆️ بحجم 36sp، مع حلقة ping عنبرية (كما في §4.3.b).
- العنوان: `تحديث جديد إلزامي! ⬆️` — عنبري `#f59e0b`، 24sp bold.
- الشرح: `هذه النسخة من التطبيق أصبحت قديمة ولا يمكنها الاتصال بالنظام. حدّث التطبيق من المتجر للمتابعة باللعب.` — رمادي `#9ca3af` 14sp.
- زر CTA (نمط زر §4.3.b الأساسي كاملاً): `تحديث الآن من المتجر ⬆️`.
  - Android: أولاً محاولة **In-App Update (immediate flow)** عبر حزمة `in_app_update`؛ عند فشلها أو عدم توفرها → فتح `store_url_android` عبر `url_launcher` (externalApplication).
  - iOS: فتح `store_url_ios` مباشرة.
- **لا زر إغلاق، لا رجوع** (`PopScope(canPop: false)`)، وتُعاد المقارنة عند `resumed` (العائد بعد التحديث الفعلي سيحمل build أحدث فتزول الشاشة تلقائياً... عملياً العملية تقتل وتعيد تشغيل التطبيق).

### 4.5 سحب-للتحديث

**المرجع الويبي**: hook يدوي يعمل فقط عندما (iOS أو standalone PWA): يسجّل بداية اللمس فقط عند `scrollY === 0`؛ يعتبر المستخدم «يسحب» عند تجاوز مسافة **60px**؛ عند الإفلات وبعد تجاوز **80px** → `window.location.reload()` كاملة. مؤشر السحب: شريط علوي مثبّت (z-200) بحشوة علوية 16px وفيه spinner **32px** (حد 2px، `rgba(245,158,11,0.4)` مع قوس علوي `#f59e0b`). **قواعد الكبت**: يُلغى كلياً عندما يحمل الـ body صنف `modal-open` أو `in-game` أو عندما `body.style.position === 'fixed'`.

**في Flutter — يُستبدل بالكامل**:
- كل شاشة تبويب قابلة للتمرير تلف محتواها بـ `RefreshIndicator` قياسي:
  - `color: #f59e0b`، `backgroundColor: #0c0c0c`، `displacement: 40`، `strokeWidth: 2`.
  - على iOS يجوز `CupertinoSliverRefreshControl` بنفس اللونين (قرار تنفيذ موحّد: استخدام `RefreshIndicator.adaptive`).
- **الفعل عند السحب**: ليس reload — بل إعادة جلب بيانات الشاشة الحالية + تحديث الجلسة (`GET /api/player-auth/me` عبر 05-session-auth.md) بالتوازي، مع انتظار `Future.wait` قبل إخفاء المؤشر.
- **قواعد الكبت تُنقل دلالياً**: لا `RefreshIndicator` إطلاقاً في شاشات اللعب (20–27) ولا داخل الـ bottom sheets/المودالات. أعلام `modal-open`/`in-game` الويبية تصبح غير ضرورية لأن الكبت هنا بنيوي (المؤشر ببساطة غير موجود في تلك الشاشات) — لا حاجة لأي provider مواز.
- المسافات 60/80px الويبية خاصة بالـ hack اليدوي ولا تُنقل؛ نستخدم عتبات `RefreshIndicator` القياسية.

### 4.6 شريط التنقل السفلي BottomNav

**البنية**: شريط مثبّت أسفل الشاشة على كل شاشات التبويبات (يختفي في شاشات اللعب — 20-game-state-core.md يتحكم بذلك عبر مسارات خارج الـ ShellRoute).

- **الخلفية**: `linear-gradient(180deg, rgba(10,10,10,0.95) 0%, rgba(5,5,5,1) 100%)` — من أعلى لأسفل.
- **حد علوي**: `1px solid rgba(251,191,36,0.15)`.
- الويب يضيف `backdrop-filter: blur(20px)` — ~~يُستغنى عن الـ blur~~ **مُعدَّل (قرار المالك، 95 §4)**: الشريط صار كبسولة زجاجيّة طافية على المنصّتين (`liquid_glass_nav.dart`) بهندسةٍ من `glass_tokens.dart` ومادّةٍ متدرّجة عبر `GlassQuality` — زجاج/ضباب على الأجهزة القادرة، وتعبئة شفيفة **بلا blur** على الدرجة الخفيفة (انظر §13 المعدَّلة). كسرُ تكافؤ الويب هنا مقصود وموثَّق.
- **الحشوة السفلية**: `SafeArea(bottom)` — مكافئ `env(safe-area-inset-bottom)` لمؤشر الصفحة الرئيسية في iOS وأزرار Android الإيمائية.
- **الصف الداخلي**: ارتفاع **64dp**، محاذاة العناصر للأسفل (items-end)، توزيع `spaceAround`، عرض أقصى **512dp** (max-w-lg) موسّطاً، حشوة أفقية 8px (px-2).

**التبويبات الخمسة** (المصفوفة حرفياً من `BottomNav.tsx`؛ الترتيب في RTL يبدأ من اليمين — `Directionality.rtl` في Flutter تعطي نفس الترتيب تلقائياً):

| # | المسار | التسمية | الأيقونة | ملاحظة |
|---|---|---|---|---|
| 1 | `/player/home` | **`الرئيسية`** | منزل (path M3 9l9-7 9 7v11… + polyline باب) | نشط أيضاً عندما المسار `/player` |
| 2 | `/player/games` | **`الألعاب`** | يد تحكم (rect 20×12 rx2 + خطّا D-pad + دائرتان r1) | |
| 3 | `/player/join` | **`ادخل`** | درع-صح (path M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z + صح M9 12l2 2 4-4) | **الزر المركزي المرتفع** |
| 4 | `/player/rank` | **`التصنيف`** | نجمة (polygon 12 2 15.09 8.26 22 9.27 …) | |
| 5 | `/player/profile` | **`حسابي`** | شخص (دائرة رأس r4 + path كتفين) | |

**التبويب العادي**:
- عمود موسّط: أيقونة stroke **22×22dp** (سماكة خط 2، strokeLinecap/Join round) ثم التسمية بحجم **10sp** بمسافة علوية 4px (mt-1)؛ عرض أدنى للهدف **56dp**، حشوة رأسية 8px (py-2).
- الألوان: نشط **`#fbbf24`** / خامل **`#6b7280`** (الأيقونة والتسمية معاً).
- **مؤشر النشاط**: شريط **20×2dp** بزوايا كاملة الاستدارة، لون `#fbbf24`، ملتصق بأعلى التبويب (top: 0). في الويب ينزلق بين التبويبات بـ framer-motion `layoutId="activeTab"` (spring). في Flutter: `AnimatedPositioned` داخل Stack الشريط (يُحسب x مركز التبويب النشط) بمدة **300ms** ومنحنى `Curves.easeOutCubic` — تقريب معتمد لسبرينغ framer الافتراضي. المؤشر لا يظهر فوق الزر المركزي أبداً.
- كشف النشاط: تطابق تام للمسار (`pathname === tab.href`)، مع الاستثناء الوحيد أعلاه لجذر `/player`.

**الزر المركزي «ادخل»**:
- مرفوع فوق الشريط: إزاحة رأسية **−20dp** (marginTop: -20px) — في Flutter `Transform.translate(offset: Offset(0, -20))` أو Positioned داخل Stack، مع السماح بالرسم خارج حدود الشريط (`clipBehavior: Clip.none`).
- دائرة **56×56dp**:
  - نشط: خلفية `linear-gradient(135deg, #fbbf24, #b45309)` (topRight→bottomLeft في RTL؛ استخدم `Alignment.topLeft→bottomRight` بإحداثيات بصرية مطابقة للويب).
  - خامل: خلفية كحلية داكنة `linear-gradient(135deg, #1a1a2e, #16213e)`.
  - حد دائم: `2px solid rgba(251,191,36,0.6)`.
  - ظل نشط: `0 0 20px rgba(251,191,36,0.4)` + `0 4px 15px rgba(0,0,0,0.5)`؛ ظل خامل: `0 0 10px rgba(251,191,36,0.15)` + `0 4px 10px rgba(0,0,0,0.5)`.
- أيقونة الدرع **28×28dp**: نشطة = تعبئة `#fbbf24` مع stroke `#b45309` (بما فيه علامة الصح الداخلية)؛ خاملة = بلا تعبئة، stroke `#fbbf24`.
- التسمية `ادخل` تحت الدائرة بنفس نمط التسميات (10sp، نشط `#fbbf24` / خامل `#6b7280`).
- تفاعل الضغط: تصغير إلى **0.9** أثناء اللمس (مكافئ whileTap) — `AnimatedScale` بمدة 100ms مع الرجوع عند الرفع.
- الوجهة: فرع تبويب `/player/join` (21-join-lobby.md).

**التنقل**: `StatefulShellRoute.indexedStack` بخمسة فروع — كل فرع يحتفظ بحالته وscroll position عند التبديل. **فرق مقصود عن الويب** (الويب يعيد بناء الصفحة عند كل تنقل): الاحتفاظ بالحالة تحسين مقبول، لكن يجب إعادة جلب بيانات التبويب إذا مرّ أكثر من 60 ثانية على آخر جلب (قاعدة staleness موحّدة تُفصَّل لكل تبويب في ملفه).

### 4.7 الغلاف الطبيعي والحالات الخاصة بالمسارات

- **الغلاف الطبيعي** (بوابات مجتازة): Scaffold بخلفية `#050505`؛ محتوى التبويب يحصل على حشوة سفلية **80dp** (pb-20) كي لا يغطيه الشريط (أو `MediaQuery.padding` عبر `extendBody: true` مع الحشوة نفسها). سلوك overscroll glow معطّل (مكافئ `overscrollBehavior: none`) — `ScrollBehavior` بدون glow، مع إبقاء فيزياء iOS bounce داخل `RefreshIndicator` فقط.
- **تبويب `/player/join` معاملة خاصة** (تكافؤ حرفي مع الويب): لا auth-redirect (الجلسة تُعالج داخل PlayerFlow — إعفاء في حارس go_router)، ولا تعرض القشرة شاشة التحميل له (يدير تحميله بنفسه). **لكن بوابة الإشعارات تنطبق عليه** عندما يكون اللاعب مسجلاً (في الويب ليس ضمن PUBLIC_PATHS). BottomNav يبقى ظاهراً في شاشة إدخال الكود، ويختفي عند دخول اللعبة الفعلية (مسارات اللعبة خارج الـ ShellRoute — تفاصيل 08-deeplinks-routing.md و21-join-lobby.md).
- **`/join/{roomCode}` عام خارج القشرة كلياً**: بلا provider جلسة، بلا بوابة إشعارات، بلا BottomNav — يفتح PlayerFlow مباشرة حتى لغير المسجلين (روابط QR). في Flutter: route من الجذر خارج الـ ShellRoute ومُعفى من كل الحراس (08-deeplinks-routing.md).
- **التنقل المعلّق من إشعار (cold start)**: حيلة الويب (قراءة `/__pending_nav` من كاش `mafia-auth` المكتوب بواسطة الـ SW ثم `router.replace`) **تسقط كلياً** — تُستبدل بـ `FirebaseMessaging.getInitialMessage()` (إقلاع بارد) و`onMessageOpenedApp` (خلفية) → توجيه مباشر عبر go_router بعد جاهزية الجلسة. التفاصيل في 06-push-notifications.md؛ القشرة تضمن فقط أن التوجيه يحدث **بعد** بلوغ حالة authenticated واجتياز البوابات.

### 4.8 حالات الخطأ والحالات الفارغة

- فشل `/me` عند الإقلاع (شبكة): سقوط إلى unauthenticated → شاشة الدخول (لا شاشة خطأ في القشرة — تكافؤ مع الويب الذي يمسح الجلسة عند أي فشل). تحسين مسموح (قرار 05-session-auth.md): التمييز بين 401 (مسح الجلسة) وفشل شبكة (إبقاء الجلسة مع وضع offline).
- فشل `requestPermission()`: صامت (§4.3.b).
- فشل Remote Config: fail-open (§4.4).
- لا حالة فارغة للقشرة ذاتها.

---

## 5. التكيّف مع الشاشات 6→11 إنش

وفق فئات Window Size Classes المعتمدة (compact < 600dp، medium 600–840dp، expanded > 840dp):

### compact (< 600dp — هواتف 6–7 إنش)
- التكافؤ الحرفي مع الـ PWA كما واصف §4 بلا أي تغيير: بطاقات البوابة بعرض `min(العرض − 32, 448dp)`، الشريط السفلي بصف داخلي يملأ العرض حتى 512dp، حشوة بطاقات البوابة 24px (تصبح 32px فقط عند عرض ≥ 768dp — انظر medium).

### medium (600–840dp — تابلت 8 إنش)
- **بطاقات البوابات وشاشة force update**: تبقى بعرض أقصى **448dp** موسّطة أفقياً ورأسياً (الفراغ الجانبي خلفية `#050505` فارغة). حشوة البطاقة ترتفع إلى **32px** (مكافئ `md:p-8` الذي يتفعّل عند ≥768px في الويب — نعتمد تفعيله من بداية medium أي 600dp لتجنب قفزة داخل الفئة الواحدة).
- **شاشة التحميل والـ spinners**: بلا تغيير (48px/40px/32px كما هي).
- **BottomNav**: الشريط (الخلفية والحد) بعرض الشاشة كاملاً؛ الصف الداخلي (التبويبات) يبقى مقيّداً بـ **512dp** موسّطاً — تطابق حرفي مع `max-w-lg mx-auto` الويبي. لا تكبير للأيقونات أو الأهداف.
- **محتوى التبويبات**: القشرة تفرض على أبنائها سقف عرض نصي 640dp (كل تبويب يواصف تفاصيله في ملفه) عبر `ConstrainedBox` اختياري يوفره الـ Shell كـ helper موحّد `ShellContentWidth(maxWidth: 640)`.

### expanded (> 840dp — تابلت 10–11 إنش)
- **قرار معتمد: يبقى BottomNav سفلياً في كل الفئات** (لا NavigationRail) — لأن التطبيق يُستخدم باليدين عمودياً أثناء اللعب الفعلي في النادي، وتكافؤ الذاكرة العضلية مع الـ PWA مقدَّم. الصف الداخلي يبقى 512dp موسّطاً؛ الفراغان الجانبيان جزء من خلفية الشريط المتدرجة (لا ينقطع الحد العلوي).
- **بطاقات البوابات**: تبقى 448dp (ليست عناصر لعب حساسة — لا مضاعفة)، لكن بطل الشاشة (دائرة 80dp) يرتفع إلى **96dp** والأيقونة الداخلية من 40 إلى **48dp** حفاظاً على التوازن البصري في المساحة الأكبر.
- **محتوى التبويبات**: سقف 840–960dp لكل تبويب حسب ملفه؛ helper القشرة يقبل override: `ShellContentWidth(maxWidth: 960)`.
- **سحب-للتحديث**: `displacement` يرتفع إلى 56 (مؤشر أبعد قليلاً عن الحافة).
- الوضع الأفقي (landscape): نفس القواعد — الشريط يبقى سفلياً، والبوابات تسمح بالتمرير الرأسي داخل البطاقة إن ضاق الارتفاع (مكافئ `overflow-y-auto my-8` الموجود أصلاً في شاشة needsInstall الويبية — يُطبَّق على كل البوابات في Flutter عبر `SingleChildScrollView`).

---

## 6. المنطق والتدفقات

### 6.1 آلة حالات القشرة (تُقيَّم بهذا الترتيب الصارم عند كل إقلاع وعند كل تغيّر مدخلات)

```
[إقلاع]
  → (أ) كشف تغيّر الإصدار المحلي (§4.4-أ): صامت — كتابة + مسح كاشات
  → (ب) Remote Config fetch (غير حاجب، مهلة 10s، fail-open)
        currentBuild < minSupportedBuild ؟ → [شاشة ForceUpdate — نهائية حتى resumed]
  → (ج) استعادة الجلسة (05): isLoading ؟ → [شاشة التحميل §4.1]
        (إلا إذا كان المسار الحالي فرع join → لا شاشة تحميل)
  → (د) لا لاعب + مسار غير عام (وغير join/roomCode) → redirect إلى شاشة الدخول
        لاعب موجود + المسار شاشة الدخول → redirect إلى /player/home
  → (هـ) لاعب موجود + مسار غير عام → تقييم بوابة الإشعارات:
        prompt      → [شاشة 4.3.b]
        denied      → [شاشة 4.3.c]
        unsupported && !bypassFlag → [شاشة 4.3.d]
        granted (أو bypassFlag) → (و)
  → (و) الغلاف الطبيعي: ShellRoute بخمسة فروع + BottomNav
  → (ز) التنقل المعلّق من إشعار: getInitialMessage / onMessageOpenedApp
        يُنفَّذ فقط بعد بلوغ (و)، مرة واحدة، router.replace للوجهة إن اختلفت
```

### 6.2 إعادة التقييم الحية

- **تغيّر حالة إذن الإشعارات**: عند `AppLifecycleState.resumed` تُقرأ `getNotificationSettings()` من جديد — عودة من الإعدادات بعد تفعيل يدوي تُسقط شاشة denied فوراً بلا تدخل. النجاح داخل شاشة prompt يعيد التقييم لحظياً.
- **Remote Config عند resumed**: `fetchAndActivate` (يخضع لـ minimumFetchInterval ساعة) ثم إعادة تقييم شرط force update — تطبيق مفتوح لأيام يُحجب عند رفع الحد الأدنى.
- **bypassFlag**: يُقرأ مرة عند الإقلاع من SharedPreferences ويُحدَّث في الذاكرة عند إدخال الرمز الصحيح — دائم ولا يُمسح عند logout (تكافؤ مع الويب حيث المفتاح localStorage مستقل عن الجلسة).
- **تغيّر الجلسة**: login → إعادة تقييم كامل (البوابات قد تظهر أول مرة بعد الدخول)؛ logout → القشرة تعود لشاشة الدخول (البوابات لا تُعرض لغير المسجلين — تكافؤ مع شرط `player && !isPublic`).

### 6.3 الحالات الحدّية

- **لاعب غير مسجل يفتح فرع join من الشريط**: مسموح — الإعفاء يُنقل حرفياً (الويب: `isGamePage` يتخطى الحارس). PlayerFlow يعالج الهوية داخلياً. عدم نقل هذا الإعفاء = ارتداد خاطئ لشاشة الدخول (خطأ موثّق في تقرير المصدر).
- **إشعار force update أثناء اللعب**: شاشة الحجب تُقيَّم عند resumed فقط — لن تقطع جلسة لعب جارية في المقدمة (fetch لا يغيّر الشاشة إلا عند إعادة التقييم). قرار مقصود لحماية اللعب الحي.
- **الرمز 1998 على جهاز يدعم FCM لاحقاً**: العلم دائم؛ شاشة unsupported لن تظهر مجدداً، لكن إذا أصبحت الحالة prompt/denied (خدمات متوفرة) فالبوابات الأخرى تعمل طبيعياً — ترتيب الأسبقية يضمن ذلك.
- **سباق «التنقل المعلّق» مع البوابات**: الوجهة القادمة من الإشعار تُخزَّن في متغير `pendingRoute` ولا تُنفَّذ إلا بعد بلوغ الغلاف الطبيعي؛ إن بقي المستخدم محجوباً ببوابة فالوجهة تنتظر (لا تسقط) حتى الاجتياز خلال نفس دورة حياة التطبيق.
- **دوران الشاشة أثناء بوابة مفتوحة**: البوابات routes كاملة — تعاد بناؤها طبيعياً، حقل الرمز يحتفظ بمحتواه (state في الـ widget).
- **إعادة الاتصال واستعادة الحالة**: القشرة لا تتعامل مع socket مباشرة؛ دورة init/reconnect في 04-socket-layer.md. عند عودة online بعد انقطاع، الـ RefreshIndicator هو مسار الاسترداد اليدوي للمستخدم، و`/me` عند resumed (05) هو المسار التلقائي.

### 6.4 المؤقتات والمهل

| المؤقت | القيمة | المصدر |
|---|---|---|
| كتابة الإصدار ثم reload (ويب — مرجع فقط) | 300ms | `app/layout.tsx` |
| مهلة fetch لـ Remote Config | 10s (جديد) | §4.4 |
| minimumFetchInterval لـ Remote Config | 1 ساعة (جديد) | §4.4 |
| staleness إعادة جلب تبويب عند التبديل | 60s (جديد موحّد) | §4.6 |
| عتبات السحب الويبية 60/80px | لا تُنقل | §4.5 |
| مهلة ack للـ socket | 15s | 04-socket-layer.md |
| أنيميشن fadeInUp | 500ms ease-out | tailwind.config.js |
| ping | 1s cubic-bezier(0,0,0.2,1) infinite | Tailwind |
| pulse | 2s cubic-bezier(0.4,0,0.6,1) infinite | Tailwind |
| pulse-slow | 3s cubic-bezier(0.4,0,0.6,1) infinite | tailwind.config.js |
| bounce / spin | 1s infinite | Tailwind |
| انزلاق مؤشر التبويب | 300ms easeOutCubic (تقريب spring) | §4.6 |
| تصغير الضغط (0.9 / 0.95) | ~100ms | §4.6 / §4.3.b |

---

## 7. عقود التكامل

### REST

القشرة ذاتها تستهلك عقداً واحداً (عبر 05-session-auth.md):

**GET `/api/player-auth/me`** — Header: `Authorization: Bearer <playerToken>`
- 200: `{ success: true, player: { id, playerId, phone, name, gender, dob, avatarUrl, email, totalMatches, totalWins, totalSurvived, mustChangePassword }, staffInfo: { staffId, username, role, displayName, permissions[] } | null, staffToken: string | null, activeGame: { roomId, roomCode, gameName, physicalId, role (null حتى rolesConfirmed), isAlive, phase } | null, frozenGames: [نفس الشكل] }`
- أخطاء: 401 (توكن غير صالح — مسح الجلسة)، 404 (لاعب محذوف)، 503 (DB down)، 500.
- متى: عند الإقلاع (استعادة جلسة)، عند resumed، وعند سحب-للتحديث.

**لا يوجد endpoint لإصدار التطبيق** — force update عبر Firebase Remote Config حصراً (§4.4). ممنوع إضافة أي نداء آخر من القشرة.

### Socket

لا تسجّل القشرة أي حدث لعبة. علاقتها بالطبقة (04-socket-layer.md):
- تشغيل init للـ singleton بعد بلوغ authenticated (حمولة المصافحة: `auth = { token: <staffToken أو leader_token أو ''>, playerToken: <mafia_player_token أو ''> }` تُرسل عند كل connect/reconnect).
- استدعاء `reconnectSocketAuth()` بعد login/staff-link (تفصيله في 05).
- خيارات الاتصال المرجعية: `transports: ['polling','websocket']` في الويب — للتطبيق الأصلي يعتمد قرار 04-socket-layer.md (`websocket` فقط بعد التحقق من الخادم)، reconnection لا نهائية بتأخير 1000→5000ms، timeout 20000ms.

### Firebase (ليست backend النادي)

- Remote Config: المفاتيح الستة في §4.4-ب. القيم أرقام build صحيحة وروابط متاجر.
- FCM: `getInitialMessage()` / `onMessageOpenedApp` — عقود الحمولة في 06-push-notifications.md.

---

## 8. نماذج Dart المطلوبة

```dart
/// حالة بوابة الإشعارات كما تراها القشرة (مصدرها 06-push-notifications.md)
enum NotificationGateStatus { granted, prompt, denied, unsupported }

/// نتيجة تقييم بوابة الإصدار
class VersionGateResult {
  final bool forceUpdate;        // currentBuild < minSupportedBuild
  final bool softUpdateAvailable; // minSupported <= currentBuild < latestBuild
  final int currentBuild;
  final int minSupportedBuild;   // من Remote Config (0 إن غاب => fail-open)
  final int latestBuild;
  final String storeUrl;         // حسب المنصة
}

/// تعريف تبويب في الشريط السفلي
class ShellTabDef {
  final String route;      // '/player/home' ...
  final String label;      // 'الرئيسية' ...
  final ShellTabIcon icon; // enum: home, games, shield, rank, profile
  final bool isCenter;     // true لتبويب 'ادخل' فقط
}
enum ShellTabIcon { home, games, shield, rank, profile }

/// حالة القشرة المركّبة (Riverpod provider)
sealed class ShellState {}
class ShellLoading extends ShellState {}                 // §4.1
class ShellForceUpdate extends ShellState {              // §4.4
  final VersionGateResult version;
}
class ShellUnauthenticated extends ShellState {}         // redirect للدخول
class ShellGateBlocked extends ShellState {              // §4.3
  final NotificationGateStatus status;                   // prompt|denied|unsupported
}
class ShellReady extends ShellState {}                   // الغلاف الطبيعي

/// مخزن أعلام القشرة الدائمة
class ShellFlagsStore {
  Future<bool> getUnsupportedBypass();        // مفتاح 'notifications_unsupported'
  Future<void> setUnsupportedBypass();        // يكتب 'true'
  Future<String?> getStoredAppVersion();      // مفتاح 'mafia_app_version'
  Future<void> setStoredAppVersion(String v);
}
```

نماذج `PlayerProfile` / `StaffInfo` / `ActiveGameSummary` معرّفة في 02-models-data-layer.md وتُستهلك هنا كما هي.

---

## 9. الحزم المستخدمة

| الحزمة | الغرض |
|---|---|
| `go_router` | StatefulShellRoute.indexedStack بخمسة فروع + الحراس والإعفاءات |
| `flutter_riverpod` | ShellState / أعلام / تركيب الجلسة والبوابات |
| `firebase_messaging` | حالة الإذن + requestPermission + getInitialMessage (عبر 06) |
| `firebase_remote_config` | بوابة الإصدار (§4.4) |
| `package_info_plus` | version/buildNumber الحاليان |
| `shared_preferences` | `mafia_app_version`، `notifications_unsupported` |
| `app_settings` | فتح إعدادات إشعارات التطبيق (شاشة denied) |
| `in_app_update` | التحديث الفوري داخل التطبيق (Android فقط) |
| `url_launcher` | فتح روابط المتجرين (externalApplication) |
| `flutter_svg` | أيقونات التبويبات والبوابات المصدَّرة كـ SVG (بديل: CustomPainter) |

(الخط Tajawal والألوان عبر 01-foundation-theme.md؛ socket_io_client عبر 04.)

---

## 10. اختلافات Android / iOS

- **إذن الإشعارات**:
  - Android 13+ (API 33): إذن `POST_NOTIFICATIONS` صريح → حالات prompt/denied حقيقية. Android ≤ 12: الإذن ممنوح افتراضياً → البوابة عملياً granted من أول إقلاع.
  - iOS: `requestPermission()` يعرض حوار النظام مرة واحدة فقط؛ الرفض بعدها = denied دائم حتى تغييره من الإعدادات. حالة `provisional` إن اعتُمدت في 06 تُعامل كـ granted في هذه البوابة.
  - حالة unsupported (§4.3.d): Android فقط (أجهزة بلا Google Play Services). على iOS لا تُعرض أبداً.
- **Force update**: Android يجرّب In-App Update (immediate) أولاً ثم رابط Play Store؛ iOS رابط App Store فقط (لا آلية in-app). Remote Config بمفاتيح منفصلة لكل منصة.
- **زر الرجوع (Android)**: داخل الغلاف الطبيعي، back من تبويب غير الرئيسية = الانتقال لتبويب الرئيسية؛ back من الرئيسية = مغادرة التطبيق (سلوك StatefulShellRoute القياسي مع `PopScope`). شاشات force update وbypass: `canPop: false`. iOS: لا زر رجوع نظامي؛ إيماءة الرجوع من الحافة معطّلة في شاشات البوابة (routes بلا صفحة سابقة).
- **SafeArea**: iOS مؤشر الصفحة الرئيسية أسفل الشريط (مكافئ env(safe-area-inset-bottom))؛ Android الإيماءات/الأزرار — كلاهما عبر SafeArea نفسه، لا كود خاص.
- **سحب-للتحديث**: `RefreshIndicator.adaptive` يعطي مؤشر Material على Android وspinner iOS على iOS بنفس اللونين المحددين في §4.5.
- **شريط الحالة**: Android `SystemUiOverlayStyle(statusBarColor: #050505, statusBarIconBrightness: light)`؛ iOS `statusBarBrightness: dark` (مكافئ black-translucent).

---

## 11. الأصول المطلوبة

- **أيقونات التبويبات الخمس** — إعادة رسم SVGs اليدوية من `BottomNav.tsx` (viewBox 24×24، stroke 2، round caps/joins) كملفات أصول: `assets/icons/nav_home.svg`، `nav_games.svg`، `nav_shield.svg` (نسختان: outline وfilled-with-check)، `nav_rank.svg`، `nav_profile.svg`. المسارات الهندسية منسوخة في جدول §4.6.
- **أيقونات البوابات** — من `player/layout.tsx` (viewBox 24×24، stroke 1.5): `gate_bell.svg` (الجرس)، `gate_shield_alert.svg` (درع-تعجب)، `gate_globe.svg` (كرة أرضية).
- **إيموجي نصية** (تُعرض كنص، لا أصول): 🔔 ⚠️ 🌐 ⚡ 🔄 ⚙️ ⬆️ ••••، مع ملاحظة اختلاف شكل الإيموجي بين المنصات (مقبول).
- **الخط**: Tajawal (أوزان 400/700) — مضمَّن عبر 01-foundation-theme.md (`font-arabic` = Tajawal ثم Inter؛ الجذر الويبي يحمّل أيضاً Cairo/Amiri/Noto Kufi/Reem Kufi لشاشات أخرى — توزيعها في 01).
- لا صور نقطية ولا Lottie ولا أصوات في هذا الملف.

---

## 12. معايير القبول — checklist تكافؤ

- [ ] شاشة التحميل: spinner 48px عنبري + `جاري التحميل...` بعنبري 60% على `#050505`، ولا تظهر أبداً فوق فرع الانضمام.
- [ ] `/player` (الجذر) يوجّه دائماً إلى تبويب الرئيسية.
- [ ] بدون جلسة: أي مسار محمي يعيد التوجيه لشاشة الدخول؛ فرع الانضمام ورابط `/join/{code}` مستثنيان ويعملان بلا جلسة.
- [ ] مع جلسة: فتح شاشة الدخول يعيد التوجيه للرئيسية.
- [ ] بوابة prompt: العنوان `تفعيل الإشعارات الفورية 🔔` والشرح الحرفي كاملاً، زر `تفعيل الآن وسماح ⚡` بالتدرج والظلال المحددة، حالة `جاري التفعيل...` مع spinner أسود 20px وتعطيل 50%، جرس 40px يقفز داخل دائرة 80px مع حلقة ping.
- [ ] بوابة denied: العنوان `الإشعارات محظورة بالخطأ! ⚠️` بالأحمر، الشرح الحرفي، زر يفتح إعدادات إشعارات التطبيق فعلياً، والعودة من الإعدادات بعد التفعيل تُسقط البوابة تلقائياً بلا أي ضغطة.
- [ ] بوابة unsupported (Android بلا Play Services فقط): نص التجاوز الحرفي `جهازك قديم ولا يدعم الإشعارات؟ أدخل رمز التجاوز للمتابعة بدون إشعارات:`، حقل 4 أرقام بـ placeholder `••••` وتصفية أرقام فقط، زر `دخول` معطّل بشفافية 40% تحت 4 خانات، الرمز `1998` يفتح نهائياً (يصمد بعد إعادة التشغيل وlogout)، الخاطئ يعرض `الرمز غير صحيح` بالأحمر.
- [ ] لا وجود لشاشة تثبيت iOS PWA في التطبيق إطلاقاً، ولا لرابط `🔧 صفحة تشخيص الإشعارات`.
- [ ] حالة granted (أو bypass): دخول مباشر للغلاف الطبيعي بلا وميض بوابة.
- [ ] بوابة الإصدار: build أقل من `min_supported_build_*` يعرض شاشة حجب غير قابلة للإغلاق (لا back ولا إيماءة)، زرها يفتح In-App Update على Android أو App Store على iOS؛ غياب قيم Remote Config لا يحجب أبداً.
- [ ] كشف تغيّر الإصدار المحلي يكتب `mafia_app_version` ويمسح الكاشات صامتاً بلا أي شاشة.
- [ ] BottomNav: 5 تبويبات بالترتيب RTL (الرئيسية أولاً من اليمين) بالتسميات الحرفية `الرئيسية` `الألعاب` `ادخل` `التصنيف` `حسابي`، ألوان نشط `#fbbf24` / خامل `#6b7280`، تسميات 10sp، أيقونات 22px stroke.
- [ ] الزر المركزي: دائرة 56px مرفوعة 20px، تدرج نشط `#fbbf24→#b45309` وخامل `#1a1a2e→#16213e`، حد `2px rgba(251,191,36,0.6)`، الظلال الأربعة المحددة حرفياً، درع 28px (معبأ عند النشاط)، تصغير 0.9 عند اللمس.
- [ ] مؤشر النشاط 20×2px عنبري ينزلق بين التبويبات العادية بحركة واحدة متصلة، ولا يظهر فوق الزر المركزي.
- [ ] تبويب الرئيسية نشط أيضاً عند مسار الجذر `/player`.
- [ ] الشريط: تدرج الخلفية والحد العلوي `1px rgba(251,191,36,0.15)` حرفياً، ارتفاع صف 64dp، صف داخلي بسقف 512dp موسّط، SafeArea سفلية.
- [ ] التبديل بين التبويبات يحفظ حالة كل فرع وscroll position (IndexedStack).
- [ ] محتوى التبويبات يحمل حشوة سفلية 80dp فلا يغطيه الشريط.
- [ ] سحب-للتحديث: RefreshIndicator عنبري `#f59e0b` على `#0c0c0c` في كل تبويب قابل للتمرير، يعيد جلب `/me` + بيانات الشاشة (وليس reload)، وغير موجود في شاشات اللعب والمودالات.
- [ ] فتح التطبيق من إشعار (مقتول/خلفية) يوصل للوجهة الصحيحة بعد اجتياز الجلسة والبوابات، ولا تسقط الوجهة إن اعترضت بوابة.
- [ ] فئات الشاشات: 448dp سقف بطاقات البوابة موسّطة على medium/expanded، صف الشريط 512dp دائماً، بطل البوابة 96dp على expanded، والصفحة لا تتمرر أفقياً في أي فئة.

---

## 13. ملاحظات أداء وأمان

- **رمز التجاوز `1998` مكتوب في كود العميل** (موروث من الويب حرفياً). قرار نقل معلّق: إبقاؤه كما هو (تكافؤ) أم نقله لقيمة Remote Config قابلة للتدوير — يُحسم قبل الإطلاق العام؛ لا يُعد سراً أمنياً حقيقياً (يعطّل قاعدة منتج، لا يمس بيانات).
- **البوابات حواجز UI لا أمان**: الخادم لا يتحقق من تفعيل الإشعارات — الحجب قاعدة منتج على العميل فقط (كما الويب). لا تُبنَ عليه أي افتراضات أمنية.
- **fail-open في Remote Config** قرار واعٍ: خطؤه الأسوأ = نسخة قديمة تعمل مؤقتاً، مقابل عدم حجب اللاعبين عند عطل Firebase. الحد الأدنى للحماية الحقيقية من العملاء القدامى يجب أن يبقى في backend (رفض socket/REST لعملاء غير متوافقين — خارج نطاق هذا الملف).
- **~~بلا BackdropFilter~~ → سلّم مادّة متدرّج (مُعدَّل بقرار المالك — 95 §4-ق1)**: الحظر الشامل على الـ blur استُبدل بثلاث درجات تُحسم وقت التشغيل (`core/ui/glass_tier.dart`): «أ» شيدر انكسار (iOS دائماً؛ أندرويد بتفضيل «فاخرة» اليدويّ فقط)، «ب» ضباب بلا انكسار (افتراضيّ هواتف أندرويد الحديثة)، «ج» تعبئة شفيفة **بلا أيّ BackdropFilter** — درجة الأجهزة الضعيفة (ذاكرة منخفضة أو ما قبل Android 10) وتابلتات النادي، **فالقيد الأصليّ محفوظ حرفياً حيث وُلد** ويحرسه اختبار في `liquid_glass_nav_test.dart`. المستخدم يملك التجاوز من «جودة الواجهة» في الإعدادات. الهندسة والحركة موحّدتان عبر الدرجات كلّها (`glass_tokens.dart`).
- **حلقات ping/pulse/bounce** تعمل بلا توقف في شاشات البوابة: استخدم `AnimationController` واحداً مشتركاً لكل شاشة (لا ثلاثة)، وأوقفه عند مغادرة الشاشة (`dispose`) وعند `AppLifecycleState.paused` لتوفير البطارية.
- **المؤشر المنزلق** في الشريط يجب ألا يعيد بناء التبويبات الخمسة: افصل مؤشر `AnimatedPositioned` في طبقة Stack مستقلة تستمع لتغيّر الفرع فقط.
- **التوكنات**: القشرة لا تلمس التوكنات مباشرة — كل القراءة/الكتابة عبر 05-session-auth.md (`flutter_secure_storage`). أعلام القشرة (`notifications_unsupported`، `mafia_app_version`) غير حساسة وتبقى في SharedPreferences.
- **staleness 60s** عند تبديل التبويبات يوازن بين تكافؤ الويب (جلب عند كل تنقل) وكلفة الشبكة في نادٍ مزدحم على WiFi واحد — لا polling إضافياً من القشرة ذاتها.
