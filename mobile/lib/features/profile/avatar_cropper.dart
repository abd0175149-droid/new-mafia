import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;

import '../../app/theme/theme.dart';
import '../../models/profile.dart';
import 'profile_palette.dart';

// ══════════════════════════════════════════════════════
// 📸 قصّ الأفاتار — §4.6 في الملفّ 13
// ══════════════════════════════════════════════════════
// نُقلت معادلات الويب حرفياً بدل استعمال حزمة قصّ جاهزة: الحزم تفرض
// اصطلاحاتها في الإزاحة والتكبير، والعقد هنا رقميّ (512×512 q92 بمعامل
// `ratio`) — مطابقته ببناءٍ صريح أسهل من ترويض حزمة.

/// يفتح شاشة القصّ ويعيد `data:image/jpeg;base64,…` أو `null` عند الإلغاء.
Future<String?> openAvatarCropper(BuildContext context, Uint8List bytes) {
  return Navigator.of(context, rootNavigator: true).push<String>(
    PageRouteBuilder(
      opaque: false,
      barrierColor: const Color(0xE6000000),
      transitionDuration: const Duration(milliseconds: 250),
      pageBuilder: (_, __, ___) => _CropperScreen(bytes: bytes),
      transitionsBuilder: (_, a, __, child) => FadeTransition(opacity: a, child: child),
    ),
  );
}

class _CropperScreen extends StatefulWidget {
  const _CropperScreen({required this.bytes});
  final Uint8List bytes;

  @override
  State<_CropperScreen> createState() => _CropperScreenState();
}

class _CropperScreenState extends State<_CropperScreen> {
  ui.Image? _image;
  String? _decodeError;
  bool _saving = false;

  double _scale = 1;
  Offset _offset = Offset.zero;

  double _scaleAtStart = 1;

  /// حجم المعاينة يُثبَّت عند أوّل بناء: تغيّره بعد الملاءمة الابتدائية
  /// (دوران، انقسام شاشة) يجعل الإزاحة المحفوظة تعني شيئاً آخر.
  double? _preview;

  @override
  void initState() {
    super.initState();
    _decode();
  }

  @override
  void dispose() {
    _image?.dispose();
    super.dispose();
  }

  Future<void> _decode() async {
    try {
      final buffer = await ui.ImmutableBuffer.fromUint8List(widget.bytes);
      ui.ImageDescriptor? desc;
      ui.Codec? codec;
      ui.FrameInfo frame;
      try {
        desc = await ui.ImageDescriptor.encoded(buffer);

        // سقف البُعد الأكبر — يُطبَّق على الضلع الأطول ليبقى التناسب
        final longest = math.max(desc.width, desc.height);
        final capped = longest > AvatarPipeline.maxDecodeEdge;
        codec = await desc.instantiateCodec(
          targetWidth:
              capped && desc.width >= desc.height ? AvatarPipeline.maxDecodeEdge : null,
          targetHeight:
              capped && desc.height > desc.width ? AvatarPipeline.maxDecodeEdge : null,
        );
        frame = await codec.getNextFrame();
      } finally {
        // 🔴 الترتيب هنا ليس تنظيفاً: الترميز يجري على خيط io ويقرأ من
        //    ذاكرة الواصف والمخزن. التخلّص منهما قبل `getNextFrame`
        //    يُسقط العملية بـSIGSEGV — لا استثناء Dart ولا رسالة، بل
        //    «التطبيق توقّف» ونافذة «امسح الكاش» من النظام. رأيته.
        //    الترتيب: الترميز أوّلاً، ثمّ الواصف، ثمّ المخزن.
        codec?.dispose();
        desc?.dispose();
        buffer.dispose();
      }

      if (!mounted) {
        frame.image.dispose();
        return;
      }
      setState(() => _image = frame.image);
    } catch (_) {
      if (mounted) setState(() => _decodeError = 'تعذّرت قراءة الصورة');
    }
  }

  void _fit(double preview) {
    final im = _image!;
    final (s, o) = AvatarPipeline.initialFit(im.width, im.height, preview);
    _scale = s;
    _offset = o;
    _preview = preview;
  }

