# نظام الصوت: SoundManager، خريطة الأصوات، الكاش، ducking

> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

## 1. الهدف والنطاق

بناء البنية التحتية الصوتية الكاملة لتطبيق Flutter، وهي مكوّن نظامي (cross-cutting) وليس شاشة. تتكوّن من طبقتين منفصلتين تماماً:

1. **سطح اللاعب (player)** — وهو الأصغر بكثير: هاتف اللاعب **لا يشغّل أي صوت من أصوات اللعبة إطلاقاً** (القاعدة المعمارية «الليدر مصدر الصوت الحصري» — انظر §6.1). سطح اللاعب الصوتي = (أ) أنماط اهتزاز (haptics) على أحداث محددة، و(ب) نغمة واحدة فقط «حان دورك بالكلام» (3 نغمات صاعدة). هذا كل شيء.
2. **خدمة `SoundManager` الكاملة** — تُبنى في هذا الملف وتُستهلك من شاشة كونسول المضيف (30-host-console.md) عندما يعمل التطبيق بدور الليدر: تشغيل محلي لكل أصوات اللعبة + عكس (mirror) كل نداء إلى شاشة العرض الكبيرة (التي تبقى تطبيق ويب) عبر Socket، مع خريطة الأصوات المخصصة من الأدمن، والتنزيل والكاش المحلي، والـ ducking اليدوي للـ ambient، وfallback الأصوات المولّدة (synth) كأصول مسبقة التصيير.

**خارج النطاق:** شاشة العرض الكبيرة (display) تبقى ويب ولا تُنقل — التطبيق لا يستمع أبداً لـ `display:sound-play` ولا يطبّق `applyRemoteSound`؛ صفحة أدمن الأصوات `/admin/sounds` (رفع/قص/تفعيل — شريحة ويب منفصلة)؛ ودجت `CircularTimer` (تُعرض على شاشة العرض فقط، ليست على هاتف اللاعب)؛ صوت `playDing()` في صفحة طلبات المطعم (خاص بجهاز الموظفين، ليس تطبيق اللاعب)؛ صوت المكالمات عن بعد RealtimeKit (31-voice-realtimekit.md — لكن تنسيق جلسة الصوت معه مذكور في §6.8).

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

| الملف | الدور |
|---|---|
| `unified-mafia/frontend/src/lib/soundManager.ts` (920 سطراً) | الوحدة المركزية: الخريطة، preload، المرآة، البوابة، الـ synth، الـ ducking. **تنبيه:** تعليق الهيدر (الأسطر 25–29) يصف الاتجاه القديم المعكوس (display كمصدر) — stale؛ الاتجاه الصحيح المطبق فعلاً leader→display |
| `unified-mafia/frontend/src/app/leader/page.tsx` | الليدر كمصدر: كل خرائط التشغيل، زر الكتم FAB (~1597–1605)، تسجيل المرآة، المؤقتات |
| `unified-mafia/frontend/src/app/display/page.tsx` | الشاشة كتابع (`setLocalPlayback(false)` + `applyRemoteSound`) — مرجع للفهم فقط، لا يُنقل |
| `unified-mafia/frontend/src/app/display/DisplayDayView.tsx` | استثناء الشاشة: drumroll/impact-boom بسياق خام يتجاوز البوابة + CircularTimer — لا يُنقل |
| `unified-mafia/frontend/src/components/NightAnimCinematic.tsx` | مفاتيح أصوات سينمائيات الليل/الصباح (ميتة حالياً — انظر §6.10) |
| `unified-mafia/frontend/src/components/CircularTimer.tsx` | مؤقت الشاشة الصوتي — خارج النطاق |
| `unified-mafia/frontend/src/components/PlayerFlow.tsx` | كل أنماط اهتزاز اللاعب |
| `unified-mafia/frontend/src/components/PlayerPhaseView.tsx` | نغمة «دوري بالكلام» + اهتزازها |
| `unified-mafia/frontend/src/app/admin/sounds/page.tsx` | الكتالوج القانوني للمفاتيح (EVENT_GROUPS — 58 مفتاحاً) — مرجع للكتالوج فقط |
| `unified-mafia/backend/src/sockets/lobby.socket.ts` | تحقق المرآة في الـ backend: whitelist الـ 11 دالة + تعقيم args + توجيه fetchSockets |
| `unified-mafia/backend/src/routes/sounds.routes.ts` | `GET /api/sounds/active-map` + endpoints الأدمن + static `/uploads` |

## 3. التبعيات على ملفات الخطة الأخرى

- **01-foundation-theme.md** — ألوان الثيم، توكنات Dark Noir (زر الكتم FAB يستخدم ألواناً خاصة به مذكورة هنا حرفياً).
- **02-models-data-layer.md** — مكان تسجيل نماذج §8.
- **03-networking-rest.md** — عميل REST، الـ base URL المركزي، وقاعدة حلّ مسارات `/uploads/...` النسبية مقابل مضيف الـ backend (لا يوجد proxy في Flutter).
- **04-socket-layer.md** — قناة Socket.IO، `emit`/`on`، وإعادة تسجيل المستمعات عند إعادة الاتصال. أحداث هذا الملف (`leader:sound-play`، `admin:sounds-updated`، `leader:mafia-gallery-alert`، وكل الأحداث المحفّزة للصوت/الاهتزاز) تمرّ عبرها.
- **20-game-state-core.md** — أحداث الطور والحالة التي تقود الأصوات والاهتزازات (`game:phase-changed`، `game:over`، `game:restarted`...).
- **21-join-lobby.md / 22-role-cards.md / 23-night-phase.md / 25-day-voting.md** — نقاط استدعاء الاهتزازات على شاشات اللاعب (الجدول في §6.7 هو المرجع الوحيد للأنماط؛ تلك الملفات تستدعي `HapticsService` المعرّفة هنا).
- **30-host-console.md** — المستهلك الرئيسي لخدمة `SoundManager` الكاملة + زر الكتم FAB + خرائط التشغيل (§6.5).
- **31-voice-realtimekit.md** — تنسيق `audio_session` عند تفعيل الصوت عن بعد (§6.8 و§10).

## 4. الواجهة والتجربة تفصيلياً

نظام الصوت شبه خالٍ من الواجهة. عناصره المرئية والحالات:

### 4.1 سطح اللاعب — لا واجهة مرئية

- لا يظهر للاعب أي زر صوت أو مؤشر صوتي. الاهتزازات والنغمة تعمل تلقائياً على الأحداث (جدول §6.7).
- **نغمة «دوري بالكلام»** (المصدر: PlayerPhaseView): عندما ينتقل `currentSpeakerId` في `day:discussion-updated` إليّ أنا: اهتزاز `[200,100,200,100,300]` + تشغيل أصل صوتي مضمّن `my_turn_chime` يعيد إنتاج الوصفة الأصلية حرفياً: 3 نغمات sine صاعدة — 660Hz لمدة 0.15s، ثم 880Hz تبدأ عند +0.2s، ثم 1100Hz تبدأ عند +0.4s لمدة 0.2s، gain 0.3 مع اضمحلال أسّي، الطول الكلي ≈1s.
- لا يوجد إعداد «كتم» للاعب في النسخة الحالية — لا تضف واحداً (تكافؤ). اهتزاز فقط + النغمة الواحدة.

