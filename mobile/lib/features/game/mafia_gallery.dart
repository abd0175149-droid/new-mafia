import 'dart:ui' show ImageFilter;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/security/secret_watermark.dart';
import '../../models/game.dart';
import '../../models/profile.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🕵️ معرض التعرّف على المافيا — «اضغط مع الاستمرار» (2026-11-09)
// ══════════════════════════════════════════════════════
// كان اللاعب يضغط كلّ بطاقة شريكٍ وحدها. الآن زرٌّ واحد مثبَّتٌ أسفل الشاشة:
// ما دام الإبهام عليه يُكشف الفريق كلّه دفعةً واحدة فوقه — شبكةٌ تتّسع للشاشة
// بلا تمرير (الإصبع على الزرّ فلا يستطيع التمرير)، ورفعُ الإصبع يُخفيها.
//
// 🔒 قاعدة التطابق (ملزِمة — اللاعبون كتفاً بكتف):
//    الشاشة والزرّ وعدد الخانات والألوان والتوقيت **واحدةٌ لكلّ الأدوار**.
//    عدد الخانات = عدد المافيا الأحياء المعلَن (الرقم نفسه على كلّ هاتف) — لا
//    طولُ قائمة الفريق، فذاك يختلف بين المافيا والمواطن فيفضح صاحبه.
//    المواطن (والمافيا بلا قائمةٍ من الخادم) يرى الخانات نفسها، وتحت الضغط
//    تقول كلٌّ منها «ملفٌّ مغلق».
//
// 🔒 بلا ضغطٍ: خاناتٌ داكنة فارغة — لا اسم ولا رقم ولا دور في شجرة الويدجت.
//    ويدجتات الهويّة تُبنى **أثناء الضغط وحده**، وتُهدم عند: رفع الإصبع،
//    إلغاء اللمسة، انزلاق الإصبع خارج الزرّ، أو مغادرة التطبيق حالةَ resumed.

const _blood = Color(0xFF8A0303);
const _bloodBg = Color(0xFF1A0505);
const _gold = Color(0xFFC5A059);

/// عددُ الخانات حين لم يصل عدّاد الفرق بعد — ثابتٌ لا يُشتقّ من أيّ معلومةٍ
/// خاصّة، فيبقى متطابقاً على كلّ الهواتف.
const kGalleryFallbackSlots = 3;

/// سقف الخانات — ٤ أعمدة × ٤ صفوف.
const kGalleryMaxSlots = 16;

/// عدد الأعمدة بحسب عدد الخانات: ١–٣ ⇒ ١، ٤–٦ ⇒ ٢، ٧–٩ ⇒ ٣، وما فوق ⇒ ٤.
int galleryColumnsFor(int n) => n <= 3 ? 1 : n <= 6 ? 2 : n <= 9 ? 3 : 4;

/// أيقونات الأدوار — `ROLE_ICONS` حرفياً.
///
/// ⚠️ مفردات آمنة بلا ZWJ: `🧙‍♀️` و`👮‍♀️` تتفكّكان على أندرويد القديم
///    فتظهران رمزين منفصلين.
const roleIcons = <String, String>{
  'GODFATHER': '🔪',
  'SILENCER': '🤐',
  'CHAMELEON': '🦎',
  'WITCH': '🔮',
  'OLDER_BROTHER': '👥',
  'MAFIA_REGULAR': '🎭',
  'SHERIFF': '🔍',
  'DOCTOR': '💉',
  'SNIPER': '🎯',
  'POLICEWOMAN': '👮',
  'NURSE': '🏥',
  'MAYOR': '🎩',
  'PHOENIX': '🔥',
  'CITIZEN': '👤',
  'YOUNGER_BROTHER': '👥',
  'JESTER': '🤡',
  'ASSASSIN': '🔪',
};

String roleIcon(String? id) => roleIcons[id] ?? '🎭';

