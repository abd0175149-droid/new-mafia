# الصباح والسينمائيات: NightAnimCinematic، ملخص الصباح، المؤقت الدائري
> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

---

## 1. الهدف والنطاق

هذا الملف يوثّق **طبقة العرض السينمائي للأحداث** ومكوّنات كروم المراحل المشتركة، بحيث يبنيها مطوّر Flutter من هذا الملف وحده. يغطي أربع كتل:

1. **`NightAnimCinematic`** — مكوّن تبديلي (switch) على `data.type` يعرض واحداً من **18 مشهداً سينمائياً كامل الحركة**. يُعرض **حصرياً على عميل الشاشة الكبيرة** (`src/app/display/page.tsx`) وليس داخل شاشة اللاعب:
   - أثناء مرحلة **NIGHT**: عند تقدّم الليدر في طابور الليل يبثّ السيرفر `night:animation`؛ تُعرض سينمائية «الفعل الجاري» داخل بطاقة noir لمدة **5 ثوانٍ بالضبط** ثم تُمسح تلقائياً.
   - أثناء مرحلة **MORNING_RECAP**: يبثّ السيرفر `display:morning-event`؛ تُعرض سينمائية «النتيجة» لمدة **10 ثوانٍ بالضبط** (كثير منها يضمّن بطاقة `MafiaCard` مقلوبة تكشف دور الضحية).
2. **إطار المضيف (host chrome)** حول السينمائية: خلفيتا NIGHT و MORNING_RECAP في صفحة العرض، وبطاقة `noir-card` بدخول/خروج `AnimatePresence`.
3. **`CircularTimer`** — حلقة العدّ التنازلي بنطاقات لون إلحاحية، دقّات قلب صوتية، واهتزاز شاشة في آخر 5 ثوانٍ. تُستخدم بجانب المتحدث (size 100) والمدافع (size 120) على شاشة العرض.
4. **`PhaseHeader` / `PhaseLoading`** — كروم موحّد لعناوين المراحل وحالات التحميل (تُستخدم أساساً في شاشات المضيف الريموت وفي استخدام واحد داخل PlayerFlow).
5. **تصنيف `MorningEvent`** الكامل (أنواع السينمائيات الصباحية) وخريطة عرض الأحداث الصباحية الشخصية للاعب، مع **أصول `.lottie` الأربعة**.

**قرار نطاق مهم:** بما أن التطبيق عميلٌ ثانٍ لنفس الـ backend، فإن `NightAnimCinematic` و`CircularTimer` **لا يُعرَضان في تجربة اللاعب العادي** (هي شاشة عرض). ننقلها في Flutter لأنها (أ) قد يستضيف تطبيق Flutter دور «شاشة العرض» لاحقاً، (ب) قد تُستعمل مشاهد الصباح داخل الريموت مستقبلاً. الجزء الذي **يراه اللاعب فعلاً** هو **ملخص الصباح الشخصي** داخل `PlayerPhaseView` (قسم §4.6 أدناه) وعدّادات التصويت/الدفاع (SVG مضمّنة، موثّقة في 23-night-phase.md و25-day-voting.md — هنا نوثّق `CircularTimer` المكوّن المستقل). لا تخترع أحداثاً أو endpoints غير موجودة.

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

- `C:\Projects\new mafia\unified-mafia\frontend\src\components\NightAnimCinematic.tsx` (1047 سطراً — المصدر الأساسي، قُرئ كاملاً)
- `C:\Projects\new mafia\unified-mafia\frontend\src\components\CircularTimer.tsx` (151 سطراً — قُرئ كاملاً)
- `C:\Projects\new mafia\unified-mafia\frontend\src\components\PhaseHeader.tsx` (17 سطراً — قُرئ كاملاً)
- `C:\Projects\new mafia\unified-mafia\frontend\src\components\PhaseLoading.tsx` (17 سطراً — قُرئ كاملاً)
- `C:\Projects\new mafia\unified-mafia\frontend\src\app\display\page.tsx` — إطار المضيف حول السينمائية + الأسلاك (سطور 85–86 حالة، 336–341 و398–450 معالجات socket + المؤقتات، 1331–1372 خلفيتا NIGHT/MORNING)
- `C:\Projects\new mafia\unified-mafia\frontend\src\components\PlayerPhaseView.tsx` — ملخص الصباح الشخصي للاعب (`MORNING_RECAP`، case 8) + خريطة أحداث الصباح الشخصية
- `C:\Projects\new mafia\unified-mafia\frontend\src\lib\soundManager.ts` — سلوك صوت كل سينمائية + وصفات WebAudio الاحتياطية + خريطة `/api/sounds/active-map`
- `C:\Projects\new mafia\unified-mafia\frontend\src\styles\globals.css` (سطور 103–114) — تعريف `.noir-card`
- `C:\Projects\new mafia\unified-mafia\frontend\public\animations\` — أصول dotLottie الأربعة
- `C:\Projects\new mafia\unified-mafia\frontend\src\components\MafiaCard.tsx` — البطاقة المضمّنة في 9 سينمائيات صباحية (موثّقة بالكامل في 22-role-cards.md)
- `C:\Projects\new mafia\unified-mafia\frontend\src\lib\constants.ts` — `Role`, `ROLE_NAMES`, `ROLE_ICONS`

---

## 3. التبعيات على ملفات الخطة الأخرى

- **01-foundation-theme.md** — بذرة الثيم (surface `#050505/#111`، primary `#8A0303`، accent `#C5A059`)، خطوط Amiri + JetBrains Mono، `Directionality(TextDirection.rtl)`، واستراتيجية Window Size Classes الكاملة المُحال إليها في §5.
- **04-socket-layer.md** — طبقة الـ socket المشتركة؛ هذا الملف مستهلك لأحداث `night:animation`، `display:morning-event`، `display:night-started`، `night:step-info`، `display:sound-play`، `admin:sounds-updated` (كلها تُوجّه عبر طبقة الـ socket).
- **07-sound-system.md** — نظام الصوت الكامل: خريطة `/api/sounds/active-map`، بوابة `localPlaybackEnabled`، مرآة `{fn,args}` (الليدر مصدر حصري)، ducking الـ ambient، وتصيير وصفات WebAudio العشر إلى ملفات مضمّنة. هذا الملف يستدعي أسماء المفاتيح الصوتية فقط (§7) ويحيل التنفيذ لـ 07.
- **22-role-cards.md** — مكوّن `MafiaCard`/`DynamicMafiaCard` المضمّن في السينمائيات الصباحية (props: `playerNumber, playerName, role, isFlipped, flippable, isAlive, isSilenced, hideIdentity, size, className`).
- **20-game-state-core.md** — آلة حالة المراحل، تعريف `Phase`، ونماذج الحالة العامة.
- **23-night-phase.md** — عرض NIGHT للاعب (`PlayerPhaseView` NIGHT) + عدّاد الفعل الليلي SVG المضمّن. ملخص الصباح الشخصي مذكور هنا (§4.6) لأنه «ملخص الصباح» لكنّ جسم مرحلة NIGHT/الفعل الليلي في 23.
- **25-day-voting.md** — عدّادات التصويت/الدفاع SVG المضمّنة في `PlayerPhaseView` (مختلفة عن `CircularTimer` المكوّن المستقل الموثّق هنا).
- **27-spectator-gameover.md** — أصول Lottie الخاصة بنهاية الجيم (`fireworks.lottie`, `prize-podium.lottie`) المذكورة في §11 مستهلكة أيضاً هناك.
- **30-host-console.md** — `PhaseHeader`/`PhaseLoading` تُستخدمان في شاشات المضيف الريموت (Voting/Elimination/Justification/NightRunner).
- **02-models-data-layer.md** — نماذج Dart المشتركة؛ نماذج هذا الملف (§8) تُضاف إليها.

---

## 4. الواجهة والتجربة تفصيلياً

### 4.0 اللغة البصرية العامة (تنطبق على كل السينمائيات)

- **اللوحة النوار (noir palette):** أحمر دموي `#8A0303`، قرمزي `#DC143C`، أحمر ساطع `#ff0000`، ذهبي `#C5A059`، أخضر حرجي `#2E5C31`، بنفسجي `#9333ea` و`#a855f7`، بنفسجي فاتح (violet) `#a78bfa`، رماديات `#555` / `#888` / `#808080` / `#9a9a9a`، شبه-أسود `#1a1a1a`، خلفية بطاقة `#0c0c0c`، حدود `#2a2a2a` / `#333`.
- **الخط العربي:** `Amiri, serif` لكل العناوين (inline style)، دائماً `font-black tracking-widest`. النص اللاتيني/mono يستخدم `font-mono` (JetBrains Mono) بتباعد واسع (`tracking-widest` / `tracking-[0.3em]`). كل نص عنوان عربي (RTL) لكن الحاويات `text-center` فلا اعتماد اتجاهي على التخطيط.
- **الأيقونات = إيموجي كنص** بحجم `text-8xl` (≈96px) مع توهّج ملوّن `drop-shadow` (مثل `drop-shadow-[0_0_30px_rgba(138,3,3,0.8)]`).
- **حاوية المشاهد الليلية:** ثابتة `h-[300px]` بعرض كامل، `overflow-hidden`، flex-centered. **حاوية المشاهد الصباحية:** `text-center py-4` (ارتفاع تلقائي، قد تحوي بطاقات).
- **كل الحركة framer-motion** بأنيميشن keyframes (تعليق «GSAP-powered» في رأس الملف خاطئ — **لا تنقل GSAP**).
- **`.noir-card`** (بطاقة الإطار): خلفية `#0c0c0c`، حد `1px #2a2a2a`، بلا radius (`rounded-none`)، ظل `0 15px 30px rgba(0,0,0,0.8)`، `position:relative; overflow:hidden`؛ وطبقة `::before` = حد داخلي `1.5px` بلون `dark-800` بهامش `4px` (`m-1`) و`pointer-events-none`. في Flutter: `Container` بحدّين متداخلين (حاوية خارجية + `Padding(4)` + حاوية داخلية بحد رفيع)، بلا زوايا مستديرة، ظل أسود عميق.

