# 90 — إصدار Android: التوقيع، Play Console، الأذونات، App Links

> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

---

## 1. الهدف والنطاق

هذا الملف هو **الدليل التنفيذي خطوةً-بخطوة لإصدار تطبيق اللاعب على Android** حتى Google Play، بحيث ينفّذه مطوّر لم يبنِ التطبيق بنفسه دون الرجوع لأي مصدر آخر. يغطّي:

1. **التوقيع الكامل**: إنشاء upload keystore + تفعيل Play App Signing + استخراج بصمات SHA-256 اللازمة لـ App Links.
2. **إعداد Gradle**: `applicationId` = **`sbs.grade.mafiaclub`** (مثبَّت للأبد)، `minSdkVersion 23`، `namespace`، `versionCode`/`versionName`، flavors (dev/prod)، signingConfigs، minify/R8.
3. **ربط Firebase**: تسجيل تطبيق Android في مشروع `mafia-b1c74` + وضع `google-services.json` + مكوّنات Gradle الإضافية (google-services + Crashlytics).
4. **القائمة الكاملة للأذونات** في `AndroidManifest.xml` مع سبب كل إذن وأي منها وقت-تشغيل.
5. **App Links**: `intent-filter` مع `autoVerify` + ملف `assetlinks.json` على `club-mafia.grade.sbs` (طريقة النشر الصحيحة حسب البنية الفعلية) + فحوص التحقق.
6. **صفحة المتجر**: النصوص الحرفية للاسم/الوصف، لقطات الشاشة (هاتف + تابلت)، سياسة الخصوصية، نموذج Data Safety.
7. **الإطلاق التدريجي**: مسارات الاختبار (Internal → Closed → Production) + النشر المرحلي بالنِّسَب + إيقاف الطرح.
8. **فحص ما قبل الرفع**: قائمة تحقّق تشغيلية إلزامية قبل كل `.aab`.

**خارج النطاق (ملفات أخرى):**
- منطق FCM/الأذونات وقت التشغيل والبوابات الحاجبة ونصوصها → `06-push-notifications.md` (هذا الملف يوفّر: `google-services.json`، إعلان `POST_NOTIFICATIONS` في الـ Manifest، أيقونة `ic_stat_mafia`، القناة الافتراضية في الـ Manifest).
- محتوى ملفَي `assetlinks.json`/`apple-app-site-association` وجدول التوجيه → `08-deeplinks-routing.md` (هذا الملف يوفّر: البصمات، طريقة النشر الفعلية على الإنتاج، وفحوص القبول).
- بوابة الإصدار الأدنى وشاشة «حدّث التطبيق» → `11-shell-navigation.md` (هنا فقط: استراتيجية `versionCode`).
- الثيم/الخطوط/Splash/الأيقونة كتوليد أصول → `01-foundation-theme.md` (هنا فقط: أمر التوليد وربطه بالبناء).
- كل ما يخص iOS → `91-release-ios.md`.

**مبدأ حاكم**: التطبيق عميل ثانٍ لنفس الـ backend. لا يُغيَّر أي عقد؛ الإضافتان الخادميتان الوحيدتان المتعلقتان بهذا الملف هما نشر `assetlinks.json` (§7) وتسجيل توكن FCM أصلي (لا تغيير مطلوب فعلياً — تم التحقق في §2).

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

| الملف | ما يؤخذ منه |
|---|---|
| `unified-mafia/frontend/public/manifest.json` | الاسم الحرفي `"Mafia Club — نادي المافيا"`، الاسم القصير `"Mafia Club"`، الوصف `"نظام متطور لإدارة ألعاب المافيا الهجينة"`، `orientation: "portrait"`، `theme/background_color: "#050505"`، `categories: ["games","entertainment"]`، الأيقونات maskable 512/192 |
| `unified-mafia/frontend/public/icons/icon-512x512.png` و`icon-192x192.png` | مصدر أيقونة المشغّل (maskable) لتوليد `flutter_launcher_icons` |
| `unified-mafia/frontend/public/mafia_logo.png` | الأيقونة الكبيرة للإشعار + مصدر Splash + بديل شعار الأيقونة |
| `unified-mafia/frontend/src/app/layout.tsx` (سطر 25) | ثابت `APP_VERSION = '2.5.0'` — مرجع بوابة الإصدار الحالية في الـ PWA (يُحوَّل لاستراتيجية `versionCode` — §6.5) |
| `unified-mafia/frontend/public/sw.js` (سطور ~64–70) | إعدادات Firebase الويب الحرفية: مشروع `mafia-b1c74`، sender/projectNumber `557623626620`، appId ويب `1:557623626620:web:6f01e44a6d165008d032f9`، apiKey ويب `AIzaSyCPsBtXEVEP0aV2kMfFJJ0za-vbXr891Eo` — **قيم الويب فقط؛ قيم Android تأتي من google-services.json (§4)** |
| `unified-mafia/backend/src/routes/player-notification.routes.ts` (سطور 20–29) | مسار `POST /register-token` يقبل `{token, deviceInfo, deviceId}` ويمرّرها لـ `registerPlayerToken` بلا أي تمييز `fcm`/`webpush` على مستوى المسار → **توكن FCM الأصلي يعمل كما هو بلا تغيير backend** (تم التحقق) |
| `unified-mafia/backend/src/services/fcm.service.ts` | `registerPlayerToken` (dedup بالـ deviceId) + `buildFCMPayload` (data-only + apns) — يُرسل عبر `firebase-admin` الذي يدعم توكنات الموبايل أصلاً |
| `unified-mafia/context/DEPLOYMENT.md` (سطور 177–180، 569–570) | **بنية الإنتاج الفعلية**: `club-mafia.grade.sbs` عبر Cloudflare Tunnel → `http://127.0.0.1:3010` (حاوية Next.js standalone) — **لا nginx أمام الإنتاج** (يصحّح افتراض §7.5 في 08) |
| `unified-mafia/frontend/next.config.js` | `output: 'standalone'` + rewrites تحوّل `/api`, `/socket.io`, `/uploads` للـ backend فقط — **بقية المسارات (بما فيها `/.well-known/*` و`public/`) يخدمها Next مباشرة** |

