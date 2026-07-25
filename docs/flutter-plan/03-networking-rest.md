# طبقة الشبكة REST: Dio، المصادقة، الأخطاء، الروابط المطلقة

> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

## 1. الهدف والنطاق

هذا الملف هو المواصفة التنفيذية الكاملة لطبقة HTTP/REST في تطبيق اللاعب:

- إعداد عميل `Dio` واحد مشترك لكل التطبيق (singleton عبر Riverpod provider).
- بناء الـ base URL وتحويل كل الروابط النسبية (`/uploads/*`) إلى روابط مطلقة.
- الـ interceptors: حقن `Authorization: Bearer`، معالجة 401 (تسجيل خروج)، معالجة 403/`PENDING_SURVEYS`، معالجة 429 (rate limit)، وسياسة retry.
- جداول كل REST endpoints التي يستهلكها تطبيق اللاعب مع الحمولات والأخطاء الحرفية (player-auth، player-app بما فيها الحجوزات، player، player-notifications، player-feedback، fnb، sounds، seasons، progression، health).
- المهلات (timeouts)، حالة عدم الاتصال (offline)، والمكوّنات البصرية المشتركة المرتبطة بالشبكة (بانر الانقطاع، حوار انتهاء الجلسة، حوار الـ rate limit).

**خارج النطاق:** طبقة Socket.IO بكاملها (أحداث، ack، إعادة اتصال) في `04-socket-layer.md`؛ نماذج البيانات وتفاصيل الـ serialization في `02-models-data-layer.md`؛ تدفق تسجيل الدخول وشاشاته في `05-session-auth.md` و`10-login-register.md`؛ الـ FCM في `06-push-notifications.md`.

**مبدأ حاكم:** التطبيق عميل ثانٍ لنفس الـ backend الذي يخدم الـ PWA — لا يُضاف ولا يُعدَّل أي endpoint. كل ما يلي منسوخ من الكود الفعلي ومن تقارير العقود ومُتحقَّق منه ضد المصدر.

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

| الملف | ماذا نأخذ منه |
|---|---|
| `unified-mafia/backend/src/index.ts` | تركيب كل الـ routers (سطور 141–187)، `express.json({ limit: '10mb' })` (سطر 126)، `app.use('/uploads', express.static('uploads'))` (سطر 127)، `/api/health` (سطر 130)، معالج الخطأ العام 500 `{ error: 'حدث خطأ داخلي' }` (سطر 1055)، رؤوس الأمان، CORS |
| `unified-mafia/backend/src/middleware/player-auth.middleware.ts` | `authenticatePlayer` ونصوص 401 الحرفية، `requireNoPendingFeedback` وحمولة `PENDING_SURVEYS` الكاملة، سر التوكن `JWT_SECRET + '_PLAYER'` |
| `unified-mafia/backend/src/middleware/rate-limit.ts` | شكل رد 429: `{ error, retryAfter }` + header ‏`Retry-After` |
| `unified-mafia/backend/src/routes/player-auth.routes.ts` | register/login/me/change-password بنصوص أخطائها الحرفية |
| `unified-mafia/backend/src/routes/player-app.routes.ts` | leaderboard/search/book/activities/follow/bookings/matches/my-active-rooms |
| `unified-mafia/backend/src/routes/player.routes.ts` | lookup/register/profile/avatar (تحقق الصورة والنصوص الحرفية) |
| `unified-mafia/backend/src/routes/player-notification.routes.ts` | endpoints الإشعارات الست |
| `unified-mafia/backend/src/routes/player-feedback.routes.ts` | pending/questions/submit |
| `unified-mafia/backend/src/routes/fnb.routes.ts` | `playerFnbRouter` ‏(`/api/fnb`) — context/menu/orders/my-orders/cancel بنصوصها |
| `unified-mafia/backend/src/routes/sounds.routes.ts` | `GET /api/sounds/active-map` (سطر 71) — بلا مصادقة |
| `unified-mafia/backend/src/routes/seasons.routes.ts` | المسارات العامة `/public/*` (سطور 16–64) |
| `unified-mafia/backend/src/routes/progression-settings.routes.ts` | `GET /public` (سطر 134) |
| `unified-mafia/frontend/src/lib/socket.ts` | مفتاح التخزين `mafia_player_token` ونمط قراءة التوكن |
| `unified-mafia/frontend/src/context/PlayerContext.tsx` | سلوك التحقق من الجلسة عند الإقلاع (`/me` ثم مسح صامت عند الفشل) ومفاتيح التخزين `mafia_player_auth`/`mafia_player_token`/`mafia_playerId` |
| `unified-mafia/frontend/src/lib/avatar.ts` | اشتقاق رابط المصغّر `avatarThumb` (regex حرفي) |
| `unified-mafia/frontend/src/lib/soundManager.ts` | نمط `${API_URL}${url}` لبناء روابط الأصوات المطلقة |
| تقارير العقود | `scratchpad/reports/contract.md` + `scratchpad/sections/contracts.md` |

---

## 3. التبعيات على ملفات الخطة الأخرى

| الملف | الاعتماد |
|---|---|
| `01-foundation-theme.md` | ألوان الثيم وأنماط الـ SnackBar/Dialog المشتركة التي تستهلكها مكوّنات الخطأ هنا |
| `02-models-data-layer.md` | نماذج `fromJson` لكل الردود المذكورة في §7 + المحوّلات (decimal-string→double، ISO→DateTime) |
| `04-socket-layer.md` | يشارك نفس الـ origin ونفس التوكن؛ `reconnectSocketAuth` يُستدعى بعد تغيّر التوكن هنا |
| `05-session-auth.md` | يملك `SessionStore` وتدفق login/mustChangePassword؛ طبقة الشبكة تستهلك التوكن وتُبلغ عن 401 |
| `06-push-notifications.md` | يستدعي `POST /api/player-notifications/register-token` عبر هذه الطبقة |
| `07-sound-system.md` | يستهلك `GET /api/sounds/active-map` و`UploadsUrlResolver` |
| `08-deeplinks-routing.md` | تحويل قيمة `redirect` (مثل `/player/feedback`) إلى route داخلي |
| `18-feedback.md` | الوجهة عند `PENDING_SURVEYS` |
| جميع شاشات 10–27 | تستهلك `ApiClient` والاستثناءات المعرّفة في §8 |

---

## 4. الواجهة والتجربة تفصيلياً

طبقة الشبكة ليست شاشة، لكنها تملك أربعة عناصر UI عابرة للتطبيق. ملاحظة أمانة للمصدر: الـ PWA لا يملك بانر انقطاع ولا حوار rate-limit مخصصَين (المتصفح يتكفل)، فهذه العناصر **إضافات جديدة للتطبيق** ونصوصها جديدة ومعلَّمة بـ «(جديد)». أما كل نص خطأ قادم من السيرفر فيُعرض **حرفياً كما وصل** في حقل `error` — هذا هو سلوك الويب (Swal يعرض `data.error`).

