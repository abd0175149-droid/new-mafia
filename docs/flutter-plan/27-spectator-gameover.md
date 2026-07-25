# المتفرج وGame Over: PhoneSpectatorView، النتائج، الاحتفالات، سحب الهدايا
> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

---

## 1. الهدف والنطاق

هذا الملف هو **المرجع الكامل الوحيد** لثلاث تجارب متداخلة يراها اللاعب من حالة «المتفرّج/الميت» حتى نهاية الجيم، بحيث يبنيها مطوّر Flutter من هذا الملف وحده دون فتح الكود الأصلي:

1. **طاولة الحلقة `PhoneSpectatorView`** — «حلقة الطاولة» ثلاثية الأبعاد على الهاتف. هي **المرجع الكامل** لهذا المكوّن (بقية ملفات الأطوار تُحيل إليه لمحتوى شريط المتحدّث الخاص بطورها فقط). تُركَّب في خمس حالات: (أ) بديل شاشة العرض في اللعب **عن بُعد** (الشاشة الرئيسية للاعب الريموت حياً كان أو ميتاً)، (ب) مشاهدة الموتى/المراقبين، (ج) واجهة الليدر/المضيف (`hostView + revealRoles`)، (د) حلقة انتظار اللوبي، (هـ) widget مطويّ أثناء التصويت (`collapsed`).
2. **شاشة الميت/المتفرّج في اللعب الفيزيائي (الوجاهي)** — لاعب مات في غرفة **غير ريموت** لا يرى طاولة `PhoneSpectatorView` إطلاقاً (تُرسم فقط عند `isRemote`)؛ يرى بطاقة دوره الرمادية + أجسام الأطوار من `PlayerPhaseView` (الليل/الصباح/الإقصاء/نهاية الجيم) بشكل سلبي، وحرّاس التصويت تمنعه من التصويت.
3. **إعلان الفائز ونهاية الجيم (Game Over)** — كشف الفائز والاحتفال بأربع نتائج (`MAFIA / CITIZEN / ASSASSIN / JESTER`)، وشبكة كشف أدوار الجميع، بمسارين: مسار الطاولة (ريموت) ومسار شبكة `PlayerPhaseView` (وجاهي).

يغطّي الملف كذلك **ما لا يجب أن يراه المتفرّج/الميت أمنياً** (ثوابت anti-leak)، و**عقد `luckyDraw`** (سحب هدايا الفعالية — `drawn`/`revealed`) كما يصل إلى اللاعب، وتوضيح **مكاسب XP/RR** (أين تُحسب وأين يراها اللاعب فعلياً)، وتدفّقات **العودة للوبي / لعبة جديدة / إغلاق الغرفة**.

**قرارات نطاق مهمّة (لا تخترع endpoints أو أحداثاً):**
- التطبيق عميلٌ ثانٍ لنفس الـ backend. كل تواصل الطاولة عبر **socket فقط** (لا HTTP مباشر في `PhoneSpectatorView`).
- **`luckyDraw` حدث لوبي، ليس حدث نهاية جيم** (السيرفر يقبله فقط في `Phase.LOBBY`). يُوثَّق هنا لأنه «سحب الهدايا» الذي يعقب/يتخلّل الجيمات ويصل بثّه لسوكِت اللاعب.
- **الفوز/الأدوار المحايدة (`neutralResults`) تُعرَض على شاشة العرض الكبيرة فقط**؛ عميل اللاعب الحالي **لا يستهلك `neutralResults`** (يعتمد `winner + players` فقط). للتكافؤ: تجاهلها في عرض اللاعب لكن انقلها في النموذج.
- **XP/RR لا تظهر في شاشة نهاية الجيم إطلاقاً في النسخة الحالية.** حمولة `game:over` لا تحمل أي حقل XP/RR؛ تُحسب وتُحفَظ سيرفرياً في `finalizeMatch` ويراها اللاعب لاحقاً في البروفايل/الرانك/السجلّ. لا تخترع كشف نقاط في نهاية الجيم.

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

- `C:\Projects\new mafia\unified-mafia\frontend\src\components\PhoneSpectatorView.tsx` (779 سطراً — المصدر الأساسي لطاولة الحلقة، قُرئ كاملاً؛ يحقن سلسلة CSS مُنطّقة `RT_CSS` عبر `<style>`).
- `C:\Projects\new mafia\unified-mafia\frontend\src\components\PlayerPhaseView.tsx` — حالة `GAME_OVER` (سطور 1124–1162): سبلاش الفائز + شبكة كشف الأدوار؛ مستمع `game:over` الداخلي (يضبط `gameWinner + allPlayers`).
- `C:\Projects\new mafia\unified-mafia\frontend\src\components\PlayerFlow.tsx`:
  - تركيب `PhoneSpectatorView` عند `isRemote` فقط (سطر 2692) مع `winnerReveal=gameOverData` و`collapsed` أثناء `DAY_VOTING`.
  - تركيب `PlayerPhaseView` (سطر 2748) — **بلا حارس `isRemote`** في تعليق «نُخفي كشف الفائز عن بُعد — الطاولة تكشفه».
  - مستمع `game:over` (سطور 1159–1176): يضبط `gameOverData`, `GAME_OVER`, override، يمسح التصويت/الفريق/الملاحظات، **يُبقي** الدور وحالة الموت.
  - `game:closed` (1179–1203)، `game:room-deleted` (1206–1230)، `leaveAndReset` المشترك لـ `game:kicked`/`event:closed` (1232–1264)، `game:started` (814+ إعادة تعيين كاملة).
- `C:\Projects\new mafia\unified-mafia\frontend\src\app\display\page.tsx` — عرض `luckyDraw` (سطور 259–263 استعادة عند مزامنة الحالة، 585–595 مستمعا `display:lucky-draw`/`:clear`) — **display-only، مرجعي فقط**؛ لبنة الاحتفال المرئية (dotLottie) تخصّ شاشة العرض لا اللاعب.
- `C:\Projects\new mafia\unified-mafia\backend\src\game\state.ts` — `LuckyDrawState` (سطور 189–197)، حقل `luckyDraw` في `GameState` (317)؛ `MorningEvent` (122–133).
- `C:\Projects\new mafia\unified-mafia\backend\src\sockets\lobby.socket.ts` — `room:lucky-draw:draw` (3838–3872، لوبي فقط، لا بثّ عند السحب)، `:reveal` (3874–3901، يبثّ `display:lucky-draw {winners,pool,spinMs:4500}` للغرفة)، `:clear` (3903–3913).
- `C:\Projects\new mafia\unified-mafia\backend\src\sockets\night.socket.ts` — بناء `gameOverPayload` وبثّ `game:over` (سطور 1412–1424، 1424، 1541؛ `game:confirm-end` 1396–1428).
- `C:\Projects\new mafia\unified-mafia\backend\src\game\reveal-grace.ts` — auto-finalize + بثّ `game:over` (سطور 86–95) مع `reason:'AUTO_REVEAL_TIMEOUT'`.
- `C:\Projects\new mafia\unified-mafia\backend\src\game\game-timer.ts` — `game:over` عند انتهاء مؤقت اللعبة (سطور 87–92) مع `reason:'TIMEOUT'`.
- `C:\Projects\new mafia\unified-mafia\backend\src\game\dynamic-win-checker.ts` — `NeutralResult`/`DynamicWinResult` (سطور 10–23).
- `C:\Projects\new mafia\unified-mafia\backend\src\services\match.service.ts` — `finalizeMatch` (51+): يحسب `xpEarned/rrChange/rewardBreakdown` لكل لاعب ويحفظها؛ **لا يبثّ أي حدث XP/RR للاعبين**.
- `C:\Projects\new mafia\unified-mafia\frontend\src\lib\constants.ts` — `ROLE_NAMES`, `ROLE_ICONS`, `MAFIA_ROLES`, `Role`.
- `C:\Projects\new mafia\unified-mafia\frontend\src\lib\avatar.ts` — `avatarThumb()`.
- `C:\Projects\new mafia\unified-mafia\frontend\src\hooks\useGameConfig.ts` — `getCardForRole(role)` (قوالب البطاقات: `secretFace.customImageUrl, gradient, borderColor, textColor`).

---

## 3. التبعيات على ملفات الخطة الأخرى