### 4.1 إطار المضيف (host chrome) حول السينمائية — صفحة العرض

**خلفية NIGHT** (`step==='lobby' && phase===NIGHT`، `key="night"`، جذر fade in/out):
- إيموجي 🌑 كبير: `text-9xl mb-8`، `grayscale opacity-50`، يتنفّس `opacity: [0.3, 0.6, 0.3]` على **4s** infinite.
- عنوان H2: **«الظلام دامس»** — `text-6xl font-black text-white mb-4 tracking-widest uppercase`، Amiri.
- سطر فرعي: **`OPERATION NIGHTFALL`** — `text-[#808080] text-xl font-mono tracking-[0.3em]`.
- عند وجود `animation`: بطاقة `AnimatePresence`: `noir-card p-10 mt-12 max-w-lg mx-auto border-[#8A0303]/40`؛ الدخول `{opacity:0, scale:0.9}` → `{opacity:1, scale:1}`؛ الخروج `{opacity:0, scale:0.9}` (بلا مدة صريحة → افتراضي framer ≈0.3s spring/tween). بداخلها `<NightAnimCinematic data={animation} />`.

**خلفية MORNING_RECAP** (`step==='lobby' && phase===MORNING_RECAP`، `key="morning"`، جذر fade in/out):
- إيموجي ☀️ كبير: `text-9xl mb-8 opacity-60`، يتمايل `opacity: [0.4, 0.8, 0.4]`، `rotate: [0, 5, -5, 0]` على **5s** infinite.
- عنوان H2: **«صباح جديد»** — `text-5xl font-black text-white mb-4 tracking-widest uppercase`، Amiri.
- سطر فرعي: **`MORNING INTELLIGENCE REPORT`** — `text-[#808080] text-lg font-mono tracking-[0.3em]`.
- عند وجود `animation`: بطاقة `AnimatePresence`: `noir-card p-10 mt-12 max-w-xl mx-auto border-[#C5A059]/30`؛ الدخول `{opacity:0, scale:0.8, y:30}` → `{opacity:1, scale:1, y:0}` على **0.6s**؛ الخروج `{opacity:0, scale:0.8, y:-30}`. بداخلها `<NightAnimCinematic data={animation} />`.

> ملاحظة تنفيذ Flutter: استخدم `AnimatedSwitcher` لدخول/خروج البطاقة (scale+fade / scale+y-slide) مع `Duration` المطابقة، وأدرِ المسح التلقائي بمؤقّتَي 5s/10s المرتبطَين بحدثَي الـ socket (§6).

---

### 4.2 المشاهد الليلية السبعة (5 ثوانٍ auto-dismiss)

> كل نص عربي أدناه منقول حرفياً. كل مشهد داخل حاوية `h-[300px]`.

#### 4.2.1 `ASSASSINATION_ATTEMPT` → AssassinationAnim — صوت `night_assassination` عند الـ mount
- **خط القطع (slash):** `div` مطلق `w-[200%] h-[3px]`، تدرّج `from-transparent via-[#ff0000] to-transparent`، `origin-left`، `transform: rotate(25deg)`، `top:50%`، `left:-50%`؛ يتحرك `x: '-100%' → '100%'` مع `opacity: [0, 1, 1, 0]`، **مدة 0.6s، ease easeInOut** (شعاع أحمر يمسح قطرياً). الحاوية الأمّ `absolute inset-0 pointer-events-none` بدخول `opacity 0→1`.
- **6 بقع دم:** دوائر `rounded-full bg-[#8A0303]`، حجم عشوائي `8 + rand*20` px (عرض=ارتفاع، **لكن كلٌّ يُحسب منفصلاً** في المصدر)، موضع عشوائي `top: 30 + rand*40 %`، `left: 20 + rand*60 %`؛ كلٌّ `scale: [0, 1.5, 1]`، `opacity: [0, 0.8, 0.4]`، **delay = 0.3 + i*0.08**، مدة 0.5s ease easeOut.
- **🔪 أيقونة:** `text-8xl mb-4 drop-shadow-[0_0_30px_rgba(138,3,3,0.8)]`؛ `initial {scale:0, rotate:-90}` → `scale: [0, 1.4, 1]`, `rotate: [-90, 10, 0]`، 0.5s easeOut.
- **التعليق:** **«عملية اغتيال جارية»** — `text-3xl md:text-4xl font-black text-[#8A0303] tracking-widest` Amiri؛ `{opacity:0, y:15}` → `{opacity:1, y:0}`، delay 0.4s.
- **غسلة حمراء كاملة:** `absolute inset-0 bg-[#8A0303]/10 pointer-events-none`؛ `opacity: [0, 0.3, 0]` على 1.2s easeInOut.

#### 4.2.2 `INVESTIGATION` → InvestigationAnim — صوت `night_investigation`
- **حلقة سونار 1:** دائرة `250px` (`w-[250px] h-[250px]`)، `rounded-full border-2 border-[#C5A059]/40`؛ `scale: [1, 1.4, 1]`، `opacity: [0.5, 0, 0.5]`، **2s infinite easeInOut**.
- **حلقة سونار 2:** `180px`، `border border-[#C5A059]/20`؛ `scale: [1, 1.6, 1]`، `opacity: [0.3, 0, 0.3]`، 2s infinite easeInOut، **delay 0.3s**.
- **👁️ رمشة العين:** `text-8xl mb-4 drop-shadow-[0_0_40px_rgba(197,160,89,0.6)]`؛ `scaleY: [0.1, 1, 1, 0.1, 0.1, 1]`، `opacity: [0.5, 1, 1, 0.3, 0.3, 1]`، **3s infinite بـ times = [0, 0.15, 0.7, 0.8, 0.85, 1]** (تفتح، تثبت، رمشة مزدوجة، تعود تفتح).
- **التعليق:** **«تحقيق جارٍ»** — `text-3xl md:text-4xl font-black text-[#C5A059] tracking-widest` Amiri؛ `opacity: [0, 1, 1, 0.4, 0.4, 1]`، 3s infinite بنفس الـ times (ينبض مع العين).

#### 4.2.3 `PROTECTION` → ProtectionAnim — صوت `night_protection`
- **هالة خضراء:** دائرة `300px`، `background: radial-gradient(circle, rgba(46,92,49,0.3) 0%, transparent 70%)`؛ `scale: [0.8, 1.2, 0.8]`، `opacity: [0.3, 0.6, 0.3]`، **2s infinite**.
- **🛡️ دخول:** `text-8xl mb-4 drop-shadow-[0_0_30px_rgba(46,92,49,0.8)]`؛ `initial {scale:0}` → `scale: [0, 1.3, 1]`، **0.6s type spring damping 10**.
- **خط أفقي نابض:** `w-48 h-[2px]`، تدرّج `from-transparent via-[#2E5C31] to-transparent`، `mx-auto mb-4`؛ `opacity: [0.3, 1, 0.3]`، `scaleX: [0.8, 1.2, 0.8]`، 1.5s infinite.
- **التعليق:** **«حماية طبية»** — `text-[#2E5C31]` Amiri؛ `{opacity:0, y:10}` → `{opacity:1, y:0}`، delay 0.5s.

#### 4.2.4 `SNIPE` → SnipeAnim — صوت `night_snipe` **مؤخّر 600ms** عبر `setTimeout` (يُلغى عند unmount)
- **شعيرات التصويب (crosshair):** أفقي `w-[80%] h-[1px] bg-[#8A0303]/60` بـ `scaleX 0→1` 0.4s easeOut؛ عمودي `w-[1px] h-[80%] bg-[#8A0303]/60` بـ `scaleY 0→1` 0.4s easeOut. (كلاهما مطلق داخل حاوية flex-centered.)
- **دائرتا scope تنكمشان:** خارجية `w-24 h-24 rounded-full border-2 border-[#8A0303]/80`، `initial {scale:3, opacity:0}` → `{scale:1, opacity:1}` 0.5s easeOut؛ داخلية `w-12 h-12 border border-[#8A0303]/40`، نفس الشيء بـ **delay 0.1s**.
- **وميض الطلقة (muzzle flash):** `absolute inset-0 bg-white pointer-events-none`؛ `opacity: [0, 0, 0, 0.8, 0]` بـ **times = [0, 0.49, 0.5, 0.52, 0.6]** على مدة 1.2s (وميض أبيض حادّ منفرد عند ~600ms، متزامن مع الصوت المؤخّر).
- **🎯 أيقونة:** `text-8xl mb-4 drop-shadow-[0_0_30px_rgba(138,3,3,0.8)]`؛ `initial {scale:2, opacity:0}` → `{scale:1, opacity:1}` 0.5s delay 0.2s.
- **التعليق:** **«تصويب القناص»** — `text-[#8A0303]` Amiri؛ `opacity 0→1` delay 0.6s.

