import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app/router.dart';
import '../../core/api/api_client.dart';
import '../../core/storage/session_store.dart';
import 'page_steps.dart';

// ══════════════════════════════════════════════════════
// 🕴️ جولة «الليلة الأولى» — العقل (منقولٌ من GuideProvider.tsx، 2026-11-22)
//
// يسأل الخادم عن حالة جولة هذا اللاعب (/api/player-guide/me)، ويحمل موضع الجولة
// (خطوات الصفحات ← غرفة التدريب) وحجز الفعاليّة التجريبيّة. الرسم كلّه في GuideHost.
//
// قرارات المالك (كالويب):
//   • تُشغَّل وتُطفأ من الداشبورد («مفاتيح النظام») — مطفأةً لا يُرسم شيء.
//   • تُدعى إليها الحسابات الجديدة ومن كان آخر نشاطه قبل ١/١١/٢٠٢٦ (الخادم يقرّر).
//   • الدخول بعد الحجز من زرّ «دخول ←» في بطاقة الفعاليّة، لا من الزرّ السفليّ.
//   • «لاحقاً» تؤجّل ولا تلغي، والدعوة لا تظهر فوق لاعبٍ غرفتُه الحقيقيّة مفتوحة.
// ══════════════════════════════════════════════════════

enum GuideStage { pages, room }

@immutable
class GuideRun {
  const GuideRun(this.stage, this.i, this.replay);
  final GuideStage stage;
  final int i;
  final bool replay;
  GuideRun copy({GuideStage? stage, int? i}) => GuideRun(stage ?? this.stage, i ?? this.i, replay);
}

@immutable
class GuideMe {
  const GuideMe({required this.enabled, required this.required, required this.status, this.step, this.returning = false});
  final bool enabled, required, returning;
  /// new · started · deferred · done
  final String status;
  final String? step;
  GuideMe copy({String? status, bool? required}) =>
      GuideMe(enabled: enabled, required: required ?? this.required, status: status ?? this.status, step: step, returning: returning);
}

/// فقرة نصّ للدون — `tip` تُرسم بلون النصيحة
@immutable
class Gp {
  const Gp(this.text, {this.tip = false});
  final String text;
  final bool tip;
}

/// ما تحتاجه طبقة الدون لخطوةٍ واحدة (مقابل LayerStep في الويب)
@immutable
class LayerStep {
  const LayerStep({this.target, this.text = const [], this.wait, this.whisper = false, this.pos, this.dim = true, this.open = false, this.nextLabel, this.silent = false});
  final String? target;
  final List<Gp> text;
  /// ما على اللاعب فعله — وجودُه يجعل الخطوة خطوةَ فعل بلا «التالي»
  final String? wait;
  final bool whisper;
  /// top · bottom · low · mid
  final String? pos;
  /// false: لا حجب إطلاقاً (قائمة الليل، شبكة التصويت)
  final bool dim;
  /// الثقب يبقى قابلاً للّمس حتى في خطوة شرح
  final bool open;
  final String? nextLabel;
  final bool silent;
}

@immutable
class GuideOverlay {
  const GuideOverlay({required this.step, this.count, this.onNext, this.onLater, this.onSkip});
  final LayerStep step;
  final String? count;
  final VoidCallback? onNext, onLater, onSkip;
}

/// المسار الحاليّ في الراوتر — فارغٌ إن لم يُبنَ بعد
String currentPath() {
  final ctx = rootNavigatorKey.currentContext;
  if (ctx == null) return '';
  try { return GoRouter.of(ctx).routerDelegate.currentConfiguration.uri.path; } catch (_) { return ''; }
}

void goPath(String path) {
  final ctx = rootNavigatorKey.currentContext;
  if (ctx != null) ctx.go(path);
}

class GuideService extends ChangeNotifier {
  GuideService._();
  static final GuideService instance = GuideService._();

  static const _kBooked = 'mafia_guide_booked';

  GuideMe? me;
  GuideRun? run;
  bool invite = false;
  bool booked = false;
  /// دور المتدرّب على طاولة التدريب
  String role = 'SHERIFF';

  /// ما ترسمه طبقة الدون الآن (خطوة صفحة أو دقّة غرفة)
  final ValueNotifier<GuideOverlay?> overlay = ValueNotifier(null);
  /// ورقة الدون الحاليّة (الختم واختيار الدور) — من غرفة التدريب
  final ValueNotifier<WidgetBuilder?> sheet = ValueNotifier(null);
  final ValueNotifier<String?> toast = ValueNotifier(null);

  String? _token;
  bool inviteAsked = false;
  String? _lastCh;

  bool get enabled => me?.enabled == true;
  bool get showTraining => enabled && (run != null || (me!.required && me!.status != 'done'));

