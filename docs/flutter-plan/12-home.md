# الصفحة الرئيسية: كل البطاقات والأقسام والمودالات

> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

## 1. الهدف والنطاق

هذا الملف هو المواصفة التنفيذية الكاملة لشاشة **الرئيسية** (`/player/home` في الويب — التبويب الأول في تطبيق Flutter). الشاشة هي لوحة اللاعب بعد تسجيل الدخول: صفحة عمودية واحدة قابلة للتمرير تجمع بالترتيب:

1. صف الرأس: اختصارات الموظفين (مشروطة) + جرس الإشعارات.
2. بانر تفعيل الإشعارات (PushBanner).
3. بطاقة البروفايل/الترحيب (الاسم، الصورة، الرتبة، شريط XP).
4. شبكة الإحصاءات السريعة (4 خلايا).
5. بطاقة اللعبة النشطة (نشطة / مقصى / منتهية) مع مغادرة/عودة.
6. بطاقات الغرف المفتوحة لحجوزات اللاعب + لوح اختيار الغرفة.
7. بطاقة طلب F&B (مشروطة).
8. بطاقة الاستضافة عن بُعد (مشروطة بصلاحية).
9. الأنشطة القادمة (حد أقصى 3) + مودال تفاصيل النشاط.
10. خلاصة أخبار الأصدقاء (مع حالة فارغة).
11. قسم «📱 تابعنا» (Instagram / Snapchat / مجموعة واتساب).
12. زر واتساب عائم (FAB).
13. مودال الانضمام لمجموعة الواتساب (مرة واحدة لكل تثبيت).
14. لوحة تحكم الموظف (bottom sheet، مشروطة).

**داخل النطاق**: كل التخطيطات والنصوص والألوان والأنيميشن والمودالات أعلاه، منطق التحميل المتوازي، تدفقات المغادرة/العودة/دخول الغرفة، دلالات مفاتيح التخزين المتشابكة مع شريحة الانضمام، وعقود REST/Socket الخاصة بالشاشة.

**خارج النطاق** (يُحال إليه فقط): لوحة الإشعارات المنسدلة ونافذة التفاصيل الغنية (19-notifications-inbox.md)، منطق أذونات/توكنات الـ push (06-push-notifications.md)، القشرة وشريط التنقل السفلي وسحب-للتحديث (11-shell-navigation.md)، تدفق الانضمام نفسه (21-join-lobby.md)، شاشة الطلبات (17-order-fnb.md)، شاشة الاستضافة (30-host-console.md).

**ملاحظات نطاق مهمة**:
- **لا توجد بطاقة «لعبة مجمّدة» في هذه الشاشة**: حقل `frozenGames[]` الذي يعيده `/api/player-auth/me` لا يُعرض في الرئيسية إطلاقاً في النسخة الحالية — الألعاب المجمّدة تُعالج في شريحة الانضمام (21-join-lobby.md). لا تخترع بطاقة لها هنا.
- **يُحذف في النقل** (كود ميت/مؤقت موثق في المصدر): رابط «🔧 تشخيص الإشعارات» → `/player/debug-push` (معلَّم في الكود «رابط تشخيص مؤقت — يُحذف لاحقاً»)، وفرع الشارة `level_up 🎉` في خلاصة الأصدقاء (غير قابل للوصول لأن التجميع يصدر دائماً `type:'session'`)، وبانر iOS «أضف إلى الشاشة الرئيسية» (Variant A من PushBanner — لا معنى له في تطبيق أصلي).

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

| الملف | الدور |
|---|---|
| `unified-mafia/frontend/src/app/player/home/page.tsx` (1024 سطراً) | الشاشة كاملة + مكوّن `PushBanner` + دالة `groupFeedBySession` — **المرجع الأساسي** |
| `unified-mafia/frontend/src/lib/ranks.ts` | جداول `RANK_NAMES_AR` و`RANK_BADGES` |
| `unified-mafia/frontend/src/components/NotificationBell.tsx` | زر الجرس والشارة (اللوحة نفسها في 19-notifications-inbox.md) |
| `unified-mafia/frontend/src/hooks/usePushNotifications.ts` | حالات الإذن `permissionState`/`needsInstall` و`requestPermission()` |
| `unified-mafia/frontend/src/hooks/useModalScrollLock.ts` | قفل التمرير وسحب-الإغلاق للشيتات (لا يُنقل — Flutter يوفره أصلياً) |
| `unified-mafia/frontend/src/context/PlayerContext.tsx` | مصدر `player {playerId, name, phone, token}` و`staffInfo` |
| `unified-mafia/frontend/src/lib/deviceId.ts` | `mafia_device_id` (UUID ثابت لكل تثبيت) |

## 3. التبعيات على ملفات الخطة الأخرى

| الملف | ماذا نأخذ منه |
|---|---|
| 01-foundation-theme.md | الثيم الداكن `#050505`، الخط العربي، مقاييس الزوايا/الظلال، امتدادات الألوان |
| 02-models-data-layer.md | مستودع التخزين المحلي (مفاتيح `mafia_session`, `mafia_user_exited`, `mafia_wa_group_prompt_v1`, `push_banner_dismissed`)، النماذج المشتركة |
| 03-networking-rest.md | عميل REST، حقن Bearer، معالجة الأخطاء الصامتة |
| 04-socket-layer.md | إرسال `room:player-exit` مع ack (بديل الـ socket المؤقت في الويب) |
| 05-session-auth.md | `player` و`staffInfo` من الجلسة، قرار تمرير توكن الموظف لواجهات الويب |
| 06-push-notifications.md | `authorizationStatus`، `requestPermission()`، تسجيل التوكن — يغذي PushBanner |
| 08-deeplinks-routing.md | مسارات go_router: `/player/join`, `/player/games`, `/player/order`, `/player/host` |
| 11-shell-navigation.md | موضع الشاشة داخل `StatefulShellRoute`/`IndexedStack`، ارتفاع BottomNav (لموضع الـ FAB)، سحب-للتحديث |
| 17-order-fnb.md | وجهة بطاقة F&B |
| 19-notifications-inbox.md | لوحة الجرس المنسدلة كاملة + نافذة التفاصيل الغنية + جداول الأنواع |
| 21-join-lobby.md | دلالات `mafia_session`/`mafia_user_exited` عند الانضمام (حرِجة — انظر §6.4) |
| 30-host-console.md | وجهة بطاقة الاستضافة عن بُعد |

## 4. الواجهة والتجربة تفصيلياً

> كل قيم px في الويب تُنقل 1:1 إلى dp/sp في Flutter. الصفحة كلها RTL (`Directionality.rtl` من مستوى التطبيق). أسماء ألوان Tailwind المذكورة تعني: gray-300 `#d1d5db`، gray-400 `#9ca3af`، gray-500 `#6b7280`، gray-600 `#4b5563`، amber-400 `#fbbf24`، amber-500 `#f59e0b`، red-400 `#f87171`، green-400 `#4ade80`، emerald-400 `#34d399`، blue-400 `#60a5fa`، cyan-400 `#22d3ee`، purple-400 `#c084fc`.

### 4.0 حاوية الصفحة

- عمود واحد داخل `Center(ConstrainedBox(maxWidth: 512))` (مكافئ `max-w-lg mx-auto`).
- حشوات: أفقي 16، أعلى 24، أسفل 24 (+ حشوة القشرة 80 لشريط التنقل — من 11-shell-navigation.md).
- المسافة الرأسية بين الأقسام: **20** (`space-y-5`). استثناء: صف الرأس يحمل هامشاً سفلياً −8، أي أن المسافة الفعلية بينه وبين ما يليه = 12.
- الخلفية موروثة من القشرة: `#050505`.
- نمط البطاقات العام: خلفية `linear-gradient(135deg, <لون مميز بشفافية 8–15%>, rgba(5,5,5,0.9))`، حد 1px بلون مميز بشفافية 15–35%، زوايا 16 (`rounded-2xl`) أو 12 (`rounded-xl`)، إيموجي كأيقونات.

### 4.1 حالة التحميل

- أثناء التحميل الأولي تُستبدل **الصفحة كلها** بمنطقة ارتفاعها الأدنى 60% من الشاشة (`min-h-[60vh]`) وفي مركزها spinner: دائرة 40×40، حد 2px بلون `rgba(245,158,11,0.3)` مع قوس علوي `#f59e0b`، دوران مستمر (`animate-spin` = دورة كل 1s خطية). في Flutter: `CircularProgressIndicator(strokeWidth: 2, color: Color(0xFFF59E0B), backgroundColor: Color(0x4DF59E0B))` بمقاس 40.
- لا يوجد سكيلتون ولا رسالة نصية.

### 4.2 مودال مجموعة الواتساب (مرة واحدة)

