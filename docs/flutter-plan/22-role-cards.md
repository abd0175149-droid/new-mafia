# بطاقات الأدوار: الديناميكية وLegacy، الكشف، معرض المافيا، معلومات الأدوار
> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

---

## 1. الهدف والنطاق

هذا الملف يوثّق **نظام بطاقة الهوية/الدور** الشخصية للاعب (بوجهين + قلب 3D)، ومحرّكيه (`DynamicMafiaCard` المقروء من DB و`MafiaCardLegacy` الثابت)، بالإضافة إلى:

1. **`DynamicMafiaCard`** — الكارد الرئيسي المقروء من قوالب DB: gradient / borderColor / glowEffect / teamBadge / icon / secretFace / elements(positions, shapes) + **طبقة Rank Effects** (border متحرك، glow نابض، shimmer، جزيئات orbit/burst، إطارات SVG إجرائية، عنصر طائف، badge). أنيميشن القلب والكشف.
2. **`MafiaCardLegacy`** — محرّك احتياطي بثيمات ثابتة لكل دور، قلب 700ms ثابت، بلا rank effects.
3. **`MafiaCard`** (الغلاف الذكي) + **`SmartMafiaCard`** (re-export).
4. **`MafiaTeamGallery`** — مودال كامل الشاشة يفتحه FAB أحمر «التعرف على المافيا» (معروض لكل لاعب لديه دور). أربع واجهات فرعية: لوحة «رابط الدم» للتوأم، عقود السفّاح، شبكة فريق المافيا، والواجهة التمويهية «ملف استخباراتي». مع **إنذار الليدر الفوري المضاد للغش** عبر `player:mafia-gallery-open`.
5. **`RolesInfoModal`** — موسوعة الأدوار الحيّة من `/api/game-config/roles`.

**خارج النطاق (يُحال):** الشاشات التي تستضيف الكارد أثناء اللعب (عناوين «تم تعيين مهمتك»/«تم إقصاؤك»، بانر `roleAlert`، الاهتزازات) موثّقة في **20-game-state-core.md**؛ استخدام الكارد داخل السينمائيات في **24-morning-cinematics.md**؛ داخل طاولة الحلقة في **27-spectator-gameover.md**؛ الجزء الليدري من إنذار الغش (SweetAlert + إقصاء إداري) في **30-host-console.md**. هذا الملف يوفّر **الويدجت** الذي تستهلكه كل تلك الملفات.

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

- `c:/Projects/new mafia/unified-mafia/frontend/src/components/DynamicMafiaCard.tsx` — الكارد الديناميكي (المرجع الأساسي).
- `c:/Projects/new mafia/unified-mafia/frontend/src/components/MafiaCardLegacy.tsx` — المحرّك الاحتياطي.
- `c:/Projects/new mafia/unified-mafia/frontend/src/components/MafiaCard.tsx` — الغلاف الذكي (`useDynamicEngine=true` افتراضياً).
- `c:/Projects/new mafia/unified-mafia/frontend/src/components/SmartMafiaCard.tsx` — `export { default, type MafiaCardProps } from './MafiaCard'`.
- `c:/Projects/new mafia/unified-mafia/frontend/src/components/RankFrames.tsx` — إطارات SVG الإجرائية الخمسة.
- `c:/Projects/new mafia/unified-mafia/frontend/src/components/RankEffects.css` — كل keyframes الرتب.
- `c:/Projects/new mafia/unified-mafia/frontend/src/components/MafiaTeamGallery.tsx` — المعرض + الواجهات الفرعية.
- `c:/Projects/new mafia/unified-mafia/frontend/src/components/RolesInfoModal.tsx` — موسوعة الأدوار.
- `c:/Projects/new mafia/unified-mafia/frontend/src/hooks/useGameConfig.ts` — جلب/تخزين الـ config + الـ helpers (`getCardForRole`, `getRankEffectsForTier`).
- `c:/Projects/new mafia/unified-mafia/frontend/src/lib/constants.ts` — `Role`, `MAFIA_ROLES`, `NEUTRAL_ROLES`, `isMafiaRole`, `ROLE_NAMES`, `ROLE_ICONS`.
- `c:/Projects/new mafia/unified-mafia/frontend/src/components/PlayerFlow.tsx` (سطور ~3708–3737) — تركيب المعرض والـ FAB وبوابة الحماية.
- `c:/Projects/new mafia/unified-mafia/backend/src/sockets/lobby.socket.ts` (سطور 2080–2143) — معالج `player:mafia-gallery-open` وبثّ `leader:mafia-gallery-alert`.
- `c:/Projects/new mafia/unified-mafia/frontend/src/app/leader/page.tsx` (~1210–1316) — مستهلك الإنذار (مرجع لـ 30-host-console.md).

---

## 3. التبعيات على ملفات الخطة الأخرى

- **01-foundation-theme.md** — الثيم (ذهبي `#C5A059`، أحمر دموي `#8A0303`)، الخطوط (Amiri + JetBrains Mono via google_fonts)، Directionality RTL، **استراتيجية Window Size Classes** المشار إليها في §5.
- **02-models-data-layer.md** — نماذج `RoleDef`/`CardTemplateDef`/`RankEffectsDef`/`AbilityDef` وأنواع التوأم/العقود (تُعرّف هنا في §8 وقد تُرحَّل هناك).
- **03-networking-rest.md** — عميل REST لنقاط `game-config` الأربع.
- **04-socket-layer.md** — إرسال `player:mafia-gallery-open` (خام fire-and-forget) واستقبال `player:role-assigned`/`mafia:team-updated`/`assassin:contracts-update`/`game:started`.
- **05-session-auth.md** — مفاتيح `mafia_mafiaTeam`/`mafia_sibling` في SharedPreferences ودورة حياتها.
- **07-sound-system.md** — صوت `leader_gallery_alert` (جهاز الليدر فقط — يخص تطبيق الليدر).
- **20-game-state-core.md** — يستهلك هذا الكارد ويوفّر `assignedRole`/`cardFlipped`/`isPlayerDead`/`isSilenced`/`gamePhase`/`step` وحالة المعرض `isGalleryOpen` وبانر `roleAlert` (الذي يُمسح عند القلب).
- **21-join-lobby.md** — بطاقة الغطاء (role=null، غير قابلة للقلب) في حالة الانتظار.
- **24-morning-cinematics.md** / **27-spectator-gameover.md** / **30-host-console.md** — مستهلكون آخرون للكارد وللإنذار الليدري.
- **92-qa-parity.md** — checklist التكافؤ (§12) يُغذّيه.

---

## 4. الواجهة والتجربة تفصيلياً

### 4.0 أبعاد الكارد وحالة القلب المشتركة (Dynamic + Legacy)

**الأحجام** (حرفياً من `sizeClasses`):
| الحجم | Tailwind | البكسل المنطقي |
|------|----------|----------------|
| `sm` | `w-44 h-[15rem]` | **176 × 240** |
| `md` | `w-56 h-[20rem]` | **224 × 320** (الافتراضي وقاعدة معايرة الـ positions/shapes) |
| `lg` | `w-64 h-[22rem]` | **256 × 352** |
| `fluid` | `w-full h-full` | 100% × 100% (LayoutBuilder) |

- الحاوية الخارجية: `select-none`، وعند الموت `isAlive===false` → `opacity-30 grayscale pointer-events-none` (أي **30% شفافية + رمادي كامل + تعطيل اللمس**). `perspective: 1000px`.
- الحاوية الداخلية القابلة للقلب: `transform-style: preserve-3d`، `transform: isFlipped ? rotateY(180deg) : rotateY(0deg)`، الانتقال:
  - **Dynamic**: `transition: transform {flipDurationMs}ms cubic-bezier(.2,.7,.2,1)` — الافتراضي **700ms**، وعند كشف الدور في شاشة اللعب **1100ms**. المنحنى في Flutter: `Cubic(0.2, 0.7, 0.2, 1.0)`.
  - **Legacy**: `transition-transform duration-700` ثابت (يتجاهل `flipDurationMs`).
- الوجهان: `backface-visibility: hidden`؛ الوجه الأمامي `transform: translateZ(0)`، الوجه الخلفي مُدار مسبقاً `transform: rotateY(180deg) translateZ(0)`.
- **في Flutter**: `AnimationController` + `Transform(Matrix4.identity()..setEntry(3,2,0.001)..rotateY(angle))`؛ بدّل الوجه عند تجاوز 90° (لا يوجد `backface-visibility`). النقر: `handleCardClick` → لو `!flippable` لا شيء؛ لو `onFlip` مُمرَّر ناديه (controlled)، وإلا بدّل `internalFlip` (uncontrolled). **في كشف الدور القلب أحادي الاتجاه اللاصق** (`onFlip` يضبط `cardFlipped=true` ولا يخفي بضغطة ثانية) — راجع 20-game-state-core.md.

### 4.1 DynamicMafiaCard — الوجه الأمامي (الغطاء السري)

الحاوية: `rounded-2xl` (16px) `overflow-hidden bg-black`. الحد: `2px solid {borderColor}` — و`borderColor` نفسه = `cardTemplate.borderColor || 'rgba(197,160,89,0.55)'` (ذهبي)؛ ولو كان فارغاً يقع على `isFemale ? 'rgba(168,85,247,0.4)' (بنفسجي) : 'rgba(197,160,89,0.4)' (ذهبي)`. عند `isSilenced` أضِف حلقة `ring-2 ring-rose-600/60`.

**القسم العلوي (ارتفاع 66.66%)** — صورة اللاعب:
- خلفية z-1: لو `resolvedAvatarUrl` → `<img object-cover opacity:0.8>`؛ وإلا placeholder جنس `/avatars/female.png` أو `/avatars/male.png` بـ `object-cover opacity:0.7`. إزاحة اختيارية `positions.coverPhoto` (`translate(x,y) scale(s)`).
- z-2: تلاشٍ أسود سفلي `absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black to-transparent`.
- badge الإسكات (لو `isSilenced`) z-20: pill `top-3 left-1/2 -translate-x-1/2 bg-rose-900/80 border border-rose-500/40 px-2 py-0.5 rounded-full`، نص **«🔇 مُسكَت»** `text-[10px] text-rose-300 font-bold`.

