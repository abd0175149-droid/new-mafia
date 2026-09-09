import 'package:flutter/material.dart';

import 'city_service.dart';

// ══════════════════════════════════════════════════════
// 🏙️ قطع المدينة المشتركة — وسمٌ صغير وسطرُ تطمين
// ══════════════════════════════════════════════════════
// تُستعمل في الفعاليّات والرئيسيّة والسجلّ والتصنيف — قطعةٌ واحدة كي لا
// تنحرف الألوان بين الشاشات. النصّ Tajawal بـ`letterSpacing: 0` دائماً.

TextStyle _t(double size, Color color, {FontWeight weight = FontWeight.w500}) =>
    TextStyle(
      fontFamily: 'Tajawal',
      fontSize: size,
      fontWeight: weight,
      color: color,
      letterSpacing: 0,
    );

/// هل الفعاليّة/المباراة في مدينةٍ غير الأساسيّة؟ (مجهولٌ ⇒ لا)
bool isAwayCity(int? cityId, int? homeCityId) =>
    cityId != null && homeCityId != null && cityId != homeCityId;

/// وسم المدينة — رقاقةٌ صغيرة بلون المدينة.
class CityTag extends StatelessWidget {
  const CityTag({
    super.key,
    required this.cityId,
    required this.name,
    this.size = 9,
    this.icon = true,
  });

  final int? cityId;
  final String name;
  final double size;
  final bool icon;

  @override
  Widget build(BuildContext context) {
    final svc = CityService.instance;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: svc.chipBgFor(cityId),
        border: Border.all(color: svc.chipBorderFor(cityId)),
      ),
      child: Text(icon ? '🏙️ $name' : name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: _t(size, svc.textFor(cityId), weight: FontWeight.w700)),
    );
  }
}

/// سطر التطمين لفعاليّةٍ في مدينةٍ أخرى: أين تُحتسب النقاط، وأنّ رتبة
/// المدينة الأساسيّة لا تتأثّر. يظهر على البطاقة وفي ورقة التأكيد معاً.
class AwayCityNote extends StatelessWidget {
  const AwayCityNote({
    super.key,
    required this.cityName,
    required this.homeCityName,
    this.size = 10,
  });

  final String cityName;
  final String? homeCityName;
  final double size;

  @override
  Widget build(BuildContext context) {
    final home = homeCityName;
    final text = home == null
        ? '🏆 مبارياتها تُحتسب لرتبتك في $cityName'
        : '🏆 مبارياتها تُحتسب لرتبتك في $cityName — رتبتك في $home لا تتأثّر';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        color: CityService.blueAccent.withValues(alpha: 0.10),
        border: Border.all(color: CityService.blueAccent.withValues(alpha: 0.30)),
      ),
      child: Text(text, style: _t(size, CityService.blueText, weight: FontWeight.w500)),
    );
  }
}
