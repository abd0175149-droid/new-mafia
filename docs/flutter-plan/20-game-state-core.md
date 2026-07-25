# قلب اللعبة: GameSessionController، آلة المراحل، المزامنة والاستعادة
> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

---

## 1. الهدف والنطاق

هذا الملف يوثّق **العمود الفقري لتجربة اللعب داخل الجيم**: المتحكّم (`GameSessionController`) الذي يملك اتصال الـ socket، ودورة الـ persistence، وحلقة الاستطلاع (polling)، وآلة حالة `Step`، وآلة مراحل اللعب `Phase`، وكل منطق الصمود (reconnect / العودة من الخلفية / rejoin / التجميد). في النسخة الحالية كل هذا يعيش داخل مكوّن أحادي ضخم `PlayerFlow.tsx` (3967 سطراً) — وفي Flutter **يُمنع نقله كـ widget واحد**؛ يُقسَّم إلى متحكّم + شاشة واحدة بآلة `Step` + widgets عرض لكل مرحلة.

**ما يملكه هذا الملف حصرياً:**
- تعريف `Step` enum (تسع حالات) و`GamePhase` (عشر مراحل سيرفرية + مرحلة `ELIMINATION_PENDING` عميلة فقط + `null`).
- حالة الجلسة المركزية `GameSessionState` التي تقرأها كل شاشات المراحل.
- **الاشتراك المركزي في أحداث الحالة** (كل `.on(...)` الموزّعة في PlayerFlow) وتوجيهها للحالة المشتركة.
- **بروتوكول rejoin** (استعادة الجلسة عند الإقلاع/إعادة الاتصال/العودة للغرفة) و**استطلاع كل 3 ثوانٍ** (`room:get-my-state`).
- **حارس المرحلة** (`phaseOverride`، TTL = 6000ms) الذي يمنع الاستطلاع القديم من إرجاع المرحلة للوراء.
- **استعادة المرحلة** عند reconnect والعودة من الخلفية (safety net بعد 500ms، ومزامنة الاستيقاظ).
- تدفّقات الإنهاء: `game:kicked` / `event:closed` → `leaveAndReset`، `game:closed`، `game:room-deleted`، `player:kicked-self` (شاشة الطرد).
- **التجميد** (`room:freeze-player`) عند تبديل الغرفة.
- **الطبقات العلوية على مستوى الجلسة**: overlay الاستعادة (`RESTORING SESSION...`)، toast تغيير المقعد، نظام الـ toast العام، مودال العقوبة + toast العقوبة، شاشة الطرد.
- الثوابت الأمنية على مستوى الحالة: **اللاعب لا يستقبل أبداً أدوار الآخرين** (roster منقّى، rejoin/poll يعيدان دورَه هو فقط، gating فريق المافيا/التوأم).
- **wakelock داخل اللعبة**.

**ما لا يملكه (مُحال لملفات أخرى):** رسم شاشات الدخول/المصادقة والانضمام والتذكرة ومودالات التبديل/التأكيد (21)، بطاقة الدور والقلب وتنبيه الدور (22)، شاشة الفعل الليلي وprompt الممرضة (23)، سينمائيات الصباح (24)، اقتراع DAY_VOTING وprompt/بانر/شارة العمدة (25)، المفكرة وشات المافيا (26)، طاولة الحلقة `PhoneSpectatorView` وشاشة نهاية الجيم (27)، لوحة المضيف (30)، الصوت الريموت (31). هذا الملف **يعرّف الحالة والأحداث التي تغذّي تلك الشاشات** ويحيل إليها لتفاصيل الرسم.

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

- `c:/Projects/new mafia/unified-mafia/frontend/src/components/PlayerFlow.tsx` — المتحكّم الكامل (كل المنطق في السطور 1–1927؛ الرسم 1928–3967). الأجزاء المرجعية لهذا الملف:
  - آلة `Step` والبدء: السطور ~300–345.
  - **rejoin عند الإقلاع**: السطور 344–448.
  - **البحث التلقائي عن الغرفة** (QR): 450–470+.
  - **فحص المقعد المحجوز** (auto re-find): 691–715.
  - **handleLogout**: 717–777.
  - **منع pull-to-refresh** (body class): 779–785.
  - **إعادة الانضمام عند reconnect** (`connect`): 540–576.
  - **مستمعات المقعد/العقوبات/الطرد/التشاور**: 578–689.
  - **مستمعات الدور/البدء/state-sync**: 787–902.
  - **safety net بعد rejoin** (500ms + استعادة الليل الأوتو): 904–998.
  - **مستمعات العمدة**: 1000–1027 (تفصيل الرسم في 25).
  - **المستمع المركزي** (voting-started / vote-update / voting-complete / phase-changed / justification / elimination-pending / game:over / game:closed / game:room-deleted / kicked / event:closed): 1055–1279.
  - **حلقة الاستطلاع 3 ثوانٍ + مزامنة الاستيقاظ**: 1281–1445.
  - **auto-vote عند الصفر**: 1447–1474.
  - **مستمع الفعل الليلي + الممرضة**: 1476–1520 (تفصيل الرسم في 23).
  - حارس المرحلة: `phaseOverrideRef` + `OVERRIDE_TTL = 6000` (السطور 227–230).
- `c:/Projects/new mafia/unified-mafia/frontend/src/hooks/useGameState.ts` — الهوك المشترك (262 سطراً، مقروء كاملاً): يعرّف `GameConfig`, `GameState`, `Player`, ومستمعاته الداخلية (`room:player-joined`, `day:vote-update`, `game:phase-changed`, `day:elimination`, `game:over`, `day:justification-started`, `day:elimination-pending`, `day:deal-created/removed`) وemits (`room:create`, `room:auto-join` عبر `joinRoom`, `game:get-state`). **PlayerFlow يستهلك منه فقط** `{ joinRoom, isConnected, error, loading, emit, on }` ولا يستهلك `gameState`.
- `c:/Projects/new mafia/unified-mafia/frontend/src/lib/constants.ts` — `enum Phase` (السطور 77–100)، `PHASE_LABELS`، `Player`, `Candidate`, `MorningEvent`, `ROLE_NAMES`, `MAFIA_ROLES`, `ROLE_ICONS`.
- `c:/Projects/new mafia/unified-mafia/frontend/src/hooks/useSocket.ts` — دلالات `emit` (ack + timeout 15s) و`on` (يرجع cleanup).

**قيمة `Phase` enum الفعلية (من constants.ts، حرفياً):**
```
LOBBY, ROLE_GENERATION, ROLE_BINDING, DAY_DISCUSSION, DAY_VOTING,
DAY_JUSTIFICATION, DAY_TIEBREAKER, NIGHT, MORNING_RECAP, GAME_OVER
```
> ملاحظة حاسمة: **`DAY_ELIMINATION` ليست في enum الواجهة**. السيرفر يبثّها في `phase`، والعميل يحوّلها إلى `ELIMINATION_PENDING` (قيمة عميلة فقط) في الاستطلاع (`res.phase === 'DAY_ELIMINATION' ? 'ELIMINATION_PENDING' : res.phase`) وفي مستمع `day:elimination-pending`. إذن مجموعة قيم `gamePhase` العميلة = العشر أعلاه + `ELIMINATION_PENDING` + `null`.

---

## 3. التبعيات على ملفات الخطة الأخرى

