# الانضمام واللوبي: إدخال الكود، المقاعد، الانتظار
> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

---

## 1. الهدف والنطاق

هذا الملف يوثّق **قمع الدخول (entry funnel)** الذي يقود اللاعب من لحظة فتح شاشة اللعب حتى الجلوس في مقعده داخل اللوبي بانتظار بدء الجولة. النطاق بالضبط:

1. **إدخال كود الغرفة يدوياً** (خطوة `code`) — أربعة أرقام.
2. **الدخول بالرابط (deep link)** — عبر QR `‎/join/{roomCode}` أو `‎/player/join?code=XXXX`، حيث يبدأ التطبيق مباشرة على خطوة الهاتف (أو يتخطاها إذا كان اللاعب مسجّلاً).
3. **تأكيد الدعوة** — الوصول عبر إشعار دعوة `‎/player/join?code=XXXX&invite=1&by=NAME`؛ يُحلّ اسم الغرفة أولاً ويُعرض مودال «هل تريد الانضمام…؟» قبل أي دخول صامت.
4. **قمع المصادقة داخل الدخول** — خطوات `phone → login | register → change_password` (تُغطّى تفصيلياً هنا لأنها جزء من تدفّق الدخول للغرفة؛ منطق المصادقة العام والتخزين في 05-session-auth.md و10-login-register.md).
5. **إدخال رقم التذكرة** (خطوة `ticket`) عندما تتطلبه الغرفة.
6. **تخصيص المقعد التلقائي** (خطوة `auto_joining`) — الباكإند يوزّع مقعداً عشوائياً (`physicalId`) دائماً؛ **لا يُرسل التطبيق مقعداً مفضّلاً أبداً**.
7. **حالات الغرفة الممتلئة/المقفلة/القيود** — تظهر كأخطاء ack من السيرفر (نصوص عربية جاهزة) أو كمودال «تأكيد الانتقال» عند `requiresConfirmation`.
8. **بانر المقعد المخصّص** بعد نجاح الانضمام.
9. **شاشة الانتظار في اللوبي** (`done`/`rejoined` والدور لم يُوزَّع بعد) — نسخة الغرفة الفيزيائية (بطاقة الغطاء + رسالة «وجّه انتباهك للشاشة») ونسخة اللعب عن بُعد (طاولة الحلقة + بطاقة رمز الغرفة + شريط تقدّم المقاعد).
10. **مودال تبديل الغرفة** عند اكتشاف لعبة نشطة مختلفة، **ومودال تأكيد الانتقال (constraint)**.

**خارج النطاق (ملفات أخرى):** آلة الحالة الكاملة للـ socket والصمود (20-game-state-core.md)، كشف بطاقة الدور والحالة داخل الجيم بعد التوزيع (22-role-cards.md)، الفعل الليلي والتصويت والمراحل (23/25/…)، طاولة الحلقة `PhoneSpectatorView` كمكوّن (27-spectator-gameover.md)، إرسال الدعوات (`InviteModal`, 14-games-invites.md)، الصوت (31-voice-realtimekit.md). هذا الملف يستهلك تلك المكوّنات لكن لا يوثّقها.

**قرار معماري:** خطوات الدخول التسع (`code, phone, login, register, change_password, ticket, auto_joining, done, rejoined`) تُنفَّذ كشاشة واحدة بآلة حالات `Step` مع `AnimatedSwitcher` (وليس Navigator منفصلاً) — يجب أن تبقى مستمعات الـ socket حيّة عبر كل الخطوات. لا يوجد أي إعادة توجيه بين شاشات مستقلة داخل هذا التدفّق.

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

- `c:/Projects/new mafia/unified-mafia/frontend/src/components/PlayerFlow.tsx` — المكوّن الأحادي (3967 سطراً). الأجزاء ذات الصلة بهذا الملف:
  - تعريف `Step` والحالة الابتدائية: أسطر 41–48 (النوع) و101–107 (الـ initializer).
  - حالات React المستخدمة: 108–229 (roomCode, roomId, gameName, maxPlayers, phone, displayName, dob*, gender, physicalId, playerId, apiError, requireTicket, ticketNumber, avatarUrl, userExited, switchConfirm, joinConfirmation, invitePrompt, inviteError, inviteConfirmed, tokenChecked, roster, isRemote, allowPlayerInvites, penalties, maxPenalties).
  - effect حلّ الدعوة: 465–485.
  - handleFindRoom: 1522–1568.
  - handlePhoneLookup: 1571–1609.
  - handleLogin: 1612–1656.
  - tryRejoinCurrentRoom: 1659–1749.
  - handleSwitchRoom: 1751–1784.
  - handleRegister: 1787–1828.
  - handleChangePassword: 1831–1860.
  - handleAutoJoin: 1863–1921؛ handleJoinGame (alias): 1924–1926.
  - مودال تأكيد الانتقال (joinConfirmation): 2028–2061.
  - مودال الدعوة (invitePrompt) وخطأ الدعوة (inviteError): 2064–2111.
  - رأس MAFIA CLUB + اللوجو + البطاقة الرئيسية + `AnimatePresence`: 2251–2310.
  - خطوة code: 2313–2342 — خطوة phone: 2345–2395 — register: 2398–2507 — login: 2510–2545 — change_password: 2548–2582 — ticket: 2586–2630 — auto_joining: 2633–2642.
  - بانر المقعد + شريط الأدوات + Debug bar: 2648–2689.
  - شاشة انتظار اللوبي (فيزيائي/ريموت + بانر العقوبات): 2955–3035.
  - مودال تبديل الغرفة (switchConfirm): 3616–3706.
- `c:/Projects/new mafia/unified-mafia/frontend/src/hooks/useGameState.ts` — `joinRoom` (215–237) الذي يُطلق `room:auto-join`، و`emit`/`on`/`isConnected`/`loading`.
- `c:/Projects/new mafia/unified-mafia/frontend/src/components/RoomCodeCard.tsx` — بطاقة رمز الغرفة القابلة للنسخ (كاملة، 39 سطراً).
- `c:/Projects/new mafia/unified-mafia/frontend/src/app/join/[roomCode]/page.tsx` — نقطة دخول QR العامة (تعرض `<PlayerFlow initialRoomCode={roomCode} />` بلا provider/guard).
- `c:/Projects/new mafia/unified-mafia/frontend/src/app/player/join/page.tsx` — نقطة دخول الدعوة/التبويب: تقرأ `?code`/`?invite=1`/`?by=`، تكتب مفاتيح localStorage (`mafia_player_info`, `mafia_player_token`, `mafia_playerId`) ثم تعرض `<PlayerFlow initialRoomCode inviteFlag inviterName />` داخل `Suspense`.
- `c:/Projects/new mafia/unified-mafia/backend/src/routes/player-auth.routes.ts` — نقاط REST للمصادقة.
- تقارير الشرائح المرجعية: `reports/shell-auth.md` (deep-link + auth)، `reports/playerflow-a.md` (منطق الدخول والصمود)، `sections/core-game.md` (لغة التصميم وشاشات الدخول).

---

## 3. التبعيات على ملفات الخطة الأخرى

- **01-foundation-theme.md** — لغة التصميم (الألوان، خط Amiri/JetBrains Mono، التوهّج الأحمر)، و**استراتيجية Window Size Classes** المُحال إليها في §5.
- **02-models-data-layer.md** — نماذج `RoomFindResult`, `AutoJoinResult`, `RejoinResult`, `MeResponse`/`ActiveGame`, `SessionData`.
- **03-networking-rest.md** — عميل REST (Bearer)، نقاط `/api/player-auth/*` و`/api/player/lookup`.
- **04-socket-layer.md** — `emitWithAck(...).timeout(15s)`، مغلّف نجاح `{success, error?}`، إعادة rejoin على reconnect، `on(event)` streams. أحداث `room:*` تُعرّف هنا وتُستهلك.
- **05-session-auth.md** — مفاتيح `mafia_*`، `getSavedToken/getSavedPhone/getSavedPlayerId`، دورة حياة الجلسة، تطبيع الهاتف الأردني.
- **08-deeplinks-routing.md** — توجيه `‎/join/{code}` (عام، بلا مصادقة) و`‎/player/join?code=&invite=1&by=` (مصادَق)، والتقاط QR/الدعوة.
- **10-login-register.md** — النسخة العامة لشاشات المصادقة (خارج سياق الغرفة)؛ هذا الملف يوثّق النسخة **داخل** تدفّق الغرفة.
- **11-shell-navigation.md** — تبويب «ادخل» يستهدف هذه الشاشة؛ استثناء حارس المصادقة لمسار الانضمام.
- **14-games-invites.md** — `InviteModal` (إرسال الدعوة) الذي يُفتح من زر «📨 دعوة صديق للغرفة» في لوبي الريموت.
- **18-feedback.md** — إعادة التوجيه عند `PENDING_SURVEYS` إلى `/player/feedback`.
- **20-game-state-core.md** — آلة الحالة، الصمود، الـ poll، حارس المرحلة، مستمعات الـ socket المركزية، مفاتيح التخزين. **هذا الملف يفترضها موجودة** ويصف نقاط التسليم منها (بعد `done`/`rejoined`).
- **22-role-cards.md** — `MafiaCard` (بطاقة الغطاء في اللوبي، وبطاقة الدور بعد التوزيع).
- **27-spectator-gameover.md** — `PhoneSpectatorView` (طاولة اللوبي في الريموت).

