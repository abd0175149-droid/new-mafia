# 93 — تنفيذ نسخة iOS على جهاز Mac — دليل Claude التنفيذي الكامل

> **هذا هو الملف المرجعي الوحيد لجلسة العمل على الـ Mac.** اقرأه كاملاً قبل أي أمر.
> جزء من خطة تطبيق Flutter — الفهرس في `00-MASTER-PLAN.md`. النظير النظري لهذا الملف هو
> `91-release-ios.md` (كُتب لمسار Codemagic بلا Mac — **الآن يوجد Mac**، فكل خطوات البناء
> تجري محلياً عبر Xcode، ويبقى 91 مرجعاً لقرارات المتجر والمراجعة وAPNs).

---

## 0. السياق — ما هذا المشروع وأين وصلنا

| البند | القيمة |
|---|---|
| المستودع | `https://github.com/abd0175149-droid/new-mafia.git` — الفرع `master` |
| تطبيق الموبايل | مجلد `mobile/` في جذر المستودع — Flutter، اسمه `mafia_club` («نادي المافيا — تطبيق اللاعب») |
| حالة أندرويد | **مكتمل ويعمل** — APK نسخة dev مبنية ومثبَّتة على أجهزة حقيقية. لا تلمس أي شيء في `mobile/android/` |
| حالة iOS | مجلد `mobile/ios/` **قالب `flutter create` خام**: لا Podfile مُخصَّص، لا GoogleService-Info.plist، لا أذونات في Info.plist، لا flavors/schemes، لا أيقونات. **هذا ما ستبنيه** |
| الاختبارات | 387 اختباراً في `mobile/test/` — كلها خضراء على master. `flutter test` هو خط الأساس قبل وبعد كل مرحلة |
| الخادم | الإنتاج `https://club-mafia.grade.sbs` — **النكهتان dev وprod تشيران إليه معاً** (قرار المالك 2026-08-02، موثَّق في `lib/app/config.dart`) |
| Firebase | مشروع `mafia-b1c74` — أندرويد مسجَّل؛ **iOS غير مسجَّل بعد** |
| العقد الخلفي | جاهز لـ iOS دون أي تعديل: كتلة `apns` كاملة في `backend/src/services/fcm.service.ts`، والتسجيل عبر `POST /api/player-notifications/register-token` |
| Dart SDK | `^3.11.0` (من `pubspec.yaml`) — يفرض Flutter stable حديثاً |
| Deployment target | `IPHONEOS_DEPLOYMENT_TARGET = 13.0` (موجود في pbxproj) — لا تخفضه |

**ملفات يجب قراءتها قبل التنفيذ** (كلها في `docs/flutter-plan/`):
1. هذا الملف (93) — خارطة الطريق التنفيذية.
2. `91-release-ios.md` — قرارات iOS الحاكمة: Info.plist الحرفي، Entitlements، APNs، مخاطر المراجعة R1–R5.
3. `06-push-notifications.md` — آلة حالة الإذن وخط FCM.
4. `08-deeplinks-routing.md` — Universal Links وملف AASA.
5. `00-MASTER-PLAN.md` §8 — قواعد الكود العامة (قفل portrait، clamp للـ textScaler…).

---

## 1. القرارات المقفولة — ممنوع تغييرها

1. **Bundle ID**: الإنتاج `sbs.grade.mafiaclub` والتطوير `sbs.grade.mafiaclub.dev` — **أحرف صغيرة بالكامل**.
   ⚠️ الموجود حالياً في `project.pbxproj` هو `sbs.grade.mafiaClub` (بحرف C كبير) — **تصحيحه إلى الصغير مهمة من مهامك** (المرحلة 3)؛ مطابقة `appIDs` في ملف AASA حساسة لحالة الأحرف.