/// يفتح المعرض. الحاجز والدخول مطابقان للويب: تلاشٍ + `scale .95→1` مع
/// إزاحةٍ رأسيّة 20px.
Future<void> showMafiaGallery(
  BuildContext context, {
  required List<MafiaMate> team,
  MafiaMate? self,
  int? mafiaAlive,
  SiblingInfo? sibling,
  bool isAssassin = false,
  AssassinContracts? contracts,
  String? watermark,
  bool Function()? onRevealStart,
}) =>
    showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'إغلاق',
      barrierColor: const Color(0xCC000000),
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (_, __, ___) => MafiaTeamGallery(
        team: team,
        self: self,
        mafiaAlive: mafiaAlive,
        sibling: sibling,
        isAssassin: isAssassin,
        contracts: contracts,
        watermark: watermark,
        onRevealStart: onRevealStart,
      ),
      transitionBuilder: (_, a, __, child) {
        final c = CurvedAnimation(parent: a, curve: Curves.easeOutCubic);
        return FadeTransition(
          opacity: c,
          child: SlideTransition(
            position: Tween(begin: const Offset(0, 0.05), end: Offset.zero)
                .animate(c),
            child: ScaleTransition(
                scale: Tween(begin: 0.95, end: 1.0).animate(c), child: child),
          ),
        );
      },
    );

class MafiaTeamGallery extends StatefulWidget {
  const MafiaTeamGallery({
    super.key,
    this.team = const [],
    this.self,
    this.mafiaAlive,
    this.sibling,
    this.isAssassin = false,
    this.contracts,
    this.watermark,
    this.onRevealStart,
  });

  /// الشركاء كما أرسلهم الخادم (بلا صاحب الهاتف).
  final List<MafiaMate> team;

  /// صاحب الهاتف — خانته تقول «أنت» بالذهبيّ. لا تُرسم إلّا مع فريقٍ غير
  /// فارغ: «أنت» ذهبيّةٌ عند مافيا بلا قائمة لن تظهر عند مواطن ⇒ تسريب.
  final MafiaMate? self;

  /// عدد المافيا الأحياء المعلَن (عدّاد الفرق العامّ) — مصدر عدد الخانات.
  final int? mafiaAlive;

  final SiblingInfo? sibling;
  final bool isAssassin;
  final AssassinContracts? contracts;

  /// 💧 وسمُ العلامة المائيّة — يفضح مسرّب أيّ لقطة (null = بلا وسم).
  final String? watermark;

  /// يُنادى عند **بداية كلّ ضغطة** (إنذار الليدر). `false` ⇒ لا كشف
  /// (لاعبٌ أُقصي والمعرض مفتوح).
  final bool Function()? onRevealStart;

  @override
  State<MafiaTeamGallery> createState() => _MafiaTeamGalleryState();
}

