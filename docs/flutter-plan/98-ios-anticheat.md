# 98 — طبقة مكافحة الغش على iOS: التنفيذ على الـMac — دليلٌ تنفيذيّ دقيق

> **التاريخ:** ١٢ آب ٢٠٢٦ · **المرجع:** الملفّ 93 (بيئة الـMac) والملفّ 97 (لَحاق iOS).
> **الحالة قبلك (محدَّثة ١٢ آب):** طبقات مكافحة الغش الأربع **مبنيّةٌ ومنشورة**
> على أندرويد والويب والخادم:
> - الخادم: `cheat_signals` + بثّ `leader:cheat-signal` للّيدر + الطبقة الإحصائيّة
>   (`anticheat.service.ts` + لوحة `/admin/anticheat`). (`fbf07f1` … `c299428`)
> - أندرويد: `FLAG_SECURE` (سواد) **+ `ScreenCaptureCallback` لكشف محاولة اللقطة**
>   على أندرويد ١٤+ (يستدعي `onScreenshot` عبر القناة).
> - التطبيق/الويب: علامة مائيّة + تتبّع الغياب + «من خرج بعد من».
>
> **🔴 الناقص iOS الأصليّ وحده** — وهو ما يُنفَّذ من الـMac. الجانب Dart
> (`secure_screen.dart`) والخادم وشاشة الليدر **جاهزةٌ ومُتحقَّقٌ منها على أندرويد**:
> ما إن تستدعي القناةُ `onScreenshot` / `onScreenRecording` من iOS، تعمل السلسلة
> كاملةً (Dart → `cheat:screenshot` → بثّ الليدر). فمهمّتك على iOS: **التسويد
> (طريقة نتفليكس) + استدعاء ميثودات الكشف** — لا أكثر.

---

## 0. ما المطلوب بالضبط، وما المتاح تقنيّاً على iOS

| الهدف | iOS يسمح؟ | الآليّة |
|---|---|---|
| **منع اللقطة (شاشة سوداء)** | لا يمنع الفعل، لكن **يستثني المحتوى من صورة الالتقاط** | طبقة الحقل الآمن (طريقة نتفليكس) — §2 |
| **منع تسجيل الشاشة (أسود)** | نعم — نفس الطبقة الآمنة | §2 |
| **كشف حدوث لقطة** | نعم | `userDidTakeScreenshotNotification` — §3 |
| **كشف تسجيل/مرآة نشطة** | نعم | `UIScreen.isCaptured` + `capturedDidChangeNotification` — §3 |

🔴 **الحقيقة الصادقة:** iOS **لا يملك `FLAG_SECURE`**. لا يمكن منع فعل اللقطة
إطلاقاً. لكنّ ما يظهر في الصورة الملتقَطة يمكن **تسويده** بوضع المحتوى السريّ
داخل الطبقة الآمنة لحقل نصٍّ سرّيّ — وهي نفس الطبقة التي تُبقي كلمات المرور خارج
اللقطات، والمبدأ نفسه الذي تستعمله نتفليكس (محتوىً محميّ يُحذف من مخزن الالتقاط).
النتيجة العمليّة مطابقةٌ لِما يراه المستخدم في نتفليكس: **مستطيلٌ أسود مكان الشاشة
السريّة في اللقطة والتسجيل.**

> ⚠️ حيلة الطبقة الآمنة تعمل منذ سنين لكنّها ليست واجهةً موثّقةً رسميّاً من Apple —
> قد تتغيّر في iOS مستقبليّ. وهي أفضل المتاح، ومدعومةٌ بكشف اللقطة (§3) كحزامٍ ثانٍ:
> إن التقط أحدٌ رغم التسويد، يصل الليدر إنذارٌ فوريّ باسم اللاعب.

---

## 1. العقد مع Dart (جاهزٌ ومنشور — لا تعدّله، طابِقه)

الجانب Dart موجودٌ في `mobile/lib/core/security/secure_screen.dart` وينتظر قناةً
اسمها **`mafia/secure_screen`** (نفس نمط قناة الزجاج `mafia/liquid_glass` في
`AppDelegate.swift`). يجب أن يوفّر الجانب الأصليّ لـiOS:

**ميثودات يستقبلها الأصليّ من Dart** (`setMethodCallHandler`):
- `enable` → فعّل التسويد (طبقة الحقل الآمن). يعيد `true`.
- `disable` → أطفئه. يعيد `true`.
- `isSupported` → `true` على iOS.

**ميثودات يستدعيها الأصليّ في Dart** (`channel.invokeMethod`):
- `onScreenshot` → عند التقاط لقطة. بلا وسائط.
- `onScreenRecording` مع `true`/`false` → عند تغيّر حالة التسجيل/المرآة.

