import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/storage/session_store.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🎂 BDAY-1 — بوّابة تاريخ الميلاد
// ══════════════════════════════════════════════════════
// 🔴 لماذا: النادي يمنح عيديّةً سنويّة، ولاعب التطبيق **لم يكن يُسأل عن
//    ميلاده إطلاقاً** — بينما الويب يحجبه بمودالٍ إلزاميّ. فمن سجّل من
//    التطبيق لا يستلم عيديّته أبداً، رغم أن شاشة المحفظة نفسها تعرض بند
//    «🎂 عيد ميلادك — عيديّة من النادي».
//
// 🔴 تُسأل مرّةً واحدة: الحقل يُقرأ من `/me` وتُغلق البوّابة بمجرّد حفظه.
//    ولا تُعرض للضيف ولا قبل حسم الجلسة.

const _gold = Color(0xFFC5A059);

/// أقدم سنةٍ مقبولة — يطابق الويب.
const _minYear = 1940;

/// أصغر عمرٍ مقبول — يطابق الويب.
const _minAge = 8;

class BirthdayGate extends StatefulWidget {
  const BirthdayGate({super.key, required this.onSaved});

  final VoidCallback onSaved;

  @override
  State<BirthdayGate> createState() => _BirthdayGateState();
}

class _BirthdayGateState extends State<BirthdayGate> {
  DateTime? _picked;
  bool _busy = false;
  String? _error;

  /// يتحقّق كما يتحقّق الويب حرفياً — تباينُ القواعد بين المنصّتين يعني
  /// تاريخاً يُقبل هنا ويُرفض هناك.
  String? _validate(DateTime d) {
    final now = DateTime.now();
    if (d.isAfter(now)) return 'تاريخ غير منطقيّ';
    if (d.year < _minYear) return 'تاريخ غير منطقيّ';
    var age = now.year - d.year;
    if (now.month < d.month || (now.month == d.month && now.day < d.day)) age--;
    if (age < _minAge) return 'التاريخ المُدخَل يبدو غير صحيح';
    return null;
  }

  Future<void> _pick() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      // 🔴 يفتح على 1998 لا على اليوم: التمرير من اليوم إلى الثمانينات
      //    عشرات اللفّات، وأغلب اللاعبين مواليد التسعينات.
      initialDate: _picked ?? DateTime(1998, 1, 1),
      firstDate: DateTime(_minYear),
      lastDate: DateTime(now.year - _minAge, now.month, now.day),
      helpText: 'تاريخ ميلادك',
      cancelText: 'إلغاء',
      confirmText: 'تأكيد',
    );
    if (d != null && mounted) setState(() { _picked = d; _error = null; });
  }

  Future<void> _save() async {
    final d = _picked;
    if (d == null) { setState(() => _error = 'اختر تاريخاً أوّلاً'); return; }
    final bad = _validate(d);
    if (bad != null) { setState(() => _error = bad); return; }

    final id = SessionStore.instance.player?.id;
    if (id == null) return;

    setState(() { _busy = true; _error = null; });
    try {
      final iso = '${d.year.toString().padLeft(4, '0')}-'
          '${d.month.toString().padLeft(2, '0')}-'
          '${d.day.toString().padLeft(2, '0')}';
      await ApiClient.instance.put('/api/player/$id/profile', body: {'dob': iso});
      if (mounted) widget.onSaved();
    } catch (_) {
      if (mounted) {
        setState(() { _busy = false; _error = 'تعذّر الحفظ — حاول مجدّداً'; });
      }
    }
  }

  @override
  Widget build(BuildContext context) => ColoredBox(
        color: const Color(0xF01A1008),
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 40),
            child: Container(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 20),
              decoration: BoxDecoration(
                color: const Color(0xFF0D0B08),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0x59C5A059)),
              ),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text('🎂', style: TextStyle(fontSize: 44)),
                const SizedBox(height: 12),
                const Text('متى عيد ميلادك؟',
                    style: TextStyle(
                        fontFamily: 'Amiri',
                        fontSize: 23,
                        fontWeight: FontWeight.w900,
                        color: _gold)),
                const SizedBox(height: 8),
                Text(
                  'النادي يرسل لك عيديّةً كلّ عام — ولن نعرف موعدها بدون هذا.',
                  textAlign: TextAlign.center,
                  style: ar(13, color: const Color(0xFFB3A895)),
                ),
                const SizedBox(height: 20),

                GestureDetector(
                  onTap: _busy ? null : _pick,
                  behavior: HitTestBehavior.opaque,
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      color: const Color(0x66000000),
                      border: Border.all(
                          color: _picked == null
                              ? const Color(0xFF2A2A2A)
                              : _gold),
                    ),
                    child: Row(children: [
                      const Icon(Icons.calendar_today_outlined,
                          size: 17, color: _gold),
                      const SizedBox(width: 10),
                      Text(
                        _picked == null
                            ? 'اختر التاريخ'
                            : '${_picked!.day}/${_picked!.month}/${_picked!.year}',
                        style: _picked == null
                            ? ar(13.5, color: const Color(0xFF777777))
                            : mono(15, color: Colors.white,
                                weight: FontWeight.w700),
                      ),
                    ]),
                  ),
                ),

                if (_error != null) ...[
                  const SizedBox(height: 10),
                  Text(_error!,
                      textAlign: TextAlign.center,
                      style: ar(12, color: const Color(0xFFFCA5A5))),
                ],

                const SizedBox(height: 18),
                GestureDetector(
                  onTap: _busy ? null : _save,
                  behavior: HitTestBehavior.opaque,
                  child: Opacity(
                    opacity: _busy ? 0.5 : 1,
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        color: const Color(0x26C5A059),
                        border: Border.all(color: _gold),
                      ),
                      child: _busy
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2.4, color: _gold),
                            )
                          : Text('حفظ',
                              style: ar(14.5,
                                  color: _gold, weight: FontWeight.w900)),
                    ),
                  ),
                ),
              ]),
            ),
          ),
        ),
      );
}
