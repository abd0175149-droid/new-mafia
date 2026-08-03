import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../models/card_fx.dart';
import '../../core/api/game_config_service.dart';
import '../../models/card_template.dart';
import '../../models/store.dart';
import '../../models/title_plaque.dart' show kPlaqueBaseMarginTop;
import '../profile/profile_palette.dart';
import 'card_fx_layer.dart';
import 'chips_emblems.dart';
import 'name_fx_text.dart';
import 'title_plaque_view.dart';

// ══════════════════════════════════════════════════════
// 🎴 بطاقة اللاعب — وجه الغلاف من `DynamicMafiaCard`
// ══════════════════════════════════════════════════════
// 🔴 المتجر يعرض **وجه الغلاف وحده**: `role: null` و`flippable: false`.
//    وجه الدور وقلبُ البطاقة يخصّان طبقة اللعب (الملفّ ٢٢) ولا يلزمان
//    هنا — والمرآة في الويب ترسم هذه البطاقة نفسها بلا لعبةٍ جارية.
//
// 🪙 ترتيب الأولوية في التأثيرات: الإطار المشترى يعلو تأثير الرتبة، وما
//    لا يمسّه المشترى يبقى للرتبة (`mergeFx`). وتأثير الاسم المشترى يعلو
//    تأثير الإطار.

enum CardSize { sm, md, lg }

/// المقاسات الحقيقية: `w-44 h-[15rem]` · `w-56 h-[20rem]` · `w-64 h-[22rem]`.
///
/// 🔴 `md` هي **قاعدة معايرة** المواضع والأشكال في القوالب: المحرّر يكتب
///    إزاحاتها بالبكسل على هذا المقاس. رسمُ البطاقة `sm` مع إزاحاتٍ
///    معايَرة على `md` يدفع الرقم خارج حدّها.
const _cardBox = <CardSize, Size>{
  CardSize.sm: Size(176, 240),
  CardSize.md: Size(224, 320),
  CardSize.lg: Size(256, 352),
};

const _emblemSize = <CardSize, double>{
  CardSize.sm: 40, CardSize.md: 56, CardSize.lg: 72,
};
const _nameSize = <CardSize, double>{
  CardSize.sm: 16, CardSize.md: 20, CardSize.lg: 24,
};
const _numberSize = <CardSize, double>{
  CardSize.sm: 64, CardSize.md: 88, CardSize.lg: 112,
};
const _numberSizeTwoDigit = <CardSize, double>{
  CardSize.sm: 51.2, CardSize.md: 72, CardSize.lg: 88,
};
const _nameMaxLen = <CardSize, int>{
  CardSize.sm: 10, CardSize.md: 14, CardSize.lg: 18,
};

/// ذهبيّ الهوية — لون الرقم حين لا يحمل القالب لوناً.
const _goldSolid = Color(0xFFC5A059);
const _violet = Color(0xFFD8B4FE);

class MafiaCardView extends StatefulWidget {
  const MafiaCardView({
    super.key,
    required this.playerName,
    this.playerNumber = 1,
    this.avatarUrl,
    this.cosmetics = const EquippedCosmetics(),
    this.rankFx,
    this.size = CardSize.sm,
    this.isFemale = false,
    this.animate = true,
    this.template = const CardTemplate(),
    this.role,
    this.flippable = false,
    this.isFlipped,
    this.onFlip,
    this.isAlive = true,
    this.flipDurationMs = 700,
  });

  final String playerName;
  final int playerNumber;
  final String? avatarUrl;
  final EquippedCosmetics cosmetics;

  /// تأثيرات الرتبة — تُدمج تحت المشترى.
  final dynamic rankFx;

  final CardSize size;
  final bool isFemale, animate;

  /// 🔴 قالب البطاقة من كتالوج اللعبة — التدرّج والحدّ والتوهّج ومواضع
  ///    العناصر وأشكال الغلاف. رسمُها بقيمٍ ثابتة يجعل ما يراه اللاعب في
  ///    التطبيق غير ما يراه على شاشة القاعة.
  final CardTemplate template;

