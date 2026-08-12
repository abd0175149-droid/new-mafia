package sbs.grade.mafiaclub

import android.os.Bundle
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// ══════════════════════════════════════════════════════
// 🕵️ منع لقطة الشاشة والتسجيل — قناة mafia/secure_screen
// FLAG_SECURE على النافذة يجعل اللقطة والتسجيل يخرجان **سوداءَ** على مستوى
// النظام، ويُخفي التطبيق من قائمة التطبيقات الأخيرة. يُفعَّل عند دخول شاشة
// الدور/المعرض ويُطفأ خارجها، كي تبقى بقيّة التطبيق قابلةً للّقطة عاديّاً.
// (نمط القناة الأصليّة مطابقٌ لقناة الزجاج mafia/liquid_glass على iOS.)
// ══════════════════════════════════════════════════════
class MainActivity : FlutterActivity() {
    private val channelName = "mafia/secure_screen"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "enable" -> {
                        runOnUiThread {
                            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        }
                        result.success(true)
                    }
                    "disable" -> {
                        runOnUiThread {
                            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        }
                        result.success(true)
                    }
                    // اللقطة تُمنَع فعلاً على أندرويد (سوداء) — فلا كشفَ لازم، ولا تسجيلَ يظهر
                    "isSupported" -> result.success(true)
                    else -> result.notImplemented()
                }
            }
    }
}