2. **الاتجاه**: portrait فقط على iPhone وiPad + `UIRequiresFullScreen=YES`. التطبيق **Universal** (iPhone + iPad).
3. **الروابط العميقة**: `applinks` على مسار `/join/*` **فقط** — لا `/player/*` (كي لا يخطف التطبيق روابط الـ PWA).
4. **الإشعارات على iOS**: النظام يعرض `aps.alert` بنفسه — **ممنوع** أي عرض محلي (`flutter_local_notifications.show`) وإلا تكرّر الإشعار. في foreground: `setForegroundNotificationPresentationOptions(alert:false, badge:false, sound:false)`.
5. **أوصاف الأذونات**: `NSPhotoLibraryUsageDescription` فقط في إصدار 1.0. **لا** مفتاح ميكروفون ولا كاميرا (خطر رفض 5.1.1 — يُضافان مع ميزة الصوت عن بُعد M5).
6. `ITSAppUsesNonExemptEncryption = NO` (HTTPS فقط، لا تشفير خاص).
7. **لا تعديل على الخادم إطلاقاً** — العقود جاهزة. الاستثناءان المرصودان مسبقاً (endpoint حذف الحساب + صفحة الخصوصية) مملوكان لمرحلة المراجعة (المرحلة 9) ويُنسَّقان مع المالك.
8. **لا تلمس**: `mobile/android/**`، منطق اللعبة في `lib/features/**`، `lib/app/config.dart` (الروابط)، أي شيء في `backend/` أو `frontend/`.
9. الأصوات والخطوط أصول محلية مضمّنة — لا شيء يُحمَّل من الشبكة وقت التشغيل.

---

## 2. المرحلة 0 — تجهيز بيئة الـ Mac

> كل بنود هذه المرحلة قابلة للتنفيذ فوراً ولا تحتاج حساب Apple Developer مدفوعاً.

```bash
# 1) Xcode — من App Store (أطول خطوة تنزيلاً؛ ابدأها أولاً)، ثم:
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
xcodebuild -downloadPlatform iOS        # منصة iOS Simulator

# 2) Homebrew + CocoaPods
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install cocoapods

# 3) Rosetta (أجهزة Apple Silicon فقط — بعض أدوات البناء تحتاجها)
sudo softwareupdate --install-rosetta --agree-to-license

# 4) Flutter (قناة stable — يجب أن يوفر Dart >= 3.11)
git clone https://github.com/flutter/flutter.git -b stable ~/flutter
echo 'export PATH="$HOME/flutter/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
flutter doctor          # يجب أن يخضرّ سطرا Xcode وiOS toolchain

# 5) استنساخ المشروع
git clone https://github.com/abd0175149-droid/new-mafia.git ~/new-mafia
cd ~/new-mafia/mobile
flutter pub get

# 6) خط الأساس — يجب أن ينجح 100% قبل لمس أي شيء
flutter analyze
flutter test            # 387 اختباراً — كلها يجب أن تنجح
```

- VS Code: ثبّت إضافتَي **Flutter** و**Dart**. Claude Code يعمل من الطرفية داخل VS Code مباشرة.
- **معيار قبول المرحلة**: `flutter doctor` بلا أخطاء iOS، والاختبارات كلها خضراء.

---

## 3. المرحلة 1 — أول تشغيل على محاكي iOS (بلا Firebase)

تهيئة Firebase محاطة بـ try/catch في `lib/core/push/push_service.dart` — غيابُ
`GoogleService-Info.plist` **لا يُسقط الإقلاع**؛ ستظهر رسالة `⚠️ تعذّرت تهيئة الإشعارات`
في السجل وهذا متوقَّع ومقبول في هذه المرحلة.

```bash
open -a Simulator                                   # شغّل محاكي iPhone حديثاً
cd ~/new-mafia/mobile
flutter run -t lib/main_prod.dart                   # ⚠️ بلا --flavor — لا schemes بعد
```

- أول تشغيل يولّد `ios/Podfile` ويشغّل `pod install` تلقائياً. بعد توليده: افتح `ios/Podfile`
  وأزل التعليق عن سطر المنصة واجعله `platform :ios, '13.0'`.
- **ملاحظة**: على أندرويد الأمر يتطلب `--flavor` لأن النكهات معرَّفة في Gradle؛ على iOS
  تمريرها الآن يفشل («The Xcode project does not define custom schemes») — تُبنى في المرحلة 4.
- جرّب أيضاً محاكي **iPad** — يجب ألا تظهر حواف سوداء، والاتجاه portrait.

**معيار القبول**: التطبيق يقلع على محاكي iPhone وiPad، يصل صفحة الدخول، تسجيل الدخول
بحساب الاختبار (الموسوم `is_test_account` — اطلب بياناته من المالك) يعمل، والتصفح
(الرئيسية/الترتيب/السجل) سليم. الخطوط العربية (Amiri/Tajawal) تُرسم صحيحة.

---

## 4. المرحلة 2 — Info.plist وEntitlements (النصوص الحرفية)

