# شاشة الرتب: اللوحة، الإطارات والتأثيرات البصرية، المواسم
> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

---

## 1. الهدف والنطاق

هذا الملف يوثّق ثلاث كتل مترابطة:

1. **شاشة التصنيف والرتب** (`/player/rank`) — المركز التنافسي للاعب: بطاقة «رتبتي» (Rank tier + RR + إحصائيات + شريط تقدّم)، لوحة متصدّرين موسمية بمنصّة تتويج top-3، قائمة «لعبت معهم» (متابعة اجتماعية)، وتبويب تعليمي «النقاط» يعرض إعدادات التقدّم القابلة للضبط من الأدمن. تدعم وضعَي رانك: **وجاهيّ** (مواسم عاديّة، لوحة حية) و**أونلاين** (مواسم منفصلة، تُجلب دائماً per-season). يُدخَل إليها من الـ bottom nav.

2. **إطارات الرتب** (`RankFrames.tsx`) و**تأثيرات الرتب البصرية** (`RankEffects.css`) — طبقات زخرفية تُركّب فوق **كرت اللاعب في اللعبة** (`DynamicMafiaCard`)، تزداد فخامةً مع صعود الرتبة (INFORMANT → SOLDIER → CAPO → UNDERBOSS → GODFATHER). كلّها **config-driven** من `RankEffectsDef` (قابلة للتحرير من الأدمن، cache 5 دقائق على مستوى الموديول). هذا الملف يملك المواصفة المرجعية لـ `RankFramePainter` و`RankEffectsOverlay`؛ الشاشات التي تعرض الكرت (22-role-cards.md، 20-game-state-core.md، 24-morning-cinematics.md، 27-spectator-gameover.md) تستهلكها فقط.

3. **المواسم وترتيب اللاعب** — منطق تحديد الموسم المعروض، اللوحة الحية مقابل لوحة موسم مُجلبة، وحساب ترتيب اللاعب (`#rank`) وصفّه المميّز.

**خارج النطاق (تُوثَّق في ملفات أخرى):** سجل المباريات ومودال تفصيل النقاط → 16-history.md؛ بطاقة تقدّم الرتبة داخل البروفايل واللوحة المصغّرة → 13-profile.md؛ بنية كرت اللعب نفسه (الوجه/القلب/القالب) → 22-role-cards.md؛ عقود REST العامة → 03-networking-rest.md؛ نماذج البيانات → 02-models-data-layer.md.

**ثوابت أساسية:** كل الواجهة عربية RTL، ثيم أسود داكن، لا Socket في هذه الشاشة (النضارة عبر refetch على lifecycle فقط).

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

| الملف | الدور |
|------|------|
| `frontend/src/app/player/rank/page.tsx` (644 سطراً) | شاشة الرتب كاملة (اللوحة، المواسم، التبويبات، مودال البروفايل) |
| `frontend/src/lib/ranks.ts` (36 سطراً) | ثوابت الرتب: `RANK_TIERS`, `RANK_NAMES_AR`, `RANK_BADGES`, `RANK_COLORS`, `RANK_RR_REQUIRED` |
| `frontend/src/components/RankFrames.tsx` (352 سطراً) | 5 إطارات SVG إجرائية + `FRAME_OPTIONS` + `hexToRgba` |
| `frontend/src/components/RankEffects.css` (372 سطراً) | كل الـ keyframes + كلاسات التأثيرات لكل رتبة (المسار القديم/الافتراضيات) |
| `frontend/src/components/DynamicMafiaCard.tsx` (السطور 96–100، 301–409) | مستهلك التأثيرات: اشتقاق `fx`/`hasRankEffects`، وطبقة الأوفرلاي config-driven بترتيب z |
| `frontend/src/hooks/useGameConfig.ts` (السطور 5، 70–86، 219–250) | نوع `RankEffectsDef`، cache الموديول، `getRankEffectsForTier`, `invalidateGameConfigCache`, و`API_URL = process.env.NEXT_PUBLIC_API_URL || ''` |
| `frontend/src/lib/constants.ts` | `ROLE_NAMES` (خريطة اسم الدور بالعربية — تُستخدم في مودال البروفايل) |
| `frontend/src/hooks/useModalScrollLock.ts` | حِيَل قفل التمرير وswipe-to-close (web-only — **لا يُنقَل**) |
| `frontend/src/context/PlayerContext.tsx` | مصدر الجلسة (`player.playerId`, `player.token`) |

> عند أي غموض: هذه هي الملفات المرجعية. الألوان والنصوص والأبعاد أدناه منسوخة حرفياً منها.

---

## 3. التبعيات على ملفات الخطة الأخرى

- **01-foundation-theme.md** — الثيم الأسود، الألوان المشتركة (amber-400 = `#FBBF24`, amber-500 = `#F59E0B`)، خطوط mono وInter، `FontFeature.tabularFigures()`، واستراتيجية Window Size Classes الكاملة (§5 هنا تُخصّص فقط).
- **02-models-data-layer.md** — نماذج `LeaderboardRow`, `CoPlayer`, `PlayerProfile`, `ProgressionConfig`, `Season`, و`RankEffectsDef` وأنواعها الفرعية (§8 يعرّفها؛ يجب أن تُسجَّل مركزياً هناك). كذلك خريطة `ROLE_NAMES` وثوابت الرتب.
- **03-networking-rest.md** — عميل REST، حقن `Authorization: Bearer`، معالجة الأخطاء الصامتة، وprefix عنوان الـ base للصور (`avatarUrl`).
- **05-session-auth.md** — مخزن الجلسة الموحّد (`playerId`, `token`) الذي يُغني عن قراءة `PlayerContext`/localStorage المباشرة.
- **11-shell-navigation.md** — الـ bottom nav بارتفاع **64px** (مودال البروفايل يجلس فوقه)، وربط تبويب الرتب، وسلوك `RouteAware.didPopNext` لإعادة الجلب عند العودة.
- **13-profile.md** — بطاقة تقدّم الرتبة داخل البروفايل، `RANK_CONFIG` بلوحة ألوان **مختلفة** (برونزي/فضي/ذهبي/سماوي/أحمر) — لا تُوحَّد مع لوحة هذه الشاشة.
- **16-history.md** — سجل المباريات ومودال تفصيل النقاط (يشترك في اشتقاق الفوز/الفريق وقائمة أدوار المافيا).
- **20-game-state-core.md / 22-role-cards.md / 24-morning-cinematics.md / 27-spectator-gameover.md** — تستهلك `RankEffectsOverlay` و`RankFramePainter` المعرّفَين هنا؛ الكرت يُمرّر `rankTier` وأبعاده.
- **06-push-notifications.md / 08-deeplinks-routing.md** — لا تفاعل مباشر في هذه الشاشة (لا push، لا deep link خاص بالرتب).

---

## 4. الواجهة والتجربة تفصيلياً

> **RTL:** لفّ كامل الشاشة بـ `Directionality(TextDirection.rtl)`. جُزُر LTR متعمّدة: كتلة أرقام RR (`text-left`) وأرقام `tabular-nums`. قصّ الأسماء يدويّ بعدّ الأحرف (انظر أدناه).
> **العمود العام:** `max-w-lg` (≈512px) موسّط، `px-4 pt-6`. خلفية سوداء عامة.
> **مقاسات النصوص:** صغيرة، مدى 9–14px.

### 4.0 الثوابت (من `ranks.ts` — انسخها حرفياً)

```
RANK_TIERS         = [INFORMANT, SOLDIER, CAPO, UNDERBOSS, GODFATHER]
RANK_NAMES_AR      = { INFORMANT: 'مُخبر', SOLDIER: 'جندي', CAPO: 'كابو', UNDERBOSS: 'أندربوس', GODFATHER: 'الأب الروحي' }
RANK_BADGES        = { INFORMANT: '🕵️', SOLDIER: '⚔️', CAPO: '🎖️', UNDERBOSS: '💎', GODFATHER: '👑' }
RANK_COLORS        = { INFORMANT: '#6b7280', SOLDIER: '#3b82f6', CAPO: '#a855f7', UNDERBOSS: '#f59e0b', GODFATHER: '#ef4444' }   // لواجهة الصفحة
RANK_RR_REQUIRED   = { INFORMANT: 100, SOLDIER: 200, CAPO: 300, UNDERBOSS: 400, GODFATHER: 9999 }   // fallback أخير فقط — ليست مصدر الحقيقة (انظر التحذير أدناه)
```

> **تحذير حرج — `RANK_RR_REQUIRED` ليست مصدر الحقيقة:** قيم الـ RR المطلوبة **قابلة للتعديل من الأدمن** في أي لحظة. مصدر الحقيقة هو `/api/progression-settings/public` → `config.ranks[tier].rrRequired`، أو مباشرةً `profile.progression.rrRequired` الذي يصل جاهزاً من البروفايل (§7.1 صف 3). الخريطة الصلبة أعلاه **fallback أخير فقط** عند تعذّر جلب الـ config (خطأ شبكة قبل امتلاء الـ cache) — لا تُستخدم مقاماً أو مرجعاً أساسياً في أي حساب.

> **تحذير — لوحتا ألوان متعارضتان بالتصميم:** `RANK_COLORS` أعلاه (صفحة الرتب) **ليست** ألوان كرت اللعب. كرت اللعب يستخدم ألوان `RankEffects.css`/الـ config (SOLDIER `#10b981` أخضر، CAPO `#3b82f6`، UNDERBOSS `#8b5cf6`، GODFATHER `#f59e0b`). ولا تساوي ألوان البروفايل في 13-profile.md. **أبقِ الثلاث منفصلة.**
> **تحذير — مجموعتا شارات:** `RANK_BADGES` (🕵️⚔️🎖️💎👑) تُستخدم في صفوف اللوحة/البروفايل، بينما تبويب «النقاط» يستخدم شارات نجوم مختلفة عمداً (⭐/⭐⭐/🌟/🌟🌟/👑). أبقِ كليهما.

### 4.1 حالة التحميل (Loading)

- منطقة كاملة `min-h: 60vh`، توسيط. Spinner دائري **40×40px** (`w-10 h-10`)، `border-2`، مسار `border-amber-500/30` (أي `rgba(245,158,11,0.3)`) مع أعلى `border-t-amber-500` (`#F59E0B`)، دوران مستمر (`animate-spin` ≈ 0.6–1s linear infinite). Flutter: `CircularProgressIndicator` مخصّص أو `RotationTransition` حول قوس.
- يظهر حتى تسوية كل الـ 7 fetches (Promise.all).

### 4.2 صف الرأس (Header)

`Row`، توزيع `space-between`، يلتفّ (`flex-wrap`)، `mb-4`:

