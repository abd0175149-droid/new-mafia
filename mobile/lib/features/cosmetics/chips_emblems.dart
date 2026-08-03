import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'card_fx_layer.dart' show FxClock;

// ══════════════════════════════════════════════════════
// 🪙 شعارات الإطارات — منقولة عن `components/ChipsEmblems.tsx`
// ══════════════════════════════════════════════════════
// 🔴 مسارات SVG منسوخة **حرفاً بحرف** لا معادَ رسمها: هذه رسومٌ يدويّة
//    بتدرّجات وتفاصيل، وإعادة تتبّعها بيدٍ ثانية تُنتج شعاراً شبيهاً لا
//    الشعار الذي دفع اللاعب ثمنه.
//
// الحركة في الويب على **عنصرٍ داخل** الـSVG (شرارة · قطرة · خصلة دخان)،
// فيُفصَل ذلك العنصر إلى طبقةٍ ثانية تُحرَّك هنا. وما تتحرّك فيه الصورة
// كلّها (الرقاقة · النيون) يُحرَّك جملةً.

enum EmblemId { don, blood, neon, bullet, smoke, deal, crime, champ }

const _emblemIds = <String, EmblemId>{
  'don': EmblemId.don,
  'blood': EmblemId.blood,
  'neon': EmblemId.neon,
  'bullet': EmblemId.bullet,
  'smoke': EmblemId.smoke,
  'deal': EmblemId.deal,
  'crime': EmblemId.crime,
  'champ': EmblemId.champ,
};

EmblemId? emblemIdOf(String? raw) => raw == null ? null : _emblemIds[raw];

/// نسب العرض/الارتفاع كما في `viewBox` كل شعار.
const _aspect = <EmblemId, ({double w, double h})>{
  EmblemId.don: (w: 72, h: 56),
  EmblemId.blood: (w: 40, h: 76),
  EmblemId.neon: (w: 64, h: 64),
  EmblemId.bullet: (w: 64, h: 44),
  EmblemId.smoke: (w: 72, h: 52),
  EmblemId.deal: (w: 64, h: 64),
  EmblemId.crime: (w: 64, h: 64),
  EmblemId.champ: (w: 76, h: 56),
};

// ══════════════════════════════════════════════════════
// المصادر
// ══════════════════════════════════════════════════════

const _donBody = '''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 56" fill="none">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#fde68a"/><stop offset="0.5" stop-color="#f59e0b"/><stop offset="1" stop-color="#b45309"/>
</linearGradient>
<linearGradient id="b" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#b45309"/><stop offset="0.5" stop-color="#fcd34d"/><stop offset="1" stop-color="#b45309"/>
</linearGradient>
<radialGradient id="r">
<stop offset="0" stop-color="#fde68a" stop-opacity="0.45"/><stop offset="1" stop-color="#fde68a" stop-opacity="0"/>
</radialGradient>
</defs>
<circle cx="36" cy="30" r="26" fill="url(#r)"/>
<path d="M11,40 L15,19 L25,31 L36,11 L47,31 L57,19 L61,40 Z" fill="url(#g)" stroke="#92400e" stroke-width="1.5" stroke-linejoin="round"/>
<rect x="11" y="40" width="50" height="9" rx="2.5" fill="url(#b)" stroke="#92400e" stroke-width="1.2"/>
<circle cx="36" cy="44.5" r="3.2" fill="#dc2626" stroke="#7f1d1d" stroke-width="0.8"/>
<circle cx="22" cy="44.5" r="2.2" fill="#2563eb" stroke="#1e3a8a" stroke-width="0.8"/>
<circle cx="50" cy="44.5" r="2.2" fill="#2563eb" stroke="#1e3a8a" stroke-width="0.8"/>
<circle cx="15" cy="19" r="2.6" fill="#fef3c7" stroke="#d97706" stroke-width="0.8"/>
<circle cx="36" cy="11" r="3" fill="#fef3c7" stroke="#d97706" stroke-width="0.8"/>
<circle cx="57" cy="19" r="2.6" fill="#fef3c7" stroke="#d97706" stroke-width="0.8"/>
</svg>''';

