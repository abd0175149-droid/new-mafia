# الروابط العميقة والتوجيه: /join/:code، App Links/Universal Links، توجيه الإشعارات

> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

## 1. الهدف والنطاق

هذا الملف هو **المرجع الوحيد والكامل لطبقة التوجيه (Routing)** في تطبيق اللاعب:

1. **جدول مسارات go_router كاملاً** لكل شاشات التطبيق (التبويبات الخمسة + الشاشات الفرعية + المسارات العامة)، مع بنية `StatefulShellRoute` للتبويبات.
2. **حراس التوجيه (redirect guards)** — النقل الحرفي لمنطق `player/layout.tsx` في الويب: حارس المصادقة، المسارات العامة، إعفاء صفحة اللعبة، وموضع بوابة الإشعارات الإلزامية في سلسلة القرار.
3. **الرابط العميق `/join/:code`** بحالتيه (لاعب مسجّل / غير مسجّل) — مسار عام بلا مصادقة يخدم روابط QR والمشاركة.
4. **الرابط العميق `/player/join?code=XXXX&invite=1&by=NAME`** — هدف تبويب «ادخل» ووجهة إشعارات الدعوة وبدء النشاط.
5. **توجيه نقر الإشعارات** — نقل جدول `resolveNotificationUrl` من الـ Service Worker (النسخة الأشمل) إلى محلّل مسارات أصلي، واستبدال حيلة `/__pending_nav` (كاش `mafia-auth`) بآليات FCM الأصلية (`getInitialMessage` / `onMessageOpenedApp`) مع الحفاظ على **نفس قاعدة الاستهلاك**: لا تنقّل قبل جاهزية الجلسة.
6. **متطلبات الدومين**: ملف `assetlinks.json` (أندرويد App Links) وملف `apple-app-site-association` (iOS Universal Links) على `club-mafia.grade.sbs` — المحتوى الحرفي وقواعد التقديم على nginx.

**خارج النطاق**: واجهات شاشات الوجهات نفسها (لكل شاشة ملفها)، منطق FCM والأذونات (06-push-notifications.md)، شكل الـ Shell وBottomNav (11-shell-navigation.md)، منطق PlayerFlow والانضمام (21-join-lobby.md).

**مبدأ حاكم**: التطبيق عميل ثانٍ لنفس الـ backend الذي يخدم الـ PWA. كل المسارات هنا موجودة فعلاً في الويب — لا مسارات مخترعة. رابط `/join/:code` نفسه يخدم الـ PWA حالياً؛ بعد تفعيل App Links سيفتح التطبيقَ إن كان مثبتاً والويبَ إن لم يكن — وهذا هو السلوك المرغوب (لا شيء يُكسر).

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

