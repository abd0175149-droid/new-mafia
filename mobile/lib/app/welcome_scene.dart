// ══════════════════════════════════════════════════════
// 🚶 شاشة الترحيب — مشيٌ في زقاق «ليتل إيتالي» حتى باب النادي، عند كلّ فتحٍ للتطبيق
//    (قرار المالك 2026-09-12): مسجَّلاً كان اللاعب أم لا، فوق كلّ الشاشات، ثمّ تتلاشى.
//    المقطع مُصيَّر من محرّك شاشة القاعة نفسه (مصدرٌ واحد للحقيقة) ويُشحن مع التطبيق:
//    assets/video/club-entry.mp4 (H.264 عموديّ 720×1280، ~9 ثوانٍ).
//    صامت، يُتخطّى بلمسة، وسقفه 9 ثوانٍ إن تعطّل الفيديو.
// ══════════════════════════════════════════════════════
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

class WelcomeScene extends StatefulWidget {
  const WelcomeScene({super.key, required this.onDone});
  final VoidCallback onDone;
  @override
  State<WelcomeScene> createState() => _WelcomeSceneState();
}

class _WelcomeSceneState extends State<WelcomeScene> with SingleTickerProviderStateMixin {
  VideoPlayerController? _ctrl;
  bool _fading = false;
  Timer? _cap;

  @override
  void initState() {
    super.initState();
    _cap = Timer(const Duration(seconds: 9), _finish);
    final c = VideoPlayerController.asset('assets/video/club-entry.mp4');
    _ctrl = c;
    c.setVolume(0);
    c.initialize().then((_) {
      if (!mounted) return;
      setState(() {});
      c.play();
      c.addListener(() {
        final v = c.value;
        if (v.isInitialized && !v.isPlaying && v.position >= v.duration - const Duration(milliseconds: 120)) _finish();
        if (v.hasError) _finish();
      });
    }).catchError((Object _) { _finish(); });
  }

  void _finish() {
    if (_fading || !mounted) return;
    setState(() => _fading = true);
    Future.delayed(const Duration(milliseconds: 650), () { if (mounted) widget.onDone(); });
  }

  @override
  void dispose() {
    _cap?.cancel();
    _ctrl?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = _ctrl;
    final ready = c != null && c.value.isInitialized;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: _finish,
      child: AnimatedOpacity(
        opacity: _fading ? 0 : 1,
        duration: const Duration(milliseconds: 650),
        child: Container(
          color: const Color(0xFF05060C),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (ready)
                FittedBox(
                  fit: BoxFit.cover,
                  child: SizedBox(width: c.value.size.width, height: c.value.size.height, child: VideoPlayer(c)),
                ),
              // تدرّجٌ داكن أسفل الشاشة كي تُقرأ الهويّة
              Positioned.fill(
                child: DecoratedBox(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.center, end: Alignment.bottomCenter,
                      colors: [Color(0x0005060C), Color(0xD905060C)],
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 0, right: 0, bottom: 56,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('MAFIA CLUB · LITTLE ITALY 1931',
                        style: TextStyle(fontFamily: 'monospace', fontSize: 10, letterSpacing: 5, color: Color(0xE6C5A059))),
                    const SizedBox(height: 6),
                    ShaderMask(
                      shaderCallback: (r) => const LinearGradient(
                        begin: Alignment.topCenter, end: Alignment.bottomCenter,
                        colors: [Color(0xFFF6E7BD), Color(0xFFC5A059), Color(0xFF7D5F2A)], stops: [0, .52, 1],
                      ).createShader(r),
                      child: const Text('نادي المافيا', textDirection: TextDirection.rtl,
                          style: TextStyle(fontSize: 38, fontWeight: FontWeight.w900, color: Colors.white, height: 1.1)),
                    ),
                    const SizedBox(height: 8),
                    const Text('المس الشاشة للمتابعة', textDirection: TextDirection.rtl,
                        style: TextStyle(fontSize: 11, color: Color(0xFF9A8F7D))),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