const _donSpark = '''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 56" fill="none">
<path d="M63,6 l1.6,3.4 3.4,1.6 -3.4,1.6 -1.6,3.4 -1.6,-3.4 -3.4,-1.6 3.4,-1.6 Z" fill="#fef9c3"/>
</svg>''';

const _bloodBody = '''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 76" fill="none">
<defs>
<linearGradient id="s" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#f8fafc"/><stop offset="0.5" stop-color="#94a3b8"/><stop offset="1" stop-color="#475569"/>
</linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#fcd34d"/><stop offset="1" stop-color="#b45309"/>
</linearGradient>
</defs>
<circle cx="20" cy="8" r="4.5" fill="url(#g)" stroke="#78350f" stroke-width="1"/>
<circle cx="20" cy="8" r="1.7" fill="#dc2626"/>
<rect x="16.5" y="12" width="7" height="14" rx="3" fill="#450a0a" stroke="#7f1d1d" stroke-width="1"/>
<path d="M16.5,16.5 h7 M16.5,20.5 h7" stroke="#7f1d1d" stroke-width="0.9"/>
<rect x="7" y="26" width="26" height="5.5" rx="2.5" fill="url(#g)" stroke="#78350f" stroke-width="1"/>
<path d="M14.5,31.5 L20,70 L25.5,31.5 Z" fill="url(#s)" stroke="#64748b" stroke-width="0.8" stroke-linejoin="round"/>
<path d="M20,34 L20,60" stroke="#e2e8f0" stroke-width="1" opacity="0.7"/>
</svg>''';

const _bloodDrop = '''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 76" fill="none">
<ellipse cx="20" cy="72" rx="2.2" ry="2.8" fill="#dc2626"/>
</svg>''';

const _neon = '''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
<circle cx="32" cy="32" r="27" stroke="#ec4899" stroke-width="3"/>
<path d="M32,13 C23,25 16,29 16,37 C16,43.5 22.5,46 27.5,42.5 C27,47.5 25,50.5 22,53 L42,53 C39,50.5 37,47.5 36.5,42.5 C41.5,46 48,43.5 48,37 C48,29 41,25 32,13 Z" stroke="#22d3ee" stroke-width="2.6" stroke-linejoin="round"/>
</svg>''';

const _bullet = '''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 44" fill="none">
<defs>
<linearGradient id="br" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#fde68a"/><stop offset="0.5" stop-color="#d97706"/><stop offset="1" stop-color="#92400e"/>
</linearGradient>
<linearGradient id="cu" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#f59e0b"/><stop offset="1" stop-color="#7c2d12"/>
</linearGradient>
</defs>
<circle cx="32" cy="22" r="14" fill="#78350f" fill-opacity="0.35" stroke="#78350f" stroke-width="1"/>
<g transform="rotate(20 32 22)">
<rect x="6" y="17" width="28" height="10" rx="2" fill="url(#br)" stroke="#78350f" stroke-width="0.9"/>
<path d="M9,17 L9,27 M13,17 L13,27" stroke="#92400e" stroke-width="0.8" opacity="0.7"/>
<path d="M34,17 L47,22 L34,27 Z" fill="url(#cu)" stroke="#7c2d12" stroke-width="0.9" stroke-linejoin="round"/>
</g>
<g transform="rotate(-20 32 22)">
<rect x="6" y="17" width="28" height="10" rx="2" fill="url(#br)" stroke="#78350f" stroke-width="0.9"/>
<path d="M9,17 L9,27 M13,17 L13,27" stroke="#92400e" stroke-width="0.8" opacity="0.7"/>
<path d="M34,17 L47,22 L34,27 Z" fill="url(#cu)" stroke="#7c2d12" stroke-width="0.9" stroke-linejoin="round"/>
</g>
</svg>''';