class _MafiaTeamGalleryState extends State<MafiaTeamGallery>
    with WidgetsBindingObserver {
  final _buttonKey = GlobalKey();

  /// معرّف الإصبع الضاغط — null ⇒ مُخفى. إصبعٌ ثانٍ لا يُحتسب.
  int? _pointer;
  bool get _revealed => _pointer != null;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // paused / inactive / hidden / detached — كلّها تُخفي
    if (state != AppLifecycleState.resumed) _release();
  }

  int get _slotCount =>
      (widget.mafiaAlive ?? kGalleryFallbackSlots).clamp(1, kGalleryMaxSlots);

  /// الهويّات بترتيب المقاعد، مقصوصةً على عدد الخانات. فريقٌ فارغ ⇒ لا شيء
  /// (فكلّ الخانات «ملفٌّ مغلق»).
  List<(MafiaMate, bool)> _identities() {
    if (widget.team.isEmpty) return const [];
    final self = widget.self;
    final all = <(MafiaMate, bool)>[
      if (self != null) (self, true),
      for (final m in widget.team)
        if (self == null || m.physicalId != self.physicalId) (m, false),
    ]..sort((a, b) => a.$1.physicalId.compareTo(b.$1.physicalId));
    return all.take(_slotCount).toList(growable: false);
  }

  void _down(PointerDownEvent e) {
    if (_pointer != null) return;
    // 🔔 إنذار الليدر مع كلّ ضغطة — قبل الكشف، كما كان مع الفتح
    final ok = widget.onRevealStart?.call() ?? true;
    if (!ok || !mounted) return;
    setState(() => _pointer = e.pointer);
  }

  void _move(PointerMoveEvent e) {
    if (e.pointer != _pointer) return;
    final size = _buttonKey.currentContext?.size;
    if (size == null || !(Offset.zero & size).contains(e.localPosition)) {
      _release();
    }
  }

  void _end(PointerEvent e) {
    if (e.pointer == _pointer) _release();
  }

  void _release() {
    if (_pointer == null || !mounted) return;
    setState(() => _pointer = null);
  }

  Widget _wm(Widget child) {
    final w = widget.watermark;
    return (w == null || w.isEmpty)
        ? child
        : SecretWatermark(label: w, child: child);
  }

  @override
  Widget build(BuildContext context) {
    // ⚠️ `showGeneralDialog` لا يوفّر Material — بدونه يُرسم كلّ نصٍّ
    //    بخطٍّ أصفر تحته (ديباغ الويدجت الحرّ).
    return Material(
      type: MaterialType.transparency,
      child: Directionality(
        textDirection: TextDirection.rtl,
        child: Stack(children: [
          // الحاجز: ضبابٌ + نقرةٌ تُغلق
          Positioned.fill(
            child: GestureDetector(
              onTap: () => Navigator.of(context).maybePop(),
              behavior: HitTestBehavior.opaque,
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                child: const ColoredBox(color: Color(0x66000000)),
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: _blood.withValues(alpha: 0.4)),
                      gradient: const LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Color(0xFF120404), Color(0xFF050101)],
                      ),
                      boxShadow: [
                        BoxShadow(
                            color: _blood.withValues(alpha: 0.25),
                            blurRadius: 24),
                      ],
                    ),
                    child: Column(children: [
                      _Header(
                        mafiaAlive: widget.mafiaAlive,
                        onClose: () => Navigator.of(context).maybePop(),
                      ),
                      const SizedBox(height: 10),
                      // الشبكة فوق الزرّ — اليد لا تغطّي شيئاً
                      Expanded(
                        child: _wm(_RevealArea(
                          revealed: _revealed,
                          slotCount: _slotCount,
                          identities: _revealed ? _identities() : const [],
                          sibling: _revealed ? widget.sibling : null,
                          contracts: _revealed && widget.isAssassin
                              ? widget.contracts
                              : null,
                        )),
                      ),
                      const SizedBox(height: 12),
                      _HoldButton(
                        listenerKey: _buttonKey,
                        pressed: _revealed,
                        onDown: _down,
                        onMove: _move,
                        onUp: _end,
                        onCancel: _end,
                      ),
                    ]),
                  ),
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════
// الترويسة — واحدةٌ لكلّ الأدوار
// ══════════════════════════════════════════════════════
class _Header extends StatelessWidget {
  const _Header({required this.mafiaAlive, required this.onClose});
  final int? mafiaAlive;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) => Row(children: [
        // زرّ الإغلاق (44px) — أوّل الصفّ ⇒ يمين الشاشة
        Material(
          color: _bloodBg,
          shape: CircleBorder(
              side: BorderSide(color: _blood.withValues(alpha: 0.5))),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onClose,
            child: const SizedBox(
              width: 44,
              height: 44,
              child: Icon(Icons.close, size: 24, color: _blood),
            ),
          ),
        ),
        Expanded(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('الملفّات السرّيّة',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: 'Amiri',
                  fontSize: 19,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFFEF4444),
                  letterSpacing: 0,
                  height: 1.3,
                )),
            if (mafiaAlive != null)
              Text('المافيا في اللعبة: $mafiaAlive',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ar(11,
                      color: const Color(0xFFEF4444).withValues(alpha: 0.55))),
          ]),
        ),
        const SizedBox(width: 44), // توازنٌ مع زرّ الإغلاق
      ]);
}

