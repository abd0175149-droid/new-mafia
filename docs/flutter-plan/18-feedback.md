# 18 — التقييم الإلزامي: الاستبيانات، الأسئلة/النجوم، الإرسال
> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

## 1. الهدف والنطاق

بناء شاشة **التقييم الإلزامي على مستوى الغرفة (session)** في تطبيق اللاعب، بتكافؤ كامل مع صفحة الـ PWA الحالية `/player/feedback`:

- استبيان رضى **إجباري** يُنشأ للاعب تلقائياً على مستوى **الغرفة (session)** عند إغلاق الليدر للفعالية: صف `pending` واحد لكل مشارك (اتحاد الروستر ∪ لاعبي المباراة الفعليين)، مع استثناء المواقع التجريبية والجلسات قبل تاريخ فاصل `2026-06-17T00:00:00+03:00`.
- الشاشة تحمّل **طابور الاستبيانات المعلّقة** (queue)، تعرض استبياناً واحداً في كل مرة (**11 سؤال Likert من 1 إلى 5**)، وتتسلسل تلقائياً للتالي بعد كل إرسال حتى انتهاء الكل، ثم شاشة شكر مع زر لتصفّح الفعاليات.
- **الدخول للشاشة**: تنقّل مباشر داخل التطبيق، أو **deep link** بمعامل `?sessionId=<id>` (من نقرة إشعار FCM عند إغلاق الغرفة)، أو **تحويل إجباري من بوّابة التطبيق (gating)** عند وجود استبيانات محجوبة.
- **الأسئلة server-driven**: قائمة الأسئلة تأتي كاملة من السيرفر في استجابة الاستبيان (`questions`) — **ممنوع تكويد الأسئلة الـ 11 في التطبيق**؛ تُعرض كما تصل (مفاتيحها `key` تقود حمولة الإجابات؛ حقل `dimension` **لا يُعرض**).

**عقد الحجب على مستوى التطبيق (app-wide gating)** — جزء من نطاق هذا الملف توثيقاً، لكن **تنفيذه في الشِل** (11-shell-navigation.md) لا في هذه الشاشة: السيرفر يحجب اللاعب من **الحجز** ومن **الانضمام لغرفة جديدة** إذا كان لديه استبيان معلّق **مرّت عليه مهلة ساعة** (`FEEDBACK_GRACE_MS = 3600000ms` = ساعة من إغلاق الغرفة). عند الحجب يعيد السيرفر رمز `code: 'PENDING_SURVEYS'` و`redirect: '/player/feedback'` — على الشِل توجيه اللاعب إلى هذه الشاشة.

**خارج النطاق** (يُذكر لمنع الاختراع):
- **إنشاء الاستبيانات وإرسال الإشعار** يجري **server-side** حصراً عند إغلاق الغرفة (`createPendingForSession` داخل `endActivityRoom`) — التطبيق لا يُنشئ صفوفاً ولا يبعث إشعارات.
- **حساب الحجب** (`countBlockingPending`) وقواعده (المهلة/التاريخ الفاصل/ربط الجلسة) **server-side** — التطبيق يستهلك النتيجة فقط عبر رموز الأخطاء (§7).
- **لا يوجد حقل «pending» على `/api/player-auth/me`** — تم التحقق من الكود: مصدر الطابور الوحيد هو `GET /api/player-feedback/pending`، وإشارة الحجب تأتي كـ 403 `PENDING_SURVEYS` على الأفعال المحجوبة. لا تخترع حقلاً على `/me`.
- طلبات المطعم F&B (`/player/order`) — في 17-order-fnb.md (شريحة مستقلة رغم أنها من نفس التقرير المصدر).

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

| الملف | الدور |
|---|---|
| `c:/Projects/new mafia/unified-mafia/frontend/src/app/player/feedback/page.tsx` (225 سطراً) | صفحة التقييم كاملة: الطابور، التسلسل، النموذج، سلّم الألوان، كل النصوص والأنماط (inline styles، ليست Tailwind) وحالات الإرسال |
| `c:/Projects/new mafia/unified-mafia/backend/src/routes/player-feedback.routes.ts` (78 سطراً) | `playerFeedbackRouter` (base `/api/player-feedback`): `GET /pending`، `GET /:sessionId`، `POST /:sessionId` + رموز الأخطاء الحرفية |
| `c:/Projects/new mafia/unified-mafia/backend/src/services/feedback.service.ts` (249 سطراً) | مصدر الأسئلة الوحيد `FEEDBACK_QUESTIONS` (11 سؤال بنصوصها الحرفية)، `FEEDBACK_KEYS`، `FEEDBACK_GRACE_MS`، `FEEDBACK_CUTOFF`، منطق الطابور والحجب والحفظ |
| `c:/Projects/new mafia/unified-mafia/backend/src/middleware/player-auth.middleware.ts` (سطور 85–111) | `requireNoPendingFeedback` — بوّابة REST للحجب (403 `PENDING_SURVEYS`) |
| `c:/Projects/new mafia/unified-mafia/backend/src/sockets/lobby.socket.ts` (سطور 654–672) | بوّابة الانضمام عبر socket (callback خطأ `PENDING_SURVEYS`) |
| `c:/Projects/new mafia/unified-mafia/backend/src/services/session.service.ts` (سطور 321–335) | إرسال إشعار FCM `feedback_survey` عند إغلاق الغرفة، وبناء deep link `/player/feedback?sessionId=<id>` |
| `c:/Projects/new mafia/unified-mafia/frontend/src/context/PlayerContext.tsx` | مصدر `player.token` (Bearer JWT) — يقابله مخزن الجلسة الموحد في 05-session-auth.md |

## 3. التبعيات على ملفات الخطة الأخرى

