# مرحلة الليل الأوتوماتيكي: الخطوات، المهل، التمويه
> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

## 1. الهدف والنطاق

هذا الملف يغطّي **تجربة اللاعب أثناء مرحلة الليل (Phase = `NIGHT`)** فقط، من منظور جهاز اللاعب. النطاق:

1. **شاشة الفعل الليلي الأوتوماتيكي (Auto-Night fullscreen takeover)** — الاستيلاء الكامل على الشاشة (`z-[200]`) عند دور اللاعب ليلاً، سواء كان اللاعب **صاحب الدور الحقيقي (performer / `isReal`)** أو **مموِّهاً (decoy / `isDecoy`)**. تعرض عنوان الدور، تعليمة الإجراء، عدّاداً دائرياً، قائمة الأهداف، زر تخطٍّ، وشاشة "تم الإرسال".
2. **الشاشة الليلية السلبية (passive)** التي يراها اللاعب داخل `PlayerPhaseView` بين الخطوات وفي النمط اليدوي (🌙 «الليل يسدل ستاره»).
3. **مودال تفعيل الممرضة (`nurse:activation-request`)** — يظهر على جهاز الممرضة فقط عندما يكون الطبيب ميتاً والممرضة حيّة.
4. **منطق المهلة (`autoNightTime`) والاختيار العشوائي (`isRandom`) عند انتهاء الوقت**، وتمييز `isReal` مقابل `isDecoy`، وسلوك الإسكات/التوأم/السفّاح/الساحرة داخل هذا التدفّق.
5. **الفرق بين نمط `auto` ونمط `manual`**: في `auto` كل لاعب حيّ يستقبل `night:action-required` ويتفاعل من جهازه؛ في `manual` **لا يتفاعل اللاعب إطلاقاً** — الليدر يُدخل كل الأفعال من كونسول الليدر، واللاعب يرى فقط الشاشة السلبية.

**خارج النطاق (مُحال لملفات أخرى):** سينمائيات الأنيميشن الليلية على شاشة العرض الكبيرة، وكشف نتيجة التحقيق/القنص/الاغتيال في الصباح → 24-morning-cinematics.md. جسم `PlayerPhaseView` لبقية المراحل → مذكور هنا فقط للجزء `NIGHT`. طاولة الحلقة `PhoneSpectatorView` → 27-spectator-gameover.md. بطاقة الدور نفسها → 22-role-cards.md. كونسول الليدر (تجهيز/إرسال/موافقة الخطوات) → 30-host-console.md.

**ثابت أمني مركزي في هذا الملف:** شاشة الـ **decoy يجب أن تكون مطابقة بكسلياً لشاشة الـ performer** (نفس العنوان، نفس العدّاد، نفس التخطيط) — الاختلاف الوحيد المسموح: التعليمة النصّية، قائمة الأهداف، وإخفاء زر التخطي. هذا هو جوهر مقاومة الغش (منع من يراقب شاشة لاعب آخر من كشف من يملك دوراً فعّالاً).

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

- **واجهة الفعل الليلي (اللاعب):** `c:/Projects/new mafia/unified-mafia/frontend/src/components/PlayerFlow.tsx`
  - المستمع `night:action-required` + `nurse:activation-request` وبدء العدّاد: أسطر **1476–1518**.
  - شاشة الفعل الليلي fullscreen (الرسم + الإرسال + التخطي + overlay الإرسال): أسطر **3771–3924**.
  - مودال تفعيل الممرضة: أسطر **3926–3960**.
  - إعادة بناء حالة الليل بعد rejoin/refresh (شبكة الأمان 500ms): أسطر **961–992**.
- **الشاشة الليلية السلبية:** `c:/Projects/new mafia/unified-mafia/frontend/src/components/PlayerPhaseView.tsx`
  - مستمع `night:step-info`: أسطر **486–489**.
  - رسم مرحلة `NIGHT`: أسطر **1050–1064**.
- **منطق الليل في السيرفر (المرجع لعقود الأحداث والحمولات):** `c:/Projects/new mafia/unified-mafia/backend/src/sockets/night.socket.ts`
  - ترتيب الطابور `NIGHT_QUEUE_ORDER` + وراثة الاغتيال `ASSASSINATION_INHERITANCE`: أسطر **35–63**.
  - `getAutoActionType` (اشتقاق actionType من الدور): أسطر **68–83**.
  - `getAutoTargets` (قوائم الأهداف لكل دور): أسطر **85–124**.
  - `dispatchAutoStepToPlayers` (بثّ `night:action-required` لكل لاعب حيّ — performer وdecoy): أسطر **324–531**.
  - منطق المهلة + الاختيار العشوائي (`isReal`/`isRandom`) + تخطّي القناص: أسطر **366–516**.
  - `night:start` (فرع auto/manual + فحص الممرضة): أسطر **536–783**.
  - `player:night-action` (استقبال إرسال اللاعب + التحقّق): أسطر **1786–1905**.
  - `nurse:activation-response`: أسطر **2045–2080**.
  - `getNextQueueStep` (وراثة الاغتيال + بديلة الممرضة): أسطر **2134–2203**.
- **المرجع الوثائقي للمحرّك:** `docs/04_NIGHT_PHASE_ENGINE.md` (مذكور في رأس `night.socket.ts`).

---

## 3. التبعيات على ملفات الخطة الأخرى

- **01-foundation-theme.md** — بذرة الثيم (الألوان، الخطوط Amiri/JetBrains Mono، Directionality RTL) واستراتيجية Window Size Classes الكاملة (§5 هنا يخصّصها فقط).
- **04-socket-layer.md** — طبقة `SocketService`: `emitWithAck(...).timeout(15s)`، إعادة `room:rejoin-player` عند reconnect، streams مكتوبة الأنواع لأحداث الليل. أحداث هذا الملف تُسجَّل هناك.
- **05-session-auth.md** — `physicalId` وهوية اللاعب المستخدمة في تمييز performer/decoy، وقراءة `mafia_session.physicalId`.
- **07-sound-system.md** — لا صوت يُشغَّل من جهاز اللاعب في هذا الملف (الصوت مصدره جهاز الليدر/العرض)؛ أي اهتزاز يمرّ عبر `HapticsService`.
- **20-game-state-core.md** — `GameSessionController`: يملك `gamePhase`، حزمة `nightActionRequired`/`nightActionCountdown`/`nightActionSubmitted`، `nurseActivationPending`، وحلقة الـ poll التي تُعيد بناء حالة الليل (§6).
- **21-join-lobby.md** — تدفّق rejoin وشبكة الأمان 500ms التي تُعيد فتح شاشة الليل منتصف الليل.
- **22-role-cards.md** — عرض بطاقة الدور (خارج شاشة الليل، لكن الدور نفسه يُعرَض هنا كنص عنوان فقط).
- **24-morning-cinematics.md** — نتيجة التحقيق/القنص/الاغتيال تظهر في `MORNING_RECAP` (عبر `display:morning-event`)، وليس على شاشة الليل. مرحلة `NIGHT` السلبية داخل `PlayerPhaseView` يشاركها هذا الملف مع 24.
- **26-notepad-mafia-chat.md** — أثناء الليل يبقى FAB المفكرة/شات المافيا ظاهراً تحت طبقة الليل (z-[90] < z-[200])؛ التفاصيل هناك.
- **27-spectator-gameover.md** — الشاشة الليلية على الحلقة `PhoneSpectatorView` (للريموت/الميت/المراقب).
- **30-host-console.md** — النظير على جهة الليدر (تجهيز/بدء/موافقة خطوات الليل، الأحداث `night:auto-step-ready`/`started`/`approval`/`progress`).