- **01-foundation-theme.md** — الثيم (surface `#050505/#111`، primary `#8A0303`، accent `#C5A059`)، خطوط Amiri + JetBrains Mono، `Directionality(rtl)`، و**استراتيجية Window Size Classes الكاملة** (compact/medium/expanded). §5 هنا يخصّص فقط سلوك المتحكّم.
- **02-models-data-layer.md** — تعريف `Player`, `Candidate`, `MorningEvent`, `GameConfig` المشتركة؛ هذا الملف يضيف نماذج الجلسة (`GameSessionState`, `PhaseOverride`, `NightRestoreState`, `PhasePollData`).
- **03-networking-rest.md** — طبقة REST (auth endpoints المستخدمة في rejoin/token-check تُوثّق تفصيلاً في 05).
- **04-socket-layer.md** — `SocketService`: `emitWithAck(...).timeout(15s)`، إعادة الاشتراك التلقائي على reconnect، streams مكتوبة الأنواع. **هذا الملف هو أكبر مستهلك للـ socket layer**.
- **05-session-auth.md** — مفاتيح `mafia_*`، `tryRejoinCurrentRoom`، فحص token، تطبيع الهاتف. هذا الملف يستدعي بروتوكول rejoin الذي يبنيه 05.
- **08-deeplinks-routing.md** — `initialRoomCode` (QR) و`?invite=1&by=` — تؤثّر على منطق البدء وتجاهل الجلسة.
- **21-join-lobby.md** — خطوات `code/phone/login/register/change_password/ticket/auto_joining`، مودال تبديل الغرفة، مودال تأكيد الانتقال، `handleFindRoom/handleAutoJoin/handleSwitchRoom`. المتحكّم يستدعيها ويستقبل نتائجها.
- **22-role-cards.md** — رسم بطاقة الدور، القلب، تنبيه الدور. يقرأ `assignedRole/cardFlipped/roleAlert/isPlayerDead`.
- **23-night-phase.md** — شاشة الفعل الليلي + prompt الممرضة. يقرأ `nightActionRequired/...` ويعتمد على استعادة الليل الأوتو المعرّفة هنا.
- **24-morning-cinematics.md** — سينمائيات MORNING_RECAP.
- **25-day-voting.md** — الاقتراع + العمدة. يقرأ حزمة التصويت والعمدة كاملة.
- **26-notepad-mafia-chat.md** — المفكرة/الشات؛ يقرأ `mafiaChatEnabled/notepadNotes/roster`.
- **27-spectator-gameover.md** — `PhoneSpectatorView` وشاشة الفوز؛ يقرأ `gameOverData/roster/phasePollData`.
- **07-sound-system.md** / **31-voice-realtimekit.md** — الصوت والريموت.
- **92-qa-parity.md** — قائمة تكافؤ anti-cheat (بعضها معايير قبول هنا).

---

## 4. الواجهة والتجربة تفصيلياً

هذا المتحكّم بلا واجهة معقّدة خاصة به عدا: **الحاوية الجذرية**، **جدول توجيه المرحلة → widget**، وطبقات علوية على مستوى الجلسة. التفاصيل البصرية للمراحل مُحالة لملفاتها.

### 4.1 الحاوية الجذرية (Root Scaffold)

مكافئ `PlayerFlow` الجذر: `Directionality(TextDirection.rtl)` يلفّ `Stack` بملء الشاشة (`min-h-screen flex flex-col items-center`), مع وضعين حسب `isRemote`:

| الوضع | الخلفية | المحاذاة/الحشوة |
|---|---|---|
| **غرفة فيزيائية** (`!isRemote`) | `display-bg blood-vignette` (خلفية داكنة بـ vignette دموي) — في Flutter: `Container(color: #050505)` + طبقة `RadialGradient` حمراء خافتة عند الأطراف | `justify-center`, حشوة `p-4` (compact) → `p-6` (≥sm) |
| **غرفة ريموت** (`isRemote`) | `#050505` مسطّح + `remote-vignette` | `justify-start`, حشوة `p-2 pt-3 pb-24` (مساحة سفلية لعناصر التحكم) |

- `overflow: hidden`, تحديد نص `selection` بلون `#8A0303` نص أبيض (غير مطلوب في Flutter).
- لون الخلفية الأساس `#050505`؛ أسطح البطاقات `#0c0c0c / #111`.
- **منع pull-to-refresh** (`body.in-game`): غير مطلوب في Flutter (لا يوجد chrome متصفح) — سطر تبرير.

### 4.2 جدول توجيه المرحلة → widget (المنطق المرئي المركزي)

عندما `step ∈ {done, rejoined}` يقرّر المتحكّم أي شجرة يعرض حسب `gamePhase` و`isRemote` و`assignedRole` و`isPlayerDead`. القاعدة (من قواعد الإظهار الشرطي، السطور 2645–3515):

| الشرط | ما يُعرض | الملف |
|---|---|---|
| `isRemote` والمرحلة ∉ {LOBBY, ROLE_GENERATION, ROLE_BINDING} | `PhoneSpectatorView` (طاولة الحلقة) + `RemoteVoice` (key ثابت `"remote-voice"`) + أزرار الريموت | 27, 31 |
| `gamePhase == DAY_VOTING` | اقتراع الاقتراع (بنسختي done/rejoined) | 25 |
| `gamePhase` مضبوطة و≠ DAY_VOTING و≠ LOBBY | `PlayerPhaseView` (NIGHT/الصباح/التبرير/التعادل/الإقصاء/نهاية الجيم) | 24, 25, 27 |
| لا مرحلة / LOBBY / ROLE_* والدور `null` | حالة الانتظار (لوبي ريموت أو صالة فيزيائية) | 21, 22 |
| `assignedRole != null` (LOBBY/ROLE_*) | بطاقة الدور القابلة للقلب | 22 |
| `nightActionRequired && !nightActionSubmitted` | شاشة الفعل الليلي (تغطي كل شيء، z-200) | 23 |
| `nurseActivationPending` | prompt الممرضة (z-200) | 23 |

- **بانر المقعد** و**شريط الأدوات** و**Debug bar** تُرسم فوق شجرة المرحلة في الوضع الفيزيائي (تفاصيلها في 21/22). **Debug bar** (mono، غير الريموت): `P:{gamePhase|null} | C:{votingCandidates.length} | R:{assignedRole|null} | S:{step} | v3.0` — وفي `rejoined` النسخة `v4.0`. (يُبقى في وضع تطوير فقط.)

### 4.3 الطبقات العلوية على مستوى الجلسة (يملكها هذا الملف)

يُبنى `Stack` جذري بترتيب z صريح. الطبقات المملوكة هنا:

**(أ) overlay استعادة الجلسة** — `rejoinLoading` (يبدأ `true`):
- تغطية كاملة `z-50` أسود صلب.
- `ShieldCheckIcon` (SVG 40×40 stroke ذهبي) يدور 360° بمدة **2s linear infinite**.
- تحته mono: `RESTORING SESSION...` (لون `#888` أو ذهبي خافت).
- في Flutter: `AnimationController(2s)..repeat()` + `RotationTransition`.

**(ب) toast تغيير المقعد** — `seatChangeAlert` (نص):
- شريط علوي، خلفية **ذهبية صلبة `#C5A059`**، نص أسود bold **Amiri**، ينزلق من الأعلى.
- النص حرفياً: `تم تغيير رقمك: {oldPhysicalId} ← {newPhysicalId}`.
- يختفي بعد **5000ms**.

**(ج) نظام الـ toast العام** — `activeToast {message, type}`:
- `AnimatePresence`؛ ثابت `top-6 left-4 right-4` (compact ملء العرض) / `sm:right-6 sm:max-w-md`؛ `z-50`.
- الدخول: spring `{opacity:0, y:-50, scale:0.9}` → `{opacity:1, y:0, scale:1}` (damping **15**, stiffness **200**). الخروج: `{opacity:0, y:-20, scale:0.9}`.
- البطاقة: `p-4 rounded-xl border backdrop-blur-md shadow-2xl flex items-center gap-3`، ملوّنة حسب `type`:
  - `penalty`: خلفية `bg-red-950/90`، حد `border-red-500/40`، نص `text-red-200`، أيقونة **🔴**.
  - `warning`: كهرماني مكافئ، أيقونة **⚠️**.
  - `success`: أخضر مكافئ، أيقونة **✅**.
  - `info`: `bg-neutral-900/90 border-[#C5A059]/40 text-gray-200`، أيقونة **ℹ️**.