- **01-foundation-theme.md** — بذرة الثيم (surface `#050505/#111`، primary `#8A0303`، accent `#C5A059`)، خطوط Amiri + JetBrains Mono، `Directionality(TextDirection.rtl)`، **واستراتيجية Window Size Classes الكاملة** المُحال إليها في §5 (توكنات `gameScale`, `pageMaxWidth`, `contentMaxWidth`, `gridTileMinWidth`, `AdaptiveGrid`, `ContentConstraint`).
- **04-socket-layer.md** — طبقة الـ socket المشتركة؛ هذا الملف مستهلك للأحداث: `day:discussion-updated`, `game:phase-changed`, `day:elimination-revealed`, `day:show-silenced`, `game:timer-adjusted`, `game:started`, `day:justification-timer-started/stopped`, `display:morning-event`, `game:over`, `game:closed`, `game:room-deleted`, `game:kicked`, `event:closed`, `display:lucky-draw`, `display:lucky-draw:clear`.
- **02-models-data-layer.md** — النماذج المشتركة؛ نماذج §8 هنا تُضاف إليها (`SpectatorSeat`, `GameOverReveal`, `NeutralResult`, `LuckyDrawEvent`).
- **20-game-state-core.md** — آلة حالة `Phase`، `GameSessionController`، وتدفّق `game:over → GAME_OVER → game:started (reset)`. هذا الملف يستهلك حالة المرحلة والدور والموت منه.
- **21-join-lobby.md** — حالة اللوبي في الطاولة (`lobby + maxPlayers`، المقاعد الشاغرة، بانر اللوبي، شبكة تقدّم الانضمام). محتوى شريط المتحدّث في اللوبي مذكور هنا (§4.2) لأنه جزء من `PhoneSpectatorView`.
- **22-role-cards.md** — قوالب `getCardForRole` وأيقونات الأدوار (`ROLE_ICONS`) المستخدمة في وجه الدور الخلفي للبطاقة وفي رموز المقاعد عند نهاية الجيم.
- **23-night-phase.md** — عرض NIGHT للاعب؛ الطاولة تشارك مصدر «الطور الحالي» معه (شريط الرأس). ملخص الصباح الشخصي في `PlayerPhaseView` موثّق هناك و24.
- **24-morning-cinematics.md** — سينمائيات الصباح والليل (شاشة العرض)؛ بانر الصباح المصغّر على الطاولة (§4.9 هنا) هو مشتقّ اللاعب من `display:morning-event`. أصول `.lottie` (fireworks/prize-podium) موثّقة هناك و**تخصّ شاشة العرض** (لا اللاعب).
- **25-day-voting.md** — الوضع المطوي `collapsed` للطاولة يُستعمل أثناء `DAY_VOTING`؛ اقتراع اللاعب نفسه هناك. حرّاس منع تصويت الميت هناك (تجربة الميت السلبية).
- **26-notepad-mafia-chat.md** — FAB المفكرة يبقى ظاهراً في `done/rejoined`؛ لكن `chatVisible` يُطفأ عند الموت (تفصيله هناك).
- **31-voice-realtimekit.md** — بلاطات الفيديو/نقاط النشاط الصوتي (`videoByPid/speakingByPid`) التي تُغذّي وجه البطاقة في اللعب عن بُعد.
- **07-sound-system.md** — نغمات التنبيه ونظام الصوت (لا يُشغّل هذا المكوّن أصواتاً بنفسه؛ تنبيه الدور في النقاش موثّق في 23/24).
- **13-profile.md / 15-rank.md / 16-history.md** — **حيث يرى اللاعب مكاسب XP/RR فعلياً** (تحديث الرتبة/النقاط بعد المباراة، و`rewardBreakdown` لكل مباراة في السجلّ). نهاية الجيم لا تعرضها.

---

## 4. الواجهة والتجربة تفصيلياً

### 4.0 اللغة البصرية العامة

- أسطح شبه سوداء: حاوية الطاولة `#070707`، شرائط تحكم `#0a0a0a`، رقائق `#111`، حدود `#1a1a1a`. ذهبي عتيق `#C5A059` (تنويعات `#d6ae61`، `#b38e4b`)، أحمر خطر `#ef4444`/`#d13636`، أزرق مواطن `#7fb4e6`/`#3f83c4`، أحمر مافيا `#e07070`/`#d13636`، أخضر تكلّم `#34d399`، indigo لليل.
- الخط العربي **Amiri serif** (`fontFamily: 'Amiri, serif'`) للعناوين وأسماء اللاعبين وأسماء الأدوار؛ **JetBrains Mono** للأرقام والمؤقتات والشارات. كل الواجهة عربية RTL مع جزيرة LTR واحدة صريحة: عدّاد المقاعد `N/max` في اللوبي (`direction:ltr`).
- الإيموجي تُرسم كنص أيقوني: 🎙️ 🔇 🛡️ ⚠️ 💀 🩸 🔪 🤡 ⚖️ ◱ ⊡ ↺ ؟ ● + أيقونات الأدوار من `ROLE_ICONS`.
- `@media (prefers-reduced-motion: reduce)` يعطّل انتقالات البطاقات والقلب ⇒ في Flutter بوابة `MediaQuery.of(context).disableAnimations`.

### 4.1 حاوية `PhoneSpectatorView` + شريط الرأس

- **الحاوية**: `rounded-xl`، حد `#1a1a1a`، خلفية `#070707`، `overflow-hidden`، هامش سفلي `mb-3`.
- **حالة التحميل/الفراغ** (roster فارغ): spinner ذهبي 6×6 (حلقة، قمة ذهبية صلبة، `animate-spin`) + نص «**جاري تحميل الطاولة…**» (mono، `#808080`)، موسّط.
- **شريط الرأس** (يبقى ظاهراً حتى في `collapsed`):
  - **يسار**: تسمية الطور من `PHASE_LABELS` (ذهبي، Amiri، black weight، sm):
    | مفتاح الطور | التسمية |
    |---|---|
    | `DAY_DISCUSSION` | نقاش النهار |
    | `DAY_JUSTIFICATION` | مرحلة الدفاع |
    | `DAY_ELIMINATION` **و** `ELIMINATION_PENDING` | كشف الإقصاء |
    | `DAY_TIEBREAKER` | كسر التعادل |
    | `NIGHT` | الليل |
    | `MORNING_RECAP` | أحداث الصباح |
    | `LOBBY` | غرفة الانتظار |
    | `ROLE_GENERATION` | تجهيز الأدوار |
    | `ROLE_BINDING` | توزيع الأدوار |
    | `DAY_VOTING` | التصويت |
    | غير ذلك | الطور الخام (fallback) |
  - **يمين** (11px mono): غير اللوبي → `🛡️ {cit}` (أزرق `text-blue-400`)، `🔪 {maf}` (أحمر `text-red-400`) عند توفّر العدّ، «**أحياء {aliveCount}**»، ساعة الجيم `⏱ m:ss` (أبيض، `tabular-nums`، فاصل حدّ يمين). اللوبي → «**مقاعد**» + `N/max` بجزيرة LTR (العدّ ذهبي، السقف باهت).

### 4.2 شريط المتحدّث (`.rt-speaker`)

- `min-height: 38px` كي لا يقفز التخطيط بين الأدوار.
- **متحدّث نشط**: pill ذهبية (خلفية `rgba(197,160,89,.15)`، حد ذهبي 40%، `rounded-full`، 12px bold): «**🎙️ يتحدّث الآن:**» — وفي الدفاع «**🎙️ يُدافع الآن:**» — + `#{id} name` + `· {remaining}s` (mono؛ **أحمر عند ≤10s**).
- **متحدّث مُسكَت**: pill حمراء «**🔇 #{id} name — مُسكَت، لا يمكنه الكلام**».
- **بين الأدوار** (غير لوبي وغير نهاية جيم): نص placeholder «**— بانتظار المتحدّث التالي —**» (11px، `#7a7466`، JetBrains Mono).
- **لوبي/أطوار التجهيز**: «**جارٍ توزيع الأدوار… بطاقتك ستصلك خلال لحظات**» (أثناء `ROLE_GENERATION/ROLE_BINDING`) أو «**الطاولة تكتمل — بانتظار المضيف لبدء الجولة**».

### 4.3 المسرح (`.rt-stage`) والوضعان