**شرط الظهور**: غياب المفتاح `mafia_wa_group_prompt_v1` من التخزين المحلي. يظهر فوق كل شيء (z أعلى طبقة، مكافئ `z-[200]`).

- **الخلفية**: ملء الشاشة، `rgba(0,0,0,0.75)` + ضباب خلفي (blur ~8)، حشوة 20 حول البطاقة، توسيط. أنيميشن الخلفية: fade دخولاً وخروجاً.
- **البطاقة**: عرض أقصى 384 (`max-w-sm`)، زوايا 24 (`rounded-3xl`)، حشوة 24، توسيط نصوص، خلفية `#0e1512`، حد `1px solid rgba(37,211,102,0.35)`، توهج `boxShadow: 0 0 40px rgba(37,211,102,0.2)`، اتجاه RTL صريح.
- **أنيميشن البطاقة**: spring دخول scale 0.9→1 مع y 20→0 (damping 22، stiffness 260)؛ خروج scale 0.9 + fade.
- **الأيقونة**: دائرة 64×64 موسّطة، خلفية `linear-gradient(135deg, #25d366, #128c7e)`، بداخلها شعار واتساب أبيض 34×34 (أصل SVG — §11)، هامش سفلي 16.
- **العنوان**: «انضم لمجموعة مافيا كلوب 💬» — أبيض، 18sp (`text-lg`)، bold، هامش سفلي 8.
- **النص**: «تابع آخر الأخبار والفعاليات والعروض أولاً بأول عبر مجموعتنا على واتساب.» — gray-400، 14sp، تباعد أسطر 1.625 (`leading-relaxed`)، هامش سفلي 20.
- **الزر الأساسي**: «انضم الآن» — عرض كامل، زوايا 12، حشوة رأسية 12 (`py-3`)، bold أبيض، خلفية `linear-gradient(135deg, #25d366, #128c7e)`، هامش سفلي 8. الفعل: فتح `https://chat.whatsapp.com/Bz1ipm8YxR31u5OEUOxeJZ` خارجياً + إغلاق دائم.
- **الزر الثانوي**: «لاحقاً» — نص gray-500، 14sp، حشوة رأسية 8، عرض كامل. الفعل: إغلاق دائم.
- **نقر الخلفية**: إغلاق دائم أيضاً.
- **الإغلاق الدائم** (المسارات الثلاثة كلها): كتابة `mafia_wa_group_prompt_v1 = '1'`. المفتاح **مُرقَّم الإصدار** عمداً — رفع اللاحقة (`_v2`) يعيد عرض المودال للجميع بعد إصدار جديد.

### 4.3 صف الرأس (اختصارات الموظفين + الجرس)

صف `Row` بمحاذاة space-between، هامش سفلي −8 (المسافة للقسم التالي 12 بدل 20).

**الجهة الأولى (تظهر فقط عندما `staffInfo != null`؛ وإلا عنصر فارغ للحفاظ على المحاذاة)** — صف بأزرار pill بمسافة 8 بينها:

1. زر «🎛️ لوحة التحكم» (إيموجي + نص بمسافة 8): حشوة 12 أفقي / 6 رأسي (`px-3 py-1.5`)، زوايا 12، نص 12sp متوسط، خلفية `linear-gradient(135deg, rgba(139,92,246,0.15), rgba(139,92,246,0.05))`، حد `1px solid rgba(139,92,246,0.3)`، لون نص `#a78bfa`. تفاعل الضغط: scale إلى 0.92 أثناء اللمس. الفعل: فتح لوحة تحكم الموظف (§4.6).
2. زر «📋 متابعة الحجوزات»: نفس البنية بألوان عنبرية — خلفية `linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))`، حد `rgba(245,158,11,0.3)`، نص `#fbbf24`. الفعل: فتح واجهة الويب `/admin/reservations` (قرار العرض: متصفح خارجي أو WebView — §10/§13).

**الجهة الثانية**: زر جرس الإشعارات (دائماً):
- زر 42×42، خلفية `rgba(255,255,255,0.08)`، زوايا 12، إيموجي 🔔 بحجم 20.
- شارة غير المقروء: دائرة حمراء `#ef4444` فوق الزاوية (إزاحة −4/−4)، عرض أدنى 20، نص أبيض bold 11sp، السقف **«99+»**.
- الفعل وكامل اللوحة المنسدلة والبانرات الداخلية ونافذة التفاصيل الغنية: **مواصفتها الكاملة في 19-notifications-inbox.md** (في Flutter تُفتح كـ bottom sheet/route بدل اللوحة المثبتة).

### 4.4 بانر تفعيل الإشعارات (PushBanner)

**شروط الإخفاء**: أُخفي سابقاً (`push_banner_dismissed` موجود) **أو** الإذن `granted` **أو** `denied`. (نسخة iOS «أضِف للشاشة الرئيسية» تسقط في التطبيق الأصلي — يبقى فقط ما يلي، مربوطاً بـ `authorizationStatus` من 06-push-notifications.md عندما يكون `notDetermined`).

- **البطاقة**: خلفية `linear-gradient(135deg, rgba(59,130,246,0.1), rgba(59,130,246,0.03))`، حد `1px solid rgba(59,130,246,0.2)`، زوايا 14، حشوة 14 رأسي / 16 أفقي، صف أفقي بمسافة 12.
- **أنيميشن الدخول**: fade + انزلاق من y −10 (≈300ms).
- **زر الإغلاق ✕**: موضع مطلق أعلى-يسار (8،8)، لون `rgba(255,255,255,0.3)`، حجم 16. الفعل: إخفاء دائم بكتابة `push_banner_dismissed = '1'`.
- **المحتوى**: إيموجي 🔔 بحجم 28؛ ثم عمود مرن: العنوان «لا تفوّت أي تحديث!» (أبيض، 600، 14sp، هامش سفلي 2) والنص «فعّل الإشعارات لتصلك أخبار الأنشطة والألعاب» (`rgba(255,255,255,0.5)`، 12sp).
- **زر «تفعيل»**: حشوة 8/18، زوايا 10، خلفية `#3b82f6`، نص أبيض 600 بحجم 13sp، بلا التفاف. أثناء التفعيل: النص يصبح «⏳»، الخلفية `rgba(59,130,246,0.3)`، الزر معطّل.
- **السلوك**: الضغط → `requestPermission()` (06-push-notifications.md) → عند النجاح إخفاء دائم (نفس مفتاح الإغلاق)؛ عند الفشل يعود الزر لحالته.
- **النصوص المرجعية لنسخة iOS الساقطة** (للتوثيق فقط، لا تُبنى): العنوان «📱 فعّل الإشعارات على iPhone» والخطوات: «1. اضغط ⎙ (مشاركة) في أسفل Safari» / «2. اختر "إضافة إلى الشاشة الرئيسية"» / «3. افتح التطبيق من الشاشة الرئيسية ثم فعّل الإشعارات».

### 4.5 بطاقة البروفايل (الترحيب + الرتبة + XP)

- **أنيميشن الدخول**: fade + صعود من y 10 (≈300ms).
- **البطاقة**: زوايا 16، حشوة 20 (`p-5`)، خلفية `linear-gradient(135deg, rgba(251,191,36,0.08), rgba(5,5,5,0.9))`، حد `1px solid rgba(251,191,36,0.15)`.
- **الصف العلوي** (مسافة 16): 
  - **الصورة الرمزية**: دائرة 64×64، حد `3px solid rgba(251,191,36,0.4)`، خلفية `linear-gradient(145deg, #1a1a1a, #2a2a2a)`، ظل عنبري خفيف (`shadow-amber-500/10`). المحتوى: صورة `player.avatarUrl` (cover، عبر `CachedNetworkImage`) أو إيموجي 🎭 بحجم 30 (`text-3xl`) كاحتياط.
  - **العمود المرن**: التحية «أهلاً {name} 👋» (18sp bold أبيض؛ الاسم الاحتياطي عند الغياب: **«لاعب»**)، وتحتها بمسافة 2 شريحة الرتبة: pill بنص 12sp، حشوة 8 أفقي / 2 رأسي، زوايا كاملة، خلفية `rgba(251,191,36,0.15)`، لون `#fbbf24`، المحتوى: `{شارة الرتبة} {اسم الرتبة} • Lv.{level}`.
- **جداول الرتب** (من `lib/ranks.ts` — مفتاح `progression.rankTier`):

| rankTier | الشارة | الاسم العربي |
|---|---|---|
| INFORMANT | 🕵️ | مُخبر |
| SOLDIER | ⚔️ | جندي |
| CAPO | 🎖️ | كابو |
| UNDERBOSS | 💎 | أندربوس |
| GODFATHER | 👑 | الأب الروحي |

