'use client';

import React from 'react';

// ══════════════════════════════════════════════════════
// 🛡️ حدّ خطأ لطبقة تأثيرات البطاقة
//
// طبقة التأثيرات زخرفية بالكامل — لا تحمل أي معلومة لعب. فإن انهار شيء
// داخلها (شكل SVG غير متوقّع، شعار مفقود، تعديل مستقبلي) يجب أن تختفي
// **هي وحدها** وتبقى البطاقة تعمل.
//
// ⚠️ لماذا هذا مهمّ هنا تحديداً: كل بطاقات شاشة القاعة تُرسم في شجرة واحدة،
//    فاستثناء غير ملتقَط في بطاقة واحدة كان يُبيّض الشاشة كلها في منتصف
//    الفعالية — وطبقة زخرفية لا يجوز أن تملك هذه القدرة.
//
// لا نستعمل مكتبة: حدود الخطأ في React تتطلّب مكوّن صنف، وهذا أصغر شكل صحيح.
// ══════════════════════════════════════════════════════

interface Props { children: React.ReactNode }
interface State { failed: boolean }

export class CardFxBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // تحذير مرة واحدة لكل مثيل — لا نُغرق الطرفية على شاشة فيها ٢٧ بطاقة
    console.warn('🎴 تعطّلت طبقة تأثيرات البطاقة — عُرضت البطاقة بلا زخرفة:', error?.message);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children as React.ReactElement;
  }
}

export default CardFxBoundary;