- المسرح: `height: 410px`، `perspective: 1000px`، `perspective-origin: 50% 42%` (يصير `50% 30%` في overview)، `touch-action: pan-y`، `user-select: none`.
- طبقتا خلفية:
  - `.rt-felt` (بساط بوكر): بيضاوي `150%×82%` عند `top 57%`، `rotateX(72deg)`، radial أخضر `rgba(46,92,49,.30)` → داكن، blur 2px.
  - `.rt-glow` (توهّج ذهبي مركزي): radial `270×350px` مركز، blur 10px، ظاهر **فقط في وضع focus**، تلاشي 0.5s.
- **وضع FOCUS (الافتراضي) — عجلة 3D**: كل بطاقة `140×196px`، التحويل:
  `translateX(off*150px) translateZ(-|off|*205px) rotateY(-off*45deg) rotateZ(off*3deg)` مع `scale = 1 − |off|*0.3` (حد أدنى قرب المقدمة 0.72)؛ `opacity`: 1 أمامية، 0.5 جانبية، 0 خلف `|off| > 2.6` (وهناك `pointer-events: none`)؛ `zIndex = 100 − |off|*10`. انتقال البطاقة `.55s cubic-bezier(.15,.5,.3,.95)` — **يُعطَّل أثناء السحب** كي تتبع الإصبع. البطاقة الأمامية (`.rt-card.front`) تحمل حلقة/توهّج ذهبي إضافي (يُكبَت أثناء السحب).
- **وضع OVERVIEW — حلقة بيضاوية مسطّحة من «رموز مقاعد»**: موضع الرمز `translate(cos(ang)*Rx, sin(ang)*Ry + 4)`، حيث `ang = (i/denom)*2π − π/2`، `Rx = min(stageW/2 − 44, 168)`، `Ry = 147`، و`denom = lobby ? max(maxPlayers, N) : N`. الحلقة تأخذ `rotateX(8deg)`. أوجه البطاقات مخفية (`opacity: 0 !important`) والرموز ظاهرة.
- **قياس عرض المسرح**: `useLayoutEffect` + مستمع resize يحدّث `stageW` لضبط نصف قطر البيضاوي كي لا تُقصّ الرموز.

### 4.4 وجه البطاقة الأمامي (`.rt-front`)

- **منطقة الأفاتار (أعلى 66%)**: بلاطة فيديو live لو `videoByPid[pid]` — `<video autoPlay muted playsInline>` مربوطة بـ `MediaStream([track])`؛ وإلا `<img>` أفاتار مع `onError → fallback جنس → إخفاء`. تدرّج خلفية حسب الجنس: ذكر `#6a5a34→#1c1811`، أنثى `#5b4a67→#1e1725` + طبقة لمعان `::after`.
- **شارة الرقم** (أعلى-يمين): JetBrains Mono 16px، كريمي `#f0d9a0` على chip أسود، بنفسجي `#e9d5ff` للأنثى.
- **شريط الاسم** (أسفل 34%): خلفية سوداء، Amiri 16px أبيض، موسّط.
- **chip «أنت»** (أعلى-يسار، ذهبية) — تُخفى في `hostView`.
- **شريط دور المضيف** (فوق شريط الاسم، فقط عند `revealRoles` والبطاقة غير مقلوبة): 8.5px mono، مافيا `#e07070` / مواطن `#7fb4e6`، أيقونة + اسم.
- **قرص 🎙️ ذهبي** للمتحدّث النشط (لا يظهر في طور الدفاع، ولا للميت/المُسكَت). **قرص 🔇 أحمر** للمُسكَت.
- **chip عدّاد لكل بطاقة** (أعلى-يمين): `{s}s` ذهبي، أحمر (`warn`) عند ≤10، يُخفى عند الإسكات.
- **طبقة 💀** (منطقة الأفاتار، أسود 50%) عند الموت.

### 4.5 وجه البطاقة الخلفي (`.rt-back`) — الدور

- `rotateY(180deg)`، `backface-visibility: hidden`. القلب عبر `.rt-inner.flip { rotateY(180deg) }` بانتقال `.7s cubic-bezier(.5,.05,.2,1)`.
- إمّا **صورة دور مخصّصة** (`tpl.secretFace.customImageUrl`، تُطلَق مطلقاً بـ `SOCKET_URL` عند كونها نسبية، `cover` كامل الوجه)، أو **تصميم مولّد**: خلفية `tpl.gradient` (fallback radial داكن)، حد `1.5px tpl.borderColor`، أيقونة الدور 34px، اسم الدور (Amiri 18px، لون `tpl.textColor` أو مافيا `#d13636` / مواطن `#3f83c4`)، سطر فرعي «`#id · name`» (mono 11px).

### 4.6 رمز المقعد (overview) — `.rt-tav`

- عمود `72×88px`: قرص أفاتار `56×56` بحلقة معدنية `conic-gradient` (ذهبي `from 40deg, #e8cf8f,#8a6d31,#e8cf8f,#8a6d31,#e8cf8f`؛ **أنثى** بنفسجي `#d8b4fe/#6b21a8`؛ **عند نهاية الجيم** بلون الفريق: مافيا `#f0a5a0/#8A0303`، مواطن `#a8cdf0/#1d4f82`)، ظل `0 5px 14px rgba(0,0,0,.6)`.
- يستخدم `avatarThumb(p.avatarUrl)` مع سقوط على خطوتين عند `onError`: thumb → الأصلي → `/avatars/male|female.png`.
- شارة رقم أعلى-يمين (ذهبي، بنفسجي للأنثى)؛ chip «أنت» أسفل-يسار؛ شارات أسفل-يمين: 💀 ميت / 🔇 مُسكَت / نقطة خضراء نابضة `.rt-talk` (`11×11`, `#34d399`, ظل `0 0 9px #34d399`, `rttalk 1s ease-in-out infinite` بـ 50% opacity .35) للمتكلّم؛ أيقونة الدور أسفل-وسط عند نهاية الجيم؛ chip اسم أسفل (Amiri 11.5px، pill أسود، حد ذهبي، ellipsis؛ ميت: رمادي + شطب؛ **عند نهاية الجيم يعرض اسم الدور بدل اسم اللاعب**). رمز المتحدّث يحمل هالة ذهبية نابضة. الرمز الميت: القرص grayscale + تعتيم فقط.

### 4.7 حالات الموت + ثوابت anti-leak (ما لا يجب أن يراه المتفرّج)

- **`.dead`**: الوجه grayscale(1) brightness(.55) opacity .62، حد أحمر داكن، شطب الاسم. **`.dead.revealed`** (مُقصى بدور معروف): يبقى مقلوباً على وجه الدور، إزالة تشبّع خفيفة، chip 💀 صغيرة مثبّتة على زاوية الوجه الخلفي.
- **ثوابت أمنية تُنقل حرفياً** (فشلها = تسريب أدوار = كسر اللعبة):
  1. الـ roster يصل **منقّى**: `role = null` لكل لاعب حي. **الأدوار الحية لا تُرسَم أبداً.**
  2. الكشف الوحيد المسموح مصادره خمسة فقط: (أ) `day:elimination-revealed.revealedRoles`، (ب) حدث موت صباحي يحمل دوراً، (ج) صفوف roster ميتة تحمل `p.role`، (د) `winnerReveal.players` عند نهاية الجيم، (هـ) `revealRoles` في وضع المضيف.
  3. **قائمة أحداث الصباح NON_DEATH التي لا تُعرَض على الحلقة إطلاقاً** (تمنع تسريب دور من نجا/تأثّر): `SILENCED, SILENCE, SHERIFF_RESULT, INVESTIGATION, ABILITY_DISABLED, DISABLE_ABILITY, TRANSFORM, TWIN_TRANSFORM, ASSASSINATION_ATTEMPT, ELIMINATE_ALL, SINGLE_WINNER, TIE, ELIMINATION`.
  4. أي نوع حدث **غير معروف** يُعامَل كـ «موت»: يُكشف الدور إن حملته الحمولة، وإلا يُرمَّد الكارت فقط ويؤكّده الـ roster.
  5. **الإسكات** (`day:show-silenced`) يُضاف لـ Set، ويُمسَح عند بدء `NIGHT` (يدوم يوماً واحداً) وفي جيم جديد.
  6. **إعادة تعيين جيم جديد** (`LOBBY/ROLE_GENERATION/ROLE_BINDING`) تمسح `localDead, revealedRoles, silencedPids`.

### 4.8 سلسلة كشف الإقصاء (سينمائية متسلسلة)