**رقم اللاعب الكبير** — طبقة مستقلة `absolute top:0 left:0 right:0 height:66.66% z-15 pointer-events-none flex items-center justify-center`:
- اللون: `rgba(197,160,89,1)` ذهبي (ذكر) / `rgba(216,180,254,1)` بنفسجي فاتح (أنثى). `font-mono font-black`.
- الأرقام **≥ 10** تُرسم مكدّسة عمودياً: `Column` بـ `<span>` لكل رقم، `lineHeight: 0.85`، `fontSize`: sm `3.2rem` / md `4.5rem` / lg `5.5rem` / fluid `4.5rem`.
- الأرقام المفردة: `fontSize` sm `4rem` / md `5.5rem` / lg `7rem` / fluid `5.5rem`، `lineHeight: 1`.
- `opacity`: **0.9 مع أفاتار** / **0.55 بدونه**. `textShadow`: مع أفاتار `0 2px 10px rgba(0,0,0,0.9)`؛ بدونه `0 2px 12px rgba(0,0,0,0.95), 0 0 30px rgba(197,160,89,0.15)`. إزاحة `positions.coverNumber`.

**القسم السفلي (ارتفاع 33.33%)** — شريط أسود `bg-black px-3 z-5`:
- خط فاصل علوي: `absolute top-0 left-[15%] right-[15%] h-[1px]`، اللون `rgba(197,160,89,0.3)` (ذكر) / `rgba(192,132,252,0.3)` (أنثى).
- **الوضع العادي** (`showVoting=false`):
  - الاسم `<h2>`: `Amiri, serif`، `text-white font-black text-center leading-tight`، الأحجام `nameSize` = sm `text-base` / md `text-xl` / lg `text-2xl` / fluid `text-xl md:text-2xl lg:text-3xl`. **قص الاسم**: لو الطول > `nameMaxLen` (sm 10 / md 14 / lg 18 / fluid 14) → `slice(0, nameMaxLen) + '…'`. لو `tier === 'GODFATHER'` أضِف صنف `.rank-name-glow` (اللون `#fcd34d !important`، `text-shadow: 0 0 8px rgba(245,158,11,0.4), 0 0 20px rgba(245,158,11,0.15)`). إزاحة `positions.coverName`.
  - **«MAFIA CLUB»**: `text-[8px] font-mono tracking-[0.25em] uppercase mt-1`، اللون `rgba(197,160,89,0.4)` (ذكر) / `rgba(192,132,252,0.4)` (أنثى). إزاحة `positions.coverBranding`.
  - لو `flippable`: تلميح **«اضغط للكشف»** `text-[10px] text-zinc-500 mt-1`. إزاحة `positions.coverFooter`.
- **وضع التصويت** (`showVoting=true`): الشريط كله زر (`onClick=handleVoteClick` مع `stopPropagation` كي لا يقلب الكارد):
  - خلفية نابضة لو `votes > 0`: `absolute inset-0 bg-red-900/15 animate-pulse rounded-b-xl`.
  - صف `flex gap-2 z-10`: الاسم (كأعلاه، مع دعم `nameEffect`: لو `fx.nameEffect.enabled` → `color: nameEffect.color`, `textShadow: 0 0 {glowSize}px {glowColor@0.4}, 0 0 {glowSize*2.5}px {glowColor@0.15}`) + عدّاد الأصوات `<span font-mono font-black>` بأحجام sm `text-3xl` / md `text-4xl` / lg `text-5xl` / fluid `text-4xl`؛ اللون لو `votes>0` → `text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.6)]` وإلا `text-zinc-600 hover:text-zinc-400`. إزاحة `positions.coverName` على الصف.
  - «MAFIA CLUB» أسفله (كأعلاه). إزاحة `positions.coverBranding`.

**أشكال الغطاء** (`elements.shapes` بـ `face==='cover'`): لكل شكل `absolute pointer-events-none`، `width:s.w height:s.h backgroundColor:s.bg opacity:s.opacity zIndex:(s.zIndex||3) borderRadius:s.radius`، مركزته `top:50% left:50% marginTop:-s.h/2 marginLeft:-s.w/2` ثم `transform: translate(s.x||0, s.y||0)`.

### 4.2 DynamicMafiaCard — طبقة Rank Effects (تُرسم فقط عند `hasRankEffects`)

`hasRankEffects` = صحيح لو أيٌّ من `border/glow/shimmer/particles/frame/floating/badge` مفعّل. الطبقة: `absolute inset-0 rounded-2xl overflow-visible`، `transform: translateZ(1px)`، `zIndex: 60`، `pointer-events-none` (إلا لو `rankEditable`). مصدر `fx` = `rankEffectsOverride || getRankEffectsForTier(tier).effects`؛ `tier` افتراضي `'INFORMANT'`. **ملاحظة**: `corners` موجود في المخطط لكن **لا يُرسَم** في المحرّك الديناميكي (تراث CSS لـ CAPO فقط) — تجاهله في Flutter.

- **Border** (`fx.border.enabled`): div `inset:{fx.border.inset}px borderRadius:1rem z-50`.
  - `style==='solid'`: `border: {width}px solid {color@0.5}`. لو `glow.pulseEnabled` → `animation: rank-pulse {glow.pulseDuration}s ease-in-out infinite` مع `--rank-glow: 0 0 {glow.size}px {glow.color@glow.opacity}` و`--rank-glow-strong: 0 0 {glow.size*1.6}px {glow.color@min(1, glow.opacity*1.5)}`.
  - `style==='gradient'|'traveling'`: `padding:{width}px`، `background: linear-gradient(135deg, {gradientColors.join(', ')})`؛ لو `traveling` → `backgroundSize: 200% 200%` + `animation: border-travel {travelSpeed}s linear infinite` (+ `rank-pulse` لو مفعّل)؛ قناع XOR: `mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); maskComposite: exclude`. في Flutter استخدم `CustomPainter` يرسم `RRect` مفرَّغاً بـ `SweepGradient`/`LinearGradient` متحرك (لا حاجة لحيلة القناع).
  - `boxShadow` لو `glow.enabled`: `0 0 {glow.size}px {glow.color@glow.opacity}`.
  - **keyframes** (من RankEffects.css): `rank-pulse { 0%,100%{box-shadow: var(--rank-glow)} 50%{box-shadow: var(--rank-glow-strong)} }`؛ `border-travel { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }`.
- **Badge** (`fx.badge.enabled`): `absolute top:{4+offsetY} left:{4+offsetX} z-55 flex items-center gap-2 padding:2px 5px borderRadius:6 fontSize:10 fontWeight:700 fontFamily:'Inter, sans-serif' letterSpacing:0.05em backdropFilter:blur(4px)`، `background:{bgColor} color:{textColor} border:1px solid {borderColor}`، `transform: scale({scale||1}) transformOrigin: top left`. المحتوى: `<span>{emoji}</span><span>{label}</span>`.
- **SVG Frame** (`fx.frame.enabled && fx.frame.type!=='none'`): مكوّن `RankFrame` (z-51). الأنواع وقيمها الهندسية الحرفية (للنقل كـ `CustomPainter`):
  - **`simple`**: أربعة أقواس زاوية 18×18 على بُعد 6px من الحافة، path لكل زاوية (tl: `M0,18 L0,0 L18,0`، tr: `M0,0 L18,0 L18,18`، bl: `M0,0 L0,18 L18,18`، br: `M0,18 L18,18 L18,0`)، `strokeWidth = max(1, strokeWidth)`، `linecap/linejoin: round`.
  - **`greek`**: مستطيل خارجي `inset:5` بحد `strokeWidth*0.5`؛ شريطا meander علوي/سفلي (نمط SVG `pattern` وحدة `u=8`، path `M0,8 L0,0 L16,0 L16,4 L4,4 L8,4 L8,8`، سماكة `max(0.8, strokeWidth*0.7)`)، السفلي `scaleY(-1)`؛ أربع زخارف زوايا (مربعان متداخلان 12×12 و6×6). أنيميشن `greek-scroll 6s linear infinite` (`0%{translateX(0)} 100%{translateX(10px)}`) لو `animate`.
  - **`islamic`**: حد خارجي **dashed** `inset:4` بـ `strokeWidth`؛ نجوم ثمانية الرؤوس في الزوايا (`starR=8`) وأواسط الحواف (`smallR=4`) — مسار النجمة: 16 نقطة، `angle = i*π/8 − π/16`، `rad = i%2===0 ? r : r*0.38`؛ خطوط وصل بين النجوم بلون `color@opacity*0.3`. أنيميشن الزوايا `frame-spin 20s linear infinite` لو `animate`.
  - **`deco`**: إطار مزدوج (`inset:3` و`inset:6`)؛ مروحتان علوية/سفلية (5 خطوط، زوايا `−50 + i*25` درجة، طول 12)، السفلية `scaleY(-1)`؛ زوايا مدرّجة (path `M0,16 L0,8 L4,8 L4,4 L8,4 L8,0 L16,0` معكوس حسب الزاوية)؛ نقطتا جانب. أنيميشن `deco-pulse 3s ease-in-out infinite` (السفلية بتأخير 1.5s) — `deco-pulse { 0%,100%{opacity:0.7; scale(1)} 50%{opacity:1; scale(1.05)} }`.
  - **`royal`**: إطار مزدوج (`inset:3` و`inset:7`)؛ زهرة فلور-دو-ليس علوية (bezier `M12,13 C12,6 10,3 7,1 C10,3 12,1 12,1 C12,1 14,3 17,1 C14,3 12,6 12,13Z`) وسفلية؛ ميداليات زوايا (دائرتان 4r و1.5r)؛ خطوط dashed جانبية بلون `color@opacity*0.3`. أنيميشن `deco-pulse 4s` (السفلية بتأخير 2s).