  /// الدور المعيَّن — وجودُه يُنشئ **وجهاً خلفياً** للكشف.
  final String? role;

  final bool flippable;

  /// مقودةٌ من الخارج حين تُمرَّر — وإلّا تُدار داخلياً.
  final bool? isFlipped;
  final VoidCallback? onFlip;

  /// ميتٌ ⇒ شفافية ٣٠٪ ورماديٌّ كامل وتعطيل اللمس.
  final bool isAlive;

  /// ٧٠٠ms افتراضاً، و١١٠٠ms عند كشف الدور في شاشة اللعب.
  final int flipDurationMs;

  @override
  State<MafiaCardView> createState() => _MafiaCardViewState();
}

class _MafiaCardViewState extends State<MafiaCardView>
    with SingleTickerProviderStateMixin {
  late final AnimationController _flip = AnimationController(
    vsync: this,
    duration: Duration(milliseconds: widget.flipDurationMs),
  );
  bool _internalFlip = false;

  bool get _flipped => widget.isFlipped ?? _internalFlip;

  @override
  void initState() {
    super.initState();
    if (_flipped) _flip.value = 1;
  }

  @override
  void didUpdateWidget(MafiaCardView old) {
    super.didUpdateWidget(old);
    if (_flipped && _flip.status != AnimationStatus.completed) {
      _flip.forward();
    } else if (!_flipped && _flip.value != 0) {
      _flip.reverse();
    }
  }

  @override
  void dispose() {
    _flip.dispose();
    super.dispose();
  }

  void _tap() {
    if (!widget.flippable) return;
    if (widget.onFlip != null) {
      widget.onFlip!();
      return;
    }
    setState(() => _internalFlip = !_internalFlip);
    _internalFlip ? _flip.forward() : _flip.reverse();
  }

  // ── اختصاراتٌ لحقول الودجت ──
  CardSize get size => widget.size;
  EquippedCosmetics get cosmetics => widget.cosmetics;
  /// 🔴 قالب **الدور** متى عُيِّن — الويب يستعمله للوجهين معاً لا للخلفيّ
  ///    وحده. ولكل دورٍ إزاحة رقمٍ وأشكالٌ وتدرّجٌ خاصّ به، فإبقاء
  ///    `master` على الوجه الأماميّ يضع الرقم في غير موضعه.
  CardTemplate get template {
    final r = widget.role;
    if (r == null || r.isEmpty) return widget.template;
    return GameConfigService.instance.cardForRole(r);
  }
  bool get isFemale => widget.isFemale;
  bool get animate => widget.animate;
  String? get avatarUrl => widget.avatarUrl;
  String get playerName => widget.playerName;
  int get playerNumber => widget.playerNumber;
  dynamic get rankFx => widget.rankFx;

  Size get box => _cardBox[size]!;

  FxChannels? _fxMemo;
  Object? _fxKey;

  FxChannels get _fx {
    // مفتاحُ هويّة: الخرائط نفسها لا تتغيّر بين الإطارات، فتغيّرها وحده
    // يستدعي إعادة الدمج.
    final key = Object.hash(
      identityHashCode(cosmetics.frame?.config),
      cosmetics.frame?.emblemId,
      identityHashCode(rankFx),
    );
    final memo = _fxMemo;
    if (memo != null && _fxKey == key) return memo;
    final out = _computeFx();
    _fxKey = key;
    _fxMemo = out;
    return out;
  }

  FxChannels _computeFx() {
    final paid = normalizeFx(cosmetics.frame?.config);
    var base = paid.anyEnabled
        ? mergeFx(rankFx, cosmetics.frame?.config)
        : normalizeFx(rankFx);
    // 🪙 الشعار المشترى والعنصر العائم للرتبة يُرسمان في **نفس الموضع**
    //    فيتراكبان — تاجٌ فوق تاج. الشعار بديلٌ مقصود للزينة العلوية.
    if (cosmetics.frame?.emblemId != null && base.floating.enabled) {
      base = base.copyWith(floating: FxFloating(enabled: false));
    }
    return base;
  }

  NameFx get _nameFx {
    final bought = cosmetics.nameFx?.config?['nameEffect'];
    return bought != null ? normalizeNameFx(bought) : _fx.nameEffect;
  }

  @override
  Widget build(BuildContext context) => RepaintBoundary(child: _build(context));

  /// 🔴 `RepaintBoundary` حول كلّ بطاقة (§13.1): بدونه يُعاد رسم الشجرة
  ///    كلّها — بما فيها بقيّة بطاقات الشبكة — عند كلّ إطارٍ متحرّك.
  Widget _build(BuildContext context) {
    // 🔴 ميتٌ: شفافية ٣٠٪ ورماديٌّ كامل وتعطيل اللمس — منقولٌ حرفياً
    Widget card = AnimatedBuilder(
      animation: _flip,
      builder: (_, __) {
        final a = Curves.easeInOutCubicEmphasized.transform(_flip.value);
        final angle = a * math.pi;
        // لا `backface-visibility` في Flutter — يُبدَّل الوجه بعد ٩٠°
        final showBack = a > 0.5;
        return Transform(
          alignment: Alignment.center,
          transform: Matrix4.identity()
            ..setEntry(3, 2, 0.001)
            ..rotateY(angle),
          child: showBack
              // الوجه الخلفيّ مُدارٌ مسبقاً كي يُقرأ معتدلاً
              ? Transform(
                  alignment: Alignment.center,
                  transform: Matrix4.identity()..rotateY(math.pi),
                  child: _back(),
                )
              : _front(),
        );
      },
    );

    if (widget.flippable) {
      card = GestureDetector(onTap: _tap, child: card);
    }
    if (!widget.isAlive) {
      card = IgnorePointer(
        child: Opacity(
          opacity: 0.3,
          child: ColorFiltered(
            colorFilter: const ColorFilter.matrix(<double>[
              0.2126, 0.7152, 0.0722, 0, 0,
              0.2126, 0.7152, 0.0722, 0, 0,
              0.2126, 0.7152, 0.0722, 0, 0,
              0, 0, 0, 1, 0,
            ]),
            child: card,
          ),
        ),
      );
    }
    return card;
  }

  Widget _front() {
    final fx = _fx;
    final emb = emblemIdOf(cosmetics.frame?.emblemId);
    final accent = isFemale ? _violet : _goldSolid;

    return SizedBox(
      width: box.width,
      height: box.height,
      child: Stack(clipBehavior: Clip.none, children: [
        // ── الجسم ──
        Positioned.fill(
          child: Container(
            // 🔴 وجه الغلاف **أسود صرف** بحدٍّ فقط. `gradient` و`glowEffect`
            //    في القالب يخصّان **وجه كشف الدور** وحده (السطران ٥٢١ و٥٤١
            //    في `DynamicMafiaCard`) — وطلاؤهما هنا يغطّي البطاقة بطبقة
            //    لونٍ كاملة لا وجود لها في الويب ولا على شاشة القاعة.
            //    المتجر لا يعرض وجه الدور أصلاً، فلا يُرسمان في هذه الشاشة.
            decoration: BoxDecoration(
              color: Colors.black,
              borderRadius: BorderRadius.circular(kCardRadius),
              border: Border.all(color: template.border, width: 2),
            ),
            clipBehavior: Clip.antiAlias,
            child: Stack(children: [
            Column(children: [
              // القسم العلويّ (٢/٣): الصورة والرقم
              Expanded(
                flex: 2,
                child: Stack(children: [
                  Positioned.fill(child: _avatar()),
                  // تدرّجٌ إلى الأسود في الثلث السفليّ منه
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: box.height * (2 / 3) / 3,
                    child: const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.bottomCenter,
                          end: Alignment.topCenter,
                          colors: [Colors.black, Colors.transparent],
                        ),
                      ),
                    ),
                  ),
                  if (template.showPlayerNumber)
                    Positioned.fill(
                      child: Center(child: _positioned(
                          template.coverNumber, _number(accent))),
                    ),
                ]),
              ),
              // القسم السفليّ (١/٣): الاسم واللقب والعلامة
              Expanded(
                flex: 1,
                child: Stack(children: [
                  const Positioned.fill(child: ColoredBox(color: Colors.black)),
                  // خيطٌ رفيع من ١٥٪ إلى ٨٥٪
                  Positioned(
                    left: box.width * 0.15,
                    right: box.width * 0.15,
                    top: 0,
                    height: 1,
                    child: ColoredBox(
                        color: isFemale
                            ? const Color(0x4DC084FC)
                            : const Color(0x4DC5A059)),
                  ),
                  Positioned.fill(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          _positioned(template.coverName, _name()),
                          if ((cosmetics.title?.config?['text'] as String?)
                                  ?.isNotEmpty ??
                              false) ...[
                            SizedBox(height: kPlaqueBaseMarginTop * _scale),
                            TitlePlaqueView(
                              text: cosmetics.title!.config!['text'] as String,
                              style: cosmetics.title!.config!['style'] as String?,
                              plaque: cosmetics.title!.config!['plaque'],
                              animate: animate,
                              scale: _scale,
                            ),
                          ],
                          SizedBox(height: 4 * _scale),
                          if (template.showClubBranding)
                          _positioned(template.coverBranding,
                          Text(
                            'MAFIA CLUB',
                            style: TextStyle(
                              fontFamily: 'JetBrainsMono',
                              fontSize: 8 * _scale,
                              letterSpacing: 2,
                              color: isFemale
                                  ? const Color(0x66C084FC)
                                  : const Color(0x66C5A059),
                            ),
                          )),
                        ],
                      ),
                    ),
                  ),
                ]),
              ),
            ]),
            // 🔴 أشكال الغلاف **داخل** القصّ: خارجه تتجاوز حدّ البطاقة
            //    وتظهر مستطيلاتٍ سابحة حولها. الويب يضعها داخل عنصرٍ
            //    بـ`overflow-hidden`.
            for (final sh in template.coverShapes) _shape(sh),
            ]),
          ),
        ),

        // ── طبقة التأثيرات ──
        Positioned.fill(child: CardFxLayer(fx: fx, animate: animate)),

        // ── الشعار المشترى: يطفو فوق الحافّة ──
        if (emb != null)
          Positioned(
            top: -(_emblemSize[size]! * 0.42).roundToDouble(),
            left: 0,
            right: 0,
            child: IgnorePointer(
              child: Center(
                child: _EmblemFloat(
                  id: emb,
                  size: _emblemSize[size]!,
                  animate: animate,
                ),
              ),
            ),
          ),
      ]),
    );
  }

  // ══════════════════════════════════════════════════════
  // §4.3 الوجه الخلفيّ — كشف الدور
  // ══════════════════════════════════════════════════════
  Widget _back() {
    final cfg = GameConfigService.instance;
    final def = cfg.role(widget.role);
    // قالب الدور إن وُجد، وإلّا `master` — لا فارغ
    final t = cfg.cardForRole(widget.role);
    final isMafia = def?.isMafia ?? cfg.isMafiaRole(widget.role);
    final isNeutral = def?.isNeutral ?? false;
    final textColor = parseCssColor(t.textColor, const Color(0xFFD4D4D8));
    final border = t.border;

    final (badgeText, badgeBg, badgeFg, badgeBorder) = isMafia
        ? ('فريق المافيا 🔴', const Color(0x997F1D1D), const Color(0xFFFCA5A5),
            const Color(0x4DEF4444))
        : isNeutral
            ? ('محايد ⚪', const Color(0x99783C0F), const Color(0xFFFCD34D),
                const Color(0x4DF59E0B))
            : ('فريق المدينة 🔵', const Color(0x991E3A8A),
                const Color(0xFF93C5FD), const Color(0x4D3B82F6));

    // 🔴 وجهٌ مخصّص: صورةٌ واحدة ملء البطاقة **بلا أيّ عنصرٍ آخر**
    if (t.hasSecretImage) {
      return SizedBox(
        width: box.width,
        height: box.height,
        child: Container(
          decoration: BoxDecoration(
            color: Colors.black,
            borderRadius: BorderRadius.circular(kCardRadius),
            border: Border.all(color: border, width: 2),
            boxShadow: t.glow == null ? null : [t.glow!],
          ),
          clipBehavior: Clip.antiAlias,
          child: CachedNetworkImage(
            imageUrl: ApiClient.instance.upload(t.secretImageUrl),
            fit: BoxFit.cover,
            errorWidget: (_, __, ___) => const ColoredBox(color: Colors.black),
            placeholder: (_, __) => const ColoredBox(color: Colors.black),
          ),
        ),
      );
    }

    return SizedBox(
      width: box.width,
      height: box.height,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.black,
          gradient: t.bodyGradient,
          borderRadius: BorderRadius.circular(kCardRadius),
          border: Border.all(color: border, width: 2),
          boxShadow: t.glow == null ? null : [t.glow!],
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(children: [
          // لمعانٌ قطريّ خفيف فوق التدرّج
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomLeft,
                  end: Alignment.topRight,
                  colors: [
                    Colors.transparent,
                    Color(0x08FFFFFF),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),

          // شارة الفريق
          Positioned(
            top: 12,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: badgeBg,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: badgeBorder),
                ),
                child: Text(badgeText,
                    style: TextStyle(
                        fontFamily: 'JetBrainsMono',
                        fontSize: 10,
                        letterSpacing: 1.5,
                        color: badgeFg)),
              ),
            ),
          ),

          // رقاقة الرقم
          Positioned(
            top: 12,
            right: 12,
            child: Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: const Color(0x66000000),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: border),
              ),
              child: Center(
                child: Text('$playerNumber',
                    style: TextStyle(
                        fontFamily: 'JetBrainsMono',
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: textColor)),
              ),
            ),
          ),

          // ⚠️ ارتفاع البطاقة ثابت: `Spacer` مع حشواتٍ ثابتة يفيض حتماً
          //    على المقاس الصغير. العمود يتمركز، والتذييل يُثبَّت أسفلاً.
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 48, 12, 26),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  _roleIcon(def, border, textColor),
                  const SizedBox(height: 14),
                  Flexible(
                    child: Text(cfg.roleName(widget.role),
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontFamily: 'Amiri',
                          fontSize: size == CardSize.lg ? 30 : (size == CardSize.md ? 26 : 20),
                          fontWeight: FontWeight.w900,
                          height: 1.2,
                          letterSpacing: 0,
                          color: textColor,
                        )),
                  ),
                  const SizedBox(height: 6),
                  Text(playerName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontFamily: 'Amiri',
                          fontSize: 13,
                          letterSpacing: 0,
                          color: Color(0x80FFFFFF))),
                  const SizedBox(height: 12),
                  Container(width: 80, height: 1, color: border),
                ],
              ),
            ),
          ),
          if (widget.flippable)
            Positioned(
              bottom: 8,
              left: 0,
              right: 0,
              child: Center(
                child: Text('اضغط للإخفاء',
                    style: ar(10, color: const Color(0xFF71717A))),
              ),
            ),

          // 🔴 أشكال وجه الدور **لا تُزاح**: تبقى مركزةً فقط — بخلاف
          //    أشكال الغلاف. فرقٌ دقيق منقولٌ حرفياً.
          for (final sh in t.shapes.where((x) => x.face == 'role'))
            Positioned(
              left: box.width / 2 - sh.w / 2,
              top: box.height / 2 - sh.h / 2,
              width: sh.w,
              height: sh.h,
              child: IgnorePointer(
                child: Opacity(
                  opacity: sh.opacity,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: parseCssColor(sh.bg, const Color(0xFF000000)),
                      shape: sh.type == 'circle'
                          ? BoxShape.circle
                          : BoxShape.rectangle,
                      borderRadius: sh.type == 'circle'
                          ? null
                          : BorderRadius.circular(sh.radius),
                    ),
                  ),
                ),
              ),
            ),
        ]),
      ),
    );
  }

  Widget _roleIcon(RoleDef? def, Color border, Color textColor) {
    final iconSize = switch (size) {
      CardSize.sm => 32.0,
      CardSize.md => 44.0,
      CardSize.lg => 52.0,
    };
    Widget inner;
    if (def?.iconType == 'emoji' && (def?.iconValue ?? '').isNotEmpty) {
      inner = Text(def!.iconValue!, style: TextStyle(fontSize: iconSize));
    } else {
      inner = Icon(_lucide(def?.iconValue, widget.role),
          size: iconSize, color: textColor);
    }
    return Container(
      width: 96,
      height: 96,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0x66000000),
        border: Border.all(color: border, width: 2),
        boxShadow: const [
          BoxShadow(color: Color(0x4D000000), blurRadius: 20, spreadRadius: -8),
        ],
      ),
      child: Center(child: inner),
    );
  }

  /// خريطة أيقونات Lucide المتاحة — وما لا يُعرف يسقط على `User`.
  static IconData _lucide(String? name, String? roleId) {
    const byName = <String, IconData>{
      'User': Icons.person_outline,
      'HeartPulse': Icons.monitor_heart_outlined,
      'Shield': Icons.shield_outlined,
      'Syringe': Icons.vaccines_outlined,
      'Crosshair': Icons.gps_fixed,
      'BadgeAlert': Icons.badge_outlined,
      'Skull': Icons.dangerous_outlined,
      'Crown': Icons.workspace_premium_outlined,
      'Drama': Icons.theater_comedy_outlined,
      'Scissors': Icons.content_cut,
      'Flame': Icons.local_fire_department_outlined,
      'Ghost': Icons.blur_on,
      'Eye': Icons.visibility_outlined,
      'Zap': Icons.bolt_outlined,
      'Sword': Icons.hardware_outlined,
      'Heart': Icons.favorite_outline,
      'Landmark': Icons.account_balance_outlined,
    };
    final direct = byName[name];
    if (direct != null) return direct;
    // الخريطة الكلاسيكية حين لا يحمل القالب أيقونةً صالحة
    const classic = <String, String>{
      'GODFATHER': 'Crown', 'SILENCER': 'Scissors', 'CHAMELEON': 'Drama',
      'MAFIA_REGULAR': 'Skull', 'SHERIFF': 'Shield', 'DOCTOR': 'HeartPulse',
      'SNIPER': 'Crosshair', 'POLICEWOMAN': 'BadgeAlert', 'NURSE': 'Syringe',
      'MAYOR': 'Landmark', 'CITIZEN': 'User',
    };
    return byName[classic[roleId]] ?? Icons.person_outline;
  }

  double get _scale => switch (size) {
        CardSize.sm => 1.0,
        CardSize.md => 1.2,
        CardSize.lg => 1.4,
      };

  /// إزاحةٌ ومقياسٌ بوحدات بكسل CSS — **لا تُقاس بحجم البطاقة**: المحرّر
  /// يكتبها مطلقةً والويب يطبّقها كما هي على كل المقاسات.
  Widget _positioned(ElementPos? p, Widget child) {
    if (p == null) return child;
    return Transform.translate(
      offset: Offset(p.x, p.y),
      child: Transform.scale(scale: p.s, child: child),
    );
  }

  /// شكلٌ زخرفيّ: يُوسَّط ثمّ يُزاح — `top/left:50%` مع هامشٍ سالب.
  Widget _shape(CardShape sh) => Positioned(
        left: box.width / 2 - sh.w / 2 + sh.x,
        top: box.height / 2 - sh.h / 2 + sh.y,
        width: sh.w,
        height: sh.h,
        child: IgnorePointer(
          child: Opacity(
            opacity: sh.opacity,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: parseCssColor(sh.bg, const Color(0xFF000000)),
                shape: sh.type == 'circle' ? BoxShape.circle : BoxShape.rectangle,
                borderRadius: sh.type == 'circle'
                    ? null
                    : BorderRadius.circular(sh.radius),
              ),
            ),
          ),
        ),
      );

  Widget _avatar() {
    final url = avatarUrl;
    if (url == null || url.isEmpty) {
      return Opacity(
        opacity: 0.7,
        child: ColoredBox(
          color: const Color(0xFF18181B),
          child: Center(
            child: Text(isFemale ? '👤' : '🕵️',
                style: TextStyle(fontSize: box.width * 0.3)),
          ),
        ),
      );
    }
    return Opacity(
      opacity: 0.8,
      child: CachedNetworkImage(
        imageUrl: ApiClient.instance.upload(url),
        fit: BoxFit.cover,
        width: double.infinity,
        height: double.infinity,
        errorWidget: (_, __, ___) => const ColoredBox(color: Color(0xFF18181B)),
        placeholder: (_, __) => const ColoredBox(color: Color(0xFF18181B)),
      ),
    );
  }

  Widget _number(Color accent) {
    final two = playerNumber >= 10;
    final fs = (two ? _numberSizeTwoDigit : _numberSize)[size]!;
    final style = TextStyle(
      fontFamily: 'JetBrainsMono',
      fontWeight: FontWeight.w900,
      fontSize: fs,
      height: two ? 0.85 : 1,
      color: accent.withValues(alpha: avatarUrl == null ? 0.55 : 0.9),
      shadows: const [
        Shadow(color: Color(0xE6000000), blurRadius: 12, offset: Offset(0, 2)),
      ],
    );
    // رقمٌ من خانتين يُكدَّس عمودياً — يبقى مقروءاً عبر الطاولة
    if (two) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final d in '$playerNumber'.split('')) Text(d, style: style),
        ],
      );
    }
    return Text('$playerNumber', style: style);
  }

  Widget _name() {
    final maxLen = _nameMaxLen[size]!;
    final shown = playerName.length > maxLen
        ? '${playerName.substring(0, maxLen)}…'
        : playerName;

    final base = TextStyle(
      fontFamily: 'Amiri',
      fontSize: _nameSize[size]!,
      fontWeight: FontWeight.w900,
      height: 1.1,
      letterSpacing: 0,
      color: Colors.white,
    );

    return NameFxText(
      text: shown,
      fx: _nameFx,
      baseStyle: base,
      animate: animate,
      textAlign: TextAlign.center,
    );
  }
}