- الرسالة: **Amiri** bold `text-sm text-right`؛ زر إغلاق **✕** (رمادي → أبيض عند hover).
- إغلاق تلقائي: **5s** (تغيير مقعد) / **6s** (عقوبة)، **محروس بهوية الرسالة**: `prev.message === msg ? null : prev` (كي لا يمسح toast جديد بمؤقّت قديم). في Flutter: sequence token لكل toast.

**(د) مودال العقوبة** — `penaltyAlert {message, penalties, maxPenalties}`:
- تغطية `inset-0 z-50` `bg-black/80 backdrop-blur-sm`، دخول fade؛ البطاقة scale 0.9→1 + y 20→0.
- البطاقة: `bg-[#111] border border-red-500/30 rounded-2xl p-6 max-w-sm text-center`.
- شريط علوي أحمر نابض 3px (`animate-pulse`).
- **⚠️** بحجم `text-4xl` يقفز (`animate-bounce`).
- العنوان (أحمر `red-500`، Amiri): **«تنبيه مخالفة القوانين!»**.
- الرسالة (أبيض، Amiri، `text-sm leading-relaxed`) = `penaltyAlert.message`.
- صف نقاط: `maxPenalties` دائرة (`w-4 h-4 rounded-full`)، الممتلئة `bg-red-600 shadow-[0_0_8px_#dc2626]`، الفارغة `bg-neutral-800 border-neutral-700`.
- تحته mono `text-xs text-[#888]`: `PENALTIES: {penalties} / {maxPenalties}`.
- زر إغلاق بعرض كامل `bg-red-900 hover:bg-red-800` بتوهّج أحمر، نص عربي: **«فهمت وتعهدت بالالتزام»** → يمسح `penaltyAlert`.

**(هـ) شاشة الطرد** — `isExpelled` (تستبدل الواجهة كلها):
- بطاقة `bg-[#1a0505]/85 backdrop-blur border-red-800/40` بتوهّج أحمر؛ دائرتان حمراوان مموّهتان نابضتان في الزوايا (`animate-pulse`)؛ خط علوي متدرج 3px.
- دائرة مركزية 80px `bg-red-950/80` بمثلث تحذير SVG + هالة `animate-ping` حمراء.
- العنوان (`text-3xl` Amiri أحمر): **«تم استبعادك من اللعبة!»**.
- صندوق السبب (`bg-black/40` حد أحمر): تسمية mono `REASON FOR EXPULSION`، ثم `expulsionReason` أو الافتراضي: **«لقد تم استبعادك بسبب انتهاك قواعد اللعب وتجاوز الحد الأقصى للعقوبات.»**.
- ملاحظة: **«لقد تم مسح جلستك الحالية وخصم نقاط من رتبتك (RR) كعقوبة تنظيمية…»**.
- زر (تدرج أحمر `from-red-950 to-red-800`): **«العودة للشاشة الرئيسية»** → `isExpelled=false; step = initialRoomCode ? 'phone' : 'code'`.

**ترتيب z للطبقات (Stack جذري، من الأسفل للأعلى):** شجرة المرحلة → شارة العمدة (z-40) → toast/العقوبة (z-50) → دعوة (z-60) → بانر العمدة (z-84) → prompt العمدة (z-85) → FABs المعرض/المفكرة (z-90) → تنبيه الدور وشاشة الليل (z-200) → مودال تبديل الغرفة (z-300). (الطبقات غير المملوكة هنا تُعرّف تفاصيلها في ملفاتها لكن المتحكّم يحجز مواقعها في الـ Stack.)

### 4.4 الحالات الفارغة والخطأ للمتحكّم

- **بلا `roomId`**: لا استطلاع ولا rejoin (حرّاس `if (!roomId) return`).
- **socket غير متصل** (`!isConnected`): rejoin ينتظر `isConnected && tokenChecked`؛ شاشات الدخول تعرض `CONNECTING...` على الزر (21).
- **فشل rejoin** (`res.success === false` أو catch): يمسح `mafia_session` الفاسدة، `rejoinLoading=false` → يسقط لشاشة الدخول المناسبة.
- **أخطاء الاستطلاع**: تُبتلع صمتاً (`catch { /* ignore */ }`) — لا toast، فقط المحاولة التالية بعد 3s.

---

## 5. التكيّف مع الشاشات 6→11 إنش (إلزامي)

الاستراتيجية الكاملة في **01-foundation-theme.md**. المتحكّم مسؤول عن **توفير `SizeClass`** (compact <600dp / medium 600–840dp / expanded >840dp) عبر `InheritedWidget`/provider لكل شجرة المراحل، وعن سقوف عرض الحاوية الجذرية. تخصيص هذا الملف:

- **compact (<600dp، هواتف 6–7″):** عمود واحد مطابق للـ PWA. الحاوية الجذرية بلا سقف عرض؛ حشوة `16dp` (فيزيائي) / `8dp` علوي `96dp` سفلي (ريموت). البطاقة الرئيسية `maxWidth ≈ 448dp` (`max-w-md`). كل الطبقات العلوية بعرض الشاشة كما في الويب.

- **medium (600–840dp، تابلت 8″):** الحاوية الجذرية تُوسَّط بسقف محتوى **640dp** (`ConstrainedBox(maxWidth: 640)`). البطاقة الرئيسية للدخول تبقى `max-w-md` موسّطة. الـ toast/overlays تلتزم سقف `max-w-md` وتوسَّط. لا مضاعفة لعناصر اللعب بعد. شبكات الأبناء (مثل معرض المافيا 26) ترفع أعمدتها هناك.

- **expanded (>840dp، تابلت 10–11″):** سقف محتوى **840–960dp**. يُتاح **two-pane** اختياري داخل شجرة اللعب الفيزيائية: لوحة يسار ثابتة (بانر المقعد + شريط الأدوات + Debug) ولوحة يمين للمرحلة النشطة — لكن **شاشة الفعل الليلي والعمدة والاقتراع تبقى تغطية كاملة موحّدة** (حساسة زمنياً). **مضاعفة العناصر الحسّاسة بدل تمديدها**: overlay الاستعادة يكبّر `ShieldCheckIcon`؛ رقم المقعد ومؤقّتات الليل/التصويت والبطاقات تُضاعف أحجامها المنطقية (يُدار في ملفات المراحل، لكن المتحكّم يمرّر `SizeClass.expanded` كي تقرّر). الطبقات العلوية (toast/عقوبة/طرد) تلتزم سقف `max-w-sm/md` وتوسَّط ولا تُمدّ لعرض التابلت.

- **مبدأ عام للمتحكّم:** لا يوجد منطق يتغيّر بتغيّر الفئة — فقط القيود البصرية. المؤقتات والاستطلاع وrejoin مستقلة تماماً عن حجم الشاشة.

---

## 6. المنطق والتدفقات

### 6.1 آلة حالة `Step`