- **Gradient overlay** (`fx.gradientOverlay.enabled`): `absolute inset-0 rounded z-49 background: linear-gradient({direction}, {color@opacity}, transparent 50%)`.
- **Shimmer** (`fx.shimmer.enabled`): حاوية `absolute inset-0 rounded overflow-hidden z-52`؛ داخلها شريط `top:-50% left:-50% width:40% height:200% background: linear-gradient(90deg, transparent, {color@opacity}, rgba(255,255,255,0.04), transparent) transform: rotate(25deg) animation: rank-shimmer {duration}s ease-in-out infinite`. keyframe: `rank-shimmer { 0%{translateX(-100%) rotate(25deg)} 100%{translateX(200%) rotate(25deg)} }`. في Flutter: `ShaderMask`/`shimmer`.
- **Particles** (`fx.particles.enabled`): `count` نقاط، كل واحدة `absolute width/height:{size} background:{color@0.8} borderRadius:50% top:{originY??50}% left:{originX??50}% z-53 boxShadow:0 0 {size*2}px {color@0.4}`:
  - `animationType==='burst'`: `animation: particle-burst-{i%8} {baseDuration + i*0.3}s ease-out infinite`، `animationDelay: {i*(baseDuration/count)}s`. جداول burst الثمانية المسبقة (متجهات النهاية بالبكسل، للنقل حرفياً):
    - `-0`: 80%→(80,−60) 100%→(96,−72) · `-1`: (−70,−50)/(−84,−60) · `-2`: (60,70)/(72,84) · `-3`: (−80,40)/(−96,48) · `-4`: (20,−80)/(24,−96) · `-5`: (−30,75)/(−36,90) · `-6`: (75,30)/(90,36) · `-7`: (−50,−70)/(−60,−84). (كل واحد: `0%,10%{opacity:1; scale(1)}` ثم `80%{opacity:.5; scale(.5)}` ثم `100%{opacity:0; scale(0)}`.)
  - `orbit` (الافتراضي): `--orbit-radius:{orbitRadius}` (نص مثل `52%`)، `--duration:{baseDuration + i*0.8}s`، `--delay:{i*0.7}s`، `animation: particle-orbit var(--duration) linear infinite`. keyframe: `particle-orbit { 0%{rotate(0) translateX(var(--orbit-radius)) rotate(0); opacity:0} 20%{opacity:1} 80%{opacity:1} 100%{rotate(360deg) translateX(var(--orbit-radius)) rotate(-360deg); opacity:0} }`.
- **Floating** (`fx.floating.enabled`): `absolute top:{offsetY ?? (position==='top' ? -14 : undefined)} bottom:{(offsetY===undefined && position==='bottom') ? -14 : undefined} left: calc(50% + {offsetX||0}px) transform: translateX(-50%) scale({scale||1}) fontSize:{size} z-55 lineHeight:1`، `animation`: `float`→`crown-float 2.5s` / `spin`→`particle-orbit 4s` / `bounce`→`crown-float 1.5s` (`none` لو `rankEditable`)، `filter: drop-shadow(0 0 6px {glowColor@0.6})`. keyframe: `crown-float { 0%,100%{translateY(0) translateX(-50%)} 50%{translateY(-3px) translateX(-50%)} }`. المحتوى `fx.floating.content` (إيموجي/نص).

**مستويات الرتب** (INFORMANT → SOLDIER → CAPO → UNDERBOSS → GODFATHER؛ ألوان تراثية emerald `#10b981` / blue `#3b82f6` / violet `#8b5cf6` / amber `#f59e0b`) — كلها تُقرأ من DB عبر `getRankEffectsForTier(tier)`؛ لا تُخبز الألوان في Flutter، اقرأها من الحمولة. `rankEffectsOverride` للمعاينة الحية في محرّر الأدمن (غير مطلوب في تطبيق اللاعب)؛ `rankEditable` (سحب) غير مطلوب في تطبيق اللاعب.

### 4.3 DynamicMafiaCard — الوجه الخلفي (كشف الدور)

الحاوية: `rounded-2xl overflow-hidden bg-black`، `border: 2px solid {borderColor}`، `boxShadow: {glowEffect || 'none'}`، `transform: rotateY(180deg) translateZ(0)`.

- **حالة الصورة الكاملة**: لو `cardTemplate.secretFace.customImageUrl` موجود → **الوجه كله صورة واحدة** `<img object-cover>` (بادئة `SOCKET_URL` للروابط النسبية) **بلا أي عنصر ديناميكي آخر**.
- **التصميم الديناميكي** (خلاف ذلك):
  - خلفية: `background: {gradient}` (fallback `linear-gradient(to bottom, #3f3f46, #18181b)`) + لمعان قطري `linear-gradient(to top right, transparent, rgba(255,255,255,0.03), transparent)`.
  - **شارة الفريق** (تُخفى لو `teamBadge.visible===false`): `absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1 font-mono tracking-widest whitespace-nowrap`، `fontSize:{teamBadge.fontSize||10}px borderRadius:{teamBadge.borderRadius||9999px}`، الألوان من القالب أو الافتراضيات حسب الفريق:
    | الفريق | النص الافتراضي | bg | text | border |
    |--------|----------------|----|----|--------|
    | مافيا | `فريق المافيا 🔴` | `rgba(127,29,29,0.6)` | `#fca5a5` | `rgba(239,68,68,0.3)` |
    | محايد | `محايد ⚪` | `rgba(120,53,15,0.6)` | `#fcd34d` | `rgba(245,158,11,0.3)` |
    | مواطن | `فريق المدينة 🔵` | `rgba(30,58,138,0.6)` | `#93c5fd` | `rgba(59,130,246,0.3)` |
    (القالب قد يوفّر `mafiaText/neutralText/citizenText` منفصلة.) إزاحة `positions.badge` (`translate(calc(-50% + x), y) scale(s)`).
  - **عمود المحتوى** `dir="rtl" flex-col items-center justify-center h-full p-4 pt-12 z-10 text-align:center`:
    - **chip الرقم** (يُخفى لو `hideIdentity`): `absolute top-3 right-3 w-8 h-8 font-mono text-sm font-bold rounded-md bg-black/40`، `border: 1px solid {borderColor}`، `color:{textColor}`. إزاحة `positions.number`.
    - **دائرة الأيقونة** `w-24 h-24` (96px) `rounded-full flex items-center justify-center mb-5`، `border: 2px solid {borderColor} color:{textColor} background: rgba(0,0,0,0.4) backdropFilter: blur(12px) boxShadow: inset 0 0 20px rgba(0,0,0,0.3)`. إزاحة `positions.icon`. المحتوى بترتيب الأولوية:
      1. `iconImageUrl` → `<img w-full h-full object-cover rounded-full>`.
      2. `iconEmoji` → `<span fontSize={iconSize}>` (iconSize sm 32 / md 44 / lg 52 / fluid 48).
      3. `RoleIcon` (Lucide) → `size={iconSize} strokeWidth={1.5}`.
    - **اسم الدور** `<h3>`: `roleNameSize` = sm `text-lg` / md `text-2xl` / lg `text-3xl` / fluid `text-2xl md:text-3xl lg:text-4xl`، `font-black mb-2 fontFamily:'Amiri, serif' color:{textColor}`. القيمة `getRoleName(role)` (fallback `'مجهول'` لو null). إزاحة `positions.title`.
    - **اسم اللاعب** (يُخفى لو `hideIdentity` أو `elements.showPlayerNumber===false`): `text-white/50 text-sm max-w-[85%] truncate mx-auto dir="auto" fontFamily:'Amiri, serif'`. إزاحة `positions.playerName`.
    - **الخط الفاصل** `w-20 h-[1px] my-4 backgroundColor:{borderColor}` (80px × 1px).
    - **التذييل** `mt-auto`: لو `elements.customFooterText` → `text-[9px] text-zinc-500 font-mono` (fontFamily `elements.fontFamily||'Amiri, serif'`)؛ وإلا لو `flippable` → **«اضغط للإخفاء»** `text-[10px] text-zinc-500`. إزاحة `positions.footer`.
  - **أشكال وجه الدور** (`elements.shapes` بـ `face==='role'`، تُرسم أخيراً فوق الكل): `absolute pointer-events-none width/height/bg/opacity/zIndex/radius`، مركزة `top:50% left:50% marginTop:-h/2 marginLeft:-w/2`. **تحذير دقيق**: أشكال وجه الدور **لا تطبّق `translate(x,y)`** (بخلاف أشكال الغطاء) — تبقى مركزة فقط. انقل هذا الفرق حرفياً.

**قاموس أيقونات Lucide** المتاح: `User, HeartPulse, Shield, Syringe, Crosshair, BadgeAlert, Skull, Crown, Drama, Scissors, Flame, Ghost, Eye, Zap, Sword, Heart, Landmark` (أي اسم غير معروف → `User`).

**دقّة اختيار الأيقونة** (`iconConfig = roleDef.cardOverrides?.icon || cardTemplate?.icon`):
- `type==='lucide'` → `getLucideIcon(value)`.
- `type==='emoji'` → `iconEmoji = value`.
- `type==='image' | 'IMAGE'` → `imgVal = value || url`؛ `iconImageUrl = imgVal.startsWith('http') ? imgVal : (imgVal ? SOCKET_URL+imgVal : null)`.
- **لا `iconConfig`** → خريطة كلاسيكية: `{ GODFATHER:Crown, SILENCER:Scissors, CHAMELEON:Drama, MAFIA_REGULAR:Skull, SHERIFF:Shield, DOCTOR:HeartPulse, SNIPER:Crosshair, POLICEWOMAN:BadgeAlert, NURSE:Syringe, MAYOR:Landmark, CITIZEN:User }`؛ الباقي → `User`.