  // ── حالة الجولة من الخادم: عند تغيّر الحساب ──
  void syncSession() {
    final t = SessionStore.instance.token;
    if (t == _token) return;
    _token = t;
    me = null; run = null; invite = false; inviteAsked = false; overlay.value = null; sheet.value = null;
    notifyListeners();
    if (t != null && t.isNotEmpty) unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final d = await ApiClient.instance.get('/api/player-guide/me');
      if (d is! Map || d['success'] != true) return;
      me = GuideMe(enabled: d['enabled'] == true, required: d['required'] == true, status: '${d['status'] ?? 'new'}', step: d['step'] as String?, returning: d['returning'] == true);
      if (me!.enabled) {
        try { booked = (await SharedPreferences.getInstance()).getBool(_kBooked) ?? false; } catch (_) {}
      }
      notifyListeners();
    } catch (_) {/* الجولة إضافة لا شرط: فشلُها يُخفيها وحدها */}
  }

  void _post(Map<String, dynamic> body) {
    if ((_token ?? '').isEmpty) return;
    unawaited(ApiClient.instance.post('/api/player-guide/me', body: body).then((_) {}, onError: (_) {}));
  }

  void setBooked(bool b) {
    booked = b;
    notifyListeners();
    unawaited(SharedPreferences.getInstance().then((p) => b ? p.setBool(_kBooked, true) : p.remove(_kBooked)).then((_) {}, onError: (_) {}));
  }

  void setRole(String r) { role = r; notifyListeners(); }

  void begin({String? from, bool replay = false}) {
    final rep = replay || me?.status == 'done';
    if (replay) setBooked(false);
    final i = stepIndex(from ?? 'card');
    invite = false;
    run = GuideRun(GuideStage.pages, i, rep);
    _lastCh = null;
    if (!rep) {
      _post({'action': 'start', 'step': kPageSteps[i].ch});
      if (me != null && me!.status != 'done') me = me!.copy(status: 'started');
    }
    notifyListeners();
  }

  void defer() {
    if (!(run?.replay ?? false) && me?.status != 'done') {
      _post({'action': 'defer'});
      if (me != null && me!.status != 'done') me = me!.copy(status: 'deferred');
    }
    invite = false;
    final wasRoom = run?.stage == GuideStage.room;
    run = null;
    overlay.value = null;
    sheet.value = null;
    notifyListeners();
    if (wasRoom) goPath(Routes.home);
  }

  void enterRoom() {
    final rep = run?.replay ?? (me?.status == 'done');
    invite = false;
    run = GuideRun(GuideStage.room, kPageSteps.length, rep);
    overlay.value = null;
    if (!rep) {
      _post({'action': 'step', 'step': 'room'});
      if (me != null && me!.status != 'done') me = me!.copy(status: 'started');
    }
    notifyListeners();
    if (currentPath() != Routes.join) goPath(Routes.join);
  }

  /// أتمّ الغرفة — تُختم الجولة في الخادم
  void finish() {
    _post({'action': 'done'});
    if (me != null) me = me!.copy(status: 'done', required: false);
    setBooked(false);
  }

  /// بعد ورقة الختم: إلى قائمة الألعاب الحقيقيّة
  void leaveRoom() {
    run = null;
    overlay.value = null;
    sheet.value = null;
    notifyListeners();
    goPath(Routes.games);
  }

  /// خروجٌ من تبويب غرفة التدريب وسط الجولة ⇒ توقّفٌ مؤقّت (تبقى لافتة «تابع» في الرئيسيّة)
  void pauseRoom() {
    if (run?.stage != GuideStage.room) return;
    run = null;
    overlay.value = null;
    sheet.value = null;
    notifyListeners();
  }

  // ══ محرّك خطوات الصفحات ══
  PageStep? get pageStep => run?.stage == GuideStage.pages && run!.i < kPageSteps.length ? kPageSteps[run!.i] : null;

  void advance() {
    final r = run;
    if (r == null || r.stage != GuideStage.pages) return;
    run = r.i + 1 >= kPageSteps.length ? r.copy(stage: GuideStage.room, i: kPageSteps.length) : r.copy(i: r.i + 1);
    notifyListeners();
  }

  void goto(String id) {
    final r = run;
    if (r == null || r.stage != GuideStage.pages) return;
    run = r.copy(i: stepIndex(id));
    notifyListeners();
  }

  /// حفظ الفصل في الخادم عند تبدّله — نقطة الاستئناف بعد إغلاق التطبيق
  void noteChapter(String ch) {
    if (run?.replay ?? true) return;
    if (_lastCh == ch) return;
    _lastCh = ch;
    _post({'action': 'step', 'step': ch});
  }

  Timer? _toastT;
  void say(String m) {
    toast.value = m;
    _toastT?.cancel();
    _toastT = Timer(const Duration(milliseconds: 3200), () { if (toast.value == m) toast.value = null; });
  }
}
