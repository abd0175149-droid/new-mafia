# التأسيس والثيم: المشروع، flavors، نظام التصميم، الخطوط، الهيكلية

> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

---

## 1. الهدف والنطاق

هذا الملف هو **الأساس الذي تُبنى عليه كل ملفات الخطة الأخرى**. يغطي:

1. إنشاء مشروع Flutter وهيكلية `lib/` الكاملة (مطابقة للبنية المعتمدة في 00-MASTER-PLAN.md §2.1).
2. نظام flavors (بيئتا `dev`/`prod`) مع `baseUrl` لكل بيئة — التطبيق **عميل ثانٍ لنفس الـ backend** ولا يوجد بروكسي Next.js، فكل المسارات تُبنى مطلقة على أصل الـ backend.
3. استخراج نظام التصميم «Dark Noir V2.1» كاملاً إلى `ThemeData` + `ThemeExtension`: الألوان، السلالم، الخطوط، الزوايا، الظلال، طبقات الأجواء (noise / vignettes)، أصناف المكوّنات (noir-card، الأزرار...)، الأنيميشنات السبعة، نظام الحوارات والتوستات (مكافئ SweetAlert2)، والمفردات البصرية المشتركة (أدوار/مراحل/إيموجي).
4. **المرجع المعياري لاستراتيجية التكيّف مع الشاشات 6→11 إنش** (§5) — كل ملفات الخطة الأخرى تحيل إلى هذا القسم في §5 الخاص بها.

**خارج النطاق هنا**: طبقة الشبكة (03)، السوكيت (04)، الجلسة (05)، الإشعارات (06)، الصوت (07)، التوجيه العميق (08) — لكن هذا الملف يعرّف الحاويات (`core/api`, `core/socket`, ...) التي ستملؤها تلك الملفات.

**قرارات معمارية ملزمة (من 00-MASTER-PLAN.md §2.2):**
- إدارة الحالة: **Riverpod** (`flutter_riverpod` + `riverpod_generator`).
- التنقل: **go_router**.
- الشبكة: **dio**. Socket: **socket_io_client ^3** (بروتوكول EIO4).
- التخزين: `flutter_secure_storage` للتوكنات، `shared_preferences` للأعلام، `hive` لكاش النوتة والأصوات.
- النماذج: `json_serializable` + `freezed`.
- الثيم **داكن فقط** — لا يوجد light theme في الـ PWA ولا مطلوب في التطبيق.
- التطبيق **RTL عربي بالكامل** — لا وضع LTR إلا شاشة تشخيص الدفع (ملف 06).

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

| الملف | ماذا يوفّر |
|---|---|
| `unified-mafia/frontend/tailwind.config.js` | سلالم الألوان mafia/citizen/dark/gold، عائلات الخطوط، الأنيميشنات السبعة وkeyframes، `backdropBlur.xs: 2px` |
| `unified-mafia/frontend/src/styles/globals.css` | متغيرات `:root` اللونية، noise overlay، الـ vignettes الأربعة، glitch-text، أصناف noir-card/player-card/role-chip/الأزرار/card-surface/btn-danger-soft، text-gradient-*، scrollbar، أصناف `body.modal-open`/`body.in-game` |
| `unified-mafia/frontend/src/app/layout.tsx` | شل المستند (`lang="ar" dir="rtl"`)، عنوان الصفحة، viewport بلا zoom، تحميل خطوط Google، سكربت بوابة الإصدار `APP_VERSION = '2.5.0'` مع cache-nuke، تسجيل SW، تحميل dotlottie من CDN |
| `unified-mafia/frontend/src/lib/swal.ts` | نظام الحوارات الوحيد: mixin الثيم + `swalConfirm`/`swalAlert`/`swalHtmlConfirm`/`swalToast` + `installGlobalSwal` + regex الاستنتاج التلقائي للأيقونة |
| `unified-mafia/frontend/src/components/SwalProvider.tsx` | مكوّن null-render يستدعي `installGlobalSwal()` عند الإقلاع |
| `unified-mafia/frontend/src/lib/constants.ts` | 16 دوراً + أسماؤها العربية + إيموجيها، 10 مراحل + أسماؤها، `MorningEvent`، `formatPlayer` |
| `unified-mafia/frontend/src/hooks/useModalScrollLock.ts` | آلية قفل التمرير + swipe-to-close بعتبة 80px (يسقط معظمها في Flutter — يبقى «إحساس» العتبة) |
| `unified-mafia/frontend/next.config.js` | rewrites `/api/*`, `/socket.io/*`, `/uploads/*` → backend (افتراضي `http://127.0.0.1:4000`) — تُستبدل بـ baseUrl مركزي |
| `unified-mafia/frontend/public/manifest.json` | `display: standalone`, `orientation: portrait`, `background/theme #050505`, `lang ar`, `dir rtl`, `start_url /player` |
| `unified-mafia/frontend/src/app/player/layout.tsx` | شاشة التحميل العامة، نمط بوابات ملء الشاشة، pull-to-refresh المخصص |
| `unified-mafia/frontend/package.json` | جرد التبعيات (framer-motion 11، lucide-react، sweetalert2 11، socket.io-client 4.7.5، firebase 12، tailwindcss 3.4) |

---

## 3. التبعيات على ملفات الخطة الأخرى

هذا الملف **جذر الشجرة** — لا يعتمد على أي ملف آخر، وكل الملفات الأخرى تعتمد عليه:

- **يوفّر لـ 03-networking-rest.md**: `AppConfig.baseUrl` وقاعدة حلّ `/uploads/*` المطلقة.
- **يوفّر لـ 04-socket-layer.md**: `AppConfig.socketUrl` (نفس أصل baseUrl).
- **يوفّر لـ 02-models-data-layer.md**: ثوابت الأدوار/المراحل (`game_constants.dart`) التي تبنى عليها النماذج.
- **يوفّر لـ 11-shell-navigation.md**: نمط «بوابة ملء الشاشة» (gate modal) وشاشة التحميل العامة وبديل بوابة الإصدار.
- **يوفّر للجميع (10→31)**: `ThemeData`، `MafiaColors`/`MafiaScales` (ThemeExtensions)، `DialogService`/`ToastService` (مكافئ Swal)، ويدجتات الأجواء (`NoiseOverlay`، `BloodVignette`...)، ويدجتات المكوّنات (`NoirCard`، `BtnPrimary`...)، تأثيرات `flutter_animate` السبعة، ومرجع §5 للتكيّف.
- **يُستهلك في 90/91-release**: إعداد flavors على مستوى Android/iOS.
- **92-qa-parity.md** يستخدم §12 هنا كجزء من مصفوفة التكافؤ.

---

## 4. الواجهة والتجربة تفصيلياً

هذا القسم هو «مواصفة نظام التصميم» — لا شاشات كاملة هنا، بل اللبنات التي تستعملها كل الشاشات.

### 4.1 شل التطبيق (مكافئ document shell)

- `MaterialApp.router` بـ:
  - `locale: Locale('ar')`, `supportedLocales: [Locale('ar')]` + delegates التوطين المادية (`GlobalMaterialLocalizations` وأخواتها).
  - `Directionality(textDirection: TextDirection.rtl)` مضمونة عبر الـ locale — **لا يوجد وضع LTR** إلا شاشة تشخيص الدفع (تغلّف نفسها بـ `Directionality(ltr)` محلياً — ملف 06).
  - `debugShowCheckedModeBanner: false`.
- خلفية التطبيق دائماً `#050505` (Pitch Black). لون النص الافتراضي `#808080` (رمادي مكتوم) — الأبيض/الذهبي/الأحمر يُطبّق لكل مكوّن على حدة (هذه فلسفة الويب: `body { background:#050505; color:#808080 }`).
- قفل الاتجاه **portrait فقط** (تكافؤ مع `"orientation": "portrait"` في manifest.json) — على الهواتف والتابلت معاً:
  ```dart
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  ```
- status bar شفاف فوق `#050505` بأيقونات فاتحة:
  ```dart
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,   // Android
    statusBarBrightness: Brightness.dark,        // iOS
    systemNavigationBarColor: Color(0xFF050505),
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  ```
- الزوم معطّل أصلاً في Flutter (لا viewport) — لا عمل مطلوب. `maximumScale:1 / userScalable:false` في الويب كانت لإحساس «كشك اللعبة» وهو الافتراضي في Flutter.
- **قفل textScale**: الـ PWA لا تستجيب لتكبير خط النظام؛ للتكافؤ البصري في شاشات اللعب الحساسة نقيّد `MediaQuery.textScaler` بمدى `clamp(minScaleFactor: 1.0, maxScaleFactor: 1.3)` على مستوى الشل (قرار واعٍ: نسمح حتى 1.3 لإتاحة الوصول بدل قفل كامل، مع اختبار عدم انكسار شاشات اللعب — يُذكر في 92-qa-parity.md).

### 4.2 جدول Design Tokens الكامل (جاهز لـ ThemeData)

#### 4.2.1 الألوان الأساسية والسطوح

