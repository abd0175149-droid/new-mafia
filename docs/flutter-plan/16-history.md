# سجل المباريات
> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

## 1. الهدف والنطاق

شاشة **سجل المباريات** (`/player/history`) هي السجل الكامل لكل مباريات اللاعب المسجَّلة، مرتّبة كما يعيدها السيرفر (الأحدث أولاً). يصل إليها اللاعب من **شاشة الملف الشخصي** (13-profile.md) — قسم «آخر المباريات» يعرض آخر 8 فقط، وزر/رابط يفتح هذه الشاشة لعرض السجل كاملاً؛ وزر الإغلاق (✕) يعود إلى الملف الشخصي (`/player/profile`).

النطاق يغطي:
- **قائمة بطاقات المباريات** (كل السجل دفعة واحدة — لا ترقيم صفحات، لا تحميل تدريجي على مستوى السيرفر).
- **مودال تفصيل نقاط المباراة** (`📊 تفصيل النقاط`): يُفتح بالنقر على أي بطاقة؛ يعرض الدور والفريق والنتيجة، شريط meta للنجاة، تفصيل XP سطراً سطراً، تفصيل RR سطراً سطراً، صندوق المجموع الكلي، وملاحظة الاتفاقية (deal) عند وجودها.
- **الحالات: التحميل، الخطأ/غياب الحساب، الحالة الفارغة**.

خارج النطاق (موثّق في ملفات أخرى): قسم «آخر المباريات» المصغّر داخل الملف الشخصي (13-profile.md)، مودال «آخر 5 مباريات» داخل بروفايل لاعب في شاشة الرتب (15-rank.md)، إعدادات التقدّم/الرتب (15-rank.md).

**حقيقة تكافؤ أساسية**: هذه الشاشة **REST بالكامل، بلا Socket، بلا polling، بلا refetch على visibility/focus** (بخلاف شاشة الرتب). تُجلب كل المباريات باستدعاء GET واحد ثم تُعرض القائمة كاملة. كل النصوص عربية، `RTL`، ثيم أسود داكن، لون تمييز كهرماني للترويسة و emerald/rose للفوز/الخسارة و amber/purple لبطاقتَي تفصيل XP/RR.

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

- `c:/Projects/new mafia/unified-mafia/frontend/src/app/player/history/page.tsx` (352 سطراً) — الشاشة كاملة: القائمة، المودال، `PointRow`، حل الجلسة، أنماط التجميد web-only. **المصدر الأساسي لهذا الملف؛ كل النصوص/الألوان/الأبعاد أدناه منقولة منه حرفياً.**
- `c:/Projects/new mafia/unified-mafia/frontend/src/lib/constants.ts` — `ROLE_NAMES` المرجعية (خريطة أسماء الأدوار؛ الشاشة تُعرّف نسختها المحلية `ROLE_NAMES_AR` المطابقة).
- الخلفية (عقد الـ API — تُقرأ عند الحاجة للتحقق): مسار `/api/player-app/:playerId/matches` في راوترات player-app بالـ backend؛ بنية `breakdown` (xp[]/rr[]/team/won/xpTotal/rrTotal) من منطق التقدّم (progression) في الخادم.