```
enum Step { code, phone, login, register, change_password, ticket, auto_joining, done, rejoined }
```
- تُنفَّذ كـ **شاشة واحدة بـ `AnimatedSwitcher`/`PageTransitionSwitcher` (fade)** — **ليس Navigator** (يجب أن تبقى مستمعات الـ socket حيّة عبر كل الخطوات؛ `AnimatePresence mode="wait"`).
- `done` = انضمام جديد هذه الجلسة؛ `rejoined` = استعادة جلسة قائمة. **كلاهما يعرض شاشة اللعب**؛ معظم الـ effects تُقيَّد بـ `step ∈ {done, rejoined}`.
- **منطق البدء** (عند mount):
  - `initialRoomCode` موجود + token محفوظ → `code` مؤقتاً (يستولي عليه effect البحث التلقائي عن الغرفة).
  - `initialRoomCode` موجود + لا token → `phone`.
  - غير ذلك → `code`.
- الانتقالات بين خطوات الدخول (تفصيلها في 21/05): `code → phone → (login|register) → [change_password] → [ticket] → auto_joining → done`، أو أي مسار → `rejoined` عند نجاح استعادة.

### 6.2 آلة مراحل `GamePhase`

- الحالة: `String? gamePhase` (مرآة `mafia_gamePhase`). القيم: العشر السيرفرية + `ELIMINATION_PENDING` (عميلة) + `null`.
- **مصادر تغيير المرحلة** (بترتيب الأولوية عبر حارس الـ override):
  1. `game:phase-changed {phase, state?:{config}}` → يضبط `gamePhase = phase`، يفعّل override، يكشف `isRemote/allowPlayerInvites` من `state.config`.
  2. أحداث مرحلة متخصّصة تضبط المرحلة مباشرة وتفعّل override: `day:voting-started` (DAY_VOTING)، `day:justification-started` (DAY_JUSTIFICATION)، `day:elimination-pending` (ELIMINATION_PENDING)، `game:over` (GAME_OVER).
  3. الاستطلاع `room:get-my-state` (كل 3s) — يكتب المرحلة **فقط** إن لم يكن هناك override حديث (انظر 6.5).
- **نظافة المرحلة** (داخل `game:phase-changed`، حرفياً):
  - `LOBBY | ROLE_GENERATION | ROLE_BINDING` → `setMafiaTeam([]); setSibling(null); setAssignedRole(null); setGameOverData(null);` + مسح ملاحظات المفكرة `mafia_notes_{roomId}_{physicalId}` و`setNotepadNotes({})`.
  - المرحلة ≠ DAY_VOTING و≠ DAY_JUSTIFICATION → مسح كل حالة التصويت (`candidates/myVote/complete/playerVotes/lastVoteTime/countdown` + `clearInterval` تايمر التصويت).
- **`day:elimination-pending`** → `gamePhase='ELIMINATION_PENDING'` + override + مسح التصويت.
- **`game:over {winner, players}`** → `gameOverData={winner, players}` (فقط إن `players` مصفوفة)، `gamePhase='GAME_OVER'` + override، مسح التصويت + `mafiaTeam/sibling` + الملاحظات، **لكن يُبقى `assignedRole` و`isPlayerDead`** (اللاعب لازم يراهما).
- **`game:started`** → **إعادة الجولة الكاملة**: `isPlayerDead=false`, مسح كل حالة التصويت, `assassinContracts=null`, اهتزاز `200ms`. (هذا هو الـ reset الوحيد الكامل.)

### 6.3 بروتوكول rejoin (استعادة الجلسة)

ثلاثة مواضع تُطلق `room:rejoin-player`:

**(أ) rejoin عند الإقلاع** (effect ينتظر `isConnected && tokenChecked`، السطور 344–448):
1. لو `mafia_user_exited` → توقّف (`rejoinLoading=false`).
2. اقرأ `mafia_session`؛ لو غير موجودة أو بلا `roomId/physicalId` → توقّف.
3. **حراسة الحساب**: لو `session.playerId` موجود و`savedPlayerId` مختلف → امسح الجلسة وتوقّف.
4. **حراسة QR**: لو `initialRoomCode` موجود و`session.roomCode` مختلف عنه → امسح الجلسة وتوقّف.
5. `emit('room:rejoin-player', {roomId: session.roomId, physicalId: session.physicalId, phone: session.phone || undefined})`:
   - نجاح → ترطيب كامل: `roomId, roomCode, gameName, physicalId (من res.player), displayName, gender (FEMALE→female وإلا male), playerId`، حفظ `mafia_playerId`، `assignedRole` (إن وُجد)، `mafiaTeam` (إن `!== undefined`)، `sibling` (إن `!== undefined`)، `assassinContracts` (إن وُجد)، `mafiaChatEnabled` (إن boolean). لو `!res.player.isAlive` → `isPlayerDead=true; cardFlipped=true`. لو `res.phase` → `gamePhase=res.phase`؛ لو `res.votingState && phase==='DAY_VOTING'` → استعادة التصويت (candidates/totalVotesCast/playerVotes/playersInfo/complete=false + صوتي من `playerVotes[physicalId]`). ثم `step='rejoined'` + مسح `mafia_user_exited`.
   - `res.success === false` → مسح `mafia_session`.
   - أي حالة → `rejoinLoading=false`.

**(ب) reconnect** (مستمع `connect` أثناء اللعب، السطور 540–576): عند إعادة اتصال socket يحصل على id جديد ويخرج من غرف السيرفر — **بدون إعادة rejoin لا تصل أي broadcasts**. يُعيد `emit('room:rejoin-player', {roomId, physicalId: parseInt(physicalId)||0, phone: normalized||undefined})` ويحدّث seat/name/role/deadState + كاش الجلسة. **هذا حرج — عدم نقله = صمت كامل بعد أول انقطاع.**

**(ج) تبديل الغرفة «ابقَ هنا»** (25/21): `room:rejoin-player {roomId: switchConfirm.currentRoomId, physicalId: 0, phone: '0'-normalized}` لإعادة الالتحاق بالغرفة الحالية.

> `physicalId: 0` في الحمولة = **بحث بالهاتف** (السيرفر يجد المقعد بالهاتف). دائماً طبّع الهاتف ببادئة `0` (أردني).

### 6.4 الاستطلاع كل 3 ثوانٍ (`room:get-my-state`)

effect يعمل عند `step ∈ {done, rejoined} && roomId` (السطور 1281–1445):
- `pollState()` يُنفَّذ **فوراً** ثم `setInterval(pollState, 3000)`.
- الحمولة: `{roomId, playerId: playerId||undefined, phone: normalizedPhone||undefined}`.
- عند `res.success && res.player` يزامن **ذاتي الشفاء**:
  - `mafiaChatEnabled = res.mafiaChatEnabled === true`.
  - **المقعد**: لو `String(res.player.physicalId) !== physicalId` → تحديث + كاش الجلسة + (لو القديم ≠ '0') `seatChangeAlert` 5s + اهتزاز `[200,100,200]`.
  - **الاسم**: تحديث إن تغيّر.
  - **الدور**: `if (res.player.role && !assignedRole)` → `assignedRole`, `cardFlipped=false`, `roleAlert=true`, اهتزاز `[100,50,200,50,300]` (أول وصول فقط).
  - **الموت/الحياة بالاتجاهين**: `!isAlive && !dead` → ميت + قلب؛ `isAlive && dead` → إحياء (لعبة جديدة).
  - `rosterInfo` → `roster`.
  - **المرحلة**: `mappedPhase` (DAY_ELIMINATION→ELIMINATION_PENDING)؛ يُكتب فقط إن سمح حارس الـ override (6.5).
  - **التصويت** (إن `!overrideActive && res.votingState && res.phase==='DAY_VOTING'`): استعادة candidates/totals/playerVotes/playersInfo + صوتي (إن `myVote===null`) + **استعادة التايمر** إن مفقود (`votingCountdown===null`) من `durationSeconds - floor((now - votingStartTime)/1000)`. وإن `res.phase !== 'DAY_VOTING'` ولا override → مسح التصويت.
  - `isRemote/allowPlayerInvites` + `rosterInfo`.
  - `phasePollData` (justificationData/withdrawalState/discussionState/winner/allPlayers/pendingResolution/round||1).
  - `playersInfo` — يُكتب فقط عند **diff** (طول مختلف أو أي physicalId/name مختلف) لتفادي re-render.