### 4.2 زر كتم الصوت FAB — كونسول المضيف فقط (يُبنى هنا، يُركّب في 30-host-console.md)

زر عائم ثابت أسفل-يسار الشاشة (في RTL يبقى **يسار** كما في الويب: `bottom-4 left-4` = 16dp من الأسفل و16dp من اليسار)، فوق كل المحتوى (كان `z-[60]`)، قياس **44×44dp** دائري كامل، خلفية شبه شفافة مع blur خلفي وظل (`shadow-lg` ≈ elevation 8).

| الحالة | الخلفية | الحد | لون الأيقونة | الأيقونة |
|---|---|---|---|---|
| الصوت مفعّل | `#0F2A1A` بشفافية 80% | `#059669` (emerald-600) بشفافية 40%، 1dp | `#6EE7B7` (emerald-300) | 🔊 |
| مكتوم | `#2A0F0F` بشفافية 80% | `#B91C1C` (red-700) بشفافية 40%، 1dp | `#FCA5A5` (red-300) | 🔇 |

- Tooltip حرفي: «كتم أصوات الليدر» (وهو مفعّل) / «تشغيل أصوات الليدر» (وهو مكتوم). تسمية الوصولية (Semantics label): «كتم الصوت» / «تشغيل الصوت».
- عند الإطفاء: استدعاء `stopOneShotSounds()` فوراً (يقتل أي صوت فوز جارٍ محلياً **وعلى شاشة العرض عبر المرآة** — لأن `stopOneShotSounds` من دوال الـ whitelist المعكوسة) + حفظ الحالة في التخزين المحلي بمفتاح `leader-sound-on` بقيمة `'0'` (`'1'` عند التفعيل) — في Flutter عبر `shared_preferences` بنفس اسم المفتاح.
- عند التشغيل: يستأنف من الحدث القادم (لا يعيد تشغيل الـ ambient فوراً في الويب إلا عند تغيّر الطور؛ للتكافؤ أعد تقييم effect الـ ambient عند التفعيل — انظر §6.5).
- لا أنيميشن انتقال موثّق للزر في الويب؛ استخدم تبديل ألوان فوري (أو `AnimatedContainer` بمدة ≤150ms كحد أقصى دون تغيير الدلالة).

### 4.3 حالة «فتح الصوت» (Audio unlock) — تُحذف في Flutter

في الويب توجد حالة خفية: قبل أول إيماءة مستخدم يكون الـ AudioContext معلّقاً والـ synth صامتاً، ويُفتح بمستمع `pointerdown`/`keydown` (ليدر) أو `click`/`touchstart` (شاشة) ينادي `primeAudio()` مرة واحدة. **لا مكافئ لها في Flutter** — الصوت الأصلي بلا سياسة autoplay. تُحذف كل آلة `primeAudio`/`pendingAmbientRef`، ويبقى فقط «استئناف عند العودة للمقدمة» (§6.8).

### 4.4 حالات الخطأ والفراغ

- **لا حالات خطأ ظاهرة للمستخدم إطلاقاً** (تكافؤ صارم): كل فشل تشغيل صوت يُبتلع بصمت (try/catch فارغ). فشل جلب `active-map` = تسجيل تحذير في اللوغ فقط، وتُعتبر الخريطة محمّلة (`isLoaded=true`) بلا retry — تعمل كل الأصوات من أصول الـ synth المضمّنة طوال الجلسة.
- **خريطة فارغة** (لا ملفات مرفوعة من الأدمن — وهو الوضع الشائع): كل المفاتيح ذات وصفة synth تعمل من الأصول المضمّنة؛ المفاتيح بلا وصفة (كل `ambient_*`، كل `elimination_*`، كل `phase_*`، `night_witch`، `morning_ability_disabled`) = **صمت مقصود**. لا تعرض أي رسالة.
- **فشل تنزيل ملف مخصص للكاش**: تشغيل streaming مباشر من URL الشبكة كـ fallback، وإن فشل أيضاً → synth/صمت حسب المفتاح. صامت دائماً.

## 5. التكيّف مع الشاشات 6→11 إنش

نظام الصوت لا يملك شاشات، والعنصر المرئي الوحيد هو زر الكتم FAB في كونسول المضيف:

- **compact (<600dp)**: FAB بقياس 44×44dp، هامش 16dp من الأسفل واليسار — مطابق للويب حرفياً.
- **medium (600–840dp)**: نفس القياس 44×44dp (هدف اللمس كافٍ)، يُرفع الهامش إلى 24dp من الأسفل واليسار حتى لا يلتصق بحواف التابلت.
- **expanded (>840dp)**: كونسول المضيف على تابلت 10–11 إنش هو الاستخدام الأساسي — يُكبَّر الزر إلى 56×56dp (قاعدة «مضاعفة عناصر اللعب الحساسة بدل تمديدها» — الليدر يضغطه أثناء إدارة الجلسة) مع أيقونة 24sp وهامش 24dp. لا يتغير أي شيء آخر.
- نغمة اللاعب والاهتزازات لا تتأثر بفئة الشاشة إطلاقاً.

## 6. المنطق والتدفقات

### 6.1 المعمارية: الليدر مصدر الصوت الحصري (leader-source / follower-relay)

القاعدة الذهبية (مثبتة في ذاكرة المشروع ولا تُعكس): **جهاز الليدر يقرر ويشغّل كل أصوات اللعبة محلياً، ويعكس كل نداء إلى شاشة العرض** عبر `leader:sound-play` → تحقق whitelist في الـ backend → `display:sound-play` → الشاشة تعيد التنفيذ. شاشة العرض تعطّل تشغيلها المحلي.

انعكاسها على تطبيق Flutter:

| دور الجهاز | يشغّل أصوات اللعبة؟ | يبث المرآة؟ | يستقبل `display:sound-play`؟ |
|---|---|---|---|
| لاعب (player) | **لا — أبداً** (فقط اهتزازات + نغمة الدور المحلية) | لا | لا (الـ backend يوجهه فقط لسوكيتات `role==='display'`) |
| ليدر (host console) | نعم — كل شيء | نعم — كل نداء عام | لا |
| شاشة العرض | (تبقى ويب — خارج التطبيق) | — | نعم |

**قاعدة حاسمة للاعب:** حتى لو وصلت للاعب أحداث مثل `game:phase-changed` أو `game:over`، تطبيق اللاعب **لا يشغّل** أي صوت لها — الصوت تجربة قاعة تصدر من جهاز الليدر وسماعات الشاشة. أي صوت من هواتف اللاعبين = خلل تكافؤ.

### 6.2 دورة حياة SoundManager (خدمة singleton)