### 4.1 بانر عدم الاتصال — `OfflineBanner` (جديد)

- **الموضع:** شريط أعلى الشاشة تحت الـ AppBar مباشرة (أو أعلى `SafeArea` في الشاشات بلا AppBar)، بعرض كامل.
- **الظهور:** عندما يُبلغ `ConnectivityService` بغياب شبكة، **أو** بعد فشل طلبين متتاليين بـ `SocketException`/timeout رغم وجود شبكة (سيرفر ساقط).
- **التخطيط:** ارتفاع 36dp، صف: أيقونة `Icons.wifi_off` بحجم 16dp + نص.
- **النص (جديد):** «لا يوجد اتصال بالإنترنت» — وعند سقوط السيرفر مع وجود شبكة (جديد): «تعذّر الوصول إلى الخادم — سنعيد المحاولة تلقائياً».
- **الألوان:** خلفية `#7F1D1D`، نص وأيقونة `#FECACA`، حجم الخط 13sp وزن 600.
- **الأنيميشن:** دخول/خروج `SlideTransition` من الأعلى مع `Curves.easeOut`، المدة 200ms.
- **عند عودة الاتصال:** يتحول 2.5 ثانية إلى خلفية `#14532D` ونص `#BBF7D0` بعبارة (جديد): «عاد الاتصال» ثم ينزلق خارجاً. عودة الاتصال تُطلق إعادة تحميل تلقائية للشاشة النشطة (كل شاشة تسجّل `onReconnect` callback).

### 4.2 عرض أخطاء السيرفر — `ApiErrorSnackBar` / `ApiErrorDialog`

- **القاعدة:** أي `ApiException` تصل للشاشة تُعرض بنص `error` العربي القادم من السيرفر **حرفياً بلا تعديل** (مثل «رقم الهاتف أو كلمة المرور غير صحيحة»، «محجوز مسبقاً لهذا النشاط»، «وصلت حدّ الطلبات لهذه الفعاليّة — راجع المكان»). إن غاب حقل `error` من الرد (رد غير JSON أو انقطاع) يُعرض النص الاحتياطي (جديد): «حدث خطأ في الاتصال — حاول مجدداً».
- **SnackBar** (الأخطاء غير الحاجزة): خلفية `#450A0A`، إطار 1dp لون `#7F1D1D`، نص `#FECACA` بحجم 14sp، زوايا 12dp، مدة العرض 4 ثوانٍ، `behavior: floating` بهامش 16dp، زر إجراء اختياري «إعادة المحاولة» بلون `#FCA5A5`.
- **Dialog** (الأخطاء الحاجزة — فشل تحميل أساسي لشاشة): بطاقة داكنة `#18181B`، إطار `#3F3F46`، عنوان (جديد) «تعذّر التحميل» بلون `#F4F4F5` بحجم 16sp وزن 700، نص الخطأ `#A1A1AA` بحجم 14sp، زر «إعادة المحاولة» بعرض كامل خلفية `#DC2626` نص أبيض ارتفاع 44dp زوايا 10dp.
- كلا العنصرين RTL بالكامل.

### 4.3 حوار انتهاء الجلسة (401)

- **سلوك الويب المستنسَخ:** ‏`PlayerContext` عند فشل `/me` يمسح التخزين **بصمت** ويُظهر شاشة الدخول — بلا رسالة. نطبّق الأمر ذاته: عند 401 على طلب موثَّق → مسح الجلسة + الانتقال إلى شاشة الدخول (استبدال المكدس بالكامل).
- **إضافة اختيارية (جديد):** SnackBar واحدة بعد الوصول لشاشة الدخول بنص «انتهت صلاحية الجلسة — يرجى تسجيل الدخول مجدداً» — تُعرض فقط إن كانت الجلسة السابقة موجودة فعلاً (وليس عند الإقلاع الأول).
- **استثناءات لا تُطلق تسجيل الخروج** (تُعرض كخطأ عادي في الشاشة):
  - 401 من `POST /api/player-auth/login` (بيانات خاطئة: «رقم الهاتف أو كلمة المرور غير صحيحة» أو «هذا الحساب لم يُنشَأ له كلمة سر بعد — يرجى التسجيل»).
  - 401 من `POST /api/player-auth/change-password` («كلمة المرور القديمة غير صحيحة»).

### 4.4 حوار حدّ المحاولات (429)

- يظهر عند 429 من أي endpoint (عملياً: login بحد 15 محاولة/15 دقيقة).
- نص السيرفر الحرفي: «محاولات كثيرة جداً — يرجى المحاولة لاحقاً».
- تحته سطر عدّاد تنازلي (جديد): «يمكنك المحاولة بعد {mm:ss}» محسوب من حقل `retryAfter` (ثوانٍ) في الرد أو من header ‏`Retry-After`.
- زر تأكيد وحيد «حسناً» بنمط الزر الثانوي (خلفية `#27272A`، نص `#E4E4E7`). زر الدخول في شاشة login يبقى معطّلاً حتى انتهاء العدّاد (المنطق في `10-login-register.md`).

### 4.5 حالات فارغة/خطأ للشاشات

كل شاشة تعرّف حالتها الفارغة في ملفها؛ طبقة الشبكة توفر فقط الثلاثية الموحدة `AsyncValue`: ‏loading (skeleton من `01-foundation-theme.md`) / error (§4.2) / data.

---

## 5. التكيّف مع الشاشات 6→11 إنش

العناصر هنا عابرة للتطبيق، فتكيّفها بسيط ومحدد:

- **compact ‏(<600dp):**
  - `OfflineBanner`: عرض كامل، ارتفاع 36dp، خط 13sp.
  - `ApiErrorSnackBar`: ‏floating بهامش 16dp، عرض كامل ناقص الهوامش.
  - `ApiErrorDialog` وحوار 429 وحوار انتهاء الجلسة: `insetPadding` أفقي 24dp (عرض عملي ≈ عرض الشاشة − 48dp).
- **medium ‏(600–840dp):**
  - `OfflineBanner`: يبقى بعرض كامل (إشارة نظام لا محتوى)، الارتفاع 40dp والخط 14sp.
  - الحوارات: سقف عرض **420dp** وتوسيط أفقي — لا تمدد أبداً.
  - SnackBar: سقف عرض **480dp** موسّطة (`width: 480` بدل الهوامش).
- **expanded ‏(>840dp):**
  - `OfflineBanner`: عرض كامل، نفس مقاسات medium (لا تضخيم — عنصر معلوماتي).
  - الحوارات: نفس سقف 420dp؛ حجم الخطوط دون تغيير (نصوص الشبكة ليست عناصر لعب حساسة فلا تُضاعف).
  - SnackBar: سقف 480dp موسّطة.