- **مزامنة الاستيقاظ** (نفس الـ effect): `onWake = () => { if (visible) pollState(); }` مسجّل على `visibilitychange` + `focus` + `online`. في Flutter: `WidgetsBindingObserver.didChangeAppLifecycleState(resumed)` + stream من `connectivity_plus`. **أوقف الاستطلاع الدوري في الخلفية** (وفّر بطارية) وعند العودة: reconnect socket → `room:rejoin-player` → poll فوري.

### 6.5 حارس المرحلة (`phaseOverride`)

- `phaseOverrideRef {phase, at}` + `OVERRIDE_TTL = 6000` (ms). `setPhaseOverride(phase)` يضبط `{phase, at: now}` عند كل تغيير مرحلة مدفوع بحدث socket.
- في الاستطلاع: `overrideExpired = now - override.at > 6000`. **لو override موجود و`mappedPhase !== override.phase` وليس منتهياً → لا يُكتب** (يحمي انتقالاً محليّاً حديثاً). لو تطابق أو انتهى → يُكتب ويُمسح الـ override.
- استعادة التصويت في الاستطلاع محروسة بـ `overrideActive = override && (now - at <= 6000)`.
- **الغرض**: حدث socket يفوز على الاستطلاع لمدة 6s؛ بعدها الاستطلاع يفوز (يشفي جهازاً فاته حدث الانتقال). **عدم نقله = وميض/ارتداد مراحل.**

### 6.6 safety net بعد rejoin (500ms)

effect عند `step === 'rejoined' && roomId` (السطور 904–998): بعد `setTimeout(..., 500)` (انتظار batching) → `room:get-my-state` واحد يستعيد:
- المرحلة (`gamePhase = res.phase`).
- التصويت الكامل + **التايمر المتبقي** من `durationSeconds/votingStartTime`.
- `assassinContracts`.
- **استعادة الليل الأوتو منتصف NIGHT** إن `res.nightState && res.phase==='NIGHT' && !res.nightState.playerSubmitted`:
  - `isPerformer = physicalId === autoNightPerformerId`.
  - `stepActionType` من `autoNightStepRole`: `SHERIFF→INVESTIGATE`, `DOCTOR|NURSE→PROTECT`, `SNIPER→SNIPE`, `WITCH→DISABLE`, `SILENCER && !isPerformer→DECOY`, وإلا `KILL`.
  - `isDecoy = physicalId !== autoNightPerformerId`.
  - يفتح `nightActionRequired {actionType: stepActionType, availableTargets: nightStep.availableTargets, timeoutSeconds, canSkip: nightStep.canSkip, stepRole: autoNightStepRole, isDecoy}`، `nightActionSubmitted=false`، عدّاد `max(3, config.autoNightTime || 15)`.

### 6.7 تدفّقات الإنهاء والتجميد

- **`player:kicked-self {reason?}`**: مسح `mafia_session` + `mafia_held_seat` + كل مفاتيح التصويت/المافيا + `mafia_user_exited='true'`, تصفير `assignedRole/physicalId/roomId`. لو `reason` → **شاشة الطرد** (`isExpelled=true; expulsionReason=reason`). وإلا → `step = initialRoomCode ? 'phone' : 'code'` + `apiError='تم إزالتك من اللعبة من قبل الليدر'`.
- **`game:kicked {reason?}`** و **`event:closed {reason?|message?}`** → `leaveAndReset(reason)`:
  - مسح `mafia_session/gamePhase/votingCandidates/votingPlayersInfo/myVote/playerVotes/mafiaTeam/sibling`.
  - تصفير كل حالة اللعب (phase/role/dead/team/sibling/card/roleAlert/voting/roomId/roomCode).
  - `step = initialRoomCode ? 'phone' : 'code'`, `apiError = reason || 'تم إنهاء الفعالية وإغلاق الغرفة'`.
- **`game:closed`** (بلا حمولة): مسح مفاتيح الجلسة/التصويت + الملاحظات + تصفير حالة اللعب — **لكن يبقى على الشاشة** (لا تغيير `step`، لا `apiError`، لا مسح `roomId`).
- **`game:room-deleted`**: مثل leaveAndReset لكن `apiError='تم إغلاق الغرفة'` ويمسح `roomId/roomCode`.
- **التجميد `room:freeze-player {roomId, phone, playerId?}`**: يُرسَل عند **تبديل الغرفة** (`handleSwitchRoom`، 21) لتجميد المقعد في الغرفة **القديمة** (يبقى محجوزاً للعودة لاحقاً) قبل الانتقال للهدف. لا يُغيّر الحالة المحلية بذاته — جزء من تدفّق التبديل.
- **المقعد المحجوز** (`mafia_held_seat`): عند logout يُكتب `{roomCode, roomId, phone, playerId, displayName, exitedAt}`؛ TTL **10 دقائق**. عند العودة لخطوة `code` (ليس QR، ليس بعد خروج فوري) وعمر الحجز < 10 دقائق → `handleFindRoom(roomCode)` بعد 300ms؛ منتهي → مسح المفتاح.
- **handleLogout**: كتابة held seat، `room:player-exit {roomId, phone, playerId?}` (fire-and-forget)، مسح كل مفاتيح auth+voting، تصفير ~15 متغيّراً، `mafia_user_exited='true'`؛ لو الدخول كان QR (`initialRoomCode`) → `window.location.href='/player/home'` (في Flutter: توجيه للرئيسية).

### 6.8 auto-vote عند الصفر

effect (السطور 1447–1474): عند `votingCountdown===0 && myVote===null && !isPlayerDead && roomId && gamePhase==='DAY_VOTING'`:
- `voteIndex = candidates.findIndex(c => c.targetPhysicalId === myPhysId)`؛ لو `-1` و`candidates.length>0` → `0` (تفادي تعليق الجولة عند حصر التصويت/الديل).
- `emit('player:cast-vote', {roomId, physicalId: myPhysId, candidateIndex: voteIndex, autoVote: true})` → عند النجاح `myVote=voteIndex; lastVoteTime=now`.
- **client-side — يجب نقله** وإلا تعلّق الجولات لمستخدمي Flutter.

### 6.9 المؤقتات والمهل (كلها في المتحكّم)

| المؤقّت | المدة | المصدر |
|---|---|---|
| الاستطلاع الدوري | 3000ms | `setInterval(pollState, 3000)` |
| حارس المرحلة TTL | 6000ms | مقارنة timestamp (ليس تايمر) |
| safety net بعد rejoin | 500ms | `setTimeout` |
| auto re-find للمقعد المحجوز | 300ms | `setTimeout` |
| toast تغيير المقعد / seat alert | 5000ms | `setTimeout` |
| toast العقوبة | 6000ms | `setTimeout` |
| عدّاد التصويت | 1000ms tick | `votingTimerRef` (تفصيل في 25) |
| عدّاد الليل | 1000ms tick | `nightCountdownRef` (تفصيل في 23) |
| المقعد المحجوز TTL | 600000ms (10 دقائق) | مقارنة `exitedAt` |
| أنماط الاهتزاز | — | `Vibration.vibrate(pattern)` |

**أنماط الاهتزاز (احفظها حرفياً):** role `[100,50,200,50,300]`، seat `[200,100,200]`، penalty-self `[300,100,300,100,500]`، penalty-eject `[500,200,500,200,500]`، mayor `[120,80,120,80,240]`، vote-start `[100,200]`، game-start `200`، warn `[100,100]`، vote-success `100`.

