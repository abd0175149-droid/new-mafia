import 'dart:math' as math;

import 'package:flutter/material.dart';

// ══════════════════════════════════════════════════════
// 🕴️ ختم الدون — نظير `frontend/src/components/DonSeal.tsx` حرفيّاً
// ══════════════════════════════════════════════════════
// شعار النادي كما هو (بلا تثخينٍ ولا إعادة رسم) مصبوغاً بذهبٍ واحد عبر
// `srcIn` — تُقرأ قناة ألفا وحدها — داخل إطارٍ مرسوم: حلقةٌ صلبة ثمّ
// حبّاتٌ مستديرة ثمّ خيطٌ رفيع.
//
// 🔴 الإطار يُرسم ولا يُصوَّر: يبقى حادّاً عند أيّ حجم. والنقش يبقى صورةً
//    أصليّة، فدون ٤٠ بكسلاً تخفت أدقّ خطوطه — الإطار وحده يقول «ختم»
//    عندها، وهو كافٍ في صفٍّ من خمسة.

const Color kSealGold = Color(0xFFE8C978);
const Color kSealBrass = Color(0xFFC9A45C);
const Color kSealBrassHi = Color(0xFFEBD6A4);
const String kSealMarkAsset = 'assets/icon/seal_mark.png';

// ── أرضيّة البطاقة العنّابيّة ──
const Color kCardBurgundy = Color(0xFF4D1821);
const Color kCardBurgundyLift = Color(0xFF5E1F2A);
const Color kCardBurgundyShade = Color(0xFF310F16);
const Color kCardCream = Color(0xFFF6E7D6);
const Color kCardMuted = Color(0xFFB79295);
const Color kCardBody = Color(0xFFF0E2E2);
const Color kCardFaint = Color(0xFF9C8285);

/// قرص شمعٍ أسودَ مذهَّب منقوشٌ بالشعار.
/// [tiltDeg] ميلٌ بالدرجات — الشمع لا يُضغط مرّتين بالزاوية نفسها.
class DonSeal extends StatelessWidget {
  const DonSeal({super.key, this.size = 52, this.tiltDeg = 0});

  final double size;
  final double tiltDeg;

  @override
  Widget build(BuildContext context) {
    // إزاحة البروز تكبر نسبيّاً كلّما صغر القرص، وإلّا اختفى النقش الصغير
    final rx = 0.3 + size * 0.005;
    final ry = rx * 1.12;
    final mark = size * 0.68;

    final seal = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const RadialGradient(
          center: Alignment(-0.28, -0.48),
          radius: 0.95,
          colors: [Color(0xFF3E3539), Color(0xFF1E1B1D), Color(0xFF0A090A)],
          stops: [0.0, 0.52, 0.84],
        ),
        border: Border.all(
            color: const Color(0x66C9A45C), width: math.max(1.0, size * 0.035)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xCC000000),
            blurRadius: size * 0.22,
            offset: Offset(0, size * 0.08),
          ),
        ],
      ),
      child: Stack(children: [
        Positioned.fill(child: CustomPaint(painter: _RimPainter(rx: rx, ry: ry))),
        Center(
          child: SizedBox(
            width: mark,
            height: mark,
            child: Stack(children: [
              // ظلٌّ أسفل يمين ثمّ ضوءٌ أعلى يسار ثمّ الذهب — البروز نفسه في الويب
              Transform.translate(
                  offset: Offset(rx, ry), child: _mark(const Color(0xCC000000))),
              Transform.translate(
                  offset: Offset(-rx * 0.75, -ry * 0.75),
                  child: _mark(const Color(0x2BFFFFFF))),
              _mark(kSealGold),
            ]),
          ),
        ),
        // لمعة الشمع
        Positioned.fill(
          child: DecoratedBox(
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                center: Alignment(-0.36, -0.56),
                radius: 0.62,
                colors: [Color(0x3DFFFFFF), Color(0x00FFFFFF)],
              ),
            ),
          ),
        ),
      ]),
    );

    if (tiltDeg == 0) return seal;
    return Transform.rotate(angle: tiltDeg * math.pi / 180, child: seal);
  }

  Widget _mark(Color c) => ColorFiltered(
        colorFilter: ColorFilter.mode(c, BlendMode.srcIn),
        child: Image.asset(kSealMarkAsset, fit: BoxFit.contain),
      );
}

/// الإطار: حلقةٌ صلبة (r=45.2%) ثمّ ٣٧ حبّة (r=40%) ثمّ خيطٌ رفيع (r=35.2%)،
/// كلّها مرسومةٌ ثلاث مرّات: ظلّ، ضوء، ثمّ ذهب.
class _RimPainter extends CustomPainter {
  const _RimPainter({required this.rx, required this.ry});

  final double rx, ry;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final u = size.width / 100; // وحدة الرسم الأصليّة (صندوق ١٠٠×١٠٠)