الحالة الداخلية (تعادل module-level singletons في الويب):
`customSoundMap: Map<String,String>` (مفتاح→URL)، `cachedFiles: Map<String,String>` (مفتاح→مسار محلي)، `isLoaded: bool`، `ambientPlayer` + `ambientKey`، `oneShotPlayers: Set` (pool)، `mirrorEmit: Function?`، `localPlaybackEnabled: bool` (افتراضياً true؛ تبقى true دائماً في هذا التطبيق لأنه لا يعمل كشاشة — تُنقل البوابة للحفاظ على تطابق البنية)، حالة الكتم `leaderSoundOn`.

State machine:
```
idle → loadSoundMap() (مرة واحدة، idempotent عبر isLoaded)
     → [نجاح] خريطة محمّلة + بدء تنزيل الكاش بالخلفية → ready
     → [فشل] isLoaded=true بلا خريطة → ready (synth فقط طوال الجلسة، لا retry)
ready → on admin:sounds-updated → reloadSoundMap(): تفريغ الخريطة + إعادة الجلب + مزامنة الكاش
```

**ترتيب المرآة (يُنقل حرفياً):** كل دالة عامة تفعل بالترتيب: (1) إن كان `mirrorEmit` مسجلاً → بث `{fn, args}` **مرة واحدة**؛ (2) إن كانت `localPlaybackEnabled == false` → return (البوابة)؛ (3) تنفيذ محلي عبر `_impl`. الدوال الداخلية `_impl` تتنادى فيما بينها فقط ⇒ بث واحد بالضبط لكل نداء عام، لا حلقات (مثال: `playEventSound` تبث نفسها فقط، ولا تبث `duckAmbient`/`playGameSound`/`unduckAmbient` الداخلية).

**`playLocalSound(key)`** تتجاوز الاثنين معاً (لا مرآة ولا بوابة) — مخصصة حصرياً لتنبيه `leader_gallery_alert` السري (anti-cheat: يجب ألا يصل للشاشة أو لأي جهاز آخر أبداً). حراسة الكتم لها يدوية في طبقة الاستدعاء (كونسول المضيف يفحص حالة الكتم قبل النداء).

### 6.3 خريطة الأصوات، التنزيل، والكاش المحلي

1. **الجلب**: `GET /api/sounds/active-map` (بدون auth) → `{ success: true, map: { "<eventKey>": "/uploads/sounds/<filename>" } }`. الخريطة فارغة عند غياب DB أو خطأ (وما تزال `success:true`). عدة مفاتيح قد تشير لنفس الملف (صف الأدمن الواحد له `eventKeys[]`).
2. **حلّ الروابط**: المسارات نسبية — تُحلّ مقابل الـ base URL المركزي من 03-networking-rest.md: `${baseUrl}/uploads/sounds/<filename>`.
3. **التنزيل والكاش** (يستبدل preload الـ `HTMLAudioElement` في الويب): عند تحميل الخريطة، نزّل كل ملف إلى `<ApplicationSupportDirectory>/sounds_cache/<filename>` (عبر `path_provider`). **مفتاح صلاحية الكاش هو اسم الملف نفسه**: أسماء الملفات في الـ backend فريدة زمنياً (`${Date.now()}_${sanitized}`) فلا حاجة لـ ETag — ملف موجود محلياً بنفس الاسم = صالح، يُتخطى تنزيله.
4. **الإبطال**: عند `admin:sounds-updated` (socket، بلا حمولة): `reloadSoundMap()` — إعادة جلب الخريطة، تنزيل الأسماء الجديدة فقط، ثم **حذف الملفات المحلية التي لم تعد مذكورة في الخريطة** (تنظيف).
5. **التشغيل**: مفتاح موجود في الخريطة → شغّل من المسار المحلي إن اكتمل تنزيله، وإلا streaming من URL الشبكة (يكافئ fallback `new Audio(url)` في الويب). مفتاح غير موجود → أصل synth مضمّن إن وُجدت وصفته، وإلا صمت.

### 6.4 واجهة SoundManager العامة — كل دالة وسلوكها الحرفي

| الدالة | السلوك |
|---|---|
| `setSoundMirror(cb?)` | تسجيل/مسح باثّ المرآة. يسجّله كونسول المضيف في effect مربوط بـ `roomId` الحالي، ويمسحه عند الخروج. |
| `setLocalPlayback(enabled)` | بوابة كل الدوال العامة. تبقى true في هذا التطبيق (لا دور شاشة). |
| `playLocalSound(key)` | بلا مرآة وبلا بوابة — `leader_gallery_alert` فقط. |
| `loadSoundMap()` | §6.3، idempotent. |
| `reloadSoundMap()` | §6.3 بند 4. |
| `playGameSound(key)` | one-shot. الحجم من `VOLUME_BY_KEY[key] ?? 0.7` (الجدول أدناه). ملف مخصص → مشغّل جديد من الـ pool (يكافئ `cloneNode(true)` — **التداخل مسموح**، أصوات متعددة معاً)، يُتتبع في `oneShotPlayers` ويُزال عند الانتهاء؛ وإلا أصل synth. |
| `playAmbientSound(key)` | حلقة loop، حجم **0.3**، يوقف الـ ambient السابق أولاً (نسخة واحدة دائماً). **بلا fallback توليدي** — بدون ملف مخصص = صمت مع تسجيل `ambientKey` فقط (مهم: يمنع إعادة التشغيل عند تكرار نفس الطور). |
| `stopAmbientSound()` | إيقاف + تصفير الموضع + مسح المراجع. |
| `stopOneShotSounds()` | إيقاف/تصفير/مسح كل الـ one-shots المتتبعة (تُستخدم لقتل أغنية الفوز عند العودة للوبي/إعادة اللعب/الكتم). |
| `duckAmbient()` / `unduckAmbient()` | حجم الـ ambient → **0.08** / استعادة → **0.3**. ducking داخلي (خفض حجم مشغّل الـ ambient يدوياً)، **ليس** OS-level. |
| `playEventSound(key, durationMs = 3000)` | duck → playGameSound → مؤقّت unduck بعد `durationMs`. |
| `playEliminationSound(role?)` | `role == null` → `elimination_citizen`. وإلا: إن وُجد مفتاح مخصص `elimination_<role.toLowerCase()>` في الخريطة → `playEventSound(هو, 5000)`؛ وإلا fallback فريقي: `role ∈ ['GODFATHER','SILENCER','CHAMELEON','WITCH','OLDER_BROTHER','MAFIA_REGULAR']` → `elimination_mafia` وإلا `elimination_citizen` (كلاهما عبر `playEventSound(…, 5000)` — نافذة ducking 5 ثوانٍ للإقصاءات). |
| `playNightStepAmbient(stepType)` | خريطة: `GODFATHER/CHAMELEON/MAFIA_REGULAR/KILL`→`ambient_night_kill`؛ `SILENCER/SILENCE`→`ambient_night_silence`؛ `SHERIFF/INVESTIGATE`→`ambient_night_investigate`؛ `DOCTOR/NURSE/PROTECT`→`ambient_night_protect`؛ `SNIPER/SNIPE`→`ambient_night_snipe`؛ `ASSASSIN`→`ambient_night_assassin` (تشمل معرّفات قدرات المحرك الديناميكي). يعمل فقط بملف مخصص؛ وإلا يبقى `ambient_night` الجاري. |
| `playDrumroll()` | ملف `drumroll` المخصص إن وُجد، وإلا أصل synth (20 نبضة triangle متسارعة — الوصفة في §11). |
| `playImpactBoom()` | ملف `impact_boom` المخصص إن وُجد، وإلا synth (sine 80→30Hz، 0.4s، gain 0.4). |