| Token (اسم Dart) | Hex | الاستعمال في الويب | ربط ThemeData |
|---|---|---|---|
| `bloodRed` (primary) | `#8A0303` | أزرار أساسية، vignettes، selection، danger | `colorScheme.primary`, `colorScheme.error` |
| `vintageGold` (secondary) | `#C5A059` | عناوين، زر تأكيد الحوارات، لهجات | `colorScheme.secondary` |
| `pitchBlack` | `#050505` | خلفية التطبيق | `scaffoldBackgroundColor` |
| `charcoal` | `#111111` | سطوح | `colorScheme.surface` |
| `darkCard` | `#1A1A1A` | بطاقات عامة | `colorScheme.surfaceContainerHigh` |
| `noirCardBg` | `#0C0C0C` | بطاقات noir | `colorScheme.surfaceContainer` |
| `noirBorder` | `#2A2A2A` | حدود noir/ghost | `dividerColor` + حدود الحقول |
| `success` | `#2E5C31` | نجاح / مؤقّت أخضر | `MafiaColors.success` |
| `textMuted` | `#808080` | نص body الافتراضي | `textTheme.bodyMedium.color` |
| `textEmphasis` | `#FFFFFF` | العناوين البيضاء | `textTheme.titleLarge.color` |
| `swalText` | `#E7E2D6` | نص الحوارات (أبيض دافئ) | `dialogTheme` content color |
| `swalBg` | `#141210` | خلفية الحوارات | `dialogTheme.backgroundColor` |
| `swalCancel` | `#2F2A24` | زر إلغاء الحوارات | `MafiaColors.dialogCancel` |
| `dangerConfirm` | `#B91C1C` | زر تأكيد خطر (danger:true) | `MafiaColors.dangerConfirm` |
| `btnPrimaryHover` | `#A00303` | pressed/hover للأحمر | `MafiaColors.primaryPressed` |
| `btnSecondaryHover` | `#D4B069` | pressed/hover للذهبي | `MafiaColors.secondaryPressed` |
| `dangerSoftText` | `#FF6B6B` | نص btn-danger-soft | `MafiaColors.dangerSoft` |
| `citizenText` | `#E2E2E2` | text-gradient-citizen | `MafiaColors.citizenText` |
| `gateInputBg` | `#121212` | صناديق خطوات البوابات | `MafiaColors.gateInputBg` |
| `cardSurfaceTop` → `cardSurfaceBottom` | `#0E0E10` → `#0A0A0B` (حد `#1A1A1A`) | توكن card-surface (الغرفة الريموت) | `MafiaColors.cardSurfaceGradient` |
| `glitchRed` / `glitchCyan` | `#FF0000` / `#00FFFF` | طبقتا glitch-text | ثوابت ويدجت Glitch |

#### 4.2.2 السلالم (تُحمَل كـ `ThemeExtension` باسم `MafiaScales` — المكوّنات تشير لدرجات محددة)

| السلّم | القيم كاملة |
|---|---|
| `mafia` (أحمر) | 50 `#FEF2F2`، 100 `#FEE2E2`، 200 `#FECACA`، 300 `#FCA5A5`، 400 `#F87171`، 500 `#EF4444`، 600 `#DC2626`، 700 `#B91C1C`، 800 `#991B1B`، 900 `#7F1D1D`، 950 `#450A0A` |
| `citizen` (أزرق) | 50 `#EFF6FF`، 100 `#DBEAFE`، 200 `#BFDBFE`، 300 `#93C5FD`، 400 `#60A5FA`، 500 `#3B82F6`، 600 `#2563EB`، 700 `#1D4ED8`، 800 `#1E40AF`، 900 `#1E3A8A`، 950 `#172554` |
| `dark` (slate + مخصص) | 50 `#F8FAFC`، 100 `#F1F5F9`، 200 `#E2E8F0`، 300 `#CBD5E1`، 400 `#94A3B8`، 500 `#64748B`، 600 `#475569`، 700 `#334155`، 800 `#1E293B`، **850 `#162032` (درجة مخصصة غير قياسية)**، 900 `#0F172A`، 950 `#020617` |
| `gold` (أصفر Tailwind — **ليس ذهب البراند!**) | 400 `#FACC15`، 500 `#EAB308`، 600 `#CA8A04` |
| `amber` (بوابات/إشعارات) | 500 `#F59E0B`، 600 `#D97706`؛ gradients مستعملة: `#F59E0B→#D97706` (135deg) و`from-amber-500 to-yellow-600` = `#F59E0B→#CA8A04` |
| ألوان أنواع الإشعارات | `#F59E0B / #EF4444 / #8B5CF6 / #3B82F6 / #22C55E / #10B981`، fallback `#666666` (تفصيلها في 19-notifications-inbox.md) |
| emerald (حالة registered) | emerald-500 `#10B981`، emerald-900 `#064E3B` (تُستعمل بشفافيات /50 و/20) |

⚠️ **ثلاثة «ذهبيات» متعايشة يجب تضمينها كلها ولا يجوز توحيدها**: ذهب البراند `#C5A059`، وTailwind gold `#EAB308`، وamber `#F59E0B`.

#### 4.2.3 الزوايا (لغتان متعايشتان — أبقِ كلتيهما)

| Token | Radius | الاستعمال |
|---|---|---|
| `radiusNoir` | `BorderRadius.zero` | **توقيع البراند**: noir-card، btn-primary/secondary/ghost/premium |
| `radiusChip` | 8 | thumbnails/chips الإشعارات |
| `radiusConsole` | 10 | كونسول التشخيص |
| `radiusSoft` | 12 (`rounded-xl`) | زر الجرس، card-surface، btn-danger-soft |
| `radiusPanel` | 16 (`rounded-2xl`) | لوحة الإشعارات، الحوارات (Swal)، صناديق خطوات البوابات |
| `radiusRichModal` | 18 | مودال الإشعار الغني |
| `radiusGate` | 24 (`rounded-3xl`) | بطاقات البوابات الكاملة |
| `radiusFull` | `StadiumBorder` / دائرة | role-chips، FAB الكتم، badges |

#### 4.2.4 الظلال والتوهجات

| Token | القيمة الحرفية |
|---|---|
| `shadowNoirCard` | `0 15px 30px rgba(0,0,0,0.8)` |
| `shadowNoirHover` | `0 20px 40px rgba(138,3,3,0.15)` + حد `#8A0303` بشفافية 40% + رفع -4px |
| `shadowBtnPrimary` | `0 5px 15px rgba(138,3,3,0.3)` |
| `shadowPanel` | `0 20px 40px rgba(0,0,0,0.5)` |
| `shadowRichModal` | `0 20px 60px rgba(0,0,0,0.6)` |
| `glowKeyframe` | من `0 0 5px rgba(239,68,68,0.5)` إلى `0 0 20px rgba(239,68,68,0.8), 0 0 40px rgba(239,68,68,0.3)` |
| `glowGoldNumber` | `textShadow: 0 0 20px rgba(197,160,89,0.4)` (الأرقام الذهبية الكبيرة مثل رقم المقعد) |
| `dropShadowText` | `0 2px 4px rgba(0,0,0,1)` (أدوات text-gradient-*) |

#### 4.2.5 هيكل ThemeData (الكود المرجعي)

```dart
ThemeData(
  useMaterial3: true,
  brightness: Brightness.dark,
  scaffoldBackgroundColor: const Color(0xFF050505),
  colorScheme: const ColorScheme.dark(
    primary: Color(0xFF8A0303),
    secondary: Color(0xFFC5A059),
    surface: Color(0xFF111111),
    surfaceContainer: Color(0xFF0C0C0C),
    surfaceContainerHigh: Color(0xFF1A1A1A),
    error: Color(0xFF8A0303),
  ),
  dividerColor: const Color(0xFF2A2A2A),
  dialogTheme: const DialogThemeData(
    backgroundColor: Color(0xFF141210),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(16))),
  ),
  textSelectionTheme: const TextSelectionThemeData(
    selectionColor: Color(0x808A0303),   // selection:bg-[#8A0303] — بشفافية 50%
    cursorColor: Color(0xFFC5A059),
  ),
  // ScrollbarTheme يهم فقط لو استُهدف desktop/web لاحقاً:
  // thumb #475569 بعرض 6، track #0F172A
  extensions: const [MafiaColors(...), MafiaScales(...)],
)
```

+ `TextTheme` كما في §4.3، + `MafiaColors`/`MafiaScales` كما في §8.

### 4.3 الخطوط (Typography)

**تُضمَّن كأصول محلية في التطبيق** (لا `google_fonts` وقت التشغيل — تكافؤ offline وثبات النسخ). الأوزان أدناه اتحاد ما يحمَّل في `layout.tsx` و`globals.css`:

| العائلة | الأوزان المطلوبة | الدور | ربط TextTheme |
|---|---|---|---|
| **Tajawal** | 300، 400، 500، 700، 800، 900 | body العربي — الـ sans الفعلي (الويب يذكر Inter أولاً لكنه **لا يُحمَّل أبداً**، فالفعلي Tajawal) | `bodySmall/bodyMedium/bodyLarge/labelSmall/labelMedium/labelLarge` |
| **Amiri** | 400، 700 | serif الدرامي/النوار — كل العناوين ونصوص الأطوار والنصوص المسرحية (مطبّق inline في عشرات ملفات الويب — **في Flutter يُمركز في TextTheme وإلا ستطارد مئات الأنماط**) | `displayLarge/displayMedium/displaySmall/headlineLarge/headlineMedium/headlineSmall/titleLarge/titleMedium` |
| **Cairo** | 400، 700، 900 | قوالب بطاقات الأدوار الديناميكية (ملف 22) | أصل خط فقط — يُختار runtime حسب `cardTemplate.elements.fontFamily` |
| **Noto Kufi Arabic** | 400، 700 | قوالب البطاقات | أصل خط فقط |
| **Reem Kufi** | 400، 700 | قوالب البطاقات | أصل خط فقط |
| **JetBrains Mono** | 400، 500، 700 | sublabels لاتينية / IDs / المؤقّت / كونسول التشخيص | `fontFamily` مواضعي (helper `monoStyle`) |
| Outfit | 300، 400، 600، 700، 900 | مستورد في globals.css باستعمال محدود جداً | **اختياري** — لا يُضمَّن في v1 إلا إذا كشفت ملفات الشاشات استعمالاً فعلياً |

**سلّم الأحجام العملي (كما يُستعمل في الويب):** العناوين `font-black (w900)` بأحجام 24–30 (text-2xl/3xl) بالذهبي `#C5A059` أو الأبيض؛ النص الثانوي 12–14 (text-xs/sm) رمادي `#808080`؛ الأرقام الكبيرة (رقم المقعد) 48 (text-5xl) ذهبي مع `glowGoldNumber`.

**قاعدتان عربيتان حرجتان (إلزاميتان):**
1. **`letterSpacing` يكسر وصلات الحروف العربية** — `letterSpacing: 0` على كل TextStyle عربي بلا استثناء. الـ tracking/uppercase حصراً للنصوص اللاتينية عبر helper:
   ```dart
   /// مكافئ .btn-premium-latin: uppercase + tracking-[0.2em]
   TextStyle latinStyle(TextStyle base) =>
       base.copyWith(letterSpacing: base.fontSize! * 0.2);
   // + تحويل النص .toUpperCase() على الجانب اللاتيني فقط
   ```
2. **الإيموجي خالية من ZWJ عمداً** (🔮 لا 🧙‍♀️، 👮 لا 👮‍♀️) — عند نقل أي إيموجي جديدة التزم أحادية الـ codepoint. (خطر متبقٍ: شكل الإيموجي يختلف بين Android/iOS — انظر §10.)

### 4.4 طبقات الأجواء العالمية (Atmosphere Layers)

كلها ويدجتات `IgnorePointer` توضع في `Stack` فوق/تحت المحتوى:

| الويدجت | المواصفة الحرفية | التنفيذ |
|---|---|---|
| `NoiseOverlay` | فوق **كل شيء دائماً** (أعلى طبقة في الشل، مكافئ z-9999)؛ ضجيج fractal (في الويب: SVG `feTurbulence baseFrequency=0.85 numOctaves=3`) بشفافية **0.04** | `IgnorePointer` + صورة PNG ضجيج مبلّطة (`ImageRepeat.repeat`) بـ `opacity: 0.04` داخل `RepaintBoundary` — **ليس** CustomPainter لكل إطار |
| `BloodVignette` | 5 تدرجات شعاعية مكدّسة: زوايا حمراء `rgba(138,3,3, 0.3 / 0.25 / 0.15 / 0.25)` (أعلى-يسار/أعلى-يمين/أسفل-يسار/أسفل-يمين، كل منها ellipse تتلاشى عند 50%) + مركزية `transparent 40% → rgba(0,0,0,0.4) 100%` | `Stack` من 5 `DecoratedBox` بـ `RadialGradient` (رخيصة GPU). تُستعمل في: PlayerFlow الحضوري وصفحة الدخول (تحدد ملفات الشاشات مواضعها) |
| `SpotlightVignette` | `radial-gradient(circle at center, transparent 25%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.85) 100%)`؛ دخول fade **`vignetteIn` 1s ease-out** (opacity 0→1) | ويدجت مع `AnimatedOpacity`/`flutter_animate fadeIn(1s)` — عند تسليط الضوء على متحدث |
| `RevealedVignette` | `radial-gradient(circle at center, transparent 30%, rgba(138,3,3,0.3) 60%, rgba(138,3,3,0.7) 100%)`؛ دخول **1.5s ease-out** | مثل أعلاه — عند كشف الهوية |
| `RemoteVignette` | `radial-gradient(90% 40% at 50% -5%, rgba(197,160,89,0.05), transparent 60%)` + `radial-gradient(120% 70% at 50% 115%, rgba(138,3,3,0.09), transparent 55%)` — توهج ذهبي علوي + أحمر سفلي | خلفية غرفة اللعب عن بُعد |
| `DisplayBg` | `#050505` + `radial-gradient(circle at 50% 0%, #111111 0%, #050505 70%)` | خلفية الصفحات العامة (class `display-bg` في الويب) |
| `GlitchText` | النص يهتز `glitchShake` 0.3s ease-in-out infinite alternate بإزاحات (±1، ±2)px بنمط `(0,0)→(-2,1)→(2,-1)→(-1,2)→(1,-2)→(0,0)`؛ + نسختان فوقه بشفافية 0.8: حمراء `#FF0000` بإزاحة (-2,-1) وأشرطة `clip inset` متحركة (`glitchClip1` 0.5s linear infinite alternate بمراحل inset علوي/سفلي: 20/50→10/60→30/40→15/55→25/45%)، وسماوية `#00FFFF` بإزاحة (2,1) (`glitchClip2` 0.4s: 50/20→60/10→40/30→55/15→45/25%) | `CustomPainter` أو Stack من 3 نصوص مع `ClipRect` متحرك — لنص «المسكوت» |

### 4.5 ويدجتات المكوّنات المشتركة (مكافئ @layer components)

| الويدجت | المواصفة الحرفية |
|---|---|
| `NoirCard` | bg `#0C0C0C`، حد 1px `#2A2A2A`، **زوايا حادة `BorderRadius.zero`**، ظل `0 15px 30px rgba(0,0,0,0.8)`، + **إطار داخلي مزدوج**: حد 1.5px بلون dark-800 `#1E293B` بهامش 4px من كل الجهات (تأثير برواز الصورة) — في Flutter: `Container` خارجي + `foregroundDecoration` أو Container داخلي بـ margin 4 |
| `NoirCardHover` (variant تفاعلي) | نفس NoirCard + عند الضغط/hover: رفع `-4px` (translateY)، حد `#8A0303` بشفافية 40%، ظل `0 20px 40px rgba(138,3,3,0.15)`؛ transition **300ms** |
| `PlayerCard` وحالاتها | أساس: NoirCard بـ padding 16، صف بـ gap 12؛ **alive**: حد dark-600 `#475569` (لمس: حد `#C5A059` /60)؛ **dead**: `Opacity(0.3)` + `ColorFiltered` بمصفوفة saturation 0 (**grayscale كامل**) + حد dark-900 + غير قابل للنقر؛ **silenced**: حد dark-500 `#64748B` + bg `#111111`؛ **registered**: حد emerald-500/50 + bg emerald-900/20؛ **empty**: حد **متقطع** dark-600 (حزمة `dotted_border`) + bg dark-900/40 |
| `RoleChip` | pill (StadiumBorder)، padding أفقي 16/رأسي 8، خط bold 14، ظل؛ **mafia**: تدرج أفقي mafia-700 `#B91C1C` → mafia-900 `#7F1D1D`، نص mafia-100 `#FEE2E2`، حد mafia-500/30؛ **citizen**: تدرج citizen-700 `#1D4ED8` → citizen-900 `#1E3A8A`، نص citizen-100 `#DBEAFE`، حد citizen-500/30 |
| `BtnPrimary` | padding 24×12، **زوايا حادة**، bold أبيض، bg `#8A0303`، حد red-950 `#450A0A`، pressed bg `#A00303` + `scale 0.95`، ظل `0 5px 15px rgba(138,3,3,0.3)`، معطّل opacity 0.5؛ transition 200ms. (uppercase/tracking في الويب لاتينية التوجه — **لا تُطبّق على العربية**) |
| `BtnSecondary` | نفس الشكل، نص dark-950 `#020617` على bg `#C5A059`، حد amber-700 `#B45309`، pressed `#D4B069` + scale 0.95 |
| `BtnGhost` | نص dark-400 `#94A3B8`، حد `#2A2A2A`، شفاف؛ لمس: bg `#111111`، نص `#C5A059`، حد `#C5A059`/40؛ scale 0.95 |
| `BtnPremium` | padding 32×16، زوايا حادة، **w900** حجم 20، bg `#0C0C0C`، حد `#2A2A2A`، نص `#C5A059`؛ لمس: رفع -2px، إطار داخلي 2px `#8A0303` يظهر بـ fade **300ms**، + لمعة قطرية بيضاء /5 تعبر من اليسار (-100%) إلى (200%) خلال **700ms** (`AnimatedContainer` + `ShaderMask`/`AnimatedPositioned` sweep)؛ pressed scale 0.98؛ **بلا uppercase/tracking للعربية** — للنص اللاتيني variant `latinStyle` (tracking 0.2em + uppercase) |
| `CardSurface` | radius 12، حد `#1A1A1A`، تدرج رأسي `#0E0E10 → #0A0A0B` — لغة سطح الغرفة الريموت |
| `BtnDangerSoft` | radius 12، bold، حد `#8A0303`/50، نص `#FF6B6B`، bg `#8A0303`/15؛ لمس bg /25؛ pressed scale 0.98؛ معطّل opacity 0.4 |
| أدوات نصية `textGradientMafia/Citizen/Gold` | رغم الاسم هي **ألوان مسطحة** مع ظل: `#8A0303` / `#E2E2E2` / `#C5A059` + `dropShadow 0 2px 4px black` — TextStyle helpers وليست ShaderMask |