const _smokeBody = '''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 52" fill="none">
<ellipse cx="34" cy="42" rx="30" ry="7" fill="#18181b" stroke="#52525b" stroke-width="1.2"/>
<path d="M14,42 C14,24 21,13 34,13 C47,13 54,24 54,42" fill="#1c1c1f" stroke="#52525b" stroke-width="1.2"/>
<path d="M14,36 C20,39 48,39 54,36 L54,42 L14,42 Z" fill="#3f3f46" stroke="#52525b" stroke-width="0.8"/>
<path d="M17,34 C17,22 23,15 30,14" stroke="#a1a1aa" stroke-width="1.4" stroke-linecap="round" opacity="0.6" fill="none"/>
</svg>''';

const _smokeWisp = '''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 52" fill="none">
<path d="M58,30 C62,24 56,20 60,14 C63,9 59,6 61,2" stroke="#d4d4d8" stroke-width="2" stroke-linecap="round" fill="none"/>
</svg>''';

const _deal = '''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
<circle cx="32" cy="32" r="28" fill="#065f46" stroke="#022c22" stroke-width="2"/>
<rect x="29" y="4.5" width="6" height="9" rx="1.5" fill="#ecfdf5" transform="rotate(0 32 32)"/>
<rect x="29" y="4.5" width="6" height="9" rx="1.5" fill="#ecfdf5" transform="rotate(60 32 32)"/>
<rect x="29" y="4.5" width="6" height="9" rx="1.5" fill="#ecfdf5" transform="rotate(120 32 32)"/>
<rect x="29" y="4.5" width="6" height="9" rx="1.5" fill="#ecfdf5" transform="rotate(180 32 32)"/>
<rect x="29" y="4.5" width="6" height="9" rx="1.5" fill="#ecfdf5" transform="rotate(240 32 32)"/>
<rect x="29" y="4.5" width="6" height="9" rx="1.5" fill="#ecfdf5" transform="rotate(300 32 32)"/>
<circle cx="32" cy="32" r="17.5" fill="#047857" stroke="#fbbf24" stroke-width="1.2" stroke-dasharray="4 3"/>
<path d="M32,22 C27.5,28 24.5,30 24.5,34 C24.5,37 27.5,38.5 30,37 C29.5,39.5 28.5,41 27,42 L37,42 C35.5,41 34.5,39.5 34,37 C36.5,38.5 39.5,37 39.5,34 C39.5,30 36.5,28 32,22 Z" fill="#fbbf24"/>
</svg>''';

const _crime = '''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
<rect x="4" y="4" width="56" height="56" rx="9" fill="#131316" stroke="#3f3f46" stroke-width="1.4"/>
<circle cx="26" cy="21" r="5.5" stroke="#e4e4e7" stroke-width="1.8" stroke-dasharray="4 2.5" stroke-linecap="round"/>
<path d="M27,27 C32,29 35,32 36,37 L45,41 M36,37 C35,43 33,46 29,49 L21,55 M29,49 L37,53 M25,27 C20,30 17,34 16,39 L9,42" stroke="#e4e4e7" stroke-width="1.8" stroke-dasharray="4 2.5" stroke-linecap="round" fill="none"/>
<g transform="rotate(-16 18 12)">
<rect x="-8" y="8" width="52" height="7.5" fill="#eab308"/>
<path d="M-4,8 l-4,7.5 M6,8 l-4,7.5 M16,8 l-4,7.5 M26,8 l-4,7.5 M36,8 l-4,7.5" stroke="#111" stroke-width="2.4"/>
</g>
</svg>''';