Dart يحوّلها تلقائيّاً إلى بثٍّ للّيدر (`cheat:screenshot` / `cheat:screen-recording`)،
والخادم يستقبلها في `lobby.socket.ts` ويبثّها للّيدر ويخزّنها في `cheat_signals`.
**فمجرّد أن تُسجّل القناة وتستدعي هذه الميثودات، تعمل السلسلة كاملةً.**

---

## 2. التسويد — طبقة الحقل الآمن (طريقة نتفليكس)

المبدأ: نضع فوق نافذة التطبيق `UITextField` بوضع `isSecureTextEntry = true`، ونجعل
محتوى التطبيق يُعرَض داخل **طبقته الآمنة** (`layer`). النظام يحذف تلك الطبقة من أيّ
لقطةٍ أو تسجيل. عمليّاً نستعمل طبقةً شفّافةً فوق النافذة تُفعَّل عند `enable`.

### الملفّ الجديد: `mobile/ios/Runner/ScreenProtector.swift`
```swift
import UIKit

/// 🕵️ تسويد الشاشة في اللقطة/التسجيل — طريقة الحقل الآمن (كنتفليكس).
/// المبدأ: محتوى الطبقة الآمنة لـUITextField يُحذف من مخزن الالتقاط على مستوى
/// النظام، فتظهر المنطقة سوداءَ في اللقطة والتسجيل معاً. نطبّقه على النافذة كلّها.
final class ScreenProtector {
    static let shared = ScreenProtector()
    private var secureField: UITextField?
    private var enabled = false

    /// يفعّل التسويد على نافذة المفتاح.
    func enable(window: UIWindow?) {
        guard let window = window, !enabled else { return }
        enabled = true

        let field = UITextField()
        field.isSecureTextEntry = true
        field.isUserInteractionEnabled = false
        secureField = field

        // الطبقة الآمنة هي أوّل sublayer داخل حقلٍ سرّيّ. نجعلها تغطّي النافذة،
        // وننقل طبقة النافذة الحقيقيّة داخلها كي تُحذف من الالتقاط.
        guard let secureLayer = field.layer.sublayers?.first else { enabled = false; return }
        secureLayer.frame = window.bounds
        window.layer.superlayer?.addSublayer(secureLayer)
        secureLayer.addSublayer(window.layer)
    }

    /// يطفئ التسويد ويعيد الطبقة لموضعها.
    func disable(window: UIWindow?) {
        guard let window = window, enabled, let field = secureField,
              let secureLayer = field.layer.sublayers?.first else { enabled = false; return }
        enabled = false
        window.layer.superlayer?.addSublayer(window.layer)   // إعادة الطبقة للنافذة
        secureLayer.removeFromSuperlayer()
        secureField = nil
    }
}
```

> 🔧 **إن لم يظهر التسويد بهذه الطريقة** (اختلاف سلوكٍ بين إصدارات iOS في ترتيب
> الطبقات): البديل الموثّق الأبسط هو وضع `secureField` كـsubview يملأ النافذة مع
> `field.isSecureTextEntry = true`، ثمّ إضافة لقطة محتواك كـsubview داخل
> `secureField.subviews.first` (الحاوية الآمنة). كلا النهجين شائعان في حزم مثل
> `screen_protector` و`no_screenshot` — راجعهما إن احتجت مرجعاً جاهزاً، لكن الحيلة
> المدمجة أعلاه تكفي وتتجنّب اعتماديّة جديدة.

---

## 3. الكشف — لقطةٌ وتسجيل

### التعديل على `mobile/ios/Runner/AppDelegate.swift`
أضف تسجيل القناة داخل `didInitializeImplicitFlutterEngine` (بجانب قناة الزجاج
الموجودة) — أو في `didFinishLaunchingWithOptions` إن كان أنسب لبنيتك الحاليّة:

```swift
// داخل AppDelegate، بعد تسجيل قناة الزجاج
if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "MafiaSecureScreen") {
    let channel = FlutterMethodChannel(
        name: "mafia/secure_screen", binaryMessenger: registrar.messenger())

    func keyWindow() -> UIWindow? {
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }.first { $0.isKeyWindow }
    }

    channel.setMethodCallHandler { call, result in
        switch call.method {
        case "enable":      ScreenProtector.shared.enable(window: keyWindow()); result(true)
        case "disable":     ScreenProtector.shared.disable(window: keyWindow()); result(true)
        case "isSupported": result(true)
        default:            result(FlutterMethodNotImplemented)
        }
    }

    // 📸 كشف اللقطة → إبلاغ Dart (لا يمنع، لكن يُنبّه الليدر)
    NotificationCenter.default.addObserver(
        forName: UIApplication.userDidTakeScreenshotNotification, object: nil, queue: .main
    ) { _ in channel.invokeMethod("onScreenshot", arguments: nil) }

    // 🎥 كشف تسجيل/مرآة الشاشة
    func reportCapture() {
        channel.invokeMethod("onScreenRecording", arguments: UIScreen.main.isCaptured)
    }
    NotificationCenter.default.addObserver(
        forName: UIScreen.capturedDidChangeNotification, object: nil, queue: .main
    ) { _ in reportCapture() }
    if UIScreen.main.isCaptured { reportCapture() }   // حالةٌ نشطةٌ عند الإقلاع
}
```