الاحتياطيات عند غياب/جهالة القيمة: 🕵️ / «مُخبر» / المستوى 1.

- **شريط XP** (هامش علوي 16):
  - صف تسميات (10sp gray-500، هامش سفلي 4): البداية `XP {xp}` (احتياطي 0) والنهاية `{nextLevelXP}` (احتياطي **500**).
  - المسار: ارتفاع 6 (`h-1.5`)، زوايا كاملة، خلفية `rgba(255,255,255,0.05)`.
  - التعبئة: تتحرك من عرض 0 إلى `{xpProgress}%` (احتياطي 0) عند الدخول (≈300ms easeOut — `TweenAnimationBuilder`)، تدرج `linear-gradient(90deg, #fbbf24, #ef4444)`، زوايا كاملة.

### 4.6 لوحة تحكم الموظف (bottom sheet — مشروطة بـ `staffInfo`)

- **الخلفية**: `rgba(0,0,0,0.7)` + ضباب، محاذاة سفلية. نقرها يغلق.
- **اللوح**: عرض أقصى 512، زوايا علوية 24 (`rounded-t-3xl`)، حشوة 24 وأسفل 40 (`pb-10`)، خلفية `linear-gradient(180deg, #1a1a2e 0%, #0a0a1a 100%)`، حد `1px solid rgba(139,92,246,0.25)` بلا حد سفلي.
- **أنيميشن**: spring انزلاق من أسفل y:100%→0 (damping 25، stiffness 300)؛ الخروج انزلاق لأسفل.
- **مقبض السحب**: شريط 40×4 زوايا كاملة، `rgba(192,132,252,0.3)` (purple-400/30)، موسّط، هامش سفلي 20.
- **العنوان**: «🎛️ لوحة التحكم» (أبيض 18sp bold موسّط، هامش سفلي 4).
- **العنوان الفرعي**: «مرحباً {displayName} • {الدور}» (gray-500، 12sp، موسّط، هامش سفلي 20) حيث الدور: `admin` → «مدير»، `leader` → «قائد»، غير ذلك → «موظف».
- **صفوف التنقل** (مسافة 12 بينها؛ كل صف: زوايا 12، حشوة 16، صف space-between؛ يسار الصف: دائرة 40×40 بتدرج اللون المميز 0.2→0.08 وحد 0.4 تحوي الإيموجي 18sp + عمود نصي يمين المحاذاة: التسمية أبيض 14sp متوسط والسطر الفرعي gray-500 بـ10sp؛ نهاية الصف: سهم «←» 18sp ملوّن؛ تفاعل الضغط scale 0.98؛ أنيميشن دخول متدرّج: انزلاق من x −20 + fade بتأخيرات 0.05 / 0.10 / 0.15 ثانية):

| # | التسمية | السطر الفرعي | الوجهة | الثيم (لون المميز) | لون السهم | شرط الظهور |
|---|---|---|---|---|---|---|
| 1 | لوحة الإدارة | Dashboard • إحصائيات وأنشطة ومالية | `/admin` | أحمر داكن `rgba(138,3,3,…)` — خلفية 0.12→0.04، حد 0.25 | red-400 `#f87171` | دائماً (عند staffInfo) |
| 2 | غرفة العمليات | Leader • إدارة وتشغيل الألعاب | `/leader` | ذهبي `rgba(197,160,89,…)` — 0.12→0.04، حد 0.25 | amber-400 `#fbbf24` | **فقط** `role ∈ {admin, manager, leader}` |
| 3 | شاشة العرض | Display • عرض حالة اللعبة | `/display` | أزرق `rgba(59,130,246,…)` — 0.12→0.04، حد 0.25 | blue-400 `#60a5fa` | دائماً (عند staffInfo) |

الإيموجيات: 📊 / 🕹️ / 📺 على الترتيب.

- **الإغلاق**: نقر الخلفية أو سحب لأسفل (Flutter يوفره أصلياً في `showModalBottomSheet` — عتبة الويب كانت 80px). الوجهات واجهات ويب منفصلة — انظر §10 و§13.

### 4.7 شبكة الإحصاءات السريعة

- شبكة **4 أعمدة** بمسافة 8 (`grid-cols-4 gap-2`). كل خلية: زوايا 12، حشوة 12، توسيط، خلفية `rgba(255,255,255,0.03)`، حد `1px solid rgba(255,255,255,0.06)`.
- محتوى الخلية: القيمة (18sp bold بلون الخلية) ثم التسمية (10sp gray-500، هامش علوي 2).
- أنيميشن: fade + صعود y10 متدرّج بتأخير `i × 0.05` ثانية.

| الترتيب (RTL: الأولى يميناً) | التسمية | القيمة | اللون |
|---|---|---|---|
| 1 | مباريات | `stats.totalMatches` | `#fbbf24` |
| 2 | فوز | `{stats.winRate}%` | `#22c55e` |
| 3 | نجاة | `{stats.survivalRate}%` | `#3b82f6` |
| 4 | سلسلة | `stats.longestWinStreak` | `#f97316` |

كل القيم احتياطيها **0** عند الغياب.

### 4.8 بطاقة اللعبة النشطة (مشروطة بـ `profile.activeGame != null`)

**مشتقات**: `isDead = (isAlive == false)`، `isOver = (phase == 'GAME_OVER')`، `canLeave = isDead || isOver`.

- **البطاقة**: زوايا 16، حشوة 16، أنيميشن fade فقط.
  - حالة جارية (ليست canLeave): خلفية `linear-gradient(135deg, rgba(34,197,94,0.15), rgba(5,5,5,0.9))`، حد `1px solid rgba(34,197,94,0.3)`.
  - حالة canLeave (ميت أو منتهية): خلفية `linear-gradient(135deg, rgba(239,68,68,0.1), rgba(5,5,5,0.9))`، حد `1px solid rgba(239,68,68,0.25)`.
- **المحتوى** (صف space-between):
  - عمود البداية: تسمية الحالة (12sp متوسط): `isOver` → «🏁 اللعبة انتهت»، وإلا `isDead` → «💀 تم إقصاؤك»، وإلا «🟢 لعبة نشطة». اللون: red-400 عند canLeave وإلا green-400. تحتها اسم اللعبة `gameName` (أبيض 14sp، هامش علوي 4).
  - صف الأزرار (مسافة 8):
    1. **«🚪 مغادرة»** — يظهر **فقط عند canLeave**: pill حشوة 12/6، زوايا 8، نص 11sp متوسط، خلفية `rgba(239,68,68,0.2)`، نص red-400، حد `1px solid rgba(239,68,68,0.3)`. السلوك التفصيلي في §6.3.
    2. **«العودة ←»** — زر نصي 12sp بلا خلفية: لونه green-400 أثناء الجريان و**gray-500 عند canLeave**. الفعل: حذف مفتاح `mafia_user_exited` ثم التنقل إلى `/player/join` (يعيد الالتحاق تلقائياً عبر الجلسة المخزنة — 21-join-lobby.md).

### 4.9 بطاقات الغرف المفتوحة لحجوزاتك (مشروطة بـ `activeRooms.isNotEmpty`)

قائمة بطاقات بمسافة 8 بينها — **بطاقة لكل نشاط** (عنصر من `rooms[]` في استجابة my-active-rooms):

- **البطاقة**: زوايا 16، حشوة 16، خلفية `linear-gradient(135deg, rgba(251,191,36,0.12), rgba(5,5,5,0.9))`، حد `1px solid rgba(251,191,36,0.25)`، أنيميشن fade + صعود y10.
- **عمود البداية**: «🎮 غرفة مفتوحة لحجزك» (amber-400، 12sp متوسط) ثم `{activityName}` (أبيض 14sp، هامش علوي 4) ثم سطر فرعي (gray-500، 10sp، هامش علوي 2): غرفة واحدة → «كود الغرفة: {sessionCode}»؛ أكثر → «{n} غرف متاحة».
- **زر «🎯 ادخل»**: حشوة 16/8، زوايا 12، نص 14sp bold أسود، خلفية `linear-gradient(135deg, #fbbf24, #d97706)`، توهج `0 0 20px rgba(251,191,36,0.2)`.
- **الفعل**: حذف `mafia_session` **و** `mafia_user_exited` (منع الالتحاق التلقائي بغرفة قديمة) ثم: غرفة واحدة → تنقل مباشر `/player/join?code={sessionCode}`؛ عدة غرف → فتح لوح اختيار الغرفة (§4.10).

### 4.10 لوح اختيار الغرفة (bottom sheet — مشروط بفتحه من §4.9)

