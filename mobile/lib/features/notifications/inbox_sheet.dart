import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/notifications/inbox_service.dart';
import '../../core/push/push_service.dart';
import '../../models/notification.dart';
import '../profile/profile_palette.dart';
import 'notification_detail.dart';

// ══════════════════════════════════════════════════════
// 🔔 صندوق الإشعارات — §4 في الملفّ 19
// ══════════════════════════════════════════════════════
// الويب قائمة منسدلة معلّقة تحت الجرس؛ هنا ورقة سفلية. القائمة قد تطول
// والقائمة المنسدلة على هاتفٍ تصير نافذةً ضيّقة داخل نافذة.

Future<void> showInbox(BuildContext context) {
  return showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0xCC000000),
    isScrollControlled: true,
    constraints: BoxConstraints(
      maxWidth: 512,
      maxHeight: MediaQuery.sizeOf(context).height * 0.85,
    ),
    builder: (_) => const _InboxSheet(),
  );
}

class _InboxSheet extends StatefulWidget {
  const _InboxSheet();

  @override
  State<_InboxSheet> createState() => _InboxSheetState();
}

class _InboxSheetState extends State<_InboxSheet> {
  final _inbox = InboxService.instance;
  bool _enabling = false;
  PushPermission _permission = PushPermission.granted;

  @override
  void initState() {
    super.initState();
    _inbox.addListener(_onChange);
    _inbox.refresh();
    _readPermission();
  }

  @override
  void dispose() {
    _inbox.removeListener(_onChange);
    super.dispose();
  }

  void _onChange() {
    if (mounted) setState(() {});
  }

  Future<void> _readPermission() async {
    final p = await PushService.instance.permission();
    if (mounted) setState(() => _permission = p);
  }

  Future<void> _enable() async {
    setState(() => _enabling = true);
    await PushService.instance.requestPermissionAndRegister();
    if (!mounted) return;
    setState(() => _enabling = false);
    _readPermission();
  }

  Future<void> _onRowTap(NotificationRow n) async {
    if (!n.isRead) _inbox.markAsRead(n.id);

    // صفٌّ غنيّ يفتح تفاصيله ويتوقّف — لا تنقّل
    if (n.isRich) {
      await showNotificationDetail(context, n);
      return;
    }

    final url = resolveNotificationUrl(n.type, n.data);
    if (url == null || url.isEmpty || !mounted) return;
    await _go(url);
  }

  Future<void> _go(String url) async {
    if (isExternalUrl(url)) {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      return;
    }
    // 📌 المسارات الداخلية تنتظر go_router (الملفّ 08) ومعه شاشات
    //    الألعاب والدخول والطلبات. حتى ذلك الحين يُغلق الصندوق فقط —
    //    الإشعار عُلّم مقروءاً وهو الأثر الذي يهمّ اللاعب الآن.
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final items = _inbox.items;
    final unread = _inbox.unreadCount;

    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFA111111),
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        border: Border(
          top: BorderSide(color: Color(0x1AFFFFFF)),
          left: BorderSide(color: Color(0x1AFFFFFF)),
          right: BorderSide(color: Color(0x1AFFFFFF)),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _header(unread),
          if (_permission == PushPermission.prompt) _promptBanner(),
          if (_permission == PushPermission.denied) _deniedBanner(),
          Flexible(
            child: items.isEmpty
                ? Padding(
                    padding: const EdgeInsets.all(32),
                    child: Center(
                        child: Text('لا توجد إشعارات',
                            style: ar(14, color: const Color(0x4DFFFFFF)))),
                  )
                : ListView.builder(
                    shrinkWrap: true,
                    itemCount: items.length,
                    itemBuilder: (_, i) => _Row(
                      n: items[i],
                      onTap: () => _onRowTap(items[i]),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _header(int unread) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Color(0x14FFFFFF))),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(unread > 0 ? 'الإشعارات ($unread)' : 'الإشعارات',
                style: ar(15, weight: FontWeight.w700)),
            if (unread > 0)
              InkWell(
                onTap: _inbox.markAllAsRead,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  child: Text('قراءة الكل ✓', style: ar(12, color: Tw.amber500)),
                ),
              ),
          ],
        ),
      );

  Widget _promptBanner() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: const BoxDecoration(
          color: Color(0x143B82F6),
          border: Border(bottom: BorderSide(color: Color(0x0FFFFFFF))),
        ),
        child: Column(children: [
          InkWell(
            onTap: _enabling ? null : _enable,
            borderRadius: BorderRadius.circular(10),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                gradient: _enabling
                    ? null
                    : const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFF3B82F6), Color(0xFF2563EB)]),
                color: _enabling ? const Color(0x4D3B82F6) : null,
              ),
              child: Center(
                child: Text(
                  _enabling ? '⏳ جاري التفعيل...' : '🔔 تفعيل الإشعارات على هاتفك',
                  style: ar(13, weight: FontWeight.w600),
                ),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text('اضغط للحصول على إشعارات فورية',
              style: ar(11, color: const Color(0x66FFFFFF))),
        ]),
      );

  Widget _deniedBanner() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: const BoxDecoration(
          color: Color(0x14EF4444),
          border: Border(bottom: BorderSide(color: Color(0x0FFFFFFF))),
        ),
        // صدر الرسالة حرفيّ؛ ذيلها «من إعدادات المتصفح» لا معنى له هنا
        child: Row(children: [
          Expanded(
            child: Text('❌ تم رفض الإشعارات',
                style: ar(12, color: const Color(0xFFEF4444))),
          ),
          InkWell(
            onTap: PushService.instance.openSettings,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              child: Text('فتح إعدادات التطبيق',
                  style: ar(12, color: Tw.amber500, weight: FontWeight.w700)),
            ),
          ),
        ]),
      );
}