> إن كانت بنية `AppDelegate` عندك تستعمل `FlutterImplicitEngineDelegate` (كما في
> قناة الزجاج) فاستعمل نفس `engineBridge.pluginRegistry` كأعلاه. وإلّا (بنية
> `FlutterViewController` تقليديّة) اجلب `binaryMessenger` من `controller` مباشرةً.

### لا تغييرات لازمة على `Info.plist` أو Entitlements
كشف اللقطة والتسجيل لا يحتاج أيّ إذن. لا تُضِف شيئاً.

---

## 4. مراحل التنفيذ على الـMac — بالترتيب

```bash
cd unified-mafia && git pull            # ≥ fbf07f1
cd mobile && flutter pub get
flutter analyze                          # No issues (Dart جاهز)
```
1. أنشئ `mobile/ios/Runner/ScreenProtector.swift` (§2) — وأضِفه للهدف Runner في Xcode
   (اسحبه داخل مجموعة Runner، وتأكّد أنّه ضمن Target Membership → Runner).
2. عدّل `AppDelegate.swift` (§3) — سجّل القناة والمراقبين.
3. `cd ios && pod install` (إن لزم) ثمّ:
   `flutter build ios --flavor prod -t lib/main_prod.dart --no-codesign` يجب أن يمرّ.
4. الفحص على **جهازٍ حقيقيّ** (المحاكي لا يُنتج لقطاتٍ نظاميّة موثوقة للحيلة).

---

## 5. بروتوكول الفحص (على جهازٍ حقيقيّ لكلّ منصّة)

### iOS (iPhone حقيقيّ)
حساب الفحص المعتمد: **`0789154719` / `9154719`**. ادخل غرفةً، وزّع الأدوار، افتح
معرض المافيا:
- **ب١** أثناء فتح المعرض، خذ لقطة (زرّ الجانب + رفع الصوت): يجب أن تظهر منطقة
  المعرض **سوداء** في الصورة المحفوظة — والليدر يصله إنذار «📸 التقط لقطة».
- **ب٢** ابدأ تسجيل شاشة (مركز التحكّم) والمعرض مفتوح: التسجيل يُظهر المعرض **أسود**،
  والليدر يصله «🎥 تسجيل شاشة نشط».
- **ب٣** خارج المعرض (شاشة عاديّة): اللقطة تعمل طبيعيّاً (لا تسويد) — تأكيدُ أنّ
  التسويد يُفعَّل/يُطفأ بدقّة ولا يعلق.
- **ب٤** افتح المعرض ثمّ غادر للواتساب ١٠ ثوانٍ وعُد: الليدر يصله «غادر التطبيق
  وشاشة السرّ مفتوحة».

### أندرويد (منشورٌ بالفعل — تحقّقٌ على جهازٍ حقيقيّ)
ثبّت آخر APK من مسار الإخراج المعهود على الـOPPO:
- افتح المعرض، خذ لقطة: يجب أن تكون **سوداء تماماً** (`FLAG_SECURE`)، وكذلك تسجيل
  الشاشة، والتطبيق يظهر أسود في قائمة التطبيقات الأخيرة.
- خارج المعرض: اللقطة تعمل طبيعيّاً.
- العلامة المائيّة تظهر على المعرض والبطاقة باسمك ومقعدك ورمز الغرفة.

### الليدر (أيّ متصفّح)
أثناء ما سبق راقب شاشة الليدر: تظهر لُقيمات الاشتباه أسفل اليسار (🕵️ مقعد · اسم ·
الوصف) مع صوت التنبيه، ولا تُبثّ لشاشة العرض في القاعة.

---

## 6. الحدود الصادقة (وثّقها لصاحب المكان)
- **الويب لا يُسوَّد إطلاقاً** — يعتمد على العلامة المائيّة والتتبّع فقط. الحماية
  الصلبة لمستخدمي التطبيق. الحصر الكامل (كشف الدور في التطبيق حصراً) قرارٌ لاحق حين
  يصبح التطبيق على المتاجر.