---

## 3. التبعيات على ملفات الخطة الأخرى

| الملف | الاعتماد |
|---|---|
| `00-MASTER-PLAN.md` | قرار `applicationId = sbs.grade.mafiaclub`، flavors dev/prod، مشروع Firebase `mafia-b1c74`، الإضافات الخادمية الأربع |
| `01-foundation-theme.md` | توليد الأيقونة والـ Splash (`flutter_launcher_icons`, `flutter_native_splash`) من `mafia_logo.png`/أيقونات manifest؛ ألوان الهوية |
| `06-push-notifications.md` | يستهلك `google-services.json` وإعلان `POST_NOTIFICATIONS` وأيقونة `ic_stat_mafia` والقناة `mafia_default` وميتاداتا FCM في الـ Manifest (§4.3، §4.5 هنا) |
| `07-sound-system.md` و`31-voice-realtimekit.md` | أذونات `RECORD_AUDIO`/`BLUETOOTH_CONNECT`/`MODIFY_AUDIO_SETTINGS`/(اختياري) `FOREGROUND_SERVICE_MICROPHONE` — تُضاف هنا وتُفعَّل وظيفياً هناك |
| `08-deeplinks-routing.md` | محتوى `assetlinks.json` (§7.5-أ فيه = القانوني)؛ هنا: البصمات وطريقة النشر الفعلية والفحوص |
| `11-shell-navigation.md` | بوابة الإصدار الأدنى («حدّث التطبيق») — هنا فقط استراتيجية `versionCode` التصاعدية |
| `13-profile.md` | إذن الكاميرا/الوسائط لاختيار الأفاتار (`image_picker`) |
| `91-release-ios.md` | نظير iOS (Bundle ID مطابق، APNs، Universal Links، TestFlight) |
| `92-qa-parity.md` | بنود القبول §12 تُرحَّل إليه؛ فحص App Links إلزامي كل إصدار |

---

## 4. الواجهة والتجربة تفصيلياً — (إعداد بناء، لا واجهة تشغيل)

> هذا الملف لا يُنتج شاشات وقت تشغيل (البوابات/الشاشات ملك ملفاتها). «الواجهة» هنا هي مخرجات مرئية للمستخدم يملكها الإصدار: **أيقونة المشغّل، شاشة البدء (Splash)، أيقونة الإشعار، وصفحة المتجر**. تُنقل نصوصها/أصولها حرفياً.

### 4.1 أيقونة المشغّل (Launcher Icon)

- المصدر: `frontend/public/icons/icon-512x512.png` (maskable) — يُنسخ إلى `assets/launcher/icon-512.png`.
- التوليد عبر `flutter_launcher_icons` (تُشغَّل مرة عند الإعداد وعند أي تغيير للأصل):
  ```yaml
  # flutter_launcher_icons.yaml (أو ضمن pubspec)
  flutter_launcher_icons:
    android: true
    ios: true
    image_path: "assets/launcher/icon-512.png"
    adaptive_icon_background: "#050505"      # خلفية الهوية (Dark Noir)
    adaptive_icon_foreground: "assets/launcher/icon-foreground-512.png"
    min_sdk_android: 23
  ```
  - `icon-foreground-512.png`: نسخة الشعار على شفاف مع هامش أمان ~18% (منطقة القص الآمنة لـ adaptive icon) — تُشتق من `icon-512x512.png` وهو أصلاً maskable.
  - أمر التنفيذ: `dart run flutter_launcher_icons`.
- الناتج على Android: `mipmap-anydpi-v26/ic_launcher.xml` (adaptive) + طبقات لكل كثافة (mdpi→xxxhdpi). **لا يُحرَّر يدوياً** — يُعاد التوليد.

### 4.2 شاشة البدء (Splash)

- عبر `flutter_native_splash` من `mafia_logo.png` على خلفية `#050505` (مطابق `background_color` في manifest):
  ```yaml
  flutter_native_splash:
    color: "#050505"
    image: "assets/launcher/mafia_logo.png"
    android_12:
      color: "#050505"
      image: "assets/launcher/mafia_logo_192.png"   # Android 12+ يقص لدائرة — استعمل صيغة محاطة بهامش
  ```
  - أمر التنفيذ: `dart run flutter_native_splash:create`.
  - على Android 12+ يُدار عبر `SplashScreen` API (النظام يعرض الأيقونة داخل دائرة) — لا نص، لا spinner (spinner التطبيق يبدأ بعد `runApp`).

### 4.3 أيقونة الإشعار (تكامل مع 06)

- `ic_stat_mafia`: monochrome أبيض على شفاف، لكل كثافة (mdpi→xxxhdpi)، توضع في `android/app/src/main/res/drawable-*/`. **إلزامي** (Android يرفض الأيقونة الملونة للأيقونة الصغيرة). مواصفتها الكاملة في `06-push-notifications.md §11` وتوليدها في `01`.
- تُعلَن في الـ Manifest (§4.5) كأيقونة إشعار FCM الافتراضية + لون accent `#8A0303` (من 06 §4.7).

### 4.4 صفحة متجر Google Play (النصوص الحرفية)

| الحقل | القيمة (حرفياً حيث لها مصدر) |
|---|---|
| اسم التطبيق (App name، حد 30 حرفاً) | **`Mafia Club — نادي المافيا`** (من `manifest.name`) — إن تجاوز 30 حرفاً بصرياً في Console استعمل `نادي المافيا Mafia Club` مع إبقاء الكلمات نفسها |
| الوصف القصير (Short description، حد 80) | **`نظام متطور لإدارة ألعاب المافيا الهجينة`** (من `manifest.description` حرفياً) |
| الوصف الكامل (Full description، حد 4000) | يُبنى حول نفس المعنى (لا يوجد مصدر حرفي أطول): يذكر أن اللعب داخل نادٍ فعلي، الأدوار، الرتب، الحجوزات — بالعربية RTL. **لا اختلاق ميزات غير موجودة.** |
| الفئة | Games → **`Board`** (أو `Card`)؛ نوع المحتوى: لعبة اجتماعية |
| الوسوم/التصنيفات | مطابقة manifest: `games`, `entertainment` |
| لغة القائمة الافتراضية | **العربية (ar)** + (اختياري) الإنجليزية |
| البريد/الموقع | بريد الدعم + رابط سياسة الخصوصية (§4.4.2) |