على `day:elimination-revealed`، لكل لاعب مكشوف بالترتيب (مُسلسَل عبر حارس `revealSeq` الذي **يوقف التركيز التلقائي**):
1. التحوّل إلى وضع focus.
2. دوران العجلة إلى بطاقة اللاعب (**650ms**).
3. القلب إلى وجه الدور مع تثبيت الدور (**ثبات 2.6s**).
4. مسح علم القلب لكن البطاقة **تبقى مقلوبة للأبد** عبر `revealedRoles`.
5. توسيمه ميتاً محلياً.
6. فجوة **350ms** ثم التالي.
بعد اكتمال السلسلة: يعود التركيز إلى المتحدّث السيرفري الحالي إن وُجد.

### 4.9 بانر الصباح + بانر اللوبي + المقاعد الشاغرة

- **بانر الصباح** (`.rt-morning`، أعلى-وسط overlay، pop-in، **auto-dismiss 4.5s**): 🛡️ «**فشل الاغتيال**» + سطر فرعي «**نجت الحماية · {name}**» (عنوان أزرق `#7fb4e6`)، أو ⚠️ «**لم تنفع الحماية**» + الاسم. مشتق فقط من أحداث `display:morning-event` من نوعي الحماية (blocked/failed) — يحترم قائمة NON_DEATH.
- **بانر اللوبي** (overview فقط، ينتقل إلى مركز الحلقة): «**الطاولة تكتمل**» / «**بانتظار المضيف لبدء الجولة**» أو أثناء أطوار الأدوار «**جارٍ توزيع الأدوار…**» / «**بطاقتك ستصلك خلال لحظات**» (Amiri 19px + سطر mono فرعي).
- **المقاعد الشاغرة**: رموز بدائرة متقطّعة تحمل «**؟**» وتسمية «**شاغر**» لعدد `maxPlayers − N` (غير تفاعلية).

### 4.10 نهاية الجيم على الطاولة (`winnerReveal` — مسار الريموت)

- `gameOver = gamePhase === 'GAME_OVER' && !!winnerReveal`. تُبنى خريطة الأدوار من `winnerReveal.players` (لكل من له `physicalId` و`role`).
- **يفرض overview**؛ كل البطاقات تُركَّب **غير مقلوبة** ثم تُقلَب جميعاً بعد **550ms** (`gameOverRevealed`) — دوران عام→سرّيّ (لا ولادة مقلوبة).
- **لافتة الفائز** (`.rt-winner`، تظهر في overview وسط الحلقة فقط): أيقونة 38px بتوهّج ذهبي `drop-shadow(0 0 20px rgba(197,160,89,.55))` + عنوان Amiri 700 22px ذهبي `#C5A059` بظل `0 2px 14px rgba(0,0,0,.85)`. دخول `rtwin .6s ease-out` (`from{opacity:0; transform:translateX(-50%) scale(.7)}`). الانتقال إلى المركز `top .5s / transform .5s cubic-bezier(.4,0,.2,1)` بمقياس `.92`.
  | `winner` | الأيقونة | العنوان (حرفياً) |
  |---|---|---|
  | `MAFIA` | 🩸 | **انتصار المافيا** |
  | `ASSASSIN` | 🔪 | **انتصار السفّاح** |
  | `JESTER` | 🤡 | **فوز المهرج** |
  | غير ذلك (CITIZEN) | ⚖️ | **تطهير المدينة** |
- رموز المقاعد تأخذ حلقات ملوّنة بالفريق وأيقونة/اسم الدور (كما §4.6).

> **تنبيه تكافؤ حرج (تعارض كود/تعليق تحقّقتُ منه):** في `PlayerFlow` يُركَّب `PlayerPhaseView` **بلا حارس `isRemote`** عند `GAME_OVER` (رغم تعليق «نُخفي كشف الفائز عن بُعد»). وحالة `GAME_OVER` داخل `PlayerPhaseView` **لا تفحص `isRemote`**. النتيجة الفعلية في الكود: في الريموت **تظهر لافتة الطاولة (§4.10) وشبكة `PlayerPhaseView` (§4.12) معاً**. القرار للتكافؤ: انقل السلوك كما هو (كلاهما يظهر، الطاولة فوق والشبكة تحتها) — أو، إن أردت مطابقة **نيّة** التعليق، أخفِ الشبكة عند `isRemote`. الافتراضي الموصى به: مطابقة الكود (إظهار كليهما) مع علم مفتوح للمراجعة.

### 4.11 سطر التلميح + شريط التحكم + الوضع المطوي

- **سطر التلميح** (أسفل المسرح، mono 11px `#8a8578`): focus → «**اسحب لتدوير الحلقة · اضغط كارداً جانبياً للانتقال**»؛ overview → «**اضغط أي مقعد لتكبيره فوراً**».
- **شريط التحكم** (تحت المسرح، حدّ علوي، خلفية `#0a0a0a`): زر تبديل الوضع (`min-height 44px`، `flex-1 max-w 240px`، chip داكن، ذهبي mono 11.5px): «**◱ تصغير — عرض الحلقة كاملة**» ↔ «**⊡ تكبير كاردي**»؛ وزر شرطي «**↺ للمتحدّث**» (أزرق `#3f83c4`، حد أزرق) يظهر في focus عندما البطاقة المركّزة ≠ المتحدّث النشط.
- **الوضع المطوي** (`collapsed`، أثناء `DAY_VOTING`): المسرح + التحكم + شريط المتحدّث يطويان لـ `max-height 0`/`opacity 0` (انتقالات .45s/.3s)، بينما شريط الرأس يبقى. **المكوّن لا يُفكَّك** (تُحفظ الحالة).

### 4.12 نهاية الجيم في `PlayerPhaseView` (شبكة الوجاهي)

تُرسم عندما `gamePhase === 'GAME_OVER' && gameWinner` (جذر motion: `opacity + scale 0.9→1`):
- **أيقونة الفائز** 6xl نابضة (`scale [1,1.2,1]` مدة 2s infinite): `MAFIA`→🩸 / `ASSASSIN`→🔪 / `JESTER`→🤡 / غير ذلك→⚖️.
- **العنوان** (2xl black أبيض Amiri):
  | `gameWinner` | العنوان | العنوان الفرعي (`#9a9a9a` xs bold) |
  |---|---|---|
  | `MAFIA` | **انتصار المافيا** | **سيطرة مطلقة** |
  | `ASSASSIN` | **انتصار السفاح!** | **تم إنجاز العقود بنجاح** |
  | `JESTER` | **فوز المهرج!** | **نجح المهرج في الانتحار** |
  | غير ذلك (CITIZEN) | **تطهير المدينة** | **العدالة انتصرت** |
  > (لاحظ الفرق الحرفي المتعمَّد عن لافتة الطاولة §4.10: هنا «انتصار السفاح**!**» و«فوز المهرج**!**» بعلامة تعجّب وبدون شدّة على «السفاح»؛ في الطاولة «انتصار السفّاح» و«فوز المهرج» بلا تعجّب. انقلهما **حرفياً كما هما**.)
- **شبكة كشف أدوار الجميع** (تظهر لو `allPlayers.length > 0`): `grid grid-cols-3 gap-2 px-2`؛ كل خلية (دخول `opacity 0, y 10 → 1, 0`):
  - خلفية/حد: **أنا** → `bg-[#C5A059]/15 border-[#C5A059]/40`؛ **ميت** → `bg-red-500/10 border-red-500/20 opacity-60`؛ غير ذلك → `bg-white/5 border-white/10`. الحاوية `rounded-xl p-2.5 text-center border`.
  - المحتوى: `#{physicalId}` (أبيض xs bold)؛ الاسم (`#b3b3b3` 11px truncate)؛ اسم الدور عبر `ROLE_NAMES[p.role]` (10px؛ **أحمر `text-red-400` لو الدور ∈ `MAFIA_ROLES`، وإلا أخضر `text-green-400`**؛ «**?**» لو مفقود)؛ 💀 (10px أحمر) لو ميت.
- لأي مرحلة أخرى غير المذكورة في `PlayerPhaseView` → يرجع `null`.

### 4.13 سحب الهدايا `luckyDraw` كما يراه اللاعب (`drawn` / `revealed`)