// ══════════════════════════════════════════════════════
// منطقة الكشف — شبكةٌ تملأ ما تبقّى من الارتفاع، بلا تمرير
// ══════════════════════════════════════════════════════
class _RevealArea extends StatelessWidget {
  const _RevealArea({
    required this.revealed,
    required this.slotCount,
    required this.identities,
    this.sibling,
    this.contracts,
  });

  final bool revealed;
  final int slotCount;
  final List<(MafiaMate, bool)> identities;
  final SiblingInfo? sibling;
  final AssassinContracts? contracts;

  @override
  Widget build(BuildContext context) {
    final grid = _SlotGrid(
      count: slotCount,
      builder: (i) => _Slot(
        key: ValueKey('gallery-slot-$i'),
        revealed: revealed,
        mate: i < identities.length ? identities[i].$1 : null,
        isSelf: i < identities.length && identities[i].$2,
      ),
    );
    if (!revealed) return grid;

    return LayoutBuilder(builder: (context, c) {
      // كلّ لوحةٍ إضافيّة تُصغَّر لتتّسع (scaleDown) — لا تمرير أبداً
      Widget fitted(Widget child, {double? maxHeight}) {
        final box = FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.topCenter,
          child: SizedBox(width: c.maxWidth, child: child),
        );
        return maxHeight == null
            ? box
            : ConstrainedBox(
                constraints: BoxConstraints(maxHeight: maxHeight), child: box);
      }

      final sib = sibling;
      final con = contracts;
      return Column(children: [
        if (sib != null) ...[
          fitted(_BloodLink(sibling: sib), maxHeight: c.maxHeight * 0.36),
          const SizedBox(height: 8),
        ],
        // السفّاح: عقوده مكان الشبكة — كما كانت مكان شبكة الشركاء
        Expanded(child: con != null ? fitted(_AssassinView(contracts: con)) : grid),
      ]);
    });
  }
}

/// N خانةً بالضبط: أعمدةٌ بحسب N، وصفوفٌ تتقاسم الارتفاع بالتساوي.
class _SlotGrid extends StatelessWidget {
  const _SlotGrid({required this.count, required this.builder});
  final int count;
  final Widget Function(int i) builder;

  static const _gap = 8.0;

  @override
  Widget build(BuildContext context) {
    final cols = galleryColumnsFor(count);
    final rows = (count + cols - 1) ~/ cols;
    return Column(children: [
      for (var r = 0; r < rows; r++) ...[
        if (r > 0) const SizedBox(height: _gap),
        Expanded(
          child: Row(children: [
            for (var col = 0; col < cols; col++) ...[
              if (col > 0) const SizedBox(width: _gap),
              Expanded(
                child: r * cols + col < count
                    ? builder(r * cols + col)
                    : const SizedBox.shrink(),
              ),
            ],
          ]),
        ),
      ],
    ]);
  }
}

/// خانةٌ واحدة. الإطار نفسه في كلّ الحالات؛ المحتوى وحده يتبدّل.
class _Slot extends StatelessWidget {
  const _Slot({
    super.key,
    required this.revealed,
    this.mate,
    this.isSelf = false,
  });

  final bool revealed;
  final MafiaMate? mate;
  final bool isSelf;