**لا يُنقل**: `.deal-card` — dead code (يعتمد `glass-card` غير المعرّف أصلاً ولا يستعمله أي مكوّن).

### 4.6 الأنيميشنات المشتركة (تأثيرات `flutter_animate` قابلة لإعادة الاستخدام)

تُبنى كـ extensions في `app/theme/motion.dart`:

| الاسم | المواصفة الحرفية |
|---|---|
| `pulseSlow` | pulse (opacity 1→0.5→1) بمدة **3s** cubic-bezier(0.4, 0, 0.6, 1) لانهائي |
| `glow` | ظل أحمر نابض: من `0 0 5px rgba(239,68,68,0.5)` إلى `0 0 20px rgba(239,68,68,0.8), 0 0 40px rgba(239,68,68,0.3)`، **2s** ease-in-out لانهائي alternate |
| `shake` | **0.5s** cubic-bezier(.36,.07,.19,.97)، إزاحات x: -1px (10%,90%)، +2px (20%,80%)، -4px (30%,50%,70%)، +4px (40%,60%) |
| `bloodDrip` | كشف من الأعلى للأسفل عبر clip: `inset(0 0 100% 0)` → `inset(0 0 0 0)` خلال **1s** ease-in (ClipRect بارتفاع متحرك) |
| `shieldBlock` | scale 0.5→1.2→1 مع opacity 0→1→1، **0.8s** ease-out |
| `fadeInUp` | opacity 0→1 + translateY 20→0، **0.5s** ease-out |
| `countUp` | scale 1→1.3→1، **0.3s** ease-out (نبضة تغيّر رقم) |
| `vignetteIn` | opacity 0→1، 1s (spotlight) أو 1.5s (revealed) ease-out |
| `glitchShake/glitchClip1/glitchClip2` | كما في §4.4 (GlitchText) |

قاعدة عامة: transitions المكوّنات في الويب 200ms (أزرار) / 300ms (بطاقات/premium) / 700ms (اللمعة) — اعتمد نفس المدد.

### 4.7 خدمة الحوارات والتوستات (مكافئ SweetAlert2 — نظام الحوارات الوحيد في التطبيق)

تُبنى في `core/ui/dialog_service.dart` + `core/ui/toast_service.dart` وتُحقن عبر Riverpod. **كل** تأكيد/تنبيه/توست في بقية الملفات يمر من هنا — لا `showDialog` مباشر في الشاشات.

**الثيم الموحّد (mixin):** خلفية `#141210`، نص `#E7E2D6`، زر تأكيد ذهبي `#C5A059` (نص داكن)، زر إلغاء `#2F2A24` (نص `#E7E2D6`)، radius **16**، أيقونة رأس دائرية بحسب النوع (ألوان SweetAlert2 v11 الافتراضية: success `#A5DC86`، error `#F27474`، warning `#F8BB86`، info `#3FC3EE`، question `#87ADBD`).

**الدوال الأربع (الواجهة العامة الملزمة):**

1. `Future<bool> confirm(String text, {String? title, String? confirmText, String? cancelText, SwalIcon? icon, bool danger = false})`
   - العنوان الافتراضي: **«تأكيد»**، الأيقونة الافتراضية warning، زرّا **«نعم»** / **«إلغاء»**.
   - `reverseButtons: true` في الويب = ترتيب RTL صحيح (الإلغاء ثم التأكيد بصرياً) — في Flutter: صف أزرار RTL بحيث زر الإلغاء أول ما تقع عليه العين، والتأكيد في الطرف.
   - `focusCancel: true` = **الإلغاء هو التركيز الافتراضي** (أمان)؛ في Flutter: `autofocus` على الإلغاء.
   - `danger: true` → لون زر التأكيد `#B91C1C`.
   - النص يُعرض كما هو مع تحويل `\n` إلى سطر جديد (الويب يهرّب HTML ويحوّل `\n`→`<br>`؛ في Flutter النص آمن أصلاً).
2. `void alert(String text, [SwalIcon? icon])`
   - زر واحد **«حسناً»**. بلا عنوان.
   - **استنتاج تلقائي للأيقونة من النص** عند غياب `icon` — انقل الـ regex **حرفياً**:
     - success إذا طابق: `✅|تمّ|تم |تمت|بنجاح|نجح|أُرسل|أضيف|حُفظ`
     - error إذا طابق (case-insensitive): `❌|فشل|خطأ|تعذّر|غير صالح|مطلوب|لا يمكن`
     - warning إذا طابق: `⚠️|تنبيه|تحذير`
     - وإلا info.
3. `Future<bool> htmlConfirm(String title, Widget body, {String? confirmText, String? cancelText, bool danger = false, bool infoOnly = false})`
   - مكافئ `swalHtmlConfirm`: جسم غني (في Flutter: Widget بدل HTML خام).
   - `infoOnly: true` → زر واحد **«إغلاق»** بلا إلغاء وبلا focusCancel؛ وإلا: تأكيد **«نعم»** / إلغاء **«إغلاق»** مع reverseButtons + focusCancel.
   - `danger` → تأكيد `#B91C1C`.
4. `void toast(String text, [SwalIcon icon = SwalIcon.info])`
   - Overlay أعلى الشاشة **جهة البداية بصرياً** (الويب `top-end` وفي صفحة RTL يظهر أعلى-يسار — في Flutter: `top-start` بمنطق RTL يعطي نفس الموضع البصري أعلى-يسار).
   - مدة **3000ms** مع **شريط تقدم زمني** (LinearProgress يتناقص)، بلا أزرار، نفس خلفية/نص الثيم، أيقونة صغيرة بحسب النوع.
   - يُغلق باللمس فوراً.

**مكافئ `installGlobalSwal` (توجيه window.alert):** لا وجود له في Flutter — **قرار إلزامي**: كل موضع في الـ PWA يستدعي `alert()` الخام يُحصر أثناء نقل شريحته ويحوَّل إلى `dialogService.alert(...)`. ملفات الشاشات (10→31) مسؤولة عن ذلك، وهذه الخدمة هي المقصد الوحيد.

### 4.8 شاشة التحميل العامة

- خلفية سوداء `#050505` ملء الشاشة.
- Spinner دائري **48×48** (`12 × 4px` بوحدات Tailwind): حلقة بسماكة 2، لونها amber-500 بشفافية 30% `rgba(245,158,11,0.3)` وقوسها العلوي amber-500 `#F59E0B` كامل، يدور (مكافئ `CircularProgressIndicator` بـ strokeWidth 2، color `#F59E0B`، backgroundColor `rgba(245,158,11,0.3)`).
- تحته النص الحرفي: **«جاري التحميل...»** بلون رمادي `#808080` حجم 14.

### 4.9 نمط «بوابة ملء الشاشة» (Gate Modal Pattern)

يُستعمل في الويب لبوابات التثبيت/الإذن/الرفض/غير مدعوم، وتسقط بوابات PWA في Flutter، لكن **النمط يبقى** لبوابة التحديث الإجباري (§6.4) وبوابة إذن الإشعارات (ملف 06). المواصفة:

- طبقة تغطي كل شيء (أعلى zIndex — فوقها فقط NoiseOverlay).
- بطاقة مركزية `maxWidth 448` (max-w-md)، radius **24**، خلفية `#0C0C0C` بشفافية 90% + blur خلفي قوي (انظر تحذير الأداء §13)، حد + توهج ملوّن حسب الخطورة: amber `rgba(245,158,11,…)` للتنبيه، أحمر للرفض/الخطر، أزرق للمعلومة.
- صفوف خطوات مرقّمة داخل صناديق `#121212` بشفافية 80%، radius **16**.
- زر CTA بعرض كامل بتدرج `#F59E0B → #CA8A04` (from-amber-500 to-yellow-600) نص **أسود** عريض، radius 16.
- دخول البطاقة بتأثير `fadeInUp` (0.5s ease-out).

### 4.10 المفردات البصرية المشتركة (نقل `constants.ts` حرفياً)

ملف واحد `core/constants/game_constants.dart`:

- **نوع الدور `RoleId = String` + ثوابت `KnownRoles` (16 معروفاً)**: `GODFATHER, SILENCER, CHAMELEON, WITCH, OLDER_BROTHER, MAFIA_REGULAR, SHERIFF, DOCTOR, SNIPER, POLICEWOMAN, NURSE, MAYOR, CITIZEN, YOUNGER_BROTHER, JESTER, ASSASSIN` — قيم wire هي الأسماء الكبيرة نفسها (تُرسل/تُستقبل كسلاسل في REST/Socket). ⚠️ **ليس enum مغلقاً**: المحرك ديناميكي والأدوار تُدار من DB (`/api/game-config/roles`)، فأي enum مغلق ينكسر عند إضافة دور من لوحة الأدمن — القرار المرجعي والتعريف الكامل في [02-models-data-layer.md](02-models-data-layer.md) §6.1/§8.1.
- `KnownRoles.mafiaRoles` = الستة الأولى؛ `KnownRoles.neutralRoles` = `{JESTER, ASSASSIN}`؛ helpers `isMafiaRole(RoleId)` و`isNeutralRole(RoleId)` (حسم الفريق أولاً من `RoleDef.team` المحمَّل ثم fallback لهذه القوائم — 02 §6.1).
- **`ROLE_NAMES` (حرفياً)**: شيخ المافيا، قص المافيا، حرباية المافيا، الساحرة، الأخ الأكبر، مافيا عادي، الشريف، الطبيب، القناص، الشرطية، الممرضة، العمدة، مواطن صالح، الأخ الأصغر، المهرج، السفّاح.
- **`ROLE_ICONS` (بالترتيب نفسه)**: 🔪 🤐 🦎 🔮 👥 🎭 🔍 💉 🎯 👮 🏥 🎩 👤 👥 🤡 🔪 — **أحادية codepoint بلا ZWJ عمداً**.
- **مراحل العرض (`PHASE_NAMES` — نقل `constants.ts` حرفياً، 10 مفاتيح)**: `LOBBY, ROLE_GENERATION, ROLE_BINDING, DAY_DISCUSSION, DAY_VOTING, DAY_JUSTIFICATION, DAY_TIEBREAKER, NIGHT, MORNING_RECAP, GAME_OVER`. ⚠️ **التعداد المرجعي للمراحل هو `GamePhase` (11 قيمة تشمل `DAY_ELIMINATION` + `unknown`) المعرَّف في [02-models-data-layer.md](02-models-data-layer.md) §8.1** (يتبع الـ backend) — الويب بلا اسم عرض لـ `DAY_ELIMINATION` (تعالجها 02 §4.4 و25-day-voting.md) فلا مفتاح عرض لها هنا. لا تعرّف تعداد مراحل ثانياً في `game_constants.dart` — استعمل `GamePhase` واقرأ اسم العرض من `PHASE_NAMES`.
- **`PHASE_NAMES` (حرفياً)**: اللوبي، توليد الأدوار، ربط الكروت، نقاش نهاري، التصويت، التبرير، كسر التعادل، الليل، ملخص الصباح، نهاية اللعبة.
- **enum `CandidateType`**: `PLAYER | DEAL`.
- أنواع `MorningEvent` (9 قيم): `ASSASSINATION, ASSASSINATION_BLOCKED, SNIPE_MAFIA, SNIPE_CITIZEN, SILENCED, SHERIFF_RESULT, ABILITY_DISABLED, TWIN_SUICIDE, TWIN_TRANSFORM` (النموذج الكامل في 02-models-data-layer.md).
- **قاعدة عرض اللاعب الموحدة**: `formatPlayer(physicalId, name)` → `"#5 - أحمد"` (`'#$physicalId - $name'`) — تُستعمل في **كل** مكان يُذكر فيه لاعب.

---

## 5. التكيّف مع الشاشات 6→11 إنش — **المرجع المعياري لكل ملفات الخطة**

الـ PWA الحالية مصممة موبايل-أولاً بعمود واحد؛ التطبيق يستهدف هواتف 6–7 إنش وتابلت 8 و10–11 إنش. **الاستراتيجية: Window Size Classes** حسب عرض النافذة المنطقي (dp):

| الفئة | العرض | الأجهزة النموذجية | الفلسفة |
|---|---|---|---|
| **compact** | أقل من 600dp | هواتف 6–7 إنش | عمود واحد كما في الـ PWA حرفياً — هذا هو خط الأساس للتكافؤ |
| **medium** | 600 ≤ العرض < 840dp | تابلت 8 إنش (بورتريه) | رفع أعمدة الشبكات؛ سقف عرض للمحتوى النصي **640dp** ومركزته |
| **expanded** | ≥ 840dp | تابلت 10–11 إنش | سقف عرض **840–960dp**؛ توسيع الشبكات؛ أحياناً two-pane؛ **تكبير عناصر اللعب الحساسة بدل تمديدها** |

### 5.1 الأدوات المشتركة (تُبنى هنا وتستهلكها كل الشاشات)

```dart
// app/theme/dimens.dart
enum WindowSizeClass { compact, medium, expanded }

WindowSizeClass sizeClassOf(double widthDp) => widthDp < 600
    ? WindowSizeClass.compact
    : (widthDp < 840 ? WindowSizeClass.medium : WindowSizeClass.expanded);

extension WindowSizeClassX on BuildContext {
  WindowSizeClass get sizeClass => sizeClassOf(MediaQuery.sizeOf(this).width);
}
```

**Sizing tokens (القيم الملزمة):**

| Token | compact | medium | expanded | ملاحظة |
|---|---|---|---|---|
| `pagePadding` (حواف الصفحة) | 16 | 24 | 32 | |
| `sectionGap` (بين الأقسام) | 16 | 20 | 24 | |
| `contentMaxWidth` (نصوص/نماذج/قوائم) | ∞ (كامل العرض) | **640** | **720** | يُطبّق عبر `ContentConstraint` |
| `pageMaxWidth` (سقف الصفحة كلها) | ∞ | 840 | **960** | ما بعده هوامش سوداء `#050505` متمركزة |
| `gameScale` (معامل عناصر اللعب الحساسة) | **1.0** | **1.25** | **1.5** | بطاقات الأدوار، المؤقتات الدائرية، رقم المقعد، أزرار الليل/التصويت الكبيرة |
| `gridTileMinWidth` (بلاطات لاعبين/مقاعد) | 100 | 110 | 120 | تُستعمل مع `SliverGridDelegateWithMaxCrossAxisExtent` |
| `dialogMaxWidth` | 448 (max-w-md) | 448 | 512 | الحوارات لا تتمدد أبداً لعرض التابلت |
| `bottomSheetMaxWidth` | ∞ | 640 | 640 | bottom sheets تتمركز على التابلت |

**ويدجتان مساعدتان (في `core/ui/adaptive.dart`):**

```dart
/// يقيّد عرض المحتوى ويمركزه حسب الفئة — يلفّ جسم كل شاشة نصية/قوائمية.
class ContentConstraint extends StatelessWidget { /* maxWidth حسب contentMaxWidth */ }

/// شبكة تكيفية: تحدد الأعمدة بـ maxCrossAxisExtent = gridTileMinWidth×~1.3
/// بدل عدد أعمدة ثابت — الأعمدة ترتفع تلقائياً مع العرض.
class AdaptiveGrid extends StatelessWidget { /* ... */ }
```

### 5.2 القواعد العامة الملزمة لكل الشاشات

1. **compact = الـ PWA حرفياً**: عمود واحد، نفس paddings (16)، نفس أحجام الخطوط، نفس ترتيب العناصر. لا اجتهاد.
2. **medium**:
   - المحتوى النصي/النماذج/القوائم يُقيَّد بـ 640dp ويتمركز (لا أسطر نص أعرض من ~70 حرفاً).
   - الشبكات (لاعبون، مقاعد، ألعاب، منيو F&B) ترفع أعمدتها تلقائياً عبر `AdaptiveGrid` (مثال: بلاطات 100dp تعطي 3–4 أعمدة على الهاتف و5–6 على 8 إنش).
   - لا two-pane بعد.
3. **expanded**:
   - سقف الصفحة 960dp متمركز؛ خلفية الأجواء (vignettes/noise) تغطي **كامل** الشاشة الفيزيائية وليس فقط عمود المحتوى.
   - two-pane مسموح حيث ينص ملف الشاشة عليه صراحة (مثال نموذجي: 26-notepad-mafia-chat.md نوتة+شات جنباً لجنب؛ 30-host-console.md قوائم+تفاصيل) — **الافتراضي عند عدم النص: عمود واحد بسقف 960dp**.
4. **عناصر اللعب الحساسة تُكبَّر ولا تُمدَّد**: بطاقة الدور، المؤقّت الدائري (أساس 200dp على الشاشة → على هاتف اللاعب حسب ملف شاشته)، رقم المقعد الذهبي الكبير، أزرار أفعال الليل — تُضرب أبعادها في `gameScale` (1.0/1.25/1.5) وتبقى متمركزة. **يُمنع** تمديدها لملء العرض (بطاقة دور بعرض 900dp كارثة بصرية).
5. **الحوارات والتوستات لا تتبع عرض الشاشة**: `dialogMaxWidth` ثابت (448/448/512). التوست عرضه الطبيعي بحد أقصى 360dp، وموضعه أعلى-البداية دائماً.
6. **الأنيميشنات والمدد لا تتغير بين الفئات** — نفس الإحساس على كل الأجهزة.
7. **الخطوط**: أحجام body ثابتة عبر الفئات؛ نصوص الـ display الدرامية (عناوين الأطوار، «الليل يحل على المدينة»...) تُضرب في `gameScale` لأنها جزء من عناصر اللعب المشهدية.
8. **الاتجاه portrait مقفول على كل الفئات** (تكافؤ manifest) — لا landscape في v1، لذا الفئات تُقاس على عرض البورتريه (تابلت 10–11 إنش بورتريه ≈ 800–900dp عرضاً → غالباً expanded أو أعلى الـ medium؛ هذا مقصود).
9. **كل ملف شاشة يجب أن يحدد في §5 الخاص به**: ما الذي يتغير في شاشته لكل فئة بالإحالة إلى هذه التوكنات (وليس بأرقام مخترعة جديدة).

