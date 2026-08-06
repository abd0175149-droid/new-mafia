import 'package:flutter/material.dart';

import '../../core/routing/destination.dart';
import '../../models/activity.dart';
import '../order/order_widgets.dart' show kEmeraldText;
import '../profile/profile_palette.dart';
import 'location_menu_sheet.dart';


// ══════════════════════════════════════════════════════
// 🎟️ ورقتا النشاط والحجز — §4.1.7 و§4.1.8 في الملفّ 14
// ══════════════════════════════════════════════════════
// 🔴 `useRootNavigator: false` في الاثنتين: الويب يوقف حاجبه عند ٨٠ بكسل
//    من الأسفل فيبقى شريط التنقّل ظاهراً وقابلاً للنقر. عرضهما على
//    الـnavigator الجذر يغطّي الشريط ويكسر ذلك.

/// ارتفاع شريط التنقّل — الورقة تنتهي فوقه لا خلفه.
const double kNavInset = 64;

BoxDecoration _sheetSkin() => const BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Tw.gray900, Color(0xFF000000)],
      ),
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      border: Border(top: BorderSide(color: Color(0x1AFFFFFF))),
    );

Widget _grabHandle() => Center(
      child: Container(
        width: 48,
        height: 6,
        margin: const EdgeInsets.only(bottom: 16),
        decoration: BoxDecoration(
          color: const Color(0x33FFFFFF),
          borderRadius: BorderRadius.circular(999),
        ),
      ),
    );

// ══════════════════════════════════════════════════════
// (أ) ورقة تفاصيل النشاط
// ══════════════════════════════════════════════════════
/// تعيد `true` إن ضغط اللاعب «احجز الآن».
Future<bool?> showActivityDetails(
  BuildContext context, {
  required Activity activity,
  required bool booked,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    useRootNavigator: false,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0xE6000000),
    isScrollControlled: true,
    constraints: BoxConstraints(
      maxWidth: 512,
      maxHeight: MediaQuery.sizeOf(context).height * 0.80,
    ),
    builder: (ctx) => _DetailsSheet(activity: activity, booked: booked),
  );
}

class _DetailsSheet extends StatelessWidget {
  const _DetailsSheet({required this.activity, required this.booked});

  final Activity activity;
  final bool booked;