- **العنوان:** `🏆 التصنيف والرتب` — أبيض، `text-lg` (18px)، `bold`.
- **العنقود الأيمن** (`gap-1.5`):
  - **مبدّل الوضع** (يظهر فقط إذا `onlineSeasons.length > 0`): حاوية pill `rounded-full`، خلفية `rgba(0,0,0,0.4)`، حد `1px solid #2a2a2a`، `padding 0.5`. زرّان، خط **11px bold**، `px-2.5 py-1 rounded-full`:
    - `وجاهيّ` — نشط: خلفية `rgba(245,158,11,0.25)` (amber-500/25) نص `#FDE68A` (amber-200)؛ غير نشط: نص `#888`.
    - `🌐 أونلاين` — نشط: خلفية `rgba(14,165,233,0.25)` (sky-500/25) نص `#BAE6FD` (sky-200)؛ غير نشط: نص `#888`.
    - انتقال اللون `transition-colors` (~150ms).
  - **منسدلة الموسم** (native `<select>`) — تظهر إذا قائمة مواسم الوضع الحالي غير فارغة. خط **12px bold**، `rounded-full`، `px-3 py-1.5`، **`max-w-[52vw]`** (سقف عرض 52% من عرض الشاشة يمنع كسر الأسماء الطويلة)، بلا outline. ألوان حسب الوضع:
    - أونلاين: خلفية `rgba(14,165,233,0.15)` نص `#7DD3FC` (sky-300) حد `rgba(14,165,233,0.25)`.
    - وجاهيّ: خلفية `rgba(245,158,11,0.15)` نص `#FCD34D` (amber-300) حد `rgba(245,158,11,0.25)`.
    - **نصّ الخيار:** `🗓️ {name}` + لاحقة ` • الحالي` إذا `s.id === (الموسم النشط لذلك الوضع)`. خلفية الخيار `bg-gray-900` (`#111827`) نص أبيض.
  - **البدائل عند فراغ القائمة:**
    - وضع أونلاين بلا مواسم → pill ثابت `🌐 لا مواسم أونلاين بعد`، `text-[11px] bold px-3 py-1 rounded-full`، خلفية `rgba(14,165,233,0.10)` نص `rgba(125,211,252,0.7)` حد `rgba(14,165,233,0.20)`، `whitespace-nowrap`.
    - وضع وجاهيّ مع `season?.name` → pill ثابت `🗓️ موسم: {season.name}`، خلفية `rgba(245,158,11,0.15)` نص `#FCD34D` حد `rgba(245,158,11,0.25)`.

### 4.3 بطاقة «رتبتي — موسم سابق/أونلاين»

تظهر عندما **لا** نعرض اللوحة الحية النشطة (أي `mode==='online'` أو الموسم المختار ≠ النشط) — الشرط: `!viewingActive`.

- **دخول:** framer-motion `opacity 0→1, y 10→0`. Flutter: `.fadeIn().slideY(begin: 0.06)`.
- **الحاوية:** `rounded-2xl p-4 mb-4`، خلفية `linear-gradient(135deg, {RANK_COLORS[myRow.rankTier] أو '#888'}15, rgba(5,5,5,0.9))`، حد `1px solid {اللون}30`. (اللاحقتان `15`/`30` = ألفا hex ≈ 0.08/0.19).
- **السطر الأول دائماً:** `🗓️ موسم: {selectedSeasonName}` — رمادي `#6B7280` (gray-500)، **10px**، `mb-1`.
- **الحالات الفرعية:**
  - `seasonLoading == true` → `جارٍ التحميل…` موسّط، رمادي `#6B7280`، 12px، `py-3`.
  - `myRow` موجود:
    - صف علوي (`space-between`): يسار = شارة emoji (2xl ≈ 24px) `{RANK_BADGES[tier]}` + اسم الرتبة العربي (أبيض bold `text-sm`، هامش يمين `mr-2`) + `#{myRank}` إن كان `myRank > 0` (رمادي `text-xs`)؛ يمين (`text-left`) = تسمية `RR` (رمادي `#9CA3AF` gray-400 `text-xs`) + قيمة `myRow.rankRR` (`text-lg bold`، ملوّنة `RANK_COLORS[tier]`، هامش يمين `mr-1`).
    - 3 صناديق إحصاء (`Row gap-3 mt-3`، كلّ `flex-1 bg-white/5 rounded-lg py-1.5`، توسيط): `مباراة` (`myRow.totalMatches || 0` أبيض) / `فوز` (`myRow.totalWins || 0` أخضر `#4ADE80` green-400) / `المستوى` (`myRow.level || 1` أمبر `#FBBF24`). القيمة `text-sm bold`، التسمية **9px** رمادي `#6B7280`.
  - لا `myRow` → `لم تلعب في هذا الموسم` موسّط، رمادي `#6B7280`، 12px، `py-3`.

### 4.4 بطاقة «رتبتي — الموسم الحالي»

تظهر عندما `viewingActive && prog` (اللوحة الحية + بيانات التقدّم من البروفايل محمّلة). نفس الحاوية بستايل `RANK_COLORS[prog.rankTier]`.

- صف علوي (`space-between`):
  - يسار: شارة (2xl) + اسم عربي (أبيض bold `mr-2`) + `#{myRank}` إن `myRank>0`.
  - يمين (`text-left`): تسمية `RR` + قيمة `prog.rankRR` (`text-lg bold` ملوّنة `mr-1`) + `/{rrRequired}` (رمادي `#4B5563` gray-600، **10px**) — حيث `rrRequired = prog.rrRequired ?? progressionConfig?.ranks?.[tier]?.rrRequired ?? RANK_RR_REQUIRED[tier] ?? 100` (**config-first**؛ الخريطة الصلبة fallback أخير فقط — §4.0).
- 4 صناديق إحصاء (تظهر إذا `myStats`): `مباراة` (`totalMatches` أبيض) / `فوز` (`totalWins` أخضر) / `نسبة فوز` (`{winRate}%` أمبر) / `الرانك` (سلسلة الـ enum الخام `prog.rankTier` نص أزرق `#60A5FA` blue-400). نفس تنسيق الصناديق أعلاه.
- **شريط تقدّم RR:** مسار `h-1.5` (6px) `rounded-full bg-white/5`؛ تعبئة متحرّكة من عرض 0 إلى `min(prog.rankRR / rrRequired * 100, 100)%` — بنفس `rrRequired` الـ config-first المعرّف أعلاه (لا تقسم على الخريطة الصلبة مباشرة)، لونها `RANK_COLORS[tier]`. حركة framer-motion (spring افتراضي). Flutter: `TweenAnimationBuilder<double>` + `FractionallySizedBox` (~600–800ms، `Curves.easeOut`).

### 4.5 شريط التبويبات

3 أزرار متساوية (`flex-1 py-2.5 rounded-xl text-xs font-medium`)، `Row gap-2 mb-4`:

| المفتاح | النص |
|--------|------|
| `leaderboard` | `🏅 الترتيب` |
| `coplayers` | `👥 لعبت معهم` |
| `howto` | `📖 النقاط` |

- نشط: خلفية `rgba(245,158,11,0.15)` نص `#FBBF24` حد `1px solid rgba(245,158,11,0.30)`.
- غير نشط: خلفية `rgba(255,255,255,0.05)` نص `#6B7280` حد `1px solid rgba(255,255,255,0.05)`.
- **النقر على `leaderboard`** يعيد ضبط `glowing=true` (إعادة تشغيل التوهج + مؤقّتاته).
- محتوى التبويب داخل `AnimatePresence mode="wait"` — كل تبويب `opacity 0→1` عند الدخول و`0` عند الخروج. Flutter: `AnimatedSwitcher(duration: ~200ms, transitionBuilder: FadeTransition)`.

### 4.6 تبويب «الترتيب» (Leaderboard)

- **منصّة التتويج (top-3)** — تُرسم فقط إذا `leaderboard.length >= 3`. `Row` محاذاة سفلية (`items-end`), `justify-center gap-3 pt-4 pb-2`. ترتيب الـ DOM: #2 يسار، #1 وسط مرفوع، #3 يمين:
  - **#2 (فضي):** avatar دائري **56×56** (`w-14 h-14`)، خلفية `bg-white/5`، حد `2px solid rgba(156,163,175,0.4)` (gray-400/40)، `mb-1`. تحته `🥈` (`text-xs`)؛ اسم أبيض `medium` **10px** موسّط، `maxWidth 70`، `overflow hidden nowrap`، **قصّ يدوي عند 8 أحرف** + `…`؛ سطر فرعي `{totalMatches||0} مباراة • {rankRR} RR` رمادي `#6B7280` **9px**.
  - **#1 (ذهبي):** avatar دائري **72×72** (`w-[72px] h-[72px]`)، حد `3px solid rgba(251,191,36,0.6)` (amber-400/60)، خلفية `rgba(251,191,36,0.08)`، ظل `shadow-lg shadow-amber-500/20`، مرفوع `-mt-4`. تحته `🥇` (`text-lg` ≈18px)؛ اسم أمبر `#FBBF24` bold **12px**، `maxWidth 80`، **قصّ عند 10 أحرف** + `…`؛ سطر فرعي **9px** رمادي `#9CA3AF` (gray-400).
  - **#3 (برونزي):** كـ #2 لكن حد `2px solid rgba(180,83,9,0.4)` (amber-700/40) و`🥉`، **قصّ عند 8 أحرف**.
  - avatar fallback عند غياب `avatarUrl` = رمز `🎭`.
  - كل عمود قابل للنقر → `viewProfile(id)` ما لم يكن أنا (`!isMe`).
- **صف رؤوس الأعمدة** (`Row gap-3 px-3 mb-1`): فاصلان (`w-6`, `w-8`) ثم `اللاعب` (`flex-1`)، `الرتبة` (`w-16` center)، `RR` (`w-10` center) — كلّها **9px** رمادي `#4B5563` (gray-600).
- **الصفوف** (من المركز الرابع فصاعداً): `leaderboard.slice(3)`، رقم الرتبة = `index + 4`، `space-y-1.5`. كل صف عبر `renderPlayerRow`:
  - حاوية `rounded-xl p-3 flex items-center gap-3 transition-all`.
  - **صفّي (me):** خلفية `rgba(251,191,36,0.08)`، حد `2px solid rgba(251,191,36,0.3)`، **غير قابل للنقر**، وعند `glowing==true` يُضاف التوهج (انظر §4.6.1). يحمل `myCardRef` (GlobalKey) للـ auto-scroll.
  - **الآخرون:** خلفية `rgba(255,255,255,0.03)`، حد `1px solid rgba(255,255,255,0.06)`، `cursor-pointer hover:bg-white/5` → `viewProfile(id)`.
  - **الخلايا (يمين→يسار منطقياً):**
    1. رقم الرتبة (`w-6` center، `text-sm bold`): أمبر `#FBBF24` لصفّي، وإلا رمادي `#4B5563`.
    2. avatar دائري **32×32** (`w-8 h-8`)، `bg-white/5`، صورة `object-cover` أو `🎭`.
    3. الاسم (`flex-1 min-w-0`): `text-xs medium`، أمبر لصفّي وإلا أبيض؛ **قصّ عند 16 حرفاً** + `…`؛ يُلحَق ` (أنت)` لصفّي. سطر فرعي `{totalMatches||0} مباراة • {totalWins||0} فوز` — رمادي `#6B7280` **10px**.
    4. خلية الرتبة (`w-16` center، truncate، **10px** رمادي `#D1D5DB` gray-300): `{RANK_BADGES[tier]} {RANK_NAMES_AR[tier]}`.
    5. RR (`w-10` center، **12px** أمبر bold، `tabular-nums`): `{rankRR}`.
    6. **زر المتابعة** (اختياري) — يظهر فقط إذا `!me && isCoPlayer(id)`: `text-[10px] px-2 py-1 rounded-lg`. متابَع: `⭐` خلفية `rgba(245,158,11,0.2)` نص أمبر؛ غير متابَع: `☆` خلفية `bg-white/5` نص `#6B7280 hover:أمبر`؛ أثناء التحميل: `...`. النقر يستدعي `stopPropagation` (لا يفتح البروفايل).