---

## 4. الواجهة والتجربة تفصيلياً

> كل الألوان والأبعاد والنصوص أدناه منسوخة حرفياً من `PlayerFlow.tsx` (3771–3960) و`PlayerPhaseView.tsx` (1050–1064). الوحدات Tailwind تُترجَم: `z-[200]`=Stack overlay أعلى، `text-4xl`≈34sp، `text-xl`≈20sp، `text-6xl`≈60sp، `text-[9px]`≈9sp، `w-16 h-16`=64dp، `w-11 h-11`=44dp، `rounded-2xl`≈16dp، `rounded-3xl`≈24dp، `space-y-2`=8dp رأسي، `px-4`=16dp، `py-3`=12dp.

### 4.1 الشاشة الليلية السلبية (passive) — داخل `PlayerPhaseView` عند `gamePhase === 'NIGHT'`

تُعرَض هذه الشاشة عندما لا توجد طبقة فعل ليلي مفتوحة (أي بين الخطوات، وطوال النمط اليدوي). التخطيط (عمود موسّط، `py-10`):

- خلفية الشاشة: خلفية اللعب العادية (`display-bg blood-vignette` أو ريموت).
- **🌙** بحجم `text-6xl` (≈60sp)، أنيميشن **نبض تنفّسي**: `scale: [1, 1.1, 1]` و`opacity: [0.7, 1, 0.7]`، `duration: 3s`, `repeat: Infinity` — بلا easing خاص (linear ضمني/إعادة عكسية framer).
- عنوان `h3`: **«الليل يسدل ستاره»** — لون `#818cf8` (indigo-300)، خط Amiri، `text-xl` bold.
- سطر فرعي `p`: **«مرحلة الليل»** — لون `#9a9a9a`، `text-xs` bold، هامش علوي `mt-3` (12dp).
- **صندوق خطوة الليل** (يظهر فقط إن وصل `night:step-info` بقيمة `roleName` غير فارغة — أي في **النمط اليدوي/الديناميكي** فقط؛ في auto لا يُبثّ هذا الحدث للاعبين): دخول `opacity 0→1, y 10→0`؛ `inline-block bg-[#111] border border-[#C5A059]/30 rounded-lg px-6 py-3`، هامش علوي `mt-6`؛ النص: **«جارٍ اختيار الهدف من قبل {roleName}...»** — لون `#C5A059`، `text-sm` bold، خط Amiri، مع `animate-pulse` (نبض شفافية مستمر).

> ملاحظة نمطية: في `auto` mode لا يستقبل جهاز اللاعب `night:step-info`، لذا الصندوق لا يظهر بين خطوات auto؛ يظهر فقط الجزء العلوي (🌙 + العنوانان). في `manual` يظهر الصندوق يتغيّر مع كل خطوة يُعلنها الليدر.

### 4.2 شاشة الفعل الليلي الأوتوماتيكي (fullscreen takeover)

**شرط الظهور:** `nightActionRequired != null && !nightActionSubmitted`. طبقة `z-[200]` تغطّي كل شيء عدا مودال تبديل الغرفة (`z-[300]`).

**الحاوية:** `fixed inset-0`، خلفية تدرّج عمودي **من الأعلى `#0a0812` عبر `#070510` إلى `#000`** (`bg-gradient-to-b from-[#0a0812] via-[#070510] to-[#000]`)، خط `Amiri, serif`. عمود مرن كامل الارتفاع داخل صنف `safe-area-inset` (حشوة المناطق الآمنة للنوتش/الأسفل).

#### 4.2.1 الرأس (`pt-8 pb-3 px-4`, موسّط)

- **🌙** `text-4xl` (≈34sp)، هامش سفلي `mb-2`، أنيميشن نبض: `scale: [1, 1.1, 1]`، `opacity: [0.7, 1, 0.7]`، `duration: 3s`, `repeat: Infinity`.
- سطر علوي صغير: **«مرحلة الليل»** — `text-[9px]` (≈9sp) `font-mono` لون `#666` `tracking-[0.2em] uppercase` هامش سفلي `mb-1`.
- **عنوان الدور** `h2` `text-xl font-black` لون `#C5A059` — نصّه مشتقّ من `nightActionRequired.stepRole` بالخريطة الحرفية التالية (منسوخة من الأسطر 3783–3791):

  | قيمة `stepRole` | النص المعروض |
  |---|---|
  | `MAFIA` | `المافيا` |
  | `GODFATHER` | `العراب` |
  | `SILENCER` | `المُسكت` |
  | `SHERIFF` | `المحقق` |
  | `DOCTOR` | `الطبيب` |
  | `NURSE` | `الممرضة` |
  | `SNIPER` | `القناص` |
  | `CHAMELEON` | `الحرباء` |
  | غير ذلك | القيمة الخام لـ `stepRole` وإلا `مجهول` |

  > تنبيه تكافؤ: `WITCH` و`ASSASSIN` و`OLDER_BROTHER` و`MAFIA_REGULAR` **ليست** في هذه الخريطة، فتُعرَض حرفياً كنصّها الإنجليزي الخام (مثلاً `WITCH`). هذا سلوك النسخة الحالية — انسخه كما هو لضمان التكافؤ (لا تُصلح الخريطة إلا بطلب صريح، لأن **العنوان يجب أن يكون متطابقاً بين performer وdecoy** — كلاهما يقرأ نفس `stepRole`).

- **تعليمة الإجراء** `p` `text-[#888] text-xs mt-1` — منطقها (منسوخ من 3793–3806):
  - إن `nightActionRequired.isDecoy === true` → **«اختر أي شخص للتمويه...»** (دائماً، مهما كان actionType).
  - وإلا حسب `nightActionRequired.actionType`:

    | `actionType` | النص |
    |---|---|
    | `KILL` | `اختر هدف الاغتيال` |
    | `INVESTIGATE` | `من تريد التحقيق معه؟` |
    | `PROTECT` | `من تريد حمايته الليلة؟` |
    | `SNIPE` | `اختر هدف القنص` |
    | `SILENCE` | `من تريد إسكاته؟` |
    | `DISABLE` | `اختر لاعباً لتعطيل قدرته` |
    | `DECOY` | `اختر أي شخص` |

    > تنبيه تكافؤ (edge): إذا وصل `actionType` غير مغطّى (مثل `ASSASSINATE` الذي يرسله السيرفر لخطوة السفّاح، أو أي قيمة أخرى) و`isDecoy===false`، فسلسلة الشروط `||` تُرجِع `false` → **لا يُعرَض أي نصّ تعليمة** (سطر فارغ). هذا سلوك النسخة الحالية؛ في Flutter عامل القيمة غير المعروفة بإرجاع نصّ فارغ (لا تخترع نصّاً).

