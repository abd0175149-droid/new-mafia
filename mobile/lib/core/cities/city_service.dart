import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../models/city.dart';
import '../api/api_client.dart';

// ══════════════════════════════════════════════════════
// 🏙️ خدمة المدن — القائمة، الألوان، وعلامة «سُئل عن مدينته»
// ══════════════════════════════════════════════════════
// المدن تُجلَب مرّةً من `/api/cities/public` (عامّ بلا مصادقة) وتُحفَظ في
// الذاكرة: تتغيّر بقرارٍ إداريّ نادر، وإعادة جلبها مع كلّ شاشة هدر.
//
// 🎨 الألوان: المدينة ١ (عمّان) تحتفظ بالعنبريّ القائم — هو لون «وجاهيّ»
//    اليوم — وكلّ مدينةٍ أخرى زرقاء، والأونلاين سماويّ كما هو. الاسم
//    لا يقرّر اللون؛ المعرّف وحده.

class CityService {
  CityService._();
  static final CityService instance = CityService._();

  List<City>? _cache;
  Future<List<City>>? _inflight;

  static const _kPromptShown = 'home_city_prompt_shown';

  /// المدينة ذات اللون العنبريّ القائم.
  static const int amberCityId = 1;

  // ── لوحة الألوان ──
  static const amberAccent = Color(0xFFF59E0B);
  static const amberText = Color(0xFFFBBF24);
  static const amberChipBg = Color(0x26F59E0B);
  static const amberChipBorder = Color(0x4DF59E0B);

  static const blueAccent = Color(0xFF4F9DDE);
  static const blueText = Color(0xFF8CC1F2);
  static const blueChipBg = Color(0x294F9DDE);
  static const blueChipBorder = Color(0x664F9DDE);

  static const onlineAccent = Color(0xFF0EA5E9);
  static const onlineText = Color(0xFF7DD3FC);
  static const onlineChipBg = Color(0x260EA5E9);
  static const onlineChipBorder = Color(0x400EA5E9);

  bool _isAmber(int? cityId) => cityId == null || cityId == amberCityId;

  /// لون التمييز (خلفيّات متدرّجة، حدود متوهّجة).
  Color accentFor(int? cityId) => _isAmber(cityId) ? amberAccent : blueAccent;

  /// لون النصّ والأرقام (RR).
  Color textFor(int? cityId) => _isAmber(cityId) ? amberText : blueText;

  Color chipBgFor(int? cityId) => _isAmber(cityId) ? amberChipBg : blueChipBg;
  Color chipBorderFor(int? cityId) => _isAmber(cityId) ? amberChipBorder : blueChipBorder;

  /// ما وصل حتى الآن — فارغة قبل أوّل جلب.
  List<City> get cached => _cache ?? const [];

  /// أيّ استجابةٍ تحمل `cities` تُغذّي الذاكرة — فلا نداء زائد.
  void prime(List<City> cities) {
    if (cities.isNotEmpty) _cache = List.unmodifiable(cities);
  }

  String? nameOf(int? id) {
    if (id == null) return null;
    for (final c in cached) {
      if (c.id == id) return c.name;
    }
    return null;
  }

  /// المدن الفعّالة مرتّبة — من الذاكرة، أو نداءٌ واحد مشترك.
  Future<List<City>> cities({bool force = false}) {
    if (!force && _cache != null) return Future.value(_cache!);
    return _inflight ??= _fetch().whenComplete(() => _inflight = null);
  }

  Future<List<City>> _fetch() async {
    try {
      final r = await ApiClient.instance.get('/api/cities/public');
      if (r is Map && r['success'] == true) {
        final list = City.listFrom(r['cities']);
        _cache = List.unmodifiable(list);
        return list;
      }
    } catch (_) {
      // شبكةٌ غائبة: ما في الذاكرة خيرٌ من استثناء يُسقط شاشة
    }
    return _cache ?? const [];
  }

  /// `PUT /api/player-app/me/home-city` — يعيد (المعرّف، الاسم) كما أكّدهما
  /// الخادم. الفشل يُرمى `ApiException` برسالة الخادم العربيّة.
  Future<(int, String)> setHomeCity(int cityId) async {
    final r = await ApiClient.instance
        .put('/api/player-app/me/home-city', body: {'cityId': cityId});
    if (r is Map && r['success'] == true) {
      final id = r['homeCityId'] is num ? (r['homeCityId'] as num).toInt() : cityId;
      final name = (r['homeCityName'] ?? nameOf(id) ?? '').toString();
      await markHomeCityPromptShown();
      return (id, name);
    }
    throw ApiException(
        (r is Map ? r['error'] as String? : null) ?? 'تعذّر حفظ المدينة');
  }

  // ── علامة «سُئل مرّة» — بديل «لاحقًا» ──
  Future<bool> homeCityPromptShown() async {
    try {
      return (await SharedPreferences.getInstance()).getBool(_kPromptShown) == true;
    } catch (_) {
      return false;
    }
  }

  Future<void> markHomeCityPromptShown() async {
    try {
      await (await SharedPreferences.getInstance()).setBool(_kPromptShown, true);
    } catch (_) {
      // تعذّر الحفظ ⇒ يُسأل ثانيةً — أهون من ألّا يُسأل أبداً
    }
  }
}
