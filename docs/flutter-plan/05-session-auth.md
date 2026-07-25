# الجلسة والمصادقة: التخزين، /me، حارس المسارات، auto-login للموظف
> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

## 1. الهدف والنطاق

هذا الملف يحدد **طبقة الجلسة والمصادقة** في تطبيق Flutter: المرآة الكاملة لـ `PlayerContext` في الـ PWA الحالي. يغطي:

1. **نموذج تخزين الجلسة**: كل مفاتيح التخزين الحالية (localStorage) وما يقابلها في Flutter (`flutter_secure_storage` / `shared_preferences`)، مع دلالات المزامنة بينها.
2. **تدفق التحقق عند الإقلاع (boot validation)**: قراءة الجلسة المحفوظة ← التحقق عبر `GET /api/player-auth/me` ← تثبيت الحالة أو مسح الجلسة.
3. **حارس المسارات (auth guard)**: المسارات العامة، إعفاء صفحة الانضمام، قواعد التحويل.
4. **Auto-login للموظف (staff piggyback)**: التقاط `staffInfo` + `staffToken` من `/me`، تخزينهما، وإعادة مصادقة الـ socket.
5. **logout** ودلالاته الدقيقة (ماذا يُمسح وماذا يبقى عمداً).
6. **deviceId**: معرّف الجهاز الثابت لكل تثبيت (`lib/deviceId.ts`) واستخداماته.
7. **عقد "تثبيت الجلسة" (commitSession)** الذي تستهلكه شاشات الدخول/التسجيل/تغيير كلمة المرور (ملف 10).

**خارج النطاق** (يُحال إليه فقط):
- واجهة شاشات الدخول والتسجيل وتغيير كلمة المرور ومودال المكافأة ← `10-login-register.md`.
- بوابة الإشعارات الإلزامية الأربع (needsInstall / prompt / denied / unsupported) ← `06-push-notifications.md` (لكن **ترتيب** عرضها ضمن دورة حياة الجلسة محدد هنا في §6).
- تنفيذ الـ socket نفسه ← `04-socket-layer.md` (هذا الملف يحدد فقط **متى** تُحدَّث مصادقته وما حمولتها).
- الـ deep links والراوتر ← `08-deeplinks-routing.md`.

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

| الملف | الدور |
|---|---|
| `c:/Projects/new mafia/unified-mafia/frontend/src/context/PlayerContext.tsx` | المصدر القانوني للجلسة: الاستعادة، التحقق، setPlayer، logout، staff auto-login |
| `c:/Projects/new mafia/unified-mafia/frontend/src/app/player/layout.tsx` | حارس المسارات، PUBLIC_PATHS، شاشة التحميل، استهلاك pending-nav |
| `c:/Projects/new mafia/unified-mafia/frontend/src/app/player/login/page.tsx` | مستهلك commitSession (التدفقات الثلاثة: login / register / change-password) |
| `c:/Projects/new mafia/unified-mafia/frontend/src/lib/deviceId.ts` | `getDeviceId()` — معرّف الجهاز الثابت |
| `c:/Projects/new mafia/unified-mafia/frontend/src/lib/socket.ts` | `readAuth()` — قراءة التوكنات من التخزين لمصافحة الـ socket، `reconnectSocketAuth()` |
| `c:/Projects/new mafia/unified-mafia/backend/src/routes/player-auth.routes.ts` | endpoints المصادقة الخمسة وأجسام الاستجابة والأخطاء الحرفية |
| `c:/Projects/new mafia/unified-mafia/backend/src/middleware/player-auth.middleware.ts` | JWT اللاعب: الحمولة، التحقق، رسائل 401 الحرفية |
| `c:/Projects/new mafia/unified-mafia/backend/src/schemas/player.schema.ts` | `PLAYER_TOKEN_EXPIRY = '30d'`، `PLAYER_DEFAULT_PASSWORD = '1234'` |
| `c:/Projects/new mafia/unified-mafia/backend/src/middleware/rate-limit.ts` | شكل استجابة 429 لمحدد المعدل |

## 3. التبعيات على ملفات الخطة الأخرى