- **01-foundation-theme.md** — الثيم الداكن، مقاييس الخط، وفئات أحجام النوافذ (Window Size Classes) المشتركة المطبّقة في §5.
- **02-models-data-layer.md** — اصطلاحات النمذجة (`fromJson`)؛ نماذج §8 هنا تُسجَّل هناك.
- **03-networking-rest.md** — عميل REST، الـ base URL، حقن `Authorization: Bearer`، ومعالجة `{success, error}` الموحدة (رسائل الخطأ العربية تُعرض حرفياً).
- **05-session-auth.md** — الجلسة والتوكن؛ الشاشة **لا تعمل قبل توفر لاعب مسجَّل** (`player` truthy).
- **06-push-notifications.md** — استقبال إشعار FCM type `feedback_survey` وتمرير `url: '/player/feedback?sessionId=<id>'` إلى الراوتر.
- **08-deeplinks-routing.md** — تسجيل المسار `/player/feedback` مع **معامل اختياري `sessionId`** لنقرات الإشعارات.
- **11-shell-navigation.md** — **تنفيذ بوّابة الحجب** (توجيه اللاعبين المحجوبين إلى هذه الشاشة عند رمز `PENDING_SURVEYS`)، وموضع الشاشة كمسار full-screen (ليست تبويب bottom-nav دائم).
- **14-games-invites.md** — فعل **الحجز** محجوب بـ 403 `PENDING_SURVEYS`؛ معالجته تُحوِّل هنا.
- **21-join-lobby.md** — فعل **الانضمام لغرفة** محجوب بـ callback `PENDING_SURVEYS` عبر socket؛ معالجته تُحوِّل هنا.
- **19-notifications-inbox.md** — إشعار `feedback_survey` قد يظهر في صندوق الإشعارات؛ نقره يفتح هذه الشاشة بمعامل `sessionId`.
- **لا تبعية على 04-socket-layer.md** لهذه الشاشة — **الشاشة لا تفتح ولا تستمع لأي socket** (البوّابة عبر socket تخصّ تدفق الانضمام في 21، لا هذه الشاشة). انظر §7.

## 4. الواجهة والتجربة تفصيلياً

عام للشاشة كلها: اتجاه **RTL**، كل النصوص عربية حرفية كما أدناه، **كل التنسيق inline styles وليس Tailwind** في المصدر (يُترجم في Flutter لأنماط صريحة). الحاوية الجذر: خلفية `#050505` (أسود قريب)، ارتفاع أدنى **ملء الشاشة (100vh)**، padding **علوي 20dp / أفقي 16dp / سفلي 40dp**، نص أبيض `#fff`. عمود المحتوى الداخلي: عرض أقصى **560dp** موسّطاً (`margin: 0 auto`).

> ملاحظة تحويل الوحدات: المصدر يستخدم px داخل inline styles؛ تُنقل 1:1 إلى dp/sp كما في بقية الخطة.

### 4.1 حالة Suspense fallback (خصوصية Next — لا تُنقل)

في الويب الصفحة ملفوفة بـ `<Suspense>` لأجل `useSearchParams`، والـ fallback هو `div` فارغ بخلفية `#050505` وRTL. **في Flutter لا مقابل**: معامل `sessionId` يصل كوسيط route عادي؛ تُحذف طبقة Suspense تماماً. (يُذكر فقط لكيلا يُعاد بناؤه.)

### 4.2 حالة التحميل (Loading)

- نص موسّط، padding **60dp**، لون `rgba(255,255,255,0.5)`:
  > «⏳ جاري التحميل...»
- تظهر منذ فتح الشاشة حتى تسوية `GET /api/player-feedback/pending` ثم تحميل الاستبيان الهدف (`GET /api/player-feedback/{sessionId}`). العَلَم `loading = true` ابتداءً ويُطفأ في نهاية تسلسل الإقلاع (نجاحاً أو فشلاً).
- **لا spinner دوّار هنا** (بخلاف شاشات أخرى) — مجرد نص إيموجي ⏳ ثابت. تكافؤ: لا تُضِف spinner.

### 4.3 حالة «تم / لا يوجد معلّق» (Done)

تظهر عندما لا يوجد أي استبيان هدف (`pending` فارغ ولا `sessionId`) أو بعد إتمام آخر استبيان في الطابور. عمود موسّط، padding **علوي/سفلي 60dp وأفقي 20dp**:

1. إيموجي 🎉 بحجم **56sp**، هامش سفلي **12dp**.
2. عنوان `h1`: **22sp، وزن 800**، لون أخضر `#22c55e`، هامش سفلي **8dp**:
   > «شكراً لك!»
3. فقرة: لون `rgba(255,255,255,0.6)`، **14sp**، هامش سفلي **24dp**:
   > «أكملت كل الاستبيانات المطلوبة. رأيك يساعدنا على التحسين.»
4. زر CTA: padding **رأسي 12dp / أفقي 28dp**، زوايا **12dp**، بلا حد، **وزن 700، 15sp**، خلفية متدرجة **كهرمانية** `linear-gradient(135deg, #f59e0b, #d97706)`، نص **أسود `#000`**:
   > «تصفّح الفعاليات 🎮»
   النقر → **استبدال** المسار الحالي (لا push) إلى شاشة الفعاليات (الويب: `router.replace('/player/games')` — يقابلها شاشة الألعاب/الفعاليات في 14-games-invites.md؛ استخدم `pushReplacement`/`go` لا يُبقي هذه الشاشة في المكدّس).

### 4.4 حالة نموذج الاستبيان (Survey) — من الأعلى للأسفل

#### 4.4.1 الترويسة

- عنوان `h1`: **20sp، وزن 800**، لون **كهرماني `#f59e0b`**، بلا هامش:
  > «📋 قيّم تجربتك»
- **سطر السياق** (يُرسم فقط إذا `context` موجود): لون `rgba(255,255,255,0.55)`، **13sp**، هامش علوي **6dp**، line-height **1.7**. أجزاؤه **شرطية** ومتسلسلة بنفس ترتيب المصدر حرفياً (الفواصل جزء من الجزء السابق):
  - إذا `activityName`: «🎯 {activityName} · » (يتبعه مسافة + نقطة وسطى + مسافة).
  - إذا `locationName`: «📍 {locationName} · ».
  - إذا `playedAt`: «🗓️ {playedAt}» — التاريخ بصيغة `ar-JO` **يوم رقمي + شهر مختصر** (الويب: `toLocaleDateString('ar-JO', {day:'numeric', month:'short'})`؛ Flutter: `DateFormat('d MMM', 'ar_JO')`). لا فاصل بعده.
  - إذا `sessionCode`: مسافة بادئة ثم داخل `span` باهت لونه `rgba(255,255,255,0.3)`: «(غرفة {sessionCode})».
