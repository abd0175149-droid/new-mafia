import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../models/fnb.dart';
import '../order/order_widgets.dart' show BundleChip, kBundleText, kEmeraldText;
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🍽️ ورقة منيو المكان — استعراضٌ قبل الحجز
// 🎯 توحيد 2026-08-06: المنيو هو كتالوج المكان الوحيد (أصنافٌ مفردة + باقات)،
// فيستعرضه اللاعب من ورقة تفاصيل الفعاليّة ليعرف ماذا يقدّم المكان وبكم.
// ⚠️ **عرضٌ فقط** — لا سلّة ولا طلب هنا: الطلب يبقى في /player/order داخل
// نافذته (ساعة قبل الموعد ← 12 بعده) ويتطلّب حجزاً. مطابقٌ لويب games/page.tsx.
// ══════════════════════════════════════════════════════

/// نقطة عامّة بلا مصادقة، ولا تكشف حصّة النادي (الخادم يجرّدها).
Future<void> showLocationMenu(
  BuildContext context, {
  required int locationId,
  required String locationName,
}) {
  return showModalBottomSheet<void>(
    context: context,
    useRootNavigator: false,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0xE6000000),
    isScrollControlled: true,
    constraints: BoxConstraints(
      maxWidth: 512,
      maxHeight: MediaQuery.sizeOf(context).height * 0.85,
    ),
    builder: (_) =>
        _MenuSheet(locationId: locationId, locationName: locationName),
  );
}

class _MenuSheet extends StatefulWidget {
  const _MenuSheet({required this.locationId, required this.locationName});
  final int locationId;
  final String locationName;

  @override
  State<_MenuSheet> createState() => _MenuSheetState();
}

class _MenuSheetState extends State<_MenuSheet> {
  List<FnbMenuItem>? _items;   // null = يُحمَّل
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await ApiClient.instance
          .get('/api/player-app/locations/${widget.locationId}/menu');
      if (!mounted) return;
      setState(() => _items = (d['items'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => FnbMenuItem.fromJson(Map<String, dynamic>.from(e)))
          .toList());
    } catch (_) {
      if (mounted) setState(() { _items = const []; _failed = true; });
    }
  }

  @override
  Widget build(BuildContext context) => DecoratedBox(
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
          // حشوة سفليّة بقدر شريط التنقّل — كورقتَي النشاط والحجز
          padding: EdgeInsets.fromLTRB(
              24, 24, 24, 24 + 64 + MediaQuery.viewPaddingOf(context).bottom),
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
              Text('🍽️ منيو ${widget.locationName}',
                  style: ar(18, weight: FontWeight.bold)),
              const SizedBox(height: 4),
              Text(
                'للاطّلاع فقط — يفتح الطلب من التطبيق قبل موعد الفعاليّة بساعة ويحتاج حجزاً باسمك.',
                style: ar(11, color: Tw.gray500, height: 1.5),
              ),
              const SizedBox(height: 16),
              ..._body(),
            ],
          ),
        ),
      );

  List<Widget> _body() {
    final items = _items;
    if (items == null) {
      return [
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 48),
          child: Center(child: CircularProgressIndicator(color: kEmeraldText)),
        ),
      ];
    }
    if (items.isEmpty) {
      return [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 48),
          child: Center(
            child: Text(
              _failed ? 'تعذّر تحميل المنيو — تحقّق من اتّصالك' : 'المكان لم يضف أصنافاً بعد',
              style: ar(13, color: Tw.gray500),
            ),
          ),
        ),
      ];
    }

    // ترتيب الخادم محفوظ (فئة ↗ ثمّ sortOrder ثمّ id) — لا فرز أبجديّ
    final grouped = groupByCategory(items);
    return [
      for (final entry in grouped.entries) ...[
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(children: [
            Text(entry.key,
                style: ar(12, color: kEmeraldText, weight: FontWeight.bold)),
            const SizedBox(width: 8),
            const Expanded(child: Divider(color: Color(0x1A10B981), height: 1)),
          ]),
        ),
        for (final it in entry.value)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _ItemRow(item: it),
          ),
        const SizedBox(height: 8),
      ],
    ];
  }
}

/// صفّ عرضٍ فقط — بلا عدّاد ولا زرّ إضافة (خلافاً لصفّ شاشة الطلب).
class _ItemRow extends StatelessWidget {
  const _ItemRow({required this.item});
  final FnbMenuItem item;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: const Color(0x08FFFFFF),
          border: Border.all(color: const Color(0x0FFFFFFF)),
        ),
        child: Row(children: [
          _thumb(),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(mainAxisSize: MainAxisSize.min, children: [
                  if (item.isBundle) ...[
                    const BundleChip(),
                    const SizedBox(width: 6),
                  ],
                  Flexible(
                    child: Text(item.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ar(14)),
                  ),
                ]),
                if (item.subtitle.isNotEmpty)
                  Text(item.subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: ar(10,
                          color: item.isBundle ? kBundleText : Tw.gray600,
                          height: 1.4)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          ltrText(item.priceText,
              num_(14, color: kEmeraldText, weight: FontWeight.bold)),
        ]),
      );

  Widget _thumb() {
    const size = 44.0;
    final fallback = Center(
        child: Text(item.isBundle ? '🎁' : '🍴',
            style: const TextStyle(fontSize: 18)));
    final url = item.imageUrl;
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: size,
        height: size,
        color: Tw.gray800,
        child: url == null
            ? fallback
            : CachedNetworkImage(
                imageUrl: ApiClient.instance.upload(url),
                fit: BoxFit.cover,
                memCacheWidth: 132,
                errorWidget: (_, __, ___) => fallback,
                placeholder: (_, __) => const SizedBox.shrink(),
              ),
      ),
    );
  }
}
