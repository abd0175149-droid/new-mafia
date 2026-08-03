import 'package:dotted_border/dotted_border.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../../app/router.dart';
import '../../core/api/api_client.dart';
import '../../core/socket/socket_service.dart';
import '../../core/storage/session_store.dart';
import '../../models/wallet.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🪙 محفظتي — الملفّ 32
// ══════════════════════════════════════════════════════
// **لا شراء داخل التطبيق إطلاقاً.** المسار الوحيد لدخول التشبس شحنٌ
// إداريّ يُرصد في القاعة — وهذا يُبعد الخزنة عن قاعدة الشراء داخل
// التطبيق ويقرّبها من برنامج ولاء. لا تُضِف زرّ شحن هنا.

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  Wallet? _wallet;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
    SocketService.instance.on('chips:balance-updated', _onBalance);
  }

  @override
  void dispose() {
    SocketService.instance.off('chips:balance-updated', _onBalance);
    super.dispose();
  }

  /// بثّ الرصيد يصحّح الرقم فوراً؛ والسجلّ يُعاد جلبه لأن الحركة الجديدة
  /// لا تصل في البثّ.
  void _onBalance(dynamic _) => _load();

  Future<void> _load() async {
    if (SessionStore.instance.player?.id == null) {
      setState(() => _loading = false);
      return;
    }
    try {
      final r = await ApiClient.instance.get('/api/chips/me/wallet',
          query: {'limit': 60});
      if (!mounted) return;
      if (r is Map && r['success'] == true) {
        setState(() {
          _wallet = Wallet.fromJson(Map<String, dynamic>.from(r));
          _loading = false;
        });
        return;
      }
      setState(() => _loading = false);
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final w = _wallet;

    return PopsToHome(
      child: Scaffold(
        backgroundColor: const Color(0xFF0A0A0F),
        body: SafeArea(
          bottom: false,
          child: Column(children: [
            _header(),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _load,
                color: Tw.amber500,
                backgroundColor: const Color(0xFF111111),
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.only(bottom: 96),
                  children: [
                    _balance(w),
                    if (!_loading && w != null) ...[
                      _summary(w),
                      const SizedBox(height: 24),
                      _ledger(w),
                      const SizedBox(height: 32),
                      _earnCard(),
                    ],
                  ],
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _header() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: const BoxDecoration(
          color: Color(0xD90A0A0F),
          border: Border(bottom: BorderSide(color: Color(0x26F59E0B))),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            InkWell(
              onTap: () => popOrHome(context),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                child: Text('← رجوع', style: ar(14, color: Tw.gray500)),
              ),
            ),
            Text('🪙 محفظتي',
                style: const TextStyle(
                    fontFamily: 'Amiri',
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    color: Tw.amber400,
                    letterSpacing: 0)),
            InkWell(
              onTap: () => swapTo(Routes.store),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                child: Text('الخزنة ←',
                    style: ar(11, color: const Color(0xE6FBBF24),
                        weight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      );

  Widget _balance(Wallet? w) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Column(children: [
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 250),
            transitionBuilder: (child, a) => ScaleTransition(
              scale: Tween(begin: 0.9, end: 1.0).animate(a),
              child: FadeTransition(opacity: a, child: child),
            ),
            child: Text(
              w == null ? '—' : groupThousands(w.balance),
              key: ValueKey(w?.balance),
              style: num_(60, color: Tw.amber400).copyWith(
                shadows: const [
                  Shadow(color: Color(0x73F59E0B), blurRadius: 34),
                ],
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text('🪙 رصيدك الحالي', style: ar(14, color: Tw.gray500)),
          const SizedBox(height: 8),
          // ليس زخرفة: العناصر تُستأجَر بمدّة، والخلط بين انتهاء الميزة
          // وانتهاء الرصيد أوّل ما يُساء فهمه.
          Text('الرصيد لا ينتهي أبداً — المزايا وحدها لها مدّة',
              style: ar(11, color: Tw.gray600)),
        ]),
      );

  Widget _summary(Wallet w) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: IntrinsicHeight(
          child: Row(children: [
            _summaryCard('🏆', w.earnedFree, 'كسبته باللعب', const Color(0xFF34D399)),
            const SizedBox(width: 8),
            _summaryCard('💵', w.toppedUp, 'وصلك شحناً وهدايا', Tw.amber400),
            const SizedBox(width: 8),
            _summaryCard('🛒', w.spent, 'صرفته', const Color(0xFFFB7185)),
          ]),
        ),
      );

  Widget _summaryCard(String icon, int value, String label, Color color) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            color: const Color(0x0AFFFFFF),
            border: Border.all(color: const Color(0x14FFFFFF)),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(icon, style: const TextStyle(fontSize: 16)),
              const SizedBox(height: 2),
              Text(groupThousands(value), style: num_(20, color: color)),
              const SizedBox(height: 2),
              Text(label,
                  textAlign: TextAlign.center, style: ar(10, color: Tw.gray500)),
            ],
          ),
        ),
      );

  Widget _ledger(Wallet w) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('📒 سجل الحركات',
                style: ar(14, color: Tw.gray300, weight: FontWeight.w900)),
            const SizedBox(height: 12),
            if (w.ledger.isEmpty)
              _emptyLedger()
            else ...[
              for (final e in w.ledger)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _LedgerRow(entry: e),
                ),
              if (w.moves >= 60) ...[
                const SizedBox(height: 4),
                Center(
                    child: Text('تُعرض آخر ٦٠ حركة',
                        style: ar(11, color: Tw.gray600))),
              ],
            ],
          ],
        ),
      );

  Widget _emptyLedger() => DottedBorder(
        color: const Color(0x1AFFFFFF),
        radius: const Radius.circular(16),
        borderType: BorderType.RRect,
        dashPattern: const [6, 4],
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
          child: Column(children: [
            const Text('🪙', style: TextStyle(fontSize: 36)),
            const SizedBox(height: 12),
            Text('ما في حركات بعد.',
                textAlign: TextAlign.center, style: ar(14, color: Tw.gray400)),
            const SizedBox(height: 4),
            Text.rich(
              TextSpan(children: [
                TextSpan(text: 'اربح مباراتك الجاية وبتشوف أول ',
                    style: ar(14, color: Tw.gray400)),
                TextSpan(text: '+2 🪙',
                    style: ar(14, color: Tw.amber400, weight: FontWeight.bold)),
                TextSpan(text: ' هون.', style: ar(14, color: Tw.gray400)),
              ]),
              textAlign: TextAlign.center,
            ),
          ]),
        ),
      );

  /// ⚠️ الأرقام هنا مكتوبة في الويب ولا تأتي من الخادم، وستكذب الشاشة إن
  /// عُدّلت الجوائز من اللوحة. المصدر الصحيح `earnRates` من الخزنة
  /// (الملفّ 33) — حتى تصل، نعرض الأسطر **بلا أرقام** بدل رقمٍ مخمَّن.
  Widget _earnCard() => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            color: const Color(0x0FF59E0B),
            border: Border.all(color: const Color(0x33F59E0B)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('كيف تكسب أكثر؟',
                style: ar(14, color: Tw.amber400, weight: FontWeight.w900)),
            const SizedBox(height: 8),
            for (final line in const [
              '🏆 اربح المباراة',
              '🥉 اطلع ضمن أفضل ثلاثة',
              '🎂 عيد ميلادك — عيديّة من النادي',
              '💵 أو اشحن من الإدارة بالحضور',
            ])
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(line, style: ar(12.5, color: Tw.gray400)),
              ),
          ]),
        ),
      );
}

