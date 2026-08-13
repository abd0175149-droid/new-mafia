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
/// 🔴 حيلةٌ غير موثّقةٍ من أبل: قد يتغيّر ترتيب الطبقات في إصدارٍ قادم. فكلّ
///    خطوةٍ محروسة، وأيّ إخفاقٍ يعيد `false` بدل أن يُوهم بحمايةٍ غير قائمة.
///
/// 🔴🔴 تحذيرٌ مدفوعُ الثمن — الدورة في شجرة الطبقات تُسقط التطبيق:
///    النسخة الأولى نقلت **سليلة** طبقة الحقل (`sublayers.first`) وحدها وتركت
///    الحقل داخل النافذة. فلمّا أعاد UIKit تخطيط الحقل وأضاف عرضه الداخليّ،
///    صارت الشجرة دائريّة (نافذةٌ داخل طبقةٍ تنتمي لحقلٍ داخل النافذة) فرمى
///    CoreAnimation استثناءً غير مُلتقَط:
///      `-[UITextField _layoutContentOnly] → -[CALayer addSublayer:]`
///      `→ CA::Layer::ensure_transaction_recursively` → SIGABRT
///    العلاج المعتمد: تُنقَل **طبقة الحقل كاملةً** خارج شجرة النافذة أوّلاً،
///    فتصير أباً للنافذة لا سليلاً لها. ويحرس `isAncestor` الحالتين قبل كلّ
///    نقلٍ حتى لا يتكرّر السقوط مهما تغيّر ترتيب الطبقات في إصدارٍ قادم.
/// حقلٌ سرّيّ يُخبر مالكه عند كلّ تخطيط.
///
/// 🔴 لماذا صنفٌ فرعيّ ولا يكفي ضبطُ الإطار مرّةً واحدة: بعد النقل تصير طبقةُ
///    النافذة سليلةً للطبقة الآمنة، وإحداثيّاتُ الطبقة نسبيّةٌ لأبيها. وUIKit
///    يُعيد ضبط إطار الطبقة الآمنة في **كلّ** دورة تخطيطٍ حسب محتوى النصّ —
///    فتنزاح واجهةُ التطبيق كلُّها وتنكمش. تُعاد المطابقة عند كلّ تخطيط.
private final class SecureOverlayField: UITextField {
    var onLayout: (() -> Void)?

    override func layoutSubviews() {
        super.layoutSubviews()
        onLayout?()
    }
}

final class ScreenProtector {
    static let shared = ScreenProtector()
    private init() {}

    private var secureField: SecureOverlayField?
    /// 🔴 أبو طبقة النافذة **قبل** النقل. بدونه يستحيل التراجع: بعد `enable`
    ///    يصير `window.layer.superlayer` هو الطبقة الآمنة نفسها، فإعادةُ
    ///    الطبقة «إلى أبيها» تُعيدها إلى موضعها ذاته، ثمّ اقتلاعُ طبقة الحقل
    ///    يقتلع النافذة معها — وتبقى الشاشة فارغةً إلى الأبد.
    private weak var originalSuperlayer: CALayer?
    /// إطار طبقة النافذة قبل النقل — يُعاد حرفياً عند الإطفاء.
    private var originalWindowFrame: CGRect = .zero
    private(set) var isEnabled = false

    /// يفعّل التسويد على نافذة المفتاح. يعيد ما إذا انعقدت الحماية فعلاً.
    @discardableResult
    func enable(window: UIWindow?) -> Bool {
        guard Thread.isMainThread else { return false }
        guard let window = window else { return false }
        if isEnabled { return true }
        guard let parent = window.layer.superlayer else { return false }
        let windowFrame = window.layer.frame

        let field = SecureOverlayField()
        field.isSecureTextEntry = true
        field.isUserInteractionEnabled = false
        field.backgroundColor = .clear
        field.translatesAutoresizingMaskIntoConstraints = false

        // 🔴 الحقل يدخل شجرة العرض ويُخطَّط أوّلاً: طبقاته الداخليّة تُنشأ عند
        //    أوّل تخطيطٍ فعليّ، والقراءةُ من حقلٍ لم يُخطَّط تعيد nil.
        // 🔴 ويملأ النافذة لا يتوسّطها: طبقتُه ستصير أباً لطبقة النافذة، فإن
        //    حمل مقاس حقلٍ صغير انزاحت الواجهة كلُّها بمقدار موضعه.
        window.addSubview(field)
        NSLayoutConstraint.activate([
            field.leadingAnchor.constraint(equalTo: window.leadingAnchor),
            field.trailingAnchor.constraint(equalTo: window.trailingAnchor),
            field.topAnchor.constraint(equalTo: window.topAnchor),
            field.bottomAnchor.constraint(equalTo: window.bottomAnchor),
        ])
        window.layoutIfNeeded()

        guard let secure = field.layer.sublayers?.last else {
            field.removeFromSuperview()
            return false
        }

        // ① طبقة الحقل كلّها تخرج من شجرة النافذة.
        guard !Self.isAncestor(window.layer, of: parent) else {
            field.removeFromSuperview()
            return false
        }
        parent.addSublayer(field.layer)

        // ② ثمّ تبتلع الطبقةُ الآمنة النافذةَ. الحارس يمنع الدورة نهائياً.
        guard !Self.isAncestor(window.layer, of: secure) else {
            field.layer.removeFromSuperlayer()
            field.removeFromSuperview()
            return false
        }
        secure.addSublayer(window.layer)

        // 🔴 المطابقة الهندسيّة، وتتكرّر عند كلّ تخطيط: الطبقة الآمنة تملأ
        //    الحقل، والحقلُ يملأ النافذة — فتقع النافذة في موضعها الأصليّ
        //    تماماً. بلا هذا تنزاح الواجهة كلُّها وتنكمش (حارسها
        //    `testWindowGeometryUnchangedAfterEnable`).
        let matchGeometry: () -> Void = { [weak field, weak window] in
            guard let field = field, let window = window else { return }
            secure.frame = field.layer.bounds
            window.layer.frame = CGRect(origin: .zero, size: field.layer.bounds.size)
        }
        field.onLayout = matchGeometry
        matchGeometry()

        originalSuperlayer = parent
        originalWindowFrame = windowFrame
        secureField = field
        isEnabled = true
        return true
    }

    /// يطفئ التسويد ويعيد طبقة النافذة إلى أبيها الأصليّ.
    @discardableResult
    func disable(window: UIWindow?) -> Bool {
        guard Thread.isMainThread else { return false }
        guard isEnabled else { return true }
        guard let window = window, let field = secureField,
              let parent = originalSuperlayer else {
            teardown()
            return false
        }

        // 🔴 الأصل المحفوظ لا `window.layer.superlayer` — انظر أعلاه.
        field.onLayout = nil          // لئلّا يعيد ضبط الهندسة بعد الفكّ
        parent.addSublayer(window.layer)
        window.layer.frame = originalWindowFrame
        field.layer.removeFromSuperlayer()
        teardown()
        return true
    }

    private func teardown() {
        secureField?.removeFromSuperview()
        secureField = nil
        originalSuperlayer = nil
        isEnabled = false
    }

    /// هل `candidate` هو `layer` نفسها أو أحد أسلافها؟ حارسُ الدورة.
    private static func isAncestor(_ layer: CALayer, of candidate: CALayer) -> Bool {
        var cursor: CALayer? = candidate
        while let c = cursor {
            if c === layer { return true }
            cursor = c.superlayer
        }
        return false
    }
}
