import UIKit
import XCTest

@testable import Runner

/// ══════════════════════════════════════════════════════
/// 🕵️ حرّاس طبقة مكافحة الغش — الملفّ 98 §2
/// ══════════════════════════════════════════════════════
/// 🔴 لماذا يوجد هذا الملفّ: النسخة الأولى من `ScreenProtector` أسقطت التطبيق
///    فعلياً على iPhone 16 Pro Max عند فتح معرض المافيا:
///      `-[UITextField _layoutContentOnly] → -[CALayer addSublayer:]`
///      `→ CA::Layer::ensure_transaction_recursively` → SIGABRT
///    السبب دورةٌ في شجرة الطبقات. الاختبار الأوّل أدناه يعيد إنتاجها حرفياً
///    بإجبار الحقل على إعادة التخطيط — وهي اللحظة التي كان يقع فيها السقوط.
///
/// التسويد نفسه (سوادُ البكسل في اللقطة) **لا يُفحَص هنا**: يجري على مستوى
/// النظام ولا يظهر في `renderInContext`. يفحصه بروتوكول §5 على جهازٍ حقيقيّ.
/// ما يُفحَص هنا هو سلامة البنية: لا دورة، ولا فقدان للنافذة عند الإطفاء.
final class ScreenProtectorTests: XCTestCase {

    private var window: UIWindow!
    private var container: CALayer!

    override func setUp() {
        super.setUp()
        window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.makeKeyAndVisible()
        // 🔴 النافذة تحتاج أباً لطبقتها: `enable` يشترطه ويعيد false بدونه.
        //    في التطبيق الحقيقيّ يوفّره النظام؛ هنا نوفّره صراحةً.
        if window.layer.superlayer == nil {
            container = CALayer()
            container.addSublayer(window.layer)
        } else {
            container = window.layer.superlayer
        }
    }

    override func tearDown() {
        ScreenProtector.shared.disable(window: window)
        window = nil
        container = nil
        super.tearDown()
    }

    /// الحارس الأهمّ: السقوط الذي عاشه المالك.
    func testEnableThenRelayoutDoesNotCrash() {
        XCTAssertTrue(ScreenProtector.shared.enable(window: window),
                      "الحماية يجب أن تنعقد على نافذةٍ ذات أب")

        // 🔴 هذه هي اللحظة القاتلة سابقاً: إعادة تخطيط الحقل تدفع UIKit
        //    لإضافة عرضٍ داخليّ، فترمي CoreAnimation إن كانت الشجرة دائريّة.
        window.setNeedsLayout()
        window.layoutIfNeeded()
        window.subviews.forEach { $0.setNeedsLayout(); $0.layoutIfNeeded() }

        XCTAssertTrue(ScreenProtector.shared.isEnabled)
    }

    /// لا دورة: طبقة النافذة يجب ألّا تكون سلفاً لأبيها الجديد.
    func testNoCycleInLayerTree() {
        XCTAssertTrue(ScreenProtector.shared.enable(window: window))

        var cursor: CALayer? = window.layer.superlayer
        var hops = 0
        while let c = cursor {
            XCTAssertFalse(c === window.layer,
                           "طبقة النافذة صارت سلفَ نفسها — هذه هي الدورة القاتلة")
            hops += 1
            XCTAssertLessThan(hops, 64, "سلسلة الأسلاف لا تنتهي — دورةٌ مؤكَّدة")
            cursor = c.superlayer
        }
    }

    /// الإطفاء يعيد النافذة إلى أبيها الأصليّ — لا يقتلعها معه.
    func testDisableRestoresWindowLayer() {
        let originalParent = window.layer.superlayer
        XCTAssertNotNil(originalParent)

        XCTAssertTrue(ScreenProtector.shared.enable(window: window))
        XCTAssertFalse(window.layer.superlayer === originalParent,
                       "أثناء التفعيل تعيش النافذة داخل الطبقة الآمنة")

        XCTAssertTrue(ScreenProtector.shared.disable(window: window))
        // 🔴 الانحراف ن1: الكود المنشور في §2 كان يترك النافذة معلَّقةً بلا أب
        //    (شاشةٌ فارغةٌ إلى الأبد). هذا الحارس يمنع عودته.
        XCTAssertTrue(window.layer.superlayer === originalParent,
                      "طبقة النافذة يجب أن تعود لأبيها الأصليّ لا أن تُقتلع")
        XCTAssertFalse(ScreenProtector.shared.isEnabled)
    }