#### 4.2.5 `SILENCE` → SilenceAnim — صوت `night_silence`
- **🤐 أيقونة:** `text-8xl mb-4 relative`؛ `initial {scale:0.8}` → `{scale:1}` 0.3s.
- **شريط لاصق فوق الفم:** داخل الأيقونة، `absolute top-1/2 left-1/2 w-32 h-6` (128×24px)، `bg-[#555]/80 border border-[#333]`؛ يُوسَّط بـ `-translate-x-1/2 -translate-y-1/2` **مع** `style transform: translate(-50%,-50%) rotate(-5deg)`؛ يُصفَع `scaleX 0→1` delay 0.3s، 0.4s easeOut. **ملاحظة نقل:** framer-motion يركّب التحويل فيبقى الميل −5° مع scaleX — في Flutter نفّذها كـ `Transform.rotate(-5°)` يحيط بـ `ScaleTransition(scaleX)`.
- **التعليق:** **«عملية إسكات»** — `text-[#555]` Amiri؛ `opacity 0→1` delay 0.5s.
- **8 خطوط static/glitch:** `absolute h-[1px] bg-[#555]/30`، عرض عشوائي `30 + rand*50 %`، `top: 10 + rand*80 %`، `left: rand*40 %`؛ `opacity: [0, 1, 0]` + اهتزاز أفقي `x: [0, rand*20 - 10, 0]`؛ **مدة 0.3s، infinite، repeatDelay = rand*2s، delay = rand*1.5s** (تأثير تشويش TV).

#### 4.2.6 `DISABLE_ABILITY` → WitchAnim — صوت `night_witch` (**بلا fallback — صامت** ما لم يُرفع ملف مخصّص)
- **هالة بنفسجية:** دائرة `300px`، `radial-gradient(circle, rgba(147,51,234,0.3) 0%, transparent 70%)`؛ `scale: [0.8, 1.2, 0.8]`، `opacity: [0.3, 0.6, 0.3]`، **2.5s infinite easeInOut**.
- **8 جزيئات 🔮 طائرة** من المركز: `text-purple-400 text-lg opacity-0`، `top:50% left:50%`؛ كلٌّ `x: [0, (rand-0.5)*200]`، `y: [0, (rand-0.5)*200]`، `opacity: [0, 0.8, 0]`، `scale: [0.5, 1.2, 0.5]`، `rotate: [0, rand*360]`؛ **مدة = 1.5 + rand، infinite، delay = i*0.2**.
- **🧙‍♀️ دخول:** `text-8xl mb-4 drop-shadow-[0_0_30px_rgba(147,51,234,0.8)]`؛ `initial {scale:0, rotate:-180}` → `scale: [0, 1.3, 1]`, `rotate: [-180, 10, 0]`، **0.7s type spring damping 12**.
- **التعليق:** **«تعطيل قدرة جارية...»** — `text-[#9333ea]` Amiri؛ `{opacity:0, y:15}` → `{opacity:1, y:0}` delay 0.4s.

#### 4.2.7 `ASSASSINATE` → AssassinateAnim (فعل السفّاح الليلي) — صوت `night_assassin`
- **غسلة قرمزية مرتجفة:** `absolute inset-0 bg-[#DC143C]/10 pointer-events-none`؛ `opacity: [0, 0.4, 0.1, 0.3, 0]` على **1.5s easeInOut** (وميض متقطّع).
- **3 خطوط قطع:** `absolute w-[200%] h-[2px]`، `from-transparent via-[#DC143C] to-transparent`؛ `top: 35 + i*15 %` (35/50/65)، `left:-50%`، `transform: rotate(-15 + i*15 deg)` (−15°/0°/+15°)؛ كلٌّ يمسح `x '-100%'→'100%'`, `opacity: [0, 1, 1, 0]`، 0.5s، **delay = i*0.15** easeInOut.
- **🗡️ أيقونة:** `text-8xl mb-4 drop-shadow-[0_0_40px_rgba(220,20,60,0.9)]`؛ `initial {scale:0, rotate:-45}` → `scale: [0, 1.5, 1]`, `rotate: [-45, 10, 0]`، 0.6s easeOut.
- **التعليق:** **«السفّاح يتحرك»** — `text-[#DC143C]` Amiri؛ `{opacity:0, y:15}` → `{opacity:1, y:0}` delay 0.4s.

---

### 4.3 المشاهد الصباحية الإحدى عشرة (10 ثوانٍ auto-dismiss)

> كل مشهد في حاوية `text-center py-4` (بلا h-[300px]). البطاقات المضمّنة كلها `<MafiaCard ... size="fluid">` (راجع 22-role-cards.md).

#### 4.3.1 `ASSASSINATION` → MorningAssassinationAnim — صوت `morning_assassination_success`
- 🩸 `text-8xl mb-4 drop-shadow-[0_0_40px_rgba(138,3,3,0.8)]`؛ `scale: [0.8, 1.2, 1]`, `rotate: [0, -5, 5, 0]`، 0.8s.
- عنوان **«تم الاغتيال»** — `text-3xl md:text-4xl font-black text-[#8A0303] tracking-widest mb-3` Amiri؛ opacity 0→1 delay 0.3s.
- **إن `extra.targetRole`:** بطاقة مقلوبة تكشف الدور: `playerNumber=targetPhysicalId`, `playerName=targetName||'Unknown'`, `role=targetRole`, `isFlipped=true`, `flippable=false`, `isAlive=true`, `size="fluid"`, `className="w-48 h-[16rem] md:w-56 md:h-[19rem]"`؛ الحاوية `flex justify-center mt-6`، دخول `{opacity:0, y:30}` → `{opacity:1, y:0}` **delay 0.8s type spring damping 12**.
- **وإلا إن `targetName` فقط:** اسم أبيض `text-2xl font-black mt-4` Amiri + `#{targetPhysicalId}` بـ `text-[#555] font-mono text-sm mt-1`؛ الحاوية opacity 0→1 delay 0.8s.
- **فاصل:** `w-64 h-[2px]` تدرّج `via-[#8A0303]`، `mx-auto mt-6`؛ `scaleX 0→1` delay 0.5s مدة 0.6s.

#### 4.3.2 `ASSASSINATION_BLOCKED` و `ASSASSIN_BLOCKED` → MorningProtectionAnim — صوت `morning_protection_success`
- 🛡️ `text-8xl mb-4 drop-shadow-[0_0_30px_rgba(46,92,49,0.8)]`؛ `initial {scale:0, rotate:-20}` → `scale: [0, 1.4, 1]`, `rotate: [20, -5, 0]`، **0.7s type spring**.
- عنوان **«نجاة بالحماية»** — `text-[#2E5C31] ... mb-3` Amiri؛ opacity 0→1 delay 0.4s.
- سطر فرعي **«تم إنقاذ أحد اللاعبين من الاغتيال»** — `text-[#2E5C31] text-lg font-mono mt-4`؛ opacity 0→1 delay 0.8s. **بلا بطاقة — الناجي يبقى مجهولاً.**

#### 4.3.3 `SNIPE_MAFIA` → MorningSnipeAnim (success=true) — صوت `morning_snipe_mafia`
- 🎯 `text-8xl mb-4`؛ `initial {scale:0.5}` → `scale: [0.5, 1.3, 1]`، 0.5s. **⚠️ bug ويب معروف:** كلاس التوهّج مبني بـ template literal `drop-shadow-[0_0_30px_${success ? 'rgba(197,160,89,0.8)' : ...}]` فلا يُصرَّفه Tailwind JIT — **التوهّج لا يُرسَم إطلاقاً** في النسختين. القرار: أصلحه في Flutter (توهّج ذهبي/أحمر حسب النجاح) أو أبقِ التكافؤ-مع-الخطأ (بلا توهّج). موثّق كخطأ مقصود عدم نقله.
- عنوان **«القناص نجح»** — ذهبي `text-[#C5A059] ... mb-3` Amiri؛ opacity 0→1 delay 0.3s.
- **إن `extra.targetRole`:** بطاقة هدف مقلوبة واحدة `className="w-48 h-[16rem] md:w-56 md:h-[19rem]"`؛ `flex justify-center mt-6`، دخول delay 0.8s spring damping 12.
- **وإلا:** نص احتياطي **«خرج عضو مافيا من اللعبة»** — `text-[#C5A059] text-lg font-mono mt-4` delay 0.8s.

#### 4.3.4 `SNIPE_CITIZEN` → MorningSnipeAnim (success=false) — صوت `morning_snipe_citizen`
- 💀 (بدل 🎯)؛ نفس دخول 0.5s (وبنفس bug التوهّج).
- عنوان **«القناص فشل»** — أحمر `text-[#8A0303]` Amiri؛ delay 0.3s.
- **إن `extra.sniperPhysicalId && extra.targetRole`:** **بطاقتان جنباً إلى جنب** (`flex justify-center items-end gap-6 mt-6`، دخول delay 0.8s spring damping 12):
  - يسار = بطاقة القناص، فوقها تسمية **«القناص»** (`text-[#C5A059] text-xs font-mono mb-2 tracking-widest`)، `role="SNIPER"`, `playerNumber=sniperPhysicalId`, `playerName=sniperName||'Unknown'`, `isFlipped=true`, `className="w-40 h-[14rem] md:w-48 md:h-[16rem]"`.
  - يمين = بطاقة الهدف، فوقها تسمية **«الهدف»** (`text-[#8A0303] text-xs font-mono mb-2 tracking-widest`)، `role=targetRole`, نفس القياس. (مات القناص والهدف كلاهما.)
- **وإلا إن `targetRole` فقط:** بطاقة هدف واحدة `w-48 h-[16rem] md:w-56 md:h-[19rem]`.
- **وإلا:** نص احتياطي **«خرج لاعبان من اللعبة (القناص + الهدف)»** — `text-[#8A0303] text-lg font-mono mt-4` delay 0.8s.

