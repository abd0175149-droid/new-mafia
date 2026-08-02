import 'package:url_launcher/url_launcher.dart';

import '../../app/config.dart';

// ══════════════════════════════════════════════════════
// 🧭 تصنيف الوجهة — §6.5 في الملفّ 08
// ══════════════════════════════════════════════════════
// كل وجهة — من إشعار، أو من `data.url` كتبها موظّف في لوحة الإدارة —
// تمرّ من هنا. مصنّفٌ واحد لا شرطٌ مبعثر في كل شاشة.

enum DestinationKind {
  /// مسار داخل التطبيق — `router.go`
  internal,

  /// موقع آخر — متصفّح خارجيّ
  external,

  /// واجهة ويب من واجهاتنا لا يملكها التطبيق (الموظّف، الإدارة، الشاشة)
  ourWebOnly,

  /// لا وجهة
  none,
}

class Destination {
  const Destination(this.kind, this.value);

  final DestinationKind kind;

  /// للداخليّ: `path + query`. للخارجيّ: رابط مطلق. للـnone: فارغ.
  final String value;

  static const _host = 'club-mafia.grade.sbs';

  /// المسارات التي يملكها التطبيق. ما عداها واجهات ويب.
  static const _ownedPrefixes = ['/player/', '/join/'];

  static Destination classify(String? raw) {
    final s = raw?.trim() ?? '';
    if (s.isEmpty) return const Destination(DestinationKind.none, '');

    final uri = Uri.tryParse(s);

    // مطلق
    if (uri != null && uri.hasScheme) {
      final scheme = uri.scheme.toLowerCase();
      if (scheme != 'http' && scheme != 'https') {
        // `tel:`، `whatsapp:`، أيّ شيء آخر — للنظام
        return Destination(DestinationKind.external, s);
      }
      // 🔴 مضيفٌ غريب لا يُوجَّه داخلياً أبداً مهما شابه مسارُه مساراتنا.
      //    وجهة الإشعار يكتبها موظّف من لوحة الإدارة؛ بلا هذا الشرط يصير
      //    حقل نصٍّ في لوحة تحكّم بوّابةَ فتحٍ داخل التطبيق.
      if (uri.host != _host) return Destination(DestinationKind.external, s);

      final path = uri.path.isEmpty ? '/' : uri.path;
      return classify(uri.hasQuery ? '$path?${uri.query}' : path);
    }

    if (!s.startsWith('/')) return const Destination(DestinationKind.none, '');

    final path = s.split('?').first;
    final owned = _ownedPrefixes.any(path.startsWith) ||
        path == '/player' ||
        path == '/join';
    if (owned) return Destination(DestinationKind.internal, s);

    // `/venue/orders`، `/leader`، `/display` … واجهاتنا لكن ليست التطبيق
    return Destination(DestinationKind.ourWebOnly, 'https://$_host$s');
  }

  /// يفتح الخارجيّ. الداخليّ ليس من شأنه — المُستدعي يعرف الراوتر.
  Future<bool> openExternal() async {
    if (kind == DestinationKind.internal || kind == DestinationKind.none) return false;
    try {
      return await launchUrl(Uri.parse(value), mode: LaunchMode.externalApplication);
    } catch (_) {
      return false;
    }
  }
}

/// المضيف الذي يعتبره التطبيق مضيفه — للتحقّق في الاختبارات.
String get appHost => Uri.parse(AppConfig.prod.baseUrl).host;