طبّق على `ios/Runner/Info.plist` الكتلة الحرفية من `91-release-ios.md` §6.5 وتشمل:

- الهوية: `CFBundleDisplayName = نادي المافيا`، `CFBundleDevelopmentRegion = ar`.
- الاتجاه: `UISupportedInterfaceOrientations` و`~ipad` = portrait فقط + `UIRequiresFullScreen=YES`.
- `FlutterDeepLinkingEnabled = YES`.
- `ITSAppUsesNonExemptEncryption = NO`.
- `UIBackgroundModes = [remote-notification]` — **فقط** (لا `audio` ولا `voip` في 1.0).
- `NSPhotoLibraryUsageDescription` بالنص العربي الحرفي من 91. **لا** مفاتيح ميكروفون/كاميرا.

أنشئ `ios/Runner/Runner.entitlements` (وسيلحقه ملف dev في المرحلة 4):
- `aps-environment = development` (تتبدل production تلقائياً عند التوزيع).
- `com.apple.developer.associated-domains`: prod → `applinks:club-mafia.grade.sbs`،
  dev → `applinks:mafia.grade.sbs`.

**معيار القبول**: البناء ينجح، التطبيق portrait مقفول فعلياً على المحاكي (لا يدور)،
و`flutter test` ما زالت خضراء.

---

## 5. المرحلة 3 — تصحيح Bundle ID + المرحلة 4 — نكهتا dev/prod في Xcode

هدف النهاية: نفس أوامر أندرويد تعمل حرفياً على iOS:

```bash
flutter run --flavor dev  -t lib/main_dev.dart     # «Mafia Club Dev» — sbs.grade.mafiaclub.dev
flutter run --flavor prod -t lib/main_prod.dart    # «نادي المافيا»   — sbs.grade.mafiaclub
```

الخطوات (تُنفَّذ بتحرير pbxproj/xcconfig أو من Xcode GUI — أيهما أضمن لك):

1. **صحّح** كل `PRODUCT_BUNDLE_IDENTIFIER` من `sbs.grade.mafiaClub` إلى `sbs.grade.mafiaclub`
   (ونظيره في RunnerTests).
2. ضاعف الـ Configurations الثلاث إلى ست: `Debug-dev / Release-dev / Profile-dev` و
   `Debug-prod / Release-prod / Profile-prod` (اصطلاح Flutter: `<Mode>-<flavor>`).
3. أنشئ **Scheme** باسم `dev` وآخر باسم `prod` (shared، داخل `xcshareddata/xcschemes`)
   يربط كلٌّ منهما الـ configurations الخاصة به.
4. لكل نكهة عبر xcconfig: الـ bundle id (`.dev` لاحقة للتطوير)، و`APP_DISPLAY_NAME`
   («Mafia Club Dev» / «نادي المافيا») مربوطاً بـ `CFBundleDisplayName = $(APP_DISPLAY_NAME)`،
   وملف entitlements خاص بكل نكهة (`CODE_SIGN_ENTITLEMENTS`) لاختلاف associated domains.
5. تأكد أن ملفات xcconfig النكهات تستورد `Generated.xcconfig` وإلا انكسر بناء Flutter.

**معيار القبول**: الأمران أعلاه يعملان على المحاكي، والتطبيقان يتعايشان جنباً إلى جنب
بأسمائهما ومعرّفيهما المختلفين (تكافؤ سلوك أندرويد §6.2 في 90).

---

## 6. المرحلة 5 — الأيقونة وشاشة الإقلاع

1. أضف إلى `dev_dependencies`: `flutter_launcher_icons` و`flutter_native_splash`.
2. المصدر: `frontend/public/mafia_logo.png` (1024×1024) — **سطّحه على خلفية معتمة**
   `#050505` (Apple ترفض قناة ألفا في أيقونة المتجر): `remove_alpha_ios: true`.
3. شاشة الإقلاع: خلفية `#050505` + الشعار متمركزاً → `flutter_native_splash` يولّد
   `LaunchScreen.storyboard`.
4. أعد التشغيل وتحقق بصرياً على محاكيي iPhone وiPad.

---

## 7. المرحلة 6 — Firebase لـ iOS (تحتاج وصولاً لمشروع mafia-b1c74 فقط — لا حساب Apple)

**الطريق الأسرع من الطرفية** (بعد `firebase login` بحساب المالك):