**جدول `VOLUME_BY_KEY` (يُنقل حرفياً):**

| المفتاح | الحجم |
|---|---|
| `timer_tick`, `timer_heartbeat_fast`, `timer_buzzer`, `vote_cast` | 1.0 |
| `timer_heartbeat_slow`, `vote_shift`, `voting_complete` | 0.9 |
| `leader_gallery_alert` | 0.5 |
| أي مفتاح آخر | 0.7 |

### 6.5 خرائط التشغيل عند الليدر (كونسول المضيف) — كل نقاط الاستدعاء

كلها معكوسة بالمرآة (عدا المذكور)، وكلها محروسة بحالة الكتم `leaderSoundOn` (وهو مكتوم لا تُستدعى الدوال أصلاً ⇒ لا بث مرآة أيضاً):

1. **عند الدخول**: `loadSoundMap()` + استعادة تفضيل الكتم من `leader-sound-on`.
2. **تسجيل المرآة**: effect مربوط بـ `roomId` → `setSoundMirror((fn, args) => socket.emit('leader:sound-play', {roomId, fn, args}))`.
3. **ambient حسب الطور** (إدارة حلقات leader-authoritative، ليست عبر أحداث منفردة) — `AMBIENT_BY_PHASE`:
   `LOBBY`→`ambient_lobby`، `NIGHT`→`ambient_night`، `DAY_DISCUSSION`→`ambient_day`، `DAY_VOTING`→`ambient_voting`، `DAY_JUSTIFICATION`→`ambient_justification`، `DAY_ELIMINATION`→`ambient_elimination`، `MORNING_RECAP`→`ambient_morning`.
   يُشغَّل عند تغيّر الطور إن اختلف المفتاح عن الجاري؛ يتوقف عند الكتم أو عند طور بلا مفتاح؛ يتوقف عند مغادرة الشاشة.
4. **`game:phase-changed`**: إن كان الطور `LOBBY` → `stopOneShotSounds()`. خريطة الـ stings `PHASE_STING`: `NIGHT`→`phase_night_start`، `DAY_DISCUSSION`→`phase_day_start`، `DAY_VOTING`→`phase_voting_start`، `DAY_ELIMINATION`→`phase_elimination` → `playGameSound(sting)`. (ملاحظة: مفاتيح `phase_*` صامتة عمداً بلا ملف مخصص.)
5. **مؤقّت النقاش** (فحص كل 100ms أثناء حالة SPEAKING): المتبقي ≤10 و>0 → `timer_tick` مرة لكل ثانية (dedupe بمرجع آخر ثانية)؛ الوصول إلى 0 (قادماً من >0) → `timer_buzzer`.
6. **مؤقّت التبرير**: نفس نمط tick/buzzer حرفياً.
7. **مؤقّت اللعبة العام** (فحص كل 1s، يعمل فقط في نافذة ≤60 ثانية متبقية): المتبقي ≤10s → `timer_heartbeat_fast` كل ثانية؛ وإلا كل 5 ثوانٍ → `timer_heartbeat_slow`؛ الانتهاء → `timer_buzzer`.
8. **`day:vote-update`**: إن كان `totalVotesCast` مساوياً للسابق (تحويل صوت لا إضافة) → `vote_shift`، وإلا → `vote_cast` (تتبع العدد الأخير بمرجع).
9. **`day:elimination-revealed`**: استخراج الدور من `revealedRoles` (يدعم شكلَي مصفوفة `[{role}]` أو كائن) → `playEliminationSound(role)`.
10. **`game:over`**: سلسلة `winner` تحوي `JESTER`→`win_jester`؛ `ASSASSIN`→`win_assassin`؛ `MAFIA`→`win_mafia`؛ وإلا `win_citizen` → `playGameSound(winKey)`.
11. **`game:restarted`**: `stopOneShotSounds()` غير مشروط (يقتل أغنية الفوز محلياً وعلى الشاشة).
12. **`display:morning-event`** (الليدر يستقبله أيضاً) — `MORNING_SOUND_BY_TYPE`: `ASSASSINATION`→`morning_assassination_success`، `ASSASSINATION_BLOCKED`→`morning_protection_success`، `SILENCED`→`morning_silenced`، `SNIPE_MAFIA`→`morning_snipe_mafia`، `SNIPE_CITIZEN`→`morning_snipe_citizen`، `ABILITY_DISABLED`→`morning_ability_disabled`، `ASSASSIN_KILL`→`morning_assassin_kill`، `POLICEWOMAN_EXECUTION`→`morning_policewoman`.
13. **`day:show-silenced`**: `playGameSound('day_show_silenced')`.
14. **`leader:mafia-gallery-alert`** (بمطابقة roomId): `playLocalSound('leader_gallery_alert')` — **غير معكوس، على جهاز الليدر فقط** (سرية anti-cheat)، حجم 0.5.
15. **`admin:sounds-updated`**: `reloadSoundMap()`.
16. **زر الكتم → إطفاء**: `stopOneShotSounds()` + حفظ التفضيل.

### 6.6 المؤقتات والمهل (جدول جامع)

| المؤقّت | القيمة |
|---|---|
| نافذة unduck الافتراضية (`playEventSound`) | 3000ms |
| نافذة unduck للإقصاءات (`playEliminationSound`) | 5000ms |
| فحص مؤقّتي النقاش/التبرير | كل 100ms |
| فحص مؤقّت اللعبة | كل 1s (نافذة نشاط ≤60s متبقية) |
| عتبة heartbeat سريع | ≤10s (كل ثانية) |
| إيقاع heartbeat بطيء | كل 5 ثوانٍ (خارج نافذة الـ 10) |
| عتبة tick | آخر 10 ثوانٍ (كل ثانية) |
| حجم ambient عادي / مخفوض (duck) | 0.3 / 0.08 |
| طول نغمة «دوري» الكلي | ≈1s (ثلاث نغمات: 0 / +0.2s / +0.4s) |

### 6.7 الاهتزازات — سطح اللاعب (تُنقل الأنماط حرفياً، بالميلي ثانية)

تُبنى كخدمة `HapticsService` واحدة تستهلكها شاشات اللاعب:

