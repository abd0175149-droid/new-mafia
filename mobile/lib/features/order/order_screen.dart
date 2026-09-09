import 'dart:async';
import 'dart:math' show Random;

import 'package:flutter/material.dart';

import '../../app/router.dart';
import '../../core/api/api_client.dart';
import '../../core/location/location_service.dart';
import '../../core/socket/socket_service.dart';
import '../../models/fnb.dart';
import '../profile/profile_palette.dart';
import 'option_picker.dart';
import 'order_widgets.dart';

// ══════════════════════════════════════════════════════
// 🍽️ لوحة المنيو — تصميم «الرفّ» (2026-09-09، مرآة OrderPanel.tsx)
// ══════════════════════════════════════════════════════
// 🧭 رفٌّ عموديٌّ ثابت يميناً يحمل الأقسام كلّها (العروض أوّلاً)، وبلاطاتٌ
//    بعمودين للقسم المختار. أوّل صنفٍ على بعد ترويسةٍ واحدة — لا تبويبات
//    ولا شرائح لاصقة ولا بحثٍ دائم (البحث من أيقونة الترويسة).
// ⚙️ الصنف ذو الخيارات يتّسع في مكانه (يمتدّ على العمودين) بأزرار ≥ ٤٠ بكسل.
// 🎁 العرض يُركَّب بمُركِّبٍ متدرّج (option_picker.dart).
// 🧾 «طلباتي» + خدمة الأرجيلة ورقةٌ من أيقونة الترويسة بشارة العدد.
// 📖 وضعان: `order` (يحتاج سياقاً من الخادم) و`browse` (استعراضٌ للقراءة قبل
//    الحجز من النقطة العامّة) — عارضٌ واحد للسطوح الثلاثة.
// 🕒 بلا سياقٍ لكن بحجزٍ قادم (next): الرسالة الصحيحة + تصفّحٌ للقراءة.
// 🚫 لا سحبَ لإغلاق الأوراق (enableDrag=false): سحبةٌ عفويّة كانت تُغلق
//    اللوحة وتُضيّع السلّة — قرار المالك 2026-09-09.
// 📌 لا سوكِت للطلبات: استطلاع كل ٣٠ ثانية في المقدّمة + إشعار FCM.
// ══════════════════════════════════════════════════════

class OrderScreen extends StatefulWidget {
  const OrderScreen({
    super.key,
    this.embedded = false,
    this.onEmptyContext,
    this.mode = 'order',
    this.locationId,
    this.locationName,
  });

  /// ورقةً داخل شاشةٍ أخرى بدل صفحةٍ مستقلّة.
  final bool embedded;

  /// يُبلّغ المستدعي أن لا سياق طلبٍ **ولا حجزَ قادماً** — ليُخفي الزرّ.
  final VoidCallback? onEmptyContext;

  /// `order` | `browse`
  final String mode;
  final int? locationId;
  final String? locationName;

  @override
  State<OrderScreen> createState() => _OrderScreenState();
}

/// يعرض لوحة الطلب ورقةً منسدلة فوق شاشة اللعبة.
Future<void> showOrderSheet(BuildContext context, {VoidCallback? onEmptyContext}) =>
    showModalBottomSheet<void>(
      context: context,
      // 🔴 الجذر لا الفرع: من داخل تبويبٍ في الغلاف كانت الورقة تعيش تحت
      //    شريط التنقّل فيحجب أسفلها (زرّ الإرسال وشريط السلّة)
      useRootNavigator: true,
      enableDrag: false,
      backgroundColor: Colors.transparent,
      barrierColor: const Color(0xCC000000),
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxWidth: 512,
        maxHeight: MediaQuery.sizeOf(context).height * 0.88,
      ),
      builder: (_) => _OrderSheetShell(onEmptyContext: onEmptyContext),
    );

class _OrderSheetShell extends StatelessWidget {
  const _OrderSheetShell({this.onEmptyContext});
  final VoidCallback? onEmptyContext;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        child: DecoratedBox(
          decoration: const BoxDecoration(
            color: kPanelBg,
            border: Border(top: BorderSide(color: kGoldBorder)),
          ),
          child: SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.88,
            child: OrderScreen(embedded: true, onEmptyContext: onEmptyContext),
          ),
        ),
      );
}