### 6.10 الحالات الحدّية

- تبديل حساب على نفس الجهاز → الجلسة تُتجاهل عند اختلاف `playerId`؛ تسجيل الدخول يمسح جلسة لاعب مختلف.
- QR لغرفة مختلفة عن الجلسة المحفوظة → الجلسة القديمة تُتجاهل.
- QR أثناء غرفة نشطة أخرى → مودال تبديل مع freeze (21).
- الدعوة لا تنضم صامتة أبداً — تُحلّ اسم الغرفة أولاً وتتطلّب تأكيداً؛ غرفة ميتة → «الغرفة لم تعد متاحة» (08/21).
- `room:find-by-code` قد يرجع `{success:false}` **بلا rejection** — عالجه صراحةً.
- سباق الـ toasts محروس بمطابقة النص/sequence token.
- أخطاء الاستطلاع تُبتلع؛ فشل rejoin يمسح الجلسة الفاسدة.
- **bug ويب لا يُنقل**: مستمعا `night:action-required`/`nurse:activation-request` (السطور ~1512–1513) مسجّلان بلا استخدام cleanup (تسريب عند remount) — في Flutter ألغِ كل subscription في `dispose`.

---

## 7. عقود التكامل

### 7.1 REST (المستخدمة من المتحكّم؛ التفصيل الكامل في 05/03)

| Method + Path | Request | Response (الحقول المستخدمة) |
|---|---|---|
| `GET /api/player-auth/me` | header `Authorization: Bearer <token>` | `success`, `player{id, name, phone, gender('FEMALE'/'MALE'), mustChangePassword, avatarUrl}`, `activeGame{roomId, roomCode, physicalId, gameName?, role?, isAlive?}` — يُستخدم في فحص token واصطناع `mafia_session` |

> بقية auth (`/api/player/lookup`, `/login`, `/register`, `/change-password`) تخصّ 21/05.

### 7.2 Socket — Emits (يملكها المتحكّم)

جميع الـ emits عبر wrapper **ack + timeout 15s** (نجاح فقط عند `response.success === true`؛ الرفض يحمل `response.error` و`response.code`/`response.requiresConfirmation`).

| Event | الاتجاه | Payload | متى يُطلق | Ack (المستخدم) |
|---|---|---|---|---|
| `room:rejoin-player` | client→server | `{roomId, physicalId, phone?}` (`physicalId:0` = بحث بالهاتف) | mount restore، reconnect، تبديل الغرفة | `{success, gameName, player:{physicalId, name, gender, playerId, role?, isAlive}, mafiaTeam?, sibling?, assassinContracts?, mafiaChatEnabled?, phase?, votingState?:{candidates, totalVotesCast, playerVotes, playersInfo?}}` |
| `room:get-my-state` | client→server | `{roomId, playerId?, phone?}` | استطلاع 3s + safety net + مزامنة الاستيقاظ | `{success, player:{physicalId, name, role?, isAlive}, phase, mafiaChatEnabled, rosterInfo?, votingState?:{candidates, totalVotesCast, playerVotes, playersInfo, durationSeconds?, votingStartTime?}, assassinContracts?, nightState?:{playerSubmitted, autoNightPerformerId, autoNightStepRole, nightStep:{availableTargets, canSkip}, config:{autoNightTime}}, isRemote?, allowPlayerInvites?, justificationData?, withdrawalState?, discussionState?, winner?, allPlayers?, pendingResolution?, round?, playersInfo?}` |
| `room:player-exit` | client→server | `{roomId, phone, playerId?}` | logout (fire-and-forget) | — |
| `player:cast-vote` | client→server | `{roomId, physicalId, candidateIndex, autoVote:true}` | auto-vote عند الصفر فقط (اليدوي في 25) | `{success}` |

> `room:find-by-code`, `room:auto-join`, `room:freeze-player`, `day:mayor-decision`, `player:night-action`, `nurse:activation-response`, `player:mafia-gallery-open`, `mafia:chat-*`, `player:withdraw-vote`, `day:create-deal/remove-deal` — تخصّ ملفاتها (21/23/25/26).

### 7.3 Socket — Listeners (يسجّلها المتحكّم؛ تفصيل الرسم قد يكون في ملف آخر)

| Event | Payload | الأثر على الحالة | تفصيل الرسم |
|---|---|---|---|
| `connect` | — | re-emit `room:rejoin-player` (socket id جديد) | — |
| `player:seat-changed` | `{oldPhysicalId, newPhysicalId}` | تحديث المقعد + كاش + toast success 5s + اهتزاز `[200,100,200]` | هنا |
| `player:kicked-self` | `{reason?}` | مسح كامل؛ مع reason → شاشة الطرد؛ بلا → دخول + «تم إزالتك من اللعبة من قبل الليدر» | هنا |
| `room:config-updated` | `{mafiaChatEnabled?}` | تبديل `mafiaChatEnabled` حيّاً | 26 |
| `game:penalty-recorded` | `{physicalId, penalties, maxPenalties, message, isKicked}` | لي → مودال + toast penalty + اهتزاز `[300,100,300,100,500]`؛ لغيري → toast warning + اهتزاز `[100,100]`؛ toast يختفي 6s | هنا |
| `player:penalty-ejected` | `{reason, penalties, maxPenalties}` | ميت + قلب + مودال؛ اهتزاز `[500,200,500,200,500]` | هنا |
| `player:role-assigned` | `{role, mafiaTeam?, sibling?}` | `assignedRole=role`, card face-down, roleAlert, alive؛ **دائماً** `mafiaTeam = data.mafiaTeam||[]` و`sibling = data.sibling||null`؛ اهتزاز `[100,50,200,50,300]` | 22 |
| `mafia:team-updated` | `{mafiaTeam}` | تحديث الفريق فقط (تحوّل الأخ الأصغر) بلا لمس البطاقة | 26 |
| `assassin:contracts-update` | any | `assassinContracts = data` | 26 |
| `game:started` | — | reset الجولة الكامل (dead/votes/contracts)؛ اهتزاز `200` | هنا |
| `game:state-sync` | `{players, config:{isRemote?, allowPlayerInvites?, maxPenalties?}}` | roster؛ إيجاد النفس بـ playerId→phone؛ مزامنة seat/name/alive/penalties | هنا |
| `day:voting-started` | `{candidates, playersInfo?, playerVotes?, durationSeconds?}` | DAY_VOTING + override + استعادة صوتي + عدّاد 1s؛ اهتزاز `[100,200]` | 25 |
| `day:vote-update` | `{candidates, totalVotesCast, playerVotes?}` | مزامنة حيّة + صوتي (دعم تغيير الصوت) | 25 |
| `day:voting-complete` | — | `votingComplete=true` | 25 |
| `game:phase-changed` | `{phase, state?:{config}}` | `gamePhase` + override + نظافة LOBBY/ROLE_* + مسح تصويت خارج DAY_VOTING/JUSTIFICATION | هنا/24/25 |
| `day:justification-started` | `{playerVotes?}` | DAY_JUSTIFICATION + override + playerVotes | 25 |
| `day:elimination-pending` | — | ELIMINATION_PENDING + override + مسح التصويت | 27 |
| `game:over` | `{winner, players}` | gameOverData + GAME_OVER + مسح تصويت/فريق/توأم/ملاحظات، **إبقاء** الدور والموت | 27 |
| `game:closed` | — | مسح جلسة/تصويت/ملاحظات + تصفير الحالة، **يبقى على الشاشة** | هنا |
| `game:room-deleted` | — | مسح كامل + `roomId/roomCode=''` + دخول + «تم إغلاق الغرفة» | هنا |
| `game:kicked` | `{reason?}` | `leaveAndReset(reason)` | هنا |
| `event:closed` | `{reason?\|message?}` | `leaveAndReset`، افتراضي «تم إنهاء الفعالية وإغلاق الغرفة» | هنا |
| `night:action-required` | `{actionType, availableTargets, timeoutSeconds, canSkip}` | فتح prompt الليل + عدّاد 1s | 23 |
| `nurse:activation-request` | `{message}` | `nurseActivationPending=true` | 23 |
| `day:mayor-window` / `day:mayor-window-closed` / `day:mayor-revealed` | — | حزمة العمدة | 25 |

