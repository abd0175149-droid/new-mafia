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

    buildTypes {
        release {
            // TODO(M6): مفتاح توقيع حقيقيّ + Play App Signing (90-release-android.md).
            //           يوقّع بمفاتيح التنقيح حالياً كي يعمل `flutter run --release`.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
