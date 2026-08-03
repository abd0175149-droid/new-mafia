import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/theme/theme.dart';
import '../../app/router.dart';
import '../../core/api/api_client.dart';
import '../../core/socket/socket_service.dart';
import '../../core/storage/session_store.dart';

// ══════════════════════════════════════════════════════
// 🪙 حبّة رصيد التشبس — §4.6 في الملفّ 32
// ══════════════════════════════════════════════════════
// في ترويسة الرئيسية، وهي **الباب الوحيد** إلى الخزنة من هذه الشاشة.

class ChipsBalancePill extends StatefulWidget {
  const ChipsBalancePill({super.key, this.onTap});

  final VoidCallback? onTap;

  @override
  State<ChipsBalancePill> createState() => _ChipsBalancePillState();
}

class _ChipsBalancePillState extends State<ChipsBalancePill> with WidgetsBindingObserver {
  int? _balance;
  int? _delta;
  Timer? _deltaTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (SessionStore.instance.isLoggedIn) {
      _fetch();
      SocketService.instance.on('chips:balance-updated', _onUpdate);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    SocketService.instance.off('chips:balance-updated', _onUpdate);
    _deltaTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // مسار احتياطيّ: السوكِت هو الأساس، وهذا يضمن الصحّة إن انقطع
    if (state == AppLifecycleState.resumed) _fetch();
  }

  Future<void> _fetch() async {
    try {
      final r = await ApiClient.instance.get('/api/chips/me');
      if (!mounted) return;
      setState(() => _balance = (r is Map ? (r['balance'] as num?)?.toInt() : null) ?? 0);
    } catch (_) {
      // يبقى «—» — انظر القاعدة أدناه
    }
  }

  void _onUpdate(dynamic p) {
    if (!mounted || p is! Map) return;
    setState(() => _balance = (p['balance'] as num?)?.toInt() ?? _balance);
    final d = (p['delta'] as num?)?.toInt() ?? 0;
    if (d == 0) return;
    setState(() => _delta = d);
    _deltaTimer?.cancel();
    _deltaTimer = Timer(const Duration(milliseconds: 2600), () {
      if (mounted) setState(() => _delta = null);
    });
  }

  @override
  Widget build(BuildContext context) {
    // 🔴 لا تُخفى الحبّة حين يتعذّر معرفة الرصيد.
    //    هي الباب الوحيد إلى الخزنة من الرئيسية، وإخفاؤها عند فشل جلب
    //    واحد يُخفي المتجر كلّه. تُعرض بشرطة؛ الوجهة تعمل دائماً.
    final unknown = _balance == null;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        InkWell(
          onTap: widget.onTap ?? () => pushTo(Routes.store),
          borderRadius: NoirRadius.soft,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              borderRadius: NoirRadius.soft,
              gradient: const LinearGradient(
                begin: Alignment.topLeft, end: Alignment.bottomRight,
                colors: [Color(0x29F59E0B), Color(0x0DF59E0B)],
              ),
              border: Border.all(color: const Color(0x52F59E0B)),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Text('🪙', style: TextStyle(fontSize: 14)),
              const SizedBox(width: 6),
              Text(
                unknown ? '—' : _fmt(_balance!),
                style: TextStyle(
                  fontFamily: 'Tajawal', fontSize: 12, fontWeight: FontWeight.bold,
                  color: const Color(0xFFFBBF24), letterSpacing: 0,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ).copyWith(color: unknown ? const Color(0x8CFBBF24) : null),
              ),
            ]),
          ),
        ),
        if (_delta != null)
          Positioned(
            top: -18, left: 0, right: 0,
            child: IgnorePointer(
              child: Text(
                _delta! > 0 ? '+${_delta!} 🪙' : '${_delta!} 🪙',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontFamily: 'Tajawal', fontSize: 11, fontWeight: FontWeight.bold,
                    color: _delta! > 0 ? const Color(0xFF34D399) : const Color(0xFFFB7185),
                    letterSpacing: 0),
              ),
            ),
          ),
      ],
    );
  }

  /// فواصل آلاف لاتينية — مطابقة للويب (`toLocaleString('en-US')`).
  String _fmt(int n) {
    final s = n.abs().toString();
    final b = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
      b.write(s[i]);
    }
    return (n < 0 ? '-' : '') + b.toString();
  }
}