- **الخلفية**: `rgba(0,0,0,0.7)` + ضباب. **اللوح**: عرض أقصى 512، زوايا علوية 24، حشوة 24/أسفل 40، خلفية `linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)`، حد `1px solid rgba(251,191,36,0.2)` بلا حد سفلي، spring دخول من الأسفل (damping 25، stiffness 300). مقبض 40×4 بلون `rgba(255,255,255,0.2)`.
- **العنوان**: «اختر غرفة» (أبيض 18sp bold موسّط). **الفرعي**: «{activityName} — {n} غرف متاحة» (gray-500، 12sp، موسّط، هامش سفلي 20).
- **الصفوف** (مسافة 12؛ أنيميشن متدرّج: انزلاق من x −20 + fade بتأخير `i × 0.08`s؛ تفاعل ضغط scale 0.98):
  - زر بعرض كامل: زوايا 12، حشوة 16، خلفية `rgba(255,255,255,0.04)`، حد `rgba(255,255,255,0.08)`.
  - البداية: دائرة 40×40 (خلفية `linear-gradient(135deg, rgba(251,191,36,0.15), rgba(251,191,36,0.05))`، حد `rgba(251,191,36,0.3)`) برقم الغرفة `{i+1}` (amber-400، 14sp bold)؛ بجانبها عمود: الاسم `sessionName ?? 'غرفة {i+1}'` (أبيض 14sp متوسط) وتحته «كود: {sessionCode} • {maxPlayers} لاعب» (gray-500، 10sp، **خط monospace**).
  - النهاية: سهم «→» amber-400 بحجم 18sp.
- **فعل الصف**: حذف `mafia_session` + `mafia_user_exited` → إغلاق اللوح → تنقل `/player/join?code={sessionCode}`.
- **الإغلاق**: نقر الخلفية أو السحب لأسفل.

### 4.11 بطاقة طلب F&B (مشروطة بـ `fnbCtx != null`)

- زر بعرض كامل: زوايا 16، حشوة 16، محاذاة نص لليمين، خلفية `linear-gradient(135deg, rgba(16,185,129,0.14), rgba(5,5,5,0.9))`، حد `1px solid rgba(16,185,129,0.3)`.
- المحتوى (صف space-between بمسافة 12): عمود البداية: «🍽️ اطلب من {fnbCtx.locationName}» (emerald-400، 12sp متوسط) ثم «منيو المكان متاح لحجزك — {fnbCtx.activityName}» (أبيض 14sp، هامش علوي 4). النهاية: pill «اطلب →» (حشوة 16/8، زوايا 12، 14sp bold أبيض، خلفية `linear-gradient(135deg, #10b981, #0d9488)`، بلا التفاف).
- الفعل: تنقل إلى `/player/order` (17-order-fnb.md).

### 4.12 بطاقة الاستضافة عن بُعد (مشروطة بـ `player.canHostRemote == true`)

- زر بعرض كامل: زوايا 16، حشوة 16، خلفية `linear-gradient(135deg, rgba(197,160,89,0.14), rgba(5,5,5,0.9))`، حد `1px solid rgba(197,160,89,0.3)`.
- المحتوى: «🌐 استضافة لعبة عن بُعد» (لون `#C5A059`، 12sp متوسط) ثم «أنشئ غرفةً وأدِرها كمُوجِّه — يشترك أصدقاؤك من أجهزتهم» (أبيض 14sp). النهاية: pill «استضِف →» (نفس بنية pill السابقة، خلفية `linear-gradient(135deg, #d8b25a, #c0912f)`، لون النص `#1a1206`).
- الفعل: تنقل إلى `/player/host` (30-host-console.md).

### 4.13 الأنشطة القادمة (مشروطة بـ `upcoming.isNotEmpty` — حد أقصى 3 عناصر)

- **رأس القسم** (صف space-between، هامش سفلي 12): «📅 أنشطة قادمة» (أبيض 14sp semibold) + رابط «عرض الكل ←» (لون `rgba(245,158,11,0.6)`، 10sp) → تنقل إلى `/player/games`.
- **صفوف الأنشطة** (مسافة 8؛ كل صف: زوايا 12، حشوة 12، خلفية `rgba(255,255,255,0.03)`، حد `rgba(255,255,255,0.06)`؛ تفاعل ضغط: scale 0.98 وخلفية `rgba(255,255,255,0.06)`):
  - السطر الأول (صف بمسافة 8): اسم النشاط (أبيض 14sp) + **pill الصعوبة**: نص 8sp، حشوة 6/2، زوايا كاملة، خلفية اللون بشفافية hex `15` (≈8%)، نص باللون:

| difficulty | النص | اللون |
|---|---|---|
| easy | 🟢 سهل | `#22c55e` |
| medium | 🟡 متوسط | `#f59e0b` |
| hard | 🔴 صعب | `#ef4444` |
| expert | 🟣 خبير | `#a855f7` |
| غير معروف | **يسقط إلى medium** | — |

  - السطر الثاني (gray-500، 10sp، هامش علوي 2): التاريخ بصيغة ar-JO `{weekday: short, month: short, day: numeric}` (مثل «الجمعة، ٢٤ تموز» — أرقام شرقية حسب اللقيمة)، يليه ` • 📍 {locationName}` إن وُجد الموقع.
  - السطر الثالث (gray-600، 10sp، هامش علوي 2): «👥 {bookedCount}/{maxPlayers} لاعب» — احتياطي maxPlayers = **20**.
  - نهاية الصف: 🎟️ (amber-400، 12sp).
- **الفعل**: فتح مودال تفاصيل النشاط (§4.14).

### 4.14 مودال تفاصيل النشاط (bottom sheet قابل للتمرير)

- **الخلفية**: `rgba(0,0,0,0.8)` (بلا ضباب هنا)، محاذاة سفلية.
- **اللوح**: عرض أقصى 512، زوايا علوية 24، حشوة 24، **ارتفاع أقصى 80% من الشاشة مع تمرير داخلي** (`DraggableScrollableSheet` بـ maxChildSize ≈ 0.8)، خلفية `#111111`، حد `1px solid rgba(255,255,255,0.08)`. أنيميشن spring دخول من y 300→0 (damping 25، stiffness 300). مقبض 40×4 `rgba(255,255,255,0.2)`، هامش سفلي 16.
- **المحتوى بالترتيب**:
  1. الاسم (أبيض 18sp bold، هامش سفلي 4).
  2. الوصف إن وُجد (gray-400، 12sp، هامش سفلي 12).
  3. صفوف التفاصيل (مسافة 8، هامش سفلي 16؛ كل صف: إيموجي + نص 14sp gray-300 بمسافة 8):
     - 📅 التاريخ الكامل ar-JO: `{weekday: long, year: numeric, month: long, day: numeric, hour: '2-digit', minute: '2-digit'}` (في intl: `DateFormat('EEEE، d MMMM y، hh:mm a', 'ar')` تقريباً — طابق مخرجات المتصفح).
     - 📍 `{locationName}` — فقط إن وُجد.
     - 👥 «{bookedCount}/{maxPlayers} لاعب» (احتياطي 20).
     - صعوبة: `{أيقونة الصعوبة}` + التسمية **ملوّنة بلون الصعوبة** (نفس جدول §4.13، الجهالة → medium).
     - 💰 «{basePrice} ₪» — **فقط إذا كان `basePrice` غير فارغ و≠ `'0'`** (المقارنة **نصية** — الـ API يرسله string؛ لاحظ أن الرمز المعروض شيكل ₪ رغم عمل النادي بالدينار — **انسخه كما هو** حتى يصحّح المنتج).
  4. **كتلة العروض** — فقط إذا كانت `locationOffers` مصفوفة غير فارغة (هامش سفلي 16): العنوان «🎁 العروض المتاحة:» (gray-400، 12sp، هامش سفلي 8) ثم لكل عرض بطاقة (مسافة 6 بينها): حشوة 10، زوايا 12، خلفية `rgba(255,255,255,0.05)`، حد `rgba(255,255,255,0.05)`، نص 12sp: اسم العرض `offer.name ?? offer.title ?? 'عرض {i+1}'` (amber-400)، ثم إن وُجد السعر « • {price} ₪» (gray-500، هامش بادئ 8)، ثم إن وُجد الوصف بسطر جديد (gray-500، 10sp، هامش علوي 2).
  5. **التذييل** (صف بمسافة 8):
     - «احجز الآن 🎟️» — يتمدد (flex-1)، حشوة رأسية 12، زوايا 12، نص 14sp متوسط **أسود**، خلفية `linear-gradient(135deg, #fbbf24, #f59e0b)`. الفعل: إغلاق المودال ثم تنقل إلى `/player/games` (الحجز الفعلي في 14-games-invites.md).
     - «📍 الموقع» — يظهر فقط إن وُجد `locationMapUrl`: حشوة 12/16، زوايا 12، نص أبيض 14sp، خلفية `rgba(255,255,255,0.08)`، حد `rgba(255,255,255,0.1)`. الفعل: فتح الرابط خارجياً (خرائط Google).