- **حالة حدّية موثّقة:** لأن الصفوف دائماً `slice(3)` والمنصّة تتطلّب `>=3`، فإن لوحة بلاعب أو لاعبَين تعرض **صفر صفوف** (رؤوس الأعمدة فقط). قرار واعٍ: أبقِها كما هي للتكافؤ، أو أصلحها (اعرض الكل عند `length<3`) — نوصي بالإبقاء للتكافؤ في الإصدار الأول.

#### 4.6.1 مواصفة التوهج (`pulse-glow`) لصفّي

- الحالة الساكنة عند `glowing`:
  - `boxShadow: 0 0 15px rgba(251,191,36,0.4), 0 0 30px rgba(251,191,36,0.2), 0 0 45px rgba(251,191,36,0.1)`
  - `animation: pulse-glow 1.5s ease-in-out infinite`
- keyframe:
  ```
  0%,100% { box-shadow: 0 0 15px rgba(251,191,36,0.4), 0 0 30px rgba(251,191,36,0.2); }
  50%     { box-shadow: 0 0 25px rgba(251,191,36,0.6), 0 0 50px rgba(251,191,36,0.3), 0 0 70px rgba(251,191,36,0.1); }
  ```
- Flutter: `AnimationController(duration: 1500ms)..repeat(reverse: true)`, `CurvedAnimation(Curves.easeInOut)`؛ عند كل frame ابنِ قائمة `BoxShadow` بـ lerp بين المجموعتين (blur 15→25 / 30→50 / (0→70)، ألفا 0.4→0.6 / 0.2→0.3 / (—→0.1))، لون القاعدة `#FBBF24`. يتوقّف تلقائياً بعد **5000ms** (انظر §6).

### 4.7 تبويب «لعبت معهم» (Co-players)

- **حالة فارغة** (`coPlayers.length === 0`): `العب مباراة أولاً لتعرف لاعبين!` — رمادي `#4B5563` (gray-600)، `text-sm`، موسّط، `py-8`.
- الصفوف (`space-y-2`): حاوية `rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-white/5`، خلفية `rgba(255,255,255,0.03)` حد `1px solid rgba(255,255,255,0.06)`. النقر على الصف → `viewProfile(id)`.
  - avatar دائري **36×36** (`w-9 h-9`)، `bg-white/5`، صورة أو `🎭`.
  - اسم أبيض `text-xs medium`؛ سطر فرعي `{RANK_BADGES[tier]} {RANK_NAMES_AR[tier]} • {matchCount} مباراة مشتركة` رمادي `#6B7280` **10px**.
  - **زر المتابعة** (`text-xs px-3 py-1.5 rounded-lg`، `stopPropagation`):
    - متابَع: `⭐ متابع` خلفية `rgba(245,158,11,0.2)` نص `#FBBF24` حد `rgba(245,158,11,0.3)`.
    - غير متابَع: `☆ تابع` خلفية `bg-white/5` نص `#6B7280` حد `rgba(255,255,255,0.1) hover:أمبر`.
    - تحميل: `...` (والزر `disabled`).

### 4.8 تبويب «النقاط» (How-to)

- **fallback** (لا `progressionConfig` بعد): `جاري تحميل البيانات...` موسّط رمادي `#4B5563` `text-sm py-8`.
- **بطاقة تمهيدية:** `bg-gray-900/50 rounded-2xl border border-gray-800/50 p-4 mb-4`.
  - سطر: `نظام التقدم مقسوم إلى قسمين:` — رمادي `#D1D5DB` `text-xs`.
  - قائمة نقطية (`text-[10px]` رمادي `#6B7280`, `list-disc list-inside space-y-1`):
    - `نقاط الخبرة (XP):` (بولد أمبر `#FBBF24`) ثم ` ترفع مستواك (Level)، ولا يمكن أن تقل عن الصفر.`
    - `نقاط الرانك (RR):` (بولد أزرق `#60A5FA`) ثم ` تحدد رتبتك التنافسية، يمكن أن تكون بالسالب في حال الخسارة أو العقوبات (مثل ديل مافيا على مافيا).`
- **3 بطاقات فئات** (البنية والأيقونات والأوصاف hardcoded؛ القيم من السيرفر). كل بطاقة: `rounded-xl overflow-hidden`، خلفية `rgba(255,255,255,0.03)` حد `rgba(255,255,255,0.06)`؛ شريط رأس `bg-white/5 px-3 py-2 border-b border-white/5` بعنوان `text-xs bold` رمادي `#E5E7EB` (gray-200)؛ صفوف مفصولة `divide-y divide-white/5`.

  **الفئة 1 — `🔰 أساسيات المباراة`:**
  | key | label | icon | desc |
  |-----|-------|------|------|
  | `participation` | `مشاركة في مباراة` | 🎮 | `نقطة دخول لكل لاعب` |
  | `teamWin` | `فوز الفريق` | 🏆 | `مكافأة الفوز لفريق اللاعب` |
  | `teamLoss` | `خسارة الفريق` | 💀 | `خصم الخسارة (سالب عادة)` |
  | `survivalPerRound` | `نجاة لكل جولة` | ⏳ | `لكل جولة يظل فيها حياً` |
  | `survivedToEnd` | `نجاة حتى النهاية` | 🎖️ | `نجا حتى نهاية المباراة` |
  | `teamEliminationBonus` | `مكافأة إقصاء خصم` | ⚔️ | `تمنح للفريق لكل خصم يُقصى` |

  **الفئة 2 — `🤝 الديلات والاتفاقات`:**
  | key | label | icon | desc |
  |-----|-------|------|------|
  | `citizenDealOnMafia` | `ديل مواطن ناجح` | ✨ | `مواطن أخرج عنصر مافيا` |
  | `failedDeal` | `ديل فاشل (غلط)` | 💔 | `مواطن أخرج مواطناً (عقوبة)` |
  | `mafiaDealOnMafia` | `ديل مافيا على مافيا` | 🔴 | `غدر بالزميل (عقوبة مغلظة)` |

  **الفئة 3 — `🎯 قدرات الأدوار`:**
  | key | label | icon | desc |
  |-----|-------|------|------|
  | `abilityCorrect` | `استخدام قدرة صحيحة` | ✅ | `إصابة صحيحة لشريف/قناص/طبيب` |
  | `abilityIncorrect` | `استخدام قدرة خاطئة` | ❌ | `إصابة خاطئة (عقوبة)` |

  **صف الفعل:** `p-3 flex items-center justify-between`. يسار: أيقونة + label (`text-[11px] bold` رمادي `#D1D5DB`) فوق desc (`text-[9px]` رمادي `#6B7280 mt-0.5`). يمين: عمود chips (`items-end gap-1`):
  - chip XP: يظهر إذا `xpVal !== undefined && xpVal !== 0`. نص `{xpVal>0?'+':''}{xpVal} XP`، `text-[10px] bold px-1.5 py-0.5 rounded`. موجب: خلفية `rgba(245,158,11,0.10)` نص `#FBBF24`؛ سالب: خلفية `rgba(244,63,94,0.10)` نص `#FB7185` (rose-400).
  - chip RR: يظهر إذا `rrVal !== undefined && rrVal !== 0`. نص `{rrVal>0?'+':''}{rrVal} RR`. موجب: خلفية `rgba(59,130,246,0.10)` نص `#60A5FA`؛ سالب: rose كما أعلاه.
  - **الصف كله يُخفى** إذا `xpVal === undefined && rrVal === undefined` (الفعل غير معرّف في الـ config).

- **بطاقة الرتب (بنفسجية):** `rounded-xl p-3`، خلفية `rgba(168,85,247,0.05)` حد `rgba(168,85,247,0.15)`.
  - عنوان: `👑 الرتب — RR المطلوب للترقية` — نص بنفسجي `#C084FC` (purple-400) `text-xs bold mb-2`.
  - 5 صفوف (`justify-between py-1.5 border-b border-white/5 last:border-0`)، شارات نجوم **مختلفة عمداً**:
    | tier | label | badge |
    |------|-------|-------|
    | INFORMANT | `المُخبر` | `⭐` |
    | SOLDIER | `الجندي` | `⭐⭐` |
    | CAPO | `الكابو` | `🌟` |
    | UNDERBOSS | `الأندربوس` | `🌟🌟` |
    | GODFATHER | `الأب الروحي` | `👑` |
  - يسار: `{badge} {label}` رمادي `#D1D5DB` **11px**؛ يمين: `{progressionConfig.ranks?.[tier]?.rrRequired ?? '?'} RR` بنفسجي `#C084FC` `text-xs bold`.

### 4.9 مودال بروفايل لاعب (Bottom Sheet)

- **الخلفية (backdrop):** `fixed top:0 left:0 right:0 z-[100]`، خلفية `rgba(0,0,0,0.8)`, **`bottom: calc(64px + safe-area-inset-bottom)`** → الـ sheet يجلس **فوق** الـ bottom nav (يبقى الناف ظاهراً). دخول/خروج fade. النقر عليها يغلق.
  - Flutter: بدل `showModalBottomSheet` عالمي، اعرض الـ sheet داخل الـ shell فوق الناف (Stack + `Positioned(bottom: navHeight + safeArea)`), أو `showModalBottomSheet` مع `constraints`/padding سفلي يساوي `navHeight + MediaQuery.viewPadding.bottom`. الحاجز نصف شفاف أسود 0.8.
- **الورقة (sheet):** تنزلق من الأسفل (`y:100%→0`, spring **damping 25 stiffness 300**), `w-full max-w-lg rounded-t-3xl p-5 max-h-[70vh] overflow-y-auto`, خلفية `#0a0a0a`, حد `1px solid rgba(255,255,255,0.1)`. مقبض سحب: **40×4px** `bg-gray-700 rounded-full` موسّط `mb-4`.
- **الرأس** (`flex items-center gap-4 mb-4`):
  - avatar **56×56** (`w-14 h-14`)، `bg-white/5`، حد `2px solid {RANK_COLORS[profile.progression.rankTier] || '#6b7280'}`، صورة أو `🎭` (2xl).
  - اسم أبيض bold؛ سطر فرعي `{RANK_BADGES[tier]} {RANK_NAMES_AR[tier]}` رمادي `#6B7280 text-xs`.
  - **زر متابعة** (يسار) — يظهر فقط إذا `selectedPlayer && selectedPlayer !== myId && isCoPlayer(selectedPlayer)`: `text-xs px-4 py-2 rounded-xl`، `⭐ متابع` أمبر / `☆ تابع` محايد / `...` تحميل. نفس ألوان §4.7.
