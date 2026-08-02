import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../app/config.dart';
import '../storage/session_store.dart';

// ══════════════════════════════════════════════════════
// 🌐 عميل REST
// ══════════════════════════════════════════════════════
// كل نداء يمرّ من هنا. لا `fetch` مبعثر في الشاشات، ولا رابط يُبنى يدوياً.

/// خطأ يحمل رسالة الخادم **العربية كما هي**.
///
/// الخادم يردّ برسائل عربية مكتوبة للاعب («انتهت صلاحيّة طلب الحجز»،
/// «لا توجد نافذة خدمة مفتوحة»). ترجمة رمز HTTP إلى رسالة عامّة تُضيّع
/// معلومةً كتبها أحدهم عمداً وتستبدل بها «حدث خطأ».
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.code});

  final String message;
  final int? statusCode;
  final String? code;

  bool get isUnauthorized => statusCode == 401;
  bool get isOffline => statusCode == null;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  late final Dio _dio;
  late final AppConfig _config;
  bool _ready = false;

  /// يُستدعى مرّة في bootstrap بعد تحميل الجلسة.
  void init(AppConfig config) {
    if (_ready) return;
    _config = config;
    _dio = Dio(BaseOptions(
      baseUrl: config.baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 25),
      // نستقبل كل الأكواد ونقرّر بأنفسنا — Dio الافتراضيّ يرمي على 4xx
      // فيضيع جسم الاستجابة الذي يحمل الرسالة العربية.
      validateStatus: (_) => true,
      headers: {'Content-Type': 'application/json'},
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        final t = SessionStore.instance.token;
        if (t != null && t.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $t';
        }
        return handler.next(options);
      },
    ));

    if (kDebugMode) {
      _dio.interceptors.add(LogInterceptor(
        request: false, requestHeader: false, requestBody: false,
        responseHeader: false, responseBody: false,
        logPrint: (o) => debugPrint('🌐 $o'),
      ));
    }
    _ready = true;
  }

  AppConfig get config => _config;

  /// 🖼️ رابط رفعٍ مطلق — البوّابة الوحيدة (انظر AppConfig.resolveUpload).
  String upload(String? path) => _config.resolveUpload(path);

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) =>
      _send(() => _dio.get(path, queryParameters: query));

  Future<dynamic> post(String path, {Object? body}) =>
      _send(() => _dio.post(path, data: body));

  Future<dynamic> put(String path, {Object? body}) =>
      _send(() => _dio.put(path, data: body));

  Future<dynamic> delete(String path) => _send(() => _dio.delete(path));

  Future<dynamic> _send(Future<Response> Function() run) async {
    late Response res;
    try {
      res = await run();
    } on DioException catch (e) {
      // لا شبكة / مهلة — رسالة يفهمها اللاعب لا نصّ المكتبة
      throw ApiException(
        e.type == DioExceptionType.connectionTimeout || e.type == DioExceptionType.receiveTimeout
            ? 'الاتصال بطيء — حاول مرّة ثانية'
            : 'لا يوجد اتصال بالإنترنت',
      );
    }

    final code = res.statusCode ?? 0;
    if (code >= 200 && code < 300) return res.data;

    // رسالة الخادم أوّلاً، دائماً
    String msg = 'تعذّر إتمام الطلب';
    String? errCode;
    final d = res.data;
    if (d is Map) {
      final m = d['error'] ?? d['message'];
      if (m is String && m.trim().isNotEmpty) msg = m.trim();
      final c = d['code'];
      if (c is String) errCode = c;
    }
    throw ApiException(msg, statusCode: code, code: errCode);
  }
}