```bash
npm i -g firebase-tools
firebase login
firebase apps:create ios "Mafia Club iOS"     --bundle-id sbs.grade.mafiaclub     --project mafia-b1c74
firebase apps:create ios "Mafia Club iOS Dev" --bundle-id sbs.grade.mafiaclub.dev --project mafia-b1c74
firebase apps:sdkconfig ios <APP_ID_PROD> --project mafia-b1c74   # يطبع GoogleService-Info.plist
firebase apps:sdkconfig ios <APP_ID_DEV>  --project mafia-b1c74
```

(البديل: من Firebase Console يدوياً — خطوات 91 §6.4.)

1. ضع الملفين في `ios/config/prod/GoogleService-Info.plist` و`ios/config/dev/GoogleService-Info.plist`.
2. **خارج git**: أضفهما إلى `.gitignore` (قرار 91 §6.4 — يُحقنان وقت البناء في CI لاحقاً).
3. أضف **Build Phase** (Run Script قبل Compile Sources) ينسخ الملف الصحيح حسب الـ configuration
   إلى `${BUILT_PRODUCTS_DIR}/.../GoogleService-Info.plist` (النمط القياسي للنكهات المتعددة —
   يقرأ اللاحقة `-dev`/`-prod` من `$CONFIGURATION`).
4. الكود يستدعي `Firebase.initializeApp()` **بلا options** — يقرأ الـ plist الأصلي مباشرة؛
   لا تولّد `firebase_options.dart` ولا تستخدم `flutterfire configure` كي لا تغيّر نمط التهيئة.
5. أبقِ `FirebaseAppDelegateProxyEnabled` مفعّلاً (الافتراضي — swizzling يربط توكن APNs تلقائياً).

**معيار القبول**: على المحاكي يختفي تحذير `⚠️ تعذّرت تهيئة الإشعارات` من السجل
(التهيئة تنجح؛ التوكن نفسه يحتاج جهازاً حقيقياً + APNs — المرحلة التالية).

---

## 8. المرحلة 7 — حساب Apple Developer + APNs + جهاز حقيقي

> **بوابة خارجية**: تحتاج قرار/دفع المالك (99$/سنة، التفعيل ساعات→أيام). أطلقها مبكراً
> بالتوازي مع المراحل 2–6. التفاصيل الكاملة في 91 §6.1–6.3 — الخلاصة التنفيذية:

1. حساب Apple Developer → دوّن **Team ID**.
2. سجّل الـ App IDs (`sbs.grade.mafiaclub` و`.dev`) بقدرتَي **Push Notifications** و**Associated Domains**.
3. مفتاح **APNs `.p8`** (يُنزَّل مرة واحدة! يخدم Sandbox+Production معاً) → ارفعه في
   Firebase Console → mafia-b1c74 → Cloud Messaging → Apple app configuration (Key ID + Team ID) — **للتطبيقين**.
4. على الـ Mac: Xcode → Settings → Accounts → أضف Apple ID → فعّل Automatic Signing بفريق الحساب.
5. وصّل iPhone حقيقياً (الإشعارات **لا تُختبر على المحاكي**):
   `flutter run --flavor prod -t lib/main_prod.dart -d <device-id>`.

**قبل الحساب المدفوع يمكنك**: التوقيع بـ Personal Team مجاني لتجربة الواجهة على جهاز حقيقي
(صلاحية 7 أيام، **بلا** Push و**بلا** Associated Domains) — مفيد لاختبار الأداء واللمس فقط.

**مصفوفة قبول الإشعارات** (من 91 §12 — على iPhone حقيقي):
- [ ] منح الإذن → صدور توكن FCM → تسجيله عبر `register-token` (المنصة `ios`).
- [ ] إشعار اختباري من الخادم يصل مقفول الشاشة: يعرضه النظام بصوت default وbadge=1.
- [ ] foreground: **لا** banner، والصندوق يُعاد جلبه.
- [ ] نقر إشعار والتطبيق مقتول → يقلع ويهبط على المسار الصحيح (`/player/join?...`).
- [ ] فتح/resume يصفّر الـ badge.
- [ ] **قرار R1 مطبَّق**: زر «لاحقاً» في بوابة الإشعارات **على iOS حصراً** (`Platform.isIOS`)
  يتيح دخول التطبيق بلا إذن — التوصية المعتمدة في 91 §6.7 لتفادي رفض Guideline 4.5.4.

---

## 9. المرحلة 8 — Universal Links

