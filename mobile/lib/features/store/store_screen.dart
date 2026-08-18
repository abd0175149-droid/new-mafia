import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/router.dart';
import '../../core/api/api_client.dart';
import '../../core/api/game_config_service.dart';
import '../../core/cosmetics/cosmetics_service.dart';
import '../../core/socket/socket_service.dart';
import '../../core/storage/session_store.dart';
import '../../models/store.dart';
import '../../models/wallet.dart' show groupThousands;
import '../cosmetics/card_fx_layer.dart';
import '../cosmetics/mafia_card_view.dart';
import '../profile/profile_palette.dart';
import 'item_sheet.dart';
import 'mirror_stage.dart';
import 'sting_preview.dart';
import 'store_widgets.dart';

// ══════════════════════════════════════════════════════
// 🏦 خزنة الدون — الملفّ 33
// ══════════════════════════════════════════════════════
// 📐 المبدأ الحاكم: **المرآة**. المتجر يبيع مظهراً، والمظهر لا يُوصف بل
//    يُرى — فالمنتَج ليس القائمة بل البطاقة. لذلك:
//      • البطاقة مثبَّتة أعلى الشاشة دائماً.
//      • **اللمس هو التجربة** — لا زرّ «جرّب» إطلاقاً.
//      • زرّ أساسيّ واحد في المرآة: الشراء. ولا أزرار على بطاقات العناصر.
//      • كل معاينة تحاكي موضع العنصر في الواقع.

/// ما يُلبَس على البطاقة — يُعاين على المرآة فوراً، ويُعرض في شبكة.
const _wearable = {'frame', 'title', 'name_fx'};

/// ما يُعرَض أو يُسمَع — معاينته زمنيّة، فيُعرض في صفوف.
const _temporal = {'entrance', 'elimination', 'victory_sting'};

class StoreScreen extends StatefulWidget {
  const StoreScreen({super.key});

  @override
  State<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends State<StoreScreen> with WidgetsBindingObserver {
  StoreData? _data;
  bool _loading = true;
  bool _loadError = false;
  String _tab = 'offers';
  int? _busyItem;

  /// العنصر المُعايَن على المرآة — اللمس هو التجربة، فلا زرّ لها.
  StoreItem? _tryOn;

  /// معاينة زمنيّة جارية فوق المرآة (تشريفة · إقصاء · نغمة).
  StoreItem? _stage;
  Timer? _stageTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    // قالب البطاقة وتأثيرات الرتب — بدونها ترسم المرآة بطاقةً غير التي
    // تظهر على شاشة القاعة
    GameConfigService.instance
        .ensureLoaded()
        .then((_) => mounted ? setState(() {}) : null);
    SocketService.instance.on('chips:balance-updated', _onBalance);
  }