**تحديد الفريق للألوان**: `isMafia = roleDef ? roleDef.team==='MAFIA' : isMafiaRole(role)`؛ `isNeutral = roleDef ? roleDef.team==='NEUTRAL' : false`.

### 4.4 MafiaCardLegacy — المحرّك الاحتياطي

بنية/قلب/أحجام مطابقة لكن **بلا** rank effects/shapes/صور مخصصة/hideIdentity (البروب مقبول لكن غير مستعمل)، والقلب `duration-700` ثابت.

**الوجه الأمامي — فروق**:
- الحد: `border-2` بلون `isFemale ? 'border-purple-500/40' : 'border-[#C5A059]/40'` (+ `border-rose-600/60` لو مُسكَت).
- **مع أفاتار**: الرقم chip عائمة `absolute top-[15%] right-3 z-10`، مربّع `54/66/78/66px` (sm/md/lg/fluid)، `fontSize 1.9/2.25/3/2.25rem`، `font-mono font-black rounded-xl`، `backgroundColor: rgba(0,0,0,0.45) backdropFilter: blur(4px)`، النص/الحد ذهبي `text-[#C5A059]` + `1px solid rgba(197,160,89,0.3)` (ذكر) / بنفسجي `text-purple-200` + `1px solid rgba(168,85,247,0.3)` (أنثى).
- **بدون أفاتار**: خلفية تدرّج جنس (`isFemale ? 'from-purple-900/60 via-purple-950/80 to-black' : 'from-zinc-700/50 via-zinc-900/80 to-black'`)؛ الرقم كبير موسّط `opacity:0.35 fontSize 4/5.5/7/5.5rem textShadow:'0 4px 20px rgba(0,0,0,0.8)' letterSpacing:'-0.02em'`.
- الاسم/الشعار/التلميح كما في Dynamic لكن الألوان الثانوية ذهبي `#C5A059` أو بنفسجي حسب الجنس.

**الوجه الخلفي — جدول الثيمات الثابت** (Tailwind gradient/border/text/glow/Icon/teamBadge/teamColor):
| الدور | gradient | border | text | glow (box-shadow) | Icon | teamBadge | teamColor |
|------|----------|--------|------|-------------------|------|-----------|-----------|
| CITIZEN | zinc-700→800→900 | zinc-500/60 | zinc-300 | `0 0 30px rgba(161,161,170,0.15)` | User | فريق المدينة 🔵 | blue-900/60·blue-300·blue-500/30 |
| DOCTOR | emerald-800→900→green-950 | emerald-500/60 | emerald-300 | `0 0 30px rgba(52,211,153,0.2)` | HeartPulse | 🔵 | blue |
| SHERIFF | blue-800→900→950 | blue-500/60 | blue-300 | `0 0 30px rgba(96,165,250,0.2)` | Shield | 🔵 | blue |
| NURSE | teal-800→900→950 | teal-500/60 | teal-300 | `0 0 30px rgba(94,234,212,0.2)` | Syringe | 🔵 | blue |
| SNIPER | cyan-800→900→950 | cyan-500/60 | cyan-300 | `0 0 30px rgba(103,232,249,0.2)` | Crosshair | 🔵 | blue |
| POLICEWOMAN | indigo-800→900→950 | indigo-500/60 | indigo-300 | `0 0 30px rgba(129,140,248,0.2)` | BadgeAlert | 🔵 | blue |
| MAYOR | yellow-800→amber-900→stone-950 | yellow-500/60 | yellow-200 | `0 0 30px rgba(234,179,8,0.22)` | Landmark | 🔵 | blue |
| MAFIA_REGULAR | red-800→900→950 | red-500/60 | red-300 | `0 0 30px rgba(248,113,113,0.25)` | Skull | فريق المافيا 🔴 | red-900/60·red-300·red-500/30 |
| GODFATHER | amber-800→amber-900→yellow-950 | amber-400/60 | amber-300 | `0 0 40px rgba(251,191,36,0.25)` | Crown | 🔴 | red |
| CHAMELEON | fuchsia-800→900→950 | fuchsia-500/60 | fuchsia-300 | `0 0 30px rgba(232,121,249,0.2)` | Drama | 🔴 | red |
| SILENCER | rose-800→900→950 | rose-500/60 | rose-300 | `0 0 30px rgba(251,113,133,0.2)` | Scissors | 🔴 | red |
| default | zinc-700→800→900 | zinc-500/40 | zinc-400 | `''` | User | **غير معروف** | zinc-800·zinc-400·zinc-600/30 |

- الأدوار **WITCH / OLDER_BROTHER / YOUNGER_BROTHER / JESTER / ASSASSIN** تسقط على ثيم `default` في Legacy (المحرّك الديناميكي وحده يملك كروتاً حقيقية لها).
- دائرة الأيقونة: `boxShadow` = مافيا `0 0 40px rgba(220,38,38,0.15), inset 0 0 20px rgba(0,0,0,0.3)` / مدينة `0 0 40px rgba(100,200,255,0.1), inset 0 0 20px rgba(0,0,0,0.3)`.
- الخط الفاصل: `bg-red-500/30` (مافيا) / `bg-blue-500/30` (مدينة).
- التذييل: **«اضغط للإخفاء»** `text-[9px] text-zinc-600 font-mono tracking-widest uppercase mt-auto dir="ltr"`.
- اسم الدور: `role ? ROLE_NAMES[role] || role : 'مجهول'`.

**قرار Flutter**: انقل `DynamicMafiaCard` فقط كمحرّك واحد، واخبز جدول Legacy أعلاه كمجموعة قوالب افتراضية «في-الذاكرة» للعرض الأول قبل وصول الـ config (لا حاجة لمحرّك Legacy منفصل).

### 4.5 MafiaTeamGallery — المعرض

الحاوية: `AnimatePresence` + `fixed inset-0 z-[100] flex items-center justify-center isolate`.
- **الخلفية**: `motion.div` fade (opacity 0→1، exit 0)، `absolute inset-0 bg-black/80 backdrop-blur-md`، النقر عليها يغلق.
- **المحتوى**: `motion.div` دخول/خروج `{opacity:0, scale:0.95, y:20} → {1,1,0}`، `relative w-full max-w-sm mx-auto flex flex-col items-center justify-center p-4 max-h-[90dvh] overflow-y-auto overscroll-contain`.
- **زر الإغلاق** (مثبّت viewport): `fixed top-3 right-3 w-11 h-11` (44px) `flex center bg-[#1a0505] border border-[#8A0303]/50 rounded-full text-[#8A0303] hover:bg-[#8A0303] hover:text-white z-20`، أيقونة `X size 24`.
- **قفل تمرير الـ body**: `document.body.style.overflow='hidden'` عند الفتح، `'unset'` عند الإغلاق/التنظيف (تلقائي في Flutter).

**ترتيب الرسم** (اللوحة والواجهة المختارة):

**(1) لوحة «رابط الدم»** (لو `sibling` غير null، تُرسم فوق أياً كانت الواجهة التالية): `motion.div {opacity:0, y:-10}→{1,0}`، `w-full mb-5 rounded-2xl border border-purple-500/40 bg-gradient-to-b from-[#1a0820] to-[#0d0212] p-4 shadow-[0_0_20px_rgba(124,58,237,0.25)]`.
- رأس `flex center gap-2 mb-3`: `🩸` (`text-lg`) + `<h3>` **«رابط الدم»** `text-base font-bold text-purple-300 tracking-wide Amiri`.
- صف `flex items-center gap-3`: أفاتار 64px (`w-16 h-16 rounded-full object-cover border-2 border-purple-500/60`؛ لو `!isAlive` → `grayscale opacity-60`) أو دائرة `bg-[#0d0212] border-2 border-purple-500/60 text-2xl` بأيقونة `getRoleIcon(sibling.role)`. شارة المقعد: `absolute -top-1 -right-1 w-6 h-6 rounded-full bg-purple-600` + `<span text-white text-[10px] font-black font-mono>{physicalId}`.
- معلومات `flex-1 min-w-0 text-right dir="rtl"`: الاسم `text-white text-sm font-bold truncate`؛ chip الدور `inline-block text-purple-300 text-[11px] font-mono mt-0.5 px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30` = `getRoleName(role)` + (لو ميت ` (متوفّى)`).
- الشرح `text-purple-200/70 text-[11px] leading-relaxed mt-3 text-center dir="rtl"`:
  - لو `recipientIsMafia===true`: **«هذا أخوك الأصغر (مواطن) — لا يعرفه باقي المافيا. إن قُتل، تنتحر حزناً عليه.»**
  - وإلا: **«هذا أخوك الأكبر (من المافيا) — يربطكما رابط الدم. إن قُتل، تنهض وتنضمّ إلى المافيا.»**

