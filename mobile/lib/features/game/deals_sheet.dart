import 'package:flutter/material.dart';

import '../../models/game.dart';
import '../profile/profile_palette.dart';
import 'game_session_controller.dart';

// ══════════════════════════════════════════════════════
// 🤝 الاتفاقيات الثنائية — §4.2 في الملفّ ٢٥
// ══════════════════════════════════════════════════════
// «ديل» بين مبادرٍ وهدف: إن أُقصي الهدف وكان مواطناً أُقصي المبادر معه.
// القواعد كلّها من `deal-engine.ts` ويفرضها الخادم؛ الواجهة تعرضها مسبقاً
// كي لا يصطدم اللاعب برسالة خطأ بعد أن اختار.

const _gold = Color(0xFFC5A059);

/// زرّ فتح الورقة — يُعرض في مرحلة النقاش للأحياء.
class DealsButton extends StatelessWidget {
  const DealsButton({super.key, required this.controller});
  final GameSessionController controller;

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => showDealsSheet(context, controller),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: _gold.withValues(alpha: 0.05),
              border: Border.all(color: _gold.withValues(alpha: 0.3)),
            ),
            child: Row(children: [
              Text('🤝 الاتفاقيات',
                  style: ar(14, color: _gold, weight: FontWeight.bold)),
              const Spacer(),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: _gold.withValues(alpha: 0.12),
                  border: Border.all(color: _gold.withValues(alpha: 0.25)),
                ),
                child: Text('${controller.deals.length}/3',
                    style: mono(12, color: _gold)),
              ),
            ]),
          ),
        ),
      );
}

Future<void> showDealsSheet(
        BuildContext context, GameSessionController c) =>
    showModalBottomSheet<void>(
      context: context,
      // 🔴 مُلاحِح **الجذر** لا مُلاحِح الفرع: شاشة اللعب تعيش داخل
      //    `StatefulShellRoute`، ومُلاحِحُ الفرع يرسم تحت شريط التنقّل
      //    السفليّ — فتُقصّ الورقة من أسفلها ويختفي زرّ الإبرام.
      useRootNavigator: true,
      // وحاوية الأمان تمنع اصطدام الحافة السفلية بشريط الإيماءات
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      barrierColor: const Color(0xB3000000),
      builder: (_) => _DealsSheet(controller: c),
    );

class _DealsSheet extends StatefulWidget {
  const _DealsSheet({required this.controller});
  final GameSessionController controller;

  @override
  State<_DealsSheet> createState() => _DealsSheetState();
}

class _DealsSheetState extends State<_DealsSheet> {
  int? _picked;

  GameSessionController get c => widget.controller;

  @override
  void initState() {
    super.initState();
    c.addListener(_sync);
  }

  @override
  void dispose() {
    c.removeListener(_sync);
    super.dispose();
  }