| الحدث المحفّز | النمط `[اهتزاز,توقف,...]` |
|---|---|
| تغيير رقم مقعدي — `player:seat-changed` (+ كشف عبر state-sync/polling) | `[200,100,200]` |
| عقوبة سُجلت عليّ — `game:penalty-recorded` (physicalId = أنا) | `[300,100,300,100,500]` |
| عقوبة على لاعب آخر — `game:penalty-recorded` | `[100,100]` |
| طردي بالعقوبات — `player:penalty-ejected` | `[500,200,500,200,500]` |
| استلام دوري — `player:role-assigned` (+ fallback polling) | `[100,50,200,50,300]` |
| بدء لعبة جديدة — `game:started` | `200` (نبضة واحدة) |
| نافذة قرار العمدة — `day:mayor-window` (فقط إن `forMayor == true`) | `[120,80,120,80,240]` |
| بدء التصويت — `day:voting-started` | `[100,200]` |
| نجاح تصويتي (كلتا واجهتي التصويت) | `100` |
| إقصائي — `day:elimination-revealed` (قائمة `eliminated[]` تتضمنني) | `[200,100,200]` |
| **دوري بالكلام** — `day:discussion-updated` (انتقال `discussionState.currentSpeakerId` إليّ) | `[200,100,200,100,300]` + نغمة §4.1 |

قواعد: كل استدعاء محاط بحارس توفر الاهتزاز + try/catch صامت (تكافؤ مع حارس `if (navigator.vibrate)` — iOS Safari يفتقده). لا اهتزاز يتكرر لنفس الحدث المكرر (أحداث القدوم المزدوج socket+polling تُخفّض لمرة واحدة بمرجع آخر قيمة).

### 6.8 جلسة الصوت (audio_session) ودورة حياة التطبيق

- **الإعداد الأساسي** (أدوار ليدر): فئة `AVAudioSessionCategory.playback` مع `mixWithOthers` مطفأ. هذا **يحل جذرياً** مشكلة مفتاح الصمت في iOS التي تحتال عليها نسخة الويب بحلقة WAV صامتة مبنية بايتاً بايتاً — **لا تنقل hack الـ keep-alive إطلاقاً**، ولا آلية `visibilitychange` الويبية.
- **الـ ducking الداخلي ليس OS ducking**: خفض 0.3→0.08 هو تعديل حجم مشغّل الـ ambient يدوياً — يبقى كذلك في Flutter (لا تستخدم `duckOthers` له).
- **Interruptions**: عند مقاطعة (مكالمة هاتفية/منبّه): أوقف الـ ambient مؤقتاً؛ عند انتهاء المقاطعة (`AudioInterruptionEvent` بنهاية shouldResume) استأنف الـ ambient لنفس `ambientKey` الجاري من موضعه.
- **دورة الحياة** (`AppLifecycleListener`): عند `resumed` أعد تفعيل الجلسة (`session.setActive(true)`) واستأنف الـ ambient إن كان يجب أن يعمل — هذا هو المكافئ الوحيد المطلوب لمستمع `visibilitychange`. عند خلفية طويلة لا حاجة لتشغيل خلفي (جهاز الليدر يبقى مستيقظاً — `wakelock_plus` مفعّل في كونسول المضيف طوال الجلسة).
- **التعايش مع صوت الريموت (31-voice-realtimekit.md)**: عند تفعيل مكالمة RealtimeKit تتحول الجلسة إلى `playAndRecord` + `defaultToSpeaker` (مكافئ hack توجيه السماعة في useVoice.ts)، وتُخفض أصوات اللعبة تحت الصوت البشري (mixWithOthers/duckOthers من جهة الـ SFX). التفاصيل التنفيذية هناك؛ العقد هنا: SoundManager يجب أن يقبل «وضع مكالمة» يخفض مستوياته دون تغيير منطقه.

### 6.9 إعادة الاتصال واستعادة الحالة

- **مرآة الليدر**: عند إعادة اتصال socket (راجع 04-socket-layer.md) وإعادة مصادقة دور الليدر، أعد تسجيل `setSoundMirror` (الويب يربطه بـ effect على `roomId` — نفس الدلالة). لا queue للنداءات الفائتة أثناء الانقطاع — الأصوات لحظية وتفويتها مقبول (تكافؤ).
- **استعادة الـ ambient**: بعد استعادة الحالة (state sync) يعاد تقييم effect الـ ambient على الطور الحالي؛ صفّر `ambientKey` المحفوظ قبل التقييم لإجبار إعادة التشغيل (وبثّها للمرآة) — هذا يعالج أيضاً quirk الويب «شاشة منضمة منتصف الطور بلا ambient حتى يتغيّر الطور» من جهة الليدر.
- **`admin:sounds-updated` الفائت أثناء انقطاع**: عند إعادة الاتصال نفّذ `reloadSoundMap()` احترازياً (رخيص — الخريطة صغيرة والكاش بالاسم).
- **الكتم**: يُقرأ من التخزين المحلي عند كل دخول لكونسول المضيف — ينجو من إعادة التشغيل.

### 6.10 حالات حدّية وقرارات porting ملزمة

1. **الاتجاه الصحيح leader→display** رغم تعليق الهيدر القديم المعكوس في `soundManager.ts` — لا تلتفت له.
2. **أصوات ميتة لا تُنقل**: `bomb_explosion` (لا نقطة استدعاء حية)، `playRevealMafia`/`playRevealCitizen` (dead code في DisplayDayView). لا تُبنى لها أصول.
3. **stings الليل وcard_flip ميتة حالياً**: مفاتيح `night_*` التنفيذية (في NightAnimCinematic) و`card_flip_*` تُستدعى على الشاشة فقط وهي gated ⇒ صامتة فعلياً في النسخة الحية، والليدر لا يستمع لـ `night:animation`. **قرار التكافؤ: لا تُحييها** — كونسول المضيف لا يستدعيها (سلوك مطابق للواقع الحي). وصفاتها تُحفظ في §11 كمرجع إن قرر فريق المنتج إحياءها لاحقاً.
4. **drumroll/impact-boom المحلية على الشاشة** تتجاوز بوابة الـ follower وتصدح من جهاز الشاشة مباشرة (تسلسل RevealCeremony/BombCeremony). كونسول المضيف في الويب **لا** يستدعي `playDrumroll`/`playImpactBoom` — لا تستدعِها من Flutter أيضاً (خطر صوت مزدوج مع الشاشة). تبقيان في الـ whitelist والـ API للتوافق فقط.
5. **التداخل**: one-shots تتداخل بحرية (pool)؛ الـ ambient نسخة واحدة (إيقاف ثم تشغيل).
6. **المرآة تُبث حتى لو اختلفت الخرائط بين الأجهزة** — الحمولة هي نداء الدالة، وكل جهاز يحلّها بخريطته (الجميع يجلب نفس active-map ⇒ متسقة).
7. **`playLocalSound` حراسته من الكتم يدوية** في طبقة الاستدعاء — لا تنسَ فحص حالة الكتم قبل تنبيه المعرض.
8. **قيم الأحجام مقدسة**: `VOLUME_BY_KEY` و0.3/0.08 مضبوطة سمعياً لقاعة فعلية — لا تُعدَّل.
9. **الخريطة قد تتغير أثناء صوت جارٍ**: `reloadSoundMap` لا يقطع الأصوات الجارية؛ التغيير يسري على التشغيلات اللاحقة.

## 7. عقود التكامل