    /// دورةُ تفعيلٍ وإطفاءٍ متكرّرة — المعرض يُفتح ويُغلق مراراً في الجولة.
    func testRepeatedCycles() {
        let originalParent = window.layer.superlayer
        for i in 1...5 {
            XCTAssertTrue(ScreenProtector.shared.enable(window: window),
                          "الدورة \(i): التفعيل")
            window.layoutIfNeeded()
            XCTAssertTrue(ScreenProtector.shared.disable(window: window),
                          "الدورة \(i): الإطفاء")
            XCTAssertTrue(window.layer.superlayer === originalParent,
                          "الدورة \(i): النافذة عادت لأبيها")
        }
    }

    /// التفعيل المتكرّر بلا إطفاء لا يُراكم حقولاً ولا يكسر البنية.
    func testEnableIsIdempotent() {
        XCTAssertTrue(ScreenProtector.shared.enable(window: window))
        let parentAfterFirst = window.layer.superlayer
        XCTAssertTrue(ScreenProtector.shared.enable(window: window),
                      "نداءٌ ثانٍ يعيد true بلا عملٍ إضافيّ")
        XCTAssertTrue(window.layer.superlayer === parentAfterFirst,
                      "البنية لم تتغيّر بالنداء الثاني")
    }

    /// نافذةٌ بلا أبٍ لطبقتها: يعيد false ولا ينهار ولا يدّعي حمايةً.
    func testEnableFailsGracefullyWithoutSuperlayer() {
        let orphan = UIWindow(frame: CGRect(x: 0, y: 0, width: 100, height: 100))
        orphan.layer.removeFromSuperlayer()
        if orphan.layer.superlayer == nil {
            XCTAssertFalse(ScreenProtector.shared.enable(window: orphan),
                           "لا حمايةَ بلا أب — والإبلاغ صادقٌ لا true كاذبة")
            XCTAssertFalse(ScreenProtector.shared.isEnabled)
        }
    }

    /// 🔴 الهندسة: النافذة يجب ألّا تنزاح ولا تنكمش بعد التفعيل.
    ///    طبقةُ النافذة تصير سليلةً لطبقة حقلٍ صغيرٍ متوسَّط، وإحداثيّاتُ الطبقة
    ///    نسبيّةٌ لأبيها — فبلا ضبطٍ صريح ينزاح محتوى التطبيق كلُّه بمقدار موضع
    ///    الحقل. لا تكشفه اختبارات البنية ولا يظهر إلّا بالعين على الجهاز.
    func testWindowGeometryUnchangedAfterEnable() {
        let parent = window.layer.superlayer!
        let before = window.layer.convert(CGPoint.zero, to: parent)
        let sizeBefore = window.layer.bounds.size

        XCTAssertTrue(ScreenProtector.shared.enable(window: window))
        window.layoutIfNeeded()

        let after = window.layer.convert(CGPoint.zero, to: parent)
        XCTAssertEqual(after.x, before.x, accuracy: 0.5,
                       "انزاحت النافذة أفقياً بمقدار \(after.x - before.x)")
        XCTAssertEqual(after.y, before.y, accuracy: 0.5,
                       "انزاحت النافذة رأسياً بمقدار \(after.y - before.y)")
        XCTAssertEqual(window.layer.bounds.size.width, sizeBefore.width, accuracy: 0.5)
        XCTAssertEqual(window.layer.bounds.size.height, sizeBefore.height, accuracy: 0.5)
    }

