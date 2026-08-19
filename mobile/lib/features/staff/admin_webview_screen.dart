import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/api/api_client.dart';
import '../../core/storage/session_store.dart';
import '../../models/player.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🧑‍💼 لوحة الإدارة داخل التطبيق — بطلب المالك
// ══════════════════════════════════════════════════════
// 🔴 لماذا WebView لا فتحٌ في المتصفّح: اللوحة **تحتاج جلسةً مصادَقة**.
//    فتحُها خارجاً يعني أن الموظّف يسجّل دخوله من جديد هناك — وقد لا يكون
//    مسجّلاً أصلاً. وتوكن الموظّف محفوظٌ عندنا في Keychain (AUTH-2)، فحقنُه
//    يجعله يدخل مباشرةً.
//
// 🔴 والحقن في `onPageStarted` لا `onPageFinished`: الوثيقة الجديدة تكون
//    قد أُنشئت ولم تُنفَّذ حزمة التطبيق بعد، فيجد الداشبورد التوكن حين
//    يقرؤه عند التركيب. الحقن بعد الانتهاء يعني صفحةَ دخولٍ ظهرت ثمّ
//    تصحيحاً متأخّراً.
//
// 🔴 والمفاتيح **نفس ما يكتبه الويب** (`PlayerContext.tsx`): `token`
//    و`user`. اختلافُ مفتاحٍ واحد يعني لوحةً تطلب تسجيل الدخول رغم وجود
//    الجلسة.
class AdminWebViewScreen extends StatefulWidget {
  const AdminWebViewScreen({super.key});

  @override
  State<AdminWebViewScreen> createState() => _AdminWebViewScreenState();
}

class _AdminWebViewScreenState extends State<AdminWebViewScreen> {
  late final WebViewController _c;
  bool _loading = true;
  String? _error;
  int _progress = 0;

  @override
  void initState() {
    super.initState();
    final staff = SessionStore.instance.staff;
    final token = SessionStore.instance.staffToken;

    _c = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0A0A0A))
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (p) => mounted ? setState(() => _progress = p) : null,
        onPageStarted: (_) {
          if (token != null && staff != null) {
            _c.runJavaScript(_injectJs(token, staff));
          }
        },
        onPageFinished: (_) => mounted ? setState(() => _loading = false) : null,
        onWebResourceError: (e) {
          // 🔴 أخطاء الموارد الفرعيّة (صورةٌ أو خطّ) لا تُفشل الصفحة —
          //    عرضُها كخطأٍ يُخفي لوحةً تعمل.
          // `isForMainFrame` قابلةٌ للعدم على بعض المنصّات — والعدم
          // يُعامَل كإطارٍ فرعيّ فلا يُخفي لوحةً تعمل بسبب صورةٍ فشلت.
          if (e.isForMainFrame != true) return;
          if (mounted) {
            setState(() {
              _loading = false;
              _error = 'تعذّر تحميل اللوحة — تحقّق من اتّصالك';
            });
          }
        },
      ))
      ..loadRequest(Uri.parse('${ApiClient.instance.config.baseUrl}/admin'));
  }

  /// يكتب مفاتيح جلسة الموظّف كما يكتبها الويب حرفياً.
  String _injectJs(String token, StaffInfo staff) {
    final user = jsonEncode({
      'id': staff.staffId,
      'username': staff.username,
      'displayName': staff.displayName,
      'role': staff.role,
    });
    // 🔴 داخل try: بعض المسارات تمنع التخزين، وخطأٌ هنا يوقف تنفيذ
    //    السكربت كلّه فتبقى الصفحة بلا جلسة **وبلا رسالة**.
    return '''
try {
  localStorage.setItem('token', ${jsonEncode(token)});
  localStorage.setItem('user', ${jsonEncode(user)});
} catch (e) {}
''';
  }

  void _retry() {
    setState(() { _loading = true; _error = null; });
    _c.reload();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: const Color(0xFF0A0A0A),
        appBar: AppBar(
          backgroundColor: const Color(0xFF0A0A0A),
          surfaceTintColor: Colors.transparent,
          title: Text('لوحة الإدارة',
              style: ar(15,
                  color: const Color(0xFFC5A059), weight: FontWeight.w900)),
          leading: IconButton(
            icon: const Icon(Icons.close, size: 20),
            color: const Color(0xFF9A8F7E),
            onPressed: () => Navigator.of(context).pop(),
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh, size: 19),
              color: const Color(0xFF9A8F7E),
              onPressed: _retry,
            ),
          ],
          bottom: _loading
              ? PreferredSize(
                  preferredSize: const Size.fromHeight(2),
                  child: LinearProgressIndicator(
                    value: _progress == 0 ? null : _progress / 100,
                    minHeight: 2,
                    backgroundColor: Colors.transparent,
                    color: const Color(0xFFC5A059),
                  ),
                )
              : null,
        ),
        // 🔴 زرّ الرجوع يعود داخل اللوحة أوّلاً ثمّ يخرج: الداشبورد صفحاتٌ
        //    متعدّدة، والخروج من أوّل ضغطةٍ يُفقد الموظّف مكانه.
        body: PopScope(
          canPop: false,
          onPopInvokedWithResult: (didPop, _) async {
            if (didPop) return;
            final nav = Navigator.of(context);
            if (await _c.canGoBack()) {
              await _c.goBack();
            } else if (mounted) {
              nav.pop();
            }
          },
          child: _error != null ? _errorView() : WebViewWidget(controller: _c),
        ),
      );

  Widget _errorView() => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('⚠️', style: TextStyle(fontSize: 34)),
              const SizedBox(height: 12),
              Text(_error!,
                  textAlign: TextAlign.center,
                  style: ar(13.5, color: const Color(0xFFB3A895))),
              const SizedBox(height: 16),
              GestureDetector(
                onTap: _retry,
                behavior: HitTestBehavior.opaque,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 22, vertical: 11),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0x59C5A059)),
                  ),
                  child: Text('أعد المحاولة',
                      style: ar(13,
                          color: const Color(0xFFC5A059),
                          weight: FontWeight.w700)),
                ),
              ),
            ],
          ),
        ),
      );
}
