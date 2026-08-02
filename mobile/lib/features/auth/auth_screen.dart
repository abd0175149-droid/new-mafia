import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/theme/theme.dart';
import '../../core/api/api_client.dart';
import '../../core/api/auth_repository.dart';

// ══════════════════════════════════════════════════════
// 🔑 الدخول والتسجيل — الملفّ 10
// ══════════════════════════════════════════════════════
// أربعة أوضاع في شاشة واحدة: ترحيب · دخول · حساب جديد · تغيير إجباريّ.
// كل نصّ هنا منقول حرفياً من الويب — لا يُعاد صوغه.

enum AuthMode { welcome, login, register, changePassword }

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key, required this.onDone});

  final VoidCallback onDone;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  AuthMode _mode = AuthMode.welcome;

  // الحقول تبقى محفوظة عبر الأوضاع — كما في الويب
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();
  final _newPassword = TextEditingController();
  String _gender = 'MALE';

  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    _name.dispose();
    _newPassword.dispose();
    super.dispose();
  }

  void _go(AuthMode m) => setState(() { _mode = m; _error = null; });

  Future<void> _handleLogin() async {
    if (_phone.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'أدخل رقم الهاتف وكلمة المرور');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      final p = await AuthRepository.instance.login(phone: _phone.text, password: _password.text);
      if (!mounted) return;
      // كلمة سرّ افتراضية ⇒ وضع لا يُهرب منه
      if (p.mustChangePassword) {
        setState(() { _mode = AuthMode.changePassword; _loading = false; });
        return;
      }
      widget.onDone();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.isOffline ? 'خطأ في الاتصال بالخادم' : e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _handleRegister() async {
    if (_phone.text.trim().isEmpty || _password.text.isEmpty || _name.text.trim().isEmpty) {
      setState(() => _error = 'جميع الحقول مطلوبة');
      return;
    }
    if (_password.text.length < 4) {
      setState(() => _error = 'كلمة المرور 4 أحرف على الأقل');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      final bonus = await AuthRepository.instance.register(
        name: _name.text, phone: _phone.text, password: _password.text, gender: _gender,
      );
      if (!mounted) return;
      if (bonus != null) {
        await _showWelcomeBonus(bonus);
        if (!mounted) return;
      }
      widget.onDone();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.isOffline ? 'خطأ في الاتصال بالخادم' : e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _handleChangePassword() async {
    if (_newPassword.text.length < 4) {
      setState(() => _error = 'كلمة المرور الجديدة 4 أحرف على الأقل');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await AuthRepository.instance.changePassword(_newPassword.text);
      if (mounted) widget.onDone();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.isOffline ? 'خطأ في الاتصال' : e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _showWelcomeBonus(int amount) => showDialog<void>(
        context: context,
        barrierDismissible: false, // الإغلاق حصراً بزرّ الـCTA
        barrierColor: const Color(0xD9000000),
        builder: (_) => _WelcomeBonusDialog(amount: amount),
      );

  @override
  Widget build(BuildContext context) {
    return PopScope(
      // وضع تغيير كلمة السرّ لا يُهرب منه — لا زرّ رجوع ولا إيماءة
      canPop: _mode != AuthMode.changePassword,
      child: Scaffold(
        body: Stack(
          children: [
            // الخلفية الزخرفية — المواضع فيزيائية لا منطقية، كما في الويب
            const Positioned.fill(child: IgnorePointer(child: _AuthBackdrop())),
            SafeArea(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 384),
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 300),
                      switchInCurve: Curves.easeOutCubic,
                      switchOutCurve: Curves.easeOutCubic,
                      child: KeyedSubtree(key: ValueKey(_mode), child: _body()),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body() => switch (_mode) {
        AuthMode.welcome => _welcome(),
        AuthMode.login => _login(),
        AuthMode.register => _register(),
        AuthMode.changePassword => _changePassword(),
      };

  // ── ترحيب ──
  Widget _welcome() => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Container(
              width: 120, height: 120,
              color: Noir.charcoal,
              child: const Icon(Icons.theater_comedy, size: 64, color: Noir.vintageGold),
            ),
          ),
          const SizedBox(height: 24),
          const Text('نادي المافيا',
              style: TextStyle(fontFamily: 'Tajawal', fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white, letterSpacing: 0)),
          const SizedBox(height: 24),
          const Text('مرحباً بك في عالم المافيا — سجّل دخولك أو أنشئ حساباً جديداً',
              textAlign: TextAlign.center,
              style: TextStyle(fontFamily: 'Tajawal', fontSize: 14, color: Color(0xFF6B7280), letterSpacing: 0)),
          const SizedBox(height: 24),
          _PrimaryButton(label: 'تسجيل الدخول', onTap: () => _go(AuthMode.login)),
          const SizedBox(height: 24),
          _OutlineButton(label: 'حساب جديد', onTap: () => _go(AuthMode.register)),
        ],
      );

  // ── دخول ──
  Widget _login() => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          _BackLink(onTap: () => _go(AuthMode.welcome)),
          const SizedBox(height: 8),
          const _H2('تسجيل الدخول'),
          const SizedBox(height: 16),
          _Field(controller: _phone, hint: 'رقم الهاتف', ltr: true, phone: true),
          const SizedBox(height: 16),
          _Field(controller: _password, hint: 'كلمة المرور', ltr: true, obscure: true, onSubmit: _handleLogin),
          if (_error != null) ...[const SizedBox(height: 16), _ErrorLine(_error!)],
          const SizedBox(height: 16),
          _PrimaryButton(
            label: _loading ? 'جاري الدخول...' : 'دخول',
            onTap: _loading ? null : _handleLogin,
          ),
        ],
      );

  // ── حساب جديد ──
  Widget _register() => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          _BackLink(onTap: () => _go(AuthMode.welcome)),
          const SizedBox(height: 4),
          const _H2('حساب جديد'),
          const SizedBox(height: 12),
          _Field(controller: _name, hint: 'الاسم الكامل'),
          const SizedBox(height: 12),
          _Field(controller: _phone, hint: 'رقم الهاتف', ltr: true, phone: true),
          const SizedBox(height: 12),
          _Field(controller: _password, hint: 'كلمة المرور (4 أحرف على الأقل)', ltr: true, obscure: true),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: _GenderButton(
              label: '♂ ذكر', selected: _gender == 'MALE',
              selBg: const Color(0x333B82F6), selBorder: const Color(0x803B82F6), selText: const Color(0xFF60A5FA),
              onTap: () => setState(() => _gender = 'MALE'),
            )),
            const SizedBox(width: 12),
            Expanded(child: _GenderButton(
              label: '♀ أنثى', selected: _gender == 'FEMALE',
              selBg: const Color(0x33EC4899), selBorder: const Color(0x80EC4899), selText: const Color(0xFFF472B6),
              onTap: () => setState(() => _gender = 'FEMALE'),
            )),
          ]),
          if (_error != null) ...[const SizedBox(height: 12), _ErrorLine(_error!)],
          const SizedBox(height: 12),
          _PrimaryButton(
            label: _loading ? 'جاري الإنشاء...' : 'إنشاء حساب',
            onTap: _loading ? null : _handleRegister,
          ),
        ],
      );

  // ── تغيير إجباريّ ──
  Widget _changePassword() => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          const _H2('تغيير كلمة المرور'),
          const SizedBox(height: 16),
          const Text('يجب تغيير كلمة المرور الافتراضية قبل المتابعة',
              style: TextStyle(fontFamily: 'Tajawal', fontSize: 14, color: Color(0xFF6B7280), letterSpacing: 0)),
          const SizedBox(height: 16),
          _Field(controller: _newPassword, hint: 'كلمة المرور الجديدة', ltr: true, obscure: true, onSubmit: _handleChangePassword),
          if (_error != null) ...[const SizedBox(height: 16), _ErrorLine(_error!)],
          const SizedBox(height: 16),
          _PrimaryButton(
            label: _loading ? 'جاري التحديث...' : 'تحديث وإدخال',
            onTap: _loading ? null : _handleChangePassword,
          ),
        ],
      );
}