// ══════════════════════════════════════════════════════
// §4.10 صفّ الإشعار
// ══════════════════════════════════════════════════════
class _Row extends StatelessWidget {
  const _Row({required this.n, required this.onTap});

  final NotificationRow n;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final openable = n.isRich || resolveNotificationUrl(n.type, n.data) != null;

    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: n.isRead ? Colors.transparent : const Color(0x0DF59E0B),
          border: const Border(bottom: BorderSide(color: Color(0x0AFFFFFF))),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _leading(),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(n.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: ar(13,
                        color: n.isRead ? const Color(0x99FFFFFF) : Colors.white,
                        weight: n.isRead ? FontWeight.w400 : FontWeight.w600)),
                if (n.body.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(n.body,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: ar(12, color: const Color(0x66FFFFFF))),
                ],
                const SizedBox(height: 4),
                Text(formatTimeAgo(n.createdAt),
                    style: ar(10, color: const Color(0x33FFFFFF))),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(mainAxisSize: MainAxisSize.min, children: [
            if (!n.isRead)
              Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                    shape: BoxShape.circle, color: Tw.amber500),
              ),
            if (openable) ...[
              const SizedBox(height: 4),
              // الويب يكتب «◀» نصّاً، وهو خارج خطوط التطبيق الثلاثة
              // فيُرسم مربّعاً فارغاً — رأيته على الجهاز. أيقونة بدله.
              const Icon(Icons.arrow_back_ios_new,
                  size: 12, color: Color(0x33FFFFFF)),
            ],
          ]),
        ]),
      ),
    );
  }

  Widget _leading() {
    final img = n.imageUrl;
    if (img == null) {
      return Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          color: notificationColor(n.type).withValues(alpha: 0.125),
        ),
        child: Center(
            child: Text(notificationIcon(n.type), style: const TextStyle(fontSize: 22))),
      );
    }

    return SizedBox(
      width: 44,
      height: 44,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Stack(fit: StackFit.expand, children: [
          const ColoredBox(color: Colors.black),
          CachedNetworkImage(
            imageUrl: ApiClient.instance.upload(img),
            fit: BoxFit.cover,
            // فشل الصورة يسقط إلى أيقونة النوع بهدوء — لا رسالة صاخبة
            errorWidget: (_, __, ___) => Center(
                child: Text(notificationIcon(n.type),
                    style: const TextStyle(fontSize: 18))),
          ),
          if (n.videoUrl != null)
            const ColoredBox(
              color: Color(0x59000000),
              child: Center(child: Text('▶️', style: TextStyle(fontSize: 16))),
            ),
        ]),
      ),
    );
  }
}