- **لافتة تعدّد المعلّقات** (تُرسم فقط إذا `pending.length > 1`): لون بنفسجي `#8b5cf6`، **12sp**، هامش علوي **4dp**:
  > «لديك {pending.length} استبيانات معلّقة — هذا أحدها»

#### 4.4.2 شريط التقدّم

- مسار الشريط: ارتفاع **6dp**، خلفية `rgba(255,255,255,0.08)`، زوايا **99dp** (مستدير كامل)، هامش سفلي **20dp**، `overflow: hidden`.
- التعبئة: ارتفاع **100%**، عرض `= (answeredCount / max(questions.length, 1)) × 100%`، خلفية أخضر `#22c55e`، **انتقال عرض CSS بمدة 0.25s** (Flutter: `AnimatedContainer`/`TweenAnimationBuilder` بمدة **250ms**).
- `answeredCount` = عدد الأسئلة المُجابة (قيمتها ≥ 1).

#### 4.4.3 بطاقات الأسئلة (11 بطاقة)

لكل سؤال `q` بفهرس `i` (يُرسم من مصفوفة `questions` **كما تصل من السيرفر** — بالترتيب):

- الحاوية: خلفية `rgba(255,255,255,0.03)`، حد `1px solid rgba(255,255,255,0.07)`، زوايا **14dp**، padding **14dp**، هامش سفلي **12dp**.
- **صف نص السؤال** (display flex، مسافة **8dp**، هامش سفلي **12dp**):
  - رقم: `«{i+1}.»`، لون `rgba(255,255,255,0.3)`، **13sp، وزن 700**.
  - نص السؤال: `q.text`، لون `#fff`، **14sp، وزن 600**، line-height **1.5**.
- **صف التقييم** (display flex، مسافة **6dp**، `justify-content: space-between`): **5 أزرار متساوية العرض** (كل زر `flex: 1`)، لكل خيار `s` من سلّم الألوان الثابت:
  - padding **رأسي 10dp / أفقي 0**، زوايا **10dp**، تخطيط عمودي محاذاة مركزية بمسافة **2dp**.
  - **غير محدَّد** (`answers[q.key] != s.v`): خلفية **شفافة**، حد `1px solid rgba(255,255,255,0.12)`، نص `rgba(255,255,255,0.7)`.
  - **محدَّد** (`answers[q.key] == s.v`): خلفية **لون السلّم الصلب** `s.color`، حد `1px solid {s.color}`، نص **أسود `#000`**.
  - محتوى الزر (عمودان): الرقم `«{s.v}»` بحجم **16sp، وزن 800**؛ وتحته تسمية صغيرة **8sp، وزن 600** — **تظهر فقط عند التحديد** (`s.label` عند التحديد، سلسلة فارغة عدا ذلك).
  - **انتقال**: `all .15s` (Flutter: `AnimatedContainer`/`200ms أو 150ms` على لون الخلفية/الحد/النص).
- **سلّم الألوان الثابت (5 خيارات — يُنسخ حرفياً)** — ثابت client-side (ليس من السيرفر):

| v | label | color |
|---|---|---|
| 1 | «سيّئ جداً» | `#ef4444` |
| 2 | «سيّئ» | `#f97316` |
| 3 | «متوسط» | `#eab308` |
| 4 | «جيد» | `#84cc16` |
| 5 | «ممتاز» | `#22c55e` |

#### 4.4.4 حقل الملاحظات

- تسمية `label`: لون `rgba(255,255,255,0.6)`، **13sp**، `display: block`، هامش سفلي **6dp**:
  > «أي ملاحظة أو اقتراح؟ (اختياري)»
- `textarea`: `rows = 3`، **maxLength = 1000** (السيرفر أيضاً يقصّ إلى 1000)، placeholder:
  > «اكتب ملاحظتك هنا...»
  الأنماط: عرض **100%**، padding **رأسي 10dp / أفقي 14dp**، خلفية `rgba(255,255,255,0.05)`، حد `1px solid rgba(255,255,255,0.12)`، زوايا **10dp**، نص أبيض `#fff` **14sp**، `outline: none`، **resize رأسي فقط**، `fontFamily: inherit` (يرث خط الشِل). حاوية الحقل هامش سفلي **16dp**.
- في Flutter: `TextField(maxLines: 3, minLines: 3, maxLength: 1000)` (اخفِ عدّاد الأحرف الافتراضي `counterText: ''` للتكافؤ)، مع رفع فوق الكيبورد (`resizeToAvoidBottomInset: true`).

#### 4.4.5 زر الإرسال (ثلاث حالات)

- عرض **100%**، padding **رأسي 14dp / أفقي 0**، زوايا **12dp**، بلا حد، **وزن 800، 16sp**.
- **مفعّل** (`allAnswered && !submitting`): خلفية متدرجة خضراء `linear-gradient(135deg, #22c55e, #16a34a)`، نص **أسود `#000`**، النص:
  > «إرسال ✓»
- **أثناء الإرسال** (`submitting`): نفس مظهر المفعّل بصرياً في المصدر لكن يُعرض النص:
  > «⏳ جاري الإرسال...»
  (زر معطّل فعلياً عبر شرط `disabled = !allAnswered || submitting`.)
- **معطّل** (ليست كل الأسئلة مُجابة): خلفية `rgba(255,255,255,0.1)`، نص `rgba(255,255,255,0.4)`، مؤشر `not-allowed`، النص:
  > «أجب على كل الأسئلة ({answeredCount}/{questions.length})»
- `allAnswered = questions.length > 0 && كل سؤال answers[key] ≥ 1`.

#### 4.4.6 حالة الخطأ عند الإرسال