- لا يوجد two-pane ولا تغيّر بنيوي — القاعدة العامة للملفات الأخرى (سقف 640dp للمحتوى النصي في medium و840–960dp في expanded) تُطبَّق على الشاشات المستهلكة، لا على هذه العناصر.

---

## 6. المنطق والتدفقات

### 6.1 بناء الـ base URL

- الويب يعتمد `NEXT_PUBLIC_API_URL || ''` (فارغ في الإنتاج = نفس الدومين عبر Next.js rewrites؛ محلياً `http://localhost:4000`). ‏Flutter لا يملك «نفس الدومين»، لذا الـ base URL **إلزامي وصريح** ويأتي من `AppConfig.baseUrl` الذي يحدّده entrypoint الـ flavor (لا `--dart-define` للروابط — قرار 01-foundation-theme.md §6.2 و00-MASTER-PLAN.md §3.1):
  - **flavor `dev`** = staging `https://mafia.grade.sbs`؛ **flavor `prod`** = `https://club-mafia.grade.sbs`. كلاهما HTTPS (يُثبَّت التوقيع/التعبئة في `90/91-release`).
  - للتطوير مقابل backend محلي (اختياري): يعدّل المطوّر قيمة `AppConfig` لـ dev محلياً إلى `http://10.0.2.2:4000` على محاكي Android أو `http://localhost:4000` على iOS simulator/سطح المكتب (build debug فقط — انظر §10)؛ الـ flavor المُصدَّر يبقى staging https.
- **نفس الـ origin يخدم ثلاثة أشياء:** REST تحت `/api/*`، الملفات الثابتة تحت `/uploads/*` (‏`express.static('uploads')`)، وSocket.IO على `/socket.io` (تفاصيله في `04-socket-layer.md`). ممنوع تعريف hosts منفصلة.
- لا يوجد أي versioning في المسارات (`/api/...` مباشرة) ولا cookies — المصادقة بالـ header فقط.

### 6.2 إعداد Dio (قيم جديدة خاصة بالتطبيق — الويب بلا مهلات صريحة)

```
BaseOptions(
  baseUrl: ApiConfig.baseUrl,
  connectTimeout: Duration(seconds: 10),
  receiveTimeout: Duration(seconds: 20),
  sendTimeout:    Duration(seconds: 20),
  headers: { 'Content-Type': 'application/json' },
  responseType: ResponseType.json,
)
```

- **استثناء مهلة:** ‏`POST /api/player/:id/avatar` يرفع صورة base64 حتى ~6.9MB داخل JSON (حد السيرفر `express.json({ limit: '10mb' })` والحد الفعلي للصورة 5MB بعد فك الترميز) → لهذا الطلب وحده `sendTimeout: 60s` و`receiveTimeout: 60s`.
- `validateStatus: (s) => s != null && s < 500` **لا يُستخدم** — نترك Dio يرمي على أي ≥400 ونحوّل في الـ interceptor (انظر 6.4).
- الترتيب في المكدس: `AuthInterceptor` ← `RetryInterceptor` ← `ErrorMappingInterceptor` ← (‏debug فقط) `LogInterceptor` مع حجب header ‏`Authorization`.

### 6.3 ‏`AuthInterceptor` — حقن التوكن

- يقرأ توكن اللاعب من getter ‏`SessionStore.playerToken` (المشتق من الجلسة القانونية `mafia_player_auth` في `flutter_secure_storage` — **لا يُخزَّن مفتاح `mafia_player_token` منفصلاً** في Flutter، انظر 05-session-auth.md §6.1) ويضيف `Authorization: Bearer <token>` لكل طلب **إلا** المسارات العامة التالية (تعمل بلا توكن، وإرساله لا يضر لكن لا يُرسل توكناً فارغاً):
  - `POST /api/player-auth/register`، `POST /api/player-auth/login`
  - `GET /api/player-app/leaderboard`، `GET /api/player-app/activities/upcoming`
  - `POST /api/player/lookup`، `POST /api/player/register`، `GET /api/player/:id/profile`
  - `GET /api/sounds/active-map`، `GET /api/progression-settings/public`، `GET /api/seasons/public/*`، `GET /api/health`
- خصائص التوكن (للفهم لا للتنفيذ هنا — التنفيذ في `05-session-auth.md`): ‏JWT ‏HS256 بسر مشتق `JWT_SECRET + '_PLAYER'`، حمولة `{ playerId:number, phone:string, name:string }` + iat/exp، صلاحية `'30d'`. **لا يوجد refresh endpoint** — انتهاء الصلاحية = 401 = إعادة تسجيل دخول.
- `POST /api/player-auth/change-password` يرجع **توكناً جديداً** في الرد — من مسؤولية مستدعيه استبدال المخزّن فوراً ثم استدعاء `reconnectSocketAuth` المكافئ (في `04-socket-layer.md`).

### 6.4 ‏`ErrorMappingInterceptor` — خريطة الأخطاء المركزية (state machine)

ترتيب الفحص إلزامي:

1. **خطأ نقل** (‏`SocketException`، ‏`connectionTimeout`، ‏`receiveTimeout`، رد غير JSON): → `NetworkException` + إشعار `ConnectivityService` (يغذي بانر §4.1). لا logout أبداً.
2. **401:** أجساد السيرفر الحرفية: `{ error: 'غير مصادق — يرجى تسجيل الدخول' }` (بلا header) أو `{ error: 'توكن غير صالح أو منتهي الصلاحية' }` (توكن فاسد/منتهٍ). إن كان الطلب **موثَّقاً** والمسار ليس من استثناءات §4.3 → يُطلق حدث `sessionExpired` على `AuthEvents` stream (تستهلكه `05-session-auth.md`: مسح `mafia_player_token` + `mafia_player_auth` + `mafia_playerId` من التخزين الآمن، تصفير socket auth، التوجيه للدخول). ثم يُرمى `UnauthorizedException(error)`.
3. **403 مع `code == 'PENDING_SURVEYS'`:** الجسد الحرفي الكامل: `{ success:false, error:'يجب إكمال استبيانات فعالياتك السابقة قبل المتابعة', code:'PENDING_SURVEYS', pendingCount:<int>, redirect:'/player/feedback' }` → يُرمى `PendingSurveysException(pendingCount, redirect)`. المستهلك يعرض النص الحرفي ثم يوجّه لشاشة feedback (‏`18-feedback.md`) عبر جدول التحويل في `08-deeplinks-routing.md`. أي 403 آخر → `ForbiddenException(error)`.
4. **429:** ‏`{ error:'محاولات كثيرة جداً — يرجى المحاولة لاحقاً', retryAfter:<seconds> }` + header ‏`Retry-After` → `RateLimitedException(retryAfter, error)` (حوار §4.4). ملاحظة: ‏fnb يرجع 429 أيضاً بنص «وصلت حدّ الطلبات لهذه الفعاليّة — راجع المكان» **بلا** `retryAfter` — عندها `retryAfter = null` ويُعرض النص كـ SnackBar لا كحوار عدّاد.
5. **400/404/409/503:** ‏→ `ValidationException` / `NotFoundException` / `ConflictException` / `ServiceUnavailableException`، كلها تحمل `error` الحرفي. ‏503 دائماً «قاعدة البيانات غير متوفرة» أو `'DB unavailable'` — قابلة لإعادة المحاولة يدوياً.
6. **500:** المعالج العام يرجع `{ error: 'حدث خطأ داخلي' }` (وبعض المسارات ترجع `err.message`) → `ServerException(error)`.
7. **قاعدة ذهبية:** المنطق يتفرع على **HTTP status + حقل `code`** حصراً؛ نص `error` للعرض فقط (النصوص العربية قد تتغير).