- **شبكة إحصاء 3 أعمدة** (`grid-cols-3 gap-2 mb-4`): `مباريات` (`stats.totalMatches||0`) / `فوز` (`{stats.winRate||0}%`) / `نجاة` (`{stats.survivalRate||0}%`). كل صندوق `rounded-xl p-2.5` خلفية `rgba(255,255,255,0.05)`، قيمة `text-sm bold` أبيض، تسمية **10px** رمادي `#6B7280`.
- **آخر 5 مباريات** (`matchHistory.slice(0,5)`): كل صف `flex items-center justify-between text-xs py-1.5 border-b border-white/5`:
  - يسار: `{won?'🏆':'💀'} {ROLE_NAMES[role] || role}` — أخضر `#4ADE80` عند الفوز، أحمر `#F87171` (red-400) عند الخسارة.
    - **اشتقاق الفوز:** `isMafia = role ∈ {GODFATHER, SILENCER, CHAMELEON, WITCH, OLDER_BROTHER, MAFIA_REGULAR}`؛ `won = (isMafia && matchWinner==='MAFIA') || (!isMafia && matchWinner==='CITIZEN')`.
  - يمين: تاريخ `matchDate` بصيغة `ar-JO` شهر مختصر + يوم رقمي → Flutter: `DateFormat('d MMM', 'ar').format(...)` (أو `DateFormat.MMMd('ar')`). فارغ إذا لا `matchDate`. لون رمادي `#4B5563`.
- **الإغلاق:** نقر backdrop، أو swipe-down (في Flutter مجّاني عبر `DraggableScrollableSheet`). كل حِيَل `useModalScrollLock` (تجميد body، اعتراض touchmove، عتبة 80px) **web-only — لا تُنقَل**.

### 4.10 إطارات الرتب على كرت اللعب (§C — `RankFrames.tsx`)

كل إطار يُرسم داخل غلاف: `position:absolute; inset:0; overflow:hidden; borderRadius:16px (1rem); pointerEvents:none; zIndex:51`. المدخلات: `color` (hex؛ غير صالح → `#6b7280`)، `opacity` (0–1)، `strokeWidth`، `animate?`. تحويل اللون عبر `hexToRgba(hex, alpha)`. الأنواع في `FRAME_OPTIONS`:

| id | label | icon |
|----|-------|------|
| `none` | `بدون` | ⬜ |
| `simple` | `بسيط` | 🔲 |
| `greek` | `يوناني` | 🏛️ |
| `islamic` | `إسلامي` | 🕌 |
| `deco` | `آرت ديكو` | 🎭 |
| `royal` | `ملكي` | ⚜️ |

**كلها → `RankFramePainter` واحد (`CustomPainter`)** بتوقيع `RankFramePainter(type, Color color, double opacity, double strokeWidth, bool animate, double t)` حيث `t∈[0,1)` قيمة الأنيميشن. المواصفات الرياضية أدناه حرفية.

1. **Simple** — 4 أقواس زوايا داخلية L. لكل زاوية SVG **18×18**، `g=6px` من الحافة. المسار (زاوية أعلى-يسار مثلاً): `M0,18 L0,0 L18,0`؛ أعلى-يمين `M0,0 L18,0 L18,18`؛ أسفل-يسار `M0,0 L0,18 L18,18`؛ أسفل-يمين `M0,18 L18,18 L18,0`. Stroke = color@opacity، عرض `max(1, strokeWidth)`، `strokeCap/join = round`. **بلا أنيميشن.**

2. **Greek (meander)** — `m=5`، `sw=max(0.8, strokeWidth*0.7)`، وحدة `u=8`:
   - مستطيل خارجي: inset 5px، حد `sw*0.5` صلب، radius 8.
   - شريط meander علوي: strip موضعه `top: m-1، left/right: m+14`، ارتفاع `u*1.2 = 9.6px`، `overflow:hidden`؛ يحوي نمط مفتاح يوناني tile **16×8** (`width u*2=16, height u=8`) بمسار: `M0,8 L0,0 L16,0 L16,4 L4,4 L4,4 L8,4 L8,8` (stroke sw)، يملأ مستطيلاً بعرض كامل. عند `animate`: المستطيل `greek-scroll 6s linear infinite` (translateX 0→10px).
   - شريط سفلي: مطابق مرآةً `scaleY(-1)`.
   - 4 زخارف زوايا: SVG **14×14** — مستطيل خارجي `x1 y1 w12 h12` (stroke `sw*1.2`، rx 1) + داخلي `x4 y4 w6 h6` (stroke `sw*0.6`، fill color@opacity*0.1، rx 0.5).
   - **خلل معروف يُصلَّح في Flutter:** دورة `greek-scroll` تُزيح 10px بينما عرض الـ tile 16px → قفزة مرئية. في `RankFramePainter` اجعل دورة الإزاحة = **16px** (phase-shift `t*16`) لتكرار سلس. (كذلك حيلة مرجع الـ pattern عبر SVGين لا حاجة لها — كرّر بحلقة translate داخل band مقصوص.)

3. **Islamic** — `m=4`، `sw=max(0.6, strokeWidth*0.6)`، `c2 = color@opacity*0.15`:
   - حد خارجي: inset 4، **dashed**، radius 10 (استخدم `path_drawing.dashPath`).
   - **مولّد نجمة ثمانية** (16 رأساً): لكل `i∈[0,16)`: `angle = i*π/8 − π/16`، `rad = (i%2==0 ? r : r*0.38)`؛ النقطة `(cx + rad·cos(angle), cy + rad·sin(angle))`؛ أغلق المسار.
   - 4 نجوم زوايا: `r=8`، SVG **20×20** (`starR*2+4`), `cx=cy=10`, fill c2 stroke sw + نقطة مركز `r=1.5` fill color@opacity. عند `animate`: حاوية كل زاوية `frame-spin 20s linear infinite`.
   - 4 نجوم منتصف الأضلاع: `r=4`، SVG **12×12**، مواضع أعلى/أسفل الوسط (`translateX -50%`) ويسار/يمين الوسط (`translateY -50%`)، stroke `sw*0.8`.
   - خطّان أفقيّان واصلان (علوي/سفلي): `borderTop sw*0.5` صلب، color@opacity*0.3، بين نجوم الزوايا (`left/right: m + starR*2 + 4`، `top/bottom: m + starR + 1`).

4. **Art Deco** — `m=3`، `sw=max(0.6, strokeWidth*0.6)`، `c2 = color@opacity*0.25`:
   - إطار مزدوج: inset 3 (`sw` صلب، radius 10) + inset 6 (`sw*0.4` صلب c2، radius 8).
   - مروحتان (علوي/سفلي): SVG **32×16**، 5 خطوط من `(16,14)` بزوايا `a = −50 + i*25` درجة (`i∈[0,5)`)، نهاية `(16 + 12·sin(rad), 14 − 12·cos(rad))`, stroke sw، round cap؛ + نقطة مركز `r=2` fill. المروحة السفلية `scaleY(-1)`. عند `animate`: `deco-pulse 3s ease-in-out infinite` (السفلية بتأخير **1.5s**).
   - 4 زوايا مدرّجة: SVG **16×16**، مسار سلّم `M0,16 L0,8 L4,8 L4,4 L8,4 L8,0 L16,0` (stroke `sw*1.2`) + مربع `4×4` عند الطرف (fill c2، stroke `sw*0.6`)؛ مرآة لكل زاوية عبر `scale(flipX, flipY)` حيث `flipX = isLeft?1:-1، flipY = isTop?1:-1`.
   - نقطتا جانب: دائرتان **3px** صلبتان، عمودياً في الوسط عند `left/right: m+1`.

5. **Royal** — `m=3`، `sw=max(0.6, strokeWidth*0.5)`، `c2 = color@opacity*0.2`:
   - إطار خارجي inset 3 (`sw*1.2` صلب، radius 12) + داخلي inset 7 (`sw*0.5` صلب c2، radius 9).
   - fleur-de-lis علوي: SVG **24×14**، مسار بيزييه `M12,13 C12,6 10,3 7,1 C10,3 12,1 12,1 C12,1 14,3 17,1 C14,3 12,6 12,13Z` (fill c2، stroke sw)؛ نقطة أعلى `r=1.2`؛ زخرفتان جانبيتان `M5,8 Q3,5 6,2` و`M19,8 Q21,5 18,2` (stroke `sw*0.7`). موضع `top: m-1`. عند `animate`: `deco-pulse 4s`.
   - زخرف سفلي: نفس اللِّيلي بلا الزخرفتين، `scaleY(-1)`, تأخير **2s**.
   - 4 ميداليات زوايا: SVG **10×10** — دائرة `r=4` (fill c2، stroke sw) + نقطة مركز `r=1.5`. موضع inset `m+1`.
   - خطوط «scroll» متقطعة على الأضلاع الأربعة: `sw*0.6 dashed` color@opacity*0.3، inset **18px** من كل زاوية.

### 4.11 تأثيرات الرتب البصرية (§D — `RankEffects.css` + المسار config-driven)

الطبقة كلها أوفرلاي منفصل فوق وجه الكرت الأمامي: `absolute inset-0 rounded-2xl overflow-visible; zIndex:60; backfaceVisibility:hidden; transform:translateZ(1px)` (تختفي عند قلب الكرت — في Flutter: **لا تبنِ الأوفرلاي إذا زاوية القلب > 90°**). `pointer-events:none` (إلا في وضع تحرير الأدمن — غير مطلوب في تطبيق اللاعب).

**ترتيب z إلزامي (من الخلف للأمام):** `gradientOverlay(49) < border(50) < frame(51) < shimmer(52) < particles(53) < badge/floating/crown(55)`. طبّق نفس ترتيب بناء الطبقات في `Stack`.

#### 4.11.1 مواصفات الحركة (Keyframes) — قيم حرفية → `AnimationController`