  void _zoom(double delta) {
    setState(() => _scale =
        (_scale + delta).clamp(AvatarPipeline.minScale, AvatarPipeline.maxScale));
  }

  Future<void> _save() async {
    final im = _image;
    final preview = _preview;
    if (im == null || preview == null || _saving) return;
    setState(() => _saving = true);

    try {
      final dataUrl = await _encode(im, preview);
      if (!mounted) return;
      Navigator.of(context).pop(dataUrl);
    } catch (_) {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<String> _encode(ui.Image im, double preview) async {
    const out = AvatarPipeline.outputSize;
    final ratio = AvatarPipeline.ratioFor(preview);

    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);

    // 🔴 خلفية سوداء صريحة: الويب يرسم على canvas شفّاف، ومرمّز JPEG في
    //    المتصفّح يركّب الشفافية على أسود. بلا هذا السطر تخرج المساحات
    //    غير المغطّاة سوداء **على أندرويد** وبيضاء على مرمّز آخر — أي
    //    ناتج يتغيّر بتغيّر المكتبة. نثبّته هنا.
    canvas.drawRect(Rect.fromLTWH(0, 0, out.toDouble(), out.toDouble()),
        Paint()..color = const Color(0xFF000000));

    // **بلا قصّ دائريّ** — الناتج مربّع، وبطاقة اللعب تعرضه بـcover
    canvas.drawImageRect(
      im,
      Rect.fromLTWH(0, 0, im.width.toDouble(), im.height.toDouble()),
      Rect.fromLTWH(_offset.dx * ratio, _offset.dy * ratio,
          im.width * _scale * ratio, im.height * _scale * ratio),
      Paint()..filterQuality = FilterQuality.high,
    );

    final picture = recorder.endRecording();
    final rendered = await picture.toImage(out, out);
    picture.dispose();

    final bd = await rendered.toByteData(format: ui.ImageByteFormat.rawRgba);
    rendered.dispose();

    final raw = img.Image.fromBytes(
      width: out,
      height: out,
      bytes: bd!.buffer,
      numChannels: 4,
      order: img.ChannelOrder.rgba,
    );
    final jpg = img.encodeJpg(raw, quality: AvatarPipeline.jpegQuality);
    return 'data:image/jpeg;base64,${base64Encode(jpg)}';
  }

  @override
  Widget build(BuildContext context) {
    // 280 / 320 / 360 — والعقد النهائيّ ثابت، يتغيّر `ratio` وحده
    final preview = switch (context.sizeClass) {
      WindowSizeClass.compact => 280.0,
      WindowSizeClass.medium => 320.0,
      WindowSizeClass.expanded => 360.0,
    };

    final im = _image;
    if (im != null && _preview != preview) _fit(preview);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('📸 تعديل الصورة', style: ar(16, weight: FontWeight.w700)),
                const SizedBox(height: 16),
                Text('حرّك الصورة وكبّرها لاختيار المنطقة المطلوبة',
                    style: ar(12, color: const Color(0x66FFFFFF))),
                const SizedBox(height: 12),
                if (_decodeError != null)
                  Padding(
                    padding: const EdgeInsets.all(32),
                    child: Text(_decodeError!, style: ar(14, color: Tw.rose400)),
                  )
                else if (im == null)
                  SizedBox(
                    width: preview,
                    height: preview,
                    child: const Center(
                      child: CircularProgressIndicator(strokeWidth: 2, color: Tw.amber500),
                    ),
                  )
                else
                  _preview_(im, preview),
                if (im != null) ...[
                  const SizedBox(height: 16),
                  _zoomRow(),
                ],
                const SizedBox(height: 24),
                _actions(im != null),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _preview_(ui.Image im, double preview) {
    return Listener(
      // العجلة لا معنى لها باللمس — لكن التابلت بلوحة مؤشّر يرسلها
      onPointerSignal: (e) {
        if (e is PointerScrollEvent) {
          _zoom(e.scrollDelta.dy > 0 ? -AvatarPipeline.wheelStep : AvatarPipeline.wheelStep);
        }
      },
      child: GestureDetector(
        onScaleStart: (_) => _scaleAtStart = _scale,
        onScaleUpdate: (d) {
          setState(() {
            // 🔴 لا تقييد على الإزاحة — يمكن إخراج الصورة كلياً من
            //    الدائرة. سلوك الويب، ومقيّدٌ هنا يعني قصّاً مختلفاً.
            _offset += d.focalPointDelta;
            if (d.pointerCount > 1) {
              _scale = (_scaleAtStart * d.scale)
                  .clamp(AvatarPipeline.minScale, AvatarPipeline.maxScale);
            }
          });
        },
        child: Container(
          width: preview,
          height: preview,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0x66FBBF24), width: 3),
            boxShadow: const [BoxShadow(color: Color(0x1AFBBF24), blurRadius: 40)],
          ),
          // الرسّام يملأ مربّعاً، والحدّ دائريّ. بلا قصٍّ تظهر أركان
          // المربّع خارج الدائرة — مكافئ `overflow: hidden` في الويب.
          clipBehavior: Clip.antiAlias,
          // الرسم وحده يُعاد عند كل حركة، لا الشاشة
          child: RepaintBoundary(
            child: CustomPaint(
              painter: _CropPainter(image: im, scale: _scale, offset: _offset),
              size: Size(preview, preview),
            ),
          ),
        ),
      ),
    );
  }

  Widget _zoomRow() => Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          _zoomButton('−', () => _zoom(-AvatarPipeline.buttonStep)),
          const SizedBox(width: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: SizedBox(
              width: 120,
              height: 4,
              child: Stack(children: [
                const ColoredBox(color: Color(0x1AFFFFFF), child: SizedBox.expand()),
                AnimatedFractionallySizedBox(
                  duration: const Duration(milliseconds: 100),
                  widthFactor: math.min(1, _scale / 3),
                  heightFactor: 1,
                  child: const ColoredBox(color: Tw.amber400),
                ),
              ]),
            ),
          ),
          const SizedBox(width: 12),
          _zoomButton('+', () => _zoom(AvatarPipeline.buttonStep)),
        ],
      );

  Widget _zoomButton(String label, VoidCallback onTap) => InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: const Color(0x0DFFFFFF),
            border: Border.all(color: const Color(0x26FFFFFF)),
          ),
          child: Center(child: Text(label, style: ar(18, weight: FontWeight.w700))),
        ),
      );

  Widget _actions(bool ready) => Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          InkWell(
            onTap: _saving ? null : () => Navigator.of(context).pop(),
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 10),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                color: const Color(0x0DFFFFFF),
                border: Border.all(color: const Color(0x1AFFFFFF)),
              ),
              child: Text('إلغاء',
                  style: ar(14, color: const Color(0xFF999999), weight: FontWeight.w600)),
            ),
          ),
          const SizedBox(width: 12),
          InkWell(
            onTap: (!ready || _saving) ? null : _save,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 10),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                gradient: _saving
                    ? null
                    : const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Tw.amber400, Tw.amber500]),
                color: _saving ? const Color(0x4DFBBF24) : null,
              ),
              child: Text(_saving ? '⏳ جاري الحفظ...' : '✓ حفظ الصورة',
                  style: ar(14, color: Colors.black, weight: FontWeight.w700)),
            ),
          ),
        ],
      );
}

class _CropPainter extends CustomPainter {
  _CropPainter({required this.image, required this.scale, required this.offset});

  final ui.Image image;
  final double scale;
  final Offset offset;

  @override
  void paint(Canvas canvas, Size size) {
    final r = size.width / 2;
    canvas.drawRect(Offset.zero & size, Paint()..color = const Color(0xFF111111));
    canvas.save();
    canvas.clipPath(Path()..addOval(Rect.fromCircle(center: Offset(r, r), radius: r)));
    canvas.drawImageRect(
      image,
      Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
      Rect.fromLTWH(offset.dx, offset.dy, image.width * scale, image.height * scale),
      Paint()..filterQuality = FilterQuality.high,
    );
    canvas.restore();
    canvas.drawCircle(
        Offset(r, r),
        r - 1,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = const Color(0x99FBBF24));
  }

  @override
  bool shouldRepaint(_CropPainter o) =>
      o.image != image || o.scale != scale || o.offset != offset;
}