**4.4.1 لقطات الشاشة (أصول رفع — تُلتقط من التطبيق الفعلي):**
- هاتف: **2–8 لقطات** (إلزامي ≥ 2)، نسبة 16:9 أو 9:16، حد أدنى للبُعد 320px، أقصى 3840px.
- **تابلت 7 إنش + تابلت 10 إنش**: مجموعتان منفصلتان — **إلزامي لعرض التطبيق كـ«مُحسَّن للتابلت»** في المتجر وإلا يُخفَّض ترتيبه على أجهزة التابلت (انظر §5).
- Feature Graphic: `1024×500` PNG/JPG (شعار على خلفية `#050505`).
- أيقونة المتجر: `512×512` PNG (32-bit، من نفس أصل الأيقونة).

**4.4.2 سياسة الخصوصية (Privacy Policy):**
- رابط عام مستضاف على الدومين (مقترح: `https://club-mafia.grade.sbs/privacy` — صفحة Next عامة تُنشأ ضمن الـ frontend). إلزامي لأن التطبيق يطلب أذونات حساسة (إشعارات، ميكروفون).

**4.4.3 نموذج Data Safety (إلزامي قبل النشر):**
- البيانات المجموعة/المشتركة (من §12.3 في الخطة الأم): **هاتف، اسم، صورة (أفاتار)، إحصاءات لعب**.
- الأذونات الحساسة المعلنة: الإشعارات، الميكروفون (الصوت عن بُعد)، (اختياري) الكاميرا/الوسائط.
- التشفير أثناء النقل: **نعم** (HTTPS)؛ آلية حذف الحساب: تُوصف إن وُجدت.

---

## 5. التكيّف مع الشاشات 6→11 إنش

طبقة الإصدار لا تُنتج تخطيطاً متكيّفاً وقت التشغيل (ذلك ملك ملفات الميزات + `01-foundation-theme.md`). لكن **لهذا الملف مسؤولية شاشة-حجمية حقيقية واحدة قابلة للتعليم**: مجموعات لقطات المتجر وسلوك القفل الاتجاهي.

- **compact (< 600dp — هواتف 6–7 إنش):** مجموعة لقطات «Phone» إلزامية (≥ 2). هي الحد الأدنى للنشر.
- **medium (600–840dp — تابلت 8 إنش):** يجب رفع مجموعة لقطات «7-inch tablet» في Console. تُلتقط بعد أن يطبّق كل ملف ميزة قواعد §5 الخاصة به (سقوف عرض 640dp، رفع أعمدة الشبكات) — بحيث تُظهِر اللقطات تخطيط medium الفعلي لا هاتفاً ممطوطاً.
- **expanded (> 840dp — تابلت 10–11 إنش):** يجب رفع مجموعة لقطات «10-inch tablet». تُظهِر سقوف 840–960dp وتكبير عناصر اللعب (البطاقات/المؤقتات) — دليل «مُحسَّن للتابلت» أمام مراجع Google والمستخدم.
- **القفل الاتجاهي (كل الفئات):** `portrait` مقفول عبر التطبيق (تكافؤ `manifest.orientation: "portrait"`) — يُطبَّق برمجياً بـ `SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp])` (تفصيله في 01/11)، ولا يُقفَل في الـ Manifest بـ `android:screenOrientation` كي لا يُكسر تكيّف التابلت بالعرض المنطقي. **لا two-pane في هذا الملف.**
- تنبيه Play Console: إن غابت لقطات التابلت يظهر تحذير «App isn't optimized for tablets/large screens» ويُخفَّض الظهور على تلك الأجهزة — بند قبول §12.

---

## 6. المنطق والتدفقات — خطوات التنفيذ بالترتيب

### 6.0 تسلسل الإعداد الكامل (نظرة علوية)

```
1. تثبيت أدوات (Android Studio + JDK 17 + Flutter)   → §6.1
2. ضبط build.gradle (appId, minSdk, flavors, namespace) → §6.2
3. إنشاء upload keystore + key.properties + signingConfigs → §6.3
4. تسجيل تطبيق Android في Firebase + google-services.json + مكوّنات Gradle → §6.4
5. الأذونات + App Links + ميتاداتا FCM في AndroidManifest.xml → §7 + §6.6
6. minify/R8 + قواعد keep → §6.7
7. أول بناء AAB موقّع → رفع أولي لـ Internal testing → تفعيل Play App Signing → §6.8
8. استخراج بصمة Play App Signing (SHA-256) → نشر assetlinks.json → §7
9. فحص App Links (adb) → §7.6
10. صفحة المتجر + Data Safety + سياسة الخصوصية → §4.4
11. ترقية المسارات: Closed → Production بنشر مرحلي → §6.9
```

### 6.1 المتطلبات المسبقة

- حساب **Google Play Console** (رسم لمرة واحدة **25$**) — يُفتح فوراً (لا يحتاج انتظاراً كـ Apple).
- Android Studio + **JDK 17** (اللازم لـ AGP الحديث) + Flutter SDK بالإصدار المثبَّت في `01`.
- جهاز Android حقيقي واحد على الأقل بـ **Google Play Services** لاختبار FCM/التوكن (المحاكي بصورة Google APIs يكفي للتطوير، والجهاز الحقيقي إلزامي للقبول).

### 6.2 إعداد `android/app/build.gradle`

القيم الثابتة (من الخطة الأم — لا تُغيَّر بعد أول رفع):