| الاسم | تعريف CSS | المدّة/المنحنى | ترجمة Flutter |
|------|-----------|----------------|----------------|
| **rank-pulse** | `0%,100%: box-shadow var(--rank-glow); 50%: var(--rank-glow-strong)` | حسب `glow.pulseDuration` (افتراضياً CAPO 3s، UNDERBOSS 2.5s، GODFATHER 2s)، `ease-in-out infinite` | `controller(duration: pulseDuration)..repeat(reverse:true)` + `Curves.easeInOut`؛ lerp بين مجموعتَي `BoxShadow` (`--rank-glow` ↔ `--rank-glow-strong`). |
| **rank-shimmer** | `0%: translateX(-100%) rotate(25deg); 100%: translateX(200%) rotate(25deg)` | حسب `shimmer.duration` (UNDERBOSS 5s، GODFATHER 4s)، `ease-in-out infinite` | شريط مقصوص (`ClipRRect`) 40% عرض × 200% ارتفاع، تدرّج 90° `[transparent, color@opacity, white@0.04, transparent]`, مُدار 25°، يُترجَم من `-100%`→`200%` عبر `AlignmentTween`/`Matrix4.translation`. |
| **crown-float** | `0%,100%: translateY(0); 50%: translateY(-3px)` (مع `translateX(-50%)` توسيط) | float **2.5s**، bounce **1.5s**، `ease-in-out infinite` | تذبذب عمودي `±3px` جيبي: `dy = -3 * sin(t*π)` أو `Curves.easeInOut` مع `reverse`؛ التوسيط عبر `Align`/`Positioned`. |
| **particle-orbit** | `rotate(θ) translateX(orbit-radius) rotate(−θ)` لـ θ 0→360°؛ opacity 0→(20%)1→(80%)1→0 | حسب `baseDuration + i*0.8`s (لكل جسيم)، `linear infinite`، تأخير `i*0.7`s | موضع الجسيم = `center + Offset(cos(2π·θ), sin(2π·θ)) * R`. الغلاف opacity: 0 عند 0، ثم 1 عند 0.2، ثبات حتى 0.8، ثم 0 عند 1. (راجع تحذير `orbit-radius` أدناه.) |
| **corner-pulse** | `0%,100%: opacity 0.4; 50%: opacity 0.8` | **2.5s** `ease-in-out infinite` (أقواس CAPO) | `Tween(0.4, 0.8)` + `reverse` + `easeInOut`. |
| **border-travel** | `background-position 0% 50% → 200% 50%` على خلفية `200% 200%` | حسب `border.travelSpeed` (GODFATHER 3s)، `linear infinite` | حلقة تدرّج متنقّلة: ارسم مباشرةً `Paint()..shader = LinearGradient(...).createShader` على RRect بـ `style=stroke`، وحرّك إحداثيات الـ shader (أو `SweepGradient` بدوران `GradientRotation(2π·t)`) — أبسط بكثير من حيلة `mask-composite` في الويب. |
| **particle-burst** | scale 0.3→(10%)1→(80%)0.5→(100%)0؛ opacity 0→(10%)1→(80%)0.6→0؛ إزاحة نحو `(cos·dist, sin·dist)` | حسب `baseDuration + i*0.3`s، تأخير `i*(baseDuration/count)`s، `ease-out infinite` | **المستخدَم فعلياً هو الـ fallbacks المرقّمة `particle-burst-{i%8}`** — استخدم متجهات النهاية الثابتة الثمانية أدناه. |
| **greek-scroll** | `translateX 0→10px` | **6s** `linear infinite` | phase-shift أفقي — **اجعل الدورة 16px** (عرض الـ tile) لإصلاح القفزة. |
| **deco-pulse** | `0%,100%: opacity 0.7 scale 1; 50%: opacity 1 scale 1.05` | deco **3s** (سفلي +1.5s)، royal **4s** (سفلي +2s)، `ease-in-out infinite` | `Tween` مزدوج opacity+scale، `easeInOut`, reverse. |
| **frame-spin** | `rotate 0→360°` | **20s** `linear infinite` (نجوم زوايا Islamic فقط) | `RotationTransition` على طبقة نجوم الزوايا. |

**متجهات `particle-burst-{i}` (نقطة 80% → نقطة 100%، بالبكسل):**
```
0: (80,-60) → (96,-72)      4: (20,-80) → (24,-96)
1: (-70,-50) → (-84,-60)    5: (-30,75) → (-36,90)
2: (60,70) → (72,84)        6: (75,30) → (90,36)
3: (-80,40) → (-96,48)      7: (-50,-70) → (-60,-84)
```
(الـ fallbacks تبدأ opacity 1 scale 1 عند 0%، لا 0/0.3 كالنسخة الأساسية.)

> **تحذير حرج — `orbit-radius`:** في CSS القيمة `52%`/`54%` تُمرَّر إلى `translateX(var(--orbit-radius))`، والنسبة في `translateX` تُحسب من **عرض الجسيم نفسه (3px)** لا من الكرت → نصف قطر فعلي ≈ 1.5px (خلل كامن؛ الجسيمات تكاد لا تدور). النيّة التصميمية نصف قطر **نسبة من حجم الكرت**. في Flutter حُلّ `orbitRadius` كنسبة من بُعد الكرت (عبر `LayoutBuilder`) — انحراف واعٍ عن القيمة الحرفية لتحقيق الأثر المقصود. وثّق القرار.

#### 4.11.2 بنية الـ config (`RankEffectsDef.effects`) — انسخها حرفياً (§8)

كل قسم فيه `enabled`. مصدر القيم: `getRankEffectsForTier(tier)` حيث `id === tier` (INFORMANT…GODFATHER). المستهلك:

- **border** `{style: solid|gradient|traveling, width, inset, color, gradientColors[], travelSpeed}`: solid → حد `rgba(color,0.5)`؛ gradient/traveling → حلقة تدرّج (`linear-gradient(135deg, gradientColors.join(', '))`)؛ traveling يضيف `border-travel {travelSpeed}s`. glow.pulse يربط `rank-pulse` بـ `--rank-glow`/`--rank-glow-strong = 0 0 {size}px color@opacity` ↔ `0 0 {size*1.6}px color@min(1, opacity*1.5)`.
- **glow** `{color, size, opacity, pulseEnabled, pulseDuration}`: `boxShadow: 0 0 {size}px rgba(color,opacity)` على عنصر الحد.
- **shimmer** `{color, opacity, duration}`: الشريط القطري أعلاه.
- **particles** `{count, color, size, orbitRadius(string %), baseDuration, originX?=50, originY?=50, animationType: orbit|burst, burstDistance?}`: N نقاط عند `(originX%, originY%)`, `boxShadow 0 0 {size*2}px color@0.4`, لون `color@0.8`. orbit: `particle-orbit`, مدة `base + i*0.8`s, تأخير `i*0.7`s. burst: `particle-burst-{i%8}`, مدة `base + i*0.3`s, تأخير `i*(base/count)`s.
- **frame** `{type, color, opacity, strokeWidth, animate}` → `RankFramePainter` (§4.10).
- **gradientOverlay** `{color, opacity, direction}`: `linear-gradient(direction, rgba(color,opacity), transparent 50%)`, z49.
- **corners** `{color, size, width, pulseEnabled}` (أقواس زوايا كـ CAPO — معرّفة في النوع؛ المسار الحالي لا يرسمها config-driven لكن أبقِ الحقل).
- **floating** `{content, position: top|bottom, size, animation: float|bounce|spin, glowColor, offsetX?, offsetY?, scale?}`: عنصر عائم. `top = offsetY ?? (position==='top' ? -14 : undefined)`، `bottom = (offsetY===undefined && position==='bottom') ? -14 : undefined`، `left: calc(50% + offsetX)`, `transform: translateX(-50%) scale(scale||1)`, `fontSize: size`, z55. الحركة: float → `crown-float 2.5s`، bounce → `crown-float 1.5s`، spin → `particle-orbit 4s`. توهّج `drop-shadow(0 0 6px glowColor@0.6)`.
- **badge** `{emoji, label, bgColor, textColor, borderColor, position, offsetX?, offsetY?, scale?}`: pill عند `top: 4+offsetY، left: 4+offsetX`, `padding 2px 5px`, radius 6, **fontSize 10** weight 700 Inter, letterSpacing 0.05em, `backdrop-blur(4px)`, `transform scale(scale||1)` origin top-left, z55. (لاحظ: المسار الـ config يستخدم **10px** بينما كلاس CSS القديم يستخدم 8px.)
- **nameEffect** `{color, glowColor, glowSize}`: توهّج اسم اللاعب (GODFATHER يستخدم كلاس `.rank-name-glow` → لون `#fcd34d` وظلّان أمبريّان).

`hasRankEffects = fx ? (border||glow||shimmer||particles||frame||floating||badge).enabled : false`.

#### 4.11.3 المسار القديم class-based (يُحفظ كافتراضيات لكل رتبة)

انسخ هذه القيم كـ defaults في `RankEffectsDef` عند غياب config من السيرفر (لا تُكوِّدها بديلاً عن الـ config):

- **INFORMANT (tier 1):** بلا تأثيرات — كرت عادي.
- **SOLDIER (`#10b981` أخضر):** حد ثابت `1px solid rgba(16,185,129,0.4)` inset −1px، **بلا نبض**، `box-shadow --rank-glow = 0 0 8px rgba(16,185,129,0.3), inset 0 0 2px rgba(16,185,129,0.05)` (strong = `0 0 14px .5, inset 0 0 4px .1`)؛ خط علوي متدرّج `.rank-accent-line`: `top:0, left/right:10%, height:1px, linear-gradient(90deg, transparent, rgba(16,185,129,0.5), transparent)`, z51.
- **CAPO (`#3b82f6` أزرق):** حد `1.5px solid rgba(59,130,246,0.45)` inset −2px، `rank-pulse 3s`؛ glow `0 0 12px .4, inset 0 0 4px .08` ↔ `0 0 20px .6, inset 0 0 6px .12`؛ 4 أقواس زوايا **12×12** (border 2px، radius 4px، 2px من الزاوية، لون `rgba(59,130,246,0.6)`) `corner-pulse 2.5s`؛ طبقة تدرّج سفلية `linear-gradient(to top, rgba(59,130,246,0.06), transparent 40%)`, z49.
- **UNDERBOSS (`#8b5cf6` بنفسجي + لمسات أمبر):** حد `2px border-image linear-gradient(135deg, rgba(139,92,246,0.6), rgba(245,158,11,0.4), rgba(139,92,246,0.6))` inset −2px، `rank-pulse 2.5s`؛ glow `0 0 18px rgba(139,92,246,0.45), 0 0 4px rgba(245,158,11,0.15)` ↔ `0 0 28px .65, 0 0 8px .25`؛ طبقة تدرّج `rgba(139,92,246,0.08) → transparent 50%`؛ **shimmer** (`rank-shimmer 5s`، تدرّج `[transparent, rgba(139,92,246,0.08), rgba(255,255,255,0.04), transparent]`)؛ **3 جسيمات** `3×3` لون `rgba(139,92,246,0.7)`، `orbit-radius 52%`.
- **GODFATHER (`#f59e0b` ذهبي):** حلقة تدرّج متنقّلة inset −3px، padding 2px، `linear-gradient(135deg, rgba(245,158,11,0.8), rgba(234,179,8,0.4), rgba(245,158,11,0.8), rgba(252,211,77,0.6))` بحجم 200%، `border-travel 3s linear + rank-pulse 2s`، مُجوَّفة بـ `mask-composite: exclude`؛ glow `0 0 25px .5, 0 0 6px .3` ↔ `0 0 40px .7, 0 0 10px .5, 0 0 80px .15`؛ طبقتا تدرّج (`rgba(245,158,11,0.1)→50%` + قطري `.03`)؛ **تاج** `👑` عند `top: -14px` توسيط، fontSize **18px**، `crown-float 2.5s`، `drop-shadow(0 0 6px rgba(245,158,11,0.6))`, z55؛ **shimmer** (`4s`، أمبر .1 / أبيض .06)؛ جسيمات `3×3` `rgba(245,158,11,0.8)` مع `box-shadow 0 0 4px rgba(245,158,11,0.5)`, `orbit-radius 54%`؛ `.rank-name-glow`: اسم اللاعب `#fcd34d !important`, `text-shadow: 0 0 8px rgba(245,158,11,0.4), 0 0 20px rgba(245,158,11,0.15)`.
- **`.rank-badge` (مشترك):** `top 4 left 4`, z55, `padding 2px 5px`, radius 6, font **8px**/700 Inter, letterSpacing 0.05em, `backdrop-blur(4px)`. لكل رتبة: SOLDIER خلفية `rgba(16,185,129,0.15)` نص `#6ee7b7` حد `rgba(16,185,129,0.3)`؛ CAPO `rgba(59,130,246,0.15)`/`#93c5fd`/`rgba(59,130,246,0.3)`؛ UNDERBOSS `rgba(139,92,246,0.2)`/`#c4b5fd`/`rgba(139,92,246,0.35)`؛ GODFATHER `rgba(245,158,11,0.2)`/`#fcd34d`/`rgba(245,158,11,0.4)` + `box-shadow 0 0 8px rgba(245,158,11,0.2)`.

---

