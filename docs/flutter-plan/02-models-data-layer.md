# طبقة النماذج: كل نماذج Dart المطلوبة (GameState وما حولها)
> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

## 1. الهدف والنطاق

هذا الملف هو **المصدر الوحيد** لتعريف كل نماذج Dart (data classes / enums / converters) التي يستهلكها تطبيق اللاعب في Flutter. يغطي:

- عائلة `GameState` الكاملة كما هي في المصدر الرسمي `backend/src/game/state.ts` (وليس النسخة المختصرة في `frontend/src/hooks/useGameState.ts` — انظر §6.1 للتعارضات).
- نماذج ردود السوكِت المركزية (`room:get-my-state` snapshot، `room:rejoin-player`، `room:auto-join` union).
- نماذج الإعدادات الديناميكية (`RoleDef`, `CardTemplateDef`, `AbilityDef`, `RankEffectsDef`) من `/api/game-config/*`.
- نماذج الحساب/الجلسة (`PlayerAccount`, `PlayerSession`, `StaffInfo`, `ActiveGameInfo`).
- نماذج REST: الحجوزات، الأنشطة، الرانك/المواسم، سجل المباريات، الإشعارات، الاستبيانات، طلبات F&B.
- الثوابت النصية العربية المشتركة (أسماء الأدوار/المراحل/الأيقونات) والمحوّلات (converters) الموحّدة مع كل مخاطر الـ serialization.

خارج النطاق: منطق الشبكة نفسه (REST client في 03، socket client في 04)، إدارة الحالة (store في 20)، وأي widgets.

**التقنية المعتمدة:** `freezed` + `json_serializable` لكل النماذج؛ نماذج غير قابلة للتغيير (immutable) مع `copyWith`؛ unions/sealed classes للحمولات متغيرة الشكل.

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

| الملف | ما يُؤخذ منه |
|---|---|
| `unified-mafia/backend/src/game/state.ts` | **المصدر الرسمي** لـ `GameState` وكل ما داخله: `Phase`, `Player`, `GameConfig`, `VotingState`, `NightActions`, `MorningEvent`, `AssassinContract/State`, `TwinState`, `LuckyDrawState`, `DiscussionState`, `Candidate/Deal`, `ROLE_NAMES_AR`, `SPECIAL_ROLES` + القيم الافتراضية في `createRoom()` |
| `unified-mafia/backend/src/game/roles.ts` | enum ‏`Role` الرسمي (16 دوراً) وتقسيمة الفرق |
| `unified-mafia/backend/src/game/mayor-engine.ts` | `MayorState`, `MayorWindow`, `MayorDecision` |
| `unified-mafia/backend/src/game/dynamic-night-resolver.ts` | `DynamicNightState`, `DynamicNightAction` |
| `unified-mafia/frontend/src/lib/constants.ts` | الثوابت النصية: `ROLE_NAMES`, `ROLE_ICONS`, `PHASE_NAMES`, `formatPlayer`, قوائم المافيا/المحايد |
| `unified-mafia/frontend/src/hooks/useGameConfig.ts` | `RoleDef`, `CardTemplateDef`, `AbilityDef`, `RankEffectsDef` + سلوك الكاش (TTL ‏5 دقائق) وقواعد الـ fallback (`master` template، `'مجهول'`) |
| `unified-mafia/frontend/src/hooks/useGameState.ts` | نسخة الويب المختصرة (للمقارنة فقط — لا تُعتمد) |
| `unified-mafia/frontend/src/context/PlayerContext.tsx` | `PlayerData`, `StaffInfo` + مفاتيح التخزين (`mafia_player_auth`, `mafia_player_token`, `mafia_playerId`, `token`, `user`, `leader_token`, `leader_name`) |
| `unified-mafia/backend/src/schemas/player.schema.ts` | جدول `players` (حقول الحساب الكاملة) و`PLAYER_TOKEN_EXPIRY` |
| `unified-mafia/backend/src/schemas/notification.schema.ts` | جدول `player_notifications` وأنواعها |
| `unified-mafia/backend/src/services/player.service.ts` | شكل ردّ `getPlayerProfile` (player + stats + progression + matchHistory) |
| `unified-mafia/backend/src/services/season.service.ts` | شكل صفوف `getSeasonLeaderboard` |
| `unified-mafia/backend/src/services/feedback.service.ts` | `FEEDBACK_QUESTIONS` (11 سؤالاً حرفياً)، `FEEDBACK_KEYS`, `getPendingSessions` |
| `unified-mafia/backend/src/services/progression.service.ts` | `buildDisplayBreakdown` → نموذج `DisplayBreakdown`/`BreakdownLine` |
| `unified-mafia/backend/src/routes/game-config.routes.ts` | مسارات `/api/game-config/*` العامة (GET بلا مصادقة) |
| `unified-mafia/backend/src/routes/player-app.routes.ts` | أشكال الأنشطة/العروض (`locationOffers`) والحجوزات والمباريات |

---

## 3. التبعيات على ملفات الخطة الأخرى

- **01-foundation-theme.md**: يستضيف مكان تعريف الحزم وbuild_runner scripts؛ الثوابت البصرية (ألوان الرتب) تعيش هناك — هذا الملف يعرّف *البيانات* فقط.
- **03-networking-rest.md**: كل `fromJson` هنا يُستدعى من REST client هناك؛ يعتمد على المحوّلات المعرّفة في §8.12.
- **04-socket-layer.md**: نماذج حمولات الأحداث اللحظية (payloads الخاصة بكل event) تُعرَّف هناك وتُبنى فوق النماذج المركزية هنا (`MyStateSnapshot`, `GameStateModel`, `Candidate`...).
- **05-session-auth.md**: يستهلك `PlayerSession`, `PlayerAccount`, `StaffInfo`, `MeResponse`, `ActiveGameInfo` ويملك قواعد التخزين الآمن.
- **20-game-state-core.md**: الـ store المركزي الذي يمسك `MyStateSnapshot`/`GameStateModel` ويطبّق قواعد الدمج في §6.
- **22-role-cards.md**: يستهلك `RoleDef`, `CardTemplateDef` (كل حقول المواضع والأشكال).
- **15-rank.md**: يستهلك `LeaderboardEntry`, `SeasonInfo`, `PlayerProfile.progression`, `RankEffectsDef`.
- **14-games-invites.md**: يستهلك `ActivityUpcoming`, `LocationOffer`, `FollowingBooker`, `MyActiveRoomsGroup`.
- **16-history.md**: يستهلك `MatchHistoryEntry`, `DisplayBreakdown`.
- **17-order-fnb.md**: يستهلك نماذج F&B (§8.11).
- **18-feedback.md**: يستهلك `FeedbackQuestion`, `FeedbackContext`, `FeedbackPendingItem`.
- **19-notifications-inbox.md**: يستهلك `AppNotification`.

---

## 4. الواجهة والتجربة تفصيلياً

**هذه طبقة بيانات بلا أي شاشة أو widget.** مع ذلك، هي *تملك* الثوابت النصية العربية التي تعرضها كل الشاشات، ويجب نسخها حرفياً كما يلي (أي تعديل حرف واحد يكسر التكافؤ مع الويب):

### 4.1 أسماء الأدوار للعرض العام — `ROLE_NAMES` (من `frontend/src/lib/constants.ts`)

| roleId | الاسم الحرفي |
|---|---|
| `GODFATHER` | `شيخ المافيا` |
| `SILENCER` | `قص المافيا` |
| `CHAMELEON` | `حرباية المافيا` |
| `WITCH` | `الساحرة` |
| `OLDER_BROTHER` | `الأخ الأكبر` |
| `MAFIA_REGULAR` | `مافيا عادي` |
| `SHERIFF` | `الشريف` |
| `DOCTOR` | `الطبيب` |
| `SNIPER` | `القناص` |
| `POLICEWOMAN` | `الشرطية` |
| `NURSE` | `الممرضة` |
| `MAYOR` | `العمدة` |
| `CITIZEN` | `مواطن صالح` |
| `YOUNGER_BROTHER` | `الأخ الأصغر` |
| `JESTER` | `المهرج` |
| `ASSASSIN` | `السفّاح` |

fallback عند دور غير معروف أو null: النص الحرفي **`مجهول`** (سلوك `getRoleName` في `useGameConfig.ts`). ملاحظة: هذه الخريطة الثابتة هي fallback فقط — المصدر الأول للأسماء هو `RoleDef.nameAr` من `/api/game-config/roles` (§8.4).

### 4.2 أسماء أدوار عقود السفّاح — `ROLE_NAMES_AR` (من `backend/src/game/state.ts`، **مختلفة عمداً** عن 4.1)