- **الإغلاق**: نقر الخلفية، أو سحب لأسفل **فقط عندما يكون التمرير الداخلي عند القمة** (scrollTop ≤ 5 في الويب — `DraggableScrollableSheet` يعطي هذا السلوك أصلياً).

### 4.15 خلاصة أخبار الأصدقاء

**الحالة غير الفارغة** (`groupedFeed.isNotEmpty`):
- العنوان «👥 أخبار أصدقائك» (أبيض 14sp semibold، هامش سفلي 12).
- حتى **8 صفوف** (بعد التجميع — §6.5)، مسافة 8، أنيميشن fade + صعود y5 متدرّج بتأخير `i × 0.03`s. كل صف: زوايا 12، حشوة 12، خلفية `rgba(255,255,255,0.03)`، حد `rgba(255,255,255,0.06)`، صف أفقي بمسافة 12:
  - دائرة 32×32 خلفية `rgba(255,255,255,0.05)`: صورة `avatarUrl` (cover) أو 🎭.
  - عمود مرن: اسم اللاعب (أبيض 12sp متوسط، قصّ بسطر واحد) ثم الوصف (gray-500، 10sp) — صيغة الوصف: «لعب يوم {التاريخ بصيغة ar-JO: weekday long, month short, day numeric} — {n} لعبة» (مفرد «لعبة» عند n=1، وإلا «ألعاب»).
  - شارة النهاية: «🎮 {matchCount}» (cyan-400، 10sp). (فرع 🎉 للـ level_up كود ميت — لا يُبنى.)

**الحالة الفارغة**: نص موسّط بحشوة رأسية 24: «لا أخبار بعد — تابع لاعبين من صفحة التصنيف!» (gray-600، 14sp). *(القسم يظهر دائماً — إما القائمة أو هذه الرسالة.)*

### 4.16 قسم «📱 تابعنا»

- العنوان «📱 تابعنا» (أبيض 14sp semibold، هامش سفلي 8).
- **شبكة عمودين** بمسافة 8 — بطاقتان (زوايا 16، حشوة 16، توسيط، أنيميشن fade):
  1. **Instagram**: خلفية `linear-gradient(135deg, rgba(225,48,108,0.1), rgba(131,58,180,0.1), rgba(253,29,29,0.05))`، حد `1px solid rgba(225,48,108,0.2)`؛ «📸 Instagram» (14sp متوسط، لون `#e1306c`) وتحته «@mafia_club_jo» (gray-500، 10sp، هامش علوي 4). → `https://www.instagram.com/mafia_club_jo/` خارجياً.
  2. **Snapchat**: خلفية `linear-gradient(135deg, rgba(255,252,0,0.08), rgba(255,221,0,0.05))`، حد `rgba(255,252,0,0.2)`؛ «👻 Snapchat» (لون `#FFFC00`) وتحته «@mafia_club26». → `https://www.snapchat.com/add/mafia_club26` خارجياً.
- **زر مجموعة الواتساب** (هامش علوي 4 إضافي فوق مسافة 8): عرض كامل، صف موسّط بمسافة 8، زوايا 16، حشوة 16، خلفية `linear-gradient(135deg, rgba(37,211,102,0.15), rgba(18,140,126,0.08))`، حد `1px solid rgba(37,211,102,0.35)`؛ شعار واتساب 20×20 بلون `#25d366` + «انضم لمجموعة الواتساب» (14sp bold، لون `#25d366`). → `https://chat.whatsapp.com/Bz1ipm8YxR31u5OEUOxeJZ` خارجياً.

### 4.17 زر واتساب عائم (FAB)

- دائرة **56×56**، خلفية `linear-gradient(135deg, #25d366, #128c7e)`، شعار واتساب أبيض 28×28، ظل `shadow-lg` بلون `rgba(34,197,94,0.3)`.
- **الموضع (انسخه حرفياً)**: مثبت في **الزاوية اليسرى الفيزيائية** (وهي جهة «النهاية» في صفحة RTL)، 16 من اليسار و96 من الأسفل في الويب (`bottom-24 left-4`) — أي **16dp فوق الحافة العلوية لشريط التنقل السفلي** (ارتفاعه ~80 مع safe area — 11-shell-navigation.md). في Flutter: `Positioned(left: 16, bottom: navHeight + 16)` داخل Stack الشاشة (وليس `Scaffold.floatingActionButton` الافتراضي الذي سيضعه يميناً في RTL).
- تفاعل: hover scale 1.10 (لا ينطبق على اللمس) / ضغط scale 0.95 (`AnimatedScale`).
- الفعل: فتح `https://wa.me/962793390966` خارجياً (يفتح تطبيق WhatsApp إن كان مثبتاً).
- يظهر دائماً في هذه الشاشة (فوق كل الأقسام، تحت المودالات).

### 4.18 حالات الخطأ

**لا توجد أي واجهة خطأ في هذه الشاشة** — هذا سلوك مقصود يجب نسخه: أي نداء API يفشل أو يعيد `success:false` يترك قسمه غائباً بصمت (بطاقة اللعبة لا تظهر، الأنشطة لا تظهر، الخلاصة تعرض حالتها الفارغة، إلخ). لا Snackbar ولا Retry. فشل نداء المغادرة عبر الـ socket يُبتلع بصمت أيضاً (البطاقة تبقى).

## 5. التكيّف مع الشاشات 6→11 إنش

استراتيجية Window Size Classes الموحدة (انظر 00-MASTER-PLAN.md):

### compact (أقل من 600dp — هواتف 6–7 إنش)
- التخطيط مطابق للـ PWA تماماً: عمود واحد، حشوة أفقية 16، وسقف عرض المحتوى **512dp** موسّطاً (بين 512 و600dp يظهر هامشان جانبيان كما في الويب).
- شبكة الإحصاءات 4 أعمدة، «تابعنا» عمودان، كل الشيتات بعرض الشاشة.
- كل القياسات والأحجام كما في §4 حرفياً.

### medium (600–840dp — تابلت 8 إنش)
- سقف عرض عمود المحتوى يرتفع إلى **640dp** موسّطاً (القاعدة العامة للمحتوى النصي)؛ كل الأقسام تبقى عموداً واحداً بنفس الترتيب.
- شبكة الإحصاءات تبقى 4 أعمدة (الخلايا تتسع)؛ «تابعنا» يبقى عمودين.
- الـ bottom sheets الثلاثة (لوحة الموظف، اختيار الغرفة، تفاصيل النشاط) تُقيَّد بعرض **640dp** موسّطاً (`showModalBottomSheet(constraints: BoxConstraints(maxWidth: 640))`) بزوايا علوية 24 كما هي.
- مودال الواتساب يبقى 384dp (هو مقيّد أصلاً).
- الـ FAB في نفس الموضع (يسار فيزيائي، فوق الشريط).
- لا تغيير في أحجام الخطوط.

### expanded (أكبر من 840dp — تابلت 10–11 إنش)
- سقف العرض الكلي **960dp** موسّطاً، والتخطيط يتحول إلى **two-pane** بشبكة عمودين بمسافة 24 (ترتيب RTL — العمود الأول على اليمين):
  - **العمود الأيمن (~58%)**: صف الرأس، PushBanner، بطاقة البروفايل، الإحصاءات، اللعبة النشطة، الغرف المفتوحة، بطاقة F&B، بطاقة الاستضافة.
  - **العمود الأيسر (~42%)**: الأنشطة القادمة، خلاصة الأصدقاء، «تابعنا».
- الشيتات: لوحة الموظف واختيار الغرفة وتفاصيل النشاط تتحول إلى **حوارات موسّطة** (Dialog بعرض أقصى 480dp، زوايا 24، نفس الخلفيات والحدود والمحتوى؛ أنيميشن الدخول fade + scale 0.95→1 بدل الانزلاق من الأسفل) — الانزلاق من أسفل شاشة 11 إنش يبدو مشوهاً.
- شبكة الإحصاءات تبقى 4 أعمدة داخل عمودها؛ لا تمديد للبطاقات خارج عمودها.
- لا مضاعفة لأحجام النصوص (لا عناصر لعب حسّاسة في هذه الشاشة — البطاقات معلوماتية)؛ يُسمح فقط برفع قيمة الإحصاءات من 18sp إلى 20sp.
- الـ FAB: يبقى في الزاوية اليسرى السفلية للشاشة (وليس داخل العمود).

## 6. المنطق والتدفقات

### 6.1 آلة حالة الشاشة