- **الطبيعة**: توزيع هدايا الفعالية، **منفصل تماماً عن منطق اللعبة والرانك**. يجري **في اللوبي فقط** (السيرفر يرفضه في غير `Phase.LOBBY`).
- **الحالتان**:
  - **`drawn`**: الليدر سحب الفائزين (Fisher–Yates على الحاضرين) لكن **لم يُبَثّ شيء للغرفة** — الفائزون في ack الليدر فقط (مفاجأة محفوظة). ⇒ **اللاعب لا يستقبل أي حدث في حالة `drawn`**، ولا يرى شيئاً.
  - **`revealed`**: الليدر كشف على الشاشة ⇒ يُبَثّ **`display:lucky-draw {winners:number[], pool:number[], spinMs:4500}`** إلى **كل الغرفة** (`io.to(roomId)`) ⇒ **يصل سوكِت اللاعب**. ثم `display:lucky-draw:clear` عند إنهاء السحب.
- **السلوك الحالي في PWA (خط الأساس للتكافؤ)**: **عميل اللاعب لا يرسم شيئاً** لسحب الهدايا — عجلة الدوران والاحتفال تُعرَض حصرياً على **شاشة العرض الكبيرة** (`display/page.tsx`)؛ الفائزون يُنادَون فيزيائياً في القاعة. للتكافؤ الصارم: **تطبيق Flutter للاعب لا يعرض شيئاً افتراضياً** لسحب الهدايا.
- **تحسين اختياري (خارج التكافؤ، لا تفعّله افتراضياً)**: بما أن `display:lucky-draw` يصل للاعب، يمكن مستقبلاً — إن قرّر المنتج — إظهار احتفال «🎁 مبروك! ربحت هدية» عندما `myPhysicalId ∈ winners`. **ليس** في النسخة الحالية؛ يُوثَّق العقد فقط ليكون جاهزاً. اجعله علماً موثّقاً لا سلوكاً افتراضياً.
- **الاستعادة عند إعادة الاتصال**: `game:state-sync` يحمل `state.luckyDraw`؛ عند `status==='revealed'` تُعاد بناء حالة الكشف (شاشة العرض تستخدم `revealedAt` للمزامنة). عميل اللاعب — للتكافؤ — يتجاهلها.

### 4.14 مكاسب XP/RR — أين تُحسب وأين يراها اللاعب

- **حمولة `game:over` لا تحمل أي حقل XP/RR إطلاقاً** (الحقول: `winner, matchId, players, [neutralResults], [reason]` فقط — §7).
- `finalizeMatch` سيرفرياً يحسب لكل لاعب `xpEarned` و`rrChange` و`rewardBreakdown` (عبر `computeMatchReward/computeMatchBreakdown`) **ويحفظها** في قاعدة البيانات (سجلّ المباراة + التقدّم + إحصاءات الموسم)؛ **لا يبثّ أي حدث XP/RR للاعبين**. (مباريات الأونلاين تُحسم لموسم أونلاين ولا تمسّ رانك الوجاهي.)
- **لذلك**: شاشة نهاية الجيم للاعب تعرض **الفائز + كشف الأدوار فقط** — **لا نقاط**. يرى اللاعب المكاسب لاحقاً في:
  - **13-profile.md / 15-rank.md**: الرتبة/النقاط المحدَّثة بعد المباراة (تُجلَب بـ REST عند فتح الشاشة).
  - **16-history.md**: `rewardBreakdown` المفصّل لكل مباراة.
- **قرار تكافؤ**: لا تخترع كشف XP/RR في نهاية الجيم. أقصى المسموح: زر/تلميح «شاهد تقدّمك» يوجّه إلى شاشة الرانك/السجلّ (اختياري، ليس في PWA).

### 4.15 العودة للوبي / لعبة جديدة / إغلاق الغرفة

الغرفة **تبقى مفتوحة** بعد نهاية الجيم؛ اللاعب ينتظر قرار الليدر. لا يوجد زر «عودة للوبي» صريح على شاشة نهاية الجيم للاعب — التنقّل مقاد بالأحداث (الزر الوحيد المتاح دائماً هو «🚪 خروج» = `handleLogout`). الأحداث:

| الحدث | ما يحصل للاعب | الوجهة |
|---|---|---|
| `game:over` | ضبط `gameOverData`، `GAME_OVER`، override؛ مسح التصويت/الفريق/الملاحظات؛ **إبقاء الدور وحالة الموت** | شاشة نهاية الجيم (البطاقة الميتة/الدور تبقى) |
| `game:started` | **إعادة تعيين كاملة** لكل حالة الجولة | العودة لحالة الانتظار/اللوبي داخل نفس الغرفة (`done/rejoined`) |
| `game:phase-changed → LOBBY/ROLE_GENERATION/ROLE_BINDING` | مسح `mafiaTeam/sibling/assignedRole/gameOverData/الملاحظات` | حالة الانتظار (لوبي ريموت أو «اكتمل التشفير») |
| `game:closed` | مسح الجلسة والتصويت والملاحظات؛ `gamePhase=null, assignedRole=null, isPlayerDead=false` | يبقى في الخطوة الحالية بحالة الانتظار (بلا مرحلة) |
| `game:room-deleted` | تنظيف كامل + `apiError='تم إغلاق الغرفة'` | العودة لخطوة `phone` (لو `initialRoomCode`) أو `code` |
| `game:kicked` | `leaveAndReset(reason)` — تنظيف كامل + `apiError = reason` | العودة لخطوة `phone`/`code` |
| `event:closed` | `leaveAndReset(reason \|\| 'تم إنهاء الفعالية وإغلاق الغرفة')` | العودة لخطوة `phone`/`code` |

تفاصيل آلة الحالة الكاملة والـ reset في **20-game-state-core.md**؛ هنا يكفي أن شاشة المتفرّج/نهاية الجيم **لا تقرّر التنقّل بنفسها** بل تستجيب لهذه الأحداث.

---

## 5. التكيّف مع الشاشات 6→11 إنش (إلزامي)

الاستراتيجية الكاملة (الفئات الثلاث والتوكنات) في **01-foundation-theme.md §5**؛ هنا تخصيص شاشتي:

- **compact (< 600dp) — خط الأساس، الـ PWA حرفياً**:
  - الطاولة: مسرح `410px`، بطاقة `140×196`، ثوابت العجلة كما هي (`150px/بطاقة`, `translateZ 205`, `Rx=min(stageW/2−44,168)`, `Ry=147`)؛ شبكة نهاية الجيم `3 أعمدة`؛ `gameScale = 1.0`.
- **medium (600–840dp) — تابلت 8 إنش**:
  - **الطاولة عنصر لعب حسّاس** ⇒ تُضرب أبعادها الحسّاسة في `gameScale = 1.25` **وتُكبَّر لا تُمدَّد**: أبعاد البطاقة `140×196 ×1.25`، ثوابت العجلة الهندسية (`150`, `205`, `Rx cap 168`, `Ry 147`) × `gameScale`، ارتفاع المسرح × `gameScale`، chip العدّاد وقرص 🎙️ × `gameScale`. المسرح **متمركز** ضمن `pageMaxWidth = 840`، وطبقتا `felt/glow` تغطّيان كامل عرض الشاشة الفيزيائية.
  - **شبكة نهاية الجيم**: `AdaptiveGrid(gridTileMinWidth=110)` ⇒ ترتفع الأعمدة تلقائياً (3→4/5)، ضمن `contentMaxWidth = 640` ومتمركزة. سبلاش الفائز (أيقونة 6xl + العنوان) × `gameScale`.
  - شريط الرأس/التحكم/التلميح: أحجام body/mono ثابتة؛ زر تبديل الوضع يبقى `min 44px`.
- **expanded (> 840dp) — تابلت 10–11 إنش**:
  - `gameScale = 1.5`؛ سقف الصفحة `pageMaxWidth = 960` متمركز؛ خلفية الأجواء تغطّي كامل الشاشة. **بلا two-pane** — طاولة واحدة متمركزة مكبّرة (`×1.5`) هي الأنسب لعنصر لعب مشهدي.
  - شبكة نهاية الجيم: `AdaptiveGrid(gridTileMinWidth=120)` (3→5/6 أعمدة) ضمن `contentMaxWidth = 720`، متمركزة؛ السبلاش × `1.5`.
- **قواعد عامة**: portrait مقفول على كل الفئات؛ الأنيميشنات ومددها **لا تتغيّر**؛ الحوارات/التوستات (بانر الصباح، لافتة الفائز) لا تتبع عرض الشاشة (`dialogMaxWidth 448/448/512`). ثوابت العجلة تُقاس بـ logical px مضروبة في `gameScale` — لا تعِد اشتقاقها لكل حجم كي لا تنحرف الهندسة.