---

## 4. الواجهة والتجربة تفصيلياً

### 4.0 القشرة العامة لشاشة الدخول (تحيط بكل الخطوات)

- **الجذر:** عمود موسّط `min-h-screen flex flex-col items-center`، خلفية الغرفة الفيزيائية `display-bg blood-vignette` (near-black مع vignette أحمر)، الغرفة عن بُعد `#050505 remote-vignette`. الطبقة كلها داخل `Directionality(TextDirection.rtl)`.
- **رأس «MAFIA CLUB» + اللوجو** (يُخفى تماماً في الريموت `isRemote`): صف موسّط `gap-4 md:gap-6 mb-8`:
  - `MAFIA`: `text-4xl md:text-5xl font-black` لون `#C5A059`، خط Amiri، `textShadow: 0 0 30px rgba(138,3,3,0.4)`.
  - `CLUB`: تحته، `dir="ltr"`، `flex justify-between` (الأحرف مفروقة أفقياً عبر عرض كامل)، `text-xl md:text-2xl font-light` لون `#8A0303`، Amiri، `textShadow: 0 0 20px rgba(138,3,3,0.3)`. **الأحرف تُقسَّم فرادى** `'CLUB'.split('')`.
  - اللوجو: `/mafia_logo.png` بحجم 60px (موبايل) / 80px (md)، `drop-shadow(0 0 20px rgba(138,3,3,0.3))`.
  - **أنيميشن الدخول:** الرأس `opacity 0→1, y 20→0` بمدة **1.2s** ease cubic `[0.16, 1, 0.3, 1]`؛ اللوجو `opacity 0→1, scale 0.8→1` بمدة **1s** بتأخير **0.3s**.
- **البطاقة الرئيسية:** `motion.div` (opacity 0→1, y 10→0)، `w-full rounded-xl backdrop-blur-md relative z-10`:
  - فيزيائي: `max-w-md p-8 sm:p-10 bg-black/50 border border-[#2a2a2a] shadow-[0_0_40px_rgba(0,0,0,0.8)]`.
  - ريموت: `max-w-lg p-2.5 shadow-none` (بلا حدود/خلفية).
  - **شريط علوي متدرّج** (فيزيائي فقط): 2px `bg-gradient-to-r from-transparent via-[#8A0303]/60 to-transparent opacity-80 rounded-t-xl`.
- كل الخطوات ملفوفة بـ `AnimatePresence mode="wait"`؛ كل خطوة `motion.div` بمفتاح فريد وانتقال fade بسيط `initial {opacity:0} animate {opacity:1} exit {opacity:0}` (ما عدا `done` التي تدخل بـ scale 0.95→1).

---

### 4.1 خطوة `code` — إدخال كود العملية

- **الرأس** (موسّط، أسفله حد `border-b border-[#2a2a2a]/40 pb-6 mb-8`): أيقونة `OperationIcon` (قفل SVG 40×40، stroke `currentColor`, strokeWidth 1.5, `opacity-80`) بلون `#C5A059`؛ عنوان **«الانضمام للعملية»** `text-3xl font-black text-white` Amiri؛ سطر فرعي **`INPUT SECURE OPERATION CODE`** `text-[10px] font-mono uppercase tracking-[0.2em]` لون `#808080`.
- **الحقل:** `type=text inputMode=numeric`، `value=roomCode`، `onChange` يطبّق `replace(/\D/g,'').slice(0,4)` (أرقام فقط، حد 4)، placeholder **`----`**، `maxLength=4`, `autoFocus`. النمط: `p-4 bg-black/40 border border-[#2a2a2a] rounded-lg text-white text-center font-mono text-4xl tracking-[0.4em]`، focus: `border-[#C5A059] ring-1 ring-[#C5A059]`، placeholder لون `#222`، `mb-6`.
- **شريط الخطأ** (`apiError`): `text-[#8A0303] text-[11px] font-mono text-center mb-4 bg-[#8A0303]/10 p-2 rounded`.
- **الزر:** class `btn-premium w-full !text-sm tracking-widest disabled:opacity-50 !rounded-lg`؛ **معطّل** حتى `roomCode.length === 4 && isConnected`؛ النص **`ESTABLISH LINK`** عند الاتصال، **`CONNECTING...`** إذا `!isConnected`. عند الضغط → `handleFindRoom()` (بلا وسيط → قد يتقدّم لـ `phone`).
- `btn-premium` = زر بأسلوب اللعبة: خلفية داكنة بحد/توهّج ذهبي-أحمر (يُعرّف في 01-foundation-theme.md؛ استخدمه كنمط موحّد).

---

### 4.2 خطوة `phone` — تعريف العميل

- **الرأس:** `PhoneIcon` ذهبي؛ العنوان = **`gameName || 'عملية جارية'`** `text-2xl font-black text-[#C5A059]` Amiri؛ سطر فرعي **`AGENT IDENTIFICATION`**.
- **حالة حلّ الرابط** (`initialRoomCode && !roomId && !apiError && !userExited`): سطر موسّط **`LOCATING COMPONENT...`** `text-[10px] font-mono tracking-widest uppercase animate-pulse` لون `#C5A059`.
- **حالة خطأ الرابط** (`initialRoomCode && apiError && !roomId`): `apiError` بـ `text-[#8A0303] text-xs font-mono tracking-widest uppercase`.
- **النموذج** (يظهر عندما `roomId || !initialRoomCode || userExited`):
  - صف `flex items-center gap-2 mb-6 font-mono`:
    - رقاقة ثابتة **`+962`**: `bg-black/40 border border-[#2a2a2a] rounded-lg px-4 py-4 text-[#808080] text-sm shrink-0`.
    - حقل `type=tel inputMode=numeric`, `value=phone`, `onChange` يطبّق `replace(/\D/g,'').slice(0,10)`, placeholder **`7XXXXXXXX`**, `maxLength=10`, `autoFocus`. النمط: `w-full p-4 bg-black/40 border border-[#2a2a2a] rounded-lg text-white text-lg tracking-widest` focus `border-[#C5A059]`.
  - خطأ (عندما `apiError && roomId`) بنفس نمط شريط الخطأ.
  - الزر **`VERIFY IDENTITY`** (btn-premium)، **معطّل حتى `phone.length >= 9`** → `handlePhoneLookup`.

---

### 4.3 خطوة `register` — هوية جديدة

- **الرأس:** عنوان **«هوية جديدة»** `text-2xl font-black text-white` Amiri؛ فرعي **`NEW DOSSIER REGISTRATION`**.
- الحقول داخل `space-y-5`، كل حقل بـ label `text-[10px] font-mono text-[#555] tracking-[0.2em] uppercase`:
  - **`Codename`**: `text` value=displayName, placeholder **«الاسم المستعار»**, `maxLength=20`, `text-center autoFocus`, نفس نمط الحقل الداكن.
  - **`Date of Birth`**: شبكة `grid grid-cols-3 gap-2 font-mono` من ثلاثة `<select>` بخلفية `#0c0c0c` حد `#2a2a2a` `text-xs`:
    - يوم: خيار placeholder **`DD`** ثم 1..31.
    - شهر: placeholder **`MM`** ثم 1..12.
    - سنة: placeholder **`YYYY`** ثم قيم `new Date().getFullYear() - 8 - i` لـ `i ∈ [0,49]` (خمسون سنة رجوعاً، **حد أدنى للعمر 8 سنوات**).
  - **`Classification`** (الجنس): شبكة عمودين، زرّان:
    - **`♂ ذكر`**: مختار → `bg-blue-900/20 border-blue-500/50 text-blue-400`.
    - **`♀ أنثى`**: مختار → `bg-purple-900/20 border-purple-500/50 text-purple-400`.
    - غير المختار → `bg-black/40 border-[#2a2a2a] text-[#555] hover:border-[#555]`.
    - كلاهما `p-3 rounded-lg border text-sm font-bold tracking-widest`.
  - **`Password`**: `type=password` value=password, placeholder **«كلمة المرور (4 أحرف+)»**, `minLength=4`, `text-center font-mono tracking-widest`.
