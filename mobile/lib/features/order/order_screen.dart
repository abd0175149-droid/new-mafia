import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/router.dart';
import '../../app/theme/dimens.dart';
import '../../core/api/api_client.dart';
import '../../models/fnb.dart';
import '../profile/profile_palette.dart';
import 'order_widgets.dart';

// ══════════════════════════════════════════════════════
// 🍽️ اطلب من المكان — الملفّ 17
// ══════════════════════════════════════════════════════
// 📌 لا واجهة فاتورة هنا إطلاقاً: إصدار فاتورة A6 وظيفة **جهاز المكان**
//    عبر `/api/venue/invoices/*`. اللاعب يرى إجمالي طلبه فقط.
// 📌 ولا سوكِت: لا توجد غرفة player-facing لحالة الطلب في الخادم.
//    التكافؤ = استطلاع كل ٣٠ ثانية في المقدّمة + إشعار FCM.

class OrderScreen extends StatefulWidget {
  const OrderScreen({super.key, this.embedded = false});

  /// ورقةً داخل شاشة اللعبة بدل صفحةٍ مستقلّة: بلا Scaffold ولا PopsToHome،
  /// و«الرئيسيّة» تصير «إغلاق». القرار: الطلب يتمّ **من داخل صفحة اللعبة**
  /// فلا يغادر اللاعب جولته الجارية.
  final bool embedded;

  @override
  State<OrderScreen> createState() => _OrderScreenState();
}

/// يعرض لوحة الطلب ورقةً منسدلة فوق شاشة اللعبة.
Future<void> showOrderSheet(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      useRootNavigator: false,
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
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF0B1310), Color(0xFF050505)],
          ),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          border: Border(top: BorderSide(color: Color(0x4010B981))),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 48,
            height: 6,
            margin: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: const Color(0x33FFFFFF),
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          const Flexible(child: OrderScreen(embedded: true)),
        ]),
      );
}

class _OrderScreenState extends State<OrderScreen> with WidgetsBindingObserver {
  bool _loading = true;
  FnbContextResult _ctxResult = const FnbContextResult();
  List<FnbMenuItem> _menu = const [];
  List<FnbMyOrder> _orders = const [];

  FnbCart _cart = const FnbCart();
  final _noteCtrl = TextEditingController();
  final _scroll = ScrollController();

  bool _sending = false;
  bool _sent = false;
  String _err = '';

  Timer? _poll;
  Timer? _toastTimer;