---

## 6. المنطق والتدفقات

### 6.1 أي شاشة يرى «المتفرّج/الميت»؟ (آلة القرار)

```
isRemote == true:
    gamePhase ∈ {LOBBY, ROLE_GENERATION, ROLE_BINDING} → PhoneSpectatorView(lobby) [حلقة الانتظار]
    else → PhoneSpectatorView(الطور) هي الشاشة الرئيسية (حياً أو ميتاً)
           + PlayerPhaseView (أجسام الأطوار) تحتها
           + (GAME_OVER) لافتة الطاولة §4.10 + شبكة §4.12 (كلاهما — راجع تنبيه §4.10)
isRemote == false (وجاهي):
    لا PhoneSpectatorView إطلاقاً.
    الميت يرى: بطاقة دوره الرمادية (cardFlipped مفروض true) + PlayerPhaseView لأجسام الأطوار.
    GAME_OVER → شبكة §4.12 فقط.
    التصويت: حرّاس الميت تمنعه (25-day-voting.md).
```

### 6.2 مصدر «الدور النشط» ومؤقتاته (الطاولة)

- `DAY_JUSTIFICATION` → المدافع = `justTimer.physicalId`؛ `DAY_DISCUSSION` → المتحدّث = `discussion.currentSpeakerId`؛ غير ذلك → لا أحد.
- **صحّة العدّاد**: يُشتقّ من `discussion.timeRemaining` السيرفري (المحدَّث عند تعديلات الليدر ±)، لا من الحدّ الثابت؛ يُعدّ فقط أثناء وجود `startTime` (إيقاف مؤقت → عرض ثابت). tick كل 1s يحرّك عدّاد كل بطاقة وساعة الجيم في الرأس (`totalSeconds − elapsed since startedAt`، يتوقّف عند `expired`).
- ساعة الجيم تُحدَّث بـ `game:timer-adjusted {gameTimer}` و`game:started {gameTimer}`.

### 6.3 التركيز التلقائي والسحب

- المتحدّث/المدافع السيرفري **يفوز دائماً** (`setMode('focus')` + تركيز)، **إلا أثناء سلسلة الكشف** (`revealSeq`)؛ أول mount يركّز بطاقتي (المضيف: أول بطاقة)؛ الـ overview اليدوي يبقى بين الأدوار (لا تصغير تلقائي).
- **السحب لتدوير العجلة** (focus فقط؛ معطّل في `collapsed`/أثناء الكشف/عند `N<2`): pointerdown يسجّل البداية؛ حركة >6px تعلّم «moved» (تكبت الـ click)؛ `rotation = startRot − dx/150`؛ عند الإفلات: زخم `−vel*5` مقيّد ±2 بطاقة من الحالي، snap لأقرب عدد صحيح، ضبط التركيز؛ كبت النقر 60ms بعد السحب؛ مستمعا `pointerup/touchend` عالميان لإنهاء السحب خارج المسرح. `touch-action: pan-y` ⇒ التمرير العمودي يمرّ للأب.
- **النقر**: رمز overview → تركيز + focus؛ بطاقة جانبية في focus → دوران بأقصر مسار دائري (`shortest()`). النقرات تُتجاهَل إن حصل سحب لتوّه.

### 6.4 حالات حدّية

- `PHASE_LABELS` يدعم `DAY_ELIMINATION` و`ELIMINATION_PENDING` معاً — ادعمهما.
- عدّاد الفريق (`teamCounts`) يصل بأسماء مفاتيح متعددة (`citizenAlive|citizens|citizen|town`، `mafiaAlive|mafia|mafiaCount`) — تحليل متسامح.
- `day:justification-timer-started` في الطاولة يستخدم `timeLimitSeconds || 30` و`startTime || now` (بينما `PlayerPhaseView` يستخدم `timeLimitSeconds || duration`) — اضبط الاثنين.
- بطاقة/رمز يعتمد أفاتاراً ناقصاً ⇒ سلسلة سقوط thumb→أصلي→`male/female.png` ثم إخفاء.

### 6.5 إعادة الاتصال واستعادة الحالة

- الطاولة **لا تُصدر emits**؛ تُرطَّب حصراً من الأحداث الواردة + الـ props (`roster, initialDiscussionState, winnerReveal`). عند reconnect يعيد `PlayerFlow` الانضمام والـ poll ويمرّر roster/pollData محدّثين (20-game-state-core.md).
- `winnerReveal` يُمرَّر من `gameOverData` (يُضبَط من `game:over`)؛ عند إعادة الاتصال في `GAME_OVER` يجب أن يُعاد ضبط `gameOverData` من `game:state-sync`/إعادة `game:over` كي تُبنى خريطة الأدوار ثانية.
- الوضع المطوي `collapsed` **يحفظ الحالة** (لا unmount) — استعمل `AnimatedSize`/`SizeTransition`.

### 6.6 المؤقتات والمهل (تُنقل بالضبط)

- tick 1s للعدّاد النشط + ساعة الجيم (يعمل فقط أثناء `startTime`).
- `setTimeout` نهاية الجيم: **550ms** (قلب كل البطاقات).
- بانر الصباح: **4500ms** auto-dismiss.
- سلسلة الكشف: **650 / 2600 / 350ms**.
- كبت النقر بعد السحب: **60ms**.
- (شاشة العرض فقط، مرجعي) عجلة سحب الهدايا: `spinMs = 4500`.

---

## 7. عقود التكامل

### 7.1 REST

**لا نداءات HTTP مباشرة** في `PhoneSpectatorView` أو في مسار نهاية الجيم للاعب. غير مباشر:
- `useGameConfig()` (قوالب البطاقات) — نقاط `game-config` موثّقة في 03-networking-rest.md و22-role-cards.md.
- مكاسب XP/RR تُقرأ لاحقاً عبر شاشات البروفايل/الرانك/السجلّ (13/15/16) بنقاطها الخاصة — **ليست جزءاً من نهاية الجيم**.

### 7.2 Socket — مستمعات `PhoneSpectatorView` (استماع فقط، لا emits)

| الحدث | الاتجاه | الحمولة (كما تُستعمل) | متى/الأثر |
|---|---|---|---|
| `day:discussion-updated` | ⬇️ وارد | `{ discussionState:{ currentSpeakerId, status, timeRemaining, startTime, speakers[] } }` | تحديث المتحدّث والمؤقت |
| `game:phase-changed` | ⬇️ وارد | `{ phase, teamCounts?:{citizenAlive\|citizens\|citizen\|town, mafiaAlive\|mafia\|mafiaCount} }` | تحديث العدّ؛ مسح discussion (≠DISCUSSION)، justTimer (≠JUSTIFICATION)، silenced (NIGHT)، بانر الصباح |
| `day:elimination-revealed` | ⬇️ وارد | `{ teamCounts?, revealedRoles:[{physicalId, role}] }` | تحديث العدّ + تشغيل سلسلة الكشف §4.8 |
| `day:show-silenced` | ⬇️ وارد | `{ physicalId }` | إضافة شارة الإسكات |
| `game:timer-adjusted` | ⬇️ وارد | `{ gameTimer:{ totalSeconds, startedAt, expired? } }` | تحديث ساعة الرأس |
| `game:started` | ⬇️ وارد | `{ gameTimer }` | بدء ساعة الرأس + reset طاولة (localDead/revealedRoles/silenced) |
| `day:justification-timer-started` | ⬇️ وارد | `{ physicalId, timeLimitSeconds(=30), startTime(=now) }` | ضبط المدافع + دوران العجلة إليه |
| `day:justification-timer-stopped` | ⬇️ وارد | — | مسح مؤقت المدافع |
| `display:morning-event` | ⬇️ وارد | `{ type, targetPhysicalId, targetName?, extra?:{targetRole?}, targetRole?, role? }` | بانر حماية (blocked/failed)، تجاهل قائمة NON_DEATH، وإلا موت → كشف دور أو ترميد الكارت |

### 7.3 Socket — نهاية الجيم (يستهلكها `PlayerFlow` + `PlayerPhaseView`)

