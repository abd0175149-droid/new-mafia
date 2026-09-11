import 'package:flutter/cupertino.dart';
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
//
// 🔴 التقويم **داخل البوّابة** لا في نافذة Navigator (2026-09-11): البوّابة
//    مركّبة في `MaterialApp.builder` فوق شجرة الـNavigator، فأيّ نافذةٍ
//    يفتحها showDatePicker تُرسم **تحت** البوّابة — تظهر خلف الطبقة الشفّافة
//    وتذهب الضغطات إلى البوّابة لا إليها. عجلة CupertinoDatePicker مضمَّنة في
//    البطاقة نفسها تستقبل السحب مباشرةً ولا تحتاج Navigator أصلاً.

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
  // يفتح على 1998 لا على اليوم: أغلب اللاعبين مواليد التسعينات، والتمرير من
  // اليوم إلى هناك عشرات اللفّات. القيمة الابتدائيّة معروضةٌ فيُحفظ بلا سحبٍ إن ناسبت.
  DateTime? _picked = DateTime(1998, 1, 1);
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

                // التاريخ المختار — يُقرأ فوق العجلة بخطٍّ واضح
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    color: const Color(0x66000000),
                    border: Border.all(color: _gold),
                  ),
                  child: Row(children: [
                    const Icon(Icons.calendar_today_outlined, size: 17, color: _gold),
                    const SizedBox(width: 10),
                    Text(
                      '${_picked!.day}/${_picked!.month}/${_picked!.year}',
                      style: mono(16, color: Colors.white, weight: FontWeight.w700),
                    ),
                  ]),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 170,
                  child: CupertinoTheme(
                    data: const CupertinoThemeData(
                      brightness: Brightness.dark,
                      textTheme: CupertinoTextThemeData(
                        dateTimePickerTextStyle: TextStyle(
                            fontFamily: 'Tajawal', fontSize: 19, color: Colors.white),
                      ),
                    ),
                    child: CupertinoDatePicker(
                      mode: CupertinoDatePickerMode.date,
                      dateOrder: DatePickerDateOrder.dmy,
                      initialDateTime: _picked,
                      minimumYear: _minYear,
                      maximumDate: DateTime(
                          DateTime.now().year - _minAge, DateTime.now().month, DateTime.now().day),
                      onDateTimeChanged: (d) => setState(() { _picked = d; _error = null; }),
                    ),
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