- في الويب: **`alert()` متصفح** بالنص `data.error` القادم من السيرفر أو النص الافتراضي «تعذّر الإرسال» (وعند استثناء الشبكة أيضاً «تعذّر الإرسال»).
- **في Flutter يُستبدَل بنمط أخطاء موحّد** (SnackBar أو حوار قصير — قرار موحّد للتطبيق في 92-qa-parity.md)، مع الإبقاء على **نص الخطأ حرفياً كما يصل** ونص الـ fallback «تعذّر الإرسال».
- الخطأ لا يمسح الإجابات ولا يغيّر الشاشة — يبقى النموذج كما هو ليعيد اللاعب المحاولة.

## 5. التكيّف مع الشاشات 6→11 إنش

وفق فئات النوافذ الموحدة (01-foundation-theme.md): **compact < 600dp**، **medium 600–840dp**، **expanded > 840dp**. عناصر التقييم (أزرار السلّم) هي **عناصر تفاعل حساسة** → على الشاشات الأكبر تُكبَّر لمساً بدل تمديدها.

### compact (هواتف 6–7 إنش) — المرجع
- عمود واحد كما في الـ PWA حرفياً: عرض أقصى للمحتوى **560dp** موسّطاً (أقل من عرض الشاشة عملياً)، نفس الـ paddings (علوي 20 / أفقي 16 / سفلي 40)، نفس أحجام الخطوط.
- أزرار السلّم الخمسة `flex: 1` كما هي (padding رأسي 10dp).

### medium (تابلت 8 إنش)
- يبقى سقف العمود **560dp** موسّطاً (النموذج أضيق من 640dp أصلاً — لا يُمدَّد لملء العرض حفاظاً على مقروئية السطر ولمس الأزرار).
- **تكبير أزرار السلّم للمس**: ارتفاع الزر يُرفع إلى **≈52dp** (min-height بدل padding 10dp)، الرقم **18sp**؛ تبقى 5 أزرار في صف واحد `flex: 1`.
- بطاقات الأسئلة، شريط التقدّم، حقل الملاحظات، وزر الإرسال: بلا تغيير بنيوي (بعرض العمود 560).

### expanded (تابلت 10–11 إنش)
- سقف عرض العمود يُرفع إلى **640dp** موسّطاً (سقف المحتوى النصي الموحّد).
- **مضاعفة العناصر الحساسة**: أزرار السلّم ارتفاعها **≈60dp**، الرقم **20sp**، التسمية الصغيرة **10sp**، الفجوة بين الأزرار **8dp**؛ نص السؤال **16sp**؛ رقم السؤال **14sp**.
- **بلا two-pane**: استبيان واحد في كل مرة — لا فائدة من لوحين؛ يبقى عموداً واحداً موسّطاً.
- حالتا **Loading** و**Done**: تبقيان عموداً موسّطاً واحداً في كل الفئات (بلا تغيير).
- الاتجاه **portrait مقفول** على كل الفئات (تكافؤ manifest) — تُقاس الفئات على عرض البورتريه.

## 6. المنطق والتدفقات

### 6.1 آلة الحالة العليا للشاشة

```
[init] (player متوفر)
  loading = true
  querySessionId = route param ?sessionId   // من deep link/إشعار، قد يكون null
  activeSessionId := querySessionId (رقماً) أو null

  → GET /api/player-feedback/pending  →  pending[]  (asc بالأقدم)
  target := activeSessionId ?? (pending.isNotEmpty ? pending[0].sessionId : null)

  if (target == null) → done = true
  else {
     activeSessionId := target
     loadSurvey(target)          // انظر 6.2
  }
  loading = false

survey (بعد loadSurvey ناجح وليس alreadyDone):
  حالات فرعية:
    answers: Map<key,int> (فارغة → مكتملة)
    notes: String (≤1000)
    submitting: idle ⇄ inFlight (زر الإرسال معطّل + نص «⏳ جاري الإرسال...»)
  allAnswered = questions.length>0 && كل key مُجاب ≥1

done: شاشة الشكر (نهائية حتى إعادة فتح الشاشة).
```

### 6.2 `loadSurvey(sessionId)` — تحميل استبيان مع معالجة «مُنجَز مسبقاً»

```
GET /api/player-feedback/{sessionId}
  إن data.success:
    questions := data.questions   // 11 (تُعرض كما تصل)
    context  := data.context
    answers  := {} ; notes := ''   // تصفير دائم عند كل تحميل
    if (data.alreadyDone) {        // عُبّئ سابقاً (مثلاً من جهاز آخر)
        p := (إعادة) GET /pending
        next := p.firstWhere(x => x.sessionId != sessionId)  // أول معلّق مختلف
        if (next != null) { activeSessionId := next.sessionId; loadSurvey(next.sessionId) }  // تكرار
        else done = true
    }
  إن فشل (success=false أو استثناء): لا شيء (النموذج يبقى بلا أسئلة — انظر 6.5)
```

- **حارس ضد اللانهائية إلزامي في Flutter**: تسلسل `loadSurvey → loadPending → loadSurvey` قد يدور إن جاءت بيانات سيرفر متناقضة. نفّذه كـ **حلقة async** (لا تعاود ذاتياً بلا حد) مع مجموعة `visited<sessionId>` تكسر الدوران، وحدٍّ أقصى للتكرارات (مثلاً = طول الطابور + 1).

### 6.3 الإرسال (`submit`)

1. حارس: إن `activeSessionId == null` أو `!allAnswered` أو `submitting` → لا شيء.
2. `submitting = true`.
3. `POST /api/player-feedback/{activeSessionId}` بالحمولة: `{ answers: {key: 1..5, ...}, notes }`.
   - `answers` يحوي **كل مفاتيح `questions`** (المفاتيح الـ 11) بقيم أعداد صحيحة 1–5.
   - `notes` تُرسل كما هي (السيرفر يقصّها إلى 1000).
4. نجاح (`data.success == true`): **إعادة جلب `/pending`** ثم `remaining = pending.filter(x => x.sessionId != activeSessionId)`:
   - إن `remaining.isNotEmpty` → `activeSessionId := remaining[0].sessionId`؛ `loadSurvey(remaining[0].sessionId)` (يصفّر الإجابات والملاحظات)؛ **تمرير سلس للأعلى** (الويب: `window.scrollTo({top:0, behavior:'smooth'})`؛ Flutter: `ScrollController.animateTo(0, ...)`).
   - وإلا → `done = true`.
