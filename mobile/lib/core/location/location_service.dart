import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';

import '../api/api_client.dart';
import '../storage/session_store.dart';

// ══════════════════════════════════════════════════════
// 📍 خدمة الموقع — سياج الفعاليّة
//
// 🔴 «إذنٌ دائم» لا وجود له: أقصى ما تعطيه المنصّات هو «أثناء استخدام التطبيق»،
//    وأندرويد ١١+ يُصفّر أذونات التطبيقات المهجورة تلقائيّاً. فالخدمة تفترض سقوط
//    الإذن لا دوامه، وكلّ بوّابةٍ لها مخرجٌ عبر الليدر.
//
// 🔴 ولا تبليغ في الخلفيّة إطلاقاً: `ACCESS_BACKGROUND_LOCATION` يستدعي مراجعةً
//    خاصّة من متجر Play مع إقرارٍ وفيديو، ويستنزف البطاريّة، ويحوّل اللعبة إلى
//    متتبّع. القراءة تجري عند فتح التطبيق، وعند العودة للمقدّمة، وبنبضةٍ خفيفة
//    ما دام مفتوحاً — ونقطة من أغلق تطبيقه تتجمّد، و`capturedAt` يقول ذلك لليدر.
//
// 🔴 وأندرويد وحده يكشف الموقع الوهميّ (`isMocked`) — iOS بلا واجهةٍ لذلك.
// ══════════════════════════════════════════════════════

/// حالة الإذن كما تراها الواجهة — أربع حالاتٍ لكلٍّ منها رسالةٌ مختلفة.
enum LocationStatus {
  unknown,
  /// لم يُسأل بعد — تُعرض شاشة التمهيد
  prompt,
  granted,
  /// رُفض هذه المرّة — يمكن السؤال ثانيةً
  denied,
  /// رُفض نهائيّاً — لا سبيل إلّا إعدادات النظام
  deniedForever,
  /// خدمة الموقع مطفأةٌ على مستوى الجهاز — رسالةٌ مختلفة تماماً عن الرفض
  serviceOff,
}

class GeoFix {
  const GeoFix({
    required this.lat, required this.lng, this.accuracyM,
    required this.capturedAt, this.isMocked = false,
  });

  final double lat;
  final double lng;
  final double? accuracyM;
  final int capturedAt;
  final bool isMocked;

  Map<String, dynamic> toJson() => {
    'lat': lat,
    'lng': lng,
    if (accuracyM != null) 'accuracyM': accuracyM!.round(),
    'capturedAt': capturedAt,
    'isMocked': isMocked,
    'source': 'app',
  };
}

class LocationService extends ChangeNotifier with WidgetsBindingObserver {
  LocationService._();
  static final LocationService instance = LocationService._();

  LocationStatus _status = LocationStatus.unknown;
  GeoFix? _last;
  Timer? _pulse;
  bool _started = false;
  DateTime? _lastSent;

  LocationStatus get status => _status;
  GeoFix? get last => _last;
  bool get granted => _status == LocationStatus.granted;

  /// نبضةٌ خفيفة تُبقي نقطة الخريطة صادقة بلا استنزاف بطاريّة.
  static const _pulseEvery = Duration(minutes: 4);
  /// لا نُغرق الخادم: أقصر فاصلٍ بين تبليغين.
  static const _minGap = Duration(seconds: 30);

  void start() {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    unawaited(refreshStatus());
    _pulse = Timer.periodic(_pulseEvery, (_) => unawaited(readAndReport()));
  }

  void stop() {
    _pulse?.cancel();
    _pulse = null;
    if (_started) WidgetsBinding.instance.removeObserver(this);
    _started = false;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // العودة للمقدّمة = فتحةٌ جديدة عمليّاً
    if (state == AppLifecycleState.resumed) unawaited(readAndReport());
  }