> **مستمعات `useGameState` الداخلية** (للتكافؤ مع واجهة الليدر/العرض؛ PlayerFlow يتجاهل ناتجها): `room:player-joined`, `day:vote-update`, `game:phase-changed`, `day:elimination {eliminated:number[]}`, `game:over`, `day:justification-started`, `day:elimination-pending`, `day:deal-created/removed`. وemits: `room:create {gameName, maxPlayers=10, maxJustifications=2, displayPin?}`, `room:auto-join`, `game:get-state {roomId}`.

---

## 8. نماذج Dart المطلوبة

```dart
enum Step { code, phone, login, register, changePassword, ticket, autoJoining, done, rejoined }

// قيمة gamePhase: نصّية nullable لأن ELIMINATION_PENDING ليست في enum السيرفر
class GamePhase {
  static const lobby = 'LOBBY';
  static const roleGeneration = 'ROLE_GENERATION';
  static const roleBinding = 'ROLE_BINDING';
  static const dayDiscussion = 'DAY_DISCUSSION';
  static const dayVoting = 'DAY_VOTING';
  static const dayJustification = 'DAY_JUSTIFICATION';
  static const dayTiebreaker = 'DAY_TIEBREAKER';
  static const night = 'NIGHT';
  static const morningRecap = 'MORNING_RECAP';
  static const gameOver = 'GAME_OVER';
  static const eliminationPending = 'ELIMINATION_PENDING'; // عميلة فقط (من DAY_ELIMINATION)
}

class PhaseOverride { final String phase; final int atMillis; } // TTL 6000ms

class GameSessionState {
  Step step;
  String? gamePhase;                 // مرآة mafia_gamePhase
  String roomId;                     // مرآة mafia_session.roomId
  String roomCode;
  String gameName;
  String physicalId;                 // نصّي (يقارَن كنص)
  String displayName;
  String gender;                     // 'male' | 'female'
  int? playerId;
  String phone;
  String? assignedRole;
  bool cardFlipped;
  bool roleAlert;
  bool isPlayerDead;
  bool isRemote;
  bool allowPlayerInvites;
  bool mafiaChatEnabled;
  int penalties;
  int maxPenalties;                  // افتراضي 3
  bool rejoinLoading;                // يبدأ true
  bool isExpelled;
  String? expulsionReason;
  String? seatChangeAlert;
  String? apiError;
  List<MafiaTeamMember> mafiaTeam;   // مرآة mafia_mafiaTeam
  Sibling? sibling;                  // مرآة mafia_sibling
  dynamic assassinContracts;
  List<PlayerInfo> roster;
  int? maxPlayers;
  GameOverData? gameOverData;
  PhasePollData? phasePollData;
  ToastData? activeToast;
  PenaltyAlert? penaltyAlert;
  NightActionRequired? nightActionRequired;
  bool nurseActivationPending;
  // حزمة التصويت (مرايا localStorage) — تفصيل في 25
  List<Candidate> votingCandidates;
  List<PlayerInfo> votingPlayersInfo;
  int? myVote;
  Map<int,int> playerVotes;
  int totalVotesCast;
  bool votingComplete;
  int? votingCountdown;
  int? lastVoteTime;
}

class ToastData { final String message; final ToastType type; } // penalty|warning|success|info
class PenaltyAlert { final String message; final int penalties; final int maxPenalties; }

class MafiaTeamMember { final int physicalId; final String name; final String role; final String? avatarUrl; }
class Sibling {
  final int physicalId; final String name; final String role;
  final String? avatarUrl; final bool isAlive; final bool recipientIsMafia;
}

class NightActionRequired {
  final String actionType;                 // KILL|INVESTIGATE|PROTECT|SNIPE|SILENCE|DISABLE|DECOY
  final List<TargetInfo> availableTargets; // {physicalId, name}
  final int timeoutSeconds;
  final bool canSkip;
  final String? stepRole;
  final bool isDecoy;
}

class NightRestoreState {                  // من res.nightState في safety net
  final bool playerSubmitted;
  final int autoNightPerformerId;
  final String autoNightStepRole;          // SHERIFF|DOCTOR|NURSE|SNIPER|WITCH|SILENCER|...
  final NightStep nightStep;               // {availableTargets, canSkip}
  final NightConfig config;                // {autoNightTime}
}

class PhasePollData {
  final dynamic justificationData;
  final dynamic withdrawalState;
  final dynamic discussionState;
  final String? winner;
  final List<dynamic>? allPlayers;
  final dynamic pendingResolution;
  final int round;                         // افتراضي 1
}

class GameOverData { final String? winner; final List<PlayerInfo> players; }

class HeldSeat {                           // مرآة mafia_held_seat
  final String roomCode; final String roomId; final String phone;
  final int? playerId; final String displayName; final int exitedAt; // TTL 600000ms
}

class SessionCache {                       // مرآة mafia_session
  final String roomId; final String roomCode; final int physicalId;
  final String phone; final String displayName; final int? playerId;
}
```

---

## 9. الحزم المستخدمة

- `socket_io_client` — **مطابقة إصدار socket.io الرئيسي للسيرفر**؛ `emitWithAck(event, data).timeout(15s)`؛ عامل `response.success != true` كفشل واستخرج `response.code`/`response.requiresConfirmation`.
- `flutter_riverpod` (أو `flutter_bloc`) — `GameSessionController` كـ `StateNotifier`/`Bloc` طويل العمر.
- `shared_preferences` (أو `hive`) — كل مفاتيح `mafia_*` بنفس الأسماء وأشكال JSON؛ **قراءة متزامنة قبل أول frame** (في `main()`/splash) لتقليد lazy initializers بلا وميض.
- `connectivity_plus` — stream يُطلق poll فوري عند عودة الشبكة (`online`).
- `vibration` — أنماط الاهتزاز الثمانية (`Vibration.vibrate(pattern: [...])`, Android؛ iOS degrade لنبضات مفردة).
- `wakelock_plus` — تفعيل أثناء `step ∈ {done, rejoined}`.
- `flutter_animate` — spring الـ toast (damping 15/stiffness 200)، الدوران المستمر لأيقونة الاستعادة.
- `google_fonts` — Amiri + JetBrains Mono.
- `dio`/`http` — نقطة `/api/player-auth/me` وبقية auth (05).
- `app_links`/`go_router` — deep links (QR + دعوة) وتوجيهات `/player/home` و`/player/feedback`.

---

## 10. اختلافات Android / iOS