5. فشل منطقي (`success == false`): إظهار `data.error` أو «تعذّر الإرسال» (§4.4.6).
6. استثناء شبكة: إظهار «تعذّر الإرسال».
7. `submitting = false` دائماً (finally).

- **الإرسال المتسلسل**: بعد كل نجاح ينتقل الطابور للأقدم المتبقي تلقائياً حتى الفراغ → شاشة Done.
- **idempotency السيرفر**: إعادة إرسال جلسة مُنجَزة تعيد `{success:true}` بلا تغيير (لا خطأ) — لا حاجة لمعالجة خاصة client-side.

### 6.4 إعادة التحقق server-side (يجب أن يتكافأ التطبيق مع أسبابها)

- `answers` غير موجودة/ليست object → 400 «الإجابات مطلوبة».
- لكل مفتاح في `FEEDBACK_KEYS`: `v = Number(answers[key])`؛ إن لم يكن عدداً صحيحاً أو خارج 1..5 → 400 «إجابة غير صالحة أو ناقصة: {key}» — لذا التطبيق **يجب** أن يمنع الإرسال قبل اكتمال كل الأسئلة (زر معطّل)، ويرسل قيم 1..5 فقط.
- ملاحظة عقد: مفتاح الإجابة `value` يُخزَّن server-side في عمود `value_rating`، لكن **حمولة العميل تستخدم المفتاح `value`** كما يصل في `questions`. لا تُعِد تسميته.

### 6.5 حالات حدّية

- **deep link لـ `sessionId` بلا استبيان لهذا اللاعب** (403 من `GET /:sessionId`): في الويب `data.success` falsy → النموذج يُعرض **بلا أسئلة** (0 بطاقات، زر «أجب على كل الأسئلة (0/0)» معطّل، شريط تقدّم 0%). سلوك خام موثّق. **توصية Flutter (تحسين، لا يكسر التكافؤ)**: عند فشل تحميل الاستبيان الهدف (أو أسئلة فارغة بعد انتهاء التحميل) → عالجه كـ `done`/رسالة «لا يوجد استبيان مطلوب لهذه الغرفة» بدل نموذج فارغ. سُجّل القرار في 92-qa-parity.md.
- **`sessionId` مُنجَز على جهاز آخر**: `alreadyDone=true` → تقدّم تلقائي للمعلّق التالي أو Done (§6.2).
- **`context` جزئي** (بعض الحقول null): سطر السياق يعرض الأجزاء الموجودة فقط (كلها شرطية). إن كان `context == null` كلياً → لا يُرسم سطر السياق إطلاقاً.
- **`pending.length == 1`**: لا تُرسم لافتة التعدّد البنفسجية.
- **إغلاق التطبيق أثناء التعبئة**: الإجابات والملاحظات **ذاكرية فقط** (لا تخزين) — تضيع، ويُعاد بناء الطابور من `/pending` عند العودة. تكافؤ: لا تخزين محلي.

### 6.6 المؤقتات وإعادة الاتصال

- **لا مؤقتات ولا polling ولا socket** في هذه الشاشة إطلاقاً — من أبسط الشرائح.
- **لا منطق إعادة اتصال**: انقطاع الشبكة أثناء التحميل يترك الشاشة في حالتها (loading انتهى بلا أسئلة، أو خطأ إرسال يُعرض) — إعادة الدخول للشاشة تعيد الجلب.
- **نقرة إشعار `feedback_survey`**: تفتح المسار `/player/feedback?sessionId=<id>` → الشاشة تبدأ بـ `activeSessionId = <id>` وتحمّله مباشرة (متجاوزةً أول الطابور).

### 6.7 بوّابة الحجب (يُنفَّذ في الشِل — 11-shell-navigation.md — موثّق هنا للعقد)

- **متى يُحجَب**: استبيان معلّق (غير مُرسَل، مرتبط بجلسة، بعد التاريخ الفاصل) **مرّ عليه أكثر من ساعة** من إغلاق الغرفة (`countBlockingPending > 0`). إشعار التقييم يصل لحظياً لكن الحجب يبدأ بعد ساعة (grace).
- **أين يُحجَب**: (أ) فعل **الحجز** `POST /api/player-app/book` عبر middleware `requireNoPendingFeedback` → 403؛ (ب) **الانضمام لغرفة جديدة** عبر socket `join` → callback خطأ. **اللاعب العائد لنفس الغرفة لا يُحجَب**.
- **رد الفعل في التطبيق**: عند تلقّي `code: 'PENDING_SURVEYS'` (REST 403 أو socket callback) → توجيه اللاعب إلى `/player/feedback` (الحقل `redirect`)، وعرض رسالة السيرفر حرفياً (تختلف بين المسارين):
  - REST (حجز): «يجب إكمال استبيانات فعالياتك السابقة قبل المتابعة».
  - Socket (انضمام): «يجب إكمال استبيانات فعالياتك السابقة قبل الانضمام».

## 7. عقود التكامل

كل الاستدعاءات REST بـ header `Authorization: Bearer {playerToken}` (من 05-session-auth.md)، الاستجابات JSON بمفتاح `success: boolean` ومفتاح `error` عربي عند الفشل. القاعدة: `/api/player-feedback`، middleware `authenticatePlayer`.

### 7.1 REST

**1) GET `/api/player-feedback/pending`** — طابور الاستبيانات المعلّقة
- Request: بلا معاملات.
- 401 `{ "error": "غير مصادق" }` إن غاب playerId.
- Response 200:
  ```json
  {
    "success": true,
    "count": 2,
    "pending": [
      {
        "sessionId": 123,
        "sessionName": "string|null",
        "sessionCode": "string|null",
        "activityName": "string|null",
        "locationName": "string|null",
        "playedAt": "ISO-8601|null"
      }
    ]
  }
  ```
  - مرتّبة بـ `createdAt` **تصاعدياً** (الأقدم أولاً — هو الهدف الافتراضي).
  - فقط الصفوف: غير المُرسَلة (`submittedAt == null`)، المرتبطة بجلسة (`sessionId != null`)، بعد التاريخ الفاصل (`createdAt ≥ 2026-06-17`).