### 6.5 ‏`RetryInterceptor` — سياسة إعادة المحاولة (جديدة، محافظة)

- **يُعاد فقط:** طلبات **GET** الفاشلة بخطأ نقل أو 502/503/504.
- **لا يُعاد أبداً:** أي POST/PUT/DELETE (خطر التكرار: حجز مزدوج `/book`، طلب F&B مزدوج `/orders`، متابعة مكررة) — حتى عند timeout، لأن الطلب قد يكون وصل.
- الجدولة: محاولتان إضافيتان بتأخير 1s ثم 3s، وإلغاء فوري إن أُلغي الطلب (`CancelToken`) أو انتقلت الشاشة.
- 401/403/404/409/400/429 لا تُعاد إطلاقاً.

### 6.6 حالة عدم الاتصال — `ConnectivityService`

- المصدر المزدوج: `connectivity_plus` (تغيّر الشبكة) + نتائج الطلبات الفعلية (فشلان متتاليان بخطأ نقل = offline حتى مع شبكة ظاهرة).
- `Stream<OnlineStatus>` بقيم `online / offlineNoNetwork / offlineServerDown` — يغذي §4.1.
- **فحص الاستشفاء:** عند `offlineServerDown` يُستطلع `GET /api/health` (رد: `{ status:'ok', platform:'Unified Mafia Platform v2.0', timestamp:<ISO> }`) كل 10 ثوانٍ حتى النجاح.
- **دورة حياة التطبيق:** عند `AppLifecycleState.resumed` يُنفَّذ فحص فوري + تُبلَّغ الشاشة النشطة لتعيد التحميل (يوازي سلوك visibility-change في الويب).
- **لا طابور كتابة offline:** أي عملية كتابة أثناء الانقطاع تفشل فوراً بـ `NetworkException` وتُعرض للمستخدم — لا queue ولا إعادة تلقائية للكتابات (سلوك الويب نفسه). حالة اللعبة الحية تُستشفى من `room:get-my-state` في `04-socket-layer.md` لا من REST.

### 6.7 بناء الروابط المطلقة `/uploads/*` — ‏`UploadsUrlResolver`

- **كل** الروابط الملفّية من السيرفر نسبية وتبدأ بـ `/uploads/`: صور الأفاتار `avatarUrl` بصيغة `/uploads/avatars/{id}.{ext}?v={timestamp}`، المصغّرات `/uploads/avatars/thumbs/{playerId}.webp` (عرض 192px، يكتبها السيرفر مع كل رفع)، صور المنيو `imageUrl`، ملفات الأصوات من `active-map`.
- `absolute(String? rel)`: ‏null/فارغ → null؛ يبدأ بـ `http` → كما هو؛ غير ذلك → `ApiConfig.baseUrl + rel`. (يطابق نمط الويب `${API_URL}${url}`.)
- `thumb(String? avatarUrl)`: نسخ حرفي لمنطق `frontend/src/lib/avatar.ts`:
  - ‏regex: ‏`^(.*\/avatars\/)([^/?#.]+)\.[a-zA-Z]+(?:[?#].*)?$`
  - عند التطابق → `{group1}thumbs/{group2}.webp`؛ عند عدم التطابق (رابط خارجي/غير قياسي) → الرابط كما هو؛ null → null.
  - الاستخدام: القوائم الصغيرة (≤48dp) تحمّل المصغّر مع `errorWidget` يرجع للرابط الكامل — يطابق سلوك `onError` في الويب.
- **الكاش:** لاحقة `?v={ts}` تتغير مع كل رفع أفاتار عمداً (cache-busting) — `cached_network_image` يعتبر الرابط الجديد مفتاحاً جديداً تلقائياً؛ **لا** تُزال اللاحقة من المفتاح. المصغّرات بلا `?v` — بعد رفع أفاتار جديد يجب `CachedNetworkImage.evictFromCache(thumbUrl)` للاعب نفسه.

### 6.8 الحالات الحدّية

- **رد نجاح بلا `success: true`:** ‏`POST /api/player/lookup` يرجع `{ found, player|null }` — لا يُفترض `success` في كل الردود.
- **`GET /api/sounds/active-map` عند سقوط DB:** يرجع `{ success:true, map:{} }` بـ 200 — ليس خطأ.
- **تطبيع الهاتف:** السيرفر يحذف `+962/00962/962` ويفرض `0` بادئة؛ التطبيق يرسل الأرقام كما أُدخلت بصيغة الأردن `07…` ولا يطبّع محلياً.
- **`activeGame` في `/me`:** يُفحص حيّاً من Redis — قد يكون null رغم وجود مباراة انتهت للتو؛ لا كاش له.
- **طلب أثناء تبديل التوكن (change-password):** ‏`AuthInterceptor` يقرأ التوكن لحظة الإرسال من `SessionStore` — لا نسخة محفوظة في الذاكرة خارج الـ store.
- **إلغاء الطلبات عند مغادرة الشاشة:** كل شاشة تمرر `CancelToken` يُلغى في `dispose` — إلغاء لا يُظهر أي UI خطأ.

---

## 7. عقود التكامل

كل ما يلي REST حصراً؛ أحداث الـ socket كاملة في `04-socket-layer.md`. قواعد عامة: أخطاء دائماً JSON بحقل `error` عربي؛ النجاح يحمل `success: true` إلا المذكور؛ الأرقام العشرية من DB تصل **نصوصاً** (`basePrice`, `price`, `total`, `unitPrice`)؛ التواريخ ISO strings؛ أعمدة JSON (`data`, `rewardBreakdown`, `permissions`, `offers`) تصل مفكوكة.

### 7.1 المصادقة — `/api/player-auth`

