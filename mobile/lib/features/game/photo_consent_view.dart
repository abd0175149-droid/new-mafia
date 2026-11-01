import 'dart:async';

import 'package:flutter/material.dart';

import '../../models/game.dart';
import '../profile/profile_palette.dart';
import 'game_session_controller.dart';

// ══════════════════════════════════════════════════════
// 📸 زاوية بلا تصوير — سؤال الدخول + شارة الغرفة
// ══════════════════════════════════════════════════════
// السؤال خطوةٌ داخل قشرة الدخول (ودجةٌ مضمّنة لا حوار): يُسأل قبل كلّ دخولٍ
// جديد، والخادم وحده يُجلس الرافضين متجاورين.

const _gold = Color(0xFFC5A059);
const _line = Color(0xFF2A2A2A);
const _muted = Color(0xFF808080);
const _noPhotoTint = Color(0xFFCBBCFF);

/// سؤال «تقبل التصوير؟» — أو بطاقة القاصر بلا سؤال.
class PhotoConsentQuestion extends StatefulWidget {
  const PhotoConsentQuestion({
    super.key,
    required this.ask,
    required this.onContinue,
    this.busy = false,
  });

  final PhotoConsentAsk ask;

  /// true = يقبل التصوير · false = يرفض (والقاصر دائماً false).
  final ValueChanged<bool> onContinue;
  final bool busy;

  @override
  State<PhotoConsentQuestion> createState() => _PhotoConsentQuestionState();
}

class _PhotoConsentQuestionState extends State<PhotoConsentQuestion> {
  // الجواب السابق مُختارٌ سلفاً — null بلا اختيار
  late bool? _choice = widget.ask.consent;

  @override
  Widget build(BuildContext context) {
    if (widget.ask.isMinor) return _minor();
    return Column(mainAxisSize: MainAxisSize.min, children: [
      const _Head(
        emoji: '📸',
        title: 'نصوّر الليلة لصفحات النادي',
        body: 'تقبل أن تظهر في الصور والفيديو؟ '
            'إن لم تقبل نُجلسك في زاوية لا تُصوَّر.',
      ),
      _Choice(
        label: '✓ نعم، لا مانع',
        selected: _choice == true,
        onTap: () => setState(() => _choice = true),
      ),
      const SizedBox(height: 10),
      _Choice(
        label: '📵 لا، أفضّل ما أظهر',
        selected: _choice == false,
        onTap: () => setState(() => _choice = false),
      ),
      const SizedBox(height: 22),
      _PrimaryButton(
        label: 'متابعة',
        enabled: _choice != null && !widget.busy,
        onTap: () => widget.onContinue(_choice!),
      ),
      const SizedBox(height: 12),
      Text('جوابك محفوظ وتقدر تغيّره من الغرفة أيّ وقت.',
          textAlign: TextAlign.center, style: ar(12.5, color: _muted)),
    ]);
  }

  Widget _minor() => Column(mainAxisSize: MainAxisSize.min, children: [
        const _Head(
          emoji: '📵',
          title: 'ستجلس في زاوية بلا تصوير',
          body: 'لأنّ عمرك تحت ١٨ سنة — التصوير بموافقة وليّ أمرك عبر الموجّه.',
        ),
        _PrimaryButton(
          label: 'متابعة',
          enabled: !widget.busy,
          onTap: () => widget.onContinue(false),
        ),
      ]);
}

class _Head extends StatelessWidget {
  const _Head({required this.emoji, required this.title, required this.body});
  final String emoji, title, body;

  // نفس رأس خطوات الدخول: رمزٌ فوق عنوانٍ أميريّ وسطرٍ رماديّ تحته
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 24),
        padding: const EdgeInsets.only(bottom: 20),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Color(0x662A2A2A))),
        ),
        child: Column(children: [
          Text(emoji, style: const TextStyle(fontSize: 40)),
          const SizedBox(height: 10),
          Text(title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontFamily: 'Amiri',
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                  letterSpacing: 0)),
          const SizedBox(height: 8),
          Text(body,
              textAlign: TextAlign.center,
              style: ar(13.5, color: const Color(0xFFB5ADA0), height: 1.6)),
        ]),
      );
}

