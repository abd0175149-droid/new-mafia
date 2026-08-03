import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../models/card_fx.dart';
import '../../models/card_template.dart';
import '../../models/store.dart';
import '../../models/title_plaque.dart' show kPlaqueBaseMarginTop;
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

enum CardSize { sm, lg }

/// المقاسات الحقيقية: `w-44 h-[15rem]` و`w-64 h-[22rem]`.
const _cardBox = <CardSize, Size>{
  CardSize.sm: Size(176, 240),
  CardSize.lg: Size(256, 352),
};

const _emblemSize = <CardSize, double>{CardSize.sm: 40, CardSize.lg: 72};
const _nameSize = <CardSize, double>{CardSize.sm: 16, CardSize.lg: 24};
const _numberSize = <CardSize, double>{CardSize.sm: 64, CardSize.lg: 112};
const _numberSizeTwoDigit = <CardSize, double>{CardSize.sm: 51.2, CardSize.lg: 88};
const _nameMaxLen = <CardSize, int>{CardSize.sm: 10, CardSize.lg: 18};

/// ذهبيّ الهوية — لون الرقم حين لا يحمل القالب لوناً.
const _goldSolid = Color(0xFFC5A059);
const _violet = Color(0xFFD8B4FE);

class MafiaCardView extends StatelessWidget {
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

  Size get box => _cardBox[size]!;

  FxChannels get _fx {
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
  Widget build(BuildContext context) {
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
            decoration: BoxDecoration(
              color: Colors.black,
              gradient: template.bodyGradient,
              borderRadius: BorderRadius.circular(kCardRadius),
              border: Border.all(color: template.border, width: 2),
              boxShadow:
                  template.glow == null ? null : [template.glow!],
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(children: [
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
          ),
        ),

        // ── أشكال الغلاف من القالب (تحت الرقم وفوق الصورة) ──
        for (final sh in template.coverShapes) _shape(sh),

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

  double get _scale => size == CardSize.lg ? 1.4 : 1.0;

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
    final child = DecoratedBox(
      decoration: const BoxDecoration(
        boxShadow: [
          BoxShadow(
              color: Color(0xA6000000), blurRadius: 10, offset: Offset(0, 5)),
        ],
      ),
      child: ChipsEmblemView(id: id, size: size, animate: animate),
    );
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