- **01-foundation-theme.md**: الألوان (#050505، #f59e0b، #fbbf24)، ويدجت الـ spinner الموحد، إدارة الحالة المعتمدة (Riverpod).
- **02-models-data-layer.md**: النماذج الأساسية المشتركة؛ نماذج §8 هنا تُسجَّل ضمن طبقة النماذج هناك.
- **03-networking-rest.md**: عميل HTTP (Dio)، الـ base URL، ظرف الاستجابة `{success, error}`، سياسة الـ interceptors — هذا الملف يحدد سياسة 401 الخاصة بالجلسة والـ interceptor يُنفَّذ هناك.
- **04-socket-layer.md**: `SocketService.reconnectSocketAuth()` — يُستدعى من هذا الملف بعد الدخول وبعد ربط الموظف؛ حمولة المصافحة `{token, playerToken}` تُقرأ من `SessionStore` المعرَّف هنا.
- **06-push-notifications.md**: بوابة الإشعارات التي تُعرض بعد نجاح الجلسة؛ `deviceId` يُمرَّر لتسجيل التوكن؛ بديل pending-nav (`getInitialMessage`).
- **08-deeplinks-routing.md**: تكامل حارس المسارات مع go_router (redirect callback)، تعريف المسارات العامة والمعفاة.
- **10-login-register.md**: يستهلك عقد commitSession (§6.4) ورسائل الأخطاء (§7).
- **11-shell-navigation.md**: شاشة التحميل تُعرض داخل القشرة؛ ترتيب البوابات.
- **13-profile.md**: زر تسجيل الخروج يستدعي `logout()` المعرَّف هنا.
- **30-host-console.md**: قرار حمل صلاحيات الموظف/القائد (`staffToken`) في تطبيق اللاعب (القرار D-05-03 في §6.7).

## 4. الواجهة والتجربة تفصيلياً

طبقة الجلسة تملك واجهتين مرئيتين فقط (كل ما عداها منطق صامت). كل الشاشات الأخرى المرتبطة (login، بوابات الإشعارات) مملوكة لملفات أخرى.

### 4.1 شاشة التحميل (Session Loading)

تُعرض عندما تكون حالة الجلسة `loading` (أي: توجد جلسة محفوظة وجارٍ التحقق منها عبر `/me`) **وليس** المسار الحالي هو صفحة الانضمام `/player/join` (صفحة الانضمام تدير تحميلها بنفسها — انظر §6.5).

- **الخلفية**: ملء الشاشة، لون `#050505`.
- **التخطيط**: عمود مركزي (توسيط أفقي وعمودي)، المسافة بين العنصرين 16px (`gap-4`).
- **الـ spinner**: حلقة 48×48px (`w-12 h-12`)، سماكة الحد 2px، لون الحلقة `rgba(245,158,11,0.3)` (amber-500 بشفافية 30%) مع القوس العلوي بلون `#f59e0b` كامل؛ دوران مستمر (linear، دورة كاملة كل 1 ثانية — مطابق لـ Tailwind `animate-spin`).
- **النص**: `جاري التحميل...` — لون `#f59e0b` بشفافية 60% (amber-500/60)، حجم 14px (`text-sm`).
- لا زر إلغاء، لا مهلة مرئية، لا تفاعل.

في Flutter: تُعرض هذه الشاشة بعد الـ splash الأصلي مباشرة وحتى حسم حالة الجلسة. إذا لم توجد جلسة محفوظة أصلاً فالحسم فوري (لا تظهر الشاشة إطلاقاً — الانتقال مباشرة إلى شاشة الدخول).

### 4.2 شاشة تحويل `/player` (index redirect)

صفحة `/player` في الويب مجرد تحويل فوري إلى `/player/home` مع spinner عنبري 40×40px (`w-10 h-10`، نفس نمط الحلقة أعلاه: `border-amber-500/30` مع قوس علوي `border-t-amber-500`) موسّط على خلفية `#050505`. في Flutter لا حاجة لشاشة مقابلة: المسار الجذري للقشرة يفتح تبويب الرئيسية مباشرة (go_router redirect من `/player` إلى `/player/home`). إن ظهر إطار انتقالي، يُعرض نفس الـ spinner.

### 4.3 حالات صامتة (بلا واجهة)

- **جلسة منتهية/غير صالحة عند الإقلاع**: لا toast ولا رسالة — تُمسح الجلسة ويُحوَّل المستخدم بصمت إلى شاشة الدخول (`router.replace`، بلا أنيميشن رجوع). هذا هو سلوك الويب الحرفي ويجب الحفاظ عليه.
- **فشل التحقق بسبب الشبكة**: نفس الصمت (انظر القرار D-05-01 في §6.2).
- **نجاح staff auto-login**: لا أي مؤشر بصري لحظة الالتقاط — أثره الوحيد ظهور أزرار الموظف لاحقاً في الرئيسية (ملف 12) وصلاحيات الـ socket.
- **logout**: مسح فوري + تحويل إلى شاشة الدخول (الحارس يتكفل بالتحويل تلقائياً لأن `player` أصبح null). لا مودال تأكيد في طبقة الجلسة نفسها (إن أرادت شاشة البروفايل تأكيداً فذلك شأن ملف 13).

### 4.4 حالة الخطأ الوحيدة الظاهرة

أخطاء المصادقة تظهر فقط داخل شاشات ملف 10 (سطر خطأ أحمر). طبقة الجلسة لا تعرض أخطاء بنفسها أبداً؛ أخطاء التحقق عند الإقلاع تُسجَّل في اللوج فقط (في الويب: console).

## 5. التكيّف مع الشاشات 6→11 إنش

شاشتا هذه الطبقة (التحميل والتحويل) عنصران مركزيان بسيطان، والقاعدة هنا هي **الثبات الكامل**:

- **compact (< 600dp)**: كما في الـ PWA حرفياً — spinner 48dp (أو 40dp لشاشة التحويل)، نص 14sp، عمود موسّط، gap 16dp.
- **medium (600–840dp)**: **لا تغيير**. العناصر تبقى بنفس الأحجام موسّطة في منتصف الشاشة. لا سقف عرض مطلوب لأنه لا يوجد محتوى نصي ممتد.
- **expanded (> 840dp)**: **لا تغيير** أيضاً. الـ spinner ليس عنصر لعب حساساً (بطاقة/مؤقت) فلا تنطبق عليه قاعدة المضاعفة؛ تكبيره على تابلت 11 إنش يجعله يبدو كخطأ تصميمي. الثبات + التوسيط هو السلوك الصحيح.

التبرير: لا شبكات ولا محتوى قابل لإعادة التدفق في هذه الطبقة؛ أي منطق تكيّف هنا تعقيد بلا قيمة. (تكيّف شاشات الدخول نفسها في ملف 10، والبوابات في ملف 06.)

## 6. المنطق والتدفقات

### 6.1 خريطة مفاتيح التخزين — المرآة الكاملة لـ PlayerContext

الويب يستخدم localStorage بمفاتيح متعددة (قانونية + مسطّحة للتوافق). في Flutter المصدر القانوني الوحيد هو `SessionStore`؛ المفاتيح المسطّحة تُستبدل بـ getters (لا تُخزَّن نسخ مكررة).

| مفتاح الويب (localStorage) | المحتوى الحرفي | مخزن Flutter | مفتاح Flutter | ملاحظات |
|---|---|---|---|---|
| `mafia_player_auth` | JSON `{"playerId":<int>,"name":"...","phone":"...","token":"<JWT>"}` | `flutter_secure_storage` | `mafia_player_auth` | **الجلسة القانونية**. تُكتب عند setPlayer وتُمسح عند setPlayer(null)/logout/فشل التحقق |
| `mafia_player_token` | التوكن المسطّح (نفس token أعلاه) | — (getter) | `SessionStore.playerToken` | في الويب يقرؤه الـ socket وصفحات أخرى مباشرة؛ في Flutter يُشتق من الجلسة القانونية — **ممنوع تخزينه منفصلاً** |
| `mafia_playerId` | الـ id كنص | — (getter) | `SessionStore.playerId` | مشتق |
| `mafia_player_info` | JSON `{playerId, displayName, phone}` — تكتبه صفحة الانضمام لـ PlayerFlow | — (getter) | — | توافق داخلي في الويب فقط؛ PlayerFlow في Flutter يقرأ من الـ repository (انظر 21-join-lobby.md) |
| `token` | staff JWT (جلسة الداشبورد) | `flutter_secure_storage` | `staff_token` | يُكتب عند staff auto-login؛ **لا يُمسح عند logout** |
| `user` | JSON `{"id":<int>,"username":"...","displayName":"...","role":"..."}` | `flutter_secure_storage` | `staff_user` | نفس ما سبق |
| `leader_token` | نفس قيمة staff token | `flutter_secure_storage` | `leader_token` | يُكتب معه دائماً (واجهة الليدر في الويب تقرؤه) |
| `leader_name` | `staffInfo.displayName` | `flutter_secure_storage` | `leader_name` | نفس ما سبق |
| `notifications_unsupported` | النص `'true'` بعد رمز التجاوز `1998` | `shared_preferences` | `notifications_unsupported` (bool) | يملكه ملف 06؛ مذكور هنا للاكتمال |
| `push_notifications_enabled` | النص `'true'` بعد نجاح تسجيل توكن الإشعارات | `shared_preferences` | `push_notifications_enabled` (bool) | يملكه ملف 06 |
| `mafia_device_id` | UUID ثابت لكل تثبيت | `shared_preferences` | `mafia_device_id` (String) | انظر §6.8 — ليس سراً، لا يحتاج secure storage |
| CacheStorage `mafia-auth` ← مدخل `/__pending_nav` | نص URL وجهة الإشعار (يكتبه الـ SW) | **يسقط كلياً** | — | يُستبدل بـ `FirebaseMessaging.getInitialMessage()` + `onMessageOpenedApp` (ملفا 06 و08) |

قاعدة المزامنة في الويب (تُنقل دلالياً): دالة واحدة `clearPlayerStorage()` تمسح المفاتيح الثلاثة (`mafia_player_auth`, `mafia_player_token`, `mafia_playerId`) **معاً دائماً** — في Flutter يقابلها مسح `mafia_player_auth` وحده (البقية getters فتُصفَّر تلقائياً).

### 6.2 آلة حالة الجلسة (Session State Machine)

```
                 ┌──────────────┐
   إقلاع التطبيق │ SessionBoot  │
                 └──────┬───────┘
                        │ قراءة secure('mafia_player_auth')
          ┌─────────────┼──────────────────────┐
          │ null                               │ موجودة
          ▼                                    ▼
  Unauthenticated                    ┌── JSON فاسد؟ ──┐
  (isLoading=false)                  │ نعم: مسح الجلسة │→ Unauthenticated
                                     └── لا ──────────┘
                                              │
                                              ▼
                                     SessionValidating (isLoading=true → شاشة 4.1)
                                     GET /api/player-auth/me
                                     Authorization: Bearer <التوكن المخزون>
          ┌───────────────────────────────────┼───────────────────────────┐
          │ 200 + success:true                │ success:false (401/404/…) │ خطأ شبكة
          ▼                                   ▼                           ▼
  Authenticated(player, staffInfo?)    مسح الجلسة → Unauthenticated   القرار D-05-01
```

**تفاصيل فرع النجاح (حرفياً من PlayerContext):**
1. حالة اللاعب تُبنى من **استجابة `/me`** (الاسم/الهاتف/الـ id المحدَّثة من الخادم) لكن التوكن يبقى **التوكن المخزون** (`parsed.token`) — الخادم لا يعيد توكناً من `/me`:
   `player = { playerId: data.player.id, name: data.player.name, phone: data.player.phone, token: parsed.token }`
2. الويب يعيد مزامنة المفتاحين المسطّحين (`mafia_player_token`, `mafia_playerId`) — في Flutter لا حاجة.
3. ملاحظة دقيقة: الويب **لا يعيد كتابة** `mafia_player_auth` بالاسم المحدَّث — فإن تغيّر اسم اللاعب على الخادم يبقى المفتاح القديم بالاسم القديم بينما الحالة الحية محدَّثة. في Flutter: أعد كتابة الجلسة القانونية بالبيانات المحدَّثة (تحسين آمن بلا أثر سلوكي).
4. إن وُجد `staffInfo` **و** `staffToken` معاً ← تدفق staff auto-login (§6.7).
5. `isLoading = false` في `finally` (يُنفَّذ في النجاح والفشل معاً).

**القرار D-05-01 — خطأ الشبكة أثناء التحقق:** سلوك الويب الحرفي هو `.catch(() => clearPlayerStorage())` — أي أن **فشل الشبكة العابر يمسح الجلسة ويُخرج المستخدم**. هذا مقبول في PWA (نادراً ما تُفتح بلا إنترنت) لكنه مدمر في تطبيق أصلي (فتح التطبيق في مصعد = خسارة جلسة 30 يوماً). **القرار المعتمد للتطبيق**: التمييز بين نوعي الفشل —
- استجابة HTTP وصلت فعلاً بـ `success:false` (401 توكن منتهٍ/غير صالح، 404 لاعب محذوف) ← **مسح الجلسة** (مطابق للويب).
- انقطاع شبكة / timeout / 5xx / 503 ← **الاحتفاظ بالجلسة** والدخول بحالة `Authenticated` من البيانات المخزونة (playerId/name/phone من `mafia_player_auth`) مع إعادة محاولة `/me` بصمت عند عودة الاتصال (يُعاد عندها التقاط staffInfo وactiveGame).
هذا انحراف مقصود وموثق عن الويب؛ يُسجَّل في 92-qa-parity.md كاختلاف معتمد.

### 6.3 حارس المسارات (Auth Guard)

القواعد الحرفية من `layout.tsx` (تعمل فقط بعد `isLoading == false`):

```
PUBLIC_PATHS = ['/player/login', '/player/debug-push']
isGamePage   = (pathname == '/player/join')

if (isGamePage)                      → لا حارس إطلاقاً (الصفحة تدير جلستها بنفسها)
if (!player && !isPublic)            → router.replace('/player/login')
if (player && pathname=='/player/login') → router.replace('/player/home')
```

نقاط يجب استنساخها بدقة في go_router redirect (التنفيذ في 08-deeplinks-routing.md):
1. **إعفاء `/player/join` مطلق**: لا تحويل للمستخدم غير المسجل (PlayerFlow يعالج الهوية بنفسه، بما فيها دخول ضيف عبر كود الغرفة). كسر هذا الإعفاء = ارتداد خاطئ لكل روابط الدعوات.
2. **`/join/{roomCode}`** (خارج قشرة اللاعب كلياً في الويب): مسار عام بلا provider ولا حارس ولا شريط تنقل — في Flutter: route عام في الجذر يفتح PlayerFlow مباشرة.
3. **`/player/debug-push`**: صفحة تشخيص web-push — **تسقط في Flutter** (لا مقابل لها)؛ تُحذف من قائمة المسارات العامة فتصبح `['/login']` فقط.
4. التحويلات كلها `replace` (لا تُضاف لسجل الرجوع) — زر الرجوع بعد التحويل يجب ألا يعيد المستخدم لشاشة محجوبة.
5. أثناء `isLoading` لا يعمل الحارس إطلاقاً (تُعرض شاشة 4.1) — يمنع وميض شاشة الدخول قبل حسم الجلسة.
6. **ترتيب البوابات بعد الحارس** (للمسارات غير العامة عند وجود لاعب): بوابة الإشعارات (ملف 06) تُقيَّم **قبل** عرض القشرة الطبيعية، بالأسبقية: needsInstall ← prompt ← denied ← unsupported(+bypass) ← القشرة. حالة `granted` تمرّ مباشرة.

### 6.4 عقد تثبيت الجلسة (commitSession) — يستهلكه ملف 10

`SessionStore.commit(PlayerSession p)` يكافئ `setPlayer(p)` في الويب: يكتب `mafia_player_auth` (+ المفاتيح المسطّحة في الويب)، يحدّث الحالة إلى Authenticated، ثم **يجب** استدعاء `SocketService.reconnectSocketAuth()` (في الويب يحدث ذلك ضمنياً لأن الـ auth دالة تُقرأ عند كل اتصال — في Flutter التحديث يدوي، انظر §7.2).

مواضع الاستدعاء الثلاثة (منطقها الحرفي من `login/page.tsx`):

1. **بعد login ناجح**: `commit({playerId: player.id, name, phone, token})` — فوراً.
   - **استثناء mustChangePassword**: الويب يفحص `data.mustChangePassword` (المستوى الأعلى) — لكن الخادم يعيدها فعلياً داخل `data.player.mustChangePassword` فقط. **الفرع في الويب ميت حالياً** (التحقق من الكود تم). **القرار D-05-02أ**: في Flutter افحص `player.mustChangePassword` (إصلاح النية الأصلية) — الحسابات المهاجرة المنشأة بكلمة السر الافتراضية `1234` يجب أن تُجبر على التغيير. عند true: **لا commit** — يُحتفظ بـ `tempToken` + `tempPlayer` في ذاكرة الشاشة فقط والانتقال لوضع change_password (بلا مهرب — ملف 10).
2. **بعد register ناجح**:
   - مع `welcomeBonus` ← **لا commit فوري**؛ يُعرض مودال المكافأة (ملف 10) والـ commit يحدث فقط عند ضغط CTA `يلا نبدأ! 🎮`.
   - بدون `welcomeBonus` ← commit فوري.
3. **بعد change-password الإجباري الناجح**: الويب يثبّت الجلسة بـ **التوكن المؤقت الأصلي** (`tempToken`) ويتجاهل التوكن الجديد في الاستجابة. **القرار D-05-02ب**: في Flutter استخدم `data.token` الجديد من الاستجابة (كلاهما صالح 30 يوماً؛ الجديد أحدث) — انحراف آمن موثق.

### 6.5 logout

المنطق الحرفي من PlayerContext:
```
logout():
  player = null            // الحالة
  staffInfo = null         // الحالة
  مسح: mafia_player_auth + mafia_player_token + mafia_playerId
  // لا نمسح staff tokens هنا — المستخدم قد يريد البقاء مسجلاً في الداشبورد
```
- مفاتيح الموظف/القائد (`staff_token`, `staff_user`, `leader_token`, `leader_name`) **تبقى عمداً**.
- لا نداء REST للخادم (لا يوجد endpoint لتسجيل الخروج — JWT stateless).
- الويب **لا** يستدعي `reconnectSocketAuth()` بعد logout — الـ socket يظل حاملاً هوية اللاعب القديمة حتى أول إعادة اتصال. **القرار D-05-04**: في Flutter استدعِ `SocketService.reconnectSocketAuth()` فور logout لإسقاط هوية اللاعب من الجلسة الحية (تحصين أمني متوافق مع سياسة socket-auth الإلزامية على الخادم). انحراف معتمد.
- بعد logout يتكفل الحارس بالتحويل إلى `/login` تلقائياً.
- `mafia_device_id` و`notifications_unsupported` و`push_notifications_enabled` **لا تُمسح** عند logout (خصائص جهاز لا مستخدم).

### 6.6 التعامل مع 401 أثناء الجلسة (بعد الإقلاع)

الويب **لا يملك معالجاً عاماً**: أي 401 من endpoint عادي يظهر كخطأ في صفحته فقط، والجلسة تُمسح عند الإقلاع التالي عبر `/me`. سياسة Flutter (تُنفَّذ كـ interceptor في 03-networking-rest.md):
- 401 من `/api/player-auth/me` برسالة `توكن غير صالح أو منتهي الصلاحية` أو `غير مصادق — يرجى تسجيل الدخول` ← مسح الجلسة + تحويل لشاشة الدخول.
- 401 من أي endpoint آخر ← تمرير الخطأ للشاشة (مطابق للويب)، **مع** إطلاق إعادة تحقق `/me` واحدة بالخلفية لحسم صلاحية التوكن.
- توكن اللاعب JWT صالح **30 يوماً** (`PLAYER_TOKEN_EXPIRY = '30d'`)، حمولته `{playerId, phone, name}`، لا يوجد refresh token — بعد الانتهاء الحل الوحيد إعادة الدخول.

### 6.7 Staff auto-login (piggyback)

يحدث في موضع واحد فقط: فرع نجاح `/me` عند الإقلاع (وأي إعادة تحقق لاحقة). الشرط الحرفي: `data.staffInfo && data.staffToken` (كلاهما معاً).

الخطوات الحرفية من PlayerContext:
1. تخزين `staffInfo` في الحالة (يُعرِّض أزرار الموظف في الرئيسية — ملف 12).
2. كتابة مفاتيح الداشبورد: `token = staffToken`؛ `user = JSON{id: staffInfo.staffId, username, displayName, role}`.
3. كتابة مفاتيح الليدر: `leader_token = staffToken`؛ `leader_name = staffInfo.displayName`.
4. استدعاء `reconnectSocketAuth()` داخل try/catch صامت — الـ socket يعيد الاتصال حاملاً توكن الموظف فيكتسب صلاحيات القائد **بلا إعادة تحميل** (متطلب أمني: الخادم يتحقق من توكنات الـ socket إلزامياً).

ملاحظات من كود الخادم (تم التحقق):
- `staffToken` **يُولَّد من جديد عند كل نداء `/me`** (auto-login حقيقي، ليس توكناً مخزوناً) — يحدث فقط إذا كان للاعب `linkedStaffId`.
- فشل جلب بيانات الموظف على الخادم لا يفشل `/me` — يعود `staffInfo: null, staffToken: null` فقط.
- **القرار D-05-03** (يُحسم مع 30-host-console.md): هل يحمل تطبيق اللاعب صلاحيات الموظف؟ الوضع الافتراضي المعتمد: **نعم — تخزين المفاتيح الأربعة كما في الويب** وإرسال `token` في مصافحة الـ socket، لأن ميزات موجودة فعلاً (لوحة تحكم الموظف في الرئيسية، مراقبة القائد) تعتمد عليها. فتح واجهات الويب (`/admin`, `/leader`, `/display`) من التطبيق = متصفح خارجي أو WebView مع مشكلة تمرير التوكن — قرار منفصل في ملف 12/30.

### 6.8 deviceId — المرآة الكاملة لـ `lib/deviceId.ts`

الخوارزمية الحرفية في الويب:
```
KEY = 'mafia_device_id'
getDeviceId():
  if SSR → return ''
  try:
    id = localStorage[KEY]
    if !id:
      id = crypto.randomUUID()  متاحة؟
           وإلا: 'dev-' + random36 + random36   // Math.random().toString(36).slice(2) مرتين
      localStorage[KEY] = id
    return id
  catch → return ''
```
- **الغرض**: معرّف ثابت لكل **تثبيت** (لا لكل مستخدم) — يبقى عبر الجلسات وبين اللاعبين على نفس الجهاز، فريد لكل جهاز فعلي حتى مع تطابق User-Agent. يستخدمه الخادم لإزالة تكرار توكنات الإشعارات حسب الجهاز الفعلي.
- **الاستخدامات**: حمولة `POST /api/player-notifications/register-token` بالحقل `deviceId` (ملف 06)؛ ورسالة `SET_AUTH_TOKEN` للـ SW في الويب (تسقط في Flutter).
- **نقل Flutter**: `DeviceIdService.get()` — يقرأ `mafia_device_id` من `shared_preferences`؛ إن غاب يولّد `Uuid().v4()` ويخزنه؛ عند أي استثناء تخزين يعيد `''` (مطابق للويب). لا حالة SSR في Flutter. **لا** تستخدم معرّفات النظام (ANDROID_ID / identifierForVendor) — العقد هو "ثابت لكل تثبيت" ومسح بيانات التطبيق يولّد معرّفاً جديداً، وهذا السلوك المطلوب (مطابق لمسح localStorage في الويب).

### 6.9 ترتيب الإقلاع الكامل (تسلسل زمني)

1. Splash أصلي ← تهيئة storage + قراءة الجلسة.
2. لا جلسة ← شاشة الدخول فوراً. توجد جلسة ← شاشة التحميل (4.1) + `GET /me`.
3. حسم `/me` ← Authenticated (مع staff piggyback إن وجد) أو Unauthenticated.
4. عند Authenticated: تقييم بوابة الإشعارات (ملف 06) ← عند العبور: القشرة + التبويبات (ملف 11).
5. **بعد** جاهزية اللاعب فقط: استهلاك وجهة الإشعار البارد — في الويب: قراءة `/__pending_nav` من كاش `mafia-auth`، حذفه، ثم `router.replace` إن اختلف عن المسار الحالي؛ في Flutter: `getInitialMessage()` (ملف 06) ثم التوجيه عبر جدول الروابط (ملف 08). **الشرط الحرفي**: لا توجيه قبل `isLoading==false && player!=null`.
6. الـ socket (ملف 04) يتصل بالتوكنات الحالية من `SessionStore` — وأي تغيير جلسة لاحق (login/logout/staff-link) يستدعي `reconnectSocketAuth()`.

### 6.10 حالات حدية

- **جلسة بها JSON فاسد**: مسح صامت ← شاشة الدخول (الويب يلف `JSON.parse` بـ try/catch).
- **لاعب محذوف من قاعدة البيانات**: `/me` يعيد 404 `اللاعب غير موجود` ← مسح الجلسة.
- **قاعدة البيانات ساقطة عند الإقلاع**: `/me` يعيد 503 `قاعدة البيانات غير متوفرة` — وفق D-05-01 يُعامل كخطأ مؤقت (احتفاظ بالجلسة).
- **Redis ساقط**: `/me` ينجح لكن `activeGame: null, frozenGames: []` (الخادم يبتلع خطأ Redis) — لا يؤثر على الجلسة.
- **لاعبان على نفس الجهاز**: تسجيل دخول جديد يستبدل `mafia_player_auth` كلياً؛ `mafia_device_id` يبقى مشتركاً (مقصود).
- **انتهاء التوكن أثناء الاستخدام (اليوم 30)**: تُطبَّق سياسة §6.6.
- **staffInfo بلا staffToken** (أو العكس): الشرط `&&` يفشل ← لا auto-login (مطابق للويب).

## 7. عقود التكامل

كل REST نسبي لنفس الأصل (البنية في 03-networking-rest.md). كل الاستجابات تحمل `success: boolean` و`error` عربية عند الفشل.

### 7.1 REST

**GET `/api/player-auth/me`** — Header: `Authorization: Bearer <playerToken>`
- 200:
```json
{
  "success": true,
  "player": {
    "id": 1, "playerId": 1, "phone": "...", "name": "...",
    "gender": "MALE|FEMALE", "dob": "...|null", "avatarUrl": "...|null",
    "email": "...|null", "totalMatches": 0, "totalWins": 0,
    "totalSurvived": 0, "mustChangePassword": false
  },
  "staffInfo": { "staffId": 1, "username": "...", "role": "...", "displayName": "...", "permissions": ["..."] } | null,
  "staffToken": "<staff JWT>" | null,
  "activeGame": { "roomId": "...", "roomCode": "...", "gameName": "...", "physicalId": 0, "role": "...|null", "isAlive": true, "phase": "..." } | null,
  "frozenGames": [ /* نفس شكل activeGame */ ]
}
```
  - `role` تكون null حتى `rolesConfirmed`؛ الألعاب بطور `GAME_OVER` تُتخطى؛ المطابقة بـ playerId أو phone؛ اللاعب المجمد يذهب لـ frozenGames.
- 401 (بلا header أو توكن فاسد): `{"error":"غير مصادق — يرجى تسجيل الدخول"}` / `{"error":"توكن غير صالح أو منتهي الصلاحية"}` (بلا حقل success).
- 404: `{"success":false,"error":"اللاعب غير موجود"}` — 503: `قاعدة البيانات غير متوفرة` — 500: `خطأ في جلب البيانات`.

**POST `/api/player-auth/login`** — rate limit: 15 طلب / 15 دقيقة لكل IP (keyPrefix `player-login`)
- Req: `{"phone":"...","password":"..."}`
- 200: `{"success":true,"token":"<JWT 30d>","player":{"id","playerId","phone","name","gender","dob","avatarUrl","mustChangePassword"}}`
- 400: `رقم الهاتف وكلمة المرور مطلوبان` — 401: `رقم الهاتف أو كلمة المرور غير صحيحة` أو `هذا الحساب لم يُنشَأ له كلمة سر بعد — يرجى التسجيل` — 429: `{"error":"محاولات كثيرة جداً — يرجى المحاولة لاحقاً","retryAfter":<ثوانٍ>}` + header `Retry-After` — 503 / 500: `خطأ في تسجيل الدخول`. أثر جانبي: تحديث `lastActiveAt`.

**POST `/api/player-auth/register`**
- Req: `{"phone","password","name","gender":"MALE"|"FEMALE"(افتراضي MALE),"dob"?}` (الواجهة لا تجمع dob)
- 200: `{"success":true,"token","welcomeBonus":200,"player":{"id","playerId","phone","name","gender","dob","mustChangePassword":false}}`
- 400: `رقم الهاتف والاسم وكلمة المرور مطلوبون` / `كلمة المرور يجب أن تكون 4 أحرف على الأقل` — 409: `رقم الهاتف مسجل مسبقاً — يرجى تسجيل الدخول` — 500: `فشل في إنشاء الحساب` / `خطأ في إنشاء الحساب`. آثار جانبية: xp=200، `welcomeBonusApplied=true`، push للأدمنز «👤 لاعب جديد».

**POST `/api/player-auth/change-password`** — Header: `Authorization: Bearer <token>` (المؤقت في التدفق الإجباري)
- Req: `{"oldPassword"?,"newPassword"}` — oldPassword مطلوبة ومُتحقَّق منها **إلا** عندما `mustChangePassword=true` على الخادم (حسابات مهاجرة بكلمة السر الافتراضية `1234`). التدفق الإجباري يرسل `{"newPassword"}` فقط.
- 200: `{"success":true,"token":"<جديد>","message":"تم تغيير كلمة المرور بنجاح"}` — يصفّر `mustChangePassword`.
- 400: `كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل` / `كلمة المرور القديمة مطلوبة` — 401: `كلمة المرور القديمة غير صحيحة` — 404 / 503 / 500: `خطأ في تغيير كلمة المرور`.

**POST `/api/player-auth/migrate-welcome-bonus`** — إداري فقط (staff auth + adminOnly)؛ لا يُستدعى من التطبيق إطلاقاً — مذكور لمنع اختراعه.

### 7.2 Socket

لا أحداث لعبة في هذه الطبقة. عقدها الوحيد هو **مصافحة المصادقة** (التنفيذ في 04-socket-layer.md):
- **الاتجاه**: عميل ← خادم، عند كل connect/reconnect.
- **الحمولة الحرفية**: `{ token: <staff_token || leader_token || ''>, playerToken: <mafia_player_token || ''> }` — كلا الحقلين يُرسلان دائماً (سلاسل فارغة عند الغياب). الخادم يتطلب المصافحة (socket auth إلزامي بعد التحصين الأمني).
- في الويب `auth` **دالة** تُقرأ عند كل اتصال؛ حزمة `socket_io_client` في Dart لا تدعم callback — يجب تعيين `socket.auth = {...}` ثم `disconnect(); connect();` يدوياً. لذلك **يلتزم** هذا الملف باستدعاء `reconnectSocketAuth()` في 4 مواضع: بعد commit جلسة (دخول/تسجيل/تغيير كلمة مرور)، بعد staff auto-login، بعد logout (قرار D-05-04)، وعند مسح الجلسة لبطلان التوكن (§6.6).

## 8. نماذج Dart المطلوبة

```dart
/// الجلسة القانونية — مرآة mafia_player_auth
class PlayerSession {
  final int playerId;
  final String name;
  final String phone;
  final String token;        // JWT صالح 30 يوماً
  // toJson/fromJson بمفاتيح: playerId, name, phone, token (مطابقة حرفية للويب)
}

/// مرآة staffInfo من /me
class StaffInfo {
  final int staffId;
  final String username;
  final String role;         // 'admin' | 'manager' | 'leader' | ...
  final String displayName;
  final List<String> permissions;
}

/// player داخل استجابة /me
class MePlayer {
  final int id;
  final int playerId;        // نفس id — الخادم يرسل الاثنين
  final String phone;
  final String name;
  final String? gender;      // 'MALE' | 'FEMALE'
  final String? dob;
  final String? avatarUrl;
  final String? email;
  final int? totalMatches;
  final int? totalWins;
  final int? totalSurvived;
  final bool mustChangePassword;
}

/// activeGame / عناصر frozenGames من /me
class ActiveGameInfo {
  final String roomId;
  final String roomCode;
  final String? gameName;
  final int? physicalId;
  final String? role;        // null حتى rolesConfirmed
  final bool isAlive;
  final String phase;
}

class MeResponse {
  final bool success;
  final MePlayer player;
  final StaffInfo? staffInfo;
  final String? staffToken;
  final ActiveGameInfo? activeGame;
  final List<ActiveGameInfo> frozenGames;
}

/// حالة الجلسة — sealed (Riverpod AsyncNotifier أو ما يعتمده 01)
sealed class SessionState {}
class SessionLoading extends SessionState {}                  // شاشة 4.1
class SessionUnauthenticated extends SessionState {}
class SessionAuthenticated extends SessionState {
  final PlayerSession player;
  final StaffInfo? staffInfo;
  final ActiveGameInfo? activeGame;    // يلتقطه ملف 12/20
  final List<ActiveGameInfo> frozenGames;
}

/// ثوابت مفاتيح التخزين — المصدر الوحيد للأسماء
abstract class StorageKeys {
  static const playerAuth = 'mafia_player_auth';       // secure
  static const staffToken = 'staff_token';             // secure (ويب: 'token')
  static const staffUser = 'staff_user';               // secure (ويب: 'user')
  static const leaderToken = 'leader_token';           // secure
  static const leaderName = 'leader_name';             // secure
  static const deviceId = 'mafia_device_id';           // prefs
  static const notificationsUnsupported = 'notifications_unsupported'; // prefs
  static const pushEnabled = 'push_notifications_enabled';             // prefs
  static const keychainFreshInstall = 'keychain_fresh_install_done';   // prefs — iOS فقط (§10)
}

/// واجهة المستودع — يستهلكها 03 (Bearer) و04 (المصافحة) و10 (commit) و13 (logout)
abstract class SessionStore {
  SessionState get state;                       // + Stream/Notifier للتغييرات
  String get playerToken;                       // '' عند الغياب
  String get staffOrLeaderToken;                // staff_token ?? leader_token ?? ''
  int? get playerId;
  Future<void> restoreAndValidate();            // تدفق §6.2
  Future<void> commit(PlayerSession p);         // §6.4 + reconnectSocketAuth
  Future<void> logout();                        // §6.5 + reconnectSocketAuth
  Future<void> storeStaffAutoLogin(StaffInfo info, String staffToken); // §6.7
}

class DeviceIdService {
  Future<String> get();                         // §6.8 — '' عند فشل التخزين فقط
}
```

## 9. الحزم المستخدمة

| الحزمة | الغرض |
|---|---|
| `flutter_secure_storage` | التوكنات والجلسة القانونية (Keychain / Keystore+EncryptedSharedPreferences) |
| `shared_preferences` | الأعلام غير السرية: deviceId، notifications_unsupported، push_notifications_enabled |
| `flutter_riverpod` (حسب اعتماد 01-foundation-theme.md) | SessionNotifier / providers |
| `uuid` | توليد `mafia_device_id` (v4) |
| `dio` (عبر 03-networking-rest.md) | نداءات player-auth + interceptor سياسة 401 |
| `go_router` (عبر 08-deeplinks-routing.md) | redirect callback لحارس المسارات |
| `socket_io_client` (عبر 04-socket-layer.md) | مصافحة `{token, playerToken}` |
| `jwt_decoder` (اختياري) | قراءة exp محلياً لتقدير انتهاء الـ 30 يوماً قبل النداء (تحسين، ليس بديلاً عن تحقق `/me`) |

## 10. اختلافات Android / iOS

يوجد اختلافان جوهريان خاصان بطبقة التخزين:

1. **بقاء Keychain بعد حذف التطبيق (iOS)**: `flutter_secure_storage` على iOS يكتب في Keychain الذي **يبقى بعد إزالة التطبيق** — إعادة تثبيت التطبيق ستجد جلسة قديمة وتدخل بها تلقائياً (سلوك غير موجود في الويب ولا في Android). **الحل الإلزامي**: علم `keychain_fresh_install_done` في `shared_preferences` (تُمسح مع الحذف على المنصتين): عند الإقلاع، إن غاب العلم ← مسح كل مفاتيح secure storage ثم كتابة العلم، قبل أي قراءة جلسة. على Android الخطوة لا تضر (Keystore يُمسح مع الحذف أصلاً).
2. **إعدادات Android**: تعطيل النسخ الاحتياطي التلقائي للتخزين (`android:allowBackup="false"` أو قواعد `fullBackupContent` تستثني secure storage وprefs الجلسة) حتى لا تُستعاد توكنات على جهاز آخر عبر Google Backup — التنفيذ في 90-release-android.md. على iOS: ضبط `KeychainAccessibility.first_unlock_this_device` (يمنع ترحيل التوكن عبر iCloud Keychain لجهاز آخر ويسمح بالقراءة بعد أول فتح قفل — مطلوب لأن معالجة إشعار خلفية قد تحتاج التوكن).

عدا ذلك: لا اختلافات — منطق الجلسة والحارس وdeviceId متطابق على المنصتين.

## 11. الأصول المطلوبة

لا أصول خاصة بهذه الطبقة. شاشة التحميل ترسم الـ spinner برمجياً (لا صور/Lottie). (شعار `/mafia_logo.png` يخص شاشة الدخول — ملف 10؛ أيقونات وأصوات لا وجود لها هنا.)

## 12. معايير القبول — checklist تكافؤ

- [ ] إقلاع بلا جلسة محفوظة ← شاشة الدخول فوراً بلا وميض شاشة تحميل.
- [ ] إقلاع بجلسة صالحة ← شاشة التحميل (spinner 48dp عنبري + `جاري التحميل...` بـ amber-500/60) ثم الرئيسية، والاسم/الهاتف محدَّثان من `/me` بينما التوكن هو المخزون نفسه.
- [ ] إقلاع بتوكن منتهٍ/فاسد (استجابة 401 حقيقية) ← مسح الجلسة والتحويل الصامت لشاشة الدخول بلا أي رسالة.
- [ ] إقلاع بلا إنترنت مع جلسة محفوظة ← الدخول من البيانات المخزونة والاحتفاظ بالجلسة (D-05-01)، وإعادة تحقق `/me` عند عودة الاتصال تلتقط staffInfo/activeGame.
- [ ] جلسة بـ JSON فاسد ← مسح صامت + شاشة الدخول (لا crash).
- [ ] مستخدم غير مسجل يفتح أي مسار غير عام ← تحويل `replace` إلى الدخول؛ وزر الرجوع لا يعيده للمسار المحجوب.
- [ ] مستخدم مسجل يفتح شاشة الدخول ← تحويل إلى الرئيسية.
- [ ] مسار الانضمام (تبويب `ادخل` / deep link بكود) يفتح **بلا** تحويل للمستخدم غير المسجل (إعفاء الحارس)، و`/join/{roomCode}` يعمل كمسار عام كليّاً.
- [ ] لاعب مرتبط بموظف: بعد `/me` تُكتب المفاتيح الأربعة (staff_token, staff_user, leader_token, leader_name) ويعاد اتصال الـ socket فيكتسب صلاحيات القائد بلا إعادة تشغيل، وتظهر أزرار الموظف في الرئيسية.
- [ ] لاعب غير مرتبط: لا تُكتب أي مفاتيح موظف، و`token` في مصافحة الـ socket سلسلة فارغة.
- [ ] logout: مسح جلسة اللاعب فقط؛ مفاتيح الموظف/القائد وdeviceId وأعلام الإشعارات تبقى؛ تحويل فوري للدخول؛ الـ socket يعيد الاتصال بلا playerToken.
- [ ] دخول ناجح ← commit فوري + مصافحة socket محدثة تحمل playerToken الجديد.
- [ ] تسجيل جديد مع مكافأة ← الجلسة **لا** تُثبَّت قبل ضغط `يلا نبدأ! 🎮`؛ إغلاق التطبيق قبل الضغط = لا جلسة محفوظة.
- [ ] حساب مهاجر (`mustChangePassword=true` من `player` في استجابة login) ← وضع تغيير كلمة المرور الإجباري بلا commit وبلا مهرب، والنداء يرسل `{newPassword}` فقط بالتوكن المؤقت.
- [ ] 429 من login يعرض رسالة الخادم `محاولات كثيرة جداً — يرجى المحاولة لاحقاً` (ملف 10 يعرضها؛ العقد هنا).
- [ ] `mafia_device_id` يتولد مرة واحدة ويبقى ثابتاً عبر عمليات الدخول/الخروج ولاعبين متعددين، ويتغير فقط بمسح بيانات التطبيق/إعادة التثبيت.
- [ ] iOS: إعادة تثبيت التطبيق لا تستعيد جلسة قديمة من Keychain (علم fresh-install يعمل).
- [ ] شاشة التحميل متطابقة بصرياً على 6 و8 و11 إنش (عنصر مركزي ثابت الأحجام).
- [ ] لا يظهر أي توكن في اللوجات أو أدوات debug overlay.

## 13. ملاحظات أداء وأمان

- **التوكنات في secure storage حصراً** — ممنوع نسخها إلى prefs أو ملفات أو لوجات. `mafia_device_id` وحده غير سري.
- **staffToken = صلاحيات قيادة كاملة على الـ socket**: تسريبه أخطر من توكن اللاعب. لا يُعرض في أي شاشة، ولا يُمرَّر في روابط إلا بقرار موثق (WebView — ملف 12/30). الخادم يصدره من جديد عند كل `/me` فلا حاجة لتجديده يدوياً.
- **لا refresh token**: صلاحية 30 يوماً ثم إعادة دخول إجبارية — لا تحاول اختراع تجديد صامت غير موجود في الـ backend.
- **rate limit الدخول (15/15د لكل IP)**: أظهر `retryAfter` بشكل ودي (ملف 10) ولا تعد المحاولة تلقائياً.
- **التحقق عند الإقلاع نداء واحد** (`/me`) — لا polling ولا retry loop؛ إعادة المحاولة الوحيدة هي عند عودة الاتصال (D-05-01) مرة واحدة.
- **قراءة secure storage قد تكون بطيئة نسبياً على Android** (Keystore) — اقرأ الجلسة مرة واحدة عند الإقلاع واحتفظ بها في الذاكرة؛ كل getters (`playerToken` وغيرها) تقرأ من الذاكرة لا من التخزين (الويب يقرأ localStorage الرخيص عند كل اتصال socket — لا تنسخ هذا النمط حرفياً).
- **الحارس يعتمد الحالة في الذاكرة** لا قراءة تخزين متزامنة عند كل تنقل.
- **كلمة السر الافتراضية `1234`** للحسابات المهاجرة معلومة على الخادم فقط سلوكياً — لا تلمّح لها في أي نص واجهة.
- **رمز التجاوز `1998`** (بوابة unsupported — ملف 06) hardcoded في عميل الويب؛ نقله كما هو يعني بقاءه قابلاً للاستخراج من الـ APK — مقبول حالياً (قيمته حماية منتج لا حماية أمنية)، موثق كدين تقني.
- أخطاء التحقق تُسجَّل بلوج داخلي بلا محتوى التوكن (الويب يستخدم console — التطبيق يستخدم logger بمستوى debug يُعطَّل في release).
