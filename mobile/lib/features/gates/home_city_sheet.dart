import 'package:flutter/material.dart';

import '../../app/router.dart';
import '../../app/theme/colors.dart';
import '../../core/api/api_client.dart';
import '../../core/cities/city_service.dart';
import '../../models/city.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🏙️ «أين تلعب عادةً؟» — اختيار المدينة الأساسيّة
// ══════════════════════════════════════════════════════
// تُعرض **مرّةً** لمن لا مدينةَ له (مسجّلٌ جديد أو بلا مباريات) وحين توجد
// مدينتان فأكثر. لمن له تاريخ يستنتج الخادم مدينته فلا تُعرض أصلاً.
//
// 🔴 ليست بوّابةً حاجبة: المدينة الأساسيّة تغيّر **الافتراضيّات** وحدها
//    (الفعاليّات، الترتيب، البطاقة) — فالحجب هنا عقوبةٌ بلا سبب. «لاحقًا»
//    يكتب علامةً فلا تعود، والإغلاق بالنقر خارجها تأجيلٌ إلى الفتحة التالية.

/// حتى لا تُعرض مرّتين في جلسةٍ واحدة (الرئيسيّة تعيد الجلب كثيراً).
bool _askedThisSession = false;

/// يعرض الورقة إن لزم. يُنادى من الرئيسيّة بعد وصول البروفايل.
///
/// [onSaved] يصل بالمعرّف والاسم كما أكّدهما الخادم.
Future<void> maybeShowHomeCitySheet(
  BuildContext context, {
  required int? homeCityId,
  List<City>? cities,
  void Function(int cityId, String cityName)? onSaved,
}) async {
  if (homeCityId != null || _askedThisSession) return;
  if (await CityService.instance.homeCityPromptShown()) return;

  final list = (cities != null && cities.isNotEmpty)
      ? cities
      : await CityService.instance.cities();
  if (list.length < 2) return;

  // 🔴 لا تُكدَّس فوق ورقةٍ أخرى (تمهيد الموقع يُفتح مع الغلاف): ننتظر
  //    حتى يخلو الجذر — نصف دقيقة كحدّ، وإلا فالفتحة التالية.
  for (var i = 0; i < 15; i++) {
    if (!context.mounted) return;
    final nav = rootNavigatorKey.currentState;
    if (nav != null && !nav.canPop()) break;
    await Future<void>.delayed(const Duration(seconds: 2));
  }
  if (!context.mounted || _askedThisSession) return;
  final nav = rootNavigatorKey.currentState;
  if (nav == null || nav.canPop()) return;

  _askedThisSession = true;
  final picked = await showHomeCityPicker(context, cities: list, firstRun: true);
  if (picked != null) onSaved?.call(picked.$1, picked.$2);
}

/// ورقة الاختيار — تُستعمل أيضاً من الإعدادات («مدينتي الأساسيّة»).
///
/// تعيد (المعرّف، الاسم) بعد حفظٍ ناجح، و`null` عند الإلغاء.
Future<(int, String)?> showHomeCityPicker(
  BuildContext context, {
  required List<City> cities,
  int? currentId,
  bool firstRun = false,
}) {
  return showModalBottomSheet<(int, String)>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0xE6000000),
    constraints: const BoxConstraints(maxWidth: 512),
    builder: (_) => _HomeCitySheet(
      cities: cities,
      currentId: currentId,
      firstRun: firstRun,
    ),
  );
}

class _HomeCitySheet extends StatefulWidget {
  const _HomeCitySheet({
    required this.cities,
    required this.currentId,
    required this.firstRun,
  });

  final List<City> cities;
  final int? currentId;
  final bool firstRun;

  @override
  State<_HomeCitySheet> createState() => _HomeCitySheetState();
}

class _HomeCitySheetState extends State<_HomeCitySheet> {
  late int? _picked = widget.currentId;
  bool _busy = false;
  String? _error;