  @override
  Widget build(BuildContext context) {
    final m = mate;
    final selfLit = revealed && m != null && isSelf;
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: selfLit
                ? _gold.withValues(alpha: 0.6)
                : _blood.withValues(alpha: 0.28)),
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF140707), Color(0xFF0A0202)],
        ),
      ),
      child: !revealed
          // بلا ضغط: نقطةٌ خافتة — ولا شيء غيرها في الشجرة
          ? Center(
              child: Container(
                width: 4,
                height: 4,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: Color(0x1FFFFFFF),
                ),
              ),
            )
          : LayoutBuilder(builder: (context, c) {
              final wide = c.maxHeight > 0 && c.maxWidth / c.maxHeight > 1.6;
              final design = wide ? const Size(240, 96) : const Size(100, 130);
              final body = m == null
                  ? _ClosedFile(wide: wide)
                  : _Identity(mate: m, isSelf: isSelf, wide: wide);
              // المحتوى يُصمَّم بمقاسٍ ثابت ثمّ يُحجَّم للخانة — يتقلّص في ٩
              // خانات ولا يتضخّم بلا حدّ في خانةٍ واحدة (سقف ×٢)
              return Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: design.width * 2,
                    maxHeight: design.height * 2,
                  ),
                  child: FittedBox(
                    fit: BoxFit.contain,
                    child: SizedBox.fromSize(size: design, child: body),
                  ),
                ),
              );
            }),
    );
  }
}

class _Identity extends StatelessWidget {
  const _Identity({required this.mate, required this.isSelf, required this.wide});
  final MafiaMate mate;
  final bool isSelf;
  final bool wide;

  @override
  Widget build(BuildContext context) {
    final ring = isSelf ? _gold : _blood.withValues(alpha: 0.7);
    final seatColor = isSelf ? _gold : Colors.white;
    final nameText = isSelf ? 'أنت' : mate.name;
    final nameColor = isSelf ? _gold : Colors.white;
    const roleColor = Color(0xD9F87171);

    Widget seat(double size) => Text('${mate.physicalId}',
        maxLines: 1,
        textDirection: TextDirection.ltr,
        style: mono(size, weight: FontWeight.w900, color: seatColor)
            .copyWith(height: 1.15));
    Widget name(double size) => Text(nameText,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        textAlign: wide ? TextAlign.start : TextAlign.center,
        style: ar(size, weight: FontWeight.bold, color: nameColor, height: 1.2));
    Widget role(double size) => Text(roleNameAr(mate.role),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        textAlign: wide ? TextAlign.start : TextAlign.center,
        style: ar(size, color: roleColor, height: 1.2));

    if (wide) {
      return Row(children: [
        _SlotAvatar(url: mate.avatarUrl, role: mate.role, size: 72, ring: ring),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [seat(26), name(16), const SizedBox(height: 2), role(13)],
          ),
        ),
      ]);
    }
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _SlotAvatar(url: mate.avatarUrl, role: mate.role, size: 52, ring: ring),
        const SizedBox(height: 4),
        seat(22),
        name(13),
        const SizedBox(height: 2),
        role(11),
      ],
    );
  }
}

class _ClosedFile extends StatelessWidget {
  const _ClosedFile({required this.wide});
  final bool wide;

  @override
  Widget build(BuildContext context) {
    final icon = Icon(Icons.lock_outline,
        size: wide ? 34 : 30, color: _blood.withValues(alpha: 0.85));
    final label = Text('ملفٌّ مغلق',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: ar(wide ? 16 : 13,
            weight: FontWeight.bold,
            color: Colors.white.withValues(alpha: 0.45)));
    return wide
        ? Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            icon,
            const SizedBox(width: 12),
            Flexible(child: label),
          ])
        : Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            icon,
            const SizedBox(height: 8),
            label,
          ]);
  }
}

/// أفاتار دائريّ بحلقة — بلا شارة مقعد (الرقم يُكتب كبيراً تحته).
class _SlotAvatar extends StatelessWidget {
  const _SlotAvatar({
    required this.url,
    required this.role,
    required this.size,
    required this.ring,
  });

  final String? url;
  final String role;
  final double size;
  final Color ring;

  @override
  Widget build(BuildContext context) {
    final fallback = Text(roleIcon(role), style: TextStyle(fontSize: size * 0.42));
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFF0D0202),
        border: Border.all(color: ring, width: 2),
      ),
      clipBehavior: Clip.antiAlias,
      child: (url == null || url!.isEmpty)
          ? fallback
          : CachedNetworkImage(
              imageUrl: ApiClient.instance.upload(url),
              width: size,
              height: size,
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) => fallback,
              placeholder: (_, __) => const ColoredBox(color: Color(0xFF0D0202)),
            ),
    );
  }
}