const _champ = '''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 76 56" fill="none">
<defs>
<linearGradient id="p" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#f8fafc"/><stop offset="0.55" stop-color="#cbd5e1"/><stop offset="1" stop-color="#94a3b8"/>
</linearGradient>
</defs>
<g>
<path d="M17,48 C12,36 15,22 27,12" stroke="url(#p)" stroke-width="2" fill="none" stroke-linecap="round"/>
<ellipse cx="15" cy="44" rx="2.7" ry="5.6" fill="url(#p)" stroke="#64748b" stroke-width="0.6" transform="rotate(-50 15 44)"/>
<ellipse cx="12.5" cy="36" rx="2.7" ry="5.6" fill="url(#p)" stroke="#64748b" stroke-width="0.6" transform="rotate(-30 12.5 36)"/>
<ellipse cx="13.5" cy="27" rx="2.7" ry="5.6" fill="url(#p)" stroke="#64748b" stroke-width="0.6" transform="rotate(-12 13.5 27)"/>
<ellipse cx="17.5" cy="19" rx="2.7" ry="5.6" fill="url(#p)" stroke="#64748b" stroke-width="0.6" transform="rotate(8 17.5 19)"/>
<ellipse cx="24" cy="13" rx="2.7" ry="5.6" fill="url(#p)" stroke="#64748b" stroke-width="0.6" transform="rotate(30 24 13)"/>
</g>
<g transform="scale(-1,1) translate(-76,0)">
<path d="M17,48 C12,36 15,22 27,12" stroke="url(#p)" stroke-width="2" fill="none" stroke-linecap="round"/>
<ellipse cx="15" cy="44" rx="2.7" ry="5.6" fill="url(#p)" stroke="#64748b" stroke-width="0.6" transform="rotate(-50 15 44)"/>
<ellipse cx="12.5" cy="36" rx="2.7" ry="5.6" fill="url(#p)" stroke="#64748b" stroke-width="0.6" transform="rotate(-30 12.5 36)"/>
<ellipse cx="13.5" cy="27" rx="2.7" ry="5.6" fill="url(#p)" stroke="#64748b" stroke-width="0.6" transform="rotate(-12 13.5 27)"/>
<ellipse cx="17.5" cy="19" rx="2.7" ry="5.6" fill="url(#p)" stroke="#64748b" stroke-width="0.6" transform="rotate(8 17.5 19)"/>
<ellipse cx="24" cy="13" rx="2.7" ry="5.6" fill="url(#p)" stroke="#64748b" stroke-width="0.6" transform="rotate(30 24 13)"/>
</g>
<path d="M38,14 l3.4,7.4 8.1,0.9 -6,5.5 1.6,8 -7.1,-4 -7.1,4 1.6,-8 -6,-5.5 8.1,-0.9 Z" fill="url(#p)" stroke="#64748b" stroke-width="1" stroke-linejoin="round"/>
</svg>''';

// ══════════════════════════════════════════════════════
// العرض
// ══════════════════════════════════════════════════════

class ChipsEmblemView extends StatelessWidget {
  const ChipsEmblemView({
    super.key,
    required this.id,
    this.size = 60,
    this.animate = true,
  });

  final EmblemId id;
  final double size;
  final bool animate;

  /// العرض من `size` وفق نسبة كل شعار (المصدر يمرّر `s` للبعد الأكبر).
  Size get _box {
    final a = _aspect[id]!;
    // في المصدر: `don`/`bullet`/`smoke`/`champ` عرضها `s`، و`blood` ارتفاعها
    // `s`، و`neon`/`deal`/`crime` مربّعة.
    if (id == EmblemId.blood) return Size(size * a.w / a.h, size);
    return Size(size, size * a.h / a.w);
  }

  @override
  Widget build(BuildContext context) {
    final box = _box;
    return SizedBox(
      width: box.width,
      height: box.height,
      child: switch (id) {
        EmblemId.don => _layered(_donBody, _donSpark, _spark),
        EmblemId.blood => _layered(_bloodBody, _bloodDrop, _drop),
        EmblemId.smoke => _layered(_smokeBody, _smokeWisp, _wisp),
        EmblemId.neon => _whole(_neon, _flick),
        EmblemId.deal => _whole(_deal, _spin),
        EmblemId.bullet => _svg(_bullet),
        EmblemId.crime => _svg(_crime),
        EmblemId.champ => _svg(_champ),
      },
    );
  }

  Widget _svg(String src) => SvgPicture.string(src, fit: BoxFit.contain);

