import 'package:flutter/material.dart';
import 'package:app_settings/app_settings.dart';

import '../../core/location/location_service.dart';

// ══════════════════════════════════════════════════════
// 📍 بوّابةُ الموقع الإلزاميّة — قرارُ المالك
//
// 🔴 التطبيقُ لا يعمل بلا موقع. الفرقُ عن `LocationIntroSheet` جوهريّ: تلك
//    ورقةٌ تشرح وتُطوى بلا أثر، وهذه **حاجزٌ** لا يُتجاوز. والسببُ تشغيليّ:
//    السياجُ الجغرافيّ يحمي الحضورَ من الغشّ، ولاعبٌ بلا موقعٍ يُبطل الحمايةَ
//    كلَّها بإطفاءِ مفتاح.
//
// 🔴 وثلاثُ حالاتٍ لا واحدة، ولكلٍّ فعلٌ مختلف: خدمةُ الجهاز مطفأة (تُفتح
//    إعداداتُ الموقع)، أو الإذنُ مرفوضٌ هذه المرّة (يُطلب ثانيةً)، أو مرفوضٌ
//    نهائيّاً (لا سبيلَ إلّا إعداداتُ التطبيق). زرٌّ واحدٌ لثلاثتها يعني
//    ضغطةً لا تفعل شيئاً في حالتين من ثلاث.
//
// 🔴 ولا تُعرض على المسارات العامّة ولا مسار الانضمام: من يمسح رمزاً لغرفةٍ
//    بدأت يُحجب عن اللعب لا عن الشاشة، والحجبُ قبل الدخول يمنع من لا حسابَ
//    له من إنشاء واحد.
// ══════════════════════════════════════════════════════

const _gold = Color(0xFFC5A059);

class LocationRequiredGate extends StatefulWidget {
  const LocationRequiredGate({super.key, required this.status, required this.onResolved});

  final LocationStatus status;
  final VoidCallback onResolved;

  @override
  State<LocationRequiredGate> createState() => _LocationRequiredGateState();
}

class _LocationRequiredGateState extends State<LocationRequiredGate> with WidgetsBindingObserver {
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // 🔴 يُعاد الفحصُ عند العودة من الإعدادات: بدونه يفتح اللاعبُ الإعدادات
  //    ويُفعّل الخدمةَ ويعود فيجد الجدارَ نفسَه — فيظنّ التطبيقَ معطّلاً.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _recheck();
  }

  Future<void> _recheck() async {
    final st = await LocationService.instance.refreshStatus();
    if (st == LocationStatus.granted && mounted) widget.onResolved();
  }

  Future<void> _act() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      switch (widget.status) {
        // الخدمةُ مطفأةٌ على مستوى الجهاز — لا ينفع طلبُ إذن
        case LocationStatus.serviceOff:
          await AppSettings.openAppSettings(type: AppSettingsType.location);
        // رُفض نهائيّاً — لا يظهر حوارُ النظام ثانيةً
        case LocationStatus.deniedForever:
          await AppSettings.openAppSettings();
        // يمكن السؤالُ ثانيةً
        default:
          final ok = await LocationService.instance.request();
          if (ok && mounted) { widget.onResolved(); return; }
      }
      await _recheck();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  ({String title, String body, String action}) get _copy => switch (widget.status) {
        LocationStatus.serviceOff => (
          title: 'خدمةُ الموقع مُطفأة',
          body: 'التطبيقُ لا يعمل بدون تفعيل خدمة الموقع. فعِّلها من إعدادات جهازك ثمّ عُد.',
          action: 'افتح إعدادات الموقع',
        ),
        LocationStatus.deniedForever => (
          title: 'إذنُ الموقع مرفوض',
          body: 'التطبيقُ لا يعمل بدون تفعيل خدمة الموقع. امنحِ الإذنَ من إعدادات التطبيق ثمّ عُد.',
          action: 'افتح إعدادات التطبيق',
        ),
        _ => (
          title: 'نحتاج موقعَك',
          body: 'التطبيقُ لا يعمل بدون تفعيل خدمة الموقع — بها نتحقّق من حضورك في القاعة.',
          action: 'تفعيلُ الموقع',
        ),
      };

  @override
  Widget build(BuildContext context) {
    final c = _copy;
    return Material(
      color: const Color(0xFF0B0B0D),
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 84, height: 84,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _gold.withValues(alpha: .12),
                    border: Border.all(color: _gold.withValues(alpha: .3)),
                  ),
                  child: const Icon(Icons.location_on_outlined, color: _gold, size: 40),
                ),
                const SizedBox(height: 22),
                Text(c.title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        fontFamily: 'Tajawal', fontSize: 20, fontWeight: FontWeight.w800,
                        color: Colors.white, height: 1.35)),
                const SizedBox(height: 10),
                Text(c.body,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontFamily: 'Tajawal', fontSize: 14, height: 1.75,
                        color: Colors.white.withValues(alpha: .62))),
                const SizedBox(height: 26),
                SizedBox(
                  width: double.infinity, height: 52,
                  child: FilledButton(
                    onPressed: _busy ? null : _act,
                    style: FilledButton.styleFrom(
                      backgroundColor: _gold,
                      foregroundColor: Colors.black,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: _busy
                        ? const SizedBox(width: 20, height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black54))
                        : Text(c.action,
                            style: const TextStyle(
                                fontFamily: 'Tajawal', fontSize: 15, fontWeight: FontWeight.w800)),
                  ),
                ),
                const SizedBox(height: 12),
                // 🔴 «تحقّقتُ» لا «تخطّي»: البوّابةُ لا تُتجاوز، لكنّ من فعّل من
                //    الإعدادات يدويّاً يحتاج طريقاً لإعادة الفحص بلا إغلاق التطبيق.
                TextButton(
                  onPressed: _busy ? null : _recheck,
                  child: Text('فعّلتُها — أعِد الفحص',
                      style: TextStyle(
                          fontFamily: 'Tajawal', fontSize: 13,
                          color: Colors.white.withValues(alpha: .5))),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