- خطأ `apiError` (mt-4).
- الزر **`SUBMIT DOSSIER`** (btn-premium, mt-6)، **معطّل حتى `displayName && password && password.length >= 4`** → `handleRegister`.

---

### 4.4 خطوة `login` — إدخال كلمة المرور (حساب موجود)

- **الرأس:** `OperationIcon` ذهبي؛ عنوان **«مرحباً {displayName}»** `text-2xl font-black text-white` Amiri؛ فرعي **`ENTER ACCESS CODE`**.
- حقل واحد (label **`Password`**): `type=password` value=password, placeholder **«كلمة المرور»**, `text-center font-mono text-2xl tracking-[0.3em]`, `autoFocus`, **Enter يرسل** (`onKeyDown Enter → handleLogin`).
- خطأ `apiError`.
- الزر **`ACCESS GRANTED`** (btn-premium)، **معطّل حتى `password`** → `handleLogin`.

---

### 4.5 خطوة `change_password` — تغيير كلمة المرور (حسابات مهاجرة)

- **الرأس:** `OperationIcon` ذهبي؛ عنوان **«تغيير كلمة المرور»** `text-2xl font-black text-[#C5A059]` Amiri؛ فرعي **`UPDATE YOUR ACCESS CODE`**.
- ملاحظة موسّطة **«كلمة المرور الحالية مؤقتة — اختر كلمة مرور جديدة»** لون `#C5A059`/80 Amiri `text-xs`.
- حقل `type=password` value=newPassword, placeholder **«كلمة المرور الجديدة (4 أحرف+)»**, `text-center font-mono text-xl tracking-[0.3em]`, `autoFocus`, `minLength=4`, **Enter يرسل** → `handleChangePassword`.
- خطأ `apiError`.
- الزر **`UPDATE CODE`** (btn-premium)، **معطّل حتى `newPassword && newPassword.length >= 4`**.
- **لا يوجد زر رجوع** — لا يمكن تجاوز هذه الخطوة.

---

### 4.6 خطوة `ticket` — إدخال رقم التذكرة

- **الرأس:** أيقونة تذكرة SVG 40×40 ذهبية (المسار الحرفي في §11)؛ عنوان **«مرحباً {displayName}»** `text-2xl font-black text-white truncate` Amiri؛ فرعي **«أدخل رقم التذكرة للدخول»** `text-sm` لون `#808080` Amiri.
- الحقل: `type=text` value=ticketNumber, placeholder **«رقم التذكرة»**, **`dir="ltr"`** (جزيرة LTR)، النمط: `px-5 py-4 bg-black/40 border border-[#2a2a2a] rounded-xl text-center text-white text-2xl font-mono tracking-[0.3em]`, placeholder لون `#333`, focus `border-[#C5A059]/50 shadow-[0_0_15px_rgba(197,160,89,0.15)]`. **لا تصفية أرقام هنا** (النص كما هو).
- خطأ `apiError`.
- الزر: `w-full py-4 text-lg font-black rounded-lg border-2` Amiri، **معطّل عند `!ticketNumber.trim() || loading`**:
  - مفعّل: `background: linear-gradient(135deg, #166534, #15803d)`، `borderColor #22c55e`، `color #fff`، `boxShadow: 0 0 25px rgba(34,197,94,0.4), 0 0 50px rgba(34,197,94,0.15)`، `textShadow: 0 0 10px rgba(34,197,94,0.5)`.
  - معطّل: `background #222`, `borderColor #333`, `color #666`, بلا ظل.
  - النص: **`🎫 تحقق وادخل`** أو **`جارٍ التحقق...`** أثناء `loading`.
  - عند الضغط → `handleAutoJoin(false, ticketNumber)`.

---

### 4.7 خطوة `auto_joining` — تخصيص المقعد