## 5. التكيّف مع الشاشات 6→11 إنش

> الاستراتيجية الكاملة (Window Size Classes) في **01-foundation-theme.md**. أدناه تخصيص **هذه** الشاشة فقط. الفئات: **compact** < 600dp، **medium** 600–840dp، **expanded** > 840dp.

### 5.أ شاشة الرتب (اللوحة/المواسم/التبويبات/البروفايل)

- **compact (< 600dp):** طبق-الأصل من الـ PWA — عمود واحد `maxWidth 512dp` موسّط، `px-4 pt-6`. المنصّة صف واحد بأحجام 56/72/56، الصفوف عمود، مودال البروفايل bottom-sheet فوق الـ nav.
- **medium (600–840dp):** سقف عرض المحتوى **640dp** موسّط. صفوف اللوحة تبقى قائمة واحدة (سطر معلومات كثيف — لا تحوّلها شبكة). كبّر عناصر المنصّة ~1.15× (avatars 64/84/64) وزِد `gap`. صناديق الإحصاء تبقى 3/4 لكن مع padding أكبر. المنسدلة: بدّل `max-w-[52vw]` إلى سقف مطلق `~280dp` (52vw على تابلت يصبح مفرطاً). مودال البروفايل يبقى bottom-sheet بعرض `maxWidth 512`.
- **expanded (> 840dp):** سقف عرض المحتوى **840–960dp** موسّط. خياران للوحة: (1) صفوف المركز الرابع فما فوق في **شبكتين عموديتين** (`GridView` بعمودين) لتقليل التمرير — أو الأبقى للتكافؤ قائمة مفردة عريضة موسّطة عند 720dp؛ (2) **two-pane**: اللوحة يسار وبطاقة البروفايل المختار كـ **لوح جانبي ثابت** يمين بدل الـ bottom-sheet (استبدل `showModalBottomSheet` بـ side panel داخل `Row`). المنصّة بأحجام مضاعفة ~1.4× (avatars 80/100/80). حافظ على ثبات أحجام الخط النسبية (لا تمدّد النص — كبّر الحاويات).

### 5.ب إطارات وتأثيرات كرت اللعب

- التأثيرات تتبع **حجم الكرت** (يُملى من الشاشة المضيفة — 22-role-cards.md). `orbitRadius` نسبة من حجم الكرت فتتقياس تلقائياً.
- **قيم مطلقة بالبكسل يجب تقياسها يدوياً مع الكرت** (وإلا تبدو نحيفة/صغيرة على كرت مضاعف في expanded): `strokeWidth`, `border.width/inset`, `glow.size`, `particles.size`, هوامش الإطارات (m=3/4/5)، أحجام SVG (18/14/20/16/24/10)، `floating.size`, `badge` padding/font، إزاحة التاج −14px. مرّر `cardScale` (نسبة بُعد الكرت الحالي إلى بُعد مرجعي، مثلاً 220dp) واضربه في هذه القيم داخل `RankFramePainter`/`RankEffectsOverlay`.
- **expanded:** ضاعف بُعد الكرت (لا تمدّده) فتتضاعف التأثيرات تناسبياً عبر `cardScale`. حافظ على `RepaintBoundary` حول الكرت.

---

## 6. المنطق والتدفقات

### 6.1 آلة الحالة العليا لشاشة الرتب

```
[Init] → loading=true
  → Promise.all(7 fetches) settle → loading=false
[Loaded]
  states: tab ∈ {leaderboard, coplayers, howto}
          mode ∈ {inperson, online}
          selectedSeasonId, activeSeasonId, activeOnlineSeasonId
          glowing (bool), followLoading (targetId|null)
          selectedProfile/selectedPlayer (مودال)
```

- **التحميل الأولي:** 7 fetches متوازية. الأربعة المغلّفة بـ `.catch(()=>null)` (progression-config، active season، list، online-list) تتدهور بأمان. leaderboard/co-players/profile: تُقرأ فقط إن `data.success` وإلا تبقى فارغة. `setSelectedSeasonId(prev => prev ?? activeId)` (لا يدوس اختيار المستخدم).
- **`viewingActive`** = `mode==='inperson' && (!selectedSeasonId || selectedSeasonId === activeSeasonId)`. عندها `leaderboard = liveLeaderboard`؛ وإلا `leaderboard = seasonBoard || []`.
- **`currentSeasonList`** = `mode==='online' ? onlineSeasons : seasons`.
- **`selectedSeasonName`** = `currentSeasonList.find(id===selected)?.name || season?.name || ''`.
- **`myRank`** = `leaderboard.findIndex(p => p.id === myId) + 1` (0 إذا غير موجود؛ يُعرض `#` فقط إن `>0`). **`myRow`** = `leaderboard.find(id===myId)`.

### 6.2 تبديل الوضع والموسم

- **`switchMode(m)`:** يضبط `mode=m` و`selectedSeasonId = (m==='online' ? activeOnlineSeasonId : activeSeasonId)`.
- **effect جلب لوحة الموسم:** يُطلَق على تغيّر `selectedSeasonId` أو `activeSeasonId`. إذا `!selectedSeasonId || selectedSeasonId === activeSeasonId` → `seasonBoard=null` وتوقّف (تُعرض اللوحة الحية). وإلا `seasonLoading=true` → `GET /api/seasons/public/{id}/leaderboard` → عند النجاح `seasonBoard = leaderboard || []`؛ خطأ → `[]`. **علم إلغاء (`cancelled`)** يمنع setState بعد unmount/تغيّر المعامل. Flutter: احفظ رمز طلب حالي وأهمِل استجابة الطلبات القديمة، أو `CancelToken`.
- **حالة حدّية:** إذا تطابق معرّف موسم أونلاين رقمياً مع `activeSeasonId` الوجاهي → الـ effect يخرج مبكراً (`===`) واللوحة تبقى فارغة. نادر لكنه حقيقي — أبقِه للتكافؤ.

### 6.3 المتابعة/إلغاء المتابعة (تفاؤلي، أخطاء صامتة)

- متاح فقط إذا `isCoPlayer(targetId) && targetId !== myId` (تتابع فقط من شاركتهم مباراة).
- **Follow:** `followLoading=targetId` → `POST .../follow/{targetId}`؛ نجاح إذا `data.success || res.status === 200` → اقلب `isFollowing=true` في `coPlayers` (تفاؤلي بعد الاستجابة) → `followLoading=null`.
- **Unfollow:** `followLoading=targetId` → `DELETE` (نفس المسار) → **تجاهل الاستجابة كلياً** → اقلب `isFollowing=false` → `followLoading=null`.
- كل الأخطاء تُبلَع بصمت (`try/catch {}`). **لا toasts في هذه الشاشة.**
- نجمة صف اللوحة تستدعي `stopPropagation` (لا تفتح البروفايل).

### 6.4 مودال البروفايل

- فتح: `viewProfile(id)` → `GET /api/player/{id}/profile` → يُفتح المودال فقط عند `data.success` (فشل صامت). `selectedProfile=data، selectedPlayer=id`.
- إغلاق: نقر backdrop → `selectedProfile=null، selectedPlayer=null`؛ أو swipe-down (مجّاني في `DraggableScrollableSheet`).

### 6.5 المؤقّتات والمهل + auto-scroll/glow

- **auto-scroll + glow effect** (يُطلَق على `loading` أو تغيّر `tab`): بعد **300ms** → `myCardRef.scrollIntoView({behavior:'smooth', block:'center'})`؛ ومؤقّت آخر **5000ms** → `glowing=false`. Flutter: `WidgetsBinding.addPostFrameCallback` ثم `Future.delayed(300ms)` → `Scrollable.ensureVisible(context, alignment: 0.5, duration: ~400ms, curve: easeInOut)`؛ و`Future.delayed(5000ms)` لإيقاف الـ `AnimationController`. ألغِ المؤقّتات عند التخلّص/إعادة الإطلاق.
- النقر على تبويب `الترتيب` يعيد `glowing=true` (يعيد تشغيل التوهّج ومؤقّتاته عبر إعادة تشغيل الـ effect).

### 6.6 إعادة الاتصال واستعادة الحالة (حيوي)

- **إعادة الجلب عند العودة:** الويب يستمع لـ `visibilitychange` (عند `visible`) و`window focus` ويعيد `loadData()` كاملاً — **حيوي** لانعكاس RR الجديد فور العودة من مباراة. Flutter: `WidgetsBindingObserver.didChangeAppLifecycleState == resumed` + `RouteAware.didPopNext` (العودة من شاشة أخرى) → أعد `loadData()`.
- لا حالة محلية تُخزَّن؛ إعادة الفتح تعيد الجلب من الصفر. لا مؤقّت polling.

### 6.7 دورة حياة تأثيرات الكرت

- الأنيميشنات لانهائية طالما الكرت ظاهر. أوقفها خارج الشاشة عبر `TickerMode`/`VisibilityDetector`، واحترم `MediaQuery.disableAnimations` (reduce-motion) بعرض النسخة الساكنة (`animate:false`). لا تبنِ الأوفرلاي إذا زاوية قلب الكرت > 90°.

---

## 7. عقود التكامل

### 7.1 REST (كلها مسارات نسبية عبر عميل 03-networking-rest.md)

`Bearer = Authorization: Bearer {player.token}`.

| # | Method | Path | Auth | Request | حقول الاستجابة المستخدَمة |
|---|--------|------|------|---------|--------------------------|
| 1 | GET | `/api/player-app/leaderboard` | — | — | `{success, leaderboard:[{id, name, avatarUrl, rankTier, rankRR, totalMatches, totalWins, level?}]}` (اللوحة الحية للموسم الوجاهيّ النشط) |
| 2 | GET | `/api/player-app/{playerId}/co-players` | Bearer | — | `{success, coPlayers:[{id, name, avatarUrl, rankTier, matchCount, isFollowing}]}` |
| 3 | GET | `/api/player/{id}/profile` | — | — | `{success, player:{name, avatarUrl}, progression:{xp, level, nextLevelXP, xpProgress (0–100 مقيّد من السيرفر), rankTier, rankRR, rrRequired, totalDeals, successfulDeals, dealSuccessRate}, stats:{totalMatches, totalWins, winRate, survivalRate}, matchHistory:[{role, matchWinner, matchDate}]}` — `rrRequired`/`nextLevelXP` يصلان دائماً fresh (الـ config يُطبَّق عند الإقلاع وعند حفظ الإعدادات) (لنفسي `myProfile` ولأي لاعب معروض) |
| 4 | GET | `/api/progression-settings/public` | — | — | `{success, config:{xp:{...14 مفتاحاً}, rr:{...17 مفتاحاً}, ranks:{TIER:{rrRequired}}, roleAbilities:{ROLE:{correctXp, correctRr, wrongXp, wrongRr}}, level:{baseXP, exponent}, demotionReturnPercent}}` — المفاتيح الكاملة أدناه (مغلّف `.catch(()=>null)`) |
| 5 | GET | `/api/seasons/public/active` | — | — | `{success, season:{id, name}}` |
| 6 | GET | `/api/seasons/public/list` | — | — | `{success, seasons:[{id, name}]}` (مواسم وجاهيّة) |
| 7 | GET | `/api/seasons/public/online-list` | — | — | `{success, seasons:[{id, name}], activeOnlineSeasonId}` |
| 8 | GET | `/api/seasons/public/{seasonId}/leaderboard` | — | — | `{success, leaderboard:[شكل الصف نفسه + level]}` (أي لوحة غير حية) |
| 9 | POST | `/api/player-app/{playerId}/follow/{targetId}` | Bearer | body فارغ | `{success}` (أو 200 مجرّد) |
| 10 | DELETE | `/api/player-app/{playerId}/follow/{targetId}` | Bearer | — | (تُتجاهل) |
| 11 | GET | `{NEXT_PUBLIC_API_URL}/api/game-config/rank-effects` | Bearer (token من مخزن `token`) | — | `{data: RankEffectsDef[]}` أو `RankEffectsDef[]` مباشرة (`data.data || data`)؛ cache 5 دقائق. يوفّر تأثيرات الكرت (لا تستدعيه صفحة الرتب نفسها) |

