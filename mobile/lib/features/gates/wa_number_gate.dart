import 'package:flutter/material.dart';

import '../../app/app_state.dart';
import '../../core/api/api_client.dart';
import '../../core/storage/session_store.dart';
import '../../models/player.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 📱 بوّابة رقم الواتساب (2026-10-30) — مطابقةٌ لبوّابة الويب
// ══════════════════════════════════════════════════════
// لاعبٌ رقمه بلا واتساب (أو غير صالح، أو مشترك مع حسابٍ آخر) لا يتجاوزها حتّى يربط رقماً
// عليه واتساب: يكتب الرقم ⟵ الخادم يفحصه بصمت ⟵ رمز ٦ أرقام على واتساب ⟵ يُعتمد رقماً للدخول.
// الخادم يقرّر متى تظهر (/me ⟵ waGate): مفتاح الداشبورد، ولا تُقطع لعبةٌ جارية.
//
// 🔴 Overlay خاصّ: البوّابة فوق الـNavigator (MaterialApp.builder)، وحقل النصّ يحتاج Overlay
//    لمقابض التحديد وشريط النسخ واللصق — بدونه يرمي عند الضغط المطوّل.

const _green = Color(0xFF25D366);

class WaNumberGate extends StatefulWidget {
  const WaNumberGate({super.key, required this.gate});

  final Map<String, dynamic> gate;

  @override
  State<WaNumberGate> createState() => _WaNumberGateState();
}