#### 4.2.2 العدّاد الدائري (`flex justify-center py-2`)

حاوية `relative w-16 h-16` (64×64dp). عنصر SVG `viewBox 0 0 36`، مُدار `-rotate-90` (البداية من الأعلى):

- **دائرة المسار (track):** `cx=18 cy=18 r=15.5 fill=none stroke=#1a1a2e strokeWidth=3`.
- **دائرة التقدّم (progress):** `r=15.5 strokeWidth=3 strokeLinecap=round`، اللون حسب `nightActionCountdown`:
  - `≤ 5` → أحمر `#ef4444`
  - `≤ 10` (و`>5`) → كهرماني `#f59e0b`
  - غير ذلك → ذهبي `#C5A059`
- **`strokeDasharray`** = `` `${Math.max(0, (nightActionCountdown / (nightActionRequired.timeoutSeconds || 15)) * 97.4)} 97.4` `` — أي المحيط ≈ **97.4** (=2π·15.5). القيمة تمثّل الجزء المتبقّي. `timeoutSeconds` الافتراضي **15** إن غاب.
- **الانتقال:** `transition: 'stroke-dasharray 0.5s ease, stroke 0.3s ease'` (تنعيم القوس نصف ثانية، تنعيم اللون 0.3 ثانية).
- **الرقم المركزي:** `absolute inset-0` موسّط، `text-lg font-black font-mono`، القيمة `nightActionCountdown`؛ اللون: `≤5` → `text-red-400` مع `animate-pulse`؛ `≤10` → `text-amber-400`؛ غير ذلك `text-white`.

#### 4.2.3 قائمة الأهداف (`flex-1 overflow-y-auto px-4 pb-2`, `space-y-2`)

لكل عنصر في `nightActionRequired.availableTargets` (شكل العنصر `{physicalId, name, avatarUrl?}`) زرّ (motion.button) بمفتاح `physicalId`:

- **دخول:** `initial {opacity:0, y:10}` → `animate {opacity:1, y:0}`.
- **التخطيط:** `w-full flex items-center gap-3 px-4 py-3 border rounded-2xl transition-all text-right` (RTL محاذاة يمين).
- **الخلفية/الحدود:** `bg-gradient-to-r from-white/[0.03] to-transparent border-[#2a2a2a]`؛ hover: `hover:border-[#C5A059]/40 hover:bg-[#C5A059]/5`؛ active (أثناء اللمس): `active:bg-[#8A0303]/20 active:border-[#8A0303]/60` (توهّج أحمر عند الضغط).
- **الأفاتار:** دائرة `w-11 h-11` (44dp) `rounded-full border-2 border-[#C5A059]/30 overflow-hidden`:
  - إن وُجد `avatarUrl`: صورة `object-cover grayscale opacity-80` فوقها طبقة `bg-black/50` تُظهر `#{physicalId}` (`text-sm font-black text-white drop-shadow-md`).
  - إن غاب: خلفية `bg-[#C5A059]/10` مع `#{physicalId}` (`text-sm font-black text-[#C5A059]`).
- **الاسم:** `flex-1 min-w-0`، `text-white font-bold text-sm truncate`، القيمة `target.name || `لاعب #${target.physicalId}``.

#### 4.2.4 زر التخطي

يظهر **فقط** إذا `nightActionRequired.canSkip && !nightActionRequired.isDecoy` (`px-4 pb-4 pt-2`):

- زرّ `w-full py-2.5`، `text-[#666] hover:text-[#999] text-xs font-mono`، حدود `border border-[#1a1a1a] rounded-xl hover:border-[#333]`.
- النص: **«تخطي هذه الخطوة ←»**.
- عند الضغط: يرسل `player:night-action` بـ `targetPhysicalId: null` (تفاصيل §6.3).

> الـ decoy لا يرى زر التخطي إطلاقاً — يجب أن يختار أحداً للتمويه (لا خيار تخطٍّ) حتى لا يفرّق نفسه عن performer له canSkip.

#### 4.2.5 overlay «تم الإرسال» (`nightActionSubmitted === true`)

طبقة `absolute inset-0 flex items-center justify-center bg-black/90`، دخول `opacity 0→1`. المحتوى موسّط (`scale 0.8→1`):

- **✅** `text-6xl mb-4`، نبض `scale: [1, 1.2, 1]`, `duration: 1.5s`, `repeat: Infinity`.
- **«تم الإرسال»** — `text-white font-black text-xl`.
- **`WAITING FOR RESULTS...`** — `text-[#666] text-xs font-mono mt-2 tracking-widest`.

يُغلق تلقائياً بعد **1500ms** من الإرسال (§6.3).

### 4.3 مودال تفعيل الممرضة (`nurseActivationPending === true`)

طبقة `fixed inset-0 z-[200] bg-black/95 flex items-center justify-center px-4`، خط Amiri. بطاقة `bg-[#111] border border-[#C5A059]/30 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl`:

- **🏥** `text-5xl mb-4`.
- **«الممرضة»** — `text-2xl font-black text-[#C5A059] mb-2`.
- النص (`text-gray-300 text-sm mb-6 leading-relaxed`، خطاب مؤنّث، سطران بفاصل `<br/>`): **«الطبيب غير متاح هذه الليلة.»** ثم **«هل تريدين تفعيل صلاحية الحماية؟»**.
- صفّ زرّين (`flex gap-3`):
  - **«لا، تخطي»** — `flex-1 py-3 rounded-xl border border-[#333] bg-black/60 text-[#888] font-bold text-sm` → يُغلق المودال ويرسل `nurse:activation-response {roomId, activate: false}`.
  - **«نعم، أريد الحماية»** — `flex-1 py-3 rounded-xl bg-gradient-to-r from-[#C5A059] to-[#b38b47] text-black font-black text-sm` → يُغلق المودال ويرسل `nurse:activation-response {roomId, activate: true}`.

> ترتيب المعالج (كلا الزرّين): `setNurseActivationPending(false)` **أولاً**، ثم `if (!emit) return;`، ثم `await emit(...).catch(()=>{})`. أي الإغلاق فوري بصرياً بلا انتظار ack.

### 4.4 الحالات الفارغة/الخطأ

- **لا أهداف (`availableTargets` فارغة):** القائمة تُرسَم فارغة (لا نصّ بديل في النسخة الحالية). في الممارسة لا تحدث لأن السيرفر يضمن أهدافاً أو يتخطّى الخطوة. لا تخترع حالة فارغة نصّية غير موجودة.
- **فشل إرسال `player:night-action`:** الخطأ **يُبتلع** (`.catch(() => {})`) — لا رسالة خطأ للمستخدم؛ الشاشة تُغلق بعد 1500ms على أي حال (السيرفر سيختار عشوائياً عند انتهاء مهلته إن لزم). لا تُظهر SnackBar خطأ (تكافؤ مطلوب).
- **انقطاع الاتصال أثناء فتح الشاشة:** الشاشة تبقى مفتوحة والعدّاد يستمر محلياً؛ عند إعادة الاتصال + rejoin، شبكة الأمان تُعيد بناء الحالة (§6.4).