**ملاحظات مهمة:**
- **`avatarUrl` قد يكون مساراً نسبياً:** صفحة الرتب في الويب تستخدمه كما هو (same-origin proxy). في Flutter **يجب** prefix بعنوان الـ base (socket/API URL) عند كونه نسبياً، مع cache-busting متسق (`?t=...`) — راجع 03-networking-rest.md.
- لا endpoints جديدة. التطبيق عميل ثانٍ لنفس الـ backend.

#### 7.1.1 بنية `config` الكاملة (`/api/progression-settings/public`) — كلها قابلة للتعديل من الأدمن (القيم أدناه = الافتراضيات)

- **`xp` (14 مفتاحاً):** `participation:20, teamWin:50, survivalPerRound:5, abilityCorrect:10, abilityIncorrect:-5, citizenDealOnMafia:50, failedDeal:-10, mafiaDealOnMafia:-10, teamEliminationBonus:15, jesterWin:50, jesterLoss:0, assassinWin:80, assassinLoss:10, assassinContractComplete:15`.
- **`rr` (17 مفتاحاً):** `teamWin:20, teamLoss:-20, citizenDealOnMafia:20, failedDeal:-30, mafiaDealOnMafia:-30, survivedToEnd:5, abilityCorrect:5, abilityIncorrect:-5, penaltyDeduction:-10, penaltyKickDeduction:-30, bombHitCitizen:10, bombHitMafia:-10, jesterWin:30, jesterLoss:-10, assassinWin:30, assassinLoss:-15, assassinContractComplete:10`.
- **مفاتيح `xp` و`rr` ليست متطابقة:** `xp` بلا `teamLoss`/`survivedToEnd`/عقوبات/قنبلة، و`rr` بلا `participation`/`survivalPerRound`/`teamEliminationBonus`. تبويب «النقاط» يخفي الـ chip/الصف تلقائياً عند غياب المفتاح (§4.8) — هذا هو السلوك الصحيح، لا تفترض التماثل.
- **`ranks`:** `{INFORMANT:{rrRequired:100}, SOLDIER:{rrRequired:200}, CAPO:{rrRequired:300}, UNDERBOSS:{rrRequired:400}, GODFATHER:{rrRequired:9999}}` — **هذا هو مصدر الحقيقة لمتطلّب الترقية** (لا `RANK_RR_REQUIRED` الصلبة).
- **`roleAbilities`:** overrides لكل دور — `SNIPER/SHERIFF/DOCTOR/NURSE/POLICEWOMAN/GODFATHER/SILENCER/WITCH: {correctXp, correctRr, wrongXp, wrongRr}`. تتقدّم على العامة؛ الدور الغائب يسقط على `xp.abilityCorrect/abilityIncorrect` + `rr.abilityCorrect/abilityIncorrect`. **SHERIFF wrong = 0/0 متعمّد** (لا عقوبة على خطأ الشريف) — لا تعتبره نقص بيانات.
- **`level`:** `{baseXP:500, exponent:1.2}` — معادلة المستوى أدناه.
- **`demotionReturnPercent`:** `80`.

#### 7.1.2 قواعد سيرفر يجب أن تعكسها الواجهة

- **ترتيب اللوحة يُحسم على السيرفر:** `rankTier DESC → rankRR DESC → level DESC`. لا تعِد الترتيب على العميل — اعرض الصفوف كما وصلت.
- **معادلة المستوى:** `xpForNextLevel(L) = floor(baseXP × L^exponent)`. **`players.xp` هو المتبقّي داخل المستوى الحالي (residual) لا التراكمي**، و`progression.xpProgress` يصل جاهزاً من السيرفر مقيّداً 0–100 — لا تعِد حسابه.
- **الهبوط (demotion):** عند النزول رتبةً يعود اللاعب عند `demotionReturnPercent%` (افتراضياً 80%) من متطلّب الرتبة الأدنى.
- **القنبلة على محايد (JESTER/ASSASSIN) = 0 RR** — لا `bombHitCitizen` ولا `bombHitMafia`؛ المحايد ليس مواطناً ولا مافيا.
- **العقوبات والقنبلة تُرسَّخ في `match_players` عند الـ finalize** (`rr_change` + `penalty_rr_deduction` / `bomb_rr_change`) — عليها يعتمد مودال تفصيل النقاط (16-history.md).
- **إنهاء المواسم:** `POST /api/seasons/{id}/end` على الموسم **العادي النشط** يرجع **HTTP 409** برسالة عربية (الطريق الصحيح: بدء موسم عادي جديد). لا يخص شاشة اللاعب مباشرة لكنه يفسّر أن الموسم الوجاهيّ النشط موجود دائماً.

### 7.2 Socket

**لا شيء.** لا `.emit` ولا `.on` في أي من ملفات هذه الشاشة/الإطارات/التأثيرات. النضارة عبر refetch على lifecycle (§6.6).

---

## 8. نماذج Dart المطلوبة

> سجّلها مركزياً في 02-models-data-layer.md. أسماء الحقول تطابق مفاتيح JSON من §7.

```dart
// ── ثوابت الرتب (من ranks.ts) ──
enum RankTier { INFORMANT, SOLDIER, CAPO, UNDERBOSS, GODFATHER }
class RankConst {
  static const namesAr = {RankTier.INFORMANT:'مُخبر', RankTier.SOLDIER:'جندي', RankTier.CAPO:'كابو', RankTier.UNDERBOSS:'أندربوس', RankTier.GODFATHER:'الأب الروحي'};
  static const badges  = {RankTier.INFORMANT:'🕵️', RankTier.SOLDIER:'⚔️', RankTier.CAPO:'🎖️', RankTier.UNDERBOSS:'💎', RankTier.GODFATHER:'👑'};
  static const colors  = {RankTier.INFORMANT:0xFF6B7280, RankTier.SOLDIER:0xFF3B82F6, RankTier.CAPO:0xFFA855F7, RankTier.UNDERBOSS:0xFFF59E0B, RankTier.GODFATHER:0xFFEF4444};
  // fallback أخير فقط — مصدر الحقيقة config.ranks[tier].rrRequired أو progression.rrRequired (§4.0, §7.1.1). لا تقرأها مباشرة؛ استخدم rrRequiredFor()
  static const rrRequiredFallback = {RankTier.INFORMANT:100, RankTier.SOLDIER:200, RankTier.CAPO:300, RankTier.UNDERBOSS:400, RankTier.GODFATHER:9999};
}

/// config-first: كل استهلاك لمتطلّب RR يمرّ من هنا — لا وصول مباشر للخريطة الصلبة.
/// الأولوية: rrRequired الجاهز من البروفايل ← config.ranks[tier].rrRequired ← الـ fallback الصلب ← 100.
int rrRequiredFor(RankTier tier, {int? fromProfile, ProgressionConfig? config}) =>
    fromProfile ?? config?.ranks[tier.name]?.rrRequired ?? RankConst.rrRequiredFallback[tier] ?? 100;

class LeaderboardRow {
  final int id; final String? name; final String? avatarUrl;
  final String rankTier; final int rankRR;
  final int totalMatches; final int totalWins; final int? level;
}

class CoPlayer {
  final int id; final String? name; final String? avatarUrl;
  final String rankTier; final int matchCount; bool isFollowing;
}

class Season { final int id; final String name; }
class OnlineSeasonsResp { final List<Season> seasons; final int? activeOnlineSeasonId; }

class PlayerProfileResp {
  final bool success;
  final ProfilePlayer? player;      // {name, avatarUrl}
  final ProfileProgression? progression; // الحمولة الكاملة — §7.1 صف 3
  final ProfileStats? stats;        // {totalMatches, totalWins, winRate, survivalRate}
  final List<ProfileMatch> matchHistory; // {role, matchWinner, matchDate}
}
class ProfilePlayer { final String? name; final String? avatarUrl; }
class ProfileProgression {
  final int xp; final int level; final int nextLevelXP; final num xpProgress; // 0–100 مقيّد من السيرفر — لا تعِد حسابه
  final String rankTier; final int rankRR; final int rrRequired; // rrRequired يصل دائماً fresh من الـ config
  final int totalDeals; final int successfulDeals; final num dealSuccessRate;
}
class ProfileStats { final int totalMatches; final int totalWins; final num winRate; final num survivalRate; }
class ProfileMatch { final String? role; final String? matchWinner; final String? matchDate; }

class ProgressionConfig {
  final Map<String,int> xp;   // 14 مفتاحاً — §7.1.1 (بلا teamLoss/survivedToEnd/عقوبات/قنبلة)
  final Map<String,int> rr;   // 17 مفتاحاً — §7.1.1 (تشمل العقوبات والقنبلة والمحايدين)
  final Map<String,RankReq> ranks;                     // مصدر الحقيقة لمتطلّب الترقية
  final Map<String,RoleAbilityOverride> roleAbilities; // SNIPER…WITCH؛ الدور الغائب → fallback على abilityCorrect/Incorrect
  final LevelConfig level;            // xpForNextLevel(L) = floor(baseXP × L^exponent)
  final int demotionReturnPercent;    // افتراضياً 80
}
class RankReq { final int? rrRequired; }
class RoleAbilityOverride { final int correctXp; final int correctRr; final int wrongXp; final int wrongRr; } // SHERIFF wrong = 0/0 متعمّد
class LevelConfig { final num baseXP; final num exponent; }

// ── تأثيرات الكرت (من useGameConfig.RankEffectsDef) ──
class RankEffectsDef { final String id; final String nameAr; final int sortOrder; final RankEffects effects; }
class RankEffects {
  final BorderFx border; final GlowFx glow; final ShimmerFx shimmer;
  final ParticlesFx particles; final CornersFx corners; final FrameFx frame;
  final GradientOverlayFx gradientOverlay; final FloatingFx floating;
  final BadgeFx badge; final NameEffectFx nameEffect;
}
class BorderFx { final bool enabled; final String color; final double width; final double inset;
  final String style; /* solid|gradient|traveling */ final List<String> gradientColors; final double travelSpeed; }
class GlowFx { final bool enabled; final String color; final double size; final double opacity; final bool pulseEnabled; final double pulseDuration; }
class ShimmerFx { final bool enabled; final String color; final double opacity; final double duration; }
class ParticlesFx { final bool enabled; final int count; final String color; final double size;
  final String orbitRadius; final double baseDuration; final double? originX; final double? originY;
  final String? animationType; /* orbit|burst */ final double? burstDistance; }
class CornersFx { final bool enabled; final String color; final double size; final double width; final bool pulseEnabled; }
class FrameFx { final bool enabled; final String type; /* none|simple|greek|islamic|deco|royal */
  final String color; final double opacity; final double strokeWidth; final bool animate; }
class GradientOverlayFx { final bool enabled; final String color; final double opacity; final String direction; }
class FloatingFx { final bool enabled; final String content; final String position; /* top|bottom */
  final double size; final String animation; /* float|bounce|spin */ final String glowColor;
  final double? offsetX; final double? offsetY; final double? scale; }
class BadgeFx { final bool enabled; final String emoji; final String label; final String bgColor;
  final String textColor; final String borderColor; final String position; final double? offsetX; final double? offsetY; final double? scale; }
class NameEffectFx { final bool enabled; final String color; final String glowColor; final double glowSize; }

enum FrameType { none, simple, greek, islamic, deco, royal }
```

