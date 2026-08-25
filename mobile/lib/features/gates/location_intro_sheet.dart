import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app/theme/colors.dart';
import '../../core/location/location_service.dart';

// ══════════════════════════════════════════════════════
// 📍 تمهيد إذن الموقع — يُعرض مرّةً عند أوّل فتحة
//
// 🔴 لماذا تمهيدٌ قبل نافذة النظام: نافذةُ إذنٍ تنبثق في وجه لاعبٍ فتح التطبيق
//    ليتصفّح رتبته تُرفَض غالباً. والرفض النهائيّ لا مخرج منه إلّا إعدادات
//    النظام — فرفضةٌ واحدة قد تُخرج اللاعب من المنظومة عمليّاً. شاشةٌ واحدة
//    تشرح السبب قبلها تقلب النتيجة تماماً.
//
// 🔴 وليست بوّابةً حاجبة كبوّابة الإشعارات: اللعبة تعمل بلا موقع، والسياج وحده
//    هو ما يتأثّر — ومخرجه أنّ الليدر يضيف اللاعب يدويّاً. فالحجب هنا عقوبةٌ
//    بلا سبب.
// ══════════════════════════════════════════════════════

const _seenKey = 'geo_intro_seen_v1';
const _deniedNagKey = 'geo_denied_nag_at';

/// يعرض التمهيد إن لزم. يُنادى بعد تسجيل الدخول وعند كلّ فتحة.
Future<void> maybeShowLocationIntro(BuildContext context) async {
  final st = await LocationService.instance.refreshStatus();
  // ممنوحٌ سلفاً ⇒ لا نافذة أبداً، القراءة صامتة
  if (st == LocationStatus.granted) {
    await LocationService.instance.readAndReport();
    return;
  }
  // 🔴 الرفض النهائيّ: التطبيق — خلافاً للويب — يملك مدخلاً مباشراً لإعدادات
  //    النظام. فبدل تركه بلا مخرج نعرض له كيف يعود بضغطة.
  //    ولا نعرضها في كلّ فتحة: مرّةً كلّ ٢٤ ساعة يكفي لتذكيرٍ بلا إزعاج.
  if (st == LocationStatus.deniedForever || st == LocationStatus.serviceOff) {
    final prefs = await SharedPreferences.getInstance();
    final last = prefs.getInt(_deniedNagKey) ?? 0;
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    if (nowMs - last < 24 * 3600 * 1000) return;
    await prefs.setInt(_deniedNagKey, nowMs);
    if (!context.mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _LocationBlockedSheet(serviceOff: st == LocationStatus.serviceOff),
    );
    return;
  }

  final prefs = await SharedPreferences.getInstance();
  if (prefs.getBool(_seenKey) == true) return;

  if (!context.mounted) return;
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _LocationIntroSheet(),
  );
}

class _LocationIntroSheet extends StatefulWidget {
  const _LocationIntroSheet();

  @override
  State<_LocationIntroSheet> createState() => _LocationIntroSheetState();
}

class _LocationIntroSheetState extends State<_LocationIntroSheet> {
  bool _busy = false;

  Future<void> _allow() async {
    setState(() => _busy = true);
    // 🔴 نُعلّم «شُوهد» قبل الطلب لا بعده: لو أغلق النافذة بالضغط خارجها بعد
    //    ظهور نافذة النظام، لا نُعيد التمهيد في كلّ فتحةٍ فنُزعجه.
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_seenKey, true);
    await LocationService.instance.request();
    if (mounted) Navigator.of(context).pop();
  }

  void _later() {
    // 🔴 لا نكتب العلامة هنا عمداً: «ليس الآن» تأجيلٌ لا رفضٌ دائم، فيُسأل في
    //    الفتحة التالية بدل أن نفقد اللاعب إلى الأبد.
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Noir.noirCardBg,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Noir.vintageGold.withValues(alpha: 0.28)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64, height: 64,
              decoration: BoxDecoration(
                color: Noir.vintageGold.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: Noir.vintageGold.withValues(alpha: 0.3)),
              ),
              alignment: Alignment.center,
              child: const Text('📍', style: TextStyle(fontSize: 30)),
            ),
            const SizedBox(height: 16),
            const Text(
              'نحتاج إذن موقعك',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: Colors.white),
            ),
            const SizedBox(height: 8),
            const Text(
              'نستخدمه لأمرين فقط: دخول غرفة الفعاليّة، والطلب من المنيو — '
              'كي نتأكّد أنّك في المكان.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, height: 1.6, color: Noir.textMuted),
            ),
            const SizedBox(height: 16),
            ...const [
              ('✅', 'الحجز يبقى متاحاً من أيّ مكان'),
              ('🔕', 'لا نتتبّعك في الخلفيّة — يُقرأ الموقع وأنت داخل التطبيق فقط'),
              ('📍', 'نحفظ آخر نقطةٍ فقط — لا سجلّ تحرّكات'),
            ].map((e) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.03),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(e.$1, style: const TextStyle(fontSize: 13)),
                    const SizedBox(width: 9),
                    Expanded(child: Text(
                      e.$2,
                      style: const TextStyle(fontSize: 12, height: 1.5, color: Noir.swalText),
                    )),
                  ],
                ),
              ),
            )),
            const SizedBox(height: 6),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _busy ? null : _allow,
                style: FilledButton.styleFrom(
                  backgroundColor: Noir.bloodRed,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: Text(
                  _busy ? 'يقرأ موقعك…' : 'تابع',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900),
                ),
              ),
            ),
            TextButton(
              onPressed: _busy ? null : _later,
              child: const Text('ليس الآن', style: TextStyle(fontSize: 12, color: Noir.textMuted)),
            ),
          ],
        ),
      ),
    );
  }
}


