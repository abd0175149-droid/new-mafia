import 'package:flutter/material.dart';

import '../../app/router.dart';
import '../../core/api/api_client.dart';
import '../../models/experience.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🌟 رأيك بتجربتك — تقييمٌ عامّ لـMafia Club (نظيرُ /player/experience في الويب)
// ══════════════════════════════════════════════════════
// يُفتح من إشعار «رأيك يهمّنا» (`/player/experience?c=ID`). الحملة والأسئلة بياناتٌ من
// الخادم؛ والإرسالُ الثاني يعدّل الأوّل ما دامت الحملة مفتوحة.

const _gold = Color(0xFFC5A059);
const _card = Color(0xFF111111);

class ExperienceScreen extends StatefulWidget {
  const ExperienceScreen({super.key, this.campaignId, this.source});
  final int? campaignId;
  final String? source;

  @override
  State<ExperienceScreen> createState() => _ExperienceScreenState();
}

class _ExperienceScreenState extends State<ExperienceScreen> {
  ExpCampaign? _campaign;
  final Map<String, dynamic> _answers = {};
  final Map<String, TextEditingController> _texts = {};
  int _textMax = 2000;
  bool _loading = true, _submitting = false, _done = false, _hadResponse = false, _introOpen = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in _texts.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await ApiClient.instance.get('/api/player-experience/current',
          query: widget.campaignId != null ? {'c': '${widget.campaignId}'} : null);
      if (!mounted) return;
      if (r is! Map || r['success'] != true) {
        setState(() { _loading = false; _error = (r is Map ? r['error'] as String? : null) ?? 'تعذّر التحميل'; });
        return;
      }
      final c = r['campaign'] is Map ? ExpCampaign.fromJson(Map<String, dynamic>.from(r['campaign'] as Map)) : null;
      final resp = r['response'];
      setState(() {
        _campaign = c;
        _textMax = (r['textMax'] as num?)?.toInt() ?? 2000;
        if (resp is Map && resp['answers'] is Map) {
          _answers.addAll(Map<String, dynamic>.from(resp['answers'] as Map));
          _hadResponse = true;
          _done = true;
        }
        for (final q in c?.questions ?? const <ExpQuestion>[]) {
          if (q.type == 'text') _texts[q.key] = TextEditingController(text: '${_answers[q.key] ?? ''}');
        }
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.message; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = 'خطأ في الاتصال بالخادم'; });
    }
  }

  List<ExpQuestion> get _missing => [
        for (final q in _campaign?.questions ?? const <ExpQuestion>[])
          if (q.required && !q.isFilled(_answers[q.key])) q,
      ];

  Future<void> _submit() async {
    final c = _campaign;
    if (c == null || _missing.isNotEmpty || _submitting) return;
    setState(() { _submitting = true; _error = null; });
    try {
      final body = <String, dynamic>{};
      _answers.forEach((k, v) { if (v != null) body[k] = v; });
      final r = await ApiClient.instance.post('/api/player-experience/${c.id}',
          body: {'answers': body, 'source': widget.source ?? 'app'});
      if (!mounted) return;
      if (r is Map && r['success'] == true) {
        setState(() { _done = true; _hadResponse = true; });
      } else {
        setState(() => _error = (r is Map ? r['error'] as String? : null) ?? 'تعذّر الإرسال');
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'خطأ في الاتصال بالخادم');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          backgroundColor: Colors.black,
          appBar: AppBar(
            backgroundColor: Colors.black,
            elevation: 0,
            title: Text('رأيك بتجربتك', style: ar(16, weight: FontWeight.w800)),
            leading: IconButton(
              icon: const Icon(Icons.arrow_forward_ios, size: 18),
              onPressed: () => navigateTo(Routes.home),
            ),
          ),
          body: _loading
              ? Center(child: Text('جارِ التحميل…', style: ar(13, color: Tw.gray500)))
              : _campaign == null
                  ? _empty()
                  : _content(),
          bottomNavigationBar: !_loading && _campaign != null && _campaign!.isOpen && !_done ? _submitBar() : null,
        ),
      );

  Widget _empty() => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('🌟', style: TextStyle(fontSize: 46)),
            const SizedBox(height: 10),
            Text('لا يوجد استبيانٌ مفتوح حالياً', style: ar(15, weight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(_error ?? 'شكراً لاهتمامك — رح نرجعلك قريباً', textAlign: TextAlign.center, style: ar(12, color: Tw.gray500)),
          ]),
        ),
      );

  Widget _content() {
    final c = _campaign!;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
      children: [
        _intro(c),
        if (_done) ...[const SizedBox(height: 16), _thanks(c)]
        else if (!c.isOpen) ...[
          const SizedBox(height: 20),
          Text('انتهى استقبال الآراء لهذا الاستبيان — شكراً لاهتمامك 🌟',
              textAlign: TextAlign.center, style: ar(13, color: Tw.gray400)),
        ] else ...[
          ..._questions(c),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, textAlign: TextAlign.center, style: ar(13, color: Tw.red400)),
          ],
        ],
      ],
    );
  }

  Widget _intro(ExpCampaign c) => Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: const Color(0xFF0F0F0F),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: const Color(0x1AFFFFFF)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (c.imageUrl != null)
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 320),
              child: Image.network(ApiClient.instance.upload(c.imageUrl), fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox.shrink()),
            ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(c.title, style: ar(17, weight: FontWeight.w900, height: 1.4)),
              if (c.intro.trim().isNotEmpty) ...[
                const SizedBox(height: 8),
                AnimatedSize(
                  duration: const Duration(milliseconds: 250),
                  alignment: Alignment.topCenter,
                  child: Text(c.intro,
                      maxLines: _introOpen ? null : 5,
                      overflow: _introOpen ? TextOverflow.visible : TextOverflow.fade,
                      style: ar(14, color: Tw.gray300, height: 1.8)),
                ),
                TextButton(
                  style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 32)),
                  onPressed: () => setState(() => _introOpen = !_introOpen),
                  child: Text(_introOpen ? 'إخفاء ▴' : 'اقرأ الرسالة كاملة ▾',
                      style: ar(13, color: _gold, weight: FontWeight.w700)),
                ),
              ],
            ]),
          ),
        ]),
      );

  Widget _thanks(ExpCampaign c) => Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: _gold.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: _gold.withValues(alpha: 0.33)),
        ),
        child: Column(children: [
          const Text('🫶🏻', style: TextStyle(fontSize: 44)),
          const SizedBox(height: 6),
          Text('وصلنا رأيك — شكراً إلك!', style: ar(17, weight: FontWeight.w900)),
          const SizedBox(height: 4),
          Text('كلّ كلمة كتبتها بتساعدنا نطوّر Mafia Club ونحافظ على روحه الحلوة.',
              textAlign: TextAlign.center, style: ar(13, color: Tw.gray300, height: 1.6)),
          const SizedBox(height: 14),
          if (c.isOpen)
            OutlinedButton(
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Color(0x26FFFFFF)),
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              ),
              onPressed: () => setState(() => _done = false),
              child: Text('✏️ عدّل رأيك', style: ar(13, weight: FontWeight.w700)),
            )
          else
            Text('انتهى استقبال الآراء لهذا الاستبيان.', style: ar(11, color: Tw.gray500)),
        ]),
      );

  List<Widget> _questions(ExpCampaign c) {
    final out = <Widget>[];
    String? section;
    for (final q in c.questions) {
      if (q.section != null && q.section != section) {
        section = q.section;
        out.add(Padding(
          padding: const EdgeInsets.only(top: 22, bottom: 10),
          child: Text(section!, style: ar(13, color: _gold, weight: FontWeight.w900)),
        ));
      } else {
        out.add(const SizedBox(height: 10));
      }
      out.add(_questionCard(q));
    }
    return out;
  }

  Widget _questionCard(ExpQuestion q) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: _card,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0x1AFFFFFF)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text.rich(TextSpan(style: ar(15, weight: FontWeight.w700, height: 1.5), children: [
            TextSpan(text: q.label),
            if (q.required) TextSpan(text: ' *', style: ar(15, color: Tw.red400)),
          ])),
          if (q.hint != null) ...[
            const SizedBox(height: 2),
            Text(q.hint!, style: ar(12, color: Tw.gray500)),
          ],
          const SizedBox(height: 12),
          switch (q.type) {
            'stars' => _stars(q),
            'nps' => _nps(q),
            'choice' || 'multi' => _chips(q),
            _ => _text(q),
          },
        ]),
      );

  Widget _stars(ExpQuestion q) {
    final v = (_answers[q.key] as num?)?.toInt() ?? 0;
    return Column(children: [
      Directionality(
        textDirection: TextDirection.ltr,
        child: Row(children: [
          for (var n = 1; n <= 5; n++) ...[
            if (n > 1) const SizedBox(width: 6),
            Expanded(
              child: AspectRatio(
                aspectRatio: 1,
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => setState(() => _answers[q.key] = n),
                  child: Container(
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: v >= n ? _gold.withValues(alpha: 0.13) : const Color(0xFF1A1A1A),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: v >= n ? _gold.withValues(alpha: 0.4) : const Color(0xFF262626)),
                    ),
                    child: Text('★', style: TextStyle(fontSize: 28, color: v >= n ? _gold : const Color(0xFF3A3A3A))),
                  ),
                ),
              ),
            ),
          ],
        ]),
      ),
      const SizedBox(height: 6),
      SizedBox(height: 16, child: Text(v > 0 ? kExpStarLabels[v - 1] : '', style: ar(12, color: _gold))),
    ]);
  }

  Color _npsColor(int n) => n <= 6 ? const Color(0xFFEF4444) : n <= 8 ? const Color(0xFFEAB308) : const Color(0xFF22C55E);

  Widget _nps(ExpQuestion q) {
    final v = (_answers[q.key] as num?)?.toInt();
    return Directionality(
      textDirection: TextDirection.ltr,
      child: Wrap(spacing: 5, runSpacing: 5, alignment: WrapAlignment.center, children: [
        for (var n = 0; n <= 10; n++)
          InkWell(
            borderRadius: BorderRadius.circular(9),
            onTap: () => setState(() => _answers[q.key] = n),
            child: Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: v == n ? _npsColor(n) : const Color(0xFF1A1A1A),
                borderRadius: BorderRadius.circular(9),
                border: Border.all(color: v == n ? _npsColor(n) : const Color(0xFF262626)),
              ),
              child: Text('$n', style: ar(14, weight: FontWeight.w900, color: v == n ? Colors.black : Tw.gray400)),
            ),
          ),
      ]),
    );
  }

  Widget _chips(ExpQuestion q) {
    final cur = _answers[q.key];
    return Wrap(spacing: 8, runSpacing: 8, children: [
      for (final o in q.options)
        Builder(builder: (_) {
          final on = q.type == 'multi' ? (cur is List && cur.contains(o)) : cur == o;
          return InkWell(
            borderRadius: BorderRadius.circular(999),
            onTap: () => setState(() {
              if (q.type == 'choice') {
                _answers[q.key] = on ? null : o;
                return;
              }
              final arr = cur is List ? List<String>.from(cur.map((e) => '$e')) : <String>[];
              if (on) {
                arr.remove(o);
              } else if (q.maxSelect == null || arr.length < q.maxSelect!) {
                arr.add(o);
              }
              _answers[q.key] = arr;
            }),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(
                color: on ? _gold.withValues(alpha: 0.13) : const Color(0xFF161616),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: on ? _gold.withValues(alpha: 0.53) : const Color(0xFF2A2A2A)),
              ),
              child: Text('${q.type == 'multi' && on ? '✓ ' : ''}$o',
                  style: ar(13, weight: FontWeight.w700, color: on ? _gold : Tw.gray300)),
            ),
          );
        }),
    ]);
  }

  Widget _text(ExpQuestion q) {
    final ctl = _texts.putIfAbsent(q.key, () => TextEditingController(text: '${_answers[q.key] ?? ''}'));
    return TextField(
      controller: ctl,
      maxLines: 5,
      minLines: 3,
      maxLength: _textMax,
      onChanged: (t) => _answers[q.key] = t,
      style: ar(14, height: 1.6),
      decoration: InputDecoration(
        hintText: q.placeholder ?? 'اكتب هون…',
        hintStyle: ar(13, color: Tw.gray600),
        filled: true,
        fillColor: const Color(0xFF0B0B0B),
        counterStyle: ar(10, color: Tw.gray600),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0x1AFFFFFF))),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0x1AFFFFFF))),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: _gold.withValues(alpha: 0.6))),
      ),
    );
  }

  Widget _submitBar() {
    final missing = _missing;
    final label = _submitting
        ? '⏳ جارِ الإرسال…'
        : missing.isNotEmpty
            ? 'أجب على «${missing.first.label.length > 26 ? '${missing.first.label.substring(0, 26)}…' : missing.first.label}»'
            : _hadResponse
                ? 'حفظ التعديل ❤️'
                : 'أرسل رأيك ❤️';
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Opacity(
          opacity: missing.isEmpty && !_submitting ? 1 : 0.45,
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: missing.isEmpty && !_submitting ? _submit : null,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 15),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                gradient: const LinearGradient(colors: [Color(0xFFF6E7BD), _gold]),
              ),
              child: Center(child: Text(label, style: ar(15, color: Colors.black, weight: FontWeight.w900))),
            ),
          ),
        ),
      ),
    );
  }
}