`GODFATHER: 'شيخ المافيا'`, `SILENCER: 'قص المافيا'`, `SHERIFF: 'الشريف'`, `DOCTOR: 'الدكتور'`, `SNIPER: 'القنّاص'`, `CHAMELEON: 'الحرباء'`, `NURSE: 'الممرضة'`, `POLICEWOMAN: 'الشرطية'`, `MAYOR: 'العمدة'`, `JESTER: 'المهرج'`, `WITCH: 'الساحرة'`, `OLDER_BROTHER: 'الأخ الأكبر'`, `YOUNGER_BROTHER: 'الأخ الأصغر'`.
`SPECIAL_ROLES` = مفاتيح هذه الخريطة (الأدوار المؤهلة لعقود السفّاح). لا تُستخدم لعرض دور اللاعب نفسه — فقط في شاشة عقود السفّاح، والوصف يأتي جاهزاً من السيرفر في `AssassinContract.description`.

### 4.3 أيقونات الأدوار — `ROLE_ICONS`

`GODFATHER: 🔪`, `SILENCER: 🤐`, `CHAMELEON: 🦎`, `WITCH: 🔮`, `OLDER_BROTHER: 👥`, `MAFIA_REGULAR: 🎭`, `SHERIFF: 🔍`, `DOCTOR: 💉`, `SNIPER: 🎯`, `POLICEWOMAN: 👮`, `NURSE: 🏥`, `MAYOR: 🎩`, `CITIZEN: 👤`, `YOUNGER_BROTHER: 👥`, `JESTER: 🤡`, `ASSASSIN: 🔪`.

⚠️ ملاحظتان منقولتان من الكود الأصلي: الساحرة تستخدم `🔮` (وليس 🧙‍♀️ لأن ZWJ يتفكك على أندرويد القديم وWindows)، والشرطية `👮` مفردة بلا ZWJ. **التزم بنفس الرموز في Flutter**.

### 4.4 أسماء المراحل — `PHASE_NAMES`

| Phase | الاسم الحرفي |
|---|---|
| `LOBBY` | `اللوبي` |
| `ROLE_GENERATION` | `توليد الأدوار` |
| `ROLE_BINDING` | `ربط الكروت` |
| `DAY_DISCUSSION` | `نقاش نهاري` |
| `DAY_VOTING` | `التصويت` |
| `DAY_JUSTIFICATION` | `التبرير` |
| `DAY_TIEBREAKER` | `كسر التعادل` |
| `NIGHT` | `الليل` |
| `MORNING_RECAP` | `ملخص الصباح` |
| `GAME_OVER` | `نهاية اللعبة` |

المرحلة `DAY_ELIMINATION` موجودة في الـ backend لكنها **بلا اسم عرض في الويب** — في Flutter اعرضها بنفس نص `التصويت` أو حسب ما تقرره شاشة 25-day-voting.md (لا تخترع نصاً جديداً هنا).

### 4.5 تنسيق اسم اللاعب الموحّد

```dart
String formatPlayer(int physicalId, String name) => '#$physicalId - $name';
```
(القاعدة البصرية الموحدة من `constants.ts` — تُستخدم في كل القوائم والبطاقات.)

### 4.6 أسئلة الاستبيان الحرفية — `FEEDBACK_QUESTIONS`

تصل من السيرفر في `GET /api/player-feedback/:sessionId`، لكن نموذجها وقيمها المرجعية (للاختبارات وحالة offline-render) تُثبَّت هنا حرفياً:

| key | dimension | text |
|---|---|---|
| `overall` | `عام` | `تجربتي في هذه الفعالية كانت ممتازة بشكل عام` |
| `venue` | `المكان` | `المكان كان مريحاً ومناسباً (إضاءة، صوت، جلوس، نظافة)` |
| `gameplay` | `تجربة اللعب` | `تجربة اللعب نفسها كانت ممتعة ومشوّقة` |
| `clarity` | `وضوح القوانين` | `كانت القوانين وسير اللعبة واضحة ومفهومة` |
| `pacing` | `الإيقاع` | `إيقاع اللعبة كان مناسباً (لا ممل ولا متسرّع)` |
| `seating` | `توزيع المقاعد` | `آلية توزيع المقاعد كانت عادلة ومريحة` |
| `leader` | `الليدر` | `الليدر كان محترفاً ولبقاً في التعامل` |
| `fairness` | `الحياد` | `شعرت بالعدل والحياد في إدارة اللعبة` |
| `atmosphere` | `الأجواء` | `الأجواء العامة والروح الاجتماعية كانت رائعة` |
| `value` | `القيمة` | `كانت الفعالية تستحق وقتي وتكلفتها` |
| `recommend` | `الولاء` | `أنوي الحضور مجدداً وأنصح أصدقائي بالنادي` |

لا حالات فارغة/خطأ في هذه الطبقة — أخطاء الـ parsing تُرفع كـ exceptions مفصّلة (§6.5) وتعالجها الشاشات.

---

## 5. التكيّف مع الشاشات 6→11 إنش

طبقة النماذج **محايدة تماماً تجاه حجم الشاشة** — لا تحتوي أي منطق تخطيط، وهذا مقصود: أي شرط `if (width > …)` هنا يُعد خطأ معمارياً. مع ذلك، تلتزم هذه الطبقة بثلاثة ضمانات تخدم استراتيجية Window Size Classes في ملفات الشاشات:

- **compact (< 600dp)**: النماذج توفّر مسار الصور الخفيف — `AvatarUrls.thumb(playerId)` يعيد `/uploads/avatars/thumbs/{playerId}.webp` (عرض 192px) لاستخدامه في كل القوائم على الهواتف؛ الشاشات لا تركّب المسار يدوياً أبداً.
- **medium (600–840dp)**: لا شيء إضافي — نفس النماذج؛ رفع أعمدة الشبكات قرار عرض صرف في الشاشات.
- **expanded (> 840dp)**: عناصر اللعب الحساسة التي "تتضاعف بدل أن تتمدد" (بطاقات الأدوار) تعتمد على كون إحداثيات `CardTemplateDef.elements.positions` **نسبية** (أرقام x/y/s تُفسَّر نسبةً إلى صندوق البطاقة كما في الويب) — لذا النموذج يمرّرها كما هي بلا أي تحويل لوحدات مطلقة، وشاشة 22-role-cards.md تضرب في scale factor واحد.

بذلك يكون التكيّف كله في طبقة الواجهة، وأي شاشة تعمل على snapshot واحد مطابق مهما كان الحجم.

---

## 6. المنطق والتدفقات

### 6.1 قرارات النمذجة الحاسمة (تعارضات محسومة من الكود)

1. **`Phase` في Dart تتبع الـ backend وتشمل `DAY_ELIMINATION`**: ملف `frontend/src/lib/constants.ts` يُسقطها، لكن `backend/src/game/state.ts` (المصدر الرسمي) يعرّف 11 قيمة: `LOBBY, ROLE_GENERATION, ROLE_BINDING, DAY_DISCUSSION, DAY_VOTING, DAY_JUSTIFICATION, DAY_TIEBREAKER, DAY_ELIMINATION, NIGHT, MORNING_RECAP, GAME_OVER`. أضف قيمة `unknown` كـ fallback (`@JsonKey(unknownEnumValue: GamePhase.unknown)`) حتى لا يكسر أي طور مستقبلي التطبيق.
2. **الدور (Role) ليس enum مغلقاً في Dart — بل `String`**: المحرك ديناميكي (`useDynamicEngine: true`) والأدوار تُدار من DB عبر `/api/game-config/roles`؛ أي enum مغلق سينكسر عند إضافة دور جديد من لوحة الأدمن. اعتمد `typedef RoleId = String` + كلاس ثوابت `KnownRoles` بالـ 16 قيمة المعروفة، وحسم فريق الدور يكون **أولاً** من كتالوج `RoleDef.team` المحمَّل، و**fallback** للقوائم الثابتة:
   - `MAFIA_ROLES = [GODFATHER, SILENCER, CHAMELEON, WITCH, OLDER_BROTHER, MAFIA_REGULAR]`
   - `NEUTRAL_ROLES = [JESTER, ASSASSIN]`
