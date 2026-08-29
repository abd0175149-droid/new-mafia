import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../app/theme/colors.dart';

// ══════════════════════════════════════════════════════
// 🔐 بوّابة الموافقة — سياسة الخصوصيّة وشروط الاستخدام
//
// 🔴 حاجبةٌ عمداً وأعلى المكدّس: قانون حماية البيانات الشخصيّة الأردنيّ
//    ٢٤/٢٠٢٣ لا يُجيز معالجةَ البيانات قبل الموافقة، فشاشةٌ خلفها تعمل تعني
//    أنّنا نعالج قبل أن نُؤذَن.
//
// 🔴 الحالةُ من الخادم لا من الجهاز: بوّابةٌ يقرّرها العميل وحده يتجاوزها
//    مَن يعرف كيف. والخادمُ يرفض الخدمة لغير الموافق أصلاً — هذه واجهةُ
//    القرار لا حارسُه.
//
// 🔴 وسحبُ الموافقة يُحوَّل إلى حذف: حسابٌ معلَّق لا يُحذف ولا يعمل يترك
//    بياناتٍ تُعالَج بلا سند، وهو ما يمنعه القانون.
//
// 🔴 وشرطُ آبل 5.1.1(v): الحذفُ يُبدأ من داخل التطبيق ويكتمل فعلاً — لا
//    يكفي تعطيلُ الحساب. المهلةُ ثلاثون يوماً ثمّ تجهيلٌ نهائيّ.
// ══════════════════════════════════════════════════════

const _gold = Color(0xFFC5A059);
const _ok = Color(0xFF2A8FD4);
const _no = Color(0xFFD93A3F);

const _arDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
String _ar(Object? v) => '${v ?? 0}'.replaceAllMapped(
      RegExp(r'[0-9]'),
      (m) => _arDigits[int.parse(m[0]!)],
    );

class ConsentMissing {
  ConsentMissing(this.kind, this.version, this.title, this.changeSummary, this.isUpdate);
  final String kind, version, title, changeSummary;
  final bool isUpdate;
  static ConsentMissing from(dynamic j) => ConsentMissing(
        '${j['kind']}', '${j['version']}', '${j['title']}',
        '${j['changeSummary'] ?? ''}', j['isUpdate'] == true,
      );
}

class ConsentState {
  ConsentState({
    required this.required_, required this.isMinor, required this.missing,
    this.deletionDueAt, this.age,
  });
  final bool required_, isMinor;
  final List<ConsentMissing> missing;
  final DateTime? deletionDueAt;
  final int? age;
}

/// يقرأ حالة الموافقة من الخادم. يرمي عند فشل الشبكة — والمنادي يقرّر.
Future<ConsentState> fetchConsentState() async {
  final r = await ApiClient.instance.get('/api/privacy/consent/status');
  final st = r['status'] ?? {};
  final del = r['deletion'];
  return ConsentState(
    required_: st['required'] == true,
    isMinor: st['isMinor'] == true,
    age: st['age'] is int ? st['age'] as int : null,
    missing: ((st['missing'] as List?) ?? []).map(ConsentMissing.from).toList(),
    deletionDueAt: del != null && del['dueAt'] != null
        ? DateTime.tryParse('${del['dueAt']}')
        : null,
  );
}

class ConsentGate extends StatefulWidget {
  const ConsentGate({super.key, required this.state, required this.onResolved});

  final ConsentState state;

  /// يُنادى بعد الموافقة أو الاستعادة — يُعيد المضيفُ الفحصَ ويُخفي البوّابة.
  final VoidCallback onResolved;

  @override
  State<ConsentGate> createState() => _ConsentGateState();
}

class _ConsentGateState extends State<ConsentGate> {
  final _ticks = <String, bool>{};
  final _gName = TextEditingController();
  final _gPhone = TextEditingController();
  bool _busy = false;
  String? _error;
  bool _refusing = false;
  bool _ackBalance = false;
  Map<String, dynamic>? _preview;

  @override
  void dispose() {
    _gName.dispose();
    _gPhone.dispose();
    super.dispose();
  }

  bool get _guardianOk {
    if (!widget.state.isMinor) return true;
    final p = _gPhone.text.replaceAll(RegExp(r'[\s-]'), '');
    return _gName.text.trim().length >= 3 && RegExp(r'^0?7[789]\d{7}$').hasMatch(p);
  }

