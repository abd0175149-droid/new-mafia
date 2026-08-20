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
// 🔴 **تحميلان بالترتيب** — والسبب درسٌ مدفوع الثمن:
//
//    ① المحاولة الأولى حقنت في `onPageStarted` وحدها. تقع أحياناً قبل
//       إنشاء الوثيقة الجديدة فيُنفَّذ السكربت في سياقٍ يزول.
//    ② والثانية أضافت كشفاً: «إن استقرّت الصفحة على `/admin/login` فأعد
//       الحقن والتحميل». **ولم تعمل أيضاً** — واللوحةُ تطبيقُ صفحةٍ واحدة،
//       و`router.push('/admin/login')` تنقّلٌ **داخل الصفحة** لا تحميلٌ
//       جديد، فـ`onPageFinished` لا تُستدعى ثانيةً ولا يقع الكشف أبداً.
//
//    فالحلّ ألّا نلاحق التحويل بل نسبقه: **نحمّل جذر الموقع أوّلاً** —
//    صفحةٌ لا تحرس شيئاً — ونحقن التوكن في تخزينها (نفس الأصل)، ثمّ
//    ننتقل إلى `/admin` فتجد حزمتُها التوكن موجوداً حين تقرؤه. تحميلان
//    دائماً، لكنّه **حتميّ** لا يعتمد على سباق.
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

  /// هل زُرعت الجلسة وانتقلنا إلى اللوحة؟ حارسُ الدوران.
  bool _seeded = false;

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
          // حقنٌ إضافيّ رخيص — يفيد إن سبق إنشاءَ الوثيقة، ولا يضرّ إن تأخّر.
          if (token != null && staff != null) {
            _c.runJavaScript(_injectJs(token, staff));
          }
        },
        onPageFinished: (_) async {
          // 🔴 المرحلة الأولى: الجذر حُمّل ⇒ التخزين متاحٌ على أصلنا.
          //    نزرع الجلسة ثمّ ننتقل للوحة. مرّةً واحدة — الحارس يمنع
          //    الدوران لو أعادت اللوحة توجيهاً لأيّ سبب.
          if (!_seeded) {
            _seeded = true;
            if (token != null && staff != null) {
              await _c.runJavaScript(_injectJs(token, staff));
            }
            await _c.loadRequest(
                Uri.parse('${ApiClient.instance.config.baseUrl}/admin'));
            return;
          }
          if (mounted) setState(() => _loading = false);
        },
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
      // 🔴 الجذر أوّلاً لا `/admin`: صفحةٌ لا تحرس شيئاً، فنملك تخزينها
      //    ونزرع التوكن قبل أن تعمل حزمة اللوحة أصلاً.
      ..loadRequest(Uri.parse(ApiClient.instance.config.baseUrl));

    // 🔴 غيابُ التوكن يُقال صراحةً: بلا هذا يرى الموظّف صفحة دخولٍ ولا
    //    يعرف أهي عطلٌ في الحقن أم أن حسابه غير مرتبط أصلاً — وكلاهما
    //    يبدو واحداً على الشاشة.
    if (token == null || staff == null) {
      _error = 'حسابك غير مرتبطٍ بحساب موظّف — أعد فتح التطبيق أو راجع الإدارة';
      _loading = false;
    }
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
