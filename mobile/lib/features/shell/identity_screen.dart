import 'package:flutter/material.dart';

import '../../app/config.dart';
import '../../app/theme/theme.dart';
import '../../core/ui/atmosphere.dart';

// ══════════════════════════════════════════════════════
// 🎭 شاشة الهويّة — مخرَج M0
// ══════════════════════════════════════════════════════
// ليست شاشة منتَج: غرضها إثبات أن الأساس صحيح على جهاز حقيقيّ —
// الخطوط محمَّلة، والألوان مطابقة، والاتجاه RTL، وطبقات الأجواء
// ترسم، وفئة الحجم تُقرأ صحيحةً. تُستبدل بالكامل في M2 (الملف 11).

class IdentityScreen extends StatelessWidget {
  const IdentityScreen({super.key, required this.config});

  final AppConfig config;

  @override
  Widget build(BuildContext context) {
    final cls = context.sizeClass;
    final w = MediaQuery.sizeOf(context).width;

    return Scaffold(
      body: DisplayBg(
        child: Stack(
          children: [
            const Positioned.fill(child: BloodVignette()),
            SafeArea(
              child: ContentConstraint(
                child: SingleChildScrollView(
                  padding: EdgeInsets.all(context.pagePadding),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SizedBox(height: context.sectionGap * 2),

                      Text('نادي المافيا',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.displayLarge),
                      SizedBox(height: context.sectionGap / 2),
                      Text('الأساس جاهز — M0',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.headlineMedium),

                      SizedBox(height: context.sectionGap * 2),

                      _Card(children: [
                        _Row('النكهة', config.isDev ? 'dev — staging' : 'prod — الإنتاج'),
                        _Row('الخادم', config.baseUrl),
                        _Row('فئة الحجم', '${cls.name} · ${w.toStringAsFixed(0)}dp'),
                        _Row('معامل اللعب', '×${context.gameScale}'),
                        _Row('الاتجاه', Directionality.of(context) == TextDirection.rtl ? 'RTL ✓' : 'LTR ✗'),
                      ]),

                      SizedBox(height: context.sectionGap),

                      // ── إثبات تحميل الخطوط ──
                      _Card(children: [
                        Text('الخطوط', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 10),
                        const Text('العنوان بخطّ أميري — يظهر بوصلاته',
                            style: TextStyle(fontFamily: 'Amiri', fontSize: 19, fontWeight: FontWeight.w700, color: Noir.vintageGold)),
                        const SizedBox(height: 6),
                        const Text('نصّ الجسم بخطّ تجوّل، وهو الخطّ الفعليّ للواجهة.',
                            style: TextStyle(fontFamily: 'Tajawal', fontSize: 14, color: Noir.textMuted)),
                        const SizedBox(height: 6),
                        Text('SEAT 07 · 02:45', style: monoStyle(size: 13, color: Noir.citizenText)),
                      ]),

                      SizedBox(height: context.sectionGap),

                      // ── إثبات الألوان الثلاثة الذهبية ──
                      _Card(children: [
                        Text('الذهبيات الثلاثة — متمايزة', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 10),
                        Row(children: const [
                          _Swatch(Noir.vintageGold, 'البراند'),
                          SizedBox(width: 8),
                          _Swatch(Color(0xFFEAB308), 'Tailwind'),
                          SizedBox(width: 8),
                          _Swatch(Color(0xFFF59E0B), 'عنبريّ'),
                          SizedBox(width: 8),
                          _Swatch(Noir.bloodRed, 'الدم'),
                        ]),
                      ]),

                      SizedBox(height: context.sectionGap),

                      Center(
                        child: Text('١٢٣٤٥٦٧٨٩٠', style: goldNumberStyle),
                      ),

                      SizedBox(height: context.sectionGap * 2),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// بطاقة نوار: زوايا حادّة، حدّ رفيع، وإطار داخليّ مزدوج بهامش 4 —
/// تأثير برواز الصورة، وهو توقيع البراند لا زخرفة.
class _Card extends StatelessWidget {
  const _Card({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(
          color: Noir.noirCardBg,
          border: Border.fromBorderSide(BorderSide(color: Noir.noirBorder)),
          borderRadius: NoirRadius.noir,
          boxShadow: NoirShadows.noirCard,
        ),
        padding: const EdgeInsets.all(4),
        child: Container(
          decoration: BoxDecoration(
            border: Border.all(color: MafiaScales.dark[850]!, width: 1.5),
          ),
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
        ),
      );
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          children: [
            SizedBox(width: 96, child: Text(label, style: Theme.of(context).textTheme.bodySmall)),
            Expanded(
              child: Text(value,
                  style: monoStyle(size: 12, color: Noir.citizenText), textAlign: TextAlign.left),
            ),
          ],
        ),
      );
}

class _Swatch extends StatelessWidget {
  const _Swatch(this.color, this.label);
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(
          children: [
            Container(height: 34, decoration: BoxDecoration(color: color)),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontFamily: 'Tajawal', fontSize: 10, color: Noir.textMuted)),
          ],
        ),
      );
}
