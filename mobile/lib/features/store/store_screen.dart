import 'package:flutter/material.dart';

import '../../app/router.dart';
import '../../core/api/api_client.dart';
import '../../core/socket/socket_service.dart';
import '../../models/store.dart';
import '../../models/wallet.dart' show groupThousands;
import '../profile/profile_palette.dart';
import 'item_sheet.dart';
import 'store_widgets.dart';

// ══════════════════════════════════════════════════════
// 🏦 خزنة الدون — الملفّ 33
// ══════════════════════════════════════════════════════
// 📌 المرآة (§4.2) تعرض «بطاقتك كما يراها كل من في القاعة» — أي **كرت
//    اللعب الحقيقيّ** (الملفّ 22) وعليه طبقة المظهر (الملفّ 34)، وكلاهما
//    في طبقة اللعب. مرآةٌ تعرض مربّعاً مخترعاً أسوأ من غيابها: اللاعب
//    يشتري بناءً على ما رآه. تصل مع الكرت.

class StoreScreen extends StatefulWidget {
  const StoreScreen({super.key});

  @override
  State<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends State<StoreScreen> {
  StoreData? _data;
  bool _loading = true;
  String _tab = 'offers';
  int? _busyItem;

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

  /// البثّ يحدّث الرقم في الترويسة فقط — لا يُعاد بناء الشبكة تحت إصبعه.
  void _onBalance(dynamic p) {
    final d = _data;
    if (!mounted || d == null || p is! Map) return;
    final b = (p['balance'] as num?)?.toInt();
    if (b != null) setState(() => _data = d.copyWithBalance(b));
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final r = await ApiClient.instance.get('/api/chips/store');
      if (!mounted) return;
      if (r is Map && r['success'] == true) {
        final d = StoreData.fromJson(Map<String, dynamic>.from(r));
        setState(() {
          _data = d;
          _loading = false;
          // تبويبٌ لم يعد موجوداً بعد الجلب يقفز إلى أوّل المتاح
          final tabs = _tabsOf(d).map((t) => t.$1).toList();
          if (!tabs.contains(_tab)) _tab = tabs.isEmpty ? 'offers' : tabs.first;
        });
        return;
      }
      setState(() => _loading = false);
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// (مفتاح، نصّ، أيقونة، عدد) — بالترتيب المقفل، وكلٌّ يظهر بشرطه.
  List<(String, String, String, int)> _tabsOf(StoreData d) {
    final out = <(String, String, String, int)>[];
    if (d.offers.isNotEmpty) out.add(('offers', 'عروض', '🔥', d.offers.length));
    for (final k in StoreKind.all) {
      final n = d.ofKind(k.key).length;
      if (n > 0) out.add((k.key, k.label, k.icon, n));
    }
    if (d.mine.isNotEmpty) out.add(('mine', 'خزانتي', '🎭', d.mine.length));
    return out;
  }

  List<StoreItem> _itemsOf(StoreData d) => switch (_tab) {
        'offers' => d.offers,
        'mine' => d.mine,
        _ => d.ofKind(_tab),
      };

  // ══════════════════════════════════════════════════════
  // الأفعال
  // ══════════════════════════════════════════════════════
  Future<void> _open(StoreItem item) async {
    final d = _data;
    if (d == null) return;

    final action = await showItemSheet(
      context,
      item: item,
      balance: d.balance,
      equipped: d.cosmetics.isEquipped(item),
      busy: _busyItem == item.id,
      playerName: d.name,
    );
    if (action == null || !mounted) return;

    switch (action) {
      case ItemAction.rent:
        await _rent(item);
      case ItemAction.trial:
        await _trial(item);
      case ItemAction.equip:
        await _equip(item.kind, item.id);
      case ItemAction.unequip:
        await _equip(item.kind, null);
      case ItemAction.needChips:
        await showNeedChips(context,
            item: item, balance: d.balance, rates: d.earnRates);
    }
  }

  Future<void> _rent(StoreItem item) async {
    // «جدّد» و«استأجر» مسارٌ واحد عند الخادم — ما يفرّقهما هنا هو أنه
    // كان يملكه قبل الضغطة. يُلتقط الآن لأن `_load()` سيقلبه مملوكاً.
    final renewing = item.owned;
    setState(() => _busyItem = item.id);
    try {
      // 🔴 `requestId` ليس زينة: ضغطتان سريعتان على «استأجر» تعنيان خصمين
      //    لنفس العنصر. الخادم يُسقط الثانية بنفس المعرّف.
      final r = await ApiClient.instance.post('/api/chips/store/rent', body: {
        'itemId': item.id,
        'requestId': 'rent-${item.id}-${DateTime.now().microsecondsSinceEpoch}',
      });
      if (!mounted) return;
      if (r is Map && r['success'] == true) {
        await _load();
        if (!mounted) return;
        // المتبقّي بعد التجديد يأتي من الجلب الجديد — العنصر الممرَّر
        // التُقط قبل الطلب فمدّته قديمة.
        final fresh = _data?.items.where((i) => i.id == item.id).firstOrNull;
        await showPurchaseCelebration(context, item,
            renewed: renewing,
            remainingText: fresh?.daysLeftText,
            playerName: _data?.name ?? '');
        return;
      }
      _error(r is Map ? r['error'] as String? : null);
    } on ApiException catch (e) {
      // رسائل الخادم عربية ومكتوبة للاعب — تُعرض حرفياً
      _error(e.message);
    } catch (_) {
      _error(null);
    } finally {
      if (mounted) setState(() => _busyItem = null);
    }
  }

  Future<void> _trial(StoreItem item) async {
    setState(() => _busyItem = item.id);
    try {
      final r = await ApiClient.instance
          .post('/api/chips/store/trial', body: {'itemId': item.id});
      if (!mounted) return;
      if (r is Map && r['success'] == true) {
        await _load();
        return;
      }
      _error(r is Map ? r['error'] as String? : null);
    } on ApiException catch (e) {
      _error(e.message);
    } catch (_) {
      _error(null);
    } finally {
      if (mounted) setState(() => _busyItem = null);
    }
  }

  Future<void> _equip(String kind, int? itemId) async {
    try {
      final r = await ApiClient.instance.post('/api/chips/store/equip',
          body: {'kind': kind, 'itemId': itemId});
      if (!mounted) return;
      if (r is Map && r['success'] == true) {
        await _load();
        return;
      }
      _error(r is Map ? r['error'] as String? : null);
    } on ApiException catch (e) {
      _error(e.message);
    } catch (_) {
      _error(null);
    }
  }

  void _error(String? message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message ?? 'تعذّر إتمام العملية', style: ar(13))),
    );
  }

  // ══════════════════════════════════════════════════════
  // البناء
  // ══════════════════════════════════════════════════════
  @override
  Widget build(BuildContext context) {
    final d = _data;

    return PopsToHome(
      child: Scaffold(
        backgroundColor: const Color(0xFF050505),
        body: SafeArea(
          bottom: false,
          child: Column(children: [
            _header(d),
            if (d != null) _tabsBar(d),
            Expanded(
              child: _loading
                  ? const Center(
                      child: SizedBox(
                        width: 40,
                        height: 40,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Tw.amber500),
                      ),
                    )
                  : d == null
                      ? Center(
                          child: Text('تعذّر فتح الخزنة',
                              style: ar(14, color: Tw.gray500)))
                      : _body(d),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _header(StoreData? d) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: const BoxDecoration(
          color: Color(0xEB050505),
          border: Border(bottom: BorderSide(color: Color(0x26F59E0B))),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            InkWell(
              // إلى ما تحتها إن وُجد، وإلى الرئيسية إن فُتحت من إشعارٍ
              // على بدءٍ بارد فلا شيء تحتها
              onTap: () => popOrHome(context),
              child: Padding(
                padding: const EdgeInsets.all(4),
                child: Text('← رجوع', style: ar(12, color: Tw.gray500)),
              ),
            ),
            Text('🏦 خزنة الدون',
                style: const TextStyle(
                    fontFamily: 'Amiri',
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    color: Tw.amber400,
                    letterSpacing: 0)),
            InkWell(
              onTap: () => swapTo(Routes.wallet),
              borderRadius: BorderRadius.circular(999),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: const Color(0x24F59E0B),
                  border: Border.all(color: const Color(0x52F59E0B)),
                ),
                child: Text('🪙 ${d == null ? '—' : groupThousands(d.balance)}',
                    style: num_(13, color: Tw.amber400)),
              ),
            ),
          ],
        ),
      );

  Widget _tabsBar(StoreData d) {
    final tabs = _tabsOf(d);
    if (tabs.isEmpty) return const SizedBox.shrink();

    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        itemCount: tabs.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (_, i) {
          final (key, label, icon, count) = tabs[i];
          final on = _tab == key;
          return InkWell(
            onTap: () => setState(() => _tab = key),
            borderRadius: BorderRadius.circular(8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                color: on ? const Color(0x26F59E0B) : const Color(0x0DFFFFFF),
                border: Border.all(
                    color: on ? const Color(0x80F59E0B) : const Color(0x1AFFFFFF)),
              ),
              child: Row(children: [
                Text('$icon $label',
                    style: ar(11.5,
                        color: on ? const Color(0xFFFCD34D) : Tw.gray400,
                        weight: FontWeight.bold)),
                const SizedBox(width: 4),
                Opacity(
                  opacity: 0.5,
                  child: Text('$count',
                      style: num_(11.5,
                          color: on ? const Color(0xFFFCD34D) : Tw.gray400,
                          weight: FontWeight.bold)),
                ),
              ]),
            ),
          );
        },
      ),
    );
  }

  Widget _body(StoreData d) {
    final items = _itemsOf(d);
    final kind = StoreKind.all.where((k) => k.key == _tab).firstOrNull;
    // «عروض» و«خزانتي» مختلطة الأنواع ⇒ شبكة؛ والأنواع الزمنيّة صفوف.
    final asGrid = kind == null || kind.wearable;

    return RefreshIndicator(
      onRefresh: _load,
      color: Tw.amber500,
      backgroundColor: const Color(0xFF111111),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
        children: [
          _emptySlots(d),
          if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Center(
                  child: Text('لا يوجد شيء هنا بعد', style: ar(14, color: Tw.gray600))),
            )
          else if (asGrid)
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              // 🔴 عمودان **ثابتان** يعني بطاقةً بعرض ٣٦٠dp على تابلت،
              //    وبنسبة ارتفاعٍ ثابتة تصير ٤٦٠dp طولاً — بطاقةٌ واحدة
              //    تملأ الشاشة. المواصفة كُتبت لهاتف. العرض الأقصى يبقي
              //    البطاقة بحجمها على كل جهاز ويزيد الأعمدة وحدها.
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 200,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                mainAxisExtent: 150,
              ),
              itemCount: items.length,
              itemBuilder: (_, i) => StoreGridItem(
                playerName: d.name,
                item: items[i],
                equipped: d.cosmetics.isEquipped(items[i]),
                onTap: () => _open(items[i]),
              ),
            )
          else
            for (final it in items)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: StoreRowItem(
                    item: it, onTap: () => _open(it), playerName: d.name),
              ),
          if (d.closedVault.isNotEmpty)
            ClosedVault(items: d.closedVault, playerName: d.name),
        ],
      ),
    );
  }

  /// رقائق «الخانة فاضية» — تُظهر ما ينقص البطاقة وتنقل إلى تبويبه.
  Widget _emptySlots(StoreData d) {
    final empty = StoreKind.all
        .where((k) => k.wearable && d.cosmetics.forKind(k.key) == null)
        .toList();
    if (empty.isEmpty) return const SizedBox.shrink();

    const names = {'frame': 'إطارك', 'title': 'لقبك', 'name_fx': 'تأثير اسمك'};

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final k in empty)
            InkWell(
              onTap: () => setState(() => _tab = k.key),
              borderRadius: BorderRadius.circular(999),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: const Color(0x0FF59E0B),
                  border: Border.all(color: const Color(0x4DF59E0B)),
                ),
                child: Text(
                  d.cheapestOf(k.key) == null
                      ? '${names[k.key]} فاضي'
                      : '${names[k.key]} فاضي — من 🪙${d.cheapestOf(k.key)}',
                  style: ar(10,
                      color: const Color(0xE6FCD34D), weight: FontWeight.bold),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