**عناصر واجهة (Widgets):**
- `RankScreen`, `RankHeader`, `MyRankCard` (variant: current/pastSeason), `RankTabs`, `LeaderboardTab`, `PodiumTop3`, `LeaderboardRowTile`, `CoPlayersTab`, `CoPlayerTile`, `HowToTab`, `RankLadderCard`, `PlayerProfileSheet`.
- `RankFramePainter extends CustomPainter` (§4.10)، `RankEffectsOverlay(config, cardSize, flipAngle)` (§4.11)، `PulseGlowController`, `ShimmerBand`, `OrbitParticle`, `BurstParticle`, `FloatingElement`, `RankBadgePill`.
- `hexToRgba(String hex, double a)` مطابقة (غير صالح → `0xFF6B7280`).

---

## 9. الحزم المستخدمة

- `flutter_animate` — fade/slide الدخول للبطاقات والتبويبات.
- `intl` — تنسيق تاريخ `ar`/`ar_JO` (`DateFormat('d MMM', 'ar')`).
- `cached_network_image` — avatars الشبكية مع fallback `🎭` وإخلاء cache عند تحديث الصورة.
- `path_drawing` — الحدود المتقطّعة (`dashPath`) لإطارَي Islamic/Royal (لا يوجد dashed stroke أصلي في Flutter).
- `visibility_detector` (أو `TickerMode`) — إيقاف أنيميشنات الكرت خارج الشاشة.
- إدارة حالة (Riverpod/Bloc حسب معيار المشروع) — حالة الشاشة والـ config cache.
- مخزن الجلسة الموحّد (05-session-auth.md) — `playerId`/`token`.
- **بلا حزم مخصّصة لـ shimmer/particles** — تُبنى يدوياً لتطابق القيم الحرفية (`flutter_animate.shimmer()` تقريبي فقط).

---

## 10. اختلافات Android / iOS

الاختلافات محدودة (الشاشة REST + رسم زخرفي فقط، بلا مستشعرات/أذونات)، لكنها موجودة:

1. **عرض الـ emoji:** الشارات 🕵️ ⚔️ 🎖️ 💎 👑 والنجوم 🌟 وأيقونات الإطارات ⚜️ 🏛️ 🕌 تختلف شكلاً بين Apple Color Emoji (iOS) وNoto/OEM (Android، ويختلف بين نُسخ/شركات) — قد تظهر بعضها أحادية اللون على أندرويد قديم. للتوحيد: ضمّن خط `NotoColorEmoji` أو استبدل الشارات الحسّاسة بأصول (المشروع يتفادى ZWJ emoji أصلاً — راجع constants.ts). اختبر على أجهزة أندرويد منخفضة الإصدار.
2. **`backdrop-filter: blur(4px)`** في شارة الكرت (`BackdropFilter`): يعمل على المنصّتين لكنه أغلى على أندرويد الضعيف — بما أن ألوان الخلفية تحمل ألفا، استبدله بلون صلب مكافئ لتوفير الأداء.
3. **الأنيميشنات اللانهائية** (توهّج/جسيمات/shimmer/حلقة متنقّلة): استهلاك بطارية/jank أعلى على أندرويد الضعيف — راجع §13.

عدا ذلك: لا اختلاف في المنطق أو الشبكة أو التخطيط بين المنصّتين.

---

## 11. الأصول المطلوبة

- **لا صور/أصوات/lottie.** كل البصريات: emoji نصّية، ألوان، وSVG إجرائي مُترجَم إلى `CustomPainter`.
- **صور شبكية فقط:** `avatarUrl` لكل لاعب (اللوحة/المنصّة/لعبت-معهم/البروفايل) — تحتاج prefix بعنوان الـ base عند كونها نسبية + `cached_network_image` مع fallback `🎭`.
- **خطوط:** `Inter` لشارة الكرت (`.rank-badge`)؛ عائلة mono لأرقام النقاط؛ `tabular-nums` عبر `FontFeature.tabularFigures()`. (اختياري) خط emoji مُضمَّن للتوحيد.
- الإطارات مرسومة برمجياً — **لا ملفات SVG**.

---

## 12. معايير القبول — checklist تكافؤ

الشاشة (اللوحة/المواسم/التبويبات):
- [ ] العنوان `🏆 التصنيف والرتب` والـ spinner 40px الأمبري في التحميل.
- [ ] مبدّل الوضع يظهر فقط إذا `onlineSeasons.length>0`، بألوان وجاهيّ أمبر / أونلاين سماوي الحرفية.
- [ ] منسدلة الموسم بنصوص `🗓️ {name}` ولاحقة ` • الحالي`، وبدائل `🌐 لا مواسم أونلاين بعد` / `🗓️ موسم: {name}`.
- [ ] بطاقة «رتبتي» تعرض الصيغة الصحيحة (حالي مقابل سابق/أونلاين) بحالات `جارٍ التحميل…` / صف / `لم تلعب في هذا الموسم`.
- [ ] شريط تقدّم RR يتحرّك من 0 إلى النسبة المحسوبة بلون الرتبة — **المقام config-first** (`prog.rrRequired` ← `config.ranks[tier].rrRequired` ← fallback صلب أخير)، لا قسمة مباشرة على `RANK_RR_REQUIRED`.
- [ ] التبويبات الثلاثة بنصوصها، وانتقال fade، وإعادة `glowing=true` عند نقر `الترتيب`.
- [ ] المنصّة top-3 تظهر فقط عند `>=3`، بترتيب #2/#1/#3 وأحجام 56/72/56 والقصّ اليدوي 8/10/8، وميداليات 🥈🥇🥉.
- [ ] الصفوف من المركز الرابع (`slice(3)`)؛ صفّي مميّز + ` (أنت)` + توهّج `pulse-glow 1.5s` يتوقّف بعد 5s + غير قابل للنقر.
- [ ] حالة اللوحة بلاعب/لاعبين = صفر صفوف (أو القرار الواعي بإصلاحها موثّق).
- [ ] auto-scroll لصفّي (center) بعد 300ms، وإعادة الجلب عند `resumed`/`didPopNext`.
- [ ] «لعبت معهم»: حالة فارغة `العب مباراة أولاً لتعرف لاعبين!` + الصفوف + أزرار `⭐ متابع`/`☆ تابع`/`...`.
- [ ] «النقاط»: البطاقة التمهيدية، 3 فئات بالأفعال/الأيقونات/الأوصاف الحرفية، chips XP/RR بألوانها وإخفاء 0، إخفاء الصف عند غياب القيمتين، بطاقة الرتب بشارات النجوم و`{rrRequired ?? '?'} RR`.
- [ ] مودال البروفايل يجلس فوق الـ nav (64px + safe-area)، spring damping 25/stiffness 300، مقبض 40×4، إحصاء 3 أعمدة، آخر 5 مباريات باشتقاق الفوز الصحيح والتاريخ `ar-JO`.
- [ ] متابعة تفاؤلية (نجاح `success||200`)، إلغاء متابعة يتجاهل الاستجابة، كل الأخطاء صامتة (لا toasts).

الإطارات والتأثيرات:
- [ ] الإطارات الخمسة مرسومة 1:1 (Simple/Greek/Islamic/Deco/Royal) بمساراتها وهوامشها الحرفية عبر `RankFramePainter`.
- [ ] كل keyframe منفّذ بمدّته الحرفية: pulse (2/2.5/3s)، shimmer (4/5s)، crown-float (2.5/1.5s)، particle-orbit (base+i·0.8s، تأخير i·0.7s)، corner-pulse (2.5s)، border-travel (3s)، particle-burst (المتجهات الثمانية)، greek-scroll (مصلَّح 16px)، deco-pulse (3/4s)، frame-spin (20s).
- [ ] ترتيب z محفوظ (49/50/51/52/53/55) والأوفرلاي يختفي عند قلب الكرت >90°.
- [ ] الرتب الخمس بألوان الكرت الصحيحة (INFORMANT بلا تأثير، SOLDIER `#10b981`، CAPO `#3b82f6`، UNDERBOSS `#8b5cf6`، GODFATHER `#f59e0b`) وتاج 👑 وname-glow `#fcd34d` للأب الروحي.
- [ ] التأثيرات config-driven من `RankEffectsDef` (لا تكويد صلب)، مع القيم القديمة كافتراضيات فقط.
- [ ] `orbitRadius` محلول كنسبة من حجم الكرت (قرار الانحراف الواعي موثّق)، والقيم المطلقة مُقاسة بـ `cardScale`.
- [ ] اللوحتان اللونيتان ومجموعتا الشارات مُبقاتان منفصلتين (لا توحيد).

---

## 13. ملاحظات أداء وأمان

- **الأنيميشنات اللانهائية = خطر بطارية/jank** على أندرويد الضعيف: لفّ الكرت بـ `RepaintBoundary`، أوقف الـ Tickers خارج الشاشة (`TickerMode`/`VisibilityDetector`)، احترم `MediaQuery.disableAnimations` (reduce-motion) بعرض النسخة الساكنة، وقدّم خيار `animate:false`. اجمع الجسيمات في `CustomPainter` واحد بدل N عناصر منفصلة إن أمكن.
- **الجسيمات:** ارسمها كـ `CustomPaint` واحد (نقاط ضمن لوحة واحدة) لا N `Widget` — أرخص بكثير مع `count` كبير.
- **cache الـ config:** طابق منطق useGameConfig (TTL 5 دقائق، cache على مستوى الموديول/singleton)، مع إبطال عند إشارة تعديل الأدمن.
- **`refetch on resume` حِمل شبكي:** 7 fetches عند كل عودة — مقبول لكن راقب التكرار السريع (debounce بسيط إن لزم).
- **أمان:** أرقام RR/الإحصائيات للعرض فقط؛ لا منطق قرار عليها. `avatarUrl` مصدر خارجي — استخدم `cached_network_image` مع معالجة أخطاء التحميل (fallback `🎭`) ولا تثق بامتداد/نوع الصورة. لا تسرّب `token` في سجلّات.
- **قصّ الأسماء اليدوي** (16/10/8) قد يقطع منتصف محرف عربي مركّب — استخدم قصّاً آمناً على مستوى الحرف أو `TextOverflow.ellipsis` مع `maxWidth` المطابق (70/80) للحفاظ على البصر دون كسر الترميز.
- **`max-w-[52vw]`** للمنسدلة يمنع كسر الأسماء الطويلة على الهاتف؛ على التابلت حوّله لسقف مطلق (§5).