تقارير المصدر المعتمدة: `scratchpad/reports/rank-history.md` (قسم B: History page، وجدول الـ API الصف #11، وقسم Flutter Notes) و`scratchpad/sections/profile-rank-order.md` (القسم 4: سجل المباريات).

---

## 3. التبعيات على ملفات الخطة الأخرى

- **00-MASTER-PLAN.md** — الفهرس والتسلسل.
- **01-foundation-theme.md** — لوحة ألوان Tailwind (hex الدقيقة)، `WindowSizeClass` + `Dimens` (§5.1)، خريطة `ROLE_NAMES_AR`، قائمة أدوار المافيا، عائلات الخطوط (mono/tabular)، خلفية `#000000`.
- **02-models-data-layer.md** — نماذج `MatchDetails` و`MatchBreakdown` و`BreakdownLine` (تُعرَّف هنا §8 وتُشارَك مع 13-profile.md و15-rank.md — مصدر واحد).
- **03-networking-rest.md** — عميل REST، base URL، ترويسة `Authorization: Bearer`، فك JSON، تحويل الأخطاء.
- **05-session-auth.md** — مخزن الجلسة الموحّد (playerId + token)؛ هذه الشاشة في الويب تقرأ localStorage مباشرة (legacy) — في Flutter تستهلك المخزن الموحّد مثل بقية الشاشات.
- **08-deeplinks-routing.md** — تسجيل route `/player/history`، والانتقال منها/إليها.
- **11-shell-navigation.md** — نقطة الدخول من الملف الشخصي؛ سلوك «العودة» للملف الشخصي؛ الـ pull-to-refresh على مستوى القشرة (البديل عن الـ pull-to-refresh المخصص في `layout.tsx`).
- **13-profile.md** — نقطة الدخول (قسم «آخر المباريات» + زر فتح السجل)؛ يتشارك رندر `PointRow` وبنية `breakdown` واشتقاق الفوز/الفريق وخريطة `ROLE_NAMES_AR`؛ راجعه لتوحيد المنطق.
- **15-rank.md** — شقيقة تعرض آخر 5 مباريات داخل مودال البروفايل باشتقاق فوز/فريق مماثل؛ تشترك في نماذج البيانات والمنطق (لا تكرّر — أعِد الاستخدام).

---

## 4. الواجهة والتجربة تفصيلياً

### 4.0 ثوابت مشتركة للشاشة

**الاتجاه**: كامل الشاشة `RTL` (`Directionality(TextDirection.rtl)`؛ في الويب `dir="rtl"` صريح على الجذر وعلى الـ sheet). **جزيرتان LTR فيزيائيتان داخل المودال** (`text-left`): كتلة «النتيجة» في بطاقة معلومات المباراة، وأرقام النقاط (`font-mono`) — راجع §4.6.

**العمود**: قائمة المباريات داخل عمود مركزي بعرض أقصى **512dp** (`max-w-lg`)، حشوة **16dp** (`p-4`)، حشوة سفلية **80dp** (`pb-20`)، تباعد رأسي بين البطاقات **12dp** (`space-y-3`).

**خلفية**: أسود `#000000` (`bg-black`)، النص الافتراضي أبيض `#FFFFFF`.

**خريطة أسماء الأدوار `ROLE_NAMES_AR`** (منقولة حرفياً من الشاشة — مطابقة للمعرّفة في 01-foundation-theme.md؛ **مفتاح غير موجود → اعرض المفتاح الخام؛ مفتاح فارغ/غائب كلياً → «—»**):

```
GODFATHER: شيخ المافيا      SILENCER: قص المافيا       CHAMELEON: حرباية المافيا
MAFIA_REGULAR: مافيا عادي   SHERIFF: الشريف            DOCTOR: الطبيب
SNIPER: القناص              POLICEWOMAN: الشرطية       NURSE: الممرضة
MAYOR: العمدة               CITIZEN: مواطن صالح        WITCH: الساحرة
OLDER_BROTHER: الأخ الأكبر  YOUNGER_BROTHER: الأخ الأصغر
JESTER: المهرج              ASSASSIN: السفّاح
```

**قائمة أدوار المافيا** (لاشتقاق الفريق/الفوز على البطاقة وفي المودال عند غياب `breakdown`): `['GODFATHER','SILENCER','CHAMELEON','WITCH','OLDER_BROTHER','MAFIA_REGULAR']`.

**ألوان Tailwind المستخدمة في هذه الشاشة** (المرجع الكامل في 01-foundation-theme.md؛ الشفافية بلاحقة `/NN` = نسبة مئوية):
- amber-400 `#fbbf24`، amber-500 `#f59e0b`
- emerald-400 `#34d399`، emerald-500 `#10b981`
- rose-400 `#fb7185`، rose-500 `#f43f5e`
- red-400 `#f87171`، red-500 `#ef4444`
- cyan-400 `#22d3ee`، cyan-500 `#06b6d4`
- green-400 `#4ade80`، green-500 `#22c55e`
- purple-400 `#c084fc`، purple-500 `#a855f7`
- gray-300 `#d1d5db`، gray-400 `#9ca3af`، gray-500 `#6b7280`، gray-600 `#4b5563`، gray-900 `#111827`
- أبيض بشفافيات: `white/5 = rgba(255,255,255,0.05)`، `white/10 = 0.10`، `white/20 = 0.20`، `white/[0.03] = 0.03`
- أسود بشفافيات: `black/80 = rgba(0,0,0,0.80)`، `black/90 = 0.90`

**اشتقاق الفوز/الفريق (قاعدة تكافؤ حرجة — لا توحّدها)**:
- **على البطاقة (§4.5)**: `isMafia = MAFIA_ROLES.includes(role)`؛ `won = (isMafia && matchWinner==='MAFIA') || (!isMafia && matchWinner==='CITIZEN')`. **البطاقة لا تنظر إلى `breakdown` إطلاقاً** — تعتمد الدور فقط.
- **في المودال (§4.6)**: `isNeutral = breakdown?.team==='NEUTRAL'`؛ `isMafia = breakdown?.team ? breakdown.team==='MAFIA' : MAFIA_ROLES.includes(role)`؛ `won = breakdown ? breakdown.won : ((isMafia && matchWinner==='MAFIA') || (!isMafia && matchWinner==='CITIZEN'))`. **المودال يفضّل `breakdown` ثم يسقط للـ heuristic**.
- **نتيجة القاعدة**: للأدوار المحايدة (JESTER/ASSASSIN) قد **تختلف** نتيجة البطاقة عن نتيجة المودال (البطاقة تعاملها كمواطن؛ المودال يقرأ `breakdown.won` مباشرة). هذا سلوك مقصود في المصدر — **أبقِه كما هو للتكافؤ**.

---

### 4.1 حالة التحميل (Loading)

- شاشة سوداء كاملة (`min-h-screen bg-black`)، spinner مركزي (`flex items-center justify-center`).
- **Spinner**: دائرة **48×48dp** (`w-12 h-12`)، حد **4dp** لون `#f59e0b` (`border-4 border-amber-500`) مع الجزء العلوي شفاف (`border-t-transparent`)، زوايا دائرية كاملة.
- **الأنيميشن**: دوران 360° مستمر — **مدة الدورة 2000ms، منحنى linear، لا نهائي** (framer-motion `rotate:360`). في Flutter: `AnimationController(duration: 2s)..repeat()` يقود `RotationTransition`، أو `CircularProgressIndicator` مخصّص بنفس القطر والحد. (نفس spinner التحميل في 13-profile.md — أعِد الاستخدام.)

### 4.2 حالة الخطأ / غياب الحساب

- شاشة سوداء كاملة، كتلة نص مركزية، حشوة **32dp** (`p-8`)، محاذاة نص للوسط.
- **الرسالة**: نص `error` — لون `#fbbf24` (amber-400)، حجم **20sp** (`text-xl`)، وزن **700** (`font-bold`)، هامش سفلي **16dp** (`mb-4`).
- **الرسائل الممكنة (حرفياً)**:
  - «لم يتم العثور على الحساب» — عند غياب `playerId` في الجلسة (**بدون أي fetch**).
  - نص `data.error` من السيرفر، أو fallback «فشل في جلب السجل» — عند `success=false`.
  - «خطأ في الاتصال بالخادم» — عند استثناء الشبكة (`.catch`).
- **زر «العودة للبروفايل»**: حشوة **24×8dp** (`px-6 py-2`)، خلفية `#111827` (gray-900)، حد **1dp** `#f59e0b` بشفافية 30% (`border-amber-500/30`)، نص `#fbbf24` حجم **14sp** (`text-sm`)، زوايا **8dp** (`rounded-lg`)؛ عند الضغط (hover في الويب) خلفية `#f59e0b` بشفافية 10% (`hover:bg-amber-500/10`). **الوجهة**: `/player/profile` (عبر 08-deeplinks-routing.md).

### 4.3 الترويسة (Header) — لاصقة

- حاوية لاصقة أعلى الشاشة (`sticky top-0 z-40`)، خلفية `rgba(0,0,0,0.80)` (`bg-black/80`) مع **ضبابية خلفية** (`backdrop-blur-xl` — في Flutter `BackdropFilter(ImageFilter.blur(sigmaX:24, sigmaY:24))` أو لون صلب معتم بديل؛ راجع §10)، حد سفلي **1dp** `rgba(255,255,255,0.10)` (`border-b border-white/10`)، حشوة **16dp** أفقياً و**16dp** رأسياً (`px-4 py-4`)، توزيع `flex items-center justify-between`.
- **العنوان**: «📜 سجل المباريات» — حجم **20sp** (`text-xl`)، وزن **900** (`font-black`)، لون `#fbbf24` (amber-400).
- **زر الإغلاق ✕**: دائرة **32×32dp** (`w-8 h-8 rounded-full`)، خلفية `white/5`، حد **1dp** `white/10`، محتوى الرمز «✕» مزاح للأعلى **1px** (`translate-y-[-1px]`)؛ عند الضغط خلفية `white/10`. **الوجهة**: `/player/profile`.
- **ملاحظة تكافؤ**: الترويسة لاصقة فوق قائمة قابلة للتمرير — في Flutter استخدم `SliverAppBar(pinned:true, floating:false)` أو `Column` ثابت + `Expanded(ListView)`؛ احترم `SafeArea` العلوية (شريط الحالة) — راجع §10.

### 4.4 الحالة الفارغة (Empty)

- تظهر عندما `matches.length === 0` (بعد نجاح الجلب وإرجاع مصفوفة فارغة).
- توسيط عمودي، حشوة رأسية **80dp** (`py-20`).
- الأيقونة: «🎮» حجم **≈48sp** (`text-5xl`)، معروضة block بهامش سفلي **16dp** (`mb-4`).
- النص: «لا يوجد مباريات مسجلة بعد!» — لون `#9ca3af` (gray-400)، وزن **700** (`font-bold`).

### 4.5 بطاقة المباراة (عنصر القائمة)

كل عنصر بطاقة قابلة للنقر تفتح المودال (§4.6). الحاوية: `relative overflow-hidden rounded-xl p-4 border cursor-pointer`، انتقال hover تكبير **1.01×** (`hover:scale-[1.01]` — في Flutter اختياري: تأثير ضغط `InkWell`/`scale` خفيف).

**التلوين حسب النتيجة** (اشتقاق البطاقة، §4.0):
- **فوز**: خلفية `bg-emerald-500/5` = `rgba(16,185,129,0.05)`، حد `border-emerald-500/20` = `rgba(16,185,129,0.20)`.
- **خسارة**: خلفية `bg-rose-500/5` = `rgba(244,63,94,0.05)`، حد `border-rose-500/20` = `rgba(244,63,94,0.20)`.

**توهج زخرفي (blob)**: عنصر مطلق في الزاوية العلوية-اليمنى (`absolute top-0 right-0`)، مقاس **128×128dp** (`w-32 h-32`)، ضبابية **40px** (`blur-[40px]`)، شفافية **20%** (`opacity-20`)، لون `bg-emerald-500` (#10b981) للفوز أو `bg-rose-500` (#f43f5e) للخسارة. في Flutter: `Positioned` + `Container` بلون + `ImageFiltered(blur 40)` داخل `ClipRRect` (البطاقة `overflow-hidden`)، أو تدرّج شعاعي مبسّط.

**الصف العلوي** (`relative z-10 flex justify-between items-start mb-3`):
- يمين (المحتوى): 
  - اسم اللعبة: `h3` وزن **700**، أبيض، هامش سفلي **4dp** (`mb-1`)؛ fallback «مباراة مافيا» عند غياب `gameName`.
  - السطر الفرعي: «{dateStr} • ⏱️ {dur}» — حجم **12sp** (`text-xs`)، لون `#6b7280` (gray-500).
    - `dateStr` = «{يوم}/{شهر}/{سنة}» ميلادي بأرقام غربية (انظر §6)؛ «—» عند غياب `matchDate`.
    - `dur` = «{دقائق}:{ثوانٍ بخانتين}» (مثال «7:05»)؛ «—» عند غياب/صفر `durationSeconds`.
- يسار (chip النتيجة): حشوة **12×4dp** (`px-3 py-1`)، زوايا **8dp** (`rounded-lg`)، حجم **12sp** وزن **700**، حد 1dp:
  - فوز: `bg-emerald-500/10 text-emerald-400 border-emerald-500/20` — النص «🏆 فوز».
  - خسارة: `bg-rose-500/10 text-rose-400 border-rose-500/20` — النص «💀 خسارة».

**الصف السفلي** (`relative z-10 flex items-center justify-between border-t border-white/5 pt-3` — خط علوي فاصل `rgba(255,255,255,0.05)`، حشوة علوية 12dp):
- يمين (الفريق + الدور، `flex items-center gap-2`):
  - **chip الفريق**: حجم **10sp** (`text-[10px]`)، حشوة **8×4dp** (`px-2 py-1`)، زوايا `rounded`، حد 1dp:
    - مافيا (`isMafia`): `bg-red-500/10 border-red-500/20 text-red-400` — النص «مافيا».
    - غير مافيا (يشمل الأدوار المحايدة على البطاقة): `bg-cyan-500/10 border-cyan-500/20 text-cyan-400` — النص «مواطن».
  - **اسم الدور**: حجم **14sp** (`text-sm`)، وزن **700**، لون `#d1d5db` (gray-300)؛ القيمة `ROLE_NAMES_AR[role]` وإلا `role` الخام وإلا «—».
- يسار (النقاط، `flex items-center gap-3`):
  - **XP**: «+{xpEarned} XP» — حجم **14sp**، وزن **700**، لون `#fbbf24` (amber-400). **البادئة «+» حرفية دائماً** (راجع §6 حالات حدّية).
  - **RR**: «{علامة}{rrChange} RR» — حجم **14sp**، وزن **700**؛ لون `#4ade80` (green-400) إذا `rrChange >= 0` وإلا `#f87171` (red-400)؛ البادئة «+» تُضاف فقط عندما `rrChange >= 0` (السالب تحمل علامته من الرقم).

**أنيميشن الدخول**: لكل بطاقة `initial{opacity:0, y:10} → animate{opacity:1, y:0}` بتأخير **`0.05 × index` ثانية** (staggered). في Flutter: `flutter_animate` `.fadeIn().slideY(begin: 0.1, duration: ~300ms)` مع `delay: (50 * index).ms`. **تحذير تكافؤ/أداء**: التأخير خطّي بلا سقف — قائمة 50 مباراة تعطي آخر بطاقة تأخيراً 2.5s. **قرار Flutter**: طبّق السقف على أول ~10–15 عنصراً مرئياً فقط (عناصر `ListView.builder` تُبنى كسلاً؛ لا تُشغّل stagger لعناصر خارج الشاشة) — راجع §13.

### 4.6 مودال تفصيل النقاط («📊 تفصيل النقاط»)

يُفتح بالنقر على أي بطاقة (`selectedMatch = m`). يغطّي محتوى المباراة المختارة.

**الـ backdrop**: `fixed inset-0 z-50`، خلفية `rgba(0,0,0,0.90)` (`bg-black/90`) مع ضبابية `backdrop-blur-md` (في Flutter `BackdropFilter blur ~12` أو لون صلب معتم)؛ توزيع `flex items-end sm:items-center justify-center sm:p-4` — **على الموبايل (< 640dp عرضاً) bottom-sheet ملتصق بالأسفل؛ على ≥640dp dialog مركزي** بحشوة 16dp. أنيميشن الظهور: `opacity 0→1` (وexit `1→0`). النقر على الـ backdrop يغلق المودال.

**الـ sheet/dialog**: 
- خلفية تدرّج `bg-gradient-to-b from-gray-900 to-black` = `linear-gradient(180deg, #111827, #000000)`.
- حد: على الموبايل حد علوي فقط `border-t border-white/10`؛ على `sm:` حد كامل (`sm:border`).
- زوايا: `rounded-t-3xl` (علوية 24dp) على الموبايل؛ `sm:rounded-2xl` (16dp كل الزوايا) على ≥640dp.
- المقاس: `w-full max-w-md` (عرض أقصى **448dp**)، ارتفاع أقصى **90%** من الشاشة (`max-h-[90vh]`)، تمرير عمودي داخلي (`overflow-y-auto`)، حشوة **20dp** (`p-5`).
- الظل: `shadow-[0_-10px_40px_rgba(0,0,0,0.5)]`.
- `overscrollBehavior: contain`.
- **أنيميشن الظهور**: انزلاق من الأسفل `y:'100%' → 0` (وexit `→ '100%'`) بنبرة **spring: damping 25، stiffness 200**. في Flutter: `showModalBottomSheet(isScrollControlled:true)` + `DraggableScrollableSheet` (يوفّر الانزلاق والتمرير والسحب-للإغلاق مجاناً)؛ على الشاشات العريضة (≥640dp) بدّل إلى `showGeneralDialog` بمظهر dialog مركزي (راجع §5).
- **المقبض (grab handle)**: شريط **48×6dp** (`w-12 h-1.5`)، زوايا كاملة، لون `rgba(255,255,255,0.20)` (`bg-white/20`)، متمركز، هامش سفلي **12dp** (`mb-3`).

**ترويسة المودال** (`flex justify-between items-center mb-4`):
- العنوان: «📊 تفصيل النقاط» — حجم **18sp** (`text-lg`)، وزن **900** (`font-black`)، أبيض.
- زر ✕: دائرة **32×32dp**، `bg-white/5 border border-white/10`، نص `#9ca3af` (gray-400) يتحول أبيض عند الضغط (`hover:text-white`).

**المحتوى** (`space-y-4` — تباعد 16dp بين البطاقات) بالترتيب:

#### (أ) بطاقة معلومات المباراة
`rounded-xl p-4 border`؛ ملوّنة بالنتيجة (اشتقاق المودال §4.0): فوز `bg-emerald-500/5 border-emerald-500/15`، خسارة `bg-rose-500/5 border-rose-500/15`.
- صف علوي `flex justify-between items-center`:
  - يمين:
    - تسمية «الدور» — حجم **10sp** (`text-[10px]`)، لون `#6b7280`، هامش سفلي **2dp** (`mb-0.5`).
    - اسم الدور: `ROLE_NAMES_AR[role]` وإلا `role` — وزن **700**، لون `#fbbf24` (amber-400)، حجم **14sp** (`text-sm`).
    - chip الفريق: حجم **9sp** (`text-[9px]`)، حشوة **8×2dp** (`px-2 py-0.5`)، زوايا `rounded`، هامش علوي **4dp** (`mt-1`)، `inline-block`:
      - محايد (`isNeutral`): `bg-purple-500/10 text-purple-400` — النص «دور محايد».
      - مافيا: `bg-red-500/10 text-red-400` — النص «فريق المافيا».
      - مواطنون: `bg-cyan-500/10 text-cyan-400` — النص «فريق المواطنين».
  - يسار (`text-left` — **جزيرة LTR**):
    - تسمية «النتيجة» — 10sp، `#6b7280`، `mb-0.5`.
    - النتيجة: وزن **900** (`font-black`)، حجم **18sp** (`text-lg`)؛ فوز `text-emerald-400` والنص «🏆 فوز»، خسارة `text-rose-400` والنص «💀 خسارة».
- **شريط meta** (`flex justify-between mt-3 pt-2 border-t border-white/5 text-[10px] text-gray-500` — خط علوي فاصل، حجم 10sp لون gray-500):
  - يمين: «🛡️ {نص النجاة}» حيث:
    - `survivedToEnd == true` → «🛡️ نجا للنهاية».
    - وإلا → «🛡️ أُقصي {ليلاً إن `eliminatedDuring==='NIGHT'` وإلا نهاراً} (جولة {`eliminatedAtRound` وإلا `?`})». مثال: «🛡️ أُقصي ليلاً (جولة 3)»، «🛡️ أُقصي نهاراً (جولة ?)».
  - يسار: «📊 {roundsSurvived} جولات» (يُعرض دائماً).

#### (ب) بطاقة تفصيل XP
`bg-amber-500/[0.03] border border-amber-500/10 rounded-xl p-4`:
- العنوان: «⭐ تفصيل نقاط الخبرة (XP)» — حجم **14sp** (`text-sm`)، وزن **700**، لون `#fbbf24`، هامش سفلي **8dp** (`mb-2`).
- القائمة (`space-y-0.5`): 
  - إن كان `breakdown` موجوداً و`breakdown.xp.length > 0` → صف `PointRow` لكل عنصر (type='xp'، انظر §4.7). **اعرض البنود كما تصل بما فيها بند التسوية من السيرفر** (لتطابق المجموع).
  - وإلا → نص فارغ «لا نقاط خبرة» — حجم **10sp**، لون `#4b5563` (gray-600)، متمركز، حشوة رأسية **8dp** (`py-2`).
- صف المجموع (`mt-3 pt-2 border-t border-amber-500/15`): «المجموع» (حجم 12sp، وزن 700، `#d1d5db`) مقابل «+{xpEarned} XP» (حجم **18sp** `text-lg`، وزن **900**، لون `#fbbf24`، خط **mono**). **البادئة «+» حرفية دائماً**.

#### (ج) بطاقة تفصيل RR
`bg-purple-500/[0.03] border border-purple-500/10 rounded-xl p-4`:
- العنوان: «🏆 تفصيل نقاط الرتبة (RR)» — 14sp، وزن 700، لون `#c084fc` (purple-400)، `mb-2`. **(لاحظ الأيقونة 🏆 وليس 🏅.)**
- القائمة: صف `PointRow` لكل عنصر من `breakdown.rr` (type='rr')؛ إن كانت فارغة → «لا تغيّر في الرتبة» (10sp، `#4b5563`، متمركز، `py-2`).
- صف المجموع (`mt-3 pt-2 border-t border-purple-500/15`): «المجموع» مقابل «{علامة}{rrChange} RR» — 18sp، وزن 900، خط mono؛ لون `#4ade80` إذا `rrChange >= 0` وإلا `#f87171`؛ بادئة «+» فقط عند `>= 0`.

#### (د) صندوق المجموع الكلي (Total Rewards)
`bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 rounded-2xl p-5 flex justify-around items-center relative overflow-hidden`:
- طبقة توهج: `absolute inset-0 bg-amber-500/5 blur-xl rounded-full` (وميض كهرماني مضبّب خلف المحتوى).
- عمود XP (متمركز، `relative z-10`):
  - تسمية «TOTAL XP» — حجم **10sp**، لون `rgba(245,158,11,0.70)` (`text-amber-500/70`)، uppercase، تباعد أحرف واسع (`tracking-widest`)، هامش سفلي **4dp**، وزن 700.
  - القيمة «+{xpEarned}» — حجم **≈30sp** (`text-3xl`)، وزن **900**، لون `#fbbf24`، ظل `drop-shadow-md`.
- الفاصل العمودي: عرض **1px** ارتفاع **48dp** (`w-px h-12`)، تدرّج `bg-gradient-to-b from-transparent via-amber-500/30 to-transparent`.
- عمود RR (متمركز):
  - تسمية «TOTAL RR» — نفس نمط تسمية XP.
  - القيمة «{علامة}{rrChange}» — 30sp، وزن 900، `drop-shadow-md`؛ لون `#4ade80` إذا `>= 0` وإلا `#f87171`؛ بادئة «+» عند `>= 0`.

#### (هـ) ملاحظة الاتفاقية (Deal) — شرطية
تظهر **فقط إذا `dealInitiated == true`**. `rounded-xl p-3 border text-[10px]`:
- نجاح (`dealSuccess` صحيح/truthy): `bg-green-500/5 border-green-500/15 text-green-400` — النص الحرفي:
  «✅ الاتفاقية ناجحة — صوّت عليها الأغلبية وكان الهدف مافيا».
- فشل (`dealSuccess` غير صحيح): `bg-red-500/5 border-red-500/15 text-red-400` — النص الحرفي:
  «❌ الاتفاقية فاشلة — الهدف كان مواطناً (تمت معاقبة المبادر)».

#### (و) زر الإغلاق
`w-full py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-white font-bold active:scale-[0.98]`؛ النص «إغلاق»؛ عند الضغط تصغير **0.98×** (`active:scale-[0.98]`). يغلق المودال.

**طرق الإغلاق** (ثلاث): النقر على الـ backdrop، زر ✕ في الترويسة، زر «إغلاق». **لا يوجد سحب-للإغلاق في الويب هنا** (بخلاف مودال بروفايل الرتب) — لكن في Flutter مع `DraggableScrollableSheet` يأتي السحب-للإغلاق مجاناً وهو تحسين مقبول (لا يكسر التكافؤ).

### 4.7 مكوّن `PointRow` (صف نقاط واحد)

يُستخدم داخل بطاقتَي XP وRR. المدخلات: `icon` (emoji نص)، `label` (نص عربي)، `value` (رقم)، `type` ('xp' | 'rr').
- **`value === 0` → لا يُرسم شيء (null)** (إخفاء الصفوف الصفرية).
- الحاوية: `flex justify-between items-center py-1.5 border-b border-white/[0.03] last:border-b-0` (خط سفلي فاصل خفيف جداً `rgba(255,255,255,0.03)`، آخر صف بلا خط).
- يمين (`flex items-center gap-2 text-[11px] text-gray-300`): أيقونة داخل `span` حجم **14sp** (`text-sm`) عرض **20dp** (`w-5`) متمركزة، ثم التسمية (11sp، `#d1d5db`).
- يسار (`text-[11px] font-bold font-mono`): «{بادئة}{value}{لاحقة}» — حجم **11sp**، وزن **700**، خط **mono**:
  - `isPositive = value > 0`؛ اللون `#4ade80` (green-400) إذا موجب وإلا `#f87171` (red-400).
  - البادئة «+» إذا موجب، وإلا لا بادئة (السالب يحمل علامته).
  - اللاحقة « XP» إذا type='xp' وإلا « RR» (لاحظ المسافة قبل الوحدة).

---

## 5. التكيّف مع الشاشات 6→11 إنش

الاستراتيجية الكاملة (Window Size Classes + توكنات `Dimens`) موثّقة في **01-foundation-theme.md §5.1**. تخصيص هذه الشاشة:

### compact (أقل من 600dp) — هواتف 6–7 إنش
- **عمود واحد كما في الـ PWA حرفياً**: قائمة البطاقات داخل عمود مركزي بعرض أقصى **512dp** (`max-w-lg`؛ عملياً أقل من عرض الهاتف فلا يظهر السقف)، حشوة أفقية 16dp، سفلية 80dp، تباعد 12dp.
- المودال: **bottom-sheet** ملتصق بالأسفل، عرض `w-full` بسقف **448dp** (`max-w-md`)، ارتفاع أقصى 90%، زوايا علوية 24dp، مقبض سحب. (على هاتف أعرض من 448dp نادراً — يبقى 448 متمركزاً.)
- أحجام الخطوط والأبعاد كلها كما في §4 دون تعديل.

### medium (600–840dp) — تابلت 8 إنش
- سقف عرض عمود القائمة يرتفع إلى **640dp** (`contentMaxWidth` medium) متمركزاً؛ البطاقات تتمدد لهذا السقف (سطر معلوماتي، لا شبكة). حشوة الصفحة 24dp (`pagePadding` medium).
- **المودال يتحول إلى dialog مركزي عند العرض ≥ 640dp** (مطابقة نقطة كسر Tailwind `sm` = 640px، وهي داخل فئة medium): حد كامل، زوايا 16dp (`rounded-2xl`)، حشوة backdrop 16dp، عرض أقصى **448dp** (`dialogMaxWidth`)، متمركز عمودياً وأفقياً. **بين 600–640dp يبقى المودال bottom-sheet** — طبّق التبديل على عتبة العرض الفعلي 640dp لا على حد الفئة 600dp.
- لا two-pane.

### expanded (أكبر من 840dp) — تابلت 10–11 إنش
- سقف الصفحة كلها **960dp** (`pageMaxWidth` expanded) متمركز؛ ما وراءه هوامش سوداء `#050505`. عمود القائمة يرتفع إلى **720dp** (`contentMaxWidth` expanded) متمركزاً. حشوة الصفحة 32dp.
- الترويسة اللاصقة تمتد بعرض الشاشة الفيزيائي الكامل (خلفية/ضبابية تغطي الحافة)، بينما عنوانها وزر ✕ يتمركزان مع عمود المحتوى (960dp).
- المودال يبقى **dialog مركزياً بعرض أقصى 448dp** — **لا يتمدد** لعرض التابلت (قاعدة «الحوارات لا تتبع عرض الشاشة»، 01-foundation-theme.md §5.2/5). ملاحظة: توكن `dialogMaxWidth` يسمح بـ 512 على expanded، لكن الويب يستخدم `max-w-md`=448 دائماً — **أبقِ 448 للتطابق الحرفي**.
- **بطاقات المباراة محتوى معلوماتي لا عناصر لعب حسّاسة** → **لا يُطبَّق `gameScale`**؛ أحجام الخطوط والأبعاد تبقى كما هي (تكبيرها يشوّه الكثافة المعلوماتية).
- **افتراضي: عمود واحد** (لا two-pane) — التفصيل يبقى مودالاً/حواراً كما في المصدر. (تحسين اختياري غير ملزم: على expanded يمكن جعل التفصيل لوحة ثابتة يمين القائمة master-detail، لكن الافتراضي للتكافؤ هو الحوار المنبثق.)

---

## 6. المنطق والتدفقات

### 6.1 آلة الحالة العامة

```
[دخول الشاشة]
  ├─ حل playerId من الجلسة (05-session-auth.md):
  │     newAuth = mafia_player_auth.playerId  →  إن غاب: mafia_playerId (legacy)
  │  ├─ لا playerId → error("لم يتم العثور على الحساب")  [بدون أي fetch]  → حالة الخطأ §4.2
  │  └─ يوجد playerId → loading  → حالة التحميل §4.1
  │        GET /api/player-app/{playerId}/matches (Bearer)
  │        ├─ success=true            → ready(matches = data.matches)
  │        │      ├─ matches.length==0 → الحالة الفارغة §4.4
  │        │      └─ غير ذلك          → قائمة البطاقات §4.5
  │        ├─ success=false           → error(data.error || "فشل في جلب السجل")
  │        └─ استثناء شبكة (.catch)    → error("خطأ في الاتصال بالخادم")
  └─ في كل الحالات النهائية: loading = false
```

الحالة الفرعية الوحيدة داخل ready: `selectedMatch` (كائن `MatchDetails` أو null) — يقود فتح/إغلاق المودال §4.6. لا حالات تحرير، لا مؤقتات مؤجَّلة، لا polling.

### 6.2 التحميل وإعادة الجلب
- **الجلب مرة واحدة** عند دخول الشاشة (مكافئ `useEffect` mount في Next). **لا ترقيم، لا تحميل تدريجي، لا refetch على visibility/focus، لا polling** — الشاشة تجلب كل المباريات دفعة واحدة وتعرضها.
- في Flutter مع bottom nav يحافظ على الحالة: أعد الجلب عند كل **عودة/دخول للشاشة** (`didPush`/`RouteAware.didPopNext` عبر 08-deeplinks-routing.md/11-shell-navigation.md) لمحاكاة سلوك الـ mount الجديد.
- **الـ pull-to-refresh**: الويب يملك pull-to-refresh مخصصاً على مستوى `layout.tsx` (يُعطَّل أثناء فتح المودال عبر class `modal-open`). في Flutter: قدّم `RefreshIndicator` يلفّ القائمة ويعيد استدعاء نفس الجلب (تكافؤ مقبول لسلوك القشرة، 11-shell-navigation.md)؛ عطّله بينما المودال مفتوح.
- **إعادة الاتصال**: لا آلية retry تلقائية؛ فشل الجلب الأولي = شاشة الخطأ مع زر «العودة للبروفايل». **لا استعادة جزئية** (الشاشة إمّا قائمة كاملة أو خطأ).
- **استعادة الحالة بعد قتل العملية (Android)**: إعادة جلب كاملة عند العودة؛ لا حالة تحرير تُفقد (لا يوجد تحرير هنا). المودال المفتوح لا يُستعاد (تكافؤ مقبول — يُغلق).

### 6.3 المؤقتات والمهل
| المؤقت | المدة | ملاحظة |
|---|---|---|
| دورة spinner التحميل | 2000ms/دورة، linear، لا نهائي | §4.1 |
| أنيميشن دخول البطاقة | تأخير `50ms × index` (خطّي، بلا سقف في الويب) | طبّق سقفاً في Flutter §4.5/§13 |
| أنيميشن انزلاق المودال | spring (damping 25، stiffness 200) | §4.6 |
| ظهور/اختفاء الـ backdrop | fade (opacity 0↔1) | §4.6 |

**لا توجد أي `setInterval`/`setTimeout` منطقية في هذه الشاشة** (بخلاف شاشة الرتب).

### 6.4 اشتقاقات العرض (حرفية)
- **المدة**: `durationSeconds ? "${floor(s/60)}:${(s%60) بخانتين}" : "—"`. أرقام **غربية** (لا عربية-هندية). مثال 425 ثانية → «7:05».
- **التاريخ (على البطاقة)**: من `new Date(matchDate)` عبر `getDate()`/`getMonth()+1`/`getFullYear()` → «{يوم}/{شهر}/{سنة}» **ميلادي بأرقام غربية**، غياب `matchDate` → «—». **مهم**: هذا **ليس** `toLocaleDateString('ar-...')` (بخلاف مودال بروفايل الرتب في 15-rank.md الذي يستخدم `ar-JO` شهر مختصر) — البطاقة تستخدم أرقاماً غربية وميلادياً خام. في Flutter: `'${dt.day}/${dt.month}/${dt.year}'` بأرقام لاتينية (لا `intl` Arabic locale هنا) للحفاظ على التطابق.
- **نص النجاة/الإقصاء**: كما في §4.6(أ) — `NIGHT`→«ليلاً»، غير ذلك→«نهاراً»؛ `eliminatedAtRound` غائب→«?».

### 6.5 حالات حدّية إلزامية
- **`playerId` غائب** → «لم يتم العثور على الحساب» فوراً بلا fetch.
- **`token` غائب** → تُرسل الطلبات بلا ترويسة `Authorization` (الويب يبني `{}` عند غياب التوكن)؛ السيرفر قد يرفض → حالة خطأ حسب استجابته.
- **`matches` مصفوفة فارغة** → الحالة الفارغة §4.4 (وليست خطأ).
- **`gameName` غائب** → «مباراة مافيا».
- **`role` غير معروف في `ROLE_NAMES_AR`** → اعرض `role` الخام؛ غائب كلياً → «—» (على البطاقة فقط؛ في المودال يعرض `role` الخام دون «—»).
- **`breakdown` غائب** → البطاقة تشتق الفوز/الفريق من الدور؛ المودال يعرض «لا نقاط خبرة» و«لا تغيّر في الرتبة» ويشتق الفوز/الفريق من الدور (لا neutral chip يظهر لأن `isNeutral` تحتاج `breakdown.team`).
- **الأدوار المحايدة (JESTER/ASSASSIN)**: البطاقة تعاملها كمواطن (chip «مواطن»، اشتقاق فوز = winner CITIZEN)؛ المودال (مع `breakdown`) يعرض «دور محايد» ويقرأ `breakdown.won` — **قد تختلف نتيجة البطاقة عن المودال؛ هذا مقصود، أبقِه**.
- **`xpEarned` سالب (نظرياً)** → يُعرض «+{سالب}» (البادئة «+» حرفية دائماً؛ افتراض العقد أن المجموع غير سالب). لا تُصلحه — تطابق حرفي.
- **`rrChange == 0`** → «+0 RR» بلون أخضر (green-400) على البطاقة وفي المجاميع (`>= 0`).
- **سطر تفصيل بقيمة 0** → يُخفى (`PointRow` يعيد null). قوائم تفصيل فارغة → نصا الفراغ. **بنود التفصيل قد تتضمن بند تسوية من السيرفر ليطابق المجموعُ الإجماليَّ — اعرضها كما تصل**.
- **`durationSeconds == 0` أو غائب** → «—».
- **`eliminatedDuring == null` مع `survivedToEnd == false`** → «أُقصي نهاراً (جولة {round||?})».

---

## 7. عقود التكامل

كل الطلبات عبر عميل REST (03-networking-rest.md) مع ترويسة `Authorization: Bearer <token>` عند توفر التوكن (وإلا بلا ترويسة). **Socket: لا شيء إطلاقاً في هذه الشاشة.**

### 7.1 REST

**`GET /api/player-app/{playerId}/matches`** — Bearer.
- **Request**: لا جسم، لا معاملات query (**لا ترقيم/limit/offset**). `playerId` في المسار (من الجلسة).
- **Response (نجاح)**: `{ "success": true, "matches": MatchDetails[] }` (المصفوفة مرتّبة الأحدث أولاً كما يعيدها السيرفر).
- **Response (فشل منطقي)**: `{ "success": false, "error": "<نص عربي>" }` → يُعرض `error` أو fallback «فشل في جلب السجل».
- **حقول `MatchDetails`** (كل الحقول تصل؛ المعروضة حالياً مؤشَّرة):

| الحقل | النوع | يُعرض؟ | أين |
|---|---|---|---|
| `matchId` | int | (مفتاح) | key القائمة |
| `gameName` | string | ✓ | عنوان البطاقة |
| `matchDate` | string (ISO) | ✓ | تاريخ البطاقة |
| `matchWinner` | 'MAFIA'\|'CITIZEN'\|null | ✓ (اشتقاق) | فوز/خسارة |
| `durationSeconds` | int | ✓ | مدة البطاقة |
| `totalRounds` | int | ✗ | (غير معروض — فرصة تحسين) |
| `playerCount` | int | ✗ | (غير معروض) |
| `role` | string | ✓ | chip الدور |
| `survivedToEnd` | bool | ✓ | meta المودال |
| `eliminatedDuring` | 'NIGHT'\|'DAY'\|null | ✓ | meta المودال |
| `eliminatedAtRound` | int\|null | ✓ | meta المودال |
| `roundsSurvived` | int | ✓ | meta المودال |
| `dealInitiated` | bool | ✓ | ملاحظة الاتفاقية |
| `dealSuccess` | bool\|null | ✓ | ملاحظة الاتفاقية |
| `abilityUsed` | bool | ✗ | (غير معروض) |
| `abilityCorrect` | bool\|null | ✗ | (غير معروض) |
| `xpEarned` | int | ✓ | XP البطاقة/المجموع |
| `rrChange` | int | ✓ | RR البطاقة/المجموع |
| `penaltyCount` | int | ✗ | (غير معروض) |
| `penaltyRRDeduction` | int | ✗ | (غير معروض) |
| `bombRRChange` | int | ✗ | (غير معروض) |
| `breakdown` | object\|null | ✓ | بطاقات التفصيل |

- **`breakdown`** (اختياري): 
  - `team`: 'MAFIA'\|'CITIZEN'\|'NEUTRAL' — يقود chip الفريق في المودال.
  - `won`: bool — يقود النتيجة في المودال (يتقدّم على heuristic الدور).
  - `xp`: `BreakdownLine[]` — بنود تفصيل XP.
  - `rr`: `BreakdownLine[]` — بنود تفصيل RR.
  - `xpTotal`, `rrTotal`: int — (موجودان بالعقد؛ العرض يستخدم `xpEarned`/`rrChange` للمجاميع، لا `xpTotal`/`rrTotal`).
- **`BreakdownLine`**: `{ key: string; label: string; icon: string; value: number }` — `label` نص عربي جاهز من السيرفر (لا يُترجَم/يُكوَّد في العميل)؛ `icon` emoji؛ `value` قد يكون سالباً؛ `value===0` يُخفى.

### 7.2 Socket
**لا شيء.** لا فتح اتصال، لا اشتراك، لا استماع لأي حدث في هذه الشاشة. النضارة تعتمد إعادة الجلب عند دخول الشاشة فقط (§6.2).

---

## 8. نماذج Dart المطلوبة

تُعرَّف في طبقة البيانات (02-models-data-layer.md) وتُشارَك مع 13-profile.md و15-rank.md — **مصدر واحد، لا تكرار**.

```dart
class MatchDetails {
  final int matchId;
  final String gameName;
  final String? matchDate;            // ISO؛ يُحلّل بـ DateTime.tryParse
  final String? matchWinner;          // 'MAFIA' | 'CITIZEN' | null
  final int durationSeconds;
  final int totalRounds;              // غير معروض حالياً
  final int playerCount;              // غير معروض حالياً
  final String role;
  final bool survivedToEnd;
  final String? eliminatedDuring;     // 'NIGHT' | 'DAY' | null
  final int? eliminatedAtRound;
  final int roundsSurvived;
  final bool dealInitiated;
  final bool? dealSuccess;
  final bool abilityUsed;             // غير معروض حالياً
  final bool? abilityCorrect;         // غير معروض حالياً
  final int xpEarned;
  final int rrChange;
  final int penaltyCount;             // غير معروض حالياً
  final int penaltyRRDeduction;       // غير معروض حالياً
  final int bombRRChange;             // غير معروض حالياً
  final MatchBreakdown? breakdown;

  const MatchDetails({...});
  factory MatchDetails.fromJson(Map<String, dynamic> j);
}

class MatchBreakdown {
  final String team;                  // 'MAFIA' | 'CITIZEN' | 'NEUTRAL'
  final bool won;
  final List<BreakdownLine> xp;
  final List<BreakdownLine> rr;
  final int xpTotal;
  final int rrTotal;

  const MatchBreakdown({...});
  factory MatchBreakdown.fromJson(Map<String, dynamic> j);
}

class BreakdownLine {
  final String key;
  final String label;                 // نص عربي جاهز من السيرفر
  final String icon;                  // emoji
  final int value;

  const BreakdownLine({...});
  factory BreakdownLine.fromJson(Map<String, dynamic> j);
}
```

**دوال اشتقاق مساعدة** (مشتركة — ضعها بجوار النموذج أو في طبقة المنطق):
```dart
const kMafiaRoles = ['GODFATHER','SILENCER','CHAMELEON','WITCH','OLDER_BROTHER','MAFIA_REGULAR'];

// اشتقاق البطاقة (لا ينظر إلى breakdown)
bool wonForCard(MatchDetails m) {
  final isMafia = kMafiaRoles.contains(m.role);
  return (isMafia && m.matchWinner == 'MAFIA') || (!isMafia && m.matchWinner == 'CITIZEN');
}

// اشتقاق المودال (يفضّل breakdown)
({bool isNeutral, bool isMafia, bool won}) resolveForModal(MatchDetails m) {
  final b = m.breakdown;
  final isNeutral = b?.team == 'NEUTRAL';
  final isMafia = b?.team != null ? b!.team == 'MAFIA' : kMafiaRoles.contains(m.role);
  final won = b != null ? b.won
      : (isMafia && m.matchWinner == 'MAFIA') || (!isMafia && m.matchWinner == 'CITIZEN');
  return (isNeutral: isNeutral, isMafia: isMafia, won: won);
}

String formatDuration(int s) => s > 0
    ? '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}' : '—';

String formatCardDate(String? iso) {
  final dt = iso != null ? DateTime.tryParse(iso) : null;
  return dt != null ? '${dt.day}/${dt.month}/${dt.year}' : '—'; // أرقام غربية، ميلادي
}
```

نموذج حالة الشاشة (notifier — Riverpod/Bloc حسب 02): `{ bool loading; String? error; List<MatchDetails> matches; MatchDetails? selected }`.

---

## 9. الحزم المستخدمة

- **flutter_animate** — دخول البطاقات (`.fadeIn().slideY`) بـ stagger، وانتقالات خفيفة.
- **intl** — غير مطلوب لتاريخ البطاقة (أرقام غربية خام عبر `DateTime`)؛ يُستخدم فقط إن أُعيد استخدام أي تنسيق عربي في شاشات شقيقة. (لهذه الشاشة تحديداً يكفي `DateTime` القياسي.)
- عميل REST + مخزن الجلسة الموحّد (من 03-networking-rest.md و05-session-auth.md) — لا حزمة إضافية.
- **لا حاجة إلى**: `cached_network_image` (لا صور شبكية في هذه الشاشة)، ولا حزم صوت/socket/push.
- عائلة خط **mono** لأرقام النقاط (`font-mono`) — من إعداد الخطوط في 01-foundation-theme.md؛ `FontFeature.tabularFigures()` اختياري لمحاذاة الأرقام.

---

## 10. اختلافات Android / iOS

- **الضبابية الخلفية (`backdrop-blur`)**: الترويسة (`backdrop-blur-xl` ≈ sigma 24) والمودال (`backdrop-blur-md` ≈ sigma 12) تستخدمان `BackdropFilter`. على أندرويد الضعيف `BackdropFilter` مكلف وقد يسبب jank أثناء تمرير القائمة الطويلة — **على أندرويد** ضع الترويسة داخل `RepaintBoundary`، وفكّر في استبدال ضبابية الترويسة بلون صلب معتم `rgba(0,0,0,0.92)` (المظهر شبه مطابق لأن الخلفية سوداء أصلاً). على **iOS** الضبابية أرخص وأنعم — أبقِها.
- **المناطق الآمنة**: الترويسة اللاصقة يجب أن تحترم `SafeArea` العلوية (شريط الحالة/الـ notch على iOS، الكاميرا المثقوبة على أندرويد). الـ bottom-sheet يجب أن يحترم مؤشّر الصفحة الرئيسية (home indicator) في iOS عبر حشوة سفلية `MediaQuery.viewPadding.bottom`.
- **إيماءة الرجوع**: iOS swipe-back من الحافة يجب ألا يغلق المودال بشكل متضارب مع سحب-الإغلاق للـ sheet؛ استخدم `showModalBottomSheet` القياسي الذي يعزل إيماءاته. على أندرويد زر الرجوع النظامي يغلق المودال أولاً (إن كان مفتوحاً) ثم يعود للملف الشخصي — اربط `PopScope`/`WillPopScope`.
- **رندر الـ emoji**: 🛡️ (بمُعدِّل variation) و📜 🎮 🏆 💀 ⏱️ 📊 ⭐ ✅ ❌ قد تختلف بين المنصتين وإصدارات أندرويد القديمة (المشروع يتجنّب ZWJ عمداً). اختبرها على الأجهزة المستهدفة أو ضمّن خطّ emoji ثابتاً (NotoColorEmoji) لتوحيد الشكل.
- بخلاف ما سبق: **لا اختلافات جوهرية** — الشاشة REST-only بلا صوت/كاميرا/أذونات/deep-link داخلية.

---

## 11. الأصول المطلوبة

- **لا صور، لا أصوات، لا Lottie، لا ملفات SVG** — كل الأيقونات emoji نصية، وكل الزخارف CSS/تدرّجات.
- **لا صور شبكية** في هذه الشاشة (لا avatars هنا — بخلاف شاشتَي الرتب والملف الشخصي).
- **الخطوط**: عائلة النص الافتراضية للتطبيق + **عائلة mono** لأرقام النقاط والمجاميع (`font-mono`) — تُسجَّل في 01-foundation-theme.md.
- قائمة الـ emoji المستخدمة (للاختبار عبر المنصات): 📜 🎮 🏆 💀 ⏱️ 📊 ⭐ ✅ ❌ 🛡️ ✕.

---

## 12. معايير القبول (checklist تكافؤ قابلة للتعليم ✓)

- [ ] عند دخول الشاشة: spinner كهرماني 48dp حد 4dp، دوران 2000ms linear لا نهائي، على خلفية سوداء.
- [ ] غياب `playerId` → «لم يتم العثور على الحساب» فوراً بلا أي طلب شبكة، مع زر «العودة للبروفايل» يعود إلى `/player/profile`.
- [ ] فشل منطقي → عرض `data.error` أو «فشل في جلب السجل»؛ فشل شبكة → «خطأ في الاتصال بالخادم».
- [ ] الترويسة اللاصقة: «📜 سجل المباريات» (20sp، font-black، amber-400) + زر ✕ دائري 32dp يعود للملف الشخصي؛ خلفية `black/80` مضبّبة، حد سفلي `white/10`.
- [ ] القائمة الفارغة → «🎮» (5xl) + «لا يوجد مباريات مسجلة بعد!» (gray-400، bold)، توسيط، `py-20`.
- [ ] البطاقات: عمود `max-w-lg` (512dp)، `p-4`, `pb-20`, تباعد 12dp؛ دخول staggered (`50ms×index`، مع سقف عملي على العناصر المرئية).
- [ ] تلوين الفوز emerald (`bg .05/border .20`)، الخسارة rose؛ blob توهج 128dp `blur 40` `opacity 20` في الزاوية العلوية-اليمنى.
- [ ] الصف العلوي: اسم اللعبة (fallback «مباراة مافيا») + «{d/m/yyyy بأرقام غربية} • ⏱️ {m:ss}» (gray-500) + chip «🏆 فوز»/«💀 خسارة».
- [ ] الصف السفلي: chip فريق «مافيا» (أحمر) أو «مواطن» (سماوي) + اسم الدور العربي (gray-300، bold) + «+{xp} XP» (amber-400) + «{±}{rr} RR» (green-400 إذا ≥0 وإلا red-400).
- [ ] اشتقاق فوز البطاقة يعتمد الدور فقط (لا `breakdown`) — يطابق المصدر حتى للأدوار المحايدة.
- [ ] نقر البطاقة يفتح مودال «📊 تفصيل النقاط»: bottom-sheet على الموبايل، dialog مركزي ≥640dp؛ انزلاق spring (damping 25، stiffness 200)؛ مقبض سحب 48×6dp؛ عرض أقصى 448dp؛ خلفية تدرّج `gray-900→black` وظل علوي.
- [ ] بطاقة معلومات المباراة: «الدور» + اسم الدور (amber، bold) + chip الفريق («دور محايد» بنفسجي / «فريق المافيا» أحمر / «فريق المواطنين» سماوي) + «النتيجة» + «🏆 فوز»/«💀 خسارة» (font-black، 18sp) — كتلة النتيجة LTR.
- [ ] شريط meta: «🛡️ نجا للنهاية» أو «🛡️ أُقصي ليلاً/نهاراً (جولة N|?)» + «📊 {roundsSurvived} جولات».
- [ ] بطاقة XP كهرمانية: «⭐ تفصيل نقاط الخبرة (XP)» + صفوف `PointRow` (إخفاء value 0، أخضر موجب/أحمر سالب، mono، لاحقة « XP») + «لا نقاط خبرة» عند الفراغ + صف المجموع «المجموع» / «+{xpEarned} XP» (18sp، font-black، amber، mono).
- [ ] بطاقة RR بنفسجية: «🏆 تفصيل نقاط الرتبة (RR)» (أيقونة 🏆) + صفوف RR (لاحقة « RR») + «لا تغيّر في الرتبة» عند الفراغ + مجموع «{±}{rr} RR» أخضر/أحمر.
- [ ] صندوق المجموع الكلي: «TOTAL XP» / «TOTAL RR» (10sp، amber-500/70، uppercase، tracking-widest) + قيم 3xl font-black (XP amber، RR أخضر/أحمر) + فاصل عمودي 1×48dp متدرّج + طبقة توهج مضبّبة.
- [ ] ملاحظة الاتفاقية تظهر فقط إذا `dealInitiated`: النص الكامل «✅ الاتفاقية ناجحة — صوّت عليها الأغلبية وكان الهدف مافيا» (أخضر) أو «❌ الاتفاقية فاشلة — الهدف كان مواطناً (تمت معاقبة المبادر)» (أحمر).
- [ ] زر «إغلاق» بعرض كامل (`py-3.5`, `rounded-2xl`, `bg-white/5`) مع `active:scale-[0.98]`؛ الإغلاق يعمل عبر backdrop و✕ و«إغلاق».
- [ ] المودال يفضّل `breakdown` (team/won) ويسقط لاشتقاق الدور عند غيابه؛ عرض بنود التفصيل كما تصل (بما فيها بند التسوية).
- [ ] أرقام النقاط والمجاميع بخط mono؛ التاريخ والمدة بأرقام غربية.
- [ ] لا Socket، لا polling، لا refetch على visibility؛ إعادة الجلب فقط عند دخول الشاشة (+ RefreshIndicator اختياري كبديل pull-to-refresh القشرة).
- [ ] التكيّف: compact عمود 512dp + bottom-sheet؛ medium عمود 640dp + المودال dialog عند ≥640dp؛ expanded سقف 960dp/عمود 720dp + dialog 448dp ثابت (بلا gameScale، بلا two-pane افتراضياً).

---

## 13. ملاحظات أداء وأمان

- **قائمة طويلة**: السيرفر يعيد **كل** المباريات دفعة واحدة (لا ترقيم). استخدم `ListView.builder` (بناء كسول) لا `Column` — لاعب قديم قد يملك مئات المباريات. تجنّب بناء كل البطاقات مقدّماً.
- **سقف الـ stagger**: تأخير الدخول `50ms×index` بلا سقف في الويب — على قائمة كبيرة يبدو معطّلاً (آخر بطاقة تتأخر ثوانٍ). في Flutter شغّل الـ stagger فقط للعناصر التي تُبنى أول مرة وهي مرئية (عناصر `builder` خارج الشاشة لا تُبنى أصلاً)، أو اقصر التأخير على أول ~12 عنصراً ثم صفّره.
- **الضبابية**: طبقتا `backdrop-blur` (ترويسة + مودال) مكلفتان على أندرويد الضعيف؛ `RepaintBoundary` حول الترويسة، وبديل لون صلب على الأجهزة الضعيفة (§10). المودال يُبنى عند الفتح فقط (لا تكلفة أثناء التصفح).
- **web-only يُسقَط**: تجميد الـ body (`position:fixed; top:-scrollY; overflow:hidden`)، class `modal-open`، `window.scrollTo` عند الإغلاق، `overscrollBehavior:contain` — كلها حِيَل متصفح؛ في Flutter `showModalBottomSheet` يوفّر قفل التمرير والاستعادة مجاناً. لا تنقلها.
- **الأمان**: التوكن يُرسَل في ترويسة `Authorization: Bearer` فقط (لا في المسار/الاستعلام). `playerId` في المسار يجب أن يطابق الجلسة (السيرفر يفرض الملكية عبر التوكن) — لا تسمح للعميل بحقن `playerId` عشوائي؛ خذه من مخزن الجلسة الموحّد (05-session-auth.md) لا من إدخال المستخدم.
- **لا بيانات حساسة تُعرض**: السجل بيانات اللاعب نفسه فقط؛ لا أسرار أدوار لاعبين آخرين ولا حمولات لعب حيّة. `breakdown.label` نصوص عربية جاهزة من السيرفر — تُعرض حرفياً (لا تنفيذ/تفسير).
- **توحيد الجلسة**: الويب يقرأ localStorage مباشرة (legacy، بلا PlayerContext)؛ في Flutter وحّد المصدر مع بقية الشاشات عبر مخزن جلسة واحد يبني ترويسة Bearer — لا تقرأ مفاتيح متفرّقة.
- **الأخطاء صامتة بصرياً كما في المصدر**: لا toasts في هذه الشاشة؛ الفشل الأولي فقط يظهر كشاشة خطأ. لا تضف إشعارات أخطاء جديدة (تكافؤ نبرة).