/// `emblem-float 3s`: ارتفاع ٠ ⇄ −٤ — وظلٌّ تحته.
class _EmblemFloat extends StatelessWidget {
  const _EmblemFloat(
      {required this.id, required this.size, required this.animate});

  final EmblemId id;
  final double size;
  final bool animate;

  @override
  Widget build(BuildContext context) {
    final emblem = ChipsEmblemView(id: id, size: size, animate: animate);
    // 🔴 `drop-shadow` يتبع **صورة** الشعار، و`BoxShadow` يرسم مستطيلاً
    //    مموّهاً بحجم صندوقه — بقعةٌ سوداء خلف التاج. الظلّ هنا نسخةٌ
    //    مموّهةٌ من الشعار نفسه.
    final child = Stack(children: [
      Transform.translate(
        offset: const Offset(0, 5),
        child: ImageFiltered(
          imageFilter: ui.ImageFilter.blur(sigmaX: 5, sigmaY: 5),
          child: ColorFiltered(
            colorFilter: const ColorFilter.mode(
                Color(0xA6000000), BlendMode.srcATop),
            child: emblem,
          ),
        ),
      ),
      emblem,
    ]);
    if (!animate) return child;
    return FxClock(
      builder: (_, t) {
        final p = (t / 3) % 1.0;
        final tri = p < 0.5 ? p * 2 : (1 - p) * 2;
        final e = tri * tri * (3 - 2 * tri);
        return Transform.translate(offset: Offset(0, -4 * e), child: child);
      },
    );
  }
}