| الحدث | الاتجاه | الحمولة | الأثر |
|---|---|---|---|
| `game:over` | ⬇️ وارد | `{ winner:'MAFIA'\|'CITIZEN'\|'ASSASSIN'\|'JESTER', matchId, players:[{physicalId,name,role,isAlive}], neutralResults?:NeutralResult[], reason?:'TIMEOUT'\|'AUTO_REVEAL_TIMEOUT' }` | `PlayerFlow`: `gameOverData={winner,players}`, `GAME_OVER`, override، مسح تصويت/فريق/ملاحظات، إبقاء دور/موت. `PlayerPhaseView`: `gameWinner+allPlayers`. الطاولة تتلقّاها عبر `winnerReveal` prop |
| `game:started` | ⬇️ وارد | `{ gameTimer, ... }` | إعادة تعيين كاملة (20-game-state-core.md) |
| `game:phase-changed → LOBBY/ROLE_*` | ⬇️ وارد | `{ phase }` | مسح `mafiaTeam/sibling/assignedRole/gameOverData/الملاحظات` |
| `game:closed` | ⬇️ وارد | — | مسح جلسة/تصويت/ملاحظات؛ `gamePhase=null, assignedRole=null, isPlayerDead=false` |
| `game:room-deleted` | ⬇️ وارد | — | تنظيف كامل؛ `apiError='تم إغلاق الغرفة'`؛ العودة لـ `phone`/`code` |
| `game:kicked` | ⬇️ وارد | `{ reason? }` | `leaveAndReset(reason)` |
| `event:closed` | ⬇️ وارد | `{ reason?, message? }` | `leaveAndReset(reason\|\|message\|\|'تم إنهاء الفعالية وإغلاق الغرفة')` |

### 7.4 Socket — سحب الهدايا `luckyDraw`

| الحدث | الاتجاه | الحمولة | ملاحظة |
|---|---|---|---|
| `room:lucky-draw:draw` | ⬆️ صادر (**الليدر فقط**) | `{ roomId, count }` → ack `{ success, winners?, pool?, error? }` | لوبي فقط؛ **لا بثّ للغرفة** (اللاعب لا يرى شيئاً في `drawn`) |
| `room:lucky-draw:reveal` | ⬆️ صادر (**الليدر فقط**) | `{ roomId }` → ack `{ success, winners? }` | يبثّ `display:lucky-draw` |
| `display:lucky-draw` | ⬇️ وارد (**يصل اللاعب**) | `{ winners:number[], pool:number[], spinMs:4500 }` | PWA للاعب لا يرسمه (شاشة العرض فقط). للتكافؤ: تجاهله (أو تحسين اختياري §4.13) |
| `room:lucky-draw:clear` | ⬆️ صادر (**الليدر فقط**) | `{ roomId }` → ack `{ success }` | يبثّ `display:lucky-draw:clear` |
| `display:lucky-draw:clear` | ⬇️ وارد | — | إنهاء السحب (لا فعل للاعب) |

> تطبيق اللاعب في Flutter **لا يُصدر** أياً من `room:lucky-draw:*` (صلاحية ليدر). يستقبل `display:lucky-draw*` فقط ويتجاهلها افتراضياً.

---

## 8. نماذج Dart المطلوبة

```dart
// ── طاولة الحلقة ──────────────────────────────
enum SpectatorMode { focus, overview }
enum PlayerGender { male, female }

class SpectatorSeat {
  final int physicalId;
  final String? name;
  final String? avatarUrl;
  final PlayerGender gender;
  final String? role;      // null للأحياء (roster منقّى) — لا يُرسَم إلا وفق مصادر الكشف الخمسة
  final bool isAlive;
  // حالات محلية مشتقّة (ليست من الشبكة):
  //  isSilenced (من silencedPids Set) — isRevealed (من revealedRoles) — isLocalDead (من localDead)
}

class DiscussionSnapshot {
  final int? currentSpeakerId;
  final String status;      // 'SPEAKING' | 'PAUSED' | 'WAITING'
  final int? timeRemaining; // ثوانٍ (سيرفري)
  final int? startTime;     // epoch ms — العدّ يجري فقط عند توفّره
  final List<SpeakerEntry> speakers;
}
class SpeakerEntry { final int physicalId; final String? name; final String status; } // 'done'|...

class GameTimerSnapshot { final int totalSeconds; final int startedAt; final bool expired; }

class MorningBanner { final bool saved; /* 🛡️ فشل الاغتيال : ⚠️ لم تنفع الحماية */ final String? name; }

// ── نهاية الجيم ───────────────────────────────
enum WinnerType { mafia, citizen, assassin, jester }

class GameOverReveal {
  final WinnerType? winner;          // null احتياطاً
  final String? matchId;
  final List<GameOverPlayer> players;
  final List<NeutralResult> neutralResults; // [] افتراضياً — عرض العرض فقط، لا يرسمه اللاعب
  final String? reason;              // 'TIMEOUT' | 'AUTO_REVEAL_TIMEOUT' | null
}
class GameOverPlayer {
  final int physicalId;
  final String? name;
  final String? role;   // مصدر شبكة الكشف والألوان (MAFIA_ROLES → أحمر، غيره → أخضر)
  final bool isAlive;
}
class NeutralResult {
  final int physicalId;
  final String playerName;
  final String roleId;
  final String roleNameAr;
  final bool won;
  final String conditionType;
  final String conditionDescription;
}

// ── سحب الهدايا (عقد فقط — لا يُرسَم افتراضياً) ──
class LuckyDrawEvent { final List<int> winners; final List<int> pool; final int spinMs; } // spinMs=4500
class LuckyDrawState {   // من game:state-sync (يتجاهله اللاعب للتكافؤ)
  final String status;   // 'drawn' | 'revealed'
  final int count;
  final List<int> winners;
  final List<int> pool;
  final int? revealedAt;
}
```

(`GameOverReveal.winner` يُشتقّ من نص `winner`؛ خرائط النصوص الحرفية للعناوين/الأيقونات في §4.10 و§4.12.)

---

## 9. الحزم المستخدمة

- **flutter (core)** — `Transform(Matrix4)` للعجلة 3D (`..setEntry(3,2,0.001)..translate/rotateY/rotateZ/scale`)، `CustomPaint`/`Stack` للحلقة، `AnimatedSwitcher`/`SizeTransition`/`AnimatedSize` للوضع المطوي.
- **flutter_animate** — دخول اللافتات (rtwin pop، بانر الصباح)، النبضات، تلاشي التوهّج.
- **vector_math** (مضمّن) — مصفوفات العجلة والقلب.
- **google_fonts** أو أصول محلية — **Amiri** + **JetBrains Mono** (الأساس أصول محلية حسب 01-foundation-theme.md).
- **flutter_webrtc** أو **RealtimeKit Flutter SDK** — بلاطات الفيديو `RTCVideoView` (اللعب عن بُعد — 31-voice-realtimekit.md).
- **قرارات سلبية (لا تُنقل)**: `dotlottie`/`lottie` لسحب الهدايا/الألعاب النارية — **تخصّ شاشة العرض لا اللاعب** (خارج نطاق هذا الملف)؛ لا توليد أصوات runtime هنا (المكوّن لا يشغّل صوتاً).

---

## 10. اختلافات Android / iOS (إلزامي)

- **رسم الإيموجي**: مجموعات إيموجي Android/iOS تختلف عن الويب؛ تحقّق بصرياً من ⚖️ 🎙️ 🔇 ◱ ⊡ ↺ 🩸 🔪 🤡 ؟ ● وأيقونات الأدوار — أو استبدلها بأصول أيقونات موحّدة (خصوصاً تسلسلات ZWJ إن وُجدت). خطر أعلى على Android القديم.
- **بلاطات الفيديو**: `RTCVideoView` هو platform-view؛ على Android تأكّد من `PlatformViewLink`/hybrid composition لتفادي artifacts فوق طبقات الـ 3D؛ على iOS تحقّق من الأداء عند تركيب فيديو داخل بطاقة متحوّلة (Matrix4) — قد يلزم `RepaintBoundary`.
- **الحركة المخفّضة**: احترم `MediaQuery.disableAnimations` (يقابل `prefers-reduced-motion`) لتعطيل انتقالات البطاقة/القلب — السلوك متطابق بين المنصّتين لكن نظام الوصول يُضبط منصّياً.
- **باقي الشاشة**: **لا اختلافات جوهرية أخرى** — نهاية الجيم والشبكة والسحب لا تستخدم اهتزازاً/إشعارات/wake-lock خاصاً بمنصّة في هذا الملف (تنبيه الدور بالاهتزاز/النغمة يخصّ النقاش، موثّق في 23/24). سطر تبرير: هذا الملف عرضٌ سلبي مقاد بالـ socket + طاولة تحويلات هندسية، وكلاهما portable عبر نفس واجهات Flutter.

