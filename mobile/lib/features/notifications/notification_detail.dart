import 'dart:ui';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';

import '../../core/api/api_client.dart';
import '../../models/notification.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🖼️ تفاصيل إشعار غنيّ — §4.12 في الملفّ 19
// ══════════════════════════════════════════════════════

Future<void> showNotificationDetail(BuildContext context, NotificationRow n) {
  return showGeneralDialog(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'إغلاق',
    barrierColor: const Color(0xD1000000),
    transitionDuration: const Duration(milliseconds: 200),
    pageBuilder: (_, __, ___) => _Detail(n: n),
    transitionBuilder: (_, a, __, child) {
      final c = CurvedAnimation(parent: a, curve: Curves.easeOut);
      return FadeTransition(
        opacity: c,
        child: ScaleTransition(
          scale: Tween(begin: 0.92, end: 1.0).animate(c),
          child: child,
        ),
      );
    },
  );
}

class _Detail extends StatefulWidget {
  const _Detail({required this.n});
  final NotificationRow n;

  @override
  State<_Detail> createState() => _DetailState();
}

class _DetailState extends State<_Detail> {
  VideoPlayerController? _video;
  bool _videoFailed = false;

  @override
  void initState() {
    super.initState();
    final v = widget.n.videoUrl;
    if (v != null) _initVideo(ApiClient.instance.upload(v));
  }

  Future<void> _initVideo(String url) async {
    final c = VideoPlayerController.networkUrl(Uri.parse(url));
    try {
      await c.initialize();
      if (!mounted) {
        await c.dispose();
        return;
      }
      setState(() => _video = c);
    } catch (_) {
      await c.dispose();
      // فشل الفيديو يسقط إلى الملصق (imageUrl) أو أيقونة النوع —
      // بهدوء، بلا رسالة خطأ فوق إعلانٍ من النادي
      if (mounted) setState(() => _videoFailed = true);
    }
  }

  @override
  void dispose() {
    _video?.dispose();
    super.dispose();
  }

  Future<void> _openUrl(String u) async {
    Navigator.of(context).pop();
    if (isExternalUrl(u)) {
      await launchUrl(Uri.parse(u), mode: LaunchMode.externalApplication);
    }
    // المسارات الداخلية تنتظر go_router (الملفّ 08)
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.n;
    final body = n.richBody ?? (n.body.isNotEmpty ? n.body : null);

    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: 420,
              maxHeight: MediaQuery.sizeOf(context).height * 0.88,
            ),
            child: Material(
              color: const Color(0xFF0F0F0F),
              borderRadius: BorderRadius.circular(18),
              clipBehavior: Clip.antiAlias,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: const Color(0x1FFFFFFF)),
                ),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _header(n),
                      _media(n),
                      if (body != null)
                        Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 16, vertical: 14),
                          child: Text(body,
                              style: ar(14,
                                  color: const Color(0xD1FFFFFF), height: 1.7)),
                        ),
                      if (n.url != null)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                          child: InkWell(
                            onTap: () => _openUrl(n.url!),
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(12),
                                gradient: const LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [Color(0xFFF59E0B), Color(0xFFD97706)],
                                ),
                              ),
                              child: Center(
                                child: Text(
                                  isExternalUrl(n.url!) ? '🔗 فتح الرابط' : 'انتقال ◀',
                                  style: ar(14,
                                      color: Colors.black, weight: FontWeight.w700),
                                ),
                              ),
                            ),
                          ),
                        ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                        child: Text(formatTimeAgo(n.createdAt),
                            style: ar(11, color: const Color(0x40FFFFFF))),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _header(NotificationRow n) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Color(0x14FFFFFF))),
        ),
        child: Row(children: [
          Text(notificationIcon(n.type), style: const TextStyle(fontSize: 15)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(n.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: ar(15, weight: FontWeight.w700)),
          ),
          InkWell(
            onTap: () => Navigator.of(context).pop(),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: Text('✕', style: ar(20, color: const Color(0xFF888888))),
            ),
          ),
        ]),
      );

  Widget _media(NotificationRow n) {
    final v = _video;
    if (v != null) {
      return AspectRatio(
        aspectRatio: v.value.aspectRatio,
        child: Stack(alignment: Alignment.bottomCenter, children: [
          VideoPlayer(v),
          VideoProgressIndicator(v, allowScrubbing: true),
          Center(
            child: InkWell(
              onTap: () => setState(
                  () => v.value.isPlaying ? v.pause() : v.play()),
              customBorder: const CircleBorder(),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: const BoxDecoration(
                    shape: BoxShape.circle, color: Color(0x73000000)),
                child: Icon(
                    v.value.isPlaying ? Icons.pause : Icons.play_arrow,
                    color: Colors.white,
                    size: 32),
              ),
            ),
          ),
        ]),
      );
    }

    // فيديو لم يجهز بعد أو فشل ⇒ الملصق، ثم الصورة، ثم لا شيء
    final img = n.imageUrl;
    if (img != null) {
      return ColoredBox(
        color: Colors.black,
        child: ConstrainedBox(
          constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(context).height * 0.55),
          child: CachedNetworkImage(
            imageUrl: ApiClient.instance.upload(img),
            fit: BoxFit.contain,
            errorWidget: (_, __, ___) => SizedBox(
              height: 120,
              child: Center(
                  child: Text(notificationIcon(n.type),
                      style: const TextStyle(fontSize: 40))),
            ),
          ),
        ),
      );
    }

    if (n.videoUrl != null && !_videoFailed) {
      return const SizedBox(
        height: 120,
        child: Center(
          child: SizedBox(
            width: 28,
            height: 28,
            child: CircularProgressIndicator(strokeWidth: 2, color: Tw.amber500),
          ),
        ),
      );
    }

    return const SizedBox.shrink();
  }
}