---

## 5. التكيّف مع الشاشات 6→11 إنش

الاستراتيجية الكاملة (Window Size Classes) موثّقة في 01-foundation-theme.md. تخصيص **شاشة الليل** لهذا الملف:

**compact (< 600dp — هواتف 6–7 إنش):** التخطيط كما في الـ PWA حرفياً — عمود واحد كامل العرض. العدّاد 64dp، الأفاتار 44dp، قائمة الأهداف تملأ العرض مع تمرير رأسي (`flex-1 overflow-y-auto`). هذه هي الحالة المرجعية.

**medium (600–840dp — تابلت 8 إنش):**
- سقف عرض المحتوى النصّي والقائمة **640dp**، موسّط أفقياً (`Center` + `ConstrainedBox(maxWidth: 640)`).
- **العدّاد الدائري عنصر توقيت حسّاس → يُضاعَف حجمه** إلى ≈**96–100dp** (بدل تمديده)، والرقم المركزي يتبع نسبياً.
- صفوف الأهداف: ارتفاع أكبر (`py` ≈16dp)، الأفاتار ≈**56dp**، حجم الاسم يرتفع درجة.
- الرأس (🌙 + العنوان + التعليمة) يبقى موسّطاً مع هوامش أوسع.

**expanded (> 840dp — تابلت 10–11 إنش):**
- سقف عرض **840–960dp** للعمود، موسّط، مع هوامش جانبية سخيّة (الخلفية المتدرّجة تملأ الشاشة كاملة).
- **مضاعفة عناصر اللعب الحسّاسة:** العدّاد الدائري ≈**128dp**، الرقم بحجم مضاعف؛ الأفاتار ≈**64dp**؛ عناوين الرأس أكبر بدرجة.
- قائمة الأهداف تبقى عموداً واحداً (لا تتحوّل لشبكة) — القرار الليلي **حسّاس ويجب ألا يشتّت**؛ لكن يمكن رفع الحدّ الأقصى لعرض العنصر مع إبقائه موسّطاً. لا two-pane (شاشة الليل استيلاء كامل بطبيعتها).
- مودال الممرضة: البطاقة تبقى `max-w-sm` (≈384dp) موسّطة في كل الفئات (لا تتمدّد).

> ثابت أمني عبر كل الفئات: **يجب أن يبقى تخطيط performer وdecoy متطابقاً بكسلياً** — أي تغيير حجم يُطبَّق على الاثنين معاً. لا تُميّز الـ decoy بأي فرق أبعاد.

---

## 6. المنطق والتدفقات

### 6.1 آلة الحالة للفعل الليلي (على مستوى اللاعب)

المتغيّرات (تعيش في `GameSessionController` — راجع 20-game-state-core.md):

```
nightActionRequired : { actionType, availableTargets[], timeoutSeconds, canSkip, stepRole?, isDecoy? } | null
nightActionCountdown : int
nightActionSubmitted : bool
selectedTargetForConfirm : int | null   // مُعرَّف لكن غير مستخدم في الرسم الحالي
nurseActivationPending : bool
```

الحالات:
1. **مغلق** (`nightActionRequired == null`) → لا طبقة؛ اللاعب يرى الشاشة السلبية §4.1.
2. **مفتوح — نشِط** (`nightActionRequired != null && !nightActionSubmitted`) → شاشة §4.2 مع العدّاد يعمل.
3. **مفتوح — مُرسَل** (`nightActionSubmitted === true`) → overlay «تم الإرسال» §4.2.5.
4. الانتقال 3→1 بعد 1500ms.

### 6.2 استقبال الخطوة وبدء العدّاد (`night:action-required`)

عند وصول الحدث (auto mode فقط؛ يصل لكل لاعب حيّ — performer وdecoy):
1. `setNightActionRequired(data)` — حيث `data = {actionType, availableTargets, timeoutSeconds, canSkip, stepRole, isDecoy}`.
2. `setNightActionSubmitted(false)`, `setSelectedTargetForConfirm(null)`.
3. `setNightActionCountdown(data.timeoutSeconds)`.
4. بدء `Timer.periodic(1s)`: في كل تكّة، إن `prev <= 1`:
   - أوقف المؤقّت.
   - **بعد 2000ms**: `setNightActionSubmitted(true)` (يُظهر overlay «تم الإرسال»).
   - **بعد 2000ms + 1500ms**: `setNightActionRequired(null)` (يُغلق الشاشة).
   - أرجِع 0.
   - وإلا `prev - 1`.

> ملاحظة حرجة: عند انتهاء المهلة **العميل لا يرسل شيئاً** — السيرفر يختار عشوائياً بنفسه (§6.5). العميل يعرض «تم الإرسال» تجميلياً فقط. لا تُرسل `player:night-action` عند الصفر.

> Bug ويب معروف **لا يُنقَل**: المستمعان `night:action-required` و`nurse:activation-request` يُسجَّلان بلا cleanup للاشتراك (`return` ينظّف المؤقّت فقط) — تسريب عند إعادة التركيب. في Flutter ألغِ كل `StreamSubscription` في `dispose`/`onClose`.

### 6.3 الإرسال والتخطي (`player:night-action`)

**عند لمس هدف:**
1. حارس: `if (emit == null || nightActionSubmitted) return;`.
2. `setNightActionSubmitted(true)` (فوري — يمنع الإرسال المزدوج ويُظهر overlay).
3. أوقف مؤقّت العدّاد (`clearInterval(nightCountdownRef)`).
4. `await emit('player:night-action', { roomId, actionType: nightActionRequired.actionType, targetPhysicalId: target.physicalId }).catch(() => {})`.
5. `Timer(1500ms, () => setNightActionRequired(null))` — يُغلق الشاشة بعد 1.5 ثانية.

**عند لمس «تخطي»:** نفس التسلسل لكن `targetPhysicalId: null`.

> إرسال أحادي صارم: `nightActionSubmitted` يُضبط قبل `await`، والمؤقّت يُلغى فوراً. لا optimistic UI للنتيجة — العميل لا يعرف حصيلة فعله ليلاً (تظهر في الصباح).

> بالنسبة للـ **decoy**: العميل يرسل `actionType` كما وصله (في dispatch الحيّ = actionType الحقيقي للخطوة مثل `KILL`؛ بعد rejoin = `'DECOY'`) و`targetPhysicalId` لأي هدف. **السيرفر يتجاهل هدف الـ decoy** لأن `isRoleOwner === false` (يُسجَّل فقط كـ choice بـ `isReal:false` لعرض تقدّم الليدر). فلا أثر لعبيّاً لاختيار الـ decoy — لكن يجب أن يرسله (وإلا انكشف كغير-مُرسِل في تقدّم الليدر). انسخ السلوك.

