import 'dart:async';
import 'dart:math' show Random;

import 'package:flutter/material.dart';

import '../../app/router.dart';
import '../../app/theme/dimens.dart';
import '../../core/api/api_client.dart';
import '../../core/socket/socket_service.dart';
import '../../models/fnb.dart';
import '../profile/profile_palette.dart';
import 'option_picker.dart';
import 'order_widgets.dart';

// ══════════════════════════════════════════════════════
// 🍽️ اطلب من المكان — نقل بنية الويب كاملةً (2026-08-10)
// ══════════════════════════════════════════════════════
// البنية ثلاثيّة: **ثابتٌ · متمرّرٌ · ثابت** — مطابقة OrderPanel.tsx:
//   • تبويبان: «المنيو والعروض» و«طلباتي» — المهمّتان الحقيقيّتان.
//   • قائمةٌ واحدة متّصلة بكلّ الأقسام (العروض أوّلاً) وشريطُ شرائحَ يعمل
//     قفزاً لا تصفية: يضيء على القسم الظاهر أثناء التمرير وينقل إليه بنقرة.
//   • شريط سلّةٍ **كهرمانيّ نابض** يقول «لم يُرسَل بعد» — الأخضر لون «تمّ»
//     والسلّة لم تصل الكافيه. يفتح درجاً فيه التعديل والحذف والإرسال.
//   • 💨 خدمة الأرجيلة (فحم/تزبيط) في «طلباتي» — متعلّقةٌ بطلبٍ وصل.
//   • 🔁 مفتاح تكرار (clientKey): الردّ الضائع لا يصير طلباً ثانياً يُفوتَر.
// 📌 لا سوكِت: استطلاع كل ٣٠ ثانية في المقدّمة + إشعار FCM — قرارٌ قائم.

class OrderScreen extends StatefulWidget {
  const OrderScreen({super.key, this.embedded = false});

  /// ورقةً داخل شاشة اللعبة بدل صفحةٍ مستقلّة — الطلب لا يغادر الجولة.
  final bool embedded;

  @override
  State<OrderScreen> createState() => _OrderScreenState();
}

/// يعرض لوحة الطلب ورقةً منسدلة فوق شاشة اللعبة.
Future<void> showOrderSheet(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      // 🔴 الجذر لا الفرع: من داخل تبويبٍ في الغلاف كانت الورقة تعيش تحت
      //    شريط التنقّل فيحجب أسفلها (زرّ الإرسال وشريط السلّة)
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      barrierColor: const Color(0xCC000000),
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxWidth: 512,
        maxHeight: MediaQuery.sizeOf(context).height * 0.88,
      ),
      builder: (_) => const _OrderSheetShell(),
    );

class _OrderSheetShell extends StatelessWidget {
  const _OrderSheetShell();

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        child: DecoratedBox(
          decoration: const BoxDecoration(
            color: Color(0xFF050505),
            border: Border(top: BorderSide(color: Color(0x4010B981))),
          ),
          // الورقة بارتفاعٍ ثابت واللوحة تدير تمريرها الداخليّ — تمريرٌ خارجيّ
          // هنا كان سيُخفي شريط السلّة (نفس درس الويب)
          child: SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.88,
            child: const OrderScreen(embedded: true),
          ),
        ),
      );
}

/// قسمٌ في القائمة المتّصلة.
class _Section {
  const _Section({
    required this.key,
    required this.chip,
    required this.title,
    required this.isPkg,
    required this.items,
  });
  final String key, chip, title;
  final bool isPkg;
  final List<FnbMenuItem> items;
}