3. **`MorningEvent.type` تتبع قائمة الـ backend الكاملة** (12 نوعاً — الويب القديم يعرف 9 فقط): `ASSASSINATION, ASSASSINATION_BLOCKED, PROTECTION_FAILED, SNIPE_MAFIA, SNIPE_CITIZEN, SILENCED, SHERIFF_RESULT, ASSASSIN_KILL, ASSASSIN_BLOCKED, ABILITY_DISABLED, TWIN_SUICIDE, TWIN_TRANSFORM` + fallback `unknown`.
4. **`winner` نوعه `'MAFIA'|'CITIZEN'|'JESTER'|'ASSASSIN'|null`** (الـ backend) وليس الثنائي الذي في `useGameState.ts`.
5. **`DealCandidate` يحمل `id: String`** (موجود في الـ backend، ساقط من `constants.ts`) — اجعله `String?` تحسّباً لحمولات قديمة.
6. `useGameState.ts` في الويب hook قديم موجَّه لليدر — **لا يُعتمد** كمصدر شكل؛ التطبيق يعتمد `room:get-my-state` snapshot + `game:state-sync`.

### 6.2 تدفق الـ parsing المركزي

```
JSON (REST via dio / socket ack & event via socket_io_client)
   → Map<String, dynamic>
   → Model.fromJson()  ← يستخدم حصراً المحوّلات في §8.12
   → immutable model → store (20-game-state-core.md)
```

- كل `fromJson` **متسامح مع الحقول الزائدة** (json_serializable الافتراضي) — السيرفر يضيف حقولاً بلا إنذار.
- الحقول الغائبة مقابل null: كل حقل اختياري في TypeScript (`?`) يصبح `T?` في Dart بلا استثناء؛ **لا defaults مخفية** إلا المذكورة صراحة في §8 (منقولة من `createRoom()`).
- دلالات null الجوهرية (تُبنى عليها الواجهات):
  - `role == null` = «لم يُكشف بعد / مُعقَّم» وليس «بلا دور».
  - `votingState/nightState/justificationData/withdrawalState/discussionState/pendingResolution == null` = «الطور غير نشط».
  - `durationSeconds == null` في التصويت = بلا مؤقت.

### 6.3 التعقيم (sanitization) في الغرف الـ remote — دلالات يجب أن يفهمها النموذج

`game:state-sync` و`game:phase-changed.state` و`night:morning-recap` تصل للاعبين **مُعقَّمة**: أدوار الأحياء `null` (أدوار الموتى تبقى)، `nightActions`/`autoNightChoices` محذوفة كلياً، `mayorState` غائب حتى الكشف، `assassinState: null`. لذلك:
- كل هذه الحقول nullable في `GameStateModel` حتى لو كانت non-null في الـ backend.
- **قاعدة الدمج**: دورك أنت لا يُستنتج أبداً من `players[]` في state مُعقَّم؛ مصدره الحصري `player:role-assigned` / `room:get-my-role` / `room:rejoin-player` / `room:get-my-state` (يُخزَّن في الـ store منفصلاً عن الـ state ولا يُكتب فوقه عند وصول sync مُعقَّم).

### 6.4 كاش الإعدادات الديناميكية (استنساخ سلوك `useGameConfig`)

- تحميل متوازٍ لأربعة مسارات: `/api/game-config/roles`, `/card-templates`, `/abilities`, `/rank-effects`.
- كاش عالمي واحد (singleton) بـ TTL = **5 دقائق** (`CACHE_TTL = 5 * 60 * 1000`)؛ `reload(force: true)` يتجاوزه؛ دالة `invalidateGameConfigCache()`.
- فشل التحميل لا يُسقط التطبيق: قوائم فارغة + fallback للثوابت الثابتة (4.1/4.3) — كما يفعل الويب (`console.warn` فقط).
- الرد يُقرأ بنمط `data['data'] ?? data` (السيرفر قد يغلّف بـ `{ data: [...] }`).
- fallback البطاقات: إن لم يكن للدور `cardTemplateId` صالح → القالب `id == 'master'` → أول قالب → null.

### 6.5 الأخطاء والحواف

- **Union ‏`room:auto-join`**: افحص بالترتيب قبل أي parsing كامل: `requiresConfirmation == true` → `code` (`PENDING_SURVEYS` / `HOST_CANNOT_PLAY` / `REMOTE_SUB_REQUIRED`) → `priceMismatch == true` → `success == true` (مع `restoredSeat?`) → فشل عام بـ `error`. النموذج sealed في §8.3.
- **رفض mafia-chat الصامت**: `{ success: false }` بلا `error` — النموذج يجب ألا يعامل غياب `error` كخطأ parsing.
- **enum غير معروف** (phase/type/status جديد): fallback `unknown` دائماً — ممنوع رمي exception بسبب قيمة نصية جديدة.
- **`playerNightActions.timerHandle`**: حقل server-internal قد يظهر في `game:get-state` — تجاهله (`@JsonKey(includeFromJson: false)`).
- **`justificationData` و`nightStep` و`currentNightStep`**: نوعها `any` في السيرفر — تُنمذج `Map<String, dynamic>?` وتُفكَّك في شاشاتها (25/23) وليس هنا.
- exceptions الـ parsing تُغلَّف بـ `ModelParseException(model, field, raw)` مع **تنقيح** القيم الحساسة من الرسالة (لا role ولا phone في الـ logs).

### 6.6 الهوية والتخزين (نموذجياً — التنفيذ في 05-session-auth.md)

- ثلاثة مفاتيح هوية لا تُخلط: `playerId` (الحساب، ثابت)، `physicalId` (المقعد، يتغير بـ `player:seat-changed`)، `phone` (بصيغة الأردن `07…` كما سُجّل).
- مكافئ مفاتيح الويب: `mafia_player_auth` = JSON ‏`{ playerId, name, phone, token }` (نموذج `PlayerSession`)، والمفاتيح المسطّحة `mafia_player_token` و`mafia_playerId` تُدمج في Flutter في سجل secure-storage واحد. حسابات staff المرتبطة تخزن إضافياً: `token` (staff JWT)، `user` (JSON: id/username/displayName/role)، `leader_token`، `leader_name`.
- token اللاعب صالح `30d` (`PLAYER_TOKEN_EXPIRY`)، وpayload الـ JWT بالضبط `{ playerId: int, phone: String, name: String }` — لا تفك التوكن للعرض؛ البيانات من `/me`.

### 6.7 إعادة الاتصال واستعادة الحالة (ملخص نموذجي — التفصيل في 04/20)

`MyStateSnapshot` (§8.3) هو **مصدر الحقيقة** الذي يُستطلع كل 3 ثوانٍ وعند `AppLifecycleState.resumed`؛ كل نماذج هذا الملف صُممت بحيث يُعاد بناء أي شاشة لعب بالكامل من snapshot واحد (تصويت، تبرير، خطوة ليل مع `autoNightTime`، pendingResolution، winner...). لا يوجد نموذج «تراكمي» يعتمد على تاريخ الأحداث.

---

## 7. عقود التكامل — خريطة نموذج ↔ عقد

العقود الكاملة (methods/paths/payloads) في 03-networking-rest.md و04-socket-layer.md. هنا خريطة الالتزام: **كل نموذج يلتزم حرفياً بحقول العقد المقابل ولا يُستخدم لعقد آخر.**

### 7.1 REST

| Endpoint | النموذج |
|---|---|
| `POST /api/player-auth/register` , `POST /api/player-auth/login` | `AuthResult` (+`PlayerAccount` جزئي) |
| `GET /api/player-auth/me` | `MeResponse` = `PlayerAccount` + `StaffInfo?` + `staffToken?` + `ActiveGameInfo?` + `List<ActiveGameInfo> frozenGames` |
| `POST /api/player-auth/change-password` | `{ success, token, message }` — بلا نموذج مخصص (record) |
| `GET /api/player-app/leaderboard`, `GET /api/seasons/public/:id/leaderboard` | `LeaderboardEntry` |
| `GET /api/seasons/public/list`, `/online-list`, `/active` | `SeasonInfo` (+`activeOnlineSeasonId: int?` في online-list، و`season: SeasonInfo?` في active) |
| `GET /api/player-app/search?q=` | `SearchResult` |
| `GET /api/player-app/activities/upcoming` | `ActivityUpcoming` (+`LocationOffer`) |
| `GET /api/player-app/activities/:actId/following-bookers` | `FollowingBooker` |
| `GET /api/player-app/my-active-rooms` | `MyActiveRoomsGroup` + `ActiveRoomEntry` |
| `GET /api/player-app/:id/co-players` | `CoPlayer` |
| `GET /api/player-app/:id/following` | `FollowedPlayer` |
| `GET /api/player-app/:id/following-feed` | `FollowingFeedItem` |
| `GET /api/player-app/:id/bookings` | `BookingEntry` |
| `GET /api/player-app/:id/matches` | `MatchHistoryEntry` |
| `GET /api/player/:id/profile` | `PlayerProfile` (player + stats + progression + matchHistory + activeGame) |
| `PUT /api/player/:id/profile`, `POST /api/player/:id/avatar` | `PlayerAccount` (ردّ player)، `{ avatarUrl }` |
| `GET /api/player-notifications/` | `AppNotification` |
| `GET /api/player-feedback/pending` | `FeedbackPendingItem` |
| `GET /api/player-feedback/:sessionId` | `FeedbackQuestion` + `FeedbackContext` + `alreadyDone` |
| `GET /api/fnb/context` | `FnbContext` |
| `GET /api/fnb/menu?activityId=` | `FnbMenuItem` |
| `GET /api/fnb/my-orders?activityId=` | `FnbOrder` + `FnbOrderItem` |
| `GET /api/game-config/roles` / `/card-templates` / `/abilities` / `/rank-effects` | `RoleDef` / `CardTemplateDef` / `AbilityDef` / `RankEffectsDef` — **GET عامة بلا مصادقة** |

