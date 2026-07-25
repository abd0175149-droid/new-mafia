# النهار: النقاش، التبرير، التصويت، الديلات، الانسحاب، التعادل، الإقصاء، العمدة، القنبلة
> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

---

## 1. الهدف والنطاق

هذا الملف يغطي **دورة النهار كاملة كما يعيشها اللاعب** داخل الجيم، وهي أكبر شاشة منطقاً في التطبيق كله. الأطوار المشمولة (قيمة `gamePhase`):

- **DAY_DISCUSSION** — طابور المتحدثين، بانر «دورك»، بطاقة المتحدث الحالي، المؤقّت الدائري، وقسم **الاتفاقيات (الديلات)** بكل حالاته.
- **DAY_JUSTIFICATION** — بطاقات المتهمين، مؤقّت التبرير، و**سحب الصوت (الانسحاب/withdrawal)** مع إعادة التصويت عند تجاوز النصف.
- **DAY_VOTING** — الاقتراع بنسختيه (`done` / `rejoined`)، بنوعي المرشّح (`PlayerCandidate` و`DealCandidate`)، والحصر وإخفاء اللاعبين من التصويت، ومنع التصويت للنفس، والأصوات العلنية، والعدّاد، والتصويت التلقائي عند الصفر.
- **DAY_TIEBREAKER** — عرض التعادل وانتظار قرار الليدر، وإعادة التصويت.
- **ELIMINATION_PENDING** — مرحلة عميل فقط (client-only): بطاقات المُقصَين وكشف أدوارهم وبانر «تم إقصاؤك».
- **العمدة (العمدة/Mayor)** — مودال قرار العمدة (على هاتفه فقط)، بانر الكشف للجميع، الشارة الدائمة أثناء التصويت، وصوته المضاعف `mayorVoteWeight`.
- **القنبلة (قنبلة شيخ المافيا / Godfather Bomb)** — كما يراها اللاعب فقط (لا واجهة قرار للاعب — انظر §4.8).

**النطاق يشمل** الأجزاء التالية من الكود الحالي: أجسام أطوار النهار داخل `PlayerPhaseView`، وبطاقة الاقتراع المضمّنة داخل `PlayerFlow` (النسختان)، وطبقات العمدة الثلاث في جذر `PlayerFlow`، ومنطق التصويت والتصويت التلقائي وحساب النافذة الزمنية.

**خارج النطاق** (يُحال إليها فقط): آلة الحالة الجلسية وإعادة الاتصال والـ poll وحارس المرحلة والتخزين ← **20-game-state-core.md**؛ حلقة الطاولة ثلاثية الأبعاد `PhoneSpectatorView` (شرائط المتحدث/المدافع، الطيّ أثناء التصويت، سينمائية كشف الإقصاء) ← **27-spectator-gameover.md**؛ widget بطاقة الدور ← **22-role-cards.md**؛ طور الليل ← **23-night-phase.md**؛ سينمائيات الصباح ← **24-morning-cinematics.md**؛ المفكرة وشات المافيا (مصدر إيموجي الاشتباه على بطاقات الاقتراع) ← **26-notepad-mafia-chat.md**؛ نغمات التنبيه والنبضات الصوتية ← **07-sound-system.md**.

قاعدة التكافؤ: هذا التطبيق **عميل ثانٍ لنفس الـ backend**؛ لا endpoints ولا أحداث socket جديدة. كل النصوص العربية والألوان والمدد منسوخة حرفياً من الكود.

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

| الملف | ما يخصّ هذا الـ spec |
|---|---|
| `C:/Projects/new mafia/unified-mafia/frontend/src/components/PlayerFlow.tsx` | بطاقة الاقتراع `done` (2645–3100، الجوهر 2766–2960) ونسخة `rejoined` (3103–3515، الجوهر 3207–3360)؛ طبقات العمدة: prompt (2119–2170)، banner (2173–2189)، badge (2192–2198)؛ مستمعات العمدة و`sendMayorDecision` (1000–1037)؛ مستمعات التصويت `day:voting-started/vote-update/voting-complete` (1039–1099)؛ تنظيف تغيّر المرحلة (1101–1128)؛ التصويت التلقائي عند الصفر (1447–1474)؛ عدّاد `now` كل ثانية (تعريف الحالة سطر ~287–291). |
| `C:/Projects/new mafia/unified-mafia/frontend/src/components/PlayerPhaseView.tsx` | `DAY_DISCUSSION` (~656–884): الرأس، بانر «دورك»، بطاقة المتحدث، العدّاد الدائري، قائمة الترتيب، قسم الاتفاقيات (733–862)؛ `DAY_JUSTIFICATION` (~900–980): بطاقات المتهمين، مؤقّت التبرير، بطاقة السحب (`handleWithdraw` سطر 566)؛ `DAY_TIEBREAKER` (~982–1003)؛ `ELIMINATION_PENDING` (1006–1046)؛ دوال الديلات `handleCreateDeal`/`handleRemoveDeal` (581–610)؛ منطق reconnect `getLatestMyId/fetchLatestState/pollData` (~120–260). |
| `C:/Projects/new mafia/unified-mafia/frontend/src/components/PhoneSpectatorView.tsx` | شريط المتحدث/المدافع أثناء النهار، الوضع المطويّ `collapsed` أثناء التصويت، سينمائية كشف الإقصاء — **تفاصيلها في 27-spectator-gameover.md**؛ هنا للسياق فقط. |
| `C:/Projects/new mafia/unified-mafia/frontend/src/hooks/useGameState.ts` | نوع `pendingBomb` (سطر 31–36): `{godfatherPhysicalId, godfatherPlayerId, above{physicalId,name,role}|null, below{...}|null}`. |
| `C:/Projects/new mafia/unified-mafia/backend/src/sockets/day.socket.ts` | **للتحقق من العقود فقط** (لا يُنقل — منطق سيرفر): معالج `day:bomb-decision` (1031–1184)، تشغيل القنبلة عند إقصاء العراب (1235–1259)، بثّ `day:bomb-result` للغرفة كلها (1170–1176)، وأحداث العمدة والتصويت. |
| `C:/Projects/new mafia/unified-mafia/frontend/src/app/leader/LeaderDayView.tsx` | قرار القنبلة يصدر من الليدر (`day:bomb-decision` سطر 1308) — **ليس اللاعب**؛ للسياق فقط. |

المصادر التحليلية: `scratchpad/reports/playerflow-b.md`، `scratchpad/reports/phase-views.md`، `scratchpad/sections/core-game.md`.

---

## 3. التبعيات على ملفات الخطة الأخرى

- **20-game-state-core.md** — آلة `Step` (`done`/`rejoined`)، الـ `GameSessionController` الذي يملك الـ socket والحالة، إعادة الاتصال، الـ poll كل 3 ثوانٍ، حارس المرحلة `phaseOverrideRef` (TTL 6000ms)، شبكة الأمان `room:get-my-state` بعد rejoin، `phasePollData` (خصوصاً `round` لقفل الديلات)، ومصفوفة `HapticsService` (أنماط الاهتزاز الثمانية). هذا الملف **مستهلِك** لكل ذلك ولا يعيد تعريفه.
- **04-socket-layer.md** — غلاف `emit` بـ `emitWithAck` وتايم-آوت 15s، و`on` الذي يرجع دالة إلغاء اشتراك، وتيّارات الأحداث المكتوبة.
- **02-models-data-layer.md** — نماذج `Candidate`/`Deal`/`DiscussionState`/`JustificationData`/`WithdrawalState`/`EliminationData`/`MayorPrompt`/`MorningEvent`/`PendingBomb` (المتطلبة أدناه في §8 مرجعها هنا).
- **27-spectator-gameover.md** — تمثيل النهار داخل حلقة `PhoneSpectatorView` (شريط المتحدث/المدافع مع العدّاد، الوضع المطويّ أثناء التصويت، سينمائية كشف الإقصاء بالبطاقات). في الريموت، نسخة `PlayerPhaseView` تُخفي الرأس/بطاقة المتحدث/قائمة الترتيب لأن الحلقة تعرضها.
- **22-role-cards.md** — بطاقة الدور المستخدمة في سينمائية كشف الإقصاء داخل الحلقة (طور الإقصاء في `PlayerPhaseView` يعرض **اسم الدور نصاً فقط**، لا بطاقة).
- **26-notepad-mafia-chat.md** — خريطة `notepadNotes` (pid → `{suspicion}`) التي تُغذّي إيموجي الاشتباه (🟢/🟡/🔴) بجانب أسماء المرشّحين في بطاقة الاقتراع.
- **07-sound-system.md** — نغمات تنبيه الدور (3 نغمات جيبية صاعدة 660→880→1100Hz) ونبضات القلب الزمنية للعدّادات.
- **01-foundation-theme.md** — توكنات الثيم والألوان، و`WindowSizeClass`/`Dimens`/`gameScale`/`ContentConstraint`/`AdaptiveGrid`، وكروم `CircularTimer` المشترك.
- **23-night-phase.md** / **24-morning-cinematics.md** — الأطوار المجاورة (تنظيف الانتقال منها/إليها موثّق في §6).

---

## 4. الواجهة والتجربة تفصيلياً

**لغة التصميم الموحّدة** (كل الطبقات): أسطح شبه سوداء `#050505 / #0a0a0a / #0c0c0c / #111`، أحمر دموي `#8A0303`، ذهبي عتيق `#C5A059` (+ `#E8C97A`, `#D4AF37`, `#b38e4b`/`#b38b47`)، حدود `#222`/`#2a2a2a`/`#333`، نص ثانوي `#808080`/`#888`/`#9a9a9a`، خط عربي **Amiri serif** للعناوين، **JetBrains Mono** للأرقام والملصقات الإنجليزية. كل الواجهة عربية RTL (`Directionality(TextDirection.rtl)`) مع جزر LTR محددة. أنيميشن الدخول framer-motion → مكافئات `flutter_animate`/`AnimationController`.