  @override
  Widget build(BuildContext context) {
    final a = activity;
    final d = Difficulty.of(a.difficulty);

    return DecoratedBox(
      decoration: _sheetSkin(),
      child: SingleChildScrollView(
        // 🔴 حشوة سفلية بقدر شريط التنقّل: الورقة تُعرض على navigator
        //    الفرع فتمتدّ خلف الشريط، فيغطّي الشريطُ أزرارها. رأيت
        //    «احجز الآن» نصفه تحت الشريط على الجهاز.
        padding: EdgeInsets.fromLTRB(
            24, 24, 24, 24 + kNavInset + MediaQuery.viewPaddingOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _grabHandle(),
            Text(a.name, style: ar(18, weight: FontWeight.bold)),
            if (a.description != null) ...[
              const SizedBox(height: 4),
              Text(a.description!, style: ar(12, color: Tw.gray400)),
            ],
            const SizedBox(height: 12),
            _row('📅', _longDate(a.date)),
            if (a.locationName != null) _row('📍', a.locationName!),
            _row('👥', '${a.bookedCount}/${a.maxPlayers} لاعب'),
            _row(d.icon, 'مستوى ${d.label}', color: d.color),
            if (!a.isFree) _row('💰', '${a.basePrice} د.أ'),
            // 🍽️ منيو المكان — الكتالوج الموحّد، استعراضٌ قبل الحجز
            if (a.hasMenu && a.locationId != null) _menuButton(context, a),
            if (a.offers.isNotEmpty) _offers(a),
            const SizedBox(height: 20),
            Row(children: [
              // يختفي كلياً إذا كان محجوزاً — لا زرّ يحجز ما هو محجوز
              if (!booked)
                Expanded(
                  child: InkWell(
                    onTap: () => Navigator.of(context).pop(true),
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [Color(0xFFFBBF24), Color(0xFFF59E0B)],
                        ),
                      ),
                      child: Center(
                        child: Text('احجز الآن 🎟️',
                            style: ar(14,
                                color: Colors.black, weight: FontWeight.w500)),
                      ),
                    ),
                  ),
                ),
              if (!booked && a.locationMapUrl != null) const SizedBox(width: 8),
              if (a.locationMapUrl != null)
                InkWell(
                  onTap: () => Destination.classify(a.locationMapUrl).openExternal(),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      color: const Color(0x14FFFFFF),
                      border: Border.all(color: const Color(0x1AFFFFFF)),
                    ),
                    child: Text('📍 الموقع', style: ar(14)),
                  ),
                ),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _row(String icon, String text, {Color? color}) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(children: [
          Text(icon, style: const TextStyle(fontSize: 14)),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: ar(14, color: color ?? Tw.gray300))),
        ]),
      );

  /// يُغلق ورقة التفاصيل ثمّ يفتح المنيو — ورقتان متراكبتان تحجبان الأزرار.
  Widget _menuButton(BuildContext context, Activity a) => Padding(
        padding: const EdgeInsets.only(top: 4, bottom: 8),
        child: InkWell(
          onTap: () {
            Navigator.of(context).pop();
            showLocationMenu(context,
                locationId: a.locationId!,
                locationName: a.locationName ?? 'المكان');
          },
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0x1F10B981), Color(0x0F0D9488)],
              ),
              border: Border.all(color: const Color(0x4010B981)),
            ),
            child: Row(children: [
              const Text('🍽️', style: TextStyle(fontSize: 22)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('استعرض منيو ${a.locationName ?? 'المكان'}',
                        style: ar(14, color: kEmeraldText, weight: FontWeight.bold)),
                    const SizedBox(height: 2),
                    Text('الأصناف والعروض وأسعارها — الطلب يفتح قبل موعد الفعاليّة بساعة',
                        style: ar(10, color: Tw.gray500, height: 1.4)),
                  ],
                ),
              ),
              Text('←', style: ar(14, color: kEmeraldText)),
            ]),
          ),
        ),
      );

  Widget _offers(Activity a) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 12),
          Text('🎁 العروض المتاحة (سيطلب تحديدها عند الحجز):',
              style: ar(12, color: Tw.gray400, weight: FontWeight.bold)),
          const SizedBox(height: 12),
          SizedBox(
            height: 130,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              physics: const PageScrollPhysics(),
              itemCount: a.offers.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (_, i) => _offerCard(a.offers[i], i),
            ),
          ),
        ],
      );

  Widget _offerCard(LocationOffer o, int i) => Container(
        width: 192,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: const LinearGradient(
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
            colors: [Color(0x0DFFFFFF), Color(0x05FFFFFF)],
          ),
          border: Border.all(color: const Color(0x1AFFFFFF)),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(o.labelAt(i),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: ar(14, color: Tw.amber400, weight: FontWeight.bold)),
            if (o.price != null) ...[
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(4),
                  color: const Color(0x1AF59E0B),
                ),
                child: Text('${o.price} د.أ',
                    style: ar(10, color: Tw.amber500, weight: FontWeight.bold)),
              ),
            ],
            if (o.description != null) ...[
              const SizedBox(height: 6),
              Flexible(
                child: Text(o.description!,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: ar(10, color: Tw.gray400, height: 1.5)),
              ),
            ],
          ],
        ),
      );

  static String _longDate(DateTime d) =>
      '${dayNameOf(d)} ${d.day} ${monthNameOf(d)} ${d.year} • '
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

// ══════════════════════════════════════════════════════
// (ب) ورقة تأكيد الحجز
// ══════════════════════════════════════════════════════
/// تعيد فهرس العرض المختار، أو `-1` إن لم تكن هناك عروض، أو `null` إلغاءً.
Future<int?> showBookingConfirm(BuildContext context, {required Activity activity}) {
  return showModalBottomSheet<int>(
    context: context,
    useRootNavigator: false,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0xE6000000),
    isScrollControlled: true,
    constraints: BoxConstraints(
      maxWidth: 384,
      maxHeight: MediaQuery.sizeOf(context).height * 0.80,
    ),
    builder: (_) => _ConfirmSheet(activity: activity),
  );
}

class _ConfirmSheet extends StatefulWidget {
  const _ConfirmSheet({required this.activity});
  final Activity activity;

  @override
  State<_ConfirmSheet> createState() => _ConfirmSheetState();
}

class _ConfirmSheetState extends State<_ConfirmSheet> {
  int? _offer;
  bool _error = false;