class _OrderScreenState extends State<OrderScreen>
    with WidgetsBindingObserver, SingleTickerProviderStateMixin {
  bool _loading = true;
  FnbContextResult _ctxResult = const FnbContextResult();
  bool _readOnly = false;
  String _venue = '';
  List<FnbMenuItem> _menu = const [];
  List<FnbMyOrder> _orders = const [];

  FnbCart _cart = const FnbCart();
  final _noteCtrl = TextEditingController();
  final _searchCtrl = TextEditingController();
  final _searchFocus = FocusNode();
  bool _searchOn = false;

  String _cat = '';
  int? _expanded;
  Map<String, List<String>> _sel = {};

  bool _sending = false;
  String _err = '';
  ({String text, bool error})? _toast;

  // 💨 خدمة الأرجيلة
  bool _svcAvailable = false;
  Map<String, dynamic>? _svcPending;
  bool _svcBusy = false;

  // 🔁 مفتاح التكرار — يتجدّد مع أيّ تغييرٍ في السلّة ويثبت عبر إعادة المحاولة
  String? _clientKey;

  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  )..repeat(reverse: true);

  Timer? _poll;
  Timer? _toastTimer;
  final _mainScroll = ScrollController();

  bool get _browse => widget.mode == 'browse';
  bool get _ro => _browse || _readOnly;
  FnbContext? get _ctx => _ctxResult.context;
  FnbNext? get _next => _ctxResult.next;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (!_browse) SocketService.instance.on('fnb:service-done', _onSvcDone);
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
    if (!_browse) SocketService.instance.off('fnb:service-done', _onSvcDone);
    _poll?.cancel();
    _toastTimer?.cancel();
    _pulse.dispose();
    _noteCtrl.dispose();
    _searchCtrl.dispose();
    _searchFocus.dispose();
    _mainScroll.dispose();
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
    if (_browse) {
      _venue = widget.locationName ?? '';
      if (widget.locationId != null) await _loadPublicMenu(widget.locationId!);
      if (mounted) setState(() => _loading = false);
      return;
    }
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
    _venue = c.locationName;
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

  List<FnbMenuItem> _parseItems(dynamic r) => (r['items'] as List? ?? const [])
      .whereType<Map>()
      .map((e) => FnbMenuItem.fromJson(Map<String, dynamic>.from(e)))
      .toList();

  Future<void> _loadMenu(int activityId) async {
    try {
      final r = await ApiClient.instance.get('/api/fnb/menu', query: {'activityId': activityId});
      if (!mounted || r is! Map || r['success'] != true) return;
      setState(() => _menu = _parseItems(r));
    } catch (_) {}
  }

  /// النقطة العامّة بلا مصادقة — للاستعراض قبل الحجز وللقراءة قبل فتح النافذة.
  Future<void> _loadPublicMenu(int locationId) async {
    try {
      final r = await ApiClient.instance.get('/api/player-app/locations/$locationId/menu');
      if (!mounted || r is! Map || r['success'] != true) return;
      setState(() {
        _menu = _parseItems(r);
        final n = r['locationName'];
        if (n is String && n.isNotEmpty) _venue = n;
      });
    } catch (_) {}
  }

  Future<void> _loadOrders() async {
    final c = _ctx;
    if (c == null) return;
    try {
      final r = await ApiClient.instance.get('/api/fnb/my-orders', query: {'activityId': c.activityId});
      if (!mounted || r is! Map || r['success'] != true) return;
      setState(() {
        _orders = (r['orders'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => FnbMyOrder.fromJson(Map<String, dynamic>.from(e)))
            .toList();
      });
    } catch (_) {}
  }

  Future<void> _loadService() async {
    if (_ctx == null) return;
    try {
      final r = await ApiClient.instance.get('/api/fnb/service/state');
      if (!mounted || r is! Map || r['success'] != true) return;
      setState(() {
        _svcAvailable = r['available'] == true;
        _svcPending = r['pending'] is Map ? Map<String, dynamic>.from(r['pending']) : null;
      });
    } catch (_) {}
  }

  /// بلا سياق لكن بحجزٍ قادم: تصفّح منيو المكان للقراءة.
  Future<void> _browseNext() async {
    final n = _next;
    if (n == null) return;
    setState(() {
      _readOnly = true;
      _loading = true;
      _venue = n.locationName;
    });
    await _loadPublicMenu(n.locationId);
    if (mounted) setState(() => _loading = false);
  }

  // ══════════════════════════════════════════════════════
  // الأقسام والبحث
  // ══════════════════════════════════════════════════════
  List<ShelfSection> get _sections => buildShelfSections(_menu);

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
  // السلّة والأفعال
  // ══════════════════════════════════════════════════════
  void _flash(String text, {bool error = false}) {
    _toastTimer?.cancel();
    setState(() => _toast = (text: text, error: error));
    _toastTimer = Timer(const Duration(milliseconds: 2200), () {
      if (mounted) setState(() => _toast = null);
    });
  }

  void _mutateCart(FnbCart next) {
    _clientKey = null;
    setState(() => _cart = next);
  }

  void _addSimple(FnbMenuItem it) {
    _mutateCart(_cart.add(FnbCartLine(
      key: FnbCartLine.makeKey(it.id, const [], const []),
      itemId: it.id,
      name: it.name,
      quantity: 1,
      unitPrice: it.priceValue,
    )));
    _flash('أُضيف ${it.name} · ${it.priceText}');
  }

  Future<void> _addItem(FnbMenuItem it) async {
    if (it.isBundle) {
      final line = await showBundleWizard(context, it);
      if (line != null && mounted) {
        _mutateCart(_cart.add(line));
        _flash('أُضيف العرض · ${line.label}');
      }
      return;
    }
    if (it.optionGroups.isNotEmpty) {
      _expand(it);
      return;
    }
    if (it.hasLongDescription) {
      final add = await showDetailSheet(context, it);
      if (add != true || !mounted) return;
    }
    _addSimple(it);
  }

  /// ✅ «عادي» يُحدَّد مبدئيّاً في المجموعة الإلزاميّة الأحاديّة — النكهات لا تُمسّ.
  void _expand(FnbMenuItem it) {
    final init = <String, List<String>>{};
    for (final g in it.optionGroups) {
      if (g.isRequired && !g.isMulti) {
        final normal = g.values.where((v) => v.name == 'عادي' && v.priceDelta == 0);
        if (normal.isNotEmpty) init[g.key] = [normal.first.key];
      }
    }
    setState(() {
      _sel = init;
      _expanded = it.id;
    });
  }

  void _pick(FnbOptionGroup g, String vk) {
    setState(() {
      final cur = _sel[g.key] ?? const <String>[];
      List<String> next;
      if (!g.isMulti) {
        next = (cur.isNotEmpty && cur.first == vk && !g.isRequired) ? const [] : [vk];
      } else if (cur.contains(vk)) {
        next = cur.where((v) => v != vk).toList();
      } else {
        next = cur.length >= g.maxSelect ? cur : [...cur, vk];
      }
      _sel = {..._sel, g.key: next};
    });
  }

  void _confirmExpanded(FnbMenuItem it) {
    var delta = 0.0;
    final labels = <String>[];
    final options = <FnbSelection>[];
    for (final g in it.optionGroups) {
      for (final vk in (_sel[g.key] ?? const <String>[])) {
        final v = g.values.where((x) => x.key == vk);
        if (v.isEmpty) continue;
        delta += v.first.priceDelta;
        labels.add(v.first.name);
        options.add(FnbSelection(groupKey: g.key, valueKey: vk));
      }
    }
    final unit = it.priceValue + delta;
    _mutateCart(_cart.add(FnbCartLine(
      key: FnbCartLine.makeKey(it.id, options, const []),
      itemId: it.id,
      name: it.name,
      quantity: 1,
      unitPrice: unit,
      label: labels.join(' · '),
      options: options,
    )));
    setState(() {
      _expanded = null;
      _sel = {};
    });
    _flash('أُضيف ${it.name} ${labels.join(' · ')} · ${jod(unit)}');
  }

  Future<void> _send() async {
    if (_cart.isEmpty || _ctx == null || _sending) return;
    setState(() {
      _sending = true;
      _err = '';
    });
    _clientKey ??= 'm${DateTime.now().millisecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF)}';
    try {
      final fix = await LocationService.instance.fixForGate();
      final r = await ApiClient.instance.post('/api/fnb/orders', body: {
        if (fix != null) 'fix': fix,
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
        });
        await _loadOrders();
        if (!mounted) return;
        _flash('وصل طلبك للمكان');
        unawaited(_openOrders());
        return;
      }
      setState(() => _err = (r is Map ? r['error'] as String? : null) ?? 'فشل إرسال الطلب');
    } on ApiException catch (e) {
      if (mounted) setState(() => _err = e.message);
    } catch (_) {
      if (mounted) setState(() => _err = 'خطأ في الاتصال — لم يُرسَل الطلب، أعد المحاولة');
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
      _flash((r is Map ? r['error'] as String? : null) ?? 'تعذّر الإلغاء', error: true);
    } on ApiException catch (e) {
      if (mounted) _flash(e.message, error: true);
    } catch (_) {
      if (mounted) _flash('تعذّر الإلغاء', error: true);
    }
  }

  Future<void> _askService(String kind) async {
    if (_svcBusy || _svcPending != null) return;
    setState(() => _svcBusy = true);
    try {
      final fix = await LocationService.instance.fixForGate();
      final r = await ApiClient.instance.post('/api/fnb/service', body: {'kind': kind, if (fix != null) 'fix': fix});
      if (!mounted) return;
      if (r is Map && r['success'] == true) {
        setState(() => _svcPending = r['request'] is Map ? Map<String, dynamic>.from(r['request']) : {'kind': kind});
      } else {
        _flash((r is Map ? r['error'] as String? : null) ?? 'تعذّر إرسال الطلب', error: true);
      }
    } on ApiException catch (e) {
      if (mounted) _flash(e.message, error: true);
    } catch (_) {
      if (mounted) _flash('خطأ في الاتصال', error: true);
    } finally {
      if (mounted) setState(() => _svcBusy = false);
    }
  }

  int get _openBadge => _orders.where((o) => o.status == 'new' || o.status == 'preparing').length;

  // ══════════════════════════════════════════════════════
  // البناء
  // ══════════════════════════════════════════════════════
  @override
  Widget build(BuildContext context) {
    // 🔴 يُبلَّغ **بعد** انتهاء الإطار: نداءٌ يغيّر حالة الأب أثناء بنائه يرمي
    //    «setState during build». يُبلَّغ فقط حين لا سياق ولا حجزَ قادماً.
    if (!_loading && !_browse && _ctx == null && _next == null && widget.onEmptyContext != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) widget.onEmptyContext!();
      });
    }

    final body = _loading ? _loadingState() : _panel();
    if (widget.embedded) return body;

    return PopsToHome(
      child: Scaffold(
        backgroundColor: kPanelBg,
        resizeToAvoidBottomInset: true,
        body: SafeArea(bottom: false, child: body),
      ),
    );
  }

  Widget _loadingState() => const Center(
        child: SizedBox(
          width: 36,
          height: 36,
          child: CircularProgressIndicator(strokeWidth: 2, color: kGoldSolid),
        ),
      );

  Widget _panel() {
    final noCtx = !_browse && _ctx == null && !_readOnly;
    return Stack(children: [
      Column(children: [
        _header(),
        Expanded(
          child: noCtx
              ? _noContext()
              : _menu.isEmpty
                  ? const Padding(padding: EdgeInsets.all(16), child: EmptyMenuCard())
                  : _shelf(),
        ),
        if (!_ro) _cartBar(),
      ]),
      if (_toast != null)
        Positioned(
          left: 16,
          right: 16,
          bottom: _cart.isEmpty ? 20 : 84,
          child: _ToastFade(child: OrderToast(text: _toast!.text, error: _toast!.error)),
        ),
    ]);
  }

  String get _subline {
    if (_browse) return 'للاطّلاع — يفتح الطلب قبل الموعد بساعة ويحتاج حجزاً';
    if (_readOnly && _next != null) return 'للقراءة — يفتح الطلب الساعة ${_next!.opensAt}';
    final c = _ctx;
    if (c == null) return 'الطلب من المكان';
    return c.isLive ? 'أنت داخل اللعبة — الطلب يصل طاولتك' : 'حجزك مؤكّد — الطلب متاح';
  }

  Widget _header() => Container(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
        decoration: const BoxDecoration(
          color: kHeaderBg,
          border: Border(bottom: BorderSide(color: Color(0x12FFFFFF))),
        ),
        child: Row(children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: kGoldBg,
              border: Border.all(color: kGoldBorder),
            ),
            child: const Icon(Icons.restaurant_outlined, size: 19, color: kGoldFg),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_venue.isEmpty ? 'المنيو' : _venue,
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: ar(14.5, weight: FontWeight.bold)),
                Text(_subline, maxLines: 1, overflow: TextOverflow.ellipsis, style: ar(10.5, color: Tw.gray500)),
              ],
            ),
          ),
          if (_menu.isNotEmpty) ...[
            const SizedBox(width: 6),
            HeaderIconButton(
              icon: Icons.search,
              active: _searchOn,
              tooltip: 'بحث',
              onTap: () {
                setState(() {
                  _searchOn = !_searchOn;
                  _searchCtrl.clear();
                });
                if (_searchOn) {
                  Future.delayed(const Duration(milliseconds: 60), () {
                    if (mounted) _searchFocus.requestFocus();
                  });
                }
              },
            ),
          ],
          if (!_ro && _ctx != null) ...[
            const SizedBox(width: 6),
            HeaderIconButton(
              icon: Icons.receipt_long_outlined,
              badge: _openBadge,
              tooltip: 'طلباتي',
              onTap: () => unawaited(_openOrders()),
            ),
          ],
          if (widget.embedded) ...[
            const SizedBox(width: 6),
            HeaderIconButton(
              icon: Icons.close,
              tooltip: 'إغلاق',
              onTap: () => Navigator.of(context).maybePop(),
            ),
          ],
        ]),
      );

  Widget _noContext() {
    final n = _next;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 32, 24, 32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(shape: BoxShape.circle, color: kGoldBg, border: Border.all(color: kGoldBorder)),
            child: const Icon(Icons.restaurant_outlined, color: kGoldFg, size: 24),
          ),
          const SizedBox(height: 12),
          Text(n != null ? 'يفتح الطلب الساعة ${n.opensAt}' : 'لا يوجد نشاط متاح للطلب الآن',
              textAlign: TextAlign.center, style: ar(15, weight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(_ctxResult.reasonText, textAlign: TextAlign.center, style: ar(12.5, color: Tw.gray400, height: 1.6)),
          if (n != null) ...[
            const SizedBox(height: 16),
            InkWell(
              onTap: () => unawaited(_browseNext()),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: const Color(0x0FFFFFFF),
                  border: Border.all(color: const Color(0x1FFFFFFF)),
                ),
                child: Text('تصفّح منيو ${n.locationName} للقراءة', style: ar(12.5, weight: FontWeight.bold)),
              ),
            ),
          ],
          const SizedBox(height: 12),
          InkWell(
            onTap: () => widget.embedded ? Navigator.of(context).maybePop() : popOrHome(context),
            child: Padding(
              padding: const EdgeInsets.all(4),
              child: Text(widget.embedded ? 'إغلاق' : '← الرئيسيّة',
                  style: ar(12.5, color: kGoldFg).copyWith(
                    decoration: TextDecoration.underline,
                    decorationColor: kGoldFg,
                  )),
            ),
          ),
        ]),
      ),
    );
  }

  /// الرفّ يميناً + بلاطات القسم المختار (أو نتائج البحث بلا رفّ).
  Widget _shelf() {
    final secs = _sections;
    final activeKey = secs.any((s) => s.key == _cat) ? _cat : (secs.isEmpty ? '' : secs.first.key);
    final active = secs.where((s) => s.key == activeKey).firstOrNull;

    return Row(children: [
      if (!_searchOn)
        ShelfRail(
          sections: secs,
          activeKey: activeKey,
          onSelect: (k) {
            setState(() {
              _cat = k;
              _expanded = null;
            });
            if (_mainScroll.hasClients) _mainScroll.jumpTo(0);
          },
        ),
      Expanded(
        child: ListView(
          controller: _mainScroll,
          // 🚫 لا ارتداد ولا سحبٌ للتحديث: السحب لأسفل لا أثر له
          physics: const ClampingScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(10, 10, 10, 24),
          children: [
            if (_searchOn) _searchField(),
            if (_err.isNotEmpty) ...[
              OrderErrorBanner(message: _err),
              const SizedBox(height: 8),
            ],
            if (_searchOn)
              ..._searchBody()
            else if (active != null)
              ...(active.isPkg ? _pkgBody(active) : _tilesBody(active)),
          ],
        ),
      ),
    ]);
  }

  Widget _searchField() => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextField(
          controller: _searchCtrl,
          focusNode: _searchFocus,
          onChanged: (_) => setState(() {}),
          style: ar(14),
          cursorColor: kAmberFg,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            isDense: true,
            hintText: 'ابحث: نكهة، صنف، قسم…',
            hintStyle: ar(13, color: Tw.gray600),
            suffixIcon: _searchCtrl.text.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.close, size: 16, color: Colors.grey),
                    onPressed: () => setState(_searchCtrl.clear),
                  )
                : null,
            filled: true,
            fillColor: const Color(0x0DFFFFFF),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0x1AFFFFFF)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: kAmberBorder),
            ),
          ),
        ),
      );

  List<Widget> _searchBody() {
    final q = _searchCtrl.text.trim();
    if (q.isEmpty) {
      return [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 40),
          child: Center(
            child: Text('جرّب اسم نكهةٍ: «نخلة» يعيد الأرجيلة الفاخرة وعروضها',
                textAlign: TextAlign.center, style: ar(12, color: Tw.gray500)),
          ),
        ),
      ];
    }
    final res = _searchResults;
    if (res.isEmpty) {
      return [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 40),
          child: Center(
            child: Column(children: [
              Text('لا صنف يطابق «$q»', style: ar(13, color: Tw.gray500)),
              const SizedBox(height: 8),
              InkWell(
                onTap: () => setState(_searchCtrl.clear),
                child: Text('امسح البحث', style: ar(12, color: kGoldFg).copyWith(decoration: TextDecoration.underline, decorationColor: kGoldFg)),
              ),
            ]),
          ),
        ),
      ];
    }
    return [
      for (final p in res.where((m) => m.isBundle)) ...[
        PackageCard(item: p, qty: _cart.qtyOf(p.id), readOnly: _ro, onTap: () => unawaited(_addItem(p))),
        const SizedBox(height: 8),
      ],
      _grid(res.where((m) => !m.isBundle).toList()),
    ];
  }

  List<Widget> _pkgBody(ShelfSection sec) => [
        for (final p in sec.items) ...[
          PackageCard(item: p, qty: _cart.qtyOf(p.id), readOnly: _ro, onTap: () => unawaited(_addItem(p))),
          const SizedBox(height: 8),
        ],
        Center(
          child: Text('اختياراتك لا تغيّر السعر — إلّا ما عليه زيادةٌ معلَنة',
              style: ar(10, color: Tw.gray600)),
        ),
      ];

  List<Widget> _tilesBody(ShelfSection sec) => [
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(children: [
            Text(sec.title, style: ar(10.5, color: const Color(0xCCC5A059), weight: FontWeight.bold)),
            const SizedBox(width: 8),
            const Expanded(child: SizedBox(height: 1, child: ColoredBox(color: Color(0x2EC5A059)))),
            const SizedBox(width: 8),
            Text(arDigits(sec.items.length), style: ar(10, color: Tw.gray600)),
          ]),
        ),
        _grid(sec.items),
      ];

  /// شبكةٌ بعمودين؛ البلاطة المفتوحة تمتدّ على العمودين.
  Widget _grid(List<FnbMenuItem> items) {
    final inPkg = _inPackageIds;
    final rows = <Widget>[];
    var i = 0;
    while (i < items.length) {
      final a = items[i];
      if (_expanded == a.id) {
        rows.add(_tile(a, inPkg));
        i += 1;
        continue;
      }
      final b = i + 1 < items.length ? items[i + 1] : null;
      if (b != null && _expanded == b.id) {
        rows.add(Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Expanded(child: _tile(a, inPkg)),
          const SizedBox(width: 8),
          const Expanded(child: SizedBox.shrink()),
        ]));
        i += 1;
        continue;
      }
      rows.add(IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Expanded(child: _tile(a, inPkg)),
          const SizedBox(width: 8),
          Expanded(child: b == null ? const SizedBox.shrink() : _tile(b, inPkg)),
        ]),
      ));
      i += 2;
    }
    return Column(children: [
      for (final r in rows) ...[r, const SizedBox(height: 8)],
    ]);
  }

  Widget _tile(FnbMenuItem it, Set<int> inPkg) => MenuItemRow(
        item: it,
        qty: _cart.qtyOf(it.id),
        inPackage: inPkg.contains(it.id),
        readOnly: _ro,
        expanded: _expanded == it.id,
        selection: _sel,
        onAdd: () => unawaited(_addItem(it)),
        onPick: _pick,
        onConfirm: () => _confirmExpanded(it),
        onCollapse: () => setState(() {
          _expanded = null;
          _sel = {};
        }),
        onQty: (d) => _mutateCart(_cart.changeQty(FnbCartLine.makeKey(it.id, const [], const []), d)),
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
              color: kAmberBg,
              border: Border.all(color: kAmberBorder),
            ),
            child: Center(child: ltrText('${_cart.count}', num_(14, color: kAmberFg))),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(children: [
                  FadeTransition(
                    opacity: Tween(begin: 1.0, end: 0.25).animate(CurvedAnimation(parent: _pulse, curve: Curves.easeInOut)),
                    child: Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFFF59E0B)),
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
                      style: ar(12.5, color: kAmberFg, weight: FontWeight.w900),
                    ),
                  ),
                ]),
                Text('طلبك لم يصل الكافيه · اضغط للمراجعة والإرسال', style: ar(9.5, color: const Color(0x8CFCD34D))),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), gradient: kAmberGradient),
            child: Text('راجع وأرسل', style: ar(12, weight: FontWeight.bold)),
          ),
        ]),
      ),
    );
  }

  Future<T?> _modal<T>(Widget Function(BuildContext) builder) => showModalBottomSheet<T>(
        context: context,
        useRootNavigator: true,
        enableDrag: false,
        backgroundColor: Colors.transparent,
        barrierColor: const Color(0xCC000000),
        isScrollControlled: true,
        constraints: BoxConstraints(maxWidth: 512, maxHeight: MediaQuery.sizeOf(context).height * 0.88),
        builder: builder,
      );

  /// 🧾 طلباتي + خدمة الأرجيلة — ورقةٌ من أيقونة الترويسة.
  Future<void> _openOrders() => _modal<void>((sheetCtx) => StatefulBuilder(
        builder: (ctx, setSheet) => OrderSheetShell(
          title: 'طلباتي',
          subtitle: _openBadge > 0 ? '${arDigits(_openBadge)} قيد المتابعة' : 'كلّ ما طلبته في هذه الفعاليّة',
          body: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (_svcAvailable) ...[
              ShishaServiceCard(
                pending: _svcPending != null,
                busy: _svcBusy,
                onAsk: (kind) async {
                  await _askService(kind);
                  if (ctx.mounted) setSheet(() {});
                },
              ),
              const SizedBox(height: 12),
            ],
            if (_orders.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 40),
                child: Center(child: Text('لا طلبات بعد', style: ar(13, color: Tw.gray500))),
              )
            else
              for (final o in _orders) ...[
                MyOrderCard(
                  order: o,
                  onCancel: () async {
                    await _cancel(o);
                    if (ctx.mounted) setSheet(() {});
                  },
                ),
                const SizedBox(height: 8),
              ],
          ]),
        ),
      ));

  /// 🛒 درج السلّة: التعديل والحذف والملاحظة والإرسال — من أيّ موضعٍ بلا تمرير.
  Future<void> _openCartDrawer() => _modal<void>((sheetCtx) {
        // 🔴 حارس الإغلاق الأحاديّ: إعادة بناء الدرج أثناء حركة خروجه كانت
        //    تعيد جدولة pop فتُغلق **ورقة الطلب كلّها** خلف الدرج
        var popped = false;
        void popDrawerOnce(BuildContext ctx) {
          if (popped) return;
          popped = true;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (ctx.mounted && (ModalRoute.of(ctx)?.isCurrent ?? false)) Navigator.of(ctx).pop();
          });
        }

        return StatefulBuilder(
          builder: (ctx, setSheet) {
            void both(VoidCallback fn) {
              setState(fn);
              setSheet(() {});
            }

            if (_cart.isEmpty) popDrawerOnce(ctx);

            return OrderSheetShell(
              title: 'سلّتك',
              subtitle: 'لم تُرسَل بعد — ${arDigits(_cart.count)} أصناف · ${jod(_cart.total)}',
              subtitleWarn: true,
              body: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (_err.isNotEmpty) ...[
                  OrderErrorBanner(message: _err),
                  const SizedBox(height: 10),
                ],
                for (final l in _cart.lines) ...[
                  CartLineRow(
                    line: l,
                    onQty: (d) => both(() {
                      _clientKey = null;
                      _cart = _cart.changeQty(l.key, d);
                    }),
                    onRemove: () => both(() {
                      _clientKey = null;
                      _cart = FnbCart(lines: _cart.lines.where((x) => x.key != l.key).toList());
                    }),
                  ),
                  const SizedBox(height: 8),
                ],
                const SizedBox(height: 4),
                TextField(
                  controller: _noteCtrl,
                  maxLength: kMaxNoteLength,
                  style: ar(14),
                  cursorColor: kAmberFg,
                  textInputAction: TextInputAction.done,
                  decoration: InputDecoration(
                    counterText: '',
                    isDense: true,
                    hintText: 'ملاحظة للمكان (اختياريّ)',
                    hintStyle: ar(13, color: Tw.gray600),
                    filled: true,
                    fillColor: const Color(0x0DFFFFFF),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0x1AFFFFFF)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: kAmberBorder),
                    ),
                  ),
                ),
              ]),
              footer: Row(children: [
                Expanded(
                  child: Opacity(
                    opacity: _sending ? 0.5 : 1,
                    child: InkWell(
                      onTap: _sending
                          ? null
                          : () async {
                              await _send();
                              if (!ctx.mounted) return;
                              if (_cart.isEmpty) {
                                popDrawerOnce(ctx);
                                return;
                              }
                              setSheet(() {});
                            },
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), gradient: kAmberGradient),
                        child: Center(
                          child: _sending
                              ? Text('جارٍ الإرسال…', style: ar(13.5, weight: FontWeight.bold))
                              : Text.rich(
                                  TextSpan(children: [
                                    const TextSpan(text: 'إرسال الطلب · '),
                                    TextSpan(text: ltrRun(jod(_cart.total))),
                                  ]),
                                  style: ar(13.5, weight: FontWeight.bold),
                                ),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                InkWell(
                  onTap: () => Navigator.of(ctx).pop(),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      color: const Color(0x0DFFFFFF),
                      border: Border.all(color: const Color(0x1AFFFFFF)),
                    ),
                    child: Text('متابعة', style: ar(13.5, color: Tw.gray400)),
                  ),
                ),
              ]),
            );
          },
        );
      });
}

/// ظهورٌ بتلاشٍ وتكبير — 250ms دخولاً.
class _ToastFade extends StatefulWidget {
  const _ToastFade({required this.child});
  final Widget child;

  @override
  State<_ToastFade> createState() => _ToastFadeState();
}

class _ToastFadeState extends State<_ToastFade> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 250),
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
      child: SlideTransition(
        position: Tween(begin: const Offset(0, 0.15), end: Offset.zero).animate(curve),
        child: widget.child,
      ),
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