// ══════════════════════════════════════════════════════
// لبنات الشاشة
// ══════════════════════════════════════════════════════

class _AuthBackdrop extends StatelessWidget {
  const _AuthBackdrop();

  @override
  Widget build(BuildContext context) {
    final s = MediaQuery.sizeOf(context);
    return Stack(children: [
      Positioned(
        top: s.height * 0.25 - 192, left: s.width * 0.25 - 192,
        child: _glow(384, const Color(0xFFFBBF24)),
      ),
      Positioned(
        bottom: s.height * 0.25 - 144, right: s.width * 0.25 - 144,
        child: _glow(288, const Color(0xFFEF4444)),
      ),
    ]);
  }

  Widget _glow(double d, Color c) => SizedBox(
        width: d, height: d,
        child: DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(colors: [c.withValues(alpha: 0.05), c.withValues(alpha: 0)]),
          ),
        ),
      );
}

class _H2 extends StatelessWidget {
  const _H2(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Text(text,
      style: const TextStyle(fontFamily: 'Tajawal', fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white, letterSpacing: 0));
}

class _BackLink extends StatelessWidget {
  const _BackLink({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Align(
        alignment: AlignmentDirectional.centerStart,
        child: InkWell(
          onTap: onTap,
          child: const Padding(
            padding: EdgeInsets.symmetric(vertical: 4),
            child: Text('→ رجوع',
                style: TextStyle(fontFamily: 'Tajawal', fontSize: 14, color: Color(0xFF6B7280), letterSpacing: 0)),
          ),
        ),
      );
}

class _Field extends StatelessWidget {
  const _Field({
    required this.controller, required this.hint,
    this.ltr = false, this.obscure = false, this.phone = false, this.onSubmit,
  });

  final TextEditingController controller;
  final String hint;
  final bool ltr;
  final bool obscure;
  final bool phone;
  final VoidCallback? onSubmit;

  @override
  Widget build(BuildContext context) {
    final field = TextField(
      controller: controller,
      obscureText: obscure,
      keyboardType: phone ? TextInputType.phone : TextInputType.text,
      inputFormatters: phone ? [FilteringTextInputFormatter.digitsOnly] : null,
      textInputAction: onSubmit != null ? TextInputAction.done : TextInputAction.next,
      onSubmitted: onSubmit == null ? null : (_) => onSubmit!(),
      style: const TextStyle(fontFamily: 'Tajawal', fontSize: 14, color: Colors.white, letterSpacing: 0),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(fontFamily: 'Tajawal', fontSize: 14, color: Color(0xFF4B5563), letterSpacing: 0),
        filled: true,
        fillColor: const Color(0x0DFFFFFF),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        border: const OutlineInputBorder(borderRadius: NoirRadius.soft, borderSide: BorderSide(color: Color(0x1AFFFFFF))),
        enabledBorder: const OutlineInputBorder(borderRadius: NoirRadius.soft, borderSide: BorderSide(color: Color(0x1AFFFFFF))),
        focusedBorder: const OutlineInputBorder(borderRadius: NoirRadius.soft, borderSide: BorderSide(color: Color(0x80F59E0B))),
      ),
    );
    // الهاتف وكلمة السرّ لاتينيّان محلياً حتى داخل واجهة RTL
    return ltr ? Directionality(textDirection: TextDirection.ltr, child: field) : field;
  }
}

class _ErrorLine extends StatelessWidget {
  const _ErrorLine(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Text(text,
      textAlign: TextAlign.center,
      style: const TextStyle(fontFamily: 'Tajawal', fontSize: 12, color: Color(0xFFF87171), letterSpacing: 0));
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({required this.label, required this.onTap});
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Opacity(
        opacity: onTap == null ? 0.5 : 1,
        child: InkWell(
          onTap: onTap,
          borderRadius: NoirRadius.soft,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: const BoxDecoration(
              borderRadius: NoirRadius.soft,
              gradient: LinearGradient(
                begin: Alignment.topLeft, end: Alignment.bottomRight,
                colors: [Color(0xFFFBBF24), Color(0xFFF59E0B)],
              ),
            ),
            child: Text(label,
                textAlign: TextAlign.center,
                style: const TextStyle(fontFamily: 'Tajawal', fontSize: 14, fontWeight: FontWeight.w600, color: Colors.black, letterSpacing: 0)),
          ),
        ),
      );
}

class _OutlineButton extends StatelessWidget {
  const _OutlineButton({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: NoirRadius.soft,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            borderRadius: NoirRadius.soft,
            border: Border.all(color: const Color(0x4DF59E0B)),
          ),
          child: Text(label,
              textAlign: TextAlign.center,
              style: const TextStyle(fontFamily: 'Tajawal', fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFFFBBF24), letterSpacing: 0)),
        ),
      );
}