  /// جسمٌ ساكن وطبقةٌ متحرّكة فوقه بنفس `viewBox`.
  Widget _layered(String body, String overlay,
          Widget Function(Widget, double) anim) =>
      Stack(fit: StackFit.expand, children: [
        _svg(body),
        if (!animate) _svg(overlay) else FxClock(
          builder: (_, t) => anim(_svg(overlay), t),
        ),
      ]);

  /// الصورة كلّها تتحرّك.
  Widget _whole(String src, Widget Function(Widget, double) anim) => animate
      ? FxClock(builder: (_, t) => anim(_svg(src), t))
      : _svg(src);

  // ── الحركات ──
  // `emblem-spark 2.2s`: شفافية ٠٫١٥⇄١ ومقياس ٠٫٧⇄١٫١ حول مركزه
  Widget _spark(Widget child, double t) {
    final e = _pp(t / 2.2);
    return Opacity(
      opacity: 0.15 + 0.85 * e,
      // `transform-box: fill-box` ⇒ المركز مركز الشرارة نفسها (≈٦٣،١١ من ٧٢×٥٦)
      child: Transform.scale(
        scale: 0.7 + 0.4 * e,
        alignment: const Alignment(63 / 72 * 2 - 1, 11 / 56 * 2 - 1),
        child: child,
      ),
    );
  }

  // `emblem-drop 2.6s ease-in`: تسقط القطرة وتتلاشى
  Widget _drop(Widget child, double t) {
    final p = (t / 2.6) % 1.0;
    final (dy, sc, op) = switch (p) {
      < 0.3 => (0.0, 0.4 + 0.6 * (p / 0.3), p / 0.3),
      < 0.75 => (12.0 * ((p - 0.3) / 0.45), 1.0, 1 - 0.1 * ((p - 0.3) / 0.45)),
      _ => (
          12.0 + 14.0 * ((p - 0.75) / 0.25),
          1 - 0.1 * ((p - 0.75) / 0.25),
          0.9 * (1 - (p - 0.75) / 0.25)
        ),
    };
    // الإزاحة بوحدات viewBox ⇒ تُقاس بنسبة الارتفاع الفعليّ
    final k = _box.height / 76;
    return Opacity(
      opacity: op.clamp(0.0, 1.0),
      child: Transform.translate(
        offset: Offset(0, dy * k),
        child: Transform.scale(scale: sc, child: child),
      ),
    );
  }

  // `emblem-wisp 3.5s`: شفافية ٠٫٢٥⇄٠٫٦٥ وارتفاع ٠⇄−٣
  Widget _wisp(Widget child, double t) {
    final e = _pp(t / 3.5);
    final k = _box.height / 52;
    return Opacity(
      opacity: 0.25 + 0.4 * e,
      child: Transform.translate(offset: Offset(0, -3 * e * k), child: child),
    );
  }

  // `emblem-spin 14s linear` حول (٣٢،٣٢) أي مركز الصورة
  Widget _spin(Widget child, double t) => Transform.rotate(
        angle: ((t / 14) % 1.0) * 2 * math.pi,
        child: child,
      );

  /// `emblem-flick 4.2s steps(1, end)` — القيمة تثبت داخل كل فترة.
  ///
  /// 📌 المفاتيح: ٠٪←١ · ٤٢٪←١ · ٤٤٪←٠٫٢٥ · ٤٦٪←١ · ٤٨٪←٠٫٢٥ · ١٠٠٪←١.
  ///    فيبقى خافتاً من ٤٨٪ إلى ١٠٠٪ — نصف الدورة تقريباً. منقولٌ كما هو.
  Widget _flick(Widget child, double t) {
    final p = (t / 4.2) % 1.0;
    final o = p < 0.44 ? 1.0 : (p < 0.46 ? 0.25 : (p < 0.48 ? 1.0 : 0.25));
    return Opacity(opacity: o, child: child);
  }

  static double _pp(double x) {
    final p = x % 1.0;
    final tri = p < 0.5 ? p * 2 : (1 - p) * 2;
    return tri * tri * (3 - 2 * tri);
  }
}