```
HomeState:
  loading                         ← عند الدخول (ولا بيانات سابقة)
  loaded {                        ← بعد اكتمال Future.wait (بنجاح أو فشل)
    profile:      HomeProfile?    // null إن فشل → تُخفى بطاقة اللعبة، تظهر احتياطيات البروفايل
    upcoming:     List<UpcomingActivity>   // أول 3 فقط
    groupedFeed:  List<GroupedFeedEntry>
    activeRooms:  List<ActiveRoomsEntry>
    fnbCtx:       FnbContext?     // يصل لاحقاً بشكل مستقل — يعيد بناء بطاقته فقط
  }
```

- **لا حالة error** — الفشل الجزئي = غياب القسم (انظر §4.18).

### 6.2 التحميل الأولي

1. الشرط المسبق: `player != null` (من 05-session-auth.md). بدونه لا يُنفذ شيء.
2. `Future.wait` على **4 نداءات متوازية**: profile، following-feed، upcoming، my-active-rooms. كل نتيجة تُقبل فقط إذا `success == true` (وmy-active-rooms إضافياً `rooms.length > 0`). أي استثناء في my-active-rooms يُحوَّل إلى `{success:false}` (لا يُسقط البقية). في حال غياب توكن اللاعب، يُتخطى نداء my-active-rooms بالكامل.
3. `upcoming` تُقتطع إلى أول **3** عناصر فور الوصول.
4. بعد اكتمال الأربعة (finally): إخفاء الـ spinner.
5. **نداء F&B مستقل تماماً وغير حاجب** (`GET /api/fnb/context`): يُطلق بالتوازي ولا يؤخر الرسم الأول؛ عند وصوله بنجاح مع `context != null` تظهر بطاقة F&B (إعادة بناء جزئية).
6. **إعادة التحميل**: في الويب تعاد الدورة كاملة عند كل دخول للصفحة (remount). في Flutter مع `IndexedStack`: أعد تنفيذ الدورة (مع الـ spinner) عند كل **عودة إلى تبويب الرئيسية**، للتكافؤ. سحب-للتحديث من القشرة (11-shell-navigation.md) يعيد نفس الدورة.
7. فحص مفتاح `mafia_wa_group_prompt_v1` يجري عند أول بناء (مستقل عن الشبكة) — غيابه يعرض مودال §4.2 فوراً حتى أثناء التحميل.

### 6.3 تدفق «🚪 مغادرة» (المغادرة النهائية بعد الإقصاء/النهاية)

- متاح فقط عندما `canLeave` (ميت أو GAME_OVER).
- **في الويب**: يُفتح socket **مؤقت منفصل** (`io(NEXT_PUBLIC_SOCKET_URL, {transports:['websocket']})`) ثم `emit('room:player-exit', {roomId, playerId}, ack)`؛ عند `ack.success` يصفَّر `profile.activeGame` محلياً (تختفي البطاقة) ويُقطع الاتصال؛ مع مؤقت قطع احتياطي غير مشروط بعد **3000ms**؛ كل الأخطاء تُبتلع.
- **في Flutter**: استخدم الـ socket المفرد من 04-socket-layer.md (الاتصال المؤقت كان التفافاً ويبياً): `emitWithAck('room:player-exit', {roomId: activeGame.roomId, playerId: player.playerId})` مع `Future.timeout(3s)`؛ نجاح → `activeGame = null` محلياً؛ فشل/مهلة → لا شيء (صمت). **لا تعيد جلب البروفايل** — التصفير محلي فقط، كما في الويب.

### 6.4 دلالات مفاتيح التخزين المتشابكة مع شريحة الانضمام (حرِجة — انقلها حرفياً)

| الفعل | `mafia_session` | `mafia_user_exited` | ثم |
|---|---|---|---|
| «العودة ←» (بطاقة اللعبة النشطة) | لا يُمس | **يُحذف** | تنقل `/player/join` (التحاق تلقائي بالجلسة المخزنة) |
| «🎯 ادخل» (غرفة واحدة) | **يُحذف** | **يُحذف** | تنقل `/player/join?code={sessionCode}` |
| صف في لوح اختيار الغرفة | **يُحذف** | **يُحذف** | إغلاق اللوح + تنقل `/player/join?code={sessionCode}` |

الحذف **قبل** التنقل دائماً — وإلا قد يلتحق اللاعب تلقائياً بغرفة قديمة (`mafia_session`) أو يُكبت الالتحاق التلقائي (`mafia_user_exited`). التفاصيل الكاملة لاستهلاك المفتاحين في 21-join-lobby.md.

### 6.5 خوارزمية تجميع خلاصة الأصدقاء (`groupFeedBySession` — انسخها كما هي)

```
لكل عنصر في feed:
  dateKey = matchDate موجود ? DateTime.parse(matchDate).toDateString() : ''   // مفتاح «اليوم»
  key = '{playerId}-{dateKey}'
  إن كان key موجوداً في الخريطة: matchCount++
  وإلا أنشئ: {
    type: 'session',
    playerId,
    playerName: item.playerInfo?.name ?? item.playerName,
    avatarUrl: item.playerInfo?.avatarUrl,
    matchCount: 1,
    dateKey,
    description: 'لعب يوم {dateKey منسّقاً ar-JO: weekday long, month short, day numeric}'
  }
بعد التجميع، لكل مدخلة:
  description += ' — {matchCount} ' + (matchCount == 1 ? 'لعبة' : 'ألعاب')
الترتيب: ترتيب إدراج الخريطة (أي ترتيب أول ظهور في feed).
العرض: أول 8 مدخلات فقط.
```

### 6.6 المؤقتات والمهل

| المؤقت | القيمة | الغرض |
|---|---|---|
| مهلة ack المغادرة / القطع الاحتياطي | 3000ms | §6.3 |
| polling الإشعارات | 60s | خاص بالجرس — في 19-notifications-inbox.md |
| أنيميشنات الدخول | ≈300ms + تأخيرات التدرّج (0.03/0.05/0.08/0.05–0.15s) | §4 |

لا مؤقتات أخرى في هذه الشاشة.

### 6.7 إعادة الاتصال واستعادة الحالة

- الشاشة **لا تستمع لأي حدث socket** — لا شيء يُستعاد عبر الـ socket هنا. بيانات اللعبة النشطة تأتي من REST فقط وتتحدث عند إعادة تحميل الشاشة.
- عند العودة من الخلفية (`AppLifecycleState.resumed`) والشاشة ظاهرة: أعد دورة التحميل (يحاكي عودة مستخدم الـ PWA وفتحه الصفحة من جديد).
- حالة المودالات لا تُستعاد بعد إعادة تشغيل التطبيق (سلوك الويب نفسه).

### 6.8 الحالات الحدّية

- `player == null` (انتهت الجلسة): القشرة تعيد التوجيه للدخول (05-session-auth.md) — الشاشة لا تعالج هذا بنفسها.
- `activeGame.phase == 'GAME_OVER'` مع `isAlive == true`: تُعرض «🏁 اللعبة انتهت» (isOver له الأولوية على isDead في النص).
- `basePrice == '0'` أو null أو سلسلة فارغة: صف السعر لا يظهر.
- `locationOffers` ليست مصفوفة أو فارغة: كتلة العروض لا تظهر.
- نشاط بـ `difficulty` غير معروفة: يعامل كـ medium (🟡 متوسط).
- عنصر feed بلا `matchDate`: dateKey فارغ — يتجمع تحت مفتاح `{playerId}-` ووصفه «لعب يوم  — …» (سلوك الويب كما هو).
- `activeRooms` فيها نشاط بغرفة واحدة اسمها null: السطر الفرعي «كود الغرفة: …»، وفي اللوح (لو فُتح لتعدد) الاسم الاحتياطي «غرفة {i+1}».
- فتح روابط خارجية وفشلها (واتساب غير مثبت): `wa.me` يفتح في المتصفح كاحتياط تلقائي — لا معالجة إضافية.

## 7. عقود التكامل

### 7.1 REST (كل المسارات على نفس الـ backend — القاعدة في 03-networking-rest.md؛ Bearer = توكن اللاعب JWT)

| # | Method | Path | Auth | Request | حقول الاستجابة المستهلكة |
|---|---|---|---|---|---|
| 1 | GET | `/api/player/{playerId}/profile` | **بلا** (كما في الويب — انظر §13) | — | `success`, `player{name, avatarUrl, canHostRemote}`, `stats{totalMatches, winRate, survivalRate, longestWinStreak}`, `progression{rankTier, level, xp, nextLevelXP, xpProgress}`, `activeGame{gameName, roomId, phase, isAlive} \| null` |
| 2 | GET | `/api/player-app/{playerId}/following-feed` | Bearer | — | `success`, `feed[{playerId, playerName, playerInfo?{name, avatarUrl}, matchDate, type?}]` |
| 3 | GET | `/api/player-app/activities/upcoming?playerId={id}` | بلا | query: `playerId` | `success`, `activities[{id, name, description?, date, difficulty('easy'\|'medium'\|'hard'\|'expert'), locationName?, locationMapUrl?, locationOffers?[{name?, title?, price?, description?}], bookedCount, maxPlayers?, basePrice?(string)}]` |
| 4 | GET | `/api/player-app/my-active-rooms` | Bearer | — | `success`, `rooms[{activityId, activityName, rooms[{sessionId, sessionCode, sessionName?, maxPlayers}]}]` (مصفوفة خارجية لكل نشاط، داخلية لكل غرفة) |
| 5 | GET | `/api/fnb/context` | Bearer | — | `success`, `context{locationName, activityName, …} \| null` (بقية الحقول تخص 17-order-fnb.md) |

