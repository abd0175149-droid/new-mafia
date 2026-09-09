import 'package:flutter/material.dart';

import '../order/order_screen.dart';
import '../order/order_widgets.dart' show kGoldBorder, kPanelBg;

// ══════════════════════════════════════════════════════
// 🍽️ ورقة منيو المكان — استعراضٌ قبل الحجز
// 🎯 تصميم «الرفّ» 2026-09-09: العارض هو `OrderScreen(mode: 'browse')` نفسه —
//    لا عارض ثانٍ يتخلّف عن الأوّل (كان القديم يقرأ `components` والخادم يعيد
//    `slots`، فظهرت العروض بلا مكوّنات). **عرضٌ فقط**: لا سلّة ولا طلب هنا.
// 🚫 بلا سحبٍ للإغلاق (enableDrag=false) — سحبةٌ عفويّة كانت تُغلق الورقة.
// ══════════════════════════════════════════════════════

/// نقطة عامّة بلا مصادقة، ولا تكشف حصّة النادي (الخادم يجرّدها).
Future<void> showLocationMenu(
  BuildContext context, {
  required int locationId,
  required String locationName,
}) {
  final h = MediaQuery.sizeOf(context).height * 0.85;
  return showModalBottomSheet<void>(
    context: context,
    // 🔴 على الجذر كبقيّة الأوراق: الكبسولة الزجاجيّة الطافية فوق ورقةٍ
    //    مفتوحة تبدو عطلاً في التركيب. انظر التعليق في `activity_sheets`.
    useRootNavigator: true,
    enableDrag: false,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0xE6000000),
    isScrollControlled: true,
    constraints: BoxConstraints(maxWidth: 512, maxHeight: h),
    builder: (_) => ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      child: DecoratedBox(
        decoration: const BoxDecoration(
          color: kPanelBg,
          border: Border(top: BorderSide(color: kGoldBorder)),
        ),
        child: SizedBox(
          height: h,
          child: OrderScreen(
            mode: 'browse',
            embedded: true,
            locationId: locationId,
            locationName: locationName,
          ),
        ),
      ),
    ),
  );
}
