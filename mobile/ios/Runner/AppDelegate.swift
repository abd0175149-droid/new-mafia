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
  }
}