  /// يقرأ الحالة بلا إطلاق نافذة — لتقرّر الواجهة أتعرض التمهيد أم تقرأ صامتةً.
  Future<LocationStatus> refreshStatus() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        _set(LocationStatus.serviceOff);
        return _status;
      }
      final p = await Geolocator.checkPermission();
      _set(switch (p) {
        LocationPermission.always || LocationPermission.whileInUse => LocationStatus.granted,
        LocationPermission.deniedForever => LocationStatus.deniedForever,
        LocationPermission.denied => LocationStatus.prompt,
        _ => LocationStatus.unknown,
      });
    } catch (_) {
      _set(LocationStatus.unknown);
    }
    return _status;
  }

  /// يطلب الإذن — يُنادى **بعد** شاشة التمهيد لا قبلها.
  Future<bool> request() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        _set(LocationStatus.serviceOff);
        return false;
      }
      var p = await Geolocator.checkPermission();
      if (p == LocationPermission.denied) p = await Geolocator.requestPermission();

      if (p == LocationPermission.deniedForever) { _set(LocationStatus.deniedForever); return false; }
      if (p == LocationPermission.denied) { _set(LocationStatus.denied); return false; }

      _set(LocationStatus.granted);
      await readAndReport();
      return true;
    } catch (_) {
      _set(LocationStatus.unknown);
      return false;
    }
  }

  /// يفتح إعدادات التطبيق — المخرج الوحيد بعد الرفض النهائيّ.
  Future<void> openSettings() => Geolocator.openAppSettings();

  /// قراءةٌ واحدة. لا تُطلق نافذةً إن لم يكن الإذن ممنوحاً.
  Future<GeoFix?> read({Duration timeout = const Duration(seconds: 10)}) async {
    if (_status != LocationStatus.granted) {
      await refreshStatus();
      if (_status != LocationStatus.granted) return null;
    }
    try {
      final p = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(accuracy: LocationAccuracy.high, timeLimit: timeout),
      );
      final fix = GeoFix(
        lat: p.latitude,
        lng: p.longitude,
        accuracyM: p.accuracy,
        // زمن القراءة على الجهاز لا زمن وصولها — الخادم يفحص القِدَم به
        capturedAt: p.timestamp.millisecondsSinceEpoch,
        isMocked: p.isMocked,
      );
      _last = fix;
      notifyListeners();
      return fix;
    } catch (_) {
      // مهلةٌ أو تعذّر تحديد: نُبقي آخر قراءة والخادم يحكم عليها بالقِدَم
      return null;
    }
  }

  /// قراءةٌ طازجة للبوّابات — تُستدعى قبل الدخول والطلب مباشرةً.
  /// 🔴 تُرجع آخر قراءةٍ عند فشل الطازجة بدل `null`: إسقاط المحاولة هنا يحرم
  ///    لاعباً حاضراً بسبب ثانيةٍ متأخّرة، والخادم يفحص القِدَم على أيّ حال.
  Future<Map<String, dynamic>?> fixForGate() async {
    final fresh = await read(timeout: const Duration(seconds: 9));
    return (fresh ?? _last)?.toJson();
  }

  /// يقرأ ويُبلّغ — لا يمنع شيئاً ولا يُظهر خطأً.
  Future<void> readAndReport() async {
    if (!SessionStore.instance.isLoggedIn) return;
    if (_status != LocationStatus.granted) return;
    final now = DateTime.now();
    if (_lastSent != null && now.difference(_lastSent!) < _minGap) return;

    final fix = await read(timeout: const Duration(seconds: 8));
    if (fix == null) return;
    _lastSent = now;
    try {
      await ApiClient.instance.post('/api/fnb/fix', body: {'fix': fix.toJson()});
    } catch (_) {
      // الشبكة تتقطّع — لا شيء يتوقّف بسبب نقطةٍ على خريطة
    }
  }

  void _set(LocationStatus s) {
    if (_status == s) return;
    _status = s;
    notifyListeners();
  }
}