**(2) واجهة السفّاح** (لو `isAssassin && assassinContracts`):
- رأس `mb-6 flex-col items-center`: دائرة `w-12 h-12 rounded-full bg-[#1a0505] border border-[#8A0303] mb-2 shadow-[0_0_15px_rgba(138,3,3,0.5)]` بأيقونة `Target size 24 text-[#8A0303]`؛ `<h2>` **«عقود الاغتيال»** `text-xl font-bold text-red-500 tracking-widest`؛ `<p>` **«{completedCount}/{totalRequired} عقود مُنجزة»** `text-red-500/60 text-xs mt-1 font-mono`.
- شريط التقدّم: `w-full max-w-sm mb-5 px-2`؛ مسار `h-2 bg-[#1a0505] rounded-full overflow-hidden border border-[#8A0303]/20`؛ تعبئة `motion.div` من `width:0` إلى `{(completedCount/totalRequired)*100}%` بـ `transition {duration:0.8, ease:'easeOut'}`، `background: linear-gradient(90deg, #8A0303, #dc2626)`.
- قائمة العقود: `w-full max-w-sm space-y-3 max-h-[50vh] overflow-y-auto px-2 pb-4`. كل عقد `motion.div key={id} {opacity:0, x:-20}→{1,0} transition delay={i*0.1}`، `rounded-2xl p-4 border-2`:
  - **منجز** (`completed`): `border-green-500/30 bg-gradient-to-r from-green-950/30 to-green-950/10`؛ دائرة `w-10 h-10 rounded-full bg-green-500/20 border border-green-500/50 text-green-400 font-black text-sm` بـ `✅`؛ الوصف `text-sm font-bold text-green-400 line-through` = `descriptionAr || description`؛ لو `completedAtRound` → `<p text-[10px] text-green-500/60 font-mono mt-0.5>` **«أُنجز في الجولة {completedAtRound}»**.
  - **نشط** (`!completed`): `border-[#8A0303]/60 bg-gradient-to-r from-[#1a0505] to-[#0d0202] shadow-[0_0_20px_rgba(138,3,3,0.3)]`؛ دائرة `bg-[#8A0303]/20 border-2 border-[#8A0303] text-red-400` بـ `🔪` نابض (`motion.span animate scale [1,1.2,1] duration 1.5 repeat Infinity`)؛ الوصف `text-white font-bold`؛ تلميح `<p text-[10px] text-red-400/60 font-mono mt-0.5 animate-pulse>` **«اقتل صاحب هذا الدور!»**؛ شريط نشاط `motion.div absolute -right-1 top-1/2 -translate-y-1/2 w-1.5 h-8 rounded-full bg #8A0303 animate opacity [0.5,1,0.5] duration 1.5 repeat Infinity`.

**(3) واجهة فريق المافيا** (لو ليس سفّاحاً و`team.length > 0`):
- رأس `mb-4 flex-col items-center`: دائرة `w-14 h-14 rounded-full bg-[#1a0505] border border-[#8A0303] mb-2 shadow-[0_0_20px_rgba(138,3,3,0.5)]` بأيقونة `Users size 28 text-[#8A0303]`؛ `<h2>` **«شركاؤك»** `text-xl font-bold text-red-500 tracking-widest Amiri`؛ `<p>` **«{team.length} في الفريق»** `text-red-500/40 text-[10px] mt-1 font-mono tracking-widest uppercase`.
- الشبكة: `w-full grid grid-cols-2 gap-2.5 px-1` (**عمودان** — رغم أن تعليق الكود يقول 3، الكود `grid-cols-2`). كل عضو `motion.div key={physicalId} {opacity:0, scale:0.8}→{1,1} transition {delay:i*0.07, type:'spring', stiffness:300, damping:25}`، `flex-col items-center gap-2 py-4 px-2 rounded-2xl border border-[#8A0303]/30 bg-gradient-to-b from-[#1a0808] to-[#0a0101] shadow-[0_0_12px_rgba(138,3,3,0.15)]`:
  - أفاتار 72px: `<img width=72 height=72 loading="lazy" decoding="async" class="w-[72px] h-[72px] rounded-full object-cover border-2 border-[#8A0303]/60 shadow-[0_0_10px_rgba(138,3,3,0.3)]">` أو دائرة `bg-[#0d0202] border-2 border-[#8A0303]/60 text-3xl` بـ `getRoleIcon(role)`. شارة المقعد `absolute -top-1 -right-1 w-7 h-7 rounded-full bg-[#8A0303]` + `<span text-white text-[11px] font-black font-mono>{physicalId}`.
  - الاسم `text-white text-xs font-bold text-center leading-tight truncate w-full mt-1 dir="rtl"`.
  - chip الدور `text-red-400/80 text-[10px] text-center leading-tight px-2 py-0.5 rounded-full bg-[#8A0303]/10 border border-[#8A0303]/20 max-w-full truncate` = `getRoleName(role)`.

**(4) الواجهة التمويهية** (ليس سفّاحاً و`team.length===0`):
- رأس `mb-5 flex-col items-center`: دائرة `w-12 h-12 ... shadow-[0_0_15px_rgba(138,3,3,0.5)]` بأيقونة `Shield size 24 text-[#8A0303]`؛ `<h2>` **«ملف استخباراتي»** `text-xl font-bold text-red-500 tracking-widest Amiri`؛ `<p>` **«INTELLIGENCE BRIEFING»** `text-red-500/40 text-[10px] mt-1 font-mono tracking-widest uppercase`.
- 4 نصائح `w-full space-y-3 px-2`، كل واحدة `motion.div {opacity:0, x:-10}→{1,0} transition delay={i*0.08}`، `flex items-start gap-3 p-3 rounded-xl border border-[#8A0303]/20 bg-gradient-to-r from-[#1a0505]/80 to-[#0d0202]/50`؛ صندوق أيقونة `w-9 h-9 rounded-lg bg-[#8A0303]/10 border border-[#8A0303]/30 flex center shrink-0` (lucide `size 18 text-red-400`)؛ نص `text-white text-xs font-bold dir="rtl"` + سطر فرعي `text-red-500/40 text-[10px] mt-0.5 font-mono dir="rtl"`. المحتوى الحرفي بالترتيب:
  1. `Eye` — **«راقب ردود فعل اللاعبين أثناء النقاش»** / **«التوتر المفاجئ قد يكشف المافيا»**
  2. `MessageCircle` — **«انتبه لمن يُوجّه الاتهامات بدون دليل»** / **«المافيا تحاول تشتيت الانتباه»**
  3. `Vote` — **«صوّت بحكمة بناءً على الملاحظات»** / **«لا تتبع القطيع — فكّر بنفسك»**
  4. `Shield` — **«لا تكشف دورك حتى لو ضُغط عليك»** / **«الصمت أحياناً أقوى سلاح»**

`getRoleIcon(role)` = `ROLE_ICONS[role] || '🎭'`؛ `getRoleName(role)` = `ROLE_NAMES[role] || role` (من constants).

### 4.6 FAB «التعرف على المافيا» + ترتيب الغش (المسؤولية العميلية)

- **الزر**: يُرسَم فقط عند `assignedRole !== null && gamePhase !== 'GAME_OVER' && (step==='done' || step==='rejoined')`. `fixed bottom-[110px] left-4 z-[90] bg-[#8A0303]/90 hover:bg-[#8A0303] text-white border border-red-500/50 p-3 rounded-full shadow-[0_0_15px_rgba(138,3,3,0.5)] hover:scale-110 backdrop-blur-sm`، أيقونة `Users w-6 h-6`، `title="التعرف على المافيا"`.
- **ترتيب النقر (حرج أمنياً — لا تغيّره)**:
  1. **دائماً** أرسل `player:mafia-gallery-open { roomId }` عبر socket خام fire-and-forget (`import('@/lib/socket').then(m => m.getSocket().emit(...)).catch(()=>{})`) — **قبل** أي فحص.
  2. لو `isPlayerDead` → **return** (المودال لا يُفتح، لكن السيرفر ينبّه الليدر بمحاولة اللاعب المُقصى).
  3. `setIsGalleryOpen(true)`.
- **بوابة الحماية الدفاعية عند تركيب المودال** (PlayerFlow 3712–3717): `team` و`sibling` يُصفَّران ما لم يكن `assignedRole` عضواً حالياً في `MAFIA_ROLES = [GODFATHER, SILENCER, CHAMELEON, WITCH, OLDER_BROTHER, MAFIA_REGULAR]` — يمنع تسرّب فريق محفوظ من جيم سابق للأخ الأصغر/المواطن. `isAssassin = assignedRole === 'ASSASSIN'`. بعد تحوّل الأخ الأصغر يصبح دوره مافياوياً فتظهر القائمة طبيعياً.
- **جانب الليدر** (مرجع 30-host-console.md): طابور SweetAlert بإزالة تكرار حسب `physicalId`، عدّاد حي «تنبيه {pos} من {total}»، عنوان `🕵️ فتح قائمة التعرف على المافيا` أو `⚠️ محاولة من لاعب مُقصى`، chip الفريق (MAFIA `#dc2626` / NEUTRAL `#7c3aed` / CITIZEN `#059669`)، بانر `🚫 لاعب مُقصى حاول فتح القائمة` للمحاولات، زر `⚡ إقصاء إداري` → `admin:eliminate` ثم `admin:reveal-eliminated`، صوت محلي `leader_gallery_alert`.

### 4.7 RolesInfoModal — موسوعة الأدوار