class _OrderScreenState extends State<OrderScreen>
    with WidgetsBindingObserver, SingleTickerProviderStateMixin {
  bool _loading = true;
  FnbContextResult _ctxResult = const FnbContextResult();
  List<FnbMenuItem> _menu = const [];
  List<FnbMyOrder> _orders = const [];

  FnbCart _cart = const FnbCart();
  final _noteCtrl = TextEditingController();
  final _searchCtrl = TextEditingController();

  int _tab = 0; // 0 = المنيو والعروض · 1 = طلباتي
  bool _sending = false;
  bool _sent = false;
  String _err = '';

  // 💨 خدمة الأرجيلة
  bool _svcAvailable = false;
  Map<String, dynamic>? _svcPending;
  bool _svcBusy = false;

  // 🔁 مفتاح التكرار — يتجدّد مع أيّ تغييرٍ في السلّة ويثبت عبر إعادة المحاولة
  String? _clientKey;

  // 🧭 القفز والرصد
  final _scroll = ScrollController();
  final _scrollAreaKey = GlobalKey();
  final _secKeys = <String, GlobalKey>{};
  final _chipKeys = <String, GlobalKey>{};
  String _activeSec = '';
  bool _jumping = false;
  Timer? _jumpTimer;
  bool _spyTick = false;

  // نبض شريط السلّة الكهرمانيّ
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  )..repeat(reverse: true);

  Timer? _poll;
  Timer? _toastTimer;

  FnbContext? get _ctx => _ctxResult.context;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _scroll.addListener(_onScrollSpy);
    // 💨 فور إغلاق الموظّف طلبَ الفحم يعود الزرّ فوراً — الخادم يبثّ
    //    fnb:service-done لغرفة player:{id}، وكنّا ننتظر دورة الاستطلاع (٣٠ ث)
    SocketService.instance.on('fnb:service-done', _onSvcDone);
    _boot();
  }

  void _onSvcDone(dynamic _) {
    if (!mounted) return;
    setState(() => _svcPending = null);
    _loadService();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    SocketService.instance.off('fnb:service-done', _onSvcDone);
    _poll?.cancel();
    _toastTimer?.cancel();
    _jumpTimer?.cancel();
    _pulse.dispose();
    _noteCtrl.dispose();
    _searchCtrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _loadOrders();
      _loadService();
      _startPolling();
    } else {
      _poll?.cancel();
    }
  }

  // ══════════════════════════════════════════════════════
  // الإقلاع والتحميل
  // ══════════════════════════════════════════════════════
  Future<void> _boot() async {
    try {
      final r = await ApiClient.instance.get('/api/fnb/context');
      if (!mounted) return;
      if (r is Map && r['success'] == true) {
        _ctxResult = FnbContextResult.fromJson(Map<String, dynamic>.from(r));
      }
    } catch (_) {}

    final c = _ctx;
    if (c == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }

    await Future.wait([_loadMenu(c.activityId), _loadOrders(), _loadService()]);
    if (!mounted) return;
    setState(() => _loading = false);
    _startPolling();
  }

  void _startPolling() {
    _poll?.cancel();
    if (_ctx == null) return;
    _poll = Timer.periodic(const Duration(seconds: 30), (_) {
      _loadOrders();
      _loadService();
    });
  }

  Future<void> _loadMenu(int activityId) async {
    try {
      final r = await ApiClient.instance
          .get('/api/fnb/menu', query: {'activityId': activityId});
      if (!mounted || r is! Map || r['success'] != true) return;
      setState(() {
        _menu = (r['items'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => FnbMenuItem.fromJson(Map<String, dynamic>.from(e)))
            .toList();
      });
    } catch (_) {}
  }

  Future<void> _loadOrders() async {
    final c = _ctx;
    if (c == null) return;
    try {
      final r = await ApiClient.instance
          .get('/api/fnb/my-orders', query: {'activityId': c.activityId});
      if (!mounted || r is! Map || r['success'] != true) return;
      setState(() {
        _orders = (r['orders'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => FnbMyOrder.fromJson(Map<String, dynamic>.from(e)))
            .toList();
      });
    } catch (_) {}
  }

  /// 💨 هل تُعرض بطاقة الخدمة، وهل ثمّة طلبٌ معلَّق؟
  Future<void> _loadService() async {
    if (_ctx == null) return;
    try {
      final r = await ApiClient.instance.get('/api/fnb/service/state');
      if (!mounted || r is! Map || r['success'] != true) return;
      setState(() {
        _svcAvailable = r['available'] == true;
        _svcPending =
            r['pending'] is Map ? Map<String, dynamic>.from(r['pending']) : null;
      });
    } catch (_) {}
  }

  // ══════════════════════════════════════════════════════
  // الأقسام والبحث
  // ══════════════════════════════════════════════════════
  List<_Section> get _sections {
    final out = <_Section>[];
    final packages = _menu.where((m) => m.isBundle).toList();
    if (packages.isNotEmpty) {
      out.add(_Section(
          key: '_pkg', chip: '🎁 العروض', title: '🎁 العروض',
          isPkg: true, items: packages));
    }
    final idx = <String, List<FnbMenuItem>>{};
    final order = <String>[];
    for (final m in _menu) {
      if (m.isBundle) continue;
      final k = '${m.category}|${m.subcategory}';
      if (!idx.containsKey(k)) {
        idx[k] = [];
        order.add(k);
      }
      idx[k]!.add(m);
    }
    for (final k in order) {
      final parts = k.split('|');
      final cat = parts[0], sub = parts.length > 1 ? parts[1] : '';
      out.add(_Section(
        key: k,
        chip: sub.isNotEmpty ? sub : (cat.isNotEmpty ? cat : kUncategorized),
        title: sub.isNotEmpty ? '$cat ← $sub' : (cat.isNotEmpty ? cat : kUncategorized),
        isPkg: false,
        items: idx[k]!,
      ));
    }
    return out;
  }

  /// 🎁 الأصناف التي تحويها باقة — لشارة «ضمن عرض».
  Set<int> get _inPackageIds {
    final ids = <int>{};
    for (final p in _menu.where((m) => m.isBundle)) {
      for (final s in p.slots) {
        if (s.isChoice) {
          ids.addAll(s.from.map((c) => c.menuItemId));
        } else if (s.menuItemId != null) {
          ids.add(s.menuItemId!);
        }
      }
    }
    return ids;
  }

  /// البحث يمسح المنيو كلّه — الاسم والوصف والقسم وقيم الخيارات
  /// (من يكتب «نخلة» يقصد صنفاً يحملها خياراً).
  List<FnbMenuItem> get _searchResults {
    final q = _searchCtrl.text.trim();
    if (q.isEmpty) return const [];
    return _menu
        .where((m) =>
            m.name.contains(q) ||
            m.description.contains(q) ||
            m.category.contains(q) ||
            m.subcategory.contains(q) ||
            m.optionGroups.any((g) => g.values.any((v) => v.name.contains(q))))
        .toList();
  }

  // ══════════════════════════════════════════════════════
  // 🧭 الرصد والقفز — مطابقة scroll-spy الويب
  // ══════════════════════════════════════════════════════
  void _onScrollSpy() {
    if (_spyTick || _jumping || _searchCtrl.text.trim().isNotEmpty || _tab != 0) {
      return;
    }
    _spyTick = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _spyTick = false;
      if (!mounted) return;
      final areaBox =
          _scrollAreaKey.currentContext?.findRenderObject() as RenderBox?;
      if (areaBox == null) return;
      final areaTop = areaBox.localToGlobal(Offset.zero).dy;
      String? cur;
      for (final sec in _sections) {
        final ctx = _secKeys[sec.key]?.currentContext;
        final box = ctx?.findRenderObject() as RenderBox?;
        if (box == null) continue;
        final dy = box.localToGlobal(Offset.zero).dy - areaTop;
        if (dy <= 28) cur = sec.key;
      }
      cur ??= _sections.isEmpty ? '' : _sections.first.key;
      if (cur != _activeSec) {
        setState(() => _activeSec = cur!);
        // الشريحة المضيئة تلاحق التمرير اليدويّ — تبقى مرئيّةً في شريطها
        final chipCtx = _chipKeys[cur]?.currentContext;
        if (chipCtx != null) {
          Scrollable.ensureVisible(chipCtx,
              duration: const Duration(milliseconds: 250),
              alignment: 0.5,
              curve: Curves.easeOut);
        }
      }
    });
  }

  void _jump(String key) {
    final ctx = _secKeys[key]?.currentContext;
    if (ctx == null) return;
    // 🔴 أثناء القفز يُكتم الرصد: تحديث الشريحة في منتصفه كان يقطع الانزلاق
    _jumping = true;
    _jumpTimer?.cancel();
    _jumpTimer = Timer(const Duration(milliseconds: 800), () => _jumping = false);
    setState(() => _activeSec = key);
    Scrollable.ensureVisible(ctx,
        duration: const Duration(milliseconds: 400),
        alignment: 0,
        curve: Curves.easeOutCubic);
  }

  // ══════════════════════════════════════════════════════
  // السلّة والأفعال
  // ══════════════════════════════════════════════════════
  void _mutateCart(FnbCart next) {
    _clientKey = null; // سلّةٌ تغيّرت = محاولةُ إرسالٍ جديدة
    setState(() => _cart = next);
  }

  Future<void> _addItem(FnbMenuItem it) async {
    if (it.isBundle) {
      final line = await showPackageSheet(context, it);
      if (line != null && mounted) _mutateCart(_cart.add(line));
      return;
    }
    if (it.optionGroups.isNotEmpty) {
      final line = await showOptionPicker(context, it);
      if (line != null && mounted) _mutateCart(_cart.add(line));
      return;
    }
    // 📖 وصفٌ طويل بلا خيارات: يُقرأ قبل أن يُشترى
    if (it.hasLongDescription) {
      final add = await showDetailSheet(context, it);
      if (add != true || !mounted) return;
    }
    _mutateCart(_cart.add(FnbCartLine(
      key: FnbCartLine.makeKey(it.id, const [], const []),
      itemId: it.id,
      name: it.name,
      quantity: 1,
      unitPrice: it.priceValue,
    )));
  }

  Future<void> _send() async {
    if (_cart.isEmpty || _ctx == null || _sending) return;
    setState(() {
      _sending = true;
      _err = '';
    });
    // 🔁 يثبت عبر إعادة المحاولة: الردّ الضائع ⇒ الخادم يعيد الطلب الأوّل
    _clientKey ??=
        'm${DateTime.now().millisecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF)}';
    try {
      final r = await ApiClient.instance.post('/api/fnb/orders', body: {
        'items': _cart.toPayload(),
        'note': _noteCtrl.text.trim(),
        'clientKey': _clientKey,
      });
      if (!mounted) return;
      if (r is Map && r['success'] == true) {
        _clientKey = null;
        setState(() {
          _cart = const FnbCart();
          _noteCtrl.clear();
          _sent = true;
          _tab = 1; // كما في الويب: بعد الإرسال يرى حالة طلبه
        });
        _toastTimer?.cancel();
        _toastTimer = Timer(const Duration(milliseconds: 2500),
            () => mounted ? setState(() => _sent = false) : null);
        await _loadOrders();
        return;
      }
      setState(() => _err =
          (r is Map ? r['error'] as String? : null) ?? 'فشل إرسال الطلب');
    } on ApiException catch (e) {
      if (mounted) setState(() => _err = e.message);
    } catch (_) {
      if (mounted) setState(() => _err = 'خطأ في الاتصال');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _cancel(FnbMyOrder o) async {
    try {
      final r = await ApiClient.instance.post('/api/fnb/orders/${o.id}/cancel');
      if (!mounted) return;
      if (r is Map && r['success'] == true) {
        await _loadOrders();
        return;
      }
      setState(() =>
          _err = (r is Map ? r['error'] as String? : null) ?? 'تعذّر الإلغاء');
    } on ApiException catch (e) {
      if (mounted) setState(() => _err = e.message);
    } catch (_) {
      if (mounted) setState(() => _err = 'تعذّر الإلغاء');
    }
  }

  /// 💨 طلب فحمٍ أو تزبيط — طلبٌ معلَّقٌ واحد، والخادم يفرضه أيضاً.
  Future<void> _askService(String kind) async {
    if (_svcBusy || _svcPending != null) return;
    setState(() => _svcBusy = true);
    try {
      final r = await ApiClient.instance
          .post('/api/fnb/service', body: {'kind': kind});
      if (!mounted) return;
      if (r is Map && r['success'] == true) {
        setState(() => _svcPending = r['request'] is Map
            ? Map<String, dynamic>.from(r['request'])
            : {'kind': kind});
      } else {
        setState(() => _err =
            (r is Map ? r['error'] as String? : null) ?? 'تعذّر إرسال الطلب');
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _err = e.message);
    } catch (_) {
      if (mounted) setState(() => _err = 'خطأ في الاتصال');
    } finally {
      if (mounted) setState(() => _svcBusy = false);
    }
  }

  // ══════════════════════════════════════════════════════
  // البناء
  // ══════════════════════════════════════════════════════
  @override
  Widget build(BuildContext context) {
    final body = _loading
        ? _loadingState(context)
        : _ctx == null
            ? _noContext()
            : _ready();

    if (widget.embedded) return body;

    return PopsToHome(
      child: Scaffold(
        backgroundColor: const Color(0xFF050505),
        resizeToAvoidBottomInset: true,
        body: SafeArea(bottom: false, child: body),
      ),
    );
  }

  Widget _loadingState(BuildContext context) => SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.6,
        child: const Center(
          child: SizedBox(
            width: 40,
            height: 40,
            child: CircularProgressIndicator(strokeWidth: 2, color: kEmerald),
          ),
        ),
      );

  Widget _noContext() => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 64, 20, 40),
          child: ContentConstraint(
            maxWidth: 512,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('🍽️', style: TextStyle(fontSize: 48)),
                const SizedBox(height: 16),
                Text('لا يوجد نشاط متاح للطلب الآن',
                    textAlign: TextAlign.center,
                    style: ar(18, weight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text(_ctxResult.reasonText,
                    textAlign: TextAlign.center,
                    style: ar(14, color: Tw.gray500, height: 1.6)),
                const SizedBox(height: 24),
                InkWell(
                  onTap: () => widget.embedded
                      ? Navigator.of(context).maybePop()
                      : popOrHome(context),
                  child: Padding(
                    padding: const EdgeInsets.all(4),
                    child: Text(widget.embedded ? 'إغلاق' : '← الرئيسيّة',
                        style: ar(14, color: kEmeraldText).copyWith(
                          decoration: TextDecoration.underline,
                          decorationColor: kEmeraldText,
                        )),
                  ),
                ),
              ],
            ),
          ),
        ),
      );

  /// ثابتٌ (ترويسة + تبويبات + بحث/شرائح) · متمرّرٌ (الجسم) · ثابت (شريط السلّة)
  Widget _ready() {
    final searching = _searchCtrl.text.trim().isNotEmpty;
    return Stack(children: [
      Column(children: [
        _header(),
        _tabs(),
        if (_tab == 0) _searchAndChips(searching),
        Expanded(
          child: KeyedSubtree(
            key: _scrollAreaKey,
            child: _tab == 0 ? _menuBody(searching) : _ordersBody(),
          ),
        ),
        _cartBar(),
      ]),
      if (_sent)
        const Positioned.fill(child: _ToastFade(child: OrderSentToast())),
    ]);
  }

  Widget _header() {
    final c = _ctx!;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      decoration: const BoxDecoration(
        color: Color(0xFF0A0F0D),
        border: Border(bottom: BorderSide(color: Color(0x12FFFFFF))),
      ),
      child: Row(children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            gradient: const LinearGradient(
              colors: [Color(0x4010B981), Color(0x0F10B981)],
            ),
            border: Border.all(color: const Color(0x4D10B981)),
          ),
          child: const Center(child: Text('🍽️', style: TextStyle(fontSize: 16))),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(c.locationName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ar(14, weight: FontWeight.bold)),
              Text(c.isLive ? '🎮 أنت داخل اللعبة' : '🎟️ حجزك مؤكّد للطلب',
                  style: ar(10, color: Tw.gray500)),
            ],
          ),
        ),
        if (widget.embedded)
          InkWell(
            onTap: () => Navigator.of(context).maybePop(),
            borderRadius: BorderRadius.circular(999),
            child: Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0x12FFFFFF),
                border: Border.all(color: const Color(0x1FFFFFFF)),
              ),
              child: Center(child: Text('✕', style: ar(12, color: Tw.gray400))),
            ),
          ),
      ]),
    );
  }

  Widget _tabs() {
    final badge = _orders.where((o) => o.status == 'new' || o.status == 'preparing').length;
    Widget tab(int i, String label, {int count = 0}) {
      final on = _tab == i;
      return Expanded(
        child: InkWell(
          onTap: () => setState(() => _tab = i),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(
                    width: 2,
                    color: on ? const Color(0xFF34D399) : Colors.transparent),
              ),
            ),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Text(label,
                  style: ar(11.5,
                      color: on ? const Color(0xFF34D399) : Tw.gray500,
                      weight: FontWeight.bold)),
              if (count > 0) ...[
                const SizedBox(width: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(999),
                    color: const Color(0xFF34D399),
                  ),
                  child: Text('$count',
                      style: const TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                          color: Colors.black)),
                ),
              ],
            ]),
          ),
        ),
      );
    }

    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF0A0F0D),
        border: Border(bottom: BorderSide(color: Color(0x12FFFFFF))),
      ),
      child: Row(children: [
        tab(0, '🍽️ المنيو والعروض'),
        tab(1, '🧾 طلباتي', count: badge),
      ]),
    );
  }

  Widget _searchAndChips(bool searching) {
    final secs = _sections;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
      color: const Color(0xFF050505),
      child: Column(children: [
        SizedBox(
          height: 40,
          child: TextField(
            controller: _searchCtrl,
            onChanged: (_) => setState(() {}),
            style: ar(13),
            cursorColor: kEmeraldText,
            decoration: InputDecoration(
              isDense: true,
              hintText: 'ابحث في المنيو…',
              hintStyle: ar(13, color: Tw.gray600),
              prefixIcon: const Padding(
                padding: EdgeInsets.only(top: 2),
                child: Text('🔎', textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13)),
              ),
              prefixIconConstraints:
                  const BoxConstraints(minWidth: 36, minHeight: 0),
              suffixIcon: searching
                  ? IconButton(
                      icon: const Icon(Icons.close, size: 16, color: Colors.grey),
                      onPressed: () {
                        _searchCtrl.clear();
                        setState(() {});
                      },
                    )
                  : null,
              filled: true,
              fillColor: const Color(0x0DFFFFFF),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0x17FFFFFF)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0x6610B981)),
              ),
            ),
          ),
        ),
        if (!searching && secs.length > 1) ...[
          const SizedBox(height: 8),
          // Row داخل تمريرٍ أفقيّ لا ListView كسول: الشريحة خارج نافذة العرض
          // كانت بلا عنصرٍ مبنيّ فلا يجد ensureVisible سياقها ولا يلاحقها
          SizedBox(
            height: 32,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                for (final s in secs)
                  Padding(
                    key: _chipKeys[s.key] ??= GlobalKey(),
                    padding: const EdgeInsets.only(left: 6),
                    child: _chip(s),
                  ),
              ]),
            ),
          ),
        ],
      ]),
    );
  }

  Widget _chip(_Section s) {
    final on = (_activeSec.isEmpty ? _sections.first.key : _activeSec) == s.key;
    return InkWell(
      onTap: () => _jump(s.key),
      borderRadius: BorderRadius.circular(9),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(9),
          color: on ? const Color(0x2610B981) : const Color(0x0AFFFFFF),
          border: Border.all(
              color: on ? const Color(0x4D10B981) : Colors.transparent),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Text(s.chip,
              style: ar(11,
                  color: on ? const Color(0xFF34D399) : Tw.gray400,
                  weight: FontWeight.bold)),
          const SizedBox(width: 4),
          Text('${s.items.length}',
              style: TextStyle(
                  fontSize: 9,
                  color: (on ? const Color(0xFF34D399) : Tw.gray400)
                      .withValues(alpha: 0.6))),
        ]),
      ),
    );
  }

  // ── جسم المنيو: قائمةٌ متّصلة أو نتائج البحث ──
  Widget _menuBody(bool searching) {
    if (_menu.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: const [EmptyMenuCard()],
      );
    }
    if (searching) {
      final results = _searchResults;
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          if (_err.isNotEmpty) ...[
            OrderErrorBanner(message: _err),
            const SizedBox(height: 10),
          ],
          if (results.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 48),
              child: Center(
                child: Text('لا صنف يطابق «${_searchCtrl.text.trim()}»',
                    style: ar(13, color: Tw.gray500)),
              ),
            )
          else
            for (final m in results) ...[
              _itemOrPkgRow(m),
              const SizedBox(height: 8),
            ],
        ],
      );
    }

    final secs = _sections;
    return SingleChildScrollView(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      child: ContentConstraint(
        maxWidth: 640,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_err.isNotEmpty) ...[
              OrderErrorBanner(message: _err),
              const SizedBox(height: 10),
            ],
            for (final sec in secs) ...[
              KeyedSubtree(
                key: _secKeys[sec.key] ??= GlobalKey(),
                child: Padding(
                  padding: const EdgeInsets.only(top: 8, bottom: 8),
                  child: Row(children: [
                    Text(sec.title,
                        style: ar(11,
                            color: const Color(0xBF34D399),
                            weight: FontWeight.bold)),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: SizedBox(
                          height: 1,
                          child: ColoredBox(color: Color(0x1F10B981))),
                    ),
                    const SizedBox(width: 8),
                    Text('${sec.items.length}',
                        style: ar(10, color: Tw.gray600)),
                  ]),
                ),
              ),
              for (final m in sec.items) ...[
                _itemOrPkgRow(m),
                const SizedBox(height: 8),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Widget _itemOrPkgRow(FnbMenuItem m) => m.isBundle
      ? PackageCard(
          item: m,
          qty: _cart.qtyOf(m.id),
          onTap: () => unawaited(_addItem(m)),
        )
      : MenuItemRow(
          item: m,
          qty: _cart.qtyOf(m.id),
          inPackage: _inPackageIds.contains(m.id),
          onAdd: () => unawaited(_addItem(m)),
        );

  // ── طلباتي + 💨 خدمة الأرجيلة ──
  Widget _ordersBody() => ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
        children: [
          if (_err.isNotEmpty) ...[
            OrderErrorBanner(message: _err),
            const SizedBox(height: 10),
          ],
          if (_svcAvailable) ...[
            ShishaServiceCard(
              pending: _svcPending != null,
              busy: _svcBusy,
              onAsk: (kind) => unawaited(_askService(kind)),
            ),
            const SizedBox(height: 12),
          ],
          if (_orders.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 48),
              child: Center(
                  child: Text('لا طلبات بعد', style: ar(13, color: Tw.gray500))),
            )
          else
            for (final o in _orders) ...[
              MyOrderCard(order: o, onCancel: () => _cancel(o)),
              const SizedBox(height: 8),
            ],
        ],
      );

  // ══════════════════════════════════════════════════════
  // 🟠 شريط السلّة الكهرمانيّ — «لم يُرسَل بعد» — يفتح الدرج
  // ══════════════════════════════════════════════════════
  Widget _cartBar() {
    if (_cart.isEmpty) return const SizedBox.shrink();
    final sysBottom = MediaQuery.viewPaddingOf(context).bottom;
    final safe = widget.embedded ? (sysBottom > 8 ? sysBottom : 8.0) : sysBottom;
    return InkWell(
      onTap: _openCartDrawer,
      child: Container(
        padding: EdgeInsets.fromLTRB(12, 10, 12, 10 + safe),
        decoration: const BoxDecoration(
          color: Color(0xF71C1305),
          border: Border(top: BorderSide(color: Color(0x80F59E0B))),
        ),
        child: Row(children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: const Color(0x2EF59E0B),
              border: Border.all(color: const Color(0x73F59E0B)),
            ),
            child: Center(child: ltrText('${_cart.count}', num_(14, color: const Color(0xFFFCD34D), weight: FontWeight.w900))),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(children: [
                  FadeTransition(
                    opacity: Tween(begin: 1.0, end: 0.25).animate(
                        CurvedAnimation(parent: _pulse, curve: Curves.easeInOut)),
                    child: Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: Color(0xFFF59E0B),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text.rich(
                      TextSpan(children: [
                        const TextSpan(text: 'لم يُرسَل بعد — '),
                        TextSpan(text: ltrRun(jod(_cart.total))),
                      ]),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ar(12.5,
                          color: const Color(0xFFFCD34D),
                          weight: FontWeight.w900),
                    ),
                  ),
                ]),
                Text('طلبك لم يصل الكافيه · اضغط للمراجعة والإرسال',
                    style: ar(9.5, color: const Color(0x8CFCD34D))),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              gradient: const LinearGradient(
                colors: [Color(0xFFF59E0B), Color(0xFFD97706)],
              ),
            ),
            child: Text('راجع وأرسل ←',
                style: ar(12, weight: FontWeight.bold)),
          ),
        ]),
      ),
    );
  }

  /// 🛒 درج السلّة: التعديل والحذف والملاحظة والإرسال — من أيّ موضعٍ بلا تمرير.
  Future<void> _openCartDrawer() => showModalBottomSheet<void>(
        context: context,
        useRootNavigator: true,   // فوق شريط تنقّل الغلاف — لا تحته
        backgroundColor: Colors.transparent,
        barrierColor: const Color(0xCC000000),
        isScrollControlled: true,
        constraints: BoxConstraints(
          maxWidth: 512,
          maxHeight: MediaQuery.sizeOf(context).height * 0.88,
        ),
        builder: (sheetCtx) {
          // 🔴 حارس الإغلاق الأحاديّ: إعادة بناء الدرج أثناء حركة خروجه (~200م‌ث)
          //    كانت تعيد جدولة pop فتُغلق **ورقة الطلب كلّها** خلف الدرج —
          //    اللاعب يُقذف خارج الشاشة فور إرساله ولا يرى التوست ولا طلباته
          var popped = false;
          void popDrawerOnce(BuildContext ctx) {
            if (popped) return;
            popped = true;
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (ctx.mounted && (ModalRoute.of(ctx)?.isCurrent ?? false)) {
                Navigator.of(ctx).pop();
              }
            });
          }

          return StatefulBuilder(
            builder: (ctx, setSheet) {
              void both(VoidCallback fn) {
                setState(fn);
                setSheet(() {});
              }

              // آخر سطرٍ حُذف — الدرج بلا موضوع (مرّةً واحدة، والحارس يتحقّق
              // أنّ الدرج ما يزال المسار الأعلى قبل الإغلاق)
              if (_cart.isEmpty) popDrawerOnce(ctx);

              return CartDrawer(
                cart: _cart,
                noteCtrl: _noteCtrl,
                sending: _sending,
                error: _err,
                onQty: (key, d) => both(() {
                  _clientKey = null;
                  _cart = _cart.changeQty(key, d);
                }),
                onRemove: (key) => both(() {
                  _clientKey = null;
                  _cart = FnbCart(
                      lines: _cart.lines.where((l) => l.key != key).toList());
                }),
                onSend: () async {
                  await _send();
                  if (!ctx.mounted) return;
                  if (_sent) {
                    // نجاح: إغلاقٌ واحدٌ محروس — ولا setSheet بعده
                    popDrawerOnce(ctx);
                    return;
                  }
                  // فشل: يبقى الدرج مفتوحاً ويُعاد بناؤه ليعرض لافتة الخطأ
                  setSheet(() {});
                },
              );
            },
          );
        },
      );
}

/// ظهورٌ بتلاشٍ وتكبير — 250ms دخولاً و200ms خروجاً.
class _ToastFade extends StatefulWidget {
  const _ToastFade({required this.child});
  final Widget child;

  @override
  State<_ToastFade> createState() => _ToastFadeState();
}

class _ToastFadeState extends State<_ToastFade>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 250),
    reverseDuration: const Duration(milliseconds: 200),
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
      child: ScaleTransition(
        scale: Tween(begin: 0.9, end: 1.0).animate(curve),
        child: widget.child,
      ),
    );
  }
}