// ══════════════════════════════════════════════════════
// زرّ «اضغط مع الاستمرار» — مثبَّتٌ أسفل الشاشة، تحت الإبهام
// ══════════════════════════════════════════════════════
// `Listener` لا `GestureDetector`: لا ساحة إيماءات ولا مهلة ضغطٍ طويل — الكشف
// يبدأ مع ملامسة الإصبع ويتوقّف مع رفعه، بالتوقيت نفسه لكلّ الأدوار.
class _HoldButton extends StatelessWidget {
  const _HoldButton({
    required this.listenerKey,
    required this.pressed,
    required this.onDown,
    required this.onMove,
    required this.onUp,
    required this.onCancel,
  });

  final Key listenerKey;
  final bool pressed;
  final PointerDownEventListener onDown;
  final PointerMoveEventListener onMove;
  final PointerUpEventListener onUp;
  final PointerCancelEventListener onCancel;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: 'اضغط مع الاستمرار لكشف الفريق',
        child: Listener(
          key: listenerKey,
          behavior: HitTestBehavior.opaque,
          onPointerDown: onDown,
          onPointerMove: onMove,
          onPointerUp: onUp,
          onPointerCancel: onCancel,
          child: Container(
            key: const ValueKey('gallery-hold-button'),
            width: double.infinity,
            height: 76,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                  color: _gold.withValues(alpha: pressed ? 0.8 : 0.45),
                  width: 1.5),
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: pressed
                    ? const [Color(0xFFB00808), _blood]
                    : const [_blood, Color(0xFF4A0202)],
              ),
              boxShadow: [
                BoxShadow(
                    color: _blood.withValues(alpha: pressed ? 0.6 : 0.35),
                    blurRadius: pressed ? 22 : 14),
              ],
            ),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Icon(Icons.fingerprint, size: 30, color: _gold),
              const SizedBox(width: 10),
              Flexible(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('اضغط مع الاستمرار لكشف الفريق',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ar(15, weight: FontWeight.bold, height: 1.3)),
                    Text('ارفع إصبعك فيُخفى',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ar(11,
                            color: Colors.white.withValues(alpha: 0.65),
                            height: 1.3)),
                  ],
                ),
              ),
            ]),
          ),
        ),
      );
}

// ══════════════════════════════════════════════════════
// ① لوحة «رابط الدم»
// ══════════════════════════════════════════════════════
class _BloodLink extends StatelessWidget {
  const _BloodLink({required this.sibling});
  final SiblingInfo sibling;

  static const _purple = Color(0xFFA855F7);

  @override
  Widget build(BuildContext context) {
    final dead = !sibling.isAlive;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _purple.withValues(alpha: 0.4)),
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF1A0820), Color(0xFF0D0212)],
        ),
        boxShadow: [
          BoxShadow(
              color: const Color(0xFF7C3AED).withValues(alpha: 0.25),
              blurRadius: 20),
        ],
      ),
      child: Column(children: [
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Text('🩸', style: TextStyle(fontSize: 18)),
          const SizedBox(width: 8),
          Text('رابط الدم',
              style: const TextStyle(
                fontFamily: 'Amiri',
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Color(0xFFD8B4FE),
                letterSpacing: 0,
              )),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          _Avatar(
            url: sibling.avatarUrl,
            role: sibling.role,
            physicalId: sibling.physicalId,
            size: 64,
            ring: _purple.withValues(alpha: 0.6),
            badge: const Color(0xFF9333EA),
            badgeSize: 24,
            badgeFont: 10,
            grayscale: dead,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(sibling.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ar(14, weight: FontWeight.bold)),
                const SizedBox(height: 2),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(999),
                    color: _purple.withValues(alpha: 0.1),
                    border:
                        Border.all(color: _purple.withValues(alpha: 0.3)),
                  ),
                  child: Text(
                      roleNameAr(sibling.role) + (dead ? ' (متوفّى)' : ''),
                      style: mono(11, color: const Color(0xFFD8B4FE))),
                ),
              ],
            ),
          ),
        ]),
        const SizedBox(height: 12),
        Text(
          sibling.recipientIsMafia
              ? 'هذا أخوك الأصغر (مواطن) — لا يعرفه باقي المافيا. إن قُتل، تنتحر حزناً عليه.'
              : 'هذا أخوك الأكبر (من المافيا) — يربطكما رابط الدم. إن قُتل، تنهض وتنضمّ إلى المافيا.',
          textAlign: TextAlign.center,
          style: ar(11,
              color: const Color(0xFFE9D5FF).withValues(alpha: 0.7),
              height: 1.6),
        ),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════