| الملف | ما يؤخذ منه |
|---|---|
| `unified-mafia/frontend/src/app/player/layout.tsx` | حارس المصادقة (الأسطر 99–111)، `PUBLIC_PATHS` (سطر 10)، إعفاء `isGamePage` (سطر 97)، استهلاك `/__pending_nav` (الأسطر 113–136)، ترتيب بوابات الإشعارات (الأسطر 180–393)، شاشة التحميل (الأسطر 162–171) |
| `unified-mafia/frontend/src/app/player/page.tsx` | redirect فوري `/player` ← `/player/home` مع spinner 40px |
| `unified-mafia/frontend/src/app/player/join/page.tsx` | قراءة `?code=` و`?invite=1` و`?by=`، كتابة مفاتيح التوافق، fallback الـ Suspense |
| `unified-mafia/frontend/src/app/join/[roomCode]/page.tsx` | المسار العام العاري: `<PlayerFlow initialRoomCode={roomCode} />` بلا provider/حارس/شريط |
| `unified-mafia/frontend/public/sw.js` | `resolveNotificationUrl` (الأسطر 146–175 — **النسخة القانونية الأشمل**)، معالج `notificationclick` (الأسطر 229–260)، كتابة `/__pending_nav` (الأسطر 254–258) |
| `unified-mafia/frontend/src/components/NotificationBell.tsx` | النسخة المكوّنية الأضيق من `resolveNotificationUrl` (الأسطر 14–32) — تُوحَّد على نسخة الـ SW (انظر §6.4) |
| `unified-mafia/frontend/src/components/PlayerFlow.tsx` | تدفق الدعوة (`inviteFlag`/`inviterName`، الأسطر 26–27 و453–485)، قاعدة «كود QR جديد يتجاهل الجلسة القديمة» (سطر 367) |
| `unified-mafia/backend/src/sockets/lobby.socket.ts` | منتجا حمولة التوجيه: `activity_started` (الأسطر 507–514) و`room_invite` (الأسطر 3406–3420) |
| `unified-mafia/frontend/src/app/display/page.tsx` (سطر 817) | QR شاشة العرض يوجّه دائماً إلى `https://club-mafia.grade.sbs/player/login` (وليس `/join/:code`) — معلومة سياق |
| `unified-mafia/context/DEPLOYMENT.md` (الأسطر 566–570) | nginx: `club-mafia.grade.sbs` ← `http://127.0.0.1:3010` (الإنتاج)، `mafia.grade.sbs` ← `:3000` (staging) |
| `unified-mafia/docs/FLUTTER_PLAYER_APP_PLAN.md` (§12.1، §12.2، §12.4، مخاطرة #8) | قرارات App Links المعتمدة: النمط `/join/*` فقط، `applicationId` المقترح `sbs.grade.mafiaclub`، ملفا التحقق على nginx |

---

## 3. التبعيات على ملفات الخطة الأخرى

| الملف | الاعتماد |
|---|---|
| `01-foundation-theme.md` | ألوان وأحجام شاشات العبور (spinner العنبري، خلفية `#050505`) |
| `02-models-data-layer.md` | نموذج `PlayerNotification` وحقل `data` الذي يغذّي المحلّل |
| `05-session-auth.md` | `SessionStore` بحالاته (loading / unauthenticated / authenticated عبر `SessionState`) — مصدر الحقيقة لحارس المصادقة ولبوابة استهلاك التنقّل المعلّق |
| `06-push-notifications.md` | `getInitialMessage` / `onMessageOpenedApp` / `onMessage` وحالة الإذن (`permissionState`) التي تقرّر عرض بوابة الإشعارات؛ شاشات البوابة نفسها |
| `10-login-register.md` | شاشة `/player/login` (وجهة حارس المصادقة) |
| `11-shell-navigation.md` | تنفيذ `StatefulShellRoute` وBottomNav؛ **بنية الفروع والمسارات المعرّفة هنا في §7.3 هي القانونية** — ملف 11 يلتزم بها |
| `12-home.md` حتى `18-feedback.md` و`19-notifications-inbox.md` | شاشات الوجهات (home/profile/games/rank/history/order/feedback/inbox) |
| `20-game-state-core.md` + `21-join-lobby.md` | شاشة PlayerFlow التي يسلّمها المساران `/join/:code` و`/player/join`؛ تدفق تأكيد الدعوة؛ قاعدة تجاهل الجلسة القديمة عند كود جديد |
| `30-host-console.md` | مسار `/player/host` |
| `90-release-android.md` | التوقيع وبصمات SHA-256 المطلوبة في `assetlinks.json`؛ `applicationId` النهائي |
| `91-release-ios.md` | TeamID وEntitlements (`Associated Domains`) المطلوبة في `apple-app-site-association` |

---

## 4. الواجهة والتجربة تفصيلياً

طبقة التوجيه تملك واجهات محدودة (شاشات عبور فقط) — كل الشاشات الوجهات في ملفاتها. المطلوب حرفياً:

### 4.1 شاشة عبور إعادة التوجيه (`/` و `/player`)

مطابقة لـ `player/page.tsx`:
- ملء الشاشة، خلفية `#050505`، محتوى موسّط أفقياً وعمودياً.
- حلقة spinner واحدة: **40×40dp** (`w-10 h-10`)، سمك الحد **2dp**، لون الحلقة `rgba(245,158,11,0.3)` (amber-500/30) والقوس العلوي `#f59e0b` (amber-500).
- أنيميشن: دوران مستمر **1000ms خطي لا نهائي** (مطابق لـ Tailwind `animate-spin`).
- لا نص، لا زر. تظهر أجزاء ثانية فقط ريثما ينفَّذ redirect إلى `/player/home`.

### 4.2 شاشة التحميل أثناء حسم الجلسة (مسارات `/player/*` المحمية)

مطابقة لأسطر layout.tsx‏ 162–171 (مملوكة تنفيذياً لـ 05-session-auth.md و11-shell-navigation.md — تُذكر هنا لأن الراوتر يقرر متى تُعرض):
- ملء الشاشة `#050505`، عمود موسّط بفجوة 16dp.
- spinner **48×48dp** (`w-12 h-12`)، حد 2dp، نفس ألوان 4.1.
- تحته النص الحرفي: `جاري التحميل...` — لون `#f59e0b` بشفافية 60% (`rgba(245,158,11,0.6)`)، حجم 14sp (text-sm).
- **قاعدة العرض المنقولة حرفياً**: تُعرض عندما `isLoading && !isGamePage` — أي أنها **لا تُعرض أبداً** على `/player/join` ولا على `/join/:code` (صفحتا اللعبة تديران تحميلهما بنفسيهما).

### 4.3 شاشة عبور `/player/join` (fallback)

مطابقة لـ Suspense fallback في `player/join/page.tsx`:
- ملء الشاشة، محتوى موسّط، spinner **40×40dp** بنفس مواصفات 4.1 تماماً (بلا نص).
- تظهر لحظياً ريثما تُقرأ الـ query params وتُبنى شاشة PlayerFlow.

### 4.4 الرابط العميق `/join/:code` — الحالتان

لا واجهة خاصة بالراوتر هنا؛ الراوتر يبني مباشرة شاشة PlayerFlow (21-join-lobby.md) ممرِّراً `initialRoomCode`:

- **الحالة أ — لاعب مسجّل** (توجد جلسة محفوظة): تنفتح شاشة PlayerFlow فوراً **بلا انتظار حسم `/me`** (تكافؤ مع الويب: الصفحة العارية خارج `PlayerProvider` كلياً). PlayerFlow يقرأ التوكن/الهوية من المخزن بنفسه ويبدأ الانضمام الصامت بالكود.
- **الحالة ب — غير مسجّل**: تنفتح شاشة PlayerFlow أيضاً — **لا redirect إلى `/player/login` إطلاقاً**. PlayerFlow يعالج الهوية بنفسه (خطوة تعريف داخله — تفاصيلها في 21-join-lobby.md). هذا إعفاء مقصود ومنقول حرفياً؛ كسره يعني ارتداد كل ماسحي QR غير المسجلين إلى شاشة الدخول خطأً.
- **بوابة الإشعارات لا تنطبق** على هذا المسار (في الويب هو خارج player layout فلا تصله البوابة) — انسخ الإعفاء.
- BottomNav **لا يظهر** على هذا المسار (صفحة عارية خارج الـ Shell).

### 4.5 الرابط العميق `/player/join?code=&invite=1&by=`

- داخل الـ Shell (BottomNav ظاهر — تكافؤ مع الويب حيث يبقى الشريط معروضاً وPlayerFlow يضيف صنف `in-game` لاحقاً).
- **بوابة الإشعارات تنطبق** عليه عند وجود لاعب مسجّل (ليس ضمن PUBLIC_PATHS في الويب) — لكن **حارس المصادقة لا ينطبق** (الإعفاء الحرفي: `if (isGamePage) return;`).
- عند البناء: إن وُجد لاعب في الجلسة تُكتب مفاتيح التوافق للمخزن قبل عرض PlayerFlow (تكافؤ مع كتابة `mafia_player_info` + `mafia_player_token` + `mafia_playerId` في الويب — في Flutter يكافئها تمرير الجلسة لخدمة PlayerFlow عبر الـ provider نفسه؛ التفصيل في 21-join-lobby.md).
- `invite=1` يجعل PlayerFlow يعرض **مودال تأكيد الدعوة** قبل أي انضمام صامت (النصوص الحرفية: «هل تريد الانضمام إلى غرفة «{roomName}»؟» و«دعاك {inviterName}» — واجهته وأزراره ملك 21-join-lobby.md). `by` يُفكّ ترميزه (`Uri.decodeComponent`) ويُمرَّر كاسم الداعي (احتياطي العرض: `لاعب`).

### 4.6 حالة الخطأ — مسار غير معروف

الويب لا يملك صفحة 404 مخصصة للاعب (لا تُزار عملياً). في Flutter:
- `GoRouter.onException` / `errorBuilder`: **لا شاشة خطأ** — redirect صامت: إلى `/player/home` إن كان مسجلاً، وإلى `/player/login` إن لم يكن. لا Snackbar ولا رسالة.

### 4.7 حالة الخطأ — رابط `/join/` بلا كود

`/join/` أو `/join` بدون قيمة ← يعامَل كمسار غير معروف (redirect صامت كما في 4.6). كود فارغ بعد trim ← نفس الشيء.

---

## 5. التكيّف مع الشاشات 6→11 إنش

طبقة التوجيه **سلوكها موحّد إلزامياً عبر كل الفئات**: نفس المسارات، نفس الحراس، نفس ترتيب القرارات — الرابط العميق نفسه يجب أن يفتح الشاشة نفسها على هاتف 6 إنش وتابلت 11 إنش. لا two-pane routing ولا مسارات بديلة حسب الحجم. ما يتكيّف هو شاشات العبور فقط:

- **compact (< 600dp)**: كما في §4 حرفياً — spinner 40dp (عبور) / 48dp (تحميل الجلسة)، توسيط كامل.
- **medium (600–840dp)**: لا تغيير في أحجام الـ spinners (عناصر عابرة غير حساسة للعب — لا تُضاعف). أي نص مصاحب (`جاري التحميل...`) يبقى 14sp. المحتوى يبقى موسّطاً؛ لا سقف عرض مطلوب لأن الشاشات لا تحوي محتوى نصياً ممتداً.
- **expanded (> 840dp)**: نفس الشيء — spinner 48dp موسّط في الفراغ الأكبر. ممنوع تمديد أي عنصر.
- شاشات الوجهات التي يسلّم إليها الراوتر تطبّق قواعدها الخاصة من ملفاتها (مثال: PlayerFlow عبر `/join/:code` يسقّف محتواه عند 840–960dp على expanded حسب 21-join-lobby.md؛ بوابة الإشعارات تسقّف بطاقتها حسب 06-push-notifications.md). الراوتر لا يتدخل.
- ملاحظة تنسيقية: إن قرّر 11-shell-navigation.md عرض NavigationRail بدل BottomNav على expanded، فذلك تغيير عرضي بحت — المسارات والفروع المعرفة في §7.3 لا تتغير.

---

## 6. المنطق والتدفقات

### 6.1 آلة حالة الحارس المركزي (go_router `redirect`)

مدخلات القرار (كلها متزامنة ورخيصة — تُقرأ من providers محسومة مسبقاً):
- `sessionState ∈ {loading, unauthenticated, authenticated}` (من 05-session-auth.md)
- `location` = المسار المطلوب + الـ query

**جدول القرار — نقل حرفي لترتيب layout.tsx:**

| # | الشرط | القرار |
|---|---|---|
| 1 | `location == '/'` أو `location == '/player'` | redirect ← `/player/home` |
| 2 | `location` يبدأ بـ `/join/` | **null** (عام دائماً — لا حارس مصادقة، لا بوابة، لا انتظار جلسة) |
| 3 | `location.path == '/player/join'` | **null** (إعفاء `isGamePage` الحرفي — حتى لغير المسجلين) |
| 4 | `sessionState == loading` | **null** — لا redirect؛ الشاشة المحمية تعرض شاشة التحميل (§4.2) مكانها، وعند الحسم يعيد `refreshListenable` تقييم الحارس (يطابق الويب: الـ URL لا يتغير أثناء التحميل) |
| 5 | `sessionState == unauthenticated` و`location` ليس ضمن `PUBLIC_PATHS` | redirect ← `/player/login` (يكافئ `router.replace('/player/login')`) |
| 6 | `sessionState == authenticated` و`location.path == '/player/login'` | redirect ← `/player/home` |
| 7 | غير ذلك | **null** |

`PUBLIC_PATHS = ['/player/login', '/player/debug-push']` — انسخ القائمة حرفياً (debug-push شاشة تشخيص مخفية تعاد كتابتها في 06-push-notifications.md، تبقى عامة وبلا BottomNav).

`refreshListenable`: `Listenable.merge([sessionStore, permissionController, pendingNavController])` — أي تغيّر في الجلسة أو إذن الإشعارات أو التنقّل المعلّق يعيد تقييم الحارس.

### 6.2 بوابة الإشعارات — ليست مساراً

**قرار معماري منقول من الويب**: البوابة في الويب overlay (`fixed inset-0 z-[99999]`) وليست صفحة — الـ URL يبقى على الوجهة المقصودة، وعند منح الإذن يجد المستخدم نفسه على وجهته الأصلية (بما فيها وجهة رابط عميق). في Flutter:
- **لا يُعرَّف مسار `/gate`**. البوابة widget يغلّف `navigationShell` داخل بنّاء الـ Shell (11-shell-navigation.md) ويُعرض فوق المحتوى عندما: `sessionState == authenticated && !isPublicPath && !isJoinByCodePath && gateState != passed`.
- `gateState` وشاشاته الأربع (prompt / denied / unsupported+bypass — وتسقط needsInstall كلياً في التطبيق الأصلي) ملك 06-push-notifications.md.
- نتيجة مهمة (تكافؤ حرفي): **استهلاك التنقّل المعلّق لا ينتظر البوابة** — في الويب يعمل `router.replace` خلف الـ overlay (الشرط `if (isLoading || !player) return;` فقط). في Flutter: نفّذ التنقّل المعلّق فور `authenticated` حتى لو كانت البوابة معروضة؛ ستبقى فوق الشاشة الجديدة حتى يُمنح الإذن ثم تنكشف الوجهة الصحيحة.

### 6.3 التنقّل المعلّق (Pending Navigation) — بديل `/__pending_nav`

في الويب: الـ SW يكتب وجهة الإشعار في كاش `mafia-auth` تحت المفتاح `/__pending_nav` (لأن iOS PWA قد يفتح `start_url` متجاهلاً الرابط)، والـ layout يستهلكها بعد جاهزية اللاعب. في Flutter لا يوجد SW — **الآلية تُستبدل بالكامل** مع الحفاظ على قواعد الاستهلاك:

**المصادر الثلاثة للوجهة:**
1. **فتح بارد من إشعار**: `FirebaseMessaging.instance.getInitialMessage()` (مرة واحدة في الإقلاع) ← `message.data` ← `NotificationRouteResolver.resolve(type, data)` ← تخزين في `PendingNavigationController`.
2. **نقرة إشعار والتطبيق بالخلفية**: `FirebaseMessaging.onMessageOpenedApp.listen(...)` ← نفس التحليل ← إن كانت الوجهة معفاة من المصادقة (`/join/` أو `/player/join`) نفّذ `router.go(path)` فوراً؛ وإلا خزّن في `PendingNavigationController` (سيُستهلك فوراً إن كانت الجلسة محسومة أصلاً).
3. **رابط https بارد أو حي (App Links / Universal Links)**: يصل عبر آلية Flutter المدمجة للروابط العميقة (انظر §6.6) — go_router يستقبله كـ location ابتدائي/جديد مباشرة، والحارس في §6.1 يتكفّل بالباقي (`/join/:code` عام فلا انتظار).

**قواعد الاستهلاك (نقل حرفي لأسطر layout.tsx‏ 116–136):**
- الاستهلاك **فقط** عندما `sessionState == authenticated` (الويب: `if (isLoading || !player) return;`). إن فشل التحقق وبقي المستخدم غير مسجّل تبقى الوجهة **في الذاكرة** وتُستهلك بعد أول دخول ناجح في نفس تشغيلة التطبيق (تكافؤ: الويب يحذف المدخل فقط عند الاستهلاك، والـ effect يعاد تشغيله عند تعيين player).
- قبل التنفيذ: طبّع الوجهة (`Uri.parse`، خذ `path + query`)، وقارنها بالموقع الحالي — **إن تطابقا فلا تنقّل** (الويب: `if (path !== window.location.pathname + window.location.search)`).
- التنفيذ بـ **استبدال** لا دفع: `router.go(path)` (يكافئ `router.replace` في Next — لا يُبنى stack يعود لـ home أولاً).
- بعد التنفيذ: صفّر الوجهة المعلّقة (يكافئ `cache.delete('/__pending_nav')`).
- تعدد الإشعارات المنقورة قبل الحسم: **الأخيرة تفوز** (الكتابة تستبدل — نفس دلالة `cache.put` بمفتاح ثابت).
- لا تُخزَّن الوجهة المعلّقة على القرص — `getInitialMessage` يغطي الفتح البارد أصلاً، والذاكرة تكفي (لا مقابل لبقاء الكاش في الويب لأن سببه — فقدان الرابط في iOS PWA — غير موجود أصلياً).

### 6.4 جدول توجيه الإشعارات — النقل القانوني لـ `resolveNotificationUrl`

**قرار موثّق**: توجد نسختان في الويب — نسخة الـ SW (الأشمل) ونسخة NotificationBell (أضيق: بلا `activity_started` بلا roomCode، بلا `room_invite`/`order_status`/`new_order`، والمجهول ← غير قابل للنقر). التباين **خلل تاريخي لا ميزة** — Flutter يوحّد على **نسخة الـ SW** في كل السياقات (نقر إشعار OS، نقر صف في صندوق الوارد 19-notifications-inbox.md):

| `type` | الوجهة (بالترتيب الحرفي للأولوية) |
|---|---|
| `activity_started` | `data.roomCode` موجود ← `/player/join?code={roomCode}` وإلا ← `/player/home` |
| `room_invite` | `data.url` وإلا (`data.roomCode` موجود ← `/player/join?code={roomCode}&invite=1` + `&by={encodeURIComponent(inviterName)}` إن وُجد اسم الداعي، وإلا ← `/player/home`) |
| `new_activity` | `data.activityId` موجود ← `/player/games?activityId={activityId}` وإلا ← `/player/games` |
| `booking_confirmed` | `/player/home` |
| `game_ended` | `/player/home` |
| `feedback_survey` | `data.sessionId` موجود ← `/player/feedback?sessionId={sessionId}` وإلا ← `/player/feedback` |
| `order_status` | `data.url` وإلا ← `/player/order` |
| `new_order` | `data.url` وإلا ← `/venue/orders` (**صفحة ويب خارج نطاق التطبيق** — تُفتح خارجياً، انظر 6.5؛ تصل فقط للاعبين المرتبطين بحساب venue) |
| `custom` | `data.url` وإلا ← `/player/home` |
| default (أي نوع آخر: `reminder`, `friend_booked`, `level_up`, `comeback`, ...) | `data.url` وإلا ← `/player/home` |

**قاعدة `notificationclick` العليا (منقولة)**: عند نقر إشعار، `data.url` إن وُجد يتغلب على ناتج الجدول (`const url = data.url || resolveNotificationUrl(...) || '/player/home'`).

### 6.5 تصنيف الوجهة: داخلية / ويب خارجية / خارجية

كل وجهة ناتجة (من إشعار أو `data.url`) تمرّ بمصنّف واحد:

1. **رابط مطلق http/https ومضيفه ≠ `club-mafia.grade.sbs`** ← خارجي: `url_launcher` بوضع `LaunchMode.externalApplication` (يكافئ `clients.openWindow` لتبويب جديد). **لا يُوجَّه داخلياً أبداً** (حماية open-redirect).
2. **رابط مطلق ومضيفه = `club-mafia.grade.sbs`** ← يُجرَّد إلى `path + query` ويعامل كداخلي (يكافئ `new URL(dest, origin)` في الويب).
3. **مسار نسبي يبدأ بـ `/player/` أو `/join/`** ← داخلي: `router.go(path)`.
4. **مسار نسبي لواجهات ويب أخرى** (`/venue/*`, `/admin/*`, `/leader`, `/display`, أي شيء آخر) ← يُفتح خارجياً بالمتصفح على `https://club-mafia.grade.sbs{path}` (هذه الواجهات ليست في التطبيق).

### 6.6 تدفق الإقلاع البارد — الترتيب الدقيق

```
main()
 ├─ 1. تهيئة Firebase (06-push-notifications.md)
 ├─ 2. getInitialMessage() ← إن وُجدت رسالة: resolve ← PendingNavigationController.set(path)
 ├─ 3. بناء GoRouter (initialLocation الافتراضي '/player/home';
 │      رابط https وارد عبر آلية النظام يتغلب عليه تلقائياً — انظر أدناه)
 ├─ 4. SessionStore يبدأ استعادة الجلسة بالتوازي (mafia_player_auth ← GET /me — ملف 05)
 └─ 5. runApp
بعدها:
 ├─ الحارس (§6.1) يُقيَّم عند كل تغيّر عبر refreshListenable
 ├─ عند sessionState==authenticated: مستهلك التنقّل المعلّق (§6.3) يقارن وينفّذ
 └─ البوابة (§6.2) تُعرض/تُرفع حسب permissionState دون تغيير الـ location
```

**استقبال روابط https**: يُعتمد على **دعم Flutter/go_router المدمج للروابط العميقة** (وليس حزمة `app_links` — لتجنب الاستقبال المزدوج): أندرويد `flutter_deeplinking_enabled = true` وiOS `FlutterDeepLinkingEnabled = YES` (§10). الرابط البارد يصبح `initialLocation` تلقائياً، والحي يصل كتنقّل جديد يمر بالحارس. النتيجة: `/join/ABCD` بارداً يفتح PlayerFlow مباشرة بلا أي انتظار، لأن القاعدة #2 في §6.1 تعفيه من كل شيء.

### 6.7 الحالات الحدّية

| الحالة | السلوك المحدد |
|---|---|
| رابط `/join/:code` وكود غير موجود/خاطئ | الراوتر يسلّم لـ PlayerFlow كما هو؛ رسالة الخطأ من الخادم تُعرض داخل PlayerFlow (21-join-lobby.md). الراوتر لا يتحقق من صحة الكود |
| رابط بكود جديد أثناء وجود جلسة لعبة قديمة محفوظة | PlayerFlow يطبّق قاعدته (سطر 367): الكود الجديد المختلف يُسقط الجلسة القديمة — لا تدخّل من الراوتر |
| نقر إشعار دعوة والتطبيق داخل لعبة جارية | التنقّل يُنفَّذ (نفس الويب — `client.navigate` يبدّل الصفحة)؛ حماية اللاعب من فقدان حالته مسؤولية إعادة الاتصال في 20-game-state-core.md |
| فشل استعادة الجلسة (توكن منتهٍ) مع وجهة معلّقة | redirect ← login؛ الوجهة تبقى بالذاكرة وتُستهلك بعد الدخول الناجح (§6.3) |
| logout أثناء الوقوف على مسار محمي | `refreshListenable` يعيد التقييم ← redirect فوري إلى `/player/login` |
| إشعار بحمولة ناقصة (بلا `type` وبلا `url`) | الجدول default ← `/player/home` |
| `by` يحوي محارف مرمّزة | `Uri.decodeComponent` قبل التمرير (الويب يرمّز بـ `encodeURIComponent` عند الإنتاج) |
| كود غرفة من رابط | يُمرَّر كما ورد بعد `trim()` فقط — الويب لا يطبّع الحالة (لا uppercase قسري)؛ حدّ عقلاني 16 محرفاً alphanumeric قبل تمريره للـ socket (حماية إدخال، §13) |
| فتح الرابط والتطبيق غير مثبّت | يفتح الـ PWA في المتصفح — سلوك مرغوب، لا يُعالج في التطبيق |
| ضغط زر الرجوع على شاشة `/join/:code` المفتوحة ببرودة | stack فارغ تحته ← الرجوع يخرج من التطبيق (تكافؤ الويب: تبويب متصفح مستقل). لا حقن مسار home تحته |

### 6.8 إعادة الاتصال واستعادة الحالة

طبقة التوجيه **عديمة الحالة الشبكية**: لا تعيد أي تنقّل عند reconnect الـ socket ولا تراقبه. استعادة مرحلة اللعبة عند إعادة الاتصال ملك 20-game-state-core.md. الشيء الوحيد «المستعاد» هنا هو الوجهة المعلّقة داخل تشغيلة واحدة (§6.3). المؤقتات: لا مؤقتات ولا مهلات خاصة بالتوجيه.

---

## 7. عقود التكامل

### 7.1 REST

**لا endpoints مملوكة لهذا الملف** — التوجيه لا ينادي الخادم. (شاشات الوجهات تنادي عقودها من ملفاتها.)

### 7.2 حمولة الإشعارات المستخدمة في التوجيه (data-only FCM)

العقد: كل القيم strings داخل `data`. الحقول التي يقرأها المحلّل: `type`, `url?`, `roomCode?`, `activityId?`, `sessionId?`, `inviterName?`, `tag?`.

منتجان موثّقان من الـ backend (للاختبار الحرفي):

| الحدث | المنتِج | العنوان/النص | `data` |
|---|---|---|---|
| بدء النشاط | `lobby.socket.ts` 507–514 (`sendPushToPlayers`) | `🎮 النشاط بدأ!` / `` `${gameName} — ادخل واختر رقم مقعدك الآن!` `` | `{ roomCode: state.roomCode, url: '/player/join?code={roomCode}' }` + `type: 'activity_started'` |
| دعوة غرفة | `lobby.socket.ts` 3409–3420 (`sendPushToPlayer`) | `📨 دعوة للانضمام` / `` `${inviterName} يدعوك للانضمام إلى ${roomName}` `` | `{ roomCode, roomName, inviterName, url: '/player/join?code={roomCode}&invite=1&by={encodeURIComponent(inviterName)}' }` + `type: 'room_invite'` |

بقية الأنواع (`new_activity`, `feedback_survey`, `order_status`, ...) تتبع جدول §6.4 وحقولها في 06-push-notifications.md.

### 7.3 جدول مسارات go_router الكامل (قانوني — يلتزم به 11-shell-navigation.md)

| المسار | النوع | الشاشة / السلوك | ملف الشاشة |
|---|---|---|---|
| `/` | redirect | ← `/player/home` (عبور §4.1) | — |
| `/player` | redirect | ← `/player/home` (عبور §4.1) | — |
| `/player/login` | route عام (خارج الـ Shell، بلا BottomNav) | شاشة الدخول/التسجيل بأوضاعها الأربعة | 10-login-register.md |
| `/player/debug-push` | route عام (خارج الـ Shell، بلا BottomNav) | شاشة التشخيص المخفية | 06-push-notifications.md |
| `/join/:code` | route عام (خارج الـ Shell، بلا BottomNav، بلا بوابة) | PlayerFlow(`initialRoomCode: code`) | 21-join-lobby.md |
| **StatefulShellRoute** | — | Shell + BottomNav + غلاف البوابة | 11-shell-navigation.md |
| فرع 1: `/player/home` | تبويب `الرئيسية` | Home | 12-home.md |
| — `/player/order` | ضمن فرع 1 (يدخل من بطاقة F&B في Home) | طلبات F&B | 17-order-fnb.md |
| — `/player/feedback` | ضمن فرع 1 (query: `sessionId?`) | استبيان التقييم | 18-feedback.md |
| — `/player/host` | ضمن فرع 1 (مشروط بـ `canHostRemote`) | كونسول المضيف | 30-host-console.md |
| فرع 2: `/player/games` | تبويب `الألعاب` (query: `activityId?` للتظليل) | الأنشطة والدعوات | 14-games-invites.md |
| فرع 3: `/player/join` | تبويب `ادخل` — **الزر المركزي** (query: `code?`, `invite?`, `by?`) | PlayerFlow | 21-join-lobby.md |
| فرع 4: `/player/rank` | تبويب `التصنيف` | التصنيف | 15-rank.md |
| فرع 5: `/player/profile` | تبويب `حسابي` | الملف الشخصي | 13-profile.md |
| — `/player/history` | ضمن فرع 5 (يدخل من البروفايل) | سجل المباريات | 16-history.md |
| أي مسار آخر | errorBuilder | redirect صامت (§4.6) | — |

قواعد الفروع: التبويبات الخمسة بترتيب RTL كما في الويب (الرئيسية أولاً من اليمين)؛ كشف التبويب النشط: تطابق تام للمسار، وتبويب الرئيسية نشط أيضاً على المسارات الفرعية لفرعه.

### 7.4 Socket

**لا أحداث socket لهذا الملف.** (مصافحة الـ socket وأحداث اللعبة في 04-socket-layer.md و20-game-state-core.md.)

### 7.5 ملفات التحقق من الدومين (متطلبات خادم — تُنشر على nginx أمام `127.0.0.1:3010`)

**أ. أندرويد — `https://club-mafia.grade.sbs/.well-known/assetlinks.json`**

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "sbs.grade.mafiaclub",
      "sha256_cert_fingerprints": [
        "<SHA-256 لمفتاح Play App Signing — من Play Console → App integrity>",
        "<SHA-256 لمفتاح upload/debug — لفحوص التطوير>"
      ]
    }
  }
]
```

- `package_name` هو الـ `applicationId` المعتمد في 90-release-android.md (المقترح المثبّت في الخطة الأم: `sbs.grade.mafiaclub` — أي تغيير هناك يغيّره هنا).
- يجب أن يُقدَّم بـ HTTP 200، `Content-Type: application/json`، **بلا redirect** وبلا مصادقة.

**ب. iOS — `https://club-mafia.grade.sbs/.well-known/apple-app-site-association`**

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": ["<TEAMID>.sbs.grade.mafiaclub"],
        "components": [
          { "/": "/join/*", "comment": "روابط الانضمام للغرف" }
        ]
      }
    ]
  }
}
```

- `<TEAMID>` من حساب Apple Developer (91-release-ios.md). الملف **بلا امتداد**، 200، `Content-Type: application/json`، بلا redirect، أصغر من 128KB.
- **نطاق الأنماط قرار معتمد**: `/join/*` **فقط** — لا يُسجَّل `/player/*` كي لا يخطف التطبيقُ روابطَ الويب الاعتيادية لمستخدمي الـ PWA (خطة أم، مخاطرة #8).

**ج. مقتطف nginx** (يوضع قبل proxy_pass العام في server block الخاص بـ `club-mafia.grade.sbs`):

```nginx
location = /.well-known/assetlinks.json {
    default_type application/json;
    alias /var/www/mafia-wellknown/assetlinks.json;
}
location = /.well-known/apple-app-site-association {
    default_type application/json;
    alias /var/www/mafia-wellknown/apple-app-site-association;
}
```

يجب ألا يمرّ الطلبان عبر Next.js (يبقيان static من nginx). ملاحظة: Google وApple يجلبان الملفين من خوادمهما مباشرة — الـ Service Worker الحالي للـ PWA لا يؤثر.

---

## 8. نماذج Dart المطلوبة

```dart
/// ثوابت المسارات — المصدر الوحيد للسلاسل
abstract class AppRoutes {
  static const home = '/player/home';
  static const login = '/player/login';
  static const debugPush = '/player/debug-push';
  static const games = '/player/games';
  static const join = '/player/join';
  static const rank = '/player/rank';
  static const profile = '/player/profile';
  static const history = '/player/history';
  static const order = '/player/order';
  static const feedback = '/player/feedback';
  static const host = '/player/host';
  static String joinByCode(String code) => '/join/$code';
  static const publicPaths = [login, debugPush]; // PUBLIC_PATHS حرفياً
}

/// نتيجة تصنيف وجهة (§6.5)
sealed class ResolvedTarget {
  const ResolvedTarget();
}
class InternalTarget extends ResolvedTarget {
  final String location; // path + query
  const InternalTarget(this.location);
}
class ExternalTarget extends ResolvedTarget {
  final Uri uri; // يُفتح بـ url_launcher (externalApplication)
  const ExternalTarget(this.uri);
}

/// منقول حرفياً من sw.js resolveNotificationUrl (النسخة القانونية §6.4)
class NotificationRouteResolver {
  static const String appHost = 'club-mafia.grade.sbs';
  /// data قيمها strings (عقد FCM data-only)
  String resolve(String? type, Map<String, dynamic> data);
  /// قاعدة notificationclick: data.url يتغلب ثم الجدول ثم '/player/home'
  String resolveForTap(Map<String, dynamic> data);
  /// مصنّف §6.5
  ResolvedTarget classify(String urlOrPath);
}

/// محلّل الروابط العميقة الواردة (https)
class DeepLinkParser {
  /// يعيد location داخلياً أو null إن لم يكن الرابط للتطبيق
  String? parse(Uri uri); // يفهم /join/{code} و /player/join?code&invite&by
}

/// الوجهة المعلّقة (§6.3) — ذاكرة فقط، ChangeNotifier ليدخل في refreshListenable
class PendingNavigationController extends ChangeNotifier {
  String? _pending;
  void set(String location);   // الأخيرة تفوز
  String? peek();
  String? consume();           // يقرأ ويصفّر
}

/// DeepLinkService — الاسم القانوني في 00-MASTER-PLAN §2.2 لطبقة التوجيه/الروابط العميقة.
/// واجهة موحّدة تغلّف NotificationRouteResolver + DeepLinkParser + PendingNavigationController،
/// وتعرّض `dispatch(data)` كمدخل وحيد لنقرات الإشعارات (تستدعيه مصادر النقر الأربعة في 06-push-notifications.md):
/// تحلّ الحمولة عبر NotificationRouteResolver ثم تنفّذ فوراً إن كانت الوجهة معفاة من المصادقة
/// (`/join/` أو `/player/join`) وإلا تخزّنها في PendingNavigationController لاستهلاكها بعد جاهزية الجلسة (§6.3).
class DeepLinkService {
  final NotificationRouteResolver resolver;
  final DeepLinkParser parser;
  final PendingNavigationController pendingNav;
  void dispatch(Map<String, dynamic> data);
}

/// معاملات مسار الانضمام بالـ query
class JoinQueryParams {
  final String code;        // ?code= (افتراضي '')
  final bool invite;        // ?invite == '1' حصراً
  final String inviterName; // ?by بعد فك الترميز (افتراضي '')
  const JoinQueryParams({required this.code, required this.invite, required this.inviterName});
  factory JoinQueryParams.fromUri(Uri uri);
}

/// بنّاء الراوتر
GoRouter buildRouter({
  required SessionStore session,             // 05
  required PermissionGateController gate,    // 06
  required PendingNavigationController pendingNav,
});
```

---

## 9. الحزم المستخدمة

| الحزمة | الغرض | ملاحظات |
|---|---|---|
| `go_router` | جدول المسارات، `StatefulShellRoute.indexedStack`، `redirect`، `refreshListenable`، استقبال الروابط العميقة المدمج | الإصدار يثبَّت في 01-foundation-theme.md مع بقية الحزم |
| `firebase_messaging` | `getInitialMessage` / `onMessageOpenedApp` (الاستخدام هنا للتوجيه فقط — الملكية لـ 06-push-notifications.md) | |
| `url_launcher` | فتح الوجهات الخارجية وصفحات الويب خارج النطاق (`LaunchMode.externalApplication`) | |
| **بلا** `app_links` | — | قرار: يُستخدم استقبال Flutter المدمج (`flutter_deeplinking_enabled`) لتجنب الاستقبال المزدوج مع go_router |

---

## 10. اختلافات Android / iOS

### Android — App Links
1. `AndroidManifest.xml` (داخل `<activity android:name=".MainActivity">`):
```xml
<meta-data android:name="flutter_deeplinking_enabled" android:value="true" />
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https"
          android:host="club-mafia.grade.sbs"
          android:pathPrefix="/join/" />
</intent-filter>
```
2. `assetlinks.json` كما في §7.5-أ — **بصمتان**: مفتاح Play App Signing (الإلزامي للإنتاج) + مفتاح upload/debug (للتطوير). تُستخرج بصمة الإنتاج من Play Console → App integrity بعد أول رفع (90-release-android.md).
3. التحقق (أندرويد 12+ يتحقق آلياً عند التثبيت):
```
adb shell pm get-app-links sbs.grade.mafiaclub          # يجب أن تظهر verified
adb shell am start -a android.intent.action.VIEW -d "https://club-mafia.grade.sbs/join/TEST"
```
4. إن فشل التحقق (ملف ناقص/بصمة خاطئة) يفتح الرابط المتصفحَ بصمت — اختبار القبول 12.9 إلزامي في كل إصدار.

### iOS — Universal Links
1. `Info.plist`: `FlutterDeepLinkingEnabled` = `YES`.
2. `Runner.entitlements`: `com.apple.developer.associated-domains` = `["applinks:club-mafia.grade.sbs"]` (Capability: Associated Domains — 91-release-ios.md).
3. `apple-app-site-association` كما في §7.5-ب.
4. **فرق سلوكي جوهري**: Apple تجلب الملف عبر CDN خاص بها عند **تثبيت** التطبيق وتكيّشه (قد يتأخر التحديث ساعات حتى 24+). للتطوير: `applinks:club-mafia.grade.sbs?mode=developer` مع تفعيل Developer Mode على الجهاز يجلب الملف مباشرة.
5. **قيد iOS**: كتابة الرابط يدوياً في شريط عنوان Safari على نفس الدومين **لا** تفتح التطبيق (سلوك نظام) — الفتح يعمل من الرسائل/واتساب/الكاميرا (QR)/التطبيقات الأخرى. أندرويد لا يعاني هذا القيد بنفس الحدّة.
6. نقر الإشعار البارد: على iOS يصل عبر `getInitialMessage` فقط إذا فُتح التطبيق **من الإشعار نفسه** — لا مقابل لمشكلة iOS-PWA (فتح start_url وتجاهل الرابط) لأنها كانت علة الـ SW حصراً؛ آلية `/__pending_nav` **تسقط بلا بديل مخزَّن**.

### مشترك
لا اختلافات في جدول المسارات أو الحراس أو جدول توجيه الإشعارات — المنطق واحد حرفياً على المنصتين.

---

## 11. الأصول المطلوبة

- **لا أصول داخل التطبيق لهذا الملف** (شاشات العبور تستخدم ألوان الثيم فقط — 01-foundation-theme.md).
- **أصلان على الخادم** (خارج bundle التطبيق): `assetlinks.json` و`apple-app-site-association` بالمحتوى الحرفي في §7.5، منشوران على nginx في مسار ثابت (مقترح: `/var/www/mafia-wellknown/`) — بند نشر إلزامي قبل أول إصدار متجر (مذكور أيضاً في 90/91).

---

## 12. معايير القبول

- [ ] 12.1 فتح التطبيق عادياً ← `/` يعيد التوجيه إلى `/player/home` عبر شاشة العبور (spinner 40dp عنبري على `#050505`).
- [ ] 12.2 مستخدم بلا جلسة يقصد أي مسار محمي (مثل `/player/rank`) ← يصل إلى `/player/login` بلا وميض للشاشة المحمية.
- [ ] 12.3 مستخدم مسجّل يقصد `/player/login` ← يعاد إلى `/player/home`.
- [ ] 12.4 أثناء حسم الجلسة تُعرض شاشة `جاري التحميل...` (spinner 48dp) على المسارات المحمية، **ولا تُعرض** على `/player/join` ولا `/join/:code`.
- [ ] 12.5 `/join/ABCD` يفتح PlayerFlow **بدون تسجيل دخول** وبلا BottomNav وبلا بوابة إشعارات (الحالتان: مسجّل وغير مسجّل).
- [ ] 12.6 `/player/join?code=ABCD&invite=1&by=%D8%A3%D8%AD%D9%85%D8%AF` يفتح PlayerFlow داخل الـ Shell مع مودال تأكيد الدعوة واسم الداعي مفكوك الترميز («أحمد»)، حتى لغير المسجلين (إعفاء الحارس).
- [ ] 12.7 بوابة الإشعارات تحجب `/player/join` للمسجّل غير المفعِّل، ولا تحجب `/join/:code` أبداً.
- [ ] 12.8 نقر إشعار `room_invite` والتطبيق **مغلق كلياً** ← بعد الإقلاع وحسم الجلسة يهبط المستخدم على `/player/join?code=...&invite=1&by=...` (وليس على home) — تكافؤ `/__pending_nav`.
- [ ] 12.9 رابط `https://club-mafia.grade.sbs/join/XXXX` من واتساب/QR يفتح **التطبيق** مباشرة على أندرويد (autoVerify ناجح: `pm get-app-links` = verified) وiOS (Associated Domains)، ويفتح الـ PWA على جهاز بلا تطبيق.
- [ ] 12.10 كل صف من جدول §6.4 يوجّه لوجهته حرفياً، و`data.url` يتغلب دائماً عند النقر، والنوع المجهول ← `/player/home`.
- [ ] 12.11 `data.url` خارجي (مضيف مختلف) يفتح المتصفح الخارجي ولا يوجَّه داخلياً أبداً؛ `data.url` بمسار `/venue/orders` يفتح المتصفح على `https://club-mafia.grade.sbs/venue/orders`.
- [ ] 12.12 وجهة معلّقة تطابق الموقع الحالي ← لا تنقّل (لا إعادة بناء للشاشة).
- [ ] 12.13 نقرتا إشعارين متتاليتان قبل حسم الجلسة ← الوجهة الأخيرة فقط تُنفَّذ.
- [ ] 12.14 فشل استعادة الجلسة مع وجهة معلّقة ← login، وبعد دخول ناجح في نفس التشغيلة تُستهلك الوجهة.
- [ ] 12.15 مسار غير معروف (`/xyz`) ← redirect صامت (home للمسجّل / login لغيره) بلا شاشة خطأ.
- [ ] 12.16 التبويبات الخمسة تحافظ على حالتها عند التبديل (`indexedStack`)، والمسارات الفرعية (`/player/history` وغيرها) تعرض BottomNav، بينما `/player/login` و`/player/debug-push` و`/join/:code` بدونه.
- [ ] 12.17 السلوك متطابق تماماً على compact/medium/expanded (نفس الوجهة لنفس الرابط)، وأحجام الـ spinners ثابتة.
- [ ] 12.18 `flutter_deeplinking_enabled`/`FlutterDeepLinkingEnabled` مفعّلان ولا وجود لحزمة `app_links` (لا معالجة مزدوجة للرابط الواحد).

---

## 13. ملاحظات أداء وأمان

**أمان:**
- **لا توكنات في الروابط أبداً** — روابط الانضمام تحمل كود الغرفة واسم الداعي فقط (كما ينتجها الخادم حرفياً). أي اقتراح مستقبلي لتمرير توكن عبر رابط مرفوض في هذه الطبقة.
- **حماية open-redirect**: المصنّف (§6.5) هو المعبر الإجباري الوحيد لأي `data.url` — رابط مطلق بمضيف غير `club-mafia.grade.sbs` لا يدخل الراوتر الداخلي مهما كان مصدره (حمولة إشعار قد تُنتَج من لوحة الإدارة بنص حر).
- **تعقيم كود الغرفة** من الروابط: `trim()` + سقف 16 محرفاً + `[A-Za-z0-9]` قبل تمريره لأي `emit` (الخادم يتحقق أيضاً، لكن لا نمرر مدخلات عشوائية من intents خارجية).
- روابط أندرويد الواردة عبر intents يمكن تزويرها من تطبيقات أخرى حتى مع autoVerify — لا تعامل أي رابط وارد كدليل مصادقة، فقط كطلب تنقّل يمر بالحراس.
- بصمات `assetlinks.json`: أزل بصمة debug من ملف الإنتاج النهائي إن قررتم فصل بيئة staging (`mafia.grade.sbs` تحتاج ملفيها الخاصين إن أُريد اختبار App Links على staging).

**أداء:**
- دالة `redirect` تُستدعى عند كل تنقّل — يجب أن تبقى **متزامنة O(1)**: لا قراءة تخزين، لا await، فقط قراءة حالات providers محسومة.
- `refreshListenable` مدموج من ثلاثة notifiers فقط — لا تضيفوا إليه حالات كثيرة التغير (مثل حالة الـ socket) وإلا أُعيد تقييم الحارس بلا داعٍ عند كل نبضة شبكة.
- شاشات العبور لا تحمّل أي بيانات — الـ spinner وحده؛ التحميل الفعلي مسؤولية شاشة الوجهة.
- الوجهة المعلّقة في الذاكرة فقط (لا I/O) — `getInitialMessage` يغطي البرودة، فلا حاجة لأي persistence يضيف زمن إقلاع.