- **الاهتزاز**: الويب يستخدم اهتزازاً **بأنماط** (`navigator.vibrate([...])`). Android يدعمها عبر `vibration`. **iOS لا يدعم أنماط الاهتزاز** — degrade إلى `HapticFeedback.mediumImpact()`/`heavyImpact()` مفردة أو CoreHaptics عبر حزمة؛ لا تعتمد على تمييز الأحداث بطول النمط على iOS.
- **الخلفية والـ socket**: على iOS يُعلَّق الـ socket بقوة في الخلفية والمؤقّتات تُخنق أشدّ من Android؛ عند `resumed` يجب دائماً: reconnect socket → `room:rejoin-player` → poll فوري. على Android قد يبقى الاتصال أطول لكن الـ throttling على المؤقّتات قائم أيضاً — نفس المسار.
- **مزامنة الاستيقاظ**: كلاهما عبر `WidgetsBindingObserver` + `connectivity_plus`؛ لا فرق منطقي، لكن اختبر iOS خصوصاً لأن `didChangeAppLifecycleState` قد يتأخّر.
- **رسم الإيموجي كأيقونات** (🔴 ⚠️ ✅ ℹ️ في الـ toast): تحقّق من توفّرها على Android القديم؛ الكود الأصلي يتجنّب ZWJ عمداً — التزم به.
- بقية سلوك المتحكّم (الاستطلاع، rejoin، الحارس) **لا اختلاف** — منطق شبكة بحت مستقل عن المنصّة.

---

## 11. الأصول المطلوبة

- **لا صور/أصوات خاصة بالمتحكّم** عدا `ShieldCheckIcon` (SVG داخلي 40×40، stroke ذهبي) لـ overlay الاستعادة — يُرسَم كـ `CustomPaint` أو أيقونة SVG مضمّنة.
- الخطوط: **Amiri** (عربي) + **JetBrains Mono** (ملصقات إنجليزية/أرقام) عبر `google_fonts`.
- إيموجي الـ toast: 🔴 ⚠️ ✅ ℹ️ (نظام، بلا أصول).
- (`avatarUrl` للاعبين تأتي من الـ API — لا تُحزَم.)

---

## 12. معايير القبول (checklist تكافؤ قابلة للتعليم)

- [ ] `Step` enum بالحالات التسع نفسها؛ منطق البدء (QR+token→code، QR بلا token→phone، وإلا code) مطابق.
- [ ] `gamePhase` يقبل العشر السيرفرية + `ELIMINATION_PENDING` + `null`؛ **`DAY_ELIMINATION` تُحوَّل دائماً إلى `ELIMINATION_PENDING`** في الاستطلاع.
- [ ] rejoin عند الإقلاع ينتظر `isConnected && tokenChecked`، يتجاهل الجلسة عند `mafia_user_exited`/اختلاف playerId/اختلاف QR roomCode.
- [ ] **reconnect** يعيد `room:rejoin-player` تلقائياً؛ بدونه لا تصل broadcasts (اختبار: اقطع الشبكة وأعِدها → تصل الأحداث).
- [ ] استطلاع كل **3000ms** بالضبط + مزامنة فورية عند `visibilitychange/focus/online` (والمكافئ Flutter عند resumed/عودة الشبكة).
- [ ] **حارس المرحلة** TTL **6000ms**: حدث socket يفوز على الاستطلاع 6s ثم الاستطلاع يفوز (اختبار: لا وميض/ارتداد عند انتقال سريع).
- [ ] safety net بعد `rejoined` (500ms) يستعيد المرحلة + التصويت (مع التايمر المتبقي) + عقود السفّاح + **prompt الليل الأوتو** بخريطة `autoNightStepRole` الصحيحة و`isDecoy` الصحيح.
- [ ] `game:kicked`/`event:closed` → leaveAndReset (النص الافتراضي «تم إنهاء الفعالية وإغلاق الغرفة»)؛ `game:room-deleted` → «تم إغلاق الغرفة»؛ `game:closed` يبقى على الشاشة؛ `player:kicked-self` مع reason → شاشة الطرد.
- [ ] `game:started` = الـ reset الكامل الوحيد؛ `game:over` يُبقي الدور والموت؛ LOBBY/ROLE_* تمسح الفريق/التوأم/الدور/الملاحظات.
- [ ] `player:role-assigned` **يستبدل** `mafiaTeam` و`sibling` دائماً (حتى بفارغ/null).
- [ ] **auto-vote عند الصفر** ينفّذ (self وإلا index 0، `autoVote:true`) — الجولة لا تعلّق.
- [ ] **اللاعب لا يستقبل أدوار الآخرين**: roster يصل بـ role=null للأحياء؛ rejoin/poll يعيدان دورَه فقط؛ الفريق/التوأم مصفّران ما لم يكن الدور ∈ MAFIA_ROLES عند الرسم (26).
- [ ] كل الطبقات العلوية بترتيب z الموصوف؛ toast محروس بهوية الرسالة؛ مؤقّتات الإغلاق (5s/6s) صحيحة.
- [ ] **wakelock** فعّال طوال `step ∈ {done, rejoined}`.
- [ ] كل حمولات الـ socket والـ emits حرفية (بنفس أسماء الحقول)؛ `physicalId:0` = بحث بالهاتف؛ الهاتف مطبَّع ببادئة `0`.
- [ ] كل مفاتيح `mafia_*` بنفس الأسماء وأشكال JSON، مقروءة قبل أول frame.
- [ ] مستمعا الليل/الممرضة يُلغى اشتراكهما في `dispose` (تصحيح تسريب الويب).

---

## 13. ملاحظات أداء وأمان

**الأداء:**
- **أوقف الاستطلاع الدوري في الخلفية** (وفّر بطارية/شبكة)؛ اعتمد على poll الاستيقاظ عند العودة. مؤقّتات Flutter تستمر بعكس الويب المخنوق — لا تتركها تعمل بلا داع.
- الاستطلاع يكتب `playersInfo` فقط عند **diff** (طول أو physicalId/name مختلف) — كرّر ذلك لتفادي rebuild غير ضروري.
- قراءة التخزين متزامنة قبل أول frame → لاعب محدَّث يهبط مباشرة على شاشة التصويت/الليل المستعادة بلا وميض.
- `RepaintBoundary` حول الطبقات النابضة (overlay الاستعادة، مودال العقوبة) عزلاً لإعادة الرسم.
- أنماط الاهتزاز خفيفة؛ لا تُطلقها في حلقات.

**الأمان (ثوابت anti-cheat على مستوى الحالة — إلزامية):**
- **اللاعب لا يعرف أدوار الآخرين أبداً**: كل استجابات السيرفر (rejoin/poll/state-sync) تعيد دور اللاعب نفسه فقط، وroster الأحياء بـ role=null. لا تستنتج أدواراً محلياً.
- **الفريق/التوأم**: يُستبدلان دائماً عند تعيين الدور (يمنع تسريب فريق جيم سابق للأخ الأصغر قبل تحوّله)؛ وعند الرسم يُصفَّران ما لم يكن الدور ∈ MAFIA_ROLES (26) — لا تثق ببيانات التخزين وحدها.
- **decoy prompts** يجب أن تكون مطابقة بكسلياً للحقيقية (23) — القرار المشتق هنا (`isDecoy`, `DECOY`) لا يجب أن يسرّب أي فرق بصري.
- **بقاء الدور والموت بعد GAME_OVER** وreset فقط على `game:started` — لا تمسحهما مبكراً.
- الرفض من الـ emit يحمل بيانات مبنيّة (`code:'PENDING_SURVEYS'`, `requiresConfirmation`) — نمذجها كـ typed exceptions لا بمطابقة نصوص.
- `mafiaChatEnabled` علم **عام** لا يكشف هوية — لكن أهلية الشات تُحسب محلياً ولا تُبثّ أبداً (26).
- توكن الـ JWT في التخزين الآمن (`flutter_secure_storage` مفضّل على `shared_preferences` للتوكن رغم بقاء أسماء المفاتيح متوافقة مع السيرفر).
- **المصادقة على الـ socket إلزامية** (per security hardening) — أعد `reconnectSocketAuth` بعد أي إعادة تسجيل دخول قبل rejoin.
