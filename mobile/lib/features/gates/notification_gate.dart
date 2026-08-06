import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';

import '../../app/theme/theme.dart';
import '../../core/push/push_service.dart';

// ══════════════════════════════════════════════════════
// 🔔 بوابة الإشعارات — §4.3 في الملفّ 11
// ══════════════════════════════════════════════════════
// حجب كامل: تستبدل الغلاف ولا يمكن التنقّل خلفها.
//
// 📌 شاشة «needsInstall» في الويب تسقط هنا كلياً — كانت لقيد Safari على
//    الـPWA، ولا وجود له في تطبيق أصليّ. الأسبقية الباقية:
//    prompt ← denied.

class NotificationGate extends StatefulWidget {
  const NotificationGate({super.key, required this.status, required this.onResolved});

  final PushPermission status;
  final VoidCallback onResolved;

  @override
  State<NotificationGate> createState() => _NotificationGateState();
}

class _NotificationGateState extends State<NotificationGate> with WidgetsBindingObserver {
  bool _asking = false;

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

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // العائد من إعدادات النظام بعد التفعيل يدخل مباشرةً بلا ضغط زرّ —
    // تحسين على الويب الذي كان يتطلّب إعادة تحميل يدوية.
    if (state == AppLifecycleState.resumed) _recheck();
  }

  Future<void> _recheck() async {
    final s = await PushService.instance.permission();
    if (s == PushPermission.granted && mounted) widget.onResolved();
  }

  Future<void> _ask() async {
    setState(() => _asking = true);
    final ok = await PushService.instance.requestPermissionAndRegister();
    if (!mounted) return;
    setState(() => _asking = false);
    // الفشل يُسجَّل ولا يُعرض — تكافؤ مع الويب
    if (ok) widget.onResolved();
  }

  @override
  Widget build(BuildContext context) {
    final denied = widget.status == PushPermission.denied;

    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: Noir.pitchBlack,
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 448),
                child: Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: const Color(0xE60C0C0C),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                        color: denied ? const Color(0x33EF4444) : const Color(0x33F59E0B)),
                    boxShadow: [
                      BoxShadow(
                        color: denied ? const Color(0x1AEF4444) : const Color(0x26F59E0B),
                        blurRadius: 50,
                      ),
                    ],
                  ),
  child: Column(
  mainAxisSize: MainAxisSize.min,
  children: [
    denied ? _denied() : _prompt(),
    // 🔴 قرار R1 (91 §6.7): Apple ترفض اشتراط الإشعارات
    //    للاستخدام (Guideline 4.5.4). فعلى **iOS حصراً**
    //    مخرجٌ من البوابة الحاجبة بلا تسجيل توكن.
    //    أندرويد يبقى محجوباً كما هو — ومعه رمز 1998.
    //    البوابة تعود في الإقلاع التالي: إزعاجٌ خفيف
    //    مقابل ألّا يُحبَس المستخدم ولا يُرفَض التطبيق.
    if (defaultTargetPlatform == TargetPlatform.iOS) ...[
      const SizedBox(height: 12),
      _GateButton(
        label: "لاحقاً",
        onTap: widget.onResolved,
        color: const Color(0x0DFFFFFF),
        textColor: const Color(0xFF9CA3AF),
      ),
    ],
  ],
),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  // ── طلب الإذن ──
  Widget _prompt() => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Hero(
            icon: Icons.notifications_active_outlined,
            color: const Color(0xFFF59E0B),
            bounce: true,
          ),
          const SizedBox(height: 24),
          const Text('تفعيل الإشعارات الفورية 🔔',
              textAlign: TextAlign.center,
              style: TextStyle(fontFamily: 'Tajawal', fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white, letterSpacing: 0)),
          const SizedBox(height: 24),
          const Text(
            'تتطلب لعبة مافيا تفعيل الإشعارات الفورية لتنبيهك بدورك الفوري أثناء اللعب. لن تتمكن من المتابعة بدون تفعيلها لضمان سرعة اللعبة وحماسها للجميع.',
            textAlign: TextAlign.center,
            style: TextStyle(fontFamily: 'Tajawal', fontSize: 14, color: Color(0xFF9CA3AF), height: 1.7, letterSpacing: 0),
          ),
          const SizedBox(height: 24),
          _GateButton(
            label: _asking ? 'جاري التفعيل...' : 'تفعيل الآن وسماح ⚡',
            onTap: _asking ? null : _ask,
            gradient: const LinearGradient(colors: [Color(0xFFF59E0B), Color(0xFFCA8A04)]),
            textColor: Colors.black,
          ),
          const SizedBox(height: 16),
          RichText(
            textAlign: TextAlign.center,
            text: const TextSpan(
              style: TextStyle(fontFamily: 'Tajawal', fontSize: 12, color: Color(0xFF6B7280), letterSpacing: 0),
              children: [
                TextSpan(text: 'عند الضغط، سيظهر لك طلب النظام، يرجى اختيار '),
                TextSpan(text: '"سماح" (Allow)',
                    style: TextStyle(color: Color(0xFFF59E0B), fontWeight: FontWeight.w600)),
                TextSpan(text: '.'),
              ],
            ),
          ),
        ],
      );

  // ── رُفض الإذن ──
  Widget _denied() => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Hero(icon: Icons.gpp_maybe_outlined, color: const Color(0xFFEF4444), bounce: false),
          const SizedBox(height: 24),
          const Text('الإشعارات محظورة بالخطأ! ⚠️',
              textAlign: TextAlign.center,
              style: TextStyle(fontFamily: 'Tajawal', fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFFEF4444), letterSpacing: 0)),
          const SizedBox(height: 24),
          const Text(
            'لقد قمت برفض إذن الإشعارات مسبقاً. لا يمكنك اللعب أو تلقي دورك الفوري بدونها. يرجى إعادة تفعيلها باتباع الخطوات التالية:',
            textAlign: TextAlign.center,
            style: TextStyle(fontFamily: 'Tajawal', fontSize: 14, color: Color(0xFF9CA3AF), height: 1.7, letterSpacing: 0),
          ),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xCC121212),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0x0DFFFFFF)),
            ),
            child: const Column(children: [
              _Step(1, 'اضغط زر "فتح الإعدادات" بالأسفل.'),
              SizedBox(height: 12),
              _Step(2, 'ابحث عن خيار "الإشعارات" (Notifications).'),
              SizedBox(height: 12),
              _Step(3, 'قم بتغيير الإذن إلى "سماح" (Allow).'),
            ]),
          ),
          const SizedBox(height: 24),
          _GateButton(
            label: 'فتح الإعدادات ⚙️',
            onTap: PushService.instance.openSystemSettings,
            color: const Color(0x1AFFFFFF),
            textColor: Colors.white,
          ),
          const SizedBox(height: 12),
          _GateButton(
            label: 'إعادة التحقق 🔄',
            onTap: _recheck,
            color: const Color(0x1AFFFFFF),
            textColor: Colors.white,
          ),
        ],
      );
}