ملاحظات:
- في الويب يُقرأ توكن نداء #4 من `mafia_player_token` مباشرة ونداء #2 من الـ context — **نفس القيمة**؛ في Flutter وحّد المصدر (مستودع الجلسة من 05-session-auth.md).
- نداءات الإشعارات (`/api/player-notifications*`, `/api/push/vapid-public-key`) تخص 19-notifications-inbox.md و06-push-notifications.md.
- **لا تخترع endpoints** — لا يوجد نداء «حجز» من هذه الشاشة؛ «احجز الآن 🎟️» مجرد تنقل.

### 7.2 Socket (الطبقة في 04-socket-layer.md)

| الحدث | الاتجاه | الحمولة | متى يُطلق |
|---|---|---|---|
| `room:player-exit` | **إرسال** (مع ack) | `{roomId: <activeGame.roomId>, playerId: <player.playerId>}` | ضغط «🚪 مغادرة» على بطاقة اللعبة النشطة (متاح فقط عند الموت أو GAME_OVER). ack: `{success: bool}` — النجاح يصفّر `activeGame` محلياً. مهلة/قطع احتياطي 3s. |

**لا مستمعات `.on` في هذه الشاشة إطلاقاً.**

## 8. نماذج Dart المطلوبة

```dart
// استجابة #1
class HomeProfile {
  final HomePlayer player;
  final HomeStats stats;
  final HomeProgression progression;
  ActiveGameInfo? activeGame;          // قابل للتصفير محلياً بعد المغادرة
}

class HomePlayer {
  final String name;                   // احتياطي العرض: 'لاعب'
  final String? avatarUrl;
  final bool canHostRemote;            // علم DB: can_host_remote
}

class HomeStats {
  final int totalMatches;              // كلها احتياطي 0
  final num winRate;                   // نسبة مئوية جاهزة
  final num survivalRate;
  final int longestWinStreak;
}

class HomeProgression {
  final String rankTier;               // INFORMANT|SOLDIER|CAPO|UNDERBOSS|GODFATHER
  final int level;                     // احتياطي 1
  final int xp;                        // احتياطي 0
  final int nextLevelXP;               // احتياطي 500
  final num xpProgress;                // 0–100 (نسبة جاهزة من الخادم)
}

class ActiveGameInfo {
  final String roomId;
  final String gameName;
  final String phase;                  // 'GAME_OVER' هي المعنية هنا
  final bool isAlive;
  bool get isDead => isAlive == false;
  bool get isOver => phase == 'GAME_OVER';
  bool get canLeave => isDead || isOver;
}

// استجابة #4
class ActiveRoomsEntry {
  final String activityId;
  final String activityName;
  final List<ActiveRoomSummary> rooms;
}

class ActiveRoomSummary {
  final String sessionId;
  final String sessionCode;
  final String? sessionName;           // احتياطي العرض: 'غرفة {i+1}'
  final int maxPlayers;
}

// استجابة #3
class UpcomingActivity {
  final String id;
  final String name;
  final String? description;
  final DateTime date;
  final String difficulty;             // جهالة → عاملها medium عند العرض
  final String? locationName;
  final String? locationMapUrl;
  final List<LocationOffer> locationOffers;   // [] إن غابت أو لم تكن مصفوفة
  final int bookedCount;
  final int? maxPlayers;               // احتياطي العرض: 20
  final String? basePrice;             // string! — أخفِ الصف عند null/''/'0'
}

class LocationOffer {
  final String? name;
  final String? title;
  final String? price;
  final String? description;
}

// استجابة #2 + التجميع
class FollowingFeedItem {
  final String playerId;
  final String playerName;
  final FeedPlayerInfo? playerInfo;
  final DateTime? matchDate;
  final String? type;
}

class FeedPlayerInfo {
  final String name;
  final String? avatarUrl;
}

class GroupedFeedEntry {                // ناتج groupFeedBySession — §6.5
  final String playerId;
  final String playerName;
  final String? avatarUrl;
  int matchCount;
  final String dateKey;
  String description;
}

// استجابة #5
class FnbContext {
  final String locationName;
  final String activityName;
  // بقية الحقول في 17-order-fnb.md
}

// ثوابت العرض
class DifficultyMeta { final String label; final Color color; final String icon; }
// easy: (سهل, 0xFF22C55E, 🟢) | medium: (متوسط, 0xFFF59E0B, 🟡)
// hard: (صعب, 0xFFEF4444, 🔴) | expert: (خبير, 0xFFA855F7, 🟣)

// جداول الرتب (تُعرَّف مرة واحدة — تُستهلك أيضاً في 15-rank.md)
const rankNamesAr = {'INFORMANT':'مُخبر','SOLDIER':'جندي','CAPO':'كابو','UNDERBOSS':'أندربوس','GODFATHER':'الأب الروحي'};
const rankBadges  = {'INFORMANT':'🕵️','SOLDIER':'⚔️','CAPO':'🎖️','UNDERBOSS':'💎','GODFATHER':'👑'};
```

## 9. الحزم المستخدمة

| الحزمة | الاستخدام هنا |
|---|---|
| `flutter_riverpod` (أو إدارة الحالة المقررة في 01-foundation-theme.md) | HomeState + مزوّدات الأقسام |
| `go_router` | التنقلات الداخلية (`/player/join`, `/player/games`, `/player/order`, `/player/host`) |
| `dio` (عبر 03-networking-rest.md) | النداءات الخمسة |
| `socket_io_client` (عبر 04-socket-layer.md) | `room:player-exit` مع ack |
| `shared_preferences` (عبر 02-models-data-layer.md) | `mafia_wa_group_prompt_v1`, `push_banner_dismissed`, `mafia_session`, `mafia_user_exited` |
| `flutter_animate` | الظهور المتدرّج (fade+slide) بكل التأخيرات |
| `cached_network_image` | الصور الرمزية (البروفايل + الخلاصة) مع 🎭 احتياطاً |
| `url_launcher` | كل الروابط الخارجية بوضع `LaunchMode.externalApplication` |
| `intl` + `initializeDateFormatting('ar')` | صيغ التواريخ ar-JO الثلاث (§4.13، §4.14، §6.5) |
| `flutter_svg` | شعار واتساب (أصل §11) |

لا حاجة لأي حزمة قفل تمرير/سحب-إغلاق — `showModalBottomSheet` و`DraggableScrollableSheet` يغطيان كل ميكانيكا `useModalScrollLock`.

## 10. اختلافات Android / iOS

1. **PushBanner**: على iOS أول `requestPermission()` يعرض حوار النظام؛ على Android 13+ يعرض حوار إذن `POST_NOTIFICATIONS`. كلاهما عبر `firebase_messaging` (06-push-notifications.md). بانرا iOS الويبيان («أضِف إلى الشاشة الرئيسية» في PushBanner وداخل لوحة الجرس) **يسقطان على المنصتين** — لا وجود لمفهوم PWA في التطبيق.
2. **الروابط الخارجية**: `wa.me` و`chat.whatsapp.com` يفتحان تطبيق WhatsApp مباشرة على Android عبر intent، وعلى iOS عبر Universal Links — وكلاهما يسقط للمتصفح إن لم يكن مثبتاً. لا كود مخصص لكل منصة، لكن اختبر الحالتين.
3. **إيموجي الأيقونات**: خط الإيموجي يختلف (Noto Color Emoji مقابل Apple Color Emoji) — الأيقونات 🎭🔔🎯… ستبدو مختلفة قليلاً بين المنصتين؛ مقبول. نقاط الصعوبة 🟢🟡🔴🟣 يُفضَّل استبدالها بدوائر `Container` ملوّنة (8×8) لثبات المظهر.
4. **اختصارات الموظفين** (`/admin`, `/admin/reservations`, `/leader`, `/display`): تُفتح كواجهات ويب خارجية على المنصتين (متصفح خارجي أو WebView — قرار في 05-session-auth.md بسبب تمرير التوكن). على iOS يفضَّل `SFSafariViewController` (عبر `url_launcher` بوضع `inAppBrowserView`) وعلى Android Custom Tabs — سلوك متكافئ.

