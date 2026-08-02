import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/theme/theme.dart';
import '../../core/api/api_client.dart';
import '../../core/api/auth_repository.dart';
import '../../core/ui/atmosphere.dart';

// ══════════════════════════════════════════════════════
// 🔑 الدخول
// ══════════════════════════════════════════════════════
// شاشة M1: تُثبت أن الجلسة تعمل من طرف إلى طرف. تصميمها النهائي
// بنصوصه الحرفية في الملفّ 10 ضمن M2.

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.onLoggedIn});

  final VoidCallback onLoggedIn;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;
    setState(() { _busy = true; _error = null; });
    try {
      await AuthRepository.instance.login(
        phone: _phone.text,
        password: _password.text,
      );
      if (mounted) widget.onLoggedIn();
    } on ApiException catch (e) {
      // رسالة الخادم العربية كما هي — لا تُستبدل برسالة عامّة
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;

    return Scaffold(
      body: DisplayBg(
        child: Stack(
          children: [
            const Positioned.fill(child: BloodVignette()),
            SafeArea(
              child: ContentConstraint(
                maxWidth: 420,
                child: SingleChildScrollView(
                  padding: EdgeInsets.all(context.pagePadding),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SizedBox(height: context.sectionGap * 3),
                      Text('نادي المافيا', textAlign: TextAlign.center, style: t.displayMedium),
                      const SizedBox(height: 6),
                      Text('سجّل دخولك', textAlign: TextAlign.center, style: t.bodyMedium),
                      SizedBox(height: context.sectionGap * 2),

                      // ⌨️ الهاتف وكلمة السرّ لاتينيّان محلياً حتى داخل
                      //    واجهة RTL — رقم يُكتب بالعربية لا يُقبل خادمياً.
                      Directionality(
                        textDirection: TextDirection.ltr,
                        child: TextField(
                          controller: _phone,
                          keyboardType: TextInputType.phone,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                          textInputAction: TextInputAction.next,
                          style: monoStyle(size: 15, color: Noir.textEmphasis),
                          decoration: const InputDecoration(hintText: '07XXXXXXXX'),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Directionality(
                        textDirection: TextDirection.ltr,
                        child: TextField(
                          controller: _password,
                          obscureText: true,
                          textInputAction: TextInputAction.done,
                          onSubmitted: (_) => _submit(),
                          style: monoStyle(size: 15, color: Noir.textEmphasis),
                          decoration: const InputDecoration(hintText: '••••••'),
                        ),
                      ),

                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        Text(_error!,
                            textAlign: TextAlign.center,
                            style: t.bodySmall?.copyWith(color: MafiaScales.mafia[400])),
                      ],

                      SizedBox(height: context.sectionGap),
                      SizedBox(
                        height: 48,
                        child: FilledButton(
                          onPressed: _busy ? null : _submit,
                          child: _busy
                              ? const SizedBox(
                                  width: 18, height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Text('دخول'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