| # | Method & Path | Auth | Request | Response / الأخطاء الحرفية |
|---|---|---|---|---|
| 1 | `POST /api/player-auth/register` | بدون | `{ phone, password (≥4), name, gender?('MALE'\|'FEMALE' افتراضي MALE), dob? }` | `{ success, token, welcomeBonus:200, player:{ id, playerId, phone, name, gender, dob, mustChangePassword:false } }`. ‏400: «رقم الهاتف والاسم وكلمة المرور مطلوبون» / «كلمة المرور يجب أن تكون 4 أحرف على الأقل»؛ 409: «رقم الهاتف مسجل مسبقاً — يرجى تسجيل الدخول»؛ 503: «قاعدة البيانات غير متوفرة»؛ 500: «خطأ في إنشاء الحساب» |
| 2 | `POST /api/player-auth/login` | بدون — **rate-limit ‏15/15 دقيقة** (keyPrefix ‏`player-login`) | `{ phone, password }` | `{ success, token, player:{ id, playerId, phone, name, gender, dob, avatarUrl, mustChangePassword } }`. ‏400: «رقم الهاتف وكلمة المرور مطلوبان»؛ 401: «رقم الهاتف أو كلمة المرور غير صحيحة» / «هذا الحساب لم يُنشَأ له كلمة سر بعد — يرجى التسجيل»؛ 429: §6.4-4 |
| 3 | `GET /api/player-auth/me` | Bearer | — | `{ success, player:{ id, playerId, phone, name, gender, dob, avatarUrl, email, totalMatches, totalWins, totalSurvived, mustChangePassword }, staffInfo:{ staffId, username, role, displayName, permissions[] }\|null, staffToken:string\|null (staff JWT تلقائي إذا linkedStaffId), activeGame:{ roomId, roomCode, gameName, physicalId, role (null حتى rolesConfirmed), isAlive, phase }\|null, frozenGames:[نفس الشكل] }`. ‏404: «اللاعب غير موجود» |
| 4 | `POST /api/player-auth/change-password` | Bearer | `{ oldPassword? (غير مطلوب عندما mustChangePassword=true), newPassword (≥4) }` | `{ success, token (جديد — استبدله فوراً), message:'تم تغيير كلمة المرور بنجاح' }`. ‏400: «كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل» / «كلمة المرور القديمة مطلوبة»؛ 401: «كلمة المرور القديمة غير صحيحة» — **لا logout** |
| 5 | `POST /api/player-auth/migrate-welcome-bonus` | staff admin | — | إداري — خارج نطاق التطبيق |

### 7.2 تطبيق اللاعب والحجوزات — `/api/player-app` (المسارات الثابتة قبل `/:id`)

| # | Method & Path | Auth | Request | Response / الأخطاء |
|---|---|---|---|---|
| 1 | `GET /api/player-app/leaderboard` | بدون | — | `{ success, leaderboard:[{ id, name, avatarUrl, level, xp, rankTier, rankRR, totalMatches, totalWins }] }` أعلى 50؛ الترتيب tier ‏(GODFATHER>UNDERBOSS>CAPO>SOLDIER>الباقي) ثم rankRR ثم level |
| 2 | `GET /api/player-app/search?q=` | Bearer | ‏`q` ≥2 أحرف | `{ success, results:[{ id, name, avatarUrl }] }` حد 20؛ ‏ilike على الاسم والهاتف معاً؛ يستثني المستدعي؛ **الهاتف لا يُرجع أبداً** |
| 3 | `POST /api/player-app/book` | Bearer + ‏`requireNoPendingFeedback` | `{ activityId, offerId? }` | ‏**201** `{ success, booking }` — حجز ذاتي count=1؛ ينشئ/يؤكد reservation ويطلق FCM. ‏400: «activityId مطلوب»؛ 404: «النشاط غير موجود»؛ 409: «محجوز مسبقاً لهذا النشاط»؛ 403 ‏`PENDING_SURVEYS` (§6.4-3) |
| 4 | `GET /api/player-app/activities/upcoming?playerId=` | بدون (‏playerId فقط لإظهار أنشطة test) | — | `{ success, activities:[{ id, name, date, description, basePrice (نص!), status('planned'\|'active'), locationId, maxCapacity, difficulty, enabledOfferIds, locationName, locationMapUrl, locationOffers (مصفّاة), isTestLocation, bookedCount, maxPlayers }] }` |
| 5 | `GET /api/player-app/activities/:actId/following-bookers?playerId=` | Bearer | كلا المعرّفين مطلوبان (‏400: «activityId و playerId مطلوبان») | `{ success, count, bookers:[{ id, name, avatarUrl, level, isFollowing }] }` المتابَعون أولاً |
| 6 | `GET /api/player-app/my-active-rooms` | Bearer | — | `{ success, rooms:[{ activityId, activityName, activityDate, rooms:[{ sessionId, sessionCode, sessionName, maxPlayers }] }] }` — أنشطة محجوزة لها session نشطة فقط |
| 7 | `GET /api/player-app/:id/co-players` | Bearer | — | `{ success, coPlayers:[{ id, name, avatarUrl, level, rankTier, matchCount, isFollowing }] }` بترتيب matchCount تنازلياً |
| 8 | `POST /api/player-app/:id/follow/:targetId` | Bearer (**هوية المتابِع من التوكن؛ `:id` مُهمَل**) | — | `{ success, message:'تمت المتابعة' }` أو idempotent ‏`{ success, message:'متابع مسبقاً' }`. ‏403: «لا يمكن متابعة لاعب لم تلعب معه»؛ 400: «معرّفات غير صالحة» |
| 9 | `DELETE /api/player-app/:id/follow/:targetId` | Bearer (‏`:id` مُهمَل) | — | `{ success, message:'تم إلغاء المتابعة' }` |
| 10 | `GET /api/player-app/:id/following` | Bearer | — | `{ success, following:[{ id, name, avatarUrl, level, rankTier, rankRR, totalMatches, totalWins }] }` |
| 11 | `GET /api/player-app/:id/following-feed` | Bearer | — | `{ success, feed:[{ playerId, playerName, role, survived, xpEarned, rrChange, matchWinner, matchDate, playerInfo:{ id, name, avatarUrl, level, rankTier }\|null }] }` آخر 20 مباراة للمتابَعين |
| 12 | `GET /api/player-app/:id/bookings` | Bearer | — | `{ success, bookings:[{ bookingId, activityId, isPaid, isFree, createdAt, activityName, activityDate, activityStatus }] }` |
| 13 | `GET /api/player-app/:id/matches` | Bearer | — | `{ success, matches:[{ matchId, gameName, matchDate, matchWinner, durationSeconds, totalRounds, playerCount, role, survivedToEnd, eliminatedDuring, eliminatedAtRound, roundsSurvived, dealInitiated, dealSuccess, abilityUsed, abilityCorrect, xpEarned, rrChange, penaltyCount, penaltyRRDeduction, bombRRChange, rewardBreakdown (JSON مفكوك), breakdown (تفصيل عرض جاهز من السيرفر) }] }` |