**2) GET `/api/player-feedback/{sessionId}`** — سياق الغرفة + الأسئلة
- 401 `{ "error": "غير مصادق" }`.
- 400 `{ "error": "sessionId غير صالح" }` إن كان `parseInt` = 0/NaN.
- 403 `{ "error": "لا يوجد استبيان مطلوب لهذه الغرفة" }` إن لم يوجد صف استبيان لهذا (اللاعب+الجلسة).
- Response 200:
  ```json
  {
    "success": true,
    "questions": [ { "key": "overall", "dimension": "عام", "text": "..." } ],
    "alreadyDone": false,
    "context": {
      "sessionId": 123,
      "sessionName": "string|null",
      "sessionCode": "string|null",
      "activityName": "string|null",
      "locationName": "string|null",
      "playedAt": "ISO-8601|null"
    }
  }
  ```
  - `questions` **11 عنصراً** بالترتيب أدناه؛ تُعرض `text` فقط (`dimension` لا يُعرض؛ `key` يقود الحمولة).
  - `alreadyDone = (submittedAt != null)`.

**3) POST `/api/player-feedback/{sessionId}`** — إرسال الاستجابة
- 401 / 400 (`sessionId غير صالح`) كأعلاه.
- Request body:
  ```json
  { "answers": { "overall": 5, "venue": 4, "...": 1 }, "notes": "نص اختياري" }
  ```
  - `answers` **يجب** أن يحوي كل المفاتيح الـ 11 بأعداد صحيحة 1..5.
  - `notes` اختياري (string)؛ يُقصّ server-side إلى 1000.
- 400 `{ "error": "الإجابات مطلوبة" }` إن غابت `answers` أو لم تكن object.
- 400 `{ "error": "إجابة غير صالحة أو ناقصة: {key}" }` لأول مفتاح ناقص/خارج المدى (مثال: «إجابة غير صالحة أو ناقصة: pacing»).
- 400 `{ "error": "لا يوجد استبيان مطلوب لهذه الغرفة" }` (من الخدمة إن لا سياق) أو رسالة خطأ DB.
- Response 200: `{ "success": true }` — بما فيه حالة **إعادة الإرسال لجلسة مُنجَزة** (idempotent، بلا تغيير).

**المفاتيح والأسئلة الـ 11 (المصدر: `FEEDBACK_QUESTIONS` — تُعرض من السيرفر، تُوثَّق هنا للاختبار فقط، لا تُكوَّد):**

| # | key | dimension (لا يُعرض) | text (يُعرض حرفياً) |
|---|---|---|---|
| 1 | `overall` | عام | «تجربتي في هذه الفعالية كانت ممتازة بشكل عام» |
| 2 | `venue` | المكان | «المكان كان مريحاً ومناسباً (إضاءة، صوت، جلوس، نظافة)» |
| 3 | `gameplay` | تجربة اللعب | «تجربة اللعب نفسها كانت ممتعة ومشوّقة» |
| 4 | `clarity` | وضوح القوانين | «كانت القوانين وسير اللعبة واضحة ومفهومة» |
| 5 | `pacing` | الإيقاع | «إيقاع اللعبة كان مناسباً (لا ممل ولا متسرّع)» |
| 6 | `seating` | توزيع المقاعد | «آلية توزيع المقاعد كانت عادلة ومريحة» |
| 7 | `leader` | الليدر | «الليدر كان محترفاً ولبقاً في التعامل» |
| 8 | `fairness` | الحياد | «شعرت بالعدل والحياد في إدارة اللعبة» |
| 9 | `atmosphere` | الأجواء | «الأجواء العامة والروح الاجتماعية كانت رائعة» |
| 10 | `value` | القيمة | «كانت الفعالية تستحق وقتي وتكلفتها» |
| 11 | `recommend` | الولاء | «أنوي الحضور مجدداً وأنصح أصدقائي بالنادي» |

### 7.2 بوّابة الحجب (REST + Socket — تُستهلك من الشِل، لا من هذه الشاشة)

**REST — على `POST /api/player-app/book`** (14-games-invites.md) عبر `requireNoPendingFeedback`:
```json
// 403
{
  "success": false,
  "error": "يجب إكمال استبيانات فعالياتك السابقة قبل المتابعة",
  "code": "PENDING_SURVEYS",
  "pendingCount": 1,
  "redirect": "/player/feedback"
}
```

**Socket — على حدث `join`** (21-join-lobby.md، الاتجاه client→server، رد عبر callback):
```json
// callback(...)
{
  "success": false,
  "error": "يجب إكمال استبيانات فعالياتك السابقة قبل الانضمام",
  "code": "PENDING_SURVEYS",
  "pendingCount": 1,
  "redirect": "/player/feedback"
}
```
- يُطلَق فقط للاعب **جديد** على الغرفة؛ العائد لنفس الغرفة معفى.

### 7.3 Socket (هذه الشاشة)

**تطبيق اللاعب لا يفتح ولا يستمع لأي حدث socket في شاشة التقييم.** (بوّابة الانضمام في §7.2 تخصّ تدفق الانضمام في 21، لا هذه الشاشة.)

### 7.4 FCM Push (يُنشأ ويُرسَل server-side عند إغلاق الغرفة — الاستقبال في 06-push-notifications.md)

عند إغلاق الليدر للغرفة (`endActivityRoom`)، يُرسَل لكل مشارك **مُنشأ حديثاً** إشعار:
- type: `feedback_survey`
- العنوان: «📋 رأيك يهمّنا»
- النص: «قيّم تجربتك في الفعالية (أقل من دقيقة) — مطلوب قبل حجزك القادم»
- data: `{ "sessionId": <number>, "url": "/player/feedback?sessionId=<id>" }`

نقرة الإشعار → مسار `/player/feedback?sessionId=<id>` (08-deeplinks-routing.md) → فتح هذه الشاشة ببدء `activeSessionId = <id>`.