### 7.2 Socket (النماذج المركزية فقط — البقية في 04)

| Event / ack | النموذج |
|---|---|
| ack ‏`room:get-my-state` | `MyStateSnapshot` |
| ack ‏`room:rejoin-player` | `RejoinResponse` |
| ack ‏`room:auto-join` | `AutoJoinResult` (sealed union) |
| ack ‏`room:find-by-code` / عناصر `room:list-active` | `RoomSummary` |
| ack ‏`room:get-my-role` | `MyRoleResponse` |
| `game:state-sync`, `game:get-state`.state, `game:phase-changed`.state | `GameStateModel` |
| `player:role-assigned`, `mafia:team-updated` | `RoleAssignment` / `List<MafiaTeamMember>` |
| `night:action-required` | `NightActionRequest` (+`TargetInfo`) |
| `night:sheriff-result` | `SheriffResultPayload` |
| `assassin:contracts-update` | `AssassinContractsUpdate` |
| `mafia:chat-message` / ack ‏`mafia:chat-history` | `MafiaChatMessage` |
| `confrontation:pending/started/ended` | `ConfrontationPendingPayload` / `ConfrontationStartedPayload` / `ConfrontationEndedPayload` |
| ack ‏`voice:get-token` | `VoiceTokenPayload` |
| `display:morning-event` | `MorningEventPayload` |

---

## 8. نماذج Dart المطلوبة

كل النماذج `@freezed` مع `fromJson` مولَّد، إلا ما يُذكر أنه ثوابت. التدوين أدناه: `اسم الحقل: النوع` — nullable يعني الحقل قد يغيب أو يصل null؛ (=X) قيمة افتراضية موثقة من الكود.

### 8.1 التعدادات (enums) والأنواع المفتوحة

```dart
enum GamePhase { LOBBY, ROLE_GENERATION, ROLE_BINDING, DAY_DISCUSSION, DAY_VOTING,
  DAY_JUSTIFICATION, DAY_TIEBREAKER, DAY_ELIMINATION, NIGHT, MORNING_RECAP, GAME_OVER, unknown }

typedef RoleId = String; // مفتوح — المحرك ديناميكي (§6.1)
abstract final class KnownRoles {
  static const godfather='GODFATHER', silencer='SILENCER', chameleon='CHAMELEON',
    witch='WITCH', olderBrother='OLDER_BROTHER', mafiaRegular='MAFIA_REGULAR',
    sheriff='SHERIFF', doctor='DOCTOR', sniper='SNIPER', policewoman='POLICEWOMAN',
    nurse='NURSE', mayor='MAYOR', citizen='CITIZEN', youngerBrother='YOUNGER_BROTHER',
    jester='JESTER', assassin='ASSASSIN';
  static const mafiaRoles = {godfather, silencer, chameleon, witch, olderBrother, mafiaRegular};
  static const neutralRoles = {jester, assassin};
}

enum CandidateType { PLAYER, DEAL, unknown }
enum SpeakerStatus { WAITING, SPEAKING, PAUSED, unknown }
enum GameWinner { MAFIA, CITIZEN, JESTER, ASSASSIN, unknown }
enum MayorDecision { REVOTE, POSTPONE, unknown }           // القيمة المخزّنة في mayorState.decision
// قيم أمر day:mayor-decision المُرسَلة: 'PASS' | 'REVOTE' | 'REVOTE_TOP2' (مرادف) | 'POSTPONE'
enum NightActionType { KILL, INVESTIGATE, PROTECT, SNIPE, SILENCE, DECOY, unknown }
enum MorningEventType { ASSASSINATION, ASSASSINATION_BLOCKED, PROTECTION_FAILED,
  SNIPE_MAFIA, SNIPE_CITIZEN, SILENCED, SHERIFF_RESULT, ASSASSIN_KILL, ASSASSIN_BLOCKED,
  ABILITY_DISABLED, TWIN_SUICIDE, TWIN_TRANSFORM, unknown }
enum Gender { MALE, FEMALE, unknown }                       // الافتراضي في التسجيل MALE
enum GenderConstraint { NONE, FORBID_SAME, FORBID_OPPOSITE, unknown }
enum RankTier { INFORMANT, SOLDIER, CAPO, UNDERBOSS, GODFATHER, unknown } // الترتيب التصاعدي
enum NightMode { manual, auto, unknown }
enum PenaltyScope { game, room, unknown }                   // الافتراضي 'room'
enum FnbOrderStatus { newOrder /*'new'*/, preparing, ready, delivered, cancelled, unknown }
enum LuckyDrawStatus { drawn, revealed, unknown }
enum ActivityStatus { planned, active, unknown }
enum RoleTeam { MAFIA, CITIZEN, NEUTRAL, unknown }
enum SeasonStatus { ACTIVE, ENDED, unknown }
```

كل enum نصي يُفكّ بـ `unknownEnumValue: X.unknown`. `FnbOrderStatus.newOrder` يرتبط بالقيمة `'new'` عبر `@JsonValue('new')` (قائمة القيم المؤكدة من العقد: `'new'…'cancelled'` — أي قيمة وسيطة غير معروفة → `unknown` وتُعرض كما وصلت نصياً).

### 8.2 عائلة GameState (مطابقة `backend/src/game/state.ts` حرفياً)