### 5.3 أمثلة تطبيقية (للاستئناس وليست بديلاً عن ملفات الشاشات)

- **الصفحة الرئيسية (12-home.md)**: compact عمود واحد؛ medium بطاقات الحجوزات في `ContentConstraint(640)` وشبكة الفعاليات عمودان؛ expanded الشبكة 3 أعمدة داخل 960dp.
- **لوبي اللعبة (21-join-lobby.md)**: شبكة المقاعد `AdaptiveGrid(tileMin: gridTileMinWidth)` — 4 أعمدة هاتف، 6 تابلت 8، 7–8 تابلت 11؛ رقم مقعدي الذهبي يكبر بـ `gameScale`.
- **بطاقة الدور (22-role-cards.md)**: عرض البطاقة الأساسي (نسبة 63:88 تقريباً) × `gameScale`، متمركزة دائماً، والفراغ حولها يتنفس.
- **التصويت (25-day-voting.md)**: قائمة المرشحين compact عمود واحد؛ medium/expanded عمودان بحد أقصى داخل 720dp — أزرار التصويت تكبر لمساً (min-height 56 على التابلت).

---

## 6. المنطق والتدفقات

### 6.1 تسلسل الإقلاع (bootstrap)

```
main_dev.dart / main_prod.dart
  → bootstrap(AppConfig)
     1. WidgetsFlutterBinding.ensureInitialized()
     2. SystemChrome: portrait فقط + SystemUiOverlayStyle (§4.1)
     3. Firebase.initializeApp (مشروع mafia-b1c74 — تفاصيله في 06-push-notifications.md)
     4. Hive.initFlutter + فتح صناديق الكاش
     5. فحص بوابة الإصدار (§6.4)
     6. runApp(ProviderScope(child: MafiaApp(config)))
MafiaApp
  → MaterialApp.router(theme: buildNoirTheme(), locale: ar, routerConfig: appRouter)
  → Stack أعلى مستوى: [child (الشاشات), NoiseOverlay]  ← الضجيج فوق كل شيء دائماً
```

### 6.2 نظام flavors

| | `dev` | `prod` |
|---|---|---|
| `baseUrl` | `https://mafia.grade.sbs` (staging) | `https://club-mafia.grade.sbs` (production) |
| `socketUrl` | نفس الأصل (`https://mafia.grade.sbs`، مسار `/socket.io`) | نفس الأصل (`https://club-mafia.grade.sbs`، مسار `/socket.io`) |
| `uploadsBase` | = baseUrl | = baseUrl |
| اسم التطبيق | «Mafia Club Dev» | «Mafia Club» |
| Android applicationId | `sbs.grade.mafiaclub.dev` (suffix `.dev`) | `sbs.grade.mafiaclub` (مثبَّت نهائياً — يطابق 08/90/91-release) |
| iOS bundle id | scheme/xcconfig `dev` | scheme/xcconfig `prod` (91-release-ios.md) |
| أيقونة | شارة DEV فوق الأيقونة | الأيقونة النهائية |

- **التنفيذ**: entrypoints منفصلة (`lib/main_dev.dart`, `lib/main_prod.dart`) كل منها يمرر `AppConfig` ثابتاً إلى `bootstrap()` — لا `--dart-define` للـ URLs (تبقى في الكود لضمان أن build واحد لا يتغير سلوكه بمتغير خارجي).
- Android: `productFlavors { dev { applicationIdSuffix ".dev" } prod {} }` في `android/app/build.gradle`؛ iOS: schemes `dev`/`prod` مع xcconfig لكل منهما.
- أوامر التشغيل: `flutter run --flavor dev -t lib/main_dev.dart` / `--flavor prod -t lib/main_prod.dart`.

**قاعدة حلّ الروابط (تعويض rewrites الـ Next):** الـ PWA كانت تنادي `/api/*` و`/socket.io/*` و`/uploads/*` نسبياً والبروكسي يحوّلها. في Flutter:
- REST: `dio.options.baseUrl = config.baseUrl` والمسارات تبدأ بـ `/api/...` (ملف 03).
- Socket: `io(config.socketUrl, path: '/socket.io')` (ملف 04).
- **أي قيمة `/uploads/...` نسبية تصل في حمولات REST/Socket (صور، أصوات، قوالب بطاقات) يجب حلّها إلى `config.baseUrl + path` عبر helper واحد** `resolveUploadUrl(String path)` في `core/utils/` — يمرّر الروابط المطلقة كما هي ويُلحق النسبية بالأصل. ممنوع بناء روابط uploads يدوياً في الشاشات.

### 6.3 حالة الواجهة العالمية (بديل أصناف body)

أعلام DOM في الويب تصبح Riverpod providers في `core/ui/ui_flags.dart`:

| علم الويب | البديل | الاستعمال |
|---|---|---|
| `body.modal-open` | يسقط — Flutter يدير المودالات طبيعياً | لا شيء |
| `body.in-game` | `inGameProvider (bool)` | يفعَّل طوال جلسة اللعب: يعطّل pull-to-refresh في الشل، ويستهلكه 20-game-state-core.md |
| `window.__swalInstalled` | يسقط | خدمة الحوارات singleton أصلاً |
| swipe-to-close للمودالات (عتبة 80px عند قمة التمرير) | `showModalBottomSheet(isDismissible: true, enableDrag: true)` مع `DraggableScrollableSheet` حيث يلزم | يحاكي إحساس العتبة الافتراضي في Flutter قريب من 80px — مقبول |
| pull-to-refresh المخصص (iOS standalone، سبينر عنبري >60px، reload >80px) | `RefreshIndicator` (color `#F59E0B`) — **الدلالة تتغير: إعادة جلب حالة الشاشة وليس إعادة تشغيل التطبيق**؛ معطّل عندما `inGameProvider == true` | الشاشات القوائمية فقط (home/history/...) |

### 6.4 بوابة الإصدار (بديل سكربت APP_VERSION)

**سلوك الويب الحالي (للفهم):** `APP_VERSION = '2.5.0'` مضمّن في `<head>`؛ يقارن بـ `localStorage.mafia_app_version`؛ عند الاختلاف: حذف كل CacheStorage + إلغاء تسجيل كل SWs + `location.reload(true)` بعد 300ms؛ auto-reload عند تحديث SW **معطّل عمداً** (كان يسبب infinite loop).

**في Flutter (مرحلتان):**
1. **v1 (بلا backend جديد — إلزامي الآن):** عند الإقلاع، قارن إصدار التطبيق (`package_info_plus`) بقيمة `mafia_app_version` المخزنة في `shared_preferences`. عند الاختلاف: **امسح كاشات Hive القابلة للتقادم** (كاش خريطة الأصوات، كاش الصور المنزلة إن وجد — ليس الجلسة ولا النوتة) ثم خزّن الإصدار الجديد. هذا يكافئ cache-nuke دون reload (لا SW في Flutter).
2. **v2 (بوابة تحديث إجباري):** تتطلب endpoint إصدار أدنى من الـ backend — **غير موجود حالياً ويُمنع اختراعه**؛ إن أُضيف ضمن إضافات 00-MASTER-PLAN.md §12.4 تُبنى بوابة بنمط §4.9 (بطاقة gate حمراء + CTA «تحديث» يفتح المتجر عبر `url_launcher`) في 11-shell-navigation.md.

### 6.5 حالات حدّية

- **فقدان الخطوط**: الخطوط أصول محلية — لا حالة فقدان (على عكس الويب المعتمد على Google Fonts CDN). ممنوع تحميل خطوط شبكية.
- **NoiseOverlay فوق الحوارات**: يجب أن يُرسم فوق كل شيء بما فيه الحوارات (سلوك الويب z-9999) — لذا يوضع في `builder` الخاص بـ MaterialApp فوق الـ Navigator وليس داخل Scaffold الشاشات.
- **إعادة الاتصال واستعادة الحالة**: خارج نطاق هذا الملف (04-socket-layer.md و20-game-state-core.md) — هذا الملف يوفر فقط `inGameProvider` وشاشة التحميل العامة المستخدمة أثناء الاستعادة.
- **المؤقتات والمهل الخاصة بهذا الملف**: توست 3000ms؛ transitions 200/300/700ms؛ vignetteIn 1000/1500ms؛ لا شيء آخر.

---

## 7. عقود التكامل

**هذه الشريحة لا تملك أي endpoint أو حدث socket خاص بها** (الويب: صفر نداءات في design-system slice — فقط rewrites بنية تحتية).

ما تعرّفه للبقية:

| العقد | القيمة |
|---|---|
| REST base | `dev`: `https://mafia.grade.sbs` — `prod`: `https://club-mafia.grade.sbs`؛ كل المسارات تبدأ `/api/...` (تفاصيل العملاء في 03-networking-rest.md) |
| Socket.IO | نفس الأصل، `path: '/socket.io'`، بروتوكول EIO4 (socket.io-client v4 في الويب — التفاصيل والمصافحة في 04-socket-layer.md) |
| الملفات المرفوعة | `GET {baseUrl}/uploads/...` — static bez auth؛ قاعدة `resolveUploadUrl` في §6.2 |
| بوابة إصدار من الـ backend | **لا يوجد endpoint حالياً** — انظر §6.4 |

---

## 8. نماذج Dart المطلوبة

| الكلاس | الحقول | ملاحظات |
|---|---|---|
| `AppConfig` | `AppFlavor flavor` (enum `dev, prod`)، `String baseUrl`، `String socketUrl`، `String uploadsBase`، `String appName` | ثابت لكل entrypoint؛ يُتاح عبر `Provider<AppConfig>` |
| `MafiaColors extends ThemeExtension<MafiaColors>` | `Color bloodRed, vintageGold, pitchBlack, charcoal, darkCard, noirCardBg, noirBorder, success, textMuted, swalBg, swalText, swalCancel, dangerConfirm, primaryPressed, secondaryPressed, dangerSoft, citizenText, gateInputBg;` + `Gradient cardSurfaceGradient` | قيم §4.2.1؛ `lerp` يعيد `this` (ثيم واحد) |
| `MafiaScales extends ThemeExtension<MafiaScales>` | `Map<int, Color> mafia, citizen, dark, gold, amber` (+ ثوابت emerald وألوان أنواع الإشعارات) | قيم §4.2.2 كاملة بما فيها `dark[850] = 0xFF162032` |
| `Dimens` (static/context-scoped) | `pagePadding, sectionGap, contentMaxWidth, pageMaxWidth, gameScale, gridTileMinWidth, dialogMaxWidth, bottomSheetMaxWidth` حسب `WindowSizeClass` | جدول §5.1 |
| `WindowSizeClass` | enum `compact, medium, expanded` + `sizeClassOf(double)` + extension على BuildContext | §5.1 |
| `SwalIcon` | enum `success, error, warning, info, question` | خدمة الحوارات §4.7 |
| `Role` | enum بـ 16 قيمة + `wireValue` (String) + `arabicName` + `emoji` + `get isMafia` / `get isNeutral` | §4.10 — التحويل من/إلى wire strings |
| `PHASE_NAMES` | خريطة أسماء العرض (10 مفاتيح، بلا `DAY_ELIMINATION`) — التعداد `GamePhase` (11) في 02 §8.1 | §4.10 |
| `CandidateType` | enum `player('PLAYER'), deal('DEAL')` | §4.10 |
| helper `formatPlayer(int physicalId, String name) => '#$physicalId - $name'` | — | القاعدة البصرية الموحدة |

(نماذج البيانات الشبكية — Player, GameState, ... — في 02-models-data-layer.md وتستهلك enums هذا الملف.)

### هيكلية `lib/` الكاملة (ملزمة — امتداد مفصّل لبنية 00-MASTER-PLAN.md §2.1)

```
lib/
├─ main.dart                    # bootstrap(AppConfig) المشترك
├─ main_dev.dart                # entrypoint فليفر dev
├─ main_prod.dart               # entrypoint فليفر prod
├─ app/
│  ├─ app.dart                  # MaterialApp.router + Theme + locale ar + NoiseOverlay builder
│  ├─ router.dart               # go_router (يُملأ في 08/11)
│  └─ theme/
│     ├─ colors.dart            # MafiaColors + MafiaScales + كل ثوابت §4.2
│     ├─ typography.dart        # TextTheme (Amiri/Tajawal/JetBrainsMono) + latinStyle + قاعدة letterSpacing:0
│     ├─ dimens.dart            # WindowSizeClass + Dimens + sizing tokens §5.1
│     ├─ motion.dart            # تأثيرات flutter_animate السبعة + vignetteIn + مدد الـ transitions
│     └─ theme.dart             # buildNoirTheme() يجمع كل ما سبق
├─ core/
│  ├─ api/                      # (03) Dio client + interceptors
│  ├─ socket/                   # (04) SocketService
│  ├─ storage/                  # (05) SessionStore + PrefsStore + صناديق Hive
│  ├─ push/                     # (06) PushService
│  ├─ audio/                    # (07) SoundManager
│  ├─ constants/
│  │  └─ game_constants.dart    # Role/Phase/أسماء/إيموجي/formatPlayer (§4.10)
│  ├─ ui/                       # ← إضافة معلنة لهذا الملف: لبنات الواجهة المشتركة
│  │  ├─ dialog_service.dart    # confirm/alert/htmlConfirm (§4.7)
│  │  ├─ toast_service.dart     # toast (§4.7)
│  │  ├─ atmosphere.dart        # NoiseOverlay/BloodVignette/Spotlight/Revealed/Remote/DisplayBg (§4.4)
│  │  ├─ glitch_text.dart       # GlitchText (§4.4)
│  │  ├─ noir_widgets.dart      # NoirCard/PlayerCard/RoleChip/الأزرار/CardSurface (§4.5)
│  │  ├─ adaptive.dart          # ContentConstraint/AdaptiveGrid (§5.1)
│  │  ├─ loading_screen.dart    # شاشة التحميل (§4.8)
│  │  ├─ gate_modal.dart        # نمط البوابة (§4.9)
│  │  └─ ui_flags.dart          # inGameProvider وأعلام الواجهة (§6.3)
│  └─ utils/                    # deviceId, formatters, phone normalization, resolveUploadUrl
├─ models/                      # (02) json_serializable + freezed
├─ features/                    # كما في 00-MASTER-PLAN §2.1: auth/shell/home/game/host/voice/
│                               # games/profile/rank/history/order/feedback
└─ l10n/                        # النصوص (عربي فقط حالياً — لكن مهيكلة)
```

---

## 9. الحزم المستخدمة

**حزم هذا الملف تحديداً (الأساس):**

| الحزمة | الغرض |
|---|---|
| `flutter_riverpod` + `riverpod_annotation` + `riverpod_generator` | إدارة الحالة (قرار معماري عام) |
| `go_router` | التنقل (يُملأ في 08/11) |
| `flutter_animate` | تأثيرات §4.6 (بديل framer-motion) |
| `flutter_localizations` (SDK) + `intl` | RTL/العربية |
| `shared_preferences` | `mafia_app_version` وأعلام بسيطة |
| `package_info_plus` | قراءة إصدار التطبيق لبوابة §6.4 |
| `hive` + `hive_flutter` | كاشات (تُفتح صناديقها هنا وتُستهلك في 02/07) |
| `dotted_border` | حالة `PlayerCard.empty` (الحد المتقطع) |
| `cached_network_image` | الصور الشبكية (يُعاد ذكرها في ملفات الشاشات) |
| `url_launcher` | فتح المتجر/روابط خارجية (بوابة التحديث، وملفات أخرى) |

**قرارات سلبية (لا تُنقل):** `google_fonts` وقت التشغيل (الخطوط أصول محلية)؛ مكافئات sonner/next-themes/clsx/date-fns/react-use-measure/sharp (صفر imports في الويب)؛ `dotlottie` (ملفات .lottie تخص شاشة العرض — خارج نطاق تطبيق اللاعب، وإن لزمت لاحقاً فعبر `lottie` + تحويل إلى .json).

حزم بقية الطبقات (dio، socket_io_client، firebase_messaging، flutter_secure_storage، freezed...) تُعرَّف في ملفاتها وتُجمع في pubspec واحد.

---

## 10. اختلافات Android / iOS

| الموضوع | Android | iOS |
|---|---|---|
| flavors | `productFlavors` في `build.gradle` (`dev` بـ `applicationIdSuffix ".dev"` + `resValue` لاسم التطبيق) | Schemes + `.xcconfig` لكل بيئة (Debug-dev/Release-prod...) — تفصيل التوقيع في 91-release-ios.md |
| status bar | `statusBarColor: transparent` + `statusBarIconBrightness: light`؛ edge-to-edge افتراضي من Android 15 — اختبر عدم تسرب المحتوى خلف شريط التنقل (`SafeArea` في الشل) | `statusBarBrightness: dark` (يكافئ `black-translucent` في PWA)؛ safe areas للـ notch/home-indicator إلزامية في شاشات اللعب |
| قفل portrait | `android:screenOrientation="portrait"` في manifest + `SystemChrome` | `UISupportedInterfaceOrientations` = portrait فقط في Info.plist + `SystemChrome` |
| الإيموجي (أيقونات الأدوار) | نمط Noto Emoji | نمط Apple Emoji — **الشكل يختلف بصرياً بين المنصتين**؛ v1 يقبل الاختلاف (الويب أصلاً يتباين حسب الجهاز)، وقرار استبدالها بأصول SVG/PNG موحّدة مؤجل لملف 22-role-cards.md |
| BackdropFilter (بلور البوابات/اللوحات) | مكلف على الأجهزة الضعيفة — استخدم خلفية شبه معتمة `#0C0C0C @ 95%` كبديل تلقائي (§13) | أداء البلور جيد عموماً — يمكن إبقاؤه |
| خطوط النظام fallback | Roboto للاتيني غير المغطى | SF Pro للاتيني غير المغطى — لا عمل مطلوب (JetBrains Mono يغطي المواضع المقصودة) |
| minSdk / إصدارات | minSdk 23+ (متطلب firebase_messaging — يثبَّت في 90) | iOS 13+ (يثبَّت في 91) |