  FnbContext? get _ctx => _ctxResult.context;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _boot();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    _toastTimer?.cancel();
    _noteCtrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// الاستطلاع يتوقّف كلّياً خارج المقدّمة، والعودة تُحدِّث فوراً — يعوّض
  /// ما فات دورة الثلاثين ثانية.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _loadOrders();
      _startPolling();
    } else {
      _poll?.cancel();
    }
  }

  // ══════════════════════════════════════════════════════
  // الإقلاع
  // ══════════════════════════════════════════════════════
  Future<void> _boot() async {
    try {
      final r = await ApiClient.instance.get('/api/fnb/context');
      if (!mounted) return;
      if (r is Map && r['success'] == true) {
        _ctxResult = FnbContextResult.fromJson(Map<String, dynamic>.from(r));
      }
    } catch (_) {
      // تكافؤ: الويب يبتلع الخطأ ويُظهر الحالة المبوّبة بالنصّ الافتراضيّ
    }

    final c = _ctx;
    if (c == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }

    await Future.wait([_loadMenu(c.activityId), _loadOrders()]);
    if (!mounted) return;
    setState(() => _loading = false);
    _startPolling();
  }

  void _startPolling() {
    _poll?.cancel();
    if (_ctx == null) return;
    _poll = Timer.periodic(const Duration(seconds: 30), (_) => _loadOrders());
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
    } catch (_) {
      // فشل المنيو بعد سياقٍ ناجح ⇒ «المكان لم يضف أصنافاً بعد» — تكافؤ
    }
  }

  /// فشل تحديث الطلبات **صامت** — تكافؤ.
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

  // ══════════════════════════════════════════════════════
  // الأفعال
  // ══════════════════════════════════════════════════════
  void _setQty(int itemId, int qty) =>
      setState(() => _cart = _cart.setQty(itemId, qty));

  Future<void> _send() async {
    if (_cart.isEmpty || _ctx == null || _sending) return;
    setState(() {
      _sending = true;
      _err = '';
    });
    try {
      final r = await ApiClient.instance.post('/api/fnb/orders', body: {
        'items': _cart.toPayload(),
        'note': _noteCtrl.text.trim(),
      });
      if (!mounted) return;
      if (r is Map && r['success'] == true) {
        setState(() {
          _cart = const FnbCart();
          _noteCtrl.clear();
          _sent = true;
        });
        _toastTimer?.cancel();
        _toastTimer = Timer(const Duration(milliseconds: 2500),
            () => mounted ? setState(() => _sent = false) : null);
        await _loadOrders();
        return;
      }
      // رسائل الخادم عربية ومكتوبة للاعب — تُعرض حرفياً
      setState(() => _err = (r is Map ? r['error'] as String? : null) ??
          'فشل إرسال الطلب');
    } on ApiException catch (e) {
      if (mounted) setState(() => _err = e.message);
    } catch (_) {
      if (mounted) setState(() => _err = 'خطأ في الاتصال');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  /// بلا حوار تأكيد — تكافؤ مع الويب.
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

    // ورقةً: بلا Scaffold — الورقة نفسها هي السطح، وSafeArea السفليّ يخصّ الشاشة
    if (widget.embedded) return body;

    return PopsToHome(
      child: Scaffold(
        backgroundColor: const Color(0xFF050505),
        // الشريط يرتفع فوق الكيبورد — الويب لا يعالج هذا وفي التطبيق إلزاميّ
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

  // §4.2 — مبوّب خارجاً
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

  Widget _ready() {
    final expanded = context.sizeClass == WindowSizeClass.expanded;
    return Stack(children: [
      Positioned.fill(child: expanded ? _twoPane() : _singleColumn()),
      _cartBar(),
      if (_sent)
        const Positioned.fill(
          child: _ToastFade(child: OrderSentToast()),
        ),
    ]);
  }

  // compact/medium — عمود واحد
  Widget _singleColumn() {
    final wide = context.sizeClass != WindowSizeClass.compact;
    return SingleChildScrollView(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 128),
      child: ContentConstraint(
        maxWidth: wide ? 640 : 512,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            OrderHeaderCard(ctx: _ctx!),
            const SizedBox(height: 20),
            ..._ordersSection(),
            ..._menuSection(twoColumns: wide),
            if (_err.isNotEmpty) ...[
              const SizedBox(height: 20),
              OrderErrorBanner(message: _err),
            ],
          ],
        ),
      ),
    );
  }

  // expanded — لوح جانبيّ (ترويسة + طلباتي) ولوح منيو
  Widget _twoPane() => Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 960),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 320,
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 24, 8, 128),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      OrderHeaderCard(ctx: _ctx!),
                      const SizedBox(height: 20),
                      ..._ordersSection(),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  controller: _scroll,
                  padding: const EdgeInsets.fromLTRB(8, 24, 16, 128),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ..._menuSection(twoColumns: true),
                      if (_err.isNotEmpty) ...[
                        const SizedBox(height: 20),
                        OrderErrorBanner(message: _err),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      );

  List<Widget> _ordersSection() {
    if (_orders.isEmpty) return const [];
    return [
      Text('📋 طلباتي (${openOrdersCount(_orders)})',
          style: ar(14, weight: FontWeight.w600)),
      const SizedBox(height: 8),
      for (final o in _orders) ...[
        MyOrderCard(order: o, onCancel: () => _cancel(o)),
        const SizedBox(height: 8),
      ],
      const SizedBox(height: 12),
    ];
  }

  List<Widget> _menuSection({required bool twoColumns}) {
    if (_menu.isEmpty) return const [EmptyMenuCard()];

    final groups = groupByCategory(_menu);
    final out = <Widget>[];
    for (final e in groups.entries) {
      out.add(CategoryHeader(name: e.key));
      if (twoColumns) {
        // 🔴 لا `mainAxisExtent` ثابت: صنفٌ بوصفٍ يحتاج ارتفاعاً أكبر من
        //    صنفٍ بلا وصف، والارتفاع الثابت يقصّ سطر السعر — وهو أهمّ ما
        //    في الصفّ. صفوفٌ من اثنين داخل `IntrinsicHeight` تأخذ ارتفاع
        //    الأطول، فتتساوى البطاقتان ولا يفيض شيء.
        //    ⚠️ `stretch` وحده في سياقٍ بلا ارتفاعٍ محدَّد = فشل تخطيط
        //    صامت؛ `IntrinsicHeight` هو ما يجعله شرعياً.
        for (var i = 0; i < e.value.length; i += 2) {
          final second = i + 1 < e.value.length ? e.value[i + 1] : null;
          out.add(Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(child: _row(e.value[i])),
                  const SizedBox(width: 8),
                  Expanded(
                      child: second == null
                          ? const SizedBox.shrink()
                          : _row(second)),
                ],
              ),
            ),
          ));
        }
      } else {
        for (final m in e.value) {
          out.add(_row(m));
          out.add(const SizedBox(height: 8));
        }
      }
      out.add(const SizedBox(height: 12));
    }
    return out;
  }

  Widget _row(FnbMenuItem m) => MenuItemRow(
        item: m,
        qty: _cart.qtyOf(m.id),
        onQty: (q) => _setQty(m.id, q),
      );

  // ══════════════════════════════════════════════════════
  // §4.3.5 شريط السلّة العائم
  // ══════════════════════════════════════════════════════
  Widget _cartBar() {
    final insets = MediaQuery.viewInsetsOf(context).bottom;
    final safe = MediaQuery.viewPaddingOf(context).bottom;
    final total = _cart.totalFor(_menu);

    return AnimatedPositioned(
      duration: const Duration(milliseconds: 350),
      curve: Curves.easeOutBack,
      left: 16,
      right: 16,
      // فوق شريط التنقّل، وفوق الكيبورد حين يُفتح حقل الملاحظة
      bottom: _cart.isEmpty ? -160 : (insets > 0 ? insets + 12 : 80 + safe),
      child: ContentConstraint(
        maxWidth: context.sizeClass == WindowSizeClass.compact ? 512 : 640,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            color: const Color(0xF2061410),
            border: Border.all(color: const Color(0x6610B981)),
            boxShadow: const [
              BoxShadow(color: Color(0x99000000), blurRadius: 32, offset: Offset(0, 8)),
            ],
          ),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(
              controller: _noteCtrl,
              maxLength: kMaxNoteLength,
              style: ar(12),
              cursorColor: kEmeraldText,
              decoration: InputDecoration(
                counterText: '',
                isDense: true,
                hintText: 'ملاحظة للمكان (اختياريّ)…',
                hintStyle: ar(12, color: Tw.gray600),
                filled: true,
                fillColor: const Color(0x0DFFFFFF),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Color(0x1AFFFFFF)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Color(0x6610B981)),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(
                child: Opacity(
                  opacity: _sending ? 0.6 : 1,
                  child: InkWell(
                    onTap: _sending ? null : _send,
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        gradient: const LinearGradient(
                          begin: Alignment.topRight,
                          end: Alignment.bottomLeft,
                          colors: [kEmerald, Color(0xFF0D9488)],
                        ),
                      ),
                      child: Center(
                        child: _sending
                            ? Text('⏳ يُرسل…', style: ar(14, weight: FontWeight.bold))
                            : Text.rich(
                                TextSpan(children: [
                                  const TextSpan(text: 'إرسال الطلب • '),
                                  TextSpan(text: ltrRun(jod(total))),
                                ]),
                                style: ar(14, weight: FontWeight.bold),
                              ),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Column(mainAxisSize: MainAxisSize.min, children: [
                ltrText('${_cart.count}', num_(14)),
                Text('أصناف', style: ar(9, color: Tw.gray500)),
              ]),
            ]),
          ]),
        ),
      ),
    );
  }
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