  bool get _allTicked =>
      widget.state.missing.every((m) => _ticks[m.kind] == true);

  Future<void> _accept() async {
    setState(() { _busy = true; _error = null; });
    try {
      await ApiClient.instance.post('/api/privacy/consent', body: {
        'accept': widget.state.missing
            .map((m) => {'kind': m.kind, 'version': m.version})
            .toList(),
        'platform': Theme.of(context).platform == TargetPlatform.iOS ? 'ios' : 'android',
        if (widget.state.isMinor)
          'guardian': {
            'name': _gName.text.trim(),
            'phone': _gPhone.text.trim(),
            'relation': 'وليّ أمر',
          },
      });
      if (mounted) widget.onResolved();
    } catch (e) {
      if (mounted) setState(() => _error = 'تعذّر التسجيل — تحقّق من اتّصالك');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openRefuse() async {
    setState(() { _refusing = true; _error = null; _ackBalance = false; });
    try {
      final r = await ApiClient.instance.get('/api/privacy/deletion/preview');
      if (mounted) setState(() => _preview = (r['preview'] as Map?)?.cast<String, dynamic>());
    } catch (_) { /* المعاينة رفاهيّة */ }
  }

  Future<void> _delete() async {
    setState(() { _busy = true; _error = null; });
    try {
      await ApiClient.instance.post('/api/privacy/deletion', body: {
        'reason': 'refused_consent',
        'acknowledgeBalance': _ackBalance,
        'platform': Theme.of(context).platform == TargetPlatform.iOS ? 'ios' : 'android',
      });
      if (mounted) widget.onResolved();
    } catch (e) {
      if (mounted) {
        setState(() => _error = e is ApiException ? e.toString() : 'تعذّر الحذف');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _restore() async {
    setState(() { _busy = true; _error = null; });
    try {
      await ApiClient.instance.post('/api/privacy/deletion/restore');
      if (mounted) widget.onResolved();
    } catch (_) {
      if (mounted) setState(() => _error = 'تعذّرت الاستعادة');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _open(String path) async {
    final base = ApiClient.instance.baseUrl.replaceFirst(RegExp(r'/+$'), '');
    final uri = Uri.tryParse('$base$path');
    if (uri != null) await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final due = widget.state.deletionDueAt;
    return Material(
      color: Noir.pitchBlack,
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 26),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: due != null
                  ? _scheduled(due)
                  : _refusing
                      ? _refuse()
                      : _gate(),
            ),
          ),
        ),
      ),
    );
  }

  // ── حسابٌ مجدولٌ للحذف ──
  Widget _scheduled(DateTime due) {
    final days = due.difference(DateTime.now()).inDays.clamp(0, 999);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _h('حسابُك مجدولٌ للحذف'),
      const SizedBox(height: 12),
      _box(
        border: _no.withValues(alpha: .35),
        fill: _no.withValues(alpha: .06),
        child: Column(children: [
          const Text('يُمحى نهائيّاً بعد',
              style: TextStyle(fontSize: 12, color: Color(0xFF6B655C))),
          const SizedBox(height: 6),
          Text('${_ar(days)} ${days == 1 ? 'يوم' : 'يوماً'}',
              style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w900, color: _no)),
          const SizedBox(height: 8),
          const Text(
            'حسابُك معطّلٌ الآن ولا يظهر لأحد. بياناتُك محفوظةٌ مقفلةً حتّى انتهاء المهلة.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, height: 1.7, color: Color(0xFF9C958A)),
          ),
        ]),
      ),
      if (_error != null) _err(_error!),
      const SizedBox(height: 12),
      _btn('استعِد حسابي الآن', _ok, _restore),
    ]);
  }

  // ── شاشة الرفض ──
  Widget _refuse() {
    final chips = (_preview?['chipsBalance'] as num?)?.toInt() ?? 0;
    final ready = chips == 0 || _ackBalance;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _h('ما الذي ستفقده'),
      const SizedBox(height: 8),
      const Text(
        'معالجةُ بياناتك ليست خياراً إضافيّاً — هي ما يجعل الحساب واللعب ممكنَين. '
        'لذلك يتحوّل الرفضُ إلى إغلاقٍ وحذف.',
        style: TextStyle(fontSize: 14, height: 1.9, color: Color(0xFF9C958A)),
      ),
      const SizedBox(height: 12),
      _box(child: Column(children: [
        _row('🪙', 'رصيدُ رقائقك: ${_ar(chips)}',
            chips > 0 ? 'اشتُري بمالٍ حقيقيّ — يُسوّى قبل الحذف' : 'لا رصيد'),
        _row('📊', 'سجلُّ ${_ar(_preview?['matches'] ?? 0)} مباراة',
            'يبقى بلا اسمك في تاريخ خصومك'),
        _row('🎟️', '${_ar(_preview?['upcomingBookings'] ?? 0)} حجزٌ قادم',
            'يُلغى تلقائيّاً', last: true),
      ])),
      const SizedBox(height: 10),
      _box(
        border: _gold.withValues(alpha: .28),
        fill: _gold.withValues(alpha: .05),
        child: const Text(
          'لديك ٣٠ يوماً لتغيير رأيك. خلالها يختفي حسابُك من كلّ الشاشات، وتكفي عودتُك لتستعيده.',
          style: TextStyle(fontSize: 13, height: 1.9, color: Color(0xFFCFC8BC)),
        ),
      ),
      if (chips > 0) ...[
        const SizedBox(height: 10),
        _tick(_ackBalance, () => setState(() => _ackBalance = !_ackBalance),
            'أقرّ بأنّ لديّ رصيداً قائماً (${_ar(chips)} رقاقة) وأتنازل عنه، أو سأتواصل مع النادي لتسويته.'),
      ],
      if (_error != null) _err(_error!),
      const SizedBox(height: 12),
      _btn('احذف حسابي', _no, ready ? _delete : null),
      const SizedBox(height: 8),
      _btn('تراجع', null, () => setState(() { _refusing = false; _error = null; })),
    ]);
  }

  // ── البوّابة ──
  Widget _gate() {
    final isUpdate = widget.state.missing.any((m) => m.isUpdate);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _h(isUpdate ? 'تحدّثت السياسة' : 'قبل أن نبدأ'),
      const SizedBox(height: 8),
      Text(
        isUpdate
            ? 'صدرت نسخةٌ جديدة. اقرأ ما تغيّر ثمّ قرّر — موافقتُك السابقة تبقى سارية حتّى تختار.'
            : 'لتشغيل حسابك نعالج بياناتٍ تخصّك. اقرأ ما نجمعه ولماذا، ثمّ قرّر.',
        style: const TextStyle(fontSize: 14, height: 1.9, color: Color(0xFF9C958A)),
      ),
      if (widget.state.isMinor) ...[
        const SizedBox(height: 12),
        _box(
          border: _gold.withValues(alpha: .3),
          fill: _gold.withValues(alpha: .06),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('موافقة وليّ الأمر',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 4),
            const Text(
              'عمرُك دون الثامنة عشرة، ويلزم تأكيدُ وليّ أمرك. تُسجَّل الموافقةُ باسمه.',
              style: TextStyle(fontSize: 12, height: 1.7, color: Color(0xFF9C958A)),
            ),
            const SizedBox(height: 10),
            _input(_gName, 'اسمُ وليّ الأمر', TextInputType.name),
            const SizedBox(height: 8),
            _input(_gPhone, '07XXXXXXXX', TextInputType.phone),
          ]),
        ),
      ],
      const SizedBox(height: 12),
      for (final m in widget.state.missing) ...[
        if (m.isUpdate && m.changeSummary.isNotEmpty) ...[
          Text('ما تغيّر: ${m.changeSummary}',
              style: const TextStyle(fontSize: 12, height: 1.7, color: _gold)),
          const SizedBox(height: 6),
        ],
        _btn('اقرأ ${m.title} كاملةً ←', null,
            () => _open(m.kind == 'privacy' ? '/privacy' : '/terms')),
        const SizedBox(height: 8),
        _tick(_ticks[m.kind] == true,
            () => setState(() => _ticks[m.kind] = !(_ticks[m.kind] ?? false)),
            m.kind == 'privacy'
                ? 'قرأتُ سياسة الخصوصيّة وأوافق على معالجة بياناتي للأغراض المبيّنة.'
                : 'أوافق على شروط الاستخدام وقواعد اللعب.'),
        const SizedBox(height: 10),
      ],
      if (_error != null) _err(_error!),
      const SizedBox(height: 4),
      _btn(widget.state.isMinor ? 'تأكيد الموافقة' : 'موافق · متابعة', _gold,
          (_allTicked && _guardianOk) ? _accept : null, filled: true),
      const SizedBox(height: 8),
      _btn('لا أوافق', _no, _openRefuse),
      const SizedBox(height: 12),
      const Text(
        'تُسجَّل موافقتُك بنسختها ووقتها. ولك سحبُها لاحقاً من الإعدادات ← مركز الخصوصيّة.',
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 11, height: 1.7, color: Color(0xFF6B655C)),
      ),
    ]);
  }

  // ══════ قطعٌ صغيرة ══════
  Widget _h(String t) => Text(t,
      style: const TextStyle(
          fontFamily: 'Amiri', fontSize: 26, fontWeight: FontWeight.w700, color: Colors.white));

  Widget _box({required Widget child, Color? border, Color? fill}) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: fill ?? Colors.white.withValues(alpha: .028),
          border: Border.all(color: border ?? Colors.white.withValues(alpha: .06)),
          borderRadius: BorderRadius.circular(16),
        ),
        child: child,
      );

  Widget _row(String icon, String title, String sub, {bool last = false}) => Container(
        padding: const EdgeInsets.symmetric(vertical: 9),
        decoration: last
            ? null
            : BoxDecoration(
                border: Border(bottom: BorderSide(color: Colors.white.withValues(alpha: .05)))),
        child: Row(children: [
          SizedBox(width: 26, child: Text(icon, textAlign: TextAlign.center)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title,
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.bold, color: Colors.white)),
              Text(sub, style: const TextStyle(fontSize: 11, height: 1.6, color: Color(0xFF6B655C))),
            ]),
          ),
        ]),
      );

  Widget _tick(bool on, VoidCallback onTap, String text) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: .025),
            border: Border.all(color: Colors.white.withValues(alpha: .07)),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 19, height: 19, margin: const EdgeInsets.only(top: 2),
              decoration: BoxDecoration(
                color: on ? _gold : Colors.transparent,
                border: Border.all(color: on ? _gold : const Color(0xFF474139), width: 1.5),
                borderRadius: BorderRadius.circular(6),
              ),
              child: on
                  ? const Icon(Icons.check, size: 13, color: Color(0xFF100D08))
                  : null,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(text,
                  style: const TextStyle(fontSize: 13, height: 1.7, color: Color(0xFFCFC8BC))),
            ),
          ]),
        ),
      );

  Widget _input(TextEditingController c, String hint, TextInputType t) => TextField(
        controller: c,
        keyboardType: t,
        onChanged: (_) => setState(() {}),
        style: const TextStyle(fontSize: 14, color: Colors.white),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: Color(0xFF6B655C)),
          filled: true,
          fillColor: Colors.white.withValues(alpha: .04),
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: Colors.white.withValues(alpha: .1)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: Colors.white.withValues(alpha: .1)),
          ),
        ),
      );

  Widget _btn(String label, Color? tone, VoidCallback? onTap, {bool filled = false}) {
    final off = onTap == null || _busy;
    final c = tone ?? const Color(0xFF9C958A);
    return Opacity(
      opacity: off ? .45 : 1,
      child: InkWell(
        onTap: off ? null : onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 13),
          decoration: BoxDecoration(
            color: filled ? _gold : c.withValues(alpha: tone == null ? .04 : .1),
            border: Border.all(color: filled ? _gold : c.withValues(alpha: tone == null ? .12 : .45)),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Text(
            _busy && !off ? '…' : label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: filled ? const Color(0xFF100D08) : c,
            ),
          ),
        ),
      ),
    );
  }

  Widget _err(String t) => Container(
        margin: const EdgeInsets.only(top: 12),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: _no.withValues(alpha: .1),
          border: Border.all(color: _no.withValues(alpha: .3)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(t,
            style: const TextStyle(fontSize: 13, height: 1.7, color: Color(0xFFF0A9A4))),
      );
}