### 7.3 اللاعب (النواة) — `/api/player` (المسارات ذات الصلة بالتطبيق فقط)

| # | Method & Path | Auth | Request | Response |
|---|---|---|---|---|
| 1 | `POST /api/player/lookup` | **بدون** | `{ phone }` | `{ found:bool, player:{ id, displayName, phone, gender, dateOfBirth, playerId }\|null, dbError? }` — **بلا حقل `success`**؛ يهاجر تلقائياً من legacy |
| 2 | `POST /api/player/register` | **بدون** | `{ phone, displayName, dateOfBirth?, gender? }` | `{ success, player:{ id, playerId, displayName, phone } }` ‏(find-or-create). ‏400: «الاسم ورقم الهاتف مطلوبان» |
| 3 | `GET /api/player/:id/profile` | **بدون** | — | `{ success, ...profile (كائن اللاعب + الإحصاءات), activeGame:{ roomId, roomCode, gameName, physicalId, role, isAlive, phase }\|null }` (يتخطى المجمّدة). ‏400: «معرّف اللاعب غير صالح»؛ 404: «اللاعب غير موجود» |
| 4 | `PUT /api/player/:id/profile` | `staffOrSelf('id')` — player JWT لصاحب الحساب | أي من `{ name, email (يقبل null), gender('MALE'\|'FEMALE'), phone, genderConstraint('NONE'\|'FORBID_SAME'\|'FORBID_OPPOSITE') }` | `{ success, player }`؛ يزامن الاسم حيّاً في غرف Redis. ‏400: «لا توجد بيانات للتحديث» |
| 5 | `POST /api/player/:id/avatar` | `staffOrSelf('id')` | `{ image:'data:image/(jpeg\|jpg\|png\|webp\|gif);base64,...' }` ≤5MB بعد الفك | `{ success, avatarUrl:'/uploads/avatars/{id}.{ext}?v={ts}' }` + يكتب السيرفر مصغّر `/uploads/avatars/thumbs/{id}.webp` ‏(192px). ‏400: «صورة غير صالحة» / «تنسيق صورة غير صالح» / «نوع صورة غير مدعوم» / «حجم الصورة كبير جداً (الحد 5MB)»؛ 500: «خطأ في رفع الصورة» |

باقي مسارات `/api/player/*` (all/reset-password/toggle-*/delete) إدارية بـ staff JWT — لا تُنفَّذ في التطبيق.

### 7.4 الإشعارات — `/api/player-notifications` (كلها Bearer؛ 401 موحّد «غير مصادق»)

| # | Method & Path | Request | Response |
|---|---|---|---|
| 1 | `POST /api/player-notifications/register-token` | `{ token (FCM), deviceInfo?, deviceId? }` | `{ success:true }`. ‏400: «token مطلوب» |
| 2 | `GET /api/player-notifications/?limit=` (افتراضي 50) | — | `{ success, notifications:[{ id, playerId, title, body, type, data (JSON مفكوك — يشمل `url` للـ deep-link), isRead, isPushSent, createdAt }] }` بترتيب createdAt تنازلياً. الأنواع المرصودة: `booking_confirmed`، `activity_started`، `room_invite`، `new_booking` |
| 3 | `GET /api/player-notifications/unread-count` | — | `{ success, count:int }` |
| 4 | `PUT /api/player-notifications/:id/read` | — | `{ success:true }` (مقيَّد بمالك الإشعار) |
| 5 | `PUT /api/player-notifications/read-all` | — | `{ success:true }` |
| 6 | `DELETE /api/player-notifications/:id` | — | `{ success:true }` |

### 7.5 الاستبيانات — `/api/player-feedback` (كلها Bearer)

| # | Method & Path | Request | Response |
|---|---|---|---|
| 1 | `GET /api/player-feedback/pending` | — | `{ success, count, pending:[واصفات sessions] }` |
| 2 | `GET /api/player-feedback/:sessionId` | — | `{ success, questions: FEEDBACK_QUESTIONS, alreadyDone:bool, context:{ sessionId, sessionName, sessionCode, activityName, locationName, playedAt } }`. ‏403 إذا لا استبيان مستحقاً |
| 3 | `POST /api/player-feedback/:sessionId` | `{ answers:{ [كل FEEDBACK_KEY]: int 1..5 }, notes? }` — **كل مفتاح إلزامي** | `{ success:true }`. ‏400 عند مفتاح ناقص/قيمة خارج 1..5 |

### 7.6 طلبات المنيو — `/api/fnb` (كلها Bearer)

| # | Method & Path | Request | Response / الأخطاء الحرفية |
|---|---|---|---|
| 1 | `GET /api/fnb/context` | — | `{ success, context:{ activityId, activityName, activityDate, locationId, locationName, bookingId, sessionId, physicalId, source:'live'\|'booking' }\|null, reason? }` — لا context = ‏`{ success:true, context:null, reason:<سبب عربي> }` بـ 200 |
| 2 | `GET /api/fnb/menu?activityId=` | — | `{ success, items:[{ id, category, name, description, price (نص!), imageUrl }] }`. ‏400: «activityId مطلوب»؛ 404: «المنيو غير متاح لهذه الفعاليّة» |
| 3 | `POST /api/fnb/orders` | `{ items:[{ menuItemId, quantity 1..20 }] (≤30 سطراً), note? (≤300) }` — **لا أسعار من العميل أبداً** | `{ success, order }`. ‏400: «أضف صنفاً واحداً على الأقلّ» / «عدد بنود الطلب كبير جدّاً» / «بند غير صالح (الكمّية 1-20)» / «بعض الأصناف لم تعد متاحة — حدّث المنيو وأعد المحاولة»؛ 403: «لا يوجد نشاط متاح للطلب الآن» أو نص سياق آخر؛ 429 (بلا retryAfter): «وصلت حدّ الطلبات لهذه الفعاليّة — راجع المكان» (>10 طلبات مفتوحة) |
| 4 | `GET /api/fnb/my-orders?activityId=` | — | `{ success, orders:[{ id, status('new'\|'preparing'\|'delivered'\|'cancelled'), total (نص!), note, createdAt, items:[{ name, unitPrice (نص!), quantity }] }] }` |
| 5 | `POST /api/fnb/orders/:id/cancel` | — | `{ success }` — فقط والحالة `'new'`. ‏400: «لا يمكن إلغاء الطلب — بدأ تحضيره أو غير موجود» / «معرّف غير صالح» |

### 7.7 الأصوات والمواسم والإعدادات العامة والصحة