#### 4.3.5 `SILENCED` → MorningSilencedAnim — صوت `morning_silenced`
- 🤐 `text-8xl mb-4 drop-shadow-[0_0_30px_rgba(100,100,100,0.6)]`؛ `initial {scale:0.8}` → `scale: [0.8, 1.2, 1]`، 0.6s.
- عنوان **«تم إسكات لاعب»** — `text-[#888]` Amiri؛ delay 0.3s.
- **إن `targetName`:** بطاقة **غير مقلوبة** (`role=null, isFlipped=false`) بـ `isSilenced=true` (تُظهر شارة الإسكات)، `playerName=targetName`, `w-48 h-[16rem] md:w-56 md:h-[19rem]`؛ دخول delay 0.8s spring damping 12 — **الهوية تظهر، الدور لا يُكشف**.
- فاصل رمادي `w-64 h-[2px] via-[#555]`، `scaleX 0→1` delay 0.5s مدة 0.6s.

#### 4.3.6 `ABILITY_DISABLED` → MorningAbilityDisabledAnim — صوت `morning_ability_disabled` (**بلا fallback → صامت** ما لم يُرفع ملف)
- 🚫 `text-8xl mb-4 drop-shadow-[0_0_40px_rgba(147,51,234,0.8)]`؛ `scale: [0.8, 1.2, 1]`, `rotate: [0, -5, 5, 0]`، 0.8s.
- عنوان **«تم تعطيل قدرة لاعب»** — `text-[#9333ea]` Amiri؛ delay 0.3s.
- **إن `extra.disabledRole`:** بطاقة **بـ `hideIdentity=true`** (`playerNumber=0, playerName=""`, `role=disabledRole`, `isFlipped=true`) — تكشف **وجه الدور فقط بلا هوية لاعب**؛ `className="w-44 h-[15rem] md:w-52 md:h-[18rem]"`؛ دخول `{opacity:0, y:30}` → `{opacity:1, y:0}` **delay 0.6s spring damping 15**.
- **وإلا:** صندوق `w-16 h-16 rounded-2xl bg-purple-950/40 border border-purple-500/30 flex items-center justify-center text-4xl` يحوي `roleIcon` (`ROLE_ICONS[disabledRole] || '❓'`، أو `'❓'` إن لا دور).
- **تذييل:** **«🧙‍♀️ سحر الساحرة — {roleNameAr}»** — `text-purple-400 text-[10px] font-mono mt-3 uppercase tracking-widest`؛ opacity 0→1 delay 0.8s؛ حيث `roleNameAr = ROLE_NAMES[disabledRole] || disabledRole || 'مجهول'`.
- فاصل بنفسجي `w-64 h-[2px] via-[#9333ea]`، `scaleX 0→1` delay 0.5s مدة 0.6s.

#### 4.3.7 `ASSASSIN_KILL` (JSX مضمّن) — صوت `morning_assassin_kill` عبر مكوّن مساعد فارغ `<AssassinKillSound/>`
- 🔪 `text-8xl mb-4 drop-shadow-[0_0_40px_rgba(220,20,60,0.9)]`؛ `scale: [0.6, 1.4, 1]`, `rotate: [0, -15, 15, 0]`، 0.8s.
- عنوان **«السفّاح اغتال»** — `text-[#DC143C]` Amiri؛ delay 0.3s.
- **إن `targetName`:** بطاقة `role=extra.targetRole||null`, `isFlipped={!!extra.targetRole}` (تُقلب فقط إن وُجد الدور)، `w-48 h-[16rem] md:w-56 md:h-[19rem]`؛ دخول delay 0.8s spring damping 12.
- فاصل قرمزي `w-64 h-[2px] via-[#DC143C]`، `scaleX 0→1` delay 0.5s مدة 0.6s.

#### 4.3.8 `POLICEWOMAN_EXECUTION` (JSX مضمّن) — صوت `morning_policewoman` عبر `<PolicewomanSound/>`
- 👮‍♀️ `text-8xl mb-4 drop-shadow-[0_0_40px_rgba(167,139,250,0.8)]`؛ `scale: [0.8, 1.3, 1]`, `rotate: [0, -10, 10, 0]`، 0.8s.
- عنوان مشروط بـ `extra.targetIsMafia`: إصابة → **«صلاحية الشرطية — إصابة!»** بنفسجي `text-[#a78bfa]`؛ إخفاق → **«صلاحية الشرطية»** أحمر `text-[#8A0303]`؛ Amiri delay 0.3s.
- **إن `extra.targetRole`:** بطاقة هدف مقلوبة `w-48 h-[16rem] md:w-56 md:h-[19rem]`، دخول delay 0.8s spring damping 12.
- **إن إصابة:** تذييل **«🏆 الشرطية {extra.policewomanName} حصلت على نقاط رانك»** — `text-[#a78bfa] text-sm font-mono mt-4` delay 1.2s.
- فاصل بنفسجي فاتح `w-64 h-[2px] via-[#a78bfa]`، `scaleX 0→1` delay 0.5s مدة 0.6s.

#### 4.3.9 `TWIN_SUICIDE` (JSX مضمّن) — **لا يُشغّل أي صوت**
- 🩸 `text-8xl mb-4 drop-shadow-[0_0_40px_rgba(138,3,3,0.9)]`؛ `scale: [0.7, 1.3, 1]`, `opacity: [0, 1, 1]`، 0.8s.
- عنوان **«انتحار التوأم»** — `text-[#8A0303]` Amiri؛ delay 0.3s.
- سطر فرعي **«👥 ارتباط الدم — انتحر بعد موت أخيه الأصغر»** — `text-[#a86]/80 text-sm font-mono`؛ opacity 0→1 delay 0.5s.
- **إن `targetName`:** بطاقة `role=extra.role || Role.OLDER_BROTHER`, `isFlipped=true`, **`isAlive=false`** (نمط بطاقة ميتة)، `w-48 h-[16rem] md:w-56 md:h-[19rem]`؛ دخول delay 0.8s spring damping 12.

#### 4.3.10 `TWIN_TRANSFORM` (JSX مضمّن) — **لا يُشغّل أي صوت**
- 🌑 `text-8xl mb-4 drop-shadow-[0_0_40px_rgba(147,51,234,0.85)]`؛ `scale: [0.6, 1.4, 1]`, `rotate: [0, -12, 12, 0]`، 0.9s.
- عنوان **«الصحوة المظلمة»** — `text-[#a855f7] ... mb-2` Amiri؛ delay 0.3s.
- سطر فرعي **«👥 {targetName} تحوّل إلى فريق المافيا»** — `text-[#a855f7]/80 text-sm font-mono`؛ opacity 0→1 delay 0.5s.
- **إن `extra.newRole`:** بطاقة تدخل بـ **قلب 3D**: `initial {opacity:0, y:30, rotateY:180}` → `{opacity:1, y:0, rotateY:0}`، **delay 0.8s spring damping 12**؛ `role=extra.newRole`, `isFlipped=true`, `w-48 h-[16rem] md:w-56 md:h-[19rem]`.

#### 4.3.11 `default` (fallback / حالة مجهولة)
- ❓ `text-7xl md:text-8xl mb-4` + النوع الخام `data.type` بـ `text-2xl font-black text-[#808080] tracking-widest` Amiri. (حالة الحدث الفارغ/غير المعروف — مفيد للتصحيح.)

**جدول توجيه switch (`data.type` → مشهد):** ASSASSINATION_ATTEMPT/INVESTIGATION/PROTECTION/SNIPE/SILENCE/DISABLE_ABILITY/ASSASSINATE = ليلية؛ ASSASSINATION/ASSASSINATION_BLOCKED/ASSASSIN_BLOCKED/SILENCED/SNIPE_MAFIA/SNIPE_CITIZEN/ABILITY_DISABLED/ASSASSIN_KILL/POLICEWOMAN_EXECUTION/TWIN_SUICIDE/TWIN_TRANSFORM = صباحية؛ غير ذلك = default.

---

### 4.4 CircularTimer — الحلقة والحالات

المكوّن: `CircularTimer({ timeRemaining, totalTime, size=200, enableHeartbeat=true, enableShake=true })`.

- **الحساب:** `progress = totalTime > 0 ? timeRemaining/totalTime : 0`؛ `radius = (size - 16)/2`؛ `circumference = 2π·radius`؛ `dashOffset = circumference·(1 - progress)`.
- **الحلقة الخلفية:** `<circle>` بـ `stroke #1a1a1a, strokeWidth 8, fill none`، `cx=cy=size/2`.
- **قوس التقدّم:** `strokeWidth 8, strokeLinecap round, fill none`، `strokeDasharray=circumference`، `strokeDashoffset=dashOffset`؛ SVG مدوّر **`-rotate-90`** (يبدأ من الساعة 12)؛ انتقال CSS `transition-all duration-500 ease-linear` (tween سلس 0.5s بين الثواني)؛ `filter: drop-shadow(0 0 8px glowColor)`.
- **نطاقات اللون بحسب `progress`:**
  - `> 0.6` → أخضر `#2E5C31`، توهّج `rgba(46, 92, 49, 0.3)`.
  - `≤ 0.6` (وأكبر من 0.3) → ذهبي `#C5A059`، توهّج `rgba(197, 160, 89, 0.3)`.
  - `≤ 0.3` → أحمر `#8A0303`، توهّج `rgba(138, 3, 3, 0.5)`.