  void _sync() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: TextDirection.rtl,
        child: Container(
          constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(context).height * 0.82),
          decoration: const BoxDecoration(
            color: Color(0xFF0C0B09),
            border: Border(top: BorderSide(color: Color(0xFF1F1A12))),
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
          ),
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Row(children: [
                Expanded(
                  child: Text('🤝 الاتفاقيات الثنائية (${c.deals.length}/3)',
                      style: const TextStyle(
                        fontFamily: 'Amiri',
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: _gold,
                        letterSpacing: 0,
                      )),
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.close, color: Color(0xFF808080)),
                ),
              ]),
              const SizedBox(height: 12),
              _body(),
              const SizedBox(height: 8),
            ]),
          ),
        ),
      );

  Widget _body() {
    // الترتيب مقصود: اتفاقيتي أوّلاً — من أبرم يحتاج إلغاءها لا إنشاء
    // أخرى، ورسالةُ منعٍ فوق بطاقته تُربكه.
    final mine = c.myDeal;
    if (mine != null) return _mineCard(mine);

    final blocked = c.dealBlockReason;
    if (blocked != null) return _infoCard(blocked);

    return _createForm();
  }

  Widget _mineCard(Deal d) {
    final name = c.roster
            .where((p) => p.physicalId == d.targetPhysicalId)
            .map((p) => p.name)
            .firstOrNull ??
        '';
    return Column(children: [
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: const Color(0xFF22C55E).withValues(alpha: 0.1),
          border: Border.all(
              color: const Color(0xFF22C55E).withValues(alpha: 0.3)),
        ),
        child: Column(children: [
          Text('🤝 تم إبرام اتفاقيتك بنجاح!',
              style: ar(15,
                  color: const Color(0xFF4ADE80), weight: FontWeight.bold)),
          const SizedBox(height: 6),
          Text.rich(
            TextSpan(children: [
              const TextSpan(text: 'أنت شريك الآن مع: '),
              TextSpan(
                text: name.isNotEmpty
                    ? name
                    : 'لاعب #${d.targetPhysicalId}',
                style: ar(14, weight: FontWeight.w900),
              ),
            ]),
            textAlign: TextAlign.center,
            style: ar(13, color: const Color(0xFFBBBBBB)),
          ),
        ]),
      ),
      const SizedBox(height: 12),
      SizedBox(
        width: double.infinity,
        child: Opacity(
          opacity: c.dealBusy ? 0.4 : 1,
          child: OutlinedButton(
            onPressed: c.dealBusy ? null : () => c.removeDeal(d.id),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 12),
              backgroundColor:
                  const Color(0xFFEF4444).withValues(alpha: 0.1),
              side: BorderSide(
                  color: const Color(0xFFEF4444).withValues(alpha: 0.2)),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child: Text(c.dealBusy ? 'جاري الإلغاء...' : '❌ إلغاء الاتفاقية',
                style: ar(14,
                    color: const Color(0xFFF87171),
                    weight: FontWeight.bold)),
          ),
        ),
      ),
      if (c.dealError != null) ...[
        const SizedBox(height: 8),
        _error(c.dealError!),
      ],
      const SizedBox(height: 12),
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          color: const Color(0xFFEF4444).withValues(alpha: 0.08),
          border: Border.all(
              color: const Color(0xFFEF4444).withValues(alpha: 0.2)),
        ),
        child: Text(
            '⚠️ مخاطرة: في حال تم إقصاء شريكك في الاتفاقية وكان مواطناً، '
            'فسيتم إقصاؤك معه تلقائياً!',
            style: ar(11,
                color: const Color(0xFFF87171), weight: FontWeight.bold)),
      ),
    ]);
  }

  Widget _infoCard(String text) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: _gold.withValues(alpha: 0.05),
          border: Border.all(color: _gold.withValues(alpha: 0.12)),
        ),
        child: Column(children: [
          Text('🔒 ميزة الديل (Deals)',
              style: ar(14, color: _gold, weight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(text,
              textAlign: TextAlign.center,
              style: ar(12, color: const Color(0xFF9A9A9A), height: 1.7)),
        ]),
      );

  Widget _createForm() {
    final others = c.roster
        .where((p) => p.physicalId != c.physicalId && p.isAlive)
        .toList()
      ..sort((a, b) => a.physicalId.compareTo(b.physicalId));

    return Column(children: [
      for (final p in others) _option(p),
      const SizedBox(height: 12),
      SizedBox(
        width: double.infinity,
        child: Opacity(
          opacity: (_picked == null || c.dealBusy) ? 0.4 : 1,
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: (_picked == null || c.dealBusy)
                ? null
                : () async {
                    final ok = await c.createDeal(_picked!);
                    if (ok) _picked = null;
                  },
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 13),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                gradient: const LinearGradient(
                    colors: [Color(0xFFC5A059), Color(0xFFB38E4B)]),
              ),
              child: c.dealBusy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.black),
                    )
                  : Text('🤝 إبرام اتفاقية',
                      style: ar(14,
                          color: Colors.black, weight: FontWeight.w900)),
            ),
          ),
        ),
      ),
      if (c.dealError != null) ...[
        const SizedBox(height: 10),
        _error(c.dealError!),
      ],
    ]);
  }

  Widget _option(RosterPlayer p) {
    // مستهدفٌ في اتفاقيةٍ قائمة: يبقى **مرئياً** معطَّلاً بلاحقةٍ صريحة.
    // إخفاؤه يجعل القائمة تتغيّر تحت إصبع اللاعب بلا تفسير.
    final taken = c.isDealTargeted(p.physicalId);
    final on = _picked == p.physicalId;

    return Opacity(
      opacity: taken ? 0.45 : 1,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: taken
                ? null
                : () => setState(() => _picked = on ? null : p.physicalId),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                color: on ? _gold.withValues(alpha: 0.12) : const Color(0x0DFFFFFF),
                border: Border.all(
                    color: on
                        ? _gold
                        : const Color(0xFFFFFFFF).withValues(alpha: 0.1)),
              ),
              child: Row(children: [
                Text('#${p.physicalId}',
                    style: mono(13, color: on ? _gold : const Color(0xFF888888))),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                      p.name.isNotEmpty ? p.name : 'لاعب #${p.physicalId}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ar(13,
                          weight:
                              on ? FontWeight.bold : FontWeight.w400)),
                ),
                if (taken)
                  Text('مستهدف 🔒',
                      style: ar(11, color: const Color(0xFF888888)))
                else if (on)
                  const Icon(Icons.check_circle, size: 18, color: _gold),
              ]),
            ),
          ),
        ),
      ),
    );
  }

  Widget _error(String msg) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          color: const Color(0xFFEF4444).withValues(alpha: 0.1),
          border: Border.all(
              color: const Color(0xFFEF4444).withValues(alpha: 0.3)),
        ),
        child: Text('❌ $msg',
            textAlign: TextAlign.center,
            style: ar(12, color: const Color(0xFFF87171))),
      );
}