- الجانب iOS جاهز من المرحلة 4 (entitlements). الناقص **خادمي**: ملف
  `/.well-known/apple-app-site-association` على `club-mafia.grade.sbs`
  بـ `appIDs: ["<TEAMID>.sbs.grade.mafiaclub"]` و`components: [{"/": "/join/*"}]` —
  المحتوى ومقتطف nginx في `08-deeplinks-routing.md` §7.5. **نسّق مع المالك للنشر** (لا تنشر بنفسك).
- الاختبار: أرسل `https://club-mafia.grade.sbs/join/XXXX` عبر واتساب/الرسائل → يفتح التطبيق
  مباشرة. (كتابته يدوياً في Safari لا تفتح التطبيق — قيد نظام معروف، ليس خطأ.)
- كاش AASA عند Apple قد يتأخر ساعات؛ للتطوير استخدم `?mode=developer` مع Developer Mode.

---

## 10. المرحلة 9 — TestFlight والمتجر (بديل Codemagic: مباشرة من الـ Mac)

1. ارفع `version:` في `pubspec.yaml` (الـ build number عدد صحيح تصاعدي — بوابة الإصدار تقارنه).
2. ابنِ ووزّع:
   ```bash
   flutter build ipa --release --flavor prod -t lib/main_prod.dart
   open build/ios/archive/Runner.xcarchive     # → Xcode Organizer → Distribute → App Store Connect
   ```
   (أو Transporter لرفع الـ ipa. ملف codemagic.yaml في ملحق 91-أ يبقى خياراً للأتمتة لاحقاً.)
3. أنشئ التطبيق في App Store Connect بنفس الـ Bundle ID → دوّن **Apple ID الرقمي**
   → عبّئ لاحقاً `store_url_ios` و`min_supported_build_ios` في Remote Config (عقد 91 §7.3).
4. متطلبات المراجعة قبل الإرسال — **كلها من 91** (§4 و§6.7): R1 تجاوز بوابة الإشعارات ✅ (المرحلة 7)،
   R2 حذف الحساب داخل التطبيق (بند backend — نسّق مع المالك)، R3 صفحة `/privacy` منشورة،
   R4 حساب تجريبي + فيديو 30–90 ثانية، R5 نموذج App Privacy (Linked to You، No Tracking).
5. اللقطات: iPhone 6.7″ (1290×2796) + iPad 12.9″ (2048×2732) — تُلتقط الآن من المحاكيات مباشرة.

---

## 11. قواعد عمل Claude على الـ Mac

1. **بعد كل مرحلة**: `flutter analyze` (صفر أخطاء) + `flutter test` (387+ خضراء) + تشغيل فعلي على المحاكي.
2. **الكوميتات**: عربية بنمط المستودع — `feat(mobile-ios): ...` / `fix(mobile-ios): ...`، كوميت لكل مرحلة، وادفع إلى `master`.
3. **ممنوع في git إطلاقاً**: `AuthKey_*.p8` (بنوعيه)، `GoogleService-Info.plist`، أي شهادة/بروفايل.
4. **بوابات تتطلب المالك** (توقف واطلب): دفع حساب Apple، رفع `.p8` إلى Firebase (أو بيانات دخوله)، نشر AASA وصفحة الخصوصية على الخادم، بيانات حساب الاختبار، أي بند backend (حذف الحساب).
5. أصلح جذور المشاكل لا أعراضها؛ إن اختلف الواقع عن هذا الملف (نسخ أدوات، بنية pbxproj) فالأولوية للواقع مع تدوين الفرق.
6. التعليقات بالعربية بنفس كثافة وأسلوب الكود الحالي.

## 12. Definition of Done — نسخة iOS «جاهزة»

- [ ] المراحل 0–5: بيئة سليمة، التطبيق يعمل بكل شاشاته على محاكيي iPhone وiPad بالنكهتين، Info.plist/entitlements مطابقة للقرارات، أيقونة وشاشة إقلاع نهائيتان، Firebase مهيّأ.
- [ ] المرحلة 7: مصفوفة الإشعارات كاملة على iPhone حقيقي + قرار R1 مطبَّق.
- [ ] المرحلة 8: Universal Link يفتح التطبيق من واتساب/الرسائل.
- [ ] المرحلة 9: بناء TestFlight داخلي يعمل على جهاز مختبِر، وبنود المراجعة R1–R5 مغلقة.
- [ ] `flutter analyze` + `flutter test` خضراء على master، وكل الكوميتات مدفوعة.