### 7.1 REST

| Method/Path | Auth | Request | Response | متى |
|---|---|---|---|---|
| `GET /api/sounds/active-map` | لا | — | `{ success: true, map: { "<eventKey>": "/uploads/sounds/<filename>" } }` — خريطة فارغة عند خطأ/غياب DB وما تزال `success:true` | مرة عند دخول كونسول المضيف + عند `admin:sounds-updated` + احترازياً بعد إعادة الاتصال |
| `GET /uploads/sounds/<filename>` | لا (static) | — | ملف صوتي (mp3/wav/ogg/webm/mp4/m4a، حتى 50MB) | تنزيل الكاش |

(للسياق فقط — لا يستدعيها هذا التطبيق: `GET /api/sounds`، `POST /api/sounds/upload`، `PUT /api/sounds/:id`، `PUT /api/sounds/:id/toggle`، `DELETE /api/sounds/:id` — كلها أدمن، وكل تعديل يبث `io.emit('admin:sounds-updated')` عالمياً.)

### 7.2 Socket (عبر 04-socket-layer.md)

| الحدث | الاتجاه | الحمولة | متى |
|---|---|---|---|
| `leader:sound-play` | التطبيق (دور ليدر) → السيرفر | `{ roomId, fn: string, args: any[] }` — الـ backend يتجاهل `roomId` في الحمولة ويعتمد `socket.data.roomId` | عند كل نداء عام لـ SoundManager والمرآة مسجلة والكتم مطفأ |
| `display:sound-play` | السيرفر → سوكيتات `role==='display'` فقط | `{ fn, args }` | **لا يصل لهذا التطبيق أبداً** (لا دور شاشة) — مذكور لاكتمال العقد |
| `admin:sounds-updated` | السيرفر → الجميع (بث عالمي) | بلا حمولة | أي رفع/تعديل/تفعيل/حذف صوت من الأدمن → `reloadSoundMap()` |
| `leader:mafia-gallery-alert` | السيرفر → الليدر | تتضمن `{ roomId, physicalId, ... }` | فتح لاعب لمعرض الصور → `playLocalSound('leader_gallery_alert')` غير معكوس + الاهتزاز/التنبيه من شريحة كونسول المضيف |

**عقد whitelist الـ backend (يجب ألا يُخرق من جهة العميل):** يقبل فقط سوكيتات `socket.data.role === 'leader'`؛ `fn` يجب أن يكون أحد 11 اسماً بالضبط: `playGameSound, playAmbientSound, stopAmbientSound, stopOneShotSounds, duckAmbient, unduckAmbient, playEventSound, playEliminationSound, playNightStepAmbient, playDrumroll, playImpactBoom`؛ `args` تُعقَّم إلى `null|string|number` بحد أقصى **3 عناصر**؛ التسليم لسوكيتات `role==='display'` في الغرفة عبر فلتر fetchSockets (**لا يوجد display room**).

**أحداث محفّزة للصوت/الاهتزاز (استقبال — الحقول المستعملة فعلياً):** `game:phase-changed {phase}`؛ `day:vote-update {totalVotesCast}`؛ `day:elimination-revealed {revealedRoles: [{role}]|{...}, eliminated[]}`؛ `game:over {winner}`؛ `game:restarted`؛ `display:morning-event {type}`؛ `day:show-silenced`؛ `player:seat-changed {oldPhysicalId,newPhysicalId}`؛ `game:penalty-recorded {physicalId,penalties,maxPenalties,message,isKicked}`؛ `player:penalty-ejected {reason,penalties,maxPenalties}`؛ `player:role-assigned {role,mafiaTeam?,sibling?}`؛ `game:started`؛ `day:mayor-window {forMayor,timeoutSeconds}`؛ `day:voting-started {candidates,playersInfo,playerVotes,durationSeconds}`؛ `day:discussion-updated {discussionState.currentSpeakerId}`.

## 8. نماذج Dart المطلوبة

```dart
// 02-models-data-layer.md
class ActiveSoundMapResponse {
  final bool success;
  final Map<String, String> map; // eventKey → "/uploads/sounds/<filename>"
}

class SoundMirrorCall {           // حمولة leader:sound-play
  final String roomId;
  final String fn;                // أحد أسماء الـ whitelist الأحد عشر
  final List<Object?> args;       // ≤3، عناصرها String|num|null فقط
}

class CachedSoundEntry {
  final String eventKey;
  final String remoteUrl;         // محلول مقابل baseUrl
  final String fileName;          // فريد زمنياً — مفتاح صلاحية الكاش
  final String? localPath;        // null = لم يكتمل التنزيل
}

abstract class SoundKeys {        // ثوابت الكتالوج الـ 58 + الإضافية (§11)
  static const ambientLobby = 'ambient_lobby'; /* ... البقية حرفياً ... */
}

abstract class SoundVolumes {
  static const byKey = <String, double>{ /* جدول §6.4 */ };
  static const fallback = 0.7;
  static const ambient = 0.3;
  static const ambientDucked = 0.08;
}

class HapticPatterns {            // جدول §6.7 كثوابت List<int>
  static const seatChanged = [200, 100, 200]; /* ... */
}

enum SoundRole { player, leader } // يحدد سلوك الخدمة (لا يوجد دور display)
```

خرائط ثابتة إضافية (const): `ambientByPhase`، `phaseSting`، `morningSoundByType`، `nightStepAmbient`، `mafiaRoleKeys` (الستة)، `remoteSoundFns` (أسماء الـ whitelist الأحد عشر).

## 9. الحزم المستخدمة

- `just_audio` — التشغيل: مشغّل ambient واحد بوضع loop + pool مشغّلات one-shot (التداخل)، حجم لكل مفتاح.
- `audio_session` — فئة `playback`، معالجة المقاطعات، التعايش مع RealtimeKit. **حرجة.**
- `vibration` — أنماط الاهتزاز على Android (يدعم القوائم).
- `flutter/services.dart` (`HapticFeedback`) — بديل iOS للأنماط (§10).
- `path_provider` — مجلد كاش الملفات المنزّلة.
- `shared_preferences` — مفتاح `leader-sound-on`.
- `wakelock_plus` — إبقاء جهاز الليدر مستيقظاً (يُفعَّل من 30-host-console.md؛ مذكور هنا لالتصاقه بالخدمة الصوتية).
- `socket_io_client` — عبر طبقة 04-socket-layer.md (لا اتصال مباشر من هذه الخدمة).

## 10. اختلافات Android / iOS

