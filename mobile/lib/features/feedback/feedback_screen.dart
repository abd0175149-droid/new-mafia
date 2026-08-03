import 'package:flutter/material.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../../app/router.dart';
import '../../app/theme/dimens.dart';
import '../../core/api/api_client.dart';
import '../../models/feedback.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 📋 التقييم الإلزاميّ — الملفّ 18
// ══════════════════════════════════════════════════════
// 📌 لا مؤقّتات ولا استطلاع ولا سوكِت هنا إطلاقاً — أبسط الشرائح.
// 📌 الإجابات **ذاكريّة**: إغلاق التطبيق أثناء التعبئة يضيّعها ويُعاد
//    بناء الطابور من `/pending`. قرار مقفول: لا تخزين محلّيّ.

class FeedbackScreen extends StatefulWidget {
  const FeedbackScreen({super.key, this.sessionId});

  /// من رابطٍ عميق أو نقرة إشعار — يتجاوز أوّل الطابور.
  final int? sessionId;

  @override
  State<FeedbackScreen> createState() => _FeedbackScreenState();
}

class _FeedbackScreenState extends State<FeedbackScreen> {
  final _scroll = ScrollController();

  bool _loading = true;
  bool _done = false;
  bool _submitting = false;

  List<PendingSurvey> _pending = const [];
  int? _activeSessionId;
  List<FeedbackQuestion> _questions = const [];
  FeedbackContext? _context;

  final Map<String, int> _answers = {};
  final _notesCtrl = TextEditingController();

  int get _answeredCount => answeredCountOf(_questions, _answers);
  bool get _allAnswered => allAnsweredOf(_questions, _answers);

  @override
  void initState() {
    super.initState();
    _boot();
  }

