# خطة بناء تطبيق Flutter لواجهة اللاعب — نادي المافيا

> **الإصدار:** 1.0 — 22 يوليو 2026
> **المصدر:** تحليل شامل لواجهة اللاعب الحالية (PWA بـ Next.js 14) — 18 تقرير تحليل معمّق غطّت كل صفحة ومكوّن وhook وأصل، + جرد كامل لعقود REST/Socket من الـ backend، + فحص اكتمال نهائي ضد شجرة الملفات.
> **النطاق:** واجهة اللاعب فقط (`/player/*` + `/join/[roomCode]` وكل ما تستورده). لوحات الأدمن والليدر وشاشة العرض والـ venue **خارج النطاق** — تبقى ويب.
> **قاعدة ذهبية:** لا تغيير على الـ backend إلا الإضافات المذكورة في §12.4 — التطبيق يستهلك نفس عقود REST/Socket المستخدمة في الـ PWA حرفياً، ويعمل بالتوازي معها على نفس السيرفر.

---

## 1. الملخص التنفيذي

الواجهة الحالية PWA كاملة الوظائف: مصادقة بالهاتف، صفحة رئيسية بالحجوزات والفعاليات، تجربة لعب حية كاملة داخل القاعة (بطاقات أدوار، ليل/نهار/تصويت، سينمائيات، نوتة مع شات مافيا سري)، استضافة غرف عن بُعد مع صوت مباشر (Cloudflare RealtimeKit)، رتب وسجل مباريات، طلبات مطعم، تقييم، وإشعارات Push بمسارين (FCM للأندرويد/كروم وWeb Push VAPID لـ iOS).

المشكلة التي يحلّها التطبيق الأصلي (Flutter):
- **إشعارات iOS هشّة** في الـ PWA (تتطلب تثبيت PWA + بوابة حجب كاملة + حيلة `/__pending_nav` في service worker) → تصبح إشعارات APNs أصلية موثوقة.
- **الصوت والاهتزاز والقفل** خاضعة لقيود متصفح (unlock-on-gesture، توقف عند قفل الشاشة) → `audio_session` + `wakelock_plus` أصلياً.
- **الصوت المباشر عن بُعد** عبر WebRTC في متصفح iOS معرّض للقطع → SDK أصلي.
- تجربة تثبيت وفتح أسرع، ومعرض بطاقات وأنيميشن أكثر سلاسة.

**قرار معماري جوهري:** التطبيق **عميل ثانٍ لنفس الـ backend** — نفس الـ endpoints، نفس أحداث الـ socket، نفس دورة المصادقة. أي ميزة جديدة مستقبلاً تُبنى مرة واحدة في الـ backend وتصل للعميلين.

---

## 2. البنية التقنية المقترحة

### 2.1 الطبقات

```
lib/
├─ main.dart                    # bootstrap: Firebase, Riverpod ProviderScope, RTL
├─ app/
│  ├─ app.dart                  # MaterialApp.router + Theme + Directionality(rtl)
│  ├─ router.dart               # go_router: كل المسارات + redirect (auth guard + بوابة الإشعارات)
│  └─ theme/                    # design tokens (§«نظام التصميم» في قسم الأنظمة المنصية)
│     ├─ colors.dart  ├─ typography.dart  ├─ dimens.dart  └─ theme.dart
├─ core/
│  ├─ api/                      # Dio client + interceptors (Bearer, 401 handling, baseUrl)
│  ├─ socket/                   # SocketService: singleton, auth handshake, reconnect, event bus
│  ├─ storage/                  # SessionStore (secure) + PrefsStore
│  ├─ push/                     # PushService: FCM token, foreground/background, deep-link routing
│  ├─ audio/                    # SoundManager (خريطة الأصوات من /api/sounds/active-map + كاش)
│  └─ utils/                    # deviceId, formatters, phone normalization
├─ models/                      # نماذج Dart (json_serializable): Player, GameState, RoleDef, ...
├─ features/
│  ├─ auth/          # login/register/change-password/welcome-bonus
│  ├─ shell/         # Scaffold + BottomNav + بوابة الإشعارات + version gate
│  ├─ home/          # الرئيسية
│  ├─ game/          # PlayerFlow الكامل: lobby, role-reveal, night, day, voting, game-over
│  │  ├─ state/      # GameController (مرآة useGameState) + phase machines
│  │  ├─ widgets/    # MafiaCard (dynamic+legacy), CircularTimer, PhaseHeader, Gallery, ...
│  │  ├─ cinematics/ # NightAnimCinematic بـ CustomPainter/AnimationController
│  │  └─ notepad/    # النوتة + شات المافيا السري
│  ├─ host/          # كونسول المضيف عن بُعد (9 شاشات) + إعدادات الغرفة
│  ├─ voice/         # RealtimeKit: useVoice + ActiveSpeaker + ConfrontationControls
│  ├─ games/         # قائمة الألعاب + الدعوات (InviteModal)
│  ├─ profile/       # الملف + قصّ الصورة
│  ├─ rank/          # الرتب + إطارات الرتب (RankFrames) + تأثيراتها
│  ├─ history/       # سجل المباريات
│  ├─ order/         # طلبات المطعم (F&B)
│  └─ feedback/      # التقييم
└─ l10n/             # النصوص (عربي فقط حالياً — لكن مهيكلة)
```

### 2.2 قرارات تقنية

| الموضوع | القرار | السبب |
|---|---|---|
| إدارة الحالة | **Riverpod** (`flutter_riverpod` + `riverpod_generator`) | حالة socket حية + جلسة + لعبة متداخلة؛ providers قابلة للمراقبة والاختبار |
| التنقل | **go_router** | redirect مركزي يحاكي حارس المصادقة وبوابة الإشعارات في `player/layout.tsx`، ودعم deep links `/join/:code` |
| الشبكة | **dio** | interceptors للتوكن، وتنزيل ملفات الأصوات مع كاش |
| Socket | **socket_io_client ^3** | الـ backend يستخدم Socket.IO v4 — يجب مطابقة نسخة البروتوكول EIO4، مع نفس حمولة `auth` في المصافحة (playerToken + token + deviceId) وإعادة قراءة التوكنات عند كل reconnect (مرآة `reconnectSocketAuth`) |
| التخزين | `flutter_secure_storage` للتوكنات، `shared_preferences` للأعلام، `hive` لكاش النوتة والأصوات | يطابق أدوار localStorage الحالية |
| النماذج | `json_serializable` + `freezed` | GameState كبيرة ومتداخلة؛ نحتاج immutability وcopyWith |
| Push | `firebase_messaging` + `flutter_local_notifications` | مسار FCM واحد للمنصتين (يستبدل ثنائية FCM/WebPush) — iOS عبر APNs من نفس مشروع Firebase `mafia-b1c74` |
| بيئات | flavors: `dev` (staging `mafia.grade.sbs`) و`prod` (`club-mafia.grade.sbs`) | baseUrl ثابت لكل flavor — لا يوجد بروكسي Next.js في التطبيق، وكل روابط `/uploads/*` تُبنى مطلقة |
| المراقبة | Firebase Crashlytics + (اختياري) Sentry | لا يوجد حالياً أي تتبع أعطال في الـ PWA |

### 2.3 مبدأ نقل الشاشات

كل شاشة في الأقسام (§3–§8) موصوفة بحالاتها وميزاتها وواجهاتها API/Socket كما هي في الـ PWA **حرفياً** — التنفيذ في Flutter يجب أن يحافظ على: نفس النصوص العربية، نفس منطق الحالات (بما فيها حالات إعادة الاتصال واستعادة المرحلة)، نفس ترتيب الأحداث. أي «تحسين» سلوكي يؤجَّل لما بعد التكافؤ (feature parity) لتسهيل الاختبار المتوازي مع الـ PWA.


---

# 3. القشرة، المصادقة، البوابة، والصفحة الرئيسية

هذا القسم يغطي الغلاف الخارجي لتطبيق اللاعب: الـ Shell الدائم الذي يلفّ كل مسارات `/player/*`، ودورة المصادقة الكاملة (login / register / forced password change)، وبوابة الإشعارات الإلزامية التي تحجب التطبيق بالكامل، وشريط التنقل السفلي، ونقاط الدخول العميقة (deep links) للانضمام إلى الغرف، ثم الصفحة الرئيسية Home بكل بطاقاتها ومودالاتها. رحلة اللاعب عند كل فتح للتطبيق: شاشة تحميل ← (تسجيل دخول إن لم توجد جلسة) ← بوابة الإشعارات (إن لم تكن مفعّلة) ← الرئيسية مع شريط التنقل.

**اللغة البصرية المشتركة لكل شاشات هذا القسم** (تُعرَّف مرة واحدة في Theme الفلاتر): خلفية شبه سوداء `#050505`؛ بطاقات `#0c0c0c/90` و`#121212/80` مع `backdrop-blur`؛ اللون المميز عنبري/ذهبي `#fbbf24` / `#f59e0b` / `#b45309` مع gradient الأزرار الأساسي `linear-gradient(135deg, #fbbf24, #f59e0b)` ونص أسود؛ أحمر خطر `#ef4444`، أزرق معلومات `#3b82f6`؛ زوايا `rounded-3xl` (24px) و`rounded-2xl` (16px) للبطاقات و`rounded-xl` للأزرار والحقول؛ توهّجات عنبرية `shadow-[0_0_50px_rgba(245,158,11,0.15)]`؛ كل النصوص عربية RTL مع خط عربي مخصص (`font-arabic` — يجب استخراج العائلة الفعلية من `globals.css`، غالباً Cairo/Tajawal، وتضمينها كـ asset)؛ حقول الهاتف وكلمة المرور تُجبَر على `dir="ltr"`.

---

### القشرة العامة Player Shell (`/player/layout.tsx` + `/player`)

- **الوظيفة والرحلة**: الغلاف الدائم لكل صفحات اللاعب: يستعيد الجلسة من التخزين المحلي ويتحقق منها عبر `/me`، يطبّق حارس المصادقة (auth guard)، يفرض بوابة الإشعارات، ويعرض BottomNav وسحب-للتحديث. صفحة `/player` نفسها مجرد redirect فوري إلى `/player/home` مع spinner عنبري 40px أثناء التحويل.
- **الحالات والشاشات الفرعية**:
  - **شاشة التحميل**: ملء الشاشة `#050505`، عمود مركزي فيه حلقة spinner بقياس 48px (border 2px عنبري/30 مع قوس علوي عنبري يدور) + نص `جاري التحميل...` بلون amber-500/60 حجم text-sm. تظهر عندما `isLoading && !isGamePage` (صفحة الانضمام تدير تحميلها بنفسها).
  - **الغلاف الطبيعي** (كل البوابات مجتازة): `min-h-screen bg-[#050505] pb-20` (حشوة سفلية 80px لشريط التنقل) مع `overscrollBehavior:'none'`؛ الأطفال بالداخل + BottomNav مثبّت أسفل.
  - **مؤشر سحب-للتحديث**: أثناء السحب يظهر شريط علوي مثبّت z-[200] فيه spinner عنبري 32px.
- **الميزات والتفاعلات**:
  - **استعادة الجلسة**: قراءة `mafia_player_auth` (JSON بها `{playerId,name,phone,token}`) ← تحقق عبر `GET /api/player-auth/me`؛ عند النجاح يعاد مزامنة المفاتيح المسطّحة؛ عند الفشل (أو خطأ شبكة أو JSON فاسد) تُمسح مفاتيح اللاعب الثلاثة. `isLoading` تبقى true حتى الحسم.
  - **Auth guard** (بعد انتهاء التحميل): يتخطى `/player/join` كلياً؛ لا لاعب + مسار غير عام ← `router.replace('/player/login')`؛ لاعب موجود + مسار `/player/login` ← تحويل إلى `/player/home`. المسارات العامة: `['/player/login', '/player/debug-push']`.
  - **Staff auto-login**: إذا أعاد `/me` حقلَي `staffInfo` + `staffToken` (حساب لاعب مرتبط بموظف)، يخزّن الـ context بيانات الموظف ويكتب مفاتيح الداشبورد/القائد (`token`، `user` JSON، `leader_token`، `leader_name`) ثم يستدعي `reconnectSocketAuth()` ليلتقط الـ socket صلاحيات القائد دون إعادة تحميل.
  - **logout()**: يمسح مفاتيح اللاعب و`staffInfo` من الحالة لكنه يُبقي عمداً على مفاتيح الموظف/القائد (قد يبقى المستخدم مسجلاً في الداشبورد).
  - **سحب-للتحديث (iOS PWA)**: يُفعَّل عندما `isIOS || isStandalone`؛ يسجّل touchstart فقط عند `scrollY===0`؛ يعتبر السحب فعّالاً بعد 60px ويعيد تحميل الصفحة (`window.location.reload()`) عند تجاوز 80px عند الإفلات. يُكبَت عندما يحمل الـ body صنف `modal-open` أو `in-game` أو عندما `body.style.position==='fixed'`.
  - **Pending navigation من الإشعار (cold start)**: بعد جاهزية اللاعب يفتح CacheStorage باسم `mafia-auth`، يقرأ نص المدخل `/__pending_nav` (يكتبه الـ Service Worker عند نقر الإشعار لأن iOS يفتح start_url ويتجاهل رابط الإشعار)، يحذفه ثم `router.replace` إلى المسار المقصود.
- **التصميم**: كما في اللغة البصرية المشتركة أعلاه؛ الأنيميشن: `animate-spin` للـ spinners.
- **API**: `GET /api/player-auth/me` (Bearer playerToken) — يعيد `{success, player{id, playerId, phone, name, gender, dob, avatarUrl, email, totalMatches, totalWins, totalSurvived, mustChangePassword}, staffInfo|null, staffToken|null, activeGame{roomId, roomCode, gameName, physicalId, role|null, isAlive, phase}|null, frozenGames[]}` (يُفحص من حالات Redis مع تخطي GAME_OVER؛ 401/404/503/500).
- **Socket**: لا أحداث لعبة هنا — لكن هذه الطبقة تملك البنية التحتية (انظر قسم البنية التحتية أدناه).
- **مكافئ Flutter**: `MaterialApp` بثيم داكن (`scaffoldBackgroundColor: Color(0xFF050505)`) + `Directionality(TextDirection.rtl)` على مستوى التطبيق؛ إدارة الجلسة عبر Riverpod/Bloc بحالات loading ← unauthenticated ← authenticated(player, staffInfo?) مع الإبقاء على نمط "تحقق `/me` عند الإقلاع"؛ `flutter_secure_storage` للتوكنات و`shared_preferences` للأعلام؛ حارس المسارات عبر `go_router` redirect. سحب-للتحديث يُستبدل بـ `RefreshIndicator`/`CupertinoSliverRefreshControl` يعيد جلب `/me` وبيانات الشاشة بدل reload كامل، مع احترام قواعد الكبت (مودال مفتوح/داخل لعبة) عبر provider بدل أصناف body. حيلة `/__pending_nav` تُستبدل بـ `FirebaseMessaging.getInitialMessage()` + `onMessageOpenedApp` — أبسط بكثير أصلياً. **مخاطر**: قرار حمل صلاحيات القائد في تطبيق اللاعب (staffToken) يجب حسمه؛ نمط التوكن المزدوج (playerToken + staffToken) مطلوب لأن مصافحة الـ socket ترسل الاثنين.

---

### شاشة تسجيل الدخول (`/player/login`)

- **الوظيفة والرحلة**: صفحة واحدة بأربعة أوضاع (AnimatePresence mode="wait") تغطي الترحيب، الدخول، التسجيل، وتغيير كلمة المرور الإجباري، مع مودال مكافأة ترحيبية بعد التسجيل. المستخدم المصادَق يُحوَّل عنها تلقائياً إلى `/player/home`.
- **الحالات والشاشات الفرعية**:
  - **welcome** (الافتراضية): fade+slide عمودي (y:20→0)؛ عمود gap-6 بعرض max-w-sm: شعار `/mafia_logo.png` بقياس 120×120 rounded-2xl؛ عنوان `نادي المافيا` (text-2xl bold أبيض)؛ نص فرعي رمادي؛ زر أساسي `تسجيل الدخول` (عرض كامل، py-3.5، gradient عنبري، نص أسود semibold) وزر ثانوي outline `حساب جديد` (نص amber-400، حد amber-500/30، hover خلفية amber-500/10).
  - **login**: انزلاق أفقي (x:50→0 دخولاً، x:-50 خروجاً)؛ رابط رجوع `→ رجوع` (رمادي، يمسح الخطأ)؛ عنوان `تسجيل الدخول`؛ حقلا هاتف (tel) وكلمة مرور (password) بنمط `bg-white/5 border-white/10 rounded-xl` مع focus بحد amber-500/50 و`dir="ltr"`؛ Enter في حقل كلمة المرور يُرسل؛ سطر خطأ red-400 text-xs؛ زر `دخول` يتحول أثناء التحميل إلى `جاري الدخول...` مع تعطيل بشفافية 50%.
  - **register**: نفس الانزلاق، gap-3؛ حقول: الاسم الكامل (RTL)، الهاتف (LTR)، كلمة المرور `(4 أحرف على الأقل)` (LTR)؛ اختيار الجنس بزوج أزرار مقسّمة: `♂ ذكر` محدد = `bg-blue-500/20 border-blue-500/50 text-blue-400`، `♀ أنثى` محدد = بنفسجي-وردي `bg-pink-500/20 border-pink-500/50 text-pink-400`، غير المحدد رمادي؛ زر `إنشاء حساب` / `جاري الإنشاء...`.
  - **change_password** (إجباري، يُدخَل فقط عندما يعيد الدخول `mustChangePassword:true`): scale-in (0.95→1)؛ **بلا زر رجوع** (لا مهرب)؛ عنوان `تغيير كلمة المرور` + شرح `يجب تغيير كلمة المرور الافتراضية قبل المتابعة`؛ حقل واحد `كلمة المرور الجديدة` (LTR، Enter يرسل)؛ زر `تحديث وإدخال` / `جاري التحديث...`.
  - **مودال المكافأة الترحيبية** (بعد تسجيل ناجح مع `welcomeBonus`): خلفية `bg-black/85` z-[200]؛ بطاقة max-w-sm خلفية `#111` بحد `rgba(251,191,36,0.3)` وp-8 مع spring pop (scale 0.7→1، damping 15، stiffness 200) وتوهج عنبري علوي داخلي؛ 🎁 بحجم text-6xl مع spring scale واهتزاز دوراني `[0,10,-10,0]` بتأخير 0.2s؛ عنوان `مكافأة ترحيبية!`؛ نص `مرحباً بك في نادي المافيا`؛ المبلغ `+{amount} XP ✨` (text-3xl bold عنبري، fade-up بتأخير 0.4)؛ زر `يلا نبدأ! 🎮` — يغلق المودال **ويُثبّت الجلسة** (setPlayer لا يُستدعى قبل ضغط الزر).
  - **خلفية زخرفية ثابتة**: دائرتان radial-gradient مموّهتان بشفافية 5% — عنبرية 384px أعلى-يسار وحمراء 288px أسفل-يمين، `pointer-events-none`.
- **الميزات والتفاعلات**:
  - تحقق العميل في الدخول: الحقلان مطلوبان (`أدخل رقم الهاتف وكلمة المرور`)؛ أخطاء الخادم تُعرض حرفياً (كلها عربية من الخادم).
  - استجابة `mustChangePassword` ← تخزين مؤقت للتوكن والبيانات والانتقال لوضع change_password (بدون تثبيت جلسة).
  - تحقق التسجيل: الحقول الثلاثة مطلوبة (`جميع الحقول مطلوبة`)؛ كلمة المرور ≥4 (`كلمة المرور 4 أحرف على الأقل`)؛ الجنس افتراضياً MALE بلا تحقق؛ حقل `dob` مدعوم في الـ API لكن **غير مجموع في الواجهة**.
  - تغيير كلمة المرور الإجباري: ≥4 أحرف؛ يستعمل Bearer المؤقت؛ عند النجاح يثبّت الجلسة بالتوكن **المؤقت الأصلي** (التوكن الجديد في الاستجابة يُتجاهل — قرار: إصلاح أم محاكاة).
  - فشل الشبكة في أي نداء ← رسالة عامة `خطأ في الاتصال بالخادم` / `خطأ في الاتصال`.
- **التصميم**: كما في اللغة المشتركة + انتقالات framer-motion الموصوفة أعلاه لكل وضع.
- **API**:
  - `POST /api/player-auth/login` — `{phone, password}` — **rate limit: 15 طلب / 15 دقيقة**؛ نجاح: `{token, player{…, mustChangePassword}}`؛ 400 حقول ناقصة؛ 401 بيانات خاطئة أو حساب بلا كلمة سر (`هذا الحساب لم يُنشَأ له كلمة سر بعد — يرجى التسجيل`)؛ 503/500.
  - `POST /api/player-auth/register` — `{phone, password, name, gender('MALE'|'FEMALE'), dob?}`؛ نجاح: `{token, welcomeBonus:200, player}`؛ 409 هاتف مكرر (`رقم الهاتف مسجل مسبقاً — يرجى تسجيل الدخول`)؛ أثر جانبي: xp=200 + إشعار push للإدارة "👤 لاعب جديد".
  - `POST /api/player-auth/change-password` — Bearer (المؤقت في التدفق الإجباري)؛ `{oldPassword?, newPassword}` — oldPassword مطلوب ومُتحقق منه إلا عند `mustChangePassword` (الواجهة هنا ترسل `{newPassword}` فقط)؛ نجاح يعيد token جديداً.
- **Socket**: لا شيء مباشر؛ بعد الدخول/ربط الموظف يُستدعى `reconnectSocketAuth()`.
- **مكافئ Flutter**: شاشة واحدة بـ `AnimatedSwitcher`/`PageTransitionSwitcher` تحاكي إزاحات x:50 / y:20؛ حقول `TextFormField` مع `textDirection: TextDirection.ltr` للهاتف وكلمة المرور؛ أزرار gradient عبر `Ink` + `LinearGradient(Alignment.topLeft→bottomRight)`؛ مودال المكافأة عبر `showGeneralDialog` + `flutter_animate` (elasticOut) أو `SpringSimulation`. **مخاطر**: معالجة ودّية لحد الـ rate limit (15/15د) على العميل؛ الإبقاء على منطق "الجلسة لا تُثبَّت إلا بعد إغلاق مودال المكافأة"؛ وضع change_password يجب أن يكون غير قابل للهروب (منع زر الرجوع بـ `PopScope`).

---

### بوابة الإشعارات الإلزامية (على مستوى الـ layout)

- **الوظيفة والرحلة**: قاعدة منتج صارمة — **لا لعب بدون إشعارات**. عند وجود لاعب مسجّل ومسار غير عام، تُعرض إحدى 4 شاشات حجب كاملة (`fixed inset-0 z-[99999]`) حسب الأسبقية: needsInstall ← prompt ← denied ← unsupported(+bypass). حالة `granted` تمرّ للغلاف الطبيعي.
- **الحالات والشاشات الفرعية** (كلها: خلفية `#050505`، `dir="rtl"`، بطاقة مركزية max-w-md بنمط `bg-[#0c0c0c]/90 backdrop-blur-xl rounded-3xl p-6/8` مع `animate-fade-in-up`، ورابط سفلي صغير `🔧 صفحة تشخيص الإشعارات` ← `/player/debug-push`):
  - **4a. needsInstall (iOS Safari غير مثبت كـ PWA)**: حد عنبري/10 وتوهج؛ أيقونة تطبيق عائمة 80×80 بتدرج عنبري←أصفر مع 🕵️‍♂️ و`animate-pulse-slow` + حلقة ping خارجية؛ عنوان `خطوة أخيرة للعب! 📱`؛ شرح قيد Apple؛ 3 بطاقات خطوات مرقمة (مشاركة 📤 ← "إضافة إلى الشاشة الرئيسية ➕" ← الفتح من الشاشة الرئيسية)؛ تحذير سفلي `⚠️ نظام Apple يمنع تفعيل الإشعارات إلا من خلال التطبيق المضاف للشاشة الرئيسية.`؛ **بلا إغلاق**.
  - **4b. prompt**: حد عنبري/20؛ جرس بطل: دائرة 80×80 عنبرية/10 بحد عنبري/30، SVG جرس 40px `animate-bounce` + حلقة ping؛ عنوان `تفعيل الإشعارات الفورية 🔔`؛ زر CTA عريض py-4 بتدرج amber-500→yellow-600 ونص أسود bold `تفعيل الآن وسماح ⚡` مع `active:scale-95` وتوهج يكبر عند hover؛ أثناء الطلب spinner أسود 20px + `جاري التفعيل...` وتعطيل 50%؛ تلميح بالضغط على "سماح" في نافذة المتصفح.
  - **4c. denied**: حد أحمر/20 وتوهج أحمر؛ درع-تعجب SVG أحمر `animate-pulse`؛ عنوان `الإشعارات محظورة بالخطأ! ⚠️`؛ 3 خطوات يدوية لإعادة التفعيل (🔒 في شريط العنوان ← "الإشعارات" ← "سماح")؛ زر `تحديث الصفحة وإعادة التحقق 🔄` (`bg-white/10`) ← `window.location.reload()`.
  - **4d. unsupported** (بدون علم التجاوز): حد أزرق/20؛ كرة أرضية SVG؛ عنوان `المتصفح غير مدعوم 🌐`؛ نصيحة باستخدام Chrome أو Safari الرسمي؛ زر تحديث؛ ثم تحت فاصل: **قسم رمز التجاوز** — نص `جهازك قديم ولا يدعم الإشعارات؟ أدخل رمز التجاوز للمتابعة بدون إشعارات:`؛ حقل رقمي (inputMode numeric، حد أقصى 4، تصفية أرقام فقط، placeholder `••••`، توسيط مع `tracking-[0.5em]`، Enter يرسل) + زر `دخول` عنبري (معطّل تحت 4 أرقام بشفافية 40%)؛ رمز خاطئ ← خطأ أحمر `الرمز غير صحيح`؛ الرمز الصحيح **`1998`** (مكتوب في كود العميل!) ← يكتب `notifications_unsupported='true'` ويفتح التطبيق نهائياً.
- **الميزات والتفاعلات**: زر طلب الإذن يعرض spinner محلي؛ الأخطاء تُسجَّل في console فقط؛ البوابات تحجب التنقل كلياً.
- **التصميم**: التوهجات والحلقات النابضة (ping/pulse) عنصر هوية أساسي — يجب نقلها.
- **API**: لا نداءات مباشرة من شاشات البوابة (طلب الإذن يمر عبر hook الإشعارات — انظر قسم home).
- **Socket**: لا شيء.
- **مكافئ Flutter**: **أكبر نقطة اختلاف في النقل** — شاشة 4a (تثبيت iOS PWA) **تسقط كلياً** في تطبيق أصلي؛ شاشة prompt تبقى كمفهوم وتستدعي `firebase_messaging.requestPermission()`؛ شاشة denied تستبدل التعليمات اليدوية بزر فتح إعدادات التطبيق عبر حزمة `app_settings`؛ حالة unsupported تختفي عملياً (يُحتفظ بمسار رمز التجاوز فقط لدعم أجهزة قديمة بلا Play Services إن لزم). **قاعدة المنتج (الحجب الكامل) تبقى كـ route guard** في go_router. الحلقات النابضة عبر `AnimationController` حلقي + `ScaleTransition`+`FadeTransition`. **مخاطر**: رمز 1998 hardcoded — قرار نقله للخادم أو إبقائه.

---

### شريط التنقل السفلي BottomNav (مكوّن)

- **الوظيفة والرحلة**: شريط ثابت أسفل كل صفحات اللاعب بـ 5 تبويبات وزر مركزي مرتفع "ادخل".
- **الحالات والشاشات الفرعية**: تبويب نشط/خامل؛ الزر المركزي نشط/خامل.
- **الميزات والتفاعلات**:
  - التبويبات بترتيب RTL (الرئيسية أولاً من اليمين): `/player/home` — `الرئيسية` (منزل)؛ `/player/games` — `الألعاب` (يد تحكم)؛ `/player/join` — `ادخل` (درع-صح، **الزر المركزي المرتفع**)؛ `/player/rank` — `التصنيف` (نجمة)؛ `/player/profile` — `حسابي` (شخص). كلها SVG مرسومة يدوياً بلا مكتبة أيقونات.
  - التبويبات العادية: أيقونات stroke بقياس 22px، نشط `#fbbf24` / خامل `#6b7280`؛ تسمية 10px تحتها؛ عرض أدنى 56px.
  - مؤشر النشاط: شريط عنبري 20×2px أعلى التبويب ينزلق بين التبويبات (`layoutId="activeTab"` — shared element).
  - الزر المركزي: `marginTop:-20px` (يطفو فوق الشريط)، دائرة 56px؛ نشط بخلفية `linear-gradient(135deg,#fbbf24,#b45309)` وإلا كحلي داكن `linear-gradient(135deg,#1a1a2e,#16213e)`؛ حد `2px solid rgba(251,191,36,0.6)`؛ توهج أقوى عند النشاط (`0 0 20px rgba(251,191,36,0.4)`) مقابل (`0 0 10px …0.15`)؛ أيقونة درع 28px — نشطة: معبأة `#fbbf24` بحد `#b45309` وعلامة صح داخلية؛ خاملة: outline؛ `whileTap scale 0.9`.
  - كشف النشاط: `pathname === tab.href` أو (`تبويب الرئيسية نشط أيضاً عندما المسار `/player`).
- **التصميم**: خلفية `linear-gradient(180deg, rgba(10,10,10,0.95), rgba(5,5,5,1))`؛ حد علوي `1px solid rgba(251,191,36,0.15)`؛ `backdrop-filter: blur(20px)`؛ `paddingBottom: env(safe-area-inset-bottom)`؛ ارتفاع صف داخلي 64px بعرض أقصى max-w-lg.
- **API / Socket**: لا شيء.
- **مكافئ Flutter**: **لا تستخدم** `BottomNavigationBar` القياسي (لا يدعم الزر العائم المركزي + المؤشر المنزلق) — شريط مخصص: `Stack` مع `Positioned` للدائرة المركزية أو `Transform.translate(Offset(0,-20))`؛ المؤشر المنزلق عبر `AnimatedPositioned`/`AnimatedAlign`؛ تكبير الضغط عبر `AnimatedScale`؛ التبويبات عبر go_router `StatefulShellRoute` مع `IndexedStack`؛ safe area عبر `SafeArea`/`MediaQuery.padding.bottom`.

---

### صفحة الانضمام (`/player/join` — تبويب + deep link بالـ query)

- **الوظيفة والرحلة**: هدف التبويب المركزي ونقطة deep link بالمعاملات `?code=XXXX&invite=1&by=NAME`؛ تسلّم مباشرة إلى مكوّن اللعبة `PlayerFlow` (شريحة منفصلة).
- **الحالات والشاشات الفرعية**: ملفوفة في Suspense (fallback: spinner عنبري 40px)؛ تعرض `null` حتى الـ mount.
- **الميزات والتفاعلات**: عند الـ mount، إن وُجد لاعب في الـ context تكتب مفاتيح توافق في التخزين (`mafia_player_info` JSON بـ `{playerId, displayName, phone}`، `mafia_player_token`، `mafia_playerId`) ثم تعرض `<PlayerFlow initialRoomCode={code} inviteFlag inviterName />` (علم `invite=1` يعرض تأكيداً قبل الانضمام داخل PlayerFlow). **الـ layout يعامل هذا المسار معاملة خاصة**: بلا auth redirect وبلا شاشة تحميل — لكنه ليس ضمن PUBLIC_PATHS، فبوابة الإشعارات تنطبق عليه عند تسجيل الدخول؛ BottomNav يظل معروضاً (PlayerFlow يضيف صنف body `in-game` لكبت سحب-للتحديث).
- **التصميم / API / Socket**: يخص PlayerFlow (شريحة اللعبة).
- **مكافئ Flutter**: مسار go_router يقبل query params ويمرّرها لشاشة PlayerFlow؛ **يجب استنساخ إعفاء حارس المصادقة** (الجلسة تعالَج داخل PlayerFlow) وإلا سيرتد المستخدمون غير المسجلين خطأً؛ الروابط العميقة تصبح App Links / Universal Links.

---

### رابط الانضمام العام (`/join/[roomCode]` — خارج layout اللاعب)

- **الوظيفة والرحلة**: صفحة عارية لروابط QR والمشاركة: تقرأ كود الغرفة من المسار وتعرض `<PlayerFlow initialRoomCode={roomCode} />` **بلا provider ولا حارس ولا شريط تنقل** — PlayerFlow يعالج الهوية بنفسه.
- **الحالات**: لا شيء خاص بها.
- **مكافئ Flutter**: مسار عام في go_router يسمح بدخول غير مصادَق إلى PlayerFlow؛ ضبط deep-link للنمط `/join/{code}` مع سيناريو مسح QR في الحسبان.

---

### البنية التحتية المشتركة: Socket وPlayerContext والتخزين (cross-cutting)

- **Socket singleton**: `io(SOCKET_URL)` حيث `SOCKET_URL = NEXT_PUBLIC_SOCKET_URL || ''` (إنتاج: نفس الأصل عبر rewrites؛ تطوير: `http://localhost:4000`). الخيارات: `transports:['polling','websocket']` (**polling أولاً** — التفاف على متصفحات/بروكسيات)، إعادة اتصال لا نهائية بتأخير 1000←5000ms، مهلة اتصال 20000ms.
- **مصافحة المصادقة**: حقل `auth` **دالة** تُستدعى عند كل اتصال/إعادة اتصال وتعيد `{token: localStorage('token') || localStorage('leader_token') || '', playerToken: localStorage('mafia_player_token') || ''}` — الخادم يتطلبها (socket auth إلزامي بعد التحصين الأمني).
- **`reconnectSocketAuth()`**: إعادة تعيين قارئ auth ثم `disconnect()` فـ `connect()` — بعد الدخول/ربط الموظف. **`disconnectSocket()`**: قطع + تصفير الـ singleton.
- **معالجات مسجلة**: `connect` / `disconnect` / `connect_error` (تسجيل حالة الاتصال فقط).
- **`useSocket.emit`**: غلاف promise بمهلة **15 ثانية** (`socket.timeout(15000).emit`)؛ يرفض برسالة `الخادم في وضع قطع الاتصال أو لا يستجيب (Timeout)`؛ يقبل فقط عندما `response.success` صادقة وإلا يرفض بخطأ يحمل `.response`؛ `on(event,handler)` تعيد دالة إلغاء اشتراك.
- **مفاتيح التخزين المحلي**: `mafia_player_auth` (الجلسة القانونية JSON)، `mafia_player_token`، `mafia_playerId`، `mafia_player_info`، `token` + `user` (جلسة الموظف)، `leader_token` + `leader_name`، `notifications_unsupported`، `push_notifications_enabled`، `mafia_device_id` (UUID ثابت لكل تثبيت عبر `crypto.randomUUID` مع fallback؛ لإزالة تكرار توكنات الـ push لكل جهاز فيزيائي).
- **مكافئ Flutter**: حزمة `socket_io_client` تدعم خريطة `auth` لكن **ليس دالة callback** — عيّن `socket.auth = {...}` وحدّثها قبل `disconnect(); connect();` يدوياً لمحاكاة `reconnectSocketAuth()`. للتطبيق الأصلي يُفضَّل websocket-only بعد التحقق من سماح الخادم (polling-first كان التفافاً متصفحياً). استنسِخ مساعد emit-with-ack بمهلة 15s (`socket.emitWithAck` + `Future.timeout`) بما فيه ظرف الرفض `{success:false, error}`. معرّف الجهاز عبر حزمة `uuid` محفوظاً في prefs عند أول إقلاع.

---

### الصفحة الرئيسية (`/player/home`)

- **الوظيفة والرحلة**: لوحة اللاعب بعد الدخول — صفحة عمودية واحدة قابلة للتمرير (عرض أقصى 512px موسّط، `px-4 pt-6 space-y-5 pb-6`) تجمع: الهوية والرتبة وXP، إحصاءات سريعة، بطاقة اللعبة الجارية، الغرف المفتوحة لحجوزات اللاعب، مدخل طلبات F&B، مدخل الاستضافة عن بُعد (مقيّد بصلاحية)، أقرب 3 أنشطة قادمة، خلاصة الأصدقاء، روابط السوشال ميديا، زر واتساب عائم، تفعيل الإشعارات، واختصارات الموظفين للحسابات المرتبطة. تُحمَّل البيانات بالتوازي مع spinner واحد.
- **الحالات والشاشات الفرعية**:
  - **حالة التحميل**: استبدال كامل للصفحة بـ spinner مركزي (`min-h-[60vh]`، دائرة 40×40، `border-amber-500/30 border-t-amber-500 animate-spin`).
  - **مودال مجموعة الواتساب (مرة واحدة)**: يظهر إن غاب المفتاح `mafia_wa_group_prompt_v1`. غطاء `bg-black/75 backdrop-blur-sm z-[200]`؛ بطاقة max-w-sm rounded-3xl خلفية `#0e1512` بحد أخضر واتساب `rgba(37,211,102,0.35)` وتوهج أخضر؛ دائرة 64px بتدرج `#25d366→#128c7e` مع SVG واتساب أبيض 34px؛ عنوان `انضم لمجموعة مافيا كلوب 💬` + نص تعريفي؛ CTA `انضم الآن` (رابط جديد إلى مجموعة الواتساب، يُغلق نهائياً) + زر ثانوي `لاحقاً`؛ نقر الخلفية يغلق أيضاً؛ **كل مسارات الإغلاق الثلاثة تكتب المفتاح** (المفتاح مُرقَّم الإصدار — رفع اللاحقة يعيد عرضه للجميع)؛ spring دخول (scale 0.9→1، y 20→0، damping 22، stiffness 260).
  - **رابط تشخيص مؤقت**: `🔧 تشخيص الإشعارات` ← `/player/debug-push` — معلَّم في الكود كمؤقت؛ **يُحذف في النقل**.
  - **صف الرأس**: يسار (فقط عند `staffInfo`): زر `🎛️ لوحة التحكم` (pill بنفسجي، يفتح لوحة الموظف) + رابط `📋 متابعة الحجوزات` ← `/admin/reservations` (pill عنبري)؛ يمين: جرس الإشعارات دائماً.
  - **PushBanner** (يخفى عند dismissal بالمفتاح `push_banner_dismissed` أو عند granted/denied): نسخة A لـ needsInstall (بطاقة عنبرية بتعليمات iOS الثلاث + ✕)؛ نسخة B لـ prompt (بطاقة زرقاء: 🔔 بحجم 28px + عنوان `لا تفوّت أي تحديث!` + نص فرعي + زر `تفعيل` أزرق `#3b82f6` يتحول أثناء التفعيل إلى ⏳؛ النجاح يخفي نهائياً)؛ دخول fade + انزلاق من y -10. **في Flutter تسقط نسخة A ويبقى إصدار B مربوطاً بـ authorizationStatus**.
  - **لوحة تحكم الموظف (bottom sheet)**: غطاء `bg-black/70 z-[100]`؛ لوح `rounded-t-3xl p-6 pb-10` بتدرج `#1a1a2e→#0a0a1a` وحد بنفسجي، spring انزلاق من `y:100%`؛ مقبض سحب 40×4؛ عنوان `🎛️ لوحة التحكم` + `مرحباً {displayName} • {role}` (admin←"مدير"، leader←"قائد"، غير ذلك←"موظف")؛ 3 صفوف تنقل بأنيميشن متدرّج (x -20 بتأخيرات 0.05/0.10/0.15): `لوحة الإدارة` ← `/admin` (أحمر داكن، 📊، "Dashboard • إحصائيات وأنشطة ومالية")؛ `غرفة العمليات` ← `/leader` (**فقط للدور ∈ {admin, manager, leader}**؛ ذهبي `#C5A059`، 🕹️، "Leader • إدارة وتشغيل الألعاب")؛ `شاشة العرض` ← `/display` (أزرق، 📺، "Display • عرض حالة اللعبة")؛ الإغلاق: نقر الخلفية أو سحب لأسفل ≥80px؛ قفل تمرير الـ body.
  - **بطاقة البروفايل البطل**: fade + صعود y10؛ خلفية `linear-gradient(135deg, rgba(251,191,36,0.08), rgba(5,5,5,0.9))` بحد عنبري 0.15؛ صورة رمزية 64px بحد 3px `rgba(251,191,36,0.4)` (صورة `avatarUrl` أو 🎭)؛ تحية `أهلاً {name} 👋` (الاسم الاحتياطي "لاعب")؛ شريحة رتبة pill عنبرية بمحتوى `{شارة} {اسم الرتبة} • Lv.{level}` — جداول الرتب: INFORMANT 🕵️ مُخبر، SOLDIER ⚔️ جندي، CAPO 🎖️ كابو، UNDERBOSS 💎 أندربوس، GODFATHER 👑 الأب الروحي (احتياطي: 🕵️ / "مُخبر" / 1)؛ شريط XP: تسمية `XP {xp}` مقابل `{nextLevelXP||500}`، مسار h-1.5 `bg-white/5`، تعبئة تتحرك من 0 إلى `{xpProgress}%` بتدرج `90deg #fbbf24 → #ef4444`.
  - **شبكة إحصاءات سريعة**: `grid-cols-4 gap-2`، بطاقات `bg white/0.03`؛ الخلايا: "مباريات" = totalMatches (#fbbf24) · "فوز" = winRate% (#22c55e) · "نجاة" = survivalRate% (#3b82f6) · "سلسلة" = longestWinStreak (#f97316)؛ افتراضي 0؛ ظهور متدرّج بتأخير `i*0.05`.
  - **بطاقة اللعبة النشطة** (عند `profile.activeGame`): مشتقات `isDead = isAlive===false`، `isOver = phase==='GAME_OVER'`، `canLeave = isDead||isOver`؛ ثيم أخضر للحيّ/الجارية وأحمر للميت/المنتهية؛ تسمية حالة: `🏁 اللعبة انتهت` / `💀 تم إقصاؤك` / `🟢 لعبة نشطة`؛ اسم اللعبة تحتها؛ الأزرار: `🚪 مغادرة` (فقط عند canLeave؛ pill أحمر) — يفتح socket مؤقتاً (websocket) ويرسل `room:player-exit` بـ ack، عند النجاح يصفّر بطاقة اللعبة محلياً، يقطع الاتصال، مع مؤقت قطع احتياطي 3 ثوان؛ و`العودة ←` (أخضر عند الجريان / رمادي عند canLeave) — يحذف `mafia_user_exited` ثم `router.push('/player/join')` لإعادة الالتحاق.
  - **بطاقات الغرف المفتوحة لحجوزاتك** (عند `activeRooms` غير فارغة): بطاقة لكل نشاط بتدرج عنبري؛ `🎮 غرفة مفتوحة لحجزك` + اسم النشاط + سطر فرعي (غرفة واحدة ← `كود الغرفة: {sessionCode}`؛ متعددة ← `{n} غرف متاحة`)؛ CTA `🎯 ادخل` بتدرج `#fbbf24→#d97706` ونص أسود وتوهج؛ الضغط: **حذف `mafia_session` و`mafia_user_exited`** (لمنع الالتحاق التلقائي بغرفة قديمة) ثم غرفة واحدة ← `/player/join?code=…`، وإلا فتح لوح اختيار الغرفة.
  - **لوح اختيار الغرفة (bottom sheet)**: تدرج `#1a1a1a→#0a0a0a` بحد عنبري؛ عنوان `اختر غرفة` + `{activityName} — {n} غرف متاحة`؛ صفوف متدرجة الظهور: دائرة 40px برقم الغرفة، الاسم `sessionName || "غرفة {i+1}"`، `كود: {sessionCode} • {maxPlayers} لاعب` (font-mono)، سهم عنبري؛ الضغط: مسح المفتاحين + إغلاق + تنقل؛ الإغلاق: خلفية أو سحب 80px.
  - **بطاقة طلب F&B** (عند `fnbCtx`): زر بعرض كامل بتدرج زمردي `rgba(16,185,129,…)`؛ `🍽️ اطلب من {locationName}` + `منيو المكان متاح لحجزك — {activityName}`؛ pill `اطلب →` بتدرج `#10b981→#0d9488`؛ ← `/player/order`.
  - **بطاقة الاستضافة عن بُعد** (عند `player.canHostRemote`): ثيم ذهبي `rgba(197,160,89,…)`؛ `🌐 استضافة لعبة عن بُعد` + وصف؛ pill `استضِف →` بتدرج `#d8b25a→#c0912f`؛ ← `/player/host`.
  - **الأنشطة القادمة** (حد أقصى 3): رأس `📅 أنشطة قادمة` + رابط `عرض الكل ←` ← `/player/games`؛ صفوف: الاسم + pill صعوبة (easy `🟢 سهل` #22c55e، medium `🟡 متوسط` #f59e0b، hard `🔴 صعب` #ef4444، expert `🟣 خبير` #a855f7؛ **المجهول يسقط إلى medium**)؛ سطر تاريخ `toLocaleDateString('ar-JO')` (يوم مختصر) + `📍 {locationName}` إن وجد؛ سطر سعة `👥 {bookedCount}/{maxPlayers||20} لاعب`؛ 🎟️ في النهاية؛ الضغط يفتح مودال التفاصيل.
  - **مودال تفاصيل النشاط (bottom sheet قابل للتمرير)**: `max-h-[80vh]` خلفية `#111`؛ الاسم + الوصف الاختياري + صفوف: 📅 تاريخ عربي كامل بالوقت، 📍 الموقع، 👥 السعة، الصعوبة الملونة، 💰 `{basePrice} ₪` **فقط إن كان basePrice موجوداً و≠ '0'** (مقارنة نصية — الـ API يرسله string؛ لاحظ استخدام رمز الشيكل)؛ كتلة عروض `🎁 العروض المتاحة:` إن كانت `locationOffers` مصفوفة غير فارغة (لكل عرض: `name || title || "عرض {i+1}"` + سعر اختياري + وصف)؛ التذييل: `احجز الآن 🎟️` (تدرج عنبري) ← إغلاق + `/player/games`، وزر `📍 الموقع` اختياري ← `locationMapUrl` بتبويب جديد؛ الإغلاق: خلفية أو سحب 80px لأسفل **فقط عندما scrollTop ≤ 5**.
  - **خلاصة الأصدقاء**: رأس `👥 أخبار أصدقائك` + حتى 8 صفوف مجمّعة (تجميع بمفتاح `playerId + يوم المباراة`؛ الوصف `لعب يوم {…} — {n} لعبة/ألعاب` بمفرد/جمع)؛ صورة 32px أو 🎭؛ شارة خلفية `🎮 {matchCount}` (cyan-400) — فرع level_up 🎉 **كود ميت بعد التجميع، يُحذف**؛ الحالة الفارغة: `لا أخبار بعد — تابع لاعبين من صفحة التصنيف!`.
  - **قسم السوشال `📱 تابعنا`**: شبكة عمودين — بطاقة Instagram (تدرج وردي/بنفسجي، `📸 Instagram` بلون `#e1306c` + `@mafia_club_jo`) وبطاقة Snapchat (تدرج أصفر، `👻 Snapchat` بلون `#FFFC00` + `@mafia_club26`)؛ وزر مجموعة واتساب بعرض كامل (SVG أخضر + `انضم لمجموعة الواتساب`)؛ كلها روابط خارجية بتبويب جديد.
  - **زر واتساب عائم (FAB)**: `fixed bottom-24 left-4 z-50` (الزاوية اليسرى في صفحة RTL — انسخ الموضع حرفياً)، دائرة 56px بتدرج `#25d366→#128c7e`، SVG أبيض 28px، ظل أخضر، hover scale 1.10 / active 0.95 ← `https://wa.me/962793390966`؛ `bottom-24` يتجاوز شريط التنقل.
- **الميزات والتفاعلات**:
  - تحميل أولي متوازٍ لـ 4 endpoints (profile / following-feed / upcoming / my-active-rooms) عبر Promise.all مع بوابة `success` لكل نتيجة؛ سياق F&B يُجلب منفصلاً غير حاجب حتى لا يؤخر الرسم الأول؛ `loading` يُصفَّر في `.finally`.
  - قواعد التخزين المتشابكة مع شريحة الانضمام **حرجة**: دخول غرفة محجوزة يمسح `mafia_session` + `mafia_user_exited`؛ "العودة" تمسح `mafia_user_exited` فقط — انقل الدلالات حرفياً.
  - ميكانيكا `useModalScrollLock` (لكل الشيتات): حفظ scrollY + صنف `modal-open` + `body.style.top` سالب؛ معالج touchmove غير passive يمنع تمرير الخلفية وoverscroll الطرفين؛ سحب-إغلاق بعتبة 80px عندما scrollTop ≤ 5.
  - تفعيل الإشعارات (البانر + الجرس): `requestPermission()` ← إذن المتصفح ← توكن FCM ← `POST register-token` بـ `{token, deviceId, deviceInfo}` ← `push_notifications_enabled='true'`. إعادة تسجيل تلقائية للاشتراك عند كل تحميل مع حارس in-flight على مستوى الموديول (الـ hook مركّب في layout + home + الجرس معاً)؛ إعادة استخدام اشتراك WebPush القائم إن طابق مفتاح VAPID؛ مسار iOS يعيد إنشاء الاشتراك ويسجّله بصيغة `'WEBPUSH::'+JSON`.
  - Polling للإشعارات كل 60 ثانية؛ تحديث عند رسالة FCM أمامية؛ تحديث عندما يرسل الـ SW ‏`{type:'PUSH_RECEIVED'}`؛ الصفحة ترسل للـ SW ‏`{type:'SET_AUTH_TOKEN', token, deviceId}` لتدوير توكن iOS.
  - القيم الاحتياطية: صعوبة مجهولة←medium؛ maxPlayers←20؛ nextLevelXP←500؛ level←1.
- **التصميم**: بطاقات بتدرج `linear-gradient(135deg, <accent 8–15% alpha>, rgba(5,5,5,0.9))` وحدود accent بشفافية 15–35%؛ نصوص صغيرة جداً (`text-[10px]`/`xs`/`sm`)؛ إيموجي كأيقونات في كل مكان؛ ألوان ثانوية: أخضر `#22c55e`، زمردي `#10b981`، ذهبي `#C5A059`، بنفسجي `#8b5cf6`، أزرق `#3b82f6`، أحمر `#ef4444`، أخضر واتساب `#25d366`؛ أنيميشن ظهور متدرّج fade+slideY بتأخيرات 0.03–0.08s؛ spring للشيتات والمودالات.
- **API** (كلها same-origin؛ Bearer حيث ذُكر):
  1. `GET /api/player/{playerId}/profile` — **بلا header مصادقة** (تأكد من سلوك الخادم قبل النقل) ← `{player{name, avatarUrl, canHostRemote}, stats{totalMatches, winRate, survivalRate, longestWinStreak}, progression{rankTier, level, xp, nextLevelXP, xpProgress}, activeGame|null}`.
  2. `GET /api/player-app/{playerId}/following-feed` — Bearer ← `{feed[{playerId, playerName, playerInfo?{name, avatarUrl}, matchDate, type?}]}`.
  3. `GET /api/player-app/activities/upcoming?playerId={id}` — بلا auth ← `{activities[…difficulty, locationName?, locationMapUrl?, locationOffers?, bookedCount, maxPlayers?, basePrice?(string)]}` — تُعرض أول 3.
  4. `GET /api/player-app/my-active-rooms` — Bearer (يُقرأ من `mafia_player_token` مباشرة لا من الـ context — **وحّد مصدر المصادقة في Flutter**) ← `{rooms[{activityId, activityName, rooms[{sessionId, sessionCode, sessionName?, maxPlayers}]}]}`.
  5. `GET /api/fnb/context` — Bearer ← `{context{locationName, activityName, …}|null}`.
  6. إشعارات: `GET /api/push/vapid-public-key`؛ `POST /api/player-notifications/register-token`؛ `GET /api/player-notifications`؛ `PUT /api/player-notifications/{id}/read`؛ `PUT /api/player-notifications/read-all`.
  7. عبر الـ context: `GET /api/player-auth/me`.
- **Socket**:
  - **Emit**: `room:player-exit` بحمولة `{roomId, playerId}` عند زر المغادرة — عبر اتصال socket.io **مؤقت** (dynamic import، `transports:['websocket']`)، ack ← تصفير activeGame محلياً، قطع بعد الـ ack، وقطع غير مشروط بعد 3 ثوان.
  - **لا مستمعات `.on`** في هذه الصفحة (شبه-حدث: مستمع `message` من الـ SW).
- **مكافئ Flutter**: `ListView` داخل `Center(ConstrainedBox(maxWidth:512))`؛ `flutter_animate` للظهور المتدرّج؛ شريط XP عبر `TweenAnimationBuilder` بتدرج عنبري←أحمر؛ الشيتات الثلاثة عبر `showModalBottomSheet(isScrollControlled:true)` — Flutter يوفر الإغلاق بالسحب وقفل التمرير أصلياً، **فكل hook ‏`useModalScrollLock` لا يحتاج نقلاً**؛ مودال النشاط عبر `DraggableScrollableSheet` (maxChildSize ≈ 0.8)؛ مودال الواتساب عبر `showDialog` مع حفظ العلم المُرقَّم في prefs؛ `cached_network_image` للصور مع 🎭 كاحتياط؛ `url_launcher` بوضع `externalApplication` لكل الروابط الخارجية؛ FAB بتدرج أخضر موضوع في جهة البداية فوق الشريط؛ التواريخ عبر `intl` بلقيمة `ar_JO` مع `initializeDateFormatting('ar')` (والعملة تظهر "₪" رغم عمل النادي بالدينار — انسخها كما هي حتى يصحّح المنتج)؛ الإيموجي كنص مع ملاحظة اختلاف خطوط الإيموجي بين المنصات (نقاط الصعوبة 🟢🟡🔴🟣 تُستبدل بدوائر ملونة). **مخاطر**: اختصارات الموظفين (`/admin`، `/admin/reservations`، `/leader`، `/display`) واجهات ويب منفصلة — افتحها بمتصفح خارجي أو `webview_flutter` مع مشكلة تمرير التوكن (الويب يزرع `token`/`leader_token` في localStorage — الـ webview يحتاج حقن cookies/localStorage أو تمرير التوكن في الرابط: **قرار نقل مطلوب**)؛ كود ميت يُحذف: رابط debug-push، فرع level_up في الخلاصة، علم `isIOSPWA` غير المستخدم.

---

### جرس الإشعارات NotificationBell (مكوّن — يظهر في رأس الرئيسية)

- **الوظيفة والرحلة**: زر جرس بعداد غير مقروء يفتح لوحة إشعارات منسدلة، مع دعم إشعارات غنية (صورة/فيديو) بنافذة تفاصيل، وروابط عميقة لكل نوع إشعار.
- **الحالات والشاشات الفرعية**:
  - **الزر**: 42×42، خلفية `rgba(255,255,255,0.08)`، 🔔 بحجم 20px؛ شارة غير مقروء: دائرة حمراء `#ef4444` أعلى-يسار (minWidth 20، نص 11px أبيض bold، سقف **"99+"**).
  - **اللوحة المنسدلة** (نقر يبدّل؛ mousedown خارجها يغلق): 340px عرضاً، ارتفاع أقصى 480، خلفية `rgba(17,17,17,0.98)` مع blur 20، ظل عميق، z-100؛ دخول fade + y -10 + scale 0.95 خلال 0.2s؛ رأس `الإشعارات (n)` + زر نصي `قراءة الكل ✓` عنبري عند وجود غير مقروء.
  - **بانرات شرطية داخل اللوحة**: prompt ← قسم أزرق بزر `🔔 تفعيل الإشعارات على هاتفك` (أثناء التفعيل `⏳ جاري التفعيل...`)؛ needsInstall ← قسم عنبري `📱 لتفعيل الإشعارات على iPhone` بثلاث خطوات (يسقط في Flutter)؛ denied ← قسم أحمر `❌ تم رفض الإشعارات — يمكنك تفعيلها من إعدادات المتصفح` (في Flutter: زر فتح الإعدادات).
  - **القائمة**: تمرير بحد أقصى 340px وحتى 30 عنصراً؛ الحالة الفارغة `لا توجد إشعارات`.
  - **تشريح الصف**: بادئة — صورة مصغرة 44×44 إن وُجد `data.imageUrl` (مع تراكب ▶️ إن وُجد `videoUrl`)، وإلا مربع 32×32 ملوّن بـ `TYPE_COLORS[type]+'20'` مع إيموجي `TYPE_ICONS`؛ الوسط — العنوان (أبيض 600 غير مقروء / أبيض-60% مقروء)، النص بسطرين مقصوصين، والوقت النسبي 10px؛ النهاية — نقطة عنبرية 8px لغير المقروء + شيفرون ◀ عند قابلية التنقل؛ خلفية الصف غير المقروء `rgba(245,158,11,0.05)`.
  - **جداول الأنواع**: `TYPE_ICONS`: new_activity 📅، game_ended 🎮، custom 📢، reminder ⏰، friend_booked 👥، level_up 🏆، booking_confirmed ✅، comeback 🔥، feedback_survey 📋، order_status 🍽️ (احتياطي 🔔)؛ `TYPE_COLORS`: عنبري/أحمر/بنفسجي/أزرق/أخضر/عنبري/أخضر/أحمر/بنفسجي/`#10b981` (احتياطي `#666`).
  - **الوقت النسبي بالعربية**: `الآن` / `قبل X د` / `قبل X ساعة` / `قبل X يوم`.
  - **نافذة التفاصيل الغنية**: z-200 بخلفية `rgba(0,0,0,0.82)` + blur؛ بطاقة حتى 420px وارتفاع 88vh قابلة للتمرير، خلفية `#0f0f0f`، `dir="rtl"`؛ رأس أيقونة+عنوان+✕؛ وسائط: `<video controls playsInline poster>` بحد 50vh أو صورة `contain` بحد 55vh على أسود؛ النص `richBody || body` بأسطر محفوظة؛ CTA اختياري عنبري `🔗 فتح الرابط` (خارجي) / `انتقال ◀` (داخلي)؛ تذييل الوقت النسبي؛ spring دخول scale 0.92→1.
- **الميزات والتفاعلات**: النقر على صف = تعليم كمقروء (تفاؤلياً مع إنقاص العداد) ← إن كان غنياً تُفتح نافذة التفاصيل، وإلا تنقّل عبر جدول `resolveNotificationUrl`: ‏`data.url` يتغلب دائماً؛ activity_started ← `/player/join?code={roomCode}`؛ new_activity ← `/player/games?activityId=…` (أو `/player/games`)؛ booking_confirmed ← `/player/home`؛ game_ended ← `/player/home`؛ feedback_survey ← `/player/feedback?sessionId=…` (أو `/player/feedback`)؛ custom ← `data.url`؛ روابط http(s) الخارجية بتبويب جديد. زر `قراءة الكل ✓` يعلّم الكل.
- **التصميم**: كما فُصِّل أعلاه.
- **API**: `GET /api/player-notifications` (Bearer) ← `{notifications[{id, title, body, type, data{url?, imageUrl?, videoUrl?, richBody?, roomCode?, activityId?, sessionId?}, isRead, createdAt}]}`؛ `PUT /api/player-notifications/{id}/read`؛ `PUT /api/player-notifications/read-all`.
- **Socket**: لا شيء (التحديث عبر polling 60s + رسائل FCM/SW).
- **مكافئ Flutter**: اللوحة المنسدلة المثبّتة لا تناسب الموبايل — نفّذها كـ bottom sheet أو route مخصص (أو `OverlayEntry` إن أُريدت المحاكاة)؛ الشارة عبر حزمة `badges` أو Stack؛ نافذة التفاصيل الغنية كـ dialog ملء الشاشة مع `video_player`/`chewie` (بدعم poster) و`CachedNetworkImage`؛ جدول الروابط العميقة يُعاد بناؤه على go_router (join/games/feedback/home) مع `url_launcher` للخارجي؛ الوقت النسبي بدوالّ عربية مطابقة للصيغ الأربع. **مخاطر**: الحفاظ على السقوف (30 عنصراً معروضاً، شارة 99+) وسلوك التعليم التفاؤلي.

---

# 4. تجربة اللعب داخل الجيم

هذا القسم يغطي قلب تطبيق اللاعب: المكوّن الأحادي `PlayerFlow.tsx` (3967 سطراً) وكل ما يتفرّع منه — رحلة الدخول والمصادقة، الشاشة داخل الجيم، التصويت، الفعل الليلي، العمدة، عروض المراحل `PlayerPhaseView`، طاولة الحلقة `PhoneSpectatorView`، نظام البطاقات `MafiaCard/DynamicMafiaCard`، معرض المافيا `MafiaTeamGallery`، موسوعة الأدوار `RolesInfoModal`، السينمائيات `NightAnimCinematic` وملحقاتها (`CircularTimer/PhaseHeader/PhaseLoading`)، والمفكرة `PlayerNotepad` التي تخفي شات المافيا السري.

**قرار معماري إلزامي في Flutter:** لا يُنقل `PlayerFlow` كـ widget واحد. يُقسَّم إلى: (1) `GameSessionController` (Riverpod/Bloc) يملك الـ socket والـ persistence وحلقة الـ polling، (2) شاشة واحدة بآلة حالات `Step` enum مطابقة 1:1 (`code, phone, login, register, change_password, ticket, auto_joining, done, rejoined`) مع `AnimatedSwitcher` (وليس Navigator — يجب أن تبقى مستمعات الـ socket حيّة عبر كل الخطوات)، (3) widgets عرض لكل مرحلة. المراحل: `LOBBY, ROLE_GENERATION, ROLE_BINDING, DAY_DISCUSSION, DAY_VOTING, DAY_JUSTIFICATION, DAY_TIEBREAKER, NIGHT, MORNING_RECAP, GAME_OVER` + مرحلة client-only اسمها `ELIMINATION_PENDING` (الـ poll يحوّل `DAY_ELIMINATION` القادمة من السيرفر إليها).

**لغة التصميم الموحّدة للقسم كله:** أسطح شبه سوداء `#050505 / #0a0a0a / #0c0c0c / #111`, أحمر دموي `#8A0303` (hover `#a00404`) مع توهّج `0 0 15px rgba(138,3,3,0.4)`, ذهبي عتيق `#C5A059` (+`#E8C97A`, `#D4AF37`, `#b38b47`), حدود `#2a2a2a/#333`, نص ثانوي `#888`, خط عربي **Amiri serif** للعناوين، **font-mono** (JetBrains Mono) للأرقام والملصقات الإنجليزية بأسلوب "spy dossier" (uppercase + tracking-widest)، كل الواجهة عربية RTL مع جزر LTR محددة. خلفيات: `display-bg blood-vignette` للغرف الفيزيائية، `#050505 remote-vignette` للغرف الريموت. بذرة الثيم في Flutter: surface `#050505/#111`، primary `#8A0303`، accent `#C5A059`، توهّج عبر `BoxShadow(color: Color(0x668A0303), blurRadius: 15)`، خطوط `google_fonts` (Amiri + JetBrains Mono)، والتطبيق كله داخل `Directionality(TextDirection.rtl)`.

---

### المحرّك الجلسي — منطق PlayerFlow والصمود (Resilience) (`src/components/PlayerFlow.tsx` + `src/hooks/useGameState.ts`)

- **الوظيفة والرحلة**: آلة الحالة الكاملة لتجربة اللاعب من إدخال كود الغرفة (أو QR deep-link `initialRoomCode`، أو دعوة push بـ `?invite=1&by=<inviterName>`) حتى نهاية الجيم. يضمن أن refresh أو فقدان socket أو تصغير التطبيق يعيد اللاعب لنفس نقطة اللعب بلا فقد.
- **الحالات والشاشات الفرعية**:
  - آلة `Step` التسع حالات؛ `done` = انضمام جديد، `rejoined` = استعادة جلسة (كلاهما يعرض شاشة اللعب).
  - منطق البداية: `initialRoomCode` + token محفوظ → `code` مؤقتاً (يستولي عليه effect البحث التلقائي)؛ `initialRoomCode` بلا token → `phone`؛ غير ذلك → `code`.
  - حالات غير مرئية تُدار هنا وتُرسم لاحقاً: `rejoinLoading` (تبدأ true)، `isExpelled + expulsionReason`، `seatChangeAlert`، `roleAlert`، `cardFlipped` (يُفرض true عند الموت)، `isPlayerDead`، حزمة الفعل الليلي (`nightActionRequired {actionType, availableTargets[], timeoutSeconds, canSkip, stepRole?, isDecoy?}` + countdown + submitted + selectedTarget)، `nurseActivationPending`، حزمة العمدة (`mayorPrompt`, `mayorPromptLeft`, `mayorBanner` 8 ثوانٍ, `mayorRevealedId`, `mayorWeight` افتراضي 2, `mayorSending`)، حزمة التصويت كاملة (مرآة localStorage)، `gameOverData {winner, players}`، `mafiaTeam[]` و`sibling` (أحادي الاتجاه: الأخ الأكبر يرى الأصغر فقط)، `assassinContracts`، مودالات (`isGalleryOpen`, `isNotepadOpen + notepadNotes`, `showInvite`, `rolesModalOpen`)، `switchConfirm + switchLoading`، حزمة الدعوة (`invitePrompt`, `inviteConfirmed`, `inviteError`)، حزمة الريموت (`isRemote`, `allowPlayerInvites`, `voiceMaps {videoByPid, audioByPid}`, `roster`)، `phasePollData {justificationData, withdrawalState, discussionState, winner, allPlayers, pendingResolution, round}`، `useActiveSpeaker → {confrontation, allowedPids}`، `requireTicket/ticketNumber`، حقول التسجيل، `avatarUrl/playerId/playerToken`, `apiError`.
- **الميزات والتفاعلات** (منطق الصمود — أهم شيء يُنقل حرفياً):
  - **rejoin عند الإقلاع**: ينتظر اتصال socket + `tokenChecked`؛ يتجاهل الجلسة لو `mafia_user_exited` أو لو `playerId` مختلف أو لو QR لغرفة أخرى؛ `room:rejoin-player {roomId, physicalId, phone?}` → ترطيب كامل (مقعد/اسم/دور/فريق/توأم/عقود/موت + استعادة حالة التصويت لو `DAY_VOTING`) → `rejoined`.
  - **فحص الـ token**: `GET /api/player-auth/me`؛ لو رجع `activeGame` بلا جلسة محلية يصطنع `mafia_session` (لتفادي race). token فاسد → مسح.
  - **إعادة الاتصال**: على `connect` أثناء اللعب يعيد `room:rejoin-player` (العضوية في rooms تضيع مع socket id جديد — بدونها لا تصل أي broadcasts).
  - **شبكة أمان بعد rejoin**: بعد 500ms طلب `room:get-my-state` واحد يستعيد: المرحلة، التصويت مع العدّاد المتبقي المحسوب من `votingStartTime/durationSeconds`، العقود، وإعادة فتح prompt الليل منتصف NIGHT (اشتقاق `actionType` من `autoNightStepRole`: SHERIFF→INVESTIGATE، DOCTOR/NURSE→PROTECT، SNIPER→SNIPE، WITCH→DISABLE، SILENCER لغير المنفّذ→DECOY، غير ذلك KILL؛ `isDecoy = physicalId !== autoNightPerformerId`؛ عدّاد `max(3, config.autoNightTime || 15)`).
  - **poll كل 3 ثوانٍ** (`room:get-my-state`): مزامنة ذاتية الشفاء لـ mafiaChatEnabled، المقعد (مع toast + اهتزاز عند التغيير)، الاسم، الدور (أول وصول → roleAlert + اهتزاز)، الحياة/الموت بالاتجاهين (إحياء في جيم جديد)، roster، المرحلة (مع حارس override)، حالة التصويت والمؤقت، isRemote/allowPlayerInvites، `phasePollData`، `votingPlayersInfo` (مع diff-check لتفادي re-renders).
  - **حارس المرحلة**: `phaseOverrideRef {phase, at}` بـ TTL = 6000ms — حدث socket يمنع poll قديم من إرجاع المرحلة للوراء لمدة 6 ثوانٍ، بعدها الـ poll يفوز (يشفي جهازاً فاته الحدث). عدم نقله = وميض/ارتداد مراحل.
  - **مزامنة الاستيقاظ**: `visibilitychange/focus/online` → poll فوري. في Flutter: `WidgetsBindingObserver(resumed)` + stream من `connectivity_plus`، مع إيقاف poll الـ 3 ثوانٍ في الخلفية وعند العودة: إعادة اتصال socket → `room:rejoin-player` → poll.
  - **المقعد المحجوز**: عند logout يُكتب `mafia_held_seat` بـ TTL عشر دقائق؛ العودة لشاشة `code` (ليس عبر QR وليس بعد خروج فوري) خلال المدة → بحث تلقائي عن الغرفة بعد 300ms.
  - **handleLogout**: كتابة held seat، `room:player-exit` (fire-and-forget)، مسح كل مفاتيح auth+voting، reset ~15 متغيراً، `mafia_user_exited='true'`؛ لو الدخول كان QR → توجيه `/player/home`.
  - **التصويت التلقائي عند الصفر**: لو `votingCountdown` وصل 0 واللاعب حي ولم يصوّت في DAY_VOTING: يصوّت لنفسه لو مرشح وإلا للمرشح index 0، مع `autoVote: true` — client-side ويجب نقله وإلا تعلّق الجولات لمستخدمي Flutter.
  - **نظافة الجولات**: على `LOBBY|ROLE_GENERATION|ROLE_BINDING` → مسح mafiaTeam/sibling/assignedRole/gameOverData/ملاحظات المفكرة (`mafia_notes_{roomId}_{physicalId}`)؛ على `GAME_OVER` → مسح التصويت + الفريق + الملاحظات لكن **يبقى** الدور وحالة الموت؛ reset كامل فقط على `game:started`.
  - **قاعدة تعيين الدور**: على `player:role-assigned` البطاقة تعود مقلوبة على الوجه، roleAlert يشتغل، علم الموت يُمسح، و**mafiaTeam/sibling يُستبدلان دائماً** (حتى بمصفوفة فارغة/null — يمنع تسريب فريق جيم سابق للأخ الأصغر قبل التحوّل).
  - حالات حافّة: تبديل حساب على نفس الجهاز، QR لغرفة مختلفة عن الجلسة، QR أثناء غرفة نشطة أخرى → مودال تبديل مع freeze، الدعوة لا تنضم صامتة أبداً، `room:find-by-code` قد يرجع `{success:false}` بلا rejection، حراسة سباق الـ toasts بمطابقة النص، أخطاء poll تُبتلع، فشل rejoin يمسح الجلسة الفاسدة.
- **التصميم**: منطق فقط (الثيم أعلاه). يضاف `in-game` على body لمنع pull-to-refresh (غير مطلوب في Flutter).
- **API**:
  - `GET /api/player-auth/me` (Bearer) → `player {id, name, phone, gender, mustChangePassword, avatarUrl}` + `activeGame {roomId, roomCode, physicalId, gameName?, role?, isAlive?}`.
  - `POST /api/player/lookup {phone}` → `found, player`.
  - `POST /api/player-auth/login {phone, password}` → `token, player`.
  - `POST /api/player-auth/register {phone, password, name, gender, dob}` → `token, player.id`.
  - `POST /api/player-auth/change-password {oldPassword, newPassword}` (Bearer) → `token?` (قد يُدوَّر).
- **Socket** — كل emit عبر wrapper بـ **ack + timeout 15 ثانية** (نجاح فقط عند `response.success===true`، الرفض يحمل `response.code / requiresConfirmation`):
  - **Emits**: `room:rejoin-player`, `room:find-by-code`, `room:auto-join` (لا يرسل preferredSeat أبداً — المقعد عشوائي بالتصميم)، `room:get-my-state`, `room:player-exit`, `room:freeze-player`, `player:cast-vote` (auto)، `day:mayor-decision`.
  - **Listeners**: `connect`, `player:seat-changed`, `player:kicked-self`, `room:config-updated`, `game:penalty-recorded`, `player:penalty-ejected`, `player:role-assigned`, `mafia:team-updated`, `assassin:contracts-update`, `game:started`, `game:state-sync`, `day:mayor-window`, `day:mayor-window-closed`, `day:mayor-revealed`, `day:voting-started`, `day:vote-update`, `day:voting-complete`, `game:phase-changed`, `day:justification-started`, `day:elimination-pending`, `game:over`, `game:closed`, `game:room-deleted`, `game:kicked`, `event:closed`, `night:action-required`, `nurse:activation-request`.
  - مستمعات `useGameState` الداخلية (للتكافؤ): `room:player-joined`, `day:vote-update`, `game:phase-changed`, `day:elimination`, `game:over`, `day:justification-started`, `day:elimination-pending`, `day:deal-created/removed`؛ وemits: `room:create`, `room:auto-join`, `game:get-state`.
- **مكافئ Flutter**: `socket_io_client` (مطابقة إصدار socket.io الرئيسي للسيرفر؛ `emitWithAck(...).timeout(15s)`؛ نمذجة الرفض كـ typed exceptions بدل مطابقة نصوص مثل "التذكرة")، `shared_preferences`/`hive` بنفس أسماء مفاتيح `mafia_*` وأشكال JSON (`mafia_player_token`, `mafia_player_auth`, `mafia_player_info`, `mafia_playerId`, `mafia_session`, `mafia_user_exited`, `mafia_held_seat`, `mafia_mafiaTeam`, `mafia_sibling`, `mafia_gamePhase`, `mafia_votingCandidates`, `mafia_votingPlayersInfo`, `mafia_myVote`, `mafia_playerVotes`, `mafia_lastVoteTime`, `mafia_notes_{roomId}_{physicalId}`)، قراءة التخزين **قبل أول frame** (في `main()`/splash) لتقليد lazy initializers بلا وميض، حزمة `vibration` للأنماط (`role [100,50,200,50,300]`, `seat [200,100,200]`, `penalty-self [300,100,300,100,500]`, `penalty-eject [500,200,500,200,500]`, `mayor [120,80,120,80,240]`, `vote-start [100,200]`, `game-start 200`, `warn [100,100]`) مع degrade على iOS، `wakelock_plus` أثناء `done/rejoined`، `app_links/go_router` للـ deep links (QR + دعوة)، `dio/http` للـ REST. تطبيع الهاتف الأردني (بادئة `0`) يبقى حرفياً. **مخاطر**: عدم نقل حارس المرحلة/إعادة rejoin بعد reconnect/الـ auto-vote = أعطال لعب حقيقية؛ bug ويب معروف لا يُنقل: مستمعا `night:action-required`/`nurse:activation-request` مسجّلان بلا cleanup (تسريب) — في Flutter ألغِ كل subscription في `dispose`؛ إغلاق الـ toast محروس بهوية الرسالة (نفّذه بـ sequence token).

---

### شاشات الدخول والمصادقة (خطوات `code → phone → login/register → change_password → ticket → auto_joining`)

- **الوظيفة والرحلة**: قمع دخول اللاعب: كود 4 أرقام → هاتف → دخول أو تسجيل → (تغيير كلمة مرور إجباري للحسابات المهاجرة) → (تذكرة إن لزم) → تخصيص مقعد تلقائي.
- **الحالات والشاشات الفرعية** (كلها داخل `AnimatePresence mode="wait"` بانتقالات fade، مع header "MAFIA CLUB" + شعار `/mafia_logo.png` 60–80px يُخفى في الريموت، وبطاقة رئيسية `max-w-md bg-black/50` بخط أحمر متدرج علوي):
  - **code**: أيقونة قفل ذهبية (`OperationIcon` SVG)، عنوان «الانضمام للعملية»، sub `INPUT SECURE OPERATION CODE`؛ حقل numeric أرقام فقط بحد 4 (`placeholder ----`، mono 4xl، `tracking-[0.4em]`، autoFocus)؛ شريط خطأ أحمر mono؛ زر `btn-premium` بعنوان `ESTABLISH LINK` أو `CONNECTING...` (معطّل حتى 4 أرقام + اتصال socket) → `handleFindRoom`.
  - **phone**: أيقونة هاتف؛ العنوان = `gameName || 'عملية جارية'`؛ sub `AGENT IDENTIFICATION`. حالات فرعية: deep-link قيد الحل → `LOCATING COMPONENT...` نابض؛ خطأ deep-link → apiError أحمر. النموذج: chip ثابت `+962` + حقل tel (أرقام فقط، حد 10، placeholder `7XXXXXXXX`)؛ زر `VERIFY IDENTITY` معطّل تحت 9 أرقام.
  - **register**: «هوية جديدة» / `NEW DOSSIER REGISTRATION`: الاسم المستعار (حد 20)، تاريخ الميلاد 3 قوائم `<select>` يوم/شهر/سنة (السنة من currentYear−8 رجوعاً 50 سنة — حد أدنى عمر 8)، الجنس زرّا toggle «♂ ذكر» (أزرق) / «♀ أنثى» (بنفسجي)، كلمة مرور (≥4، mono موسّط)؛ زر `SUBMIT DOSSIER` معطّل بلا اسم أو كلمة <4.
  - **login**: «مرحباً {displayName}» / `ENTER ACCESS CODE`؛ حقل كلمة مرور 2xl `tracking-[0.3em]`، Enter يرسل؛ زر `ACCESS GRANTED`.
  - **change_password**: «تغيير كلمة المرور» / `UPDATE YOUR ACCESS CODE` + ملاحظة «كلمة المرور الحالية مؤقتة»؛ حقل جديد ≥4؛ زر `UPDATE CODE`.
  - **ticket**: أيقونة تذكرة SVG، «مرحباً {displayName}» + «أدخل رقم التذكرة للدخول»؛ حقل `dir="ltr"` mono 2xl؛ زر «🎫 تحقق وادخل» أخضر متدرج `#166534→#15803d` بتوهّج مزدوج عند التفعيل / رمادي `#222` معطّل، وأثناء التحميل «جارٍ التحقق...».
  - **auto_joining**: spinner ذهبي 64px + «جاري تخصيص مقعدك...» + «يتم اختيار أفضل مقعد لك» + apiError إن وجد.
- **الميزات والتفاعلات**: كل مسارات `handleFindRoom/handlePhoneLookup/handleLogin/handleRegister/handleChangePassword/tryRejoinCurrentRoom` (3 مراحل: rejoin بالهاتف → `me` مع activeGame → انضمام جديد) و`handleAutoJoin` بمعالجات الأخطاء: `PENDING_SURVEYS` → رسالة + توجيه `/player/feedback` بعد 1.5 ثانية؛ خطأ تذكرة → رجوع لخطوة `ticket`؛ `requiresConfirmation` → مودال تأكيد الانتقال؛ login يمسح `mafia_session` العائدة للاعب مختلف؛ register يبني DOB بصيغة `YYYY-MM-DD`.
- **التصميم**: كما في اللغة العامة؛ عنوان "MAFIA" ذهبي 4xl/5xl Amiri بظل أحمر، وحروف "CLUB" مفروقة أفقياً `dir="ltr"` بلون `#8A0303`؛ دخول العنوان fade+rise بمدة 1.2s ease `[0.16,1,0.3,1]` والشعار scale-in بتأخير 0.3s.
- **API**: نفس نقاط auth الخمس أعلاه.
- **Socket**: `room:find-by-code`, `room:auto-join`, `room:rejoin-player`, `room:freeze-player`.
- **مكافئ Flutter**: `TextField` بـ `inputFormatters` (digitsOnly + LengthLimiting)، `CupertinoPicker/DropdownButtonFormField` بدل selects تاريخ الميلاد (نفس نطاق السنين)، `TextInputAction.done/onSubmitted` لسلوك Enter، انتقالات الخطوات بـ `PageTransitionSwitcher/AnimatedSwitcher`. خطر: جزر LTR (حقل التذكرة، `+962`، حروف CLUB) تحتاج `Directionality.ltr` صريحة.

---

### الشاشة الرئيسية داخل الجيم (step `done` / `rejoined`)

- **الوظيفة والرحلة**: مركز اللاعب أثناء الجيم: بانر المقعد، شريط أدوات، كشف البطاقة، حالات الانتظار، ومنه تُركّب كل شاشات المراحل والريموت.
- **الحالات والشاشات الفرعية**:
  - **بانر المقعد** (غير الريموت وبوجود `physicalId`): بطاقة spring-in بتدرّج ذهبي `linear-gradient(135deg, rgba(197,160,89,0.15), rgba(197,160,89,0.03))`، حد ذهبي 2px، «🪑 مقعدك رقم» + الرقم 5xl ذهبي Amiri متوهّج + «يرجى الجلوس في مقعدك».
  - **شريط الأدوات**: «🃏 الأدوار» (يفتح RolesInfoModal) — «مقعدك #{pid}» (ريموت فقط) — «🚪 خروج» chip أحمر → `handleLogout`.
  - **Debug bar** (غير الريموت): mono `P:{phase} | C:{candidates} | R:{role} | S:{step} | v3.0` (وفي rejoined النسخة `v4.0`).
  - **حزمة الريموت** (`isRemote` فقط): `PhoneSpectatorView` عندما المرحلة ∉ {LOBBY, ROLE_GENERATION, ROLE_BINDING} (مع `collapsed` أثناء DAY_VOTING و`winnerReveal=gameOverData`)؛ `RemoteVoice` بـ **key ثابت `"remote-voice"`** (يمنع remount وانقطاع الصوت عند تغيّر المرحلة؛ `shouldOpenMic = voiceAllowedPids.includes(myPid) && !isPlayerDead`)؛ زر «📨 دعوة صديق للغرفة» (لو `allowPlayerInvites`) يفتح `InviteModal`؛ `ConfrontationControls`.
  - **`PlayerPhaseView`** يُرسم عندما توجد مرحلة وليست DAY_VOTING/LOBBY.
  - **حالة الانتظار** (لا مرحلة/LOBBY/ROLE_* والدور null): بانر عقوبات لو `penalties>0` («ACTIVE RULE VIOLATIONS» + صف نقاط `maxPenalties` + «تحذير: (p/max) عقوبات. سيتم طردك عند تجاوز الحد.»)؛ لوبي ريموت → `PhoneSpectatorView(lobby)` + `RoomCodeCard` + شريط تقدّم ذهبي `roster/maxPlayers` + «انضمّ n من max»؛ صالة فيزيائية → `ShieldCheckIcon` نابض (opacity 0.5↔1، 3s)، «اكتمل التشفير» 3xl ذهبي، `MafiaCard` غطاء فقط (role=null، غير قابلة للقلب)، ثم mono «SECURE YOUR DEVICE. DIRECT ATTENTION TO PRIMARY MONITOR.» + «STATUS ACTIVE. INTERFACE LOCKED.».
  - **حالة الدور المعيّن**: scale-in 0.8→1؛ «تم تعيين مهمتك» + `TAP CARD TO REVEAL YOUR IDENTITY`؛ `MafiaCard` قابلة للقلب بمدة **1100ms**؛ بعد القلب تحذير أحمر نابض «⚠️ أخفِ هاتفك الآن!» وقبله «اضغط البطاقة لكشف دورك» (تبديل AnimatePresence). القلب لصيق أحادي الاتجاه (لا يُخفى بضغطة ثانية).
  - **حالات rejoined الإضافية**: ميت → «تم إقصاؤك» (`#555`) / `AGENT ELIMINATED — IDENTITY EXPOSED`، بطاقة مقلوبة قسراً `grayscale opacity-70` + «☠️ STATUS: ELIMINATED»؛ حي بدور → «مرحباً بعودتك» + بطاقة قابلة للقلب؛ حي بلا دور → بانر العقوبات + كتلة اللوبي أو بطاقة الغطاء + `AWAIT ROLE ASSIGNMENT`.
- **الميزات والتفاعلات**: قواعد الإظهار الشرطي: header/بانر المقعد/debug → غير الريموت فقط؛ الطاولة/الصوت/الدعوة/المواجهة → ريموت فقط؛ FAB المعرض يتطلب دوراً معيّناً + ليست GAME_OVER؛ FAB المفكرة يتطلب `done/rejoined`.
- **التصميم**: كما اللغة العامة؛ التحذير بعد القلب `animate-pulse` أحمر.
- **API**: لا HTTP مباشر هنا.
- **Socket**: يستهلك حالة المستمعات المركزية؛ يُمرَّر `on/emit` نزولاً إلى `PhoneSpectatorView/PlayerPhaseView/RemoteVoice`.
- **مكافئ Flutter**: `done` و`rejoined` متطابقان ~90% — يُبنيان كـ widget واحد ببارامتر `isRejoined` مع الحفاظ على **فروق سلوك التصويت** أدناه حرفياً (والتأكيد مع الـ backend أي قاعدة هي الرسمية قبل أي توحيد). جلسة الصوت (Cloudflare RealtimeKit) تعيش في service/provider طويل العمر **خارج** شجرة المراحل (نفس فخ الـ key الثابت). بطاقة ميتة: `ColorFiltered` grayscale + opacity.

---

### مرحلة التصويت DAY_VOTING (الاقتراع بنسختيه)

- **الوظيفة والرحلة**: اقتراع اللاعب الحي: اختيار مرشح، رؤية الأصوات العلنية live، عدّاد تنازلي، وإتمام/إغلاق التصويت.
- **الحالات والشاشات الفرعية**:
  - **تحميل**: `PhaseLoading(🗳️ "جاري تحميل التصويت...")` في done؛ وفي rejoined كتلة inline (🗳️ + spinner 32px + نص).
  - **رأس الاقتراع**: 🗳️ 3xl، «مرحلة التصويت» 2xl ذهبي Amiri، سطر حالة، عدّاد كبير «⏱ {n}ث» 3xl mono — أحمر + `animate-pulse` عند ≤10 وإلا ذهبي (تبديل `key` يفرض remount + `translateZ(0)`)؛ شريط تقدّم (نسخة done: «{totalVotesCast} صوت» / «{maxVotes} أعلى»، امتلاء = votes/candidates؛ نسخة rejoined: `VOTES: {n}` / `✅ COMPLETE | ⏳ IN PROGRESS`، امتلاء = totalVotesCast/votingPlayersInfo.length، نهاية التدرج `#D4AF37`)؛ عند `votingComplete` → «✓ اكتمل التصويت — بانتظار الليدر».
  - **بطاقة المرشح** (grid عمود واحد، `max-h-[55vh]` scroll): مختارة → حد ذهبي + تدرج `#C5A059/15→/5` + توهّج؛ غير مختارة → `border-[#222] bg-[#111]`. أفاتار دائري 72px (أو `#{pid}` ذهبي mono)، overlay اختيار = دائرة ذهبية مموّهة + ✅ 3xl؛ pill «مقعد #{pid}»؛ الاسم أبيض xl bold؛ **emoji الاشتباه من المفكرة** بجانب الاسم (safe→🟢، suspect→🟡، وإلا 🔴)؛ **شارة DEAL** لو `type==='DEAL'`: صندوق أحمر «🤝 ديل من:» + اسم المبادر + `#{initiatorPhysicalId}`؛ pill «{votes} صوت»؛ **صف رقائق المصوّتين** (كل من صوّت لهذا المرشح: pill أحمر برقم واسم مقصوص)؛ شارة «أنت» رمادية لو البطاقة نفسك.
- **الميزات والتفاعلات**:
  - **نسخة done — نافذة تغيير 10 ثوانٍ**: `voteWindowOpen = lastVoteTime && (now − lastVoteTime) < 10000`؛ `canVote = (myVote===null || voteWindowOpen) && (votingCountdown===null || >0)`. نصوص الحالة: عدّاد كهرماني «يمكنك تغيير تصويتك خلال {s} ثانية» → أخضر «✅ تم التصويت (مغلق)» → أحمر «❌ لم تقم بالتصويت» لو انتهى الوقت بلا تصويت. نجاح الإرسال يعيد فتح النافذة (`lastVoteTime = now`).
  - **نسخة rejoined**: تغيير حر حتى `votingComplete` («✅ تم التصويت — اضغط لاعب آخر للتغيير»)، ولا تحديث لـ `lastVoteTime`.
  - حرّاس الضغط (رجوع صامت): ميت / نفس الاختيار الحالي / `voteSubmitting` / `!canVote` (أو `votingComplete`) / **نفسك** (ممنوع التصويت للنفس).
  - على نجاح ack: تحديث `myVote` + `navigator.vibrate(100)`. استعادة صوتي عند reconnect من `playerVotes[myPid]`. `whileTap scale 0.95` فقط عند القابلية، `disabled={isPlayerDead}`.
  - الشفافية: الأصوات علنية للجميع (خريطة `playerVotes` pid→candidateIndex).
- **التصميم**: كما أعلاه؛ العدّاد الأحمر النابض تحت 10 ثوانٍ.
- **API**: لا شيء.
- **Socket**: emit `player:cast-vote {roomId, physicalId, candidateIndex}` (يدوي) و+`autoVote:true` (تلقائي)؛ يستهلك `day:voting-started` / `day:vote-update` / `day:voting-complete`.
- **مكافئ Flutter**: `ListView` بسيط (≤27 مرشحاً)؛ ticker ثانية واحدة لحساب النافذة؛ ack-gated UI بلا optimistic updates؛ `HapticFeedback`/`vibration` 100ms.

---

### شاشة الفعل الليلي (Auto-Night fullscreen) + prompt الممرضة

- **الوظيفة والرحلة**: استيلاء كامل على الشاشة عند دور اللاعب ليلاً (حقيقي أو **decoy** تمويهي — كي لا يكشف الناظر للشاشات من يملك دوراً)؛ اختيار هدف واحد خلال مهلة، ثم شاشة "تم الإرسال".
- **الحالات والشاشات الفرعية**:
  - **الشاشة** (`z-[200]`, تدرج `#0a0812 → #070510 → #000`, صنف `safe-area-inset`): رأس 🌙 4xl نابض (scale 1↔1.1، 3s) + mono «مرحلة الليل» + عنوان الدور من `stepRole` (MAFIA→المافيا، GODFATHER→العراب، SILENCER→المُسكت، SHERIFF→المحقق، DOCTOR→الطبيب، NURSE→الممرضة، SNIPER→القناص، CHAMELEON→الحرباء، وإلا الخام/«مجهول»)؛ التعليمة حسب `actionType`: KILL «اختر هدف الاغتيال»، INVESTIGATE «من تريد التحقيق معه؟»، PROTECT «من تريد حمايته الليلة؟»، SNIPE «اختر هدف القنص»، SILENCE «من تريد إسكاته؟»، DISABLE «اختر لاعباً لتعطيل قدرته»، DECOY «اختر أي شخص»، ولو `isDecoy` → «اختر أي شخص للتمويه...».
  - **عدّاد SVG دائري**: 64px، viewBox 36، r=15.5، `-rotate-90`، مسار `#1a1a2e`؛ `strokeDasharray = (countdown / (timeoutSeconds||15)) * 97.4`؛ الألوان: ≤5s أحمر `#ef4444`، ≤10s كهرماني `#f59e0b`، وإلا ذهبي؛ transitions 0.5s/0.3s؛ الرقم موسّط ينبض أحمر عند ≤5.
  - **قائمة الأهداف**: صفوف أزرار (fade+rise) RTL: أفاتار 44px (مع avatarUrl: صورة grayscale + طبقة سوداء تُظهر `#{pid}` أبيض؛ بدونها: `#{pid}` ذهبي)، اسم أبيض bold (fallback «لاعب #{pid}»)؛ حد `#2a2a2a`، hover ذهبي، **active أحمر** (`#8A0303/20`).
  - **تخطي** (فقط `canSkip && !isDecoy`): «تخطي هذه الخطوة ←» رمادي mono (الـ decoy يجب أن يختار أحداً للتمويه).
  - **overlay الإرسال**: black/90، ✅ 6xl نابض (scale 1↔1.2)، «تم الإرسال» + `WAITING FOR RESULTS...`، يُغلق تلقائياً بعد 1500ms.
  - **انتهاء المهلة**: السيرفر يختار عشوائياً؛ العميل يعرض "submitted" بعد ثانيتين ويغلق بعد 1.5 ثانية.
  - **prompt الممرضة** (`nurseActivationPending`): fullscreen `z-[200] bg-black/95`؛ بطاقة `#111` بحد ذهبي/30؛ 🏥 5xl؛ «الممرضة» 2xl ذهبي؛ «الطبيب غير متاح هذه الليلة. هل تريدين تفعيل صلاحية الحماية؟» (خطاب مؤنث)؛ زرّا «لا، تخطي» (رمادي) / «نعم، أريد الحماية» (تدرج ذهبي `#C5A059→#b38b47` نص أسود).
- **الميزات والتفاعلات**: إرسال أحادي (`nightActionSubmitted` + `clearInterval` فوراً عند الضغط)؛ التخطي يرسل `targetPhysicalId: null`؛ **الـ decoy يجب أن يكون مطابقاً بكسلياً للحقيقي** (anti-cheat).
- **التصميم**: كما موصوف؛ الشاشة تغطي كل شيء ولا شيء فوقها إلا مودال تبديل الغرفة (z-300).
- **API**: لا شيء.
- **Socket**: on `night:action-required {actionType, availableTargets, timeoutSeconds, canSkip}` وon `nurse:activation-request {message}`؛ emit `player:night-action {roomId, actionType, targetPhysicalId|null}` وemit `nurse:activation-response {roomId, activate}`.
- **مكافئ Flutter**: `CustomPaint` قوس أو `CircularProgressIndicator(value:)` بعتبات الألوان؛ wake lock فعّال هنا حتماً؛ الحفاظ على أحادية الإرسال وتطابق decoy.

---

### العمدة (العمدة — prompt القرار + بانر الكشف + الشارة الدائمة)

- **الوظيفة والرحلة**: نافذة قرار العمدة بعد التصويت (على هاتف العمدة فقط، في الريموت): تمرير الإعدام أو كشف نفسه لإلغائه، مع بثّ الكشف للجميع وصوته ×2 لاحقاً.
- **الحالات والشاشات الفرعية**:
  - **مودال القرار** (`mayorPrompt`, `z-[85]`, `bg-black/90 backdrop-blur-md`, `dir="rtl"`): بطاقة بحد ذهبي 2px وتدرج `linear-gradient(170deg,#1d160c,#0f0b06)`؛ 🎩 4xl؛ «أنت العمدة — لحظة القرار»؛ سطر نتيجة التصويت: `winner.type==='DEAL'` → «صفقة #{initiator} ← #{target}» وإلا «#{id} {name}»، + «({topVotes} أصوات)» بـ `#ff6b64`؛ سطر «⏳ {mayorPromptLeft} ثانية — وبعدها يحسم الموجّه» (العدّاد إرشادي فقط — انتهاؤه لا يقرر شيئاً)؛ 3 أزرار مكدّسة معطّلة أثناء `mayorSending`: **REVOTE** أزرق `#3b6fd4→#2b4f9e` «🔄 أكشف نفسي — إلغاء الإعدام وتصويت جديد على الجميع»؛ **POSTPONE** بنفسجي `#7a4b8f→#5b3570` «🌙 أكشف نفسي — تأجيل: لا موت اليوم»؛ **PASS** outlined «🤐 أبقى مخفيّاً — نفّذوا الإعدام»؛ تذييل «الكشف دائم للجميع + صوتك ×{voteWeight||2} فوراً + القدرة تُستهلك (مرّة واحدة)».
  - **بانر الكشف** (`mayorBanner`, للجميع, `top-4 z-[84]`, ينزلق y:-30→0, 8 ثوانٍ): «🎩 العمدة يكشف نفسه: #{id} {name}» + نص القرار (REVOTE → «أُلغي الإعدام — تصويت جديد على الجميع»، وإلا «أُلغي الإعدام — لا موت اليوم») + «• صوته يُحسب ⚖️×{weight||2}».
  - **الشارة الدائمة** (`DAY_VOTING && mayorRevealedId !== null && !mayorBanner`): pill علوية `z-[40]` بحجم `text-[10px]`؛ للعمدة نفسه «⚖️ أنت العمدة — صوتك يُحسب ×{w}» وللآخرين «🎩 العمدة #{id} — صوته ×{w}».
- **الميزات والتفاعلات**: `sendMayorDecision('PASS'|'REVOTE'|'POSTPONE')` بحارس `mayorSending` ضد الضغط المزدوج؛ الأخطاء تُبتلع صمتاً (الليدر ينفّذ يدوياً)؛ فتح الـ prompt فقط لو `forMayor` مع اهتزاز `[120,80,120,80,240]`.
- **التصميم**: ذهبي/أسود بأسلوب البطاقة الملكية أعلاه.
- **API**: لا شيء.
- **Socket**: on `day:mayor-window {forMayor, timeoutSeconds?}` / `day:mayor-window-closed` / `day:mayor-revealed {physicalId, name, decision, voteWeight?}`؛ emit `day:mayor-decision {roomId, decision}`.
- **مكافئ Flutter**: مودال + بانر + شارة كطبقات `Stack` بترتيب z الموصوف؛ عدّاد إرشادي بـ `Timer.periodic`.

---

### الطبقات العلوية والمودالات العامة (Toast/العقوبات/التأكيدات/الطرد/الاستعادة/تبديل الغرفة/تنبيه الدور)

- **الوظيفة والرحلة**: كل الإشعارات والاعتراضات فوق شاشة اللعب.
- **الحالات والشاشات الفرعية** (كل واحدة تُنقل كطبقة مستقلة):
  1. **Toast** (`activeToast`, z-50, أعلى الشاشة): spring دخول `{y:-50, scale:0.9}` (damping 15, stiffness 200)؛ بطاقة `rounded-xl backdrop-blur-md` ملوّنة حسب النوع: penalty أحمر 🔴 / warning كهرماني ⚠️ / success أخضر ✅ / info رمادي بحد ذهبي ℹ️؛ نص Amiri bold `text-right`؛ زر ✕؛ إغلاق تلقائي (5s تغيير مقعد، 6s عقوبة) محروس بهوية الرسالة.
  2. **مودال العقوبة** (`penaltyAlert`): بطاقة `#111` بحد أحمر، شريط أحمر نابض علوي 3px، ⚠️ 4xl يقفز، «تنبيه مخالفة القوانين!»، الرسالة، صف نقاط `maxPenalties` (الممتلئة `bg-red-600` بتوهّج `0 0 8px #dc2626`)، `PENALTIES: n / m` mono، زر «فهمت وتعهدت بالالتزام» أحمر بعرض كامل.
  3. **تأكيد الانتقال** (`joinConfirmation`): «تأكيد الانتقال» ذهبي + رسالة السيرفر + «إلغاء» (outline رمادي) / «موافق، انتقل» (`#8A0303` → `handleJoinGame(true)` force).
  4. **دعوة الانضمام** (`invitePrompt`, `z-[60]`, ثيم سماوي `border-sky-500/40`): 📨 4xl، «دعوة للانضمام»، «هل تريد الانضمام إلى غرفة "{roomName}"؟» + «دعاك {inviterName}» (ذهبي)؛ «ليس الآن» → `/player/home`؛ «انضمام» (sky-600).
  5. **خطأ الدعوة** (`inviteError`): 🚪 + النص + «العودة للرئيسية».
  6. **شاشة الطرد** (`isExpelled`, تستبدل الواجهة كلها): بطاقة `#1a0505/85` بحد أحمر، دائرتان حمراوان مموّهتان نابضتان بالزوايا، دائرة 80px بمثلث تحذير SVG وهالة `animate-ping`، «تم استبعادك من اللعبة!» 3xl، صندوق `REASON FOR EXPULSION` + السبب (أو النص الافتراضي عن تجاوز العقوبات)، ملاحظة مسح الجلسة وخصم RR، زر «العودة للشاشة الرئيسية» (تدرج أحمر) → يعيد لخطوة `phone` أو `code`.
  7. **استعادة الجلسة** (`rejoinLoading`, z-50 أسود صلب): `ShieldCheckIcon` يدور 360° (2s linear) + `RESTORING SESSION...`.
  8. **toast تغيير المقعد** (`seatChangeAlert`): شريط علوي ذهبي صلب `#C5A059` بنص أسود Amiri «تم تغيير رقمك: X ← Y»، ينزلق من الأعلى، يختفي بعد 5 ثوانٍ.
  9. **تنبيه وصول الدور** (`roleAlert && !cardFlipped && assignedRole`, أسفل, `z-[200]`): بطاقة بحد ذهبي 2px وتدرج `#1a1508→#0d0a02` و`blur(20px)` و**box-shadow نابض** (15→25px، 1.5s loop)؛ 🎴 4xl يدور على محور Y (0→180→360، 2s)؛ «تم تعيين دورك!» + «اقلب البطاقة لمعرفة هويتك السرية» + خط ذهبي متدرج نابض + `TAP CARD TO REVEAL · TAP HERE TO DISMISS`؛ الضغط في أي مكان يغلقه، والقلب يمسحه تلقائياً.
  10. **مودال تبديل الغرفة** (`switchConfirm`, `z-[300]`, blur 8px): 🔄 5xl، «تبديل الغرفة»، الغرفة الحالية في صندوق أحمر ↓ سهم ذهبي ↓ الغرفة الجديدة في صندوق أخضر، ملاحظة «سيتم تجميد مشاركتك في الغرفة الحالية ويمكنك العودة إليها لاحقاً»؛ «ابقَ هنا» → rejoin صامت للغرفة الحالية (`physicalId: 0` + هاتف مطبَّع، مع استعادة حالة الموت وقلب البطاقة) / «انتقل للغرفة» (ذهبي، «⏳ جارٍ...» أثناء `switchLoading`).
- **الميزات والتفاعلات**: أنماط الاهتزاز لكل حدث (مذكورة في المحرّك)؛ `game:penalty-recorded` لي → مودال + toast + اهتزاز، لغيري → toast تحذير فقط؛ `player:penalty-ejected` → موت + قلب بطاقة + مودال.
- **التصميم**: كما موصوف لكل طبقة.
- **API**: لا شيء.
- **Socket**: كما في جدول مستمعات المحرّك.
- **مكافئ Flutter**: `Stack` جذري بترتيب صريح: شارة العمدة (40) < بانر العمدة (84) < prompt العمدة (85) < FABs (90) < toast/العقوبات (50) < تنبيه الدور وشاشة الليل (200) < مودال التبديل (300). الأنيميشن بـ `flutter_animate` + `AnimationController` متكرر للتوهّج النابض.

---

### PlayerPhaseView — أجسام المراحل (`src/components/PlayerPhaseView.tsx`)

- **الوظيفة والرحلة**: الجسم المتبدّل حسب `gamePhase` داخل شاشة اللعب؛ يعرض النقاش والديلات، التبرير وسحب الأصوات، التعادل، الإقصاء، الليل، الصباح، ونهاية الجيم. يرجع `null` لأي مرحلة أخرى (الأب يتكفّل بها).
- **الحالات والشاشات الفرعية**:
  1. **ROLE_GENERATION**: ⚙️ + حلقة دوّارة ذهبية 10×10 + «جاري تجهيز الأدوار» + «يُرجى الانتظار...».
  2. **ROLE_BINDING**: 🎴 يتقلّب باستمرار (`rotateY [0,180,360]` 2s infinite) + «جاري توزيع الأدوار».
  3. **DAY_DISCUSSION**: رأس 🎤 «مرحلة النقاش» (يُخفى في الريموت)؛ **بانر دوري** عند `currentSpeakerId === myId`: بطاقة ذهبية متوهّجة، أيقونة نابضة 🎙️ (أو 🔇 عند انتهاء الوقت)، «دورك في النقاش!» / «تحدّث الآن أمام الجميع»، وعند الصفر أثناء SPEAKING: «انتهى وقتك!» / «يُرجى التوقف عن الكلام»؛ **بطاقة المتحدث الحالي** (keyed لإعادة الأنيميشن، تمييز أقوى لو أنا)؛ **عدّاد SVG دائري** (r=15.5، ألوان ذهبي/كهرماني ≤10/أحمر ≤5) + 🎙️/🔇؛ حالة فارغة «بانتظار بدء النقاش...»؛ **قسم الديلات** (للأحياء فقط): زر «🤝 الاتفاقيات {n}/3» يفتح **bottom sheet** (`max-h 82%`, scrim يغلق) بحالاته: (أ) قفل الجولة الأولى «🔒 الاتفاقيات غير متاحة في الجولة الأولى...»، (ب) لديّ اتفاقية → بطاقة خضراء «🤝 تم إبرام اتفاقيتك بنجاح!» + اسم الشريك + زر إلغاء أحمر («جاري الإلغاء...» أثناء `dealRemoving`) + تحذير المخاطرة «⚠️ ...إن أُقصي شريكك وكان مواطناً فسيتم إقصاؤك معه تلقائياً!»، (ج) الحد الأقصى «🔒 (3/3)»، (د) نموذج الإنشاء: select يستثني نفسي ويعطّل المستهدَفين بلاحقة «(مستهدف 🔒)» + زر «🤝 إبرام اتفاقية» ذهبي + pill خطأ «❌ {dealError}»؛ **قائمة ترتيب النقاش**: الحالي (ذهبي + ● نابضة)، المنتهي (شطب + ✓ خضراء)، أنا («(أنت)»).
  4. **DAY_JUSTIFICATION**: نسخة ريموت = شريط واحد «⚖️ يُدافع الآن: {name} — يمكنك سحب صوتك بعد انتهاء الدفاع»؛ النسخة المحلية: رأس ⚖️ «مرحلة التبرير» + بطاقات المتهمين (حمراء، أفاتار، «{topVotes} صوت ضده»، «🎙️ يبرر الآن...» لو `canJustify`) + pill مؤقت «⏱ {s}s» (أحمر نابض ≤10)؛ **بطاقة السحب** (تظهر عندما `(withdrawalActive || justTimer===0 || timerFinished) && iVotedForAccused && !isPlayerDead`): «أنت صوّتت على هذا اللاعب» + «هل تريد سحب صوتك؟ إذا سحب أكثر من النصف تُعاد عملية التصويت» + «{count}/{needed} سحبوا أصواتهم» + زر «🗳️ سحب صوتي» → بعد النجاح «✓ تم سحب صوتك».
  5. **DAY_TIEBREAKER**: ⚖️ 4xl «تعادل في الأصوات» + رقائق المتعادلين (أصفر) + «بانتظار قرار الليدر...».
  6. **ELIMINATION_PENDING**: 💀 «إقصاء» + بطاقة لكل مُقصى (حمراء لو أنا) + كشف الدور بعد `eliminationRevealed` (ذهبي mono) + بانر «❌ تم إقصاؤك!» لو أنا.
  7. **NIGHT**: 🌙 6xl يتنفس (scale [1,1.1,1] 3s) + «الليل يسدل ستاره» (indigo) + لو `nightStepInfo`: «جارٍ اختيار الهدف من قبل {roleName}...» + 5 نقاط indigo متلاشية بالتناوب.
  8. **MORNING_RECAP**: ☀️ 5xl ينزل + «الصباح يطل»؛ أحداث **شخصية فقط** (`targetPhysicalId===myId` مستثنى SILENCE/PROTECTION)؛ حالة القتل: بطاقة حمراء 💀 «لقد اُغتلت!»؛ حالة فارغة «بانتظار كشف الأحداث...»؛ قائمة أحداث متدرّجة بخريطة: `ASSASSINATION` 💀 «تم اغتيالك!» / `ASSASSINATION_BLOCKED` 🛡️ «تم حمايتك من الاغتيال!» / `SNIPE_MAFIA|SNIPE_CITIZEN` 🎯 «تم قنصك!» / `SILENCED` 🤫 «تم إسكاتك!...» / `SHERIFF_RESULT` 🔍 «نتيجة التحقيق: 🔴 مافيا / 🟢 مواطن» / `PROTECTION_FAILED` ❌ / `POLICEWOMAN_REVEAL` 👮 / مجهول → 📋 + النوع الخام. **تحذير نقل**: `amIKilled` يفحص `KILL/SNIPE` بينما الخريطة تستخدم `ASSASSINATION/SNIPE_*` — يجب التحقق من أسماء الأنواع الفعلية في الـ backend قبل النقل.
  9. **GAME_OVER** (فقط عند وجود `gameWinner`): أيقونة نابضة 6xl (MAFIA 🩸 / ASSASSIN 🔪 / JESTER 🤡 / وإلا ⚖️) + عناوين «انتصار المافيا / انتصار السفاح! / فوز المهرج! / تطهير المدينة» + العناوين الفرعية؛ **شبكة كشف الأدوار** 3 أعمدة: خليتي ذهبية، الميت أحمر باهت، الدور أحمر لو مافيا/أخضر لو مواطن + 💀 للميت.
- **الميزات والتفاعلات**: تنبيه دوري في النقاش = اهتزاز `[200,100,200,100,300]` + **3 نغمات WebAudio صاعدة** (660→880→1100Hz) — تعمل حتى على iOS؛ اهتزاز الإقصاء `[200,100,200]`؛ سحب الصوت أحادي (`hasWithdrawn`)؛ الديلات: إنشاء/إلغاء/حد 3/قفل جولة 1، وإعادة ضبط كاملة عند تغيّر المرحلة؛ **منطق reconnect حرج**: سلسلة `getLatestMyId()` (prop → ref → `mafia_session` → `mafia_player_info` → 0)، `fetchLatestState()` يدمج بلا مسح (خصوصاً OR-merge لـ `timerFinished` وحارس `withdrawalActiveRef` ضد سباق الـ poll)، والمؤقتات كلها **مشتقة من `startTime` السيرفري** (drift-corrected)؛ تنظيف لكل انتقال مرحلة (موثّق حرفياً في التقرير)؛ dedupe لأحداث الصباح بمفتاح `(target, type)`.
- **التصميم**: كما اللغة العامة + indigo لليل، كهرماني للصباح، أزرق للسحب، أصفر للتعادل.
- **API**: لا HTTP (كله socket ack).
- **Socket**: emits: `room:get-my-state`, `player:withdraw-vote {physicalId}`, `day:create-deal {roomId, initiatorPhysicalId, targetPhysicalId}`, `day:remove-deal {roomId, dealId}`. Listeners: `day:discussion-updated`, `day:justification-started`, `day:justification-timer-started/stopped`, `day:tie`, `day:elimination-pending`, `day:elimination-revealed`, `display:morning-event`, `game:over`, `day:withdrawal-period/update/result`, `night:step-info`, `day:deal-created/removed`, `game:phase-changed`.
- **مكافئ Flutter**: widget بـ `switch(gamePhase)` + `AnimatedSwitcher`؛ الديلات بـ `showModalBottomSheet(isScrollControlled:true)` مع بديل للـ select المعطّل (Flutter لا يعطّل `DropdownMenuItem` أصلاً — قائمة مخصصة)؛ النغمات → أصوات مسبقة التوليد (`just_audio`) بدل توليد runtime؛ الالتزام بحساب المؤقتات من `startTime` وبدلالات دمج reconnect؛ ملاحظات النقل: دعم `DAY_ELIMINATION` و`ELIMINATION_PENDING` معاً، تحمّل أسماء بديلة لمفاتيح `teamCounts`، دعم `timeLimitSeconds || duration`، وتمرير `pollData.round` (قفل الديلات).

---

### PhoneSpectatorView — طاولة الحلقة ثلاثية الأبعاد (`src/components/PhoneSpectatorView.tsx`)

- **الوظيفة والرحلة**: "حلقة الطاولة" على الهاتف: بديل شاشة العرض في الريموت، ومشاهدة للموتى/المراقبين، وواجهة الليدر/المضيف (`hostView + revealRoles`)، وحلقة انتظار اللوبي، وwidget مطويّ أثناء التصويت.
- **الحالات والشاشات الفرعية**:
  - **تحميل**: spinner ذهبي + «جاري تحميل الطاولة…».
  - **شريط الرأس** (يبقى حتى في `collapsed`): تسمية المرحلة من `PHASE_LABELS` (نقاش النهار/مرحلة الدفاع/كشف الإقصاء/كسر التعادل/الليل/أحداث الصباح/غرفة الانتظار/تجهيز الأدوار/توزيع الأدوار/التصويت)؛ يمين: `🛡️ {cit}` أزرق، `🔪 {maf}` أحمر، «أحياء {n}»، ساعة الجيم `⏱ m:ss`؛ في اللوبي: «مقاعد» + `N/max` بجزيرة LTR.
  - **شريط المتحدث** (min-height 38px كي لا يقفز التخطيط): pill ذهبية «🎙️ يتحدّث الآن:» أو «🎙️ يُدافع الآن:» + `#{id} name` + `· {s}s` (أحمر ≤10)؛ متحدث مُسكَت → pill حمراء «🔇 ... — مُسكَت، لا يمكنه الكلام»؛ بين الأدوار «— بانتظار المتحدّث التالي —»؛ في اللوبي «الطاولة تكتمل — بانتظار المضيف لبدء الجولة» أو «جارٍ توزيع الأدوار…».
  - **المسرح** (ارتفاع 410px، `perspective 1000px`): طبقتا خلفية — بساط بوكر أخضر (`rotateX(72°)` radial) وتوهّج ذهبي مركزي في وضع focus.
  - **وضعان**: **FOCUS** — عجلة 3D: بطاقة 140×196 بتحويل `translateX(off*150px) translateZ(-|off|*205px) rotateY(-off*45°) rotateZ(off*3°)`، scale حتى 0.72، opacity 1/0.5/0 حسب البعد، انتقالات `.55s cubic-bezier(.15,.5,.3,.95)` (تُعطَّل أثناء السحب)، البطاقة الأمامية تحمل حلقة توهّج ذهبية؛ **OVERVIEW** — حلقة بيضاوية مسطّحة من "رموز مقاعد" (`Rx=min(stageW/2−44,168)`, `Ry=147`, `rotateX(8°)`)، أوجه البطاقات مخفية.
  - **وجه البطاقة الأمامي**: منطقة أفاتار 66% (فيديو live لو `videoByPid[pid]`، وإلا صورة بسقوط متدرج لصور الجنس)، تدرّج خلفي حسب الجنس (ذكر `#6a5a34→#1c1811`، أنثى `#5b4a67→#1e1725`)، شارة رقم أعلى-يمين (كريمي `#f0d9a0`، بنفسجي للأنثى)، شريط اسم أسود سفلي (Amiri 16px)، chip «أنت» ذهبية (تُخفى في hostView)، شريط دور للمضيف عند `revealRoles`، قرص 🎙️ ذهبي للمتحدث النشط، قرص 🔇 أحمر للمُسكَت، chip عدّاد لكل بطاقة، طبقة 💀 للميت.
  - **الوجه الخلفي (الدور)**: صورة دور مخصصة (`tpl.secretFace.customImageUrl` مع تحويل النسبي عبر `SOCKET_URL`) أو تصميم مولّد: `tpl.gradient` + حد `tpl.borderColor` + أيقونة الدور 34px + اسم الدور (Amiri 18px، مافيا `#d13636` / مواطن `#3f83c4`) + «#id · name»؛ القلب `.7s cubic-bezier(.5,.05,.2,1)`.
  - **رمز المقعد** (overview): قرص 56×56 بحلقة معدنية conic-gradient (ذهبي؛ بنفسجي للأنثى؛ عند نهاية الجيم بلون الفريق)، fallback أفاتار على خطوتين (thumb → أصلي → `/avatars/male|female.png`)، شارات 💀/🔇/نقطة خضراء نابضة للمتكلم، أيقونة الدور واسمه بدل اسم اللاعب عند نهاية الجيم، هالة ذهبية نابضة للمتحدث، الميت grayscale + شطب.
  - **حالات الموت**: `.dead` باهتة grayscale بحد أحمر داكن؛ `.dead.revealed` تبقى مقلوبة على وجه الدور مع chip 💀 صغيرة.
  - **سلسلة كشف الإقصاء** (سينمائية، متسلسلة لكل لاعب): تحويل لـ focus → دوران العجلة للبطاقة (650ms) → قلب لوجه الدور (ثبات 2.6s) → تبقى مقلوبة للأبد → توسيم ميت محلياً → فجوة 350ms → التالي؛ ثم عودة التركيز للمتحدث الحالي.
  - **بانر الصباح** (أعلى-وسط، 4.5s): 🛡️ «فشل الاغتيال» + «نجت الحماية · {name}»، أو ⚠️ «لم تنفع الحماية» + الاسم.
  - **بانر اللوبي** + **مقاعد شاغرة**: رموز دائرية متقطعة «؟» بعنوان «شاغر» لعدد `maxPlayers − N`.
  - **نهاية الجيم**: يفرض overview؛ كل البطاقات تُقلب بعد 550ms؛ بانر الفائز وسط الحلقة (🩸/🔪/🤡/⚖️ + «انتصار المافيا/انتصار السفّاح/فوز المهرج/تطهير المدينة»).
  - **سطر التلميح**: focus «اسحب لتدوير الحلقة · اضغط كارداً جانبياً للانتقال» / overview «اضغط أي مقعد لتكبيره فوراً».
  - **شريط التحكم**: زر تبديل الوضع «◱ تصغير — عرض الحلقة كاملة» ↔ «⊡ تكبير كاردي» + زر «↺ للمتحدّث» الشرطي.
  - **الوضع المطوي** (`collapsed` أثناء التصويت): المسرح والتحكم يطويان لارتفاع 0 بينما الرأس يبقى — **المكوّن لا يُفكَّك** (الحالة تُحفظ).
  - **إتاحة**: `prefers-reduced-motion` يعطّل انتقالات البطاقات.
- **الميزات والتفاعلات**: سحب لتدوير العجلة (>6px يلغي click؛ زخم `−vel*5` مقيّد ±2 بطاقة؛ snap لأقرب عدد صحيح؛ كبت النقر 60ms بعد السحب؛ مستمعات pointerup عالمية)؛ نقر رمز في overview → focus عليه؛ نقر بطاقة جانبية → دوران بأقصر مسار دائري؛ قواعد التركيز التلقائي (المتحدث السيرفري يفوز دائماً إلا أثناء سلسلة الكشف؛ أول mount يركّز بطاقتي)؛ مصدر الدور النشط: `DAY_JUSTIFICATION → justTimer.physicalId`، `DAY_DISCUSSION → discussion.currentSpeakerId`؛ صحة العدّاد من `timeRemaining` السيرفري؛ **ثوابت anti-leak**: roster يصل منقّى (`role=null` للأحياء)، الأدوار الحية لا تُعرض أبداً، الكشف فقط عبر (إقصاء / أحداث موت صباحية / roster ميت / `winnerReveal` / `revealRoles` للمضيف)، وقائمة أحداث الصباح NON_DEATH (`SILENCED, SILENCE, SHERIFF_RESULT, INVESTIGATION, ABILITY_DISABLED, DISABLE_ABILITY, TRANSFORM, TWIN_TRANSFORM, ASSASSINATION_ATTEMPT, ELIMINATE_ALL, SINGLE_WINNER, TIE, ELIMINATION`) لا تُعرض على الحلقة حرفياً؛ الإسكات يُمسح عند بدء NIGHT وفي جيم جديد؛ reset في LOBBY/ROLE_*.
- **التصميم**: كما موصوف (felt أخضر، حلقات conic، JetBrains Mono للأرقام).
- **API**: لا شيء (يعتمد `useGameConfig.getCardForRole` و`avatarThumb`).
- **Socket** (استماع فقط): `day:discussion-updated`, `game:phase-changed` (+teamCounts بأسماء مفاتيح متعددة), `day:elimination-revealed`, `day:show-silenced`, `game:timer-adjusted`, `game:started`, `day:justification-timer-started/stopped`, `display:morning-event`.
- **مكافئ Flutter**: **أعلى مخاطر النقل في هذا الملف هي العجلة 3D** — `Transform(Matrix4..setEntry(3,2,0.001)..)` لكل بطاقة بقيمة `rot` مستمرة، سحب بـ `RawGestureDetector` (recognizer أفقي فقط ليمرّ التمرير العمودي)، زخم + snap يدويان؛ لا تستخدم `PageView`. القلب: controller بتبديل الوجه عند 90°؛ سلسلة الكشف: `Future` chain بحارس `revealSeq`؛ الحلقة المعدنية: `SweepGradient`؛ الفيديو: `flutter_webrtc RTCVideoView` أو RealtimeKit Flutter SDK؛ `collapsed` عبر `AnimatedSize/SizeTransition` بلا unmount؛ `MediaQuery.disableAnimations` لتقليل الحركة؛ التحقق من رسم emoji (⚖️ 🎙️ ◱ ⊡ ↺) على أجهزة Android.

---

### نظام بطاقات الأدوار (`MafiaCard.tsx` / `DynamicMafiaCard.tsx` / `MafiaCardLegacy.tsx` / `SmartMafiaCard.tsx`)

- **الوظيفة والرحلة**: بطاقة الهوية/الدور الشخصية بوجهين (غطاء + دور) وقلب 3D؛ تُستخدم في كشف الدور، الاقتراع، الحلقة، الليدر، شاشة العرض، السينمائيات، وصفحة `/card-demo`. `MafiaCard` غلاف ذكي: `useDynamicEngine=true` افتراضياً → `DynamicMafiaCard` (تصميم من قوالب DB) وإلا `MafiaCardLegacy` (ثيمات ثابتة). `SmartMafiaCard` مجرد re-export.
- **الحالات والشاشات الفرعية**:
  - **أحجام**: sm 176×240، md 224×320، lg 256×352، fluid 100%. حالة ميت: `opacity-30 grayscale pointer-events-none`. القلب: `perspective 1000px` + `preserve-3d` + `rotateY(180deg)` بمنحنى `cubic-bezier(.2,.7,.2,1)` (700ms افتراضي / 1100ms عند كشف الدور)، `backface-visibility hidden`.
  - **الوجه الأمامي (الغطاء)**: حد 2px من `template.borderColor` (fallback ذهبي؛ بنفسجي للأنثى)؛ الإسكات يضيف `ring-2 ring-rose-600/60` + pill «🔇 مُسكَت»؛ أعلى 66.66%: صورة اللاعب أو placeholder جنس (`/avatars/male|female.png`) مع تلاشٍ أسود سفلي؛ رقم اللاعب الكبير فوق الصورة (ذهبي/بنفسجي، mono black؛ **الأرقام ≥10 تُرسم أرقاماً مكدّسة عمودياً** بـ lineHeight 0.85)؛ الثلث السفلي: خط فاصل رفيع + الاسم (Amiri أبيض black، مقصوص 10/14/18/14 حرفاً + '…'، ورتبة GODFATHER تضيف `rank-name-glow`) + «MAFIA CLUB» (mono 8px) + تلميح «اضغط للكشف» لو قابلة للقلب؛ **وضع التصويت** (`showVoting`): الشريط السفلي كله زر، عدد الأصوات mono ضخم (أحمر متوهّج عند >0) مع خلفية حمراء نابضة؛ **أشكال الغطاء**: `elements.shapes(face='cover')` مستطيلات/دوائر حرة.
  - **طبقة Rank Effects** (zIndex 60): حد solid/gradient/**traveling** (حركة background-position)، توهّج نابض، **شارة** pill بإيموجي وتسمية، **إطارات SVG** إجرائية (`simple/greek/islamic/deco/royal` مع أنيميشنات `greek-scroll/frame-spin/deco-pulse`)، gradient overlay، **shimmer** شريط ضوء مائل 25°، **جزيئات** orbit أو burst (8 اتجاهات مسبقة) بمواقيت متدرّجة، **عنصر طائف** (إيموجي float/spin/bounce)، وname glow. المستويات: INFORMANT→SOLDIER→CAPO→UNDERBOSS→GODFATHER؛ التكوينات من DB عبر `getRankEffectsForTier`؛ `rankEffectsOverride` و`rankEditable` لمحرر الأدمن.
  - **الوجه الخلفي (الدور)**: لو `secretFace.customImageUrl` → صورة كاملة الوجه فقط؛ وإلا: خلفية `template.gradient` + لمعان قطري؛ **شارة الفريق** أعلى-وسط («فريق المافيا 🔴» أحمر / «محايد ⚪» كهرماني / «فريق المدينة 🔵» أزرق — قابلة للتخصيص والإخفاء)؛ chip رقم اللاعب (تُخفى مع `hideIdentity`)؛ **دائرة أيقونة** 96px زجاجية (صورة/إيموجي/Lucide بترتيب: `roleDef.cardOverrides.icon` → `template.icon` → خريطة كلاسيكية {GODFATHER:Crown, SILENCER:Scissors, CHAMELEON:Drama, MAFIA_REGULAR:Skull, SHERIFF:Shield, DOCTOR:HeartPulse, SNIPER:Crosshair, POLICEWOMAN:BadgeAlert, NURSE:Syringe, MAYOR:Landmark, CITIZEN:User} → User)؛ اسم الدور Amiri black بلون `textColor`؛ اسم اللاعب (يُخفى مع `hideIdentity`)؛ فاصل؛ تذييل `customFooterText` أو «اضغط للإخفاء»؛ أشكال وجه الدور فوق الكل؛ **كل عنصر يقبل إزاحات `positions.{x,y,s}`** — بكسلات معايرة على بطاقة الويب md 224×320.
  - **Legacy**: نفس البنية بقلب ثابت 700ms، بلا rank effects/أشكال/صور مخصصة/hideIdentity؛ الرقم مع أفاتار = chip عائمة أعلى-يمين؛ جدول ثيمات لكل دور (CITIZEN zinc، DOCTOR emerald، SHERIFF blue، NURSE teal، SNIPER cyan، POLICEWOMAN indigo، MAYOR amber، MAFIA_REGULAR red، GODFATHER amber/Crown، CHAMELEON fuchsia، SILENCER rose؛ WITCH/OLDER_BROTHER/YOUNGER_BROTHER/JESTER/ASSASSIN تسقط على zinc الافتراضي)؛ role=null → «مجهول».
- **الميزات والتفاعلات**: قلب بالنقر (controlled عبر `isFlipped/onFlip` أو uncontrolled)؛ في كشف الدور لصيق أحادي الاتجاه؛ نقر التصويت بـ `stopPropagation` كي لا يقلب؛ fallback أفاتار على `onError`؛ بادئة `NEXT_PUBLIC_SOCKET_URL` للروابط النسبية.
- **التصميم**: كل القيم أعلاه + خط Inter لشارات الرتب.
- **API** (عبر `useGameConfig`، cache وحدة 5 دقائق + `invalidateGameConfigCache()`): `GET /api/game-config/roles` و`/card-templates` و`/abilities` و`/rank-effects` (Bearer اختياري؛ الأربعة بالتوازي؛ unwrap `data.data || data`). `getCardForRole`: `cardTemplateId` → قالب `id==='master'` → `cards[0]` → null.
- **Socket**: لا شيء مباشر (البيانات تصل من أحداث الدور في PlayerFlow).
- **مكافئ Flutter**: widget بطاقة واحد (يكفي نقل Dynamic فقط مع خبز جدول ثيمات Legacy كقوالب افتراضية للعرض قبل وصول الـ config)؛ القلب بـ `AnimationController` + `Matrix4.rotationY` وتبديل الوجه عند 90° بمنحنى `Cubic(0.2,0.7,0.2,1)`؛ **خطر مرتفع — نظام `positions/shapes`**: ارسم البطاقة على canvas منطقي ثابت 224×320 داخل `FittedBox` وكبّر الكل، ولا تعد تفسير الإزاحات لكل حجم وإلا انحرفت تصاميم الأدمن؛ **rank effects = أعلى بند مخاطرة**: compositor مؤثرات بـ `CustomPainter/ShaderMask` (حد متحرك بـ SweepGradient، جزيئات بـ controllers متدرّجة، إطارات SVG كـ CustomPainters — المسارات بسيطة)، مع `RepaintBoundary` لكل بطاقة وتعطيل المؤثرات تحت حجم md عند الحاجة؛ تكديس الأرقام العمودي (Column) سهل النسيان؛ config repository singleton بـ TTL خمس دقائق.

---

### MafiaTeamGallery + زر FAB والإنذار المضاد للغش (`src/components/MafiaTeamGallery.tsx`)

- **الوظيفة والرحلة**: مودال كامل الشاشة يفتحه FAB أحمر «التعرف على المافيا» **معروض لكل لاعب لديه دور** (وجود الزر لا يكشف شيئاً)؛ المافيا يرون الفريق، السفّاح يرى عقوده، والبقية يرون "ملف استخباراتي" تمويهي؛ وكل فتح يُبلغ الليدر فوراً.
- **الحالات والشاشات الفرعية**:
  1. **FAB** (`bottom-[110px] left-4 z-[90]`، دائرة `#8A0303/90` بتوهّج أحمر، أيقونة lucide `Users`، hover scale 1.10): يظهر عند `assignedRole !== null && gamePhase !== 'GAME_OVER' && step ∈ {done, rejoined}`.
  2. **المودال** (`z-[100]`, backdrop `bg-black/80 blur-md` بنقرة إغلاق، محتوى `max-w-sm max-h-[90dvh]` scroll، زر إغلاق **مثبّت viewport** أعلى-يمين 44×44، قفل تمرير الـ body):
     - **لوحة «رابط الدم»** (لو `sibling`): بحد بنفسجي وتدرج `#1a0820→#0d0212`؛ 🩸 + «رابط الدم»؛ أفاتار 64px (grayscale لو ميت) + شارة مقعد بنفسجية + الاسم + chip الدور (+" (متوفّى)")؛ الشرح حسب `recipientIsMafia`: true → «هذا أخوك الأصغر (مواطن) — لا يعرفه باقي المافيا. إن قُتل، تنتحر حزناً عليه.» / false → «هذا أخوك الأكبر (من المافيا)... إن قُتل، تنهض وتنضمّ إلى المافيا.».
     - **واجهة السفّاح** (`isAssassin && assassinContracts`): أيقونة Target، «عقود الاغتيال»، «{completed}/{total} عقود مُنجزة»، شريط تقدّم متحرك `#8A0303→#dc2626`؛ قائمة العقود: منجز → أخضر بـ ✅ ووصف مشطوب + «أُنجز في الجولة {n}»؛ نشط → أحمر متوهّج بـ 🔪 نابض + «اقتل صاحب هذا الدور!» + شريط نشاط جانبي نابض.
     - **واجهة فريق المافيا** (`team.length > 0`): أيقونة Users، «شركاؤك» + «{n} في الفريق»؛ **grid عمودان** من بطاقات الأعضاء (spring متدرّج): أفاتار دائري 72px بحد أحمر + شارة مقعد + الاسم + chip الدور بالعربية.
     - **الواجهة التمويهية** (لا فريق وليس سفّاحاً): «ملف استخباراتي» / `INTELLIGENCE BRIEFING` + 4 نصائح ثابتة (Eye: «راقب ردود فعل اللاعبين أثناء النقاش»، MessageCircle: «انتبه لمن يُوجّه الاتهامات بدون دليل»، Vote: «صوّت بحكمة بناءً على الملاحظات»، Shield: «لا تكشف دورك حتى لو ضُغط عليك» — كل منها بسطر فرعي).
- **الميزات والتفاعلات** (ثوابت أمنية حرفية):
  - **ترتيب النقر حرج**: (1) دائماً emit `player:mafia-gallery-open {roomId}` عبر socket خام fire-and-forget **قبل** أي فحص؛ (2) لو `isPlayerDead` → return (لا يُفتح المودال لكن الليدر يُنذَر بالمحاولة)؛ (3) فتح المودال.
  - **بوابة دفاعية عند الرسم**: `team/sibling` يُصفَّران ما لم يكن `assignedRole ∈ MAFIA_ROLES` (يمنع تسريب فريق قديم من localStorage)؛ `isAssassin = assignedRole==='ASSASSIN'`.
  - **جهة السيرفر**: يثق فقط بـ `socket.data`، throttle 5 ثوانٍ لكل socket، يتجاهل بلا حالة/GAME_OVER/بلا دور، ثم يبث `leader:mafia-gallery-alert {roomId, physicalId, name, role, team, teamAr, wasDead, avatarUrl, at}` **لسوكتات الليدر فقط** عبر `fetchSockets()` (لا توجد leader rooms) + `logStaffAction`.
  - **جهة الليدر** (لو نُقل تطبيق الليدر): طابور SweetAlert بإزالة تكرار حسب physicalId، عدّاد حي «تنبيه {pos} من {total}»، نسخة «⚠️ محاولة من لاعب مُقصى»، صوت محلي `leader_gallery_alert`، وزر «⚡ إقصاء إداري» → `admin:eliminate` ثم `admin:reveal-eliminated`.
- **التصميم**: أحمر دموي/أسود للمافيا والسفّاح، بنفسجي للتوأم، spring entrances متدرّجة.
- **API**: لا شيء.
- **Socket**: emit `player:mafia-gallery-open`؛ يتغذّى من `player:role-assigned` (استبدال دائم للفريق/التوأم + اهتزاز `[100,50,200,50,300]`)، `mafia:team-updated`، `assassin:contracts-update {contracts[], currentIndex, completedCount, totalRequired}`، `game:started` (تصفير العقود)، وحقول ack للـ rejoin.
- **مكافئ Flutter**: `showGeneralDialog` بـ `BackdropFilter`؛ زر الإغلاق في طبقة Stack عليا؛ `SharedPreferences` لـ `mafia_mafiaTeam/mafia_sibling` بنفس دورة الحياة **مع نفس بوابة الرسم** (لا ثقة بالبيانات المخزنة وحدها)؛ الحفاظ على ترتيب emit-قبل-فحص-الموت حرفياً (السيرفر يعتمد عليه).

---

### RolesInfoModal — موسوعة الأدوار (`src/components/RolesInfoModal.tsx`)

- **الوظيفة والرحلة**: كتالوج الأدوار الحي من الـ backend، يُفتح من زر «🃏 الأدوار» في شاشة اللعب (ومن صفحة البروفايل).
- **الحالات والشاشات الفرعية**: bottom-sheet على الموبايل / dialog موسّط ≥sm؛ backdrop بنقرة إغلاق؛ رأس: أيقونة متدرجة indigo→purple بـ 🃏 + «الكروت والأدوار» + «تعرف على قدرات كل دور في اللعبة» + زر ✖؛ الجسم: **loading** spinner كهرماني / **خطأ** «⚠️ تعذّر تحميل الأدوار» / **محمّل**: ثلاثة أقسام بترتيب ثابت MAFIA («فريق المافيا» rose) → CITIZEN («فريق المواطنين» emerald) → NEUTRAL («الأدوار المستقلة» amber)، مرتبة بـ `genPriority`، grid 1/2 أعمدة؛ بطاقة الدور: إيموجي 2xl (خريطة محلية: GODFATHER 🎩، SILENCER 🤫، CHAMELEON 🦎، MAFIA_REGULAR 🔪، SHERIFF 🕵️، DOCTOR 🩺، SNIPER 🎯، POLICEWOMAN 👮‍♀️، NURSE 💉، MAYOR 🏛️، CITIZEN 👤، JESTER 🃏؛ مجهول → 🎭/🛡️/⚖️ حسب الفريق) + `nameAr` بلون الفريق + `nameEn` + الوصف (fallback «لا يوجد وصف») + chip شرط الفوز «🏆 {winConditionDescription || winConditionType}»؛ تذييل: زر «حسناً، فهمت الأدوار».
- **الميزات والتفاعلات**: fetch عند كل فتح؛ تجميع وفرز client-side؛ ثلاث وسائل إغلاق؛ bug ويب: `return null` قبل AnimatePresence يمنع أنيميشن الخروج (غير مهم في Flutter).
- **التصميم**: رمادي داكن `bg-gray-900` بحدود team-tinted — أفتح قليلاً من ثيم اللعب.
- **API**: `GET /api/game-config/roles` (**بلا auth header** هنا).
- **Socket**: لا شيء.
- **مكافئ Flutter**: `showModalBottomSheet` + fetch-on-open بحالات loading/error؛ الانتباه لإيموجي ZWJ (👮‍♀️) على Android القديم — يُفضَّل توحيدها مع مجموعة `ROLE_ICONS` الخالية من ZWJ أو أصول أيقونات.

---

### السينمائيات NightAnimCinematic — 18 مشهداً (`src/components/NightAnimCinematic.tsx`؛ تُعرض على شاشة العرض `display/page.tsx`)

- **الوظيفة والرحلة**: طبقة العرض السينمائي للأحداث: أثناء NIGHT مشهد "الفعل الجاري" داخل بطاقة noir لمدة **5 ثوانٍ** بالضبط، وأثناء MORNING_RECAP مشهد النتيجة لمدة **10 ثوانٍ** (كثير منها يضمّن `MafiaCard` مقلوبة لكشف دور الضحية). تُرسم على عميل الشاشة الكبيرة وليس داخل PlayerFlow — لكن لو استضاف تطبيق Flutter دور العرض (أو أُريدت المشاهد في الريموت) يجب نقلها كاملة. العقد: `{type, targetPhysicalId?, targetName?, extra?}`.
- **الحالات والشاشات الفرعية** (المشاهد الـ18 على `data.type`، وكل التفاصيل الحركية موثقة في التقرير المصدر ويجب نقلها كما هي):
  - **ليلية (5s)**: `ASSASSINATION_ATTEMPT` (شعاع قطع أحمر يمسح 0.6s + 6 بقع دم عشوائية + 🔪 يدخل بدوران + «عملية اغتيال جارية» + غسلة حمراء)؛ `INVESTIGATION` (حلقتا سونار ذهبيتان + 👁️ برمشة مركّبة بـ times `[0,.15,.7,.8,.85,1]` + «تحقيق جارٍ»)؛ `PROTECTION` (هالة خضراء + 🛡️ spring damping 10 + خط نابض + «حماية طبية»)؛ `SNIPE` (خطا crosshair + دائرتا scope تنكمشان + **وميض أبيض عند ~600ms** بـ times `[0,.49,.5,.52,.6]` + 🎯 + «تصويب القناص»؛ الصوت مؤخَّر 600ms ويُلغى عند unmount)؛ `SILENCE` (🤐 + شريط لاصق `#555` بميل −5° يُصفع scaleX 0→1 + 8 خطوط static عشوائية + «عملية إسكات»)؛ `DISABLE_ABILITY` (هالة بنفسجية + 8 جزيئات 🔮 طائرة + 🧙‍♀️ يدخل بدوران −180° spring + «تعطيل قدرة جارية...»)؛ `ASSASSINATE` (غسلة قرمزية مرتجفة + 3 خطوط قطع بميول مختلفة + 🗡️ + «السفّاح يتحرك»).
  - **صباحية (10s)**: `ASSASSINATION` (🩸 + «تم الاغتيال» + بطاقة مقلوبة لو `extra.targetRole` وإلا اسم+رقم)؛ `ASSASSINATION_BLOCKED/ASSASSIN_BLOCKED` (🛡️ spring + «نجاة بالحماية» + «تم إنقاذ أحد اللاعبين من الاغتيال» — **بلا بطاقة، الناجي مجهول**)؛ `SNIPE_MAFIA` (🎯 + «القناص نجح» ذهبي + بطاقة الهدف؛ **bug ويب معروف**: توهّج drop-shadow مبني بـ template literal لا يُصرَّف في Tailwind — قرّروا إصلاحه أو إبقاء التكافؤ-مع-الخطأ)؛ `SNIPE_CITIZEN` (💀 + «القناص فشل» أحمر + **بطاقتان جنباً إلى جنب** «القناص»/«الهدف» عند توفر `sniperPhysicalId+targetRole`)؛ `SILENCED` (🤐 + «تم إسكات لاعب» + بطاقة **غير مقلوبة** بـ `isSilenced=true` — هوية بلا دور)؛ `ABILITY_DISABLED` (🚫 + «تم تعطيل قدرة لاعب» + بطاقة `hideIdentity=true` — **دور بلا هوية** + تذييل «🧙‍♀️ سحر الساحرة — {الدور}»)؛ `ASSASSIN_KILL` (🔪 + «السفّاح اغتال» + بطاقة تُقلب فقط لو وُجد الدور)؛ `POLICEWOMAN_EXECUTION` (👮‍♀️ + «صلاحية الشرطية — إصابة!» بنفسجي أو «صلاحية الشرطية» أحمر حسب `targetIsMafia` + بطاقة + تذييل «🏆 الشرطية {الاسم} حصلت على نقاط رانك» عند الإصابة)؛ `TWIN_SUICIDE` (🩸 + «انتحار التوأم» + «👥 ارتباط الدم — انتحر بعد موت أخيه الأصغر» + بطاقة `isAlive=false`؛ **بلا صوت**)؛ `TWIN_TRANSFORM` (🌑 + «الصحوة المظلمة» + «👥 {الاسم} تحوّل إلى فريق المافيا» + بطاقة تدخل بقلب 3D `rotateY 180→0`؛ **بلا صوت**)؛ `default` (❓ + النوع الخام).
  - **إطار المضيف**: خلفية NIGHT = 🌑 9xl يتنفس + «الظلام دامس» + `OPERATION NIGHTFALL`؛ خلفية MORNING = ☀️ يتمايل + «صباح جديد» + `MORNING INTELLIGENCE REPORT`؛ بطاقة noir بدخول scale 0.9→1.
- **الميزات والتفاعلات**: **صفر تفاعل مستخدم** — عرض سلبي مقاد بالـ socket؛ قواعد الإلغاء: حدث جديد يعيد المؤقت، `display:night-started` يمسح فوراً، تغيّر المرحلة ينظّف.
- **التصميم**: اللوحة الـ noir أعلاه + قرمزي `#DC143C`، بنفسجي `#9333ea/#a855f7/#a78bfa`؛ الإيموجي كأيقونات بـ text-8xl مع توهّجات drop-shadow.
- **API**: غير مباشر: `GET /api/sounds/active-map` (soundManager؛ يعاد جلبه على `admin:sounds-updated`).
- **Socket** (في صفحة العرض): on `night:animation`، `display:morning-event`، `display:night-started`، `night:step-info {stepType}` (ambient حلقي حسب الخطوة: `ambient_night_kill/silence/investigate/protect/snipe/assassin` بمستوى 0.3)، `display:sound-play {fn, args}` (**مرآة الصوت**: جهاز الليدر هو مصدر الصوت الحصري والشاشة تشغّل بـ `setLocalPlayback(false)`)، `admin:sounds-updated`. الأصوات المشغّلة: `playEventSound` (يخفض الـ ambient من 0.3 إلى 0.08 لثلاث ثوانٍ): `night_assassination/investigation/protection/snipe(+600ms)/silence/witch/assassin`؛ `playGameSound`: `morning_assassination_success/protection_success/snipe_mafia/snipe_citizen/silenced/ability_disabled/assassin_kill/policewoman` + heartbeats. `night_witch` و`morning_ability_disabled` **بلا fallback — صامتان** ما لم يرفع الأدمن ملفات.
- **مكافئ Flutter**: `switch` يرجع 18 widget بلا حالة؛ `flutter_animate` + `TweenSequence` للمسارات ذات `times` الصريحة؛ springs بـ `SpringSimulation`؛ **العشوائيات (بقع الدم/خطوط static/جزيئات 🔮) تُولَّد مرة واحدة في `initState`** (الويب يحسبها في render — لا تنقل ذلك)؛ الصوت: **تصيير وصفات الـ WebAudio العشر إلى ملفات مضمّنة** (الوصفات الدقيقة موثقة في التقرير المصدر: sawtooth 800→50Hz للاغتيال، square 2000→100Hz للقنص، double-thump لنبضات القلب... إلخ) وتشغيلها بـ `just_audio + audio_session` (فئة playback تُغني عن حيل iOS mute-switch) مع تنزيل خريطة الأصوات المخصصة وتخزينها بـ `flutter_cache_manager` والحفاظ على بوابة `localPlaybackEnabled` ومرحل `{fn, args}`؛ dotLottie الأربعة (`fireworks/prize-podium/sound-off/winner`) عبر `dotlottie_loader` (`winner.lottie` يتيم ويمكن إسقاطه)؛ حذار `letterSpacing` على العربية (يكسر وصل الحروف أكثر من المتصفح).

---

### CircularTimer + PhaseHeader + PhaseLoading (كروم المراحل المشترك)

- **الوظيفة والرحلة**: `CircularTimer` حلقة العدّ التنازلي بجانب المتحدث (size 100) والمدافع (size 120) في `DisplayDayView`؛ `PhaseHeader/PhaseLoading` كروم موحّد لشاشات المضيف الريموت واستخدام واحد في PlayerFlow.
- **الحالات والشاشات الفرعية**:
  - **CircularTimer**: حلقة خلفية `#1a1a1a` strokeWidth 8؛ قوس تقدّم بـ `strokeDashoffset` وانتقال CSS خطي 0.5s + `drop-shadow` توهّج؛ **نطاقات لون بحسب progress**: >60% أخضر `#2E5C31`، ≤60% ذهبي `#C5A059`، ≤30% أحمر `#8A0303`؛ **حالتا إلحاح**: `isUrgent ≤10s` (هالة خارجية تتسع 20→40px blur) و`isCritical ≤5s`؛ **اهتزاز الشاشة** عند critical (jitter x/y كل 0.3s)؛ الرقم المركزي `ceil(timeRemaining)` mono black بحجم `size*0.35` يعاد mount كل ثانية بـ pop (scale 1.3→1)، أحمر نابض عند critical؛ تسمية "SEC"؛ **نبضات قلب صوتية**: ≤5s → `timer_heartbeat_fast` كل ثانية، ≤10s → `timer_heartbeat_slow` في الثواني الزوجية فقط، محروسة بـ `prevTimeRef` (تُطلق فقط عند تغيّر الثانية الصحيحة)؛ حالة الانتهاء ليست في المكوّن (دائرة "00" ثابتة منفصلة في DisplayDayView).
  - **PhaseHeader**: إيموجي اختياري 2xl + عنوان `text-lg font-black #C5A059` Amiri + سطر فرعي mono 10px (أمثلة: `💀 اكتمل التصويت — جاهز للحسم / AWAITING REVEAL`، `⚖️ حالة تعادل! / TIE BREAKER`، `🗳️ مرحلة التصويت / VOTING`).
  - **PhaseLoading**: إيموجي اختياري + spinner 32px (حد ذهبي/30 بقمة ذهبية صلبة) + caption mono (افتراضي «جارٍ التحميل…»؛ استخدامات: «جاري تحميل التصويت...»، «جارٍ تحضير الخطوة التالية...»، «جارٍ تحضير التصويت…»، «جارٍ تحضير التبرير…»).
- **الميزات والتفاعلات**: لا تفاعل؛ حواف: `totalTime<=0` → progress 0؛ لا heartbeat عند `<=0`؛ الاهتزاز يتوقف عند `displayTime<=0`؛ heartbeat/shake قابلان للتعطيل بالـ props.
- **التصميم**: كما أعلاه.
- **API/Socket**: لا شيء مباشر (الأصوات عبر soundManager).
- **مكافئ Flutter**: `CustomPaint` بـ `drawArc` (بداية −90°، `StrokeCap.round`) أو `percent_indicator`؛ tween بين الثواني بـ `TweenAnimationBuilder(500ms, linear)`؛ التوهّج بـ `MaskFilter.blur`؛ pop الرقم بـ `AnimatedSwitcher` keyed بالثانية؛ إضافة اختيارية لطيفة: `HapticFeedback.heavyImpact()` مع النبضة الحرجة.

---

### PlayerNotepad + شات المافيا السري (`src/components/PlayerNotepad.tsx` + `backend/src/sockets/mafia-chat.socket.ts`)

- **الوظيفة والرحلة**: «مفكرة التحري» — مودال كامل الشاشة لكل لاعب: ملاحظات حرة (عامة أو مربوطة بلاعب عبر @) + مستويات اشتباه (🟢 بريء / 🟡 مشتبه / 🔴 مافيا). وهي **غطاء** لشات «🗣️ التشاور» السري: تبويب ثالث يظهر فقط لمافيا أحياء أثناء مراحل اللعب وبتفعيل الليدر — غير المؤهَّل لا يرى أي أثر لوجوده.
- **الحالات والشاشات الفرعية**:
  - **FAB المفكرة**: `bottom-[88px] right-4 z-[90]`، دائرة 48px `#111` بحد ذهبي 2px و📝.
  - **المودال**: `z-[100]` خلفية `#080808` + `env(safe-area-inset-bottom)`؛ دخول/خروج bottom-sheet spring (damping 28, stiffness 350)؛ رأس «📝 مفكرة التحري» ذهبي Amiri + زر ✕؛ **شريط تبويبات**: «✏️ إضافة ملاحظة» + «📋 عرض الملاحظات (N)» + «🗣️ التشاور» (فقط عند `chatVisible`) مع **نقطة غير مقروء** حمراء 8px نابضة؛ النشط ذهبي بنص أسود.
  - **تبويب الإضافة**: بطاقة الربط بحالتين — هدف محدد (صف مميّز بأفاتار 36px + الاسم + «مقعد #N» + زر ✕ «إلغاء الربط») أو placeholder متقطّع «اكتب **@** لاختيار لاعب — أو اترك فارغاً للملاحظات العامة»؛ textarea خمسة أسطر `dir="auto"` بـ placeholder ديناميكي («ملاحظتك عن {الاسم}...» / «اكتب ملاحظتك هنا... (اكتب @ لتحديد لاعب)»)؛ **قائمة @ المنسدلة** تفتح فوق الحقل (رأس «اختر لاعباً»، صفوف أفاتار+اسم+مقعد، حالة فارغة «لا يوجد لاعبون مطابقون»، `onMouseDown+preventDefault` كي لا يفقد الحقل التركيز)؛ زر حفظ ذهبي متدرج بعنوان «💾 حفظ عن {الاسم}» / «💾 حفظ ملاحظة عامة» (معطّل عند نص فارغ)؛ **رقائق اختيار سريع** «أو اختر لاعباً مباشرة» عند غياب هدف.
  - **تبويب العرض**: زر «🗑️ مسح كل الملاحظات» (بتأكيد swal «هل أنت متأكد من مسح جميع الملاحظات ومستويات الريبة لجميع اللاعبين؟»)؛ بطاقة «📌 ملاحظات عامة» + زر «مسح»؛ بطاقة لكل لاعب له نص أو اشتباه: أفاتار 40px + الاسم + «🗑️ حذف» + صف أزرار الاشتباه الثلاثة (الضغط على النشط يعيده none؛ ألوان emerald/yellow/red بـ /20 خلفية و/40 حد) + صندوق النص أو «لا يوجد نص — فقط تصنيف» + رابط «+ إضافة ملاحظة» (يحدد الهدف ويقفز للإضافة)؛ حالة فارغة 📭 «لا توجد ملاحظات مسجّلة بعد».
  - **تبويب الشات** (مزدوج الحراسة `activeTab==='chat' && chatVisible`): قائمة رسائل بحالة فارغة 🤫 «لا رسائل بعد — ابدأ التشاور»؛ فقاعة `max-w-[85%]` — **رسائلي `self-start` (يمين تحت RTL)** بخلفية ذهبية/15 والآخرون `self-end` بـ `#141414`؛ سطر المرسل «{name} (#{pid})» ذهبي لنفسي وأحمر للزملاء؛ طابع زمني `dir="ltr"` بصيغة `ar-JO hh:mm`؛ auto-scroll سلس؛ صف إدخال: حقل `dir="rtl"` placeholder «اكتب رسالة للفريق…» بحد **300 حرف client-side** + زر «إرسال» ذهبي؛ Enter يرسل.
- **الميزات والتفاعلات**:
  - كشف @: آخر `@` قبل المؤشر بلا مسافة/سطر بعده → فتح القائمة بالاستعلام؛ الاختيار يحذف `@والاستعلام` من النص ويعيد التركيز بعد 50ms؛ الفلترة تستثني نفسي وتطابق الرقم أو الاسم.
  - الحفظ **يُلحق** بالنص الموجود بـ `\n` (لا يستبدل أبداً)؛ المفتاح `pid=0` للملاحظات العامة؛ `clearNoteText` يحذف المفتاح كاملاً لو لا نص ولا اشتباه؛ `onNotesChange` يغذي emojis الاشتباه في بطاقات الاقتراع.
  - **`chatVisible` يُحسب محلياً فقط ولا يُبث أبداً**: `mafiaChatEnabled && !isPlayerDead && (assignedRole ∈ [GODFATHER, SILENCER, CHAMELEON, WITCH, OLDER_BROTHER, MAFIA_REGULAR] || mafiaTeam.length>0) && gamePhase ∉ [LOBBY, ROLE_GENERATION, GAME_OVER]` (ROLE_BINDING مسموح).
  - **فتح تلقائي على الشات** للمافيا المؤهَّلين؛ فقدان الأهلية أثناء العرض (موت/تعطيل الليدر/تغيّر مرحلة) → قفز فوري لتبويب «إضافة» وإزالة التبويب.
  - دورة الاشتراك: فقط عند (مفتوح + مؤهل): تسجيل مستمع `mafia:chat-message` + جلب التاريخ بالـ ack؛ cleanup عند الإغلاق؛ ring buffer آخر 200 رسالة؛ unread عند تبويب آخر (عبر `activeTabRef` ضد stale closures).
  - الإرسال: `chatSending` + **failsafe 3 ثوانٍ** يعيد تمكين الزر لو لم يصل ack؛ **لا optimistic append** (الرسالة تظهر من echo السيرفر)؛ الرفض السيرفري = `{success:false}` عارٍ و**بلا أي خطأ ظاهر** (silent-deny مقصود).
  - **ثوابت أمنية تُنقل حرفياً**: تحقّق سيرفري سيادي على كل عملية (`verifyAliveMafia`: هوية من `socket.data` فقط، `mafiaChatEnabled===true`، `rolesConfirmed`، مرحلة مسموحة، لاعب حي بدور مافيا — يغطي تحوّل التوأم آلياً)؛ الرسائل في Redis aux `mafia-chat:{roomId}` وليست في game state أبداً؛ بث انتقائي عبر `fetchSockets()` (ليدر دائماً + مافيا أحياء فقط) وليس `io.to(room)` أبداً؛ throttle 700ms لكل socket؛ حدود سيرفر: 300 حرفاً/200 رسالة؛ **الشات لا يُحفظ محلياً أبداً** (لا شيء على القرص يكشف عضوية المافيا).
- **التصميم**: أسود `#080808/#0d0d0d/#111` + ذهبي `#C5A059→#b38b47`؛ كل الأيقونات إيموجي (📝 ✏️ 📋 🗣️ 💾 📌 🗑️ 📭 🤫 🟢 🟡 🔴).
- **API**: لا شيء (localStorage + Socket/Redis فقط).
- **Socket**: emit `mafia:chat-history {roomId}` → `{success, messages[]}`؛ emit `mafia:chat-send {roomId, text}` → `{success}`؛ on `mafia:chat-message {physicalId, name, text, at}`. أحداث الليدر ذات الصلة: `leader:mafia-chat-history`، `leader:mafia-chat-toggle` → بث `room:config-updated {mafiaChatEnabled}` للجميع (العلم عام ولا يكشف هوية).
- **مكافئ Flutter**: مودال بـ `showModalBottomSheet(isScrollControlled:true, useSafeArea:true)` أو route بـ `SlideTransition`؛ الملاحظات في `shared_preferences` بنفس المفتاح `mafia_notes_{roomId}_{myPhysicalId}` وشكل JSON؛ قائمة @ بـ `Overlay/CompositedTransformFollower` مع مستمع `TextEditingController` يكرر فحص المؤشر وحفظ التركيز (`Focus(canRequestFocus:false)`)؛ الشات بـ `ListView + ScrollController` وanimateTo بعد الإطار؛ الوقت بـ `intl DateFormat.Hm('ar')`؛ **مخاطر النقل**: انعكاس محاذاة الفقاعات تحت RTL (تحقق بصرياً)، `dir="auto"` يحتاج heuristic اتجاه لكل نص، **المفكرة يجب أن تبدو متطابقة بالبايت لمافيا وغيرهم عدا التبويب** بلا أي وميض تحميل (`chatVisible` معروف محلياً — لا تنتظر شبكة)، حشوة الكيبورد (`resizeToAvoidBottomInset/viewInsets`)، Enter-to-send → `TextInputAction.send`، وكائنات `players` قد تكون roster أو votingPlayersInfo (حقول اختيارية — عامل بدفاعية).

---

### الخدمات المشتركة المستخرَجة (للتنفيذ كطبقة واحدة في Flutter)

- **SocketService**: `socket_io_client` بمصادقة إلزامية (per security hardening)، `emitWithAck` بـ timeout 15s، إعادة rejoin تلقائية على reconnect، streams مكتوبة الأنواع لكل حدث.
- **SessionStore**: كل مفاتيح `mafia_*` بنفس الأسماء والأشكال، تحميل متزامن قبل أول frame.
- **GameConfigRepository**: نقاط `game-config` الأربع بالتوازي، cache ذاكرة TTL خمس دقائق، `invalidate()`، `getCardForRole/getRankEffectsForTier`.
- **SoundService**: مقابل soundManager — خريطة `/api/sounds/active-map` + cache ملفات + fallbacks مضمّنة + بوابة leader-source/mirror + ducking الـ ambient.
- **HapticsService**: أنماط الاهتزاز الثمانية الموثقة أعلاه.
- **قائمة ثوابت anti-cheat الشاملة** (اختبارات قبول إلزامية): تطابق decoy البكسلي؛ استبدال team/sibling الدائم عند تعيين الدور + بوابة `MAFIA_ROLES` عند الرسم؛ أحادية اتجاه التوأم؛ بقاء الدور والموت بعد GAME_OVER وreset فقط على `game:started`؛ ping المعرض قبل فحص الموت؛ `chatVisible` محلي غير مُرسَل؛ منع تصويت النفس؛ أحادية إرسال الفعل الليلي؛ عدم عرض دور لاعب حي إلا في `revealRoles` للمضيف؛ قائمة NON_DEATH لأحداث الصباح على الحلقة؛ عدم حفظ الشات محلياً.

---

# 5. الألعاب والدعوات، الاستضافة عن بُعد، والصوت المباشر

> ملاحظة عامة للقسم: كل الواجهات هنا عربية RTL بالكامل (الويب يعتمد `dir="rtl"` على مستوى الوثيقة، وبعض المكوّنات تعيد تأكيده)، الثيم داكن، الخط العرضي للعناوين `Amiri, serif` والأرقام/الأكواد بخط `mono`. في Flutter يجب لفّ التطبيق بـ `Directionality(TextDirection.rtl)` واستخدام `EdgeInsetsDirectional`/`AlignmentDirectional` بدل left/right الصريحة. شرائح الـ Host والصوت لا تستخدم أي HTTP إطلاقاً — كل التواصل Socket.IO ack-RPC عبر عقد `useSocket` (timeout ‏15 ثانية؛ ينجح فقط عند `response.success === true` وإلا يرمي `Error(response.error)`؛ رسالة الـ timeout بالعربية: «الخادم في وضع قطع الاتصال أو لا يستجيب (Timeout)») — يجب بناء helper مطابق تماماً في Flutter فوق `socket_io_client`.

---

### شاشة الألعاب والحجوزات (`/player/games`)

- **الوظيفة والرحلة**: المركز الرئيسي لأنشطة النادي الفعلية (أمسيات المافيا): يتصفح اللاعب الأنشطة القادمة على شريط تقويم 14 يوماً، يحجز مكاناً (مع اختيار عرض/باقة إن وُجدت)، يرى من حجز من اللاعبين الذين يتابعهم، ويدخل الغرف النشطة للأنشطة المحجوزة. يُوصَل إليها من الـ bottom-nav ومن إشعارات push بعمق `?activityId=` تفتح شاشة تفاصيل النشاط تلقائياً.
- **الحالات والشاشات الفرعية**:
  - **حالة التحميل العامة**: spinner دائري 40×40 (حد 2px بلون `amber-500/30` وقطاع علوي `amber-500`، دوران)، حاوية `min-h-[60vh]` — نفسه fallback للـ Suspense (الصفحة ملفوفة به بسبب `useSearchParams`).
  - **الرأس**: «🎮 الألعاب والحجوزات» + اسم الشهر العربي والسنة (مصفوفات عربية hardcoded وليست Intl).
  - **شريط التقويم الأفقي**: chip «الكل» (📋) + 14 chip يوم (اليوم + 13). مصفوفة أنماط: محدد = `bg-amber-500/20 border-amber-500/40` نص amber-400؛ اليوم غير المحدد = `bg-white/5 border-amber-500/10` رقم أبيض؛ يوم فيه أنشطة = قابل للنقر بنص gray-400؛ يوم بلا أنشطة = `opacity-40 cursor-not-allowed` معطّل؛ نقطة مؤشر 1.5×1.5 تحت الرقم فقط عند وجود أنشطة (amber-400 محدد / green-500 غيره). عند اختيار تاريخ: سطر «عرض أنشطة يوم {تاريخ ar-JO طويل}» + زر «عرض الكل» يمسح الفلتر.
  - **صف تبويبين**: «📅 أنشطة قادمة» / «📊 تاريخ مبارياتي» — النشط `bg-amber-500/15 text-amber-400 border-amber-500/30`؛ تبديل بأنيميشن fade عبر `AnimatePresence mode="wait"`.
  - **تبويب الأنشطة القادمة**: حالة فارغة «لا توجد أنشطة في هذا اليوم» (مع فلتر) أو «لا توجد أنشطة قادمة حالياً». بطاقة النشاط (`motion.div` مع `layout`): اسم + pill صعوبة (easy=سهل ‎#22c55e‎ 🟢 / medium=متوسط ‎#f59e0b‎ 🟡 / hard=صعب ‎#ef4444‎ 🔴 / expert=خبير ‎#a855f7‎ 🟣؛ المجهول يسقط إلى متوسط)، سطر تاريخ `ar-JO`، سطر موقع 📍 اختياري، سطر «👥 {booked}/{max||20} لاعب» + «💰 {basePrice} ₪» إذا السعر موجود و≠ '0'، شريط سعة h-1.5 بتدرج `#fbbf24→#f59e0b` (يتحول `#ef4444→#dc2626` عند الامتلاء)، وحد أخضر `rgba(34,197,94,0.3)` للبطاقة المحجوزة. الجهة المقابلة واحدة من 3 حالات: «✅ محجوز» (pill أخضر) / «🚫 مكتمل» (pill أحمر، عندما `bookedCount >= maxPlayers||20`) / زر «احجز» بتدرج ذهبي (نص أسود؛ يصبح `...` معطّلاً 50% أثناء طلب الحجز لذلك النشاط).
  - **شارة «👥 {n} لاعب حجزوا»** (فقط إذا كان في `followingBookers` بيانات): تفتح قائمة قابلة للطي (height 0→auto + fade، واحدة مفتوحة في كل مرة): avatar دائري 5×5 (صورة أو 🎭)، الاسم، `Lv.{level}`، ثم ⭐ (تتابعه) أو 👤 (لاعب).
  - **قسم الغرف النشطة** (فقط إذا محجوز وله غرف): فاصل علوي، عنوان «🎮 الغرف المتاحة حالياً:»، صفوف روابط (اسم الجلسة أو «غرفة {i+1}» + pill ذهبي مصمت «دخول ←») تنقل إلى `/player/join?code={sessionCode}`.
  - **تبويب تاريخ المباريات**: حالة فارغة «لم تلعب أي مباراة بعد». أول 20 صفاً فقط (بلا pagination): «🏆 فوز» أخضر أو «💀 خسارة» أحمر + اسم الدور العربي من `ROLE_NAMES`، التاريخ + «{n} لاعب» اختياري، وفي الطرف «🛡️ نجا» cyan أو «☠️ أُقصي» رمادي. حد البطاقة أخضر للفوز/أحمر للخسارة بشفافية 0.15. منطق الفوز محسوب client-side: قائمة أدوار المافيا {GODFATHER, SILENCER, CHAMELEON, WITCH, OLDER_BROTHER, MAFIA_REGULAR}؛ فوز = (مافيا وwinner=MAFIA) أو (غير مافيا وwinner=CITIZEN).
  - **Modal A — تفاصيل النشاط (bottom sheet)**: backdrop يمتد من الأعلى حتى `bottom-20` (يترك الـ bottom-nav ظاهراً — قرار تصميمي غريب يجب حسمه في Flutter)، `bg-black/90 backdrop-blur-md`. الورقة سفلية على الموبايل/وسطية ≥sm، خلفية تدرج `#111827→#000`، انزلاق spring‏ (damping 25, stiffness 200)، مقبض سحب، إغلاق بسحب 80px نحو الأسفل عندما تكون الورقة في أعلى تمريرها (hook ‏`useModalScrollLock`: قفل تمرير body + منع pull-to-refresh — كله workaround ويب لا يُنقل). المحتوى: الاسم، الوصف الاختياري، صفوف 📅 (تاريخ كامل طويل) / 📍 / 👥 / صعوبة / 💰، ثم **carousel العروض** إن وُجدت (`snap-x` أفقي، بطاقات 192px بتوهّج amber ضبابي زخرفي، اسم العرض بسلسلة fallback ‏`name || title || 'عرض {i+1}'`، chip سعر اختياري، وصف اختياري)، وأزرار الأسفل: «احجز الآن 🎟️» (يبدّل إلى Modal B؛ يختفي إن كان محجوزاً) و«📍 الموقع» (anchor خارجي إلى `locationMapUrl` إن وُجد).
  - **Modal B — تأكيد الحجز**: نفس نمط الورقة (`max-w-sm`؛ ملاحظة: swipe-to-close غير موصول فعلياً هنا في الويب). عنوان «تأكيد الحجز»، ملخص 📅/📍/👥/💰، **مُنتقي العروض الإلزامي** إن وُجدت عروض («🎁 اختر العرض المناسب لك *»): أزرار عمودية، المحدد `bg-amber-500/10 border-amber-500` + توهج `0 0 15px rgba(245,158,11,0.15)` + دائرة radio مخصصة؛ **النقر على المحدد يلغي اختياره (toggle)**. خطأ تحقق: «⚠️ يرجى اختيار عرض قبل تأكيد الحجز» بأحمر `animate-pulse`. أزرار: «إلغاء» و«✅ تأكيد الحجز» (يتحول «⏳ جاري...» معطّلاً).
- **الميزات والتفاعلات**:
  - جلب أولي متوازٍ (Promise.all لأربعة طلبات: أنشطة، حجوزاتي، profile→matchHistory، غرفي النشطة) ثم N طلب `following-bookers` منفصل لكل نشاط (fire-and-forget، النتائج تظهر تدريجياً).
  - deep link ‏`?activityId=N` يفتح ورقة التفاصيل تلقائياً بعد تحميل الأنشطة.
  - فلترة التاريخ بمقارنة `toDateString()` بالتوقيت المحلي — في Flutter استخدم `DateUtils.isSameDay` مع الانتباه لمنطقة التوقيت.
  - تدفق الحجز: `offerId` المرسل هو **index في مصفوفة locationOffers وليس DB id** (والـ index 0 آمن لأن الفحص `=== null`) — يجب الحفاظ على العقد حرفياً. نجاح → إضافة الحجز محلياً + زيادة `bookedCount` تفاؤلياً + إغلاق المودال. خطأ بكود `PENDING_SURVEYS` → `alert` ثم تحويل قسري إلى `/player/feedback` (بوابة الاستبيانات الإلزامية قبل الحجز). خطأ آخر → `alert(error || 'خطأ في الحجز')`. فشل الشبكة **مبتلَع بصمت** في الويب (`catch {}`) — يُستحسن في Flutter إظهار toast (تحسين مقصود يُعلَم به كاتب الخطة).
  - قفل تحميل per-activity ‏(`bookingLoading` يحمل id النشاط ويعطّل زرَي الحجز والتأكيد معاً).
  - ملاحظة dead code: زر الحجز في البطاقة فيه فرعا `if/else` متطابقان — لا يُنقل.
  - لا يوجد pull-to-refresh ولا refresh يدوي (البيانات تُجلب مرة عند mount) — يُنصح بإضافة `RefreshIndicator` في Flutter.
- **التصميم**: خلفية داكنة، عرض أقصى 512px موسّط، accent ذهبي/كهرماني (amber)، تدرج CTA ‏`linear-gradient(135deg,#fbbf24,#f59e0b)` بنص أسود، خطوط صغيرة جداً (8–11px) يجب اختبار مقروئية العربية فيها وقفل `textScaleFactor`، عملة الشيكل ₪ كنص، أنيميشنات: fade تبويبات، `layout` للبطاقات، توسيع بارتفاع تلقائي، spring bottom sheets، `animate-pulse` لخطأ العرض، `animate-spin` للـ spinner.
- **API** (كلها REST عبر proxy، والموثّقة منها Bearer بتوكن اللاعب):
  1. `GET /api/player-app/activities/upcoming?playerId={id}` — قائمة الأنشطة بكل حقولها (difficulty/locationOffers/bookedCount/basePrice...).
  2. `GET /api/player-app/{playerId}/bookings` (Bearer) — يُقرأ منها `activityId` فقط.
  3. `GET /api/player/{playerId}/profile` — `matchHistory[]`.
  4. `GET /api/player-app/my-active-rooms` (Bearer) — `rooms[{activityId, rooms[{sessionCode, sessionName?}]}]`.
  5. `GET /api/player-app/activities/{activityId}/following-bookers?playerId={id}` (Bearer) — مرة لكل نشاط.
  6. `POST /api/player-app/book` (Bearer) — `{activityId, offerId?}`؛ خطأ خاص `code:'PENDING_SURVEYS'`.
- **Socket**: لا شيء إطلاقاً في هذه الشاشة.
- **مكافئ Flutter**: ‏`Scaffold` + `ListView` داخل `Center(ConstrainedBox(maxWidth:512))`؛ شريط التقويم `SingleChildScrollView(Row)` مع `AnimatedContainer`؛ تنسيقات التاريخ عبر `intl` بلغة `ar` (يوجد 4 صيغ مختلفة يجب مطابقتها مع مخرجات `toLocaleDateString('ar-JO', …)`)؛ التبويبات `AnimatedSwitcher` بـ fade؛ الأوراق السفلية `showModalBottomSheet(isScrollControlled:true)` + `DraggableScrollableSheet` (تعوّض `useModalScrollLock` بالكامل — لا تنقله)؛ شريط السعة `FractionallySizedBox` بتدرج؛ carousel العروض `ListView` أفقي بـ snap physics؛ radio العروض صفوف مخصصة (Radio القياسي لا يدعم إلغاء الاختيار)؛ الحوارات `showDialog` بدل `window.alert`؛ deep links عبر توجيه حمولة FCM. مخاطر: عقد `offerId=index`، ازدواج قائمة أدوار المافيا مع الـ backend، التحديثات التفاؤلية، مقارنة `basePrice !== '0'` كنص، مسارا الدخول `/player/games?activityId=N` و`/player/join?code=X&invite=1&by=NAME` يجب ربطهما بمسارات Flutter.

---

### مودال دعوة اللاعبين — InviteModal (مكوّن overlay مشترك)

- **الوظيفة والرحلة**: يُفتح من شاشات الغرف عن بُعد (مركّب في `PlayerFlow.tsx` لتدفق اللاعب داخل الغرفة، وفي `/player/host` للوبي المضيف). يتيح للمضيف (دائماً) أو للأعضاء الجالسين (عند تفعيل إعداد `allowPlayerInvites`) دعوة لاعبين مسجلين إلى الغرفة عبر إشعار push من الخادم.
- **الحالات والشاشات الفرعية**:
  - Overlay كامل `z-[70]`، ‏`bg-black/80 backdrop-blur-sm`، ورقة سفلية على الموبايل/بطاقة وسطية ≥sm، `dir="rtl"` صريح، بلا framer-motion (يظهر فورياً)، قفل تمرير body عبر `overflow:hidden` (مع استرجاع القيمة السابقة).
  - اللوحة: `bg-[#0a0a0a]` بحد ذهبي `#C5A059/30`، ‏`max-w-md max-h-[85vh]`، حشوة سفلية `calc(1rem + env(safe-area-inset-bottom))` لـ iOS.
  - رأس: «📨 إرسال دعوة» بذهبي `#C5A059` خط **Amiri** + زر ✕.
  - تبويبان: «الأصدقاء» / «الجميع» (النشط `bg-[#C5A059]/10 border-[#C5A059]/50`).
  - حقل بحث: خلفية `#050505`، حجم خط 16px (يمنع zoom في iOS)، placeholder مختلف لكل تبويب («ابحث بالاسم أو برقم الهاتف كاملاً» / «ابحث في أصدقائك بالاسم»)، وتحت تبويب «الجميع» تلميح anti-enumeration: «رقم الهاتف يُظهر اللاعب فقط عند كتابته كاملاً وصحيحاً.»
  - حالات منطقة النتائج: استعلام < حرفين في «الجميع» → «اكتب اسماً أو رقم هاتف للبحث…»؛ أثناء البحث → «جارٍ البحث…»؛ فارغة → «لا أصدقاء بعد» / «جارٍ التحميل…» / «لا نتائج»؛ صفوف النتائج: avatar ‏9×9 (‏`avatarUrl || '/avatars/male.png'` مع onError إلى نفس الافتراضي)، اسم، وزر دعوة.
  - آلة حالات زر الدعوة per-player: idle (إطار ذهبي، «دعوة») → sending (`#222` رمادي، «…»، معطّل) → sent («✓ أُرسلت» زمردي، معطّل بشكل دائم لعمر المودال) أو error (يعود idle — retry ممكن).
  - Toast داخل اللوحة (`bottom-3 inset-x-3`، نص ذهبي، يختفي بعد 2500ms): «تم إرسال الدعوة إلى {name}» أو نص خطأ الخادم أو «تعذّر إرسال الدعوة».
- **الميزات والتفاعلات**:
  - تبويب الأصدقاء: يُحمَّل مرة واحدة لكل فتح (حارس `friendsLoaded`)؛ فلترة محلية بـ substring (حسّاسة لحالة الأحرف).
  - تبويب الجميع: debounce ‏350ms، يعمل من حرفين فأكثر؛ الخادم يفرض «اسم جزئي أو هاتف كامل مطابق تماماً».
  - إرسال الدعوة: `emit` مع ack (يصل كـ prop على شكل Promise من socket الأب). لا يُغلق المودال تلقائياً بعد النجاح — يمكن دعوة عدة أشخاص ثم الإغلاق بـ ✕ أو النقر خارجاً.
  - قواعد الخادم المؤثرة على UX (كلها ترجع نصوص خطأ عربية تُعرض حرفياً في الـ toast): المرسِل مصادَق كلاعب؛ الغرفة موجودة وremote؛ المرسِل مضيف أو (جالس + `allowPlayerInvites`)؛ لا دعوة للنفس/المضيف/جالس بالفعل؛ المدعو موجود في جدول اللاعبين؛ حد ≤10 دعوات/دقيقة؛ منع تكرار نفس (مرسِل→مدعو) خلال 60 ثانية.
  - أثر جانبي للخادم عند النجاح: push للمدعو بعنوان «📨 دعوة للانضمام» ونص «{inviter} يدعوك للانضمام إلى {roomName}»، نوع `room_invite`، وبيانات `{roomCode, roomName, inviterName, url:'/player/join?code={roomCode}&invite=1&by={inviterName}'}` + نسخة in-app في `player_notifications`.
- **التصميم**: أسود قريب `#0a0a0a`/`#050505`، ذهبي `#C5A059`، زمردي للنجاح، خط Amiri للعنوان — نفس لغة تصميم الاستضافة عن بُعد.
- **API**: ‏`GET /api/player-app/{myId}/following` (Bearer) لتبويب الأصدقاء، و`GET /api/player-app/search?q={term}` (Bearer) لتبويب الجميع. fallback للتوكن: `localStorage['mafia_player_token']` عند غياب توكن الـ context — في Flutter من `shared_preferences`/التخزين الآمن.
- **Socket**: **emit مع ack** واحد فقط: `room:invite-player` بحمولة `{roomId, inviteePlayerId}`؛ الرد `{success:true}` أو `{success:false, error}`. لا يوجد أي `on` listeners.
- **مكافئ Flutter**: ‏`showModalBottomSheet` + `StatefulBuilder`؛ debounce بـ `Timer`؛ toast داخل اللوحة بـ `AnimatedOpacity` (لا SnackBar — للحفاظ على التصميم)؛ avatar ‏`Image.network` مع `errorBuilder` → أصل مضمّن `assets/avatars/male.png`؛ الـ socket يُمرَّر عبر constructor/provider محاكياً عقد `emit(event,data) → Promise`. مخاطر: عرض أخطاء الخادم حرفياً (لا تعميم للرسائل)، الإبقاء على حد الحرفين + debounce لحماية الخادم، واستقبال دعوات الطرف الآخر يتطلب FCM + توجيه نقرة الإشعار بحمولة `{roomCode, roomName, inviterName, url}` (حقل url بصيغة مسار ويب يجب ترجمته لمسار Flutter).

---

### زر واتساب — WhatsAppButton (مكوّن مشترك صغير)

- **الوظيفة والرحلة**: زر دائري يفتح `https://wa.me/{رقم دولي}`. حالياً مستهلَك في صفحات الأدمن فقط (`admin/activities/[id]`، `admin/players`) لكنه مكوّن مشترك ضمن هذه الشريحة ويجب توفيره في مكتبة مكوّنات Flutter.
- **الحالات والشاشات الفرعية**: حالتان فقط — ظاهر (رقم صالح) أو **لا يُرسم شيء** (رقم ناقص/غير صالح: أقل من 11 خانة بعد التطبيع).
- **الميزات والتفاعلات**: تطبيع `toWaNumber`: إزالة كل ما ليس رقماً؛ بادئة `00` تُحذف؛ صفر بادئ يُستبدل بـ `962` (الأردن)؛ الأرقام الدولية `962…` تمرّ كما هي. ‏`stopPropagation` عند النقر (آمن داخل صفوف قابلة للنقر). يفتح في تبويب خارجي (`noopener noreferrer`).
- **التصميم**: دائرة بقياس `size+12` (افتراضي 27px)، خلفية `#25D366/15` تتحول `/30` عند hover، شعار واتساب SVG مضمّن بـ `currentColor` بالأخضر الرسمي `#25D366`، ‏`aria-label` «فتح محادثة واتساب».
- **API**: لا شيء. **Socket**: لا شيء.
- **مكافئ Flutter**: ‏`url_launcher` بـ `LaunchMode.externalApplication`؛ نقل دالة التطبيع حرفياً (حذف 00، ‏0→962، فحص ≥11 خانة، إرجاع لا-شيء عند الفشل)؛ الشعار عبر `flutter_svg` أو أيقونة خطية.

---

### Host Console — شاشة إنشاء الغرفة (`/player/host` قبل وجود gameState)

- **الوظيفة والرحلة**: لاعب مخوَّل بالاستضافة يدخل `/player/host` ليكون **مُوجِّهاً لا لاعباً** (لا دور ولا مقعد له). يضبط اسم الغرفة والسعة وكل إعدادات اللعبة مقدَّماً ثم ينشئ الغرفة بـ `room:create-remote`.
- **الحالات والشاشات الفرعية**: بطاقة نموذج واحدة (`max-w-md`) فوقها eyebrow ذهبي mono ‏«Remote Play · Host» وعنوان «استضافة غرفة عن بُعد» وشرح «أنت المُوجِّه (لا لاعب)...». حالة زر الإنشاء: «🌐 إنشاء الغرفة» / «جارٍ الإنشاء…» / «جارٍ الاتصال…» (معطّل عند انقطاع socket). صندوق خطأ أحمر inline عند الفشل (بما فيه خطأ التخويل «غير مصرّح لك» لغير المدرجين في القائمة البيضاء — مع نص التذييل الإرشادي بمراسلة الأدمن). تحذير أصفر «يجب تسجيل الدخول كلاعب أولاً.» إذا لم يوجد `player` context.
- **الميزات والتفاعلات** (كل الإعدادات العشرة قبل الإنشاء، emit واحد):
  - اسم الغرفة (افتراضي «غرفة عن بُعد»)؛ عدد اللاعبين رقم مثبَّت 6–50 (افتراضي 12).
  - «🌙 وضع الليل»: الليل الأوتوماتيكي **إلزامي** عن بُعد؛ range slider ‏5–60 بخطوة 5 (`accent-[#C5A059]`) مع القيمة الحية «{n}ث» بذهبي mono.
  - «⏱️ مؤقّت اللعبة»: 4 أزرار segmented ‏[مطفأ، 30 د، 60 د، 90 د].
  - «⚖️ نظام العقوبات»: stepper ‏−/+ ‏(1–10) + pills نطاق: «كامل الغرفة» (`room`) / «كل لعبة» (`game`).
  - «💣 قنبلة الأب الروحيّ»: «مفعّلة» (صبغة حمراء `bg-red-500/15 border-red-600`) / «معطّلة».
  - «🗣️ غرفة تشاور المافيا السرّية»: مفعّلة (زمردي) / معطّلة.
  - «📨 دعوة اللاعبين لأصدقائهم»: «مسموح» (sky) / «للمضيف فقط» + نص مساعد يشرح أن التفعيل يُظهر زر الدعوة لكل لاعب.
  - «🎙️ أقصى عدد تبريرات»: رقم 1–5 (افتراضي 2).
- **التصميم**: لغة الـ Host الكاملة: خلفية صفحة `#050505`، بطاقات `#0a0a0a` وحدود `#1a1a1a`/`#222`، ذهبي `#C5A059` وتدرجات CTA ‏`from-[#C5A059] to-[#b38b47]` بتوهج `0 0 18–20px rgba(197,160,89,.3-.4)` ونص أسود، class عام `btn-premium`، خط Amiri للعناوين وmono بـ `tracking-widest` للملصقات اللاتينية.
- **API**: لا شيء (Socket فقط).
- **Socket**: emit ‏`room:create-remote` بحمولة `{gameName, maxPlayers, maxJustifications, maxPenalties, penaltyScope:'room'|'game', autoNightTime, gameTimerMinutes, bombEnabled, mafiaChatEnabled, allowPlayerInvites}` — الرد `res.roomId` يُحفظ.
- **مكافئ Flutter**: نموذج بـ `TextFormField` و`Slider(min:5,max:60,divisions:11)` ذهبي وsegmented buttons وsteppers مخصصة؛ الحالة في HostGameController ‏(Riverpod/Bloc). مخاطر: التخويل server-side (اعرض نص الإرشاد)، وتعطيل الزر حسب حالة اتصال الـ socket.

---

### Host Console — الهيكل العام داخل اللعبة (In-game Shell)

- **الوظيفة والرحلة**: بعد وجود `gameState` تتحول الصفحة إلى قشرة ثابتة توجّه الجسم حسب الطور، مع صوت/فيديو وحلقة طاولة بعين المضيف.
- **الحالات والشاشات الفرعية**:
  - **رأس لاصق** (`sticky top-0 z-20`، ‏`bg-[#050505]/95 backdrop-blur`): يمين — mono ذهبي «🌐 HOST · {roomCode}»؛ يسار — (أ) زر كهرماني «⤴️ إلغاء اللعبة» (يظهر فقط عندما الطور ليس LOBBY ولا GAME_OVER؛ `confirm` «إلغاء اللعبة الحالية والعودة للوبي؟ (يبقى اللاعبون في الغرفة)» ثم `room:reset-to-lobby`)، (ب) chip اتصال «● متصل» أخضر / «○ منقطع» أحمر.
  - **Toast خطأ** ثابت أسفل (`bottom-4 inset-x-4 z-40`، بطاقة حمراء) يختفي بعد 4 ثوانٍ — حالة `error` واحدة يتشاركها كل الأبناء عبر `setError`.
  - **لوحة RemoteVoice** (فقط `config.isRemote`): ‏`isHost=true`، ‏`selfPhysicalId=null`، ‏`enabled=!!phase`، ‏`allowedPids` من `useActiveSpeaker`، وترجع `voiceMaps {videoByPid, audioByPid}` للحلقة. تليها `ConfrontationControls` ‏(`myPid=null`، ‏`isHost=true`).
  - **شريط إحصاءات** (remote + طور لعب + roster غير فارغ): 3 بطاقات — الأحياء (زمردي mono 17px)، مافيا أحياء (أحمر؛ محسوب من الأدوار ∈ MAFIA_ROLES)، اسم الطور المختصر بذهبي من خريطة `PHASE_SHORT`: لوبي/أدوار/ربط/نقاش/تصويت/دفاع/كشف/تعادل/ليل/صباح/نهاية.
  - **حلقة المضيف** (`PhoneSpectatorView`): تُعرض فقط في MORNING_RECAP / DAY_DISCUSSION / DAY_JUSTIFICATION / DAY_ELIMINATION / ELIMINATION_PENDING / DAY_REVEALED / DAY_TIEBREAKER / GAME_OVER (التصويت والليل لهما UI مستقل عمداً). props: ‏roster كامل، ‏`physicalId="-1"`، ‏`revealRoles` (المضيف يرى كل الأدوار)، ‏`hostView`، خرائط الكاميرا/التحدث، و`winnerReveal={winner, players}` عند GAME_OVER — المكوّن نفسه شريحة أخرى، لكن الواجهة (props) يجب تعريفها أولاً.
  - **InviteModal** كطبقة عند `showInvite`.
  - طور غير معروف → `PhaseLoading` «الطور «{phase}»» (حلقة spinner ‏8×8 بحد علوي ذهبي).
- **الميزات والتفاعلات**:
  - **استئناف الجلسة**: ‏roomId في `localStorage['mafia_host_room']`؛ عند الاتصال: `room:rejoin-host` بالمحفوظ (الفشل يمسحه)، وإلا `room:my-hosted-room` (استئناف من أي جهاز)؛ ثم refresh كامل.
  - **Polling**: ‏`game:get-state` كل 2.5 ثانية + refresh بعد كل حدث بث.
  - **Overlays مقاومة للـ poll (حرجة — أخطاء سباق مُصلَحة بالفعل في الويب)**: (1) `revealOverrideRef` — طور DAY_REVEALED هو **طور client فقط**؛ الخادم يبقى على DAY_ELIMINATION، و`applyState` يفرض الطور المحلي حتى يتقدم الخادم (بدونه يختفي زر «بدء الليل»). (2) `policewomanChoiceRef` — بيانات حدث `policewoman:choice-available` تُحقن في كل poll أثناء MORNING_RECAP فقط (تُمسح في غيره). النقل الحرفي لهذين المنطقين إلزامي.
- **التصميم**: كما في لغة الـ Host أعلاه؛ أنيميشنات `animate-pulse` (مؤقت حرج/أزرار غير مكشوفة/CTA الفائز)، `animate-spin`، ‏`active:scale-95`/`active:scale-[0.99]`، وأشرطة تقدم `transition-all duration-500`.
- **API**: لا شيء (صور الـ avatars طلبات `<img>` عادية: الأصلية + thumb مشتق `/uploads/avatars/thumbs/{id}.webp` عبر `avatarThumb` مع fallback مرة واحدة للأصل).
- **Socket** (قشرة): emits — ‏`game:get-state`، ‏`room:rejoin-host`، ‏`room:my-hosted-room`، ‏`room:reset-to-lobby`. listeners — ‏`game:state-sync`/`game:state-updated` (تطبيق الحالة مع الـ overlays)؛ و`game:phase-changed`, `game:started`, `room:player-joined`, `room:player-updated`, `room:player-kicked`, `player:seat-changed`, `night:morning-recap`, `game:over`, `day:voting-started` (كلها → إعادة جلب الحالة)؛ ‏`policewoman:choice-available`؛ ‏`day:elimination-revealed`؛ و`connect`/`disconnect` لشريحة الاتصال وإعادة الانضمام.
- **مكافئ Flutter**: ‏HostGameController واحد يملك `gameState` + الـ refs الثلاثة (revealOverride, policewomanChoice, poolSignature)؛ ‏`Timer.periodic(2.5s)`؛ ‏`shared_preferences` للمفتاح `mafia_host_room`؛ رأس لاصق بعمود ثابت أو `SliverAppBar`؛ toast عبر overlay أحمر 4 ثوانٍ. مخاطر إضافية: **wake lock إلزامي** (`wakelock_plus`) لسطح إشراف طويل، وإعادة الاتصال يجب أن تعمل عند `AppLifecycleState.resumed` لأن الموبايل يقطع الـ socket في الخلفية.

---

### Host Console — اللوبي (HostLobby + RoomCodeCard)

- **الوظيفة والرحلة**: إدارة الغرفة قبل البدء: مشاركة الكود، الدعوات، roster حي مع طرد/عقوبة، سعة، إعدادات حية، وبدء توزيع الأدوار.
- **الحالات والشاشات الفرعية**:
  - **RoomCodeCard**: البطاقة كلها زر (حد ذهبي `#C5A059/40` وخلفية `/5`، ‏`active:scale-[0.99]`)؛ caption يتبدل «رمز الغرفة — اضغط للنسخ» ↔ «✓ تم النسخ» (ثانيتان)؛ الكود mono ‏`text-3xl font-black` ذهبي بـ `tracking-[0.3em]` و**`dir="ltr"` قسري**؛ نسخ عبر clipboard API مع fallback ‏`execCommand`؛ لا تُرسم بلا كود.
  - زر «📨 إرسال دعوة للاعبين» (sky outline كامل العرض) → InviteModal.
  - زر «⚙️ إعدادات اللعبة» (ذهبي) → HostSettingsModal.
  - صف السعة: «اللاعبون {n} / {max}» + stepper ‏−/+ بأهداف لمس 44×44، مثبَّت 6–50 عبر `room:update-max-players`.
  - **Roster** (لاعبون `!seatHeld` مرتبون بـ physicalId): حالة فارغة — بطاقة بحد متقطع، 🎴، بخط Amiri «بانتظار انضمام اللاعبين…» + تلميح مشاركة الكود. صف اللاعب (accordion — واحد مفتوح): avatar دائري 36px (thumb ثم fallback للأصل مرة واحدة عبر حارس `dataset.fb`؛ ثم 👨/👩 حسب الجنس) عليه **نقطة اتصال** (زمردية `isConnected!==false` / رمادية zinc منقطع)، ‏`#{physicalId}` ذهبي mono، الاسم (باهت white/40 عند الانقطاع)، نقاط عقوبات (فقط إن >0: عدد `maxPenalties` نقطة تمتلئ بالأحمر حتى العدد)، سهم ▾/▴. الإجراءات عند التوسيع: «⚠️ عقوبة» (كهرماني، ‏`leader:record-penalty` ثم طي) و«✕ طرد» (أحمر → مودال تأكيد).
  - **مودال تأكيد الطرد**: ‏`z-50` ‏`bg-black/80 backdrop-blur-sm`، بطاقة `max-w-xs` بحد أحمر، ✕، «طرد {name}؟»، «تأكيد الطرد» (أحمر) / «إلغاء»؛ النقر على الخلفية يلغي.
  - **المقاعد المحجوزة** (لاعبون `seatHeld===true`، فقط إن وُجدوا): chips «‏#{id} {name} ✕» → `room:release-held-seat`.
  - **زر البدء**: ≥6 لاعبين → «🎴 بدء توزيع الأدوار» بتدرج ذهبي متوهج → `room:start-generation`؛ وإلا زر داكن معطّل «🎴 بدء التوزيع — {n}/6 لاعبين».
  - أسفل اللوبي (على مستوى الصفحة): «🗑️ إلغاء الغرفة وإغلاقها» (أحمر، ‏`confirm` «إلغاء الغرفة وإخراج كل من انضمّ؟» → `room:close-event` + مسح localStorage والحالة → العودة لشاشة الإنشاء).
- **الميزات والتفاعلات**: كل الإجراءات خلف علم `busy` (تسلسلية، منع النقر المزدوج)؛ الطرد بخطوتين؛ نسخ الكود بردّ فعل بصري ثانيتين.
- **التصميم**: لغة الـ Host نفسها؛ أهداف لمس ≥44px مقصودة.
- **API**: لا شيء.
- **Socket** (emits): ‏`room:update-max-players {roomId, maxPlayers}`، ‏`leader:record-penalty {roomId, targetPhysicalId}`، ‏`room:kick-player {roomId, physicalId}`، ‏`room:release-held-seat {roomId, physicalId}`، ‏`room:start-generation {roomId}`، ‏`room:close-event {roomId}`.
- **مكافئ Flutter**: ‏`Clipboard.setData` (بلا fallback) + اقتراح `HapticFeedback.lightImpact` (إضافة، الويب بلا haptics)؛ accordion بـ `AnimatedSize`؛ حوارات `showDialog`؛ avatars بـ `CachedNetworkImage` (thumb → errorWidget يجرّب الأصل → emoji) مع نقل regex ‏`avatarThumb` إلى Dart؛ الكود داخل `Directionality(TextDirection.ltr)`.

---

### Host Console — مودال الإعدادات الحية (HostSettingsModal)

- **الوظيفة والرحلة**: تعديل إعدادات الغرفة من اللوبي دون إعادة إنشاء؛ يُهيَّأ من `gameState.config` ويُحفظ بـ emit واحد ثم يتحدث الـ UI من إعادة بث الخادم.
- **الحالات والشاشات الفرعية**: ‏overlay ‏`z-[70]` ‏`bg-black/80 backdrop-blur-sm`؛ ورقة سفلية على الموبايل (`rounded-t-2xl`) / وسطية ≥sm؛ ‏`max-w-md max-h-[88vh]`؛ قفل تمرير body أثناء الفتح؛ الخلفية تُغلق والنقر الداخلي stopPropagation. رأس ذهبي Amiri «⚙️ إعدادات اللعبة» + ✕. محتوى قابل للتمرير: 🏷️ اسم الغرفة (maxLength 60)؛ ⏱️ مهلة فعل الليل stepper ‏5–60 («ث»)؛ ⏳ مؤقت اللعبة stepper ‏0–180 دقيقة («0 = مطفأ»؛ القيمة الأولية `gameTimerEnabled ? (gameTimerMinutes||30) : 0`)؛ 🎙️ أقصى تبريرات 1–5؛ ⚠️ أقصى عقوبات 1–10؛ 📋 نطاق العقوبة pills «الغرفة»/«اللعبة»؛ 💣 toggle القنبلة؛ 🗣️ toggle دردشة المافيا؛ 📨 دعوات اللاعبين «مسموح» (sky) / «للمضيف فقط»؛ شريط خطأ أحمر inline عند فشل الحفظ. ملاحظة: لا حقل maxPlayers هنا — السعة تُعدَّل فقط من stepper اللوبي.
- **الميزات والتفاعلات**: زر «💾 حفظ الإعدادات» (`btn-premium`) → «جارٍ الحفظ…» → عند النجاح «✓ حُفظت» ثم إغلاق تلقائي بعد 700ms.
- **التصميم**: لغة الـ Host؛ toggles زمردية للنعم/داكنة للا.
- **API**: لا شيء.
- **Socket**: ‏`room:update-settings {roomId, gameName, autoNightTime, gameTimerMinutes, maxJustifications, maxPenalties, penaltyScope, bombEnabled, mafiaChatEnabled, allowPlayerInvites}` → ‏`{success, error?}`.
- **مكافئ Flutter**: ‏`showModalBottomSheet(isScrollControlled:true, maxHeight 88%)` — قفل التمرير تلقائي؛ تسلسل الحفظ/النجاح/الإغلاق بـ `Future.delayed(700ms)`.

---

### Host Console — توليد الأدوار (طور ROLE_GENERATION)

- **الوظيفة والرحلة**: تركيب حزمة الأدوار (role pool) — **مفوَّض بالكامل** إلى `LeaderRoleConfigurator` من شريحة الليدر بالـ props ‏`{gameState, emit, setError, hideMafiaChat}` (‏`hideMafiaChat` يخفي toggle دردشة المافيا هناك لأن المضيف يضبطها في إعدادات الغرفة).
- **الحالات/الميزات/التصميم/API/Socket**: كلها ملك شريحة الليدر — يجب نقلها هناك.
- **مكافئ Flutter / مخاطر**: خطة Flutter للـ Host **ناقصة بدون** مكوّنات الليدر المفوَّض إليها (هذا الطور + الليل اليدوي + تدفق الشرطية + تأجيل العمدة + قنبلة الأب الروحي). حراس التوجيه يجب حفظها حرفياً: ‏`pendingResolution.type==='MAYOR_POSTPONED'` أو `pendingBomb` → ‏LeaderDayView؛ ‏`nightMode!=='auto'` أو `policewomanChoice` → ‏LeaderNightView.

---

### Host Console — ربط الأدوار (HostRoleBinding، طور ROLE_BINDING)

- **الوظيفة والرحلة**: إسناد الأدوار الخاصة للاعبين محددين، توزيع عشوائي للباقي، تأكيد ودفع الأدوار لأجهزة اللاعبين، ثم قفل الهويات وبدء اللعبة.
- **الحالات والشاشات الفرعية**:
  - شريط ملخص 3 أعمدة: إجمالي الأدوار / الخاصة المسندة «x/y» (زمردي) / عدد المواطنين (ذهبي).
  - قسم «الأدوار الخاصّة — وزّعها كلها»: صف لكل دور خاص — emoji الدور + الاسم العربي (أحمر باهت `#e08a8a` للمافيا / sky ‏`#8fc3ea` لغيره)؛ صبغة الصف عند الإسناد: مافيا `border-[#8A0303]/30 bg-[#8A0303]/5`، غير مافيا `border-[#265e33]/30 bg-[#0d1a0d]`، غير مسند محايد؛ ‏`<select>` كامل العرض («— اختر لاعب —» + الأحياء غير المسندين أو المسند لهذا الـ slot)؛ زر قفل 🔒/🔓 ‏(28px، ذهبي عند القفل) يظهر بعد الإسناد.
  - بطاقة المواطنين: «👤 المواطنون ({n}) — يُوزَّعون تلقائياً على الباقين» + chips بالأسماء أو «—».
  - صف «🎭 المافيا تعرف بعضها» بمفتاح pill مخصص (مسار ذهبي عند التفعيل، مقبض أبيض ينزلق start↔end بوعي RTL) — toggle تفاؤلي محلي + ‏fire-and-forget ‏`room:update-mafia-reveal` (الأخطاء مبتلعة)؛ القيمة الأولية `config.allowMafiaReveal !== false`.
  - أزرار: «🎲 توزيع عشوائيّ للباقي» / «📨 تأكيد الأدوار وإرسالها» (معطّل إن بقي خاص غير مسند أو مؤكَّد سابقاً؛ يتحول زمردياً «✅ تمّ التأكيد والإرسال للاعبين») / ‏`btn-premium` «🔒 قفل الهويّات وبدء اللعبة» (يتطلب التأكيد وإلا خطأ «أكّد الأدوار أولاً») + تلميح كهرماني «تبقّى {n} دور خاصّ بلا توزيع».
- **الميزات والتفاعلات**:
  - **منطق حالة حرج**: الـ slots تُهيَّأ من `gameState.rolesPool` **فقط عند تغيّر توقيع JSON للحزمة** (`poolInitRef`) — لأن poll الـ 2.5 ثانية يعيد إنشاء هوية المصفوفة وكانت إعادة التهيئة الساذجة تمسح الإسنادات والأقفال الجارية. انقل الحارس حرفياً (أو مقارنة deep-equality).
  - تدفق الإسناد: تعيين محلي تفاؤلي → ‏`setup:unbind-role` (إن كان استبدالاً) ثم `setup:bind-role`؛ عند الخطأ → إرجاع الـ slot للقيمة السابقة + عرض الخطأ. أي إسناد يدوي يصفّر علم `rolesConfirmed`.
  - العشوائي يرسل `lockedPhysicalIds` ويعيد بناء الـ slots من `res.state` محافظاً على أعلام القفل.
- **التصميم**: لغة الـ Host؛ أحمر المافيا العميق `#8A0303`.
- **API**: لا شيء.
- **Socket** (emits): ‏`setup:bind-role {roomId, physicalId, role}`، ‏`setup:unbind-role {roomId, physicalId}`، ‏`setup:random-assign {roomId, lockedPhysicalIds}` (يرجع `res.state`)، ‏`setup:confirm-roles {roomId}`، ‏`setup:binding-complete {roomId}`، ‏`room:update-mafia-reveal {roomId, allowMafiaReveal}`.
- **مكافئ Flutter**: قوائم الاختيار عبر bottom-sheet picker (أفضل من `DropdownButtonFormField` لقوائم لاعبين طويلة)؛ مفتاح pill بـ `AnimatedAlign`؛ نقل نمطَي «تفاؤلي مع rollback» و«حارس توقيع الحزمة» كما هما.

---

### Host Console — نقاش النهار (HostDayControls / DiscussionDock، طور DAY_DISCUSSION)

- **الوظيفة والرحلة**: المضيف يدير جولة الكلام: يختار البادئ والوقت، ثم يشغّل/يوقف/يقدّم/يرجع المتحدثين ويضبط المؤقت، وعند الانتهاء يطلق التصويت.
- **الحالات والشاشات الفرعية**:
  - **إعداد** (`!discussionState`): بطاقة «بدء جولة النقاش» (Amiri ذهبي): «من يبدأ؟» شبكة chips للأحياء (‏#id + اسم؛ المحدد ذهبي مصمت بنص أسود؛ الافتراضي أول حي)، «الوقت لكل لاعب» presets ‏[15، 30، 45، 60، 90] ثانية (افتراضي 30)، CTA «▶ ابدأ الدوران»؛ خطأ «اختر لاعب البداية» إن لم يُختَر.
  - **حي (live)**: لوحة ضبط اختيارية (زر ⏱ يفتحها): شبكة 4 أعمدة [+30، +10، −10، −30] (ذهبي للزيادة/أحمر للنقص) + «🔄 إعادة الوقت من البداية». صف الحالة: «الدور: ‏#{id} {name}» (أو «🔇 مُسكَت» إن كان المتحدث الحالي `isSilenced`) + mono «طابور {n} · تكلّم {m}». صف التحكم: ⏭ متحدث سابق (معطّل إذا لم يتكلم أحد) / زر مركزي: «⏸ إيقاف» أثناء SPEAKING، وإلا «▶ ابدأ» (WAITING→START) أو «▶ استئناف» (RESUME) بتدرج ذهبي / «⏮ التالي» بتدرج أحمر داكن `from-[#3a1513] to-[#230d0c]` نص `#eba9a4` / ⏱ فتح لوحة الضبط (ذهبي عند الفتح). **تنبيه**: الأيقونتان ⏭/⏮ معكوستان عمداً لأجل RTL ‏(⏭ = السابق، ⏮ = التالي) — لا «تصلحها» دون مراجعة أصحاب المنتج.
  - **انتهاء النقاش** (`isFinished`): بطاقة «انتهت جولة النقاش» + ملاحظة mono «الصفقات تُؤخذ تلقائياً ممّا سجّله اللاعبون» (المضيف لا يسجل صفقات في remote)؛ «مدّة التصويت» presets ‏[بدون(null)، 10، 20، 30] ثانية → CTA «🗳️ بدء التصويت».
- **الميزات والتفاعلات**: مؤشر المتحدث المُسكَت؛ عدادات الطابور/المتكلمين؛ كل الأزرار خلف `busy`.
- **التصميم**: لغة الـ Host.
- **API**: لا شيء.
- **Socket** (emits): ‏`day:start-discussion {roomId, startPhysicalId, timeLimitSeconds}`، ‏`day:timer-action {roomId, action:'START'|'PAUSE'|'RESUME'|'RESET'}`، ‏`day:adjust-timer {roomId, phase:'DISCUSSION', delta:±10|±30}`، ‏`day:prev-speaker` / `day:next-speaker` ‏`{roomId}`، ‏`day:start-voting {roomId, durationSeconds?}` ‏(undefined = بلا حد).
- **مكافئ Flutter**: ‏chips بـ `Wrap`؛ لا مؤقت محلي سلطوي — الحالة من الخادم عبر poll/بث.

---

### Host Console — التصويت (HostVoting، طور DAY_VOTING — UI مستقل بلا حلقة فوقه)

- **الوظيفة والرحلة**: المضيف يراقب التصويت الحي القادم من أجهزة اللاعبين ويصوّت بالوكالة عن المعلَّقين، ثم يحسم عند اكتمال النصاب.
- **الحالات والشاشات الفرعية**:
  - تحميل: `PhaseLoading` 🗳️ «جارٍ تحضير التصويت…» حتى وصول `votingState`.
  - ‏`PhaseHeader` 🗳️ «مرحلة التصويت» / سطر لاتيني «VOTING».
  - صف رأس: عدّادا فريقين «🏛 {مواطنون}» أخضر | «🎭 {مافيا}» أحمر (محسوبة من أدوار الأحياء — معرفة المضيف فقط)؛ chip نمط (إطار ذهبي): «مباشر» / «إعادة» (tieBreakerLevel 1) / «مُضيّق» (≥2) / «🎩 بأمر العمدة» (إعادة العمدة)؛ عدّاد كبير `{totalVotesCast}/{aliveCount}` ‏(`vs.totalVotesCast` مفضَّل لأن ثقل صوت العمدة ×2 لا يستهلك مصوّتَيْن؛ الاحتياط = مجموع أصوات المرشحين).
  - **شبكة المرشحين** (3 أعمدة): بطاقة لكل مرشح — شارة عدد الأصوات (pill أحمر `#b0362f` عائم أعلى، فقط عند >0)، ‏avatar ‏40px (صورة أو emoji جنس)، «‏#{pid} {name}»، «🤝 صفقة» بذهبي إذا `type==='DEAL'`، تلميح «اضغط للتصويت» عند تسليح مصوّت؛ حد البطاقة يتحول sky + ‏`active:scale-95` عند التسليح؛ معطّلة/باهتة بدونه.
  - **شريط المصوّتين بالوكالة**: سطر تعليمات «صوِّت بالوكالة — اختر مصوِّتاً معلّقاً ثم اضغط مرشّحاً · اضغط مَن صوّت للتراجع». ‏chips لكل حي: معلّق = محايد؛ محدد = sky + ‏`scale-105`؛ صوّت بنفسه = زمردي + ✅؛ صوّت بالوكالة = كهرماني + 🟠؛ chip العمدة يظهر «🎩×{mayorVoteWeight}» فقط عند `mayorState.revealed` (الوزن من `config.mayorVoteWeight` افتراضي 2).
- **الميزات والتفاعلات**:
  - تصويت بنقرتين: تسليح المصوّت → نقر المرشح → `day:cast-vote {candidateIndex, delta:1, voterPhysicalId}` ثم مسح التحديد تلقائياً؛ خطأ «اختر مصوِّتاً أولاً» عند نقر مرشح دون تسليح.
  - تراجع: نقر chip من صوّت يسحب صوته الفعلي (‏`delta:-1` على الـ candidateIndex الموجود في `leaderProxyVotes[pid] ?? playerVotes[pid]`).
  - أزرار سفلية: «🔓 مباشر» (إلغاء التضييق؛ يظهر فقط إذا النمط ≠ مباشر وليس إعادة العمدة) → `day:un-narrow`؛ زر ⏰ ‏timeout (فقط أثناء عدم الاكتمال؛ tooltip «تصويت الغائبين على أنفسهم») → `day:voting-timeout`؛ ‏«⚖️ حسم التصويت» ‏(`btn-premium`؛ مفعّل فقط عند `totalVotes >= alive.length`) → `day:resolve`.
  - تحديد المصوّت يُصفَّر عند تغيير الطور.
- **التصميم**: لغة الـ Host؛ تمييز الوكالة (🟠 كهرماني) عن الذاتي (✅ زمردي).
- **API**: لا شيء.
- **Socket** (emits): ‏`day:cast-vote`، ‏`day:un-narrow`، ‏`day:voting-timeout`، ‏`day:resolve` — كلها بـ `{roomId, …}`.
- **مكافئ Flutter**: ‏`GridView.count(crossAxisCount:3)` للمرشحين و`Wrap` للـ chips؛ حالة «مصوّت مسلَّح» متغير واحد في الـ controller.

---

### Host Console — التبرير (HostJustification، طور DAY_JUSTIFICATION)

- **الوظيفة والرحلة**: إدارة دفاعات المتهمين واحداً تلو الآخر بمؤقتات من الخادم، ثم شاشة القرار (سحب أصوات/نصاب/إجراءات تعادل أو تنفيذ الإقصاء).
- **الحالات والشاشات الفرعية**:
  - تحميل: `PhaseLoading` «جارٍ تحضير التبرير…» حتى وصول `justificationData` — الحقول: ‏`accused[]`، ‏`canJustifyList[]` (الاحتياط accused)، ‏`resultType==='TIE'`، ‏`timer {physicalId, startTime, timeLimitSeconds}`، ‏`votersForAccused[]`، ‏`leaderProxyVotes`، ‏`candidates[]`، إضافة إلى `gameState.withdrawalState {count, needed, withdrawn[]}`.
  - **مرحلة الدفاع** (تكرار على `canJustifyList` بمؤشر محلي `idx`): رأس mono «مُدافِع {idx+1} / {total}» + اسم Amiri «‏#{pid} {name}» + عدّ تنازلي حي من مؤقت الخادم (‏`timeLimitSeconds − (Date.now()−startTime)/1000` بنبضة ثانية محلية): ‏`text-4xl` mono يتحول أحمر + `animate-pulse` عند ≤10 ثوانٍ؛ وإلا «جاهز للدفاع». قبل بدء المؤقت: presets مدة [15، 30، 45، 60] (افتراضي 30) + «▶ ابدأ مؤقّت الدفاع». أثناء التشغيل: شبكة ضبط [+30، +10، −10، −30]. صف سفلي: 🔄 إعادة تعيين / «⏭ التالي ({idx+2}/{n})» أو «✅ إنهاء التبريرات» (يرسل `day:stop-justification-timer` مع تجاهل أخطائه ثم يتقدم أو يعلن الانتهاء).
  - قواعد إعادة الضبط: ‏idx/allDone يُصفَّران مرة واحدة عند دخول الطور (حارس ref ضد الـ poll)، ويُصفَّران عند **انكماش** `canJustifyList` (إقصاء إداري أثناء التدفق).
  - **مرحلة القرار** (allDone أو قائمة فارغة): رأس ⚖️ «القرار» / «انتهت التبريرات». بطاقة نصاب السحب (إن وُجد `votersForAccused`): ثلاثية mono كبيرة «{count} مسحوب / {needed} للنصاب من {votersTotal} مصوّت» (العدد يخضرّ عند بلوغ النصاب؛ الاحتياط `needed = ceil(votersTotal/2)`) + شريط تقدم (أزرق → أخضر عند النصاب). بطاقة أصوات الوكالة (برتقالية، إن وُجدت): صفوف «‏#{voter} {name} → #{candidatePid} (متّهم)» (تسمية الهدف حمراء إذا وقع الصوت على متهم) + زر «🗳️ سحب» أزرق لكل صف → ‏`player:withdraw-vote {physicalId}` — **الحمولة بلا roomId عمداً** (الخادم يستنتجها من جلسة الـ socket؛ لا تضفها) — يُستبدل بـ «✓ سُحب» بعد دخوله `withdrawalState.withdrawn`.
  - أزرار القرار — نسخة TIE: «🔁 إعادة التصويت» (أخضر؛ لاحقة «(النصاب ✅)» عند اكتماله) / «🎯 حصر بين المتعادلين» / «💀 إقصاء جميع المتعادلين» — كلها عبر `day:tie-action {action: REVOTE|NARROW|ELIMINATE_ALL, tiedCandidates: accused||candidates}`. نسخة غير TIE: «💀 تنفيذ الإقصاء» (أحمر كبير، ‏`day:execute-elimination {skipWithdrawal:true}`) + «🔁 إعادة التصويت» (tie-action REVOTE).
- **الميزات والتفاعلات**: مؤقتات الخادم هي المرجع (لا سلطة عدّ محلية)؛ ‏Socket إضافية: ‏`day:start-justification-timer {roomId, physicalId, timeLimitSeconds}`، ‏`day:reset-justification-timer` بنفس الحمولة، ‏`day:adjust-timer {phase:'JUSTIFICATION', delta}`.
- **التصميم**: لغة الـ Host + نبضة حمراء للعد الحرج.
- **API**: لا شيء.
- **Socket**: كما في السطور أعلاه (start/reset/stop/adjust justification، ‏player:withdraw-vote، ‏day:tie-action، ‏day:execute-elimination).
- **مكافئ Flutter**: العدّ التنازلي `Timer.periodic(1s)` مشتق من `startTime` + ‏`DateTime.now()`؛ النبضة `AnimationController`؛ نقل حارسَي إعادة الضبط (دخول الطور مرة + انكماش القائمة) حرفياً.

---

### Host Console — الإقصاء والكشف والتعادل (HostElimination — أطوار DAY_ELIMINATION / DAY_REVEALED / DAY_TIEBREAKER)

- **الوظيفة والرحلة**: معاينة المُقصَين وأدوارهم بعين المضيف فقط → بث الكشف للجميع → بدء الليل أو إعلان الفائز؛ ومعالجة التعادل.
- **الحالات والشاشات الفرعية**:
  - **حارس توجيه** في HostDayControls: هذه الأطوار تذهب لـ HostElimination فقط عندما `pendingResolution.type !== 'MAYOR_POSTPONED'` ولا يوجد `pendingBomb`؛ التدفقان الخاصان (تأجيل العمدة/قنبلة الأب الروحي) وأي حالة DAY_* أخرى غير مطابقة تسقط إلى `LeaderDayView` (شريحة الليدر).
  - **صف EliminatedRow المشترك**: ‏avatar ‏40px (‏thumb + ‏fallback مرة) أو «‏#{pid}» ذهبي؛ اسم + id ‏mono؛ chip دور (أيقونة + اسم عربي) — مافيا = chip أحمر وصف مصبوغ أحمر، غيره chip أزرق `#3f83c4` وصف محايد.
  - **DAY_ELIMINATION**: ‏PhaseHeader 💀 «اكتمل التصويت — جاهز للحسم» / «AWAITING REVEAL»؛ بطاقة بملاحظة قفل «🔒 بعين المُوجِّه فقط — لم يُكشف بعد»؛ صفوف `pendingResolution.eliminated[]` بأدوار من `pendingResolution.revealedRoles[]` ‏(fallback ‏player.role ثم 'UNKNOWN')؛ فارغة: «لا مُقصَين هذه الجولة». ‏CTA أحمر متدرج `from-[#8A0303] to-[#5e0202]` بتوهج «💀 كشف الهويّة لجميع اللاعبين» (معطّل بلا pending) → ‏`day:trigger-reveal {result: pendingResolution}`؛ حاشية «الكشف يظهر على حلقة الطاولة عند الجميع».
  - **DAY_REVEALED** (طور client فقط — من بث `day:elimination-revealed` بينما الخادم باقٍ على DAY_ELIMINATION): ‏PhaseHeader 💀 «تمّ كشف الهويّة» / «ELIMINATION COMPLETE»؛ صفوف من `revealedData`؛ فارغة: «لا مُقصَين — يوم بلا إعدام». ثم: إذا `pendingWinner` → CTA ذهبي نابض «🏁 إعلان النتيجة للجميع» (‏`game:confirm-end`)؛ وإلا CTA ذهبي «🌙 بدء مرحلة الليل» → ‏`night:start`؛ إذا رجع `nurseAvailable` → **شاشة الممرضة**: ‏PhaseHeader ⚕️ «الطبيب خارج اللعبة»، بطاقة خضراء «هل تريد تفعيل الممرضة كبديلٍ للحماية هذه الليلة؟»، زران «✅ تفعيل الممرضة» / «بدون ممرضة» (كلاهما ≥44px) → ‏`night:begin-queue {activateNurse:true|false}`.
  - **DAY_TIEBREAKER**: ‏PhaseHeader ⚖️ «حالة تعادل!» / «TIE BREAKER»؛ 4 خيارات مكدسة كاملة العرض (≥48px): «🔁 إعادة التصويت» (ذهبي) / «🎯 حصر التصويت بالمتعادلين» / «🌙 إلغاء التصويت والانتقال لليل» (action CANCEL) / «💀 إقصاء جميع المتعادلين» (أحمر) → ‏`day:tie-action`.
- **الميزات والتفاعلات**: التسلسل معاينة سرّية → كشف واحد مُذاع → ليل/فائز؛ ‏prompt الممرضة يظهر فقط عندما يرجع `night:start` بـ `nurseAvailable`.
- **التصميم**: لغة الـ Host؛ أحمر `#8A0303` للكشف؛ نبض CTA الفائز.
- **API**: لا شيء.
- **Socket**: emits — ‏`day:trigger-reveal`، ‏`night:start` (يقرأ `nurseAvailable`)، ‏`night:begin-queue`، ‏`day:tie-action`، ‏`game:confirm-end`. ‏listener — ‏`day:elimination-revealed {eliminated[], revealedRoles[], pendingWinner?}` الذي يفعّل الـ override المحلي.
- **مكافئ Flutter**: نمذجة DAY_REVEALED كطبقة حالة client صريحة في الـ controller (الخطر الكلاسيكي: نقل ساذج يجعل زر «بدء الليل» يختفي مع كل poll).

---

### Host Console — الليل الأوتوماتيكي (HostNightRunner، طور NIGHT مع `nightMode==='auto'`)

- **الوظيفة والرحلة**: المضيف يُوقّت كل خطوة دور ليلي؛ اللاعبون يختارون من أجهزتهم؛ المضيف يراقب التقدم الحي ويعتمد الخطوة المكتملة (**قراءة فقط — لا يعدّل الاختيارات**). الليل اليدوي (نادر عن بُعد) مفوَّض بالكامل لـ `LeaderNightView`.
- **الحالات والشاشات الفرعية**:
  - رأس: ‏Amiri ذهبي «🌙 الليل — الجولة {round}» + ‏mono «{submitted} / {total} أرسلوا».
  - **خطوة جاهزة** (وصل `night:auto-step-ready` ولم تُرسل): بطاقة وسطية بـ eyebrow ‏«CURRENT STEP»، اسم الدور (Amiri ذهبي)، «‏#{performerPhysicalId} — {performerName}»، «المدة: {customTimer||timeoutSeconds} ثانية»؛ chips تجاوز المدة [15s، 20s، 30s] (المحدد ذهبي مصمت)؛ ‏CTA ذهبي «▶ بدء {roleName}» → ‏`dispatched=true` تفاؤلياً + ‏`night:auto-advance-step {durationSeconds}` (الفشل → خطأ + تراجع dispatched). رابط تخطٍّ باهت «تخطي ←» فقط عند `canSkip && !dispatched` → ‏`night:skip-action {role}`.
  - **قيد التنفيذ** (مُرسلة بلا اعتماد بعد): شريط تقدم ذهبي رفيع (submitted/total%، انتقال 500ms)؛ تعليق mono «اللاعبون يختارون من أجهزتهم...»؛ قائمة موحّدة **بترتيب ثابت** (اتحاد choices ∪ missingPlayers مدموجاً بالـ pid ومُرتّباً مرة واحدة بالمقعد — الصفوف تنقلب في مكانها من «⏳ ينتظر…» إلى «استهدف: ‏#{target} {name}» أو «تخطي» **دون إعادة ترتيب/قفز**)؛ صاحب الدور الحقيقي بشارة ذهبية «صاحب الدور» وصف مصبوغ ذهبياً بتوهج.
  - **اعتماد** (وصل `night:auto-step-approval`): عنوان النسخة remote/readOnly: «✅ اكتملت اختيارات اللاعبين — اعتمِد للمتابعة (لا يمكن التعديل)»؛ قائمة قابلة للتمرير (max-h-64) بكل الاختيارات (الحقيقي أولاً ثم بالـ pid)؛ لكل صف شارات «صاحب الدور» (ذهبي) / «عشوائي» (رمادي، ‏isRandom) / «يدوي» (أخضر)؛ ‏select الهدف («تخطي / لا أحد» + الأحياء) **معطّل للمضيف** (prop ‏`readOnlyChoices` من الصفحة)؛ ‏CTA ذهبي «اعتماد الإجراء» → ‏`night:auto-approve-step {roomId, nextIndex}` — الحمولة **تستبعد مفتاح `modifiedChoices` كلياً** عند readOnly (لا ترسل null — احذف المفتاح؛ نسخة الليدر وحدها ترسل التعديلات).
  - **لوحة عقود السفّاح** (عند `autoNightStep.role==='ASSASSIN'` مع `assassinState`): بطاقة بنفسجية `#6b21a8` «🗡️ عقود السفّاح» بعدّاد «{completedCount}/{totalRequired}»، شريط تقدم بنفسجي، صفوف عقود (✅ منجز أخضر / 🎯 حالي بحد بنفسجي / ⏳ معلّق رمادي) بنص `descriptionAr` أو «اغتيال {targetRole}».
  - **بلا خطوة**: ‏`PhaseLoading` «جارٍ تحضير الخطوة التالية...» + زر استرجاع «🔄 إعادة تشغيل الخطوة» → ‏`night:retry-auto`.
  - كل حالة الليل المحلية تُصفَّر عند مغادرة NIGHT.
- **الميزات والتفاعلات**: تجاوز مدة الخطوة؛ مراقبة الإرسالات حياً؛ الاعتماد قراءة فقط؛ التخطي للأدوار القابلة؛ استرجاع الخطوة العالقة.
- **التصميم**: لغة الـ Host + بنفسجي السفّاح.
- **API**: لا شيء.
- **Socket**: emits — ‏`night:auto-advance-step`، ‏`night:auto-approve-step` (بدون modifiedChoices)، ‏`night:skip-action`، ‏`night:retry-auto`. ‏listeners — ‏`night:auto-started {totalAlive}`، ‏`night:auto-progress {total, submitted, missingPlayers?, choices?}`، ‏`night:auto-step-ready {role, roleName, performerPhysicalId, performerName, timeoutSeconds, canSkip, …}`، ‏`night:auto-step-started`، ‏`night:auto-step-approval {choices, nextIndex}`.
- **مكافئ Flutter**: قائمة الترتيب الثابت تتطلب دمجاً وترتيباً يُحسب مرة ويُحدَّث في المكان (لا `setState` يعيد الفرز)؛ ‏rollback التفاؤلي للـ dispatch؛ ‏`LinearProgressIndicator` أو `AnimatedContainer` ‏500ms.

---

### Host Console — ملخّص الصباح (HostMorningRecap، طور MORNING_RECAP)

- **الوظيفة والرحلة**: كشف أحداث الليل للاعبين واحداً واحداً (إلزامي قبل المتابعة)، مع إبقاء نتيجة الشريف سرّية للمضيف، ثم بدء نقاش اليوم أو إعلان النهاية.
- **الحالات والشاشات الفرعية**:
  - إذا وُجد `gameState.policewomanChoice` → العرض كله يُفوَّض إلى `LeaderNightView` (تدفق إعدام الشرطية، شريحة الليدر).
  - رأس: ☀️ كبير، ‏Amiri «ملخّص الليلة»، ‏mono «{n} تقرير». حالة فارغة: «لا أحداث هذه الليلة · لا خسائر».
  - بطاقات الأحداث من `morningEvents[]` بخريطة EVENT_META (أيقونة/عنوان عربي/لون/قابلية العرض): ‏ASSASSINATION ‏🩸 «اغتيال ناجح» (قابل للعرض)، ‏ASSASSINATION_BLOCKED ‏🛡️ (قابل)، ‏PROTECTION_FAILED ‏💔 (سرّي)، ‏SILENCED ‏🤐 (سرّي)، ‏SNIPE_MAFIA ‏🎯 (قابل)، ‏SNIPE_CITIZEN ‏💀 (قابل)، ‏SHERIFF_RESULT ‏🔍 (سرّي)، ‏ASSASSIN_KILL ‏🔪 (قابل)، ‏ASSASSIN_BLOCKED ‏🛡️ (قابل)، ‏ABILITY_DISABLED ‏🧙‍♀️ (قابل)، ‏POLICEWOMAN_EXECUTION ‏👮‍♀️ (قابل)، ‏TWIN_SUICIDE ‏🩸 (قابل)، ‏TWIN_TRANSFORM ‏🌑 «الصحوة المظلمة» (قابل)؛ نوع مجهول → ❓ بالنوع الخام. حد البطاقة: مكشوفة أخضر `#2E5C31/40`، سرّية ذهبي/25، الافتراضي `#1a1a1a`.
  - محتوى البطاقة: أيقونة، عنوان Amiri ملوّن (+ وسم «🎲 تلقائي» إذا `wasRandom`)، سطر الهدف «‏#{targetPhysicalId} {targetName} · {extra.targetRole}»، سطر المنفّذ «بواسطة: ‏#{performerPhysicalId} {performerName}»، وللشريف فقط chip حكم inline ‏(«🎭 مافيا» أحمر / «🏛 مواطن» أخضر، ‏Amiri، + «🔒 سرّي لك») من `extra.result`.
  - إجراء البطاقة: الأحداث القابلة للعرض زر «👁 عرض» (ذهبي، ‏`animate-pulse` حتى يُكشف؛ يصبح «🔄 إعادة» بعده) → ‏`night:display-event {eventIndex}` (بث لحلقة اللاعبين) + وسم محلي؛ السرّية chip ثابت «سرّي».
  - ‏CTA سفلي: ‏`pendingWinner` → «🏁 عرض النتيجة» (‏`game:confirm-end`) وإلا «☀️ بدء نقاش اليوم» (‏`night:end-recap`)؛ **كلاهما معطّل حتى تُكشف كل الأحداث القابلة للعرض** (السرّية معفاة)؛ تلميح «اعرض جميع الأحداث أولاً». مجموعة المكشوف تُصفَّر عند تغيّر `gameState.round`.
- **الميزات/التصميم/API**: كما أعلاه؛ لا HTTP.
- **Socket**: emits — ‏`night:display-event`، ‏`night:end-recap`، ‏`game:confirm-end`. ‏listener على مستوى الصفحة: ‏`policewoman:choice-available` (يُخزَّن في ref ويُحقن في الحالة أثناء هذا الطور فقط).
- **مكافئ Flutter**: مجموعة `Set<int>` للمكشوف تُصفَّر بتغير الجولة؛ نبض الزر بـ `AnimationController`؛ تفويض الشرطية يتطلب مكوّن الليدر.

---

### Host Console — نهاية اللعبة (طور GAME_OVER، على مستوى الصفحة)

- **الوظيفة والرحلة**: إعلان النتيجة (الحلقة فوقه تعرض كشف الأدوار الكامل عبر `winnerReveal`) وخيارا «لعبة جديدة» أو إنهاء الغرفة.
- **الحالات والشاشات الفرعية**: emoji فائز عملاق بتوهج ذهبي: 🩸 MAFIA / 🔪 ASSASSIN / 🤡 JESTER / ⚖️ فوز المدينة (أي قيمة أخرى)؛ عنوان Amiri: «انتصار المافيا» / «انتصار السفّاح» / «فوز المهرج» / «تطهير المدينة»؛ سطر لاتيني mono: ‏ALL CITIZENS ELIMINATED / CONTRACTS FULFILLED / THE JESTER WINS / THREAT NEUTRALIZED.
- **الميزات والتفاعلات**: «🔄 لعبة جديدة» (‏`btn-premium`) → ‏`room:new-game {roomId}` (اللاعبون يبقون، عودة للوبي)؛ «إنهاء الغرفة» (outlined) → ‏`room:close-event` + مسح localStorage والحالة → شاشة الإنشاء.
- **التصميم**: لغة الـ Host + توهج drop-shadow ذهبي.
- **API**: لا شيء. **Socket**: ‏`room:new-game`، ‏`room:close-event`.
- **مكافئ Flutter**: خريطة الفائز الرباعية إلزامية (كل ما ليس MAFIA/ASSASSIN/JESTER = مدينة).

---

### شريط الصوت المباشر — RemoteVoice (نسختا اللاعب والمضيف) + محرك useVoice/useActiveSpeaker

- **الوظيفة والرحلة**: طبقة الصوت/الفيديو للغرف عن بُعد فقط (`config.isRemote`؛ الخادم يرفض غيرها بـ `voice_remote_only`). كل مشاركي الغرفة ينضمون لاجتماع **Cloudflare RealtimeKit** واحد لكل غرفة (يُنشأ lazily عند أول `voice:get-token`، ‏id مخزّن في `config.voiceMeetingId` في Redis). المكوّن **يُركَّب مرة واحدة بمفتاح ثابت `key="remote-voice"` ويبقى طوال اللعبة** حتى لا ينقطع الصوت عند تبدّل الأطوار.
- **الحالات والشاشات الفرعية**:
  - **نسخة اللاعب (شريط سفلي ثابت)**: حاوية `fixed inset-x-0 bottom-0 z-40` ‏pointer-events-none (الأبناء يعيدونها). (1) **معاينة الكاميرا الذاتية** (فقط عند `selfVideoOn && selfVideoTrack`): فيديو 76×104px ‏`rounded-xl`، حد 2px ‏`sky-500/60`، **معكوس بمرآة** `scaleX(-1)`، محاذاة النهاية فوق الشريط. (2) الشريط نفسه: ‏`rounded-t-2xl` بخلفية `#0a0a0acc` ‏backdrop-blur وحشوة سفلية `calc(0.5rem + env(safe-area-inset-bottom))`. (3) **مؤشر اتصال**: نقطة 8px — زمردي متصل / أحمر خطأ / كهرماني نابض «يتصل…»؛ ملصقات: «متصل» / «غير متاح» / «يتصل…». (4) **زر المايك** 48×48 دائري: ‏ON زمردي بتوهج `0 0 16px rgba(52,211,153,.45)`؛ ‏OFF داكن؛ المؤشر pointer فقط في أطوار freeMic (الزر خامل أثناء اللعب)؛ **شارة القفل السيادي** عند `micLocked` ‏(`!freeMic && !selfAudioOn`): دائرة 20×20 ذهبية بقفل SVG ‏11×11 عند الزاوية + تعليق «يُفتح في دورك» ‏(8.5px) تحت الزر؛ ‏tooltips: ‏freeMic → «اضغط لكتم مايكك»/«اضغط لفتح مايكك (لوبي)»؛ مقفول → «دورك — مايكك مفتوح»/«مايكك مقفول — يُفتح في دورك». (5) **زر الكاميرا** 48×48: ‏ON ‏sky بتوهج أزرق؛ معطّل (40%) عند عدم الاتصال أو `gamePhase==='NIGHT'` (العنوان «الكاميرا معطّلة ليلاً»). (6) **زر السماعة/الأذن** 48×48: ‏ON (سبيكر) كهرماني بتوهج مع أيقونة موجات؛ ‏OFF أيقونة أذن؛ العناوين «الصوت من السمّاعة الخارجية (اضغط للأذن)» / «الصوت من سمّاعة الأذن (اضغط للسبيكر)». المكوّن كله `null` عند `enabled=false`.
  - **نسخة المضيف (بطاقة inline أعلى الصفحة)**: صف حالة — نفس النقطة الثلاثية؛ النص: متصل → «صوت · {participantCount + 1}» (+1 للنفس)، خطأ → «صوت غير متاح»، غيره «جارٍ الاتصال…». صف أزرار: toggle سبيكر، 📋 toggle سجل التشخيص، ‏toggle مايك ذاتي «مايكك مفتوح»/«مايكك مغلق» (معطّل بلا اتصال). **صف chips الكتم** (فقط عند `canMute` ووجود متحدثين): chip أحمر «🔇 كتم {name||#pid}» لكل مشارك مايكه مفتوح (باستثناء المضيف −1 والنفس) — النقر يكتمه قسرياً. **لوحة سجل التشخيص** (عند 📋): «📋 سجلّ الصوت» + تلميح «اللاعب يفتح مايكه بنفسه؛ تقدر تكتمه من هنا»؛ آخر 14 سطراً (من ~41 محفوظة)، ‏mono ‏10px، طوابع زمنية `HH:MM:SS` بلغة `ar-EG`؛ حالة فارغة «لا أحداث بعد…»؛ أمثلة السطور: «✅ متّصل بالصوت (مضيف)»، «➕ انضمّ X»، «➖ غادر X»، «🔇 كتمتَ X»، «❌ فشل كتم X: …»، «⚠️ X غير موجود في الصوت»، «X مايكه مغلق أصلاً»، «❌ تعذّر توكن الصوت: …»، «❌ فشل الاتصال بالصوت: …».
- **الميزات والتفاعلات**:
  - **دورة الاتصال (useVoice)**: effect بمفاتيح `(enabled, roomId, isHost)` فقط: ‏(1) ack ‏`voice:get-token {roomId}` (الفشل → حالة خطأ + سجل)؛ (2) تحميل SDK من CDN ‏lazily؛ (3) ‏`RealtimeKitClient.init({authToken, defaults:{audio:isHost, video:false}})` — **المضيف ينضم بمايك مفتوح، اللاعبون مكتومين، الكاميرا مغلقة للجميع**؛ (4) ربط مستمعي المشاركين؛ (5) ‏`meeting.join()`؛ (6) إرفاق صوت المنضمين مسبقاً. حارس إلغاء عند تفكيك الـ effect أثناء الإنشاء؛ تنظيف كامل عند unmount (مغادرة الاجتماع، فصل العقد الصوتية، إزالة عناصر `<audio>`، إغلاق AudioContext).
  - **خريطة الهوية**: ‏`customParticipantId` — ‏`'host'` → المفتاح −1 ‏(`VOICE_HOST_KEY`)، ‏`'p{N}'` → N؛ غير ذلك يُتجاهل. ‏`rebuild()` يعيد حساب اللقطة كاملة: ‏selfAudioOn/selfVideoOn/selfVideoTrack، ‏`canMute` من `permissions.canDisableParticipantAudio`، خريطتا `audioByPid`/`videoByPid`، ‏`participantCount` (يستثني النفس).
  - **محرك قواعد المايك**: ‏`freeMic = phase ∈ {LOBBY, ROLE_GENERATION, ROLE_BINDING, GAME_OVER}` → مايك يدوي حر (عند الاتصال) بلا قفل سيادي وبلا إنفاذ. أثناء اللعب: مزامنة تلقائية مع `shouldOpenMic` (يحسبه الأب: ‏`voiceAllowedPids.includes(myPid) && !isPlayerDead`)، واللاعب لا يستطيع التبديل يدوياً. ‏`allowedPids` من `useActiveSpeaker`: مواجهة نشطة → ‏`[requesterId, targetId]` (تتجاوز كل شيء)؛ ‏DAY_DISCUSSION مع `status==='SPEAKING'` → ‏`[currentSpeakerId]`؛ ‏DAY_JUSTIFICATION مع مؤقت نشط → ‏`[defenderId]`؛ غير ذلك `[]` (لا أحد: ليل/تصويت...).
  - **إنفاذ المضيف**: عند تغيّر `audioByPid` أو `allowedPids` (مضيف متصل، ‏canMute، ليس freeMic): أي pid مايكه مفتوح وليس −1 وليس مسموحاً → ‏`muteParticipantByPid` ‏(`participant.disableAudio()`)؛ حواف: غير موجود → تحذير بالسجل؛ مكتوم أصلاً → سجل؛ فشل → خطأ بالسجل.
  - **حاجز الخادم (presets)** عند إصدار التوكن: مضيف → ‏`mafia_leader` (يستطيع كتم الآخرين)؛ لاعب حي → ‏`mafia_player`؛ ميت → ‏`mafia_dead` (لا بث إطلاقاً). ملاحظة: الـ preset يتحدد لحظة الإصدار — من يموت أثناء اللعبة يبقى بـ `mafia_player` والحارس الفعلي هو `!isPlayerDead` client-side + إنفاذ المضيف (تجديد التوكن عند الموت تحسين لا parity).
  - **قاعدة كاميرا الليل**: ‏effect يفرض `disableSelfVideo()` كلما كان الطور NIGHT والفيديو مفتوحاً + تعطيل الزر (anti-cheat: لا بطاقات أدوار أمام الكاميرا ليلاً).
  - **توجيه السماعة (workaround ويب — لا يُنقل)**: افتراضي `speakerMode=true`؛ كل مسار صوت بعيد يوضع في `<audio>` مخفي + يُمرَّر عبر `AudioContext` مشترك ليخرج من مكبّر أندرويد بدل سماعة الأذن؛ كتم العنصر فقط عندما الـ AudioContext فعلاً `running`؛ مستمعو `pointerdown/touchstart` لاستئناف الـ context بعد أول إيماءة (سياسة autoplay)؛ إعادة إرفاق الجميع عند تبديل الوضع أو `statechange`.
- **التصميم**: أسود شبه شفاف مع blur، زمردي = مايك، ‏sky = كاميرا، كهرماني = سبيكر/تشخيص، أحمر = خطأ/كتم، ذهبي `#C5A059` لشارة القفل؛ الأيقونات كلها SVG مضمّنة بـ `currentColor` ‏(Mic/MicOff بخط قطع أحمر `#d13636`/Cam/Speaker/Ear/Lock)؛ ‏`animate-pulse` لنقطة الاتصال؛ ‏`transition-all` لكل الأزرار؛ لا framer-motion.
- **API**: لا HTTP من الواجهة. (للسياق الخلفي: ‏Cloudflare REST لإنشاء الاجتماع وإضافة المشاركين ببيرر `CLOUDFLARE_REALTIMEKIT_TOKEN`؛ ‏env: ‏`CLOUDFLARE_ACCOUNT_ID`، ‏`CLOUDFLARE_REALTIMEKIT_APP_ID`، ‏presets ‏`RTK_PRESET_LEADER|PLAYER|DEAD`.)
- **Socket**: ‏emit مع ack: ‏`voice:get-token {roomId}` → ‏`{success, authToken, meetingId, participantId ('host'|'p{pid}'), preset}`؛ أخطاء: ‏`voice_not_configured` / `Room not found` / `voice_remote_only` / `not_in_room` / `voice_token_failed`. أحداث **RealtimeKit SDK** (ليست Socket.IO): ‏`participantJoined`/`participantLeft`، ولكل مشارك `audioUpdate`/`videoUpdate`، وللنفس `audioUpdate`/`videoUpdate`/`permissionsUpdate`/`roomJoined`؛ الواجهة المستخدمة: ‏`init`، ‏`join/leave`، ‏`self.enableAudio/disableAudio/enableVideo/disableVideo`، ‏`participant.disableAudio()`. كما يستهلك `useActiveSpeaker` بثوث: ‏`day:discussion-updated`، ‏`day:justification-timer-started {physicalId}`، ‏`day:justification-timer-stopped`، ‏`game:phase-changed`، وأحداث المواجهة (أدناه).
- **مكافئ Flutter**: ‏SDK محدد بدقة: ‏Cloudflare **RealtimeKit Core SDK** ‏(rebrand لمنصة **Dyte**) — يوجد Flutter Core SDK (خليفة `dyte_core` على pub.dev؛ **تحقق من اسم الحزمة الحالي `realtimekit_core` vs `dyte_core` وقت البناء**). عقد الخادم لا يتغير: ‏Flutter يستدعي `voice:get-token` ويهيّئ العميل الأصلي بالتوكن. البدائل (WebView bridge أو WebRTC خام ضد Cloudflare SFU) سيئة/مكلفة — خطط للـ SDK الأصلي. إرشادات النقل: (1) **controller صوتي واحد طويل العمر** فوق كل widgets الأطوار (service وليس widget-bound) يحاكي الثبات الويبي؛ (2) **احذف** كل آلية AudioContext/العناصر المخفية/استئناف الإيماءة — استخدم اختيار جهاز الصوت الأصلي (‏`setAudioDevice` في RealtimeKit، أو `Helper.setSpeakerphoneOn` من `flutter_webrtc`/`audio_session`) مع إبقاء زر السبيكر/الأذن افتراضياً ON؛ (3) بدل سياسة autoplay تحتاج **أذونات مايك+كاميرا** ‏(`permission_handler`) قبل `join()` ومعالجة الرفض → حالة «غير متاح»؛ (4) أعد تنفيذ الـ effects الثلاثة حرفياً (مزامنة سيادية / حلقة إنفاذ المضيف / إطفاء كاميرا الليل) و`useActiveSpeaker` كـ reducer نقي فوق الأحداث السبعة؛ (5) مرآة المعاينة `Transform(Matrix4.diagonal3Values(-1,1,1))`؛ (6) ‏`SafeArea(top:false)` للشريط؛ (7) **صوت خلفية**: أندرويد `foregroundServiceType="microphone|camera"` وiOS ‏`UIBackgroundModes: audio/voip` وإلا تموت المكالمة عند التصغير + ‏`wakelock_plus`؛ (8) أبقِ سجل التشخيص (قائمة ≤41 بطوابع `intl` ‏ar_EG)؛ (9) لا تسجّل مستمعات غير المذكورة (مثل screenShareUpdate)؛ (10) ‏PlayerFlow في الويب يرسم الزوج (Voice+Confrontation) **مرتين** في فرعين متطابقين — في Flutter مثيل واحد فقط.

---

### المواجهة الثنائية — ConfrontationControls

- **الوظيفة والرحلة**: أثناء DAY_DISCUSSION يطلب لاعب مواجهة 30 ثانية مع لاعب آخر: طالب → موافقة الهدف → اعتماد المُوجِّه → يفتح مايكا الطرفين فقط 30 ثانية (البقية مكتومون عبر منطق allowedPids) → إنهاء تلقائي بمؤقت الخادم. حد أقصى 3 مواجهات لكل جولة.
- **الحالات والشاشات الفرعية** (6 حالات متنافية):
  1. **شريط ACTIVE (يراه الجميع)**: بطاقة بحد `red-500/40` وتدرج `from-red-950/40 to-black`؛ سطر علوي شبكة `[1fr_auto_1fr]` بخط **Amiri** أحمر: «‏#{requesterId} {name}» | «⚔️ ×» | «‏#{targetId} {name}» (كل خلية اسم بـ `dir="auto"` ومحاذاة صريحة يسار/يمين داخل RTL)؛ عدّ تنازلي `text-2xl` ‏mono أبيض يتحول أحمر نابضاً عند ≤10 ثوانٍ، بصيغة «{remaining}s»، يُحسب كل 500ms من `startedAt` (epoch) للخادم: ‏`max(0, round(duration − (now−startedAt)/1000))` مع fallback ‏`durationSeconds||30`؛ إذا كان المشاهد أحد الطرفين: سطر إضافي «مايكك مفتوح — تكلّم الآن».
  2. **لوحة موافقة الهدف** ‏(PENDING_TARGET، أنا الهدف، لست مضيفاً): لوحة ذهبية `#C5A059/50`؛ «⚔️ {requesterName} يطلب مواجهتك»؛ زرا «قبول» (زمردي) و«رفض» (أحمر) بـ ‏`min-h-[44px]`، معطّلان 40% أثناء busy؛ سطر خطأ أحمر 10px.
  3. **لوحة اعتماد الليدر** ‏(PENDING_LEADER، ‏isHost): نفس اللوحة الذهبية؛ «⚔️ طلب مواجهة: {A} × {B} (وافقا)»؛ زرا «اعتمِد (30ث)» / «ارفض».
  4. **انتظار الطالب** ‏(PENDING_TARGET وأنا الطالب): شريط رمادي mono «⚔️ بانتظار موافقة {targetName}…».
  5. **انتظار غير المضيف لليدر** ‏(PENDING_LEADER، لست المضيف): «⚔️ بانتظار موافقة المُوجِّه…».
  6. **زر الطلب + المنتقي** (لا مواجهة، لست مضيفاً، الطور DAY_DISCUSSION، ‏`myPid != null`): زر كامل العرض «⚔️ اطلب مواجهة لاعب» (أحمر شفاف، ‏min-h 44px) يفتح منتقياً: رأس «اختر خصمك للمواجهة» + ✕ ‏(36×36)؛ شبكة عمودين `max-h-48` قابلة للتمرير من الأحياء (باستثناء النفس) — كل زر «‏#{physicalId}» ذهبي mono + الاسم؛ سطر خطأ 10px.
  7. غير ذلك → المكوّن `null` (ميت، طور غير النقاش، مضيف بلا طلب معلّق...).
- **الميزات والتفاعلات**:
  - طلب: نقر هدف → ‏`player:request-confrontation {roomId, targetPhysicalId}`؛ ‏`busy` يعطّل الأزرار أثناء الـ ack؛ المنتقي يُغلق بعد الإرسال.
  - خريطة الأخطاء إلى العربية (‏`mapErr` — اعرضها كما هي): ‏`max_reached` → «استُنفد حدّ المواجهات لهذه الجولة (3)»، ‏`confrontation_in_progress` → «هناك مواجهة جارية»، ‏`discussion_only` → «المواجهة أثناء النقاش فقط»، ‏`must_be_alive` → «كلا الطرفين يجب أن يكونا أحياء»، ‏`not_target` → «لست الطرف المستهدَف»، ‏`only_leader` → «المُوجِّه فقط»، الافتراضي → الكود الخام أو «تعذّر»؛ الاستثناءات → ‏`e.message` أو «خطأ».
  - قواعد الخادم: ‏remote فقط؛ ‏DAY_DISCUSSION فقط؛ مواجهة واحدة في كل مرة؛ حد 3 لكل جولة (عداد يُصفَّر كسولاً عند تغيّر الجولة)؛ الطرفان حيّان؛ لا استهداف للنفس؛ الهدف وحده يرد؛ الليدر/player-host وحده يعتمد؛ مدة ثابتة **30 ثانية** بمؤقت `setTimeout` خادمي (واحد لكل غرفة، يُستبدل عند إعادة الاعتماد) ينهي بـ `time_up`.
  - إعادة ضبط client: ‏`game:phase-changed` بعيداً عن DAY_DISCUSSION يمسح حالة المواجهة المحلية؛ بث `confrontation:ended` ‏idempotent. ‏`nameOf(pid)` يسقط إلى «‏#{pid}» — مهم لأن بث PENDING_LEADER يرسل ids **بلا أسماء** (الأسماء من roster المحلي).
- **التصميم**: أحمر المواجهة على أسود، ذهبي للوحات الموافقة، ‏Amiri لسطر الأسماء، أهداف لمس ≥44px، ‏`animate-pulse` للعد الحرج.
- **API**: لا شيء.
- **Socket**: ‏emits مع ack — ‏`player:request-confrontation {roomId, targetPhysicalId}`، ‏`player:respond-confrontation {roomId, accept}` (أخطاء `no_pending`/`not_target`)، ‏`leader:approve-confrontation {roomId, approve}` (أخطاء `only_leader`/`no_pending`). ‏listeners (عبر useActiveSpeaker) — ‏`confrontation:pending` بنسختيه ‏(`{status:'PENDING_TARGET', requesterId, requesterName, targetId, targetName}` ثم `{status:'PENDING_LEADER', requesterId, targetId}` بلا أسماء)، ‏`confrontation:started {requesterId, targetId, durationSeconds:30, startedAt}`، ‏`confrontation:ended {reason:'target_declined'|'leader_rejected'|'time_up'}`.
- **مكافئ Flutter**: صنف حالة immutable صغير بثلاث حالات (PENDING_TARGET / PENDING_LEADER / ACTIVE) + مسح لا-يعتمد-على-السبب عند `ended` وعند مغادرة النقاش؛ عدّ تنازلي `Timer.periodic(500ms)` مشتق من `startedAt` الخادمي (نفس عيب انحراف ساعة الجهاز الموجود في الويب — فكّر في server-time offset إن كان محسوباً في مكان آخر)؛ الثوابت `VOICE_HOST_KEY=-1`، ‏`MAX_PER_ROUND=3`، ‏`DURATION_SECONDS=30`؛ محاذاة الأسماء داخل RTL بـ `TextAlign.left/right` صريحة و`TextDirection` تلقائي لكل اسم؛ تضمين خط Amiri في الحزمة.

---

# 6. الملف الشخصي، الرتب والسجل، الطلبات، والتقييم

يغطي هذا القسم خمس شاشات رئيسية + مكوّنين مشتركين: الملف الشخصي (`/player/profile`)، أداة قصّ الصورة (`ImageCropper`)، شاشة التصنيف والرتب (`/player/rank`)، سجل المباريات (`/player/history`)، إطارات وتأثيرات الرتب على كرت اللعب (`RankFrames` + `RankEffects.css`)، طلبات المطعم (`/player/order`)، والتقييم الإلزامي (`/player/feedback`). كل الشاشات عربية بالكامل، `RTL`، ثيم أسود داكن.

---

### 1) الملف الشخصي (`/player/profile`)

- **الوظيفة والرحلة**: المركز الشخصي للاعب: الهوية (avatar + اسم قابل للتعديل)، التقدم التنافسي (rank tier / level / XP / RR)، إحصائيات شاملة وتحليلات أداء، لوحة متصدرين مصغّرة، آخر 8 مباريات مع تفصيل نقاط، إعدادات الحساب، ودليل نظام التقدم. يصل إليه اللاعب من الـ bottom nav، ومنه يتفرع إلى `/player/history` و`/player/debug-push`.

- **الحالات والشاشات الفرعية**:
  - **Loading**: شاشة سوداء كاملة مع spinner ذهبي 48px يدور بـ framer-motion (2s linear infinite).
  - **Error / not-found**: رسالة كهرمانية («لم يتم العثور على حساب» عند غياب playerId بلا أي fetch / رسالة السيرفر أو «خطأ» / «خطأ في الاتصال») + زر «العودة» → `/player`.
  - **الشاشة الرئيسية** (عمود بعرض أقصى 512px): Hero → بطاقة تقدم الرتبة → بطاقة الأداء العام → شبكة إحصائيات إضافية (3 أعمدة) → بطاقة تحليل الأداء (glassmorphism) → لوحة المتصدرين المصغّرة (شرطية: القائمة غير فارغة) → زر دليل الأدوار → قسم آخر المباريات (شرطي: يوجد مباريات) → accordion الإعدادات → زر دليل التقدم → زر تسجيل الخروج.
  - **Toast** سفلي (3 ثوانٍ): «✓ تم حفظ الاسم» / «✓ تم حفظ الإيميل» / «✓ تم تحديث الصورة» / «الصورة كبيرة جداً (أقصى 10MB)» / «خطأ» / «خطأ في رفع الصورة» / رسائل السيرفر.
  - **مودال دليل التقدم** (`guideOpen`): backdrop أسود 80% + blur، لوحة `max-h-[85vh]` قابلة للتمرير، تشرح: جدول XP (مشاركة +20، فوز الفريق +50، نجاة كل جولة +5، قدرة صحيحة +10، اتفاقية ناجحة +50، إقصاء خصم +15؛ عقوبات: قدرة خاطئة −5، اتفاقية فاشلة −10)، قسم Level، قسم RR (مكاسب +20/+20/+5/+5، خسائر −20/−30/−5)، سلّم الرتب الخمس مع RR المطلوب (100/200/300/400) مع تمييز «أنت هنا» للرتبة الحالية، وشرح شروط نجاح/فشل الديل (فشل = −30 RR / −10 XP + إقصاء المبادر). إغلاق: backdrop / ✕ / «فهمت! 👍». قفل تمرير الـ body أثناء الفتح.
  - **مودال الأدوار** (`RolesInfoModal` — مكوّن خارجي من شريحة أخرى؛ يكفي زر/route لفتحه).
  - **حالات فرعية داخل الأقسام**: بطاقة الدور المفضل تظهر فقط إذا `stats.favoriteRole`؛ سطر نسبة نجاح الديلات فقط إذا `totalDeals>0`؛ chips XP/RR على صفوف المباريات فقط عند وجود القيم؛ ملاحظة الديل فقط إذا `dealInitiated`؛ قوائم التفصيل الفارغة → «لا نقاط خبرة» / «لا تغيّر في الرتبة»؛ صفوف `PRow` بقيمة 0 تُخفى؛ شريط الفصائل يعود لتقسيم 50/50 عند `mafiaGames===0`؛ fallback للـ avatar حسب الجنس (👩 أنثى / 👤 ذكر)؛ قيم افتراضية لكل حقول التقدم (level 1، xp 0، nextLevelXP 500، rankTier INFORMANT، rankRR 0، rrRequired 100).

- **الميزات والتفاعلات**:
  - **تحميل البيانات**: حلّ playerId من `mafia_player_auth.playerId` ثم fallback إلى `mafia_playerId`؛ بدونه → حالة خطأ فورية. Fetch للبروفايل + fetch موازٍ للـ leaderboard (يُقبل فقط إذا كان Array، يُقصّ إلى 5، والفشل يُتجاهل بصمت فيختفي القسم).
  - **زر الترس ⚙️** (أعلى يسار فيزيائياً حتى في RTL): يفتح accordion الإعدادات + بعد 100ms يعمل `scrollIntoView` سلس إلى القسم.
  - **تعديل الاسم**: نقر على `h1` → input شفاف بحد سفلي كهرماني، autoFocus بعد 100ms؛ حفظ على blur أو Enter؛ trim؛ الفارغ/غير المتغيّر يُلغى بصمت؛ نجاح → تحديث تفاؤلي + toast؛ فشل → toast + استرجاع القيمة. حارس ضد الحفظ المزدوج (Enter ثم blur).
  - **تعديل الإيميل**: نفس النمط inline في الإعدادات؛ يعرض «إضافة إيميل» إذا فارغ؛ يُرسل `email: trimmed || null` (الفارغ يمسح الإيميل)؛ لا يوجد تحقق شكلي على الصيغة client-side.
  - **خط أنابيب الـ Avatar**: نقر على الصورة أو شارة 📷 → file input مخفي (`image/jpeg,image/png,image/webp`) → رفض >10MB مع toast → فتح ImageCropper (انظر §2) → ناتج مربع 512×512 JPEG q0.92 كـ base64 → POST → عند النجاح `avatarUrl + '?t=' + Date.now()` (cache-buster) + toast. إعادة تعيين `input.value=''` للسماح باختيار نفس الملف. علم `saving` مشترك بين حفظ الاسم والصورة (يُظهر overlay spinner فوق الـ avatar أثناء أي حفظ).
  - **تغيير كلمة المرور**: نموذج inline (كلمة المرور الحالية + الجديدة)؛ تحقق client فقط على طول الجديدة ≥4 («كلمة المرور 4 أحرف على الأقل»)؛ نجاح → «✓ تم تغيير كلمة المرور» + تفريغ + إغلاق تلقائي بعد 2s؛ الرسالة خضراء إذا احتوت '✓' وإلا حمراء.
  - **معلومات الحساب** (قراءة فقط): هاتف مقنّع بـ regex `(\d{3})\d{4}(\d+) → $1****$2` معروض LTR mono؛ الجنس؛ تاريخ الانضمام بـ `toLocaleDateString('ar-SA')` (تنبيه: المتصفح يعرضه هجري أم القرى — قرار واعٍ مطلوب في Flutter).
  - **الإشعارات**: رابط «🛠️ تشخيص الإشعارات» → `/player/debug-push` + نص مساعد.
  - **آخر المباريات** (`slice(0,8)`): accordion أحادي الفتح بالفهرس؛ لكل صف: نقطة حالة فوز/خسارة، اسم الدور بالعربية، chip الفريق («محايد» بنفسجي / «مافيا» أحمر / «مواطن» سماوي)، «🛡️ نجا» أو «💀»، `+XP` و`±RR` (فقط عند تعريفها)، المدة mm:ss، chevron يدور 180°. اشتقاق الفوز: من `breakdown.won` إن وجد، وإلا heuristic قائمة أدوار المافيا (GODFATHER, SILENCER, CHAMELEON, WITCH, OLDER_BROTHER, MAFIA_REGULAR) مقابل `matchWinner`. اللوحة الموسّعة: تفصيل XP وRR سطراً سطراً (إخفاء قيمة 0، أخضر موجب/أحمر سالب، mono) + صفوف المجموع + ملاحظة الديل (✅ ناجح/❌ فاشل) + سطر meta (📅 تاريخ، 👥 عدد لاعبين، 🏅 رقم الكرسي).
  - **لوحة المتصدرين المصغّرة**: حتى 5 صفوف؛ 🥇🥈🥉 للمراكز 1–3؛ صفّي مُبرز بخلفية وحدود كهرمانية؛ أعمدة: اللاعب / المستوى / RR.
  - **تسجيل الخروج**: مسح 3 مفاتيح localStorage (`mafia_player_auth`, `mafia_playerId`, `mafia_player_token`) ثم توجيه صلب إلى `/player/login`.

- **التصميم**:
  - ثيم أسود؛ لون تمييز لكل رتبة من `RANK_CONFIG`: INFORMANT مُخبر 🕵️ `#CD7F32`، SOLDIER جندي ⚔️ `#C0C0C0`، CAPO كابو 🎖️ `#FFD700`، UNDERBOSS أندربوس 💎 `#00BFFF`، GODFATHER الأب الروحي 👑 `#DC2626` (+ glow أحمر إضافي). يُستخدم اللون مع لواحق hex-alpha (44/30/25/20/15/10/08/05/88).
  - Hero: تدرج `#0a0500→#000` + radial glow بلون الرتبة؛ avatar دائري 144px بحد 5px بلون الرتبة + back-glow ضبابي (blur 25px, scale 1.5) + ظلال ثلاثية؛ دخول spring (scale 0→1, damping 15)؛ شارة كاميرا 32px بلون الرتبة؛ pill الرتبة بتدرج وحدود بلون الرتبة؛ درع LEVEL 64px؛ شريط XP بتعبئة متحركة 1s easeOut بتدرج `linear-gradient(90deg,{color},{color}88)`.
  - بطاقات بتدرج `#111111→#0a0a0a`؛ بطاقات glassmorphism `bg-white/[0.03] + backdrop-blur-xl`؛ donuts SVG (win rate 72px كهرماني `#fbbf24`، survival 56px سماوي `#06b6d4`) بـ strokeLinecap round وdrop-shadow؛ شريط فصائل مكدّس أحمر/سماوي؛ دخول متدرج (staggered fade+rise بتأخيرات 0.1×i + 0.4–0.55)؛ أرقام `tabular-nums` وmono.
  - كل الأيقونات emoji نصية (لا أصول صور/صوت). صورة الـ avatar تُجلب من `{NEXT_PUBLIC_SOCKET_URL}{avatarUrl}`.

- **API**:
  - `GET /api/player/{playerId}/profile` — يعيد `player` + `stats` + `progression` + `matchHistory[]` (مع `breakdown {team, won, xp[], rr[]}` اختياري).
  - `GET /api/player-app/leaderboard` — مصفوفة مباشرة؛ يُستخدم `id, name, level, rankRR, rankTier` (أعلى 5).
  - `PUT /api/player/{playerId}/profile` — `{name}` أو `{email: string|null}`.
  - `POST /api/player/{playerId}/avatar` — `{image: 'data:image/jpeg;base64,...'}` (512×512).
  - `POST /api/player-auth/change-password` — `{currentPassword, newPassword}`.
  - الكل بـ `Authorization: Bearer` (token من `mafia_player_token` أو `mafia_player_auth.token`).

- **Socket**: لا شيء — الشاشة REST بالكامل؛ `NEXT_PUBLIC_SOCKET_URL` يُستخدم فقط كأساس URL لصور الـ avatar.

- **مكافئ Flutter**:
  - `Directionality(rtl)` + `SingleChildScrollView` > `ConstrainedBox(maxWidth: 512)` على `Scaffold` أسود.
  - أنيميشن الدخول: `flutter_animate` (`.fadeIn().slideY()` بتأخيرات متدرجة)؛ الـ avatar spring عبر elastic curve أو `SpringSimulation`؛ أشرطة XP/RR عبر `TweenAnimationBuilder` + `FractionallySizedBox`.
  - الـ donuts: `CustomPaint` بقوس sweep = pct×2π و`StrokeCap.round` (لا حاجة لثابت 97.4 — هو محيط دائرة SVG فقط).
  - الأكورديونات: `AnimatedSize`/custom expansion (تجنّب `ExpansionTile` القياسي لصعوبة إعادة التصميم).
  - Glassmorphism: استبدال `BackdropFilter` بحاوية شفافة `Color(0x08FFFFFF)` (الخلفيات شبه سوداء — نفس المظهر وأرخص أداءً).
  - Toast: `Overlay` entry / SnackBar مخصص (pill كهرماني، slide-up، 3s).
  - المودالات: `showGeneralDialog` بـ fade+scale و`barrierDismissible`.
  - الأرقام: `FontFeature.tabularFigures()` + عائلة mono؛ الهاتف المقنّع داخل `Directionality(ltr)` لتجنب خربطة الـ bidi.
  - packages: `image_picker`، `cached_network_image` (مع إخلاء cache بعد رفع الصورة — Flutter يخزّن بالـ URL)، `flutter_animate`، `flutter_secure_storage`/`SharedPreferences` (توحيد مفاتيح الجلسة الثلاثة في مخزن واحد)، `intl`.
  - **مخاطر**: emoji تختلف بين المنصات (خصوصاً 🕵️⚔️🎖️💎👑) — إما قبول emoji المنصة أو تضمين NotoColorEmoji أو أصول SVG؛ قرار التقويم الهجري/الميلادي لتاريخ الانضمام؛ الحفاظ على التحديث التفاؤلي + الاسترجاع عند الفشل؛ الخروج = مسح التخزين + `pushAndRemoveUntil`؛ `scrollIntoView` → `Scrollable.ensureVisible` مع post-frame callback؛ دالة `avatarThumb` (regex تحويل إلى `thumbs/{id}.webp` مع fallback للأصل عند الخطأ) تُنقل حرفياً للاستخدام في القوائم الصغيرة.

---

### 2) أداة قصّ الصورة (`ImageCropper` — overlay داخل البروفايل)

- **الوظيفة والرحلة**: overlay بملء الشاشة (z 200، خلفية `rgba(0,0,0,0.9)`) يُفتح عند اختيار ملف صورة؛ اللاعب يحرّك ويكبّر الصورة داخل معاينة دائرية ثم يحفظ ناتجاً مربعاً 512×512.

- **الحالات والشاشات الفرعية**: حالة عادية / حالة حفظ («⏳ جاري الحفظ...»، الزر معطل بخلفية باهتة و`cursor:wait`) / إلغاء (لا رفع).

- **الميزات والتفاعلات**:
  - معاينة دائرية 280×280 (`CANVAS_SIZE=280`) بحد كهرماني، canvas يعاد رسمه عند كل تغيير scale/offset مع circular clip وحلقة كهرمانية.
  - fit ابتدائي: `initialScale = 280 / min(w,h)` (cover) مع توسيط.
  - سحب بإصبع/فأرة (pointer events)، pinch-zoom بإصبعين (scale = startScale × distRatio، مقيّد 0.1–5)، عجلة الفأرة ±0.05، زرّا − / + بخطوة ±0.15، شريط مؤشر zoom بعرض `min(100,(scale/3)*100)%`.
  - مستمعو اللمس مسجّلون non-passive مع `preventDefault` وrefs (`scaleRef/offsetRef`) للتسجيل مرة واحدة.
  - الناتج: canvas خارجي 512×512، `ratio = 512/280`، رسم مربع **بدون** قصّ دائري، `toDataURL('image/jpeg', 0.92)`.
  - قفل تمرير/سحب-للتحديث عبر `<style id="image-cropper-lock">` عالمي (حل خاص بـ Chrome Android) — يُزال عند unmount.
  - كود ميت موثِّق للعقد: `cropAndResizeImage(file, 512)` (قصّ مركزي تلقائي) لم يعد يُستدعى.

- **التصميم**: عنوان «📸 تعديل الصورة» + نص مساعد؛ أزرار zoom دائرية 36px؛ «إلغاء» ghost و«✓ حفظ الصورة» بتدرج `#fbbf24→#f59e0b` بنص أسود.

- **API**: لا يستدعي API بنفسه — يعيد base64 إلى صفحة البروفايل التي تنفذ POST avatar.

- **Socket**: لا شيء.

- **مكافئ Flutter**: بناء مخصص أبسط من الويب — `GestureDetector` بـ `onScaleStart/Update` (يوحّد pan+pinch: `focalPointDelta` للتحريك و`details.scale` للتكبير)، معاينة عبر `CustomPaint` لرسم `ui.Image` بقصّ دائري وحلقة كهرمانية، تقييد 0.1–5. للـ desktop/web: `Listener` لـ `PointerScrollEvent` + أزرار zoom. الناتج: `PictureRecorder` → `toImage(512,512)` → ترميز JPEG q92 عبر package `image` → base64 بنفس البادئة `data:image/jpeg;base64,` للحفاظ على عقد الـ POST. حيل قفل التمرير/pull-to-refresh غير مطلوبة في Flutter (الشاشة تملك الإيماءات طبيعياً). بدائل جاهزة (`crop_your_image`, `custom_image_crop`) موجودة لكن التطابق الدقيق للتحويل أسهل يدوياً.

---

### 3) التصنيف والرتب (`/player/rank`)

- **الوظيفة والرحلة**: المركز التنافسي: الرتبة الحالية + RR، leaderboard موسمي مع منصة تتويج top-3، قائمة «لعبت معهم» (متابعة اجتماعية)، وتبويب تعليمي لنظام النقاط يعرض إعدادات التقدم القابلة للضبط من الأدمن. يدعم وضعين: مواسم **وجاهيّ** (افتراضي، لوحة حية) و**أونلاين** (قوائم مواسم منفصلة، تُجلب دائماً per-season)؛ زر التبديل يظهر فقط إذا وُجدت مواسم أونلاين.

- **الحالات والشاشات الفرعية**:
  - **Loading**: spinner كهرماني 40px داخل min-h 60vh.
  - **Header**: العنوان «🏆 التصنيف والرتب» + مبدّل الوضع (pill: «وجاهيّ» كهرماني نشط / «🌐 أونلاين» سماوي نشط) + منسدلة الموسم (native select، `max-w-[52vw]`، خيارات `🗓️ {name}` مع لاحقة « • الحالي» للموسم النشط)؛ fallbacks: pill ثابت «🌐 لا مواسم أونلاين بعد» أو «🗓️ موسم: {name}».
  - **بطاقة رتبتي — موسم سابق/أونلاين** (عندما لا نعرض اللوحة الحية النشطة): حالات فرعية: `جارٍ التحميل…` / صف موجود (شارة + اسم الرتبة + `#{rank}` + RR ملوّن + 3 صناديق: مباراة/فوز/المستوى) / «لم تلعب في هذا الموسم».
  - **بطاقة رتبتي — الموسم الحالي**: شارة + اسم عربي + `#{rank}` (فقط إذا موجود على اللوحة)؛ RR الحالي `/{المطلوب}`؛ 4 صناديق: مباراة/فوز/نسبة فوز/الرانك (enum خام)؛ شريط تقدم RR بتعبئة متحركة بلون الرتبة.
  - **3 تبويبات** («🏅 الترتيب» / «👥 لعبت معهم» / «📖 النقاط») مع `AnimatePresence mode="wait"` (fade).
  - **تبويب الترتيب**: منصة top-3 فقط إذا ≥3 لاعبين (ترتيب DOM: ‎#2، ‎#1 مرفوع، ‎#3؛ أحجام 56/72/56px، حدود فضي/ذهبي/برونزي، 🥇🥈🥉، قصّ الأسماء يدوياً عند 10/8/8 حرفاً)؛ صف رؤوس أعمدة؛ صفوف من المركز الرابع (`slice(3)`)؛ صفّي: خلفية وحدود كهرمانية + glow نابض (`pulse-glow` 1.5s) لمدة 5 ثوانٍ وغير قابل للنقر؛ **حالة حدّية موثقة**: لوحة بلاعب أو لاعبين تعرض صفر صفوف (قرار واعٍ: إبقاؤها أو إصلاحها في Flutter).
  - **تبويب لعبت معهم**: حالة فارغة «العب مباراة أولاً لتعرف لاعبين!»؛ صفوف: avatar 36px (🎭 fallback) + اسم + `{شارة} {رتبة} • {n} مباراة مشتركة` + زر متابعة (⭐ متابع / ☆ تابع / «...» أثناء التحميل).
  - **تبويب النقاط**: fallback «جاري تحميل البيانات...»؛ بطاقة تمهيدية تشرح مساري XP (لا ينزل تحت الصفر) وRR (قد يصبح سالباً)؛ 3 بطاقات فئات ثابتة البنية والقيم من السيرفر: «🔰 أساسيات المباراة» (participation 🎮, teamWin 🏆, teamLoss 💀, survivalPerRound ⏳, survivedToEnd 🎖️, teamEliminationBonus ⚔️)، «🤝 الديلات والاتفاقات» (citizenDealOnMafia ✨, failedDeal 💔, mafiaDealOnMafia 🔴)، «🎯 قدرات الأدوار» (abilityCorrect ✅, abilityIncorrect ❌) — chips XP كهرماني/RR أزرق (وردي للسالب)، chip يُخفى عند 0 والصف كله يُخفى عند غياب القيمتين؛ بطاقة «👑 الرتب — RR المطلوب للترقية» البنفسجية بشارات نجوم (⭐/⭐⭐/🌟/🌟🌟/👑 — **مجموعة مختلفة عمداً** عن `RANK_BADGES`).
  - **مودال بروفايل لاعب** (bottom sheet): backdrop يتوقف فوق الـ bottom nav (`bottom: calc(64px + safe-area)`)؛ sheet ينزلق من الأسفل (spring damping 25 stiffness 300)، `max-h-[70vh]`، مقبض سحب؛ رأس: avatar 56px بحد بلون الرتبة + اسم + رتبة + زر متابعة (فقط إذا الهدف co-player وليس أنا)؛ شبكة 3 إحصائيات (مباريات / فوز% / نجاة%)؛ آخر 5 مباريات (🏆 أخضر / 💀 أحمر + الدور بالعربية + تاريخ `ar-JO` شهر مختصر). إغلاق: نقر backdrop أو سحب لأسفل ≥80px عندما المحتوى في الأعلى (hook `useModalScrollLock`).

- **الميزات والتفاعلات**:
  - **تحميل أولي**: 7 fetches متوازية (`Promise.all`)؛ spinner حتى تسوية الكل؛ فشل الاستدعاءات المغلّفة بـ `.catch(()=>null)` (config، الموسم النشط، قوائم المواسم) يتدهور بأمان؛ فشل leaderboard/co-players/profile يترك حالات فارغة.
  - **إعادة الجلب التلقائية**: `visibilitychange` (عند visible) + window `focus` يعيدان التحميل الكامل — **حيوي** لانعكاس RR الجديد بعد المباراة.
  - **auto-scroll + glow**: بعد التحميل أو تبديل التبويب — تأخير 300ms ثم `scrollIntoView` لصفّي (center)؛ الـ glow يتوقف بعد 5s؛ النقر على تبويب الترتيب يعيد تشغيله.
  - **تبديل الوضع**: يضبط الوضع ويعيد `selectedSeasonId` للموسم النشط لذلك الوضع؛ الأونلاين لا يستخدم اللوحة الحية أبداً (`viewingActive` = وجاهي + الموسم النشط فقط)؛ edge: تطابق رقمي بين معرّف موسم أونلاين والموسم الوجاهي النشط يترك اللوحة فارغة.
  - **اختيار الموسم**: يشغّل effect جلب لوحة الموسم (مع علم إلغاء؛ خطأ → مصفوفة فارغة).
  - **متابعة/إلغاء متابعة** (3 منافذ: نجمة صف اللوحة مع `stopPropagation`، زر صف لعبت-معهم، زر المودال): متاحة فقط إذا الهدف `isCoPlayer` وليس أنا؛ Follow: POST بنجاح `data.success || status 200` ثم قلب الحالة؛ Unfollow: DELETE مع تجاهل الاستجابة كلياً؛ `followLoading` يعطل الزر ويعرض «...»؛ كل الأخطاء صامتة (لا toasts في هذه الشريحة).
  - **عرض بروفايل**: نقر أي صف/عمود منصة ليس أنا → fetch البروفايل وفتح المودال فقط عند `success` (فشل صامت).

- **التصميم**: عمود `max-w-lg`، نصوص صغيرة 10–14px؛ keyframe عالمي `pulse-glow` (box-shadow كهرماني نابض 1.5s)؛ ألوان الرتب لواجهة الصفحة من `RANK_COLORS`: `#6b7280 / #3b82f6 / #a855f7 / #f59e0b / #ef4444` مع `RANK_NAMES_AR` (مُخبر/جندي/كابو/أندربوس/الأب الروحي) و`RANK_BADGES` (🕵️⚔️🎖️💎👑) و`RANK_RR_REQUIRED` (100/200/300/400/9999)؛ بطاقات رتبتي بتدرج `linear-gradient(135deg, {color}15, rgba(5,5,5,0.9))`؛ أرقام RR بمحاذاة LTR و`tabular-nums`.

- **API** (كلها REST نسبية):
  - `GET /api/player-app/leaderboard` (بدون auth) — اللوحة الحية.
  - `GET /api/player-app/{playerId}/co-players` (Bearer).
  - `GET /api/player/{id}/profile` — لنفسي ولأي لاعب معروض.
  - `GET /api/progression-settings/public` — `{config:{xp:{...}, rr:{...}, ranks:{TIER:{rrRequired}}}}`.
  - `GET /api/seasons/public/active` / `GET /api/seasons/public/list` / `GET /api/seasons/public/online-list` (يعيد أيضاً `activeOnlineSeasonId`).
  - `GET /api/seasons/public/{seasonId}/leaderboard` — أي لوحة غير حية.
  - `POST /api/player-app/{playerId}/follow/{targetId}` / `DELETE` نفس المسار (Bearer).
  - الجلسة عبر `PlayerContext` (`player.playerId`, `player.token`).

- **Socket**: لا شيء — النضارة عبر refetch على visibility/focus فقط.

- **مكافئ Flutter**:
  - `Scaffold` + `CustomScrollView`؛ التبويبات segmented pills مخصصة + `AnimatedSwitcher` (~200ms fade)؛ المنسدلة → `DropdownMenu` بشكل pill.
  - auto-scroll: `GlobalKey` على صفّي + `Scrollable.ensureVisible(alignment: 0.5)` بعد أول frame + 300ms؛ الـ glow عبر `AnimationController.repeat(reverse:true)` يوقَف بعد 5s.
  - المودالات → `showModalBottomSheet(isScrollControlled:true)` + `DraggableScrollableSheet` — السحب للإغلاق وقفل التمرير مجانيان؛ **لا تنقل** حيل `useModalScrollLock` (تجميد body، اعتراض touchmove، عتبة 80px) فهي web-only؛ حافظ على أن sheet البروفايل يتوقف فوق الـ bottom nav.
  - refetch-on-return: `WidgetsBindingObserver.didChangeAppLifecycleState == resumed` + `RouteAware.didPopNext`.
  - **مخاطر**: لوحتا ألوان رتب متعارضتان بالتصميم (صفحة UI مقابل كرت اللعب) — لا توحّدهما؛ مجموعتا شارات emoji — أبقِ كليهما؛ قائمة أفعال تبويب النقاط hardcoded client-side (أفعال سيرفر جديدة لن تظهر تلقائياً)؛ قصّ الأسماء اليدوي (16/10/8 + …)؛ سلوك follow المتفائل والأخطاء الصامتة يُنقلان كما هما.

---

### 4) سجل المباريات (`/player/history`)

- **الوظيفة والرحلة**: السجل الكامل لمباريات اللاعب، يُدخل من البروفايل (زر الإغلاق يعود إلى `/player/profile`)؛ كل بطاقة مباراة تفتح مودال تفصيل نقاط كامل (XP/RR سطراً سطراً + الديل + النجاة).

- **الحالات والشاشات الفرعية**:
  - **Loading**: spinner كهرماني 48px بدوران framer 2s.
  - **Error**: «لم يتم العثور على الحساب» (بدون fetch عند غياب playerId) / خطأ السيرفر أو «فشل في جلب السجل» / «خطأ في الاتصال بالخادم» + زر «العودة للبروفايل».
  - **Header لاصق** (sticky, `bg-black/80 backdrop-blur-xl`): «📜 سجل المباريات» + زر ✕ دائري → البروفايل.
  - **حالة فارغة**: 🎮 كبير + «لا يوجد مباريات مسجلة بعد!».
  - **قائمة البطاقات**: دخول متدرج (delay `0.05×i`)؛ فوز = خلفية/حدود emerald، خسارة = rose؛ blob توهج زخرفي 128px مضبب في الزاوية؛ الصف العلوي: اسم اللعبة (fallback «مباراة مافيا») + `{تاريخ d/m/yyyy} • ⏱️ {m:ss}` + chip «🏆 فوز»/«💀 خسارة»؛ الصف السفلي: chip الفريق (مافيا حمراء/مواطن سماوي) + اسم الدور بالعربية + `+XP` كهرماني و`±RR` أخضر/أحمر.
  - **مودال «📊 تفصيل النقاط»**: bottom-sheet على الموبايل، dialog مركزي على ≥sm (breakpoint ≈640px)؛ spring slide-up؛ بطاقة معلومات المباراة (الدور + chip الفريق مع «دور محايد» البنفسجي لـ NEUTRAL + النتيجة + شريط meta: «🛡️ نجا للنهاية» أو «أُقصي ليلاً/نهاراً (جولة N)» + «📊 {n} جولات»)؛ بطاقة تفصيل XP (كهرمانية) وبطاقة RR (بنفسجية) بصفوف `PointRow` (قيمة 0 → لا شيء؛ موجب أخضر بـ +؛ سالب أحمر؛ mono) وحالتا فراغ «لا نقاط خبرة»/«لا تغيّر في الرتبة» وصفوف مجموع؛ صندوق TOTAL XP / TOTAL RR بأرقام 3xl وفاصل عمودي متدرج؛ ملاحظة الديل (✅/❌ بنصّيهما الكاملين) فقط إذا `dealInitiated`؛ زر «إغلاق» بعرض كامل. أثناء الفتح: class `modal-open` على body (يعطّل pull-to-refresh المخصص) + تجميد كامل للتمرير مع استرجاع الموضع عند الإغلاق. الإغلاق: backdrop / ✕ / زر إغلاق (لا سحب هنا).

- **الميزات والتفاعلات**: قراءة الجلسة من localStorage مباشرة (legacy — بدون PlayerContext)؛ اشتقاق الفوز/الفريق من `breakdown` أو fallback قائمة أدوار المافيا؛ المدة `floor(s/60):(s%60).padStart(2,'0')` و«—» عند الغياب؛ hover `scale-[1.01]` على البطاقات و`active:scale-[0.98]` على زر الإغلاق.

- **التصميم**: أسود كامل، `max-w-lg`, `pb-20`؛ نفس لغة emerald/rose للفوز/الخسارة؛ خلفية المودال `gradient gray-900→black` بظل علوي.

- **API**: `GET /api/player-app/{playerId}/matches` (Bearer) — يعيد `MatchDetails[]`: `matchId, gameName, matchDate, matchWinner, durationSeconds, totalRounds, playerCount, role, survivedToEnd, eliminatedDuring('NIGHT'|'DAY'|null), eliminatedAtRound, roundsSurvived, dealInitiated, dealSuccess, abilityUsed, abilityCorrect, xpEarned, rrChange, penaltyCount, penaltyRRDeduction, bombRRChange, breakdown?` (ملاحظة: `totalRounds, playerCount, penaltyCount, penaltyRRDeduction, bombRRChange, abilityUsed, abilityCorrect` موجودة بالعقد وغير معروضة حالياً — فرصة تحسين في Flutter).

- **Socket**: لا شيء.

- **مكافئ Flutter**: `ListView.builder` مع `flutter_animate` stagger (`50.ms × index`)؛ المودال `showModalBottomSheet` مع `LayoutBuilder` للتحول إلى Dialog مركزي على الشاشات العريضة؛ تجميد الـ body web-only ولا يُنقل؛ التواريخ عبر `intl` (`DateFormat` عربي)؛ توحيد مصدر الجلسة مع بقية التطبيق (store واحد بدل قراءة localStorage المباشرة).

---

### 5) إطارات وتأثيرات الرتب على كرت اللعب (`RankFrames.tsx` + `RankEffects.css` — تُعرض داخل `DynamicMafiaCard`)

- **الوظيفة والرحلة**: طبقات زخرفية فوق كرت اللاعب أثناء اللعب، تزداد فخامة مع الرتبة؛ **كلها config-driven** من `RankEffectsDef` عبر `useGameConfig().getRankEffectsForTier(tier)` (قابلة للتحرير من الأدمن، cache على مستوى الموديول 5 دقائق) مع `rankEffectsOverride` لمعاينة الأدمن الحية.

- **الحالات والشاشات الفرعية**: 5 أنواع إطارات (`FrameType`): `none ⬜ / simple 🔲 / greek 🏛️ / islamic 🕌 / deco 🎭 / royal ⚜️` (metadata في `FRAME_OPTIONS`)؛ INFORMANT بلا تأثيرات (كرت عادي في المسار القديم class-based).

- **الميزات والتفاعلات** (مواصفات الرسم كاملة موثقة بالتقرير المصدر §C/§D — أهم النقاط):
  - **الإطارات SVG إجرائية**: Simple (4 أقواس زوايا L-شكل 18×18)؛ Greek (شريط meander بنمط مفتاح يوناني tile 16×8 + إطار خارجي + 4 زخارف زوايا؛ أنيميشن `greek-scroll` — **خلل معروف**: translateX 0→10px ≠ عرض tile 16px فتقفز الحلقة، ومرجع pattern عابر لـ SVGين هشّ — يُصلَّحان في Flutter)؛ Islamic (حد متقطع + نجوم ثمانية 16-رأس بزوايا `i·π/8 − π/16` ونصفي قطر r/0.38r في الزوايا ومراكز الأضلاع + `frame-spin` 20s)؛ Art Deco (إطار مزدوج + مراوح 5 خطوط −50°…+50° + زوايا مدرّجة + `deco-pulse` 3s)؛ Royal (إطار مزدوج + fleur-de-lis بيزييه أعلى/أسفل + ميداليات زوايا + خطوط متقطعة).
  - **keyframes التأثيرات**: `rank-pulse` (box-shadow بين `--rank-glow` و`--rank-glow-strong`)، `rank-shimmer` (شريط ضوء قطري 25° يعبر −100%→200%)، `crown-float` (±3px)، `particle-orbit` (دوران حول المركز مع غلاف opacity 0→1→1→0 عند 0/20/80/100%)، `corner-pulse`، `border-travel` (تدرج متحرك بخلفية 200%)، `particle-burst` مع 8 fallbacks مرقّمة بنقاط نهاية ثابتة (المستخدمة فعلياً: `particle-burst-{i%8}`).
  - **بنية الـ config** (كل قسم له `enabled`): `border {style: solid|gradient|traveling, width, inset, color, gradientColors[], travelSpeed}`، `glow {color, size, opacity, pulseEnabled, pulseDuration}`، `shimmer {color, opacity, duration}`، `particles {count, color, size, orbitRadius%, baseDuration, originX/Y, animationType: orbit|burst, burstDistance}`، `frame {type, color, opacity, strokeWidth, animate}`، `gradientOverlay {color, opacity, direction}`، `corners`، `floating {content, position, size, animation: float|bounce|spin, glowColor, offsets, scale}`، `badge {emoji, label, ألوان, position, offsets, scale}`، `nameEffect {color, glowColor, glowSize}`.
  - **المسار القديم class-based** (تُحفظ قيمه كافتراضيات): SOLDIER أخضر `#10b981` (حد ثابت + خط علوي متدرج)؛ CAPO أزرق `#3b82f6` (نبض + 4 أقواس زوايا + طبقة تدرج)؛ UNDERBOSS بنفسجي `#8b5cf6` بلمسات كهرمانية (border-image متدرج + shimmer + 3 جسيمات مدارية 52%)؛ GODFATHER ذهبي `#f59e0b` (حلقة تدرج متنقلة بـ double-mask، توهج حتى 80px، تاج 👑 عائم عند −14px، جسيمات 54%، shimmer، `.rank-name-glow` — اسم اللاعب `#fcd34d` بظلال كهرمانية)؛ `.rank-badge` pill صغير أعلى-يسار بخط Inter 8px و`backdrop-blur`.
  - z-order إلزامي: gradientOverlay(49) < border(50) < frame(51) < shimmer(52) < particles(53) < badge/floating/crown(55)؛ الطبقة كلها تختفي عند قلب الكرت (`backfaceVisibility` + `translateZ(1px)` على الويب).

- **التصميم**: ألوان الكرت من الـ config/CSS (أخضر/أزرق/بنفسجي/كهرماني) — **مختلفة عمداً** عن ألوان صفحات الـ UI.

- **API**: endpoints إعدادات اللعبة داخل `useGameConfig` (غير مستدعاة من صفحتي الرتب/السجل مباشرة) توفر `RankEffectsDef[]`.

- **Socket**: لا شيء.

- **مكافئ Flutter**:
  - إطارات → `CustomPainter` واحد `RankFramePainter(type, color, opacity, strokeWidth, animate, t)`: مسارات `Path` بأطراف مستديرة؛ النجمة الثمانية مولّد مضلّع؛ الـ meander وحدة مفتاح واحدة تُكرَّر بحلقة translate داخل band مقصوص (اجعل دورة الأنيميشن = عرض tile لإصلاح القفزة)؛ الحدود المتقطعة عبر `path_drawing.dashPath` (لا يوجد dashed stroke أصلي)؛ المرايا عبر `canvas.scale(1,-1)`.
  - تأثيرات → تركيب طبقات فوق widget الكرت بنفس ترتيب z: توهج نابض بـ lerp بين مجموعتي `BoxShadow`؛ الحلقة المتنقلة رسم مباشر بـ `Paint..shader = LinearGradient..style = stroke` على RRect مع تحريك إحداثيات الـ shader (أبسط بكثير من حيلة mask-composite)؛ shimmer شريط قطري مقصوص (custom أدق من `flutter_animate.shimmer()`)؛ جسيمات مدارية N حاويات موضعها `center + Offset(cosθ, sinθ) × orbitRadius` (النسبة تُحل ضد أبعاد الكرت بـ `LayoutBuilder`؛ مدة `base + i×0.8`s وتأخير `i×0.7`s)؛ burst عبر tween نحو متجهات النهاية الثمانية الثابتة؛ التاج/العائم `Positioned(top:-14)` بتذبذب جيبي وglow؛ الشارة `Positioned(top:4,left:4)` (استبدل blur بلون صريح)؛ توهج الاسم `Text` بظلّين كهرمانيين؛ لا تبنِ الطبقة عند زاوية قلب >90°.
  - انقل نماذج `RankEffectsDef` حرفياً وابنِ `RankEffectsOverlay(config)` واحداً؛ لا تكوّد ألوان الـ CSS القديمة إلا كافتراضيات.
  - **مخاطر**: أنيميشنات لانهائية مستمرة (نبض/جسيمات/shimmer/حلقة) = بطارية وjank على أندرويد الضعيف — `TickerMode` + إيقاف خارج الشاشة + احترام reduce-motion + `RepaintBoundary` حول الكرت + خيار `animate:false`؛ اختبار emoji (🕵️ ⚜️ 🌟) على الأجهزة المستهدفة.

---

### 6) طلبات المطعم (`/player/order`)

- **الوظيفة والرحلة**: طلب أكل ومشروبات من المكان المستضيف للفعالية المحجوزة؛ الشاشة **مبوّبة بسياق (gated)**: تعمل فقط بوجود حجز لنشاط `menuOrderingEnabled` داخل نافذة الطلب (من ساعة قبل الموعد حتى 12 ساعة بعده، والنشاط غير completed/cancelled وله locationId)، أو كون اللاعب داخل جلسة لعب حية مرتبطة بها (`source='live'` — **الحجز إلزامي في الحالتين**: قرار عمل مقفول). ثم يتابع حالة طلباته (new → preparing → delivered أو cancelled).

- **الحالات والشاشات الفرعية**:
  - **Loading**: spinner زمردي 40px.
  - **No context (مبوّب خارجاً)**: 🍽️ كبير + «لا يوجد نشاط متاح للطلب الآن» + شرح رمادي: `reason` من السيرفر إن وُجد (مثل «الطلب متاح للحاجزين فقط — لا يوجد حجز باسمك لهذه الفعاليّة») وإلا النص الافتراضي «الطلب من المكان يفتح للحاجزين قبل ساعةٍ من موعد الفعاليّة وأثناءها.» + زر «← الرئيسيّة» → `/player/home`.
  - **الصفحة الرئيسية**: بطاقة رأس («اطلب من {locationName}» + سطر فرعي حسب المصدر: «🎮 أنت داخل اللعبة» أو «🎟️ حجزك مؤكّد للطلب») → قسم «📋 طلباتي ({عدد النشطة})» (فقط إذا وُجدت طلبات؛ **العدّاد يستثني الملغاة والقائمة تعرض الكل**) → المنيو مجمّعاً بالفئات → banner خطأ وردي شرطي → شريط سلة ثابت (فقط عند `cartCount>0`) → success toast overlay بعد الإرسال (2.5s).
  - **بطاقة طلب**: chip حالة ملوّن + الإجمالي «{total} د.أ»؛ ملخص أصناف `name ×qty` مفصولة بـ «•»؛ سطر ملاحظة «📝» اختياري؛ وقت الإنشاء `ar-JO hh:mm`؛ زر «إلغاء الطلب» الوردي فقط لحالة `new`. خريطة الحالات: `new` «جديد — بانتظار المكان» `#3b82f6` 🕐 / `preparing` «قيد التحضير» `#f59e0b` 👨‍🍳 / `delivered` «تمّ التسليم» `#22c55e` ✅ / `cancelled` «ملغى» `#6b7280` ✖️ / المجهولة → meta الـ new.
  - **منيو فارغ**: بطاقة بحد **متقطع** «المكان لم يضف أصنافاً بعد».
  - **صف صنف**: thumbnail 48px (صورة أو 🍴) + اسم truncate + وصف اختياري truncate + سعر «{price} د.أ» زمردي؛ حدود الصف تتحول زمردية عندما الصنف في السلة؛ التحكم: «+ أضف» عند 0، أو stepper (− / كمية / +) عند >0.

- **الميزات والتفاعلات**:
  - fetch `/api/fnb/context` عند توفر `player`؛ بوجود سياق → جلب المنيو + طلباتي.
  - السلة `Map<menuItemId, qty>` في الذاكرة فقط (تضيع بالتحديث)؛ سقف **20 لكل صنف** مفروض بصمت client-side؛ qty ≤ 0 يزيل الصنف؛ `cartTotal` من أسعار المنيو (عرض فقط — **السيرفر يعيد التسعير من DB داخل transaction مع snapshots**، أسعار العميل غير موثوقة).
  - حقل ملاحظة اختياري ≤300 حرف (client + server).
  - إرسال: معطّل أثناء `sending`؛ نجاح → تفريغ السلة والملاحظة + toast نجاح 2500ms + إعادة تحميل الطلبات؛ فشل → `d.error` أو «فشل إرسال الطلب»؛ شبكة → «خطأ في الاتصال».
  - إلغاء طلب: POST بدون dialog تأكيد؛ نجاح → reload؛ خطأ → «تعذّر الإلغاء» في الـ banner.
  - **Polling**: `setInterval` 30s + مستمع `visibilitychange` — كلاهما يجلب الطلبات فقط عندما التبويب visible؛ تنظيف عند unmount.
  - **أخطاء السيرفر الواجب عرضها حرفياً** (عربية): سلة فارغة 400 «أضف صنفاً واحداً على الأقلّ»؛ >30 بنداً 400 «عدد بنود الطلب كبير جدّاً»؛ كمية غير صالحة (int 1–20) 400 «بند غير صالح (الكمّية 1-20)» (البنود المكررة تُدمج server-side)؛ لا سياق 403؛ live بلا حجز 403 بسبب الحجز؛ ≥10 طلبات غير ملغاة للنشاط 429 «وصلت حدّ الطلبات لهذه الفعاليّة — راجع المكان»؛ صنف غير متاح 400 «بعض الأصناف لم تعد متاحة — حدّث المنيو وأعد المحاولة»؛ إلغاء متأخر 400 «لا يمكن إلغاء الطلب — بدأ تحضيره أو غير موجود».
  - تجميع الفئات يحافظ على ترتيب السيرفر (category asc → sortOrder asc → id asc) — لا فرز أبجدي؛ فئة فارغة → عنوان «المنيو».

- **التصميم**: لون التمييز زمردي `#10b981` لكامل الشريحة؛ بطاقة الرأس `linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,5,5,0.9))`؛ شريط السلة `fixed bottom-20` (فوق الـ bottom nav) بخلفية خضراء داكنة جداً `rgba(6,20,14,0.95)` + `backdrop-blur-xl` وحدود زمردية، دخول/خروج spring (damping 25, stiffness 300, y:100→0/خروج 120)؛ زر الإرسال بتدرج `#10b981→#0d9488` بعنوان «إرسال الطلب • {total} د.أ» أو «⏳ يُرسل…»؛ toast النجاح fade+scale «وصل طلبك للمكان!» + «تابع حالته في «طلباتي» أعلى الصفحة»؛ `pb-32` لتفادي تغطية السلة والـ nav.

- **API** (base `/api/fnb`، كلها Bearer):
  - `GET /api/fnb/context` — `{context: null | {...}, reason?}`؛ المستخدم منه: `activityId, activityName, locationName, source`.
  - `GET /api/fnb/menu?activityId={id}` — `{items:[{id, category, name, description, price(string), imageUrl|null}]}` (المتاح وغير المحذوف فقط؛ `clubShare` غير مكشوف للاعب عمداً).
  - `POST /api/fnb/orders` — `{items:[{menuItemId, quantity}], note}` → `{order}`.
  - `GET /api/fnb/my-orders?activityId={id}` — طلبات بحقول snapshot، createdAt desc.
  - `POST /api/fnb/orders/{id}/cancel` — بدون body.

- **Socket**: صفحة اللاعب لا تفتح ولا تستمع لأي socket. الأحداث الخلفية للمكان فقط: `fnb:new-order` و`fnb:order-updated` إلى `location:{locationId}`. اللاعب يستقبل **FCM push** عند تغيير الحالة (`type: order_status`, `url: '/player/order'`): «👨‍🍳 طلبك قيد التحضير» / «✅ تمّ تسليم طلبك» / «✖️ أُلغي طلبك». التحديث الحي للاعب = polling 30s + push فقط (لا room للاعب — إضافة socket تتطلب عمل backend).

- **مكافئ Flutter**:
  - `ListView`/`CustomScrollView` بأقسام مجمّعة (تجميع بـ `LinkedHashMap` لحفظ ترتيب الفئات)؛ شريط السلة `Stack` + `Positioned(bottom: navHeight + 8)` مع `AnimatedSlide`/spring؛ toast النجاح `Overlay` + `IgnorePointer` مع مؤقّت 2.5s؛ stepper صف `InkWell`s مع clamp 1–20.
  - السلة في notifier (Riverpod/Bloc)؛ polling عبر `Timer.periodic(30s)` مشروطاً بـ `AppLifecycleState.resumed` (`WidgetsBindingObserver`).
  - الأسعار strings (Postgres numeric) → `double.parse` والعرض `toStringAsFixed(2)` + «د.أ» يدوياً؛ وقت الطلب `DateFormat.jm('ar_JO')`.
  - **push deep links**: توجيه نقرة إشعار `order_status` إلى شاشة الطلب + refresh فوري للطلبات (يعوّض دورة الـ 30s).
  - صور المنيو مسارات نسبية (`/uploads/menu/...`) → prefix بالـ base URL + `cached_network_image` مع fallback 🍴.
  - **مخاطر**: keyboard-avoidance لحقل الملاحظة فوق شريط السلة (`MediaQuery.viewInsets` / `resizeToAvoidBottomInset`)؛ قرار: هل تُضاف رسالة عند بلوغ سقف الـ 20 (حالياً صامت)؟ وهل تُحفظ السلة (حالياً ephemeral)؟ إبقاء الملغاة ظاهرة بالقائمة ومستثناة من العدّاد كما هو.

---

### 7) التقييم الإلزامي (`/player/feedback`)

- **الوظيفة والرحلة**: استبيان رضا إجباري على مستوى الغرفة (session): عند إغلاق القائد للغرفة يُنشأ صف pending لكل مشارك (roster ∪ لاعبي المباراة، مع استثناء المواقع التجريبية والجلسات قبل cutoff `2026-06-17`). الشاشة تعرض استبياناً واحداً (11 سؤال Likert 1–5) وتتسلسل تلقائياً للتالي حتى انتهاء الكل ثم شاشة شكر. الدخول: تنقّل مباشر، deep link بـ `?sessionId=`، أو تحويل من بوابة التطبيق.

- **الحالات والشاشات الفرعية**:
  - **Suspense fallback**: div فارغ `#050505` (الصفحة ملفوفة بـ `Suspense` لأجل `useSearchParams` — خصوصية Next لا تُنقل).
  - **Loading**: «⏳ جاري التحميل...» مركزية.
  - **Done / لا معلّق**: 🎉 56px + «شكراً لك!» أخضر `#22c55e` + «أكملت كل الاستبيانات المطلوبة. رأيك يساعدنا على التحسين.» + زر «تصفّح الفعاليات 🎮» بتدرج كهرماني `#f59e0b→#d97706` بنص أسود → `router.replace('/player/games')`.
  - **نموذج الاستبيان**: رأس «📋 قيّم تجربتك» كهرماني + سطر سياق شرطي الأجزاء: «🎯 {activityName} · » / «📍 {locationName} · » / «🗓️ {playedAt بصيغة ar-JO يوم + شهر مختصر}» / «(غرفة {sessionCode})» باهت؛ banner بنفسجي «لديك {n} استبيانات معلّقة — هذا أحدها» فقط إذا `pending.length>1`؛ شريط تقدم 6px أخضر بعرض `answered/total` (transition 0.25s)؛ 11 بطاقة سؤال؛ textarea ملاحظات اختيارية (rows 3, maxLength 1000, «اكتب ملاحظتك هنا...»)؛ زر إرسال بثلاث حالات: مفعّل «إرسال ✓» بتدرج أخضر `#22c55e→#16a34a` بنص أسود / «⏳ جاري الإرسال...» / معطّل «أجب على كل الأسئلة ({answered}/{total})».
  - **بطاقة سؤال**: رقم باهت + نص السؤال + 5 أزرار تقييم متساوية العرض؛ غير المحدد: شفاف بحد باهت؛ المحدد: خلفية لون السلّم الصلب + نص **أسود** + تسمية صغيرة تحت الرقم تظهر عند التحديد فقط. سلّم الألوان: 1 «سيّئ جداً» `#ef4444`، 2 «سيّئ» `#f97316`، 3 «متوسط» `#eab308`، 4 «جيد» `#84cc16`، 5 «ممتاز» `#22c55e`.

- **الميزات والتفاعلات**:
  - تحميل `/api/player-feedback/pending`؛ الهدف = `?sessionId` إن وجد وإلا أول معلّق؛ لا شيء → حالة Done.
  - **alreadyDone**: إذا الاستبيان المحمّل مُرسل سابقاً → تقدّم تلقائي للمعلّق التالي ≠ الحالي أو حالة Done (**احذر حلقة loadSurvey → loadPending → loadSurvey — نفّذها كحلقة async بحارس ضد اللانهائية**).
  - اختيار الإجابة: نقرة تضبط `answers[key]=v` (اختيار مفرد، لا إلغاء تحديد، نقرة على قيمة أخرى تغيّر).
  - التحقق: الإرسال مفعّل فقط عند إجابة كل الأسئلة؛ السيرفر يعيد التحقق (كل مفاتيح `FEEDBACK_KEYS` أعداد صحيحة 1–5 وإلا 400 «إجابة غير صالحة أو ناقصة: {key}»)؛ الملاحظات تُقصّ إلى 1000.
  - **الإرسال المتسلسل**: بعد النجاح إعادة جلب pending؛ إن بقي غيره → تحميل التالي مع تصفير الإجابات والملاحظات + تمرير سلس للأعلى؛ وإلا حالة Done. السيرفر idempotent (إعادة إرسال جلسة منجزة تعيد `{success:true}`).
  - الفشل: `alert()` متصفح بالنص أو «تعذّر الإرسال» — **يُستبدل في Flutter بنمط أخطاء موحد (SnackBar/dialog)**.
  - **عقد الحجب على مستوى التطبيق**: `countBlockingPending` = المعلّق الأقدم من ساعة (grace `FEEDBACK_GRACE_MS = 3600000`) المرتبط بجلسة حقيقية بعد الـ cutoff — يحجب اللاعب من أفعال أخرى (كالحجز)؛ يجب على shell تطبيق Flutter تنفيذ نفس البوابة وتوجيه المحجوبين إلى هذه الشاشة مع دعم الطابور المتسلسل.

- **التصميم**: خلفية `#050505`، عرض أقصى 560px، كل التنسيق inline styles (وليس Tailwind)؛ نصوص بيضاء بشفافيات متدرجة؛ transitions خفيفة (0.15s للأزرار، 0.25s للشريط).

- **API** (base `/api/player-feedback`، Bearer):
  - `GET /api/player-feedback/pending` — `{count, pending:[{sessionId, sessionName, sessionCode, activityName, locationName, playedAt}]}` بترتيب createdAt asc.
  - `GET /api/player-feedback/{sessionId}` — `{questions:[{key, dimension, text}] (11), alreadyDone, context}`؛ 400 «sessionId غير صالح»؛ 403 «لا يوجد استبيان مطلوب لهذه الغرفة».
  - `POST /api/player-feedback/{sessionId}` — `{answers: Record<key,1..5>, notes?}` → `{success:true}`.
  - المفاتيح الـ 11: `overall, venue, gameplay, clarity, pacing, seating, leader, fairness, atmosphere, value, recommend` — **لا تُكوَّد الأسئلة في Flutter؛ تُعرض كما تصل من `questions` (المفاتيح تقود payload الإجابات؛ حقل `dimension` غير معروض)**.

- **Socket**: لا شيء. الدخول المتوقع من push عند إغلاق الغرفة بـ deep link `/player/feedback?sessionId=…` — route في Flutter يجب أن يقبل معامل `sessionId`.

- **مكافئ Flutter**: `ListView` لبطاقات الأسئلة؛ صف التقييم 5 أزرار `Expanded` toggle؛ شريط التقدم `TweenAnimationBuilder`/`AnimatedContainer` (6px مستدير)؛ `window.scrollTo` السلس → `ScrollController.animateTo(0)`؛ `useSearchParams`/Suspense → معامل route عادي؛ إدارة الطابور والتسلسل في notifier واحد؛ لا تخزين محلي ولا مؤقتات في هذه الشاشة — من أبسط الشرائح نقلاً.

---

### ملاحظات عرضية مشتركة للقسم
- **لا Socket في أي شاشة من هذا القسم** — كلها REST + polling/lifecycle refetch + FCM push؛ هذا يبسّط النقل ويُبقي طبقة socket محصورة بشرائح اللعب.
- **الجلسة**: ثلاث مصادر ويب (PlayerContext / `mafia_player_auth` / مفاتيح legacy) — تُوحَّد في Flutter بمخزن جلسة واحد يبني header الـ Bearer، مع الإبقاء على عقود الـ API كما هي.
- **الأخطاء العربية من السيرفر تُعرض حرفياً** (تحمل النبرة المقصودة) — لا ترجمة ولا إعادة صياغة.
- **الأصول**: لا صور/أصوات/lottie مضمّنة في كامل القسم؛ كل الأيقونات emoji + SVG إجرائي؛ الصور الشبكية الوحيدة: avatars وصور المنيو (مسارات نسبية تحتاج base URL + cache busting للـ avatar).

---

# 7. الأنظمة المنصّية: الإشعارات، الصوت، ونظام التصميم

هذا القسم يغطي ثلاث بنى تحتية عرضية (cross-cutting) تلمس كل شاشة في تطبيق اللاعب: خط أنابيب الإشعارات المزدوج (FCM + Web Push) مع صندوق الوارد، ونظام الصوت المركزي بمعمارية «الليدر مصدر الصوت الحصري»، ونظام التصميم Dark Noir V2.1 الذي يجب استخراجه كاملاً إلى `ThemeData`. القاعدة العامة للنقل: قسم كبير من تعقيد الويب هنا موجود فقط لسد ثغرات المنصة (iOS Web Push، Service Worker lifecycle، autoplay policy، PWA install) — وفي Flutter يُحذف أو يُستبدل بحلول native أبسط، لكن **عقد الـ backend يبقى كما هو دون أي تغيير**.

---

### 1. غلاف التطبيق وخط أنابيب الدفع (PWA Shell + Service Worker + usePushNotifications) — مكوّن نظامي، ليس شاشة

- **الوظيفة والرحلة**: يجعل التطبيق قابلاً للتثبيت (PWA عربي RTL، ثيم `#050505`)، ويوصل الإشعارات عبر خطين: FCM (Android/Chrome/Edge/Firefox/Desktop) وWeb Push خام (iOS/Safari حيث لا تعمل FCM web tokens). عند فتح التطبيق يسجّل `sw.js`، وعند تسجيل دخول اللاعب يعيد hook `usePushNotifications` تسجيل الاشتراك/التوكن مع السيرفر تلقائياً وبصمت، ويسلّم JWT اللاعب + deviceId إلى الـ SW.
- **الحالات والشاشات الفرعية**:
  - **Manifest**: name «Mafia Club — نادي المافيا»، short_name «Mafia Club»، `start_url: /player`، `display: standalone`، `orientation: portrait`، `background/theme: #050505`، `lang: ar`، `dir: rtl`، categories `games/entertainment`، أيقونات 192/512 `any maskable`.
  - **Root layout**: `<html lang="ar" dir="rtl">`، عنوان «Phygital Mafia Engine | V2.1 Noir Edition»، `appleWebApp` (black-translucent)، viewport بلا zoom (`maximumScale:1, userScalable:false`)، meta no-cache كاملة، تحميل خطوط Google (Amiri, Cairo 400/700/900, Tajawal, Noto Kufi Arabic, Reem Kufi)، dotlottie player من unpkg CDN.
  - **سكربت النسخة (cache-nuke)**: `APP_VERSION = '2.5.0'` مقارنة بـ `localStorage.mafia_app_version` — عند الاختلاف: حذف كل الـ caches + إلغاء تسجيل كل الـ SWs + reload بعد 300ms. auto-reload على تحديث SW **معطّل عمداً** (كان يسبب infinite loop).
  - **Service Worker موحّد** (`sw.js`؛ `firebase-messaging-sw.js` مجرد `importScripts('./sw.js')`): cache باسم `mafia-club-${BUILD_HASH}` يُستبدل عند الـ deploy؛ precache لـ `/player`, `/player/profile`, `/mafia_logo.png`؛ استراتيجية network-first مع cache fallback (GET فقط)، تجاوز كامل لـ `/api/*`, `/socket.io/*`, `/uploads/*`؛ offline → cached match أو `/player` للـ documents أو 503.
  - **قاعدة منع التكرار (حرجة)**: الـ backend يرسل رسائل FCM **data-only**. على المتصفحات الداعمة لـ FCM يكون `onBackgroundMessage` هو مصدر العرض الوحيد (مستمع `push` الخام يخرج مبكراً عندما `firebaseInitialized === true`)؛ على iOS/Safari (فشل استيراد Firebase حميد داخل try/catch) يكون مستمع `push` الخام هو الوحيد. مصدر عرض واحد لكل بيئة = صفر إشعارات مكررة.
  - **notificationclick**: إغلاق الإشعار → حلّ URL (من `data.url` أولاً) → خارجي: `openWindow` بتبويب جديد؛ داخلي مع نافذة مفتوحة: `client.navigate + focus`؛ **cold start**: تخزين الوجهة كـ Response في cache `mafia-auth` تحت مفتاح `/__pending_nav` (لأن iOS قد يفتح start_url ويتجاهل الرابط العميق) — يستهلكه `player/layout.tsx` بعد تحميل auth اللاعب ثم يحذفه وينفذ `router.replace`.
  - **مخزن auth داخل الـ SW** (cache `mafia-auth`): مفاتيح `/__player_token` و`/__device_id` تُكتب عبر `postMessage({type:'SET_AUTH_TOKEN', token, deviceId})`، تنجو من إعادة تشغيل الـ SW.
  - **pushsubscriptionchange** (iOS يدوّر الاشتراكات): جلب VAPID key → إعادة الاشتراك → إعادة تسجيل التوكن ذاتياً بصيغة `'WEBPUSH::' + JSON(subscription)` مع deviceId المخزن.
- **الميزات والتفاعلات** (hook `usePushNotifications` — مركّب في 3 أماكن: player layout + home + NotificationBell):
  - حارس تزامن module-level (`autoRegisterInFlight` + `autoRegisteredForToken`) يمنع سباق النسخ الثلاث وإنشاء توكنات مكررة؛ يُعاد ضبطه عند الفشل للسماح بإعادة المحاولة.
  - `permissionState: 'prompt'|'granted'|'denied'|'unsupported'` — القيمة الأولية تُحسب **synchronously** من `localStorage.push_notifications_enabled` أو `Notification.permission` لتفادي وميض واجهة «محظور».
  - كشف البيئة: iOS عبر regex للـ UA؛ standalone عبر `navigator.standalone`/`display-mode`. iOS غير مثبّت → `needsInstall=true` وحالة `unsupported`. **وجود PushSubscription حي = أقوى مصدر حقيقة** (يتفوق على `Notification.permission` غير الموثوق في iOS PWA)؛ حالة `denied` قديمة على iOS تُتجاهل عند الإقلاع وتبقى `prompt` للسماح بالمحاولة.
  - `requestPermission()` (يتطلب user gesture + لاعب مسجّل): عند المنح — تثبيت الحالة + localStorage فوراً حتى لو فشل توليد التوكن؛ iOS يتخطى FCM كلياً ويذهب مباشرة لـ Web Push خام (مع unsubscribe للاشتراك القديم لمنع `VapidPkHashMismatch`).
  - **auto-register صامت** (مرة لكل token): اشتراك قائم مطابق لمفتاح السيرفر → إعادة تسجيله كما هو (no churn)؛ non-iOS مع إذن ممنوح → `requestPermission()` (FCM getToken idempotent)؛ iOS سبق الموافقة بلا اشتراك صالح → إنشاء اشتراك Web Push واحد جديد.
  - Foreground: `onMessage` (FCM) أو رسالة `PUSH_RECEIVED` من الـ SW → إعادة جلب صندوق الوارد فقط (لا banner)؛ **polling كل 60 ثانية** للصندوق.
- **التصميم**: لا UI خاص به عدا شاشة التحميل العامة (خلفية سوداء، spinner 12×12 حدود amber-500، نص «جاري التحميل...» رمادي) — راجع قسم الثيم.
- **API**:
  | Endpoint | ملاحظات |
  |---|---|
  | `GET /api/push/vapid-public-key` (بدون auth) | `{publicKey}` — مصدر مفتاح VAPID الوحيد |
  | `POST /api/player-notifications/register-token` | `{token, deviceId, deviceInfo}` — التوكن إما FCM خام أو `WEBPUSH::+JSON`؛ dedup لكل deviceId؛ Bearer player JWT |
  | `GET /api/player-notifications?limit=` | صندوق الوارد (افتراضي 50، مرتّب `createdAt DESC`) |
  | `GET /api/player-notifications/unread-count` | موجود في العقد؛ **الويب لا يستدعيه** (يحسب unread محلياً) |
  | `PUT /api/player-notifications/:id/read` / `PUT .../read-all` | تعليم كمقروء |
  | `DELETE /api/player-notifications/:id` | موجود بالعقد؛ **لا UI له في الويب** — فرصة swipe-to-delete في Flutter |
- **Socket**: **لا شيء** — هذه الشريحة صفر Socket.IO. القنوات المكافئة: SW→page `PUSH_RECEIVED`، page→SW `SET_AUTH_TOKEN`، FCM `onMessage`. عقد حمولة الدفع (data-only، كل القيم strings): `{title, body, tag?, type, url?, imageUrl?, videoUrl?, richBody?, roomCode?, activityId?, sessionId?, inviterName?}`. قيم `type` المعروفة: `activity_started, room_invite, new_activity, booking_confirmed, game_ended, feedback_survey, order_status, new_order, custom, reminder, friend_booked, level_up, comeback`.
- **مكافئ Flutter**:
  - `firebase_core` + `firebase_messaging` يستبدلان lib/firebase.ts وكل آلة الـ SW. iOS يحصل على APNs عبر FCM → **يُحذف نهائياً**: فرع `WEBPUSH::`، مفاتيح VAPID، endpoint المفتاح، `pushsubscriptionchange`، مخزن auth في الـ SW، manifest.json، سكربت cache-nuke (استبدله بفحص min-version من الـ API + حوار تحديث إجباري أو حزمة `upgrader`)، حارس التركيب الثلاثي (أنشئ service/provider واحد)، heuristics «الاشتراك الحي أقوى من الإذن»، وworkaround `push_notifications_enabled`.
  - العرض: `flutter_local_notifications` لرسائل data-only — handler خلفي top-level بـ `@pragma('vm:entry-point')`؛ قناة Android واحدة `mafia_default` (importance high، vibration `[0,200,100,200]` لمطابقة الويب)؛ `BigPictureStyle` لـ `imageUrl` (تنزيل مسبق)؛ foreground presentation مطفأ في iOS (مطابقة سلوك الويب: foreground = تحديث الصندوق فقط).
  - التسجيل: `getToken()` + `onTokenRefresh.listen()` → نفس POST register-token. deviceId مستقر لكل تثبيت عبر `shared_preferences` (محاكاة `mafia_device_id`).
  - التوجيه العميق: انقل `resolveNotificationUrl` **مرة واحدة بنسخة الـ SW (وهي الأشمل)** إلى route mapper لـ go_router: `activity_started→Join(code)`، `room_invite→Join(code, invite, by)`، `new_activity→Games(activityId)`، `feedback_survey→Feedback(sessionId)`، `order_status→Order`، `booking_confirmed/game_ended→Home`، `custom/default→data.url أو Home`. عالج الحالات الثلاث: `getInitialMessage()` (cold start — يستبدل hack الـ `/__pending_nav` كلياً **مع الإبقاء على بوابة «انتظر تحميل auth اللاعب قبل التنقل»**)، `onMessageOpenedApp`، `onMessage`. روابط خارجية → `url_launcher` بـ `LaunchMode.externalApplication`.
  - **مخاطر**: (1) data-only على Android يُخنق تحت Doze/force-stop — سجّل الـ background handler بدقة وفكّر لاحقاً بإضافة `notification` block للتوكنات native (مع حذر dedup)؛ (2) iOS data-only يحتاج `content-available` في رؤوس APNs — تحقق من خدمة FCM في الـ backend؛ (3) صور الإشعارات على iOS تتطلب Notification Service Extension بـ Swift — **دعم `imageUrl` ليس مجانياً على iOS**؛ (4) قفل portrait → `SystemChrome.setPreferredOrientations`؛ (5) status bar → `SystemUiOverlayStyle` شفاف فوق `#050505`.

---

### 2. جرس الإشعارات وصندوق الوارد (`NotificationBell` في `/player/home`)

- **الوظيفة والرحلة**: زر جرس في هيدر الصفحة الرئيسية يفتح dropdown بآخر الإشعارات مع badge لغير المقروء؛ نقطة الدخول لتفعيل الإذن، وبوابة المودال الغني.
- **الحالات والشاشات الفرعية**:
  - **Badge**: دائرة `#ef4444` أعلى الزر (top -4 / right -4، minWidth 20، height 20، خط 11/700 أبيض)، سقف العدّ `"99+"`.
  - **بانر طلب الإذن** (`permissionState === 'prompt'`): قسم بخلفية `rgba(59,130,246,0.08)`؛ زر CTA بعرض كامل، gradient `linear-gradient(135deg,#3b82f6,#2563eb)`، نص «🔔 تفعيل الإشعارات على هاتفك» / أثناء التفعيل يخفت إلى `rgba(59,130,246,0.3)` + `cursor:wait` ونص «⏳ جاري التفعيل...»؛ caption «اضغط للحصول على إشعارات فورية».
  - **بانر تثبيت iOS** (`needsInstall`): خلفية `rgba(245,158,11,0.08)`؛ عنوان «📱 لتفعيل الإشعارات على iPhone» بـ `#f59e0b`؛ 3 خطوات عربية (زر المشاركة ⎙ → «إضافة إلى الشاشة الرئيسية» → افتح من الشاشة الرئيسية). **يُحذف كلياً في Flutter**.
  - **بانر الرفض** (`denied`): خلفية `rgba(239,68,68,0.08)`، نص «❌ تم رفض الإشعارات — يمكنك تفعيلها من إعدادات المتصفح» بـ `#ef4444` — في Flutter استبدله بزر `openAppSettings()` (حزمة `permission_handler`).
  - **الحالة الفارغة**: «لا توجد إشعارات» بوسط اللوحة، `rgba(255,255,255,0.3)`.
  - البانرات قابلة نظرياً للتراكم فوق القائمة.
- **الميزات والتفاعلات**:
  - الجرس يبدّل الفتح/الإغلاق؛ **mousedown خارجي** يغلق (document listener + ref containment).
  - نقر صف: تعليم كمقروء إن لم يكن → إن كان غنياً (`imageUrl`/`videoUrl`) يفتح مودال التفاصيل؛ وإلا تنقّل عبر نسخة محلية من `resolveNotificationUrl` (أضيق من نسخة الـ SW — بلا `room_invite`/`order_status`/`new_order`، والأنواع المجهولة = صف غير قابل للتنقل؛ **هذا تناقض وليس ميزة — اعتمد نسخة الـ SW في Flutter**). الروابط الخارجية `window.open(_blank, noopener,noreferrer)`.
  - «قراءة الكل ✓» بلون `#f59e0b` تظهر فقط عند unread>0.
  - القائمة تعرض أول 30 عنصراً (`slice(0,30)`) من حتى 50 يعيدها الـ backend.
  - تنسيق الوقت النسبي عربي حرفياً: `الآن` / `قبل N د` / `قبل N ساعة` / `قبل N يوم` — **انقل الدوال كما هي ولا تعتمد افتراضيات حزمة `timeago`** إلا إذا طابقت.
- **التصميم**: زر 42×42، `rgba(255,255,255,0.08)` + حد `rgba(255,255,255,0.12)`، radius 12، 🔔 بحجم 20. اللوحة: width 340، maxHeight 480، `rgba(17,17,17,0.98)`، radius 16، `backdropFilter: blur(20px)`، ظل `0 20px 40px rgba(0,0,0,0.5)`، مرساة يسار (RTL). أنيميشن framer-motion: `{opacity:0,y:-10,scale:0.95}→{1,0,1}` خلال 0.2s. الصفوف: غير المقروء بخلفية `rgba(245,158,11,0.05)` ونقطة عنبرية 8px؛ أيقونة نوع 32×32 بلون النوع على 12.5% opacity، أو thumbnail 44×44 مع overlay ▶️ للفيديو؛ chevron `◀`. خرائط النوع: أيقونات `new_activity 📅, game_ended 🎮, custom 📢, reminder ⏰, friend_booked 👥, level_up 🏆, booking_confirmed ✅, comeback 🔥, feedback_survey 📋, order_status 🍽️` (fallback 🔔)؛ ألوان `#f59e0b / #ef4444 / #8b5cf6 / #3b82f6 / #22c55e / #f59e0b / #22c55e / #ef4444 / #8b5cf6 / #10b981` (fallback `#666`).
- **API**: GET inbox (+polling 60s)، PUT read، PUT read-all. (unread يُحسب client-side).
- **Socket**: لا شيء — التحديث الحي عبر `PUSH_RECEIVED` postMessage و`onMessage` وpolling.
- **مكافئ Flutter**: `PopupMenuButton` غير كافٍ — إما overlay مخصص (`showMenu`/`flutter_portal`) أو **الأفضل للموبايل: ترقية الـ dropdown إلى شاشة إشعارات كاملة أو bottom sheet**. Badge عبر حزمة `badges` أو `Stack`. أنيميشن الدخول: `ScaleTransition+FadeTransition+SlideTransition` بـ 0.2s. الصور `CachedNetworkImage`. أضف ما لم يستغله الويب: `GET /unread-count` لشارة رخيصة، `DELETE /:id` مع `Dismissible` للحذف بالسحب، وrefetch عند العودة للمقدمة (`AppLifecycleListener`). `BackdropFilter` مكلف على Android الضعيف — استخدمه باعتدال أو استبدله بخلفية شبه معتمة.

---

### 3. مودال تفاصيل الإشعار الغني (يُفتح من صف يحمل `imageUrl`/`videoUrl`)

- **الوظيفة والرحلة**: عرض إشعار وسائطي (صورة/فيديو + نص غني + زر إجراء) بملء الشاشة.
- **الحالات والشاشات الفرعية**: overlay ثابت zIndex 200 بخلفية `rgba(0,0,0,0.82)` + `blur(6px)`؛ نقر الخلفية يغلق؛ حالتا الوسائط: فيديو (`<video controls playsInline>` بـ poster من `imageUrl`، maxHeight 50vh) أو صورة (`objectFit: contain`، maxHeight 55vh)؛ زر الإجراء يظهر فقط عند وجود `data.url`.
- **الميزات والتفاعلات**: هيدر = إيموجي النوع + العنوان + زر ✕ (#888)؛ الجسم يفضّل `data.richBody` على `body` مع `white-space: pre-wrap`؛ زر الإجراء: «🔗 فتح الرابط» للخارجي و«انتقال ◀» للداخلي — يغلق ثم يتنقل؛ footer = الوقت النسبي.
- **التصميم**: بطاقة `dir=rtl`، maxWidth 420، maxHeight 88vh قابل للتمرير، خلفية `#0f0f0f`، حد `rgba(255,255,255,0.12)`، radius 18، ظل `0 20px 60px rgba(0,0,0,0.6)`؛ دخول scale 0.92→1 + y 20→0؛ زر الإجراء gradient عنبري `linear-gradient(135deg,#f59e0b,#d97706)` بنص أسود عريض؛ نص الجسم `rgba(255,255,255,0.82)` 14px lineHeight 1.7.
- **API / Socket**: لا شيء مباشر (البيانات من سجل الإشعار المجلوب سلفاً).
- **مكافئ Flutter**: `showGeneralDialog` بخلفية fade + محتوى scale؛ فيديو عبر `video_player`+`chewie` (poster = imageUrl)؛ صورة `CachedNetworkImage`؛ `SelectableText` للنص الغني إن رغبت.

---

### 4. صفحة تشخيص الدفع (`/player/debug-push`)

- **الوظيفة والرحلة**: أداة تشغيلية مثبتة القيمة يستخدمها الفريق لتشخيص فشل الإشعارات على أجهزة حقيقية عبر 6 خطوات متسلسلة مع سجل قابل للنسخ.
- **الحالات والشاشات الفرعية**: حالة فارغة («اضغط الزر أعلاه لبدء التشخيص الشامل خطوة بخطوة» بـ `#555`)؛ حالة جارٍ (زر معطّل `#333` + «⏳ جاري...»)؛ كل خطوة فاشلة توقف التشغيل برسالة `🛑 توقف`؛ نجاح كامل → «🏁🏁🏁 التشخيص اكتمل بنجاح! 🏁🏁🏁»؛ أخطاء غير متوقعة تُسجّل name/message/stack مع 💥.
- **الميزات والتفاعلات**: الخطوات: ① بيئة (UA، كشف iOS/standalone، فحص HTTPS مع تحذير صاخب)؛ ② وجود Notification API + الإذن الحالي + `requestPermission()`؛ ③ سرد تسجيلات SW ثم تسجيل `/sw.js` وانتظار `ready`؛ ④ جلب مفتاح VAPID (يسجل أول 40 حرفاً + الطول)؛ ⑤ unsubscribe قديم + `pushManager.subscribe()` مع تصنيف أخطاء مفصّل بالعربية (NotAllowedError بثلاثة أسباب محتملة، InvalidStateError بنصيحة reload)؛ ⑥ POST التوكن بـ Bearer من `mafia_player_auth` (يتابع بلا auth لاختبار الوصول) ويسجل HTTP status + JSON كاملاً. زر «📋 نسخ» عبر `navigator.clipboard` مع fallback بـ `execCommand` ثم `alert('✅ تم نسخ التشخيص!')`؛ auto-scroll ناعم لآخر سطر بعد 50ms.
- **التصميم**: **الصفحة الوحيدة LTR** — خلفية `#0a0a0a`، نص `#eee`، monospace 12px؛ عنوان «🔧 Push Notifications Debugger v2» بـ `#f59e0b`؛ زر التشغيل gradient عنبري `#f59e0b→#d97706`؛ زر النسخ `#3b82f6`؛ كونسول `#111` radius 10 maxHeight 75vh؛ تلوين الأسطر حسب المحتوى: ❌/🚨→`#ef4444`، ✅→`#22c55e`، ⚠️→`#f59e0b`، `═══`→`#60a5fa` عريض، افتراضي `#aaa`؛ طوابع `[HH:MM:SS]`؛ `word-break: break-all`.
- **API**: نفس endpoints الدفع (vapid-public-key + register-token).
- **Socket**: لا شيء.
- **مكافئ Flutter**: أعد بناءها كشاشة تشخيص مخفية native: حالة الإذن (`getNotificationSettings`)، قيمة FCM token، deviceId، آخر استجابة تسجيل، نسخ عبر `Clipboard.setData`. **احتفظ بها LTR monospace** للسجلات. تختفي خطوات SW/VAPID/subscribe تلقائياً.

---

### 5. نظام الصوت — `soundManager.ts` ومعمارية Leader-Source/Follower-Relay (مكوّن نظامي)

- **الوظيفة والرحلة**: وحدة مركزية تشغّل أصوات أحداث اللعبة بطريقتين: ملفات مرفوعة من الأدمن (`GET /api/sounds/active-map` → خريطة مفاتيح→URLs → preload كـ `HTMLAudioElement`) مع **fallback توليفي (Web Audio synth) مبرمج لكل مفتاح**. المعمارية: **جهاز الليدر هو مصدر الصوت الحصري** — يشغّل محلياً ويعكس كل نداء عبر `leader:sound-play` → whitelist في الـ backend → `display:sound-play` → شاشة العرض تعيد التنفيذ. شاشة العرض تعطّل تشغيلها المحلي (`setLocalPlayback(false)`) فتصير النداءات القديمة المبعثرة فيها no-ops. (تنبيه: تعليق الهيدر في الملف يصف الاتجاه القديم المعكوس — **الصحيح leader→display**.)
- **ماذا يخص تطبيق اللاعب تحديداً**: هاتف اللاعب **لا يستخدم soundManager إطلاقاً**. سطح اللاعب = (أ) أنماط اهتزاز `navigator.vibrate`، و(ب) نغمة إجرائية واحدة من 3 نغمات صاعدة عندما يحين دوره بالكلام. كامل الـ soundManager يُنقل فقط إذا غطّى تطبيق Flutter أدوار الليدر/الشاشة أيضاً.
- **الحالات والشاشات الفرعية**:
  - **Audio unlock (حالة خفية)**: قبل أول إيماءة، مخرَج الـ synth صامت (AudioContext suspended)؛ مستمع أول `pointerdown`/`keydown` (ليدر) أو `click`/`touchstart` (شاشة) ينادي `primeAudio()` ثم يزيل نفسه. لا overlay مرئي. **تختفي في Flutter** (لا autoplay policy).
  - **لا حالات خطأ ظاهرة**: كل فشل صوتي يُبتلع بصمت؛ فشل `loadSoundMap` = تحذير console فقط و`isLoaded=true` (لا retry → synth طوال الجلسة).
- **الميزات والتفاعلات** — الـ API العام كاملاً:
  - `setSoundMirror(cb)`: تسجيل باث المرآة (الليدر فقط)؛ كل نداء عام يبث `{fn, args}` مرة واحدة قبل التنفيذ المحلي (الدوال الداخلية `_impl` تتنادى بينها → بث واحد بالضبط، لا حلقات).
  - `setLocalPlayback(enabled)`: بوابة كل الدوال العامة؛ الشاشة false عند mount وtrue عند unmount؛ `applyRemoteSound` يتجاوزها.
  - `playLocalSound(key)`: بلا مرآة وبلا بوابة — مخصص لتنبيه `leader_gallery_alert` السرّي (anti-cheat: لا يصل للشاشة أبداً؛ حجمه 0.5).
  - `primeAudio()` / `loadSoundMap()` (idempotent) / `reloadSoundMap()` (عند `admin:sounds-updated`).
  - `playGameSound(key)`: one-shot؛ الحجم من `VOLUME_BY_KEY[key] ?? 0.7` (`timer_tick`/`timer_heartbeat_fast`/`timer_buzzer`/`vote_cast` = 1.0؛ `timer_heartbeat_slow`/`vote_shift`/`voting_complete` = 0.9؛ `leader_gallery_alert` = 0.5)؛ ملف مخصص → `cloneNode(true)` للسماح بالتداخل مع تتبع في `oneShotAudios` Set؛ وإلا synth.
  - `playAmbientSound(key)`: loop بحجم 0.3، يوقف السابق أولاً؛ **بلا synth fallback** — بدون ملف مخصص = صمت (يسجل `ambientKey` فقط).
  - `stopAmbientSound()` / `stopOneShotSounds()` (يقتل أغنية الفوز محلياً وعلى الشاشة عبر المرآة).
  - `duckAmbient()` 0.08 / `unduckAmbient()` 0.3؛ `playEventSound(key, durationMs=3000)` = duck→play→unduck بعد المهلة.
  - `playEliminationSound(role|null)`: null→`elimination_citizen`؛ وإلا مفتاح مخصص `elimination_<role.toLowerCase()>` عبر `playEventSound(…,5000)`؛ fallback فريقي: أدوار المافيا `[GODFATHER, SILENCER, CHAMELEON, WITCH, OLDER_BROTHER, MAFIA_REGULAR]` → `elimination_mafia` وإلا `elimination_citizen`.
  - `playNightStepAmbient(stepType)`: خريطة GODFATHER/CHAMELEON/MAFIA_REGULAR/KILL→`ambient_night_kill`؛ SILENCER/SILENCE→`ambient_night_silence`؛ SHERIFF/INVESTIGATE→`ambient_night_investigate`؛ DOCTOR/NURSE/PROTECT→`ambient_night_protect`؛ SNIPER/SNIPE→`ambient_night_snipe`؛ ASSASSIN→`ambient_night_assassin` — يعمل فقط بملف مخصص وإلا يبقي `ambient_night`.
  - `playDrumroll()` (synth: 20 نبضة triangle متسارعة) / `playImpactBoom()` (sine 80→30Hz، 0.4s) عند غياب ملفات `drumroll`/`impact_boom`.
  - `applyRemoteSound({fn,args})`: مستقبل الشاشة؛ dispatch على whitelist من **11 دالة** (`playGameSound, playAmbientSound, stopAmbientSound, stopOneShotSounds, duckAmbient, unduckAmbient, playEventSound, playEliminationSound, playNightStepAmbient, playDrumroll, playImpactBoom`) إلى `_impl` مباشرة.
  - **معمارية AudioContext**: سياق واحد مشترك lazily + resume عند كل استدعاء (إنشاء سياق لكل صوت يبقى suspended على الموبايل ويستنفد الحد)؛ **hack كتم iOS**: عنصر `<audio>` صامت ملفوق runtime (WAV 0.5s 8kHz 8-bit مبني بايتاً بايتاً في Blob، loop) يرقّي الجلسة لـ«media playback» فيصير Web Audio مسموعاً رغم مفتاح الصمت؛ + مستمع `visibilitychange` يعيد التشغيل عند العودة للمقدمة.
  - **خرائط التشغيل عند الليدر** (كلها mirrored، ومحروسة بـ `leaderSoundOnRef`): ambient حسب الطور `AMBIENT_BY_PHASE` = LOBBY→`ambient_lobby`، NIGHT→`ambient_night`، DAY_DISCUSSION→`ambient_day`، DAY_VOTING→`ambient_voting`، DAY_JUSTIFICATION→`ambient_justification`، DAY_ELIMINATION→`ambient_elimination`، MORNING_RECAP→`ambient_morning`؛ stings عند `game:phase-changed`: NIGHT→`phase_night_start`، DAY_DISCUSSION→`phase_day_start`، DAY_VOTING→`phase_voting_start`، DAY_ELIMINATION→`phase_elimination`، وLOBBY→`stopOneShotSounds()`؛ مؤقّتا النقاش/التبرير (interval 100ms): آخر 10 ثوانٍ `timer_tick` كل ثانية + `timer_buzzer` عند الصفر؛ مؤقّت اللعبة (1s): ≤10s→`timer_heartbeat_fast` كل ثانية، وإلا كل 5s→`timer_heartbeat_slow`، انتهاء→`timer_buzzer`؛ `day:vote-update`: نفس العدد الكلي→`vote_shift` وإلا `vote_cast`؛ `day:elimination-revealed`→`playEliminationSound(role)`؛ `game:over`: winner يحوي JESTER→`win_jester` / ASSASSIN→`win_assassin` / MAFIA→`win_mafia` / وإلا `win_citizen`؛ `game:restarted`→`stopOneShotSounds()`؛ `display:morning-event` بخريطة `MORNING_SOUND_BY_TYPE`: ASSASSINATION→`morning_assassination_success`، ASSASSINATION_BLOCKED→`morning_protection_success`، SILENCED→`morning_silenced`، SNIPE_MAFIA/`SNIPE_CITIZEN`→`morning_snipe_*`، ABILITY_DISABLED→`morning_ability_disabled`، ASSASSIN_KILL→`morning_assassin_kill`، POLICEWOMAN_EXECUTION→`morning_policewoman`؛ `day:show-silenced`→`day_show_silenced`؛ `leader:mafia-gallery-alert`→`playLocalSound('leader_gallery_alert')` (غير mirrored — سرية).
  - **استثناء DisplayDayView**: 5 دوال raw-AudioContext على مستوى الوحدة تتجاوز بوابة الـ follower وتصدح على جهاز الشاشة مباشرة: drumroll محلي (12 نبضة triangle) وimpact boom محلي ضمن تسلسل RevealCeremony/BombCeremony (وجه مقلوب → +2000ms drumroll+قلب → +3200ms `playEliminationSound` (no-op محلياً؛ الليدر يعكس نسخته) → +4200ms impact boom + تعتيم؛ BombCeremony: انفجار بصري 3s **بلا صوت** ثم إيقاع 4s لكل بطاقة)؛ `playRevealMafia`/`playRevealCitizen` **dead code**.
  - **NightAnimCinematic** (على الشاشة فقط ⇒ كلها no-ops حالياً): مفاتيح `night_assassination, night_investigation, night_protection, night_snipe(+600ms), night_silence, night_assassin, night_witch` وستّات الصباح — **regression حي: أصوات night_* وcard_flip_* ميتة فعلياً** (الشاشة gated والليدر لا يستمع لـ `night:animation`) — قرار porting: إحياؤها على الليدر أو إسقاطها.
- **التصميم — عناصر UI الصوتية**:
  - **زر كتم الليدر (FAB)**: ثابت `bottom-4 left-4`، `z-[60]`، 44×44 دائري، backdrop-blur + shadow-lg. ON: `bg-[#0f2a1a]/80` + حد `emerald-600/40` + نص `emerald-300` + 🔊؛ OFF: `bg-[#2a0f0f]/80` + حد `red-700/40` + نص `red-300` + 🔇؛ tooltips «كتم أصوات الليدر»/«تشغيل أصوات الليدر»؛ الإطفاء ينادي `stopOneShotSounds()` ويحفظ في `localStorage['leader-sound-on']` ('1'/'0').
  - **CircularTimer** (على شاشة العرض؛ ليس على هاتف اللاعب): حلقة SVG 200px، stroke 8، rounded caps، دوران -90°؛ عتبات لونية: >60% أخضر `#2E5C31` (توهج `rgba(46,92,49,0.3)`)، ≤60% ذهبي `#C5A059`، ≤30% أحمر `#8A0303` (توهج 0.5)؛ توهج 20px عادي / 40px عند ≤10s؛ الرقم font-mono font-black بحجم 0.35×size، أبيض→ذهبي (≤10s)→أحمر + `animate-pulse` (≤5s)؛ لافتة "SEC" رمادية `#808080`؛ اهتزاز الويدجت كله (jitter 0.3s لانهائي) عند ≤5s؛ pop للرقم (scale 1.3→1) كل ثانية؛ يشغّل `timer_heartbeat_fast` كل ثانية ≤5s و`timer_heartbeat_slow` بالثواني الزوجية ≤10s.
- **سطح اللاعب — الاهتزازات والنغمة (انقلها حرفياً)**:
  | الحدث | النمط |
  |---|---|
  | تغيير رقم المقعد (`player:seat-changed` + polling) | `[200,100,200]` |
  | عقوبة عليّ / على غيري (`game:penalty-recorded`) | `[300,100,300,100,500]` / `[100,100]` |
  | طرد بالعقوبات (`player:penalty-ejected`) | `[500,200,500,200,500]` |
  | استلام الدور (`player:role-assigned` + fallback) | `[100,50,200,50,300]` |
  | بدء لعبة (`game:started`) | `200` |
  | نافذة قرار العمدة (`day:mayor-window`, forMayor) | `[120,80,120,80,240]` |
  | بدء التصويت (`day:voting-started`) | `[100,200]` |
  | نجاح تصويتي (كلا واجهتي التصويت) | `100` |
  | إقصائي (`day:elimination-revealed` يتضمنني) | `[200,100,200]` |
  | **دوري بالكلام** (`day:discussion-updated`→currentSpeakerId=أنا) | `[200,100,200,100,300]` + نغمة 3 sine صاعدة 660/880/1100Hz (gain 0.3، إغلاق ctx بعد 1s) |
- **API**: `GET /api/sounds/active-map` (بدون auth) → `{success:true, map:{eventKey: "/uploads/sounds/<file>"}}` (خريطة فارغة عند غياب DB وما زالت success)؛ الملفات عبر static `/uploads`. (سياق أدمن — شريحة أخرى: GET `/api/sounds`، POST `/upload` multipart حتى 50MB بأنواع mp3/wav/ogg/webm/mp4/m4a، PUT `/:id`، PUT `/:id/toggle`، DELETE `/:id` — وكلها تبث `admin:sounds-updated` عالمياً.)
- **Socket**:
  - emit: `leader:sound-play {roomId, fn, args}` (الـ backend يتجاهل roomId في الحمولة ويعتمد `socket.data.roomId`؛ يقبل فقط `socket.data.role==='leader'`؛ whitelist 11 دالة؛ args معقّمة إلى null|string|number بحد 3؛ التسليم فقط لسوكيتات `role==='display'` في الغرفة عبر fetchSockets — **لا يوجد display room**).
  - on: `display:sound-play {fn,args}`→`applyRemoteSound`؛ `admin:sounds-updated`→`reloadSoundMap()`؛ `leader:mafia-gallery-alert`؛ + كل مستمعات الأحداث المحفّزة للصوت المذكورة أعلاه بحقولها (`game:phase-changed {phase}`, `day:vote-update {totalVotesCast}`, `day:elimination-revealed {revealedRoles, eliminated[]}`, `game:over {winner}`, `game:restarted`, `display:morning-event {type}`, `day:show-silenced`, `night:step-info {stepType}`, `day:justification-started`/`day:elimination-pending`/`day:tie`).
- **كتالوج المفاتيح الكامل (58 مفتاحاً بـ 12 مجموعة — هذا هو العقد مع لوحة الأدمن)**: `ambient_lobby`؛ `ambient_day, ambient_voting, ambient_justification`؛ `ambient_night, ambient_night_kill, ambient_night_silence, ambient_night_investigate, ambient_night_protect, ambient_night_snipe, ambient_night_assassin`؛ `night_assassination, night_investigation, night_protection, night_snipe, night_silence, night_assassin`؛ `ambient_morning, morning_assassination_success, morning_protection_success, morning_snipe_mafia, morning_snipe_citizen, morning_silenced, morning_assassin_kill, morning_policewoman, morning_ability_disabled`؛ `elimination_godfather, elimination_silencer, elimination_chameleon, elimination_mafia, elimination_sheriff, elimination_doctor, elimination_sniper, elimination_policewoman, elimination_nurse, elimination_citizen, elimination_assassin, elimination_jester`؛ `card_flip_godfather, card_flip_sheriff, card_flip_mafia, card_flip_citizen`؛ `win_mafia, win_citizen, win_jester, win_assassin`؛ `timer_heartbeat_slow, timer_heartbeat_fast, timer_tick, timer_buzzer`؛ `vote_cast, vote_shift`؛ `phase_day_start, phase_night_start, phase_voting_start, phase_elimination`؛ `bomb_explosion (dead — لا call site), day_tie, day_show_silenced, voting_complete`؛ `leader_gallery_alert`. + مفاتيح خارج الكتالوج مستعملة بالكود: `drumroll`, `impact_boom`, `night_witch`, `elimination_witch`/`elimination_older_brother`/`elimination_mafia_regular` (ضمنية عبر lowercase) ومفاتيح الأدوار الديناميكية.
- **وصفات الـ synth (المواصفة الحرفية لإعادة توليدها كأصول مسبقة التصيير في Flutter)**: `night_assassination`/`morning_assassination_success`: sawtooth 800→50Hz خلال 0.3s، gain 0.4→0.01؛ `night_protection`/`morning_protection_success`: triangle 1200→400Hz، 0.6s؛ `night_snipe`/`morning_snipe_*`: square 2000→100Hz في 0.15s gain 0.5 (طلقة)؛ `night_investigation`: sine 60Hz drone 0.8s؛ `night_silence`/`morning_silenced`: sine 200→50Hz؛ `card_flip_godfather`: sawtooth 120→60Hz 0.8s؛ `card_flip_sheriff`: أربيجيو triangle 523/659/784Hz؛ `card_flip_mafia`: square 200→80Hz؛ `card_flip_citizen`: sine 440→880Hz blip؛ `win_mafia`: 5 نوتات sawtooth داكنة 110/92/82/65/55Hz بذيول 2-3s؛ `win_citizen`: لحن sine ساطع [523,659,784,1047,784,1047,1319] + وتر 262/330/392Hz؛ `win_jester`: 7 نوتات triangle ملتوية (bend 1.5x→0.5x — ضحكة هستيرية) + ذيل 110Hz؛ `win_assassin`: 5 طعنات sawtooth [600..200] + ذيل 80Hz؛ `timer_heartbeat_slow`: نبضة مزدوجة sine 80Hz + طبقة نقرة triangle 700Hz (الـ 60Hz وحده غير مسموع على سماعات التابلت)؛ `timer_heartbeat_fast`: sine 90Hz + نقرة square 950Hz؛ `timer_tick`: نقرة بطبقتين square 1100Hz + sine 2200Hz؛ `timer_buzzer`: أزيز نشاز 1.1s square 180→110Hz + sawtooth 360→220Hz؛ `leader_gallery_alert`: 3 صفارات square صاعدة 880/1320/1760Hz؛ `vote_cast`: chirp sine 800→1200Hz؛ `vote_shift`: thud sine 150→40Hz gain 1.0؛ `bomb_explosion`: sawtooth 150→20Hz + square 80→30Hz؛ `night_assassin`: sawtooth 600→100Hz؛ `morning_assassin_kill`: sawtooth 900→60Hz؛ `morning_policewoman`: صافرة triangle 880/660/880Hz؛ `day_tie`: نغمتا triangle 440Hz؛ `day_show_silenced`: sine 300→100Hz؛ `voting_complete`: sine C5→E5. **صامتة عمداً (ملف مخصص فقط)**: `phase_*` كلها، كل `ambient_*`، كل `elimination_*`، `night_witch`، `morning_ability_disabled`.
- **مكافئ Flutter**:
  - `just_audio` (preload، حجم لكل مفتاح، تداخل one-shots عبر pool من AudioPlayers، loop للـ ambient بحجم 0.3 وduck إلى 0.08 يدوياً — الـ ducking داخلي وليس OS-level) + **`audio_session` حرج**: فئة `playback` تحل مشكلة مفتاح صمت iOS نهائياً — **لا تنقل hack الـ WAV الصامت إطلاقاً**. مع صوت remote-play (RealtimeKit): `playAndRecord` + `defaultToSpeaker` وduck للـ SFX تحت الصوت.
  - الـ synth: **الخيار الموصى به — تصيير الوصفات الثلاثين أعلاه مسبقاً إلى ملفات أصول مضمّنة** (حتمي ويقتل مشكلة الـ unlock)؛ البديل `flutter_soloud` أو raw PCM عبر StreamAudioSource.
  - نموذج المرآة: خدمة `SoundMirror` تبث `leader:sound-play` عبر `socket_io_client` والأتباع يطبّقون `display:sound-play` بنفس خريطة الـ 11 دالة؛ **حافظ على عقد الـ whitelist (11 اسماً، ≤3 args عددية/نصية)** وعلى `playLocalSound` غير الممرأة لسرية `leader_gallery_alert`.
  - اهتزازات اللاعب: `Vibration.vibrate(pattern: [...])` (Android يدعم الأنماط)؛ iOS بلا أنماط → ترجمة إلى سلاسل `HapticFeedback.heavyImpact` أو CoreHaptics؛ نغمة «دوري» تصبح أصل صوتي مضمّن + haptic.
  - لا حاجة لـ primeAudio/pendingAmbient — احذفها، لكن أبقِ resume-on-foreground عبر `AppLifecycleListener` (مرآة visibilitychange).
  - **قرارات porting واعية**: (1) الاتجاه الصحيح leader→display رغم التعليق القديم؛ (2) قرّر مصير stings الليل/card_flip الميتة؛ (3) drumroll/boom المحلية على الشاشة تتجاوز البوابة — خطر صوت مزدوج لو مرّرها الليدر لاحقاً؛ (4) لا تنقل `bomb_explosion`/`playRevealMafia`/`playRevealCitizen` (dead)؛ (5) لا ambient توليدي — ضمّن أصول ambient افتراضية أو اقبل الصمت؛ (6) الشاشة المنضمة منتصف الطور بلا ambient حتى تغيّر الطور — أضف حالة الـ ambient إلى sync snapshot؛ (7) أبقِ قيم VOLUME_BY_KEY وduck (0.3/0.08) كما هي — مضبوطة لقاعة فعلية؛ (8) `wakelock_plus` لأجهزة الليدر/الشاشة؛ (9) `admin:sounds-updated` يجب أن يبطل أي cache ملفات منزّلة (أسماء الملفات timestamped-unique تسهّل ذلك).

---

### 6. نظام التصميم/الثيم «Dark Noir V2.1» (tailwind.config.js + globals.css + swal.ts + constants.ts) — مكوّن نظامي

- **الوظيفة والرحلة**: اللغة البصرية العالمية لكل شاشة: أسود قاتم + أحمر دموي + ذهبي عتيق، RTL عربي كامل (لا وضع LTR إلا صفحة التشخيص)، ضجيج film-grain دائم، vignettes حسب السياق، حوارات SweetAlert2 داكنة موحّدة مع override لـ `window.alert`.

#### 6.1 جدول Design Tokens الكامل (جاهز لـ ThemeData)

**الألوان — الأساسية والسطوح:**

| Token | Hex | استعماله | ThemeData mapping |
|---|---|---|---|
| primary / Blood Red | `#8A0303` | أزرار، vignettes، selection، danger | `colorScheme.primary`, `colorScheme.error` |
| secondary / Vintage Gold | `#C5A059` | عناوين، تأكيد Swal، لهجات | `colorScheme.secondary` |
| dark-bg | `#050505` | خلفية التطبيق | `scaffoldBackgroundColor` |
| dark-surface | `#111111` | سطوح | `colorScheme.surface` |
| dark-card | `#1A1A1A` | بطاقات | `colorScheme.surfaceContainerHigh` |
| noir-card bg | `#0C0C0C` | بطاقات noir | `colorScheme.surfaceContainer` |
| noir border | `#2A2A2A` | حدود noir/ghost | `dividerColor` / `OutlineInputBorder` |
| success | `#2E5C31` | نجاح/مؤقّت أخضر | extension `success` |
| النص الافتراضي | `#808080` | body الرمادي المكتوم | `textTheme.bodyMedium.color` |
| النص المُبرز | `#FFFFFF` / `#E7E2D6` | عناوين / نص Swal الدافئ | `titleLarge` / dialog text |
| Swal bg | `#141210` | خلفية الحوارات | `dialogTheme.backgroundColor` |
| Swal cancel | `#2F2A24` | زر الإلغاء | dialog cancel button |
| danger confirm | `#B91C1C` | تأكيد خطر | dialog danger variant |
| btn-primary hover | `#A00303` | hover الأحمر | pressed/hover state |
| btn-secondary hover | `#D4B069` | hover الذهبي | pressed/hover state |
| danger-soft text | `#FF6B6B` | نص btn-danger-soft | extension |
| citizen text | `#E2E2E2` | text-gradient-citizen | extension |
| gate input bg | `#121212` | صناديق خطوات البوابات | extension |
| card-surface | تدرّج `#0E0E10 → #0A0A0B`، حد `#1A1A1A` | توكنات الغرفة الريموت | extension |

**السلالم (احملها كـ `ThemeExtension` مخصص — المكوّنات تشير لدرجات محددة):**

| السلّم | القيم المفتاحية |
|---|---|
| mafia (أحمر Tailwind 50–950) | 500 `#EF4444`، 600 `#DC2626`، 700 `#B91C1C`، 900 `#7F1D1D` (كامل `#FEF2F2→#450A0A`) |
| citizen (أزرق Tailwind 50–950) | 500 `#3B82F6` (كامل `#EFF6FF→#172554`) |
| dark (slate + مخصص) | 950 `#020617`، 900 `#0F172A`، 850 **`#162032`** (مخصص)، 800 `#1E293B`، 600 `#475569` |
| gold (أصفر Tailwind — **مختلف عن ذهب البراند!**) | 400 `#FACC15`، 500 `#EAB308`، 600 `#CA8A04` |
| amber (بوابات/إشعارات) | 500 `#F59E0B`، وgradients `#F59E0B→#D97706` و`from-amber-500 to-yellow-600` |
| ألوان أنواع الإشعارات | `#F59E0B / #EF4444 / #8B5CF6 / #3B82F6 / #22C55E / #10B981 / #666` |

⚠️ **ثلاثة «ذهبيات» متعايشة يجب تضمينها كلها**: براند `#C5A059`، وTailwind gold `#EAB308`، وamber `#F59E0B`.

**الخطوط:**

| الخط | الأوزان | الدور | Flutter |
|---|---|---|---|
| Tajawal | 300–900 | body العربي (الـ sans الفعلي — Inter مذكور ولا يُحمّل أبداً) | `textTheme` body |
| Amiri | 400/700 | serif الدرامي — كل العناوين/نصوص الأطوار (مطبق inline في عشرات الملفات) | `displayLarge..titleMedium` — **مركزياً وإلا ستطارد مئات الأنماط المتناثرة** |
| Cairo | 400/700/900 | قوالب بطاقات الأدوار | asset font |
| Noto Kufi Arabic / Reem Kufi | 400/700 | قوالب البطاقات | asset fonts |
| JetBrains Mono | 400/500/700 | sublabels لاتينية/IDs/مؤقّت | `fontFamily` مواضعي |
| Outfit | 300–900 | مستورد في globals.css (استعمال محدود) | اختياري |

**قاعدة عربية حرجة**: `letterSpacing` يكسر وصلات الحروف العربية — ممنوع على أي نص عربي؛ الـ tracking/uppercase فقط للنصوص اللاتينية (نمط `.btn-premium-latin`). كذلك الإيموجي **خالية من ZWJ عمداً** (🔮 لا 🧙‍♀️، 👮 لا 👮‍♀️) لتوافق الأجهزة القديمة.

**الزوايا (لغتان متعايشتان — أبقِ كلتيهما):**

| Radius | الاستعمال |
|---|---|
| `BorderRadius.zero` | **توقيع البراند**: noir-card، btn-primary/secondary/ghost/premium |
| 8 | thumbnails/chips الإشعارات |
| 10 | كونسول التشخيص |
| 12 (`rounded-xl`) | زر الجرس، card-surface، btn-danger-soft |
| 16 (`rounded-2xl`) | لوحة الإشعارات، حوارات Swal، صناديق خطوات البوابات |
| 18 | مودال الإشعار الغني |
| 24 (`rounded-3xl`) | بطاقات البوابات الكاملة |
| full | role-chips، FAB الكتم، badges |

**الظلال والتوهجات:**

| الظل | القيمة |
|---|---|
| noir-card | `0 15px 30px rgba(0,0,0,0.8)` |
| noir-card-hover | `0 20px 40px rgba(138,3,3,0.15)` + حد `#8A0303/40` + رفع -4px |
| btn-primary | `0 5px 15px rgba(138,3,3,0.3)` |
| لوحة الإشعارات | `0 20px 40px rgba(0,0,0,0.5)` |
| المودال الغني | `0 20px 60px rgba(0,0,0,0.6)` |
| glow (keyframe) | `0 0 5px rgba(239,68,68,0.5)` → `0 0 20px rgba(239,68,68,0.8), 0 0 40px rgba(239,68,68,0.3)` |
| توهج الرقم الذهبي | `textShadow: 0 0 20px rgba(197,160,89,0.4)` |
| توهج المؤقّت | 20px عادي / 40px عند ≤10s بألوان العتبة |

**هيكل ThemeData مقترح (خلاصة):**

```dart
ThemeData(
  brightness: Brightness.dark,
  scaffoldBackgroundColor: const Color(0xFF050505),
  colorScheme: const ColorScheme.dark(
    primary: Color(0xFF8A0303),
    secondary: Color(0xFFC5A059),
    surface: Color(0xFF111111),
    surfaceContainer: Color(0xFF0C0C0C),
    surfaceContainerHigh: Color(0xFF1A1A1A),
    error: Color(0xFF8A0303),
  ),
  dividerColor: const Color(0xFF2A2A2A),
  dialogTheme: const DialogTheme(backgroundColor: Color(0xFF141210)),
  textSelectionTheme: const TextSelectionThemeData(selectionColor: Color(0x808A0303)),
  // + ThemeExtension: سلالم mafia/citizen/dark(850=#162032)/gold/amber،
  //   success #2E5C31، نص افتراضي #808080، نص Swal #E7E2D6، cancel #2F2A24، danger #B91C1C
  // + TextTheme: Amiri للعناوين، Tajawal للجسم، JetBrainsMono للمونو — letterSpacing: 0 للعربية دائماً
)
```

#### 6.2 الحالات والشاشات الفرعية (طبقات الأجواء العالمية)
- **Noise overlay**: `body::after` ثابت z-9999 بـ SVG `feTurbulence fractalNoise baseFrequency=0.85` على opacity 0.04 — فوق كل شيء دائماً.
- **`.blood-vignette`**: 5 radial-gradients مكدّسة — توهج أحمر بالزوايا الأربع (`rgba(138,3,3,0.3/0.25/0.15/0.25)`) + تعتيم مركزي `→rgba(0,0,0,0.4)`؛ على landing/leader/display/PlayerFlow الحضوري.
- **`.spotlight-vignette`** (z-40): `transparent 25% → rgba(0,0,0,0.6) 70% → 0.85` مع دخول `vignetteIn 1s` — عند تسليط الضوء على متحدث.
- **`.revealed-vignette`** (z-40): `transparent 30% → rgba(138,3,3,0.3) 60% → 0.7` بـ 1.5s — عند كشف الهوية.
- **`.remote-vignette`**: توهج ذهبي علوي `rgba(197,160,89,0.05)` + أحمر سفلي `rgba(138,3,3,0.09)` — غرفة اللعب عن بعد.
- **`.display-bg`**: `#050505` + `radial-gradient(circle at 50% 0%, #111111 0%, #050505 70%)`.
- **`.glitch-text`**: اهتزاز ±2px (`glitchShake 0.3s infinite alternate`) + نسختا `::before` حمراء `#ff0000` و`::after` سماوية `#00ffff` بأشرطة `clip-path inset()` متحركة — لنص «المسكوت».
- Scrollbar مخصص 6px (track `#0F172A`، thumb `#475569`) — يهم فقط لو استهدفت Flutter desktop/web.

#### 6.3 الميزات والتفاعلات (أصناف المكوّنات والأنيميشن)
- **`.noir-card`**: bg `#0C0C0C`، حد 1px `#2A2A2A`، **زوايا حادة**، ظل ثقيل، + إطار داخلي مزدوج (`::before` بحد 1.5px dark-800 وهامش 4px — تأثير برواز الصورة). في Flutter: `Container` بـ `foregroundDecoration` للإطار الداخلي.
- **`.player-card`** بحالاتها: `.alive` (حد dark-600، hover حد ذهبي /60)، `.dead` (**opacity 30% + grayscale كامل** + not-allowed — في Flutter: `ColorFiltered` بمصفوفة saturation 0 + `Opacity`)، `.silenced` (حد dark-500 + bg `#111111`)، `.registered` (حد emerald-500/50 + bg emerald-900/20)، `.empty` (حد متقطع dark-600 — حزمة `dotted_border`).
- **`.role-chip`**: pill بتدرّج mafia-700→900 أو citizen-700→900.
- **الأزرار**: `.btn-primary` (أحمر، زوايا حادة، active scale 0.95)، `.btn-secondary` (ذهبي بنص dark-950)، `.btn-ghost`، `.btn-premium` (أسود بنص ذهبي + إطار أحمر يظهر عند hover + لمعة قطرية 700ms — في Flutter: `AnimatedContainer` + `ShaderMask` sweep)، `.btn-danger-soft` (radius 12، حد أحمر/50، نص `#FF6B6B`، bg أحمر/15). **لا تنقل `.deal-card` — dead code** (`glass-card` غير معرّف أصلاً).
- **أدوات نصية**: `.text-gradient-mafia/citizen/gold` — رغم الاسم هي ألوان مسطحة (`#8A0303`/`#E2E2E2`/`#C5A059`) مع `drop-shadow 0 2px 4px black`.
- **أنيميشن Tailwind السبعة** (→ تأثيرات `flutter_animate` قابلة لإعادة الاستخدام): `pulse-slow` (3s)؛ `glow` (ظل أحمر نابض 2s alternate)؛ `shake` (translate3d ±1/2/4px، 0.5s)؛ `blood-drip` (كشف من الأعلى عبر clip-path 1s — `ClipRect` متحرك)؛ `shield-block` (scale 0.5→1.2→1 مع ظهور 0.8s)؛ `fade-in-up` (y+20→0، 0.5s)؛ `count-up` (scale 1→1.3→1، 0.3s لعدّاد الأرقام). framer-motion في ~60 ملفاً → `flutter_animate`/implicit animations.
- **نظام SweetAlert2 (نظام الحوارات الوحيد)**: 4 دوال عامة يجب بناء مكافئ خدمة حوارات لها:
  1. `swalConfirm(text, opts)` → Promise<bool>: عنوان «تأكيد»، أيقونة warning، أزرار «نعم»/«إلغاء»، **reverseButtons (ترتيب RTL) + focusCancel (أمان افتراضي)**، خيار `danger` يحوّل التأكيد إلى `#B91C1C`؛ النص يُهرَّب و`\n`→`<br>`.
  2. `swalAlert(text, icon?)`: زر «حسناً» واحد + **استنتاج تلقائي للأيقونة من الكلمات العربية** (انقل الـ regex حرفياً): success عند `✅|تمّ|تم |تمت|بنجاح|نجح|أُرسل|أضيف|حُفظ`؛ error عند `❌|فشل|خطأ|تعذّر|غير صالح|مطلوب|لا يمكن`؛ warning عند `⚠️|تنبيه|تحذير`؛ وإلا info.
  3. `swalHtmlConfirm(title, html, opts)`: جسم HTML خام؛ وضع `infoOnly` بزر «إغلاق» وحيد.
  4. `swalToast(text, icon)`: toast بموضع top-end (= أعلى-يسار بصرياً في RTL)، 3000ms مع progress bar، بلا أزرار.
  - `installGlobalSwal()` يستبدل `window.alert` عالمياً (بحارس `window.__swalInstalled`) — **لا مكافئ في Flutter: يجب حصر كل مواقع نداء `alert()` في بقية الشرائح وتحويلها إلى خدمة الحوارات**.
- **آلات التمرير/اللمس** (تصبح غالباً غير ضرورية في Flutter): `overscroll-behavior-y: contain`؛ `body.modal-open` (position:fixed + touch-action:none)؛ `body.in-game` أثناء الجلسة؛ hook `useModalScrollLock` (حفظ scrollY، منع touchmove خارج المودال، منع pull-to-refresh عند الحواف، **swipe-to-close: سحب لأسفل >80px والمودال عند القمة**) → في Flutter: `DraggableScrollableSheet`/`showModalBottomSheet` مع محاكاة إحساس عتبة الـ 80px؛ pull-to-refresh مخصص (iOS standalone فقط، سبينر عنبري عند >60px، reload عند >80px، معطّل أثناء المودالات واللعب) → `RefreshIndicator` لكن **أعد النظر بالدلالة: إعادة جلب حالة لا إعادة تشغيل التطبيق**، وأبقِ تعطيله أثناء الجلسة النشطة.
- **نمط بوابات ملء الشاشة** (تثبيت/إذن/رفض/غير مدعوم): `z-[99999]`، بطاقة `bg-[#0C0C0C]/90` + backdrop-blur-xl + radius 24، حد/توهج ملوّن حسب الخطورة (amber/red/blue)، صفوف خطوات مرقّمة في `#121212/80` radius 16، CTA بتدرّج `from-amber-500 to-yellow-600` بنص أسود، دخول `fade-in-up`. (بوابة «غير مدعوم» لها كود تجاوز 4 أرقام **1998** يخزَّن في `localStorage.notifications_unsupported` — بوابات التثبيت تُحذف في Flutter لكن نمط الـ gate-modal يبقى مفيداً لبوابة تحديث إجباري.)

#### 6.4 المفردات البصرية المشتركة (`constants.ts` — انقلها كملف ثوابت واحد)
- `Role` enum (16): GODFATHER, SILENCER, CHAMELEON, WITCH, OLDER_BROTHER, MAFIA_REGULAR, SHERIFF, DOCTOR, SNIPER, POLICEWOMAN, NURSE, MAYOR, CITIZEN, YOUNGER_BROTHER, JESTER, ASSASSIN؛ مجموعات `MAFIA_ROLES` (الستة الأولى) و`NEUTRAL_ROLES` (JESTER, ASSASSIN) + helpers `isMafiaRole/isNeutralRole`.
- `ROLE_NAMES` العربية: شيخ المافيا، قص المافيا، حرباية المافيا، الساحرة، الأخ الأكبر، مافيا عادي، الشريف، الطبيب، القناص، الشرطية، الممرضة، العمدة، مواطن صالح، الأخ الأصغر، المهرج، السفّاح.
- `ROLE_ICONS`: 🔪 🤐 🦎 🔮 👥 🎭 🔍 💉 🎯 👮 🏥 🎩 👤 👥 🤡 🔪 (أحادية codepoint بلا ZWJ).
- `Phase` enum (10) + أسماؤها: اللوبي، توليد الأدوار، ربط الكروت، نقاش نهاري، التصويت، التبرير، كسر التعادل، الليل، ملخص الصباح، نهاية اللعبة.
- أنواع `MorningEvent` (9): ASSASSINATION, ASSASSINATION_BLOCKED, SNIPE_MAFIA, SNIPE_CITIZEN, SILENCED, SHERIFF_RESULT, ABILITY_DISABLED, TWIN_SUICIDE, TWIN_TRANSFORM.
- **قاعدة عرض اللاعب الموحدة**: `formatPlayer(physicalId, name)` → `"#5 - أحمد"` في كل مكان.

#### 6.5 API / Socket / التخزين
- **API**: لا شيء في هذه الشريحة — فقط rewrites في `next.config.js` (`/api/*`, `/socket.io/*`, `/uploads/*` → backend افتراضي `http://127.0.0.1:4000`). **تبعة Flutter**: لا يوجد proxy — إعداد base-URL مركزي، وكل مسارات `/uploads/...` النسبية القادمة في حمولات الـ API يجب حلّها مقابل مضيف الـ backend.
- **Socket**: لا شيء (socket.io-client 4.7.5 مملوك لشرائح أخرى).
- **التخزين**: `mafia_app_version` (cache-bust — يُستبدل بفحص min-version)، `notifications_unsupported` (كود التجاوز 1998)، `push_notifications_enabled`، `mafia_device_id`، `leader-sound-on`، `mafia_player_auth`؛ أعلام DOM `modal-open`/`in-game` تصبح حالة provider.

#### 6.6 مكافئ Flutter ومخاطر النقل (نظام التصميم)
- **Widgets/Packages**: `google_fonts` أو أصول خطوط محلية (ضمّنها محلياً لتكافؤ offline)؛ حوارات مخصصة عبر `showDialog` wrapper (أو `adaptive_dialog`) بنفس الألوان والأيقونات وregex الاستنتاج؛ toast عبر overlay مخصص top-start RTL بـ 3s + progress خطي؛ noise → `Stack` علوي بـ `IgnorePointer` + PNG ضجيج مبلّط على 4% (أو `CustomPainter`)؛ vignettes → `DecoratedBox` بنفس مكدّسات RadialGradient (رخيصة GPU)؛ glitch → `CustomPainter` بطبقتي نص ملونتين منزاحتين + أشرطة قص متحركة؛ dotLottie → حزمة `lottie` (ملفات `.lottie` الأربعة — fireworks, prize-podium, sound-off, winner — تحتاج `dotlottie_loader` أو تحويلاً إلى .json؛ تخص شريحة الشاشة).
- **RTL**: `MaterialApp(locale: Locale('ar'), supportedLocales: [Locale('ar')])` + Directionality.rtl؛ ترتيب أزرار الحوارات يطابق reverseButtons مع cancel كتركيز افتراضي.
- **مخاطر**: (1) الإيموجي تختلف بين المنصات — فكّر باستبدال أيقونات الأدوار بـ SVG/PNG مضمّنة لثبات البراند؛ (2) Amiri المطبق inline بشكل ad-hoc يجب مركزته في TextTheme؛ (3) قفل الزوم/viewport/manifest/SW كلها تسقط — بديل التحديث: فحص إصدار من الـ API + حوار إجباري؛ (4) **لا تنقل** التبعيات غير المستعملة (sonner, next-themes, clsx, date-fns, react-use-measure, sharp — صفر imports)؛ التبعيات الفعلية للمحاكاة: framer-motion→flutter_animate، lucide-react→أيقونات مكافئة، sweetalert2→خدمة الحوارات، socket.io-client→socket_io_client، firebase→firebase_messaging؛ (5) الثيم داكن فقط — **لا light theme موجود ولا مطلوب**؛ (6) لون التحديد → `TextSelectionThemeData(selectionColor: Color(0x808A0303))`.

---

# 8. عقود التكامل: REST API وSocket.IO والمصادقة

هذا القسم هو **المرجع التنفيذي** لطبقة التكامل في تطبيق Flutter: كل REST endpoint وكل حدث Socket.IO يستخدمه الـ player interface، مع تدفق المصادقة وإعادة الاتصال بالتفصيل وملاحظات الـ serialization الخاصة بـ Dart. أي شاشة في الخطة تُشير إلى هذا القسم كمصدر وحيد للعقود.

**قواعد عامة للعقد (تنطبق على كل ما يلي):**
- كل الـ routers مركّبة في `backend/src/index.ts` تحت المسارات: `/api/player-auth`، `/api/player-app`، `/api/player`، `/api/player-notifications`، `/api/player-feedback`، `/api/fnb`.
- ردود الخطأ دائماً JSON بحقل `error` نصّه **عربي** — لا تبنِ منطقاً على نص الرسالة أبداً؛ اعتمد على HTTP status + حقل `code` عند وجوده، واعرض `error` كما هو للمستخدم.
- ردود النجاح تحمل `success: true` (مع استثناءات قليلة مذكورة في الجداول مثل `POST /api/player/lookup` الذي يرجع `found`).
- كل نداءات الـ socket من العميل تستخدم **ack callback** — تعامل معها كـ request/response يرجع `{ success: boolean, error?, code? }`.

---

### 1) جداول REST Endpoints

#### 1.1 المصادقة — `/api/player-auth`

| # | Method & Path | Auth | Request Body | Response / أخطاء |
|---|---|---|---|---|
| 1 | `POST /api/player-auth/register` | بدون | `{ phone, password (≥4), name, gender?('MALE'\|'FEMALE' الافتراضي MALE), dob? }` | `{ success, token, welcomeBonus:200, player:{ id, playerId, phone, name, gender, dob, mustChangePassword:false } }` — أخطاء: 400 نقص بيانات/كلمة سر قصيرة، **409 الهاتف مسجَّل مسبقاً**، 503 قاعدة البيانات متوقفة |
| 2 | `POST /api/player-auth/login` | بدون — **rate-limit: ‏15 محاولة / 15 دقيقة** (keyPrefix ‏`player-login`) | `{ phone, password }` | `{ success, token, player:{ id, playerId, phone, name, gender, dob, avatarUrl, mustChangePassword } }` — 401 بيانات خاطئة أو حساب بلا كلمة سر |
| 3 | `GET /api/player-auth/me` | Bearer player JWT | — | `{ success, player:{ id, playerId, phone, name, gender, dob, avatarUrl, email, totalMatches, totalWins, totalSurvived, mustChangePassword }, staffInfo:{ staffId, username, role, displayName, permissions[] }\|null, staffToken:string\|null (staff JWT يُصدر تلقائياً إذا كان للحساب linkedStaffId), activeGame:{ roomId, roomCode, gameName, physicalId, role (null حتى rolesConfirmed), isAlive, phase }\|null, frozenGames:[بنفس الشكل] }` — `activeGame` يُفحص حيّاً من Redis |
| 4 | `POST /api/player-auth/change-password` | Bearer player JWT | `{ oldPassword? (غير مطلوب عندما mustChangePassword=true), newPassword (≥4) }` | `{ success, token (توكن **جديد** — استبدل المخزّن فوراً), message }` — 401 كلمة السر القديمة خاطئة |
| 5 | `POST /api/player-auth/migrate-welcome-bonus` | staff admin فقط | — | migration إداري لمرة واحدة — **خارج نطاق Flutter** |

#### 1.2 تطبيق اللاعب — `/api/player-app` (المسارات الثابتة مسجّلة قبل `/:id`)

| # | Method & Path | Auth | Request | Response / أخطاء |
|---|---|---|---|---|
| 1 | `GET /leaderboard` | بدون | — | `{ success, leaderboard:[{ id, name, avatarUrl, level, xp, rankTier, rankRR, totalMatches, totalWins }] }` — أعلى 50، ترتيب: tier ‏(GODFATHER > UNDERBOSS > CAPO > SOLDIER > الباقي) ثم rankRR ثم level |
| 2 | `GET /search?q=` | player JWT | `q` بطول ≥2 | `{ success, results:[{ id, name, avatarUrl }] }` حد أقصى 20 — بحث ilike جزئي على الاسم **والهاتف** معاً؛ يستثني صاحب النداء؛ **الهاتف لا يُرجَع أبداً في النتائج** |
| 3 | `POST /book` | player JWT + ‏`requireNoPendingFeedback` | `{ activityId, offerId? }` | ‏201 `{ success, booking }` (count=1، حجز ذاتي فقط؛ isPaid/isFree تلقائي للحسابات المجانية؛ ينشئ/يؤكد reservation تلقائياً؛ يطلق FCM) — 409 محجوز مسبقاً؛ 404 النشاط غير موجود؛ ‏403 `{ error, code:'PENDING_SURVEYS', pendingCount, redirect:'/player/feedback' }` |
| 4 | `GET /activities/upcoming?playerId=` | بدون (‏playerId فقط لإظهار أنشطة الـ test accounts) | — | `{ success, activities:[{ id, name, date, description, basePrice, status('planned'\|'active'), locationId, maxCapacity, difficulty, enabledOfferIds, locationName, locationMapUrl, locationOffers (مصفّاة على المفعّل فقط), isTestLocation, bookedCount, maxPlayers }] }` |
| 5 | `GET /activities/:actId/following-bookers?playerId=` | player JWT | كلا الـ id مطلوبان | `{ success, count, bookers:[{ id, name, avatarUrl, level, isFollowing }] }` — المتابَعون أولاً في الترتيب |
| 6 | `GET /my-active-rooms` | player JWT | — | `{ success, rooms:[{ activityId, activityName, activityDate, rooms:[{ sessionId, sessionCode, sessionName, maxPlayers }] }] }` — فقط أنشطة حجزها اللاعب ولها session نشطة في الـ DB |
| 7 | `GET /:id/co-players` | player JWT | — | `{ success, coPlayers:[{ id, name, avatarUrl, level, rankTier, matchCount, isFollowing }] }` مرتّبة بـ matchCount تنازلياً |
| 8 | `POST /:id/follow/:targetId` | player JWT (**هوية المتابِع من التوكن؛ `:id` مُهمَل**) | — | `{ success, message }` — 403 إذا لم يلعبا مباراة معاً قط؛ idempotent (رسالة «متابع مسبقاً») |
| 9 | `DELETE /:id/follow/:targetId` | player JWT (‏`:id` مُهمَل) | — | `{ success, message }` |
| 10 | `GET /:id/following` | player JWT | — | `{ success, following:[{ id, name, avatarUrl, level, rankTier, rankRR, totalMatches, totalWins }] }` |
| 11 | `GET /:id/following-feed` | player JWT | — | `{ success, feed:[{ playerId, playerName, role, survived, xpEarned, rrChange, matchWinner, matchDate, playerInfo:{ id, name, avatarUrl, level, rankTier }\|null }] }` — آخر 20 مباراة للمتابَعين |
| 12 | `GET /:id/bookings` | player JWT | — | `{ success, bookings:[{ bookingId, activityId, isPaid, isFree, createdAt, activityName, activityDate, activityStatus }] }` |
| 13 | `GET /:id/matches` | player JWT | — | `{ success, matches:[{ matchId, gameName, matchDate, matchWinner, durationSeconds, totalRounds, playerCount, role, survivedToEnd, eliminatedDuring, eliminatedAtRound, roundsSurvived, dealInitiated, dealSuccess, abilityUsed, abilityCorrect, xpEarned, rrChange, penaltyCount, penaltyRRDeduction, bombRRChange, rewardBreakdown, breakdown (تفصيل XP/RR جاهز للعرض مبني في السيرفر) }] }` |

#### 1.3 اللاعب (النواة) — `/api/player`

| # | Method & Path | Auth | Request | Response |
|---|---|---|---|---|
| 1 | `GET /all` | staff (admin/accountant) | — | لوحة إدارة — **يُتجاهل في Flutter** |
| 2 | `POST /:id/reset-password` | staff adminOnly | — | إعادة تعيين إلى `'1234'` + ‏mustChangePassword=true — إداري |
| 3 | `POST /:id/toggle-test` / `/:id/toggle-free` / `/:id/toggle-host-remote` | staff adminOnly | — | `{ success, isTestAccount/isFreeAccount/canHostRemote }` — إداري |
| 4 | `DELETE /:id` | staff adminOnly | — | حذف نهائي — إداري |
| 5 | `POST /lookup` | **بدون** | `{ phone }` | `{ found:bool, player:{ id, displayName, phone, gender, dateOfBirth, playerId }\|null, dbError? }` — يرجع إلى legacy ‏session_players ويهاجر تلقائياً |
| 6 | `POST /register` | **بدون** | `{ phone, displayName, dateOfBirth?, gender? }` | `{ success, player:{ id, playerId, displayName, phone } }` (find-or-create) |
| 7 | `GET /:id/profile` | **بدون** | — | `{ success, ...profile (كائن اللاعب + الإحصاءات من getPlayerProfile), activeGame:{ roomId, roomCode, gameName, physicalId, role, isAlive, phase }\|null }` (يتخطى الألعاب المجمّدة) |
| 8 | `PUT /:id/profile` | `staffOrSelf('id')` — staff JWT **أو** player JWT لصاحب الحساب | أي من `{ name, email (يقبل null), gender('MALE'\|'FEMALE'), phone, genderConstraint('NONE'\|'FORBID_SAME'\|'FORBID_OPPOSITE') }` | `{ success, player }` — يزامن الاسم حيّاً داخل غرف Redis النشطة |
| 9 | `POST /:id/avatar` | `staffOrSelf('id')` | `{ image: 'data:image/(jpeg\|jpg\|png\|webp\|gif);base64,...' }` بعد فك الترميز ≤5 MB | `{ success, avatarUrl:'/uploads/avatars/{id}.{ext}?v={ts}' }` — السيرفر يكتب أيضاً thumb ‏webp بعرض 192px في `/uploads/avatars/thumbs/{id}.webp` |

#### 1.4 الإشعارات — `/api/player-notifications` (كلها تتطلب player JWT)

| # | Method & Path | Request | Response |
|---|---|---|---|
| 1 | `POST /register-token` | `{ token (FCM), deviceInfo?, deviceId? }` | `{ success:true }` |
| 2 | `GET /?limit=` (افتراضي 50) | — | `{ success, notifications:[صفوف DB: id, playerId, title, body, type, data, isRead, createdAt…] }` |
| 3 | `GET /unread-count` | — | `{ success, count }` |
| 4 | `PUT /:id/read` | — | `{ success:true }` |
| 5 | `PUT /read-all` | — | `{ success:true }` |
| 6 | `DELETE /:id` | — | `{ success:true }` |

#### 1.5 الاستبيانات — `/api/player-feedback` (كلها تتطلب player JWT)

| # | Method & Path | Request | Response |
|---|---|---|---|
| 1 | `GET /pending` | — | `{ success, count, pending:[واصفات sessions] }` |
| 2 | `GET /:sessionId` | — | `{ success, questions: FEEDBACK_QUESTIONS, alreadyDone:bool, context:{ sessionId, sessionName, sessionCode, activityName, locationName, playedAt } }` — 403 إذا لا يوجد استبيان مستحق |
| 3 | `POST /:sessionId` | `{ answers: { [كل FEEDBACK_KEY]: int 1..5 }, notes? }` — **كل مفتاح إلزامي** | `{ success:true }` — 400 عند مفتاح ناقص/قيمة غير صالحة |

#### 1.6 endpoints أخرى يستدعيها الـ player frontend

| # | Method & Path | Auth | Request | Response |
|---|---|---|---|---|
| 1 | `GET /api/fnb/context` | player JWT | — | `{ success, context:{ activityId, activityName, activityDate, locationId, locationName, bookingId, sessionId, physicalId, source:'live'\|'booking' }\|null, reason? }` |
| 2 | `GET /api/fnb/menu?activityId=` | player JWT | — | `{ success, items:[{ id, category, name, description, price, imageUrl }] }` — 404 إذا الـ menu ordering معطّل |
| 3 | `POST /api/fnb/orders` | player JWT | `{ items:[{ menuItemId, quantity 1..20 }] (≤30 سطراً), note? (≤300 حرف) }` — **الأسعار server-side فقط، لا تُرسل من العميل أبداً** | `{ success, order }` — 403 لا يوجد context / يلزم حجز؛ 429 أكثر من 10 طلبات مفتوحة لكل نشاط؛ 400 أصناف غير متاحة |
| 4 | `GET /api/fnb/my-orders?activityId=` | player JWT | — | `{ success, orders:[{ id, status('new'/'preparing'/…/'cancelled'), total, note, createdAt, items:[{ name, unitPrice, quantity }] }] }` |
| 5 | `POST /api/fnb/orders/:id/cancel` | player JWT | — | `{ success }` — مسموح فقط والحالة `'new'` وإلا 400 |
| 6 | `GET /api/push/vapid-public-key` | بدون | — | `{ publicKey }` — خاص بـ Web Push؛ **Flutter يستخدم FCM عبر 1.4-#1 بدلاً منه** |
| 7 | `GET /api/progression-settings/public` | بدون | — | إعدادات progression العامة (تُستخدم في شاشة الرانك لتفصيل XP/RR) |
| 8 | `GET /api/seasons/public/active`، `/api/seasons/public/list`، `/api/seasons/public/online-list`، `/api/seasons/public/:id/leaderboard` | بدون | — | بيانات المواسم + leaderboard لكل موسم (شاشة الرانك) |
| 9 | `GET /api/health` | بدون | — | `{ status:'ok', platform, timestamp }` — مفيد لفحص الاتصال في Flutter |

---

### 2) أحداث Socket.IO — من العميل إلى السيرفر (client → server)

**مبدأ عام:** هوية اللعب داخل الغرفة تأتي من `socket.data` ‏(`role`، `roomId`، `physicalId`، `authPlayer`) والتي تُضبط فقط عبر join/rejoin — **أي اتصال جديد يجب أن يعيد join/rejoin قبل أي emit خاص باللعب وإلا فشلت الحُرّاس (guards)**. بعض الـ handlers تفحص `typeof callback === 'function'` — أرسل ack callback دائماً.

#### 2.1 اللوبي ودورة حياة الغرفة (lobby.socket.ts)

| Event | Payload | Ack / السلوك |
|---|---|---|
| `room:find-by-code` | `{ roomCode }` | `{ success, roomId, roomCode, gameName, playerCount, maxPlayers, requireTicket }` |
| `room:list-active` | `{}` | `{ success, rooms:[{ roomId, roomCode, gameName, playerCount, maxPlayers }] }` |
| `room:auto-join` | `{ roomId, name, phone?, playerId?, gender?, dob?, ticketNumber?, forceJoin?, preferredSeat? }` | لاعب جديد: `{ success, assignedSeat, gameName, constraintViolation }` + بث `room:player-joined` للغرفة. لاعب عائد أثناء اللعبة / مقعد محجوز: `{ success, assignedSeat, …, restoredSeat:true, isRemote? }`. حالات الفشل: `{ success:false, requiresConfirmation:true, error }` (موجود في غرفة حية أخرى → أعد الإرسال بـ `forceJoin:true` بعد dialog تأكيد)؛ `{ code:'PENDING_SURVEYS', pendingCount, redirect }`؛ `{ code:'HOST_CANNOT_PLAY' }`؛ `{ code:'REMOTE_SUB_REQUIRED' }`؛ أخطاء التذاكر ومنها `{ priceMismatch:true, ticketPrice, expectedPrice, selectedOfferName }`. عند النجاح يضبط `socket.data` ‏(role/roomId/physicalId) وينضم لغرفة الـ socket |
| `room:rejoin-player` | `{ roomId, physicalId, phone? }` — **الهاتف يتغلب على physicalId** (حماية من renumber المقاعد) | `{ success, player:{ physicalId, name, role (null حتى يُسمح بالكشف), isAlive, gender, playerId, penalties }, mafiaTeam:[{ physicalId, name, role, avatarUrl }], sibling, assassinContracts, phase, gameName, roomCode, votingState (candidates/totalVotesCast/playerVotes/hiddenPlayers/playersInfo)\|null, maxPenalties, mafiaChatEnabled }` — يفكّ التجميد / يحرّر الـ seat-hold |
| `room:get-my-role` | `{ roomId, physicalId }` | `{ role, confirmed, mafiaTeam?, sibling? }` — polling fallback بعد ربط الأدوار |
| `room:get-my-state` | `{ roomId, playerId?, phone? }` — **إعادة المزامنة القانونية، الويب يستطلعها كل 3 ثوانٍ من PlayerFlow** | snapshot كامل: `{ success, player{physicalId,name,role?,isAlive,gender,playerId,penalties}, phase, isRemote, allowPlayerInvites, rolesConfirmed, votingState\|null, maxPenalties, mafiaChatEnabled, justificationData\|null, withdrawalState\|null, discussionState\|null (يشمل الـ deals), nightState:{ nightStep, autoNightStepRole, autoNightPerformerId (مقنَّع إلى null لغير المنفّذ في الغرف الـ remote), config:{autoNightTime}, playerSubmitted }\|null, pendingResolution\|null, assassinContracts\|null, sibling, winner\|null, rosterInfo:[{physicalId,name,avatarUrl,isAlive,gender,rankTier}], allPlayers (في GAME_OVER فقط، مع الأدوار), playersInfo (الأحياء: id+name), round }` |
| `room:player-exit` | `{ roomId, phone?, playerId? }` | `{ success }` — في LOBBY: يُحجز المقعد 10 دقائق (بعدها تحرير/تجميد تلقائي)؛ أثناء اللعبة: تجميد اللاعب (الدور محفوظ) |
| `room:freeze-player` | `{ roomId, phone?, playerId? }` | `{ success }` — مسموح فقط للمُقصى (‏`isAlive=false`)؛ يُستخدم للتنقل بين الغرف |
| `player:mafia-gallery-open` | `{ roomId? }` — fire-and-forget **بدون ack** | نبضة anti-cheat → تنبيه للـ leader فقط؛ throttle ‏5 ثوانٍ؛ يتطلب socket role ‏'player' |

#### 2.2 استضافة اللعب عن بُعد (شاشة `/player/host` — تتطلب `playerToken` مع علم `canHostRemote`)

| Event | Payload | Ack |
|---|---|---|
| `room:create-remote` | `{ gameName?, maxPlayers?, maxJustifications?, maxPenalties?, penaltyScope?, displayPin?, autoNightTime? (5–60 ثانية), gameTimerMinutes? (0=معطّل), bombEnabled?, mafiaChatEnabled?, allowPlayerInvites? }` | `{ success, roomId, roomCode, displayPin, gameName, sessionId?, maxPlayers, isRemote:true }` — يمنح هذا الـ socket دور leader مقيَّد (‏`isPlayerHost`) |
| `room:rejoin-host` | `{ roomId }` | `{ success }` — يعيد منح host/leader بعد reconnect (يُتحقق ضد `config.hostPlayerId`) |
| `room:my-hosted-room` | `{}` | `{ success, roomId, roomCode }` أو `{ success:false }` — استرجاع مستقل عن الجهاز |
| `room:invite-player` | `{ roomId, inviteePlayerId }` | `{ success }` — المُرسِل من التوكن؛ المضيف دائماً، والعضو الجالس فقط إذا `allowPlayerInvites`؛ rate: ≤10/دقيقة + 1/دقيقة لكل مدعو؛ push بنوع `room_invite` و‏url ‏`/player/join?code={roomCode}&invite=1&by=…` |
| `room:release-held-seat` | `{ roomId, physicalId }` | leader/host فقط؛ `{ success }` |
| أحداث الـ leader التي يقودها المضيف من تطبيق اللاعب (كلها خلف بوابة leader/isPlayerHost) | `day:tie-action`، `day:execute-elimination`، `game:confirm-end`، `night:start`، `night:auto-advance-step`، `night:auto-approve-step`، `leader:approve-confrontation`، `voice:get-token` وغيرها | يجب تضمينها في شاشة الاستضافة بتطبيق Flutter |

#### 2.3 اللعب (game/day/night/confrontation/mafia-chat/voice)

| Event | Payload | Ack / القواعد |
|---|---|---|
| `game:get-state` | `{ roomId }` | `{ success, state }` — الأدوار مُصفَّرة و`nightActions` محذوفة لغير الـ leader |
| `player:cast-vote` | `{ roomId, physicalId, candidateIndex, autoVote? }` | `{ success }` — يجب أن يكون مقعدك (‏`physicalId === socket.data.physicalId`)، الطور DAY_VOTING، حي، ليس نفسك (إلا مع autoVote)؛ تغيير التصويت مدعوم؛ يطلق بثّي `day:vote-update` / `day:voting-complete`. **صوت العمدة يُحسب ×2** |
| `player:withdraw-vote` | `{ physicalId }` — الـ roomId من socket.data | `{ success, count, needed }` — في DAY_JUSTIFICATION فقط، يجب أن يكون صوّت للمتهم، مرة واحدة |
| `day:mayor-decision` | `{ roomId, decision:'PASS'\|'REVOTE'\|'REVOTE_TOP2'(اسم بديل)\|'POSTPONE' }` | `{ success, passed?/decision, result? }` — مسموح للـ leader أو لمقعد العمدة نفسه أثناء فتح نافذة العمدة |
| `player:night-action` | `{ roomId, actionType:'KILL'\|'INVESTIGATE'\|'PROTECT'\|'SNIPE'\|'SILENCE'\|'DECOY', targetPhysicalId:number\|null (null=تخطٍّ) }` | `{ success }` — role ‏'player'، طور NIGHT، ‏nightMode ‏'auto'، حي، مرة لكل step؛ **هدف المنفّذ الحقيقي وحده يُسجَّل (الباقون decoys)**؛ الشريف يستقبل `night:sheriff-result` فوراً على socket‑ـه |
| `nurse:activation-response` | `{ roomId, activate:boolean }` | `{ success }` — ردّ على `nurse:activation-request`؛ ثم يبدأ الـ auto-flow الليلي |
| `player:request-confrontation` | `{ roomId, targetPhysicalId }` | `{ success }` أو أكواد خطأ: `remote_only`، `discussion_only`، `confrontation_in_progress`، `max_reached` (3 لكل جولة)، `player_not_found`، `must_be_alive`، `self` |
| `player:respond-confrontation` | `{ roomId, accept:boolean }` | `{ success }` — الهدف المعلّق فقط |
| `mafia:chat-send` | `{ roomId, text ≤300 }` | `{ success:true }` أو **‏`{ success:false }` صامت بلا سبب** (anti-probing). throttle ‏700 ms. الشروط: مافيا حي، rolesConfirmed، ‏`mafiaChatEnabled`، والطور ليس LOBBY/ROLE_GENERATION/GAME_OVER |
| `mafia:chat-history` | `{ roomId }` | `{ success, messages:[{ physicalId, name, text, at }] }` — نفس بوابة الرفض الصامت؛ آخر 200 رسالة |
| `voice:get-token` | `{ roomId }` | `{ success, authToken, meetingId, participantId ('p{physicalId}' أو 'host'), preset }` — الغرف الـ remote فقط (Cloudflare RealtimeKit)؛ الـ preset يقرره السيرفر حسب isHost/isAlive |

#### 2.4 أحداث خارج نطاق تطبيق اللاعب (لا تُنفَّذ)

أحداث الـ leader/display/venue محمية بـ `socket.data.role==='leader'` (من staff token موثَّق) أو display PIN، وتُتجاهل في Flutter إلا ما يمر عبر مسار `isPlayerHost` أعلاه: `room:create`، `room:verify-display-pin`، `room:kick-player`، `room:renumber-players`، `room:move-seat`، `room:override-player`، `room:force-add-player`، `room:update-*`، `room:resync-template`، `leader:tools-ping`، `leader:sound-play`، `leader:record-penalty`، `setup:*`، `day:start-voting`، `day:voting-timeout`، `day:create-deal/remove-deal`، `day:cast-vote` (توكيل leader)، `day:un-narrow`، `day:resolve`، `day:*timer*`، `day:next/prev-speaker`، `admin:*`، `night:*` (بقيادة leader)، `policewoman:*`، `game:transition-phase`، `game:set-*`، `game:restart`، `room:close/delete-room/reset-to-lobby/close-event`، `display:*`، `room:lucky-draw:*`، `leader:mafia-chat-history/-toggle`، `venue:join`.

---

### 3) أحداث Socket.IO — من السيرفر إلى العميل (server → client)

يجب أن يسجّل تطبيق Flutter listeners لكل ما يلي (المصفوفة الكاملة التي يستقبلها تطبيق اللاعب):

| Event | Payload | ملاحظات |
|---|---|---|
| `game:state-sync` | كائن حالة اللعبة الكامل | يُبثّ عند كل تعديل تقريباً. **الغرف الـ remote: مُعقَّم للاعبين** — أدوار الأحياء `role: null` (أدوار الموتى تبقى)، `nightActions`/`autoNightChoices` محذوفة، `mayorState` فقط بعد الكشف |
| `game:phase-changed` | `{ phase, state?, teamCounts? }` | حقل state معقَّم بنفس الطريقة |
| `game:started` | شبه فارغ `{}` | اللعبة بدأت بعد اكتمال الـ binding |
| `game:over` | `{ winner, ... }` | نهاية اللعبة |
| `game:restarted` | state | الـ leader أعاد اللعبة |
| `game:closed` / `game:room-deleted` / `event:closed` / `game:kicked` | `{ reason?/message? }` | التطبيق يغادر ويصفّر حالة الغرفة محلياً |
| `game:player-disconnected` | `{ physicalId, isLeader }` | |
| `game:penalty-recorded` | `{ physicalId, penalties, maxPenalties, message, isKicked }` | |
| `player:kicked-self` | `{ reason? }` | يُرسل إلى socket اللاعب المطرود |
| `player:penalty-ejected` | `{ reason, penalties, maxPenalties }` | |
| `player:seat-changed` | `{ oldPhysicalId, newPhysicalId }` | renumber/move — **يجب تحديث المقعد المخزّن محلياً** |
| `room:player-joined` | `{ physicalId, name, totalPlayers, maxPlayers, gender, avatarUrl }` | تحديثات roster اللوبي |
| `room:config-updated` | config جزئي مثل `{ mafiaChatEnabled }`، `{ maxPlayers }`، إعدادات العقوبات/القنبلة | |
| `player:role-assigned` | `{ physicalId, role, mafiaTeam?:[{physicalId,name,role,avatarUrl}], sibling? }` | كشف الدور؛ يُعاد إرساله عند تحوّل التوأم (twin transform) |
| `mafia:team-updated` | `{ mafiaTeam:[...] }` | تحديث خفيف للفريق (مثال: توأم انضم للمافيا) |
| `assassin:contracts-update` | `{ contracts, currentIndex, completedCount, totalRequired }` | للقاتل المأجور فقط |
| `day:voting-started` | `{ candidates, hiddenPlayers, teamCounts, playersInfo:[{physicalId,name,avatarUrl}], playerVotes, durationSeconds\|null, mayorRevote?, mayorPhysicalId? }` | |
| `day:vote-update` | `{ candidates, totalVotesCast, tieBreakerLevel, playerVotes, leaderProxyVotes }` | العدّ الحي |
| `day:voting-complete` | `{ candidates, totalVotesCast }` | |
| `day:justification-started` | `{ accused, ... }` | |
| `day:justification-timer-started/-stopped` | معلومات المؤقّت | |
| `day:discussion-updated` | حالة النقاش (ترتيب المتحدثين، الـ deals) | |
| `day:show-silenced` | معلومات اللاعب المُسكَت | |
| `day:tie` | `{ tiedCandidates }` | |
| `day:withdrawal-period` | `{ needed, total, accusedIds? }` | |
| `day:withdrawal-update` | `{ count, needed, total, withdrawn }` | |
| `day:withdrawal-result` | `{ revote:boolean }` | |
| `day:elimination-pending` | `{ eliminated, revealedRoles, winResult, type, pendingBomb?, neutralWin?, mayorPostponed? }` | |
| `day:elimination-revealed` | payload الكشف | |
| `day:mayor-window` | `{ winner, top2, topVotes, mayorPhysicalId, voteWeight, timeoutSeconds:30, forMayor:true }` | **انتقائي**: leader/display + ‏socket العمدة فقط |
| `day:mayor-window-closed` | `{}` | |
| `day:mayor-revealed` | payload الكشف + `savedPhysicalId` | |
| `day:deal-created` / `day:deal-removed` | معلومات الصفقة | |
| `night:action-required` | `{ actionType, availableTargets:[{physicalId,name,avatarUrl}], timeoutSeconds, canSkip, stepRole, isDecoy }` | **لكل socket على حدة، لكل لاعب حي في كل step ليلي auto؛ غير المنفّذين يصلهم `isDecoy:true` مع قائمة أهداف زائفة (كل الأحياء)** |
| `night:sheriff-result` | `{ result:'MAFIA'\|'CITIZEN', targetPhysicalId, targetName }` | socket الشريف فقط (الحرباء تُقرأ CITIZEN) |
| `nurse:activation-request` | `{ message }` | socket الممرضة فقط عند موت الدكتور |
| `night:step-info` / `night:queue-step` / `night:queue-complete` | metadata للخطوة | غالباً للـ display؛ ‏PlayerPhaseView يستمع لـ `night:step-info` |
| `night:morning-recap` | recap يتضمن مصفوفة `players` | **الغرف الـ remote: أدوار الأحياء مُصفَّرة، و`assassinState:null` للاعبين** |
| `display:morning-event` | `{ type (مثل 'TWIN_TRANSFORM'), targetPhysicalId, targetName, extra }` | اللاعبون يستخدمونه لبانرات الصباح |
| `night:auto-started` | `{ totalAlive }` | |
| `game:timer-adjusted` | معلومات المؤقّت | |
| `mafia:chat-message` | `{ physicalId, name, text, at }` | **بث انتقائي**: sockets المافيا الأحياء + الـ leader فقط — لا يُبث للغرفة أبداً |
| `confrontation:pending` | `{ status:'PENDING_TARGET'\|'PENDING_LEADER', requesterId, requesterName?, targetId, targetName? }` | |
| `confrontation:started` | `{ requesterId, targetId, durationSeconds:30, startedAt }` | |
| `confrontation:ended` | `{ reason:'target_declined'\|'leader_rejected'\|'time_up' }` | |

**أحداث leader-only** (لا تصل sockets اللاعبين في الغرف الـ remote، عبر `emitLeaderOnly` — لكن **اللاعب المضيف يستقبلها عند الاستضافة** ويجب أن تعالجها شاشة `/player/host`): ‏`night:auto-step-ready`، `night:auto-step-approval`، `night:auto-step-started`، `night:auto-progress`، `leader:mafia-gallery-alert`، `leader:pinned-seat-conflict`، `policewoman:choice-available`. أحداث display-only تُتجاهل: `display:sound-play`، `display:night-started`، `display:replay-*`، `display:lucky-draw*`.

---

### 4) المصادقة والـ Handshake وإعادة الاتصال (بالتفصيل)

#### 4.1 الـ Player JWT

- موقَّع HS256 بسر مشتق: `env.JWT_SECRET + '_PLAYER'` (مختلف عن سر الـ staff). الـ payload بالضبط `{ playerId:number, phone:string, name:string }` + ‏iat/exp. الصلاحية `'30d'` (ثابت `PLAYER_TOKEN_EXPIRY` في `schemas/player.schema.ts`).
- REST: header ‏`Authorization: Bearer <token>`؛ عند الغياب/البطلان: 401 مع `{ error }`.
- الحسابات المهاجَرة: كلمة السر الافتراضية `'1234'` مع `mustChangePassword:true` → يجب إجبار شاشة change-password (بدون oldPassword في هذه الحالة) و**استبدال التوكن المخزّن بالتوكن الجديد من الرد**.
- التخزين في Flutter: `flutter_secure_storage` بمفتاح مكافئ لـ `mafia_player_token`.

#### 4.2 الـ Socket.IO Handshake (`io.use` في `backend/src/index.ts:88`)

- الاتصال **لا يُرفض أبداً** — الـ middleware يلصق الهوية فقط من `socket.handshake.auth`:
  - `auth.token` (أو `auth.leaderToken`): ‏staff JWT (بسر `JWT_SECRET`)؛ أدوار admin/manager/leader ⇒ ‏`socket.data.authStaff` + ‏`socket.data.role='leader'`؛ ‏`location_owner` ⇒ ‏`authVenue`. (يهمّنا فقط لحسابات اللاعبين المربوطة بـ staff عبر `staffToken` من `/me`).
  - `auth.playerToken`: ‏player JWT ⇒ ‏`socket.data.authPlayer = { playerId, phone, name }`.
- إعدادات عميل الويب الواجب استنساخها (من `frontend/src/lib/socket.ts`): `transports:['polling','websocket']`، ‏`reconnection:true`، ‏`reconnectionAttempts:Infinity`، ‏`reconnectionDelay:1000`، ‏`reconnectionDelayMax:5000`، ‏`timeout:20000`، والـ `auth` **دالّة تُقرأ من جديد عند كل (إعادة) اتصال** — لذا تحديث التوكن لا يحتاج socket جديداً؛ وبعد login يستدعي الويب `reconnectSocketAuth()` (disconnect + connect) لتطبيق التوكن. إعدادات السيرفر: `pingInterval:10000`، ‏`pingTimeout:15000`. نفس origin الـ REST (في الإنتاج نفس الدومين عبر rewrites؛ المسار الافتراضي `/socket.io`).
- **ربط الغرفة/المقعد ليس في الـ handshake**: بعد الاتصال يجب emit ‏`room:auto-join` (أول انضمام) أو `room:rejoin-player` (مقعد معروف) — هذا ما يضبط `socket.data.role='player'` و`roomId` و`physicalId` التي تقرأها كل حُرّاس اللعب.
- `authPlayer` (من playerToken) **إلزامي** لـ: بوابة الانضمام للغرف الـ remote، ‏`room:create-remote` (+ علم DB ‏`can_host_remote`)، ‏`room:rejoin-host`، ‏`room:my-hosted-room`، ‏`room:invite-player`. الانضمام المحلي في المكان (venue) يعمل **بدون أي توكن** (الهوية بالاسم/الهاتف/playerId في الـ payload).
- الأحداث المحمية للـ staff تفحص `socket.data.authStaff`؛ مسار المضيف-اللاعب يحصل بدلاً منها على `socket.data.isPlayerHost=true` محصوراً بغرفته.

#### 4.3 تدفق تسجيل الدخول الكامل (يُنفَّذ حرفياً في Flutter)

1. `POST /api/player-auth/login` → خزّن `token` في secure storage.
2. أعد اتصال الـ socket بحيث يحمل `playerToken` (المكافئ لـ `reconnectSocketAuth()`: ‏disconnect ثم connect بعد تحديث الـ auth).
3. `GET /api/player-auth/me` → يعطي `activeGame`/`frozenGames` للاستئناف التلقائي (auto-resume) + ‏`staffToken` الاختياري للحسابات المربوطة بـ staff.
4. إذا `mustChangePassword=true`: أجبِر شاشة تغيير كلمة السر (بدون oldPassword) واستبدل التوكن من الرد.
5. سجّل توكن FCM: ‏`POST /api/player-notifications/register-token`.

#### 4.4 بروتوكول إعادة الاتصال (حرِج — ينفَّذ كما هو)

- `socket.data` ذاكرة سيرفر فقط وتضيع مع كل انقطاع. **عند كل حدث `connect`**: أعد emit ‏`room:rejoin-player { roomId, physicalId, phone }` (أو `room:rejoin-host { roomId }` عند الاستضافة)، ثم استدعِ `room:get-my-state` لمزامنة كاملة.
- ‏PlayerFlow في الويب **يستطلع `room:get-my-state` كل 3 ثوانٍ** وعند visibility-change كمصدر حقيقة (حماية من الأحداث الفائتة) — **يجب استنساخ هذا في Flutter** (Timer دوري + ‏`AppLifecycleState.resumed` عبر `WidgetsBindingObserver`): عدة حالات UI (التصويت، الـ justification، خطوة الليل بما فيها المتبقي من `autoNightStepDeadline`، ‏pendingResolution) لا يمكن إعادة بنائها بموثوقية إلا منه.
- مفاتيح الهوية الثلاثة ولا يجوز خلطها: `playerId` (الحساب) مقابل `physicalId` (المقعد — قد يتغير بالـ renumber؛ استمع لـ `player:seat-changed`) مقابل `phone`. تطبيع الهاتف في السيرفر: يحذف `+962/00962/962` ويفرض `0` بادئة — أرسل الأرقام كما سُجّلت (صيغة الأردن `07…`). ‏`room:rejoin-player` يحلّ بالهاتف أولاً.
- سرية الأدوار: لا تثق بأي cache محلي؛ في الغرف الـ remote كل payload للّاعبين تُصفَّر فيه أدوار الأحياء server-side. دورك أنت يصل فقط عبر: `player:role-assigned`، ‏`room:get-my-role`، ‏`room:rejoin-player`، ‏`room:get-my-state`. في الليل تستقبل `night:action-required` حتى عندما لا يكون دورك (‏`isDecoy:true`) — **يجب عرض الـ picker الزائف وإرسال `player:night-action` وهمي، وإلا رآك الـ leader متأخراً/مفقوداً**.
- الخروج مقابل التجميد: EXIT في اللوبي يحجز المقعد 10 دقائق (الرجوع يستعيده)؛ الخروج أثناء اللعبة يجمّد (الدور محفوظ). التنقل بين الغرف وأنت مُقصى يتطلب `room:freeze-player` أولاً. الطرد يصل كـ `player:kicked-self` / ‏`game:kicked` / ‏`event:closed` — صفّر حالة الغرفة المحلية عند أي منها.
- الصوت (الغرف الـ remote): ‏`voice:get-token` يرجع توكن مشارك من Cloudflare RealtimeKit؛ الـ preset يقرره السيرفر حسب الحياة/الاستضافة — **اطلب توكناً جديداً بعد الموت/تغيّر الطور** كما يفعل الويب.

#### 4.5 حدود المعدل (rate limits) الواجب احترامها client-side

| العملية | الحد |
|---|---|
| login | 15 محاولة / 15 دقيقة |
| mafia chat | ‏700 ms بين الرسائل |
| الدعوات | 10/دقيقة إجمالاً + 1/دقيقة لكل مدعو |
| نبضة gallery-open | كل 5 ثوانٍ |
| F&B | ≤10 طلبات مفتوحة/نشاط، الكمية ≤20، ≤30 سطراً بالطلب |

#### 4.6 بوابات الانضمام (ترتيب الفحص — استنسخ الـ UX)

1. استبيانات معلّقة تمنع الحجز والانضمام: 403 / ‏`code:'PENDING_SURVEYS'` مع `redirect` → وجّه لشاشة feedback.
2. الأنشطة بتذاكر تتطلب `ticketNumber` في `room:auto-join` — احتمال payload ‏`priceMismatch` مع تفاصيل السعر.
3. الوجود في غرفة حية أخرى يرجع `requiresConfirmation` → ‏dialog تأكيد → إعادة الإرسال بـ `forceJoin:true`.
4. أكواد إضافية: `HOST_CANNOT_PLAY`، ‏`REMOTE_SUB_REQUIRED`.

#### 4.7 الإشعارات (Push)

- سجّل توكن FCM بعد login عبر `POST /api/player-notifications/register-token` (مع `deviceId`/`deviceInfo` للتمييز بين الأجهزة). لا تستخدم مسار VAPID/Web Push إطلاقاً في Flutter.
- ‏`data.url` في الإشعار يعمل deep-link: أمثلة `/player/join?code=XXXX`، ‏`/player/feedback`، ‏`/player/home` — يجب بناء جدول تحويل من هذه المسارات إلى routes التطبيق (go_router).
- الأنواع المرصودة: `booking_confirmed`، ‏`activity_started`، ‏`room_invite`، ‏`new_booking`.

---

### 5) ملاحظات Serialization لـ Dart

هذه النقاط هي أكثر ما سيكسر الـ parsing في Dart إذا أُغفلت — يجب فرضها في كل الـ models:

1. **الأرقام العشرية من الـ DB تصل كنصوص (strings)**: ‏`basePrice`، ‏`price`، ‏`total`، ‏`paidAmount`… لا تكتب `double` مباشرة في `fromJson`؛ استخدم converter موحّداً مثل `double.parse(v as String)` أو `num.tryParse(v.toString())` (مع `freezed` + ‏`json_serializable`: ‏`@JsonKey(fromJson: parseDecimalString)` أو `JsonConverter` مخصص يقبل String وnum معاً).
2. **التواريخ ISO strings** في REST (‏`DateTime.parse`)، بينما **طوابع الـ socket أرقام epoch-ms**: ‏`at`، ‏`startedAt`، ‏`heldUntil` → ‏`DateTime.fromMillisecondsSinceEpoch(v as int)`. لا تخلط المحوّلين.
3. **`playerVotes` كائن (map) مفاتيحه physicalId كنص**: في Dart هو `Map<String, dynamic>` — حوّل المفتاح بـ `int.parse(key)` عند البناء إلى `Map<int, …>`.
4. **أعمدة JSON تصل مفكوكة مسبقاً** (ليست نصوص JSON): ‏`offers`، ‏`rewardBreakdown`، ‏`permissions` — عامِلها كـ `Map`/`List` مباشرة، لا `jsonDecode` ثانٍ.
5. **`avatarUrl` نسبي** (`/uploads/avatars/{id}.{ext}?v={ts}`) — أضف API base URL قبله في widget موحّد؛ الصور المصغّرة في `/uploads/avatars/thumbs/{playerId}.webp` بعرض 192px (استخدمها في القوائم مع `cached_network_image`، مع الانتباه إلى أن `?v=ts` يكسر الكاش عمداً عند تغيير الصورة).
6. **نصوص `error` عربية دائماً** — اعرضها كما هي، لكن قرارات المنطق من HTTP status و`code` فقط.
7. **حقول nullable كثيرة ذات معنى**: ‏`role: null` = «لم يُكشف بعد» وليس «لا دور»؛ `votingState/nightState/justificationData/withdrawalState/discussionState/pendingResolution: null` = «الطور غير نشط». اجعل كل هذه `T?` في الـ models وابنِ الـ UI على غيابها.
8. **payloads متغيرة الشكل في نفس الحدث** (خاصة ack ‏`room:auto-join` بحالات فشله المتعددة): عرّف union/sealed class (‏`freezed` unions) بدل model واحد صارم، وافحص وجود `code`/`requiresConfirmation`/`priceMismatch` قبل الـ parsing الكامل.

---

### 6) مكافئ Flutter لطبقة التكامل + مخاطر النقل

**Packages المقترحة:**
- `socket_io_client` (متوافق Socket.IO v4) — مع تفعيل `setTransports(['polling','websocket'])` ومطابقة كل معاملات إعادة الاتصال في 4.2. الـ ack عبر `emitWithAck(event, data, ack: (resp) {...})`.
- `dio` + ‏interceptor يضيف `Authorization: Bearer` ويعالج 401 (تسجيل خروج) و403 مع `code:'PENDING_SURVEYS'` (توجيه لشاشة feedback) مركزياً.
- `flutter_secure_storage` للتوكن؛ `firebase_messaging` + ‏`flutter_local_notifications` للـ push والـ deep-links؛ `freezed` + ‏`json_serializable` للـ models؛ `riverpod` (أو bloc) لإدارة snapshot ‏`room:get-my-state` كمصدر حقيقة واحد؛ `cached_network_image` للأفاتارات؛ SDK ‏Cloudflare RealtimeKit للـ Flutter (أو بديل WebRTC) للصوت.

**مخاطر النقل الرئيسية:**
1. **دالّة الـ auth في socket_io_client ليست دالّة**: الويب يمرر `auth` كدالة تُقرأ عند كل reconnect؛ في `socket_io_client` الـ auth خريطة ثابتة في الـ options — الحل: تحديث `socket.auth`/`socket.io.options` عند تغيّر التوكن ثم `disconnect()` + ‏`connect()` (نفس سلوك `reconnectSocketAuth()`). يجب اختبار هذا صراحة.
2. **ضياع `socket.data` عند أي reconnect**: أي نسيان لإعادة `room:rejoin-player` على `connect` يجعل كل emits اللعب تفشل بصمت — اجعلها في service مركزي واحد وليس في الشاشات.
3. **الـ polling كل 3 ثوانٍ + دورة حياة التطبيق**: الموبايل يعلّق الـ timers في الخلفية؛ اربط الاستطلاع بـ `AppLifecycleState` ونفّذ resync فوري عند `resumed` (مكافئ visibility-change).
4. **الرفض الصامت في mafia chat** (`{success:false}` بلا سبب): لا تعرض خطأً — تجاهل بصمت كما في الويب (سلوك أمني مقصود anti-probing).
5. **الـ decoy الليلي إلزامي**: إغفال إرسال `player:night-action` الوهمي لغير المنفّذين يكشف الأدوار سلوكياً ويُظهر اللاعب مفقوداً عند الـ leader — يُختبر ضمن سيناريوهات القبول.
6. **iOS و`transports:['polling','websocket']`**: يفضَّل الإبقاء على upgrade path نفسه بدل websocket-only لضمان التوافق مع إعدادات الـ proxy/rewrites في الإنتاج.

---

# 9. فحص الاكتمال والفجوات المرصودة

### 1) حرجة — يجب إضافتها للخطة

**`src/context/PlayerContext.tsx`** — أكبر فجوة في التغطية. مزوِّد الجلسة/المصادقة المستخدم في 13 ملفاً من واجهة اللاعب (layout, login, home, join, rank, games, order, feedback, host, PlayerFlow, InviteModal, usePushNotifications). خطة Flutter تحتاج منه:
- نموذجا `PlayerData {playerId, name, phone, token}` و`StaffInfo {staffId, username, role, displayName, permissions[]}`.
- مفاتيح التخزين الثلاثة المتزامنة: `mafia_player_auth` (JSON مُهيكل) + `mafia_player_token` + `mafia_playerId` (مسطّحة، تقرؤها صفحات أخرى) — في Flutter توحَّد في مستودع واحد.
- التحقق عند الإقلاع عبر `GET /api/player-auth/me` مع Bearer token؛ فشل التحقق = مسح الجلسة.
- **Auto-login للموظف**: إن أعاد `/me` حقلَي `staffInfo + staffToken` تُحفظ مفاتيح `token`, `user`, `leader_token`, `leader_name` ويُستدعى `reconnectSocketAuth()` لإعادة اتصال السوكِت بصلاحية الليدر — سلوك يجب محاكاته في طبقة السوكِت في Flutter.
- `logout()` يمسح مفاتيح اللاعب فقط ويُبقي توكنات الموظف عمداً.

**مكونات الليدر المشتركة في مسار `player/host/*`** — كانت مستثناة كملفات "ليدر" لكنها تُستورَد مباشرة من واجهة اللاعب (المضيف عن بُعد):
- `src/app/leader/LeaderDayView.tsx` ← يستورده `HostDayControls` (يعتمد MafiaCard, socket, swal, constants — كلها مغطاة).
- `src/app/leader/LeaderNightView.tsx` ← يستورده `HostNightRunner` و`HostMorningRecap` (مشغّل الليل: تسلسل الأدوار).
- `src/app/leader/LeaderRoleConfigurator.tsx` ← يستورده `host/page.tsx` (توزيع الأدوار قبل البدء).
هذه الثلاثة جزء فعلي من تطبيق اللاعب في Flutter ويجب تضمين منطقها وواجهتها في الخطة. (`LeaderRoleBinding.tsx` بالمقابل ليدر-فقط؛ للمضيف نسخته الخاصة `HostRoleBinding`).

**`src/app/layout.tsx` (الجذر)** — قائمة التغطية ذكرت `player/layout` فقط. الجذر يحمل متطلبات عامة:
- RTL + `lang=ar`، خطوط Google العربية (Amiri, Cairo, Tajawal, Noto Kufi Arabic, Reem Kufi) — يجب تضمينها كأصول في Flutter.
- **بوابة الإصدار**: `APP_VERSION='2.5.0'` مقابل `mafia_app_version` في localStorage → مسح الكاش وإعادة تحميل قسرية. مكافئها في Flutter: آلية force-update (فحص إصدار من الخادم).
- تسجيل `sw.js` وتحميل مشغّل dotlottie من CDN (unpkg) — في Flutter يُستبدلان بحزمة lottie تدعم صيغة `.lottie` (dotLottie/zip) وليس JSON فقط.
- ثيم أساسي: خلفية `#050505`.

### 2) متوسطة الأهمية

- **`src/components/RankEffects.css`** — يستورده `DynamicMafiaCard` مباشرة (ليس ضمن `src/styles`). تأثيرات بصرية لخمس رتب (INFORMANT→GODFATHER): keyframes لـ pulse-glow، shimmer مائل، crown-float، particle-orbit/burst بمتغيرات `--orbit-radius/--angle`، corner-pulse، border-travel متدرج. في Flutter تُعاد كتابتها كـ AnimationController + CustomPainter — يلزم توثيقها في الخطة كمواصفة حركة وليس كـ CSS.
- **`next.config.js`** — البروكسي الذي تعتمد عليه كل نداءات `fetch('/api/…')` النسبية: rewrites لـ `/api`, `/socket.io`, `/uploads` نحو `BACKEND_URL`. في Flutter لا يوجد بروكسي؛ الخطة تحتاج ثابت baseUrl وبناء روابط `/uploads/*` (الصور الرمزية، الأصوات) بشكل مطلق.
- **`public/mafia_logo.png`** — أصل خارج المجلدات المغطاة (sounds/animations/icons/avatars) ويُستخدم في `player/login` و`PlayerFlow` — يُضاف كأصل مضمّن.
- **`public/sounds/` فارغ فعلياً** — افتراض "أصوات ضمن public" غير دقيق: `soundManager` يجلب الخريطة من `GET /api/sounds/active-map` والملفات من الخادم. خطة Flutter: تنزيل/كاش ديناميكي للأصوات، لا أصول مضمّنة.
- **`public/avatars/`** — يحوي فقط `male.png/female.png` الافتراضيتين؛ الصور الحقيقية من `/uploads`.
- **`public/animations/`** — 4 ملفات بصيغة `.lottie` (fireworks, prize-podium, sound-off, winner) — التأكد من دعم dotLottie في حزمة Flutter المختارة.

### 3) `src/types` — طبقة النماذج
المجلد يحوي ملفاً واحداً فقط: **`dotlottie.d.ts`** — مجرد إعلان JSX لعنصر `<dotlottie-player>` (خصائص src/autoplay/loop/speed…)، **ليس أنواع نطاق**. الخلاصة المهمة للخطة: لا يوجد مجلد أنواع مركزي؛ نماذج Dart يجب اشتقاقها من الأنواع المضمّنة داخل: `hooks/useGameState.ts` و`useGameConfig.ts` (حالة اللعبة والتعريفات الديناميكية)، `lib/constants.ts` (`Role`, `ROLE_NAMES`, `ROLE_ICONS`, `MAFIA_ROLES`, `NEUTRAL_ROLES`)، `context/PlayerContext.tsx` (PlayerData/StaffInfo)، وحمولات أحداث السوكِت في `lib/socket.ts` — يُوصى بجرد الأحداث كمرحلة مستقلة في الخطة.

### 4) مرجعية فقط (لا تُنقل لكنها توثّق البروتوكول)
- `public/host-console.html` — كونسول مضيف ثابت لاختبار اللعب عن بُعد (socket.io عبر CDN) — مرجع مفيد لبروتوكول المضيف.
- `public/turn-test.html` / `voice-test.html` — صفحات اختبار Cloudflare TURN وRealtimeKit — مرجع لتدفق الصوت في `useVoice/RemoteVoice`.
- `src/app/page.tsx` (الصفحة الرئيسة) — بوابة اختيار (display/player/leader/admin) مع تحقق `leader_token` عبر `/api/leader/verify`. في تطبيق لاعب مستقل تُستبدل بالدخول المباشر لواجهة اللاعب؛ لا حاجة لنقلها.

### مؤكَّد مغطى/غير ذي صلة
- **مغطى بالكامل**: كل مسارات `src/app/player/**` (بما فيها host/* التسعة)، `join/[roomCode]`، جميع الـ 25 مكوناً في `src/components`، الـ 7 hooks، الـ 11 ملفاً في `src/lib`، `src/styles/globals.css`، `tailwind.config`، `manifest.json`, `sw.js`, `firebase-messaging-sw.js`.
- **غير ذي صلة — تم التحقق بالـ Grep من عدم استيرادها في نطاق اللاعب**: `src/app/admin/**` (لا يستورد منها أي مكوّن لاعب)، `src/app/venue/**` + `venue/context.ts` (مستخدم داخل venue فقط)، `src/app/display/**`، `src/app/print/**`، `src/app/card-demo`، `leader/page|login|cards|LeaderLobbyView|LeaderRoleBinding|LeaderDayView الخاصة بالليدر فقط` (عدا الثلاثة المذكورة أعلاه)، `SeatTemplate3DEditor.tsx` + `lib/rectLayout.ts` (يستوردهما فقط `admin/seat-templates/editor` — يمكن حذفهما من خطة اللاعب رغم ورودهما في قائمة التغطية)، حزم `qrcode.react` (display فقط) و`html-to-image` (print فقط) و`sonner/next-themes/react-use-measure` (غير مستخدمة في نطاق اللاعب).

المسارات المرجعية: `C:\Projects\new mafia\unified-mafia\frontend\src\context\PlayerContext.tsx`، `C:\Projects\new mafia\unified-mafia\frontend\src\app\leader\LeaderDayView.tsx`، `LeaderNightView.tsx`، `LeaderRoleConfigurator.tsx`، `C:\Projects\new mafia\unified-mafia\frontend\src\components\RankEffects.css`، `C:\Projects\new mafia\unified-mafia\frontend\src\app\layout.tsx`، `C:\Projects\new mafia\unified-mafia\frontend\next.config.js`، `C:\Projects\new mafia\unified-mafia\frontend\src\types\dotlottie.d.ts`.

---

# 10. الحزم المطلوبة (pubspec)

| الحزمة | الغرض | يقابل في الـ PWA |
|---|---|---|
| `flutter_riverpod` + `riverpod_annotation` | إدارة الحالة | React state/context/hooks |
| `go_router` | تنقل + deep links + حراس | Next.js App Router + auth guard في layout |
| `dio` | HTTP + interceptors | `fetch` النسبي عبر بروكسي Next |
| `socket_io_client` (متوافق Socket.IO v4/EIO4) | الاتصال الحي | `socket.io-client` في `lib/socket.ts` |
| `firebase_core`, `firebase_messaging` | إشعارات Push (مشروع `mafia-b1c74`) | FCM web + Web Push VAPID + SWs |
| `flutter_local_notifications` | عرض الإشعارات foreground + قنوات Android | إشعارات SW |
| `flutter_secure_storage`, `shared_preferences`, `hive_ce` | جلسة/أعلام/كاش | localStorage/CacheStorage |
| `freezed`, `json_serializable`, `build_runner` | نماذج GameState وأصدقاؤها | أنواع TS المضمّنة في hooks |
| `just_audio` + `audio_session` | تشغيل أصوات اللعبة + ducking | `soundManager.ts` (AudioContext) |
| `lottie` + `dotlottie_loader` | أنيميشنات `.lottie` (fireworks, winner, prize-podium, sound-off) | `<dotlottie-player>` من CDN |
| `cached_network_image` | صور الأفاتار من `/uploads/avatars/*` | `next/image` |
| `image_picker` + `image_cropper` + `flutter_image_compress` | رفع وقص الأفاتار | `ImageCropper.tsx` (canvas crop + ضغط) |
| `wakelock_plus` | منع قفل الشاشة داخل اللعبة | حيل PWA غير موثوقة |
| `vibration` / `HapticFeedback` | اهتزاز أحداث الليل/التنبيهات | `navigator.vibrate` |
| `app_links` | Deep/Universal links `/join/:code` | مسار `/join/[roomCode]` |
| `url_launcher` | فتح واتساب (`wa.me`) وروابط خارجية | `WhatsAppButton.tsx` |
| `package_info_plus`, `device_info_plus` | بوابة الإصدار + deviceId | `APP_VERSION` gate + `lib/deviceId.ts` |
| `connectivity_plus` | مؤشر انقطاع الشبكة + منطق resync | أحداث online/offline |
| RealtimeKit Flutter SDK (Cloudflare/Dyte — **تحقق §12**) | الصوت المباشر عن بُعد | `@cloudflare/realtimekit` web SDK |
| `flutter_native_splash`, `flutter_launcher_icons` | Splash + أيقونات من `mafia_logo.png` وأيقونات manifest | manifest icons |
| `firebase_crashlytics` (اختياري لكنه موصى به) | تتبع الأعطال | لا مقابل حالياً |

**ملاحظة أصول:** الخطوط العربية (Cairo/Tajawal/Amiri/Noto Kufi/Reem Kufi حسب `globals.css` وroot layout) تُضمَّن كـ assets مع تعريف `fontFamily` في الثيم. ملفات الصوت **لا تُضمَّن**: تُجلب خريطتها من `GET /api/sounds/active-map` وتُكاش محلياً (Hive/ملفات) — كما يفعل soundManager.

# 11. مراحل التنفيذ

> ترتيب المراحل مبني على التبعيات: كل ما بعد المرحلة 1 يعتمد على النواة (جلسة + socket + push). التقديرات لمطوّر واحد متفرغ يعرف Flutter.

| المرحلة | المحتوى | المخرَج القابل للاختبار | تقدير |
|---|---|---|---|
| **0 — تأسيس** | مشروع + flavors (dev/prod) + ثيم كامل من design tokens + خطوط + CI بناء + Crashlytics | تطبيق فارغ بالهوية البصرية على جهازين | 3–4 أيام |
| **1 — النواة** | نماذج Dart، Dio+auth interceptors، SessionStore، شاشات الدخول/التسجيل/تغيير كلمة المرور/المكافأة، الـ Shell وBottomNav، بوابة الإشعارات (مبسّطة: طلب إذن نظام)، SocketService بمصافحة مطابقة + reconnect، PushService (توكن FCM + توجيه النقر)، بوابة الإصدار | دخول فعلي على staging، socket متصل، إشعار تجريبي يصل ويوجّه | 2 أسابيع |
| **2 — الصفحات الثابتة** | Home (كل البطاقات والمودالات)، Profile + قص الصورة، Rank + إطارات الرتب وتأثيراتها، History، Games + الدعوات، Order (F&B)، Feedback، NotificationBell | تكافؤ كامل خارج اللعب | 2.5–3 أسابيع |
| **3 — تجربة اللعب بالقاعة** | PlayerFlow كاملاً: join/lobby/انتظار، كشف الدور (البطاقة الديناميكية + Legacy)، الليل الأوتوماتيكي (خطوات + مهلة)، الصباح والسينمائيات، النقاش/التبرير/التصويت/الانسحاب، النوتة + شات المافيا، معرض المافيا + تنبيه الليدر، المتفرج، Game Over، إعادة الاتصال واستعادة المرحلة، الأصوات + wakelock | لعبة قاعة كاملة على staging بأجهزة حقيقية موازاةً مع PWA | 4–5 أسابيع |
| **4 — عن بُعد** | كونسول المضيف (9 شاشات + المكونات الثلاثة المشتركة من الليدر)، RealtimeKit voice + ActiveSpeaker + قواعد الكتم لكل مرحلة، المواجهة الثنائية، دعوات الغرف البعيدة | غرفة بعيدة كاملة بالصوت من التطبيق | 3–4 أسابيع |
| **5 — الصقل والإطلاق** | اختبار ميداني بفعالية حقيقية (التطبيق والـ PWA معاً)، أداء القوائم والأنيميشن، مراجعة نهائية للنصوص، متاجر (§12)، إطلاق تدريجي: أندرويد أولاً ثم iOS | إصدار 1.0 بالمتاجر | 2 أسابيع |

**الإجمالي: ~13–16 أسبوعاً** لمطوّر واحد. المرحلتان 3 و4 قابلتان للتوازي بمطوّرَين (يختصر الإجمالي إلى ~9–10 أسابيع).

# 12. متطلبات التصدير — Android وiOS

## 12.1 Android
- **applicationId** مقترح: `sbs.grade.mafiaclub` (يثبت للأبد — قرار مطلوب قبل أول رفع).
- `minSdkVersion 23`، `targetSdkVersion` أحدث مستقر؛ إذن `POST_NOTIFICATIONS` (Android 13+) يُطلب صراحة.
- أذونات: `INTERNET`, `POST_NOTIFICATIONS`, `RECORD_AUDIO` (الصوت عن بُعد), `VIBRATE`, `WAKE_LOCK`, `BLUETOOTH_CONNECT` (توجيه صوت السماعات), `CAMERA` (اختياري — الأفاتار عبر المعرض يكفي بدونه).
- **التوقيع:** إنشاء upload keystore + تفعيل Play App Signing، مع حفظ نسخة الـ keystore خارج المستودع.
- **Firebase:** تسجيل تطبيق Android في مشروع `mafia-b1c74` + تنزيل `google-services.json` (خارج git). مفتاح FCM موجود أصلاً في الـ backend (`firebase-service-account.json` على السيرفر) — **لا تغيير مطلوب** لمسار الإرسال.
- **App Links:** `https://club-mafia.grade.sbs/join/*` عبر `assetlinks.json` يُرفع على الدومين (خطوة على nginx في السيرفر) — يفتح التطبيق مباشرة من رابط الدعوة.
- حساب Google Play Console (25$ مرة واحدة) + صفحة متجر (لقطات، وصف عربي، سياسة خصوصية — رابط صفحة على الدومين).

## 12.2 iOS
- حساب Apple Developer (99$/سنة) — **أطول بند زمنياً (الموافقة قد تأخذ أياماً)، يُفتح فوراً**.
- Bundle ID مطابق للمقترح أعلاه؛ **APNs Auth Key (.p8)** يُنشأ ويُرفع إلى Firebase → iOS يستقبل عبر FCM→APNs (يستبدل Web Push/VAPID كلياً في التطبيق).
- Capabilities: Push Notifications، Background Modes (`remote-notification`, و`audio` + `voip` لمرحلة الصوت عن بُعد)، Associated Domains (`applinks:club-mafia.grade.sbs`) + ملف `apple-app-site-association` على الدومين.
- Info.plist: `NSMicrophoneUsageDescription` (الصوت عن بُعد)، `NSPhotoLibraryUsageDescription` (الأفاتار)، `NSCameraUsageDescription` إن فُعّلت الكاميرا.
- بناء iOS يتطلب macOS/Xcode — إن لم يتوفر Mac: **Codemagic** (خطة مجانية تكفي للبداية) للبناء والرفع إلى TestFlight.
- مراجعة App Store: التطبيق اجتماعي/ألعاب صالة — يُنصح بتوفير حساب تجريبي للمراجعين + فيديو قصير يشرح أن اللعب داخل نادٍ فعلي.

## 12.3 مشترك
- **الإصدار والتحديث القسري:** مرآة بوابة `APP_VERSION` الحالية — endpoint إعدادات يعيد `minSupportedBuild`؛ التطبيق يقارن ويعرض شاشة «حدّث التطبيق» غير قابلة للتجاوز.
- أيقونات وSplash من `mafia_logo.png` وأيقونات manifest الحالية (maskable 512).
- خصوصية المتاجر: نموذج Data Safety/App Privacy — البيانات المجموعة: هاتف، اسم، صورة، إحصاءات لعب.

## 12.4 إضافات مطلوبة على الـ backend (الوحيدة)
1. **تسجيل توكن FCM أصلي:** فحص `player-notification.routes` — إن كان مسار التسجيل الحالي يميّز `fcm` عن `webpush` فسيُعاد استخدامه كما هو مع `platform: 'android'|'ios'`؛ وإلا فإضافة حقل منصة صغيرة. (الإرسال عبر `firebase-admin` يدعم توكنات الموبايل أصلاً بلا تغيير.)
2. **endpoint إصدار أدنى** للتحديث القسري (أو إضافته لـ `/api/settings` العامة).
3. **ملفا `assetlinks.json` و`apple-app-site-association`** على `club-mafia.grade.sbs` (nginx).
4. (اختياري) تمييز نوع العميل في سجل الدخول للقياس.

# 13. المخاطر والقرارات المفتوحة

| # | المخاطرة/القرار | التفصيل | التخفيف |
|---|---|---|---|
| 1 | **RealtimeKit Flutter SDK** | الصوت عن بُعد مبني على Cloudflare RealtimeKit (Dyte سابقاً). يجب التحقق المبكر من نضج SDK الموبايل (الاسم الحالي على pub.dev، دعم iOS background audio) | Spike يوم واحد في المرحلة 0؛ البديل: تأجيل ميزة الصوت والإبقاء عليها في الـ PWA حتى نضوجها |
| 2 | **البطاقات الديناميكية** | `DynamicMafiaCard` يرسم قوالب من DB (تدرجات/حدود/توهجات/عناصر). النقل إلى widgets + CustomPainter يجب أن يطابق الإخراج البصري | بناء «معرض قوالب» تجريبي مبكراً ومقارنته بالويب لقطة بلقطة |
| 3 | **سلوك iOS بالخلفية** | قفل الشاشة/تبديل التطبيق يقطع الـ socket؛ اللعبة تعتمد على أحداث حية | منطق resync الحالي (استعادة المرحلة عند reconnect) منقول كما هو + `wakelock_plus` داخل اللعبة + إشعارات push للأحداث الحرجة (موجودة أصلاً) |
| 4 | **صلاحيات الموظف داخل تطبيق اللاعب** | الـ PWA تدعم auto-login للموظف (staffToken في المصافحة). هل يحتاجها تطبيق اللاعب؟ | **قرار مطلوب:** الاقتراح — نعم للمصافحة فقط (كما اليوم) بلا أي واجهات ليدر، لأن ميزات مثل تنبيه معرض المافيا تعتمد تمييز الليدر |
| 5 | **تأثيرات إطارات الرتب** | `RankEffects.css` (particle-orbit, shimmer, border-travel...) تُعاد كتابتها AnimationController/CustomPainter | مواصفة الحركة موثقة في قسم الرتب؛ تُبنى كمكوّن واحد معاد الاستخدام |
| 6 | **التوازي مع الـ PWA** | فترة تعايش طويلة: أي تعديل backend يجب أن يبقى متوافقاً مع العميلين | قاعدة «لا كسر للعقود» + اختبار الفعاليات على العميلين حتى إيقاف الـ PWA رسمياً |
| 7 | **أصوات القاعة (leader-source)** | نموذج الصوت: جهاز الليدر هو المصدر والعرض تابع — تطبيق اللاعب لا يشغّل أصوات القاعة إلا كتابع حسب أحداث `leader:sound-play` | نقل نفس قواعد soundManager (متى يشغّل اللاعب محلياً ومتى يصمت) دون اجتهاد |
| 8 | **مسار `/join/:code` للويب** | الرابط نفسه يخدم الـ PWA حالياً؛ بعد App Links سيفتح التطبيق إن كان مثبتاً والويب إن لم يكن | هذا هو السلوك المرغوب — لا شيء يُكسر |

---

## ملحق: مصادر هذه الخطة
- 18 تقرير تحليل (شرائح الواجهة كاملة) + تقرير عقود التكامل + فحص الاكتمال — محفوظة في مجلد عمل الجلسة (`scratchpad/reports/`).
- الكود المرجعي: `unified-mafia/frontend/src/app/player/**`، `src/components/**`، `src/hooks/**`، `src/lib/**`، `backend/src/routes/player-*.routes.ts`، `backend/src/sockets/*`.