- **الاهتزاز**: Android يدعم الأنماط `[on,off,on,...]` كاملة عبر `Vibration.vibrate(pattern: ...)` — تُنقل الأنماط حرفياً. iOS لا يدعم الأنماط الحرة: ترجم كل نمط إلى سلسلة `HapticFeedback.heavyImpact()` بعدد نبضات النمط مع مهل `Future.delayed` مطابقة لفواصله (أو CoreHaptics عبر حزمة متخصصة إن أردت دقة أعلى لاحقاً). القاعدة: عدد النبضات وإيقاعها التقريبي يحاكي النمط، ولا يُرمى أي حدث.
- **مفتاح الصمت iOS**: فئة `playback` في `audio_session` تجعل أصوات كونسول المضيف مسموعة رغم مفتاح الصمت — بديل hack الـ WAV الصامت الويبي (لا يُنقل). على Android لا مشكلة مكافئة؛ الأصوات على قناة media العادية.
- **Audio focus (Android)**: `audio_session` تدير طلب/فقد التركيز — عند فقده المؤقت (نغمة إشعار) اخفض الـ ambient (نفس دالة duck) واستعده بعدها.
- **الخلفية**: لا حاجة لـ `UIBackgroundModes: audio` في iOS ولا foreground service في Android — الصوت مطلوب فقط والتطبيق بالمقدمة وجهاز الليدر مستيقظ بـ wakelock (تكافؤ مع الويب حيث يتوقف الصوت عند إخفاء الصفحة أصلاً).

## 11. الأصول المطلوبة

**لا ملفات صوتية جاهزة تُنسخ من المشروع** — مجلد `frontend/public/sounds/` فارغ (`.gitkeep` فقط) و`backend/uploads/sounds/` يُملأ من الأدمن وقت التشغيل. الأصول المطلوبة تُولَّد:

### 11.1 أصول synth مسبقة التصيير (القرار الموصى به والملزم)

بدل محاكاة Web Audio وقت التشغيل، صيّر الوصفات التالية مسبقاً إلى ملفات (wav/ogg 44.1kHz) مضمّنة في `assets/sounds/synth/` — سكربت توليد (Node/Web Audio OfflineAudioContext أو Python) يبني كل ملف من وصفته الحرفية:

**تُستخدم فعلياً في كونسول المضيف (إلزامية):**
- `timer_heartbeat_slow`: نبضة مزدوجة sine 80Hz (gain 0.4 ثم 0.28) + طبقة نقرة triangle 700Hz (gain 0.18، 0.08s) — الـ 60Hz وحده غير مسموع على سماعات التابلت.
- `timer_heartbeat_fast`: sine 90Hz (gain 0.6/0.4) + نقرة square حادة 950Hz (gain 0.3، 0.09s).
- `timer_tick`: نقرة بطبقتين — square 1100Hz gain 0.45 (0.09s) + sine 2200Hz gain 0.18 (0.06s).
- `timer_buzzer`: أزيز نشاز بطبقتين 1.1s — square 180→110Hz gain 0.55 + sawtooth 360→220Hz gain 0.3.
- `vote_cast`: chirp sine 800→1200Hz، 0.1s، gain 0.5.
- `vote_shift`: thud sine 150→40Hz، 0.3s، gain 1.0.
- `voting_complete`: sine C5→E5 (523.25/659.25Hz)، 0.3s، gain 0.2.
- `leader_gallery_alert`: 3 صفارات square صاعدة 880/1320/1760Hz بتباعد 0.16s، gain 0.4 لكل منها.
- `win_mafia`: 5 نوتات sawtooth داكنة 110/92/82/65/55Hz متدرجة البدء 0–1.5s، كل منها ينزلق إلى 0.7×تردده، ذيول 2–3s، gain 0.15.
- `win_citizen`: لحن sine ساطع [523,659,784,1047,784,1047,1319] بفواصل 0.25s + وتر مستدام 262/330/392Hz، gain ≈0.12.
- `win_jester`: 7 نوتات triangle ملتوية [440,880,330,660,550,1100,220] كل منها ينحني 1.5× صعوداً ثم 0.5× نزولاً (ضحكة هستيرية) + ذيل 110Hz.
- `win_assassin`: 5 «طعنات» sawtooth [600,500,400,300,200] بفواصل 0.3s كل منها يهبط إلى 0.3× + ذيل 80Hz لمدة 3s.
- `morning_assassination_success` (= وصفة `night_assassination`): sawtooth 800→50Hz خلال 0.3s، gain 0.4→0.01، طول 0.4s.
- `morning_protection_success` (= `night_protection`): triangle 1200→400Hz، gain 0.3، 0.6s.
- `morning_snipe_mafia` / `morning_snipe_citizen` (= `night_snipe`): square 2000→100Hz في 0.15s، gain 0.5، 0.2s (طلقة).
- `morning_silenced` (= `night_silence`): sine 200→50Hz، gain 0.15، 0.6s.
- `morning_assassin_kill`: sawtooth 900→60Hz، 0.6s، gain 0.4.
- `morning_policewoman`: صافرة triangle 880/660/880Hz، 0.5s، gain 0.2.
- `day_tie`: نغمتا triangle 440Hz (0–0.4s و0.5–0.9s)، gain 0.15.
- `day_show_silenced`: sine 300→100Hz، 0.4s، gain 0.12.
- `drumroll`: 20 نبضة triangle متسارعة (تردد 100+i×3 Hz، تباعد i×0.06s، gain 0.06+i×0.005).
- `impact_boom`: sine 80→30Hz، 0.4s، gain 0.4.

**وصفات محفوظة كمرجع (ميتة حالياً — لا تُصيَّر ولا تُستدعى، انظر §6.10 بند 3):** `night_assassination`، `night_investigation` (sine 60Hz drone، gain 0.2→0.3→تلاشٍ، 0.8s)، `night_protection`، `night_snipe`، `night_silence`، `night_assassin` (sawtooth 600→100Hz، 0.5s، gain 0.35)، `card_flip_godfather` (sawtooth 120→60Hz، 0.8s، gain 0.3)، `card_flip_sheriff` (أربيجيو triangle 523/659/784Hz، 0.5s، gain 0.2)، `card_flip_mafia` (square 200→80Hz، 0.4s، gain 0.15)، `card_flip_citizen` (sine 440→880Hz، 0.2s، gain 0.1)، `bomb_explosion` (sawtooth 150→20Hz 1.2s gain 0.5 + square 80→30Hz 0.8s gain 0.3)، `morning_ability_disabled` (بلا وصفة أصلاً).

**صامتة عمداً (ملف مخصص من الأدمن فقط، لا أصل مضمّن):** كل `phase_*` الأربعة، كل `ambient_*` الأحد عشر، كل `elimination_*` الاثنا عشر، `night_witch`.

### 11.2 أصل نغمة اللاعب

- `my_turn_chime`: الوصفة في §4.1 (sine ثلاثية 660/880/1100Hz) — يُصيَّر مسبقاً ويضمَّن في تطبيق اللاعب.

### 11.3 الكتالوج الكامل للمفاتيح (58 مفتاحاً — عقد لوحة الأدمن، أي منها قد يصل في active-map)