### 6.4 تمييز performer (`isReal`) مقابل decoy (`isDecoy`) — على مستوى الحمولة

- السيرفر (`dispatchAutoStepToPlayers`) يبثّ لكل لاعب حيّ:
  - `isDecoy = (player.physicalId !== nextStep.performerPhysicalId)`.
  - `availableTargets = isPerformer ? nextStep.availableTargets : decoyTargets` (حيث `decoyTargets` = **كل الأحياء** `{physicalId, name, avatarUrl}`).
  - `actionType`, `stepRole`, `timeoutSeconds`, `canSkip` **متطابقة للجميع**.
- إذن الفروق المرئية الوحيدة بين performer وdecoy: (1) نصّ التعليمة (decoy → «اختر أي شخص للتمويه...»)، (2) قائمة الأهداف (decoy → كل الأحياء)، (3) إخفاء زر التخطي للـ decoy. **كل ما عدا ذلك متطابق** (العنوان، العدّاد، الألوان، الأبعاد، الأنيميشن).
- ملاحظة تكافؤ: في `autoNightChoices` جهة السيرفر، `isReal` هو نظير `isRoleOwner`؛ الاختيارات الوهمية للـ decoy تُخزَّن بـ `isReal:false`. هذا لعرض الليدر فقط ولا يظهر للاعب.

### 6.5 المهلة والاختيار العشوائي (`autoNightTime` / `isRandom`) — سلوك السيرفر (مرجع للتكافؤ)

عند انتهاء مؤقّت السيرفر (`autoNightTime * 1000ms`, افتراضي 15s) دون إرسال صاحب الدور:
- **القناص (`SNIPER`):** لا اختيار عشوائي — **تخطٍّ** (`sniperTarget = null`)، ويُسجَّل choice بـ `isReal:true, isRandom:true` (لأن قنص مواطن = موت القناص + الهدف، مخاطرة كبيرة للعشوائية).
- **بقية الأدوار:** اختيار هدف عشوائي من `availableTargets` (`randomTarget = targets[floor(random*len)]`)، يُسجَّل في `nightActions` حسب الدور + `randomSelections[ROLE] = true`، وchoice بـ `isReal:true, isRandom:true`. للشريف يُحسَب ويُرسَل `night:sheriff-result` (لكن **العميل لا يستمع له** — انظر §7).
- كل لاعب حيّ لم يُرسِل (بمن فيهم الـ decoy) يُعطى choice عشوائي وهمي `isReal: (physicalId === performerId), isRandom:true`.
- ثم `autoNightStepApproval = true` وتُرسَل `night:auto-step-approval` **للليدر فقط** (مراجعة الاختيارات قبل الانتقال للخطوة التالية).

> على جهاز اللاعب: كل هذا شفّاف — العميل يرى فقط انتهاء عدّاده ثم overlay «تم الإرسال» ثم إغلاق. لا تُنفّذ منطق العشوائية في العميل.

### 6.6 نمط `auto` مقابل `manual`

- **`state.config.nightMode === 'auto'`**: كل لاعب حيّ يتلقّى `night:action-required` ويتفاعل. الخطوات تُدار خطوة-خطوة: الليدر يجهّز الخطوة (`night:auto-step-ready`) ثم يبدؤها (`dispatchAutoStepToPlayers` → `night:action-required` للجميع) → اللاعبون يختارون → عند اكتمال الجميع أو انتهاء المهلة → شاشة موافقة الليدر → الخطوة التالية. اللاعب قد يرى شاشة الليل **مرة لكل خطوة يكون فيها حيّاً** (حتى 7 خطوات: عراب/اغتيال، قص/إسكات، ساحرة/تعطيل، شريف/تحقيق، طبيب/حماية، قناص/قنص، سفّاح).
- **`state.config.nightMode !== 'auto'` (manual/dynamic)**: **لا `night:action-required` للاعبين إطلاقاً**. الليدر يُدخل كل فعل من كونسوله (`night:submit-action`/`night:skip-action`)، ويستقبل اللاعبون فقط `night:step-info` لعرض الشاشة السلبية §4.1 مع صندوق «جارٍ اختيار الهدف من قبل {roleName}...». لا تفاعل من اللاعب.

> في Flutter: طبقة الفعل الليلي تُبنى وتُشغَّل بمجرد وصول `night:action-required` بغضّ النظر عن معرفة النمط؛ لا حاجة لقراءة `nightMode` في العميل (السيرفر لا يبثّ الحدث في manual). لكن وثّق الفرق في QA (§12).

### 6.7 وراثة الاغتيال والإسكات والتوأم والساحرة (سياق للتكافؤ)

- **وراثة الاغتيال (خانة القتل):** إن مات الشيخ/العراب، ينتقل الدور الفاعل حسب `ASSASSINATION_INHERITANCE`: `GODFATHER → CHAMELEON → SILENCER → OLDER_BROTHER (التوأم الأكبر) → MAFIA_REGULAR`. يعني `performerPhysicalId` لخانة القتل قد يكون لاعباً غير الشيخ. العميل لا يعرف/لا يعرض هذا — يستقبل فقط `night:action-required` مع `stepRole` (غالباً `GODFATHER`/`MAFIA` لخطوة القتل) و`isDecoy`.
- **الإسكات (`SILENCER`):** الوارث للقتل قد يكون القص نفسه؛ خطوة الإسكات منفصلة (`canSkip=true`). أهداف القص = كل الأحياء. الإسكات يبقى ليوم واحد ويُصفَّر في بداية الليل التالي.
- **التوأم (`OLDER_BROTHER`):** يظهر في سلسلة وراثة الاغتيال قبل المافيا العادي. تحوّل التوأم (الأصغر → مافيا عند موت الأكبر) يُبثّ عبر `mafia:team-updated`/سينمائية `TWIN_TRANSFORM` (خارج شاشة الليل — راجع 24/26). على شاشة الليل، بعد التحوّل، التوأم المتحوّل قد يصبح performer لخطوة قتل لاحقة.
- **الساحرة (`WITCH`):** `actionType = DISABLE`؛ أهدافها = مواطنون/محايدون أحياء عدا الشرطية ونفسها والأهداف السابقة (`witchPreviousTargets`). عنوان الرأس لخطوة الساحرة = `WITCH` خام (غير مُترجَم في الخريطة) — تكافؤ مطلوب.
- **الممرضة (`NURSE`):** تحلّ محلّ الطبيب الميت (بعد قبولها في المودال §4.3)؛ `actionType = PROTECT`؛ العنوان `الممرضة`.

### 6.8 إعادة الاتصال واستعادة الحالة (rejoin / refresh)