class _Hero extends StatelessWidget {
  const _Hero({required this.icon, required this.color, required this.bounce});

  final IconData icon;
  final Color color;
  final bool bounce;

  @override
  Widget build(BuildContext context) => Container(
        width: 80, height: 80,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: color.withValues(alpha: 0.1),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Icon(icon, size: 40, color: color),
      );
}

class _Step extends StatelessWidget {
  const _Step(this.n, this.text);
  final int n;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 20, height: 20,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0x1AEF4444),
              border: Border.all(color: const Color(0x4DEF4444)),
            ),
            child: Center(
              child: Text('$n',
                  style: const TextStyle(fontFamily: 'Tajawal', fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFFEF4444), letterSpacing: 0)),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text,
                style: const TextStyle(fontFamily: 'Tajawal', fontSize: 12, color: Color(0xFFD1D5DB), height: 1.6, letterSpacing: 0)),
          ),
        ],
      );
}

class _GateButton extends StatelessWidget {
  const _GateButton({
    required this.label, required this.onTap,
    this.gradient, this.color, required this.textColor,
  });

  final String label;
  final VoidCallback? onTap;
  final Gradient? gradient;
  final Color? color;
  final Color textColor;

  @override
  Widget build(BuildContext context) => Opacity(
        opacity: onTap == null ? 0.5 : 1,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              gradient: gradient,
              color: color,
              border: gradient == null ? Border.all(color: const Color(0x1AFFFFFF)) : null,
            ),
            child: Text(label,
                textAlign: TextAlign.center,
                style: TextStyle(fontFamily: 'Tajawal', fontSize: 14, fontWeight: FontWeight.bold, color: textColor, letterSpacing: 0)),
          ),
        ),
      );
}