---

## 11. الأصول المطلوبة

- **صور**: `/avatars/male.png`, `/avatars/female.png` (سقوط الجنس)؛ أفاتار اللاعب الشبكي + `avatarThumb()`؛ صور بطاقات الأدوار المخصّصة `tpl.secretFace.customImageUrl` (قد تكون نسبية → تُطلَق بـ `SOCKET_URL`).
- **خطوط**: Amiri (400/700)، JetBrains Mono (400/500/700).
- **أيقونات**: مجموعة الإيموجي في §4.0 + `ROLE_ICONS` (22-role-cards.md).
- **فيديو**: `MediaStreamTrack` للكاميرات (self + المتحدّثون) — عبر مكدّس اللعب عن بُعد (31).
- **بلا Lottie/بلا أصوات في هذا الملف**: الألعاب النارية/podium وعجلة سحب الهدايا **أصول شاشة العرض** (fireworks.lottie / prize-podium.lottie — موثّقة في 24-morning-cinematics.md §11)، **خارج نطاق تطبيق اللاعب**.

---

## 12. معايير القبول (checklist تكافؤ قابلة للتعليم ✓)

**طاولة الحلقة**
- [ ] الحاوية `#070707` حد `#1a1a1a`؛ حالة تحميل «جاري تحميل الطاولة…» بـ spinner ذهبي.
- [ ] شريط الرأس: تسميات `PHASE_LABELS` العشر الحرفية + `🛡️ {cit}`/`🔪 {maf}`/`أحياء {n}`/`⏱ m:ss`؛ لوبي `مقاعد N/max` جزيرة LTR.
- [ ] شريط المتحدّث: «🎙️ يتحدّث الآن:»/«🎙️ يُدافع الآن:» + `#{id} name` + `· {s}s` أحمر ≤10؛ مُسكَت «🔇 … — مُسكَت، لا يمكنه الكلام»؛ بين الأدوار «— بانتظار المتحدّث التالي —».
- [ ] عجلة focus: `140×196`، تحويل `translateX(off*150) translateZ(-|off|*205) rotateY(-off*45) rotateZ(off*3)`، scale≥0.72، opacity 1/0.5/0، انتقال `.55s cubic-bezier(.15,.5,.3,.95)` معطّل أثناء السحب.
- [ ] overview: بيضاوي `Rx=min(stageW/2−44,168)`, `Ry=147`, `rotateX(8deg)`, رموز مقاعد `72×88` بحلقة conic.
- [ ] وجه البطاقة: أفاتار/فيديو 66% + تدرّج جنس + شارة رقم كريمي/بنفسجي + شريط اسم Amiri 16px + chip «أنت» + 🎙️/🔇 + عدّاد + 💀.
- [ ] وجه الدور: صورة مخصّصة أو تصميم مولّد (gradient/border/icon 34px/اسم Amiri 18px/`#id · name`)، قلب `.7s cubic-bezier(.5,.05,.2,1)`.
- [ ] سلسلة الكشف: 650 → قلب+ثبات 2600 → يبقى مقلوباً → ميت محلياً → 350 → التالي؛ ثم عودة للمتحدّث.
- [ ] بانر الصباح 4.5s (🛡️ «فشل الاغتيال»/«نجت الحماية · {name}» أو ⚠️ «لم تنفع الحماية»).
- [ ] بانر اللوبي + مقاعد شاغرة «؟»/«شاغر».
- [ ] سطر التلميح (focus/overview) + شريط التحكم «◱/⊡» + «↺ للمتحدّث» + الوضع المطوي بلا unmount.
- [ ] السحب: >6px يلغي النقر، زخم `−vel*5` ±2، snap، كبت 60ms؛ التمرير العمودي يمرّ للأب.

**anti-leak (اختبارات أمنية إلزامية)**
- [ ] لا دور حيّ يُرسَم إطلاقاً (`role=null` للأحياء) إلا في `revealRoles` للمضيف.
- [ ] الكشف فقط من المصادر الخمسة؛ قائمة NON_DEATH لا تُعرَض على الحلقة حرفياً.
- [ ] الإسكات يُمسَح عند `NIGHT` وفي جيم جديد؛ reset الطاولة في `LOBBY/ROLE_*`.
- [ ] الميت في الوجاهي لا يرى `PhoneSpectatorView` ولا يقدر يصوّت.

**نهاية الجيم**
- [ ] لافتة الطاولة (overview): 🩸/🔪/🤡/⚖️ + «انتصار المافيا»/«انتصار السفّاح»/«فوز المهرج»/«تطهير المدينة» بعد قلب كل البطاقات (550ms).
- [ ] شبكة `PlayerPhaseView`: أيقونة 6xl نابضة + العنوان الحرفي **مع فروق !/الشدّة** (§4.12) + العنوان الفرعي؛ شبكة 3 أعمدة (أنا ذهبي/الميت أحمر باهت + 💀/الدور أحمر لو مافيا وإلا أخضر، «?» لو مفقود).
- [ ] **لا XP/RR على شاشة نهاية الجيم** (حمولة `game:over` بلا حقول نقاط)؛ المكاسب تظهر لاحقاً في البروفايل/الرانك/السجلّ فقط.
- [ ] `neutralResults` تُنمذَج ولا تُرسَم.

**العودة/السحب**
- [ ] `game:started` → reset كامل؛ `game:phase-changed→LOBBY/ROLE_*` → مسح فريق/دور/ملاحظات/gameOver.
- [ ] `game:closed`/`game:room-deleted`/`game:kicked`/`event:closed` → الوجهات ورسائل `apiError` الحرفية في §4.15/§7.3.
- [ ] `luckyDraw`: `drawn` لا يصل اللاعب؛ `display:lucky-draw {winners,pool,spinMs:4500}` يصل ويُتجاهَل (تكافؤ PWA — لا رسم).

**التكيّف**
- [ ] compact = PWA حرفياً؛ medium/expanded: الطاولة تُكبَّر بـ `gameScale (1.25/1.5)` لا تُمدَّد، متمركزة ضمن `pageMaxWidth`؛ شبكة نهاية الجيم `AdaptiveGrid` ترفع أعمدتها ضمن `contentMaxWidth`؛ portrait مقفول.

---

## 13. ملاحظات أداء وأمان

- **الأداء**: 
  - العجلة 3D + الفيديو أثقل بنود الرسم — `RepaintBoundary` لكل بطاقة، وتجنّب إعادة بناء المصفوفات إلا عند تغيّر `rot`؛ عطّل انتقالات البطاقة أثناء السحب (كما الأصل).
  - «فقط self + المتحدّثون» لهم بلاطات فيديو (`videoByPid`) — أبقِ هذا النموذج لتقليل عدد الـ platform-views.
  - المؤقتات من `startTime` السيرفري (drift-corrected) وتُشتقّ كل tick — لا تثق بعدّاد محلي متناقص عبر إعادة الاتصال.
  - العشوائيات (لا يوجد هنا كثير، لكن إن أُضيفت جسيمات مستقبلاً) تُولَّد مرة في `initState`.
- **الأمان (ثوابت لا تُخرَق)**:
  - **عدم عرض دور لاعب حي أبداً** إلا في `revealRoles` للمضيف؛ اعتمد المصادر الخمسة حصراً؛ قائمة NON_DEATH حرفية.
  - roster يصل منقّى من السيرفر — لا تعتمد على تخزين محلي قد يحمل أدواراً قديمة.
  - **لا XP/RR في نهاية الجيم**؛ لا تسريب نقاط اللاعبين الآخرين (غير موجودة أصلاً في الحمولة).
  - **`luckyDraw`**: أوامر السحب صلاحية ليدر (السيرفر يتحقّق `authStaff` ولوبي فقط)؛ تطبيق اللاعب لا يُصدرها؛ `drawn` لا يُبثّ (سرّية الفائزين حتى الكشف) — لا تحاول استنتاج الفائزين قبل `revealed`.
  - الطاولة مكوّن **عرض سلبي بلا emits** — أي تفاعل (سحب/نقر) محلي بحت لا يغيّر حالة السيرفر، ما يحافظ على أمان «المتفرّج لا يؤثّر».