**شبكة الأمان بعد rejoin (500ms، من `room:get-my-state`)** — إذا `res.nightState && res.phase === 'NIGHT' && !res.nightState.playerSubmitted`:
1. `myPhysId = int(physicalId)`, `isPerformer = (myPhysId === ns.autoNightPerformerId)`.
2. `stepActionType` مشتقّ من `ns.autoNightStepRole` بالخريطة:
   - `SHERIFF → INVESTIGATE`
   - `DOCTOR | NURSE → PROTECT`
   - `SNIPER → SNIPE`
   - `WITCH → DISABLE`
   - `SILENCER && !isPerformer → DECOY`
   - غير ذلك → `KILL`
3. `setNightActionRequired({ actionType: isPerformer ? stepActionType : 'DECOY', availableTargets: ns.nightStep.availableTargets || [], timeoutSeconds: ns.config.autoNightTime || 15, canSkip: ns.nightStep.canSkip || false, stepRole: ns.autoNightStepRole, isDecoy: !isPerformer })`.
4. `setNightActionSubmitted(false)`, `setSelectedTargetForConfirm(null)`.
5. العدّاد يبدأ من `Math.max(3, ns.config.autoNightTime || 15)` (تقريبي — لا يُحسَب المتبقّي الدقيق من deadline على جهة اللاعب)، بمؤقّت 1s ينزل حتى 0 (بلا منطق الإغلاق-بعد-صفر هنا — يتوقّف فقط).

> فرق تكافؤ مقصود: بعد rejoin، actionType للـ decoy يصبح `'DECOY'` (بدل actionType الحقيقي في dispatch الحيّ). بلا أثر مرئي لأن منطق التعليمة يفحص `isDecoy` أولاً وزر التخطي مخفيّ للـ decoy. انسخه كما هو.

> شرط `!res.nightState.playerSubmitted`: إن كان اللاعب قد أرسل فعله فعلاً قبل الـ refresh، لا يُعاد فتح الشاشة (يُظهر السيرفر أنه أرسل).

### 6.9 المؤقّتات والمهل — ملخّص

| المؤقّت | المدّة | المصدر |
|---|---|---|
| عدّاد العرض الليلي | ينزل من `timeoutSeconds` (افتراضي 15) كل 1s | العميل (`nightCountdownRef`) |
| عدّاد ما بعد rejoin | من `max(3, autoNightTime\|\|15)` كل 1s | العميل |
| تأخير «تم الإرسال» بعد انتهاء المهلة | 2000ms ثم +1500ms للإغلاق | العميل |
| تأخير الإغلاق بعد الإرسال اليدوي | 1500ms | العميل |
| مهلة الخطوة الفعلية (اختيار عشوائي) | `autoNightTime * 1000` (افتراضي 15000ms) | **السيرفر** (`autoNightStepDeadline`) |
| نبض 🌙 / ✅ | 3s / 1.5s حلقي | العميل (أنيميشن) |
| انتقال قوس العدّاد | 0.5s ease (dasharray) + 0.3s ease (اللون) | العميل |

> العدّاد العميل وعدّاد السيرفر مستقلّان وقد ينحرفان قليلاً (العميل يبدأ عند وصول الحدث، السيرفر عند الإرسال). لا تحاول مزامنتهما — انسخ السلوك (العميل تجميلي، السيرفر مرجعي).

---

## 7. عقود التكامل

### 7.1 REST

**لا شيء.** مرحلة الليل بالكامل عبر Socket. (نقاط REST العامة في 03-networking-rest.md.)

### 7.2 Socket — Emits (من جهاز اللاعب)

| الحدث | الاتجاه | الحمولة | متى | الـ ack |
|---|---|---|---|---|
| `player:night-action` | اللاعب → السيرفر | `{ roomId: string, actionType: string, targetPhysicalId: number \| null }` | لمس هدف (targetPhysicalId=رقم) أو «تخطي» (=null) | `{ success: true }` أو `{ success: false, error }` — **الخطأ يُبتلع في العميل** |
| `nurse:activation-response` | اللاعب → السيرفر | `{ roomId: string, activate: boolean }` | زرّا مودال الممرضة | `{ success }` — يُبتلع |

**قيم `actionType` المسموحة (من السيرفر):** `KILL | INVESTIGATE | PROTECT | SNIPE | SILENCE | DECOY` (تعليق السيرفر). ملاحظة: dispatch الحيّ يرسل actionType للـ decoy مساوياً لـ actionType الحقيقي للخطوة (قد يكون `ASSASSINATE` لخطوة السفّاح)؛ العميل يعيد إرساله كما استقبله.

**أخطاء `player:night-action` من السيرفر (للمرجع — كلها تُبتلع في العميل):** `Only players`, `Room not found`, `Not night phase`, `Not auto mode`, `Player not alive`, `Already submitted`, `No active step`.

### 7.3 Socket — Listeners (على جهاز اللاعب)

| الحدث | الاتجاه | الحمولة | الأثر |
|---|---|---|---|
| `night:action-required` | السيرفر → اللاعب | `{ actionType: string, availableTargets: {physicalId:number, name:string, avatarUrl?:string\|null}[], timeoutSeconds: number, canSkip: boolean, stepRole: string, isDecoy: boolean }` | فتح شاشة الفعل الليلي + بدء العدّاد (§6.2). يصل لكل لاعب حيّ في auto mode (performer وdecoy). |
| `nurse:activation-request` | السيرفر → الممرضة فقط | `{ message: string }` | `nurseActivationPending = true` (النص `message` **لا يُعرَض** — الواجهة تستخدم نصّاً ثابتاً §4.3). |
| `night:step-info` | السيرفر → الغرفة (manual/dynamic فقط) | `{ roleName: string, stepType: string }` | يُغذّي `nightStepInfo` في `PlayerPhaseView` (الشاشة السلبية §4.1). |

**غير مُستمَع له على جهاز اللاعب (مهمّ):** `night:sheriff-result` — السيرفر يرسله لسوكت الشريف في auto mode، لكن **`PlayerFlow`/`PlayerPhaseView` لا يسجّلان مستمعاً له**. نتيجة تحقيق الشريف تصل اللاعب في `MORNING_RECAP` عبر `display:morning-event` نوع `SHERIFF_RESULT` (راجع 24-morning-cinematics.md). لا تُضِف مستمعاً له في العميل (تكافؤ).

**أحداث الليل الأخرى (`night:auto-step-ready`/`started`/`approval`/`progress`, `night:animation`, `night:queue-step`/`complete`):** كلها **للّيدر/العرض فقط**، ليست لجهاز اللاعب → 30-host-console.md / 24-morning-cinematics.md.

### 7.4 حقول `nightState` من `room:get-my-state` (لإعادة البناء — §6.8)

```
res.phase : 'NIGHT'
res.nightState : {
  playerSubmitted : boolean,
  autoNightPerformerId : number,
  autoNightStepRole : string,        // GODFATHER|SILENCER|WITCH|SHERIFF|DOCTOR|NURSE|SNIPER|ASSASSIN|...
  nightStep : { availableTargets: {physicalId,name,avatarUrl?}[], canSkip: boolean },
  config : { autoNightTime : number } // افتراضي 15
}
```

---

## 8. نماذج Dart المطلوبة

