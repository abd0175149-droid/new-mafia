import UIKit

/// ══════════════════════════════════════════════════════
/// 🕵️ تسويد الشاشة في اللقطة والتسجيل — طريقة الحقل الآمن (كنتفليكس)
/// ══════════════════════════════════════════════════════
/// المبدأ: الطبقة الداخليّة لحقل `isSecureTextEntry` يستثنيها النظام من مخزن
/// الالتقاط. فننقل **طبقة النافذة كلّها** إلى داخلها، فتخرج الشاشة سوداءَ في
/// اللقطة وتسجيل الشاشة ومرآة العرض ولقطة مبدّل التطبيقات معاً.
///
/// 🔴 iOS لا يملك `FLAG_SECURE`: لا يُمنع **فعل** اللقطة إطلاقاً، إنّما يُسوَّد
///    **محتواها**. الحزام الثاني هو الكشف في `AppDelegate` — الملفّ 98 §3.
///
/// 🔴 هذه حيلةٌ غير موثّقةٍ من أبل: قد يتغيّر ترتيب الطبقات في إصدارٍ قادم.
///    لذلك كلّ خطوةٍ محروسةٌ بـ`guard`، وأيّ إخفاقٍ يعيد `false` بدل أن يُوهم
///    المستدعي بحمايةٍ غير قائمة. الفشل الصامت في ميزة أمانٍ أسوأ من غيابها.
final class ScreenProtector {
    static let shared = ScreenProtector()
    private init() {}

    private var secureField: UITextField?
    private var secureLayer: CALayer?
    /// 🔴 أبو طبقة النافذة **قبل** النقل. بدونه يستحيل التراجع: بعد `enable`
    ///    يصير `window.layer.superlayer` هو الطبقة الآمنة نفسها، فإعادةُ
    ///    الطبقة «إلى أبيها» تُعيدها إلى مكانها ذاته، ثمّ اقتلاعُ الطبقة
    ///    الآمنة يقتلع النافذة معها — وتبقى الشاشة فارغةً إلى الأبد.
    private weak var originalSuperlayer: CALayer?
    private(set) var isEnabled = false

    /// يفعّل التسويد على نافذة المفتاح. يعيد ما إذا انعقدت الحماية فعلاً.
    @discardableResult
    func enable(window: UIWindow?) -> Bool {
        assert(Thread.isMainThread, "طبقات UIKit تُمسّ من الخيط الرئيسيّ وحده")
        guard let window = window else { return false }
        if isEnabled { return true }

        let field = UITextField()
        field.isSecureTextEntry = true
        field.isUserInteractionEnabled = false
        field.backgroundColor = .clear
        field.translatesAutoresizingMaskIntoConstraints = false

        // 🔴 الحقل يُضاف للنافذة ويُخطَّط أوّلاً: `sublayers` تُنشأ عند أوّل
        //    تخطيطٍ فعليّ، والقراءةُ من حقلٍ لم يدخل شجرة العرض تعيد nil غالباً.
        window.addSubview(field)
        NSLayoutConstraint.activate([
            field.centerXAnchor.constraint(equalTo: window.centerXAnchor),
            field.centerYAnchor.constraint(equalTo: window.centerYAnchor),
        ])
        window.layoutIfNeeded()

        guard let layer = field.layer.sublayers?.first,
              let parent = window.layer.superlayer else {
            field.removeFromSuperview()
            return false
        }

        originalSuperlayer = parent
        // 🔴 الترتيب ملزم: تُقتلع الطبقة الآمنة من شجرة النافذة **قبل** أن
        //    تبتلع النافذة. عكسُه يجعل الطبقة سليلةَ نفسها فتدور الشجرة.
        parent.addSublayer(layer)
        layer.frame = window.bounds
        layer.addSublayer(window.layer)

        secureField = field
        secureLayer = layer
        isEnabled = true
        return true
    }

    /// يطفئ التسويد ويعيد طبقة النافذة إلى أبيها الأصليّ.
    @discardableResult
    func disable(window: UIWindow?) -> Bool {
        assert(Thread.isMainThread, "طبقات UIKit تُمسّ من الخيط الرئيسيّ وحده")
        guard isEnabled else { return true }
        guard let window = window, let layer = secureLayer else {
            // حالةٌ لا يُفترض بلوغها؛ تُنظَّف الرايات كي لا يعلق `enable` لاحقاً.
            reset()
            return false
        }

        // 🔴 الأصل المحفوظ لا `window.layer.superlayer`: انظر التعليق أعلاه.
        if let parent = originalSuperlayer {
            parent.addSublayer(window.layer)
        } else {
            // آخر ما يُنقذ الشاشة إن ضاع الأب: تُترك النافذة داخل طبقةٍ
            // مفكوكةٍ بلا أب — أهون من اقتلاعها مع الطبقة الآمنة.
            layer.removeFromSuperlayer()
            reset()
            return false
        }
        layer.removeFromSuperlayer()
        reset()
        return true
    }

    private func reset() {
        secureField?.removeFromSuperview()
        secureField = nil
        secureLayer = nil
        originalSuperlayer = nil
        isEnabled = false
    }
}
