import UserNotifications
import UIKit

// ══════════════════════════════════════════════════════
// 🖼️ PUSH-3 — تمديد خدمة الإشعارات: صورة الإشعار على iOS
// ══════════════════════════════════════════════════════
// 🔴 لماذا يلزم تمديدٌ منفصل: iOS **لا يعرض صورةً في إشعارٍ** إلّا إن
//    نزّلها تمديدُ خدمةٍ ورفقها كمرفق. الحمولة تصل بـ`mutable-content: 1`
//    فيوقظ النظامُ هذا التمديد قبل العرض، ويمنحه ثلاثين ثانية.
//
// 🔴 والمهلة حقيقيّة: `serviceExtensionTimeWillExpire` تُستدعى حين تنفد،
//    وإن لم نُسلّم المحتوى فيها **يسقط الإشعار كلّه** — فيخسر المستخدم
//    النصّ أيضاً لأجل صورةٍ لم تصل. لذلك يُسلَّم النصّ دائماً والصورة
//    إضافةٌ إن لحقت.
//
// ⚠️ يحتاج معرّف حزمةٍ مسجَّلاً (حسابٌ مدفوع) — انظر الملفّ 99 §9.
class NotificationService: UNNotificationServiceExtension {

    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttempt: UNMutableNotificationContent?
    private var task: URLSessionDataTask?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        bestAttempt = request.content.mutableCopy() as? UNMutableNotificationContent
        guard let content = bestAttempt else {
            contentHandler(request.content)
            return
        }

        // FCM يضع الرابط في `fcm_options.image`، ولوحتنا قد ترسله في
        // `imageUrl` مباشرةً — يُقرآن معاً فلا يعتمد العرض على مصدرٍ واحد.
        let raw = (content.userInfo["fcm_options"] as? [String: Any])?["image"] as? String
            ?? content.userInfo["imageUrl"] as? String
        guard let s = raw, let url = URL(string: s), url.scheme?.hasPrefix("http") == true else {
            contentHandler(content)
            return
        }

        task = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self = self else { return }
            defer { self.deliver() }
            guard let data = data, UIImage(data: data) != nil else { return }

            // المرفق يُقرأ من **ملفّ** لا من ذاكرة، والامتداد يجب أن يطابق
            // النوع وإلّا رفضه النظام بصمت.
            let ext = url.pathExtension.isEmpty ? "jpg" : url.pathExtension
            let tmp = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension(ext)
            do {
                try data.write(to: tmp)
                let att = try UNNotificationAttachment(identifier: "image", url: tmp)
                self.bestAttempt?.attachments = [att]
            } catch {
                // الصورة إضافةٌ لا شرط — الإشعار يُسلَّم نصّاً.
            }
        }
        task?.resume()
    }

    /// 🔴 النظام يمنح ثلاثين ثانية ثمّ يستدعي هذه. تسليمُ ما لدينا فيها
    ///    إلزاميّ: بلا تسليمٍ يسقط الإشعار كلّه ويخسر المستخدم النصّ أيضاً.
    override func serviceExtensionTimeWillExpire() {
        task?.cancel()
        deliver()
    }

    /// يُسلّم مرّةً واحدة — استدعاءٌ ثانٍ للمُسلِّم يُسقط التمديد.
    private func deliver() {
        guard let handler = contentHandler, let content = bestAttempt else { return }
        contentHandler = nil
        bestAttempt = nil
        handler(content)
    }
}