## 8. نماذج Dart المطلوبة

(تُسجَّل في 02-models-data-layer.md. التواريخ `DateTime?` تُفكّ بأمان من ISO/null.)

```dart
class FeedbackQuestion {
  final String key;         // overall, venue, ... recommend — يقود حمولة الإجابات
  final String dimension;   // موجود بالعقد لكنه لا يُعرض
  final String text;        // النص المعروض حرفياً
}

class FeedbackScaleOption {  // ثابت client-side (5 خيارات) — ليس من السيرفر
  final int v;               // 1..5
  final String label;        // «سيّئ جداً» ... «ممتاز»
  final Color color;         // #ef4444 / #f97316 / #eab308 / #84cc16 / #22c55e
}

class PendingSurvey {        // عنصر من /pending
  final int sessionId;
  final String? sessionName;
  final String? sessionCode;
  final String? activityName;
  final String? locationName;
  final DateTime? playedAt;
}

class PendingFeedbackResult {   // غلاف استجابة /pending
  final int count;
  final List<PendingSurvey> pending;   // asc بالأقدم
}

class FeedbackContext {      // context من /:sessionId (نفس حقول PendingSurvey تقريباً)
  final int sessionId;
  final String? sessionName;
  final String? sessionCode;
  final String? activityName;
  final String? locationName;
  final DateTime? playedAt;
}

class FeedbackSurvey {       // استجابة GET /:sessionId
  final List<FeedbackQuestion> questions;   // 11
  final bool alreadyDone;
  final FeedbackContext? context;
}

class FeedbackSubmitRequest {
  final Map<String, int> answers;   // كل المفاتيح الـ 11، قيم 1..5
  final String notes;               // ≤1000 (السيرفر يقصّ)
}

// حالة الشاشة داخل الـ notifier
class FeedbackFormState {
  final List<PendingSurvey> pending;
  final int? activeSessionId;
  final List<FeedbackQuestion> questions;
  final FeedbackContext? context;
  final Map<String, int> answers;   // key → 1..5
  final String notes;
  final bool loading;
  final bool submitting;
  final bool done;
  // مشتقّات:
  int get answeredCount;            // عدد المفاتيح المُجابة ≥1
  bool get allAnswered;             // questions.isNotEmpty && كلها مُجابة
  double get progress;              // answeredCount / max(questions.length, 1)
}
```

**ثابت سلّم الألوان** (يُنقل حرفياً):
```dart
const kFeedbackScale = <FeedbackScaleOption>[
  FeedbackScaleOption(v: 1, label: 'سيّئ جداً', color: Color(0xFFEF4444)),
  FeedbackScaleOption(v: 2, label: 'سيّئ',      color: Color(0xFFF97316)),
  FeedbackScaleOption(v: 3, label: 'متوسط',     color: Color(0xFFEAB308)),
  FeedbackScaleOption(v: 4, label: 'جيد',       color: Color(0xFF84CC16)),
  FeedbackScaleOption(v: 5, label: 'ممتاز',     color: Color(0xFF22C55E)),
];
```

## 9. الحزم المستخدمة

- عميل REST الموحد (dio أو ما اعتُمد في 03-networking-rest.md) — لا حزم شبكة خاصة بهذه الشاشة.
- `intl` — تنسيق تاريخ السياق `ar_JO` (`DateFormat('d MMM', 'ar_JO')` لـ `playedAt`).
- إدارة الحالة المعتمدة (Riverpod/Bloc حسب 02-models-data-layer.md) — notifier واحد يدير الطابور + التسلسل + الإجابات + الإرسال.
- **لا حاجة** لـ: `cached_network_image` (لا صور)، أي حزمة socket، أي تخزين محلي، أي مؤقّتات، أي حزمة أنيميشن خاصة (الانتقالات بسيطة عبر `AnimatedContainer`/`TweenAnimationBuilder` المدمجة).

## 10. اختلافات Android / iOS

- **لا اختلافات وظيفية في منطق الشاشة** — كلها REST + نموذج محلي، والسلوك متطابق على المنصتين.
- ملاحظتان تنفيذيتان فقط: (أ) **رفع فوق الكيبورد** لحقل الملاحظات (`resizeToAvoidBottomInset: true`) — سلوك النظامين متطابق لكن ارتفاع الكيبورد يختلف؛ (ب) الإيموجيات (📋 🎯 📍 🗓️ 🎉 🎮 ⏳ ✓) تُرسم بخط المنصة فتختلف شكلاً قليلاً بين Android وiOS — مقبول (نفس وضع الـ PWA).
- أذونات/سلوك FCM بالخلفية (لاستقبال إشعار `feedback_survey`) مغطاة مركزياً في 06-push-notifications.md.

## 11. الأصول المطلوبة

- **لا أصول مضمّنة** (لا صور/أصوات/lottie) — كل الأيقونات إيموجي نصية: 📋 (ترويسة/إشعار)، 🎯 📍 🗓️ (سطر السياق)، 🎉 (شاشة الشكر)، 🎮 (زر تصفّح الفعاليات)، ⏳ (تحميل/إرسال)، ✓ (زر الإرسال). أرقام السلّم `1..5` نصية.
- **لا صور شبكية إطلاقاً** في هذه الشاشة (لا avatars ولا منيو).

## 12. معايير القبول — checklist تكافؤ