class _LedgerRow extends StatelessWidget {
  const _LedgerRow({required this.entry});
  final LedgerEntry entry;

  @override
  Widget build(BuildContext context) {
    final (icon, label) = ledgerReason(entry.reason, entry.amount);
    final note = entry.visibleNote;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: const Color(0x08FFFFFF),
        border: Border.all(color: const Color(0x14FFFFFF)),
      ),
      child: Row(children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: const Color(0x66000000),
            border: Border.all(color: const Color(0x1AFFFFFF)),
          ),
          child: Center(child: Text(icon, style: const TextStyle(fontSize: 18))),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text.rich(
                TextSpan(children: [
                  TextSpan(
                      text: label,
                      style: ar(14,
                          color: const Color(0xFFE5E7EB), weight: FontWeight.bold)),
                  if (note != null)
                    TextSpan(text: ' — $note', style: ar(14, color: Tw.gray500)),
                ]),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Text(
                entry.createdAt == null
                    ? ''
                    : DateFormat('d MMMM • HH:mm', 'ar').format(entry.createdAt!),
                style: ar(10, color: Tw.gray600),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            ltrText(
              entry.amountText,
              num_(16,
                  color: entry.isPositive
                      ? const Color(0xFF34D399)
                      : const Color(0xFFFB7185)),
            ),
            const SizedBox(height: 2),
            Text('الرصيد ${groupThousands(entry.balanceAfter)}',
                style: num_(10, color: Tw.gray600, weight: FontWeight.w400)),
          ],
        ),
      ]),
    );
  }
}
