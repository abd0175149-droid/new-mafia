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

  /// 🔍 MENU-1: بحثٌ داخل المنيو — يظهر حين تتجاوز الأصناف ثمانية.
  /// منيو المكان يتجاوز ستّين صنفاً، والتمرير اليدويّ الكامل ليس تصفّحاً.
  final _q = TextEditingController();
  String _term = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  /// يطابق الاسم والوصف — كما الويب.
  List<FnbMenuItem> _filter(List<FnbMenuItem> src) {
    final t = _term.trim();
    if (t.isEmpty) return src;
    final n = t.toLowerCase();
    return src
        .where((i) =>
            i.name.toLowerCase().contains(n) ||
            i.description.toLowerCase().contains(n))
        .toList();
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

    final shown = _filter(items);

    // ترتيب الخادم محفوظ (فئة ↗ ثمّ sortOrder ثمّ id) — لا فرز أبجديّ
    final grouped = groupByCategory(shown);
    return [
      // حقل البحث فوق النتائج ويبقى ظاهراً وإن خلت — وإلّا تعذّر مسحه.
      if (items.length > 8) ...[
        TextField(
          controller: _q,
          onChanged: (v) => setState(() => _term = v),
          style: ar(13, color: Colors.white),
          decoration: InputDecoration(
            hintText: 'ابحث في المنيو…',
            hintStyle: ar(12, color: Tw.gray600),
            isDense: true,
            filled: true,
            fillColor: const Color(0x08FFFFFF),
            prefixIcon: const Icon(Icons.search, size: 17, color: Color(0xFF6B7280)),
            suffixIcon: _term.isEmpty
                ? null
                : IconButton(
                    icon: const Icon(Icons.close, size: 16, color: Color(0xFF6B7280)),
                    onPressed: () => setState(() { _q.clear(); _term = ''; }),
                  ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0x0FFFFFFF)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0x3310B981)),
            ),
          ),
        ),
        const SizedBox(height: 12),
      ],

      if (shown.isEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 36),
          child: Column(children: [
            Text('لا صنف يطابق «$_term»',
                style: ar(13, color: Tw.gray500)),
            const SizedBox(height: 10),
            // 🔴 ORDER-1: زرُّ مسحٍ صريح — من لا يجد نتيجةً يريد العودة
            //    للقائمة كاملةً، لا أن يمسح الحقل حرفاً حرفاً.
            GestureDetector(
              onTap: () => setState(() { _q.clear(); _term = ''; }),
              behavior: HitTestBehavior.opaque,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0x3310B981)),
                ),
                child: Text('امسح البحث',
                    style: ar(12, color: kEmeraldText, weight: FontWeight.w700)),
              ),
            ),
          ]),
        ),

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
        // 🗂️ MENU-3: تقسيمٌ فرعيّ داخل الفئة. الحقل `subcategory` موجودٌ
        //    في النموذج ومستعمَلٌ في شاشة الطلب وغير مستعمَلٍ هنا — فأربعون
        //    مشروباً تظهر كتلةً واحدة لا تُقرأ.
        ..._subGrouped(entry.value),
        const SizedBox(height: 8),
      ],
    ];
  }

  /// يقسّم أصناف الفئة إلى أقسامٍ فرعيّة مع عنوانٍ لكلٍّ منها.
  ///
  /// 🔴 بلا عنوانٍ حين يكون القسم الفرعيّ فارغاً أو واحداً: عنوانٌ فرعيّ
  ///    يتيم فوق قائمةٍ كاملة زحامٌ لا تنظيم.
  List<Widget> _subGrouped(List<FnbMenuItem> items) {
    final subs = <String, List<FnbMenuItem>>{};
    for (final i in items) {
      subs.putIfAbsent(i.subcategory.trim(), () => []).add(i);
    }
    final meaningful = subs.keys.where((k) => k.isNotEmpty).length;
    if (meaningful < 2) {
      return [
        for (final it in items)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _ItemRow(item: it),
          ),
      ];
    }
    return [
      for (final e in subs.entries) ...[
        if (e.key.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 6, right: 4),
            child: Text('↳ ${e.key}',
                style: ar(11, color: Tw.gray500, weight: FontWeight.w700)),
          ),
        for (final it in e.value)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _ItemRow(item: it),
          ),
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