- **حالتا الإلحاح:** `isUrgent = timeRemaining ≤ 10`؛ `isCritical = timeRemaining ≤ 5`.
- **هالة التوهّج الخارجية:** `absolute inset-0 rounded-full transition-all duration-500`، `boxShadow: 0 0 {isUrgent ? 40 : 20}px {glowColor}` (تتّسع من 20px إلى 40px blur عند urgent، انتقال 500ms).
- **الاهتزاز (shake):** عند `enableShake && isCritical && displayTime > 0` يهتزّ المكوّن كله `x: [0, -2, 2, -1, 1, 0]`، `y: [0, 1, -1, 1, -1, 0]` بمدة **0.3s per loop infinite**.
- **الرقم المركزي:** `displayTime = Math.ceil(timeRemaining)`؛ `font-mono font-black leading-none`، `fontSize = size*0.35`؛ يعاد mount كل ثانية (framer `key={displayTime}`) بـ pop: `initial {scale:1.3, opacity:0.7}` → `{scale:1, opacity:1}`. اللون: critical → `#8A0303` + CSS `animate-pulse`؛ urgent → `#C5A059`؛ غير ذلك أبيض. `transition-colors duration-300`.
- **تسمية «SEC»:** أسفل الرقم، `text-[#808080] font-mono uppercase tracking-widest`، `fontSize = size*0.07`.
- **دقّات القلب الصوتية** (عند `enableHeartbeat`، تُطلق **فقط عند تغيّر قيمة الثانية**، محروسة بـ `prevTimeRef`، ولا تُطلق عند `timeRemaining <= 0`):
  - critical (`isCritical && displayTime>0`) → `timer_heartbeat_fast` كل ثانية.
  - urgent (`isUrgent && displayTime>0 && displayTime % 2 === 0`) → `timer_heartbeat_slow` في الثواني الزوجية فقط.
- **حالة الانتهاء (00) ليست في هذا المكوّن:** `DisplayDayView` يرسم دائرة ثابتة منفصلة 120px `border-4 border-[#8A0303]` تحوي «00» (`text-3xl font-mono font-black text-[#8A0303] animate-pulse`) عند وصول مؤقّت الدفاع للصفر أثناء الكلام.

**استخدامات CircularTimer في شاشة العرض** (للتكافؤ فقط — ليست شاشة اللاعب):
- **A — متحدث النقاش** (`DisplayDayView` ~سطر 692): `size 100`، heartbeat/shake فقط أثناء `discussionState.status === 'SPEAKING'`؛ يوضع مطلقاً عند `left-[130%]`/`right-[130%]` من بطاقة المتحدث (الجهة تتناوب عبر `timerPos`)، دخول `{opacity:0, x: ∓40}` → `0` delay 0.5s؛ أسفله سطر حالة 7px mono: WAITING → أصفر نابض «AWAITING COMMENCEMENT...»؛ SPEAKING → ذهبي «FLOOR IS OPEN»؛ PAUSED → أحمر نابض «FLOOR SUSPENDED».
- **B — مدافع التبرير** (~سطر 932): `size 120`، heartbeat+shake دائماً، الجهة `115%`، دخول `x ∓30` delay 0.3s، تعليق «🎙 DEFENDING» ذهبي 9px mono نابض `opacity [0.5,1,0.5]` 1.5s.

### 4.5 PhaseHeader — رأس المرحلة الموحّد

كتلة عديمة الحالة، `text-center mb-3`:
- أيقونة إيموجي اختيارية: `text-2xl leading-none mb-1`.
- عنوان: `text-lg font-black text-[#C5A059]` Amiri.
- سطر فرعي اختياري: `text-[10px] font-mono text-[#9a9a9a] tracking-widest uppercase mt-0.5`.

**النصوص الحرفية المستعملة (أمثلة موجودة):** HostElimination: `💀 «اكتمل التصويت — جاهز للحسم» / AWAITING REVEAL`، `⚕️ «الطبيب خارج اللعبة»`، `💀 «تمّ كشف الهويّة» / ELIMINATION COMPLETE`، `⚖️ «حالة تعادل!» / TIE BREAKER`؛ HostVoting: `🗳️ «مرحلة التصويت» / VOTING`.

### 4.6 PhaseLoading — حالة التحميل الموحّدة

`py-10 text-center`:
- إيموجي اختياري: `text-3xl mb-3`.
- spinner: دائرة 32px، `border-2 border-[#C5A059]/30` مع قمة ذهبية صلبة `border-t-[#C5A059]`، `rounded-full animate-spin mx-auto mb-3`.
- caption: `text-[11px] font-mono text-[#9a9a9a]`، افتراضي **«جارٍ التحميل…»**.

**النصوص الحرفية المستعملة:** PlayerFlow `🗳️ «جاري تحميل التصويت...»`؛ HostNightRunner «جارٍ تحضير الخطوة التالية...»؛ host/page.tsx ديناميكي `` `الطور «${phase}»` ``؛ HostVoting `🗳️ «جارٍ تحضير التصويت…»`؛ HostJustification «جارٍ تحضير التبرير…».

### 4.7 ملخص الصباح الشخصي للاعب (PlayerPhaseView — MORNING_RECAP)

> هذا **ما يراه اللاعب فعلاً** (على هاتفه) عند مرحلة MORNING_RECAP — مختلف عن السينمائيات الكبيرة أعلاه. تفصيل جسم المرحلة الكامل في 23-night-phase.md؛ هنا نوثّق تصنيف `MorningEvent` وخريطة عرضها (توجيه هذا الملف الخاص).

- **الرأس:** ☀️ `text-5xl` ينزل `{y:-20}` → `{y:0}`؛ عنوان **«الصباح يطل»** (amber-300، Amiri، xl).
- **الترشيح:** أحداث **شخصية فقط** — `morningEvents.filter(e => e.targetPhysicalId === myId && e.type !== 'SILENCE' && e.type !== 'PROTECTION')`.
- **حالة القتل:** `amIKilled` = أي حدث نوعه `KILL` أو `SNIPE` → بطاقة حمراء تدخل `scale 0→1`: 💀 `text-4xl`، «لقد اُغتلت!» (أحمر bold lg)، «تم إخراجك من اللعبة». **⚠️ تحذير نقل موثّق:** `amIKilled` يفحص `KILL`/`SNIPE` بينما خريطة العرض تستخدم `ASSASSINATION`/`SNIPE_MAFIA`/`SNIPE_CITIZEN` — تعارض محتمل (مسار ميت في الويب). **تحقّق من أسماء الأنواع الفعلية في الـ backend قبل النقل** ولا تكرّر التعارض؛ إن اعتمد الـ backend `ASSASSINATION/SNIPE_*` فاجعل `amIKilled` يطابقها.
- **حالة فارغة:** «بانتظار كشف الأحداث...» (رمادي sm).
- **قائمة الأحداث** (متدرّجة `{x:-20}` → `0` بـ delay = `i*0.3s`)، كل صف `bg-white/5 rounded-xl` بأيقونة+نص وفق **خريطة العرض الحرفية**:

| النوع | الأيقونة | النص الحرفي |
|---|---|---|
| `ASSASSINATION` | 💀 | «تم اغتيالك!» |
| `ASSASSINATION_BLOCKED` | 🛡️ | «تم حمايتك من الاغتيال!» |
| `SNIPE_MAFIA` / `SNIPE_CITIZEN` | 🎯 | «تم قنصك!» |
| `SILENCED` | 🤫 | «تم إسكاتك! لا يمكنك التحدث هذه الجولة.» |
| `SHERIFF_RESULT` | 🔍 | «نتيجة التحقيق: 🔴 مافيا» أو «نتيجة التحقيق: 🟢 مواطن» (من `e.extra.result === 'MAFIA'`) |
| `PROTECTION_FAILED` | ❌ | «فشلت الحماية! الهدف اُغتيل.» |
| `POLICEWOMAN_REVEAL` | 👮 | «الشرطية كشفت هويتك!» |
| مجهول | 📋 | + النوع الخام |

- **منع التكرار (dedupe):** حدث `display:morning-event` وارد يُتجاهل إن كان `(targetPhysicalId, type)` مخزّناً أصلاً (الليدر قد يعيد البثّ).
- **اهتزاز:** لا اهتزاز خاص هنا (اهتزاز الإقصاء `[200,100,200]` على `day:elimination-revealed` في مرحلة أخرى).

---

## 5. التكيّف مع الشاشات 6→11 إنش (Window Size Classes)

الاستراتيجية الكاملة موثّقة في **01-foundation-theme.md**. تخصيص هذا الملف:

**السينمائيات (`NightAnimCinematic` + إطار المضيف)** — هذه شاشة عرض تُقدَّم على تابلت/شاشة كبيرة أساساً، فالتكبير هو القاعدة لا الاستثناء:
- **compact (< 600dp):** كما الويب — البطاقة `noir-card` بعرض `max-w-lg`/`max-w-xl` مع `mx-auto` وحشوة `p-10`؛ حاوية المشهد الليلي `h-[300px]`؛ الإيموجي `text-8xl` (≈96px)؛ العناوين `text-3xl` (≈30px)؛ البطاقات المضمّنة `w-48 h-[16rem]` (192×256). خلفيتا NIGHT/MORNING بإيموجي `text-9xl` والعناوين `text-6xl`/`text-5xl`.
- **medium (600–840dp):** ارفع سقف عرض البطاقة إلى ~720dp وطبّق قيم `md:` من الويب: العناوين `text-4xl`، البطاقات المضمّنة `md:w-56 md:h-[19rem]` (224×304)، بطاقتا SNIPE_CITIZEN `md:w-48 md:h-[16rem]`. حافظ على `h-[300px]` للحاوية الليلية أو ارفعها إلى ~360dp.
- **expanded (> 840dp):** **ضاعِف أحجام عناصر اللعب الحساسة** (الإيموجي-كأيقونة، البطاقات، الفواصل) بدل تمديد الحاوية — الإيموجي إلى ~140–160px، البطاقات المضمّنة إلى ~288×392، حاوية المشهد الليلي إلى ~420dp ارتفاعاً؛ سقف عرض المحتوى 840–960dp موسّطاً. البطاقتان جنباً إلى جنب (SNIPE_CITIZEN) تبقيان `flex ... gap` موسّعاً. **لا تمدّد** الإيموجي أفقياً — كبّره متناسباً.