---

## 11. الأصول المطلوبة

```
assets/
├─ fonts/
│  ├─ Tajawal-Light.ttf (300) / Regular (400) / Medium (500) / Bold (700) / ExtraBold (800) / Black (900)
│  ├─ Amiri-Regular.ttf (400) / Amiri-Bold.ttf (700)
│  ├─ Cairo-Regular.ttf (400) / Bold (700) / Black (900)
│  ├─ NotoKufiArabic-Regular.ttf (400) / Bold (700)
│  ├─ ReemKufi-Regular.ttf (400) / Bold (700)
│  └─ JetBrainsMono-Regular.ttf (400) / Medium (500) / Bold (700)
├─ images/
│  ├─ noise_tile.png          # بلاطة ضجيج 200×200 مولّدة من نفس مواصفة feTurbulence (baseFrequency 0.85، 3 octaves) — تُعرض بشفافية 0.04
│  ├─ mafia_logo.png          # من frontend/public/mafia_logo.png
│  └─ avatars/female.png، avatars/male.png   # من frontend/public/avatars/
└─ (أيقونات التطبيق launcher icons من icon-512x512.png عبر flutter_launcher_icons — في 90/91)
```

- المصدر القانوني للخطوط: Google Fonts (نفس العائلات التي يحمّلها الويب) — تُنزَّل مرة وتُضمَّن.
- **لا** ملفات `.lottie` هنا (fireworks/prize-podium/sound-off/winner تخص شاشة العرض — خارج نطاق تطبيق اللاعب).
- **لا** ملفات صوت هنا (أصوات اللعبة من الـ backend `/uploads` + أصول الـ synth المُصيّرة — ملف 07-sound-system.md).
- الإيموجي ليست أصولاً — نصوص ضمن `game_constants.dart`.

---

## 12. معايير القبول

- [ ] المشروع يبنى ويعمل بالفليفرين: `--flavor dev -t lib/main_dev.dart` يضرب `https://mafia.grade.sbs`، و`--flavor prod -t lib/main_prod.dart` يضرب `https://club-mafia.grade.sbs`، ويمكن تثبيتهما جنباً لجنب على نفس الجهاز (application id مختلف).
- [ ] التطبيق كله RTL عربي: أي شاشة تجريبية تظهر بمحاذاة يمين ونصوص عربية سليمة الوصلات (لا letterSpacing على أي نص عربي — فحص بصري لكلمة مثل «التصويت» في زر premium).
- [ ] الخلفية `#050505` والنص الافتراضي `#808080` — مطابقة عينية مع الـ PWA جنباً لجنب.
- [ ] `MafiaColors` و`MafiaScales` تحتويان **كل** قيم §4.2.1 و§4.2.2 بما فيها `dark-850 #162032` والذهبيات الثلاث (`#C5A059`، `#EAB308`، `#F59E0B`).
- [ ] العناوين Amiri 700 والجسم Tajawal — مقارنة بصرية مع الويب لعنوان وفقرة؛ الخطوط تعمل **بلا إنترنت** (وضع طيران).
- [ ] NoiseOverlay مرئي (حبيبات فيلم خفيفة 4%) فوق كل شيء **بما فيه الحوارات**، ولا يلتقط اللمس.
- [ ] BloodVignette تطابق الويب: توهج أحمر بالزوايا الأربع بشدات (0.3/0.25/0.15/0.25) + تعتيم مركزي.
- [ ] GlitchText يعرض نسختين حمراء/سماوية مهتزتين بأشرطة قص متحركة (فيديو مقارنة مع الويب).
- [ ] `NoirCard` بزوايا حادة تماماً + الإطار الداخلي المزدوج (1.5px بهامش 4px) ظاهر.
- [ ] حالات `PlayerCard` الخمس مطابقة، وخصوصاً dead = opacity 30% + grayscale كامل.
- [ ] `dialogService.confirm('نص')` يعرض: عنوان «تأكيد»، أيقونة warning، زرا «نعم»/«إلغاء» بترتيب RTL مع التركيز على «إلغاء»، خلفية `#141210`، تأكيد ذهبي `#C5A059`؛ ومع `danger: true` يصير التأكيد `#B91C1C`.
- [ ] `dialogService.alert('تم الحفظ بنجاح')` يستنتج أيقونة success تلقائياً؛ و`alert('فشل الاتصال')` يستنتج error؛ و`alert('تنبيه: ...')` warning؛ ونص آخر info (اختبارات unit للـ regex الحرفية).
- [ ] `toast` يظهر أعلى-يسار بصرياً، يختفي بعد 3 ثوانٍ بالضبط مع شريط تقدم، ويُغلق باللمس.
- [ ] الأنيميشنات السبعة (`pulseSlow, glow, shake, bloodDrip, shieldBlock, fadeInUp, countUp`) منفذة بنفس المدد والمنحنيات (شاشة معرض داخلية debug لعرضها).
- [ ] `Role` enum يتحول من/إلى قيم wire الحرفية (`'GODFATHER'`...) وأسماؤه العربية وإيموجيه مطابقة حرفياً لجدول §4.10، وأسماء العرض تُقرأ من `PHASE_NAMES` عبر `GamePhase` (11 قيمة، المعرّف في 02 §8.1) — مع اسم احتياطي لـ `DAY_ELIMINATION`، و`formatPlayer(5, 'أحمد')` يعيد `#5 - أحمد`.
- [ ] `resolveUploadUrl('/uploads/x.png')` يعيد `https://club-mafia.grade.sbs/uploads/x.png` في prod، ويمرر الروابط المطلقة دون تغيير.
- [ ] بوابة الإصدار v1: تغيير رقم إصدار التطبيق يمسح كاشات Hive المحددة عند أول إقلاع (اختبار يدوي بترقية build).
- [ ] Window Size Classes: على هاتف (< 600dp) عمود واحد؛ على تابلت 8 إنش يتقيد المحتوى النصي بـ 640dp ويتمركز؛ على تابلت 11 إنش سقف 960dp و`gameScale = 1.5` (شاشة معرض debug تعرض التوكنات الحالية).
- [ ] portrait مقفول على الهاتف والتابلت في المنصتين.
- [ ] status bar شفاف بأيقونات فاتحة فوق `#050505` على Android وiOS.

---

## 13. ملاحظات أداء وأمان

**أداء:**
- **NoiseOverlay**: صورة مبلّطة ثابتة داخل `RepaintBoundary` — يمنع إعادة رسمها مع كل إطار للشاشات المتحركة. ممنوع CustomPainter يولّد ضجيجاً runtime.
- **Vignettes**: `DecoratedBox` بتدرجات شعاعية — رخيصة GPU؛ لا صور ضخمة ولا shaders مخصصة.
- **BackdropFilter (البلور)**: مكلف على Android الضعيف — بدّله بخلفيات شبه معتمة (`#0C0C0C @ 90–95%`) حيثما كان البلور تجميلياً فقط (لوحات، بوابات)؛ أبقه فقط إن ثبت قياسياً أنه لا يُسقط الإطارات على أضعف جهاز مستهدف.
- **GlitchText**: أنيميشنات لانهائية — استخدمه فقط عندما يكون النص ظاهراً فعلاً (أوقف الـ controllers عند عدم الظهور).
- **flutter_animate اللانهائية (glow/pulseSlow)**: أوقفها عند خروج الويدجت من الشجرة/الشاشة (تُدار تلقائياً بالـ dispose لكن انتبه للقوائم الطويلة — لا توهج لانهائياً داخل ListView كبيرة).
- الخطوط المحلية تلغي وميض FOUT/تأخير الشبكة الموجود في الويب.
- شجرة الثيم تُبنى مرة واحدة (`buildNoirTheme()` const حيث أمكن) — لا إعادة بناء ThemeData عند التنقل.

**أمان:**
- لا أسرار في هذا الملف: `baseUrl` علني بطبيعته. التوكنات في `flutter_secure_storage` (ملف 05) — **ممنوع** وضع أي توكن في `shared_preferences` أو Hive غير المشفر.
- كل الاتصال HTTPS حصراً (الـ flavors كلاهما https) — فعّل `android:usesCleartextTraffic="false"` واترك ATS الافتراضي في iOS. لا استثناءات cleartext حتى للتطوير (staging نفسه https).
- Certificate pinning غير مطبق في الويب — لا يُضاف في v1 (تكافؤ أولاً)، ويمكن دراسته لاحقاً.
- `resolveUploadUrl` يجب ألا يسمح بأصل مختلف عن `config.baseUrl` للروابط النسبية (منع حقن مضيف عبر حمولة خبيثة تبدأ بـ `//evil.com/...` — طبّع المسار قبل الإلحاق).
- سجلات debug (`debugPrint`) يجب ألا تطبع حمولات تحمل توكنات — قاعدة عامة تُفرض من هنا على كل الطبقات.