`ambient_lobby`؛ `ambient_day, ambient_voting, ambient_justification`؛ `ambient_night, ambient_night_kill, ambient_night_silence, ambient_night_investigate, ambient_night_protect, ambient_night_snipe, ambient_night_assassin`؛ `night_assassination, night_investigation, night_protection, night_snipe, night_silence, night_assassin`؛ `ambient_morning, morning_assassination_success, morning_protection_success, morning_snipe_mafia, morning_snipe_citizen, morning_silenced, morning_assassin_kill, morning_policewoman, morning_ability_disabled`؛ `elimination_godfather, elimination_silencer, elimination_chameleon, elimination_mafia, elimination_sheriff, elimination_doctor, elimination_sniper, elimination_policewoman, elimination_nurse, elimination_citizen, elimination_assassin, elimination_jester`؛ `card_flip_godfather, card_flip_sheriff, card_flip_mafia, card_flip_citizen`؛ `win_mafia, win_citizen, win_jester, win_assassin`؛ `timer_heartbeat_slow, timer_heartbeat_fast, timer_tick, timer_buzzer`؛ `vote_cast, vote_shift`؛ `phase_day_start, phase_night_start, phase_voting_start, phase_elimination`؛ `bomb_explosion, day_tie, day_show_silenced, voting_complete`؛ `leader_gallery_alert`.
**+ مفاتيح خارج الكتالوج مستعملة بالكود** (قابلة للتخصيص إن طابق اسم المفتاح): `drumroll`، `impact_boom`، `night_witch`، `elimination_witch`/`elimination_older_brother`/`elimination_mafia_regular` (ضمنية عبر `elimination_<role.toLowerCase()>`) ومفاتيح أدوار المحرك الديناميكي.

### 11.4 أيقونات

- 🔊 / 🔇 (إيموجي) لزر الكتم — بلا ملفات أيقونات.

## 12. معايير القبول — checklist تكافؤ

- [ ] هاتف اللاعب لا يُصدر أي صوت من أصوات اللعبة في أي طور (ambient/stings/فوز/إقصاء) — الاختبار: جولة كاملة وسماعة الهاتف مرفوعة.
- [ ] نغمة «دوري بالكلام» تعمل عند انتقال الدور إليّ فقط (لا عند دور غيري)، مع اهتزاز `[200,100,200,100,300]`، وطابعها الصوتي مطابق (3 نغمات صاعدة ≈1s).
- [ ] كل أنماط الاهتزاز الأحد عشر في جدول §6.7 تُطلق على أحداثها الصحيحة بالقيم الحرفية على Android، وبمكافئ haptic معقول على iOS، بلا تكرار للحدث الواصل مرتين (socket+polling).
- [ ] كونسول المضيف: `GET /api/sounds/active-map` يُجلب عند الدخول، والملفات تُنزَّل للكاش المحلي، والتشغيل يفضّل الملف المحلي ثم streaming ثم synth.
- [ ] `admin:sounds-updated` يعيد جلب الخريطة، ينزّل الجديد فقط (بالاسم الفريد)، ويحذف غير المُشار إليه.
- [ ] كل نداء عام من كونسول المضيف يبث `leader:sound-play {roomId, fn, args}` مرة واحدة بالضبط، وأسماء fn محصورة بالأحد عشر، وargs ≤3 قيم عددية/نصية — شاشة العرض الويب تعيد التنفيذ بشكل مسموع (اختبار تكامل مع الشاشة الحية).
- [ ] `playLocalSound('leader_gallery_alert')` لا يبث للمرآة أبداً — الشاشة لا تصدر التنبيه (اختبار سرية anti-cheat).
- [ ] الـ ambient حسب الطور يطابق `AMBIENT_BY_PHASE`، نسخة واحدة، حجم 0.3، duck إلى 0.08 أثناء `playEventSound` مع عودة بعد 3000ms (و5000ms للإقصاءات).
- [ ] stings الأطوار ومنطق tick/buzzer/heartbeat بالعتبات الحرفية (≤10s tick كل ثانية؛ heartbeat سريع ≤10s وبطيء كل 5s ضمن نافذة 60s؛ buzzer عند الصفر).
- [ ] `day:vote-update`: نفس الإجمالي → `vote_shift`، زيادة → `vote_cast`.
- [ ] أصوات الفوز حسب `winner` (JESTER/ASSASSIN/MAFIA/غيره) و`game:restarted` أو العودة للوبي توقفها فوراً محلياً وعلى الشاشة.
- [ ] `playEliminationSound`: المفتاح المخصص أولاً ثم fallback الفريق بقائمة أدوار المافيا الستة.
- [ ] زر الكتم: الألوان والقياسات والنصوص الحرفية في §4.2، الإطفاء يقتل الـ one-shots ويُحفظ في `leader-sound-on`، والحالة تنجو من إعادة تشغيل التطبيق.
- [ ] iOS: أصوات كونسول المضيف مسموعة ومفتاح الصمت مفعّل (فئة playback) — بلا hack الـ WAV.
- [ ] مقاطعة بمكالمة هاتفية ثم العودة: الـ ambient يستأنف تلقائياً.
- [ ] إعادة اتصال socket أثناء اللعبة: المرآة تُعاد، والـ ambient يُعاد تشغيله للطور الحالي (ويصل للشاشة).
- [ ] فشل الشبكة عند جلب الخريطة: لا رسالة خطأ، ويعمل كل شيء من الـ synth المضمّن.
- [ ] الأصوات الميتة (`bomb_explosion`، card_flip، night_* التنفيذية، drumroll/boom من الليدر) غير مستدعاة من التطبيق.

## 13. ملاحظات أداء وأمان

- **الأداء**: حمّل أصول الـ synth المضمّنة مسبقاً في الذاكرة عند دخول كونسول المضيف (ملفات قصيرة <2s معظمها)؛ pool الـ one-shot بحجم أقصى معقول (8 مشغّلات) مع إعادة استخدام؛ لا تنشئ `AudioPlayer` لكل نقرة مؤقّت — أعد استخدام مشغّل مخصص لأصوات المؤقّت عالية التردد (tick/heartbeat كل ثانية). فحوص المؤقتات (100ms/1s) يجب أن تكون خفيفة (مقارنة أعداد فقط).
- **الكاش**: ملفات حتى 50MB نظرياً — نزّل تسلسلياً بالخلفية ولا تحجب التشغيل (streaming fallback موجود)؛ نظّف غير المُشار إليه عند كل reload لمنع تضخم التخزين.
- **الأمان**: `active-map` وملفات `/uploads` عامة بلا auth (بتصميم الـ backend) — لا تخزّن فيها شيئاً حساساً ولا تفترض سرية. سرية `leader_gallery_alert` تُفرض عميلاً (عدم البث) وخادماً (whitelist) معاً — أي إعادة هيكلة يجب ألا تمرر هذا المفتاح عبر المرآة. الـ backend يتجاهل `roomId` من الحمولة ويعتمد `socket.data.roomId` — لا يمكن للعميل التصويت لغرفة أخرى، لكن أبقِ الحقل في الحمولة للتوافق.
- **ضبط الصوت**: لا logging لأسماء الأصوات المشغّلة في production على أجهزة اللاعبين (قد تسرّب أحداث ليلية)؛ لوغ كونسول المضيف مقبول.
- **البطارية**: جلسة الليدر تمتد ساعات مع wakelock — أوقف مؤقتات الفحص (100ms) خارج الأطوار التي تحتاجها.