```dart
class GamePlayer {                    // Player في الـ backend
  int physicalId;
  String name;
  String? phone;
  String? dob;                        // varchar — نص حر وليس DateTime
  String? gender;                     // 'MALE'|'FEMALE'|null
  int? playerId;
  RoleId? role;                       // null = غير مكشوف/مُعقَّم
  bool isAlive;
  bool isSilenced;
  int justificationCount;             // عدد مرات التبرير في الجولة الحالية
  String? addedBy;                    // 'self' | 'leader'
  bool? frozen;                       // مجمّد — انتقل لغرفة أخرى
  String? avatarUrl;                  // نسبي — عبر AvatarUrls (§8.12)
  String? rankTier;                   // INFORMANT→…→GODFATHER (نص — قد يكون null)
  bool? seatHeld;                     // المقعد محجوز 10 دقائق بعد الخروج
  DateTime? heldUntil;                // ⚠️ epoch-ms → epochMsConverter
  bool? isConnected;
  int? penalties;                     // اعتبرها 0 عند null
  bool? penaltyKicked;
  int? disabledUntilRound;            // 🧙‍♀️ تعطيل الساحرة (آخر راوند ضمناً)
  String? disabledRoleName;           // اسم الدور المعطَّل للعرض
}

class Deal { String id; int initiatorPhysicalId; int targetPhysicalId; }

sealed class Candidate {              // union على حقل type
  // PlayerCandidate: { type:'PLAYER', targetPhysicalId:int, votes:int }
  // DealCandidate:   { type:'DEAL', id:String?, initiatorPhysicalId:int,
  //                    targetPhysicalId:int, votes:int }
}

class DiscussionState {
  int? currentSpeakerId;
  int timeLimitSeconds;
  int timeRemaining;
  DateTime? startTime;                // ⚠️ epoch-ms (للمزامنة عبر الشبكة)
  SpeakerStatus status;
  List<int> speakingQueue;
  List<int> hasSpoken;
  bool isFinished;
}

class VotingState {
  int totalVotesCast;
  List<Deal> deals;
  List<Candidate> candidates;
  List<int> hiddenPlayersFromVoting;
  int tieBreakerLevel;
  Map<int,int> playerVotes;           // ⚠️ مفاتيح JSON نصوص → stringKeyedIntMap
  Map<int,int>? leaderProxyVotes;     // نفس التحويل
  int? durationSeconds;               // null = بلا مؤقت
  DateTime? votingStartTime;          // ⚠️ epoch-ms
  bool? mayorRevote;                  // 🎩 جولة مُعادة بأمر العمدة
}

class NightActions {                  // تصل لليدر/المضيف فقط — تُحذف للاعبين
  int? godfatherTarget; int? silencerTarget; int? sheriffTarget;
  String? sheriffResult;
  int? doctorTarget; int? sniperTarget; int? nurseTarget;
  int? assassinTarget; int? witchTarget;
  int? lastProtectedTarget;
  Map<String,bool>? randomSelections;
}

class MorningEvent {
  MorningEventType type;
  int targetPhysicalId;
  String targetName;
  int? performerPhysicalId; String? performerName;
  bool? wasRandom;
  Map<String,dynamic>? extra;
  bool revealed;
}

class AssassinContract {
  int id;                             // ترتيب العقد 1,2,3…
  String type;                        // دائماً 'KILL_ROLE'
  RoleId targetRole;
  String description;                 // نص عربي جاهز من السيرفر
  String? descriptionAr;
  bool completed;
  int? completedAtRound;
}

class AssassinState {
  int assassinPhysicalId;
  List<AssassinContract> contracts;
  int currentContractIndex;           // 0-based
  int completedCount;
  int totalRequired;                  // الافتراضي 4
  bool firstNightPassed;              // false أول ليلة → ممنوع القتل
  int? lastKillRound;
  bool won;
}

class TwinState {
  int olderBrotherPhysicalId;
  int youngerBrotherPhysicalId;
  bool olderAlive; bool youngerAlive;
  bool transformed;
  String? transformedToRole;
  bool? transformNotified;
  bool suicideTriggered;
}

class LuckyDrawState {
  LuckyDrawStatus status;             // 'drawn' | 'revealed'
  int count;
  List<int> winners;                  // physicalIds
  List<int> pool;
  DateTime? revealedAt;               // ⚠️ epoch-ms
}

class MayorWindow {
  Candidate winner;                   // لقطة المرشّح الذي كان سيُعدم
  List<Candidate> top2;
  int topVotes;
  int openedAtRound;
}

class MayorState {
  int mayorPhysicalId;
  bool revealed;                      // يفعّل وزن الصوت
  bool vetoUsed;
  MayorDecision? decision;
  int? revealedAtRound;
  MayorWindow? window;                // سرّية — تصل لليدر + العمدة فقط
}

class PolicewomanState {
  bool isTriggered; int triggerRound; int citizenAliveAtTrigger;
  int threshold; int citizenDeathsSinceTrigger;
  bool isReady; bool isUsed;
  int policewomanPhysicalId; String policewomanName;
}

class PendingBomb {
  int godfatherPhysicalId; int? godfatherPlayerId;
  BombNeighbor? above; BombNeighbor? below;
}
class BombNeighbor { int physicalId; String name; RoleId role; }

class PendingResolution {
  Candidate candidate;
  String type;                        // 'ELIMINATE'|'ACCEPT_DEAL'|'REJECT_DEAL'|'NONE'
}

class WithdrawalState {
  int count; int needed; List<int> withdrawn; List<int> accusedIds; int total;
}

class ConfrontationState {
  String status;                      // 'PENDING_TARGET'|'PENDING_LEADER'|'ACTIVE'
  int requesterId; int targetId;
  DateTime? startedAt;                // ⚠️ epoch-ms
}

class GameTimerState {
  int totalSeconds;
  DateTime startedAt;                 // ⚠️ epoch-ms (Unix)
  bool expired;
}

class DynamicNightAction {
  String abilityId; int performerPhysicalId; int? targetPhysicalId; bool skipped;
}
class DynamicNightState {
  Map<String,DynamicNightAction> actions;   // key = abilityId
  Map<String,int> lastTargets;              // abilityId → آخر هدف
}

class PerformanceTracking {
  List<DealOutcome> dealOutcomes;     // {initiatorPhysicalId,targetPhysicalId,targetRole:String,success:bool}
  List<AbilityResult> abilityResults; // {physicalId,role:String,correct:bool}
  List<EliminationLogEntry> eliminationLog; // {physicalId,eliminatedBy:String,round:int,team:'MAFIA'|'CITIZEN'}
}

class GameConfigModel {               // GameConfig — الافتراضيات من createRoom()
  int maxJustifications;              // (=2)
  int currentJustification;           // (=0)
  String gameName;
  int maxPlayers;                     // (=10، مقيّد 6..50)
  String displayPin;                  // 4 أرقام
  bool allowMafiaReveal;              // (=true)
  NightMode nightMode;                // (=manual؛ الغرف الـ remote تُنشأ auto)
  bool gameTimerEnabled;              // (=false)
  int gameTimerMinutes;               // (=30؛ القيم 30/60/90)
  bool useDynamicEngine;              // (=true)
  int? maxPenalties;                  // (=3)
  bool? maxPlayersManual;
  PenaltyScope? penaltyScope;         // (='room')
  bool? bombEnabled;                  // (=true)
  int? assassinContractCount;         // (=4، المدى 2-6)
  int? jesterSurviveRounds;           // (=2)
  int? maxConsecutiveMafiaGames;      // (=3)
  int? witchDisableRounds;            // (=3)
  int? mayorVoteWeight;               // (=2، المدى 1-4)
  int? autoNightTime;                 // (=15 ثانية، المدى 5-60)
  bool? mafiaChatEnabled;             // (=false، يقرره الليدر كل جولة)
  bool? isRemote;                     // (=false)
  int? hostPlayerId;                  // players.id للمضيف (null لغرف الموظفين)
  bool? allowPlayerInvites;           // (=false)
  String? voiceMeetingId;             // RealtimeKit — يُنشأ عند أول طلب توكن
}

class GameStateModel {                // GameState الرسمي
  String roomId;
  String roomCode;                    // 4 أرقام (رغم تعليق قديم يقول 6)
  GamePhase phase;
  int round;
  GameConfigModel config;
  List<GamePlayer> players;
  List<RoleId>? rolesPool;
  DiscussionState? discussionState;
  VotingState votingState;
  NightActions? nightActions;         // ⚠️ nullable لأنها تُحذف للاعبين (§6.3)
  List<MorningEvent> morningEvents;
  PendingResolution? pendingResolution;
  List<Candidate>? tiedCandidates;
  Map<String,dynamic>? justificationData;   // any في السيرفر
  WithdrawalState? withdrawalState;
  ConfrontationState? confrontation;
  int? confrontationCount;            // حدّ 3 لكل جولة
  int? confrontationRound;
  GameWinner? winner;
  String? pendingWinner;              // فوز معلّق ينتظر تأكيد الليدر
  bool? nurseActivated;
  bool? rolesConfirmed;
  String? startedAt;                  // ⚠️ ISO string (وليس epoch)
  int? matchId; int? sessionId; String? sessionCode; int? activityId;
  PerformanceTracking? performanceTracking;
  Map<int,bool>? playerNightActionsSubmitted; // من playerNightActions.submitted (مفاتيح نصية)
  List<AutoNightChoice>? autoNightChoices;    // ⚠️ تُحذف للاعبين في remote
  bool? autoNightStepApproval;
  Map<String,dynamic>? nightStep;     // any — تفكيك في 23-night-phase.md
  bool? autoNightStepDispatched;
  String? autoNightStepRole;
  int? autoNightPerformerId;          // مُقنَّع null لغير المنفّذ في remote
  GameTimerState? gameTimer;
  DynamicNightState? dynamicNightState;
  PendingBomb? pendingBomb;
  AssassinState? assassinState;
  List<int>? witchPreviousTargets;
  TwinState? twinState;
  MayorState? mayorState;
  LuckyDrawState? luckyDraw;
  Map<String,dynamic>? currentNightStep;
  bool? nightComplete;
  String createdAt;                   // ISO string
}
class AutoNightChoice { int physicalId; int? targetPhysicalId; bool isReal; bool isRandom; }
```

### 8.3 نماذج ردود السوكِت المركزية

