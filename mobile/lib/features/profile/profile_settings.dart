import 'dart:async';

import 'package:flutter/material.dart';
// `intl` يصدّر TextDirection خاصّاً به فيحجب نوع Flutter — نأخذ الحاجة فقط
import 'package:intl/intl.dart' show DateFormat;

import '../../core/api/api_client.dart';
import '../../core/api/auth_repository.dart';
import '../../core/ui/glass_tier.dart';
import '../../models/profile.dart';
import 'profile_palette.dart';

// ══════════════════════════════════════════════════════
// ⚙️ accordion الإعدادات — §4.3.9 في الملفّ 13
// ══════════════════════════════════════════════════════

class SettingsAccordion extends StatefulWidget {
  const SettingsAccordion({
    super.key,
    required this.player,
    required this.open,
    required this.onToggle,
    required this.onEmailSaved,
    required this.onDiagnostics,
  });

  final PlayerInfo player;
  final bool open;
  final VoidCallback onToggle;

  /// `null` يعني مسح الإيميل — لا «لم يتغيّر».
  /// يعيد `false` عند الفشل فيُسترجع الحقل. الـtoast مسؤولية المُستدعي:
  /// هو صاحب النداء وهو من يعرف رسالة الخادم.
  final Future<bool> Function(String? email) onEmailSaved;
  final VoidCallback onDiagnostics;

  @override
  State<SettingsAccordion> createState() => _SettingsAccordionState();
}

class _SettingsAccordionState extends State<SettingsAccordion> {
  bool _editingEmail = false;
  late final TextEditingController _email =
      TextEditingController(text: widget.player.email ?? '');
  final _emailFocus = FocusNode();

  bool _changingPassword = false;
  final _currentPw = TextEditingController();
  final _newPw = TextEditingController();
  String? _pwMsg;
  Timer? _pwTimer;
  bool _pwBusy = false;

  @override
  void initState() {
    super.initState();
    _emailFocus.addListener(() {
      // الحفظ عند فقد التركيز — كما الويب
      if (!_emailFocus.hasFocus && _editingEmail) _saveEmail();
    });
  }

  @override
  void dispose() {
    _pwTimer?.cancel();
    _email.dispose();
    _emailFocus.dispose();
    _currentPw.dispose();
    _newPw.dispose();
    super.dispose();
  }

  Future<void> _saveEmail() async {
    final t = _email.text.trim();
    // لم يتغيّر → إغلاق صامت. هذا الحارس يمنع أيضاً الحفظ المزدوج حين
    // يضغط Enter ثم يفقد الحقل تركيزه.
    if (t == (widget.player.email ?? '')) {
      setState(() => _editingEmail = false);
      return;
    }
    setState(() => _editingEmail = false);
    final ok = await widget.onEmailSaved(t.isEmpty ? null : t);
    if (!ok && mounted) _email.text = widget.player.email ?? '';
  }