```dart
/// حمولة night:action-required + الحالة المُعاد بناؤها بعد rejoin.
class NightActionRequest {
  final String actionType;           // KILL|INVESTIGATE|PROTECT|SNIPE|SILENCE|DISABLE|DECOY|ASSASSINATE|...
  final List<NightTarget> availableTargets;
  final int timeoutSeconds;          // افتراضي 15 إن غاب
  final bool canSkip;
  final String? stepRole;            // MAFIA|GODFATHER|SILENCER|SHERIFF|DOCTOR|NURSE|SNIPER|CHAMELEON|WITCH|ASSASSIN|...
  final bool isDecoy;

  const NightActionRequest({
    required this.actionType,
    required this.availableTargets,
    required this.timeoutSeconds,
    required this.canSkip,
    this.stepRole,
    this.isDecoy = false,
  });

  factory NightActionRequest.fromJson(Map<String, dynamic> j) => NightActionRequest(
    actionType: j['actionType'] as String,
    availableTargets: (j['availableTargets'] as List? ?? const [])
        .map((e) => NightTarget.fromJson(e as Map<String, dynamic>)).toList(),
    timeoutSeconds: (j['timeoutSeconds'] as num?)?.toInt() ?? 15,
    canSkip: j['canSkip'] as bool? ?? false,
    stepRole: j['stepRole'] as String?,
    isDecoy: j['isDecoy'] as bool? ?? false,
  );
}

class NightTarget {
  final int physicalId;
  final String name;
  final String? avatarUrl;
  const NightTarget({required this.physicalId, required this.name, this.avatarUrl});
  factory NightTarget.fromJson(Map<String, dynamic> j) => NightTarget(
    physicalId: (j['physicalId'] as num).toInt(),
    name: (j['name'] as String?) ?? '',
    avatarUrl: j['avatarUrl'] as String?,
  );
  String get displayName => name.isNotEmpty ? name : 'لاعب #$physicalId';
}

/// حمولة إرسال فعل اللاعب.
class NightActionSubmit {
  final String roomId;
  final String actionType;
  final int? targetPhysicalId; // null = تخطٍّ
  const NightActionSubmit({required this.roomId, required this.actionType, this.targetPhysicalId});
  Map<String, dynamic> toJson() => {
    'roomId': roomId, 'actionType': actionType, 'targetPhysicalId': targetPhysicalId,
  };
}

/// nightState من room:get-my-state (إعادة البناء).
class NightResumeState {
  final bool playerSubmitted;
  final int autoNightPerformerId;
  final String autoNightStepRole;
  final List<NightTarget> availableTargets;
  final bool canSkip;
  final int autoNightTime; // config.autoNightTime, افتراضي 15
  const NightResumeState({
    required this.playerSubmitted,
    required this.autoNightPerformerId,
    required this.autoNightStepRole,
    required this.availableTargets,
    required this.canSkip,
    required this.autoNightTime,
  });
}

/// حالة UI للفعل الليلي (داخل الكونترولر).
class NightActionUiState {
  final NightActionRequest? request; // null = لا شاشة
  final int countdown;
  final bool submitted;
  const NightActionUiState({this.request, this.countdown = 0, this.submitted = false});
}

enum NightActionType { kill, investigate, protect, snipe, silence, disable, decoy, unknown }
```

**خرائط نصّية ثابتة (const):**
- `stepRoleTitleAr`: `{MAFIA:'المافيا', GODFATHER:'العراب', SILENCER:'المُسكت', SHERIFF:'المحقق', DOCTOR:'الطبيب', NURSE:'الممرضة', SNIPER:'القناص', CHAMELEON:'الحرباء'}` — أي مفتاح آخر → القيمة الخام، وإلا `'مجهول'`.
- `actionInstructionAr`: `{KILL:'اختر هدف الاغتيال', INVESTIGATE:'من تريد التحقيق معه؟', PROTECT:'من تريد حمايته الليلة؟', SNIPE:'اختر هدف القنص', SILENCE:'من تريد إسكاته؟', DISABLE:'اختر لاعباً لتعطيل قدرته', DECOY:'اختر أي شخص'}` — غير معروف → نصّ فارغ.

---

## 9. الحزم المستخدمة

- `socket_io_client` — استقبال/إرسال أحداث الليل (`emitWithAck(...).timeout(15s)` عبر SocketService في 04-socket-layer.md).
- `flutter/material` + `dart:async` (`Timer`, `Timer.periodic`) — العدّادات والمهل.
- `flutter_animate` أو `AnimationController` — نبض 🌙/✅ (حلقي)، دخول صفوف الأهداف (fade+rise)، overlay «تم الإرسال» (scale).
- `CustomPaint` (`Canvas.drawArc`, بداية `-90°`, `StrokeCap.round`) — العدّاد الدائري (بديل SVG). أو `CircularProgressIndicator(value:)` مع عتبات لون. التوهّج عبر `MaskFilter.blur` اختياري (النسخة الحالية بلا توهّج على هذا العدّاد تحديداً — فقط لون + انتقال).
- `google_fonts` (Amiri + JetBrains Mono) — العناوين والأرقام.
- لا حزمة صوت في هذا الملف.

---

## 10. اختلافات Android / iOS

**لا اختلافات جوهرية في الواجهة.** تبرير: لا اهتزاز خاص بالفعل الليلي في النسخة الحالية (لا `navigator.vibrate` في شاشة الليل — الاهتزاز مقترن بأحداث أخرى كتعيين الدور والمقعد في ملفات أخرى)، ولا صوت من جهاز اللاعب. النقاط الوحيدة ذات الحسّاسية بالمنصّة:
- **`safe-area-inset`**: الشاشة تستخدم حشوة المناطق الآمنة — على iOS (نوتش/شريط أسفل) استخدم `SafeArea` كاملاً؛ على Android بحوافّ الإيماءات استخدم `SafeArea` أيضاً. سلوك متطابق عبر `SafeArea` القياسي.
- **رسم الإيموجي (🌙 ✅ 🏥):** مجموعات الإيموجي تختلف بين المنصّتين؛ هذه الثلاثة بسيطة بلا ZWJ → آمنة. تحقّق بصرياً فقط.
- **خلفية التدرّج الداكنة جداً (`#000`):** على شاشات OLED (شائعة في الطرفين) تظهر سوداء نقية — مقصود.

---

## 11. الأصول المطلوبة

- **لا صور/أصوات/lottie.** كل العناصر إيموجي أو أشكال مرسومة (SVG→CustomPaint).
- **الإيموجي:** 🌙 (الرأس + الشاشة السلبية)، ✅ (overlay الإرسال)، 🏥 (مودال الممرضة)، ← (سهم زر التخطي، نصّي).
- **أفاتار الأهداف:** `avatarUrl` من حمولة `availableTargets` (شبكة)؛ fallback = دائرة برقم `#{physicalId}` (لا صورة محليّة مطلوبة).
- **الخطوط:** Amiri (العناوين والعربية)، JetBrains Mono / أي mono (الرقم المركزي للعدّاد، الملصقات الإنجليزية `WAITING FOR RESULTS...` و«مرحلة الليل» العلوي).