// ══════════════════════════════════════════════════════
// 🔧 إذنٌ مرفوضٌ نهائيّاً أو خدمةٌ مطفأة — المخرج بضغطة
// حالتان مختلفتان تماماً برسالتين مختلفتين: «رفضتَ الإذن» غير «الـGPS مطفأ
// في جهازك» — وخلطهما يرسل اللاعب إلى الشاشة الخطأ.
// ══════════════════════════════════════════════════════
class _LocationBlockedSheet extends StatelessWidget {
  const _LocationBlockedSheet({required this.serviceOff});

  final bool serviceOff;

  @override
  Widget build(BuildContext context) {
    final steps = serviceOff
        ? const [
            'افتح إعدادات الهاتف',
            'فعّل «خدمة الموقع» (GPS)',
            'ارجع للتطبيق — يُقرأ موقعك تلقائيّاً',
          ]
        : const [
            'اضغط «افتح الإعدادات» أدناه',
            'اختر «الأذونات» ← «الموقع»',
            'اختر «أثناء استخدام التطبيق»',
            'ارجع للتطبيق — يُقرأ موقعك تلقائيّاً',
          ];

    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Noir.noirCardBg,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Noir.bloodRed.withValues(alpha: 0.35)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 22, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56, height: 56,
              decoration: BoxDecoration(
                color: Noir.bloodRed.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Noir.bloodRed.withValues(alpha: 0.35)),
              ),
              alignment: Alignment.center,
              child: const Text('🔧', style: TextStyle(fontSize: 26)),
            ),
            const SizedBox(height: 14),
            Text(
              serviceOff ? 'خدمة الموقع مطفأة' : 'إذن الموقع مرفوض',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Colors.white),
            ),
            const SizedBox(height: 7),
            const Text(
              'لن تستطيع دخول غرفة الفعاليّة ولا الطلب من المنيو حتّى تُفعّله.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12.5, height: 1.6, color: Noir.textMuted),
            ),
            const SizedBox(height: 14),
            ...steps.asMap().entries.map((e) => Padding(
              padding: const EdgeInsets.only(bottom: 7),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.03),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 19, height: 19,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: Noir.vintageGold.withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text('${e.key + 1}',
                          style: const TextStyle(fontSize: 10, color: Noir.vintageGold)),
                    ),
                    const SizedBox(width: 9),
                    Expanded(child: Text(e.value,
                        style: const TextStyle(fontSize: 12, height: 1.5, color: Noir.swalText))),
                  ],
                ),
              ),
            )),
            const SizedBox(height: 4),
            if (!serviceOff)
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () async {
                    await LocationService.instance.openSettings();
                    if (context.mounted) Navigator.of(context).pop();
                  },
                  style: FilledButton.styleFrom(
                    backgroundColor: Noir.bloodRed,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
                  ),
                  child: const Text('افتح الإعدادات',
                      style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900)),
                ),
              ),
            const SizedBox(height: 6),
            const Text(
              'أو اطلب من موجّه اللعبة إضافتك يدويّاً — يستطيع ذلك دائماً.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, height: 1.5, color: Noir.textMuted),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('لاحقاً', style: TextStyle(fontSize: 12, color: Noir.textMuted)),
            ),
          ],
        ),
      ),
    );
  }
}