// ② واجهة السفّاح — عقود الاغتيال
// ══════════════════════════════════════════════════════
class _AssassinView extends StatelessWidget {
  const _AssassinView({required this.contracts});
  final AssassinContracts contracts;

  @override
  Widget build(BuildContext context) => Column(children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: _bloodBg,
            border: Border.all(color: _blood),
            boxShadow: [
              BoxShadow(color: _blood.withValues(alpha: 0.5), blurRadius: 15),
            ],
          ),
          child: const Icon(Icons.gps_fixed, size: 24, color: _blood),
        ),
        const SizedBox(height: 8),
        Text('عقود الاغتيال',
            style: const TextStyle(
              fontFamily: 'Amiri',
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Color(0xFFEF4444),
              letterSpacing: 3,
            )),
        const SizedBox(height: 4),
        Text('${contracts.completedCount}/${contracts.totalRequired} عقود مُنجزة',
            style: mono(12,
                color: const Color(0xFFEF4444).withValues(alpha: 0.6))),
        const SizedBox(height: 20),
        // شريط التقدّم — يتحرّك من الصفر إلى نسبته في 800ms
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: Container(
              height: 8,
              decoration: BoxDecoration(
                color: _bloodBg,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: _blood.withValues(alpha: 0.2)),
              ),
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: contracts.progress),
                duration: const Duration(milliseconds: 800),
                curve: Curves.easeOut,
                builder: (_, v, __) => FractionallySizedBox(
                  alignment: AlignmentDirectional.centerStart,
                  widthFactor: v,
                  heightFactor: 1,
                  child: Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                          colors: [Color(0xFF8A0303), Color(0xFFDC2626)]),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 20),
        for (final c in contracts.contracts) _Contract(contract: c),
      ]);
}

class _Contract extends StatelessWidget {
  const _Contract({required this.contract});
  final AssassinContract contract;

  @override
  Widget build(BuildContext context) {
    final done = contract.completed;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: done
                ? const Color(0xFF22C55E).withValues(alpha: 0.3)
                : _blood.withValues(alpha: 0.6),
            width: 2),
        gradient: LinearGradient(
          begin: AlignmentDirectional.centerStart,
          end: AlignmentDirectional.centerEnd,
          colors: done
              ? [
                  const Color(0xFF052E16).withValues(alpha: 0.3),
                  const Color(0xFF052E16).withValues(alpha: 0.1),
                ]
              : [_bloodBg, const Color(0xFF0D0202)],
        ),
        boxShadow: done
            ? null
            : [BoxShadow(color: _blood.withValues(alpha: 0.3), blurRadius: 20)],
      ),
      child: Row(children: [
        Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: done
                ? const Color(0xFF22C55E).withValues(alpha: 0.2)
                : _blood.withValues(alpha: 0.2),
            border: Border.all(
                color: done
                    ? const Color(0xFF22C55E).withValues(alpha: 0.5)
                    : _blood,
                width: done ? 1 : 2),
          ),
          child: done
              ? const Text('✅', style: TextStyle(fontSize: 14))
              : const _PulsingKnife(),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(contract.text,
                  style: ar(14,
                          weight: FontWeight.bold,
                          color: done ? const Color(0xFF4ADE80) : Colors.white)
                      .copyWith(
                    decoration: done ? TextDecoration.lineThrough : null,
                    decorationColor: const Color(0xFF4ADE80),
                  )),
              if (done && contract.completedAtRound != null) ...[
                const SizedBox(height: 2),
                Text('أُنجز في الجولة ${contract.completedAtRound}',
                    style: mono(10,
                        color:
                            const Color(0xFF22C55E).withValues(alpha: 0.6))),
              ] else if (!done) ...[
                const SizedBox(height: 2),
                Text('اقتل صاحب هذا الدور!',
                    style: mono(10,
                        color:
                            const Color(0xFFF87171).withValues(alpha: 0.6))),
              ],
            ],
          ),
        ),
      ]),
    );
  }
}