class _Choice extends StatelessWidget {
  const _Choice(
      {required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        selected: selected,
        child: GestureDetector(
          onTap: onTap,
          behavior: HitTestBehavior.opaque,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            width: double.infinity,
            constraints: const BoxConstraints(minHeight: 56),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: selected ? const Color(0x26C5A059) : const Color(0x66000000),
              border: Border.all(
                  color: selected ? _gold : _line, width: selected ? 2 : 1),
            ),
            child: Row(children: [
              Icon(
                selected ? Icons.radio_button_checked : Icons.radio_button_off,
                size: 20,
                color: selected ? _gold : const Color(0xFF555555),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(label,
                    style: ar(15,
                        color: selected ? _gold : const Color(0xFFD8CFC0),
                        weight: selected ? FontWeight.w900 : FontWeight.w600)),
              ),
            ]),
          ),
        ),
      );
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton(
      {required this.label, required this.enabled, required this.onTap});
  final String label;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Opacity(
        opacity: enabled ? 1 : 0.45,
        child: Semantics(
          button: true,
          enabled: enabled,
          child: GestureDetector(
            onTap: enabled ? onTap : null,
            behavior: HitTestBehavior.opaque,
            child: Container(
              width: double.infinity,
              constraints: const BoxConstraints(minHeight: 50),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(11),
                color: const Color(0x26C5A059),
                border: Border.all(color: _gold),
              ),
              child: Text(label,
                  style: ar(15, color: _gold, weight: FontWeight.w900)),
            ),
          ),
        ),
      );
}

// ══════════════════════════════════════════════════════
// شارة الغرفة — «التصوير: …» وتغييره
// ══════════════════════════════════════════════════════
/// تظهر حين تكون الزاوية مفعّلة لهذه الغرفة وحدها. اللمس يفتح تأكيداً.
class PhotoStatusChip extends StatelessWidget {
  const PhotoStatusChip({super.key, required this.controller});
  final GameSessionController controller;

  @override
  Widget build(BuildContext context) {
    if (!controller.photoZoneOn) return const SizedBox.shrink();
    final noPhoto = controller.myNoPhoto;
    final tint = noPhoto ? _noPhotoTint : _gold;
    return Semantics(
      button: true,
      child: InkWell(
        onTap: () => unawaited(_change(context, noPhoto)),
        borderRadius: BorderRadius.circular(10),
        child: Container(
          constraints: const BoxConstraints(minHeight: 44),
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            color: const Color(0x66000000),
            border: Border.all(color: tint.withValues(alpha: 0.45)),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(noPhoto ? '📵 بلا تصوير' : '📸 التصوير: مسموح',
                style: ar(12.5, color: tint, weight: FontWeight.bold)),
            const SizedBox(width: 10),
            Text('تغيير', style: ar(12.5, color: _muted)),
          ]),
        ),
      ),
    );
  }

  Future<void> _change(BuildContext context, bool noPhoto) async {
    final messenger = ScaffoldMessenger.maybeOf(context);
    final msg = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      // 🔴 على مُلاحِح الجذر كورقة الدعوة: بلاه تُرسم تحت الشريط السفليّ
      useRootNavigator: true,
      builder: (_) => _ConfirmSheet(
        controller: controller,
        // المطلوب عكسُ الحال: بلا تصوير ⇒ يطلب السماح
        allow: noPhoto,
      ),
    );
    if (msg == null || msg.isEmpty) return;
    messenger?.showSnackBar(
        SnackBar(content: Text(msg, style: ar(13))));
  }
}

class _ConfirmSheet extends StatefulWidget {
  const _ConfirmSheet({required this.controller, required this.allow});
  final GameSessionController controller;

  /// true = يطلب السماح بالتصوير · false = يطلب «بلا تصوير».
  final bool allow;

  @override
  State<_ConfirmSheet> createState() => _ConfirmSheetState();
}

class _ConfirmSheetState extends State<_ConfirmSheet> {
  bool _busy = false;

  Future<void> _confirm() async {
    setState(() => _busy = true);
    final r = await widget.controller.setPhotoConsent(widget.allow);
    if (!mounted) return;
    Navigator.of(context).pop(r.message);
  }

  @override
  Widget build(BuildContext context) => SafeArea(
        top: false,
        child: Container(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
          decoration: const BoxDecoration(
            color: Color(0xFF0A0A0A),
            borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
            border: Border(top: BorderSide(color: _line)),
          ),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: const Color(0xFF333333),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 18),
            Text(
              widget.allow ? '📸 السماح بالتصوير؟' : 'تغيير إلى: 📵 بلا تصوير؟',
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontFamily: 'Amiri',
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  color: _gold),
            ),
            const SizedBox(height: 20),
            _PrimaryButton(
              label: _busy ? 'جارٍ الحفظ…' : 'تأكيد',
              enabled: !_busy,
              onTap: () => unawaited(_confirm()),
            ),
            const SizedBox(height: 10),
            GestureDetector(
              onTap: _busy ? null : () => Navigator.of(context).pop(),
              behavior: HitTestBehavior.opaque,
              child: Container(
                width: double.infinity,
                constraints: const BoxConstraints(minHeight: 48),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(11),
                  border: Border.all(color: _line),
                ),
                child: Text('إلغاء',
                    style: ar(13.5, color: const Color(0xFF9A8F7E))),
              ),
            ),
          ]),
        ),
      );
}