class _GenderButton extends StatelessWidget {
  const _GenderButton({
    required this.label, required this.selected, required this.onTap,
    required this.selBg, required this.selBorder, required this.selText,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color selBg, selBorder, selText;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: NoirRadius.soft,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            borderRadius: NoirRadius.soft,
            color: selected ? selBg : const Color(0x0DFFFFFF),
            border: Border.all(color: selected ? selBorder : const Color(0x1AFFFFFF)),
          ),
          child: Text(label,
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontFamily: 'Tajawal', fontSize: 14, fontWeight: FontWeight.w500,
                  color: selected ? selText : const Color(0xFF6B7280), letterSpacing: 0)),
        ),
      );
}

/// مودال المكافأة الترحيبية — §4.5.
///
/// 🔴 الجلسة **لا تُثبَّت قبل ضغط الـCTA**. لهذا لا يُغلق بنقر الغطاء:
/// إغلاقٌ عرضيّ يعني حساباً أُنشئ ولا يعرف صاحبه أنه أُنشئ.
class _WelcomeBonusDialog extends StatelessWidget {
  const _WelcomeBonusDialog({required this.amount});
  final int amount;

  @override
  Widget build(BuildContext context) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.symmetric(horizontal: 16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 384),
          child: Container(
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: Noir.charcoal,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0x4DFBBF24)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('🎁', style: TextStyle(fontSize: 60)),
                const SizedBox(height: 16),
                const Text('مكافأة ترحيبية!',
                    style: TextStyle(fontFamily: 'Tajawal', fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white, letterSpacing: 0)),
                const SizedBox(height: 8),
                const Text('مرحباً بك في نادي المافيا',
                    style: TextStyle(fontFamily: 'Tajawal', fontSize: 14, color: Color(0xFF9CA3AF), letterSpacing: 0)),
                const SizedBox(height: 4),
                Text('+$amount XP ✨',
                    style: const TextStyle(fontFamily: 'Tajawal', fontSize: 30, fontWeight: FontWeight.bold, color: Color(0xFFFBBF24), letterSpacing: 0)),
                const SizedBox(height: 16),
                const Text('حصلت على نقاط ترحيبية — استمتع باللعب!',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontFamily: 'Tajawal', fontSize: 12, color: Color(0xFF6B7280), letterSpacing: 0)),
                const SizedBox(height: 24),
                _PrimaryButton(label: 'يلا نبدأ! 🎮', onTap: () => Navigator.of(context).pop()),
              ],
            ),
          ),
        ),
      );
}