  Future<void> _savePassword() async {
    if (_pwBusy) return;
    final newPw = _newPw.text;
    if (newPw.isEmpty || newPw.length < 4) {
      setState(() => _pwMsg = 'كلمة المرور 4 أحرف على الأقل');
      return;
    }
    setState(() => _pwBusy = true);
    try {
      await AuthRepository.instance
          .changePassword(newPw, oldPassword: _currentPw.text);
      if (!mounted) return;
      setState(() {
        _pwMsg = '✓ تم تغيير كلمة المرور';
        _currentPw.clear();
        _newPw.clear();
      });
      _pwTimer?.cancel();
      _pwTimer = Timer(const Duration(milliseconds: 2000), () {
        if (mounted) setState(() { _changingPassword = false; _pwMsg = null; });
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _pwMsg = e.message);
    } catch (_) {
      if (mounted) setState(() => _pwMsg = 'خطأ في الاتصال');
    } finally {
      if (mounted) setState(() => _pwBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: widget.onToggle,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('⚙️ إعدادات الحساب', style: ar(14, color: Tw.gray400)),
                  AnimatedRotation(
                    turns: widget.open ? 0.5 : 0,
                    duration: const Duration(milliseconds: 200),
                    child: Text('▼', style: ar(10, color: Tw.gray400)),
                  ),
                ],
              ),
            ),
          ),
          AnimatedCrossFade(
            firstChild: const SizedBox(width: double.infinity),
            secondChild: _content(),
            crossFadeState:
                widget.open ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 250),
            sizeCurve: Curves.easeOut,
          ),
        ],
      ),
    );
  }

  Widget _content() => Container(
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: Color(0x0DFFFFFF))),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _sectionTitle('📌 معلومات الحساب'),
            const SizedBox(height: 8),
            _infoRow('📱 الهاتف', maskPhone(widget.player.phone)),
            _emailRow(),
            _infoRow('👤 الجنس', widget.player.isFemale ? 'أنثى' : 'ذكر'),
            _infoRow('📅 تاريخ الانضمام', _joinDate()),
            _divider(),
            _sectionTitle('🔒 الأمان'),
            const SizedBox(height: 8),
            if (!_changingPassword)
              _linkRow('🔑 تغيير كلمة المرور', Tw.amber500,
                  () => setState(() => _changingPassword = true))
            else
              _passwordForm(),
            _divider(),
            _sectionTitle('🎨 المظهر'),
            const SizedBox(height: 8),
            _glassQualityRow(),
            const SizedBox(height: 6),
            Text('«خفيفة» تلغي تأثير الزجاج للأجهزة الضعيفة. تُطبَّق فوراً.',
                style: ar(9, color: Tw.gray600)),
            _divider(),
            _sectionTitle('🔔 الإشعارات'),
            const SizedBox(height: 8),
            _linkRow('🛠️ تشخيص الإشعارات', Tw.cyan500, widget.onDiagnostics),
            const SizedBox(height: 6),
            Text('إذا الإشعارات مش واصلة، اضغط هنا لإعادة تفعيلها.',
                style: ar(9, color: Tw.gray600)),
          ],
        ),
      );

  Widget _sectionTitle(String t) =>
      Text(t, style: ar(10, color: Tw.gray600, weight: FontWeight.w700));

  /// «جودة الواجهة» — تجاوز سلّم المادّة الزجاجيّة يدوياً (95 §3.1):
  /// تلقائي (كشف الجهاز) / فاخرة (شيدر الانكسار) / خفيفة (بلا blur).
  /// iOS لا يعرض الصفّ: مادّته تُدار داخلياً ولا معنى للتجاوز هناك.
  Widget _glassQualityRow() {
    if (Theme.of(context).platform == TargetPlatform.iOS) {
      return Text('المظهر الزجاجيّ يُدار تلقائياً على iOS.',
          style: ar(11, color: Tw.gray500));
    }
    const options = <(GlassPreference, String)>[
      (GlassPreference.auto, 'تلقائي'),
      (GlassPreference.fancy, 'فاخرة'),
      (GlassPreference.light, 'خفيفة'),
    ];
    return Row(
      children: [
        Text('جودة الواجهة', style: ar(12, color: Tw.gray500)),
        const Spacer(),
        for (final (pref, label) in options) ...[
          InkWell(
            onTap: () async {
              await GlassQuality.setPreference(pref);
              if (mounted) setState(() {});
            },
            borderRadius: BorderRadius.circular(8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: GlassQuality.preference == pref
                    ? Tw.amber500.withValues(alpha: 0.12)
                    : const Color(0x08FFFFFF),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: GlassQuality.preference == pref
                      ? Tw.amber500.withValues(alpha: 0.35)
                      : const Color(0x0FFFFFFF),
                ),
              ),
              child: Text(label,
                  style: ar(10,
                      color: GlassQuality.preference == pref
                          ? Tw.amber400
                          : Tw.gray500)),
            ),
          ),
          const SizedBox(width: 6),
        ],
      ],
    );
  }

  Widget _divider() => const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: Divider(height: 1, color: Color(0x0DFFFFFF)),
      );

  Widget _infoRow(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: ar(12, color: Tw.gray500)),
            // 🔴 رقم لاتينيّ محض داخل واجهة RTL يُقلب بصرياً
            //    (`079****4719` تُقرأ معكوسة). يُلفّ باتجاهه دائماً.
            label.startsWith('📱')
                ? Directionality(
                    textDirection: TextDirection.ltr,
                    child: Text(value, style: mono(12, color: Tw.gray400)))
                : Text(value, style: ar(12, color: Tw.gray400)),
          ],
        ),
      );

  Widget _emailRow() => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('✉️ الإيميل', style: ar(12, color: Tw.gray500)),
            if (!_editingEmail)
              InkWell(
                onTap: () {
                  setState(() => _editingEmail = true);
                  _email.text = widget.player.email ?? '';
                  WidgetsBinding.instance
                      .addPostFrameCallback((_) => _emailFocus.requestFocus());
                },
                child: Text(
                  widget.player.email ?? 'إضافة إيميل',
                  style: ar(12,
                      color: widget.player.email == null
                          ? Tw.amber400.withValues(alpha: 0.7)
                          : Tw.gray400),
                ),
              )
            else
              SizedBox(
                width: 160,
                child: Directionality(
                  textDirection: TextDirection.ltr,
                  child: TextField(
                    controller: _email,
                    focusNode: _emailFocus,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _saveEmail(),
                    style: ar(12),
                    decoration: InputDecoration(
                      isDense: true,
                      hintText: 'email@example.com',
                      hintStyle: mono(12, color: Tw.gray600),
                      contentPadding: const EdgeInsets.symmetric(vertical: 4),
                      enabledBorder: const UnderlineInputBorder(
                          borderSide: BorderSide(color: Color(0x80F59E0B))),
                      focusedBorder: const UnderlineInputBorder(
                          borderSide: BorderSide(color: Color(0x80F59E0B))),
                    ),
                  ),
                ),
              ),
          ],
        ),
      );

  Widget _linkRow(String label, Color accent, VoidCallback onTap) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: const Color(0x08FFFFFF),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0x0FFFFFFF)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: ar(12, color: Tw.gray400)),
              Text('‹', style: ar(12, color: Tw.gray600)),
            ],
          ),
        ),
      );

  Widget _passwordForm() => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0x05FFFFFF),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0x0FFFFFFF)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _pwField(_currentPw, 'كلمة المرور الحالية'),
            const SizedBox(height: 8),
            _pwField(_newPw, 'كلمة المرور الجديدة (4+ أحرف)'),
            if (_pwMsg != null) ...[
              const SizedBox(height: 8),
              // «✓» في الرسالة = نجاح. رسائل الخادم عربية وتصل كما هي،
              // والعلامة هي الإشارة الوحيدة المتاحة للتمييز.
              Text(_pwMsg!,
                  style: ar(10, color: _pwMsg!.contains('✓') ? Tw.green400 : Tw.red400)),
            ],
            const SizedBox(height: 10),
            Row(children: [
              Expanded(
                child: InkWell(
                  onTap: _pwBusy ? null : _savePassword,
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    decoration: BoxDecoration(
                      color: Tw.amber500.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Tw.amber500.withValues(alpha: 0.20)),
                    ),
                    child: Center(
                      child: Text(_pwBusy ? '…' : 'حفظ',
                          style: ar(11, color: Tw.amber400, weight: FontWeight.w700)),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              InkWell(
                onTap: () => setState(() {
                  _changingPassword = false;
                  _currentPw.clear();
                  _newPw.clear();
                  _pwMsg = null;
                }),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0x0DFFFFFF),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text('إلغاء', style: ar(11, color: Tw.gray500)),
                ),
              ),
            ]),
          ],
        ),
      );

  Widget _pwField(TextEditingController c, String hint) => Directionality(
        textDirection: TextDirection.ltr,
        child: TextField(
          controller: c,
          obscureText: true,
          // كلمة سرّ جديدة داخل شاشة إعدادات — اقتراح النظام لكلمة قوية
          // يتعارض مع الحقل الثاني على iOS
          autofillHints: const [],
          style: ar(12),
          decoration: InputDecoration(
            isDense: true,
            hintText: hint,
            hintStyle: ar(12, color: Tw.gray600),
            contentPadding: const EdgeInsets.symmetric(vertical: 6),
            enabledBorder: const UnderlineInputBorder(
                borderSide: BorderSide(color: Color(0x1AFFFFFF))),
            focusedBorder: const UnderlineInputBorder(
                borderSide: BorderSide(color: Color(0x1AFFFFFF))),
          ),
        ),
      );

  /// 🗓️ انحراف واعٍ عن الويب: الويب يستعمل `toLocaleDateString('ar-SA')`
  /// فيخرج التاريخ **هجرياً** (أم القرى) — لا لأن أحداً اختار ذلك، بل
  /// لأن المتصفّح يربط `ar-SA` بالتقويم الهجريّ افتراضاً. وكل تواريخ
  /// التطبيق الأخرى ميلادية (الأنشطة، الحجوزات، وسطر «انضم {سنة}» في
  /// رأس هذه الشاشة نفسها). عرض تاريخ الانضمام هجرياً فوق سنته الميلادية
  /// تناقضٌ ظاهر للاعب. الميلاديّ هنا مقصود ومُوثَّق.
  String _joinDate() {
    final d = widget.player.createdAt;
    if (d == null) return '—';
    return DateFormat('d MMMM yyyy', 'ar_JO').format(d);
  }
}
