import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/router.dart';
import '../push/push_service.dart';

// ══════════════════════════════════════════════════════
// 📣 ORDER-3 — بانر الإشعار داخل التطبيق
// ══════════════════════════════════════════════════════
// 🔴 على iOS لا يُعرض إشعار **نظام** والتطبيقُ مفتوح — قرارٌ مقفول (91 §4.6)
//    تفادياً للتكرار. لكنّ الأثر العمليّ أن اللاعب **لا يرى شيئاً**: يتحدّث
//    عدّاد الجرس فقط، فيفوته إشعارٌ حسّاسٌ زمنياً (بدء نشاط، حالة طلب) وهو
//    يتصفّح شاشةً أخرى.
//
// هذا البانر يسدّ الفجوة **بلا نقض القرار**: ليس إشعار نظام، ولا يخرج من
// التطبيق، ولا يتكرّر مع شيء.
//
// 🔴 وأندرويد لا يعرضه: هناك إشعارٌ نظاميّ محلّيّ يُرسم أصلاً، فالبانر
//    فوقه تكرارٌ حقيقيّ.
class InAppBanner extends StatefulWidget {
  const InAppBanner({super.key});

  @override
  State<InAppBanner> createState() => _InAppBannerState();
}

class _InAppBannerState extends State<InAppBanner>
    with SingleTickerProviderStateMixin {
  // 🔴 يُهيّأ في `initState` لا بـ`late final`: هذا البانر قد **لا يُبنى
  //    محتواه قطّ** (لا إشعار طوال الجلسة)، فتبقى `late` غير مهيّأة —
  //    ثمّ يستدعيها `dispose` فتُنشأ **وقت التفكيك** والشجرة تُهدَم:
  //      «Looking up a deactivated widget's ancestor is unsafe»
  //    علّةٌ وقعت في هذا المشروع من قبل ووقعتُ فيها ثانيةً؛ أمسكها
  //    سيناريو الجهاز.
  late final AnimationController _anim;
  InAppAlert? _current;
  Timer? _hide;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 260),
    );
    PushService.instance.inAppAlert.addListener(_onAlert);
  }

  @override
  void dispose() {
    PushService.instance.inAppAlert.removeListener(_onAlert);
    _hide?.cancel();
    _anim.dispose();
    super.dispose();
  }

  void _onAlert() {
    final a = PushService.instance.inAppAlert.value;
    if (a == null || !mounted) return;
    // 🔴 يُصفَّر فوراً: إشعارٌ ثانٍ بنفس المحتوى يجب أن يُعرض من جديد،
    //    وقيمةٌ باقيةٌ في المُنبِّه تمنع إشعاره بالتغيّر.
    PushService.instance.inAppAlert.value = null;
    _hide?.cancel();
    setState(() => _current = a);
    _anim.forward(from: 0);
    _hide = Timer(const Duration(seconds: 5), _dismiss);
  }

  void _dismiss() {
    if (!mounted) return;
    _anim.reverse().then((_) {
      if (mounted) setState(() => _current = null);
    });
  }

  @override
  Widget build(BuildContext context) {
    final a = _current;
    if (a == null) return const SizedBox.shrink();

    return Positioned(
      top: MediaQuery.paddingOf(context).top + 6,
      left: 12,
      right: 12,
      child: SlideTransition(
        position: Tween(begin: const Offset(0, -1.4), end: Offset.zero)
            .animate(CurvedAnimation(parent: _anim, curve: Curves.easeOutCubic)),
        child: FadeTransition(
          opacity: _anim,
          child: Material(
            type: MaterialType.transparency,
            child: GestureDetector(
              onTap: () {
                _dismiss();
                if (a.route != null) navigateTo(a.route);
              },
              // سحبٌ لأعلى يُخفيه — أقرب إيماءةٍ لإشعار النظام.
              onVerticalDragEnd: (d) {
                if ((d.primaryVelocity ?? 0) < 0) _dismiss();
              },
              behavior: HitTestBehavior.opaque,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xF01A140C),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0x59C5A059)),
                  boxShadow: const [
                    BoxShadow(color: Color(0xB3000000), blurRadius: 24),
                  ],
                ),
                child: Row(children: [
                  const Text('🔔', style: TextStyle(fontSize: 18)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(a.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontFamily: 'Tajawal',
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFFC5A059),
                                letterSpacing: 0)),
                        if (a.body.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(a.body,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontFamily: 'Tajawal',
                                  fontSize: 11,
                                  color: Color(0xFFD8CFC0),
                                  letterSpacing: 0)),
                        ],
                      ],
                    ),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