  void _confirm() {
    final a = widget.activity;
    if (a.offers.isNotEmpty && _offer == null) {
      setState(() => _error = true);
      return;
    }
    Navigator.of(context).pop(_offer ?? -1);
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.activity;

    return DecoratedBox(
      decoration: _sheetSkin(),
      child: SingleChildScrollView(
        // 🔴 حشوة سفلية بقدر شريط التنقّل: الورقة تُعرض على navigator
        //    الفرع فتمتدّ خلف الشريط، فيغطّي الشريطُ أزرارها. رأيت
        //    «احجز الآن» نصفه تحت الشريط على الجهاز.
        padding: EdgeInsets.fromLTRB(
            24, 24, 24, 24 + kNavInset + MediaQuery.viewPaddingOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _grabHandle(),
            Center(child: Text('تأكيد الحجز', style: ar(18, weight: FontWeight.bold))),
            const SizedBox(height: 2),
            Center(
              child: Text(a.name,
                  textAlign: TextAlign.center, style: ar(14, color: Tw.gray400)),
            ),
            const SizedBox(height: 16),
            _line('📅 ${_ConfirmSheetState._date(a.date)}'),
            if (a.locationName != null) _line('📍 ${a.locationName}'),
            _line('👥 ${a.bookedCount}/${a.maxPlayers} لاعب'),
            if (!a.isFree) _line('💰 ${a.basePrice} د.أ'),
            if (a.offers.isNotEmpty) _offerPicker(a),
            if (_error) ...[
              const SizedBox(height: 12),
              Center(
                child: Text('⚠️ يرجى اختيار عرض قبل تأكيد الحجز',
                    style: ar(12,
                        color: const Color(0xFFF87171), weight: FontWeight.bold)),
              ),
            ],
            const SizedBox(height: 20),
            Row(children: [
              Expanded(
                child: InkWell(
                  onTap: () => Navigator.of(context).pop(),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      color: const Color(0x0DFFFFFF),
                      border: Border.all(color: const Color(0x14FFFFFF)),
                    ),
                    child: Center(child: Text('إلغاء', style: ar(14, color: Tw.gray400))),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: InkWell(
                  onTap: _confirm,
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFFFBBF24), Color(0xFFF59E0B)],
                      ),
                    ),
                    child: Center(
                      child: Text('✅ تأكيد الحجز',
                          style: ar(14, color: Colors.black, weight: FontWeight.w500)),
                    ),
                  ),
                ),
              ),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _line(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(t, style: ar(14, color: Tw.gray300)),
      );

  Widget _offerPicker(Activity a) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 16),
          Text.rich(TextSpan(children: [
            TextSpan(
                text: '🎁 اختر العرض المناسب لك ',
                style: ar(12, color: Tw.gray400, weight: FontWeight.bold)),
            TextSpan(
                text: '*',
                style: ar(12,
                    color: const Color(0xFFF87171), weight: FontWeight.bold)),
            TextSpan(text: ':', style: ar(12, color: Tw.gray400)),
          ])),
          const SizedBox(height: 8),
          ConstrainedBox(
            constraints:
                BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.30),
            child: ListView.separated(
              shrinkWrap: true,
              itemCount: a.offers.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _offerOption(a.offers[i], i),
            ),
          ),
        ],
      );

  Widget _offerOption(LocationOffer o, int i) {
    final on = _offer == i;
    return InkWell(
      // 🔴 نقر الخيار المحدَّد **يلغيه**. لا Radio قياسيّ: لا يدعم الإلغاء،
      //    ولاعبٌ اختار بالخطأ ولا يجد كيف يتراجع سيغلق الورقة كلها.
      onTap: () => setState(() {
        _offer = on ? null : i;
        _error = false;
      }),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: on ? const Color(0x1AF59E0B) : const Color(0x0DFFFFFF),
          border: Border.all(
              color: on ? Tw.amber500 : const Color(0x1AFFFFFF)),
          boxShadow: on
              ? [const BoxShadow(color: Color(0x26F59E0B), blurRadius: 15)]
              : null,
        ),
        child: Row(children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(o.labelAt(i),
                    style: ar(14,
                        color: on ? Tw.amber400 : Tw.gray300,
                        weight: on ? FontWeight.bold : FontWeight.w400)),
                if (o.price != null) ...[
                  const SizedBox(height: 4),
                  Text('${o.price} د.أ',
                      style: ar(10, color: const Color(0xCCF59E0B))),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: on ? const Color(0x33F59E0B) : const Color(0x80000000),
              border: Border.all(color: on ? Tw.amber500 : Tw.gray600, width: 2),
            ),
            child: on
                ? Center(
                    child: Container(
                      width: 10,
                      height: 10,
                      decoration: const BoxDecoration(
                          shape: BoxShape.circle, color: Tw.amber400),
                    ),
                  )
                : null,
          ),
        ]),
      ),
    );
  }

  static String _date(DateTime d) =>
      '${dayNameOf(d)} ${d.day} ${monthNameOf(d)} • '
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}