```dart
class MyStateSnapshot {               // ack room:get-my-state — مصدر الحقيقة
  MyStatePlayer player;               // {physicalId,name,role?,isAlive,gender?,playerId?,penalties?}
  GamePhase phase;
  bool? isRemote;
  bool? allowPlayerInvites;
  bool? rolesConfirmed;
  VotingState? votingState;
  int? maxPenalties;
  bool? mafiaChatEnabled;
  Map<String,dynamic>? justificationData;
  WithdrawalState? withdrawalState;
  DiscussionState? discussionState;   // يشمل الـ deals ضمن سياقه
  NightStepState? nightState;
  PendingResolution? pendingResolution;
  List<AssassinContract>? assassinContracts;
  SiblingInfo? sibling;
  GameWinner? winner;
  List<RosterEntry> rosterInfo;
  List<GamePlayer>? allPlayers;       // GAME_OVER فقط — مع الأدوار المكشوفة
  List<PlayersInfoEntry>? playersInfo; // الأحياء: id + name
  int? round;
}

class NightStepState {                // nightState داخل الـ snapshot
  Map<String,dynamic>? nightStep;
  String? autoNightStepRole;          // SHERIFF/DOCTOR/…
  int? autoNightPerformerId;          // null لغير المنفّذ في remote (تقنيع أمني)
  NightStepConfig? config;            // { autoNightTime:int }
  bool? playerSubmitted;
}

class RosterEntry {
  int physicalId; String name; String? avatarUrl;
  bool isAlive; String? gender; String? rankTier;
}
class PlayersInfoEntry { int physicalId; String name; String? avatarUrl; }
class MafiaTeamMember { int physicalId; String name; RoleId role; String? avatarUrl; }
class SiblingInfo {                   // التوأم — أحادي الاتجاه (الأكبر يرى الأصغر فقط)
  int physicalId; String name; String? avatarUrl; RoleId? role;
}

class RejoinResponse {                // ack room:rejoin-player
  MyStatePlayer player;               // role تبقى null حتى يُسمح بالكشف
  List<MafiaTeamMember>? mafiaTeam;
  SiblingInfo? sibling;
  List<AssassinContract>? assassinContracts;
  GamePhase phase;
  String gameName; String roomCode;
  VotingState? votingState;
  int? maxPenalties; bool? mafiaChatEnabled;
}

class MyRoleResponse {                // ack room:get-my-role
  RoleId? role; bool confirmed;
  List<MafiaTeamMember>? mafiaTeam; SiblingInfo? sibling;
}

class RoleAssignment {                // event player:role-assigned
  int physicalId; RoleId role;
  List<MafiaTeamMember>? mafiaTeam; SiblingInfo? sibling;
}

sealed class AutoJoinResult {         // ack room:auto-join — ترتيب الفحص في §6.5
  // Joined            { assignedSeat:int, gameName:String?, constraintViolation:dynamic?,
  //                     restoredSeat:bool?, isRemote:bool? }
  // NeedsConfirmation { error:String }                       // requiresConfirmation:true
  // Blocked           { code:String, pendingCount:int?, redirect:String? }
  //                    // PENDING_SURVEYS | HOST_CANNOT_PLAY | REMOTE_SUB_REQUIRED
  // PriceMismatch     { ticketPrice, expectedPrice, selectedOfferName:String? } // أسعار عبر looseNum
  // Failure           { error:String? }
}

class RoomSummary {                   // room:find-by-code / room:list-active
  String roomId; String roomCode; String? gameName;
  int playerCount; int maxPlayers; bool? requireTicket;
}

class NightActionRequest {            // event night:action-required (لكل الأحياء!)
  NightActionType actionType;
  List<TargetInfo> availableTargets;
  int timeoutSeconds;
  bool canSkip;
  String? stepRole;
  bool isDecoy;                       // true = picker زائف يجب عرضه وإرسال إجراء وهمي
}
class TargetInfo { int physicalId; String name; String? avatarUrl; }

class SheriffResultPayload {          // night:sheriff-result
  String result;                      // 'MAFIA' | 'CITIZEN' (الحرباء تُقرأ CITIZEN)
  int targetPhysicalId; String targetName;
}

class AssassinContractsUpdate {       // assassin:contracts-update
  List<AssassinContract> contracts;
  int currentIndex; int completedCount; int totalRequired;
}

class MafiaChatMessage {              // mafia:chat-message + history
  int physicalId; String name; String text;
  DateTime at;                        // ⚠️ epoch-ms
}

class ConfrontationPendingPayload { String status; int requesterId; String? requesterName; int targetId; String? targetName; }
class ConfrontationStartedPayload { int requesterId; int targetId; int durationSeconds; DateTime startedAt; } // 30 ثانية، epoch-ms
class ConfrontationEndedPayload { String reason; } // 'target_declined'|'leader_rejected'|'time_up'

class VoiceTokenPayload {             // ack voice:get-token
  String authToken; String meetingId;
  String participantId;               // 'p{physicalId}' أو 'host'
  String? preset;                     // يقرره السيرفر (isHost/isAlive)
}

class MorningEventPayload {           // display:morning-event (بانرات الصباح)
  String type;                        // مثل 'TWIN_TRANSFORM'
  int? targetPhysicalId; String? targetName;
  Map<String,dynamic>? extra;
}
```

### 8.4 نماذج الإعدادات الديناميكية (مطابقة `useGameConfig.ts`)

```dart
class RoleDef {
  String id;                          // = RoleId
  String nameAr; String nameEn;
  RoleTeam team;                      // MAFIA | CITIZEN | NEUTRAL
  List<String> abilities;
  String description;
  String? cardTemplateId;
  Map<String,dynamic>? cardOverrides;
}

class AbilityDef {
  String id; String nameAr; String nameEn;
  String phase;                       // 'NIGHT' | 'DAY' | 'BOTH'
  String effectType;
}

class CardTemplateDef {
  String id;                          // 'master' هو الـ fallback
  String gradient; String borderColor; String textColor; String glowEffect;
  TeamBadge? teamBadge;               // {text,bgColor,textColor,borderColor}
  CardIcon? icon;                     // {type:'lucide'|'emoji'|'image', value}
  SecretFace? secretFace;             // {type:'default'|'custom', customImageUrl?, overlayGradient?}
  CardElements? elements;
}
class CardElements {
  bool showPlayerNumber; bool showClubBranding; bool showDescription;
  String? customFooterText; String? fontFamily;
  double? nameSize; double? badgeSize; double? iconSize;
  CardPositions? positions;           // كل موضع {x,y,s?} + coverPhoto يضيف {w?,h?}
  List<CardShape>? shapes;
}
class CardPositions {                 // كل الحقول ElementPosition?
  // badge, icon, title, number, footer, playerName,
  // coverNumber, coverName, coverBranding, coverFooter, coverPhoto
}
class ElementPosition { double x; double y; double? s; double? w; double? h; }
class CardShape {
  String id; String face;             // 'role' | 'cover'
  String type;                        // 'rect' | 'circle'
  double x; double y; double w; double h;
  String bg; double opacity; int zIndex; double radius;
}

class RankEffectsDef {
  String id;                          // = tier id (INFORMANT…GODFATHER)
  String nameAr; int sortOrder;
  RankEffects effects;
}
class RankEffects {                   // كل الحقول non-null داخل الرد
  BorderEffect border;      // {enabled,color,width,inset,style:'solid'|'gradient'|'traveling',gradientColors:List<String>,travelSpeed}
  GlowEffect glow;          // {enabled,color,size,opacity,pulseEnabled,pulseDuration}
  ShimmerEffect shimmer;    // {enabled,color,opacity,duration}
  ParticlesEffect particles;// {enabled,count,color,size,orbitRadius:String,baseDuration,originX?,originY?,animationType:'orbit'|'burst'?,burstDistance?}
  CornersEffect corners;    // {enabled,color,size,width,pulseEnabled}
  FrameEffect frame;        // {enabled,type:'none'|'simple'|'greek'|'islamic'|'deco'|'royal',color,opacity,strokeWidth,animate}
  GradientOverlayEffect gradientOverlay; // {enabled,color,opacity,direction}
  FloatingEffect floating;  // {enabled,content,position:'top'|'bottom',size,animation:'float'|'bounce'|'spin',glowColor,offsetX?,offsetY?,scale?}
  BadgeEffect badge;        // {enabled,emoji,label,bgColor,textColor,borderColor,position,offsetX?,offsetY?,scale?}
  NameEffect nameEffect;    // {enabled,color,glowColor,glowSize}
}
```

### 8.5 الحساب والجلسة والملف الشخصي

