import 'package:flutter/material.dart';

// ══════════════════════════════════════════════════════
// 🧭 تعريفات تبويبات التنقّل — §4.6 في الملفّ 11
// ══════════════════════════════════════════════════════
// خمسة تبويبات، أوسطها زرّ مرفوع. الترتيب في المصفوفة هو ترتيب الويب،
// وRTL يقلبه تلقائياً فيبدأ من اليمين — لا تعكس المصفوفة يدوياً.
//
// 🪦 كان هنا `MafiaBottomNav` — الشريط الكلاسيكيّ المعتم بعرض الشاشة.
//    تقاعد بقرار المالك (95 §4-ق4: شريطان بهندستين = هوية مشطورة) بعد
//    أن صارت الكبسولة الزجاجيّة للمنصّتين بدرجات مادّةٍ تشمل تعبئةً
//    صلبة للأجهزة الضعيفة (liquid_glass_nav.dart). دروسه المقيسة
//    (heightFactor مع قيود الـScaffold الفضفاضة، حجز ارتفاع الزرّ
//    المرتفع خارج الصفّ) منقولة إلى الكبسولة وتعليقاتها.

class NavTab {
  const NavTab(this.label, this.icon);
  final String label;
  final IconData icon;
}

const navTabs = <NavTab>[
  NavTab('الرئيسية', Icons.home_outlined),
  NavTab('الألعاب', Icons.sports_esports_outlined),
  NavTab('ادخل', Icons.verified_user_outlined), // الزرّ المركزيّ
  NavTab('التصنيف', Icons.star_outline),
  NavTab('حسابي', Icons.person_outline),
];

const int kCenterTab = 2;