**`CircularTimer`:**
- الحلقة تُمرّر `size` صراحةً (100 للمتحدث، 120 للمدافع). في compact أبقِ القيم كما هي. في medium ارفع إلى ~120/140. في **expanded ضاعِف** (المؤقّت عنصر لعب حسّاس): ~180/220 — كل الأبعاد الداخلية (`radius`, `fontSize=size*0.35`, `SEC=size*0.07`, `strokeWidth 8` ثابت أو ارفعه إلى 12 عند expanded) مشتقّة من `size` فتتكيّف تلقائياً. حافظ على نطاقات اللون والإلحاح ثابتة.

**`PhaseHeader` / `PhaseLoading` / ملخص الصباح الشخصي (PlayerPhaseView):** محتوى نصي — سقف عرض 640dp في medium وموسّط، 840dp في expanded؛ عمود واحد في كل الفئات (compact = عمود PWA). قائمة أحداث الصباح الشخصية تبقى عموداً واحداً في كل الفئات (صفوف قصيرة). ارفع أحجام الخطوط درجة واحدة عند expanded دون تغيير التخطيط.

**التوجيه العام:** compact = عمود واحد مطابق للـ PWA؛ medium = سقف نص 640dp + قيم `md:`؛ expanded = سقف 840–960dp + مضاعفة عناصر اللعب الحسّاسة (البطاقات/المؤقّتات/الإيموجي).

---

## 6. المنطق والتدفقات

### 6.1 آلة العرض السينمائي (state machine)

الحالة الوحيدة على عميل العرض: `animation: NightAnimEvent | null` + مؤقّت `animTimerRef`.

```
[idle: animation=null]
  --- on 'night:animation'(data) --->  clear animTimer; animation=data; animTimer=setTimeout(→null, 5000)
  --- on 'display:morning-event'(data) --->  clear animTimer; animation=data; animTimer=setTimeout(→null, 10000)
[showing]
  --- 5s/10s انقضت --->  animation=null  [idle]
  --- حدث جديد (night/morning) --->  clear animTimer (يعيد المؤقّت) + animation=data الجديد
  --- on 'display:night-started' --->  animation=null فوراً (بلا مسح المؤقّت الصريح — لكن انظر أدناه)
  --- on 'game:phase-changed'(phase) --->  clear animTimer; animation=null  (تنظيف)
```

- **حدث جديد يعيد ضبط المؤقّت:** كل من `onNightAnimation`/`onMorningEvent` يمسح المؤقّت السابق أولاً ثم يعيّن مؤقّتاً جديداً — فحدث ليلي جديد يستبدل الظاهر ويعيد 5s.
- **`display:night-started`** → `setAnimation(null)` فوراً (يمسح أي سينمائية ظاهرة، مثلاً قبل بدء طابور جديد).
- **`game:phase-changed`** → يمسح المؤقّت ويصفّر `animation` (تنظيف عند مغادرة المرحلة).
- **مدد ثابتة:** 5000ms للّيلي، 10000ms للصباحي (منقولة حرفياً).

### 6.2 آلة CircularTimer (منطق داخلي)

- عديم آلة حالة معقّدة — دالة نقية من `(timeRemaining, totalTime)`. المؤقّت الفعلي يُدار خارجياً (المكوّن يستقبل `timeRemaining` محدّثاً).
- **حارس دقّات القلب:** `prevTimeRef` يحفظ آخر ثانية سُمعت. الصوت يُطلق فقط عند `timeRemaining !== prevTimeRef.current && timeRemaining > 0` (يمنع تكرار الصوت على إعادة البناء). في Flutter: احفظ `int _prevSecond` وقارن قبل التشغيل.
- **حواف:** `totalTime <= 0` → `progress=0` (أحمر/فارغ تماماً)؛ لا heartbeat عند `<=0`؛ الاهتزاز يتوقف عند `displayTime <= 0`؛ heartbeat/shake قابلان للتعطيل بالـ props.

### 6.3 إعادة الاتصال واستعادة الحالة

- **عميل العرض** لا يحفظ السينمائيات محلياً؛ عند إعادة الاتصال تصل الأحداث الجديدة من السيرفر فقط (لا استعادة للسينمائية الجارية — هي عابرة 5s/10s). عند فقدان الاتصال أثناء عرض سينمائية، ستنتهي بالمؤقّت المحلي ثم تُمسح؛ لا حاجة لإعادة طلب.
- **ملخص الصباح الشخصي (PlayerPhaseView):** `morningEvents` تُبنى من بثّ `display:morning-event`؛ عند إعادة الاتصال تُنظَّف عند تغيّر المرحلة (`game:phase-changed` → MORNING_RECAP يصفّرها fresh)، والليدر قد يعيد البثّ (dedupe يحمي من التكرار). راجع منطق الصمود الكامل في 23-night-phase.md.
- **مزامنة الصوت (leader-source):** عميل العرض يعمل بـ `setLocalPlayback(false)`؛ لا يقرّر تشغيل صوت بنفسه، بل يعيد تشغيل النداءات المرآة عبر `display:sound-play {fn, args}`. راجع 07-sound-system.md.

### 6.4 المؤقّتات والمهل

- **5000ms** — auto-dismiss السينمائية الليلية.
- **10000ms** — auto-dismiss السينمائية الصباحية.
- **600ms** — تأخير صوت `night_snipe` (setTimeout يُلغى عند unmount — في Flutter `Timer` يُلغى في `dispose`).
- **CircularTimer transition** — 500ms linear بين الثواني؛ 500ms لتوسّع الهالة؛ 300ms لتبديل لون الرقم؛ 300ms per loop للاهتزاز.
- **ducking الـ ambient** — `playEventSound` يخفض حجم الـ ambient من 0.3 إلى 0.08 لمدة 3s (افتراضي) ثم يعيده. راجع 07.

### 6.5 حواف ومخاطر يجب نقلها

- **العشوائيات تُولَّد مرة واحدة في `initState`** (بقع الدم الست، مواضع/عروض الخطوط الثمانية، إزاحات/دورات جزيئات 🔮 الثمانية). الويب يحسبها inline في render فتُخلط عند كل re-render — **لا تنقل ذلك** وإلا وميض.
- **bug التوهّج في MorningSnipeAnim** (template literal لا يُصرَّف) — قرّر: إصلاح أو تكافؤ-مع-الخطأ. لا تُعِد إنتاج آلية الخطأ نفسها.
- **تعليق GSAP خاطئ** — كله framer-motion، لا GSAP.
- **صمت مقصود:** `night_witch` و`morning_ability_disabled` بلا fallback؛ `TWIN_SUICIDE`/`TWIN_TRANSFORM` بلا أي صوت.

---

## 7. عقود التكامل

### 7.1 REST

- **`GET {NEXT_PUBLIC_API_URL}/api/sounds/active-map`** (غير مباشر — عبر SoundService/soundManager، يُستدعى مرة عند شاشة العرض، يُعاد جلبه على `admin:sounds-updated`).
  - **Response:** `{ success: boolean, map: Record<soundKey, url> }`؛ `url` مسار ملف صوتي نسبي على السيرفر. كل مدخل يُنزَّل ويُخزَّن محلياً (`flutter_cache_manager`)؛ الحجم `VOLUME_BY_KEY[key] ?? 0.7` (`timer_heartbeat_fast: 1.0`, `timer_heartbeat_slow: 0.9`). التنفيذ الكامل في **07-sound-system.md** — هنا نذكر فقط أنه العقد الوحيد.

> لا يوجد أي REST آخر في هذه الكتلة. `MafiaCard` المضمّن يعتمد `useGameConfig` (عقود `game-config` موثّقة في 22-role-cards.md).

### 7.2 Socket (كلها على عميل العرض؛ تُوجَّه عبر 04-socket-layer.md)

| الحدث | الاتجاه | الحمولة | متى يُطلق / الأثر |
|---|---|---|---|
| `night:animation` | استماع | `{ type, targetPhysicalId?, targetName?, extra? }` (= `NightAnimProps.data`) | عند تنفيذ خطوة طابور ليلي. الأثر: مسح المؤقّت، `setAnimation(data)`، auto-clear بعد **5000ms**. |
| `display:morning-event` | استماع | نفس الشكل؛ الأنواع الصباحية تحمل في `extra`: `targetRole?, sniperPhysicalId?, sniperName?, disabledRole?, targetIsMafia?, policewomanName?, role?, newRole?, result?` حسب اللزوم | لكل حدث في ملخص الصباح. الأثر: مسح المؤقّت، `setAnimation(data)`، auto-clear بعد **10000ms**. (يستهلكه أيضاً PlayerPhaseView للملخص الشخصي مع dedupe.) |
| `display:night-started` | استماع | — | مسح السينمائية الظاهرة فوراً (`setAnimation(null)`). |
| `night:step-info` | استماع | `{ stepType }` (على العرض) / `{ roleName }` (على PlayerPhaseView) | العرض: يبدأ ambient حلقي لكل خطوة (`playNightStepAmbient`، خريطة أدناه، حجم 0.3، يعمل فقط إن وُجد ملف مخصّص). PlayerPhaseView: نص «جارٍ اختيار الهدف من قبل {roleName}...». |
| `display:sound-play` | استماع | `{ fn, args }` | مرآة الصوت: يعيد تشغيل النداء عبر `applyRemoteSound` (`localPlaybackEnabled=false` على العرض). راجع 07. |
| `admin:sounds-updated` | استماع | — | يعيد تحميل خريطة الأصوات (`reloadSoundMap()`). |
| `game:phase-changed` | استماع | `{ phase }` | تنظيف: مسح المؤقّت + `setAnimation(null)`. |