```dart
class PlayerSession {                 // = PlayerData في PlayerContext.tsx (يُخزَّن آمناً)
  int playerId; String name; String phone; String token;
}

class StaffInfo {
  int staffId; String username; String role;
  String displayName; List<String> permissions;   // JSON مفكوك مسبقاً
}

class PlayerAccount {                 // player في /me و login/register
  int id;                             // = players.id
  int? playerId;                      // مرادف id في بعض الردود — طبّعه إلى id
  String phone; String name;
  String? gender; String? dob; String? avatarUrl; String? email;
  int? totalMatches; int? totalWins; int? totalSurvived;
  bool mustChangePassword;            // true → شاشة تغيير إلزامية بلا oldPassword
}

class ActiveGameInfo {                // activeGame / frozenGames في /me
  String roomId; String roomCode; String? gameName;
  int physicalId;
  RoleId? role;                       // null حتى rolesConfirmed
  bool isAlive; GamePhase phase;
}

class MeResponse {
  PlayerAccount player;
  StaffInfo? staffInfo;
  String? staffToken;                 // staff JWT يُصدر تلقائياً عند linkedStaffId
  ActiveGameInfo? activeGame;
  List<ActiveGameInfo> frozenGames;   // (=[])
}

class AuthResult {                    // login / register
  String token;
  int? welcomeBonus;                  // 200 في register فقط
  PlayerAccount player;
}

class PlayerProfile {                 // GET /api/player/:id/profile
  Map<String,dynamic> player;         // صف players كاملاً (حقول 8.5 + xp/level/rankTier/rankRR/…)
  ProfileStats stats;
  ProgressionInfo progression;
  List<MatchHistoryEntry> matchHistory;
  ActiveGameInfo? activeGame;
}
class ProfileStats {
  int totalMatches; int totalWins; int winRate; int survivalRate;
  String? favoriteRole;
  int mafiaWins; int citizenWins; int mafiaGames; int citizenGames;
  int mafiaWinRate; int citizenWinRate; int longestWinStreak;
  Map<String,int> roleDistribution;
}
class ProgressionInfo {
  int xp; int level; int nextLevelXP; int xpProgress;   // xpProgress نسبة %
  String rankTier;                    // (='INFORMANT')
  int rankRR; int rrRequired;
  int totalDeals; int successfulDeals; int dealSuccessRate;
}
```

### 8.6 النماذج الاجتماعية والرانك

```dart
class LeaderboardEntry {              // /leaderboard و /seasons/public/:id/leaderboard
  int id;                             // في leaderboard الموسمي: id = playerId (يوحّده السيرفر)
  String name; String? avatarUrl;
  int level; int xp;
  String rankTier; int rankRR;
  int totalMatches; int totalWins;
}

class SeasonInfo {                    // /seasons/public/list و /online-list و /active
  int id; String name; int seasonNumber;
  SeasonStatus status;
  String? startedAt; String? endedAt; // ISO strings
}

class SearchResult { int id; String name; String? avatarUrl; } // الهاتف لا يصل أبداً

class CoPlayer {
  int id; String name; String? avatarUrl; int level;
  String? rankTier; int matchCount; bool isFollowing;
}

class FollowedPlayer {
  int id; String name; String? avatarUrl; int level;
  String? rankTier; int rankRR; int totalMatches; int totalWins;
}

class FollowingBooker {
  int id; String name; String? avatarUrl; int level; bool isFollowing;
}

class FollowingFeedItem {
  int playerId; String playerName;
  RoleId? role; bool? survived;
  int? xpEarned; int? rrChange;
  String? matchWinner; String matchDate;      // ISO
  FeedPlayerInfo? playerInfo;                 // {id,name,avatarUrl,level,rankTier}
}
```

### 8.7 الأنشطة والحجوزات

```dart
class ActivityUpcoming {              // /activities/upcoming
  int id; String name;
  String date;                        // ISO
  String? description;
  double? basePrice;                  // ⚠️ يصل String (numeric) → looseNum
  ActivityStatus status;              // 'planned' | 'active'
  int? locationId; int? maxCapacity; String? difficulty;
  List<int>? enabledOfferIds;         // JSON مفكوك
  String? locationName; String? locationMapUrl;
  List<LocationOffer> locationOffers; // مصفّاة على المفعّل server-side
  bool? isTestLocation;
  int bookedCount;                    // (=0)
  int maxPlayers;                     // (=maxCapacity أو 20)
}

class LocationOffer {                 // عنصر JSON حر من locations.offers — كل الحقول nullable
  int? id;                            // قد يغيب → استخدم الـ index كمعرّف (سلوك الويب)
  String? name; String? description;
  double? price;                      // looseNum (قد يصل String أو num)
  double? clubShare;                  // looseNum
}

class BookingEntry {                  // /:id/bookings
  int bookingId; int activityId;
  bool isPaid; bool isFree;
  String createdAt;                   // ISO
  String activityName; String activityDate; String? activityStatus;
}

class MyActiveRoomsGroup {            // /my-active-rooms
  int activityId; String activityName; String activityDate;
  List<ActiveRoomEntry> rooms;
}
class ActiveRoomEntry { int sessionId; String sessionCode; String? sessionName; int? maxPlayers; }
```

### 8.8 سجل المباريات

```dart
class MatchHistoryEntry {             // /:id/matches و profile.matchHistory
  int matchId;
  String? gameName;
  String matchDate;                   // ISO (في profile يأتي أيضاً matchDuration/matchPlayerCount)
  String? matchWinner;                // 'MAFIA'|'CITIZEN'|'JESTER'|'ASSASSIN'
  int? durationSeconds; int? totalRounds; int? playerCount;
  RoleId? role;
  bool? survivedToEnd;
  String? eliminatedDuring; int? eliminatedAtRound; int? roundsSurvived;
  bool? dealInitiated; bool? dealSuccess;
  bool? abilityUsed; bool? abilityCorrect;
  int? xpEarned; int? rrChange;
  int? penaltyCount; int? penaltyRRDeduction; int? bombRRChange;
  Map<String,dynamic>? rewardBreakdown;  // JSON مفكوك — لا jsonDecode ثانٍ
  DisplayBreakdown? breakdown;           // مبني server-side جاهز للعرض
}

class DisplayBreakdown {              // buildDisplayBreakdown في progression.service.ts
  String team;                        // 'MAFIA'|'CITIZEN'|'NEUTRAL'
  bool won;
  List<BreakdownLine> xp;
  List<BreakdownLine> rr;
  int xpTotal; int rrTotal;
}
class BreakdownLine { String key; int value; String label; String icon; }
```

### 8.9 الإشعارات

```dart
class AppNotification {               // صف player_notifications
  int id; int? playerId;
  String title;                       // ≤200
  String body;                        // (='')
  String type;
  Map<String,dynamic> data;           // (={}) — يحمل url للـ deep-link
  bool isRead;                        // (=false)
  bool? isPushSent;
  String createdAt;                   // ISO
}
```
أنواع type المعروفة (تبقى String مفتوحة): من الـ schema: `new_activity, game_ended, custom, reminder, friend_booked, level_up, booking_confirmed, comeback`؛ ومن الـ push المرصود: `activity_started, room_invite, new_booking`. جدول تحويل `data.url` → routes في 08-deeplinks-routing.md.

### 8.10 الاستبيانات

```dart
class FeedbackQuestion { String key; String dimension; String text; } // القيم الحرفية في §4.6
class FeedbackPendingItem {           // getPendingSessions
  int sessionId;
  String? playedAt;                   // ISO
  String? sessionName; String? sessionCode;
  String? activityName; String? locationName;
}
class FeedbackContext {
  int sessionId; String? sessionName; String? sessionCode;
  String? activityName; String? locationName; String? playedAt;
}
class FeedbackSubmission {            // body POST /:sessionId
  Map<String,int> answers;            // كل الـ 11 مفتاحاً إلزامية، قيم 1..5
  String? notes;
}
```

### 8.11 F&B

```dart
class FnbContext {
  int activityId; String activityName; String? activityDate;
  int? locationId; String? locationName;
  int? bookingId; int? sessionId; int? physicalId;
  String source;                      // 'live' | 'booking'
}
class FnbMenuItem {
  int id; String? category; String name; String? description;
  double price;                       // ⚠️ String من DB → looseNum (عرض فقط — السعر الملزم server-side)
  String? imageUrl;
}
class FnbOrder {
  int id;
  FnbOrderStatus status;              // 'new'/'preparing'/…/'cancelled'؛ الإلغاء مسموح في 'new' فقط
  double total;                       // ⚠️ looseNum
  String? note;                       // ≤300
  String createdAt;                   // ISO
  List<FnbOrderItem> items;
}
class FnbOrderItem { String name; double unitPrice /*looseNum*/; int quantity; }
class FnbCartLine {                   // body POST /orders — الكمية 1..20، ≤30 سطراً
  int menuItemId; int quantity;
}
```

### 8.12 المحوّلات (converters) الموحّدة — إلزامية في كل النماذج أعلاه