- يُفتح من زر شريط الأدوات **«🃏 الأدوار»** (راجع 20-game-state-core.md) ومن صفحة البروفايل (13-profile.md).
- الحاوية: `fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 dir="rtl"` — **bottom-sheet على الموبايل / dialog موسّط ≥sm**.
- الخلفية: `motion.div` fade، `fixed inset-0 bg-black/60 backdrop-blur-sm`، نقرة إغلاق.
- المودال: `motion.div {opacity:0, scale:0.95, y:20}→{1,1,0}`، `relative w-full max-w-3xl max-h-[85vh] bg-gray-900 border border-gray-800 shadow-2xl rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col`.
- **الرأس** `p-5 sm:p-6 bg-gray-800/50 border-b border-gray-700/50 flex items-center justify-between shrink-0`: يسار `flex gap-3`: تايل `w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex center text-xl shadow-lg` بـ `🃏`؛ عنوان `<h2 text-xl font-bold text-white>` **«الكروت والأدوار»** + `<p text-sm text-gray-400>` **«تعرف على قدرات كل دور في اللعبة»**. زر إغلاق `w-10 h-10 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 text-lg` = `✖`.
- **الجسم** `flex-1 overflow-y-auto p-5 sm:p-6 space-y-8 custom-scrollbar`:
  - **تحميل**: `flex justify-center py-16` + spinner `animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full`.
  - **خطأ**: `text-center py-12 text-gray-500`، `⚠️` (`text-2xl mb-2`) + **«تعذّر تحميل الأدوار»** (`text-sm`).
  - **محمّل**: ثلاثة أقسام بالترتيب الثابت `MAFIA → CITIZEN → NEUTRAL` (يُتخطّى الفارغ). رأس القسم `<h3 text-lg font-bold {color} mb-4 flex items-center gap-2>`: شريط `<span w-2 h-6 {barColor} rounded-full>` + العنوان + `<span text-xs text-gray-600 font-normal>({count})`. الأدوار مرتبة `genPriority` تصاعدياً. الشبكة `grid grid-cols-1 sm:grid-cols-2 gap-4`. بطاقة الدور `motion.div key={id} {opacity:0, y:8}→{1,0}`، `{cardBg} border {cardBorder} p-4 rounded-2xl`:
    - رأس `flex items-center gap-3 mb-2`: `<span text-2xl>{getIcon(role)}` + `<h4 font-bold {nameColor}>{nameAr}` + `<span text-[10px] text-gray-600>{nameEn}`.
    - الوصف `<p text-xs text-gray-400 leading-relaxed>` = `description || 'لا يوجد وصف'`.
    - لو `winConditionType`: `<div mt-2 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/15>` + `<p text-[10px] text-amber-400>` **«🏆 {winConditionDescription || winConditionType}»**.
  - **إعدادات الفرق** (`TEAM_CONFIG`):
    | الفريق | title | color | barColor | cardBorder | nameColor |
    |--------|-------|-------|----------|-----------|-----------|
    | MAFIA | فريق المافيا | text-rose-500 | bg-rose-500 | border-rose-900/30 | text-rose-100 |
    | CITIZEN | فريق المواطنين | text-emerald-500 | bg-emerald-500 | border-emerald-900/30 | text-emerald-100 |
    | NEUTRAL | الأدوار المستقلة | text-amber-500 | bg-amber-500 | border-amber-900/30 | text-amber-100 |
    (`cardBg` للجميع `bg-gray-800/40 hover:bg-gray-800/60`.)
  - **أيقونات الأدوار** (خريطة خاصة بهذا المودال، تختلف عن `ROLE_ICONS` في constants): `GODFATHER 🎩، SILENCER 🤫، CHAMELEON 🦎، MAFIA_REGULAR 🔪، SHERIFF 🕵️، DOCTOR 🩺، SNIPER 🎯، POLICEWOMAN 👮‍♀️، NURSE 💉، MAYOR 🏛️، CITIZEN 👤، JESTER 🃏`؛ الافتراضي حسب الفريق `MAFIA 🎭 / CITIZEN 🛡️ / NEUTRAL ⚖️`؛ `getIcon = ROLE_ICONS[id] || TEAM_DEFAULT_ICON[team] || '🎭'`.
- **التذييل** `p-4 bg-gray-800/50 border-t border-gray-700/50 text-center shrink-0`: زر `px-8 py-2.5 bg-gradient-to-r from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500 text-white rounded-xl font-medium shadow-lg` = **«حسناً، فهمت الأدوار»**.
- **الجلب**: `fetch(\`${NEXT_PUBLIC_API_URL}/api/game-config/roles\`)` عند **كل فتح** (`useEffect` على `isOpen`)، **بلا Authorization header** هنا؛ يتوقّع `d.data` مصفوفة (وإلا `error=true`).
- ثيم أفتح (رمادي `bg-gray-900`) من ثيم اللعب المظلم. الأدوار الجديدة تحصل على أيقونة/لون حسب الفريق.

### حالات فارغة/خطأ ملخّصة
- كارد role=null → اسم الدور «مجهول»، ثيم fallback (ذهبي في Dynamic / zinc في Legacy).
- أفاتار فاشل (`onError`) → `avatarError=true` → placeholder جنس.
- config لم يصل بعد → الكارد يُرسَم بالـ fallbacks (لا يُحجب على `loading`)، ثم يُعاد الرسم عند الوصول.
- RolesInfoModal فشل الجلب → «تعذّر تحميل الأدوار».
- المعرض: لا فريق ولا سفّاح ولا توأم → الواجهة التمويهية دائماً (لا شاشة فارغة).

---

## 5. التكيّف مع الشاشات 6→11 إنش

تُطبَّق استراتيجية Window Size Classes الموثّقة في **01-foundation-theme.md**. تخصيص هذا الملف:

**مبدأ حاكم (لا يُخالَف):** الـ `positions.{x,y,s}` و`shapes` بكسلات **معايَرة على كارد الويب md = 224×320 منطقي**. لذا ارسم الكارد الديناميكي دائماً على **canvas منطقي ثابت 224×320** داخل `FittedBox(fit: BoxFit.contain)`، وكبّر/صغّر الكارد **ككل** — لا تُعِد تفسير الإزاحات لكل فئة شاشة، وإلا انحرفت تصاميم الأدمن. «الحجم» (sm/md/lg/fluid) يبقى للاستخدامات المتعددة (الحلقة/الليدر)، لكن **بطاقة الكشف الشخصية تُختار حسب فئة الشاشة**:

- **compact (< 600dp، هواتف 6–7″)**: بطاقة الكشف = `md` (224×320) كما في الـ PWA. معرض المافيا `grid-cols-2`، `max-w-sm` (~384dp) موسّط. RolesInfoModal = bottom-sheet بعمود واحد (`grid-cols-1`).
- **medium (600–840dp، تابلت 8″)**: بطاقة الكشف = `lg` (256×352) لزيادة قابلية القراءة. معرض المافيا يرفع إلى `grid-cols-3` (سقف عرض المحتوى 640dp موسّط؛ الشبكة قد تتجاوز `max-w-sm` قليلاً — اسمح بـ ~560dp). RolesInfoModal = dialog موسّط `sm:grid-cols-2` (كما في `≥sm` الويب)، سقف 640dp.
- **expanded (> 840dp، تابلت 10–11″)**: **ضاعِف عناصر اللعب الحسّاسة** — بطاقة الكشف الشخصية تُرسَم بمقياس ~×1.8–2.0 على canvas 224×320 (نتيجة بصرية ~400×570) **بدل تمديدها**؛ حافظ على النِّسَب. معرض المافيا `grid-cols-3` (أو 4 عند > 960dp)، سقف المحتوى 840–960dp موسّط. RolesInfoModal `max-w-3xl` (~768dp) مقبول، لكن قِف عند سقف 840–960dp؛ يمكن ثلاثة أعمدة للأدوار عند العرض الكبير.

ملاحظات عبر الفئات: المعرض يبقى `showGeneralDialog` كامل الشاشة مع زر إغلاق مثبّت في طبقة Stack عليا؛ لا تحوّله two-pane. حجم الأفاتار في بلاطات الفريق (72px) والتوأم (64px) والأيقونات ثابت — لا تكبّره مع الشاشة (يحافظ على الكثافة). المؤقتات ليست في هذا الملف (راجع 25-day-voting.md/23-night-phase.md).

---

## 6. المنطق والتدفقات

### آلة حالة القلب
- **Controlled** (`isFlipped` + `onFlip` مُمرَّران): الأب يملك الحالة؛ النقر ينادي `onFlip` فقط.
- **Uncontrolled** (لا `isFlipped`): حالة داخلية `internalFlip` تتبدّل بالنقر.
- **القاعدة الحرجة لكشف الدور**: في شاشة اللعب `onFlip = () => { setCardFlipped(true); setRoleAlert(false); }` — **أحادي الاتجاه لاصق** (النقر ثانية لا يخفي؛ `isFlipped` يبقى true). صفحة `/card-demo` تستخدم toggle. حافِظ على الدلالتين.
- `flippable=false` → النقر لا يفعل شيئاً (بطاقة الغطاء في الانتظار، والبطاقة المقلوبة قسراً عند الموت).

### حالات فرعية للكارد حسب سياق اللعب (يوفّرها 20-game-state-core.md)
- انتظار الدور: `role=null flippable=false` (غطاء فقط).
- الدور معيّن: `flippable=true flipDurationMs=1100`.
- rejoined حي بدور: `flippable=true` (700ms).
- ميت: `isFlipped=true flippable=false` + الحاوية `grayscale opacity-70` (من الأب) — والكارد نفسه يطبّق `opacity-30 grayscale` عند `isAlive=false`.

### ترطيب حالة المعرض (mafiaTeam / sibling / assassinContracts)
تأتي من (راجع 04-socket-layer.md):
- `player:role-assigned` → يضبط الدور، `cardFlipped=false`، `roleAlert=true`، يمسح علم الموت، و**يستبدل mafiaTeam/sibling دائماً** (حتى بمصفوفة فارغة/null — يمنع تسرّب جيم سابق)، اهتزاز `[100,50,200,50,300]`.
- `mafia:team-updated { mafiaTeam }` → تحديث حي (تحوّل الأخ الأصغر) بلا مسّ بطاقة اللاعب.
- `assassin:contracts-update { contracts[], currentIndex, completedCount, totalRequired }`.
- `game:started` → `assassinContracts=null` + reset، اهتزاز `200`.
- حقول ack عند rejoin (`res.mafiaTeam`, `res.sibling`, `res.assassinContracts`) تُرطّب أيضاً.

### إعادة الاتصال واستعادة الحالة
- بيانات المعرض تُعاد من أحداث الدور أعلاه ومن ack الـ rejoin — لا حاجة لطلب خاص من هذا الملف.
- الثبات المحلي: `mafia_mafiaTeam` (JSON array) و`mafia_sibling` (JSON object) في SharedPreferences، يُحدَّثان كلما تغيّرا، ويُمسحان عند مسح الفريق/الخروج/نهاية الجيم (راجع 05-session-auth.md). يُقرآن قبل أول frame (lazy) كي ينجو المعرض من refresh. **لكن بوابة `MAFIA_ROLES` عند الرسم هي شبكة الأمان — لا تثق بالبيانات المخزّنة وحدها.**
- **الكشف من DB**: `useGameConfig` module-cache TTL 5 دقائق مشترك؛ الأربع نقاط تُجلب بالتوازي عند أول mount؛ `invalidate()` عند تحديث الأدمن. `getCardForRole`: `role.cardTemplateId` → قالب `id==='master'` → `cards[0]` → null (null → كل الـ fallbacks).