### 4.1 توزيع الرسم — أي widget يرسم أي طور

| gamePhase | الـ widget المسؤول | ملاحظة |
|---|---|---|
| `DAY_DISCUSSION` | `PlayerPhaseView` | §4.2 |
| `DAY_JUSTIFICATION` | `PlayerPhaseView` | §4.3 |
| `DAY_VOTING` | **`PlayerFlow` مباشرة** (بطاقة اقتراع مضمّنة، نسختان) — `PlayerPhaseView` يرجع `null` لهذا الطور | §4.4 |
| `DAY_TIEBREAKER` | `PlayerPhaseView` | §4.5 |
| `ELIMINATION_PENDING` | `PlayerPhaseView` (طور عميل فقط) | §4.6 |
| العمدة (طبقات فوقية) | جذر `PlayerFlow` (Stack) — تظهر أثناء/بعد التصويت | §4.7 |
| القنبلة | **لا widget للاعب** — انظر §4.8 | — |

`PlayerPhaseView` يُرسم داخل شاشة اللعب عندما `gamePhase` مضبوطة وليست `DAY_VOTING` ولا `LOBBY` (تلك يتكفّل بها `PlayerFlow`). في الريموت (`isRemote`) تُركّب أيضاً حلقة `PhoneSpectatorView` (مع `collapsed` أثناء `DAY_VOTING`).

---

### 4.2 DAY_DISCUSSION — النقاش وطابور المتحدثين والاتفاقيات

جذر الطور: `motion.div` دخول fade + `y:15→0`.

**الرأس** (يُخفى عند `isRemote`): 🎤 (`text-3xl`) + «مرحلة النقاش» (ذهبي `#C5A059`، Amiri، `text-lg` bold).

**بانر «دورك»** (`AnimatePresence`؛ دخول/خروج opacity+scale 0.8 + `y:-20`) — يظهر فقط عندما `discussionState.currentSpeakerId === myId`:
- بطاقة تدرّج ذهبي `from-[#C5A059]/25 to-[#C5A059]/10`، حد ذهبي 2px، `rounded-2xl`، توهّج `box-shadow: 0 0 30px rgba(197,160,89,0.3)`.
- أيقونة تنبض `scale [1,1.2,1]` 1.5s لانهائي: 🎙️ عادةً، و🔇 عند انتهاء الوقت.
- النص العادي: **«دورك في النقاش!»** / السطر الفرعي **«تحدّث الآن أمام الجميع»**.
- عند وصول العدّاد صفراً أثناء `status==='SPEAKING'`: **«انتهى وقتك!»** / **«يُرجى التوقف عن الكلام»**.

