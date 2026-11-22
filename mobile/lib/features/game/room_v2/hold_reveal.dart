import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/security/secret_watermark.dart';
import '../../guide/guide_targets.dart';
import '../../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// ✋ «اضغط مطوّلاً» — الطبقة الوحيدة التي تختلف من دورٍ لدور (مطابقٌ لـ HoldReveal.tsx)
//   اللاعبون متجاورون، فكلّ شاشةٍ متطابقة لكلّ الأدوار. ما يخصّ الدور لا يُبنى قبل الضغط.
//   الضغط المطوّل (٣٥٠ مث) **يفتح** لوحةً خاصّة في أعلى الشاشة بعيداً عن الإصبع، تُمرَّر،
//   وتُغلق بـ«إخفاء» أو وحدها بعد ٤٥ ثانية أو بمغادرة التطبيق. الإطار نفسه لكلّ الأدوار.
// ══════════════════════════════════════════════════════

const _gold = Color(0xFFC5A059);
const kOpenAfter = Duration(milliseconds: 350);
const kAutoClose = Duration(seconds: 45);
/// أسماء مسارات الغرفة — تُغلق عند تغيّر المرحلة (في الويب تُفكّ مع مكوّن المرحلة)
const kPrivatePanelRoute = 'room-private';
const kTasksRoute = 'room-tasks';
const kGalleryRoute = 'room-gallery';
const kHubRoute = 'room-hub';
const kRolesRoute = 'room-roles';

/// يكتشف الضغط المطوّل بمهلة الويب نفسها (٣٥٠ مث) — بلا اعتماد على مهلة النظام
class LongHold extends StatefulWidget {
  const LongHold({super.key, required this.onOpen, required this.child, this.enabled = true});
  final VoidCallback onOpen;
  final Widget child;
  final bool enabled;
  @override
  State<LongHold> createState() => _LongHoldState();
}

class _LongHoldState extends State<LongHold> {
  Timer? _t;
  bool _holding = false;
  void _start() {
    if (!widget.enabled) return;
    setState(() => _holding = true);
    _t?.cancel();
    _t = Timer(kOpenAfter, () { if (mounted) setState(() => _holding = false); widget.onOpen(); });
  }
  void _stop() { _t?.cancel(); _t = null; if (_holding && mounted) setState(() => _holding = false); }
  @override
  void dispose() { _t?.cancel(); super.dispose(); }
  @override
  Widget build(BuildContext context) => Listener(
        onPointerDown: (_) => _start(),
        onPointerUp: (_) => _stop(),
        onPointerCancel: (_) => _stop(),
        child: AnimatedScale(scale: _holding ? 0.97 : 1, duration: const Duration(milliseconds: 150), child: widget.child),
      );
}

/// زرّ الظرف: «📨 رسالة الليل» أو «دورك ومهامّك» — الشكل واحدٌ للجميع
class HoldRevealButton extends StatelessWidget {
  const HoldRevealButton({super.key, required this.title, this.hint, required this.panelTitle, required this.watermark, required this.builder, this.onOpen, this.onShow, this.onHide, this.guideId});
  /// 🕴️ اسم نقطة الإضاءة لجولة «الليلة الأولى» — لا أثر له في اللعب
  final String? guideId;
  final VoidCallback? onShow, onHide;
  final String title;
  final String? hint;
  final String panelTitle;
  final String watermark;
  final WidgetBuilder builder;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) => LongHold(
        onOpen: () {
          onOpen?.call();
          unawaited(showPrivatePanel(context, title: panelTitle, watermark: watermark, builder: builder, onShow: onShow, onHide: onHide));
        },
        child: _maybeTarget(guideId, Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
          decoration: BoxDecoration(
            color: const Color(0xFF0C0C0C),
            border: Border.all(color: const Color(0x59C5A059)),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Column(children: [
            Text(title, style: ar(16, color: _gold, weight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(hint ?? 'اضغط مطوّلاً — وغطِّ الشاشة بكفّك', textAlign: TextAlign.center, style: ar(12, color: const Color(0xFF8D8271))),
          ]),
        )),
      );
}

Widget _maybeTarget(String? id, Widget child) => id == null ? child : GuideTarget(id: id, child: child);

/// لوحة السرّ: أعلى الشاشة، فوق كلّ شيء، تُمرَّر، وزرّ «إخفاء» كبير أسفلها.
Future<void> showPrivatePanel(BuildContext context, {required String title, required String watermark, required WidgetBuilder builder,
    VoidCallback? onShow, VoidCallback? onHide}) async {
  onShow?.call();   // 🕵️ حماية الشاشة الأصليّة (تسويد اللقطة) ما دامت اللوحة مفتوحة
  try {
    await _panel(context, title: title, watermark: watermark, builder: builder);
  } finally {
    onHide?.call();
  }
}

Future<void> _panel(BuildContext context, {required String title, required String watermark, required WidgetBuilder builder}) {
  return showGeneralDialog<void>(
    context: context,
    useRootNavigator: true,
    routeSettings: const RouteSettings(name: kPrivatePanelRoute),
    barrierDismissible: false,
    barrierColor: const Color(0xF2000000),
    transitionDuration: const Duration(milliseconds: 160),
    pageBuilder: (ctx, _, __) => _PrivatePanel(title: title, watermark: watermark, builder: builder),
  );
}

class _PrivatePanel extends StatefulWidget {
  const _PrivatePanel({required this.title, required this.watermark, required this.builder});
  final String title, watermark;
  final WidgetBuilder builder;
  @override
  State<_PrivatePanel> createState() => _PrivatePanelState();
}

class _PrivatePanelState extends State<_PrivatePanel> with WidgetsBindingObserver {
  Timer? _auto;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _auto = Timer(kAutoClose, _close);
  }
  @override
  void didChangeAppLifecycleState(AppLifecycleState s) { if (s != AppLifecycleState.resumed) _close(); }
  void _close() { if (mounted && Navigator.of(context).canPop()) Navigator.of(context).pop(); }
  @override
  void dispose() { _auto?.cancel(); WidgetsBinding.instance.removeObserver(this); super.dispose(); }

  @override
  Widget build(BuildContext context) => GuideTarget(id: 'private-panel', child: Directionality(
        textDirection: TextDirection.rtl,
        child: SafeArea(
          child: Material(
            color: Colors.transparent,
            child: Column(children: [
              Expanded(
                child: Container(
                  margin: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                  decoration: BoxDecoration(color: const Color(0xFF0C0C0C), border: Border.all(color: const Color(0x80C5A059)), borderRadius: BorderRadius.circular(4)),
                  child: SecretWatermark(label: widget.watermark, opacity: 0.08, child:
                    Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
                        child: Row(children: [
                          Expanded(child: Text(widget.title, style: ar(16, color: _gold, weight: FontWeight.bold))),
                          Text('غطِّ الشاشة بكفّك', style: ar(11, color: const Color(0xFF8D8271))),
                        ]),
                      ),
                      Expanded(child: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(16, 6, 16, 16), child: Builder(builder: widget.builder))),
                    ]),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
                child: SizedBox(
                  width: double.infinity, height: 56,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF8A0303), foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4))),
                    onPressed: _close,
                    child: Text('إخفاء', style: ar(17, color: Colors.white, weight: FontWeight.bold)),
                  ),
                ),
              ),
            ]),
          ),
        ),
      ));
}