    /// والهندسة تعود كما كانت بعد الإطفاء.
    func testWindowGeometryRestoredAfterDisable() {
        let parent = window.layer.superlayer!
        let before = window.layer.convert(CGPoint.zero, to: parent)

        XCTAssertTrue(ScreenProtector.shared.enable(window: window))
        XCTAssertTrue(ScreenProtector.shared.disable(window: window))
        window.layoutIfNeeded()

        let after = window.layer.convert(CGPoint.zero, to: parent)
        XCTAssertEqual(after.x, before.x, accuracy: 0.5)
        XCTAssertEqual(after.y, before.y, accuracy: 0.5)
    }

    /// لا قصّ: الطبقة الآمنة أصغر من النافذة، فلو قصّت لاختفى معظم الواجهة.
    func testSecureLayerDoesNotClipWindow() {
        XCTAssertTrue(ScreenProtector.shared.enable(window: window))
        var cursor = window.layer.superlayer
        var hops = 0
        while let c = cursor, hops < 8 {
            XCTAssertFalse(c.masksToBounds,
                           "طبقةٌ في السلسلة تقصّ المحتوى — ستُخفي جزءاً من الواجهة")
            cursor = c.superlayer
            hops += 1
        }
    }

    /// 🔴🔴 الحارس الأهمّ بعد ن6: اللمس أثناء التفعيل — السقوط الثاني.
    ///    بقاءُ الحقل عرضاً داخل النافذة بينما صارت طبقتُه سلفاً لطبقتها يجعله
    ///    ابناً في شجرةٍ وأباً في الأخرى، فيقرأ UIKit ذاكرةً محرَّرة عند أوّل
    ///    لمسة: `hitTest: → convertPoint:fromView: → objc_retain` → EXC_BAD_ACCESS.
    func testHitTestWhileEnabledDoesNotCrash() {
        XCTAssertTrue(ScreenProtector.shared.enable(window: window))

        // اللمس في خمسة مواضع — هذا ما كان يُسقط التطبيق فور إغلاق المعرض.
        for p in [CGPoint(x: 10, y: 10), CGPoint(x: 195, y: 422),
                  CGPoint(x: 380, y: 800), CGPoint(x: 0, y: 0),
                  CGPoint(x: 389, y: 843)] {
            _ = window.hitTest(p, with: nil)
        }
        XCTAssertTrue(ScreenProtector.shared.isEnabled)
    }

    /// واللمس بعد الإطفاء كذلك — وهي اللحظة التي بلّغ عنها المالك حرفياً.
    func testHitTestAfterDisableDoesNotCrash() {
        XCTAssertTrue(ScreenProtector.shared.enable(window: window))
        XCTAssertTrue(ScreenProtector.shared.disable(window: window))
        for p in [CGPoint(x: 10, y: 10), CGPoint(x: 195, y: 422), CGPoint(x: 380, y: 800)] {
            _ = window.hitTest(p, with: nil)
        }
        XCTAssertFalse(ScreenProtector.shared.isEnabled)
    }

    /// 🔴 اتّساق الشجرتين: لا عرضٌ في النافذة تكون طبقتُه سلفاً لطبقتها.
    ///    هذا هو الشرط البنيويّ الذي انتهاكُه أنتج السقوط أعلاه.
    func testNoViewLayerHierarchyContradiction() {
        XCTAssertTrue(ScreenProtector.shared.enable(window: window))
        for sub in window.subviews {
            XCTAssertFalse(Self.layerIsAncestor(sub.layer, of: window.layer),
                           "\(type(of: sub)) ابنٌ في شجرة العروض وأبٌ في شجرة الطبقات")
        }
    }

    private static func layerIsAncestor(_ layer: CALayer, of other: CALayer) -> Bool {
        var cursor: CALayer? = other.superlayer
        var hops = 0
        while let c = cursor, hops < 32 {
            if c === layer { return true }
            cursor = c.superlayer
            hops += 1
        }
        return false
    }

    /// الإطفاء قبل التفعيل لا يُسقط شيئاً.
    func testDisableWithoutEnableIsSafe() {
        XCTAssertTrue(ScreenProtector.shared.disable(window: window))
        XCTAssertFalse(ScreenProtector.shared.isEnabled)
    }
}