  Future<void> _save() async {
    final id = _picked;
    if (id == null || _busy) return;
    setState(() { _busy = true; _error = null; });
    try {
      final res = await CityService.instance.setHomeCity(id);
      if (!mounted) return;
      Navigator.of(context).pop(res);
    } on ApiException catch (e) {
      if (mounted) setState(() { _busy = false; _error = e.message; });
    } catch (_) {
      if (mounted) setState(() { _busy = false; _error = 'تعذّر الاتصال بالخادم'; });
    }
  }

  Future<void> _later() async {
    // «لاحقًا» قرارٌ صريح — يُكتب فلا تعود الورقة.
    if (widget.firstRun) await CityService.instance.markHomeCityPromptShown();
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final svc = CityService.instance;
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Noir.noirCardBg,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Noir.vintageGold.withValues(alpha: 0.28)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 64, height: 64,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Noir.vintageGold.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: Noir.vintageGold.withValues(alpha: 0.3)),
              ),
              child: const Text('🏙️', style: TextStyle(fontSize: 30)),
            ),
            const SizedBox(height: 16),
            Text(widget.firstRun ? 'أين تلعب عادةً؟' : 'مدينتي الأساسيّة',
                textAlign: TextAlign.center,
                style: ar(17, weight: FontWeight.w900)),
            const SizedBox(height: 8),
            Text(
              'لكلّ مدينةٍ ترتيبٌ ورتبةٌ مستقلّان. مدينتك الأساسيّة تحدّد ما تراه '
              'أوّلاً في الفعاليّات والتصنيف — وتقدر تلعب في أيّ مدينةٍ أخرى متى شئت.',
              textAlign: TextAlign.center,
              style: ar(12, color: Tw.gray400, height: 1.6),
            ),
            const SizedBox(height: 18),
            for (final c in widget.cities) ...[
              _cityCard(c, svc),
              const SizedBox(height: 8),
            ],
            if (_error != null) ...[
              const SizedBox(height: 4),
              Text(_error!,
                  textAlign: TextAlign.center,
                  style: ar(11, color: const Color(0xFFF87171), weight: FontWeight.w700)),
            ],
            const SizedBox(height: 10),
            InkWell(
              onTap: (_picked == null || _busy) ? null : _save,
              borderRadius: BorderRadius.circular(12),
              child: Opacity(
                opacity: (_picked == null || _busy) ? 0.5 : 1,
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFFFBBF24), Color(0xFFF59E0B)],
                    ),
                  ),
                  child: Center(
                    child: Text(_busy ? '...' : 'متابعة',
                        style: ar(14, color: Colors.black, weight: FontWeight.w700)),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _busy ? null : _later,
              child: Text(widget.firstRun ? 'لاحقًا' : 'إلغاء',
                  style: ar(13, color: Tw.gray500)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _cityCard(City c, CityService svc) {
    final on = _picked == c.id;
    final accent = svc.accentFor(c.id);
    final text = svc.textFor(c.id);
    return InkWell(
      onTap: _busy ? null : () => setState(() => _picked = c.id),
      borderRadius: BorderRadius.circular(14),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: on ? accent.withValues(alpha: 0.14) : const Color(0x08FFFFFF),
          border: Border.all(
            color: on ? accent.withValues(alpha: 0.55) : const Color(0x0FFFFFFF),
            width: on ? 1.5 : 1,
          ),
        ),
        child: Row(children: [
          Container(
            width: 10, height: 10,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: on ? accent : const Color(0x33FFFFFF),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(c.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: ar(14,
                    color: on ? text : Colors.white,
                    weight: on ? FontWeight.w700 : FontWeight.w500)),
          ),
          if (c.id == widget.currentId)
            Text('الحاليّة', style: ar(10, color: Tw.gray500)),
          if (on) ...[
            const SizedBox(width: 8),
            Text('✓', style: ar(14, color: text, weight: FontWeight.w900)),
          ],
        ]),
      ),
    );
  }
}