### المؤقتات والمهل
- لا مؤقتات في هذا الملف عدا حلقات الأنيميشن (CSS keyframes/framer). السيرفر يحمل **throttle 5 ثوانٍ** لـ `player:mafia-gallery-open` لكل socket.
- شريط تقدّم السفّاح: `transition duration 0.8s easeOut` مرة واحدة عند الفتح.

### الحالات الحدّية
- `parseInt(physicalId)` يُستخدم كرقم؛ رقم ≥10 → تكديس عمودي.
- تبديل حساب/رجوع بعد تحوّل → البوابة الدفاعية تمنع تسرّب الفريق.
- التوأم أحادي الاتجاه (server-side): المعرض يرسم ما يصله فقط (الأكبر يرى الأصغر؛ الأصغر يلعب أعمى).

---

## 7. عقود التكامل

### REST (كلها عبر `NEXT_PUBLIC_API_URL`، راجع 03-networking-rest.md)
| Method | Path | Auth | الاستجابة (unwrap `data.data \|\| data`) |
|--------|------|------|------------------------------------------|
| GET | `/api/game-config/roles` | Bearer اختياري (useGameConfig) / **بلا auth** (RolesInfoModal) | `{ data: RoleDef[] }` |
| GET | `/api/game-config/card-templates` | Bearer اختياري | `{ data: CardTemplateDef[] }` |
| GET | `/api/game-config/abilities` | Bearer اختياري | `{ data: AbilityDef[] }` (مجلوب لكن غير مستعمل في هذا الملف) |
| GET | `/api/game-config/rank-effects` | Bearer اختياري | `{ data: RankEffectsDef[] }` |

- `roles` حقول مستعملة: `id, nameAr, nameEn, team, abilities[], description, cardTemplateId, cardOverrides` (+ `winConditionType, winConditionDescription, genPriority` في RolesInfoModal).
- الأربع تُجلب بالتوازي (`Promise.all`)، cache 5 دقائق module-scope.

### Socket (راجع 04-socket-layer.md)
| الحدث | الاتجاه | الحمولة | متى |
|-------|---------|---------|-----|
| `player:mafia-gallery-open` | player → server | `{ roomId }` | كل نقرة على FAB المعرض (حتى وهو ميت)، fire-and-forget خام، **قبل** فحص الموت |
| `player:role-assigned` | server → player | `{ role, mafiaTeam?: [{physicalId,name,role,avatarUrl?}], sibling?: {physicalId,name,role,avatarUrl?,isAlive,recipientIsMafia} }` | عند تعيين الدور — يستبدل الفريق/التوأم دائماً |
| `mafia:team-updated` | server → player | `{ mafiaTeam }` | تحوّل الأخ الأصغر |
| `assassin:contracts-update` | server → player | `{ contracts:[{id,type,targetRole,description,descriptionAr?,completed,completedAtRound?}], currentIndex, completedCount, totalRequired }` | تحديث عقود السفّاح |
| `game:started` | server → player | — | يصفّر العقود |
| `leader:mafia-gallery-alert` | server → **leader فقط** | `{ roomId, physicalId, name, role, team, teamAr, wasDead, avatarUrl, at }` | ردّاً على gallery-open (خاص بتطبيق الليدر — 30-host-console.md) |

**سلوك السيرفر لـ `player:mafia-gallery-open`** (lobby.socket.ts 2082–2143): يثق بـ `socket.data` حصراً (`role==='player'`، `roomId`/`physicalId` من socket.data؛ payload roomId مختلف يُتجاهَل). **throttle 5s** (`socket.data.lastGalleryPingAt`). يتجاهل بلا حالة أو `phase==='GAME_OVER'` أو دور غير معيّن. يحسب `wasDead = player.isAlive===false`، `team` (`MAFIA` / `NEUTRAL` لـ JESTER|ASSASSIN / `CITIZEN`)، `teamAr` (`المافيا`/`محايد`/`المواطنون`). يبثّ `leader:mafia-gallery-alert` عبر `io.in(roomId).fetchSockets()` **لسوكتات `data.role==='leader'` فقط** (الحمولة تحمل الدور فلا تُبثّ للغرفة)، ثم `logStaffAction` (category `MONITORING`، outcome `'blocked'` للمحاولات الميتة).

---

## 8. نماذج Dart المطلوبة

```dart
// ── بروبات الكارد ──
enum CardSize { sm, md, lg, fluid }          // 176×240 / 224×320 / 256×352 / fluid
enum Gender { male, female }

class MafiaCardProps {
  final int playerNumber;
  final String playerName;
  final String? role;              // null = مجهول
  final bool? isFlipped;           // controlled؛ null = uncontrolled
  final VoidCallback? onFlip;
  final int votes;                 // 0
  final void Function()? onVote;
  final bool showVoting;           // false
  final bool isAlive;              // true
  final bool isSilenced;           // false
  final Gender gender;             // male
  final CardSize size;             // md
  final bool flippable;            // true
  final int flipDurationMs;        // 700 (1100 للكشف)
  final String? avatarUrl;
  final String rankTier;           // 'INFORMANT'
  final RankEffectsData? rankEffectsOverride;
  final bool rankEditable;         // false (أدمن فقط)
  final bool hideIdentity;         // false
}

// ── config ──
class RoleDef {
  final String id, nameAr, nameEn;
  final String team;               // 'MAFIA' | 'CITIZEN' | 'NEUTRAL'
  final List<String> abilities;
  final String description;
  final String? cardTemplateId;
  final Map<String, dynamic>? cardOverrides;
  // (RolesInfoModal يضيف: winConditionType?, winConditionDescription?, genPriority)
}

class TeamBadgeDef {
  final bool? visible;
  final String? text, mafiaText, neutralText, citizenText;
  final String? bgColor, textColor, borderColor;
  final num? fontSize;             // 10
  final num? borderRadius;         // 9999
}
class IconDef { final String type; final String? value, url; }        // lucide|emoji|image
class SecretFaceDef { final String type; final String? customImageUrl, overlayGradient; }
class PositionOffset { final double x, y; final double? s; }
class ShapeDef {
  final String id, face, type;     // face: role|cover ; type: rect|circle
  final double x, y, w, h;
  final String bg; final double opacity; final int zIndex; final double radius;
}
class CardElements {
  final bool showPlayerNumber, showClubBranding, showDescription;
  final String? customFooterText, fontFamily;
  final num? nameSize, badgeSize, iconSize;
  final Map<String, PositionOffset>? positions;   // badge/icon/title/number/footer/playerName/coverNumber/coverName/coverBranding/coverFooter/coverPhoto
  final List<ShapeDef>? shapes;
}
class CardTemplateDef {
  final String id, gradient, borderColor, textColor, glowEffect;
  final TeamBadgeDef? teamBadge;
  final IconDef? icon;
  final SecretFaceDef? secretFace;
  final CardElements? elements;
}

class AbilityDef { final String id, nameAr, nameEn, phase, effectType; }

class BorderFx { final bool enabled; final String color; final double width, inset; final String style; final List<String> gradientColors; final double travelSpeed; }
class GlowFx { final bool enabled; final String color; final double size, opacity; final bool pulseEnabled; final double pulseDuration; }
class ShimmerFx { final bool enabled; final String color; final double opacity, duration; }
class ParticlesFx { final bool enabled; final int count; final String color; final double size; final String orbitRadius; final double baseDuration; final double? originX, originY; final String? animationType; final double? burstDistance; }
class FrameFx { final bool enabled; final String type; final String color; final double opacity, strokeWidth; final bool animate; }
class GradientOverlayFx { final bool enabled; final String color; final double opacity; final String direction; }
class FloatingFx { final bool enabled; final String content, position, animation, glowColor; final double size; final double? offsetX, offsetY, scale; }
class BadgeFx { final bool enabled; final String emoji, label, bgColor, textColor, borderColor, position; final double? offsetX, offsetY, scale; }
class NameEffectFx { final bool enabled; final String color, glowColor; final double glowSize; }
class RankEffectsData {
  final BorderFx border; final GlowFx glow; final ShimmerFx shimmer;
  final ParticlesFx particles; final FrameFx frame; final GradientOverlayFx gradientOverlay;
  final FloatingFx floating; final BadgeFx badge; final NameEffectFx nameEffect;
  // corners موجود في DB لكن غير مرسوم — يمكن تجاهله
}
class RankEffectsDef { final String id, nameAr; final int sortOrder; final RankEffectsData effects; }

// ── المعرض ──
class TeamMember { final int physicalId; final String name, role; final String? avatarUrl; }
class SiblingInfo {
  final int physicalId; final String name, role; final String? avatarUrl;
  final bool isAlive, recipientIsMafia;
}
class AssassinContract {
  final int id; final String type, targetRole, description; final String? descriptionAr;
  final bool completed; final int? completedAtRound;
}
class AssassinContracts {
  final List<AssassinContract> contracts;
  final int currentIndex, completedCount, totalRequired;
}

// ── إنذار الليدر (30-host-console.md) ──
class MafiaGalleryAlert {
  final String roomId; final int physicalId; final String name, role, team, teamAr;
  final bool wasDead; final String? avatarUrl; final int at;
}
```

---

## 9. الحزم المستخدمة

- `google_fonts` — Amiri (عربي display) + JetBrains Mono / Roboto Mono (أرقام/ملصقات).
- `socket_io_client` — إرسال `player:mafia-gallery-open` واستقبال أحداث الدور (المصادقة إلزامية).
- `shared_preferences` (أو `hive`) — `mafia_mafiaTeam` / `mafia_sibling`.
- `vibration` — نمط `[100,50,200,50,300]` عند تعيين الدور (المصدر 20-game-state-core.md).
- `flutter_animate` + `AnimationController` — القلب، النبضات، دخول عناصر المعرض (spring/stagger).
- `cached_network_image` أو `Image.network(errorBuilder:)` — أفاتار + بادئة `SOCKET_URL`.
- `shimmer` (اختياري) أو `ShaderMask` — تأثير shimmer للرتبة.
- `dio`/`http` — نقاط `game-config`.
- إطارات SVG والحدود المتحركة والجزيئات: `CustomPainter` (لا `flutter_svg` — المسارات إجرائية).