- [ ] الحاوية RTL، خلفية `#050505`، عمود داخلي 560dp موسّط، padding (علوي 20 / أفقي 16 / سفلي 40).
- [ ] **Loading**: نص «⏳ جاري التحميل...» موسّط بلون `rgba(255,255,255,0.5)` بلا spinner.
- [ ] **Done**: 🎉 56sp + «شكراً لك!» أخضر `#22c55e` 22sp/800 + «أكملت كل الاستبيانات المطلوبة. رأيك يساعدنا على التحسين.» + زر «تصفّح الفعاليات 🎮» كهرماني `#f59e0b→#d97706` بنص أسود يستبدل المسار إلى شاشة الفعاليات.
- [ ] **الترويسة**: «📋 قيّم تجربتك» كهرماني `#f59e0b` 20sp/800؛ سطر السياق بأجزائه الشرطية بالترتيب («🎯 …· » / «📍 …· » / «🗓️ {يوم شهر-مختصر ar-JO}» / «(غرفة {code})» باهت).
- [ ] لافتة «لديك {n} استبيانات معلّقة — هذا أحدها» بنفسجية `#8b5cf6` 12sp **فقط إذا `pending.length > 1`**.
- [ ] شريط تقدّم 6dp مستدير (خلفية `rgba(255,255,255,0.08)`، تعبئة `#22c55e`) بعرض `answered/total` وانتقال 250ms.
- [ ] **11 بطاقة سؤال** (خلفية `rgba(255,255,255,0.03)`، حد `rgba(255,255,255,0.07)`، زوايا 14، padding 14): رقم باهت `{i+1}.` + نص السؤال حرفياً من السيرفر (14sp/600).
- [ ] صف التقييم: 5 أزرار متساوية؛ غير المحدد شفاف بحد `rgba(255,255,255,0.12)` ونص `rgba(255,255,255,0.7)`؛ المحدد بخلفية لون السلّم الصلب ونص **أسود** وتسمية 8sp تظهر عند التحديد فقط؛ انتقال 150ms.
- [ ] سلّم الألوان مطابق: 1 «سيّئ جداً» `#ef4444` / 2 «سيّئ» `#f97316` / 3 «متوسط» `#eab308` / 4 «جيد» `#84cc16` / 5 «ممتاز» `#22c55e`.
- [ ] حقل الملاحظات: تسمية «أي ملاحظة أو اقتراح؟ (اختياري)»، textarea 3 أسطر maxLength 1000 placeholder «اكتب ملاحظتك هنا...»، يرتفع فوق الكيبورد، عدّاد الأحرف مخفي.
- [ ] زر الإرسال بثلاث حالات: مفعّل «إرسال ✓» (تدرج `#22c55e→#16a34a` نص أسود) / «⏳ جاري الإرسال...» أثناء الإرسال / معطّل «أجب على كل الأسئلة ({answered}/{total})» (خلفية `rgba(255,255,255,0.1)` نص `rgba(255,255,255,0.4)`).
- [ ] الإرسال مفعّل **فقط** عند إجابة كل الأسئلة؛ الحمولة تحوي كل المفاتيح الـ 11 بقيم 1..5 والمفتاح `value` بلا إعادة تسمية.
- [ ] **الإرسال المتسلسل**: بعد النجاح، إعادة جلب `/pending`، والانتقال للأقدم المتبقي مع تصفير الإجابات/الملاحظات وتمرير للأعلى؛ وإلا شاشة Done.
- [ ] معالجة `alreadyDone` بالتقدّم التلقائي للمعلّق التالي **مع حارس ضد اللانهائية**.
- [ ] deep link `?sessionId=` يبدأ بالاستبيان المحدد؛ إشعار `feedback_survey` يفتح الشاشة بذلك المعامل.
- [ ] فشل الإرسال يعرض `error` السيرفر حرفياً أو «تعذّر الإرسال» (عبر SnackBar/حوار، لا `alert`)، بلا فقدان الإجابات.
- [ ] رسائل السيرفر الحرفية مُعروضة كما هي: «غير مصادق» / «sessionId غير صالح» / «لا يوجد استبيان مطلوب لهذه الغرفة» / «الإجابات مطلوبة» / «إجابة غير صالحة أو ناقصة: {key}».
- [ ] **بوّابة الحجب** (في الشِل): رمز `PENDING_SURVEYS` من REST 403 (حجز) أو socket callback (انضمام) يوجّه إلى `/player/feedback` ويعرض رسالة السيرفر المناسبة.
- [ ] لا socket ولا polling ولا مؤقتات ولا تخزين محلي في هذه الشاشة.
- [ ] فئات الشاشات: compact عمود 560dp؛ medium أزرار سلّم ~52dp/18sp؛ expanded سقف 640dp وأزرار سلّم ~60dp/20sp؛ Loading/Done عمود موسّط في الكل؛ portrait مقفول.
- [ ] RTL كامل، وكل النصوص أعلاه مطابقة حرفاً بحرف (بما فيها التشكيل والترقيم العربي: «سيّئ»، «متسرّع»، «مشوّقة»، «رأيك يهمّنا»...).

## 13. ملاحظات أداء وأمان

- **الأسئلة سيادة السيرفر**: لا تُكوَّد الأسئلة الـ 11 في التطبيق؛ تُرسم من `questions` كما تصل. إضافة/تعديل سؤال server-side يظهر تلقائياً، والحمولة تُبنى من مفاتيح الاستجابة (لا قائمة ثابتة). الجدول في §7.1 للاختبار/التوثيق فقط.
- **التوكن**: Bearer JWT في كل نداء؛ يُدار حصراً عبر طبقة 03/05 — لا تخزين توكن ولا logging لحمولات الاستبيانات (تحوي ملاحظات حرة قد تكون شخصية).
- **الملاحظة نص حر** يُخزَّن ويُرسل كما هو؛ يُعرض (في أدوات المكان/الأدمن خارج هذا التطبيق) كنص عادي — Flutter آمن افتراضياً من الحقن؛ لا Markdown/HTML rendering. حدّ 1000 حرف client + server.
- **شاشة خفيفة**: لا صور، لا أنيميشنات مستمرة، لا مؤقتات — لا حاجة لـ `RepaintBoundary` أو تحسينات بطارية خاصة. الانتقالات (شريط التقدّم 250ms، الأزرار 150ms) عابرة ورخيصة.
- **الحجب سيادة السيرفر**: التطبيق لا يحسب `countBlockingPending`؛ يستهلك رمز `PENDING_SURVEYS` فقط. لا تُخزّن حالة حجب محلياً ولا تُبنِ عليها منطقاً — كل فعل محجوب يعيد الرمز عند محاولته.
- **حارس التكرار** في `alreadyDone` (§6.2) إلزامي لتفادي حلقة لانهائية عند بيانات سيرفر متناقضة (مجموعة `visited` + حدّ أقصى).