/// سكّينٌ نابضة — `scale [1, 1.2, 1]` كلّ 1.5s بلا انقطاع.
class _PulsingKnife extends StatefulWidget {
  const _PulsingKnife();
  @override
  State<_PulsingKnife> createState() => _PulsingKnifeState();
}

class _PulsingKnifeState extends State<_PulsingKnife>
    with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1500))
    ..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // «تقليل الحركة» يُطفئ النبض — لا يُخفي السكّين
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      return const Text('🔪', style: TextStyle(fontSize: 14));
    }
    return ScaleTransition(
      scale: Tween(begin: 1.0, end: 1.2)
          .animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut)),
      child: const Text('🔪', style: TextStyle(fontSize: 14)),
    );
  }
}

// ══════════════════════════════════════════════════════
// 🖼️ أفاتار بشارة مقعد
// ══════════════════════════════════════════════════════
class _Avatar extends StatelessWidget {
  const _Avatar({
    required this.url,
    required this.role,
    required this.physicalId,
    required this.size,
    required this.ring,
    required this.badge,
    required this.badgeSize,
    required this.badgeFont,
    this.grayscale = false,
  });

  final String? url;
  final String role;
  final int physicalId;
  final double size;
  final Color ring;
  final Color badge;
  final double badgeSize;
  final double badgeFont;
  final bool grayscale;

  @override
  Widget build(BuildContext context) {
    Widget inner = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFF0D0202),
        border: Border.all(color: ring, width: 2),
        boxShadow: [
          BoxShadow(color: _blood.withValues(alpha: 0.3), blurRadius: 10),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: (url == null || url!.isEmpty)
          ? Text(roleIcon(role), style: TextStyle(fontSize: size * 0.42))
          : CachedNetworkImage(
              imageUrl: ApiClient.instance.upload(url),
              width: size,
              height: size,
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) =>
                  Text(roleIcon(role), style: TextStyle(fontSize: size * 0.42)),
              placeholder: (_, __) =>
                  const ColoredBox(color: Color(0xFF0D0202)),
            ),
    );

    if (grayscale) {
      // ميتٌ: رماديّ كامل + خفوت — كما `grayscale opacity-60`
      inner = Opacity(
        opacity: 0.6,
        child: ColorFiltered(
          colorFilter: const ColorFilter.matrix(<double>[
            0.2126, 0.7152, 0.0722, 0, 0, //
            0.2126, 0.7152, 0.0722, 0, 0, //
            0.2126, 0.7152, 0.0722, 0, 0, //
            0, 0, 0, 1, 0, //
          ]),
          child: inner,
        ),
      );
    }

    // الشارة تفيض على الحافة عمداً (`-top-1 -right-1`) — لذا `Clip.none`.
    // الحشوة العلوية في الحاوية تمنع قصّها.
    return Stack(clipBehavior: Clip.none, children: [
      inner,
      Positioned(
        top: -4,
        right: -4,
        child: Container(
          width: badgeSize,
          height: badgeSize,
          alignment: Alignment.center,
          decoration: BoxDecoration(shape: BoxShape.circle, color: badge),
          child: Text('$physicalId',
              style: mono(badgeFont, weight: FontWeight.w900)),
        ),
      ),
    ]);
  }
}
