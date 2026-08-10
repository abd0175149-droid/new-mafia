import java.util.Properties

// ══════════════════════════════════════════════════════
// 🔑 مفتاح الرفع — §12.1 و§12.2 في الملفّ ٩٠
// ══════════════════════════════════════════════════════
// 🔴 الأسرار **خارج المستودع**: `key.properties` و`*.jks` في `.gitignore`.
//    وغيابهما لا يكسر البناء — يسقط إلى مفاتيح التنقيح كي يبقى
//    `flutter run --release` عاملاً على جهاز التطوير.
//
// فقدان مفتاح الرفع يُصلَح عبر دعم Play؛ أمّا فقدانُه **بلا** Play App
// Signing فكارثةٌ لا رجعة فيها — ولهذا التوقيع بالمفتاح المُدار إلزاميّ.
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
val hasReleaseKey = keystorePropertiesFile.exists()
if (hasReleaseKey) {
    keystoreProperties.load(keystorePropertiesFile.inputStream())
}

plugins {
    id("com.android.application")
    id("kotlin-android")
    id("com.google.gms.google-services")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    // ⚠️ ثابت نهائيّ — يطابق ما في خطة الإصدار (90-release-android.md)
    //    وما سيُكتب في assetlinks.json. تغييره بعد النشر يعني تطبيقاً جديداً
    //    لا تحديثاً، ويفقد كل من ثبّته.
    namespace = "sbs.grade.mafiaclub"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // flutter_local_notifications يستعمل java.time لجدولة التنبيهات،
        // وهي غير متاحة دون API 26. التحلية توفّرها للحدّ الأدنى (24).
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "sbs.grade.mafiaclub"
        // افتراضيّ Flutter = 24، وهو فوق ما تشترطه firebase_messaging
        // وjust_audio (23). تُرك للأداة لا مكتوباً: أوّل `flutter build`
        // أعاد كتابة القيمة الثابتة إلى هذا التعبير، فمقاومته عبث.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // ══════════════════════════════════════════════════════
    // النكهتان — §6.2
    // ══════════════════════════════════════════════════════
    // dev يحمل لاحقة `.dev` في المعرّف، فيتعايش التطبيقان على الجهاز
    // نفسه: مختبِرٌ يقارن staging بالإنتاج جنباً إلى جنب بلا إزالة تثبيت.
    flavorDimensions += "env"
    productFlavors {
        create("dev") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            resValue("string", "app_name", "Mafia Club Dev")
        }
        create("prod") {
            dimension = "env"
            resValue("string", "app_name", "Mafia Club")
        }
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = keystoreProperties["storeFile"]?.let { file(it) }
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        release {
            // مفتاح الرفع إن وُجد، وإلّا مفاتيح التنقيح للتجربة المحلّية
            signingConfig = if (hasReleaseKey) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
            // R8 يقلّص الحزمة وسطح الهجوم معاً — لا تُعطَّل في الإنتاج
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