```dart
/// numeric(pg) يصل String، وأحياناً num — لا تكتب double مباشرة أبداً
double? looseNum(dynamic v) =>
    v == null ? null : (v is num ? v.toDouble() : double.tryParse(v.toString()));

/// طوابع السوكِت epoch-ms أرقام: at/startedAt/heldUntil/revealedAt/
/// votingStartTime/startTime/gameTimer.startedAt
class EpochMsConverter implements JsonConverter<DateTime?, num?> {
  DateTime? fromJson(num? v) =>
      v == null ? null : DateTime.fromMillisecondsSinceEpoch(v.toInt());
}

/// تواريخ REST كلها ISO strings → DateTime.parse (لا تخلط المحوّلين)

/// playerVotes/leaderProxyVotes/submitted: مفاتيح physicalId نصوص في JSON
Map<int, T> stringKeyedMap<T>(Map json, T Function(dynamic) f) =>
    { for (final e in json.entries) int.parse(e.key as String): f(e.value) };

/// avatarUrl نسبي — البناء المركزي الوحيد للمسارات
abstract final class AvatarUrls {
  static String? full(String? avatarUrl, String apiBase) =>
      avatarUrl == null ? null : '$apiBase$avatarUrl'; // يتضمن ?v=ts لكسر الكاش عمداً
  static String thumb(int playerId, String apiBase) =>
      '$apiBase/uploads/avatars/thumbs/$playerId.webp'; // 192px
}
```

قواعد إضافية ملزمة:
- أعمدة JSON (`offers`, `rewardBreakdown`, `permissions`, `data`, `enabledOfferIds`) تصل **مفكوكة مسبقاً** — ممنوع `jsonDecode` ثانٍ.
- نصوص `error` عربية دائماً وتُعرض كما هي؛ منطق القرار من HTTP status + `code` فقط.
- الهاتف يُرسل كما سُجّل (`07…`) — السيرفر يطبّع `+962/00962/962` بنفسه.

---

## 9. الحزم المستخدمة

| الحزمة | الغرض |
|---|---|
| `freezed` + `freezed_annotation` | نماذج immutable + unions (AutoJoinResult, Candidate) |
| `json_serializable` + `json_annotation` | توليد fromJson/toJson + `unknownEnumValue` |
| `build_runner` | التوليد (`dart run build_runner build --delete-conflicting-outputs`) |
| `collection` | مقارنات القوائم/الخرائط في الاختبارات |

لا حزم شبكة/تخزين هنا — `dio` في 03، `socket_io_client` في 04، `flutter_secure_storage` في 05، `cached_network_image` في 01 (يستهلك `AvatarUrls`).

---

## 10. اختلافات Android / iOS

**لا اختلافات** — طبقة Dart خالصة بلا أي platform channel أو plugin؛ الـ JSON نفسه يصل للمنصتين من نفس الـ backend.

---

## 11. الأصول المطلوبة

لا أصول مضمّنة لهذه الطبقة. أيقونات الأدوار نصوص emoji (ثوابت §4.3)، الأفاتارات وصور البطاقات موارد شبكة (`AvatarUrls` + `secretFace.customImageUrl`) وليست bundled. الخط العربي وأصول الثيم في 01-foundation-theme.md.

---

## 12. معايير القبول

- [ ] `GamePhase` يفكّ الـ 11 قيمة بما فيها `DAY_ELIMINATION`، وأي قيمة جديدة → `unknown` بلا crash.
- [ ] `RoleId` نصّي: دور جديد مضاف من لوحة الأدمن (غير الـ 16) يمرّ في `GamePlayer.fromJson` ويُعرض اسمه من `RoleDef.nameAr`، وfallback `'مجهول'` عند غيابه.
- [ ] `GameStateModel.fromJson` يبتلع state مُعقَّماً من غرفة remote (أدوار الأحياء null، بلا `nightActions`/`autoNightChoices`، بلا `mayorState`) وغير مُعقَّم (نسخة المضيف) بنفس الكلاس.
- [ ] `VotingState.playerVotes` بمفاتيح نصية (`{"3": 1}`) يتحول إلى `Map<int,int>` صحيح؛ نفس الشيء لـ `leaderProxyVotes` و`submitted`.
- [ ] `basePrice`/`price`/`total`/`unitPrice` تُفك سواء وصلت `"5.00"` أو `5` أو `null`.
- [ ] حقول epoch-ms (`at`, `startedAt` في confrontation, `heldUntil`, `votingStartTime`, `startTime`, `gameTimer.startedAt`, `revealedAt`) تتحول بـ `fromMillisecondsSinceEpoch`، بينما `createdAt`/`startedAt` في `GameStateModel` و`matchDate`/`createdAt` في REST تُفك كـ ISO.
- [ ] `AutoJoinResult` يميّز الحالات الخمس بترتيب الفحص الصحيح (fixtures: نجاح، restoredSeat، requiresConfirmation، ‏PENDING_SURVEYS، ‏HOST_CANNOT_PLAY، ‏REMOTE_SUB_REQUIRED، ‏priceMismatch، فشل عام).
- [ ] `MyStateSnapshot` كامل الحقول يُفك من fixture حقيقي لكل طور: LOBBY، ‏DAY_VOTING (مع votingState)، ‏DAY_JUSTIFICATION (justificationData)، ‏NIGHT (nightState مع autoNightPerformerId=null المقنَّع)، ‏GAME_OVER (allPlayers بالأدوار).
- [ ] `MorningEventType` يغطي الـ 12 نوعاً (بما فيها `PROTECTION_FAILED`, `ASSASSIN_KILL`, `ASSASSIN_BLOCKED`).
- [ ] `DealCandidate` يُفك مع وبدون `id`.
- [ ] `toJson` لحمولات الإرسال (cast-vote، ‏night-action بـ `targetPhysicalId: null` للتخطي، ‏mayor-decision بقيمة `'PASS'`) يطابق العقد حرفياً.
- [ ] ثوابت §4 (ROLE_NAMES/ROLE_ICONS/PHASE_NAMES/ROLE_NAMES_AR/FEEDBACK_QUESTIONS/formatPlayer) مطابقة حرفياً للكود الأصلي (اختبار golden strings).
- [ ] كاش game-config: طلب ثانٍ خلال 5 دقائق لا يضرب الشبكة؛ `reload(force)` يتجاوز؛ فشل الشبكة يرجع قوائم فارغة بلا exception.
- [ ] `RankEffectsDef` بكامل الـ 10 مجموعات effects يُفك من رد `/rank-effects` الفعلي.
- [ ] `AppNotification.data` و`rewardBreakdown` و`permissions` تُقرأ كـ Map/List مباشرة (fixture يتأكد ألا يوجد double-decode).

---

## 13. ملاحظات أداء وأمان

**أمان:**
- **ممنوع تخزين أي سرّ لعب على القرص**: `role`, `mafiaTeam`, `sibling`, `assassinContracts`, `SheriffResultPayload`, رسائل mafia-chat — ذاكرة فقط، وتُصفَّر عند `game:closed`/`game:kicked`/`event:closed`/`player:kicked-self` وعند الخروج.
- `toString()` للنماذج الحساسة (`GamePlayer`, `MyStateSnapshot`, `PlayerSession`) يجب أن يحجب `role` و`phone` و`token` (تجاوز يدوي فوق freezed) حتى لا تتسرب في logs/crash reports.
- التوكن في `PlayerSession` لا يظهر في أي `toJson` يُرسل للسيرفر — فصل نموذج التخزين عن نماذج الإرسال.
- لا تثق بأي cache محلي للأدوار — الـ snapshot الدوري هو الحاكم (سرية الأدوار server-side أصلاً في الغرف الـ remote).

**أداء:**
- `game:state-sync` قد يصل كل بضع ثوانٍ بحجم كبير (50 لاعباً): اجعل `GameStateModel.fromJson` خالياً من أي عمل غير الـ mapping، وطبّق مقارنة سطحية في الـ store (20) قبل إعادة البناء؛ عند تجاوز الحمولة ~100KB انقل الـ parsing إلى `compute()`.
- كاش الإعدادات الديناميكية singleton واحد (TTL ‏5 دقائق) يمنع 4 طلبات لكل شاشة.
- استخدم `thumb` (192px webp) في كل القوائم؛ الصورة الكاملة فقط في البروفايل/البطاقات — `?v=ts` يكسر الكاش عمداً عند تغيير الصورة فلا تلحقه بالـ thumbs.
- المحوّل `stringKeyedMap` ‏O(n) لكل sync — مقبول؛ لا تحوّل ذهاباً وإياباً في كل frame (خزّن الناتج المحوَّل في الـ store).
