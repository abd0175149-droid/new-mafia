import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../models/game.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🖐️ اختيار المقعد اليدويّ — «اكتب رقم مقعدك»
// ══════════════════════════════════════════════════════
// خطوةٌ داخل قشرة الدخول (ودجةٌ مضمّنة لا حوار) حين تكون الفعاليّة باختيارٍ
// يدويّ. الحقل هو الطريق، وأرقام المتاح تلميحٌ يملأ الحقل بلمسة؛ الخادم وحده
// يحكم أنّ الرقم متاح لحظة الإرسال.

const _gold = Color(0xFFC5A059);
const _line = Color(0xFF2A2A2A);
const _muted = Color(0xFF808080);
const _blood = Color(0xFFE05252);

class SeatChoiceQuestion extends StatefulWidget {
  const SeatChoiceQuestion({
    super.key,
    required this.ask,
    required this.onSubmit,
    required this.onBack,
    this.busy = false,
  });

  final SeatChoiceAsk ask;
  final ValueChanged<String> onSubmit;
  final VoidCallback onBack;
  final bool busy;

  @override
  State<SeatChoiceQuestion> createState() => _SeatChoiceQuestionState();
}

class _SeatChoiceQuestionState extends State<SeatChoiceQuestion> {
  final _ctrl = TextEditingController();

  @override
  void didUpdateWidget(covariant SeatChoiceQuestion old) {
    super.didUpdateWidget(old);
    // رُفض الرقم ⇒ يُفرَّغ الحقل كي لا يُرسَل الرقم المحجوز نفسه مرّةً أخرى
    if (widget.ask != old.ask && widget.ask.error != null) _ctrl.clear();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _submit() {
    final v = _ctrl.text.trim();
    if (v.isEmpty || widget.busy) return;
    widget.onSubmit(v);
  }

  @override
  Widget build(BuildContext context) {
    final ask = widget.ask;
    final full = ask.freeSeats.isEmpty;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      _Head(
        title: 'اختر رقم مقعدك',
        body: ask.maxPlayers > 0
            ? 'اكتب رقم الكرسي الذي تريد الجلوس عليه (من 1 إلى ${ask.maxPlayers})'
            : 'اكتب رقم الكرسي الذي تريد الجلوس عليه',
      ),
      // 🔴 جزيرة LTR: الرقم لا يُقلَب مع الفقرة العربيّة
      Directionality(
        textDirection: TextDirection.ltr,
        child: TextField(
          controller: _ctrl,
          autofocus: true,
          textAlign: TextAlign.center,
          keyboardType: TextInputType.number,
          textInputAction: TextInputAction.done,
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[0-9٠-٩۰-۹]')),
            LengthLimitingTextInputFormatter(3),
          ],
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) => _submit(),
          style: mono(28, color: Colors.white).copyWith(letterSpacing: 4),
          decoration: InputDecoration(
            hintText: 'رقم المقعد',
            hintStyle: ar(16, color: const Color(0xFF444444)),
            filled: true,
            fillColor: const Color(0x66000000),
            contentPadding:
                const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
            enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: _line)),
            focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0x80C5A059))),
          ),
        ),
      ),
      const SizedBox(height: 14),
      if ((ask.error ?? '').isNotEmpty)
        Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: const Color(0x1A8A0303),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(ask.error!,
              textAlign: TextAlign.center, style: ar(13, color: _blood)),
        ),
      if (!full) ...[
        Text('المقاعد المتاحة الآن:',
            textAlign: TextAlign.center, style: ar(12.5, color: _muted)),
        const SizedBox(height: 8),
        Directionality(
          textDirection: TextDirection.ltr,
          child: Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final n in ask.freeSeats)
                _SeatChip(
                  seat: n,
                  selected: _ctrl.text.trim() == '$n',
                  onTap: () => setState(() {
                    _ctrl.text = '$n';
                    _ctrl.selection =
                        TextSelection.collapsed(offset: _ctrl.text.length);
                  }),
                ),
            ],
          ),
        ),
        const SizedBox(height: 20),
      ],
      _PrimaryButton(
        label: widget.busy ? 'جارٍ التحقق…' : 'اجلس في هذا المقعد',
        enabled: _ctrl.text.trim().isNotEmpty && !widget.busy && !full,
        onTap: _submit,
      ),
      const SizedBox(height: 6),
      Semantics(
        button: true,
        child: GestureDetector(
          onTap: widget.onBack,
          behavior: HitTestBehavior.opaque,
          child: Container(
            constraints: const BoxConstraints(minHeight: 44),
            alignment: Alignment.center,
            child: Text('رجوع', style: ar(13, color: _muted)),
          ),
        ),
      ),
    ]);
  }
}

class _Head extends StatelessWidget {
  const _Head({required this.title, required this.body});
  final String title, body;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 24),
        padding: const EdgeInsets.only(bottom: 20),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Color(0x662A2A2A))),
        ),
        child: Column(children: [
          const Text('🪑', style: TextStyle(fontSize: 40)),
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

class _SeatChip extends StatelessWidget {
  const _SeatChip(
      {required this.seat, required this.selected, required this.onTap});
  final int seat;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        selected: selected,
        label: 'المقعد $seat',
        child: GestureDetector(
          onTap: onTap,
          behavior: HitTestBehavior.opaque,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 140),
            constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              color: selected ? const Color(0x33C5A059) : const Color(0x66000000),
              border: Border.all(color: selected ? _gold : _line),
            ),
            child: Text('$seat',
                style: mono(16,
                    color: selected ? _gold : const Color(0xFFBDBDBD),
                    weight: FontWeight.w700)),
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