---

## 10. اختلافات Android / iOS

- **خطر الإيموجي (مشترك عبر المنصّتين، حرج على Android)**: حافِظ على اختيارات constants الخالية من ZWJ (`🔮` وليس `🧙‍♀️`، `👮` وليس `👮‍♀️`) في `ROLE_ICONS` المستعملة بالمعرض — تتفكّك على خطوط OEM القديمة. **لكن** `RolesInfoModal` يستعمل خريطته الخاصة التي تحوي `👮‍♀️` (ZWJ) — يُفضّل توحيدها مع مجموعة constants أو شحن `NotoColorEmoji` أو أصول أيقونات (راجع §11).
- **BackdropFilter blur** (خلفية المعرض `blur-md`، دائرة الأيقونة `blur(12px)`، badge `blur(4px)`): مكلف على Android الضعيف مع كروت متعددة — استعمل ترجمة نصف-شفافة صلبة بديلاً عند الحاجة (خصوصاً شبكة الليدر). على iOS blur أرخص.
- عدا ذلك **لا اختلافات جوهرية** في المنطق أو النصوص أو الأبعاد بين المنصّتين لهذا الملف.

---

## 11. الأصول المطلوبة

- صور placeholder الجنس: `/avatars/male.png` و`/avatars/female.png` (تُشحن كأصول تطبيق).
- أفاتار اللاعبين: روابط مطلقة أو نسبية تُبأدأ بـ `NEXT_PUBLIC_SOCKET_URL`.
- `secretFace.customImageUrl` (فن وجه دور كامل) و`icon.value/url` (صور أيقونات مرفوعة) — نفس بادئة الروابط النسبية.
- أيقونات Lucide المستعملة: كروت `User, HeartPulse, Shield, Syringe, Crosshair, BadgeAlert, Skull, Crown, Drama, Scissors, Flame, Ghost, Eye, Zap, Sword, Heart, Landmark`؛ معرض `X, Users, Target, Shield, Eye, Vote, MessageCircle` — رحّلها كـ `IconData` مكافئة (lucide_icons أو أصول SVG).
- مجموعات الإيموجي: `ROLE_ICONS` من constants (🔪 🤐 🦎 🔮 👥 🎭 🔍 💉 🎯 👮 🏥 🎩 👤 🤡)؛ خريطة RolesInfoModal الخاصة (🎩 🤫 🦎 🔪 🕵️ 🩺 🎯 👮‍♀️ 💉 🏛️ 👤 🃏 + defaults 🎭 🛡️ ⚖️)؛ إيموجي الواجهة 🩸 ✅ 🔇 🎴 ⚠️ 🏆 🚪 🚫 🕵️ 🔪.
- صوت `leader_gallery_alert` (جهاز الليدر فقط — راجع 07-sound-system.md، لا يخص تطبيق اللاعب).
- **لا Lottie ولا أصول SVG frame** — كل الأنيميشن CSS keyframes/framer + إطارات إجرائية.
- الخطوط: Amiri + JetBrains/Roboto Mono + Inter (لـ badge الرتبة، `letterSpacing: 0.05em`).

---

## 12. معايير القبول — checklist التكافؤ

- [ ] القلب: 700ms افتراضي / **1100ms** عند كشف الدور، منحنى `Cubic(0.2,0.7,0.2,1)`، تبديل الوجه عند 90°.
- [ ] القلب **أحادي الاتجاه اللاصق** في كشف الدور؛ toggle في card-demo.
- [ ] الأحجام: sm 176×240 / md 224×320 / lg 256×352 / fluid؛ حالة الموت `opacity-30 grayscale pointer-events-none`.
- [ ] رقم اللاعب ≥10 **مكدّس عمودياً** (lineHeight 0.85) بالأحجام الصحيحة؛ opacity 0.9 مع أفاتار / 0.55 بدونه؛ ألوان ذهبي/بنفسجي حسب الجنس.
- [ ] الوجه الأمامي: صورة/placeholder، شارة الإسكات «🔇 مُسكَت»، حلقة `ring-rose-600/60`، تلميح «اضغط للكشف»، «MAFIA CLUB» بالحجم/التتبّع الصحيح.
- [ ] وضع التصويت: العدّاد الأحمر المتوهّج (>0)، الخلفية النابضة `bg-red-900/15`، `stopPropagation` لا يقلب.
- [ ] الوجه الخلفي: `secretFace.customImageUrl` يستبدل كل شيء؛ وإلا gradient + شارة الفريق (نصوص/ألوان الفرق الثلاثة الصحيحة) + دائرة أيقونة 96px + اسم الدور Amiri + اسم اللاعب + فاصل 80×1 + تذييل «اضغط للإخفاء»/customFooterText.
- [ ] ترتيب أولوية الأيقونة: `cardOverrides.icon → template.icon → خريطة كلاسيكية → User`؛ دعم lucide/emoji/image.
- [ ] كل إزاحات `positions.{x,y,s}` مطبّقة على العناصر الصحيحة؛ أشكال الغطاء بـ translate، **أشكال وجه الدور بلا translate** (مركزة فقط).
- [ ] الكارد مرسوم على canvas 224×320 داخل FittedBox (لا انحراف للتصاميم عبر الأحجام).
- [ ] rank effects: border (solid/gradient/traveling) + glow نابض + shimmer 25° + جزيئات orbit/burst (جداول burst الثمانية) + إطار SVG (5 أنواع) + floating + badge — كلها فقط عند التفعيل.
- [ ] `hideIdentity` يخفي chip الرقم واسم اللاعب على وجه الدور.
- [ ] `GODFATHER` tier يضيف توهّج ذهبي على اسم الغطاء (`rank-name-glow`).
- [ ] Legacy: جدول الثيمات لكل دور مطابق؛ WITCH/الأخوين/JESTER/ASSASSIN → default zinc؛ رقم chip عائم مع أفاتار / موسّط شفاف بدونه.
- [ ] المعرض: زر إغلاق 44×44 مثبّت، خلفية `bg-black/80 blur-md`، `max-w-sm max-h-[90dvh]`، قفل تمرير.
- [ ] لوحة «رابط الدم»: النصان حسب `recipientIsMafia` حرفياً؛ grayscale عند الموت؛ لاحقة « (متوفّى)».
- [ ] واجهة السفّاح: «عقود الاغتيال» + «{n}/{m} عقود مُنجزة» + شريط تقدّم + عقود منجزة (مشطوبة، «أُنجز في الجولة n») ونشطة (🔪 نابض، «اقتل صاحب هذا الدور!»).
- [ ] فريق المافيا: `grid-cols-2`، «شركاؤك» + «{n} في الفريق»، بلاطات 72px بشارات مقعد وأدوار.
- [ ] الواجهة التمويهية: «ملف استخباراتي» / «INTELLIGENCE BRIEFING» + 4 نصائح حرفية.
- [ ] **ترتيب الغش**: emit `player:mafia-gallery-open` **قبل** فحص الموت؛ الميت لا يفتح المودال لكن السيرفر يُنبَّه.
- [ ] بوابة `MAFIA_ROLES` عند الرسم تصفّر team/sibling لغير المافيا؛ `isAssassin = role==='ASSASSIN'`.
- [ ] FAB يظهر فقط عند `assignedRole!=null && phase!=='GAME_OVER' && step∈{done,rejoined}`.
- [ ] RolesInfoModal: fetch عند كل فتح **بلا auth**؛ أقسام MAFIA→CITIZEN→NEUTRAL مرتبة `genPriority`؛ loading/error؛ chip شرط الفوز؛ زر «حسناً، فهمت الأدوار».
- [ ] كل النصوص العربية الحرفية مطابقة (الأزرار، العناوين، الشروحات، النصائح).

---

## 13. ملاحظات أداء وأمان

**أداء:**
- `RepaintBoundary` لكل كارد؛ عطّل rank effects تحت حجم md عند الحاجة (خصوصاً شبكات الليدر متعددة الكروت مع blur + جزيئات + shimmer متزامنة).
- ارسم الكارد على canvas 224×320 ثابت + FittedBox — يجنّب إعادة حساب التخطيط لكل حجم.
- أفاتار المعرض `loading="lazy" decoding="async"` → استعمل `cacheWidth`/`cached_network_image`.
- الجزيئات: أنشئ العشوائيات/المتجهات مرة واحدة (لا في كل build)؛ استعمل controllers متدرّجة.

**أمان (ثوابت anti-cheat تُنقل حرفياً — اختبارات قبول إلزامية):**
- **emit `player:mafia-gallery-open` قبل فحص الموت دائماً** — السيرفر يعتمد عليه لتنبيه محاولات اللاعب المُقصى.
- **بوابة `MAFIA_ROLES` عند الرسم** + **الاستبدال الدائم** لـ team/sibling عند تعيين الدور — لا تسريب فريق جيم سابق.
- **لا تثق بالبيانات المخزّنة** (`mafia_mafiaTeam`/`mafia_sibling`) وحدها؛ البوابة هي القرار النهائي.
- التوأم أحادي الاتجاه (server-side) — لا تُظهر للأصغر ما لا يصله.
- الحمولة `leader:mafia-gallery-alert` تحمل الدور وتُبثّ لسوكتات الليدر فقط — لا تكرّرها في أي منطق عميلي للاعب.
- المعرض لا يكشف الدور بمجرد وجود الزر (معروض للجميع)؛ الواجهة التمويهية هي ما يجعله آمناً.