**خريطة ambient لـ `night:step-info.stepType`:** `GODFATHER/CHAMELEON/MAFIA_REGULAR/KILL → ambient_night_kill`؛ `SILENCER/SILENCE → ambient_night_silence`؛ `SHERIFF/INVESTIGATE → ambient_night_investigate`؛ `DOCTOR/NURSE/PROTECT → ambient_night_protect`؛ `SNIPER/SNIPE → ambient_night_snipe`؛ `ASSASSIN → ambient_night_assassin`.

**الأصوات المُطلقة من السينمائيات** (كلها تُمرَّر عبر مرآة leader→display):
- `playEventSound` (ducking الـ ambient 3s): `night_assassination`, `night_investigation`, `night_protection`, `night_snipe` (+600ms), `night_silence`, `night_witch`, `night_assassin`.
- `playGameSound` (one-shot عادي): `morning_assassination_success`, `morning_protection_success`, `morning_snipe_mafia`, `morning_snipe_citizen`, `morning_silenced`, `morning_ability_disabled`, `morning_assassin_kill`, `morning_policewoman`, `timer_heartbeat_fast`, `timer_heartbeat_slow`.

**وصفات WebAudio الاحتياطية** (لإعادة إنتاج الصوت الافتراضي — تُصيَّر إلى ملفات مضمّنة في 07-sound-system.md):
- `night_assassination`/`morning_assassination_success`: sawtooth 800→50Hz exp ramp 0.3s، gain 0.4→0.01 خلال 0.4s.
- `night_protection`/`morning_protection_success`: triangle 1200→400Hz خلال 0.5s، gain 0.3، 0.6s.
- `night_snipe`/`morning_snipe_*`: square 2000→100Hz في 0.15s، gain 0.5، 0.2s (طلقة).
- `night_investigation`: sine 60Hz drone، gain 0.2→0.3@0.3s→decay، 0.8s.
- `night_silence`/`morning_silenced`: sine 200→50Hz خلال 0.6s، gain 0.15.
- `night_assassin`: sawtooth 600→100Hz 0.4s، gain 0.35، 0.5s. `morning_assassin_kill`: sawtooth 900→60Hz 0.5s، gain 0.4، 0.6s.
- `morning_policewoman`: triangle 880→660→880Hz عند 0/0.15/0.3s، gain 0.2، 0.5s (صافرة مصغّرة).
- `timer_heartbeat_slow`: sine 80Hz double-thump (gain 0.4 decay 0.1s + thump ثانٍ 0.28 عند +0.15s) + triangle 700Hz نقرة (gain 0.18، 0.08s). `timer_heartbeat_fast`: sine 90Hz (gains 0.6/0.4) + square 950Hz نقرة (gain 0.3، 0.09s).
- `night_witch`, `morning_ability_disabled`: **بلا fallback — صامتان**.

---

## 8. نماذج Dart المطلوبة

```dart
/// حمولة سينمائية موحّدة (night:animation + display:morning-event)
class NightAnimEvent {
  final String type;                 // مفتاح switch — راجع §4.2/§4.3
  final int? targetPhysicalId;
  final String? targetName;
  final NightAnimExtra? extra;
  const NightAnimEvent({ required this.type, this.targetPhysicalId, this.targetName, this.extra });
  factory NightAnimEvent.fromJson(Map<String, dynamic> j) => NightAnimEvent(
    type: j['type'] as String,
    targetPhysicalId: (j['targetPhysicalId'] as num?)?.toInt(),
    targetName: j['targetName'] as String?,
    extra: j['extra'] == null ? null : NightAnimExtra.fromJson(Map<String,dynamic>.from(j['extra'])),
  );
}

/// حقول extra الاختيارية (كل الأنواع الصباحية)
class NightAnimExtra {
  final String? targetRole;          // ASSASSINATION / SNIPE_* / ASSASSIN_KILL / POLICEWOMAN
  final int? sniperPhysicalId;       // SNIPE_CITIZEN (بطاقتان)
  final String? sniperName;          // SNIPE_CITIZEN
  final String? disabledRole;        // ABILITY_DISABLED (hideIdentity card)
  final bool? targetIsMafia;         // POLICEWOMAN_EXECUTION (لون العنوان + التذييل)
  final String? policewomanName;     // POLICEWOMAN_EXECUTION (تذييل الإصابة)
  final String? role;                // TWIN_SUICIDE (fallback OLDER_BROTHER)
  final String? newRole;             // TWIN_TRANSFORM
  final String? result;              // SHERIFF_RESULT الشخصي: 'MAFIA' | 'CITIZEN'
  final Map<String, dynamic> raw;    // احتفظ بالباقي (تسامح مستقبلي)
  const NightAnimExtra({ this.targetRole, this.sniperPhysicalId, this.sniperName,
    this.disabledRole, this.targetIsMafia, this.policewomanName, this.role,
    this.newRole, this.result, this.raw = const {} });
  factory NightAnimExtra.fromJson(Map<String,dynamic> j) => NightAnimExtra(
    targetRole: j['targetRole'] as String?,
    sniperPhysicalId: (j['sniperPhysicalId'] as num?)?.toInt(),
    sniperName: j['sniperName'] as String?,
    disabledRole: j['disabledRole'] as String?,
    targetIsMafia: j['targetIsMafia'] as bool?,
    policewomanName: j['policewomanName'] as String?,
    role: j['role'] as String?,
    newRole: j['newRole'] as String?,
    result: j['result'] as String?,
    raw: j,
  );
}

/// نوع السينمائية (اختياري — يمكن الاكتفاء بـ String مع switch)
enum CinematicType {
  // ليلية (5s)
  assassinationAttempt, investigation, protection, snipe, silence, disableAbility, assassinate,
  // صباحية (10s)
  assassination, assassinationBlocked, assassinBlocked, silenced, snipeMafia, snipeCitizen,
  abilityDisabled, assassinKill, policewomanExecution, twinSuicide, twinTransform,
  unknown, // default
}

/// حدث الصباح الشخصي (PlayerPhaseView MORNING_RECAP)
class MorningEvent {
  final String type;                 // ASSASSINATION | ASSASSINATION_BLOCKED | SNIPE_MAFIA | SNIPE_CITIZEN | SILENCED | SHERIFF_RESULT | PROTECTION_FAILED | POLICEWOMAN_REVEAL | ...
  final int targetPhysicalId;
  final Map<String, dynamic>? extra; // extra.result لـ SHERIFF_RESULT
  const MorningEvent({ required this.type, required this.targetPhysicalId, this.extra });
}

/// تكوين CircularTimer (props)
class CircularTimerConfig {
  final double timeRemaining;
  final double totalTime;
  final double size;            // افتراضي 200
  final bool enableHeartbeat;   // افتراضي true
  final bool enableShake;       // افتراضي true
  const CircularTimerConfig({ required this.timeRemaining, required this.totalTime,
    this.size = 200, this.enableHeartbeat = true, this.enableShake = true });
}
```

- `Role` / `roleNames` (ROLE_NAMES) / `roleIcons` (ROLE_ICONS) تُعرَّف مركزياً (02-models-data-layer.md)؛ يستعملها `ABILITY_DISABLED` و`TWIN_SUICIDE` (`Role.OLDER_BROTHER` fallback).

---

## 9. الحزم المستخدمة

- **flutter_animate** — أغلب مسارات keyframes (`.fadeIn`, `.scale`, `.rotate`, `.shake`, `.then(delay:)`) تنطبق 1:1.
- **TweenSequence + AnimationController** (نواة Flutter) — للمسارات ذات `times` الصريحة: رمشة العين `[0,.15,.7,.8,.85,1]`، وميض SNIPE `[0,.49,.5,.52,.6]`، وميض الغسلة القرمزية. استخدم عناصر موزونة على controller واحد.
- **SpringSimulation** (physics) أو `Curves.elasticOut` كتقريب — لـ springs (`damping 10/12/15`).
- **CustomPaint** — قوس CircularTimer (`drawArc`, `StrokeCap.round`, بداية −90°)، أو **percent_indicator** (`CircularPercentIndicator`).
- **just_audio + audio_session** — تشغيل الأصوات (فئة `AVAudioSessionCategory.playback` تُغني عن حيل iOS)؛ التفاصيل في 07-sound-system.md.
- **flutter_cache_manager** — تخزين ملفات خريطة الأصوات المخصّصة محلياً.
- **lottie** (أو **dotlottie_loader**) — لأصول `.lottie` (dotLottie zip) الخاصة بنهاية الجيم.
- **google_fonts** — Amiri + JetBrains Mono.
- **vibration** (اختياري) / `HapticFeedback.heavyImpact()` — ترقية لطيفة مع النبضة الحرجة في CircularTimer.

---

## 10. اختلافات Android / iOS

