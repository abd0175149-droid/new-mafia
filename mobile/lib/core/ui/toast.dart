import 'dart:async';

import 'package:flutter/material.dart';

// ══════════════════════════════════════════════════════
// 🍞 الـToast — §4.4 في الملفّ 13
// ══════════════════════════════════════════════════════
// ليس SnackBar: ذاك يحمل هويّة Material ويزيح المحتوى وينحاز لأسفل
// الشاشة بلا اعتبار لشريط التنقّل. هذا طبقة فوق كل شيء، بموضعٍ نعرفه.

class MafiaToast {
  MafiaToast._();

  static OverlayEntry? _entry;
  static Timer? _timer;

  /// يُظهر رسالة لثلاث ثوانٍ.
  ///
  /// 🔴 رسالة جديدة أثناء عرض سابقة **تلغي مؤقّت السابقة** وتبدأ ثلاثاً
  ///    جديدة. في الويب سباقُ مؤقّتات هنا: الثانية تختفي بعد بقيّة عمر
  ///    الأولى. أُصلح دون تغيير السلوك الظاهر.
  static void show(BuildContext context, String message, {double bottomInset = 96}) {
    final overlay = Overlay.maybeOf(context, rootOverlay: true);
    if (overlay == null) return;

    _dismiss();

    final entry = OverlayEntry(
      builder: (_) => Positioned(
        left: 0,
        right: 0,
        bottom: bottomInset,
        child: IgnorePointer(
          child: Directionality(
            textDirection: TextDirection.rtl,
            child: Center(child: _ToastBody(message: message)),
          ),
        ),
      ),
    );

    _entry = entry;
    overlay.insert(entry);
    _timer = Timer(const Duration(milliseconds: 3000), _dismiss);
  }

  static void _dismiss() {
    _timer?.cancel();
    _timer = null;
    _entry?.remove();
    _entry = null;
  }

  /// يُستدعى عند التخلّص من الشاشة — طبقةٌ معلّقة بعد زوال سياقها تُسقط
  /// التطبيق عند إزالتها لاحقاً.
  static void hide() => _dismiss();
}

class _ToastBody extends StatefulWidget {
  const _ToastBody({required this.message});
  final String message;

  @override
  State<_ToastBody> createState() => _ToastBodyState();
}

class _ToastBodyState extends State<_ToastBody> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 300),
  )..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final curve = CurvedAnimation(parent: _c, curve: Curves.easeOut);
    return FadeTransition(
      opacity: curve,
      child: AnimatedBuilder(
        animation: curve,
        builder: (_, child) =>
            Transform.translate(offset: Offset(0, 50 * (1 - curve.value)), child: child),
        child: Material(
          color: Colors.transparent,
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 24),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFF1F2937),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF374151)),
              boxShadow: const [
                BoxShadow(color: Color(0x99000000), blurRadius: 30, offset: Offset(0, 10)),
              ],
            ),
            child: Text(
              widget.message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontFamily: 'Tajawal',
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: Color(0xFFFBBF24),
                letterSpacing: 0,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
