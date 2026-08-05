import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';

// ══════════════════════════════════════════════════════
// 🫧 جسرُ زجاج أبل الأصليّ
// ══════════════════════════════════════════════════════
// `UIGlassEffect` مادّةٌ تُطبَّق على عناصر UIKit، وFlutter يرسم واجهته
// بمحرّكه فلا يرثها. الجسر الوحيد هو Platform View: عرضٌ أصليّ حقيقيّ
// يُركَّب داخل مشهد Flutter، فيرسم Flutter ما تحته في طبقةٍ يعاينها
// الزجاجُ الأصليّ ويكسرها — وهذا ما يجعل الانكسار حقيقياً لا محسوباً.
//
// ⚠️ ثمنُه معروفٌ ومقصودُ القياس في هذه المقارنة:
//    - يتطلّب iOS 26؛ وهدفنا 13.0 فيلزم مسارٌ ثانٍ دائماً.
//    - العرض الأصليّ يجلس فوق سطح Flutter، فأيّ طبقةٍ يرسمها Flutter
//      فوقه (الأوراق السفلية، الحوارات، البوابة الحاجبة) قد تُغطَّى.
//    - أوّل Platform View في التطبيق: يشقّ مشهد Flutter إلى طبقات.

class NativeGlass {
  NativeGlass._();

  static const _channel = MethodChannel('mafia/liquid_glass');
  static const viewType = 'mafia/liquid_glass';

  static bool? _available;

  /// هل يوفّر النظامُ `UIGlassEffect` فعلاً (iOS 26+)؟
  static Future<bool> isAvailable() async {
    if (_available != null) return _available!;
    if (defaultTargetPlatform != TargetPlatform.iOS) return _available = false;
    try {
      _available = await _channel.invokeMethod<bool>('isAvailable') ?? false;
    } on PlatformException catch (e) {
      debugPrint('⚠️ تعذّر سؤال النظام عن الزجاج: $e');
      _available = false;
    } on MissingPluginException {
      _available = false;
    }
    return _available!;
  }
}

/// خلفيةٌ زجاجيّة أصليّة: كبسولةٌ ودائرةٌ داخل `UIGlassContainerEffect`
/// فيندمجان حين يقتربان — سلوك iOS 26 الذي لا يحاكيه شيدر.
///
/// لا يرسم أيقونات ولا نصّاً: Flutter يرسمها فوقه، فتبقى الخطوط العربية
/// وRTL ومنطق التنقّل كما هي.
class NativeGlassBackdrop extends StatelessWidget {
  const NativeGlassBackdrop({
    super.key,
    required this.barHeight,
    required this.radius,
    required this.centerSize,
    required this.centerLift,
    this.centerTint,
    this.spacing = 12,
    this.clearStyle = false,
  });

  final double barHeight;
  final double radius;
  final double centerSize;
  final double centerLift;

  /// صبغة الزرّ المركزيّ حين يكون نشطاً (ARGB).
  final int? centerTint;

  /// المسافة التي عندها يبدأ العنصران بالاندماج.
  final double spacing;

  /// `.clear` بدل `.regular`: زجاجٌ أشفّ يُظهر انكسارَه على ثيمٍ داكن.
  final bool clearStyle;

  @override
  Widget build(BuildContext context) {
    return UiKitView(
      viewType: NativeGlass.viewType,
      creationParams: <String, dynamic>{
        'barHeight': barHeight,
        'radius': radius,
        'centerSize': centerSize,
        'centerLift': centerLift,
        'spacing': spacing,
        'interactive': true,
        'clearStyle': clearStyle,
        if (centerTint != null) 'centerTint': centerTint,
      },
      creationParamsCodec: const StandardMessageCodec(),
      // اللمس كلّه لـFlutter: الأيقونات ومعالجاتها فوق هذا العرض.
      hitTestBehavior: PlatformViewHitTestBehavior.transparent,
    );
  }
}