class _WaNumberGateState extends State<WaNumberGate> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  String _step = 'phone';   // phone | code | done
  String _sentTo = '';
  bool _busy = false;
  String? _error;

  @override
  void dispose() { _phone.dispose(); _code.dispose(); super.dispose(); }

  String get _reason {
    final p = (widget.gate['phone'] ?? '').toString();
    switch (widget.gate['reason']) {
      case 'invalid': return 'الرقم المسجّل في حسابك «$p» ليس رقم هاتفٍ صالحاً.';
      case 'shared': return 'رقم حسابك مسجّلٌ أيضاً لحسابٍ آخر — كلّ حسابٍ يحتاج رقمه.';
      default: return 'الرقم المسجّل في حسابك $p ليس عليه واتساب.';
    }
  }

  Future<void> _linked(String phone) async {
    final p = SessionStore.instance.player;
    if (p != null) await SessionStore.instance.updatePlayer(PlayerData.fromJson({...p.toJson(), 'phone': phone}));
    if (mounted) setState(() { _step = 'done'; _sentTo = phone; _busy = false; });
  }

  Future<void> _start() async {
    setState(() { _busy = true; _error = null; });
    try {
      final r = await ApiClient.instance.post('/api/player-auth/wa-number/start', body: {'phone': _phone.text.trim()});
      final m = r is Map ? r : const {};
      final phone = (m['phone'] ?? '').toString();
      if (m['sameNumber'] == true) {
        await ApiClient.instance.post('/api/player-auth/wa-number/confirm', body: {'phone': phone});
        await _linked(phone);
        return;
      }
      if (mounted) setState(() { _sentTo = phone; _code.clear(); _step = 'code'; _busy = false; });
    } on ApiException catch (e) {
      if (mounted) setState(() { _busy = false; _error = e.message; });
    } catch (_) {
      if (mounted) setState(() { _busy = false; _error = 'تعذّر الاتصال — حاول مجدّداً'; });
    }
  }

  Future<void> _confirm() async {
    setState(() { _busy = true; _error = null; });
    try {
      final r = await ApiClient.instance.post('/api/player-auth/wa-number/confirm', body: {'phone': _sentTo, 'code': _code.text.trim()});
      final m = r is Map ? r : const {};
      await _linked((m['phone'] ?? _sentTo).toString());
    } on ApiException catch (e) {
      if (mounted) setState(() { _busy = false; _error = e.message; });
    } catch (_) {
      if (mounted) setState(() { _busy = false; _error = 'تعذّر الاتصال — حاول مجدّداً'; });
    }
  }

  @override
  Widget build(BuildContext context) => Overlay(initialEntries: [
        OverlayEntry(builder: (_) => Material(
              color: const Color(0xF0080A08),
              child: SafeArea(
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 420),
                      child: Container(
                        padding: const EdgeInsets.fromLTRB(22, 26, 22, 20),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0D0F0D),
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(color: const Color(0x4D25D366)),
                        ),
                        child: Column(mainAxisSize: MainAxisSize.min, children: [
                          Container(
                            width: 56, height: 56,
                            decoration: BoxDecoration(color: const Color(0x1F25D366), borderRadius: BorderRadius.circular(16)),
                            child: const Icon(Icons.chat_bubble_outline_rounded, color: _green, size: 28),
                          ),
                          const SizedBox(height: 14),
                          ..._body(),
                        ]),
                      ),
                    ),
                  ),
                ),
              ),
            )),
      ]);

  List<Widget> _body() {
    if (_step == 'done') {
      return [
        Text('تمّ ربط رقمك', style: ar(21, color: _green, weight: FontWeight.w900)),
        const SizedBox(height: 8),
        Text('من الآن تدخل التطبيق بالرقم $_sentTo وكلمة مرورك نفسها. حجوزاتك ونقاطك كما هي.',
            textAlign: TextAlign.center, style: ar(13.5, color: const Color(0xFFCFC8BC))),
        const SizedBox(height: 18),
        _button('متابعة', AppState.instance.markWaLinked),
      ];
    }
    if (_step == 'code') {
      return [
        Text('أدخل رمز التأكيد', style: ar(21, color: Colors.white, weight: FontWeight.w900)),
        const SizedBox(height: 8),
        Text('أرسلنا رمزاً من ٦ أرقام إلى واتساب $_sentTo — افتح واتساب على هاتفك.',
            textAlign: TextAlign.center, style: ar(13.5, color: const Color(0xFFB3A895))),
        const SizedBox(height: 16),
        _field(_code, '______', TextInputType.number, center: true, maxLength: 6),
        ..._errorLine(),
        const SizedBox(height: 14),
        _button(_busy ? null : 'تأكيد', _busy || _code.text.trim().length < 6 ? null : _confirm),
        const SizedBox(height: 8),
        TextButton(
          onPressed: _busy ? null : () => setState(() { _step = 'phone'; _error = null; }),
          child: Text('رقمٌ آخر', style: ar(13.5, color: const Color(0xFF9E978C), weight: FontWeight.w700)),
        ),
      ];
    }
    return [
      Text('اربط حسابك برقم واتساب', textAlign: TextAlign.center, style: ar(21, color: Colors.white, weight: FontWeight.w900)),
      const SizedBox(height: 8),
      Text('$_reason حجوزاتك وفواتيرك وتنبيهاتك تصلك على واتساب — اكتب رقمك الذي عليه واتساب لتكمل.',
          textAlign: TextAlign.center, style: ar(13.5, color: const Color(0xFFB3A895))),
      const SizedBox(height: 16),
      _field(_phone, '07XXXXXXXX', TextInputType.phone),
      ..._errorLine(),
      const SizedBox(height: 14),
      _button(_busy ? null : 'تحقّق واعتمد', _busy || _phone.text.trim().length < 9 ? null : _start),
      const SizedBox(height: 10),
      Text('لا نرسل شيئاً للرقم لنفحصه — بعد الفحص يصلك رمزٌ واحد للتأكيد.',
          textAlign: TextAlign.center, style: ar(11.5, color: const Color(0xFF6B655C))),
    ];
  }

  List<Widget> _errorLine() => _error == null
      ? const []
      : [const SizedBox(height: 10), Text(_error!, textAlign: TextAlign.center, style: ar(13, color: const Color(0xFFFCA5A5)))];

  Widget _field(TextEditingController c, String hint, TextInputType t, {bool center = false, int? maxLength}) => Directionality(
        textDirection: TextDirection.ltr,
        child: TextField(
          controller: c,
          keyboardType: t,
          maxLength: maxLength,
          textAlign: center ? TextAlign.center : TextAlign.right,
          onChanged: (_) => setState(() => _error = null),
          style: mono(center ? 24 : 18, color: Colors.white, weight: FontWeight.w700),
          decoration: InputDecoration(
            counterText: '',
            hintText: hint,
            hintStyle: const TextStyle(color: Color(0xFF6B655C)),
            filled: true,
            fillColor: Colors.white.withValues(alpha: .04),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.white.withValues(alpha: .12))),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: _green)),
          ),
        ),
      );

  Widget _button(String? label, VoidCallback? onTap) => GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Opacity(
          opacity: onTap == null && label != null ? 0.45 : 1,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 15),
            alignment: Alignment.center,
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), color: _green),
            child: label == null
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.black))
                : Text(label, style: ar(15, color: Colors.black, weight: FontWeight.w900)),
          ),
        ),
      );
}