  @override
  void dispose() {
    SocketService.instance.off('chips:balance-updated', _onBalance);
    _stageTimer?.cancel();
    // 🔴 صوتٌ يستمرّ بعد مغادرة الشاشة عيبٌ يلاحَظ فوراً ويصعب تفسيره.
    unawaited(StingPreview.instance.stop());
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// 🔴 مغادرة التطبيق توقف المعاينة: صوتٌ يتابع العزف والمستخدم في
  ///    تطبيقٍ آخر — أو وضع الهاتف في جيبه — عيبٌ صارخ. و`inactive` لا
  ///    تكفي سبباً (تقع عند سحب مركز التحكّم) فيُعتمد `paused` وحدها.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      unawaited(StingPreview.instance.stop());
      _stageTimer?.cancel();
      if (mounted) setState(() => _stage = null);
    }
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
        // المتجر جلب المظهر ضمن استجابته — يُمرَّر للمزوّد فتبقى بطاقة
        // الملفّ الشخصيّ متّسقة بلا نداءٍ ثانٍ.
        CosmeticsService.instance.adopt(d.cosmetics, d.rankTier);
        setState(() {
          _data = d;
          _loading = false;
          _loadError = false;
          final tabs = _tabsOf(d).map((t) => t.$1).toList();
          if (!tabs.contains(_tab)) _tab = tabs.isEmpty ? 'offers' : tabs.first;
        });
        return;
      }
      setState(() { _loading = false; _loadError = true; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _loadError = true; });
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
  // اللمس هو التجربة
  // ══════════════════════════════════════════════════════
  void _pick(StoreItem item) {
    if (_wearable.contains(item.kind)) {
      setState(() {
        _stage = null;
        _tryOn = _tryOn?.id == item.id ? null : item;
      });
      _stageTimer?.cancel();
      unawaited(StingPreview.instance.stop());
    } else {
      setState(() => _tryOn = item);
      _playStage(item);
    }
  }

  void _clearPick() {
    _stageTimer?.cancel();
    unawaited(StingPreview.instance.stop());
    setState(() {
      _tryOn = null;
      _stage = null;
    });
  }

  /// 🎬 المعاينة الزمنيّة تُشغَّل **فوق المرآة** لأن هذا موضعها في الواقع:
  ///    التشريفة حول بطاقتك، والإقصاء يحرق بطاقتك.
  ///
  /// 🔇 النغمة لا تمرّ بأيّ مسار بثّ — جهاز القائد مصدر صوت القاعة
  ///    الحصريّ، ومعاينةٌ تُبَثّ تعني نغمة نصرٍ تُسمَع في الصالة لأن أحدهم
  ///    يتصفّح المتجر.
  void _playStage(StoreItem item) {
    _stageTimer?.cancel();
    setState(() => _stage = item);

    // 🔊 STORE-1: النغمة تُسمَع فعلاً لا موجةً صامتة — من يشتري صوتاً
    //    يستحقّ سماعه أوّلاً. محلّيّاً على هاتفه وحده (انظر أعلاه).
    if (item.kind == 'victory_sting') {
      unawaited(StingPreview.instance.play(item.id, item.soundUrl).then((ok) {
        // 🔴 الفشل يُقال لا يُبتلع: صمتٌ بلا سبب يبدو عطلاً في التطبيق،
        //    والويب يقول «لا ملف صوت لهذه النغمة بعد» صراحةً.
        if (!ok && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('لا ملفّ صوتٍ لهذه النغمة بعد'),
            duration: Duration(seconds: 2),
          ));
        }
      }));
    } else {
      unawaited(StingPreview.instance.stop());
    }
    final ms = switch (item.kind) {
      'entrance' => ((item.config?['durationMs'] as num?)?.toInt() ?? 3500)
          .clamp(1500, 6000),
      'elimination' => 3200,
      _ => 6000,
    };
    _stageTimer = Timer(Duration(milliseconds: ms), () {
      unawaited(StingPreview.instance.stop());
      if (mounted) setState(() => _stage = null);
    });
  }

  // ══════════════════════════════════════════════════════
  // الأفعال
  // ══════════════════════════════════════════════════════
  Future<void> _rent(StoreItem item) async {
    final d = _data;
    if (d == null) return;
    if (d.balance < item.priceChips) {
      await showNeedChips(context,
          item: item, balance: d.balance, rates: d.earnRates);
      return;
    }
    final renewing = item.owned;
    setState(() => _busyItem = item.id);
    try {
      // 🔴 `requestId` ليس زينة: ضغطتان سريعتان تعنيان خصمين لنفس العنصر.
      final r = await ApiClient.instance.post('/api/chips/store/rent', body: {
        'itemId': item.id,
        'requestId': 'rent-${item.id}-${DateTime.now().microsecondsSinceEpoch}',
      });
      if (!mounted) return;
      if (r is Map && r['success'] == true) {
        await _load();
        if (!mounted) return;
        final fresh = _data?.items.where((i) => i.id == item.id).firstOrNull;
        setState(() => _tryOn = null);
        await showPurchaseCelebration(
          context,
          item,
          renewed: renewing,
          remainingText: fresh?.daysLeftText,
          playerName: _data?.name ?? '',
          data: _data,
          onEquipNow: _equipNowFor(item),
        );
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

  Future<void> _trial(StoreItem item) async {
    setState(() => _busyItem = item.id);
    try {
      final r = await ApiClient.instance
          .post('/api/chips/store/trial', body: {'itemId': item.id});
      if (!mounted) return;
      if (r is Map && r['success'] == true) {
        await _load();
        if (!mounted) return;
        final fresh = _data?.items.where((i) => i.id == item.id).firstOrNull;
        setState(() => _tryOn = null);
        await showPurchaseCelebration(context, item,
            remainingText: fresh?.daysLeftText,
            playerName: _data?.name ?? '',
            data: _data,
            onEquipNow: _equipNowFor(item));
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


  /// 🎽 STORE-4: يُمرَّر للاحتفال حين يكون المشترى قابلاً للّبس وغير مجهَّز.
  ///
  /// 🔴 `null` للمؤقّت (تشريفة/إقصاء/نغمة): هذه تُفعَّل بالشراء ولا «تُلبس»،
  ///    فزرُّ تجهيزٍ لها يَعِد بفعلٍ لا وجود له.
  Future<void> Function()? _equipNowFor(StoreItem item) {
    if (!_wearable.contains(item.kind)) return null;
    final d = _data;
    // مجهَّزٌ أصلاً ⇒ لا زرّ: وعدٌ بفعلٍ لا يغيّر شيئاً.
    if (d != null && d.cosmetics.isEquipped(item)) return null;
    return () => _equip(item.kind, item.id);
  }

  Future<void> _equip(String kind, int? itemId) async {
    try {
      final r = await ApiClient.instance.post('/api/chips/store/equip',
          body: {'kind': kind, 'itemId': itemId});
      if (!mounted) return;
      if (r is Map && r['success'] == true) {
        await _load();
        if (mounted) setState(() => _tryOn = null);
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
            if (d != null) _Mirror(
              data: d,
              sel: _tryOn,
              stage: _stage,
              busy: _busyItem,
              onClear: _clearPick,
              onRent: _rent,
              onTrial: _trial,
              onEquip: _equip,
              onReplay: _playStage,
              onSlotTap: (kind) => setState(() => _tab = kind),
            ),
            if (d != null) _tabsBar(d),
            Expanded(child: _body(d)),
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
                  borderRadius: BorderRadius.circular(8),
                  color: const Color(0x24F59E0B),
                  border: Border.all(color: const Color(0x52F59E0B)),
                ),
                child: ltrText('🪙 ${groupThousands(d?.balance ?? 0)}',
                    num_(13, color: Tw.amber400)),
              ),
            ),
          ],
        ),
      );

  Widget _tabsBar(StoreData d) => Container(
        decoration: const BoxDecoration(
          color: Color(0xF0050505),
          border: Border(bottom: BorderSide(color: Color(0x0FFFFFFF))),
        ),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(children: [
            for (final t in _tabsOf(d)) ...[
              InkWell(
                onTap: () {
                  setState(() => _tab = t.$1);
                  _clearPick();
                },
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    color: _tab == t.$1
                        ? const Color(0x26F59E0B)
                        : const Color(0x0DFFFFFF),
                    border: Border.all(
                        color: _tab == t.$1
                            ? const Color(0x80F59E0B)
                            : const Color(0x1AFFFFFF)),
                  ),
                  child: Text.rich(
                    TextSpan(children: [
                      TextSpan(text: '${t.$3} ${t.$2} '),
                      TextSpan(
                          text: '${t.$4}',
                          style: ar(11.5, color: Tw.gray600)),
                    ]),
                    style: ar(11.5,
                        color: _tab == t.$1
                            ? const Color(0xFFFCD34D)
                            : Tw.gray400,
                        weight: FontWeight.bold),
                  ),
                ),
              ),
              const SizedBox(width: 6),
            ],
          ]),
        ),
      );

  Widget _body(StoreData? d) {
    if (_loading) {
      return Center(
          child: Text('جارٍ فتح الخزنة…', style: ar(14, color: Tw.gray600)));
    }
    if (_loadError || d == null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('تعذّر فتح الخزنة', style: ar(14, color: Tw.rose400)),
          const SizedBox(height: 12),
          InkWell(
            onTap: _load,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                  color: Tw.amber500, borderRadius: BorderRadius.circular(12)),
              child: Text('أعد المحاولة',
                  style: ar(12, color: Colors.black, weight: FontWeight.w900)),
            ),
          ),
        ]),
      );
    }

    final items = _itemsOf(d);
    final grid = _tab == 'offers' || _tab == 'mine' || _wearable.contains(_tab);

    // ⏳ STORE-3: ما يوشك أن ينتهي — تحذيرٌ استباقيّ في كلّ التبويبات.
    //
    // 🔴 بلا هذا يفقد اللاعب عنصره المدفوع **بصمت**: لا يعرف أن إطاره
    //    ينتهي إلّا إن فتح «خزانتي» وقرأ الأيّام بنفسه. والتجديد أرخص من
    //    شراءٍ جديد، فالصمت يكلّفه ويكلّف النادي بيعةً.
    final expiring = d.mine
        .where((i) => i.expiresAt != null && i.daysLeft > 0 && i.daysLeft <= 3)
        .toList()
      ..sort((a, b) => a.daysLeft.compareTo(b.daysLeft));

    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 40),
      children: [
        if (expiring.isNotEmpty) ...[
          ExpiringBanner(
            count: expiring.length,
            soonestName: expiring.first.nameAr,
            soonestDaysText: expiring.first.daysLeftText,
            onTap: () => setState(() => _tab = 'mine'),
          ),
          const SizedBox(height: 12),
        ],
        if (items.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 48),
            child: Center(
                child: Text('لا عناصر في هذا القسم',
                    style: ar(14, color: Tw.gray600))),
          )
        else if (grid)
          // §13.2 و§13.4: ساعةٌ واحدة لكلّ الشبكة، وتقليلُ الجسيمات إلى
          // النصف حين تتجاوز ستّ عناصر.
          FxClockProvider(
            child: FxDensity.forCount(
              items.length,
              child: GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 200,
              mainAxisExtent: 150,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
            ),
            itemCount: items.length,
            itemBuilder: (_, i) => StoreGridItem(
              item: items[i],
              equipped: d.cosmetics.isEquipped(items[i]),
              selected: _tryOn?.id == items[i].id,
              onTap: () => _pick(items[i]),
              playerName: d.name,
            ),
              ),
            ),
          )
        else
          FxClockProvider(
            child: FxDensity.forCount(
              items.length,
              child: Column(children: [
                for (final it in items) ...[
            StoreRowItem(
              item: it,
              selected: _tryOn?.id == it.id,
              temporal: _temporal.contains(it.kind),
              onTap: () => _pick(it),
              playerName: d.name,
            ),
            const SizedBox(height: 8),
          ],
              ]),
            ),
          ),
        if (d.closedVault.isNotEmpty)
          ClosedVault(items: d.closedVault, playerName: d.name),
        if (d.earnRates != null) ...[
          const SizedBox(height: 24),
          _earnCard(d),
        ],
      ],
    );
  }

  Widget _earnCard(StoreData d) {
    final r = d.earnRates!;
    Widget line(String s) => Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Text(s, style: ar(12, color: Tw.gray400, height: 1.5)),
        );
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: const Color(0x0FF59E0B),
        border: Border.all(color: const Color(0x33F59E0B)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('كيف تكسب تشبس؟',
            style: ar(13, color: Tw.amber400, weight: FontWeight.w900)),
        const SizedBox(height: 6),
        // 🔴 «+٢» داخل جملةٍ عربية ينقلب «٢+»: علامة الزائد محايدة فتأخذ
        //    اتجاه الفقرة. تُلفّ مع رقمها في مقطعٍ لاتينيّ.
        if (r.win > 0) line('🏆 اربح المباراة — ${ltrRun('+${r.win}')}'),
        if (r.top3 > 0) line('🥉 ضمن أفضل ثلاثة — ${ltrRun('+${r.top3}')}'),
        if (r.birthday > 0) line('🎂 عيد ميلادك — ${ltrRun('+${r.birthday}')}'),
        line('💵 أو اشحن من الإدارة بالحضور'),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════
// 🪞 المرآة
// ══════════════════════════════════════════════════════
// 📐 حالتان: مصغّرة حين لا معاينة، وكبيرة حين تُعاين. البطاقة المصغّرة
//    تكفي للسياق لكنّها لا تكفي للحكم على تفاصيل إطار — وهو الفعل الذي
//    جاء اللاعب من أجله. فتكبر لحظة الاختيار وحدها.
class _Mirror extends StatelessWidget {
  const _Mirror({
    required this.data,
    required this.sel,
    required this.stage,
    required this.busy,
    required this.onClear,
    required this.onRent,
    required this.onTrial,
    required this.onEquip,
    required this.onReplay,
    required this.onSlotTap,
  });

  final StoreData data;
  final StoreItem? sel, stage;
  final int? busy;
  final VoidCallback onClear;
  final void Function(StoreItem) onRent, onTrial, onReplay;
  final void Function(String kind, int? itemId) onEquip;
  final void Function(String kind) onSlotTap;

  /// مقاس البطاقة `sm` الحقيقيّ، ومتنفَّسٌ علويّ بمقدار طفو الشعار.
  static const _cardW = 176.0, _cardH = 240.0, _headroom = 17.0;

  @override
  Widget build(BuildContext context) {
    final k = sel != null ? 0.78 : 0.46;
    final boxW = (_cardW * k).roundToDouble();
    final boxH = ((_cardH + _headroom) * k).roundToDouble();
    final padTop = (_headroom * k).roundToDouble();

    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xF7050505), Color(0xE0050505)],
        ),
        border: Border(bottom: BorderSide(color: Color(0x12FFFFFF))),
      ),
      child: Stack(children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
            // ⬆️ القصّ بلا متنفَّس يبتر التاج — وهو ما دفع اللاعب ثمنه
            SizedBox(
              width: boxW,
              height: boxH,
              child: ClipRect(
                child: Stack(clipBehavior: Clip.none, children: [
                  Positioned(
                    top: padTop,
                    right: 0,
                    child: Transform.scale(
                      scale: k,
                      alignment: Alignment.topRight,
                      child: SizedBox(
                        width: _cardW,
                        height: _cardH,
                        child: MafiaCardView(
                          playerName: data.name.isEmpty ? 'أنت' : data.name,
                          avatarUrl: data.avatarUrl,
                          // 🔴 نفس علّة STORE-5 في المرآة: من تشتري إطاراً
                          //    تستحقّ أن ترى نفسها لا غيرها. المصدر
                          //    الجلسة لا استجابة المتجر — الأخيرة لا تحمل
                          //    الجنس أصلاً.
                          isFemale:
                              SessionStore.instance.player?.isFemale ?? false,
                          cosmetics: data.cosmetics.preview(sel),
                          template: GameConfigService.instance.master,
                          rankFx: GameConfigService.instance
                              .effectsForTier(data.rankTier),
                        ),
                      ),
                    ),
                  ),
                  if (stage != null && stage!.kind != 'entrance')
                    Positioned(
                      top: padTop,
                      right: 0,
                      width: boxW,
                      height: (_cardH * k).roundToDouble(),
                      child: MirrorStageView(item: stage!),
                    ),
                ]),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(child: sel == null ? _idle(context) : _selected(context)),
          ]),
        ),

        // 🚪 مسرح التشريفة يغطّي المرآة كاملةً: التشريفة حدثٌ يملأ شاشة
        //    القاعة، وحصرها في مربّع البطاقة يجعلها بقعةَ لونٍ لا تُقرأ.
        if (stage != null && stage!.kind == 'entrance')
          Positioned.fill(
            child: IgnorePointer(
              child: Stack(children: [
                Positioned.fill(
                    child: EntranceStageView(
                        item: stage!,
                        playerName: data.name.isEmpty ? 'أنت' : data.name)),
                PositionedDirectional(
                  bottom: 6,
                  start: 12,
                  child: Text('هكذا تظهر على شاشة القاعة',
                      style: ar(9, color: Tw.gray500)),
                ),
              ]),
            ),
          ),
      ]),
    );
  }

  // ── لا معاينة ──
  Widget _idle(BuildContext context) {
    final empty = <(String kind, String label)>[
      if (data.cosmetics.frame == null) ('frame', 'إطارك'),
      if (data.cosmetics.title == null) ('title', 'لقبك'),
      if (data.cosmetics.nameFx == null) ('name_fx', 'تأثير اسمك'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('بطاقتك كما يراها كل من في القاعة',
            style: ar(11, color: Tw.gray400)),
        const SizedBox(height: 6),
        if (empty.isEmpty)
          Text('المس أي عنصر لتراه على بطاقتك فوراً',
              style: ar(10, color: Tw.gray600, height: 1.5))
        else
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final s in empty)
                InkWell(
                  onTap: () => onSlotTap(s.$1),
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      color: const Color(0x0FF59E0B),
                      border: Border.all(color: const Color(0x4DF59E0B)),
                    ),
                    child: Text(
                      data.cheapestOf(s.$1) == null
                          ? '${s.$2} فاضي'
                          : '${s.$2} فاضي — من 🪙${data.cheapestOf(s.$1)}',
                      style: ar(10,
                          color: const Color(0xE6FCD34D),
                          weight: FontWeight.bold),
                    ),
                  ),
                ),
            ],
          ),
      ],
    );
  }

  // ── معاينة جارية ──
  Widget _selected(BuildContext context) {
    final i = sel!;
    final equipped = data.cosmetics.isEquipped(i);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(children: [
          rarityDot(i.rarity),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              '${i.owned ? 'تملكه' : i.isAchievement ? '👑 إنجاز' : 'تعاينه الآن'}'
              ' · ${rarityLabel(i.rarity)}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: ar(10, color: Tw.gray500),
            ),
          ),
        ]),
        Text(i.nameAr,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
                fontFamily: 'Amiri',
                fontSize: 15,
                fontWeight: FontWeight.w900,
                color: Colors.white,
                height: 1.2,
                letterSpacing: 0)),
        // جملة البيع هنا لا في الشبكة — يقرؤها من اهتمّ فعلاً
        if (i.hookAr != null)
          Text(i.hookAr!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: ar(10.5, color: Tw.gray400, height: 1.3)),
        const SizedBox(height: 4),
        _money(i),
        const SizedBox(height: 6),
        _actions(context, i, equipped),
      ],
    );
  }

  Widget _money(StoreItem i) {
    if (i.owned) {
      return Text('⏳ متبقٍ ${i.daysLeftText}',
          style: num_(11, color: const Color(0xFF34D399)));
    }
    if (!i.isPurchasable) {
      return Text.rich(TextSpan(children: [
        TextSpan(
            text: i.achievementAr == null
                ? 'إنجاز فقط'
                : 'يُنال بـ${i.achievementAr}',
            style: ar(10.5,
                color: const Color(0xFFCBD5E1), weight: FontWeight.bold)),
        if (i.holderName != null)
          TextSpan(
              text: ' · يحمله ${i.holderName}',
              style: ar(10.5, color: const Color(0xCCFBBF24))),
      ]));
    }
    return Text.rich(TextSpan(children: [
      TextSpan(text: '🪙 ${i.priceChips}', style: num_(11, color: Tw.amber400)),
      if (i.perDayText != null)
        TextSpan(
            text: ' · ${i.perDayText} يومياً',
            style: ar(11, color: Tw.gray500)),
    ]));
  }

  /// الفعل الأساسيّ الوحيد في الشاشة.
  Widget _actions(BuildContext context, StoreItem i, bool equipped) {
    final busyNow = busy != null;
    final buttons = <Widget>[];

    if (i.isPurchasable) {
      if (i.owned) {
        if (_wearable.contains(i.kind)) {
          buttons.add(Expanded(
            child: _btn(
              equipped ? 'إزالة من بطاقتي' : '🎽 جهّزه الآن',
              filled: !equipped,
              onTap: busyNow
                  ? null
                  : () => onEquip(i.kind, equipped ? null : i.id),
            ),
          ));
        }
        buttons.add(_btn('🔄 جدّد',
            color: const Color(0x3305966A),
            border: const Color(0x6610B981),
            text: const Color(0xFF6EE7B7),
            onTap: busyNow ? null : () => onRent(i)));
      } else {
        final enough = data.balance >= i.priceChips;
        buttons.add(Expanded(
          child: _btn(
            busy == i.id
                ? '…'
                : enough
                    ? 'استأجر — 🪙${i.priceChips}'
                    : 'ينقصك ${groupThousands(i.priceChips - data.balance)} 🪙',
            filled: true,
            onTap: busy == i.id ? null : () => onRent(i),
          ),
        ));
        if (i.trialEligible) {
          buttons.add(_btn('🎁 ٣ أيام',
              color: const Color(0x332563EA),
              border: const Color(0x660EA5E9),
              text: const Color(0xFFBAE6FD),
              onTap: busy == i.id ? null : () => onTrial(i)));
        }
      }
    }

    if (_temporal.contains(i.kind)) {
      buttons.add(_btn('↻', onTap: () => onReplay(i)));
    }
    buttons.add(_btn('↩︎', onTap: onClear));

    return Row(children: [
      for (var n = 0; n < buttons.length; n++) ...[
        if (n > 0) const SizedBox(width: 6),
        buttons[n],
      ],
    ]);
  }

  Widget _btn(
    String label, {
    bool filled = false,
    Color? color,
    Color? border,
    Color? text,
    VoidCallback? onTap,
  }) =>
      InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Opacity(
          opacity: onTap == null ? 0.4 : 1,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              gradient: filled && color == null
                  ? const LinearGradient(
                      begin: Alignment.topRight,
                      end: Alignment.bottomLeft,
                      colors: [Tw.amber400, Color(0xFFD97706)],
                    )
                  : null,
              color: color ?? (filled ? null : const Color(0x0FFFFFFF)),
              border: Border.all(
                  color: border ?? (filled ? Colors.transparent : const Color(0x1FFFFFFF))),
            ),
            child: Center(
              child: Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ar(11,
                      color: text ?? (filled ? Colors.black : Tw.gray300),
                      weight: FontWeight.w900)),
            ),
          ),
        ),
      );
}
