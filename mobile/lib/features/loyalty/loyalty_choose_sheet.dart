import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/theme/theme.dart';
import '../../core/api/api_client.dart';
import '../../core/api/loyalty_api.dart';
import '../../models/fnb.dart' show arDigits;
import '../../models/loyalty.dart';
import '../profile/profile_palette.dart';
import '../shell/chips_balance_pill.dart' show ChipsRefreshBus;

// ══════════════════════════════════════════════════════
// 🎁 ورقة اختيار المكافأة
// ══════════════════════════════════════════════════════
// الاختيار نهائيّ ولا يُبدَّل — فالزرّ الأساسيّ يسمّي ما سيُثبَّت.
// الخيارات من `config.kinds` وحدها: نوعٌ أطفأه الأدمن لا يظهر.

/// تعيد `true` إن اختار اللاعب مكافأةً بنجاح.
Future<bool?> showLoyaltyChooseSheet(
  BuildContext context, {
  required LoyaltyMe me,
  required LoyaltyReward reward,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    useRootNavigator: true,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0xE6000000),
    isScrollControlled: true,
    constraints: BoxConstraints(
      maxWidth: 420,
      maxHeight: MediaQuery.sizeOf(context).height * 0.85,
    ),
    builder: (_) => _ChooseSheet(me: me, reward: reward),
  );
}

class _ChooseSheet extends StatefulWidget {
  const _ChooseSheet({required this.me, required this.reward});
  final LoyaltyMe me;
  final LoyaltyReward reward;

  @override
  State<_ChooseSheet> createState() => _ChooseSheetState();
}

class _ChooseSheetState extends State<_ChooseSheet> {
  String? _kind;
  bool _busy = false;
  String? _error;

  LoyaltyConfig get _cfg => widget.me.config;

  @override
  void initState() {
    super.initState();
    _kind = _cfg.kinds.firstOrNull;
  }

  String _label(String kind) => switch (kind) {
        'free_visit' => 'زيارة مجّانيّة',
        'free_drink' => 'مشروب مجّاني',
        'chips' => '${arDigits(_cfg.chipsAmount)} تشبس',
        _ => kind,
      };

  String _emoji(String kind) => switch (kind) {
        'free_visit' => '🎟️',
        'free_drink' => '☕',
        'chips' => '🪙',
        _ => '🎁',
      };

  String _desc(String kind) => switch (kind) {
        'free_visit' =>
          'رسم اللعبة على النادي، تُطبَّق تلقائيّاً على حجزك القادم',
        'free_drink' =>
          'أيّ مشروب حتى ${jodText(_cfg.drinkCapJod)} يُخصم من فاتورتك في المكان',
        'chips' => 'تُضاف فوراً لرصيدك',
        _ => '',
      };

  Future<void> _confirm() async {
    final kind = _kind;
    if (kind == null || _busy) return;
    setState(() { _busy = true; _error = null; });
    try {
      await LoyaltyApi.instance.choose(widget.reward.id, kind);
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      // التشبس تُضاف فوراً: حبّة الرصيد تُحدَّث دون انتظار بثّ السوكِت
      if (kind == 'chips') ChipsRefreshBus.instance.ping();
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() { _busy = false; _error = e.message; });
    } catch (_) {
      if (!mounted) return;
      setState(() { _busy = false; _error = 'تعذّر الاتصال بالخادم'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.reward;
    final kinds = _cfg.kinds;
    final expires = r.expiresAt;

    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Tw.gray900, Color(0xFF000000)],
        ),
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(top: BorderSide(color: Color(0x1AFFFFFF))),
      ),
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
            24, 24, 24, 24 + MediaQuery.viewPaddingOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 48,
                height: 6,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: const Color(0x33FFFFFF),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const Center(child: Text('🎁', style: TextStyle(fontSize: 40))),
            const SizedBox(height: 8),
            Center(
              child: Text('اكتملت بطاقة ${periodMonthName(r.period.isEmpty ? widget.me.period : r.period)}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontFamily: 'Amiri',
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      color: Tw.amber400,
                      letterSpacing: 0)),
            ),
            const SizedBox(height: 4),
            Center(
              child: Text('اختر مكافأتك — الاختيار نهائيّ ولا يُبدَّل',
                  textAlign: TextAlign.center, style: ar(12, color: Tw.gray400)),
            ),
            const SizedBox(height: 18),
            for (final k in kinds) ...[
              _option(k),
              const SizedBox(height: 8),
            ],
            if (kinds.isEmpty)
              Center(
                child: Text('لا مكافآت متاحةً حاليّاً',
                    style: ar(12, color: Tw.gray500)),
              ),
            const SizedBox(height: 6),
            Text(
              '${expires != null ? 'صالحة حتى ${jordanDayMonth(expires)} · ' : ''}'
              'إن لم تختر خلال ${arDigits(_cfg.chooseWindowDays)} أيّام نختار لك التشبس.',
              textAlign: TextAlign.center,
              style: ar(10.5, color: Tw.gray500, height: 1.5),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Center(
                child: Text('⚠️ $_error',
                    textAlign: TextAlign.center,
                    style: ar(12, color: const Color(0xFFF87171), weight: FontWeight.bold)),
              ),
            ],
            const SizedBox(height: 18),
            InkWell(
              onTap: (_kind == null || _busy) ? null : _confirm,
              borderRadius: NoirRadius.soft,
              child: Opacity(
                opacity: (_kind == null || _busy) ? 0.55 : 1,
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  decoration: const BoxDecoration(
                    borderRadius: NoirRadius.soft,
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFFFBBF24), Color(0xFFF59E0B)],
                    ),
                  ),
                  child: Center(
                    child: Text(
                      _busy
                          ? '...'
                          : _kind == null
                              ? 'تثبيت'
                              : 'تثبيت: ${_emoji(_kind!)} ${_label(_kind!)}',
                      style: ar(14, color: Colors.black, weight: FontWeight.w700),
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

  Widget _option(String k) {
    final on = _kind == k;
    return InkWell(
      onTap: _busy ? null : () => setState(() { _kind = k; _error = null; }),
      borderRadius: BorderRadius.circular(16),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: on ? const Color(0x1AF59E0B) : const Color(0x0DFFFFFF),
          border: Border.all(color: on ? Tw.amber500 : const Color(0x1AFFFFFF)),
        ),
        child: Row(children: [
          // زرّ راديو بلون التطبيق لا Material الافتراضيّ
          Container(
            width: 18,
            height: 18,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: on ? Tw.amber400 : Tw.gray600, width: 1.5),
            ),
            child: on
                ? Center(
                    child: Container(
                      width: 9,
                      height: 9,
                      decoration: const BoxDecoration(
                          shape: BoxShape.circle, color: Tw.amber400),
                    ),
                  )
                : null,
          ),
          const SizedBox(width: 10),
          Text(_emoji(k), style: const TextStyle(fontSize: 22)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_label(k),
                    style: ar(14,
                        color: on ? Tw.amber400 : Colors.white,
                        weight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(_desc(k), style: ar(10.5, color: Tw.gray400, height: 1.4)),
              ],
            ),
          ),
        ]),
      ),
    );
  }
}
