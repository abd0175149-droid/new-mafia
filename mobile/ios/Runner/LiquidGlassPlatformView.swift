import Flutter
import UIKit

// ══════════════════════════════════════════════════════
// 🫧 زجاج أبل الأصليّ — UIGlassEffect (iOS 26+)
// ══════════════════════════════════════════════════════
// عرضٌ أصليّ يُركَّب داخل مشهد Flutter عبر Platform View. Flutter يرسم
// واجهته بمحرّكه فلا يرث موادّ النظام؛ وهذا هو الجسر الوحيد إليها.
//
// نستعمل `UIGlassContainerEffect` لا `UIGlassEffect` وحده: الحاوية تدمج
// عناصر الزجاج المتقاربة في جسمٍ واحد سائل — سلوك iOS 26 المميِّز الذي
// لا يمكن لشيدر محاكاته. الكبسولة والزرّ المركزيّ عنصران داخلها.
//
// ما دون iOS 26 يسقط إلى UIBlurEffect النظاميّ؛ الهدف 13.0 لا يُخفَض.

/// حاوية تعيد ترتيب زجاجها كلّما تغيّر إطارها — والإطار يتغيّر مع كلّ
/// إطارٍ من حركة الانكماش، فلا يصحّ حساب الهندسة مرّة واحدة.
final class GlassHostView: UIView {
  var capsule: UIVisualEffectView?
  var circle: UIVisualEffectView?
  var host: UIVisualEffectView?

  var barHeight: CGFloat = 60
  var radius: CGFloat = 34
  var centerSize: CGFloat = 56
  var centerLift: CGFloat = 18

  override func layoutSubviews() {
    super.layoutSubviews()
    let w = bounds.width, h = bounds.height
    guard w > 0, h > 0 else { return }

    host?.frame = bounds

    // الكبسولة تحتلّ أسفل الإطار — الهندسة نفسها التي يرسم Flutter
    // أيقوناته عليها، وإلا انفصل الزجاج عن محتواه.
    capsule?.frame = CGRect(x: 0, y: h - barHeight, width: w, height: barHeight)
    capsule?.layer.cornerRadius = radius
    capsule?.layer.cornerCurve = .continuous
    capsule?.clipsToBounds = true

    // الدائرة ترتفع فوق حافّة الكبسولة العليا بمقدار centerLift.
    let top = h - barHeight - centerLift
    circle?.frame = CGRect(x: (w - centerSize) / 2, y: max(0, top),
                           width: centerSize, height: centerSize)
    circle?.layer.cornerRadius = centerSize / 2
    circle?.clipsToBounds = true
  }
}

class LiquidGlassPlatformView: NSObject, FlutterPlatformView {
  private let container: GlassHostView

  init(frame: CGRect, viewId: Int64, args: Any?) {
    let p = args as? [String: Any] ?? [:]
    container = GlassHostView(frame: frame)
    container.barHeight  = CGFloat(p["barHeight"]  as? Double ?? 60)
    container.radius     = CGFloat(p["radius"]     as? Double ?? 34)
    container.centerSize = CGFloat(p["centerSize"] as? Double ?? 56)
    container.centerLift = CGFloat(p["centerLift"] as? Double ?? 18)
    container.backgroundColor = .clear
    // اللمس يبقى لـFlutter: الأيقونات ومعالجاتها كلّها فوق هذا العرض.
    container.isUserInteractionEnabled = false

    let tintARGB = p["centerTint"] as? Int
    let interactive = p["interactive"] as? Bool ?? true

    if #available(iOS 26.0, *) {
      let containerEffect = UIGlassContainerEffect()
      // المسافة التي عندها يبدأ العنصران بالاندماج.
      containerEffect.spacing = CGFloat(p["spacing"] as? Double ?? 12)
      let host = UIVisualEffectView(effect: containerEffect)
      host.backgroundColor = .clear

      let capsuleEffect = UIGlassEffect(style: .regular)
      capsuleEffect.isInteractive = interactive
      let capsule = UIVisualEffectView(effect: capsuleEffect)

      let circleEffect = UIGlassEffect(style: .regular)
      circleEffect.isInteractive = interactive
      if let argb = tintARGB {
        circleEffect.tintColor = LiquidGlassPlatformView.color(argb)
      }
      let circle = UIVisualEffectView(effect: circleEffect)

      host.contentView.addSubview(capsule)
      host.contentView.addSubview(circle)
      container.addSubview(host)
      container.host = host
      container.capsule = capsule
      container.circle = circle
    } else {
      let fallback = UIBlurEffect(style: .systemUltraThinMaterialDark)
      let capsule = UIVisualEffectView(effect: fallback)
      let circle = UIVisualEffectView(effect: fallback)
      container.addSubview(capsule)
      container.addSubview(circle)
      container.capsule = capsule
      container.circle = circle
    }

    super.init()
    container.setNeedsLayout()
  }

  private static func color(_ argb: Int) -> UIColor {
    UIColor(
      red: CGFloat((argb >> 16) & 0xFF) / 255.0,
      green: CGFloat((argb >> 8) & 0xFF) / 255.0,
      blue: CGFloat(argb & 0xFF) / 255.0,
      alpha: CGFloat((argb >> 24) & 0xFF) / 255.0)
  }

  func view() -> UIView { container }
}

class LiquidGlassViewFactory: NSObject, FlutterPlatformViewFactory {
  func createArgsCodec() -> FlutterMessageCodec & NSObjectProtocol {
    FlutterStandardMessageCodec.sharedInstance()
  }

  func create(withFrame frame: CGRect, viewIdentifier viewId: Int64, arguments args: Any?)
    -> FlutterPlatformView
  {
    LiquidGlassPlatformView(frame: frame, viewId: viewId, args: args)
  }
}