| # | Method & Path | Auth | Response |
|---|---|---|---|
| 1 | `GET /api/sounds/active-map` | بدون | `{ success, map:{ [eventKey]: '/uploads/sounds/<filename>' } }` — روابط نسبية تُبنى عبر `UploadsUrlResolver`؛ عند سقوط DB يرجع `{ success:true, map:{} }` بـ 200 (يستهلكه `07-sound-system.md`) |
| 2 | `GET /api/progression-settings/public` | بدون | `{ success, config }` — إعدادات XP/RR العامة (شاشة الرانك `15-rank.md`) |
| 3 | `GET /api/seasons/public/active` | بدون | `{ success, season }` — الموسم العادي النشط أو null |
| 4 | `GET /api/seasons/public/list` | بدون | `{ success, seasons:[{ id, name, seasonNumber, status, startedAt, endedAt }] }` — REGULAR فقط |
| 5 | `GET /api/seasons/public/online-list` | بدون | `{ success, seasons:[نفس الشكل], activeOnlineSeasonId }` — ONLINE فقط |
| 6 | `GET /api/seasons/public/:id/leaderboard?limit=` (افتراضي 100، أقصى 200) | بدون | `{ success, leaderboard:[{ id (=playerId), ...صفوف الترتيب }] }`. ‏400: «معرّف غير صالح» |
| 7 | `GET /api/health` | بدون | `{ status:'ok', platform:'Unified Mafia Platform v2.0', timestamp }` — فحص الاستشفاء §6.6 |
| 8 | `GET /api/push/vapid-public-key` | بدون | `{ publicKey }` — ‏Web Push فقط؛ **لا يُستخدم في Flutter** (البديل: 7.4-#1 بـ FCM) |

**ملاحظة socket:** كل الأحداث (بما فيها `room:get-my-state` المُستطلَع كل 3 ثوانٍ) في `04-socket-layer.md`؛ هذه الطبقة تشارك معه فقط الـ origin والتوكن.

---

## 8. نماذج Dart المطلوبة

(نماذج بيانات الردود نفسها في `02-models-data-layer.md` — هنا بنية طبقة الشبكة فقط)

| الكلاس | الحقول/التوقيع |
|---|---|
| `ApiConfig` | `String baseUrl` (يأتي من `AppConfig.baseUrl` المحدَّد بالـ flavor في 01 — لا dart-define)، `Duration connectTimeout=10s`، `Duration receiveTimeout=20s`، `Duration sendTimeout=20s`، `Duration uploadTimeout=60s` |
| `ApiClient` | يغلّف Dio؛ ‏`Future<Map<String,dynamic>> get(path, {query, cancelToken})`، ‏`post(path, {body, cancelToken, isUpload=false})`، ‏`put`، ‏`delete` — كلها ترمي `ApiException` |
| `AuthInterceptor` | ‏`SessionStore sessionStore`؛ قائمة المسارات العامة §6.3 كـ `Set<String>` + فحص prefix |
| `RetryInterceptor` | ‏`int maxRetries=2`، ‏`List<Duration> delays=[1s,3s]`؛ ‏GET فقط + أخطاء نقل/502/503/504 |
| `ErrorMappingInterceptor` | خريطة §6.4؛ يبث على `AuthEvents.sessionExpired` |
| `AuthEvents` | ‏`Stream<AuthEvent> stream`؛ ‏`enum AuthEvent { sessionExpired }` |
| `sealed class ApiException` | ‏`String message` (نص `error` العربي الحرفي أو الاحتياطي)، `int? statusCode` |
| `NetworkException extends ApiException` | — |
| `TimeoutException extends ApiException` | — |
| `UnauthorizedException extends ApiException` | — |
| `ForbiddenException extends ApiException` | — |
| `PendingSurveysException extends ForbiddenException` | ‏`int pendingCount`، ‏`String redirect` ‏(`'/player/feedback'`) |
| `RateLimitedException extends ApiException` | ‏`int? retryAfterSeconds` (null في حالة fnb) |
| `ValidationException extends ApiException` | ‏(400) |
| `NotFoundException extends ApiException` | ‏(404) |
| `ConflictException extends ApiException` | ‏(409 — مثل «محجوز مسبقاً لهذا النشاط») |
| `ServiceUnavailableException extends ApiException` | ‏(503) |
| `ServerException extends ApiException` | ‏(500) |
| `ConnectivityService` | ‏`Stream<OnlineStatus> status`؛ ‏`enum OnlineStatus { online, offlineNoNetwork, offlineServerDown }`؛ ‏`Future<bool> probeHealth()` |
| `UploadsUrlResolver` | ‏`String? absolute(String? rel)`، ‏`String? thumb(String? avatarUrl)` ‏(regex §6.7) |
| `HealthResponse` | ‏`String status`، ‏`String platform`، ‏`DateTime timestamp` |

ملاحظة: `SessionStore` (قراءة/كتابة/مسح الجلسة القانونية `mafia_player_auth` واشتقاق `playerToken` منها) مُعرَّف ومملوك في `05-session-auth.md`؛ هنا يُستهلك عبر interface.

---

## 9. الحزم المستخدمة

| الحزمة | الغرض |
|---|---|
| `dio` ^5.x | عميل HTTP + interceptors + CancelToken |
| `flutter_secure_storage` | تخزين الجلسة القانونية `mafia_player_auth` (يُشتق منها `playerToken`) — عبر `SessionStore` من 05 |
| `connectivity_plus` | رصد تغيّر الشبكة لـ `ConnectivityService` |
| `cached_network_image` | صور `/uploads/*` مع الكاش (سلوك `?v=` في §6.7) |
| `flutter_riverpod` | ‏providers: ‏`apiClientProvider`، ‏`connectivityProvider`، ‏`authEventsProvider` |
| `freezed` + `json_serializable` | ‏(في 02) نماذج الردود |

**لا** تُستخدم حزمة retry جاهزة (`dio_smart_retry`) — السياسة المحافظة في §6.5 مكتوبة يدوياً لضمان عدم إعادة أي كتابة.

---

## 10. اختلافات Android / iOS

- **Android:**
  - إذن `android.permission.INTERNET` في الـ manifest.
  - كلا الـ flavors (dev=staging وprod) HTTPS، فـ `usesCleartextTraffic=false` على البناءات المُصدَّرة (تكافؤ مع 01-foundation-theme.md §13 — لا استثناءات cleartext تُشحَن).
  - **فقط** عند التوجيه الاختياري نحو backend محلي (§6.1): ‏`network_security_config.xml` في build **debug** يسمح بـ cleartext لـ `10.0.2.2`/`localhost` حصراً؛ والمحاكي يصل للمحلي عبر `10.0.2.2:4000` وليس `localhost`.
- **iOS:**
  - ‏ATS يفرض HTTPS افتراضياً — كلا الـ flavors متوافق بلا أي استثناء؛ **فقط** للـ backend المحلي الاختياري في debug يُضاف `NSAllowsLocalNetworking=true` (بلا استثناء دومينات عامة).
  - ‏Keychain (‏`flutter_secure_storage`) **يبقى بعد حذف التطبيق**: عند أول إقلاع بعد تثبيت جديد قد يوجد توكن قديم — سلوكنا الموحد (تحقق `/me` عند الإقلاع من `05-session-auth.md`) يغطي ذلك: 401 → مسح صامت (لا نعرض SnackBar انتهاء الجلسة في هذا المسار).
- لا اختلافات أخرى: لا خلفية، لا شهادات مخصصة، ونفس سياسات المهلات والـ retry على المنصتين.

---

## 11. الأصول المطلوبة

لا أصول خاصة بهذه الطبقة — أيقونات البانر والحوارات من Material Icons (‏`wifi_off`، ‏`error_outline`)، والألوان من ثيم `01-foundation-theme.md`.

---

## 12. معايير القبول — checklist تكافؤ

- [ ] كل طلب موثَّق يحمل `Authorization: Bearer <mafia_player_token>` والمسارات العامة في §6.3 تعمل بلا توكن.
- [ ] ‏401 على طلب موثَّق (عدا login وchange-password) يمسح الجلسة ويوجّه للدخول — ويُتحقق أن 401 «كلمة المرور القديمة غير صحيحة» و401 login **لا** يسجّلان الخروج.
- [ ] ‏403 مع `code:'PENDING_SURVEYS'` يعرض «يجب إكمال استبيانات فعالياتك السابقة قبل المتابعة» حرفياً ويوجّه لشاشة feedback، من `/book` ومن بوابة الانضمام كليهما.
- [ ] ‏429 من login يعرض «محاولات كثيرة جداً — يرجى المحاولة لاحقاً» + عدّاداً تنازلياً مطابقاً لـ `retryAfter`؛ و429 من fnb يعرض نصه كـ SnackBar بلا عدّاد.
- [ ] ‏`POST /api/player-auth/change-password` يستبدل التوكن المخزّن بالجديد من الرد قبل أي طلب لاحق.
- [ ] لا تُعاد محاولة أي POST/PUT/DELETE تلقائياً أبداً (اختبار: قطع الشبكة أثناء `/book` لا ينتج حجزين).
- [ ] ‏GET فاشلة بخطأ نقل تُعاد مرتين (1s ثم 3s) ثم ترمي `NetworkException`.
- [ ] `avatarUrl` النسبي يُعرض صورةً صحيحة عبر `absolute()`، والمصغّر يُشتق بـ regex §6.7 ويرجع للأصل عند فشله (تكافؤ `avatar.ts`).
- [ ] رفع أفاتار جديد يعرض الصورة الجديدة فوراً (لاحقة `?v=` تكسر الكاش) ويمسح كاش المصغّر.
- [ ] روابط `map` من `/api/sounds/active-map` تُبنى مطلقة وتُشغَّل (تكافؤ `soundManager.ts`).
- [ ] بانر «لا يوجد اتصال بالإنترنت» يظهر خلال ≤3 ثوانٍ من قطع الشبكة ويختفي مع «عاد الاتصال» خلال ≤10 ثوانٍ من عودة السيرفر (فحص `/api/health` الدوري).
- [ ] `POST /api/player/lookup` يُفسَّر بحقل `found` (لا `success`) دون كسر الـ parsing.
- [ ] الحقول العشرية النصية (`basePrice`, `price`, `total`, `unitPrice`) تُفكّك دون استثناء (المحوّل من 02).
- [ ] كل نص خطأ يظهر للمستخدم مطابق حرفياً لحقل `error` من السيرفر، والمنطق لا يتفرع على النص إطلاقاً.
- [ ] الحوارات على medium/expanded مقيّدة بعرض 420dp وSnackBar بـ 480dp؛ وعلى compact بهوامش 16/24dp.
- [ ] التبديل بين البيئات يتم **بتبديل الـ flavor فقط** (`--flavor dev` = staging `https://mafia.grade.sbs` / `--flavor prod` = `https://club-mafia.grade.sbs`) بلا أي `--dart-define` للروابط؛ وأي توجيه اختياري نحو backend محلي يكون بتعديل `AppConfig` لـ dev في build debug.

---

## 13. ملاحظات أداء وأمان

- **حجب التوكن في السجلات:** ‏`LogInterceptor` في debug فقط مع `requestHeader:false` أو تنقيح `Authorization` يدوياً؛ ممنوع طباعة التوكن أو حفظه خارج `flutter_secure_storage`. لا يُرسل التوكن في query strings أبداً.
- **لا refresh token:** الصلاحية 30 يوماً؛ أي محاولة «تجديد صامت» غير مدعومة سيرفرياً — لا تُخترع.
- **rate limits تُحترم client-side** قبل السيرفر: login (تعطيل الزر مع العدّاد)، fnb (≤30 سطراً، كمية ≤20 — تحقق محلي قبل الإرسال). حدود الـ socket (mafia chat 700ms، الدعوات 10/دقيقة…) في `04-socket-layer.md`.
- **الأسعار server-side فقط:** ‏`POST /api/fnb/orders` يرسل `menuItemId + quantity` حصراً — أي إجمالي معروض قبل الإرسال هو عرض محلي غير مُلزم، والسيرفر يحسب `total` من snapshot الأسعار.
- **صور القوائم:** استخدم المصغّر webp ‏192px في أي عنصر ≤48dp — يخفض نقل البيانات في القوائم الطويلة (leaderboard 50 صفاً).
- **تجميع الطلبات المتوازية:** شاشات مثل home تستدعي عدة GETs — أطلقها بـ `Future.wait` عبر نفس عميل Dio (keep-alive) بدل التسلسل.
- **CORS غير ذي صلة** للعميل الأصلي، لكن رؤوس الأمان (`X-Content-Type-Options: nosniff` إلخ) قائمة سيرفرياً — لا تعتمد على sniffing لأنواع المحتوى.
- **Certificate pinning:** غير مطبّق في النسخة الأولى (يوازي الويب)؛ إن أُضيف لاحقاً فعبر `SecurityContext` مع خطة تدوير — قرار مؤجل يُوثَّق في `90/91-release`.
- **حد الجسم 10MB سيرفرياً:** ضغط صورة الأفاتار قبل الترميز base64 (جودة/أبعاد في `13-profile.md`) كي لا يُرفض الطلب أو يستهلك شبكة المستخدم بلا داعٍ.
- **لا كاش REST مكتوب على القرص** في هذه الطبقة (قرارات الكاش لكل شاشة في 02) — يمنع بقاء بيانات أدوار/لعب حساسة خارج الذاكرة.