    void layer(Offset shift, Color color) {
      final ring = Paint()
        ..style = PaintingStyle.stroke
        ..color = color
        ..strokeWidth = 2.6 * u;
      final hair = Paint()
        ..style = PaintingStyle.stroke
        ..color = color.withValues(alpha: color.a * 0.75)
        ..strokeWidth = math.max(0.6, 1.0 * u);
      final bead = Paint()..color = color;
      final o = c + shift;
      canvas.drawCircle(o, 45.2 * u, ring);
      canvas.drawCircle(o, 35.2 * u, hair);
      const n = 37;
      for (var i = 0; i < n; i++) {
        final a = (i / n) * 2 * math.pi;
        canvas.drawCircle(
          o + Offset(math.cos(a) * 40 * u, math.sin(a) * 40 * u),
          math.max(0.5, 1.0 * u),
          bead,
        );
      }
    }

    layer(Offset(rx, ry), const Color(0xBF000000));
    layer(Offset(-rx * 0.7, -ry * 0.7), const Color(0x26FFFFFF));
    layer(Offset.zero, const Color(0xD9E8C978));
  }

  @override
  bool shouldRepaint(_RimPainter old) => old.rx != rx || old.ry != ry;
}

/// ميلٌ ثابتٌ لكلّ خانة — لا يتغيّر بإعادة البناء.
double sealTilt(int i) =>
    const [-7.0, 5.0, -4.0, 6.0, -5.0, 3.0, -6.0, 4.0][i % 8];

// ══════════════════════════════════════════════════════
// 🃏 أرضيّة البطاقة — نظير `.don-card` في الويب
// ══════════════════════════════════════════════════════
/// عنّابيٌّ بنسيجٍ مائلٍ خفيف وإطارٍ نحاسيٍّ داخليّ. النسيج ليس زخرفة:
/// العنّابيّ المسطّح يقرأ رقميّاً، والخطوط تعيده قماشاً.
class DonCard extends StatelessWidget {
  const DonCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.mini = false,
    this.onTap,
  });

  final Widget child;
  final EdgeInsets padding;
  final bool mini;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final radius = mini ? 16.0 : 20.0;
    final inset = mini ? 5.0 : 7.0;
    final card = Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: const Color(0xFF5C2029)),
        gradient: const LinearGradient(
          begin: Alignment(0.6, -1),
          end: Alignment(-0.2, 1),
          colors: [
            kCardBurgundyLift,
            kCardBurgundy,
            Color(0xFF451520),
            kCardBurgundyShade,
          ],
          stops: [0.0, 0.22, 0.6, 1.0],
        ),
        boxShadow: const [
          BoxShadow(color: Color(0x8A000000), blurRadius: 26, offset: Offset(0, 12)),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius - 1),
        child: Stack(children: [
          Positioned.fill(child: CustomPaint(painter: const _WeavePainter())),
          Positioned.fill(
            child: Padding(
              padding: EdgeInsets.all(inset),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(radius - inset),
                  border: Border.all(color: const Color(0x57C9A45C), width: 1.5),
                ),
              ),
            ),
          ),
          Padding(padding: padding, child: child),
        ]),
      ),
    );
    if (onTap == null) return card;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: card,
    );
  }
}

class _WeavePainter extends CustomPainter {
  const _WeavePainter();

  @override
  void paint(Canvas canvas, Size size) {
    final light = Paint()
      ..color = const Color(0x09FFFFFF)
      ..strokeWidth = 1;
    final dark = Paint()
      ..color = const Color(0x0F000000)
      ..strokeWidth = 1;
    final span = size.width + size.height;
    for (var x = -size.height; x < span; x += 4) {
      canvas.drawLine(Offset(x, 0), Offset(x + size.height, size.height), light);
      canvas.drawLine(Offset(x, size.height), Offset(x + size.height, 0), dark);
    }
  }

  @override
  bool shouldRepaint(_WeavePainter old) => false;
}

/// حبّة المكافأة/المهلة — إطارٌ نحاسيّ على سوادٍ شفّاف
class DonChip extends StatelessWidget {
  const DonChip({super.key, required this.text, this.color = const Color(0xFFD4B77E), this.fontSize = 10.5});

  final String text;
  final Color color;
  final double fontSize;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(99),
          color: const Color(0x3D000000),
          border: Border.all(color: const Color(0x57C9A45C)),
        ),
        child: Text(
          text,
          style: TextStyle(
            fontFamily: 'Tajawal',
            fontSize: fontSize,
            fontWeight: FontWeight.w600,
            color: color,
            letterSpacing: 0,
          ),
        ),
      );
}

/// زرّ البطاقة الرئيسيّ — نحاسٌ مصقول على خلفيّةٍ عنّابيّة
class DonButton extends StatelessWidget {
  const DonButton({super.key, required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 11),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0x8CC9A45C)),
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [kSealBrassHi, kSealBrass, Color(0xFFA8823E)],
              stops: [0.0, 0.55, 1.0],
            ),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: 'Tajawal',
              fontSize: 13,
              fontWeight: FontWeight.w900,
              color: Color(0xFF2A1208),
              letterSpacing: 0,
            ),
          ),
        ),
      );
}