- شاشة موسّطة `text-center py-10`:
  - سبينر: `w-16 h-16 border-3 border-[#C5A059]/30 border-t-[#C5A059] rounded-full animate-spin` (دوران مستمر).
  - عنوان **«جاري تخصيص مقعدك...»** `text-xl font-black text-white` Amiri.
  - فرعي **«يتم اختيار أفضل مقعد لك»** `text-sm` لون `#808080` Amiri.
  - خطأ `apiError` (mono، mt-4، bg-[#8A0303]/10).

---

### 4.8 مودال «تأكيد الانتقال» (`joinConfirmation` — قيود الانضمام/الانضمام المتأخر)

يُفتح عندما يرفض `room:auto-join` بـ `requiresConfirmation` (مثل الانضمام بعد بدء اللعبة أو أي قيد يتطلب موافقة).

- الخلفية: `fixed inset-0 z-50 bg-black/80 backdrop-blur-sm` fade.
- البطاقة: `bg-[#111] border border-[#C5A059]/30 rounded-2xl p-6 max-w-sm shadow-2xl`، دخول `scale 0.9→1, y 20→0`.
- العنوان **«تأكيد الانتقال»** `text-[#C5A059] text-xl font-bold text-center`.
- الرسالة: **نصّ السيرفر الحرفي** (`joinConfirmation.message` = `err.response.error`) `text-white text-center text-sm leading-relaxed`.
- زرّان صفّاً:
  - **«إلغاء»**: `border border-[#333] text-[#888] font-mono text-sm hover:bg-[#222]` → إغلاق (`setJoinConfirmation(null)`).
  - **«موافق، انتقل»**: `bg-[#8A0303] text-white font-mono text-sm shadow-[0_0_15px_rgba(138,3,3,0.4)] hover:bg-[#a00404]` → `handleJoinGame(true)` (إعادة الانضمام بـ `forceJoin=true`).

---

### 4.9 مودال تأكيد الدعوة (`invitePrompt`) وخطأ الدعوة (`inviteError`)

**مودال الدعوة** (`z-[60]`, ثيم سماوي): يظهر بعد حلّ اسم الغرفة عند الوصول عبر `invite=1`.

- الخلفية: `fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm` fade.
- البطاقة: `bg-[#0c0c0c] border border-sky-500/40 rounded-2xl p-6 max-w-sm text-center`، دخول `scale 0.9→1, y 20→0`.
- **📨** `text-4xl mb-3`.
- العنوان **«دعوة للانضمام»** `text-sky-300 text-xl font-black` Amiri.
- السطر: **«هل تريد الانضمام إلى غرفة «{roomName}»؟»** — `roomName` بخط عريض لون `text-sky-300` (المصدر: `res.gameName || 'غرفة عن بُعد'`).
- السطر: **«دعاك {inviterName}»** — `inviterName` عريض لون `#C5A059` (المصدر: `by` من الرابط، أو `'لاعب'`).
- زرّان:
  - **«ليس الآن»**: `border border-[#333] text-[#888] font-mono text-sm` → إغلاق + `window.location.assign('/player/home')` (في Flutter: `context.go('/player/home')`).
  - **«انضمام»**: `bg-sky-600 text-white font-bold text-sm shadow-[0_0_15px_rgba(2,132,199,0.4)] hover:bg-sky-500` → `setInvitePrompt(null); setInviteConfirmed(true)` (وهذا يُطلق effect البحث التلقائي عن الغرفة، انظر §6).

**مودال خطأ الدعوة** (`inviteError`, `z-[60]`): غرفة لم تعد متاحة.

- البطاقة: `bg-[#0c0c0c] border border-[#333] rounded-2xl p-6 max-w-sm text-center`.
- **🚪** `text-4xl mb-3`.
- الرسالة: **`inviteError`** الحرفي (القيمة الوحيدة الحالية: **«الغرفة لم تعد متاحة»**) `text-white text-base`.
- زر **«العودة للرئيسية»**: `bg-[#1a1a1a] border border-[#333] text-white font-mono text-sm` → `setInviteError(''); window.location.assign('/player/home')`.

---

### 4.10 مودال تبديل الغرفة (`switchConfirm`)

يُفتح من `tryRejoinCurrentRoom` (المرحلة 2) عندما يكشف `‎/me` لعبة نشطة في غرفة **مختلفة** عن الغرفة الهدف.

- الخلفية: `fixed inset-0 z-[300] bg-black/80` مع `backdropFilter: blur(8px)` fade.
- البطاقة: `max-w-sm rounded-2xl border-2 border-[#C5A059]/50 bg-gradient-to-b from-[#1a1508] to-[#0a0804] p-6`، `boxShadow: 0 0 40px rgba(197,160,89,0.2)`، دخول spring `damping 20, stiffness 300`, `scale 0.85→1, y 20→0`.
- **🔄** `text-5xl text-center mb-4`.
- العنوان **«تبديل الغرفة»** `text-[#C5A059] text-xl font-black text-center` Amiri.
- **صندوق الغرفة الحالية**: `bg-red-900/20 border border-red-500/30 rounded-lg p-3`؛ label **«الغرفة الحالية»** `text-[9px] font-mono text-red-400/70 uppercase tracking-widest`؛ الاسم `switchConfirm.currentGameName` `text-red-300 font-bold text-sm` Amiri.
- **سهم** `↓` `text-[#C5A059] text-lg text-center`.
- **صندوق الغرفة الجديدة**: `bg-green-900/20 border border-green-500/30 rounded-lg p-3`؛ label **«الغرفة الجديدة»** `text-green-400/70`؛ الاسم `switchConfirm.targetGameName` `text-green-300 font-bold`.
- ملاحظة: **«سيتم تجميد مشاركتك في الغرفة الحالية ويمكنك العودة إليها لاحقاً»** `text-[#808080] text-xs text-center leading-relaxed` Amiri.
- زرّان:
  - **«ابقَ هنا»**: `border border-[#333] bg-black/60 text-[#888] font-bold text-sm` Amiri، معطّل أثناء `switchLoading` → **rejoin صامت للغرفة الحالية**: `emit('room:rejoin-player', {roomId: currentRoomId, physicalId: 0, phone: normalized})`؛ عند النجاح: ترطيب المقعد/الاسم/الدور/حالة الموت (+قلب البطاقة إن ميت) و`setStep('rejoined')`؛ ثم `setSwitchConfirm(null)`.
  - **«انتقل للغرفة»**: `border-2 border-[#C5A059] text-[#C5A059] font-black text-sm` مع توهّج، معطّل أثناء `switchLoading` → `handleSwitchRoom`؛ النص أثناء التحميل **`⏳ جارٍ...`**.

---

### 4.11 بانر المقعد المخصّص (بعد الانضمام — فيزيائي فقط)

يظهر في خطوة `done` عندما `!isRemote && physicalId` موجود.

- `motion.div` spring `damping 15, stiffness 200`, `scale 0.9→1, opacity 0→1`؛ `rounded-2xl p-5 relative overflow-hidden mb-4`.
- الخلفية: `linear-gradient(135deg, rgba(197,160,89,0.15), rgba(197,160,89,0.03))`، حد `2px solid rgba(197,160,89,0.4)`، `boxShadow: 0 0 30px rgba(197,160,89,0.1), inset 0 0 30px rgba(197,160,89,0.05)`.
- **«🪑 مقعدك رقم»** `text-[#808080] text-xs` Amiri.
- **الرقم** `physicalId`: `text-5xl font-black text-[#C5A059]` Amiri، `textShadow: 0 0 20px rgba(197,160,89,0.4)`.
- **«يرجى الجلوس في مقعدك»** `text-[#C5A059]/70 text-xs` Amiri.

في الريموت لا يظهر البانر؛ بدلاً منه في شريط الأدوات نص **«مقعدك #{physicalId}»** `text-[11px] font-mono text-[#808080]` (الرقم `text-[#C5A059] font-black text-sm`).

---

### 4.12 شريط الأدوات + Debug bar (أعلى شاشة `done`/`rejoined`)

- صف `flex items-center justify-between mb-2`:
  - زر **«🃏 الأدوار»**: `bg-black/40 border border-[#2a2a2a] text-[#C5A059] text-[11px] font-bold rounded-lg` → يفتح `RolesInfoModal` (22-role-cards.md).
  - (ريموت) نص المقعد كما في §4.11.
  - زر **«🚪 خروج»**: `bg-black/40 border border-red-500/25 text-red-400 text-[11px] font-bold rounded-lg` → `handleLogout` (20-game-state-core.md).
- **Debug bar** (فيزيائي فقط): `text-[10px] font-mono text-[#9a9a9a] bg-[#0a0a0a] border border-[#1a1a1a]`، النص **`P:{gamePhase||'null'} | C:{votingCandidates.length} | R:{assignedRole||'null'} | S:{step} | v3.0`**. **قرار نقل:** اجعله مخفياً خلف علم debug في Flutter (لا يظهر في الإنتاج)، لكن وثّقه للتكافؤ في وضع التطوير.

---

### 4.13 شاشة انتظار اللوبي (`done`/`rejoined` + `assignedRole === null`)

الشرط: `(!gamePhase || gamePhase ∈ {LOBBY, ROLE_GENERATION, ROLE_BINDING}) && assignedRole === null`.

**بانر العقوبات** (عندما `penalties > 0`، أعلى الكتلة):
- حاوية `bg-red-950/20 border border-red-900/30 rounded-xl p-3 shadow-[0_0_15px_rgba(220,38,38,0.05)]`.
- **`ACTIVE RULE VIOLATIONS`** `text-red-400 text-[10px] font-mono tracking-widest uppercase`.
- صف نقاط بعدد `maxPenalties`: كل نقطة `w-3 h-3 rounded-full`؛ الممتلئة (`i < penalties`) `bg-red-600 shadow-[0_0_8px_#dc2626]`؛ الفارغة `bg-neutral-800 border border-neutral-700`؛ انتقال `duration-300`.
- **«تحذير: ({penalties}/{maxPenalties}) عقوبات. سيتم طردك عند تجاوز الحد.»** `text-[10px] text-red-300/70` Amiri.

**نسخة اللعب عن بُعد** (`isRemote`):
- `PhoneSpectatorView` بوضع `lobby` (يمرّر `roster, physicalId, gamePhase||'LOBBY', maxPlayers, videoByPid, speakingByPid`) — حلقة كروت الطاولة (27-spectator-gameover.md).
- `RoomCodeCard` (§4.14) `mt-2`.
- **شريط تقدّم المقاعد** `mt-2 h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden`: التعبئة `bg-gradient-to-r from-[#C5A059] to-[#E8C97A]` بعرض `min(100, roster.length / (maxPlayers || roster.length || 1) * 100)%`، انتقال `transition-[width] duration-500`.
- سطر **«انضمّ {roster.length} من {maxPlayers}»** `text-center text-[10px] font-mono text-[#808080]`.

**نسخة الغرفة الفيزيائية** (غير الريموت):
- `ShieldCheckIcon` بلون `#C5A059`، **نبض opacity `[0.5,1,0.5]` بمدة 3s متكرر لانهائياً** `mb-6`.
- عنوان **«اكتمل التشفير»** `text-3xl font-black text-[#C5A059]` Amiri.
- `MafiaCard` بغطاء فقط: `role=null`, `flippable=false`, `size="md"`, `playerNumber=parseInt(physicalId)`, `playerName=displayName`, `gender`, `avatarUrl`. (بطاقة غطاء غير قابلة للقلب — لا تكشف شيئاً.)
- خط فاصل `w-16 h-[1px] bg-[#2a2a2a] mx-auto mb-6`.
- **`SECURE YOUR DEVICE. DIRECT ATTENTION TO PRIMARY MONITOR.`** `text-[#C5A059] text-[11px] font-mono uppercase tracking-[0.2em] leading-relaxed`.
- **`STATUS ACTIVE. INTERFACE LOCKED.`** `text-[#555] text-[9px] font-mono uppercase tracking-widest`.

> بمجرد أن يصبح `assignedRole !== null` تنتقل الواجهة لحالة «تم تعيين مهمتك» (بطاقة الدور القابلة للقلب) — تُغطّى في 22-role-cards.md. حدّ هذا الملف ينتهي عند اللوبي/الانتظار.

---

### 4.14 بطاقة رمز الغرفة `RoomCodeCard`

- زر كامل العرض: `rounded-xl border border-[#C5A059]/40 bg-[#C5A059]/5 py-3 text-center active:scale-[0.99]`. لا يُعرض شيء إذا `code` فارغ.
- سطر علوي: **«رمز الغرفة — اضغط للنسخ»** أو **«✓ تم النسخ»** بعد النسخ `text-[10px] text-[#9a9a9a]`.
- الرمز: `code` بخط `font-mono text-3xl font-black text-[#C5A059] tracking-[0.3em]`, **`dir="ltr"`** (جزيرة LTR).
- عند الضغط: نسخ للحافظة (fallback عبر textarea مؤقّت في المتصفح القديم) ثم إظهار «تم النسخ» لمدة **2000ms**. في Flutter: `Clipboard.setData` + `Timer(2s)`.

---

### 4.15 الحالات الفارغة/الحدّية للـ UI (ملخص)

- **كود غير مكتمل / لا اتصال**: زر `code` معطّل، النص `CONNECTING...`.
- **غرفة غير موجودة**: `apiError = 'لم يتم العثور على اللعبة'` (أو نص السيرفر) في خطوة `code`.
- **غرفة ممتلئة / مقفلة / قيد آخر**: نصّ خطأ السيرفر الحرفي في `apiError` على الخطوة النشطة (`auto_joining` أو `ticket`)؛ إن كان قابلاً للتجاوز يأتي `requiresConfirmation` → مودال §4.8.
- **تذكرة خاطئة**: خطأ يحوي «التذكرة»/`ticket` → العودة لخطوة `ticket` مع `apiError`.
- **استبيانات معلّقة**: `PENDING_SURVEYS` → `apiError` + توجيه `/player/feedback` بعد 1.5s.
- **دعوة لغرفة ميتة**: مودال خطأ الدعوة §4.9.
- **لوبي بلا لاعبين آخرين**: شريط التقدّم عند 0% (الريموت)، البطاقة تبقى ظاهرة (الفيزيائي).

---

## 5. التكيّف مع الشاشات 6→11 إنش

القاعدة العامة والفئات موثّقة بالكامل في **01-foundation-theme.md** (Window Size Classes: compact < 600dp، medium 600–840dp، expanded > 840dp). تخصيص **هذه الشاشة**:

### compact (< 600dp — هواتف 6–7 إنش)
- عمود واحد مطابق للـ PWA. البطاقة الرئيسية `max-w-md` (~448dp) تملأ العرض تقريباً مع حشوة `p-8`.
- رأس MAFIA CLUB بالحجم الأصغر (`text-4xl` / لوجو 60px).
- بطاقة الغطاء في اللوبي بحجم `md` (224×320 منطقي).
- بانر المقعد بالرقم `text-5xl` كما هو.
- المودالات (`joinConfirmation`, `invitePrompt`, `switchConfirm`) بعرض `max-w-sm` تملأ العرض مع هامش `p-4`.

### medium (600–840dp — تابلت 8 إنش)
- **سقف عرض للمحتوى النصي 640dp**: لُفّ عمود الدخول كله داخل `ConstrainedBox(maxWidth: 640)` موسّط. البطاقة تبقى `max-w-md` لكن يزيد الهامش الجانبي فتُصبح جزيرة موسّطة أنيقة بدل الامتداد.
- ترقية الرأس للحجم الأكبر (`md:text-5xl` / لوجو 80px) — يبدأ من هذه الفئة.
- شبكة اختيار الجنس ومربّعات تاريخ الميلاد تبقى عمودين/ثلاثة أعمدة لكن بحقول أعرض قليلاً وخط أوضح.
- في **لوبي الريموت**: ارفع أعمدة/قطر حلقة `PhoneSpectatorView` (يُدار في 27-spectator-gameover.md) واجعل شريط التقدّم وبطاقة الرمز ضمن سقف 640dp.
- بطاقة غطاء اللوبي: ارفعها إلى `size lg` (256×352).

### expanded (> 840dp — تابلت 10–11 إنش)
- **سقف عرض 840–960dp** للعمود؛ وسّط المحتوى ولا تمدّده.
- **ضاعف حجم عناصر اللعب الحسّاسة بدل تمديدها**: بطاقة الغطاء/الدور في اللوبي إلى حجم يعادل ~2× (استخدم `size lg` مع `FittedBox` مكبّر أو ضاعف الأبعاد المنطقية)؛ رقم المقعد في البانر أكبر (`text-6xl`+) مع الحفاظ على النسب.
- **two-pane اختياري في اللوبي**: في الريموت اعرض حلقة الطاولة في جزء والبطاقة/رمز الغرفة/شريط التقدّم في الجزء الآخر؛ في الفيزيائي أبقِ عموداً واحداً موسّطاً (لا حاجة لجزء ثانٍ — الشاشة الأساسية هي شاشة العرض المنفصلة).
- شبكة التسجيل: يمكن رفع مربّعات تاريخ الميلاد وأزرار الجنس لعرض أكبر مع فراغات أوسع، لكن أبقِ الحقول النصية ضمن سقف قابل للقراءة (لا تمدّد حقل الكود/الهاتف لعرض الشاشة).
- **حقل الكود والهاتف والتذكرة**: كبّر الخط والحشوة (أهداف لمس أكبر) لكن اضبط عرضها الأقصى (~480dp) كي لا تتشتّت الأرقام.

> ملاحظة: كل جُزُر LTR (`+962`, حقل التذكرة, رمز الغرفة, أحرف `CLUB`) تحتفظ باتجاهها في كل الفئات عبر `Directionality(TextDirection.ltr)` صريحة.

---

## 6. المنطق والتدفقات

### 6.1 آلة الحالة `Step`

```
Step = code | phone | login | register | change_password | ticket | auto_joining | done | rejoined
```

**الحالة الابتدائية** (initializer):
- `initialRoomCode` موجود **و** token محفوظ (`getSavedToken()`) → `code` (مؤقتاً — يستولي عليها effect البحث التلقائي).
- `initialRoomCode` موجود بلا token → `phone`.
- غير ذلك → `code`.

**الانتقالات:**
```
code ── handleFindRoom (نجاح، لا token) ──▶ phone
code ── handleFindRoom (token+pid محفوظ) ──▶ tryRejoinCurrentRoom ──▶ {rejoined | switchConfirm | ticket | auto_joining}
phone ── handlePhoneLookup (token+pid) ──▶ {change_password | tryRejoinCurrentRoom}
phone ── lookup found ──▶ login
phone ── lookup !found ──▶ register
login ── نجاح، mustChangePassword ──▶ change_password
login ── نجاح ──▶ tryRejoinCurrentRoom
register ── نجاح ──▶ ticket (إن required) | auto_joining (بعد 100ms)
change_password ── نجاح ──▶ tryRejoinCurrentRoom
ticket ── handleAutoJoin(false, ticketNumber) ──▶ auto_joining ──▶ {done | error→ticket}
auto_joining ── handleAutoJoin نجاح ──▶ done
tryRejoinCurrentRoom مرحلة1/2 نجاح ──▶ rejoined
tryRejoinCurrentRoom مرحلة2 غرفة مختلفة ──▶ switchConfirm (مودال)
```

`done` = انضمام جديد هذه الجلسة؛ `rejoined` = استعادة جلسة قائمة. كلاهما يعرض شاشة اللعب/اللوبي.

### 6.2 `handleFindRoom(code?)`
1. `targetCode = code || roomCode.trim()`؛ مسح `apiError`.
2. `emit('room:find-by-code', {roomCode: targetCode})` → `{roomId, gameName, maxPlayers, requireTicket}`.
3. `setRoomId, setGameName, setMaxPlayers(res.maxPlayers || 10), setRequireTicket(res.requireTicket ?? false)`.
4. لو `savedToken && savedPlayerId` (من state أو localStorage): إن لم يوجد `phone` → `GET /me` لترطيب الاسم/الهاتف/الجنس/الأفاتار؛ ثم `tryRejoinCurrentRoom(pid, token, phone, needsTicket, res.roomId)` و`return`.
5. وإلا لو `!code` (استُدعيت يدوياً) → `setStep('phone')`.
6. catch → `apiError = err.message || 'لم يتم العثور على اللعبة'`.

> **ملاحظة QR:** عند الدخول عبر رابط، `handleFindRoom(initialRoomCode)` يُستدعى تلقائياً من effect بعد `isConnected && tokenChecked` (وبعد تأكيد الدعوة إن `inviteFlag`). لأن `code` مُمرَّر، الخطوة **لا** تتقدّم إلى `phone` تلقائياً إلا عبر مسار الهاتف المنفصل.

### 6.3 `tryRejoinCurrentRoom(pid, token, phoneOverride?, ticketRequired?, roomIdOverride?)` — ثلاث مراحل
- **المرحلة 1 (socket):** لو `emit && effectiveRoomId && playerPhone` → `emit('room:rejoin-player', {roomId, physicalId: 0, phone: normalized})`. عند `res.success && res.player`: ترطيب `physicalId, name, gender, playerId, role?, mafiaTeam?, sibling?, assassinContracts?`، وإن `!isAlive` → `isPlayerDead=true, cardFlipped=true`؛ كتابة `mafia_session`؛ `setStep('rejoined')`.
- **المرحلة 2 (HTTP `/me`):** لو رجع `activeGame.roomId`:
  - نفس الغرفة الهدف (أو لا هدف) → ترطيب + `mafia_session` + `rejoined`.
  - غرفة **مختلفة** → فتح `switchConfirm` (بلا انضمام).
- **المرحلة 3 (انضمام جديد):**
  - `needTicket && pid` → `auto_joining` + `handleAutoJoin(false, undefined, effectiveRoomId)` بعد 100ms (الباكإند يتحقق من تذكرة مسبقة).
  - `needTicket && !pid` → `ticket`.
  - غير ذلك → `auto_joining` + auto-join بعد 100ms.

### 6.4 `handleAutoJoin(forceJoin=false, ticket?, roomIdOverride?)`
1. حارس: `displayName` مطلوب (return صامت)؛ `effectiveRoomId` مطلوب وإلا `apiError='لم يتم تحديد الغرفة'`.
2. `setStep('auto_joining')`.
3. `dob = (dobYear && dobMonth && dobDay) ? 'YYYY-MM-DD' : undefined`؛ `genderUpper = female→FEMALE | male→MALE | undefined`.
4. `joinRoom(effectiveRoomId, displayName, phone, playerId||undefined, genderUpper, dob, forceJoin, ticket||ticketNumber||undefined, undefined)` → `room:auto-join`. **`preferredSeat` دائماً `undefined`** (المقعد عشوائي بالتصميم؛ العودة لمقعد تمرّ عبر rejoin).
5. نجاح: `physicalId = res.assignedSeat`؛ `isRemote = !!res.isRemote` (كشف مبكر)؛ كتابة `mafia_session {roomId, physicalId||0, phone, displayName, roomCode, playerId||null}`؛ إزالة `mafia_user_exited` و`mafia_held_seat`؛ `setJoinConfirmation(null)`؛ `setStep('done')`.
6. **معالجة الأخطاء** (بالترتيب):
   - `err.response.code === 'PENDING_SURVEYS'` → `apiError = err.response.error || 'يجب إكمال استبيانات فعالياتك السابقة قبل الانضمام'` + `setTimeout(() => location.href='/player/feedback', 1500)` + return.
   - `isTicketError = errMsg.includes('التذكرة') || errMsg.includes('ticket')`.
   - `err.response.requiresConfirmation` → `setJoinConfirmation({message: err.response.error})` + `setStep(isTicketError || requireTicket ? 'ticket' : 'auto_joining')`.
   - غير ذلك → `apiError = errMsg || 'حدث خطأ في الانضمام'` + نفس منطق الخطوة.

### 6.5 تدفّق الدعوة (`inviteFlag`)
1. effect البحث التلقائي عن الغرفة **معطّل** حتى `inviteConfirmed` (`if (inviteFlag && !inviteConfirmed) return`).
2. effect حلّ الدعوة (يعمل عند `inviteFlag && !inviteConfirmed && !invitePrompt && !inviteError && initialRoomCode && isConnected`): `emit('room:find-by-code', {roomCode: initialRoomCode})`.
   - **مهم:** قد يرجع `{success:false}` **دون رفض الوعد** → إن `!res || res.success === false || !res.roomId` → `inviteError = 'الغرفة لم تعد متاحة'`.
   - وإلا → `invitePrompt = {roomName: res.gameName || 'غرفة عن بُعد', inviterName: inviterName || 'لاعب'}`.
   - catch → `inviteError = 'الغرفة لم تعد متاحة'`.
3. ضغط «انضمام» → `setInviteConfirmed(true)` → يُفعّل effect البحث التلقائي → `handleFindRoom(initialRoomCode)` → المسار المعتاد.
4. ضغط «ليس الآن» / خطأ → `/player/home`.

### 6.6 `handleSwitchRoom`
`emit('room:freeze-player', {roomId: currentRoomId, phone: normalized, playerId?})` (تجميد المقعد في الغرفة القديمة) → مسح `mafia_session` → `setRoomId(targetRoomId)` + إعادة ضبط `assignedRole=null, cardFlipped=false, isPlayerDead=false, physicalId=''` → `setSwitchConfirm(null)` → `setStep(requireTicket ? 'ticket' : 'auto_joining')` (+ auto-join بعد 100ms إن لا تذكرة). خطأ → `apiError = err.message || 'فشل في التبديل'`. `switchLoading` يحرس الأزرار.

### 6.7 المؤقتات والمهل في هذا التدفّق
- **ack timeout 15s** لكل `emit` (مغلّف الـ socket) → رفض بـ **«الخادم في وضع قطع الاتصال أو لا يستجيب (Timeout)»**.
- `setTimeout(handleAutoJoin, 100)` بعد register/switch/rejoin مرحلة3 (تأخير صغير لضمان تحديث state).
- `setTimeout(location.href='/player/feedback', 1500)` عند PENDING_SURVEYS.
- `RoomCodeCard`: مؤقّت 2000ms لإعادة «اضغط للنسخ».
- **لا يوجد** poll أو مؤقّت لعب في مرحلة الدخول نفسها؛ الـ poll (كل 3s) يبدأ فقط بعد `done`/`rejoined` (20-game-state-core.md).

### 6.8 إعادة الاتصال واستعادة الحالة (خاص بالدخول)
- عند دخول عبر QR والـ token محفوظ: الحالة الابتدائية `code` ثم effect (`initialRoomCode && isConnected && tokenChecked && (!inviteFlag || inviteConfirmed)`) يستدعي `handleFindRoom(initialRoomCode)` → قد ينتهي مباشرة في `rejoined`/`done` دون تفاعل المستخدم.
- `userExited` (من `mafia_user_exited === 'true'`) يمنع إعادة الدخول التلقائي؛ يظهر نموذج الهاتف في خطوة `phone` حتى مع وجود `initialRoomCode`.
- بقية الصمود (rejoin على reconnect، شبكة الأمان بعد 500ms، حارس المرحلة، المقعد المحجوز 10 دقائق) تعيش في 20-game-state-core.md — هذا الملف يسلّم إليها بعد `setStep('done'|'rejoined')`.

---

## 7. عقود التكامل

### 7.1 REST (كلها JSON، الأخطاء نصوص عربية جاهزة في `error`)

| # | Method + Path | Request | Response (الحقول المستخدمة) |
|---|---|---|---|
| 1 | `GET /api/player-auth/me` | header `Authorization: Bearer <token>` | `success`, `player {id, name, phone, gender ('MALE'/'FEMALE'), mustChangePassword, avatarUrl}`, `activeGame {roomId, roomCode, physicalId, gameName?, role?, isAlive?} \| null` |
| 2 | `POST /api/player/lookup` | `{ phone }` (مطبَّع ببادئة `0`) | `found: boolean`, `player {displayName, id, playerId?}` |
| 3 | `POST /api/player-auth/login` | `{ phone, password }` | `success`, `token`, `player {id, name, avatarUrl?, mustChangePassword?}`, `error?` |
| 4 | `POST /api/player-auth/register` | `{ phone, password, name, gender ('MALE'\|'FEMALE'), dob ('YYYY-MM-DD'\|null) }` | `success`, `token`, `player {id}`, `error?` (rate limit/تكرار الرقم) |
| 5 | `POST /api/player-auth/change-password` | `{ oldPassword, newPassword }` + `Bearer` | `success`, `token?` (قد يُدوَّر — لكن UI يواصل بالتوكن المتاح)، `error?` |

نصوص خطأ عميل (client-side): «كلمة المرور يجب أن تكون 4 أحرف على الأقل»، «كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل»، «خطأ في الاتصال»، «خطأ في تسجيل الدخول»، «لم يتم العثور على اللعبة»، «لم يتم تحديد الغرفة»، «حدث خطأ في الانضمام»، «فشل في التبديل».

### 7.2 Socket (كلها ack بمهلة 15s، نجاح عند `response.success === true`)

| Event | الاتجاه | Payload | متى |
|---|---|---|---|
| `room:find-by-code` | emit→ack | `{ roomCode }` → `{ roomId, gameName, maxPlayers?, requireTicket?, success? }` | إدخال الكود / حلّ الدعوة / auto-find. **قد يرجع `{success:false}` دون رفض** — عامله كغرفة غير متاحة في مسار الدعوة. |
| `room:auto-join` | emit→ack | `{ roomId, name, phone, playerId, gender, dob, forceJoin, ticketNumber, preferredSeat: undefined }` → `{ assignedSeat, isRemote?, gameName, constraintViolation? }` | الانضمام. أخطاء الرفض قد تحمل `err.response.code === 'PENDING_SURVEYS'` أو `err.response.requiresConfirmation` أو `err.response.error` (غرفة ممتلئة/مقفلة/تذكرة). |
| `room:rejoin-player` | emit→ack | `{ roomId, physicalId (0=بحث بالهاتف), phone? }` → `{ success, gameName, player {physicalId, name, gender, playerId, role?, isAlive}, mafiaTeam?, sibling?, assassinContracts?, mafiaChatEnabled?, phase?, votingState? }` | rejoin بالهاتف (tryRejoin مرحلة1، «ابقَ هنا» في مودال التبديل). |
| `room:freeze-player` | emit→ack | `{ roomId, phone, playerId? }` | تجميد المقعد في الغرفة القديمة عند التبديل. |

**اتجاه:** كل ما سبق **إرسال من العميل مع ack**. لا يوجد استماع خاص بمرحلة الدخول في هذا الملف؛ مستمعات `connect`/أحداث اللعب تُدار في 20-game-state-core.md. `isConnected` و`loading` يأتيان من طبقة الـ socket/الـ hook.

---

## 8. نماذج Dart المطلوبة

```dart
enum Step { code, phone, login, register, changePassword, ticket, autoJoining, done, rejoined }

enum Gender { male, female } // '' في الويب = لا اختيار؛ مثّلها بـ null

class RoomFindResult {
  final String roomId;
  final String gameName;
  final int maxPlayers;      // افتراضي 10
  final bool requireTicket;  // افتراضي false
  final bool? success;       // قد يأتي false دون رفض (مسار الدعوة)
}

class AutoJoinResult {
  final int? assignedSeat;
  final bool? isRemote;
  final String? gameName;
  final dynamic constraintViolation;
}

class JoinErrorPayload {          // من err.response
  final String? code;            // 'PENDING_SURVEYS'
  final bool? requiresConfirmation;
  final String? error;           // نص عربي حرفي
}

class RejoinPlayer {
  final int physicalId;
  final String name;
  final String gender;           // 'MALE'/'FEMALE'
  final int? playerId;
  final String? role;
  final bool isAlive;
}

class RejoinResult {
  final bool success;
  final String? gameName;
  final RejoinPlayer? player;
  final List<MafiaTeamMember>? mafiaTeam;
  final Sibling? sibling;
  final dynamic assassinContracts;
  final bool? mafiaChatEnabled;
  final String? phase;
  final dynamic votingState;
}

class MeResponse {
  final bool success;
  final PlayerProfile? player;   // {id, name, phone, gender, mustChangePassword, avatarUrl}
  final ActiveGame? activeGame;  // {roomId, roomCode, physicalId, gameName?, role?, isAlive?}
}

class LookupResult {
  final bool found;
  final LookupPlayer? player;    // {displayName, id, playerId?}
}

class SwitchConfirmData {
  final String currentRoomId;
  final String currentGameName;
  final String targetRoomId;
  final String targetGameName;
}

class InvitePromptData { final String roomName; final String inviterName; }

class JoinConfirmationData { final String message; }

class SessionData {              // mafia_session
  final String roomId;
  final int physicalId;          // 0 إن غير مخصّص
  final String phone;
  final String displayName;
  final String roomCode;
  final int? playerId;
}

// نموذج الحالة (Riverpod/Bloc) لتدفّق الدخول:
class JoinFlowState {
  final Step step;
  final String roomCode, roomId, gameName, phone, displayName, ticketNumber;
  final int maxPlayers;
  final String? physicalId;      // نص في الويب (parseInt عند الحاجة)
  final int? playerId;
  final Gender? gender;
  final String? dobDay, dobMonth, dobYear;
  final bool requireTicket, isRemote, userExited, tokenChecked, isConnected, loading;
  final String apiError;
  final SwitchConfirmData? switchConfirm;
  final bool switchLoading;
  final JoinConfirmationData? joinConfirmation;
  final InvitePromptData? invitePrompt;
  final String inviteError;
  final bool inviteConfirmed;
  final int penalties, maxPenalties;
  final List<dynamic> roster;
  final String? avatarUrl;
}
```

`MafiaTeamMember`, `Sibling`, `PlayerProfile`, `ActiveGame` معرّفة في 02-models-data-layer.md.

---

## 9. الحزم المستخدمة

- `socket_io_client` — `room:*` events؛ `emitWithAck(...).timeout(Duration(seconds:15))` مع نمذجة `{success:false, error, code, requiresConfirmation}` كـ typed exception (بدل مطابقة نصوص «التذكرة»/`ticket` — احتفظ بمطابقة النص فقط كـ fallback إن لم يوفّر السيرفر code).
- `dio` أو `http` — نقاط REST الخمس (Bearer).
- `shared_preferences` (+ `flutter_secure_storage` للتوكن) — مفاتيح `mafia_*` (05-session-auth.md)؛ قراءة متزامنة قبل أول frame.
- `flutter_animate` أو implicit/explicit animations — انتقالات fade للخطوات (`AnimatedSwitcher`)، spring للمودالات (scale 0.9→1)، نبض الدرع (opacity loop 3s)، دخول الرأس (1.2s cubic `[0.16,1,0.3,1]`)، spring بانر المقعد (damping 15/stiffness 200).
- `google_fonts` — Amiri (عربي serif) + JetBrains Mono (أرقام/ملصقات إنجليزية).
- `app_links` / `go_router` deep-link config — التقاط `‎/join/{code}` و`‎/player/join?code=&invite=1&by=`.
- `vibration` — أنماط الاهتزاز (تُستخدم بعد التوزيع؛ ليست في مرحلة الدخول نفسها لكن الطبقة مشتركة).
- خدمة `Clipboard` من `services.dart` — نسخ رمز الغرفة.

---

## 10. اختلافات Android / iOS

- **جُزُر LTR داخل RTL** (`+962`, حقل التذكرة `dir="ltr"`, رمز الغرفة, أحرف `CLUB`): تحتاج `Directionality(TextDirection.ltr)` صريحة على كلا النظامين — سلوك متطابق، لكن **تحقّق بصرياً على iOS** حيث محرّك النص قد يعيد ترتيب الأرقام/الرموز بشكل مختلف قليلاً.
- **لوحات المفاتيح الرقمية**: `keyboardType: TextInputType.number` لحقل الكود والهاتف والتذكرة (وإن كان حقل التذكرة نصياً — استخدم `TextInputType.text` مطابقةً للويب الذي لا يصفّي التذكرة). `autofocus: true` يفتح اللوحة تلقائياً — على iOS قد يتأخّر الفتح؛ استخدم `FocusNode` وطلب التركيز بعد أول frame.
- **الحافظة (RoomCodeCard)**: `Clipboard.setData` يعمل على الاثنين بلا fallback (حيلة textarea الويب غير لازمة). على iOS قد يظهر شريط «تم النسخ» نظامي في iOS 14+ — لا تكرّر التنبيه، الاكتفاء بنص «✓ تم النسخ» الداخلي.
- **Deep links**: iOS = Universal Links (Associated Domains + apple-app-site-association)؛ Android = App Links (assetlinks.json + intent filters). مسار `‎/join/{code}` **عام (بلا مصادقة)** ويجب أن يدخل التدفّق دون حارس تسجيل الدخول (11-shell-navigation.md).
- **`env(safe-area-inset)`**: غير مطبّق مباشرة في شاشات الدخول (لا شريط سفلي هنا)، لكن التزم بـ `SafeArea` حول العمود.
- خلاف ذلك: **لا اختلافات جوهرية** في منطق الدخول — نفس الـ endpoints ونفس أحداث الـ socket ونفس النصوص على النظامين.

---

## 11. الأصول المطلوبة

- **`/mafia_logo.png`** — لوجو النادي، 60px (موبايل) / 80px (md)، مع `drop-shadow` أحمر. (asset مشترك مع شاشات المصادقة.)
- **أيقونات SVG inline** (أعِد رسمها كـ `CustomPainter` أو أصول SVG عبر `flutter_svg`):
  - `OperationIcon` (قفل) — خطوة code/login/change_password.
  - `PhoneIcon` — خطوة phone.
  - `ShieldCheckIcon` — لوبي الانتظار الفيزيائي.
  - **أيقونة التذكرة** (خطوة ticket): SVG 40×40, `stroke=currentColor strokeWidth=1.5 strokeLinecap=round strokeLinejoin=round opacity-80`, المسارات الحرفية:
    - `M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z`
    - `M13 5v2` — `M13 17v2` — `M13 11v2`
- **إيموجي كأيقونات**: 🪑 (بانر المقعد)، 🃏 (زر الأدوار)، 🚪 (زر الخروج/خطأ الدعوة)، 📨 (مودال الدعوة)، 🔄 (مودال التبديل)، 🎫 (زر التذكرة)، ✓ (نسخ الرمز)، ⏳ (تحميل التبديل). استخدم مجموعة إيموجي خالية من ZWJ لتوافق Android القديم.
- **خطوط**: Amiri + JetBrains Mono (google_fonts).
- **`display-bg`, `blood-vignette`, `remote-vignette`** — خلفيات CSS مخصّصة؛ حوّلها إلى `BoxDecoration`/`CustomPaint` (تُعرّف في 01-foundation-theme.md).
- لا أصوات ولا Lottie في مرحلة الدخول/اللوبي.

---

## 12. معايير القبول — checklist تكافؤ

- [ ] خطوة `code`: حقل 4 أرقام فقط، placeholder `----`, mono `text-4xl tracking-[0.4em]`, autoFocus؛ زر معطّل حتى 4 أرقام + `isConnected`؛ نص `ESTABLISH LINK`/`CONNECTING...`.
- [ ] الحالة الابتدائية: QR+token → `code` (auto-find)؛ QR بلا token → `phone`؛ لا شيء → `code`.
- [ ] الدخول عبر `‎/join/{code}` يعمل **بلا مصادقة** ويحلّ الغرفة تلقائياً.
- [ ] الدخول عبر `‎/player/join?code=&invite=1&by=` يعرض مودال الدعوة السماوي بالنصوص الحرفية «دعوة للانضمام» / «هل تريد الانضمام إلى غرفة «{roomName}»؟» / «دعاك {inviterName}» قبل أي انضمام.
- [ ] رفض «ليس الآن» → `/player/home`؛ غرفة ميتة → مودال «الغرفة لم تعد متاحة» + «العودة للرئيسية».
- [ ] `room:find-by-code` يعامل `{success:false}` كغرفة غير متاحة (دون انتظار رفض الوعد).
- [ ] خطوة `phone`: رقاقة `+962` + حقل 10 أرقام؛ زر معطّل تحت 9 أرقام؛ حالة `LOCATING COMPONENT...` النابضة عند حلّ الرابط.
- [ ] تطبيع الهاتف الأردني (بادئة `0`) مطابق قبل كل lookup/login/register/rejoin.
- [ ] `phone` مع token محفوظ → يتخطّى login (change_password إن لزم، وإلا rejoin).
- [ ] خطوة `register`: تاريخ ميلاد بثلاث قوائم (سنة = currentYear−8 رجوعاً 50 سنة)، جنس زرّان ملوّنان، تحقّق كلمة المرور ≥4 بالنص الحرفي؛ زر `SUBMIT DOSSIER` معطّل حسب الشروط.
- [ ] خطوة `login`: Enter يرسل؛ زر `ACCESS GRANTED` معطّل بلا كلمة مرور؛ عنوان «مرحباً {displayName}».
- [ ] خطوة `change_password`: بلا زر رجوع؛ ملاحظة «كلمة المرور الحالية مؤقتة…»؛ زر `UPDATE CODE`.
- [ ] خطوة `ticket`: حقل `dir="ltr"`, زر أخضر متدرّج «🎫 تحقق وادخل» / «جارٍ التحقق...»، حالة معطّلة رمادية `#222`.
- [ ] خطوة `auto_joining`: سبينر ذهبي 64px + «جاري تخصيص مقعدك...» + «يتم اختيار أفضل مقعد لك».
- [ ] `room:auto-join` **لا يرسل `preferredSeat` أبداً**؛ المقعد المخصّص من `assignedSeat`.
- [ ] بعد الانضمام: `mafia_session` مكتوب، `mafia_user_exited`/`mafia_held_seat` محذوفان، `setStep('done')`.
- [ ] خطأ `PENDING_SURVEYS` → رسالة + توجيه `/player/feedback` بعد 1.5s.
- [ ] خطأ يحوي «التذكرة»/`ticket` → العودة لخطوة `ticket`.
- [ ] `requiresConfirmation` → مودال «تأكيد الانتقال» بنص السيرفر + «موافق، انتقل» (force) / «إلغاء».
- [ ] غرفة نشطة مختلفة → مودال «تبديل الغرفة» (z-300): صندوق أحمر/سهم/صندوق أخضر، «ابقَ هنا» (rejoin صامت) / «انتقل للغرفة» (freeze + انضمام).
- [ ] بانر المقعد (فيزيائي): «🪑 مقعدك رقم» + الرقم `text-5xl` ذهبي متوهّج + «يرجى الجلوس في مقعدك».
- [ ] لوبي فيزيائي: `ShieldCheckIcon` نابض 3s + «اكتمل التشفير» + بطاقة غطاء غير قابلة للقلب + «SECURE YOUR DEVICE…» + «STATUS ACTIVE. INTERFACE LOCKED.».
- [ ] لوبي ريموت: طاولة الحلقة + `RoomCodeCard` (نسخ + «✓ تم النسخ» 2s) + شريط تقدّم ذهبي + «انضمّ {n} من {maxPlayers}».
- [ ] بانر العقوبات في اللوبي عند `penalties>0`: «ACTIVE RULE VIOLATIONS» + نقاط + «تحذير: (n/max) عقوبات. سيتم طردك عند تجاوز الحد.».
- [ ] كل جُزُر LTR تحتفظ باتجاهها؛ الرأس MAFIA/CLUB بالأحرف المفروقة.
- [ ] كل نصوص خطأ السيرفر تُعرض حرفياً في `apiError` على الخطوة النشطة.
- [ ] التكيّف: compact عمود واحد؛ medium سقف 640dp + ترقية الرأس/البطاقة؛ expanded سقف 840–960dp + مضاعفة حجم البطاقة/رقم المقعد + two-pane في لوبي الريموت.

---

## 13. ملاحظات أداء وأمان

- **مغلّف الـ socket**: احترم `success`-envelope و15s timeout؛ احمل `code`/`requiresConfirmation`/`error` في الاستثناء المكتوب. لا تعتمد على مطابقة النص العربي («التذكرة») إلا كـ fallback أخير.
- **بطاقة الغطاء في اللوبي لا تكشف شيئاً**: `role=null`, `flippable=false` — لا تسمح بقلبها قبل التوزيع (anti-cheat).
- **`preferredSeat` لا يُرسل**: أي محاولة لإرسال مقعد مفضّل تكسر توزيع الباكإند العشوائي — لا تضفها.
- **الجلسة**: `mafia_session` يحمل `playerId`؛ عند تسجيل دخول لاعب مختلف امسح جلسة الآخر (منطق `handleLogin`). لا تحتفظ بجلسة لا تخص اللاعب الحالي.
- **قراءة التخزين قبل أول frame**: حمّل مفاتيح `mafia_*` بشكل متزامن في `main()`/splash كي يهبط اللاعب مباشرة في `rejoined` بلا وميض (يطابق lazy initializers في الويب).
- **`userExited`**: احترم علم `mafia_user_exited` لمنع إعادة دخول تلقائية غير مرغوبة بعد الخروج اليدوي.
- **أداء المودالات**: استخدم `showGeneralDialog`/`Stack` بترتيب z صريح (invitePrompt=60، joinConfirmation=50، switchConfirm=300) مطابقاً للويب كي لا تتداخل الطبقات؛ تجنّب `backdrop-blur` الثقيل على الأجهزة الضعيفة (استخدم خلفية معتمة صلبة بديلة حيث يلزم).
- **حماية سباق الدعوة**: لا تُطلق البحث التلقائي عن الغرفة قبل `inviteConfirmed`؛ وإلا ينضم اللاعب صامتاً دون موافقته (خرق تجربة الدعوة).
- **معدّل تسجيل الدخول**: `POST /login` محدود (15 طلباً/15 دقيقة)؛ اعرض خطأ السيرفر بلطف بلا إعادة محاولة تلقائية عدوانية.