```groovy
android {
    namespace "sbs.grade.mafiaclub"
    compileSdk 35                       // أحدث مستقر (أو flutter.compileSdkVersion)
    ndkVersion flutter.ndkVersion

    defaultConfig {
        applicationId "sbs.grade.mafiaclub"   // ⚠️ مثبَّت للأبد — لا يتغيّر
        minSdkVersion 23                       // قرار الخطة
        targetSdkVersion 35                    // أحدث مستقر مطلوب من Play
        versionCode flutterVersionCode.toInteger()   // تصاعدي — §6.5
        versionName flutterVersionName               // "1.0.0" مبدئياً
        multiDexEnabled true                          // احتياط (Firebase + كثرة الحزم مع minSdk 23)
    }

    // flavors dev/prod (مطابقة 00-MASTER-PLAN §3.1)
    flavorDimensions "env"
    productFlavors {
        dev  {
            dimension "env"
            applicationIdSuffix ".dev"        // sbs.grade.mafiaclub.dev — تثبيت جنبَ الإنتاج
            resValue "string", "app_name", "Mafia Club (dev)"
            // baseUrl = https://mafia.grade.sbs (staging) — من AppConfig في entrypoint الـ flavor (01/03، لا --dart-define)
        }
        prod {
            dimension "env"
            resValue "string", "app_name", "Mafia Club"
            // baseUrl = https://club-mafia.grade.sbs
        }
    }

    signingConfigs { /* §6.3 */ }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

- **مخرَج الإصدار = App Bundle (`.aab`) لا APK**: `flutter build appbundle --flavor prod --release`. (Play يتطلب `.aab` للتطبيقات الجديدة.)
- `applicationIdSuffix .dev` يتيح تثبيت نسخة staging مع الإنتاج على نفس الجهاز؛ **حزمة الإنتاج بلا suffix** = `sbs.grade.mafiaclub` (هي التي تُسجَّل في assetlinks/Firebase).
- التطبيق **بلا `android:screenOrientation`** في الـ Manifest (§5).

### 6.3 التوقيع — upload keystore + Play App Signing

**خطوة 1 — أنشئ upload keystore** (يُحفظ خارج المستودع + نسخة احتياطية آمنة؛ فقدانه = فقدان القدرة على رفع تحديثات بنفس المفتاح):
```bash
keytool -genkey -v \
  -keystore ~/mafia-upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias mafiaclub-upload
