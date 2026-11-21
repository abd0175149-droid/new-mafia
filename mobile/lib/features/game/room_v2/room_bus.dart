import 'package:flutter/foundation.dart';

import '../../../core/api/api_client.dart';

// ══════════════════════════════════════════════════════
// 🚌 جسرٌ بين غرفة اللعبة والشريط السفليّ — مطابقٌ لـ roomBus.ts في الويب (2026-11-22)
//   قرار المالك: شريطٌ سفليّ واحد، وزرّ المنتصف يصبح «اللعبة» ما دام اللاعب داخل الغرفة
//   (بحلقة وقت المرحلة وشارة السلّة) ويفتح أدوات اللعبة.
// ══════════════════════════════════════════════════════

@immutable
class RoomBusState {
  const RoomBusState({this.active = false, this.endsAt, this.totalSec = 0, this.cart = 0});
  final bool active;
  final DateTime? endsAt;
  final int totalSec;
  final int cart;

  @override
  bool operator ==(Object other) => other is RoomBusState && other.active == active && other.endsAt == endsAt && other.totalSec == totalSec && other.cart == cart;
  @override
  int get hashCode => Object.hash(active, endsAt, totalSec, cart);
}

class RoomBus {
  RoomBus._();
  static final ValueNotifier<RoomBusState> state = ValueNotifier(const RoomBusState());
  static VoidCallback? _openHub;

  static void set(RoomBusState s) { if (state.value != s) state.value = s; }
  static void clear() { _openHub = null; set(const RoomBusState()); }
  static void setHubOpener(VoidCallback? f) => _openHub = f;
  /// يفتح أدوات اللعبة إن كانت الغرفة مرسومة — وإلّا يعيد false فيتصرّف الزرّ كالمعتاد
  static bool requestHub() { final f = _openHub; if (f == null) return false; f(); return true; }
}

/// 📱 مفتاح «شاشة اللاعب الجديدة» — GET /api/player-ui (عامّ) — مشغَّل على الإنتاج للويب.
class PlayerUiFlag {
  PlayerUiFlag._();
  static final ValueNotifier<bool> enabled = ValueNotifier(false);
  static DateTime? _at;

  /// يُسأل عند دخول الغرفة وكلّ دقيقتين — فشل القراءة يُبقي القيمة الأخيرة
  static Future<bool> refresh({bool force = false}) async {
    if (!force && _at != null && DateTime.now().difference(_at!) < const Duration(minutes: 2)) return enabled.value;
    try {
      final r = await ApiClient.instance.get('/api/player-ui');
      if (r is Map) enabled.value = r['enabled'] == true;
      _at = DateTime.now();
    } catch (_) {}
    return enabled.value;
  }
}