- **الهاتف الثاني يصوّر الشاشة** — لا تمنعه أيّ منصّة. تمسكه العلامة المائيّة
  (تفضح صاحب الشاشة المصوَّرة) والطبقة الإحصائيّة (الملفّ لاحقاً).
- **حيلة الطبقة الآمنة على iOS** قد تتغيّر مع إصدارٍ مستقبليّ — كشف اللقطة يبقى
  حزام الأمان.

## 7. الطبقة الرابعة (لاحقاً، لا تخصّ الـMac)
الكشف الإحصائيّ للتواطؤ على بيانات `cheat_signals` + `match_players` + `dealOutcomes`:
درجة خطرٍ متدحرجة وطابور مراجعةٍ للأدمن. تُبنى على الخادم لا على iOS — خارج نطاق هذا الملفّ.

## سجلّ انحرافات الـMac

### ن1 — 🔴 خطأٌ في كود `disable` في §2 يُفرِّغ الشاشة نهائياً (صُحِّح)

الكود المنشور في الخطّة:

```swift
window.layer.superlayer?.addSublayer(window.layer)   // إعادة الطبقة للنافذة
secureLayer.removeFromSuperlayer()
```

بعد `enable` تصير الشجرة: `الأبُ الأصليّ ← الطبقةُ الآمنة ← طبقةُ النافذة`.
فـ`window.layer.superlayer` في لحظة `disable` **هو الطبقة الآمنة نفسها**، لا
الأب الأصليّ. النتيجة أن السطر الأوّل يعيد الطبقة إلى موضعها ذاته (لا شيء)،
ثمّ السطر الثاني يقتلع الطبقة الآمنة **وطبقةَ النافذة معها** — فتبقى الشاشة
فارغةً إلى الأبد عند أوّل خروجٍ من شاشةٍ سريّة.

**العلاج**: حفظ `originalSuperlayer` وقت `enable` والإعادة إليه:

```swift
originalSuperlayer = window.layer.superlayer   // قبل النقل
...
if let parent = originalSuperlayer { parent.addSublayer(window.layer) }
layer.removeFromSuperlayer()
```

### ن2 — الحقل يحتاج دخول شجرة العرض قبل قراءة طبقته

`field.layer.sublayers?.first` تعيد `nil` لحقلٍ أُنشئ ولم يدخل شجرة عرضٍ:
الطبقات الداخليّة تُبنى عند أوّل تخطيط. فيُضاف الحقل للنافذة مع قيدَي توسيط
ويُستدعى `window.layoutIfNeeded()` قبل القراءة، ويُزال في `disable`.

كما أن **ترتيب النقل ملزم**: تُقتلع الطبقة الآمنة من شجرة النافذة **قبل** أن
تبتلع النافذة، وإلّا صارت سليلةَ نفسها فدارت الشجرة.

### ن3 — `enable`/`disable` تعيدان النجاح الفعليّ لا `true` دائماً

الخطّة تنصّ `result(true)` ثابتاً. الحيلة **غير موثّقةٍ من أبل** وكلّ خطوةٍ
فيها محروسةٌ بـ`guard`؛ وإعادةُ `true` عند إخفاق الانعقاد تُوهم بحمايةٍ غير
قائمة — وهو في ميزة أمانٍ أسوأ من غيابها. الجانب Dart **لا يقرأ القيمة**
(`await _ch.invokeMethod('enable')` يهملها)، فالعقد سليمٌ ولم يُمسّ.

### ن4 — `UIScreen.main` استُبدلت بشاشة نافذة المفتاح

`UIScreen.main` مهجورةٌ في SDK الحديث، والأهمّ أنها تكذب حين يُعرَض التطبيق
على شاشةٍ خارجيّة — وهي بالضبط حالة «المرآة» التي يُفترض أن يكشفها ب٢.
المستعمَل: `keyWindow()?.screen ?? UIScreen.main`.

### ن5 — بيئة: CocoaPods خارج المسار الافتراضيّ

`pod` مثبَّتٌ في `~/bin` (تثبيتٌ بلا sudo — الملفّ 93). البناء يسقط بـ
`CocoaPods not installed` ما لم يُصدَّر `PATH="$HOME/bin:$PATH"`.

### نتائج البناء

| الفحص | النتيجة |
|---|---|
| `flutter analyze` | ✅ No issues |
| `flutter test` | ✅ **620/620** |
| `flutter build ios --flavor prod --no-codesign` | ✅ مرّ — 35.5MB |
| إدراج `ScreenProtector.swift` في هدف Runner | ✅ مؤكَّدٌ بإعادة فتح المشروع |