```
احفظ كلمات المرور والـ alias في مدير أسرار.

**خطوة 2 — `android/key.properties`** (❌ يُضاف لـ `.gitignore`):
```properties
storePassword=********
keyPassword=********
keyAlias=mafiaclub-upload
storeFile=/absolute/path/to/mafia-upload-keystore.jks
```

**خطوة 3 — حمّله في `build.gradle`** (قبل `android {`):
```groovy
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```
```groovy
signingConfigs {
    release {
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
        storeFile keystoreProperties['storeFile'] ? file(keystoreProperties['storeFile']) : null
        storePassword keystoreProperties['storePassword']
    }
}
```

**خطوة 4 — فعِّل Play App Signing** (يُفعَّل عند إنشاء التطبيق في Console): عند رفع أول `.aab` اختر **«Use Play App Signing»** (الافتراضي والموصى به). النتيجة:
- Google يولّد ويحفظ **مفتاح توقيع التطبيق النهائي (app signing key)** — وهو المثبَّت على أجهزة المستخدمين.
- keystore الخاص بك يصبح **upload key** فقط (لتوقيع ما ترفعه؛ قابل لإعادة الإصدار عبر الدعم إن فُقد).

**خطوة 5 — `.gitignore`** (تأكيد): `key.properties`, `*.jks`, `*.keystore`, `android/app/google-services.json`.

### 6.4 ربط Firebase (Android داخل مشروع `mafia-b1c74`)

**خطوة 1** — في كونسول Firebase → المشروع `mafia-b1c74` → «Add app» → Android:
- Android package name: **`sbs.grade.mafiaclub`** (حزمة الإنتاج بلا suffix).
- (اختياري لـ FCM؛ إلزامي فقط لو أُضيف Google Sign-In/App Check لاحقاً) SHA-1/SHA-256 — **FCM لا يتطلبها**، فتُترك أو تُضاف من §7.4.
- (اختياري) سجّل حزمة `sbs.grade.mafiaclub.dev` كتطبيق Android ثانٍ لبيئة dev بملف google-services خاص بها إن أردت فصل التوكنات؛ وإلا اكتفِ بالإنتاج.

**خطوة 2** — نزّل **`google-services.json`** وضعه في `android/app/google-services.json` (❌ خارج git). هذا الملف يحوي **appId الخاص بـ Android** (بصيغة `1:557623626620:android:...`) و`apiKey` الخاص بـ Android — **لا تُخترع ولا تُنسخ قيم الويب**؛ project number `557623626620` هو نفسه (رقم المشروع).

**خطوة 3** — مكوّنات Gradle:
- `android/build.gradle` (المستوى الأعلى / `settings.gradle` حسب قالب Flutter):
  ```groovy
  plugins {
      id 'com.google.gms.google-services' version '4.4.2' apply false
      id 'com.google.firebase.crashlytics' version '3.0.2' apply false
  }
  ```
- `android/app/build.gradle`:
  ```groovy
  plugins {
      id 'com.android.application'
      id 'kotlin-android'
      id 'dev.flutter.flutter-gradle-plugin'
      id 'com.google.gms.google-services'
      id 'com.google.firebase.crashlytics'   // من 00-MASTER-PLAN (Crashlytics موصى به)
  }
  ```
- التهيئة البرمجية (`Firebase.initializeApp`) وملفات `firebase_options.dart` تُولَّد بـ **FlutterFire CLI** (`flutterfire configure --project=mafia-b1c74`) — تفصيل الاستدعاء في `06`. هنا فقط ضمان وجود الملفات وربط الـ plugins.

### 6.5 استراتيجية `versionCode`/`versionName`

- `versionName` نصّي للمستخدم (يبدأ `1.0.0`).
- `versionCode` عدد صحيح **تصاعدي حصراً** (Play يرفض إعادة استعمال أو تنازل). مقترح: مشتق من `pubspec.yaml` (`version: 1.0.0+1` → الجزء بعد `+` هو الـ code).
- **ربط ببوابة الإصدار الأدنى** (`minSupportedBuild` — ملك 11): الخادم يعيد أدنى `build` مقبول؛ التطبيق يقارنه بـ `versionCode` الحالي (عبر `package_info_plus`) ويعرض «حدّث التطبيق» غير القابلة للتجاوز إن كان أقل. **هذا يستبدل بوابة `APP_VERSION='2.5.0'`** ذات مسح-الكاش في الـ PWA (لا مقابل native — التحديث عبر المتجر). لا تُطبَّق آلية مسح الكاش إطلاقاً.

### 6.6 ميتاداتا FCM في الـ Manifest (تكامل 06)

داخل `<application>` في `AndroidManifest.xml`:
```xml
<meta-data
    android:name="com.google.firebase.messaging.default_notification_channel_id"
    android:value="mafia_default" />
<meta-data
    android:name="com.google.firebase.messaging.default_notification_icon"
    android:resource="@drawable/ic_stat_mafia" />
<meta-data
    android:name="com.google.firebase.messaging.default_notification_color"
    android:resource="@color/mafia_accent" />   <!-- #8A0303 (colors.xml) -->
```
> القناة نفسها (`mafia_default`) تُنشأ برمجياً في `main()` عبر `flutter_local_notifications` (06 §10.2) — الميتاداتا هنا احتياط لعرض النظام حين لا يكون التطبيق قد أنشأها بعد.

### 6.7 minify / R8 وقواعد keep

`android/app/proguard-rules.pro`:
```proguard
# Flutter
-keep class io.flutter.** { *; }
# Firebase Messaging + Crashlytics (عادة يوفّرها الـ consumer rules، لكن للتأكيد)
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**
# flutter_local_notifications (GSON/receivers)
-keep class com.dexterous.** { *; }
# socket_io_client / dio: لا حاجة عادةً (Dart-side)؛ أضف قواعد أي SDK أصلي (RealtimeKit) حسب 31
```
- إبقاء أسطر Crashlytics symbolication: عدم تعطيل `mappingFileUploadEnabled` (رفع خريطة إزالة التشويش تلقائياً عبر plugin الإصدار 3.x).

### 6.8 أول بناء ورفع

```bash
flutter build appbundle --flavor prod --release
# المخرَج: build/app/outputs/bundle/prodRelease/app-prod-release.aab
```
- ارفعه إلى مسار **Internal testing** أولاً (أسرع مراجعة، حتى 100 مختبِر بالبريد). عند أول رفع فعّل Play App Signing (§6.3-خطوة4).
- بعد الرفع الأول تصبح **بصمة SHA-256 لمفتاح Play App Signing** متاحة (§7.4) → أكمل نشر assetlinks.

### 6.9 الإطلاق التدريجي (Staged Rollout)

الترتيب الموصى به:
1. **Internal testing** — فريق داخلي؛ تحقّق من الدخول/السوكِت/الإشعار/الرابط العميق على أجهزة حقيقية.
2. **Closed testing** (Alpha/Beta) — مجموعة مختبرين موسّعة؛ إلزامي للحسابات الجديدة: Google يشترط اختباراً مغلقاً قبل الإنتاج (عدد مختبرين ومدّة حسب سياسة الحساب وقت النشر).
3. **Production بنشر مرحلي (Staged rollout)** — ابدأ بنسبة صغيرة ثم ارفعها: **10% → 20% → 50% → 100%**، مع مراقبة Crashlytics/تقييمات Play بين كل مرحلة.
4. **إيقاف الطرح (Halt rollout)** متاح فوراً من Console إن ظهر عطل حرج — يوقف وصول النسخة لمستخدمين جُدد.
- التزامن مع الـ PWA: تبقى الـ PWA عاملة بالتوازي (قاعدة «لا كسر للعقود») حتى إيقافها رسمياً.

---

## 7. عقود التكامل — App Links وملفات الدومين

### 7.1 REST — لا شيء يملكه هذا الملف

لا endpoints. المسار الوحيد ذو الصلة (`POST /api/player-notifications/register-token`) يملكه `06`؛ تأكيد التحقق: يقبل توكن FCM الأصلي بلا تغيير (§2).

### 7.2 Socket — لا شيء.

### 7.3 `intent-filter` لـ App Links (في `AndroidManifest.xml`)

داخل `<activity android:name=".MainActivity">`:
```xml
<meta-data android:name="flutter_deeplinking_enabled" android:value="true" />

<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
        android:scheme="https"
        android:host="club-mafia.grade.sbs"
        android:pathPrefix="/join/" />
</intent-filter>
```
- النمط **`/join/`** فقط (قرار الخطة، مخاطرة #8): عدم اختطاف `/player/*` كي لا يُسرق روابط الويب من مستخدمي الـ PWA.
- `autoVerify="true"` يجعل Android 12+ يتحقق آلياً من `assetlinks.json` عند التثبيت.
- **بلا حزمة `app_links`** — يُعتمد الاستقبال المدمج في Flutter/go_router (قرار 08 §6.6) لتجنّب الاستقبال المزدوج.

### 7.4 استخراج بصمات SHA-256 لـ `assetlinks.json`

يجب إدراج **بصمتين**:
1. **مفتاح Play App Signing** (الإلزامي للإنتاج — هو المثبَّت على أجهزة المستخدمين): بعد أول رفع، من **Play Console → Test and release → App integrity → App signing key certificate → SHA-256**. انسخها كما هي (صيغة `AA:BB:...`).
2. **مفتاح upload/debug** (للتطوير والاختبار الداخلي/Internal app sharing):
   ```bash
   keytool -list -v -keystore ~/mafia-upload-keystore.jks -alias mafiaclub-upload
   # أو من مجلد android/:
   ./gradlew signingReport
   ```
> إن فُصلت بيئة staging (`mafia.grade.sbs`) لاحقاً، فلها ملفا تحقّق منفصلان ببصماتها (08 §13). بصمة debug تُحذف من ملف الإنتاج النهائي إن رغبتم بتشديد.

### 7.5 محتوى ونشر `assetlinks.json`

**المحتوى الحرفي (القانوني في 08 §7.5-أ):**
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "sbs.grade.mafiaclub",
      "sha256_cert_fingerprints": [
        "<SHA-256 لمفتاح Play App Signing — من App integrity>",
        "<SHA-256 لمفتاح upload/debug>"
      ]
    }
  }
]
```
يجب تقديمه بـ **HTTP 200**، `Content-Type: application/json`، **بلا redirect**، بلا مصادقة، على `https://club-mafia.grade.sbs/.well-known/assetlinks.json`.

**⚠️ طريقة النشر الصحيحة (تصحيح لافتراض nginx في 08):** بحسب `DEPLOYMENT.md`، الإنتاج `club-mafia.grade.sbs` يمر عبر **Cloudflare Tunnel → حاوية Next.js standalone مباشرة (127.0.0.1:3010)** — **لا nginx أمامه**، و`next.config.js` لا يعيد توجيه إلا `/api`, `/socket.io`, `/uploads`. لذا:

- **الطريقة المعتمدة (تطابق البنية الفعلية):** ضع الملف في مجلد الـ frontend العام:
  `unified-mafia/frontend/public/.well-known/assetlinks.json`
  Next.js يخدم `public/` من الجذر تلقائياً → يظهر على `https://club-mafia.grade.sbs/.well-known/assetlinks.json` بعد إعادة بناء/نشر صورة الـ frontend. يُضاف تعديل `Content-Type` إن لزم عبر `headers()` في `next.config.js`:
  ```js
  async headers() {
    return [{
      source: '/.well-known/assetlinks.json',
      headers: [{ key: 'Content-Type', value: 'application/json' }],
    }, {
      source: '/.well-known/apple-app-site-association',
      headers: [{ key: 'Content-Type', value: 'application/json' }],
    }];
  }
  ```
  > Service Worker الحالي للـ PWA لا يؤثر على تحقّق Google (زواحف Google تجلب الملف من خوادمها بلا SW). كذلك network-first يجلبه طازجاً للمتصفح.
- **الطريقة البديلة (إن أُدخلت طبقة nginx مستقبلاً أو على staging):** مقتطف alias في 08 §7.5-ج (`/var/www/mafia-wellknown/`). صالحة فقط حيث يوجد nginx فعلاً — ليس في الإنتاج الحالي.
- ملف iOS المصاحب `apple-app-site-association` يُنشر بنفس الآلية (محتواه في 08 §7.5-ب / التفعيل في 91).

### 7.6 فحوص التحقق (بعد النشر + بعد التثبيت)

```bash
# 1) الملف يُقدَّم صحيحاً (200 + JSON، بلا redirect):
curl -sSL -D - https://club-mafia.grade.sbs/.well-known/assetlinks.json

# 2) بعد تثبيت نسخة موقّعة بمفتاح Play App Signing (Internal testing):
adb shell pm get-app-links sbs.grade.mafiaclub          # يجب أن تظهر: verified

# 3) محاكاة فتح الرابط:
adb shell am start -a android.intent.action.VIEW \
  -d "https://club-mafia.grade.sbs/join/TEST" \
  sbs.grade.mafiaclub
# يجب أن يفتح التطبيق على PlayerFlow بالكود TEST — لا المتصفح.

# 4) أداة Google الرسمية للتحقق من الربط:
# https://developers.google.com/digital-asset-links/tools/generator
```
- إن فشل التحقق (بصمة خاطئة/ملف ناقص/redirect) يفتح الرابطُ المتصفحَ بصمت — **بند قبول 12.9 إلزامي في كل إصدار**.
- ملاحظة: البناء المحلي (debug/upload) لن يُحقَّق إلا إذا كانت بصمته مدرجة في الملف — لذلك أُدرجت بصمة upload/debug (§7.4).

---

## 8. نماذج Dart المطلوبة

**لا نماذج Dart جديدة يملكها هذا الملف** — إعداد بناء/توقيع/نشر بحت. القيم التي يقرأها التطبيق وقت التشغيل (وتُستهلك في ملفات أخرى):

```dart
// تُقرأ عبر package_info_plus (يستهلكها 06 التشخيص و11 بوابة الإصدار):
//   packageInfo.packageName  → "sbs.grade.mafiaclub" (prod) / "...dev" (dev)
//   packageInfo.version      → versionName  (مثال "1.0.0")
//   packageInfo.buildNumber  → versionCode  (يُقارَن بـ minSupportedBuild — ملك 11)

// baseUrl لكل flavor (يُعرّف في 01/03 عبر AppConfig في entrypoint الـ flavor — لا --dart-define):
//   dev  → https://mafia.grade.sbs
//   prod → https://club-mafia.grade.sbs
```
> ثوابت المسارات وثابت `appHost = 'club-mafia.grade.sbs'` معرّفة في `08-deeplinks-routing.md §8`.

---

## 9. الحزم المستخدمة

| الحزمة | الغرض في سياق الإصدار |
|---|---|
| `flutter_launcher_icons` (dev) | توليد أيقونة المشغّل (adaptive) من أيقونة manifest — §4.1 |
| `flutter_native_splash` (dev) | توليد Splash من `mafia_logo.png` — §4.2 |
| `firebase_core`, `firebase_messaging` | تربط `google-services.json` وميتاداتا FCM — الملكية 06 |
| `firebase_crashlytics` | مراقبة الأعطال + رفع خريطة إزالة التشويش (R8) — §6.7 |
| `package_info_plus` | `packageName`/`versionName`/`versionCode` لبوابة الإصدار والتشخيص |
| **بلا `app_links`** | يُعتمد الاستقبال المدمج (§7.3، قرار 08) |

أدوات (خارج pubspec): Android Studio، JDK 17، **FlutterFire CLI** (`flutterfire configure`)، `keytool`، `adb`، `gradlew`.

---

## 10. اختلافات Android / iOS

هذا الملف **خاص بـ Android بالكامل**؛ نظيره iOS في `91-release-ios.md`. أبرز الفروق على مستوى الإصدار (تُذكر للتباين فقط، والتفصيل في 91):

| المجال | Android (هذا الملف) | iOS (91) |
|---|---|---|
| هوية التطبيق | `applicationId sbs.grade.mafiaclub` + `namespace` | Bundle ID مطابق `sbs.grade.mafiaclub` |
| التوقيع | upload keystore + **Play App Signing** (Google يحفظ المفتاح النهائي) | شهادات Apple + Provisioning Profiles + توقيع Xcode |
| التوزيع | Play Console (25$ مرة واحدة)، `.aab` | Apple Developer (99$/سنة)، TestFlight، مراجعة App Store |
| الإشعارات | `google-services.json` + قناة `mafia_default` + إذن `POST_NOTIFICATIONS` runtime | مفتاح APNs `.p8` في Firebase + Capabilities Push/Background |
| الروابط العميقة | App Links: `intent-filter autoVerify` + `assetlinks.json` | Universal Links: Associated Domains + `apple-app-site-association` |
| أدنى نظام | `minSdkVersion 23` | Deployment Target (يُحدَّد في 91) |
| الاتجاه | portrait برمجياً (لا `screenOrientation` في Manifest) | portrait عبر `SystemChrome` + Info.plist |
| ملف الدومين | يُنشر عبر Next public/`.well-known` (لا nginx بالإنتاج) | نفس الآلية للملف المصاحب |

---

## 11. الأصول المطلوبة

| الأصل | المصدر / المواصفة | الاستعمال |
|---|---|---|
| `assets/launcher/icon-512.png` | `frontend/public/icons/icon-512x512.png` (maskable) | توليد أيقونة المشغّل |
| `assets/launcher/icon-foreground-512.png` | مشتق من الأيقونة (شفاف + هامش أمان 18%) | طبقة adaptive icon الأمامية |
| `assets/launcher/mafia_logo.png` (+ نسخة 192 محاطة بهامش) | `frontend/public/mafia_logo.png` | Splash + الأيقونة الكبيرة للإشعار |
| `ic_stat_mafia` (drawable monochrome أبيض، mdpi→xxxhdpi) | يُولَّد في 01، مواصفته في 06 §11 | أيقونة الإشعار الصغيرة (إلزامي) |
| `android/app/google-services.json` | من كونسول Firebase (مشروع `mafia-b1c74`) | ربط FCM — ❌ خارج git |
| لقطات المتجر: هاتف (≥2) + تابلت 7" + تابلت 10" | تُلتقط من التطبيق الفعلي على كل فئة حجم (§5) | صفحة المتجر — تابلت إلزامي |
| Feature Graphic `1024×500` + أيقونة متجر `512×512` | شعار على خلفية `#050505` | صفحة المتجر |
| **على الخادم (خارج bundle):** `assetlinks.json` | المحتوى §7.5 + البصمات §7.4 | تحقّق App Links |
| صفحة سياسة خصوصية عامة | Next page على الدومين (`/privacy`) | متطلب نشر Play |

**لا أصوات مخصصة، لا مفاتيح VAPID، لا manifest.json، لا Service Worker** في التطبيق الأصلي.

---

## 12. معايير القبول — checklist تكافؤ

**التوقيع والبناء:**
- [ ] 12.1 يوجد upload keystore محفوظ خارج المستودع مع نسخة احتياطية؛ `key.properties` و`*.jks` في `.gitignore`.
- [ ] 12.2 `flutter build appbundle --flavor prod --release` يُنتج `.aab` موقّعاً بلا أخطاء.
- [ ] 12.3 Play App Signing مفعّل؛ حزمة الإنتاج `applicationId = sbs.grade.mafiaclub` (بلا suffix)، `minSdkVersion 23`، `targetSdkVersion` أحدث مستقر.
- [ ] 12.4 نسخة dev تُثبَّت جنبَ الإنتاج (`...dev`) دون تعارض.
- [ ] 12.5 `versionCode` تصاعدي؛ رفع نسخة بـ code أقل أو مساوٍ يُرفض من Console (سلوك متوقع مُختبَر).

**Firebase والإشعارات:**
- [ ] 12.6 `google-services.json` لمشروع `mafia-b1c74` موجود وخارج git؛ التطبيق يُهيّئ Firebase بلا تحذير.
- [ ] 12.7 توكن FCM أصلي يُسجَّل عبر `POST /register-token` بلا أي تغيير backend (صفّ جديد في `player_fcm_tokens`).
- [ ] 12.8 ميتاداتا القناة `mafia_default` وأيقونة `ic_stat_mafia` ولون accent `#8A0303` معلنة في الـ Manifest.

**App Links:**
- [ ] 12.9 بعد تثبيت نسخة موقّعة بمفتاح Play App Signing: `adb shell pm get-app-links sbs.grade.mafiaclub` = **verified**، وفتح `https://club-mafia.grade.sbs/join/XXXX` من واتساب/QR يفتح **التطبيق** مباشرة (لا المتصفح)، وجهاز بلا التطبيق يفتح الـ PWA. (بند إلزامي في **كل** إصدار.)
- [ ] 12.10 `assetlinks.json` يُقدَّم 200 + `application/json` + بلا redirect على `/.well-known/assetlinks.json` من دومين الإنتاج، ويحوي بصمتَي Play App Signing + upload.
- [ ] 12.11 النمط المسجّل `/join/` فقط — رابط `/player/rank` مثلاً لا يفتح التطبيق (لا يُختطف).

**صفحة المتجر والامتثال:**
- [ ] 12.12 الاسم `Mafia Club — نادي المافيا` والوصف القصير `نظام متطور لإدارة ألعاب المافيا الهجينة` حرفيان.
- [ ] 12.13 لقطات هاتف (≥2) + تابلت 7" + تابلت 10" مرفوعة؛ لا تحذير «not optimized for tablets».
- [ ] 12.14 سياسة خصوصية عامة حيّة + نموذج Data Safety يعلن: هاتف، اسم، صورة، إحصاءات لعب + الميكروفون + التشفير أثناء النقل.
- [ ] 12.15 الأذونات المعلنة مطابقة لقائمة §13 — بلا إذن زائد بلا استعمال.

**الإطلاق:**
- [ ] 12.16 مسار Internal ثم Closed ثم Production بنشر مرحلي (10→20→50→100%)؛ إمكان إيقاف الطرح مؤكَّد.
- [ ] 12.17 بوابة الإصدار الأدنى تعمل: خفض `minSupportedBuild` من الخادم فوق `versionCode` الحالي يعرض «حدّث التطبيق» (تكامل 11).

---

## 13. ملاحظات أداء وأمان

**قائمة الأذونات الكاملة (`AndroidManifest.xml`) — كل إذن بمبرّره:**

| الإذن | وقت التشغيل؟ | المبرّر / المصدر | ملاحظة |
|---|---|---|---|
| `android.permission.INTERNET` | لا (تلقائي) | كل الشبكة (REST/Socket/FCM) | يضيفه Flutter تلقائياً؛ يُذكَر للتوثيق |
| `android.permission.POST_NOTIFICATIONS` | **نعم (API 33+)** | الإشعارات — 06 | البوابة الحاجبة تطلبه |
| `android.permission.RECORD_AUDIO` | **نعم** | الصوت عن بُعد (RealtimeKit) — 31 | يُطلب فقط عند دخول غرفة صوتية |
| `android.permission.VIBRATE` | لا | اهتزاز أحداث الليل/الإشعار — 07/06 | — |
| `android.permission.WAKE_LOCK` | لا | منع قفل الشاشة داخل اللعبة (`wakelock_plus`) + FCM | — |
| `android.permission.BLUETOOTH_CONNECT` | **نعم (API 31+)** | توجيه الصوت لسماعات/سماعة رأس بلوتوث — 31 | يُطلب مع دخول الصوت |
| `android.permission.MODIFY_AUDIO_SETTINGS` | لا | توجيه/تحكم مسار الصوت (RealtimeKit/`just_audio`) — 07/31 | — |
| `android.permission.ACCESS_NETWORK_STATE` | لا | مؤشر انقطاع الشبكة/resync (`connectivity_plus`) | يضيفه الحزمة عادةً؛ يُعلَن للوضوح |
| `com.google.android.c2dm.permission.RECEIVE` | لا | استقبال FCM | يضيفه `firebase_messaging` تلقائياً |
| `android.permission.CAMERA` | **نعم** | **اختياري** — التقاط أفاتار بالكاميرا (13) | **يُفضَّل حذفه**: الأفاتار عبر معرض الصور يكفي (الخطة الأم §12.1). أدرجه فقط إن فُعّل مصدر الكاميرا |
| `android.permission.FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MICROPHONE` (API 34+) | لا (إعلان) | **شرطي** — فقط إن استُعمل foreground service لإبقاء الصوت عن بُعد حياً بالخلفية (31) | لا يُضاف ما لم تتطلبه ميزة الصوت |

> `READ_MEDIA_IMAGES`/`READ_EXTERNAL_STORAGE` **غير مطلوبة** لاختيار الأفاتار: `image_picker` الحديث يستعمل Photo Picker النظامي بلا إذن. لا تُضِفها.

**أمان:**
- **أسرار التوقيع**: keystore وكلماته لا تُرفع لـ git أبداً؛ في CI تُحقن كـ secrets مشفّرة (لا تُلصق في السكربتات). فقدان upload key يُصلَح عبر دعم Play (إعادة إصدار مفتاح رفع) — لكن فقدان النسخة الاحتياطية + عدم تفعيل Play App Signing = كارثة لا رجعة فيها → **Play App Signing إلزامي**.
- **`google-services.json`**: يحوي مفاتيح عميل (apiKey Android) — ليست سراً بحد ذاتها لكنها خارج git بالاتفاق؛ التحكم الفعلي عبر قواعد Firebase ومصادقة الـ backend.
- **App Links ليست مصادقة**: أي تطبيق آخر قد يزوّر intent بنفس الرابط حتى مع `autoVerify` — يُعامَل الرابط الوارد كطلب تنقّل يمر بالحراس فقط، لا كدليل هوية (08 §13). كود الغرفة يُعقَّم (`trim` + سقف 16 محرفاً + `[A-Za-z0-9]`) قبل أي `emit`.
- **حماية open-redirect**: `data.url` بمضيف غير `club-mafia.grade.sbs` لا يدخل الراوتر الداخلي (مصنّف 08 §6.5) — يُفتح خارجياً فقط.
- **minify/R8** يقلّل سطح الهجوم وحجم الحزمة؛ لا تُعطّل `shrinkResources` في الإنتاج.

**أداء:**
- **`.aab` + Play App Signing** يفعّلان تقسيم الأصول لكل جهاز (ABI/كثافة/لغة) → حجم تنزيل أصغر بلا عمل إضافي.
- `minifyEnabled` + `shrinkResources` = APK/AAB أنحف وبدء أسرع؛ ابقِ خرائط R8 مرفوعة لـ Crashlytics (§6.7).
- `multiDexEnabled true` احتياط مع `minSdk 23` وكثرة الحزم؛ على API 21+ الدعم أصلي فلا أثر أداء يُذكر.
- الاتجاه portrait مقفول برمجياً يمنع إعادة بناء غير ضرورية عند الدوران؛ التكيّف بالعرض المنطقي (§5).
- Crashlytics خفيف؛ لا polling ولا خدمات خلفية يفرضها هذا الملف — أي foreground service للصوت شرطي وموثّق في 31.