---

## 12. معايير القبول — checklist تكافؤ

الفعل الليلي (auto mode):
- [ ] عند `night:action-required` تُفتح طبقة `z-[200]` بخلفية التدرّج `#0a0812→#070510→#000` وخط Amiri.
- [ ] 🌙 ينبض `scale [1,1.1,1]`/`opacity [0.7,1,0.7]` 3s حلقي.
- [ ] السطر العلوي «مرحلة الليل» بـ mono ذهبي رمادي `#666` `tracking-[0.2em]` uppercase.
- [ ] عنوان الدور يطابق خريطة `stepRole` حرفياً (بما فيها الخام لـ WITCH/ASSASSIN وإلا «مجهول»).
- [ ] تعليمة الإجراء: decoy → «اختر أي شخص للتمويه...»؛ وإلا حسب `actionType` بالخريطة الحرفية؛ actionType غير معروف → سطر فارغ.
- [ ] العدّاد الدائري 64dp، محيط 97.4، dasharray = `max(0,(countdown/(timeoutSeconds||15))*97.4)`، لون ≤5 أحمر `#ef4444` / ≤10 كهرماني `#f59e0b` / وإلا ذهبي `#C5A059`، انتقال 0.5s/0.3s.
- [ ] الرقم المركزي mono، أحمر نابض ≤5، كهرماني ≤10، أبيض وإلا.
- [ ] صفوف الأهداف: أفاتار 44dp (grayscale+overlay رقم مع صورة / رقم ذهبي بدونها)، اسم `target.name || «لاعب #{id}»`، active أحمر `#8A0303/20`.
- [ ] زر «تخطي هذه الخطوة ←» يظهر **فقط** عند `canSkip && !isDecoy`.
- [ ] لمس هدف → إرسال أحادي (`nightActionSubmitted` قبل await + إلغاء العدّاد) + `player:night-action {roomId, actionType, targetPhysicalId}` + إغلاق بعد 1500ms.
- [ ] «تخطي» يرسل `targetPhysicalId: null`.
- [ ] overlay «تم الإرسال»: ✅ ينبض `scale [1,1.2,1]` 1.5s + «تم الإرسال» + `WAITING FOR RESULTS...`.
- [ ] عند انتهاء العدّاد (0): **لا إرسال**؛ بعد 2000ms يظهر «تم الإرسال»، بعد +1500ms يُغلق.
- [ ] فشل الإرسال يُبتلع بلا رسالة خطأ؛ الشاشة تُغلق على أي حال.

التمويه (decoy) والأمان:
- [ ] شاشة decoy مطابقة بكسلياً لشاشة performer عدا: نصّ التعليمة، قائمة الأهداف (كل الأحياء)، غياب زر التخطي.
- [ ] عنوان الدور والعدّاد والألوان والأبعاد متطابقة بين performer وdecoy.
- [ ] الـ decoy يرسل فعله (بلا أثر لعبيّ) — لا يظهر كغير-مُرسِل.

الممرضة:
- [ ] `nurse:activation-request` (على جهاز الممرضة فقط) يفتح مودال 🏥 «الممرضة» بالنصّ المؤنّث.
- [ ] «لا، تخطي» / «نعم، أريد الحماية» يُغلقان فوراً ويرسلان `nurse:activation-response {roomId, activate}`.

النمط اليدوي والشاشة السلبية:
- [ ] في manual mode لا تظهر شاشة الفعل الليلي إطلاقاً؛ اللاعب يرى الشاشة السلبية.
- [ ] الشاشة السلبية: 🌙 6xl ينبض + «الليل يسدل ستاره» (indigo-300) + «مرحلة الليل» (`#9a9a9a`).
- [ ] صندوق «جارٍ اختيار الهدف من قبل {roleName}...» يظهر فقط عند وصول `night:step-info` (manual/dynamic).

الصمود:
- [ ] بعد refresh/rejoin منتصف الليل (`nightState.phase==='NIGHT' && !playerSubmitted`) تُعاد شاشة الليل باشتقاق actionType الصحيح (performer) أو `DECOY`، والعدّاد من `max(3, autoNightTime||15)`.
- [ ] `night:sheriff-result` **غير مُستمَع له** على جهاز اللاعب (النتيجة تظهر في الصباح فقط).
- [ ] اشتراكات مستمعي الليل تُلغى في dispose (لا تسريب).

---

## 13. ملاحظات أداء وأمان

- **أمان — تطابق decoy البكسلي:** أعلى أولوية. أي فرق بصري بين performer وdecoy (عدا الثلاثة المسموحة) يكسر مقاومة الغش. اجعل الودجت واحداً مُبارمتراً بـ `isDecoy` فقط، ولا تُميّز أبداً في الأبعاد/الألوان/الأنيميشن. اختبار بصري إلزامي جنباً إلى جنب.
- **أمان — أحادية الإرسال:** اضبط `submitted=true` وألغِ المؤقّت **قبل** `await` لمنع الإرسال المزدوج والنقر السريع؛ السيرفر أيضاً يرفض بـ `Already submitted` لكن لا تعتمد عليه وحده.
- **أمان — لا كشف نتيجة:** لا optimistic UI لحصيلة الفعل؛ نتيجة التحقيق/القنص/الاغتيال تصل حصراً في الصباح. لا تعرض أي مؤشّر «أصبت/أخطأت» ليلاً.
- **أداء — العدّاد:** استخدم `TweenAnimationBuilder`/`CustomPaint` مع `RepaintBoundary` حول العدّاد كي لا يُعيد رسم القائمة كل تكّة. تجنّب `setState` على الشجرة كاملة كل ثانية — افصل عدّاد العرض في ودجت خاصّ.
- **أداء — قائمة الأهداف:** ≤27 عنصراً (سقف الغرفة) → `ListView`/`Column` عادي داخل `SingleChildScrollView` كافٍ؛ صور الأفاتار مع `cacheWidth` صغير (44–64px) وتلاشي grayscale عبر `ColorFiltered`.
- **أداء/بطارية — wake lock:** فعّل `wakelock_plus` أثناء وجود `nightActionRequired != null` (وطوال `done`/`rejoined`) كي لا تُطفأ الشاشة ويفوت اللاعب مهلته القصيرة.
- **الخلفية/الاستيقاظ:** مؤقّتات Flutter تستمر في الخلفية، لكن socket قد يموت؛ عند العودة للمقدّمة أعِد الاتصال ثم `room:rejoin-player` ثم اعتمد شبكة الأمان (§6.8) لإعادة فتح الشاشة إن لزم. أوقف poll الـ 3 ثوانٍ في الخلفية (20-game-state-core.md).
- **تسريب المستمعين:** لا تكرّر Bug الويب — ألغِ كل `StreamSubscription` لأحداث الليل في `dispose`.
- **حروف العربية:** لا تطبّق `letterSpacing` على النصوص العربية (يكسر الوصل)؛ الملصقات mono الإنجليزية فقط تقبل tracking.