غير ذلك: **لا اختلافات** — الشاشة عرض بيانات وتنقلات فقط، بلا وصول لعتاد أو أذونات خاصة بمنصة.

## 11. الأصول المطلوبة

1. **`assets/icons/whatsapp.svg`** — شعار واتساب المستخدم 3 مرات (مودال المجموعة 34px أبيض، زر المجموعة 20px بلون `#25d366`، الـ FAB 28px أبيض). أنشئه من الـ path الحرفي في المصدر (viewBox `0 0 24 24`):
```
M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884
```
   (نسخة الـ FAB في المصدر تحمل جزءاً إضافياً للحلقة الخارجية `m8.413-18.297A11.815…` — استخدم النسخة الكاملة للـ FAB إن أردت التطابق التام، أو وحّدها.)
2. **لا صور أو أصوات أو Lottie** — كل الأيقونات الأخرى إيموجي نصي، والصور الشخصية من الشبكة.
3. الخط العربي: من 01-foundation-theme.md (مشترك).

## 12. معايير القبول — checklist تكافؤ مع النسخة الحالية

- [ ] التحميل: spinner عنبري 40px وحده حتى اكتمال النداءات الأربعة؛ بطاقة F&B قد تظهر لاحقاً دون وميض بقية الصفحة.
- [ ] مودال الواتساب يظهر مرة واحدة فقط لكل تثبيت، وكل مسارات إغلاقه الثلاثة («انضم الآن»، «لاحقاً»، نقر الخلفية) تمنعه نهائياً؛ «انضم الآن» يفتح رابط المجموعة خارجياً.
- [ ] صف الرأس: زرا «🎛️ لوحة التحكم» و«📋 متابعة الحجوزات» يظهران **فقط** لحساب مرتبط بموظف؛ الجرس يظهر دائماً بشارة تسقف عند «99+».
- [ ] لوحة الموظف: صف «غرفة العمليات» يظهر فقط للأدوار admin/manager/leader؛ ترجمة الدور (مدير/قائد/موظف) صحيحة؛ الأنيميشن المتدرّج 0.05/0.10/0.15s.
- [ ] PushBanner يختفي نهائياً بعد ✕ أو بعد نجاح التفعيل، ولا يظهر عندما الإذن granted/denied؛ نص الزر يتحول إلى «⏳» أثناء الطلب.
- [ ] بطاقة البروفايل: الاسم الاحتياطي «لاعب»، الرتبة الاحتياطية «🕵️ مُخبر • Lv.1»، شريط XP يتحرك من 0 إلى النسبة بتدرج عنبري→أحمر، والحد الأقصى الاحتياطي 500.
- [ ] الإحصاءات: 4 خلايا بالترتيب مباريات/فوز/نجاة/سلسلة بألوانها `#fbbf24`/`#22c55e`/`#3b82f6`/`#f97316` وكلها 0 عند الغياب.
- [ ] بطاقة اللعبة النشطة: ثيم أخضر أثناء الجريان وأحمر عند الموت/النهاية؛ النصوص الثلاثة «🟢 لعبة نشطة»/«💀 تم إقصاؤك»/«🏁 اللعبة انتهت» حسب الحالة؛ «🚪 مغادرة» لا يظهر إلا عند canLeave.
- [ ] المغادرة ترسل `room:player-exit` بـ `{roomId, playerId}` وتخفي البطاقة عند `success` فقط، بمهلة 3 ثوان، وبلا أي رسالة خطأ.
- [ ] «العودة ←» يحذف `mafia_user_exited` فقط ثم ينتقل إلى `/player/join`.
- [ ] «🎯 ادخل» وصفوف لوح الاختيار تحذف `mafia_session` و`mafia_user_exited` **قبل** التنقل؛ غرفة واحدة = تنقل مباشر، أكثر = لوح «اختر غرفة».
- [ ] بطاقة F&B تظهر فقط عند وجود `context` وتنقل إلى `/player/order`؛ بطاقة الاستضافة فقط عند `canHostRemote` وتنقل إلى `/player/host`.
- [ ] الأنشطة القادمة: 3 كحد أقصى؛ pill الصعوبة بالألوان الأربعة والجهالة تسقط إلى «🟡 متوسط»؛ السعة باحتياطي 20؛ «عرض الكل ←» ينقل إلى `/player/games`.
- [ ] مودال النشاط: صف السعر يظهر فقط عندما `basePrice` ليست فارغة و≠ `'0'` وبرمز «₪»؛ كتلة العروض فقط عند مصفوفة غير فارغة؛ «📍 الموقع» فقط عند وجود `locationMapUrl`؛ «احجز الآن 🎟️» يغلق وينقل إلى `/player/games`؛ السحب للإغلاق يعمل فقط من قمة التمرير.
- [ ] الخلاصة: تجميع لاعب+يوم صحيح، الوصف «لعب يوم … — n لعبة/ألعاب» بمفرد/جمع صحيح، 8 صفوف كحد أقصى، الشارة «🎮 {n}» سماوية؛ الحالة الفارغة بنصها الحرفي.
- [ ] «تابعنا»: البطاقتان والزر بألوانها وروابطها الثلاثة تفتح خارجياً.
- [ ] FAB واتساب: 56px في الزاوية **اليسرى** فوق شريط التنقل، يفتح `wa.me/962793390966`.
- [ ] كل فشل API يمرّ بصمت (غياب القسم) — لا أي Snackbar/حوار خطأ في الشاشة.
- [ ] التواريخ الثلاثة (صف النشاط، مودال النشاط، وصف الخلاصة) بالعربية بصيغها الثلاث المختلفة.
- [ ] فئات الشاشات: 512dp سقفاً على compact، 640dp على medium مع شيتات مقيّدة، two-pane وحوارات موسّطة على expanded (§5).
- [ ] لا وجود لرابط «🔧 تشخيص الإشعارات» ولا لشارة 🎉 level_up ولا لبانرات تثبيت iOS.

## 13. ملاحظات أداء وأمان

- **أمان — endpoint البروفايل بلا مصادقة**: `GET /api/player/{playerId}/profile` يُستدعى في الويب بلا Bearer ويكشف الإحصاءات وحالة اللعبة لأي حامل playerId. في Flutter أرسل الـ Bearer دائماً (الخادم يقبله)، وسجّل ملاحظة backlog لتشديد الخادم — لا تعتمد على انعدام المصادقة كسلوك مقصود.
- **أمان — توكنات الموظف**: لا تخزّن `staffToken`/`leader_token` في shared_preferences؛ استخدم `flutter_secure_storage` (05-session-auth.md). تمرير التوكن لواجهات الويب في اختصارات الموظف عبر URL يجب أن يكون بقرار موثق (خطر تسريبه في سجلات/history) — القرار في 05-session-auth.md.
- **أمان — الحمولات**: `room:player-exit` يرسل playerId من الجلسة فقط؛ لا تسمح بتمرير معرفات من واجهة المستخدم.
- **أداء — التوازي**: النداءات الأربعة متوازية إلزاماً (`Future.wait`) وF&B خارجها؛ لا تسلسل النداءات — زمن الرسم الأول = أبطأ نداء من الأربعة فقط.
- **أداء — إعادة البناء**: قسّم الشاشة إلى مزوّدات مستقلة (profile/rooms/upcoming/feed/fnb) بحيث وصول F&B المتأخر أو تصفير activeGame يعيد بناء بطاقته فقط لا الصفحة.
- **أداء — الصور**: `CachedNetworkImage` للصور الرمزية (64px و32px) مع `memCacheHeight` مناسب؛ الخلاصة 8 عناصر والقوائم كلها قصيرة — عمود ثابت داخل `SingleChildScrollView` كافٍ، لا حاجة لـ builders كسولة.
- **أداء — الأنيميشن**: التدرّجات (stagger) على أقسام قليلة العناصر؛ لا تستخدم أنيميشن لا نهائي غير الـ spinner.
- **سلامة التدفق**: حذف مفاتيح `mafia_session`/`mafia_user_exited` يجب أن يكون **متزامناً ومؤكداً قبل** استدعاء التنقل (await على مستودع التخزين) — سباق هنا يعيد إنتاج علّة «الالتحاق بغرفة قديمة».
- **الـ socket**: عملية المغادرة لا تنشئ اتصالاً جديداً في Flutter (خلاف الويب) — استعمل المفرد؛ وتأكد من عدم تعليق ack بلا مهلة (3s).
- **الروابط الخارجية**: تحقق من نتيجة `launchUrl` وتجاهل الفشل بصمت (تكافؤ مع الويب)، لكن لا تدع الاستثناء يطفو.