  @override
  void dispose() {
    _scroll.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  // ══════════════════════════════════════════════════════
  // الإقلاع والتسلسل
  // ══════════════════════════════════════════════════════
  Future<void> _boot() async {
    await _loadPending();
    final target = widget.sessionId ??
        (_pending.isEmpty ? null : _pending.first.sessionId);

    if (target == null) {
      if (mounted) setState(() { _done = true; _loading = false; });
      return;
    }
    await _loadSurvey(target);
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadPending() async {
    try {
      final r = await ApiClient.instance.get('/api/player-feedback/pending');
      if (!mounted || r is! Map || r['success'] != true) return;
      _pending = (r['pending'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => PendingSurvey.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    } catch (_) {}
  }

  /// 🔴 حلقةٌ لا استدعاءٌ ذاتيّ: `alreadyDone` يقفز للتالي، وبياناتُ خادمٍ
  ///    متناقضة كانت ستدور بلا نهاية. `visited` يكسر الدوران وسقف
  ///    التكرارات = طول الطابور + ١.
  Future<void> _loadSurvey(int sessionId) async {
    final visited = <int>{};
    var target = sessionId;
    final maxHops = _pending.length + 1;

    for (var hop = 0; hop <= maxHops; hop++) {
      if (!visited.add(target)) break;

      FeedbackSurvey? survey;
      try {
        final r = await ApiClient.instance.get('/api/player-feedback/$target');
        if (r is Map && r['success'] == true) {
          survey = FeedbackSurvey.fromJson(Map<String, dynamic>.from(r));
        }
      } catch (_) {}

      if (!mounted) return;

      // فشل التحميل: بدل نموذجٍ فارغ بلا أسئلة (سلوك الويب الخام) نعامله
      // كـ«لا استبيان مطلوب» — قرارٌ مسجَّل في 92-qa-parity.
      if (survey == null) {
        setState(() => _done = true);
        return;
      }

      if (!survey.alreadyDone) {
        setState(() {
          _activeSessionId = target;
          _questions = survey!.questions;
          _context = survey.context;
          _answers.clear();
          _notesCtrl.clear();
        });
        if (_questions.isEmpty) setState(() => _done = true);
        return;
      }

      // مُنجَز من جهازٍ آخر ⇒ أوّل معلّقٍ مختلف
      await _loadPending();
      if (!mounted) return;
      final next = _pending.where((p) => !visited.contains(p.sessionId));
      if (next.isEmpty) {
        setState(() => _done = true);
        return;
      }
      target = next.first.sessionId;
    }

    if (mounted) setState(() => _done = true);
  }

  Future<void> _submit() async {
    final id = _activeSessionId;
    if (id == null || !_allAnswered || _submitting) return;

    setState(() => _submitting = true);
    try {
      final r = await ApiClient.instance.post('/api/player-feedback/$id',
          body: {'answers': _answers, 'notes': _notesCtrl.text});
      if (!mounted) return;

      if (r is Map && r['success'] == true) {
        await _loadPending();
        if (!mounted) return;
        final remaining = _pending.where((p) => p.sessionId != id).toList();
        if (remaining.isEmpty) {
          setState(() => _done = true);
        } else {
          await _loadSurvey(remaining.first.sessionId);
          if (mounted && _scroll.hasClients) {
            _scroll.animateTo(0,
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeOut);
          }
        }
        return;
      }
      // الخطأ لا يمسح الإجابات — النموذج يبقى كما هو ليعيد المحاولة
      _error((r is Map ? r['error'] as String? : null) ?? 'تعذّر الإرسال');
    } on ApiException catch (e) {
      _error(e.message);
    } catch (_) {
      _error('تعذّر الإرسال');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _error(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message, style: ar(13))));
  }

  // ══════════════════════════════════════════════════════
  // البناء
  // ══════════════════════════════════════════════════════
  @override
  Widget build(BuildContext context) => PopsToHome(
        child: Scaffold(
          backgroundColor: const Color(0xFF050505),
          resizeToAvoidBottomInset: true,
          body: SafeArea(
            child: _loading
                ? _loadingState()
                : _done
                    ? _doneState()
                    : _form(),
          ),
        ),
      );

  // بلا spinner — تكافؤ
  Widget _loadingState() => Center(
        child: Padding(
          padding: const EdgeInsets.all(60),
          child: Text('⏳ جاري التحميل...',
              style: ar(14, color: const Color(0x80FFFFFF))),
        ),
      );

  Widget _doneState() => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 60),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('🎉', style: TextStyle(fontSize: 56)),
            const SizedBox(height: 12),
            Text('شكراً لك!',
                style: ar(22, color: Tw.green500, weight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text('أكملت كل الاستبيانات المطلوبة. رأيك يساعدنا على التحسين.',
                textAlign: TextAlign.center,
                style: ar(14, color: const Color(0x99FFFFFF))),
            const SizedBox(height: 24),
            InkWell(
              // استبدالٌ لا دفع — لا تبقى شاشة التقييم في المكدّس خلفه
              onTap: () => navigateTo(Routes.games),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 28, vertical: 12),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  gradient: const LinearGradient(
                    begin: Alignment.topRight,
                    end: Alignment.bottomLeft,
                    colors: [Tw.amber500, Color(0xFFD97706)],
                  ),
                ),
                child: Text('تصفّح الفعاليات 🎮',
                    style: ar(15, color: Colors.black, weight: FontWeight.bold)),
              ),
            ),
          ]),
        ),
      );

  Widget _form() {
    final cls = context.sizeClass;
    final maxWidth = cls == WindowSizeClass.expanded ? 640.0 : 560.0;

    return SingleChildScrollView(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 40),
      child: ContentConstraint(
        maxWidth: maxWidth,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('📋 قيّم تجربتك',
                style: ar(20, color: Tw.amber500, weight: FontWeight.w800)),
            if (_context != null) ...[
              const SizedBox(height: 6),
              _contextLine(_context!),
            ],
            if (_pending.length > 1) ...[
              const SizedBox(height: 4),
              Text('لديك ${_pending.length} استبيانات معلّقة — هذا أحدها',
                  style: ar(12, color: Tw.purple500)),
            ],
            const SizedBox(height: 20),
            _progressBar(),
            const SizedBox(height: 20),
            for (var i = 0; i < _questions.length; i++)
              _questionCard(i, _questions[i], cls),
            Text('أي ملاحظة أو اقتراح؟ (اختياري)',
                style: ar(13, color: const Color(0x99FFFFFF))),
            const SizedBox(height: 6),
            TextField(
              controller: _notesCtrl,
              minLines: 3,
              maxLines: 3,
              maxLength: kMaxNotesLength,
              style: ar(14),
              cursorColor: Tw.amber400,
              decoration: InputDecoration(
                counterText: '',
                hintText: 'اكتب ملاحظتك هنا...',
                hintStyle: ar(14, color: Tw.gray600),
                filled: true,
                fillColor: const Color(0x0DFFFFFF),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: Color(0x1FFFFFFF)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: Color(0x1FFFFFFF)),
                ),
              ),
            ),
            const SizedBox(height: 16),
            _submitButton(),
          ],
        ),
      ),
    );
  }

  /// أجزاؤه شرطية ومتسلسلة بترتيب المصدر — الفواصل جزءٌ من الجزء السابق.
  Widget _contextLine(FeedbackContext c) {
    final b = StringBuffer();
    if (c.activityName != null) b.write('🎯 ${c.activityName} · ');
    if (c.locationName != null) b.write('📍 ${c.locationName} · ');
    if (c.playedAt != null) {
      b.write('🗓️ ${DateFormat('d MMM', 'ar').format(c.playedAt!)}');
    }
    final head = b.toString();
    if (head.isEmpty && c.sessionCode == null) return const SizedBox.shrink();

    return Text.rich(
      TextSpan(children: [
        TextSpan(text: head),
        if (c.sessionCode != null)
          TextSpan(
            text: ' (غرفة ${c.sessionCode})',
            style: ar(13, color: const Color(0x4DFFFFFF), height: 1.7),
          ),
      ]),
      style: ar(13, color: const Color(0x8CFFFFFF), height: 1.7),
    );
  }

  Widget _progressBar() => ClipRRect(
        borderRadius: BorderRadius.circular(99),
        child: SizedBox(
          height: 6,
          child: Stack(children: [
            const Positioned.fill(child: ColoredBox(color: Color(0x14FFFFFF))),
            // ⚠️ `heightFactor: 1` إلزاميّ — التعبئة بلا طفلٍ ذي ارتفاع
            //    تصير صفراً فلا يُرى الشريط أبداً.
            TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: progressOf(_questions, _answers)),
              duration: const Duration(milliseconds: 250),
              builder: (_, v, __) => FractionallySizedBox(
                alignment: AlignmentDirectional.centerStart,
                widthFactor: v.clamp(0.0, 1.0),
                heightFactor: 1,
                child: const ColoredBox(color: Tw.green500),
              ),
            ),
          ]),
        ),
      );

  Widget _questionCard(int i, FeedbackQuestion q, WindowSizeClass cls) {
    final btnHeight = switch (cls) {
      WindowSizeClass.compact => 40.0,
      WindowSizeClass.medium => 52.0,
      WindowSizeClass.expanded => 60.0,
    };
    final numSize = switch (cls) {
      WindowSizeClass.compact => 16.0,
      WindowSizeClass.medium => 18.0,
      WindowSizeClass.expanded => 20.0,
    };
    final labelSize = cls == WindowSizeClass.expanded ? 10.0 : 8.0;
    final qSize = cls == WindowSizeClass.expanded ? 16.0 : 14.0;
    final idxSize = cls == WindowSizeClass.expanded ? 14.0 : 13.0;
    final gap = cls == WindowSizeClass.expanded ? 8.0 : 6.0;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: const Color(0x08FFFFFF),
        border: Border.all(color: const Color(0x12FFFFFF)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${i + 1}.',
                style: num_(idxSize, color: const Color(0x4DFFFFFF))),
            const SizedBox(width: 8),
            Expanded(
              child: Text(q.text,
                  style: ar(qSize, weight: FontWeight.w600, height: 1.5)),
            ),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            for (var k = 0; k < kFeedbackScale.length; k++) ...[
              if (k > 0) SizedBox(width: gap),
              Expanded(
                child: _scaleButton(q, kFeedbackScale[k], btnHeight, numSize,
                    labelSize),
              ),
            ],
          ]),
        ],
      ),
    );
  }

  Widget _scaleButton(FeedbackQuestion q, FeedbackScaleOption s, double height,
      double numSize, double labelSize) {
    final picked = _answers[q.key] == s.v;
    return InkWell(
      onTap: () => setState(() => _answers[q.key] = s.v),
      borderRadius: BorderRadius.circular(10),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        height: height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          color: picked ? s.color : Colors.transparent,
          border: Border.all(
              color: picked ? s.color : const Color(0x1FFFFFFF)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ltrText(
                '${s.v}',
                num_(numSize,
                    color: picked ? Colors.black : const Color(0xB3FFFFFF),
                    weight: FontWeight.w800)),
            // التسمية تظهر عند التحديد فقط
            if (picked) ...[
              const SizedBox(height: 2),
              Text(s.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ar(labelSize,
                      color: Colors.black, weight: FontWeight.w600)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _submitButton() {
    final enabled = _allAnswered && !_submitting;
    final label = _submitting
        ? '⏳ جاري الإرسال...'
        : _allAnswered
            ? 'إرسال ✓'
            : 'أجب على كل الأسئلة ($_answeredCount/${_questions.length})';

    return InkWell(
      onTap: enabled ? _submit : null,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: _allAnswered ? null : const Color(0x1AFFFFFF),
          gradient: _allAnswered
              ? const LinearGradient(
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                  colors: [Tw.green500, Color(0xFF16A34A)],
                )
              : null,
        ),
        child: Center(
          child: Text(label,
              style: ar(16,
                  color: _allAnswered ? Colors.black : const Color(0x66FFFFFF),
                  weight: FontWeight.w800)),
        ),
      ),
    );
  }
}
