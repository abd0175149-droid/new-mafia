import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/theme/colors.dart';
import '../../core/app/release_gate.dart';

// ══════════════════════════════════════════════════════
// ⬆️ شاشة التحديث المطلوب — حجبٌ كامل
//
// 🔴 حاجبةٌ عمداً خلافاً لبوّابة الموقع: نسخةٌ قديمة قد تتحدّث مع خادمٍ بعقدٍ
//    تغيّر — فتُرسل حمولةً لا يفهمها أو تفتقد حقلاً حارساً. تمريرها يُنتج
//    أعطالاً غامضةً على طاولةٍ حيّة، والحجب أصدق منها.
//
// 🔴 ولا تظهر إلّا بجوابٍ صريحٍ من الخادم بـ`blocked` — فشل الشبكة يمرّ.
// ══════════════════════════════════════════════════════

class UpdateGate extends StatelessWidget {
  const UpdateGate({super.key, required this.status});

  final ReleaseStatus status;

  Future<void> _open(BuildContext context) async {
    final url = status.storeUrl.trim();
    if (url.isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final msg = status.message.trim().isEmpty
        ? 'صدر تحديثٌ مطلوب للتطبيق — حدّثه للمتابعة.'
        : status.message.trim();

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: Noir.pitchBlack,
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(28),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 380),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 78, height: 78,
                      decoration: BoxDecoration(
                        color: Noir.vintageGold.withValues(alpha: 0.13),
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(color: Noir.vintageGold.withValues(alpha: 0.32)),
                      ),
                      alignment: Alignment.center,
                      child: const Text('⬆️', style: TextStyle(fontSize: 36)),
                    ),
                    const SizedBox(height: 22),
                    const Text(
                      'تحديثٌ مطلوب',
                      style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900, color: Colors.white),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      msg,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 13.5, height: 1.7, color: Noir.textMuted),
                    ),
                    const SizedBox(height: 18),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.035),
                        borderRadius: BorderRadius.circular(11),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('نسختك ${ReleaseGate.instance.version}',
                              style: const TextStyle(fontSize: 11.5, color: Noir.textMuted)),
                          if (status.latest.isNotEmpty) ...[
                            const Text('  ←  ', style: TextStyle(fontSize: 11.5, color: Noir.textMuted)),
                            Text('الأحدث ${status.latest}',
                                style: const TextStyle(fontSize: 11.5, color: Noir.vintageGold, fontWeight: FontWeight.w700)),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: status.storeUrl.trim().isEmpty ? null : () => _open(context),
                        style: FilledButton.styleFrom(
                          backgroundColor: Noir.bloodRed,
                          padding: const EdgeInsets.symmetric(vertical: 15),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                        child: const Text('حدّث الآن',
                            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'بعد التثبيت أعد فتح التطبيق.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 11, color: Noir.textMuted),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
