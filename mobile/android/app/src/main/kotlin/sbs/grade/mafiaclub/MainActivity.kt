package sbs.grade.mafiaclub

import android.app.Activity
import android.os.Build
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// ══════════════════════════════════════════════════════
// 🕵️ منع لقطة الشاشة والتسجيل + كشف محاولة اللقطة — قناة mafia/secure_screen
// ══════════════════════════════════════════════════════
// FLAG_SECURE يجعل اللقطة والتسجيل يخرجان **سوداءَ** ويُخفي التطبيق من قائمة
// التطبيقات الأخيرة. ومع أندرويد ١٤+ نسجّل ScreenCaptureCallback فيصل الليدر
// إشعارٌ بمحاولة اللقطة **حتى لو خرجت سوداء** (onScreenshot → Dart → الخادم →
// الليدر). أفضل جهد: أندرويد ١٤+ فقط، والأقدم يبقى المنع بلا إشعار.
class MainActivity : FlutterActivity() {
    private val channelName = "mafia/secure_screen"
    private var channel: MethodChannel? = null

    private var secureActive = false   // شاشةٌ سريّة مفتوحة الآن
    private var started = false         // النشاط في المقدّمة (شرط تسجيل الكشف)
    private var captureRegistered = false

    // كشف محاولة اللقطة (أندرويد ١٤+) — يُطلَق حتى مع FLAG_SECURE في معظم الأجهزة
    private val screenCaptureCallback =
        if (Build.VERSION.SDK_INT >= 34)
            Activity.ScreenCaptureCallback { channel?.invokeMethod("onScreenshot", null) }
        else null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val ch = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
        channel = ch
        ch.setMethodCallHandler { call, result ->
            when (call.method) {
                "enable" -> {
                    secureActive = true
                    runOnUiThread {
                        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        syncCapture()
                    }
                    result.success(true)
                }
                "disable" -> {
                    secureActive = false
                    runOnUiThread {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        syncCapture()
                    }
                    result.success(true)
                }
                "isSupported" -> result.success(true)
                else -> result.notImplemented()
            }
        }
    }

    // يسجّل الكشف فقط حين تكون شاشةٌ سريّة مفتوحةً والنشاط في المقدّمة.
    private fun syncCapture() {
        if (Build.VERSION.SDK_INT < 34) return
        val cb = screenCaptureCallback ?: return
        val shouldWatch = secureActive && started
        if (shouldWatch && !captureRegistered) {
            registerScreenCaptureCallback(mainExecutor, cb)
            captureRegistered = true
        } else if (!shouldWatch && captureRegistered) {
            unregisterScreenCaptureCallback(cb)
            captureRegistered = false
        }
    }

    // النظام يشترط التسجيل في المقدّمة وإلغاءه قبل الخلفيّة.
    override fun onStart() {
        super.onStart()
        started = true
        syncCapture()
    }

    override fun onStop() {
        started = false
        syncCapture()
        super.onStop()
    }
}