- **رسم الإيموجي:** هذه الكتلة تعتمد الإيموجي كأيقونات لعب أساسية بحجم كبير (🔪 👁️ 🛡️ 🎯 🤐 🗡️ 🩸 💀 🚫 🧙‍♀️ 🔮 👮‍♀️ 🌑 ☀️ ❓ 🏆 👥 🎙 ⚖️ 🗳️). مجموعات الإيموجي تختلف بين Apple و Noto (Android). **متتاليات ZWJ** (🧙‍♀️، 👮‍♀️) قد تنكسر إلى محرفين على Android القديم. **الإجراء الإلزامي:** إمّا حزم `NotoColorEmoji` كخط احتياطي موحّد على المنصّتين لتطابق بصري، أو استبدال الإيموجي-كعنوان بأصول PNG/SVG مُصدَّرة (§11). التوهّج = `Text(style: TextStyle(shadows: [Shadow(blurRadius: 30, color: ...)]))`.
- **الصوت على iOS:** كود الويب يحمل حيلتين (AudioContext مُستأنَف مشترك + `<audio>` صامت حلقي لتعطيل مفتاح الصامت). في Flutter استخدم `audio_session` بفئة `playback` — تصبح الحيل غير ضرورية، لكن **يبقى المتطلَّب**: دقّات القلب والسينمائيات مسموعة على iPad مكتوم. راجع 07-sound-system.md (اختلاف iOS محسوم مركزياً هناك).
- **`letterSpacing` على العربية:** الويب يطبّق `tracking-widest` على عناوين Amiri العربية؛ في Flutter `letterSpacing` على العربية يكسر وصل الحروف أوضح من المتصفح — **طبّق letterSpacing على mono اللاتيني فقط** (SEC, OPERATION NIGHTFALL...) واختبر العناوين العربية بصرياً بلا تباعد.
- **باقي المكوّنات:** لا اختلافات جوهرية أخرى — لا haptics إلزامية، لا wake lock، لا deep links في هذه الكتلة.

---

## 11. الأصول المطلوبة

- **أصول dotLottie الأربعة** في `frontend/public/animations/` (كلها بصيغة .lottie = zip يحوي Lottie JSON):
  - `fireworks.lottie` — 2,451 B — كشف الفائز في نهاية الجيم (display/page.tsx سطران 1453، 1462). مستهلك في 27-spectator-gameover.md.
  - `prize-podium.lottie` — 8,778 B — منصّة نهاية الجيم (سطر 1490). مستهلك في 27.
  - `sound-off.lottie` — 1,218 B — مؤشّر الكتم/الإسكات أثناء النقاش (DisplayDayView سطر 555).
  - `winner.lottie` — 15,059 B — **يتيم: غير مرجعي في أي مكان في مصدر الواجهة — يمكن إسقاطه.**
- **الإيموجي-كأيقونة** (§10): إمّا خط NotoColorEmoji محزوم أو أصول مُصدَّرة.
- **ملفات الصوت:** تُجلب runtime من `/api/sounds/active-map` (غير محزومة) + **10 ملفات fallback مُصيَّرة** من وصفات §7 (تُحزَم — راجع 07).
- **الخطوط:** Amiri (serif، عناوين عربية)، JetBrains Mono (أرقام/تسميات لاتينية).
- **`MafiaCard`** (كتلة منفصلة — 22-role-cards.md) مضمَّن في 9 سينمائيات صباحية.

---

## 12. معايير القبول — checklist تكافؤ ✓

- [ ] المشاهد الليلية السبعة تُعرض بالمواصفة الحركية الدقيقة (ألوان hex، مدد، easing، times arrays) وتُمسح تلقائياً بعد **5000ms**.
- [ ] المشاهد الصباحية الإحدى عشرة (+default) تُعرض وتُمسح بعد **10000ms**؛ البطاقات المضمّنة بالأحجام والحالات الصحيحة (`isFlipped`/`flippable=false`/`isAlive`/`isSilenced`/`hideIdentity`).
- [ ] النصوص العربية منقولة حرفياً: «عملية اغتيال جارية»، «تحقيق جارٍ»، «حماية طبية»، «تصويب القناص»، «عملية إسكات»، «تعطيل قدرة جارية...»، «السفّاح يتحرك»، «تم الاغتيال»، «نجاة بالحماية»، «تم إنقاذ أحد اللاعبين من الاغتيال»، «القناص نجح»، «القناص فشل»، «القناص»، «الهدف»، «تم إسكات لاعب»، «تم تعطيل قدرة لاعب»، «🧙‍♀️ سحر الساحرة — {role}»، «السفّاح اغتال»، «صلاحية الشرطية — إصابة!»، «صلاحية الشرطية»، «🏆 الشرطية {name} حصلت على نقاط رانك»، «انتحار التوأم»، «👥 ارتباط الدم — انتحر بعد موت أخيه الأصغر»، «الصحوة المظلمة»، «👥 {name} تحوّل إلى فريق المافيا»، والنصوص الاحتياطية.
- [ ] إطار المضيف: NIGHT («الظلام دامس» / OPERATION NIGHTFALL) و MORNING («صباح جديد» / MORNING INTELLIGENCE REPORT) بخلفياتهما (🌑 4s، ☀️ 5s) وبطاقتَي noir بدخول/خروج المطابق.
- [ ] `default` يعرض ❓ + النوع الخام.
- [ ] العشوائيات (بقع الدم/الخطوط/جزيئات 🔮) مولَّدة مرة واحدة في `initState` — بلا خلط عند إعادة البناء.
- [ ] الأصوات تُطلق بالمفاتيح الصحيحة في الأوقات الصحيحة (SNIPE +600ms، heartbeats على تغيّر الثانية، TWIN_* صامتة، witch/ability_disabled صامتة بلا ملف).
- [ ] CircularTimer: نطاقات اللون (أخضر >0.6 / ذهبي ≤0.6 / أحمر ≤0.3)، urgent ≤10 (هالة 40px)، critical ≤5 (اهتزاز + رقم أحمر نابض)، الرقم `ceil` بحجم `size*0.35` بـ pop كل ثانية، «SEC»، انتقال 500ms linear، heartbeat fast/slow بالحارس.
- [ ] PhaseHeader (أيقونة + عنوان ذهبي Amiri + sub mono) وPhaseLoading (spinner ذهبي + caption افتراضي «جارٍ التحميل…») مطابقان.
- [ ] ملخص الصباح الشخصي: ترشيح `targetPhysicalId===myId` واستثناء SILENCE/PROTECTION، خريطة العرض الحرفية، dedupe بمفتاح (target,type)، وحلّ تعارض `amIKilled` مع الـ backend.
- [ ] `display:night-started` يمسح فوراً؛ `game:phase-changed` ينظّف المؤقّت والحالة؛ حدث جديد يعيد ضبط المؤقّت.
- [ ] bug التوهّج في MorningSnipe مُتّخَذ فيه قرار موثّق (إصلاح أو تكافؤ)؛ لا GSAP؛ `winner.lottie` مُسقَط.
- [ ] التكيّف: compact = PWA؛ medium = قيم `md:`؛ expanded = مضاعفة الإيموجي/البطاقات/المؤقّت.

---

## 13. ملاحظات أداء وأمان

- **أداء:**
  - لِفّ كل سينمائية ذات جزيئات/خطوط كثيرة بـ `RepaintBoundary` (السونار، الجزيئات، الاهتزاز) لعزل إعادة الرسم.
  - أنهِ (dispose) كل `AnimationController` و`Timer` (خاصة setTimeout 600ms للـ SNIPE، ومؤقّتات 5s/10s) في `dispose` — الويب يلغيها على unmount؛ عدم إلغائها = تسريب.
  - CircularTimer: مرّر `timeRemaining` كـ double مشتقّ من الوقت السيرفري (drift-corrected)، وأعد بناء الرقم فقط عند تغيّر الثانية الصحيحة (`AnimatedSwitcher` keyed بالثانية) لتجنّب pop زائد.
  - استخدم `TweenAnimationBuilder<double>(500ms, Curves.linear)` لقوس CircularTimer بدل إعادة رسم كل frame.
  - أصول Lottie: حمّلها كسولاً وأعد استخدام الـ composition؛ لا تحمّل `winner.lottie` (يتيم).
- **أمان / anti-cheat (ثوابت تُنقل حرفياً):**
  - **عدم تسريب الأدوار:** السينمائيات تكشف الأدوار **فقط** عبر حمولة السيرفر (`extra.targetRole`/`newRole`/`disabledRole`)؛ لا تشتقّ دوراً محلياً. `ABILITY_DISABLED` يكشف الدور بلا هوية (`hideIdentity`)؛ `SILENCED` يكشف الهوية بلا دور (`isFlipped=false`)؛ `ASSASSINATION_BLOCKED` بلا بطاقة (الناجي مجهول) — احترم هذه القيود بدقّة.
  - **مصدر الصوت الحصري (leader-source):** عميل العرض لا يقرّر تشغيل صوت بنفسه (`localPlaybackEnabled=false`)؛ يعيد تشغيل المرآة `display:sound-play {fn,args}` فقط. أي صوت جديد يُضاف من جهة الليدر (راجع ذاكرة المشروع + 07-sound-system.md). لا تكسر هذه البوابة.
  - **ملخص الصباح الشخصي:** لا تعرض إلا الأحداث الموجَّهة للاعب نفسه (`targetPhysicalId===myId`)؛ لا تسرّب أحداث الآخرين. `SHERIFF_RESULT` يُعرض للاعب المحقَّق معه فقط عبر حمولته الخاصة.
  - **لا حفظ محلي للسينمائيات** (عابرة 5s/10s)؛ لا شيء على القرص يكشف مجريات الليل.
