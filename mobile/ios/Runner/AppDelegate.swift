import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    // ── زجاج أبل الأصليّ: عرضٌ أصليّ + قناة تُخبر Dart بتوفّره ──
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "MafiaLiquidGlass") {
      registrar.register(LiquidGlassViewFactory(), withId: "mafia/liquid_glass")

      let channel = FlutterMethodChannel(
        name: "mafia/liquid_glass", binaryMessenger: registrar.messenger())
      channel.setMethodCallHandler { call, result in
        switch call.method {
        case "isAvailable":
          // UIGlassEffect غير موجود قبل iOS 26 — وهدفنا 13.0.
          if #available(iOS 26.0, *) { result(true) } else { result(false) }
        default:
          result(FlutterMethodNotImplemented)
        }
      }
    }

    // ── 🕵️ مكافحة الغش: تسويدٌ للّقطة/التسجيل + كشفٌ يُبلَّغ للّيدر ──
    registerSecureScreen(engineBridge)
  }

  // ══════════════════════════════════════════════════════
  // 🕵️ قناة mafia/secure_screen — الملفّ 98 §1 و§3
  // ══════════════════════════════════════════════════════
  // العقد مع Dart منشورٌ ومُتحقَّقٌ منه على أندرويد؛ هذا الجانب يطابقه ولا يغيّره:
  //   يستقبل: enable · disable · isSupported
  //   يستدعي: onScreenshot · onScreenRecording(Bool)
  private func registerSecureScreen(_ engineBridge: FlutterImplicitEngineBridge) {
    guard let registrar =
      engineBridge.pluginRegistry.registrar(forPlugin: "MafiaSecureScreen") else { return }

    let channel = FlutterMethodChannel(
      name: "mafia/secure_screen", binaryMessenger: registrar.messenger())

    channel.setMethodCallHandler { call, result in
      switch call.method {
      case "enable":
        result(ScreenProtector.shared.enable(window: Self.keyWindow()))
      case "disable":
        result(ScreenProtector.shared.disable(window: Self.keyWindow()))
      case "isSupported":
        result(true)
      default:
        result(FlutterMethodNotImplemented)
      }
    }

    // 📸 اللقطة: تُكتشف بعد وقوعها — iOS لا يسمح بمنعها. Dart يبثّها للّيدر.
    NotificationCenter.default.addObserver(
      forName: UIApplication.userDidTakeScreenshotNotification,
      object: nil, queue: .main
    ) { _ in channel.invokeMethod("onScreenshot", arguments: nil) }

    // 🎥 التسجيل والمرآة: حالةٌ مستمرّة لا حدثٌ لحظيّ، فتُبلَّغ عند كلّ تغيّر.
    NotificationCenter.default.addObserver(
      forName: UIScreen.capturedDidChangeNotification,
      object: nil, queue: .main
    ) { _ in
      channel.invokeMethod("onScreenRecording", arguments: Self.isCaptured())
    }

    // 🔴 حالةٌ نشطةٌ قبل الإقلاع لا يولّد لها النظام إشعاراً: لو بدأ التسجيل
    //    ثمّ فُتح التطبيق، لمرّ بلا إنذارٍ لولا هذا الفحص المبدئيّ.
    if Self.isCaptured() {
      channel.invokeMethod("onScreenRecording", arguments: true)
    }
  }

  private static func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
  }

  /// 🔴 شاشةُ النافذة لا `UIScreen.main`: الأخيرة مهجورةٌ في SDK الحديث وتكذب
  ///    حين يُعرَض التطبيق على شاشةٍ خارجيّة — وهي بالضبط حالةُ «المرآة».
  private static func isCaptured() -> Bool {
    (keyWindow()?.screen ?? UIScreen.main).isCaptured
  }
}