**بطاقة المتحدث الحالي** (تُخفى عند `isRemote`؛ `key` = معرّف المتحدث كي تعيد أنيميشن `scale 0.9→1` عند تغيّره): بطاقة تدرّج، تمييز أقوى لو المتحدث هو أنا (حد ذهبي صلب + توهّج) وإلا حد ذهبي 30%. دائرة `w-16 h-16` بـ `#{physicalId}` (ذهبي، `font-black`)؛ الاسم (أبيض bold `text-lg`، fallback «لاعب #id»)؛ سطر الحالة: **«انتهى الوقت»** / **«يتحدث الآن»** / **«بالانتظار»**.

**العدّاد الدائري** (فقط أثناء `status==='SPEAKING'` والعدّاد غير null): حلقة `w-16 h-16`, `viewBox 36`, `r=15.5` (المحيط ≈ 97.4)، مُدارة `-90°`؛ المسار الخلفي `#1a1a2e`؛ لون التقدّم: أحمر `#ef4444` عند ≤5s، كهرماني `#f59e0b` عند ≤10s، وإلا ذهبي `#C5A059`؛ `strokeDasharray = (remaining/totalTime) * 97.4`؛ انتقال CSS 0.5s على `dasharray`. الأرقام الوسطى `font-mono font-black`: أحمر + `animate-pulse` عند ≤5s، كهرماني عند ≤10s، أبيض غير ذلك. بجانبه إيموجي 🎙️/🔇 (`text-2xl`).

**الحالة الفارغة** (يُخفى عند `isRemote`، لا معلومات متحدث): **«بانتظار بدء النقاش...»** (`#666`، mono، موسّط).

**قسم الاتفاقيات (الديلات)** — للأحياء فقط (`!isPlayerDead`)، في `DAY_DISCUSSION` حصراً:
- **زر الفتح**: بعرض كامل، «🤝 الاتفاقيات» + pill عدّاد `{deals.length}/3`، حد ذهبي 30%، نص ذهبي، خلفية ذهبية/5، hover ذهبي/10، `rounded-xl`.
- **الطبقة المنزلقة (bottom sheet)** عند `dealsSheetOpen`: تغطية `fixed inset-0 z-50 bg-black/70 backdrop-blur-sm`، محاذاة سفلية؛ نقر الخلفية يغلق؛ الورقة: عرض كامل، `bg-[#0c0b09]`، حد علوي `#1f1a12`، `rounded-t-2xl`, `p-4`, `max-h-[82%] overflow-auto`، مع `stopPropagation` داخلها. رأس الورقة: «🤝 الاتفاقيات الثنائية ({n}/3)» (ذهبي، Amiri) + زر ✕ إغلاق (`#808080`).
- **الحالات الأربع داخل الورقة**:
  - (أ) **قفل الجولة الأولى** (`pollData?.round === 1`): بطاقة معلومات — «🤝 ميزة الديل (Deals)» + «🔒 الاتفاقيات غير متاحة في الجولة الأولى.» (سطر جديد) «سيبدأ تفعيل ميزة الديل تلقائياً بدءاً من الجولة الثانية.».
  - (ب) **لديّ اتفاقية** (توجد اتفاقية `initiatorPhysicalId === myId`): بطاقة نجاح خضراء (`bg-green-500/10 border-green-500/30`): «🤝 تم إبرام اتفاقيتك بنجاح!» + «أنت شريك الآن مع: **{اسم الشريك}**» (fallback «لاعب #id»)؛ زر إلغاء بعرض كامل (أحمر `bg-red-500/10 border-red-500/20 text-red-400`): «❌ إلغاء الاتفاقية»، ويظهر «جاري الإلغاء...» أثناء `dealRemoving` مع `opacity-40`؛ سطر خطأ أحمر «❌ {dealError}» إن وُجد؛ بطاقة تحذير مخاطرة (أحمر، `text-[11px]` bold): «⚠️ مخاطرة: في حال تم إقصاء شريكك في الاتفاقية وكان مواطناً، فسيتم إقصاؤك معه تلقائياً!».
  - (ج) **بلوغ الحد الأقصى** (`deals.length >= 3`): بطاقة ذهبية `bg-[#C5A059]/5 border-[#C5A059]/10`: «🔒 تم الوصول للحد الأقصى للاتفاقيات في هذه الجولة (3/3)» + «لا يمكن إرسال اتفاقيات جديدة حالياً».
  - (د) **نموذج الإنشاء**: `select` (خلفية `white/5`, حد `white/10`, focus ذهبي) يسرد كل `votingPlayersInfo` عدا نفسي — تسمية الخيار «لاعب #{id} - {name}»، والخيار **معطّل** بلاحقة « (مستهدف 🔒)» إن استهدفته اتفاقية قائمة؛ خيار placeholder «-- اختر لاعباً لإبرام اتفاقية معه --». زر التأكيد بعرض كامل، تدرّج ذهبي `from-[#C5A059] to-[#b38e4b]`، نص أسود bold «🤝 إبرام اتفاقية»، معطّل (`opacity-40`) بلا اختيار أو أثناء الإرسال؛ أثناء الإرسال يعرض spinner أسود 4×4 بدل النص؛ pill خطأ «❌ {dealError}» أحمر.

  > ملاحظة Flutter: `DropdownMenuItem` لا يدعم التعطيل أصلاً — استخدم قائمة مخصصة أو أبقِ الخيار مرئياً معطّلاً بصرياً مع لاحقة «(مستهدف 🔒)» وارفض النقر (§9).

**قائمة ترتيب النقاش** (تُخفى عند `isRemote`؛ فقط إن وُجد متحدثون): عنوان «ترتيب النقاش» (`text-[10px]` `#666` موسّط). كل صف: رقم الترتيب (mono، ذهبي إن كان الحالي وإلا `#555`) + الاسم؛ الحالات: **الحالي** `bg-[#C5A059]/15` + حد ذهبي/30، نص أبيض bold، ● ذهبية نابضة يميناً؛ **المنتهي** (`status==='done'`) `bg-white/5 opacity-50`، خط رمادي مشطوب، ✓ خضراء؛ **أنا** (غير الحالي/المنتهي) خلفية/حد ذهبيان، نص ذهبي bold + لاحقة « (أنت)»؛ الافتراضي `bg-white/5` نص `#999`.

**تنبيه الدور (my-turn alert)** — عند انتقال `discussionState.currentSpeakerId` إليّ: اهتزاز `[200,100,200,100,300]` (try/catch؛ Android) + **3 نغمات WebAudio جيبية صاعدة** 660→880→1100Hz (gain 0.3 → 0.01، مدد 0.15/0.15/0.2s عند إزاحات 0/0.2/0.4s؛ تُغلق AudioContext بعد 1s) — مصمّمة لتعمل حتى على iOS. في Flutter: أصل صوتي مسبق التوليد + `HapticsService` (انظر 07، 20).

**نسخة الريموت** (`isRemote`): تُخفي الرأس وبطاقة المتحدث الحالي والعدّاد الدائري وقائمة الترتيب — الحلقة `PhoneSpectatorView` تعرضها (27). يبقى قسم الاتفاقيات ظاهراً (للأحياء).

---

### 4.3 DAY_JUSTIFICATION — التبرير ومؤقّتاته والانسحاب

**نسخة الريموت** (`isRemote`): شريط واحد مضغوط (الحلقة تعرض الباقي): pill بحد أحمر (`border-red-500/25 bg-red-950/15`, `text-red-200`, 12px): «⚖️ يُدافع الآن: **{name|#id}** — يمكنك سحب صوتك بعد انتهاء الدفاع». يُرسم فقط عند وجود متهم.

**النسخة المحلية**:
- الرأس: ⚖️ + «مرحلة التبرير» (ذهبي، Amiri، `text-lg` bold).
- **بطاقات المتهمين** (واحدة لكل `justificationData.accused`، دخول `scale 0.9→1`): بطاقة تدرّج أحمر `from-red-500/15 to-red-900/10`, حد أحمر/30, `rounded-2xl`؛ أفاتار دائري `w-16 h-16` (صورة `info.avatarUrl` بـ `object-cover lazy` وإلا `#{id}` أحمر)؛ الاسم (أبيض bold؛ fallback‏ `info.name → a.name → لاعب #id`)؛ «{topVotes} صوت ضده» (أحمر `text-xs` bold)؛ إن `a.canJustify`: «🎙️ يبرر الآن...» (`text-yellow-500 text-xs`).
- **pill مؤقّت التبرير** (عند `justTimer > 0`): pill `bg-black/40`، حد ذهبي/20، `rounded-full`: «⏱» + «{justTimer}s» (`text-2xl font-black` mono؛ أحمر + `pulse` عند ≤10).

**بطاقة السحب (Withdrawal)** — تظهر (في النسختين المحلية والريموت) عندما:
`(withdrawalActive || justTimer === 0 || justificationData?.timerFinished) && iVotedForAccused && !isPlayerDead`
حيث `iVotedForAccused` = معرّفي ∈ `justificationData.votersForAccused` (مقارنة نصية لتحمّل انزياح الأنواع). دخول `y:20→0`. بطاقة تدرّج أزرق `from-blue-500/15 to-blue-900/10`, حد أزرق/30:
- «أنت صوّتت على هذا اللاعب» (`text-blue-300` bold).
- «هل تريد سحب صوتك؟ إذا سحب أكثر من النصف تُعاد عملية التصويت» (`#888 text-xs`).
- التقدّم: «{count}/{needed} سحبوا أصواتهم» (mono؛ `needed = withdrawalNeeded || ceil(votersForAccused.length/2)`).
- الزر «🗳️ سحب صوتي» (أزرق، `py-3 px-8`, `rounded-xl`, hover أزرق/30) — بعد النجاح يُستبدل بصندوق أخضر «✓ تم سحب صوتك» (`text-green-400` mono).
- السحب أحادي: يُمكّن فقط إذا `!hasWithdrawn`؛ يُطلق `player:withdraw-vote {physicalId}`؛ على ack success يضبط `hasWithdrawn` ويحدّث `count`/`needed`. حارس ضد النقر المزدوج بفحص `hasWithdrawn`.

**التبرير على الحلقة (ريموت)**: شريط المدافع مع العدّاد التنازلي — انظر 27.

---

### 4.4 DAY_VOTING — الاقتراع (نسختا `done` و`rejoined`)

`PlayerFlow` يرسم البطاقة مباشرة. **النسختان ~90% متطابقتان مع فروق سلوكية في التصويت (مرئية للّعب — تُنقل حرفياً)**. تُبنى كـ widget واحد ببارامتر `isRejoined`.

#### 4.4.1 حالة التحميل (لا مرشّحون بعد)
`gamePhase === 'DAY_VOTING' && votingCandidates.length === 0`:
- **`done`**: `PhaseLoading(icon: "🗳️", text: "جاري تحميل التصويت...")` (spinner 32px حد ذهبي/30 بقمة ذهبية، caption mono — تفاصيل المكوّن في 01).
- **`rejoined`**: كتلة inline (دخول opacity)، `py-10`: 🗳️ (`text-3xl`) + spinner `w-8 h-8` (حد `#C5A059/30`, قمة `#C5A059`, `animate-spin`) + «جاري تحميل التصويت...» (`text-[#C5A059] text-sm` mono).

#### 4.4.2 رأس الاقتراع
جذر: `motion.div` دخول `opacity + y:20→0` مدة 0.5s.
- 🗳️ (`text-3xl`, `mb-2`).
- العنوان «مرحلة التصويت» (Amiri, `font-black`, `#C5A059`): **`done`** بحجم `text-2xl`، **`rejoined`** بحجم `text-xl`.
- **سطر الحالة** (mono؛ `done`: `text-xs`؛ `rejoined`: `text-[10px] uppercase tracking-[0.15em]`):
  - **مشترك**: إن `isPlayerDead` → «مشاهدة فقط — أنت مُقصى».
  - **`done`** (عند التصويت `myVote !== null`): إن النافذة مفتوحة `voteWindowOpen` → «يمكنك تغيير تصويتك خلال {secondsLeft} ثانية» (كهرماني `text-amber-500` bold)؛ وإلا → «✅ تم التصويت (مغلق)» (`text-green-500` bold).
  - **`rejoined`** (عند `myVote !== null`): «✅ تم التصويت — اضغط لاعب آخر للتغيير».
  - **مشترك** (لم يُصوّت): إن `votingCountdown === 0` → «❌ لم تقم بالتصويت» (`#8A0303` bold)؛ وإلا → «صوّت ضد اللاعب المشتبه».

#### 4.4.3 العدّاد الكبير
`votingCountdown !== null && > 0`: نص `text-3xl font-black font-mono` موسّط: «⏱ {votingCountdown}ث». أحمر `text-red-500 animate-pulse` عند ≤10، وإلا ذهبي `#C5A059`. `key` يتبدّل `'red'`/`'gold'` (يفرض remount)؛ `transform: translateZ(0)` (تلميح GPU — في Flutter `RepaintBoundary`).

#### 4.4.4 شريط التقدّم (يختلف بين النسختين)
مسار `h-1.5 bg-[#1a1a1a] rounded-full`؛ امتلاء `motion.div` بانتقال 0.5s.
- **`done`**: تسميتان `{totalVotesCast} صوت` (يسار) / `{maxVotes} أعلى` (يمين، `maxVotes = max(candidate.votes)`)؛ الامتلاء `min(100, totalVotesCast / max(1, votingCandidates.length) * 100)%`؛ تدرّج `linear-gradient(90deg, #C5A059, #E8C97A)`. عند `votingComplete` → سطر «✓ اكتمل التصويت — بانتظار الليدر» (`#C5A059 text-[10px]` mono).
- **`rejoined`**: تسميتان `VOTES: {totalVotesCast}` / `✅ COMPLETE` أو `⏳ IN PROGRESS` (حسب `votingComplete`)؛ الامتلاء `votingPlayersInfo.length > 0 ? totalVotesCast / votingPlayersInfo.length * 100 : 0`؛ تدرّج `linear-gradient(90deg, #C5A059, #D4AF37)`.

#### 4.4.5 قائمة بطاقات المرشّحين
حاوية `grid grid-cols-1 gap-4 px-1 max-h-[55vh] overflow-y-auto pb-4` (في Flutter `ListView` داخل `ConstrainedBox`؛ العدد ≤ 27). markup البطاقة متطابق في النسختين.

كل بطاقة `motion.button`، `key = candidate.id || 'c-'+index`:
- **whileTap** `scale 0.95` فقط عند `!isPlayerDead && !isMyChoice`؛ `disabled={isPlayerDead}`.
- الحاوية `relative flex flex-col items-center p-3 rounded-2xl border-2 w-full overflow-hidden`:
  - **مختارة** (`myVote === index`): `border-[#C5A059] bg-gradient-to-b from-[#C5A059]/15 to-[#C5A059]/5 shadow-[0_0_20px_rgba(197,160,89,0.2)]`.
  - **غير مختارة**: `border-[#222] bg-[#111] hover:border-[#C5A059]/30 active:bg-[#1a1a1a]`.
- **الأفاتار**: دائرة `w-[72px] h-[72px]`, حد `border-2 border-[#333]`, خلفية `#1a1a1a`؛ صورة `avatarUrl` (`object-cover`) أو fallback `#{candidate.targetPhysicalId}` (`text-3xl font-black text-[#C5A059] font-mono`). عند الاختيار: طبقة `absolute inset-0 bg-[#C5A059]/40 backdrop-blur-sm` + ✅ (`text-3xl`) بدخول `scale 0→1`.
- **pill المقعد**: «مقعد #{candidate.targetPhysicalId}» (`text-sm font-mono text-[#C5A059] tracking-widest`, خلفية `black/40`, حد ذهبي/20, `rounded-full`).
- **الاسم**: أبيض `text-xl font-bold` (fallback «لاعب {targetPhysicalId}»).
- **إيموجي الاشتباه** (بجانب الاسم، إن `notepadNotes[pid].suspicion !== 'none'`): `safe`→🟢، `suspect`→🟡، وإلا 🔴 (خلفية `black/50`, حد `#333`). المصدر: خريطة المفكرة (26).
- **شارة DEAL** (`candidate.type === 'DEAL'`): صندوق `bg-red-500/20 border-red-500/30 rounded-md`: «🤝 ديل من:» (`text-red-500 text-xs` bold) + اسم المبادر «{initiatorInfo?.name || 'لاعب '+initiatorPhysicalId}» + `#{initiatorPhysicalId}` (`font-mono text-red-400`).
- **عدّاد الأصوات**: pill `bg-black/30 rounded-full`: «{candidate.votes || 0}» (`text-sm font-black text-[#C5A059]`) + «صوت» (`text-[10px] text-[#808080]`).
- **رقائق المصوّتين** (كل من `playerVotes` قيمته = index): صف `flex-wrap` بحد علوي `#333/50`؛ كل rip: pill `bg-[#8A0303]/20 border-[#8A0303]/40 rounded-full`: رقم المصوّت (`font-black text-[#ff4444]`) + الاسم مقصوصاً (`truncate max-w-[50px] text-gray-300`).
- **شارة «أنت»** (إن `candidate.targetPhysicalId === myPhysicalId`): `absolute top-1.5 right-1.5` pill `bg-[#222] text-[#808080] text-[10px]` mono «أنت».

#### 4.4.6 نوعا المرشّح
- **PlayerCandidate**: `{ id?, targetPhysicalId:int, votes:int }` — مرشّح لاعب عادي.
- **DealCandidate**: نفس ما سبق + `{ type:'DEAL', initiatorPhysicalId:int }` — صفقة إعدام بين مبادر وهدف؛ تُرسم بشارة «🤝 ديل من:». التمييز الوحيد المستخدم في العرض: `candidate.type === 'DEAL'`.

#### 4.4.7 الحصر وإخفاء اللاعبين
- قائمة `votingCandidates` **مقيّدة أصلاً من السيرفر** (مجموعة فرعية من اللاعبين — المتهمون/المرشّحون فقط)؛ الإخفاء (`hiddenPlayersFromVoting` في `votingState` السيرفري) يُطبَّق سيرفرياً، فلا واجهة لاعب مخصّصة له — يتجلّى فقط بكون بعض اللاعبين غير موجودين في القائمة. لا تخترع UI لعرض المخفيّين.
- **منع التصويت للنفس**: النقر على بطاقتك (`isSelf`) رجوع صامت.

#### 4.4.8 منطق التصويت (الفروق السلوكية الحرجة)
مشترك في الضغط: `emit('player:cast-vote', { roomId, physicalId, candidateIndex: index })`؛ على `res?.success`: `setMyVote(index)` + `navigator.vibrate(100)` (في Flutter `HapticsService`/`vibration` 100ms). **بلا تحديث تفاؤلي** — الـ UI مربوط بالـ ack. حارس `voteSubmitting` أثناء الطلب.
- **`done` — نافذة تغيير 10 ثوانٍ**:
  - `timeSinceVote = lastVoteTime ? now - lastVoteTime : 0` (حيث `now` حالة تُحدَّث كل ثانية).
  - `voteWindowOpen = lastVoteTime !== null && timeSinceVote < 10000`.
  - `secondsLeft = max(0, 10 - floor(timeSinceVote/1000))`.
  - `canVote = (myVote === null || voteWindowOpen) && (votingCountdown === null || votingCountdown > 0)`.
  - حرّاس النقر (رجوع صامت): `isPlayerDead || isMyChoice || voteSubmitting || !canVote || isSelf`.
  - على النجاح: `setMyVote(index)` + **`setLastVoteTime(Date.now())`** (يعيد فتح نافذة الـ10s) + اهتزاز.
- **`rejoined` — تغيير حر حتى الاكتمال**:
  - حرّاس النقر: `isPlayerDead || isMyChoice || voteSubmitting || votingComplete || isSelf` (لا نافذة زمنية).
  - على النجاح: `setMyVote(index)` + اهتزاز، **بلا `setLastVoteTime`**.

#### 4.4.9 التصويت التلقائي عند الصفر (حرج — يجب نقله)
عندما `votingCountdown === 0 && myVote === null && !isPlayerDead && gamePhase === 'DAY_VOTING'`:
- `voteIndex = votingCandidates.findIndex(c => c.targetPhysicalId === myPhysicalId)`.
- إن `voteIndex === -1 && votingCandidates.length > 0` → `voteIndex = 0` (لأن اللاعب قد لا يكون مرشحاً بسبب ديل أو حصر تصويت — يُختار أول مرشّح لتفادي تعليق الجولة).
- إن `voteIndex !== -1`: `emit('player:cast-vote', { roomId, physicalId, candidateIndex: voteIndex, autoVote: true })`؛ على النجاح `setMyVote(voteIndex)` + `setLastVoteTime(Date.now())`.
- **عدم نقل هذا = تعليق الجولات لمستخدمي Flutter.**

الأصوات علنية للجميع عبر خريطة `playerVotes` (pid → candidateIndex). استعادة الصوت عند reconnect من `playerVotes[myPhysicalId]` (§6).

---

### 4.5 DAY_TIEBREAKER — التعادل وإعادة التصويت

`PlayerPhaseView`، دخول موسّط:
- ⚖️ (`text-4xl`) + «تعادل في الأصوات» (`text-yellow-400`, Amiri).
- رقائق المتعادلين (flex-wrap, gap-3): كل rip `bg-yellow-500/10 border-yellow-500/30 rounded-xl`: `#{id}` (`text-yellow` `font-black` `text-lg`) + الاسم (أبيض `text-xs`) + «{votes} صوت» (أصفر `text-xs` bold). المصدر `day:tie → tiedCandidates[{targetPhysicalId, votes}]`.
- التذييل: «بانتظار قرار الليدر...» (`#9a9a9a text-xs` bold).

**إعادة التصويت**: عندما يقرّر الليدر إعادة الاقتراع، يصل حدث `day:voting-started` جديد (§7) فتنتقل الشاشة تلقائياً إلى بطاقة الاقتراع (§4.4) بمرشّحين محدّثين، ويُصفّر `myVote`/`votingComplete`/`playerVotes`. لا زر «إعادة تصويت» على جانب اللاعب — القرار للّيدر.

---

### 4.6 ELIMINATION_PENDING — الإقصاء وكشف الدور

**طور عميل فقط**: الـ poll يحوّل `DAY_ELIMINATION` القادمة من السيرفر إلى `ELIMINATION_PENDING` محلياً (انظر 20). `PlayerPhaseView`، دخول opacity، `py-4`:
- الرأس: 💀 (`text-4xl`) + «إقصاء» (`text-red-400`, Amiri, `text-lg` bold).
- **بطاقة لكل مُقصى** (`eliminationData.eliminated: number[]`، دخول `scale 0.8→1`): بطاقة `rounded-2xl p-5 mx-2 mb-3` موسّطة — **إن كنتُ أنا** `bg-red-500/20 border-red-500/50`، وإلا `bg-white/5 border-white/10`؛ دائرة `w-16 h-16 bg-red-500/20 border-2 border-red-500/50` بـ `#{pid}` (`text-2xl font-black text-red-400`)؛ الاسم (أبيض bold `text-lg`، fallback «لاعب #{pid}»).
- **كشف الدور**: بعد `eliminationRevealed === true` ووجود مدخل مطابق في `revealedRoles[{physicalId, role}]` → نص الدور يظهر بـ fade (`text-[#C5A059] text-sm font-mono tracking-wider`). قيمة `rev.role` نصية خام (اسم الدور كما يرسله السيرفر).
- **بانر «تم إقصاؤك»** (إن `eliminated.includes(myId)`): بطاقة `scale 0→1` `bg-red-500/20 border-red-500/40 rounded-xl p-4`: «❌ تم إقصاؤك!» (`text-red-400` bold `text-lg`).
- **اهتزاز الإقصاء**: على `day:elimination-revealed` إن كنتُ ضمن `eliminated[]` → اهتزاز `[200,100,200]`.

**سينمائية الكشف على الحلقة** (`PhoneSpectatorView`، ريموت): تحويل focus → دوران للبطاقة (650ms) → قلب لوجه الدور (ثبات 2.6s) → تبقى مقلوبة + توسيم ميت + فجوة 350ms → التالي. تفاصيلها في 27.

---

### 4.7 العمدة — prompt القرار + بانر الكشف + الشارة الدائمة

ثلاث طبقات في جذر `PlayerFlow` (Stack)، تظهر أثناء/بعد التصويت.

#### 4.7.1 مودال قرار العمدة (`mayorPrompt` — هاتف العمدة فقط)
تغطية `fixed inset-0 z-[85] bg-black/90 backdrop-blur-md`, `dir="rtl"`, دخول opacity. البطاقة `max-w-sm rounded-2xl p-5`, حد `border-2 border-[#C5A059]`, توهّج `shadow-[0_0_40px_rgba(197,160,89,0.3)]`, خلفية `linear-gradient(170deg,#1d160c,#0f0b06)`, دخول `scale 0.9→1, y:24→0`:
- 🎩 (`text-4xl`, موسّط).
- «أنت العمدة — لحظة القرار» (موسّط، `#C5A059 font-black text-lg`).
- سطر النتيجة (`text-[11px] text-[#9a8f7d]`): «نتيجة التصويت: إعدام **{X}** ({topVotes} أصوات)» حيث `{X}` بلون `#ff6b64`:
  - إن `winner.type === 'DEAL'` → «صفقة #{initiatorPhysicalId} ← #{targetPhysicalId}».
  - وإلا → «#{targetPhysicalId} {targetName}».
- سطر العدّاد (`text-[10px] text-[#655c4e]`): «⏳ {mayorPromptLeft} ثانية — وبعدها يحسم الموجّه». **العدّاد إرشادي فقط — انتهاؤه لا يقرّر شيئاً** (الليدر خطّ الرجعة).
- **ثلاثة أزرار مكدّسة** (`space-y-2`)، كلها `disabled={mayorSending}` مع `opacity-50`:
  - **REVOTE** (`py-3 rounded-xl font-bold text-white text-sm`, تدرّج `linear-gradient(135deg,#3b6fd4,#2b4f9e)`, حد `#4f8ef7`): «🔄 أكشف نفسي — إلغاء الإعدام وتصويت جديد على الجميع» → `sendMayorDecision('REVOTE')`.
  - **POSTPONE** (تدرّج `linear-gradient(135deg,#7a4b8f,#5b3570)`, حد `#9b6dd6`): «🌙 أكشف نفسي — تأجيل: لا موت اليوم» → `sendMayorDecision('POSTPONE')`.
  - **PASS** (`py-2.5 rounded-xl text-sm`, حد `#4a3f31`, نص `#9a8f7d`): «🤐 أبقى مخفيّاً — نفّذوا الإعدام» → `sendMayorDecision('PASS')`.
- التذييل (`text-[10px] text-[#9a9a9a]`): «الكشف دائم للجميع + صوتك ×{voteWeight||2} فوراً + القدرة تُستهلك (مرّة واحدة)».

#### 4.7.2 بانر كشف العمدة (`mayorBanner` — لكل اللاعبين)
`fixed top-4 inset-x-4 z-[84]`, `dir="rtl"`, دخول `opacity + y:-30→0`, خروج `y:-30`، **يختفي تلقائياً بعد 8000ms**. البطاقة `max-w-sm rounded-2xl px-4 py-3`, حد `#C5A059`, توهّج `shadow-[0_0_30px_rgba(197,160,89,0.25)]`, خلفية `linear-gradient(170deg,#1d160c,#0f0b06)`:
- السطر 1 (`#C5A059 font-black text-sm`): «🎩 العمدة يكشف نفسه: #{physicalId} {name}».
- السطر 2 (`#9a8f7d text-[11px]`): نص القرار — `REVOTE` → «أُلغي الإعدام — تصويت جديد على الجميع»؛ وإلا → «أُلغي الإعدام — لا موت اليوم» — ثم « • صوته يُحسب ⚖️×{voteWeight||2}».

#### 4.7.3 الشارة الدائمة (أثناء التصويت)
عند `gamePhase === 'DAY_VOTING' && mayorRevealedId !== null && !mayorBanner`: pill `fixed top-3 left-1/2 -translate-x-1/2 z-[40]`, `text-[10px]`, حد `#C5A059/60`, نص `#C5A059`, خلفية `#151007/90`:
- للعمدة نفسه (`mayorRevealedId === myPhysicalId`): «⚖️ أنت العمدة — صوتك يُحسب ×{mayorWeight}».
- للآخرين: «🎩 العمدة #{mayorRevealedId} — صوته ×{mayorWeight}».

#### 4.7.4 منطق العمدة والصوت المضاعف
- `mayorWeight` (اسم القيمة في الحالة) = `mayorVoteWeight` الآتي من السيرفر؛ افتراضي **2**. يُضبط من `day:mayor-window.voteWeight` و`day:mayor-revealed.voteWeight`.
- فتح الـ prompt: على `day:mayor-window` **فقط إذا `data.forMayor === true`** (البثّ الموثوق للّيدر/العرض لا يفتح prompt)؛ يضبط `mayorPromptLeft = data.timeoutSeconds || 30` + اهتزاز `[120,80,120,80,240]`.
- عدّاد `mayorPromptLeft`: `setInterval` كل ثانية ينقص حتى 0 (إرشادي).
- `sendMayorDecision(decision)`: حارس `mayorSending` ضد الضغط المزدوج؛ `await emit('day:mayor-decision', { roomId, decision })` ثم إغلاق الـ prompt؛ **الأخطاء تُبتلع صمتاً** (الليدر ينفّذ يدوياً). ثم `mayorSending = false`.
- على `day:mayor-window-closed` → إغلاق الـ prompt. على `day:mayor-revealed` → إغلاق الـ prompt + ضبط `mayorRevealedId`/`mayorWeight` + إظهار البانر 8s.

---

### 4.8 القنبلة (قنبلة شيخ المافيا) — كما يراها اللاعب

**حقيقة تكافؤ حاسمة: لا توجد واجهة قرار قنبلة للّاعب، ولا سينمائية قنبلة على هاتف اللاعب.** آلية القنبلة:
1. عند إقصاء **العراب (GODFATHER)** بالتصويت، وإذا `config.bombEnabled !== false`، يضبط السيرفر `pendingBomb` بالجارين المجاورين (`above`/`below` بالمقعد).
2. **الليدر** (وليس اللاعب) يقرّر عبر `day:bomb-decision { roomId, eliminateAbove, eliminateBelow }` (من `LeaderDayView`).
3. **شاشة العرض الكبيرة** (`DisplayDayView`) تعرض `BombCeremony` عند `day:bomb-result` («قنبلة شيخ المافيا» / «GODFATHER BOMB ACTIVATED» / «💣 ضحايا القنبلة»). هذه تخصّ عميل العرض — انظر 24/27 لا هذا الملف.
4. **هاتف اللاعب**: العميل الويب الحالي **لا يستمع** إلى `day:bomb-result`. يعيش اللاعب أثر القنبلة هكذا:
   - إن كان اللاعب هو العراب المُقصى → يرى إقصاء نفسه عبر `ELIMINATION_PENDING` (§4.6).
   - إن كان ضحية قنبلة (الجار الأعلى/الأدنى) → يتحوّل إلى ميت عبر **الـ poll كل 3 ثوانٍ** (`room:get-my-state` يعيد `isAlive=false`) → حالة الموت في شاشة اللعب (بطاقة مقلوبة قسراً grayscale + «تم إقصاؤك» — تفاصيلها في 20/22).
   - بقية اللاعبين: يرون موت الضحايا عبر مزامنات الحالة اللاحقة وحالات الموت على الحلقة (27).

**تكافؤ Flutter**: **لا ترسم سينمائية قنبلة على هاتف اللاعب.** تحسين اختياري (خارج تكافؤ الويب الحالي — علّم عليه صراحة إن نُفّذ): يمكن للاعب الاشتراك في `day:bomb-result` لتحديث حالة الموت المحلية أسرع من الـ poll، دون أي سينمائية. عقد `day:bomb-result` موثّق في §7 للاستخدام المستقبلي فقط.

---

## 5. التكيّف مع الشاشات 6→11 إنش (إلزامي)

الاستراتيجية الكاملة (Window Size Classes: compact < 600dp، medium 600–840dp، expanded > 840dp) وتوكناتها (`pagePadding`, `contentMaxWidth`, `gameScale`, `AdaptiveGrid`, `ContentConstraint`, `dialogMaxWidth`, `bottomSheetMaxWidth`) موثّقة في **01-foundation-theme.md §5**. الاتجاه portrait مقفول. تخصيص هذه الشاشة:

**compact (< 600dp) = الـ PWA حرفياً**: عمود واحد، `grid-cols-1` لقائمة المرشّحين، paddings 16، نفس الأحجام، لا اجتهاد.

**medium (600–840dp)**:
- **قائمة المرشّحين**: عمودان عبر `AdaptiveGrid(tileMin: gridTileMinWidth=110)` بدل عمود واحد، داخل `ContentConstraint(contentMaxWidth=640)` ومتمركزة. أزرار البطاقات تكبر لمساً: **min-height ≥ 56**.
- **نصوص الأطوار** (النقاش/التبرير/التعادل/الإقصاء): محتوى داخل `ContentConstraint(640)`.
- **العدّادات الدائرية** (النقاش/التبرير) والعدّاد الكبير «⏱ {n}ث» ورقم المقعد الذهبي في البطاقة: تُضرب في **`gameScale = 1.25`** (تُكبَّر ولا تُمدَّد). أفاتار المرشّح 72px × 1.25.
- **الطبقة المنزلقة للاتفاقيات**: `bottomSheetMaxWidth = 640` متمركزة.
- **قسم الديلات + قائمة الترتيب**: داخل `ContentConstraint(640)`.

**expanded (> 840dp)**:
- **قائمة المرشّحين**: عمودان بحد أقصى داخل `contentMaxWidth = 720` (لا تزيد الأعمدة عن 2 حفاظاً على قابلية القراءة)، أزرار min-height ≥ 56، وسقف الصفحة `pageMaxWidth = 960` متمركز مع خلفية أجواء تغطي كامل الشاشة الفيزيائية `#050505`.
- **`gameScale = 1.5`**: العدّادات الدائرية، العدّاد الكبير، رقم المقعد، أفاتار المرشّح، أيقونات الأطوار الدرامية (🗳️/💀/⚖️ في العناوين).
- **بطاقة اقتراع فردية لا تُمدَّد أبداً لعرض 900dp** — تبقى ضمن `contentMaxWidth` ومتمركزة.

**مشترك لكل الفئات**:
- **طبقات العمدة لا تتبع عرض الشاشة**: مودال القرار = `dialogMaxWidth` ثابت (448/448/512) ومتمركز، لا يتمدد. البانر `max-w-sm` متمركز. الشارة الدائمة pill صغيرة متمركزة أعلى.
- الأنيميشنات والمدد **لا تتغير** بين الفئات (نافذة الـ10s، القلب، النبض، البانر 8s).
- قائمة المرشّحين محدودة الارتفاع (`max-h-[55vh]` مكافئ) قابلة للتمرير الداخلي؛ الصفحة نفسها لا تمرّر أفقياً.

---

## 6. المنطق والتدفقات

### 6.1 آلة حالة النهار (من منظور اللاعب)
`gamePhase` يتحكم بالطور المعروض. الانتقالات النموذجية: `DAY_DISCUSSION → DAY_VOTING → (DAY_JUSTIFICATION → [DAY_VOTING إعادة] | DAY_TIEBREAKER) → ELIMINATION_PENDING → NIGHT/GAME_OVER`. مصدر `gamePhase`: حدث `game:phase-changed` (يضبط + يفعّل حارس المرحلة 6000ms) والـ poll (يشفي الأجهزة الفائتة بعد انتهاء الحارس). طبقات العمدة تطفو فوق أي طور حسب أحداث `day:mayor-*`.

### 6.2 آلة حالة التصويت (النسختان)
الحالات: `no-vote` → (نقر) `submitting` → `voted`. المتغيرات: `myVote:int|null`, `voteSubmitting:bool`, `lastVoteTime:int|null` (`done` فقط), `votingComplete:bool`, `votingCountdown:int|null`, `playerVotes:Map`, `totalVotesCast:int`, `now:int` (ticker 1s).
- **`done`**: التغيير مسموح ضمن نافذة 10s بعد كل تصويت (`voteWindowOpen`)؛ خارجها الصوت مقفل حتى لو لم يكتمل التصويت.
- **`rejoined`**: التغيير حر حتى `votingComplete`.
- كل تصويت **ack-gated** (بلا تفاؤلية). `voteSubmitting` يمنع الطلبات المتوازية.

### 6.3 المؤقّتات والمهل
- **`votingCountdown`**: يُبدأ من `day:voting-started.durationSeconds`، ثم يُنقص محلياً كل ثانية عبر `votingTimerRef` حتى 0 (عندها يُلغى الـ interval). إن لم يصل `durationSeconds` → `null` (لا عدّاد). عند وصوله 0 يُفعَّل التصويت التلقائي (§4.4.9).
- **`now` ticker**: `setInterval` كل ثانية يحدّث `now` (يشغّل حساب نافذة الـ10s في `done`). في Flutter `Timer.periodic(1s)`.
- **مؤقّتا النقاش/التبرير**: **مشتقّان من `startTime` السيرفري** (drift-corrected) ويُنقصان كل ثانية؛ لا تثق بعدّاد محلي عبر reconnect. `justTimer` يصل 0 → `timerFinished = true` (يفعّل ظهور بطاقة السحب).
- **`mayorPromptLeft`**: عدّاد إرشادي (لا يقرّر). **بانر العمدة**: setTimeout 8000ms. **اهتزاز الإقصاء/الدور/العمدة**: أنماط HapticsService (20).

### 6.4 إعادة الاتصال واستعادة الحالة (حرج)
- **`day:voting-started`**: يستعيد `myVote` من `data.playerVotes[myPhysicalId]` إن وُجد (وإلا `null`)؛ يصفّر `totalVotesCast`/`votingComplete`؛ إن `myVote === null` يصفّر `lastVoteTime`؛ اهتزاز `[100,200]`؛ يبدأ العدّاد من `durationSeconds`.
- **`room:get-my-state`** (شبكة أمان بعد rejoin + الـ poll): يستعيد المرحلة، وحالة التصويت مع **المتبقّي المحسوب من `votingStartTime`/`durationSeconds`** (يُبدأ العدّاد فقط إن كان `votingCountdown === null`)، والمرشّحين، و`votingPlayersInfo` (diff-check لتفادي re-render).
- **`day:justification-started`**: يضبط `justificationData`، يصفّر السحب، ثم `fetchLatestState()`. الدمج عبر reconnect: **OR-merge لـ `timerFinished`** (لا يُدهَس المحلي)، وحارس `withdrawalActiveRef` يمنع الـ poll من دهس حالة سحب حيّة قادمة من socket.
- **الديلات**: مبذورة من `pollData.discussionState.deals` و`round` (قفل الجولة 1)؛ إعادة ضبط كاملة عند الانتقال إلى `DAY_DISCUSSION` (جولة جديدة)/`NIGHT`/`LOBBY`.
- استعادة العمدة: لا شيء يُخزَّن؛ الشارة تظهر من `mayorRevealedId` الذي يصل من `day:mayor-revealed`/state-sync.

### 6.5 تنظيف تغيّر المرحلة (`game:phase-changed`)
- `LOBBY | ROLE_GENERATION | ROLE_BINDING` → مسح `mafiaTeam`/`sibling`/`assignedRole`/`gameOverData` + ملاحظات المفكرة (`mafia_notes_{roomId}_{physicalId}`).
- أي مرحلة **ليست** `DAY_VOTING` ولا `DAY_JUSTIFICATION` → مسح `votingCandidates`/`myVote`/`votingComplete`/`playerVotes`/`lastVoteTime` (بيانات التصويت تبقى عبر VOTING↔JUSTIFICATION فقط).
- في `PlayerPhaseView`: `DAY_DISCUSSION` → مسح justification/elimination/tie/withdrawal + إعادة ضبط الديلات؛ `DAY_VOTING` → مسح justification/elimination/tie/withdrawal (إعادة تصويت)؛ `NIGHT` → مسح discussion/justification/elimination/morningEvents/withdrawal/deals؛ `MORNING_RECAP` → مسح morningEvents.

### 6.6 الحالات الحدّية
- **لا مرشّحون بعد** في `DAY_VOTING` → شاشة تحميل (§4.4.1).
- **لست مرشّحاً** (ديل/حصر) وانتهى الوقت بلا تصويت → التصويت التلقائي يختار index 0.
- **مرشّح ديل** (`type==='DEAL'`) → شارة «🤝 ديل من:» ومعالجة خاصة في نتيجة العمدة.
- **إعادة التصويت** بعد سحب > النصف أو تعادل → `day:voting-started` جديد يعيد بناء البطاقة.
- **العمدة يكشف** أثناء نافذة القرار → prompt يُغلق، بانر 8s، شارة دائمة بقية التصويت.
- **قنبلة**: العراب يُقصى → لا UI قنبلة للاعب؛ الضحايا يموتون عبر الـ poll (§4.8).
- **العميل فات حدثاً** → حارس المرحلة (6000ms) ثم الـ poll يشفي (20).

---

## 7. عقود التكامل

### 7.1 REST
لا نداءات HTTP مباشرة في نطاق هذا الملف — كل التكامل socket. (بطاقة الدور في سينمائية الإقصاء على الحلقة تستعمل `useGameConfig`/`getCardForRole` — عقودها في 22/02/03، ليست هنا.)

### 7.2 Socket — Emits (كلها عبر غلاف `emit` بـ ack + timeout 15s ما لم يُذكر)
| الحدث | الاتجاه | الحمولة | ack | متى |
|---|---|---|---|---|
| `player:cast-vote` | client→server | `{ roomId, physicalId:int, candidateIndex:int }` (+ `autoVote:true` للتصويت التلقائي) | `{ success }` | نقر بطاقة مرشّح (النسختان) أو تلقائياً عند العدّاد 0. |
| `day:mayor-decision` | client→server | `{ roomId, decision:'PASS'|'REVOTE'|'POSTPONE' }` | (يُنتظر، والفشل يُبتلع) | نقر أحد أزرار العمدة الثلاثة. |
| `player:withdraw-vote` | client→server | `{ physicalId:int }` | `{ success, count?, needed? }` | زر «🗳️ سحب صوتي». |
| `day:create-deal` | client→server | `{ roomId, initiatorPhysicalId:int, targetPhysicalId:int }` | `{ success, error? }` | زر «🤝 إبرام اتفاقية». |
| `day:remove-deal` | client→server | `{ roomId, dealId:string }` | `{ success, error? }` | زر «❌ إلغاء الاتفاقية». |
| `room:get-my-state` | client→server | `{ roomId, playerId?:int, phone?:string (مطبَّع ببادئة '0') }` | `{ success, justificationData?, withdrawalState?{count,needed,withdrawn:int[]}, discussionState?{...,deals?}, votingState?{candidates,playersInfo,playerVotes,totalVotesCast,votingStartTime,durationSeconds}, round? }` | عند الإقلاع/التوفّر وبعد `day:justification-started` والـ poll. |

### 7.3 Socket — Listeners (كل `on` يرجع دالة إلغاء اشتراك؛ ألغِها في `dispose`)
| الحدث | الحمولة (كما تُستهلك) | الأثر |
|---|---|---|
| `day:voting-started` | `{ candidates:Candidate[], playersInfo?:PlayerInfo[], playerVotes?:{pid:index}, durationSeconds? }` | دخول `DAY_VOTING`؛ بناء البطاقة؛ استعادة `myVote`؛ بدء العدّاد؛ اهتزاز `[100,200]`. |
| `day:vote-update` | `{ candidates:Candidate[], totalVotesCast:int, playerVotes:{pid:index} }` | تحديث الأصوات والمرشّحين، ومزامنة `myVote` من `playerVotes[myPid]`. |
| `day:voting-complete` | (بلا حمولة) | `votingComplete = true`. |
| `day:mayor-window` | `{ forMayor:bool, timeoutSeconds?, winner:{ type?, targetPhysicalId:int, targetName?, initiatorPhysicalId? }, topVotes:int, voteWeight? }` | إن `forMayor` → فتح prompt + عدّاد + اهتزاز `[120,80,120,80,240]`. |
| `day:mayor-window-closed` | — | إغلاق الـ prompt. |
| `day:mayor-revealed` | `{ physicalId:int, name:string, decision:'PASS'|'REVOTE'|'POSTPONE', voteWeight? }` | إغلاق prompt + ضبط `mayorRevealedId`/`mayorWeight` + بانر 8s. |
| `day:discussion-updated` | `{ discussionState:{ status:'SPEAKING'|'PAUSED'|'WAITING', currentSpeakerId:int, speakers:[{physicalId,name,status}], timeLimitSeconds, timeRemaining, startTime, deals? } }` | استبدال حالة النقاش. |
| `day:justification-started` | `{ accused:[{targetPhysicalId,name?,canJustify?}], topVotes, votersForAccused:int[] }` | ضبط بيانات التبرير، تصفير السحب، ثم `fetchLatestState`. |
| `day:justification-timer-started` | `{ timeLimitSeconds? \| duration?, startTime? }` | بدء عدّاد drift-corrected؛ `timerFinished=false`؛ عند 0 → `timerFinished=true`. |
| `day:justification-timer-stopped` | — | إيقاف العدّاد؛ `justTimer=null`؛ `timerFinished=true`. |
| `day:tie` | `{ tiedCandidates:[{targetPhysicalId, votes}] }` | ضبط قائمة التعادل. |
| `day:elimination-pending` | `{ eliminated:int[], revealedRoles?:[{physicalId, role}] }` | تخزين؛ `eliminationRevealed=false`. |
| `day:elimination-revealed` | نفس السابق + الأدوار مملوءة (+ `teamCounts?`) | `eliminationRevealed=true`؛ اهتزاز `[200,100,200]` إن كنتُ مقصياً. |
| `day:withdrawal-period` | `{ needed }` | تفعيل واجهة السحب (count 0، hasWithdrawn false). |
| `day:withdrawal-update` | `{ count, needed, withdrawn:int[] }` | تحديث العدّادات وإعادة حساب hasWithdrawn. |
| `day:withdrawal-result` | أي | تعطيل واجهة السحب. |
| `day:deal-created` / `day:deal-removed` | `{ deals:[{id, initiatorPhysicalId, targetPhysicalId}] }` | استبدال قائمة الديلات. |
| `game:phase-changed` | `{ phase, state?{config?{isRemote,allowPlayerInvites}} }` | ضبط `gamePhase` + حارس المرحلة + تنظيف (§6.5). |
| `day:bomb-result` *(متاح على الغرفة — العميل الويب لا يستمع له؛ للاستخدام المستقبلي فقط)* | `{ bombEliminated:int[], bombRevealedRoles:[{physicalId, role}], bombRR:int, winResult:string, teamCounts }` | لا شيء في تكافؤ الويب؛ اختيارياً تحديث حالة الموت المحلية أسرع (§4.8). |

> ملاحظة: أحداث النقاش/التبرير/الإقصاء يستمع لها أيضاً `PhoneSpectatorView` لعرضها على الحلقة (شريط المتحدث/المدافع، سينمائية الكشف) — تفصيلها في 27.

---

## 8. نماذج Dart المطلوبة

المرجع الكامل للنماذج في **02-models-data-layer.md**؛ ما يخصّ هذا الملف:

```dart
// مرشّح التصويت — يغطي PlayerCandidate و DealCandidate
class VotingCandidate {
  final String? id;
  final int targetPhysicalId;
  final int votes;                 // افتراضي 0
  final String? type;              // 'DEAL' لمرشّح الصفقة، وإلا null (لاعب)
  final int? initiatorPhysicalId;  // موجود فقط عند type == 'DEAL'
  bool get isDeal => type == 'DEAL';
}

class PlayerInfo {                 // votingPlayersInfo / roster المبسّط
  final int physicalId;
  final String? name;
  final String? avatarUrl;
}

// خريطة الأصوات العلنية: physicalId → candidateIndex
typedef PlayerVotes = Map<int, int>;

class Deal {
  final String id;
  final int initiatorPhysicalId;
  final int targetPhysicalId;
}

class DiscussionState {
  final String status;             // 'SPEAKING' | 'PAUSED' | 'WAITING'
  final int? currentSpeakerId;
  final List<Speaker> speakers;
  final int? timeLimitSeconds;
  final int? timeRemaining;
  final int? startTime;            // ms — أساس drift-correction
  final List<Deal>? deals;
}
class Speaker { final int physicalId; final String? name; final String status; } // status: 'done' | ...

class JustificationData {
  final List<Accused> accused;
  final int topVotes;
  final List<int> votersForAccused;
  bool timerFinished;              // OR-merge عبر reconnect
}
class Accused { final int targetPhysicalId; final String? name; final bool? canJustify; }

class WithdrawalState { final int count; final int needed; final List<int> withdrawn; }

class TieCandidate { final int targetPhysicalId; final int votes; }

class EliminationData {
  final List<int> eliminated;
  final List<RevealedRole>? revealedRoles;
}
class RevealedRole { final int physicalId; final String role; }

class MayorPrompt {
  final bool forMayor;
  final int? timeoutSeconds;
  final MayorWinner? winner;
  final int topVotes;
  final int? voteWeight;           // افتراضي 2
}
class MayorWinner {
  final String? type;              // 'DEAL' أو null
  final int targetPhysicalId;
  final String? targetName;
  final int? initiatorPhysicalId;
}
class MayorReveal {                // day:mayor-revealed
  final int physicalId;
  final String name;
  final String decision;           // 'PASS' | 'REVOTE' | 'POSTPONE'
  final int? voteWeight;
}

// القنبلة (مرجع فقط — لا UI للاعب)
class PendingBomb {
  final int godfatherPhysicalId;
  final int? godfatherPlayerId;
  final BombNeighbor? above;
  final BombNeighbor? below;
}
class BombNeighbor { final int physicalId; final String name; final String role; }
class BombResult {                 // day:bomb-result (اختياري)
  final List<int> bombEliminated;
  final List<RevealedRole> bombRevealedRoles;
  final int bombRR;
  final String winResult;
}
```

حالة الشاشة (تُدار في الـ controller — 20): `gamePhase`, `votingCandidates`, `votingPlayersInfo`, `playerVotes`, `myVote`, `voteSubmitting`, `lastVoteTime`, `votingCountdown`, `votingComplete`, `totalVotesCast`, `now`, `mayorPrompt`, `mayorPromptLeft`, `mayorSending`, `mayorBanner`, `mayorRevealedId`, `mayorWeight`, `deals`, `dealSubmitting`, `dealRemoving`, `dealError`, `selectedTargetId`, `dealsSheetOpen`, `justificationData`, `justTimer`, `withdrawalActive`, `withdrawalNeeded`, `withdrawalCount`, `hasWithdrawn`, `tiedCandidates`, `eliminationData`, `eliminationRevealed`, `discussionState`, `notepadNotes` (من 26).

---

## 9. الحزم المستخدمة

- `socket_io_client` — الأحداث والـ `emitWithAck` (عبر طبقة 04).
- `flutter_animate` و`AnimationController` — دخول framer (fade/scale/spring)، نبض الأيقونات، تبدّل نص العدّاد (`AnimatedSwitcher` keyed بالثانية)، بانر العمدة، تدرّج شريط التقدّم.
- `vibration` (+ `HapticFeedback` fallback) — أنماط `[200,100,200,100,300]`/`[200,100,200]`/`[120,80,120,80,240]`/`[100,200]`/100ms (عبر `HapticsService` — 20).
- `just_audio` — نغمات تنبيه الدور الثلاث المسبقة التوليد ونبضات العدّاد (07).
- `wakelock_plus` — يبقى مفعّلاً أثناء `done`/`rejoined` (لئلا يفوت اللاعب تنبيهات النهار — 20).
- `google_fonts` أو أصول محلية — **Amiri** (عناوين) و**JetBrains Mono** (أرقام/ملصقات).
- أدوات `01`: `WindowSizeClass`/`Dimens`/`gameScale`/`ContentConstraint`/`AdaptiveGrid`/`CircularTimer`.
- `RepaintBoundary` (Flutter core) — لقائمة المرشّحين والعدّادات المتحرّكة.
- الطبقة المنزلقة للاتفاقيات: `showModalBottomSheet(isScrollControlled: true)` مع `BackdropFilter`؛ بديل مخصّص لخيارات `select` المعطّلة (Flutter لا يعطّل `DropdownMenuItem`).

لا `google_fonts` وقت التشغيل إن كانت الخطوط أصولاً محلية (قرار 01). لا `dotlottie` (سينمائيات القنبلة/العرض خارج نطاق تطبيق اللاعب — §4.8).

---

## 10. اختلافات Android / iOS (إلزامي)

- **الاهتزاز**: أنماط الاهتزاز متعدّدة النبضات (`[200,100,200,100,300]` وأخواتها) تعمل كاملة على Android عبر `vibration`؛ على iOS الدعم محدود (أنماط تقريبية عبر `HapticFeedback` أو تدهور رشيق) — `HapticsService` يتكفّل بالتدرّج (موثّق في 20). عدم توفّر الاهتزاز على iOS **لا يكسر اللعب** (النغمات الصوتية تعوّض تنبيه الدور).
- **تنبيه الدور الصوتي**: نُقل من WebAudio (يعمل حتى على iOS في الويب حيث لا اهتزاز) إلى أصل `just_audio` مسبق التوليد؛ يعمل على المنصّتين. تأكّد من فئة `audio_session` playback على iOS ليعمل رغم مفتاح الصامت (07).
- **رسم الإيموجي**: هذه الشاشة تعتمد إيموجي كأيقونات (⚖️ 🎩 🗳️ 💀 🤝 🔄 🌙 🤐 ⏱ 🎙️ 🔇 🟢 🟡 🔴 ✅ ❌ ✓ ●). مجموعات إيموجي Android/iOS تختلف — تحقّق بصرياً من ⚖️ و🎙️ خصوصاً، وإلا استبدلها بأصول أيقونات موحّدة.
- **باقي السلوك**: لا اختلافات جوهرية أخرى (المنطق socket-driven موحّد، والـ RTL موحّد).

---

## 11. الأصول المطلوبة

- **خطوط**: `Amiri` (Regular/Bold) و`JetBrains Mono` — مضمّنة كأصول (لا تحميل وقت تشغيل).
- **صوت**: نغمة تنبيه الدور المسبقة التوليد (3 نغمات جيبية 660/880/1100Hz) + نبضات عدّاد `timer_heartbeat_fast`/`slow` (تُدار عبر SoundService — 07). لا أصوات قنبلة على هاتف اللاعب.
- **صور**: أفاتار اللاعبين عبر `avatarUrl` (شبكي) في بطاقات المرشّحين والمتهمين والمتحدث؛ fallback = رقم المقعد `#{pid}` نصاً (لا صورة افتراضية مطلوبة هنا؛ صور الجنس الافتراضية تخصّ الحلقة/البطاقة — 27/22).
- **إيموجي**: كما في §10 (لا أصول إن كان الرسم النظامي مقبولاً بعد الفحص البصري).
- لا Lottie ولا صور خلفية خاصة بهذا الملف (الخلفيات من ثيم 01).

---

## 12. معايير القبول — checklist تكافؤ (قابلة للتعليم ✓)

- [ ] `DAY_DISCUSSION`: بانر «دورك في النقاش!»/«تحدّث الآن أمام الجميع» يظهر لصاحب الدور فقط، ويتحوّل إلى «انتهى وقتك!»/«يُرجى التوقف عن الكلام» عند صفر العدّاد أثناء SPEAKING.
- [ ] العدّاد الدائري في النقاش/التبرير: ذهبي > كهرماني ≤10s > أحمر ≤5s، بالمقاسات ونطاقات اللون الحرفية.
- [ ] تنبيه الدور: اهتزاز `[200,100,200,100,300]` + 3 نغمات صاعدة تعملان على Android وiOS.
- [ ] قائمة ترتيب النقاش: حالات الحالي/المنتهي/«(أنت)»/الافتراضي بألوانها.
- [ ] الاتفاقيات: زر «🤝 الاتفاقيات {n}/3» → ورقة منزلقة `max-h 82%`؛ الحالات الأربع بنصوصها الحرفية (قفل الجولة 1، «تم إبرام اتفاقيتك بنجاح!» + شريك + «❌ إلغاء الاتفاقية»/«جاري الإلغاء...» + تحذير المخاطرة، «(3/3)»، نموذج الإنشاء مع «(مستهدف 🔒)»).
- [ ] `create-deal`/`remove-deal` ack-gated؛ خطأ عربي يظهر «❌ {dealError}»؛ حارس `dealSubmitting`/`dealRemoving`.
- [ ] `DAY_JUSTIFICATION`: بطاقات المتهمين «{topVotes} صوت ضده»/«🎙️ يبرر الآن...»؛ pill «⏱ {s}s» أحمر ≤10.
- [ ] بطاقة السحب تظهر بشرط `(withdrawalActive || justTimer===0 || timerFinished) && iVotedForAccused && !dead`؛ «{count}/{needed} سحبوا أصواتهم»؛ زر «🗳️ سحب صوتي» → «✓ تم سحب صوتك»؛ السحب أحادي.
- [ ] `DAY_VOTING`: نسخة `done` بنافذة 10s («يمكنك تغيير تصويتك خلال {s} ثانية» → «✅ تم التصويت (مغلق)»)؛ نسخة `rejoined` تغيير حر حتى الاكتمال («✅ تم التصويت — اضغط لاعب آخر للتغيير»).
- [ ] شريط التقدّم: `done` («{n} صوت»/«{max} أعلى»، مقام = عدد المرشّحين، تدرّج `#E8C97A`) مقابل `rejoined` («VOTES: {n}»/«✅ COMPLETE|⏳ IN PROGRESS»، مقام = `votingPlayersInfo.length`، تدرّج `#D4AF37`).
- [ ] بطاقة المرشّح: أفاتار 72px/fallback `#pid`، pill «مقعد #{pid}»، إيموجي اشتباه، شارة «🤝 ديل من: … #{initiator}» لمرشّح DEAL، عدّاد «{votes} صوت»، رقائق المصوّتين الحمراء، شارة «أنت».
- [ ] منع التصويت للنفس (`isSelf`) رجوع صامت؛ حرّاس النقر الكاملة للنسختين.
- [ ] التصويت التلقائي عند `votingCountdown===0` (index الذاتي وإلا 0) مع `autoVote:true`.
- [ ] استعادة `myVote` من `playerVotes[myPid]` عند `day:voting-started`/`vote-update`/reconnect.
- [ ] `DAY_TIEBREAKER`: «تعادل في الأصوات» + رقائق المتعادلين + «بانتظار قرار الليدر...»؛ إعادة التصويت تأتي كـ `day:voting-started` جديد.
- [ ] `ELIMINATION_PENDING`: «إقصاء» + بطاقة لكل مُقصى (حمراء لو أنا) + كشف الدور نصاً بعد `eliminationRevealed` + «❌ تم إقصاؤك!» + اهتزاز `[200,100,200]`.
- [ ] العمدة: مودال «أنت العمدة — لحظة القرار» بأزراره الثلاثة ونصوصها وتدرّجاتها الحرفية + تذييل «×{voteWeight||2}»؛ يفتح فقط عند `forMayor` مع اهتزاز `[120,80,120,80,240]`.
- [ ] بانر «🎩 العمدة يكشف نفسه: #{id} {name}» + نص القرار + «⚖️×{weight||2}»، يختفي بعد 8s.
- [ ] شارة العمدة الدائمة أثناء `DAY_VOTING` (نص الذات مقابل الآخرين) بـ `×{mayorWeight}`.
- [ ] `sendMayorDecision` بحارس `mayorSending`، الأخطاء تُبتلع صمتاً.
- [ ] القنبلة: **لا واجهة/سينمائية قنبلة على هاتف اللاعب**؛ العراب يُقصى عبر `ELIMINATION_PENDING`، والضحايا يموتون عبر الـ poll؛ `day:bomb-result` غير مشترَك (تكافؤ الويب).
- [ ] التكيّف: compact عمود واحد؛ medium/expanded عمودان داخل 640/720 مع أزرار min-height ≥ 56 وعناصر لعب × `gameScale`؛ مودال العمدة لا يتمدّد.
- [ ] كل emit ack-gated بلا تحديث تفاؤلي؛ إلغاء كل الاشتراكات في `dispose`.

---

## 13. ملاحظات أداء وأمان

- **بلا تحديث تفاؤلي** للتصويت والسحب والديلات وقرار العمدة — الـ UI يتبع الـ ack (`success`). هذا جزء من التصميم (السيرفر مصدر الحقيقة، ويمنع تزوير الحالة).
- **منع التصويت للنفس** حرفياً (`isSelf` رجوع صامت) — ثابت أمني.
- **التصويت التلقائي** عند الصفر يجب نقله وإلا تتعلّق الجولات (منطق حرج، ليس مجرد راحة).
- **حارس العمدة** `mayorSending` ضد الإرسال المزدوج؛ الأخطاء تُبتلع (الليدر خط الرجعة) — لا تُظهر خطأ للعمدة.
- **الديلات**: قفل الجولة 1 من `pollData.round`، حدّ 3، تعطيل الأهداف المستهدَفة — كلها تُطبَّق في الـ UI **والسيرفر يعيد التحقّق**؛ لا تعتمد على الـ UI وحده.
- **مانع تسريب الأدوار**: كشف الدور في الإقصاء يأتي حصراً من `revealedRoles` السيرفري (لا يُعرض دور لاعب حي أبداً)؛ سينمائية الحلقة تحترم نفس الثابت (27). لا تشتقّ أدواراً محلياً.
- **مؤقّتات drift-corrected**: احسب المتبقّي من `startTime`/`votingStartTime` السيرفري كل tick؛ لا تثق بعدّاد محلي عبر reconnect (يمنع انحراف/تعليق).
- **أداء القائمة**: `RepaintBoundary` حول بطاقات المرشّحين والعدّادات المتحرّكة؛ العدد ≤ 27 فلا حاجة لـ virtualization ثقيل، لكن العدّاد الكبير و`animate-pulse` يجب عزلهما عن إعادة رسم القائمة.
- **القنبلة**: عدم رسم سينمائية القنبلة على هاتف اللاعب ليس فقط تكافؤاً بل أمان بصري (لا كشف مبكّر)؛ إن أُضيف اشتراك `day:bomb-result` مستقبلاً فليقتصر على تحديث حالة الموت دون كشف أدوار غير واردة في حمولته.
- **إلغاء الاشتراكات**: كل مستمعات `day:*`/`game:phase-changed` تُلغى في `dispose` (bug ويب معروف: بعض المستمعات بلا cleanup — لا تُنقل).
- **wake lock** مفعّل أثناء النهار لئلا يفوت اللاعب دوره/تصويته.
